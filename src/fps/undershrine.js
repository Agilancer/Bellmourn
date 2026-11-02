// The Undershrine of Velscour: under the Bell Tower of the Four Watches (belltower.js), down the old
// founders' shaft from the iron hatch in the Bellwright's hall. Built to docs/DUNGEON_BUILDING.md:
// one spine going down in four stages, each sealed by a gate whose key a sub-boss carries, a branch
// off each stage that pays, and the dead and the Vigil placed where they would be.
//
// Who made it: the abbots' bellfounders cut a shaft and a casting pit under the knoll to cast the
// four bells. Long after, Velscour's adepts found the pit, dug on down past it into the old rock,
// and raised a shrine to their lord at the bottom: a round cathedral round a colossus of him, where
// Magister Morcant, the Violet Hand, works the rite the bells' ringing at noon and midnight holds
// back (the Bellwright, Orrin, was once his brother adept).
//
//   Shaft, from the hall (y ~13.6) to -12: a stone stair spiralling down round a newel, four and a
//     half turns, torches every half turn. Compression, then the reveal at its foot.
//   Stage I, -12: the Founders' Pit (arrival): the domed casting hall, the great broken mould of the
//     first bell on its kerbed pit in the middle, the founders' dead risen from the slag. West, the
//     Pattern Loft (a branch: the founders' wooden patterns, and their strongbox). East, the Great
//     Furnace (Brother Slag, the Furnace-Warden, risen from it: the Iron Key). North, the Iron Gate.
//   Stage II, -20: the Cloister of the Vigil: the adepts' arcaded court round a dry basin with Velscour's
//     sigil in it, Sworn knights and adepts at their posts. West, the Scriptorium (a branch: their
//     grimoire). North, the Oath Hall (Ser Hollin Vane: the Bronze Key). East, the Bronze Gate.
//   Stage III, -28: the Drowned Ossuary: where the adepts threw their dead; the seep has flooded its
//     floor ankle deep and the drowned lie in it. North, the Bone Chapel (a branch: the weird thing
//     the adepts made of their dead, and a relic). South, the Murrain Pit (Mother Murrain: the Silver
//     Key). East, the Silver Gate.
//   Stage IV, -36: the Processional, a grand stair east under the cliff, to the Hall of Kneeling
//     (the honour guard), and through it the Shrine of Velscour: a round domed cathedral-arena 44 m
//     across round a colossus of Velscour on his dais, braziers of violet and green fire, pillars to
//     break line, his sigil inlaid in the floor. Morcant fights here, in five phases (BossMage).
import * as THREE from 'three';
import { Mason, ring, chamfered } from './mason.js';
import { TOWER } from './belltower.js';

export const Y = { A: -12, B: -20, C: -28, D: -36 };
const SHAFT = { x: TOWER.x, z: TOWER.z - 1.3, r: 2.0, newel: 0.45, turns: 4.5 };
const PIT = { x: 668, z: -226.5, r: 10 };                    // the Founders' Pit
const FURNACE = { x: 689, z: -226.5, r: 6.5 };
const CLOISTER = { x: 668, z: -273 };
const OATH = { x: 668, z: -298 };
const OSSUARY = { x: 713, z: -273 };
const MURRAIN = { x: 713, z: -251.5, r: 6.5 };
const CHAPEL = { x: 713, z: -293, r: 5.5 };
const KNEEL = { x: 753, z: -273 };
const ARENA = { x: 785, z: -273, r: 22 };
const STATUE = { x: 797, z: -273 };                          // in the arena's east apse, facing west
const SIGIL = 'art/velscour/sigil_cut.png';
const DEG = Math.PI / 180;

// the surfaces, by who built each place
const STONE = {
  founders: { floor: 'catacombs_charcoal_flagstone', wall: 'catacombs_wall_crypt_ashlar', roof: 'castle_soot', trim: 'catacombs_burial_terracotta', step: 'catacombs_charcoal_flagstone' },
  furnace: { floor: 'myth_06_volcanic_shrine_1_01', wall: 'castle_basalt', roof: 'castle_soot', trim: 'met_04_tarnished_bronze', step: 'castle_basalt' },
  loft: { floor: 'town_oak_boards', wall: 'catacombs_wall_crypt_ashlar', roof: 'castle_soot', trim: 'catacombs_burial_terracotta' },
  vigil: { floor: 'castle_keep_royal_inlay_slab', wall: 'castle_keep_sootdark_great_hall', roof: 'catacombs_black_basalt', trim: 'met_04_tarnished_bronze', step: 'castle_keep_charcoal_guardstone' },
  scriptorium: { floor: 'town_oak_parquet', wall: 'castle_keep_sootdark_great_hall', roof: 'catacombs_black_basalt', trim: 'met_04_tarnished_bronze' },
  ossuary: { floor: 'catacombs_ossuary_aggregate', wall: 'catacombs_wall_ossuary_niches', roof: 'castle_soot', trim: 'catacombs_burial_terracotta', step: 'catacombs_black_basalt' },
  murrain: { floor: 'catacombs_ossuary_aggregate', wall: 'catacombs_wall_drowned_crypt', roof: 'castle_soot', trim: 'catacombs_burial_terracotta' },
  shrine: { floor: 'myth_10_shadow_crypt_1_02', wall: 'catacombs_wall_funerary_chapel_back', roof: 'catacombs_black_basalt', trim: 'met_04_tarnished_bronze', step: 'catacombs_black_basalt' },
};

// who waits where: the undead's haunts (zombies.js HAUNTS takes these too)
export const SHRINE_HAUNTS = {
  founders: ['ember_husk', 'ember_husk', 'ember_husk', 'rotting_zombie', 'tomb_mummy'],
  ossuary: ['bloated_drowner', 'bloated_drowner', 'deep_maw', 'plague_bearer', 'pale_ghoul'],
  chapel: ['fungal_husk', 'chitin_fiend', 'pale_ghoul'],
};

export function buildUndershrine(ctx) {
  const { lib, b, props, physics } = ctx;
  const T = ctx.belltower, F = T.floor;
  const mason = new Mason(ctx, { x0: 600, z0: -320, x1: 815, z1: -190 });
  const has = (id) => lib.surf.has(id);
  for (const k of Object.keys(STONE)) for (const [part, id] of Object.entries(STONE[k])) if (!has(id)) STONE[k][part] = 'castle_basalt';
  const M = (id, tile, o) => mason.mat(has(id) ? id : 'castle_basalt', tile, o);
  const flames = ctx.flames;
  const sprite = (id, x, y, z, sc = 1, rot = null) => { if (lib.spr.has(id)) { ctx.scatter.place(id, x, y, z, sc, rot); lib.usedSprites?.add(id); } };
  const burner = (x, y, z, sc = 1, size = 0.42) => { sprite('catacombs_incense_brazier', x, y, z, sc); const s = lib.sprite('catacombs_incense_brazier'); flames.push([x, y + (s ? s.height_m * sc * 0.92 : 1) + 0.15, z, size, 1]); };
  const torch = (x, y, z, nx, nz) => props.add('wall_torch', x + nx * 0.02, y, z + nz * 0.02, Math.atan2(nx, nz));
  const witch = (x, y, z, color) => (ctx.witchLights ||= []).push(Object.assign([x, y, z, 0.3, true], { color, witch: true }));
  const below = [];          // what counts as under the land here (physics.belowGround)

  // ======================================================== the founders' shaft
  // A round shaft 4 m across under the hall's hatch, a stair of 103 treads spiralling down its wall
  // round a stone newel, from the hall's floor to the Founders' Pit's level, coming out north.
  const sh = SHAFT, wallM = M(STONE.founders.wall, 2.4, { tint: 0xb8b0a4 }), treadM = M('castle_keep_pale_keep_limestone', 1.2), newelM = M('castle_ashlar', 1.6);
  const N = Math.ceil((F - Y.A) / 0.25), h = (F - Y.A) / N, sweep = sh.turns * Math.PI * 2, dA = sweep / N, A0 = Math.PI / 2;
  const at = (a, r, y) => [sh.x + Math.cos(a) * r, y, sh.z + Math.sin(a) * r];
  for (let i = 0; i < N; i++) {
    const a0 = A0 + i * dA, a1 = a0 + dA * 1.04, top = F - (i + 1) * h;
    const P = [], U = [], tris = [];
    const corner = (a, r, y) => { P.push(at(a, r, y)); U.push([Math.cos(a) * r, Math.sin(a) * r]); return P.length - 1; };
    const r0 = sh.newel, r1 = sh.r - 0.04;
    // the tread's top, its riser (the edge you step down off), its underside and its outer end
    const t0 = corner(a0, r0, top), t1 = corner(a0, r1, top), t2 = corner(a1, r1, top), t3 = corner(a1, r0, top);
    const u0 = corner(a0, r0, top - 0.3), u1 = corner(a0, r1, top - 0.3), u2 = corner(a1, r1, top - 0.3), u3 = corner(a1, r0, top - 0.3);
    tris.push([t0, t2, t1], [t0, t3, t2], [u0, u1, u2], [u0, u2, u3], [t0, t1, u1], [t0, u1, u0], [t1, t2, u2], [t1, u2, u1]);
    b.mesh(treadM, P, U, tris, 0.9);
  }
  // the treads underfoot: the exact tread under you, by its angle round the newel (an axis-aligned box
  // can't follow a spiral), and no ground here (the knoll's surface lies just under the hall's floor)
  const TAU = Math.PI * 2;
  physics.dynamic.push({ x0: sh.x - sh.r, z0: sh.z - sh.r, x1: sh.x + sh.r, z1: sh.z + sh.r, floorAt: (x, z, y, r, step) => {
    const dx = x - sh.x, dz = z - sh.z, rr = Math.hypot(dx, dz);
    if (rr < sh.newel - 0.05 || rr > sh.r) return -Infinity;
    const a = (((Math.atan2(dz, dx) - A0) % TAU) + TAU) % TAU;
    let best = -Infinity;
    for (let k = 0; k <= Math.ceil(sh.turns); k++) {
      const i = Math.floor((a + k * TAU) / dA);
      if (i < 0 || i >= N) continue;
      const top = F - (i + 1) * h;
      if (top <= y + step && top > best) best = top;
    }
    return best;
  } });
  physics.groundHoles.push([sh.x - 2.15, sh.z - 2.15, sh.x + 2.15, sh.z + 2.15]);
  b.cylinder([sh.x, Y.A - 0.4, sh.z], [sh.x, F, sh.z], sh.newel, 10, newelM);
  physics.add([sh.x - 0.35, Y.A - 0.4, sh.z - 0.35], [sh.x + 0.35, F, sh.z + 0.35], 'wall');
  // the shaft's wall (seen from inside), with its way out north at the foot
  const SEG = 28, exitA = Math.PI * 1.5, exitW = 0.62;
  for (let k = 0; k < SEG; k++) {
    const a0 = (k / SEG) * Math.PI * 2, a1 = ((k + 1) / SEG) * Math.PI * 2, am = (a0 + a1) / 2;
    const dEx = Math.abs(((am - exitA + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const yb = dEx < exitW ? Y.A + 3.4 : Y.A - 0.4;
    const p = (a, y) => at(a, sh.r, y), L = (sh.r * Math.PI * 2) / SEG;
    b.quad(wallM, p(a0, yb), p(a1, yb), p(a1, F - 0.02), p(a0, F - 0.02), [[k * L, yb], [(k + 1) * L, yb], [(k + 1) * L, F], [k * L, F]].map(([u, v]) => [u, v]), 0.85);
    const [ax, , az] = p(a0, 0), [bx, , bz] = p(a1, 0);
    physics.addSeg(ax, az, bx, bz, yb, F - 0.1, 0.3);
  }
  b.box([sh.x - sh.r, Y.A - 0.5, sh.z - sh.r], [sh.x + sh.r, Y.A, sh.z + sh.r], M(STONE.founders.floor, 2));   // its floor, at the foot
  // torches every half turn, on the wall, a little over the tread they light
  for (let k = 1; k < sh.turns * 2; k++) {
    const i = Math.round(k * N / (sh.turns * 2)), a = A0 + (i + 0.5) * dA + Math.PI * 0.25, y = F - (i + 1) * h;
    const [x, , z] = at(a, sh.r - 0.02, 0);
    torch(x, y, z, -Math.cos(a), -Math.sin(a));
  }
  below.push((p) => Math.hypot(p.x - sh.x, p.z - sh.z) < sh.r + 0.3 && p.y < F - 0.3 && p.y > Y.A - 2);

  // ======================================================== stage I: the Founders' Pit (-12)
  const ST = STONE;
  const pit = mason.room({ name: "The Founders' Pit", dg: 'founders', poly: ring(PIT.x, PIT.z, PIT.r, 16, 11.25 * DEG), y: Y.A, wallH: 6, roof: { kind: 'dome', rise: 5 }, mats: ST.founders, torches: 6 });
  mason.passage({ name: "The Founders' Pit", dg: 'founders', pts: [[sh.x, sh.z - sh.r + 0.1, Y.A], [PIT.x, PIT.z + PIT.r, Y.A]], w: 2.6, spring: 3.0, to: pit, mats: ST.founders, ribs: 0, torches: 0 });
  // the casting pit: a ring kerb of stone round the broken mould of the first bell (you can climb
  // onto the kerb; the mould is solid)
  const KR = [4.4, 5.1], KH = 0.8;
  mason.feature(pit, [PIT.x - 5.2, PIT.z - 5.2, PIT.x + 5.2, PIT.z + 5.2], (x, z) => { const d = Math.hypot(x - PIT.x, z - PIT.z); return d >= KR[0] && d <= KR[1] ? Y.A + KH : null; },
    () => {
      b.lathe(PIT.x, PIT.z, [[KR[1], Y.A], [KR[1], Y.A + KH], [KR[0], Y.A + KH], [KR[0], Y.A]], 28, M('castle_keep_charcoal_guardstone', 1.5));
      b.lathe(PIT.x, PIT.z, [[KR[0] + 0.02, Y.A + 0.02], [0, Y.A + 0.02]], 28, M('catacombs_grave_gravel', 2));   // (slag and sand in the pit)
      // the mould: the clay cope of a bell three times the tenor's size, split and fallen open, its
      // core still standing inside
      const clay = M('catacombs_burial_terracotta', 1.4, { tint: 0x9a7a62 });
      b.lathe(PIT.x, PIT.z, [[0, Y.A + 5.2], [1.1, Y.A + 5.0], [1.7, Y.A + 4.2], [1.9, Y.A + 2.6], [2.3, Y.A + 1.0], [2.7, Y.A + 0.05], [0, Y.A + 0.05]], 18, clay);
      for (const a of [0.4, 2.6]) b.place(PIT.x + Math.cos(a) * 3.2, Y.A + 0.6, PIT.z + Math.sin(a) * 3.2, a, 1, (o) => o.blob([0, 0, 0], [1.4, 0.5, 1.0], clay, { seed: 31 + a * 10, jitter: 0.25 }), { solid: true });
      physics.add([PIT.x - 2.1, Y.A, PIT.z - 2.1], [PIT.x + 2.1, Y.A + 5.2, PIT.z + 2.1], 'prop');
    });
  // the founders' tools along the wall: a crane's beam over the pit, ladles, a tub of quench water
  b.beam([PIT.x - 9, Y.A + 6.2, PIT.z], [PIT.x + 9, Y.A + 6.2, PIT.z], 0.45, 0.5, M('ship_01_tarblack_oak', 1));
  b.cylinder([PIT.x, Y.A + 6.0, PIT.z], [PIT.x, Y.A + 5.4, PIT.z], 0.06, 6, M('castle_iron', 1));
  props.add('barrel', PIT.x - 7.4, Y.A, PIT.z - 4.2); props.add('barrel', PIT.x - 7.8, Y.A, PIT.z - 3.0);
  props.add('anvil', PIT.x + 6.8, Y.A, PIT.z + 4.6, 0.8);
  // the Pattern Loft (branch: reward): the founders' wooden patterns and their strongbox
  const loft = mason.room({ name: 'The Pattern Loft', dg: 'founders', poly: ring(647.5, PIT.z, 4.5, 8, 22.5 * DEG), y: Y.A, wallH: 4.2, roof: { kind: 'dome', rise: 2.2 }, mats: ST.loft, torches: 0 });
  mason.passage({ name: 'The Pattern Loft', dg: 'founders', pts: [[PIT.x - PIT.r, PIT.z, Y.A], [652, PIT.z, Y.A]], w: 2.6, spring: 3.0, from: pit, to: loft, mats: ST.founders, ribs: 3, torches: 0 });
  { const wood = M('vc_planks_04', 1.2);
    for (const [dx, dz, s] of [[-2.6, -1.6, 1.0], [-2.8, 1.4, 0.8], [-1.0, 2.8, 0.6]]) b.lathe(647.5 + dx, PIT.z + dz, [[0, Y.A + 1.6 * s], [0.5 * s, Y.A + 1.5 * s], [0.7 * s, Y.A + 0.9 * s], [0.95 * s, Y.A + 0.02], [0, Y.A + 0.02]], 12, wood);
    props.add('treasure_chest', 647.5 - 3.2, Y.A, PIT.z, Math.PI / 2);
    burner(647.5 + 1.5, Y.A, PIT.z - 2.6, 0.8, 0.32); }
  // the Great Furnace (sub-boss: the Furnace-Warden rises from its slag): a round brick furnace
  // hall, the floor cracked with fire
  const furn = mason.room({ name: 'The Great Furnace', dg: 'founders', poly: ring(FURNACE.x, FURNACE.z, FURNACE.r, 12, 15 * DEG), y: Y.A, wallH: 5.5, roof: { kind: 'dome', rise: 3.5 }, mats: ST.furnace, torches: 0 });
  mason.passage({ name: 'The Great Furnace', dg: 'founders', pts: [[PIT.x + PIT.r, PIT.z, Y.A], [FURNACE.x - FURNACE.r, FURNACE.z, Y.A]], w: 3, spring: 3.2, from: pit, to: furn, mats: ST.furnace, ribs: 3, torches: 0 });
  for (const a of [40, 140, 220, 320]) { const r = FURNACE.r - 1.1; burner(FURNACE.x + Math.cos(a * DEG) * r, Y.A, FURNACE.z + Math.sin(a * DEG) * r, 1, 0.45); }
  // light: torches at the shaft's foot, braziers round the pit
  for (const a of [45, 135, 225, 315]) { const r = PIT.r - 1.6; burner(PIT.x + Math.cos(a * DEG) * r, Y.A, PIT.z + Math.sin(a * DEG) * r, 1, 0.42); }

  // ---- the Iron Gate and the Slag Stair down to stage II (two flights, a landing between)
  const slag = mason.passage({ name: 'The Slag Stair', dg: 'founders', pts: [[PIT.x, PIT.z - PIT.r, Y.A], [PIT.x, -240, Y.A], [PIT.x, -248, Y.A - 4], [PIT.x, -251, Y.A - 4], [PIT.x, -259, Y.B], [PIT.x, -261, Y.B]], w: 4, spring: 4.2, from: pit, mats: ST.founders, ribs: 3.5, torches: 5 });

  // ======================================================== stage II: the Cloister of the Vigil (-20)
  const cloister = mason.room({ name: 'The Cloister of the Vigil', dg: 'cloister', poly: chamfered(CLOISTER.x, CLOISTER.z, 22, 24, 4), y: Y.B, wallH: 7,
    roof: { kind: 'dome', rise: 4, spine: [[CLOISTER.x, CLOISTER.z + 5], [CLOISTER.x, CLOISTER.z - 5]] }, mats: ST.vigil, torches: 0 });
  mason.openInto(cloister, slag, [PIT.x, -261, Y.B]);
  slag.to = cloister;
  // the arcade: twelve pillars round an ambulatory, and the dry basin in the court with his sigil
  for (let i = 0; i < 12; i++) {
    const side = Math.floor(i / 3), k = i % 3, t = -5 + k * 5;
    const [px, pz] = [[t, -6.5], [6.5, t], [-t, 6.5], [-6.5, -t]][side];
    props.add('pillar_gothic', CLOISTER.x + px, Y.B, CLOISTER.z + pz, 0, 1.6);
  }
  mason.feature(cloister, [CLOISTER.x - 3.6, CLOISTER.z - 3.6, CLOISTER.x + 3.6, CLOISTER.z + 3.6], (x, z) => { const d = Math.max(Math.abs(x - CLOISTER.x), Math.abs(z - CLOISTER.z)); return d >= 3 && d <= 3.6 ? Y.B + 0.5 : null; },
    () => {
      const st = M('castle_keep_charcoal_guardstone', 1.4);
      for (const [x0, z0, x1, z1] of [[-3.6, -3.6, 3.6, -3], [-3.6, 3, 3.6, 3.6], [-3.6, -3, -3, 3], [3, -3, 3.6, 3]]) b.box([CLOISTER.x + x0, Y.B, CLOISTER.z + z0], [CLOISTER.x + x1, Y.B + 0.5, CLOISTER.z + z1], st, { solid: false });
    });
  const sigils = [[CLOISTER.x, Y.B + 0.03, CLOISTER.z, 5.6, 0x6a2a8a]];
  for (const [x, z] of [[-9.5, -10.5], [9.5, -10.5], [-9.5, 10.5], [9.5, 10.5]]) burner(CLOISTER.x + x * 0.82, Y.B, CLOISTER.z + z * 0.82, 1, 0.42);
  // the Scriptorium (branch: the adepts' grimoire): their reading room, shelves and lecterns
  const scr = mason.room({ name: 'The Scriptorium', dg: 'cloister', poly: chamfered(641, CLOISTER.z, 12, 10, 2.5), y: Y.B, wallH: 4.6, roof: { kind: 'dome', rise: 2.4, spine: [[637, CLOISTER.z], [645, CLOISTER.z]] }, mats: ST.scriptorium, torches: 4 });
  mason.passage({ name: 'The Scriptorium', dg: 'cloister', pts: [[CLOISTER.x - 11, CLOISTER.z, Y.B], [647, CLOISTER.z, Y.B]], w: 2.6, spring: 3, from: cloister, to: scr, mats: ST.vigil, ribs: 3, torches: 0 });
  for (const dx of [-4.2, -1.4, 1.4]) { props.add('bookshelf', 641 + dx, Y.B, CLOISTER.z - 4.6, 0); props.add('bookshelf', 641 + dx, Y.B, CLOISTER.z + 4.6, Math.PI); }
  props.add('candelabrum', 641 - 4.8, Y.B, CLOISTER.z);
  // the Oath Hall (sub-boss: Ser Hollin Vane, the Knight-Warden): a long hall of the Vigil's banners
  const oath = mason.room({ name: 'The Oath Hall', dg: 'cloister', poly: chamfered(OATH.x, OATH.z, 18, 10, 3), y: Y.B, wallH: 6, roof: { kind: 'dome', rise: 3, spine: [[OATH.x - 5, OATH.z], [OATH.x + 5, OATH.z]] }, mats: ST.vigil, torches: 0 });
  mason.passage({ name: 'The Oath Hall', dg: 'cloister', pts: [[CLOISTER.x, CLOISTER.z - 12, Y.B], [OATH.x, OATH.z + 5, Y.B]], w: 3.2, spring: 3.4, from: cloister, to: oath, mats: ST.vigil, ribs: 3, torches: 0 });
  for (const dx of [-6, -2, 2, 6]) { burner(OATH.x + dx, Y.B, OATH.z - 3.8, 0.9, 0.38); }
  // ---- the Bronze Gate east, and the stair down to stage III
  const p3 = mason.passage({ name: 'The Seep Stair', dg: 'cloister', pts: [[CLOISTER.x + 11, CLOISTER.z, Y.B], [682, CLOISTER.z, Y.B], [690, CLOISTER.z, Y.B - 4], [693, CLOISTER.z, Y.B - 4], [701, CLOISTER.z, Y.C], [703, CLOISTER.z, Y.C]],
    w: 4, spring: 4.2, from: cloister, mats: ST.vigil, ribs: 3.5, torches: 5 });

  // ======================================================== stage III: the Drowned Ossuary (-28)
  const oss = mason.room({ name: 'The Drowned Ossuary', dg: 'ossuary', poly: chamfered(OSSUARY.x, OSSUARY.z, 20, 16, 4), y: Y.C, wallH: 6,
    roof: { kind: 'dome', rise: 4, spine: [[OSSUARY.x - 5, OSSUARY.z], [OSSUARY.x + 5, OSSUARY.z]] }, mats: ST.ossuary, torches: 0 });
  mason.openInto(oss, p3, [703, CLOISTER.z, Y.C]);
  p3.to = oss;
  // the seep: black water ankle deep over the whole floor (the dead lie under it)
  const water = new THREE.Mesh(new THREE.PlaneGeometry(19.4, 15.4).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x0c1814, specular: 0x5a7a70, shininess: 90, transparent: true, opacity: 0.78, depthWrite: false }));
  water.position.set(OSSUARY.x, Y.C + 0.22, OSSUARY.z);
  ctx.scene.add(water);
  for (const [x, z] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) burner(OSSUARY.x + x, Y.C, OSSUARY.z + z, 0.9, 0.38);
  // the Bone Chapel (branch: the weird thing): the adepts built a chapel of their dead, and in it
  // a thing of bone that still turns, slowly, by itself
  const chapel = mason.room({ name: 'The Bone Chapel', dg: 'ossuary', poly: ring(CHAPEL.x, CHAPEL.z, CHAPEL.r, 10, 18 * DEG), y: Y.C, wallH: 4.8, roof: { kind: 'dome', rise: 3.2 }, mats: ST.ossuary, torches: 0 });
  mason.passage({ name: 'The Bone Chapel', dg: 'ossuary', pts: [[OSSUARY.x, OSSUARY.z - 8, Y.C], [CHAPEL.x, CHAPEL.z + CHAPEL.r - 0.05, Y.C]], w: 2.6, spring: 3, from: oss, to: chapel, mats: ST.ossuary, ribs: 2.5, torches: 0 });
  const bone = M('castle_keep_ivory_chapel_marble', 0.5, { tint: 0xc8bc9c });
  const wheel = new THREE.Group();   // the orrery of bones: rings of ribs round a skull, turning
  { const boneMat = new THREE.MeshPhongMaterial({ color: 0xd8ccae, specular: 0x302a20, shininess: 14 });
    for (let r = 0; r < 3; r++) {
      const ringG = new THREE.Group();
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2, rib = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.9, 5), boneMat);
        rib.position.set(Math.cos(a) * (1.2 + r * 0.55), 0, Math.sin(a) * (1.2 + r * 0.55)); rib.rotation.z = Math.PI / 2; rib.rotation.y = -a;
        ringG.add(rib);
      }
      ringG.rotation.x = r * 0.7; ringG.rotation.z = r * 0.45;
      wheel.add(ringG);
    }
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), boneMat); skull.scale.set(1, 1.15, 1.2); wheel.add(skull);
    wheel.position.set(CHAPEL.x, Y.C + 2.6, CHAPEL.z);
    ctx.scene.add(wheel);
    (ctx.animated ||= []).push((dt, t) => { wheel.rotation.y = t * 0.12; wheel.children.forEach((c, i) => { if (i < 3) c.rotation.y = t * (0.2 + i * 0.13) * (i % 2 ? -1 : 1); }); wheel.position.y = Y.C + 2.6 + Math.sin(t * 0.7) * 0.08; });
    witch(CHAPEL.x, Y.C + 2.6, CHAPEL.z, 0x9affb0);
  }
  b.place(CHAPEL.x, Y.C, CHAPEL.z, 0, 1, (o) => { o.cylinder([0, 0, 0], [0, 0.95, 0], 0.9, 8, bone); }, { solid: true });
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; sprite('catacombs_skull_pile', CHAPEL.x + Math.cos(a) * (CHAPEL.r - 0.9), Y.C, CHAPEL.z + Math.sin(a) * (CHAPEL.r - 0.9), 0.8); }
  // the Murrain Pit (sub-boss: Mother Murrain): a round sump where the plague dead were tipped
  const mur = mason.room({ name: 'The Murrain Pit', dg: 'ossuary', poly: ring(MURRAIN.x, MURRAIN.z, MURRAIN.r, 12, 15 * DEG), y: Y.C, wallH: 5, roof: { kind: 'dome', rise: 3 }, mats: ST.murrain, torches: 0 });
  mason.passage({ name: 'The Murrain Pit', dg: 'ossuary', pts: [[OSSUARY.x, OSSUARY.z + 8, Y.C], [MURRAIN.x, MURRAIN.z - MURRAIN.r + 0.05, Y.C]], w: 3, spring: 3.2, from: oss, to: mur, mats: ST.murrain, ribs: 2.5, torches: 0 });
  witch(MURRAIN.x, Y.C + 1.2, MURRAIN.z, 0x7aff60);
  for (const a of [0, 120, 240]) sprite('catacombs_skull_pile', MURRAIN.x + Math.cos(a * DEG) * 4.5, Y.C, MURRAIN.z + Math.sin(a * DEG) * 4.5, 1.1);
  // ---- the Silver Gate, and the Processional: the grand stair east under the cliff, braziers at
  // its landings
  const proc = mason.passage({ name: 'The Processional', dg: 'ossuary', pts: [[OSSUARY.x + 10, OSSUARY.z, Y.C], [726, OSSUARY.z, Y.C], [734, OSSUARY.z, Y.C - 4], [738, OSSUARY.z, Y.C - 4], [746, OSSUARY.z, Y.D], [747, OSSUARY.z, Y.D]],
    w: 5, spring: 5.5, from: oss, mats: ST.shrine, ribs: 3, torches: 0 });
  burner(736, Y.C - 4, OSSUARY.z - 2, 1.1, 0.45); burner(736, Y.C - 4, OSSUARY.z + 2, 1.1, 0.45);

  // ======================================================== stage IV: the Shrine of Velscour (-36)
  const kneel = mason.room({ name: 'The Hall of Kneeling', dg: 'shrine', poly: chamfered(KNEEL.x, KNEEL.z, 12, 14, 3), y: Y.D, wallH: 6, roof: { kind: 'dome', rise: 3.5 }, mats: ST.shrine, torches: 4 });
  mason.openInto(kneel, proc, [747, OSSUARY.z, Y.D]);
  proc.to = kneel;
  const arena = mason.room({ name: 'The Shrine of Velscour', dg: 'shrine', poly: ring(ARENA.x, ARENA.z, ARENA.r, 24, 7.5 * DEG), y: Y.D, wallH: 11, roof: { kind: 'dome', rise: 11 }, mats: ST.shrine, torches: 0 });
  mason.passage({ name: 'The Shrine of Velscour', dg: 'shrine', pts: [[KNEEL.x + 6, KNEEL.z, Y.D], [ARENA.x - ARENA.r, ARENA.z, Y.D]], w: 5, spring: 5.5, from: kneel, to: arena, mats: ST.shrine, ribs: 0, torches: 0 });
  // the dais: three tiers round the colossus's plinth, the way up its west face
  const DAIS = [[7.5, 0.5], [6.2, 1.0], [5.0, 1.5]];
  mason.feature(arena, [STATUE.x - 8, STATUE.z - 8, STATUE.x + 8, STATUE.z + 8], (x, z) => {
    const d = Math.hypot(x - STATUE.x, z - STATUE.z);
    if (d < 3.4) return null;                    // (the plinth: solid, below)
    for (let i = DAIS.length - 1; i >= 0; i--) if (d <= DAIS[i][0]) return Y.D + DAIS[i][1];
    return null;
  }, () => {
    const st = M('catacombs_black_basalt', 1.6), tr = M('met_04_tarnished_bronze', 0.8);
    for (const [r, hgt] of DAIS) b.lathe(STATUE.x, STATUE.z, [[r, Y.D], [r, Y.D + hgt], [0, Y.D + hgt]], 32, st);
    b.lathe(STATUE.x, STATUE.z, [[3.4, Y.D + 1.5], [3.4, Y.D + 3.4], [3.0, Y.D + 3.6], [0, Y.D + 3.6]], 24, tr);
    physics.add([STATUE.x - 3.2, Y.D, STATUE.z - 3.2], [STATUE.x + 3.2, Y.D + 3.6, STATUE.z + 3.2], 'prop');
  });
  // eight pillars on a ring (cover from his bolts), braziers between them, his sigil on the floor
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8, r = 14.5, x = ARENA.x + Math.cos(a) * r, z = ARENA.z + Math.sin(a) * r;
    if (Math.hypot(x - STATUE.x, z - STATUE.z) < 9.5) continue;   // (none on the dais)
    b.cylinder([x, Y.D, z], [x, Y.D + 11, z], 0.85, 10, M('catacombs_black_basalt', 2));
    b.cylinder([x, Y.D, z], [x, Y.D + 0.6, z], 1.1, 10, M('met_04_tarnished_bronze', 1));
    physics.add([x - 0.8, Y.D, z - 0.8], [x + 0.8, Y.D + 11, z + 0.8], 'wall');
    const a2 = a + Math.PI / 8, r2 = ARENA.r - 2.2;
    burner(ARENA.x + Math.cos(a2) * r2, Y.D, ARENA.z + Math.sin(a2) * r2, 1.3, 0.5);
    witch(ARENA.x + Math.cos(a2) * r2, Y.D + 2.2, ARENA.z + Math.sin(a2) * r2, k % 2 ? 0x8a50ff : 0x60ff70);
  }
  sigils.push([ARENA.x - 6, Y.D + 0.03, ARENA.z, 10, 0x7a3aaa]);
  for (const s of [[KNEEL.x - 4, KNEEL.z - 5.5], [KNEEL.x + 4, KNEEL.z - 5.5], [KNEEL.x - 4, KNEEL.z + 5.5], [KNEEL.x + 4, KNEEL.z + 5.5]]) burner(s[0], Y.D, s[1], 1, 0.42);

  // ======================================================== the gates
  // [key, passage start, along +x or -z, what it's called]
  const gates = [
    { key: 'iron', name: 'the Iron Gate', x: PIT.x, z: -240.4, y: Y.A, w: 4, alongX: true, color: 0x3a3a3e },
    { key: 'bronze', name: 'the Bronze Gate', x: 682.4, z: CLOISTER.z, y: Y.B, w: 4, alongX: false, color: 0x8a6230 },
    { key: 'silver', name: 'the Silver Gate', x: 726.4, z: OSSUARY.z, y: Y.C, w: 5, alongX: false, color: 0xb8bcc8 },
  ];
  for (const g of gates) {
    const grp = new THREE.Group(), mat = new THREE.MeshPhongMaterial({ color: g.color, specular: 0x9a9a9a, shininess: 50 }), H = g.w > 4.5 ? 5.4 : 4.2;
    for (let u = -g.w / 2 + 0.2; u <= g.w / 2 - 0.15; u += 0.32) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, H, 5), mat); bar.position.set(u, H / 2, 0); grp.add(bar); }
    for (const v of [0.4, H * 0.5, H - 0.3]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(g.w, 0.09, 0.08), mat); rail.position.set(0, v, 0); grp.add(rail); }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.22), mat); lock.position.set(0, 1.2, 0); grp.add(lock);
    grp.position.set(g.x, g.y, g.z);
    if (!g.alongX) grp.rotation.y = Math.PI / 2;
    ctx.scene.add(grp);
    g.obj = grp; g.H = H; g.lift = 0;
    const hw = g.w / 2;
    g.box = physics.add(g.alongX ? [g.x - hw, g.y, g.z - 0.15] : [g.x - 0.15, g.y, g.z - hw], g.alongX ? [g.x + hw, g.y + H, g.z + 0.15] : [g.x + 0.15, g.y + H, g.z + hw], 'gate');
  }

  // the sigils of Velscour, inlaid (the cloister's basin, the arena's floor)
  { const tex = new THREE.TextureLoader().load(SIGIL);
    for (const [x, y, z, s, col] of sigils) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, color: col, transparent: true, depthWrite: false, alphaTest: 0.05 }));
      m.position.set(x, y, z); m.renderOrder = 2;
      ctx.scene.add(m);
    } }

  mason.build();
  // the spaces, as places for the dead (one per stage: each its own flow field) and the map
  const place = (name, key, y) => {
    const spaces = mason.spaces.filter((s) => s.dg === key), nav = mason.nav(spaces);
    for (let c = 0; c < nav.cell.length; c++) if (nav.cell[c] >= 0 && mason.spaces[nav.cell[c]].type === 'passage') nav.cell[c] += 1000;
    const set = new Set(spaces), rooms = spaces.filter((s) => s.type === 'room');
    return {
      name, y, nav, fog: 70, shrine: key,
      floorAt: (x, z) => mason.floorAt(x, z) ?? y,
      contains: (p) => { const s = mason.spaceAt(p.x, p.z); if (!s || !set.has(s)) return false; const f = mason.floorAt(p.x, p.z); return f != null && p.y > f - 3 && p.y < f + 24; },
      where: (p) => mason.spaceAt(p.x, p.z)?.name || name,
      roomList: rooms.map((r) => { const xs = r.poly.map((q) => q[0]), zs = r.poly.map((q) => q[1]); return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs), kind: r.name, y: r.y, poly: r.poly }; }),
      fogAt: (p) => (/Shrine of Velscour|Founders' Pit|Cloister/.test(mason.spaceAt(p.x, p.z)?.name || '') ? 90 : 55),
      ambAt: () => 0.12,
    };
  };
  const dgs = { founders: place("The Founders' Pit", 'founders', Y.A), cloister: place('The Cloister of the Vigil', 'cloister', Y.B), ossuary: place('The Drowned Ossuary', 'ossuary', Y.C), shrine: place('The Shrine of Velscour', 'shrine', Y.D) };
  dgs.founders.bossSpot = [FURNACE.x, Y.A, FURNACE.z];
  dgs.ossuary.bossSpot = [MURRAIN.x, Y.C, MURRAIN.z];
  for (const dg of Object.values(dgs)) below.push((p) => dg.contains(p));
  (physics.belowGround ||= []).push((p) => below.some((f) => f(p)));

  return new Undershrine(ctx, { dgs, gates, mason, F, water, statueAt: STATUE });
}

// ================================================================================================
// what happens down there: who waits, the hatch, the gates and their keys, the colossus, Morcant

const KEY_LOOK = { iron: 0x6a6a72, bronze: 0xb8803a, silver: 0xe0e4f0 };

export class Undershrine {
  constructor(ctx, o) {
    Object.assign(this, o);
    this.ctx = ctx;
    this.prompt = '';
    this.keysLying = [];
    this.flags = null;            // (the quests' flags.shrine: what's open and held, saved with the quests)
    this.unders = Object.values(this.dgs).map((dg) => ({ dg, cat: true }));
    this.boss = null;
    this.hatch = this.makeHatch();
  }

  get state() {
    const q = this.ctx.quests;
    if (!q) return (this._st ||= { keys: [], open: [], unsealed: false });
    return (q.flags.shrine ||= { keys: [], open: [], unsealed: false });
  }

  /** The iron grate over the shaft in the hall: sealed until the Bellwright opens it. */
  makeHatch() {
    const T = this.ctx.belltower, F = T.floor, x = SHAFT.x, z = SHAFT.z, s = 2.1;
    const grp = new THREE.Group(), mat = new THREE.MeshPhongMaterial({ color: 0x2c2a2a, specular: 0x6a6460, shininess: 30 });
    for (let u = -s + 0.15; u < s; u += 0.3) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, s * 2), mat); a.position.set(u, 0, 0); grp.add(a);
      const c = new THREE.Mesh(new THREE.BoxGeometry(s * 2, 0.06, 0.05), mat); c.position.set(0, 0.01, u); grp.add(c);
    }
    const rim = new THREE.Mesh(new THREE.BoxGeometry(s * 2 + 0.1, 0.09, 0.12), mat);
    for (const v of [-s, s]) { const r1 = rim.clone(); r1.position.z = v; grp.add(r1); const r2 = rim.clone(); r2.rotation.y = Math.PI / 2; r2.position.x = v; grp.add(r2); }
    grp.position.set(x, F + 0.02, z);
    this.ctx.scene.add(grp);
    const box = this.ctx.physics.add([x - s, F - 0.12, z - s], [x + s, F, z + s], 'hatch');
    return { obj: grp, box, mat, fade: 1 };
  }

  /** The Bellwright breaks the seal: the grate burns away in violet light. */
  unseal(now = false) {
    this.state.unsealed = true;
    if (now) this.hatch.fade = 0;
    this.hatch.box.max[1] = -999; this.hatch.box.min[1] = -1000;
  }

  /** Put in the dead (now) and the Vigil (as soon as their bodies have loaded: update). */
  populate(Z, few = (n) => n) {
    this.Z = Z;
    const spawn = (dg, tag, list, haunt) => {
      Z.addUnder(dg);
      for (const [what, x, z, variant] of list) {
        const start = what === 'lie' ? 'playdead' : what === 'bury' ? 'buried' : 'stand', kind = start === 'stand' ? (Math.random() < 0.4 ? 'runner' : 'shambler') : 'lurker';
        const zb = Z.spawn(variant || Z.randomVariant(haunt), x, z, { y: dg.floorAt(x, z), zone: 'dungeon', dg, kind, start });
        zb.yaw = Math.random() * Math.PI * 2; zb.quick = 1.6; zb.shrineTag = tag;
      }
    };
    const d = this.dgs, P = PIT, O = OSSUARY;
    const keepN = (l) => { const n = few(l.length); return l.filter((e, i) => e[0] !== 'stand' || i < n + 2); };
    // the founders' dead: up out of the slag in the pit as you come to its kerb, two by the furnace
    // braziers, one lying at the shaft's foot, two lying in the loft by the strongbox
    spawn(d.founders, 'founders', keepN([['bury', P.x - 2.8, P.z + 2.6], ['bury', P.x + 3.1, P.z + 2.2], ['bury', P.x + 0.4, P.z - 3.4], ['stand', P.x + 6.2, P.z - 4], ['stand', P.x - 6.4, P.z + 3.6],
      ['lie', P.x - 1.2, P.z + 8.4], ['stand', P.x, -246, 'ember_husk'], ['lie', 650, P.z + 2.2], ['lie', 649.5, P.z - 2.4], ['stand', FURNACE.x - 2, FURNACE.z + 3, 'ember_husk']]), 'founders');
    // the drowned lie under the seep and rise as you wade in; the plague's dead by the pit's mouth;
    // the chapel's keepers
    spawn(d.ossuary, 'ossuary', keepN([['bury', O.x - 5, O.z - 3], ['bury', O.x - 1, O.z + 3.5], ['bury', O.x + 4, O.z - 2], ['bury', O.x + 6.5, O.z + 4], ['stand', O.x + 2, O.z],
      ['stand', O.x - 6, O.z + 5, 'bloated_drowner'], ['lie', O.x, O.z + 6.6, 'plague_bearer'], ['stand', CHAPEL.x - 2.5, CHAPEL.z + 1, 'fungal_husk'], ['stand', CHAPEL.x + 2.5, CHAPEL.z + 1.5, 'chitin_fiend'], ['lie', CHAPEL.x, CHAPEL.z - 3.4, 'pale_ghoul']]), 'ossuary');
  }

  /** The Vigil at their posts: the cloister's watch, the scriptorium's adepts, the honour guard. */
  garrison(foes) {
    const put = (v, x, z, y, dg, tag, yaw = 0) => {
      if (!foes.gltf[v]) return null;
      const f = foes.spawn(v, x, z, { y, zone: 'dungeon', dg });
      f.dg = dg; f.shrineTag = tag; f.postYaw = yaw; f.yaw = yaw;
      return f;
    };
    const C = CLOISTER, dc = this.dgs.cloister, ds = this.dgs.shrine;
    const M = ['sworn_m', 'sworn_f'], A = ['sworn_adept_m', 'sworn_adept_f'];
    put(M[0], C.x - 4, C.z + 9, Y.B, dc, 'cloister', Math.PI); put(M[1], C.x + 4, C.z + 9, Y.B, dc, 'cloister', Math.PI);
    put(M[0], C.x + 8.5, C.z - 2, Y.B, dc, 'cloister', -Math.PI / 2); put(M[1], C.x - 8.5, C.z + 2, Y.B, dc, 'cloister', Math.PI / 2);
    put(A[0], C.x, C.z - 8.5, Y.B, dc, 'cloister', 0); put(A[1], 641, C.z, Y.B, dc, 'cloister', Math.PI / 2); put(A[0], 638, C.z - 2.5, Y.B, dc, 'cloister', Math.PI / 2);
    // the honour guard in the Hall of Kneeling, in two files facing the way in
    for (const [v, dx, dz] of [[M[0], -2, -3.5], [M[1], -2, 3.5], [M[0], 2.5, -3.5], [M[1], 2.5, 3.5], [A[0], 4.5, 0], [A[1], 0.5, 0]]) put(v, KNEEL.x + dx, KNEEL.z + dz, Y.D, ds, 'kneeling', -Math.PI / 2);
    this.garrisoned = true;
  }

  /** A named one of the Vigil the quests want (raised when that quest is taken). */
  raiseFoe(who) {
    const foes = this.foes;
    if (!foes) { (this.pendingFoes ||= new Set()).add(who); return null; }
    const have = (this.named ||= {})[who];
    if (have && !have.dead && !have.gone) return have;
    if (who === 'hollin' && foes.gltf.sworn_hollin) {
      const f = foes.spawn('sworn_hollin', OATH.x + 5, OATH.z, { y: Y.B, zone: 'dungeon', dg: this.dgs.cloister });
      f.dg = this.dgs.cloister; f.slay = 'hollin'; f.postYaw = -Math.PI / 2;
      return (this.named[who] = f);
    }
    if (who === 'morcant' && foes.gltf.sworn_archmage) {
      const f = foes.spawn('sworn_archmage', STATUE.x - 9, STATUE.z, { y: Y.D, zone: 'dungeon', dg: this.dgs.shrine });
      f.dg = this.dgs.shrine; f.slay = 'morcant'; f.postYaw = -Math.PI / 2;
      this.boss = new BossMage(this, f);
      return (this.named[who] = f);
    }
    return null;
  }

  /** Where the founders' seals lie (a gather quest), across stage I and II. */
  spots(n) {
    const S = [[PIT.x - 7.6, Y.A, PIT.z + 2], [PIT.x + 4, Y.A, PIT.z - 7.4], [648, Y.A, PIT.z + 3.2], [FURNACE.x + 3.6, Y.A, FURNACE.z - 2.6], [PIT.x + 1.2, Y.A - 4, -249.5],
      [CLOISTER.x - 9, Y.B, CLOISTER.z - 9.5], [CLOISTER.x + 9.5, Y.B, CLOISTER.z + 8], [644, Y.B, CLOISTER.z + 3]];
    return S.slice(0, n).map(([x, y, z]) => [x, y + 0.4, z]);
  }
  /** Where a fetched thing lies: the grimoire on the scriptorium's lectern, the chapel's relic. */
  fetchSpot(what) {
    if (what === 'scriptorium') return [636.5, Y.B + 1.1, CLOISTER.z];
    if (what === 'chapel') return [CHAPEL.x, Y.C + 1.4, CHAPEL.z];
    return null;
  }

  /** Every death: a sub-boss leaves its gate's key where it fell. */
  onKill(z) {
    const key = z.champ?.key === 'warden' ? 'iron' : z.slay === 'hollin' ? 'bronze' : z.champ?.key === 'murrain' ? 'silver' : null;
    if (!key || this.state.keys.includes(key) || this.keysLying.some((k) => k.key === key)) return;
    const g = new THREE.Group(), m = new THREE.MeshPhongMaterial({ color: KEY_LOOK[key], emissive: KEY_LOOK[key], emissiveIntensity: 0.4, specular: 0xffffff, shininess: 80 });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), m); g.add(shaft);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 6, 14), m); bow.position.y = 0.32; g.add(bow);
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.04), m); bit.position.set(0.07, -0.18, 0); g.add(bit);
    const y = z.pos.y + 0.9;
    g.position.set(z.pos.x, y, z.pos.z);
    this.ctx.scene.add(g);
    this.keysLying.push({ key, obj: g, y, t: 0 });
  }

  /** Each frame: the hatch, keys taken up, gates rising, the Vigil brought in, the boss. */
  update(dt, player, { foes, sfx, toast, acting }) {
    this.foes = foes;
    const st = this.state;
    if (!this.garrisoned && foes?.gltf?.sworn_m && foes.gltf.sworn_adept_m) {
      this.garrison(foes);
      for (const w of this.pendingFoes || []) this.raiseFoe(w);
      this.pendingFoes = null;
    }
    // the hatch: the grate burns away once unsealed
    const H = this.hatch;
    if (st.unsealed && H.box.max[1] > -900) { H.box.max[1] = -999; H.box.min[1] = -1000; }
    if (st.unsealed && H.fade > 0) { H.fade = Math.max(0, H.fade - dt * 0.8); H.mat.emissive.setRGB(0.6 * H.fade, 0.3 * H.fade, 1.0 * H.fade); H.obj.scale.setScalar(Math.max(0.001, H.fade)); if (!H.fade) H.obj.visible = false; }
    if (!st.unsealed && H.fade < 1) { H.fade = 1; H.obj.visible = true; H.obj.scale.setScalar(1); H.box.min[1] = this.F - 0.12; H.box.max[1] = this.F; }
    // keys lying where their bearers fell: walk over one to take it
    for (let i = this.keysLying.length - 1; i >= 0; i--) {
      const k = this.keysLying[i];
      k.t += dt; k.obj.rotation.y += dt * 2; k.obj.position.y = k.y + Math.sin(k.t * 3) * 0.06;
      if (Math.hypot(player.pos.x - k.obj.position.x, player.pos.z - k.obj.position.z) < 1.4 && Math.abs(player.pos.y + 0.9 - k.y) < 2) {
        st.keys.push(k.key); this.ctx.scene.remove(k.obj); this.keysLying.splice(i, 1);
        sfx?.chime?.(true); toast?.(`You take up the ${k.key[0].toUpperCase() + k.key.slice(1)} Key`);
      }
    }
    // the gates: a prompt near a shut one; open ones rise into the vault
    this.prompt = ''; this.near = null;
    for (const g of this.gates) {
      const open = st.open.includes(g.key);
      if (open && g.lift < g.H - 0.3) { g.lift = Math.min(g.H - 0.3, g.lift + dt * 1.6); g.obj.position.y = g.y + g.lift; if (g.lift > 1.9) { g.box.max[1] = -999; g.box.min[1] = -1000; } }
      if (open || !acting) continue;
      const d = Math.hypot(player.pos.x - g.x, player.pos.z - g.z);
      if (d < 3 && Math.abs(player.pos.y - g.y) < 2) {
        this.near = g;
        this.prompt = st.keys.includes(g.key) ? `E — unlock ${g.name} with the ${g.key} key` : `${g.name[0].toUpperCase() + g.name.slice(1)} is locked. Its key is carried somewhere on this level`;
      }
    }
    // the hall: a word about the hatch while it's sealed
    if (!st.unsealed && acting && !this.prompt) {
      const F = this.F;
      if (Math.hypot(player.pos.x - SHAFT.x, player.pos.z - SHAFT.z) < 2.4 && Math.abs(player.pos.y - F) < 0.6) this.prompt = 'The iron hatch is sealed. The Bellwright keeps its key';
    }
    this.boss?.update(dt, player);
    this.statue?.();
  }

  /** E at a gate with its key: it unlocks and rises. */
  act(sfx, toast) {
    const g = this.near, st = this.state;
    if (!g || !st.keys.includes(g.key) || st.open.includes(g.key)) return;
    st.open.push(g.key);
    sfx?.door?.(true, true); toast?.(`${g.name[0].toUpperCase() + g.name.slice(1)} grinds up into the vault`);
  }

  /** The colossus of Velscour on his dais: a Sworn lord's body and armour, posed and turned to
   * dark stone, eight times a man's height (made once the Vigil's bodies have loaded). */
  makeStatue(foes) {
    const src = foes.gltf.sworn_lord || foes.gltf.sworn_m;
    if (!src || this.statueMade) return;
    this.statueMade = true;
    import('three/addons/utils/SkeletonUtils.js').then(({ clone }) => {
      const body = clone(src.scene);
      const stone = new THREE.MeshPhongMaterial({ color: 0x3a3640, specular: 0x5a5060, shininess: 18, emissive: 0x120818 });
      body.traverse((o) => { if (o.isMesh) { o.material = stone; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      // his pose: the sword grounded before him, hands on its pommel (from the library's idle, held)
      const clips = src.animations || [], clip = clips.find((c) => /idle_sword|guard|idle/.test(c.name));
      if (clip) { const mx = new THREE.AnimationMixer(body); mx.clipAction(clip).play(); mx.update(0.5); }
      body.scale.setScalar(6.2);
      body.position.set(STATUE.x, Y.D + 3.6, STATUE.z);
      body.rotation.y = -Math.PI / 2;
      this.ctx.scene.add(body);
      this.statueObj = body;
    });
  }
}

// ================================================================================================
// Magister Morcant, the Violet Hand: five phases
//   1. The Violet Hand (life 100 to 80%): arcane bolts, and he blinks away when you close
//   2. The Raising (80 to 60%): the dead of the shrine claw up round the arena; green venom bolts
//   3. The Mirrors (60 to 40%): two of himself stand up beside him; only he bleeds, the others burst
//   4. The Burning Floor (40 to 20%): the ground under you burns again and again; he walks the dais
//   5. Velscour's Chosen (under 20%): he blazes violet and green, faster, and calls two Sworn
// Each change of phase: a moment he can't be touched (a ward rings out), a shout, the shrine flares.
const PHASES = [1, 0.8, 0.6, 0.4, 0.2];
const LINES = ['Orrin sent a child. He always did prefer to watch.', 'Rise. Your lord is hungry.', 'Which of me will you trust?', 'Burn, little bell.', 'Velscour! Take my eyes! TAKE THEM!'];

class BossMage {
  constructor(shrine, f) {
    this.s = shrine; this.f = f; this.phase = 0; this.ward = 0; this.t = 0; this.mirrors = []; this.engaged = false;
    const hit = f.hit.bind(f);
    f.hit = (h, o) => (this.ward > 0 ? false : hit(h, o));
  }
  get life() { return this.f.hp / this.f.kind.hp; }
  update(dt, player) {
    const f = this.f, foes = this.s.foes, Z = this.s.Z;
    if (!f || f.gone) return;
    this.t += dt;
    if (f.dead) { for (const m of this.mirrors) if (!m.dead) m.hit?.('chest', { dmg: 9999, dir: new THREE.Vector3(0, 0, 1) }); return; }
    const inArena = Math.hypot(player.pos.x - ARENA.x, player.pos.z - ARENA.z) < ARENA.r && Math.abs(player.pos.y - Y.D) < 6;
    if (inArena && !this.engaged) { this.engaged = true; this.shout(0); if (foes) foes.boss = f; }
    if (!this.engaged) return;
    this.ward = Math.max(0, this.ward - dt);
    const want = PHASES.findLastIndex((p) => this.life <= p);
    if (want > this.phase) this.enter(want, player);
    // phase work
    this.cool = (this.cool ?? 2) - dt;
    if (this.cool > 0) return;
    if (this.phase === 1 || this.phase === 4) {          // the raised dead, a few at a time
      const alive = (this.raised ||= []).filter((z) => !z.dead && !z.gone).length;
      if (alive < (this.phase === 4 ? 5 : 4) && Z) {
        const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 6, x = ARENA.x + Math.cos(a) * r, z = ARENA.z + Math.sin(a) * r;
        const zb = Z.spawn(Z.randomVariant('chapel'), x, z, { y: Y.D, zone: 'dungeon', dg: this.s.dgs.shrine, kind: 'runner', start: 'buried' });
        zb.quick = 2; zb.wake?.(player.pos); this.raised.push(zb);
      }
      this.cool = this.phase === 4 ? 2.5 : 4;
    }
    if (this.phase >= 3 && foes) {                       // the floor burns under you
      foes.hex?.(f, player);
      this.cool = this.phase === 4 ? 2.2 : 3.2;
    }
    if (this.phase === 2 && this.mirrors.every((m) => m.dead || m.gone)) this.mirror(player);
    // he walks the dais in the last two phases: a blink to a new place round the colossus
    if (this.phase >= 3 && Math.random() < 0.25) this.blinkTo(Math.random() * Math.PI * 2);
    f.def.spell = this.phase === 1 || this.phase >= 3 && Math.random() < 0.5 ? 'venom' : 'arcane';
  }
  enter(k, player) {
    this.phase = k; this.ward = 1.4; this.cool = 1.6;
    const f = this.f, foes = this.s.foes;
    this.shout(k);
    foes?.flash?.(f.pos.clone().add(new THREE.Vector3(0, 2.4, 0)), k % 2 ? 0x60ff70 : 0x9a4cff, 1.4);
    if (k === 4) {                                         // Velscour's Chosen
      f.enraged = true;
      f.kind = { ...f.kind, walk: f.kind.walk * 1.3, run: f.kind.run * 1.25, cool: [0.3, 0.7] };
      for (const v of ['sworn_m', 'sworn_f']) if (foes?.gltf[v]) { const s = foes.spawn(v, ARENA.x - 12 + Math.random() * 3, ARENA.z + (v === 'sworn_m' ? -6 : 6), { y: Y.D, zone: 'dungeon', dg: this.s.dgs.shrine }); s.dg = this.s.dgs.shrine; }
    }
    if (k === 2) this.mirror(player);
    if (k === 3) this.blinkTo(Math.PI);
  }
  /** Two of himself, standing up out of violet light beside him: one blow bursts them. */
  mirror() {
    const foes = this.s.foes, f = this.f;
    if (!foes?.gltf.sworn_archmage) return;
    this.mirrors = [-1, 1].map((s) => {
      const m = foes.spawn('sworn_archmage', f.pos.x + s * 4, f.pos.z + s * 2, { y: f.pos.y, zone: 'dungeon', dg: this.s.dgs.shrine });
      m.dg = this.s.dgs.shrine; m.mirror = true; m.hp = 1; m.noLoot = true; m.xp = 0;
      return m;
    });
  }
  blinkTo(a) {
    const f = this.f, r = 9.5, x = STATUE.x + Math.cos(a) * r, z = STATUE.z + Math.sin(a) * r;
    if (Math.hypot(x - ARENA.x, z - ARENA.z) > ARENA.r - 2) return;
    this.s.foes?.flash?.(f.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 0x9a4cff, 0.7);
    f.pos.set(x, Y.D, z);
    this.s.foes?.flash?.(f.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 0x60ff70, 0.7);
  }
  shout(k) { this.s.ctx.say?.('Magister Morcant', LINES[k]); }
}
