// The sun's (and moon's) shadows under WebGPU, in two maps instead of one redrawn whole every frame:
//
//  - the built world's (houses, walls, the cathedral, terrain: whatever never moves): a 4096 map over
//    176 m, kept, and drawn again only when you've walked a way from where it was centred or the sun
//    has turned enough to move a shadow by a texel or so. Then it's drawn an eighth of its casters a
//    frame into a second map, out of sight, and swapped in whole once done, so no frame pays for it;
//  - everything else (people, the dead, doors, loot, spells, broken things): a 2048 map over 56 m about
//    you, drawn every frame, half again as sharp as the old single map.
//
// The light takes the darker of the two. At the plaza that's ~250 shadow draws a frame instead of ~840.
// main.js: installSunShadows(sun, renderer, { isStatic }) once the world is built; invalidate() when a
// static caster changes shape (a crate broken: props.onChange).
import * as THREE from 'three';
import { withoutBundles } from './cells.js';

const T = THREE.TSL;
const CHUNKS = 8;

/** Softer shadow edges than three's own PCF (five taps): sixteen on a Vogel disk turned per pixel, each
 * one the GPU's own filtered depth comparison, so a penumbra is smooth, not speckled. The disk is
 * `shadow.radius` texels across. */
const softPCF = T.Fn(({ depthTexture, shadowCoord, shadow }) => {
  const { reference, renderGroup, vec2, float, texture, vogelDiskSample, interleavedGradientNoise, screenCoordinate, PI2 } = T;
  const mapSize = reference('mapSize', 'vec2', shadow).setGroup(renderGroup);
  const radius = reference('radius', 'float', shadow).setGroup(renderGroup);
  const r = vec2(1).div(mapSize).mul(radius);
  const phi = interleavedGradientNoise(screenCoordinate.xy).mul(PI2);
  let sum = float(0);
  for (let i = 0; i < 16; i++) sum = sum.add(texture(depthTexture, shadowCoord.xy.add(vogelDiskSample(i, 16, phi).mul(r))).compare(shadowCoord.z));
  return sum.mul(1 / 16);
});

/** The shadow of the never-moving world: kept, redrawn in slices into a back map, then swapped in. */
class StaticShadow extends THREE.ShadowNode {
  constructor(light, shadow, isStatic) {
    super(light, shadow);
    this.isStatic = isStatic;
    this.back = null;                 // (the map being drawn, slice by slice)
    this.pending = shadow.clone();    // (the camera it's being drawn from)
    this.chunk = -1;                  // (the slice to draw next; -1: none under way)
    this.center = new THREE.Vector3(1e9, 0, 0);
    this.dir = new THREE.Vector3();
    this.stale = true;
    this.full = true;                 // (the next redraw all at once: the first, a jump elsewhere)
    this.drift = 14; this.turn = Math.cos(THREE.MathUtils.degToRad(0.18));
    this.refreshes = 0;
  }

  // (depth as 32-bit float: a map that can be copied whole into another)
  setupRenderTarget(shadow, builder) {
    const r = super.setupRenderTarget(shadow, builder);
    r.depthTexture.type = THREE.FloatType;
    return r;
  }

  /** Whether the map should be drawn again: moved off centre, or the sun turned, or told to. */
  wanted(light) {
    if (this.stale) return true;
    const t = light.target.getWorldPosition(_v);
    const dx = t.x - this.center.x, dz = t.z - this.center.z;
    if (dx * dx + dz * dz > this.drift * this.drift) return true;
    _d.subVectors(light.getWorldPosition(_w), t).normalize();
    return _d.dot(this.dir) < this.turn;
  }

  /** Draw slice `k` (all of them at once when k is null) of the static casters into the back map,
   * from the pending camera (fixed for the whole redraw). */
  drawSlice(frame, k) {
    const { renderer, scene } = frame;
    const map = this.shadowMap, size = this.shadow.mapSize;
    if (!this.back) {
      this.back = new THREE.RenderTarget(size.width, size.height, { depthBuffer: true });
      this.back.texture.type = this.shadow.mapType;
      const d = new THREE.DepthTexture(size.width, size.height);
      d.type = THREE.FloatType; d.compareFunction = map.depthTexture.compareFunction;
      d.minFilter = d.magFilter = map.depthTexture.minFilter;
      d.isRenderTargetTexture = true;
      this.back.depthTexture = d;
    }
    const was = renderer.getRenderObjectFunction();
    _state = THREE.RendererUtils.resetRendererAndSceneState(renderer, scene, _state);
    scene.overrideMaterial = this.getShadowMaterial();
    const base = this.getShadowRenderObjectFunction(renderer, this.pending), isStatic = this.isStatic;
    renderer.setRenderObjectFunction(k === null
      ? (o, ...a) => { if (isStatic(o)) base(o, ...a); }
      : (o, ...a) => { if (isStatic(o) && o.id % CHUNKS === k) base(o, ...a); });
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.back);
    renderer.autoClear = k === null || k === 0;
    const mwa = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    withoutBundles(() => renderer.render(scene, this.pending.camera));   // (its casters are filtered slice by slice: cells.js)
    scene.matrixWorldAutoUpdate = mwa;
    renderer.setRenderObjectFunction(was);
    THREE.RendererUtils.restoreRendererAndSceneState(renderer, scene, _state);
  }

  /** The back map becomes the one the world is lit by, with its camera. */
  swap(renderer) {
    renderer.copyTextureToTexture(this.back.depthTexture, this.shadowMap.depthTexture);
    const s = this.shadow, p = this.pending;
    s.camera.position.copy(p.camera.position); s.camera.quaternion.copy(p.camera.quaternion);
    s.camera.matrixWorld.copy(p.camera.matrixWorld); s.camera.matrixWorldInverse.copy(p.camera.matrixWorldInverse);
    s.camera.projectionMatrix.copy(p.camera.projectionMatrix); s.camera.projectionMatrixInverse.copy(p.camera.projectionMatrixInverse);
    s.matrix.copy(p.matrix);
    this.refreshes++;
  }

  updateBefore(frame) {
    if (frame.renderer._precompilationState !== null) return;
    const { light, shadow } = this;
    if (!this.shadowMap) return;   // (not set up yet)
    if (this._seen === frame.frameId) return;
    this._seen = frame.frameId;
    // (autoUpdate off: a phone's, whose game asks for a frame of it every other frame by needsUpdate)
    if (!shadow.autoUpdate && !shadow.needsUpdate) return;
    shadow.needsUpdate = false;
    // a long way from where it was drawn (a portal, a loaded game): drawn all at once, not over 8 frames
    const t = light.target.getWorldPosition(_v);
    if (Math.hypot(t.x - this.center.x, t.z - this.center.z) > this.drift * 3) this.full = true;
    const force = this.full;
    if (this.chunk < 0 && !force && !this.wanted(light)) return;
    if (this.chunk < 0 || force) {
      // a fresh redraw: its camera fixed now, where the light is now
      const p = this.pending;
      p.camera.left = shadow.camera.left; p.camera.right = shadow.camera.right; p.camera.top = shadow.camera.top; p.camera.bottom = shadow.camera.bottom;
      p.camera.near = shadow.camera.near; p.camera.far = shadow.camera.far;
      p.camera.coordinateSystem = shadow.camera.coordinateSystem; p.camera._reversedDepth = shadow.camera._reversedDepth;
      p.camera.updateProjectionMatrix();
      p.updateMatrices(light);
      light.target.getWorldPosition(this.center);
      this.dir.subVectors(light.getWorldPosition(_w), this.center).normalize();
      this.stale = false; this.full = false;
      this.chunk = 0;
    }
    if (force) {   // (asked outright: the warm-up, a jump to somewhere else; all of it now)
      this.drawSlice(frame, null);
      this.chunk = -1;
      this.swap(frame.renderer);
      return;
    }
    this.drawSlice(frame, this.chunk);
    if (++this.chunk >= CHUNKS) { this.chunk = -1; this.swap(frame.renderer); }
  }
}

/** The moving things' shadow: three's own, but only of what isn't static, from a light of its own (a
 * stand-in sharing the sun's direction, centred on you). */
class DynamicShadow extends THREE.ShadowNode {
  constructor(light, shadow, isStatic) { super(light, shadow); this.isStatic = isStatic; }
  getShadowRenderObjectFunction(renderer, shadow) {
    const base = super.getShadowRenderObjectFunction(renderer, shadow), isStatic = this.isStatic;
    return (o, ...a) => { if (!isStatic(o)) base(o, ...a); };
  }
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
let _state;   // (undefined: three makes a fresh one the first time)

/** Give `sun` the two maps. `isStatic(object)`: whether a caster never moves. Returns { update(),
 * invalidate(), stats() }: update() each frame after the sun is placed (it places the stand-in). */
export function installSunShadows(sun, { isStatic, staticSize = 4096, staticBox = 176, dynSize = 2048, dynBox = 56 } = {}) {
  const S = sun.shadow;
  S.mapSize.set(staticSize, staticSize);
  const c = S.camera;
  c.left = c.bottom = -staticBox / 2; c.right = c.top = staticBox / 2;
  c.updateProjectionMatrix();
  S.filterNode = softPCF; S.radius = 2.2;
  const stat = new StaticShadow(sun, S, isStatic);
  // the stand-in light: the sun's direction, its own shadow map, its own matrices
  const proxy = new THREE.DirectionalLight(0xffffff, 0);
  proxy.castShadow = true;
  proxy.shadow.mapSize.set(dynSize, dynSize);
  const pc = proxy.shadow.camera;
  pc.left = pc.bottom = -dynBox / 2; pc.right = pc.top = dynBox / 2; pc.near = S.camera.near; pc.far = S.camera.far;
  proxy.shadow.bias = S.bias; proxy.shadow.normalBias = S.normalBias; proxy.shadow.radius = 2.6;
  proxy.shadow.filterNode = softPCF;
  pc.updateProjectionMatrix();
  const dyn = new DynamicShadow(proxy, proxy.shadow, isStatic);
  S.shadowNode = T.min(stat, dyn);
  const tx = dynBox / dynSize, _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), _c = new THREE.Vector3();
  return {
    stat, dyn, proxy,
    /** The stand-in follows the sun's target (you), its centre held to its own texels (no shimmer). */
    update() {
      sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
      const ld = _d.subVectors(sun.getWorldPosition(_w), sun.target.getWorldPosition(_v)).normalize();
      _lx.crossVectors(UP, ld).normalize(); _ly.crossVectors(ld, _lx);
      _c.copy(_v);
      const px = _c.dot(_lx), py = _c.dot(_ly);
      _c.addScaledVector(_lx, Math.round(px / tx) * tx - px).addScaledVector(_ly, Math.round(py / tx) * tx - py);
      proxy.target.position.copy(_c); proxy.position.copy(_c).addScaledVector(ld, 300);
      proxy.updateMatrixWorld(); proxy.target.updateMatrixWorld();
      proxy.shadow.autoUpdate = S.autoUpdate;
      proxy.shadow.needsUpdate = S.needsUpdate || proxy.shadow.needsUpdate;
    },
    /** The static map drawn again (`now`: all at once, next frame: the warm-up). */
    invalidate(now = false) { stat.stale = true; if (now) stat.full = true; },
    stats() { return { refreshes: stat.refreshes, chunk: stat.chunk }; },
  };
}
