// The other ways under the ground, and who waits down them.
//
// In the Darkwood two old stone stair-houses stand over flights down to dungeons of their own
// (dungeon.js, each from its own seed): the Barrow of Saint Ivo to the north-west (clear of the
// Vigil Road and Blackvigil Keep's clearing), a crypt of the dead
// and their bones, and the Old Watch Cellars to the south-east, the stores, barracks and forge
// of a watch-house long gone. Along the Green Downs' cliff three caves open (cave.js): the
// Gloamhollow just north of Brightwater Falls, the Drowned Grotto beside them, and the Trollhole
// far up to the north.
//
// buildDelves(ctx) builds them all and returns the underground places with what haunts each
// ({dg, haunt, n} for dungeons, {dg, plan} for caves), for zombies.js to fill.
import { buildDungeon } from './dungeon.js';
import { Cave, caveNav, grottoLayout, GROTTO_DECOR, trollLayout, TROLL_DECOR } from './cave.js';
import { holeTerrain, CAVE_MOUTHS } from './terrain.js';

// the stairs down: 14 m in 56 steps, going north from the stair-house's door
const FLIGHT = { depth: 14, step: 0.25, run: 0.34, width: 2.4 };
export const DELVES = [
  { key: 'barrow', name: 'The Barrow of Saint Ivo', x: -205, z: 95, seed: 7331, rooms: 13, loops: 2, haunt: 'barrow', n: 16,
    wall: 'stone_06_mossy_fieldstone_1_03', kinds: ['crypt', 'ossuary', 'shrine', 'collapsed hall', 'bone throne', 'vault', 'flooded crypt', 'great hall'] },
  { key: 'cellars', name: 'The Old Watch Cellars', x: 150, z: 186, seed: 5150, rooms: 12, loops: 2, haunt: 'cellars', n: 14,
    wall: 'keep_16_castle_stone_02', kinds: ['storeroom', 'barracks', 'well chamber', 'forge', 'library', 'flooded crypt', 'pillared hall'] },
];

/** The ground a stair-house stands on (its walls included): the world leaves it bare. */
export function delveFootprint(d) { return [d.x - 3.1, d.z - 6.5, d.x + 3.1, d.z + 3.5]; }

/** A stair-house over a flight down: stone walls with a doorway on the south, a heavy roof, the
 * stairwell open in its floor, the flight's walls and vault below ground and torches down it.
 * Returns the foot of the stairs. */
function stairHouse(ctx, d) {
  const { b, lib, props, physics, bill } = ctx;
  const M = (id, tile = 2.5) => lib.material(lib.surf.has(id) ? id : 'castle_basalt', { tile });
  const wall = M(d.wall, 3), floor = M('catacombs_crypt_limestone', 2), roof = M('castle_roof_black', 2), trim = M('catacombs_slate_bricks', 1.5);
  const { x, z } = d, F = 0.06, H = 3.6, T = 0.45;
  const hx0 = x - 2.6, hx1 = x + 2.6, hz0 = z - 6, hz1 = z + 3;
  // the floor round the stairwell (the stairs start at z and go down to the north)
  b.box([hx0, 0, hz0], [x - 1.2, F, hz1], floor);
  b.box([x + 1.2, 0, hz0], [hx1, F, hz1], floor);
  b.box([x - 1.2, 0, z], [x + 1.2, F, hz1], floor);
  // walls, the doorway in the south one, and a lintel over it
  b.box([hx0 - T, 0, hz0 - T], [hx1 + T, H, hz0], wall);
  b.box([hx0 - T, 0, hz0], [hx0, H, hz1], wall);
  b.box([hx1, 0, hz0], [hx1 + T, H, hz1], wall);
  b.box([hx0 - T, 0, hz1], [x - 0.95, H, hz1 + T], wall);
  b.box([x + 0.95, 0, hz1], [hx1 + T, H, hz1 + T], wall);
  b.box([x - 0.95, 2.75, hz1], [x + 0.95, H, hz1 + T], wall);
  for (const sx of [-1, 1]) b.box([x + sx * 1.25 - 0.25, 0, hz1 + T], [x + sx * 1.25 + 0.25, 3.0, hz1 + T + 0.35], trim);   // door posts
  // a heavy roof with a ridge
  b.box([hx0 - 0.8, H, hz0 - 0.8], [hx1 + 0.8, H + 0.35, hz1 + 0.8], roof);
  b.box([x - 0.6, H + 0.35, hz0 - 0.6], [x + 0.6, H + 0.85, hz1 + 0.6], trim);
  // the flight, its walls and vault (from where the house ends, under the ground) and its torches
  const n = Math.round(FLIGHT.depth / FLIGHT.step), zEnd = z - n * FLIGHT.run, yEnd = -n * FLIGHT.step;
  b.stairs(x, z, 0, -FLIGHT.depth, FLIGHT.width, '-z', floor, { step: FLIGHT.step, run: FLIGHT.run });
  for (const sx of [-1, 1]) b.box([x + sx * 1.2 - (sx > 0 ? 0 : 0.5), yEnd - 1, zEnd], [x + sx * 1.2 + (sx > 0 ? 0.5 : 0), 0, z], wall, { shade: 0.8 });
  const slab = (zz) => -((z - zz) / FLIGHT.run) * FLIGHT.step + 3.6;     // the vault: 3.4 m clear over the nosings
  b.beam([x, slab(hz0), hz0], [x, slab(zEnd), zEnd], 3.95, 0.4, trim, { up: [0, 1, 0] });
  b.box([x - 1.7, slab(hz0) - 0.3, hz0 - T], [x + 1.7, 0, hz0], wall);      // under the back wall, down to the vault
  for (let zz = z - 1.6, k = 0; zz > zEnd + 0.5; zz -= 3.2, k++) {
    const y = -(Math.floor((z - zz) / FLIGHT.run) + 1) * FLIGHT.step, sx = k % 2 ? 1 : -1;
    props.add('wall_torch', x + sx * 1.18, y, zz, sx < 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  // inside: candles; outside: what marks the place (graves for the barrow, crates for the cellars)
  props.add('candelabrum', hx0 + 0.6, F, hz1 - 0.6); props.add('candelabrum', hx1 - 0.6, F, hz1 - 0.6);
  if (d.key === 'barrow') {
    const graves = ['gravestone_cross', 'gravestone_round', 'gravestone_obelisk'];
    for (let q = 0; q < 7; q++) {
      const a = 0.6 + q * 0.75, r = 6.5 + (q % 3);
      props.add(graves[q % 3], x + Math.cos(a) * r * (q % 2 ? 1 : -1), 0, z + 3 + Math.sin(a) * r * 0.6, (q * 1.7) % 6.28);
    }
    bill.add('catacombs_skull_pyramid', x - 1.9, F, hz0 + 0.8, 1, 0.8);
  } else {
    for (let q = 0; q < 5; q++) props.add(q % 2 ? 'barrel' : 'crate', x + 4.2 + (q % 2) * 0.9, 0, z - 3 + q * 1.3, q);
    props.add('crate', hx0 + 0.7, F, hz0 + 0.8, 0.3);
  }
  physics.groundHoles.push([hx0, hz0, hx1, hz1]);
  ctx.zones.push({ x0: hx0, z0: hz0, x1: hx1, z1: hz1, y0: -1, y1: H, name: d.name });
  return { x, y: yEnd, z: zEnd };
}

/** A cave's mouth framed in the cliff's own rock: great stones either side of the cut, a capstone
 * over it (clear of a man's head), moss on top, and rubble fallen before it; the Trollhole's with
 * gnawed bones, the Drowned Grotto's wet and mossy. */
function frameMouth(ctx, c) {
  const { b, lib, bill } = ctx;
  const M = (id, t) => lib.material(lib.surf.has(id) ? id : 'castle_basalt', { tile: t });
  // (framed in the cliff's own rock, wrapped by world position like the downs' boulders)
  const Mt = (id, t, tint) => lib.material(id, { tile: t, tint, tri: true });
  // (a shade lighter than the face round them, and mossy on the outer stones: a cave's mouth is a
  // landmark, to be found from across the downs)
  const rock = [Mt('rock_06_overworld_mossy_rock_1_03', 3, 0xd0c8bc), Mt('cliff_07_coarse_gravel_11_01', 6.5, 0xd0c8bc), Mt('rock_06_overworld_mossy_rock_1_03', 3, 0xd0c8bc)], moss = Mt('rock_06_overworld_mossy_rock_1_03', 2, 0xffffff);
  const x = c.px, z = c.pz, fl = c.floorAt(x + 0.5, z) ?? c.mouth.y, ground = (xx, zz) => ctx.physics.groundAt(xx, zz);
  const H = c.name === 'The Trollhole' ? 1.25 : 1;                 // the Trollhole's mouth is the bigger
  let seed = Math.round(Math.abs(z) * 7) + 31;
  const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const side of [-1, 1]) {                     // the jambs: two stones each side, the outer one higher
    for (let k = 0; k < 2; k++) {
      const rz = 1.1 + R() * 0.4, cz = z + side * (2.35 + rz + k * 1.4), cx = x - 0.6 + k * 0.9, ry = (2.0 + k * 0.9 + R() * 0.6) * H;
      b.place(cx, ground(cx, cz) - 0.4, cz, 0, 1, (B) => {
        B.blob([0, ry * 0.5, 0], [1.2 + R() * 0.5, ry, rz], rock[(k + (side > 0 ? 1 : 0)) % 3], { detail: 2, jitter: 0.18, seed: seed + k });
        if (R() < 0.7) B.blob([0, ry * 1.05, 0], [1.0, ry * 0.18, rz * 0.8], moss, { detail: 2, jitter: 0.3, seed: seed + 7 });
      }, { tag: 'rock' });
    }
  }
  // the capstone across the top, its underside 3.4 m over the floor (the Trollhole's higher)
  b.place(x - 0.3, fl + 3.4 * H + 0.75, z, 0, 1, (B) => {
    B.blob([0, 0, 0], [1.5, 0.75, 3.6 * H], rock[0], { detail: 2, jitter: 0.15, seed: seed + 3, floor: -0.7 });
    B.blob([0.2, 0.6, 0], [1.2, 0.3, 3.0 * H], moss, { detail: 2, jitter: 0.3, seed: seed + 4 });
  }, { tag: 'rock' });
  // rubble fallen before it (out of the way in)
  for (let k = 0; k < 7; k++) {
    const side = k % 2 ? 1 : -1, cz = z + side * (2.6 + R() * 3.5), cx = x - 2.5 - R() * 4, s = 0.25 + R() * 0.45;
    b.place(cx, ground(cx, cz) - s * 0.3, cz, R() * 6.28, 1, (B) => B.blob([0, s * 0.5, 0], [s * 1.3, s, s * 1.1], rock[k % 3], { seed: seed + 20 + k }), { tag: 'rock', solid: false });
  }
  const BITS = c.name === 'The Trollhole' ? ['catacombs_long_bone_heap', 'catacombs_skull_pyramid', 'catacombs_long_bone_heap']
    : c.name === 'The Drowned Grotto' ? ['catacombs_burial_urn_cluster'] : ['catacombs_long_bone_heap'];
  BITS.forEach((id, k) => bill.add(id, x - 3.2 - k * 1.3, ground(x - 3.2 - k * 1.3, z + (k % 2 ? 2.6 : -2.6)), z + (k % 2 ? 2.6 : -2.6), 1, 0.85));
}

/** Everything under the ground besides the Undercroft: [{dg, haunt, n} or {dg, plan}]. */
export function buildDelves(ctx) {
  const out = [];
  for (const d of DELVES) {
    const foot = stairHouse(ctx, d);
    const dg = buildDungeon(ctx, foot, { name: d.name, seed: d.seed, rooms: d.rooms, loops: d.loops, kinds: d.kinds,
      X0: Math.round(foot.x - 65), Z0: Math.round(foot.z - 110), NX: 130, NZ: 118 });
    out.push({ dg, haunt: d.haunt, n: d.n });
    (ctx.entrances ||= []).push([d.x, d.z]);
  }
  // the caves in the cliff: their mouths are cut in the downs' ground
  ctx.land = { hole: (x0, z0, x1, z1, yTop, physics) => holeTerrain(x0, z0, x1, z1, yTop, physics, ctx.scene) };
  // (each in its own rock: grey limestone, wet shale where the water gets in, the Trollhole black
  // basalt; the dark ones brightened a little, as the generated rock was, so torchlight still finds them)
  const gloam = new Cave(ctx, { z: CAVE_MOUTHS.gloam, rock: 'rock_01_cave_gray_limestone_1_02' });
  const grotto = new Cave(ctx, { z: CAVE_MOUTHS.grotto, name: 'The Drowned Grotto', layout: grottoLayout, water: { a: 22, b: -30, r: 7 }, decor: GROTTO_DECOR, seed: 1337, rock: 'rock_03_cave_wet_shale_2_01', rockK: 2.4 });
  const troll = new Cave(ctx, { z: CAVE_MOUTHS.troll, name: 'The Trollhole', layout: trollLayout, water: null, decor: TROLL_DECOR, seed: 2718, rock: 'rock_02_cave_dark_basalt_1_05', rockK: 2.6 });
  for (const c of [gloam, grotto, troll]) frameMouth(ctx, c);
  ctx.cave = gloam;                  // (the ghasts' and grubbers' own: foes.js fills it)
  ctx.caves = [gloam, grotto, troll];
  out.push({ dg: caveNav(gloam), plan: [['cavern', 3, 'hollow'], ['shrine', 2, 'hollow'], ['loop', 2, 'fungal']] });
  out.push({ dg: caveNav(grotto), plan: [['pool', 5, 'water'], ['cistern', 3, 'water'], ['drowned', 4, 'water'], ['gallery', 1, 'water'], ['drain', 1, 'water']] });
  out.push({ dg: caveNav(troll), plan: [['lair', 3, 'troll'], ['larder', 2, 'troll'], ['grove', 5, 'fungal'], ['seep', 1, 'fungal'], ['loop', 1, 'troll']] });
  return out;
}
