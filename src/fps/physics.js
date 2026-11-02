// Collision world: axis-aligned boxes in a spatial hash. The player is an upright cylinder
// that slides along walls, steps up onto stairs and kerbs, and stands on the highest surface
// below it (box tops, or the outdoor ground while above it). The ground is y = 0 except where
// a terrain function gives a height (the hills); terrain too steep to step up blocks the way
// like a wall. A box with `off` set (an open door) is ignored.
//
// Besides boxes: segment walls (addSeg), straight walls at any angle with a thickness, for rooms
// that aren't boxes (the catacombs' octagons, curves and chamfers); and moving surfaces
// (`dynamic`: the rope bridge), each {x0, z0, x1, z1, floorAt(x, z, y, r, step), slide(p, r, h, step)},
// asked for a floor under you and to hold you on them.

const CELL = 8;
const key = (i, k) => i * 73856093 ^ k * 19349663;

export class Physics {
  constructor() {
    this.boxes = [];
    this.grid = new Map();
    this.ground = 0;       // the outdoor ground height where there is no terrain
    this.terrain = null;   // (x, z) -> height, or null to use `ground`
    this.groundHoles = []; // [x0, z0, x1, z1]: no outdoor ground here (stairwells)
    this.dynamic = [];     // moving surfaces (see the head of the file)
  }

  /** A straight wall `thick` metres through, from (ax, az) to (bx, bz) at any angle, y0..y1 (its
   * ends rounded). It sits in the same spatial hash as the boxes; `min`/`max` are its bounds. */
  addSeg(ax, az, bx, bz, y0, y1, thick = 0.5, tag = 'wall') {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    if (len < 1e-4) return null;
    const h = thick / 2;
    const s = { seg: true, ax, az, bx, bz, ux: dx / len, uz: dz / len, len, half: h, tag,
      min: [Math.min(ax, bx) - h, y0, Math.min(az, bz) - h], max: [Math.max(ax, bx) + h, y1, Math.max(az, bz) + h] };
    this.index(s);
    return s;
  }

  index(b) {
    const i0 = Math.floor(b.min[0] / CELL), i1 = Math.floor(b.max[0] / CELL);
    const k0 = Math.floor(b.min[2] / CELL), k1 = Math.floor(b.max[2] / CELL);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      const h = key(i, k);
      if (!this.grid.has(h)) this.grid.set(h, []);
      this.grid.get(h).push(b);
    }
  }

  /** Is a cylinder of radius r at (x, z), feet at y, height h, clear of everything solid? (what
   * a path check or a spawn asks: boxes and segment walls alike) */
  clear(x, z, y, r, h, step = 0) {
    for (const b of this.near(x - r, z - r, x + r, z + r)) {
      if (b.max[1] <= y + step || b.min[1] >= y + h) continue;
      if (b.seg ? segDist(b, x, z) < r + b.half : circleBox(x, z, r, b)) return false;
    }
    return true;
  }

  /** The way round what's in front of a walker: the heading nearest `want` (radians, as atan2(dx, dz))
   * along which a cylinder at p (radius r, height h, stepping up `step`) has `far` metres clear,
   * trying `bias`'s side first (+1 or -1) so it doesn't dither, out to `spread` radians either way.
   * Things low enough to step onto don't count. Returns the heading, or null when every way is shut. */
  wayRound(p, want, r, h, step, far = 1.8, bias = 1, spread = 2.1) {
    const list = [];
    for (const b of this.near(p.x - far - r, p.z - far - r, p.x + far + r, p.z + far + r))
      if (b.max[1] > p.y + step && b.min[1] < p.y + h) list.push(b);
    const outdoors = this.terrain && p.y > this.groundAt(p.x, p.z) - 0.5;
    const open = (a) => {
      const sx = Math.sin(a), cz = Math.cos(a);
      let gy = outdoors ? this.groundAt(p.x, p.z) : 0;
      for (let d = Math.min(0.4, far); d <= far + 1e-6; d += 0.4) {
        const x = p.x + sx * d, z = p.z + cz * d;
        for (const b of list) if (b.seg ? segDist(b, x, z) < r + b.half : circleBox(x, z, r, b)) return false;
        if (outdoors && this.hasGround(x, z)) { const g = this.groundAt(x, z); if (g > gy + step) return false; gy = g; }   // (a bank too steep)
      }
      return true;
    };
    if (open(want)) return want;
    const s = bias < 0 ? -1 : 1;
    for (let k = 0.3; k <= spread + 1e-6; k += 0.3) {
      if (open(want + s * k)) return want + s * k;
      if (open(want - s * k)) return want - s * k;
    }
    return null;
  }

  groundAt(x, z) { return this.terrain ? this.terrain(x, z) : this.ground; }

  add(min, max, tag = 'solid') {
    const b = { min: [...min], max: [...max], tag };
    this.boxes.push(b);
    this.index(b);
    return b;
  }

  near(x0, z0, x1, z1) {
    const out = new Set();
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++) {
        const c = this.grid.get(key(i, k));
        if (c) for (const b of c) if (!b.off) out.add(b);
      }
    return out;
  }

  hasGround(x, z) {
    for (const [x0, z0, x1, z1] of this.groundHoles) if (x > x0 && x < x1 && z > z0 && z < z1) return false;
    return true;
  }

  /** Highest walkable surface under (x, z) for a cylinder of radius r whose feet are at y,
   * reachable by stepping up at most `step`. */
  floorAt(x, z, y, r, step) {
    let best = -Infinity;
    if (this.hasGround(x, z)) { const g = this.groundAt(x, z); if (g <= y + step) best = g; }
    for (const b of this.near(x - r, z - r, x + r, z + r)) {
      if (b.max[1] > y + step || b.max[1] < best) continue;
      if (b.seg ? segDist(b, x, z) < r * 0.7 + b.half : circleBox(x, z, r * 0.7, b)) best = b.max[1];
    }
    for (const d of this.dynamic) {
      if (x < d.x0 - r || x > d.x1 + r || z < d.z0 - r || z > d.z1 + r) continue;
      const f = d.floorAt(x, z, y, r, step);
      if (f > best && f <= y + step) best = f;
    }
    return best;
  }

  /** Move a cylinder (feet at p.y, height h, radius r) by (dx, dz), sliding along walls and
   * stepping up onto anything no taller than `step`. Mutates p. */
  slide(p, dx, dz, r, h, step) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.5)));
    for (let s = 0; s < n; s++) {
      const ox = p.x, oz = p.z;
      p.x += dx / n; p.z += dz / n;
      // standing on the ground (not under it, in a cellar or tunnel) and it rises too steeply
      if (this.terrain && p.y > this.groundAt(ox, oz) - 0.5 && this.hasGround(p.x, p.z) && this.groundAt(p.x, p.z) > p.y + step) {
        // too steep to climb: slide along the slope if one axis alone is climbable
        p.x = ox + dx / n; p.z = oz;
        if (this.groundAt(p.x, p.z) > p.y + step) { p.x = ox; p.z = oz + dz / n; }
        if (this.groundAt(p.x, p.z) > p.y + step) { p.x = ox; p.z = oz; }
      }
      for (let it = 0; it < 3; it++) {
        let moved = false;
        for (const b of this.near(p.x - r, p.z - r, p.x + r, p.z + r)) {
          if (b.max[1] <= p.y + step || b.min[1] >= p.y + h) continue; // stepped onto / overhead
          if (b.seg) {   // a wall at an angle: out along the line from its middle to you
            const t = Math.max(0, Math.min(b.len, (p.x - b.ax) * b.ux + (p.z - b.az) * b.uz));
            let ox = p.x - (b.ax + b.ux * t), oz = p.z - (b.az + b.uz * t);
            const d = Math.hypot(ox, oz), need = r + b.half;
            if (d >= need) continue;
            if (d < 1e-6) { ox = -b.uz; oz = b.ux; } else { ox /= d; oz /= d; }
            p.x += ox * (need - d); p.z += oz * (need - d);
            moved = true;
            continue;
          }
          const cx = Math.max(b.min[0], Math.min(p.x, b.max[0]));
          const cz = Math.max(b.min[2], Math.min(p.z, b.max[2]));
          let ox = p.x - cx, oz = p.z - cz;
          const d2 = ox * ox + oz * oz;
          if (d2 >= r * r) continue;
          if (d2 < 1e-10) { // centre inside the box: push out the shortest way
            const pens = [p.x - b.min[0], b.max[0] - p.x, p.z - b.min[2], b.max[2] - p.z];
            const m = pens.indexOf(Math.min(...pens));
            if (m === 0) p.x = b.min[0] - r; else if (m === 1) p.x = b.max[0] + r;
            else if (m === 2) p.z = b.min[2] - r; else p.z = b.max[2] + r;
          } else {
            const d = Math.sqrt(d2), push = r - d;
            p.x += ox / d * push; p.z += oz / d * push;
          }
          moved = true;
        }
        if (!moved) break;
      }
      for (const d of this.dynamic) if (p.x > d.x0 - r && p.x < d.x1 + r && p.z > d.z0 - r && p.z < d.z1 + r) d.slide?.(p, r, h, step);
    }
  }

  /** Is there something solid between two bodies standing at a and b, at height y above their feet?
   * (a blow, a grab or a pounce can't land through a wall or a window pane) */
  between(a, b, y = 1.1) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dy, dz);
    if (l < 0.3) return false;
    const hit = this.ray([a.x, a.y + y, a.z], [dx / l, dy / l, dz / l], l);
    return !!(hit && hit.t < l - 0.3);
  }

  /** Lowest ceiling above a cylinder standing at p (for jumps and low passages). */
  ceilingAt(x, z, y, r) {
    let best = Infinity;
    for (const b of this.near(x - r, z - r, x + r, z + r))
      if (b.min[1] >= y && b.min[1] < best && (b.seg ? segDist(b, x, z) < r * 0.7 + b.half : circleBox(x, z, r * 0.7, b))) best = b.min[1];
    return best;
  }

  /** First hit of a ray (origin o, unit direction d) within `far`: {t, box, normal} or null.
   * The outdoor ground counts too. `see`: a line of sight, which passes through glass (a box with
   * `see` set: the houses' window panes). */
  ray(o, d, far, see = false) {
    let best = null;
    const steps = Math.ceil(far / (CELL * 0.5));
    const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(far, s * CELL * 0.5);
      const x = o[0] + d[0] * t, z = o[2] + d[2] * t;
      for (const b of this.near(x - CELL * 0.5, z - CELL * 0.5, x + CELL * 0.5, z + CELL * 0.5)) {
        if (seen.has(b)) continue;
        seen.add(b);
        if (see && b.see) continue;
        const hit = b.seg ? raySeg(o, d, b) : rayBox(o, d, b);
        if (hit && hit.t <= far && (!best || hit.t < best.t)) best = { ...hit, box: b };
      }
      if (best && best.t < t - CELL) break;
    }
    if (this.terrain && o[1] > this.groundAt(o[0], o[2]) - 0.5) { // march the terrain, then refine the crossing
      const lim = best ? best.t : far, step = 0.6;
      let prev = 0;
      for (let t = step; t <= lim + step; t += step) {
        const tt = Math.min(t, lim), x = o[0] + d[0] * tt, y = o[1] + d[1] * tt, z = o[2] + d[2] * tt;
        if (this.hasGround(x, z) && y < this.groundAt(x, z)) {
          let a = prev, c = tt;
          for (let i = 0; i < 8; i++) { const m = (a + c) / 2; const yy = o[1] + d[1] * m; if (yy < this.groundAt(o[0] + d[0] * m, o[2] + d[2] * m)) c = m; else a = m; }
          const hx = o[0] + d[0] * c, hz = o[2] + d[2] * c, e = 0.3;
          const nx = this.groundAt(hx - e, hz) - this.groundAt(hx + e, hz), nz = this.groundAt(hx, hz - e) - this.groundAt(hx, hz + e);
          const l = Math.hypot(nx, 2 * e, nz);
          return { t: c, normal: [nx / l, 2 * e / l, nz / l], box: null };
        }
        prev = tt;
        if (tt >= lim) break;
      }
      return best;
    }
    if (this.terrain) return best;
    if (d[1] < -1e-6 && o[1] > this.ground) {
      const t = (this.ground - o[1]) / d[1];
      const gx = o[0] + d[0] * t, gz = o[2] + d[2] * t;
      if (t <= far && (!best || t < best.t) && this.hasGround(gx, gz)) best = { t, normal: [0, 1, 0], box: null };
    }
    return best;
  }
}

function circleBox(x, z, r, b) {
  const cx = Math.max(b.min[0], Math.min(x, b.max[0])), cz = Math.max(b.min[2], Math.min(z, b.max[2]));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

/** How far (x, z) is from a segment wall's middle line. */
function segDist(s, x, z) {
  const t = Math.max(0, Math.min(s.len, (x - s.ax) * s.ux + (z - s.az) * s.uz));
  return Math.hypot(x - s.ax - s.ux * t, z - s.az - s.uz * t);
}

/** A ray against a segment wall: the slab test in the wall's own frame (along it, up, across it). */
function raySeg(o, d, s) {
  const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2, nx = -s.uz, nz = s.ux;
  const ox = o[0] - mx, oz = o[2] - mz;
  const lo = [ox * s.ux + oz * s.uz, o[1], ox * nx + oz * nz], ld = [d[0] * s.ux + d[2] * s.uz, d[1], d[0] * nx + d[2] * nz];
  const lb = { min: [-s.len / 2, s.min[1], -s.half], max: [s.len / 2, s.max[1], s.half] };
  const hit = rayBox(lo, ld, lb);
  if (!hit) return null;
  const [a, y, c] = hit.normal;   // back to the world
  hit.normal = [a * s.ux + c * nx, y, a * s.uz + c * nz];
  return hit;
}

function rayBox(o, d, b) {
  let t0 = -Infinity, t1 = Infinity, axis = 0, sign = 1;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < b.min[a] || o[a] > b.max[a]) return null;
      continue;
    }
    let ta = (b.min[a] - o[a]) / d[a], tb = (b.max[a] - o[a]) / d[a];
    let s = -1;
    if (ta > tb) { [ta, tb] = [tb, ta]; s = 1; }
    if (ta > t0) { t0 = ta; axis = a; sign = s; }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  if (t1 < 0) return null;
  const n = [0, 0, 0];
  n[axis] = sign;
  return { t: Math.max(t0, 0), normal: n };
}
