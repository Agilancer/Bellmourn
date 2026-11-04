// The Sorrowhorn alive (docs/DUNGEON_BUILDING.md; each place's intent is written above its dressing).
// The Pilgrims' Road was a lonely climb with a few things on it; now it's a mountain people live and
// die on. Off the road, a path to every place worth going: a shepherd's bothy, a wayshrine, the
// charcoal burners in the trees, a smugglers' cleft, a caravan the mountain buried, an old mine, the
// goat men's pens, the Raven Stones where the hillfolk leave their dead, a hermit under his rock, a
// warm spring, a roofless chapel, a field of cairns and the old beacon; and short paths to the goat
// camps, the caves and the Still Water. Beside the road, the graves of those it killed (they don't stay
// down when you come by); above it, ledges where the goat men wait to leap down on you. Where the road
// runs along a sheer drop, the drop is a cliff, and the stone at its lip is loose. Loose stone lies
// along every way, and folk walk the road and greet you.
//   planLife: before the ground's carved (the places' shelves and the paths up to them);
//   lifeSpurs: once it is, and before the road and paths are laid (the short paths that only drape it);
//   buildLife: the dressing, the stone along the ways, the cliffs, the walkers' stretches;
//   lifeDead / lifeFoes: who's in them (zombies.js, foes.js); S.updateLife: each frame.
import * as THREE from 'three';
import { TOUCH } from './input.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { layRoads } from './roads.js';

const TAU = Math.PI * 2;
let K = null;   // the mountain's own helpers, handed in by mountain.js: { natural, zigzag, hash2, ROAD_W, MOUNT }

// [how far up the road, which side ('in': up the slope from it, 'out': down), id, name, kind, radius]
const OUTPOSTS = [
  [0.05, 'out', 'burners', "The Charcoal Burners' Clearing", 'burners', 9],
  [0.09, 'in', 'bothy', "The Shepherd's Bothy", 'bothy', 8],
  [0.16, 'in', 'wayshrine', "Saint Ivo's Wayshrine", 'shrine', 6.5],
  [0.24, 'out', 'cleft', "The Smugglers' Cleft", 'cleft', 7],
  [0.33, 'out', 'caravan', 'The Lost Caravan', 'caravan', 9],
  [0.43, 'in', 'delving', 'The Old Delving', 'mine', 8],
  [0.49, 'out', 'rampens', 'The Ram Pens', 'pens', 9],
  [0.53, 'in', 'ravens', 'The Raven Stones', 'burial', 8],
  [0.59, 'in', 'hermit', "The Hermit's Overhang", 'hermit', 6.5],
  [0.64, 'out', 'warmspring', 'The Warm Spring', 'spring', 8],
  [0.71, 'in', 'chapel', 'The Roofless Chapel', 'chapel', 9],
  [0.82, 'out', 'cairns', 'The Field of Cairns', 'cairns', 9],
  [0.9, 'out', 'beacon', 'The Old Beacon', 'beacon', 7],
  [0.21, 'out', 'lowbeacon', 'The Low Beacon', 'beacon', 7],
  [0.46, 'out', 'windbeacon', 'The Wind Beacon', 'beacon', 7],
  [0.67, 'out', 'cragbeacon', 'The Crag Beacon', 'beacon', 7],
];
// the graves beside the road, a pack in each stretch (how far up the road)
const GRAVES = [0.07, 0.13, 0.19, 0.26, 0.31, 0.38, 0.45, 0.51, 0.57, 0.63, 0.69, 0.75, 0.8, 0.86, 0.93];
// the goat men's ledges above the road
const LEDGES = [0.11, 0.17, 0.28, 0.36, 0.42, 0.5, 0.6, 0.67, 0.77, 0.84, 0.91, 0.95];
// the folk walking the road: [who, the stretch they walk (from, to: how far up)]
const WALKERS = [['Aldric', 0.03, 0.18], ['Brienne', 0.2, 0.34], ['Osk', 0.36, 0.5], ['Hild', 0.52, 0.68], ['Tam', 0.7, 0.86]];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ planning (before the carve)
/** The places off the road and the paths up to them (shelves and trails, so the carve cuts them), the
 * graves beside the road, the goat men's ledges above it. */
export function planLife(S, helpers) {
  K = helpers;
  const R = S.road, N = R.length;
  const inward = (i) => { const [x, z] = R[i], dx = K.MOUNT.x - x, dz = K.MOUNT.z - z, L = Math.hypot(dx, dz); return [dx / L, dz / L]; };
  const taken = (x, z, r) => S.shelves.some((c) => Math.hypot(x - c.x, z - c.z) < r + (c.r1 || 10) + 8)
    || S.trails.some((t) => t.pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < r + 4));
  const nearBrink = (i, w = 10) => { for (let d = -w; d <= w; d++) if (S.brinks.has(i + d)) return true; return false; };
  // a path from the road to a place: zigzagging where it's steep, clear of the road but where it leaves it
  const pathTo = (site, i, dir) => {
    const [x, z, y] = R[i], [ux, uz] = inward(i), o = K.ROAD_W + 0.4;
    const a = { x: x + ux * dir * o, z: z + uz * dir * o, y: y - 0.1 };
    const dx = site.x - a.x, dz = site.z - a.z, L = Math.hypot(dx, dz);
    const b = { x: site.x - dx / L * (site.r0 - 1.5), z: site.z - dz / L * (site.r0 - 1.5), y: site.y };
    const pts = K.zigzag(a, b, 0.3, Math.min(11, L * 0.3));
    // (the last eighteen metres level, at the shelf's own height: you come up onto it and see it, never over a crest)
    { let acc = 0, cut = pts.length - 1; for (let k = pts.length - 1; k > 0 && acc < 18; k--) { acc += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); cut = k - 1; }
      if (cut > 1) { let tot = 0; const dd = [0]; for (let k = 1; k <= cut; k++) { tot += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); dd.push(tot); }
        for (let k = 0; k < pts.length; k++) pts[k][2] = k <= cut ? a.y + (site.y - a.y) * dd[k] / (tot || 1) : site.y; } }
    // (where it runs straight, a meander across the slope: never a ruled line from the road)
    if (pts.length > 6) { const amp = 1.5 + K.hash2(site.x, site.z) * 2.5, ph = K.hash2(site.z, site.x) * 6, nx = -dz / L, nz = dx / L;
      for (let k = 2; k < pts.length - 4; k++) { const t = k / pts.length, w = Math.sin(t * Math.PI * 2.2 + ph) * amp * Math.sin(t * Math.PI); pts[k][0] += nx * w; pts[k][1] += nz * w; } }
    for (let it = 0; it < 2; it++) {   // (its corners rounded off: no kinks where the legs meet)
      const q = [pts[0]];
      for (let k = 0; k + 1 < pts.length; k++) { const [ax, az, ay] = pts[k], [bx, bz, by] = pts[k + 1]; q.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75, ay * 0.25 + by * 0.75]); }
      q.push(pts[pts.length - 1]); pts.splice(0, pts.length, ...q);
    }
    for (let k = 1, run = 0; k < pts.length - 2; k++) {   // (past its first nine metres, where it leaves the road)
      run += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      if (run < 9) continue;
      const r = S.roadAt(pts[k][0], pts[k][1]);
      if (r && r.d < K.ROAD_W + 4) return null;
      if (S.shelves.some((c) => c !== site && Math.hypot(pts[k][0] - c.x, pts[k][1] - c.z) < (c.r1 || 10) + 3)) return null;
    }
    return { name: `The way to ${site.name.replace(/^The /, 'the ')}`, w: 1.25, pts, side: true, to: site.id };
  };
  S.outposts = [];
  for (const [want, side, id, name, kind, r0] of OUTPOSTS) for (const dir of side === 'in' ? [1, -1] : [-1, 1]) {   // (its own side of the road, else the other)
    const i0 = Math.floor(N * want);
    if (S.outposts.some((o) => o.id === id)) break;
    let done = false;
    for (let di = 0; di < 26 && !done; di++) {
      const i = i0 + (di % 2 ? 1 : -1) * Math.ceil(di / 2) * 3;
      if (i < 8 || i > N - 8 || (dir < 0 && nearBrink(i))) continue;
      const [x, z, y] = R[i], [ux, uz] = inward(i);
      for (let off = 18; off <= 34 && !done; off += 4) {
        const cx = x + ux * off * dir, cz = z + uz * off * dir, cy = K.natural(cx, cz), dy = (cy - y) * dir;
        if (dy < 1.5 || dy > 15) continue;
        const rr = S.roadAt(cx, cz);
        if ((rr && rr.d < r0 + 10) || taken(cx, cz, r0)) continue;     // (not against another leg of the road, nor anything else)
        let lo = Infinity, hi = -Infinity;
        for (let a = 0; a < TAU; a += TAU / 8) { const h = K.natural(cx + Math.cos(a) * r0, cz + Math.sin(a) * r0); lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (hi - lo > 14) continue;                                        // (ground too broken to cut a shelf in)
        const site = { x: cx, z: cz, y: cy, r0, r1: r0 + 6, ux, uz, road: i, fixed: true, id, name, kind, side: dir > 0 ? 'in' : 'out' };
        const path = pathTo(site, i, dir);
        if (!path) continue;
        site.path = path; S.outposts.push(site); S.shelves.push(site); S.trails.push(path); done = true;
      }
    }
  }
  // the graves: pilgrims the road killed, buried beside it where they fell, either side of it
  S.risers = [];
  const clear = (x, z) => !S.shelves.some((c) => Math.hypot(x - c.x, z - c.z) < (c.r1 || 10) + 22) && !S.ambushes.some((A) => Math.hypot(x - A.x, z - A.z) < 40)
    && !S.risers.some((q) => Math.hypot(x - q.x, z - q.z) < 70);
  for (const want of GRAVES) {
    for (let di = 0; di < 14; di++) {
      const i = Math.floor(N * want) + (di % 2 ? 1 : -1) * Math.ceil(di / 2) * 4;
      if (i < 10 || i > N - 10 || nearBrink(i, 4)) continue;
      const [x, z, y] = R[i];
      if (!clear(x, z)) continue;
      const [x2, z2] = R[i + 1], L = Math.hypot(x2 - x, z2 - z) || 1, tx = (x2 - x) / L, tz = (z2 - z) / L;
      const graves = [];
      for (let k = 0; k < 6; k++) {
        const along = (k - 2.5) * 2.7 + (K.hash2(i, k) - 0.5) * 1.2, sd = k % 2 ? 1 : -1, off = K.ROAD_W + 0.6 + K.hash2(k, i) * 1.4;
        const gx = x + tx * along - tz * off * sd, gz = z + tz * along + tx * off * sd, rr = S.roadAt(gx, gz);
        if (rr && rr.d < K.ROAD_W + 0.4) continue;
        graves.push([gx, gz, Math.atan2(tx, tz)]);
      }
      if (graves.length < 4) continue;
      S.risers.push({ road: i, x, z, y, graves, r: 11 });
      break;
    }
  }
  // the scree chutes: where one leg of the road runs above another, a steep smooth gully of scree cut
  // between them, to ride down on your shield (board.js): a way down in seconds that takes minutes on foot
  S.chutes = [];
  for (let i = Math.floor(N * 0.15); i < N - 10 && S.chutes.length < 4; i += 3) {
    const [xi, zi, yi] = R[i];
    if (S.chutes.some((c) => Math.hypot(c.a[0] - xi, c.a[1] - zi) < 120)) continue;
    const below = [...R.slice(10, Math.max(10, i - 60)).filter((_, q) => q % 3 === 0).map((p) => [p[0], p[1], p[2], null]),
      ...S.trails.flatMap((t) => t.pts.filter((_, q) => q % 3 === 0).map((p) => [p[0], p[1], p[2], t]))];
    for (const [xj, zj, yj, tj] of below) {
      const dx = xj - xi, dz = zj - zi, L = Math.hypot(dx, dz), dy = yi - yj;
      if (L < 18 || L > 220 || dy < 9 || dy / L < 0.22 || dy / L > 1.0) continue;   // (from one lap of the road down the flank to the next: up to a long run)
      const ux = dx / L, uz = dz / L, o = K.ROAD_W + 0.8, oj = tj ? tj.w + 0.6 : o, a = [xi + ux * o, zi + uz * o, yi - 0.1], b = [xj - ux * oj, zj - uz * oj, yj - 0.1];
      let ok = true;
      for (let t = 0.15; t < 0.82; t += 0.1) {
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, y = a[2] + (b[2] - a[2]) * t, n = K.natural(x, z), rr = S.roadAt(x, z);
        if (n > y + 12 || n < y - 16 || (rr && rr.d < K.ROAD_W + 1.5) || S.shelves.some((c) => Math.hypot(x - c.x, z - c.z) < (c.r1 || 10) + 2) || S.trails.some((tr) => tr !== tj && tr.pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 4))) { ok = false; break; }
      }
      if (!ok) continue;
      S.chutes.push({ a, b, w: 4.0, i, to: tj ? tj.name : 'the road below', name: 'a scree chute' });
      break;
    }
  }
  const segD = (c, x, z) => { const ex = c.b[0] - c.a[0], ez = c.b[1] - c.a[1], l2 = ex * ex + ez * ez, t = Math.max(0, Math.min(1, ((x - c.a[0]) * ex + (z - c.a[1]) * ez) / l2)); return [Math.hypot(x - c.a[0] - ex * t, z - c.a[1] - ez * t), t]; };
  S.chuteCut = (x, z, h) => {   // (the carve: the gully's floor a smooth incline, a little hollowed, its sides blended out)
    for (const c of S.chutes) {
      const [d, t] = segD(c, x, z);
      if (d > c.w * 2.6 || t <= 0 || t >= 1) continue;
      const rr = S.roadAt(x, z); if (rr && rr.d < K.ROAD_W + 0.6) continue;
      const g = smooth(0, 0.1, t) * (1 - smooth(0.9, 1, t)), q = d / c.w;   // (a gully: 3.4 m deep at its middle, its banks 1.4 m proud, both gone at its ends)
      const target = c.a[2] + (c.b[2] - c.a[2]) * t - g * (3.4 * Math.max(0, 1 - q * q) - 1.4 * smooth(0.8, 1.2, q) * (1 - smooth(1.6, 2.4, q)));
      h += (target - h) * (1 - smooth(c.w * 1.6, c.w * 2.6, d));
    }
    return h;
  };
  S.chuteNear = (x, z, pad) => S.chutes.some((c) => segD(c, x, z)[0] < c.w + pad);
  S.approaches = S.outposts.map((o) => { const P = o.path.pts; let acc = 0, k = P.length - 1; for (; k > 0 && acc < 25; k--) acc += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
    const A = P.slice(k); return { pts: A, x0: Math.min(...A.map((p) => p[0])) - 16, x1: Math.max(...A.map((p) => p[0])) + 16, z0: Math.min(...A.map((p) => p[1])) - 16, z1: Math.max(...A.map((p) => p[1])) + 16 }; });
  S.lifeCut = (x, z, h) => {
    h = S.chuteCut(x, z, h);
    for (const A of S.approaches) {
      if (x < A.x0 || x > A.x1 || z < A.z0 || z > A.z1) continue;
      for (const p of A.pts) { const d = Math.hypot(x - p[0], z - p[1]); if (d > 15) continue;
        const cap = p[2] + Math.max(0, d - 2.5) / 3.5, floor = p[2] - Math.max(0, d - 2.5) / 3.5;   // (banks laid back 1:3.5 to fifteen metres; the ground below filled up as far)
        if (h > cap) h = cap + (h - cap) * smooth(11, 15, d); else if (h < floor && !((S.roadAt(x, z)?.d ?? 99) < K.ROAD_W + 3)) h = floor + (h - floor) * smooth(7, 10, d); }
    }
    return h;
  };
  // the goat men's ledges: a shelf of rock 4 to 8 m above the road on its uphill side, three or four of them on it
  S.goatAmbushes = [];
  for (const want of LEDGES) {
    for (let di = 0; di < 20; di++) {
      const i = Math.floor(N * want) + (di % 2 ? 1 : -1) * Math.ceil(di / 2) * 3;
      if (i < 10 || i > N - 10) continue;
      const [x, z, y] = R[i], [ux, uz] = inward(i);
      if (S.goatAmbushes.some((A) => Math.hypot(A.x - x, A.z - z) < 80) || S.ambushes.some((A) => Math.hypot(A.x - x, A.z - z) < 60)
        || S.risers.some((A) => Math.hypot(A.x - x, A.z - z) < 40) || S.shelves.some((c) => Math.hypot(x - c.x, z - c.z) < (c.r1 || 10) + 12)) continue;
      const [x2, z2] = R[Math.min(N - 1, i + 2)], tl = Math.hypot(x2 - x, z2 - z) || 1, tx = (x2 - x) / tl, tz = (z2 - z) / tl;
      const spots = [];
      for (const along of [-6, -2, 2, 6]) for (const off of [6.5, 8.5, 10.5]) {
        const px = x + ux * off + tx * along, pz = z + uz * off + tz * along, h = K.natural(px, pz), rr = S.roadAt(px, pz);
        if (h - y < 3.5 || h - y > 8 || (rr && rr.d < 5.5) || taken(px, pz, 1)) continue;
        spots.push([px, pz]); break;
      }
      if (spots.length < 3) continue;
      S.goatAmbushes.push({ road: i, x, z, y, spots, r: 12, ux, uz, folk: 'goat', name: 'A goat-men ambush' });
      break;
    }
  }
}

// ------------------------------------------------------------------ the short paths (after the carve)
/** Short paths from the road to the goat camps, the caves and the Still Water (laid on the ground as it
 * is, not cut into it: they're short and gentle); and S.spurNear, so nothing's planted on them. */
export function lifeSpurs(S) {
  const R = S.road, out = [];
  for (const c of [...S.camps, ...(S.caveSites || []), S.fallsSite].filter(Boolean)) {
    const [x, z] = R[c.road];
    let dx = c.x - x, dz = c.z - z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    // (it comes in at an angle: a goat camp's skull stake stands on the straight line to the road)
    const sg = K.hash2(c.z, c.x) < 0.5 ? -1 : 1, ca = Math.cos(0.55), sa = Math.sin(0.55) * sg, ex = -dx * ca + dz * sa, ez = -dz * ca - dx * sa;
    const into = S.camps.includes(c) ? 0.55 : 0.92;   // (into a camp; only to the edge of a cave's forecourt or the pool's shelf: their star-seals stand in them)
    const ax = x + dx * K.ROAD_W * 0.7, az = z + dz * K.ROAD_W * 0.7, bx = c.x + ex * c.r0 * into, bz = c.z + ez * c.r0 * into;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 3) continue;
    const n = Math.ceil(len / 2.5), bend = -sg * len * 0.08, pts = [];
    for (let k = 0; k <= n; k++) { const t = k / n, w = Math.sin(t * Math.PI) * bend, px = ax + (bx - ax) * t - dz * w, pz = az + (bz - az) * t + dx * w;
      if (into > 0.6 && k > 1 && Math.hypot(px - c.x, pz - c.z) < c.r0 * 0.95) break;   // (it stops where the forecourt starts)
      pts.push([px, pz, S.heightAt(px, pz)]); }
    out.push({ name: `The path to ${c.name.replace(/^The /, 'the ')}`, w: 1.15, pts, side: true, to: c.name, spur: true });
  }
  S.trails.push(...out);
  // (the spurs aren't in the carve's own index of the trails: their own, for what's planted)
  const cell = 16, grid = new Map(), key = (i, k) => i * 100003 + k;
  for (const t of out) for (const p of t.pts) { const k = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  S.spurNear = (x, z, pad) => {
    const i0 = Math.floor(x / cell), k0 = Math.floor(z / cell);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let k = k0 - 1; k <= k0 + 1; k++) for (const p of grid.get(key(i, k)) || []) if (Math.hypot(p[0] - x, p[1] - z) < 1.2 + pad) return true;
    return false;
  };
  return out.length;
}

/** Every way's lane (ctx.paths: the road, the paths, the village's and the downs'): inLane(x, z, r) says
 * whether something r wide at (x, z) would stand in one. Their points a metre apart, in 8 m squares. */
export function laneIndex(paths) {
  const cell = 8, lanes = new Map(), key = (i, k) => i * 100003 + k;
  for (const p of paths || []) for (let i = 0; i + 1 < p.pts.length; i++) {
    const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1], len = Math.hypot(bx - ax, bz - az), lane = Math.min(p.w * 0.5, 1.4);
    for (let d = 0; d <= len; d += 1) { const x = ax + (bx - ax) * d / (len || 1), z = az + (bz - az) * d / (len || 1), k = key(Math.floor(x / cell), Math.floor(z / cell)); if (!lanes.has(k)) lanes.set(k, []); lanes.get(k).push([x, z, lane]); }
  }
  return (x, z, r) => { const i0 = Math.floor(x / cell), k0 = Math.floor(z / cell);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let k = k0 - 1; k <= k0 + 1; k++) for (const [px, pz, l] of lanes.get(key(i, k)) || []) if (Math.hypot(px - x, pz - z) < l + r + 0.35) return true;
    return false; };
}

// ------------------------------------------------------------------ building
/** Everything laid out above, dressed (after the carve, the road and paths laid). */
export function buildLife(ctx, S, M) {
  const { b, physics } = ctx, H = (x, z) => S.heightAt(x, z), R = S.road, N = R.length;
  let seed = 7171; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const stone = M('stone_06_mossy_fieldstone_1_03', 1.6, { tri: true }), wood = M('ship_01_tarblack_oak', 1), plank = M('town_oak_boards', 1.2, { tint: 0x9a8a78 });
  const thatch = M('town_roof_straw_thatch', 2, { tint: 0x8a7a5a }), earth = M('ground_dirt_02', 1.4, { tint: 0x5e5044 }), turf = M('ground_grass_05', 2, { tint: 0x8a9a70, tri: true });
  const cloth = (c) => M('cloth_04_aged_cream_linen', 0.6, { tint: c }), bone = M('castle_keep_ivory_chapel_marble', 0.5), pale = M('castle_keep_pale_keep_limestone', 1.2, { tri: true });
  const fieldWall = M('town_wall_fieldstone', 2.2, { tri: true }), granite = M('rock_05_overworld_granite_1_02', 3, { tint: 0xb8b2a8, tri: true }), dark = M('castle_basalt', 1.4, { tint: 0x2a2826 });
  const P = (id, x, z, s = 1, rot = null) => ctx.scatter?.place(id, x, H(x, z), z, s, rot);
  const low = (x, z, r) => Math.min(H(x, z), H(x + r, z), H(x - r, z), H(x, z + r), H(x, z - r));   // (the lowest ground under something r wide)
  const chest = (id, x, z, yaw, name) => { ctx.props?.add(id, x, H(x, z), z, yaw, 1); (S.chests ||= []).push({ id, x, z, name, charm: null }); };
  const fire = (x, z, s = 1) => { const y = H(x, z); P('campfire', x, z, s); ctx.flames.push([x, y + 0.35, z, 0.4 * s, 1]); (ctx.campFires ||= []).push([x, y, z]); ctx.chimneys?.push([x, y + 1.2, z]); };
  // a wall of stone from (x0, z0) to (x1, z1), h high (its own collider), its top ragged when `ruin`
  const wall = (x0, z0, x1, z1, h, mat, { t = 0.55, ruin = 0 } = {}) => {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), rot = Math.atan2(-dz, dx), n = Math.max(1, Math.round(L / 1.2));
    for (let k = 0; k < n; k++) {   // (each piece on its own ground, its foot sunk; none across a step in the ground)
      const a = k / n, c = (k + 1) / n, ax = x0 + dx * a, az = z0 + dz * a, cx = x0 + dx * c, cz = z0 + dz * c, mx = (ax + cx) / 2, mz = (az + cz) / 2;
      const g = [H(ax, az), H(cx, cz), H(mx, mz)], lo = Math.min(...g), hi = Math.max(...g), hh = h * (ruin ? 1 - ruin * rnd() : 1) + (hi - lo) + 0.4;
      if (hi - lo > 1.2 || hh < 0.6) continue;
      b.place(mx, lo - 0.4, mz, rot, 1, (o) => o.box([-L / n / 2, 0, -t / 2], [L / n / 2, hh, t / 2], mat), { solid: true, tag: 'wall' });
    }
  };
  // a place's frame: front toward where its path comes in, right beside it; at(lx, lz) a point in it
  const frame = (o) => {
    const e = o.path.pts[o.path.pts.length - 2] || o.path.pts[0], dx = e[0] - o.x, dz = e[1] - o.z, L = Math.hypot(dx, dz) || 1, fx = dx / L, fz = dz / L;
    const F = { x: o.x, z: o.z, y: o.y, fx, fz, rx: -fz, rz: fx, yaw: Math.atan2(fx, fz) };
    F.at = (lx, lz) => [o.x + F.rx * lx + fx * lz, o.z + F.rz * lx + fz * lz];
    return F;
  };
  const cairn = (x, z, h = 6, s = 1) => b.place(x, H(x, z), z, rnd() * 6, s, (o) => { for (let k = 0; k < h; k++) o.blob([Math.sin(k * 2.1) * 0.08, 0.16 + k * 0.2, Math.cos(k * 2.1) * 0.07], [0.3 - k * 0.035, 0.13, 0.26 - k * 0.03], stone, { detail: 0, jitter: 0.25, seed: 4000 + Math.floor(rnd() * 999) }); }, { solid: h > 4, minHeight: 0.8 });
  const flags = (ax, az, bx, bz, top) => {
    const rope = M('ship_01_tarblack_oak', 1, { tint: 0x605040 });
    for (const [px, pz] of [[ax, az], [bx, bz]]) { const py = H(px, pz); b.place(px, py, pz, 0, 1, (o) => o.box([-0.05, 0, -0.05], [0.05, top, 0.05], wood), { solid: true }); }
    const ay = H(ax, az) + top - 0.1, by = H(bx, bz) + top - 0.1, ang = Math.atan2(bx - ax, bz - az);
    let lx = ax, ly = ay, lz = az;
    for (let f = 1; f <= 8; f++) {
      const u = f / 8, nx = ax + (bx - ax) * u, nz = az + (bz - az) * u, ny = ay + (by - ay) * u - Math.sin(Math.PI * u) * 0.4;
      b.place(0, 0, 0, 0, 1, (o) => o.beam([lx, ly, lz], [nx, ny, nz], 0.012, 0.012, rope), { solid: false });
      if (f < 8) b.place(nx, ny, nz, ang + Math.PI / 2, 1, (o) => o.box([-0.14, -0.32, -0.01], [0.14, 0, 0.01], cloth([0xc04040, 0x4060c0, 0xe0c040, 0x40a060, 0xe8e0d0][f % 5])), { solid: false });
      lx = nx; ly = ny; lz = nz;
    }
  };

  for (const o of S.outposts || []) {
    const F = frame(o), y = o.y, at = F.at;
    o.dead = []; o.goats = 0;
    // (a terrace: the shelf held up on its downhill side by a dry-stone wall, open where its path comes in)
    { const rr = o.r0 + 0.4, n = 14;
      for (let k = 0; k < n; k++) { const a0 = k / n * TAU, a1 = (k + 1) / n * TAU, am = (a0 + a1) / 2, cx = Math.cos(am), cz = Math.sin(am);
        if (-(cx * o.ux + cz * o.uz) < 0.25 || cx * F.fx + cz * F.fz > 0.86) continue;   // (the downhill side, off the mountain; not across its path)
        wall(o.x + Math.cos(a0) * rr, o.z + Math.sin(a0) * rr, o.x + Math.cos(a1) * rr, o.z + Math.sin(a1) * rr, 0.9, fieldWall, { t: 0.5, ruin: 0.35 }); } }
    switch (o.kind) {
      // The Charcoal Burners' Clearing. Who: the burners from Hornhollow, who come down for a month at a
      // time. Since: they're up at the village now; their kilns still smoulder. Job: rest, a landmark
      // (two columns of smoke over the trees, seen from the road). First view: the kilns, smoking. Leave: back down the path.
      case 'burners': {
        const char = M('castle_basalt', 1.4, { tint: 0x1c1a18 }), turfK = M('ground_grass_05', 1.6, { tint: 0x6a7050, tri: true });
        for (const [lx, lz] of [[-3, -1.5], [3, -2]]) {
          const [kx, kz] = at(lx, lz), ky = H(kx, kz);
          b.place(kx, ky - 0.15, kz, rnd() * 6, 1, (o2) => { o2.blob([0, 0.19, 0], [3.0, 0.07, 3.0], char, { detail: 1, jitter: 0.2, seed: 5110 + lx });
            o2.cone(0, 0, 2.2, 0, 2.4, 10, earth); o2.blob([0.6, 1.1, 0.4], [0.9, 0.5, 0.8], turfK, { detail: 1, jitter: 0.2, seed: 5120 + lx }); o2.blob([0, 2.35, 0], [0.35, 0.2, 0.35], char, { detail: 0, jitter: 0.2, seed: 5130 + lx }); }, { solid: true, tag: 'rock' });
          { const [wx, wz] = at(lx * 1.9, lz + 2.4), wy = H(wx, wz); b.place(wx, wy, wz, F.yaw + Math.PI / 2, 1, (o2) => { for (let r = 0; r < 4; r++) for (let c = 0; c < 6 - r; c++) o2.cylinder([-1.1, 0.16 + r * 0.3, -0.75 + c * 0.3 + r * 0.15], [1.1, 0.16 + r * 0.3, -0.75 + c * 0.3 + r * 0.15], 0.14, 6, wood); }, { solid: true }); }
          ctx.chimneys?.push([kx, ky + 2, kz]); ctx.chimneys?.push([kx + 0.3, ky + 2, kz - 0.2]);
        }
        P('timber_heap', ...at(-4.5, 3), 1.2); P('timber_heap', ...at(4.6, 2.4), 1);
        const [lx, lz] = at(0, 4.2), ly = H(lx, lz);
        b.place(lx, ly, lz, F.yaw, 1, (o2) => { o2.beam([-1.5, 0, 1], [-1.5, 1.8, 0], 0.07, 0.07, wood); o2.beam([1.5, 0, 1], [1.5, 1.8, 0], 0.07, 0.07, wood); o2.box([-1.6, 1.75, -0.05], [1.6, 1.85, 0.05], wood);
          for (let k = 0; k < 5; k++) o2.beam([-1.5 + k * 0.75, 1.8, 0], [-1.5 + k * 0.75, 0.05, -1.3], 0.34, 0.02, cloth(0x7a6a50)); }, { solid: true });
        fire(...at(0, 1.6), 0.9); P('sacks', ...at(1.6, 4.4), 0.9); P('hide_bedroll', ...at(-1, 4.6), 1, F.yaw);
        break;
      }
      // The Shepherd's Bothy. Who: the Hornhollow shepherds, for the summer grazing. Since: the goat men
      // came down and the sheep went; the bothy's shut. Job: rest and a little reward (the shepherd's
      // kist by the door). First view: the turf roof over its drystone walls, the empty fold. Leave: its path.
      case 'bothy': {
        const [hx, hz] = at(0, -1.5), hy = H(hx, hz);
        b.place(hx, hy - 0.2, hz, F.yaw, 1, (o2) => {
          o2.box([-2.2, 0, -1.8], [2.2, 2.1, 1.8], fieldWall);
          o2.box([-0.5, 0.1, 1.79], [0.5, 1.75, 1.86], plank);   // (its door, shut)
          for (const s of [-1, 1]) o2.beam([-2.5, 2.05 - 0.1, s * 2.0], [2.5, 2.05 - 0.1, s * 2.0], 0.14, 0.14, wood);
          for (let k = 0; k < 5; k++) o2.box([-2.2, 2.1 + k * 0.24, -(1.7 - k * 0.38)], [2.2, 2.34 + k * 0.24, 1.7 - k * 0.38], fieldWall);   // (its gables, stepped)
          for (const s of [-1, 1]) o2.beam([0, 1.95, s * 2.2], [0, 3.35, 0], 5.0, 0.22, turf);   // (its roof of turf, pitched)
          o2.box([1.2, 2.3, -0.7], [1.75, 3.2, -0.15], fieldWall);   // (its chimney)
        }, { solid: true });
        { const [cx, cz] = at(1.4, -1.9); ctx.chimneys?.push([cx, hy + 3.2, cz]); }
        // the fold: a ring of drystone, open toward the path
        const [fx, fz] = at(5.2, 1.5);
        for (let k = 0; k < 9; k++) { const a0 = F.yaw + k * TAU / 10, a1 = F.yaw + (k + 1) * TAU / 10; if (k === 4) continue;
          wall(fx + Math.sin(a0) * 2.8, fz + Math.cos(a0) * 2.8, fx + Math.sin(a1) * 2.8, fz + Math.cos(a1) * 2.8, 0.85, fieldWall, { t: 0.4, ruin: 0.3 }); }
        chest('chest_domed_gothic', ...at(-1.4, 0.8), F.yaw, "The Shepherd's Kist");
        P('timber_heap', ...at(-3.2, -0.5), 0.9); P('water_barrel', ...at(1.2, 0.9), 0.9);
        break;
      }
      // Saint Ivo's Wayshrine. Who: the pilgrims, a stone at a time over a hundred years. Since: still
      // tended; candles burn in it. Job: reward (what the pilgrims left) and a breath. First view: the
      // little roofed niche with its lights, flags over it. Leave: its path.
      case 'shrine': {
        const [sx, sz] = at(0, -2), sy = H(sx, sz);
        b.place(sx, sy - 0.2, sz, F.yaw, 1, (o2) => {
          o2.box([-1.6, 0, -1.2], [1.6, 0.45, 1.2], pale); o2.box([-1.2, 0.45, -0.9], [1.2, 0.75, 0.9], pale);
          for (const s of [-1, 1]) o2.box([s * 0.9 - 0.2, 0.75, -0.6], [s * 0.9 + 0.2, 2.6, 0.2], pale);
          o2.box([-1.15, 0.75, -0.75], [1.15, 2.6, -0.55], pale);
          o2.box([-1.3, 2.6, -0.85], [1.3, 2.85, 0.4], pale);
          o2.cone(0, -0.2, 1.1, 2.85, 0.9, 4, M('castle_roof_black', 1.2, { tint: 0x8a8078 }));
          o2.box([-0.3, 0.75, -0.5], [0.3, 1.6, -0.3], bone);    // (the saint's relic stone)
        }, { solid: true });
        for (const [lx, lz] of [[-0.6, -1.3], [0.6, -1.3], [0, -1.15], [-0.3, -1.4], [0.35, -1.45]]) { const [cx, cz] = at(lx, lz); P('candle', cx, cz, 1); ctx.flames.push([cx, H(cx, cz) + 0.95, cz, 0.06, 1]); }
        flags(...at(-3, 1.5), ...at(3, 1.5), 2.6);
        chest('chest_gilded_iron', ...at(2.2, -0.6), F.yaw - 0.4, "The Pilgrims' Offerings");
        cairn(...at(-2.8, -1), 5); cairn(...at(3, -1.6), 4);
        break;
      }
      // The Smugglers' Cleft. Who: smugglers running salt and steel round the Wardens' toll. Since:
      // hanged at Greywatch, all three; their last load still here. Job: reward for looking off the road.
      // First view: a cleft between two leaning slabs, a lantern hung in it. Leave: its path.
      case 'cleft': {
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const [cx, cz] = at(s * (2.6 + k * 0.4), 1.5 - k * 2.6), cy = H(cx, cz);   // (the two faces of the crack)
          b.place(cx, low(cx, cz, 1.5) - 0.9, cz, F.yaw + s * 0.12, 1, (o2) => o2.blob([0, 4.0, 0], [1.4, 4.6, 1.7], granite, { detail: 2, jitter: 0.14, seed: 5200 + s * 7 + k }), { solid: true, tag: 'rock' }); }
        const [bx, bz] = at(0, -6.2), by = H(bx, bz);
        b.place(bx, by - 0.6, bz, F.yaw, 1, (o2) => o2.blob([0, 3.6, 0], [3.8, 4.2, 1.6], granite, { detail: 2, jitter: 0.16, seed: 5210 }), { solid: true, tag: 'rock' });
        for (const s of [-1, 1]) { const [hx, hz] = at(s * 7.2, -2.2); b.place(hx, low(hx, hz, 4) - 1.2, hz, F.yaw, 1, (o2) => o2.blob([0, 2.6, 0], [4.6, 4.2, 6.4], granite, { detail: 2, jitter: 0.16, seed: 5230 + s }), { solid: true, tag: 'rock' }); }   // (the outcrop it splits)
        chest('chest_gilded_iron', ...at(0, -4.4), F.yaw, "The Smugglers' Last Load");
        P('crate_stack', ...at(-1, -3.4), 0.8); P('closed_barrel', ...at(1, -3.2), 0.85); P('sacks', ...at(0.9, -2.2), 0.8);
        { const [lx, lz] = at(-1.1, 0.6), ly = H(lx, lz); b.place(lx, ly, lz, F.yaw, 1, (o2) => { o2.box([-0.05, 0, -0.05], [0.05, 2.1, 0.05], wood); o2.box([-0.05, 2.0, -0.05], [0.05, 2.08, 0.6], wood); }, { solid: true });
          P('lantern', lx, lz, 1); ctx.flames.push([lx, ly + 1.75, lz + 0.0, 0.12, 1]); }
        break;
      }
      // The Lost Caravan. Who: a salt caravan bound for Hornhollow. Since: the mountain came down on it in
      // the thaw; its drovers didn't stay dead. Job: fight, then the salt-master's strongbox. First view:
      // the wagon on its side under the scree. Leave: its path.
      case 'caravan': {
        P('wagon', ...at(-0.5, -1), 1.3, F.yaw + 1.9); P('cart_debris', ...at(2.6, 1.4), 1.2); P('broken_wheel', ...at(-3, 1.6), 1.1);
        for (const [lx, lz, s] of [[-1.6, -2.2, 1.5], [0.6, -2.6, 1.3], [-0.2, -0.6, 1.0]]) { const [wx, wz] = at(lx, lz); b.place(wx, low(wx, wz, s) - s * 0.3, wz, rnd() * 6, 1, (o2) => o2.blob([0, s * 0.5, 0], [s * 1.3, s * 0.85, s], granite, { detail: 1, jitter: 0.2, seed: 5350 + lx }), { solid: true, tag: 'rock' }); }   // (on it)
        // (the scree that came down on it: a fan off the slope above, big stones high, small spilling down over it)
        for (let k = 0; k < 38; k++) { const d = 2 + Math.pow(rnd(), 0.7) * 16, sp = (rnd() - 0.5) * (2 + d * 0.55), rx = o.x + o.ux * d - o.uz * sp, rz = o.z + o.uz * d + o.ux * sp, s = 0.25 + (d / 18) * 1.1 * (0.5 + rnd()), ry = H(rx, rz);
          if (o.path.pts.some(([px, pz]) => Math.hypot(px - rx, pz - rz) < 2 + s)) continue;   // (never across its own path)
          b.place(rx, Math.min(ry, low(rx, rz, s)) - s * 0.35, rz, rnd() * 6, 1, (o2) => o2.blob([0, s * 0.45, 0], [s * 1.2, s * 0.8, s], granite, { detail: s > 0.7 ? 1 : 0, jitter: 0.22, seed: 5300 + k }), { solid: s > 0.9, tag: 'rock' }); }
        for (const [lx, lz] of [[1.5, -1], [2.4, -0.2], [0.9, 0.2]]) { const [cx, cz] = at(lx, lz); ctx.props?.add('crate', cx, H(cx, cz), cz, rnd() * 6, 1); }
        P('skull_pile', ...at(-2.4, 2.4), 0.8); P('gnawed_bones', ...at(1.8, 2.6), 1);
        chest('chest_gilded_iron', ...at(-2.2, -0.6), F.yaw + 0.6, "The Salt-Master's Strongbox");
        o.dead = [at(0.5, 2), at(-1.5, 3), at(2.8, 2.6)]; o.deadStart = 'playdead';
        break;
      }
      // The Old Delving. Who: Hornhollow's copper-miners, long ago. Since: the adit fell in on the last
      // shift; they're still down there, and two came back up. Job: fight, the miners' chest. First view:
      // the timbered mouth in the rock, the cart run out on its rails. Leave: its path.
      case 'mine': {
        const [mx, mz] = at(0, -o.r0 + 1.4), my = H(mx, mz);
        b.place(mx, my - 0.3, mz, F.yaw, 1, (o2) => {
          o2.blob([0, 2.6, -2.6], [4.6, 4.0, 2.6], granite, { detail: 2, jitter: 0.15, seed: 5400 });   // (the rock it's cut in)
          o2.box([-1.35, 0, -0.9], [1.35, 2.9, 0.4], dark);                                              // (the dark inside)
          for (const s of [-1, 1]) { o2.box([s * 1.5 - 0.18, 0, 0.3], [s * 1.5 + 0.18, 3.1, 0.66], wood); o2.beam([s * 1.5, 0, 1.1], [s * 1.5, 2.6, 0.5], 0.12, 0.12, wood); }
          o2.box([-1.9, 3.0, 0.2], [1.9, 3.36, 0.72], wood);
          for (let k = 0; k < 6; k++) o2.blob([(k - 2.5) * 0.4, 0.35 + (k % 2) * 0.3, 0.2], [0.45, 0.4, 0.35], granite, { detail: 0, jitter: 0.3, seed: 5410 + k });   // (the fall that shut it)
        }, { solid: true, tag: 'rock' });
        { const [rx, rz] = at(0, -o.r0 + 2), [ex, ez] = at(0, 2.5);   // the rails out of it
          for (const s of [-0.45, 0.45]) { const [ax, az] = [rx + F.rx * s, rz + F.rz * s], [qx, qz] = [ex + F.rx * s, ez + F.rz * s]; b.place(0, 0, 0, 0, 1, (o2) => o2.beam([ax, H(ax, az) + 0.06, az], [qx, H(qx, qz) + 0.06, qz], 0.06, 0.05, M('castle_basalt', 1, { tint: 0x3a3632 })), { solid: false }); } }
        { const [cx, cz] = at(0, 1.2), cy = H(cx, cz); b.place(cx, cy, cz, F.yaw, 1, (o2) => { o2.box([-0.6, 0.25, -0.8], [0.6, 1.0, 0.8], plank); for (const s of [-1, 1]) for (const t of [-0.5, 0.5]) o2.cylinder([s * 0.62, 0.2, t], [s * 0.68, 0.2, t], 0.2, 8, wood); }, { solid: true }); }
        for (let k = 0; k < 7; k++) { const [tx, tz] = at(3.2 + k * 0.6, -2 + k * 1.6), ty = H(tx, tz), s = 1.6 - k * 0.12;   // (its tailings, grey, spilling down the slope)
          b.place(tx, ty - s * 0.4, tz, F.yaw, 1, (o2) => o2.blob([0, s * 0.35, 0], [s * 1.5, s * 0.55, s * 1.2], M('castle_basalt', 1.4, { tint: 0x7a7670 }), { detail: 1, jitter: 0.2, seed: 5430 + k }), { solid: false }); }
        { const [px, pz] = at(-1.9, -o.r0 + 2.4), py = H(px, pz); b.place(px, py, pz, F.yaw, 1, (o2) => { o2.box([-0.07, 0, -0.07], [0.07, 2.4, 0.07], wood); o2.box([-0.05, 2.3, -0.05], [0.05, 2.38, 0.55], wood); }, { solid: true }); }
        for (let k = 0; k < 6; k++) { const [sx, sz] = at(3 + rnd() * 2.5, -1 + k * 0.9), s = 0.5 + rnd() * 0.7; b.place(sx, H(sx, sz) - 0.2, sz, rnd() * 6, 1, (o2) => o2.blob([0, s * 0.4, 0], [s * 1.3, s * 0.6, s], M('castle_basalt', 1.4, { tint: 0x605a54 }), { detail: 0, jitter: 0.3, seed: 5420 + k }), { solid: false }); }
        { const [lx, lz] = at(-1.9, -o.r0 + 2.95), ly = H(lx, lz); ctx.scatter?.place('lantern', lx, ly + 1.85, lz, 1); ctx.flames.push([lx, ly + 2.05, lz, 0.14, 1]); }   // (a lantern hung at the mouth)
        chest('chest_domed_gothic', ...at(-2.6, -0.4), F.yaw + 0.5, "The Miners' Chest");
        P('timber_heap', ...at(-3.4, 1.8), 0.9);
        o.dead = [at(1.6, -2), at(-0.8, -1.4)]; o.deadStart = 'buried';
        break;
      }
      // The Ram Pens. Who: the goat men, who keep their beasts (and their kills) here. Since: theirs.
      // Job: fight. First view: the stakes, the ram skulls on them, the slaughter stone. Leave: its path.
      case 'pens': {
        const stakeM = M('ship_01_tarblack_oak', 1, { tint: 0xb8a088 });
        for (let k = -11; k <= 11; k++) { const a = F.yaw + Math.PI + k * 0.2, [px, pz] = [o.x + Math.sin(a) * 6.5, o.z + Math.cos(a) * 6.5], py = H(px, pz), h = 1.6 + (k % 3) * 0.2;
          b.place(px, py - 0.2, pz, a, 1, (o2) => { o2.box([-0.09, 0, -0.09], [0.09, h, 0.09], stakeM); o2.cone(0, 0, 0.13, h, 0.3, 5, stakeM); }, { solid: false });
          physics.add([px - 0.14, py - 0.2, pz - 0.14], [px + 0.14, py + h, pz + 0.14], 'post'); }
        { const [sx, sz] = at(0, -1.5); b.place(sx, H(sx, sz) - 0.3, sz, rnd(), 1, (o2) => o2.blob([0, 0.45, 0], [1.4, 0.6, 1.0], granite, { detail: 1, jitter: 0.12, seed: 5500 }), { solid: true, tag: 'rock' }); }
        P('gnawed_bones', ...at(1.2, -0.4), 1.2); P('skull_pile', ...at(-2.4, -2.5), 1); P('goat_weapon_cache', ...at(2.6, -2.6), 1, F.yaw);
        P('hide_bedroll', ...at(-3, 1), 1); fire(...at(-0.8, 2.2), 0.9);
        o.goats = TOUCH ? 2 : 3;
        break;
      }
      // The Raven Stones. Who: the hillfolk, who give their dead to the sky. Since: the ravens come, and
      // what's left of the dead doesn't always lie still. Job: spectacle, then a reward among the bones.
      // First view: the stone tables against the sky, bones on them. Leave: its path.
      case 'burial': {
        for (let k = 0; k < 4; k++) {
          const a = F.yaw + Math.PI + (k - 1.5) * 0.75, [tx, tz] = [o.x + Math.sin(a) * 3.6, o.z + Math.cos(a) * 3.6], ty = H(tx, tz), lo = low(tx, tz, 1.4);
          b.place(tx, ty, tz, a, 1, (o2) => {
            for (const [lx, lz] of [[-0.8, -0.5], [0.8, -0.5], [0, 0.6]]) o2.box([lx - 0.2, lo - ty - 0.3, lz - 0.2], [lx + 0.2, 0.9, lz + 0.2], granite);
            o2.blob([0, 1.0, 0], [1.3, 0.22, 1.0], granite, { detail: 1, jitter: 0.1, seed: 5600 + k });
            for (let j = 0; j < 3; j++) o2.blob([(j - 1) * 0.4, 1.25, (j % 2) * 0.2], [0.05, 0.05, 0.32], bone, { detail: 0, jitter: 0.1, seed: 5610 + k * 3 + j });
          }, { solid: true });
        }
        P('skull_pile', ...at(0, -1), 1); P('gnawed_bones', ...at(1.6, 0.8), 1);
        for (const [lx, lz, h] of [[-5, -2.5, 3.6], [5.2, -1.6, 4.2], [-1.6, -5.6, 4.8], [2.4, -5.2, 3.4]]) { const [sx, sz] = at(lx, lz), sy = H(sx, sz);   // (the standing stones)
          b.place(sx, low(sx, sz, 0.6) - 0.5, sz, rnd() * 6, 1, (o2) => o2.blob([0, h / 2, 0], [0.55, h / 2 + 0.2, 0.4], granite, { detail: 1, jitter: 0.12, seed: 5620 + lx }), { solid: true, tag: 'rock' }); }
        cairn(...at(-3.4, 2), 6, 1.1); cairn(...at(3.6, 1.6), 5);
        chest('chest_domed_gothic', ...at(0, -3.2), F.yaw, "The Sky-Dead's Goods");
        o.dead = [at(-1.4, 0.4), at(1.2, -0.2)]; o.deadStart = 'playdead';
        break;
      }
      // The Hermit's Overhang. Who: Brannoc, who walked away from the Wardens twenty years ago. Since:
      // he's still here, and talks to anyone who comes. Job: rest, a voice. First view: the rock hanging
      // over his lean-to, his fire. Leave: its path.
      case 'hermit': {
        const [hx, hz] = at(0, -o.r0 + 2.4), hy = H(hx, hz);
        b.place(hx, hy - 0.4, hz, F.yaw, 1, (o2) => { o2.blob([0, 3.2, -1.2], [3.6, 1.0, 2.8], granite, { detail: 2, jitter: 0.14, seed: 5700 }); o2.blob([0, 1.6, -2.8], [3.4, 2.4, 1.2], granite, { detail: 2, jitter: 0.16, seed: 5701 }); }, { solid: true, tag: 'rock' });
        P('hide_bedroll', ...at(-1.2, -o.r0 + 3.2), 1, F.yaw + 1.4); fire(...at(0.6, -1.4), 0.8); P('water_barrel', ...at(2, -o.r0 + 3), 0.8);
        { const [rx, rz] = at(-2.4, -0.6), ry = H(rx, rz);   // herbs hung to dry
          b.place(rx, ry, rz, F.yaw, 1, (o2) => { for (const s of [-1, 1]) o2.box([s * 0.9 - 0.04, 0, -0.04], [s * 0.9 + 0.04, 1.6, 0.04], wood); o2.box([-1, 1.55, -0.03], [1, 1.62, 0.03], wood);
            for (let k = 0; k < 6; k++) o2.box([-0.8 + k * 0.32, 1.1, -0.04], [-0.68 + k * 0.32, 1.55, 0.04], cloth(0x5a7040)); }, { solid: true }); }
        const [px, pz] = at(1.2, -0.4);
        S.givers = Object.assign(S.givers || {}, { Brannoc: { key: 'mtHermit', post: [px, pz, F.yaw], floor: H(px, pz) } });
        break;
      }
      // The Warm Spring. Who: the mountain's own fire, far down. Since: Hornhollow bathes here at
      // midwinter. Job: rest (it heals you while you stand in it). First view: steam off the water among
      // the stones. Leave: its path.
      case 'spring': {
        const r = 3.4, wm = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x2c4c54, specular: 0x9ac8d0, shininess: 90, emissive: 0x06141a, transparent: true, opacity: 0.86, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        wm.position.set(o.x, y + 0.12, o.z); ctx.scene.add(wm);
        for (let k = 0; k < 16; k++) { const a = k / 16 * TAU + rnd() * 0.2, rr = r + 0.3 + rnd() * 0.5, [sx, sz] = [o.x + Math.cos(a) * rr, o.z + Math.sin(a) * rr], s = 0.4 + rnd() * 0.5;
          b.place(sx, H(sx, sz) - 0.15, sz, rnd() * 6, 1, (o2) => o2.blob([0, s * 0.4, 0], [s * 1.2, s * 0.6, s], granite, { detail: 1, jitter: 0.2, seed: 5800 + k }), { solid: false }); }
        for (let k = 0; k < 4; k++) ctx.chimneys?.push([o.x + Math.cos(k * 1.7) * 1.5, y + 0.5, o.z + Math.sin(k * 1.7) * 1.5]);
        const [bx, bz] = at(0, r + 1.6); b.place(bx, H(bx, bz), bz, F.yaw + Math.PI / 2, 1, (o2) => { o2.box([-1.2, 0.4, -0.25], [1.2, 0.5, 0.25], plank); for (const s of [-1, 1]) o2.box([s * 1.0 - 0.08, 0, -0.2], [s * 1.0 + 0.08, 0.4, 0.2], plank); }, { solid: false });
        S.warmSpring = { x: o.x, z: o.z, y, r: r - 0.3 };
        break;
      }
      // The Roofless Chapel. Who: the first Wardens, for their dead. Since: the roof's gone; the Wardens
      // buried there don't rest. Job: fight (they come up out of the floor), then the captain's tomb.
      // First view: the broken gable against the slope, the door gap. Leave: by the door the way you came.
      case 'chapel': {
        const w = 3.2, l = 5.2, C = (lx, lz) => at(lx, lz);
        const corners = [C(-w, l * 0.6), C(w, l * 0.6), C(w, -l), C(-w, -l)];
        wall(...corners[0], ...C(-0.9, l * 0.6), 2.2, pale, { ruin: 0.5 }); wall(...C(0.9, l * 0.6), ...corners[1], 2.4, pale, { ruin: 0.5 });
        wall(...corners[1], ...corners[2], 3.0, pale, { ruin: 0.6 }); wall(...corners[2], ...corners[3], 3.6, pale, { ruin: 0.3 }); wall(...corners[3], ...corners[0], 2.8, pale, { ruin: 0.6 });
        { const [ax, az] = C(0, -l + 1.2), ay = H(ax, az); b.place(ax, ay - 0.1, az, F.yaw, 1, (o2) => { o2.box([-1, 0, -0.4], [1, 1.0, 0.4], pale); o2.box([-1.15, 1.0, -0.5], [1.15, 1.12, 0.5], pale); }, { solid: true }); }
        { const [gx, gz] = C(0, -l), gy = H(gx, gz); b.place(gx, gy - 0.3, gz, F.yaw, 1, (o2) => {   // (its gable end standing, a bell-cote on it, the bell long gone)
          o2.box([-2.2, 0, -0.35], [2.2, 4.4, 0.35], pale); o2.box([-1.4, 4.4, -0.35], [1.4, 5.4, 0.35], pale); o2.box([-0.8, 5.4, -0.35], [0.8, 6.6, 0.35], pale);
          o2.box([-0.42, 5.55, -0.4], [0.42, 6.3, 0.4], dark); o2.cone(0, 0, 0.9, 6.6, 0.8, 4, pale); }, { solid: true }); }
        chest('chest_domed_gothic', ...C(0, -l + 2.6), F.yaw, "The Warden-Captain's Tomb");
        for (const [lx, lz] of [[-1.8, -1.5], [1.8, -1.5], [-1.8, 1], [1.8, 1]]) P(rnd() < 0.5 ? 'broken_headstone' : 'rounded_headstone', ...C(lx, lz), 1, F.yaw + Math.PI);
        { const [cx, cz] = C(-2.2, -l + 1); P('candle', cx, cz, 1); ctx.flames.push([cx, H(cx, cz) + 0.3, cz, 0.06, 1]); }
        o.dead = [C(-1.8, -1.5), C(1.8, -1.5), C(-1.8, 1)]; o.deadStart = 'buried';
        break;
      }
      // The Field of Cairns. Who: every pilgrim who made it this far raised a stone. Since: hundreds of
      // them. Job: spectacle, rest; the view back down the mountain. First view: the cairns, flags
      // between them, the drop beyond. Leave: its path.
      case 'cairns': {
        for (let k = 0; k < 26; k++) { const a = rnd() * TAU, rr = 1.5 + Math.sqrt(rnd()) * (o.r0 - 1.5), [cx, cz] = [o.x + Math.cos(a) * rr, o.z + Math.sin(a) * rr];
          if (Math.hypot(cx - F.at(0, o.r0 - 1)[0], cz - F.at(0, o.r0 - 1)[1]) < 2.2) continue;   // (the way in clear)
          cairn(cx, cz, 3 + Math.floor(rnd() * 5), 0.8 + rnd() * 0.6); }
        flags(...at(-4, 1), ...at(3.5, -3), 2.4); flags(...at(-3, -4), ...at(4, 2.5), 2.2);
        P('sacks', ...at(0.5, 0.5), 0.6);
        break;
      }
      // The Old Beacon. Who: the Wardens, to call Greywatch when the goat men came. Since: unlit for
      // years; you can see the whole road from it. Job: spectacle, a reward up on its platform. First
      // view: the drum of stone, its iron basket. Leave: down its steps, its path.
      case 'beacon': {
        { const [tx, tz] = at(0, -4.8), ty = low(tx, tz, 1.5), style = (S.beacons || []).length % 4, basket = (o2, y0) => { for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; o2.beam([Math.cos(a) * 0.5, y0, Math.sin(a) * 0.5], [Math.cos(a) * 0.85, y0 + 1, Math.sin(a) * 0.85], 0.06, 0.06, dark); } };
          const tops = [7.3, 5.6, 5.4, 8.0], top = tops[style];
          b.place(tx, ty - 0.3, tz, F.yaw, 1, (o2) => {
            if (style === 0) { o2.box([-1.2, 0, -1.2], [1.2, 7.0, 1.2], fieldWall); o2.box([-1.4, 7.0, -1.4], [1.4, 7.3, 1.4], pale); }           // (a square tower of fieldstone)
            else if (style === 1) { for (let k = 0; k < 6; k++) o2.blob([Math.sin(k * 2.1) * 0.15, 0.3 + k * 0.42, Math.cos(k * 2.1) * 0.12], [1.5 - k * 0.18, 0.34, 1.35 - k * 0.16], granite, { detail: 1, jitter: 0.2, seed: 5700 + k });   // (a great cairn,
              o2.box([-0.08, 2.0, -0.08], [0.08, 5.65, 0.08], dark); }                                                                         // an iron post up out of it)
            else if (style === 2) { for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; o2.beam([Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2], [0, 7.4, 0], 0.18, 0.18, wood); }   // (a tall tripod of timbers,
              for (let k = 0; k < 3; k++) { const a = (k + 0.5) / 3 * TAU; o2.beam([0, 7.2, 0], [Math.cos(a) * 0.7, top + 1, Math.sin(a) * 0.7], 0.03, 0.03, dark); } }   // its basket hung on chains under the head)
            else { o2.cylinder([0, 0, 0], [0, 7.7, 0], 1.4, 12, fieldWall); o2.cylinder([0, 7.7, 0], [0, 8.0, 0], 1.6, 12, pale); }   // (a round tower)
            basket(o2, top);
          }, { solid: true });
          (S.beacons ||= []).push({ id: o.id, name: o.name, x: tx, z: tz, y: ty, top: ty - 0.3 + top + 0.3, lit: false });
          if (style > 0) { chest('chest_gilded_iron', ...at(1.9, -2.4), F.yaw, `${o.name.replace(/^The /, '')} Keeper's Chest`); P('brazier', ...at(-1.8, -2.6), 1.2); break; } }   // (only the Old Beacon has a pen)
        const [bx, bz] = at(0, -1.5), by = H(bx, bz), top = by + 1.4, af = Math.atan2(F.fz, F.fx);
        for (let k = 0; k < 12; k++) { const a0 = k / 12 * TAU, a1 = (k + 1) / 12 * TAU, r = 2.4;
          if (Math.abs(Math.atan2(Math.sin((a0 + a1) / 2 - af), Math.cos((a0 + a1) / 2 - af))) < 0.3) continue;   // (the gap its steps come up through)
          wall(bx + Math.cos(a0) * r, bz + Math.sin(a0) * r, bx + Math.cos(a1) * r, bz + Math.sin(a1) * r, 2.0 + (k % 3 === 0 ? 0.6 : 0), fieldWall, { t: 0.7 }); }
        b.place(bx, top - 0.15, bz, 0, 1, (o2) => o2.cylinder([0, 0, 0], [0, 0.25, 0], 2.6, 12, pale), { solid: false });
        physics.add([bx - 2.3, by, bz - 2.3], [bx + 2.3, top + 0.1, bz + 2.3], 'floor');
        { const [sx, sz] = at(0, 2.8); b.stairs(sx, sz, by, 1.4, 1.2, Math.abs(F.fx) > Math.abs(F.fz) ? (F.fx > 0 ? '-x' : '+x') : (F.fz > 0 ? '-z' : '+z'), pale, { step: 0.25, run: 0.32 }); }
        P('brazier', bx, bz, 1.6); ctx.props?.add('chest_gilded_iron', bx + 1.2, top + 0.1, bz, F.yaw, 1); (S.chests ||= []).push({ id: 'chest_gilded_iron', x: bx + 1.2, z: bz, name: `${o.name.replace(/^The /, '')} Keeper's Chest`, charm: null });
        break;
      }
    }
  }

  // ---- each place's back: the stone fallen from the bank behind it (never on its path); its path's end
  // spread out on the shelf into trodden ground (an apron, laid but not a way of its own)
  const aprons = [];
  for (const o of S.outposts || []) {
    const ua = Math.atan2(o.uz, o.ux);
    for (let k = 0; k < 14; k++) {
      const a = ua + (rnd() - 0.5) * 2.6, rr = o.r0 + 0.6 + rnd() * 2, x = o.x + Math.cos(a) * rr, z = o.z + Math.sin(a) * rr, s = 0.35 + rnd() * rnd() * 1.1;
      if (o.path.pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 3 + s)) continue;
      b.place(x, low(x, z, s) - s * 0.35, z, rnd() * 6, 1, (o2) => o2.blob([0, s * 0.45, 0], [s * 1.2, s * 0.75, s], granite, { detail: s > 0.6 ? 1 : 0, jitter: 0.22, seed: 6600 + k }), { solid: s > 0.8, tag: 'rock' });
    }
    const P = o.path.pts, [ex, ez] = P[P.length - 1], dx = o.x - ex, dz = o.z - ez, L = Math.hypot(dx, dz) || 1;
    aprons.push({ pts: [[ex - dx / L * 2, ez - dz / L * 2], [ex + dx / L * Math.min(6, L * 0.6), ez + dz / L * Math.min(6, L * 0.6)]], half: 2.3, fray: 1.1, seed: 700 + aprons.length, spill: 0.6, step: 1, wander: 0.5 });
  }
  if (aprons.length) { const m = layRoads(ctx, ctx.lib, 'trail', aprons, { heightAt: (x, z) => H(x, z), lift: 0.08, order: 2 }); if (m) (S.trailMeshes ||= []).push(m); }

  // ---- the graves beside the road: a low heap of earth and stones, a stick cross or a cairn at its head
  for (const P2 of S.risers || []) for (const [gx, gz, yaw] of P2.graves) {
    const gy = H(gx, gz);
    b.place(gx, gy - 0.12, gz, yaw, 1, (o2) => {
      o2.blob([0, 0.12, 0], [0.55, 0.22, 1.05], earth, { detail: 1, jitter: 0.18, seed: 6000 + Math.floor(gx) });
      for (let k = 0; k < 5; k++) o2.blob([(rnd() - 0.5) * 0.9, 0.2, (rnd() - 0.5) * 1.8], [0.12 + rnd() * 0.1, 0.08, 0.12], stone, { detail: 0, jitter: 0.3, seed: 6010 + k });
      if (rnd() < 0.65) { o2.box([-0.04, 0, 0.95], [0.04, 1.45, 1.03], wood); o2.box([-0.32, 1.0, 0.95], [0.32, 1.08, 1.03], wood); o2.box([0.06, 0.62, 0.99], [0.12, 1.0, 1.0], cloth(0x6a5a48)); }
      else if (rnd() < 0.3) { o2.beam([0.3, 0, 0.4], [0.42, 1.1, 0.5], 0.05, 0.05, wood); o2.box([0.2, -0.05, 0.32], [0.42, 0.25, 0.36], M('castle_basalt', 1, { tint: 0x5a5650 })); }
      else for (let k = 0; k < 4; k++) o2.blob([0, 0.12 + k * 0.16, 1.0], [0.2 - k * 0.03, 0.09, 0.17 - k * 0.03], stone, { detail: 0, jitter: 0.25, seed: 6020 + k });
    }, { solid: false });
  }

  // ---- the goat men's ledges: a shelf of rock for each to stand on, a ram's skull on a stake to warn you
  const ledgeFace = M('rock_08_mountain_alpine_granite_3_01', 3.5, { tint: 0xa8a6a0, tri: true });
  for (const A of S.goatAmbushes || []) {
    A.standY = [];
    { const P2 = A.spots.map(([x, z]) => [x - A.ux * 1.8, z - A.uz * 1.8, H(x, z) + 0.35]).sort((p, q) => (p[0] - q[0]) * A.uz - (p[1] - q[1]) * A.ux);
      for (let k = 0; k + 1 < P2.length; k++) { const [ax, az, ay] = P2[k], [cx, cz, cy] = P2[k + 1], ab = H(ax - A.ux * 2.5, az - A.uz * 2.5) - 1, cb = H(cx - A.ux * 2.5, cz - A.uz * 2.5) - 1;
        const out = (cx - ax) * -A.uz - (cz - az) * -A.ux > 0;   // (wound to face the road)
        if (out) b.quad(ledgeFace, [ax, ab, az], [cx, cb, cz], [cx, cy, cz], [ax, ay, az], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        else b.quad(ledgeFace, [cx, cb, cz], [ax, ab, az], [ax, ay, az], [cx, cy, cz], [[1, 0], [0, 0], [0, 1], [1, 1]]); } }
    A.spots.forEach(([x, z], k) => {
      const y = H(x, z);
      b.place(x, low(x, z, 1.3) - 0.5, z, rnd() * 6, 1, (o2) => o2.blob([0, 0.5, 0], [1.5, Math.max(0.5, y - low(x, z, 1.3) + 0.5), 1.3], granite, { detail: 1, jitter: 0.12, seed: 6100 + k }), { solid: true, tag: 'rock' });
      A.standY.push(y + 0.4);
      if (k === 0) { const sx = x - A.ux * 1.6, sz = z - A.uz * 1.6, sy = H(sx, sz);
        b.place(sx, sy, sz, Math.atan2(-A.ux, -A.uz), 1.5, (o2) => { o2.box([-0.07, 0, -0.07], [0.07, 2.2, 0.07], wood); o2.blob([0, 2.35, 0.06], [0.26, 0.3, 0.36], bone, { detail: 1, jitter: 0.06, seed: 6150 });
          for (const s of [-1, 1]) o2.beam([s * 0.16, 2.5, 0], [s * 0.42, 2.66, -0.12], 0.1, 0.07, bone); }, { solid: false }); }
      else if (k === 1) P('gnawed_bones', x, z, 0.8);
    });
  }

  // ---- the sheer drops: where the road's outer edge breaks off, a face of rock straight down (the
  // ground's grid can't stand up that steep: the face is its own), its lip ragged, loose stones on it
  buildCliffs(ctx, S, M, rnd);

  // ---- loose stone along every way: the road, the paths, the short paths (one instanced mesh a shape)
  liningStones(ctx, S, rnd);

  // ---- grass and heather along the paths, as along the road
  const tufts = ctx.lib.sprites ? ctx.lib.sprites('scatter', (s) => /fern|wildflowers|dry_reeds|thorn_bush|heather|leafy_shrub/.test(s.id)) : [];
  if (tufts.length) for (const t of S.trails) for (let i = 1; i < t.pts.length - 1; i += 2) {
    const [x, z] = t.pts[i], [x2, z2] = t.pts[i + 1], ux = x2 - x, uz = z2 - z, L = Math.hypot(ux, uz) || 1;
    for (const side of [-1, 1]) { if (rnd() < 0.5) continue;
      const off = t.w + 0.5 + rnd() * 1.8, px = x + (-uz / L) * off * side, pz = z + (ux / L) * off * side;
      if (S.heightAt(px, pz) > 330 || S.slopeAt(px, pz) > 0.6) continue;
      ctx.bill.add(tufts[Math.floor(rnd() * tufts.length)].id, px, H(px, pz), pz, 0.5 + rnd() * 0.4, 0.8 + rnd() * 0.3); }
  }

  // ---- the folk walking the road: each a stretch of it (villagers.js travel), starting at its foot
  S.walkers = WALKERS.map(([name, f0, f1], k) => {
    const from = Math.floor(N * f0), to = Math.floor(N * f1), [x, z, y] = R[from], [x2, z2] = R[from + 1], key = 'mtWalk' + k;
    S.givers = Object.assign(S.givers || {}, { [name]: { key, post: [x, z, Math.atan2(x2 - x, z2 - z)], floor: y } });
    return { key, name, from, to };
  });

  // ---- the scree chutes: their gullies laid in scree (the trail's loose stone, wide), a cairn at the top of each
  if (S.chutes?.length) {
    const lines = S.chutes.map((c, k) => ({ pts: [c.a, c.b].map(([x, z]) => [x, z]), half: c.w * 0.75, fray: 0.9, seed: 500 + k, spill: 0.3, step: 1.2, wander: 0.3 }));
    const m = layRoads(ctx, ctx.lib, 'mountain', lines, { heightAt: (x, z) => H(x, z), lift: 0.07, order: 2 });
    if (m) (S.trailMeshes ||= []).push(m);
    // (beside its top, but its top is on the road: the first of a few places either side clear of every way)
    const inLane = laneIndex(ctx.paths);
    for (const c of S.chutes) {
      const ux = c.b[0] - c.a[0], uz = c.b[1] - c.a[1], L = Math.hypot(ux, uz), at = ([s, f]) => [c.a[0] - uz / L * s + ux / L * f, c.a[1] + ux / L * s + uz / L * f];
      const spots = [[4.2, 2], [-4.2, 2], [5.2, 3.5], [-5.2, 3.5], [6.5, 5], [-6.5, 5]].map(at), [cx, cz] = spots.find(([x, z]) => !inLane(x, z, 1.4)) || spots.at(-1);
      cairn(cx, cz, 8, 1.6);
      { const fx = cx + ux / L * 0.9, fz = cz + uz / L * 0.9; b.place(fx, H(fx, fz), fz, Math.atan2(ux, uz), 1, (o2) => { o2.box([-0.04, 0, -0.04], [0.04, 2.9, 0.04], wood); o2.box([0.04, 2.2, -0.02], [0.85, 2.8, 0.02], cloth(0x9a3a28)); }, { solid: false }); }   // (a rag on a pole: seen from the road)
    }
  }
  // ---- the beacons' fire: hidden till lit (S.act), seen across the mountain at night
  if (S.beacons?.length) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    { const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); for (const [t, c] of [[0, '255,230,180,1'], [0.12, '255,170,70,0.7'], [0.3, '255,120,40,0.24'], [0.6, '255,90,20,0.05'], [1, '255,90,20,0']]) gr.addColorStop(t, `rgba(${c})`); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
    const fv = document.createElement('canvas'); fv.width = 32; fv.height = 64;   // (a tongue of flame: white-hot at its root, ragged to a point)
    { const g = fv.getContext('2d'); for (let y = 0; y < 64; y++) { const u = y / 63, w = 15 * Math.sin(Math.PI * Math.min(1, (1 - u) * 1.15)) ** 0.8 * (0.35 + 0.65 * u), a = Math.min(1, u * 1.6) * (1 - 0.2 * u);
        const gr = g.createLinearGradient(16 - w, 0, 16 + w, 0); gr.addColorStop(0, 'rgba(255,90,10,0)'); gr.addColorStop(0.5, `rgba(255,${Math.round(150 + 90 * u)},${Math.round(40 + 140 * u)},${a.toFixed(3)})`); gr.addColorStop(1, 'rgba(255,90,10,0)');
        g.fillStyle = gr; g.fillRect(16 - w, y, w * 2, 1); } }
    const flameTex = new THREE.CanvasTexture(fv);
    const glowTex = new THREE.CanvasTexture(cv), fireM = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const B of S.beacons) {
      const g = new THREE.Group(); g.position.set(B.x, B.top, B.z);
      for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(1.1 - k * 0.2, 2.6 + k * 0.9, 7, 1, true), fireM); c.position.y = 1.0 + k * 0.25; c.rotation.y = k; g.add(c); }
      // (its flames: two tall tongues of fire, always facing you)
      B.flames = [[2.4, 5.6, 2.9], [1.5, 3.8, 2.2]].map(([w, h, y]) => { const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        f.scale.set(w, h, 1); f.position.y = y; f.userData.wh = [w, h]; g.add(f); return f; });
      // (its glow through the fog: seen across the mountain, from the plain at night; soft, or the night's
      // exposure makes a hard orange sun of it)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa050, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      glow.scale.setScalar(11); glow.position.y = 2.0; g.add(glow); B.glow = glow;
      g.visible = false; ctx.scene.add(g); B.fire = g;
    }
  }
  /** Near a sheer drop's lip? { ox, oz (off the mountain), d (metres to the lip) }, else null (main.js's
   * shove and foes.js's ram send what's by the lip over it). */
  S.edgeOut = (x, z) => {
    const r = S.roadAt(x, z);
    if (!r || !S.brinks.has(r.i)) return null;
    const [ax, az] = R[r.i], [bx, bz] = R[Math.min(N - 1, r.i + 1)], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    let ox = dz / L, oz = -dx / L;
    if (ox * (ax - K.MOUNT.x) + oz * (az - K.MOUNT.z) < 0) { ox = -ox; oz = -oz; }
    return { ox, oz, d: K.ROAD_W + 0.55 - ((x - ax) * ox + (z - az) * oz) };
  };
  /** E at an unlit beacon (main.js: S.prompt): it's lit, and when the last of them burns, the Wardens know. */
  S.act = ({ toast, reward } = {}) => {
    const B = S.nearBeacon;
    if (!B || B.lit) return;
    B.lit = true; B.fire.visible = true;
    B.fire.traverse((q) => { q.matrixAutoUpdate = true; }); B.fire.updateMatrixWorld(true);   // (hidden before play, its matrices were never worked out: engine.js visibleMatrices)
    (ctx.witchLights ||= []).push(Object.assign([B.x, B.top + 2.2, B.z, 0.3, true], { color: 0xff9a40, witch: true, range: 24, power: 8 }));   // (its light on the stone round it: main's light pool)
    ctx.smoke?.addEmitter(B.x, B.top + 4.5, B.z, 4);   // (and its smoke up into the sky: main.js hands the smoke over)
    const n = S.beacons.filter((q) => q.lit).length, all = n === S.beacons.length;
    toast?.(all ? "Every beacon on the Sorrowhorn burns. Greywatch will see them, and the goat men too." : `${B.name} burns. ${n} of ${S.beacons.length} alight.`);
    reward?.({ xp: 60, title: B.name });
    if (all) reward?.({ xp: 400, gold: 200, title: "The beacons of the Sorrowhorn" });
  };

  // ---- each frame: the graves give up their dead when you come by; the warm spring heals you
  S.updateLife = (dt, player, t, audio, o = {}) => {
    const p = player.pos;
    for (const G of S.risers || []) {
      if (!G.sprung && G.list?.length && Math.hypot(p.x - G.x, p.z - G.z) < G.r && Math.abs(p.y - G.y) < 4) {
        G.sprung = true;
        G.wake = G.list.filter((z) => !z.dead && z.state === 'buried').map((z, k) => [z, t + 0.15 + k * 0.3]);
        if (!S.gravesTold) { S.gravesTold = true; o.toast?.('The dead the road took claw their way up out of their graves.'); }
        audio?.roar?.();
      }
      if (G.wake?.length) G.wake = G.wake.filter(([z, when]) => { if (t < when) return true; if (!z.dead && z.state === 'buried') { z.wake(p, 1.8); z.rush = 12; } return false; });
    }
    // a beacon within reach (E lights it: S.act); the lit ones flicker
    S.prompt = null; S.nearBeacon = null;
    for (const B of S.beacons || []) {
      if (!B.lit && Math.hypot(p.x - B.x, p.z - B.z) < 4.2 && Math.abs(p.y - B.y) < 3) { S.prompt = `E — light ${B.name.replace(/^The /, 'the ')}`; S.nearBeacon = B; }
      if (B.lit && B.fire) {
        B.fire.children.forEach((c, k) => { if (!c.isSprite) c.scale.set(1 + Math.sin(t * 7 + k) * 0.08, 1 + Math.sin(t * 11 + k * 2) * 0.18, 1 + Math.cos(t * 8 + k) * 0.08); });
        const far = Math.max(1, Math.hypot(p.x - B.x, p.y - B.top, p.z - B.z) / 90);   // (past 90 m, as big on the screen as at 90)
        B.flames?.forEach((f, k) => { const [w, h] = f.userData.wh; f.scale.set(w * far * (1 + Math.sin(t * 9 + k * 3) * 0.08), h * far * (1 + Math.sin(t * 13 + k) * 0.12), 1); });
        B.glow?.scale.setScalar(11 * far * (1 + Math.sin(t * 7.3) * 0.05));
        B.fire.updateMatrixWorld(true); }
    }
    // the top of a scree chute: how to ride it, told once
    for (const c of S.chutes || []) if (!S.chuteTold && Math.hypot(p.x - c.a[0], p.z - c.a[1]) < 5) { S.chuteTold = true; o.toast?.('A scree chute drops from here to the road below. Jump and keep Space held to ride it down on your shield.'); }
    const W = S.warmSpring;
    if (W && Math.hypot(p.x - W.x, p.z - W.z) < W.r && Math.abs(p.y - W.y) < 1.5 && player.health < player.maxHealth) {
      player.health = Math.min(player.maxHealth, player.health + dt * 6);
      if (!W.told) { W.told = true; o.toast?.('The warm water eases your hurts.'); }
    }
  };
}

/** The faces of the sheer drops along the road's outer edge (S.brinks: runs of road segments). */
function buildCliffs(ctx, S, M, rnd) {
  const R = S.road, H = (x, z) => S.heightAt(x, z), b = ctx.b;
  const face = M('rock_08_mountain_alpine_granite_3_01', 3.5, { tint: 0xa4a29c, tri: true }), face2 = M('cliff_07_coarse_gravel_11_01', 3.8, { tint: 0xa8a49c, tri: true }), post = M('ship_01_tarblack_oak', 1, { tint: 0x8a7a68 });
  const idx = [...S.brinks].sort((a, c) => a - c), runs = [];
  for (const i of idx) { const r = runs[runs.length - 1]; if (r && i - r[r.length - 1] <= 2) r.push(i); else runs.push([i]); }
  let n = 0;
  for (const run of runs) {
    const first = run[0], last = Math.min(R.length - 2, run[run.length - 1] + 1), pts = [];
    let acc = 0;   // (how far along the run: the faces' pictures in metres, never one stretched down a whole face)
    for (let i = first; i <= last; i++) {
      const [x, z, y] = R[i], [px, pz] = R[Math.max(0, i - 1)], [qx, qz] = R[Math.min(R.length - 1, i + 1)], dx = qx - px, dz = qz - pz, L = Math.hypot(dx, dz) || 1;
      let ox = dz / L, oz = -dx / L;
      if (ox * (x - K.MOUNT.x) + oz * (z - K.MOUNT.z) < 0) { ox = -ox; oz = -oz; }   // (outward, off the mountain)
      const e = K.ROAD_W + 0.55 + (rnd() - 0.5) * 0.35, ex = x + ox * e, ez = z + oz * e;
      const top = y - 0.1 - rnd() * 0.3, bottom = Math.min(H(x + ox * 7, z + oz * 7), H(ex, ez)) - 7;   // (its lip just under the road's edge, broken; its foot buried deep)
      const prev = pts[pts.length - 1]; if (prev) acc += Math.hypot(ex - prev.x, ez - prev.z);
      pts.push({ x: ex, z: ez, top, bottom, ox, oz, ry: y, s: acc, cx: x, cz: z });
    }
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], c = pts[k + 1], m = k % 3 ? face : face2;
      // the face, a little bellied, in two bands so it isn't one flat sheet
      // (wound to face out, off the mountain: the road sees over its lip, never its back)
      const j = (p, k2) => (Math.sin(p.x * 1.7 + p.z * 0.9 + k2) * 0.5 + 0.5) * 0.9 - 0.2;   // (the face in and out along it: a jagged wall, not a sheet)
      const mid = (p) => [p.x + p.ox * (0.35 + j(p, 1)), (p.top + p.bottom) / 2, p.z + p.oz * (0.35 + j(p, 1))], out = (c.x - a.x) * a.oz - (c.z - a.z) * a.ox > 0;
      const band = (p0, p1, q1, q0) => { const uv = [[a.s, p0[1]], [c.s, p1[1]], [c.s, q1[1]], [a.s, q0[1]]];
        return out ? b.quad(m, p0, p1, q1, q0, uv) : b.quad(m, p1, p0, q0, q1, [uv[1], uv[0], uv[3], uv[2]]); };
      band(mid(a), mid(c), [c.x, c.top, c.z], [a.x, a.top, a.z]);
      { const ia = [a.cx, a.ry - 0.12, a.cz], ic = [c.cx, c.ry - 0.12, c.cz], oa = [a.x, a.top, a.z], oc = [c.x, c.top, c.z];   // (its lip, from under the road's middle: the ground sags below it, and the road's frayed edge is see-through)
        if (out) b.quad(face2, oa, oc, ic, ia, [[a.s, 0], [c.s, 0], [c.s, 4], [a.s, 4]]); else b.quad(face2, oc, oa, ia, ic, [[c.s, 0], [a.s, 0], [a.s, 4], [c.s, 4]]); }
      band([a.x + a.ox * 0.15, a.bottom, a.z + a.oz * 0.15], [c.x + c.ox * 0.15, c.bottom, c.z + c.oz * 0.15], mid(c), mid(a));
      // loose stones at the lip, now and then a jut of rock out of the face
      for (let q = 0, nq = 1 + (rnd() < 0.5 ? 1 : 0); q < nq; q++) { const s = 0.16 + rnd() * 0.3, f = rnd(), w = 0.2 + rnd() * 0.4, sx = a.x + (c.x - a.x) * f - a.ox * w, sz = a.z + (c.z - a.z) * f - a.oz * w;
        b.place(sx, a.top - 0.05, sz, rnd() * 6, 1, (o) => o.blob([0, s * 0.4, 0], [s * 1.2, s * 0.6, s], face2, { detail: 0, jitter: 0.3, seed: 6300 + k * 2 + q }), { solid: false }); }
      if (rnd() < 0.25) { const s = 0.6 + rnd() * 1.0, t = 0.3 + rnd() * 0.5, jy = a.top + (a.bottom - a.top) * t; b.place(a.x + a.ox * 0.4, jy, a.z + a.oz * 0.4, rnd() * 6, 1, (o) => o.blob([0, 0, 0], [s, s * 0.7, s * 0.9], face, { detail: 1, jitter: 0.25, seed: 6400 + k }), { solid: false }); }
      // (what's fallen from it lies at its foot, so you can judge the drop; now and then a broken post at its lip)
      if (rnd() < 0.5) { const d = 3 + rnd() * 7, fx = a.x + a.ox * d, fz = a.z + a.oz * d, s = 0.5 + rnd() * 1.3; b.place(fx, H(fx, fz) - s * 0.3, fz, rnd() * 6, 1, (o) => o.blob([0, s * 0.45, 0], [s * 1.2, s * 0.8, s], face2, { detail: 1, jitter: 0.22, seed: 6500 + k }), { solid: false }); }
      if (rnd() < 0.08) { const px = a.x - a.ox * 0.25, pz = a.z - a.oz * 0.25, h = 0.5 + rnd() * 0.6; b.place(px, a.top - 0.1, pz, rnd() * 6, 1, (o) => { o.box([-0.06, 0, -0.06], [0.06, h, 0.06], post); if (rnd() < 0.5) o.beam([0, h - 0.1, 0], [0.9, h - 0.6, 0.4], 0.02, 0.02, post); }, { solid: false }); }
      n++;
    }
  }
  // (the road's gravel runs right out to the lip along each of them: no bank of turf between you and the drop)
  const verge = runs.map((run, k) => ({ pts: run.map((i) => { const [x, z] = R[i], [px, pz] = R[Math.max(0, i - 1)], [qx, qz] = R[Math.min(R.length - 1, i + 1)], dx = qx - px, dz = qz - pz, L = Math.hypot(dx, dz) || 1;
    let ox = dz / L, oz = -dx / L; if (ox * (x - K.MOUNT.x) + oz * (z - K.MOUNT.z) < 0) { ox = -ox; oz = -oz; } return [x + ox * (K.ROAD_W - 0.8), z + oz * (K.ROAD_W - 0.8)]; }), half: 1.25, fray: 0.25, seed: 300 + k, spill: 0, wander: 0.15 })).filter((l) => l.pts.length > 2);
  S.vergeMesh = layRoads(ctx, ctx.lib, 'mountain', verge, { heightAt: (x, z) => S.levelAt(x, z), lift: 0.07, order: 3 });
  S.cliffs = { runs: runs.length, faces: n };
}

/** Loose stone along the road and every path: both sides, in runs with gaps, small stones with now and
 * then a bigger one further out; never on the way itself, nor across a path where it leaves the road.
 * A few shapes of stone, each one instanced mesh per band of the mountain (moss low, granite, pale
 * alpine granite high). */
function liningStones(ctx, S, rnd) {
  const H = (x, z) => S.heightAt(x, z), lib = ctx.lib;
  const geos = Array.from({ length: 6 }, (_, v) => {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
    const h = (x, y, z) => { const s = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719 + v * 11.3) * 43758.5453; return s - Math.floor(s); };
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.78 + h(x, y, z) * 0.44; p.setXYZ(i, x * k * (1 + v * 0.06), y * k * (0.5 + (v % 3) * 0.08), z * k); }
    g.computeVertexNormals();
    return g;
  });
  const bands = [['rock_06_overworld_mossy_rock_1_03', 0xd0d0c0], ['rock_05_overworld_granite_1_02', 0xc4beb6], ['rock_08_mountain_alpine_granite_3_01', 0xd4d4d8]]
    .map(([id, tint]) => lib.material(id, { tile: 0.9, tint }));
  const band = (y) => (y < 170 ? 0 : y < 320 ? 1 : 2);
  const lists = new Map(), add = (v, bnd, big, m) => { const k = `${v}|${bnd}|${big}`; if (!lists.has(k)) lists.set(k, []); lists.get(k).push(m); };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const keep = TOUCH ? 0.45 : 1;
  const junctions = S.trails.map((t) => t.pts[0]).filter(Boolean);
  const nearJunction = (x, z) => junctions.some(([jx, jz]) => Math.hypot(jx - x, jz - z) < 3.4);
  const inLane = laneIndex(ctx.paths);   // (so a stone that would stand in the way of one isn't laid)
  const lines = [{ pts: S.road, half: 2.0, road: true }, ...S.trails.map((t) => ({ pts: t.pts, half: t.w * 0.7 + 0.1, road: false }))];
  let n = 0;
  for (const L of lines) {
    const pts = L.pts, step = L.road ? 1.25 : 1.5;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      for (let d = rnd() * step; d < len; d += step * (0.5 + rnd())) {
        const x = ax + tx * d, z = az + tz * d;
        for (const side of [-1, 1]) {
          // (in clumps along each side, with long gaps between: a noise along it, its own for each side)
          const gap = Math.sin((x + z) * 0.11 + side * 1.7) + Math.sin(x * 0.037 - z * 0.051 + side) * 0.8 + Math.sin((x - z) * 0.23 + side * 4.1) * 0.5;
          if (gap < -0.2 || rnd() > (L.road ? 0.36 : 0.28) * keep * Math.min(1, 0.4 + gap * 0.5)) continue;
          const r = rnd(), s = r < 0.8 ? 0.08 + rnd() * rnd() * 0.4 : r < 0.96 ? 0.38 + rnd() * 0.32 : 0.8 + rnd() * 0.55;
          const off = L.half + 0.3 + rnd() * rnd() * 2.7 + (s > 0.7 ? 0.9 : s > 0.36 ? 0.35 : 0);
          const px = x - tz * off * side, pz = z + tx * off * side;
          if (nearJunction(px, pz) || (s > 0.36 && inLane(px, pz, s))) continue;
          if (L.road) { const t = S.trailAt?.(px, pz); if ((t && t.d < t.w + 0.6) || S.spurNear?.(px, pz, 0.6)) continue; }
          else { const rr = S.roadAt(px, pz); if (rr && rr.d < 2.6) continue; }
          const y = H(px, pz);
          if (L.road && y < (pts[i][2] ?? y) - 0.8) continue;   // (past a drop's lip: none)
          if (S.chuteNear?.(px, pz, 0.5)) continue;              // (nor across a chute's mouth)
          _e.set((rnd() - 0.5) * 0.4, rnd() * 6.28, (rnd() - 0.5) * 0.4); _q.setFromEuler(_e);
          _m.compose(new THREE.Vector3(px, y - s * (0.3 + rnd() * 0.25), pz), _q, new THREE.Vector3(s * (0.9 + rnd() * 0.4), s, s * (0.9 + rnd() * 0.4)));   // (sunk a third to a half in)
          add(Math.floor(rnd() * geos.length), band(y), s > 0.7, _m.clone());
          if (s > 0.7) ctx.physics.add([px - s * 0.75, y - 0.2, pz - s * 0.75], [px + s * 0.75, y + s * 0.6, pz + s * 0.75], 'rock');
          // (a few small ones about a bigger one)
          if (s > 0.36 && rnd() < 0.75) for (let k = 0, nk = 2 + Math.floor(rnd() * 4); k < nk; k++) {
            const q = 0.08 + rnd() * 0.12, qx = px + (rnd() - 0.5) * s * 2.4, qz = pz + (rnd() - 0.5) * s * 2.4, qy = H(qx, qz);
            _e.set(0, rnd() * 6.28, 0); _q.setFromEuler(_e); _m.compose(new THREE.Vector3(qx, qy - q * 0.2, qz), _q, new THREE.Vector3(q, q, q));
            add(Math.floor(rnd() * geos.length), band(qy), false, _m.clone()); n++;
          }
          n++;
        }
      }
    }
  }
  // (each scree chute: loose stone all down its gully, bigger toward its foot and spread wider there; none in a way)
  for (const c of S.chutes || []) {
    const ux = c.b[0] - c.a[0], uz = c.b[1] - c.a[1], L = Math.hypot(ux, uz), nx = -uz / L, nz = ux / L;
    for (let k = 0, nk = Math.round(480 * keep); k < nk; k++) {
      const t = 0.05 + rnd() * 0.95, side = (rnd() - 0.5) * 2 * c.w * (0.8 + 0.6 * smooth(0.75, 1, t)), boulder = rnd() < 0.06 && Math.abs(side) > c.w * 0.5;
      const s = boulder ? 0.6 + rnd() * 0.7 : 0.09 + rnd() * rnd() * (0.28 + 0.45 * t), x = c.a[0] + ux * t + nx * side, z = c.a[1] + uz * t + nz * side;
      if (inLane(x, z, s) || (S.roadAt(x, z)?.d ?? 99) < K.ROAD_W + 0.5) continue;
      const y = H(x, z);
      _e.set((rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5); _q.setFromEuler(_e);
      _m.compose(new THREE.Vector3(x, y - s * (0.25 + rnd() * 0.2), z), _q, new THREE.Vector3(s * (1 + rnd() * 0.5), s * 0.8, s * (0.9 + rnd() * 0.4)));
      add(Math.floor(rnd() * geos.length), band(y), s > 0.5, _m.clone()); n++;
    }
  }
  const meshes = [];
  for (const [k, list] of lists) {
    const [v, bnd, big] = k.split('|'), im = new THREE.InstancedMesh(geos[+v], bands[+bnd], list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere?.();
    im.castShadow = big === 'true'; im.receiveShadow = true;
    ctx.scene.add(im); meshes.push(im);
  }
  S.lining = { stones: n, meshes: meshes.length };
}

// ------------------------------------------------------------------ who's in them
/** The dead under the graves (they rise together when you come by: S.updateLife) and in the places. */
export function lifeDead(zombies, S, { touch = false } = {}) {
  let n = 0;
  for (const G of S.risers || []) {
    G.list = [];
    for (const [gx, gz] of G.graves.filter((_, k) => !touch || k % 2 === 0)) {
      const zb = zombies.spawn(zombies.randomVariant('barrow'), gx, gz, { zone: 'wild', kind: 'lurker', start: 'buried' });
      zb.quick = 1.6; zb.band = 'roadgraves'; G.list.push(zb); n++;
    }
  }
  for (const o of S.outposts || []) for (const [x, z] of (o.dead || []).filter((_, k) => !touch || k % 2 === 0)) {
    const zb = zombies.spawn(zombies.randomVariant(o.kind === 'mine' ? 'cellars' : 'barrow'), x, z, { zone: 'wild', kind: 'lurker', start: o.deadStart || 'playdead' });
    zb.band = o.id; n++;
  }
  return n;
}

/** The goat men on their ledges (blind and deaf till you walk under them: reavers.js spring) and in their pens. */
export function lifeFoes(foes, S, { touch = false } = {}) {
  if (!foes.gltf.goat_a) return 0;
  let n = 0;
  for (const A of S.goatAmbushes || []) A.spots.forEach(([x, z], k) => {
    if (touch && k > 1) return;
    const f = foes.spawn(k === 0 && foes.gltf.goat_b ? 'goat_b' : 'goat_a', x, z, { zone: 'mountain', y: A.standY?.[k], area: { x, z, r: 1.5 } });
    if (!f) return;
    f.lurk = A; f.band = 'ambush'; f.yaw = Math.atan2(-A.ux, -A.uz); n++;
    f.hiding = true; f.root.visible = false;   // (unseen from the road, or from the lap above it: only the ram's skull warns you)
  });
  for (const o of S.outposts || []) if (o.goats) for (const f of foes.band(Array.from({ length: o.goats }, (_, k) => (k === 0 && foes.gltf.goat_b ? 'goat_b' : 'goat_a')), o.x, o.z, { zone: 'mountain', area: { x: o.x, z: o.z, r: o.r0 - 1 } })) { f.yaw = Math.random() * 6.28; f.band = o.id; n++; }
  return n;
}

// ------------------------------------------------------------------ the forest's mass
/** The forest across the slopes, away from the ways (the full trees, trees3d.js, stand where you pass
 * close): simple pines, a trunk and three tiers of needles shading lighter toward their tips, three
 * shapes, one instanced mesh each, each tree its own green; no shadows of their own. list: [[x, y, z, scale]] */
export function massForest(ctx, list) {
  if (!list.length) return null;
  const paint = (g, hex) => {
    const c = new THREE.Color(hex), p = g.attributes.position, col = new Float32Array(p.count * 3);
    g.computeBoundingBox(); const y0 = g.boundingBox.min.y, h = g.boundingBox.max.y - y0 || 1;
    for (let i = 0; i < p.count; i++) { const k = 0.78 + 0.42 * (p.getY(i) - y0) / h; col.set([c.r * k, c.g * k, c.b * k], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  const shapes = [0, 1, 2].map((v) => mergeGeometries([
    paint(new THREE.CylinderGeometry(0.14, 0.24, 3.0, 6).translate(0, 1.5, 0), 0x3a2c22),
    ...[[2.6, 3.0, 2.6], [2.25, 2.8, 4.3], [1.85, 2.6, 5.9], [1.4, 2.4, 7.4], [0.9, 2.2, 8.8]].map(([r, h, y], k) =>
      paint(new THREE.ConeGeometry(r * (1 + v * 0.06), h, 8, 1).translate(Math.sin(k * 2.3 + v) * 0.12, y, Math.cos(k * 1.9 + v) * 0.12).rotateY(k * 0.7 + v), [0x16301c, 0x1a3620, 0x1e3a24, 0x223e26, 0x28442a][k])),
  ], false));
  const mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 4, specular: 0x050505, flatShading: true });
  const lists = [[], [], []];
  let seed = 3131; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const t of list) lists[Math.floor(rnd() * 3)].push(t);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _y = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
  return lists.map((L, v) => {
    if (!L.length) return null;
    const im = new THREE.InstancedMesh(shapes[v], mat, L.length);
    L.forEach(([x, y, z, s], i) => {
      _q.setFromAxisAngle(_y, rnd() * 6.28);
      _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(s, s * (0.9 + rnd() * 0.4), s));
      im.setMatrixAt(i, _m);
      im.setColorAt(i, _c.setRGB(0.82 + rnd() * 0.3, 0.86 + rnd() * 0.26, 0.8 + rnd() * 0.24));
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere?.();
    im.castShadow = false; im.receiveShadow = true;
    ctx.scene.add(im);
    return im;
  });
}
