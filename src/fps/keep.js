// Blackvigil Keep: the stronghold of Lord Velscour's Sworn, in the Darkwood west of the village at
// the end of the Vigil Road (the village's west road, run on through the forest). A curtain wall of
// black stone with a round tower of slate at each corner and a gatehouse on the road; inside, a courtyard of
// braziers, banner stands and arms; and the keep itself: the Hall of the Sworn, their barracks and
// armoury, the chapel where they pray to Velscour, the reliquary, and at the far end of it all the
// Red Throne, where Ser Malgrave keeps his vigil before a chest sealed by his oath. The chest can't
// be opened until he falls (foes.js calls unseal()).
//
// Built after the undercroft (so the textures it names don't change which ones the undercroft is
// given). At run time it names the places, gives the Sworn a flow field to follow you through its
// doorways, hides those in rooms you can't see into, and keeps the chest's seal.
import * as THREE from 'three';
import { wallPanel } from './sprites.js';
import { makeGear, makePotion } from './gear.js';

export const KEEP = { x0: -282, x1: -196, z0: -36, z1: 36 };   // the curtain wall's line
const HALL = { x0: -276, x1: -234, z0: -26, z1: 26 };           // the keep's outer walls
const ROAD = { x0: -118, x1: KEEP.x1 };                         // from the end of the village's west road to the gate
const CEIL = 8;                                                 // the keep's rooms are this tall
const DAIS = { x0: HALL.x0 + 0.8, x1: -270.4, z0: -6, z1: 6, h: 0.44 };
const CHEST = { x: -272.1, z: 0 };                              // on the dais, behind the throne room's lord
const SIGIL = 'art/velscour/sigil_cut.png';

/** The ground the keep and its clearing take (the forest leaves it open). */
export function keepClear(x, z) {
  return x > KEEP.x0 - 12 && x < KEEP.x1 + 14 && Math.abs(z) < KEEP.z1 + 12;
}

// the road's gentle wander, coming in straight at both ends
const roadZ = (x) => { const t = (x - ROAD.x0) / (ROAD.x1 - ROAD.x0); return Math.sin(t * Math.PI) * (Math.sin(x * 0.07) * 2.2 + 0.8); };

// the rooms: their walls' inner faces, their names, what they are
const IN = 0.8;      // half an outer wall
const ROOMS = [
  { id: 'hall', name: 'The Hall of the Sworn', x0: -262, x1: HALL.x1, z0: -13, z1: 13 },
  { id: 'barracks', name: 'The Barracks of the Vigil', x0: -262, x1: HALL.x1, z0: HALL.z0, z1: -13 },
  { id: 'chapel', name: 'The Chapel of Velscour', x0: HALL.x0, x1: -262, z0: HALL.z0, z1: -13 },
  { id: 'armoury', name: 'The Armoury', x0: -262, x1: HALL.x1, z0: 13, z1: HALL.z1 },
  { id: 'reliquary', name: 'The Reliquary', x0: HALL.x0, x1: -262, z0: 13, z1: HALL.z1 },
  { id: 'throne', name: 'The Red Throne', x0: HALL.x0, x1: -262, z0: -13, z1: 13 },
];
// doorways between them (and the way in): which rooms they join
const LINKS = [['yard', 'hall'], ['hall', 'barracks'], ['hall', 'armoury'], ['hall', 'throne'], ['barracks', 'chapel'],
  ['armoury', 'reliquary'], ['chapel', 'throne'], ['reliquary', 'throne']];

export function buildKeep(ctx) {
  const { lib, b, props, scene } = ctx;
  const M = (id, tile = 3, o = {}) => lib.material(id, { tile, ...o });
  const S = (id, x, z, s = 1, rot, y = 0) => ctx.scatter.place(id, x, y, z, s, rot);
  const iron = M('castle_iron', 3), slate = M('castle_slatestone', 2.5);
  // the dark masonry (tools/world/import_banners_stone.py): a different blackstone or slate for every
  // wall and tower, so no two faces of the place are laid alike
  const black = (n) => M(`masonry_blackstone_${String(n).padStart(2, '0')}`, 3), slab = (n) => M(`masonry_slate_${String(n).padStart(2, '0')}`, 3);
  // Velscour's banners (the ones bearing his V: only ever where his people are), each in turn
  const VB = lib.sprites('banner', (q) => q.allegiance === 'velscour').map((q) => q.id);
  let vk = 0;
  const vb = () => VB[vk++ % VB.length];
  const roofBlack = M('castle_roof_black', 2.5), beams = M('castle_wood', 2.5);
  const merlon = M('castle_keep_rough_battlement_block', 1.2);
  const quad = (mat, x0, z0, x1, z1, y = 0.03) => b.quad(mat, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]]);

  // ------------------------------------------------------------ the Vigil Road
  // gravelled, with trodden earth either side (the ground sheets', darkened for the Darkwood)
  const gravel = M('ground_gravel_07', 1.4, { overlay: true, tint: 0x969798, feather: 1.0 }), verge = M('ground_dirt_05', 1.6, { overlay: true, tint: 0x72737e, feather: 1.5 });
  const line = [];   // (east to west: one continuous ribbon each, frayed along its sides)
  for (let x = ROAD.x0 + 2; x > ROAD.x1 - 4; x -= 2) line.push([x, roadZ(x)]);
  b.ribbon(verge, line, 3.2, 0.018);
  b.ribbon(gravel, line, 2.1, 0.024);
  ctx.tufts?.verge(line, 3.2, 1.5, { tint: [0.62, 0.68, 0.6], clear: (x) => x > KEEP.x1 + 6 });   // (grass at its verges, dark as the Darkwood's: grass.js)
  S('dark_forest_trail_sign', ROAD.x0 - 2, -4.6, 1, -Math.PI / 2);
  for (let x = ROAD.x0 - 18, k = 0; x > ROAD.x1 + 10; x -= 22, k++) S('dark_forest_lantern_stake', x, roadZ(x) + (k % 2 ? 3.6 : -3.6), 1, k % 2 ? Math.PI : 0);
  // the Sworn's warnings along the last of it: skulls heaped on the verge, a gibbet's chains
  S('catacombs_skull_pyramid', KEEP.x1 + 22, 5.2, 1); S('catacombs_skull_pyramid', KEEP.x1 + 22, -5.4, 1);
  S('sewers_fallen_skull_warning_slab', KEEP.x1 + 34, -5.6, 1, -Math.PI / 2);
  S('catacombs_chain_and_shackle', KEEP.x1 + 12, 6, 1);

  // ------------------------------------------------------------ the curtain wall
  const K = KEEP, WT = 2.4, WH = 8;
  const battlements = (x0, z0, x1, z1, y, thick) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = Math.abs(alongX ? x1 - x0 : z1 - z0);
    for (let a = 0.6; a < len - 0.6; a += 2.2) {
      const u = (alongX ? Math.min(x0, x1) : Math.min(z0, z1)) + a;
      if (alongX) b.box([u, y, z0 - thick / 2], [u + 1.1, y + 1.2, z0 + thick / 2], merlon, { solid: false });
      else b.box([x0 - thick / 2, y, u], [x0 + thick / 2, y + 1.2, u + 1.1], merlon, { solid: false });
    }
  };
  b.wall(K.x0, K.z0, K.x1, K.z0, 0, WH, WT, black(1)); battlements(K.x0, K.z0, K.x1, K.z0, WH, WT);
  b.wall(K.x0, K.z1, K.x1, K.z1, 0, WH, WT, black(2)); battlements(K.x0, K.z1, K.x1, K.z1, WH, WT);
  b.wall(K.x0, K.z0, K.x0, K.z1, 0, WH, WT, black(3)); battlements(K.x0, K.z0, K.x0, K.z1, WH, WT);
  b.wall(K.x1, K.z0, K.x1, K.z1, 0, WH, WT, black(4), [{ at: -K.z0, w: 5.2, y0: 0, y1: 6.2 }]);
  battlements(K.x1, K.z0, K.x1, -4, WH, WT); battlements(K.x1, 4, K.x1, K.z1, WH, WT);
  // a round tower at each corner, roofed in black slate
  [[K.x0, K.z0], [K.x1, K.z0], [K.x0, K.z1], [K.x1, K.z1]].forEach(([x, z], i) => {
    b.ring(x, z, 4.6, 0, 12.5, 12, slab(1 + i));
    b.box([x - 3.6, 12.3, z - 3.6], [x + 3.6, 12.5, z + 3.6], slate, { solid: false });
    b.cone(x, z, 5.2, 12.5, 7.5, 12, roofBlack);
  });
  // the gatehouse: two square towers out on the road, the gate between them under a raised portcullis
  for (const s of [-1, 1]) {
    b.box([K.x1 - 3, 0, s > 0 ? 2.6 : -8.6], [K.x1 + 5, 12, s > 0 ? 8.6 : -2.6], slab(s > 0 ? 5 : 6));
    battlements(K.x1 - 3, s * 8.6, K.x1 + 5, s * 8.6, 12, 0.8);
    battlements(K.x1 + 5, s > 0 ? 2.6 : -8.6, K.x1 + 5, s > 0 ? 8.6 : -2.6, 12, 0.8);
  }
  b.box([K.x1 - 3, 6.2, -2.6], [K.x1 + 5, 12, 2.6], slab(7));
  const bar = M('met_02_riveted_black_iron', 1);
  for (let z = -2.3; z <= 2.31; z += 0.46) b.box([K.x1 + 3.1, 4.7, z - 0.05], [K.x1 + 3.2, 6.25, z + 0.05], bar, { solid: false });
  for (const y of [5.0, 5.7]) b.box([K.x1 + 3.08, y, -2.5], [K.x1 + 3.22, y + 0.1, 2.5], bar, { solid: false });
  props.add('wall_torch', K.x1 + 5.02, 0, -4.2, Math.PI / 2); props.add('wall_torch', K.x1 + 5.02, 0, 4.2, Math.PI / 2);
  wallPanel(lib, scene, vb(), K.x1 + 5.06, 8.2, -5.6, [1, 0, 0], 4.2);
  wallPanel(lib, scene, vb(), K.x1 + 5.06, 8.2, 5.6, [1, 0, 0], 4.2);
  for (const z of [-24, -14, 14, 24]) wallPanel(lib, scene, 'hanging_plain_arrow_slit', K.x1 + WT / 2 + 0.03, 5.4, z, [1, 0, 0], 1.6);

  // ------------------------------------------------------------ the courtyard
  const flags = M('ground_flagstones_04', 2.4, { overlay: true, tint: 0x9d9c9e, feather: 0.8 });   // (round the keep, not under it)
  quad(flags, HALL.x1, K.z0 + 1.2, K.x1 + 5, K.z1 - 1.2, 0.022);
  quad(flags, K.x0 + 1.2, K.z0 + 1.2, HALL.x1, HALL.z0, 0.022); quad(flags, K.x0 + 1.2, HALL.z1, HALL.x1, K.z1 - 1.2, 0.022);
  quad(flags, K.x0 + 1.2, HALL.z0, HALL.x0, HALL.z1, 0.022);
  quad(M('ground_cobbles_02', 1.4, { overlay: true, tint: 0xccd2e6, feather: 0.7 }), HALL.x1, -3, K.x1 + 5, 3, 0.03);       // the way up to the keep's door, cobbled
  for (const [x, z] of [[-206, -9], [-206, 9], [-222, -9], [-222, 9]]) S('castle_keep_brazier_ash', x, z, 1.3);
  for (const [x, z] of [[-214, -9], [-214, 9]]) S('castle_keep_royal_banner_stand', x, z, 1.2, Math.PI / 2);
  S('castle_keep_weapon_chest', -203, -30, 1, 0); S('castle_keep_shield_rack', -209, -32.6, 1.1, 0);
  S('castle_keep_shield_rack', -216, -32.6, 1.1, 0); S('castle_keep_armory_barrel', -224, -31, 1); S('castle_keep_armory_barrel', -226, -32, 1);
  S('castle_keep_chain_winch', -200.5, 31, 1, Math.PI); S('castle_keep_carved_lion_statue', -228, 22, 1.2, Math.PI / 2);
  S('castle_keep_carved_lion_statue', -228, -22, 1.2, Math.PI / 2); S('castle_keep_cracked_tile_rubble', -210, 26, 1);
  // the Sworn's training ground: armour on stands for them to cut at
  for (const [x, z] of [[-208, 20], [-213, 23], [-218, 20]]) S('castle_keep_empty_suit_of_armor', x, z, 1, -Math.PI / 2);
  for (const [x, z] of [[-240, -34.4], [-252, -34.4], [-264, -34.4], [-240, 34.4], [-252, 34.4], [-264, 34.4]]) S('castle_keep_wall_brazier', x, z, 1, z < 0 ? 0 : Math.PI);

  // ------------------------------------------------------------ the keep
  const H = HALL, OT = IN * 2, OH = 12.5;
  const door = (at, w = 3.2, h = 4.4) => ({ at, w, y0: 0, y1: h });
  b.wall(H.x1, H.z0, H.x1, H.z1, 0, OH, OT, black(5), [door(26, 4.6, 6.2)]);               // east, the way in
  b.wall(H.x0, H.z0, H.x0, H.z1, 0, OH, OT, black(6));
  b.wall(H.x0, H.z0, H.x1, H.z0, 0, OH, OT, black(7));
  b.wall(H.x0, H.z1, H.x1, H.z1, 0, OH, OT, black(8));
  battlements(H.x1, H.z0, H.x1, -3.4, OH, OT); battlements(H.x1, 3.4, H.x1, H.z1, OH, OT);
  battlements(H.x0, H.z0, H.x0, H.z1, OH, OT); battlements(H.x0, H.z0, H.x1, H.z0, OH, OT); battlements(H.x0, H.z1, H.x1, H.z1, OH, OT);
  // the roof over all of it (its underside the rooms' ceiling), a square turret at each corner
  b.box([H.x0, CEIL, H.z0], [H.x1, CEIL + 0.7, H.z1], { top: slate, bottom: beams, side: black(5) }, { shade: 0.75 });
  [[H.x0, H.z0], [H.x1, H.z0], [H.x0, H.z1], [H.x1, H.z1]].forEach(([x, z], i) => {
    b.box([x - 2.6, CEIL, z - 2.6], [x + 2.6, 16, z + 2.6], slab([8, 9, 10, 3][i]), { solid: false });
    b.cone(x, z, 3.5, 16, 6.5, 8, roofBlack);
  });
  // a porch over the door: two piers and a lintel, Velscour's banners either side
  b.box([H.x1, 0, -4.4], [H.x1 + 1.6, 7, -3.0], black(9)); b.box([H.x1, 0, 3.0], [H.x1 + 1.6, 7, 4.4], black(9));
  b.box([H.x1, 6.4, -4.4], [H.x1 + 1.6, 7.4, 4.4], merlon, { solid: false });
  wallPanel(lib, scene, vb(), H.x1 + 0.84, 7.6, -7.4, [1, 0, 0], 5);
  wallPanel(lib, scene, vb(), H.x1 + 0.84, 7.6, 7.4, [1, 0, 0], 5);
  props.add('wall_torch', H.x1 + IN + 0.02, 0, -5.4, Math.PI / 2); props.add('wall_torch', H.x1 + IN + 0.02, 0, 5.4, Math.PI / 2);
  for (const z of [-20, -12, 12, 20]) wallPanel(lib, scene, 'hanging_keyhole_arrow_slit', H.x1 + 0.83, 9.5, z, [1, 0, 0], 1.8);
  for (const x of [-242, -254, -266]) for (const s of [-1, 1]) wallPanel(lib, scene, 'hanging_plain_arrow_slit', x, 9.5, s * (H.z1 + 0.83), [0, 0, s], 1.8);
  // the walls between the rooms (inner walls a metre thick, their doors on the hall's axes)
  const IT = 1;
  b.wall(H.x0, -13, H.x1, -13, 0, CEIL, IT, black(10), [door(7), door(28)]);       // the north rooms: chapel (at x -269), barracks (x -248)
  b.wall(H.x0, 13, H.x1, 13, 0, CEIL, IT, black(2), [door(7), door(28)]);         // the south: reliquary, armoury
  b.wall(-262, H.z0, -262, H.z1, 0, CEIL, IT, iron, [door(6.5), door(26, 5.2, 6.2), door(45.5)]);   // the throne room's wall
  // floors
  const floor = { hall: 'castle_keep_sootdark_great_hall', barracks: 'castle_keep_charcoal_guardstone', chapel: 'castle_keep_ivory_chapel_marble',
    armoury: 'castle_keep_crimson_armory_brick', reliquary: 'castle_keep_bluegray_bastion_slate', throne: 'castle_keep_royal_inlay_slab' };
  for (const r of ROOMS) quad(M(floor[r.id], 2.4, { overlay: true }), r.x0, r.z0, r.x1, r.z1, 0.03);
  for (const r of ROOMS) ctx.zones.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, y0: -1, y1: CEIL, name: r.name });
  // torches round every room, clear of its doors
  const doorsAt = [[-269, -13], [-248, -13], [-269, 13], [-248, 13], [-262, -19.5], [-262, 0], [-262, 19.5], [H.x1, 0]];
  const nearDoor = (x, z) => doorsAt.some(([dx, dz]) => Math.hypot(x - dx, z - dz) < 3.2);
  for (const r of ROOMS) {
    const x0 = Math.max(r.x0, H.x0 + IN) + (r.x0 === -262 ? IT / 2 : 0), x1 = Math.min(r.x1, H.x1 - IN) - (r.x1 === -262 ? IT / 2 : 0);
    const z0 = Math.max(r.z0, H.z0 + IN) + (Math.abs(r.z0) === 13 ? IT / 2 : 0), z1 = Math.min(r.z1, H.z1 - IN) - (Math.abs(r.z1) === 13 ? IT / 2 : 0);
    Object.assign(r, { ix0: x0, ix1: x1, iz0: z0, iz1: z1 });
    for (let x = x0 + 3.5; x < x1 - 2; x += 7) {
      if (!nearDoor(x, z0)) props.add('wall_torch', x, 0, z0 + 0.02, 0);
      if (!nearDoor(x, z1)) props.add('wall_torch', x, 0, z1 - 0.02, Math.PI);
    }
    for (let z = z0 + 3.5; z < z1 - 2; z += 7) {
      if (r.id !== 'throne' && !nearDoor(x0, z)) props.add('wall_torch', x0 + 0.02, 0, z, Math.PI / 2);
      if (!nearDoor(x1, z)) props.add('wall_torch', x1 - 0.02, 0, z, -Math.PI / 2);
    }
  }
  const room = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

  // the Hall of the Sworn: two rows of pillars down the aisle, long tables, their banners
  const hall = room.hall;
  for (let x = -239; x > -259; x -= 5) for (const z of [-6.5, 6.5]) props.add('pillar_gothic', x, 0, z, 0, 1, CEIL);
  for (const z of [-10, 10]) {                   // (the doors to the wings at x -248 left clear)
    for (const x of [-239.5, -243.5, -252.5, -256.5]) props.add('table', x, 0, z, Math.PI / 2);
    for (const x of [-238.5, -240.5, -242.5, -244.5, -251.5, -253.5, -255.5, -257.5]) for (const s of [-1, 1]) props.add('stool', x, 0, z + s * 1.1);
  }
  for (const x of [-238.5, -243.5, -253, -258]) for (const s of [-1, 1]) wallPanel(lib, scene, vb(), x, 5.6, s * (hall.iz1 - 0.04), [0, 0, -s], 3.6);   // (clear of the doors to the wings)
  S('castle_keep_wall_brazier', -236, -12, 1, 0); S('castle_keep_wall_brazier', -236, 12, 1, Math.PI);
  wallPanel(lib, scene, 'hanging_war_map_tapestry', hall.ix1 - 0.04, 5.2, -9, [-1, 0, 0], 2.4);
  // the barracks: cots down the north wall, a table, their kit
  const bk = room.barracks;
  for (let x = -240; x > -260; x -= 3) props.add('bed', x, 0, bk.iz0 + 1.3, 0);
  props.add('table', -250, 0, -17.5, 0); props.add('stool', -251.5, 0, -17.5); props.add('stool', -248.5, 0, -17.5);
  props.add('crate', -237, 0, -15); props.add('crate', -237, 0, -16.2); props.add('barrel', -258.8, 0, -15);
  S('castle_keep_weapon_chest', -244, -15, 1, Math.PI); S('castle_keep_shield_rack', -254, bk.iz1 - 0.4, 1.1, Math.PI);
  // the chapel of Velscour: an altar under his sigil, pews before it, candles and the skulls of the unworthy
  const ch = room.chapel;
  props.add('altar', ch.ix0 + 1.6, 0, -19.5, Math.PI / 2);
  props.add('candelabrum', ch.ix0 + 1.4, 0, -22.5); props.add('candelabrum', ch.ix0 + 1.4, 0, -16.5);
  for (let x = ch.ix0 + 4.5; x < ch.ix1 - 2; x += 1.8) for (const z of [-21.6, -17.4]) props.add('pew', x, 0, z, -Math.PI / 2, 0.8);
  S('catacombs_skull_pyramid', ch.ix0 + 1.2, -24, 1); S('catacombs_skull_pyramid', ch.ix0 + 1.2, -15, 1);
  S('catacombs_vigil_candles', ch.ix0 + 2.8, -19.5, 1);
  sigil(ctx, ch.ix0 + 0.06, 4.4, -19.5, [1, 0, 0], 3.2, 1.3);
  // the armoury: racks, chests and armour on stands
  const ar = room.armoury;
  for (let x = -240; x > -260; x -= 5) S('castle_keep_shield_rack', x, ar.iz1 - 0.4, 1.1, Math.PI);
  for (const x of [-242, -252]) S('castle_keep_weapon_chest', x, 16.2, 1, 0);
  for (const x of [-238, -247, -256]) S('castle_keep_empty_suit_of_armor', x, 19.5, 1, Math.PI / 2);
  props.add('anvil', -258, 0, 17); props.add('barrel', -236.5, 0, 23.5); props.add('barrel', -237.6, 0, 23.8);
  S('castle_keep_armory_barrel', -236.8, 15.5, 1);
  // the reliquary: the honoured dead of the Vigil in their tombs
  const rl = room.reliquary;
  for (const z of [16.8, 22.2]) for (let x = rl.ix0 + 2.5; x < rl.ix1 - 2; x += 3.4) props.add('sarcophagus', x, 0, z, Math.PI / 2);
  props.add('candelabrum', rl.ix0 + 1.2, 0, 19.5); props.add('bookshelf', rl.ix0 + 0.35, 0, 15.5, Math.PI / 2);
  S('catacombs_chain_and_shackle', rl.ix1 - 1.2, rl.iz1 - 1, 1);
  // the Red Throne: a dais at the far end under Velscour's great burning sigil, the throne, the
  // chest before it, red braziers either side, his banners down the walls
  const th = room.throne;
  b.box([DAIS.x0, 0, DAIS.z0], [DAIS.x1, DAIS.h, DAIS.z1], { top: M('castle_keep_ivory_chapel_marble', 2), bottom: slate, side: slate });
  b.box([DAIS.x1, 0, DAIS.z0 + 1], [DAIS.x1 + 0.5, DAIS.h / 2, DAIS.z1 - 1], { top: slate, bottom: slate, side: slate });   // a step up
  S('castle_keep_broken_throne', th.ix0 + 1.6, 0, 1.4, Math.PI / 2, DAIS.h);
  props.add('treasure_chest', CHEST.x, DAIS.h, CHEST.z, Math.PI / 2, 1.15);
  sigil(ctx, th.ix0 + 0.06, 4.6, 0, [1, 0, 0], 4.6, 1.8);
  for (const s of [-1, 1]) {
    S('sand_scatter_25_bronze_brazier', DAIS.x1 + 0.2, s * 7.4, 1.3, 0);
    for (const x of [-265, -270]) wallPanel(lib, scene, vb(), x, 5.2, s * (th.iz1 - 0.04), [0, 0, -s], 3.8);
    props.add('candelabrum', DAIS.x1 - 0.6, DAIS.h, s * 5.2);
  }

  const keep = new Keep(ctx, room);
  ctx.keep = keep;
  return keep;
}

/** Velscour's sigil on a wall, burning red (it blooms): centre (x, y, z), facing `normal`. */
function sigil(ctx, x, y, z, normal, size, glow) {
  const tex = new THREE.TextureLoader().load(SIGIL);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color(glow, glow * 0.75, glow * 0.7) }));
  m.position.set(x, y, z);
  m.lookAt(x + normal[0], y + normal[1], z + normal[2]);
  ctx.scene.add(m);
  return m;
}

// ====================================================================== the keep at run time
const G = 1;   // the flow field's cells (metres)

class Keep {
  constructor(ctx, room) {
    this.ctx = ctx;
    this.room = room;
    this.rooms = ROOMS;
    this.chest = null;
    this.sealed = true;
    this.walls = KEEP;
    this.road = [];   // (for the map)
    for (let x = ROAD.x0; x >= ROAD.x1; x -= 4) this.road.push([x, roadZ(x)]);
    // the flow field over the walls' grid (built the first time you come near: the furniture's
    // colliders arrive with the props)
    this.nx = Math.ceil((KEEP.x1 + 6 - (KEEP.x0 - 2)) / G); this.nz = Math.ceil((KEEP.z1 + 2 - (KEEP.z0 - 2)) / G);
    this.gx0 = KEEP.x0 - 2; this.gz0 = KEEP.z0 - 2;
    this.walk = null; this.flow = null; this.flowKey = -1; this.flowT = 0;
    // where the Sworn stand (their adepts in the chapel, the hall, the reliquary and the yard):
    // [variant, x, z, {room | area | patrol, yaw}] (a room by its walls' inner faces)
    const R = Object.fromEntries(Object.entries(room).map(([k, r]) => [k, { x0: r.ix0, x1: r.ix1, z0: r.iz0, z1: r.iz1, id: k }]));
    this.posts = [
      // at the gate, either side of the road
      ['sworn_m', KEEP.x1 + 7.5, -5, { area: { x: KEEP.x1 + 7.5, z: -5, r: 1 }, yaw: Math.PI / 2 }],
      ['sworn_f', KEEP.x1 + 7.5, 5, { area: { x: KEEP.x1 + 7.5, z: 5, r: 1 }, yaw: Math.PI / 2 }],
      // on their rounds of the courtyard
      ['sworn_m', -204, -20, { patrol: [[-204, -20], [-228, -26], [-228, 26], [-204, 20]] }],
      ['sworn_m', -226, 24, { patrol: [[-226, 24], [-204, 28], [-204, -28], [-226, -24]] }],
      ['sworn_adept_f', -212, 18, { area: { x: -212, z: 20, r: 4 } }],
      ['sworn_m', -230, -4, { area: { x: -230, z: 0, r: 2 }, yaw: Math.PI / 2 }],
      // the hall
      ['sworn_m', -242, 3, { room: R.hall }], ['sworn_adept_m', -250, -3, { room: R.hall }], ['sworn_m', -256, 4, { room: R.hall }],
      // the barracks, the armoury, the chapel, the reliquary
      ['sworn_m', -244, -19, { room: R.barracks }], ['sworn_f', -254, -21, { room: R.barracks }],
      ['sworn_m', -244, 19, { room: R.armoury }], ['sworn_m', -253, 21, { room: R.armoury }],
      ['sworn_adept_f', -266, -19.5, { room: R.chapel, yaw: -Math.PI / 2 }], ['sworn_adept_m', -270, -22, { room: R.chapel, yaw: -Math.PI / 2 }],
      ['sworn_adept_m', -268, 19.5, { room: R.reliquary }],
    ];
    // the throne room: its lord before the chest, and his two guards (they keep the room)
    this.lord = ['sworn_lord', DAIS.x1 + 3.2, 0, { keeps: R.throne, yaw: Math.PI / 2 }];
    this.guards = [['sworn_m', DAIS.x1 + 4.4, -4.2, { keeps: R.throne, yaw: Math.PI / 2 }], ['sworn_m', DAIS.x1 + 4.4, 4.2, { keeps: R.throne, yaw: Math.PI / 2 }]];
    this.glow = this.makeGlow();
  }

  /** Where p is, by name, when out of doors here (the rooms are zones). */
  place(p) {
    if (p.x > KEEP.x0 - 6 && p.x < KEEP.x1 + 8 && Math.abs(p.z) < KEEP.z1 + 6) return 'Blackvigil Keep';
    if (p.x < ROAD.x0 + 2 && p.x > ROAD.x1 && Math.abs(p.z - roadZ(p.x)) < 7) return 'The Vigil Road';
    return null;
  }

  /** Which room p is in ('yard' in the courtyard, null outside the walls). */
  regionOf(p) {
    for (const r of ROOMS) if (p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1) return r.id;
    if (p.x > KEEP.x0 && p.x < KEEP.x1 + 6 && p.z > KEEP.z0 && p.z < KEEP.z1) return 'yard';
    return null;
  }

  /** Could someone at a see someone at b: the same room, or rooms a doorway joins (the yard
   * and what's outside the gate count as one). */
  sees(a, b) {
    const ra = this.regionOf(a) || 'yard', rb = this.regionOf(b) || 'yard';
    return ra === rb || LINKS.some(([p, q]) => (p === ra && q === rb) || (p === rb && q === ra));
  }

  /** In room r (a margin inside its walls). */
  inside(r, p, pad = 0.3) { return p.x > r.x0 + pad && p.x < r.x1 - pad && p.z > r.z0 + pad && p.z < r.z1 - pad; }

  // -------------------------------------------------------------- the flow field
  buildNav() {
    const phys = this.ctx.physics, N = this.nx * this.nz;
    this.walk = new Uint8Array(N);
    for (let k = 0; k < this.nz; k++) for (let i = 0; i < this.nx; i++) {
      const x = this.gx0 + (i + 0.5) * G, z = this.gz0 + (k + 0.5) * G, m = 0.3;
      let open = true;
      for (const bx of phys.near(x - m, z - m, x + m, z + m)) {
        if (bx.max[1] < 0.5 || bx.min[1] > 1.7) continue;
        if (x + m > bx.min[0] && x - m < bx.max[0] && z + m > bx.min[2] && z - m < bx.max[2]) { open = false; break; }
      }
      this.walk[k * this.nx + i] = open ? 1 : 0;
    }
  }

  cellOf(p) {
    const i = Math.floor((p.x - this.gx0) / G), k = Math.floor((p.z - this.gz0) / G);
    return i < 0 || k < 0 || i >= this.nx || k >= this.nz ? -1 : k * this.nx + i;
  }

  flowUpdate(player, dt) {
    this.flowT -= dt;
    const c = this.cellOf(player.pos);
    if (c < 0 || player.pos.y > 4) { this.flow = null; this.flowKey = -1; return; }
    if (!this.walk) this.buildNav();
    if (c === this.flowKey && this.flowT > 0) return;
    this.flowKey = c; this.flowT = 0.5;
    const N = this.nx * this.nz;
    const dist = this.flow || new Int16Array(N), q = this.queue || (this.queue = new Int32Array(N));
    dist.fill(-1);
    let h = 0, t = 0;
    dist[c] = 0; q[t++] = c;
    while (h < t) {
      const a = q[h++], d = dist[a], i = a % this.nx, k = (a - i) / this.nx;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nk = k + dk;
        if (ni < 0 || nk < 0 || ni >= this.nx || nk >= this.nz) continue;
        const n = nk * this.nx + ni;
        if (dist[n] >= 0 || !this.walk[n]) continue;
        dist[n] = d + 1; q[t++] = n;
      }
    }
    this.flow = dist;
  }

  /** The way toward you through the keep from p, into out; false if there's none. */
  flowDir(p, out) {
    if (!this.flow) return false;
    const i0 = Math.floor((p.x - this.gx0) / G), k0 = Math.floor((p.z - this.gz0) / G);
    const at = (a, b) => (a < 0 || b < 0 || a >= this.nx || b >= this.nz ? -1 : this.flow[b * this.nx + a]);
    const here = at(i0, k0);
    let best = here < 0 ? Infinity : here, bi = i0, bk = k0;
    for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) {
      if (!di && !dk) continue;
      if (di && dk && here >= 0 && (at(i0 + di, k0) < 0 || at(i0, k0 + dk) < 0)) continue;   // no cutting corners
      const d = at(i0 + di, k0 + dk);
      if (d >= 0 && d < best) { best = d; bi = i0 + di; bk = k0 + dk; }
    }
    if (bi === i0 && bk === k0) return false;
    out.set(this.gx0 + (bi + 0.5) * G - p.x, 0, this.gz0 + (bk + 0.5) * G - p.z).normalize();
    return true;
  }

  // -------------------------------------------------------------- the sealed chest
  /** Take the throne room's chest from the loot's containers: sealed, and holding the Vigil's best. */
  claimChest(loot) {
    const c = loot.containers.find((q) => q.id === 'treasure_chest' && Math.abs(q.x - CHEST.x) < 0.2 && Math.abs(q.z - CHEST.z) < 0.2);
    if (!c) return;
    this.chest = c;
    c.holds = { ...c.holds, name: 'Vigil Hoard' };
    c.sealed = "Ser Malgrave's oath seals the chest";
    c.contents = () => hoard();
  }

  /** The lord is dead: the seal breaks, the glow turns from blood to gold. */
  unseal() {
    if (!this.sealed) return;
    this.sealed = false;
    if (this.chest) this.chest.sealed = null;
    const g = this.ctx.foes?.zombies?.gore, p = new THREE.Vector3(CHEST.x, DAIS.h + 0.6, CHEST.z);
    if (g) {
      const c = [new THREE.Color(1, 0.25, 0.1), new THREE.Color(1, 0.8, 0.3), new THREE.Color(1, 0.95, 0.7)];
      for (let i = 0; i < 90; i++) g.drop(p, new THREE.Vector3(Math.random() - 0.5, Math.random() * 1.2, Math.random() - 0.5).multiplyScalar(6), 0.014 + Math.random() * 0.012, c[i % 3]);
    }
    this.glow.breakT = 0;
  }

  /** The chest's glow: a halo, a ring of runes on the dais (while sealed) and motes rising. */
  makeGlow() {
    const scene = this.ctx.scene, y = DAIS.h + 0.02;
    const S = 64, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g2 = cv.getContext('2d'), gr = g2.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = gr; g2.fillRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(cv);
    const add = { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false };
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xff3018, opacity: 0.8, ...add }));
    halo.position.set(CHEST.x, y + 0.55, CHEST.z); halo.scale.setScalar(2.6);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, color: 0xff3018, opacity: 0.7, ...add }));
    pool.position.set(CHEST.x, y + 0.01, CHEST.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.35, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2410, opacity: 0.85, side: THREE.DoubleSide, ...add }));
    ring.position.set(CHEST.x, y + 0.02, CHEST.z);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, 5, 16, 1, true).translate(0, 2.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xffc860, opacity: 0, side: THREE.DoubleSide, ...add }));
    beam.position.set(CHEST.x, y, CHEST.z);
    scene.add(halo, pool, ring, beam);
    return { halo, pool, ring, beam, breakT: -1, mote: 0 };
  }

  update(dt, t, player) {
    this.flowUpdate(player, dt);
    const gl = this.glow;
    if (Math.abs(player.pos.x - CHEST.x) > 90) return;    // (only the glow from here on)
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.4);
    const gold = this.sealed ? 0 : Math.min(1, (gl.breakT += dt) / 1.5);
    gl.halo.material.color.setRGB(1, 0.19 + 0.6 * gold, 0.09 + 0.25 * gold);
    gl.pool.material.color.copy(gl.halo.material.color);
    gl.halo.material.opacity = 0.65 * pulse + 0.2;
    gl.pool.material.opacity = 0.5 * pulse + 0.2;
    gl.ring.rotation.y += dt * 0.4;
    gl.ring.material.opacity = this.sealed ? 0.55 + 0.35 * pulse : Math.max(0, 0.9 - gold * 1.5);
    gl.ring.scale.setScalar(this.sealed ? 1 : 1 + gold * 1.5);
    gl.beam.material.opacity = this.chest?.searched ? Math.max(0, gl.beam.material.opacity - dt * 0.3) : 0.16 * gold * pulse;
    const g = this.ctx.foes?.zombies?.gore;
    if (g && (gl.mote -= dt) <= 0 && !this.chest?.searched) {
      gl.mote = 0.08;
      const a = Math.random() * 6.28, r = 0.4 + Math.random() * 0.8;
      g.drop(new THREE.Vector3(CHEST.x + Math.cos(a) * r, DAIS.h + 0.1, CHEST.z + Math.sin(a) * r), new THREE.Vector3(0, 3 + Math.random() * 1.5, 0), 0.01,
        this.sealed ? new THREE.Color(1, 0.2, 0.08) : new THREE.Color(1, 0.85, 0.4));
    }
  }
}

/** What the Vigil kept behind its lord: a legendary or mythic weapon, a shield, two pieces of
 * armour and a ring of the better sort, a heap of gold and draughts. */
function hoard() {
  const ilvl = 18 + Math.floor(Math.random() * 4);
  const r = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  return [
    makeGear({ ilvl, rarity: Math.random() < 0.35 ? 5 : 4, slot: 'weapon', kind: Math.random() < 0.5 ? 'twohand' : 'onehand' }),
    makeGear({ ilvl, rarity: r(3, 4), slot: 'offhand', kind: 'shield_kite' }),
    makeGear({ ilvl, rarity: r(3, 4), slot: ['head', 'body', 'legs', 'hands', 'feet'][r(0, 4)] }),
    makeGear({ ilvl, rarity: r(3, 4), slot: ['head', 'body', 'legs', 'hands', 'feet'][r(0, 4)] }),
    makeGear({ ilvl, rarity: r(3, 5), slot: 'ring' }),
    { type: 'gold', amount: r(320, 520) },
    makePotion('life', 1), makePotion('mana', 1),
  ];
}
