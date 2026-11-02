// World effects that run on the GPU: the sky (sun, moon, stars and drifting clouds across a
// day and night), sunbeams through the cathedral's stained glass, graveyard mist, chimney
// smoke, scorch and frost marks, shockwave rings and lightning arcs.
//
// Under WebGPU (nodes.js WEBGPU) each shader here is a TSL node graph beside its GLSL, the same sums:
// one graph per class (there's one of each), its `uniforms` TSL uniforms the game sets through
// `.value` as before. Points are drawn as quads there (pointQuads, pointQuad: water.js and comet.js
// use them too).
import * as THREE from 'three';
import { WEBGPU, T } from './nodes.js';

const NOISE = /* glsl */`
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }`;

// ------------------------------------------------------------------ WebGPU: helpers
let _fx = null;
/** NOISE as TSL functions (WGSL functions of their own): hash2, vnoise (the same as water.js's fn), fbm. */
export function fxNoise() {
  if (_fx) return _fx;
  const { Fn, vec2, float, fract, sin, dot, floor, mix } = T;
  const hash2 = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)))
    .setLayout({ name: 'fxHash2', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
  const vnoise = Fn(([p]) => {
    const i = floor(p).toVar(), f0 = fract(p).toVar(), f = f0.mul(f0).mul(f0.mul(-2.0).add(3.0)).toVar();
    return mix(mix(hash2(i), hash2(i.add(vec2(1, 0))), f.x), mix(hash2(i.add(vec2(0, 1))), hash2(i.add(vec2(1, 1))), f.x), f.y);
  }).setLayout({ name: 'fxNoise', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
  const fbm = Fn(([p0]) => {
    const p = vec2(p0).toVar(), s = float(0).toVar();
    for (let i = 0, a = 0.5; i < 5; i++, a *= 0.5) { s.addAssign(vnoise(p).mul(a)); p.assign(p.mul(2.03).add(7.1)); }
    return s;
  }).setLayout({ name: 'fxFbm', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
  return (_fx = { hash2, vnoise, fbm });
}

/** GLSL's smoothstep(a, b, x) with a > b (falling), which WGSL leaves undefined: 1 - smoothstep(b, a, x). */
export const fall = (a, b, x) => T.smoothstep(b, a, x).oneMinus();

/** A TSL uniform that changes from frame to frame, read once per render (not per object: static
 * objects stop refreshing theirs). */
export const live = (v) => T.uniform(v).setGroup(T.renderGroup);

/** A NodeMaterial with these material settings (and fog off unless asked: GLSL ShaderMaterials
 * have none by default). */
export function nodeMaterial(params) {
  const m = new THREE.NodeMaterial();
  m.fog = false;
  m.setValues(params);
  return m;
}

/** Under WebGPU, where a point is drawn a pixel wide: `g` (a THREE.Points geometry) as quads, an
 * instance of one per point. Its attributes are the same arrays, per instance, so the code that fills
 * them and flags needsUpdate goes on as before, and setDrawRange(0, n) draws the first n. Draw it as a
 * Mesh whose material's vertexNode is pointQuad()'s. */
export function pointQuads(g) {
  const q = new THREE.InstancedBufferGeometry(), n = g.attributes.position.count;
  q.setIndex([0, 1, 2, 0, 2, 3]);
  q.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
  for (const [k, a] of Object.entries(g.attributes)) q.setAttribute(k, new THREE.InstancedBufferAttribute(a.array, a.itemSize).setUsage(a.usage));
  q.instanceCount = n;
  q.boundingSphere = g.boundingSphere ? g.boundingSphere.clone() : new THREE.Sphere(new THREE.Vector3(), 1e5);
  q.setDrawRange = (start, count) => { q.instanceCount = Math.max(0, Math.min(count, n)); return q; };
  return q;
}

/** The vertex stage of a point drawn as a quad (pointQuads): its clip position, `px` pixels across
 * (a node, as gl_PointSize was), and `coord`, gl_PointCoord's like (0..1, y down) for the fragment. */
export function pointQuad(px) {
  const { Fn, vec2, vec4, attribute, positionView, cameraProjectionMatrix, screenSize } = T;
  const corner = attribute('corner', 'vec2');
  const vertex = Fn(() => {
    const clip = cameraProjectionMatrix.mul(vec4(positionView, 1.0)).toVar();
    return clip.add(vec4(corner.mul(px).div(screenSize).mul(clip.w), 0.0, 0.0));
  })();
  return { vertex, coord: vec2(corner.x.mul(0.5).add(0.5), corner.y.mul(-0.5).add(0.5)) };
}

/** What the game's point `scale` uniforms hold ((height / 2) * projectionMatrix[5]), from the picture
 * being drawn and its camera (so it's right however big the picture is). */
export function pointScale() {
  return T.screenSize.y.mul(0.5).mul(T.cameraProjectionMatrix.mul(T.vec4(0, 1, 0, 0)).y);
}

/** Times of day: 0..24. The palette the sky, sun, ambient light and fog all follow. */
const KEYS = [ // hour, zenith, horizon, sun colour, sun power, ambient, fog
  [0, 0x03050c, 0x0b1020, 0x9ab0ff, 0.30, 0.3, 0x0a0e18],
  [4.8, 0x05081a, 0x18182c, 0x9ab0ff, 0.25, 0.3, 0x141626],
  [6.0, 0x2a3a6a, 0xe08a5a, 0xff9a5a, 1.0, 0.6, 0x8a7068],
  [7.5, 0x3d6aa8, 0xc8c8c0, 0xffd8a8, 2.0, 0.8, 0xa8b0b8],
  [12, 0x3a6eb0, 0xbcd0e2, 0xfff4e4, 2.5, 1.0, 0xb0bfcc],
  [16.5, 0x3a64a4, 0xc8c4b8, 0xffe0b0, 2.3, 1.0, 0xb0b4b4],
  [18.2, 0x2a3466, 0xf09050, 0xff8a40, 1.6, 0.78, 0x9a6a58],
  [19.4, 0x0c1030, 0x3a2a40, 0xff6a40, 0.4, 0.4, 0x2a2232],
  [21, 0x03050c, 0x0b1020, 0x9ab0ff, 0.30, 0.3, 0x0a0e18],
  [24, 0x03050c, 0x0b1020, 0x9ab0ff, 0.30, 0.3, 0x0a0e18],
];
const _a = new THREE.Color(), _b = new THREE.Color();
export function dayState(hour) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= hour) i++;
  const [h0, ...A] = KEYS[i], [h1, ...B] = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (hour - h0) / (h1 - h0)));
  const mix = (k) => _a.setHex(A[k]).lerp(_b.setHex(B[k]), t).clone();
  // the sun climbs from the east at 6 to the south at noon and sets in the west at 18;
  // the moon runs opposite
  const a = (hour - 12) / 12 * Math.PI;
  const el = Math.asin(Math.cos(a) * Math.sin(1.08));
  const sunDir = new THREE.Vector3(-Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el) * 0.6 + 0.25).normalize();
  const moonDir = new THREE.Vector3(-sunDir.x, Math.abs(sunDir.y) * 0.8 + 0.25, -sunDir.z).normalize();
  const day = THREE.MathUtils.smoothstep(sunDir.y, -0.08, 0.12);
  return {
    zenith: mix(0), horizon: mix(1), sunColor: mix(2), sunPower: A[3] + (B[3] - A[3]) * t,
    ambient: A[4] + (B[4] - A[4]) * t, fog: mix(5), sunDir, moonDir, day,
    lightDir: day > 0.02 ? sunDir : moonDir,
  };
}

export class Sky {
  constructor(scene) {
    this.uniforms = WEBGPU ? {
      zenith: live(new THREE.Color()), horizon: live(new THREE.Color()),
      sunDir: live(new THREE.Vector3(0, 1, 0)), moonDir: live(new THREE.Vector3(0, 1, 0)),
      sunColor: live(new THREE.Color()), day: live(1), time: live(0), dim: live(1),
    } : {
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() }, day: { value: 1 }, time: { value: 0 }, dim: { value: 1 },
    };
    const m = WEBGPU ? skyMaterial(this.uniforms) : new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uniforms,
      vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: /* glsl */`
        uniform vec3 zenith, horizon, sunColor, sunDir, moonDir; uniform float day, time, dim;
        varying vec3 vP;
        ${NOISE}
        void main() {
          vec3 d = normalize(vP);
          float h = max(d.y, 0.0);
          vec3 c = mix(horizon, zenith, pow(smoothstep(-0.02, 0.6, d.y), 0.7));
          // the sun's glow, wider and redder near the horizon
          float sd = max(dot(d, sunDir), 0.0);
          c += sunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 64.0) * 0.6) * (0.4 + 0.6 * day);
          c += sunColor * smoothstep(0.9993, 0.9997, sd) * 6.0;              // the disc
          float md = max(dot(d, moonDir), 0.0);
          c += vec3(0.85, 0.9, 1.0) * smoothstep(0.9990, 0.9994, md) * 2.5 * (1.0 - day);
          c += vec3(0.4, 0.5, 0.8) * pow(md, 24.0) * 0.12 * (1.0 - day);
          // stars: hashed points on a grid of directions, twinkling
          vec2 sp = vec2(atan(d.z, d.x), asin(d.y)) * 140.0;
          vec2 cell = floor(sp), f = fract(sp) - 0.5;
          float hs = hash2(cell);
          float st = step(0.985, hs) * step(length(f), 0.28) * smoothstep(0.04, 0.3, d.y);
          float night = pow(1.0 - day, 3.0);
          c += vec3(0.9, 0.95, 1.0) * st * night * (0.55 + 0.45 * sin(time * 2.0 + hs * 60.0)) * (1.0 + 2.0 * fract(hs * 91.0));
          // clouds: a moving fbm layer projected on a dome
          if (d.y > 0.0) {
            vec2 cp = d.xz / (d.y + 0.12) * 1.6 + vec2(time * 0.012, time * 0.004);
            float n = fbm(cp);
            float cov = smoothstep(0.48, 0.78, n);
            vec3 lit = mix(vec3(0.16, 0.17, 0.24), vec3(1.0), day) * (0.75 + 0.35 * sunColor * pow(sd, 3.0));
            vec3 cc = mix(lit * 0.55, lit, smoothstep(0.5, 0.9, fbm(cp + sunDir.xz * 0.08)));
            c = mix(c, cc * mix(horizon, vec3(1.0), 0.5 + 0.5 * day), cov * smoothstep(0.0, 0.18, d.y) * 0.9);
          }
          c = mix(c, horizon * 0.7, smoothstep(0.0, -0.25, d.y)); // below the horizon
          gl_FragColor = vec4(c * dim, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), m);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(state, t, camPos, dim) {
    const u = this.uniforms;
    u.zenith.value.copy(state.zenith); u.horizon.value.copy(state.horizon);
    u.sunColor.value.copy(state.sunColor); u.sunDir.value.copy(state.sunDir); u.moonDir.value.copy(state.moonDir);
    u.day.value = state.day; u.time.value = t; u.dim.value = dim;
    this.mesh.position.copy(camPos);
  }
}

/** The sky's shader in TSL (u: Sky's uniforms). */
function skyMaterial(u) {
  const { Fn, If, vec2, vec3, vec4, float, normalize, mix, pow, smoothstep, max, dot, atan, asin, clamp, floor, fract, step, length, sin,
    positionGeometry, positionLocal, modelViewMatrix, cameraProjectionMatrix } = T;
  const { hash2, fbm } = fxNoise();
  const { zenith, horizon, sunColor, sunDir, moonDir, day, time, dim } = u;
  // on the far plane wherever it is
  const vertex = Fn(() => {
    const c = cameraProjectionMatrix.mul(modelViewMatrix.mul(vec4(positionGeometry, 1.0))).toVar();
    return vec4(c.x, c.y, c.w, c.w);
  })();
  const fragment = Fn(() => {
    const d = normalize(positionLocal).toVar();
    const c = mix(horizon, zenith, pow(smoothstep(-0.02, 0.6, d.y), 0.7)).toVar();
    // the sun's glow, wider and redder near the horizon
    const sd = max(dot(d, sunDir), 0.0).toVar();
    c.addAssign(sunColor.mul(pow(sd, 6.0).mul(0.35).add(pow(sd, 64.0).mul(0.6))).mul(day.mul(0.6).add(0.4)));
    c.addAssign(sunColor.mul(smoothstep(0.9993, 0.9997, sd)).mul(6.0));              // the disc
    const md = max(dot(d, moonDir), 0.0).toVar();
    c.addAssign(vec3(0.85, 0.9, 1.0).mul(smoothstep(0.9990, 0.9994, md)).mul(2.5).mul(day.oneMinus()));
    c.addAssign(vec3(0.4, 0.5, 0.8).mul(pow(md, 24.0)).mul(0.12).mul(day.oneMinus()));
    // stars: hashed points on a grid of directions, twinkling ((asin's argument kept in range: a NaN
    // at the zenith would bloom into a black box)
    const sp = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0))).mul(140.0).toVar();
    const cell = floor(sp), f = fract(sp).sub(0.5);
    const hs = hash2(cell).toVar();
    const st = step(0.985, hs).mul(step(length(f), 0.28)).mul(smoothstep(0.04, 0.3, d.y));
    const night = pow(day.oneMinus(), 3.0);
    c.addAssign(vec3(0.9, 0.95, 1.0).mul(st).mul(night).mul(sin(time.mul(2.0).add(hs.mul(60.0))).mul(0.45).add(0.55)).mul(fract(hs.mul(91.0)).mul(2.0).add(1.0)));
    // clouds: a moving fbm layer projected on a dome
    If(d.y.greaterThan(0.0), () => {
      const cp = d.xz.div(d.y.add(0.12)).mul(1.6).add(vec2(time.mul(0.012), time.mul(0.004))).toVar();
      const cov = smoothstep(0.48, 0.78, fbm(cp));
      const lit = mix(vec3(0.16, 0.17, 0.24), vec3(1.0), day).mul(sunColor.mul(pow(sd, 3.0)).mul(0.35).add(0.75)).toVar();
      const cc = mix(lit.mul(0.55), lit, smoothstep(0.5, 0.9, fbm(cp.add(sunDir.xz.mul(0.08)))));
      c.assign(mix(c, cc.mul(mix(horizon, vec3(1.0), day.mul(0.5).add(0.5))), cov.mul(smoothstep(0.0, 0.18, d.y)).mul(0.9)));
    });
    c.assign(mix(c, horizon.mul(0.7), fall(0.0, -0.25, d.y)));   // below the horizon
    return vec4(c.mul(dim), float(1.0));
  })();
  const m = nodeMaterial({ side: THREE.BackSide, depthWrite: false });
  m.vertexNode = vertex; m.fragmentNode = fragment;
  m.uniforms = u;
  return m;
}

/** Light pouring through the cathedral's stained glass: prisms swept from each window along
 * the sun's direction, brightest at the glass, fading as they cross the nave. */
export class Shafts {
  constructor(scene, windows) { // windows: [{x, y, z, w, h, normal: [nx, 0, nz] (pointing in), color}]
    this.windows = windows;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mat = WEBGPU ? shaftsMaterial() : new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, power: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec2 st; attribute vec3 tint; varying vec2 vSt; varying vec3 vTint; varying vec3 vW;
        void main() { vSt = st; vTint = tint; vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float time, power; varying vec2 vSt; varying vec3 vTint; varying vec3 vW;
        ${NOISE}
        void main() {
          float along = vSt.x, across = vSt.y;
          float a = (1.0 - along) * (1.0 - along) * smoothstep(0.0, 0.25, across) * smoothstep(1.0, 0.75, across);
          a *= 0.7 + 0.3 * vnoise(vec2(vW.x * 1.5 + time * 0.2, vW.y * 1.5 + vW.z * 0.7));  // drifting dust
          gl_FragColor = vec4(vTint * a * power * 0.16, 1.0);
        }`,
    });
    this.lastDir = new THREE.Vector3();
  }

  update(state, t, visible) {
    this.mat.uniforms.time.value = t;
    const p = visible ? state.day * Math.max(0, Math.min(1, state.sunDir.y * 3)) : 0;
    this.mat.uniforms.power.value = p;
    this.group.visible = p > 0.01;
    if (!this.group.visible || this.lastDir.distanceTo(state.sunDir) < 0.01) return;
    this.lastDir.copy(state.sunDir);
    this.group.clear();
    const travel = state.sunDir.clone().negate(); // the direction the light moves
    const pos = [], st = [], tint = [];
    for (const w of this.windows) {
      const n = new THREE.Vector3(...w.normal);
      if (travel.dot(n) <= 0.05) continue; // the sun is on the other side
      const len = Math.min(28, 10 / Math.max(0.2, -travel.y));
      const right = new THREE.Vector3(-n.z, 0, n.x);
      const c = new THREE.Vector3(w.x, w.y, w.z);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) =>
        c.clone().addScaledVector(right, a * w.w / 2).add(new THREE.Vector3(0, b * w.h / 2, 0)));
      const far = corners.map((q) => q.clone().addScaledVector(travel, len));
      const col = new THREE.Color(w.color);
      for (let e = 0; e < 4; e++) { // four sides of the prism
        const a0 = corners[e], a1 = corners[(e + 1) % 4], b0 = far[e], b1 = far[(e + 1) % 4];
        for (const [q, s] of [[a0, [0, 0]], [a1, [0, 1]], [b1, [1, 1]], [a0, [0, 0]], [b1, [1, 1]], [b0, [1, 0]]]) {
          pos.push(q.x, q.y, q.z); st.push(...s); tint.push(col.r, col.g, col.b);
        }
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('st', new THREE.Float32BufferAttribute(st, 2));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
    const m = new THREE.Mesh(g, this.mat);
    m.frustumCulled = false;
    this.group.add(m);
  }
}

/** The shafts' shader in TSL. */
function shaftsMaterial() {
  const { Fn, vec2, vec4, smoothstep, attribute, positionLocal } = T;
  const { vnoise } = fxNoise();
  const time = live(0), power = live(0);
  const st = attribute('st', 'vec2'), tint = attribute('tint', 'vec3');
  const fragment = Fn(() => {
    const along = st.x, across = st.y, vW = positionLocal;
    const a = along.oneMinus().mul(along.oneMinus()).mul(smoothstep(0.0, 0.25, across)).mul(fall(1.0, 0.75, across)).toVar();
    a.mulAssign(vnoise(vec2(vW.x.mul(1.5).add(time.mul(0.2)), vW.y.mul(1.5).add(vW.z.mul(0.7)))).mul(0.3).add(0.7));   // drifting dust
    return vec4(tint.mul(a).mul(power).mul(0.16), 1.0);
  })();
  const m = nodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.fragmentNode = fragment;
  m.uniforms = { time, power };
  return m;
}

/** Low drifting mist: a few stacked sheets with noise in them, lit by the sky. */
export class Mist {
  constructor(scene, rect, { layers = 4, base = 0.12, height = 1.1, color = 0xc8d0d8, density = 0.22, exclude = [] } = {}) {
    this.uniforms = WEBGPU ? { time: live(0), color: T.uniform(new THREE.Color(color)), light: live(1), density: T.uniform(density) }
      : { time: { value: 0 }, color: { value: new THREE.Color(color) }, light: { value: 1 }, density: { value: density } };
    const [x0, z0, x1, z1] = rect;
    const m = WEBGPU ? mistMaterial(this.uniforms, rect, exclude) : new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: this.uniforms, fog: false,
      vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */`
        uniform float time, light, density; uniform vec3 color; varying vec3 vW;
        ${NOISE}
        void main() {
          float n = fbm(vW.xz * 0.08 + vec2(time * 0.03, time * 0.017) + vW.y * 3.0);
          float a = smoothstep(0.35, 0.8, n) * density;
          vec2 e = min(vW.xz - vec2(${x0.toFixed(1)}, ${z0.toFixed(1)}), vec2(${x1.toFixed(1)}, ${z1.toFixed(1)}) - vW.xz);
          a *= smoothstep(0.0, 10.0, min(e.x, e.y));
          // a sheet seen edge-on fades: no hard line where the top layers run off to the horizon
          vec3 v = vW - cameraPosition;
          a *= smoothstep(0.0, 0.14, abs(v.y) / max(length(v), 1e-3));
          // and close by it goes: a flat sheet cuts a hard white line across whatever stands in it (a
          // headstone, a trunk, the dead), plainest near the eye; there the ground mist is enough
          a *= smoothstep(4.0, 16.0, length(v));
          ${exclude.map(([a0, b0, a1, b1]) => `if (vW.x > ${a0.toFixed(1)} && vW.x < ${a1.toFixed(1)} && vW.z > ${b0.toFixed(1)} && vW.z < ${b1.toFixed(1)}) a = 0.0;`).join(' ')}
          gl_FragColor = vec4(color * light, a);
        }`,
    });
    this.group = new THREE.Group();
    for (let i = 0; i < layers; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m);
      p.rotation.x = -Math.PI / 2;
      p.position.set((x0 + x1) / 2, base + (i / Math.max(1, layers - 1)) * height, (z0 + z1) / 2);
      p.renderOrder = 3;
      this.group.add(p);
    }
    scene.add(this.group);
  }

  update(t, light) { this.uniforms.time.value = t; this.uniforms.light.value = light; }
}

/** The mist's shader in TSL (u: Mist's uniforms; its box and the rooms it keeps out of baked in, to
 * a tenth of a metre as the GLSL has them). */
function mistMaterial(u, [x0, z0, x1, z1], exclude) {
  const { Fn, vec2, vec4, float, smoothstep, min, max, abs, length, select, positionWorld, cameraPosition } = T;
  const { fbm } = fxNoise();
  const r = (v) => Number(v.toFixed(1));
  const { time, color, light, density } = u;
  const fragment = Fn(() => {
    const vW = positionWorld;
    const n = fbm(vW.xz.mul(0.08).add(vec2(time.mul(0.03), time.mul(0.017))).add(vW.y.mul(3.0)));
    const a = smoothstep(0.35, 0.8, n).mul(density).toVar();
    const e = min(vW.xz.sub(vec2(r(x0), r(z0))), vec2(r(x1), r(z1)).sub(vW.xz));
    a.mulAssign(smoothstep(0.0, 10.0, min(e.x, e.y)));
    // a sheet seen edge-on fades: no hard line where the top layers run off to the horizon
    const v = vW.sub(cameraPosition);
    a.mulAssign(smoothstep(0.0, 0.14, abs(v.y).div(max(length(v), 1e-3))));
    // and close by it goes: no hard white line across what stands in it (as the GLSL)
    a.mulAssign(smoothstep(4.0, 16.0, length(v)));
    for (const [a0, b0, a1, b1] of exclude) {
      a.assign(select(vW.x.greaterThan(r(a0)).and(vW.x.lessThan(r(a1))).and(vW.z.greaterThan(r(b0))).and(vW.z.lessThan(r(b1))), float(0.0), a));
    }
    return vec4(color.mul(light), a);
  })();
  const m = nodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.fragmentNode = fragment;
  m.uniforms = u;
  return m;
}

/** Soft, normally blended puffs: chimney smoke, spell smoke, dust. */
export class Smoke {
  constructor(scene, max = 600) {
    this.max = max;
    this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.data = new Float32Array(max * 4); // size, alpha, shade, unused
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pdata', new THREE.BufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = WEBGPU ? pointQuads(g) : g;
    this.mat = WEBGPU ? smokeMaterial() : new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { scale: { value: 300 }, light: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: /* glsl */`
        attribute vec4 pdata; uniform float scale; varying vec2 vA; varying float vT;
        void main() { vA = pdata.yz; vT = pdata.w; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = pdata.x * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        uniform vec3 light; varying vec2 vA; varying float vT;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float d = length(q) * 2.0;
          if (d > 1.0) discard;
          // a soft lumpy puff: radial falloff broken up by a few lobes
          float lobes = 0.82 + 0.18 * sin(atan(q.y, q.x) * 5.0 + vA.y * 17.0);
          float a = vA.x * smoothstep(1.0, 0.15, d / lobes);
          // a tint (pdata.w): 1 plague green, 2 arcane violet, 3 frost blue
          vec3 tint = vT < 0.5 ? vec3(1.0) : vT < 1.5 ? vec3(0.62, 1.0, 0.32) : vT < 2.5 ? vec3(0.75, 0.45, 1.0) : vec3(0.7, 0.88, 1.15);
          gl_FragColor = vec4(light * vA.y * tint, a * 0.8);
        }`,
    });
    this.points = WEBGPU ? new THREE.Mesh(this.geo, this.mat) : new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    this.emitters = [];
  }

  emit(p, v, { life = 4, size = 0.6, grow = 1.2, alpha = 0.35, shade = 0.55, tint = 0 } = {}) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ p: p.clone(), v: v.clone(), age: 0, life, size, grow, alpha, shade, tint });
  }

  addEmitter(x, y, z, rate = 3) { this.emitters.push({ p: new THREE.Vector3(x, y, z), rate, acc: Math.random() }); }

  update(dt, camera, height, light) {
    for (const e of this.emitters) {
      e.acc += dt * e.rate;
      while (e.acc > 1) {
        e.acc -= 1;
        this.emit(e.p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)),
          new THREE.Vector3(0.35 + Math.random() * 0.2, 0.9 + Math.random() * 0.4, 0.15), { life: 6, size: 0.7, grow: 0.9, alpha: 0.3 });
      }
    }
    const live = [];
    for (const s of this.list) {
      s.age += dt;
      if (s.age < s.life) { s.p.addScaledVector(s.v, dt); s.v.multiplyScalar(1 - dt * 0.15); live.push(s); }
    }
    this.list = live;
    live.forEach((s, i) => {
      this.pos.set([s.p.x, s.p.y, s.p.z], i * 3);
      const k = s.age / s.life;
      this.data.set([s.size + s.grow * s.age, s.alpha * Math.min(1, s.age * 4) * (1 - k), s.shade, s.tint || 0], i * 4);
    });
    this.geo.setDrawRange(0, live.length);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pdata.needsUpdate = true;
    this.mat.uniforms.scale.value = height / 2 * camera.projectionMatrix.elements[5];
    this.mat.uniforms.light.value.setScalar(light);
  }
}

/** The smoke's shader in TSL: its puffs as quads (pointQuads), as big as the GLSL's points (its
 * `scale` worked out from the picture: pointScale). */
function smokeMaterial() {
  const { Fn, vec3, vec4, length, sin, atan, smoothstep, select, attribute, positionView, Discard } = T;
  const light = live(new THREE.Color(1, 1, 1));
  const pdata = attribute('pdata', 'vec4');
  const { vertex, coord } = pointQuad(pdata.x.mul(pointScale()).div(positionView.z.negate()));
  const fragment = Fn(() => {
    const vA = pdata.yz, vT = pdata.w;
    const q = coord.sub(0.5).toVar();
    const d = length(q).mul(2.0).toVar();
    Discard(d.greaterThan(1.0));
    // a soft lumpy puff: radial falloff broken up by a few lobes
    const lobes = sin(atan(q.y, q.x).mul(5.0).add(vA.y.mul(17.0))).mul(0.18).add(0.82);
    const a = vA.x.mul(fall(1.0, 0.15, d.div(lobes)));
    // a tint (pdata.w): 1 plague green, 2 arcane violet, 3 frost blue
    const tint = select(vT.lessThan(0.5), vec3(1.0), select(vT.lessThan(1.5), vec3(0.62, 1.0, 0.32), select(vT.lessThan(2.5), vec3(0.75, 0.45, 1.0), vec3(0.7, 0.88, 1.15))));
    return vec4(light.mul(vA.y).mul(tint), a.mul(0.8));
  })();
  const m = nodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.vertexNode = vertex; m.fragmentNode = fragment;
  m.uniforms = { scale: { value: 300 }, light };   // (scale: set by the game as before, not read here)
  return m;
}

function radialTexture(draw, n = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  draw(c.getContext('2d'), n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Marks spells leave on walls and floors (scorch, frost, rune circles), fading away. */
export class Decals {
  constructor(scene, max = 48) {
    this.scene = scene;
    this.max = max;
    this.list = [];
    const blot = (inner, outer) => radialTexture((g, n) => {
      for (let y = 0; y < n; y += 2) for (let x = 0; x < n; x += 2) {
        const d = Math.hypot(x - n / 2, y - n / 2) / (n / 2) + (Math.random() - 0.5) * 0.25;
        if (d > 1) continue;
        g.fillStyle = d < 0.55 ? inner : outer;
        g.globalAlpha = Math.min(1, (1 - d) * 2.2);
        g.fillRect(x, y, 2, 2);
      }
    });
    this.tex = {
      scorch: blot('#0a0604', '#2a1a10'),
      frost: blot('#f0faff', '#9ad0ff'),
      rune: radialTexture((g, n) => {
        g.strokeStyle = '#d8ffb0'; g.lineWidth = 2; g.fillStyle = '#d8ffb0';
        for (const r of [0.46, 0.36]) { g.beginPath(); g.arc(n / 2, n / 2, r * n, 0, Math.PI * 2); g.stroke(); }
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2;
          g.fillRect(n / 2 + Math.cos(a) * 0.41 * n - 1.5, n / 2 + Math.sin(a) * 0.41 * n - 1.5, 3, 3);
        }
        g.beginPath();
        for (let i = 0; i <= 5; i++) { const a = i * 4 / 5 * Math.PI - Math.PI / 2; g.lineTo(n / 2 + Math.cos(a) * 0.33 * n, n / 2 + Math.sin(a) * 0.33 * n); }
        g.stroke();
      }, 128),
    };
  }

  add(kind, p, normal, size, { life = 25, glow = false, spin = 0, color = null } = {}) {
    const m = new THREE.MeshBasicMaterial({ map: this.tex[kind], transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending, color: color || (glow ? new THREE.Color(2, 2, 2) : 0xffffff) });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    q.position.copy(p).addScaledVector(normal, 0.02);
    q.lookAt(p.clone().add(normal));
    q.rotateZ(Math.random() * Math.PI * 2);
    q.renderOrder = 2;
    this.scene.add(q);
    this.list.push({ q, age: 0, life, spin });
    if (this.list.length > this.max) this.remove(this.list.shift());
    return q;
  }

  remove(d) { this.scene.remove(d.q); d.q.geometry.dispose(); d.q.material.dispose(); }

  update(dt) {
    this.list = this.list.filter((d) => {
      d.age += d.life ? dt : 0;
      d.q.rotateZ(d.spin * dt);
      const k = d.age / d.life;
      d.q.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      if (k >= 1) { this.remove(d); return false; }
      return true;
    });
  }
}

/** Expanding shockwave rings and spheres for bursts. */
export class Waves {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 48, 1);
    this.sphereGeo = new THREE.IcosahedronGeometry(1, 3);
  }

  add(p, normal, color, { size = 3, life = 0.45, sphere = false } = {}) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, wireframe: sphere });
    const w = new THREE.Mesh(sphere ? this.sphereGeo : this.ringGeo, m);
    w.position.copy(p).addScaledVector(normal || new THREE.Vector3(), 0.05);
    if (normal && !sphere) w.lookAt(p.clone().add(normal));
    w.scale.setScalar(0.1);
    this.scene.add(w);
    this.list.push({ w, age: 0, life, size });
  }

  update(dt) {
    this.list = this.list.filter((o) => {
      o.age += dt;
      const k = o.age / o.life;
      o.w.scale.setScalar(0.1 + o.size * (1 - (1 - k) * (1 - k)));
      o.w.material.opacity = 1 - k;
      if (k >= 1) { this.scene.remove(o.w); o.w.material.dispose(); return false; }
      return true;
    });
  }
}

/** Jagged lightning: line strips re-rolled every few frames between two points. */
export class Arcs {
  constructor(scene, max = 24) {
    this.max = max;
    this.seg = 10;
    this.pos = new Float32Array(max * this.seg * 2 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = g;
    this.mat = new THREE.LineBasicMaterial({ color: new THREE.Color(2.4, 2.2, 3.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
    scene.add(this.lines);
    this.list = [];
  }

  add(a, b, life = 0.12, jag = 0.25) { this.list.push({ a: a.clone(), b: b.clone(), age: 0, life, jag }); if (this.list.length > this.max) this.list.shift(); }

  update(dt) {
    this.list = this.list.filter((o) => (o.age += dt) < o.life);
    let k = 0;
    const d = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3();
    for (const o of this.list) {
      d.subVectors(o.b, o.a);
      const len = d.length();
      q.copy(o.a);
      for (let s = 1; s <= this.seg; s++) {
        p.copy(o.a).addScaledVector(d, s / this.seg);
        if (s < this.seg) p.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(len * o.jag));
        this.pos.set([q.x, q.y, q.z, p.x, p.y, p.z], k); k += 6;
        q.copy(p);
      }
    }
    this.geo.setDrawRange(0, k / 3);
    this.geo.attributes.position.needsUpdate = true;
  }
}
