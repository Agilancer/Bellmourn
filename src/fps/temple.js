// The Temple of Velscour, at the south road's end in the Darkwood.
//
// Intent (docs/DUNGEON_BUILDING.md section 1):
//  1. Who made it, and why? The Sworn, thirty winters ago, the year the Vigil turned: they pulled
//     down the Flame's south chapel and raised his temple on its footings, at the end of the south
//     road, so that every soul leaving Bellmourn that way walks toward his V.
//  2. What happened since? The Sworn keep vigil in it. They bury their own in the crypt in its
//     podium, and the tithe-breakers they hang, and the crypt's dead no longer lie still.
//  3. What is it for in play? Spectacle on arrival (the stair, the façade, the V), a fight in the nave
//     (his knights, their warden at the altar), exploration below (the crypt's ring of galleries),
//     and a reward (the reliquary at its far end).
//  4. What does the player see first? From the road: the black façade between its two towers, the
//     great V over the door, braziers burning at the stair's head, knights of stone either side of it.
//     From the door: the nave's columns marching to the apse and the gilded V over the altar.
//  5. How does the player leave? The door is lit from outside (daylight); the crypt's stair is lit at
//     its head and its foot, and it is the only way down or up.
// Shape (sections 6, 7): a podium (stair 6 m up), a nave with aisles, buttresses and lancets, an
// octagonal apse, towers at the front corners; the crypt a ring of galleries round the stair shaft
// and a solid core, an octagon-ended tomb hall at the back (the hero: the first commander's tomb), the
// reliquary at the front. Ribs across the galleries; light on the critical path.
import { terrainHeight } from './terrain.js';

const TAU = Math.PI * 2;
export const TEMPLE = { x: 0, z: 240, name: 'The Temple of Velscour', crypt: 'The Crypt of the Oath' };
const X0 = -15, X1 = 15, Z0 = 215, Z1 = 273;      // the podium
const NZ0 = 219, NZ1 = 262, NW = 12;              // the nave
const UP = 6;                                     // the temple floor above the ground

/** Its ground kept open (details.js keepsClear: no trees on it, its road or its forecourt). */
export function templeClear(D) {
  D.zones.push([0, 238, 44], [0, 190, 18], [0, 160, 12], [0, 130, 12]);
}

/** Rotated box (a facet of the apse), drawn without a collider (addSeg makes its wall). */
function facet(b, M, mat, ax, az, bx, bz, y0, y1, t, physics) {
  const L = Math.hypot(bx - ax, bz - az), rot = -Math.atan2(bz - az, bx - ax);
  b.place((ax + bx) / 2, y0, (az + bz) / 2, rot, 1, (o) => o.box([-L / 2 - 0.05, 0, -t / 2], [L / 2 + 0.05, y1 - y0, t / 2], mat), { solid: false });
  physics.addSeg(ax, az, bx, bz, y0, y1, t, 'wall');
}

export function buildTemple(ctx, M) {
  const { b, physics } = ctx, g = terrainHeight(0, 240), F = g + UP;
  const stone = M('castle_keep_rough_battlement_block', 2.4, { tint: 0x5a5250 }), dark = M('castle_basalt', 1.2, { tint: 0x3a3434 });
  const floorM = M('cathedral_graveyard_nave_flagstone', 1.8, { tint: 0x7a6e6a }), roof = M('castle_roof_black', 1.6, { tint: 0x7a7480 }), gold = M('gold_01_beaten_antique_gold', 1);
  const crypt = M('castle_basalt', 1.4, { tint: 0x6a6460 }), bone = M('castle_keep_ivory_chapel_marble', 0.6, { tint: 0xb8a888 });
  const T = { ...TEMPLE, g, floor: F, statues: [], knights: [], dead: [], flames: [] };
  const flame = (x, y, z, s = 0.4) => { ctx.scatter?.place('brazier', x, y, z, 1.3); ctx.flames.push([x, y + 1.1, z, s, 1]); };

  // ---- the road from the village's south edge to its stair: grey cobbles, a statue every so often
  const road = M('town_grey_cobbles', 2.5, { overlay: true, feather: 1.8 });
  const pts = []; for (let z = 98; z <= 204; z += 3) pts.push([Math.sin(z * 0.03) * 1.2, z]);
  b.ribbon(road, pts, 2.6, 0.05);
  (ctx.paths ||= []).push({ pts: pts.map(([x, z]) => [x, z]), w: 2.6 });
  for (const z of [120, 150, 180]) for (const s of [-1, 1]) T.statues.push({ x: s * 6.2, z, y: terrainHeight(s * 6.2, z), yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2, kind: 'knight', plinth: true });

  // ---- the podium: hollow (the crypt is in it), its walls founded below the ground
  b.box([X0, g - 1, Z0], [X1, F, Z0 + 1.5], stone);                       // front
  b.box([X0, g - 1, Z1 - 1.5], [X1, F, Z1], stone);                       // back
  b.box([X0, g - 1, Z0], [X0 + 1.5, F, Z1], stone);                       // west
  b.box([X1 - 1.5, g - 1, Z0], [X1, F, Z1], stone);                       // east
  b.box([X0 - 0.4, F - 0.4, Z0 - 0.4], [X1 + 0.4, F, Z1 + 0.4], dark, { solid: false });   // (a cornice round its top)
  // the temple floor over the crypt, a well in it for the crypt's stair
  const HX = 2.6, HZ0 = 246, HZ1 = 257.5;
  b.box([X0 + 1.5, F - 0.5, Z0 + 1.5], [X1 - 1.5, F, HZ0], floorM);
  b.box([X0 + 1.5, F - 0.5, HZ1], [X1 - 1.5, F, Z1 - 1.5], floorM);
  b.box([X0 + 1.5, F - 0.5, HZ0], [-HX, F, HZ1], floorM); b.box([HX, F - 0.5, HZ0], [X1 - 1.5, F, HZ1], floorM);
  for (const s of [-1, 1]) b.box([s > 0 ? HX : -HX - 0.3, F, HZ0], [s > 0 ? HX + 0.3 : -HX, F + 1.0, HZ1], dark);   // (its parapet: open toward the door)
  b.box([-HX - 0.3, F, HZ1], [HX + 0.3, F + 1.0, HZ1 + 0.3], dark);
  // the grand stair up the podium's front, braziers at its head, statues at its foot
  const pale = M('castle_keep_pale_keep_limestone', 1.4, { tint: 0x9a948c });
  b.stairs(0, Z0 - 12, g, UP, 9, '+z', pale, { step: 0.25, run: 0.5 });
  for (const s of [-1, 1]) {   // (flame-bowls on pylons at the stair's foot)
    b.box([s * 6.2 - 0.5, g, Z0 - 13.2], [s * 6.2 + 0.5, g + 3.4, Z0 - 12.2], pale);
    flame(s * 6.2, g + 3.4, Z0 - 12.7, 0.5);
  }
  for (const s of [-1, 1]) { b.box([s * 4.5 - (s > 0 ? 0 : 1), g, Z0 - 12], [s * 4.5 + (s > 0 ? 1 : 0), g + 1.0, Z0], pale); flame(s * 4, F, Z0 + 2.2, 0.45); T.statues.push({ x: s * 7, z: Z0 - 10.5, y: g, yaw: Math.PI, kind: 'knight', plinth: true }); }
  // the towers at its front corners, octagonal, roofed black, and the back corners' lower ones
  for (const [cx, cz, top] of [[X0, Z0 + 2, F + 22], [X1, Z0 + 2, F + 22], [X0, Z1, F + 8], [X1, Z1, F + 8]]) {
    b.ring(cx, cz, 3.4, g - 1, top, 8, stone);
    b.cylinder([cx, top - 0.4, cz], [cx, top, cz], 3.3, 8, dark);
    b.cone(cx, cz, 3.9, top, top > F + 10 ? 9 : 4, 8, roof);
  }

  // ---- the nave: walls with lancets and buttresses, the great door, a gable roof
  const lancets = (len) => Array.from({ length: Math.floor((len - 4) / 6.5) }, (_, i) => ({ at: 5 + i * 6.5, w: 1.3, y0: F + 6, y1: F + 12.5 }));
  b.wall(-NW, NZ0, -NW, NZ1, F, F + 14, 1.2, stone, lancets(NZ1 - NZ0));
  b.wall(NW, NZ0, NW, NZ1, F, F + 14, 1.2, stone, lancets(NZ1 - NZ0));
  b.wall(-NW - 0.6, NZ0, NW + 0.6, NZ0, F, F + 14, 1.2, stone, [{ at: NW + 0.6, w: 5.2, y0: F, y1: F + 6.5 }]);
  for (let z = NZ0 + 3; z < NZ1; z += 6.5) for (const s of [-1, 1]) b.box([s > 0 ? NW + 0.6 : -NW - 2.1, F, z - 0.6], [s > 0 ? NW + 2.1 : -NW - 0.6, F + 11, z + 0.6], stone);
  b.gable(-NW - 0.6, NZ0 - 0.6, NW + 0.6, NZ1, F + 14, 7, roof, stone, 'z', 0.8);
  // the façade: the door's dark frame, the great V over it, red banners
  b.box([-3.1, F, NZ0 - 0.9], [-2.6, F + 7, NZ0 - 0.5], dark, { solid: false }); b.box([2.6, F, NZ0 - 0.9], [3.1, F + 7, NZ0 - 0.5], dark, { solid: false });
  b.box([-3.1, F + 6.5, NZ0 - 0.9], [3.1, F + 7.2, NZ0 - 0.5], dark, { solid: false });
  for (const s of [-1, 1]) b.place(0, 0, 0, 0, 1, (o) => o.beam([s * 3.4, F + 13.2, NZ0 - 0.75], [0, F + 8.2, NZ0 - 0.75], 0.5, 0.25, gold), { solid: false });
  for (const s of [-1, 1]) {   // (the portal: deep jambs either side of the door, a pointed arch over it)
    b.box([s > 0 ? 2.65 : -4.15, F, NZ0 - 2.6], [s > 0 ? 4.15 : -2.65, F + 7.4, NZ0 - 0.6], stone);
    b.place(0, 0, 0, 0, 1, (o) => { o.beam([s * 3.4, F + 7.4, NZ0 - 1.6], [0, F + 10.4, NZ0 - 1.6], 0.9, 1.9, stone); o.beam([s * 2.7, F + 7.0, NZ0 - 2.65], [0, F + 9.6, NZ0 - 2.65], 0.18, 0.2, gold); }, { solid: false });
  }
  for (const s of [-1, 1]) b.place(s * 7, F + 11, NZ0 - 0.7, Math.PI, 1, (o) => {
    o.box([-1.2, -6.2, -0.04], [1.2, 0, 0.04], M('cloth_04_aged_cream_linen', 0.6, { tint: 0x6a0e0c }));
    o.beam([-0.7, -1.6, -0.08], [0, -4.4, -0.08], 0.22, 0.03, gold); o.beam([0.7, -1.6, -0.08], [0, -4.4, -0.08], 0.22, 0.03, gold);
  }, { solid: false });
  // the apse: half an octagon behind the nave, its roof a cone
  { const R = 12, cz = NZ1, v = [[NW, cz], ...[22.5, 67.5, 112.5, 157.5].map((a) => [Math.cos(a * Math.PI / 180) * R, cz + Math.sin(a * Math.PI / 180) * R]), [-NW, cz]];
    for (let i = 0; i + 1 < v.length; i++) facet(b, M, stone, v[i][0], v[i][1], v[i + 1][0], v[i + 1][1], F, F + 14, 1.2, physics);
    b.cone(0, cz, R + 1, F + 14, 7, 8, roof);
    b.box([-R - 0.8, F + 13.8, cz - 0.8], [R + 0.8, F + 14.3, cz + R + 0.8], dark, { solid: false }); }   // (its ceiling: the cone is drawn for the outside only)
  // inside: two rows of columns, the aisles' statues between them, braziers at the columns' feet
  for (let z = NZ0 + 6; z < HZ0; z += 6) for (const s of [-1, 1]) {
    const x = s * 7.2;
    b.box([x - 1, F, z - 1], [x + 1, F + 0.6, z + 1], dark);
    b.place(x, F + 0.6, z, 0, 1, (o) => { o.cylinder([0, 0, 0], [0, 13.4, 0], 0.72, 12, stone); o.box([-1, 13.4, -1], [1, 14.1, 1], dark); }, { solid: false });
    physics.add([x - 0.65, F, z - 0.65], [x + 0.65, F + 14, z + 0.65], 'pillar');
    if (z < HZ0 - 4) T.statues.push({ x: s * 10, z: z + 3, y: F, yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2, kind: 'knight', plinth: true });
  }
  flame(-7.2, F + 0.6, NZ0 + 2.4); flame(7.2, F + 0.6, NZ0 + 2.4);
  { const run = M('cathedral_graveyard_nave_flagstone', 1.4, { tint: 0xc4b8ac });     // (a pale runner from the door to the dais: the way to the altar)
    b.box([-1.7, F, NZ0 - 0.4], [1.7, F + 0.03, HZ0 - 0.4], run, { solid: false });
    b.box([-1.7, F, HZ1 + 0.4], [1.7, F + 0.03, NZ1 - 1], run, { solid: false });
    for (const s of [-1, 1]) b.box([s > 0 ? HX + 0.4 : -1.7 - 0.4, F, HZ0 - 0.4], [s > 0 ? 1.7 + 0.4 + 2 : -HX - 0.4, F + 0.03, HZ1 + 0.4], run, { solid: false }); }
  for (const z of [NZ0 + 10, NZ0 + 22]) for (const s of [-1, 1]) flame(s * 4.6, F, z, 0.36);   // (down the nave, the way to the altar lit)
  // the apse: a dais of three steps, the altar, the great gilded V, braziers either side
  for (let k = 0; k < 3; k++) b.box([-7 + k, F + k * 0.25, NZ1 - 1 + k * 0.8], [7 - k, F + (k + 1) * 0.25, NZ1 + 9 - k * 0.5], dark);
  b.box([-1.8, F + 0.75, NZ1 + 3.4], [1.8, F + 1.9, NZ1 + 5.2], dark);
  for (const s of [-1, 1]) b.place(0, 0, 0, 0, 1, (o) => o.beam([s * 3.6, F + 11.5, NZ1 + 8], [0, F + 2.4, NZ1 + 8], 0.6, 0.35, gold), { solid: false });
  flame(-4.6, F + 0.75, NZ1 + 4.5, 0.5); flame(4.6, F + 0.75, NZ1 + 4.5, 0.5);
  for (const s of [-1, 1]) flame(s * 4.8, F, NZ0 - 3.4, 0.45);    // (braziers at the portal)

  // ---- the crypt, in the podium: the stair down from the floor's well; round it and a core of rock the
  // galleries run, loculi and sarcophagi along their outer walls; the tomb hall at the back, the
  // first commander's tomb on its dais; the reliquary at the front
  const C0 = g + 0.5, CT = F - 0.5;     // its floor, its ceiling (the temple floor's underside)
  b.box([X0 + 1.5, g - 0.6, Z0 + 1.5], [X1 - 1.5, C0, Z1 - 1.5], M('cathedral_graveyard_nave_flagstone', 1.6, { tint: 0x9a8e82 }));
  b.stairs(0, HZ0, F, -(UP - 0.5), 2 * HX - 0.2, '+z', stone, { step: 0.25, run: 0.5 });
  for (const s of [-1, 1]) b.box([s > 0 ? HX : -HX - 0.6, C0, HZ0], [s > 0 ? HX + 0.6 : -HX, CT, HZ1], crypt);       // (the stair's shaft)
  b.box([-5, C0, Z0 + 7], [5, CT, HZ0], crypt);                                                                          // (the core)
  for (let z = Z0 + 4; z < Z1 - 3; z += 4) for (const s of [-1, 1]) {                                                  // (the ribs over the galleries)
    const x0 = s * 5, x1 = s * (X1 - 1.5);
    b.place(0, 0, 0, 0, 1, (o) => { o.beam([x0, CT - 1.6, z], [(x0 + x1) / 2, CT - 0.15, z], 0.3, 0.4, dark); o.beam([(x0 + x1) / 2, CT - 0.15, z], [x1, CT - 1.6, z], 0.3, 0.4, dark); }, { solid: false });
  }
  for (const [ax, az, bx, bz] of [[X0 + 1.5, Z1 - 5.5, X0 + 5.5, Z1 - 1.5], [X1 - 1.5, Z1 - 5.5, X1 - 5.5, Z1 - 1.5]]) facet(b, M, crypt, ax, az, bx, bz, C0, CT, 1, physics);   // (the tomb hall's chamfered corners)
  // loculi: three tiers of niches in the galleries' outer walls, bones in them
  for (let z = Z0 + 6; z < HZ1; z += 2.4) for (const s of [-1, 1]) {
    const x = s * (X1 - 1.5);
    for (let t = 0; t < 3; t++) b.box([s > 0 ? x - 0.5 : x, C0 + 0.4 + t * 1.25, z - 0.85], [s > 0 ? x : x + 0.5, C0 + 0.48 + t * 1.25, z + 0.85], crypt, { solid: false });
    if ((z | 0) % 3 === 0) ctx.scatter?.place('skull_pile', x - s * 0.3, C0 + 1.73, z, 0.6);
  }
  for (const [x, z] of [[-11, 230], [11, 236], [-11, 246], [11, 252], [-6, 268], [6, 268]]) ctx.scatter?.place('bone_pile', x, C0, z, 1);
  // sarcophagi down the galleries (where some of the dead lie waiting), the tomb on its dais
  for (const [x, z] of [[-9, 226], [9, 232], [-9, 240], [9, 248], [-9, 254], [9, 224]]) ctx.scatter?.place(z % 2 ? 'sealed_sarcophagus' : 'broken_sarcophagus', x, C0, z, 1.1, 0);
  b.box([-4.5, C0, Z1 - 9], [4.5, C0 + 0.5, Z1 - 3], dark);
  b.box([-1.4, C0 + 0.5, Z1 - 7.6], [1.4, C0 + 1.6, Z1 - 4.4], M('castle_keep_ivory_chapel_marble', 1, { tint: 0x8a9a7a }));
  for (const s of [-1, 1]) b.place(0, 0, 0, 0, 1, (o) => o.beam([s * 1.2, C0 + 1.62, Z1 - 7.4], [0, C0 + 1.62, Z1 - 4.6], 0.18, 0.06, gold), { solid: false });   // (his V on its lid)
  // its light: torches down the galleries (warm on the way round), a green glow on the tomb
  for (const z of [224, 238, 252]) for (const s of [-1, 1]) { ctx.flames.push([s * (X1 - 2.0), C0 + 2.6, z, 0.18, 1]); ctx.scatter?.place('torch', s * (X1 - 1.9), C0 + 2.2, z, 1); }
  ctx.flames.push([0, C0 + 1.9, Z1 - 6, 0.5, 1]);                 // (the tomb: the brightest thing down here, seen from the stair's foot)
  for (const s of [-1, 1]) { ctx.flames.push([s * 4.2, C0 + 0.9, Z1 - 6, 0.22, 1]); ctx.scatter?.place('candelabrum', s * 4.2, C0 + 0.5, Z1 - 6, 1); }
  for (const s of [-1, 1]) ctx.flames.push([s * 9, C0 + 0.6, 258, 0.16, 1]);    // (embers low at the galleries' far bends)
  ctx.flames.push([0, C0 + 3.5, HZ1 - 0.6, 0.22, 1]);         // (the stair's foot lit)
  // the reliquary at the front: the oath-roll's chest, between the galleries
  ctx.props?.add('chest_gilded_iron', 0, C0, Z0 + 4, Math.PI, 1);
  T.chest = { x: 0, z: Z0 + 4, y: C0 };
  // the rooms (main.js zoneAt: indoors, by name; the crypt first, under the nave)
  ctx.zones.push({ x0: X0 + 1.5, z0: Z0 + 1.5, x1: X1 - 1.5, z1: Z1 - 1.5, y0: g - 1, y1: CT, name: TEMPLE.crypt });
  ctx.zones.push({ x0: -NW, z0: NZ0, x1: NW, z1: NZ1 + 12, y0: CT, y1: F + 20, name: TEMPLE.name });

  // ---- who's in it (populateTemple): knights in the nave, their warden at the altar; the crypt's dead
  T.knights = [['sworn_m', -4, NZ0 + 4], ['sworn_m', 4, NZ0 + 4], ['sworn_f', -4, 238], ['sworn_m', 4, 236], ['sworn_adept_m', -3.5, NZ1 - 2.5], ['sworn_adept_f', 3.5, NZ1 - 2.5], ['sworn_warden', 0, NZ1 - 1.6]];
  T.dead = [[-9, 227, 'playdead'], [9, 231, 'playdead'], [-9.5, 236, 'stand'], [10, 243, 'stand'], [-9, 249, 'playdead'], [9, 253, 'stand'], [-3, 262, 'stand'], [3, 263, 'stand'], [-8, 265, 'playdead'], [8, 266, 'playdead'], [0, 219.5, 'stand'], [-10, 219, 'playdead']];
  T.crypt0 = C0;
  ctx.temple = T;
  return T;
}

/** Velscour's knights in the nave and the crypt's dead (main.js: the dead once the zombies are in, the
 * knights once the Sworn are made). */
export function populateTemple(T, { foes = null, zombies = null, touch = false } = {}) {
  if (!T) return 0;
  let n = 0;
  if (foes) for (const [v0, x, z] of touch ? T.knights.filter((_, i) => i % 2 === 0) : T.knights) {
    const v = foes.gltf[v0] ? v0 : 'sworn_m';
    if (!foes.gltf[v]) continue;
    const f = foes.spawn(v, x, z, { y: T.floor, zone: 'wild', area: { x, z, r: 4 } });
    f.band = 'temple'; f.yaw = Math.PI;
    if (v0 === 'sworn_warden') { f.slay = 'oswin'; f.named = true; }
    n++;
  }
  if (zombies) for (const [x, z, start] of touch ? T.dead.filter((_, i) => i % 2 === 0) : T.dead) {
    const zb = zombies.spawn(null, x, z, { y: T.crypt0, zone: 'wild', start, area: { x, z, r: 6 } });
    zb.band = 'crypt'; n++;
  }
  return n;
}
