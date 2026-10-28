// The overworld: a large village in a forest clearing, ten buildings you can walk into, the
// cathedral at the north end of the village (its back office holds the stairs down to the
// dungeon), a walled graveyard beyond it, and a forest ringing everything.
// Metres; x east, z south (north is -z); the outdoor ground is y = 0.
import * as THREE from 'three';
import { wallPanel } from './sprites.js';
import { detailedHouse, houseMaterials, lampPost, marketStall, fence, cart, gothicDetail, belfry } from './buildings.js';

export const VILLAGE_R = 100;   // the village clearing
export const WORLD_R = 300;     // the forest goes on to here; the player stays inside
export const CATHEDRAL = { x0: -12, x1: 12, z0: -98, z1: -52, floor: 0.6 };
export const GRAVEYARD = { x0: -48, x1: 48, z0: -182, z1: -122 };
export const STAIRS = { x: -6.5, z: -91.0 }; // top of the stairs in the cathedral office
// graveyard-pack sprites that belong inside the church
const CHURCH = /pipe_organ|confessional|baptismal_font|oak_pew|prayer_lectern|cathedral_altar|iron_candelabrum|votive_candles|resting_censer|church_bell|saint_statue|reliquary_chest/;

function rng(seed) { // mulberry32: the same world every time
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function buildWorld(ctx) {
  const { lib, b, props, bill, scene, physics } = ctx;
  const R = rng(1471);
  ctx.zones = []; // roofed interiors: {x0, z0, x1, z1, y0, y1, name}
  const M = (id, tile = 3, o = {}) => lib.material(id, { tile, ...o });
  physics.groundHoles.push([CATHEDRAL.x0, CATHEDRAL.z0, CATHEDRAL.x1, CATHEDRAL.z1]);

  // ------------------------------------------------------------ ground
  // one blended material for all of it (see Library.ground): meadow in the village, forest
  // floor beyond, grave soil in the graveyard
  const ground = lib.ground({ village: VILLAGE_R, yard: [GRAVEYARD.x0, GRAVEYARD.z0, GRAVEYARD.x1, GRAVEYARD.z1], layers: [
    ['town_dense_meadow', 3], ['town_olive_meadow', 3.4], ['town_wildflower_grass', 2.6],
    ['dark_forest_pine_needles', 3], ['dark_forest_damp_moss', 3.2], ['dark_forest_dead_leaves', 2.8],
    ['cathedral_graveyard_dead_grass', 3], ['cathedral_graveyard_grave_soil', 2.6]] });
  ground.userData.noCast = true;
  ground.userData.chunk = 96;
  const CELL = 12;
  for (let x = -WORLD_R - 36; x < WORLD_R + 36; x += CELL) {
    for (let z = -WORLD_R - 36; z < WORLD_R + 36; z += CELL) {
      const cx = x + CELL / 2, cz = z + CELL / 2;
      if (Math.hypot(cx, cz) > WORLD_R + 48) continue;
      // the cathedral stands on its own floor (and its stairwell must stay open): cut its
      // footprint out of the cells it overlaps
      const C = CATHEDRAL, x1 = x + CELL, z1 = z + CELL;
      const pieces = x1 <= C.x0 || x >= C.x1 || z1 <= C.z0 || z >= C.z1 ? [[x, z, x1, z1]] : [
        [x, z, Math.min(x1, C.x0), z1], [Math.max(x, C.x1), z, x1, z1],
        [Math.max(x, C.x0), z, Math.min(x1, C.x1), Math.min(z1, C.z0)], [Math.max(x, C.x0), Math.max(z, C.z1), Math.min(x1, C.x1), z1]];
      for (const [a0, b0, a1, b1] of pieces) {
        if (a1 - a0 < 0.01 || b1 - b0 < 0.01) continue;
        b.quad(ground, [a0, 0, b1], [a1, 0, b1], [a1, 0, b0], [a0, 0, b0], [[a0, -b1], [a1, -b1], [a1, -b0], [a0, -b0]]);
      }
    }
  }
  // roads and the plaza: overlay strips (drawn over the ground, see main.js polygon offset)
  const road = M('town_wheel_worn_gravel', 3, { overlay: true });
  const dirt = M('town_packed_dirt', 3, { overlay: true });
  const cobble = M('town_grey_cobbles', 2.5, { overlay: true });
  const paving = M('town_limestone_paving', 2.5, { overlay: true });
  const strip = (mat, x0, z0, x1, z1, y = 0.02) => b.quad(mat, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0],
    [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]]);
  strip(road, -4, -48, 4, VILLAGE_R + 20);            // north-south high street
  strip(road, -VILLAGE_R - 20, -4, VILLAGE_R + 20, 4); // east-west road
  strip(cobble, -20, -20, 20, 20, 0.03);               // the plaza
  strip(paving, -16, -52, 16, -40, 0.03);              // the cathedral forecourt
  strip(dirt, 14, -120, 20, -40, 0.02);                // lane to the graveyard
  strip(dirt, 14, -126, 20, -118, 0.02);
  for (const [x0, z0, x1, z1] of [[-60, 30, -48, 33], [44, 30, 58, 33], [-36, -32, -24, -4], [24, -32, 36, -4]])
    strip(dirt, x0, z0, x1, z1, 0.02);
  props.add('well', 0, 0.03, 0, 0, 1.2);

  // ------------------------------------------------------------ buildings
  const houses = [
    { name: 'inn', title: "The Tolling Bell Inn", x: 30, z: 18, w: 16, d: 11, h: 4.2, storeys: 2, timber: true, wall: 'town_wall_oak_plaster', upper: 'town_wall_wattle_daub', roof: 'town_roof_straw_thatch', floor: 'town_tavern_planks', door: 'w', chimney: [5, 0], sign: 0,
      furnish: [['table', -3, 1, 0], ['table', 2, -2, 0], ['table', 3, 2.5, 0], ['stool', -3, 2.2], ['stool', -3, -0.3], ['stool', 2, -0.8], ['stool', 3, 3.6], ['barrel', 6.5, -4], ['barrel', 6.5, -3], ['barrel', 6.5, 4], ['candelabrum', -6.5, -4], ['bed', 6, 1, Math.PI / 2]] },
    { name: 'blacksmith', title: "Hammerfall Smithy", x: -30, z: 18, w: 12, d: 10, h: 4.4, storeys: 1, wall: 'town_wall_fieldstone', roof: 'town_roof_blue_slate', floor: 'town_stable_yard', door: 'e', chimney: [-3, -2], sign: 1, forge: [-3, -2],
      furnish: [['anvil', 0, 0], ['barrel', -4.5, 3.5], ['crate', -4.2, 3.5 - 7], ['table', 3, -3, 0], ['candelabrum', 4.5, 3.5]] },
    { name: 'general store', title: "Grimwald's Provisions", x: 30, z: -18, w: 14, d: 10, h: 3.9, storeys: 2, wall: 'town_wall_pine_siding', upper: 'town_wall_oak_plaster', roof: 'town_roof_oak_shingles', floor: 'town_oak_boards', door: 'w', sign: 2,
      furnish: [['crate', 4, -3], ['crate', 4, -1.9], ['crate', 5.2, -3], ['barrel', 5.5, 3.2], ['barrel', 4.5, 3.6], ['table', -2, 0, Math.PI / 2], ['bookshelf', 0, -4.6, 0], ['treasure_chest', 1, 3.8, Math.PI]] },
    { name: 'alchemist', title: "The Alchemist's Shop", x: -30, z: -18, w: 11, d: 9, h: 3.8, storeys: 2, timber: true, wall: 'town_wall_wattle_daub', upper: 'town_wall_oak_plaster', roof: 'town_roof_terracotta', floor: 'town_herringbone_brick', door: 'e', sign: 0, chimney: [-3, 2],
      furnish: [['bookshelf', -2, -4.1, 0], ['bookshelf', 1, -4.1, 0], ['table', 0, 1, 0], ['candelabrum', -4, 3], ['barrel', 4, -3]] },
    { name: 'town hall', title: "Bellmourn Town Hall", x: 0, z: 42, w: 20, d: 13, h: 5.0, storeys: 2, wall: 'town_wall_dressed_limestone', upper: 'town_wall_oak_plaster', roof: 'town_roof_blue_slate', floor: 'castle_keep_royal_inlay_slab', door: 'n', dormers: 3,
      furnish: [['table', 0, 1, 0], ['table', 0, 3, 0], ['pew', -4, -2, Math.PI], ['pew', 4, -2, Math.PI], ['candelabrum', -8.5, -5], ['candelabrum', 8.5, -5], ['bookshelf', -6, 5.6, Math.PI], ['bookshelf', 6, 5.6, Math.PI], ['treasure_chest', 0, 5.5, Math.PI]] },
    { name: 'barracks', title: "The Watch Barracks", x: 52, z: 44, w: 16, d: 10, h: 3.9, storeys: 2, wall: 'town_wall_town_brick', upper: 'town_wall_wattle_daub', roof: 'castle_roof_black', floor: 'town_dark_pine', door: 'n', chimney: [6, 2],
      furnish: [['bed', -5, 2], ['bed', -2.5, 2], ['bed', 0, 2], ['bed', 2.5, 2], ['table', 4.5, -2, 0], ['stool', 4.5, -0.8], ['crate', -6.5, -3.8], ['treasure_chest', 6.5, 3.8, -Math.PI / 2]] },
    { name: 'stable', title: "The Stables", x: 58, z: -6, w: 12, d: 14, h: 4.4, storeys: 1, timber: true, wall: 'town_wall_pine_siding', roof: 'town_roof_straw_thatch', floor: 'town_stable_yard', door: 'w', openFront: true,
      furnish: [['barrel', 4, -5.5], ['crate', 4, 5.5], ['crate', 3, 5.5], ['table', -2, 5, 0]] },
    { name: 'bakery', title: "The Bakehouse", x: -58, z: -8, w: 12, d: 10, h: 3.8, storeys: 2, wall: 'town_wall_town_brick', upper: 'town_wall_oak_plaster', roof: 'town_roof_terracotta', floor: 'town_herringbone_brick', door: 'e', chimney: [-3, 2], sign: 1,
      furnish: [['table', 1, 0, Math.PI / 2], ['barrel', -4, -3.5], ['barrel', -4, 3.5], ['crate', -3, 3.6], ['stool', 2, 1.5]] },
    { name: 'healer', title: "House of Mending", x: 44, z: -48, w: 12, d: 9, h: 3.8, storeys: 2, timber: true, wall: 'town_wall_oak_plaster', upper: 'town_wall_wattle_daub', roof: 'town_roof_oak_shingles', floor: 'town_oak_boards', door: 'w', sign: 2,
      furnish: [['bed', 3, -2, Math.PI / 2], ['bed', 3, 2, Math.PI / 2], ['bookshelf', -1, -3.6, 0], ['table', -2.5, 1.5, 0], ['candelabrum', 5, 0]] },
  ];
  const hm = houseMaterials(lib, M);
  ctx.glass = hm.glass;
  ctx.lantern = hm.lantern;
  b.flowers = [];
  for (const h of houses) {
    detailedHouse(ctx, h, M, { ...hm, ...hm.perHouse() });
    if (h.forge) forge(ctx, M, h.x + h.forge[0], h.z + h.forge[1]);
  }
  for (const [x, y, z] of b.flowers) bill.add('town_scatter_26_wildflowers', x, y, z, 0.32);
  villageDetail(ctx, M, hm, houses);
  mageTower(ctx, -56, 44, M);
  cathedral(ctx, M);
  graveyard(ctx, M, R);
  groundPatches(ctx, M, R, houses);

  // fences of trees inside the village and the forest beyond
  forestRing(ctx, R, houses);
  return { houses };
}

/** The ground's wear and tear, in the village's other floors: a paved or gravelled yard before
 * every door, worn grass, mud and rutted earth about the streets, lime-floored work yards,
 * paths through the graveyard and trodden clearings in the forest. */
function groundPatches(ctx, M, R, houses) {
  const { b, lib } = ctx;
  const take = (re, salt) => lib.take((s) => re.test(s.id), salt);
  // an irregular blob of ground: a fan of triangles round (x, z) with a ragged edge
  const blob = (id, x, z, r, y = 0.022, n = 10) => {
    const m = M(id, 2.5, { overlay: true });
    const pts = Array.from({ length: n }, (_, k) => {
      const a = k / n * Math.PI * 2, rr = r * (0.7 + 0.3 * R());
      return [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr];
    });
    const pos = [[x, y, z], ...pts], uv = pos.map((p) => [p[0], -p[2]]);
    b.mesh(m, pos, uv, pts.map((_, k) => [0, 1 + ((k + 1) % n), 1 + k]));
  };
  const yard = /^town_(irregular_flagstone|slate_paving|brick_street|granite_setts|moss_pavers|fine_gravel|coarse_gravel|limestone_gravel|pebble_gravel)$/;
  houses.forEach((h, i) => { // the yard in front of each door
    const out = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[h.door];
    const cx = h.x + out[0] * (h.w / 2 + 2.2), cz = h.z + out[1] * (h.d / 2 + 2.2);
    const hw = out[0] ? 1.8 : 3, hd = out[0] ? 3 : 1.8;
    const m = M(take(yard, i), 2, { overlay: true });
    b.quad(m, [cx - hw, 0.025, cz + hd], [cx + hw, 0.025, cz + hd], [cx + hw, 0.025, cz - hd], [cx - hw, 0.025, cz - hd],
      [[cx - hw, -(cz + hd)], [cx + hw, -(cz + hd)], [cx + hw, -(cz - hd)], [cx - hw, -(cz - hd)]]);
  });
  const grass = /^town_(dry_grass|sparse_grass|rough_field|moss_cover|trampled_verge|leaf_litter_grass|damp_grass|straw_grass|clover_grass)$/;
  const earth = /^town_(damp_mud|cracked_clay|cart_rut_earth|red_earth|dusty_earth|mud_puddles|churned_clay|sandy_earth|twig_earth|dark_grit|muddy_gravel|dusty_gravel)$/;
  const lime = /^town_(rough_concrete|dark_concrete|cracked_concrete|damp_concrete|patched_concrete|aggregate_concrete)$/;
  const clear = (x, z) => !houses.some((h) => Math.abs(x - h.x) < h.w / 2 + 4 && Math.abs(z - h.z) < h.d / 2 + 4) && Math.hypot(x, z) > 24
    && !(x > -16 && x < 16 && z < -38 && z > -100) && Math.abs(x) > 7 && Math.abs(z) > 7 && Math.hypot(x + 56, z - 44) > 22;
  const placeAll = (re, n, rMin, rMax, size) => {
    for (let i = 0, tries = 0; i < n && tries < 400; tries++) {
      const a = R() * Math.PI * 2, r = rMin + R() * (rMax - rMin), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!clear(x, z)) continue;
      blob(take(re, i), x, z, size * (0.7 + R() * 0.6));
      i++;
    }
  };
  placeAll(grass, 18, 26, 95, 6);
  placeAll(earth, 14, 22, 90, 3.5);
  // work yards behind the smithy, the bakery, the stable and the barracks
  [[-40, 14], [-68, -4], [68, -2], [62, 52], [-40, 22], [70, -16]].forEach(([x, z], i) => blob(take(lime, i), x, z, 3.2, 0.024, 8));
  // paths in the graveyard: from the gate to the mausoleum, and round it
  const G = GRAVEYARD;
  const gy = /^cathedral_graveyard_(muddy_path|grave_gravel|moss_cobbles|nave_flagstone|limestone_squares|choir_slate|terracotta_nave)$/;
  const pathMat = M(take(gy, 0), 2.2, { overlay: true });
  b.quad(pathMat, [15.5, 0.025, G.z1], [18.5, 0.025, G.z1], [18.5, 0.025, G.z0 + 22], [15.5, 0.025, G.z0 + 22], [[15.5, -G.z1], [18.5, -G.z1], [18.5, -G.z0 - 22], [15.5, -G.z0 - 22]]);
  const ring = M(take(gy, 1), 2, { overlay: true });
  b.quad(ring, [-8, 0.026, G.z0 + 20], [18.5, 0.026, G.z0 + 20], [18.5, 0.026, G.z0 + 17], [-8, 0.026, G.z0 + 17], [[-8, -G.z0 - 20], [18.5, -G.z0 - 20], [18.5, -G.z0 - 17], [-8, -G.z0 - 17]]);
  for (let i = 0; i < 5; i++) blob(take(gy, i + 2), G.x0 + 8 + i * 18, G.z0 + 30 + (i % 2) * 14, 2.4, 0.024, 8);
  // trodden clearings and paths out in the forest
  const wood = /^dark_forest_(black_loam|gravel_path|packed_mud|dark_turf|peat|shale_chips|root_soil|pine_needles|damp_moss|dead_leaves)$/;
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + 0.3, r = 140 + (i % 3) * 45;
    blob(take(wood, i), Math.cos(a) * r, Math.sin(a) * r, 7 + (i % 3) * 2, 0.022, 12);
  }
}

/** The smith's forge: a stone hearth of glowing coals under a hood that rises into the chimney. */
function forge(ctx, M, x, z) {
  const { b, lib } = ctx;
  const brick = M('castle_keep_crimson_armory_brick', 1.5);
  b.box([x - 0.9, 0.4, z - 0.7], [x + 0.9, 1.2, z + 0.7], brick);
  const coals = new THREE.MeshBasicMaterial({ map: lib.texture(lib.surf.get('sand_volcanic_black_sand').file), color: new THREE.Color(4, 1.5, 0.45) });
  coals.userData = { tileU: 0.8, tileV: 0.8, noCast: true };
  lib.used.add('sand_volcanic_black_sand');
  b.box([x - 0.7, 1.2, z - 0.5], [x + 0.7, 1.26, z + 0.5], coals, { solid: false });
  b.cone(x, z, 1.05, 2.4, 1.6, 4, M('met_03_flaked_iron', 1));
  b.box([x - 0.35, 3.9, z - 0.35], [x + 0.35, 4.4, z + 0.35], M('met_03_flaked_iron', 1), { solid: false });
  ctx.flames.push([x - 0.3, 1.3, z, 0.42], [x + 0.3, 1.3, z + 0.1, 0.36]);
}

/** Street furniture and clutter: lamp posts along the roads, market stalls round the well,
 * benches, carts, hay, fenced garden plots, and the village's odds and ends by every house. */
function villageDetail(ctx, M, hm, houses) {
  const { b, bill } = ctx;
  const inHouse = (x, z, pad = 2) => houses.some((h) => Math.abs(x - h.x) < h.w / 2 + pad && Math.abs(z - h.z) < h.d / 2 + pad);
  // lamp posts down both sides of the two roads
  for (let z = -40; z <= 96; z += 17) {
    if (Math.abs(z) < 23) continue;
    for (const s of [-1, 1]) if (!inHouse(s * 5.4, z)) lampPost(ctx, s * 5.4, z, [-s, 0], hm);
  }
  for (let x = 25; x <= 96; x += 17) for (const sx of [-1, 1]) for (const s of [-1, 1]) {
    if (!inHouse(sx * x, s * 5.4)) lampPost(ctx, sx * x, s * 5.4, [0, -s], hm);
  }
  for (const [x, z] of [[-15, -38], [15, -38], [-15, -54], [15, -54]]) lampPost(ctx, x, z, [x < 0 ? 1 : -1, 0], hm);
  // market stalls round the well, facing it
  const cloths = ['cloth_01_coarse_sail_canvas', 'cloth_05_deep_plum_woven_sail', 'cloth_04_aged_cream_linen', 'cloth_03_patched_dark_canvas'];
  [[11, 11, 3], [-11, 11, 1], [11, -11, 3], [-11, -11, 1]].forEach(([x, z, r], i) => {
    marketStall(ctx, x, z, r, M(cloths[i], 1.6, { side: THREE.DoubleSide }), hm);
  });
  // benches and planters round the plaza
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) / 8 * Math.PI * 2;
    bill.add('town_scatter_18_stone_bench', Math.cos(a) * 17.5, 0.03, Math.sin(a) * 17.5, 0.9);
  }
  cart(ctx, 20, -25, 0, hm);
  cart(ctx, 49, -15, 1, hm);
  cart(ctx, -20, 26, 2, hm);
  // hay bales by the stable
  const straw = M('town_roof_straw_thatch', 1.2);
  for (const [x, z] of [[66, -14], [66, -12.6], [66.6, -13.3]]) b.cylinder([x - 0.6, 0.62, z], [x + 0.6, 0.62, z], 0.6, 10, straw);
  ctx.physics.add([65.3, 0, -14.7], [67.3, 1.3, -11.9], 'prop');
  // fenced gardens behind the houses
  fence(ctx, [[40, 11], [48, 11], [48, 25], [40, 25]], hm);
  fence(ctx, [[-38, 11], [-46, 11], [-46, 25], [-38, 25]], hm);
  fence(ctx, [[-66, -15], [-72, -15], [-72, -1], [-66, -1]], hm);
  fence(ctx, [[52, -55], [58, -55], [58, -41], [52, -41]], hm);
  for (const [x0, z0, x1, z1] of [[40, 11, 48, 25], [-46, 11, -38, 25], [-72, -15, -66, -1], [52, -55, 58, -41]]) {
    const soil = M('town_rooty_dirt', 2, { overlay: true });
    b.quad(soil, [x0, 0.02, z1], [x1, 0.02, z1], [x1, 0.02, z0], [x0, 0.02, z0], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]]);
    for (let x = x0 + 1; x < x1 - 0.5; x += 1.4) for (let z = z0 + 1; z < z1 - 0.5; z += 2.2)
      bill.add(['town_scatter_23_leafy_shrub', 'town_scatter_26_wildflowers', 'town_scatter_31_vegetable_basket'][Math.abs(Math.round(x * 3 + z)) % 3 === 2 ? 0 : 1], x, 0.02, z, 0.5);
  }
  // the village's clutter: every town scatter sprite somewhere along the backs and sides of the houses
  const clutter = ctx.lib.sprites('scatter', (s) => s.id.startsWith('town_scatter'));
  clutter.forEach((s, i) => {
    const h = houses[i % houses.length], k = Math.floor(i / houses.length);
    const back = { s: [0, -1], n: [0, 1], e: [-1, 0], w: [1, 0] }[h.door];
    const side = [back[1], back[0]];
    const x = h.x + back[0] * (h.w / 2 + 1.6) + side[0] * (k - 2) * 2.6, z = h.z + back[1] * (h.d / 2 + 1.6) + side[1] * (k - 2) * 2.6;
    bill.add(s.id, x, 0, z, 0.9);
  });
}

/** The mage's walled garden of desert plants round the tower, laid with southern stone. */
function mageGarden(ctx, M, x, z) {
  const { b, bill, lib } = ctx;
  const G = 15;
  const wall = M('castle_keep_pale_keep_limestone', 2);
  b.wall(x - G, z - G, x + G, z - G, 0, 1.5, 0.5, wall, [{ at: G + 2.5, w: 3, y0: 0, y1: 1.5 }]);
  b.wall(x - G, z + G, x + G, z + G, 0, 1.5, 0.5, wall);
  b.wall(x - G, z - G, x - G, z + G, 0, 1.5, 0.5, wall);
  b.wall(x + G, z - G, x + G, z + G, 0, 1.5, 0.5, wall, [{ at: G - 4, w: 3, y0: 0, y1: 1.5 }]);
  for (const [px, pz] of [[x - G, z - G], [x + G, z - G], [x - G, z + G], [x + G, z + G]]) {
    b.box([px - 0.45, 0, pz - 0.45], [px + 0.45, 2.1, pz + 0.45], wall);
    b.cone(px, pz, 0.5, 2.1, 0.7, 4, M('castle_roof_copper', 1));
  }
  // paths of southern paving between beds of desert soils
  const paths = ['sand_mosaic_fragments', 'sand_shell_inlay_paving', 'sand_pale_limestone_paving', 'sand_worn_sandstone_flag', 'sand_sunbaked_block_paving'];
  const beds = [...lib.surf.values()].filter((s) => s.id.startsWith('sand_') && /dune|leeward|combed|mica|hardpan|oasis|dry_grass|root_loam|red_earth|ochre_loam|tent_packed|caravan_yard|silt/.test(s.id)).map((s) => s.id);
  const quad = (mat, x0, z0, x1, z1, y) => b.quad(mat, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]]);
  const n = 6, cell = (2 * G - 1) / n;
  let pi = 0, bi = 0;
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
    const x0 = x - G + 0.5 + i * cell, z0 = z - G + 0.5 + k * cell;
    if (Math.hypot(x0 + cell / 2 - x, z0 + cell / 2 - z) < 7) continue;
    const isPath = (i + k) % 2 === 0;
    quad(M(isPath ? paths[pi++ % paths.length] : beds[bi++ % beds.length], 2, { overlay: true }), x0, z0, x0 + cell, z0 + cell, isPath ? 0.035 : 0.025);
  }
  // palms, acacias, aloes and the rest of the southern sprites in the beds
  const plants = lib.sprites('tree', (s) => s.id.startsWith('sand_'));
  const stuff = lib.sprites('scatter', (s) => s.id.startsWith('sand_'));
  [...plants, ...stuff].forEach((s, i) => {
    const a = i * 2.399, r = 8 + (i * 37 % 60) / 60 * (G - 9.5);
    bill.add(s.id, x + Math.cos(a) * r, 0.03, z + Math.sin(a) * r, s.category === 'tree' ? 0.75 : 0.7);
  });
}

function mageTower(ctx, x, z, M) {
  const { b, props } = ctx;
  const r = 5.5, hgt = 15, n = 8;
  ctx.zones.push({ x0: x - r, z0: z - r, x1: x + r, z1: z + r, y0: -1, y1: hgt, name: "The Mage's Tower" });
  const stone = M('castle_mossy', 3), floor = M('castle_keep_ivory_chapel_marble', 2.5);
  b.box([x - r, 0, z - r], [x + r, 0.2, z + r], { top: floor, bottom: stone, side: stone });
  b.ring(x, z, r, 0.2, hgt, n, stone, { door: 6 });
  // the doorway's lintel over the open side
  const a0 = (6 / n) * Math.PI * 2, a1 = (7 / n) * Math.PI * 2;
  const p0 = [x + r * Math.cos(a0), z + r * Math.sin(a0)], p1 = [x + r * Math.cos(a1), z + r * Math.sin(a1)];
  b.box([Math.min(p0[0], p1[0]), 2.8, Math.min(p0[1], p1[1]) - 0.3], [Math.max(p0[0], p1[0]), hgt, Math.max(p0[1], p1[1]) + 0.3], stone);
  b.box([x - r, hgt - 0.2, z - r], [x + r, hgt, z + r], M('ship_10_black_walnut_rift_seam', 2), { shade: 0.6, solid: false });
  b.cone(x, z, r + 1, hgt, 9, n, M('castle_roof_violet', 2));
  for (const [id, a, d] of [['bookshelf', 0.4, 4.6], ['bookshelf', 1.2, 4.6], ['bookshelf', 2.0, 4.6], ['table', 0, 0], ['candelabrum', 3.0, 3.8], ['treasure_chest', 3.9, 4.2]]) {
    const px = x + d * Math.cos(a), pz = z + d * Math.sin(a);
    props.add(id, px, 0.2, pz, d ? Math.atan2(-Math.cos(a), -Math.sin(a)) : 0); // facing the middle
  }
  // arrow slits round the shaft and a lamp at the door
  const slits = ['hanging_plain_arrow_slit', 'hanging_iron_lattice_arrow_slit', 'hanging_keyhole_arrow_slit', 'hanging_double_arrow_slit'];
  for (let k = 0; k < n; k++) {
    if (k === 6) continue;
    const a = (k + 0.5) / n * Math.PI * 2, rr = r * Math.cos(Math.PI / n) + 0.03;
    for (const [y, i] of [[6, k], [11, k + 1]]) wallPanel(ctx.lib, ctx.scene, slits[i % 4], x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, [Math.cos(a), 0, Math.sin(a)], 1.6);
  }
  mageGarden(ctx, M, x, z);
}

/** The cathedral: nave and aisles separated by gothic pillars, pews facing a raised chancel
 * with the altar and pulpit, stained glass, a bell tower, and behind the chancel wall the
 * office where the stairs go down. */
function cathedral(ctx, M) {
  const { b, props, lib, scene, physics } = ctx;
  const C = CATHEDRAL, F = C.floor, H = 14;
  ctx.zones.push({ x0: C.x0, z0: C.z0, x1: C.x1, z1: C.z1, y0: -1, y1: H, name: 'Cathedral of the Mourning Bell' });
  const wallOut = M('castle_ashlar', 3), wallIn = M('castle_chapel', 3.5), roof = M('castle_roof_black', 2.5);
  const nave = M('cathedral_graveyard_marble_checker', 2), plinth = M('castle_slatestone', 2);
  const chancelFloor = M('castle_keep_royal_inlay_slab', 2.5), office = M('town_oak_parquet', 2);
  // the plinth (floor), leaving the stairwell open in the office
  const sw = { x0: STAIRS.x - 1.3, x1: STAIRS.x + 1.3, z0: C.z0 + 0.3, z1: STAIRS.z + 0.4 };
  b.box([C.x0, 0, C.z0 + 8], [C.x1, F, C.z1], { top: nave, side: plinth, bottom: plinth });
  b.box([C.x0, 0, C.z0], [sw.x0, F, C.z0 + 8], { top: office, side: plinth, bottom: plinth });
  b.box([sw.x1, 0, C.z0], [C.x1, F, C.z0 + 8], { top: office, side: plinth, bottom: plinth });
  b.box([sw.x0, 0, sw.z1], [sw.x1, F, C.z0 + 8], { top: office, side: plinth, bottom: plinth });
  // front steps up to the door
  for (let i = 0; i < 3; i++) b.box([-8, 0, C.z1 + i * 0.5], [8, F - i * 0.2, C.z1 + (i + 1) * 0.5], plinth);
  // outer walls: door in the south front, tall windows down both sides
  const win = (len) => Array.from({ length: Math.floor(len / 7) }, (_, i) => ({ at: (i + 0.5) * len / Math.floor(len / 7), w: 1.6, y0: F + 3.5, y1: F + 9.5 }));
  const t = 0.8;
  b.wall(C.x0, C.z1, C.x1, C.z1, F, H, t, wallOut, [{ at: 12, w: 3.2, y0: F, y1: F + 5.2 }]);
  b.wall(C.x0, C.z0, C.x1, C.z0, F, H, t, wallOut);
  b.wall(C.x0, C.z0, C.x0, C.z1, F, H, t, wallOut, win(C.z1 - C.z0).filter((o) => o.at > 9));
  b.wall(C.x1, C.z0, C.x1, C.z1, F, H, t, wallOut, win(C.z1 - C.z0).filter((o) => o.at > 9));
  // inner lining (the carved chapel stone) on the long walls
  b.box([C.x0 + t / 2, F, C.z0 + 8.4], [C.x0 + t / 2 + 0.05, F + 3.4, C.z1 - 0.5], wallIn, { solid: false, shade: 0.85 });
  b.box([C.x1 - t / 2 - 0.05, F, C.z0 + 8.4], [C.x1 - t / 2, F + 3.4, C.z1 - 0.5], wallIn, { solid: false, shade: 0.85 });
  b.gable(C.x0, C.z0, C.x1, C.z1, H, 9, roof, wallOut, 'z', 0.8, 1);
  // pillars and the arcade beams they carry (the props are 4 m tall: scaled to 9 m)
  const arcade = M('castle_ashlar', 3);
  for (const x of [-6, 6]) {
    for (let z = C.z1 - 6; z > C.z0 + 12; z -= 5) props.add('pillar_gothic', x, F, z, 0, 2.25);
    b.box([x - 0.5, F + 9, C.z0 + 9], [x + 0.5, F + 10.2, C.z1 - 1], arcade, { solid: false, shade: 0.8 });
  }
  // chancel: raised platform, altar, pulpit, candles; the wall behind it with the office door
  const chZ0 = C.z0 + 8, chZ1 = C.z0 + 15;
  b.box([C.x0 + 0.4, F, chZ0], [C.x1 - 0.4, F + 0.6, chZ1], { top: chancelFloor, side: plinth, bottom: plinth });
  b.box([-4, F, chZ1], [4, F + 0.3, chZ1 + 0.5], plinth);
  props.add('altar', 0, F + 0.6, chZ0 + 3, 0);
  props.add('pulpit', -6.5, F + 0.6, chZ1 - 1.6, 0);
  props.add('candelabrum', -3, F + 0.6, chZ0 + 1.5); props.add('candelabrum', 3, F + 0.6, chZ0 + 1.5);
  props.add('candelabrum', -10, F, chZ1 + 2); props.add('candelabrum', 10, F, chZ1 + 2);
  b.wall(C.x0, chZ0, C.x1, chZ0, F, H - 2, 0.5, wallIn, [{ at: 12 + STAIRS.x, w: 1.8, y0: F + 0.6, y1: F + 3.2 }]);
  b.box([STAIRS.x - 1.2, F, chZ0 + 0.25], [STAIRS.x + 1.2, F + 0.6, chZ0 + 1.2], plinth); // step up to the door
  // the office: desk, books, a chest and the stairwell rail
  props.add('table', 4, F, C.z0 + 3, 0); props.add('stool', 4, F, C.z0 + 4.2);
  props.add('bookshelf', 8, F, C.z0 + 0.8, 0); props.add('bookshelf', 10.5, F, C.z0 + 0.8, 0);
  props.add('treasure_chest', 9.8, F, C.z0 + 6.5, -Math.PI / 2); props.add('candelabrum', 1, F, C.z0 + 1.2);
  const rail = M('ship_01_tarblack_oak', 1.5);
  b.box([sw.x0 - 0.15, F, sw.z0], [sw.x0, F + 1.0, sw.z1], rail);
  b.box([sw.x1, F, sw.z0], [sw.x1 + 0.15, F + 1.0, sw.z1], rail);
  b.box([C.x0, H - 2, C.z0 + 0.4], [C.x1, H - 1.8, chZ0], M('ship_10_black_walnut_rift_seam', 2), { shade: 0.5, solid: false });
  // the church furnishings from the graveyard pack, along the aisles and in the chancel
  const church = lib.sprites('scatter', (s) => s.id.startsWith('cathedral_graveyard_') && CHURCH.test(s.id));
  const spots = [[-10, chZ1 + 6], [10, chZ1 + 6], [-10, chZ1 + 14], [10, chZ1 + 14], [-10, chZ1 + 22], [10, chZ1 + 22],
    [-9.5, chZ0 + 2.5], [9.5, chZ0 + 2.5], [-10, C.z1 - 4], [10, C.z1 - 4], [-4, C.z1 - 2.5], [4, C.z1 - 2.5]];
  church.forEach((s2, i) => { const [x, z] = spots[i % spots.length]; ctx.bill.add(s2.id, x + (i >= spots.length ? 1.2 : 0), F, z, 1.0); });
  // pews: two banks facing the altar
  for (let z = chZ1 + 4; z < C.z1 - 3; z += 1.8) for (const x of [-3.4, 3.4]) props.add('pew', x, F, z, Math.PI);
  // torches on the pillars' line and the walls
  for (let z = C.z1 - 6; z > C.z0 + 14; z -= 10) {
    props.add('wall_torch', C.x0 + t / 2 + 0.06, F, z, Math.PI / 2);
    props.add('wall_torch', C.x1 - t / 2 - 0.06, F, z, -Math.PI / 2);
  }
  // stained glass in the window openings, banners on the inner walls, a rose over the door
  const glass = ['window_blue_lancet_glass', 'window_crimson_crown_glass', 'window_green_lion_glass'];
  const glassLight = { window_blue_lancet_glass: 0x6a8cff, window_crimson_crown_glass: 0xff5a4a, window_green_lion_glass: 0x6aff7a };
  let k = 0;
  for (const o of win(C.z1 - C.z0).filter((o) => o.at > 9)) {
    const z = C.z0 + o.at, y = (o.y0 + o.y1) / 2;
    for (const [x, nx] of [[C.x0, 1], [C.x1, -1]]) {
      const id = glass[k++ % glass.length];
      wallPanel(lib, scene, id, x + nx * 0.05, y, z, [nx, 0, 0], 6.2, { glow: true });
      wallPanel(lib, scene, id, x - nx * 0.05, y, z, [-nx, 0, 0], 6.2, { glow: true });
      ctx.windows?.push({ x, y, z, w: o.w, h: o.y1 - o.y0, normal: [nx, 0, 0], color: glassLight[id] });
    }
  }
  ctx.windows?.push({ x: 0, y: F + 9.5, z: C.z1, w: 3.6, h: 3.6, normal: [0, 0, -1], color: 0xffc890 });
  wallPanel(lib, scene, 'window_rose_stained_glass', 0, F + 9.5, C.z1 - t / 2 - 0.05, [0, 0, -1], 4.5, { glow: true });
  wallPanel(lib, scene, 'window_rose_stained_glass', 0, F + 9.5, C.z1 + t / 2 + 0.05, [0, 0, 1], 4.5, { glow: true });
  const banners = ['hanging_crimson_tower_banner', 'hanging_navy_crossed_lances_banner', 'hanging_ivory_lion_banner', 'hanging_black_keep_banner'];
  banners.forEach((id, i) => wallPanel(lib, scene, id, -6 + (i % 2) * 12, F + 6.5, C.z1 - 9 - Math.floor(i / 2) * 10, [i % 2 ? -1 : 1, 0, 0], 3.4));
  wallPanel(lib, scene, 'hanging_chapel_icon_frame', 0, F + 6, chZ0 + 0.3, [0, 0, 1], 3);
  wallPanel(lib, scene, 'hanging_war_map_tapestry', 6, F + 2.6, C.z0 + 0.45, [0, 0, 1], 2.2);
  // bell tower at the south-east corner with a spire
  const tw = { x0: C.x1 - 0.4, x1: C.x1 + 6.6, z0: C.z1 - 7, z1: C.z1 };
  belfry(ctx, tw, M, roof);
  const pillarsZ = [];
  for (let z = C.z1 - 6; z > C.z0 + 12; z -= 5) pillarsZ.push(z);
  gothicDetail(ctx, C, { F, H, t, M, rise: 9, pillarsZ, windowsAt: win(C.z1 - C.z0).filter((o) => o.at > 9).map((o) => o.at) });
  // the stair flight down to the dungeon: walls either side, a ceiling once underground
  const stone = M('castle_basalt', 3), steps = M('catacombs_charcoal_flagstone', 1.5);
  const run = b.stairs(STAIRS.x, STAIRS.z, F, -(F + 14), 2.4, '-z', steps, { step: 0.25, run: 0.34 });
  const zEnd = STAIRS.z - run;
  for (const sx of [-1, 1]) b.box([STAIRS.x + sx * 1.2 - (sx > 0 ? 0 : 0.5), -15, zEnd - 1], [STAIRS.x + sx * 1.2 + (sx > 0 ? 0.5 : 0), F, STAIRS.z + 0.5], stone);
  // ceiling: follows the flight down, a little above head height, from where it leaves the
  // office under the ground
  for (let z = C.z0 + 0.3; z > zEnd - 1; z -= 1) {
    const yTop = F - ((STAIRS.z - z) / 0.34) * 0.25;
    const ceil = Math.min(-0.25, yTop + 3.1);
    b.box([STAIRS.x - 1.7, ceil, z - 1], [STAIRS.x + 1.7, ceil + 0.5, z], stone, { shade: 0.6 });
  }
  ctx.stairBottom = { x: STAIRS.x, y: -14, z: zEnd };
}

function graveyard(ctx, M, R) {
  const { b, props, bill, lib } = ctx;
  const G = GRAVEYARD;
  const wallMat = M('castle_rubble', 2.5), cap = M('castle_slatestone', 2);
  const gate = 20 - G.x0; // the gate on the south side faces the lane at x = 17
  b.wall(G.x0, G.z1, G.x1, G.z1, 0, 1.4, 0.6, wallMat, [{ at: gate - 3, w: 4, y0: 0, y1: 1.4 }]);
  b.wall(G.x0, G.z0, G.x1, G.z0, 0, 1.4, 0.6, wallMat);
  b.wall(G.x0, G.z0, G.x0, G.z1, 0, 1.4, 0.6, wallMat);
  b.wall(G.x1, G.z0, G.x1, G.z1, 0, 1.4, 0.6, wallMat);
  for (const x of [G.x0 + gate - 5.2, G.x0 + gate - 0.8]) b.box([x - 0.4, 0, G.z1 - 0.4], [x + 0.4, 2.4, G.z1 + 0.4], cap);
  const kinds = ['gravestone_round', 'gravestone_round', 'gravestone_cross', 'gravestone_cross', 'gravestone_obelisk'];
  for (let z = G.z1 - 6; z > G.z0 + 4; z -= 3.6) {
    for (let x = G.x0 + 4; x < G.x1 - 4; x += 3.2) {
      if (Math.abs(x - (G.x0 + gate - 3)) < 2.5) continue;            // the path from the gate
      if (x > -12 && x < 12 && z < G.z0 + 22) continue;              // the mausoleum
      if (R() < 0.18) continue;
      props.add(kinds[Math.floor(R() * kinds.length)], x + (R() - 0.5) * 0.8, 0, z + (R() - 0.5) * 0.5, (R() - 0.5) * 0.25);
    }
  }
  for (let i = 0; i < 6; i++) props.add('sarcophagus', -30 + i * 12 + (R() - 0.5) * 3, 0, G.z0 + 8 + R() * 4, R() * 0.4);
  // the mausoleum
  const mx = 0, mz = G.z0 + 10, mos = M('castle_mossy', 3);
  ctx.zones.push({ x0: mx - 6, z0: mz - 6, x1: mx + 6, z1: mz + 6, y0: -1, y1: 5, name: 'The Mausoleum' });
  b.wall(mx - 6, mz + 6, mx + 6, mz + 6, 0, 5, 0.6, mos, [{ at: 6, w: 2, y0: 0, y1: 3 }]);
  b.wall(mx - 6, mz - 6, mx + 6, mz - 6, 0, 5, 0.6, mos);
  b.wall(mx - 6, mz - 6, mx - 6, mz + 6, 0, 5, 0.6, mos);
  b.wall(mx + 6, mz - 6, mx + 6, mz + 6, 0, 5, 0.6, mos);
  b.box([mx - 6, 0, mz - 6], [mx + 6, 0.1, mz + 6], M('catacombs_crypt_limestone', 2));
  b.gable(mx - 6, mz - 6, mx + 6, mz + 6, 5, 3, M('castle_roof_moss', 2.5), mos, 'z', 0.4);
  props.add('sarcophagus', mx, 0.1, mz - 1); props.add('candelabrum', mx - 3, 0.1, mz - 3); props.add('candelabrum', mx + 3, 0.1, mz - 3);
  props.add('pillar_broken', mx + 4, 0.1, mz + 3, 1);
  // graveyard scenery sprites and dead trees
  // the graveyard's own sprites out among the graves (the church furnishings go inside)
  const scen = lib.sprites('scatter', (s) => s.id.startsWith('cathedral_graveyard_') && !CHURCH.test(s.id)).map((s) => s.id);
  for (let i = 0; i < 70; i++) {
    const x = G.x0 + 3 + R() * (G.x1 - G.x0 - 6), z = G.z0 + 3 + R() * (G.z1 - G.z0 - 6);
    if (x > -12 && x < 12 && z < G.z0 + 22) continue;
    bill.add(scen[i % scen.length], x, 0, z, 1.1);
  }
  const dead = ['town_tree_18_large_storm_deadwood', 'town_tree_12_medium_dead_oak', 'town_tree_06_small_dead_thorn'];
  for (let i = 0; i < 14; i++) {
    const x = G.x0 + 2 + R() * (G.x1 - G.x0 - 4), z = G.z0 + 2 + R() * (G.z1 - G.z0 - 4);
    if (x > -12 && x < 12 && z < G.z0 + 22) continue;
    bill.add(dead[i % dead.length], x, 0, z, 0.9 + R() * 0.4);
    ctx.physics.add([x - 0.35, 0, z - 0.35], [x + 0.35, 6, z + 0.35], 'tree');
  }
}

function forestRing(ctx, R, houses) {
  const { lib, bill, physics } = ctx;
  const trees = lib.sprites('tree', (s) => !s.id.startsWith('sand_'));
  const live = trees.filter((s) => !/dead|thorn|storm/.test(s.id));
  const scatter = lib.sprites('scatter', (s) => /^(dark_forest|town)_/.test(s.id) && s.height_m < 2.5);
  const clear = (x, z) => {
    if (x > GRAVEYARD.x0 - 6 && x < GRAVEYARD.x1 + 6 && z > GRAVEYARD.z0 - 6 && z < GRAVEYARD.z1 + 8) return false;
    if (x > 10 && x < 24 && z > -126 && z < -40) return false; // the graveyard lane
    if (Math.abs(x) < 7 || Math.abs(z) < 7) return false;      // the roads out of the village
    return true;
  };
  const nearHouse = (x, z) => houses.some((h) => Math.abs(x - h.x) < h.w / 2 + 6 && Math.abs(z - h.z) < h.d / 2 + 6)
    || (Math.abs(x + 56) < 19 && Math.abs(z - 44) < 19) || (x > -20 && x < 26 && z > -110 && z < -40);
  let count = 0;
  for (let i = 0; i < 26000 && count < 7000; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * (WORLD_R + 30);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!clear(x, z)) continue;
    const inVillage = r < VILLAGE_R;
    if (inVillage && (R() > 0.04 || nearHouse(x, z) || Math.hypot(x, z) < 26)) continue;
    if (!inVillage && r < VILLAGE_R + 14 && R() > 0.35) continue; // a ragged forest edge
    const t = (inVillage ? live : trees)[Math.floor(R() * (inVillage ? live : trees).length)];
    const sc = 0.8 + R() * 0.6;
    bill.add(t.id, x, 0, z, sc, 0.75 + R() * 0.35);
    if (r < WORLD_R) physics.add([x - 0.4, 0, z - 0.4], [x + 0.4, 5, z + 0.4], 'tree');
    count++;
    if (R() < 0.18 && scatter.length) {
      const s = scatter[Math.floor(R() * scatter.length)];
      bill.add(s.id, x + (R() - 0.5) * 5, 0, z + (R() - 0.5) * 5, 1, 0.8);
    }
  }
}
