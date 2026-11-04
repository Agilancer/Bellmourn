// The stones the green star threw: built here out of nothing (no models), to match the crater's
// painting. Angular chunks and shards with flat broken faces, rounder boulders, gravel; tan cracked
// plates, rust on the sides, dust on top. Each kind is one instanced mesh.
//
// Those in the crater stand on the ones painted on it (PICKS, in the painting's pixels), the painting's
// own stone left under each as its shadow; more are flung out across the meadow (fling), thinning with
// distance. All of it is only there once the star has come down (withCrater).
import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { CRATER, PAINT, craterHeight, paintTex, withCrater } from './crater.js';

const TAU = Math.PI * 2;
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** One stone, about 1 across: a many-faced solid, each way out from its middle going as far as the first
 * of `cuts` planes, so its faces are flat and broken and its edges hard. o: {detail, cuts, shape: [x, y, z]
 * (its stretch), near (how close in the planes come, from..to), round (0: all faces; 1: a smooth ball),
 * chip (a little roughness over it)} */
export function stone(seed, { detail = 3, cuts = 13, shape = [1, 0.8, 0.9], near = [0.55, 0.82], round = 0, chip = 0.012 }) {
  const R = rng(seed);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const planes = Array.from({ length: cuts }, () => {
    const u = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - u * u);
    return [s * Math.cos(a), u, s * Math.sin(a), near[0] + R() * (near[1] - near[0])];
  });
  const bumps = Array.from({ length: 5 }, () => [R() * 5 + 5, R() * TAU, R() * TAU, R() * TAU]);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let far = 1.45;
    for (const [nx, ny, nz, d] of planes) { const c = v.x * nx + v.y * ny + v.z * nz; if (c > 0.001) far = Math.min(far, d / c); }
    let k = far * (1 - round) + (0.8 + 0.1 * Math.sin(v.x * 3 + seed) * Math.sin(v.z * 3 + seed)) * round;
    for (const [f, a, b, c] of bumps) k += chip * Math.sin(v.x * f + a) * Math.sin(v.y * f + b) * Math.sin(v.z * f + c);
    v.multiplyScalar(k);
    p.setXYZ(i, v.x * shape[0], v.y * shape[1], v.z * shape[2]);
  }
  g = toCreasedNormals(g.toNonIndexed(), 0.5);
  // the plates' skin, boxed onto each face; a rust side, a dusty top, its foot in the dark
  const n = g.attributes.normal, P = g.attributes.position, uv = new Float32Array(P.count * 2), col = new Float32Array(P.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const lowest = shape[1] * -1;
  for (let t = 0; t < P.count; t += 3) {
    a.fromBufferAttribute(P, t); b.fromBufferAttribute(P, t + 1); c.fromBufferAttribute(P, t + 2);
    ab.subVectors(b, a).cross(ac.subVectors(c, a));
    const ax = Math.abs(ab.x), ay = Math.abs(ab.y), az = Math.abs(ab.z);
    for (let i = 0; i < 3; i++) {
      const j = t + i, x = P.getX(j), y = P.getY(j), z = P.getZ(j);
      const [u, w] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
      uv[j * 2] = u * 0.72 + seed * 0.13; uv[j * 2 + 1] = w * 0.72 + seed * 0.29;
      const up = n.getY(j), foot = Math.min(1, (y - lowest) / (shape[1] * 0.8));
      const side = 1 - Math.max(0, up);
      const shade = (0.72 + 0.28 * foot) * (0.98 + 0.2 * Math.max(0, up));
      col[j * 3] = shade * (1 + 0.04 * side); col[j * 3 + 1] = shade * (1 - 0.03 * side); col[j * 3 + 2] = shade * (1 - 0.08 * side);
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// the kinds: every stone of the painting is one of these
export const KINDS = {
  chunk0: { seed: 311, cuts: 13, shape: [1.05, 0.86, 0.95] },
  chunk1: { seed: 523, cuts: 10, shape: [1, 0.72, 1.1] },
  chunk2: { seed: 877, cuts: 9, shape: [1.1, 1, 0.9], near: [0.5, 0.78] },
  shard0: { seed: 1409, cuts: 8, shape: [0.6, 1.7, 0.95] },   // (the tall broken plates round the rim)
  shard1: { seed: 2203, cuts: 7, shape: [0.46, 1.45, 1.05] },
  slab: { seed: 3137, cuts: 9, shape: [1.25, 0.56, 0.98] },    // (a plate of the ground, heaved up)
  boulder0: { seed: 4001, detail: 2, cuts: 11, shape: [1, 0.86, 0.94], near: [0.62, 0.86], round: 0.25 },
  boulder1: { seed: 5297, detail: 2, cuts: 9, shape: [0.94, 0.78, 1], near: [0.6, 0.84], round: 0.15 },
  gravel: { seed: 6113, detail: 1, cuts: 7, shape: [1, 0.72, 0.86] },
};
const TALL = Object.fromEntries(Object.entries(KINDS).map(([k, o]) => [k, o.shape[1]]));

/** The one material they're all in. */
export const rockMaterial = (tex = paintTex) => new THREE.MeshPhongMaterial({ color: new THREE.Color(1.4, 1.34, 1.3), map: tex('rock.webp', true, true), normalMap: tex('rock_n.webp', false, true),
  normalScale: new THREE.Vector2(1, 1), vertexColors: true, specular: 0x1a1612, shininess: 10 });

// the painting's stones: [x, y (px), half across (px), kind]
const PICKS = [
  // round the rim and out on its plates
  [750, 85, 40, 'shard0'], [382, 112, 34, 'shard1'], [175, 215, 32, 'chunk2'], [930, 150, 50, 'slab'], [1022, 195, 24, 'chunk0'], [1062, 275, 36, 'slab'],
  [1118, 322, 34, 'slab'], [1150, 378, 30, 'shard1'], [950, 445, 48, 'chunk2'], [1145, 510, 44, 'chunk0'], [1197, 652, 15, 'boulder0'],
  [1035, 1035, 24, 'chunk1'], [960, 1060, 34, 'chunk2'], [920, 1085, 18, 'chunk1'], [820, 1150, 58, 'slab'], [635, 1140, 40, 'shard0'], [695, 1220, 24, 'chunk1'],
  [975, 1140, 18, 'boulder0'], [297, 1135, 28, 'chunk0'], [245, 1100, 18, 'shard1'], [112, 840, 20, 'boulder1'], [135, 882, 13, 'boulder0'],
  [122, 382, 30, 'chunk1'], [72, 352, 15, 'boulder0'], [40, 552, 24, 'chunk0'], [62, 652, 38, 'slab'], [92, 790, 46, 'slab'], [302, 985, 30, 'shard1'],
  [155, 1050, 13, 'boulder1'], [212, 1042, 14, 'boulder0'], [450, 118, 20, 'boulder1'], [615, 35, 20, 'boulder0'], [236, 266, 17, 'boulder0'], [230, 224, 12, 'boulder1'],
  [1075, 370, 13, 'boulder1'],
  // on the crater's floor
  [752, 420, 20, 'boulder0'], [825, 547, 22, 'boulder1'], [432, 477, 13, 'chunk1'], [942, 655, 22, 'boulder1'], [905, 735, 24, 'chunk0'],
  [407, 705, 17, 'boulder0'], [398, 732, 8, 'gravel'], [745, 832, 30, 'chunk2'], [710, 790, 11, 'chunk1'], [445, 825, 17, 'boulder1'], [410, 860, 13, 'chunk1'], [440, 858, 10, 'boulder0'],
  [585, 925, 17, 'chunk0'], [375, 898, 10, 'boulder1'], [640, 840, 8, 'gravel'], [520, 567, 8, 'gravel'], [315, 660, 9, 'boulder0'], [335, 668, 9, 'boulder1'], [355, 675, 9, 'chunk1'],
  [825, 830, 12, 'chunk1'], [780, 785, 12, 'chunk1'], [912, 620, 7, 'gravel'], [805, 445, 7, 'gravel'], [505, 575, 6, 'gravel'],
];

export class CraterRocks {
  /** ctx: the world. keep(x, z, r): may a stone of radius r lie here? (the way up to Wren, the village's
   * knot and the like: main.js). touch: a phone, so less gravel. */
  constructor(ctx, keep = () => true, touch = false) {
    this.ctx = ctx;
    this.keep = keep;
    this.touch = touch;
    this.group = new THREE.Group();
    this.group.name = 'craterRocks';
    this.laid = Object.fromEntries(Object.keys(KINDS).map((k) => [k, []]));   // kind -> [x, y, z, s, turn, tilt]
    this.boxes = [];
    const mat = rockMaterial();
    this.inPainting();
    this.fling();
    this.scatter();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    const R = rng(90411);
    for (const [kind, list] of Object.entries(this.laid)) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(stone(KINDS[kind].seed, KINDS[kind]), mat, list.length);
      list.forEach(([x, y, z, size, turn, tilt], i) => {
        e.set(tilt * Math.cos(turn * 3), turn, tilt * Math.sin(turn * 3), 'YXZ');
        mesh.setMatrixAt(i, m.compose(p.set(x, y, z), q.setFromEuler(e), s.setScalar(size)));
        const v = 0.86 + R() * 0.26;   // (no two quite the one colour)
        mesh.setColorAt(i, c.setRGB(v * (0.97 + R() * 0.08), v, v * (0.93 + R() * 0.08)));
      });
      mesh.castShadow = kind !== 'gravel'; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    ctx.scene.add(this.group);
    withCrater(this.group);
  }

  /** Set a stone down at (x, z): its foot in the ground, a box round it if it's big enough to bar the way. */
  lay(kind, x, z, size, R, ground) {
    const tall = TALL[kind] * size;
    const shard = kind.startsWith('shard');
    const turn = R() * TAU, tilt = (shard ? 0.28 : 0.14) * R();
    const y = ground + tall * (kind === 'gravel' ? 0.42 : 0.55);
    this.laid[kind].push([x, y, z, size, turn, tilt]);
    if (size > 0.5) {
      const w = size * (kind === 'slab' ? 0.8 : 0.66), box = this.ctx.physics.add([x - w, ground - 1, z - w], [x + w, y + tall * 0.8, z + w], 'prop');
      this.boxes.push(box);
    }
  }

  /** Those on the painting's. */
  inPainting() {
    const R = rng(1187), { x: px, y: py, m } = PAINT;
    for (const [ix, iy, r, kind] of PICKS) {
      const x = CRATER.x + (ix - px) * m, z = CRATER.z + (iy - py) * m, size = r * m;
      if (this.keep(x, z, size)) this.lay(kind, x, z, size, R, craterHeight(x, z));
    }
  }

  /** Those thrown out over the meadow: along the blast's rays, bigger ones nearer, none on the roads,
   * up against a wall or tree, or where the village has its business. */
  fling() {
    const R = rng(7741), { physics } = this.ctx, kinds = ['chunk0', 'chunk1', 'chunk2', 'boulder0', 'boulder1', 'shard0', 'shard1', 'boulder0'];
    const rays = Array.from({ length: 13 }, (_, i) => (i + R() * 0.7) / 13 * TAU);
    const roads = (this.ctx.paths || []).flatMap((q) => q.pts.slice(1).map((pt, i) => [q.pts[i], pt, q.w]));
    const offRoads = (x, z, pad) => roads.every(([[ax, az], [bx, bz], w]) => {
      const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(x - ax - dx * t, z - az - dz * t) > w + pad;
    });
    let placed = 0;
    for (let tries = 0; tries < 300 && placed < 64; tries++) {
      const a = rays[Math.floor(R() * rays.length)] + (R() - 0.5) * 0.3, d = CRATER.reach - 1 + (R() ** 1.7) * 52;
      const x = CRATER.x + Math.cos(a) * d, z = CRATER.z + Math.sin(a) * d;
      const size = (0.32 + R() * R() * 1.0) * (1 - (d - CRATER.reach) / 90), pad = size + 1.6;
      if (!this.keep(x, z, size) || !offRoads(x, z, 2.5)) continue;
      if ([...physics.near(x - pad, z - pad, x + pad, z + pad)].length) continue;
      if (Math.abs(physics.groundAt(x + 1, z) - physics.groundAt(x - 1, z)) > 1) continue;   // (past the meadow, up a slope)
      this.lay(kinds[Math.floor(R() * kinds.length)], x, z, size, R, physics.groundAt(x, z));
      placed++;
    }
    this.offRoads = offRoads;   // (the gravel's too)
  }

  /** The gravel: thick round the painted stones and along the rim, thinning out past it. */
  scatter() {
    const R = rng(26357), { physics } = this.ctx, big = PICKS.filter((q) => q[2] >= 14);
    const n = this.touch ? 140 : 300, { x: px, y: py, m } = PAINT;
    for (let i = 0; i < n; i++) {
      let x, z;
      if (i < n * 0.4) {    // (at the foot of a big one)
        const q = big[Math.floor(R() * big.length)], a = R() * TAU, d = q[2] * m * (1 + R() * 1.6);
        x = CRATER.x + (q[0] - px) * m + Math.cos(a) * d; z = CRATER.z + (q[1] - py) * m + Math.sin(a) * d;
      } else {              // (out from the rim to well past the painting)
        const a = R() * TAU, d = CRATER.R * 0.45 + R() ** 1.4 * 42;
        x = CRATER.x + Math.cos(a) * d; z = CRATER.z + Math.sin(a) * d;
      }
      if (!this.offRoads(x, z, 1.5) || !this.keep(x, z, 0.1)) continue;
      if ([...physics.near(x - 0.4, z - 0.4, x + 0.4, z + 0.4)].some((b) => b.tag !== 'prop')) continue;
      const size = 0.05 + R() * R() * 0.2;
      const y = Math.hypot(x - CRATER.x, z - CRATER.z) < CRATER.reach ? craterHeight(x, z) : physics.groundAt(x, z);
      this.lay('gravel', x, z, size, R, y);
    }
  }

  update(camera) {
    if (!CRATER.k) return;
    this.group.visible = Math.hypot(camera.position.x - CRATER.x, camera.position.z - CRATER.z) < 280;
  }
}
