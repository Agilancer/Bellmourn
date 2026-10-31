// The overworld: a large village in a forest clearing, ten buildings you can walk into, the
// cathedral at the north end of the village (its back office holds the stairs down to the
// dungeon), a walled graveyard beyond it, and a forest ringing everything.
// Metres; x east, z south (north is -z); the outdoor ground is y = 0.
import * as THREE from 'three';
import { wallPanel } from './sprites.js';
import { detailedHouse, houseMaterials, lampPost, marketStall, fence, cart, gothicDetail, belfry } from './buildings.js';
import { buildRegion, SPOTS } from './region.js';
import { REGION } from './terrain.js';
import { DELVES, delveFootprint } from './delves.js';
import { keepClear } from './keep.js';
import { CRATER, buildCraterGround, nearCrater } from './crater.js';
import { craterOfferings } from './polish.js';

export const VILLAGE_R = 100;   // the village clearing
export const WORLD_R = 300;     // the forest goes on to here; the player stays inside
export const CATHEDRAL = { x0: -12, x1: 12, z0: -98, z1: -52, floor: 0.6 };
export const GRAVEYARD = { x0: -48, x1: 48, z0: -182, z1: -122 };
export const STAIRS = { x: 5.0, z: -93.6 }; // top of the stairs, in the stair-house in the cathedral office
// where the outdoor ground is left out: under the cathedral and the delves' stair-houses
const GROUND_CUTS = [[CATHEDRAL.x0, CATHEDRAL.z0, CATHEDRAL.x1, CATHEDRAL.z1], ...DELVES.map(delveFootprint),
  [CRATER.x - CRATER.reach, CRATER.z - CRATER.reach, CRATER.x + CRATER.reach, CRATER.z + CRATER.reach]];   // (the crater builds its own)
const OFFICE_DOOR_X = -6.5;                   // the office door in the chancel wall, behind the pulpit
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

/** A smooth wobble in -1 .. 1 round a closed outline (angle a, k picks which). */
const wob = (a, k) => Math.sin(a * 3 + k) * 0.5 + Math.sin(a * 7 + k * 2.1) * 0.3 + Math.sin(a * 13 + k * 0.7) * 0.2;

/** An outline [[x, z]...] round (cx, cz): a rectangle hx by hz (half sizes) with its corners rounded
 * (a superellipse, power n: the higher, the squarer), its edge wobbling by `jit` metres; N points,
 * turning the way geo.js patch() wants. */
export function roundRect(cx, cz, hx, hz, n, jit, k, N = 48) {
  return Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const r = 1 / ((Math.abs(c) / hx) ** n + (Math.abs(s) / hz) ** n) ** (1 / n) + jit * (wob(a, k) + 0.7 * Math.sin(a * 2 + k * 1.7));   // (and a long swell)
    return [cx + c * r, cz + s * r];
  });
}

export function buildWorld(ctx) {
  const { lib, b, props, bill, scene, physics } = ctx;
  const R = rng(1471);
  ctx.zones = []; // roofed interiors: {x0, z0, x1, z1, y0, y1, name}
  ctx.interiors = []; // the houses' rooms: a zone with its floor, front door and country
  const M = (id, tile = 3, o = {}) => lib.material(id, { tile, ...o });
  physics.groundHoles.push([CATHEDRAL.x0, CATHEDRAL.z0, CATHEDRAL.x1, CATHEDRAL.z1]);

  // ------------------------------------------------------------ ground
  // one blended material for all of it (see Library.ground): meadow in the village, forest
  // floor beyond, grave soil in the graveyard. The clover lawn and the oak leaf litter are the
  // ground sheets' (tools/world/import_ground.py), toned down to sit with the Velscour floors
  const ground = lib.ground({ village: VILLAGE_R, yard: [GRAVEYARD.x0, GRAVEYARD.z0, GRAVEYARD.x1, GRAVEYARD.z1], layers: [
    ['ground_grass_02', 1.7, 0xd4b0e4], ['town_olive_meadow', 3.4], ['town_wildflower_grass', 2.6],
    ['ground_forest_floor_03', 2.4, 0xe0dcd8], ['dark_forest_damp_moss', 3.2], ['ground_forest_floor_08', 2.2, 0xe0d6c8],
    ['cathedral_graveyard_dead_grass', 3], ['cathedral_graveyard_grave_soil', 2.6]], crater: CRATER });
  ground.userData.noCast = true;
  ground.userData.chunk = 96;
  const CELL = 12;
  for (let x = -WORLD_R - 36; x < WORLD_R + 36; x += CELL) {
    for (let z = -WORLD_R - 36; z < WORLD_R + 36; z += CELL) {
      const cx = x + CELL / 2, cz = z + CELL / 2;
      if (Math.hypot(cx, cz) > WORLD_R + 48 || x >= REGION.x0 - 2) continue; // the downs have their own ground
      // the cathedral and the delves' stair-houses stand on their own floors (and their
      // stairwells must stay open): cut their footprints out of the cells they overlap
      let pieces = [[x, z, x + CELL, z + CELL]];
      for (const [h0, k0, h1, k1] of GROUND_CUTS) {
        pieces = pieces.flatMap(([a0, b0, a1, b1]) => (a1 <= h0 || a0 >= h1 || b1 <= k0 || b0 >= k1 ? [[a0, b0, a1, b1]] : [
          [a0, b0, Math.min(a1, h0), b1], [Math.max(a0, h1), b0, a1, b1],
          [Math.max(a0, h0), b0, Math.min(a1, h1), Math.min(b1, k0)], [Math.max(a0, h0), Math.max(b0, k1), Math.min(a1, h1), b1]]));
      }
      for (const [a0, b0, a1, b1] of pieces) {
        if (a1 - a0 < 0.01 || b1 - b0 < 0.01) continue;
        b.quad(ground, [a0, 0, b1], [a1, 0, b1], [a1, 0, b0], [a0, 0, b0], [[a0, -b1], [a1, -b1], [a1, -b0], [a0, -b0]]);
      }
    }
  }
  buildCraterGround(scene, ground);   // the bowl where Tessariel came down
  // nothing stands or grows in the crater: whatever the village would have put there is drawn for
  // (so the rest of the world comes out as it always has) and left out
  const keepOut = (o, name, at, skip = () => undefined) => { const f = o[name].bind(o); o[name] = (...a) => (nearCrater(...at(a)) ? skip(a) : f(...a)); return () => { o[name] = f; }; };
  const restore = [keepOut(bill, 'add', (a) => [a[1], a[3]]), keepOut(props, 'add', (a) => [a[1], a[3]]),
    keepOut(physics, 'add', (a) => (a[2] === 'tree' || a[2] === 'prop' ? [(a[0][0] + a[1][0]) / 2, (a[0][2] + a[1][2]) / 2] : [1e9, 1e9]), (a) => ({ min: a[0], max: a[1], tag: a[2], off: true })),
    ...(ctx.scatter ? [keepOut(ctx.scatter, 'place', (a) => [a[1], a[3]])] : []), ...(ctx.trees3d ? [keepOut(ctx.trees3d, 'add', (a) => [a[1], a[3]])] : [])];
  // roads and the plaza: overlays drawn over the ground, their edges frayed into the grass rather
  // than ruled straight (`feather`, metres: lib.js feathered). The roads wander a little and widen
  // where they meet the plaza; the plaza, the forecourt and the lots are rounded, uneven patches.
  const road = M('town_wheel_worn_gravel', 3, { overlay: true, feather: 2.6 });
  const dirt = M('town_packed_dirt', 3, { overlay: true, feather: 1.8 });
  const cobble = M('town_grey_cobbles', 2.5, { overlay: true, feather: 1.8 });
  const paving = M('town_limestone_paving', 2.5, { overlay: true, feather: 1.6 });
  const flare = (d) => (d < 0 ? 1 : d < 9 ? (1 - d / 9) ** 2 : 0);   // (a road opening out into the plaza)
  const street = (along, cross, at) => {   // a road along one axis: [along, across, w] points
    const pts = [];
    for (let u = along[0]; u <= along[1] + 1e-6; u += 4) {
      const v = cross + 0.45 * Math.sin(u * 0.043 + at) + 0.25 * Math.sin(u * 0.117 + at * 2);
      pts.push([u, v, 4 * (1 + 0.06 * Math.sin(u * 0.071 + at)) + 2.6 * flare(Math.abs(u) - 20)]);
    }
    return pts;
  };
  const NS = street([-48, VILLAGE_R + 20], 0, 1.3).map(([z, x, w]) => [x, z, w]), EW = street([-VILLAGE_R - 20, VILLAGE_R + 20], 0, 0.4);
  const plaza = roundRect(0, 0, 20.5, 20.5, 4, 1.2, 1, 80), forecourt = roundRect(0, -47.5, 16.3, 7.8, 3.5, 1.0, 2, 64);
  b.ribbon(road, NS, 4);                        // north-south high street
  b.ribbon(road, EW, 4);                        // east-west road
  b.patch(cobble, 0, 0, 0.03, plaza);           // the plaza
  b.patch(paving, 0, -47.5, 0.03, forecourt);   // the cathedral forecourt (on under its front)
  // grass growing onto them at their edges (grass.js), not on the plaza, nor where the roads meet it
  const T = ctx.tufts, open = (x, z) => !(Math.abs(x) < 22 && Math.abs(z) < 22) && !(Math.abs(x) < 18 && z < -38 && z > -56);
  T?.verge(NS, 4, 2.0, { clear: open }); T?.verge(EW, 4, 2.0, { clear: open });
  T?.ring(plaza, 1.3, { clear: (x, z) => Math.abs(x) > 7 && Math.abs(z) > 7 });
  T?.ring(forecourt, 0.9, { clear: (x, z) => z > -51.5 && Math.abs(x) > 6 && !(x > 12 && z > -51 && z < -43) });
  // the lane to the graveyard: off the forecourt's east side, round the bell tower (it stands
  // at the cathedral's south-east corner), up past the chancel and across to the gate
  const lane = [[13.5, -46.5, 3.2], [18, -46.8, 3.2], [21.5, -48.6, 3.1], [23, -52, 3]];
  for (let z = -56; z >= -108; z -= 4) lane.push([23.3 + 0.55 * Math.sin(z * 0.09) + 0.25 * Math.sin(z * 0.23), z, 2.9 + 0.25 * Math.sin(z * 0.13)]);
  lane.push([22.6, -112, 3.1], [20.8, -116.5, 3.3], [18.6, -120, 3.5], [17.2, -124.5, 3.2]);
  b.ribbon(dirt, lane, 3, 0.021);
  T?.verge(lane, 3, 1.4, { clear: (x, z) => z < -51 });
  // footpaths to the back doors, and the trodden lots beside the alchemist's and the store
  for (const [x0, x1, z] of [[-61, -47, 31.5], [43, 59, 31.5]]) {
    const pts = [];
    for (let x = x0; x <= x1 + 1e-6; x += 2) pts.push([x, z + 0.35 * Math.sin(x * 0.4), 1.5 + 0.15 * Math.sin(x * 0.7)]);
    b.ribbon(dirt, pts, 1.5, 0.02);
    T?.verge(pts, 1.5, 1.0);
  }
  for (const [x, k] of [[-30, 3], [30, 4]]) b.patch(dirt, x, -18, 0.02, roundRect(x, -18, 6.3, 14.3, 4, 0.6, k, 40));
  props.add('well', 0, 0.03, 0, 0, 1.2);
  // gateways on the three roads out of the village (the town pack's): fieldstone east, where
  // the trail to the downs begins, a timber market gate west, the guildhall gate south
  ctx.cutouts?.place('town_fieldstone_round', VILLAGE_R - 8, 0, 0, Math.PI / 2, 6.4, 0.9);
  ctx.cutouts?.place('town_timber_market', -(VILLAGE_R - 8), 0, 0, -Math.PI / 2, 6.4, 0.7);
  ctx.cutouts?.place('town_limestone_guildhall', 0, 0, VILLAGE_R - 8, 0, 5.6, 0.9);
  // and inside each gate the village's own banners (the town ones: never Velscour's V, nor the
  // church's T) on a pole either side of the road, facing the way in and out
  const town = lib.sprites('banner', (s) => s.allegiance === 'town').map((s) => s.id);
  const post = M('castle_wood', 1.5), arm = M('met_02_riveted_black_iron', 1);
  [[VILLAGE_R - 10.5, 0, 'x'], [-(VILLAGE_R - 10.5), 0, 'x'], [0, VILLAGE_R - 10.5, 'z']].forEach(([gx, gz, road], g) => {
    for (const s of [-1, 1]) {
      const across = road === 'x' ? [0, s] : [s, 0];              // from the road out to the pole
      const px = gx + across[0] * 5.6, pz = gz + across[1] * 5.6, bx = gx + across[0] * 4.65, bz = gz + across[1] * 4.65;
      b.cylinder([px, 0, pz], [px, 4.95, pz], 0.09, 8, post);
      b.beam([px, 4.85, pz], [gx + across[0] * 3.9, 4.85, gz + across[1] * 3.9], 0.07, 0.07, arm);
      physics.add([px - 0.12, 0, pz - 0.12], [px + 0.12, 4.95, pz + 0.12], 'prop');
      wallPanel(lib, scene, town[(g * 2 + (s > 0 ? 1 : 0)) % town.length], bx, 3.5, bz, road === 'x' ? [1, 0, 0] : [0, 0, 1], 2.6);
    }
  });

  // ------------------------------------------------------------ buildings
  const houses = [
    { name: 'inn', shop: 'inn', doorArt: 'town_tavern_tankard', title: "The Tolling Bell Inn", x: 30, z: 18, w: 16, d: 11, h: 4.2, storeys: 2, timber: true, wall: 'town_wall_oak_plaster', upper: 'town_wall_wattle_daub', roof: 'town_roof_straw_thatch', floor: 'town_tavern_planks', door: 'w', chimney: [5, 0], sign: 0,
      furnish: [['table', -3, 1, 0], ['table', 2, -2, 0], ['table', 3, 2.5, 0], ['stool', -3, 2.2], ['stool', -3, -0.3], ['stool', 2, -0.8], ['stool', 3, 3.6], ['barrel', 6.5, -4], ['barrel', 6.5, -3], ['barrel', 6.5, 4], ['candelabrum', -6.5, -4], ['bed', 6, 1, Math.PI / 2]] },
    { name: 'blacksmith', shop: 'blacksmith', doorArt: 'town_smith_iron', title: "Hammerfall Smithy", x: -30, z: 18, w: 12, d: 10, h: 4.4, storeys: 1, wall: 'town_wall_fieldstone', roof: 'town_roof_blue_slate', floor: 'town_stable_yard', door: 'e', chimney: [-3, -2], sign: 1, forge: [-3, -2],
      furnish: [['anvil', 0, 0], ['barrel', -4.5, 3.5], ['crate', -4.2, 3.5 - 7], ['table', 3, -3, 0], ['candelabrum', 4.5, 3.5]] },
    { name: 'general store', shop: 'general_goods', title: "Grimwald's Provisions", x: 30, z: -18, w: 14, d: 10, h: 3.9, storeys: 2, wall: 'town_wall_pine_siding', upper: 'town_wall_oak_plaster', roof: 'town_roof_oak_shingles', floor: 'town_oak_boards', door: 'w', sign: 2,
      furnish: [['crate', 4, -3], ['crate', 4, -1.9], ['crate', 5.2, -3], ['barrel', 5.5, 3.2], ['barrel', 4.5, 3.6], ['table', -2, 0, Math.PI / 2], ['bookshelf', 0, -4.6, 0], ['treasure_chest', 1, 3.8, Math.PI]] },
    { name: 'alchemist', shop: 'spells', doorArt: 'town_mage_star', title: "The Alchemist's Shop", x: -30, z: -18, w: 11, d: 9, h: 3.8, storeys: 2, timber: true, wall: 'town_wall_wattle_daub', upper: 'town_wall_oak_plaster', roof: 'town_roof_terracotta', floor: 'town_herringbone_brick', door: 'e', sign: 0, chimney: [-3, 2],
      furnish: [['bookshelf', -2, -4.1, 0], ['bookshelf', 1, -4.1, 0], ['table', 0, 1, 0], ['candelabrum', -4, 3], ['barrel', 4, -3]] },
    { name: 'town hall', title: "Bellmourn Town Hall", x: 0, z: 42, w: 20, d: 13, h: 5.0, storeys: 2, wall: 'town_wall_dressed_limestone', upper: 'town_wall_oak_plaster', roof: 'town_roof_blue_slate', floor: 'castle_keep_royal_inlay_slab', door: 'n', dormers: 3,
      furnish: [['table', 0, 1, 0], ['table', 0, 3, 0], ['pew', -4, -2, Math.PI], ['pew', 4, -2, Math.PI], ['candelabrum', -8.5, -5], ['candelabrum', 8.5, -5], ['bookshelf', -6, 5.6, Math.PI], ['bookshelf', 6, 5.6, Math.PI], ['treasure_chest', 0, 5.5, Math.PI]] },
    { name: 'barracks', shop: 'armorer', doorArt: 'town_smith_iron', title: "The Watch Barracks", x: 52, z: 44, w: 16, d: 10, h: 3.9, storeys: 2, wall: 'town_wall_town_brick', upper: 'town_wall_wattle_daub', roof: 'castle_roof_black', floor: 'town_dark_pine', door: 'n', chimney: [6, 2],
      furnish: [['bed', -5, 2], ['bed', -2.5, 2], ['bed', 0, 2], ['bed', 2.5, 2], ['table', 4.5, -2, 0], ['stool', 4.5, -0.8], ['crate', -6.5, -3.8], ['treasure_chest', 6.5, 3.8, -Math.PI / 2]] },
    { name: 'stable', shop: 'stables', title: "The Stables", x: 58, z: -6, w: 12, d: 14, h: 4.4, storeys: 1, timber: true, wall: 'town_wall_pine_siding', roof: 'town_roof_straw_thatch', floor: 'town_stable_yard', door: 'w', openFront: true,
      furnish: [['barrel', 4, -5.5], ['crate', 4, 5.5], ['crate', 3, 5.5], ['table', -2, 5, 0]] },
    { name: 'bakery', shop: 'bakery', title: "The Bakehouse", x: -58, z: -8, w: 12, d: 10, h: 3.8, storeys: 2, wall: 'town_wall_town_brick', upper: 'town_wall_oak_plaster', roof: 'town_roof_terracotta', floor: 'town_herringbone_brick', door: 'e', chimney: [-3, 2], sign: 1,
      furnish: [['table', 1, 0, Math.PI / 2], ['barrel', -4, -3.5], ['barrel', -4, 3.5], ['crate', -3, 3.6], ['stool', 2, 1.5]] },
    { name: 'healer', shop: 'apothecary', title: "House of Mending", x: 44, z: -48, w: 12, d: 9, h: 3.8, storeys: 2, timber: true, wall: 'town_wall_oak_plaster', upper: 'town_wall_wattle_daub', roof: 'town_roof_oak_shingles', floor: 'town_oak_boards', door: 'w', sign: 2,
      furnish: [['bed', 3, -2, Math.PI / 2], ['bed', 3, 2, Math.PI / 2], ['bookshelf', -1, -3.6, 0], ['table', -2.5, 1.5, 0], ['candelabrum', 5, 0]] },
  ];
  const hm = houseMaterials(lib, M);
  ctx.glass = hm.glass;
  ctx.lantern = hm.lantern;
  b.flowers = [];
  for (const h of houses) {
    detailedHouse(ctx, h, M, { ...hm, ...hm.perHouse(houses.indexOf(h)) });
    if (h.forge) forge(ctx, M, h.x + h.forge[0], h.z + h.forge[1]);
  }
  for (const [x, y, z] of b.flowers) bill.add('town_scatter_26_wildflowers', x, y, z, 0.32);
  villageDetail(ctx, M, hm, houses);
  mageTower(ctx, -56, 44, M);
  cathedral(ctx, M);
  graveyard(ctx, M, R);
  groundPatches(ctx, M, R, houses);

  // fences of trees inside the village and the forest beyond, the trail east through it, and
  // the open downs at its end
  forestRing(ctx, R, houses);
  trail(ctx, M, R);
  ctx.region = buildRegion(ctx, M, hm);
  // where the knights and sorcerers march on the downs: between its named places
  // (the falls' watch keeps back from the pool)
  const lair = (k, dx = 0, dz = 0, r = 40) => ({ x: SPOTS[k][0] + dx, z: SPOTS[k][1] + dz, r: Math.min(r, SPOTS[k][2]), name: SPOTS[k][3] });
  ctx.biomes = { downs: { lairs: [lair('farm'), lair('mill'), lair('hamlet'), lair('falls', -40, 30, 14)] } };
  // where the player may go: the village and forest, the trail, the downs
  for (const r of restore) r();
  craterOfferings(ctx);   // candles, wreaths and flowers the village has left by the crater
  ctx.inBounds = (x, z) => Math.hypot(x, z) < WORLD_R - 4 || (x > 100 && x < REGION.x0 + 10 && Math.abs(z) < 5.5)
    || (x >= REGION.x0 + 4 && x <= REGION.x1 - 4 && Math.abs(z) <= REGION.z1 - 6);
  return { houses };
}

/** The ground's wear and tear, in the village's other floors: a paved or gravelled yard before
 * every door, worn grass, mud and rutted earth about the streets, lime-floored work yards,
 * paths through the graveyard and trodden clearings in the forest. */
function groundPatches(ctx, M, R, houses) {
  const { b, lib } = ctx;
  const take = (re, salt) => lib.take((s) => re.test(s.id), salt);
  // an irregular blob of ground round (x, z) with a ragged, frayed edge
  const blob = (id, x, z, r, y = 0.022, n = 10, feather = 1.4) => {
    const m = M(id, 2.5, { overlay: true, feather });
    const pts = Array.from({ length: n }, (_, k) => {
      const a = k / n * Math.PI * 2, rr = r * (0.7 + 0.3 * R()) * (1 + 0.22 * wob(a, x * 0.37 + z * 0.11));   // (no stamped circles)
      return [x + Math.cos(a) * rr, z + Math.sin(a) * rr];
    });
    b.patch(m, x, z, y, pts);
  };
  const yard = /^town_(irregular_flagstone|slate_paving|brick_street|granite_setts|moss_pavers|fine_gravel|coarse_gravel|limestone_gravel|pebble_gravel)$/;
  houses.forEach((h, i) => { // the yard in front of each door
    const out = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[h.door];
    const cx = h.x + out[0] * (h.w / 2 + 2.2), cz = h.z + out[1] * (h.d / 2 + 2.2);
    const hw = out[0] ? 1.8 : 3, hd = out[0] ? 3 : 1.8;
    const m = M(take(yard, i), 2, { overlay: true, feather: 1.0 });
    const outline = roundRect(cx, cz, hw + 0.4, hd + 0.4, 3, 0.3, i + 5, 28);
    b.patch(m, cx, cz, 0.025, outline);
    ctx.tufts?.ring(outline, 0.8, { clear: (x, z) => !houses.some((q) => Math.abs(x - q.x) < q.w / 2 + 0.4 && Math.abs(z - q.z) < q.d / 2 + 0.4) });
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
  [[-40, 14], [-68, -4], [68, -2], [62, 52], [-40, 22], [70, -16]].forEach(([x, z], i) => blob(take(lime, i), x, z, 3.2, 0.024, 8, 1.0));
  // paths in the graveyard: from the gate to the mausoleum, and round it
  const G = GRAVEYARD;
  const gy = /^cathedral_graveyard_(muddy_path|grave_gravel|moss_cobbles|nave_flagstone|limestone_squares|choir_slate|terracotta_nave)$/;
  const pathMat = M(take(gy, 0), 2.2, { overlay: true, feather: 0.9 });
  const gp = [];
  for (let z = G.z1 + 1; z >= G.z0 + 20; z -= 2) gp.push([17 + 0.3 * Math.sin(z * 0.3), z, 1.5 + 0.12 * Math.sin(z * 0.5)]);
  b.ribbon(pathMat, gp, 1.5, 0.025);
  const dead = [1.05, 0.88, 0.7];   // (the graveyard's tufts: dry and pale)
  ctx.tufts?.verge(gp, 1.5, 0.9, { tint: dead, clear: (x, z) => z < G.z1 - 1 });
  const ring = M(take(gy, 1), 2, { overlay: true, feather: 0.9 });
  const rp = [];
  for (let x = 18.5; x >= -8; x -= 2) rp.push([x, G.z0 + 18.5 + 0.3 * Math.sin(x * 0.35), 1.5]);
  b.ribbon(ring, rp, 1.5, 0.026);
  ctx.tufts?.verge(rp, 1.5, 0.9, { tint: dead, clear: (x) => x < 15 });
  for (let i = 0; i < 5; i++) blob(take(gy, i + 2), G.x0 + 8 + i * 18, G.z0 + 30 + (i % 2) * 14, 2.4, 0.024, 8, 1.0);
  // trodden clearings and paths out in the forest
  const wood = /^dark_forest_(black_loam|gravel_path|packed_mud|dark_turf|peat|shale_chips|root_soil|pine_needles|damp_moss|dead_leaves)$/;
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + 0.3, r = 140 + (i % 3) * 45;
    blob(take(wood, i), Math.cos(a) * r, Math.sin(a) * r, 7 + (i % 3) * 2, 0.022, 12, 2.2);
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
  for (const [x, z] of [[-15, -38], [15, -38], [-15, -54]]) lampPost(ctx, x, z, [x < 0 ? 1 : -1, 0], hm);
  for (const z of [-62, -86, -108]) lampPost(ctx, 19.3, z, [1, 0], hm); // up the graveyard lane
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
    const soil = M('town_rooty_dirt', 2, { overlay: true, feather: 0.8 });
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
    quad(M(isPath ? paths[pi++ % paths.length] : beds[bi++ % beds.length], 2, { overlay: true, feather: 0.35 }), x0, z0, x0 + cell, z0 + cell, isPath ? 0.035 : 0.025);
  }
  // palms, acacias, aloes and the rest of the southern sprites in the beds
  const plants = lib.sprites('tree', (s) => s.id.startsWith('sand_'));
  const stuff = lib.sprites('scatter', (s) => s.id.startsWith('sand_'));
  [...plants, ...stuff].forEach((s, i) => {
    const a = i * 2.399, r = 8 + (i * 37 % 60) / 60 * (G - 9.5);
    bill.add(s.id, x + Math.cos(a) * r, 0.03, z + Math.sin(a) * r, s.category === 'tree' ? 0.75 : 0.7);
  });
}

/** A tower's ring of walls (n flat sides, outer and inner faces) with a doorway on side
 * `door` and an arched stained glass window in each of the `windows` sides. */
function towerRing(ctx, x, z, r, y0, y1, n, mat, { door, windows = [], win }) {
  const { b, physics } = ctx;
  const side = 2 * r * Math.sin(Math.PI / n), IN = 0.94;
  for (let k = 0; k < n; k++) {
    if (k === door) continue;
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    const P0 = [x + r * Math.cos(a0), z + r * Math.sin(a0)], P1 = [x + r * Math.cos(a1), z + r * Math.sin(a1)];
    const at = (s, y, f = 1) => { const u = s / side, px = P0[0] + (P1[0] - P0[0]) * u, pz = P0[1] + (P1[1] - P0[1]) * u; return [x + (px - x) * f, y, z + (pz - z) * f]; };
    const u0 = k * side;
    const piece = (sA, sB, ya, yb) => { // outer face, inner face
      b.quad(mat, at(sB, ya), at(sA, ya), at(sA, yb), at(sB, yb), [[-(u0 + sB), ya], [-(u0 + sA), ya], [-(u0 + sA), yb], [-(u0 + sB), yb]]);
      b.quad(mat, at(sA, ya, IN), at(sB, ya, IN), at(sB, yb, IN), at(sA, yb, IN), [[u0 + sA, ya], [u0 + sB, ya], [u0 + sB, yb], [u0 + sA, yb]], 0.6);
    };
    if (windows.includes(k)) {
      const hA = side / 2 - win.w / 2, hB = side / 2 + win.w / 2;
      piece(0, hA, y0, y1); piece(hB, side, y0, y1); piece(hA, hB, y0, win.y0); piece(hA, hB, win.y1, y1);
      for (const [p, q, ya, yb] of [[hA, hA, win.y0, win.y1], [hB, hB, win.y0, win.y1]]) { // the reveals, both ways round
        b.quad(mat, at(p, ya), at(p, ya, IN), at(q, yb, IN), at(q, yb), [[0, ya], [0.4, ya], [0.4, yb], [0, yb]], 0.75);
        b.quad(mat, at(q, yb), at(q, yb, IN), at(p, ya, IN), at(p, ya), [[0, yb], [0.4, yb], [0.4, ya], [0, ya]], 0.75);
      }
      for (const y of [win.y0, win.y1]) {
        b.quad(mat, at(hA, y), at(hB, y), at(hB, y, IN), at(hA, y, IN), [[0, 0], [win.w, 0], [win.w, 0.4], [0, 0.4]], 0.75);
        b.quad(mat, at(hA, y, IN), at(hB, y, IN), at(hB, y), at(hA, y), [[0, 0], [win.w, 0], [win.w, 0.4], [0, 0.4]], 0.75);
      }
      if (ctx.stained) {
        const m0 = at(side / 2, 0), m1 = at(side / 2, 0, IN), c = [(m0[0] + m1[0]) / 2, (win.y0 + win.y1) / 2, (m0[2] + m1[2]) / 2];
        const nx = x - c[0], nz = z - c[2], l = Math.hypot(nx, nz);
        ctx.stained.add('arched', c, [nx / l, 0, nz / l], win.w, win.y1 - win.y0, mat);
      }
    } else piece(0, side, y0, y1);
    physics.add([Math.min(P0[0], P1[0]) - 0.15, y0, Math.min(P0[1], P1[1]) - 0.15], [Math.max(P0[0], P1[0]) + 0.15, y1, Math.max(P0[1], P1[1]) + 0.15]);
  }
}

function mageTower(ctx, x, z, M) {
  const { b, props } = ctx;
  const r = 5.5, hgt = 15, n = 8;
  ctx.zones.push({ x0: x - r, z0: z - r, x1: x + r, z1: z + r, y0: -1, y1: hgt, name: "The Mage's Tower" });
  const stone = M('castle_mossy', 3), floor = M('castle_keep_ivory_chapel_marble', 2.5);
  b.box([x - r, 0, z - r], [x + r, 0.2, z + r], { top: floor, bottom: stone, side: stone });
  const TW = { y0: 3.0, y1: 5.05, w: 1.4 }, windowSides = [0, 1, 2, 3, 4];
  towerRing(ctx, x, z, r, 0.2, hgt, n, stone, { door: 6, windows: windowSides, win: TW });
  if (ctx.stained) ctx.stained.room([x - r - 0.5, 0, z - r - 0.5, x + r + 0.5, hgt, z + r + 0.5]);
  // the doorway's lintel over the open side
  const a0 = (6 / n) * Math.PI * 2, a1 = (7 / n) * Math.PI * 2;
  const p0 = [x + r * Math.cos(a0), z + r * Math.sin(a0)], p1 = [x + r * Math.cos(a1), z + r * Math.sin(a1)];
  b.box([Math.min(p0[0], p1[0]), 2.8, Math.min(p0[1], p1[1]) - 0.3], [Math.max(p0[0], p1[0]), hgt, Math.max(p0[1], p1[1]) + 0.3], stone);
  ctx.doors?.add({ hinge: [p0[0], 0.2, p0[1]], along: -Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), width: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), height: 2.6, double: true, opens: -1, name: "tower door", design: 'town_mage_star' });
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
    for (const [y, i] of (windowSides.includes(k) ? [[11, k + 1]] : [[6, k], [11, k + 1]])) wallPanel(ctx.lib, ctx.scene, slits[i % 4], x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, [Math.cos(a), 0, Math.sin(a)], 1.6);
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
  // the plinth (floor), leaving the stairwell open where the flight goes down
  const sw = { x0: STAIRS.x - 1.2, x1: STAIRS.x + 1.2, z0: C.z0, z1: STAIRS.z };
  b.box([C.x0, 0, C.z0 + 8], [C.x1, F, C.z1], { top: nave, side: plinth, bottom: plinth });
  b.box([C.x0, 0, C.z0], [sw.x0, F, C.z0 + 8], { top: office, side: plinth, bottom: plinth });
  b.box([sw.x1, 0, C.z0], [C.x1, F, C.z0 + 8], { top: office, side: plinth, bottom: plinth });
  b.box([sw.x0, 0, sw.z1], [sw.x1, F, C.z0 + 8], { top: office, side: plinth, bottom: plinth });
  // front steps up to the door
  for (let i = 0; i < 3; i++) b.box([-8, 0, C.z1 + i * 0.5], [8, F - i * 0.2, C.z1 + (i + 1) * 0.5], plinth);
  // the windows: tall lancets down both sides of the nave and chancel (fewer on the east,
  // where the bell tower stands), round oculi over every other lancet, arched windows in the
  // office, and in the west front two lancets either side of the door and the rose above it
  const t = 0.8;
  const LANCET = { w: 1.9, y0: F + 3.4, y1: F + 9.4 }, OCULUS = { w: 1.8, y0: F + 10.4, y1: F + 12.2 }, OFFICE = { w: 2.0, y0: F + 3.0, y1: F + 5.9 };
  const lancetsW = Array.from({ length: 9 }, (_, k) => 10.6 + k * 4), lancetsE = lancetsW.filter((a) => a < 38);
  const oculiW = lancetsW.filter((_, k) => k % 2 === 0 && k > 0), oculiE = lancetsE.filter((_, k) => k % 2 === 0 && k > 0);
  const officeAt = [2.6, 5.6];
  const side = (lancets, oculi) => [
    ...officeAt.map((a) => ({ a0: a - OFFICE.w / 2, a1: a + OFFICE.w / 2, y0: OFFICE.y0, y1: OFFICE.y1, kind: 'arched', at: a })),
    ...lancets.map((a) => ({ a0: a - LANCET.w / 2, a1: a + LANCET.w / 2, y0: LANCET.y0, y1: LANCET.y1, kind: 'lancet', at: a })),
    ...oculi.map((a) => ({ a0: a - OCULUS.w / 2, a1: a + OCULUS.w / 2, y0: OCULUS.y0, y1: OCULUS.y1, kind: 'rose', at: a })),
  ];
  const holesW = side(lancetsW, oculiW), holesE = side(lancetsE, oculiE);
  const ROSE = { w: 4.4, y0: F + 8.0, y1: F + 12.4 };
  const holesF = [ // along the front from its west end
    { a0: 12 - 1.6, a1: 12 + 1.6, y0: F, y1: F + 5.2 }, // the door
    { a0: 12 - ROSE.w / 2, a1: 12 + ROSE.w / 2, y0: ROSE.y0, y1: ROSE.y1, kind: 'rose', at: 12 },
    ...[5, 19].map((a) => ({ a0: a - LANCET.w / 2, a1: a + LANCET.w / 2, y0: LANCET.y0, y1: LANCET.y1, kind: 'lancet', at: a })),
  ];
  b.holeyWall(C.x0, C.z1, C.x1, C.z1, F, H, t, wallOut, holesF, { thinShadow: true });
  ctx.doors?.add({ hinge: [-1.6, F, C.z1], along: 0, width: 3.2, height: 5.2, thick: 0.14, double: true, opens: 1, name: 'cathedral doors', design: 'cathedral_graveyard_cathedral_oak' });
  b.wall(C.x0, C.z0, C.x1, C.z0, F, H, t, wallOut);
  b.holeyWall(C.x0, C.z0, C.x0, C.z1, F, H, t, wallOut, holesW, { thinShadow: true });
  b.holeyWall(C.x1, C.z0, C.x1, C.z1, F, H, t, wallOut, holesE, { thinShadow: true });
  if (ctx.stained) { // the glass in every one of those openings
    const g = ctx.stained;
    for (const h of holesW) g.add(h.kind, [C.x0, (h.y0 + h.y1) / 2, C.z0 + h.at], [1, 0, 0], h.a1 - h.a0, h.y1 - h.y0, wallOut);
    for (const h of holesE) g.add(h.kind, [C.x1, (h.y0 + h.y1) / 2, C.z0 + h.at], [-1, 0, 0], h.a1 - h.a0, h.y1 - h.y0, wallOut);
    for (const h of holesF.filter((x) => x.kind)) g.add(h.kind, [C.x0 + h.at, (h.y0 + h.y1) / 2, C.z1], [0, 0, -1], h.a1 - h.a0, h.y1 - h.y0, wallOut);
    g.room([C.x0 - 0.5, 0, C.z0 - 0.5, C.x1 + 0.5, H + 10, C.z1 + 0.5]);
  }
  // inner lining on the long walls, under the windows: a dado of blind arcading (the graveyard
  // pack's nave ashlar), its plinth on the floor and its coping under the sills
  const dado = M(lib.surf.has('cathedral_wall_nave_ashlar') ? 'cathedral_wall_nave_ashlar' : 'castle_chapel', 3.4);
  b.box([C.x0 + t / 2, F, C.z0 + 8.4], [C.x0 + t / 2 + 0.05, F + 3.4, C.z1 - 0.5], dado, { solid: false, shade: 0.85, vbase: F });
  b.box([C.x1 - t / 2 - 0.05, F, C.z0 + 8.4], [C.x1 - t / 2, F + 3.4, C.z1 - 0.5], dado, { solid: false, shade: 0.85, vbase: F });
  b.gable(C.x0, C.z0, C.x1, C.z1, H, 9, roof, wallOut, 'z', 0.8, 1);
  // pillars and the arcade beams they carry (the props are 4 m tall: scaled to 9 m)
  const arcade = M('castle_ashlar', 3);
  const chancelArch = !!ctx.cutouts && lib.biome.arches.has('cathedral_graveyard_nave_triumphal');
  for (const x of [-6, 6]) {
    // (the last pair, at the chancel step, gives way to the chancel arch)
    for (let z = C.z1 - 6; z > C.z0 + 12; z -= 5) if (!chancelArch || z > C.z0 + 15 + 1) props.add('pillar_gothic', x, F, z, 0, 2.25);
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
  // the chancel arch over the step: the graveyard pack's triumphal arch
  if (chancelArch) ctx.cutouts.place('cathedral_graveyard_nave_triumphal', 0, F + 0.6, chZ1 - 0.42, 0, 5.5, 0.8);
  // the floor: a carpet runner up the aisle, a mosaic before the chancel step, the altar stone,
  // memorial brasses and slabs let into the side aisles, wax under the candles (the graveyard
  // pack's one-off floor tiles)
  const D = (id, size) => (lib.surf.has('cathedral_graveyard_decal_' + id) ? M('cathedral_graveyard_decal_' + id, size, { overlay: true }) : null);
  const field = D('burgundy_carpet', 1.0), border = D('carpet_border', 0.8);
  if (field && border) {
    const fy = F + 0.004, rz0 = chZ1 + 3.1, rz1 = C.z1 - 4.4, L = rz1 - rz0;
    b.quad(field, [-0.5, fy, rz1], [0.5, fy, rz1], [0.5, fy, rz0], [-0.5, fy, rz0], [[0, 0], [0, 1], [L, 1], [L, 0]]);
    b.quad(border, [0.5, fy, rz1], [1.3, fy, rz1], [1.3, fy, rz0], [0.5, fy, rz0], [[0, 0], [0.8, 0], [0.8, L], [0, L]]);
    b.quad(border, [-1.3, fy, rz1], [-0.5, fy, rz1], [-0.5, fy, rz0], [-1.3, fy, rz0], [[0.8, 0], [0, 0], [0, L], [0.8, L]]);
  }
  const lay = (id, x, y, z, size, rot = 0) => { const m = D(id, size); if (m) b.decal(m, x, y, z, size, rot); };
  lay('sunburst_mosaic', 0, F + 0.004, chZ1 + 1.8, 2.4);
  lay('rose_mosaic', 0, F + 0.004, C.z1 - 2.4, 2.8);
  lay('altar_stone', 0, F + 0.604, chZ0 + 3, 2.6);
  lay('incense_ash', 1.9, F + 0.606, chZ0 + 4.4, 1.0);
  ['memorial_brass', 'memorial_slab', 'engraved_cross', 'engraved_lily', 'quatrefoil_inlay', 'anchor_ring', 'broken_rosette', 'chisel_limestone']
    .forEach((id, i) => lay(id, (i % 2 ? 1 : -1) * 8.6, F + 0.004, C.z1 - 8.5 - Math.floor(i / 2) * 7, 1.6, i % 2 ? Math.PI / 2 : -Math.PI / 2));
  for (const [x, y, z] of [[-10, F, chZ1 + 2], [10, F, chZ1 + 2], [-3, F + 0.6, chZ0 + 1.5], [3, F + 0.6, chZ0 + 1.5]]) lay('vigil_wax', x, y + 0.006, z, 1.0);
  // the chancel wall, with the office door behind the pulpit (a step down on the office side)
  b.wall(C.x0, chZ0, C.x1, chZ0, F, H - 2, 0.5, wallIn, [{ at: 12 + OFFICE_DOOR_X, w: 1.8, y0: F + 0.6, y1: F + 3.2 }]);
  ctx.doors?.add({ hinge: [OFFICE_DOOR_X - 0.8, F + 0.6, chZ0], along: 0, width: 1.6, height: 2.55, opens: 1, name: 'office door', design: 'cathedral_graveyard_sacristy_bronze' });
  b.box([OFFICE_DOOR_X - 1.1, F, chZ0 - 0.25 - 0.8], [OFFICE_DOOR_X + 1.1, F + 0.3, chZ0 - 0.25], plinth);
  // the office: a desk, books, a chest, a candle, and the stair-house at its east end
  props.add('table', -4, F, C.z0 + 3.2, 0); props.add('stool', -4, F, C.z0 + 4.4);
  props.add('bookshelf', -8.5, F, C.z0 + 0.8, 0); props.add('bookshelf', -11, F + 0, C.z0 + 2.2, Math.PI / 2);
  props.add('treasure_chest', -10.6, F, C.z0 + 6.2, Math.PI / 2); props.add('candelabrum', -1.2, F, C.z0 + 1.2);
  props.add('bookshelf', 9.5, F, C.z0 + 0.8, 0); props.add('candelabrum', 10.6, F, C.z0 + 6.6);
  // the stair-house: stone walls round the head of the stairs, a roof, and its door on the west
  // side opening onto a landing; the flight goes down north from the landing
  const sh = { x0: STAIRS.x - 2.4, x1: STAIRS.x + 2.4, z0: C.z0 + t / 2, z1: STAIRS.z + 2.0 };
  const shWall = M('castle_basalt', 2.5), shTrim = M('castle_keep_pale_keep_limestone', 1.5);
  const doorZ = STAIRS.z + 0.8; // the door's middle, beside the landing
  b.wall(sh.x0 + 0.2, sh.z0, sh.x0 + 0.2, sh.z1, F, F + 3.6, 0.4, shWall, [{ at: doorZ - sh.z0, w: 1.4, y0: F, y1: F + 2.4 }]);
  b.wall(sh.x1 - 0.2, sh.z0, sh.x1 - 0.2, sh.z1, F, F + 3.6, 0.4, shWall);
  b.wall(sh.x0, sh.z1 - 0.2, sh.x1, sh.z1 - 0.2, F, F + 3.6, 0.4, shWall);
  b.box([sh.x0 - 0.1, F + 3.6, sh.z0], [sh.x1 + 0.1, F + 3.95, sh.z1 + 0.1], shTrim, { solid: false });
  b.box([sh.x0 - 0.05, F + 2.4, doorZ - 0.85], [sh.x0 + 0.45, F + 2.7, doorZ + 0.85], shTrim, { solid: false }); // the lintel
  ctx.doors?.add({ hinge: [sh.x0 + 0.2, F, doorZ + 0.7], along: Math.PI / 2, width: 1.4, height: 2.4, opens: -1, name: 'stair door', design: 'catacombs_ironbound_oak' });
  ctx.zones.unshift({ x0: sh.x0, z0: sh.z0, x1: sh.x1, z1: sh.z1, y0: -1, y1: F + 4, name: 'The Stair to the Undercroft' });
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
  // the holy banners (the ones bearing the T) down the nave, the icon over the altar, the map in the office
  const banners = lib.sprites('banner', (s) => s.allegiance === 'holy').map((s) => s.id);
  banners.forEach((id, i) => wallPanel(lib, scene, id, -6 + (i % 2) * 12, F + 6.5, C.z1 - 9 - Math.floor(i / 2) * 10, [i % 2 ? -1 : 1, 0, 0], 3.4));
  wallPanel(lib, scene, 'hanging_chapel_icon_frame', 0, F + 6, chZ0 + 0.3, [0, 0, 1], 3);
  wallPanel(lib, scene, 'hanging_war_map_tapestry', 6, F + 2.6, C.z0 + 0.45, [0, 0, 1], 2.2);
  // bell tower at the south-east corner with a spire
  const tw = { x0: C.x1 - 0.4, x1: C.x1 + 6.6, z0: C.z1 - 7, z1: C.z1 };
  belfry(ctx, tw, M, roof);
  const pillarsZ = [];
  for (let z = C.z1 - 6; z > C.z0 + 12; z -= 5) pillarsZ.push(z);
  gothicDetail(ctx, C, { F, H, t, M, rise: 9, pillarsZ, windowsAt: lancetsW, hoods: { [-1]: lancetsW, [1]: lancetsE }, lancet: LANCET, roseY: (ROSE.y0 + ROSE.y1) / 2 });
  // the flight down to the dungeon: side walls the whole way, and over it one sloping stone
  // vault from the head of the stairs (inside the stair-house) down under the cathedral's north
  // wall, where it meets the wall's foot, and on underground to the bottom
  const stone = M('castle_basalt', 3), steps = M('catacombs_charcoal_flagstone', 1.5);
  const run = b.stairs(STAIRS.x, STAIRS.z, F, -(F + 14), 2.4, '-z', steps, { step: 0.25, run: 0.34 });
  const zEnd = STAIRS.z - run, yEnd = F - Math.round((F + 14) / 0.25) * 0.25;
  for (const sx of [-1, 1]) b.box([STAIRS.x + sx * 1.2 - (sx > 0 ? 0 : 0.5), -15, zEnd], [STAIRS.x + sx * 1.2 + (sx > 0 ? 0.5 : 0), F, STAIRS.z], stone);
  // (3.4 m clear over the nosings all the way down. Just outside the north wall the vault still
  // stands above the ground: a stone footing against the wall's foot covers it)
  const CLEAR = 3.4, slab = (z) => F - ((STAIRS.z - z) / 0.34) * 0.25 + CLEAR + 0.2;
  b.beam([STAIRS.x, slab(STAIRS.z), STAIRS.z], [STAIRS.x, slab(zEnd), zEnd], 3.95, 0.4, stone, { up: [0, 1, 0] });
  b.box([sh.x0 + 0.4, F + CLEAR, STAIRS.z - 0.05], [sh.x1 - 0.4, F + 3.6, STAIRS.z + 0.1], shWall, { solid: false }); // over the vault's head
  const vTop = (z) => slab(z) + 0.45, zOut = C.z0 - t / 2, zSunk = STAIRS.z - ((F + CLEAR + 0.65) / 0.25) * 0.34;
  if (vTop(zOut) > 0) b.box([STAIRS.x - 2.3, 0, zSunk - 0.2], [STAIRS.x + 2.3, vTop(zOut) + 0.15, zOut], M('castle_ashlar', 2));
  // torches down both walls of the flight, every few steps, alternating sides
  for (let z = STAIRS.z - 1.6, k = 0; z > zEnd + 0.5; z -= 3.2, k++) {
    const y = F - (Math.floor((STAIRS.z - z) / 0.34) + 1) * 0.25, sx = k % 2 ? 1 : -1;
    props.add('wall_torch', STAIRS.x + sx * 1.18, y, z, sx < 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  ctx.stairBottom = { x: STAIRS.x, y: Math.min(-14, yEnd), z: zEnd };
}

function graveyard(ctx, M, R) {
  const { b, props, bill, lib } = ctx;
  const G = GRAVEYARD;
  const art = !!ctx.cutouts && lib.surf.has('cathedral_wall_cemetery_limestone');
  const gate = 20 - G.x0; // the gate on the south side faces the lane at x = 17
  const gx = G.x0 + gate - 3;
  if (art) {
    // the graveyard pack's walls: a mossy limestone boundary wall with its coping round three
    // sides, and along the front, toward the lane, an iron spear railing on a low plinth either
    // side of the processional gate (an arch, with iron gates that open with E)
    const wallMat = M('cathedral_wall_cemetery_limestone', 2.4), back = M('cathedral_wall_cemetery_limestone_back', 2.4);
    const rail = M('cathedral_wall_cemetery_iron', 2.5);
    rail.alphaTest = 0.5;
    for (const [x0, z0, x1, z1] of [[G.x0, G.z0, G.x1, G.z0], [G.x0, G.z0, G.x0, G.z1], [G.x1, G.z0, G.x1, G.z1]]) {
      b.wall(x0, z0, x1, z1, 0, 2.4, 0.6, wallMat);
      // the inner face in the reverse (rooted, lichened) stone
      const inX = x0 === x1 ? (x0 < 0 ? 0.31 : -0.31) : 0, inZ = z0 === z1 ? 0.31 : 0;
      b.box([Math.min(x0, x1) + inX - (x0 === x1 ? 0.005 : 0), 0, Math.min(z0, z1) + inZ - (z0 === z1 ? 0.005 : 0)],
        [Math.max(x0, x1) + inX + (x0 === x1 ? 0.005 : 0), 2.4, Math.max(z0, z1) + inZ + (z0 === z1 ? 0.005 : 0)], back, { solid: false, faces: { top: false, bottom: false } });
    }
    const arch = ctx.cutouts.place('cathedral_graveyard_processional_cemetery', gx, 0, G.z1, 0, 4.0, 0.9);
    const half = arch ? arch.width / 2 - 0.3 : 2;
    for (const [x0, x1] of [[G.x0, gx - half], [gx + half, G.x1]]) b.box([x0, 0, G.z1 - 0.05], [x1, 2.5, G.z1 + 0.05], rail, { faces: { top: false, bottom: false } });
    ctx.doors?.add({ hinge: [gx - 2, 0, G.z1], along: 0, width: 4, height: 3.4, thick: 0.08, double: true, opens: -1, name: 'graveyard gate', design: 'cathedral_graveyard_cemetery_gate' });
    // a back gate through the north wall to the forest, and a ruined cloister arch in the grass
    ctx.cutouts.place('cathedral_graveyard_churchyard_cross', -24, 0, G.z0, Math.PI, 2.6, 0.9);
    ctx.cutouts.place('cathedral_graveyard_ruined_cloister', 34, 0, G.z0 + 24, -Math.PI / 2, 3.4, 0.7);
  } else {
    const wallMat = M('castle_rubble', 2.5), cap = M('castle_slatestone', 2);
    b.wall(G.x0, G.z1, G.x1, G.z1, 0, 1.4, 0.6, wallMat, [{ at: gate - 3, w: 4, y0: 0, y1: 1.4 }]);
    b.wall(G.x0, G.z0, G.x1, G.z0, 0, 1.4, 0.6, wallMat);
    b.wall(G.x0, G.z0, G.x0, G.z1, 0, 1.4, 0.6, wallMat);
    b.wall(G.x1, G.z0, G.x1, G.z1, 0, 1.4, 0.6, wallMat);
    for (const x of [G.x0 + gate - 5.2, G.x0 + gate - 0.8]) b.box([x - 0.4, 0, G.z1 - 0.4], [x + 0.4, 2.4, G.z1 + 0.4], cap);
  }
  // grave earth in front of the headstones (the graveyard pack's grave tiles)
  const earth = ['settled_grave', 'fresh_burial_earth', 'old_grave_mound', 'weedy_grave_soil', 'rooted_grave_soil', 'buried_slab', 'dead_ivy', 'funeral_petals', 'broken_cross', 'burial_fragments']
    .filter((id) => lib.surf.has('cathedral_graveyard_decal_' + id)).map((id) => M('cathedral_graveyard_decal_' + id, 1.5, { overlay: true }));
  const kinds = ['gravestone_round', 'gravestone_round', 'gravestone_cross', 'gravestone_cross', 'gravestone_obelisk'];
  for (let z = G.z1 - 6; z > G.z0 + 4; z -= 3.6) {
    for (let x = G.x0 + 4; x < G.x1 - 4; x += 3.2) {
      if (Math.abs(x - (G.x0 + gate - 3)) < 2.5) continue;            // the path from the gate
      if (x > -12 && x < 12 && z < G.z0 + 22) continue;              // the mausoleum
      if (Math.abs(x - 34) < 3 && Math.abs(z - G.z0 - 24) < 6) continue; // the cloister ruin
      if (Math.abs(x + 24) < 4 && z < G.z0 + 6) continue;             // the back gate
      if (R() < 0.18) continue;
      const px = x + (R() - 0.5) * 0.8, pz = z + (R() - 0.5) * 0.5, rot = (R() - 0.5) * 0.25;
      props.add(kinds[Math.floor(R() * kinds.length)], px, 0, pz, rot);
      if (earth.length && R() < 0.75) b.decal(earth[Math.floor(R() * earth.length)], px - Math.sin(rot) * 1.05, 0.021 + R() * 0.002, pz + Math.cos(rot) * 1.05, 1.5, rot);
    }
  }
  for (let i = 0; i < 6; i++) props.add('sarcophagus', -30 + i * 12 + (R() - 0.5) * 3, 0, G.z0 + 8 + R() * 4, R() * 0.4);
  // the mausoleum
  const mx = 0, mz = G.z0 + 10, mos = M('castle_mossy', 3);
  ctx.zones.push({ x0: mx - 6, z0: mz - 6, x1: mx + 6, z1: mz + 6, y0: -1, y1: 5, name: 'The Mausoleum' });
  b.wall(mx - 6, mz + 6, mx + 6, mz + 6, 0, 5, 0.6, mos, [{ at: 6, w: 2, y0: 0, y1: 3 }]);
  ctx.doors?.add({ hinge: [mx - 1, 0.1, mz + 6], along: 0, width: 2, height: 2.85, double: true, opens: 1, name: 'mausoleum door', design: 'catacombs_bone_reliquary' });
  const MW = { a0: 5.3, a1: 6.7, y0: 1.3, y1: 3.35 };
  b.holeyWall(mx - 6, mz - 6, mx + 6, mz - 6, 0, 5, 0.6, mos, [MW], { thinShadow: true });
  b.holeyWall(mx - 6, mz - 6, mx - 6, mz + 6, 0, 5, 0.6, mos, [MW], { thinShadow: true });
  b.holeyWall(mx + 6, mz - 6, mx + 6, mz + 6, 0, 5, 0.6, mos, [MW], { thinShadow: true });
  if (ctx.stained) {
    const y = (MW.y0 + MW.y1) / 2, w = MW.a1 - MW.a0, h = MW.y1 - MW.y0;
    ctx.stained.add('arched', [mx, y, mz - 6], [0, 0, 1], w, h, mos);
    ctx.stained.add('arched', [mx - 6, y, mz], [1, 0, 0], w, h, mos);
    ctx.stained.add('arched', [mx + 6, y, mz], [-1, 0, 0], w, h, mos);
    ctx.stained.room([mx - 6.4, -0.5, mz - 6.4, mx + 6.4, 6, mz + 6.4]);
  }
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

/** The Bellwood trail: on from the end of the east road, winding through the forest to the
 * downs, with a sign at the start, lanterns along it, and a camp or two beside it. */
function trail(ctx, M, R) {
  const { b } = ctx;
  const dirt = M('dark_forest_gravel_path', 2.4, { overlay: true, feather: 0.9 }), verge = M('dark_forest_packed_mud', 2.6, { overlay: true, feather: 1.4 });
  const zAt = (x) => Math.sin(x * 0.045) * 2.2 + Math.sin(x * 0.11) * 0.8;
  const line = [];
  for (let x = 116; x <= REGION.x0 + 4; x += 2) line.push([x, zAt(x)]);
  b.ribbon(verge, line, 2.6, 0.018);   // (one continuous ribbon each, frayed along its sides)
  b.ribbon(dirt, line, 1.6, 0.024);
  ctx.tufts?.verge(line, 2.6, 1.4, { tint: [0.68, 0.74, 0.64] });   // (the Darkwood's: dark)
  const S = (id, x, z, s = 1, rot) => ctx.scatter.place(id, x, 0, z, s, rot);
  S('dark_forest_trail_sign', 118, 4.2, 1, Math.PI / 2);
  S('town_scatter_40_arrow_milestone', REGION.x0 - 4, 4.5, 1, Math.PI / 2);
  for (let x = 140, k = 0; x < REGION.x0; x += 26, k++) S('dark_forest_lantern_stake', x, zAt(x) + (k % 2 ? 3.4 : -3.4), 1, k % 2 ? Math.PI : 0);
  // a woodsman's camp off the trail, and a hunter's
  for (const [cx, cz, kit] of [[190, 5.2, ['dark_forest_campfire', 'dark_forest_bedroll', 'dark_forest_wooden_crate', 'dark_forest_firewood', 'town_scatter_15_axe_stump']],
    [256, -5.2, ['dark_forest_campfire', 'dark_forest_hunter_trap', 'dark_forest_raven_perch', 'dark_forest_rope_post', 'dark_forest_wooden_chest']]]) {
    kit.forEach((id, i) => S(id, cx + (i ? Math.cos(i * 1.4) * 2.2 : 0), cz + Math.sign(cz) * (i ? 1.5 + Math.sin(i * 1.4) : 0)));
  }
}

function forestRing(ctx, R, houses) {
  const { lib, bill, physics } = ctx;
  const trees = lib.sprites('tree', (s) => !s.id.startsWith('sand_'));
  const live = trees.filter((s) => !/dead|thorn|storm/.test(s.id));
  // the forest floor's own things only: plants, rocks, stumps, logs, old bones
  const scatter = lib.sprites('scatter', (s) => /^(dark_forest|town)_/.test(s.id) && /fern|bush|mushroom|bramble|reeds|sapling|shrub|flower|boulder|stump|log|roots|cairn|fieldstone|wolf_bones|deer_skull/.test(s.id));
  const species = ['oak', 'pine', 'beech', 'forest', 'mossy', 'cedar', 'elm', 'maple', 'pine', 'redwood', 'laurel'];
  const clear = (x, z) => {
    if (x > GRAVEYARD.x0 - 6 && x < GRAVEYARD.x1 + 6 && z > GRAVEYARD.z0 - 6 && z < GRAVEYARD.z1 + 8) return false;
    if (x > 12 && x < 30 && z > -126 && z < -40) return false; // the graveyard lane
    if (Math.abs(x) < 7 || Math.abs(z) < 7) return false;      // the roads out of the village
    if (DELVES.some((d) => Math.abs(x - d.x) < 13 && z > d.z - 10 && z < d.z + 14)) return false;   // a delve's clearing
    return true;
  };
  const nearHouse = (x, z) => houses.some((h) => Math.abs(x - h.x) < h.w / 2 + 6 && Math.abs(z - h.z) < h.d / 2 + 6)
    || (Math.abs(x + 56) < 19 && Math.abs(z - 44) < 19) || (x > -20 && x < 30 && z > -110 && z < -40);
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
    // Blackvigil Keep's ground stays open: what would grow there is drawn for and not planted,
    // so the rest of the forest stands as it always has
    const open = keepClear(x, z);
    if (!inVillage && count % 9 === 4 && ctx.trees3d) { // every ninth forest tree is a 3D one
      const s3 = 0.9 + R() * 0.5;
      if (!open) ctx.trees3d.add(species[(count / 9 | 0) % species.length], x, 0, z, s3);
      count++;
      continue;
    }
    const shade = 0.75 + R() * 0.35;
    if (!open) bill.add(t.id, x, 0, z, sc, shade);
    if (r < WORLD_R && !open) physics.add([x - 0.4, 0, z - 0.4], [x + 0.4, 5, z + 0.4], 'tree');
    count++;
    if (R() < 0.18 && scatter.length) {
      const s = scatter[Math.floor(R() * scatter.length)];
      const sx = x + (R() - 0.5) * 5, sz = z + (R() - 0.5) * 5;
      if (!open) bill.add(s.id, sx, 0, sz, 1, 0.8);
    }
  }
}
