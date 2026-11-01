// Brightwater's water: the river across the plateau, the falls off the cliff, the pool below and
// the stream that runs from it out across the downs.
//
// The surfaces are lit like the rest of the world (sun, sky light, shadows, fog), with their
// ripples carried along by the current (a ripple map scrolled with the flow in two staggered
// phases, so it never stretches), coloured by how deep they are, clear and soft at the shore,
// white where the water runs fast or the falls come down, and mirroring the sky at a glance.
// The falls are three sheets (a dim one behind, the body, a torn veil in front) whose streaks
// speed up as they drop and turn white; at the foot a boil of foam with rings spreading over the
// pool, spray thrown up and falling back, and mist that rolls out over the water (with a bow in
// it when the sun is behind you). Flecks of foam ride the current round the pool and down the
// stream and the river.
//
// Under WebGPU (nodes.js WEBGPU) the same shaders are TSL node graphs: the surface a Phong node
// material (both its materials one graph, the falls' rings per material), the falls, the spray and
// foam (drawn as quads: effects.js pointQuads) and the mist each one graph, their uniforms TSL
// uniforms the update below sets through `.value` as before.
import * as THREE from 'three';
import { TOUCH } from './input.js';
import { POOL, STREAM, FALLS, RIVER, terrainHeight, streamAt, streamLevel, riverAt, riverLevel } from './terrain.js';
import { fogUniforms, WEBGPU, T, ref } from './nodes.js';
import { fxNoise, fall as falling, live, nodeMaterial, pointQuads, pointQuad, pointScale } from './effects.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const R = Math.random;

// ------------------------------------------------------------------ the falls' shape
// the water leaves the brink flowing west at V0 and falls freely (a little slowed by the air)
const V0 = 3.6, G = 9.0;
const BRINK_X = (() => { // where the plateau's ground drops away under the river's water
  let x = RIVER[1][0];
  while (x > RIVER[0][0] && terrainHeight(x, FALLS.z) > FALLS.level - 1.25) x -= 0.05;
  return x;
})();
const TOP = FALLS.level - 0.08;
const FALL_T = Math.sqrt(2 * (TOP - POOL.level) / G);   // seconds from the brink to the pool
const FOOT_X = BRINK_X - V0 * FALL_T;
const fallWidth = (k) => 9.0 + 2.8 * Math.pow(k, 1.3);   // the sheet spreads as it falls (k = 0 .. 1)
const FOOT_W = fallWidth(1);
/** A point on the falls at flight time t (seconds), across at u (0..1), and its outward normal. */
function fallAt(t, u, out = {}) {
  out.x = BRINK_X - V0 * t; out.y = TOP - 0.5 * G * t * t; out.z = FALLS.z + (u - 0.5) * fallWidth(t / FALL_T);
  const l = Math.hypot(G * t, V0);
  out.nx = -G * t / l; out.ny = V0 / l;
  return out;
}

// ------------------------------------------------------------------ the pool's currents
// out from the foot of the falls (a line across its width), round the pool, and away down the
// stream where it leaves
const OUT = (() => {
  const [ax, az] = STREAM[1], dx = ax - POOL.x, dz = az - POOL.z, l = Math.hypot(dx, dz);
  return [POOL.x + dx / l * POOL.r, POOL.z + dz / l * POOL.r];
})();
const footDist = (x, z) => {
  const dz = z - Math.max(FALLS.z - FOOT_W / 2, Math.min(FALLS.z + FOOT_W / 2, z));
  return [x - FOOT_X, dz, Math.hypot(x - FOOT_X, dz)];
};
function poolFlow(x, z) {
  const [dx, dz, d] = footDist(x, z);
  const out = 2.6 * Math.exp(-d / 6.5) + 0.22;
  let fx = d > 0.01 ? dx / d * out : -out, fz = d > 0.01 ? dz / d * out : 0;
  const ex = OUT[0] - x, ez = OUT[1] - z, el = Math.hypot(ex, ez) || 1, pull = 0.42 * smooth(2, 12, d);
  fx += ex / el * pull; fz += ez / el * pull;
  const cx = x - POOL.x, cz = z - POOL.z, cl = Math.hypot(cx, cz) || 1;   // a slow turn round the pool
  fx += -cz / cl * 0.16; fz += cx / cl * 0.16;
  return [fx, fz];
}
const footFoam = (x, z) => Math.min(1, 1.2 * Math.exp(-footDist(x, z)[2] / 3.0) + 0.3 * Math.exp(-footDist(x, z)[2] / 9));

// ------------------------------------------------------------------ the ripple map
/** A tileable ripple map: rgb a normal from a sum of crossing waves, a a blotchy noise for foam. */
function rippleTexture(n = 256) {
  const rnd = rng(4417), h = new Float32Array(n * n), f = new Float32Array(n * n);
  const waves = [];
  for (let i = 0; i < 30; i++) {          // integer wave numbers, so it tiles
    const k = 3 + Math.floor(Math.pow(rnd(), 1.6) * 22), a = rnd() * Math.PI * 2;
    waves.push([Math.round(Math.cos(a) * k), Math.round(Math.sin(a) * k), 1 / Math.pow(k, 1.15), rnd() * Math.PI * 2]);
  }
  const lat = [[6, 0.5], [12, 0.3], [24, 0.2]].map(([c, w]) => [c, w, Float32Array.from({ length: c * c }, rnd)]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = 0;
    for (const [kx, ky, a, p] of waves) v += a * Math.sin((kx * x + ky * y) / n * Math.PI * 2 + p);
    h[y * n + x] = v;
    let q = 0;
    for (const [c, w, L] of lat) {        // value noise on wrapping lattices
      const fx = x / n * c, fy = y / n * c, ix = Math.floor(fx), iy = Math.floor(fy);
      let u = fx - ix, t = fy - iy; u = u * u * (3 - 2 * u); t = t * t * (3 - 2 * t);
      const g = (i, j) => L[((j % c) * c) + (i % c)];
      q += w * (g(ix, iy) + (g(ix + 1, iy) - g(ix, iy)) * u + (g(ix, iy + 1) - g(ix, iy)) * t + (g(ix, iy) - g(ix + 1, iy) - g(ix, iy + 1) + g(ix + 1, iy + 1)) * u * t);
    }
    f[y * n + x] = q;
  }
  const data = new Uint8Array(n * n * 4), H = (x, y) => h[((y + n) % n) * n + ((x + n) % n)];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2, l = Math.hypot(dx, dy, 1);
    data.set([(-dx / l * 0.5 + 0.5) * 255, (-dy / l * 0.5 + 0.5) * 255, (1 / l) * 255, Math.min(1, Math.max(0, (f[y * n + x] - 0.2) / 0.6)) * 255], (y * n + x) * 4);
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ the surface material
/** Phong (so the sun, sky light, shadows and fog are the world's) with the water put in: each
 * vertex carries its current (wflow, m/s) and [depth, foam, fade] (wdata). */
function waterMaterial(U, ring) {
  if (WEBGPU) return waterNodeMaterial(U, ring);
  const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0xb8c8d0, shininess: 180, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.userData.noGlass = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { wRing: { value: ring } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec2 wflow; attribute vec3 wdata; varying vec2 vWFlow; varying vec3 vWData; varying vec3 vWPos;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWFlow = wflow; vWData = wdata;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D wTex; uniform float wTime; uniform vec3 wSkyLo, wSkyHi, wDeep, wShallow; uniform vec4 wRing;
      varying vec2 vWFlow; varying vec3 vWData; varying vec3 vWPos;
      // the ripple map carried by the current: two phases half a cycle apart, each reset while unseen
      vec4 wFlowed(vec2 p, vec2 flow, float scale, float rate, float seed) {
        float ph = wTime * rate + seed, a = fract(ph), b = fract(ph + 0.5);
        vec2 f = flow / (rate * scale);
        vec4 s0 = texture2D(wTex, p / scale - f * (a - 0.5) + floor(ph) * vec2(0.37, 0.21) + seed);
        vec4 s1 = texture2D(wTex, p / scale - f * (b - 0.5) + floor(ph + 0.5) * vec2(0.29, 0.43) + seed + 0.5);
        return mix(s0, s1, abs(1.0 - 2.0 * a));
      }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      vec2 wp = vWPos.xz;
      float wDepth = vWData.x, wSpeed = length(vWFlow);
      vec4 r1 = wFlowed(wp, vWFlow, 7.5, 0.3, 0.0);          // long swells
      vec4 r2 = wFlowed(wp, vWFlow, 2.4, 0.75, 0.31);        // the chop
      vec4 r3 = texture2D(wTex, wp / 4.3 + wTime * vec2(0.012, -0.008));          // wind over still water
      vec4 r4 = texture2D(wTex, wp / 2.9 + wTime * vec2(-0.010, 0.015) + 0.5);
      vec2 wGrad = (r1.xy - 0.5) * 0.8 + (r2.xy - 0.5) * (0.55 + 0.45 * min(wSpeed, 2.5)) + (r3.xy + r4.xy - 1.0) * 0.3;
      if (wRing.z > 0.0) {   // rings spreading from where the falls come down
        vec2 rv = wp - vec2(wRing.x, clamp(wp.y, wRing.y - wRing.w, wRing.y + wRing.w));
        float rd = length(rv), ph = rd * 2.4 - wTime * 5.5;
        wGrad += rv / max(rd, 0.01) * cos(ph) * exp(-rd / 7.0) * wRing.z * (0.6 + 0.4 * sin(ph * 0.31 + wp.y));
      }
      // foam: churned up by the falls, along the shore where the water laps, and where it runs fast
      float wH = r1.w * 0.45 + r2.w * 0.55;
      float wShore = (1.0 - smoothstep(0.04, 0.35, wDepth)) * smoothstep(0.3, 0.7, r1.w + 0.25 * sin(wTime * 1.3 + r3.w * 8.0));
      float wF = clamp(vWData.y * 0.95 + wShore * 0.35 + max(wSpeed - 1.5, 0.0) * 0.3, 0.0, 0.93);
      float wFoam = smoothstep(1.0 - wF, 1.0 - wF + 0.25, wH) * step(0.01, wF);
      wFoam *= 0.75 + 0.25 * r4.w;
      float wDeepK = 1.0 - exp(-max(wDepth, 0.0) * 0.75);
      diffuseColor.rgb = mix(mix(wShallow, wDeep, wDeepK), vec3(0.9, 0.93, 0.95), wFoam);
      float wAlpha = mix(0.28, 0.9, wDeepK);`)
      .replace('#include <normal_fragment_maps>', `
      vec3 wN = normalize(vec3(-wGrad.x * (0.5 + 0.4 * wFoam), 1.0, -wGrad.y * (0.5 + 0.4 * wFoam)));
      normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);`)
      .replace('#include <envmap_fragment>', `
      // the sky in it, strongest at a glance (Fresnel), and less where it's white
      vec3 wV = normalize(vViewPosition);
      float wFr = 0.02 + 0.98 * pow(1.0 - clamp(dot(normal, wV), 0.0, 1.0), 5.0);
      vec3 wR = (vec4(reflect(-wV, normal), 0.0) * viewMatrix).xyz;
      vec3 wSky = mix(wSkyLo, wSkyHi, smoothstep(-0.05, 0.55, wR.y));
      vec3 wSpec = reflectedLight.directSpecular;
      outgoingLight = mix(outgoingLight - wSpec, wSky, wFr * (1.0 - wFoam) * 0.85) + wSpec * (1.0 - wFoam * 0.8);
      diffuseColor.a = clamp(max(mix(wAlpha, 1.0, wFr * 0.85), wFoam * 0.95) * smoothstep(-0.02, 0.22, wDepth) * vWData.z, 0.0, 1.0);`);
  };
  return m;
}

/** The surface's graph in TSL (one for both its materials: the falls' rings come from each
 * material's userData.wRing): its colour, opacity and normal, and the sky mixed into the light. */
function waterGraph(U) {
  const { vec2, vec3, vec4, float, fract, floor, mix, abs, length, max, min, clamp, smoothstep, step, exp, cos, sin, normalize, dot, pow,
    reflect, select, texture, attribute, positionWorld, positionViewDirection, cameraViewMatrix, cameraWorldMatrix } = T;
  const tex = texture(U.wTex.value), wTime = U.wTime;
  const wflow = attribute('wflow', 'vec2'), wdata = attribute('wdata', 'vec3'), wRing = ref('userData.wRing', 'vec4');
  // the ripple map carried by the current: two phases half a cycle apart, each reset while unseen
  const flowed = (p, flow, scale, rate, seed) => {
    const ph = wTime.mul(rate).add(seed), a = fract(ph), b = fract(ph.add(0.5)), f = flow.div(rate * scale);
    const s0 = tex.sample(p.div(scale).sub(f.mul(a.sub(0.5))).add(floor(ph).mul(vec2(0.37, 0.21))).add(seed));
    const s1 = tex.sample(p.div(scale).sub(f.mul(b.sub(0.5))).add(floor(ph.add(0.5)).mul(vec2(0.29, 0.43))).add(seed + 0.5));
    return mix(s0, s1, abs(a.mul(-2.0).add(1.0)));
  };
  const wp = positionWorld.xz, wDepth = wdata.x, wSpeed = length(wflow);
  const r1 = flowed(wp, wflow, 7.5, 0.3, 0.0);          // long swells
  const r2 = flowed(wp, wflow, 2.4, 0.75, 0.31);        // the chop
  const r3 = tex.sample(wp.div(4.3).add(wTime.mul(vec2(0.012, -0.008))));          // wind over still water
  const r4 = tex.sample(wp.div(2.9).add(wTime.mul(vec2(-0.010, 0.015))).add(0.5));
  // rings spreading from where the falls come down
  const rv = wp.sub(vec2(wRing.x, clamp(wp.y, wRing.y.sub(wRing.w), wRing.y.add(wRing.w))));
  const rd = length(rv), ph = rd.mul(2.4).sub(wTime.mul(5.5));
  const ring = rv.div(max(rd, 0.01)).mul(cos(ph)).mul(exp(rd.div(-7.0))).mul(wRing.z).mul(sin(ph.mul(0.31).add(wp.y)).mul(0.4).add(0.6));
  const grad = r1.xy.sub(0.5).mul(0.8).add(r2.xy.sub(0.5).mul(min(wSpeed, 2.5).mul(0.45).add(0.55))).add(r3.xy.add(r4.xy).sub(1.0).mul(0.3))
    .add(select(wRing.z.greaterThan(0.0), ring, vec2(0.0)));
  // foam: churned up by the falls, along the shore where the water laps, and where it runs fast
  const wH = r1.w.mul(0.45).add(r2.w.mul(0.55));
  const shore = smoothstep(0.04, 0.35, wDepth).oneMinus().mul(smoothstep(0.3, 0.7, r1.w.add(sin(wTime.mul(1.3).add(r3.w.mul(8.0))).mul(0.25))));
  const wF = clamp(wdata.y.mul(0.95).add(shore.mul(0.35)).add(max(wSpeed.sub(1.5), 0.0).mul(0.3)), 0.0, 0.93);
  const foam = smoothstep(wF.oneMinus(), wF.oneMinus().add(0.25), wH).mul(step(0.01, wF)).mul(r4.w.mul(0.25).add(0.75));
  const deepK = exp(max(wDepth, 0.0).mul(-0.75)).oneMinus();
  const color = vec4(mix(mix(U.wShallow, U.wDeep, deepK), vec3(0.9, 0.93, 0.95), foam), 1.0);
  const wN = normalize(vec3(grad.x.negate().mul(foam.mul(0.4).add(0.5)), 1.0, grad.y.negate().mul(foam.mul(0.4).add(0.5))));
  const normal = normalize(cameraViewMatrix.mul(vec4(wN, 0.0)).xyz);
  // the sky in it, strongest at a glance (Fresnel), and less where it's white
  const V = positionViewDirection;
  const fr = pow(clamp(dot(normal, V), 0.0, 1.0).oneMinus(), 5.0).mul(0.98).add(0.02);
  const R = cameraWorldMatrix.mul(vec4(reflect(V.negate(), normal), 0.0)).xyz;
  const sky = mix(U.wSkyLo, U.wSkyHi, smoothstep(-0.05, 0.55, R.y));
  const opacity = clamp(max(mix(mix(0.28, 0.9, deepK), float(1.0), fr.mul(0.85)), foam.mul(0.95)).mul(smoothstep(-0.02, 0.22, wDepth)).mul(wdata.z), 0.0, 1.0);
  // what the GLSL's envmap_fragment did to the light: the sky mixed in, the sun's glint kept
  class Lighting extends THREE.PhongLightingModel {
    finish(builder) {
      super.finish(builder);
      const { outgoingLight, reflectedLight } = builder.context, spec = reflectedLight.directSpecular;
      outgoingLight.assign(mix(outgoingLight.sub(spec), sky, fr.mul(foam.oneMinus()).mul(0.85)).add(spec.mul(foam.mul(0.8).oneMinus())));
    }
  }
  return { U, color, opacity, normal, Lighting };
}
let _water = null;

function waterNodeMaterial(U, ring) {
  if (_water?.U !== U) _water = waterGraph(U);
  const g = _water;
  const m = new THREE.MeshPhongNodeMaterial({ color: 0xffffff, specular: 0xb8c8d0, shininess: 180, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.userData.noGlass = true;
  m.userData.wRing = ring;
  m.colorNode = g.color; m.opacityNode = g.opacity; m.normalNode = g.normal;
  m.setupLightingModel = () => new g.Lighting();
  return m;
}

/** A mesh from rows of vertices: P positions, F currents, D [depth, foam, fade]; quads between
 * (r, c) and (r + 1, c + 1) for rows of `cols` vertices, kept if keep(a, b, c, d) says so. */
function surfaceMesh(P, F, D, rows, cols, mat, keep = () => true) {
  const idx = [];
  for (let r = 0; r + 1 < rows; r++) for (let c = 0; c + 1 < cols; c++) {
    const a = r * cols + c, b = a + 1, cc = a + cols, d = cc + 1;
    if (keep(a, b, cc, d)) idx.push(a, cc, b, b, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(P.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('wflow', new THREE.Float32BufferAttribute(F, 2));
  g.setAttribute('wdata', new THREE.Float32BufferAttribute(D, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true; m.renderOrder = 1; m.matrixAutoUpdate = false;
  return m;
}

/** A polyline resampled every `step` metres and smoothed, with its tangents and lengths. */
function sampled(pts, step, from = 0, to = Infinity) {
  let out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  out.push(pts.at(-1));
  for (let pass = 0; pass < 3; pass++) out = out.map((p, i) => {   // round the corners
    if (i === 0 || i === out.length - 1) return p;
    const lo = Math.max(0, i - 3), hi = Math.min(out.length - 1, i + 3);
    let x = 0, z = 0; for (let j = lo; j <= hi; j++) { x += out[j][0]; z += out[j][1]; }
    return [x / (hi - lo + 1), z / (hi - lo + 1)];
  });
  let s = 0;
  const res = out.map((p, i) => {
    if (i) s += Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]);
    const [nx, nz] = out[Math.min(i + 1, out.length - 1)], [px, pz] = out[Math.max(i - 1, 0)], l = Math.hypot(nx - px, nz - pz) || 1;
    return { x: p[0], z: p[1], tx: (nx - px) / l, tz: (nz - pz) / l, s };
  });
  return res.filter((p) => p.s >= from && p.s <= to);
}

/** A strip of water down a sampled path: level(p), speed(p, across 0..1), foam(p), fade(p);
 * dir -1 if the water runs against the path's order. Also works out each sample's banks. */
function ribbon(path, half, cols, mat, { level, speed, foam = () => 0, fade = () => 1, dir = 1 }) {
  const P = [], F = [], D = [];
  for (const p of path) {
    const y = level(p);
    p.y = y; p.banks = [0, 0];
    for (const [side, sign] of [[0, -1], [1, 1]]) {   // how far the water reaches each side
      let o = 0;
      while (o < half && terrainHeight(p.x - p.tz * sign * (o + 0.5), p.z + p.tx * sign * (o + 0.5)) < y - 0.12) o += 0.5;
      p.banks[side] = o;
    }
    for (let c = 0; c < cols; c++) {
      const a = (c / (cols - 1)) * 2 - 1, o = a * half, x = p.x - p.tz * o, z = p.z + p.tx * o;
      const v = speed(p, Math.abs(a)) * dir;
      P.push(x, y, z); F.push(p.tx * v, p.tz * v); D.push(y - terrainHeight(x, z), foam(p, Math.abs(a)), fade(p));
    }
  }
  return surfaceMesh(P, F, D, path.length, cols, mat, (...q) => q.some((i) => D[i * 3] > -0.35));
}

// ------------------------------------------------------------------ the falls
const NOISE = /* glsl */`
  float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y); }`;

/** The falls' shader in TSL (time: the water's clock, U.wTime). */
function fallsMaterial(L, time) {
  const { Fn, vec2, vec3, vec4, float, clamp, smoothstep, mix, normalize, dot, max, pow, reflect, sin, select, attribute,
    positionGeometry, normalGeometry, positionWorld, cameraPosition } = T;
  const fn = fxNoise().vnoise, { sunCol, amb, sunDir } = L;
  const F = attribute('fall', 'vec4');
  // the sheet shivers and bellies more the further it has fallen
  const shiver = sin(time.mul(2.7).add(F.y.mul(11.0)).add(F.x.mul(17.0))).mul(0.1).add(sin(time.mul(1.3).add(F.x.mul(6.0))).mul(0.12));
  const position = positionGeometry.add(normalGeometry.mul(shiver.mul(F.y).mul(F.z.mul(0.6).add(1.0))));
  const fragment = Fn(() => {
    const u = F.x, v = F.y, layer = F.z, x = u.mul(F.w);
    // the pattern rides the water: at flight time v * T it left the brink (time - v * T) ago,
    // so streaks stretch as the water speeds up
    const tt = v.mul(Number(FALL_T.toFixed(3))).sub(time.mul(select(layer.lessThan(0.5), float(0.8), select(layer.greaterThan(1.5), float(1.12), float(1.0))))).toVar();
    const n1 = fn(vec2(x.mul(0.7).add(layer.mul(13.0)), tt.mul(1.5))).toVar();
    const n2 = fn(vec2(x.mul(2.4).add(layer.mul(7.0)), tt.mul(3.3))).toVar();
    const n3 = fn(vec2(x.mul(6.5).add(layer.mul(3.0)), tt.mul(7.5))).toVar();
    const ropes = fn(vec2(x.mul(1.1).add(5.0), v.mul(2.0).sub(time.mul(0.05)))).toVar();   // thicker and thinner falls of water across it
    const e0 = fn(vec2(v.mul(5.0).sub(time.mul(0.4)), layer.add(1.0))), e1 = fn(vec2(v.mul(5.0).sub(time.mul(0.4)), layer.add(9.0)));
    const edge = smoothstep(0.0, e0.mul(v).mul(0.16).add(0.05), u).mul(smoothstep(0.0, e1.mul(v).mul(0.16).add(0.05), u.oneMinus())).toVar();
    // glassy as it rolls over the brink, aerated and white lower down, all white at the foot
    const aer0 = clamp(v.mul(1.2).sub(0.1).add(n2.sub(0.5).mul(0.9)).add(n1.sub(0.5).mul(0.6)).add(edge.oneMinus().mul(0.4)).add(float(0.5).sub(ropes).mul(0.4)), 0.0, 1.0);
    const w = smoothstep(0.2, 0.85, mix(aer0, float(1.0), smoothstep(0.82, 1.0, v))).toVar();
    // lit: the sun on it, through the white water when it's behind, a glint off the glassy part
    const N = normalize(normalGeometry.add(vec3(0.0, 0.0, n2.sub(0.5).mul(0.6))).add(vec3(n3.sub(0.5).mul(0.3)))).toVar();
    const V = normalize(cameraPosition.sub(positionWorld));
    const lit = max(dot(N, sunDir), 0.0).mul(0.65).add(0.35), thru = max(dot(N.negate(), sunDir), 0.0).mul(w).mul(0.5);
    const spec = pow(max(dot(reflect(sunDir.negate(), N), V), 0.0), 40.0).mul(w.oneMinus()).mul(n3.add(0.5));
    const col = mix(vec3(0.07, 0.2, 0.21), vec3(0.9, 0.94, 0.96), w).mul(amb.add(sunCol.mul(lit.add(thru)))).add(sunCol.mul(spec).mul(1.5)).toVar();
    const aBack = edge.mul(0.55).mul(smoothstep(0.25, 0.55, n1.add(v.mul(0.3))));
    const aBody = mix(0.62, 0.97, w).mul(ropes.mul(0.2).add(0.8)).mul(edge)
      .mul(smoothstep(0.1, 0.32, n3.mul(0.55).add(n1.mul(0.45)).add(0.12).add(v.mul(0.1)).sub(edge.oneMinus().mul(0.25))));   // torn through here and there
    const aVeil = smoothstep(0.56, 0.9, n2.mul(0.55).add(n3.mul(0.45))).mul(0.8).mul(edge).mul(smoothstep(0.02, 0.2, v));   // threads
    return vec4(select(layer.lessThan(0.5), col.mul(0.75), col), select(layer.lessThan(0.5), aBack, select(layer.lessThan(1.5), aBody, aVeil)));
  })();
  const m = nodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.fog = true;
  m.positionNode = position; m.fragmentNode = fragment;
  m.uniforms = { time, ...L };
  return m;
}

function fallsMesh(L, time = null) {
  // three sheets, back to front: the dim water behind, the body, a torn veil in front
  const ROWS = 44, COLS = 18, P = [], A = [], N = [], I = [], q = {};
  [[-0.5, 0.92], [0, 1], [0.45, 1.06]].forEach(([off, wide], layer) => {
    const base = P.length / 3;
    for (let r = 0; r <= ROWS; r++) {
      const t = FALL_T * r / ROWS;
      for (let c = 0; c <= COLS; c++) {
        const u = c / COLS;
        fallAt(t, 0.5 + (u - 0.5) * wide, q);
        P.push(q.x + q.nx * off, q.y + q.ny * off, q.z); N.push(q.nx, q.ny, 0);
        A.push(u, r / ROWS, layer, fallWidth(r / ROWS) * wide);
        if (r && c) { const a = base + (r - 1) * (COLS + 1) + c - 1, b = a + 1, cc = a + COLS + 1, d = cc + 1; I.push(a, cc, b, b, cc, d); }
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('fall', new THREE.Float32BufferAttribute(A, 4));
  g.setIndex(I);
  g.computeBoundingSphere();
  const mat = WEBGPU ? fallsMaterial(L, time) : new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: { ...fogUniforms(), time: { value: 0 } },
    vertexShader: /* glsl */`
      uniform float time; attribute vec4 fall; varying vec4 vF; varying vec3 vN, vW;
      #include <fog_pars_vertex>
      void main() {
        vF = fall; vN = normal;
        vec3 p = position;
        // the sheet shivers and bellies more the further it has fallen
        p += normal * (sin(time * 2.7 + fall.y * 11.0 + fall.x * 17.0) * 0.1 + sin(time * 1.3 + fall.x * 6.0) * 0.12) * fall.y * (1.0 + fall.z * 0.6);
        vW = (modelMatrix * vec4(p, 1.0)).xyz;
        vec4 mvPosition = viewMatrix * vec4(vW, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float time; uniform vec3 sunCol, amb, sunDir; varying vec4 vF; varying vec3 vN, vW;
      #include <fog_pars_fragment>
      ${NOISE}
      void main() {
        float u = vF.x, v = vF.y, layer = vF.z, x = u * vF.w;
        // the pattern rides the water: at flight time v * T it left the brink (time - v * T) ago,
        // so streaks stretch as the water speeds up
        float tt = v * ${FALL_T.toFixed(3)} - time * (layer < 0.5 ? 0.8 : layer > 1.5 ? 1.12 : 1.0);
        float n1 = fn(vec2(x * 0.7 + layer * 13.0, tt * 1.5));
        float n2 = fn(vec2(x * 2.4 + layer * 7.0, tt * 3.3));
        float n3 = fn(vec2(x * 6.5 + layer * 3.0, tt * 7.5));
        float ropes = fn(vec2(x * 1.1 + 5.0, v * 2.0 - time * 0.05));   // thicker and thinner falls of water across it
        float e0 = fn(vec2(v * 5.0 - time * 0.4, 1.0 + layer)), e1 = fn(vec2(v * 5.0 - time * 0.4, 9.0 + layer));
        float edge = smoothstep(0.0, 0.05 + 0.16 * e0 * v, u) * smoothstep(0.0, 0.05 + 0.16 * e1 * v, 1.0 - u);
        // glassy as it rolls over the brink, aerated and white lower down, all white at the foot
        float aer = clamp(v * 1.2 - 0.1 + (n2 - 0.5) * 0.9 + (n1 - 0.5) * 0.6 + (1.0 - edge) * 0.4 + (0.5 - ropes) * 0.4, 0.0, 1.0);
        aer = mix(aer, 1.0, smoothstep(0.82, 1.0, v));
        float w = smoothstep(0.2, 0.85, aer);
        vec3 col = mix(vec3(0.07, 0.2, 0.21), vec3(0.9, 0.94, 0.96), w);
        // lit: the sun on it, through the white water when it's behind, a glint off the glassy part
        vec3 N = normalize(vN + vec3(0.0, 0.0, (n2 - 0.5) * 0.6) + vec3((n3 - 0.5) * 0.3));
        vec3 V = normalize(cameraPosition - vW);
        float lit = 0.35 + 0.65 * max(dot(N, sunDir), 0.0), thru = max(dot(-N, sunDir), 0.0) * w * 0.5;
        float spec = pow(max(dot(reflect(-sunDir, N), V), 0.0), 40.0) * (1.0 - w) * (0.5 + n3);
        col = col * (amb + sunCol * (lit + thru)) + sunCol * spec * 1.5;
        float a;
        if (layer < 0.5) { a = 0.55 * edge * smoothstep(0.25, 0.55, n1 + v * 0.3); col *= 0.75; }
        else if (layer < 1.5) {
          a = mix(0.62, 0.97, w) * (0.8 + 0.2 * ropes) * edge;
          a *= smoothstep(0.1, 0.32, n3 * 0.55 + n1 * 0.45 + 0.12 + v * 0.1 - (1.0 - edge) * 0.25);   // torn through here and there
        } else a = smoothstep(0.56, 0.9, n2 * 0.55 + n3 * 0.45) * 0.8 * edge * smoothstep(0.02, 0.2, v);   // threads
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, L);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 3; m.matrixAutoUpdate = false;
  return m;
}

// ------------------------------------------------------------------ spray, foam flecks and mist
/** Small round points: droplets of spray (falling) and flecks of foam (riding the water). */
class Points {
  constructor(scene, max, L, flecks) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.age = new Float32Array(max); this.life = new Float32Array(max); this.size = new Float32Array(max);
    this.a = new Float32Array(max); this.k = new Float32Array(max * 2);   // per point: two numbers for whoever moves it
    this.data = new Float32Array(max * 3);   // size, alpha, seed
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pdata', new THREE.BufferAttribute(this.data, 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = WEBGPU ? pointQuads(g) : g;
    this.mat = WEBGPU ? pointsMaterial(L, flecks) : new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: { ...fogUniforms(), scale: { value: 300 }, time: { value: 0 } },
      vertexShader: /* glsl */`
        uniform float scale; attribute vec3 pdata; varying float vA, vSeed;
        #include <fog_pars_vertex>
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float px = pdata.x * scale / -mvPosition.z;
          gl_PointSize = max(px, 1.5);
          vA = pdata.y * min(1.0, px / 1.5);    // too small to see: fainter, not smaller
          vSeed = pdata.z;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform float time; uniform vec3 sunCol, amb; varying float vA, vSeed;
        #include <fog_pars_fragment>
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          vec3 col = vec3(${flecks ? '0.86, 0.9, 0.9' : '0.8, 0.9, 0.95'}) * (amb + sunCol * 0.8);
          ${flecks ? '' : 'col += sunCol * 1.6 * step(0.9, fract(vSeed * 7.13 + time * 1.7));   // a drop catching the sun'}
          gl_FragColor = vec4(col, vA * smoothstep(1.0, 0.4, d));
          #include <fog_fragment>
        }`,
    });
    Object.assign(this.mat.uniforms, L);
    this.points = WEBGPU ? new THREE.Mesh(this.geo, this.mat) : new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = flecks ? 2 : 4;
    scene.add(this.points);
  }

  add(x, y, z, vx, vy, vz, life, size, alpha) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3);
    this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.a[i] = alpha; this.data[i * 3 + 2] = R();
    return i;
  }

  kill(i) {   // swap the last one in
    const j = --this.n;
    if (i === j) return;
    this.p.copyWithin(i * 3, j * 3, j * 3 + 3); this.v.copyWithin(i * 3, j * 3, j * 3 + 3); this.k.copyWithin(i * 2, j * 2, j * 2 + 2);
    this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.size[i] = this.size[j]; this.a[i] = this.a[j]; this.data[i * 3 + 2] = this.data[j * 3 + 2];
  }

  upload(scale, t) {
    for (let i = 0; i < this.n; i++) {
      const k = this.age[i] / this.life[i];
      this.data[i * 3] = this.size[i]; this.data[i * 3 + 1] = this.a[i] * Math.min(1, this.age[i] * 6) * Math.min(1, (1 - k) * 4);
    }
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pdata.needsUpdate = true;
    this.mat.uniforms.scale.value = scale; this.mat.uniforms.time.value = t;
  }
}

/** The spray's or the flecks' shader in TSL: round points drawn as quads (effects.js pointQuads), as
 * big as the GLSL's (never under a pixel and a half: fainter instead). */
function pointsMaterial(L, flecks) {
  const { Fn, vec3, vec4, length, step, fract, max, min, attribute, positionView, varying, Discard } = T;
  const { sunCol, amb } = L, time = live(0);
  const pdata = attribute('pdata', 'vec3');
  const px = pdata.x.mul(pointScale()).div(positionView.z.negate());
  const { vertex, coord } = pointQuad(max(px, 1.5));
  const vA = varying(pdata.y.mul(min(1.0, px.div(1.5))));    // too small to see: fainter, not smaller
  const fragment = Fn(() => {
    const d = length(coord.sub(0.5)).mul(2.0).toVar();
    Discard(d.greaterThan(1.0));
    const col = (flecks ? vec3(0.86, 0.9, 0.9) : vec3(0.8, 0.9, 0.95)).mul(amb.add(sunCol.mul(0.8))).toVar();
    if (!flecks) col.addAssign(sunCol.mul(1.6).mul(step(0.9, fract(pdata.z.mul(7.13).add(time.mul(1.7))))));   // a drop catching the sun
    return vec4(col, vA.mul(falling(1.0, 0.4, d)));
  })();
  const m = nodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.fog = true;
  m.vertexNode = vertex; m.fragmentNode = fragment;
  m.uniforms = { scale: { value: 300 }, time };   // (scale: set as before, worked out in the shader: pointScale)
  return m;
}

/** The mist's shader in TSL: billows on quads turned to the eye, with the bow in them. */
function billowsMaterial(L) {
  const { Fn, vec2, vec3, vec4, cos, sin, length, normalize, dot, max, abs, pow, acos, clamp, degrees, smoothstep, attribute, varying,
    positionGeometry, positionWorld, cameraWorldMatrix, cameraViewMatrix, cameraPosition, Discard } = T;
  const fn = fxNoise().vnoise, { sunCol, amb, sunDir } = L, time = live(0), bow = live(0);
  const ipos = attribute('ipos', 'vec3'), idat = attribute('idat', 'vec4');
  const c = cos(idat.z), s = sin(idat.z), q = positionGeometry;
  const r = vec2(c.mul(q.x).sub(s.mul(q.y)), s.mul(q.x).add(c.mul(q.y))).mul(idat.x);
  const right = cameraWorldMatrix.mul(vec4(1, 0, 0, 0)).xyz, up = cameraWorldMatrix.mul(vec4(0, 1, 0, 0)).xyz;
  const position = ipos.add(right.mul(r.x)).add(up.mul(r.y));
  // a puff the eye is in (or nearly) thins away rather than filling the view
  const vA = varying(idat.y.mul(smoothstep(0.25, 1.1, length(cameraViewMatrix.mul(vec4(ipos, 1.0)).xyz).div(idat.x))));
  const vQ = varying(q.xy.mul(2.0)), seed = idat.w;
  const fragment = Fn(() => {
    const d = length(vQ).toVar();
    Discard(d.greaterThan(1.0));
    const n = fn(vQ.mul(1.8).add(seed.mul(31.0))).mul(0.6).add(fn(vQ.mul(4.1).add(seed.mul(17.0)).add(time.mul(0.15))).mul(0.4));
    const a = vA.mul(pow(max(d.oneMinus(), 0.0), 1.4)).mul(n.mul(0.9).add(0.35));
    const V = normalize(positionWorld.sub(cameraPosition)).toVar();
    const col = vec3(0.86, 0.9, 0.93).mul(amb.add(sunCol.mul(pow(max(dot(V, sunDir), 0.0), 8.0).mul(1.3).add(0.5)))).toVar();
    // the bow, 40.5 to 42.5 degrees out from the point opposite the sun, violet inside, red out
    const k = degrees(acos(clamp(dot(V, sunDir.negate()), -1.0, 1.0))).sub(40.5).div(2.0).toVar();
    const hue = clamp(vec3(smoothstep(0.35, 0.8, k).add(smoothstep(0.0, 0.25, k).oneMinus().mul(0.5)), abs(k.sub(0.5)).mul(2.4).oneMinus(), smoothstep(0.1, 0.5, k).oneMinus()), 0.0, 1.0);
    col.addAssign(hue.mul(sunCol).mul(bow).mul(smoothstep(0.0, 0.15, k)).mul(falling(1.0, 0.85, k)).mul(0.9));
    return vec4(col, a);
  })();
  const m = nodeMaterial({ transparent: true, depthWrite: false });
  m.fog = true;
  m.positionNode = position; m.fragmentNode = fragment;
  m.uniforms = { time, bow };
  return m;
}

/** Mist: soft billows on camera-facing quads (instanced: a puff can be far bigger than a point
 * may be drawn), lit by the sun (brightest looking toward it) and the sky, with the bow in them. */
class Billows {
  constructor(scene, max, L) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.age = new Float32Array(max); this.life = new Float32Array(max); this.size = new Float32Array(max);
    this.grow = new Float32Array(max); this.a = new Float32Array(max); this.spin = new Float32Array(max);
    this.ipos = new Float32Array(max * 3); this.idat = new Float32Array(max * 4);   // size, alpha, angle, seed
    const q = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = q.index; g.setAttribute('position', q.attributes.position);
    g.setAttribute('ipos', new THREE.InstancedBufferAttribute(this.ipos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('idat', new THREE.InstancedBufferAttribute(this.idat, 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = g;
    this.mat = WEBGPU ? billowsMaterial(L) : new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: { ...fogUniforms(), time: { value: 0 }, bow: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec3 ipos; attribute vec4 idat; varying vec2 vQ; varying float vA, vSeed; varying vec3 vW;
        #include <fog_pars_vertex>
        void main() {
          float c = cos(idat.z), s = sin(idat.z);
          vec2 r = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * idat.x;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vW = ipos + right * r.x + up * r.y;
          vec4 mvPosition = viewMatrix * vec4(vW, 1.0);
          // a puff the eye is in (or nearly) thins away rather than filling the view
          vA = idat.y * smoothstep(0.25, 1.1, length((viewMatrix * vec4(ipos, 1.0)).xyz) / idat.x);
          vQ = position.xy * 2.0; vSeed = idat.w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform float time, bow; uniform vec3 sunCol, amb, sunDir; varying vec2 vQ; varying float vA, vSeed; varying vec3 vW;
        #include <fog_pars_fragment>
        ${NOISE}
        void main() {
          float d = length(vQ);
          if (d > 1.0) discard;
          float n = fn(vQ * 1.8 + vSeed * 31.0) * 0.6 + fn(vQ * 4.1 + vSeed * 17.0 + time * 0.15) * 0.4;
          float a = vA * pow(1.0 - d, 1.4) * (0.35 + 0.9 * n);
          vec3 V = normalize(vW - cameraPosition);
          vec3 col = vec3(0.86, 0.9, 0.93) * (amb + sunCol * (0.5 + 1.3 * pow(max(dot(V, sunDir), 0.0), 8.0)));
          // the bow, 40.5 to 42.5 degrees out from the point opposite the sun, violet inside, red out
          float k = (degrees(acos(clamp(dot(V, -sunDir), -1.0, 1.0))) - 40.5) / 2.0;
          vec3 hue = clamp(vec3(smoothstep(0.35, 0.8, k) + 0.5 * (1.0 - smoothstep(0.0, 0.25, k)), 1.0 - abs(k - 0.5) * 2.4, 1.0 - smoothstep(0.1, 0.5, k)), 0.0, 1.0);
          col += hue * sunCol * bow * smoothstep(0.0, 0.15, k) * smoothstep(1.0, 0.85, k) * 0.9;
          gl_FragColor = vec4(col, a);
          #include <fog_fragment>
        }`,
    });
    Object.assign(this.mat.uniforms, L);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  add(x, y, z, vx, vy, vz, { life, size, grow, alpha }) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3);
    this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.grow[i] = grow; this.a[i] = alpha;
    this.spin[i] = (R() - 0.5) * 0.5; this.idat[i * 4 + 2] = R() * 6.28; this.idat[i * 4 + 3] = R();
  }

  update(dt, t) {
    for (let i = 0; i < this.n; i++) {
      if ((this.age[i] += dt) >= this.life[i]) {   // swap the last one in
        const j = --this.n;
        this.p.copyWithin(i * 3, j * 3, j * 3 + 3); this.v.copyWithin(i * 3, j * 3, j * 3 + 3);
        for (const A of [this.age, this.life, this.size, this.grow, this.a, this.spin]) A[i] = A[j];
        this.idat[i * 4 + 2] = this.idat[j * 4 + 2]; this.idat[i * 4 + 3] = this.idat[j * 4 + 3];
        i--; continue;
      }
      const damp = 1 - Math.min(1, dt * 0.35), j = i * 3;
      this.v[j] *= damp; this.v[j + 2] *= damp;
      this.v[j + 1] = this.v[j + 1] * damp + dt * 0.12;   // and it rises as it slows, a little
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < POOL.level + this.size[i] * 0.15) this.p[j + 1] = POOL.level + this.size[i] * 0.15;
      const k = this.age[i] / this.life[i];
      this.ipos.set([this.p[j], this.p[j + 1], this.p[j + 2]], j);
      this.idat[i * 4] = this.size[i] + this.grow[i] * this.age[i];
      this.idat[i * 4 + 1] = this.a[i] * smooth(0, 0.15, k) * (1 - smooth(0.55, 1, k));
      this.idat[i * 4 + 2] += this.spin[i] * dt;
    }
    this.geo.instanceCount = this.n;
    this.geo.attributes.ipos.needsUpdate = true;
    this.geo.attributes.idat.needsUpdate = true;
    this.mat.uniforms.time.value = t;
  }
}

// ------------------------------------------------------------------ all of it
/** Builds the river, the falls, the pool and the stream into ctx.scene. Returns
 * {pool, stream, river, fall, foot, update(dt, t, {camera, height, sun, hemi, day})}. */
export function buildWater(ctx) {
  const { scene } = ctx;
  const lite = TOUCH;
  // what everything here is lit by, set each frame from the world's own lights
  // (under WebGPU each a TSL uniform, read once a render: effects.js live)
  const u = WEBGPU ? live : (value) => ({ value });
  const L = { sunCol: u(new THREE.Color()), amb: u(new THREE.Color()), sunDir: u(new THREE.Vector3(0, 1, 0)) };
  const U = {
    wTex: { value: rippleTexture() }, wTime: u(0),
    wSkyLo: u(new THREE.Color()), wSkyHi: u(new THREE.Color()),
    wDeep: u(new THREE.Color(0x0a2a30)), wShallow: u(new THREE.Color(0x3a7a74)),
  };
  const poolMat = waterMaterial(U, new THREE.Vector4(FOOT_X, FALLS.z, 1.1, FOOT_W / 2));
  const flowMat = waterMaterial(U, new THREE.Vector4(0, 0, 0, 0));

  // the pool: a fine grid over the basin, cut to a circle, fading at its edge into the stream
  const PR = POOL.r + 7, Q = 1.25, n = Math.ceil(PR * 2 / Q) + 1, P = [], F = [], D = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x = POOL.x - PR + c * Q, z = POOL.z - PR + r * Q, dp = Math.hypot(x - POOL.x, z - POOL.z);
    P.push(x, POOL.level, z); F.push(...poolFlow(x, z));
    D.push(POOL.level - terrainHeight(x, z), footFoam(x, z), 1 - smooth(PR - 4, PR, dp));
  }
  const pool = surfaceMesh(P, F, D, n, n, poolMat, (...q) => q.some((i) => D[i * 3] > -0.3)
    && Math.hypot(q.reduce((s, i) => s + P[i * 3], 0) / 4 - POOL.x, q.reduce((s, i) => s + P[i * 3 + 2], 0) / 4 - POOL.z) < PR);
  scene.add(pool);

  // the stream, from where it leaves the pool (crossfading with it) to the edge of the downs,
  // brought up to the pool's level where they meet
  const SL = STREAM.slice(1).reduce((a, b, i) => a + Math.hypot(b[0] - STREAM[i][0], b[1] - STREAM[i][1]), 0);
  const streamPath = sampled(STREAM, 2.5).filter((p) => Math.hypot(p.x - POOL.x, p.z - POOL.z) > PR - 4.5 || p.s > 40);
  const s0 = streamPath[0].s;
  const sNoise = (p) => 0.85 + 0.3 * Math.sin(p.s * 0.09) * Math.sin(p.s * 0.023 + 1);
  const stream = ribbon(streamPath, 7.5, 11, flowMat, {
    level: (p) => { const lv = streamLevel(streamAt(p.x, p.z).s); return lv + (POOL.level - 0.03 - lv) * Math.exp(-(p.s - s0) / 14); },
    speed: (p, a) => 1.3 * (1 - 0.7 * a * a) * sNoise(p),
    foam: (p, a) => 0.06 + 0.1 * smooth(0.5, 1, a),
    fade: (p) => smooth(PR - 4, PR, Math.hypot(p.x - POOL.x, p.z - POOL.z)) * (1 - smooth(SL - 12, SL, p.s)),
  });
  scene.add(stream);

  // the river over the plateau, running down to the brink, quickening, whitening and dipping as
  // it goes over (ending short of the plateau's back edge)
  const riverPath = sampled(RIVER, 2).filter((p) => p.x >= BRINK_X - 0.2 && p.x < 808);
  riverPath[0].x = BRINK_X;
  const toBrink = (p) => Math.max(0, p.x - BRINK_X);
  const river = ribbon(riverPath, 6.5, 11, flowMat, {
    dir: -1,
    level: (p) => riverLevel(riverAt(p.x, p.z).s) - 0.12 * (1 - smooth(0, 5, toBrink(p))),
    speed: (p, a) => (0.9 + 2.7 * Math.exp(-toBrink(p) / 5)) * (1 - 0.65 * a * a),
    foam: (p, a) => 0.08 + 0.55 * Math.exp(-toBrink(p) / 3.5) + 0.12 * smooth(0.5, 1, a),
    fade: (p) => 1 - smooth(790, 808, p.x),
  });
  scene.add(river);

  const fall = fallsMesh(L, U.wTime);
  fall.material.uniforms.time = U.wTime;
  scene.add(fall);

  // ------------------------------------------------ what's thrown about
  const drops = new Points(scene, lite ? 700 : 1800, L, false);
  const flecks = new Points(scene, lite ? 160 : 320, L, true);
  const mist = new Billows(scene, lite ? 110 : 260, L);
  const FLECK = { pool: 0, stream: 1, river: 2 };   // what each fleck rides (its k[0]); k[1] is its place across
  const foot = new THREE.Vector3(FOOT_X, POOL.level + 0.2, FALLS.z);
  const acc = { splash: 0, sheet: 0, brink: 0, boil: 0, column: 0, body: 0, haze: 0, pool: 0, stream: 0, river: 0 };
  const due = (k, rate, dt) => { acc[k] += rate * dt; const m = Math.floor(acc[k]); acc[k] -= m; return m; };
  const q = {};
  const pathAt = (path, s) => {   // a sampled path's point at length s
    const i = Math.max(0, Math.min(path.length - 2, Math.floor((s - path[0].s) / (path[1].s - path[0].s))));
    const a = path[i], b = path[i + 1], k = Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s || 1)));
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, y: a.y + (b.y - a.y) * k, tx: a.tx, tz: a.tz, banks: a.banks, s };
  };
  const fleckAt = (path, i, s, off) => {   // place fleck i at length s down a path, `off` across
    const p = pathAt(path, s);
    flecks.p.set([p.x - p.tz * off, p.y + 0.03, p.z + p.tx * off], i * 3);
    return p;
  };
  const spawnFleck = (path, kind, s, life) => {
    const p = pathAt(path, s), side = R() < 0.5 ? 0 : 1, off = (side ? 1 : -1) * Math.pow(R(), 1.5) * Math.max(0, p.banks[side] - 1) * 0.85;
    const i = flecks.add(0, 0, 0, 0, 0, 0, life, 0.1 + R() * 0.16, 0.55 + R() * 0.35);
    if (i < 0) return;
    flecks.v[i * 3] = s; flecks.k[i * 2] = kind; flecks.k[i * 2 + 1] = off;
    fleckAt(path, i, s, off);
  };

  return {
    pool, stream, river, fall, foot,
    update(dt, t, { camera, height, sun, hemi, day }) {
      // the light, as the world has it
      L.sunDir.value.copy(day.lightDir);
      L.sunCol.value.copy(sun.color).multiplyScalar(sun.intensity / Math.PI);
      L.amb.value.copy(hemi.color).lerp(hemi.groundColor, 0.3).multiplyScalar(hemi.intensity / Math.PI);
      const sky = hemi.intensity / Math.max(0.01, day.ambient * 1.15);   // (dark below ground)
      U.wSkyLo.value.copy(day.horizon).multiplyScalar(0.85 * sky); U.wSkyHi.value.copy(day.zenith).multiplyScalar(0.85 * sky);
      U.wTime.value = t % 3600;
      mist.mat.uniforms.bow.value = day.day * Math.min(1, sun.intensity);

      const cam = camera.position, near = Math.hypot(cam.x - FOOT_X, cam.z - FALLS.z) < 320 && cam.y > -8;
      drops.points.visible = mist.mesh.visible = near;
      // ---- the falls: spray thrown up at the foot, drops shed off the sheet and over the brink
      if (near) {
        for (let k = due('splash', lite ? 90 : 230, dt); k > 0; k--) {
          const a = Math.PI + (R() - 0.5) * 2.8, hs = 0.6 + R() * 3.8;
          drops.add(FOOT_X + (R() - 0.25) * 2.4, POOL.level + 0.1, FALLS.z + (R() - 0.5) * FOOT_W * 0.95,
            Math.cos(a) * hs, 1.5 + Math.pow(R(), 1.5) * 6.5, Math.sin(a) * hs, 3, 0.05 + R() * 0.11, 0.85);
        }
        for (let k = due('sheet', lite ? 30 : 80, dt); k > 0; k--) {
          const e = R(), u = e < 0.6 ? (R() < 0.5 ? R() * 0.1 : 1 - R() * 0.1) : R(), tt = FALL_T * (0.1 + 0.85 * R());
          fallAt(tt, u, q);
          const out = 0.3 + R() * 1.2;
          drops.add(q.x + q.nx * 0.35, q.y + q.ny * 0.35, q.z, -V0 + q.nx * out, -G * tt + q.ny * out, (u - 0.5) * 2.2, 4, 0.05 + R() * 0.08, 0.75);
        }
        for (let k = due('brink', lite ? 6 : 16, dt); k > 0; k--) {
          drops.add(BRINK_X - 0.2, TOP + 0.1, FALLS.z + (R() - 0.5) * fallWidth(0) * 0.9, -V0 - R() * 0.8, 0.4 + R() * 1.2, (R() - 0.5) * 0.8, 4, 0.04 + R() * 0.06, 0.7);
        }
        // ---- mist: a boil of it at the foot rolling out over the pool, more off the lower falls,
        // a thin haze lying on the water
        for (let k = due('boil', lite ? 12 : 26, dt); k > 0; k--) {
          const a = Math.PI + (R() - 0.5) * 2.6, hs = 1 + R() * 2.8;
          mist.add(FOOT_X - 0.5 - R() * 2, POOL.level + 0.5 + R() * 1.8, FALLS.z + (R() - 0.5) * FOOT_W,
            Math.cos(a) * hs, 0.5 + R() * 1.6, Math.sin(a) * hs, { life: 5 + R() * 3, size: 3 + R() * 2.4, grow: 1.3 + R() * 0.8, alpha: 0.32 + R() * 0.16 });
        }
        for (let k = due('column', lite ? 4 : 9, dt); k > 0; k--) {   // a cloud of spray standing up round the lower falls
          mist.add(FOOT_X - R() * 2.5, POOL.level + 1 + R() * 2, FALLS.z + (R() - 0.5) * FOOT_W * 1.1,
            -0.3 - R() * 0.8, 1.2 + R() * 1.6, (R() - 0.5) * 0.8, { life: 4 + R() * 2.5, size: 2.4 + R() * 1.6, grow: 1.4, alpha: 0.12 + R() * 0.08 });
        }
        for (let k = due('body', lite ? 3 : 7, dt); k > 0; k--) {
          fallAt(FALL_T * (0.45 + 0.5 * R()), R(), q);
          mist.add(q.x + q.nx * 1.2, q.y, q.z, q.nx * (0.6 + R() * 0.6), 0.2, (R() - 0.5) * 0.6, { life: 3 + R() * 2, size: 1.4 + R(), grow: 0.9, alpha: 0.1 + R() * 0.06 });
        }
        for (let k = due('haze', lite ? 1 : 2.5, dt); k > 0; k--) {
          const a = Math.PI + (R() - 0.5) * 2.6, d = 3 + R() * 16;
          mist.add(FOOT_X + Math.cos(a) * d, POOL.level + 0.7, FALLS.z + Math.sin(a) * d, -0.25 - R() * 0.3, 0.02, (R() - 0.5) * 0.3,
            { life: 9 + R() * 5, size: 4.5 + R() * 3, grow: 0.5, alpha: 0.05 + R() * 0.04 });
        }
        // ---- foam off the foot, riding out over the pool
        for (let k = due('pool', lite ? 3 : 6, dt); k > 0; k--) {
          const i = flecks.add(FOOT_X - 0.5 - R() * 3, POOL.level + 0.03, FALLS.z + (R() - 0.5) * FOOT_W, 0, 0, 0, 30 + R() * 20, 0.1 + R() * 0.18, 0.6 + R() * 0.35);
          if (i >= 0) flecks.k[i * 2] = FLECK.pool;
        }
        for (let k = due('river', lite ? 1.5 : 3, dt); k > 0; k--) spawnFleck(riverPath, FLECK.river, riverPath[0].s + 2 + R() * 60, 40);
      }
      // ---- flecks down the stream, near wherever you are along it
      const st = streamAt(cam.x, cam.z), sCam = st.s * SL;
      const onStream = st.d < 90 && cam.y > -8;
      if (onStream) for (let k = due('stream', lite ? 3 : 6, dt); k > 0; k--) {
        const s = Math.max(s0 + 2, Math.min(SL - 14, sCam - 60 + R() * 110));
        spawnFleck(streamPath, FLECK.stream, s, 50);
      }
      for (let i = 0; i < drops.n; i++) {   // the spray: thrown, slowed by the air, back into the water
        const j = i * 3, v = drops.v, p = drops.p;
        v[j + 1] -= 9.8 * dt;
        const damp = 1 - dt * 0.35;
        v[j] *= damp; v[j + 1] *= damp; v[j + 2] *= damp;
        p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
        if ((drops.age[i] += dt) > drops.life[i] || (p[j + 1] < POOL.level && v[j + 1] < 0)) { drops.kill(i); i--; }
      }
      for (let i = 0; i < flecks.n; i++) {   // the flecks: carried by the current
        const kind = flecks.k[i * 2], j = i * 3, p = flecks.p;
        let gone = (flecks.age[i] += dt) > flecks.life[i];
        if (!gone && kind === FLECK.pool) {
          const [fx, fz] = poolFlow(p[j], p[j + 2]);
          p[j] += fx * dt * 0.9; p[j + 2] += fz * dt * 0.9;
          const dp = Math.hypot(p[j] - POOL.x, p[j + 2] - POOL.z);
          if (dp > PR - 4) {   // out into the stream, or stranded on the shore
            if (Math.hypot(p[j] - OUT[0], p[j + 2] - OUT[1]) < 9) { flecks.k[i * 2] = FLECK.stream; flecks.v[j] = s0 + 1; flecks.k[i * 2 + 1] = (R() - 0.5) * 3; flecks.age[i] = 0; flecks.life[i] = 60; }
            else gone = true;
          } else if (POOL.level - terrainHeight(p[j], p[j + 2]) < 0.05) gone = true;
        } else if (!gone) {
          const path = kind === FLECK.stream ? streamPath : riverPath, off = flecks.k[i * 2 + 1];
          const a = Math.min(1, Math.abs(off) / 7);
          const speed = kind === FLECK.stream ? 1.3 * (1 - 0.7 * a * a) : (0.9 + 2.7 * Math.exp(-Math.max(0, p[j] - BRINK_X) / 5)) * (1 - 0.65 * a * a);
          const s = flecks.v[j] += speed * dt * (kind === FLECK.stream ? 1 : -1);
          if (kind === FLECK.river && s < riverPath[0].s + 0.3) {   // over the brink with it
            fallAt(0.05, 0.5 + off / fallWidth(0), q);
            drops.add(q.x, q.y, q.z, -V0, -0.4, 0, 4, 0.08, 0.75);
            gone = true;
          } else if (kind === FLECK.stream && (s > SL - 12 || Math.abs(s - sCam) > 110 || !onStream)) gone = true;
          else if (kind === FLECK.river && !near) gone = true;
          else fleckAt(path, i, s, off);
        }
        if (gone) { flecks.kill(i); i--; }
      }
      mist.update(dt, t);
      const scale = height / 2 * camera.projectionMatrix.elements[5];
      drops.upload(scale, t); flecks.upload(scale, t);
    },
  };
}
