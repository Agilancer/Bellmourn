// How a beast man holds its arms (the goat men). The library's clips leave the hands as each clip
// has them, open as often as not, so its weapon floated by an open hand and its shield rolled with
// the forearm. Here both hands are shut for good, on the fist the sword clip makes (the left the
// right's in a mirror), their fingers' keys taken out of every clip; the shield hand's wrist is kept
// straight too, as a strapped arm's is. And what they hold is worked out from those fists, not set by
// eye: an arm's grip point goes where the curled fingers go round (the middle of each finger's curl,
// the axis from little finger to first), up the haft out of the thumb side, the edge the way the
// knuckles point. A shield's handle goes through the left fist the same way, its face out past the
// back of the hand, its back as close as the skin lets it: laid along the arm, nearest at the hand,
// tilted out over the thicker forearm toward the elbow, as a strapped shield lies.
import * as THREE from 'three';

const FINGER = /^(index|middle|ring|pinky|thumb)_\d\d(_leaf)?_r$/;
const CURLED = ['index', 'middle', 'ring', 'pinky'], JOINTS = ['01', '02', '03', '04_leaf'];
const CLEAR = 0.012;    // (metres between the skin and a shield's back: room for the fur)
const BACK = 0.01;      // (how far behind its origin a shield's back lies: their +z)
const TILT = 0.3;       // (the most it leans out toward the elbow: rise over run)

/** The middle of a finger's curl: of the circles through each three of its joints. */
function curl(p) {
  const out = new THREE.Vector3();
  let n = 0;
  for (const [i, j, k] of [[0, 1, 2], [1, 2, 3], [0, 2, 3], [0, 1, 3]]) {
    const a = p[i].clone().sub(p[k]), b = p[j].clone().sub(p[k]), ab = a.clone().cross(b), d = 2 * ab.lengthSq();
    if (d < 1e-12) continue;
    out.add(b.clone().multiplyScalar(a.lengthSq()).sub(a.clone().multiplyScalar(b.lengthSq())).cross(ab).divideScalar(d).add(p[k]));
    n++;
  }
  return out.divideScalar(Math.max(n, 1));
}

const at = (b) => b.getWorldPosition(new THREE.Vector3());

/** A shut hand's grip: the middle of its fist, and the way up through it (little finger to first). */
function gripOf(bones, s) {
  const c = CURLED.map((f) => curl(JOINTS.map((j) => at(bones[`${f}_${j}_${s}`]))));
  return { c: c.reduce((a, q) => a.add(q), new THREE.Vector3()).divideScalar(c.length), up: c[0].clone().sub(c[3]).normalize() };
}

/** The plane nearest `from` that the skin on these bones lies wholly under, looking along `out`, leaning
 * back along `x`: its height at `from`, and its rise per metre along x (negative: higher toward the elbow). */
function clearOf(scene, names, from, out, x) {
  let mesh = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
  mesh.skeleton.update();
  const want = new Set(mesh.skeleton.bones.flatMap((b, i) => (names.has(b.name) ? [i] : [])));
  const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, p = new THREE.Vector3(), T = [], H = [];
  for (let i = 0; i < si.count; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    if (!want.has(best)) continue;
    mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld).sub(from);
    T.push(p.dot(x)); H.push(p.dot(out));
  }
  let at0 = Infinity, rise = 0;
  for (let b = 0; b >= -TILT; b -= 0.01) {
    let a = -Infinity;
    for (let i = 0; i < T.length; i++) a = Math.max(a, H[i] - b * T[i]);
    if (a < at0) { at0 = a; rise = b; }
  }
  return { at0, rise };
}

/** Before the body's bones are renamed: its hands shut on clip [name, time]'s fist, and its grips.
 * Returns the sockets ({bone (as renamed), m}) and `keep`, to call once they're renamed: it takes the
 * shut bones' keys out of the clips. */
export function shutHands(g, [clipName, time]) {
  const scene = g.scene, bones = {}, rest = [];
  scene.traverse((o) => { if (o.isBone) { bones[o.name] = o; rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); } });
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(g.animations.find((c) => c.name === clipName)).play();
  mixer.setTime(time);
  const right = Object.values(bones).filter((b) => FINGER.test(b.name)), fist = new Map(right.map((b) => [b, b.quaternion.clone()]));
  mixer.stopAllAction(); mixer.uncacheRoot(scene);
  for (const [o, p, q, s] of rest) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
  scene.updateMatrixWorld(true);
  const was = new Map(rest.map(([o]) => [o, o.getWorldQuaternion(new THREE.Quaternion())]));
  // the right hand shut, and what that turned each finger bone by, mirrored onto the left (parents first)
  const left = [];
  scene.traverse((b) => {
    if (!fist.has(b)) return;
    b.quaternion.copy(fist.get(b));
    const d = b.getWorldQuaternion(new THREE.Quaternion()).multiply(was.get(b).clone().invert());
    const L = bones[b.name.replace(/_r$/, '_l')];
    if (!L) return;
    left.push(L);
    const want = new THREE.Quaternion(d.x, -d.y, -d.z, d.w).multiply(was.get(L));
    L.quaternion.copy(L.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want));
  });
  scene.updateMatrixWorld(true);
  // the weapon: its grip in the right fist, up out of the thumb side, the edge (-z) the way the knuckles point
  const R = gripOf(bones, 'r'), fwd = at(bones.middle_01_r).sub(at(bones.hand_r));
  fwd.addScaledVector(R.up, -fwd.dot(R.up)).normalize();
  const rz = fwd.clone().negate(), I = new THREE.Matrix4().makeBasis(R.up.clone().cross(rz), R.up, rz).setPosition(R.c);
  const gripR = { bone: 'handR', m: bones.hand_r.matrixWorld.clone().invert().multiply(I) };
  // the shield: +x along the forearm to the hand, its handle (y) through the left fist, its face (-z) out
  // past the back of the hand and clear of the skin
  const Lg = gripOf(bones, 'l'), x0 = at(bones.hand_l).sub(at(bones.lowerarm_l));
  x0.addScaledVector(Lg.up, -x0.dot(Lg.up)).normalize();
  const out0 = x0.clone().cross(Lg.up).normalize().negate();
  const arm = new Set(['lowerarm_l', 'hand_l', ...left.map((b) => b.name)]);
  const { at0, rise } = clearOf(scene, arm, Lg.c, out0, x0);
  const x = x0.clone().addScaledVector(out0, rise).normalize(), lz = x.clone().cross(Lg.up).normalize(), lift = at0 + CLEAR + BACK;
  const J = new THREE.Matrix4().makeBasis(x, Lg.up, lz).setPosition(Lg.c.clone().addScaledVector(out0, lift));
  const shieldL = { bone: 'forearmL', m: bones.lowerarm_l.matrixWorld.clone().invert().multiply(J) };
  console.info(`fists: ${g.animations.length} clips, the fist ${(at(bones.middle_02_r).distanceTo(R.c) * 100).toFixed(1)} cm round, a shield ${(lift * 100).toFixed(1)} cm out, leaning ${(Math.atan(-rise) * 57.3).toFixed(0)} degrees`);
  const shut = [...right, ...left, bones.hand_l];
  return { sockets: { gripR, shieldL }, keep: () => {
    const names = new Set(shut.map((b) => b.name));
    for (const c of g.animations) c.tracks = c.tracks.filter((t) => !names.has(t.name.slice(0, t.name.lastIndexOf('.'))));
  } };
}
