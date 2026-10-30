// The dungeon under the graveyard: 15 rooms and 15 hallways (30 in all), reached by the
// stairs from the cathedral office. Carved on a 1 m grid from a fixed seed, so it is the
// same every time: rooms placed without overlaps, joined by a spanning tree of L-shaped
// hallways plus one extra loop. Rooms are 5 m tall, hallways 3.2 m.
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

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function buildDungeon(ctx, entry) {
  const { lib, b, props, bill } = ctx;
  const R = rng(9001);
  const Y = entry.y, ROOM_H = 5, HALL_H = 3.2;
  const X0 = -80, Z0 = -260, NX = 170, NZ = 154; // grid origin (metres) and size
  const cell = new Int16Array(NX * NZ).fill(-1);  // -1 rock, 0..n-1 room id, 1000+ hallway id
  const at = (i, k) => (i < 0 || k < 0 || i >= NX || k >= NZ ? -1 : cell[k * NX + i]);
  const set = (i, k, v) => { if (i >= 0 && k >= 0 && i < NX && k < NZ && cell[k * NX + i] < 0) cell[k * NX + i] = v; };
  const gi = (x) => Math.floor(x - X0), gk = (z) => Math.floor(z - Z0);

  // rooms: the entry hall at the foot of the stairs, then 14 more without overlapping
  const rooms = [{ i: gi(entry.x - 6), k: gk(entry.z - 13), w: 12, d: 13, theme: THEMES[1], kind: 'entry hall' }];
  let tries = 0;
  while (rooms.length < 15 && tries++ < 5000) {
    const w = 7 + Math.floor(R() * 10), d = 7 + Math.floor(R() * 10);
    const i = 2 + Math.floor(R() * (NX - w - 4)), k = 2 + Math.floor(R() * (NZ - d - 20));
    if (rooms.some((r) => i < r.i + r.w + 5 && i + w + 5 > r.i && k < r.k + r.d + 5 && k + d + 5 > r.k)) continue;
    rooms.push({ i, k, w, d, theme: THEMES[Math.floor(R() * THEMES.length)], kind: KINDS[rooms.length % KINDS.length] });
  }
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
  let extra = null;
  for (let a = 0; a < rooms.length; a++) for (let c = a + 1; c < rooms.length; c++) {
    if (edges.some((e) => (e[0] === a && e[1] === c) || (e[0] === c && e[1] === a))) continue;
    const d = Math.hypot(ctr[a][0] - ctr[c][0], ctr[a][1] - ctr[c][1]);
    if (!extra || d < extra[2]) extra = [a, c, d];
  }
  edges.push(extra);
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
  const sx = gi(entry.x), FOOT = 1999, TUNNEL = 2999;
  for (let k = gk(entry.z); k <= gk(entry.z + 0.6); k++) for (let u = -1; u <= 1; u++) cell[k * NX + sx + u] = FOOT;
  for (let k = gk(entry.z + 0.6) + 1; k <= gk(entry.z + 5); k++) for (let u = -1; u <= 1; u++) if (k < NZ) cell[k * NX + sx + u] = TUNNEL;

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
  const themeOf = (v) => (v === FOOT ? rooms[0].theme : v >= 1000 ? halls[v - 1000] : rooms[v].theme);
  const ceilOf = (v) => (v >= 1000 ? HALL_H : ROOM_H);
  const X = (i) => X0 + i, Z = (k) => Z0 + k;
  // floors and ceilings: merged runs along x of cells with the same theme and height
  for (let k = 0; k < NZ; k++) {
    let i = 0;
    while (i < NX) {
      const v = at(i, k);
      if (v < 0 || v === TUNNEL) { i++; continue; }
      const th = themeOf(v), h = ceilOf(v);
      let j = i;
      while (j + 1 < NX && at(j + 1, k) >= 0 && at(j + 1, k) !== TUNNEL && themeOf(at(j + 1, k)) === th && ceilOf(at(j + 1, k)) === h) j++;
      b.box([X(i), Y - 0.5, Z(k)], [X(j + 1), Y, Z(k + 1)], mat(th.floor, 2.5), { shade: 0.9, faces: { bottom: false } });
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
  const ARCHES = [['catacombs_roman_ossuary', 3.0], ['catacombs_ironbound_segmental', 3.0], ['catacombs_pointed_funerary', 2.5]];
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
        const [aid, open] = ARCHES[(id + si) % ARCHES.length], art = lib.biome.arches.get(aid);
        if (!art) continue;
        const s = open / (art.opening_px[1] - art.opening_px[0]), half = art.size[0] * s / 2;
        if (art.foot_px * s > ROOM_H - 0.1 || c - half < 0.4 || c + half > n - 0.4) continue;
        let clear = true; // no other opening under it
        for (let k = Math.floor(c - half); k < Math.ceil(c + half); k++) if (k >= 0 && k < n && outside(k) >= 0 && (k < c - 1.5 || k >= c + 1.5)) clear = false;
        if (!clear) continue;
        const [x, z] = where(c);
        ctx.cutouts.place(aid, x, Y, z, facing, open, 0.5);
        covered[id][key].push([c - half - 0.4, c + half + 0.4]);
      }
    });
  });
  const hidden = (id, key, a) => covered[id][key].some(([p, q]) => a > p && a < q);

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
    const kind = r.kind;
    if (kind === 'pillared hall' || kind === 'entry hall') {
      const pil = ['pillar_round', 'pillar_fluted', 'pillar_square', 'pillar_twisted'][id % 4];
      for (let x = x0 + 3; x < x1 - 2; x += 4) for (const z of [z0 + 2.5, z1 - 2.5]) props.add(pil, x, fy, z, 0, 1.2);
    } else if (kind === 'crypt') {
      for (let x = x0 + 2.5; x < x1 - 2; x += 3) props.add('sarcophagus', x, fy, cz, Math.PI / 2);
      props.add('candelabrum', x0 + 1.2, fy, z0 + 1.2); props.add('candelabrum', x1 - 1.2, fy, z1 - 1.2);
    } else if (kind === 'library') {
      for (let x = x0 + 1.5; x < x1 - 1; x += 1.4) if (!hidden(id, 'n', x - x0)) props.add('bookshelf', x, fy, z0 + 0.3, 0);
      props.add('table', cx, fy, cz, 0); props.add('stool', cx, fy, cz + 1.2); props.add('candelabrum', cx + 1.6, fy, cz);
    } else if (kind === 'shrine') {
      props.add('altar', cx, fy, z0 + 1.6, 0);
      props.add('candelabrum', cx - 2.4, fy, z0 + 1.6); props.add('candelabrum', cx + 2.4, fy, z0 + 1.6);
      for (let z = z0 + 4; z < z1 - 1.5; z += 1.8) props.add('pew', cx, fy, z, Math.PI, 0.8);
    } else if (kind === 'storeroom') {
      for (let n = 0; n < 9; n++) props.add(n % 3 ? 'crate' : 'barrel', x0 + 1 + R() * (r.w - 2), fy, z0 + 1 + R() * (r.d - 2), R() * 3);
    } else if (kind === 'vault') {
      for (let n = 0; n < 3; n++) props.add('treasure_chest', x0 + 1.5 + n * 1.6, fy, z0 + 0.8, 0);
      props.add('pillar_broken', cx, fy, cz, R() * 6);
    } else if (kind === 'ossuary') {
      for (let n = 0; n < 10; n++) {
        const s = [cat('skull_pyramid'), cat('long_bone_heap'), cat('supine_skeleton'), cat('ossuary_urn'), cat('burial_urn_cluster')][n % 5];
        bill.add(s, x0 + 1 + R() * (r.w - 2), fy, z0 + 1 + R() * (r.d - 2), 1, 0.9);
      }
    }
    if (R() < 0.7) {
      const id = [cat('torch_stand'), cat('incense_brazier'), cat('iron_candelabrum'), cat('effigy_sarcophagus')][Math.floor(R() * 4)];
      bill.add(id, x1 - 1.5, fy, z1 - 1.5, 1);
      const s = lib.sprite(id); // stands and braziers burn
      if (s && !/sarcophagus/.test(id)) ctx.flames?.push([x1 - 1.5, fy + s.height_m * 0.95, z1 - 1.5, /brazier/.test(id) ? 0.45 : 0.3]);
    }
  });
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
  const left = [...lib.spr.values()].filter((s) => s.category === 'scatter' && !lib.usedSprites.has(s.id));
  left.forEach((s, j) => {
    const r = rooms[1 + (j % (rooms.length - 1))];
    const [x, z] = spot(r, Math.floor(j / (rooms.length - 1)), j);
    bill.add(s.id, x, Y, z, 1, 0.95);
    if (/brazier|candle|lantern|torch|chandelier|fire/.test(s.id)) ctx.flames?.push([x, Y + s.height_m * 0.9, z, 0.22]);
  });
  const hang = [...lib.spr.values()].filter((s) => s.category === 'hanging' && !lib.usedSprites.has(s.id));
  hang.forEach((s, j) => {
    const r = rooms[j % rooms.length];
    wallPanel(lib, ctx.scene, s.id, X(r.i) + r.w / 2 + (j - 1) * 2.5, Y + 2.4, Z(r.k + r.d) - 0.08, [0, 0, -1], 2);
  });
  // (stone, earth, metal and timber only: no grass, leaves, bark or roofing underground; and not
  // the ground sheets' tiles, which are only ever laid by name)
  const UNDERFOOT = /meadow|grass|clover|moss_cover|verge|field|leaves|bark|roof|thatch|wall_/;
  const floors = [...lib.surf.values()].filter((s) => !lib.used.has(s.id) && s.kind !== 'decal' && s.kind !== 'ground' && !s.wall_set && !UNDERFOOT.test(s.id));
  floors.forEach((s, j) => {
    const r = rooms[1 + (j % (rooms.length - 1))];
    const n = Math.floor(j / (rooms.length - 1));
    const x0 = X(r.i) + 1.5 + ((n * 2.7) % Math.max(1, r.w - 5)), z0 = Z(r.k) + 1.5 + ((n * 3.9 + j) % Math.max(1, r.d - 5));
    quad(mat(s.id, 1.5, { overlay: true }), x0, z0, x0 + 2.2, z0 + 2.2, Y + 0.02 + n * 0.002);
  });
  // the carved grid (for whatever walks down here to find its way) and where each room lies
  const nav = { x0: X0, z0: Z0, nx: NX, nz: NZ, cell };
  const roomList = rooms.map((r) => ({ x0: X(r.i), z0: Z(r.k), x1: X(r.i + r.w), z1: Z(r.k + r.d), kind: r.kind }));
  return { rooms: rooms.length, halls: edges.length, bounds: { x0: X0, z0: Z0, x1: X0 + NX, z1: Z0 + NZ }, y: Y, nav, roomList };
}
