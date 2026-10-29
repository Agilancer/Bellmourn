// The walking dead of the graveyard (templates/models/creatures/zombie/zombie_<a|b|c>.glb).
//
// Every zombie is a skinned glTF with its own clips (idle, walk, run, jump, attack1-3, fall,
// death, dead, and on the ground: collapse, crawl, crawl_attack, crawl_death, crawl_dead).
// They shamble about until they notice you, then come for you: walking, then running when
// close, jumping graves and walls in the way, raking and biting when they reach you.
//
// Gore: a blow punches a jagged hole in the flesh where it lands. Wounds are kept in the
// mesh's bind space so they ride the animation; the shader tears the skin away inside them,
// rims them in raw meat and draws the body's own inner faces as wet red innards and gut. Enough
// damage to a limb or the head cuts it off: its triangles leave the body and tumble away as a
// piece of their own, the stump keeps a bone stub and spurts with a fading pulse. A zombie
// without its head keeps coming; one without a leg drops and drags itself along with whatever
// arms it has left. Only destroying the body stops it. Blood is opaque droplets that splat
// and pool on the ground, with gibs of meat.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const ROOT = 'templates/models/creatures/zombie/';
const FPS = 30;
const HIT_AT = { attack1: 14, attack2: 14, attack3: 21, crawl_attack: 13 };   // frame the blow lands
const ATTACK_DMG = { attack1: 12, attack2: 10, attack3: 18, crawl_attack: 9 };
const ONCE = new Set(['jump', 'attack1', 'attack2', 'attack3', 'death', 'collapse', 'crawl_attack', 'crawl_death']);
const N = (s) => THREE.PropertyBinding.sanitizeNodeName(s);
// limbs that can be cut off, and how much they take
const LIMB_HP = { head: 50, upper_armL: 60, forearmL: 45, handL: 26, thighL: 75, shinL: 55, footL: 30,
  upper_armR: 60, forearmR: 45, handR: 26, thighR: 75, shinR: 55, footR: 30 };
const RADIUS = { hips: 0.17, spine: 0.16, chest: 0.18, neck: 0.065, head: 0.12, shoulder: 0.07, upper_arm: 0.06,
  forearm: 0.052, hand: 0.05, thigh: 0.085, shin: 0.065, foot: 0.06 };
const TIP = { head: 0.24, hand: 0.27, foot: 0.19 };           // leaf bones' lengths (along their +y)
const HP = 170;
const WOUNDS = 16;

const GORE_GLSL = /* glsl */`
uniform vec4 uWound[${WOUNDS}];
uniform float uWoundN;
varying vec3 vBind;
float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// wounds (w > 0: a hole torn in the skin) and cuts (w < 0: a severed joint)
float gore(inout vec4 col) {
  float hole = 99.0, cut = 99.0;
  for (int i = 0; i < ${WOUNDS}; i++) {
    if (float(i) >= uWoundN) break;
    vec4 w = uWound[i];
    float d = length(vBind - w.xyz) / abs(w.w);
    if (w.w > 0.0) hole = min(hole, d); else cut = min(cut, d);
  }
  float n = gNoise(vBind * 60.0) * 0.65 + gNoise(vBind * 170.0) * 0.35;
  float h = hole + (n - 0.5) * 0.6;
  float c = cut + (n - 0.5) * 0.5;
  vec3 raw = mix(vec3(0.30, 0.015, 0.02), vec3(0.70, 0.12, 0.10), n);
  if (gl_FrontFacing) {
    if (h < 0.6) discard;                               // torn open
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

function goreMaterial(src, lib) {
  const map = src.map;
  if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapLinearFilter; map.needsUpdate = true; }
  const mat = new THREE.MeshPhongMaterial({ map, side: THREE.DoubleSide, alphaTest: 0.5, specular: 0x2c1e1c, shininess: 30 });
  if (map && lib?.normals) mat.normalMap = lib.normalFrom(map, 1.0);
  const u = { uWound: { value: Array.from({ length: WOUNDS }, () => new THREE.Vector4(0, -99, 0, 0.001)) }, uWoundN: { value: 0 } };
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
  constructor(scene, physics) {
    this.scene = scene; this.physics = physics;
    const M = this.max = 3000;
    this.n = 0;
    this.pos = new Float32Array(M * 3); this.vel = new Float32Array(M * 3); this.col = new Float32Array(M * 3);
    this.size = new Float32Array(M); this.life = new Float32Array(M); this.floor = new Float32Array(M);
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

  drop(p, v, size = 0.014) {
    const i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    const c = this.reds[Math.floor(Math.random() * this.reds.length)];
    this.col.set([c.r, c.g, c.b], i * 3);
    this.size[i] = size; this.life[i] = 3;
    this.floor[i] = this.physics.groundAt(p.x, p.z);
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

  splat(x, y, z, r, grow = 0) {
    const i = this.splatNext;
    this.splatNext = (i + 1) % this.splatMax;
    this.splats.count = Math.max(this.splats.count, i + 1);
    const rot = Math.random() * 6.28;
    const c = this.reds[Math.floor(Math.random() * 3)];
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
        if (P[j + 1] <= this.floor[i] && Math.random() < 0.22) this.splat(P[j], this.floor[i], P[j + 2], 0.06 + this.size[i] * 8);
        const k = --this.n;                              // swap-remove
        if (i !== k) {
          P.copyWithin(j, k * 3, k * 3 + 3); V.copyWithin(j, k * 3, k * 3 + 3); this.col.copyWithin(j, k * 3, k * 3 + 3);
          this.size[i] = this.size[k]; this.life[i] = this.life[k]; this.floor[i] = this.floor[k];
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
      const fl = this.physics.groundAt(g.m.position.x, g.m.position.z) + g.s;
      if (g.m.position.y < fl) {
        g.m.position.y = fl;
        if (g.v.y < -1.2) { g.v.y *= -0.25; g.v.x *= 0.5; g.v.z *= 0.5; g.spin.multiplyScalar(0.5); this.splat(g.m.position.x, fl - g.s, g.m.position.z, 0.1); }
        else { g.rest = true; }
      }
    }
  }
}

// ------------------------------------------------------------------ a zombie
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _m = new THREE.Matrix4();

class Zombie {
  constructor(gltf, variant, owner, x, z, yaw, lib) {
    this.owner = owner;
    this.variant = variant;
    const root = this.root = new THREE.Group();
    const model = cloneSkinned(gltf.scene);
    root.add(model);
    model.traverse((o) => { if (o.isSkinnedMesh) this.mesh = o; });
    const mesh = this.mesh;
    mesh.geometry = mesh.geometry.clone();
    const geo = mesh.geometry;
    geo.setAttribute('bindPos', geo.attributes.position.clone());
    mesh.material = goreMaterial(mesh.material, lib);
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
      if (ONCE.has(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[clip.name] = a;
    }
    this.cur = null;
    this.play('idle', 0);
    this.mixer.update(Math.random() * 2);

    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = yaw;
    this.home = this.pos.clone();
    this.vy = 0; this.air = 0;
    this.hp = HP;
    this.limbHp = { ...LIMB_HP };
    this.lost = new Set();     // bones cut away (with all below them)
    this.wounds = []; this.cuts = [];
    this.mode = 'stand';       // stand | crawl
    this.state = 'move';       // move | attack | jump | collapse | stagger | dead
    this.aggro = false;
    this.wander = null; this.wanderT = 2 + Math.random() * 4;
    this.groanT = 2 + Math.random() * 6;
    this.stumps = [];
    this.stagger = 0;
    this.jitter = 0;
    owner.scene.add(root);
    this.sync();
  }

  get dead() { return this.state === 'dead'; }
  has(b) { return !this.lost.has(b); }
  arm(s) { return this.has('upper_arm' + s) && this.has('forearm' + s); }
  get legs() { return ['thighL', 'shinL', 'thighR', 'shinR'].every((b) => this.has(b)); }
  get feet() { return this.has('footL') && this.has('footR'); }
  forward(out = _v) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  play(name, fade = 0.25, speed = 1) {
    const a = this.actions[name];
    if (!a) return;
    a.timeScale = speed;
    if (this.cur === name) {
      if (ONCE.has(name) && this.done()) { a.reset().play(); this.fired = false; }   // again, from the top
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

  // -------------------------------------------------------------- hits
  /** Bone capsules in world space: [{bone, a, b, r}] for the bones still attached. */
  capsules() {
    const out = [];
    this.root.updateMatrixWorld(true);
    for (const b of this.skel.bones) {
      if (b.name === 'root' || this.cutAway(b.name)) continue;
      const kind = b.name.replace(/[LR]$/, '');
      const r = RADIUS[kind];
      if (!r) continue;
      const a = b.getWorldPosition(new THREE.Vector3());
      const child = b.children.find((c) => c.isBone && !c.name.startsWith('shoulder') && !c.name.startsWith('thigh'));
      let e;
      if (child && kind !== 'hips') e = child.getWorldPosition(new THREE.Vector3());
      else if (kind === 'hips') e = this.bones.spine.getWorldPosition(new THREE.Vector3());
      else e = b.localToWorld(new THREE.Vector3(0, TIP[kind] || 0.2, 0));
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
    if (o.distanceTo(this.pos) > far + 2.5) return null;
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
    all.forEach((w, i) => this.u.uWound.value[i].copy(w));
    this.u.uWoundN.value = all.length;
  }

  wound(point, bone, r) {
    const c = this.toBind(point, bone);
    this.wounds.push(new THREE.Vector4(c.x, c.y, c.z, r));
    while (this.wounds.length + this.cuts.length > WOUNDS) this.wounds.shift();
    this.writeWounds();
  }

  /** The limb (sever point) a hit on bone b damages, or null for the trunk. */
  limbOf(b) {
    const n = b.name;
    if (LIMB_HP[n] !== undefined) return n;
    if (n === 'neck') return 'head';
    return null;
  }

  hit(h, { dmg, dir, heavy = false, kind = 'blade' }) {
    const g = this.owner.gore;
    const b = h.bone, p = h.point;
    const back = dir.clone().negate();
    // the wound and its blood
    const r = (heavy ? 0.085 : 0.06) + (kind === 'fire' ? 0.03 : 0) + Math.random() * 0.02;
    this.wound(p, b, r);
    g.spray(p, dir, heavy ? 70 : 45, { speed: heavy ? 4.5 : 3.4, spread: 0.9 });
    g.spray(p, back.clone().add(_u.set(0, 0.6, 0)), heavy ? 40 : 26, { speed: 2.6, spread: 0.8 });
    for (let i = 0; i < (heavy ? 7 : 4); i++) g.gib(p, _w.copy(dir).multiplyScalar(2 + Math.random() * 2).add(_u.set((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3)));
    g.splat(p.x, this.owner.physics.groundAt(p.x, p.z), p.z, 0.35 + Math.random() * 0.3);
    this.owner.sound('squelch', p, heavy);
    // damage: limbs come off, the trunk dies
    const limb = this.limbOf(b);
    if (limb && !this.lost.has(limb)) {
      this.limbHp[limb] -= dmg * (kind === 'blade' ? 1 : 0.7);
      this.hp -= dmg * 0.35;
      if (this.limbHp[limb] <= 0) this.sever(limb, dir);
    } else {
      this.hp -= dmg;
    }
    this.aggro = true;
    if (!this.dead) {
      this.pos.addScaledVector(_w.set(dir.x, 0, dir.z).normalize(), heavy ? 0.22 : 0.12);
      if (this.state === 'move') { this.stagger = heavy ? 0.45 : 0.25; }
      if (this.hp <= 0) this.die();
    }
  }

  sever(name, dir) {
    const owner = this.owner, g = owner.gore;
    const bone = this.bones[name];
    const parent = bone.parent;
    // the triangles of the limb and everything below it
    const set = new Set();
    bone.traverse((o) => { if (o.isBone) set.add(this.skel.bones.indexOf(o)); });
    const idx = this.index, keep = [], gone = [];
    for (let t = 0; t < this.alive.length; t++) {
      if (!this.alive[t]) continue;
      const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
      const n = set.has(this.dom[a]) + set.has(this.dom[b]) + set.has(this.dom[c]);
      if (n >= 2) { this.alive[t] = 0; gone.push(a, b, c); } else keep.push(a, b, c);
    }
    this.lost.add(name);
    this.mesh.geometry.setIndex(keep);
    // the joint, in world space and bind space; a cut there colours the stump and the piece
    const joint = bone.getWorldPosition(new THREE.Vector3());
    const jb = this.toBind(joint, parent);
    this.cuts.push(new THREE.Vector4(jb.x, jb.y, jb.z, -(name === 'head' ? 0.09 : 0.075)));
    this.writeWounds();
    // the piece that comes away, frozen in its pose at the moment of the cut
    if (gone.length) owner.addPiece(this, gone, joint, dir);
    // a bone stub on the stump, and a spurting pulse
    const along = bone.position.clone().normalize();
    const stub = new THREE.Mesh(owner.stubGeo, owner.stubMat);
    stub.position.copy(bone.position).addScaledVector(along, 0.015);
    stub.quaternion.setFromUnitVectors(_u.set(0, 1, 0), along);
    parent.add(stub);
    this.stumps.push({ bone: parent, at: bone.position.clone(), dir: along.clone(), t: 0, life: 9 });
    g.spray(joint, _w.copy(dir).add(_u.set(0, 1, 0)), 160, { speed: 4.5, spread: 0.8, size: 0.018 });
    for (let i = 0; i < 10; i++) g.gib(joint, _w.set((Math.random() - 0.5) * 4, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 4));
    g.splat(joint.x, owner.physics.groundAt(joint.x, joint.z), joint.z, 0.9, 0.15);
    owner.sound('sever', joint);
    if (name === 'head') { this.hp -= 30; this.jitter = 1; }
    // without a leg it can no longer stand
    if (!this.dead && this.mode === 'stand' && !this.legs) {
      this.state = 'collapse';
      this.play('collapse', 0.12);
    }
  }

  die() {
    this.state = 'dead';
    this.play(this.mode === 'crawl' || this.cur === 'collapse' ? 'crawl_death' : 'death', 0.15);
    const g = this.owner.gore;
    g.splat(this.pos.x, this.owner.physics.groundAt(this.pos.x, this.pos.z), this.pos.z - 0.0, 2.0, 0.18);
    this.owner.sound('die', this.pos);
  }

  // -------------------------------------------------------------- behaviour
  update(dt, player, active) {
    const owner = this.owner, phys = owner.physics;
    this.mixer.update(dt);
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
      this.ground(dt);
      this.sync();
      return;
    }
    const to = _w.subVectors(player.pos, this.pos);
    to.y = 0;
    const dist = to.length();
    if (active && !this.aggro && dist < 17 && Math.abs(player.pos.y - this.pos.y) < 4) { this.aggro = true; owner.sound('groan', this.pos, true); }
    if (this.aggro) {
      this.groanT -= dt;
      if (this.groanT < 0) { this.groanT = 3 + Math.random() * 5; owner.sound('groan', this.pos); }
    }
    const crawl = this.mode === 'crawl';

    if (this.state === 'collapse') {
      if (this.done()) { this.mode = 'crawl'; this.state = 'move'; }
    } else if (this.state === 'attack') {
      const a = this.actions[this.cur];
      if (!this.fired && a.time * FPS >= HIT_AT[this.cur]) {
        this.fired = true;
        const reach = crawl ? 2.0 : 1.9;
        const ang = Math.abs(wrap(Math.atan2(to.x, to.z) - this.yaw));
        if (active && dist < reach && ang < 1.2 && Math.abs(player.pos.y - this.pos.y) < 1.2) owner.onPlayerHit?.(ATTACK_DMG[this.cur], this);
      }
      if (this.done()) { this.state = 'move'; this.cool = 0.35; }
    } else if (this.state === 'jump') {
      const f = this.forward();
      this.pos.addScaledVector(f, 2.3 * dt);
      if (this.done()) { this.state = 'move'; phys.slide(this.pos, 0, 0, 0.3, 1.6, 0.45); }
    } else {
      this.cool = Math.max(0, (this.cool || 0) - dt);
      this.stagger = Math.max(0, this.stagger - dt);
      // where to go
      let target = null, speed = 0;
      if (this.aggro && active) {
        target = _v.copy(player.pos);
        if (!this.has('head')) {        // blind: it lurches after the sound of you, off line
          this.jitter += dt;
          target.x += Math.sin(this.jitter * 0.9) * Math.min(3, dist * 0.35);
          target.z += Math.cos(this.jitter * 0.7) * Math.min(3, dist * 0.35);
        }
        if (crawl) speed = 0.12 + 0.2 * this.arm('L') + 0.2 * this.arm('R');
        else if (!this.feet) speed = 0.7;
        else speed = dist < 9 ? 3.0 : 0.85;
      } else {
        this.wanderT -= dt;
        if (this.wanderT < 0) {
          this.wanderT = 5 + Math.random() * 6;
          this.wander = Math.random() < 0.6 ? this.home.clone().add(_u.set((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9)) : null;
        }
        if (this.wander && this.wander.distanceTo(this.pos) > 0.6) { target = _v.copy(this.wander); speed = crawl ? 0.25 : 0.7; }
      }
      if (this.stagger > 0) speed = 0;
      if (target) {
        const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
        const turn = (crawl ? 1.4 : 2.6) * dt;
        this.yaw += Math.max(-turn, Math.min(turn, wrap(want - this.yaw)));
      }
      // attack when in reach and facing
      const ang = Math.abs(wrap(Math.atan2(to.x, to.z) - this.yaw));
      const reach = crawl ? 1.55 : 1.35;
      const moves = crawl ? (this.arm('R') || this.has('head') ? ['crawl_attack'] : [])
        : [this.arm('R') && 'attack1', this.arm('L') && 'attack2', (this.arm('L') || this.arm('R') || this.has('head')) && 'attack3'].filter(Boolean);
      if (this.aggro && active && dist < reach && ang < 0.6 && !this.cool && moves.length) {
        this.state = 'attack';
        this.play(moves[Math.floor(Math.random() * moves.length)], 0.12);
      } else if (speed > 0 && !(this.aggro && dist < reach * 0.8)) {
        const f = this.forward();
        // something in the way: a grave or a wall it can get over, it jumps
        if (!crawl && this.feet && this.air === 0) {
          const o = [this.pos.x, this.pos.y + 0.45, this.pos.z];
          const low = phys.ray(o, [f.x, 0, f.z], 0.9);
          if (low && low.box && !phys.ray([o[0], this.pos.y + 1.65, o[2]], [f.x, 0, f.z], 1.6)) {
            this.state = 'jump';
            this.play('jump', 0.1);
          }
        }
        if (this.state === 'move') {
          phys.slide(this.pos, f.x * speed * dt, f.z * speed * dt, crawl ? 0.35 : 0.3, crawl ? 0.6 : 1.6, 0.45);
          if (crawl) this.play('crawl', 0.3, Math.max(0.35, speed / 0.5));
          else if (speed > 2) this.play('run', 0.25, speed / 3.0);
          else this.play('walk', 0.3, speed / 0.85);
        }
      } else {
        this.play(crawl ? 'crawl' : 'idle', 0.35, crawl ? 0.15 : 1);
      }
    }
    this.ground(dt);
    // the player can't walk through it
    if (!this.dead) {
      const c = crawl ? this.forward(_u).multiplyScalar(0.5).add(this.pos) : this.pos;
      const dx = player.pos.x - c.x, dz = player.pos.z - c.z, d = Math.hypot(dx, dz), min = (crawl ? 0.45 : 0.35) + 0.32;
      if (d < min && d > 1e-4 && Math.abs(player.pos.y - this.pos.y) < 1.5) { player.pos.x = c.x + dx / d * min; player.pos.z = c.z + dz / d * min; }
    }
    this.sync();
  }

  /** Stand on whatever is below; fall when there's nothing. */
  ground(dt) {
    const phys = this.owner.physics;
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
}

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

function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

// ------------------------------------------------------------------ the horde
export class Zombies {
  constructor(scene, physics, lib = null, sfx = null) {
    this.scene = scene; this.physics = physics; this.lib = lib; this.sfx = sfx;
    this.list = [];
    this.pieces = [];
    this.gltf = {};
    this.gore = new Gore(scene, physics);
    this.stubGeo = new THREE.CylinderGeometry(0.014, 0.02, 0.06, 5);
    this.stubMat = new THREE.MeshPhongMaterial({ color: 0xd8ccae, specular: 0x302820, shininess: 20 });
    this.onPlayerHit = null;
  }

  async load(variants = ['a', 'b', 'c']) {
    const loader = new GLTFLoader();
    await Promise.all(variants.map(async (v) => { this.gltf[v] = await loader.loadAsync(`${ROOT}zombie_${v}.glb`); }));
  }

  spawn(variant, x, z, yaw = 0) {
    const zb = new Zombie(this.gltf[variant], variant, this, x, z, yaw, this.lib);
    zb.pos.y = this.physics.groundAt(x, z);
    this.physics.slide(zb.pos, 0, 0, 0.3, 1.6, 0.45);
    this.list.push(zb);
    return zb;
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
      if (z.pos.distanceTo(at) > radius + 1.5) continue;
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
    const src = z.mesh.geometry, uv = src.attributes.uv, bind = src.attributes.bindPos;
    const map = new Map(), pos = [], bp = [], uvs = [], index = [];
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
    g.setIndex(index);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, z.mesh.material);
    m.position.copy(c);
    m.castShadow = true;
    this.scene.add(m);
    if (this.pieces.length > 40) { const o = this.pieces.shift(); this.scene.remove(o.m); o.m.geometry.dispose(); }
    // its long axis (towards the farthest vertex) and how thick it is, to lie it down on the ground
    let far = 0;
    const long = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) { const d = v.set(pos[i], pos[i + 1], pos[i + 2]).length(); if (d > far) { far = d; long.copy(v).normalize(); } }
    this.pieces.push({ long, half: far, thick: tris.length > 600 ? 0.1 : 0.05, m, v: dir.clone().multiplyScalar(2 + Math.random() * 2).add(new THREE.Vector3(0, 2.2 + Math.random() * 1.5, 0)),
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), w: 5 + Math.random() * 7,
      cut: m.worldToLocal(joint.clone()), bleed: 0, rest: false });
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
      const f = 70 + Math.random() * 40, dur = 0.9 + Math.random() * 1.0;
      s._tone(t, dur, { type: 'sawtooth', f0: f, f1: f * (0.7 + Math.random() * 0.2), gain: 0.07 * k, attack: 0.15 });
      s._tone(t, dur, { type: 'sawtooth', f0: f * 1.51, f1: f * 1.2, gain: 0.03 * k, attack: 0.2 });
      s._noise(t, dur, { type: 'bandpass', f0: 380, f1: 260, q: 3, gain: 0.12 * k, attack: 0.2 });
    } else if (kind === 'die') {
      s._tone(t, 1.6, { type: 'sawtooth', f0: 95, f1: 40, gain: 0.08 * k, attack: 0.05 });
      s._noise(t + 0.5, 0.3, { type: 'lowpass', f0: 600, f1: 100, gain: 0.5 * k });
    }
  }

  update(dt, player, active, camera, height, light = 1) {
    this.listener = camera.position;
    for (const z of this.list) z.update(dt, player, active);
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
      const gy = this.physics.groundAt(p.m.position.x, p.m.position.z);
      const reach = Math.abs(ax.y) * p.half * 0.85 + p.thick;   // how far it hangs below its middle
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

function closestOnSeg(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / Math.max(1e-8, ab.dot(ab))));
  return a.clone().addScaledVector(ab, t);
}
