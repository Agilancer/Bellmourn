// Path check: walks the built world's colliders the way the player does (the same radius, step
// and height) and reports what stands in a doorway, a hallway mouth, a hallway or a road, and
// any room, chamber or doorway the player can't get to: in every dungeon (ctx.unders), every
// cave (ctx.caves), every door and house, and along the roads (ctx.paths: [{ pts, w }], when the
// world gives them). Run it in the browser once the game has loaded:
//   (await import('/tools/pathcheck.js')).check()
// Each problem names the models in the way (props and kit pieces carry their model id as `src`).
const R = 0.32, STEP = 0.42, H = 1.7;
const IGNORE = new Set(['wall', 'door', 'floor']); // the building itself, not things in it

const hits = (b, x0, z0, x1, z1) => b.max[0] > x0 && b.min[0] < x1 && b.max[2] > z0 && b.min[2] < z1;
const standing = (b, y) => !b.off && b.max[1] > y + STEP && b.min[1] < y + H; // in the way of someone at y
const name = (b) => b.src || b.tag;
const round = (v) => Math.round(v * 10) / 10;

/** Boxes (not walls or doors) standing in the rectangle at floor height y. Built masonry ('solid'
 * boxes from geo.js) taller than a room counts as wall. */
function inRect(physics, x0, z0, x1, z1, y, ignore = IGNORE) {
  return [...physics.near(x0, z0, x1, z1)].filter((b) => !ignore.has(b.tag) && !(b.tag === 'solid' && b.max[1] - Math.max(b.min[1], y) > 2.6) && standing(b, y) && hits(b, x0, z0, x1, z1));
}

/** Can a player stand at (x, z) with feet at y? (doors count as open) */
function free(physics, x, z, y) {
  for (const b of physics.near(x - R, z - R, x + R, z + R)) {
    if (b.tag === 'door' || !standing(b, y)) continue;
    const cx = Math.max(b.min[0], Math.min(x, b.max[0])), cz = Math.max(b.min[2], Math.min(z, b.max[2]));
    if ((x - cx) ** 2 + (z - cz) ** 2 < R * R) return false;
  }
  return true;
}

/** Breadth-first walk over a grid of step g from start, inside bounds [x0, z0, x1, z1], climbing
 * and dropping as the player would. inside(x, z) limits it further. Returns (x, z) -> reached. */
function walk(physics, start, bounds, { g = 0.25, inside = () => true, flat = null, maxCells = 3e6 } = {}) {
  const [x0, z0, x1, z1] = bounds, nx = Math.ceil((x1 - x0) / g), nz = Math.ceil((z1 - z0) / g);
  if (nx * nz > maxCells) throw new Error('walk: area too big');
  const Y = new Float32Array(nx * nz).fill(NaN), q = new Int32Array(nx * nz);
  const ci = (x, z) => { const i = Math.floor((x - x0) / g), k = Math.floor((z - z0) / g); return i < 0 || k < 0 || i >= nx || k >= nz ? -1 : k * nx + i; };
  const s = ci(start.x, start.z);
  if (s < 0) return { reached: () => false, count: 0 };
  Y[s] = flat ?? start.y;
  let head = 0, tail = 0, count = 1;
  q[tail++] = s;
  while (head < tail) {
    const c = q[head++], i = c % nx, k = (c - i) / nx, y = Y[c];
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nk = k + dk;
      if (ni < 0 || nk < 0 || ni >= nx || nk >= nz) continue;
      const n = nk * nx + ni;
      if (!Number.isNaN(Y[n])) continue;
      const x = x0 + (ni + 0.5) * g, z = z0 + (nk + 0.5) * g;
      if (!inside(x, z)) continue;
      const ny = flat ?? physics.floorAt(x, z, y, R, STEP);
      if (!(ny > y - 4)) continue; // no floor, or a drop no one walks off on purpose
      if (!free(physics, x, z, ny)) continue;
      Y[n] = ny; q[tail++] = n; count++;
    }
  }
  return { reached: (x, z) => { const c = ci(x, z); return c >= 0 && !Number.isNaN(Y[c]); }, top: () => Y.reduce((a, v) => (v > a ? v : a), -Infinity), count };
}

// ------------------------------------------------------------------ the dungeons
// (the Undercroft, the Deep Undercroft below it and the Darkwood's delves: every dungeon there is)
function undercroft(bm, out) {
  const { ctx } = bm;
  for (const D of ctx.unders ? ctx.unders.map((u) => u.dg).filter((d) => d.nav && d.roomList) : [ctx.dungeon]) dungeon(bm, D, out);
}

function dungeon(bm, D, out) {
  const { physics, ctx } = bm, { x0, z0, nx, nz, cell } = D.nav, Y = D.y, area = D.name || 'undercroft';
  const at = (i, k) => (i < 0 || k < 0 || i >= nx || k >= nz ? -1 : cell[k * nx + i]);
  const TUNNEL = 2999, isHall = (v) => v >= 1000 && v !== TUNNEL;
  // hallway mouths: room cells beside a hallway; their aprons run 3 m into the room, a cell either side
  const apron = new Map(); // cell index -> room id
  const mouths = [];
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const v = at(i, k);
    if (v < 0 || v >= 1000) continue;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!isHall(at(i + di, k + dk))) continue;
      mouths.push({ room: v, x: x0 + i + 0.5, z: z0 + k + 0.5 });
      for (let t = 0; t < 3; t++) for (let s = -1; s <= 1; s++) {
        const ai = i - di * t + dk * s, ak = k - dk * t + di * s;
        if (at(ai, ak) === v) apron.set(ak * nx + ai, v);
      }
    }
  }
  const seen = new Set();
  for (const [c, room] of apron) {
    const i = c % nx, k = (c - i) / nx;
    for (const b of inRect(physics, x0 + i, z0 + k, x0 + i + 1, z0 + k + 1, Y)) {
      if (seen.has(b)) continue;
      seen.add(b);
      out.push({ area, kind: 'mouth', room: `${room} ${D.roomList[room].kind}`, what: name(b), at: [round((b.min[0] + b.max[0]) / 2), round((b.min[2] + b.max[2]) / 2)] });
    }
  }
  // anything standing in a hallway (not the foot of the stairs, where the flight itself comes down)
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    if (!isHall(at(i, k)) || at(i, k) === 1999) continue;
    for (const b of inRect(physics, x0 + i, z0 + k, x0 + i + 1, z0 + k + 1, Y)) {
      if (seen.has(b)) continue;
      seen.add(b);
      out.push({ area, kind: 'hallway', what: name(b), at: [round((b.min[0] + b.max[0]) / 2), round((b.min[2] + b.max[2]) / 2)] });
    }
  }
  // can every room be walked into from the foot of the stairs, through every one of its mouths?
  // (from the middle of the passage's northmost row, clear of the flight's last steps)
  const f = cell.indexOf(1999), start = f < 0 ? { x: ctx.stairBottom.x, z: ctx.stairBottom.z - 1 } : { x: x0 + (f % nx) + 1.5, z: z0 + Math.floor(f / nx) + 0.5 };
  const w = walk(physics, { ...start, y: Y }, [x0, z0, x0 + nx, z0 + nz], { flat: Y, inside: (x, z) => at(Math.floor(x - x0), Math.floor(z - z0)) >= 0 });
  const byRoom = new Map();
  for (const m of mouths) if (!w.reached(m.x, m.z)) { const r = byRoom.get(m.room) || []; r.push([round(m.x), round(m.z)]); byRoom.set(m.room, r); }
  for (const [room, cells] of byRoom) out.push({ area, kind: 'unreachable mouth', room: `${room} ${D.roomList[room].kind}`, cells: cells.length, at: cells[0] });
  // how much of each room's floor is walked: the walk's own quarter-metre cells, read at their
  // middles (dungeon.js keeps its rooms open by the same count)
  D.roomList.forEach((r, id) => {
    let n = 0, ok = 0;
    for (let x = r.x0 + 0.125; x < r.x1; x += 0.25) for (let z = r.z0 + 0.125; z < r.z1; z += 0.25) {
      if (at(Math.floor(x - x0), Math.floor(z - z0)) < 0) continue; // (a stairwell has no floor to walk)
      n++; if (w.reached(x, z)) ok++;
    }
    if (ok / n < 0.6) out.push({ area, kind: 'cramped room', room: `${id} ${r.kind}`, walkable: round(ok / n) });
  });
}

// ------------------------------------------------------------------ doors
function doors(bm, out) {
  const { physics, ctx } = bm;
  for (const d of ctx.doors.list) {
    const bs = d.boxes, mn = [Math.min(...bs.map((b) => b.min[0])), Math.min(...bs.map((b) => b.min[2]))], mx = [Math.max(...bs.map((b) => b.max[0])), Math.max(...bs.map((b) => b.max[2]))];
    const y = d.leaves[0].pivot.position.y, alongX = mx[0] - mn[0] > mx[1] - mn[1];
    const cx = (mn[0] + mx[0]) / 2, cz = (mn[1] + mx[1]) / 2, half = (alongX ? mx[0] - mn[0] : mx[1] - mn[1]) / 2;
    const where = `${d.name} @ ${round(cx)},${round(cz)}`;
    for (const side of [-1, 1]) {
      // the doorway's apron: as wide as the door and a bit, 1.6 m out
      const r = alongX ? [cx - half - 0.3, side < 0 ? cz - 1.6 : cz, cx + half + 0.3, side < 0 ? cz : cz + 1.6]
        : [side < 0 ? cx - 1.6 : cx, cz - half - 0.3, side < 0 ? cx : cx + 1.6, cz + half + 0.3];
      for (const b of inRect(physics, ...r, y)) out.push({ area: 'doors', kind: 'doorway', door: where, side, what: name(b), at: [round((b.min[0] + b.max[0]) / 2), round((b.min[2] + b.max[2]) / 2)] });
    }
    // through it: from 1.4 m out on one side to 1.4 m out on the other
    const a = alongX ? { x: cx, z: cz - 1.4 } : { x: cx - 1.4, z: cz }, b = alongX ? { x: cx, z: cz + 1.4 } : { x: cx + 1.4, z: cz };
    const ya = physics.floorAt(a.x, a.z, y + 0.3, R, STEP);
    const w = walk(physics, { ...a, y: ya }, [cx - 4, cz - 4, cx + 4, cz + 4], { g: 0.2 });
    if (!w.reached(b.x, b.z)) out.push({ area: 'doors', kind: 'impassable door', door: where });
  }
}

// ------------------------------------------------------------------ from the road to every door
function access(bm, out) {
  const { physics, ctx } = bm, pts = [];
  for (const p of ctx.paths || []) for (let i = 0; i + 1 < p.pts.length; i++) {
    const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1], len = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t <= len; t += 2) pts.push([ax + (bx - ax) * t / len, az + (bz - az) * t / len]);
  }
  for (const d of ctx.doors.list) {
    if (d.name === 'office door' || d.name === 'stair door') continue; // inside the cathedral
    const c = d.center;
    let best = null, bd = 70;
    for (const [x, z] of pts) { const e = Math.hypot(x - c.x, z - c.z); if (e < bd && free(physics, x, z, physics.groundAt(x, z))) { bd = e; best = [x, z]; } }
    if (!best) continue;
    const pad = 24, box = [Math.min(best[0], c.x) - pad, Math.min(best[1], c.z) - pad, Math.max(best[0], c.x) + pad, Math.max(best[1], c.z) + pad];
    const w = walk(physics, { x: best[0], z: best[1], y: physics.groundAt(best[0], best[1]) }, box, { g: 0.3 });
    // either side of the door will do (the door check sees that it can be gone through)
    const bs = d.boxes, alongX = Math.max(...bs.map((b) => b.max[0])) - Math.min(...bs.map((b) => b.min[0])) > Math.max(...bs.map((b) => b.max[2])) - Math.min(...bs.map((b) => b.min[2]));
    const sides = alongX ? [[c.x, c.z - 1.2], [c.x, c.z + 1.2]] : [[c.x - 1.2, c.z], [c.x + 1.2, c.z]];
    if (!sides.some(([x, z]) => w.reached(x, z))) out.push({ area: 'access', kind: 'no way from the road', door: `${d.name} @ ${round(c.x)},${round(c.z)}`, road: best.map(round) });
  }
}

// ------------------------------------------------------------------ up the stairs in every house
function upstairs(bm, out) {
  const { physics, ctx } = bm;
  for (const r of ctx.interiors) {
    if (!(r.storeys > 1)) continue;
    const d = ctx.doors.list.find((q) => { const c = q.center; return c.x > r.x0 - 1.5 && c.x < r.x1 + 1.5 && c.z > r.z0 - 1.5 && c.z < r.z1 + 1.5 && Math.abs(c.y - 1.1 - r.floor) < 1.5; });
    if (!d) continue;
    const inside = (x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
    let s = null;
    for (let k = 0.6; k < 2.6 && !s; k += 0.2) for (const [dx, dz] of [[k, 0], [-k, 0], [0, k], [0, -k]]) {
      const x = d.center.x + dx, z = d.center.z + dz;
      if (inside(x, z) && free(physics, x, z, r.floor)) { s = { x, z, y: r.floor }; break; }
    }
    if (!s) continue;
    // (the walk is flat, a cell to a height: the floor overhead is never stepped onto, but the
    // top of the stair is, and from there it's level)
    const w = walk(physics, s, [r.x0, r.z0, r.x1, r.z1], { g: 0.2, inside });
    if (!(w.top() > r.floor + 2.8)) out.push({ area: 'interiors', kind: 'no way upstairs', room: r.name, top: round(w.top() - r.floor) });
  }
}

// ------------------------------------------------------------------ rooms indoors
function interiors(bm, out) {
  const { physics, ctx } = bm;
  for (const r of ctx.interiors) {
    if (r.outdoor || r.biome === 'undercroft') continue;
    const inside = (x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
    const door = ctx.doors.list.find((d) => { const c = d.center; return c.x > r.x0 - 1.5 && c.x < r.x1 + 1.5 && c.z > r.z0 - 1.5 && c.z < r.z1 + 1.5 && Math.abs(c.y - 1.1 - r.floor) < 1.5; });
    // start just inside the door (or wherever the floor is clear)
    let start = null;
    const cands = [];
    if (door) { const c = door.center; for (let s = 0.4; s < 2.5; s += 0.2) for (const [dx, dz] of [[s, 0], [-s, 0], [0, s], [0, -s]]) cands.push([c.x + dx, c.z + dz]); }
    for (let x = r.x0 + 0.5; x < r.x1; x += 0.5) for (let z = r.z0 + 0.5; z < r.z1; z += 0.5) cands.push([x, z]);
    for (const [x, z] of cands) if (inside(x, z) && free(physics, x, z, r.floor)) { start = { x, z, y: r.floor }; break; }
    let n = 0, ok = 0, clear = 0;
    const w = start ? walk(physics, start, [r.x0, r.z0, r.x1, r.z1], { g: 0.2, inside, flat: r.floor }) : null;
    for (let x = r.x0 + 0.5; x < r.x1 - 0.3; x += 0.4) for (let z = r.z0 + 0.5; z < r.z1 - 0.3; z += 0.4) {
      n++;
      if (free(physics, x, z, r.floor)) clear++;
      if (w?.reached(x, z)) ok++;
    }
    if (!n) continue;
    if (!start || ok / n < 0.3 || ok < clear * 0.85) out.push({ area: 'interiors', kind: 'cluttered room', room: r.name, walkable: round(ok / n), clear: round(clear / n), door: !!door });
  }
}

// ------------------------------------------------------------------ roads
function roads(bm, out) {
  const { physics, ctx } = bm, seen = new Set();
  for (const p of ctx.paths || []) {
    const lane = Math.min(p.w * 0.5, 1.4); // the middle of the road, wide enough to walk unhindered
    // the floor underfoot, carried along the road as the player walks it: up onto a bridge's deck
    // and over (not down on the stream bed, where the deck would be in the way)
    let y = physics.groundAt(...p.pts[0]);
    for (let i = 0; i + 1 < p.pts.length; i++) {
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= len; t += 0.8) {
        const x = ax + (bx - ax) * t / len, z = az + (bz - az) * t / len, f = physics.floorAt(x, z, y, R, STEP);
        y = Number.isFinite(f) ? f : physics.groundAt(x, z);
        for (const b of physics.near(x - lane, z - lane, x + lane, z + lane)) {
          if (seen.has(b) || b.tag === 'door' || !standing(b, y)) continue;
          const cx = Math.max(b.min[0], Math.min(x, b.max[0])), cz = Math.max(b.min[2], Math.min(z, b.max[2]));
          if ((x - cx) ** 2 + (z - cz) ** 2 >= lane * lane) continue;
          seen.add(b);
          out.push({ area: 'roads', kind: 'on the road', what: name(b), tag: b.tag, at: [round((b.min[0] + b.max[0]) / 2), round((b.min[2] + b.max[2]) / 2)] });
        }
      }
    }
  }
}

// ------------------------------------------------------------------ the caves
// (the Gloamhollow, the Drowned Grotto and the Trollhole)
function cave(bm, out) {
  const { ctx } = bm;
  for (const C of ctx.caves || (ctx.cave ? [ctx.cave] : [])) oneCave(bm, C, out);
}

function oneCave(bm, C, out) {
  const { physics } = bm, area = C.name || 'cave';
  const x0 = C.px + C.a0, z0 = C.pz + C.b0, x1 = x0 + C.nx * 0.5, z1 = z0 + C.nz * 0.5;
  // in from the mouth, and back out again from its greatest chamber (climbing is harder than
  // dropping), from the dry floor nearest the chamber's middle
  const cav = C.features.filter((f) => f.type === 'room').reduce((a, f) => (f.ra * f.rb > a.ra * a.rb ? f : a));
  let back = null;
  for (let d = 0; d < Math.min(cav.ra, cav.rb) && !back; d += 0.5) for (let t = 0; t < 8 && !back; t++) {
    const x = C.px + cav.a + Math.cos(t * Math.PI / 4) * d, z = C.pz + cav.b + Math.sin(t * Math.PI / 4) * d, j = C.idx(x, z);
    if (j >= 0 && C.s[j] < -1 && !(C.water && Math.hypot(x - C.water.x, z - C.water.z) < C.water.r + 1)) back = { x, z, y: C.floor[j] };
  }
  if (!back) { out.push({ area, kind: 'error', what: `no dry floor in the ${cav.tag}` }); return; }
  const wIn = walk(physics, C.mouth, [x0 - 8, z0, x1, z1], { g: 0.25 }), wOut = walk(physics, back, [x0 - 8, z0, x1, z1], { g: 0.25 });
  if (!wOut.reached(C.mouth.x, C.mouth.z)) out.push({ area, kind: 'no way out', from: cav.tag });
  const tally = new Map();
  for (let j = 0; j < C.nx * C.nz; j++) {
    if (C.s[j] > -0.6) continue;
    const i = j % C.nx, k = (j - i) / C.nx, x = x0 + i * 0.5, z = z0 + k * 0.5;
    const tag = C.tagAt({ x, z }), t = tally.get(tag) || [0, 0, 0];
    t[0]++; if (wIn.reached(x, z)) t[1]++; if (wOut.reached(x, z)) t[2]++;
    tally.set(tag, t);
  }
  for (const [tag, [n, a, b]] of tally) if (a / n < 0.8 || b / n < 0.8) out.push({ area, kind: 'hard to reach', where: tag, fromMouth: round(a / n), fromChamber: round(b / n) });
  // anything solid in the passages themselves
  for (const f of C.features) {
    if (f.type !== 'pass') continue;
    for (let i = 0; i + 1 < f.pts.length; i++) {
      const [a0, b0] = f.pts[i], [a1, b1] = f.pts[i + 1], len = Math.hypot(a1 - a0, b1 - b0);
      for (let t = 0; t <= len; t += 0.5) {
        const x = C.px + a0 + (a1 - a0) * t / len, z = C.pz + b0 + (b1 - b0) * t / len, j = C.idx(x, z);
        if (j < 0) continue;
        for (const b of inRect(physics, x - f.r * 0.6, z - f.r * 0.6, x + f.r * 0.6, z + f.r * 0.6, C.floor[j], new Set(['wall', 'door', 'floor', 'solid', 'cave'])))
          out.push({ area, kind: 'in a passage', where: f.tag, what: name(b), at: [round((b.min[0] + b.max[0]) / 2), round((b.min[2] + b.max[2]) / 2)] });
      }
    }
  }
}

export function check(bm = window.bellmourn, parts = ['undercroft', 'doors', 'access', 'upstairs', 'interiors', 'roads', 'cave']) {
  const out = [], fns = { undercroft, doors, access, upstairs, interiors, roads, cave };
  if (!bm.ctx.paths && (parts.includes('roads') || parts.includes('access'))) console.warn('pathcheck: the world gives no ctx.paths, so the roads and the ways from them to the doors are not checked');
  for (const p of parts) { try { fns[p](bm, out); } catch (e) { out.push({ area: p, kind: 'error', what: String(e) }); } }
  // the same box reported twice from overlapping samples counts once
  const seen = new Set();
  return out.filter((o) => { const k = JSON.stringify(o); if (seen.has(k)) return false; seen.add(k); return true; });
}
