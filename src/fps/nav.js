// Finding the way. A monster that can't walk straight at what it's after (you, where it last saw
// you, where it means to wander) plans a path over the collision world and follows it: out of a
// house by its door (opening the door when it gets there), round a wall to its gate, down a stair
// and out. Never through a wall, a pane or a thing standing on the floor.
//  - The plan is A* on a 0.4 m grid, in 2.5D: each step stands on the floor it can reach from the
//    last (up a stair, down a stair, never off a drop) and is clear of everything solid between
//    that floor (less what it can step over) and its head.
//  - A shut door counts as open for the plan; one on the way is opened when the walker reaches it.
//  - The straight way is checked first (a few times a second): only a walker that can't go straight
//    plans, at most one plan a frame between them all, and the plan is followed with a look ahead
//    (it cuts the corners it can see past). The walker's own steering (physics.wayRound) still
//    takes it round what's close, and physics.slide still keeps it out of everything solid.
// Steer with nav.steer(walker, target, {r, h, step}): it gives back the point to head for now.
import * as THREE from 'three';

const C = 0.4;            // the grid (m)
const BUDGET = 4500;      // nodes a plan may open
const MS = 6;             // and the time it may take (it goes as far as it got)
const DROP = 1.0;         // the furthest down one step of a path may go
const LINE = 24;          // how far the straight way is checked ahead
const BUCKET = 2;         // the boxes gathered for a plan, sorted into squares this size
const PAD = 0.6;          // (the widest walker these squares answer for)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Nav {
  constructor(physics, doors = null) {
    this.phys = physics; this.doors = doors;
    this.time = 0;
    this.left = 1;                          // plans left this frame
    this.stats = { plans: 0, found: 0, partial: 0, failed: 0, ms: 0, opened: 0, doors: 0 };
  }

  /** Once a frame. */
  frame(dt) { this.time += dt; this.left = 1; }

  /** The point a walker (anything with .pos) should head for to reach `target`: the target itself
   * when the way is straight, else the next corner of its path. r, h, step: its body. */
  steer(w, target, { r = 0.35, h = 1.6, step = 0.45 } = {}) {
    if (!target) return target;
    const p = w.pos, t = this.time;
    const s = w.navState ??= { path: null, i: 0, goal: new THREE.Vector3(), from: new THREE.Vector3(), at: 0, checkT: 0, retryT: 0, skipT: 0, direct: true, way: new THREE.Vector3() };
    const rr = Math.min(r, 0.45) * 0.9;
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    if (d < 1.0 && Math.abs(target.y - p.y) < 1.2) { s.path = null; s.direct = true; return target; }
    // following a path: drop it once what it's after has moved on, it's gone stale, or the walker has
    // been carried off it (knocked, shoved)
    if (s.path && (Math.hypot(s.goal.x - target.x, s.goal.z - target.z) > Math.max(2, d * 0.3) || t - s.at > 5)) s.path = null;
    if (s.path) {
      let q = s.path[s.i];
      while (s.i < s.path.length - 1 && Math.hypot(q.x - p.x, q.z - p.z) < 0.5 && Math.abs(q.y - p.y) < 1.3) q = s.path[++s.i];
      const far = Math.hypot(q.x - p.x, q.z - p.z), a = s.i ? s.path[s.i - 1] : s.from;
      if (offLine(p, a, q) > 2.5 || (s.i === s.path.length - 1 && far < 0.5)) {
        // (at the end of a path that only got as near as it could: straight on a while before planning again)
        if (s.path.partial && far < 0.5) s.retryT = t + 1.2;
        s.path = null; s.checkT = 0;
      }
      else {
        // cut the corner when the next one is in a straight line from here
        if (t > s.skipT && s.i < s.path.length - 1) {
          s.skipT = t + 0.35;
          if (this.line(p, s.path[s.i + 1], rr, h, step)) s.i++;
        }
        q = s.path[s.i];
        this.openDoors(p, q);
        return s.way.copy(q);
      }
    }
    // no path: go straight while the straight way is open (checked a few times a second)
    if (t >= s.checkT) {
      s.checkT = t + 0.3 + Math.random() * 0.2;
      s.direct = this.line(p, target, rr, h, step);
    }
    if (s.direct) { this.openDoors(p, target); return target; }
    // shut off: plan a way (one a frame between them all; one that found none waits a while)
    if (t < s.retryT || this.left <= 0) return target;
    this.left--;
    const path = this.plan(p, target, rr, h, step);
    if (!path) { s.retryT = t + 1.5; return target; }
    s.path = path; s.i = 0; s.at = t; s.skipT = 0; s.goal.copy(target); s.from.copy(p);
    this.openDoors(p, path[0]);
    return s.way.copy(path[0]);
  }

  /** Forget a walker's path (it was moved: a blink, a respawn). */
  forget(w) { if (w.navState) { w.navState.path = null; w.navState.checkT = 0; w.navState.retryT = 0; } }

  /** Can a walker go straight from p to q (the first LINE metres of the way)? Each step stands on
   * the floor it reaches from the last, clear of everything solid; shut doors count as open. */
  line(p, q, r, h, step) {
    const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz);
    if (len < 0.05) return Math.abs(q.y - p.y) < 1.3;
    const L = Math.min(len, LINE), ex = p.x + dx / len * L, ez = p.z + dz / len * L;
    const F = this.field(Math.min(p.x, ex) - 1, Math.min(p.z, ez) - 1, Math.max(p.x, ex) + 1, Math.max(p.z, ez) + 1);
    return F.line(p.x, p.y, p.z, ex, ez, r, h, step, len <= LINE ? q.y : null);
  }

  /** The boxes in an area (shut doors left out), sorted into squares. */
  field(x0, z0, x1, z1) {
    const list = [];
    for (const b of this.phys.near(x0, z0, x1, z1)) if (b.tag !== 'door') list.push(b);
    return new Field(this.phys, list, x0, z0, x1, z1);
  }

  /** A path (points, the target's last) from p toward `target`, or null. Where the target can't be
   * reached within the plan's budget or area, the path goes as near it as the plan got (when that's
   * nearer than the walker is: out of the house it's shut in, say). */
  plan(p, target, r, h, step) {
    const t0 = performance.now(), st = this.stats;
    st.plans++;
    // the area it looks in: 24 m all round the walker (the way out of a house may lead away from
    // what it's after: out of the front door and round to the back), and 12 m round the target, but
    // never more than 40 m from the walker (the budget, not the area, bounds the work)
    const A = 24, M = 12, S = 40;
    const x0 = Math.max(p.x - S, Math.min(p.x - A, target.x - M)), x1 = Math.min(p.x + S, Math.max(p.x + A, target.x + M));
    const z0 = Math.max(p.z - S, Math.min(p.z - A, target.z - M)), z1 = Math.min(p.z + S, Math.max(p.z + A, target.z + M));
    const F = this.field(x0 - 1, z0 - 1, x1 + 1, z1 + 1);
    const nx = Math.ceil((x1 - x0) / C), nz = Math.ceil((z1 - z0) / C);
    const X = (i) => x0 + (i + 0.5) * C, Z = (k) => z0 + (k + 0.5) * C;
    const yq = (y) => Math.max(0, Math.min(4095, Math.round(y * 8) + 2048));   // (an eighth of a metre a layer)
    const KEY = 4096;
    const si = Math.max(0, Math.min(nx - 1, Math.floor((p.x - x0) / C))), sk = Math.max(0, Math.min(nz - 1, Math.floor((p.z - z0) / C)));
    const tx = target.x, tz = target.z, ty = target.y;
    const hOf = (x, z, y) => Math.hypot(tx - x, tz - z) + Math.abs(ty - y) * 0.5;
    const start = (sk * nx + si) * KEY + yq(p.y);
    const g = new Map([[start, 0]]), from = new Map(), ys = new Map([[start, p.y]]), closed = new Set();
    const heap = new Heap();
    heap.push(start, hOf(X(si), Z(sk), p.y) * 1.25);
    let best = start, bestH = hOf(p.x, p.z, p.y), found = 0, opened = 0;
    const h0 = bestH;
    while (heap.size && opened < BUDGET) {
      if ((opened & 127) === 127 && performance.now() - t0 > MS) break;
      const cur = heap.pop();
      if (closed.has(cur)) continue;
      closed.add(cur);
      opened++;
      const cell = Math.floor(cur / KEY), i = cell % nx, k = (cell - i) / nx, y = ys.get(cur), x = X(i), z = Z(k);
      const hh = hOf(x, z, y);
      if (hh < bestH) { bestH = hh; best = cur; }
      if (Math.hypot(tx - x, tz - z) < 1.0 && Math.abs(ty - y) < 1.2) { found = cur; break; }   // (within reach of it)
      const gc = g.get(cur);
      for (const [di, dk] of DIRS) {
        const ni = i + di, nk = k + dk;
        if (ni < 0 || nk < 0 || ni >= nx || nk >= nz) continue;
        const px = X(ni), pz = Z(nk);
        const fy = F.floor(px, pz, y, r, step);
        if (fy === -Infinity || fy < y - DROP || !F.open(px, pz, fy, r, h, step)) continue;
        const diag = di && dk;
        if (diag && !F.open(x + di * C / 2, z + dk * C / 2, Math.max(fy, y), r, h, step)) continue;   // (no cutting a corner)
        const key = (nk * nx + ni) * KEY + yq(fy);
        if (closed.has(key)) continue;
        const ng = gc + (diag ? 1.4142 : 1) * C + Math.max(0, fy - y) * 0.6;
        if (ng < (g.get(key) ?? Infinity)) {
          g.set(key, ng); from.set(key, cur); ys.set(key, fy);
          heap.push(key, ng + hOf(px, pz, fy) * 1.25);
        }
      }
    }
    st.opened += opened;
    let end = found;
    if (!end && bestH < h0 - 1.5 && best !== start) { end = best; st.partial++; }
    if (!end) { st.failed++; st.ms += performance.now() - t0; return null; }
    if (found) st.found++;
    const pts = [];
    for (let c = end; c !== undefined && c !== start; c = from.get(c)) {
      const cell = Math.floor(c / KEY), i = cell % nx, k = (cell - i) / nx;
      pts.push(new THREE.Vector3(X(i), ys.get(c), Z(k)));
    }
    pts.reverse();
    if (found && pts.length) pts[pts.length - 1].set(tx, ty, tz);
    // pulled taut: from each point on, straight to the furthest point (a few dozen ahead) it can see
    const out = [];
    let a = { x: p.x, y: p.y, z: p.z }, j = -1;
    while (j < pts.length - 1) {
      let k = Math.min(pts.length - 1, j + 40);
      while (k > j + 1 && !F.line(a.x, a.y, a.z, pts[k].x, pts[k].z, r, h, step, pts[k].y)) k--;
      out.push(pts[k]); a = pts[k]; j = k;
    }
    st.ms += performance.now() - t0;
    if (!out.length) return null;
    out.partial = !found;
    return out;
  }

  /** A shut door across the way from p toward q, near enough to reach: it opens it. */
  openDoors(p, q) {
    const list = this.doors?.list;
    if (!list) return;
    const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz);
    if (len < 1e-3) return;
    const L = Math.min(len, 1.6), ux = dx / len, uz = dz / len;
    for (const door of list) {
      if (door.open || !door.center) continue;
      const c = door.center;
      if (Math.abs(c.x - p.x) > 3 || Math.abs(c.z - p.z) > 3 || c.y < p.y - 0.5 || c.y > p.y + 2.5) continue;
      for (const b of door.boxes) {
        if (b.off) continue;
        if (segBox(p.x, p.z, p.x + ux * L, p.z + uz * L, b.min[0] - 0.4, b.min[2] - 0.4, b.max[0] + 0.4, b.max[2] + 0.4)) {
          this.doors.toggle(door);
          this.stats.doors++;
          return;
        }
      }
    }
  }
}

/** The boxes of an area, sorted into BUCKET squares (each box in every square it comes within PAD of,
 * so one square answers for a walker standing in it). */
class Field {
  constructor(phys, list, x0, z0, x1, z1) {
    this.phys = phys; this.x0 = x0; this.z0 = z0;
    this.nx = Math.max(1, Math.ceil((x1 - x0) / BUCKET)); this.nz = Math.max(1, Math.ceil((z1 - z0) / BUCKET));
    this.cells = new Array(this.nx * this.nz);
    for (const b of list) {
      const i0 = Math.max(0, Math.floor((b.min[0] - PAD - x0) / BUCKET)), i1 = Math.min(this.nx - 1, Math.floor((b.max[0] + PAD - x0) / BUCKET));
      const k0 = Math.max(0, Math.floor((b.min[2] - PAD - z0) / BUCKET)), k1 = Math.min(this.nz - 1, Math.floor((b.max[2] + PAD - z0) / BUCKET));
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) (this.cells[k * this.nx + i] ||= []).push(b);
    }
    this.dyn = phys.dynamic.filter((d) => d.x1 > x0 - 1 && d.x0 < x1 + 1 && d.z1 > z0 - 1 && d.z0 < z1 + 1);
    this.g = new Map();   // the outdoor ground's height (NaN: none), by 5 cm
  }

  ground(x, z) {
    const k = Math.round(x * 20) * 1048576 + Math.round(z * 20);
    let g = this.g.get(k);
    if (g === undefined) { g = this.phys.hasGround(x, z) ? this.phys.groundAt(x, z) : NaN; this.g.set(k, g); }
    return g;
  }

  at(x, z) {
    const i = Math.floor((x - this.x0) / BUCKET), k = Math.floor((z - this.z0) / BUCKET);
    if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) return NONE;
    return this.cells[k * this.nx + i] || NONE;
  }

  /** The highest floor under (x, z) a walker with its feet at y can step onto (physics.floorAt's rule). */
  floor(x, z, y, r, step) {
    let best = -Infinity;
    const g = this.ground(x, z);
    if (g <= y + step) best = g;   // (NaN: no ground here, fails)
    for (const b of this.at(x, z)) {
      if (b.max[1] > y + step || b.max[1] < best) continue;
      if (b.seg ? segDist(b, x, z) < r * 0.7 + b.half : circleBox(x, z, r * 0.7, b)) best = b.max[1];
    }
    for (const d of this.dyn) {
      if (x < d.x0 - r || x > d.x1 + r || z < d.z0 - r || z > d.z1 + r) continue;
      const f = d.floorAt(x, z, y, r, step);
      if (f > best && f <= y + step) best = f;
    }
    return best;
  }

  /** Is a walker standing at (x, z) on floor fy clear of everything solid? */
  open(x, z, fy, r, h, step) {
    for (const b of this.at(x, z)) {
      if (b.max[1] <= fy + step || b.min[1] >= fy + h) continue;
      if (b.seg ? segDist(b, x, z) < r + b.half : circleBox(x, z, r, b)) return false;
    }
    return true;
  }

  /** Can it walk straight from (x, y, z) to (ex, ez)? (ending at height ey, when given) */
  line(x, y, z, ex, ez, r, h, step, ey = null) {
    const dx = ex - x, dz = ez - z, len = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(len / 0.25));
    for (let s = 1; s <= n; s++) {
      const f = s / n, px = x + dx * f, pz = z + dz * f;
      const fy = this.floor(px, pz, y, r, step);
      if (fy === -Infinity || fy < y - DROP || !this.open(px, pz, fy, r, h, step)) return false;
      y = fy;
    }
    return ey === null || Math.abs(ey - y) < 1.3;
  }
}

const NONE = [];

/** How far p is (across the ground) from the segment a-b. */
function offLine(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}

function circleBox(x, z, r, b) {
  const cx = Math.max(b.min[0], Math.min(x, b.max[0])), cz = Math.max(b.min[2], Math.min(z, b.max[2]));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

function segDist(s, x, z) {
  const t = Math.max(0, Math.min(s.len, (x - s.ax) * s.ux + (z - s.az) * s.uz));
  return Math.hypot(x - s.ax - s.ux * t, z - s.az - s.uz * t);
}

/** Does the segment (ax, az)-(bx, bz) cross the rectangle? */
function segBox(ax, az, bx, bz, x0, z0, x1, z1) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

/** A binary min-heap of keys by priority. */
class Heap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const K = this.k, P = this.p;
    let i = K.length;
    K.push(key); P.push(pri);
    while (i > 0) {
      const u = (i - 1) >> 1;
      if (P[u] <= pri) break;
      K[i] = K[u]; P[i] = P[u]; i = u;
    }
    K[i] = key; P[i] = pri;
  }
  pop() {
    const K = this.k, P = this.p, top = K[0], lk = K.pop(), lp = P.pop();
    const n = K.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && P[c + 1] < P[c]) c++;
        if (P[c] >= lp) break;
        K[i] = K[c]; P[i] = P[c]; i = c;
      }
      K[i] = lk; P[i] = lp;
    }
    return top;
  }
}
