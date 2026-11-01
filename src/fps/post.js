// The picture after the world is drawn, under WebGPU (main.js loads this only then; WebGL keeps
// three's EffectComposer): the world and then the arms drawn into one multisampled buffer, bloom,
// and one last pass that does the rest at once: contrast-adaptive sharpening, tone mapping, the
// flash, the vignette, the hurt red and the contrast curve (the WebGL grade's, step for step).
//
// It answers to what main.js asks of the WebGL composer: render(), setSize(), readBuffer (the
// buffer the world is drawn into, to compile against), worldPass / vmPass (.scene, .camera,
// .enabled), bloom.setSize() and grade.uniforms.
import * as THREE from 'three';
import { bloom as bloomNode } from 'three/addons/tsl/display/BloomNode.js';

const T = THREE.TSL;

/** The world's pass, with the arms drawn after it into the same buffer, depth cleared between (as
 * the WebGL composer's vmPass: clear false, clearDepth true). */
class WorldPass extends THREE.PassNode {
  constructor(scene, camera, samples) {
    super(THREE.PassNode.COLOR, scene, camera, { samples, type: THREE.HalfFloatType });
    this.renderTarget.samples = samples;
    this.vm = { scene: null, camera: null, enabled: true, clear: false, clearDepth: true };
  }

  updateBefore(frame) {
    super.updateBefore(frame);
    const vm = this.vm;
    if (!vm.enabled || !vm.scene || !vm.camera) return;
    const r = frame.renderer;
    const was = r.getRenderTarget(), mrt = r.getMRT();
    const ac = r.autoClear, acc = r.autoClearColor, acd = r.autoClearDepth, acs = r.autoClearStencil;
    r.setRenderTarget(this.renderTarget);
    r.setMRT(this._mrt);
    r.autoClear = true; r.autoClearColor = false; r.autoClearDepth = true; r.autoClearStencil = false;
    r.render(vm.scene, vm.camera);
    r.autoClear = ac; r.autoClearColor = acc; r.autoClearDepth = acd; r.autoClearStencil = acs;
    r.setRenderTarget(was);
    r.setMRT(mrt);
  }
}

/** The composer: `samples` for the world's buffer, `bloom` on or off, `touch` (bloom at quarter size). */
export function makeComposer(renderer, scene, camera, { samples = 4, bloom = true, touch = false } = {}) {
  const { Fn, uniform, uv, vec2, vec3, vec4, float, min, max, sqrt, clamp, mix, smoothstep, distance, dot, renderOutput } = T;
  const world = new WorldPass(scene, camera, samples);
  const color = world.getTextureNode('output');
  // UnrealBloomPass(…, 0.6, 0.55, 0.92) as the WebGL composer has it; its mips start at half size
  // (a phone's at a quarter)
  const glow = bloom ? bloomNode(color, 0.6, 0.55, 0.92) : null;
  if (glow && touch) glow.setResolutionScale(0.25);
  const grade = {
    uniforms: { flash: uniform(new THREE.Color()), flashAmt: uniform(0), hurt: uniform(0), texel: uniform(new THREE.Vector2(1, 1)), sharpen: uniform(0.45) },
  };
  const g = grade.uniforms;

  const out = Fn(() => {
    const p = uv();
    const add = glow ? glow.getTextureNode().sample(p).rgb : vec3(0);
    // (each tap tone-mapped as the WebGL grade saw it: after OutputPass)
    const tap = (o) => clamp(renderOutput(vec4(color.sample(o ? p.add(o) : p).rgb.add(add), 1.0), THREE.NeutralToneMapping, THREE.SRGBColorSpace).rgb, 0.0, 1.0);
    const c0 = tap(null).toVar();
    const n = tap(vec2(0, g.texel.y)), s = tap(vec2(0, g.texel.y.negate()));
    const e = tap(vec2(g.texel.x, 0)), w = tap(vec2(g.texel.x.negate(), 0));
    // contrast-adaptive sharpening (after AMD's CAS): crisper detail with no halos on hard edges
    const mn = min(c0, min(min(n, s), min(e, w))), mx = max(c0, max(max(n, s), max(e, w)));
    const amp = sqrt(clamp(min(mn, vec3(1.0).sub(mx)).div(max(mx, vec3(1e-4))), 0.0, 1.0));
    const k = amp.negate().mul(0.2).mul(g.sharpen);
    const c = clamp(c0.add(n.add(s).add(e).add(w).mul(k)).div(k.mul(4.0).add(1.0)), 0.0, 1.0).toVar();
    c.addAssign(g.flash.mul(g.flashAmt).mul(c.mul(0.4).add(0.6)));
    const d = distance(p, vec2(0.5));
    c.mulAssign(mix(1.0, smoothstep(0.95, 0.3, d), 0.45));                       // vignette
    c.assign(mix(c, c.mul(c).mul(c.mul(-2.0).add(3.0)), 0.18));                   // a touch more contrast in the mids
    c.assign(mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))).mul(vec3(1.2, 0.5, 0.45)), g.hurt.mul(smoothstep(0.2, 0.7, d))));
    return vec4(c, 1.0);
  })();

  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;   // (tone mapped and made sRGB above)
  pipeline.outputNode = out;

  const composer = {
    isWebGPUComposer: true,
    pipeline, world, grade, glow,
    worldPass: world,
    vmPass: world.vm,
    /** The buffer the world is drawn into (what shaders are compiled against). */
    get readBuffer() { return world.renderTarget; },
    /** A small buffer made as the world's is (format, depth, samples): pipelines made drawing into it
     * are the world's own. */
    warmTarget(w = 256, h = 144) {
      const rt = new THREE.RenderTarget(w, h, { type: THREE.HalfFloatType, samples });
      rt.depthTexture = new THREE.DepthTexture(w, h);
      return rt;
    },
    render() { pipeline.render(); },
    setSize() { /* (the passes follow the canvas: renderer.setSize) */ },
    setPixelRatio() {},
    bloom: { setSize() {}, get enabled() { return !!glow; } },
  };
  composer.composer = composer;   // (main.js takes { composer, worldPass, vmPass, bloom, grade } from it)
  return composer;
}
