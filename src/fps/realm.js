// Bellmourn's world, built from the reworked Quaternius kit (kit.js): the village in its forest
// clearing, the cathedral at its north end (its back office holds the stairs down to the
// undercroft), the walled graveyard beyond, the Darkwood all round, the trail east to the Green
// Downs, and past them the seven new countries (wilds.js). Metres; x east, z south (north is -z);
// the village ground is y = 0.
//
// What the rest of the game leans on is where it was: GRAVEYARD and its grave props (colliders
// tagged 'prop'), CATHEDRAL, STAIRS and ctx.stairBottom, ctx.zones (place names, indoors), and
// now ctx.interiors (every building's rooms with their floor height, for putting things inside)
// and ctx.biomes (each country's bounds and its lairs).
import * as THREE from 'three';
import { house, H } from './houses.js';
import { Land, WORLD, worldHeight, flatten, BIOMES, biomeAt } from './land.js';
import { buildWilds } from './wilds.js';
import { REGION } from './terrain.js';

export const VILLAGE_R = 100;
export const WORLD_R = 300;
export const CATHEDRAL = { x0: -12, x1: 12, z0: -98, z1: -52, floor: 0.6 };
export const GRAVEYARD = { x0: -48, x1: 48, z0: -182, z1: -122 };
export const STAIRS = { x: 5.0, z: -93.6 };

export function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// the roads: from the plaza to every country, worn into the ground (and kept clear of trees)
export const ROADS = [
  { pts: [[0, -48], [0, 120]], w: 3.6, layer: 'gravel' },
  { pts: [[-120, 0], [120, 0]], w: 3.6, layer: 'gravel' },
  { pts: [[19, -40], [19, -118], [17, -122]], w: 2.6, layer: 'mud' },          // the lane to the graveyard gate, clear of the bell tower
  { pts: [[20, -118], [53, -118], [62, -132], [66, -210], [40, -300], [-20, -420], [-40, -560], [-60, -720], [-90, -900]], w: 2.4, layer: 'mud' },
  { pts: [[-120, 0], [-300, 10], [-470, -30], [-640, -110], [-820, -160]], w: 2.6, layer: 'gravel' },
  { pts: [[0, 120], [10, 300], [70, 480], [130, 640], [150, 820]], w: 2.6, layer: 'gravel' },
  { pts: [[10, 300], [-160, 420], [-380, 560], [-640, 680]], w: 2.2, layer: 'mud' },
  { pts: [[-300, 10], [-380, -200], [-470, -400], [-540, -600]], w: 2.0, layer: 'mud' },
  { pts: [[600, -10], [640, -150], [610, -262], [640, -400], [760, -560], [840, -640]], w: 2.4, layer: 'gravel' },
  { pts: [[560, 76], [600, 200], [640, 262], [720, 420], [860, 620], [920, 720]], w: 2.4, layer: 'gravel' },
  { pts: [[-60, -720], [200, -640], [420, -560], [640, -400]], w: 2.0, layer: 'mud' },
  { pts: [[150, 820], [500, 860], [780, 800], [920, 720]], w: 2.0, layer: 'gravel' },
];

export function buildWorld(ctx) {
  const { kit, physics } = ctx;
  const R = rng(1471);
  ctx.zones = [];
  ctx.interiors = [];
  ctx.biomes = {};
  ctx.chimneys ||= [];
  physics.groundHoles.push([CATHEDRAL.x0, CATHEDRAL.z0, CATHEDRAL.x1, CATHEDRAL.z1]);

  // the countries first claim their building pads, then the land is shaped round them
  const wilds = buildWilds(ctx, { planOnly: true });
  ctx.paths = wilds.paths;   // (for the map)
  ctx.land = new Land().build(ctx, {
    paths: [...ROADS, ...wilds.paths],
    rects: [{ x0: -20, z0: -20, x1: 20, z1: 20, layer: 'cobble', second: 'gravel', mix: 40 },
      { x0: -16, z0: -52, x1: 16, z1: -40, layer: 'cobble' },
      { x0: GRAVEYARD.x0, z0: GRAVEYARD.z0, x1: GRAVEYARD.x1, z1: GRAVEYARD.z1, layer: 'gravesoil', second: 'deadgrass', mix: 80 }],
    holes: [[CATHEDRAL.x0 + 0.2, CATHEDRAL.z0 + 0.2, CATHEDRAL.x1 - 0.2, CATHEDRAL.z1 - 0.2]],
  });
  const bt = ctx.land.biomeTexture();
  kit.setBiome(bt.tex, bt.rect);

  village(ctx, R);
  cathedral(ctx, R);
  graveyard(ctx, R);
  trail(ctx, R);
  wilds.build();   // the forest, the downs and the new countries, with their lairs
  coverage(ctx);   // anything in the kit not yet used somewhere goes where it fits

  ctx.inBounds = (x, z) => x > WORLD.x0 + 40 && x < WORLD.x1 - 40 && z > WORLD.z0 + 40 && z < WORLD.z1 - 40;
  return { houses: ctx.interiors.length };
}

// ------------------------------------------------------------------ the village
const HOUSES = [
  { name: 'inn', furnish: 'inn', title: 'The Tolling Bell Inn', x: 30, z: 18, w: 4, d: 6, rot: 3, storeys: 2, door: 'x', porch: true, balcony: 'cross', jetty: true, vines: 2 },
  { name: 'blacksmith', furnish: 'smith', title: 'Hammerfall Smithy', x: -30, z: 18, w: 3, d: 5, rot: 1, storeys: 1, style: 'brick', door: 'x', forge: true },
  { name: 'general store', furnish: 'store', title: "Grimwald's Provisions", x: 30, z: -18, w: 3, d: 6, rot: 3, storeys: 2, door: 'x', porch: true, plaster: 'ochre' },
  { name: 'alchemist', furnish: 'alchemist', title: "The Alchemist's Shop", x: -30, z: -18, w: 3, d: 4, rot: 1, storeys: 2, door: 'x', plaster: 'ash', vines: 3, vineVariant: 'blight' },
  // (beside the high street, its door onto it: the road runs on south past it)
  { name: 'town hall', furnish: 'hall', title: 'Bellmourn Town Hall', x: -14, z: 44, w: 4, d: 7, rot: 0, storeys: 2, door: 'x', style: 'brick', dormers: 2, balcony: 'simple' },
  { name: 'barracks', furnish: 'barracks', title: 'The Watch Barracks', x: 52, z: 44, w: 3, d: 7, rot: 0, storeys: 2, door: 'x', style: 'brick', roofVariant: 'lead' },
  { name: 'stable', furnish: 'stable', title: 'The Stables', x: 58, z: -6, w: 4, d: 6, rot: 3, storeys: 1, open: true, door: 'z', roofVariant: 'moss' },
  { name: 'bakery', furnish: 'bakery', title: 'The Bakehouse', x: -58, z: -8, w: 3, d: 4, rot: 1, storeys: 2, door: 'x', roofVariant: 'rust', porch: true },
  { name: 'healer', furnish: 'healer', title: 'House of Mending', x: 44, z: -48, w: 3, d: 5, rot: 3, storeys: 2, door: 'x', plaster: 'lime' },
  { name: 'cottage', furnish: 'home', title: "The Widow Harrow's Cottage", x: -44, z: -46, w: 2, d: 3, rot: 1, storeys: 1, door: 'x', vines: 3 },
  { name: 'cooper', furnish: 'store', title: "The Cooper's Yard", x: 70, z: 22, w: 3, d: 4, rot: 0, storeys: 1, door: 'z', style: 'brick', roofVariant: 'rust' },
  { name: 'chandler', furnish: 'home', title: "Ebb the Chandler's", x: -70, z: 24, w: 2, d: 4, rot: 2, storeys: 2, door: 'x', plaster: 'ochre', jetty: true },
  { name: 'ruin', furnish: 'ruin', title: 'The Burnt House', x: -72, z: -40, w: 3, d: 4, rot: 0, storeys: 2, door: 'z', ruin: true },
];

function village(ctx, R) {
  const { kit } = ctx;
  for (const h of HOUSES) {
    h.y = 0;
    const zone = house(ctx, h);
    ctx.zones.push(zone);
    ctx.interiors.push({ ...zone, biome: 'village' });
    if (h.forge) forge(ctx, h);
  }
  mageTower(ctx, -56, 44, R);
  // the plaza: the well, market stalls round it, benches, banners, lamp posts down the streets
  kit.place('bellmourn/well', 0, 0, 0, 0, 1.15);
  [[11, 11, -Math.PI * 0.75], [-11, 11, Math.PI * 0.75], [11, -11, -Math.PI * 0.25], [-11, -11, Math.PI * 0.25]].forEach(([x, z, a], i) => {
    kit.place(i % 2 ? 'props/Stall_Empty' : 'props/Stall_Cart_Empty', x, 0, z, a, 1, { variant: ['crimson', 'shroud', '', 'crimson'][i] });
    ['props/FarmCrate_Apple', 'props/FarmCrate_Carrot', 'props/Barrel_Apples', 'props/Bag'].forEach((id, k) =>
      kit.place(id, x + Math.cos(a + k) * 1.6, 0, z + Math.sin(a + k) * 1.6, a + k, 1));
  });
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) / 8 * Math.PI * 2;
    kit.place('props/Bench', Math.cos(a) * 17.5, 0, Math.sin(a) * 17.5, -a + Math.PI / 2);
  }
  const lamp = (x, z, a) => kit.place('bellmourn/lamp_post', x, 0, z, a);
  for (let z = -40; z <= 100; z += 17) if (Math.abs(z) > 23) { lamp(-5.4, z, Math.PI / 2); lamp(5.4, z + 8, -Math.PI / 2); }
  for (let x = 25; x <= 100; x += 17) for (const sx of [-1, 1]) { lamp(sx * x, -5.4, 0); lamp(sx * (x + 8), 5.4, Math.PI); }
  // carts, wagons, crates and barrels about the streets; fenced gardens with scarecrows
  for (const [x, z, a] of [[20, -25, 0.3], [49, -15, 1.4], [-20, 26, 2.6], [-12, 60, 0.2]]) kit.place('village/Prop_Wagon', x, 0, z, a);
  for (const [x, z] of [[66, -14], [66, -12.4], [66.6, -13.2], [-64, 30]]) kit.place('bellmourn/haystack', x, 0, z, R() * 6);
  const gardens = [[40, 11, 48, 25], [-46, 11, -38, 25], [-72, -15, -66, -1], [52, -55, 58, -41]];
  gardens.forEach(([x0, z0, x1, z1], gi) => {
    fenceLine(ctx, [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]], gi % 2 ? 'village/Prop_WoodenFence_Single' : 'village/Prop_WoodenFence_Extension1');
    for (let x = x0 + 1; x < x1 - 0.5; x += 1.5) for (let z = z0 + 1.2; z < z1 - 0.5; z += 2.2)
      kit.place(['ultimate/Corn_1', 'ultimate/Corn_2', 'nature/Plant_1', 'ultimate/Plant_3'][(((gi + Math.round(x + z)) % 4) + 4) % 4], x, 0, z, R() * 6, 0.8, { solid: false });
    kit.place('bellmourn/scarecrow', (x0 + x1) / 2, 0, (z0 + z1) / 2, R() * 6);
  });
  // behind every house, against its back wall by one corner, what a household keeps out of
  // doors: firewood for its hearth, a rain barrel and its bucket; crates behind the shops
  const shop = new Set(['store', 'smith', 'bakery', 'inn', 'alchemist']);
  HOUSES.forEach((h) => {
    if (h.ruin || h.open) return;
    const a = h.rot * Math.PI / 2, back = [-Math.sin(a), -Math.cos(a)], side = [Math.cos(a), -Math.sin(a)];
    const at = (u, v) => [h.x + back[0] * (h.d + 0.7 + v) + side[0] * (h.w - 1.2 - u), h.z + back[1] * (h.d + 0.7 + v) + side[1] * (h.w - 1.2 - u)];
    const put = (id, u, v, rot = 0) => { const [x, z] = at(u, v); kit.place(id, x, 0, z, a + rot, 1); };
    put('bellmourn/woodpile', 0, 0.2, Math.PI / 2);
    put('props/Barrel', 1.9, 0, 0.3); put('props/Bucket_Wooden_1', 2.6, 0.5, 1);
    if (shop.has(h.furnish)) { put('props/Crate_Wooden', -1.6, 0, 0.2); put('props/Crate_Wooden', -2.5, 0.1, -0.3); }
  });
  // the iron railings round the plaza and the cathedral forecourt
  fenceLine(ctx, [[-16, -40], [-6, -40]], 'village/Prop_MetalFence_Ornament');
  fenceLine(ctx, [[6, -40], [16, -40]], 'village/Prop_MetalFence_Ornament');
  for (const [x, z] of [[-24, 24], [24, 24], [-24, -24], [24, -24]]) kit.place('props/Banner_1', x, 0, z, Math.atan2(x, z) + Math.PI, 1, { variant: 'crimson' });
}

/** A fence along a polyline of [x, z], one kit section every 2 m. */
export function fenceLine(ctx, pts, id, y = null) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 2));
    const a = Math.atan2(-(bz - az), bx - ax);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      ctx.kit.place(id, x, y ?? worldHeight(x, z), z, a, [len / n / 2, 1, 1], { tag: 'fence' });
    }
  }
}

/** The smith's forge: a brazier in a ring of bricks, a stack of iron by it. */
function forge(ctx, h) {
  const { kit } = ctx;
  const a = h.rot * Math.PI / 2, x = h.x - Math.sin(a) * 1.5 + Math.cos(a) * -1.5, z = h.z - Math.cos(a) * 1.5 - Math.sin(a) * -1.5;
  kit.place('bellmourn/brazier', x, 0, z, 0, 1.2);
  for (let k = 0; k < 6; k++) kit.place(`village/Prop_Brick${k % 4 + 1}`, x + Math.cos(k) * 0.95, 0, z + Math.sin(k) * 0.95, k);
}

/** The mage's tower: five storeys of brick on a 4 m square, the kit's tower roof on top. */
function mageTower(ctx, x, z, R) {
  const zone = house(ctx, { name: 'tower', title: "The Mage's Tower", x, z, y: 0, w: 2, d: 2, rot: 0, storeys: 1, style: 'brick', door: 'z', furnish: 'study', chimney: false });
  const { kit } = ctx;
  for (let st = 1; st < 5; st++) {
    for (const [lx, lz, a] of [[0, 2, 0], [0, -2, Math.PI], [2, 0, Math.PI / 2], [-2, 0, -Math.PI / 2]]) for (const u of [-1, 1]) {
      const px = x + lx + (a === 0 || a === Math.PI ? u : 0), pz = z + lz + (a === 0 || a === Math.PI ? 0 : u);
      kit.place(st % 2 ? 'village/Wall_UnevenBrick_Window_Thin_Round' : 'village/Wall_UnevenBrick_Straight', px, st * H, pz, a, 1, { solid: false });
    }
    for (const [cx, cz, a] of [[2, 2, 0], [-2, 2, -Math.PI / 2], [-2, -2, Math.PI], [2, -2, Math.PI / 2]]) kit.place('village/Corner_ExteriorWide_Brick', x + cx, st * H, z + cz, a, 1, { solid: false });
  }
  ctx.physics.add([x - 2.3, 0, z - 2.3], [x + 2.3, 0.1, z + 2.3], 'floor');
  kit.place('village/Roof_Tower_RoundTiles', x, 5 * H, z, 0, 1, { variant: 'lead' });
  ctx.zones.push(zone);
  ctx.interiors.push({ ...zone, biome: 'village' });
}

// ------------------------------------------------------------------ the cathedral
function cathedral(ctx, R) {
  const { kit, b, physics } = ctx;
  const C = CATHEDRAL, F = C.floor, T = 4; // tiers of kit wall
  const top = F + T * H;
  ctx.zones.push({ x0: C.x0, z0: C.z0, x1: C.x1, z1: C.z1, y0: -1, y1: top + 9, name: 'Cathedral of the Mourning Bell' });
  ctx.interiors.push({ x0: C.x0 + 1, z0: C.z0 + 16, x1: C.x1 - 1, z1: C.z1 - 1, y0: -1, y1: top, floor: F, name: 'Cathedral of the Mourning Bell', biome: 'village' });
  const stone = kit.surface('village_rocktrim', 3), brick = kit.surface('village_unevenbrick', 2.5);
  const roof = kit.surface('village_roundtiles', 2, 'lead'), tiles = kit.surface('village_brick', 2, 'soot');
  // the plinth (floor), leaving the stairwell open where the flight goes down
  const sw = { x0: STAIRS.x - 1.2, x1: STAIRS.x + 1.2, z0: C.z0, z1: STAIRS.z };
  b.box([C.x0, 0, C.z0 + 8], [C.x1, F, C.z1], { top: tiles, side: stone, bottom: stone });
  b.box([C.x0, 0, C.z0], [sw.x0, F, C.z0 + 8], { top: tiles, side: stone, bottom: stone });
  b.box([sw.x1, 0, C.z0], [C.x1, F, C.z0 + 8], { top: tiles, side: stone, bottom: stone });
  b.box([sw.x0, 0, sw.z1], [sw.x1, F, C.z0 + 8], { top: tiles, side: stone, bottom: stone });
  for (let i = 0; i < 3; i++) b.box([-8, 0, C.z1 + i * 0.5], [8, F - i * 0.2, C.z1 + (i + 1) * 0.5], stone);
  // the nave floor: the dungeon kit's flagstones in the aisles, red brick down the middle
  for (let x = C.x0 + 1; x < C.x1; x += 2) for (let z = C.z0 + 16; z < C.z1; z += 2)
    kit.place(Math.abs(x) < 3 ? 'village/Floor_RedBrick' : 'dungeon/Floor_Modular', x, F + 0.012, z, 0, Math.abs(x) < 3 ? 1 : [1, 0.4, 1], { solid: false });
  // walls: four tiers of the village kit's uneven brick; tall windows in the middle two tiers
  // (stained glass in each), buttresses of dungeon columns outside
  const W = (x, y, z, a, id) => kit.place('village/' + id, x, y, z, a, 1, { solid: false });
  const glass = [];
  for (let t = 0; t < T; t++) {
    const y = F + t * H;
    for (let x = C.x0 + 1; x < C.x1; x += 2) { // front (south) and back (north)
      const doorGap = Math.abs(x) < 2.5;
      if (!(doorGap && t < 2)) {
        const roseGap = Math.abs(x) < 2.5 && t === 2;
        W(x, y, C.z1, 0, roseGap ? 'Wall_Arch' : (t === 1 || t === 2) && Math.abs(x) > 6 ? 'Wall_UnevenBrick_Window_Thin_Round' : 'Wall_UnevenBrick_Straight');
        if ((t === 1 || t === 2) && Math.abs(x) > 6) glass.push(['lancet', [x, y + 1.85, C.z1 - 0.1], [0, 0, -1], 0.62, 1.25]);
      }
      W(x, y, C.z0, Math.PI, 'Wall_UnevenBrick_Straight');
    }
    for (let z = C.z0 + 1; z < C.z1; z += 2) {
      const win = (t === 1 || t === 2) && z > C.z0 + 16 && Math.round(z) % 4 === 1;
      W(C.x1, y, z, Math.PI / 2, win ? 'Wall_UnevenBrick_Window_Thin_Round' : 'Wall_UnevenBrick_Straight');
      W(C.x0, y, z, -Math.PI / 2, win ? 'Wall_UnevenBrick_Window_Thin_Round' : 'Wall_UnevenBrick_Straight');
      if (win) {
        glass.push(['lancet', [C.x1 - 0.1, y + 1.85, z], [-1, 0, 0], 0.62, 1.25]);
        glass.push(['lancet', [C.x0 + 0.1, y + 1.85, z], [1, 0, 0], 0.62, 1.25]);
      }
    }
    for (const [cx, cz, a] of [[C.x1, C.z1, 0], [C.x0, C.z1, -Math.PI / 2], [C.x0, C.z0, Math.PI], [C.x1, C.z0, Math.PI / 2]]) W(cx, y, cz, a, 'Corner_ExteriorWide_Brick');
  }
  physics.add([C.x0 - 0.1, 0, C.z0 - 0.1], [C.x0 + 0.33, top, C.z1 + 0.1], 'wall');
  physics.add([C.x1 - 0.33, 0, C.z0 - 0.1], [C.x1 + 0.1, top, C.z1 + 0.1], 'wall');
  physics.add([C.x0, 0, C.z0 - 0.1], [C.x1, top, C.z0 + 0.33], 'wall');
  physics.add([C.x0, 0, C.z1 - 0.33], [-2.2, top, C.z1 + 0.1], 'wall');
  physics.add([2.2, 0, C.z1 - 0.33], [C.x1, top, C.z1 + 0.1], 'wall');
  physics.add([-2.2, F + 4.2, C.z1 - 0.33], [2.2, top, C.z1 + 0.1], 'wall');
  // the great door: the dungeon kit's arch, its two iron-bound leaves
  kit.place('dungeon/Arch', 0, F, C.z1 + 0.15, 0, [1.05, 1.1, 1], { solid: false });
  ctx.doors.add({ hinge: [-2.0, F, C.z1 + 0.15], along: 0, width: 4.0, height: 4.2, double: true, opens: 1, name: 'cathedral doors', model: 'dungeon/Arch_Door' });
  // the buttresses
  for (let z = C.z0 + 4; z < C.z1 - 2; z += 6) for (const sx of [-1, 1]) {
    kit.place('dungeon/Column2', C.x0 * (sx < 0 ? 1 : 0) + C.x1 * (sx > 0 ? 1 : 0) + sx * 0.75, 0, z, 0, [0.85, 2.6, 0.85]);
  }
  // the stained glass in every window (and the rose over the door, in the open arches there)
  if (ctx.stained) {
    for (const g of glass) ctx.stained.add(...g);
    ctx.stained.add('rose', [0, F + 2.5 * H, C.z1 - 0.12], [0, 0, -1], 3.1, 3.1, brick);
    ctx.stained.room([C.x0 - 0.5, 0, C.z0 - 0.5, C.x1 + 0.5, top + 10, C.z1 + 0.5]);
  }
  // the roof: the kit's lead-sheeted tiles over the whole nave, its gables in the kit's brick
  b.gable(C.x0, C.z0, C.x1, C.z1, top, 9, roof, brick, 'z', 0.8, 1);
  kit.place('dungeon/WallCover_Modular', 0, top, C.z1 + 0.2, 0, [12, 1, 1]);
  // what lifts it from a long brick barn to a church: pinnacles on its corners (the bell tower
  // has the fourth), a stone cross on each gable's peak
  for (const [px, pz] of [[C.x0, C.z1], [C.x0, C.z0], [C.x1, C.z0]]) {
    b.box([px - 0.55, top - 0.6, pz - 0.55], [px + 0.55, top + 1.8, pz + 0.55], stone, { solid: false });
    b.cone(px, pz, 0.8, top + 1.8, 3.2, 4, roof);
    b.box([px - 0.08, top + 4.9, pz - 0.08], [px + 0.08, top + 5.4, pz + 0.08], stone, { solid: false });
  }
  for (const gz of [C.z1, C.z0]) {
    const cz = gz + (gz === C.z1 ? 0.25 : -0.25);
    b.box([-0.14, top + 8.9, cz - 0.14], [0.14, top + 11.2, cz + 0.14], stone, { solid: false });
    b.box([-0.75, top + 10.1, cz - 0.13], [0.75, top + 10.4, cz + 0.13], stone, { solid: false });
  }
  // the arcades: tall dungeon columns, the roof's beams across on them
  const pillarsZ = [];
  for (let z = C.z1 - 6; z > C.z0 + 18; z -= 5) pillarsZ.push(z);
  for (const x of [-6, 6]) for (const z of pillarsZ) kit.place(R() < 0.5 ? 'dungeon/Column' : 'dungeon/Column2', x, F, z, 0, [1, 2.4, 1]);
  for (const x of [-6, 6]) b.box([x - 0.5, top - 1.2, C.z0 + 16], [x + 0.5, top, C.z1 - 1], kit.surface('village_woodtrim', 2, 'char'), { solid: false, shade: 0.8 });
  // chancel: a raised platform with the altar, pulpit and candles; the wall behind it with the
  // office door
  const chZ0 = C.z0 + 8, chZ1 = C.z0 + 15;
  b.box([C.x0 + 0.4, F, chZ0], [C.x1 - 0.4, F + 0.6, chZ1], { top: kit.surface('village_brick', 2), side: stone, bottom: stone });
  b.box([-4, F, chZ1], [4, F + 0.3, chZ1 + 0.5], stone);
  kit.place('dungeon/Pedestal', 0, F + 0.6, chZ0 + 3, 0, [1.4, 0.5, 0.7]);
  kit.place('props/CandleStick_Triple', -0.9, F + 1.66, chZ0 + 3, 0);
  kit.place('props/CandleStick_Triple', 0.9, F + 1.66, chZ0 + 3, 0);
  kit.place('props/Chalice', 0, F + 1.66, chZ0 + 3, 0);
  kit.place('dungeon/Pedestal2', -6.5, F + 0.6, chZ1 - 1.6, 0, [0.5, 0.6, 0.5]);
  kit.place('props/BookStand', -6.5, F + 2.0, chZ1 - 1.6, Math.PI);
  for (const x of [-3, 3]) kit.place('props/CandleStick_Stand', x, F + 0.6, chZ0 + 1.5, 0);
  for (const x of [-10, 10]) kit.place('props/CandleStick_Stand', x, F, chZ1 + 2, 0);
  kit.place('props/Banner_2', 0, F + 0.6, chZ0 + 0.4, 0, 1.6, { variant: 'crimson' });
  // the chancel wall: three tiers of brick with a round door behind the pulpit
  for (let t = 0; t < 3; t++) for (let x = C.x0 + 1; x < C.x1; x += 2) {
    const door = t === 0 && Math.abs(x - -7) < 0.5;
    W(x, F + 0.6 + t * H, chZ0, Math.PI, door ? 'Wall_UnevenBrick_Door_Round' : 'Wall_UnevenBrick_Straight');
  }
  physics.add([C.x0, F, chZ0 - 0.1], [-7.62, F + 0.6 + 3 * H, chZ0 + 0.33], 'wall');
  physics.add([-6.38, F, chZ0 - 0.1], [C.x1, F + 0.6 + 3 * H, chZ0 + 0.33], 'wall');
  physics.add([-7.62, F + 3.05, chZ0 - 0.1], [-6.38, F + 0.6 + 3 * H, chZ0 + 0.33], 'wall');
  ctx.doors.add({ hinge: [-6.44, F + 0.62, chZ0], along: Math.PI, width: 1.12, height: 2.4, opens: 1, name: 'office door', model: 'village/Door_8_Round' });
  b.box([-8.1, F, chZ0 - 1.05], [-5.9, F + 0.3, chZ0 - 0.25], stone);
  // the office: a desk, books, a chest, candles, and the stair-house at its east end
  kit.place('props/Table_Large', -4, F, C.z0 + 3.2, 0);
  kit.place('props/Chair_1', -4, F, C.z0 + 4.4, Math.PI);
  kit.place('props/Bookcase_2', -8.5, F, C.z0 + 0.8, 0);
  kit.place('props/Bookcase_2', -11, F, C.z0 + 3.2, Math.PI / 2);
  kit.place('props/Chest_Wood', -10.6, F, C.z0 + 6.2, Math.PI / 2);
  kit.place('props/CandleStick', -4.4, F + 0.82, C.z0 + 3.0, 0);
  kit.place('props/Scroll_1', -3.6, F + 0.82, C.z0 + 3.3, 0.4);
  kit.place('props/Book_Stack_2', -3.2, F + 0.82, C.z0 + 3.0, 1);
  kit.place('props/Cabinet', 9.5, F, C.z0 + 0.8, 0);
  kit.place('props/CandleStick_Stand', 10.6, F, C.z0 + 6.6, 0);
  ctx.interiors.push({ x0: C.x0 + 1, z0: C.z0 + 1, x1: STAIRS.x - 2.6, z1: chZ0 - 0.5, y0: -1, y1: F + 6, floor: F, name: 'The Sacristy', biome: 'village' });
  // the stair-house round the head of the stairs (its door on the west, onto a landing)
  const sh = { x0: STAIRS.x - 2.4, x1: STAIRS.x + 2.4, z0: C.z0 + 0.4, z1: STAIRS.z + 2.0 };
  const doorZ = STAIRS.z + 0.8;
  b.wall(sh.x0 + 0.2, sh.z0, sh.x0 + 0.2, sh.z1, F, F + 3.6, 0.4, brick, [{ at: doorZ - sh.z0, w: 1.4, y0: F, y1: F + 2.4 }]);
  b.wall(sh.x1 - 0.2, sh.z0, sh.x1 - 0.2, sh.z1, F, F + 3.6, 0.4, brick);
  b.wall(sh.x0, sh.z1 - 0.2, sh.x1, sh.z1 - 0.2, F, F + 3.6, 0.4, brick);
  b.box([sh.x0 - 0.1, F + 3.6, sh.z0], [sh.x1 + 0.1, F + 3.95, sh.z1 + 0.1], kit.surface('village_woodtrim', 2), { solid: false });
  ctx.doors.add({ hinge: [sh.x0 + 0.2, F, doorZ + 0.7], along: Math.PI / 2, width: 1.4, height: 2.4, opens: -1, name: 'stair door', model: 'dungeon/Arch_Door' });
  ctx.zones.unshift({ x0: sh.x0, z0: sh.z0, x1: sh.x1, z1: sh.z1, y0: -1, y1: F + 4, name: 'The Stair to the Undercroft' });
  // the flight down: the old masonry stair, the dungeon kit's brick for its walls and vault
  const vault = kit.surface('village_brick', 2.5, 'soot'), steps = kit.surface('nature_pathrocks', 1.5);
  const run = b.stairs(STAIRS.x, STAIRS.z, F, -(F + 14), 2.4, '-z', steps, { step: 0.25, run: 0.34 });
  const zEnd = STAIRS.z - run, yEnd = F - Math.round((F + 14) / 0.25) * 0.25;
  for (const sx of [-1, 1]) b.box([STAIRS.x + sx * 1.2 - (sx > 0 ? 0 : 0.5), -15, zEnd], [STAIRS.x + sx * 1.2 + (sx > 0 ? 0.5 : 0), F, STAIRS.z], vault);
  const slab = (z) => F - ((STAIRS.z - z) / 0.34) * 0.25 + 3.0;
  b.beam([STAIRS.x, slab(STAIRS.z), STAIRS.z], [STAIRS.x, slab(zEnd), zEnd], 3.95, 0.4, vault, { up: [0, 1, 0] });
  b.box([sh.x0 + 0.4, F + 2.8, STAIRS.z - 0.05], [sh.x1 - 0.4, F + 3.6, STAIRS.z + 0.1], brick, { solid: false });
  for (let z = STAIRS.z - 1.6, k = 0; z > zEnd + 0.5; z -= 3.2, k++) {
    const y = F - (Math.floor((STAIRS.z - z) / 0.34) + 1) * 0.25, sx = k % 2 ? 1 : -1;
    kit.place('dungeon/Torch', STAIRS.x + sx * 1.1, y + 1.4, z, sx < 0 ? Math.PI / 2 : -Math.PI / 2, 1, { solid: false });
  }
  ctx.stairBottom = { x: STAIRS.x, y: Math.min(-14, yEnd), z: zEnd };
  // the church's furnishing: pews in two banks, chandeliers, banners on the columns, torches
  for (let z = chZ1 + 4; z < C.z1 - 4; z += 1.8) for (const x of [-3.4, 3.4]) kit.place('props/Bench', x, F, z, Math.PI, [1.6, 1, 1]);
  for (const z of [C.z1 - 12, C.z1 - 24]) kit.place('props/Chandelier', 0, top - 3.2, z, 0, 1.6, { solid: false });
  pillarsZ.forEach((z, i) => { if (i % 2 === 0) kit.place(i % 4 ? 'dungeon/Banner_wall' : 'props/Banner_1', i % 4 ? -5.4 : 5.4, F + 3.8, z, i % 4 ? Math.PI / 2 : -Math.PI / 2, 1, { variant: 'crimson', solid: false }); });
  for (let z = C.z1 - 6; z > C.z0 + 18; z -= 10) {
    kit.place('dungeon/Torch', C.x0 + 0.5, F + 2.2, z, Math.PI / 2, 1, { solid: false });
    kit.place('dungeon/Torch', C.x1 - 0.5, F + 2.2, z, -Math.PI / 2, 1, { solid: false });
  }
  kit.place('bellmourn/tomb', -8.5, F, C.z1 - 4.5, 0, 0.9);   // the founder's tomb, by the door
  kit.place('props/CandleStick_Stand', -8.5, F, C.z1 - 2.8, 0);
  kit.place('bellmourn/shrine', 8.5, F, C.z1 - 3.5, -Math.PI / 2);
  // the bell tower at the south-east corner: six tiers of brick, the kit's tower roof
  const tx = C.x1 + 2.2, tz = C.z1 - 2.2;
  for (let t = 0; t < 7; t++) for (const [lx, lz, a] of [[0, 2, 0], [0, -2, Math.PI], [2, 0, Math.PI / 2], [-2, 0, -Math.PI / 2]]) for (const u of [-1, 1]) {
    const px = tx + lx + (a === 0 || a === Math.PI ? u : 0), pz = tz + lz + (a === 0 || a === Math.PI ? 0 : u);
    W(px, t * H, pz, a, t >= 5 ? 'Wall_Arch' : t % 2 ? 'Wall_UnevenBrick_Window_Thin_Round' : 'Wall_UnevenBrick_Straight');
  }
  physics.add([tx - 2.3, 0, tz - 2.3], [tx + 2.3, 7 * H, tz + 2.3], 'wall');
  kit.place('village/Roof_Tower_RoundTiles', tx, 7 * H, tz, 0, 1, { variant: 'lead' });
  kit.place('props/Cauldron', tx, 5 * H + 0.4, tz, 0, [1.6, -1.8, 1.6]); // the bell
}

// ------------------------------------------------------------------ the graveyard
function graveyard(ctx, R) {
  const { kit } = ctx;
  const G = GRAVEYARD;
  const gate = 17;
  // the wall: the dungeon kit's balustrade on all four sides, a gap for the gate
  fenceLine(ctx, [[G.x0, G.z1], [gate - 2.4, G.z1]], 'dungeon/Fence_Straight_Modular', 1.0);
  fenceLine(ctx, [[gate + 2.4, G.z1], [G.x1, G.z1], [G.x1, G.z0], [G.x0, G.z0], [G.x0, G.z1]], 'dungeon/Fence_Straight_Modular', 1.0);
  for (const x of [gate - 2.6, gate + 2.6]) kit.place('dungeon/Pedestal2', x, 0, G.z1, 0, [0.5, 1.1, 0.5]);
  kit.place('dungeon/Arch', gate, 0, G.z1, 0, [1.26, 0.95, 0.6], { solid: false });   // springing from the two piers
  for (const [x, z] of [[G.x0, G.z0], [G.x1, G.z0], [G.x0, G.z1], [G.x1, G.z1]]) kit.place('dungeon/Pedestal2', x, 0, z, 0, [0.5, 0.9, 0.5]);
  // the graves: headstones, crosses, obelisks and tombs in rows
  const kinds = ['bellmourn/headstone_rough', 'bellmourn/headstone_slab', 'bellmourn/headstone_slab', 'bellmourn/grave_cross', 'bellmourn/grave_cross', 'bellmourn/grave_obelisk'];
  for (let z = G.z1 - 6; z > G.z0 + 4; z -= 3.6) {
    for (let x = G.x0 + 4; x < G.x1 - 4; x += 3.2) {
      if (Math.abs(x - gate) < 2.5) continue;
      if (x > -12 && x < 12 && z < G.z0 + 22) continue;
      if (R() < 0.18) continue;
      const k = kinds[Math.floor(R() * kinds.length)];
      kit.place(k, x + (R() - 0.5) * 0.8, 0, z + (R() - 0.5) * 0.5, (R() - 0.5) * 0.3 + Math.PI, 0.9 + R() * 0.3, { tilt: [(R() - 0.5) * 0.25, (R() - 0.5) * 0.2] });
      if (R() < 0.12) kit.place('props/Candle_1', x + 0.5, 0, z + 0.6, 0, 1, { solid: false });
    }
  }
  for (let i = 0; i < 6; i++) kit.place('bellmourn/tomb', -30 + i * 12 + (R() - 0.5) * 3, 0, G.z0 + 8 + R() * 4, R() * 0.4);
  // the mausoleum: a brick house with a leaden roof, columns at its door
  const mz = G.z0 + 10;
  const zone = house(ctx, { name: 'mausoleum', title: 'The Mausoleum', x: 0, z: mz, y: 0, w: 3, d: 3, rot: 0, storeys: 1, style: 'brick', door: 'z', roofVariant: 'lead', chimney: false, furnish: [['bellmourn/tomb', 1], ['props/CandleStick_Stand', 2], ['dungeon/Cobweb2', 2, 'ceiling'], ['dungeon/Skull', 2]] });
  ctx.zones.push(zone);
  ctx.interiors.push({ ...zone, biome: 'graveyard' });
  for (const x of [-2.2, 2.2]) kit.place('dungeon/Column', x, 0, mz + 3.8, 0, [0.6, 0.8, 0.6]);
  // the dead's own: gibbets, skull pikes, bone heaps, lanterns, dead trees
  // (no gibbets or skull pikes: the hanged were never buried in hallowed ground; they're at the
  // crossroads in the Gallowswood) bones turned up where the dead clawed out, a lamp by the
  // mausoleum path, and the gate's lantern on its pier
  for (const [id, x, z] of [['bellmourn/bone_heap', -38, G.z0 + 18], ['bellmourn/bone_heap', 25, G.z0 + 40], ['bellmourn/lamp_post', 10, G.z0 + 24], ['bellmourn/lamp_post', gate + 2.2, G.z1 - 4]]) kit.place(id, x, 0, z, R() * 6);
  kit.place('props/Lantern_Wall', gate - 2.6, 2.55, G.z1 + 0.35, 0, 1, { solid: false });
  const dead = kit.ids(/^(nature\/DeadTree_|trees\/DeadTree_|ultimate\/CommonTree_Dead_\d|ultimate\/Willow_Dead_\d)/);
  for (let i = 0; i < 16; i++) {
    const x = G.x0 + 2 + R() * (G.x1 - G.x0 - 4), z = G.z0 + 2 + R() * (G.z1 - G.z0 - 4);
    if (x > -12 && x < 12 && z < G.z0 + 22) continue;
    kit.place(dead[i % dead.length], x, 0, z, R() * 6, 0.8 + R() * 0.4, { solid: 'trunk' });
  }
  ctx.interiors.push({ x0: G.x0 + 2, z0: G.z0 + 2, x1: G.x1 - 2, z1: G.z1 - 2, y0: -1, y1: 8, floor: 0, name: 'The Bellmourn Graveyard', biome: 'graveyard', outdoor: true });
}

// ------------------------------------------------------------------ the trail east
function trail(ctx, R) {
  const { kit } = ctx;
  for (let x = 140, k = 0; x < REGION.x0; x += 26, k++) kit.place('bellmourn/lamp_post', x, 0, k % 2 ? 4.2 : -4.2, k % 2 ? Math.PI : 0);
  for (const [cx, cz, kitList] of [[190, 7.2, ['dungeon/Woodfire', 'bellmourn/woodpile', 'props/Crate_Wooden', 'props/Stool', 'props/Bag', 'props/Bucket_Wooden_1']],
    [256, -7.2, ['dungeon/Woodfire', 'props/Barrel', 'props/Chest_Wood', 'props/Rope_3', 'props/WeaponStand', 'props/Pouch_Large']]]) {
    kitList.forEach((id, i) => kit.place(id, cx + (i ? Math.cos(i * 1.4) * 2.4 : 0), 0, cz + Math.sign(cz) * (i ? 1.6 + Math.sin(i * 1.4) : 0), R() * 6));
  }
}

// ------------------------------------------------------------------ what wasn't placed
/** Counts what in the kit went unplaced. (It used to be dumped in rows in a "mason's yard", a
 * store and a corner of the Deepwood, so that every model was somewhere; a model with no place
 * of its own is better left out than set down for the sake of it.) */
function coverage(ctx) {
  const { kit } = ctx;
  const left = kit.ids((id) => !kit.used.has(id) && !id.includes('~lod'));
  ctx.coverage = { unplaced: left.length };
}

export { BIOMES, biomeAt, worldHeight, flatten, THREE };
