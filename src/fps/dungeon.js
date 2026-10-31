// The dungeons: the Undercroft under the graveyard (reached by the stairs from the cathedral
// office, with the Deep Undercroft a level below it, down the stairs in its stair hall), and the
// delves in the Darkwood (delves.js). Each is carved on a 1 m grid from a fixed seed, so it is
// the same every time: rooms placed without overlaps, joined by a spanning tree of L-shaped
// hallways plus a few extra loops. Rooms are 5 m tall (a great hall 7.5), hallways 3.2 m.
import * as THREE from 'three';
import { wallPanel } from './sprites.js';

const THEMES = [
  { name: 'catacomb', floor: 'catacombs_weathered_cobbles', wall: 'castle_basalt' },
  { name: 'crypt', floor: 'catacombs_crypt_limestone', wall: 'castle_chapel' },
  { name: 'sewer', floor: 'sewers_sewer_cobbles', wall: 'castle_brick' },
  { name: 'cave', floor: 'cave_dec_03', wall: 'cave_dec_07' },
  { name: 'ossuary', floor: 'catacombs_ossuary_aggregate', wall: 'castle_soot' },
  { name: 'mossy', floor: 'catacombs_moss_cobbles', wall: 'castle_mossy' },
  { name: 'keep', floor: 'castle_keep_charcoal_guardstone', wall: 'castle_iron' },
];
const KINDS = ['pillared hall', 'crypt', 'library', 'shrine', 'storeroom', 'vault', 'ossuary'];
// the Undercroft, its deep level, and what else a dungeon's rooms can be
export const UNDERCROFT = { name: 'The Undercroft', seed: 9001, rooms: 24, loops: 3, down: true, footH: 4.2,
  X0: -80, Z0: -260, NX: 170, NZ: 154,
  kinds: ['pillared hall', 'crypt', 'library', 'shrine', 'storeroom', 'vault', 'ossuary', 'flooded crypt', 'great hall', 'barracks',
    'collapsed hall', 'well chamber', 'bone throne', 'forge'] };
export const DEEP_UNDERCROFT = { name: 'The Deep Undercroft', seed: 4242, rooms: 15, loops: 3, footH: 5,
  kinds: ['great hall', 'ossuary', 'flooded crypt', 'bone throne', 'forge', 'collapsed hall', 'crypt', 'vault', 'shrine', 'well chamber'] };

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** A dungeon whose stairs come down to `entry` (from the south, heading north). opts: name,
 * seed, rooms (how many), loops (extra hallways beyond the spanning tree), kinds (what its rooms
 * are), down (a stair hall going on down a level: its foot is returned as stairDown), and its
 * grid: X0, Z0 (metres) and NX, NZ (cells); by default a 150 x 130 m patch north of the entry. */
export function buildDungeon(ctx, entry, opts = UNDERCROFT) {
  const { lib, b, props, bill } = ctx;
  const R = rng(opts.seed ?? 9001);
  const Y = entry.y, ROOM_H = 5, HALL_H = 3.2, GREAT_H = 7.5;
  const X0 = opts.X0 ?? Math.round(entry.x - 75), Z0 = opts.Z0 ?? Math.round(entry.z - 122);
  const NX = opts.NX ?? 150, NZ = opts.NZ ?? 130;           // grid origin (metres) and size
  const ROOMS = opts.rooms ?? 15, KIND_LIST = opts.kinds || KINDS;
  const cell = new Int16Array(NX * NZ).fill(-1);  // -1 rock, 0..n-1 room id, 1000+ hallway id
  const at = (i, k) => (i < 0 || k < 0 || i >= NX || k >= NZ ? -1 : cell[k * NX + i]);
  const set = (i, k, v) => { if (i >= 0 && k >= 0 && i < NX && k < NZ && cell[k * NX + i] < 0) cell[k * NX + i] = v; };
  const gi = (x) => Math.floor(x - X0), gk = (z) => Math.floor(z - Z0);

  // rooms: the entry hall at the foot of the stairs, the stair hall down (if any) well away from
  // it, then the rest without overlapping
  const rooms = [{ i: gi(entry.x - 6), k: gk(entry.z - 13), w: 12, d: 13, theme: THEMES[1], kind: 'entry hall' }];
  const clash = (i, k, w, d) => rooms.some((r) => i < r.i + r.w + 5 && i + w + 5 > r.i && k < r.k + r.d + 5 && k + d + 5 > r.k);
  let tries = 0;
  if (opts.down) {
    while (tries++ < 5000) {
      const w = 10, d = 22, i = 2 + Math.floor(R() * (NX - w - 4)), k = 2 + Math.floor(R() * (NZ - d - 20));
      if (clash(i, k, w, d) || Math.hypot(i + w / 2 - rooms[0].i - 6, k + d / 2 - rooms[0].k - 6) < 55) continue;
      rooms.push({ i, k, w, d, kind: 'stair hall' });
      break;
    }
  }
  tries = 0;
  while (rooms.length < ROOMS && tries++ < 8000) {
    const w = 7 + Math.floor(R() * 10), d = 7 + Math.floor(R() * 10);
    const i = 2 + Math.floor(R() * (NX - w - 4)), k = 2 + Math.floor(R() * (NZ - d - 20));
    if (clash(i, k, w, d)) continue;
    rooms.push({ i, k, w, d, theme: THEMES[Math.floor(R() * THEMES.length)], kind: KIND_LIST[rooms.length % KIND_LIST.length] });
  }
  for (const r of rooms) r.h = r.kind === 'great hall' && r.w >= 9 && r.d >= 9 ? GREAT_H : ROOM_H;
  rooms.forEach((r, id) => { for (let a = 0; a < r.w; a++) for (let c = 0; c < r.d; c++) set(r.i + a, r.k + c, id); });

  // hallways: a minimum spanning tree over the room centres (Prim), plus one extra loop
  const ctr = rooms.map((r) => [r.i + r.w / 2, r.k + r.d / 2]);
  const inTree = new Set([0]), edges = [];
  while (inTree.size < rooms.length) {
    let best = null;
    for (const a of inTree) for (let c = 0; c < rooms.length; c++) {
      if (inTree.has(c)) continue;
      const d = Math.hypot(ctr[a][0] - ctr[c][0], ctr[a][1] - ctr[c][1]);
      if (!best || d < best[2]) best = [a, c, d];
    }
    inTree.add(best[1]);
    edges.push(best);
  }
  // the extra loops: the shortest pairs not yet joined, so a chase can go round
  for (let n = 0; n < (opts.loops ?? 1); n++) {
    let extra = null;
    for (let a = 0; a < rooms.length; a++) for (let c = a + 1; c < rooms.length; c++) {
      if (edges.some((e) => (e[0] === a && e[1] === c) || (e[0] === c && e[1] === a))) continue;
      const d = Math.hypot(ctr[a][0] - ctr[c][0], ctr[a][1] - ctr[c][1]);
      if (!extra || d < extra[2]) extra = [a, c, d];
    }
    if (extra) edges.push(extra);
  }
  edges.forEach(([a, c], n) => {
    const id = 1000 + n;
    const [ax, az] = ctr[a].map(Math.floor), [cx, cz] = ctr[c].map(Math.floor);
    const horizFirst = R() < 0.5;
    const carve = (i, k) => { for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) set(i + u, k + v, id); };
    if (horizFirst) {
      for (let i = Math.min(ax, cx); i <= Math.max(ax, cx); i++) carve(i, az);
      for (let k = Math.min(az, cz); k <= Math.max(az, cz); k++) carve(cx, k);
    } else {
      for (let k = Math.min(az, cz); k <= Math.max(az, cz); k++) carve(ax, k);
      for (let i = Math.min(ax, cx); i <= Math.max(ax, cx); i++) carve(i, cz);
    }
  });
  // the foot of the stairs: a short passage (hallway height, so the entry hall gets a lintel
  // over it) through the entry hall's south wall
  // and beyond it the stair tunnel itself, which has its own walls and vault: open (no walls
  // between it and the passage) but built by the cathedral, not here
  const sx = gi(entry.x), FOOT = 1999, TUNNEL = 2999, WELL = 3999;
  for (let k = gk(entry.z); k <= gk(entry.z + 0.6); k++) for (let u = -1; u <= 1; u++) cell[k * NX + sx + u] = FOOT;
  for (let k = gk(entry.z + 0.6) + 1; k <= gk(entry.z + 5); k++) for (let u = -1; u <= 1; u++) if (k < NZ) cell[k * NX + sx + u] = TUNNEL;
  // a header of stone over the passage's mouth, where its ceiling meets the stairs' vault or shaft
  const zT = Z0 + gk(entry.z + 0.6) + 1, headerMat = lib.material('castle_basalt', { tile: 2 });
  b.box([entry.x - 1.7, Y + FOOT_H_OF(opts), zT - 0.2], [entry.x + 1.7, Y + FOOT_H_OF(opts) + 1.6, zT + 0.2], headerMat, { solid: false, shade: 0.8 });
  // the stair hall's stairwell: a flight 12 m down (48 steps of 0.34, as the other stairs), north
  // along the hall's middle; no floor over it
  const stairRoom = rooms.findIndex((r) => r.kind === 'stair hall');
  let well = null;
  const WELL_STEP = 0.25, WELL_RUN = 0.34, WELL_N = 48;
  if (stairRoom > 0) {
    // (centred on its three cells, so the flight fills them)
    // (its head on a cell's edge, so the hall's floor ends where the first step begins: 2 m in
    // from the south wall, or 3 m where a hallway comes in through it in line with the flight,
    // which hallways from the hall's middle do, so the floor before that mouth is kept clear)
    const r = rooms[stairRoom], wi = r.i + Math.floor(r.w / 2), wx = X0 + wi + 0.5;
    const inLine = [-3, -2, -1, 0, 1, 2, 3].some((u) => { const v = at(wi + u, r.k + r.d); return v >= 1000 && v !== TUNNEL; });
    const top = Z0 + r.k + r.d - (inLine ? 3 : 2);
    well = { x: wx, top, bot: top - WELL_N * WELL_RUN, room: stairRoom };
    for (let k = gk(well.bot); k < gk(top); k++) for (let u = -1; u <= 1; u++) cell[k * NX + gi(wx) + u] = WELL;
  }

  // every room and hallway gets surfaces of its own, drawn from the textures the world above
  // hasn't used yet, so the whole Velscour library ends up somewhere down here
  const FLOOR = /^(catacombs|cathedral_graveyard|sewers|castle_keep|sand)_|^cave_dec|^dark_forest_|^town_(?!.*(meadow|grass|clover|moss_cover|verge|field|roof|wall_))/;
  const WALL = /^cave_dec|^castle_(?!roof)|^castle_keep_|^sewers_(culvert|eroded|calcified|iron_studded|weathered_sluice)|^catacombs_(slate_bricks|black_basalt|burial_terracotta)|^sand_(quartz|fossil|lapis|rose_stone|turquoise|copper|obsidian|amber|salt_cavern|sulfur|basalt|chipped|engraved)|^met_/;
  const CEIL = /^cave_dec|^castle_roof|^castle_(wood|panel)|^met_|^ship_|^wood_|^sand_(weathered_palm|date_press|reed_weave)/;
  const pick = (re, salt) => lib.take((s) => re.test(s.id), salt);
  // the walls are the catacomb pack's full-height wall panels (coping under the ceiling,
  // plinth on the floor): the carved ones in the rooms, by what each room is, and the plainer
  // masonry in the hallways
  const panel = (ids, n) => { const ok = ids.filter((id) => lib.surf.has(id)); return ok.length ? ok[n % ok.length] : null; };
  const cw = (n) => 'catacombs_wall_' + n;
  const ROOM_WALLS = { crypt: [cw('funerary_chapel'), cw('funerary_chapel_back')], ossuary: [cw('ossuary_niches')], vault: [cw('sealed_cells'), cw('sealed_cells_back')],
    shrine: [cw('funerary_chapel')], 'entry hall': [cw('funerary_chapel')], library: [cw('crypt_ashlar_back'), cw('ossuary_niches_back')],
    storeroom: [cw('crypt_ashlar'), cw('sealed_cells_back')], 'pillared hall': [cw('drowned_crypt'), cw('crypt_ashlar')] };
  const HALL_WALLS = [cw('crypt_ashlar'), cw('crypt_ashlar_back'), cw('drowned_crypt_back'), cw('drowned_crypt'), cw('sealed_cells_back')];
  rooms.forEach((r, i) => {
    const wall = panel(ROOM_WALLS[r.kind] || [cw('crypt_ashlar')], i);
    r.theme = i === 0 ? { floor: 'catacombs_crypt_limestone', wall: wall || 'castle_chapel', ceil: pick(CEIL, i), band: pick(WALL, i), inlay: pick(FLOOR, i) }
      : { floor: pick(FLOOR, i), wall: wall || pick(WALL, i), ceil: pick(CEIL, i), band: pick(WALL, i + 7), inlay: pick(FLOOR, i + 3) };
  });
  const halls = edges.map((_, n) => ({ floor: pick(FLOOR, n + 11), wall: panel(HALL_WALLS, n) || pick(WALL, n + 5), ceil: pick(CEIL, n + 2), band: pick(WALL, n + 9) }));

  // geometry
  const mat = (id, tile, o = {}) => lib.material(id, { tile, ...o });
  const themeOf = (v) => (v === FOOT ? rooms[0].theme : v === WELL ? rooms[well.room].theme : v >= 1000 ? halls[v - 1000] : rooms[v].theme);
  // (the passage at the foot of the stairs is 4.2 m, so the last steps under its ceiling keep
  // 3.2 m clear; as tall as the entry hall when the flight comes down open, from a stairwell; the
  // stairs' own cells (TUNNEL) have no ceiling here, so nothing is ever a lintel over them)
  const FOOT_H = opts.footH ?? 4.2;
  const ceilOf = (v) => (v === TUNNEL ? 99 : v === WELL ? rooms[well.room].h : v === FOOT ? FOOT_H : v >= 1000 ? HALL_H : rooms[v].h);
  const X = (i) => X0 + i, Z = (k) => Z0 + k;
  // floors and ceilings: merged runs along x of cells with the same theme and height
  for (let k = 0; k < NZ; k++) {
    let i = 0;
    while (i < NX) {
      const v = at(i, k);
      if (v < 0 || v === TUNNEL) { i++; continue; }
      const th = themeOf(v), h = ceilOf(v), open = v === WELL;
      let j = i;
      while (j + 1 < NX && at(j + 1, k) >= 0 && at(j + 1, k) !== TUNNEL && themeOf(at(j + 1, k)) === th && ceilOf(at(j + 1, k)) === h
        && (at(j + 1, k) === WELL) === open) j++;
      if (!open) b.box([X(i), Y - 0.5, Z(k)], [X(j + 1), Y, Z(k + 1)], mat(th.floor, 2.5), { shade: 0.9, faces: { bottom: false } });
      b.box([X(i), Y + h, Z(k)], [X(j + 1), Y + h + 0.5, Z(k + 1)], mat(th.ceil, 3), { shade: 0.55, faces: { top: false } });
      i = j + 1;
    }
  }
  // walls: wherever carved space meets rock, a merged run of boxes on the rock side; and a
  // lintel wherever a low hallway meets a taller room
  const wallRun = (horizontal) => {
    const A = horizontal ? NZ : NX, B = horizontal ? NX : NZ;
    for (let a = 0; a < A; a++) {
      for (const side of [-1, 1]) {
        let s = 0;
        while (s < B) {
          const here = horizontal ? at(s, a) : at(a, s);
          const there = horizontal ? at(s, a + side) : at(a + side, s);
          const lintel = here >= 0 && there >= 0 && ceilOf(there) < ceilOf(here);
          if (here < 0 || here === TUNNEL || (there >= 0 && !lintel)) { s++; continue; }
          const th = themeOf(here), y0 = lintel ? Y + ceilOf(there) : Y, y1 = Y + ceilOf(here);
          let e = s;
          for (;;) {
            const h2 = horizontal ? at(e + 1, a) : at(a, e + 1), t2 = horizontal ? at(e + 1, a + side) : at(a + side, e + 1);
            const l2 = h2 >= 0 && t2 >= 0 && ceilOf(t2) < ceilOf(h2);
            if (e + 1 >= B || h2 < 0 || h2 === TUNNEL || themeOf(h2) !== th || (t2 >= 0 && !l2) || l2 !== lintel || ceilOf(h2) !== ceilOf(here)) break;
            e++;
          }
          // a wall panel spans floor to ceiling (and on up over a hallway's lintel); any other
          // texture repeats every 3 m with a dado of another stone along its foot
          const isPanel = !!lib.surf.get(th.wall)?.wall_set;
          const m = mat(th.wall, isPanel ? ceilOf(here) : 3), band = mat(th.band, 1.5);
          const by = Math.min(y1, Y + 1.25); // a dado of another stone along the foot of the wall
          if (horizontal) {
            const z = side < 0 ? Z(a) : Z(a + 1);
            b.box([X(s), y0, side < 0 ? z - 0.5 : z], [X(e + 1), y1, side < 0 ? z : z + 0.5], m, { shade: 0.8, vbase: Y });
            if (!lintel && !isPanel) {
              b.box([X(s), Y, side < 0 ? z : z - 0.06], [X(e + 1), by, side < 0 ? z + 0.06 : z], band, { shade: 0.85, solid: false });
              b.box([X(s), by, side < 0 ? z : z - 0.1], [X(e + 1), by + 0.12, side < 0 ? z + 0.1 : z], band, { shade: 0.9, solid: false });
            }
          } else {
            const x = side < 0 ? X(a) : X(a + 1);
            b.box([side < 0 ? x - 0.5 : x, y0, Z(s)], [side < 0 ? x : x + 0.5, y1, Z(e + 1)], m, { shade: 0.8, vbase: Y });
            if (!lintel && !isPanel) {
              b.box([side < 0 ? x : x - 0.06, Y, Z(s)], [side < 0 ? x + 0.06 : x, by, Z(e + 1)], band, { shade: 0.85, solid: false });
              b.box([side < 0 ? x : x - 0.1, by, Z(s)], [side < 0 ? x + 0.1 : x, by + 0.12, Z(e + 1)], band, { shade: 0.9, solid: false });
            }
          }
          s = e + 1;
        }
      }
    }
  };
  wallRun(true);
  wallRun(false);

  // arches over the hallway mouths, on the room side (the catacomb pack's roman ossuary,
  // ironbound segmental and pointed funerary arches), wherever the wall has room for one
  const ARCHES = [['catacombs_roman_ossuary'], ['catacombs_ironbound_segmental'], ['catacombs_pointed_funerary']];
  const covered = rooms.map(() => ({ n: [], s: [], w: [], e: [] })); // wall stretches (metres along) an arch hides
  if (ctx.cutouts) rooms.forEach((r, id) => {
    const sides = [ // the cell just outside the wall at a metres along it, where the arch stands, facing
      ['n', r.w, (a) => at(r.i + a, r.k - 1), (c) => [X(r.i) + c, Z(r.k) + 0.25], 0],
      ['s', r.w, (a) => at(r.i + a, r.k + r.d), (c) => [X(r.i) + c, Z(r.k + r.d) - 0.25], Math.PI],
      ['w', r.d, (a) => at(r.i - 1, r.k + a), (c) => [X(r.i) + 0.25, Z(r.k) + c], Math.PI / 2],
      ['e', r.d, (a) => at(r.i + r.w, r.k + a), (c) => [X(r.i + r.w) - 0.25, Z(r.k) + c], -Math.PI / 2],
    ];
    sides.forEach(([key, n, outside, where, facing], si) => {
      const hall = (a) => { const v = outside(a); return v >= 1000 && v !== TUNNEL; };
      let a = 0;
      while (a < n) {
        if (!hall(a)) { a++; continue; }
        let e = a;
        while (e + 1 < n && hall(e + 1)) e++;
        const len = e + 1 - a, c = (a + e + 1) / 2;
        a = e + 1;
        if (len !== 3) continue; // a hallway meeting the wall end on, not running along it
        const [aid] = ARCHES[(id + si) % ARCHES.length], art = lib.biome.arches.get(aid);
        if (!art) continue;
        const s = archScale(art, ctx.cutouts.masks.get(aid)), half = art.size[0] * s / 2;
        if (!s || art.foot_px * s > r.h - 0.1 || c - half < 0.4 || c + half > n - 0.4) continue;
        let clear = true; // no other opening under it
        for (let k = Math.floor(c - half); k < Math.ceil(c + half); k++) if (k >= 0 && k < n && outside(k) >= 0 && (k < c - 1.5 || k >= c + 1.5)) clear = false;
        if (!clear) continue;
        const [x, z] = where(c);
        ctx.cutouts.place(aid, x, Y, z, facing, s * (art.opening_px[1] - art.opening_px[0]), 0.5, 'wall');
        covered[id][key].push([c - half - 0.4, c + half + 0.4]);
      }
    });
  });
  const hidden = (id, key, a) => covered[id][key].some(([p, q]) => a > p && a < q);

  // the ways kept clear: every hallway mouth keeps an apron of floor 3 m into its room (and a
  // cell wider either side), and the hallways and the stairwell stay empty. Nothing solid (a
  // prop, a sprite built in 3D, a block of masonry) is set down on any of it: it goes somewhere
  // else in the room, or not at all
  const isHall = (v) => v >= 1000 && v !== TUNNEL && v !== WELL;
  const keep = new Uint8Array(NX * NZ);
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    const v = at(i, k);
    if (isHall(v) || v === WELL) { keep[k * NX + i] = 1; continue; }
    if (v < 0) continue;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!isHall(at(i + di, k + dk))) continue;
      for (let t = 0; t < 3; t++) for (let s = -1; s <= 1; s++) {
        const ai = i - di * t + dk * s, ak = k - dk * t + di * s;
        if (at(ai, ak) === v) keep[ak * NX + ai] = 1;
      }
    }
  }
  /** Is the floor [x0, z0, x1, z1] clear of the ways (not over any of it at all)? (null takes no floor.) */
  const clear = (f) => {
    if (!f) return true;
    for (let k = gk(f[1]); k < Math.ceil(f[3] - Z0); k++) for (let i = gi(f[0]); i < Math.ceil(f[2] - X0); i++)
      if (at(i, k) >= 0 && keep[k * NX + i]) return false;
    return true;
  };
  // and how much of each room's floor is still open to walk on, counted as tools/pathcheck.js
  // counts it: quarter-metre cells of its floor (not the stairwell), less those within a body's
  // width (0.32 m) of its walls or of anything solid set down in it
  const BODY = 0.32, Q = 0.25;
  const open = rooms.map((r) => {
    const nx = r.w * 4, nz = r.d * 4, g = new Uint8Array(nx * nz);
    let n = 0, all = 0;
    for (let c = 0; c < nz; c++) for (let a = 0; a < nx; a++) {
      const u = (a + 0.5) * Q, v = (c + 0.5) * Q;
      if (at(r.i + Math.floor(u), r.k + Math.floor(v)) === WELL) continue;
      all++;
      if (u > BODY && r.w - u > BODY && v > BODY && r.d - v > BODY) { g[c * nx + a] = 1; n++; }
    }
    return { nx, nz, g, n, all };
  });
  const roomAt = (f) => { const v = at(gi((f[0] + f[2]) / 2), gk((f[1] + f[3]) / 2)); return v >= 0 && v < 1000 ? v : -1; };
  /** The open cells of its room a footprint would cover (the room's id, and them). */
  const covers = (f) => {
    const id = roomAt(f), out = [];
    if (id < 0) return { id, out };
    const r = rooms[id], o = open[id], rx = X(r.i), rz = Z(r.k);
    const a0 = Math.max(0, Math.floor((f[0] - BODY - rx) / Q)), a1 = Math.min(o.nx - 1, Math.floor((f[2] + BODY - rx) / Q));
    const c0 = Math.max(0, Math.floor((f[1] - BODY - rz) / Q)), c1 = Math.min(o.nz - 1, Math.floor((f[3] + BODY - rz) / Q));
    for (let c = c0; c <= c1; c++) for (let a = a0; a <= a1; a++) {
      if (!o.g[c * o.nx + a]) continue;
      const x = rx + (a + 0.5) * Q, z = rz + (c + 0.5) * Q;
      const dx = Math.max(f[0] - x, 0, x - f[2]), dz = Math.max(f[1] - z, 0, z - f[3]);
      if (dx * dx + dz * dz < BODY * BODY) out.push(c * o.nx + a);
    }
    return { id, out };
  };
  const occupy = (f) => { const { id, out } = covers(f); if (id < 0) return; for (const j of out) open[id].g[j] = 0; open[id].n -= out.length; };
  /** Would room `id` keep `share` of its floor open with f set down in it too? */
  const roomy = (f, share) => { const { id, out } = covers(f); return id < 0 || (open[id].n - out.length) / open[id].all >= share; };
  /** Prop `id` on the floor at (x, z) if it stands clear of the ways (and, given a `share`, if its
   * room keeps that much of its floor open with it there too); whether it was set down. */
  const put = (id, x, z, rot = 0, s = 1, fit = null, share = 0) => {
    const f = props.footprint(id, x, z, rot, s, fit);
    if (!clear(f) || (share && f && !roomy(f, share))) return false;
    props.add(id, x, Y, z, rot, s, fit);
    if (f) occupy(f);
    return true;
  };
  // a sprite is built in 3D (scatter3d.js), solid, at about its picture's width, turned any way
  const spriteFoot = (id, x, z, sc = 1) => {
    const s = lib.spr.get(id), w = s?.size ? s.height_m * s.size[0] / s.size[1] : 1, h = Math.max(0.5, 0.75 * w) * sc;
    return [x - h, z - h, x + h, z + h];
  };
  const sprite = (id, x, z, sc = 1, shade = 1, y = Y) => {
    const f = spriteFoot(id, x, z, sc);
    if (!clear(f)) return false;
    bill.add(id, x, y, z, sc, shade);
    occupy(f);
    return true;
  };
  /** A solid block of masonry, if it stands clear of the ways. */
  const block = (min, max, m, o = {}) => {
    const f = [min[0], min[2], max[0], max[2]];
    if (!clear(f)) return false;
    b.box(min, max, m, o);
    if (max[1] > Y + 0.42) occupy(f); // (anything lower is stepped up onto)
    return true;
  };
  // which walls of a room have openings in them (cells, n s w e), and a frame on each wall for
  // whatever is arranged against one (an altar, chests, books, a hearth, a throne): at(u, v) is u
  // along it from its middle and v out into the room, `face` the way into the room, a(u) how far
  // along the wall from its west or north end. walls(r) lists them fewest openings first (the
  // north, all else equal); backWall(r) is the first
  const openings = (r) => [
    Array.from({ length: r.w }, (_, a) => at(r.i + a, r.k - 1)), Array.from({ length: r.w }, (_, a) => at(r.i + a, r.k + r.d)),
    Array.from({ length: r.d }, (_, a) => at(r.i - 1, r.k + a)), Array.from({ length: r.d }, (_, a) => at(r.i + r.w, r.k + a)),
  ].map((cells) => cells.filter((v) => v >= 0 && v !== TUNNEL).length);
  const frame = (r, si) => {
    const x0 = X(r.i), z0 = Z(r.k), x1 = X(r.i + r.w), z1 = Z(r.k + r.d), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const [bx, bz, dx, dz, along, deep, key] = [[cx, z0, 0, 1, r.w, r.d, 'n'], [cx, z1, 0, -1, r.w, r.d, 's'], [x0, cz, 1, 0, r.d, r.w, 'w'], [x1, cz, -1, 0, r.d, r.w, 'e']][si];
    const at2 = (u, v) => [bx + dz * u + dx * v, bz - dx * u + dz * v];
    const rect = (u0, v0, u1, v1) => { const [ax, az] = at2(u0, v0), [ex, ez] = at2(u1, v1); return [Math.min(ax, ex), Math.min(az, ez), Math.max(ax, ex), Math.max(az, ez)]; };
    // the first u (from the middle outward, half a metre at a time) where fn(u) holds and
    // something `half` wide still fits on the wall, or null
    const slide = (half, fn) => {
      for (let n = 0; n * 0.5 + half < along / 2 - 0.2; n++) for (const u of n ? [-n * 0.5, n * 0.5] : [0]) if (fn(u)) return u;
      return null;
    };
    return { at: at2, rect, slide, face: Math.atan2(dx, dz), along, deep, key, a: (u) => (dx ? at2(u, 0)[1] - z0 : at2(u, 0)[0] - x0) };
  };
  const walls = (r) => { const o = openings(r); return [0, 1, 2, 3].sort((a, c) => o[a] - o[c]).map((si) => frame(r, si)); };
  const backWall = (r) => walls(r)[0];
  /** The first wall of room r (fewest openings first) with a place along it, `half` wide, where
   * fits(B, u) holds: { B, u }, or null. */
  const against = (r, half, fits) => {
    for (const B of walls(r)) { const u = B.slide(half, (u) => fits(B, u)); if (u !== null) return { B, u }; }
    return null;
  };
  /** Try fn(x, z) at random points of room r (`inset` in from its walls) until it takes. */
  const somewhere = (r, fn, inset = 1, tries = 6) => {
    for (let t = 0; t < tries; t++) if (fn(X(r.i) + inset + R() * (r.w - 2 * inset), Z(r.k) + inset + R() * (r.d - 2 * inset))) return true;
    return false;
  };
  /** The nearest point to (x, z), out to `reach` metres, half a metre at a time, where fn takes. */
  const nearest = (x, z, fn, reach = 4) => {
    for (let n = 0; n <= reach * 2; n++) for (let a = -n; a <= n; a++) for (let c = -n; c <= n; c++) {
      if (Math.max(Math.abs(a), Math.abs(c)) !== n) continue;
      if (fn(x + a * 0.5, z + c * 0.5)) return [x + a * 0.5, z + c * 0.5];
    }
    return null;
  };

  // furnishing, torches and lights
  const cat = (n) => 'catacombs_' + n;
  rooms.forEach((r, id) => {
    const x0 = X(r.i), z0 = Z(r.k), x1 = X(r.i + r.w), z1 = Z(r.k + r.d), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const fy = Y;
    // torches around the walls (not where an arch stands)
    for (let x = x0 + 2.5; x < x1 - 1; x += 5) {
      if (at(gi(x), r.k - 1) < 0 && !hidden(id, 'n', x - x0)) props.add('wall_torch', x, fy, z0 + 0.02, 0);
      if (at(gi(x), r.k + r.d) < 0 && !hidden(id, 's', x - x0)) props.add('wall_torch', x, fy, z1 - 0.02, Math.PI);
    }
    for (let z = z0 + 2.5; z < z1 - 1; z += 5) {
      if (at(r.i - 1, gk(z)) < 0 && !hidden(id, 'w', z - z0)) props.add('wall_torch', x0 + 0.02, fy, z, Math.PI / 2);
      if (at(r.i + r.w, gk(z)) < 0 && !hidden(id, 'e', z - z0)) props.add('wall_torch', x1 - 0.02, fy, z, -Math.PI / 2);
    }
    // (everything solid set down clear of the ways, see put(); what stands against a wall stands
    // against the one with fewest openings)
    const kind = r.kind, B = backWall(r);
    if (kind === 'pillared hall' || kind === 'entry hall') {
      const pil = ['pillar_round', 'pillar_fluted', 'pillar_square', 'pillar_twisted'][id % 4];
      for (let x = x0 + 3; x < x1 - 2; x += 4) for (const z of [z0 + 2.5, z1 - 2.5]) {
        if (kind === 'entry hall' && Math.abs(x - entry.x) < 2.2) continue;     // not before the stairs
        put(pil, x, z, 0, 1.2);
      }
    } else if (kind === 'crypt') {
      for (let x = x0 + 2.5; x < x1 - 2; x += 3) put('sarcophagus', x, cz, Math.PI / 2);
      put('candelabrum', x0 + 1.2, z0 + 1.2); put('candelabrum', x1 - 1.2, z1 - 1.2);
    } else if (kind === 'library') {
      // the shelves along the back wall, the reading table in the middle
      for (let u = -B.along / 2 + 1.5; u < B.along / 2 - 1; u += 1.4) if (!hidden(id, B.key, B.a(u))) put('bookshelf', ...B.at(u, 0.3), B.face);
      put('table', cx, cz, 0); put('stool', cx, cz + 1.2); put('candelabrum', cx + 1.6, cz);
    } else if (kind === 'shrine') {
      // the altar against a wall with candles either side, the pews facing it
      const p = against(r, 3, (W, u) => clear(props.footprint('altar', ...W.at(u, 1.6), W.face)));
      if (p) {
        const { B: W, u } = p;
        put('altar', ...W.at(u, 1.6), W.face);
        put('candelabrum', ...W.at(u - 2.4, 1.6)); put('candelabrum', ...W.at(u + 2.4, 1.6));
        for (let v = 4; v < W.deep - 1.5; v += 1.8) put('pew', ...W.at(u, v), W.face + Math.PI, 0.8);
      }
    } else if (kind === 'storeroom') {
      for (let n = 0; n < 9; n++) somewhere(r, (x, z) => put(n % 3 ? 'crate' : 'barrel', x, z, R() * 3));
    } else if (kind === 'vault') {
      // the chests against the back wall, a broken column in the middle
      for (let u = -B.along / 2 + 1.5, made = 0; u < B.along / 2 - 1 && made < 3; u += 0.4) if (put('treasure_chest', ...B.at(u, 0.8), B.face)) { made++; u += 1.2; }
      const turn = R() * 6, mid = nearest(cx, cz, (x, z) => clear(props.footprint('pillar_broken', x, z, turn)), 2);
      if (mid) put('pillar_broken', ...mid, turn);
    } else if (kind === 'ossuary') {
      for (let n = 0; n < 10; n++) {
        const s = [cat('skull_pyramid'), cat('long_bone_heap'), cat('supine_skeleton'), cat('ossuary_urn'), cat('burial_urn_cluster')][n % 5];
        somewhere(r, (x, z) => sprite(s, x, z, 1, 0.9));
      }
    } else furnish(r, id, x0, z0, x1, z1, cx, cz, B);
    if (R() < 0.7) {
      // a stand, a brazier or a candelabrum in the far corner (or another, clear of the ways),
      // unless the room is full enough already
      const id = [cat('torch_stand'), cat('incense_brazier'), cat('iron_candelabrum'), cat('effigy_sarcophagus')][Math.floor(R() * 4)];
      const c = [[x1 - 1.5, z1 - 1.5], [x0 + 1.5, z1 - 1.5], [x1 - 1.5, z0 + 1.5], [x0 + 1.5, z0 + 1.5]].find(([x, z]) => clear(spriteFoot(id, x, z)) && roomy(spriteFoot(id, x, z), 0.62));
      if (c) {
        sprite(id, ...c);
        const s = lib.sprite(id); // stands and braziers burn
        if (s && !/sarcophagus/.test(id)) ctx.flames?.push([c[0], fy + s.height_m * 0.95, c[1], /brazier/.test(id) ? 0.45 : 0.3]);
      }
    }
  });
  // the stair hall: a flight down the stairwell, the shaft's walls below the floor, a parapet
  // round the well (open at its head), and torches down the shaft
  if (well) {
    const stone = mat(rooms[well.room].theme.band, 1.5), wx = well.x;
    b.stairs(wx, well.top, Y, -WELL_N * WELL_STEP, 2.4, '-z', mat(rooms[well.room].theme.floor, 1.5), { step: WELL_STEP, run: WELL_RUN });
    for (const sgn of [-1, 1]) {
      b.box([wx + sgn * 1.5 - (sgn > 0 ? 0 : 0.5), Y - 12.6, well.bot], [wx + sgn * 1.5 + (sgn > 0 ? 0.5 : 0), Y, well.top], stone, { shade: 0.75 });
      b.box([wx + sgn * 1.5 - (sgn > 0 ? 0 : 0.3), Y, well.bot - 0.3], [wx + sgn * 1.5 + (sgn > 0 ? 0.3 : 0), Y + 1.05, well.top], stone, { shade: 0.85 });
    }
    // the shaft's far end, walled from the parapet down to the ceiling of the passage below
    b.box([wx - 1.5, Y - 12 + (DEEP_UNDERCROFT.footH ?? 5), Math.floor(well.bot) - 0.3], [wx + 1.5, Y + 1.05, well.bot], stone, { shade: 0.85 });
    for (let z = well.top - 2, n = 0; z > well.bot + 1; z -= 3, n++) {
      const sgn = n % 2 ? 1 : -1, y = Y - (Math.floor((well.top - z) / WELL_RUN) + 1) * WELL_STEP;
      props.add('wall_torch', wx + sgn * 1.48, y, z, sgn < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }
  // torches down the hallways (they are the only light down here): every 6 m, alternating
  // between the two walls, on the north-south runs and the east-west runs
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    const v = at(i, k);
    if (v < 1000 || v === TUNNEL) continue;
    if (k % 6 === 0 && at(i - 1, k) < 0) props.add('wall_torch', X(i) + 0.02, Y, Z(k) + 0.5, Math.PI / 2);
    if (k % 6 === 3 && at(i + 1, k) < 0) props.add('wall_torch', X(i + 1) - 0.02, Y, Z(k) + 0.5, -Math.PI / 2);
    const run = at(i - 1, k) >= 1000 && at(i + 1, k) >= 1000;
    if (i % 6 === 0 && run && at(i, k - 1) < 0) props.add('wall_torch', X(i) + 0.5, Y, Z(k) + 0.02, 0);
    if (i % 6 === 3 && run && at(i, k + 1) < 0) props.add('wall_torch', X(i) + 0.5, Y, Z(k + 1) - 0.02, Math.PI);
  }
  // a panel of another floor laid in the middle of every room
  const quad = (m, x0, z0, x1, z1, y) => b.quad(m, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]]);
  rooms.forEach((r) => {
    if (r.w < 7 || r.d < 7) return;
    quad(mat(r.theme.inlay, 2, { overlay: true }), X(r.i) + 2, Z(r.k) + 2, X(r.i + r.w) - 2, Z(r.k + r.d) - 2, Y + 0.012);
  });
  // the catacomb pack's one-off floor tiles: a seal, a grate or a mosaic in the middle of each
  // room, and worn things about its floor (stains, drains, bones, wax, scrapes)
  const dec = (n) => (lib.surf.has('catacombs_decal_' + n) ? 'catacombs_decal_' + n : null);
  const CENTRE = ['funerary_star', 'sepulchral_cross', 'skull_seal', 'interlocking_circles', 'rosette_seal', 'sunburst_mosaic', 'ritual_triangle',
    'concentric_channels', 'diamond_mosaic', 'bone_laurel', 'hourglass_relief', 'sword_memorial', 'brass_memorial', 'four_way_grate', 'mortuary_checker'].map(dec).filter(Boolean);
  const centres = new Set(CENTRE);
  const WORN = [...lib.surf.values()].filter((s) => s.kind === 'decal' && s.id.startsWith('catacombs_decal_') && !centres.has(s.id)).map((s) => s.id);
  rooms.forEach((r, id) => {
    const x0 = X(r.i), z0 = Z(r.k), x1 = X(r.i + r.w), z1 = Z(r.k + r.d);
    if (CENTRE.length && r.w >= 7 && r.d >= 7) {
      const size = Math.min(3.2, r.w - 4, r.d - 4);
      b.decal(mat(CENTRE[id % CENTRE.length], size, { overlay: true }), (x0 + x1) / 2, Y + 0.016, (z0 + z1) / 2, size, (id % 4) * Math.PI / 2);
    }
    for (let n = 0; n < 3 && WORN.length; n++) {
      const size = 1.2 + R() * 0.6, x = x0 + 1.2 + R() * (r.w - 2.4), z = z0 + 1.2 + R() * (r.d - 2.4);
      b.decal(mat(WORN[(id * 3 + n) % WORN.length], size, { overlay: true }), x, Y + 0.018 + n * 0.0015, z, size, Math.floor(R() * 4) * Math.PI / 2);
    }
  });
  // whatever the world hasn't used yet furnishes the rooms: props from the catacomb, sewer and
  // keep packs along the walls (the burning ones light up), hangings on the walls, and any
  // surface still unused as a worn patch of floor
  const spot = (r, n, j) => {
    const per = 2 * (r.w + r.d) - 8, t = ((j * 5.3 + n * 1.7) % per + per) % per;
    if (t < r.w - 2) return [X(r.i) + 1 + t, Z(r.k) + 1.1];
    if (t < r.w - 2 + r.d - 2) return [X(r.i + r.w) - 1.1, Z(r.k) + 1 + t - (r.w - 2)];
    if (t < 2 * (r.w - 2) + r.d - 2) return [X(r.i + r.w) - 1 - (t - (r.w - 2) - (r.d - 2)), Z(r.k + r.d) - 1.1];
    return [X(r.i) + 1.1, Z(r.k + r.d) - 1 - (t - 2 * (r.w - 2) - (r.d - 2))];
  };
  // (never in front of a doorway or by the stairwell: clear of the ways, and 2 m from the well)
  const blocks = (id, x, z) => {
    for (let dk = -2; dk <= 2; dk++) for (let di = -2; di <= 2; di++) if (at(gi(x) + di, gk(z) + dk) === WELL) return true;
    return !clear(spriteFoot(id, x, z));
  };
  // (and never crowding a room: each keeps two-thirds of its floor open, or the next room has it)
  const left = [...lib.spr.values()].filter((s) => s.category === 'scatter' && !lib.usedSprites.has(s.id));
  left.forEach((s, j) => {
    const n0 = Math.floor(j / (rooms.length - 1));
    for (let t = 0; t < rooms.length - 1; t++) {
      const r = rooms[1 + ((j + t) % (rooms.length - 1))];
      for (let q = 0; q < 8; q++) {
        const [x, z] = spot(r, n0 + q * 3, j);
        if (blocks(s.id, x, z) || !roomy(spriteFoot(s.id, x, z), 0.66)) continue;
        sprite(s.id, x, z, 1, 0.95);
        if (/brazier|candle|lantern|torch|chandelier|fire/.test(s.id)) ctx.flames?.push([x, Y + s.height_m * 0.9, z, 0.22]);
        return;
      }
    }
  });
  // (not the old banners: the world's banners are the banner sheets' now, Velscour's only where his people are)
  const hang = [...lib.spr.values()].filter((s) => s.category === 'hanging' && !/_banner$/.test(s.id) && !lib.usedSprites.has(s.id));
  hang.forEach((s, j) => {
    const r = rooms[j % rooms.length];
    wallPanel(lib, ctx.scene, s.id, X(r.i) + r.w / 2 + (j - 1) * 2.5, Y + 2.4, Z(r.k + r.d) - 0.08, [0, 0, -1], 2);
  });
  // (stone, earth, metal and timber only: no grass, leaves, bark or roofing underground; and not
  // the ground sheets' tiles, which are only ever laid by name)
  const UNDERFOOT = /meadow|grass|clover|moss_cover|verge|field|leaves|bark|roof|thatch|wall_/;
  // (nor the masonry: that's for building walls and towers with)
  const floors = [...lib.surf.values()].filter((s) => !lib.used.has(s.id) && s.kind !== 'decal' && s.kind !== 'ground' && !s.wall_set && !UNDERFOOT.test(s.id) && !s.id.startsWith('masonry_'));
  floors.forEach((s, j) => {
    const r = rooms[1 + (j % (rooms.length - 1))];
    const n = Math.floor(j / (rooms.length - 1));
    const x0 = X(r.i) + 1.5 + ((n * 2.7) % Math.max(1, r.w - 5)), z0 = Z(r.k) + 1.5 + ((n * 3.9 + j) % Math.max(1, r.d - 5));
    quad(mat(s.id, 1.5, { overlay: true }), x0, z0, x0 + 2.2, z0 + 2.2, Y + 0.02 + n * 0.002);
  });
  // the carved grid (for whatever walks down here to find its way: not into the stairwell) and
  // where each room lies
  const walkCells = cell.map((v) => (v === WELL ? -1 : v));
  const nav = { x0: X0, z0: Z0, nx: NX, nz: NZ, cell: walkCells };
  const roomList = rooms.map((r) => ({ x0: X(r.i), z0: Z(r.k), x1: X(r.i + r.w), z1: Z(r.k + r.d), kind: r.kind }));
  const bounds = { x0: X0, z0: Z0, x1: X0 + NX, z1: Z0 + NZ };
  return { name: opts.name || 'The Undercroft', rooms: rooms.length, halls: edges.length, bounds, y: Y, nav, roomList,
    // you are down here: over its carved grid, between its floor and roof
    contains: (p) => { const i = gi(p.x), k = gk(p.z); return p.y > Y - 1.5 && p.y < Y + GREAT_H + 1 && at(i, k) >= 0 && at(i, k) !== TUNNEL; },
    stairDown: well ? { x: well.x, y: Y - WELL_N * WELL_STEP, z: well.bot } : null };

  /** The newer kinds of room: a flooded crypt, a forge, a hall round a throne of bones, barracks, a
   * collapsed hall, a well chamber, a great hall of tall columns. */
  function furnish(r, id, x0, z0, x1, z1, cx, cz, B) {
    const kind = r.kind, stone = mat(r.theme.band, 1.5), fy = Y;
    if (kind === 'flooded crypt') {
      // black water a hand deep over the floor, sarcophagi standing in it, drowned urns
      const wm = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), FLOOD_MAT());
      wm.position.set(cx, fy + 0.22, cz);
      ctx.scene.add(wm);
      for (let x = x0 + 2.5; x < x1 - 2; x += 3.2) put('sarcophagus', x, cz + (R() - 0.5) * 2, Math.PI / 2 + (R() - 0.5) * 0.3);
      for (let n = 0; n < 4; n++) somewhere(r, (x, z) => sprite(cat(['burial_urn_cluster', 'ossuary_urn', 'long_bone_heap', 'supine_skeleton'][n]), x, z, 1, 0.9));
    } else if (kind === 'forge') {
      // a hearth of stone, coal and fire against a wall and an anvil before it; barrels of quench
      // water and crates of ore down the wall to its right, a table on its left
      const p = against(r, 1.6, (W, u) => clear(W.rect(u - 1.6, 0.4, u + 1.6, 2.0)));
      const W = p ? p.B : B, u = p ? p.u : 0;
      if (p) {
        const [h0x, h0z, h1x, h1z] = W.rect(u - 1.6, 0.4, u + 1.6, 2.0);
        block([h0x, fy, h0z], [h1x, fy + 1.1, h1z], stone, { shade: 0.7 });
        for (const [du, dv, y, f] of [[0, 1.2, 1.35, 0.55], [-0.8, 1.1, 1.3, 0.35], [0.8, 1.3, 1.3, 0.35]]) { const [x, z] = W.at(u + du, dv); ctx.flames?.push([x, fy + y, z, f]); }
      }
      put('anvil', ...W.at(u, 3.4), W.face + R() * 0.6);
      put('table', ...W.at(-W.along / 2 + 1.8, W.deep / 2), W.face + Math.PI / 2);
      // (the rest as the room has space for)
      put('anvil', ...W.at(2.5, W.deep / 2 + 1), R() * 6, 1, null, 0.62);
      for (let n = 0; n < 5; n++) put(n % 2 ? 'barrel' : 'crate', ...W.at(W.along / 2 - 1.2, 1.5 + n * 1.3), R() * 3, 1, null, 0.62);
    } else if (kind === 'bone throne') {
      // a dais against a wall, a step up (0.4 m), with a high seat on it, heaped round with
      // skulls, candles either side, and skulls down the hall before it
      const p = against(r, 3, (W, u) => clear(W.rect(u - 3, 0.5, u + 3, 3.5)));
      const W = p ? p.B : B, u = p ? p.u : 0, D = 0.4;
      if (p) {
        const box = (u0, y0, v0, u1, y1, v1, shade) => { const [ax, az, ex, ez] = W.rect(u0, v0, u1, v1); block([ax, fy + y0, az], [ex, fy + y1, ez], stone, { shade }); };
        box(u - 3, 0, 0.5, u + 3, D, 3.5, 0.85);
        box(u - 0.8, D, 1.1, u + 0.8, D + 0.5, 2.3, 0.8);      // the seat
        box(u - 0.9, D, 0.7, u + 0.9, D + 2.7, 1.1, 0.7);      // its back
        for (let n = 0; n < 7; n++) sprite(cat(n % 2 ? 'skull_pyramid' : 'long_bone_heap'), ...W.at(u - 2.6 + n * 0.85, 3.1), 1, 0.8, fy + D);
        const side = Math.min(3.6, W.along / 2 - 0.6);
        put('candelabrum', ...W.at(u - side, 1.5)); put('candelabrum', ...W.at(u + side, 1.5));
      }
      for (let v = 5.5; v < W.deep - 1.5; v += 2.5) for (const sx of [-1, 1]) sprite(cat('skull_pyramid'), ...W.at(u + sx * 2.4, v), 1, 0.7);
    } else if (kind === 'barracks') {
      for (let x = x0 + 1.5; x < x1 - 1.2; x += 2.0) { put('bed', x, z0 + 1.3, 0); if (r.d > 9) put('bed', x, z1 - 1.3, Math.PI); }
      put('table', cx, cz, 0); put('stool', cx - 1, cz + 1); put('stool', cx + 1, cz - 1);
      put('crate', x0 + 1, cz, 0); put('barrel', x1 - 1, cz, 0);
    } else if (kind === 'collapsed hall') {
      // the roof came in: broken columns and a slope of fallen blocks across one corner (the far
      // one, unless a hallway comes in by it)
      for (let n = 0; n < 4; n++) somewhere(r, (x, z) => put('pillar_broken', x, z, R() * 6), 2);
      const ways = (sx, sz) => { // how much of the corner's floor is kept clear
        let n = 0;
        for (let a = 0; a < r.w * 0.45; a++) for (let c = 0; c < r.d * 0.45; c++) {
          const i = sx > 0 ? r.i + r.w - 1 - a : r.i + a, k = sz > 0 ? r.k + r.d - 1 - c : r.k + c;
          n += keep[k * NX + i];
        }
        return n;
      };
      const [sx, sz] = [[1, 1], [-1, 1], [1, -1], [-1, -1]].reduce((best, c) => (ways(...c) < ways(...best) ? c : best));
      for (let n = 0; n < 14; n++) {
        const s = 0.4 + R() * 0.8, x = sx > 0 ? x1 - 1 - R() * r.w * 0.4 : x0 + 1 + R() * r.w * 0.4, z = sz > 0 ? z1 - 1 - R() * r.d * 0.4 : z0 + 1 + R() * r.d * 0.4;
        block([x - s / 2, fy, z - s / 2], [x + s / 2, fy + s * (0.5 + R() * 0.6), z + s / 2], stone, { shade: 0.65 + R() * 0.2 });
      }
      for (let n = 0; n < 3; n++) somewhere(r, (x, z) => sprite(cat(['supine_skeleton', 'long_bone_heap', 'skull_pyramid'][n]), x, z, 1, 0.9), 1.5);
    } else if (kind === 'well chamber') {
      // the well as near the middle as the ways allow, barrels by it, a crate in a corner
      const turn = R() * 6, w = nearest(cx, cz, (x, z) => clear(props.footprint('well', x, z, turn)), Math.max(r.w, r.d) / 2);
      if (w) {
        put('well', ...w, turn);
        put('barrel', w[0] + 2.2, w[1] - 1.5); put('barrel', w[0] - 2.2, w[1] + 1.5);
      }
      put('crate', x0 + 1.2, z0 + 1.2);
    } else if (kind === 'great hall') {
      // two rows of tall columns, candelabra down the middle
      for (let x = x0 + 2.5; x < x1 - 2; x += 3.5) for (const z of [z0 + 2.2, z1 - 2.2]) put('pillar_gothic', x, z, 0, 1, r.h);
      for (let x = x0 + 4; x < x1 - 3; x += 7) put('candelabrum', x, cz);
    } else if (kind === 'stair hall') {
      put('candelabrum', x0 + 1.2, z1 - 1.2); put('candelabrum', x1 - 1.2, z1 - 1.2);
    }
  }
}

/** How big to build an arch (metres a pixel) so it never hangs low over a hallway: its opening
 * at least as wide as the hallway (3 m, so the piers stand clear of it), and its curve at least 3 m
 * over the floor anywhere a head can pass (the player keeps 0.32 m off the hallway's walls). Read
 * off the arch's own silhouette; 0 if it can't be done. */
function archScale(art, mask) {
  if (!mask) return 0;
  const [o0, o1] = art.opening_px, foot = art.foot_px, cx = (o0 + o1) / 2, k = mask.w / art.size[0];
  // the opening's height (px) at column x: up from the foot to the first solid pixel
  const heightAt = (x) => {
    const col = Math.round(x * k), f = Math.min(mask.h - 1, Math.round(foot * k) - 1);
    let y = f;
    while (y > 0 && !mask.m[y * mask.w + col]) y--;
    return (f - y) / k;
  };
  for (let s = 3.05 / (o1 - o0); s < 0.06; s *= 1.02) {
    const reach = (1.5 - 0.32) / s;                  // the edge of where a head can be, in pixels
    if (Math.min(heightAt(cx - reach), heightAt(cx + reach)) * s >= 3.0) return s;
  }
  return 0;
}

const FOOT_H_OF = (opts) => opts.footH ?? 4.2;

let floodMat = null;
const FLOOD_MAT = () => (floodMat ||= new THREE.MeshPhongMaterial({ color: 0x0c1a16, specular: 0x6a8a80, shininess: 90, transparent: true, opacity: 0.78, depthWrite: false }));
