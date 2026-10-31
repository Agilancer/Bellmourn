// Everything outside the village walls: the Darkwood round it, the Green Downs (Millhaven farm,
// the windmill, the hamlet by the stream) and the seven new countries, each with its own trees,
// undergrowth and stones, its own settlement or ruin, and its lairs: the places where whatever
// hunts that country will be put (ctx.biomes[key].lairs, ctx.interiors).
//
// buildWilds(ctx) first only claims ground (building pads, the paths between sites) so the land
// can be shaped round them; .build() then puts everything down once the land exists.
import * as THREE from 'three';
import { house, H } from './houses.js';
import { worldHeight, flatten, biomeAt, BIOMES, WORLD, CORE_R, fbm } from './land.js';
import { REGION, POOL, addPad, buildWater, streamAt } from './terrain.js';

function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export const SPOTS = { // named places (for the place names on screen): [x, z, r, name]
  farm: [438, 92, 48, 'Millhaven Farm'], mill: [520, 160, 26, 'The Millhaven Windmill'], hamlet: [560, 10, 70, 'Millhaven'],
  falls: [POOL.x, POOL.z, 70, 'Brightwater Falls'],
  sallow: [-60, -760, 70, 'Sallowmere'], chapel: [-210, -960, 40, 'The Drowned Chapel'],
  abbey: [880, -640, 70, 'The Abbey of Saint Ossery'], fungus: [640, -960, 45, 'The Fungal Ring'], cutters: [1060, -300, 40, "The Woodcutters' Camp"],
  khel: [-830, -160, 70, 'The Caravanserai of Khel'], bones: [-640, -420, 60, 'The Bone Field'], obelisks: [-860, -900, 50, 'The Black Obelisks'],
  barrows: [-640, 760, 120, 'The Barrows'], stones: [-420, 980, 40, 'The Nine Maidens'],
  frostwatch: [150, 860, 70, 'Frostwatch'], shrine: [-170, 720, 35, 'The Frozen Shrine'],
  crossroads: [920, 720, 60, "Hangman's Cross"], witch: [1080, 360, 40, "Mother Grawl's Hut"], grove: [700, 1020, 60, 'The Twisted Grove'],
  hermit: [-560, -620, 40, "The Hermit's Hollow"],
};

const SET = {
  leafy: ['nature/CommonTree_1', 'nature/CommonTree_2', 'nature/CommonTree_3', 'nature/CommonTree_4', 'nature/CommonTree_5', 'trees/Tree_1', 'trees/Tree_2', 'trees/Tree_3', 'trees/Tree_4', 'trees/Tree_5', 'trees/Tree_6', 'trees/Tree_7', 'trees/Tree_8', 'trees/Tree_9', 'trees/Tree_10', 'ultimate/CommonTree_1', 'ultimate/CommonTree_2', 'ultimate/CommonTree_3', 'ultimate/CommonTree_4', 'ultimate/CommonTree_5'],
  pine: ['nature/Pine_1', 'nature/Pine_2', 'nature/Pine_3', 'nature/Pine_4', 'nature/Pine_5', 'trees/Pine_1', 'trees/Pine_2', 'trees/Pine_3', 'trees/Pine_4', 'trees/Pine_5', 'ultimate/PineTree_1', 'ultimate/PineTree_2', 'ultimate/PineTree_3', 'ultimate/PineTree_4', 'ultimate/PineTree_5'],
  birch: ['trees/Birch_1', 'trees/Birch_2', 'trees/Birch_3', 'trees/Birch_4', 'trees/Birch_5', 'trees/Birch_6', 'trees/Birch_7', 'trees/Birch_8', 'trees/Birch_9', 'trees/Birch_10', 'ultimate/BirchTree_1', 'ultimate/BirchTree_2', 'ultimate/BirchTree_3', 'ultimate/BirchTree_4', 'ultimate/BirchTree_5'],
  autumn: ['ultimate/CommonTree_Autumn_1', 'ultimate/CommonTree_Autumn_2', 'ultimate/CommonTree_Autumn_3', 'ultimate/CommonTree_Autumn_4', 'ultimate/CommonTree_Autumn_5', 'ultimate/BirchTree_Autumn_1', 'ultimate/BirchTree_Autumn_2', 'ultimate/BirchTree_Autumn_3', 'ultimate/BirchTree_Autumn_4', 'ultimate/BirchTree_Autumn_5', 'ultimate/PineTree_Autumn_1', 'ultimate/PineTree_Autumn_2', 'ultimate/PineTree_Autumn_3', 'ultimate/PineTree_Autumn_4', 'ultimate/PineTree_Autumn_5', 'ultimate/Willow_Autumn_1', 'ultimate/Willow_Autumn_2', 'ultimate/Willow_Autumn_3', 'ultimate/Willow_Autumn_4', 'ultimate/Willow_Autumn_5'],
  snowy: ['ultimate/CommonTree_Snow_1', 'ultimate/CommonTree_Snow_2', 'ultimate/CommonTree_Snow_3', 'ultimate/CommonTree_Snow_4', 'ultimate/CommonTree_Snow_5', 'ultimate/PineTree_Snow_1', 'ultimate/PineTree_Snow_2', 'ultimate/PineTree_Snow_3', 'ultimate/PineTree_Snow_4', 'ultimate/PineTree_Snow_5', 'ultimate/BirchTree_Snow_1', 'ultimate/BirchTree_Snow_2', 'ultimate/BirchTree_Snow_3', 'ultimate/BirchTree_Snow_4', 'ultimate/BirchTree_Snow_5', 'ultimate/Willow_Snow_1', 'ultimate/Willow_Snow_2', 'ultimate/Willow_Snow_3', 'ultimate/Willow_Snow_4', 'ultimate/Willow_Snow_5'],
  snowdead: ['ultimate/CommonTree_Dead_Snow_1', 'ultimate/CommonTree_Dead_Snow_2', 'ultimate/CommonTree_Dead_Snow_3', 'ultimate/CommonTree_Dead_Snow_4', 'ultimate/CommonTree_Dead_Snow_5', 'ultimate/BirchTree_Dead_Snow_1', 'ultimate/BirchTree_Dead_Snow_2', 'ultimate/BirchTree_Dead_Snow_3', 'ultimate/BirchTree_Dead_Snow_4', 'ultimate/BirchTree_Dead_Snow_5', 'ultimate/Willow_Dead_Snow_1', 'ultimate/Willow_Dead_Snow_2', 'ultimate/Willow_Dead_Snow_3', 'ultimate/Willow_Dead_Snow_4', 'ultimate/Willow_Dead_Snow_5'],
  dead: ['nature/DeadTree_1', 'nature/DeadTree_2', 'nature/DeadTree_3', 'nature/DeadTree_4', 'nature/DeadTree_5', 'trees/DeadTree_1', 'trees/DeadTree_2', 'trees/DeadTree_3', 'trees/DeadTree_4', 'trees/DeadTree_5', 'trees/DeadTree_6', 'trees/DeadTree_7', 'trees/DeadTree_8', 'trees/DeadTree_9', 'trees/DeadTree_10', 'trees/DeadBirch_1', 'trees/DeadBirch_2', 'trees/DeadBirch_3', 'trees/DeadBirch_4', 'trees/DeadBirch_5', 'trees/DeadBirch_6', 'trees/DeadBirch_7', 'trees/DeadBirch_8', 'trees/DeadBirch_9', 'trees/DeadBirch_10', 'ultimate/CommonTree_Dead_1', 'ultimate/CommonTree_Dead_2', 'ultimate/CommonTree_Dead_3', 'ultimate/CommonTree_Dead_4', 'ultimate/CommonTree_Dead_5', 'ultimate/BirchTree_Dead_1', 'ultimate/BirchTree_Dead_2', 'ultimate/BirchTree_Dead_3', 'ultimate/BirchTree_Dead_4', 'ultimate/BirchTree_Dead_5'],
  bare: ['nature/CommonTree_1~bare', 'nature/CommonTree_2~bare', 'nature/CommonTree_3~bare', 'nature/CommonTree_4~bare', 'nature/CommonTree_5~bare', 'trees/Tree_1~bare', 'trees/Tree_2~bare', 'trees/Tree_3~bare', 'trees/Tree_4~bare', 'trees/Tree_5~bare', 'trees/Tree_6~bare', 'trees/Tree_7~bare', 'trees/Tree_8~bare', 'trees/Tree_9~bare', 'trees/Tree_10~bare', 'trees/Birch_1~bare', 'trees/Birch_2~bare', 'trees/Birch_3~bare', 'trees/Birch_4~bare', 'trees/Birch_5~bare', 'trees/Birch_6~bare', 'trees/Birch_7~bare', 'trees/Birch_8~bare', 'trees/Birch_9~bare', 'trees/Birch_10~bare'],
  twisted: ['nature/TwistedTree_1', 'nature/TwistedTree_2', 'nature/TwistedTree_3', 'nature/TwistedTree_4', 'nature/TwistedTree_5'],
  willow: ['ultimate/Willow_1', 'ultimate/Willow_2', 'ultimate/Willow_3', 'ultimate/Willow_4', 'ultimate/Willow_5', 'ultimate/Willow_Dead_1', 'ultimate/Willow_Dead_2', 'ultimate/Willow_Dead_3', 'ultimate/Willow_Dead_4', 'ultimate/Willow_Dead_5'],
  palm: ['ultimate/PalmTree_1', 'ultimate/PalmTree_2', 'ultimate/PalmTree_3', 'ultimate/PalmTree_4'],
  cactus: ['ultimate/Cactus_1', 'ultimate/Cactus_2', 'ultimate/Cactus_3', 'ultimate/Cactus_4', 'ultimate/Cactus_5', 'ultimate/CactusFlower_1', 'ultimate/CactusFlowers_2', 'ultimate/CactusFlowers_3', 'ultimate/CactusFlowers_4', 'ultimate/CactusFlowers_5'],
  bush: ['nature/Bush_Common', 'nature/Bush_Common_Flowers', 'ultimate/Bush_1', 'ultimate/Bush_2', 'ultimate/BushBerries_1', 'ultimate/BushBerries_2'],
  snowbush: ['ultimate/Bush_Snow_1', 'ultimate/Bush_Snow_2'],
  under: ['nature/Fern_1', 'nature/Plant_1', 'nature/Plant_1_Big', 'nature/Plant_7', 'nature/Plant_7_Big', 'nature/Clover_1', 'nature/Clover_2', 'ultimate/Plant_1', 'ultimate/Plant_2', 'ultimate/Plant_3', 'ultimate/Plant_4', 'ultimate/Plant_5', 'nature/Mushroom_Common', 'nature/Mushroom_Laetiporus'],
  grass: ['nature/Grass_Common_Short', 'nature/Grass_Common_Tall', 'nature/Grass_Wispy_Short', 'nature/Grass_Wispy_Tall', 'ultimate/Grass', 'ultimate/Grass_2', 'ultimate/Grass_Short'],
  flowers: ['nature/Flower_3_Group', 'nature/Flower_3_Single', 'nature/Flower_4_Group', 'nature/Flower_4_Single', 'ultimate/Flowers', 'nature/Petal_1', 'nature/Petal_2', 'nature/Petal_3', 'nature/Petal_4', 'nature/Petal_5'],
  rock: ['nature/Rock_Medium_1', 'nature/Rock_Medium_2', 'nature/Rock_Medium_3', 'ultimate/Rock_1', 'ultimate/Rock_2', 'ultimate/Rock_3', 'ultimate/Rock_4', 'ultimate/Rock_5', 'ultimate/Rock_6', 'ultimate/Rock_7'],
  mossrock: ['ultimate/Rock_Moss_1', 'ultimate/Rock_Moss_2', 'ultimate/Rock_Moss_3', 'ultimate/Rock_Moss_4', 'ultimate/Rock_Moss_5', 'ultimate/Rock_Moss_6', 'ultimate/Rock_Moss_7'],
  snowrock: ['ultimate/Rock_Snow_1', 'ultimate/Rock_Snow_2', 'ultimate/Rock_Snow_3', 'ultimate/Rock_Snow_4', 'ultimate/Rock_Snow_5', 'ultimate/Rock_Snow_6', 'ultimate/Rock_Snow_7'],
  pebble: ['nature/Pebble_Round_1', 'nature/Pebble_Round_2', 'nature/Pebble_Round_3', 'nature/Pebble_Round_4', 'nature/Pebble_Round_5', 'nature/Pebble_Square_1', 'nature/Pebble_Square_2', 'nature/Pebble_Square_3', 'nature/Pebble_Square_4', 'nature/Pebble_Square_5', 'nature/Pebble_Square_6'],
  log: ['ultimate/WoodLog', 'ultimate/WoodLog_Moss', 'ultimate/TreeStump', 'ultimate/TreeStump_Moss'],
  snowlog: ['ultimate/WoodLog_Snow', 'ultimate/TreeStump_Snow'],
  crop: ['ultimate/Wheat', 'ultimate/Corn_1', 'ultimate/Corn_2'],
};

// what grows in each country: [set, chance per cell, scale range, variant(s)]
const FLORA = {
  core: { trees: [['leafy', 0.42, [0.85, 1.35], ['', 'blight', 'blight', 'light']], ['pine', 0.3, [0.8, 1.3]], ['birch', 0.08, [0.8, 1.2], ['', 'dead']], ['dead', 0.1, [0.8, 1.2]], ['bare', 0.1, [0.8, 1.2]]], density: 0.36,
    ground: [['under', 0.35], ['bush', 0.18], ['grass', 0.25], ['flowers', 0.06], ['log', 0.06], ['mossrock', 0.05], ['rock', 0.05]], gdens: 0.26 },
  deepwood: { trees: [['pine', 0.45, [0.9, 1.5], ['', 'rust']], ['leafy', 0.3, [1.0, 1.5], ['blight', '']], ['twisted', 0.05, [0.7, 1.0]], ['dead', 0.1, [1, 1.4]], ['bare', 0.1, [1, 1.3]]], density: 0.42,
    ground: [['under', 0.4], ['mossrock', 0.1], ['log', 0.12], ['bush', 0.2], ['grass', 0.18]], gdens: 0.22 },
  downs: { trees: [['leafy', 0.5, [1.0, 1.4]], ['pine', 0.3, [0.9, 1.3]], ['birch', 0.2, [0.9, 1.2]]], density: 0.025,
    ground: [['grass', 0.45], ['flowers', 0.2], ['rock', 0.1], ['bush', 0.15], ['pebble', 0.1]], gdens: 0.12 },
  fen: { trees: [['willow', 0.55, [0.9, 1.3]], ['dead', 0.25, [0.8, 1.2]], ['birch', 0.2, [0.8, 1.1], ['', 'dead']]], density: 0.08,
    ground: [['grass', 0.55], ['under', 0.2], ['log', 0.1], ['mossrock', 0.1], ['flowers', 0.05]], gdens: 0.28 },
  rustwood: { trees: [['autumn', 0.55, [0.9, 1.4]], ['leafy', 0.25, [1.0, 1.4], ['rust', 'ember', 'orange', 'red', 'darkred']], ['pine', 0.12, [0.9, 1.3], ['rust', 'red']], ['bare', 0.08, [0.9, 1.3]]], density: 0.38,
    ground: [['under', 0.35], ['log', 0.12], ['mossrock', 0.1], ['bush', 0.18], ['flowers', 0.08], ['grass', 0.17]], gdens: 0.2 },
  ashen: { trees: [['cactus', 0.55, [0.8, 1.6]], ['palm', 0.2, [0.9, 1.3]], ['dead', 0.25, [0.7, 1.1]]], density: 0.05,
    ground: [['rock', 0.4], ['pebble', 0.3], ['grass', 0.15], ['under', 0.15]], gdens: 0.07 },
  barrow: { trees: [['dead', 0.4, [0.8, 1.2]], ['birch', 0.3, [0.8, 1.1], ['', 'dead']], ['pine', 0.3, [0.8, 1.2]]], density: 0.035,
    ground: [['grass', 0.45], ['rock', 0.2], ['mossrock', 0.15], ['flowers', 0.1], ['bush', 0.1]], gdens: 0.16 },
  rimeholt: { trees: [['snowy', 0.6, [0.9, 1.4]], ['snowdead', 0.2, [0.9, 1.3]], ['pine', 0.2, [0.9, 1.4], ['frost']]], density: 0.2,
    ground: [['snowrock', 0.45], ['snowbush', 0.3], ['snowlog', 0.25]], gdens: 0.07 },
  gallows: { trees: [['dead', 0.45, [0.9, 1.4]], ['bare', 0.3, [1, 1.4]], ['twisted', 0.1, [0.6, 0.9]], ['willow', 0.15, [0.9, 1.2]]], density: 0.22,
    ground: [['under', 0.3], ['rock', 0.2], ['log', 0.2], ['grass', 0.2], ['bush', 0.1]], gdens: 0.12 },
};

export function buildWilds(ctx, { planOnly = true } = {}) {
  const R = rng(5150);
  const paths = [];
  const keepOut = []; // [x, z, r]: no trees here
  // ---------------------------------------------------------------- claim the ground
  // the downs (terrain.js pads)
  const farm = { x: 430, z: 80 }, barn = { x: 458, z: 108 }, mill = { x: 520, z: 160 };
  farm.y = addPad(farm.x, farm.z, 12); barn.y = addPad(barn.x, barn.z, 12); mill.y = addPad(mill.x, mill.z, 7);
  const homes = [{ x: 560, z: 70, title: 'Brookside Cottage' }, { x: 606, z: -10, title: "The Miller's House" }, { x: 540, z: -44, title: "The Shepherd's Lodge" }, { x: 498, z: -90, title: "The Weaver's House" }];
  for (const h of homes) h.y = addPad(h.x, h.z, 8);
  const fields = [[392, 118, 34, 22], [402, 156, 30, 22], [470, 150, 26, 18]].map(([x, z, w, d]) => ({ x, z, w, d, y: addPad(x, z, Math.max(w, d) * 0.62) }));
  // (each to a door, or past a house, never through one)
  paths.push({ pts: [[REGION.x0 - 2, 0], [330, 6], [370, 26], [404, 52], [430, 68]], w: 1.8, layer: 'gravel' },
    { pts: [[430, 68], [470, 72], [520, 76], [556, 78], [560, 78]], w: 1.6, layer: 'mud' },
    { pts: [[440, 92], [444, 116], [470, 130], [500, 146], [516, 156]], w: 1.4, layer: 'mud' },     // west of the barn
    { pts: [[560, 78], [586, 52], [592, 30], [596, 8], [598, -16]], w: 1.6, layer: 'mud' },           // to the miller's door
    { pts: [[592, 30], [572, 4], [548, -34], [552, -48], [520, -62], [504, -82], [498, -83]], w: 1.4, layer: 'mud' }, // round the lodge, to the weaver's door
    { pts: [[598, -16], [640, -24], [672, -34], [684, -36]], w: 1.4, layer: 'gravel' });
  keepOut.push([farm.x, farm.z, 18], [barn.x, barn.z, 18], [mill.x, mill.z, 12], ...homes.map((h) => [h.x, h.z, 12]), ...fields.map((f) => [f.x, f.z, Math.max(f.w, f.d) * 0.62]),
    [POOL.x + 20, POOL.z, 60]);
  // the new countries' settlements
  const site = (key, extra = 0) => { const [x, z, r] = SPOTS[key]; const y = flatten(x, z, r * 0.55 + extra); keepOut.push([x, z, r * 0.7]); return { x, z, r, y }; };
  const S = {
    sallow: site('sallow'), chapel: site('chapel'), abbey: site('abbey'), fungus: { x: SPOTS.fungus[0], z: SPOTS.fungus[1] }, cutters: site('cutters'),
    khel: site('khel'), bones: { x: SPOTS.bones[0], z: SPOTS.bones[1] }, obelisks: site('obelisks'), stones: site('stones'),
    frostwatch: site('frostwatch'), shrine: site('shrine'), crossroads: site('crossroads'), witch: site('witch'), hermit: site('hermit'),
  };
  const barrows = [[-700, 700], [-610, 790], [-540, 690], [-720, 850], [-600, 900]].map(([x, z]) => ({ x, z, y: flatten(x, z, 9) }));
  keepOut.push(...barrows.map((b) => [b.x, b.z, 14]));
  // where a path leaves a site: by its gate or door (and round whatever is in the way), not out
  // of its middle, where the houses stand
  const EXIT = {
    sallow: [[-86, -756]],                                   // the foot of the boardwalk's west steps
    chapel: [[-210, -951], [-210, -946]],
    abbey: { cutters: [[880, -628], [880, -600]], fungus: [[880, -628], [866, -628]] }, // clear of the cloister
    cutters: [[1059, -306]],
    khel: [[-806, -160]],                                    // the east gate
    frostwatch: [[150, 846], [150, 836], [130, 830]],        // the north gate
    shrine: [[-169, 727]],
    witch: [[1080, 354], [1072, 354]],
    hermit: [[-566, -619], [-566, -612]],
  };
  const exitOf = (a, b) => { const e = EXIT[a]; return (e && (Array.isArray(e) ? e : e[b])) || [[SPOTS[a][0], SPOTS[a][1]]]; };
  for (const [a, b] of [['sallow', 'chapel'], ['abbey', 'cutters'], ['khel', 'bones'], ['khel', 'obelisks'], ['frostwatch', 'shrine'], ['crossroads', 'witch'], ['crossroads', 'grove'], ['hermit', 'bones'], ['abbey', 'fungus']])
    paths.push({ pts: [...exitOf(a, b), [(SPOTS[a][0] + SPOTS[b][0]) / 2 + 30, (SPOTS[a][1] + SPOTS[b][1]) / 2 - 20], ...exitOf(b, a).slice().reverse()], w: 1.6, layer: 'mud' });

  const out = { paths, keepOut };
  out.build = () => {
    const { kit } = ctx;
    const Hh = (x, z) => worldHeight(x, z);
    // nothing solid is set down in the middle of a road or path (unless it's `road`: a wall the
    // road comes in at a gate of)
    const onPath = pathDistance(ctx.paths || paths);
    const P = (id, x, z, rot = 0, s = 1, o = {}) => {
      const f = o.solid !== false && !o.road && kit.footprint(id, x, z, rot, s);
      if (f && onPath((f[0] + f[2]) / 2, (f[1] + f[3]) / 2, Math.hypot(f[2] - f[0], f[3] - f[1]) / 2, 0.6, 0.2) < 0) return null;
      return kit.place(id, x, o.y ?? Hh(x, z) + (o.dy || 0), z, rot, s, o);
    };
    const lair = (biome, x, z, r, kind, extra = {}) => { (ctx.biomes[biome] ||= { name: BIOMES[biome]?.name || biome, lairs: [] }).lairs.push({ x, z, y: Hh(x, z), r, kind, ...extra }); };
    const interior = (zone, biome) => { ctx.zones.push(zone); ctx.interiors.push({ ...zone, biome }); return zone; };
    // ---------------------------------------------------------------- the downs
    ctx.water = buildWater(ctx, ctx.kit);
    interior(house(ctx, { name: 'farmhouse', title: 'Millhaven Farmhouse', x: farm.x, z: farm.z, y: farm.y, w: 4, d: 6, rot: 0, storeys: 2, door: 'x', furnish: 'home', porch: true, dormers: 2, roofVariant: 'moss' }), 'downs');
    interior(house(ctx, { name: 'barn', title: 'Millhaven Barn', x: barn.x, z: barn.z, y: barn.y, w: 4, d: 7, rot: 1, storeys: 1, open: true, door: 'z', furnish: 'stable', roofVariant: 'rust', plaster: 'ochre' }), 'downs');
    // the windmill: a round of brick, three storeys, its sails of crossed roof logs
    interior(house(ctx, { name: 'mill', title: 'The Millhaven Windmill', x: mill.x, z: mill.z, y: mill.y, w: 2, d: 2, rot: 0, storeys: 3, style: 'brick', door: 'z', chimney: false, furnish: [['props/Bag', 4], ['props/Barrel', 2], ['props/Crate_Wooden', 2]] }), 'downs');
    kit.place('village/Roof_Tower_RoundTiles', mill.x, mill.y + 3 * H, mill.z, 0, [0.9, 0.9, 0.9], { variant: 'rust' });
    for (let k = 0; k < 4; k++) kit.place('village/Roof_Log', mill.x, mill.y + 3 * H + 1.2, mill.z + 2.6, 0, [0.35, 0.55, 0.55], { tilt: [Math.PI / 2, k * Math.PI / 2 + 0.3], solid: false });
    homes.forEach((h, i) => interior(house(ctx, { name: 'home', title: h.title, x: h.x, z: h.z, y: h.y, w: [2, 3, 2, 3][i], d: [3, 4, 4, 3][i], rot: i, storeys: i % 2 + 1, door: 'x', furnish: 'home', style: i === 1 ? 'brick' : 'plaster', plaster: ['', 'ash', 'ochre', ''][i], vines: 2, porch: i === 2 }), 'downs'));
    fields.forEach((f, fi) => { // rows of blighted wheat and corn, a scarecrow, a fence
      const crop = SET.crop[fi % 3];
      for (let x = f.x - f.w / 2 + 1; x < f.x + f.w / 2; x += 1.6) for (let z = f.z - f.d / 2 + 1; z < f.z + f.d / 2; z += 1.4)
        P(crop, x + (R() - 0.5) * 0.4, z, R() * 6, 0.9 + R() * 0.3, { solid: false, cull: 90 });
      P('bellmourn/scarecrow', f.x, f.z, R() * 6);
      const x0 = f.x - f.w / 2 - 1, x1 = f.x + f.w / 2 + 1, z0 = f.z - f.d / 2 - 1, z1 = f.z + f.d / 2 + 1;
      for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1]]) {
        const n = Math.round(Math.hypot(bx - ax, bz - az) / 2), a = Math.atan2(-(bz - az), bx - ax);
        for (let k = 0; k < n; k++) { if (R() < 0.15) continue; const x = ax + (bx - ax) * (k + 0.5) / n, z = az + (bz - az) * (k + 0.5) / n; P(k % 5 ? 'village/Prop_WoodenFence_Extension2' : 'village/Prop_WoodenFence_Single', x, z, a, 1, { tag: 'fence' }); }
      }
    });
    for (const [x, z] of [[452, 100], [453.5, 102], [462, 114], [463, 117]]) P('bellmourn/haystack', x, z, R() * 6);
    P('village/Prop_Wagon', 436, 124, 1.2); P('bellmourn/well', 444, 88, 0, 1.0); P('bellmourn/woodpile', 420, 74, 1.4);
    P('props/Stall_Cart_Empty', 580, 68, 2.2); P('bellmourn/lamp_post', 556, 82, 0); P('bellmourn/lamp_post', 600, -4, 1.5);
    lair('downs', 470, 40, 40, 'field'); lair('downs', 620, 120, 50, 'hills'); lair('downs', 400, -120, 50, 'hills'); lair('downs', 660, -200, 40, 'cliffs');
    // ---------------------------------------------------------------- the Weeping Fen
    const fenWater = -0.45;
    { // the black water over the fen's hollows
      const g = new THREE.PlaneGeometry(1300, 900, 1, 1);
      const m = new THREE.MeshPhongMaterial({ color: 0x1c2b26, specular: 0x6a7a70, shininess: 120, transparent: true, opacity: 0.82, depthWrite: false });
      if (ctx.water?.pool?.material?.normalMap) { m.normalMap = ctx.water.pool.material.normalMap; m.normalScale.set(0.4, 0.4); }
      const w = new THREE.Mesh(g, m);
      w.rotation.x = -Math.PI / 2; w.position.set(-40, fenWater, -820); w.receiveShadow = true;
      ctx.scene.add(w);
      ctx.fenWater = { y: fenWater, x0: -690, x1: 610, z0: -1270, z1: -370 };
    }
    { // Sallowmere: houses on stilts round a boardwalk
      const { x, z, y } = S.sallow;
      const deck = Math.max(y, fenWater) + 1.4;
      [[0, 0, 0], [16, 8, 1], [-14, 12, 3], [4, -18, 2]].forEach(([dx, dz, rot], i) => {
        const hx = x + dx, hz = z + dz;
        for (const [sx, sz] of [[-2.6, -3.6], [2.6, -3.6], [-2.6, 3.6], [2.6, 3.6]]) P('village/Corner_Exterior_Wood', hx + sx, hz + sz, 0, [1, 0.6, 1], { y: deck - 1.9 });
        interior(house(ctx, { name: 'stilt', title: ['The Eelwife\'s House', 'The Reed-Cutter\'s', 'The Drowned Man\'s House', 'Sallowmere Hall'][i], x: hx, z: hz, y: deck, w: 2, d: 3, rot, storeys: 1, door: 'x', furnish: i === 3 ? 'hall' : 'home', roofVariant: 'moss', plaster: 'ash', vines: 3, ruin: i === 2 }), 'fen');
      });
      for (let k = -10; k <= 10; k++) { P('village/Floor_WoodDark', x + k * 2, z + 4, 0, 1, { y: deck - 0.02, solid: false }); ctx.physics.add([x + k * 2 - 1, deck - 0.3, z + 3], [x + k * 2 + 1, deck, z + 5], 'floor'); }
      // plank walks from every door to the boardwalk (from the door out, then round to it)
      const plank = (pts) => {
        for (let n = 0; n + 1 < pts.length; n++) {
          const [ax, az] = pts[n], [bx, bz] = pts[n + 1], len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(len / 2));
          for (let k = 0; k <= steps; k++) {
            const px = ax + (bx - ax) * k / steps, pz = az + (bz - az) * k / steps;
            P('village/Floor_WoodDark', px, pz, 0, 1, { y: deck - 0.02, solid: false });
            ctx.physics.add([px - 1, deck - 0.3, pz - 1], [px + 1, deck, pz + 1], 'floor');
          }
          P('village/Corner_Exterior_Wood', bx, bz, 0, [1, 0.6, 1], { y: deck - 1.9, solid: false });
        }
      };
      plank([[x + 2.2, z], [x + 3.6, z], [x + 3.6, z + 3.2]]);
      plank([[x + 16, z + 5.9], [x + 16, z + 4.5]]);
      plank([[x - 14, z + 14.1], [x - 14, z + 15.6], [x - 9.4, z + 15.6], [x - 9.4, z + 4.5]]);
      plank([[x + 1.8, z - 18], [x - 4, z - 18], [x - 4, z + 3.2]]);
      // and a flight of steps down to the ground at either end
      const tread = kit.surface('village_woodtrim', 2);
      for (const [sx, dir] of [[-1, '-x'], [1, '+x']]) ctx.b.stairs(x + sx * 21, z + 4, deck, Math.min(-0.5, Hh(x + sx * 23, z + 4) - deck), 2, dir, tread, { step: 0.25, run: 0.36 });
      for (let k = 0; k < 8; k++) P(SET.willow[k % SET.willow.length], x + Math.cos(k) * 40, z + Math.sin(k) * 40, k, 1.1, { solid: 'trunk' });
      lair('fen', x, z + 30, 30, 'hamlet'); lair('fen', x - 120, z + 80, 60, 'marsh'); lair('fen', x + 180, z - 40, 60, 'marsh');
    }
    { // the drowned chapel: a ruined church sunk to its sills
      const { x, z, y } = S.chapel;
      interior(house(ctx, { name: 'chapel', title: 'The Drowned Chapel', x, z, y: y - 0.6, w: 3, d: 6, rot: 0, storeys: 2, style: 'brick', door: 'z', ruin: true, furnish: 'shrine' }), 'fen');
      for (let k = 0; k < 6; k++) P(k % 2 ? 'dungeon/Column~broken' : 'dungeon/Column2~broken', x - 8 + (k % 2) * 16, z - 8 + Math.floor(k / 2) * 8, R(), 1);
      lair('fen', x, z, 25, 'ruin');
    }
    // ---------------------------------------------------------------- the Rustwood
    { const { x, z, y } = S.abbey; // the abbey: a ruined church, a cloister of broken walls
      interior(house(ctx, { name: 'abbey', title: 'The Abbey Church of Saint Ossery', x, z, y, w: 4, d: 7, rot: 0, storeys: 2, style: 'brick', door: 'z', ruin: true, furnish: 'shrine', roofVariant: 'moss' }), 'rustwood');
      for (const [dx, dz, rot] of [[16, -4, 1], [16, 10, 1]]) interior(house(ctx, { name: 'cell', title: "The Monks' Cells", x: x + dx, z: z + dz, y, w: 2, d: 3, rot, storeys: 1, style: 'brick', door: 'x', ruin: R() < 0.5, furnish: 'home' }), 'rustwood');
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; P(k % 3 ? 'village/Wall_UnevenBrick_Straight~ruin' : 'village/Wall_UnevenBrick_Window_Thin_Round~ruin', x + 20 + Math.cos(a) * 14, z + 22 + Math.sin(a) * 10, -a + Math.PI / 2, 1, { solid: true }); }
      for (let k = 0; k < 8; k++) P(k % 2 ? 'dungeon/Column' : 'dungeon/Column2~broken', x + 20 + Math.cos(k * 0.8) * 7, z + 22 + Math.sin(k * 0.8) * 5, 0, 1);
      P('dungeon/Statue_Horse', x + 20, z + 22, 1.2, 0.9);
      lair('rustwood', x, z, 30, 'ruin'); lair('rustwood', x + 20, z + 22, 16, 'cloister');
    }
    { const { x, z } = S.fungus; // a ring of giant fungus
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; P(k % 2 ? 'nature/Mushroom_Laetiporus' : 'nature/Mushroom_Common', x + Math.cos(a) * 16, z + Math.sin(a) * 16, a, 4 + R() * 3, { solid: true }); }
      lair('rustwood', x, z, 16, 'ring');
    }
    { const { x, z, y } = S.cutters; // the woodcutters' camp: a hut, logs, a fire
      interior(house(ctx, { name: 'hut', title: "The Woodcutters' Hut", x, z, y, w: 2, d: 2, rot: 2, storeys: 1, door: 'z', furnish: 'home', roofVariant: 'rust' }), 'rustwood');
      P('dungeon/Woodfire', x + 6, z, 0); for (let k = 0; k < 5; k++) P(k % 2 ? 'bellmourn/woodpile' : 'ultimate/TreeStump', x + 8 + Math.cos(k) * 4, z + Math.sin(k) * 4, k);
      P('props/Anvil_Log', x + 5, z + 4, 0.6); P('props/Pickaxe_Bronze', x + 5, z + 4.2, 0.2, 1, { dy: 0.5, solid: false });
      lair('rustwood', x, z, 25, 'camp');
    }
    // ---------------------------------------------------------------- the Ashen Waste
    { const { x, z, y } = S.khel; // the caravanserai: a walled square, its houses fallen in
      for (let k = -9; k <= 9; k++) for (const [ax, az, rot] of [[k * 2, -20, Math.PI], [k * 2, 20, 0], [-20, k * 2, -Math.PI / 2], [20, k * 2, Math.PI / 2]]) {
        if ((rot === 0 || rot === Math.PI / 2) && Math.abs(k) < 2) continue; // the gates, south and east (where the roads come in)
        P(R() < 0.4 ? 'village/Wall_UnevenBrick_Straight~ruin' : 'village/Wall_UnevenBrick_Straight', x + ax, z + az, rot, 1, { y, variant: 'bone', solid: true });
      }
      P('dungeon/Arch', x, z + 20.2, 0, [1, 1, 1], { y, solid: false });
      P('dungeon/Arch', x + 20.2, z, Math.PI / 2, [1, 1, 1], { y, solid: false });
      [[-12, -12, 0], [12, -12, 0], [-12, 10, 2]].forEach(([dx, dz, rot], i) => interior(house(ctx, { name: 'serai', title: ['The Spice Hall', 'The Camel House', 'The Well-House'][i], x: x + dx, z: z + dz, y, w: 3, d: 3, rot, storeys: 1, style: 'brick', door: 'z', holed: true, plaster: 'ochre', furnish: i === 0 ? 'store' : 'ruin', roofVariant: 'rust' }), 'ashen'));
      P('bellmourn/well', x + 6, z + 6, 0, 1, { y });
      for (let k = 0; k < 6; k++) P(SET.palm[k % 4], x + Math.cos(k) * 9, z + Math.sin(k) * 9, k, 1, { y, solid: 'trunk' });
      lair('ashen', x, z, 22, 'ruin'); lair('ashen', x + 80, z - 60, 60, 'mesa'); lair('ashen', x - 60, z + 160, 60, 'canyon');
    }
    { const { x, z } = S.bones;
      for (let k = 0; k < 40; k++) { const a = R() * Math.PI * 2, r = R() * 50; P(k % 4 ? 'bellmourn/bone_heap' : 'bellmourn/skull_pike', x + Math.cos(a) * r, z + Math.sin(a) * r, R() * 6, 0.8 + R() * 0.6); }
      lair('ashen', x, z, 45, 'bones');
    }
    { const { x, z, y } = S.obelisks;
      for (let k = 0; k < 9; k++) { const a = (k + 0.5) / 9 * Math.PI * 2; P(k % 3 ? 'dungeon/Column2' : 'dungeon/Column~broken', x + Math.cos(a) * 14, z + Math.sin(a) * 14, a, [1.2, 2.2, 1.2], { y }); } // (the road comes in between two)
      P('dungeon/Pedestal', x, z, 0, 1.2, { y }); P('bellmourn/brazier', x, z, 0, 1.2, { y: y + 2.6 });
      lair('ashen', x, z, 20, 'altar');
    }
    // ---------------------------------------------------------------- the Barrow Moor
    barrows.forEach((b, i) => { // a barrow: a mound with a stone door into it
      const y = b.y;
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; P(SET.mossrock[k % 7], b.x + Math.cos(a) * 7, b.z + Math.sin(a) * 7, a, 1.6 + R(), { y: y + 0.3 }); }
      for (let k = 0; k < 4; k++) P(SET.mossrock[(k + i) % 7], b.x + (R() - 0.5) * 6, b.z + (R() - 0.5) * 6, R() * 6, [3.5, 1.8, 3.5], { y: y - 0.2 });
      P('dungeon/Arch', b.x, b.z + 7.5, 0, 0.75, { y, solid: false }); P('dungeon/Arch_Door', b.x, b.z + 7.4, 0, 0.75, { y });
      P('dungeon/Decorative_Wall', b.x - 2.4, b.z + 7.6, 0, 1, { y: y + 0.8 }); P('dungeon/Decorative_Wall', b.x + 2.4, b.z + 7.6, 0, 1, { y: y + 0.8 });
      lair('barrow', b.x, b.z + 12, 10, 'barrow', { door: [b.x, y, b.z + 7.5] });
    });
    { const { x, z, y } = S.stones;
      for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; P(SET.rock[k % SET.rock.length], x + Math.cos(a) * 12, z + Math.sin(a) * 12, a, [1.1, 3.2, 1.1], { y }); }
      P('bellmourn/shrine', x, z, 0, 1, { y });
      lair('barrow', x, z, 14, 'stones');
    }
    // ---------------------------------------------------------------- the Rimeholt Fells
    { const { x, z, y } = S.frostwatch; // the fort: a curtain wall, corner towers, the keep
      // gates north (the road from Bellmourn) and south; the wall stops at the towers, whose doors
      // open on the courtyard
      for (let k = -8; k <= 8; k++) {
        const u = Math.abs(k) === 8 ? Math.sign(k) * 15.5 : k * 2, sc = Math.abs(k) === 8 ? [0.5, 1, 1] : 1; // half a module up to each tower
        for (const [ax, az, rot] of [[u, -18, Math.PI], [u, 18, 0], [-18, u, -Math.PI / 2], [18, u, Math.PI / 2]]) {
          if ((rot === 0 || rot === Math.PI) && Math.abs(k) < 2) continue;
          for (let t = 0; t < 2; t++) P(t ? 'village/Wall_UnevenBrick_Window_Thin_Round' : 'village/Wall_UnevenBrick_Straight', x + ax, z + az, rot, sc, { y: y + t * H, solid: !t, variant: 'moss', road: true });
        }
      }
      for (const [x0, x1] of [[-16, -3], [3, 16]]) ctx.physics.add([x + x0, y, z - 18.4], [x + x1, y + 2 * H, z - 17.6], 'wall');
      ctx.physics.add([x - 18.4, y, z - 16], [x - 17.6, y + 2 * H, z + 16], 'wall');
      ctx.physics.add([x + 17.6, y, z - 16], [x + 18.4, y + 2 * H, z + 16], 'wall');
      P('dungeon/Arch_bars', x, z + 18, 0, [1.2, 1.4, 1], { y, solid: false });
      P('dungeon/Arch_bars', x, z - 18, Math.PI, [1.2, 1.4, 1], { y, solid: false });
      for (const [dx, dz, rot] of [[-18, -18, 0], [18, -18, 3], [-18, 18, 1], [18, 18, 2]]) {
        interior(house(ctx, { name: 'tower', title: 'A Frostwatch Tower', x: x + dx, z: z + dz, y, w: 2, d: 2, rot, storeys: 3, style: 'brick', door: 'z', chimney: false, furnish: 'barracks' }), 'rimeholt');
        P('village/Roof_Tower_RoundTiles', x + dx, z + dz, 0, 1, { y: y + 3 * H, variant: 'lead' });
      }
      interior(house(ctx, { name: 'keep', title: 'The Keep of Frostwatch', x, z: z - 4, y, w: 4, d: 5, rot: 0, storeys: 2, style: 'brick', door: 'z', furnish: 'hall', roofVariant: 'lead', balcony: 'cross' }), 'rimeholt');
      lair('rimeholt', x, z, 16, 'fort'); lair('rimeholt', x + 140, z + 120, 70, 'peaks'); lair('rimeholt', x - 200, z + 60, 70, 'snowfield');
    }
    { const { x, z, y } = S.shrine;
      interior(house(ctx, { name: 'shrine', title: 'The Frozen Shrine', x, z, y, w: 2, d: 3, rot: 0, storeys: 1, style: 'brick', door: 'z', furnish: 'shrine', roofVariant: 'lead', chimney: false }), 'rimeholt');
      lair('rimeholt', x, z + 14, 16, 'shrine');
    }
    // ---------------------------------------------------------------- the Gallowswood
    { const { x, z, y } = S.crossroads;
      for (const [dx, dz, a] of [[-12, -13, 0.4], [13, -12, -0.3], [-11, 13, 1.8], [13, 12, 2.6]]) P('bellmourn/gallows', x + dx, z + dz, a, 1, { y });
      for (let k = 0; k < 8; k++) P(k % 2 ? 'bellmourn/gibbet' : 'bellmourn/skull_pike', x + Math.cos(k) * 18, z + Math.sin(k) * 18, k, 1, { y });
      P('bellmourn/lamp_post', x + 3, z + 3, 0, 1, { y });
      lair('gallows', x, z, 20, 'crossroads'); lair('gallows', x - 160, z - 120, 70, 'deadwood'); lair('gallows', x + 120, z - 280, 60, 'deadwood');
    }
    { const { x, z, y } = S.witch;
      interior(house(ctx, { name: 'witch', title: "Mother Grawl's Hut", x, z, y, w: 2, d: 3, rot: 1, storeys: 1, door: 'x', furnish: 'alchemist', plaster: 'ash', vines: 5, vineVariant: 'blight', roofVariant: 'moss', holed: true }), 'gallows');
      P('props/Cauldron', x + 6, z + 2, 0, 1.4); P('dungeon/Woodfire', x + 6, z + 2, 0, 0.9); P('bellmourn/bone_heap', x + 4, z - 4, 1);
      lair('gallows', x, z, 15, 'hut');
    }
    { const { x, z } = { x: SPOTS.grove[0], z: SPOTS.grove[1] };
      for (let k = 0; k < 14; k++) { const a = R() * Math.PI * 2, r = 8 + R() * 40; P(SET.twisted[k % 5], x + Math.cos(a) * r, z + Math.sin(a) * r, R() * 6, 0.7 + R() * 0.5, { solid: 'trunk' }); }
      lair('gallows', x, z, 40, 'grove');
    }
    // ---------------------------------------------------------------- the Deepwood
    { const { x, z, y } = S.hermit;
      interior(house(ctx, { name: 'hermit', title: "The Hermit's Hollow", x, z, y, w: 2, d: 2, rot: 3, storeys: 1, door: 'z', furnish: 'study', vines: 4, roofVariant: 'moss' }), 'deepwood');
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; P(SET.mossrock[k], x + Math.cos(a) * 11, z + Math.sin(a) * 11, a, [1, 2.4, 1]); }
      lair('deepwood', x, z, 20, 'hollow'); lair('deepwood', x + 90, z + 160, 70, 'thicket');
    }
    lair('core', 160, 120, 60, 'forest'); lair('core', -200, 140, 60, 'forest'); lair('core', -160, -220, 60, 'forest'); lair('core', 220, -150, 60, 'forest');

    // ---------------------------------------------------------------- flora over the whole world
    scatter(ctx, keepOut, R);
    for (const [k, b] of Object.entries(BIOMES)) {
      ctx.biomes[k] ||= { name: b.name, lairs: [] };
      ctx.biomes[k].name = b.name;
      ctx.biomes[k].centres = b.c || (k === 'core' ? [[0, 0]] : [[(REGION.x0 + REGION.x1) / 2, 0]]);
    }
  };
  return out;
}

/** How far (x, z), with a radius r, stands clear of the roads and paths: the least, over every
 * path, of its distance from the line less r and frac of the path's half width (plus extra).
 * Below zero is in the way. */
function pathDistance(paths) {
  const B = 60, buckets = new Map();
  for (const p of paths) for (let i = 0; i + 1 < p.pts.length; i++) {
    const a = p.pts[i], b = p.pts[i + 1], s = [a, b, p.w];
    for (let x = Math.floor((Math.min(a[0], b[0]) - 12) / B); x <= Math.floor((Math.max(a[0], b[0]) + 12) / B); x++)
      for (let z = Math.floor((Math.min(a[1], b[1]) - 12) / B); z <= Math.floor((Math.max(a[1], b[1]) + 12) / B); z++) {
        const k = x * 10007 + z;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(s);
      }
  }
  return (x, z, r = 0, frac = 1, extra = 0) => {
    let best = Infinity;
    for (const [[ax, az], [bx, bz], w] of buckets.get(Math.floor(x / B) * 10007 + Math.floor(z / B)) || []) {
      const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t) - r - w * frac - extra);
    }
    return best;
  };
}

/** Trees, undergrowth, grass and stones over the whole world, by country, on a jittered grid
 * (none of the trees, rocks or logs on a road or path). */
function scatter(ctx, keepOut, R) {
  const { kit, land } = ctx;
  const CELL = 7.5;
  const blocked = (x, z, pad = 0) => keepOut.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r + pad);
  const road = pathDistance(ctx.paths || []);
  const counts = { trees: 0, ground: 0 };
  // each 160 m patch of land grows only a few of a set's species (stands, not a catalogue)
  const pick = (list, px, pz) => {
    if (px === undefined || list.length <= 4) return list[Math.floor(R() * list.length)];
    const h = Math.abs(Math.floor(px / 160) * 73856093 ^ Math.floor(pz / 160) * 19349663 ^ list.length * 83492791);
    return list[(h + Math.floor(R() * 4) * 7919) % list.length];
  };
  const choose = (table) => { let t = R() * table.reduce((a, e) => a + e[1], 0); for (const e of table) { t -= e[1]; if (t <= 0) return e; } return table[0]; };
  for (let x = WORLD.x0 + 60; x < WORLD.x1 - 60; x += CELL) for (let z = WORLD.z0 + 60; z < WORLD.z1 - 60; z += CELL) {
    const px = x + R() * CELL, pz = z + R() * CELL;
    const r = Math.hypot(px, pz);
    const bio = biomeAt(px, pz);
    const fl = FLORA[bio] || FLORA.core;
    const g = land.groundAt(px, pz);
    if (g === 'gravel' || g === 'cobble') continue;
    const inVillage = r < 100, inYard = px > -55 && px < 55 && pz > -190 && pz < -40 && bio === 'core';
    if (inYard) continue;
    const slope = land.slope(px, pz);
    const y = worldHeight(px, pz);
    const wet = ctx.fenWater && bio === 'fen' && y < ctx.fenWater.y - 0.1;
    if (wet) { // lilypads on the black water, reeds along its edges
      if (R() < 0.14) kit.place('ultimate/Lilypad', px, ctx.fenWater.y + 0.02, pz, R() * 6, 0.8 + R() * 0.6, { solid: false, cull: 80 });
      else if (y > ctx.fenWater.y - 0.5 && R() < 0.3) kit.place(pick(SET.grass, px, pz), px, y, pz, R() * 6, 1.1 + R() * 0.5, { solid: false, cull: 90, variant: 'dead' });
      continue;
    }
    // trees (denser in the forests, a ragged edge round the village, none on cliffs)
    let dens = fl.density * (fbm(px * 0.02, pz * 0.02) * 0.8 + 0.6);
    if (bio === 'core') dens *= inVillage ? 0.03 : r < 116 ? 0.35 : 1;
    if (Math.abs(pz) < 9 && px > 100 && px < REGION.x0) dens = 0; // the trail
    if (slope < 0.38 && R() < dens && !blocked(px, pz) && road(px, pz, 0, 1, 1.2) > 0) {
      const [set, , sc, vars] = choose(fl.trees);
      const id = pick(SET[set], px, pz);
      const s = sc[0] + R() * (sc[1] - sc[0]);
      kit.place(id, px, y - 0.15, pz, R() * Math.PI * 2, s, { solid: 'trunk', variant: vars ? pick(vars) : '', tilt: [(R() - 0.5) * 0.08, (R() - 0.5) * 0.08], cull: 420 });
      counts.trees++;
      continue;
    }
    // undergrowth, grass, stones
    if (R() < fl.gdens * (inVillage ? 0.3 : 1) && !blocked(px, pz, -4)) {
      const [set] = choose(fl.ground);
      const id = pick(SET[set], px + 5000, pz);
      const big = /rock|log/.test(set);
      const rot = R() * Math.PI * 2, s = big ? 0.6 + R() * 0.9 : 0.8 + R() * 0.5, f = big && kit.footprint(id, px, pz, rot, s);
      if (f && road((f[0] + f[2]) / 2, (f[1] + f[3]) / 2, Math.hypot(f[2] - f[0], f[3] - f[1]) / 2, 1, 0.5) < 0) continue;
      kit.place(id, px, y - (big ? 0.2 : 0.02), pz, rot, s,
        { solid: big, variant: set === 'grass' && bio === 'rimeholt' ? 'frost' : set === 'grass' && (bio === 'ashen' || bio === 'barrow') ? 'dead' : '', cull: big ? 260 : 70, cast: big });
      counts.ground++;
    }
  }
  ctx.floraCounts = counts;
}

export { CORE_R, streamAt };
