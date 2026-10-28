// Collision world: axis-aligned boxes in a spatial hash. The player is an upright cylinder
// that slides along walls, steps up onto stairs and kerbs, and stands on the highest surface
// below it (box tops, or the outdoor ground at y = 0 while above it).

const CELL = 8;
const key = (i, k) => i * 73856093 ^ k * 19349663;

export class Physics {
  constructor() {
    this.boxes = [];
    this.grid = new Map();
    this.ground = 0;       // the outdoor ground height
    this.groundHoles = []; // [x0, z0, x1, z1]: no outdoor ground here (stairwells)
  }

  add(min, max, tag = 'solid') {
    const b = { min: [...min], max: [...max], tag };
    this.boxes.push(b);
    const i0 = Math.floor(b.min[0] / CELL), i1 = Math.floor(b.max[0] / CELL);
    const k0 = Math.floor(b.min[2] / CELL), k1 = Math.floor(b.max[2] / CELL);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      const h = key(i, k);
      if (!this.grid.has(h)) this.grid.set(h, []);
      this.grid.get(h).push(b);
    }
    return b;
  }

  near(x0, z0, x1, z1) {
    const out = new Set();
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++) {
        const c = this.grid.get(key(i, k));
        if (c) for (const b of c) out.add(b);
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
    if (this.hasGround(x, z) && this.ground <= y + step) best = this.ground;
    for (const b of this.near(x - r, z - r, x + r, z + r)) {
      if (b.max[1] > y + step || b.max[1] < best) continue;
      if (circleBox(x, z, r * 0.7, b)) best = b.max[1];
    }
    return best;
  }

  /** Move a cylinder (feet at p.y, height h, radius r) by (dx, dz), sliding along walls and
   * stepping up onto anything no taller than `step`. Mutates p. */
  slide(p, dx, dz, r, h, step) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.5)));
    for (let s = 0; s < n; s++) {
      p.x += dx / n; p.z += dz / n;
      for (let it = 0; it < 3; it++) {
        let moved = false;
        for (const b of this.near(p.x - r, p.z - r, p.x + r, p.z + r)) {
          if (b.max[1] <= p.y + step || b.min[1] >= p.y + h) continue; // stepped onto / overhead
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
    }
  }

  /** Lowest ceiling above a cylinder standing at p (for jumps and low passages). */
  ceilingAt(x, z, y, r) {
    let best = Infinity;
    for (const b of this.near(x - r, z - r, x + r, z + r))
      if (b.min[1] >= y && b.min[1] < best && circleBox(x, z, r * 0.7, b)) best = b.min[1];
    return best;
  }

  /** First hit of a ray (origin o, unit direction d) within `far`: {t, box, normal} or null.
   * The outdoor ground counts too. */
  ray(o, d, far) {
    let best = null;
    const steps = Math.ceil(far / (CELL * 0.5));
    const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(far, s * CELL * 0.5);
      const x = o[0] + d[0] * t, z = o[2] + d[2] * t;
      for (const b of this.near(x - CELL * 0.5, z - CELL * 0.5, x + CELL * 0.5, z + CELL * 0.5)) {
        if (seen.has(b)) continue;
        seen.add(b);
        const hit = rayBox(o, d, b);
        if (hit && hit.t <= far && (!best || hit.t < best.t)) best = { ...hit, box: b };
      }
      if (best && best.t < t - CELL) break;
    }
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
