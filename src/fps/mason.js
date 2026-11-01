// The mason: a kit for building underground architecture that isn't boxes (see
// docs/DUNGEON_BUILDING.md). Rooms are polygons of any shape (rotundas, octagons, apses,
// chamfered halls) with domed or vaulted roofs; passages are polylines of any angle with a barrel
// vault over them, flat runs and straight flights of stairs, joined to the rooms through arched
// openings with a ring of stone round them. Features (a monument's tiers, a spiral stair, a sunken
// floor) are height functions laid into a room.
//
// Everything walkable is painted into one quarter-metre raster of floor heights (the top of the
// stone under you, and how far down the stone goes): the physics floors are that raster merged into
// boxes, the walls are segment walls along the faces (physics.addSeg), and the dead's walkable grid
// (one metre cells, with their heights so they don't walk off a monument's tier) comes from it too.
// Geometry goes through the Builder, so it is merged per material and chunk like the rest.
import * as THREE from 'three';

// (a cell at a drop's lip used to come off the dead's map; it stays now, and the flow search
// (zombies.js) keeps to steps it can climb, so open-sided stairs and pits stay reachable)
const LIPS = false;
const G = 0.25;                   // the raster's step (metres)
const SKIRT = 0.6;                // floors run on this far under the walls
const ARCH_N = 12;                // segments in a half-circle

/** A regular n-gon round (x, z), radius r, its first corner at angle a0 (radians, from +x toward +z). */
export function ring(x, z, r, n, a0 = 0) {
  return Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * Math.PI * 2; return [x + Math.cos(a) * r, z + Math.sin(a) * r]; });
}

/** An elongated octagon: a w x d rectangle round (x, z) with its corners cut back by c. */
export function chamfered(x, z, w, d, c) {
  const a = w / 2, b = d / 2;
  return [[x - a + c, z - b], [x + a - c, z - b], [x + a, z - b + c], [x + a, z + b - c], [x + a - c, z + b], [x - a + c, z + b], [x - a, z + b - c], [x - a, z - b + c]];
}

const area = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length]; s += ax * bz - bx * az; } return s / 2; };
function inPoly(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function segD(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
function polyD(poly, x, z) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length]; d = Math.min(d, segD(x, z, ax, az, bx, bz)); }
  return d;
}

export class Mason {
  /** bounds: the raster's extent {x0, z0, x1, z1} (whole metres). */
  constructor(ctx, bounds) {
    this.ctx = ctx; this.b = ctx.b; this.lib = ctx.lib; this.phys = ctx.physics;
    this.x0 = bounds.x0; this.z0 = bounds.z0;
    this.nx = Math.ceil((bounds.x1 - bounds.x0) / G); this.nz = Math.ceil((bounds.z1 - bounds.z0) / G);
    const N = this.nx * this.nz;
    this.top = new Float32Array(N).fill(NaN);     // the floor's top here (NaN: rock)
    this.base = new Float32Array(N);              // how far down the stone under it goes
    this.prio = new Int8Array(N);                 // which painting won (higher wins)
    this.owner = new Int16Array(N).fill(-1);      // the space it belongs to
    this.solid = new Uint8Array(N);               // 1: gets a physics floor (0: only the dead's map)
    this.spaces = [];
    this.mats = new Map();
  }

  mat(id, tile = 2, o = {}) {
    // (volcanic rock's lava cracks glow, wherever it's laid, and its relief is kept low)
    if (/volcanic_shrine/.test(id)) o = { cracks: 1.5, bump: 0.35, ...o };
    const k = id + '|' + tile + '|' + JSON.stringify(o);
    if (!this.mats.has(k)) this.mats.set(k, this.lib.material(id, { tile, ...o }));
    return this.mats.get(k);
  }

  /** How much to stretch a face's u (metres along it) so a whole number of the material's repeats
   * fits its length L exactly: a carved panel (a cross, an arch) is never cut at a corner. */
  fit(mat, L) {
    const tu = mat?.userData?.tileU || 1, k = Math.max(1, Math.round(L / tu));
    return L > 1e-3 ? k * tu / L : 1;
  }

  // ------------------------------------------------------------------ the raster
  idx(x, z) {
    const i = Math.floor((x - this.x0) / G), k = Math.floor((z - this.z0) / G);
    return i < 0 || k < 0 || i >= this.nx || k >= this.nz ? -1 : k * this.nx + i;
  }

  /** Lay heights over a rectangle: fn(x, z) -> null or [top, base, prio]; the higher prio wins. */
  paint(space, x0, z0, x1, z1, fn, solid = true) {
    const i0 = Math.max(0, Math.floor((x0 - this.x0) / G)), i1 = Math.min(this.nx - 1, Math.ceil((x1 - this.x0) / G));
    const k0 = Math.max(0, Math.floor((z0 - this.z0) / G)), k1 = Math.min(this.nz - 1, Math.ceil((z1 - this.z0) / G));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const x = this.x0 + (i + 0.5) * G, z = this.z0 + (k + 0.5) * G, r = fn(x, z);
      if (!r) continue;
      const j = k * this.nx + i;
      if (r[2] < this.prio[j]) continue;
      this.top[j] = r[0]; this.base[j] = r[1]; this.prio[j] = r[2]; this.owner[j] = space.id; this.solid[j] = solid ? 1 : 0;
    }
  }

  /** The floor's top at (x, z) as painted (null in the rock). */
  floorAt(x, z) { const j = this.idx(x, z); return j < 0 || Number.isNaN(this.top[j]) ? null : this.top[j]; }
  spaceAt(x, z) { const j = this.idx(x, z); return j < 0 || this.owner[j] < 0 ? null : this.spaces[this.owner[j]]; }

  // ------------------------------------------------------------------ spaces
  /** A room: {name, poly, y (floor), wallH (the wall's height to the spring of the roof), roof:
   * {kind: 'dome' | 'flat', rise, spine: [[x, z], [x, z]] (a dome drawn to a ridge, for long halls)},
   * mats: {floor, wall, roof, trim}, torches (metres apart round the wall, 0 for none)}. */
  room(o) {
    const s = { type: 'room', id: this.spaces.length, openings: [], features: [], torches: 6, ...o };
    if (area(s.poly) < 0) s.poly = [...s.poly].reverse();          // counter-clockwise (x, z): the inside on the left
    s.cx = s.poly.reduce((a, p) => a + p[0], 0) / s.poly.length; s.cz = s.poly.reduce((a, p) => a + p[1], 0) / s.poly.length;
    this.spaces.push(s);
    return s;
  }

  /** A passage: {name, pts: [[x, z, y], ...] (a change of y between two points is a flight of
   * stairs, 0.25 m a step), w, spring (wall height to the vault), from, to (rooms it opens into),
   * mats: {floor, wall, roof, trim, step}, ribs (metres between the vault's ribs, 0 for none),
   * torches (metres apart, 0 for none)}. */
  passage(o) {
    const s = { type: 'passage', id: this.spaces.length, ribs: 4.5, torches: 6, ...o };
    this.spaces.push(s);
    for (const [end, room, base] of [[0, s.from, s.fromBase], [s.pts.length - 1, s.to, s.toBase]]) if (room) this.openInto(room, s, s.pts[end], base || 0);
    return s;
  }

  /** Cut the opening a passage comes in by into the room's wall nearest its end. */
  openInto(room, pass, p, base = 0) {
    let best = null;
    room.poly.forEach((a, e) => {
      const b = room.poly[(e + 1) % room.poly.length], d = segD(p[0], p[1], a[0], a[1], b[0], b[1]);
      if (!best || d < best.d) best = { d, e, t: Math.hypot(p[0] - a[0], p[1] - a[1]) };
    });
    if (best.d > 0.3) console.warn(`${pass.name}: its end is ${best.d.toFixed(2)} m off ${room.name}'s wall`);
    room.openings.push({ e: best.e, t: best.t, w: pass.w, spring: pass.spring, base, pass });
  }

  /** A feature in a room: fn(x, z) -> null or a floor height (laid over the room's own), inside the
   * rectangle [x0, z0, x1, z1]; draw(mason) builds what you see. */
  feature(room, rect, fn, draw = null, base = null) { room.features.push({ rect, fn, draw, base }); }

  // ------------------------------------------------------------------ building
  build() {
    for (const s of this.spaces) {
      if (s.type === 'room') this.buildRoom(s); else if (s.type === 'passage') this.buildPassage(s);
    }
    this.colliders();
  }

  /** A face made of rows of points: rows[r][c] = [x, y, z], with uv rows (metres); `inward`: a
   * point the face looks toward (its triangles are wound to face it). Smooth-shaded. */
  sheet(mat, rows, uvs, toward, shade = 1) {
    const R = rows.length, C = rows[0].length, P = [], U = [], I = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { P.push(...rows[r][c]); U.push(...uvs[r][c]); }
    // which way do the triangles face? test the first good one against `toward`
    let flip = false;
    for (let r = 0; r + 1 < R && !flip; r++) {
      const a = rows[r][0], b = rows[r][Math.min(1, C - 1)], c = rows[r + 1][0];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const L = Math.hypot(...n);
      if (L < 1e-8) continue;
      const t = typeof toward === 'function' ? toward(a) : toward;
      flip = (n[0] * (t[0] - a[0]) + n[1] * (t[1] - a[1]) + n[2] * (t[2] - a[2])) < 0;
      break;
    }
    for (let r = 0; r + 1 < R; r++) for (let c = 0; c + 1 < C; c++) {
      const a = r * C + c, b = a + 1, d = a + C, e = d + 1;
      if (flip) I.push(a, d, b, b, d, e); else I.push(a, b, d, b, e, d);
    }
    this.b.smooth(mat, P, U, I, shade);
  }

  // ------------------------------------------------------------------ rooms
  buildRoom(s) {
    const { poly, y, wallH } = s, n = poly.length, m = s.mats;
    // a full-height wall panel is carved for a wall about 4 m high: in a taller room it runs to 4.5 m,
    // a cornice over it, and plain courses of stone (m.upper) above, at the same grain
    const PH = this.lib.surf.get(m.wall)?.wall_set && wallH > 5.5 ? 4.5 : wallH;
    const wall = this.mat(m.wall, m.wallTile ?? PH), trim = this.mat(m.trim || m.wall, 1.5), upper = PH < wallH ? this.mat(m.upper || 'castle_keep_pale_keep_limestone', 2.2) : wall;
    let per = 0;                                                     // metres round the wall so far
    const edges = poly.map((a, e) => {
      const b = poly[(e + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      const ed = { a, b, L, ux, uz, nx: -uz, nz: ux, per };          // n: the inside (left of a -> b)
      per += L;
      return ed;
    });
    s.edges = edges;
    for (let e = 0; e < n; e++) {
      const ed = edges[e], ops = s.openings.filter((o) => o.e === e).sort((p, q) => p.t - q.t);
      const at = (t, h) => [ed.a[0] + ed.ux * t, y + h, ed.a[1] + ed.uz * t];
      // (each wall face starts its own run of panels and holds a whole number of them)
      const su = this.fit(wall, ed.L), uv = (t, h) => [t * su, h];
      const inside = [s.cx, y + wallH / 2, s.cz];
      // solid stretches between the openings, full height; over each opening, the wall above its arch
      let t = 0;
      const solid = (t0, t1) => {
        if (t1 - t0 < 0.01) return;
        this.sheet(wall, [[at(t0, 0), at(t1, 0)], [at(t0, PH), at(t1, PH)]], [[uv(t0, 0), uv(t1, 0)], [uv(t0, PH), uv(t1, PH)]], inside, 0.85);
        if (PH < wallH) {
          this.sheet(upper, [[at(t0, PH), at(t1, PH)], [at(t0, wallH), at(t1, wallH)]], [[uv(t0, PH), uv(t1, PH)], [uv(t0, wallH), uv(t1, wallH)]], inside, 0.8);
          this.band(trim, [at(t0, PH), at(t1, PH)], 0.3, 0.16, inside);
        }
        if (!s.noPlinth) this.band(trim, [at(t0, 0.22), at(t1, 0.22)], 0.44, 0.1, inside);      // a plinth along its foot
        // its collider, half a metre thick behind the face (and a little past the corners)
        const ext0 = t0 === 0 ? -0.25 : 0.25, ext1 = t1 === ed.L ? 0.25 : -0.25;
        const p0 = [ed.a[0] + ed.ux * (t0 + ext0) - ed.nx * 0.25, ed.a[1] + ed.uz * (t0 + ext0) - ed.nz * 0.25];
        const p1 = [ed.a[0] + ed.ux * (t1 + ext1) - ed.nx * 0.25, ed.a[1] + ed.uz * (t1 + ext1) - ed.nz * 0.25];
        this.phys.addSeg(p0[0], p0[1], p1[0], p1[1], y - 1, y + wallH + 2, 0.5, 'wall');
      };
      for (const o of ops) {
        const r = o.w / 2, base = o.base || 0;
        solid(t, o.t - r);
        // the wall over the arch: strips from the curve up to the wall's top
        const rows = [[], []], uvs = [[], []];
        for (let k = 0; k <= ARCH_N; k++) {
          const th = Math.PI * (1 - k / ARCH_N), tt = o.t + Math.cos(th) * r, hh = base + o.spring + Math.sin(th) * r;
          rows[0].push(at(tt, hh)); rows[1].push(at(tt, wallH)); uvs[0].push(uv(tt, hh)); uvs[1].push(uv(tt, wallH));
        }
        this.sheet(PH < wallH ? upper : wall, rows, uvs, inside, 0.85);
        // an opening high in the wall (a tribune's): the wall under it, solid
        if (base > 0) {
          this.sheet(wall, [[at(o.t - r, 0), at(o.t + r, 0)], [at(o.t - r, Math.min(base, PH)), at(o.t + r, Math.min(base, PH))]], [[uv(o.t - r, 0), uv(o.t + r, 0)], [uv(o.t - r, Math.min(base, PH)), uv(o.t + r, Math.min(base, PH))]], inside, 0.85);
          if (base > PH) this.sheet(upper, [[at(o.t - r, PH), at(o.t + r, PH)], [at(o.t - r, base), at(o.t + r, base)]], [[uv(o.t - r, PH), uv(o.t + r, PH)], [uv(o.t - r, base), uv(o.t + r, base)]], inside, 0.8);
          const p0 = [ed.a[0] + ed.ux * (o.t - r) - ed.nx * 0.25, ed.a[1] + ed.uz * (o.t - r) - ed.nz * 0.25], p1 = [ed.a[0] + ed.ux * (o.t + r) - ed.nx * 0.25, ed.a[1] + ed.uz * (o.t + r) - ed.nz * 0.25];
          this.phys.addSeg(p0[0], p0[1], p1[0], p1[1], y - 1, y + base, 0.5, 'wall');
        }
        this.archRing(trim, at(o.t, base), [ed.ux, ed.uz], [ed.nx, ed.nz], r, o.spring, y + base);
        t = o.t + r;
      }
      solid(t, ed.L);
      // a pilaster at the corner it ends on, the roof's rib coming down onto it (none where an
      // opening runs up to the corner)
      if (!s.noPilasters && !s.openings.some((o) => (o.e === e && o.t + o.w / 2 > ed.L - 0.6) || (o.e === (e + 1) % n && o.t - o.w / 2 < 0.6)))
        this.band(trim, [at(ed.L, 0), at(ed.L, wallH)], 0.56, 0.22, inside);
      // a moulding where the wall meets the roof
      if (!s.noCornice) {
        const p0 = at(0, wallH), p1 = at(ed.L, wallH);
        this.sheet(trim, [[p0, p1], [[p0[0] + ed.nx * 0.25, p0[1] - 0.05, p0[2] + ed.nz * 0.25], [p1[0] + ed.nx * 0.25, p1[1] - 0.05, p1[2] + ed.nz * 0.25]]],
          [[uv(0, 0), uv(ed.L, 0)], [uv(0, 0.3), uv(ed.L, 0.3)]], [s.cx, y, s.cz], 0.7);
      }
    }
    // the floor (the room's polygon), and the roof over it
    if (!s.noFloor) this.flat(this.mat(m.floor, m.floorTile ?? 2.5), poly, y, true, 0.9);
    this.roof(s);
    // the raster: the room's floor, a skirt of it under the walls, then its features on top
    const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
    this.paint(s, Math.min(...xs) - SKIRT, Math.min(...zs) - SKIRT, Math.max(...xs) + SKIRT, Math.max(...zs) + SKIRT, (x, z) => {
      if (inPoly(poly, x, z)) return [y, y - 0.6, 2];
      if (polyD(poly, x, z) < SKIRT) return [y, y - 0.6, 1];
      return null;
    });
    for (const f of s.features) {
      const [x0, z0, x1, z1] = f.rect;
      this.paint(s, x0, z0, x1, z1, (x, z) => { const h = f.fn(x, z); return h == null ? null : [h, f.base ?? y - 0.6, 5]; });
      f.draw?.(this, s);
    }
    s.minY = y; s.maxY = y + wallH + (s.roof?.rise || 0);
  }

  /** The roof: a dome drawn from the top of every wall to the middle (or to a ridge, for a long
   * hall), or flat; ribs along some of its lines. */
  roof(s) {
    const { poly, y, wallH } = s, R = s.roof || { kind: 'dome', rise: 3 };
    const rm = this.mat(s.mats.roof, s.mats.roofTile ?? 3), top = y + wallH;
    if (R.kind === 'flat') { this.flat(rm, poly, top, false, 0.55); return; }
    const sp = R.spine || [[s.cx, s.cz], [s.cx, s.cz]], M = 10;
    // every corner (and points along each edge) is carried in to its nearest point on the ridge
    const target = (x, z) => {
      const [a, b] = sp, dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
      const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0;
      return [a[0] + dx * t, a[1] + dz * t];
    };
    const ribs = [];
    for (let e = 0; e < poly.length; e++) {
      const a = poly[e], b = poly[(e + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const cols = Math.max(2, Math.ceil(L / 1.5)), rows = [], uvs = [];
      for (let r = 0; r <= M; r++) {
        const f = r / M, c = Math.cos(f * Math.PI / 2), h = top + R.rise * Math.sin(f * Math.PI / 2), row = [], urow = [];
        for (let q = 0; q <= cols; q++) {
          const px = a[0] + (b[0] - a[0]) * q / cols, pz = a[1] + (b[1] - a[1]) * q / cols, [tx, tz] = target(px, pz);
          row.push([tx + (px - tx) * c, h, tz + (pz - tz) * c]);
          urow.push([(e * 7 + q / cols * L), f * R.rise * 1.6]);
        }
        rows.push(row); uvs.push(urow);
      }
      this.sheet(rm, rows, uvs, (p) => { const [tx, tz] = target(p[0], p[2]); return [tx, y + wallH * 0.3, tz]; }, 0.6);
      if (R.ribs !== false) ribs.push(a);
    }
    // ribs from the corners up to the ridge (a moulded band, proud of the vault)
    const trim = this.mat(s.mats.trim || s.mats.wall, 1.2);
    for (const a of ribs) {
      const [tx, tz] = target(a[0], a[1]), pts = [];
      for (let r = 0; r <= M; r++) { const f = r / M, c = Math.cos(f * Math.PI / 2); pts.push([tx + (a[0] - tx) * c, top + R.rise * Math.sin(f * Math.PI / 2), tz + (a[1] - tz) * c]); }
      this.band(trim, pts, 0.28, 0.16, [s.cx, y, s.cz]);
    }
  }

  /** A moulded band (a rib, an arch ring) along a polyline of points, `w` wide and standing `d`
   * proud toward `toward` (a point, or a function of the point). */
  band(mat, pts, w, d, toward) {
    const rows = [[], [], [], []], uvs = [[], [], [], []];
    let along = 0, s0 = null, n0 = null;
    pts.forEach((p, i) => {
      const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      const tx = q[0] - o[0], ty = q[1] - o[1], tz = q[2] - o[2], tl = Math.hypot(tx, ty, tz) || 1;
      const t = typeof toward === 'function' ? toward(p) : toward;
      let nx = t[0] - p[0], ny = t[1] - p[1], nz = t[2] - p[2];
      const dot = (nx * tx + ny * ty + nz * tz) / tl;                       // (square to the band's run)
      nx -= tx / tl * dot; ny -= ty / tl * dot; nz -= tz / tl * dot;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      // across the band: run x n
      let sx = ty * nz - tz * ny, sy = tz * nx - tx * nz, sz = tx * ny - ty * nx;
      const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
      if (!i) { s0 = [sx, sy, sz]; n0 = [nx, ny, nz]; }
      if (i) along += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
      const h = w / 2;
      rows[0].push([p[0] - sx * h, p[1] - sy * h, p[2] - sz * h]);
      rows[1].push([p[0] - sx * h + nx * d, p[1] - sy * h + ny * d, p[2] - sz * h + nz * d]);
      rows[2].push([p[0] + sx * h + nx * d, p[1] + sy * h + ny * d, p[2] + sz * h + nz * d]);
      rows[3].push([p[0] + sx * h, p[1] + sy * h, p[2] + sz * h]);
      for (let r = 0; r < 4; r++) uvs[r].push([along, [0, d, d + w, 2 * d + w][r]]);   // (true widths: no stretch)
    });
    const off = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k];
    this.sheet(mat, [rows[0], rows[1]], [uvs[0], uvs[1]], off(rows[0][0], s0, -1), 0.8);
    this.sheet(mat, [rows[1], rows[2]], [uvs[1], uvs[2]], off(rows[1][0], n0, 1), 0.95);
    this.sheet(mat, [rows[2], rows[3]], [uvs[2], uvs[3]], off(rows[3][0], s0, 1), 0.8);
  }

  /** A flat polygon at height y (a floor facing up, or a ceiling facing down). */
  flat(mat, poly, y, up = true, shade = 0.9) {
    const tris = THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), []);
    const P = [], U = [];
    for (let [a, b, c] of tris) {
      const A = poly[a], B = poly[b], C = poly[c];
      const ny = (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]);   // y of (B - A) x (C - A)
      if ((ny > 0) !== up) [b, c] = [c, b];
      for (const v of [a, b, c]) { P.push(poly[v][0], y, poly[v][1]); U.push(poly[v][0], -poly[v][1]); }
    }
    this.b.raw(mat, P, U, shade);
  }

  /** A ring of stone round an arched opening on a wall: up one jamb, over the arch, down the other.
   * foot: the opening's middle at the floor; u: along the wall; n: into the room. */
  archRing(mat, foot, u, n, r, spring, y) {
    const pts = [];
    const P = (t, h) => [foot[0] + u[0] * t + n[0] * 0.01, y + h, foot[2] + u[1] * t + n[1] * 0.01];
    const ro = r + 0.16;
    pts.push(P(-ro, 0));
    for (let k = 0; k <= ARCH_N; k++) { const th = Math.PI * (1 - k / ARCH_N); pts.push(P(Math.cos(th) * ro, spring + Math.sin(th) * ro)); }
    pts.push(P(ro, 0));
    this.band(mat, pts, 0.34, 0.2, (p) => [p[0] + n[0] * 3, p[1], p[2] + n[1] * 3]);
  }

  /** One run of a passage's wall with loculi cut in it, s.niches = {w, pier, depth, margin, tiers:
   * [[height of its shelf, its height], ...], back, shelf, inner (materials), fill(at, u, n, tier,
   * seg, sgn, j)}: bands of wall between the tiers and piers between the niches, each niche a recess
   * `depth` into the wall, dark at its back; fill is given the middle of each niche's shelf. The
   * piers (and the solid ends of the run) go in s.piers, for torches. */
  nicheWall(s, wall, p, q, y, lo, spring, a0, mid, seg, sgn) {
    const N = s.niches, dx = q[0] - p[0], dz = q[1] - p[1], Lw = Math.hypot(dx, dz), ux = dx / Lw, uz = dz / Lw;
    let nx = -uz, nz = ux;                                                       // (into the passage)
    if ((mid[0] - p[0]) * nx + (mid[2] - p[1]) * nz < 0) { nx = -nx; nz = -nz; }
    const pitch = N.w + N.pier, n = Math.max(0, Math.floor((Lw - 2 * N.margin + N.pier) / pitch));
    const t0 = (Lw - (n * pitch - N.pier)) / 2, holes = Array.from({ length: n }, (_, j) => [t0 + j * pitch, t0 + j * pitch + N.w]);
    const at = (t, h, dd = 0) => [p[0] + ux * t - nx * dd, y + h, p[1] + uz * t - nz * dd];
    const piece = (ta, tb, ha, hb) => {
      if (tb - ta < 0.005 || hb - ha < 0.005) return;
      this.sheet(wall, [[at(ta, ha), at(tb, ha)], [at(ta, hb), at(tb, hb)]], [[[a0 + ta, ha], [a0 + tb, ha]], [[a0 + ta, hb], [a0 + tb, hb]]], mid, 0.85);
    };
    let h = -lo;
    if (n) N.tiers.forEach(([th, hh], k) => {
      piece(0, Lw, h, th);
      let t = 0;
      for (const [a, b] of holes) { piece(t, a, th, th + hh); t = b; }
      piece(t, Lw, th, th + hh);
      holes.forEach(([a, b], j) => {
        const D = N.depth, c = [p[0] + ux * (a + b) / 2 - nx * D * 0.5, y + th + hh / 2, p[1] + uz * (a + b) / 2 - nz * D * 0.5];   // (inside it)
        const W = b - a;
        this.sheet(N.back, [[at(a, th, D), at(b, th, D)], [at(a, th + hh, D), at(b, th + hh, D)]], [[[0, 0], [W, 0]], [[0, hh], [W, hh]]], c, 0.35);
        this.sheet(N.shelf, [[at(a, th), at(b, th)], [at(a, th, D), at(b, th, D)]], [[[a0 + a, 0], [a0 + b, 0]], [[a0 + a, D], [a0 + b, D]]], [c[0], c[1] + 1, c[2]], 0.75);
        this.sheet(N.inner, [[at(a, th + hh), at(b, th + hh)], [at(a, th + hh, D), at(b, th + hh, D)]], [[[a0 + a, 0], [a0 + b, 0]], [[a0 + a, D], [a0 + b, D]]], [c[0], c[1] - 1, c[2]], 0.45);
        for (const e of [a, b]) this.sheet(N.inner, [[at(e, th), at(e, th, D)], [at(e, th + hh), at(e, th + hh, D)]], [[[0, th], [D, th]], [[0, th + hh], [D, th + hh]]], c, 0.5);
        N.fill?.(at((a + b) / 2, th, D / 2), [ux, uz], [nx, nz], k, seg, sgn, j);
      });
      h = th + hh;
    });
    piece(0, Lw, h, spring);
    const solid = n ? [[0, holes[0][0]], ...holes.slice(1).map(([a], j) => [holes[j][1], a]), [holes[n - 1][1], Lw]] : [[0, Lw]];
    s.piers ||= [];
    for (const [a, b] of solid) if (b - a >= 0.4) { const t = (a + b) / 2; s.piers.push({ x: p[0] + ux * t, z: p[1] + uz * t, nx, nz, along: a0 + t, sgn }); }
  }

  // ------------------------------------------------------------------ passages
  buildPassage(s) {
    const { pts, w, spring } = s, m = s.mats, r = w / 2;
    const wall = this.mat(m.wall, m.wallTile ?? spring), roofM = this.mat(m.roof, m.roofTile ?? 3);
    const floorM = this.mat(m.floor, m.floorTile ?? 2.5), stepM = this.mat(m.step || m.floor, 1.2), trim = this.mat(m.trim || m.wall, 1.2);
    const N = pts.length;
    // each point's mitre: the way across (to the left of the way along) and how far out the walls are
    const dir = [];
    for (let i = 0; i + 1 < N; i++) { const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], L = Math.hypot(dx, dz); dir.push([dx / L, dz / L, L]); }
    const mitre = pts.map((_, i) => {
      const a = dir[Math.max(0, i - 1)], b = dir[Math.min(dir.length - 1, i)];
      const na = [-a[1], a[0]], nb = [-b[1], b[0]];
      let mx = na[0] + nb[0], mz = na[1] + nb[1];
      const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
      const k = Math.min(2, 1 / Math.max(0.3, mx * na[0] + mz * na[1]));
      return [mx * k, mz * k];
    });
    const side = (i, sgn, out = 0) => [pts[i][0] + mitre[i][0] * (r + out) * sgn, pts[i][1] + mitre[i][1] * (r + out) * sgn];
    let along = 0;
    s.alongAt = [];
    for (let i = 0; i + 1 < N; i++) {
      const [ax, az, ay] = pts[i], [bx, bz, by] = pts[i + 1], L = dir[i][2], a0 = along;
      s.alongAt.push(a0);
      along += L;
      const stair = Math.abs(by - ay) > 0.01;
      const mid = [(ax + bx) / 2, (ay + by) / 2 + spring * 0.5, (az + bz) / 2];
      // the two walls: floor (the nosing line, tucked under the steps) to the spring of the vault
      for (const sgn of [1, -1]) {
        const p = side(i, sgn), q = side(i + 1, sgn), lo = stair ? 0.4 : 0.05;
        if (s.niches && !stair) this.nicheWall(s, wall, p, q, ay, lo, spring, a0, mid, i, sgn);
        else { const Lw = Math.hypot(q[0] - p[0], q[1] - p[1]), u1 = Lw * this.fit(wall, Lw);   // (whole panels on each run)
          this.sheet(wall, [[[p[0], ay - lo, p[1]], [q[0], by - lo, q[1]]], [[p[0], ay + spring, p[1]], [q[0], by + spring, q[1]]]],
            [[[0, -lo], [u1, -lo]], [[0, spring], [u1, spring]]], mid, 0.85); }
        const P0 = side(i, sgn, 0.25), P1 = side(i + 1, sgn, 0.25);
        this.phys.addSeg(P0[0], P0[1], P1[0], P1[1], Math.min(ay, by) - 1, Math.max(ay, by) + spring + r + 1, 0.5, 'wall');
      }
      // the vault: a half-circle carried along, cross-section by cross-section
      const rows = [], uvs = [];
      for (let k = 0; k <= ARCH_N; k++) {
        const ph = Math.PI * k / ARCH_N, c = Math.cos(ph), sn = Math.sin(ph);
        const p = [ax + mitre[i][0] * r * c, ay + spring + r * sn, az + mitre[i][1] * r * c];
        const q = [bx + mitre[i + 1][0] * r * c, by + spring + r * sn, bz + mitre[i + 1][1] * r * c];
        rows.push([p, q]); uvs.push([[r * ph, a0], [r * ph, a0 + L]]);
      }
      this.sheet(roofM, rows, uvs, [mid[0], Math.min(ay, by) + spring * 0.3, mid[2]], 0.6);
      // ribs across the vault, each on a pair of pilasters, every so often (not on a flight)
      if (s.ribs) {
        for (let d = (a0 ? s.ribs - (a0 % s.ribs) : s.ribs * 0.6); d < L - 0.8; d += s.ribs) {
          const f = d / L, cx = ax + (bx - ax) * f, cz = az + (bz - az) * f, nx = -dir[i][1], nz = dir[i][0], fy = ay + (by - ay) * f;   // (on a flight, from its nosing line)
          const arc = [];
          for (let k = 0; k <= ARCH_N; k++) { const ph = Math.PI * k / ARCH_N; arc.push([cx + nx * (r - 0.02) * Math.cos(ph), fy + spring + (r - 0.02) * Math.sin(ph), cz + nz * (r - 0.02) * Math.cos(ph)]); }
          // (on its pilasters down to the floor; where the walls are cut in niches, from the wall's head)
          if (!s.niches) { arc.unshift([cx + nx * (r - 0.02), fy - (stair ? 0.3 : 0), cz + nz * (r - 0.02)]); arc.push([cx - nx * (r - 0.02), fy - (stair ? 0.3 : 0), cz - nz * (r - 0.02)]); }
          this.band(trim, arc, 0.34, 0.14, [cx, fy + spring * 0.4, cz]);
        }
      }
      // the floor: a slab, or treads and risers
      const L0 = side(i, 1), R0 = side(i, -1), L1 = side(i + 1, 1), R1 = side(i + 1, -1);
      if (!stair) {
        this.flat(floorM, [L0, R0, R1, L1], ay, true, 0.9);
      } else {
        const n = Math.max(1, Math.round(Math.abs(by - ay) / 0.25)), dy = (by - ay) / n;
        for (let k = 0; k < n; k++) {
          const f0 = k / n, f1 = (k + 1) / n, h = ay + dy * (k + 1), hp = ay + dy * k;
          const lp = (A, B, f) => [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
          const l0 = lp(L0, L1, f0), r0 = lp(R0, R1, f0), l1 = lp(L0, L1, f1), r1 = lp(R0, R1, f1);
          // the tread (laid at the flight's own angle) and its riser
          this.flat(stepM, [l0, r0, r1, l1], h, true, 0.95);
          const hi = Math.max(h, hp), lo = Math.min(h, hp), e = dy < 0 ? [l0, r0] : [l1, r1];
          this.sheet(stepM, [[[e[0][0], lo, e[0][1]], [e[1][0], lo, e[1][1]]], [[e[0][0], hi, e[0][1]], [e[1][0], hi, e[1][1]]]],
            [[[0, 0], [w, 0]], [[0, 0.25], [w, 0.25]]], dy < 0 ? [bx, lo, bz] : [ax, lo, az], 0.75);
        }
      }
      // the raster: the flat runs as capsules, the flights as their own slab (stepped), above them
      const xlo = Math.min(ax, bx) - r - SKIRT, xhi = Math.max(ax, bx) + r + SKIRT, zlo = Math.min(az, bz) - r - SKIRT, zhi = Math.max(az, bz) + r + SKIRT;
      const n = stair ? Math.max(1, Math.round(Math.abs(by - ay) / 0.25)) : 1, dy = (by - ay) / n, run = L / n;
      const ux = dir[i][0], uz = dir[i][1];
      this.paint(s, xlo, zlo, xhi, zhi, (x, z) => {
        const t = (x - ax) * ux + (z - az) * uz, off = Math.abs((x - ax) * -uz + (z - az) * ux);
        if (stair) {
          if (t < 0 || t > L || off > r + SKIRT) return null;
          const k = Math.min(n - 1, Math.floor(t / run));
          return [ay + dy * (k + 1), Math.min(ay, by) - 0.6, off <= r ? 4 : 3];
        }
        const d = segD(x, z, ax, az, bx, bz);
        if (d > r + SKIRT) return null;
        return [ay, ay - 0.6, d <= r ? 2 : 1];
      });
    }
    s.length = along;
    s.minY = Math.min(...pts.map((p) => p[2])); s.maxY = Math.max(...pts.map((p) => p[2])) + spring + r;
    // a cap: a wall across an end, with an arched opening for a narrower passage on from it
    for (const [end, cap] of [[0, s.capStart], [N - 1, s.capEnd]]) {
      if (!cap) continue;
      const i = end, d = dir[Math.min(dir.length - 1, Math.max(0, i - (end ? 1 : 0)))], y = pts[i][2];
      const u = [-d[1], d[0]], into = end ? [-d[0], -d[1]] : [d[0], d[1]];
      const at = (t, h) => [pts[i][0] + u[0] * t, y + h, pts[i][1] + u[1] * t];
      const toward = [pts[i][0] + into[0] * 3, y + 1, pts[i][1] + into[1] * 3], r2 = cap.w / 2;
      // the wall: two jambs beside the opening and the face above its arch, up into the vault
      for (const [t0, t1] of [[-r, -r2], [r2, r]]) this.sheet(wall, [[at(t0, 0), at(t1, 0)], [at(t0, spring + r), at(t1, spring + r)]], [[[t0, 0], [t1, 0]], [[t0, spring + r], [t1, spring + r]]], toward, 0.85);
      const rows = [[], []], uvs = [[], []];
      for (let k = 0; k <= ARCH_N; k++) {
        const th = Math.PI * (1 - k / ARCH_N), tt = Math.cos(th) * r2, hh = cap.spring + Math.sin(th) * r2;
        const big = Math.PI * (1 - k / ARCH_N), top = spring + Math.sin(big) * r;
        rows[0].push(at(tt, hh)); rows[1].push(at(Math.cos(big) * r, Math.max(top, hh)));
        uvs[0].push([tt, hh]); uvs[1].push([Math.cos(big) * r, top]);
      }
      this.sheet(wall, rows, uvs, toward, 0.85);
      this.archRing(trim, at(0, 0), u, into, r2, cap.spring, y);
      for (const [t0, t1] of [[-r - 0.25, -r2 - 0.25], [r2 + 0.25, r + 0.25]]) {
        const p0 = at(t0, 0), p1 = at(t1, 0), back = [-into[0] * 0.25, -into[1] * 0.25];
        this.phys.addSeg(p0[0] + back[0], p0[2] + back[1], p1[0] + back[0], p1[2] + back[1], y - 1, y + spring + r, 0.5, 'wall');
      }
    }
  }

  // ------------------------------------------------------------------ physics and the dead's map
  /** The raster's solid cells merged into boxes: runs along each row of the same top and base, grown
   * down the rows while the next row's run matches. */
  colliders() {
    const { nx, nz, top, base, solid } = this;
    const X = (i) => this.x0 + i * G, Z = (k) => this.z0 + k * G;
    let live = new Map(), n = 0;
    const emit = (key, r, k1) => { const [i0, i1] = key.split(',').map(Number); this.phys.add([X(i0), r.base, Z(r.k0)], [X(i1 + 1), r.top, Z(k1 + 1)], 'floor'); n++; };
    for (let k = 0; k <= nz; k++) {
      const runs = new Map();
      for (let i = 0; k < nz && i < nx;) {
        const j = k * nx + i;
        if (!solid[j] || Number.isNaN(top[j])) { i++; continue; }
        let e = i + 1;
        while (e < nx && solid[k * nx + e] && top[k * nx + e] === top[j] && base[k * nx + e] === base[j]) e++;
        runs.set(`${i},${e - 1}`, { top: top[j], base: base[j] });
        i = e;
      }
      const next = new Map();
      for (const [key, v] of runs) {
        const r = live.get(key);
        if (r && r.top === v.top && r.base === v.base) { next.set(key, r); live.delete(key); } else next.set(key, { k0: k, ...v });
      }
      for (const [key, r] of live) emit(key, r, k - 1);
      live = next;
    }
    this.boxCount = n;
  }

  /** The dead's walkable grid (one metre cells) for the spaces of one level: the cell's space, its
   * floor height (the middle of it), and not walkable where it stands proud of a lower neighbour by
   * more than they can climb (a monument's tier edge). */
  nav(spaces) {
    const set = new Set(spaces.map((s) => s.id)), W = Math.floor(this.nx * G), D = Math.floor(this.nz * G);
    const cell = new Int16Array(W * D).fill(-1), h = new Float32Array(W * D).fill(NaN);
    const per = Math.round(1 / G);
    for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
      const j = (k * per + per / 2) * this.nx + i * per + per / 2;
      if (Number.isNaN(this.top[j]) || !set.has(this.owner[j]) || this.prio[j] < 2) continue;
      cell[k * W + i] = this.owner[j]; h[k * W + i] = this.top[j];
    }
    for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
      const c = k * W + i;
      if (cell[c] < 0) continue;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = k + dk;
        if (a < 0 || b < 0 || a >= W || b >= D) continue;
        const o = b * W + a;
        if (cell[o] >= 0 && h[c] - h[o] > 0.65 && LIPS) { cell[c] = -2; break; }   // (marked, then cleared below)
      }
    }
    for (let c = 0; c < cell.length; c++) if (cell[c] === -2) cell[c] = -1;
    return { x0: this.x0, z0: this.z0, nx: W, nz: D, cell, h };
  }
}
