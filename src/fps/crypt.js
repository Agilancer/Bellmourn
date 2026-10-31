// The undercroft: the dungeon under the graveyard, reached by the stairs from the cathedral
// office. The same 15 rooms and 15 hallways as ever (carved on a 1 m grid from the same seed, so
// whatever walks down here finds its way the same), now built and dressed from the reworked kit:
// soot-black brick, mossed and slate masonry and cobbles from the village and nature packs for its
// shell, and the Modular Dungeon pack's own pieces for everything you look at: arches over the
// hallway mouths, columns, carved wall panels, torches, tombs, bones, cobwebs and the treasure in
// the vault. Every room is dressed for what it was for: the entry hall is a crypt-chapel whose
// raised dais faces you as you come down the stair; the pillared halls are built round a real
// pit (the balustrade keeps you out of it, the spikes at its foot say why); storerooms keep their
// barrels and crates against the walls round a cellar hatch; the ossuary's bones are stacked
// along its walls; the vault's chests sit behind a spike trap. Where a column has fallen its
// rubble lies under it.

const KINDS = ['pillared hall', 'crypt', 'library', 'shrine', 'storeroom', 'vault', 'ossuary'];
const THEMES = [ // floor, wall, ceiling, band: repainted kit atlases [atlas, variant]
  { floor: ['nature_pathrocks', ''], wall: ['village_brick', 'soot'], ceil: ['village_brick', 'soot'], band: ['village_rocktrim', 'slate'] },
  { floor: ['village_unevenbrick', 'bone'], wall: ['village_unevenbrick', 'moss'], ceil: ['village_woodtrim', 'char'], band: ['village_rocktrim', ''] },
  { floor: ['village_redbrick', 'burnt'], wall: ['village_redbrick', 'burnt'], ceil: ['village_brick', 'soot'], band: ['village_brick', 'moss'] },
  { floor: ['nature_rocks', ''], wall: ['nature_rocks', ''], ceil: ['nature_rocks', ''], band: ['nature_rocks', ''] },
  { floor: ['village_brick', 'moss'], wall: ['village_unevenbrick', ''], ceil: ['village_brick', 'soot'], band: ['village_unevenbrick', 'bone'] },
  { floor: ['village_rocktrim', 'slate'], wall: ['village_rocktrim', 'slate'], ceil: ['village_woodtrim', 'grey'], band: ['village_brick', 'soot'] },
];

function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function buildCrypt(ctx, entry) {
  const { kit, b } = ctx;
  const R = rng(9001);
  const Y = entry.y, ROOM_H = 5, HALL_H = 3.2;
  const X0 = -80, Z0 = -260, NX = 170, NZ = 154;
  const cell = new Int16Array(NX * NZ).fill(-1);
  const at = (i, k) => (i < 0 || k < 0 || i >= NX || k >= NZ ? -1 : cell[k * NX + i]);
  const set = (i, k, v) => { if (i >= 0 && k >= 0 && i < NX && k < NZ && cell[k * NX + i] < 0) cell[k * NX + i] = v; };
  const gi = (x) => Math.floor(x - X0), gk = (z) => Math.floor(z - Z0);

  // ---------------------------------------------------------------- the carve (as it always was)
  const rooms = [{ i: gi(entry.x - 6), k: gk(entry.z - 13), w: 12, d: 13, kind: 'entry hall' }];
  let tries = 0;
  while (rooms.length < 15 && tries++ < 5000) {
    const w = 7 + Math.floor(R() * 10), d = 7 + Math.floor(R() * 10);
    const i = 2 + Math.floor(R() * (NX - w - 4)), k = 2 + Math.floor(R() * (NZ - d - 20));
    if (rooms.some((r) => i < r.i + r.w + 5 && i + w + 5 > r.i && k < r.k + r.d + 5 && k + d + 5 > r.k)) continue;
    R(); // (the old theme roll, kept so the layout is the same)
    rooms.push({ i, k, w, d, kind: KINDS[rooms.length % KINDS.length] });
  }
  rooms.forEach((r, id) => { for (let a = 0; a < r.w; a++) for (let c = 0; c < r.d; c++) set(r.i + a, r.k + c, id); });
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
    const carve = (i, k) => { for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) set(i + u, k + v, id); };
    if (R() < 0.5) {
      for (let i = Math.min(ax, cx); i <= Math.max(ax, cx); i++) carve(i, az);
      for (let k = Math.min(az, cz); k <= Math.max(az, cz); k++) carve(cx, k);
    } else {
      for (let k = Math.min(az, cz); k <= Math.max(az, cz); k++) carve(ax, k);
      for (let i = Math.min(ax, cx); i <= Math.max(ax, cx); i++) carve(i, cz);
    }
  });
  const sx = gi(entry.x), FOOT = 1999, TUNNEL = 2999;
  for (let k = gk(entry.z); k <= gk(entry.z + 0.6); k++) for (let u = -1; u <= 1; u++) cell[k * NX + sx + u] = FOOT;
  for (let k = gk(entry.z + 0.6) + 1; k <= gk(entry.z + 5); k++) for (let u = -1; u <= 1; u++) if (k < NZ) cell[k * NX + sx + u] = TUNNEL;

  // ---------------------------------------------------------------- the shell
  rooms.forEach((r, i) => { r.theme = THEMES[i === 0 ? 1 : (i * 5) % THEMES.length]; });
  const halls = edges.map((_, n) => THEMES[(n * 3 + 2) % THEMES.length]);
  const S = (spec, tile) => kit.surface(spec[0], tile, spec[1], 'stone');
  // the pillared halls' pits: the floor is left open over them (even sizes, for the balustrade's
  // 2 m pieces), clear of the two rows of columns
  rooms.forEach((r) => {
    if (r.kind !== 'pillared hall') return;
    const n = Math.min(6, Math.floor((r.w - 4) / 2) * 2, Math.floor((r.d - 7) / 2) * 2);
    if (n >= 4) r.pit = { i: r.i + Math.floor((r.w - n) / 2), k: r.k + Math.floor((r.d - n) / 2), n };
  });
  const pitAt = (i, k) => { const v = at(i, k); if (v < 0 || v >= 1000) return false; const q = rooms[v].pit; return !!q && i >= q.i && i < q.i + q.n && k >= q.k && k < q.k + q.n; };
  const themeOf = (v) => (v === FOOT ? rooms[0].theme : v >= 1000 ? halls[v - 1000] : rooms[v].theme);
  const ceilOf = (v) => (v >= 1000 ? HALL_H : ROOM_H);
  const X = (i) => X0 + i, Z = (k) => Z0 + k;
  for (let k = 0; k < NZ; k++) {
    let i = 0;
    while (i < NX) {
      const v = at(i, k);
      if (v < 0 || v === TUNNEL) { i++; continue; }
      const th = themeOf(v), h = ceilOf(v), pit = pitAt(i, k);
      let j = i;
      while (j + 1 < NX && at(j + 1, k) >= 0 && at(j + 1, k) !== TUNNEL && themeOf(at(j + 1, k)) === th && ceilOf(at(j + 1, k)) === h && pitAt(j + 1, k) === pit) j++;
      if (!pit) b.box([X(i), Y - 0.5, Z(k)], [X(j + 1), Y, Z(k + 1)], S(th.floor, 2.5), { shade: 0.9, faces: { bottom: false } });
      b.box([X(i), Y + h, Z(k)], [X(j + 1), Y + h + 0.5, Z(k + 1)], S(th.ceil, 3), { shade: 0.55, faces: { top: false } });
      i = j + 1;
    }
  }
  const wallRun = (horizontal) => {
    const A = horizontal ? NZ : NX, B = horizontal ? NX : NZ;
    for (let a = 0; a < A; a++) for (const side of [-1, 1]) {
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
        const m = S(th.wall, 2.5), band = S(th.band, 1.5), by = Math.min(y1, Y + 1.0);
        if (horizontal) {
          const z = side < 0 ? Z(a) : Z(a + 1);
          b.box([X(s), y0, side < 0 ? z - 0.5 : z], [X(e + 1), y1, side < 0 ? z : z + 0.5], m, { shade: 0.8, vbase: Y });
          if (!lintel) b.box([X(s), Y, side < 0 ? z : z - 0.12], [X(e + 1), by, side < 0 ? z + 0.12 : z], band, { shade: 0.85, solid: false });
        } else {
          const x = side < 0 ? X(a) : X(a + 1);
          b.box([side < 0 ? x - 0.5 : x, y0, Z(s)], [side < 0 ? x : x + 0.5, y1, Z(e + 1)], m, { shade: 0.8, vbase: Y });
          if (!lintel) b.box([side < 0 ? x : x - 0.12, Y, Z(s)], [side < 0 ? x + 0.12 : x, by, Z(e + 1)], band, { shade: 0.85, solid: false });
        }
        s = e + 1;
      }
    }
  };
  wallRun(true);
  wallRun(false);

  // ---------------------------------------------------------------- dressing from the kit
  const P = (id, x, y, z, rot = 0, s = 1, o = {}) => kit.place(id, x, y, z, rot, s, { cull: 70, layer: 'under', ...o });
  // arches over every hallway mouth (on the room side), the room's wall to either side
  const mouths = rooms.map(() => []);
  rooms.forEach((r, id) => {
    const sides = [
      [r.w, (a) => at(r.i + a, r.k - 1), (c) => [X(r.i) + c, Z(r.k) + 0.15], 0],
      [r.w, (a) => at(r.i + a, r.k + r.d), (c) => [X(r.i) + c, Z(r.k + r.d) - 0.15], Math.PI],
      [r.d, (a) => at(r.i - 1, r.k + a), (c) => [X(r.i) + 0.15, Z(r.k) + c], Math.PI / 2],
      [r.d, (a) => at(r.i + r.w, r.k + a), (c) => [X(r.i + r.w) - 0.15, Z(r.k) + c], -Math.PI / 2],
    ];
    sides.forEach(([n, outside, where, facing], si) => {
      let a = 0;
      while (a < n) {
        const v = outside(a);
        if (!(v >= 1000 && v !== TUNNEL)) { a++; continue; }
        let e = a;
        while (e + 1 < n && outside(e + 1) >= 1000) e++;
        const len = e + 1 - a, c = (a + e + 1) / 2;
        a = e + 1;
        if (len !== 3) continue;
        const [x, z] = where(c);
        P('dungeon/Arch', x, Y, z, facing, [0.95, 1.2, 0.6], { solid: false });
        mouths[id].push([si, c]);
      }
    });
  });
  const nearMouth = (id, si, c) => mouths[id].some(([s, m]) => s === si && Math.abs(m - c) < 3.2);
  rooms.forEach((r, id) => {
    const x0 = X(r.i), z0 = Z(r.k), x1 = X(r.i + r.w), z1 = Z(r.k + r.d), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, fy = Y;
    // torches round the walls (not by an arch), every 5 m
    for (let x = x0 + 2.5; x < x1 - 1; x += 5) {
      if (at(gi(x), r.k - 1) < 0 && !nearMouth(id, 0, x - x0)) P('dungeon/Torch', x, fy + 2.0, z0 + 0.25, Math.PI);
      if (at(gi(x), r.k + r.d) < 0 && !nearMouth(id, 1, x - x0)) P('dungeon/Torch', x, fy + 2.0, z1 - 0.25, 0);
    }
    for (let z = z0 + 2.5; z < z1 - 1; z += 5) {
      if (at(r.i - 1, gk(z)) < 0 && !nearMouth(id, 2, z - z0)) P('dungeon/Torch', x0 + 0.25, fy + 2.0, z, -Math.PI / 2);
      if (at(r.i + r.w, gk(z)) < 0 && !nearMouth(id, 3, z - z0)) P('dungeon/Torch', x1 - 0.25, fy + 2.0, z, Math.PI / 2);
    }
    // a carved wall panel run on the north wall where it's blank
    if (!mouths[id].some(([s]) => s === 0)) for (let x = x0 + 2; x < x1 - 2; x += 2.2) P(id % 2 ? 'dungeon/Wall_Modular' : 'dungeon/Decorative_Wall', x, fy + (id % 2 ? 1.0 : 0.82), z0 + 0.3, 0, 1, { solid: false });
    P('dungeon/WallCover_Modular', cx, fy + ROOM_H - 0.4, z0 + 0.25, 0, [r.w / 2, 1, 1], { solid: false });
    // the floor's centre: the kit's flagstones (not over a pit, a dais or a cellar hatch)
    if (r.w >= 7 && r.d >= 7 && !r.pit && r.kind !== 'entry hall' && r.kind !== 'storeroom')
      for (let a = -1; a <= 0; a++) for (let c = -1; c <= 0; c++) P('dungeon/Floor_Modular', cx + a * 2 + 1, fy + 0.03, cz + c * 2 + 1, 0, [1, 0.3, 1], { solid: false });
    for (let n = 0; n < 2; n++) P(n ? 'dungeon/Cobweb2' : 'dungeon/Cobweb', n ? x1 - 0.6 : x0 + 0.6, fy + ROOM_H - 0.2, n ? z1 - 0.6 : z0 + 0.6, n ? Math.PI : 0, 1.4, { solid: false });
    const kind = r.kind;
    // a column that has come down leaves its rubble and bricks round its foot
    const column = (x, z, broken) => {
      P(broken ? 'dungeon/Column~broken' : R() < 0.5 ? 'dungeon/Column' : 'dungeon/Column2', x, fy, z, 0, [0.8, 1.22, 0.8]);
      if (broken) {
        P('bellmourn/rubble', x + 0.7, fy, z + 0.5, R() * 6, 1.2, { solid: false });
        for (let n = 0; n < 3; n++) P('dungeon/Brick', x + (R() - 0.5) * 2.2, fy, z + (R() - 0.5) * 2.2, R() * 6, 1, { solid: false });
      }
    };
    if (kind === 'entry hall') {
      // a crypt-chapel: you come down the stair through its south wall and the way on leaves by
      // the north; on the east (where an altar belongs) a dais up three steps carries the shrine
      // and its candles under the banner, and a row of columns down the west side makes an aisle
      const dh = 0.75, dw = 3.4, dx0 = x1 - dw, dz0 = cz - 3.6, dz1 = cz + 3.6;
      const dais = S(r.theme.band, 1.5), top = S(r.theme.floor, 2);
      b.box([dx0, fy, dz0], [x1, fy + dh, dz1], { top, side: dais, bottom: dais }, { shade: 0.9 });
      b.stairs(dx0, cz, fy + dh, -dh, 3.2, '-x', dais, { step: 0.25, run: 0.42 });
      P('bellmourn/shrine', x1 - 1.1, fy + dh, cz, -Math.PI / 2, 1.1);
      for (const sz of [-1, 1]) {
        P('dungeon/Pedestal2', x1 - 1.2, fy + dh, cz + sz * 2.5, 0, 0.5);
        P('props/CandleStick_Triple', x1 - 1.2, fy + dh + 1.17, cz + sz * 2.5, 0, 1, { solid: false });
        P('props/CandleStick_Stand', dx0 - 1.6, fy, cz + sz * 1.9, 0);
      }
      P('dungeon/Banner', x1 - 0.45, fy + dh, cz, -Math.PI / 2, 1, { variant: 'crimson', solid: false });
      for (let z = z0 + 2; z < z1 - 1.5; z += 3) column(x0 + 2.2, z, false);
    } else if (kind === 'pillared hall') {
      for (let x = x0 + 3; x < x1 - 2; x += 4) for (const z of [z0 + 2.5, z1 - 2.5]) column(x, z, R() < 0.2);
      P('dungeon/Banner', cx, fy, z0 + 0.6, 0, 1, { variant: 'crimson', solid: false });
      const q = r.pit;
      if (q) {
        // the pit: its walls going down, its floor of bones round the spikes, and the balustrade
        const px0 = X(q.i), pz0 = Z(q.k), px1 = px0 + q.n, pz1 = pz0 + q.n, D = 2.8, wall = S(r.theme.wall, 2.5);
        b.box([px0 - 0.3, fy - D, pz0 - 0.3], [px1 + 0.3, fy - D + 0.3, pz1 + 0.3], S(r.theme.floor, 2), { shade: 0.6 });
        b.box([px0 - 0.4, fy - D, pz0 - 0.4], [px0, fy, pz1 + 0.4], wall, { shade: 0.7 });
        b.box([px1, fy - D, pz0 - 0.4], [px1 + 0.4, fy, pz1 + 0.4], wall, { shade: 0.7 });
        b.box([px0, fy - D, pz0 - 0.4], [px1, fy, pz0], wall, { shade: 0.7 });
        b.box([px0, fy - D, pz1], [px1, fy, pz1 + 0.4], wall, { shade: 0.7 });
        for (let a = 0; a < q.n; a += 2) for (let c = 0; c < q.n; c += 2) P('dungeon/Spikes', px0 + a + 1, fy - D + 0.3, pz0 + c + 1, R() * 0.4, [1, 0.8, 1]);
        P('bellmourn/bone_heap', px0 + 1, fy - D + 0.3, pz0 + 1.2, 1, 1, { solid: false });
        P('dungeon/Skull', px1 - 1.1, fy - D + 0.3, pz1 - 0.9, 2, 1, { solid: false });
        fence(P, px0, fy, pz0, q.n, q.n);
      } else P('dungeon/Woodfire', cx, fy, cz, 0, 1.2);   // too small a hall for a pit: a fire in its middle
    } else if (kind === 'crypt') {
      for (let x = x0 + 2.5; x < x1 - 2; x += 3) P('bellmourn/tomb', x, fy, cz, Math.PI / 2);
      P('props/CandleStick_Stand', x0 + 1.2, fy, z0 + 1.2); P('props/CandleStick_Stand', x1 - 1.2, fy, z1 - 1.2);
      P('dungeon/Vase', x0 + 1.2, fy, z1 - 1.2, 0, 1.4); P('dungeon/Vase', x1 - 1.2, fy, z0 + 1.2, 1, 1.4);
    } else if (kind === 'library') {
      for (let x = x0 + 1.5; x < x1 - 1; x += 1.6) if (!nearMouth(id, 1, x - x0)) P('props/Bookcase_2', x, fy, z1 - 0.4, Math.PI);
      P('props/Table_Large', cx, fy, cz, 0); P('props/Chair_1', cx, fy, cz + 1.2, Math.PI);
      P('props/BookGroup_Medium_2', cx - 0.6, fy + 0.82, cz, 0, 1, { solid: false }); P('props/BookGroup_Small_1', cx + 0.4, fy + 0.82, cz, 1, 1, { solid: false });
      P('props/BookGroup_Medium_3', cx + 1.0, fy + 0.82, cz - 0.2, 2, 1, { solid: false }); P('props/BookGroup_Small_3', cx - 1.1, fy + 0.82, cz + 0.2, 0.5, 1, { solid: false });
      P('props/Book_Simplified_Single', cx + 0.1, fy + 0.82, cz + 0.3, 0.3, 1, { solid: false }); P('props/CandleStick_Triple', cx + 1.4, fy + 0.82, cz, 0, 1, { solid: false });
      P('dungeon/Table_Small', cx - 3, fy, cz + 2, 1); P('dungeon/Chair', cx - 3, fy, cz + 3.1, Math.PI);
    } else if (kind === 'shrine') {
      P('bellmourn/shrine', cx, fy, z0 + 1.6, 0);
      P('dungeon/Pedestal2', cx - 2.6, fy, z0 + 1.6, 0, 0.5); P('dungeon/Pedestal2', cx + 2.6, fy, z0 + 1.6, 0, 0.5);
      P('props/CandleStick', cx - 2.6, fy + 1.15, z0 + 1.6, 0, 1, { solid: false }); P('props/CandleStick', cx + 2.6, fy + 1.15, z0 + 1.6, 0, 1, { solid: false });
      for (let z = z0 + 4; z < z1 - 1.5; z += 1.8) P('props/Bench', cx, fy, z, Math.PI, 0.9);
      P('dungeon/Banner_wall', cx, fy + 3.2, z0 + 0.35, 0, 1, { variant: 'crimson', solid: false });
    } else if (kind === 'storeroom') {
      // barrels in a row along the west wall, crates stacked two high in the corners, sacks
      // by the door, and the cellar hatch in the middle of the floor
      const walls = [[0, (a) => [x0 + 0.7, z0 + a], 'x'], [1, (a) => [x1 - 0.7, z0 + a], 'x']];
      for (const [si, at2] of walls) for (let a = 1.3; a < r.d - 1; a += 1.25) {
        if (nearMouth(id, si === 0 ? 2 : 3, a)) continue;
        const [x, z] = at2(a);
        P(si ? ['dungeon/Barrel', 'dungeon/Barrel2', 'props/Barrel'][Math.floor(a) % 3] : ['dungeon/Crate', 'props/Crate_Wooden', 'props/Crate_Metal'][Math.floor(a) % 3], x, fy, z, R() * 0.3);
        if (!si && Math.floor(a) % 2 === 0) P('props/Crate_Wooden', x, fy + 0.88, z, R() * 0.4);
      }
      P('dungeon/Bag_Standing', cx - 1.4, fy, z1 - 0.9, 0.3); P('props/Bag', cx + 1.2, fy, z1 - 0.8, 1.2); P('props/Bucket_Metal', cx + 2, fy, z0 + 0.8, 0);
      P('dungeon/Trapdoor', cx, fy + 0.01, cz, 0, 1, { solid: false });
    } else if (kind === 'vault') {
      P('dungeon/Chest_Gold', cx, fy, z0 + 1.2, 0); P('dungeon/Chest', cx - 1.8, fy, z0 + 1.2, 0); P('dungeon/Chest', cx + 1.8, fy, z0 + 1.2, 0);
      for (let n = 0; n < 5; n++) P(n % 2 ? 'dungeon/Coin_Pile' : 'props/Coin_Pile', cx + (R() - 0.5) * 4, fy, z0 + 2.4 + R(), R() * 6, n % 2 ? 2 : 1, { solid: false });
      P('dungeon/Bag_Coins', cx - 1, fy, z0 + 2.6, 0.4, 1, { solid: false }); P('props/Coin_Pile_2', cx + 1, fy, z0 + 2.8, 0, 1, { solid: false });
      P('dungeon/Sword_WallMount', cx, fy + 2.4, z0 + 0.3, 0, 1, { solid: false });
      // the treasure's guard: a spike trap across the way to it
      for (const dx of [-2, 0, 2]) P('dungeon/Trap_spikes', cx + dx, fy, z0 + 4.4, 0);
      P('dungeon/Pedestal', x1 - 1.6, fy, z1 - 1.6, 0, 0.5); P('props/Chalice', x1 - 1.6, fy + 1.1, z1 - 1.6, 0, 1.4, { solid: false });
    } else if (kind === 'ossuary') {
      // the bones stacked along the walls (skulls set on the heaps), an ossuary chest at the end
      let n = 0;
      for (let a = 1.2; a < r.w - 1; a += 1.5) for (const [zz, rot, si] of [[z0 + 0.7, 0, 0], [z1 - 0.7, Math.PI, 1]]) {
        if (nearMouth(id, si, a)) continue;
        P('bellmourn/bone_heap', x0 + a, fy, zz, rot + (R() - 0.5) * 0.3, 1.1);
        if (n++ % 2 === 0) P('dungeon/Skull', x0 + a + (R() - 0.5) * 0.3, fy + 0.3, zz, rot + (R() - 0.5), 1, { solid: false });
      }
      P('bellmourn/ossuary_chest', cx, fy, cz, 0);
      P('props/CandleStick_Stand', cx - 1.2, fy, cz, 0); P('props/CandleStick_Stand', cx + 1.2, fy, cz, 0);
    }
  });
  // torches down the hallways: every 6 m, alternating walls
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    const v = at(i, k);
    if (v < 1000 || v === TUNNEL || v === FOOT) continue;
    if (k % 6 === 0 && at(i - 1, k) < 0) P('dungeon/Torch', X(i) + 0.25, Y + 1.8, Z(k) + 0.5, -Math.PI / 2);
    if (k % 6 === 3 && at(i + 1, k) < 0) P('dungeon/Torch', X(i + 1) - 0.25, Y + 1.8, Z(k) + 0.5, Math.PI / 2);
    const run = at(i - 1, k) >= 1000 && at(i + 1, k) >= 1000;
    if (i % 6 === 0 && run && at(i, k - 1) < 0) P('dungeon/Torch', X(i) + 0.5, Y + 1.8, Z(k) + 0.25, Math.PI);
    if (i % 6 === 3 && run && at(i, k + 1) < 0) P('dungeon/Torch', X(i) + 0.5, Y + 1.8, Z(k + 1) - 0.25, 0);
    if ((i * 7 + k * 13) % 97 === 0) P(((i + k) % 2) ? 'dungeon/Cobweb' : 'dungeon/Skull', X(i) + 0.5, Y + ((i + k) % 2 ? HALL_H - 0.2 : 0), Z(k) + 0.5, i, 1, { solid: false });
  }
  // the pits are no way through for whatever walks down here
  for (const r of rooms) if (r.pit) for (let a = -1; a <= r.pit.n; a++) for (let c = -1; c <= r.pit.n; c++) cell[(r.pit.k + c) * NX + r.pit.i + a] = -1;
  const nav = { x0: X0, z0: Z0, nx: NX, nz: NZ, cell };
  const roomList = rooms.map((r) => ({ x0: X(r.i), z0: Z(r.k), x1: X(r.i + r.w), z1: Z(r.k + r.d), kind: r.kind }));
  for (const r of roomList) ctx.interiors?.push({ ...r, y0: Y - 1, y1: Y + ROOM_H, floor: Y, name: 'The Undercroft: ' + r.kind, biome: 'undercroft' });
  return { rooms: rooms.length, halls: edges.length, bounds: { x0: X0, z0: Z0, x1: X0 + NX, z1: Z0 + NZ }, y: Y, nav, roomList };
}

/** The dungeon's balustrade round a pit. */
function fence(P, x, y, z, w, d) {
  for (let a = 0; a < w; a += 2) { P('dungeon/Fence_Straight_Modular', x + a + 1, y + 1, z, 0); P('dungeon/Fence_Straight_Modular', x + a + 1, y + 1, z + d, Math.PI); }
  for (let c = 0; c < d; c += 2) { P('dungeon/Fence_Straight_Modular', x, y + 1, z + c + 1, Math.PI / 2); P('dungeon/Fence_Straight_Modular', x + w, y + 1, z + c + 1, -Math.PI / 2); }
  P('dungeon/Fence_90_Modular', x, y + 1, z, 0); P('dungeon/Fence_End_Modular', x + w, y + 1, z + d, Math.PI);
}
