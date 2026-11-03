// The Sorrowhorn: the great mountain north-west of Bellmourn, behind the forest. From the village
// it is the wall of rock the forest backs onto; through the forest's north-west edge the only way
// up its first cliffs is the Broken Stair, a run of fallen ledges too far apart for one jump (the
// Wingbell's second jump makes it). Above, the foothills roll up to the massif, and the Pilgrims'
// Road climbs it at a steady grade, cut into its flank, once right round the mountain: past the
// views back over Bellmourn, to the shoulder on its far side where the last of the hill folk live,
// and up the horn to the summit.
//
// Intent (docs/DUNGEON_BUILDING.md, for a land rather than a room): the road is the spine, and you
// can always see the way on (it is cut into the slope above you and wears the same pale gravel);
// what leaves it (a cave, a ledge, a stream to its falls) is narrower, steeper and pays. The mountain
// gets older and harder as it climbs: grass and moss low down, grey granite and scree in the middle,
// pale alpine granite and old snow at the top.
//
// One heightfield (a 4 m grid) is both what you see and what you walk on: the mesh is drawn from its
// points and the ground's height is read off the same triangles, so feet never float or sink. The
// road is carved into it (a bench cut into the slope, its wall above, its edge below) and a gravel
// strip laid on top.
import * as THREE from 'three';
import { SHARP_GLSL } from './engine.js';
import { REGION } from './terrain.js';
import { Cave, caveNav } from './cave.js';
import { frameMouth } from './delves.js';
import { makeGear, makePotion } from './gear.js';
import { makeCharm } from './charms.js';
import { detailedHouse, houseMaterials } from './buildings.js';
import { WEBGPU, T as TSL, sharpGrad, untiled, untileMask, snoise, keyed, ref, settled } from './nodes.js';
import { buildHolds } from './holds.js';

export const MOUNT = { x: -1000, z: -1000, R: 860, peak: 480, name: 'The Sorrowhorn' };
export const GATE = { bearing: 225 * Math.PI / 180, r0: 300, r1: 305.5, h: 9, name: 'The Broken Stair' };
const G = 4;                                                  // the heightfield's grid step (m)
const BOX = { x0: -1920, z0: -1920, x1: -100, z1: -100 };     // its extent
const NX = Math.round((BOX.x1 - BOX.x0) / G) + 1, NZ = Math.round((BOX.z1 - BOX.z0) / G) + 1;
const ARC = [150 * Math.PI / 180, 300 * Math.PI / 180];       // the bearings (from the village) the mountain land spans
const SHOULDER = 380;                                          // where the road ends (the hill folk's shoulder)
const GRADE = 0.085;                                           // the road's climb
const ROAD_W = 3.4;                                            // half the road's bench
// the goat men's camps: how far along the road, and their names (each on a shelf cut into the slope
// above the road's inner edge, a short scramble up from it)
const CAMPS = [[0.1, "The Ram's Fold"], [0.36, 'Horncrag'], [0.62, 'The Butting Stones'], [0.86, "Gorehoof's Shelf"]];
// the caves, both where the road crosses the west flank (there "into the mountain" is east, as cave.js
// cuts them): a forecourt cut in the slope above the road's inner edge, its back wall the cliff the
// mouth is in. [how far along the road, name]
const CAVES = [[0.4205, "The Wether's Throat"], [0.938, 'The Glimmerdeep']];
// Sorrowfall: snowmelt off the high snowfields comes down a rill to a brink above the road and falls
// into the Still Water, a pool on a shelf beside it with a fire and a bench (a rest: its cold water
// closes wounds). How far along the road.
const FALLS_AT = 0.74;

// ------------------------------------------------------------------ noise
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => vnoise(x, z) * 0.5 + vnoise(x * 2.03 + 5.2, z * 2.03 + 1.3) * 0.25 + vnoise(x * 4.1 + 9.7, z * 4.1 + 3.1) * 0.15 + vnoise(x * 8.3 + 2.2, z * 8.3 + 7.7) * 0.1;
const ridged = (x, z) => 1 - Math.abs(fbm(x, z) * 2 - 1);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const bearingOf = (x, z) => { const b = Math.atan2(z, x); return b < 0 ? b + TAU : b; };

/** The mountain's shape before the road is cut: its profile from foot to horn (for the road's
 * plan) and with its rock and folds (for the land). */
const profile = (d) => (d >= MOUNT.R ? 0 : MOUNT.peak * Math.pow(1 - d / MOUNT.R, 1.55));
function natural(x, z) {
  const ro = Math.hypot(x, z);
  if (ro < GATE.r0 - 2) return 0;
  const b = bearingOf(x, z);
  const arc = smooth(ARC[0], ARC[0] + 0.3, b) * (1 - smooth(ARC[1] - 0.3, ARC[1], b));
  if (arc <= 0) return 0;
  // the skirt: a cliff straight up out of the forest floor (lower, and broken into ledges, at the
  // Broken Stair), then foothills rolling up toward the massif
  const sk = smooth(GATE.r0, GATE.r1, ro);
  const gw = 1 - smooth(0.06, 0.16, Math.abs(b - GATE.bearing));
  const skirt = (17 + fbm(x * 0.02, z * 0.02) * 8 + (ridged(x * 0.07, z * 0.07) - 0.5) * 7) * (1 - gw) + GATE.h * gw;
  const tf = smooth(GATE.r1, GATE.r1 + 280, ro);
  let h = (skirt + (fbm(x * 0.006 + 3, z * 0.006 + 1) * 28 - 6) * tf * (1 - gw * 0.85) + tf * 24) * sk;
  // the massif: its profile, spurs running down from the horn, and broken ground on its flanks
  const dx = x - MOUNT.x, dz = z - MOUNT.z, d = Math.hypot(dx, dz);
  if (d < MOUNT.R) {
    const t = d / MOUNT.R, phi = Math.atan2(dz, dx);
    const spur = (ridged(Math.cos(phi) * 2.2 + 11, Math.sin(phi) * 2.2 + 4) - 0.55) * 90 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    h += profile(d) * (0.9 + 0.2 * fbm(x * 0.004, z * 0.004)) + spur * (1 - t) + (fbm(x * 0.03, z * 0.03) - 0.5) * 14 * (1 - t * 0.6);
  }
  return h * arc;
}

// ------------------------------------------------------------------ the Pilgrims' Road
/** The road: up through the foothills from the Broken Stair's head, then round the massif at a
 * steady grade to the shoulder. [[x, z, y], ...] every ~4 m. */
function makeRoad() {
  const pts = [];
  const gx = Math.cos(GATE.bearing), gz = Math.sin(GATE.bearing);
  const start = [gx * (GATE.r1 + 6), gz * (GATE.r1 + 6)];
  // toward the massif's foot, winding a little through the foothills
  const toC = [MOUNT.x - start[0], MOUNT.z - start[1]], L = Math.hypot(...toC), u = [toC[0] / L, toC[1] / L], nrm = [-u[1], u[0]];
  const footD = L - MOUNT.R * 0.97;
  let y = natural(...start);
  for (let s = 0; s <= footD; s += 4) {
    const w = Math.sin(s * 0.018) * 22 * smooth(0, 60, s) * (1 - smooth(footD - 60, footD, s));
    const x = start[0] + u[0] * s + nrm[0] * w, z = start[1] + u[1] * s + nrm[1] * w;
    const yn = natural(x, z);
    y = s === 0 ? yn : Math.max(y, Math.min(y + 4 * 0.12, yn));     // (never down; never steeper than 12%)
    pts.push([x, z, y]);
  }
  // round the mountain on its contour: each step forward a little higher, at the outermost point the
  // land there is that high (so it rises above the road's inner edge and falls away past its outer one,
  // round the spurs and into the folds, as a mountain road goes)
  let [x, z] = pts[pts.length - 1];
  let phi = Math.atan2(z - MOUNT.z, x - MOUNT.x), rho = Math.hypot(x - MOUNT.x, z - MOUNT.z);
  const contour = (ph, yy, from) => {
    const high = (d) => natural(MOUNT.x + Math.cos(ph) * d, MOUNT.z + Math.sin(ph) * d) >= yy + 1.5;
    let d = Math.min(MOUNT.R, from + 50);
    while (d > 25 && !high(d)) d -= 3;
    let lo = d, hi = d + 3;
    for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2; if (high(m)) lo = m; else hi = m; }
    return lo;
  };
  let want = rho;
  while (y < SHOULDER) {
    y += 4 * GRADE;
    want += (contour(phi + 4 / rho, y, rho) - want) * 0.4;
    rho += Math.max(-1.6, Math.min(1.6, want - rho));      // (the radius eases in: no sudden turns)
    phi += 4 / rho;
    x = MOUNT.x + Math.cos(phi) * rho; z = MOUNT.z + Math.sin(phi) * rho;
    pts.push([x, z, y]);
  }
  return pts;
}

/** A way up from a to b at about `grade`: legs across the straight line between them (`leg` m to
 * either side of it), a point every 3 m, rising evenly. [[x, z, y]] */
function zigzag(a, b, grade, leg) {
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, tx = -uz, tz = ux, H = b.y - a.y;
  const need = Math.abs(H) / grade, n = Math.max(1, Math.round(Math.sqrt(Math.max(0, need * need - L * L)) / (2 * leg)));
  const key = [];
  for (let i = 0; i <= n; i++) { const side = i === 0 || i === n ? 0 : (i % 2 ? 1 : -1) * leg; key.push([a.x + ux * L * i / n + tx * side, a.z + uz * L * i / n + tz * side]); }
  const seg = key.slice(1).map((p, i) => Math.hypot(p[0] - key[i][0], p[1] - key[i][1])), tot = seg.reduce((s, v) => s + v, 0), pts = [];
  let acc = 0;
  seg.forEach((l, i) => {
    for (let d = 0; d < l; d += 3) { const t = d / l; pts.push([key[i][0] + (key[i + 1][0] - key[i][0]) * t, key[i][1] + (key[i + 1][1] - key[i][1]) * t, a.y + H * (acc + d) / tot]); }
    acc += l;
  });
  pts.push([b.x, b.z, b.y]);
  return pts;
}

/** A climb of ledges round a centre (the Well's, the Eyrie's): from y0 to y1 at radius r, starting at
 * angle a0, most a jump apart, every fourth a jump and the Wingbell's second; each a mossy slab
 * with a box to stand on. Returns the ledges [[x, y, z, angle]]. */
function ledgeClimb(ctx, rock, moss, cx, cz, y0, y1, r, a0, seed, { step = 0.46, big = -1 } = {}) {
  const { b, physics } = ctx, out = [];
  let y = y0, a = a0, n = 0;
  while (y < y1) {
    const wide = n === big, rr = wide ? r - 0.4 : r, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, s = wide ? 1.35 : 0.85;
    b.place(x, y, z, a, 1, (o) => {
      o.blob([0, -0.4, 0], [s, 0.42, s], rock, { detail: 2, jitter: 0.15, seed: seed + n });
      o.blob([0, 0.0, 0], [s * 0.8, 0.08, s * 0.8], moss, { detail: 1, jitter: 0.25, seed: seed + 40 + n });
    }, { solid: false });
    physics.add([x - s * 0.75, y - 0.8, z - s * 0.75], [x + s * 0.75, y, z + s * 0.75], 'rock');
    out.push([x, y, z, a]);
    n++;
    y += n % 4 === 0 ? 1.65 : 1.0;
    a += wide ? step * 1.35 : step;
  }
  return out;
}


// ------------------------------------------------------------------ the war on the mountain
// (laid out here, before the ground is cut, so their pads, causeways and paths are cut with it; holds.js
// builds them, reavers.js peoples them)
// Keeps and towers: [how far along the road, id, name, kind, where, whose]. `out`: on a bastion out over
// the drop, a causeway from the road to its gate; `shelf`: cut into the slope beside the road; `in`: up
// a side path, on a pad cut in the slope above.
const HOLDS = [
  [0.215, 'greywatch', 'Greywatch Keep', 'keep', 'out', 'wardens'],
  [0.305, 'crowstep', 'Crowstep Tower', 'tower', 'in', 'bandit'],
  [0.505, 'redfold', 'The Red Fold', 'camp', 'shelf', 'scythe'],
  [0.665, 'scythehold', 'Scythe Hold', 'keep', 'out', 'scythe'],
  [0.815, 'hollowtower', 'The Hollow Tower', 'tower', 'in', 'dead'],
  [0.902, 'cairnwatch', 'Cairnwatch', 'tower', 'out', 'wardens'],
];
// small bands up short side paths off the road: [how far along, name, who]
const LEDGES = [
  [0.062, 'The Seep', 'slimes'], [0.132, "Brigands' Nook", 'bandit'], [0.385, 'Thornback Ledge', 'goats'],
  [0.455, 'The Red Lookout', 'scythe'], [0.575, "The Pilgrims' Barrow", 'dead'], [0.708, 'Kettle Rock', 'bandit'],
  [0.778, 'The Scorched Ledge', 'scythe'],
];
// ambushes: where they wait above the road, behind rocks, for you to come by: [how far along, who]
const AMBUSHES = [[0.172, 'bandit'], [0.338, 'bandit'], [0.472, 'scythe'], [0.548, 'scythe'], [0.722, 'scythe'], [0.925, 'scythe']];
// where the road's outer edge breaks off sheer: [how far along, how far either way]
const BRINKS = [[0.185, 0.014], [0.462, 0.01], [0.56, 0.016], [0.69, 0.012], [0.785, 0.012], [0.948, 0.01]];

/** Lay out the war on the mountain (see HOLDS): each site's pad (a shelf the carve flattens, `neck` its
 * causeway to the road), its side path (a trail), the ambushes' hiding places, and the road's sheer
 * stretches (`S.brinks`, road segment indices). Needs the road's index (indexRoad) and not the ground. */
function planHolds(S) {
  const R = S.road, N = R.length;
  const inward = (i) => { const [x, z] = R[i], dx = MOUNT.x - x, dz = MOUNT.z - z, L = Math.hypot(dx, dz); return [dx / L, dz / L]; };
  const taken = (x, z, r) => S.shelves.some((c) => Math.hypot(x - c.x, z - c.z) < r + (c.r1 || 10) + 8)
    || S.trails.some((t) => t.pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < r + 4));
  // a side path from the road up to a pad: clear of the road but where it leaves it, and of every other pad
  const sidePath = (site, i) => {
    const [x, z, y] = R[i], [ux, uz] = inward(i);
    const a = { x: x + ux * (ROAD_W + 0.4), z: z + uz * (ROAD_W + 0.4), y: y - 0.1 };
    const dx = site.x - a.x, dz = site.z - a.z, L = Math.hypot(dx, dz);
    const b = { x: site.x - dx / L * (site.r0 - 1.5), z: site.z - dz / L * (site.r0 - 1.5), y: site.y };
    const pts = zigzag(a, b, 0.3, Math.min(13, L * 0.3));
    for (let k = 3; k < pts.length - 2; k++) {
      const r = S.roadAt(pts[k][0], pts[k][1]);
      if (r && r.d < ROAD_W + 4) return null;
      if (S.shelves.some((c) => c !== site && Math.hypot(pts[k][0] - c.x, pts[k][1] - c.z) < (c.r1 || 10) + 3)) return null;
    }
    return { name: `The way up to ${site.name.replace(/^The /, 'the ')}`, w: 1.3, pts, side: true, to: site.id };
  };
  const place = (want, r0, r1, side, meta) => {
    const i0 = Math.floor(N * want);
    for (let di = 0; di < 30; di++) for (const sg of di ? [1, -1] : [1]) {
      const i = i0 + di * sg * 3;
      if (i < 6 || i > N - 6) continue;
      const [x, z, y] = R[i], [ux, uz] = inward(i);
      let c = null;
      // (a keep or a camp goes off the road along the world axis nearest the way in or out, so its gate,
      // square to that axis as holds.js builds it, looks straight down its causeway)
      const fx = Math.abs(ux) > Math.abs(uz) ? Math.sign(ux) : 0, fz = fx ? 0 : Math.sign(uz);
      if (side === 'out') {
        const off = r0 + ROAD_W + 3.5;
        c = { x: x - fx * off, z: z - fz * off, y: y + 0.05 };
        if (natural(c.x, c.z) > c.y - 5) continue;                      // (only where the ground falls away under it)
        if ((S.roadAt(c.x, c.z)?.d ?? 99) < off - 1.5) continue;         // (nor where the road bends back toward it)
        const far = S.roadAt(x - fx * (off + r1 + 12), z - fz * (off + r1 + 12));
        if (far && far.d < off + r1) continue;                           // (no road below it)
        c.neck = [x - fx * (ROAD_W - 0.6), z - fz * (ROAD_W - 0.6), y - 0.12, 3.4];
      } else if (side === 'shelf') {
        const off = r0 + 8;
        c = { x: x + fx * off, z: z + fz * off, y: y + 0.9 };
        if ((S.roadAt(c.x, c.z)?.d ?? 99) < off - 1.5) continue;
        c.neck = [x + fx * (ROAD_W - 0.6), z + fz * (ROAD_W - 0.6), y - 0.12, 3.4];
        const rr = S.roadAt(x + fx * (off + r1 + 6), z + fz * (off + r1 + 6));
        if (rr && rr.d < 10) continue;
      } else {
        for (let off = 30; off < 92 && !c; off += 4) {
          const px = x + ux * off, pz = z + uz * off, h = natural(px, pz), rr = S.roadAt(px, pz);
          if (h - y < 7 || h - y > 42 || (rr && rr.d < r1 + 14)) continue;
          c = { x: px, z: pz, y: h - 1.2 };
        }
        if (!c) continue;
      }
      if (taken(c.x, c.z, r1)) continue;
      const site = { ...c, r0, r1, road: i, ux, uz, fixed: true, side, ...meta };
      if (side === 'in') { const path = sidePath(site, i); if (!path) continue; site.path = path; }
      return site;
    }
    return null;
  };
  S.holds = []; S.ledges = []; S.ambushes = []; S.brinks = new Set();
  for (const [want, id, name, kind, side, folk] of HOLDS) {
    const r0 = kind === 'keep' ? 18 : kind === 'camp' ? 15 : 10, r1 = r0 + (side === 'out' ? 5 : 7);
    const site = place(want, r0, r1, side, { id, name, kind, folk });
    if (!site) { console.warn('the Sorrowhorn: no room for', name); continue; }
    S.holds.push(site); S.shelves.push(site);
    if (site.path) S.trails.push(site.path);
  }
  for (const [want, name, folk] of LEDGES) {
    const site = place(want, 6.5, 12, 'in', { id: name, name, kind: 'ledge', folk });
    if (!site) { console.warn('the Sorrowhorn: no room for', name); continue; }
    S.ledges.push(site); S.shelves.push(site);
    S.trails.push(site.path);
  }
  // the ambushes: three or four places 8 to 14 m up the slope from the road, each a hiding place behind a rock
  for (const [want, folk] of AMBUSHES) {
    const i0 = Math.floor(N * want);
    for (let di = 0; di < 20; di++) {
      const i = i0 + (di % 2 ? 1 : -1) * Math.ceil(di / 2) * 3, [x, z, y] = R[i], [ux, uz] = inward(i);
      const [x2, z2] = R[Math.min(N - 1, i + 2)], tl = Math.hypot(x2 - x, z2 - z) || 1, tx = (x2 - x) / tl, tz = (z2 - z) / tl;
      const spots = [];
      for (const along of [-7, -2.5, 2.5, 7]) for (const off of [9, 11.5, 14]) {
        const px = x + ux * off + tx * along, pz = z + uz * off + tz * along, h = natural(px, pz), rr = S.roadAt(px, pz);
        if (h - y < 2.5 || h - y > 12 || (rr && rr.d < 7) || taken(px, pz, 1)) continue;
        spots.push([px, pz]); break;
      }
      if (spots.length < 3) continue;
      S.ambushes.push({ road: i, x, z, y, folk, spots, r: 11, ux, uz, name: folk === 'scythe' ? 'A Red Scythe ambush' : 'A bandit ambush' });
      break;
    }
  }
  // the sheer stretches: where the ground already falls hard away outside the road, and nothing's there
  for (const [want, w] of BRINKS) {
    for (let i = Math.floor(N * (want - w)); i <= Math.floor(N * (want + w)); i++) {
      if (i < 4 || i >= N - 4) continue;
      const [x, z, y] = R[i], [ux, uz] = inward(i);
      if (natural(x - ux * 18, z - uz * 18) > y - 7) continue;
      if (S.shelves.some((c) => Math.hypot(x - c.x, z - c.z) < (c.r1 || 10) + 14)) continue;
      const far = S.roadAt(x - ux * 40, z - uz * 40);
      if (far && far.d < 32) continue;
      S.brinks.add(i);
    }
  }
}

// ------------------------------------------------------------------ the heightfield
export class Sorrowhorn {
  constructor() {
    this.road = makeRoad();
    this.camps = CAMPS.map(([want, name]) => {
      const i = Math.floor(this.road.length * want), [x, z, y] = this.road[i], dx = MOUNT.x - x, dz = MOUNT.z - z, L = Math.hypot(dx, dz);
      return { x, z, y: y + 1.2, ux: dx / L, uz: dz / L, road: i, name, r0: 8.5, r1: 17, off: 17, clear: 13 };
    });
    this.caveSites = CAVES.map(([want, name]) => {
      const i = Math.floor(this.road.length * want), [x, z, y] = this.road[i], dx = MOUNT.x - x, dz = MOUNT.z - z, L = Math.hypot(dx, dz);
      return { x, z, y: y + 0.8, ux: dx / L, uz: dz / L, road: i, name, r0: 6, r1: 10.5, off: 13, clear: 10 };
    });
    { const i = Math.floor(this.road.length * FALLS_AT), [x, z, y] = this.road[i], dx = MOUNT.x - x, dz = MOUNT.z - z, L = Math.hypot(dx, dz);
      this.fallsSite = { x, z, y: y + 0.6, ux: dx / L, uz: dz / L, road: i, name: 'The Still Water', r0: 9, r1: 11.2, off: 14, clear: 11, bowl: [6.2, 1.5, 2.5] }; }
    // Hornhollow, where the road ends: a broad shelf cut into the shoulder under the crag
    { const R = this.road, [x, z, y] = R[R.length - 1], dx = MOUNT.x - x, dz = MOUNT.z - z, L = Math.hypot(dx, dz);
      this.villageSite = { x: x + dx / L * 15, z: z + dz / L * 15, y: y + 0.3, ux: dx / L, uz: dz / L, road: R.length - 1, name: 'Hornhollow', r0: 19, r1: 28, fixed: true }; }
    // the summit: the top of the horn, a little platform cut there for the beacon
    { let best = null;
      for (let r = 0; r < 90; r += 3) for (let a = 0; a < TAU; a += 0.2) { const x = MOUNT.x + Math.cos(a) * r, z = MOUNT.z + Math.sin(a) * r, y = natural(x, z); if (!best || y > best.y) best = { x, z, y }; }
      this.summitSite = { ...best, y: best.y - 1.5, name: 'The Horn', r0: 5.5, r1: 11, fixed: true, ux: 0, uz: 0 }; }
    this.shelves = [...this.camps, ...this.caveSites, this.fallsSite, this.villageSite, this.summitSite];
    this.trails = this.makeTrails();
    this.indexRoad();
    planHolds(this);   // (the keeps, towers, camps and ledges, their paths, the ambushes and the sheer drops)
    this.meshes = []; this.patches = [];
    this.h = new Float32Array(NX * NZ);
    this.carve();
  }

  /** The road's index (which segments pass near each 32 m cell), for roadAt. */
  indexRoad() {
    const R = this.road, cell = 32, buckets = new Map(), key = (i, k) => i * 100003 + k;
    for (let s = 0; s + 1 < R.length; s++) {
      const [ax, az] = R[s], [bx, bz] = R[s + 1];
      for (const [x, z] of [[ax, az], [bx, bz]]) for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) {
        const kk = key(Math.floor(x / cell) + di, Math.floor(z / cell) + dk);
        let l = buckets.get(kk); if (!l) buckets.set(kk, l = new Set()); l.add(s);
      }
    }
    this.buckets = buckets; this.cell = cell;
  }

  /** The grid's heights: the mountain, with the road's bench cut into it. */
  carve() {
    const cell = this.cell, key = (i, k) => i * 100003 + k;
    // the trails' own index, as the road's
    const tb = new Map(), tsegs = [];
    for (const t of this.trails) for (let s = 0; s + 1 < t.pts.length; s++) {
      const id = tsegs.push([t, s]) - 1;
      for (const [x, z] of [t.pts[s], t.pts[s + 1]]) for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) {
        const kk = key(Math.floor(x / cell) + di, Math.floor(z / cell) + dk);
        let l = tb.get(kk); if (!l) tb.set(kk, l = new Set()); l.add(id);
      }
    }
    this.tb = tb; this.tsegs = tsegs;
    // each camp's and cave's shelf: in from the road, as far as it must be to keep clear of it (the road can bend)
    for (const c of this.shelves) {
      if (c.fixed) continue;
      const [rx, rz] = this.road[c.road];
      for (let off = c.off; off < 40; off += 1.5) { c.x = rx + c.ux * off; c.z = rz + c.uz * off; if ((this.roadAt(c.x, c.z)?.d ?? 99) > c.clear) break; }
    }
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
      const x = BOX.x0 + i * G, z = BOX.z0 + k * G;
      let h = natural(x, z);
      const r = this.roadAt(x, z);
      if (r) {
        const span = Math.min(18, Math.max(3, Math.abs(h - r.y) * 0.9));
        const w = 1 - smooth(ROAD_W, ROAD_W + span, r.d);
        h += (r.y - 0.15 - h) * w;
        // a sheer stretch: the outer edge breaks off in a face a dozen metres down, a steep slope under it
        if (this.brinks.has(r.i) && r.d > ROAD_W + 0.3) {
          const [ax, az] = this.road[r.i];
          if ((x - ax) * (ax - MOUNT.x) + (z - az) * (az - MOUNT.z) > 0) {
            const e = r.d - ROAD_W - 0.3, cut = r.y - 0.15 - 12.5 * smooth(0, 2.6, e) - 0.6 * e;
            if (cut < h) h += (cut - h) * (1 - smooth(14, 30, e));
          }
        }
      }
      for (const c of this.shelves) {
        const d = Math.hypot(x - c.x, z - c.z);
        if (c.neck) {        // (a causeway from the road to its gate, rising or falling evenly)
          const [nx, nz, ny, nw] = c.neck, ex = c.x - nx, ez = c.z - nz, t = Math.max(0, Math.min(1, ((x - nx) * ex + (z - nz) * ez) / (ex * ex + ez * ez))), dn = Math.hypot(x - nx - ex * t, z - nz - ez * t);
          if (dn < nw + 5) h += (ny + (c.y - ny) * t - h) * (1 - smooth(nw, nw + 5, dn));
        }
        if (d < c.r1) h += (c.y - h) * (1 - smooth(c.r0, c.r1, d));
        if (c.bowl) {          // (a pool's bowl, toward the shelf's back wall)
          const [br, depth, inset] = c.bowl, e = Math.hypot(x - c.x - c.ux * inset, z - c.z - c.uz * inset);
          if (e < br + 0.6) h -= depth * Math.max(0, 1 - (e / (br + 0.6)) ** 2);
        }
      }
      const tr = this.trailAt(x, z);          // (a trail's bench, narrower than the road's)
      if (tr && tr.d < tr.w + 10) { const span = Math.min(9, Math.max(2, Math.abs(h - tr.y) * 0.85)); h += (tr.y - 0.1 - h) * (1 - smooth(tr.w, tr.w + span, tr.d)); }
      this.h[k * NX + i] = h;
    }
  }

  /** The road nearest (x, z): {d, y (its height there), s (how far along, 0..1)} or null. */
  roadAt(x, z) {
    const l = this.buckets.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell));
    if (!l) return null;
    let best = null;
    for (const s of l) {
      const [ax, az, ay] = this.road[s], [bx, bz, by] = this.road[s + 1], dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (!best || d < best.d) best = { d, y: ay + (by - ay) * t, s: (s + t) / (this.road.length - 1), i: s };
    }
    return best;
  }

  /** The trail nearest (x, z): {d, y, w (half its width), t (the trail)} or null. */
  trailAt(x, z) {
    const l = this.tb?.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell));
    if (!l) return null;
    let best = null;
    for (const id of l) {
      const [t, s] = this.tsegs[id], [ax, az, ay] = t.pts[s], [bx, bz, by] = t.pts[s + 1], dx = bx - ax, dz = bz - az;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))), d = Math.hypot(x - ax - dx * u, z - az - dz * u);
      if (!best || d < best.d) best = { d, y: ay + (by - ay) * u, w: t.w, t };
    }
    return best;
  }

  /** The trails: the Shepherd's Stair from Hornhollow's back up to the summit, and the Goat Path
   * from the road beside the Wether's Throat up to the Well's lip. [{name, w, pts [[x, z, y]]}] */
  makeTrails() {
    const V = this.villageSite, T = this.summitSite, out = [];
    const ux = T.x - V.x, uz = T.z - V.z, L = Math.hypot(ux, uz);
    out.push({ name: "The Shepherd's Stair", w: 1.7, pts: zigzag({ x: V.x + ux / L * (V.r0 - 2), z: V.z + uz / L * (V.r0 - 2), y: V.y }, { x: T.x - ux / L * 4.5, z: T.z - uz / L * 4.5, y: T.y }, 0.3, 30) });
    // (where the Throat's layout puts the Well: about 7.5 m in from its forecourt's middle to the cliff, then 16 in and 40 along)
    const A = this.caveSites[0], wx = A.x + 7.5 + 16, wz = A.z + 40;
    let bi = 0, bd = Infinity;
    this.road.forEach(([x, z], i) => { const d = Math.hypot(x - wx, z - wz); if (d < bd) { bd = d; bi = i; } });
    const [rx, rz, ry] = this.road[bi], ex = wx + (rx - wx) / bd * 9.5, ez = wz + (rz - wz) / bd * 9.5;
    out.push({ name: 'The Goat Path', w: 1.2, pts: zigzag({ x: rx + (wx - rx) / bd * 4.5, z: rz + (wz - rz) / bd * 4.5, y: ry }, { x: ex, z: ez, y: natural(ex, ez) }, 0.42, 8) });
    return out;
  }

  /** Is (x, z) on the mountain's land (where its ground, not the forest's, is the floor)? */
  covers(x, z) {
    if (x < BOX.x0 || x > BOX.x1 || z < BOX.z0 || z > BOX.z1) return false;
    const ro = Math.hypot(x, z);
    if (ro < GATE.r0 - 7) return false;
    const b = bearingOf(x, z);
    return b > ARC[0] && b < ARC[1];
  }

  /** The ground's height at (x, z): read off the grid's own triangles (as drawn). */
  heightAt(x, z) {
    const fi = (x - BOX.x0) / G, fk = (z - BOX.z0) / G;
    const i = Math.max(0, Math.min(NX - 2, Math.floor(fi))), k = Math.max(0, Math.min(NZ - 2, Math.floor(fk)));
    const fx = Math.min(1, Math.max(0, fi - i)), fz = Math.min(1, Math.max(0, fk - k)), H = this.h;
    const a = H[k * NX + i], b = H[k * NX + i + 1], c = H[(k + 1) * NX + i], d = H[(k + 1) * NX + i + 1];
    return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }
  /** How steep the ground is at (x, z) (rise over run). */
  slopeAt(x, z) {
    const e = 1.5;
    return Math.hypot(this.heightAt(x + e, z) - this.heightAt(x - e, z), this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
  }

  /** The land's meshes: 128 m tiles of the grid (only where the mountain is), with its material. */
  buildMesh(ctx) {
    const mat = mountainMaterial(ctx.lib), out = this.meshes, T = 32;   // (128 m tiles: few draws for the whole mountain)
    for (let tk = 0; tk < NZ - 1; tk += T) for (let ti = 0; ti < NX - 1; ti += T) {
      const ni = Math.min(T, NX - 1 - ti), nk = Math.min(T, NZ - 1 - tk);
      // (a tile wholly off the mountain's land is left out)
      let any = false;
      for (let k = 0; k <= nk && !any; k += 4) for (let i = 0; i <= ni && !any; i += 4) if (this.covers(BOX.x0 + (ti + i) * G, BOX.z0 + (tk + k) * G)) any = true;
      if (!any) continue;
      const n = (ni + 1) * (nk + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
      for (let k = 0; k <= nk; k++) for (let i = 0; i <= ni; i++) {
        const gi = ti + i, gk = tk + k, j = k * (ni + 1) + i;
        pos[j * 3] = BOX.x0 + gi * G; pos[j * 3 + 1] = this.h[gk * NX + gi]; pos[j * 3 + 2] = BOX.z0 + gk * G;
        uv[j * 2] = pos[j * 3]; uv[j * 2 + 1] = pos[j * 3 + 2];
      }
      for (let k = 0; k < nk; k++) for (let i = 0; i < ni; i++) {
        const a = k * (ni + 1) + i, b = a + 1, c = a + ni + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const rocky = new Float32Array(n);
      for (let j = 0; j < n; j++) { const ro = Math.hypot(pos[j * 3], pos[j * 3 + 2]); rocky[j] = ro > GATE.r0 - 1 && ro < GATE.r1 + 3 ? 1 : 0; }
      g.setAttribute('rocky', new THREE.BufferAttribute(rocky, 1));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true; m.castShadow = true;
      ctx.scene.add(m);
      out.push(m);
    }
    return out;
  }

  /** A hole in the ground (a cave's mouth, a well's top), as terrain.js holeTerrain cuts the downs':
   * the ground there is no floor (physics groundHoles), its tiles' triangles near come out, and a
   * finer patch (1 m, on the same heights) goes in their place without the cells inside the hole
   * lower than yTop - 0.6 (all of them, yTop Infinity). */
  hole(x0, z0, x1, z1, yTop, physics, scene) {
    physics.groundHoles.push([x0, z0, x1, z1]);
    const snap = (v, o, up) => o + (up ? Math.ceil : Math.floor)((v - o) / G) * G;
    const cx0 = snap(x0 - 6, BOX.x0, false), cx1 = snap(x1 + 6, BOX.x0, true), cz0 = snap(z0 - 6, BOX.z0, false), cz1 = snap(z1 + 6, BOX.z0, true);
    for (const m of this.meshes) {
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      if (bb.max.x < cx0 || bb.min.x > cx1 || bb.max.z < cz0 || bb.min.z > cz1) continue;
      const P = g.attributes.position.array, I = g.index.array, keep = [];
      for (let t = 0; t < I.length; t += 3) {
        let cx = 0, cz = 0;
        for (let q = 0; q < 3; q++) { const v = I[t + q] * 3; cx += P[v]; cz += P[v + 2]; }
        cx /= 3; cz /= 3;
        if (cx > cx0 && cx < cx1 && cz > cz0 && cz < cz1) continue;
        keep.push(I[t], I[t + 1], I[t + 2]);
      }
      if (keep.length !== I.length) g.setIndex(keep);
    }
    const F = 1, nx = Math.round((cx1 - cx0) / F) + 1, nz = Math.round((cz1 - cz0) / F) + 1;
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = [];
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const x = cx0 + i * F, z = cz0 + k * F, j = k * nx + i;
      pos[j * 3] = x; pos[j * 3 + 1] = this.heightAt(x, z); pos[j * 3 + 2] = z; uv[j * 2] = x; uv[j * 2 + 1] = z;
    }
    for (let k = 0; k + 1 < nz; k++) for (let i = 0; i + 1 < nx; i++) {
      const a = k * nx + i, b = a + 1, c = a + nx, d = c + 1;
      const mx = cx0 + (i + 0.5) * F, mz = cz0 + (k + 0.5) * F, my = (pos[a * 3 + 1] + pos[d * 3 + 1]) / 2;
      if (mx > x0 && mx < x1 && mz > z0 && mz < z1 && my < yTop - 0.6) continue;     // (the hole)
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('rocky', new THREE.BufferAttribute(new Float32Array(nx * nz), 1));
    g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, this.meshes[0].material);
    m.receiveShadow = true; m.castShadow = true;
    scene.add(m);
    this.meshes.push(m); this.patches.push(m);
    return m;
  }

  /** The road's gravel strip, laid on the carved bench (a ribbon of quads a hand above the ground). */
  buildRoad(ctx, mat, R = this.road, half = 1.9) {
    const P = [], U = [], I = [];
    let along = 0;
    for (let s = 0; s < R.length; s++) {
      const [x, z] = R[s], [nx, nz] = s + 1 < R.length ? R[s + 1] : R[s], [px, pz] = s > 0 ? R[s - 1] : R[s];
      const dx = nx - px, dz = nz - pz, L = Math.hypot(dx, dz) || 1, ox = -dz / L, oz = dx / L, w = half + Math.sin(s * 0.37) * half * 0.08;
      if (s > 0) along += Math.hypot(x - R[s - 1][0], z - R[s - 1][1]);
      for (const side of [-1, 1]) {
        const vx = x + ox * w * side, vz = z + oz * w * side;
        P.push(vx, this.heightAt(vx, vz) + 0.06, vz); U.push(side * w, along);
      }
      if (s > 0) { const a = (s - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }   // (wound to face up)
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true; m.renderOrder = 1;
    ctx.scene.add(m);
    return m;
  }
}

// ------------------------------------------------------------------ the mountain's ground
// Layers, by slope and height: meadow grass and moss low down; scree and granite in the middle;
// pale alpine granite above; old snow lying on the level ground near the top, and on the crags' ledges. Rock wraps the cliffs by world
// position (no stretching), the granite and basalt sampled twice at two scales so no long face
// shows a repeat. Tints are the palette swaps (one rock texture becomes several stones).
const LAYERS = [['ground_grass_05', 0xb2c09a], ['rock_06_overworld_mossy_rock_1_03', 0xc8ccb8], ['ground_gravel_03', 0xc8c4be], ['rock_05_overworld_granite_1_02', 0xd6d2cc],
  ['rock_08_mountain_alpine_granite_3_01', 0xd4d8e0], ['ground_snow_06', 0xe6e8ee], ['cliff_07_coarse_gravel_11_01', 0xc4c0ba], ['ground_grass_05', 0xd8d49c]];
const BANDS = { meadow: 140, granite: 215, basalt: 340, snow: 400 };

export function mountainMaterial(lib) {
  const ok = LAYERS.map(([id, c]) => (lib.surf.has(id) ? [id, c] : ['castle_basalt', c]));
  const tex = ok.map(([id]) => { lib.used?.add(id); return lib.texture(lib.surf.get(id).file); });
  const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x060606, shininess: 5 });
  m.userData.noGlass = true;
  if (WEBGPU) { m.colorNode = settled(mountainNode(tex, ok.map(([, c]) => c))); keyed(m, 'mountain'); return m; }
  const T = (c) => { const k = new THREE.Color(c); return `vec3(${[k.r, k.g, k.b].map((v) => v.toFixed(3)).join(', ')})`; };
  const tint = ok.map(([, c]) => T(c));
  m.onBeforeCompile = (sh) => {
    tex.forEach((t, i) => { sh.uniforms['mT' + i] = { value: t }; });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float rocky;\nvarying vec3 vMP; varying vec3 vMN; varying float vMR;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMP = (modelMatrix * vec4(transformed, 1.0)).xyz; vMN = normal; vMR = rocky;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vMP; varying vec3 vMN; varying float vMR;
      ${tex.map((_, i) => `uniform sampler2D mT${i};`).join('\n')}
      float mHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float mNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mHash(i), mHash(i + vec2(1.0, 0.0)), f.x), mix(mHash(i + vec2(0.0, 1.0)), mHash(i + vec2(1.0, 1.0)), f.x), f.y); }
      ${SHARP_GLSL}
      vec3 mPX, mPY; float mUm;
      vec3 mTex(sampler2D t, vec2 p, float tile) { return untiled(t, p / tile, mPX.xz / tile, mPY.xz / tile, mUm, false).rgb; }
      vec3 mTri(sampler2D t, vec3 p, vec3 n, float tile) {
        vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
        vec3 c = vec3(0.0);
        if (w.x > 0.01) c += sharpTexelGrad(t, p.zy / tile, mPX.zy / tile, mPY.zy / tile).rgb * w.x;
        if (w.y > 0.01) c += sharpTexelGrad(t, p.xz / tile, mPX.xz / tile, mPY.xz / tile).rgb * w.y;
        if (w.z > 0.01) c += sharpTexelGrad(t, p.xy / tile, mPX.xy / tile, mPY.xy / tile).rgb * w.z;
        return c;
      }`)
      .replace('#include <map_fragment>', `
      vec2 gp = vMP.xz; mPX = dFdx(vMP); mPY = dFdy(vMP); mUm = untileMask(gp, 5.0);
      vec3 nn = normalize(vMN);
      float n1 = mNoise(gp * 0.03), n2 = mNoise(gp * 0.11 + 7.0), n3 = mNoise(gp * 0.05 + 31.0);
      float slope = 1.0 - nn.y, y = vMP.y + (n1 - 0.5) * 40.0;
      float rockW = max(smoothstep(0.2, 0.4, slope + (n2 - 0.5) * 0.14), vMR);
      vec3 c = vec3(0.0);
      if (rockW < 0.999) {   // the level ground: meadow, then scree and gravel, then old snow
        float hi = smoothstep(${BANDS.snow}.0, ${BANDS.snow + 70}.0, y);
        float sc = smoothstep(${BANDS.meadow - 25}.0, ${BANDS.meadow + 25}.0, y), sn = smoothstep(${BANDS.snow - 20}.0, ${BANDS.snow + 15}.0, y) * (1.0 - smoothstep(0.12 + 0.2 * hi, 0.26 + 0.24 * hi, slope));
        vec3 g = vec3(0.0);
        if (sc < 0.999) g = mix(mTex(mT0, gp, 1.8) * ${tint[0]}, mTex(mT1, gp, 3.0) * ${tint[1]}, smoothstep(0.55, 0.75, n2) * 0.7)
          * mix(vec3(1.0), vec3(1.0, 0.86, 0.58), smoothstep(70.0, 135.0, y));   // (the turf dries and yellows as it climbs)
        if (sc > 0.001) {
          vec3 scree = mix(mTex(mT2, gp, 1.6) * ${tint[2]}, mTex(mT6, gp, 4.0) * ${tint[6]}, smoothstep(0.4, 0.7, n3));
          float alp = smoothstep(0.5, 0.68, n2 * 0.6 + n1 * 0.4) * (1.0 - smoothstep(0.12, 0.25, slope)) * (1.0 - smoothstep(${BANDS.basalt - 30}.0, ${BANDS.basalt + 10}.0, y));
          if (alp > 0.001) scree = mix(scree, mTex(mT7, gp, 2.2) * ${tint[7]}, alp);
          float pale = smoothstep(${BANDS.basalt - 40}.0, ${BANDS.basalt + 30}.0, y) * 0.75;
          if (pale > 0.001) scree = mix(scree, mTex(mT4, gp, 5.0) * ${tint[4]}, pale);
          g = mix(g, scree, sc);
        }
        if (sn > 0.001) g = mix(g, mTex(mT5, gp, 3.0) * ${tint[5]} * (0.88 + 0.2 * n3), sn);
        c = g * (1.0 - rockW);
      }
      if (rockW > 0.001) {   // the rock: moss low, granite, then basalt high (one face sampled twice)
        float gr = smoothstep(${BANDS.meadow - 30}.0, ${BANDS.meadow + 30}.0, y), ba = smoothstep(${BANDS.basalt - 40}.0, ${BANDS.basalt + 30}.0, y);
        vec3 rk = mTri(mT1, vMP, nn, 9.0) * ${tint[1]};
        if (gr > 0.001) rk = mix(rk, mTri(mT3, vMP, nn, 11.0) * ${tint[3]}, gr);
        if (ba > 0.001) rk = mix(rk, mTri(mT4, vMP, nn, 12.0) * ${tint[4]}, ba);
        float big = dot(mTri(mT3, vMP + vec3(13.7, 5.1, 7.3), nn, 37.0), vec3(0.333));
        rk *= 0.66 + 0.7 * big;
        float sl = smoothstep(${BANDS.snow + 5}.0, ${BANDS.snow + 50}.0, y) * smoothstep(0.4, 0.62, nn.y + (n3 - 0.5) * 0.2);
        if (sl > 0.001) rk = mix(rk, mTex(mT5, gp, 3.0) * ${tint[5]}, sl);
        c += rk * rockW;
      }
      c *= 0.82 + 0.34 * mNoise(gp * 0.012 + 3.0);
      c *= 0.93 + 0.14 * mNoise(gp * 0.09 + 21.0);
      diffuseColor.rgb *= c;`);
  };
  return m;
}

function mountainNode(tex, tints) {
  const { Fn, If, texture, attribute, positionWorld, normalGeometry, dFdx, dFdy, vec3, vec4, mix, smoothstep, dot, pow, abs, normalize, max } = TSL;
  const tn = tex.map((t) => texture(t));
  const tint = (c) => { const k = new THREE.Color(c); return vec3(+k.r.toFixed(3), +k.g.toFixed(3), +k.b.toFixed(3)); };
  return Fn(() => {
    const P = positionWorld.toVar(), gp = P.xz.toVar();
    const dPX = dFdx(P).toVar(), dPY = dFdy(P).toVar();
    const um = untileMask(gp, 5.0).toVar();
    const mTex = (i, tile) => untiled(tn[i], gp.div(tile), dPX.xz.div(tile), dPY.xz.div(tile), um, false).rgb;
    const mTri = (i, p, n, tile) => {
      const w0 = pow(abs(n), vec3(4.0)), w = w0.div(w0.x.add(w0.y).add(w0.z)).toVar();
      const c = vec3(0.0).toVar();
      If(w.x.greaterThan(0.01), () => { c.addAssign(sharpGrad(tn[i], p.zy.div(tile), dPX.zy.div(tile), dPY.zy.div(tile)).rgb.mul(w.x)); });
      If(w.y.greaterThan(0.01), () => { c.addAssign(sharpGrad(tn[i], p.xz.div(tile), dPX.xz.div(tile), dPY.xz.div(tile)).rgb.mul(w.y)); });
      If(w.z.greaterThan(0.01), () => { c.addAssign(sharpGrad(tn[i], p.xy.div(tile), dPX.xy.div(tile), dPY.xy.div(tile)).rgb.mul(w.z)); });
      return c;
    };
    const n1 = snoise(gp.mul(0.03)).toVar(), n2 = snoise(gp.mul(0.11).add(7.0)).toVar(), n3 = snoise(gp.mul(0.05).add(31.0)).toVar();
    const nn = normalize(normalGeometry).toVar();
    const slope = nn.y.oneMinus().toVar(), y = P.y.add(n1.sub(0.5).mul(40.0)).toVar();
    const rockW = max(smoothstep(0.2, 0.4, slope.add(n2.sub(0.5).mul(0.14))), attribute('rocky', 'float')).toVar();
    const c = vec3(0.0).toVar();
    If(rockW.lessThan(0.999), () => {
      const sc = smoothstep(BANDS.meadow - 25, BANDS.meadow + 25, y).toVar();
      const hi = smoothstep(BANDS.snow, BANDS.snow + 70, y);
      const sn = smoothstep(BANDS.snow - 20, BANDS.snow + 15, y).mul(smoothstep(hi.mul(0.2).add(0.12), hi.mul(0.24).add(0.26), slope).oneMinus()).toVar();
      const g = vec3(0.0).toVar();
      If(sc.lessThan(0.999), () => { g.assign(mix(mTex(0, 1.8).mul(tint(tints[0])), mTex(1, 3.0).mul(tint(tints[1])), smoothstep(0.55, 0.75, n2).mul(0.7))
        .mul(mix(vec3(1.0), vec3(1.0, 0.86, 0.58), smoothstep(70.0, 135.0, y)))); });
      If(sc.greaterThan(0.001), () => {
        const scree = mix(mTex(2, 1.6).mul(tint(tints[2])), mTex(6, 4.0).mul(tint(tints[6])), smoothstep(0.4, 0.7, n3)).toVar();
        const alp = smoothstep(0.5, 0.68, n2.mul(0.6).add(n1.mul(0.4))).mul(smoothstep(0.12, 0.25, slope).oneMinus()).mul(smoothstep(BANDS.basalt - 30, BANDS.basalt + 10, y).oneMinus()).toVar();
        If(alp.greaterThan(0.001), () => { scree.assign(mix(scree, mTex(7, 2.2).mul(tint(tints[7])), alp)); });
        const pale = smoothstep(BANDS.basalt - 40, BANDS.basalt + 30, y).mul(0.75).toVar();
        If(pale.greaterThan(0.001), () => { scree.assign(mix(scree, mTex(4, 5.0).mul(tint(tints[4])), pale)); });
        g.assign(mix(g, scree, sc));
      });
      If(sn.greaterThan(0.001), () => { g.assign(mix(g, mTex(5, 3.0).mul(tint(tints[5])).mul(n3.mul(0.2).add(0.88)), sn)); });
      c.assign(g.mul(rockW.oneMinus()));
    });
    If(rockW.greaterThan(0.001), () => {
      const gr = smoothstep(BANDS.meadow - 30, BANDS.meadow + 30, y).toVar(), ba = smoothstep(BANDS.basalt - 40, BANDS.basalt + 30, y).toVar();
      const rk = mTri(1, P, nn, 9.0).mul(tint(tints[1])).toVar();
      If(gr.greaterThan(0.001), () => { rk.assign(mix(rk, mTri(3, P, nn, 11.0).mul(tint(tints[3])), gr)); });
      If(ba.greaterThan(0.001), () => { rk.assign(mix(rk, mTri(4, P, nn, 12.0).mul(tint(tints[4])), ba)); });
      const big = dot(mTri(3, P.add(vec3(13.7, 5.1, 7.3)), nn, 37.0), vec3(0.333));
      rk.mulAssign(big.mul(0.7).add(0.66));
      const sl = smoothstep(BANDS.snow + 5, BANDS.snow + 50, y).mul(smoothstep(0.4, 0.62, nn.y.add(n3.sub(0.5).mul(0.2)))).toVar();
      If(sl.greaterThan(0.001), () => { rk.assign(mix(rk, mTex(5, 3.0).mul(tint(tints[5])), sl)); });
      c.addAssign(rk.mul(rockW));
    });
    c.mulAssign(snoise(gp.mul(0.012).add(3.0)).mul(0.34).add(0.82));
    c.mulAssign(snoise(gp.mul(0.09).add(21.0)).mul(0.14).add(0.93));
    return vec4(c.mul(ref('color', 'color')), 1.0);
  })();
}

// ------------------------------------------------------------------ the caves
// Both in the west flank where the road crosses it, their mouths in the back walls of forecourts cut
// above the road. Intent: each pays for going in. The Wether's Throat is where the goat men lay their
// dead (and the dead don't stay laid): a great hall, a gallery to their ossuary, and the Well, a
// natural shaft open to the sky that climbs, ledge by ledge round its wall, to the slope above (a way
// out somewhere else), with their hoard on a ledge halfway up that only a climber finds. The
// Glimmerdeep is stranger: a grove of crystal, a black lake with an island, the skull of something
// horned and huge set in the rock, and a ring of kneeling stone round a bell half sunk in the floor
// that rings when you come near it.
function throatLayout(base) {
  const F = [];
  const pass = (pts, r, f0, f1, h = 3.6, tag = 'pass') => F.push({ type: 'pass', pts, r, f0, f1, h, tag });
  const room = (a, b, ra, rb, floor, dome, tag, more = {}) => F.push({ type: 'room', a, b, ra, rb, floor, dome, tag, ...more });
  pass([[-5, 0], [6, 0], [13, 2], [22, 1]], 2.2, null, base - 1.5, 3.8, 'entrance');
  room(36, 0, 13, 15, base - 2.5, 8, 'hall');
  pass([[33, -14], [30, -26], [27, -36]], 1.9, base - 2.5, base - 3.5, 3.4, 'gallery');
  room(25, -44, 8, 7, base - 3.5, 4, 'ossuary');
  pass([[18, -42], [12, -28], [11, -12], [11, 0]], 1.6, base - 3.5, base - 1.2, 3.0, 'loop');
  pass([[34, 14], [28, 26], [22, 33], [18, 37]], 1.9, base - 2.5, base - 2.5, 3.4, 'way');
  room(16, 40, 6.5, 6.5, base - 2.5, 10, 'well', { sky: true });
  return F;
}
const THROAT_DECOR = {
  spikes: [['hall', 22], ['ossuary', 8], ['gallery', 3]],
  fungus: [['hall', 0x9cf0ff, 3], ['ossuary', 0x4060ff, 3], ['way', 0x60e0c0, 2], ['well', 0x7cff5a, 2]],
  lights: [['ossuary', 0x5a70ff, 3, 12]],
  torches: [['entrance', 2], ['hall', 6], ['gallery', 2], ['ossuary', 2], ['way', 1]],
  bones: [['ossuary', 8], ['hall', 4], ['gallery', 2], ['loop', 1]],
};
function glimmerLayout(base) {
  const F = [];
  const pass = (pts, r, f0, f1, h = 3.6, tag = 'pass') => F.push({ type: 'pass', pts, r, f0, f1, h, tag });
  const room = (a, b, ra, rb, floor, dome, tag) => F.push({ type: 'room', a, b, ra, rb, floor, dome, tag });
  pass([[-5, 0], [8, -1], [17, -5], [22, -7]], 2.3, null, base - 1, 3.8, 'entrance');
  room(29, -9, 11, 9, base - 1.5, 7, 'grove');
  pass([[31, 0], [33, 8]], 2.0, base - 1.5, base - 2, 3.6, 'shore');
  room(35, 20, 13, 11, base - 2, 8, 'lake');
  pass([[27, 29], [24, 36], [23, 40]], 1.7, base - 2, base - 3.2, 3.2, 'crawl');      // (down: the skull lies deep)
  room(23, 43, 6, 5, base - 3.2, 3.8, 'fossil');
  pass([[39, -10], [47, -6]], 1.8, base - 1.5, base - 1.5, 3.4, 'stair');
  room(54, -3, 7, 7, base - 1.5, 5, 'bellpit');
  return F;
}
const GLIMMER_DECOR = {
  spikes: [['grove', 10], ['lake', 14], ['fossil', 4], ['bellpit', 6]],
  fungus: [['grove', 0xb070ff, 6], ['lake', 0x40d8e8, 6], ['fossil', 0x7cff5a, 3], ['crawl', 0x9cf0ff, 2]],
  lights: [['grove', 0xa070ff, 4, 14], ['bellpit', 0xffc070, 3, 12]],
  torches: [['entrance', 2], ['shore', 1], ['bellpit', 2], ['fossil', 1]],
  bones: [['bellpit', 3], ['fossil', 2]],
};

/** What a mountain hoard holds: its charm, a fine weapon, two pieces of armour, a ring, gold. */
function mountainHoard(charm) {
  const ilvl = 15 + Math.floor(Math.random() * 4), r = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const slot = () => ['head', 'body', 'legs', 'hands', 'feet'][r(0, 4)];
  return [charm ? makeCharm(charm) : null, makeGear({ ilvl, rarity: Math.random() < 0.3 ? 5 : 4, slot: 'weapon', kind: Math.random() < 0.5 ? 'twohand' : 'onehand' }),
    makeGear({ ilvl, rarity: r(3, 4), slot: slot() }), makeGear({ ilvl, rarity: r(3, 4), slot: slot() }), makeGear({ ilvl, rarity: r(3, 5), slot: 'ring' }),
    { type: 'gold', amount: r(220, 400) }, makePotion('life', 1)].filter(Boolean);
}

/** The Sorrowhorn's caves: built once its ground is the height function's (main.js, after setMountain). */
export function buildMountainCaves(ctx, M) {
  const S = ctx.mountain, { b, physics } = ctx;
  if (!S?.caveSites?.length) return;
  const hole = (x0, z0, x1, z1, yTop, phys) => S.hole(x0, z0, x1, z1, yTop, phys, ctx.scene);
  const [A, B] = S.caveSites;
  const throat = new Cave(ctx, { z: A.z, name: A.name, cliff: () => A.x + 6, hole, torchBelow: Infinity, layout: throatLayout, water: null, decor: THROAT_DECOR,
    seed: 4711, rock: 'rock_05_overworld_granite_1_02', rockK: 1.5 });
  const glim = new Cave(ctx, { z: B.z, name: B.name, cliff: () => B.x + 6, hole, torchBelow: Infinity, layout: glimmerLayout, water: { a: 36, b: 21, r: 8 }, decor: GLIMMER_DECOR, poolGlow: false,
    seed: 8086, rock: 'rock_09_mountain_layered_slate_2_05', rockK: 1.9 });
  S.caves = [throat, glim];
  for (const c of S.caves) frameMouth(ctx, c);
  S.unders = [
    { dg: caveNav(throat), plan: [['hall', 5, 'hollow'], ['ossuary', 4, 'hollow'], ['gallery', 2, 'hollow'], ['loop', 1, 'hollow']] },
    { dg: caveNav(glim), plan: [['grove', 3, 'fungal'], ['bellpit', 4, 'hollow'], ['fossil', 2, 'fungal'], ['shore', 1, 'fungal']] },
  ];
  S.chests ||= [];   // (the summit's Eyrie put its own in first)
  const rock = M('rock_05_overworld_granite_1_02', 3, { tint: 0xc8c2b8, tri: true }), moss = M('rock_06_overworld_mossy_rock_1_03', 2.4, { tint: 0xc0c4b0, tri: true });
  const bone = M('castle_keep_ivory_chapel_marble', 2.2, { tint: 0xe8dcc4 });   // (the marble's grain fine enough to read as bone)
  const witch = (x, y, z, color, range = 7.5, power = 6) => (ctx.witchLights ||= []).push(Object.assign([x, y, z, 0.3, true], { color, witch: true, range, power }));
  // (a chamber's middle, or a passage's far end)
  const at = (c, tag) => { const f = c.features.find((q) => q.tag === tag), [a, b] = f.type === 'room' ? [f.a, f.b] : f.pts.at(-1); return { f, x: c.px + a, z: c.pz + b, y: c.floorAt(c.px + a, c.pz + b) }; };

  // ---- the Well: its shaft up through the rock to the slope (a wall of rock all round, its lip cut
  // in the ground), and the ledges that climb it, most a jump apart, every fourth a jump and a jump
  // more; the goat men's hoard on a broad ledge halfway up, a glint of gold on it
  { const W = at(throat, 'well'), R = 6.0, N = 30;
    const rim = (a) => S.heightAt(W.x + Math.cos(a) * R, W.z + Math.sin(a) * R);
    let lip = -Infinity; for (let k = 0; k < N; k++) lip = Math.max(lip, rim(k / N * Math.PI * 2));
    const y0 = W.y + 5, P = [], I = [], rows = 10;
    for (let k = 0; k <= N; k++) {
      const a = k / N * Math.PI * 2, top = rim(a) + 0.35;
      for (let r = 0; r <= rows; r++) { const y = y0 + (top - y0) * r / rows; P.push(W.x + Math.cos(a) * R, y, W.z + Math.sin(a) * R); }
    }
    for (let k = 0; k < N; k++) for (let r = 0; r < rows; r++) { const a = k * (rows + 1) + r, c = a + rows + 1; I.push(a, c, a + 1, c, c + 1, a + 1); }   // (wound to face in)
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    const shaft = new THREE.Mesh(g, rock); shaft.receiveShadow = true; ctx.scene.add(shaft);
    for (let k = 0; k < N; k++) {
      const a = k / N * Math.PI * 2, a2 = (k + 1) / N * Math.PI * 2;
      physics.addSeg(W.x + Math.cos(a) * (R + 0.3), W.z + Math.sin(a) * (R + 0.3), W.x + Math.cos(a2) * (R + 0.3), W.z + Math.sin(a2) * (R + 0.3), W.y - 1, lip + 1.5, 0.6);
    }
    hole(W.x - 4.2, W.z - 4.2, W.x + 4.2, W.z + 4.2, Infinity, physics);
    // the ledges (starting across from where the way comes in)
    const way = at(throat, 'way'), a0 = Math.atan2(way.z - W.z, way.x - W.x) + Math.PI * 0.7;
    let y = W.y + 1.0, a = a0, n = 0, hoardAt = null;
    const steps = [];
    while (y < lip - 0.4) {
      const big = n === 5, rr = big ? 4.6 : 5.0, x = W.x + Math.cos(a) * rr, z = W.z + Math.sin(a) * rr, s = big ? 1.35 : 0.85;
      b.place(x, y, z, a, 1, (o) => {
        o.blob([0, -0.4, 0], [s, 0.42, s], rock, { detail: 2, jitter: 0.15, seed: 300 + n });
        o.blob([0, 0.0, 0], [s * 0.8, 0.08, s * 0.8], moss, { detail: 1, jitter: 0.25, seed: 340 + n });
      }, { solid: false });
      physics.add([x - s * 0.75, y - 0.8, z - s * 0.75], [x + s * 0.75, y, z + s * 0.75], 'rock');
      steps.push([x, y, z]);
      if (big) hoardAt = { x: W.x + Math.cos(a) * 5.2, z: W.z + Math.sin(a) * 5.2, y, a };
      n++;
      y += n % 4 === 0 ? 1.65 : 1.0;          // (every fourth: the Wingbell's second jump)
      a += big ? 0.62 : 0.46;
    }
    if (hoardAt) {
      ctx.props?.add('chest_gilded_iron', hoardAt.x, hoardAt.y, hoardAt.z, hoardAt.a + Math.PI / 2, 1);
      S.chests.push({ id: 'chest_gilded_iron', x: hoardAt.x, z: hoardAt.z, name: 'The Wethers\' Hoard', charm: 'goatfoot' });
      witch(hoardAt.x, hoardAt.y + 0.8, hoardAt.z, 0xffc860, 3.5, 1.6);       // (a glint of gold up the shaft)
    }
    witch(W.x, lip - 4, W.z, 0xdfe6ff, 24, 5);                                   // (the daylight down the well)
    // its lip: a ring of stones, and a cairn so it's found from the slope
    for (let k = 0; k < 14; k++) {
      const q = k / 14 * Math.PI * 2, x = W.x + Math.cos(q) * 6.4, z = W.z + Math.sin(q) * 6.4, s = 0.5 + ((k * 37) % 7) / 14;
      b.place(x, S.heightAt(x, z) - 0.2, z, q, 1, (o) => o.blob([0, s * 0.4, 0], [s, s * 0.6, s * 0.8], k % 3 ? rock : moss, { detail: 1, jitter: 0.22, seed: 360 + k }), { solid: false });
    }
    const cx = W.x + 8.5, cz = W.z, cy = S.heightAt(cx, cz);
    b.place(cx, cy, cz, 0, 1, (o) => { for (let i = 0; i < 5; i++) o.blob([Math.sin(i * 2.1) * 0.1, 0.18 + i * 0.24, 0], [0.34 - i * 0.04, 0.15, 0.3 - i * 0.04], rock, { detail: 1, jitter: 0.25, seed: 390 + i }); }, { solid: true, minHeight: 0.3 });
    S.well = { x: W.x, z: W.z, floor: W.y, lip, ledges: n, hoard: hoardAt, steps };
  }

  // ---- the Glimmerdeep's strange things
  { // crystals in the grove and along the shore of the lake
    const sp = (tag, n, s0, s1) => { for (let i = 0; i < n; i++) { const p = glim.spot(tag, 1.2); if (p) ctx.scatter?.place('glimmer_crystal', p.x, p.y, p.z, s0 + Math.random() * (s1 - s0)); } };
    let rs = 31; const RR = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
    for (const [tag, n] of [['grove', 4], ['lake', 2], ['shore', 1]]) for (let q = 0; q < n; q++) {
      const p = glim.wallSpot(tag, RR);
      if (!p) continue;
      const y = glim.floorAt(p.x, p.z) ?? p.y - 2, dx = Math.sin(p.rot), dz = Math.cos(p.rot);   // (p.rot faces out of the wall)
      for (let k = 0; k < 5; k++) { const a = RR() * 6.28, r = RR() * 1.1; ctx.scatter?.place('glimmer_crystal', p.x - dx * 0.4 + Math.cos(a) * r, y, p.z - dz * 0.4 + Math.sin(a) * r, 0.7 + RR() * (k ? 1.1 : 2.0)); }
      witch(p.x - dx * 1.2, y + 1.4, p.z - dz * 1.2, 0x50e0ff, 9, 3.2);   // (out in the room, lighting the clump and its wall)
    }
    // the island in the black lake, and on it the second hoard
    const w = glim.water;
    if (w) {
      const top = w.y + 0.55;
      b.place(w.x, w.y - 1.2, w.z, 0.3, 1, (o) => { o.blob([0, 0.85, 0], [2.4, 0.95, 2.1], rock, { detail: 2, jitter: 0.16, seed: 410 }); o.blob([0, 1.72, 0], [1.9, 0.12, 1.6], moss, { detail: 1, jitter: 0.25, seed: 411 }); }, { solid: false });
      physics.add([w.x - 1.8, w.y - 1.5, w.z - 1.5], [w.x + 1.8, top, w.z + 1.5], 'rock');
      ctx.props?.add('chest_gilded_iron', w.x + 0.3, top, w.z, -Math.PI / 2, 1);
      S.chests.push({ id: 'chest_gilded_iron', x: w.x + 0.3, z: w.z, name: 'The Drowned Hoard', charm: 'glimmerstone' });
      witch(w.x, top + 1.2, w.z, 0xffc060, 5, 1.8);                        // (a glint of gold across the black water)
    }
    // the skull in the wall: something horned and huge, the rock grown round it
    const F = at(glim, 'fossil'), fx = F.x + 3.2, fz = F.z, fy = F.y;
    b.place(fx, fy, fz, -Math.PI / 2, 1, (o) => {
      o.blob([0, 1.6, 0], [2.0, 1.5, 2.4], bone, { detail: 3, jitter: 0.08, seed: 430 });
      o.blob([0, 0.7, 1.8], [1.2, 0.8, 1.4], bone, { detail: 3, jitter: 0.1, seed: 431 });            // the muzzle
      for (const s of [-1, 1]) {
        o.blob([s * 0.85, 1.9, 1.2], [0.42, 0.38, 0.3], M('rock_02_cave_dark_basalt_1_05', 1), { detail: 1, jitter: 0.05, seed: 432 });   // the sockets
        let px = s * 1.3, py = 2.6, pz = -0.3, r = 0.55;                                               // the horns, curling back and down
        for (let k = 0; k < 8; k++) {
          const q = k * 0.55, nx = s * (1.6 + Math.sin(q) * 1.4), ny = 2.6 + Math.cos(q) * 1.3 - k * 0.12, nz = -0.3 - Math.sin(q * 0.8) * 1.6;
          o.beam([px, py, pz], [nx, ny, nz], r, r * 0.85, bone); px = nx; py = ny; pz = nz; r *= 0.86;
        }
      }
    }, { solid: false });
    physics.add([fx - 1.6, fy, fz - 2.4], [fx + 1.6, fy + 3, fz + 2.4], 'rock');
    witch(fx + 2.2, fy + 3.2, fz, 0x7cff5a, 8, 4);                          // (lit from behind: the horns against the glow)
    const ember = new THREE.SpriteMaterial({ map: (() => { const S2 = 32, cv = document.createElement('canvas'); cv.width = cv.height = S2; const g2 = cv.getContext('2d'), gr = g2.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,200,120,1)'); gr.addColorStop(0.4, 'rgba(255,60,20,0.8)'); gr.addColorStop(1, 'rgba(255,0,0,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, S2, S2); return new THREE.CanvasTexture(cv); })(),
      color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    for (const s of [-1, 1]) { const e = new THREE.Sprite(ember); e.position.set(fx - 1.25, fy + 1.9, fz + s * 0.85); e.scale.setScalar(0.5); ctx.scene.add(e); }
    for (const s of [-1, 1]) ctx.scatter?.place('skull_candle', fx - 2.4, fy, fz + s * 1.1, 1);
    // the kneeling ring round the bell half sunk in the floor
    const P = at(glim, 'bellpit'), bronze = M('castle_keep_ivory_chapel_marble', 0.6, { tint: 0x9a6a30 });
    b.place(P.x, P.y - 0.9, P.z, 0, 1, (o) => {
      o.lathe(0, 0, [[1.7, 0], [1.6, 0.2], [1.25, 0.9], [1.1, 1.7], [0.9, 2.3], [0.5, 2.55], [0, 2.6]], 24, bronze);
    }, { tag: 'rock' });
    for (let k = 0; k < 6; k++) {
      const q = k / 6 * Math.PI * 2, x = P.x + Math.cos(q) * 4.2, z = P.z + Math.sin(q) * 4.2;
      ctx.scatter?.place('kneeling_idol', x, glim.floorAt(x, z) ?? P.y, z, 1.1, Math.atan2(P.x - x, P.z - z));
    }
    S.bellPit = { x: P.x, y: P.y, z: P.z, rung: -99 };
  }
  physics.mountain = S;
}

// ------------------------------------------------------------------ Sorrowfall and the Still Water
/** Falling water's streaks (a canvas: bright threads with gaps, fading at the sheet's edges). */
function streakTexture() {
  const W = 64, H = 256, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), im = g.createImageData(W, H);
  let seed = 77; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const col = Array.from({ length: W }, () => [0.55 + R() * 0.45, R() * 6.28, 0.04 + R() * 0.09]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [b, ph, fq] = col[x], v = 0.6 + 0.4 * Math.sin(y * fq + ph) * Math.sin(y * fq * 0.37 + ph * 2);
    const edge = Math.pow(Math.sin(Math.PI * (x + 0.5) / W), 0.6), k = (y * W + x) * 4;
    im.data[k] = 210 + 45 * v; im.data[k + 1] = 232 + 23 * v; im.data[k + 2] = 255; im.data[k + 3] = 255 * edge * b * (0.35 + 0.65 * v);
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** A soft round puff (foam, mist). */
function puffTexture() {
  const S = 64, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(240,248,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(cv);
}

/** Sorrowfall: off its brink at the back of the shelf the water leaves flowing out, and falls free
 * (clear of the rock) into the pool: three sheets (dim behind, the body, a torn veil in front), its
 * streaks run down them; foam boils where it lands and mist drifts off; above the brink, the rill it
 * comes down. The Still Water's surface; the rock lip it pours from; a fire and a bench at the pool. */
function buildFalls(ctx, S, M) {
  const F = S.fallsSite;
  if (!F) return null;
  const { b, physics } = ctx;
  const ox = -F.ux, oz = -F.uz, tx = -oz, tz = ox;                 // out from the wall (toward the road), and across
  const bx = F.x + F.ux * 11.6, bz = F.z + F.uz * 11.6, top = S.heightAt(bx, bz) - 0.1;
  const pool = { x: F.x + F.ux * F.bowl[2], z: F.z + F.uz * F.bowl[2], r: F.bowl[0], y: F.y - 0.3 };
  const V0 = 2.6, G9 = 9.8, T = Math.sqrt(2 * Math.max(1, top - pool.y) / G9), drop = top - pool.y;
  const streak = streakTexture(), puff = puffTexture(), mats = [];
  const sheet = (off, wide, color, opacity, speed) => {
    const rows = 20, cols = 6, P = [], U = [], I = [];
    for (let r = 0; r <= rows; r++) {
      const t = T * r / rows, along = V0 * t + off, y = top - 0.5 * G9 * t * t, w = wide * (1 + 0.6 * r / rows);
      for (let c = 0; c <= cols; c++) {
        const u = c / cols - 0.5;
        P.push(bx + ox * along + tx * u * w, y, bz + oz * along + tz * u * w); U.push(c / cols, r / rows * drop / 4);
        if (r && c) { const a = (r - 1) * (cols + 1) + c - 1, bb = a + 1, cc = a + cols + 1, d = cc + 1; I.push(a, cc, bb, bb, cc, d); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
    const map = streak.clone(); map.needsUpdate = true;
    const m = new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    mats.push({ m, map, speed, base: new THREE.Color(color) });
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2;
    ctx.scene.add(mesh);
    return mesh;
  };
  sheet(-0.25, 2.6, 0xa8c4d4, 0.7, 0.9); sheet(0, 3.0, 0xffffff, 0.85, 1.35); sheet(0.3, 3.3, 0xffffff, 0.45, 1.8);
  // the rill above the brink: down the slope from the snowfields, a ribbon a hand over the ground
  { const P = [], U = [], I = []; let x = bx, z = bz, along = 0;
    for (let s = 0; s < 18; s++) {
      const w = 0.8 + 0.25 * Math.sin(s * 0.9);
      for (const side of [-1, 1]) { const px = x + tx * w * side, pz = z + tz * w * side; P.push(px, S.heightAt(px, pz) + 0.07, pz); U.push(side < 0 ? 0 : 1, along / 4); }
      if (s) { const a = (s - 1) * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const q = Math.sin(s * 0.7) * 0.6; x += (F.ux + tx * q) * 3.4; z += (F.uz + tz * q) * 3.4; along += 3.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
    const map = streak.clone(); map.needsUpdate = true;
    const m = new THREE.MeshBasicMaterial({ map, color: 0xd8ecf4, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    mats.push({ m, map, speed: -0.5, base: new THREE.Color(0xd8ecf4) });
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 1; ctx.scene.add(mesh);
  }
  // the lip it pours from, mossy, and the rocks it lands among
  const rock = M('rock_05_overworld_granite_1_02', 3, { tint: 0xb8b4ac, tri: true }), moss = M('rock_06_overworld_mossy_rock_1_03', 2.4, { tint: 0xb0b8a0, tri: true });
  b.place(bx - ox * 0.6, top - 0.5, bz - oz * 0.6, Math.atan2(ox, oz), 1, (o) => {
    o.blob([0, 0, 0.3], [2.4, 0.55, 1.3], rock, { detail: 2, jitter: 0.15, seed: 501 });
    o.blob([0, 0.45, 0.1], [2.0, 0.15, 1.0], moss, { detail: 1, jitter: 0.25, seed: 502 });
  }, { solid: false });
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9 + 0.4, r = pool.r - 0.4 + (k % 2) * 0.6, x = pool.x + Math.cos(a) * r, z = pool.z + Math.sin(a) * r, s = 0.4 + (k % 3) * 0.25;
    if ((Math.cos(a) * ox + Math.sin(a) * oz) > 0.6) continue;      // (the side toward the road stays open)
    b.place(x, pool.y - 0.3, z, a, 1, (o) => o.blob([0, s * 0.5, 0], [s * 1.3, s * 0.8, s], k % 2 ? moss : rock, { detail: 1, jitter: 0.2, seed: 520 + k }), { solid: false });
  }
  // the Still Water
  const wm = new THREE.Mesh(new THREE.CircleGeometry(pool.r + 0.4, 40).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({
    color: 0x103038, emissive: 0x030b0d, specular: 0x9ad8e8, shininess: 110, transparent: true, opacity: 0.84, depthWrite: false }));
  wm.position.set(pool.x, pool.y, pool.z); wm.renderOrder = 1; ctx.scene.add(wm);
  // foam where it lands, mist off it
  const foot = { x: bx + ox * V0 * T, z: bz + oz * V0 * T }, puffs = [];
  for (let k = 0; k < 11; k++) {
    const mist = k >= 5, sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: 0xffffff, transparent: true, depthWrite: false, opacity: mist ? 0.25 : 0.7 }));
    sp.renderOrder = 3; ctx.scene.add(sp);
    puffs.push({ sp, mist, ph: k * 1.7, life: k / 11 });
  }
  // a fire and a bench at the pool's road side: a pilgrims' rest
  const sx = F.x + ox * 4.5 + tx * 3.2, sz = F.z + oz * 4.5 + tz * 3.2;
  ctx.scatter?.place('pilgrims_campfire', sx, S.heightAt(sx, sz), sz, 1);
  { const bx2 = sx + tx * 2.4, bz2 = sz + tz * 2.4, by = S.heightAt(bx2, bz2), wallM = M('stone_06_mossy_fieldstone_1_03', 1.6, { tri: true });
    b.place(bx2, by, bz2, Math.atan2(-tx, -tz), 1, (o) => { o.box([-0.9, 0, -0.18], [-0.6, 0.42, 0.18], wallM); o.box([0.6, 0, -0.18], [0.9, 0.42, 0.18], wallM); o.box([-1.1, 0.42, -0.26], [1.1, 0.55, 0.26], M('castle_keep_pale_keep_limestone', 1.2)); }, { solid: true, minHeight: 0.3 }); }
  S.falls = { x: foot.x, z: foot.z, top, pool, name: 'Sorrowfall' };
  // (the slimes on the wet shelf round the pool, not in it: in front of it and to either side)
  S.slimeSpots = [[ox * 7 + tx * 2, oz * 7 + tz * 2, [['azure', 'S', 2], ['azure', 'M', 1]]], [ox * 7.5 + tx * 0.5, oz * 7.5 + tz * 0.5, [['mire', 'S', 2], ['azure', 'XS', 2]]]]
    .map(([dx, dz, mix]) => ({ x: F.x + dx, z: F.z + dz, r: 2.8, mix }));
  let rested = false;
  S.updateFalls = (dt, t, day, player, toast) => {
    const k = 0.35 + 0.65 * day;
    for (const q of mats) { q.map.offset.y += dt * q.speed * (q.speed > 0 ? 1 : 1); q.m.color.copy(q.base).multiplyScalar(k); }
    for (const q of puffs) {
      q.life += dt * (q.mist ? 0.12 : 0.6);
      if (q.life > 1) q.life -= 1;
      const L = q.life;
      if (q.mist) {
        q.sp.position.set(foot.x + ox * L * 4 + tx * Math.sin(q.ph) * 1.5, pool.y + 0.5 + L * 3.5, foot.z + oz * L * 4 + tz * Math.sin(q.ph) * 1.5);
        q.sp.scale.setScalar(2 + L * 4); q.sp.material.opacity = 0.22 * Math.sin(Math.PI * L) * k;
      } else {
        q.sp.position.set(foot.x + tx * Math.sin(q.ph * 3) * 1.2, pool.y + 0.25 + L * 0.6, foot.z + tz * Math.cos(q.ph * 2) * 1.2);
        q.sp.scale.setScalar(1.4 + L * 1.6); q.sp.material.opacity = 0.65 * Math.sin(Math.PI * L) * k;
      }
    }
    // the rest: in the cold water, wounds close
    const inPool = Math.hypot(player.pos.x - pool.x, player.pos.z - pool.z) < pool.r && player.pos.y < pool.y + 0.8;
    if (inPool) {
      if (player.health < player.maxHealth) player.health = Math.min(player.maxHealth, player.health + 12 * dt);
      if (!rested) { rested = true; toast?.('The Still Water is bitter cold. Your wounds close.'); }
    } else if (Math.hypot(player.pos.x - pool.x, player.pos.z - pool.z) > pool.r + 12) rested = false;
  };
  return S.falls;
}

// ------------------------------------------------------------------ the star-seals
/** The Sorrowhorn's star-seals (portals.js PORTALS: main.js adds them before the world is planted):
 * in the Broken Stair's clearing below the cliff, on the caves' forecourts, beside the Still Water and
 * on Hornhollow's green, each on level ground clear of the way through. */
export function mountainPortals(S) {
  const g = GATE.bearing, gx = Math.cos(g), gz = Math.sin(g), tx = -gz, tz = gx, out = [];
  out.push({ id: 'brokenstair', name: 'The Broken Stair', where: 'In the clearing below the cliff', land: 'Bellmourn and the Darkwood', x: gx * 288 + tx * 6, z: gz * 288 + tz * 6, look: [gx * 300, gz * 300] });
  const [A, B] = S.caveSites || [];
  if (A) out.push({ id: 'throat', name: "The Wether's Throat", where: 'On the forecourt', land: 'The Sorrowhorn', x: A.x - 2, z: A.z - 3, look: "The Wether's Throat" });
  if (B) out.push({ id: 'glimmerdeep', name: 'The Glimmerdeep', where: 'On the forecourt', land: 'The Sorrowhorn', x: B.x - 2, z: B.z + 3, look: 'The Glimmerdeep' });
  const F = S.fallsSite;
  if (F) { const ox = -F.ux, oz = -F.uz, sx = -oz, sz = ox; out.push({ id: 'sorrowfall', name: 'Sorrowfall', where: 'Beside the Still Water', land: 'The Sorrowhorn', x: F.x + ox * 6.5 - sx * 5.5, z: F.z + oz * 6.5 - sz * 5.5, look: [F.x + F.ux * 11, F.z + F.uz * 11] }); }
  const V = S.villageSite;
  if (V) { const at2 = (f, s) => [V.x + V.ux * f - V.uz * s, V.z + V.uz * f + V.ux * s], [x, z] = at2(-8, -6); out.push({ id: 'hornhollow', name: 'Hornhollow', where: 'On the green', land: 'The Sorrowhorn', x, z, look: at2(2, 0) }); }
  // the Wardens': in Greywatch's court, and at Cairnwatch's foot
  for (const h of S.holds || []) {
    if (h.folk !== 'wardens' || !h.frame) continue;
    const F = h.frame, [x, z] = h.kind === 'keep' ? F.at(-6, 5) : F.at(0, 7.5);
    out.push({ id: h.id, name: h.name, where: h.kind === 'keep' ? 'In the court' : 'At the tower\'s foot', land: 'The Sorrowhorn', x, z, look: h.kind === 'keep' ? F.at(0, 11) : [F.x, F.z] });
  }
  return out;
}

// ------------------------------------------------------------------ Hornhollow's houses
/** Hornhollow's houses (main.js, after buildWorld: like Bellmourn's, each registers its own room).
 * Fieldstone under blue slate, flagged floors, rubble walls inside; each door faces the green. */
export function buildMountainVillage(ctx, M) {
  const S = ctx.mountain;
  if (!S?.homes) return;
  const V = S.villageSite, hm = houseMaterials(ctx.lib, M);
  S.homes.forEach((h, i) => {
    const dx = V.x - h.x, dz = V.z - h.z, door = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'e' : 'w') : (dz > 0 ? 's' : 'n');
    const store = i === 3;
    const spec = { name: 'hornhollow ' + i, title: h.title, x: h.x, z: h.z, y: V.y, w: store ? 8 : 9, d: 7, h: 3.4, storeys: 1, biome: 'mountain',
      wall: 'town_wall_fieldstone', roof: 'town_roof_blue_slate', floor: 'int_11_floor_stone_flagstone_1_02', lining: 'int_06_wall_rubble_stone_1_03', door,
      chimney: store ? null : [2, 1], openFront: store,
      furnish: store ? [['barrel', -2.5, -2], ['barrel', -2.5, -1], ['crate', 2.5, -2], ['crate', 2.5, -0.9], ['crate_long', 0, -2.4, Math.PI / 2]]
        : [['table', -1, 0, 0], ['stool', -1, 1.2], ['bed', 2.8, 1.5, Math.PI / 2], ['barrel', -3.3, -2.2], ['candelabrum', -3.4, 2.2], ['jar_storage', 3.3, -2.3]] };
    detailedHouse(ctx, spec, M, { ...hm, ...hm.perHouse(i + 3) });
    S.houseZones.push(ctx.zones.at(-1));
  });
}

// ------------------------------------------------------------------ the far land
/** The country beyond the edges of the playable land, as it's seen from high on the Sorrowhorn:
 * flat, a little below the ground, forest and meadow in patches under the haze (never reached; only
 * looked down on). Laid wherever there's no ground of the world's own (the village's disc, the
 * downs, the mountain), in big cells, cut finer where they meet it (any overlap lies hidden under
 * the ground). Out as far as the camera can see from the far side of the mountain. */
function farLand(ctx, S) {
  const own = (x, z) => Math.hypot(x, z) < 330 || (x > REGION.x0 + 6 && x < REGION.x1 - 6 && z > REGION.z0 + 6 && z < REGION.z1 - 6)
    || (S.covers(x, z) && S.heightAt(x, z) > 0.8);
  const P = [], C = [], c = new THREE.Color(), forest = new THREE.Color(0x26331f), meadow = new THREE.Color(0x56603a), heath = new THREE.Color(0x4a4636);
  const quad = (x0, z0, s) => {
    const a = P.length / 3;
    for (const [x, z] of [[x0, z0], [x0, z0 + s], [x0 + s, z0], [x0 + s, z0 + s]]) {
      P.push(x, -0.6, z);
      const f = fbm(x * 0.0021 + 4.1, z * 0.0021 + 9.3), h = fbm(x * 0.006, z * 0.006);
      c.copy(forest).lerp(meadow, smooth(0.45, 0.62, f)).lerp(heath, smooth(0.6, 0.75, h) * 0.6);
      C.push(c.r, c.g, c.b);
    }
    return a;
  };
  const I = [], E = 4800, BIG = 240, SUB = 24;
  for (let x0 = -E; x0 < E; x0 += BIG) for (let z0 = -E; z0 < E; z0 += BIG) {
    let inn = 0, n = 0;
    for (let i = 0; i <= 4; i++) for (let k = 0; k <= 4; k++) { n++; if (own(x0 + i * BIG / 4, z0 + k * BIG / 4)) inn++; }
    if (inn === n) continue;
    if (inn === 0) { const a = quad(x0, z0, BIG); I.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); continue; }
    for (let x1 = x0; x1 < x0 + BIG; x1 += SUB) for (let z1 = z0; z1 < z0 + BIG; z1 += SUB) {
      if (own(x1, z1) && own(x1 + SUB, z1) && own(x1, z1 + SUB) && own(x1 + SUB, z1 + SUB)) continue;
      const a = quad(x1, z1, SUB); I.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(P.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(I);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.name = 'far land'; m.matrixAutoUpdate = false; m.updateMatrix();
  ctx.scene.add(m);
  return m;
}

// ------------------------------------------------------------------ building it into the world
const LEDGES = [[-2.2, 1.85], [-0.2, 3.7], [1.8, 5.55], [3.6, 7.35], [5.2, 9.2]];   // [along the cliff (m), top] up the Broken Stair

/** Build the Sorrowhorn into the world: its land and road, the cliffs you can't climb and the one
 * stair you can (with the Wingbell), the lookouts, and where you may walk and what it's called. */
export function buildMountain(ctx, M) {
  const { b, physics } = ctx;
  const S = new Sorrowhorn();
  ctx.mountain = S;
  S.buildMesh(ctx);
  S.roadMesh = S.buildRoad(ctx, M('ground_gravel_03', 1.6, { tint: 0xd0c8bc }), S.road.slice(0, -3));
  S.trailMeshes = S.trails.map((t, i) => S.buildRoad(ctx, M('ground_dirt_02', 1.4, { tint: 0x8c8070 }), i === 0 ? t.pts.slice(0, -3) : t.pts, t.w * 0.7));
  { const tread = M('castle_keep_pale_keep_limestone', 1.2, { tint: 0x9a968e }), P0 = S.trails[0].pts;   // (the Shepherd's Stair: a stone tread every 3 m)
    for (let i = 1; i < P0.length - 3; i++) {
      const [x, z] = P0[i], [x2, z2] = P0[i + 1], y = S.heightAt(x, z);
      b.place(x, y - 0.06, z, Math.atan2(x2 - x, z2 - z), 1, (o) => o.box([-0.8, 0, -0.32], [0.8, 0.14, 0.32], tread), { solid: false });
    } }
  { const cm = M('stone_06_mossy_fieldstone_1_03', 1.6, { tri: true }), flag = M('cloth_04_aged_cream_linen', 0.5, { tint: 0xb83030 }), pole = M('ship_01_tarblack_oak', 1);
    S.trails.forEach((t, ti) => {
      for (let i = 4; i < t.pts.length - 2; i += 8) {
        const [x, z] = t.pts[i], [x2, z2] = t.pts[i + 1], [x0, z0] = t.pts[i - 1], L = Math.hypot(x2 - x, z2 - z) || 1, ox = -(z2 - z) / L, oz = (x2 - x) / L;
        const turn = Math.abs(Math.atan2(z2 - z, x2 - x) - Math.atan2(z - z0, x - x0)) > 0.6, cx = x + ox * (t.w + 0.9), cz = z + oz * (t.w + 0.9), cy = S.heightAt(cx, cz);
        b.place(cx, cy, cz, i, 1, (o) => {
          for (let k = 0; k < 4; k++) o.blob([Math.sin(k * 2.1) * 0.06, 0.13 + k * 0.17, 0], [0.24 - k * 0.04, 0.11, 0.21 - k * 0.035], cm, { detail: 0, jitter: 0.25, seed: 900 + ti * 100 + i + k });
          if (turn || i % 32 === 4) { o.box([-0.03, 0.5, -0.03], [0.03, 2.2, 0.03], pole); o.box([0.03, 1.75, -0.01], [0.55, 2.15, 0.01], flag); }
        }, { solid: false });
      }
    }); }
  for (const t of S.trails) (ctx.paths ||= []).push({ pts: t.pts.map(([x, z]) => [x, z]), w: t.w * 0.7 });
  S.farLand = farLand(ctx, S);
  buildFalls(ctx, S, M);
  (ctx.paths ||= []).push({ pts: S.road.map(([x, z]) => [x, z]), w: 1.9 });
  const rock = M('rock_05_overworld_granite_1_02', 3, { tint: 0xb8b2a8, tri: true }), moss = M('rock_06_overworld_mossy_rock_1_03', 2.6, { tint: 0xc0c4b0, tri: true });

  // ---- the skirt: a wall along the cliff's foot all round the mountain's land (you can't walk up
  // it), its top a little under the cliff's lip; lower and broken at the Broken Stair
  const gx = Math.cos(GATE.bearing), gz = Math.sin(GATE.bearing), tx = -gz, tz = gx;
  for (let a = ARC[0] + 0.04; a < ARC[1] - 0.04; a += 3.2 / 302) {
    const a2 = a + 3.2 / 302, r = 302.4;
    const ax = Math.cos(a) * r, az = Math.sin(a) * r, bx = Math.cos(a2) * r, bz = Math.sin(a2) * r;
    const top = Math.min(S.heightAt(ax * 1.02, az * 1.02), S.heightAt(bx * 1.02, bz * 1.02)) - 0.35;
    if (top > 1) physics.addSeg(ax, az, bx, bz, -2, top, 0.8);
  }
  // ---- the Broken Stair: blocks of the cliff fallen out of it, each too high above the last for one
  // jump; the last one at the lip. Moss on their tops (they've lain a long time)
  for (const [along, top] of LEDGES) {
    const r = 298.6 + top * 0.2, x = gx * r + tx * along, z = gz * r + tz * along;
    b.place(x, 0, z, Math.atan2(gx, gz) + along * 0.3, 1, (o) => {
      o.blob([0, top * 0.5, 0], [1.25, top * 0.5 + 0.05, 1.05], rock, { detail: 2, jitter: 0.12, seed: 71 + along * 10 });
      o.blob([0, top - 0.05, 0], [1.0, 0.18, 0.85], moss, { detail: 1, jitter: 0.2, seed: 7 + along * 10 });
    }, { solid: false });
    physics.add([x - 0.95, -1, z - 0.95], [x + 0.95, top, z + 0.95], 'rock');
  }

  // ---- the lookouts: where the road's outer edge falls away toward Bellmourn, a parapet of dry
  // stone, a bench to sit on and a cairn the pilgrims add a stone to
  const views = [];
  for (const want of [0.2, 0.45, 0.7]) {
    let best = null;
    for (let i = Math.floor(S.road.length * (want - 0.1)); i < Math.floor(S.road.length * (want + 0.1)); i += 3) {
      const [x, z, y] = S.road[i], [x2, z2] = S.road[Math.min(S.road.length - 1, i + 2)];
      if (S.shelves.some((c) => Math.hypot(x - c.x, z - c.z) < 70)) continue;   // (not under the goat men's noses, nor at a cave or the falls)
      { const ux0 = x2 - x, uz0 = z2 - z, L0 = Math.hypot(ux0, uz0) || 1, o0x = uz0 / L0, o0z = -ux0 / L0, s0 = Math.sign(o0x * (x - MOUNT.x) + o0z * (z - MOUNT.z)) || 1;
        let near = false;   // (its parapet stones, bench and cairn clear of the road, wherever it bends back)
        const oa = Math.atan2(o0z * s0, o0x * s0), test = (px, pz) => { const r = S.roadAt(px, pz); if (r && r.d < 2.6) near = true; };
        for (let k = -4; k <= 4; k++) test(x + Math.cos(oa + k * 0.13) * 3.6, z + Math.sin(oa + k * 0.13) * 3.6);
        test(x + Math.cos(oa) * 2.75, z + Math.sin(oa) * 2.75);
        if (near) continue; }
      const ux = x2 - x, uz = z2 - z, L = Math.hypot(ux, uz) || 1, ox = uz / L, oz = -ux / L;     // (the road's outer side: away from the mountain)
      const out = Math.sign(ox * (x - MOUNT.x) + oz * (z - MOUNT.z)) || 1;
      const vx = ox * out, vz = oz * out, toV = -(x * vx + z * vz) / Math.hypot(x, z);         // (facing the village?)
      const drop = y - S.heightAt(x + vx * 14, z + vz * 14);
      // (the view out toward Bellmourn must be clear of the mountain's own spurs: the worst clearance
      // along the line of sight for 600 m)
      const L2 = Math.hypot(x, z), dirx = -x / L2, dirz = -z / L2;
      let clear = Infinity;
      for (let k = 5; k < 400; k += k < 60 ? 5 : 20) { const qx = x + dirx * k, qz = z + dirz * k; if (!S.covers(qx, qz)) break; clear = Math.min(clear, y + 1.0 - k * 0.07 - S.heightAt(qx, qz)); }
      if (clear < -1) continue;
      const score = toV * 2 + drop * 0.05 + Math.min(clear, 40) * 0.02;
      if (!best || score > best.score) best = { score, i, x, z, y, vx, vz };
    }
    if (best && !views.some((v) => Math.hypot(v.x - best.x, v.z - best.z) < 150)) views.push(best);
  }
  const wallM = M('stone_06_mossy_fieldstone_1_03', 1.6, { tri: true });
  views.forEach((v, n) => {
    const cx = v.x + v.vx * 3.4, cz = v.z + v.vz * 3.4, y = S.heightAt(v.x, v.z);
    for (let k = -4; k <= 4; k++) {   // the parapet: a low arc of dry stone along the edge
      const a = Math.atan2(v.vz, v.vx) + k * 0.13, px = v.x + Math.cos(a) * 3.6, pz = v.z + Math.sin(a) * 3.6, py = S.heightAt(px, pz);
      b.place(px, py - 0.2, pz, a, 1, (o) => o.blob([0, 0.45, 0], [0.55, 0.5, 0.4], wallM, { detail: 1, jitter: 0.2, seed: 300 + n * 20 + k }), { solid: false });
      physics.add([px - 0.4, py - 0.5, pz - 0.4], [px + 0.4, py + 0.85, pz + 0.4], 'rock');
    }
    // the bench: a slab on two stones, facing out
    const bx = v.x + v.vx * 2.75, bz = v.z + v.vz * 2.75, by = S.heightAt(bx, bz), ang = Math.atan2(v.vx, v.vz);
    b.place(bx, by, bz, ang, 1, (o) => { o.box([-0.9, 0, -0.18], [-0.6, 0.42, 0.18], wallM); o.box([0.6, 0, -0.18], [0.9, 0.42, 0.18], wallM); o.box([-1.1, 0.42, -0.26], [1.1, 0.55, 0.26], M('castle_keep_pale_keep_limestone', 1.2)); }, { solid: true, minHeight: 0.3 });
    // the cairn, off to one side, a little prayer flag on a stick in it
    const kx = v.x + v.vx * 3.0 + v.vz * 2.6, kz = v.z + v.vz * 3.0 - v.vx * 2.6, ky = S.heightAt(kx, kz);
    b.place(kx, ky, kz, 0, 1, (o) => { for (let i = 0; i < 6; i++) o.blob([Math.sin(i * 2.1) * 0.12, 0.18 + i * 0.22, Math.cos(i * 2.1) * 0.1], [0.32 - i * 0.035, 0.14, 0.28 - i * 0.03], wallM, { detail: 1, jitter: 0.25, seed: 900 + i + n * 7 }); o.box([-0.02, 1.2, -0.02], [0.02, 2.0, 0.02], M('ship_01_tarblack_oak', 1)); o.box([0.02, 1.6, -0.01], [0.42, 1.95, 0.01], M('cloth_04_aged_cream_linen', 0.5, { tint: n ? 0xc04040 : 0x4060c0 })); }, { solid: true, minHeight: 0.3 });
    v.name = ["The Pilgrims' Rest", 'The Last Look', "The Wind's Seat"][n] || 'A lookout';
  });
  S.views = views;

  // ---- the Pilgrims' Track: off the Vigil Road through the Darkwood to the foot of the Broken Stair,
  // a worn dirt path between the trees, and a clearing at the cliff's foot so the stair shows
  const track = S.track = [[-112, -3], [-124, -38], [-146, -82], [-168, -126], [-188, -168], [gx * 293, gz * 293]];
  b.ribbon(M('ground_dirt_02', 1.4, { tint: 0x8c8070 }), track.map(([x, z]) => [x, z]), 1.3, 0.025);
  (ctx.paths ||= []).push({ pts: track, w: 1.3 });
  const segD = (x, z, P) => { let best = Infinity; for (let i = 0; i + 1 < P.length; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return best; };
  S.keepsClear = (x, z) => segD(x, z, track) < 4.5 || Math.hypot(x - gx * 296, z - gz * 296) < 13 || (S.covers(x, z) && S.heightAt(x, z) > 0.4);
  // an old waymarker where the track leaves the road: a standing stone with the pilgrims' bell cut in it
  b.place(-109.5, 0, -6.5, 0.4, 1, (o) => { o.blob([0, 0.9, 0], [0.32, 0.95, 0.22], wallM, { detail: 1, jitter: 0.08, seed: 41 }); }, { solid: true });

  // ---- the goat men's camps (foes.js populateMountain): on level ground a little off the road,
  // within a short scramble of it (a fold of meadow in the foothills, shelves among the crags, below
  // the shoulder), each round a fire: hide beds, a lean-to, their kills' bones, a ram's skull on a
  // stake to say whose ground it is
  const camps = S.camps;
  const P = (id, x, z, s = 1, rot = null) => ctx.scatter?.place(id, x, S.heightAt(x, z), z, s, rot);
  camps.forEach((c, n) => {
    P('goat_campfire', c.x, c.z, 1.2);
    ctx.chimneys?.push([c.x, S.heightAt(c.x, c.z) + 1.2, c.z]);           // (their smoke, seen from the road)
    for (let k = 0; k < 4; k++) { const a = n + k * 1.57 + 0.4; P('hide_bedroll', c.x + Math.cos(a) * 3.4, c.z + Math.sin(a) * 3.4, 1, a + Math.PI / 2); }
    const [rx0, rz0] = S.road[c.road], toRoad = Math.atan2(rz0 - c.z, rx0 - c.x), ta = toRoad + Math.PI;   // (the camp's back is away from the road)
    for (const off of [-1.1, 0, 1.1]) { const a = ta + off; P('hide_tent', c.x + Math.cos(a) * 7, c.z + Math.sin(a) * 7, 1.1, Math.atan2(-Math.cos(a), -Math.sin(a))); }
    { const stake = M('ship_01_tarblack_oak', 1, { tint: 0xb8a088 });                  // (the palisade: sharpened stakes, open toward the road)
      for (let k = -15; k <= 15; k++) {
        const a = ta + k * 0.12, x = c.x + Math.cos(a) * 10.5, z = c.z + Math.sin(a) * 10.5, y = S.heightAt(x, z), h = 1.7 + ((k * 37 + n * 11) % 5) * 0.12;
        b.place(x, y - 0.2, z, a, 1, (o) => { o.box([-0.1, 0, -0.1], [0.1, h, 0.1], stake); o.cone(0, 0, 0.14, h, 0.35, 5, stake); }, { solid: false });
        physics.add([x - 0.15, y - 0.2, z - 0.15], [x + 0.15, y + h, z + 0.15], 'post');
      }
      const ra = ta + 0.55, qx = c.x + Math.cos(ra) * 4.6, qz = c.z + Math.sin(ra) * 4.6, qy = S.heightAt(qx, qz);   // (a drying rack, a hide stretched on it)
      b.place(qx, qy, qz, ra + Math.PI / 2, 1, (o) => { for (const s of [-1, 1]) o.box([s * 1.1 - 0.05, 0, -0.05], [s * 1.1 + 0.05, 1.9, 0.05], stake);
        o.box([-1.25, 1.85, -0.05], [1.25, 1.95, 0.05], stake); o.box([-0.9, 0.6, -0.02], [0.9, 1.8, 0.02], M('cloth_04_aged_cream_linen', 0.5, { tint: 0x6a4a30 })); }, { solid: true }); }
    P('gnawed_bones', c.x + Math.cos(ta + 2.2) * 5, c.z + Math.sin(ta + 2.2) * 5, 1);
    P('goat_weapon_cache', c.x + Math.cos(ta - 1.9) * 5.2, c.z + Math.sin(ta - 1.9) * 5.2, 1, ta);
    // the ram's skull on its stake, facing the road
    const [rx, rz] = S.road[c.road], sa = Math.atan2(rx - c.x, rz - c.z), sx = c.x + Math.sin(sa) * 8, sz = c.z + Math.cos(sa) * 8, sy = S.heightAt(sx, sz);
    const bone = M('castle_keep_ivory_chapel_marble', 0.5), pole = M('castle_keep_pale_keep_limestone', 0.6, { tint: 0x8a7458 });   // (a weathered stave, a bleached skull)
    b.place(sx, sy, sz, sa, 1, (o) => {
      o.box([-0.09, 0, -0.09], [0.09, 2.6, 0.09], pole);
      o.box([-0.5, 1.9, -0.05], [0.5, 2.0, 0.05], pole);                          // (a crossbar, bones hung from it)
      for (const s of [-0.38, 0, 0.38]) o.blob([s, 1.62, 0], [0.05, 0.22, 0.05], bone, { detail: 0, jitter: 0.1, seed: 60 + n });
      o.blob([0, 2.82, 0.08], [0.3, 0.36, 0.42], bone, { detail: 1, jitter: 0.06, seed: 50 + n });
      for (const s of [-1, 1]) {                            // the horns, curling back and out
        let px = s * 0.2, py = 3.05, pz = -0.04, r = 0.14;
        for (let k = 0; k < 6; k++) {
          const a = k * 0.62, nx = s * (0.26 + Math.sin(a) * 0.3) + px * 0.55, ny = py + Math.cos(a) * 0.22 - 0.04, nz = pz - 0.15 + k * 0.02;
          o.beam([px, py, pz], [nx, ny, nz], r, r * 0.82, bone);
          px = nx; py = ny; pz = nz; r *= 0.82;
        }
      }
    }, { solid: false });
    physics.add([sx - 0.14, sy - 0.2, sz - 0.14], [sx + 0.14, sy + 2.7, sz + 0.14], 'post');
  });

  // ---- Hornhollow: four stone houses round a green on the shoulder's shelf (their backs to the crag
  // and its open side to where the road comes in), a wayside shrine at the foot of the Shepherd's
  // Stair with an empty bell-frame (the goat men took its bell), a well, the woodpiles and hay of a
  // hill village. Its folk keep to their doors (S.givers: main.js gives them their posts)
  { const V = S.villageSite, vy = V.y, fx = V.ux, fz = V.uz, sx = -fz, sz = fx;
    const at2 = (f, s) => [V.x + fx * f + sx * s, V.z + fz * f + sz * s];
    S.houseZones = [];
    S.homes = [[10, -11, "Elder Maud's House"], [10, 11, "Tamsin's House"], [-3, -14, "Jory's House"], [-3, 14, 'The Hornhollow Store']].map(([f, s, title]) => { const [x, z] = at2(f, s); return { x, z, title }; });
    const P2 = (id, f, s, sc = 1, rot = null) => { const [x, z] = at2(f, s); ctx.scatter?.place(id, x, vy, z, sc, rot); };
    P2('hornhollow_stone_well', 2, 0, 1.1); P2('hornhollow_trough', -7, 5, 1, Math.atan2(sx, sz)); P2('hornhollow_campfire', -1, 4);   // (the doors kept clear)
    // the wayside shrine and its empty bell-frame, at the stair's foot
    const [shx, shz] = at2(16, 5), stone = M('castle_keep_pale_keep_limestone', 1.2), wood = M('ship_01_tarblack_oak', 1);
    b.place(shx, vy, shz, Math.atan2(-fx, -fz), 1, (o) => {
      o.box([-1.2, 0, -0.8], [1.2, 0.5, 0.8], stone);
      for (const s2 of [-1, 1]) o.box([s2 * 0.95 - 0.12, 0.5, -0.12], [s2 * 0.95 + 0.12, 2.7, 0.12], wood);
      o.box([-1.2, 2.7, -0.16], [1.2, 2.95, 0.16], wood);
      o.box([-1.4, 2.95, -0.7], [1.4, 3.1, 0.7], M('castle_keep_ivory_chapel_marble', 1, { tint: 0x7a6a58 }));
    }, { solid: true });
    S.shrineBell = { x: shx, y: vy + 2.05, z: shz };
    // its people: Maud at the shrine, Jory by the well, Tamsin at her door
    const post = (f, s, lf, ls) => { const [x, z] = at2(f, s), [tx2, tz2] = at2(lf, ls); return [x, z, Math.atan2(tx2 - x, tz2 - z)]; };
    S.givers = Object.assign(S.givers || {}, {      // (the Wardens' are in already: holds.js)
      Maud: { key: 'hornMaud', post: post(14.5, 3.2, 0, 0), floor: vy },
      Jory: { key: 'hornJory', post: post(3, -3, -10, -2), floor: vy },
      Tamsin: { key: 'hornTamsin', post: post(6.5, 8.5, 0, 0), floor: vy },
    });
  }

  // ---- the summit: a little platform at the top of the horn, the great cairn the pilgrims build
  // stone by stone, prayer flags strung from it, the beacon's iron basket (cold since the goat men came),
  // and beside it the Eyrie: a spire of rock with ledges round it and a hoard at its top
  { const T = S.summitSite, ty = T.y, rock = M('rock_05_overworld_granite_1_02', 3, { tint: 0xd0ccc4, tri: true }), moss = M('rock_06_overworld_mossy_rock_1_03', 2.4, { tint: 0xc0c4b0, tri: true });
    const wallM = M('stone_06_mossy_fieldstone_1_03', 1.6, { tri: true }), iron = M('castle_basalt', 1, { tint: 0x504c48 }), cloth = (c) => M('cloth_04_aged_cream_linen', 0.5, { tint: c });
    b.place(T.x, ty, T.z, 0, 1, (o) => { for (let i = 0; i < 9; i++) o.blob([Math.sin(i * 2.3) * 0.25, 0.3 + i * 0.4, Math.cos(i * 2.3) * 0.2], [1.3 - i * 0.12, 0.3, 1.15 - i * 0.11], wallM, { detail: 1, jitter: 0.22, seed: 700 + i }); }, { solid: true, minHeight: 0.5 });
    // the beacon: a stone plinth, an iron basket of cold logs
    const bx = T.x + 3.2, bz = T.z - 1.5;
    b.place(bx, ty, bz, 0.4, 1, (o) => {
      o.box([-0.7, 0, -0.7], [0.7, 1.1, 0.7], wallM);
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; o.beam([Math.cos(a) * 0.35, 1.1, Math.sin(a) * 0.35], [Math.cos(a) * 0.7, 2.0, Math.sin(a) * 0.7], 0.05, 0.05, iron); }
      for (let k = 0; k < 4; k++) o.beam([-0.45, 1.4 + k * 0.08, -0.3 + k * 0.2], [0.45, 1.45 + k * 0.08, 0.3 - k * 0.2], 0.09, 0.09, M('ship_01_tarblack_oak', 1));
    }, { solid: true });
    // prayer flags from the cairn to three poles
    for (let k = 0; k < 3; k++) {
      const a = 0.9 + k * 2.1, px = T.x + Math.cos(a) * 4.2, pz = T.z + Math.sin(a) * 4.2;
      b.place(px, ty, pz, 0, 1, (o) => o.box([-0.04, 0, -0.04], [0.04, 2.6, 0.04], M('ship_01_tarblack_oak', 1)), { solid: true });
      { const rope = M('ship_01_tarblack_oak', 1, { tint: 0x605040 });                 // (the line they hang on)
        let lx = T.x, ly = ty + 3.4, lz = T.z;
        for (let f = 1; f <= 6; f++) { const u = f / 6, nx = T.x + (px - T.x) * u, nz = T.z + (pz - T.z) * u, ny = ty + 3.4 - 0.9 * u - Math.sin(Math.PI * u) * 0.5;
          b.place(0, 0, 0, 0, 1, (o) => o.beam([lx, ly, lz], [nx, ny, nz], 0.012, 0.012, rope), { solid: false }); lx = nx; ly = ny; lz = nz; } }
      for (let f = 1; f < 6; f++) {
        const u = f / 6, x = T.x + (px - T.x) * u, z = T.z + (pz - T.z) * u, y = ty + 3.4 - (3.4 - 2.5) * u - Math.sin(Math.PI * u) * 0.5;
        b.place(x, y, z, Math.atan2(px - T.x, pz - T.z) + Math.PI / 2, 1, (o) => o.box([-0.16, -0.3, -0.01], [0.16, 0, 0.01], cloth([0xc04040, 0x4060c0, 0xe0c040, 0x40a060, 0xe8e0d0][(f + k) % 5])), { solid: false });
      }
    }
    // the Eyrie: a spire of rock off the platform's edge, its ledges, its hoard
    // (its foot at the platform's edge, its ledges starting from the platform's level)
    // (its foot on the summit's shoulder, and its root carried on down to the lowest ground under it,
    // with a skirt of fallen rock where it meets the slope: it grows out of the mountain, not off it)
    const ea = Math.atan2(T.z - S.villageSite.z, T.x - S.villageSite.x) + 0.9, ex = T.x + Math.cos(ea) * 9.5, ez = T.z + Math.sin(ea) * 9.5, ey0 = Math.max(S.heightAt(ex, ez), ty), eh = 11;
    let gmin = ey0; for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; for (const r of [1.5, 2.6, 3.6]) gmin = Math.min(gmin, S.heightAt(ex + Math.cos(a) * r, ez + Math.sin(a) * r)); }
    const root = gmin - 2.5;
    b.place(ex, root, ez, 0.3, 1, (o) => {
      o.cylinder([0, 0, 0], [0, ey0 - 1 - root, 0], 3.6, 9, rock, { r1: 2.35 });
      o.cylinder([0, ey0 - 1 - root, 0], [0.25, ey0 - 1 - root + eh + 1, -0.2], 2.35, 9, rock, { r1: 1.45 });
      for (let i = 0; i < 5; i++) o.blob([Math.sin(i * 2.4) * 1.2, ey0 - 1 - root + 1.5 + i * 2.2, Math.cos(i * 2.4) * 1.1], [1.0, 1.6, 0.9], rock, { detail: 2, jitter: 0.2, seed: 760 + i });   // (its shoulders and buttresses)
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; o.blob([Math.cos(a) * 3.3, 1.2 + (i % 3) * 0.6, Math.sin(a) * 3.3], [1.6, 1.4, 1.4], moss, { detail: 2, jitter: 0.25, seed: 820 + i }); }   // (its skirt)
    }, { solid: false });
    physics.add([ex - 1.5, root, ez - 1.5], [ex + 1.5, ey0 + eh, ez + 1.5], 'rock');
    const steps = ledgeClimb(ctx, rock, moss, ex, ez, ey0 + 1.0, ey0 + eh - 0.5, 2.9, ea + Math.PI, 800, { step: 0.62 });
    const top = ey0 + eh;
    b.place(ex, top - 0.3, ez, 0, 1, (o) => {
      o.blob([0, -0.25, 0], [1.2, 0.75, 1.1], rock, { detail: 3, jitter: 0.18, seed: 790 });   // (the crag's head, inside its outline)
      const stick = M('ship_01_tarblack_oak', 1, { tint: 0xa08868 });             // (a nest of sticks round the hoard: something big roosts here)
      for (let k = 0; k < 44; k++) { const a = k * 2.399, r = 1.0 + (k % 3) * 0.18, a2 = a + 0.9 + (k % 5) * 0.12, y0 = 0.25 + (k % 4) * 0.07;
        o.cylinder([Math.cos(a) * r, y0, Math.sin(a) * r], [Math.cos(a2) * (r + 0.1), y0 + 0.12, Math.sin(a2) * (r + 0.1)], 0.035, 4, stick, { caps: false }); }
    }, { solid: false });
    physics.add([ex - 1.3, top - 0.6, ez - 1.3], [ex + 1.3, top, ez + 1.3], 'rock');
    ctx.props?.add('chest_gilded_iron', ex, top, ez, ea, 1);
    b.place(ex + 1, top, ez + 0.6, 0, 1, (o) => { o.box([-0.04, 0, -0.04], [0.04, 3.2, 0.04], M('ship_01_tarblack_oak', 1)); o.box([0.04, 2.3, -0.02], [1.2, 3.1, 0.02], M('cloth_04_aged_cream_linen', 0.5, { tint: 0xc03030 })); }, { solid: false });   // (a flag over the hoard)
    (S.chests ||= []).push({ id: 'chest_gilded_iron', x: ex, z: ez, name: "The Eyrie's Hoard", charm: null });
    S.eyrie = { x: ex, z: ez, y0: ey0, top, steps };
    S.summit = { x: T.x, z: T.z, y: ty, beacon: [bx, ty + 1.4, bz] };
    // the snowbloom: on the snowfields beside the upper Stair (gathered for Tamsin)
    const stair = S.trails[0].pts, snow = [];
    for (let i = 0; i < stair.length && snow.length < 14; i += 5) {
      const [x, z, y] = stair[i];
      if (y < ty - 75) continue;
      for (const side of [-1, 1]) {
        const j = Math.min(stair.length - 1, i + 1), dx = stair[j][0] - x, dz = stair[j][1] - z, L = Math.hypot(dx, dz) || 1, off = 5 + ((i * 7) % 6);
        const qx = x - dz / L * off * side, qz = z + dx / L * off * side;
        if (S.slopeAt(qx, qz) < 0.55) snow.push([qx, S.heightAt(qx, qz) + 0.3, qz]);
      }
    }
    S.snowSpots = (n) => snow.slice(0, n);
  }

  // ---- what grows and lies on it: conifers in the foothills and up the lower flanks (thinning as
  // it climbs), boulders fallen from the crags (more higher up), grass and heather along the road.
  // Never on the road, never in the lookouts
  { let seed = 4242; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const offRoad = (x, z, pad) => { const r = S.roadAt(x, z), t = S.trailAt(x, z); return (!r || r.d > ROAD_W + pad) && (!t || t.d > t.w + pad); };
    const awayFromViews = (x, z) => !views.some((v) => Math.hypot(x - v.x, z - v.z) < 12) && !S.shelves.some((c) => Math.hypot(x - c.x, z - c.z) < c.r1 + 2);
    const boulder = [rock, M('rock_02_cave_dark_basalt_1_05', 3, { tint: 0xb8b8c0, tri: true }), moss];
    let trees = 0, rocks = 0;
    for (let i = 0; i < 9000 && (trees < 520 || rocks < 260); i++) {
      const x = BOX.x0 + R() * (BOX.x1 - BOX.x0), z = BOX.z0 + R() * (BOX.z1 - BOX.z0), k = R(), sc = R();
      if (!S.covers(x, z) || Math.hypot(x, z) < GATE.r1 + 6) continue;
      const y = S.heightAt(x, z), sl = S.slopeAt(x, z);
      if (!offRoad(x, z, 2) || !awayFromViews(x, z)) continue;
      const treeChance = (1 - smooth(110, 230, y)) * (sl < 0.55 ? 1 : 0);
      if (trees < 520 && k < treeChance * 0.7 && ctx.trees3d) { ctx.trees3d.add(['pine', 'cedar', 'pine', 'redwood'][trees % 4], x, y - 0.2, z, 0.85 + sc * 0.5); trees++; continue; }
      if (rocks < 260 && k > 0.7 && sl < 0.8 && offRoad(x, z, 2 + (0.7 + sc * (y > 200 ? 2.6 : 1.6)) * 1.25)) {
        const s = 0.7 + sc * (y > 200 ? 2.6 : 1.6), m = boulder[rocks % 3];
        b.place(x, y - s * 0.3, z, sc * 6.28, 1, (o) => o.blob([0, s * 0.45, 0], [s * 1.2, s * 0.8, s], m, { detail: 2, jitter: 0.22, seed: 600 + rocks }), { solid: s > 1.1, tag: 'rock' });
        (S.boulders ||= []).push([x, z, s]);   // (dressing.js lays their fallen stone round them)
        rocks++;
      }
    }
    const tufts = ctx.lib.sprites ? ctx.lib.sprites('scatter', (s) => /fern|wildflowers|dry_reeds|thorn_bush|heather|leafy_shrub/.test(s.id)) : [];
    if (tufts.length) for (let s = 0; s < S.road.length; s += 3) {
      const [x, z] = S.road[s], [x2, z2] = S.road[Math.min(S.road.length - 1, s + 1)], ux = x2 - x, uz = z2 - z, L = Math.hypot(ux, uz) || 1;
      for (const side of [-1, 1]) {
        if (R() < 0.45) continue;
        const off = ROAD_W + 0.4 + R() * 3, px = x + (-uz / L) * off * side, pz = z + (ux / L) * off * side;
        if (S.heightAt(px, pz) > 330 || S.slopeAt(px, pz) > 0.6) continue;
        ctx.bill.add(tufts[(s + side + 2) % tufts.length].id, px, S.heightAt(px, pz), pz, 0.55 + R() * 0.4, 0.8 + R() * 0.3);
      }
    }
    S.dressing = { trees, rocks };
  }

  // ---- the war on the mountain: the keeps and towers, the Red Scythe's war camp, the bands' ledges,
  // the ambushes' rocks, the side paths' signposts, the crags (holds.js; reavers.js peoples them)
  buildHolds(ctx, S, M, { ledgeClimb });

  /** Where a quest's thing waits (quests.js deepest): the shrine bell in Gorehoof's camp, the old horn
   * at the summit cairn's foot. [x, y, z] or null. */
  S.fetchSpot = (place) => {
    if (place === 'gorehoof') { const c = S.camps[3]; return [c.x + 2.5, c.y + 0.4, c.z - 1.5]; }
    if (place === 'summit' && S.summit) return [S.summit.x - 1.6, S.summit.y + 0.4, S.summit.z + 1.2];
    if (place === 'crowstep') { const h = S.hold?.('crowstep'); if (h?.frame) { const [x, z] = h.frame.at(5.5, -4.8); return [x, S.heightAt(x, z) + 0.5, z]; } }
    return null;
  };

  /** The caves' chests as the loot found them (main.js, after loot.findProps): hoards with a charm. */
  S.claimChests = (loot) => {
    for (const ch of S.chests || []) {
      const c = loot.containers.find((q) => q.id === ch.id && Math.abs(q.x - ch.x) < 0.3 && Math.abs(q.z - ch.z) < 0.3);
      if (!c) continue;
      c.holds = { ...c.holds, name: ch.name };
      c.contents = () => mountainHoard(ch.charm).filter(Boolean);
    }
  };
  /** Each frame: the Glimmerdeep's bell rings when you come near it (and not again for a while). */
  S.update = (dt, player, audio, t, o = {}) => {
    S.updateFalls?.(dt, t, o.day ?? 1, player, o.toast);
    if (!S.beaconLit && S.summit && o.quests?.state?.hh_horn?.s === 'done') {    // (the Horn Beacon burning again: Jory's thanks)
      S.beaconLit = true;
      const [x, y, z] = S.summit.beacon;
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g2 = cv.getContext('2d'), gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.3, 'rgba(255,150,50,0.8)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
      const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      flare.position.set(x, y + 1.2, z); flare.scale.setScalar(16); flare.renderOrder = 9; ctx.scene.add(flare); S.beaconFlare = flare;
      (ctx.witchLights ||= []).push(Object.assign([x, y + 1.4, z, 0.3, true], { color: 0xff9a40, witch: true, range: 26, power: 9 }));
      ctx.chimneys?.push([x, y + 1.6, z]);
    }
    if (S.beaconFlare) {   // (at least a spark on the screen from Bellmourn: it grows with the distance)
      const [x, y, z] = S.summit.beacon, d = Math.hypot(player.pos.x - x, player.pos.y - y, player.pos.z - z);
      S.beaconFlare.scale.setScalar(Math.max(15, d * 0.014) * (1 + Math.sin(t * 7.3) * 0.07 + Math.sin(t * 3.1) * 0.05));
    }
    if (!S.bellHung && S.shrineBell && o.quests?.state?.hh_bell?.s === 'done') {      // (Hornhollow's bell, home in its frame)
      S.bellHung = true;
      const g = new THREE.LatheGeometry([[0.36, 0], [0.33, 0.06], [0.24, 0.24], [0.21, 0.42], [0.15, 0.55], [0, 0.6]].map(([r, y]) => new THREE.Vector2(r, y)), 18);
      const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0xb08040, specular: 0x806040, shininess: 60 }));
      m.position.set(S.shrineBell.x, S.shrineBell.y, S.shrineBell.z); ctx.scene.add(m);
    }
    const B = S.bellPit;
    if (!B || t - B.rung < 40) return;
    if (Math.hypot(player.pos.x - B.x, player.pos.z - B.z) < 7 && Math.abs(player.pos.y - B.y) < 4) { B.rung = t; audio?.towerBells?.({ near: 1, pan: 0, under: 1 }); }
  };

  // where you may walk on the mountain, and what each part of it is called
  S.place = (p) => {
    if (!S.covers(p.x, p.z)) return null;
    const ro = Math.hypot(p.x, p.z);
    if (ro < GATE.r1 + 30 && Math.abs(bearingOf(p.x, p.z) - GATE.bearing) < 0.2) return GATE.name;
    for (const v of views) if (Math.hypot(p.x - v.x, p.z - v.z) < 12) return v.name;
    for (const c of camps) if (Math.hypot(p.x - c.x, p.z - c.z) < 16) return c.name;
    for (const h of S.holds || []) if (Math.hypot(p.x - h.x, p.z - h.z) < h.r1 + 2) return h.name;
    for (const h of S.ledges || []) if (Math.hypot(p.x - h.x, p.z - h.z) < h.r1) return h.name;
    if (S.falls && Math.hypot(p.x - S.falls.pool.x, p.z - S.falls.pool.z) < 16) return 'Sorrowfall';
    const d = Math.hypot(p.x - MOUNT.x, p.z - MOUNT.z);
    if (d > MOUNT.R) return 'The Foothills of the Sorrowhorn';
    if (S.houseZones?.some((h) => p.x > h.x0 && p.x < h.x1 && p.z > h.z0 && p.z < h.z1 && p.y < h.y1 + 0.5)) return null;   // (indoors: main.js's zones)
    if (Math.hypot(p.x - S.villageSite.x, p.z - S.villageSite.z) < S.villageSite.r1) return 'Hornhollow';
    if (Math.hypot(p.x - S.summitSite.x, p.z - S.summitSite.z) < 22) return 'The Horn of the Sorrowhorn';
    const tr = S.trailAt(p.x, p.z);
    if (tr && tr.d < 6) return tr.t.name;
    if (p.y > SHOULDER - 10 && d < 200) return 'The Horn of the Sorrowhorn';
    const r = S.roadAt(p.x, p.z);
    if (r && r.d < 8) return "The Pilgrims' Road";
    return MOUNT.name;
  };
  return S;
}
