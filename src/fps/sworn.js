// Velscour's Sworn: the knights of Blackvigil Keep. Each is one of the village's own bodies (a
// villager, templates/models/creatures/villagers) in the Fiend's Panoply (templates/models/armor/fiend),
// put together here into a body the foes' brain and the zombies' gore can drive:
//   - the villager's skeleton, its bones renamed to the zombie body's (Wrist.L is handL, and so on);
//   - the armour, its helm and the villager's head (face, eyes, lashes) merged into one skinned mesh,
//     a material per swatch (the armour's textures tile, so they can't share one image). The set was
//     built on the same skeleton as every villager of its sex, so they bind to it as they are;
//   - the knights' own clips (knight_a's: walk, run, three cuts, the shield bash and block, the
//     falls, deaths and crawls) carried over bone by bone. Both bodies stand in the same T-pose
//     facing +z, so each bone takes the knight bone's turn away from that pose, in the world: its
//     swing is the knight's swing whatever way its own bones were built. The hips also take the
//     knight's rise and fall (scaled to the leg);
//   - fists closed (for a hilt), and the knight's sockets, hit shapes and hit frames moved onto it.
// Sword, axe or mace in the right fist, shield on the left forearm, as the dark knights carry them;
// the shield rides as far out from the forearm as its dish needs to clear the plate (shieldLift).
// The Vigil's adepts go bareheaded (their hair shows, and their burning eyes), with a wand in the
// left fist, and take the sorcerers' casting and blinking clips besides.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// the villager's bones under the zombie body's names (the rest keep their own: Body, Torso, the
// fingers, the ends and the pole targets)
const BONES = { Root: 'root', Hips: 'hips', Abdomen: 'spine', Chest: 'chest', Neck: 'neck', Head: 'head',
  ShoulderL: 'shoulderL', UpperArmL: 'upper_armL', LowerArmL: 'forearmL', WristL: 'handL',
  ShoulderR: 'shoulderR', UpperArmR: 'upper_armR', LowerArmR: 'forearmR', WristR: 'handR',
  UpperLegL: 'thighL', LowerLegL: 'shinL', FootL: 'footL', UpperLegR: 'thighR', LowerLegR: 'shinR', FootR: 'footR' };
const HEAD = /^V_(Head|Eyes|Lashes)/;   // what the villager keeps under the helm (not its clothes or hair)
const HAIR = /^V_Hair/;                 // (and bareheaded, its hair)
const CASTS = ['cast1', 'cast2', 'blink'];   // what an adept takes of the sorcerers' clips
const FPS = 30;
// a fist: how far each finger joint closes (radians), the thumb less
const CURL = { 1: 1.25, 2: 1.45, 3: 1.0, 4: 0.6 };
const THUMB = { 1: 0.35, 2: 0.55, 3: 0.5 };

const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _m = new THREE.Matrix4();

/** A bone's world rotation and position at bind (from its inverse bind matrix). */
function bindOf(skel, bone) {
  _m.copy(skel.boneInverses[skel.bones.indexOf(bone)]).invert();
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  _m.decompose(p, q, s);
  return { q, p };
}

/** One skinned mesh of all the parts: [{mesh, shell}] (shell 1: armour, whose inner face is metal
 * or cloth, not flesh), bound to `skel` by bone name. */
function merge(parts, skel) {
  const index = new Map(skel.bones.map((b, i) => [b.name, i]));
  let nv = 0, ni = 0;
  for (const { mesh } of parts) { nv += mesh.geometry.attributes.position.count; ni += mesh.geometry.index.count; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), shell = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  const geo = new THREE.BufferGeometry(), mats = [];
  let v0 = 0, i0 = 0;
  for (const { mesh, shell: sh } of parts) {
    const g = mesh.geometry, a = g.attributes, n = a.position.count;
    const remap = mesh.skeleton.bones.map((b) => index.get(b.name) ?? 0);
    for (let i = 0; i < n; i++) {
      const o = v0 + i;
      pos[o * 3] = a.position.getX(i); pos[o * 3 + 1] = a.position.getY(i); pos[o * 3 + 2] = a.position.getZ(i);
      nrm[o * 3] = a.normal.getX(i); nrm[o * 3 + 1] = a.normal.getY(i); nrm[o * 3 + 2] = a.normal.getZ(i);
      if (a.uv) { uv[o * 2] = a.uv.getX(i); uv[o * 2 + 1] = a.uv.getY(i); }
      for (let k = 0; k < 4; k++) { si[o * 4 + k] = remap[a.skinIndex.getComponent(i, k)]; sw[o * 4 + k] = a.skinWeight.getComponent(i, k); }
      shell[o] = sh;
    }
    const src = g.index.array;
    for (let k = 0; k < src.length; k++) idx[i0 + k] = src[k] + v0;
    geo.addGroup(i0, src.length, mats.length);
    mats.push(mesh.material);
    v0 += n; i0 += src.length;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setAttribute('_shell', new THREE.BufferAttribute(shell, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return { geo, mats };
}

/** The knight's clips on the sworn body: each named bone turned as the knight's turns away from its
 * bind, in the world (both bind in a T-pose facing +z), the hips carried as the knight's are. */
function retarget(knight, dst, dstSkel, only = null) {
  const src = cloneSkinned(knight.scene);
  let srcSkel = null;
  src.traverse((o) => { if (o.isSkinnedMesh && !srcSkel) srcSkel = o.skeleton; });
  const sb = Object.fromEntries(srcSkel.bones.map((b) => [b.name, b]));
  const db = Object.fromEntries(dstSkel.bones.map((b) => [b.name, b]));
  const names = Object.keys(db).filter((n) => sb[n]);
  // their binds, and the turn that takes each knight bone's bind onto the sworn one's
  const fix = {}, sBind = {}, dBind = {};
  for (const n of names) {
    sBind[n] = bindOf(srcSkel, sb[n]); dBind[n] = bindOf(dstSkel, db[n]);
    fix[n] = sBind[n].q.clone().invert().multiply(dBind[n].q);   // W_dst = W_src * fix
  }
  const legs = dBind.hips.p.y / sBind.hips.p.y;
  // the bones in order down the tree, so a parent is posed before its children
  const order = [];
  dstSkel.bones[0].parent.traverse((o) => { if (o.isBone && names.includes(o.name)) order.push(db[o.name]); });
  const rest = new Map(dstSkel.bones.map((b) => [b, [b.position.clone(), b.quaternion.clone()]]));
  const mixer = new THREE.AnimationMixer(src);
  const clips = [];
  for (const clip of knight.animations) {
    if (only && !only.includes(clip.name)) continue;
    const act = mixer.clipAction(clip);
    act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.play();
    const n = Math.max(2, Math.round(clip.duration * FPS) + 1);
    const times = new Float32Array(n);
    const q = Object.fromEntries(names.map((k) => [k, new Float32Array(n * 4)]));
    const hp = new Float32Array(n * 3);
    for (let f = 0; f < n; f++) {
      const t = Math.min(clip.duration, f / FPS);
      times[f] = t;
      mixer.setTime(t);
      src.updateMatrixWorld(true);
      for (const b of order) {
        const k = b.name;
        sb[k].getWorldQuaternion(_q).multiply(fix[k]);                       // where it should face
        b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(_q));
        b.updateMatrixWorld(true);
        const out = q[k], o = f * 4;
        let s = 1;
        if (f && b.quaternion.x * out[o - 4] + b.quaternion.y * out[o - 3] + b.quaternion.z * out[o - 2] + b.quaternion.w * out[o - 1] < 0) s = -1;
        out[o] = b.quaternion.x * s; out[o + 1] = b.quaternion.y * s; out[o + 2] = b.quaternion.z * s; out[o + 3] = b.quaternion.w * s;
        if (k === 'hips') {                                                    // the knight's rise and fall
          sb.hips.getWorldPosition(_p).sub(sBind.hips.p).multiplyScalar(legs).add(dBind.hips.p);
          b.parent.worldToLocal(_p);
          b.position.copy(_p); b.updateMatrixWorld(true);
          hp.set([_p.x, _p.y, _p.z], f * 3);
        }
      }
    }
    act.stop(); mixer.uncacheAction(clip);
    const tracks = names.map((k) => new THREE.QuaternionKeyframeTrack(`${k}.quaternion`, times, q[k]));
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hp));
    clips.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  for (const [b, [p, r]] of rest) { b.position.copy(p); b.quaternion.copy(r); }
  return clips;
}

/** Close the hands into fists: every finger joint turned toward the palm (which faces down in the
 * T-pose) about the hand's one bend axis (so the turns of a finger's joints add up), the thumb
 * less. */
function fists(skel) {
  const palm = new THREE.Vector3(0, -1, 0), wq = new THREE.Quaternion(), pq = new THREE.Quaternion();
  const axis = {};
  for (const s of ['L', 'R']) {
    const hand = skel.bones.find((b) => b.name === 'hand' + s);
    axis[s] = new THREE.Vector3(0, 1, 0).applyQuaternion(bindOf(skel, hand).q).cross(palm).normalize();
  }
  for (const b of skel.bones) {
    const m = /^(Index|Middle|Ring|Pinky|Thumb)(\d)([LR])$/.exec(b.name);
    if (!m) continue;
    const a = (m[1] === 'Thumb' ? THUMB : CURL)[m[2]];
    if (!a) continue;
    b.getWorldQuaternion(wq);
    _q.setFromAxisAngle(axis[m[3]], a);
    b.parent.getWorldQuaternion(pq);
    b.quaternion.copy(pq.invert().multiply(_q).multiply(wq));
    b.updateMatrixWorld(true);
  }
}

/** The knight's sockets moved onto the sworn body: a grip as far beyond the wrist, a shield as far
 * along the forearm; their axes as they were (both bodies bind in the same pose). */
function sockets(meta, sSkel, dSkel) {
  const at = (skel, name) => bindOf(skel, skel.bones.find((b) => b.name === name)).p;
  const out = {};
  for (const [k, s] of Object.entries(meta.sockets || {})) {
    const p = new THREE.Vector3(...s.pos);
    let q;
    if (s.bone.startsWith('hand')) {
      q = p.sub(at(sSkel, s.bone)).add(at(dSkel, s.bone));
    } else {   // along the forearm, the same fraction of the way to the wrist
      const side = s.bone.slice(-1), a0 = at(sSkel, s.bone), a1 = at(sSkel, 'hand' + side), b0 = at(dSkel, s.bone), b1 = at(dSkel, 'hand' + side);
      const L = a1.clone().sub(a0), u = p.clone().sub(a0).dot(L) / L.lengthSq();
      const off = p.clone().sub(a0).addScaledVector(L, -u);
      q = b0.clone().lerp(b1, u).add(off);
    }
    out[k] = { ...s, pos: q.toArray() };
  }
  return out;
}

/** Build a sworn body: `knight` is knight_a's loaded glTF, `villager` and `armor` the loaded body and
 * set. Returns a glTF-like {scene, animations, userData: {foe}} for the foes to clone. */
export function swornBody(knight, villager, armor, { eyes = 0xff2a10, helm = true, casts = null } = {}) {
  const scene = villager.scene;
  // what the villager keeps (its head, and its hair if bareheaded) and what it wears (every piece
  // of the set, but the helm if it goes without)
  const parts = [];
  let skel = null;
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (HEAD.test(o.name) || (!helm && HAIR.test(o.name))) { parts.push({ mesh: o, shell: HAIR.test(o.name) ? 1 : 0 }); if (!HAIR.test(o.name)) skel ||= o.skeleton; }
  });
  const inHelm = (o) => { for (let q = o; q; q = q.parent) if (/^Helm/.test(q.name)) return true; return false; };
  armor.scene.traverse((o) => { if (o.isSkinnedMesh && (helm || !inHelm(o))) parts.push({ mesh: o, shell: 1 }); });
  // its bones under the zombie body's names, the set's too (they're matched by name)
  for (const root of [scene, armor.scene]) root.traverse((o) => { if (o.isBone && BONES[o.name]) o.name = BONES[o.name]; });
  const { geo, mats } = merge(parts, skel);
  // the eyes behind the slits burn
  parts.forEach((p, i) => {
    if (!/^V_Eyes/.test(p.mesh.name)) return;
    const m = mats[i] = mats[i].clone();
    m.emissive = new THREE.Color(eyes); m.emissiveMap = null; m.emissiveIntensity = 3;
    m.userData.glow = true;
  });
  const host = skel.bones.find((b) => b.name === 'root').parent;
  const old = [];
  scene.traverse((o) => { if (o.isMesh) old.push(o); });
  for (const o of old) o.parent.remove(o);
  const body = new THREE.SkinnedMesh(geo, mats);
  body.name = 'Sworn';
  const bones = skel.bones.slice();
  const bound = new THREE.Skeleton(bones, skel.boneInverses.map((m) => m.clone()));
  host.add(body);
  body.bind(bound, new THREE.Matrix4());
  scene.updateMatrixWorld(true);
  const animations = retarget(knight, scene, bound);
  if (casts) animations.push(...retarget(casts, scene, bound, CASTS));
  fists(bound);
  // the knight's hit shapes (a little fuller for the plate, and one for the torso between the
  // spine and chest bones that the knight hasn't), its hit frames, and its sockets
  const km = knight.userData.foe;
  let kSkel = null;
  knight.scene.traverse((o) => { if (o.isSkinnedMesh && !kSkel) kSkel = o.skeleton; });
  const radius = Object.fromEntries(Object.entries(km.radius).map(([k, r]) => [k, r * 1.12]));
  radius.Torso = (radius.spine + radius.chest) / 2 * 1.1;
  const hits = { ...km.hits, ...Object.fromEntries(CASTS.map((c) => [c, casts?.userData.foe.hits?.[c]]).filter(([, v]) => v != null)) };
  const foe = { radius, tip: km.tip, hits, kind: 'knight', height: 1.85, sockets: sockets(km, kSkel, bound), eyes: eyesOf(parts) };
  return { scene, animations, userData: { foe } };
}

/** Where the eyes are (model space at bind): the middles of the eye mesh's left and right halves. */
function eyesOf(parts) {
  const e = parts.find((p) => /^V_Eyes/.test(p.mesh.name));
  if (!e) return [];
  const pos = e.mesh.geometry.attributes.position, sides = [[0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < pos.count; i++) {
    const s = sides[pos.getX(i) < 0 ? 0 : 1];
    s[0] += pos.getX(i); s[1] += pos.getY(i); s[2] += pos.getZ(i); s[3]++;
  }
  return sides.filter((s) => s[3]).map((s) => [s[0] / s[3], s[1] / s[3], s[2] / s[3]]);
}

/** How far out along its socket's z (away from the forearm) a shield must ride for the forearm's
 * and the fist's plate, as the body stands, to clear its back: shields are dished, their edges
 * coming back toward the arm, and the Fiend's vambraces and gauntlets are bulkier than the arms the
 * knights' sockets were made for. `shield`: the item's scene (its own frame is the socket's). */
export function shieldLift(body, socket, shield, margin = 0.012) {
  // the shield's back: per 1 cm square of its face, the lowest z of its surface
  const N = 140, C = 0.01, lo = new Float32Array(N * N).fill(Infinity);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  shield.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(shield.matrixWorld).invert(), m = new THREE.Matrix4();
  shield.traverse((o) => {
    if (!o.isMesh) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    const pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      const at = (k) => (idx ? idx.getX(t + k) : t + k);
      a.fromBufferAttribute(pos, at(0)).applyMatrix4(m); b.fromBufferAttribute(pos, at(1)).applyMatrix4(m); c.fromBufferAttribute(pos, at(2)).applyMatrix4(m);
      const steps = Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / 0.005) + 1;
      for (let u = 0; u <= steps; u++) for (let v = 0; v <= steps - u; v++) {
        p.copy(a).multiplyScalar(1 - (u + v) / steps).addScaledVector(b, u / steps).addScaledVector(c, v / steps);
        const i = Math.floor(p.x / C + N / 2), k = Math.floor(p.y / C + N / 2);
        if (i >= 0 && k >= 0 && i < N && k < N) lo[k * N + i] = Math.min(lo[k * N + i], p.z);
      }
    }
  });
  // the forearm's and fist's plate as it stands, in the socket's frame
  let mesh = null;
  body.scene.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  body.scene.updateMatrixWorld(true);
  const skel = mesh.skeleton, want = new Set();
  skel.bones.forEach((bn, i) => { for (let q = bn; q?.isBone; q = q.parent) if (q.name === 'forearmL') { want.add(i); break; } });
  const Y = new THREE.Vector3(...socket.y), Z = new THREE.Vector3(...socket.z);
  const toSocket = new THREE.Matrix4().makeBasis(Y.clone().cross(Z), Y, Z).setPosition(...socket.pos).invert();
  const g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  let lift = 0;
  for (let i = 0; i < g.attributes.position.count; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > bw) { bw = sw.getComponent(i, k); best = si.getComponent(i, k); }
    if (!want.has(best)) continue;
    mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld).applyMatrix4(toSocket);
    const x = Math.floor(p.x / C + N / 2), k = Math.floor(p.y / C + N / 2);
    if (x < 0 || k < 0 || x >= N || k >= N || lo[k * N + x] === Infinity) continue;
    lift = Math.max(lift, p.z - lo[k * N + x]);
  }
  return lift + margin;
}
