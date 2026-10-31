// Quaternius' Universal Animation Library 2 (CC0) on the Sworn: the mannequin's clips
// (templates/models/creatures/sworn/ual2.glb, cut down by tools/creatures/sworn_ual/trim.py) carried
// onto a sworn body bone for bone. Both skeletons stand in a T-pose facing +z, and the mannequin's
// bones match the villager's one to one (pelvis, three spine bones, neck, head; clavicle, upper and
// lower arm, hand, three joints of each finger; thigh, calf, foot), so each of the body's bones takes
// the mannequin bone's turn away from that pose, in the world; the hips also take the pelvis's rise,
// fall and sway (scaled to the leg), and where the mannequin's feet are on the ground, the body's are.
//
// The library has no plain walk, run or death, so some clips are put together (RECIPES): the walk is
// the mannequin's carrying walk below the waist under the shield guard above it; the run is that walk
// twice as quick, its strides lengthened and the body pitched into them; the shield bash and the
// charge's impact are the sword lunge's and the shield dash's legs driving the guard forward; the
// death is the knockback that throws it flat on its back.
import * as THREE from 'three';

export const UAL_URL = 'templates/models/creatures/sworn/ual2.glb';
const FPS = 30;

// the mannequin's bones under the Sworn's names (sworn.js renames the villager's to the zombie body's;
// the villager's first finger joint is in the palm, so the mannequin's knuckle is its second)
export const UAL_BONES = { pelvis: 'hips', spine_01: 'spine', spine_02: 'Torso', spine_03: 'chest', neck_01: 'neck', Head: 'head' };
for (const [s, S] of [['l', 'L'], ['r', 'R']]) {
  Object.assign(UAL_BONES, { [`clavicle_${s}`]: `shoulder${S}`, [`upperarm_${s}`]: `upper_arm${S}`, [`lowerarm_${s}`]: `forearm${S}`, [`hand_${s}`]: `hand${S}`,
    [`thigh_${s}`]: `thigh${S}`, [`calf_${s}`]: `shin${S}`, [`foot_${s}`]: `foot${S}` });
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (let i = 1; i <= 3; i++) UAL_BONES[`${f.toLowerCase()}_0${i}_${s}`] = `${f}${i + 1}${S}`;
  for (let i = 1; i <= 3; i++) UAL_BONES[`thumb_0${i}_${s}`] = `Thumb${i}${S}`;
}
// what's below the waist (a recipe's `lower`), the rest being above it
const LOWER = new Set(['root', 'pelvis', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r']);

/** What each of the body's clips is made of. A recipe is a clip of the library (`src`, from `from` to
 * `to` seconds, played at `speed`), or a sequence of them (`seq`), with optionally another clip above
 * the waist (`upper`, stretched to fit if it loops, or held at its time `at`), standing as it stands
 * in its own clip or (`lean`) leaning as this one's hips lean. `stride`: the thighs' and the knees'
 * swing about their middle made that much bigger; `pitch`: the whole body tipped forward (radians);
 * `turn`: bones turned further, in the world, each [bone, axis, radians] (after the bones above it);
 * `guard`: [in, out], the parts of the clip over which the shield arm comes out of the guard (the
 * library's moves start and end with it hanging) and goes back into it, so it joins the guard.
 * `hit`: the frame (at 30 a second, of the finished clip) a blow lands, or the frames, if it lands
 * more than one. `plant`: the feet kept on the ground where the mannequin's are; `ground`: the body
 * kept as far off the ground as the mannequin is (it lies on its back in plate, so it lies higher).
 * `gait`: measure how fast it goes over the ground (its feet don't slide played at that pace). */
export const RECIPES = {
  idle: { src: 'Idle_Shield_Loop', plant: true },
  walk: { src: 'Walk_Carry_Loop', upper: 'Idle_Shield_Loop', stride: [1.3, 1.15], plant: true, gait: true },
  run: { src: 'Walk_Carry_Loop', upper: 'Idle_Shield_Loop', speed: 2, stride: [1.9, 1.6], pitch: 0.3, plant: true, gait: true },
  attack1: { src: 'Sword_Regular_A', plant: true, hit: 8, guard: [0.45, 0] },
  attack1_rec: { src: 'Sword_Regular_A_Rec', plant: true, guard: [0, 0.6] },
  attack2: { src: 'Sword_Regular_B', plant: true, hit: 8 },
  attack2_rec: { src: 'Sword_Regular_B_Rec', plant: true, guard: [0, 0.6] },
  attack3: { src: 'Sword_Regular_C', plant: true, hit: 20, guard: [0, 0.4] },
  lunge: { src: 'Sword_Dash', plant: true, hit: 10, guard: [0.15, 0.45] },
  bash: { src: 'Shield_Dash', plant: true, hit: 3, guard: [0, 0.35] },     // (the shield arm held in the guard: foes.js shieldArm)
  parry: { src: 'Sword_Block', plant: true, guard: [0.3, 0.35] },
  // shield up: the guard braced, knees bent, the body hunched in behind the shield raised to the eyes
  block: { src: 'Idle_Shield_Loop', plant: true, turn: [
    ['thigh_l', [1, 0, 0], -0.3], ['calf_l', [1, 0, 0], 0.6], ['foot_l', [1, 0, 0], -0.3],
    ['thigh_r', [1, 0, 0], -0.3], ['calf_r', [1, 0, 0], 0.6], ['foot_r', [1, 0, 0], -0.3],
    ['spine_02', [1, 0, 0], 0.22], ['upperarm_l', [1, 0, 0], -0.95], ['lowerarm_l', [1, 0, 0], 0.95], ['Head', [1, 0, 0], -0.2]] },
  guardbreak: { src: 'Idle_Shield_Break', plant: true },
  hit: { src: 'Idle_Shield_Break', to: 0.6, plant: true },
  knockdown: { src: 'Hit_Knockback', ground: true },
  getup: { src: 'LayToIdle', ground: true, guard: [0, 0.35] },
  death: { src: 'Hit_Knockback', ground: true },
  jump: { seq: [{ src: 'NinjaJump_Start', to: 0.45 }, { src: 'NinjaJump_Land', from: 0.15, to: 1.0 }], ground: true },
  heavy: { src: 'Sword_Heavy_Combo', plant: true, hit: [15, 35, 54, 79], guard: [0.08, 0.15] },
};
const STRIDE = { thigh_l: 0, thigh_r: 0, calf_l: 1, calf_r: 1 };
const GUARD = ['clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l'];   // the shield arm

const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _m = new THREE.Matrix4();

/** A bone's world rotation and position at bind (from its inverse bind matrix). */
function bindOf(skel, bone) {
  _m.copy(skel.boneInverses[skel.bones.indexOf(bone)]).invert();
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  _m.decompose(p, q, s);
  return { q, p };
}

/** The villager's thighs hang from its Body bone and its feet from the root (as an IK rig has them),
 * not from the hips and the shins, so a clip that moves the hips or bends a knee leaves them where
 * they were. These are the joints to put back: each bone with the bone it should hang from and its
 * place in that bone's frame at bind. */
export function legJoints(skel) {
  const db = Object.fromEntries(skel.bones.map((b) => [b.name, b]));
  const bm = (b) => new THREE.Matrix4().copy(skel.boneInverses[skel.bones.indexOf(b)]).invert();
  const out = [];
  for (const [child, on] of [['thighL', 'hips'], ['thighR', 'hips'], ['footL', 'shinL'], ['footR', 'shinR']]) {
    const c = db[child], p = db[on];
    if (!c || !p || c.parent === p) continue;
    out.push({ bone: c, on: p, at: new THREE.Vector3().setFromMatrixPosition(bm(c)).applyMatrix4(bm(p).invert()) });
  }
  return out;
}

/** Put the joints back where they hang (thighs before feet, so a foot finds its knee moved). */
export function attach(joints) {
  for (const j of joints) {
    j.on.updateWorldMatrix(true, false);
    const w = _p.copy(j.at).applyMatrix4(j.on.matrixWorld);
    j.bone.parent.updateWorldMatrix(true, false);
    j.bone.position.copy(j.bone.parent.worldToLocal(w));
    j.bone.updateMatrixWorld(true);
  }
}

/** The library's source: its skeleton (a copy, so it can be posed freely), each bone's rest and
 * bind, and each clip's tracks as interpolants by bone. */
export function ualSource(ual) {
  let skel = null, mesh = null;
  ual.scene.traverse((o) => { if (o.isSkinnedMesh && !skel) { skel = o.skeleton; mesh = o; } });
  const bones = Object.fromEntries(skel.bones.map((b) => [b.name, b]));
  const rest = new Map(skel.bones.map((b) => [b, [b.position.clone(), b.quaternion.clone()]]));
  const bind = Object.fromEntries(skel.bones.map((b) => [b.name, bindOf(skel, b)]));
  const clips = {};
  for (const c of ual.animations) {
    const by = {};
    for (const t of c.tracks) {
      const i = t.name.lastIndexOf('.'), bone = t.name.slice(0, i), prop = t.name.slice(i + 1);
      if (!bones[bone] || (prop !== 'quaternion' && prop !== 'position')) continue;
      (by[bone] ||= {})[prop] = t.createInterpolant(prop === 'quaternion' ? new Float32Array(4) : new Float32Array(3));
    }
    clips[c.name] = { duration: c.duration, by };
  }
  return { skel, bones, rest, bind, clips, mesh, root: skel.bones[0] };
}

/** The lowest point of a skinned mesh as it's posed (a spread of ~1500 of its vertices, in the
 * world), its bones' world matrices up to date. */
function lowest(mesh) {
  const n = mesh.geometry.attributes.position.count, step = Math.max(1, Math.floor(n / 1500));
  let y = Infinity;
  for (let i = 0; i < n; i += step) y = Math.min(y, mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld).y);
  return y;
}
const _v = new THREE.Vector3();

/** How long recipe r runs. */
function length(src, r) {
  if (r.seq) return r.seq.reduce((s, x) => s + length(src, x), 0);
  const c = src.clips[r.src];
  return ((r.to ?? c.duration) - (r.from ?? 0)) / (r.speed ?? 1);
}

/** Pose the library's skeleton as recipe r has it at time t (bones not in a clip stay at rest). */
function pose(src, r, t) {
  if (r.seq) {
    for (const x of r.seq) {
      const n = length(src, x);
      if (t <= n || x === r.seq[r.seq.length - 1]) return pose(src, x, Math.min(t, n));
      t -= n;
    }
  }
  const c = src.clips[r.src], tt = Math.min(c.duration, (r.from ?? 0) + t * (r.speed ?? 1));
  let spine = null;
  const upper = new Map();
  if (r.upper) {
    // above the waist, the other clip: unless it leans with this one's hips, the spine is set to
    // stand as it stands in its own clip (the carrying walk leans back under its load)
    const u = src.clips[r.upper], n = length(src, r);
    const tu = r.at ?? (u.duration * (n > 0 ? t / n : 0));      // (a loop stretched over this one, so both come round together)
    apply(src, u, tu);
    src.root.parent.updateMatrixWorld(true);
    spine = src.bones.spine_01.getWorldQuaternion(new THREE.Quaternion());
    for (const name of Object.keys(u.by)) if (!LOWER.has(name)) upper.set(name, src.bones[name].quaternion.clone());
    for (const [b, [p, rq]] of src.rest) { b.position.copy(p); b.quaternion.copy(rq); }
  }
  apply(src, c, tt);
  if (r.stride) stretch(src, c, r.stride);
  for (const [name, q] of upper) src.bones[name].quaternion.copy(q);
  if (spine && !r.lean) {
    if (r.pitch) spine.premultiply(_q.setFromAxisAngle(_x, r.pitch));
    src.root.parent.updateMatrixWorld(true);
    const s = src.bones.spine_01;
    s.quaternion.copy(s.parent.getWorldQuaternion(_q).invert().multiply(spine));
  }
  if (r.guard) {     // the shield arm eased out of the guard at the start, back into it at the end
    const n = length(src, r), [gi, go] = r.guard;
    const w = Math.min(1, Math.max(0, gi ? 1 - t / (gi * n) : 0, go ? (t - (1 - go) * n) / (go * n) : 0));
    if (w > 0) {
      const ease = w * w * (3 - 2 * w), g = src.clips.Idle_Shield_Loop;
      for (const name of GUARD) src.bones[name].quaternion.slerp(_q.fromArray(g.by[name].quaternion.evaluate(1.0)), ease);
    }
  }
  for (const [name, axis, a] of r.turn || []) {
    src.root.parent.updateMatrixWorld(true);
    const b = src.bones[name], w = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(_q.setFromAxisAngle(_p.fromArray(axis), a));
    b.quaternion.copy(b.parent.getWorldQuaternion(_q).invert().multiply(w));
  }
}
const _x = new THREE.Vector3(1, 0, 0);

/** Clip c's pose at time t on the library's skeleton. */
function apply(src, c, t) {
  for (const [name, it] of Object.entries(c.by)) {
    const b = src.bones[name];
    if (it.quaternion) b.quaternion.fromArray(it.quaternion.evaluate(t));
    if (it.position) b.position.fromArray(it.position.evaluate(t));
  }
}

/** Lengthen a gait's strides: each thigh's and knee's turn away from its middle over the clip (the
 * average of its turns) made k times as big. */
function stretch(src, c, k) {
  c.mean ||= {};
  for (const [name, i] of Object.entries(STRIDE)) {
    const it = c.by[name]?.quaternion;
    if (!it) continue;
    if (!c.mean[name]) {          // (once per clip)
      const m = new THREE.Vector4(), q = new THREE.Quaternion();
      for (let f = 0; f <= Math.round(c.duration * FPS); f++) {
        q.fromArray(it.evaluate(f / FPS));
        const s = m.x * q.x + m.y * q.y + m.z * q.z + m.w * q.w < 0 ? -1 : 1;
        m.x += q.x * s; m.y += q.y * s; m.z += q.z * s; m.w += q.w * s;
      }
      c.mean[name] = new THREE.Quaternion(m.x, m.y, m.z, m.w).normalize();
    }
    const b = src.bones[name], mean = c.mean[name];
    const d = mean.clone().invert().multiply(b.quaternion);
    if (d.w < 0) { d.x = -d.x; d.y = -d.y; d.z = -d.z; d.w = -d.w; }
    const a = 2 * Math.acos(Math.min(1, d.w)), s = Math.sqrt(Math.max(1e-12, 1 - d.w * d.w));
    d.setFromAxisAngle(_p.set(d.x / s, d.y / s, d.z / s), a * k[i]);
    b.quaternion.copy(mean).multiply(d);
  }
}

/** The library's clips (RECIPES, or those named in `only`) carried onto a sworn body: `scene` its
 * root, `skel` its bound skeleton (bones under the Sworn's names), `mesh` its skin (for the clips
 * that keep it off the ground). Returns {clips, hits, gaits} (the paces its gaits go at, m/s). */
export function ualClips(src, scene, skel, { only = null, recipes = RECIPES, mesh = null } = {}) {
  const db = Object.fromEntries(skel.bones.map((b) => [b.name, b]));
  const pairs = Object.entries(UAL_BONES).filter(([s, d]) => src.bones[s] && db[d]);
  const sName = Object.fromEntries(pairs.map(([s, d]) => [d, s]));
  // the turn that takes each mannequin bone's bind onto the body's (W_body = W_mannequin * fix)
  const fix = {}, dBind = {};
  for (const [s, d] of pairs) {
    dBind[d] = bindOf(skel, db[d]);
    fix[d] = src.bind[s].q.clone().invert().multiply(dBind[d].q);
  }
  // the legs: how much longer the body's are, and where each skeleton's soles are at bind
  const legs = dBind.thighL.p.y / src.bind.thigh_l.p.y;
  const soleS = ['foot_l', 'ball_l', 'foot_r', 'ball_r'];
  const toeD = {};    // the body's toe tips, in the foot's frame
  for (const s of ['L', 'R']) {
    const end = db['foot' + s].children.find((c) => c.isBone);
    toeD[s] = end ? end.position.clone() : new THREE.Vector3(0, 0.17, 0);
  }
  // the body's bones in order down the tree, so a parent is posed before its children
  const order = [];
  scene.updateMatrixWorld(true);
  skel.bones[0].parent.traverse((o) => { if (o.isBone && sName[o.name]) order.push(o); });
  const keep = new Map(skel.bones.map((b) => [b, [b.position.clone(), b.quaternion.clone()]]));
  const joints = legJoints(skel);
  const footY = () => {      // the lowest of the body's heels and toes, in the model's frame
    let y = Infinity;
    for (const s of ['L', 'R']) {
      const f = db['foot' + s];
      y = Math.min(y, f.getWorldPosition(_p).y, _p.copy(toeD[s]).applyMatrix4(f.matrixWorld).y);
    }
    return y;
  };
  const bindFootD = (() => { for (const [b, [p, q]] of keep) { b.position.copy(p); b.quaternion.copy(q); } scene.updateMatrixWorld(true); return footY(); })();
  const srcSole = () => {
    let y = Infinity;
    for (const n of soleS) y = Math.min(y, src.bones[n].getWorldPosition(_p).y);
    const leaf = ['ball_leaf_l', 'ball_leaf_r'].map((n) => src.bones[n]).filter(Boolean);
    for (const b of leaf) y = Math.min(y, b.getWorldPosition(_p).y);
    return y;
  };
  for (const [b, [p, rq]] of src.rest) { b.position.copy(p); b.quaternion.copy(rq); }
  src.root.parent.updateMatrixWorld(true);
  const bindSoleS = srcSole();
  const bindLowS = src.mesh ? lowest(src.mesh) : 0, bindLowD = mesh ? lowest(mesh) : 0;
  /** Move the hips (and the legs hung from them) up by dy, in the world. */
  const lift = (dy) => {
    const h = db.hips;
    h.parent.updateWorldMatrix(true, false);
    h.position.add(_p.set(0, dy, 0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(h.parent.matrixWorld).invert()));
    h.updateMatrixWorld(true);
    attach(joints);
  };
  const clips = [], hits = {}, gaits = {};
  for (const [name, r] of Object.entries(recipes)) {
    if (only && !only.includes(name)) continue;
    const dur = length(src, r), n = Math.max(2, Math.round(dur * FPS) + 1);
    const times = new Float32Array(n), q = Object.fromEntries(order.map((b) => [b.name, new Float32Array(n * 4)]));
    const moved = [db.hips, ...joints.map((j) => j.bone)], ps = moved.map(() => new Float32Array(n * 3));
    const steps = [];      // (a gait: how fast the foot it stands on goes back under it)
    let was = null;
    for (let f = 0; f < n; f++) {
      const t = Math.min(dur, f / FPS);
      times[f] = t;
      for (const [b, [p, rq]] of src.rest) { b.position.copy(p); b.quaternion.copy(rq); }
      pose(src, r, t);
      src.root.parent.updateMatrixWorld(true);
      for (const b of order) {
        const d = b.name, s = src.bones[sName[d]];
        s.getWorldQuaternion(_q).multiply(fix[d]);
        b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(_q));
        if (d === 'hips') {
          s.getWorldPosition(_p).sub(src.bind.pelvis.p).multiplyScalar(legs).add(dBind.hips.p);
          b.parent.updateWorldMatrix(true, false);
          b.parent.worldToLocal(_p);
          b.position.copy(_p);
        }
        b.updateMatrixWorld(true);
      }
      attach(joints);
      if (r.plant) lift((srcSole() - bindSoleS) * legs - (footY() - bindFootD));   // the soles as high off the ground as the mannequin's
      else if (r.ground && mesh && src.mesh) lift((lowest(src.mesh) - bindLowS) * legs - (lowest(mesh) - bindLowD));   // all of it
      for (const b of order) {
        const out = q[b.name], o = f * 4;
        let sg = 1;
        if (f && b.quaternion.x * out[o - 4] + b.quaternion.y * out[o - 3] + b.quaternion.z * out[o - 2] + b.quaternion.w * out[o - 1] < 0) sg = -1;
        out[o] = b.quaternion.x * sg; out[o + 1] = b.quaternion.y * sg; out[o + 2] = b.quaternion.z * sg; out[o + 3] = b.quaternion.w * sg;
      }
      moved.forEach((b, i) => ps[i].set(b.position.toArray(), f * 3));
      if (r.gait) {
        const L = db.footL.getWorldPosition(new THREE.Vector3()), R = db.footR.getWorldPosition(new THREE.Vector3());
        const on = L.y < R.y ? 'L' : 'R', z = on === 'L' ? L.z : R.z;
        if (was?.on === on) steps.push((was.z - z) * FPS);
        was = { on, z };
      }
    }
    if (steps.length) gaits[name] = +steps.sort((a, b) => a - b)[steps.length >> 1].toFixed(2);
    const tracks = order.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, q[b.name]));
    moved.forEach((b, i) => tracks.push(new THREE.VectorKeyframeTrack(`${b.name}.position`, times, ps[i])));
    clips.push(new THREE.AnimationClip(name, dur, tracks));
    if (r.hit != null) hits[name] = r.hit;
  }
  for (const [b, [p, rq]] of keep) { b.position.copy(p); b.quaternion.copy(rq); }
  for (const [b, [p, rq]] of src.rest) { b.position.copy(p); b.quaternion.copy(rq); }
  scene.updateMatrixWorld(true);
  return { clips, hits, gaits };
}
