// The walking dead (templates/models/creatures/zombie/zombie_<a-g>.glb): a horde in the
// graveyard that keeps clawing its way back out of the graves, and more in the dungeon below.
//
// Every zombie is a skinned glTF with its own clips (idle, walk, run, jump, attack1-3, fall,
// death, dead, rise, getup, and on the ground: collapse, crawl, crawl_attack, crawl_death,
// crawl_dead). Seven bodies: a-c from the warrior, d-e from the female fighter, f-g from the
// male fighter.
//
// The brain: each zombie sees (a cone, a range, and a clear line from its eyes to yours),
// hears (you running carries far, walking less, standing still hardly at all; swings, clangs
// and spells carry further) and remembers where it last saw or heard you. One that finds you
// moans, and the others in earshot come. They close in from different sides instead of
// queueing, keep apart from each other, feel their way round what's in the way and jump the
// graves and walls they can get over; runners sprint and lunge. Down in the dungeon they follow
// you through the corridors by a flow field over the carved grid. Lose them and they search
// where they last had you, then drift back to wandering. Temperaments: shamblers, runners, and
// lurkers that lie buried in the graveyard or sprawled like corpses in the dungeon until you
// come close.
//
// Gore: a blow punches a jagged hole in the flesh where it lands. Wounds are kept in the
// mesh's bind space so they ride the animation; the shader tears the skin away inside them,
// rims them in raw meat and draws the body's own inner faces as wet red innards and gut. Enough
// damage to a limb, the head or the waist cuts it off: its triangles leave the body and tumble
// away as a piece of their own, the stump keeps a bone stub and spurts with a fading pulse. A
// zombie without its head keeps coming (by sound); one without a leg, or cut in half, drops
// and drags itself along with whatever arms it has left. Only destroying the body stops it.
// Blood is opaque droplets that splat and pool on the ground, with gibs of meat. Corpses sink
// into the earth after a while.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { TOUCH } from './input.js';

const ROOT = 'templates/models/creatures/zombie/';
export const VARIANTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
// The monster bodies (templates/models/creatures/monsters/<name>.glb): one human body under nine
// skins, each with its own hand-keyed idle, move, attack1, attack2, roar, hit and death. Their
// UE-style bones are renamed to the zombie body's on load so the brain and the gore drive them.
// A phone loads their phone copies (monsters/phone/, from tools/creatures/monsters_phone.py:
// every image over 1024 square halved), one at a time: the full ones carry five 2048 images
// apiece, and nine of them decoding together ran to hundreds of megabytes and killed the tab.
const MONSTER_ROOT = 'templates/models/creatures/monsters/' + (TOUCH ? 'phone/' : '');
export const MONSTERS = ['grave_zombie', 'drowned_zombie', 'plague_zombie', 'frost_zombie', 'mummified_zombie',
  'cinder_zombie', 'infernal_demon', 'obsidian_demon', 'bone_demon'];
const MONSTER_BONES = { pelvis: 'hips', spine_01: 'spine', spine_03: 'chest', neck_01: 'neck', Head: 'head',
  clavicle_l: 'shoulderL', clavicle_r: 'shoulderR', upperarm_l: 'upper_armL', upperarm_r: 'upper_armR',
  lowerarm_l: 'forearmL', lowerarm_r: 'forearmR', hand_l: 'handL', hand_r: 'handR',
  thigh_l: 'thighL', thigh_r: 'thighR', calf_l: 'shinL', calf_r: 'shinR', foot_l: 'footL', foot_r: 'footR' };
const FPS = 30;
const HIT_AT = { attack1: 14, attack2: 14, attack3: 21, crawl_attack: 13 };   // frame the blow lands
const ATTACK_DMG = { attack1: 9, attack2: 8, attack3: 14, crawl_attack: 7 };
const ONCE = new Set(['jump', 'attack1', 'attack2', 'attack3', 'death', 'collapse', 'crawl_attack', 'crawl_death', 'rise', 'getup', 'roar', 'hit']);
// what can be cut off, and how much it takes (waist: the body cut in two at the hips)
const LIMB_HP = { head: 42, upper_armL: 52, forearmL: 36, handL: 22, thighL: 62, shinL: 46, footL: 26,
  upper_armR: 52, forearmR: 36, handR: 22, thighR: 62, shinR: 46, footR: 26, waist: 88 };
const RADIUS = { hips: 0.17, spine: 0.16, chest: 0.18, neck: 0.065, head: 0.12, shoulder: 0.07, upper_arm: 0.06,
  forearm: 0.052, hand: 0.05, thigh: 0.085, shin: 0.065, foot: 0.06 };
const TIP = { head: 0.24, hand: 0.27, foot: 0.19 };           // leaf bones' lengths (along their +y)
const HP = 170;
const WOUNDS = 16;
// temperaments: walking speed, sprint speed (0: never runs), how far it sees, how well it hears
const KINDS = {
  shambler: { walk: 0.8, run: 0, sight: 20, hear: 1.0, turn: 2.4 },
  runner: { walk: 0.95, run: 3.3, sight: 24, hear: 1.2, turn: 3.2 },
  lurker: { walk: 0.8, run: 2.7, sight: 10, hear: 0.7, turn: 3.0 },
};

const GORE_GLSL = /* glsl */`
uniform vec4 uWound[${WOUNDS}];
uniform vec4 uWoundD[${WOUNDS}];
uniform vec3 uWoundB[${WOUNDS}];
uniform float uWoundN;
varying vec3 vBind;
float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// wounds (w > 0: a hole torn in the skin), cuts (w < 0: a severed joint) and slashes (uWoundD
// .w = 1: a gash along the segment w.xyz +- uWoundD.xyz, w.w wide, the blood running from it)
float gore(inout vec4 col) {
  float hole = 99.0, cut = 99.0, gash = 99.0, run = 0.0;
  for (int i = 0; i < ${WOUNDS}; i++) {
    if (float(i) >= uWoundN) break;
    vec4 w = uWound[i], D = uWoundD[i];
    if (D.w > 0.5) {
      vec3 q = vBind - w.xyz, B = uWoundB[i];
      float dep = dot(q, B);
      if (dep > 0.07 || dep < -0.16) continue;   // only the side the blow struck
      q -= B * dep;                       // in the plane across the blow: it wraps round the body
      float t = clamp(dot(q, D.xyz) / max(dot(D.xyz, D.xyz), 1e-6), -1.0, 1.0);
      vec3 e = q - D.xyz * t;
      gash = min(gash, length(e) / w.w);
      // the blood that ran down from it: under the gash, narrowing as it goes
      float below = -e.y, side = length(e.xz) / w.w;
      if (below > 0.0 && below < w.w * 9.0) run = max(run, (1.0 - below / (w.w * 9.0)) * step(side, 1.1 - below / (w.w * 10.0)));
      continue;
    }
    float d = length(vBind - w.xyz) / abs(w.w);
    if (w.w > 0.0) hole = min(hole, d); else cut = min(cut, d);
  }
  float n = gNoise(vBind * 60.0) * 0.65 + gNoise(vBind * 170.0) * 0.35;
  float h = hole + (n - 0.5) * 0.6;
  float c = cut + (n - 0.5) * 0.5;
  float s = gash + (n - 0.5) * 0.45;
  vec3 raw = mix(vec3(0.30, 0.015, 0.02), vec3(0.70, 0.12, 0.10), n);
  if (gl_FrontFacing) {
    if (h < 0.6) discard;                               // torn open
    if (s < 0.45) { col.rgb = mix(vec3(0.16, 0.0, 0.01), raw, smoothstep(0.12, 0.45, s)); return 1.0; }   // the gash
    if (s < 2.4 || run * (0.6 + 0.8 * gNoise(vBind * vec3(240.0, 30.0, 240.0))) > 0.75) {
      float k = s < 2.4 ? smoothstep(0.45, 2.4, s) : 0.3;
      col.rgb = mix(col.rgb * vec3(0.32, 0.03, 0.03), col.rgb, k);   // blood about the lips of it, and down from it
      if (s < 2.4) return (1.0 - k) * 0.9;
    }
    if (h < 0.86 || c < 0.55) { col.rgb = raw; return 1.0; }
    float soak = min(smoothstep(0.86, 1.8, h), smoothstep(0.55, 1.5, c));
    col.rgb = mix(col.rgb * vec3(0.40, 0.05, 0.04), col.rgb, soak);   // blood-soaked around it
    return (1.0 - soak) * 0.7;
  }
  // inside the body: wet meat, coils of gut, yellow fat (the kilt's inner face stays cloth)
  if (vBind.y > 0.52 && vBind.y < 1.0 && h > 3.0 && c > 3.0) { col.rgb *= 0.4; return 0.0; }
  float coil = sin(vBind.x * 95.0 + sin(vBind.y * 60.0) * 2.5 + vBind.z * 40.0);
  vec3 meat = mix(vec3(0.20, 0.008, 0.015), vec3(0.58, 0.07, 0.07), n);
  meat = mix(meat, vec3(0.72, 0.36, 0.34), smoothstep(0.7, 0.95, coil) * 0.65);
  meat = mix(meat, vec3(0.80, 0.70, 0.45), step(0.88, n) * 0.5);
  col.rgb = meat;
  return 1.0;
}`;

export function goreMaterial(src, lib) {
  const normals = goreMaterial.normals || (goreMaterial.normals = new Map());
  const map = src.map;
  if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapLinearFilter; map.needsUpdate = true; }
  const mat = new THREE.MeshPhongMaterial({ map, side: THREE.DoubleSide, alphaTest: 0.5, specular: 0x2c1e1c, shininess: 30 });
  if (map && lib?.normals) {
    if (!normals.has(map)) normals.set(map, lib.normalFrom(map, 1.0));
    mat.normalMap = normals.get(map);
  }
  const u = { uWound: { value: Array.from({ length: WOUNDS }, () => new THREE.Vector4(0, -99, 0, 0.001)) },
    uWoundD: { value: Array.from({ length: WOUNDS }, () => new THREE.Vector4()) },
    uWoundB: { value: Array.from({ length: WOUNDS }, () => new THREE.Vector3()) }, uWoundN: { value: 0 } };
  mat.userData.u = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 bindPos;\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = bindPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GORE_GLSL)
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat goreWet = gore(diffuseColor);')
      .replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\nspecularStrength = mix(0.15, 2.6, goreWet);');
  };
  mat.customProgramCacheKey = () => 'zombie-gore';
  return mat;
}

// ------------------------------------------------------------------ blood, splats, gibs
const DROP_VERT = /* glsl */`
attribute float size; attribute vec3 color; varying vec3 vCol; uniform float scale;
void main() { vCol = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(size * scale / -mv.z, 1.0, 5.0); gl_Position = projectionMatrix * mv; }`;
const DROP_FRAG = /* glsl */`
varying vec3 vCol; uniform float light;
void main() { vec2 q = gl_PointCoord - 0.5; if (dot(q, q) > 0.25) discard; gl_FragColor = vec4(vCol * light, 1.0); }`;

function splatTexture() {
  const S = 64, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  const blob = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  blob(32, 32, 13);
  for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28, d = 6 + Math.random() * 10; blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 4 + Math.random() * 6); }
  for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, d = 16 + Math.random() * 14; blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1 + Math.random() * 2.2); }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}

class Gore {
  constructor(scene, physics, floor) {
    this.scene = scene; this.physics = physics;
    this.floorY = floor;     // (x, z, y) -> the surface below
    const M = this.max = 3000;
    this.n = 0;
    this.pos = new Float32Array(M * 3); this.vel = new Float32Array(M * 3); this.col = new Float32Array(M * 3);
    this.size = new Float32Array(M); this.life = new Float32Array(M); this.floor = new Float32Array(M);
    this.blood = new Uint8Array(M);   // blood splats where it lands; earth doesn't
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setAttribute('size', this.aSize);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({ vertexShader: DROP_VERT, fragmentShader: DROP_FRAG,
      uniforms: { scale: { value: 300 }, light: { value: 1 } } });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.geo = g;
    scene.add(this.points);
    this.reds = ['#4a0306', '#6a0709', '#8a0c0c', '#a5150f', '#5c0a0a'].map((c) => new THREE.Color(c));
    this.soil = ['#2a2016', '#3a2c1c', '#4a3a26', '#1e1810'].map((c) => new THREE.Color(c));
    // splats and pools on the ground
    this.splatMax = 600;
    const sg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.splats = new THREE.InstancedMesh(sg, new THREE.MeshPhongMaterial({ map: splatTexture(), alphaTest: 0.5, color: 0x8a8a8a,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, shininess: 60, specular: 0x401010 }), this.splatMax);
    this.splats.count = 0; this.splatNext = 0;
    this.splats.receiveShadow = true;
    this.splats.frustumCulled = false;
    scene.add(this.splats);
    this.pools = [];        // splats that spread: {i, x, y, z, rot, r, to, k}
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    // gibs
    this.gibGeo = new THREE.IcosahedronGeometry(1, 0);
    this.gibMat = new THREE.MeshPhongMaterial({ color: 0x5a0a0c, specular: 0x803030, shininess: 50, flatShading: true });
    this.gibs = [];
  }

  drop(p, v, size = 0.014, color = null) {
    const i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    const c = color || this.reds[Math.floor(Math.random() * this.reds.length)];
    this.col.set([c.r, c.g, c.b], i * 3);
    this.size[i] = size; this.life[i] = 3; this.blood[i] = color ? 0 : 1;
    this.floor[i] = this.floorY(p.x, p.z, p.y);
  }

  /** A spray of `n` drops from p, thrown along dir with some spread. */
  spray(p, dir, n, { speed = 3, spread = 0.6, size = 0.014 } = {}) {
    const v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).multiplyScalar(spread).add(dir).normalize()
        .multiplyScalar(speed * (0.3 + Math.random() * 0.9));
      this.drop(p, v, size * (0.5 + Math.random()));
    }
  }

  splat(x, y, z, r, grow = 0, color = null) {
    const i = this.splatNext;
    this.splatNext = (i + 1) % this.splatMax;
    this.splats.count = Math.max(this.splats.count, i + 1);
    const rot = Math.random() * 6.28;
    const c = color || this.reds[Math.floor(Math.random() * 3)];
    this.splats.setColorAt(i, c);
    this.splats.instanceColor.needsUpdate = true;
    this.pools = this.pools.filter((p) => p.i !== i);
    if (grow) this.pools.push({ i, x, y, z, rot, r: r * 0.2, to: r, k: grow });
    this.place(i, x, y, z, rot, grow ? r * 0.2 : r);
  }

  place(i, x, y, z, rot, r) {
    this._q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rot);
    this._m.compose(this._p.set(x, y + 0.012 + (i % 50) * 0.0004, z), this._q, this._s.set(r, 1, r));
    this.splats.setMatrixAt(i, this._m);
    this.splats.instanceMatrix.needsUpdate = true;
  }

  gib(p, v) {
    if (this.gibs.length > 80) { const o = this.gibs.shift(); this.scene.remove(o.m); }
    const m = new THREE.Mesh(this.gibGeo, this.gibMat);
    const s = 0.008 + Math.random() * 0.014;
    m.scale.set(s * (0.7 + Math.random() * 0.6), s, s * (0.7 + Math.random() * 0.6));
    m.position.copy(p);
    m.castShadow = true;
    this.scene.add(m);
    this.gibs.push({ m, v: v.clone(), spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(14), s, rest: false });
  }

  update(dt, camera, height, light) {
    this.mat.uniforms.scale.value = height / 2 * camera.projectionMatrix.elements[5];
    this.mat.uniforms.light.value = light;
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      V[j + 1] -= 13 * dt;
      const dr = Math.max(0, 1 - 0.6 * dt);
      V[j] *= dr; V[j + 2] *= dr;
      P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt;
      this.life[i] -= dt;
      if (P[j + 1] <= this.floor[i] || this.life[i] <= 0) {
        if (P[j + 1] <= this.floor[i] && this.blood[i] && Math.random() < 0.22) this.splat(P[j], this.floor[i], P[j + 2], 0.06 + this.size[i] * 8);
        const k = --this.n;                              // swap-remove
        if (i !== k) {
          P.copyWithin(j, k * 3, k * 3 + 3); V.copyWithin(j, k * 3, k * 3 + 3); this.col.copyWithin(j, k * 3, k * 3 + 3);
          this.size[i] = this.size[k]; this.life[i] = this.life[k]; this.floor[i] = this.floor[k]; this.blood[i] = this.blood[k];
        }
        i--;
      }
    }
    this.geo.setDrawRange(0, this.n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
    for (const p of this.pools) {
      if (p.r >= p.to) continue;
      p.r = Math.min(p.to, p.r + dt * p.k);
      this.place(p.i, p.x, p.y, p.z, p.rot, p.r);
    }
    for (const g of this.gibs) {
      if (g.rest) continue;
      g.v.y -= 13 * dt;
      g.m.position.addScaledVector(g.v, dt);
      g.m.rotation.x += g.spin.x * dt; g.m.rotation.y += g.spin.y * dt; g.m.rotation.z += g.spin.z * dt;
      if (Math.random() < dt * 6) this.drop(g.m.position, new THREE.Vector3(0, -0.5, 0), 0.01);
      const fl = this.floorY(g.m.position.x, g.m.position.z, g.m.position.y + g.s) + g.s;
      if (g.m.position.y < fl) {
        g.m.position.y = fl;
        if (g.v.y < -1.2) { g.v.y *= -0.25; g.v.x *= 0.5; g.v.z *= 0.5; g.spin.multiplyScalar(0.5); this.splat(g.m.position.x, fl - g.s, g.m.position.z, 0.1); }
        else { g.rest = true; }
      }
    }
  }
}

// ------------------------------------------------------------------ a zombie
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3(), _f = new THREE.Vector3(), _m = new THREE.Matrix4();
const normals = new Map();   // texture -> its normal map, made once per body
const ZERO4 = new THREE.Vector4(), ZERO3 = new THREE.Vector3();
const EMBER = [new THREE.Color(1, 0.7, 0.2), new THREE.Color(1, 0.35, 0.05), new THREE.Color(0.3, 0.2, 0.15)];

// The monsters carry the same hair, eye and body-detail images byte for byte: one copy of each
// serves them all (with a copy of the hair per monster, they alone ran past half a gigabyte of
// graphics memory).
const sharedTex = new Map();   // image name -> the texture every monster uses

function shareTextures(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const k of Object.keys(m)) {
        const t = m[k];
        if (!t?.isTexture) continue;
        const kept = t.name && sharedTex.get(t.name);
        if (kept && kept !== t) { if (kept.source !== t.source) t.image?.close?.(); m[k] = kept; continue; }
        if (t.name) sharedTex.set(t.name, t);
      }
    }
  });
}

/** A monster body in the zombie body's terms: bones and tracks renamed, turned to face +z, and
 * the clips the brain asks for (walk, run, attack3, dead) made from its own. */
function adaptMonster(gltf) {
  shareTextures(gltf.scene);
  gltf.scene.traverse((o) => { if (MONSTER_BONES[o.name]) o.name = MONSTER_BONES[o.name]; });
  gltf.scene.rotation.y = Math.PI;                         // built facing -z
  const clips = {};
  for (const c of gltf.animations) {
    for (const t of c.tracks) {
      const i = t.name.lastIndexOf('.'), n = t.name.slice(0, i);
      if (MONSTER_BONES[n]) t.name = MONSTER_BONES[n] + t.name.slice(i);
    }
    clips[c.name] = c;
  }
  const alias = (src, name) => { if (clips[src]) { const c = clips[src].clone(); c.name = name; gltf.animations.push(c); } };
  alias('move', 'walk'); alias('move', 'run'); alias('attack1', 'attack3');
  if (clips.death) {
    const last = Math.round(clips.death.duration * FPS);
    gltf.animations.push(THREE.AnimationUtils.subclip(clips.death, 'dead', last - 1, last, FPS));
  }
  return gltf;
}

export class Zombie {
  static ONCE = ONCE;      // clips that play once (subclasses bring their own)

  constructor(gltf, variant, owner, o) {
    this.owner = owner;
    this.variant = variant;
    this.id = owner.nextId++;
    const root = this.root = new THREE.Group();
    const model = cloneSkinned(gltf.scene);
    root.add(model);
    // the body is the biggest skinned mesh (monsters also carry eyes, brows and bones)
    model.traverse((c) => { if (c.isSkinnedMesh && (!this.mesh || c.geometry.attributes.position.count > this.mesh.geometry.attributes.position.count)) this.mesh = c; });
    const mesh = this.mesh;
    // every body of a kind shares its vertices; each has its own triangles, as limbs come off
    const src = mesh.geometry, geo = mesh.geometry = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(src.attributes)) geo.setAttribute(k, a);
    geo.setAttribute('bindPos', src.attributes.position);
    geo.setIndex(src.index.clone());
    for (const g of src.groups) geo.addGroup(g.start, g.count, g.materialIndex);
    this.shared = Object.keys(geo.attributes);
    mesh.material = this.material(mesh.material, owner.lib);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.u = mesh.material.userData.u;
    this.skel = mesh.skeleton;
    this.bones = {};
    for (const b of this.skel.bones) this.bones[b.name] = b;
    this.bindInv = mesh.bindMatrix.clone().invert();
    // each vertex belongs to its strongest bone
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, nv = si.count;
    this.dom = new Uint8Array(nv);
    for (let i = 0; i < nv; i++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      this.dom[i] = best;
    }
    this.index = geo.index.array.slice();
    this.alive = new Uint8Array(this.index.length / 3).fill(1);

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      if (this.constructor.ONCE.has(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[clip.name] = a;
    }
    this.cur = null;

    this.pos = new THREE.Vector3(o.x, o.y, o.z);
    this.yaw = o.yaw ?? Math.random() * Math.PI * 2;
    this.zone = o.zone || 'yard';
    this.home = this.pos.clone();
    this.room = o.room || null;            // dungeon room rectangle it haunts
    this.kindName = o.kind || 'shambler';
    this.kind = KINDS[this.kindName];
    this.pace = 0.88 + Math.random() * 0.24;
    this.flank = [-1, 0, 1][this.id % 3];
    this.vy = 0; this.air = 0;
    this.hp = HP;
    this.limbHp = { ...LIMB_HP };
    this.lost = new Set();     // bones cut away (with all below them); 'waist' for the legs and hips
    this.wounds = []; this.cuts = [];
    this.stumps = [];
    this.mode = 'stand';       // stand | crawl
    this.state = 'move';       // move | attack | jump | collapse | rise | getup | buried | playdead | dead
    // the brain
    this.aggro = false;        // hunting you
    this.goal = 'wander';      // wander | chase | hunt (go where it last had you) | search
    this.lastSeen = new THREE.Vector3(); this.lastT = -99; this.hasLast = false;
    this.canSee = false; this.dist = 99;
    this.think = Math.random() * 0.25;
    this.wander = null; this.wanderT = Math.random() * 4;
    this.searchT = 0;
    this.groanT = 2 + Math.random() * 6;
    this.avoid = 0; this.avoidT = 0; this.feelT = Math.random() * 0.2;
    this.lungeT = 0; this.lungeCool = 2 + Math.random() * 4;
    this.stagger = 0; this.cool = 0; this.jitter = 0;
    this.deadT = 0; this.sinking = false; this.gone = false;
    this.mixAcc = 0; this.frame = this.id;

    const start = o.start || 'stand';
    if (start === 'buried') { this.state = 'buried'; root.visible = false; }
    else if (start === 'rise') this.beginRise();
    else if (start === 'playdead') { this.state = 'playdead'; this.play('dead', 0); }
    else { this.play('idle', 0); this.mixer.update(Math.random() * 2); }
    owner.scene.add(root);
    this.sync();
  }

  /** The skin's material: the zombies' gore shader (other bodies extend it). */
  material(src, lib) { return goreMaterial(src, lib); }

  get dead() { return this.state === 'dead'; }
  get slow() { return this.chillT > 0 ? 0.4 : 1; }

  /** Frost and fire from a shield's enchantments: chilled it moves slow, burning it smoulders. */
  afflict(dt) {
    if (this.chillT > 0) this.chillT -= dt;
    this.mixer.timeScale = this.chillT > 0 ? 0.45 : 1;
    if (this.burnT > 0 && !this.dead) {
      this.burnT -= dt;
      this.hp -= (this.burnDps || 3) * dt;
      if (Math.random() < dt * 24) this.owner.gore.drop(_t.copy(this.pos).add(_u.set((Math.random() - 0.5) * 0.5, 0.6 + Math.random(), (Math.random() - 0.5) * 0.5)),
        _w.set((Math.random() - 0.5) * 0.4, 1.2, (Math.random() - 0.5) * 0.4), 0.014, EMBER[Math.floor(Math.random() * 3)]);
      if (this.hp <= 0) this.die();
    }
  }
  get standing() { return !this.dead && this.state !== 'buried' && this.state !== 'rise' && this.state !== 'playdead'; }
  has(b) { return !this.lost.has(b); }
  arm(s) { return this.has('upper_arm' + s) && this.has('forearm' + s); }
  get legs() { return this.has('waist') && ['thighL', 'shinL', 'thighR', 'shinR'].every((b) => this.has(b)); }
  get feet() { return this.has('footL') && this.has('footR'); }
  forward(out = _v) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  play(name, fade = 0.25, speed = 1) {
    const a = this.actions[name];
    if (!a) return;
    if (this.holdT > 0 && (name === 'walk' || name === 'run' || name === 'idle')) return;   // let a roar or flinch finish
    a.timeScale = speed;
    if (this.cur === name) {
      if (this.constructor.ONCE.has(name) && this.done()) { a.reset().play(); this.fired = false; }   // again, from the top
      return;
    }
    const prev = this.actions[this.cur];
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    this.cur = name;
    this.fired = false;
  }

  done() { const a = this.actions[this.cur]; return !a || !a.isRunning() || a.time >= a.getClip().duration - 1e-3; }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  beginRise() {
    this.state = 'rise';
    this.root.visible = true;
    this.play('rise', 0);
    this.riseT = 0;
    this.owner.dirt(this.pos, 1.0);
    this.owner.sound('dirt', this.pos);
  }

  wake(target) {
    if (this.state === 'playdead') { this.state = 'getup'; this.play('getup', 0.1); }
    else if (this.state === 'buried') this.beginRise();
    this.hunt(target, true);
  }

  /** Something gave you away at `p`: chase if `sure`, else go and look. */
  hunt(p, sure) {
    if (!p) return;
    this.lastSeen.copy(p); this.hasLast = true; this.lastT = this.owner.time;
    if (sure) { this.aggro = true; this.goal = 'chase'; } else if (!this.aggro) this.goal = 'hunt';
  }

  // -------------------------------------------------------------- hits
  /** Bone capsules in world space: [{bone, a, b, r}] for the bones still attached. */
  capsules() {
    const out = [];
    if (this.state === 'buried') return out;
    this.root.updateMatrixWorld(true);
    for (const b of this.skel.bones) {
      if (b.name === 'root' || this.cutAway(b.name) || (b.name === 'hips' && !this.has('waist'))) continue;
      const kind = b.name.replace(/[LR]$/, '');
      const r = this.radius?.[b.name] ?? RADIUS[kind];   // a body built with its own hit shapes, or the zombies'
      if (!r) continue;
      const a = b.getWorldPosition(new THREE.Vector3());
      const child = b.children.find((c) => c.isBone && !c.name.startsWith('shoulder') && !c.name.startsWith('thigh'));
      let e;
      if (child && kind !== 'hips') e = child.getWorldPosition(new THREE.Vector3());
      else if (kind === 'hips') e = this.bones.spine.getWorldPosition(new THREE.Vector3());
      else e = b.localToWorld(new THREE.Vector3(0, this.tips?.[b.name] ?? TIP[kind] ?? 0.2, 0));
      out.push({ bone: b, a, b: e, r });
    }
    return out;
  }

  cutAway(name) {
    let b = this.bones[name];
    while (b && b.isBone) { if (this.lost.has(b.name)) return true; b = b.parent; }
    return false;
  }

  /** Ray (origin o, unit d) against this zombie's capsules: {t, bone, point} or null. */
  ray(o, d, far) {
    if (this.gone || this.state === 'buried' || o.distanceTo(this.pos) > far + 2.5) return null;
    let best = null;
    for (const c of this.capsules()) {
      const t = rayCapsule(o, d, c.a, c.b, c.r);
      if (t !== null && t <= far && (!best || t < best.t)) best = { t, bone: c.bone, point: o.clone().addScaledVector(d, t), z: this };
    }
    return best;
  }

  /** Where a world point sits in the mesh's bind space, carried by bone b. */
  toBind(p, b) {
    const i = this.skel.bones.indexOf(b);
    this.mesh.updateMatrixWorld(true);
    _m.copy(b.matrixWorld).invert();
    const q = p.clone().applyMatrix4(_m);
    _m.copy(this.skel.boneInverses[i]).invert();
    return q.applyMatrix4(_m).applyMatrix4(this.bindInv);
  }

  writeWounds() {
    const all = [...this.cuts, ...this.wounds].slice(0, WOUNDS);
    all.forEach((w, i) => { this.u.uWound.value[i].copy(w); this.u.uWoundD.value[i].copy(w.d || ZERO4); this.u.uWoundB.value[i].copy(w.b || ZERO3); });
    this.u.uWoundN.value = all.length;
  }

  wound(point, bone, r) {
    const c = this.toBind(point, bone);
    this.wounds.push(new THREE.Vector4(c.x, c.y, c.z, r));
    while (this.wounds.length + this.cuts.length > WOUNDS) this.wounds.shift();
    this.writeWounds();
  }

  /** A blade's gash across the body where it bit: from a to b (world), `width` wide, the blow
   * coming along `dir` (world: the gash is measured across it, so it follows the body round). */
  slash(a, b, bone, width, dir) {
    const ca = this.toBind(a, bone), cb = this.toBind(b, bone);
    const w = new THREE.Vector4((ca.x + cb.x) / 2, (ca.y + cb.y) / 2, (ca.z + cb.z) / 2, width);
    w.d = new THREE.Vector4((cb.x - ca.x) / 2, (cb.y - ca.y) / 2, (cb.z - ca.z) / 2, 1);
    const mid = a.clone().lerp(b, 0.5);
    w.b = this.toBind(mid.clone().add(dir), bone).sub(this.toBind(mid, bone)).normalize();
    this.wounds.push(w);
    while (this.wounds.length + this.cuts.length > WOUNDS) this.wounds.shift();
    this.writeWounds();
  }

  /** What a hit on bone b can cut off, or null for the chest. */
  limbOf(b) {
    const n = b.name;
    if (LIMB_HP[n] !== undefined) return n;
    if (n === 'neck') return 'head';
    if (n === 'hips' || n === 'spine') return 'waist';
    return null;
  }

  /** A blow landing at h (bone, point) along dir. kind: 'blade' (a gash along `edge`, the
   * blade's sweep in the world, when given), 'blunt', or a spell's; push: how hard it shoves. */
  hit(h, { dmg, dir, heavy = false, kind = 'blade', edge = null, push = 0 }) {
    const owner = this.owner, g = owner.gore;
    const b = h.bone, p = h.point;
    const back = dir.clone().negate();
    // the wound and its blood: an edge leaves a gash where it cut, anything else a hole
    const r = (heavy ? 0.085 : 0.06) + (kind === 'fire' ? 0.03 : 0) + Math.random() * 0.02;
    if (kind === 'blade' && edge) {
      const half = (heavy ? 0.17 : 0.12) * (0.85 + Math.random() * 0.3);
      this.slash(_t.copy(p).addScaledVector(edge, -half), _f.copy(p).addScaledVector(edge, half), b, heavy ? 0.03 : 0.022, dir);
    } else this.wound(p, b, r);
    g.spray(p, dir, heavy ? 70 : 45, { speed: heavy ? 4.5 : 3.4, spread: 0.9 });
    g.spray(p, back.clone().add(_u.set(0, 0.6, 0)), heavy ? 40 : 26, { speed: 2.6, spread: 0.8 });
    for (let i = 0; i < (heavy ? 7 : 4); i++) g.gib(p, _w.copy(dir).multiplyScalar(2 + Math.random() * 2).add(_u.set((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3)));
    g.splat(p.x, owner.floorY(p.x, p.z, p.y), p.z, 0.35 + Math.random() * 0.3);
    owner.sound('squelch', p, heavy);
    // damage: limbs come off, the trunk dies
    const limb = this.limbOf(b);
    if (limb && !this.lost.has(limb)) {
      this.limbHp[limb] -= dmg * (kind === 'blade' ? (heavy ? 1.4 : 1.15) : 0.7);
      this.hp -= dmg * (limb === 'waist' ? 0.6 : 0.35);
      if (this.limbHp[limb] <= 0) this.sever(limb, dir);
    } else {
      this.hp -= dmg;
    }
    if (this.state === 'playdead' || this.state === 'buried') this.wake(owner.player?.pos);
    else this.hunt(owner.player?.pos, true);
    owner.alert(this, owner.player?.pos, 9);
    // shoved back along the blow (it carries on for a moment: see ground())
    const shove = (push || (heavy ? 0.8 : 0.45)) * (this.mode === 'crawl' ? 0.4 : 1) / (this.heft || 1);
    const fl = Math.hypot(dir.x, dir.z) || 1;
    this.knock = (this.knock || new THREE.Vector3()).set(dir.x / fl, 0, dir.z / fl).multiplyScalar(shove * 9);
    if (!this.dead) {
      if (this.state === 'move' || this.state === 'attack') {
        if (this.state === 'move') this.stagger = heavy ? 0.55 : 0.32;
        if (this.state === 'move' && this.actions.hit) { this.holdT = 0; this.play('hit', 0.06); this.holdT = this.actions.hit.getClip().duration; this.stagger = Math.max(this.stagger, this.holdT); }
      }
      if (this.hp <= 0) this.die();
    }
  }

  sever(name, dir) {
    const owner = this.owner, g = owner.gore;
    const waist = name === 'waist';
    const bone = waist ? this.bones.spine : this.bones[name];
    const parent = waist ? this.bones.spine : bone.parent;    // what stays on the body
    // the triangles of the limb and everything below it (cut in half: the hips and both legs)
    const set = new Set();
    const take = (o) => o.traverse((c) => { if (c.isBone) set.add(this.skel.bones.indexOf(c)); });
    if (waist) { set.add(this.skel.bones.indexOf(this.bones.hips)); take(this.bones.thighL); take(this.bones.thighR); } else take(bone);
    const idx = this.index, keep = [], gone = [];
    for (let t = 0; t < this.alive.length; t++) {
      if (!this.alive[t]) continue;
      const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
      const n = set.has(this.dom[a]) + set.has(this.dom[b]) + set.has(this.dom[c]);
      if (n >= 2) { this.alive[t] = 0; gone.push(a, b, c); } else keep.push(a, b, c);
    }
    this.lost.add(name);
    if (waist) { this.lost.add('thighL'); this.lost.add('thighR'); }
    this.mesh.geometry.setIndex(keep);
    // the joint, in world space and bind space; a cut there colours the stump and the piece
    const joint = bone.getWorldPosition(new THREE.Vector3());
    const jb = this.toBind(joint, parent);
    this.cuts.push(new THREE.Vector4(jb.x, jb.y, jb.z, -(waist ? 0.15 : name === 'head' ? 0.09 : 0.075)));
    this.writeWounds();
    if (gone.length) owner.addPiece(this, gone, joint, dir);
    // a bone stub on the stump (the spine, cut in two), and a spurting pulse
    const at = waist ? new THREE.Vector3(0, 0.01, 0) : bone.position.clone();
    const along = waist ? new THREE.Vector3(0, -1, 0) : bone.position.clone().normalize();
    const stub = new THREE.Mesh(owner.stubGeo, owner.stubMat);
    stub.position.copy(at).addScaledVector(along, 0.015);
    stub.quaternion.setFromUnitVectors(_u.set(0, 1, 0), along);
    if (waist) stub.scale.set(1.6, 1.4, 1.6);
    parent.add(stub);
    this.stumps.push({ bone: parent, at, dir: along.clone(), t: 0, life: waist ? 14 : 9 });
    g.spray(joint, _w.copy(dir).add(_u.set(0, 1, 0)), waist ? 260 : 160, { speed: 4.5, spread: 0.8, size: 0.018 });
    for (let i = 0; i < (waist ? 22 : 10); i++) g.gib(joint, _w.set((Math.random() - 0.5) * 4, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 4));
    g.splat(joint.x, owner.floorY(joint.x, joint.z, joint.y), joint.z, waist ? 1.4 : 0.9, 0.15);
    owner.sound('sever', joint);
    if (name === 'head') { this.hp -= 30; this.jitter = 1; }
    // without a leg (or its legs) it can no longer stand
    if (!this.dead && this.mode === 'stand' && !this.legs) {
      this.state = 'collapse';
      this.play('collapse', 0.12);
      if (waist) this.pos.y += 0;   // the upper half drops where it stood
    }
  }

  die() {
    this.state = 'dead';
    this.deadT = 0;
    // the dead carried things into the ground with them, now and then
    const loot = this.owner.foes?.ctx?.loot;
    if (loot && this.constructor === Zombie && Math.random() < 0.18) loot.drop([this.pos.x, this.pos.y + 0.1, this.pos.z], { tier: this.zone === 'dungeon' ? 2 : 1, under: this.zone === 'dungeon' });
    this.play(this.mode === 'crawl' || this.cur === 'collapse' ? 'crawl_death' : 'death', 0.15);
    const g = this.owner.gore;
    g.splat(this.pos.x, this.owner.floorY(this.pos.x, this.pos.z, this.pos.y), this.pos.z, 2.0, 0.18);
    this.owner.sound('die', this.pos);
  }

  // -------------------------------------------------------------- the brain
  /** What it can see and hear of you (a few times a second). */
  sense(player, active) {
    const owner = this.owner;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = this.dist = Math.hypot(dx, dz);
    this.canSee = false;
    if (!active) return;
    const same = Math.abs(player.pos.y - this.pos.y) < 2.6;
    const eyes = this.has('head');
    if (eyes && same && d < this.kind.sight * (this.zone === 'dungeon' ? 0.8 : 1)) {
      const facing = (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / Math.max(d, 1e-3);
      if (d < 2.5 || facing > 0.2) {
        const ey = this.pos.y + (this.mode === 'crawl' ? 0.4 : 1.5);
        const dir = _t.set(dx, player.pos.y + 1.5 - ey, dz);
        const len = dir.length();
        dir.divideScalar(len);
        const hit = owner.physics.ray([this.pos.x, ey, this.pos.z], [dir.x, dir.y, dir.z], len);
        this.canSee = !hit || hit.t > len - 0.4;
      }
    }
    // you running carries far, walking less, standing still hardly at all; blind, it listens harder
    const loud = player.speed > 7 ? 15 : player.speed > 1 ? 7.5 : 2.2;
    const heard = same && d < loud * this.kind.hear * (eyes ? 1 : 1.6);
    if (this.canSee) {
      if (!this.aggro) {
        this.aggro = true; owner.sound('groan', this.pos, true); owner.alert(this, player.pos, 18);
        if (this.actions.roar && this.state === 'move' && this.dist > 3) {   // it has you: it roars first
          this.holdT = 0; this.play('roar', 0.2); this.holdT = this.actions.roar.getClip().duration; this.stagger = this.holdT;
        }
      }
      this.hunt(player.pos, true);
    } else if (heard) {
      this.hunt(player.pos, this.aggro);
    } else if (this.goal === 'chase') {
      // lost sight: down below it can still follow the corridors to you; up top it goes to where
      // it last had you
      const near = this.zone === 'dungeon' && owner.flowAt(this.pos) < 32;
      if (!near && owner.time - this.lastT > 1.2) this.goal = 'hunt';
    }
  }

  update(dt, player, active, far, mid) {
    const owner = this.owner, phys = owner.physics;
    if (this.gone) return;
    if (this.state === 'buried') {
      // lurking under a grave: it comes up when you walk over it
      const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      if (active && d < 5.5 && Math.abs(player.pos.y - this.pos.y) < 2) this.wake(player.pos);
      return;
    }
    if (far && (this.dead || (!this.aggro && this.goal === 'wander'))) {   // out of the way: it waits
      if (this.dead) this.corpse(dt);
      return;
    }
    this.afflict(dt);
    // animation (every third frame when far off, every sixth when unseen but still hunting you)
    this.mixAcc += dt;
    if (!mid || ++this.frame % (far ? 6 : 3) === 0) { this.mixer.update(this.mixAcc); this.mixAcc = 0; }
    // the stumps spurt in pulses that fade, then drip
    for (const s of this.stumps) {
      s.t += dt;
      const k = Math.max(0.04, 1 - s.t / s.life), beat = Math.pow(Math.max(0, Math.sin(s.t * 8.5)), 3);
      const n = Math.random() < dt * 60 * k * (0.2 + beat) ? Math.ceil(k * 3 * beat + 0.5) : 0;
      if (n) {
        const p = s.bone.localToWorld(_w.copy(s.at));
        const d = _u.copy(s.dir).transformDirection(s.bone.matrixWorld);
        owner.gore.spray(p, d, n, { speed: 0.6 + 3.2 * k * beat, spread: 0.35, size: 0.014 });
      }
    }
    if (this.dead) {
      if (this.cur === 'death' && this.done()) this.play('dead', 0.3);
      if (this.cur === 'crawl_death' && this.done()) this.play('crawl_dead', 0.3);
      this.corpse(dt);
      this.ground(dt);
      this.sync();
      return;
    }
    this.think -= dt;
    if (this.think <= 0) { this.think = mid ? 0.6 : 0.22 + Math.random() * 0.06; this.sense(player, active); }
    if (this.aggro) {
      this.groanT -= dt;
      if (this.groanT < 0) { this.groanT = 3 + Math.random() * 5; owner.sound('groan', this.pos); }
    }
    const crawl = this.mode === 'crawl';
    const toX = player.pos.x - this.pos.x, toZ = player.pos.z - this.pos.z;
    const dist = Math.hypot(toX, toZ);
    const facingErr = Math.abs(wrap(Math.atan2(toX, toZ) - this.yaw));

    if (this.state === 'rise') {
      this.riseT += dt;
      if (this.riseT < 1.6 && Math.random() < dt * 14) owner.dirt(this.pos, 0.25);
      if (this.done()) {
        this.state = 'move';
        if (active && dist < 28) this.hunt(player.pos, true);
      }
    } else if (this.state === 'getup') {
      if (this.done()) this.state = 'move';
    } else if (this.state === 'playdead') {
      if (active && dist < 4.2 && Math.abs(player.pos.y - this.pos.y) < 2) this.wake(player.pos);
    } else if (this.state === 'collapse') {
      if (this.done()) { this.mode = 'crawl'; this.state = 'move'; }
    } else if (this.state === 'attack') {
      const a = this.actions[this.cur];
      if (this.lungeT > 0) {   // the pounce carries it at you
        this.lungeT -= dt;
        const f = this.forward();
        phys.slide(this.pos, f.x * 4.2 * dt, f.z * 4.2 * dt, 0.3, 1.6, 0.45);
      }
      if (!this.fired && a.time * FPS >= HIT_AT[this.cur]) {
        this.fired = true;
        const reach = crawl ? 2.0 : 1.9;
        if (active && dist < reach && facingErr < 1.2 && Math.abs(player.pos.y - this.pos.y) < 1.2) owner.onPlayerHit?.(ATTACK_DMG[this.cur], this);
      }
      if (this.done()) { this.state = 'move'; this.cool = 0.35 + Math.random() * 0.4; }
    } else if (this.state === 'jump') {
      const f = this.forward();
      this.pos.addScaledVector(f, 2.3 * dt);
      if (this.done()) { this.state = 'move'; phys.slide(this.pos, 0, 0, 0.3, 1.6, 0.45); }
    } else {
      this.steer(dt, player, active, dist, facingErr);
    }
    this.ground(dt);
    // the player can't walk through it
    if (this.state !== 'playdead' && this.state !== 'rise') {
      const c = crawl ? this.forward(_u).multiplyScalar(0.5).add(this.pos) : this.pos;
      const dx = player.pos.x - c.x, dz = player.pos.z - c.z, d = Math.hypot(dx, dz), min = (crawl ? 0.45 : 0.35) + 0.32;
      if (d < min && d > 1e-4 && Math.abs(player.pos.y - this.pos.y) < 1.5) { player.pos.x = c.x + dx / d * min; player.pos.z = c.z + dz / d * min; }
    }
    this.sync();
  }

  /** Where to go and how: the 'move' state. */
  steer(dt, player, active, dist, facingErr) {
    const owner = this.owner, phys = owner.physics, kind = this.kind;
    const crawl = this.mode === 'crawl';
    this.cool = Math.max(0, this.cool - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    this.holdT = Math.max(0, (this.holdT || 0) - dt);
    this.lungeCool -= dt;
    let target = null, speed = 0, routed = false;
    if (this.goal === 'chase' && active) {
      target = _v.copy(player.pos);
      if (!this.has('head')) {        // blind: it lurches after the sound of you, off line
        this.jitter += dt;
        target.x += Math.sin(this.jitter * 0.9) * Math.min(3, dist * 0.35);
        target.z += Math.cos(this.jitter * 0.7) * Math.min(3, dist * 0.35);
      } else if (this.flank && dist > 2.4 && dist < 10 && owner.chasers > 2) {
        // with company it comes at you from the side, so they close round you
        const s = this.flank * Math.min(2.6, dist * 0.45) / dist;
        target.x += -toZOf(player, this) * s; target.z += toXOf(player, this) * s;
      }
      if (this.zone === 'dungeon' && !this.canSee && owner.flowDir(this.pos, _w)) { target.copy(this.pos).addScaledVector(_w, 2); routed = true; }
      if (crawl) speed = 0.12 + 0.2 * this.arm('L') + 0.2 * this.arm('R');
      else if (!this.feet) speed = 0.65;
      else speed = kind.run && dist < 13 && dist > 1.7 && this.has('head') ? kind.run : kind.walk * 1.05;
    } else if (this.goal === 'hunt' && this.hasLast) {
      target = _v.copy(this.lastSeen);
      if (this.zone === 'dungeon' && owner.flowDir(this.pos, _w)) { target.copy(this.pos).addScaledVector(_w, 2); routed = true; }
      speed = crawl ? 0.25 : kind.walk;
      if (Math.hypot(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z) < 1.3) { this.goal = 'search'; this.searchT = 7 + Math.random() * 5; this.wander = null; this.wanderT = 0; }
    } else if (this.goal === 'search') {
      this.searchT -= dt; this.wanderT -= dt;
      if (this.wanderT < 0 || !this.wander) {
        this.wanderT = 2.5 + Math.random() * 2;
        this.wander = this.lastSeen.clone().add(_u.set((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
      }
      if (this.wander.distanceTo(this.pos) > 0.6) { target = _v.copy(this.wander); speed = crawl ? 0.25 : kind.walk * 0.9; }
      if (this.searchT < 0) { this.aggro = false; this.goal = 'wander'; }
    } else {
      this.wanderT -= dt;
      if (this.wanderT < 0) {
        this.wanderT = 5 + Math.random() * 7;
        if (Math.random() < 0.65) {
          const r = this.room;
          this.wander = r ? new THREE.Vector3(r.x0 + 1 + Math.random() * (r.x1 - r.x0 - 2), this.pos.y, r.z0 + 1 + Math.random() * (r.z1 - r.z0 - 2))
            : this.home.clone().add(_u.set((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12));
        } else this.wander = null;
      }
      if (this.wander && this.wander.distanceTo(this.pos) > 0.6) { target = _v.copy(this.wander); speed = crawl ? 0.22 : kind.walk * 0.85; }
    }
    if (!crawl && this.has('head') === false) speed = Math.min(speed, kind.walk * 1.1);
    speed *= this.pace * this.slow;
    if (this.stagger > 0) speed = 0;
    if (target) {
      if (this.avoidT > 0) this.avoidT -= dt;
      const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z) + (this.avoidT > 0 ? this.avoid : 0);
      const turn = (crawl ? 1.4 : kind.turn) * dt;
      this.yaw += Math.max(-turn, Math.min(turn, wrap(want - this.yaw)));
    }
    // attacks: in reach and facing you; runners and lurkers pounce from a little further off
    const chasing = this.goal === 'chase' && active;
    const reach = crawl ? 1.55 : 1.35;
    const moves = crawl ? (this.arm('R') || this.has('head') ? ['crawl_attack'] : [])
      : [this.arm('R') && 'attack1', this.arm('L') && 'attack2', (this.arm('L') || this.arm('R') || this.has('head')) && 'attack3'].filter(Boolean);
    if (chasing && dist < reach && facingErr < 0.6 && !this.cool && moves.length && Math.abs(player.pos.y - this.pos.y) < 1.2) {
      this.state = 'attack';
      this.play(moves[Math.floor(Math.random() * moves.length)], 0.12);
      return;
    }
    if (chasing && !crawl && kind.run && this.feet && this.lungeCool < 0 && dist > 1.9 && dist < 3.4 && facingErr < 0.3 && moves.includes('attack3')) {
      this.state = 'attack'; this.lungeT = 0.42; this.lungeCool = 4 + Math.random() * 4;
      this.play('attack3', 0.08);
      owner.sound('groan', this.pos, true);
      return;
    }
    if (speed > 0 && !(chasing && dist < reach * 0.8)) {
      const f = this.forward(_f);
      // feel ahead: jump what it can get over, else turn to the clearer side
      this.feelT -= dt;
      if (this.feelT <= 0) {
        this.feelT = 0.2;
        const y0 = this.pos.y + (crawl ? 0.25 : 0.45);
        const low = phys.ray([this.pos.x, y0, this.pos.z], [f.x, 0, f.z], crawl ? 0.8 : 1.0);
        if (low && low.box) {
          const high = phys.ray([this.pos.x, this.pos.y + 1.65, this.pos.z], [f.x, 0, f.z], 1.6);
          if (this.goal === 'chase' && !crawl && this.feet && this.air === 0 && !high && low.box.max[1] - this.pos.y < 1.6) {
            this.state = 'jump';
            this.play('jump', 0.1);
            return;
          }
          if (!routed) {   // (the corridors' own route already goes round the walls)
            const side = (a) => { const c = Math.cos(this.yaw + a), s = Math.sin(this.yaw + a); return phys.ray([this.pos.x, y0, this.pos.z], [s, 0, c], 1.4); };
            const l = side(0.8), r = side(-0.8);
            this.avoid = !l ? 0.9 : !r ? -0.9 : (l.t > r.t ? 0.9 : -0.9);
            this.avoidT = 0.7;
          }
        }
        // stuck on something for a second: sidestep
        this.stuckT = (this.stuckT || 0) + 0.2;
        if (this.stuckT >= 1) {
          if (this.stuckAt && this.stuckAt.distanceTo(this.pos) < 0.15 * speed) { this.avoid = Math.random() < 0.5 ? 1.3 : -1.3; this.avoidT = 0.9; }
          (this.stuckAt || (this.stuckAt = new THREE.Vector3())).copy(this.pos);
          this.stuckT = 0;
        }
      }
      const along = Math.max(0.25, Math.cos(Math.min(Math.PI / 2, Math.abs(wrap((target ? Math.atan2(target.x - this.pos.x, target.z - this.pos.z) : this.yaw) - this.yaw)))));
      const sp = speed * along;
      phys.slide(this.pos, f.x * sp * dt, f.z * sp * dt, crawl ? 0.35 : 0.3, crawl ? 0.6 : 1.6, 0.45);
      if (crawl) this.play('crawl', 0.3, Math.max(0.35, speed / 0.5));
      else if (speed > 2) this.play('run', 0.25, speed / 3.0);
      else this.play('walk', 0.3, Math.max(0.5, speed / 0.85));
    } else {
      this.play(crawl ? 'crawl' : 'idle', 0.35, crawl ? 0.15 : 1);
    }
  }

  /** Stand on whatever is below; fall when there's nothing. (And slide on with a shove.) */
  ground(dt) {
    const phys = this.owner.physics;
    if (this.knock && this.knock.lengthSq() > 1e-4) {
      phys.slide(this.pos, this.knock.x * dt, this.knock.z * dt, 0.3, 1.6, 0.45);
      this.knock.multiplyScalar(Math.exp(-9 * dt));
    }
    const fl = phys.floorAt(this.pos.x, this.pos.z, this.pos.y, 0.3, 0.45);
    if (fl === -Infinity) return;
    if (this.pos.y > fl + 0.02) {
      this.vy -= 22 * dt;
      this.pos.y = Math.max(fl, this.pos.y + this.vy * dt);
      this.air += dt;
      if (this.air > 0.25 && !this.dead && this.mode === 'stand' && this.state === 'move') this.play('fall', 0.15);
    } else {
      this.pos.y = fl;
      this.vy = 0;
      this.air = 0;
    }
  }

  /** A body lies a while, then the earth takes it. */
  corpse(dt) {
    this.deadT += dt;
    if (!this.sinking && this.deadT > 120) this.sinking = true;
    if (this.sinking) {
      this.sinkT = (this.sinkT || 0) + dt;
      this.root.position.y = this.pos.y - this.sinkT * 0.12;
      if (this.sinkT > 6) this.remove();
    }
  }

  remove() {
    this.gone = true;
    this.owner.scene.remove(this.root);
    for (const k of this.shared) this.mesh.geometry.deleteAttribute(k); // the other bodies still draw with them
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mixer.stopAllAction();
  }
}

const toXOf = (player, z) => (player.pos.x - z.pos.x) / Math.max(1e-3, Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z));
const toZOf = (player, z) => (player.pos.z - z.pos.z) / Math.max(1e-3, Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z));

/** Distance along a ray (o, unit d) to a capsule (segment a-b, radius r), or null. */
function rayCapsule(o, d, a, b, r) {
  const ab = _u.subVectors(b, a), ao = _w.subVectors(o, a);
  const abab = ab.dot(ab), abd = ab.dot(d), abao = ab.dot(ao), dao = d.dot(ao);
  const den = abab - abd * abd;
  let t = den > 1e-8 ? (abd * abao - abab * dao) / den : 0;
  t = Math.max(0, t);
  const s = Math.max(0, Math.min(1, abab > 0 ? (abao + t * abd) / abab : 0));
  // closest points: on the ray at t, on the segment at s; refine t for that s
  const q = a.clone().addScaledVector(ab, s);
  const tq = Math.max(0, q.clone().sub(o).dot(d));
  const dist = o.clone().addScaledVector(d, tq).distanceTo(q);
  if (dist > r) return null;
  return Math.max(0, tq - Math.sqrt(r * r - dist * dist));
}

export function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

function closestOnSeg(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / Math.max(1e-8, ab.dot(ab))));
  return a.clone().addScaledVector(ab, t);
}

function pickKind(lurk = 0.15) {
  const r = Math.random();
  return r < lurk ? 'lurker' : r < lurk + 0.32 ? 'runner' : 'shambler';
}

// ------------------------------------------------------------------ the horde
export class Zombies {
  constructor(scene, physics, lib = null, sfx = null) {
    this.scene = scene; this.physics = physics; this.lib = lib; this.sfx = sfx;
    this.list = [];
    this.pieces = [];
    this.gltf = {};
    this.nextId = 0;
    this.time = 0;
    this.chasers = 0;
    this.player = null;
    this.gore = new Gore(scene, physics, (x, z, y) => this.floorY(x, z, y));
    this.stubGeo = new THREE.CylinderGeometry(0.014, 0.02, 0.06, 5);
    this.stubMat = new THREE.MeshPhongMaterial({ color: 0xd8ccae, specular: 0x302820, shininess: 20 });
    this.onPlayerHit = null;
    this.yard = null;         // {x0, z0, x1, z1, target, graves, spawnT}
    this.dg = null;           // the dungeon: {nav, y, ...}
    this.flow = null; this.flowKey = -1; this.flowT = 0;
  }

  async load(variants = VARIANTS, monsters = MONSTERS) {
    const loader = new GLTFLoader();
    const monster = async (m) => { this.gltf[m] = adaptMonster(await loader.loadAsync(`${MONSTER_ROOT}${m}.glb`)); };
    const one = async () => { for (const m of monsters) await monster(m); };   // a phone: one decoding at a time
    await Promise.all([
      ...variants.map(async (v) => { this.gltf[v] = await loader.loadAsync(`${ROOT}zombie_${v}.glb`); }),
      ...(TOUCH ? [one()] : monsters.map(monster)),
    ]);
    this.pool = [...variants, ...monsters];
  }

  /** The surface something at (x, y, z) would land on (works underground too). */
  floorY(x, z, y) {
    const f = this.physics.floorAt(x, z, y, 0.02, 0.05);
    return f === -Infinity ? y - 30 : f;
  }

  spawn(variant, x, z, opts = {}) {
    const y = opts.y ?? this.physics.groundAt(x, z);
    const v = variant || this.randomVariant();
    const zb = new Zombie(this.gltf[v], v, this, { ...opts, x, y, z });
    this.physics.slide(zb.pos, 0, 0, 0.3, 1.6, 0.45);
    zb.home.copy(zb.pos);
    zb.sync();
    this.list.push(zb);
    return zb;
  }

  randomVariant() { const p = this.pool || VARIANTS; return p[Math.floor(Math.random() * p.length)]; }

  /** The graveyard: `n` of the dead about the graves, `buried` more under them, and the horde
   * kept at `n` by more clawing out of the ground. `avoid` [x0, z0, x1, z1] keeps them out of
   * the mausoleum. */
  populateYard(b, n, buried, avoid) {
    const graves = [];
    for (const box of this.physics.boxes) {
      if (box.tag !== 'prop') continue;
      const cx = (box.min[0] + box.max[0]) / 2, cz = (box.min[2] + box.max[2]) / 2, h = box.max[1] - box.min[1];
      const w = Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2]);
      if (cx < b.x0 + 2 || cx > b.x1 - 2 || cz < b.z0 + 2 || cz > b.z1 - 2 || h < 0.4 || h > 1.6 || w > 2.4) continue;
      graves.push([cx, cz, box]);
    }
    this.yard = { ...b, target: n, graves, spawnT: 3, avoid };
    const spot = () => {
      for (let i = 0; i < 30; i++) {
        const x = b.x0 + 3 + Math.random() * (b.x1 - b.x0 - 6), z = b.z0 + 3 + Math.random() * (b.z1 - b.z0 - 6);
        if (avoid && x > avoid[0] && x < avoid[2] && z > avoid[1] && z < avoid[3]) continue;
        return [x, z];
      }
      return [(b.x0 + b.x1) / 2, b.z1 - 4];
    };
    for (let i = 0; i < n; i++) { const [x, z] = spot(); this.spawn(this.randomVariant(), x, z, { zone: 'yard', kind: pickKind(0.08) }); }
    for (let i = 0; i < buried; i++) { const [x, z] = this.graveSpot(null) || spot(); this.spawn(this.randomVariant(), x, z, { zone: 'yard', kind: 'lurker', start: 'buried' }); }
  }

  /** Beside a grave, between `near` and `far` metres from p (any grave if p is null). */
  graveSpot(p, near = 7, far = 40) {
    const g = this.yard?.graves;
    if (!g?.length) return null;
    for (let i = 0; i < 40; i++) {
      const [cx, cz, box] = g[Math.floor(Math.random() * g.length)];
      // in front of or behind the stone, whichever side is clear
      const along = box.max[0] - box.min[0] > box.max[2] - box.min[2] ? 'z' : 'x';
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = along === 'x' ? cx + side * ((box.max[0] - box.min[0]) / 2 + 0.9) : cx;
      const z = along === 'z' ? cz + side * ((box.max[2] - box.min[2]) / 2 + 0.9) : cz;
      if (!p) return [x, z];
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > near && d < far) return [x, z];
    }
    return null;
  }

  /** The dungeon: `n` of the dead spread through its rooms; some lie as if dead. */
  populateDungeon(dg, n) {
    this.dg = dg;
    // which cells of the carved grid can be walked: carved, and not filled by furniture between
    // knee and head height
    const nav = dg.nav;
    this.walk = new Uint8Array(nav.nx * nav.nz);
    for (let k = 0; k < nav.nz; k++) for (let i = 0; i < nav.nx; i++) {
      const c = k * nav.nx + i;
      if (nav.cell[c] < 0) continue;
      const x = nav.x0 + i + 0.5, z = nav.z0 + k + 0.5;
      let open = true;
      for (const b of this.physics.near(x, z, x, z)) {
        if (b.tag !== 'prop' || b.max[1] < dg.y + 0.45 || b.min[1] > dg.y + 1.6) continue;   // (walls are in the grid)
        if (x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2]) { open = false; break; }
      }
      this.walk[c] = open ? 1 : 0;
    }
    const rooms = dg.roomList;
    // a spot on the room's own floor: walkable, not in a pit, not up on a dais or in furniture
    const spot = (r, pad) => {
      for (let t = 0; t < 24; t++) {
        const x = r.x0 + pad + Math.random() * (r.x1 - r.x0 - 2 * pad), z = r.z0 + pad + Math.random() * (r.z1 - r.z0 - 2 * pad);
        const c = Math.floor(z - nav.z0) * nav.nx + Math.floor(x - nav.x0);
        if (this.walk[c] && Math.abs(this.physics.floorAt(x, z, dg.y + 0.3, 0.3, 0.45) - dg.y) < 0.1) return [x, z];
      }
      return null;
    };
    for (let i = 0; i < n; i++) {
      const r = rooms[1 + (i % (rooms.length - 1))], p = spot(r, 1.2);
      if (!p) continue;
      const kind = pickKind(0.3);
      this.spawn(this.randomVariant(), p[0], p[1], { y: dg.y, zone: 'dungeon', room: r, kind, start: kind === 'lurker' ? 'playdead' : 'stand' });
    }
    // two sprawled at the foot of the stairs, waiting
    const e = rooms[0];
    for (let i = 0; i < 2; i++) {
      const p = spot(e, 2);
      if (p) this.spawn(this.randomVariant(), p[0], p[1], { y: dg.y, zone: 'dungeon', room: e, kind: 'lurker', start: 'playdead' });
    }
  }

  /** A zombie that has found you calls the others within `r` metres. */
  alert(from, p, r = 14) {
    if (!p) return;
    for (const z of this.list) {
      if (z === from || z.dead || z.gone || z.state === 'buried') continue;
      if (z.pos.distanceTo(from.pos) > r || Math.abs(z.pos.y - from.pos.y) > 2.5) continue;
      if (z.state === 'playdead') { if (z.pos.distanceTo(from.pos) < r * 0.5) z.wake(p); continue; }
      z.hunt(p, true);
    }
  }

  /** A noise at p (a clash of steel, a spell going off) carries `r` metres. */
  noise(p, r) {
    for (const z of this.list) {
      if (z.dead || z.gone || z.state === 'buried') continue;
      const d = z.pos.distanceTo(p);
      if (d > r * (z.has('head') ? 1 : 1.4) || Math.abs(z.pos.y - p.y) > 3) continue;
      if (z.state === 'playdead') { if (d < r * 0.4) z.wake(p); continue; }
      z.hunt(p, z.aggro);
    }
  }

  /** You died: they lose you. */
  forget() {
    for (const z of this.list) { z.aggro = false; z.goal = 'wander'; z.hasLast = false; }
  }

  // -------------------------------------------------------------- the dungeon's flow field
  /** Steps along the corridors from you (a breadth-first flood over the carved grid, redone when
   * you move to another cell). */
  flowUpdate(player, dt) {
    const dg = this.dg;
    this.flowT -= dt;
    if (!dg) return;
    const nav = dg.nav, p = player.pos;
    const ci = Math.floor(p.x - nav.x0), ck = Math.floor(p.z - nav.z0);
    if (ci < 0 || ck < 0 || ci >= nav.nx || ck >= nav.nz || p.y > dg.y + 4 || nav.cell[ck * nav.nx + ci] < 0) { this.flow = null; this.flowKey = -1; return; }
    const walk = this.walk;
    const key = ck * nav.nx + ci;
    if (key === this.flowKey && this.flowT > 0) return;
    this.flowKey = key; this.flowT = 0.5;
    const N = nav.nx * nav.nz;
    const dist = this.flow && this.flow.length === N ? this.flow : new Int16Array(N);
    dist.fill(-1);
    const q = this.queue && this.queue.length === N ? this.queue : (this.queue = new Int32Array(N));
    let h = 0, t = 0;
    dist[key] = 0; q[t++] = key;
    while (h < t) {
      const c = q[h++], d = dist[c];
      if (d >= 400) continue;
      const i = c % nav.nx, k = (c - i) / nav.nx;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nk = k + dk;
        if (ni < 0 || nk < 0 || ni >= nav.nx || nk >= nav.nz) continue;
        const n = nk * nav.nx + ni;
        if (dist[n] >= 0 || !walk[n]) continue;
        dist[n] = d + 1; q[t++] = n;
      }
    }
    this.flow = dist;
  }

  /** How many corridor steps from you p is (Infinity if not reachable or not down there). */
  flowAt(p) {
    if (!this.flow) return Infinity;
    const nav = this.dg.nav, i = Math.floor(p.x - nav.x0), k = Math.floor(p.z - nav.z0);
    if (i < 0 || k < 0 || i >= nav.nx || k >= nav.nz) return Infinity;
    const d = this.flow[k * nav.nx + i];
    return d < 0 ? Infinity : d;
  }

  /** The way toward you along the corridors from p, into out; false if there is none. */
  flowDir(p, out) {
    if (!this.flow) return false;
    const nav = this.dg.nav, i = Math.floor(p.x - nav.x0), k = Math.floor(p.z - nav.z0);
    const at = (a, b) => (a < 0 || b < 0 || a >= nav.nx || b >= nav.nz ? -1 : this.flow[b * nav.nx + a]);
    const here = at(i, k);
    let best = here < 0 ? Infinity : here, bi = i, bk = k;   // (in among the furniture: out to the nearest open cell)
    for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) {
      if (!di && !dk) continue;
      if (di && dk && here >= 0 && (at(i + di, k) < 0 || at(i, k + dk) < 0)) continue;   // no cutting corners
      const d = at(i + di, k + dk);
      if (d >= 0 && d < best) { best = d; bi = i + di; bk = k + dk; }
    }
    if (bi === i && bk === k) return false;
    out.set(nav.x0 + bi + 0.5 - p.x, 0, nav.z0 + bk + 0.5 - p.z).normalize();
    return true;
  }

  /** The nearest zombie a ray hits within `far`: {t, bone, point, z} or null. */
  ray(o, d, far) {
    let best = null;
    for (const z of this.list) {
      const h = z.ray(o, d, far);
      if (h && (!best || h.t < best.t)) best = h;
    }
    return best;
  }

  /** A blast at `at`: every zombie near takes damage at its nearest bone. */
  blast(at, radius, dmg, kind = 'fire') {
    for (const z of this.list) {
      if (z.gone || z.pos.distanceTo(at) > radius + 1.5) continue;
      let best = null;
      for (const c of z.capsules()) {
        const p = closestOnSeg(at, c.a, c.b);
        const d = p.distanceTo(at) - c.r;
        if (d < radius && (!best || d < best.d)) best = { d, bone: c.bone, point: p };
      }
      if (!best) continue;
      const k = 1 - Math.max(0, best.d) / radius;
      const dir = best.point.clone().sub(at).normalize();
      z.hit({ ...best, t: 0, z }, { dmg: dmg * k, dir, heavy: k > 0.6, kind });
    }
  }

  addPiece(z, tris, joint, dir) {
    const src = z.mesh.geometry, uv = src.attributes.uv, bind = src.attributes.bindPos, shell = src.attributes.shell;
    const map = new Map(), pos = [], bp = [], uvs = [], sh = [], index = [];
    const v = new THREE.Vector3();
    z.mesh.updateMatrixWorld(true);
    for (const i of tris) {
      if (!map.has(i)) {
        map.set(i, pos.length / 3);
        z.mesh.getVertexPosition(i, v);
        v.applyMatrix4(z.mesh.matrixWorld);
        pos.push(v.x, v.y, v.z);
        bp.push(bind.getX(i), bind.getY(i), bind.getZ(i));
        uvs.push(uv.getX(i), uv.getY(i));
        if (shell) sh.push(shell.getX(i));
      }
      index.push(map.get(i));
    }
    const c = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) c.add(v.set(pos[i], pos[i + 1], pos[i + 2]));
    c.divideScalar(pos.length / 3);
    for (let i = 0; i < pos.length; i += 3) { pos[i] -= c.x; pos[i + 1] -= c.y; pos[i + 2] -= c.z; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('bindPos', new THREE.Float32BufferAttribute(bp, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (shell) g.setAttribute('shell', new THREE.Float32BufferAttribute(sh, 1));   // armour and cloth stay armour and cloth inside
    g.setIndex(index);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    // the piece keeps a material of its own (sharing the body's wounds), so it outlives the body
    const mat = z.mesh.material.clone();
    mat.userData.u = z.u;
    mat.onBeforeCompile = z.mesh.material.onBeforeCompile;
    mat.customProgramCacheKey = z.mesh.material.customProgramCacheKey;
    const m = new THREE.Mesh(g, mat);
    m.position.copy(c);
    m.castShadow = true;
    this.scene.add(m);
    if (this.pieces.length > 50) { const o = this.pieces.shift(); this.scene.remove(o.m); o.m.geometry.dispose(); o.m.material.dispose(); }
    // its long axis (towards the farthest vertex) and how thick it is, to lie it down on the ground
    let far = 0;
    const long = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) { const d = v.set(pos[i], pos[i + 1], pos[i + 2]).length(); if (d > far) { far = d; long.copy(v).normalize(); } }
    this.pieces.push({ long, half: far, thick: tris.length > 600 ? 0.1 : 0.05, m,
      v: dir.clone().multiplyScalar(2 + Math.random() * 2).add(new THREE.Vector3(0, 2.2 + Math.random() * 1.5, 0)),
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), w: 5 + Math.random() * 7,
      cut: m.worldToLocal(joint.clone()), bleed: 0, rest: false, age: 0 });
  }

  /** Earth thrown up where one claws its way out. */
  dirt(p, amount) {
    const g = this.gore;
    const n = Math.round(40 * amount);
    for (let i = 0; i < n; i++) {
      const v = _t.set((Math.random() - 0.5) * 2.4, 1.5 + Math.random() * 3 * amount, (Math.random() - 0.5) * 2.4);
      g.drop(_u.set(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.05, p.z + (Math.random() - 0.5) * 0.6), v, 0.02 + Math.random() * 0.03, g.soil[Math.floor(Math.random() * g.soil.length)]);
    }
    if (amount >= 1) g.splat(p.x, p.y, p.z, 1.4, 0, g.soil[0]);
  }

  sound(kind, p, loud = false) {
    const s = this.sfx;
    if (!s?.ctx) return;
    const cam = this.listener;
    const d = cam ? cam.distanceTo(p) : 5;
    const k = Math.max(0, 1 - d / 40) * (loud ? 1.3 : 1);
    if (k <= 0) return;
    const t = s.ctx.currentTime;
    if (kind === 'squelch') {
      s._noise(t, 0.22, { type: 'lowpass', f0: 1400, f1: 160, gain: 0.55 * k, attack: 0.004 });
      s._tone(t, 0.18, { type: 'sine', f0: 140, f1: 45, gain: 0.25 * k });
      if (loud) s._noise(t + 0.03, 0.12, { type: 'highpass', f0: 2600, f1: 1200, gain: 0.15 * k });
    } else if (kind === 'sever') {
      s._noise(t, 0.06, { type: 'highpass', f0: 3200, f1: 1800, gain: 0.35 * k });          // the crack of bone
      s._noise(t + 0.02, 0.45, { type: 'lowpass', f0: 1100, f1: 90, gain: 0.7 * k, attack: 0.004 });
      s._tone(t, 0.3, { type: 'sine', f0: 110, f1: 35, gain: 0.3 * k });
    } else if (kind === 'groan') {
      if (this.groaning > t) return;                                                  // not a choir
      this.groaning = t + 0.35;
      const f = 70 + Math.random() * 40, dur = 0.9 + Math.random() * 1.0;
      s._tone(t, dur, { type: 'sawtooth', f0: f, f1: f * (0.7 + Math.random() * 0.2), gain: 0.07 * k, attack: 0.15 });
      s._tone(t, dur, { type: 'sawtooth', f0: f * 1.51, f1: f * 1.2, gain: 0.03 * k, attack: 0.2 });
      s._noise(t, dur, { type: 'bandpass', f0: 380, f1: 260, q: 3, gain: 0.12 * k, attack: 0.2 });
    } else if (kind === 'die') {
      s._tone(t, 1.6, { type: 'sawtooth', f0: 95, f1: 40, gain: 0.08 * k, attack: 0.05 });
      s._noise(t + 0.5, 0.3, { type: 'lowpass', f0: 600, f1: 100, gain: 0.5 * k });
    } else if (kind === 'dirt') {
      s._noise(t, 1.2, { type: 'lowpass', f0: 500, f1: 120, gain: 0.45 * k, attack: 0.02 });
      s._noise(t + 0.3, 0.8, { type: 'bandpass', f0: 900, f1: 300, q: 1.5, gain: 0.2 * k, attack: 0.05 });
    }
  }

  update(dt, player, active, camera, height, light = 1) {
    this.time += dt;
    this.player = player;
    this.listener = camera.position;
    this.flowUpdate(player, dt);
    let chasers = 0;
    const list = this.list;
    for (const z of list) {
      if (z.gone) continue;
      const d = Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z);
      const otherLevel = Math.abs(player.pos.y - z.pos.y) > 6;
      const far = d > 85 || (otherLevel && d > 12);
      if (z.state !== 'buried') z.root.visible = !far;
      z.mesh.castShadow = d < 28;
      z.update(dt, player, active, far, d > 32);
      if (z.goal === 'chase' && !z.dead && d < 12) chasers++;
    }
    this.chasers = chasers;
    // they keep a little apart (and crawlers take more room)
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.standing || a.gone) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.standing || b.gone) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = (a.mode === 'crawl' ? 0.5 : 0.36) + (b.mode === 'crawl' ? 0.5 : 0.36);
        if (Math.abs(dx) > min || Math.abs(dz) > min || Math.abs(b.pos.y - a.pos.y) > 1.5) continue;
        const d = Math.hypot(dx, dz);
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) * 0.5 / d;
        a.pos.x -= dx * push; a.pos.z -= dz * push; b.pos.x += dx * push; b.pos.z += dz * push;
      }
    }
    // the graveyard keeps its dead: more claw their way out as you cut them down
    const y = this.yard;
    if (y) {
      let alive = 0, corpses = [];
      for (const z of list) {
        if (z.gone || z.zone !== 'yard') continue;
        if (z.dead) corpses.push(z); else alive++;
      }
      // too many bodies: the oldest sink first
      corpses = corpses.filter((z) => !z.sinking).sort((a, b) => b.deadT - a.deadT);
      for (let i = 0; i < corpses.length - 24; i++) corpses[i].sinking = true;
      y.spawnT -= dt;
      if (alive < y.target && y.spawnT <= 0) {
        y.spawnT = 2 + Math.random() * 4;
        const inYard = player.pos.x > y.x0 - 20 && player.pos.x < y.x1 + 20 && player.pos.z > y.z0 - 20 && player.pos.z < y.z1 + 20;
        const s = this.graveSpot(inYard ? player.pos : null);
        if (s) {
          const zb = this.spawn(this.randomVariant(), s[0], s[1], { zone: 'yard', kind: pickKind(0.08), start: 'rise' });
          zb.yaw = Math.atan2(player.pos.x - zb.pos.x, player.pos.z - zb.pos.z);
        }
      }
    }
    if (list.some((z) => z.gone)) this.list = list.filter((z) => !z.gone);
    const g = this.gore;
    for (const p of this.pieces) {
      p.bleed += dt;
      if (p.bleed < 4 && Math.random() < dt * 40 * (1 - p.bleed / 4)) {
        g.spray(p.m.localToWorld(_w.copy(p.cut)), _u.set(0, 0.3, 0), 1, { speed: 0.8, spread: 1, size: 0.014 });
      }
      if (p.rest) continue;
      p.v.y -= 13 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotateOnWorldAxis(p.spin, p.w * dt);
      const ax = _u.copy(p.long).applyQuaternion(p.m.quaternion);
      const reach = Math.abs(ax.y) * p.half * 0.85 + p.thick;   // how far it hangs below its middle
      const gy = this.floorY(p.m.position.x, p.m.position.z, p.m.position.y);
      if (p.m.position.y - reach < gy) {
        p.m.position.y = gy + reach;
        if (p.v.y < -1.5) {
          p.v.y *= -0.3; p.v.x *= 0.55; p.v.z *= 0.55; p.w *= 0.5;
          g.splat(p.m.position.x, gy, p.m.position.z, 0.5);
        } else { // it topples and lies along the ground
          const flat = _w.set(ax.x, 0, ax.z);
          if (flat.lengthSq() < 1e-4) flat.set(1, 0, 0);
          p.m.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(ax, flat.normalize()));
          p.m.position.y = gy + p.thick;
          p.v.set(0, 0, 0); p.rest = true;
          g.splat(p.m.position.x, gy, p.m.position.z, 0.7, 0.08);
        }
      }
    }
    g.update(dt, camera, height, light);
  }
}
