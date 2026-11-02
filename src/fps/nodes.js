// The WebGPU side of the engine's shaders, in TSL (three's node shading language): what engine.js
// does in GLSL for WebGL, built as node graphs that three compiles to WGSL. Everything here is
// made only when the game runs under WebGPU (index.html picks the renderer before any module loads;
// under WebGL `three` is r170's classic build and none of this is touched).
//
// For a module's own materials: `if (WEBGPU) { ...TSL... } else { ...GLSL as before... }`, with TSL's
// functions from `T` (THREE.TSL). Some rules that keep WGSL happy and the two paths alike:
//  - Texture reads inside a branch (If) or after one that may differ from pixel to pixel must give
//    their own gradients (.grad(dx, dy)) or level (.level(n)): WGSL only allows implicit-derivative
//    sampling in uniform control flow. Work the gradients out first, outside any branch.
//  - A uniform the game changes through `{ value }` objects: use T.uniform(v) itself as that object
//    (a UniformNode has .value), so the game's own code keeps working on it.
//  - pow() of something that can go negative: clamp first (bloom turns NaN into black boxes).
//
// And the two that decide how fast it loads and whether it's right:
//  - ONE GRAPH PER KIND, SHARED. A node's cache key is its own id, so a graph made afresh for each
//    material is a shader (and a pipeline, compiled before play) for each material. Make each
//    kind's graph once (a module-level cache keyed by whatever changes the code) and give it to
//    every material of that kind; what differs between them comes from the material being drawn:
//    T.materialReference('userData.tile', 'float') (a dotted path into the material), or a texture
//    that follows it: shared(...) below.
//  - A classic material (MeshPhongMaterial and the like) given nodes keeps a cache key that doesn't
//    see them: two of its kind with different graphs would share one shader. Prefer the node
//    material (MeshPhongNodeMaterial, ...); a classic one that must stay so (others hold it) gets
//    keyed(m, 'kind') so its key names its graph.
import * as THREE from 'three';

const store = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
/** 'crisp' (square texels, anti-aliased) or 'smooth' (plain bilinear). */
export const TEXELS = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('texels')) === 'smooth' || store('bm.texels', 'crisp') === 'smooth' ? 'smooth' : 'crisp';   // (?texels=smooth: a test)
/** Whether this run draws with WebGPU (three r187's WebGPURenderer). */
export const WEBGPU = typeof window !== 'undefined' && window.BM_RENDERER === 'webgpu' && !!THREE.WebGPURenderer;
/** TSL's functions (THREE.TSL), or null under WebGL. */
export const T = WEBGPU ? THREE.TSL : null;

// ------------------------------------------------------------------ crisp texels, anti-aliased
/** sharpGrad(tex, uv, dx, dy): a texel-crisp sample whose texel seams are one screen pixel of blend
 * (engine.js sharpTexelGrad). `tex`: a Texture or a texture node. With the uv's screen gradients
 * given, it's safe inside a branch. */
export function sharpGrad(tex, uv, dx, dy) {
  const { texture, textureSize, vec2, abs, max, floor, clamp, mix, smoothstep } = T;
  const node = tex.isNode ? tex : texture(tex);
  if (TEXELS !== 'crisp') return node.sample(uv).grad(dx, dy);
  const size = vec2(textureSize(node, 0));
  const p = uv.mul(size);
  const w = max(abs(dx).add(abs(dy)).mul(size), vec2(1e-5));
  const seam = floor(p.add(0.5));
  const q = seam.add(clamp(p.sub(seam).div(w), -0.5, 0.5));
  // magnified: square texels with a pixel of blend at each seam; minified: plain filtering
  const r = mix(q, p, smoothstep(0.7, 1.4, max(w.x, w.y)));
  return node.sample(r.div(size)).grad(dx, dy);
}

/** A crisp sample with the gradients worked out here (not inside a branch). */
export function sharp(tex, uv) {
  return sharpGrad(tex, uv, T.dFdx(uv), T.dFdy(uv));
}

/** A tiling texture with its repeat hidden (engine.js untiled): a second copy, turned a quarter (or,
 * with a grain, mirrored along it) and shifted half a tile, laid over the first in patches where k
 * (0..1, a slow noise) says; the lighter of the two wins texel by texel. */
export function untiled(tex, uv, dx, dy, k, grain = false) {
  const { Fn, If, vec2, vec3, vec4, float, dot, mix, smoothstep, select } = T;
  const uv2 = grain ? vec2(uv.x, float(0.5).sub(uv.y)) : vec2(uv.y.negate(), uv.x).add(0.5);
  const dx2 = grain ? vec2(dx.x, dx.y.negate()) : vec2(dx.y.negate(), dx.x);
  const dy2 = grain ? vec2(dy.x, dy.y.negate()) : vec2(dy.y.negate(), dy.x);
  return Fn(() => {
    const out = vec4(0).toVar();
    If(k.lessThan(0.999), () => { out.assign(sharpGrad(tex, uv, dx, dy)); });
    If(k.greaterThan(0.001), () => {
      const b = sharpGrad(tex, uv2, dx2, dy2).toVar();
      const h = k.sub(0.5).mul(3.0).add(dot(b.rgb.sub(out.rgb), vec3(0.333)).mul(4.0));
      out.assign(select(k.greaterThanEqual(0.999), b, mix(out, b, smoothstep(-0.35, 0.35, h))));
    });
    return out;
  })();
}

/** The patches untiled's k comes from: value noise on a turned, warped domain (engine.js untileMask). */
export function untileMask(p, seed = 0) {
  const { vec2, vec4, mat2, floor, fract, sin, dot, mix, smoothstep } = T;
  const s = typeof seed === 'number' ? T.float(seed) : seed;
  const q0 = mat2(0.8, -0.6, 0.6, 0.8).mul(p).mul(0.11).add(s);
  const q = vec2(q0.x.add(sin(q0.y.mul(1.7).add(s)).mul(0.6)), q0.y);
  const i = floor(q), f0 = fract(q), f = f0.mul(f0).mul(f0.mul(-2.0).add(3.0));
  const K = vec2(127.1, 311.7);
  const h = fract(sin(vec4(dot(i, K), dot(i.add(vec2(1, 0)), K), dot(i.add(vec2(0, 1)), K), dot(i.add(vec2(1, 1)), K))).mul(43758.5453));
  return smoothstep(0.35, 0.65, mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y));
}

// ------------------------------------------------------------------ noise
/** Dave Hoskins' hash (vec2 -> 0..1), as the GLSL fHash/bmMistHash. */
export function hash12(p) {
  const { vec3, fract, dot } = T;
  const q0 = fract(vec3(p.x, p.y, p.x).mul(0.1031));
  const q = q0.add(dot(q0, q0.yzx.add(33.33)));
  return fract(q.x.add(q.y).mul(q.z));
}
/** Smooth value noise over hash12 (fNoise / bmMistNoise). */
export function vnoise(p) {
  const { vec2, floor, fract, mix } = T;
  const i = floor(p), u0 = fract(p), u = u0.mul(u0).mul(u0.mul(-2.0).add(3.0));
  return mix(mix(hash12(i), hash12(i.add(vec2(1, 0))), u.x), mix(hash12(i.add(vec2(0, 1))), hash12(i.add(vec2(1, 1))), u.x), u.y);
}
/** The sin-hash value noise (gHash/gNoise in lib.js's ground). */
export function snoise(p) {
  const { vec2, floor, fract, mix, sin, dot } = T;
  const H = (v) => fract(sin(dot(v, vec2(127.1, 311.7))).mul(43758.5453));
  const i = floor(p), f0 = fract(p), f = f0.mul(f0).mul(f0.mul(-2.0).add(3.0));
  return mix(mix(H(i), H(i.add(vec2(1, 0))), f.x), mix(H(i.add(vec2(0, 1))), H(i.add(vec2(1, 1))), f.x), f.y);
}

// ------------------------------------------------------------------ how often three refreshes a draw
// three refreshes every draw of a material with any node of its own (its uniforms worked out and
// written again) each frame, in case a node's value moved. A graph whose only inputs are the drawn
// material's own properties (ref, shared) needs that only when the draw is first made or the
// material changes (which three notices by itself), so it's marked settled() and three treats its
// material as it treats a plain one; with `object.static` set (the built world: main.js), its draws
// then cost almost nothing to repeat. Uniforms that change by themselves (time, the sun, a glow the
// game sets) must therefore be shared ones: .setGroup(T.renderGroup), updated once a render for all.
/** Mark a node graph settled (see above). Returns it. */
export function settled(node) { node.bmSettled = true; return node; }
if (WEBGPU && THREE.NodeMaterialObserver) {
  THREE.NodeMaterialObserver.prototype.containsNode = function (builder) {
    const material = builder.material;
    for (const property in material) { const v = material[property]; if (v && v.isNode && !v.bmSettled) return true; }
    const c = builder.context;
    return !!(c.modelViewMatrix || c.modelNormalViewMatrix || c.getAO || c.getShadow || c.getGI);
  };
}

// ------------------------------------------------------------------ materials
/** Name a classic material's graph in its cache key (see the rules at the top). */
export function keyed(m, kind) {
  const prev = m.customProgramCacheKey?.bind(m);
  if (m.userData.keyedAs?.includes(kind)) return m;
  m.userData.keyedAs = (m.userData.keyedAs || '') + '|' + kind;
  m.customProgramCacheKey = () => (prev ? prev() : '') + '|' + kind;
  m.needsUpdate = true;
  return m;
}

/** The material a draw is for. In a shadow pass three draws its own depth material in place of the
 * object's, but with the object's colorNode (its alpha) and positionNode in it: a reference there to
 * "the material being drawn" finds three's depth material (no colour, no map: the frame throws). This
 * finds the object's own material then. */
export const sourceOf = (frame) => frame.renderer?._currentSourceMaterial ?? frame.material;

/** A uniform holding `path` (dotted: 'userData.tile') of the material each draw is for (sourceOf): as
 * T.materialReference, but right in shadow passes too. `type`: 'float', 'vec2', 'vec3', 'vec4',
 * 'color'; `fallback` when the material has none. */
export function ref(path, type, fallback) {
  const parts = path.split('.');
  const init = fallback ?? (type === 'color' ? new THREE.Color(1, 1, 1) : type === 'vec2' ? new THREE.Vector2()
    : type === 'vec3' ? new THREE.Vector3() : type === 'vec4' ? new THREE.Vector4() : 0);
  const u = T.uniform(init, type);
  u.onObjectUpdate((f) => { let v = sourceOf(f); for (const k of parts) v = v?.[k]; return v ?? init; });
  return u;
}

/** A texture node one graph shares between materials, its picture each drawn material's own: `pick`
 * (material, object) => Texture, the material being sourceOf's (so a shadow pass still finds it). `like`: a texture of the kind it will hold (colour space, type,
 * filtering: these shape the shader, so they must be the same for every material it serves). Use
 * the node's .sample(uv)/.grad()/.level() as any texture node's; those all follow it. */
export function shared(pick, like) {
  // (a placeholder of its own: two shared textures in one graph must not be taken for one binding)
  const d = new THREE.Texture();
  d.colorSpace = like.colorSpace; d.type = like.type; d.minFilter = like.minFilter; d.magFilter = like.magFilter;
  d.wrapS = like.wrapS; d.wrapT = like.wrapT;
  const upd = (f) => pick(sourceOf(f), f.object) || undefined;
  // every sample made from it (.sample, .grad, .level are clones of it) follows the material too: it
  // may be one of those, not this node, that ends up in the graph
  const arm = (n) => { n.onObjectUpdate(upd); const clone = n.clone.bind(n); n.clone = () => arm(clone()); return n; };
  return arm(T.texture(d));
}

const _crisp = new Map();
/** A material's map sampled crisp (engine.js crisp(): SHARP_MAP), as its colour node: its map times
 * its colour, one graph for every such material (per colour space). Leaves alone a material with a
 * colour node of its own, a map not on the first UV channel, or one moved or scaled by its matrix. */
export function crispColor(m) {
  const map = m.map;
  if (!map || m.colorNode || map.channel !== 0) return;
  map.updateMatrix();
  if (!map.matrix.equals(_identity)) return;
  const srgb = map.colorSpace === THREE.SRGBColorSpace, k = srgb ? 'srgb' : 'linear';
  let g = _crisp.get(k);
  if (!g) {
    const base = shared((mat) => mat.map, map);
    const u = T.uv();
    const s = sharpGrad(base, u, T.dFdx(u), T.dFdy(u));
    g = settled(s.mul(ref('color', 'color')));
    _crisp.set(k, g);
  }
  m.colorNode = g;
  m.userData.sharp = true;
  if (!m.isNodeMaterial) keyed(m, 'crisp-' + k);
  m.needsUpdate = true;
}
const _identity = new THREE.Matrix3();

// ------------------------------------------------------------------ fog
/** The sky's light as the air and the picture see it, set each frame by main.js light(): where the
 * sun (or the moon) is, its colour, and how much it glows in the haze (none below ground). The fog's
 * glow toward it and the god rays (post.js) both go by these. */
export const SKY = WEBGPU ? {
  dir: T.uniform(new THREE.Vector3(0, 1, 0)).setGroup(T.renderGroup),
  color: T.uniform(new THREE.Color(1, 0.9, 0.7)).setGroup(T.renderGroup),
  glow: T.uniform(0).setGroup(T.renderGroup),
} : null;

/** The world's fog as a node (scene.fogNode): three's range fog on scene.fog (its colour, near and
 * far follow the day as before), and, where `mist` gives a box, the graveyard's ground mist
 * (engine.js groundMist): a height fog along the eye's ray, thick on the ground, broken by noise. */
export function fogNode(fog, mist = null) {
  const { Fn, reference, positionWorld, positionView, cameraPosition, vec2, vec3, vec4, float, smoothstep, step, min, max, abs, exp, clamp, length, normalize, mix, select, output, If } = T;
  // (shared: the fog moves with the day, and a static draw isn't refreshed by itself)
  const color = reference('color', 'color', fog).setGroup(T.renderGroup), near = reference('near', 'float', fog).setGroup(T.renderGroup),
    far = reference('far', 'float', fog).setGroup(T.renderGroup);
  return Fn(() => {
    const c = output.rgb.toVar();
    const k = smoothstep(near, far, positionView.z.negate());
    // the air lit by the sun (or moon) it's looked through toward: haze in that quarter of the sky
    // glows its colour, warm at golden hour, silver under the moon (SKY: main.js light())
    const toward = clamp(T.dot(normalize(positionWorld.sub(cameraPosition)), SKY.dir), 0.0, 1.0);
    const glow = toward.mul(toward).mul(toward).mul(toward).mul(toward).mul(toward).mul(0.75).add(toward.mul(0.12)).mul(SKY.glow);
    c.assign(mix(c, mix(color, SKY.color, clamp(glow, 0.0, 0.85)), k));
    if (mist) {
      const { box: [x0, z0, x1, z1], density, falloff, edge } = mist;
      const mq = positionWorld.xz;
      const me = min(mq.sub(vec2(x0, z0)), vec2(x1, z1).sub(mq));
      const inside = smoothstep(0.0, edge, min(me.x, me.y)).mul(step(-1.5, positionWorld.y)).mul(step(-1.5, cameraPosition.y));
      If(inside.greaterThan(0.0), () => {
        const rd0 = positionWorld.sub(cameraPosition);
        const dist = min(length(rd0), 70.0);
        const rd = normalize(rd0);
        const ry = select(abs(rd.y).lessThan(1e-3), select(rd.y.lessThan(0.0), float(-1e-3), float(1e-3)), rd.y);
        const a = float(density).mul(vnoise(mq.mul(0.09)).mul(1.1).add(0.45)).mul(vnoise(mq.mul(0.31).add(7.0)).mul(0.6).add(0.7));
        const b = float(falloff);
        // (the exponents held in range, as the GLSL: an overflow here is a black box after the bloom)
        const m = a.div(b).mul(exp(clamp(cameraPosition.y, 0.0, 20.0).mul(b).negate())).mul(exp(min(dist.mul(ry).mul(b).negate(), 8.0)).oneMinus()).div(ry);
        c.assign(mix(c, color.mul(1.12), clamp(m, 0.0, 0.8).mul(inside)));
      });
    }
    return vec4(c, output.a);
  })();
}

// ------------------------------------------------------------------ normal maps made on the GPU
let _nm = null;
/** lib.js / kit.js normalFrom under WebGPU: the texture's brightness, a little blurred, its Sobel
 * slope a tangent-space normal, drawn into `rt` (sized by the caller). `src` a linear copy of the
 * picture; texel = 1 / its size. */
export function drawNormalMap(renderer, rt, src, texelX, texelY, strength) {
  if (!_nm) {
    const { Fn, texture, uniform, uv, vec2, vec3, vec4, dot, normalize } = T;
    const tex = texture(new THREE.Texture()), texel = uniform(new THREE.Vector2()), k = uniform(1);
    const h1 = (o) => dot(tex.sample(uv().add(o.mul(texel))).rgb, vec3(0.299, 0.587, 0.114));
    // (four taps half a texel apart first, so single noisy texels don't each become a bump)
    const h = (x, y) => h1(vec2(x - 0.5, y - 0.5)).add(h1(vec2(x + 0.5, y - 0.5))).add(h1(vec2(x - 0.5, y + 0.5))).add(h1(vec2(x + 0.5, y + 0.5))).mul(0.25);
    const out = Fn(() => {
      const tl = h(-1, 1), t = h(0, 1), tr = h(1, 1), l = h(-1, 0), r = h(1, 0), bl = h(-1, -1), b = h(0, -1), br = h(1, -1);
      const dx = tr.add(r.mul(2)).add(br).sub(tl.add(l.mul(2)).add(bl));
      const dy = tl.add(t.mul(2)).add(tr).sub(bl.add(b.mul(2)).add(br));
      const n = normalize(vec3(dx.mul(k).negate(), dy.mul(k).negate(), 1.0));
      return vec4(n.mul(0.5).add(0.5), 1.0);
    })();
    const mat = new THREE.NodeMaterial();
    mat.fragmentNode = out;
    mat.depthTest = mat.depthWrite = false;
    _nm = { quad: new THREE.QuadMesh(mat), tex, texel, k };
  }
  _nm.tex.value = src; _nm.texel.value.set(texelX, texelY); _nm.k.value = strength;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  _nm.quad.render(renderer);
  renderer.setRenderTarget(prev);
}

/** three's fog uniforms for a WebGL ShaderMaterial (a copy, as UniformsUtils.clone made); none under
 * WebGPU, which has no UniformsLib (a node material takes the scene's fog by itself). */
export function fogUniforms() {
  return WEBGPU ? {} : THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
}
