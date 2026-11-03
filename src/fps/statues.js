// Statues: Velscour's knights, his adepts and the Flame's old saints in stone, by the roads, up the
// Temple of Velscour's stair and down its aisles. Each is one of the game's own bodies (the Sworn's,
// made by sworn.js) caught in a pose from its own clips (a guard, a blade raised overhead, a kneel, a
// staff lifted) and its weapon and shield with it, the skinning worked once on the CPU into one still
// mesh, and dressed in the world's stone (a triplanar material: no UVs needed). One mesh per kind and
// pose, shared by every statue that stands that way; each on a plinth.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// kind -> [body, weapon, shield, poses [[clip, fraction of the way through]]]
const KINDS = {
  knight: ['sworn_m', 'penitents_greatsword', 'thorned_kite', [['idle', 0.45], ['attack4', 0.42], ['guard', 0.5]]],
  dame: ['sworn_f', 'arming_sword', 'knights_kite', [['idle', 0.3], ['attack1', 0.38]]],
  adept: ['sworn_adept_m', null, null, [['cast', 0.55], ['cast2', 0.5], ['idle', 0.6]]],
  saint: ['bandit_f', null, null, [['kneel', 0.9], ['nod_yes', 0.5], ['idle', 0.2]]],
};
const ROAD = ['knight', 'adept', 'saint', 'dame'];   // (details.js's roadside spots: kind by index)
const _v = new THREE.Vector3(), _m = new THREE.Matrix4();

/** The still mesh of `v` (foes.gltf) in the pose at `frac` through `clip`, holding its weapon and shield. */
function bake(foes, v, clip, frac, weapon, shield) {
  const g = foes.gltf[v];
  if (!g) return null;
  const c = g.animations.find((a) => a.name === clip);
  if (!c) return null;
  const scene = cloneSkinned(g.scene), mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(c).play(); mixer.setTime(c.duration * frac);
  scene.updateMatrixWorld(true);
  const parts = [];
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const src = o.geometry, pos = src.attributes.position, out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { _v.fromBufferAttribute(pos, i); o.applyBoneTransform(i, _v); _v.applyMatrix4(o.matrixWorld); out.set([_v.x, _v.y, _v.z], i * 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
    if (src.index) geo.setIndex(src.index.clone());
    parts.push(geo.toNonIndexed());
  });
  // what it holds, where the foes would hold it
  for (const [sock, id] of [['gripR', weapon], ['shieldL', shield]]) {
    if (!id) continue;
    const key = Object.keys(foes.items).find((k) => k.startsWith(id + '|')), it = key && foes.items[key], s = foes.sockets(v, sock);
    if (!it || !s) continue;
    const bone = scene.getObjectByName(s.bone);
    if (!bone) continue;
    const holder = new THREE.Group(); s.m.decompose(holder.position, holder.quaternion, holder.scale);
    const obj = it.clone(); if (sock === 'shieldL') obj.position.z = foes.lift(v, id, it);
    holder.add(obj); bone.add(holder); scene.updateMatrixWorld(true);
    obj.traverse((m) => { if (!m.isMesh) return; const geo = m.geometry.clone(); geo.applyMatrix4(m.matrixWorld); for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k); parts.push(geo.index ? geo.toNonIndexed() : geo); });
  }
  mixer.stopAllAction();
  for (const p of parts) for (const k of Object.keys(p.attributes)) if (k !== 'position') p.deleteAttribute(k);
  const geo = mergeGeometries(parts, false);
  if (!geo) return null;
  // stood on its feet at the origin, facing +z
  geo.computeBoundingBox();
  const bb = geo.boundingBox; geo.translate(-(bb.min.x + bb.max.x) / 2 * 0 , -bb.min.y, 0);
  geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.92), 3));
  return geo;
}

/** A plinth: a moulded block, its own little geometry (the same attributes as the statues'). */
function plinthGeo() {
  const parts = [[1.5, 0.35, 1.5, 0.175], [1.15, 0.9, 1.15, 0.8], [1.35, 0.22, 1.35, 1.36]].map(([w, h, d, y]) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(0, y, 0); return b.toNonIndexed(); });
  for (const p of parts) for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal') p.deleteAttribute(k);
  const geo = mergeGeometries(parts, false), n = geo.attributes.position.count;
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.85), 3));
  return geo;
}

/** Every statue spot (details.js's roadside ones, the temple's) stood with its statue. Returns how many. */
export function raiseStatues(ctx, foes, M, { touch = false } = {}) {
  const spots = [...(ctx.temple?.statues || []), ...(ctx.details?.statues || [])].filter((_, i) => !touch || i % 2 === 0);
  if (!spots.length) return 0;
  const stone = M('castle_keep_ivory_chapel_marble', 1.2, { tint: 0xb4aea4, tri: true }), plinthM = M('castle_basalt', 1.2, { tint: 0x6a6460, tri: true });
  const made = new Map(), plinth = plinthGeo(), PH = 1.47, group = new THREE.Group();
  let n = 0;
  spots.forEach((s, i) => {
    const kind = typeof s.kind === 'number' ? ROAD[s.kind % ROAD.length] : s.kind, [v, w, sh, poses] = KINDS[kind] || KINDS.knight;
    const [clip, frac] = poses[i % poses.length], key = `${kind}|${clip}`;
    if (!made.has(key)) made.set(key, bake(foes, v, clip, frac, w, sh) || bake(foes, v, 'idle', 0.4, w, sh) || bake(foes, 'sworn_m', 'idle', 0.4, 'penitents_greatsword', null));
    const geo = made.get(key);
    if (!geo) return;
    const m = new THREE.Mesh(geo, stone);
    m.position.set(s.x, s.y + PH, s.z); m.rotation.y = s.yaw; m.scale.setScalar(1.12);
    m.castShadow = m.receiveShadow = true;
    const p = new THREE.Mesh(plinth, plinthM); p.position.set(s.x, s.y, s.z); p.rotation.y = s.yaw; p.castShadow = p.receiveShadow = true;
    group.add(m, p);
    ctx.physics.add([s.x - 0.75, s.y, s.z - 0.75], [s.x + 0.75, s.y + PH + 1.9, s.z + 0.75], 'statue');
    n++;
  });
  ctx.scene.add(group);
  ctx.statues = { group, n, kinds: [...made.keys()] };
  console.info(`statues: ${n} (${made.size} poses)`);
  return n;
}
