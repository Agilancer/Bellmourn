// Quaternius' Universal Animation Libraries 1 and 2 (CC0) on the Sworn: the mannequin's clips
// (templates/models/creatures/sworn/ual.glb, cut down by tools/creatures/sworn_ual/trim.py) carried
// onto a sworn body bone for bone. Both skeletons stand in a T-pose facing +z, and the mannequin's
// bones match the villager's one to one (pelvis, three spine bones, neck, head; clavicle, upper and
// lower arm, hand, three joints of each finger; thigh, calf, foot), so each of the body's bones takes
// the mannequin bone's turn away from that pose, in the world; the hips also take the pelvis's rise,
// fall and sway (scaled to the leg), and where the mannequin's feet are on the ground, the body's are.
//
// Some clips are put together (RECIPES): the walk, jog and sprint are the first library's below the
// waist under the second's shield guard above it (pitched into the stride as they quicken); the shield
// raised is the guard braced; the deaths are the knockback and the first library's fall.
//
// Every other body on a skeleton like it takes the same clips (ualBody): the villagers (their own bone
// names mapped to the Sworn's, VILLAGER_BONES) and the open country's knights and sorcerers (the
// zombie body's 20 bones, already under those names). A body without a shield stands easy (CALM).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const UAL_URL = 'templates/models/creatures/sworn/ual.glb';
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
 * in its own clip or (`lean`) leaning as this one's hips lean; `pitch`: the body above the waist
 * tipped forward (radians);
 * `turn`: bones turned further, in the world, each [bone, axis, radians] (after the bones above it);
 * `guard`: [in, out], the parts of the clip over which the shield arm comes out of the guard (the
 * library's moves start and end with it hanging) and goes back into it, so it joins the guard.
 * `hit`: the frame (at 30 a second, of the finished clip) a blow lands, or the frames, if it lands
 * more than one. `plant`: the feet kept on the ground where the mannequin's are; `ground`: the body
 * kept as far off the ground as the mannequin is (it lies on its back in plate, so it lies higher).
 * `gait`: measure how fast it goes over the ground (its feet don't slide played at that pace). */
export const RECIPES = {
  idle: { src: 'Idle_Shield_Loop', plant: true },
  walk: { src: 'Walk_Loop', upper: 'Idle_Shield_Loop', plant: true, gait: true },
  run: { src: 'Jog_Fwd_Loop', upper: 'Idle_Shield_Loop', pitch: 0.1, plant: true, gait: true },
  sprint: { src: 'Sprint_Loop', upper: 'Idle_Shield_Loop', pitch: 0.22, plant: true, gait: true },    // (the shield charge)
  // not after anyone: at ease, on his round, talking, without his shield
  idle_calm: { src: 'Idle_Loop', plant: true },
  idle_talk: { src: 'Idle_Talking_Loop', plant: true },
  idle_sword: { src: 'Sword_Idle', plant: true },
  patrol: { src: 'Walk_Formal_Loop', plant: true, gait: true },
  attack4: { src: 'Sword_Attack', plant: true, hit: 13, guard: [0.2, 0.3] },
  punch1: { src: 'Punch_Jab', plant: true, hit: 6 },
  punch2: { src: 'Punch_Cross', plant: true, hit: 8 },
  roll: { src: 'Roll', ground: true },
  hit_head: { src: 'Hit_Head', plant: true },
  hit_chest: { src: 'Hit_Chest', plant: true },
  death2: { src: 'Death01', ground: true },
  cast: { seq: [{ src: 'Spell_Simple_Enter' }, { src: 'Spell_Simple_Shoot' }, { src: 'Spell_Simple_Exit' }], plant: true, hit: 24 },
  // the everyday: kept for anyone on this skeleton (the villagers too)
  crouch: { src: 'Crouch_Idle_Loop', plant: true },
  crouch_walk: { src: 'Crouch_Fwd_Loop', plant: true, gait: true },
  torch: { src: 'Idle_Torch_Loop', plant: true },
  sit: { src: 'Sitting_Enter', plant: true },
  sit_idle: { src: 'Sitting_Idle_Loop', plant: true },
  sit_talk: { src: 'Sitting_Talking_Loop', plant: true },
  stand: { src: 'Sitting_Exit', plant: true },
  interact: { src: 'Interact', plant: true },
  pickup: { src: 'PickUp_Table', plant: true },
  kneel: { src: 'Fixing_Kneeling', plant: true },
  push: { src: 'Push_Loop', plant: true },
  dance: { src: 'Dance_Loop', plant: true },
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
  leap: { seq: [{ src: 'Jump_Start', from: 0.4 }, { src: 'Jump_Land' }], ground: true },
  heavy: { src: 'Sword_Heavy_Combo', plant: true, hit: [15, 35, 54, 79], guard: [0.08, 0.15] },
  // the rest of both libraries (not yet used by anyone's brain; hit frames still to find)
  sword_combo: { src: 'Sword_Regular_Combo', plant: true, guard: [0.08, 0.15] },
  shield_hit: { src: 'Shield_OneShot', plant: true },
  carry_walk: { src: 'Walk_Carry_Loop', plant: true, gait: true },
  punch3: { src: 'Melee_Hook', plant: true }, punch3_rec: { src: 'Melee_Hook_Rec', plant: true },
  throw: { src: 'OverhandThrow', plant: true },
  climb: { src: 'ClimbUp_1m' }, falling: { src: 'Jump_Loop' }, jump_hang: { src: 'NinjaJump_Idle_Loop' },
  slide_start: { src: 'Slide_Start', ground: true }, slide: { src: 'Slide_Loop', ground: true }, slide_exit: { src: 'Slide_Exit', ground: true },
  swim: { src: 'Swim_Fwd_Loop' }, swim_idle: { src: 'Swim_Idle_Loop' },
  cast_ready: { src: 'Spell_Simple_Idle_Loop', plant: true },
  idle_arms: { src: 'Idle_FoldArms_Loop', plant: true }, nod_yes: { src: 'Yes', plant: true }, nod_no: { src: 'Idle_No_Loop', plant: true },
  lantern: { src: 'Idle_Lantern_Loop', plant: true }, rail: { src: 'Idle_Rail_Loop', plant: true }, rail_call: { src: 'Idle_Rail_Call', plant: true },
  open_chest: { src: 'Chest_Open', plant: true }, consume: { src: 'Consume', plant: true },
  harvest: { src: 'Farm_Harvest', plant: true }, plant: { src: 'Farm_PlantSeed', plant: true }, water: { src: 'Farm_Watering', plant: true },
  chop: { src: 'TreeChopping_Loop', plant: true },
  zombie_idle: { src: 'Zombie_Idle_Loop', plant: true }, zombie_walk: { src: 'Zombie_Walk_Fwd_Loop', plant: true, gait: true },
  zombie_scratch: { src: 'Zombie_Scratch', plant: true },
};
const GUARD = ['clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l'];   // the shield arm

/** A body with no shield (the villagers, the sorcerers): the library's own stance, walk, jog and
 * sprint, arms free; the knight's shield guard is still there as `guard`. */
export const CALM = {
  idle: { src: 'Idle_Loop', plant: true },
  walk: { src: 'Walk_Loop', plant: true, gait: true },
  run: { src: 'Jog_Fwd_Loop', plant: true, gait: true },
  sprint: { src: 'Sprint_Loop', plant: true, gait: true },
  guard: RECIPES.idle,
};
/** The clips that go round and round (the rest play once and hold their end). */
export const LOOPING = new Set(['idle', 'walk', 'run', 'sprint', 'idle_calm', 'idle_talk', 'idle_sword', 'patrol', 'block', 'guard',
  'crouch', 'crouch_walk', 'torch', 'sit_idle', 'sit_talk', 'push', 'dance', 'dead', 'dead2',
  'carry_walk', 'falling', 'jump_hang', 'slide', 'swim', 'swim_idle', 'cast_ready', 'idle_arms', 'nod_no', 'lantern', 'rail', 'chop',
  'zombie_idle', 'zombie_walk']);

/** The villager's bones under the Sworn's names (the zombie body's; the rest keep their own: Body,
 * Torso, the fingers, the ends and the pole targets). */
export const VILLAGER_BONES = { Root: 'root', Hips: 'hips', Abdomen: 'spine', Chest: 'chest', Neck: 'neck', Head: 'head',
  ShoulderL: 'shoulderL', UpperArmL: 'upper_armL', LowerArmL: 'forearmL', WristL: 'handL',
  ShoulderR: 'shoulderR', UpperArmR: 'upper_armR', LowerArmR: 'forearmR', WristR: 'handR',
  UpperLegL: 'thighL', LowerLegL: 'shinL', FootL: 'footL', UpperLegR: 'thighR', LowerLegR: 'shinR', FootR: 'footR' };

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

/** How fast a gait goes over the ground: each foot's longest stretch on the ground (within 4 cm of
 * the lowest it gets) round the loop, how far it slid back under the body over that time, averaged.
 * `feet`: [y, z] of each foot a frame, n frames (the last is the first again). */
function pace(feet, n) {
  const v = [];
  for (const f of feet) {
    const lo = Math.min(...f.map((p) => p[0])), on = (i) => f[(i + n) % n][0] < lo + 0.04;
    let best = null;
    for (let s = 0; s < n; s++) {
      if (!on(s) || on(s - 1)) continue;
      let e = s;
      while (on(e + 1) && e - s < n) e++;
      if (e > s && (!best || e - s > best[0])) best = [e - s, (f[s % n][1] - f[e % n][1]) * FPS / (e - s)];
    }
    if (best) v.push(best[1]);
  }
  return v.length ? v.reduce((a, b) => a + b) / v.length : 0;
}

/** The lowest point of a skinned mesh as it's posed (a spread of ~1500 of its vertices, in the
 * world), its bones' world matrices up to date; of several (a villager's clothes), the lowest of all. */
function lowest(mesh, k = 1500) {
  if (Array.isArray(mesh)) return Math.min(...mesh.map((m) => lowest(m, Math.ceil(k / mesh.length) + 50)));
  const n = mesh.geometry.attributes.position.count, step = Math.max(1, Math.floor(n / k));
  let y = Infinity;
  for (let i = 0; i < n; i += step) y = Math.min(y, mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld).y);
  return y;
}
const _v = new THREE.Vector3();
const LOW = 1500;    // (vertices sampled for a body's lowest point)

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

/** The library's clips (RECIPES, or those named in `only`) carried onto a sworn body: `scene` its
 * root, `skel` its bound skeleton (bones under the Sworn's names), `mesh` its skin (for the clips
 * that keep it off the ground). Returns {clips, hits, gaits} (the paces its gaits go at, m/s). */
export function ualClips(src, scene, skel, opts) {
  const it = steps(src, scene, skel, opts);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/** The same, a few milliseconds at a time (`ms`), so the game keeps drawing while they're made. It
 * steps aside by a message, not a timer (a hidden tab's timers are held to one a second, and it would
 * take minutes), and not at all while the tab is hidden (nothing's being drawn). */
export async function ualClipsAsync(src, scene, skel, opts, ms = 8) {
  const it = steps(src, scene, skel, opts);
  for (let t = performance.now(); ;) {
    const r = it.next();
    if (r.done) return r.value;
    if (performance.now() - t > ms && !document.hidden) { await breathe(); t = performance.now(); }
  }
}
const breathe = () => new Promise((ok) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); ok(); }; c.port2.postMessage(0); });

/** ualClips a frame at a time (a generator: it stops after each frame of each clip; between stops the
 * library's skeleton may be posed by another body's, so each frame starts it from rest). */
function* steps(src, scene, skel, { only = null, recipes = RECIPES, mesh = null } = {}) {
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
  const bindLowS = src.mesh ? lowest(src.mesh, LOW) : 0, bindLowD = mesh ? lowest(mesh, LOW) : 0;
  // the bone the hips hang from, if it isn't the root (the villager's Body, which its belt and the
  // tops of its legs are skinned to): carried with the pelvis, so all of that goes where the hips go
  const carrier = db.hips.parent?.isBone && db.hips.parent.name !== 'root' && !sName[db.hips.parent.name] ? db.hips.parent : null;
  const one = new THREE.Vector3(1, 1, 1), hipsBindInv = new THREE.Matrix4().compose(dBind.hips.p, dBind.hips.q, one).invert();
  const cBind = carrier && bindOf(skel, carrier), carrierBind = carrier && new THREE.Matrix4().compose(cBind.p, cBind.q, one);
  const carry = () => {      // (the pelvis's turn and rise away from its bind, put on the carrier's bind)
    const s = src.bones.pelvis, q = s.getWorldQuaternion(new THREE.Quaternion()).multiply(fix.hips);
    const p = s.getWorldPosition(new THREE.Vector3()).sub(src.bind.pelvis.p).multiplyScalar(legs).add(dBind.hips.p);
    const m = new THREE.Matrix4().compose(p, q, one).multiply(hipsBindInv).multiply(carrierBind);
    carrier.parent.updateWorldMatrix(true, false);
    m.premultiply(new THREE.Matrix4().copy(carrier.parent.matrixWorld).invert());
    m.decompose(carrier.position, carrier.quaternion, new THREE.Vector3());
    carrier.updateMatrixWorld(true);
  };
  /** Move the hips (and the legs hung from them) up by dy, in the world. */
  const lift = (dy) => {
    const h = carrier || db.hips;
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
    const moved = [db.hips, ...joints.map((j) => j.bone), ...(carrier ? [carrier] : [])], ps = moved.map(() => new Float32Array(n * 3));
    const cq = carrier && new Float32Array(n * 4);
    const feet = r.gait ? [[], []] : null;      // (a gait: the mannequin's balls of the feet, [y, z] a frame)
    for (let f = 0; f < n; f++) {
      const t = Math.min(dur, f / FPS);
      times[f] = t;
      for (const [b, [p, rq]] of src.rest) { b.position.copy(p); b.quaternion.copy(rq); }
      pose(src, r, t);
      src.root.parent.updateMatrixWorld(true);
      if (feet) ['ball_l', 'ball_r'].forEach((k, i) => { src.bones[k].getWorldPosition(_p); feet[i].push([_p.y, _p.z]); });
      if (carrier) carry();
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
        b.updateWorldMatrix(false, false);    // (its children read it as they're posed; the rest once, below)
      }
      skel.bones[0].parent.updateMatrixWorld(true);
      attach(joints);
      if (r.plant) lift((srcSole() - bindSoleS) * legs - (footY() - bindFootD));   // the soles as high off the ground as the mannequin's
      else if (r.ground && mesh && src.mesh) lift((lowest(src.mesh, LOW) - bindLowS) * legs - (lowest(mesh, LOW) - bindLowD));   // all of it
      for (const b of order) {
        const out = q[b.name], o = f * 4;
        let sg = 1;
        if (f && b.quaternion.x * out[o - 4] + b.quaternion.y * out[o - 3] + b.quaternion.z * out[o - 2] + b.quaternion.w * out[o - 1] < 0) sg = -1;
        out[o] = b.quaternion.x * sg; out[o + 1] = b.quaternion.y * sg; out[o + 2] = b.quaternion.z * sg; out[o + 3] = b.quaternion.w * sg;
      }
      moved.forEach((b, i) => ps[i].set(b.position.toArray(), f * 3));
      if (cq) {
        const c = carrier.quaternion, o = f * 4, sg = f && c.x * cq[o - 4] + c.y * cq[o - 3] + c.z * cq[o - 2] + c.w * cq[o - 1] < 0 ? -1 : 1;
        cq.set([c.x * sg, c.y * sg, c.z * sg, c.w * sg], o);
      }
      yield;
    }
    if (feet) gaits[name] = +(pace(feet, n - 1) * legs).toFixed(2);
    const tracks = order.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, q[b.name]));
    moved.forEach((b, i) => tracks.push(new THREE.VectorKeyframeTrack(`${b.name}.position`, times, ps[i])));
    if (cq) tracks.push(new THREE.QuaternionKeyframeTrack(`${carrier.name}.quaternion`, times, cq));
    clips.push(new THREE.AnimationClip(name, dur, tracks));
    if (r.hit != null) hits[name] = r.hit;
  }
  for (const [b, [p, rq]] of keep) { b.position.copy(p); b.quaternion.copy(rq); }
  for (const [b, [p, rq]] of src.rest) { b.position.copy(p); b.quaternion.copy(rq); }
  scene.updateMatrixWorld(true);
  return { clips, hits, gaits };
}

/** The library, read once however many ask for it (the Sworn, the villagers, the open country's foes). */
let _ual = null;
export function loadUal(loader) {
  return (_ual ||= loader.loadAsync(UAL_URL).then(ualSource));
}

/** Every clip of the knight's for another body: `gltf` a loaded model (it's posed on a copy, so the
 * original is left as it came), `names` its bones' own names mapped to the Sworn's if they differ
 * (VILLAGER_BONES), `recipes` the set (CALM over RECIPES for a body with no shield). The clips' tracks
 * are under the body's own names, so one set serves every model on that skeleton; the lying poses
 * (dead, dead2) are cut from the ends of the deaths. Made a few milliseconds at a time (`ms`).
 * Resolves to {clips, hits, gaits}. */
export async function ualBody(src, gltf, { names = null, recipes = RECIPES, ms = 8 } = {}) {
  const scene = cloneSkinned(gltf.scene);
  const meshes = [];
  scene.traverse((o) => { if (o.isSkinnedMesh && o.visible) meshes.push(o); });
  const mesh = meshes.reduce((a, b) => (b.geometry.attributes.position.count > a.geometry.attributes.position.count ? b : a));
  if (names) scene.traverse((o) => { if (o.isBone && names[o.name]) o.name = names[o.name]; });
  const made = await ualClipsAsync(src, scene, mesh.skeleton, { mesh: meshes.length > 1 ? meshes : mesh, recipes }, ms);
  for (const [d, lie] of [['death', 'dead'], ['death2', 'dead2']]) {
    const c = made.clips.find((x) => x.name === d);
    if (c) made.clips.push(holdEnd(c, lie));
  }
  if (names) {
    const back = Object.fromEntries(Object.entries(names).map(([a, b]) => [b, a]));
    for (const c of made.clips) for (const t of c.tracks) {
      const i = t.name.lastIndexOf('.'), b = back[t.name.slice(0, i)];
      if (b) t.name = b + t.name.slice(i);
    }
  }
  return made;
}

/** A clip's last pose, held (a body lying where its death left it): a second of it, still. (A clip of
 * one frame lasts no time at all, and looped, the mixer's time goes to NaN.) */
export function holdEnd(c, name) {
  return new THREE.AnimationClip(name, 1, c.tracks.map((t) => {
    const k = t.getValueSize(), v = Array.from(t.values.slice(-k));
    return new t.constructor(t.name, [0, 1], [...v, ...v]);
  }));
}
