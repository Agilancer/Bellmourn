// Path check: walks the built world's colliders the way the player does (the same radius, step
// and height) and reports what stands in a doorway, a hallway mouth, a hallway or a road, and
// any room, chamber or doorway the player can't get to. Run it in the browser once the game has
// loaded:
//   (await import('/tools/pathcheck.js')).check()
// Each problem names the models in the way (kit colliders carry their model id as `src`).
const R = 0.32, STEP = 0.42, H = 1.8;
const IGNORE = new Set(['wall', 'door', 'floor']); // the building itself, not things in it

const hits = (b, x0, z0, x1, z1) => b.max[0] > x0 && b.min[0] < x1 && b.max[2] > z0 && b.min[2] < z1;
const standing = (b, y) => !b.off && b.max[1] > y + STEP && b.min[1] < y + H; // in the way of someone at y
const name = (b) => b.src || b.tag;
const round = (v) => Math.round(v * 10) / 10;

/** Boxes (not walls or doors) standing in the rectangle at floor height y. Built masonry ('solid'
 * boxes from geo.js) taller than a room counts as wall. */
function inRect(physics, x0, z0, x1, z1, y, ignore = IGNORE) {
  return [...physics.near(x0, z0, x1, z1)].filter((b) => !b.seg && !ignore.has(b.tag) && !(b.tag === 'solid' && b.max[1] - Math.max(b.min[1], y) > 2.6) && standing(b, y) && hits(b, x0, z0, x1, z1));
}

/** Can a player stand at (x, z) with feet at y? (doors count as open) */
function free(physics, x, z, y) {
  for (const b of physics.near(x - R, z - R, x + R, z + R)) {
    if (b.tag === 'door' || !standing(b, y)) continue;
    if (b.seg) {   // a wall at an angle (physics.addSeg)
      const t = Math.max(0, Math.min(b.len, (x - b.ax) * b.ux + (z - b.az) * b.uz));
      if (Math.hypot(x - b.ax - b.ux * t, z - b.az - b.uz * t) < R + b.half) return false;
      continue;
    }
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

// ------------------------------------------------------------------ the catacombs (catacombs.js)
const SOLID = new Set(['wall', 'door', 'floor', 'cave']);
/** Walk the catacombs from the foot of the cathedral's stair: every space reached (the far side of
 * the gulf only by jumping the bridge's gap, so the walk starts again from its far landing), the
 * gulf's floor able to climb back out, nothing standing in an opening's apron or a passage's lane. */
function undercroft(bm, out) {
  const { physics, ctx } = bm, C = ctx.catacombs;
  if (!C) return;
  const m = C.mason, sb = ctx.stairBottom, B = [m.x0, m.z0, m.x0 + m.nx * 0.25, m.z0 + m.nz * 0.25];
  const inside = (x, z) => !!m.spaceAt(x, z) || C.gulf.floorAt(x, z) != null;
  const near = walk(physics, { x: sb.x, z: sb.z - 1, y: -14 }, B, { g: 0.5, inside });
  const far = walk(physics, { x: 12, z: -233, y: -19 }, B, { g: 0.5, inside });
  const gulf = walk(physics, { x: 4, z: -214, y: C.gulf.floorAt(4, -214) }, B, { g: 0.5, inside });
  const at = (x, z) => near.reached(x, z) || far.reached(x, z);
  // (a spot counts as reached if somewhere within 0.8 m of it is: it may be a pillar's or a brazier's)
  const reached = (x, z) => { for (const [dx, dz] of [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8], [0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) if (at(x + dx, z + dz)) return true; return false; };
  if (near.reached(12, -233)) out.push({ area: 'undercroft', kind: 'the gap can be walked round', note: 'the far side reached without jumping' });
  if (!gulf.reached(12, -193)) out.push({ area: 'undercroft', kind: 'no way out of the gulf', from: 'its floor' });
  if (!far.reached(12, -230)) out.push({ area: 'undercroft', kind: 'far landing cut off' });
  for (const s of m.spaces) {
    if (s.type === 'room') {
      let n = 0, ok = 0;
      for (const [x, z] of s.poly) { const px = x + (s.cx - x) * 0.25, pz = z + (s.cz - z) * 0.25; n++; if (reached(px, pz)) ok++; }
      if (ok / n < 0.75) out.push({ area: 'undercroft', kind: 'hard to reach', room: s.name, walkable: round(ok / n),
        missed: s.poly.map(([x, z]) => [round(x + (s.cx - x) * 0.25), round(z + (s.cz - z) * 0.25)]).filter(([x, z]) => !reached(x, z)).slice(0, 6) });
      // each opening's apron: 3 m into the room before it, as wide as the opening and a bit
      for (const o of s.openings) {
        const ed = s.edges[o.e], cx = ed.a[0] + ed.ux * o.t, cz = ed.a[1] + ed.uz * o.t;
        for (let d = 0.4; d <= 3; d += 0.5) for (let w = -o.w / 2 - 0.3; w <= o.w / 2 + 0.3; w += 0.5) {
          const x = cx + ed.nx * d + ed.ux * w, z = cz + ed.nz * d + ed.uz * w;
          for (const b of inRect(physics, x - 0.25, z - 0.25, x + 0.25, z + 0.25, s.y, SOLID))
            out.push({ area: 'undercroft', kind: 'mouth', room: s.name, what: name(b), at: [round((b.min[0] + b.max[0]) / 2), round((b.min[2] + b.max[2]) / 2)] });
        }
      }
    } else if (s.type === 'passage') {
      for (let i = 0; i + 1 < s.pts.length; i++) {
        const [ax, az, ay] = s.pts[i], [bx, bz, by] = s.pts[i + 1], L = Math.hypot(bx - ax, bz - az);
        for (let t = 0.5; t < L; t += 1) {
          const x = ax + (bx - ax) * t / L, z = az + (bz - az) * t / L, y = m.floorAt(x, z) ?? ay;
          if (!reached(x, z)) { out.push({ area: 'undercroft', kind: 'passage cut off', where: s.name, at: [round(x), round(z)] }); break; }
          const lane = s.w / 2 - 0.9;     // a lane down the middle kept clear (things may stand by the walls)
          for (const b of inRect(physics, x - lane, z - lane, x + lane, z + lane, y, SOLID)) {
            if (Math.hypot((b.min[0] + b.max[0]) / 2 - x, (b.min[2] + b.max[2]) / 2 - z) > lane + 0.3) continue;
            out.push({ area: 'undercroft', kind: 'in a passage', where: s.name, what: name(b), at: [round((b.min[0] + b.max[0]) / 2), round((b.min[2] + b.max[2]) / 2)] });
          }
        }
        void by;
      }
    }
  }
  // the climbs: up the Founders' Tomb and the First Bell's stair
  for (const [what, x, z] of [["the Founders' Tomb", 12, -269.6], ['the First Bell', 13.5, -356]]) if (!reached(x, z)) out.push({ area: 'undercroft', kind: 'cannot climb', what });
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
    for (let i = 0; i + 1 < p.pts.length; i++) {
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= len; t += 0.8) {
        const x = ax + (bx - ax) * t / len, z = az + (bz - az) * t / len, y = physics.groundAt(x, z);
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

// ------------------------------------------------------------------ the Gloamhollow
function cave(bm, out) {
  const { physics, ctx } = bm, C = ctx.cave;
  if (!C) return;
  const x0 = C.px + C.a0, z0 = C.pz + C.b0, x1 = x0 + C.nx * 0.5, z1 = z0 + C.nz * 0.5;
  // in from the mouth, and back out again from the cavern (climbing is harder than dropping)
  const cav = C.features.find((f) => f.tag === 'cavern'), back = { x: C.px + cav.a - 6, z: C.pz + cav.b };
  back.y = C.floor[C.idx(back.x, back.z)];
  const wIn = walk(physics, C.mouth, [x0 - 8, z0, x1, z1], { g: 0.25 }), wOut = walk(physics, back, [x0 - 8, z0, x1, z1], { g: 0.25 });
  if (!wOut.reached(C.mouth.x, C.mouth.z)) out.push({ area: 'cave', kind: 'no way out', from: 'cavern' });
  const tally = new Map();
  for (let j = 0; j < C.nx * C.nz; j++) {
    if (C.s[j] > -0.6) continue;
    const i = j % C.nx, k = (j - i) / C.nx, x = x0 + i * 0.5, z = z0 + k * 0.5;
    const tag = C.tagAt({ x, z }), t = tally.get(tag) || [0, 0, 0];
    t[0]++; if (wIn.reached(x, z)) t[1]++; if (wOut.reached(x, z)) t[2]++;
    tally.set(tag, t);
  }
  for (const [tag, [n, a, b]] of tally) if (a / n < 0.8 || b / n < 0.8) out.push({ area: 'cave', kind: 'hard to reach', where: tag, fromMouth: round(a / n), fromCavern: round(b / n) });
  // anything solid in the passages themselves
  for (const f of C.features) {
    if (f.type !== 'pass') continue;
    for (let i = 0; i + 1 < f.pts.length; i++) {
      const [a0, b0] = f.pts[i], [a1, b1] = f.pts[i + 1], len = Math.hypot(a1 - a0, b1 - b0);
      for (let t = 0; t <= len; t += 0.5) {
        const x = C.px + a0 + (a1 - a0) * t / len, z = C.pz + b0 + (b1 - b0) * t / len, j = C.idx(x, z);
        if (j < 0) continue;
        for (const b of inRect(physics, x - f.r * 0.6, z - f.r * 0.6, x + f.r * 0.6, z + f.r * 0.6, C.floor[j], new Set(['wall', 'door', 'floor', 'solid', 'cave'])))
          out.push({ area: 'cave', kind: 'in a passage', where: f.tag, what: name(b), at: [round((b.min[0] + b.max[0]) / 2), round((b.min[2] + b.max[2]) / 2)] });
      }
    }
  }
}

export function check(bm = window.bellmourn, parts = ['undercroft', 'doors', 'access', 'upstairs', 'interiors', 'roads', 'cave']) {
  const out = [], fns = { undercroft, doors, access, upstairs, interiors, roads, cave };
  for (const p of parts) { try { fns[p](bm, out); } catch (e) { out.push({ area: p, kind: 'error', what: String(e) }); } }
  // the same box reported twice from overlapping samples counts once
  const seen = new Set();
  return out.filter((o) => { const k = JSON.stringify(o); if (seen.has(k)) return false; seen.add(k); return true; });
}
