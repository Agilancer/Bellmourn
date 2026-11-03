// The Bell Tower of the Four Watches, on Bell Knoll in the north-east of the Green Downs.
//
// Who made it, and why: the abbots of Bellmourn, in the cathedral's own pale ashlar, so the hours
// would carry to every farm and fold on the downs: four bells, one for each watch of the day, each
// hung in its own open arch facing its quarter. They built it on a knoll they heaped up in the
// hollow under the cliff (terrain.js KNOLL), over the pit where the bells were cast.
// What happened since: the abbots are gone. An old battle-mage who left Velscour's service, the
// Bellwright, keeps the tower now and rings the bells at noon and midnight, because their ringing
// holds down what Velscour's adepts woke under the knoll (the dungeon, below the iron hatch in the
// hall's floor: phase 3). Moss has climbed the plinth on its shaded north side.
// Its job in play: a landmark seen from all over the downs; the Bellwright's hall (quests); a climb
// that pays (the belfry: the bells close up, and the whole of the downs and the mountain beyond).
// First view: from the path coming up the knoll from the south, the tower against the cliff, the
// biggest bell hanging in the arch that faces you.
// The way out: the door you came in by, and the path down the knoll to the falls road.
//
// The shaft is square (clasping buttresses at the corners, so it never reads as a box), the stair
// climbs its walls in eight flights round an open well you can look up through to the bells, and
// the belfry on top is an octagon with an open arch on each of its four quarters, under a copper
// spire. The bells (templates/models/belltower/bell.glb, made in Blender) swing in their arches;
// BellTower below rings them at noon and midnight.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KNOLL, addPad } from './terrain.js';
import { asset } from './store.js';   // (the models live in Bellmourn2: store.js)

export const TOWER = { x: KNOLL.x, z: KNOLL.z };
const S = 5;           // half the shaft's outer width
const IN = 4;          // half its inner width (walls a metre thick)
const BF = 28;         // the belfry floor, over the hall's floor
const BT = 37;         // the belfry's top (the spire's eaves)
const RB = 5.4;        // the belfry octagon's corner radius (its faces flush with the shaft's walls)
const AP = RB * Math.cos(Math.PI / 8), API = AP - 0.7;   // its faces' outer and inner distance
const W = 1.3;         // the stair's width
const FL = 3.5;        // each flight's rise (14 steps of 0.25)
const AXIS = 33.4;     // the bells' swing axis over the hall's floor
const RA = 3.45;       // and how far out from the middle they hang (close in behind their arches)
// the four bells, one for each watch, the biggest facing the path up the knoll (south)
export const BELLS = [
  { name: 'Mourn', side: 2, D: 2.4 },    // south: the tenor
  { name: 'Vigil', side: 6, D: 2.1 },    // north
  { name: 'Mercy', side: 0, D: 1.9 },    // east
  { name: 'Dawn', side: 4, D: 1.65 },    // west: the treble
];
const BELL_GLB = asset('templates/models/belltower/bell.glb');

/** Level the knoll's crown for the tower (before the ground is built); returns its height. */
export const padBellTower = () => (TOWER.y0 = addPad(TOWER.x, TOWER.z, 11));

/** Build the tower; returns its state (the bells' pivots, filled when their model has loaded). */
export function buildBellTower(ctx, M) {
  const { b, physics, props } = ctx;
  const X = TOWER.x, Z = TOWER.z;
  const y0 = TOWER.y0 ?? padBellTower(), F = y0 + 0.5;   // the pad, and the hall's floor on the plinth
  const P = (lx, ly, lz) => [X + lx, F + ly, Z + lz];  // tower space (metres from the hall floor's middle)
  // the cathedral's own bell tower's grey limestone outside (the same masons), plain ashlar within
  const ashlar = M('stone_01_gray_limestone_1_01', 3.2), lining = M('stone_01_gray_limestone_1_01', 2.6, { tint: 0xd6d2ca });
  const trim = M('stone_01_gray_limestone_1_01', 1.4, { tint: 0xece8de });
  const mossy = M('castle_mossy', 2.2), flags = M('cathedral_graveyard_nave_flagstone', 2.2), boards = M('town_oak_boards', 2);
  const oak = M('ship_01_tarblack_oak', 1), lead = M('met_01_hammered_gunmetal', 1), gilt = M('gold_01_beaten_antique_gold', 0.5);
  const copper = M('castle_roof_copper', 2.6), iron = M('castle_iron', 1.2);
  const box = (a, c, m, o) => b.box(P(...a), P(...c), m, o);

  // ---------------------------------------------------------------- plinth and hall floor
  // (moss on the north face, where the sun never comes)
  // (in four pieces round the mouth of the founders' shaft, 4.2 m square, which the hatch covers:
  // the stair down to the Undershrine spirals round its wall, undershrine.js)
  const SH = { x0: -2.1, x1: 2.1, z0: -3.4, z1: 0.8 }, fl0 = { top: flags, side: trim, bottom: trim };
  box([-5.7, -2, SH.z1], [5.7, 0, 5.7], fl0); box([-5.7, -2, -5.7], [5.7, 0, SH.z0], fl0);
  box([-5.7, -2, SH.z0], [SH.x0, 0, SH.z1], fl0); box([SH.x1, -2, SH.z0], [5.7, 0, SH.z1], fl0);
  { // the collar: the square's corners outside the round shaft, flagged over
    const cx = 0, cz = -1.3, R = 2.0, n = 32, Pp = [], Uu = [], tri = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, c = Math.cos(a), s2 = Math.sin(a), q = 2.1 / Math.max(Math.abs(c), Math.abs(s2));
      Pp.push(P(cx + c * R, -0.005, cz + s2 * R), P(cx + c * q, -0.005, cz + s2 * q));
      Uu.push([X + cx + c * R, Z + cz + s2 * R], [X + cx + c * q, Z + cz + s2 * q]);
      const i = k * 2, j = ((k + 1) % n) * 2;
      tri.push([i, j, i + 1], [j, j + 1, i + 1]);
    }
    b.mesh(flags, Pp, Uu, tri);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) physics.add(P(sx < 0 ? -2.1 : 1.45, -0.3, cz + (sz < 0 ? -2.1 : 1.45)), P(sx < 0 ? -1.45 : 2.1, 0, cz + (sz < 0 ? -1.45 : 2.1)), 'floor');
    // an iron rail round three sides of the mouth (the south open: the stair starts there)
    for (const [ax, az, bx, bz] of [[-2.1, -3.4, 2.1, -3.4], [-2.1, -3.4, -2.1, 0.8], [2.1, -3.4, 2.1, 0.8]]) {
      b.beam(P(ax, 1.0, az), P(bx, 1.0, bz), 0.05, 0.06, iron);
      for (let t = 0; t <= 1.001; t += 0.25) b.beam(P(ax + (bx - ax) * t, 0, az + (bz - az) * t), P(ax + (bx - ax) * t, 1.0, az + (bz - az) * t), 0.04, 0.04, iron);
      physics.add(P(Math.min(ax, bx) - 0.05, 0, Math.min(az, bz) - 0.05), P(Math.max(ax, bx) + 0.05, 1.05, Math.max(az, bz) + 0.05), 'rail');
    }
  }
  box([-5.72, -2, -5.75], [5.72, -0.3, -5.69], mossy, { solid: false });
  box([-1.6, -0.5, 5.7], [1.6, -0.25, 6.5], trim);                                 // the step up to the door

  // ---------------------------------------------------------------- the shaft
  // slit windows over each flight (light on the treads), a lancet for the hall on the east and
  // north, the door on the south. holes: [a0, a1 along the wall from its start, y0, y1]
  const slit = (lap, w) => { const y = (w + lap * 4) * FL + FL / 2 + 0.9; return { a0: S - 0.22, a1: S + 0.22, y0: y, y1: y + 1.7 }; };
  const walls = [
    // [x0, z0, x1, z1, wall index for the stair (which flight runs along it: 0 west .. 3 south), extra holes]
    [-S + 0.5, -S, -S + 0.5, S, 0, []],                                                            // west
    [-S, -S + 0.5, S, -S + 0.5, 1, [{ a0: 6.6, a1: 7.4, y0: 1.2, y1: 3.4 }]],                     // north
    [S - 0.5, -S, S - 0.5, S, 2, [{ a0: 4.6, a1: 5.4, y0: 1.2, y1: 3.4 }]],                       // east
    [-S, S - 0.5, S, S - 0.5, 3, [{ a0: S - 1.2, a1: S + 1.2, y0: 0, y1: 3.6 }]],                 // south: the door
  ];
  for (const [x0, z0, x1, z1, w, extra] of walls) {
    const holes = [slit(0, w), slit(1, w), ...extra].map((h) => ({ ...h, y0: F + h.y0, y1: F + h.y1 }));   // (the wall takes heights, not heights over the floor)
    b.holeyWall(X + x0, Z + z0, X + x1, Z + z1, F - 0.02, F + BF, 1, ashlar, holes);
    // the lining: a skin of plain ashlar on the inner face, with the same openings
    const ix = x0 === x1 ? x0 + Math.sign(-x0) * 0.52 : x0, iz = z0 === z1 ? z0 + Math.sign(-z0) * 0.52 : z0;
    const jx = x0 === x1 ? ix : x1, jz = z0 === z1 ? iz : z1;
    b.holeyWall(X + ix, Z + iz, X + jx, Z + jz, F, F + BF - 0.3, 0.04, lining, holes.map((h) => ({ ...h, y0: h.y0 - 0, y1: h.y1 })), { solid: false, shade: 0.9 });
  }
  // the door's surround: a pointed hood over it, jambs standing proud
  for (const s of [-1, 1]) box([s < 0 ? -1.5 : 1.2, 0, S - 0.02], [s < 0 ? -1.2 : 1.5, 3.6, S + 0.18], trim, { solid: false });
  archRing(b, trim, P(0, 3.6, S + 0.12), [1, 0, 0], [0, 1, 0], 1.45, 1.2, 0.3, 0.26);
  ctx.doors?.add({ hinge: P(-1.2, 0, S - 0.5), along: 0, width: 2.4, height: 3.55, double: true, opens: -1, name: 'bell tower door', design: 'town_mage_star' });
  // clasping buttresses at the corners, stepping back as they rise, each stage under a weathering
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (const [ya, yb, out] of [[-0.02, 9, 0.75], [9, 18.5, 0.5], [18.5, 27, 0.28]]) {
      const lo = (v, s) => (s < 0 ? -S - out : S - 1.15), hi = (v, s) => (s < 0 ? -S + 1.15 : S + out);
      box([lo(0, sx), ya, lo(0, sz)], [hi(0, sx), yb, hi(0, sz)], ashlar);
      box([lo(0, sx) - 0.06, yb - 0.22, lo(0, sz) - 0.06], [hi(0, sx) + 0.06, yb, hi(0, sz) + 0.06], trim, { solid: false });
    }
  }
  // string courses between the buttresses, and the corbel table under the belfry
  for (const [y, t, d] of [[9.2, 0.32, 0.24], [18.7, 0.32, 0.24], [BF - 0.7, 0.7, 0.36]]) {
    box([-S + 1.1, y, -S - d], [S - 1.1, y + t, -S], trim, { solid: false });
    box([-S + 1.1, y, S], [S - 1.1, y + t, S + d], trim, { solid: false });
    box([-S - d, y, -S + 1.1], [-S, y + t, S - 1.1], trim, { solid: false });
    box([S, y, -S + 1.1], [S + d, y + t, S - 1.1], trim, { solid: false });
  }

  // ---------------------------------------------------------------- the stair round the well
  // eight flights of fourteen treads up the walls, cantilevered out of the stone, a landing in each
  // corner, and an oak rail on the open side (its colliders keep you out of the well)
  const flights = [];
  for (let i = 0; i < 8; i++) {
    const w = i % 4, base = i * FL;   // 0: up the west wall going north, 1: north going east, 2: east going south, 3: south going west
    const n = 14, run = (2 * (IN - W)) / n, c = IN - W / 2;
    for (let k = 0; k < n; k++) {
      const top = base + (k + 1) * 0.25, a = -(IN - W) + k * run, e = a + run;
      let lo, hi;
      if (w === 0) { lo = [-IN, top - 0.3, -e]; hi = [-IN + W, top, -a]; }
      else if (w === 1) { lo = [a, top - 0.3, -IN]; hi = [e, top, -IN + W]; }
      else if (w === 2) { lo = [IN - W, top - 0.3, a]; hi = [IN, top, e]; }
      else { lo = [-e, top - 0.3, IN - W]; hi = [-a, top, IN]; }
      box(lo, hi, lining);
      // the rail's collider along the tread's open edge
      const rl = [...lo], rh = [...hi];
      if (w === 0) { rl[0] = -IN + W - 0.04; rh[0] = -IN + W + 0.04; } else if (w === 1) { rl[2] = -IN + W - 0.04; rh[2] = -IN + W + 0.04; }
      else if (w === 2) { rl[0] = IN - W - 0.04; rh[0] = IN - W + 0.04; } else { rl[2] = IN - W - 0.04; rh[2] = IN - W + 0.04; }
      rl[1] = top; rh[1] = top + 1.05;
      physics.add(P(...rl), P(...rh), 'rail');
    }
    flights.push({ w, base, c });
    { const at2 = (u) => (w === 0 ? [-c, -u] : w === 1 ? [u, -c] : w === 2 ? [c, u] : [-u, c]);
      const [sx0, sz0] = at2(-(IN - W)), [sx1, sz1] = at2(IN - W);
      b.beam(P(sx0, base - 0.25, sz0), P(sx1, base + FL - 0.25, sz1), W, 0.45, trim, { up: [0, 1, 0] }); }
    // the rail: posts at either end and a sloped oak handrail between them
    const ends = [[-(IN - W), base], [IN - W, base + FL]];
    const at = (u, wall) => (wall === 0 ? [-IN + W, -u] : wall === 1 ? [u, -IN + W] : wall === 2 ? [IN - W, u] : [-u, IN - W]);
    const [p0, p1] = ends.map(([u, y]) => { const [x, z] = at(u, w); return [x, y, z]; });
    b.beam(P(p0[0], p0[1] + 1.0, p0[2]), P(p1[0], p1[1] + 1.0, p1[2]), 0.09, 0.11, oak);
    for (let k = 0; k <= 4; k++) { const f = k / 4, x = p0[0] + (p1[0] - p0[0]) * f, y = p0[1] + (p1[1] - p0[1]) * f, z = p0[2] + (p1[2] - p0[2]) * f; b.beam(P(x, y, z), P(x, y + 1.05, z), 0.1, 0.1, oak); }
    // the landing at the flight's head, in the corner (the last is the belfry's floor): the flight
    // comes onto it from one side and the next leaves from the other, so it needs no rail
    if (i < 7) {
      const [lx, lz] = [[-1, -1], [1, -1], [1, 1], [-1, 1]][w];
      const x0 = lx < 0 ? -IN : IN - W, z0 = lz < 0 ? -IN : IN - W, top = base + FL;
      box([x0, top - 0.45, z0], [x0 + W, top, z0 + W], lining);
    }
  }
  // torches on the landings, the hall's wall, the belfry stair's head; and outside the door
  const torch = (lx, ly, lz, nx, nz) => props.add('wall_torch', X + lx + nx * 0.02, F + ly, Z + lz + nz * 0.02, Math.atan2(nx, nz));
  torch(IN, 7, -IN + 0.65, -1, 0);           // the north-east landing
  torch(-IN, 14, IN - 0.65, 1, 0);           // the south-west landing
  torch(IN, 21, -IN + 0.65, -1, 0);          // the north-east landing, second turn
  torch(-2.0, 0, S + 0.3, 0, 1); torch(2.0, 0, S + 0.3, 0, 1);   // either side of the door, outside

  // two piers in the hall's back corners carrying the first turn's landings (3.5 and 7 m up)
  for (const [sx, top] of [[-1, FL], [1, 2 * FL]]) {
    const cx = sx * (IN - 0.4), cz = -(IN - 0.4);
    b.cylinder(P(cx, 0, cz), P(cx, top - 0.45, cz), 0.4, 8, lining);
    b.cylinder(P(cx, 0, cz), P(cx, 0.35, cz), 0.5, 8, trim);
    b.cylinder(P(cx, top - 0.75, cz), P(cx, top - 0.45, cz), 0.52, 8, trim, { r1: 0.42 });
    physics.add(P(cx - 0.4, 0, cz - 0.4), P(cx + 0.4, top - 0.45, cz + 0.4), 'wall');
  }

  // ---------------------------------------------------------------- the hall: the Bellwright's study
  // his desk under the north lancet, his books on the east wall, a cot, a brazier, and in the
  // middle of the floor (under the well: you can look straight up through it to the bells) the iron
  // hatch over the old casting pit. The way from the door to the stair's foot is kept clear.
  props.add('bookshelf', X + IN - 0.35, F, Z - 1.8, -Math.PI / 2);   // (either side of the east lancet)
  props.add('bookshelf', X + IN - 0.35, F, Z + 1.1, -Math.PI / 2);
  props.add('bed', X + 3.4, F, Z + 2.9, 0);   // (his cot along the east wall, clear of the doorway)
  props.add('candelabrum', X + 3.2, F, Z - 0.1);   // (before the east lancet: his reading light, in front of him)
  // his witch-light: a violet orb in an iron tripod, cold where a fire would be warm (it lights the
  // hall and him by its own colour: main's light pool takes ctx.witchLights)
  const wl = [-2.75, -2.9];
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; b.beam(P(wl[0] + Math.cos(a) * 0.32, 0, wl[1] + Math.sin(a) * 0.32), P(wl[0] + Math.cos(a) * 0.08, 1.02, wl[1] + Math.sin(a) * 0.08), 0.035, 0.035, iron); }
  b.cylinder(P(wl[0], 1.0, wl[1]), P(wl[0], 1.06, wl[1]), 0.16, 8, iron);
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 2), new THREE.MeshBasicMaterial({ color: 0xe2d6ff }));
  orb.position.set(...P(wl[0], 1.25, wl[1]));
  ctx.scene.add(orb);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex('rgba(235,215,255,1)', 'rgba(150,100,255,0.5)', 'rgba(110,60,255,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  halo.position.copy(orb.position); halo.scale.setScalar(1.6);
  ctx.scene.add(halo);
  (ctx.witchLights ||= []).push(Object.assign([orb.position.x, orb.position.y, orb.position.z, 0.3, true], { color: 0xb8a6ff, witch: true }));
  (ctx.animated ||= []).push((dt, t) => { const k = 0.9 + 0.1 * Math.sin(t * 1.7) * Math.sin(t * 0.6); orb.scale.setScalar(k); halo.scale.setScalar(1.5 * k + 0.1); });

  // ---------------------------------------------------------------- the belfry floor
  // oak boards over the shaft, open over the last flight (it comes up through the floor)
  // (the bell trap: the square the bells were hauled up through, railed, so from the hall you look
  // straight up the well to them)
  const fl = { top: boards, side: oak, bottom: boards }, TR = 1.4;
  box([-IN, BF - 0.3, -IN], [IN, BF, -TR], fl);
  box([-IN, BF - 0.3, -TR], [-TR, BF, IN - W], fl);
  box([TR, BF - 0.3, -TR], [IN, BF, IN - W], fl);
  box([-TR, BF - 0.3, TR], [TR, BF, IN - W], fl);
  box([-IN, BF - 0.3, IN - W], [-(IN - W), BF, IN], fl);
  box([IN - W, BF - 0.3, IN - W], [IN, BF, IN], fl);
  physics.add(P(-(IN - W), BF, IN - W - 0.04), P(IN - W, BF + 1.05, IN - W + 0.04), 'rail');   // the stairwell's rail
  b.beam(P(-(IN - W), BF + 1.0, IN - W), P(IN - W, BF + 1.0, IN - W), 0.08, 0.1, oak);
  for (const [ax, az, bx, bz] of [[-TR, -TR, TR, -TR], [TR, -TR, TR, TR], [TR, TR, -TR, TR], [-TR, TR, -TR, -TR]]) {
    physics.add(P(Math.min(ax, bx) - 0.04, BF, Math.min(az, bz) - 0.04), P(Math.max(ax, bx) + 0.04, BF + 1.05, Math.max(az, bz) + 0.04), 'rail');
    b.beam(P(ax, BF + 1.0, az), P(bx, BF + 1.0, bz), 0.08, 0.1, oak);
    b.beam(P(ax, BF, az), P(ax, BF + 1.05, az), 0.1, 0.1, oak);
  }
  // the Bellwright's lantern, hung on a chain over the trap from the belfry's ceiling: it lights the
  // bells from inside at night, and shows from far off through the arches
  const LH = BF + 6.4;
  b.cylinder(P(0, LH + 0.55, 0), P(0, BT - 0.05, 0), 0.025, 4, iron);
  b.cylinder(P(0, LH - 0.45, 0), P(0, LH - 0.35, 0), 0.32, 8, iron);
  b.cone(X, Z, 0.36, F + LH + 0.45, 0.35, 8, iron);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; b.beam(P(Math.cos(a) * 0.3, LH - 0.35, Math.sin(a) * 0.3), P(Math.cos(a) * 0.3, LH + 0.45, Math.sin(a) * 0.3), 0.03, 0.03, iron); }
  ctx.flames.push([X, F + LH, Z, 0.18]);   // (a lantern's flame: a glow by day, the belfry's light by night)

  // ---------------------------------------------------------------- the belfry
  // an octagon: an open pointed arch on each quarter (a parapet across its foot), a narrow lancet on
  // each diagonal; colliders along every face
  const face = (i) => { const a = i * Math.PI / 4; return { n: [Math.cos(a), Math.sin(a)], t: [-Math.sin(a), Math.cos(a)] }; };
  const half = RB * Math.sin(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const { n, t } = face(i), card = i % 2 === 0;
    const hole = card ? { w: 3.3, sill: 0.9, spring: 5.3, apex: 8.1 } : { w: 0.8, sill: 3.0, spring: 5.6, apex: 6.5 };
    archPanel(b, ashlar, trim, P(0, BF, 0), n, t, AP, API, half, BT - BF, hole);
    void card;
    // colliders: the piers either side of the hole, the parapet under it
    const c = (u, r) => [X + n[0] * r + t[0] * u, Z + n[1] * r + t[1] * u];
    const r = (AP + API) / 2;
    for (const [u0, u1] of [[-half, -hole.w / 2], [hole.w / 2, half]]) { const [ax, az] = c(u0, r), [bx, bz] = c(u1, r); physics.addSeg(ax, az, bx, bz, F + BF, F + BT, 0.7); }
    { const [ax, az] = c(-hole.w / 2, r), [bx, bz] = c(hole.w / 2, r); physics.addSeg(ax, az, bx, bz, F + BF, F + BF + hole.sill, 0.7); }
  }
  // the belfry's ceiling (its spire's floor), the cornice, the pinnacles on the shaft's corners
  octagon(b, oak, P(0, BT - 0.05, 0), API + 0.05, -1);
  octaBand(b, trim, P(0, BT - 0.1, 0), RB + 0.08, RB + 0.4, 0.7);
  octaBand(b, trim, P(0, BF, 0), RB - 0.02, RB + 0.12, 0.35);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * (S - 0.55), cz = sz * (S - 0.55);
    box([cx - 0.45, BF, cz - 0.45], [cx + 0.45, BF + 4.6, cz + 0.45], ashlar, { solid: false });
    box([cx - 0.52, BF + 4.4, cz - 0.52], [cx + 0.52, BF + 4.7, cz + 0.52], trim, { solid: false });
    b.cone(X + cx, Z + cz, 0.62, F + BF + 4.7, 2.6, 4, lead);
  }
  // the copper spire, octagonal like the belfry (its corners over the belfry's), with a gilt ball and
  // a bell-shaped vane on its point
  const SP = 20;
  spire(b, copper, P(0, BT + 0.55, 0), RB + 0.5, SP);
  octagon(b, oak, P(0, BT + 0.55, 0), RB + 0.5, -1);   // (the eaves' underside)
  const tip = BT + 0.55 + SP;
  b.cylinder(P(0, tip - 0.4, 0), P(0, tip + 1.6, 0), 0.06, 6, gilt);
  b.lathe(X, Z, [[0, -0.36], [0.26, -0.25], [0.36, 0], [0.26, 0.25], [0, 0.36]].map(([r, y]) => [r, y + F + tip + 0.35]), 10, gilt);
  b.lathe(X, Z, [[0, 0.62], [0.12, 0.6], [0.16, 0.45], [0.2, 0.12], [0.3, 0]].map(([r, y]) => [r, y + F + tip + 1.3]), 10, gilt);

  // ---------------------------------------------------------------- the bells' frames and the bells
  const pivots = [];
  for (const bell of BELLS) {
    const { n, t } = face(bell.side), D = bell.D, g = 0.72 * D + 0.12;
    // hung from above, as in the old campaniles: an oak bearer spanning the belfry from wall to wall
    // over each bell (bedded in the stone either end), iron hangers down to its gudgeons. Nothing
    // stands on the floor, so the stair can come up through it and you can walk round them all
    const reach = API * Math.SQRT2 - RA - 0.05, top = AXIS + 1.9;
    const e0 = [n[0] * RA - t[0] * reach, n[1] * RA - t[1] * reach], e1 = [n[0] * RA + t[0] * reach, n[1] * RA + t[1] * reach];
    b.beam(P(e0[0], top, e0[1]), P(e1[0], top, e1[1]), 0.34, 0.4, oak, { up: [0, 1, 0] });
    for (const s of [-1, 1]) {
      const px = n[0] * RA + t[0] * s * g, pz = n[1] * RA + t[1] * s * g;
      b.beam(P(px, top - 0.2, pz), P(px, AXIS - 0.08, pz), 0.07, 0.07, iron);
      b.beam(P(px - t[0] * s * 0.1, AXIS - 0.1, pz - t[1] * s * 0.1), P(px + t[0] * s * 0.08, AXIS - 0.1, pz + t[1] * s * 0.08), 0.16, 0.1, iron);
    }
    const pivot = new THREE.Group();
    pivot.position.set(...P(n[0] * RA, AXIS, n[1] * RA));
    pivot.rotation.y = Math.atan2(-t[1], t[0]);   // the model's swing axis (its x) along the face
    const swing = new THREE.Group();
    pivot.add(swing);
    swing.scale.setScalar(D);
    ctx.scene.add(pivot);
    pivots.push({ ...bell, n, pivot, swing, angle: 0, vel: 0, clapper: null, clap: 0 });
  }

  // the place, for its name on screen and the indoor light
  const zone = { x0: X - IN, z0: Z - IN, x1: X + IN, z1: Z + IN, y0: F - 1, y1: F + BF, name: 'The Bell Tower' };   // (the belfry is open air)
  ctx.zones.push(zone);
  ctx.interiors?.push({ ...zone, floor: F, biome: 'downs', held: true });   // (held: the Bellwright's, not the Vigil's: foes.js)

  const state = { x: X, z: Z, y: F, floor: F, top: F + tip + 2, belfry: F + BF, lantern: [X, F + LH, Z], bells: pivots, hatch: [X, Z - 0.4],
    post: [X + 2.7, Z - 2.3, -0.785], ready: null };
  state.ready = loadBells(ctx, pivots);
  return state;
}

/** The bells' model into each pivot (shared geometry; one bronze, one oak, one iron material). */
async function loadBells(ctx, pivots) {
  let gltf;
  try { gltf = await new GLTFLoader().loadAsync(BELL_GLB); } catch (e) { console.warn('bell tower: the bells', e); return; }
  const parts = {};
  gltf.scene.traverse((o) => { if (o.isMesh) parts[o.name.replace(/(_x)?(\.\d+)?$/, '')] = o; });
  const tex = ctx.lib.material('met_04_tarnished_bronze', { tile: 0.7 });
  const bronze = new THREE.MeshPhongMaterial({ map: tex.map || null, normalMap: tex.normalMap || null, normalScale: new THREE.Vector2(0.35, 0.35), color: 0x9c7c4c, specular: 0x6a5232, shininess: 34 });
  const woodT = ctx.lib.material('ship_01_tarblack_oak', { tile: 0.8 });
  const wood = new THREE.MeshPhongMaterial({ map: woodT.map || null, color: 0x9a8a7a, specular: 0x111111, shininess: 6 });
  const ironM = new THREE.MeshPhongMaterial({ color: 0x2a2826, specular: 0x4a4440, shininess: 28 });
  const mats = { bell: bronze, stock_oak: wood, stock_iron: ironM, clapper: ironM };
  for (const p of pivots) {
    for (const [k, m] of Object.entries(mats)) {
      const src = parts[k];
      if (!src) continue;
      const mesh = new THREE.Mesh(src.geometry, m);
      mesh.castShadow = true; mesh.receiveShadow = true;
      if (k === 'clapper') {   // its own pivot, at the crown inside the bell (0.24 under the swing axis)
        const cp = new THREE.Group();
        cp.position.y = -0.24;
        cp.add(mesh);
        p.swing.add(cp);
        p.clapper = cp;
      } else p.swing.add(mesh);
    }
  }
}

// ------------------------------------------------------------------------------------------------
// geometry helpers

/** A soft round halo (a canvas gradient) for an additive sprite. */
function haloTex(c0, c1, c2) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, c0); gr.addColorStop(0.3, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

/** A wall panel of the belfry: outer face at distance ro along n, inner at ri, `half` either side
 * along t, `h` tall from `base`, with a pointed-arch hole {w, sill, spring, apex} (reveals lined). */
function archPanel(b, mat, trimMat, base, n, t, ro, ri, half, h, hole) {
  const [bx, by, bz] = base;
  const at = (u, v, r) => [bx + n[0] * r + t[0] * u, by + v, bz + n[1] * r + t[1] * u];
  const hw = hole.w / 2, rise = hole.apex - hole.spring;
  // the arch's top at u (a two-centred pointed arch from the springing to the apex)
  const R = (hw * hw + rise * rise) / (2 * hw);
  const top = (u) => hole.spring + Math.sqrt(Math.max(0, R * R - (R - hw + Math.abs(u)) ** 2));
  const us = [-half, -hw];
  const N = 10;
  for (let k = 1; k < N; k++) us.push(-hw + (2 * hw * k) / N);
  us.push(hw, half);
  const quad = (a, c, d, e, uv, m = mat) => b.quad(m, a, c, d, e, uv);
  for (const [r, sgn, sh] of [[ro, 1, 1], [ri, -1, 0.7]]) {
    for (let k = 0; k + 1 < us.length; k++) {
      const u0 = us[k], u1 = us[k + 1], inHole = u0 >= -hw - 1e-6 && u1 <= hw + 1e-6;
      const spans = inHole ? [[0, hole.sill, 0, hole.sill], [top(u0), h, top(u1), h]] : [[0, h, 0, h]];
      for (const [va0, va1, vb0, vb1] of spans) {
        const p = [at(u0, va0, r), at(u1, vb0, r), at(u1, vb1, r), at(u0, va1, r)];
        const uv = [[u0, va0], [u1, vb0], [u1, vb1], [u0, va1]];
        if (sgn > 0) b.quad(mat, p[1], p[0], p[3], p[2], [uv[1], uv[0], uv[3], uv[2]].map(([x, y]) => [-x, y]), sh);
        else b.quad(mat, p[0], p[1], p[2], p[3], uv, sh);
      }
    }
  }
  // the reveals: the sill's top, the jambs, the arch's underside, all through the wall's thickness
  const d = ro - ri;
  quad(at(-hw, hole.sill, ri), at(hw, hole.sill, ri), at(hw, hole.sill, ro), at(-hw, hole.sill, ro), [[0, 0], [hole.w, 0], [hole.w, d], [0, d]], trimMat);
  for (const s of [-1, 1]) {
    const a = at(s * hw, hole.sill, ri), c = at(s * hw, hole.sill, ro), e = at(s * hw, hole.spring, ro), f = at(s * hw, hole.spring, ri);
    if (s < 0) quad(a, c, e, f, [[0, 0], [d, 0], [d, hole.spring - hole.sill], [0, hole.spring - hole.sill]], trimMat);
    else quad(c, a, f, e, [[0, 0], [d, 0], [d, hole.spring - hole.sill], [0, hole.spring - hole.sill]], trimMat);
  }
  for (let k = 1; k + 1 < us.length - 1; k++) {
    const u0 = us[k], u1 = us[k + 1];
    if (u0 < -hw - 1e-6 || u1 > hw + 1e-6) continue;
    const a = at(u0, top(u0), ri), c = at(u1, top(u1), ri), e = at(u1, top(u1), ro), f = at(u0, top(u0), ro);
    quad(f, e, c, a, [[u0, 0], [u1, 0], [u1, d], [u0, d]], trimMat);
  }
  // a moulded ring round the arch on the outside
  archRing(b, trimMat, at(0, hole.spring, ro + 0.02), [t[0], 0, t[1]], [0, 1, 0], hw + 0.22, rise + 0.22, 0.24, 0.12, n);
}

/** A pointed arch's moulding: a band of width `bw` standing `depth` proud, following the arch of
 * half-width hw and rise `rise` from `c` (its springing line's middle), in the plane of u (along) and v (up). */
function archRing(b, mat, c, u, v, hw, rise, bw, depth, n = null) {
  const out = n ? [n[0], 0, n[1]] : [0, 0, 1];   // (the outward normal: for the door, +z)
  const R = (hw * hw + rise * rise) / (2 * hw);
  const pt = (s, k, r) => {   // side s, k 0..1 from springing to apex, at radius offset r
    const a0 = 0, a1 = Math.acos((R - hw) / R), a = a0 + (a1 - a0) * k;
    const cu = -s * (R - hw);
    const pu = cu + s * Math.cos(a) * (R + r), pv = Math.sin(a) * (R + r);
    return [c[0] + u[0] * pu + v[0] * pv, c[1] + u[1] * pu + v[1] * pv, c[2] + u[2] * pu + v[2] * pv];
  };
  const N = 8;
  for (const s of [-1, 1]) for (let k = 0; k < N; k++) {
    const a = pt(s, k / N, 0), c2 = pt(s, (k + 1) / N, 0), d = pt(s, (k + 1) / N, bw), e = pt(s, k / N, bw);
    const off = (p) => [p[0] + out[0] * depth, p[1], p[2] + out[2] * depth];
    const q = s > 0 ? [off(a), off(c2), off(d), off(e)] : [off(c2), off(a), off(e), off(d)];
    b.quad(mat, q[0], q[1], q[2], q[3], [[0, 0], [0.3, 0], [0.3, bw], [0, bw]]);
    // its outer edge's return to the wall
    const r0 = s > 0 ? [d, e] : [e, d];
    b.quad(mat, r0[0], r0[1], off(r0[1]), off(r0[0]), [[0, 0], [0.3, 0], [0.3, depth], [0, depth]], 0.8);
  }
}

/** A flat regular octagon (its corners at 22.5 + 45k degrees), facing up (1) or down (-1). */
function octagon(b, mat, c, r, up = 1) {
  const pts = Array.from({ length: 8 }, (_, k) => { const a = Math.PI / 8 + k * Math.PI / 4; return [c[0] + Math.cos(a) * r, c[2] + Math.sin(a) * r]; });
  const pos = [[c[0], c[1], c[2]], ...pts.map(([x, z]) => [x, c[1], z])], uv = pos.map(([x, , z]) => [x, z]), tris = [];
  for (let k = 0; k < 8; k++) tris.push(up > 0 ? [0, 1 + ((k + 1) % 8), 1 + k] : [0, 1 + k, 1 + ((k + 1) % 8)]);
  b.mesh(mat, pos, uv, tris);
}

/** An octagonal band (a cornice): from radius r0 out to r1, h tall, with its top and underside. */
function octaBand(b, mat, c, r0, r1, h) {
  for (let k = 0; k < 8; k++) {
    const a0 = Math.PI / 8 + k * Math.PI / 4, a1 = a0 + Math.PI / 4;
    const p = (a, r, y) => [c[0] + Math.cos(a) * r, c[1] + y, c[2] + Math.sin(a) * r];
    const L = 2 * r1 * Math.sin(Math.PI / 8);
    b.quad(mat, p(a1, r1, 0), p(a0, r1, 0), p(a0, r1, h), p(a1, r1, h), [[0, 0], [L, 0], [L, h], [0, h]]);
    b.quad(mat, p(a0, r0, h), p(a0, r1, h), p(a1, r1, h), p(a1, r0, h), [[0, 0], [r1 - r0, 0], [r1 - r0, L], [0, L]]);
    b.quad(mat, p(a1, r0, 0), p(a1, r1, 0), p(a0, r1, 0), p(a0, r0, 0), [[0, 0], [r1 - r0, 0], [r1 - r0, L], [0, L]], 0.7);
  }
}

/** The octagonal spire: base radius r at c (its corners over the belfry's), apex h above, the
 * faces slightly hollowed (a broach's sweep) so it doesn't read as a cone. */
function spire(b, mat, c, r, h) {
  const pos = [], uv = [], tris = [];
  const rows = 6;
  for (let k = 0; k < 8; k++) {
    const a0 = Math.PI / 8 + k * Math.PI / 4, a1 = a0 + Math.PI / 4;
    const base = pos.length;
    for (let j = 0; j <= rows; j++) {
      const f = j / rows, rr = r * (1 - f) * (1 - 0.1 * Math.sin(f * Math.PI)), y = c[1] + h * f;
      for (const a of [a0, a1]) pos.push([c[0] + Math.cos(a) * rr, y, c[2] + Math.sin(a) * rr]);
      const w = 2 * rr * Math.sin(Math.PI / 8), sl = Math.hypot(r, h) * f;
      uv.push([-w / 2, sl], [w / 2, sl]);
    }
    for (let j = 0; j < rows; j++) { const i = base + j * 2; tris.push([i, i + 2, i + 1], [i + 1, i + 2, i + 3]); }
  }
  b.mesh(mat, pos, uv, tris);
}

// ------------------------------------------------------------------------------------------------
// noon and midnight: the four bells rung

const RING = { rise: 1.2, hold: 6.5, fall: 7.5, amp: 0.95, period: 2.4 };   // the swing's envelope (s) and size (rad)
const CROWS = 28;

/** The bells rung at noon and at midnight, heard all over the land: they swing up in rounds (the
 * treble first, the tenor last), the title's peal plays three seconds and trails away, the crows that
 * roost in the belfry burst out of its arches and wheel round the spire, and a ring of pale violet
 * light runs out from the knoll across the country. */
export class Chimes {
  /** opts: { sfx, particles, onRing(kind) } */
  constructor(ctx, tower, opts = {}) {
    this.ctx = ctx; this.t = tower; this.o = opts;
    this.last = null; this.time = -1; this.kind = null;
    // the crows: a V of two wings each, flapped by flipping their instance's height
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, -0.34, 0.1, -0.02, 0, 0, -0.08, 0, 0, 0.18, 0, 0, -0.08, 0.34, 0.1, -0.02, 0, 0, 0.18, 0.05, 0, -0.22, -0.05, 0, -0.22], 3));
    g.computeVertexNormals();
    const crows = this.crows = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x0b0a0c, side: THREE.DoubleSide }), CROWS);
    crows.frustumCulled = false;
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < CROWS; i++) crows.setMatrixAt(i, z);
    ctx.scene.add(crows);
    this.birds = Array.from({ length: CROWS }, (_, i) => ({ a: (i / CROWS) * Math.PI * 2 + Math.random() * 0.2, r: 0, y: 0, sp: 0.55 + Math.random() * 0.35,
      out: 10 + Math.random() * 22, lift: 6 + Math.random() * 16, flap: Math.random() * 6, delay: Math.random() * 0.9, dir: Math.random() < 0.85 ? 1 : -1 }));
    // the ring of light: a band that runs out over the ground from the knoll, following its rise and
    // fall (rebuilt each frame from the land's height): a bright leading edge with a short wall of
    // light standing on it, fading away behind
    const N = this.waveN = 160, pos = new Float32Array(N * 3 * 3), col = new Float32Array(N * 3 * 3), idx = [];
    for (let i = 0; i < N; i++) {
      const o = i * 9;
      col.set([0, 0, 0, 0.95, 0.8, 1.0, 0.35, 0.22, 0.6], o);        // behind (dark), the edge (bright), the wall's top (dim)
      const j = (i + 1) % N, A = i * 3, B = j * 3;
      idx.push(A, B, A + 1, B, B + 1, A + 1, A + 1, B + 1, A + 2, B + 1, B + 2, A + 2);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); wg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    wg.setIndex(idx);
    this.wave = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0 }));
    this.wave.frustumCulled = false; this.wave.renderOrder = 5;
    this.layWave(2);
    ctx.scene.add(this.wave);
    // the lantern's glow in the belfry: a soft warm halo that shows through the arches from far off
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g2 = cv.getContext('2d'), gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(0.25, 'rgba(255,170,90,0.55)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.2 }));
    this.glow.position.set(...tower.lantern); this.glow.scale.setScalar(7);
    ctx.scene.add(this.glow);
    this.pulse = 0;
  }

  /** Each frame: the clock watched (a ring when it passes noon or midnight on its own), the bells
   * swung, the crows flown, the light run out. `ear`: where you hear from; `under`: 0..1 underground. */
  update(dt, hour, ear, under = 0, night = 0) {
    this.pulse = Math.max(0, this.pulse - dt * 1.8);
    this.glow.material.opacity = 0.08 + 0.75 * night + this.pulse * 0.5;
    this.glow.scale.setScalar(6 + 3 * night + this.pulse * 3);
    if (this.last != null && hour != null) {
      const d = hour - this.last;
      if (d > 0 && d < 0.5 && this.last < 12 && hour >= 12) this.ring('noon', ear, under);
      else if (d < 0 && hour + 24 - this.last < 0.5) this.ring('midnight', ear, under);
    }
    this.last = hour;
    if (this.time < 0) return;
    this.time += dt;
    const T = this.time, { rise, hold, fall, amp, period } = RING;
    const env = T < rise ? T / rise : T < rise + hold ? 1 : Math.max(0, 1 - (T - rise - hold) / fall);
    this.t.bells.forEach((b, i) => {
      const k = Math.max(0, T - (3 - i) * 0.42);   // (rounds: the treble first; the tenor, Mourn, first in the list, last)
      const e = Math.max(0, Math.min(1, k / rise)) * (T < rise + hold ? 1 : env);
      const ang = amp * e * Math.sin((k / period) * Math.PI * 2);
      b.angle = ang;
      b.swing.rotation.x = ang;
      // the clapper a beat behind, striking the lip as the bell turns
      b.clap += (-ang * 0.75 - b.clap) * Math.min(1, dt * 6);
      if (b.clapper) b.clapper.rotation.x = b.clap - ang * 0.15;
      // a puff of the belfry's dust at each stroke (twice a swing)
      const s = Math.sign(Math.cos((k / period) * Math.PI * 2));
      if (b.lastS != null && s !== b.lastS && e > 0.35) this.pulse = Math.min(1, this.pulse + 0.35);
      if (b.lastS != null && s !== b.lastS && e > 0.35) this.o.particles?.burst(b.swing.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(b.n[0] * 1.6, -2.2, b.n[1] * 1.6)),
        [new THREE.Color('#e2d8c4'), new THREE.Color('#bcae94')], 34, { speed: 1.8, size: 0.13, grav: 2.2, drag: 1.1, life: 3.2 });
      b.lastS = s;
    });
    this.flyCrows(dt, T);
    // the light: out at 110 m/s for 6 s, bright, then gone
    const R = 8 + T * 110, a = T < 0.25 ? T / 0.25 : Math.max(0, 1 - (T - 0.25) / 5.75);
    if (a > 0.001) this.layWave(R);
    this.wave.material.opacity = a * 0.7;
    this.wave.visible = a > 0.001;
    if (T > rise + hold + fall + 6) { this.time = -1; this.wave.material.opacity = 0; this.layWave(2); }
  }

  /** Ring them now ('noon' or 'midnight'; the debug menu and the tests call this). */
  ring(kind = 'noon', ear = null, under = 0) {
    this.time = 0; this.kind = kind;
    for (const c of this.birds) { c.r = 0; c.y = 0; c.t = -c.delay; }
    for (const b of this.t.bells) b.lastS = null;
    let near = 0, pan = 0;
    if (ear) {
      const dx = this.t.x - ear.x, dz = this.t.z - ear.z, d = Math.hypot(dx, dz);
      near = Math.max(0, 1 - d / 900) ** 1.6;
      pan = d > 3 ? Math.max(-1, Math.min(1, (dx * (ear.rx ?? 0) + dz * (ear.rz ?? 0)) / d)) * Math.min(1, d / 40) * 0.6 : 0;
    }
    this.o.sfx?.towerBells?.({ near, pan, under });
    this.o.onRing?.(kind, near);
  }

  /** The band of light laid on the ground at radius R round the knoll. */
  layWave(R) {
    const pos = this.wave.geometry.attributes.position, a = pos.array, N = this.waveN, ph = this.ctx.physics, { x, z } = this.t;
    const back = Math.min(R * 0.6, 14);
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2, c = Math.cos(th), s2 = Math.sin(th);
      const ex = x + c * R, ez = z + s2 * R, bx = x + c * (R - back), bz = z + s2 * (R - back);
      const ey = ph.groundAt(ex, ez) + 0.25, by = ph.groundAt(bx, bz) + 0.25;
      a.set([bx, by, bz, ex, ey, ez, ex, ey + 3.2, ez], i * 9);
    }
    pos.needsUpdate = true;
  }

  flyCrows(dt, T) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const top = this.t.belfry + 6, { x, z } = this.t;
    const gone = T > 15;
    this.birds.forEach((c, i) => {
      c.t += dt;
      if (c.t < 0 || gone) { this.crows.setMatrixAt(i, m.makeScale(0, 0, 0)); return; }
      // out of the arches, then wheeling round the spire, wider and higher, then away over the downs
      const u = c.t;
      c.r = Math.min(c.out, 3.5 + u * 9) + Math.max(0, u - 8) * 14;
      c.y = Math.min(c.lift, u * 4) + Math.max(0, u - 8) * 3;
      c.a += dt * c.dir * c.sp * (u < 8 ? 1 : 0.4) * (14 / Math.max(6, c.r));
      p.set(x + Math.cos(c.a) * c.r, top + c.y + Math.sin(u * 1.7 + i) * 0.8, z + Math.sin(c.a) * c.r);
      e.set(0, -c.a - (c.dir > 0 ? 0 : Math.PI), 0.35 * c.dir); q.setFromEuler(e);
      c.flap += dt * (11 + (i % 3));
      const fl = Math.cos(c.flap);
      s.set(1.15, fl * 1.3, 1.15);
      this.crows.setMatrixAt(i, m.compose(p, q, s));
    });
    this.crows.instanceMatrix.needsUpdate = true;
  }
}
