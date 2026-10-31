// The Bellmourn Catacombs: everything under the cathedral, down the stair in its office. Built to
// docs/DUNGEON_BUILDING.md: one spine going down in four stages, a few branches off it that each pay,
// every space made by someone for something, and the dead placed where they would be.
//
//   Stage I, 14 m down: the Bell Crypt, where the bell-ringers lie (arrival). West, the Ringers'
//     Reliquary (a branch: their relics). North, the Gallery of the Poor: burial niches in its walls,
//     the poor in the earth of its floor, and they claw out of it as you pass. At its crossing a
//     side passage runs out to the Sexton's Overlook, high on the wall of the gulf (a vista).
//   Stage II, 19 m: the Sexton's Stair down to the Mourning Gulf (gulf.js) and its rope bridge
//     (bridge.js). The dead waiting on the far side come over as soon as you step onto it.
//   Stage III, 21 m: the Hall of the Founders, round the Founders' Tomb, a stepped monument with a
//     grand stair up two faces. East, the Plague Ossuary (a branch: treasure). North, the Stair
//     Hall: three long flights down under a high vault.
//   Stage IV, 37 m: the Deep Undercroft. The Bell Shrine, round the First Bell of Bellmourn hung
//     over a plinth with a stair spiralling up it (ring it: everything down here hears). West, the
//     Charnel (a branch). East, the Abbots' Gallery, their effigy tombs along it, to Cindermaw's
//     Tomb: the deepest place, a round arena with a sunken floor.
//
// buildCatacombs(ctx) returns the three places below (ctx.unders: the Undercroft, the Deep
// Undercroft and the Gulf's floor), who waits in them, and the frame update (the bridge, the bell,
// the ambush on the bridge).
import * as THREE from 'three';
import { Mason, ring, chamfered } from './mason.js';
import { Gulf, BY, BX, NEAR_BACK, FAR_BACK, OVER_MOUTH, zs, zn, zc, hw, ledgeStep, LEDGE, LEDGE_N, LEDGE_RUN, floorY, STUBS, stubMouth } from './gulf.js';
import { RopeBridge } from './bridge.js';
import { makeUnique } from './uniques.js';

const DEG = Math.PI / 180;
const MIASMA = new THREE.Color(0.36, 0.55, 0.12);
const Y1 = -14, Y3 = -21, Y4 = -37, Y5 = -40;
const TRIB = -32;                // the tribune high on the Bell Shrine's south wall, where the Stair Hall comes in

// the surfaces, by what each place was built of
const STONE = {
  crypt: { floor: 'catacombs_crypt_limestone', wall: 'catacombs_wall_funerary_chapel', roof: 'castle_keep_pale_keep_limestone', trim: 'castle_keep_ivory_chapel_marble' },
  poor: { floor: 'catacombs_grave_gravel', wall: 'catacombs_wall_crypt_ashlar', roof: 'catacombs_slate_bricks', trim: 'catacombs_burial_terracotta', step: 'catacombs_crypt_limestone' },
  reliquary: { floor: 'catacombs_mortuary_tesserae', wall: 'catacombs_wall_crypt_ashlar', roof: 'castle_keep_pale_keep_limestone', trim: 'castle_keep_ivory_chapel_marble' },
  sexton: { floor: 'catacombs_charcoal_flagstone', wall: 'catacombs_wall_crypt_ashlar', roof: 'castle_basalt', trim: 'catacombs_slate_bricks', step: 'catacombs_charcoal_flagstone' },
  founders: { floor: 'castle_keep_royal_inlay_slab', wall: 'catacombs_wall_crypt_ashlar_back', roof: 'castle_keep_sootdark_great_hall', trim: 'castle_keep_pale_keep_limestone', step: 'castle_keep_weathered_gatehouse_flag' },
  plague: { floor: 'catacombs_ossuary_aggregate', wall: 'catacombs_wall_ossuary_niches', roof: 'castle_soot', trim: 'catacombs_burial_terracotta' },
  stairhall: { floor: 'castle_keep_weathered_gatehouse_flag', wall: 'catacombs_wall_drowned_crypt', roof: 'castle_keep_bluegray_bastion_slate', trim: 'castle_keep_pale_keep_limestone', step: 'castle_keep_charcoal_guardstone' },
  shrine: { floor: 'castle_keep_charcoal_guardstone', wall: 'catacombs_wall_funerary_chapel_back', roof: 'catacombs_black_basalt', trim: 'met_04_tarnished_bronze' },
  abbots: { floor: 'catacombs_weathered_cobbles', wall: 'catacombs_wall_sealed_cells_back', roof: 'castle_soot', trim: 'castle_keep_sootdark_great_hall', step: 'catacombs_black_basalt' },
  charnel: { floor: 'catacombs_ossuary_aggregate', wall: 'catacombs_wall_drowned_crypt_back', roof: 'castle_soot', trim: 'catacombs_burial_terracotta' },
  tomb: { floor: 'castle_keep_sootdark_great_hall', wall: 'catacombs_wall_drowned_crypt', roof: 'catacombs_black_basalt', trim: 'met_04_tarnished_bronze', step: 'catacombs_black_basalt', char: true },
};

export function buildCatacombs(ctx) {
  const { lib, b, props, physics } = ctx;
  const sb = ctx.stairBottom;            // the foot of the cathedral's stair (x 5, z -113.3)
  const mason = new Mason(ctx, { x0: -52, z0: -412, x1: 66, z1: -108 });
  const M = (id, tile, o) => mason.mat(id, tile, o);
  const has = (id) => lib.surf.has(id);
  for (const k of Object.keys(STONE)) for (const [part, id] of Object.entries(STONE[k])) if (!has(id)) STONE[k][part] = 'castle_basalt';

  // ---- how things are set about (props, the 3D scatter, flames that light the way)
  const flames = ctx.flames;
  const sprite = (id, x, y, z, sc = 1, rot = null) => { if (lib.spr.has(id)) { ctx.scatter.place(id, x, y, z, sc, rot); lib.usedSprites.add(id); } };
  // (a burning thing: its model lights its own flame if it has one; only one without gets ours)
  const burner = (id, x, y, z, sc = 1, size = 0.42) => { const n = flames.length; sprite(id, x, y, z, sc); if (flames.length > n) return; const s = lib.sprite(id); if (s) flames.push([x, y + s.height_m * sc * 0.92 + 0.15, z, size, 1]); };
  const torch = (x, y, z, nx, nz) => props.add('wall_torch', x + nx * 0.02, y, z + nz * 0.02, Math.atan2(nx, nz));
  // torches round a room's wall (none in front of an opening), `every` metres apart
  const roomTorches = (r, every, y = r.y, skip = null) => {
    for (const ed of r.edges) {
      for (let t = every / 2; t < ed.L - 0.6; t += every) {
        const o = r.openings.find((op) => op.e === r.edges.indexOf(ed) && Math.abs(op.t - t) < op.w / 2 + 1.2);
        if (o) continue;
        const x = ed.a[0] + ed.ux * t, z = ed.a[1] + ed.uz * t;
        if (skip?.(x, z)) continue;
        torch(x, y, z, ed.nx, ed.nz);
      }
    }
  };
  // along a passage's walls, alternating sides (on its flats only)
  const passTorches = (p, every, phase = 0, skip = null) => {
    const pts = p.pts;
    let d = phase, side = 1;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az, ay] = pts[i], [bx, bz, by] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      for (; d < L - 0.5; d += every, side = -side) {
        if (skip?.(ax + ux * d, az + uz * d)) continue;
        if (Math.abs(by - ay) > 0.01 && d > 0.5) {   // on a flight: the torch sits at that step's height
          const k = Math.floor(d / (L / Math.round(Math.abs(by - ay) / 0.25)));
          torch(ax + ux * d + -uz * side * (p.w / 2), ay + (by - ay) * Math.min(1, (k + 1) / Math.round(Math.abs(by - ay) / 0.25)), az + uz * d + ux * side * (p.w / 2), uz * side, -ux * side);
          continue;
        }
        if (d < 0.8) continue;
        torch(ax + ux * d + -uz * side * (p.w / 2), ay, az + uz * d + ux * side * (p.w / 2), uz * side, -ux * side);
      }
      d -= L;
    }
  };


  // ======================================================== stage I: the Ringers' Crypt (14 m down)
  // The bell-ringers' crypt: a domed rotunda at the foot of the stair, its wall a ring of carved
  // chapel panels, mourners kneeling round it. You arrive facing north, where the gallery goes on.
  const crypt = mason.room({ name: "The Ringers' Crypt", dg: 'upper', poly: ring(5, -125, 8.5, 16, 78.75 * DEG), y: Y1, wallH: 6.5,
    roof: { kind: 'dome', rise: 4.6 }, mats: STONE.crypt, torches: 5.5 });
  const entry = mason.passage({ name: "The Ringers' Crypt", dg: 'upper', pts: [[sb.x, sb.z, Y1], [5, -116.66, Y1]], w: 2.4, spring: 3.0, to: crypt, mats: STONE.crypt, ribs: 0, torches: 0 });
  // (over the foot of the flight, where the stair's own vault ends: a header of stone)
  b.box([sb.x - 1.3, -10.6, sb.z - 0.25], [sb.x + 1.3, -9.2, sb.z + 0.05], M('castle_basalt', 2), { solid: false, shade: 0.8 });

  // the Ringers' Reliquary (branch: reward): an apsidal chapel west of the crypt, a short nave to
  // an altar in its apse, the ringers' relic on the altar, two of them lying guard
  const apse = Array.from({ length: 9 }, (_, i) => { const a = Math.PI / 2 + i * Math.PI / 8; return [-19.5 + Math.cos(a) * 3.2, -127 + Math.sin(a) * 3.2]; });
  const reliq = mason.room({ name: "The Ringers' Reliquary", dg: 'upper', poly: [[-12, -130.2], [-12, -123.8], [-19.5, -123.8], ...apse.slice(1, 8), [-19.5, -130.2]], y: Y1, wallH: 5.2,
    roof: { kind: 'dome', rise: 2.6, spine: [[-14.6, -127], [-19.5, -127]] }, mats: STONE.reliquary, torches: 0 });
  mason.passage({ name: "The Ringers' Reliquary", dg: 'upper', pts: [[-3.34, -125, Y1], [-6.5, -125, Y1], [-9.2, -127, Y1], [-12, -127, Y1]], w: 3, spring: 3.0, from: crypt, to: reliq, mats: STONE.reliquary, ribs: 3.2, torches: 0 });

  // the Gallery of the Poor: a long gallery that bends hard twice, the niches stacked in its walls,
  // the floor earth where the poor were laid in rows. Its crossing (an octagon) is where the
  // overlook leaves.
  // (the loculi: three tiers of them cut 0.75 m into each wall, a body bound in its shroud on each
  // shelf, some only bones now, some empty, robbed or never filled)
  const shroudM = M('cloth_04_aged_cream_linen', 0.8, { tint: 0xb8ad98 }), cordM = M('cloth_02_stitched_charcoal', 0.8, { tint: 0x6a5e4a }), boneM = M('castle_keep_ivory_chapel_marble', 0.4, { tint: 0xb4aa92 });
  const NICHES = { w: 1.7, pier: 0.45, depth: 0.75, margin: 0.7, tiers: [[0.75, 0.62], [1.75, 0.62], [2.75, 0.62]],
    back: M('castle_soot', 1, { tint: 0x1a1612 }), shelf: M('catacombs_charcoal_flagstone', 1), inner: M(STONE.poor.wall, 2, { tint: 0x8a8078 }),
    fill: (at, u, n, k, seg, sgn, j) => {
      const kind = (seg * 7 + j * 3 + k * 2 + (sgn > 0 ? 1 : 0)) % 6, rot = Math.atan2(u[0], u[1]), sd = seg * 31 + j * 7 + k * 3 + (sgn > 0 ? 1 : 0);
      if (kind === 5) return;
      b.place(at[0], at[1], at[2], rot, 1, (o) => {
        if (kind < 4) {                                              // bound in a shroud (one long tapering bundle), corded
          o.blob([0, 0.14, -0.04], [0.2, 0.14, 0.7], shroudM, { seed: sd, floor: 0, jitter: 0.04 });
          o.blob([0, 0.12, 0.56], [0.14, 0.12, 0.22], shroudM, { seed: sd + 1, floor: 0, jitter: 0.03 });
          for (const zz of [-0.5, -0.18, 0.16, 0.46]) { const f = Math.sqrt(Math.max(0.05, 1 - (zz / 0.74) ** 2)); o.box([-0.2 * f - 0.012, 0.01, zz - 0.024], [0.2 * f + 0.012, 0.28 * f + 0.012, zz + 0.024], cordM, { solid: false }); }
        } else {                                                     // the shroud rotted away: bones
          o.blob([0.05, 0.1, 0.58], [0.1, 0.09, 0.11], boneM, { seed: sd, floor: 0 });
          for (const [x0, z0, x1, z1] of [[-0.08, -0.62, -0.02, 0.0], [0.06, -0.6, 0.1, -0.02], [-0.1, 0.05, 0.12, 0.3], [0.02, 0.12, 0.16, 0.42]]) o.cylinder([x0, 0.025, z0], [x1, 0.025, z1], 0.024, 5, boneM);
        }
      }, { solid: false });
      void n;
    } };
  const CR = { x: 10.5, z: -156 };
  const crossing = mason.room({ name: 'The Gallery of the Poor', dg: 'upper', poly: ring(CR.x, CR.z, 5.6, 8, -22.5 * DEG), y: Y1, wallH: 7,
    roof: { kind: 'dome', rise: 3.6 }, mats: STONE.poor, torches: 0 });
  const gallery1 = mason.passage({ name: 'The Gallery of the Poor', dg: 'upper', pts: [[5, -133.34, Y1], [5, -138, Y1], [10.5, -146, Y1], [CR.x, -150.83, Y1]],
    w: 5, spring: 4.0, from: crypt, to: crossing, mats: STONE.poor, ribs: 4.2, torches: 0, niches: NICHES });
  const gallery2 = mason.passage({ name: 'The Gallery of the Poor', dg: 'upper', pts: [[CR.x, -161.17, Y1], [CR.x, -163.5, Y1], [15, -169.5, Y1], [12, -175, Y1], [12, -178, Y1]],
    w: 5, spring: 4.0, from: crossing, mats: STONE.poor, ribs: 4.2, torches: 0, niches: NICHES });
  // the Sexton's Overlook (branch: vista): out along the crossing's east side to a lip high on the
  // gulf's south wall, where the sexton watched his bridge
  const overPass = mason.passage({ name: "The Sexton's Overlook", dg: 'upper', pts: [[15.67, CR.z, Y1], [19, CR.z, Y1], [25.5, -166, Y1], [31, -182, Y1], [OVER_MOUTH.x, OVER_MOUTH.z - 0.3, Y1]],
    w: 3, spring: 3.0, from: crossing, mats: STONE.sexton, ribs: 3.5, torches: 0 });

  // ======================================================== stage II: down to the gulf (19 m)
  // the Sexton's Stair: wide, its vault lifted a metre over the flight, the gallery's arch at its head
  const sexton = mason.passage({ name: "The Sexton's Stair", dg: 'upper', pts: [[12, -178, Y1], [12, -188, BY], [12, NEAR_BACK - 0.3, BY]],
    w: 5, spring: 5.2, mats: STONE.sexton, ribs: 0, torches: 0, capStart: { w: 5, spring: 4.0 } });

  // ======================================================== stage III: the Hall of the Founders (21 m)
  const far = mason.passage({ name: 'The Hall of the Founders', dg: 'upper', pts: [[BX, FAR_BACK + 0.3, BY], [BX, -240, BY], [14.5, -242.5, BY], [14.5, -246.5, Y3], [12, -249, Y3], [12, -250, Y3]],
    w: 3.2, spring: 2.5, mats: STONE.founders, ribs: 2.6, torches: 0 });
  const HALL = { x: 12, z: -272 };
  const MON = { x: 12, z: -278.5 };                                // the tomb stands back from the door: a 10 m forecourt before its stair
  const hall = mason.room({ name: 'The Hall of the Founders', dg: 'upper', poly: chamfered(HALL.x, HALL.z, 34, 44, 9), y: Y3, wallH: 10,
    roof: { kind: 'dome', rise: 7, spine: [[HALL.x, HALL.z + 5], [HALL.x, HALL.z - 5]] }, mats: STONE.founders, torches: 0 });
  far.to = hall; mason.openInto(hall, far, [BX, -250]);
  // the Founders' Tomb: three octagonal tiers, one grand stair up its south face with a landing
  // half way, a canopy over the founders' sarcophagus on top (12 m in all)
  const T = [[8, 2.5], [5.25, 5], [3, 7]];                        // [the tier's apothem, the height of its top over the floor]
  const inOct = (x, z, a) => { const dx = Math.abs(x - MON.x), dz = Math.abs(z - MON.z); return dx <= a && dz <= a && (dx + dz) * Math.SQRT1_2 <= a; };
  const tierAt = (x, z) => { let h = null; for (const [a, ht] of T) if (inOct(x, z, a)) h = Y3 + ht; return h; };
  const SW = 1.9, FOOT = MON.z + 3 + 15.5;                         // the stair's half width; its foot
  const stairUp = (z) => {                                         // 14 steps, a 1.5 m landing, 14 more
    const t = FOOT - z;
    if (t < 0 || t > 15.5) return null;
    const k = t < 7 ? Math.floor(t / 0.5) + 1 : t < 8.5 ? 14 : Math.min(28, 14 + Math.floor((t - 8.5) / 0.5) + 1);
    return Y3 + k * 0.25;
  };
  mason.feature(hall, [MON.x - 9, MON.z - 9, MON.x + 9, FOOT + 0.5], (x, z) => {
    if (Math.abs(x - MON.x) <= SW) { const st = stairUp(z); if (st != null) return st; }   // (cut through the tiers)
    return tierAt(x, z);
  }, (m) => monument(m));

  // the Plague Ossuary (branch: treasure), east off the hall: the plague years' dead, a long low
  // vault walled in skulls, a chandelier of bones over them
  // (its door end square to the passage, chamfered; its far end a round apse)
  const apseE = Array.from({ length: 7 }, (_, i) => { const t = -Math.PI / 2 + (i + 1) * Math.PI / 8; return [51 + Math.cos(t) * 3.5, -277 + Math.sin(t) * 3.5]; });
  const plague = mason.room({ name: 'The Plague Ossuary', dg: 'upper', poly: [[40, -279], [42, -280.5], [51, -280.5], ...apseE, [51, -273.5], [42, -273.5], [40, -275]], y: Y3, wallH: 4.6,
    roof: { kind: 'dome', rise: 2.4, spine: [[44.5, -277], [51, -277]] }, mats: STONE.plague, torches: 0 });
  mason.passage({ name: 'The Plague Ossuary', dg: 'upper', pts: [[29, -272, Y3], [32.5, -272, Y3], [36.5, -277, Y3], [40, -277, Y3]], w: 3, spring: 3.2, from: hall, to: plague, mats: STONE.plague, ribs: 3, torches: 0 });

  // the Stair Hall: the grand descent to the Deep Undercroft. Three flights, each turning at a
  // round landing bay with braziers (north, then north-west, then north-east), the vault 10 m over
  // the nosings, coming out high on the Bell Shrine's south wall on a tribune, face to face with the bell.
  const shrine = mason.room({ name: 'The Bell Shrine', dg: 'deep', poly: ring(12, -356, 15, 24, 82.5 * DEG), y: Y4, wallH: 13,
    roof: { kind: 'dome', rise: 9 }, mats: STONE.shrine, torches: 0 });
  // (one passage: each flight ends on a 4 m landing where the stair turns, north, north-west, then
  // north-east, and the last runs on level as a processional between statues to the tribune)
  const NW = [-Math.SQRT1_2, -Math.SQRT1_2], NE = [Math.SQRT1_2, -Math.SQRT1_2];
  const go = (p, d, k, y) => [p[0] + d[0] * k, p[1] + d[1] * k, y];
  const S0 = [12, -294, Y3], S1 = [12, -296.5, Y3], S2 = [12, -304.5, -25], S3 = [12, -308.5, -25];
  const S4 = go(S3, NW, 1.5, -25), S5 = go(S4, NW, 8, -29), S6 = go(S5, NW, 3.5, -29);
  const S7 = go(S6, NE, 1.5, -29), S8 = go(S7, NE, 6, TRIB), S9 = go(S8, NE, (12 - S8[0]) / Math.SQRT1_2, TRIB);
  const stairHall = mason.passage({ name: 'The Stair Hall', dg: 'upper', pts: [S0, S1, S2, S3, S4, S5, S6, S7, S8, S9, [12, -341.13, TRIB]],
    w: 4.8, spring: 6.6, from: hall, to: shrine, toBase: TRIB - Y4, mats: STONE.stairhall, ribs: 3, torches: 0 });
  // (each landing's corners, where the turn's two walls meet: the mitre either side of its point)
  const corners = (A, P, B, off) => {
    const d1 = [P[0] - A[0], P[1] - A[1]], d2 = [B[0] - P[0], B[1] - P[1]], l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
    const na = [-d1[1] / l1, d1[0] / l1], nb = [-d2[1] / l2, d2[0] / l2], m = [na[0] + nb[0], na[1] + nb[1]], ml = Math.hypot(...m), k = 1 / ((m[0] * na[0] + m[1] * na[1]) / ml);
    return [1, -1].map((sg) => [P[0] + m[0] / ml * k * off * sg, P[1] + m[1] / ml * k * off * sg]);
  };
  const LANDINGS = [[corners(S2, S3, S4, 1.95), -25], [corners(S5, S6, S7, 1.95), -29]];
  // the tribune: a balcony round the south of the shrine at the Stair Hall's height, a flight down the
  // wall from each end of it (a horseshoe) to the floor
  const TR = { r0: 11.4, a0: 62 * DEG, a1: 118 * DEG, n: 20, sweep: 44 * DEG };
  const tribuneAt = (x, z) => {
    const dx = x - 12, dz = z + 356, rr = Math.hypot(dx, dz);
    if (rr < TR.r0 || rr > 15.6) return null;
    const a = Math.atan2(dz, dx);
    if (a >= TR.a0 && a <= TR.a1) return rr < TR.r0 + 0.25 ? TRIB + 1.0 : TRIB;        // (its parapet, the inner edge)
    for (const [from, sgn] of [[TR.a0, -1], [TR.a1, 1]]) {                             // the two flights, down and away
      const t = (a - from) * sgn;
      if (t <= 0 || t > TR.sweep) continue;
      const k = Math.min(TR.n, Math.floor(t / TR.sweep * TR.n) + 1), h = TRIB - k * (TRIB - Y4) / TR.n;
      return rr < TR.r0 + 0.25 && k < TR.n - 2 ? h + 1.0 : h;
    }
    return null;
  };
  mason.feature(shrine, [-4, -372, 28, -340], tribuneAt, (m) => tribune(m));

  // ======================================================== stage IV: the Deep Undercroft (37 m)
  // the First Bell: a round plinth 7 m high in the middle of the shrine, a stair spiralling up it
  const BELL = { x: 12, z: -356, r: 3.6, R: 5.9, top: Y4 + 7, a0: 90 * DEG, turn: 0.94 };
  const spiralAt = (x, z) => {
    const dx = x - BELL.x, dz = z - BELL.z, rr = Math.hypot(dx, dz);
    if (rr <= BELL.r) return BELL.top;
    if (rr > BELL.R) return null;
    let a = Math.atan2(dz, dx) - BELL.a0; a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);   // round from the stair's foot, south
    const f = a / (Math.PI * 2 * BELL.turn);
    if (f > 1) return null;
    const slot = Math.floor(f * 30), step = slot < 14 ? slot + 1 : slot < 16 ? 14 : Math.min(28, slot - 1), h = Y4 + step * 0.25;   // (a landing half way)
    return rr > BELL.R - 0.22 && step > 5 ? h + 0.55 : h;          // (its outer edge a low parapet, from the sixth step up: the foot is open, stepped onto from the floor)
  };
  mason.feature(shrine, [BELL.x - BELL.R - 0.1, BELL.z - BELL.R - 0.1, BELL.x + BELL.R + 0.1, BELL.z + BELL.R + 0.1], spiralAt, (m) => bellPlinth(m));

  // the Charnel (branch: a reward you go down for): a pit 2.5 m deep heaped with the abbey's bones,
  // a walk round its rim, a stair down into it on the east; what was thrown in with the bones is in it
  const CH = { x: -19.5, z: -362, r: 7, pit: 4.6 };
  const charnel = mason.room({ name: 'The Charnel', dg: 'deep', poly: ring(CH.x, CH.z, CH.r, 7, -Math.PI / 7), y: Y4, wallH: 5.5, roof: { kind: 'dome', rise: 3.2 }, mats: STONE.charnel, torches: 0, noFloor: true });
  const PIT = Y4 - 2.5;
  mason.feature(charnel, [CH.x - CH.r, CH.z - CH.r, CH.x + CH.r, CH.z + CH.r], (x, z) => {
    const d = Math.hypot(x - CH.x, z - CH.z);
    if (d > CH.pit) return null;
    if (z > CH.z - 1.1 && z < CH.z + 1.1 && x > CH.x) { const t = (x - CH.x) - (CH.pit - 5); return t > 0 ? PIT + Math.min(10, Math.floor(t / 0.5) + 1) * 0.25 : PIT; }   // the stair down, east
    return PIT;
  }, (m) => charnelPit(m), PIT - 0.6);
  mason.passage({ name: 'The Charnel', dg: 'deep', pts: [[-2.87, -356, Y4], [-6.5, -356, Y4], [-9.5, -362, Y4], [CH.x + CH.r * Math.cos(Math.PI / 7), -362, Y4]], w: 3, spring: 3.2, from: shrine, to: charnel, mats: STONE.charnel, ribs: 3, torches: 0 });

  mason.mats.set(STONE.tomb.wall + '|4.5|{}', lib.material(STONE.tomb.wall, { tile: 4.5, tint: 0x7a5e52, emissive: 0x160602 }));   // (charred by his fire)
  const tomb = mason.room({ name: "Cindermaw's Tomb", dg: 'deep', poly: ring(46, -396, 10, 20, 81 * DEG), y: Y5, wallH: 7, roof: { kind: 'dome', rise: 5 }, mats: STONE.tomb, torches: 0 });
  const abbots = mason.passage({ name: "The Abbots' Gallery", dg: 'deep', pts: [[26.87, -356, Y4], [30.5, -356, Y4], [38, -360, Y4], [42.5, -366, Y4], [43, -369, Y4], [43, -375, Y5], [43, -379, Y5], [46, -383, Y5], [46, -386.12, Y5]],
    w: 5.6, spring: 4.2, from: shrine, to: tomb, mats: STONE.abbots, ribs: 4, torches: 0 });
  // the arena: a sunken floor in three rings, the abbot's open tomb in its north apse
  tomb.noFloor = true;
  // (the sunken floor in steps of 0.4: you can climb back out; at the north, a dais of three steps
  // under the abbot's open tomb, between two columns)
  const daisAt = (x, z) => { const d = Math.hypot(x - 46, z + 404.6); return z > -401.2 ? null : d < 2.2 ? Y5 + 0.75 : d < 2.8 ? Y5 + 0.5 : d < 3.4 ? Y5 + 0.25 : null; };
  mason.feature(tomb, [36, -406, 56, -386], (x, z) => { const dd = daisAt(x, z); if (dd != null) return dd; const d = Math.hypot(x - 46, z + 396); return d < 5.5 ? Y5 - 1.2 : d < 6.5 ? Y5 - 0.8 : d < 7.5 ? Y5 - 0.4 : null; }, (m) => arena(m), Y5 - 2.2);

  // ======================================================== the gulf (gulf.js) and its bridge
  const gulf = new Gulf(ctx);
  // its landings, the overlook and the bridge are in the Undercroft's map (painted, no floors: the
  // gulf's own rock carries them)
  const landing = { type: 'gulf', id: mason.spaces.length, name: 'The Mourning Gulf', dg: 'upper', minY: BY - 1, maxY: BY + 12 };
  mason.spaces.push(landing);
  mason.build();
  mason.paint(landing, -50, -240, 64, -186, (x, z) => {
    const p = gulf.partAt(x, z), f = gulf.floorAt(x, z);
    return p === 'near' || p === 'far' || (p === 'gulf' && f >= BY - 0.01 && f < BY + 1 && x >= LEDGE.x1 + 0.5) ? [f, f - 1, 2] : null;
  }, false);
  // (the overlook's lip is a place of its own: the Sexton's Overlook)
  const lip = { type: 'gulf', id: mason.spaces.length, name: "The Sexton's Overlook", dg: 'upper' };
  mason.spaces.push(lip);
  mason.paint(lip, 25, -200, 37, -186, (x, z) => { const p = gulf.partAt(x, z), f = gulf.floorAt(x, z); return (p === 'over' || (p === 'gulf' && f > BY + 1)) ? [f, f - 1, 3] : null; }, false);
  const bridgeA = [BX, BY, zs(BX) - 1.2], bridgeB = [BX, BY, zn(BX) + 1.2];
  mason.paint(landing, BX - 1, bridgeB[2], BX + 1, bridgeA[2], () => [BY, BY - 1, 2], false);
  gulf.build(b);
  gulf.colliders(physics, (x, z) => { const s = mason.spaceAt(x, z); return !!s && s.type !== 'gulf'; });
  gulf.stream(b);
  gulf.stubs(b, { floor: M('catacombs_charcoal_flagstone', 1.5), wall: M('catacombs_wall_crypt_ashlar', 3), roof: M('catacombs_slate_bricks', 2) }, props);
  // (each sheared gallery: its arch ring where the vault still stands, and a brazier the sexton kept
  // burning at its broken end, on the lip of its notch: seen from the bridge, a light in the cliff)
  STUBS.forEach(([sx, y, side], i) => {
    const m = stubMouth(sx, side);
    mason.archRing(M('castle_keep_pale_keep_limestone', 1), [sx, y, m + side * 0.9], [1, 0], [0, -side], 1.4, 2.2, y);
    burner('catacombs_incense_brazier', sx + (i % 2 ? 0.85 : -0.85), y, m - side * 0.25, 1.05, 0.44);
  });
  const glow = gulf.fungus(ctx.scene);
  const bridge = new RopeBridge(ctx, { a: bridgeA, b: bridgeB, width: 1.5, gap: [19, 24] });
  physics.dynamic.push(bridge);
  const meshes = bridge.makeMeshes(lib);
  meshes.push(glow);

  // ======================================================== dressing, light
  // the Bell Crypt: torches round it, a ring of kneeling mourners in front of the wall, the ringers'
  // tomb in the middle (a sarcophagus on a low drum) under two candelabra
  roomTorches(crypt, 5.6);
  for (let k = 0; k < 16; k++) {
    if (k % 2) continue;
    const a = 78.75 * DEG + (k + 0.5) * 22.5 * DEG, x = 5 + Math.cos(a) * 7.2, z = -125 + Math.sin(a) * 7.2;
    if (Math.abs(Math.cos(a)) > 0.95 || Math.abs(Math.sin(a)) > 0.95) continue;       // (not before an opening)
    sprite('catacombs_kneeling_mourner', x, Y1, z, 1.05, Math.atan2(5 - x, -125 - z));
  }
  b.lathe(5, -125, [[2.1, 0], [2.1, 0.42], [1.9, 0.5], [0, 0.5]], 20, M('castle_keep_ivory_chapel_marble', 1.5, { side: THREE.DoubleSide }), { y: Y1 });
  physics.add([5 - 1.6, Y1, -125 - 1.6], [5 + 1.6, Y1 + 0.5, -125 + 1.6], 'prop');
  props.add('sarcophagus', 5, Y1 + 0.5, -125, Math.PI / 2);
  props.add('candelabrum', 2.4, Y1, -122.6); props.add('candelabrum', 7.6, Y1, -127.4);

  // the Reliquary: the altar in the apse with the ringers' relic on it, angels down the nave
  const RELIC = [-21.3, Y1 + 1.15, -127];
  props.add('altar', -21.6, Y1, -127, Math.PI / 2);
  props.add('candelabrum', -20.4, Y1, -129.5); props.add('candelabrum', -20.4, Y1, -124.5);
  sprite('catacombs_headless_angel', -16.2, Y1, -129.6, 1.05, 0); sprite('catacombs_headless_angel', -16.2, Y1, -124.4, 1.05, Math.PI);
  sprite('catacombs_vigil_candles', -14.2, Y1, -129.4); sprite('catacombs_ossuary_urn', -13.6, Y1, -124.6);
  flames.push([-21.6, Y1 + 1.5, -127, 0.3, 1]);
  torch(-15.6, Y1, -130.18, 0, -1); torch(-15.6, Y1, -123.82, 0, 1);

  // the Gallery of the Poor: the graves heaped in the earth along each side, a marker on some.
  // Four, further in, are broken open from beneath (the earth heaved up and split, the marker
  // knocked flat): the dead come up out of those as you come near (see update)
  const graves = [], erupt = [];
  const earth = M('catacombs_grave_gravel', 1.2), dug = M('town_limestone_gravel', 1.2);
  const ERUPT = new Set(['0:3:1', '0:5:-1', '1:2:1', '1:4:-1']);
  [gallery1, gallery2].forEach((p, pi) => {
    const pts = p.pts;
    let n = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, rot = Math.atan2(ux, uz);
      for (let d = 1.6; d < L - 1.2; d += 2.6, n++) for (const side of [-1, 1]) {
        const x = ax + ux * d - uz * side * 1.75, z = az + uz * d + ux * side * 1.75;
        if (ERUPT.has(`${pi}:${n}:${side}`)) {
          // heaved open: the mound split in lumps, the dark of the hole between, the marker down
          b.place(x, Y1, z, rot, 1, (o) => { o.blob([0.32, 0.12, -0.55], [0.32, 0.2, 0.42], earth, { seed: n * 3, floor: 0 }); o.blob([-0.3, 0.1, 0.5], [0.3, 0.18, 0.4], earth, { seed: n * 5, floor: 0 }); o.blob([0, 0.02, 0], [0.4, 0.05, 0.62], dug, { seed: n, floor: 0, jitter: 0.3 }); }, { solid: false });
          sprite('catacombs_cross_grave_marker', x - uz * side * 0.7, Y1, z + ux * side * 0.7, 0.8, rot + 1.4);
          sprite('catacombs_vigil_candles', x + ux * 0.9, Y1, z + uz * 0.9, 0.7);
          flames.push([x + ux * 0.9, Y1 + 0.35, z + uz * 0.9, 0.16, 1]);
          erupt.push([x, z]);
        } else {
          b.place(x, Y1, z, rot, 1, (o) => o.blob([0, 0, 0], [0.42, 0.26, 0.95], earth, { seed: n * 7 + side, floor: 0, jitter: 0.12 }), { solid: false });
          if ((i + n) % 3 === 0) sprite('catacombs_cross_grave_marker', x - uz * side * 0.55, Y1, z + ux * side * 0.55, 0.8, rot);
          graves.push([x, z]);
        }
      }
    }
  });
  // the gallery's torches hang on the piers between the loculi, alternating sides, every 7.5 m or so
  for (const p of [gallery1, gallery2]) {
    let last = -Infinity, want = 1;
    for (const q of [...(p.piers || [])].sort((a, c) => a.along - c.along)) if (q.along - last >= 7.5 && q.sgn === want && q.along > 1.5) { torch(q.x, Y1, q.z, q.nx, q.nz); last = q.along; want = -want; }
  }
  // the crossing: an ossuary column of skulls in the middle, candles about it
  // (off the way through, against its south-west wall)
  sprite('catacombs_skull_pyramid', CR.x - 3.4, Y1, CR.z + 2.2, 1.3); sprite('catacombs_vigil_candles', CR.x - 2.4, Y1, CR.z + 2.6); sprite('catacombs_vigil_candles', CR.x - 3.9, Y1, CR.z + 1.0);
  flames.push([CR.x - 3.4, Y1 + 0.6, CR.z + 2.2, 0.25, 1]);
  roomTorches(crossing, 7);
  for (const sx of [-1, 1]) torch(CR.x + sx * 3.4, Y1, CR.z - 5.13, 0, 1);      // (the way on, framed in fire)
  // the overlook passage and the sexton's lip: his bench, his rope and planks for the bridge, a lantern
  passTorches(overPass, 7, 3);
  sprite('catacombs_stone_bench', 29.4, OVER_MOUTH.y, OVER_MOUTH.z - 2.2, 1, Math.PI / 2);
  sprite('town_scatter_37_rope_and_hook', 33, OVER_MOUTH.y, OVER_MOUTH.z - 1.6, 1);
  sprite('catacombs_coffin_plank_heap', 32.8, OVER_MOUTH.y, OVER_MOUTH.z - 3.4, 1);
  burner('catacombs_iron_candelabrum', 28.6, OVER_MOUTH.y, OVER_MOUTH.z - 2.2, 1, 0.22);
  props.add('crate', 33.4, OVER_MOUTH.y, OVER_MOUTH.z - 0.8, 0.4);

  // the Sexton's Stair: torches down both walls of the flight, a brazier on the landing at its foot
  passTorches(sexton, 3.2, 1.2);
  burner('catacombs_incense_brazier', 9.4, BY, NEAR_BACK + 1.2, 1, 0.45); burner('catacombs_incense_brazier', 14.6, BY, NEAR_BACK + 1.2, 1, 0.45);

  // the gulf's landings: torch stands flanking the bridge posts, its posts and rope
  // (a stone bollard each side, an oak post 2.2 m tall set in it that the ropes are made fast to, and
  // a back-stay from its head down to an iron ring in the floor behind, taking the bridge's pull)
  const rope = M('wood_01_end_grain_timber', 0.6), iron = M('met_02_riveted_black_iron', 0.5);
  const post = (x, z, back) => {
    b.box([x - 0.32, BY, z - 0.32], [x + 0.32, BY + 0.6, z + 0.32], M('castle_keep_rough_battlement_block', 0.8), { shade: 0.85, tag: 'prop' });
    b.cylinder([x, BY + 0.5, z], [x, BY + 2.2, z], 0.13, 8, M('wood_04_weathered_cedar', 1), { shade: 0.8 });
    b.cylinder([x, BY + 2.18, z], [x, BY + 2.3, z], 0.17, 8, iron, { shade: 0.7 });
    b.cylinder([x, BY + 2.0, z], [x + (x - BX) * 0.4, BY + 0.06, z + back * 1.6], 0.035, 5, rope, { shade: 0.75 });
    b.lathe(x + (x - BX) * 0.4, z + back * 1.6, [[0.16, 0], [0.18, 0.04], [0.16, 0.08], [0.12, 0.04]], 8, iron, { y: BY });
  };
  for (const [z, s] of [[bridgeA[2] + 0.2, 1], [bridgeB[2] - 0.2, -1]]) {
    post(BX - 0.98, z, s); post(BX + 0.98, z, s);
    burner('catacombs_torch_stand', BX - 2.4, BY, z + s * 1.2, 1, 0.36); burner('catacombs_torch_stand', BX + 2.4, BY, z + s * 1.2, 1, 0.36);
  }
  burner('catacombs_incense_brazier', 9.4, BY, FAR_BACK + 1.0, 1.4, 0.6); burner('catacombs_incense_brazier', 14.6, BY, FAR_BACK + 1.0, 1.4, 0.6);
  flames.push([BX, BY + 4.6, FAR_BACK + 0.6, 0.3, 1]);
  // (the near landing's pair too, at the head of the bridge)
  // the rock the quake brought down: boulders and slabs strewn on the gulf's floor, the big ones solid
  { const rockM = gulf.mat, R = (() => { let q = 77; return () => { q = (q * 16807) % 2147483647; return q / 2147483647; }; })();
    for (let k = 0; k < 34; k++) {
      const x = -30 + R() * 82, zz = zc(x) + (R() - 0.5) * 2 * hw(x) * 0.42, f = gulf.floorAt(x, zz);
      if (f == null || f > -30 || Math.abs(x - BX) < 3) continue;
      const r = 0.4 + R() * R() * 2.2, flat = R() < 0.35;
      b.blob([x, f + r * (flat ? 0.25 : 0.55), zz], [r * (flat ? 1.6 : 1), r * (flat ? 0.35 : 0.8), r * (flat ? 1.1 : 0.9)], rockM, { seed: k * 13, floor: f - 0.05, jitter: 0.3, shade: 0.75 });
      if (r > 0.8) physics.add([x - r * 0.8, f, zz - r * 0.7], [x + r * 0.8, f + r * (flat ? 0.5 : 1.2), zz + r * 0.7], 'prop');
    } }
  // the gulf floor: the bones of those who fell, and a pilgrim's cache under the scree
  const FG = (x, z) => gulf.floorAt(x, z) ?? floorY(x, z);
  for (const [x, z] of [[8, -214], [15, -210], [20, -219], [2, -217], [-6, -212], [26, -214], [-14, -214], [33, -216]]) sprite(['catacombs_long_bone_heap', 'catacombs_supine_skeleton', 'catacombs_skull_pyramid'][Math.abs(Math.round(x + z)) % 3], x, FG(x, z), z, 1);
  props.add('treasure_chest', -26, FG(-26, -216), -216, 0.6);
  sprite('catacombs_supine_skeleton', -24.6, FG(-24.6, -217), -217, 1);
  burner('catacombs_iron_candelabrum', -27.5, FG(-27.5, -214.5), -214.5, 1, 0.2);
  // the cut stair along the south wall: steps of dressed stone laid on the ledge, so it reads as a stair
  const ledgeM = M('catacombs_charcoal_flagstone', 1.2);
  for (let i = 0; i < LEDGE_N; i++) {
    const x = LEDGE.x0 + i * LEDGE_RUN, x1 = i === LEDGE_N - 1 ? LEDGE.x1 + 0.2 : x + LEDGE_RUN, y = ledgeStep(x + 0.01), s0 = zs(x), s1 = zs(x1);
    b.box([x, y - 0.25, Math.min(s0, s1) - 2.3], [x1, y, Math.max(s0, s1) + 0.2], ledgeM, { solid: false, shade: 0.85 });
  }
  for (const x of [-34, -22, -10, 1]) burner('catacombs_torch_stand', x, ledgeStep(x), zs(x) - 0.5, 0.9, 0.3);

  // the Hall of the Founders: pillars round an ambulatory, braziers at the monument's corners and
  // top, torches round the wall
  // the arcades: four columns a side, arches between them along the aisles and across to the wall
  const CZ = [HALL.z - 9.6, HALL.z - 3.2, HALL.z + 3.2, HALL.z + 9.6], CH8 = 8;
  const archM = M('castle_keep_pale_keep_limestone', 1.2);
  for (const sx of [-1, 1]) {
    const cx = HALL.x + sx * 12.5;
    for (const z of CZ) column(cx, Y3, z, CH8);
    for (let i = 0; i + 1 < CZ.length; i++) {                     // along the aisle
      const za = CZ[i], zb = CZ[i + 1], r = (zb - za) / 2, arc = [];
      for (let k = 0; k <= 12; k++) { const t = Math.PI * k / 12; arc.push([cx, Y3 + CH8 + Math.sin(t) * r * 0.85, za + r - Math.cos(t) * r]); }
      mason.band(archM, arc, 0.5, 0.4, [cx - sx * 3, Y3 + CH8, (za + zb) / 2]);
    }
    for (const z of CZ) {                                         // across to the wall (half arches)
      const wx = HALL.x + sx * 17, arc = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8; arc.push([cx + (wx - cx) * t, Y3 + CH8 + Math.sin(t * Math.PI) * 1.1, z]); }
      mason.band(archM, arc, 0.42, 0.34, [cx, Y3 + CH8 - 3, z + 2]);
    }
  }
  // iron lamps hung on chains in the arcades' arches: they light the arches and the vault over them
  { const iron = M('met_02_riveted_black_iron', 0.5);
    for (const sx of [-1, 1]) for (let i = 0; i + 1 < CZ.length; i++) {
      const x = HALL.x + sx * 12.5, z = (CZ[i] + CZ[i + 1]) / 2, y = Y3 + 7.4;
      b.lathe(x, z, [[0.0, 0], [0.32, 0.12], [0.36, 0.28], [0.18, 0.4], [0.05, 0.42]], 8, iron, { y });
      b.cylinder([x, y + 0.42, z], [x, Y3 + CH8 + 2.6, z], 0.025, 4, iron, { caps: false });
      flames.push([x, y + 0.35, z, 0.42, 1]);
    } }
  // (the founders' braziers burn between the columns, lighting the aisles and the tomb's flanks)
  for (const z of [HALL.z - 6.4, HALL.z + 6.4]) for (const sx of [-1, 1]) burner('catacombs_incense_brazier', HALL.x + sx * 10.8, Y3, z, 1.25, 0.5);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) burner('catacombs_incense_brazier', MON.x + dx * 6.6, Y3, MON.z + dz * 6.6, 1.2, 0.5);
  // the processional: great braziers flanking the forecourt and the foot of the tomb's stair
  for (const z of [FOOT + 1.2, FOOT + 6]) for (const sx of [-1, 1]) burner('catacombs_incense_brazier', MON.x + sx * 3.4, Y3, z, 1.5, 0.55);
  roomTorches(hall, 5.5);

  // the Plague Ossuary: bones heaped to the walls, an urn of the dead's names, and their goods
  // skulls heaped along both long walls, the plague's goods in a chest at the far end, and over them a
  // chandelier of bones and candles on chains
  for (const [x, z] of [[44, -274.3], [47.5, -274.2], [50.5, -274.3], [44, -279.7], [47.5, -279.8], [50.5, -279.7]]) sprite(['catacombs_skull_pyramid', 'catacombs_long_bone_heap', 'catacombs_burial_urn_cluster'][Math.round(x) % 3], x, Y3, z, 1.05);
  props.add('treasure_chest', 52.8, Y3, -277, -Math.PI / 2);
  { const cx = 47, cz = -277, cy = Y3 + 3.2, iron = M('met_02_riveted_black_iron', 0.5), bone = M('castle_keep_ivory_chapel_marble', 0.6);
    b.lathe(cx, cz, [[0.95, 0], [1.05, 0.05], [1.05, 0.14], [0.95, 0.18], [0.85, 0.1]], 16, iron, { y: cy });
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; b.blob([cx + Math.cos(a) * 1.0, cy + 0.08, cz + Math.sin(a) * 1.0], [0.11, 0.13, 0.11], bone, { seed: k + 40 }); }
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; b.cylinder([cx + Math.cos(a) * 0.9, cy + 0.15, cz + Math.sin(a) * 0.9], [cx, cy + 2.4, cz], 0.02, 4, iron, { caps: false }); }
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; flames.push([cx + Math.cos(a) * 1.0, cy + 0.42, cz + Math.sin(a) * 1.0, k ? 0.14 : 0.3, 1]); } }

  // the Stair Hall: torches down the flights, braziers on each landing where it turns, abbots in
  // stone kneeling along the processional
  passTorches(stairHall, 3.4, 1.5);
  for (const [cs, y] of LANDINGS) for (const [x, z] of cs) burner('catacombs_incense_brazier', x, y, z, 0.9, 0.45);
  { const L = Math.hypot(S9[0] - S8[0], S9[1] - S8[1]);
    for (let d = 1.5; d < L - 1; d += 3) for (const sx of [-1, 1]) { const x = S8[0] + NE[0] * d + -NE[1] * sx * 1.85, z = S8[1] + NE[1] * d + NE[0] * sx * 1.85; sprite('catacombs_kneeling_mourner', x, TRIB, z, 1.1, Math.atan2(NE[1] * sx, -NE[0] * sx)); } }

  // the Bell Shrine: a ring of braziers round the plinth, torches round the wall
  for (let k = 0; k < 8; k++) { const a = (k + 0.5) * Math.PI / 4; burner('catacombs_incense_brazier', 12 + Math.cos(a) * 10.5, Y4, -356 + Math.sin(a) * 10.5, 1.2, 0.5); }
  roomTorches(shrine, 8, Y4, (x, z) => z > -356 + 4);
  // and a ring of sconces high on the rotunda's wall, so its drum shows round the bell from the tribune
  roomTorches(shrine, 9.4, Y4 + 5.6, (x, z) => z > -356 + 6);
  // the grille across the Abbots' Gallery's mouth: iron bars on the way to Cindermaw. It lifts when
  // the First Bell is rung (the abbots' rite), so the bell is the way on, and its toll brings the dead
  const GR = { x: 28.2, z: -356, w: 5.6, h: 5.6 };
  const grilleM = new THREE.MeshPhongMaterial({ color: 0x1c1a18, specular: 0x5a5048, shininess: 40 });
  const grille = new THREE.Group();
  for (let k = 0; k <= 9; k++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, GR.h, 6), grilleM); bar.position.set(0, GR.h / 2, -GR.w / 2 + k * GR.w / 9); grille.add(bar); }
  for (const h of [0.4, 2.4, 4.4]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, GR.w), grilleM); rail.position.set(0, h, 0); grille.add(rail); }
  grille.position.set(GR.x, Y4, GR.z);
  ctx.scene.add(grille);
  const grilleBox = physics.add([GR.x - 0.12, Y4, GR.z - GR.w / 2], [GR.x + 0.12, Y4 + GR.h, GR.z + GR.w / 2], 'door');
  // the Charnel: bones heaped on the rim walk either side of the way in (the rest of the rim's heaps,
  // and the pit's, in charnelPit), the abbey's goods chest on the rim opposite the door, and a
  // candelabrum down on the pit's floor, off the foot of its stair
  for (const a of [62 * DEG, -62 * DEG]) sprite('catacombs_long_bone_heap', CH.x + Math.cos(a) * 5.6, Y4, CH.z + Math.sin(a) * 5.6, 1.1);
  props.add('treasure_chest', CH.x - 5.5, Y4, CH.z + 1.6, Math.PI / 2);
  burner('catacombs_iron_candelabrum', CH.x - 1.2, PIT, CH.z - 2.2, 1, 0.22);
  // the Abbots' Gallery: their effigy tombs along the walls, the gallery's torches between them
  const effigies = [];
  // (each tomb in an arcosolium: an arch of the gallery's dark stone over it on the wall; the abbot
  // carved lying on its lid; a candle at its head)
  const arcoM = M(STONE.abbots.trim, 1), chestM = M('castle_keep_sootdark_great_hall', 1.2), effM = M('castle_keep_ivory_chapel_marble', 0.8, { tint: 0xb0a898, emissive: 0x1c1812 });   // (a little light of its own: the torches graze it)
  for (const [i, d0] of [[1, 2.4], [6, 1.6]]) {
    const [ax, az, ay] = abbots.pts[i], [bx, bz] = abbots.pts[i + 1], L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    let d = d0;
    for (; d < L - 1.5; d += 4.4) for (const side of [-1, 1]) {
      const x = ax + ux * d - uz * side * 2.25, z = az + uz * d + ux * side * 2.25, nx = uz * side, nz = -ux * side;
      // the chest of dark stone, the abbot carved lying on its lid in a greyed marble, hands joined
      b.place(x, ay, z, Math.atan2(ux, uz), 1, (o) => {
        o.box([-0.5, 0, -1.05], [0.5, 0.72, 1.05], chestM, { solid: false, shade: 0.8 }); o.box([-0.57, 0.72, -1.12], [0.57, 0.84, 1.12], chestM, { solid: false, shade: 0.9 });
        const sd = effigies.length * 5;
        o.box([-0.2, 0.84, 0.6], [0.2, 0.9, 0.98], effM, { solid: false });                                  // the cushion under his head
        o.blob([0, 0.96, 0.76], [0.13, 0.12, 0.14], effM, { seed: sd, floor: 0.84 });                         // his head, mitred
        o.box([-0.12, 0.86, 0.86], [0.12, 1.08, 1.1], effM, { solid: false }); for (const mx of [-0.06, 0.06]) o.box([mx - 0.05, 0.88, 1.1], [mx + 0.05, 1.05, 1.22], effM, { solid: false });   // (a tall mitre, two-peaked)
        o.blob([0, 0.95, -0.05], [0.25, 0.12, 0.72], effM, { seed: sd + 1, floor: 0.84 });                   // his robed body
        o.blob([0, 1.11, 0.33], [0.06, 0.1, 0.08], effM, { seed: sd + 2 });                                   // hands joined in prayer
        for (const tx of [-0.08, 0.08]) o.blob([tx, 1.02, -0.79], [0.05, 0.08, 0.05], effM, { seed: sd + 3 }); // his feet, toes up
        o.cylinder([0.19, 1.0, -0.78], [0.13, 1.06, 0.62], 0.03, 5, effM);                                    // his crozier, its crook curled over his shoulder
        o.cylinder([0.13, 1.06, 0.62], [0.16, 1.16, 0.74], 0.03, 5, effM); o.cylinder([0.16, 1.16, 0.74], [0.24, 1.14, 0.68], 0.03, 5, effM); o.blob([0.25, 1.1, 0.62], [0.045, 0.05, 0.045], effM, { seed: sd + 4 });
      }, { solid: false });
      physics.addSeg(x - ux * 0.55, z - uz * 0.55, x + ux * 0.55, z + uz * 0.55, ay, ay + 0.95, 1.15, 'prop');   // (along the tomb, at its angle: no invisible wall out into the gallery)
      mason.archRing(arcoM, [x - nx * 0.53, ay, z - nz * 0.53], [ux, uz], [nx, nz], 1.35, 1.25, ay);
      sprite('catacombs_vigil_candles', x + ux * 1.25, ay, z + uz * 1.25, 0.6);   // (its glow only: the gallery's torches light the tombs)
      effigies.push([x, ay, z, nx, nz]);
    }
    // the torches between the arcosolia, alternating sides, each lighting the two tombs beside it
    for (let t = d0 + 2.2, k = 0; t < d - 4.4 + 0.1; t += 4.4, k++) { const s = k % 2 ? 1 : -1; torch(ax + ux * t - uz * s * 2.8, ay, az + uz * t + ux * s * 2.8, uz * s, -ux * s); }
  }
  passTorches(abbots, 5, 1.4, (x, z) => effigies.some((e) => Math.hypot(e[0] - x, e[2] - z) < 3.2));
  // Cindermaw's Tomb: braziers round the sunken floor, his open tomb in the apse
  // (none before the door, south, nor before the abbot's tomb in the apse, north)
  for (const deg of [0, 40, 140, 180]) { const a = deg * DEG; burner('catacombs_incense_brazier', 46 + Math.cos(a) * 8.6, Y5, -396 + Math.sin(a) * 8.6, 1.1, 0.5); }
  // (two great braziers either side of his dais, not before it: wide bronze bowls on drums of black
  // stone, the open tomb between them)
  { const st = M('catacombs_black_basalt', 1.2), bronze = M('met_04_tarnished_bronze', 0.8);
    for (const x of [41.0, 51.0]) {
      const z = -402.6;
      b.lathe(x, z, [[0.62, 0], [0.62, 0.1], [0.5, 0.2], [0.44, 0.9], [0.56, 1.0], [0.56, 1.08], [0, 1.08]], 12, st, { y: Y5 });
      b.lathe(x, z, [[0.22, 0], [0.75, 0.24], [0.98, 0.46], [0.92, 0.5], [0, 0.32]], 14, bronze, { y: Y5 + 1.08 });
      b.blob([x, Y5 + 1.42, z], [0.74, 0.08, 0.74], ctx.scatter.P.coals, { seed: Math.round(x) });
      flames.push([x, Y5 + 1.8, z, 0.78, 1]);
      physics.add([x - 0.62, Y5, z - 0.62], [x + 0.62, Y5 + 1.58, z + 0.62], 'prop');
    } }
  // (on the ring, the stumps of columns, each by a brazier's light: cover from what he throws)
  for (const deg of [18, 162, 198, 342, 252, 288]) { const a = deg * DEG; props.add('pillar_broken', 46 + Math.cos(a) * 8.05, Y5, -396 + Math.sin(a) * 8.05, deg * 0.1, 0.95); }
  const BOSS = [46, Y5 + 0.75, -404.4];
  // the ringers' rope: it hangs in the apse once the abbot is dead, up into the dark (a way home)
  const ROPE = { x: 46, y: Y5 + 0.75, z: -402.6 };
  const ringRope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 12, 6).translate(0, 6, 0), new THREE.MeshPhongMaterial({ color: 0x6a5236, shininess: 4 }));
  ringRope.position.set(ROPE.x, ROPE.y, ROPE.z); ringRope.visible = false; ctx.scene.add(ringRope);
  // his tomb: a chest of black stone with a bronze rim, standing open, the coals of him still burning
  // in it and their smoke going up into the dark; its lid broken in two and thrown down into the
  // arena; candles on the dais's steps
  { const st = M('catacombs_black_basalt', 1), rim = M('met_04_tarnished_bronze', 0.8), y0 = Y5 + 0.75, cx = 46, cz = -404.9, hx = 0.78, hz = 1.3, h = 0.95, t = 0.13;
    b.box([cx - hx, y0, cz - hz], [cx + hx, y0 + 0.2, cz + hz], st, { solid: false, shade: 0.8 });
    for (const sx of [-1, 1]) b.box([sx < 0 ? cx - hx : cx + hx - t, y0, cz - hz], [sx < 0 ? cx - hx + t : cx + hx, y0 + h, cz + hz], st, { solid: false, shade: 0.85 });
    for (const sz of [-1, 1]) b.box([cx - hx, y0, sz < 0 ? cz - hz : cz + hz - t], [cx + hx, y0 + h, sz < 0 ? cz - hz + t : cz + hz], st, { solid: false, shade: 0.85 });
    for (const sx of [-1, 1]) b.box([cx + sx * (hx - t / 2) - 0.09, y0 + h, cz - hz - 0.03], [cx + sx * (hx - t / 2) + 0.09, y0 + h + 0.05, cz + hz + 0.03], rim, { solid: false });
    for (const sz of [-1, 1]) b.box([cx - hx - 0.03, y0 + h, cz + sz * (hz - t / 2) - 0.09], [cx + hx + 0.03, y0 + h + 0.05, cz + sz * (hz - t / 2) + 0.09], rim, { solid: false });
    b.blob([cx, y0 + 0.62, cz], [hx - 0.14, 0.3, hz - 0.14], ctx.scatter.P.coals, { seed: 9, jitter: 0.25 });   // (heaped to its rim: seen from the arena)
    for (let k = 0; k < 5; k++) b.blob([cx + Math.sin(k * 2.3) * 0.35, y0 + 0.86, cz + Math.cos(k * 1.7) * 0.8], [0.14, 0.09, 0.16], ctx.scatter.P.coals, { seed: 20 + k });
    flames.push([cx - 0.25, y0 + 0.95, cz + 0.45, 0.42, 1], [cx + 0.2, y0 + 0.9, cz - 0.5, 0.32]);
    ctx.chimneys.push([cx, y0 + 1.3, cz]);
    for (const [lx, lz, r] of [[44.2, -399.6, 0.5], [47.9, -399.1, -0.4]]) b.place(lx, Y5 - 1.2, lz, r, 1, (o) => o.box([-0.42, 0, -0.66], [0.42, 0.15, 0.66], st, { solid: false, shade: 0.8 }), { solid: false });
    // (the candles: thin wax tapers in twos and threes up the steps either side, burning low)
    for (const sx of [-1, 1]) for (const [r, deg, hh] of [[2.5, 28, 0.34], [2.55, 33, 0.22], [2.45, 38, 0.28], [3.1, 30, 0.18], [3.12, 36, 0.3], [3.05, 41, 0.14]]) {
      const a = deg * DEG, lx = 46 + sx * Math.sin(a) * r, lz = -404.6 + Math.cos(a) * r, ly = daisAt(lx, lz) ?? Y5;
      b.cylinder([lx, ly, lz], [lx, ly + hh, lz], 0.032, 6, ctx.scatter.P.wax, { shade: 0.95 });
      flames.push([lx, ly + hh + 0.06, lz, 0.075, 1]);
    } }
  column(43.3, Y5, -403.4, 6); column(48.7, Y5, -403.4, 6);
  props.add('treasure_chest', 48.0, Y5 + 0.75, -405.2, 0);
  flames.push([46, Y5 + 2.2, -403.2, 0.7, 1]);

  // ======================================================== the places below, for the dead and the map
  const upper = mason.spaces.filter((s) => s.dg === 'upper'), deep = mason.spaces.filter((s) => s.dg === 'deep');
  const place = (name, spaces, y, fog) => {
    const nav = mason.nav(spaces);
    for (let c = 0; c < nav.cell.length; c++) if (nav.cell[c] >= 0 && mason.spaces[nav.cell[c]].type === 'passage') nav.cell[c] += 1000;
    const set = new Set(spaces);
    const rooms = spaces.filter((s) => s.type === 'room');
    return {
      name, y, nav, fog,
      floorAt: (x, z) => mason.floorAt(x, z) ?? y,
      contains: (p) => {
        const s = mason.spaceAt(p.x, p.z);
        if (!s || !set.has(s)) return false;
        const f = mason.floorAt(p.x, p.z);
        return f != null && p.y > f - (s.type === 'gulf' ? 5 : 3) && p.y < f + 16;
      },
      where: (p) => mason.spaceAt(p.x, p.z)?.name || name,
      roomList: rooms.map((r) => { const xs = r.poly.map((q) => q[0]), zs2 = r.poly.map((q) => q[1]); return { x0: Math.min(...xs), z0: Math.min(...zs2), x1: Math.max(...xs), z1: Math.max(...zs2), kind: r.name, y: r.y, poly: r.poly }; }),
    };
  };
  const U = place('The Undercroft', upper, Y1, 70), D = place('The Deep Undercroft', deep, Y4, 70);
  D.bossSpot = BOSS;                 // (quests.js raises Cindermaw here, out of his own tomb)
  U.sameY = 4.2;                      // (the bridge hangs 3 m below its ends: the dead there still see and hear you)
  const gnav = gulf.nav();
  const G2 = {
    name: 'The Mourning Gulf', y: -38, nav: gnav, fog: 90, gulf: true,
    floorAt: (x, z) => gulf.floorAt(x, z) ?? -38,
    contains: (p) => { const i = Math.floor(p.x - gnav.x0), k = Math.floor(p.z - gnav.z0); if (i < 0 || k < 0 || i >= gnav.nx || k >= gnav.nz || gnav.cell[k * gnav.nx + i] < 0) return false; const f = gulf.floorAt(p.x, p.z); return f != null && p.y < f + 7 && p.y > f - 3; },
    where: () => 'The Mourning Gulf',
    roomList: [{ x0: -30, z0: -224, x1: 40, z1: -205, kind: 'gulf floor', y: -40 }],
  };
  // the big spaces show their size: the fog is pushed back in the gulf and the halls
  const wide = new Set(['The Mourning Gulf', 'The Hall of the Founders', 'The Bell Shrine', "The Sexton's Overlook", "Cindermaw's Tomb"]);
  U.fogAt = (p) => (wide.has(U.where(p)) ? 95 : 55); D.fogAt = (p) => (wide.has(D.where(p)) ? 85 : 55); G2.fogAt = () => 95;
  // and a faint cold light in the gulf (the stream's and the fungus's glow off the wet rock), less
  // in the great halls, none in the passages (torches only)
  const amb = { 'The Mourning Gulf': 0.8, "The Sexton's Overlook": 0.7, 'The Hall of the Founders': 0.3, 'The Bell Shrine': 0.45, "Cindermaw's Tomb": 0.2 };
  U.ambAt = (p) => amb[U.where(p)] || 0; D.ambAt = (p) => amb[D.where(p)] || 0; G2.ambAt = () => 0.8;

  // ======================================================== who waits down here, and where
  const plan = {
    upper: [
      // at the foot of the stair, two lie against the crypt's wall, waiting
      ['lie', -0.5, -120.5], ['lie', 10.5, -129.5],
      // the reliquary's guardians lie either side of the altar; one more under the floor by the door
      ['lie', -19.8, -124.6], ['lie', -19.8, -129.4], ['lie', -14.5, -123.6],
      // the poor come up out of the four broken graves along the gallery as you come near; one more
      // walks it, two stand in its crossing
      ['erupt', 0], ['erupt', 1], ['erupt', 2], ['erupt', 3], ['stand', 8.2, -143, 'shambler'],
      ['stand', CR.x + 1.5, -153.5, 'shambler'], ['stand', CR.x - 1, -158.5, 'runner'], ['stand', 12, -176, 'runner'],
      // two at the foot of the Sexton's Stair, who come up it at you
      ['stand', 10.8, -188.5, 'runner'], ['stand', 13.2, -189, 'runner'],
      // the sexton himself, fallen at his overlook
      ['lie', 31.5, OVER_MOUTH.z - 3],
      // the bridge's far end: they lie still till you set foot on it (see update)
      ['ambush', 10.6, FAR_BACK + 2.2], ['ambush', 13.4, FAR_BACK + 2.6], ['ambush', 12, FAR_BACK + 4.6],
      // the founders' dead stand round their tomb; one keeps the top; two walk the aisles
      ['stand', 3, -262, 'shambler'], ['stand', 21, -263, 'shambler'], ['stand', 3, -286, 'shambler'], ['stand', 21, -285, 'shambler'],
      ['stand', 0, -272, 'runner'], ['stand', 24, -270, 'runner'], ['top', MON.x + 1.6, MON.z - 1.2, 'shambler', 'tomb_mummy'],
      // the plague's dead in their ossuary
      ['stand', 45.5, -278.6, 'shambler', 'plague_bearer'], ['stand', 49, -275.6, 'shambler', 'plague_bearer'], ['stand', 51, -278, 'runner', 'plague_bearer'], ['lie', 44, -275.4],
      // the Stair Hall's landings
      ['stand', S3[0] + 0.8, S3[1], 'shambler'], ['stand', S6[0], S6[1] + 0.6, 'runner'],
    ],
    deep: [
      ['stand', 4.5, -349, 'shambler'], ['stand', 19.5, -350, 'runner'], ['stand', 6, -364.5, 'shambler'], ['stand', 18.5, -363, 'shambler'],
      ['lie', 12.6, -356.8, 'top'],
      ['pit', -21, -360.5, 'pale_ghoul'], ['pit', -18, -364.2, 'pale_ghoul'], ['pit', -22.4, -363.4, 'pale_ghoul'], ['stand', -19.5, -356.4, 'shambler', 'pale_ghoul'],
      ['effigy', 0], ['effigy', 3], ['effigy', 5], ['effigy', 8], ['stand', 43, -377, 'runner'],
      ['stand', 41.5, -393, 'shambler'], ['stand', 50.5, -392, 'shambler'], ['stand', 46, -390, 'runner'], ['lie', 42.5, -399.5], ['lie', 49.5, -400],
    ],
    gulf: [['crawler', 9, -214], ['crawler', 18, -217], ['crawler', -4, -213], ['bury', -24, -214.6], ['bury', -27.5, -217.6]],
  };

  const out = { mason, gulf, bridge, meshes, upper: U, deep: D, gulfDg: G2, plan, graves, effigies, bell: null, ambush: [], erupt: [], prompt: '' };

  /** Fill the places with their dead (zombies.js does the bodies; this says where and how). */
  out.populate = (Z, few = (n) => n) => {
    const dgOf = { upper: U, deep: D, gulf: G2 }, haunt = { upper: 'undercroft', deep: 'deep', gulf: 'undercroft' };
    // the Reliquary's relic on its altar (once: taken, it stays taken), the Charnel's sword in its pit
    const L = ctx.loot;
    let taken = false;
    try { taken = !!localStorage.getItem('bm.taken.ringers'); } catch { /* no storage */ }
    if (L && !taken) L.spawn(makeUnique('ringers'), RELIC[0], RELIC[1], RELIC[2]);
    if (L?.drop) L.drop([CH.x - 1.2, PIT + 0.1, CH.z + 1.4], { tier: 5, under: true });
    const used = new Set();
    for (const [lvl, list] of Object.entries(plan)) {
      const dg = dgOf[lvl];
      Z.addUnder(dg);
      const keep = few(list.length) / list.length;      // (a phone: fewer of the standing and lying dead everywhere, the bell's horde too)
      list.forEach((e, n) => {
        if (keep < 1 && (e[0] === 'stand' || e[0] === 'lie') && Math.floor((n + 1) * keep) === Math.floor(n * keep)) return;     // (a phone: fewer, but every set piece kept)
        const [what] = e;
        let x = e[1], z = e[2], kind = e[3] || 'shambler', variant = e[4] || Z.randomVariant(haunt[lvl]);
        if (what === 'grave') { const g = graves.filter((q, i) => !used.has(i) && Math.hypot(q[0] - sb.x, q[1] - sb.z) > 14); const i = graves.indexOf(g[Math.floor(Math.random() * g.length)]); used.add(i); [x, z] = graves[i]; }
        if (what === 'effigy') { const q = effigies[e[1] % effigies.length]; x = q[0] + q[3] * 1.1; z = q[2] + q[4] * 1.1; }
        if (what === 'erupt') [x, z] = erupt[e[1] % erupt.length];
        if (what === 'pit') variant = e[3];
        const y = what === 'top' ? Y3 + 7 : e[3] === 'top' ? BELL.top : lvl === 'gulf' ? gulf.floorAt(x, z) ?? -38 : dg.floorAt(x, z);
        const start = what === 'lie' || what === 'ambush' || what === 'effigy' ? 'playdead' : what === 'bury' || what === 'grave' || what === 'erupt' || what === 'pit' ? 'buried' : 'stand';
        if (start === 'playdead') kind = what === 'ambush' ? 'runner' : 'lurker';
        else if (start === 'buried') kind = 'lurker';
        else if (!['shambler', 'runner', 'lurker'].includes(kind)) kind = 'shambler';
        const zb = Z.spawn(variant, x, z, { y, zone: 'dungeon', dg, kind, start });
        zb.yaw = Math.random() * Math.PI * 2;
        zb.room = null;
        zb.quick = 1.6;            // (down here the dead scramble up: a set piece is on you in a second, not a cutscene)
        if (what === 'ambush') { zb.yaw = 0; out.ambush.push(zb); }
        if (what === 'erupt') out.erupt.push(zb);
        if (what === 'crawler') zb.cripple(['shinL', 'shinR']);
        if (what === 'top') zb.room = { x0: MON.x - 3.4, z0: MON.z - 3.4, x1: MON.x + 3.4, z1: MON.z + 3.4 };   // (it keeps the top)
      });
    }
  };

  // things that happen a moment from now, in the game's own time (not the page's timers)
  out.soon = [];
  out.later = (t, fn) => out.soon.push([t, fn]);

  /** Each frame: the bridge (and the ambush waiting at its far end), and the bell. */
  out.update = (dt, player, zombies, active) => {
    for (let i = out.soon.length - 1; i >= 0; i--) if ((out.soon[i][0] -= dt) <= 0) { const fn = out.soon[i][1]; out.soon.splice(i, 1); fn(); }
    const bodies = out.bodies ||= [];
    bodies.length = 0;
    for (const z of zombies.list) if (!z.dead && Math.abs(z.pos.x - BX) < 4 && z.pos.z < bridgeA[2] + 1 && z.pos.z > bridgeB[2] - 1) bodies.push(z);
    const near = (Math.hypot(player.pos.x - BX, player.pos.z - (bridgeA[2] + bridgeB[2]) / 2) < 42 && player.pos.y < -5) || bodies.length > 0;
    if (near || bridge.sleeping !== true) bridge.update(dt, player, bodies);
    bridge.sleeping = !near;
    if (active && out.ambush.length) {
      const L = bridge.locate(player.pos.x, player.pos.z);
      if (L && L.s > (bridge.gap[1] + 1) * bridge.span / bridge.N + 0.5 && Math.abs(L.u) < bridge.hw + 0.2 && Math.abs(player.pos.y - BY) < 3.5) {
        out.ambush.forEach((z, i) => out.later(i * 0.3, () => { if (!z.dead) { z.wake(player.pos, 1.8); z.rush = 12; } }));
        out.ambush = [];
        ctx.sfx?.roar?.();
      }
    }
    out.bell?.update(dt, player);
    if (Math.abs(player.pos.x - 47) < 30 && Math.abs(player.pos.z + 277) < 30) for (const z of zombies.list) {
      if (z.variant !== 'plague_bearer' || z.dead || z.gone || !z.root.visible || Math.random() > dt * 14) continue;
      zombies.gore.drop(z.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6)), new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.25, (Math.random() - 0.5) * 0.3), 0.03, MIASMA);
    }
    // the broken graves: earth stirs on them as you come down the gallery, then they come up out of
    // them a few strides ahead of you
    if (active) for (const z of out.erupt) {
      if (z.state !== 'buried') continue;
      const d = Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z);
      if (d < 16 && Math.random() < dt * 1.5) zombies.dirt?.(z.pos, 0.2);
      // (woken far enough ahead that it is up in front of you however fast you come: 1.4 s to rise,
      // so 13 m ahead at a walk, 18 at a run; close by, whichever way you face)
      const vx = player.vel.x, vz = player.vel.z, sp = Math.hypot(vx, vz), ahead = (z.pos.x - player.pos.x) * vx + (z.pos.z - player.pos.z) * vz > 0;
      if ((d < 3.5 || (ahead && d < 3 + sp * 1.6)) && Math.abs(player.pos.y - z.pos.y) < 2) z.wake(player.pos, 1.8);
    }
    // Cindermaw lies in his tomb till you come within reach of it
    // (from the arena's mouth: he is up out of the coals as you reach the sunken floor, not while you
    // stand over him)
    for (const z of zombies.list) if (z.champ?.key === 'abbot' && z.state === 'buried' && Math.hypot(player.pos.x - BOSS[0], player.pos.z - BOSS[2]) < 14.5 && Math.abs(player.pos.y - BOSS[1]) < 4) z.wake(player.pos, 1.5);
    // the grille: lifting once the bell has rung
    out.prompt = ''; out.act = null;
    if (!out.ropeDown) { const ab = zombies.list.find((z) => z.champ?.key === 'abbot'); if (ab?.dead) { out.ropeDown = true; ringRope.visible = true; remember('rope'); out.toast?.("A bell-rope drops into the abbot's apse: the ringers' way home"); } }
    if (out.ropeDown && Math.hypot(player.pos.x - ROPE.x, player.pos.z - ROPE.z) < 1.8 && Math.abs(player.pos.y - ROPE.y) < 2) {
      out.prompt = "E — take the ringers' rope up to their crypt";
      out.act = () => { player.pos.set(5, Y1, -121.5); player.vel.set(0, 0, 0); player.yaw = 0; ctx.sfx?.toll?.(); };
    }
    if (grilleBox.off) { if (grille.position.y < Y4 + GR.h - 0.3) grille.position.y += dt * 3.2; }   // (up in under two seconds)
    else if (Math.hypot(player.pos.x - GR.x, player.pos.z - GR.z) < 3.2 && Math.abs(player.pos.y - Y4) < 2) out.prompt = 'An iron grille bars the Abbots\' Gallery. It is chained to the First Bell above';
  };
  const remember = (k) => { try { localStorage.setItem('bm.taken.' + k, '1'); } catch { /* no storage */ } };
  const remembered = (k) => { try { return !!localStorage.getItem('bm.taken.' + k); } catch { return false; } };
  out.openGrille = () => { if (grilleBox.off) return false; grilleBox.off = true; ctx.sfx?.door?.(true); remember('grille'); return true; };
  if (remembered('grille')) { grilleBox.off = true; grille.position.y = Y4 + GR.h - 0.3; }
  if (remembered('rope')) { out.ropeDown = true; ringRope.visible = true; }

  // ======================================================== the First Bell
  out.bell = makeBell(ctx, BELL, meshes, () => out.openGrille(), (t, fn) => out.later(t, fn));
  out.meshes = meshes;
  meshes.push(ringRope, grille);
  return out;

  // ---------------------------------------------------------------- a clustered column
  /** A gothic column of four shafts round a core, on a moulded octagonal base, with a capital the
   * vault's ribs spring from: slender (a metre through at 10 m), not a stretched prop. */
  function column(x, y, z, h) {
    const st = M('castle_keep_pale_keep_limestone', 1.5), dark = M('castle_keep_sootdark_great_hall', 1.5);
    b.lathe(x, z, [[0.78, 0], [0.78, 0.32], [0.66, 0.42], [0.6, 0.62], [0.52, 0.7], [0, 0.7]], 8, st, { y });
    b.cylinder([x, y + 0.6, z], [x, y + h - 0.6, z], 0.36, 10, dark, { caps: false, shade: 0.85 });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; b.cylinder([x + Math.cos(a) * 0.36, y + 0.6, z + Math.sin(a) * 0.36], [x + Math.cos(a) * 0.36, y + h - 0.6, z + Math.sin(a) * 0.36], 0.17, 8, st, { caps: false, shade: 0.92 }); }
    b.lathe(x, z, [[0.5, 0], [0.62, 0.18], [0.74, 0.42], [0.86, 0.5], [0.86, 0.66], [0, 0.66]], 8, st, { y: y + h - 0.66 });
    physics.add([x - 0.56, y, z - 0.56], [x + 0.56, y + h, z + 0.56], 'prop');
  }

  // ---------------------------------------------------------------- the Founders' Tomb
  /** An octagonal prism centred on (cx, cz), its faces square to the axes (apothem a), from y0 to
   * y1: carved panels round its sides, a cap, a moulded lip. */
  function octPrism(cx, cz, a, y0, y1, side, cap, lip) {
    const R = a / Math.cos(Math.PI / 8), pts = Array.from({ length: 8 }, (_, i) => { const t = Math.PI / 8 + i * Math.PI / 4; return [cx + Math.cos(t) * R, cz + Math.sin(t) * R]; });
    let per = 0;
    for (let i = 0; i < 8; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 8], L = Math.hypot(bx - ax, bz - az);
      mason.sheet(side, [[[ax, y0, az], [bx, y0, bz]], [[ax, y1, az], [bx, y1, bz]]], [[[per, 0], [per + L, 0]], [[per, y1 - y0], [per + L, y1 - y0]]], [(ax + bx) / 2 * 2 - cx, (y0 + y1) / 2, (az + bz) / 2 * 2 - cz], 0.85);
      per += L;
    }
    mason.flat(cap, pts, y1, true, 0.95);
    if (lip) for (let i = 0; i < 8; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 8]; mason.band(lip, [[ax, y1 - 0.12, az], [bx, y1 - 0.12, bz]], 0.26, 0.14, [(ax + bx) - cx, y1 - 0.12, (az + bz) - cz]); }
    return pts;
  }

  /** Three octagonal tiers, their sides carved with the funerary chapel's reliefs, a moulded lip to
   * each; the grand stair up the south face with its landing; on top, the founders' sarcophagus
   * under a canopy of four columns and a dome. */
  function monument(m) {
    const relief = M('catacombs_wall_funerary_chapel', 2.5), cap = M('castle_keep_royal_inlay_slab', 2), lip = M('castle_keep_ivory_chapel_marble', 1), step = M(STONE.founders.step, 1);
    let below = 0;
    for (const [a, ht] of T) {
      const pts = octPrism(MON.x, MON.z, a, Y3 + below, Y3 + ht, relief, cap, lip);
      for (let i = 0; i < 8; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 8]; mason.band(lip, [[ax, Y3 + below + 0.18, az], [bx, Y3 + below + 0.18, bz]], 0.36, 0.12, [(ax + bx) - MON.x, Y3 + below, (az + bz) - MON.z]); }
      below = ht;
    }
    // the flight: treads and risers (its landing is the 14th), and its cheeks
    for (let k = 0; k < 30; k++) {
      const t0 = k < 14 ? k * 0.5 : k === 14 ? 7 : 8.5 + (k - 15) * 0.5, t1 = k < 14 ? t0 + 0.5 : k === 14 ? 8.5 : t0 + 0.5;
      if (k > 29) break;
      const h = stairUp(FOOT - (t0 + 0.01));
      if (h == null) continue;
      const z0 = FOOT - t0, z1 = FOOT - t1;
      b.box([MON.x - SW, Y3, Math.min(z0, z1)], [MON.x + SW, h, Math.max(z0, z1)], step, { solid: false, shade: 0.9 });
    }
    // the cheeks: a wall each side the height of a parapet over the nosings, sloping with the flight
    // (level along the landing), coped; held by the colliders of a stepped wall under them
    const coping = M('castle_keep_ivory_chapel_marble', 1.2);
    for (const sx of [-1, 1]) {
      const xi = MON.x + sx * SW, xo = MON.x + sx * (SW + 0.34), nose = (t) => (t < 7 ? Y3 + t * 0.5 : t < 8.5 ? Y3 + 3.5 : Y3 + 3.5 + (t - 8.5) * 0.5) + 0.9;
      const ts = [0, 7, 8.5, 15.5];
      for (let k = 0; k + 1 < ts.length; k++) {
        const t0 = ts[k], t1 = ts[k + 1], z0 = FOOT - t0, z1 = FOOT - t1, h0 = nose(t0), h1 = nose(t1);
        const top0 = tierAt(xo + sx * 0.2, z0), top1 = tierAt(xo + sx * 0.2, z1);
        if (top0 != null && top1 != null && top0 > h0 && top1 > h1) continue;           // (inside the tiers: they are its cheek)
        for (const x of [xi, xo]) mason.sheet(lip, [[[x, Y3, z0], [x, Y3, z1]], [[x, h0, z0], [x, h1, z1]]], [[[z0, 0], [z1, 0]], [[z0, h0 - Y3], [z1, h1 - Y3]]], [x + (x === xo ? sx : -sx) * 3, (h0 + h1) / 2, (z0 + z1) / 2], 0.82);
        mason.sheet(coping, [[[xi - sx * 0.05, h0, z0], [xi - sx * 0.05, h1, z1]], [[xo + sx * 0.05, h0, z0], [xo + sx * 0.05, h1, z1]]], [[[0, z0], [0, z1]], [[0.44, z0], [0.44, z1]]], [MON.x + sx * 2, Math.max(h0, h1) + 3, (z0 + z1) / 2], 0.95);
      }
      for (let t = 0; t < 15.5; t += 0.5) {
        const z0 = FOOT - t, z1 = FOOT - t - 0.5;
        physics.add([Math.min(xi, xo), Y3, Math.min(z0, z1)], [Math.max(xi, xo), nose(t + 0.5), Math.max(z0, z1)], 'prop');
      }
      // newels: a block at the foot and at the landing, a brazier on each
      for (const t of [0, 7.6]) {
        const z = FOOT - t, h = nose(t) + 0.35;
        const xa = xo - sx * 0.62, xb = xo + sx * 0.05;
        b.box([Math.min(xa, xb), Y3, z - 0.42], [Math.max(xa, xb), h, z + 0.42], lip, { shade: 0.85, tag: 'prop' });
        burner('catacombs_incense_brazier', xo - sx * 0.28, h, z, 0.55, 0.32);
      }
    }
    // the canopy: four columns on the top tier's corners, an entablature, a dome; braziers within
    const top = Y3 + 7, gold = M('met_09_oxide_stained_brass', 1);
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) column(MON.x + dx, top, MON.z + dz, 3.6);
    octPrism(MON.x, MON.z, 2.75, top + 3.6, top + 4.1, lip, lip, null);
    b.lathe(MON.x, MON.z, [[2.6, 0], [2.4, 0.5], [1.9, 1.1], [1.1, 1.55], [0.35, 1.75], [0.18, 2.1], [0.3, 2.3], [0, 2.4]], 16, gold, { y: top + 4.1 });
    props.add('sarcophagus', MON.x, top, MON.z, Math.PI / 2, 1.25);
    burner('catacombs_incense_brazier', MON.x - 1.2, top, MON.z - 1.9, 0.9, 0.42); burner('catacombs_incense_brazier', MON.x + 1.2, top, MON.z - 1.9, 0.9, 0.42);
    // mourners kneel on the first tier, facing in
    for (const [dx, dz, r] of [[-6.6, -2.5, Math.PI / 2], [6.6, -2.5, -Math.PI / 2], [-6.6, 2.5, Math.PI / 2], [6.6, 2.5, -Math.PI / 2]]) sprite('cathedral_graveyard_hooded_mourner', MON.x + dx, Y3 + 2.5, MON.z + dz, 1, r);
    void m;
  }

  // ---------------------------------------------------------------- the Bell Shrine's tribune
  /** The balcony the Stair Hall comes out on, high on the shrine's south wall, and the horseshoe of
   * two flights down from it along the wall: its front a curved face of stone to the floor, a
   * parapet along its edge. Matches tribuneAt. */
  function tribune(m) {
    const st = M('castle_keep_charcoal_guardstone', 1.2), face = M('catacombs_wall_funerary_chapel_back', 5), par = M('castle_keep_pale_keep_limestone', 1);
    const pt = (r, a, y) => [12 + Math.cos(a) * r, y, -356 + Math.sin(a) * r];
    const N = 14;
    // the balcony's floor and its front
    const rowsF = [], fuv = [];
    for (let i = 0; i <= N; i++) { const a = TR.a0 + (TR.a1 - TR.a0) * i / N; rowsF.push([pt(TR.r0, a, TRIB), pt(15.2, a, TRIB)]); fuv.push([[a * 13, 0], [a * 13, 3.8]]); }
    mason.sheet(st, [rowsF.map((r) => r[0]), rowsF.map((r) => r[1])], [fuv.map((u) => u[0]), fuv.map((u) => u[1])], [12, TRIB + 5, -356], 0.95);
    const front = [[], []], fu = [[], []];
    for (let i = 0; i <= N; i++) { const a = TR.a0 + (TR.a1 - TR.a0) * i / N; front[0].push(pt(TR.r0, a, Y4)); front[1].push(pt(TR.r0, a, TRIB)); fu[0].push([a * TR.r0, 0]); fu[1].push([a * TR.r0, TRIB - Y4]); }
    mason.sheet(face, front, fu, [12, Y4 + 2, -356], 0.8);
    // the parapet along its edge
    for (const [rr, out2] of [[TR.r0, true], [TR.r0 + 0.3, false]]) {
      const rows = [[], []], uv = [[], []];
      for (let i = 0; i <= N; i++) { const a = TR.a0 + (TR.a1 - TR.a0) * i / N; rows[0].push(pt(rr, a, out2 ? Y4 : TRIB)); rows[1].push(pt(rr, a, TRIB + 1.0)); uv[0].push([a * rr, 0]); uv[1].push([a * rr, 1]); }
      if (out2) { for (let i = 0; i <= N; i++) rows[0][i] = pt(rr, TR.a0 + (TR.a1 - TR.a0) * i / N, TRIB); }
      mason.sheet(par, rows, uv, out2 ? [12, TRIB, -356] : [12, TRIB + 0.5, -356 + 20], 0.85);
    }
    { const rows = [[], []], uv = [[], []];
      for (let i = 0; i <= N; i++) { const a = TR.a0 + (TR.a1 - TR.a0) * i / N; rows[0].push(pt(TR.r0 - 0.06, a, TRIB + 1.0)); rows[1].push(pt(TR.r0 + 0.36, a, TRIB + 1.0)); uv[0].push([a * 12, 0]); uv[1].push([a * 12, 0.42]); }
      mason.sheet(M('castle_keep_ivory_chapel_marble', 1), rows, uv, [12, TRIB + 4, -356], 0.95); }
    // the two flights: treads, risers, the curved face under them, a parapet to the 18th step
    for (const [from, sgn] of [[TR.a0, -1], [TR.a1, 1]]) {
      for (let k = 0; k < TR.n; k++) {
        const a0 = from + sgn * TR.sweep * k / TR.n, a1 = from + sgn * TR.sweep * (k + 1) / TR.n, h = TRIB - (k + 1) * (TRIB - Y4) / TR.n, hp = TRIB - k * (TRIB - Y4) / TR.n;
        mason.flat(st, [[12 + Math.cos(a0) * TR.r0, -356 + Math.sin(a0) * TR.r0], [12 + Math.cos(a0) * 15.2, -356 + Math.sin(a0) * 15.2], [12 + Math.cos(a1) * 15.2, -356 + Math.sin(a1) * 15.2], [12 + Math.cos(a1) * TR.r0, -356 + Math.sin(a1) * TR.r0]], h, true, 0.95);
        mason.sheet(st, [[pt(TR.r0, a0, h), pt(15.2, a0, h)], [pt(TR.r0, a0, hp), pt(15.2, a0, hp)]], [[[0, 0], [3.8, 0]], [[0, 0.25], [3.8, 0.25]]], pt(TR.r0 + 1.8, a0 + sgn * 0.3, h), 0.75);
        mason.sheet(face, [[pt(TR.r0, a0, Y4), pt(TR.r0, a1, Y4)], [pt(TR.r0, a0, h), pt(TR.r0, a1, h)]], [[[a0 * TR.r0, 0], [a1 * TR.r0, 0]], [[a0 * TR.r0, h - Y4], [a1 * TR.r0, h - Y4]]], [12, Y4 + 1, -356], 0.8);
        if (k < TR.n - 2) mason.band(par, [pt(TR.r0 + 0.12, a0, hp + 0.5), pt(TR.r0 + 0.12, a1, h + 0.5)], 1.0, 0.25, [12, h, -356]);
      }
    }
    // braziers either end of the balcony, to see the bell by
    for (const a of [TR.a0 + 0.08, TR.a1 - 0.08]) { const [x, , z] = pt(13.6, a, TRIB); burner('catacombs_incense_brazier', x, TRIB, z, 1, 0.45); }
    void m;
  }

  // ---------------------------------------------------------------- the Charnel's pit
  function charnelPit(m) {
    const fl = M(STONE.charnel.floor, 2.5), wall = M('catacombs_wall_ossuary_niches', 2.5), st = M('catacombs_black_basalt', 1);
    // the walk round the rim (the room's floor with the pit's hole in it)
    const hole = Array.from({ length: 36 }, (_, i) => { const a = -i / 36 * Math.PI * 2; return new THREE.Vector2(CH.x + Math.cos(a) * CH.pit, CH.z + Math.sin(a) * CH.pit); });
    const shape = charnel.poly.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(shape, [hole]), all = [...shape, ...hole], P = [], U = [];
    for (let [a, bb, c] of tris) {
      const A = all[a], B = all[bb], C = all[c];
      if ((B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y) < 0) [bb, c] = [c, bb];
      for (const v of [a, bb, c]) { P.push(all[v].x, Y4, all[v].y); U.push(all[v].x, -all[v].y); }
    }
    b.raw(fl, P, U, 0.9);
    // its wall (niches of bones), and the floor of bones far down
    const rows = [[], []], uv = [[], []];
    for (let i = 0; i <= 36; i++) { const a = i / 36 * Math.PI * 2; rows[0].push([CH.x + Math.cos(a) * CH.pit, PIT, CH.z + Math.sin(a) * CH.pit]); rows[1].push([CH.x + Math.cos(a) * CH.pit, Y4, CH.z + Math.sin(a) * CH.pit]); uv[0].push([a * CH.pit, 0]); uv[1].push([a * CH.pit, 2.5]); }
    mason.sheet(wall, rows, uv, [CH.x, PIT + 1, CH.z], 0.7);
    mason.flat(M('catacombs_ossuary_aggregate', 1.5), Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2; return [CH.x + Math.cos(a) * (CH.pit + 0.05), CH.z + Math.sin(a) * (CH.pit + 0.05)]; }), PIT, true, 0.75);
    // the stair down, east (treads, and its two cheeks of bone-wall)
    for (let k = 1; k <= 10; k++) {
      const x0 = CH.x - 0.4 + (k - 1) * 0.5, x1 = x0 + 0.5, h = PIT + k * 0.25;
      if (x1 < CH.x) continue;
      b.box([Math.max(CH.x, x0), PIT, CH.z - 1.1], [Math.min(CH.x + CH.pit + 0.1, x1), h, CH.z + 1.1], st, { solid: false, shade: 0.85 });
    }
    // bones heaped deep in it, and against the rim above
    for (let k = 0; k < 9; k++) { const a = k * 0.7 + 1.9, r = 1.4 + (k % 3) * 1.0; if (Math.cos(a) > 0.6) continue; sprite(['catacombs_long_bone_heap', 'catacombs_skull_pyramid', 'catacombs_supine_skeleton'][k % 3], CH.x + Math.cos(a) * r, PIT, CH.z + Math.sin(a) * r, 1.25); }
    for (let k = 0; k < 5; k++) { const a = (110 + k * 36) * DEG; sprite('catacombs_skull_pyramid', CH.x + Math.cos(a) * 5.8, Y4, CH.z + Math.sin(a) * 5.8, 1); }
    burner('catacombs_iron_candelabrum', CH.x + 3.7, Y4, CH.z + 4.4, 1, 0.22);
    flames.push([CH.x - 1.5, PIT + 0.4, CH.z + 1.4, 0.18, 1]);
    void m;
  }

  // ---------------------------------------------------------------- Cindermaw's arena
  /** The tomb's floor: flagstones out to the wall, then three rings stepping down to the sunken
   * middle where the abbot burns. */
  function arena(m) {
    const fl = M(STONE.tomb.floor, 2.5), stp = M(STONE.tomb.step, 1.2, { side: THREE.DoubleSide });
    const hole = Array.from({ length: 40 }, (_, i) => { const a = -i / 40 * Math.PI * 2; return new THREE.Vector2(46 + Math.cos(a) * 7.5, -396 + Math.sin(a) * 7.5); });
    const shape = tomb.poly.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(shape, [hole]), all = [...shape, ...hole], P = [], U = [];
    for (let [a, bb, c] of tris) {
      const A = all[a], B = all[bb], C = all[c];
      if ((B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y) < 0) [bb, c] = [c, bb];
      for (const v of [a, bb, c]) { P.push(all[v].x, Y5, all[v].y); U.push(all[v].x, -all[v].y); }
    }
    b.raw(fl, P, U, 0.9);
    b.lathe(46, -396, [[7.5, 0], [7.5, -0.4], [6.5, -0.4], [6.5, -0.8], [5.5, -0.8], [5.5, -1.2], [0, -1.2]], 48, stp, { y: Y5 });
    void m;
  }

  // ---------------------------------------------------------------- the bell's plinth and stair
  function bellPlinth(m) {
    const st = M('catacombs_black_basalt', 2), tread = M('castle_keep_charcoal_guardstone', 1), wallM = M('castle_keep_sootdark_great_hall', 1.5);
    const PL = M('catacombs_black_basalt', 2, { side: THREE.DoubleSide });
    b.lathe(BELL.x, BELL.z, [[BELL.r + 0.55, 0], [BELL.r + 0.5, 0.3], [BELL.r + 0.12, 0.6], [BELL.r, 0.9], [BELL.r, 3.3], [BELL.r + 0.16, 3.42], [BELL.r + 0.16, 3.62], [BELL.r, 3.74],
      [BELL.r, 6.4], [BELL.r + 0.3, 6.62], [BELL.r + 0.42, 6.84], [BELL.r + 0.42, 7], [0, 7]], 32, PL, { y: Y4 });
    void st;
    // the bell-cote on top: an arch of pale stone on two piers, each on a moulded base under a
    // capital, the bell hung on chains from the arch's crown
    const pale = M('castle_keep_pale_keep_limestone', 1.5), ivory = M('castle_keep_ivory_chapel_marble', 1), BT = BELL.top, SPR = 5.3;
    for (const dx of [-2.5, 2.5]) {
      const x = BELL.x + dx;
      b.box([x - 0.55, BT, BELL.z - 0.6], [x + 0.55, BT + 0.32, BELL.z + 0.6], ivory, { shade: 0.85, tag: 'prop' });
      b.box([x - 0.48, BT + 0.32, BELL.z - 0.53], [x + 0.48, BT + 0.5, BELL.z + 0.53], ivory, { solid: false, shade: 0.9 });
      b.box([x - 0.4, BT + 0.5, BELL.z - 0.45], [x + 0.4, BT + SPR - 0.3, BELL.z + 0.45], pale, { shade: 0.85, tag: 'prop' });
      b.box([x - 0.5, BT + SPR - 0.3, BELL.z - 0.55], [x + 0.5, BT + SPR - 0.12, BELL.z + 0.55], ivory, { solid: false, shade: 0.9 });
      b.box([x - 0.56, BT + SPR - 0.12, BELL.z - 0.6], [x + 0.56, BT + SPR, BELL.z + 0.6], ivory, { solid: false, shade: 0.95 });
    }
    { const ri = 2.1, re = 2.72, cy = BT + SPR, N = 16, rows = { I: [[], []], E: [[], []] };
      for (let k = 0; k <= N; k++) {
        const th = Math.PI * k / N, c = Math.cos(th), sn = Math.sin(th);
        for (const [s, zz] of [[0, BELL.z - 0.45], [1, BELL.z + 0.45]]) { rows.I[s].push([BELL.x + c * ri, cy + sn * ri, zz]); rows.E[s].push([BELL.x + c * re, cy + sn * re, zz]); }
      }
      const uv = (pts, w) => pts.map((_, k) => [Math.PI * k / N * w, 0]);
      for (const s of [0, 1]) mason.sheet(pale, [rows.I[s], rows.E[s]], [uv(rows.I[s], ri), uv(rows.E[s], ri).map(([u]) => [u, re - ri])], [BELL.x, cy + 1, BELL.z + (s ? 4 : -4)], 0.9);
      mason.sheet(pale, [rows.I[0], rows.I[1]], [uv(rows.I[0], ri), uv(rows.I[1], ri).map(([u]) => [u, 0.9])], [BELL.x, cy, BELL.z], 0.7);
      mason.sheet(pale, [rows.E[0], rows.E[1]], [uv(rows.E[0], re), uv(rows.E[1], re).map(([u]) => [u, 0.9])], (p) => [BELL.x + (p[0] - BELL.x) * 3, cy + (p[1] - cy) * 3, p[2]], 0.85);
      // (a keystone, and a moulding round the arch's face)
      b.box([BELL.x - 0.24, cy + ri - 0.06, BELL.z - 0.5], [BELL.x + 0.24, cy + re + 0.12, BELL.z + 0.5], ivory, { solid: false, shade: 0.95 });
      for (const zz of [BELL.z - 0.46, BELL.z + 0.46]) { const arc = []; for (let k = 0; k <= N; k++) { const th = Math.PI * k / N; arc.push([BELL.x + Math.cos(th) * (re - 0.08), cy + Math.sin(th) * (re - 0.08), zz]); } mason.band(ivory, arc, 0.18, 0.08, [BELL.x, cy, zz + (zz > BELL.z ? 3 : -3)]); } }
    burner('catacombs_incense_brazier', BELL.x - 1.4, BELL.top, BELL.z + 2.4, 0.9, 0.42); burner('catacombs_incense_brazier', BELL.x + 1.4, BELL.top, BELL.z - 2.4, 0.9, 0.42);
    flames.push([BELL.x, BELL.top + 1.2, BELL.z, 0.42, 1]);                 // (and a light under its lip, so the bronze reads)
    // the treads: a wedge each, the outer face of the stair a curtain of stone down to the floor
    const n = 30, sweep = Math.PI * 2 * BELL.turn;
    const stepOf = (slot) => (slot < 14 ? slot + 1 : slot < 16 ? 14 : Math.min(28, slot - 1));   // (as spiralAt: a landing half way)
    for (let k = 0; k < n; k++) {
      const a0 = BELL.a0 + sweep * k / n, a1 = BELL.a0 + sweep * (k + 1) / n, y = Y4 + stepOf(k) * 0.25;
      const P = [], U = [];
      const pt = (rr, a, yy) => [BELL.x + Math.cos(a) * rr, yy, BELL.z + Math.sin(a) * rr];
      // (UVs in metres: the treads by where they lie, the faces round and up)
      const uvOf = (V, face) => (face ? [Math.atan2(V[2] - BELL.z, V[0] - BELL.x) * BELL.R, V[1] - Y4] : [V[0], -V[2]]);
      let face = false;
      const quad = (A, B, C, D) => { P.push(...A, ...C, ...B, ...A, ...D, ...C); for (const V of [A, C, B, A, D, C]) U.push(...uvOf(V, face)); };
      quad(pt(BELL.r, a0, y), pt(BELL.R, a0, y), pt(BELL.R, a1, y), pt(BELL.r, a1, y));                 // the tread
      face = true;
      quad(pt(BELL.r, a0, y - (k === 15 ? 0.001 : 0.25)), pt(BELL.R, a0, y - (k === 15 ? 0.001 : 0.25)), pt(BELL.R, a0, y), pt(BELL.r, a0, y));  // its riser (none at the landing)
      quad(pt(BELL.R, a0, Y4), pt(BELL.R, a1, Y4), pt(BELL.R, a1, y), pt(BELL.R, a0, y));             // the outer face
      // (the winding of each is fixed by its normal: up, back along the stair, out)
      const fix = (i0, want) => {
        const A = P.slice(i0, i0 + 3), B = P.slice(i0 + 3, i0 + 6), C = P.slice(i0 + 6, i0 + 9);
        const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (nn[0] * want[0] + nn[1] * want[1] + nn[2] * want[2] < 0) { for (let t = i0; t < i0 + 18; t += 9) { const tmp = P.slice(t + 3, t + 6); P.splice(t + 3, 3, ...P.slice(t + 6, t + 9)); P.splice(t + 6, 3, ...tmp); } }
      };
      const am = (a0 + a1) / 2;
      fix(0, [0, 1, 0]); fix(18, [Math.sin(a0), 0, -Math.cos(a0)]); fix(36, [Math.cos(am), 0, Math.sin(am)]);
      b.raw(tread, P.slice(0, 36), U.slice(0, 24), 0.95);
      b.raw(wallM, P.slice(36), U.slice(24), 0.8);
      // the low wall on its outer edge (the raster's lip): a parapet of the same stone, from the sixth step
      if (stepOf(k) <= 5) continue;
      const lipP = [], lipU = [], hh = y + 0.55, ri = BELL.R - 0.22;
      const q4 = (A, B, C, D) => { lipP.push(...A, ...B, ...C, ...A, ...C, ...D); for (const V of [A, B, C, A, C, D]) lipU.push(...uvOf(V, true)); };
      q4(pt(ri, a0, hh), pt(ri, a1, hh), pt(BELL.R, a1, hh), pt(BELL.R, a0, hh));
      q4(pt(ri, a0, y), pt(ri, a1, y), pt(ri, a1, hh), pt(ri, a0, hh));
      q4(pt(BELL.R, a0, y), pt(BELL.R, a1, y), pt(BELL.R, a1, hh), pt(BELL.R, a0, hh));
      b.raw(M('castle_keep_sootdark_great_hall', 1.5, { side: THREE.DoubleSide }), lipP, lipU, 0.8);
    }
    // its end, where the top tread meets the stair's foot: a pier of dressed stone up to the platform
    { const a = BELL.a0 + sweep + 0.03, rr = (BELL.r + BELL.R) / 2 + 0.25;
      column(BELL.x + Math.cos(a) * rr, Y4, BELL.z + Math.sin(a) * rr, 7.6); }   // (the newel the stair ends on)
    // candles up the stair, every few treads
    for (let k = 3; k < n; k += 6) { const a = BELL.a0 + sweep * (k + 0.5) / n; sprite('catacombs_vigil_candles', BELL.x + Math.cos(a) * (BELL.R - 0.6), Y4 + stepOf(k) * 0.25, BELL.z + Math.sin(a) * (BELL.R - 0.6), 0.8); }
    void m;
  }
}

/** The First Bell of Bellmourn: bronze, hung on chains over the plinth; E beneath it rings it,
 * and the dead of the Deep Undercroft all hear. It swings when struck. */
function makeBell(ctx, BELL, meshes, onRing = null, later = (t, fn) => fn()) {
  const { lib, scene } = ctx;
  const prof = [[1.62, 0], [1.66, 0.12], [1.5, 0.34], [1.28, 0.9], [1.12, 1.7], [1.02, 2.5], [0.96, 3.0], [0.7, 3.35], [0.3, 3.5], [0, 3.52]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y - 3.5)), 32);
  const tex = lib.material('met_04_tarnished_bronze', { tile: 1.5 });
  const mat = new THREE.MeshPhongMaterial({ map: tex.map, normalMap: tex.normalMap || null, normalScale: new THREE.Vector2(0.3, 0.3), color: 0xc89a5a, specular: 0x8a6a3a, shininess: 46, side: THREE.DoubleSide });
  const bell = new THREE.Mesh(g, mat);
  // (two smooth bands cast round it, its inscription's, at the shoulder and above the lip)
  const bandM = new THREE.MeshPhongMaterial({ color: 0xb08850, specular: 0x9a7a48, shininess: 60 });
  for (const [r, y] of [[1.43, -2.95], [1.0, -0.72]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 6, 32).rotateX(Math.PI / 2), bandM); ring.position.y = y; bell.add(ring); }
  // (it swings from the arch's crown, where its chains are made fast: chains, yoke, bell and clapper
  // all hang from that one point, so the chains never leave the stone)
  const pivot = new THREE.Group(), hung = new THREE.Group();
  const hangY = BELL.top + 6.05, crown = BELL.top + 5.3 + 2.1, D = hangY - crown;
  pivot.position.set(BELL.x, crown, BELL.z);
  hung.position.y = D;
  pivot.add(hung); hung.add(bell);
  bell.castShadow = false; bell.receiveShadow = true;   // (the torches' shadow maps are drawn once: its swing would never show in them)
  // its yoke, a timber block bolted to its crown, and the two chains up to the arch
  const ironM = new THREE.MeshPhongMaterial({ color: 0x242220, specular: 0x4a4440, shininess: 30 });
  const yoke = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.6), new THREE.MeshPhongMaterial({ color: 0x3a2a1a, shininess: 6 }));
  yoke.position.y = 0.1;
  hung.add(yoke);
  { const link = new THREE.TorusGeometry(0.055, 0.016, 4, 8), M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const ends = [[-0.6, D + 0.3, -0.42, -0.04], [0.6, D + 0.3, 0.42, -0.04]], per = 12;
    const chains = new THREE.InstancedMesh(link, ironM, ends.length * per);
    let i = 0;
    for (const [x0, y0, x1, y1] of ends) for (let k = 0; k < per; k++) {
      const t = (k + 0.5) / per, ang = Math.atan2(x1 - x0, y1 - y0);
      e.set(0, k % 2 ? Math.PI / 2 : 0, -ang + Math.PI / 2, 'YXZ'); q.setFromEuler(e);
      M4.compose(new THREE.Vector3(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0), q, new THREE.Vector3(1, 1, 1));
      chains.setMatrixAt(i++, M4);
    }
    pivot.add(chains); }
  // its clapper: an iron rod and ball inside it, swinging a beat behind the bell
  const clapper = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6).translate(0, -1.55, 0), ironM), ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), ironM);
  ball.position.y = -2.95;
  clapper.add(rod, ball); clapper.position.y = -0.1;
  hung.add(clapper);
  scene.add(pivot);
  meshes.push(pivot);
  const state = { pivot, swing: 0, v: 0, cool: 0, clap: 0, at: new THREE.Vector3(BELL.x, BELL.top, BELL.z) };
  state.update = (dt, player) => {
    state.v += -state.swing * 9 * dt; state.v *= Math.exp(-dt * 0.35); state.swing += state.v * dt;
    pivot.rotation.x = state.swing; pivot.rotation.z = state.swing * 0.25;   // (sideways a little: clear of the cote's piers)
    state.clap += (-state.swing * 0.7 - state.clap) * Math.min(1, dt * 5); clapper.rotation.x = state.clap;
    state.cool -= dt;
    const under = Math.hypot(player.pos.x - BELL.x, player.pos.z - BELL.z) < 2.8 && Math.abs(player.pos.y - BELL.top) < 0.6;
    state.prompt = under && state.cool <= 0 ? 'E — ring the First Bell' : '';
  };
  state.ring = (zombies, sfx, hud) => {
    if (state.cool > 0) return;
    state.cool = 6; state.v += 0.7;
    sfx?.toll?.();
    zombies.noise(state.at, 90);
    for (const z of zombies.list) {
      if (z.dg?.name !== 'The Deep Undercroft' || z.dead || z.gone || z.champ) continue;
      if (z.dg.where?.(z.pos) === "Cindermaw's Tomb") continue;      // (his own keep their places round him)
      const d = z.pos.distanceTo(state.at);
      // (all of them up within a second: a horde, not a trickle; rushing long enough to hurry all
      // the way up the spiral)
      later(Math.min(0.8, d * 0.03), () => { if (z.state === 'playdead' || z.state === 'buried') z.wake(state.at); else z.hunt(state.at, true); z.rush = 25; });
    }
    const opened = onRing?.();
    hud?.toast(opened ? "The First Bell tolls. Somewhere east a grille grinds up, and the dead are coming" : 'The First Bell tolls through the Deep Undercroft, and the dead come');
  };
  return state;
}

