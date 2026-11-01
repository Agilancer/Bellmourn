// Slimes: living jelly, in the three caves of the cliff and in a few wet places out in the world.
//
// Nine kinds (SPECIES), each its own colour and its own way of getting about:
//   hop    the mire, crimson, blight and ossuary slimes: crouch, spring, land in a heap and shiver;
//          close to you they pounce, high, and come down on you
//   ooze   the bog, amber and pitch slimes: pour along the ground in surges, rear back and throw
//          themselves forward; the big ones close over you and hold you
//   cling  the azure jellies and the gloom slimes: fling themselves at walls, cliffs, tree trunks
//          and the roofs of the caves and stick there, flattened; from a wall they leap at you
//          (or on to the next wall), from a roof they creep along until they're over you and drop
//          (a drip of goo and a shadow on the floor give them away first)
// They are see-through: what's in them shows (a darker heart, bubbles, sticks, a bone or two, a
// skull). No faces. Some of the big ones come apart into a handful of small ones of the same
// colour when they die; every one of them bursts: sparks and motes of its colour, goo flung over
// everything, chunks of jelly that slither and melt, a ring, a flash and a splash on whatever it
// was stuck to (dripping off a roof a while after). Wherever they go they leave it wet: the oozes a
// glistening trail behind them, the hoppers a print where they take off and land and drips between,
// the clingers a smear across the roofs they creep along.
//
// They answer everything the dead answer: zombies.js hands its blows, blasts and noises on to them
// (Zombies.kin), and each slime has the dead's hooks (ray, capsules, hit, harm, freeze, chill,
// ignite, poison, shove, knock, stagger) so blades, the shield, the staff and every spell work.
// The body is one shape per kind of movement (a lathe), deformed in the vertex shader: squash and
// stretch (volume kept), the top leaning behind the base, a wobble, ripples from the base, a dent
// where it was struck and the swell before it pops. Its springs live here, per slime.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { POOL, REGION, streamAt, streamLevel } from './terrain.js';

const UP = new THREE.Vector3(0, 1, 0);
const GRAV = 16;                 // (heavier than the world's: a slime's hop is quick and snappy)
const WHITE = new THREE.Color(1, 1, 1);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3(), _h = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _col = new THREE.Color();
const ROCK = {};                 // (cave.rockAt's answer, reused)
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const rnd = (v = new THREE.Vector3()) => { do v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1); while (v.lengthSq() > 1 || v.lengthSq() < 1e-4); return v.normalize(); };

// ------------------------------------------------------------------ what they are
/** R: the base's radius (m); hp, the blow a slam lands (dmg), experience; mass slows its springs;
 * split: what it comes apart into ([size, how many]) for the kinds that do. */
export const SIZES = {
  XS: { R: 0.2, hp: 10, dmg: 3, xp: 3, mass: 0.35, hop: 1.3 },
  S: { R: 0.32, hp: 22, dmg: 5, xp: 6, mass: 0.5, hop: 1.7 },
  M: { R: 0.5, hp: 45, dmg: 8, xp: 12, mass: 0.8, hop: 2.3, ooze: 2.0 },
  L: { R: 0.8, hp: 95, dmg: 12, xp: 24, mass: 1.3, hop: 2.9, ooze: 1.65, split: ['S', 3] },
  XL: { R: 1.25, hp: 190, dmg: 18, xp: 45, mass: 2.0, hop: 3.5, ooze: 1.3, split: ['M', 3] },
};
const BIG = { L: true, XL: true };
/** The bodies: height for the base's radius, how long (for the oozes), and the profile turned. */
const SHAPES = {
  drop: { h: 1.5, long: 1 },       // the classic gumdrop, a soft point on top (the hoppers)
  dome: { h: 1.0, long: 1 },       // a round mound (the clingers, the ossuary slime)
  puddle: { h: 0.68, long: 1.35 }, // low and long (the oozes)
};
/** Each kind: its colour, the rim's sheen, how much it glows (in the dark of a cave you see the
 * ones that glow), how see-through, how it moves and its body, which sizes split, what it shrugs
 * off (resist: a blow of that kind times this), what touching it does, and what's inside it. */
export const SPECIES = {
  mire: { name: 'Mire Slime', color: 0x48a832, rim: 0x9cff70, glow: 0.05, opacity: 0.3, move: 'hop', shape: 'drop', splits: ['L'], bits: { bubbles: 6, debris: 6 } },
  bog: { name: 'Bog Ooze', color: 0x5e5a22, rim: 0xb0a860, glow: 0, opacity: 0.5, move: 'ooze', shape: 'puddle', splits: ['L', 'XL'], bits: { bubbles: 3, debris: 14, bones: 1 } },
  azure: { name: 'Azure Jelly', color: 0x2a8cff, rim: 0x9adcff, glow: 0.22, opacity: 0.26, move: 'cling', shape: 'dome', resist: { frost: 0.4 }, bits: { bubbles: 9, bones: 1 } },
  crimson: { name: 'Crimson Slime', color: 0xb8122a, rim: 0xff6a6a, glow: 0.06, opacity: 0.34, move: 'hop', shape: 'drop', splits: ['L', 'XL'], bits: { bubbles: 4, bones: 4 } },
  amber: { name: 'Amber Ooze', color: 0xff8410, rim: 0xffd060, glow: 0.5, opacity: 0.36, move: 'ooze', shape: 'puddle', resist: { fire: 0 }, touch: 'burn', bits: { bubbles: 11, debris: 3 } },
  violet: { name: 'Gloom Slime', color: 0x7a2cff, rim: 0xd0a0ff, glow: 0.45, opacity: 0.3, move: 'cling', shape: 'dome', bits: { bubbles: 5 } },
  toxic: { name: 'Blight Slime', color: 0x9ae014, rim: 0xeaff80, glow: 0.65, opacity: 0.32, move: 'hop', shape: 'drop', resist: { poison: 0 }, touch: 'acid', bits: { bubbles: 7 } },
  pitch: { name: 'Pitch Slime', color: 0x0e0a10, rim: 0x6a3cff, glow: 0, opacity: 0.74, move: 'ooze', shape: 'puddle', splits: ['L', 'XL'], resist: { fire: 1.6 }, bits: { bones: 3 } },
  ossuary: { name: 'Ossuary Slime', color: 0xcdc6a2, rim: 0xfff6d8, glow: 0.03, opacity: 0.26, move: 'hop', shape: 'dome', splits: ['L', 'XL'], bits: { bones: 9, skull: 1, bubbles: 3 } },
};

// ------------------------------------------------------------------ the bodies
/** The side's radius at height y (0 at the base, 1 at the top), for each body. */
const PROFILE = {
  drop: (y) => Math.sqrt(Math.max(0, 1 - y * y)) * (1 - 0.72 * Math.pow(y, 3)),   // full and round, drawn up to a soft point
  dome: (y) => Math.pow(Math.max(0, 1 - Math.pow(y, 2.2)), 0.5),
  puddle: (y) => Math.pow(Math.max(0, 1 - Math.pow(y, 2.2)), 0.45),
};
/** A lathe: a flat base with a rounded rim, the side rising by the shape's own curve to the top.
 * Height 1 and radius 1 (the body's scale makes it the slime's own). */
function shellGeometry(shape) {
  const r = PROFILE[shape];
  const pts = [[0, 0], [0.5, 0], [0.84, 0], [0.93, 0.018], [0.975, 0.05]].map(([x, y]) => new THREE.Vector2(x, y));
  for (let i = 1; i <= 22; i++) { const y = 0.07 + 0.93 * (i / 22); pts.push(new THREE.Vector2(Math.max(0, r(y)), y)); }
  const g = new THREE.LatheGeometry(pts, 36);
  g.computeVertexNormals();
  // (the shader swells and leans it past its own bounds)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 1.9);
  return g;
}

function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** What shows inside it, in the body's own frame (so in units of its radius, the bits undone from
 * the body's stretch so they stay round): a dark heart, bubbles, sticks and leaves, bones, a skull. */
function innardsGeometry(sp, seed) {
  const R = rng(seed), sh = SHAPES[sp.shape], aspect = sh.h, long = sh.long;
  const parts = [];
  const col = new THREE.Color(sp.color);
  const add = (g, c, at, sx, sy = sx, sz = sx, rot = null) => {
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (rot) g.applyQuaternion(rot);
    g.scale(sx, sy / aspect, sz / long);
    g.translate(at[0], at[1], at[2]);
    parts.push(g);
  };
  const inside = (y, pad) => Math.max(0, PROFILE[sp.shape](y) - pad);   // how far out from the middle a bit at height y may sit
  const spot = (pad, y0 = 0.18, y1 = 0.6) => {
    const y = y0 + R() * (y1 - y0), a = R() * 6.283, d = Math.sqrt(R()) * inside(y, pad) * 0.8;
    return [Math.cos(a) * d, y, Math.sin(a) * d];
  };
  const turn = () => new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 6.3, R() * 6.3, R() * 6.3));
  // the heart: a dark lump, knobbled
  const heart = new THREE.IcosahedronGeometry(1, 2), p = heart.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.2 * Math.sin(x * 4.1 + y * 2.3 + seed) * Math.sin(z * 3.7 + seed * 0.3);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  heart.computeVertexNormals();
  const dark = col.clone().multiplyScalar(sp.glow > 0.3 ? 1.1 : 0.32);
  const hr = sp.shape === 'puddle' ? 0.2 : 0.26;
  add(heart, dark, [0, Math.min(0.45, 0.2 + hr * 0.6), 0], hr, hr * 0.92, hr);
  const b = sp.bits || {};
  const bubble = col.clone().lerp(WHITE, 0.4);
  for (let i = 0; i < (b.bubbles || 0); i++) { const s = 0.025 + R() * 0.045; add(new THREE.IcosahedronGeometry(1, 1), bubble, spot(0.18 + s * 2, 0.15, 0.6), s); }
  const twig = new THREE.Color(0x3a2a16), leaf = new THREE.Color(0x2c3a14);
  // (lying near level, so a low body keeps them in)
  const level = () => new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + (R() - 0.5) * 0.6, R() * 6.3, (R() - 0.5) * 0.4));
  for (let i = 0; i < (b.debris || 0); i++) {
    if (R() < 0.5) add(new THREE.CylinderGeometry(0.012, 0.016, 0.2 + R() * 0.2, 4), twig, spot(0.32, 0.2, 0.45), 1, 1, 1, level());
    else add(new THREE.TetrahedronGeometry(0.05 + R() * 0.04), leaf, spot(0.2, 0.15, 0.5), 1, 0.3, 1, turn());
  }
  const bone = new THREE.Color(0xd9d0b4);
  for (let i = 0; i < (b.bones || 0); i++) {
    const len = 0.16 + R() * (sp.shape === 'puddle' ? 0.16 : 0.28);
    add(new THREE.CapsuleGeometry(0.028, len, 2, 6), bone, spot(len * 0.5 + 0.12, 0.22, 0.5), 1, 1, 1, sp.shape === 'puddle' ? level() : turn());
  }
  if (b.skull) {   // something it swallowed whole: a skull, its jaw fallen away below it
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, R() * 6.3, 0.3));
    add(new THREE.SphereGeometry(0.19, 12, 9), bone, [0.1, 0.42, -0.04], 1, 0.9, 1.1, q);
    add(new THREE.BoxGeometry(0.17, 0.06, 0.13), bone, [0.14, 0.2, 0.03], 1, 1, 1, q);
    const hole = new THREE.Color(0x2a2418);
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.045, 6, 5), hole, [0.1 + s * 0.065, 0.42, 0.11], 1, 1, 1, q);
  }
  const g = mergeGeometries(parts);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.4, 0), 1.6);
  return g;
}

// ------------------------------------------------------------------ the jelly's shader
// (one program for every slime: the per-slime numbers are uniforms)
const SHELL_HEAD = /* glsl */`
  uniform vec3 uSq; uniform vec3 uLean; uniform vec4 uWob; uniform vec4 uDent; uniform float uPulse;
  vec3 slimeShape(vec3 p) {
    float h = clamp(p.y, 0.0, 1.0);
    float ang = atan(p.z, p.x);
    // a wobble in two modes (up and down; round the sides), ripples running out from the base
    float w = uWob.x * (sin(uWob.y + h * 3.3) * 0.6 + sin(uWob.y * 1.73 + ang * 3.0 + h * 2.1) * 0.4);
    vec3 q = p;
    q.xz *= 1.0 + w * (0.35 + 0.5 * h) + uPulse * (1.0 + 0.25 * sin(ang * 5.0 + h * 9.0 + uWob.y * 3.0));
    q.y *= 1.0 - w * 0.45 + uPulse * 0.7;
    q.y += uWob.z * sin(uWob.w - length(p.xz) * 7.0) * (1.0 - h) * 0.12;
    // a dent where it was struck
    vec3 r = q - vec3(0.0, 0.45, 0.0);
    float rl = max(length(r), 1e-4);
    q -= (r / rl) * pow(max(dot(r / rl, uDent.xyz), 0.0), 3.0) * uDent.w * min(rl, 0.6);
    q *= uSq;
    q.xz += uLean.xz * pow(h, 1.4);
    return q;
  }`;
const SHELL_FRAG_HEAD = /* glsl */`
  uniform vec3 uRim; uniform float uFres;`;
// the edges thicker (more of it to look through) and lit by the rim's sheen
const SHELL_FRESNEL = /* glsl */`
  {
    float fr = clamp(1.0 - abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
    fr = fr * fr * (0.6 + 0.4 * fr);
    diffuseColor.a = clamp(diffuseColor.a + fr * uFres, 0.0, 0.97);
    totalEmissiveRadiance += uRim * fr;
  }`;
function shellShader(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + SHELL_HEAD)
    .replace('#include <beginnormal_vertex>', 'vec3 slimeP = slimeShape(position);\nvec3 objectNormal = normalize(normal / uSq);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif')
    .replace('#include <begin_vertex>', 'vec3 transformed = slimeP;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + SHELL_FRAG_HEAD)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + SHELL_FRESNEL);
}
/** Lit by its own colour (instanced goo, the innards): an emissive share of the vertex/instance colour. */
function selfLit(m, k, key) {
  const u = { uSelf: { value: k } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSelf = u.uSelf;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSelf;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\ntotalEmissiveRadiance += vColor.rgb * uSelf;\n#endif');
  };
  m.customProgramCacheKey = () => key;
  m.userData.self = u;
  return m;
}

// ------------------------------------------------------------------ goo
function gooTexture() {
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), R = rng(41);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i <= 72; i++) {
    const a = i / 72 * Math.PI * 2;
    const r = n * 0.27 * (1 + 0.13 * Math.sin(a * 5 + 1) + 0.08 * Math.sin(a * 9 + 2) + 0.05 * Math.sin(a * 14));
    const x = n / 2 + Math.cos(a) * r, y = n / 2 + Math.sin(a) * r;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.fill();
  for (let i = 0; i < 9; i++) {   // fingers flung out from it, a drop at each end
    const a = R() * Math.PI * 2, l = n * (0.3 + R() * 0.14), w = 2 + R() * 4;
    g.lineWidth = w; g.strokeStyle = '#fff'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(n / 2 + Math.cos(a) * n * 0.2, n / 2 + Math.sin(a) * n * 0.2); g.lineTo(n / 2 + Math.cos(a) * l, n / 2 + Math.sin(a) * l); g.stroke();
    g.beginPath(); g.arc(n / 2 + Math.cos(a) * l, n / 2 + Math.sin(a) * l, w * 0.9, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 16; i++) {
    const a = R() * Math.PI * 2, d = n * (0.3 + R() * 0.17), r = n * (0.008 + R() * 0.03);
    g.beginPath(); g.arc(n / 2 + Math.cos(a) * d, n / 2 + Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A wet smear, long (v) and narrow (u): fuller at its wet edges, fading out at both ends so the next
 * one laid half a length on blends into it (cos squared: two of them overlapped add up to one). */
function smearTexture() {
  const w = 64, h = 128, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w * 2 - 1, v = (y + 0.5) / h * 2 - 1;
    const lim = 0.8 + 0.08 * Math.sin(v * 9 + 1.3) + 0.05 * Math.sin(v * 23 + 0.4);
    const k = Math.abs(u) / lim;
    let a = k > 1 ? 0 : (0.5 + 0.42 * sm(0.55, 0.92, k)) * (1 - sm(0.92, 1, k));
    a *= 0.88 + 0.12 * Math.sin(u * 19 + v * 3);
    a *= Math.cos(Math.PI * v / 2) ** 2;
    const i = (y * w + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(clamp(a, 0, 1) * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DROP_V = /* glsl */`
  attribute vec3 aCol; attribute float aSize; uniform float scale; varying vec3 vC;
  void main() { vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(1.5, aSize * scale / -mv.z); gl_Position = projectionMatrix * mv; }`;
const DROP_F = /* glsl */`
  varying vec3 vC;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0; float d = dot(q, q);
    if (d > 1.0) discard;
    float hl = pow(clamp(1.0 - length(q - vec2(-0.35, -0.35)) * 1.7, 0.0, 1.0), 3.0);
    gl_FragColor = vec4(vC * (0.55 + 0.45 * (1.0 - d)) + hl * 0.55, 1.0);
  }`;
const SHADOW_V = /* glsl */`
  attribute float aAlpha; varying float vA; varying vec2 vUv;
  void main() { vUv = uv; vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
const SHADOW_F = /* glsl */`
  varying float vA; varying vec2 vUv;
  void main() { float d = length(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(0.25, 1.0, d)) * vA; if (a < 0.004) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }`;

/** What comes off them: drops flung through the air, splashes on any surface (shrinking as they
 * dry), chunks of jelly that land, shiver and melt, and the soft shadows under them. Each is one
 * draw for all of it. */
class Goo {
  constructor(scene, floorBelow) {
    this.floorBelow = floorBelow;
    // drops
    const M = this.max = 1600;
    this.n = 0;
    this.pos = new Float32Array(M * 3); this.vel = new Float32Array(M * 3); this.col = new Float32Array(M * 3);
    this.size = new Float32Array(M); this.floor = new Float32Array(M); this.mark = new Uint8Array(M);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aSize', this.aSize);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    g.setDrawRange(0, 0);
    this.dropGeo = g;
    this.dropMat = new THREE.ShaderMaterial({ vertexShader: DROP_V, fragmentShader: DROP_F, uniforms: { scale: { value: 300 } } });
    this.points = new THREE.Points(g, this.dropMat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    // splashes: on floors, walls and roofs alike (each laid along its surface)
    this.splatMax = 520;
    const sg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const sm = selfLit(new THREE.MeshStandardMaterial({ map: gooTexture(), transparent: true, opacity: 0.72, depthWrite: false, roughness: 0.5, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }), 0.22, 'slime-splat');
    this.splats = new THREE.InstancedMesh(sg, sm, this.splatMax);
    this.splats.setColorAt(0, WHITE);   // (made now, so its shader has the colours from the first)
    this.splats.count = 0; this.splatNext = 0;
    this.splats.renderOrder = 0.55;     // (over the blood, under the water)
    this.splats.receiveShadow = true;
    this.splats.frustumCulled = false;
    scene.add(this.splats);
    this.sp = [];   // per splash: {p, q, r, long, age, life}
    // trails: smears laid half a length apart along the way something went (same shader as the splashes)
    this.trailMax = 1400;
    const tm = selfLit(new THREE.MeshStandardMaterial({ map: smearTexture(), transparent: true, opacity: 0.95, depthWrite: false, roughness: 0.45, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }), 0.22, 'slime-splat');
    this.trails = new THREE.InstancedMesh(sg, tm, this.trailMax);
    this.trails.setColorAt(0, WHITE);
    this.trails.count = 0; this.trailNext = 0;
    this.trails.renderOrder = 0.54;    // (under the splashes)
    this.trails.receiveShadow = true;
    this.trails.frustumCulled = false;
    scene.add(this.trails);
    this.tr = [];   // per smear: {p, q, w, l, age, life}
    // chunks
    this.chunkMax = 96;
    const cm = selfLit(new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.78, depthWrite: false, roughness: 0.12, metalness: 0 }), 0.3, 'slime-chunk');
    this.chunks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), cm, this.chunkMax);
    this.chunks.setColorAt(0, WHITE);
    this.chunks.count = 0;
    this.chunks.renderOrder = 1.05;
    this.chunks.frustumCulled = false;
    scene.add(this.chunks);
    this.ch = [];   // {p, v, r, col, age, life, rest, floor, ph, q, spin}
    // shadows
    this.shadowMax = 160;
    const shg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.alpha = new Float32Array(this.shadowMax);
    shg.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.shadows = new THREE.InstancedMesh(shg, new THREE.ShaderMaterial({ vertexShader: SHADOW_V, fragmentShader: SHADOW_F, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), this.shadowMax);
    this.shadows.count = 0;
    this.shadows.renderOrder = 0.52;
    this.shadows.frustumCulled = false;
    scene.add(this.shadows);
    this.drips = [];   // places that go on dripping a while: {p, col, t, k}
  }

  /** A drop flung from p with velocity v; `mark`: it always leaves a spot where it lands. */
  drop(p, v, size, col, mark = false) {
    const i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = col.r; this.col[i * 3 + 1] = col.g; this.col[i * 3 + 2] = col.b;
    this.size[i] = size;
    // (where it'll land: under where it's flung from, and a little ahead)
    this.floor[i] = this.floorBelow(p.x + v.x * 0.25, p.z + v.z * 0.25, p.y);
    this.mark[i] = mark ? 2 : size > 0.035 ? 1 : 0;
  }

  /** `n` drops from p, thrown along dir with some spread. */
  spray(p, dir, n, col, { speed = 3, spread = 0.8, size = 0.03 } = {}) {
    const v = this._v || (this._v = new THREE.Vector3());
    for (let k = 0; k < n; k++) {
      rnd(v).multiplyScalar(spread).add(dir).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.9));
      this.drop(p, v, size * (0.5 + Math.random()), col);
    }
  }

  /** A splash at p, laid on the surface whose normal is n, r across; `long` stretches it along
   * `along` (a trail). It dries (shrinks) over its last quarter. */
  splat(p, n, r, col, life = 30, along = null, long = 1) {
    const i = this.splatNext;
    this.splatNext = (i + 1) % this.splatMax;
    this.splats.count = Math.max(this.splats.count, i + 1);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, n);
    const spin = along ? Math.atan2(along.x, along.z) : Math.random() * Math.PI * 2;
    q.multiply(_q2.setFromAxisAngle(UP, spin));
    const at = new THREE.Vector3().copy(p).addScaledVector(n, 0.012 + (i % 40) * 0.0004);
    this.sp[i] = { p: at, q, r, long, age: 0, life };
    this.splats.setColorAt(i, col);
    this.splats.instanceColor.needsUpdate = true;
    this.placeSplat(i, 1);
  }

  /** A smear of trail at p on the surface with normal n, `w` across and `l` long, laid along `along`. */
  trail(p, n, w, l, along, col, life = 40) {
    const i = this.trailNext;
    this.trailNext = (i + 1) % this.trailMax;
    this.trails.count = Math.max(this.trails.count, i + 1);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, n);
    const f = (this._f ||= new THREE.Vector3()).copy(along).applyQuaternion(_q2.copy(q).invert());   // (the way along, in the smear's own frame)
    q.multiply(_q2.setFromAxisAngle(UP, Math.atan2(f.x, f.z)));
    const at = new THREE.Vector3().copy(p).addScaledVector(n, 0.008 + (i % 30) * 0.0003);
    this.tr[i] = { p: at, q, w, l, age: 0, life: life * (0.85 + Math.random() * 0.3) };
    this.trails.setColorAt(i, col);
    this.trails.instanceColor.needsUpdate = true;
    this.placeTrail(i, 1);
  }

  placeTrail(i, k) {
    const s = this.tr[i];
    this.trails.setMatrixAt(i, _m.compose(s.p, s.q, _s.set(s.w * k, 1, s.l)));
    this.trails.instanceMatrix.needsUpdate = true;
  }

  placeSplat(i, k) {
    const s = this.sp[i];
    this.splats.setMatrixAt(i, _m.compose(s.p, s.q, _s.set(s.r * 2 * k, 1, s.r * 2 * s.long * k)));   // (r: the splash's reach, its middle to its fingers' ends)
    this.splats.instanceMatrix.needsUpdate = true;
  }

  /** A chunk of jelly r across, flung with velocity v. */
  chunk(p, v, r, col) {
    if (this.ch.length >= this.chunkMax) this.ch.shift();
    this.ch.push({ p: p.clone(), v: v.clone(), r, col: col.clone(), age: 0, life: 3.5 + Math.random() * 3, rest: false,
      floor: this.floorBelow(p.x + v.x * 0.3, p.z + v.z * 0.3, p.y), ph: Math.random() * 6, q: new THREE.Quaternion(), spin: rnd(new THREE.Vector3()), w: 4 + Math.random() * 8, sq: 0 });
  }

  clear() {
    this.n = 0; this.ch.length = 0; this.drips.length = 0;
    for (let i = 0; i < this.splats.count; i++) if (this.sp[i]) { this.sp[i].age = this.sp[i].life; this.placeSplat(i, 0); }
    for (let i = 0; i < this.trails.count; i++) if (this.tr[i]) { this.tr[i].age = this.tr[i].life; this.placeTrail(i, 0); }
  }

  update(dt, camera, height) {
    this.dropMat.uniforms.scale.value = height / 2 * camera.projectionMatrix.elements[5];
    // the drops
    const P = this.pos, V = this.vel;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      V[i * 3 + 1] -= 13 * dt;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      if (P[i * 3 + 1] <= this.floor[i]) {
        if (this.mark[i] === 2 || (this.mark[i] === 1 && Math.random() < 0.45)) this.splat(_a.set(P[i * 3], this.floor[i], P[i * 3 + 2]), UP, this.size[i] * (2.5 + Math.random() * 2.5), _col.setRGB(this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]), 14 + Math.random() * 10);
        continue;
      }
      if (w !== i) {   // (the live ones packed to the front)
        const C = this.col, a = w * 3, b = i * 3;
        P[a] = P[b]; P[a + 1] = P[b + 1]; P[a + 2] = P[b + 2];
        V[a] = V[b]; V[a + 1] = V[b + 1]; V[a + 2] = V[b + 2];
        C[a] = C[b]; C[a + 1] = C[b + 1]; C[a + 2] = C[b + 2];
        this.size[w] = this.size[i]; this.floor[w] = this.floor[i]; this.mark[w] = this.mark[i];
      }
      w++;
    }
    this.n = w;
    this.dropGeo.setDrawRange(0, w);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
    // the splashes dry
    for (let i = 0; i < this.splats.count; i++) {
      const s = this.sp[i];
      if (!s || s.age >= s.life) continue;
      s.age += dt;
      const k = s.age / s.life;
      if (k > 0.75) this.placeSplat(i, k >= 1 ? 0 : 1 - (k - 0.75) / 0.25 * 0.85);
    }
    // the trails dry from their edges in
    for (let i = 0; i < this.trails.count; i++) {
      const s = this.tr[i];
      if (!s || s.age >= s.life) continue;
      s.age += dt;
      const k = s.age / s.life;
      if (k > 0.65) this.placeTrail(i, k >= 1 ? 0 : 1 - (k - 0.65) / 0.35 * 0.9);
    }
    // places still dripping (a roof where one burst)
    this.drips = this.drips.filter((d) => {
      d.t -= dt;
      if (Math.random() < dt * d.k * Math.min(1, d.t / 3)) this.drop(_a.copy(d.p).add(_b.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4)), _b.set(0, -0.3, 0), 0.03 + Math.random() * 0.03, d.col);
      return d.t > 0;
    });
    // the chunks
    const C = this.chunks;
    let live = 0;
    this.ch = this.ch.filter((c) => (c.age += dt) < c.life);
    for (const c of this.ch) {
      if (!c.rest) {
        c.v.y -= 13 * dt;
        c.p.addScaledVector(c.v, dt);
        c.q.premultiply(_q2.setFromAxisAngle(c.spin, c.w * dt));
        if (c.p.y - c.r * 0.6 < c.floor) {
          c.p.y = c.floor + c.r * 0.6;
          if (c.v.y < -2) { c.v.y *= -0.3; c.v.x *= 0.5; c.v.z *= 0.5; c.sq = 1; c.w *= 0.5; }
          else { c.rest = true; c.v.set(0, 0, 0); c.q.identity(); c.sq = 0.7; this.splat(_a.copy(c.p).setY(c.floor), UP, c.r * 1.8, c.col, 10); }
          c.floor = this.floorBelow(c.p.x, c.p.z, c.p.y + 0.3);
        }
      }
      c.sq *= Math.exp(-dt * 2.5);
      c.ph += dt * 11;
      const melt = c.age > c.life - 1.6 ? (c.life - c.age) / 1.6 : 1;
      const jig = 1 + c.sq * 0.35 * Math.sin(c.ph);
      const flat = c.rest ? 0.55 : 1;
      const r = c.r * melt;
      if (c.rest) c.p.y = c.floor + r * flat * 0.6;
      C.setMatrixAt(live, _m.compose(c.p, c.q, _s.set(r * jig, r * flat / jig, r * jig)));
      C.setColorAt(live, c.col);
      live++;
    }
    C.count = live;
    C.instanceMatrix.needsUpdate = true;
    if (C.instanceColor) C.instanceColor.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ one slime
class Slime {
  constructor(owner, key, size, at, o = {}) {
    const sp = SPECIES[key], sz = SIZES[size], shp = SHAPES[sp.shape];
    this.owner = owner; this.key = key; this.sp = sp; this.size = size;
    this.slime = true; this.kindName = 'slime'; this.mode = 'slime'; this.variant = 'slime_' + key;
    this.R = sz.R * (0.92 + Math.random() * 0.16); this.H = this.R * shp.h; this.long = shp.long;
    this.mass = sz.mass;
    this.hp = this.max = sz.hp; this.dmg = sz.dmg; this.xp = sz.xp;
    this.move = sp.move;
    this.pos = new THREE.Vector3(at.x, at.y, at.z);
    this.home = (o.home || this.pos).clone();
    this.n = UP.clone(); this.vel = new THREE.Vector3();
    const a = Math.random() * 6.283;
    this.head = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    this.state = this.move === 'ooze' ? 'ooze' : 'idle'; this.t = 0; this.wait = 0.5 + Math.random() * 2;
    this.zone = o.zone || 'wild'; this.dg = o.dg || null; this.cave = o.dg?.rock || null;
    this.rehearsal = !!o.rehearsal;
    this.aggro = false; this.goal = 'wander'; this.hasLast = false; this.last = new THREE.Vector3(); this.lastT = -99; this.canSee = false;
    this.senseT = Math.random() * 0.3; this.atkCool = 0; this.hitCool = 0; this.attacking = false; this.invuln = 0;
    this.leftN = new THREE.Vector3(); this.leftT = 0; this.noStick = false;
    this.wanderTo = null; this.wanderT = 0; this.phase = Math.random() * 6; this.trail = 0; this.engulfT = 0;
    this.actions = {}; this.stagger = 0; this.knock = null; this.dist = 99;
    // the body's give: squash (1 at rest) and its spring, the top's lean behind the base, wobble,
    // ripples, a dent, the swell before it bursts, and (the oozes) how drawn out along its way
    this.sq = 1; this.sqV = 0; this.sqTo = 1; this.stretch = 1;
    this.lean = new THREE.Vector2(); this.leanV = new THREE.Vector2(); this.leanTo = new THREE.Vector2();
    this.wob = 0.06; this.wobP = Math.random() * 10; this.ripple = 0; this.ripP = 0; this.dent = 0; this.dentDir = new THREE.Vector3(0, 1, 0); this.pulse = 0;
    this.color = new THREE.Color(sp.color);
    this.ice = 0;
    // the meshes: the far side of the jelly (darker), what's in it, the near side; a point at its
    // middle for what aims at a body's chest
    const m = owner.materials(sp);
    this.u = m.u; this.frontMat = m.front; this.backMat = m.back;
    this.root = new THREE.Object3D();
    this.body = new THREE.Object3D();
    this.body.scale.set(this.R, this.H, this.R * this.long);
    this.root.add(this.body);
    const geo = owner.shells[sp.shape];
    this.back = new THREE.Mesh(geo, this.backMat);
    this.front = new THREE.Mesh(geo, this.frontMat);
    this.innerBox = new THREE.Object3D();
    this.inner = new THREE.Mesh(owner.innards(key), owner.innerMat(key));
    this.innerBox.add(this.inner);
    this.core = new THREE.Object3D(); this.core.position.set(0, 0.45, 0);
    this.body.add(this.innerBox, this.back, this.front, this.core);
    for (const x of [this.back, this.front, this.inner]) { x.castShadow = false; x.receiveShadow = true; }
    this.bones = { chest: this.core };
    owner.scene.add(this.root);
    this.shY = this.pos.y; this.shT = 0;
    this.pose(1);
  }

  get dead() { return this.state === 'pop' || this.state === 'gone'; }
  get standing() { return !this.dead; }
  has() { return true; }
  get big() { return !!BIG[this.size]; }
  /** Its middle (where a body's chest would be). */
  center(out = new THREE.Vector3()) { return out.copy(this.pos).addScaledVector(this.n, this.H * 0.5 * this.sq); }
  chestAt(out) { return this.center(out); }
  forward(out = new THREE.Vector3()) { return out.copy(this.head); }

  /** Hit shapes in the world: an upright capsule (a long one each way for the oozes). */
  capsules() {
    const c = this.center(new THREE.Vector3()), n = this.n;
    if (this.sp.shape === 'puddle') {
      const r = Math.max(this.H * 0.55, this.R * 0.42);
      const f = _a.copy(this.head).addScaledVector(n, -this.head.dot(n)).normalize();
      const s = _b.crossVectors(n, f);
      const hl = Math.max(0.01, this.R * this.long * this.stretch * 0.92 - r), hw = Math.max(0.01, this.R * 0.92 - r);
      return [
        { bone: this.core, a: c.clone().addScaledVector(f, -hl), b: c.clone().addScaledVector(f, hl), r },
        { bone: this.core, a: c.clone().addScaledVector(s, -hw), b: c.clone().addScaledVector(s, hw), r },
      ];
    }
    const r = Math.min(this.R * 0.82, this.H * 0.5 * this.sq + 0.02);
    const h = this.H * this.sq;
    return [{ bone: this.core, a: this.pos.clone().addScaledVector(n, Math.min(r, h * 0.5)), b: this.pos.clone().addScaledVector(n, Math.max(h - r, h * 0.5)), r }];
  }

  /** A ray (origin o, unit d) against it: {t, bone, point, z} or null. */
  ray(o, d, far) {
    if (this.dead) return null;
    const c = this.center(_a);
    const ox = c.x - o.x, oy = c.y - o.y, oz = c.z - o.z, t0 = ox * d.x + oy * d.y + oz * d.z;
    const br = Math.max(this.R * this.long * 1.2, this.H) + 0.15;
    if (t0 < -br || t0 > far + br) return null;
    const px = ox - d.x * t0, py = oy - d.y * t0, pz = oz - d.z * t0;
    if (px * px + py * py + pz * pz > br * br) return null;
    let best = null;
    for (const cap of this.capsules()) {
      const t = rayCapsule(o, d, cap.a, cap.b, cap.r);
      if (t !== null && t <= far && (!best || t < best.t)) best = { t, bone: this.core, point: o.clone().addScaledVector(d, t), z: this };
    }
    return best;
  }

  // -------------------------------------------------------------- blows
  hit(h, { dmg = 0, dir = null, heavy = false, kind = 'blade' } = {}) {
    if (this.dead || this.invuln > 0) return;
    const o = this.owner, g = o.goo;
    const p = h.point || this.center(new THREE.Vector3());
    dir = dir ? _f.copy(dir) : _f.subVectors(p, o.player?.pos || p).setY(0).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    let k = this.sp.resist?.[kind] ?? 1;
    if (kind === 'blunt') k *= 0.85;           // (it gives under a mace)
    if (kind === 'fire' || kind === 'lightning') k *= 1.15;
    if (this.frozen > 0) k *= 1.5;              // brittle with ice
    this.hp -= dmg * k;
    if (o.oneHit && dmg > 0) this.hp = Math.min(this.hp, 0);   // (GOD MODE, the Debug Menu: one blow of anything bursts it)
    // the jelly gives where it was struck, and shivers all over
    const local = this.body.worldToLocal(_a.copy(p));
    this.dentDir.set(local.x, local.y - 0.45, local.z);
    if (this.dentDir.lengthSq() > 1e-6) this.dentDir.normalize(); else this.dentDir.set(0, 1, 0);
    this.dent = heavy ? 0.5 : 0.32;
    this.wob += heavy ? 0.55 : 0.32; this.sqV -= heavy ? 4 : 2.4; this.ripple = 1;
    // goo out of it: thrown on along the blow and back at you
    g.spray(p, dir, Math.round((heavy ? 22 : 12) + 14 * this.R), this.color, { speed: heavy ? 4 : 3, spread: 0.8, size: 0.022 + 0.02 * this.R });
    g.spray(p, _b.copy(dir).negate().add(_c.set(0, 0.6, 0)), Math.round((heavy ? 10 : 6) + 6 * this.R), this.color, { speed: 2.4, spread: 0.7, size: 0.02 });
    if (kind === 'blade' && this.R >= 0.45 && Math.random() < 0.65) g.chunk(p, _b.copy(dir).multiplyScalar(2 + Math.random() * 2).add(_c.set((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2)), this.R * (0.12 + Math.random() * 0.08), this.color);
    const fx = o.fx;
    if (fx && kind === 'fire') { for (let i = 0; i < 5; i++) fx.smoke?.emit(p.clone(), _b.set((Math.random() - 0.5) * 0.4, 0.8, (Math.random() - 0.5) * 0.4), { life: 1.6, size: 0.35, grow: 0.8, alpha: 0.28, shade: 0.95 }); }
    if (fx && kind === 'lightning') fx.particles.burst(p, [new THREE.Color(2.2, 2.4, 3.2), this.color.clone().multiplyScalar(2)], 18, { speed: 3, size: 0.03, grav: 2, life: 0.4 });
    o.sound('hurt', p, this.R, heavy);
    // struck: it knows where you are now
    this.aggro = true; this.canSee = true; this.lastT = o.time;
    if (o.player) { this.last.copy(o.player.pos); this.hasLast = true; }
    o.alert(this, o.player?.pos);
    if (this.hp <= 0) { this.die(dir, kind); return; }
    // a heavy blow knocks a small one off its feet (or off the wall it was stuck to)
    if (heavy && this.state !== 'air' && (this.R < 0.9 || this.state === 'cling' || this.state === 'drip')) {
      const kick = 2.6 / Math.sqrt(this.mass);
      this.launch({ v: _b.set(dir.x * kick, 2.2 / Math.sqrt(this.mass), dir.z * kick), attack: false }, true);
      this.noStick = this.state === 'cling';
    }
  }

  /** Damage with nothing to show for it (fire, poison, a drained life). */
  harm(dmg) {
    if (this.dead || this.invuln > 0) return;
    this.hp -= dmg * (this.frozen > 0 ? 1.5 : 1);
    if (this.owner.oneHit && dmg > 0) this.hp = Math.min(this.hp, 0);
    this.aggro = true; this.lastT = this.owner.time;
    if (this.owner.player) { this.last.copy(this.owner.player.pos); this.hasLast = true; }
    if (this.hp <= 0) this.die(null, 'harm');
  }
  freeze(t) { if (this.dead || (this.sp.resist?.frost ?? 1) < 0.5) { this.chill(t * 0.5); return; } this.frozen = Math.max(this.frozen || 0, t); this.burning = 0; }
  chill(t) { if (!this.dead) this.chilled = Math.max(this.chilled || 0, t); }
  ignite(t, dps = 6) { if (this.dead) return; if ((this.sp.resist?.fire ?? 1) <= 0) return; this.burning = Math.max(this.burning || 0, t); this.burnDps = Math.max(this.burnDps || 0, dps); this.frozen = 0; }
  poison(t, dps = 5) { if (this.dead || (this.sp.resist?.poison ?? 1) <= 0) return; this.poisoned = Math.max(this.poisoned || 0, t); this.poisonDps = Math.max(this.poisonDps || 0, dps); }
  /** A shove (m/s) from a spell that is itself a force: knocked up off whatever it's on. */
  shove(x, z, up = 0) {
    if (this.dead) return;
    const m = 1 / Math.sqrt(this.mass);
    if (this.state === 'air') { this.vel.x += x * m * 0.6; this.vel.z += z * m * 0.6; this.vel.y += up * m * 0.4; return; }
    this.launch({ v: _b.set(x * m * 0.6, Math.max(1.5, up * m * 0.6), z * m * 0.6), attack: false }, true);
    this.noStick = true;
  }
  mark() {}

  die(dir = null, kind = '') {
    if (this.dead) return;
    this.state = 'pop'; this.t = 0; this.vel.set(0, 0, 0);
    this.iced = this.frozen > 0; this.frozen = 0;
    this.deadT = 0;
    if (!this.owner.quiet) this.owner.onDeath?.(this);   // (experience, and the quests' counts)
    this.owner.sound('swell', this.center(_a), this.R);
  }

  remove() {
    this.gone = true; this.state = 'gone';
    this.root.removeFromParent();
    this.frontMat.dispose(); this.backMat.dispose();
  }

  // -------------------------------------------------------------- the brain
  sense(player, active) {
    this.canSee = false;
    if (!active || player.unseenUntil > performance.now()) return;   // (just come through a portal: not yet seen)
    const o = this.owner, P = player.pos, c = this.center(_a);
    const dx = P.x - c.x, dz = P.z - c.z, dy = P.y + 1.1 - c.y, d = Math.hypot(dx, dz);
    this.dist = d;
    const sight = (this.sp.sight || 11) * (this.aggro ? 2.2 : 1) * (this.move === 'cling' ? 1.1 : 1);
    if (d < sight && Math.abs(dy) < (this.move === 'cling' ? 9 : 4.5)) {
      const len = Math.hypot(dx, dy, dz) || 1;
      const h = o.physics.ray([c.x, c.y + 0.05, c.z], [dx / len, dy / len, dz / len], len);
      this.canSee = !h || h.t > len - 0.6;
    }
    if (this.canSee) {
      if (!this.aggro) { this.aggro = true; o.sound('gurgle', c, this.R); o.alert(this, P); this.atkCool = Math.max(this.atkCool, 0.35); }
      this.last.copy(P); this.hasLast = true; this.lastT = o.time;
    } else if (this.aggro && o.time - this.lastT > 7) this.aggro = false;
    // out in the world it won't follow you far from where it lives
    if (this.aggro && !this.cave && Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > 48) { this.aggro = false; this.lastT = -99; }
  }

  /** Where it means to go: you, where it last had you, or somewhere about its home. */
  goalPoint() {
    if (this.aggro && this.hasLast) return this.canSee && this.owner.player ? this.owner.player.pos : this.last;
    if (!this.wanderTo || this.owner.time > this.wanderT || Math.hypot(this.wanderTo.x - this.pos.x, this.wanderTo.z - this.pos.z) < 0.8) {
      const a = Math.random() * 6.283, r = 1.5 + Math.random() * (this.cave ? 5 : 8);
      this.wanderTo = new THREE.Vector3(this.home.x + Math.cos(a) * r, this.home.y, this.home.z + Math.sin(a) * r);
      this.wanderT = this.owner.time + 6 + Math.random() * 8;
    }
    return this.wanderTo;
  }

  update(dt, player, active) {
    if (this.gone) return;
    if (this.state === 'pop') { this.popping(dt); this.pose(dt); return; }
    const pace = this.afflict(dt);
    if (this.dead) return;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.atkCool > 0) this.atkCool -= dt;
    if (this.hitCool > 0) this.hitCool -= dt;
    if (this.leftT > 0) this.leftT -= dt;
    if ((this.senseT -= dt) <= 0) { this.senseT = 0.22 + Math.random() * 0.12; this.sense(player, active); }
    const k = dt * pace;
    if (pace > 0) {
      if (this.knock) {   // the shield's bash or its repel: thrown back a stride
        const m = 1 / Math.sqrt(this.mass);
        this.launch({ v: _b.set(this.knock.x * 0.3 * m, 2.4 * m, this.knock.z * 0.3 * m), attack: false }, true);
        this.noStick = true; this.knock = null;
      }
      if (this.state === 'air') this.fly(k, player);
      else if (this.stagger > 0) { this.stagger -= dt; this.ground(k); }
      else this.think(k, player);
    }
    this.pose(dt, pace);
  }

  think(dt, player) {
    this.t += dt;
    if (this.move === 'ooze') { this.oozeThink(dt, player); return; }
    const st = this.state;
    if (st === 'cling') { this.clingThink(dt, player); return; }
    if (st === 'drip') { this.dripThink(dt, player); return; }
    if (st === 'land') {
      this.ground(dt);
      if (this.t > 0.16 + 0.12 * this.mass) { this.state = 'idle'; this.t = 0; this.wait = this.restTime(); }
      return;
    }
    if (st === 'crouch') {
      this.ground(dt);
      if (this.plan) this.turnTo(_a.copy(this.plan.v).setY(0), dt, 9);
      if (this.t > (this.aggro ? 0.14 + 0.09 * this.mass : 0.3)) { const p = this.plan; this.plan = null; if (p) this.launch(p); else this.state = 'idle'; }
      return;
    }
    // idle: sitting, breathing; then a hop
    this.ground(dt);
    this.sqTo = 1 + 0.03 * Math.sin(this.owner.time * 2.2 + this.wobP);
    if (this.t > this.wait) {
      this.plan = this.planLeap(player);
      this.t = 0;
      if (this.plan) { this.state = 'crouch'; this.sqTo = 0.58; }
      else this.wait = 0.5 + Math.random();
    }
  }

  restTime() {
    return this.aggro ? 0.16 + 0.22 * this.mass + Math.random() * 0.3 : 1.2 + Math.random() * 2.8;
  }

  /** The next leap: a pounce at you, a hop on its way, or (a clinger) up on to a wall or a roof. */
  planLeap(player) {
    const P = player.pos;
    if (this.move === 'cling' && (this.aggro || Math.random() < 0.5)) {
      const perch = this.findPerch(player);
      if (perch) return this.aimAt(perch.p, perch.p.y + 0.7, false, true);
    }
    const goal = this.goalPoint();
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z, d = Math.hypot(dx, dz);
    const reach = SIZES[this.size].hop;
    if (this.aggro && this.canSee && this.atkCool <= 0 && d < reach * 1.9 + 0.6 && Math.abs(P.y - this.pos.y) < 2.5) {
      // the pounce: at where you'll be, high, coming down on you
      _b.set(P.x + player.vel.x * 0.25, P.y + 0.6, P.z + player.vel.z * 0.25);
      return this.aimAt(_b, Math.max(this.pos.y, P.y) + 1.2 + this.R * 0.8, true);
    }
    const dir = _c;
    if (!(this.aggro && this.dg && this.owner.zombies?.flowDir(this.pos, dir, this.dg))) {
      if (d > 0.4) dir.set(dx / d, 0, dz / d); else rnd(dir).setY(0).normalize();
    }
    if (!this.aggro || Math.random() < 0.5) { const a = (Math.random() - 0.5) * 0.7, c = Math.cos(a), s = Math.sin(a); dir.set(dir.x * c - dir.z * s, 0, dir.x * s + dir.z * c); }
    const len = clamp(this.aggro ? reach : reach * 0.6, 0.5, Math.max(0.6, d));
    for (let i = 0; i < 3; i++) {
      const l = len * (1 - i * 0.3);
      const x = this.pos.x + dir.x * l, z = this.pos.z + dir.z * l;
      if (this.owner.bounds && !this.cave && !this.owner.bounds(x, z)) continue;
      const y = this.floorAt(x, z, this.pos.y + 1.4);
      if (y === null || y > this.pos.y + 1.4 || y < this.pos.y - 3 || this.wet(x, z, y)) continue;
      return this.aimAt(_b.set(x, y, z), Math.max(this.pos.y, y) + 0.3 + this.R * (this.aggro ? 0.9 : 0.6), false);
    }
    return null;
  }

  /** The leap that takes its base to `to` over an apex at height `apexY`; `perch`: it means to
   * stick there, so it arrives still rising. */
  aimAt(to, apexY, attack, perch = false) {
    const S = this.pos;
    const vy = Math.sqrt(2 * GRAV * Math.max(0.05, apexY - S.y));
    let T;
    if (perch) { const disc = vy * vy - 2 * GRAV * (to.y - S.y); T = disc > 0 ? (vy - Math.sqrt(disc)) / GRAV : vy / GRAV; }
    else T = vy / GRAV + Math.sqrt(2 * Math.max(0.02, apexY - to.y) / GRAV);
    T = Math.max(0.15, T);
    const v = new THREE.Vector3((to.x - S.x) / T, vy, (to.z - S.z) / T);
    const hs = Math.hypot(v.x, v.z), cap = 11;
    if (hs > cap) { v.x *= cap / hs; v.z *= cap / hs; }
    return { v, attack };
  }

  /** Off whatever it's on, into the air. */
  launch(plan, quiet = false) {
    if (this.n.y > 0.7 && this.state !== 'air') this.owner.goo.splat(this.pos, this.n, this.R * 0.85, this.color, 30);   // (a wet print where it sat)
    const c = this.center(_a);
    if (this.n.y < 0.9) { this.leftN.copy(this.n); this.leftT = 0.25; c.addScaledVector(this.n, 0.08); }
    this.n.copy(UP);
    this.pos.copy(c).addScaledVector(UP, -this.H * 0.5 * this.sq);
    this.vel.copy(plan.v);
    this.state = 'air'; this.t = 0; this.attacking = plan.attack;
    this.sqV += 4.5 + plan.v.length() * 0.35; this.sqTo = 1; this.wob += 0.12;
    if (Math.hypot(plan.v.x, plan.v.z) > 0.3) this.head.set(plan.v.x, 0, plan.v.z).normalize();
    if (plan.attack) this.atkCool = 1.0 + this.mass * 0.5;
    if (!quiet) this.owner.sound('hop', c, this.R);
  }

  fly(dt, player) {
    this.t += dt;
    const spd = this.vel.length();
    const steps = Math.min(8, Math.max(1, Math.ceil(spd * dt / Math.max(0.12, this.R * 0.5))));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vel.y -= GRAV * h;
      const from = this.center(_d);
      const was = _h.copy(this.pos);
      this.pos.addScaledVector(this.vel, h);
      const to = this.center(_e);
      if ((this.aggro || this.attacking) && this.touches(player, to)) {
        this.strike(player, this.attacking ? 1 : 0.6);
        // (off you: back the way it came, a little up)
        this.vel.set(-this.vel.x * 0.3, Math.max(1.5, Math.abs(this.vel.y) * 0.3), -this.vel.z * 0.3);
        this.attacking = false;
      }
      const hit = this.contact(from, to);
      if (hit) { this.pos.copy(was); this.onContact(hit); return; }
      if (this.owner.bounds && !this.cave && !this.owner.bounds(this.pos.x, this.pos.z)) { this.pos.copy(was); this.vel.x *= -0.4; this.vel.z *= -0.4; }
    }
    this.sqTo = 1 + Math.min(0.28, Math.abs(this.vel.y) * 0.03);
    this.leanTo.set(0, 0);
    // dripping as it goes: a dotted line of spots between its prints
    if (Math.random() < dt * (3 + 4 * this.R)) this.owner.goo.drop(_g.copy(this.pos).addScaledVector(UP, this.H * 0.1), _b.copy(this.vel).multiplyScalar(0.3), 0.03 + 0.03 * this.R, this.color, true);
    // (lost: fell through something, or out of the world)
    if (this.t > 5 || this.pos.y < -80) {
      const f = this.floorAt(this.pos.x, this.pos.z, this.home.y + 2);
      if (f !== null && this.t < 8) return;
      this.pos.copy(this.home); this.vel.set(0, 0, 0); this.state = 'idle'; this.t = 0;
    }
  }

  /** Whether its body (at centre c) is up against you. */
  touches(player, c) {
    const P = player.pos;
    const r = Math.max(this.R * 0.8, this.H * 0.4) + 0.32;
    const dx = c.x - P.x, dz = c.z - P.z;
    return dx * dx + dz * dz < r * r && c.y > P.y - this.H * 0.4 && c.y < P.y + 1.8 + this.H * 0.4;
  }

  /** A blow on you: its slam (k: how squarely), thrown back a little; burning or acid with it. */
  strike(player, k = 1) {
    if (this.hitCool > 0 || !this.owner.active) return;
    this.hitCool = 0.65;
    const extra = this.sp.touch === 'burn' ? 1.3 : this.sp.touch === 'acid' ? 1.2 : 1;
    this.owner.onPlayerHit?.(this.dmg * k * extra, this, 'melee');
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    const push = 2.2 * Math.sqrt(this.mass) * k;
    player.vel.x += dx / d * push; player.vel.z += dz / d * push;
    const at = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
    this.owner.goo.spray(at, _b.set(-dx / d, 0.4, -dz / d), Math.round(10 + 16 * this.R), this.color, { speed: 2.5, size: 0.025 });
    const fx = this.owner.fx;
    if (fx && this.sp.touch === 'burn') fx.particles.burst(at, [new THREE.Color(3, 1.4, 0.3), new THREE.Color(2.4, 0.6, 0.1)], 22, { speed: 2.5, size: 0.04, grav: -1, life: 0.6 });
    if (fx && this.sp.touch === 'acid') fx.particles.burst(at, [this.color.clone().multiplyScalar(2.5)], 18, { speed: 2, size: 0.035, grav: 3, life: 0.6 });
    this.owner.sound('land', at, this.R, 6);
  }

  /** It ran into something: lands on a floor, sticks (a clinger) or bounces off anything else. */
  onContact(hit) {
    const imp = Math.max(0, -this.vel.dot(hit.n));
    const o = this.owner;
    if (hit.kind === 'floor') {
      this.pos.copy(hit.p); this.n.copy(hit.n.y > 0.8 ? hit.n : UP);
      this.vel.set(0, 0, 0);
      this.state = 'land'; this.t = 0; this.attacking = false; this.noStick = false;
      this.sqV -= 2.2 + imp * 0.8; this.wob += Math.min(0.45, imp * 0.045); this.ripple = Math.min(1, imp * 0.12);
      o.sound('land', hit.p, this.R, imp);
      if (imp > 4) o.goo.spray(_g.copy(hit.p).addScaledVector(UP, 0.05), UP, Math.round(imp * this.R * 2), this.color, { speed: 1.6, spread: 1.4, size: 0.02 });
      o.goo.splat(hit.p, this.n, this.R * (0.95 + Math.min(0.5, imp * 0.04)), this.color, 30);   // its print where it came down
      return;
    }
    const fresh = this.leftT > 0 && hit.n.dot(this.leftN) > 0.7;   // (the wall it has just left)
    if (this.move === 'cling' && !this.noStick && !fresh) { this.stick(hit); return; }
    if (fresh) return;
    // a hopper (or a clinger thrown off) bounces off walls and roofs
    const vn = this.vel.dot(hit.n);
    if (vn < 0) this.vel.addScaledVector(hit.n, -1.45 * vn);
    this.vel.multiplyScalar(0.75);
    this.leftN.copy(hit.n); this.leftT = 0.15;
    this.sqV -= 2 + imp * 0.4; this.wob += 0.25; this.ripple = 0.6;
    o.sound('land', hit.p, this.R * 0.8, imp);
    if (imp > 3) o.goo.splat(hit.p, hit.n, this.R * 0.55, this.color, 12);
  }

  /** Stuck to a wall or a roof, flattened against it. */
  stick(hit) {
    this.pos.copy(hit.p); this.n.copy(hit.n); this.vel.set(0, 0, 0);
    this.state = 'cling'; this.t = 0; this.wait = 0.6 + Math.random() * 1.2; this.attacking = false;
    this.sqV -= 4; this.sqTo = 0.72; this.wob += 0.45; this.ripple = 1;
    this.owner.sound('stick', hit.p, this.R);
    this.owner.goo.splat(hit.p, hit.n, this.R * 0.95, this.color, 25);
  }

  clingThink(dt, player) {
    const o = this.owner, roof = this.n.y < -0.55, P = player.pos;
    this.sqTo = 0.74 + 0.03 * Math.sin(o.time * 2 + this.wobP);
    // a drip now and then: the warning
    if (Math.random() < dt * (roof ? 1.4 : 0.45)) {
      const tip = this.pos.clone().addScaledVector(this.n, this.H * 0.8);
      o.goo.drop(tip, _b.set(0, -0.2, 0), 0.025 + 0.02 * this.R, this.color);
      if (roof && Math.random() < 0.3) o.sound('drip', tip, this.R);
    }
    if (roof && this.cave && this.aggro) {
      // along the roof until it's over you; then down
      const dx = P.x - this.pos.x, dz = P.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.6 + this.R * 0.6 && P.y < this.pos.y - 0.8) {
        this.state = 'drip'; this.t = 0; this.sqTo = 1.55; this.wob += 0.2;
        o.sound('gurgle', this.pos, this.R);
        return;
      }
      if (d > 0.2) {
        const step = (0.9 + 0.55 / (this.R + 0.3)) * dt;
        const nx = this.pos.x + dx / d * step, nz = this.pos.z + dz / d * step;
        const r = this.cave.rockAt(nx, nz, ROCK);
        if (r && r.s < 0.25 && Number.isFinite(r.roof) && r.roof - r.floor > 2.2) {
          const ox = this.pos.x, oz = this.pos.z;
          this.pos.set(nx, r.roof, nz);
          this.cave.rockNormal(nx, nz, true, this.n);
          this.head.set(dx / d, 0, dz / d);
          this.wetTrail(Math.hypot(nx - ox, nz - oz));   // (a smear along the roof behind it)
          this.leanTo.set(0, -0.08);
          return;
        }
      }
      // (no roof that way: it leaps at you from here, once it has waited)
      if (this.t > this.wait && this.canSee && this.atkCool <= 0) { this.launch(this.aimAt(_b.set(P.x, P.y + 0.6, P.z), Math.max(this.pos.y - 0.3, P.y + 1.5), true)); this.noStick = true; }
      return;
    }
    if (this.t < this.wait) return;
    const d3 = Math.hypot(P.x - this.pos.x, P.y + 1 - this.pos.y, P.z - this.pos.z);
    if (this.aggro && this.canSee && d3 < 11 && this.atkCool <= 0) {
      // at you, off the wall
      this.launch(this.aimAt(_b.set(P.x + player.vel.x * 0.2, P.y + 0.7, P.z + player.vel.z * 0.2), Math.max(this.pos.y, P.y + 1) + 0.6, true));
      return;
    }
    if (roof && !this.aggro) { this.t = 0; this.wait = 2 + Math.random() * 3; return; }   // it hangs there till something comes by
    // on to the next wall, or down to the ground
    const perch = Math.random() < 0.7 ? this.findPerch(player) : null;
    if (perch) this.launch(this.aimAt(perch.p, perch.p.y + 0.7, false, true));
    else { this.launch({ v: _b.copy(this.n).multiplyScalar(2.2).add(_c.set(0, 1.2, 0)), attack: false }); this.noStick = true; }
  }

  /** Hanging from the roof over you, drawing out into a drop; then it falls. */
  dripThink(dt, player) {
    this.sqTo = 1.6;
    if (Math.random() < dt * 8) this.owner.goo.drop(this.pos.clone().addScaledVector(this.n, this.H * 1.3), _b.set(0, -0.5, 0), 0.03, this.color);
    if (this.t < 0.38) return;
    const P = player.pos;
    this.launch({ v: _b.set((P.x - this.pos.x) * 0.8, -1, (P.z - this.pos.z) * 0.8), attack: true });
    this.noStick = true;
    this.atkCool = 2;
  }

  /** Somewhere to leap and stick: the roof (in a cave: over you, or about), else a wall, a cliff
   * or a trunk within a leap (found by rays out from it). {p, n} or null. */
  findPerch(player) {
    const c = this.center(_d), P = player.pos;
    if (this.cave && this.cave.contains(c)) {
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * 6.283;
        const r = this.aggro ? 1 + Math.random() * 2.5 : 1 + Math.random() * 5;
        const x = (this.aggro ? P.x : this.pos.x) + Math.cos(a) * r, z = (this.aggro ? P.z : this.pos.z) + Math.sin(a) * r;
        if (Math.hypot(x - this.pos.x, z - this.pos.z) > 9) continue;
        const rk = this.cave.rockAt(x, z, ROCK);
        if (!rk || rk.s > 0 || !Number.isFinite(rk.roof) || rk.roof - rk.floor < 2.4 || rk.roof - this.pos.y > 8) continue;
        return { p: new THREE.Vector3(x, rk.roof, z), n: this.cave.rockNormal(x, z, true, new THREE.Vector3()) };
      }
      return null;
    }
    let best = null, bs = -Infinity;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * 6.283, el = i < 6 ? 0.2 + Math.random() * 0.35 : 0.6 + Math.random() * 0.45;
      const d = _a.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
      const h = this.owner.physics.ray([c.x, c.y, c.z], [d.x, d.y, d.z], 9);
      if (!h || h.t < 1.4 || Math.abs(h.normal[1]) > 0.6) continue;
      const p = c.clone().addScaledVector(d, h.t);
      let s = Math.random() - h.t * 0.08;
      if (this.aggro) s -= Math.hypot(p.x - P.x, p.z - P.z) * 0.35;
      if (s > bs) { bs = s; best = { p, n: new THREE.Vector3(h.normal[0], h.normal[1], h.normal[2]) }; }
    }
    return best;
  }

  oozeThink(dt, player) {
    const st = this.state, P = player.pos, o = this.owner;
    const dx = P.x - this.pos.x, dz = P.z - this.pos.z, d = Math.hypot(dx, dz);
    const reach = this.R * this.long + 0.5;
    const level = Math.abs(P.y - this.pos.y) < 1.6;
    if (st === 'windup') {   // rearing back
      this.ground(dt);
      if (d > 0.1) this.turnTo(_a.set(dx, 0, dz), dt, 6);
      this.leanTo.set(0, -0.2); this.sqTo = 1.2; this.stretch += (0.85 - this.stretch) * Math.min(1, dt * 10);
      if (this.t > 0.38) { this.state = 'lunge'; this.t = 0; o.sound('hop', this.pos, this.R); }
      return;
    }
    if (st === 'lunge') {    // thrown forward, drawn out long
      const k = Math.max(0, 1 - this.t / 0.24);
      this.crawl(dt, this.head, 1 + 5.5 * k);
      this.leanTo.set(0, 0.32); this.sqTo = 0.78; this.stretch += (1.55 - this.stretch) * Math.min(1, dt * 14);
      if (this.t > 0.24) {
        if (d < reach + 0.4 && level) { this.strike(player); if (this.big) this.engulf(player); }
        this.state = 'recoil'; this.t = 0; this.atkCool = 1 + this.mass * 0.4;
      }
      return;
    }
    if (st === 'recoil') {
      this.ground(dt);
      this.sqTo = 1.06; this.leanTo.set(0, -0.06); this.stretch += (1 - this.stretch) * Math.min(1, dt * 6);
      if (this.t > 0.42) { this.state = 'ooze'; this.t = 0; }
      return;
    }
    if (st !== 'ooze') { this.state = 'ooze'; this.t = 0; }
    if (this.aggro && this.canSee && d < reach && level && this.atkCool <= 0) { this.state = 'windup'; this.t = 0; o.sound('gurgle', this.pos, this.R); return; }
    // a big one over you holds you (and burns, or eats at you)
    if (this.aggro && this.big && d < this.R * 0.85 && level) {
      player.heldT = Math.max(player.heldT, 0.3);
      if ((this.engulfT -= dt) <= 0) { this.engulfT = 0.8; this.strike(player, 0.3); this.hitCool = 0; }
    }
    const goal = this.goalPoint();
    const dir = _c;
    let speed;
    if (this.aggro) {
      if (!(this.dg && o.zombies?.flowDir(this.pos, dir, this.dg))) dir.set(goal.x - this.pos.x, 0, goal.z - this.pos.z);
      speed = SIZES[this.size].ooze || 1.8;
      if (d < 0.5) speed = 0;
    } else { dir.set(goal.x - this.pos.x, 0, goal.z - this.pos.z); speed = 0.4; }
    if (dir.lengthSq() < 0.04 || speed === 0) { this.ground(dt); this.stretch += (1 - this.stretch) * Math.min(1, dt * 3); return; }
    dir.normalize();
    this.turnTo(dir, dt, 2.4);
    // it pours: surges and gathers
    this.phase += dt * (2.2 + 0.7 / this.R) * (this.aggro ? 1.35 : 0.8);
    const surge = 0.5 + 0.5 * Math.sin(this.phase);
    this.crawl(dt, this.head, speed * (0.3 + 1.1 * surge));
    this.leanTo.set(0, 0.13 * surge - 0.04); this.sqTo = 1 - 0.13 * surge;
    this.stretch += (1 + 0.2 * surge - this.stretch) * Math.min(1, dt * 8);
  }

  engulf(player) {
    player.heldT = Math.max(player.heldT, 1.1);
    const o = this.owner;
    if (o.time - (o.grabToast ?? -99) > 6) { o.grabToast = o.time; o.onGrab?.(this); }
  }

  turnTo(dir, dt, rate) {
    const want = Math.atan2(dir.x, dir.z), have = Math.atan2(this.head.x, this.head.z);
    let d = want - have;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const a = have + clamp(d, -rate * dt, rate * dt);
    this.head.set(Math.sin(a), 0, Math.cos(a));
  }

  /** Along the ground, sliding by walls, trunks and furniture; off an edge it falls. */
  crawl(dt, dir, speed) {
    const p = this.pos, ox = p.x, oz = p.z;
    this.owner.physics.slide(p, dir.x * speed * dt, dir.z * speed * dt, clamp(this.R * 0.7, 0.15, 0.7), Math.max(0.3, this.H), 0.42);
    if (this.owner.bounds && !this.cave && !this.owner.bounds(p.x, p.z)) { p.x = ox; p.z = oz; }
    const f = this.floorAt(p.x, p.z, p.y + 0.45);
    if (f !== null && this.wet(p.x, p.z, f) && !this.wet(ox, oz, p.y)) { p.x = ox; p.z = oz; return; }   // (it won't go into the water)
    if (f === null || f < p.y - 1.0) { this.n.copy(UP); this.state = 'air'; this.t = 0; this.vel.set(dir.x * speed, 0, dir.z * speed); return; }
    p.y = f;
    this.floorNormal(p.x, p.z, this.n);
    this.wetTrail(Math.hypot(p.x - ox, p.z - oz));
  }

  /** A glistening trail behind it as it goes (smears half a length apart, so it runs unbroken). */
  wetTrail(moved, n = this.n) {
    const gap = 0.12 + this.R * 0.18;
    if ((this.trail += moved) < gap) return;
    this.trail = 0;
    const back = _g.copy(this.pos).addScaledVector(this.head, -this.R * this.long * 0.35);
    this.owner.goo.trail(back, n, this.R * (this.move === 'ooze' ? 1.6 : 0.8), gap * 2.1, this.head, this.color, this.move === 'ooze' ? 45 : 30);
  }

  /** Kept on the ground where it sits (a slope, a cave's floor); it falls if that goes. */
  ground() {
    if (this.n.y < 0.5) return;
    const p = this.pos, f = this.floorAt(p.x, p.z, p.y + 0.45);
    if (f === null || f < p.y - 0.4) { this.state = 'air'; this.t = 0; this.vel.set(0, 0, 0); return; }
    p.y = f;
  }

  /** Whether a base at (x, y, z) would be under water (the Downs' stream and pool, a cave's pool). */
  wet(x, z, y) {
    const w = this.cave?.water;
    if (w) return Math.hypot(x - w.x, z - w.z) < w.r + 0.3 && y < w.y - 0.05;
    return !this.cave && this.owner.wet(x, z, y);
  }

  floorAt(x, z, y) {
    if (this.cave) { const r = this.cave.rockAt(x, z, ROCK); if (r && r.s < 0.6) return r.floor; }
    const f = this.owner.physics.floorAt(x, z, y, 0.12, 0.5);
    return f === -Infinity ? null : f;
  }

  floorNormal(x, z, out) {
    if (this.cave && this.cave.rockAt(x, z, ROCK)) {
      this.cave.rockNormal(x, z, false, out);
      if (out.y < 0.75) out.lerp(UP, 0.5).normalize();
      return out;
    }
    const ph = this.owner.physics;
    if (Math.abs(ph.groundAt(x, z) - this.pos.y) < 0.05) {   // on the open ground: its slope
      const e = 0.4;
      out.set(ph.groundAt(x - e, z) - ph.groundAt(x + e, z), 2 * e, ph.groundAt(x, z - e) - ph.groundAt(x, z + e)).normalize();
      if (out.y < 0.8) out.lerp(UP, 0.5).normalize();
      return out;
    }
    return out.copy(UP);
  }

  /** What its step from centre `from` to `to` runs into: {p (on the surface), n, kind: floor, wall
   * or roof} or null. In a cave, the rock as it is drawn; elsewhere the world's boxes, segment
   * walls and the ground's slopes. */
  contact(from, to) {
    const cv = this.cave;
    if (cv) {
      const r = cv.rockAt(to.x, to.z, ROCK);
      if (r) {
        const ey = this.H * 0.5 * this.sq;
        if (r.s > 0.85) { const n = cv.wallNormal(to.x, to.z, new THREE.Vector3()); return { p: from.clone().addScaledVector(n, -this.R * 0.55), n, kind: 'wall' }; }
        if (Number.isFinite(r.roof) && to.y + ey > r.roof) { const n = cv.rockNormal(to.x, to.z, true, new THREE.Vector3()); return { p: new THREE.Vector3(to.x, r.roof, to.z), n, kind: n.y < -0.5 ? 'roof' : 'wall' }; }
        if (to.y - ey < r.floor) { const n = cv.rockNormal(to.x, to.z, false, new THREE.Vector3()); return { p: new THREE.Vector3(to.x, r.floor, to.z), n, kind: n.y > 0.6 ? 'floor' : 'wall' }; }
        return null;
      }
    }
    const ph = this.owner.physics;
    const d = _f.subVectors(to, from), len = d.length();
    if (len > 1e-5) {
      d.divideScalar(len);
      const ext = Math.abs(d.y) * this.H * 0.5 + (1 - Math.abs(d.y)) * this.R * 0.8;
      const h = ph.ray([from.x, from.y, from.z], [d.x, d.y, d.z], len + ext);
      if (h) {
        const n = new THREE.Vector3(h.normal[0], h.normal[1], h.normal[2]);
        return { p: from.clone().addScaledVector(d, h.t), n, kind: n.y > 0.6 ? 'floor' : n.y < -0.6 ? 'roof' : 'wall' };
      }
    }
    const base = to.y - this.H * 0.5 * this.sq;
    const f = ph.floorAt(to.x, to.z, to.y, 0.12, 0);
    if (f > -Infinity && base < f) return { p: new THREE.Vector3(to.x, f, to.z), n: this.floorNormal(to.x, to.z, new THREE.Vector3()), kind: 'floor' };
    return null;
  }

  /** What lingers on it: returns how fast it moves this frame (0 frozen). */
  afflict(dt) {
    const res = this.sp.resist || {};
    if (this.chillT > 0) { this.chillT -= dt; this.chilled = Math.max(this.chilled || 0, 0.1); }   // (the shield's frost)
    if (this.burnT > 0) { this.burnT -= dt; this.harm((this.burnDps || 4) * dt * (res.fire ?? 1)); }
    if (this.burning > 0) {
      this.burning -= dt; this.harm((this.burnDps || 6) * dt * (res.fire ?? 1));
      if (Math.random() < dt * 8) this.owner.fx?.smoke?.emit(this.center(new THREE.Vector3()), _b.set((Math.random() - 0.5) * 0.3, 0.9, (Math.random() - 0.5) * 0.3), { life: 1.4, size: 0.3 + this.R * 0.3, grow: 0.8, alpha: 0.22, shade: 0.95 });
    }
    if (this.poisoned > 0) { this.poisoned -= dt; this.harm((this.poisonDps || 5) * dt * (res.poison ?? 1)); }
    if (this.frozen > 0) this.frozen -= dt;
    if (this.chilled > 0) this.chilled -= dt;
    return this.frozen > 0 ? 0 : this.chilled > 0 ? 0.45 : 1;
  }

  popping(dt) {
    this.t += dt;
    const k = Math.min(1, this.t / 0.1);
    this.pulse = 0.4 * k * k; this.wob = 0.06 + 0.25 * k; this.sqTo = 1;
    this.frontMat.emissive.copy(this.color).multiplyScalar(0.25 + 2.4 * k * k);
    if (this.t >= 0.1) this.owner.burst(this);
  }

  /** The body's springs and its place, turn and shape for the frame. */
  pose(dt, pace = 1) {
    const frozen = this.frozen > 0;
    if (!frozen) {
      const kk = 170 / this.mass, c = 5.5 / Math.sqrt(this.mass);
      this.sqV += (-(this.sq - this.sqTo) * kk - this.sqV * c) * dt;
      this.sq = clamp(this.sq + this.sqV * dt, 0.35, 1.9);
      const kl = 95 / this.mass, cl = 7;
      this.leanV.x += (-(this.lean.x - this.leanTo.x) * kl - this.leanV.x * cl) * dt;
      this.leanV.y += (-(this.lean.y - this.leanTo.y) * kl - this.leanV.y * cl) * dt;
      this.lean.x += this.leanV.x * dt; this.lean.y += this.leanV.y * dt;
      this.wob = 0.035 + (this.wob - 0.035) * Math.exp(-dt * 2.4);
      this.wobP += dt * (5 + 3 / (this.R + 0.2)) * pace;
      this.ripple *= Math.exp(-dt * 3); this.ripP += dt * 12;
      this.dent *= Math.exp(-dt * 7);
    }
    // the ice over it, coming and going
    const ice = frozen ? 1 : 0;
    if (Math.abs(this.ice - ice) > 1e-3) {
      this.ice += (ice - this.ice) * Math.min(1, dt * 6);
      if (Math.abs(this.ice - ice) < 0.02) this.ice = ice;
      const f = this.frontMat, sp = this.sp;
      f.color.set(sp.color).lerp(ICE, this.ice * 0.75);
      f.opacity = sp.opacity + this.ice * 0.3;
      f.roughness = 0.12 + this.ice * 0.25;
      f.emissive.set(sp.color).multiplyScalar(sp.glow * 0.8 * (1 - this.ice)).lerp(ICE_GLOW, this.ice * 0.5);
    }
    const st = this.stretch, k = 1 / Math.sqrt(st * this.sq);
    this.u.uSq.value.set(k, this.sq, st * k);
    this.u.uLean.value.set(this.lean.x, 0, this.lean.y);
    this.u.uWob.value.set(this.wob, this.wobP, this.ripple, this.ripP);
    this.u.uDent.value.set(this.dentDir.x, this.dentDir.y, this.dentDir.z, this.dent);
    this.u.uPulse.value = this.pulse;
    // what's inside rides along, sloshing behind
    this.innerBox.scale.set(k, this.sq, st * k);
    this.innerBox.position.set(this.lean.x * 0.3, 0, this.lean.y * 0.3);
    this.inner.rotation.y += dt * 0.3 * pace;
    // its up along the surface it's on (or a little toward where it's flying), its front its way
    const up = this.state === 'air' ? _a.set(this.vel.x * 0.06, 1, this.vel.z * 0.06).normalize() : _a.copy(this.n);
    const f = _b.copy(this.head).addScaledVector(up, -this.head.dot(up));
    if (f.lengthSq() < 1e-5) { f.set(0, 1, 0).addScaledVector(up, -up.y); if (f.lengthSq() < 1e-5) f.set(1, 0, 0); }   // (facing straight into a wall: its front up the wall)
    f.normalize();
    const r = _c.crossVectors(up, f).normalize();
    _m.makeBasis(r, up, f);
    _q.setFromRotationMatrix(_m);
    this.root.quaternion.slerp(_q, 1 - Math.exp(-dt * 16));
    this.center(this.root.position);
    this.body.position.set(0, -this.H * 0.5 * this.sq, 0);
  }
}
const ICE = new THREE.Color(0xd6ecff), ICE_GLOW = new THREE.Color(0.25, 0.4, 0.55);

/** Distance along a ray (o, unit d) to a capsule (segment a-b, radius r), or null. */
function rayCapsule(o, d, a, b, r) {
  const ab = _s.subVectors(b, a), ao = new THREE.Vector3().subVectors(o, a);
  const abab = ab.dot(ab), abd = ab.dot(d), abao = ab.dot(ao), dao = d.dot(ao);
  const den = abab - abd * abd;
  let t = den > 1e-8 ? (abd * abao - abab * dao) / den : 0;
  t = Math.max(0, t);
  const s = Math.max(0, Math.min(1, abab > 0 ? (abao + t * abd) / abab : 0));
  const q = a.clone().addScaledVector(ab, s);
  const tq = Math.max(0, q.clone().sub(o).dot(d));
  const dist = o.clone().addScaledVector(d, tq).distanceTo(q);
  if (dist > r) return null;
  return Math.max(0, tq - Math.sqrt(r * r - dist * dist));
}

// ------------------------------------------------------------------ all of them
export class Slimes {
  constructor(scene, physics, sfx = null, zombies = null) {
    this.scene = scene; this.physics = physics; this.sfx = sfx; this.zombies = zombies;
    this.list = [];
    this.time = 0;
    this.quiet = false;      // (the rehearsal: nothing counted, nothing dropped)
    this.player = null; this.active = false;
    this.fx = null;          // {particles, waves, flash(p, color, power), smoke}: main.js
    this.onPlayerHit = null; this.onDeath = null; this.onGrab = null; this.loot = null; this.bounds = null;
    this.goo = new Goo(scene, (x, z, y) => this.floorBelow(x, z, y));
    this.shells = Object.fromEntries(Object.keys(SHAPES).map((k) => [k, shellGeometry(k)]));
    this.inner = {}; this.innerMats = {};
    this.sounded = {};
  }

  // the parts they share
  innards(key) {
    const v = this.inner[key] ||= [0, 1].map((i) => innardsGeometry(SPECIES[key], 7 + i * 131 + key.length * 17));
    return v[Math.floor(Math.random() * v.length)];
  }
  innerMat(key) {
    const sp = SPECIES[key];
    return this.innerMats[key] ||= selfLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }), 0.05 + sp.glow * 1.4, 'slime-innards');
  }
  /** Each slime's own: the near and far sides of its jelly, sharing the shape's numbers. */
  materials(sp) {
    const u = { uSq: { value: new THREE.Vector3(1, 1, 1) }, uLean: { value: new THREE.Vector3() }, uWob: { value: new THREE.Vector4() },
      uDent: { value: new THREE.Vector4(0, 1, 0, 0) }, uPulse: { value: 0 } };
    const make = (back) => {
      const col = new THREE.Color(sp.color);
      const m = new THREE.MeshStandardMaterial({ color: back ? col.clone().multiplyScalar(0.4) : col, roughness: back ? 0.4 : 0.1, metalness: 0,
        transparent: true, depthWrite: false, opacity: back ? sp.opacity * 0.6 : sp.opacity, side: back ? THREE.BackSide : THREE.FrontSide,
        emissive: col.clone().multiplyScalar(sp.glow * (back ? 1.4 : 0.8)) });
      const own = { uRim: { value: new THREE.Color(sp.rim).multiplyScalar(back ? 0.12 : 0.3 + sp.glow) }, uFres: { value: back ? 0.2 : 0.6 } };
      m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, u, own); shellShader(sh); };
      m.customProgramCacheKey = () => 'slime-shell';
      return m;
    };
    return { u, front: make(false), back: make(true) };
  }

  spawn(key, size, at, o = {}) {
    const s = new Slime(this, key, size, at, o);
    this.list.push(s);
    return s;
  }

  /** Hung from a cave's roof over (x, z): it waits there. */
  hang(s, x, z) {
    const r = s.cave?.rockAt(x, z, ROCK);
    if (!r || !Number.isFinite(r.roof)) return false;
    s.pos.set(x, r.roof, z);
    s.cave.rockNormal(x, z, true, s.n);
    s.state = 'cling'; s.t = 0; s.wait = 2 + Math.random() * 3; s.sq = s.sqTo = 0.74;
    s.pose(1);
    return true;
  }

  /** Where they live. Underground: the three caves of the cliff (each in the chambers that suit
   * them: the clingers under domed roofs, the oozes down passages and seeps, the big ones that come
   * apart where there's room to circle them). Out in the world: a bog in the Darkwood, the wet
   * meadow down the Downs' stream, and the cliff by Brightwater Falls, where the spray keeps the
   * rock wet and the azure jellies bounce about its face. few(n): how many for the device. */
  populate(ctx, few = (n) => n) {
    this.bounds = ctx.inBounds || null;
    const cave = (name) => ctx.unders.find((u) => u.dg?.cave && u.dg.name === name)?.dg;
    const caves = [
      [cave('The Gloamhollow'), [
        ['cavern', [['violet', 'S', 3, 'roof'], ['violet', 'XS', 2, 'roof']]],   // under the great dome, round the glowing pool
        ['bones', [['ossuary', 'L', 1]]],                                        // fat on what the ghasts leave
        ['loop', [['pitch', 'L', 1]]],
      ]],
      [cave('The Drowned Grotto'), [
        ['pool', [['azure', 'M', 3, 'roof'], ['azure', 'S', 2]]],
        ['cistern', [['bog', 'M', 2]]],
        ['drowned', [['crimson', 'XL', 1], ['azure', 'S', 2, 'roof']]],          // the drowned shrine: room to circle the big one
        ['gallery', [['azure', 'XS', 2]]],
      ]],
      [cave('The Trollhole'), [
        ['grove', [['toxic', 'XS', 4], ['toxic', 'S', 3], ['amber', 'M', 1]]],   // a swarm in the fungus they glow like
        ['seep', [['amber', 'L', 1], ['amber', 'M', 1]]],
        ['lair', [['pitch', 'XL', 1], ['ossuary', 'L', 1]]],
        ['larder', [['violet', 'S', 2, 'roof']]],
      ]],
    ];
    let n = 0;
    for (const [dg, plan] of caves) {
      if (!dg?.rock) continue;
      for (const [tag, mix] of plan) for (const [key, size, count, where] of mix) {
        const big = BIG[size];
        for (let i = 0, m = big ? count : few(count); i < m; i++) {
          const p = dg.spot(tag, 1.2);
          const w = dg.rock.water;
          if (!p || (where !== 'roof' && w && Math.hypot(p.x - w.x, p.z - w.z) < w.r + 0.5)) continue;
          const s = this.spawn(key, size, p, { zone: 'cave', dg });
          if (where === 'roof' && !this.hang(s, p.x, p.z)) s.pos.y = p.y;
          n++;
        }
      }
    }
    // out in the world
    const ph = this.physics;
    const places = [
      { x: 84, z: -165, r: 13, mix: [['mire', 'M', 3], ['mire', 'L', 1], ['bog', 'L', 1], ['toxic', 'XS', 3], ['violet', 'S', 2]] },   // the Darkwood's bog, among the trunks
      { x: 400, z: -128, r: 18, mix: [['mire', 'S', 3], ['mire', 'M', 2], ['bog', 'M', 2], ['crimson', 'XL', 1]] },                    // the wet meadow down the stream
      { x: 718, z: -60, r: 7, mix: [['azure', 'S', 3], ['azure', 'M', 2]] },                                                           // under the cliff by the falls
    ];
    for (const pl of places) for (const [key, size, count] of pl.mix) {
      for (let i = 0, m = BIG[size] ? count : few(count); i < m; i++) {
        for (let t = 0; t < 12; t++) {
          const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * pl.r;
          const x = pl.x + Math.cos(a) * d, z = pl.z + Math.sin(a) * d;
          if (this.bounds && !this.bounds(x, z)) continue;
          const y = ph.groundAt(x, z);
          const R = SIZES[size].R;
          if (!ph.clear(x, z, y + 0.05, R * 0.8, Math.max(0.4, R), 0) || this.wet(x, z, y)) continue;
          this.spawn(key, size, new THREE.Vector3(x, y, z), { zone: 'wild', home: new THREE.Vector3(pl.x, y, pl.z) });
          n++;
          break;
        }
      }
    }
    return n;
  }

  /** Under the Downs' water: the stream, the falls' pool. */
  wet(x, z, y) {
    if (x < REGION.x0) return false;
    if (Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 2) return y < POOL.level - 0.05;
    const st = streamAt(x, z);
    return st.d < 9 && y < streamLevel(st.s) - 0.05;
  }

  /** The surface below (x, y, z): a cave's floor as drawn, else the world's. */
  floorBelow(x, z, y) {
    for (const c of this.caves()) {
      if (x < c.px - 1 || x > c.px + c.a0 + c.nx * 0.5 + 1) continue;
      const r = c.rockAt(x, z, ROCK);
      if (r && r.s < 0.6 && y > r.floor - 0.5 && (!Number.isFinite(r.roof) || y < r.roof + 0.5)) return r.floor;
    }
    const f = this.physics.floorAt(x, z, y, 0.02, 0.05);
    return f === -Infinity ? y - 30 : f;
  }
  caves() { return this._caves ||= [...new Set(this.list.map((s) => s.cave).filter(Boolean))]; }

  /** The nearest a ray hits within `far`: {t, bone, point, z} or null. */
  ray(o, d, far) {
    let best = null;
    for (const s of this.list) {
      const h = s.ray(o, d, far);
      if (h && (!best || h.t < best.t)) best = h;
    }
    return best;
  }

  /** A blast at `at`: every slime near takes it, the nearer the harder. */
  blast(at, radius, dmg, kind = 'fire') {
    const out = [];
    for (const s of this.list) {
      if (s.dead) continue;
      const c = s.center(new THREE.Vector3());
      const d = c.distanceTo(at) - s.R * 0.8;
      if (d >= radius) continue;
      const k = 1 - Math.max(0, d) / radius;
      const dir = c.clone().sub(at);
      if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0); else dir.normalize();
      s.hit({ point: c.clone().addScaledVector(dir, -s.R * 0.5), bone: s.core, z: s, t: 0 }, { dmg: dmg * k, dir, heavy: k > 0.6, kind });
      out.push({ z: s, k, dir });
    }
    return out;
  }

  /** A noise at p carries r metres: they come to see. */
  noise(p, r) {
    for (const s of this.list) {
      if (s.dead) continue;
      if (s.pos.distanceTo(p) > r * 0.8) continue;
      s.aggro = true; s.last.copy(p); s.hasLast = true; s.lastT = this.time - 3;
    }
  }

  /** One that has found you stirs those near it. */
  alert(from, p) {
    if (!p) return;
    for (const s of this.list) {
      if (s === from || s.dead || s.aggro) continue;
      if (s.pos.distanceTo(from.pos) > 9) continue;
      s.aggro = true; s.last.copy(p); s.hasLast = true; s.lastT = this.time;
    }
  }

  forget() { for (const s of this.list) { s.aggro = false; s.hasLast = false; s.attacking = false; } }

  /** Its end: sparks, goo, chunks and a splash; the big ones come apart; now and then what it had
   * swallowed is left lying. */
  burst(s) {
    const c = s.center(new THREE.Vector3()), n = s.n.clone(), R = s.R, col = s.color, fx = this.fx, g = this.goo;
    const floor = this.floorBelow(c.x, c.z, c.y);
    const iced = s.iced;
    const hot = (iced ? ICE : col).clone().multiplyScalar(2.6 + s.sp.glow * 3), pale = col.clone().lerp(WHITE, 0.55).multiplyScalar(2.2), deep = col.clone().multiplyScalar(1.3);
    if (fx) {
      fx.particles.burst(c, [hot, pale, deep], Math.round(40 + 80 * R), { speed: 3.2 + 5 * R, size: 0.045 + 0.05 * R, grav: 8, life: 0.85, drag: 1.1, floor });
      fx.particles.burst(c, [hot, pale], Math.round(16 + 28 * R), { speed: 0.8 + 1.4 * R, size: 0.028, grav: -0.15, life: 2.2, drag: 2.2 });   // motes drifting after
      if (iced) fx.particles.burst(c, [new THREE.Color(2.4, 2.8, 3.2), new THREE.Color(1.2, 1.8, 2.6)], Math.round(30 + 40 * R), { speed: 4 + 3 * R, size: 0.04, grav: 9, life: 0.7, floor });
      fx.waves?.add(c, n, col.clone().multiplyScalar(0.5), { size: 0.7 + 1.3 * R, life: 0.22 });
      fx.flash?.(c, col, 1.0 + 1.6 * R);
    }
    // the goo, flung out over everything (away from what it was stuck to)
    const nd = Math.round(26 + 70 * R);
    for (let i = 0; i < nd; i++) {
      rnd(_a).addScaledVector(n, 0.6).normalize().multiplyScalar(1.5 + Math.random() * (3 + 3 * R));
      g.drop(_b.copy(c).addScaledVector(rnd(_c), R * 0.4 * Math.random()), _a, 0.03 + Math.random() * 0.05 * R + 0.01, col);
    }
    // chunks of it, and its heart, dark, the last to melt
    const nc = Math.min(10, Math.round(3 + 7 * R));
    for (let i = 0; i < nc; i++) g.chunk(_b.copy(c).addScaledVector(rnd(_c), R * 0.3), rnd(_a).multiplyScalar(2 + Math.random() * 2.5).add(_c.copy(n).multiplyScalar(2 + Math.random() * 2)), R * (0.1 + Math.random() * 0.12), col);
    g.chunk(c, _a.copy(n).multiplyScalar(2.2).add(_c.set(0, 1, 0)), R * 0.24, col.clone().multiplyScalar(0.35));
    // the splash where it was (on the floor, the wall or the roof), dripping off a roof a while
    g.splat(s.pos, n, R * (1.6 + Math.random() * 0.5), col, 45);
    if (n.y < -0.4) g.drips.push({ p: s.pos.clone().addScaledVector(n, 0.03), col: col.clone(), t: 7, k: 5 });
    this.sound('pop', c, R);
    // the big ones come apart into small ones of their own colour
    const split = SIZES[s.size].split;
    if (split && s.sp.splits?.includes(s.size)) {
      const [into, count] = split, m = count + (Math.random() < 0.35 ? 1 : 0);
      for (let i = 0; i < m; i++) {
        const a = (i / m) * 6.283 + Math.random() * 0.6;
        const ch = this.spawn(s.key, into, c, { zone: s.zone, dg: s.dg, home: s.home, rehearsal: s.rehearsal });
        ch.n.copy(UP); ch.pos.copy(c).addScaledVector(UP, -ch.H * 0.5);
        const out = 2.2 + Math.random() * 1.8;
        ch.vel.set(Math.cos(a) * out, n.y < -0.4 ? -1 : 3.6 + Math.random() * 2.4, Math.sin(a) * out);
        ch.state = 'air'; ch.t = 0; ch.noStick = true;
        ch.aggro = s.aggro; ch.last.copy(s.last); ch.hasLast = s.hasLast; ch.lastT = this.time;
        ch.invuln = 0.35; ch.sq = 0.55; ch.sqV = 7; ch.wob = 0.4;
        ch.pose(1 / 60);
      }
    }
    // now and then something it had swallowed is left lying
    if (this.loot && !this.quiet && s.big && Math.random() < 0.15) this.loot.drop([c.x, floor + 0.1, c.z], { tier: s.cave ? 2 : 1, under: !!s.cave });
    s.remove();
  }

  /** Their sounds, made on the spot (no recordings): a bloop, a wet slap, a squelch, the pop. */
  sound(kind, p, R = 0.5, imp = 3) {
    const s = this.sfx;
    if (!s?.ctx || !s.ok) return;
    const q = s.place(p, 32);
    if (q.k < 0.01) return;
    const t = s.ctx.currentTime;
    if ((this.sounded[kind] || 0) > t) return;   // (a swarm doesn't make a din of it)
    this.sounded[kind] = t + ({ hop: 0.05, land: 0.05, drip: 0.15, gurgle: 0.3 }[kind] || 0.02);
    const k = q.k, low = 1 / (0.55 + R), G = (x) => Math.max(0.0005, x * k);
    if (kind === 'hop') {
      s._tone(t, 0.14, { type: 'sine', f0: 230 * low, f1: 520 * low, gain: G(0.14) });
      s._noise(t, 0.09, { type: 'lowpass', f0: 900, f1: 300, gain: G(0.1) });
    } else if (kind === 'land') {
      const v = Math.min(1, imp / 8);
      s._noise(t, 0.2, { type: 'lowpass', f0: 1200 * low, f1: 140, gain: G(0.2 + 0.25 * v), attack: 0.004 });
      s._tone(t, 0.16, { type: 'sine', f0: 160 * low, f1: 55, gain: G(0.12 + 0.12 * v) });
    } else if (kind === 'stick') {
      s._noise(t, 0.13, { type: 'bandpass', f0: 1500, f1: 420, q: 1.2, gain: G(0.32), attack: 0.003 });
      s._tone(t, 0.1, { type: 'sine', f0: 210 * low, f1: 80, gain: G(0.1) });
    } else if (kind === 'hurt') {
      s._noise(t, 0.22, { type: 'lowpass', f0: 1500, f1: 160, gain: G(imp ? 0.5 : 0.38), attack: 0.004 });
      s._tone(t, 0.18, { type: 'sine', f0: 190 * low, f1: 60, gain: G(0.18) });
      s._noise(t + 0.03, 0.12, { type: 'bandpass', f0: 2400, f1: 900, q: 2, gain: G(0.08) });
    } else if (kind === 'swell') {
      s._tone(t, 0.1, { type: 'sine', f0: 300 * low, f1: 900 * low, gain: G(0.08) });
    } else if (kind === 'pop') {
      s._noise(t, 0.05, { type: 'highpass', f0: 3200, f1: 1600, gain: G(0.5), attack: 0.002 });
      s._tone(t, 0.13, { type: 'sine', f0: 720 * low, f1: 150 * low, gain: G(0.3) });
      s._noise(t + 0.02, 0.5, { type: 'lowpass', f0: 1700, f1: 120, gain: G(0.42), attack: 0.005 });
      for (let i = 0; i < 4; i++) s._tone(t + 0.12 + i * 0.07 + Math.random() * 0.05, 0.05, { type: 'sine', f0: 1100 + Math.random() * 900, f1: 500, gain: G(0.04) });   // the patter of it coming down
    } else if (kind === 'gurgle') {
      const f = 80 * low;
      s._tone(t, 0.55, { type: 'sine', f0: f, f1: f * 1.6, gain: G(0.07), attack: 0.08 });
      s._noise(t, 0.5, { type: 'bandpass', f0: 420 * low, f1: 260 * low, q: 4, gain: G(0.12), attack: 0.1 });
    } else if (kind === 'drip') {
      s._tone(t, 0.06, { type: 'sine', f0: 1500, f1: 650, gain: G(0.05) });
    }
  }

  update(dt, player, active, camera, height) {
    this.time += dt;
    this.player = player; this.active = active;
    const cam = camera.position, list = this.list;
    let sh = 0;
    const S = this.goo.shadows;
    for (const s of list) {
      if (s.gone) continue;
      const dx = s.pos.x - player.pos.x, dz = s.pos.z - player.pos.z, d = Math.hypot(dx, dz);
      const far = d > 80 || (Math.abs(s.pos.y - player.pos.y) > 14 && d > 24);
      s.root.visible = !far;
      if (far && !s.aggro && s.state !== 'air' && s.state !== 'pop') continue;   // asleep
      s.update(dt, player, active);
      if (s.gone || far) continue;
      // drawn far side, then near side, the far slimes first (their jelly over what's behind it)
      const cd = s.root.position.distanceTo(cam);
      s.back.renderOrder = 1.2 + 0.4 * (1 - Math.min(1, cd / 300));
      s.front.renderOrder = s.back.renderOrder + 1e-5;
      // its shadow on the floor under it (stronger the nearer; faint under one on the roof)
      if (sh < this.goo.shadowMax && d < 45 && Math.abs(s.n.y) > 0.5) {
        const c = s.root.position;
        if ((s.shT -= dt) <= 0 || s.state === 'air') { s.shT = 0.15; s.shY = this.floorBelow(c.x, c.z, c.y); }
        const hgt = c.y - s.shY;
        const a = (s.n.y < 0 ? 0.24 : 0.42) * clamp(1 - (hgt - s.H * 0.5) / 9, 0, 1) * (1 - d / 45);
        if (a > 0.01) {
          const r = s.R * (1.25 + Math.min(0.6, Math.max(0, hgt - s.H) * 0.05)) * (s.long > 1 ? 1.15 : 1);
          S.setMatrixAt(sh, _m.compose(_a.set(c.x, s.shY + 0.02, c.z), _q.identity(), _s.set(r * 2, 1, r * 2)));
          this.goo.alpha[sh] = a;
          sh++;
        }
      }
    }
    S.count = sh;
    S.instanceMatrix.needsUpdate = true;
    S.geometry.attributes.aAlpha.needsUpdate = true;
    // they keep a little apart, and the big ones are in your way
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.state === 'air' || a.n.y < 0.5) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.state === 'air' || b.n.y < 0.5) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, min = (a.R + b.R) * 0.8;
        if (Math.abs(dx) > min || Math.abs(dz) > min || Math.abs(b.pos.y - a.pos.y) > 1) continue;
        const d = Math.hypot(dx, dz);
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) * 0.5 / d, wa = b.mass / (a.mass + b.mass), wb = 1 - wa;
        a.pos.x -= dx * push * wa * 2; a.pos.z -= dz * push * wa * 2; b.pos.x += dx * push * wb * 2; b.pos.z += dz * push * wb * 2;
      }
      if (a.R >= 0.45 && !(a.big && a.move === 'ooze' && a.aggro)) {
        const P = player.pos, dx = P.x - a.pos.x, dz = P.z - a.pos.z, min = a.R * 0.8 + 0.3;
        const d = Math.hypot(dx, dz);
        if (d < min && d > 1e-4 && P.y < a.pos.y + a.H * 0.8 && P.y > a.pos.y - 1.5) { P.x = a.pos.x + dx / d * min; P.z = a.pos.z + dz / d * min; }
      }
    }
    if (list.some((s) => s.gone)) { this.list = list.filter((s) => !s.gone); this._caves = null; }
    this.goo.update(dt, camera, height);
  }

  /** Made once in the loading, out where nobody is: a slime of every body landing, sticking,
   * frozen, struck and bursting (and coming apart), so their shaders and the goo's are made now
   * and not in your first fight. Everything is put back after. step(n): run n frames. */
  async rehearse(at, step) {
    this.quiet = true;
    const made = [['crimson', 'L'], ['azure', 'M'], ['bog', 'L'], ['amber', 'M'], ['ossuary', 'L']].map(([k, size], i) => {
      const x = at.x - 3 + i * 1.6, z = at.z - 4;
      return this.spawn(k, size, new THREE.Vector3(x, this.physics.groundAt(x, z), z), { rehearsal: true });
    });
    made[1].stick({ p: made[1].pos.clone(), n: new THREE.Vector3(0, 0, 1) });
    await step(3);
    made[3].freeze(2);
    await step(2);
    for (const s of made) s.hit({ point: s.center(), bone: s.core, z: s }, { dmg: 9999, dir: new THREE.Vector3(0, 0, -1), heavy: true, kind: 'blade' });
    await step(4);
    for (const s of this.list) if (s.rehearsal && !s.dead) { s.invuln = 0; s.hit({ point: s.center(), bone: s.core, z: s }, { dmg: 9999, dir: new THREE.Vector3(0, 0, -1), heavy: true, kind: 'fire' }); }
    await step(12);
    for (const s of this.list) if (s.rehearsal && !s.gone) s.remove();
    this.list = this.list.filter((s) => !s.rehearsal);
    this.goo.clear();
    this.quiet = false;
  }
}
