// Ragdolls, for every body built on the dead's (zombies.js: the dead, the Vigil's knights, sorcerers,
// ghasts and grubbers, the Sworn, the goat men). The moment one dies its clips let go and it falls as
// a body falls: limp, under its own weight, the way the blow that killed it was going, onto whatever
// is under it. It comes to rest on the ground, the steps, a tomb or against a wall and lies as it
// landed; a blow on it afterwards (or a spell that is a force) moves it again.
//
// The body is a couple of dozen points (Verlet, a fixed step), one at the top of each of its twenty
// bones and one at the end of the head, the hands and the feet, all read off the hit shapes the blows
// find (Zombie.capsules), so whatever it has lost it falls without:
//   the trunk    the hips, spine, chest, collarbones and the tops of the neck, arms and legs move as
//                one stiff piece (shape matching: the best turn and shift of how they lay at death)
//   the limbs    each bone a stick of its own length hung from the one above it, and held to how far
//                its joint goes: the knees bend one way, the elbows the way they were bent, the hips
//                and shoulders within a body's reach, the neck, head, wrists and ankles near how they
//                were. For a moment the last of its strength holds them (BRACE), then they go slack
//   the world    every point is a ball against the world's boxes and walls (physics.js), the ground
//                and the moving floors, with friction, so it skids a little and stops; the limbs are
//                kept out of the trunk and the legs out of each other
// The skeleton is posed from the points each frame: the trunk's bones by its turn and shift, each limb
// bone swung from how it lay to where its stick now points (its twist carried down from the bone
// above), and everything else (fingers, toes, a villager rig's Body, root and pole bones) carried
// along as it was. It sleeps once it has lain still a moment (or after LIFE seconds, whatever it is
// doing), and then costs nothing. A limb cut from one lying there takes its points with it (the body
// is built again from where it lies).
//
// ?ragdoll=0 turns them off: the dead play their death clips as before.
import * as THREE from 'three';
import { TOUCH } from './input.js';

export const RAGDOLLS = (() => { try { return new URLSearchParams(location.search).get('ragdoll') !== '0'; } catch { return true; } })();

const G = 15;                  // m/s²: a little over the world's own, so a fall reads as weight
const H = 1 / 60;              // the fixed step
const STEPS = 3;               // the most steps a frame (a long frame's time beyond is let go)
const ITER = TOUCH ? 4 : 7;    // passes over the constraints a step (fewer when many fall at once)
const DRAG = 0.996;            // of its speed a point keeps a step, in the air
const FRICTION = 0.5;          // of its sliding speed a point touching something loses a step
const GRIP = 0.0015;           // m a step under which a point touching something doesn't slide at all
const DEEP = 0.012;            // m: pushed out of something further than this in a pass, the rest isn't speed
const SLEEP_V = 0.0016;        // m a step under which every point counts as still
const SLEEP_N = 36;            // steps that still before it sleeps
const LIFE = 8;                // seconds it may move at most (then it lies as it is)
const WAKE = 3;                // and again after a blow
const BRACE = 0.4;             // seconds the last of its strength holds its joints as they were
const VMAX = 20;               // m/s: no point goes faster
const THUD = 2.6;              // m/s down onto something: the trunk lands with a thud

// The trunk, moved as one; the limbs' tops in it; and the limbs, each [bone, the bone it points at
// (null: its own end), the limb it hangs from (null: the trunk), its joint], each after what it hangs from
const TRUNK = ['hips', 'spine', 'chest', 'shoulderL', 'shoulderR'];
const ROOTED = ['neck', 'upper_armL', 'upper_armR', 'thighL', 'thighR'];
const LIMBS = [
  ['neck', 'head', null, 'neck'], ['head', null, 'neck', 'head'],
  ['upper_armL', 'forearmL', null, 'shoulder'], ['forearmL', 'handL', 'upper_armL', 'elbow'], ['handL', null, 'forearmL', 'wrist'],
  ['upper_armR', 'forearmR', null, 'shoulder'], ['forearmR', 'handR', 'upper_armR', 'elbow'], ['handR', null, 'forearmR', 'wrist'],
  ['thighL', 'shinL', null, 'hip'], ['shinL', 'footL', 'thighL', 'knee'], ['footL', null, 'shinL', 'ankle'],
  ['thighR', 'shinR', null, 'hip'], ['shinR', 'footR', 'thighR', 'knee'], ['footR', null, 'shinR', 'ankle'],
];
// what each bone hangs from in the body (not always its parent in the rig: a villager's thighs hang from
// its Body bone and its feet from the root), for what a lost limb takes with it
const ANAT = { spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shoulderL: 'chest', shoulderR: 'chest',
  upper_armL: 'shoulderL', forearmL: 'upper_armL', handL: 'forearmL', upper_armR: 'shoulderR', forearmR: 'upper_armR', handR: 'forearmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR' };
// each point's ball (m across its middle, before the body's size) and weight, by the bone it tops (or ends: '+')
const BALL = { hips: [0.13, 6], spine: [0.12, 5], chest: [0.13, 6], neck: [0.06, 1.5], shoulder: [0.06, 2], upper_arm: [0.055, 2],
  thigh: [0.08, 4], head: [0.08, 1.5], 'head+': [0.1, 2.5], forearm: [0.045, 1.2], hand: [0.04, 0.7], 'hand+': [0.035, 0.4],
  shin: [0.06, 2.5], foot: [0.05, 1], 'foot+': [0.045, 0.6] };
// how near each of these joints stays to how it lay at death, from the bone above (cos of the angle)
const CONE = { neck: Math.cos(0.7), head: Math.cos(0.5), wrist: Math.cos(0.8), ankle: Math.cos(0.35) };
// the limbs' ends kept out of the trunk, and the legs out of each other
const OUT = ['forearm', 'hand', 'hand+', 'shin', 'foot', 'foot+', 'head', 'head+'];
const CORE = ['hips', 'spine', 'chest'];
const PAIRS = [['shinL', 'shinR'], ['footL', 'footR'], ['footL+', 'footR+'], ['shinL', 'footR'], ['shinR', 'footL']];
// how hard a killing blow of each kind throws the body (m/s at the point struck)
export const KICK = { blade: 2.3, blunt: 3.3, thorns: 1, fire: 3.4, lightning: 2.6, frost: 1.6, arcane: 3, missile: 2.6, void: 3.6, staff: 2.8, poison: 1.2 };

let awake = 0;   // (how many are falling: past six at once each takes fewer passes)

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _up = new THREE.Vector3(), _rt = new THREE.Vector3(), _fw = new THREE.Vector3(), _out = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _r0 = new THREE.Vector3(), _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3();
const AX = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

export class Ragdoll {
  /** z: the body (a Zombie, posed as it died). o: { blow: {point, dir, speed} (what killed it), v (how it
   * was moving, m/s), from (a ragdoll it's built again from, after a limb came off it) }. */
  constructor(z, o = {}) {
    this.z = z;
    z._caps = null;
    const caps = z.capsules();   // (and the whole body's matrices brought up to date)
    const cap = new Map();
    for (const c of caps) cap.set(c.bone.name, c);
    const lost = (n) => {
      for (let x = n; x && x !== 'hips'; x = ANAT[x]) if (z.lost.has(x)) return true;
      return n === 'hips' && z.lost.has('waist');
    };
    const have = (n) => cap.has(n) && !lost(n);
    const size = z.size || z.root.scale.x || 1;
    // ---------------------------------------------------------------- the points
    const keys = [], at = [], ball = [], mass = [], index = new Map();
    const point = (key, p, kind) => {
      if (index.has(key)) return index.get(key);
      const [r, w] = BALL[kind] || BALL[kind.replace(/[LR]/, '')] || [0.05, 1];
      index.set(key, keys.length);
      keys.push(key); at.push(p.x, p.y, p.z); ball.push(r * size * 0.9); mass.push(w);
      return keys.length - 1;
    };
    const kindOf = (n) => n.replace(/[LR](\+?)$/, '$1');
    this.cluster = [];
    for (const n of [...TRUNK, ...ROOTED]) if (have(n)) this.cluster.push(point(n, cap.get(n).a, kindOf(n)));
    if (this.cluster.length < 3) throw new Error('too little of it left to fall');
    const sticks = [];   // [i, j, length]
    const stick = (i, j) => { if (i != null && j != null && i !== j) sticks.push([i, j, 0]); };
    this.swing = [];
    const swingOf = new Map();
    for (const [n, aim, from, joint] of LIMBS) {
      if (!have(n) || (from && !swingOf.has(from))) continue;
      const c = cap.get(n);
      const o = point(n, c.a, kindOf(n));
      let a = null;
      if (!aim) {   // its own end: the far end of its hit shape
        if (c.b.distanceTo(c.a) > 0.03 * size) a = point(n + '+', c.b, kindOf(n) + '+');
      } else if (have(aim)) a = point(aim, cap.get(aim).a, kindOf(aim));
      else if (z.bones[aim]) a = point(aim, z.bones[aim].getWorldPosition(_a), kindOf(aim));   // (the stump's end)
      if (a == null) continue;
      stick(o, a);
      const s = { bone: z.bones[n], name: n, o, a, joint, parent: from ? swingOf.get(from) : -1, rooted: !from,
        side: n.endsWith('R') ? 1 : -1, dq: new THREE.Quaternion(), k: [] };
      swingOf.set(n, this.swing.length);
      this.swing.push(s);
    }
    // the wrists, ankles and the head held at their angle (the hand or foot to the elbow or knee)
    const pt = (k) => index.get(k);
    for (const s of 'LR') { stick(pt('forearm' + s), pt('hand' + s + '+')); stick(pt('shin' + s), pt('foot' + s + '+')); }
    stick(pt('neck'), pt('head+'));
    const n = this.n = keys.length;
    this.keys = keys;
    this.P = new Float32Array(at); this.Q = new Float32Array(at);   // (now, and a step ago)
    this.R = new Float32Array(ball);
    this.W = new Float32Array(mass.map((m) => 1 / m));
    // (a point of the trunk is moved by what pulls on it as the whole trunk would be: it is one stiff
    // piece. Weighed as a point of its own, every limb bent the trunk out of shape each step and the
    // trunk snapped back, and that went on for ever)
    const trunkW = 1 / this.cluster.reduce((t, i) => t + mass[i], 0);
    for (const i of this.cluster) this.W[i] = trunkW;
    this.M = new Float32Array(mass);
    this.V0 = new Float32Array(n);    // (each point's speed down as a step began: a landing's thud)
    this.touch = new Int8Array(n); this.norm = new Float32Array(n * 3);
    this.gy = new Float32Array(n);    // (the ground under each point, worked out once a step)
    const P = this.P;
    const dist = (i, j) => Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]);
    for (const s of sticks) s[2] = dist(s[0], s[1]);
    this.sticks = sticks.filter((s) => s[2] > 1e-4);
    // the trunk as it lay: its middle and each point about it
    this.c0 = this.centre(new THREE.Vector3());
    this.c = this.c0.clone();
    this.rest = this.cluster.map((i) => new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(this.c0));
    this.qR = new THREE.Quaternion();
    // its axes as it died: up its spine, out to its right, and which way it faces (from its bind
    // pose, in which every body faces its own +z: whether its left and right are as a body's are)
    const P3 = (k) => (index.has(k) ? new THREE.Vector3().fromArray(P, index.get(k) * 3) : null);
    const lo = P3('hips') || P3('spine'), hi = P3('neck') || P3('chest');
    this.up0 = hi.clone().sub(lo).normalize();
    const pair = [['upper_armR', 'upper_armL'], ['thighR', 'thighL'], ['shoulderR', 'shoulderL']].find(([r, l]) => index.has(r) && index.has(l));
    this.rt0 = pair ? P3(pair[0]).sub(P3(pair[1])) : new THREE.Vector3(1, 0, 0);
    this.rt0.addScaledVector(this.up0, -this.rt0.dot(this.up0)).normalize();
    this.conv = handedness(z);
    this.fw0 = new THREE.Vector3().crossVectors(this.up0, this.rt0).multiplyScalar(this.conv);
    // each limb: which way it pointed and how it was turned, and its joint's own frame
    for (const s of this.swing) {
      s.len = dist(s.o, s.a);
      s.aim0 = new THREE.Vector3().fromArray(P, s.a * 3).sub(_a.fromArray(P, s.o * 3)).normalize();
    }
    for (const s of this.swing) {
      const p = this.swing[s.parent];
      if (s.joint === 'elbow' && p.aim0.dot(s.aim0) < 0.978) s.axis0 = new THREE.Vector3().crossVectors(p.aim0, s.aim0).normalize();   // (bent at death: it bends on that way)
      if (s.joint === 'knee') {   // (the knee's hinge: across the hips, square to the thigh)
        const ax = this.rt0.clone().addScaledVector(p.aim0, -this.rt0.dot(p.aim0));
        if (ax.lengthSq() > 1e-4) s.axis0 = ax.normalize();
      }
    }
    this.measure = true; this.limits(0); this.measure = false;   // (no joint held tighter than it lay)
    // the limbs kept out of the trunk, and the legs out of each other: [i, j, nearest]
    this.apart = [];
    const keep = (i, j) => { if (i == null || j == null) return; const d = Math.min(dist(i, j) * 0.92, this.R[i] + this.R[j]); if (d > 0.02) this.apart.push([i, j, d]); };
    for (const k of keys) {
      if (!OUT.includes(kindOf(k))) continue;
      for (const c of CORE) if (index.has(c) && !(k === 'head' && c === 'chest')) keep(index.get(k), index.get(c));
    }
    for (const [a, b] of PAIRS) keep(pt(a), pt(b));
    // the skeleton, top down: each bone posed by the trunk, by its own limb, or carried as it was
    this.bones = [];
    const depth = (b) => { let d = 0; for (let p = b.parent; p?.isBone; p = p.parent) d++; return d; };
    const sw = new Map(this.swing.map((s) => [s.bone, s]));
    const trunk = new Set(TRUNK.filter(have).map((k) => z.bones[k]));
    for (const b of [...z.skel.bones].sort((x, y) => depth(x) - depth(y))) {
      const top = !b.parent?.isBone;
      const role = sw.has(b) ? 2 : trunk.has(b) || top ? 1 : 0;   // (2: its limb; 1: the trunk's turn; 0: carried)
      // (as it lay, whole: a rig may hang its bones under a mirrored or scaled bone, so they're turned
      // as matrices, never by their quaternions alone)
      this.bones.push({ b, role, s: sw.get(b), w0: b.matrixWorld.clone(), p0: new THREE.Vector3().setFromMatrixPosition(b.matrixWorld), m: new THREE.Matrix4(), pi: -1 });
    }
    const slot = new Map(this.bones.map((e, i) => [e.b, i]));
    for (const e of this.bones) if (e.b.parent?.isBone) e.pi = slot.get(e.b.parent);
    this.tops = [...new Set(this.bones.filter((e) => e.pi < 0).map((e) => e.b.parent).filter(Boolean))];
    // ---------------------------------------------------------------- how it starts
    this.t = o.from ? o.from.t : 0;
    this.acc = 0; this.still = 0; this.thuds = o.from ? o.from.thuds : 0; this.thudT = -1;
    this.life = o.from ? Math.max(o.from.life, this.t + 0.5) : LIFE;
    this.awake = false;
    this.wake();
    // a pose that dips into the ground (one crawling lies on it; toes go through it in a stride): the
    // whole body lifted clear at once, with no speed for it (pushed out a step at a time, it leapt)
    if (!o.from) {
      const ph = z.owner.physics;
      let lift = 0;
      for (let i = 0; i < n; i++) {
        const f = ph.floorAt(P[i * 3], P[i * 3 + 2], P[i * 3 + 1], 0.02, 0);
        if (f > -Infinity) lift = Math.max(lift, f + this.R[i] - P[i * 3 + 1]);
      }
      lift = Math.min(lift, 0.5);
      if (lift > 0) for (let i = 0; i < n; i++) { P[i * 3 + 1] += lift; this.Q[i * 3 + 1] += lift; }
      this.c0.y += lift; this.c.y += lift;
    }
    if (o.from) {   // (built again: each point that was there keeps its speed)
      const f = o.from;
      for (let i = 0; i < n; i++) {
        const j = f.keys.indexOf(keys[i]);
        if (j < 0) continue;
        for (let k = 0; k < 3; k++) this.Q[i * 3 + k] = P[i * 3 + k] - (f.P[j * 3 + k] - f.Q[j * 3 + k]);
      }
      if (!f.awake) this.sleep();
    } else {
      const v = o.v;
      if (v) {
        const k = Math.min(1, 6 / Math.max(1e-3, v.length())) * 0.85;
        this.push(v.x * k, v.y * k * 0.5, v.z * k);
      }
      if (o.blow) this.kick(o.blow.point, o.blow.dir, o.blow.speed);
    }
  }

  /** The trunk's middle (weighted), into out. */
  centre(out) {
    out.set(0, 0, 0);
    let w = 0;
    for (const i of this.cluster) { const m = this.M[i]; out.x += this.P[i * 3] * m; out.y += this.P[i * 3 + 1] * m; out.z += this.P[i * 3 + 2] * m; w += m; }
    return out.divideScalar(w);
  }

  wake(t = 0) {
    if (this.z.sinking) return;
    if (t) this.life = Math.max(this.life, this.t + t);
    this.still = 0;
    if (!this.awake) { this.awake = true; awake++; }
  }

  sleep() {
    if (this.awake) { this.awake = false; awake--; }
    this.Q.set(this.P);
  }

  /** Thrown from a blow at `point` along `dir` (unit), `speed` m/s where it lands, less further off. */
  kick(point, dir, speed) {
    if (!(speed > 0) || this.z.sinking) return;
    this.wake(WAKE);
    const P = this.P, Q = this.Q, sg = 0.32 * (this.z.size || 1);
    for (let i = 0; i < this.n; i++) {
      const dx = P[i * 3] - point.x, dy = P[i * 3 + 1] - point.y, dz = P[i * 3 + 2] - point.z;
      const k = speed * (0.3 + 0.7 * Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * sg * sg))) * H;
      Q[i * 3] -= dir.x * k; Q[i * 3 + 1] -= (dir.y + 0.12) * k; Q[i * 3 + 2] -= dir.z * k;
    }
  }

  /** The whole body shoved (m/s). */
  push(x, y, z) {
    if (this.z.sinking) return;
    this.wake(WAKE);
    for (let i = 0; i < this.n; i++) { this.Q[i * 3] -= x * H; this.Q[i * 3 + 1] -= y * H; this.Q[i * 3 + 2] -= z * H; }
  }

  /** The frame's time: as many fixed steps as it holds, then the skeleton posed from the points. */
  update(dt) {
    if (!this.awake) return;
    this.acc = Math.min(this.acc + dt, STEPS * H);
    let n = 0;
    while (this.acc >= H) { this.acc -= H; this.step(); n++; if (!this.awake) break; }
    if (n) this.pose();
  }

  step() {
    const P = this.P, Q = this.Q, n = this.n;
    this.t += H;
    // on as it was going, and down
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k, p = P[j];
        let v = (p - Q[j]) * DRAG;
        if (k === 1) { v -= G * H * H; this.V0[i] = v / H; }
        Q[j] = p; P[j] = p + Math.max(-VMAX * H, Math.min(VMAX * H, v));
      }
    }
    this.near();
    const passes = awake > 6 ? Math.min(ITER, 4) : ITER;
    this.touch.fill(0);
    for (let it = 0; it < passes; it++) {
      this.links();
      if (it % 2 === 0 || it === passes - 1) this.limits(it);
      this.apartAll();
      this.match(true);
      this.world();
    }
    this.match(false);
    // what touches something skids and stops; the trunk landing hard thuds
    let most = 0;
    for (let i = 0; i < n; i++) {
      if (this.touch[i]) {
        const nx = this.norm[i * 3], ny = this.norm[i * 3 + 1], nz = this.norm[i * 3 + 2];
        const vx = P[i * 3] - Q[i * 3], vy = P[i * 3 + 1] - Q[i * 3 + 1], vz = P[i * 3 + 2] - Q[i * 3 + 2];
        const vn = vx * nx + vy * ny + vz * nz;
        const tx = vx - nx * vn, ty = vy - ny * vn, tz = vz - nz * vn;
        const kn = Math.max(0, vn), kt = Math.hypot(tx, ty, tz) < GRIP ? 0 : 1 - FRICTION;   // (barely sliding: it holds)
        Q[i * 3] = P[i * 3] - (tx * kt + nx * kn); Q[i * 3 + 1] = P[i * 3 + 1] - (ty * kt + ny * kn); Q[i * 3 + 2] = P[i * 3 + 2] - (tz * kt + nz * kn);
        if (this.V0[i] < -THUD && ny > 0.5 && this.cluster.includes(i)) this.thud(i, -this.V0[i]);
      }
      most = Math.max(most, Math.abs(P[i * 3] - Q[i * 3]), Math.abs(P[i * 3 + 1] - Q[i * 3 + 1]), Math.abs(P[i * 3 + 2] - Q[i * 3 + 2]));
    }
    if (!Number.isFinite(most)) throw new Error('the ragdoll came apart');
    this.still = most < SLEEP_V ? this.still + 1 : 0;
    if (this.still >= SLEEP_N || this.t > this.life) this.sleep();
  }

  /** It lands: a thud, and blood where it hit (a few times a fall at most). */
  thud(i, speed) {
    if (this.thuds >= 3 || this.t - this.thudT < 0.3) return;
    this.thuds++; this.thudT = this.t;
    const o = this.z.owner, x = this.P[i * 3], y = this.P[i * 3 + 1] - this.R[i], z = this.P[i * 3 + 2];
    o.sound?.('thud', _a.set(x, y, z), speed > 5);
    o.gore?.splat(x, o.floorY ? o.floorY(x, z, y + 0.3) : y, z, 0.4 + Math.min(0.6, speed * 0.08), 0.1);
  }

  /** The trunk held as one: its best turn (this.qR) and middle (this.c) from how it lay, and with
   * `apply` its points put back there. (The turn: a few steps of Müller et al.'s extraction, from the
   * last one.) */
  match(apply) {
    const P = this.P, c = this.centre(this.c);
    // A = Σ m (p - c) restᵀ, by columns
    _r0.set(0, 0, 0); _r1.set(0, 0, 0); _r2.set(0, 0, 0);
    this.cluster.forEach((i, k) => {
      const m = this.M[i], r = this.rest[k];
      const x = (P[i * 3] - c.x) * m, y = (P[i * 3 + 1] - c.y) * m, z = (P[i * 3 + 2] - c.z) * m;
      _r0.x += x * r.x; _r0.y += y * r.x; _r0.z += z * r.x;
      _r1.x += x * r.y; _r1.y += y * r.y; _r1.z += z * r.y;
      _r2.x += x * r.z; _r2.y += y * r.z; _r2.z += z * r.z;
    });
    const A = [_r0, _r1, _r2], q = this.qR;
    for (let it = 0; it < 6; it++) {
      _e.set(0, 0, 0);
      let den = 0;
      for (let k = 0; k < 3; k++) { _d.copy(AX[k]).applyQuaternion(q); _e.add(_c.crossVectors(_d, A[k])); den += _d.dot(A[k]); }
      _e.multiplyScalar(1 / (Math.abs(den) + 1e-9));
      const w = _e.length();
      if (w < 1e-9) break;
      q.premultiply(_q.setFromAxisAngle(_e.divideScalar(w), w)).normalize();
    }
    if (!apply) return;
    this.cluster.forEach((i, k) => {
      _a.copy(this.rest[k]).applyQuaternion(q).add(c);
      P[i * 3] = _a.x; P[i * 3 + 1] = _a.y; P[i * 3 + 2] = _a.z;
    });
  }

  /** Every stick back to its length (each end moving by its share of the weight). */
  links() {
    const P = this.P, W = this.W;
    for (const [i, j, l] of this.sticks) {
      const dx = P[j * 3] - P[i * 3], dy = P[j * 3 + 1] - P[i * 3 + 1], dz = P[j * 3 + 2] - P[i * 3 + 2];
      const d = Math.hypot(dx, dy, dz);
      if (d < 1e-6) continue;
      const k = (d - l) / (d * (W[i] + W[j])), ki = k * W[i], kj = k * W[j];
      P[i * 3] += dx * ki; P[i * 3 + 1] += dy * ki; P[i * 3 + 2] += dz * ki;
      P[j * 3] -= dx * kj; P[j * 3 + 1] -= dy * kj; P[j * 3 + 2] -= dz * kj;
    }
  }

  /** dot(d, n) held at most k (the limit j of joint s): measured at death, never tighter than it lay. */
  cap(d, n, k, s, j) {
    const v = d.dot(n);
    if (this.measure) { s.k[j] = Math.max(k, v + 0.02); return; }
    if (v > s.k[j]) d.addScaledVector(n, s.k[j] - v);
  }

  /** The joints: each limb, top down, turned back within its reach (its end point moved), and how far
   * each has turned from how it lay worked out on the way (s.dq: what the bones below are carried by). */
  limits(it) {
    const P = this.P, qR = this.qR;
    _up.copy(this.up0).applyQuaternion(qR); _rt.copy(this.rt0).applyQuaternion(qR); _fw.copy(this.fw0).applyQuaternion(qR);
    const brace = !this.measure && it === 0 && this.t < BRACE ? 0.3 * (1 - this.t / BRACE) ** 2 : 0;
    for (const s of this.swing) {
      const pq = s.parent < 0 ? qR : this.swing[s.parent].dq;
      const o = _a.fromArray(P, s.o * 3), d = _b.fromArray(P, s.a * 3).sub(o);
      const len = d.length();
      if (len < 1e-5) { s.dq.copy(pq); continue; }
      d.divideScalar(len);
      const was = _c.copy(s.aim0).applyQuaternion(pq);   // (where it would point had it not moved at its joint)
      const J = s.joint;
      if (CONE[J]) this.cap(d, _d.copy(was).negate(), -CONE[J], s, 0);
      else if (J === 'shoulder' || J === 'hip') {
        _out.copy(_rt).multiplyScalar(s.side);
        if (J === 'shoulder') {   // (not in through its own chest, nor far behind it)
          this.cap(d, _d.copy(_out).negate(), 0.55, s, 0); this.cap(d, _d.copy(_fw).negate(), 0.85, s, 1);
        } else {                  // (a leg goes far forward, a little back, out a way and in hardly at all)
          this.cap(d, _d.copy(_fw).negate(), 0.6, s, 0); this.cap(d, _up, 0.5, s, 1); this.cap(d, _out, 0.8, s, 2); this.cap(d, _d.copy(_out).negate(), 0.4, s, 3);
        }
      } else if (J === 'knee' || J === 'elbow') {
        const p = this.swing[s.parent], u = _d.fromArray(P, p.a * 3).sub(_e.fromArray(P, p.o * 3)).normalize();
        if (s.axis0) {
          // the hinge's axis, carried by the bone above; its bend towards the back of the thigh (or
          // towards the side the elbow was bent to)
          const ax = _e.copy(s.axis0).applyQuaternion(pq);
          const bend = _out.crossVectors(J === 'knee' ? u : ax, J === 'knee' ? ax : u).normalize();
          if (J === 'knee') bend.multiplyScalar(this.conv);
          this.cap(d, ax, J === 'knee' ? 0.3 : 0.35, s, 0); this.cap(d, ax.negate(), J === 'knee' ? 0.3 : 0.35, s, 1);
          this.cap(d, bend.negate(), J === 'knee' ? 0.09 : 0.1, s, 2);
        }
        this.cap(d, u.negate(), J === 'knee' ? 0.866 : 0.85, s, 3);   // (and never folded right back)
      }
      if (brace) d.lerp(was, brace);
      d.normalize();
      if (!this.measure) {   // (turned only, its length left to its stick; both ends moved by their share, so it pushes back on what it hangs from)
        const a = s.a * 3, oi = s.o * 3, W = this.W, wa = W[s.a] / (W[s.a] + W[s.o]), wo = 1 - wa;
        const dx = o.x + d.x * len - P[a], dy = o.y + d.y * len - P[a + 1], dz = o.z + d.z * len - P[a + 2];
        P[a] += dx * wa; P[a + 1] += dy * wa; P[a + 2] += dz * wa;
        P[oi] -= dx * wo; P[oi + 1] -= dy * wo; P[oi + 2] -= dz * wo;
      }
      s.dq.setFromUnitVectors(was, d).multiply(pq);
    }
  }

  /** The limbs' ends out of the trunk, and the legs out of each other. */
  apartAll() {
    const P = this.P, W = this.W;
    for (const [i, j, l] of this.apart) {
      const dx = P[j * 3] - P[i * 3], dy = P[j * 3 + 1] - P[i * 3 + 1], dz = P[j * 3 + 2] - P[i * 3 + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= l * l || d2 < 1e-12) continue;
      const d = Math.sqrt(d2), k = (d - l) / (d * (W[i] + W[j])), ki = k * W[i], kj = k * W[j];
      P[i * 3] += dx * ki; P[i * 3 + 1] += dy * ki; P[i * 3 + 2] += dz * ki;
      P[j * 3] -= dx * kj; P[j * 3 + 1] -= dy * kj; P[j * 3 + 2] -= dz * kj;
    }
  }

  /** What of the world it might touch this step: the boxes and walls about it, and the ground (and any
   * moving floor) under each point. */
  near() {
    const P = this.P, n = this.n, ph = this.z.owner.physics;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, P[i * 3]); x1 = Math.max(x1, P[i * 3]);
      y0 = Math.min(y0, P[i * 3 + 1]); y1 = Math.max(y1, P[i * 3 + 1]);
      z0 = Math.min(z0, P[i * 3 + 2]); z1 = Math.max(z1, P[i * 3 + 2]);
    }
    const pad = 0.4;
    this.boxes = [];
    for (const b of ph.near(x0 - pad, z0 - pad, x1 + pad, z1 + pad)) if (b.max[1] > y0 - pad && b.min[1] < y1 + pad) this.boxes.push(b);
    // under the land (a cave, a cellar, the Undershrine: their floors are boxes) or on it, where the
    // ground is a floor nothing sinks through (as it is for you: player.js); one that falls down a
    // stairwell's hole is under it from then
    if (this.under == null) this.under = !!ph.belowGround?.some((inside) => inside(this.c)) || (ph.hasGround(this.c.x, this.c.z) && this.c.y < ph.groundAt(this.c.x, this.c.z) - 1);
    else if (!this.under && ph.hasGround(this.c.x, this.c.z) && this.c.y < ph.groundAt(this.c.x, this.c.z) - 1) this.under = true;
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1] - this.R[i], z = P[i * 3 + 2];
      let g = -Infinity;
      if (ph.hasGround(x, z)) { const h = ph.groundAt(x, z); if (!this.under || h <= y + 0.5) g = h; }
      for (const d of ph.dynamic) {
        if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) continue;
        const f = d.floorAt(x, z, y, 0.05, 0.4);
        if (f > g && f <= y + 0.4) g = f;
      }
      this.gy[i] = g;
    }
  }

  /** Every point out of whatever it's in. */
  world() {
    const P = this.P;
    for (let i = 0; i < this.n; i++) {
      const r = this.R[i];
      let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      if (y - r < this.gy[i]) { const dy = this.gy[i] + r - y; y += dy; this.deep(i, 0, dy, 0, dy); this.contact(i, 0, 1, 0); }
      for (const b of this.boxes) {
        let lx, ly = y, lz, x0, x1, z0, z1;
        if (b.seg) {   // (a wall at an angle: in its own frame, along it and across it)
          const mx = (b.ax + b.bx) / 2, mz = (b.az + b.bz) / 2;
          lx = (x - mx) * b.ux + (z - mz) * b.uz; lz = (x - mx) * -b.uz + (z - mz) * b.ux;
          x0 = -b.len / 2; x1 = b.len / 2; z0 = -b.half; z1 = b.half;
        } else { lx = x; lz = z; x0 = b.min[0]; x1 = b.max[0]; z0 = b.min[2]; z1 = b.max[2]; }
        const y0 = b.min[1], y1 = b.max[1];
        const cx = Math.max(x0, Math.min(lx, x1)), cy = Math.max(y0, Math.min(ly, y1)), cz = Math.max(z0, Math.min(lz, z1));
        let dx = lx - cx, dy = ly - cy, dz = lz - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2), k = (r - d) / d;
          dx *= k; dy *= k; dz *= k;
        } else {   // (its middle inside: out the nearest face, the top a little sooner than the rest)
          const pens = [lx - x0, x1 - lx, ly - y0, (y1 - ly) * 0.7, lz - z0, z1 - lz];
          let m = 0;
          for (let k = 1; k < 6; k++) if (pens[k] < pens[m]) m = k;
          dx = dy = dz = 0;
          if (m === 0) dx = x0 - r - lx; else if (m === 1) dx = x1 + r - lx;
          else if (m === 2) dy = y0 - r - ly; else if (m === 3) dy = y1 + r - ly;
          else if (m === 4) dz = z0 - r - lz; else dz = z1 + r - lz;
        }
        if (b.seg) { const wx = dx * b.ux - dz * b.uz, wz = dx * b.uz + dz * b.ux; dx = wx; dz = wz; }
        x += dx; y += dy; z += dz;
        const l = Math.hypot(dx, dy, dz) || 1;
        this.deep(i, dx, dy, dz, l);
        this.contact(i, dx / l, dy / l, dz / l);
      }
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    }
  }

  /** Pushed out by (dx, dy, dz) (l long): past DEEP, the step before moves with it, so being found
   * deep inside something (a wall it was killed against, a pose through the floor) doesn't fling it. */
  deep(i, dx, dy, dz, l) {
    if (l <= DEEP) return;
    const k = 1 - DEEP / l, Q = this.Q;
    Q[i * 3] += dx * k; Q[i * 3 + 1] += dy * k; Q[i * 3 + 2] += dz * k;
  }

  contact(i, nx, ny, nz) {
    this.touch[i] = 1;
    this.norm[i * 3] = nx; this.norm[i * 3 + 1] = ny; this.norm[i * 3 + 2] = nz;
  }

  /** The skeleton from the points: the body put where its trunk lies, then every bone, top down. */
  pose() {
    const z = this.z, P = this.P;
    // the deltas once more from where the points ended (each limb from how it lay to where it points)
    for (const s of this.swing) {
      const pq = s.parent < 0 ? this.qR : this.swing[s.parent].dq;
      _a.fromArray(P, s.a * 3).sub(_b.fromArray(P, s.o * 3));
      if (_a.lengthSq() < 1e-10) { s.dq.copy(pq); continue; }
      s.dq.setFromUnitVectors(_c.copy(s.aim0).applyQuaternion(pq), _a.normalize()).multiply(pq);
    }
    // the body's place: under the middle of its trunk, on whatever it lies on
    let low = Infinity;
    for (let i = 0; i < this.n; i++) low = Math.min(low, P[i * 3 + 1] - this.R[i]);
    z.pos.set(this.c.x, low, this.c.z);
    z.sync();
    for (const t of this.tops) t.updateWorldMatrix(true, false);
    const qR = this.qR, c = this.c, c0 = this.c0;
    for (const e of this.bones) {
      const b = e.b;
      const pm = e.pi < 0 ? b.parent.matrixWorld : this.bones[e.pi].m;
      if (e.role === 0) {   // carried along as it was
        b.updateMatrix();
        e.m.multiplyMatrices(pm, b.matrix);
        continue;
      }
      // as it lay, turned about its own top by how its limb (or the trunk) has turned, and moved to
      // where that top is now: x -> turn (x - p0) + top
      let turn;
      if (e.role === 2 && !e.s.rooted) { turn = e.s.dq; _a.fromArray(P, e.s.o * 3); }
      else { turn = e.role === 2 ? e.s.dq : qR; _a.copy(e.p0).sub(c0).applyQuaternion(qR).add(c); }
      _m.makeRotationFromQuaternion(turn);
      _b.copy(e.p0).applyQuaternion(turn);
      _m.setPosition(_a.sub(_b));
      e.m.multiplyMatrices(_m, e.w0);
      // and in its parent's frame
      _m2.copy(pm).invert().multiply(e.m).decompose(b.position, b.quaternion, b.scale);
    }
    for (const e of this.bones) e.b.matrixWorld.copy(e.m);
    z._caps = null;
  }

  /** A limb gone from it as it lies: built again without it, every point keeping its speed. */
  rebuild() {
    const z = this.z;
    try {
      const r = new Ragdoll(z, { from: this });
      this.drop();
      return r;
    } catch { return this; }   // (too little of it left: it lies as it is)
  }

  /** Done with (the body taken away, or built again). */
  drop() { if (this.awake) { this.awake = false; awake--; } }
}

/** Whether a body's right is to the right of its spine as it faces (+1) or the rig's names have them
 * the other way round (-1): from its bind pose, in which every body faces +z in its own frame. */
function handedness(z) {
  const m = z.mesh, inv = _m2.copy(z.root.matrixWorld).invert().multiply(m.matrixWorld);
  const at = (n) => {
    const b = z.bones[n];
    if (!b) return null;
    _m.copy(z.skel.boneInverses[z.skel.bones.indexOf(b)]).invert().premultiply(z.bindInv);
    return new THREE.Vector3().setFromMatrixPosition(_m).applyMatrix4(inv);
  };
  const lo = at('hips'), hi = at('neck') || at('chest');
  const pair = [['upper_armR', 'upper_armL'], ['thighR', 'thighL']].find(([r, l]) => z.bones[r] && z.bones[l]);
  if (!lo || !hi || !pair) return 1;
  const up = hi.sub(lo), rt = at(pair[0]).sub(at(pair[1]));
  const f = new THREE.Vector3().crossVectors(up, rt).z;
  return f < 0 ? -1 : 1;
}
