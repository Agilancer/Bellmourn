// The world's small detail, laid with intent (docs/DUNGEON_BUILDING.md: props follow function):
//   - kerbs: worn fieldstones lining the roads where people have bothered (where a road runs past
//     something: the village's gates, a bend, the approach to a place), never the whole length;
//   - outcrops: great bedded stones breaking out of the Darkwood's floor, the downs' slopes and the
//     Sorrowhorn's foothills, the strata tilted the way the mountain lifted them;
//   - groves: knots of broadleaf trees (oak, beech, elm, maple) round the mountain's feet, where the
//     conifers give out and the soil is deep, with stones and undergrowth among them;
//   - the old ruins: broken pillars of the Flame's first chapels, which Velscour had pulled down, a
//     ring or a row of them standing at different heights, their drums lying where they fell;
//   - the places statues stand (statues.js makes them, once the Sworn's bodies are made).
// Built before the forest is planted (main.js): `ctx.details.keepsClear` keeps trees off it all, and
// off the Temple of Velscour (temple.js) and the wayside camps (pastimes.js).
import { terrainHeight } from './terrain.js';

const TAU = Math.PI * 2;
let seed = 4447;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/** The ground anywhere: the mountain's where it is, the downs' and the forest's elsewhere. */
export function groundAt(ctx, x, z) { const S = ctx.mountain; return S?.covers(x, z) ? S.heightAt(x, z) : terrainHeight(x, z); }

/** Is (x, z) clear of every road and path (by `pad` m past its edge) and of the places that must stay
 * open (the keep, the crater, the delves' clearings, the temple, the camps, the mountain's pads)? */
function makeFree(ctx) {
  const segs = [];
  for (const p of ctx.paths || []) for (let i = 0; i + 1 < p.pts.length; i++) segs.push([p.pts[i], p.pts[i + 1], p.w]);
  const cell = 24, grid = new Map(), key = (i, k) => i * 73856 + k;
  segs.forEach((s, n) => { for (const [x, z] of [s[0], s[1]]) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const k = key(Math.floor(x / cell) + a, Math.floor(z / cell) + b); (grid.get(k) || grid.set(k, []).get(k)).push(n); } });
  const roadD = (x, z) => {
    let best = Infinity;
    for (const n of grid.get(key(Math.floor(x / cell), Math.floor(z / cell))) || []) {
      const [[ax, az], [bx, bz], w] = segs[n], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t) - w);
    }
    return best;
  };
  return { roadD, free: (x, z, pad = 2) => roadD(x, z) > pad && !ctx.details.keepsClear(x, z) && !(ctx.mountain?.shelves || []).some((c) => Math.hypot(x - c.x, z - c.z) < (c.r1 || 10) + pad) };
}

// ------------------------------------------------------------------ pieces
/** An outcrop: two to four great bedded slabs stacked and tilted, smaller blocks broken off at its
 * foot. `s` its size (metres, about its height). */
export function outcrop(b, M, x, y, z, s, k) {
  const rock = M(['rock_05_overworld_granite_1_02', 'rock_02_cave_dark_basalt_1_05', 'stone_01_gray_limestone_1_01'][k % 3], 3, { tint: [0xb8b2a8, 0xa8a8b0, 0xc8c2b4][k % 3], tri: true });
  const moss = M('rock_06_overworld_mossy_rock_1_03', 2.6, { tint: 0xb0b8a0, tri: true });
  const tilt = (rnd() - 0.5) * 0.5, n = 2 + (k % 3);
  b.place(x, y - s * 0.25, z, rnd() * TAU, 1, (o) => {
    for (let i = 0; i < n; i++) {
      const w = s * (1.6 - i * 0.28), h = s * (0.42 - i * 0.04), lift = i * s * 0.36;
      o.blob([i * s * 0.18 * Math.sin(tilt * 3), lift + h * 0.5 + tilt * i * s * 0.3, i * s * 0.1], [w, h, w * 0.66], rock, { detail: 2, jitter: 0.16, seed: 900 + k * 7 + i });
      if (i === n - 1) o.blob([0, lift + h + 0.05, 0], [w * 0.7, 0.18 * s * 0.3, w * 0.5], moss, { detail: 1, jitter: 0.25, seed: 950 + k });
    }
    for (let i = 0; i < 4; i++) { const a = i * 1.7 + k, r = s * (1.5 + (i % 2) * 0.4); o.blob([Math.cos(a) * r, s * 0.15, Math.sin(a) * r], [s * 0.3, s * 0.2, s * 0.26], rock, { detail: 1, jitter: 0.3, seed: 980 + k * 5 + i }); }
  }, { solid: true, tag: 'rock' });
}

/** A run of kerb stones along one side of a path from a to b (on the ground), 0.9 m apart. */
function kerb(b, M, ctx, pts, side, w, k) {
  const st = M('stone_06_mossy_fieldstone_1_03', 1.6, { tri: true });
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (L < 0.5) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L, ox = -uz * side, oz = ux * side;
    for (let d = 0.3; d < L; d += 0.85 + rnd() * 0.25) {
      if (rnd() < 0.08) continue;                     // (one gone here and there)
      const x = ax + ux * d + ox * (w + 0.45), z = az + uz * d + oz * (w + 0.45), y = groundAt(ctx, x, z), s = 0.22 + rnd() * 0.12;
      b.place(x, y - 0.05, z, Math.atan2(ux, uz) + (rnd() - 0.5) * 0.4, 1, (o) => o.blob([0, s * 0.45, 0], [s * 1.3, s * 0.8, s], st, { detail: 0, jitter: 0.28, seed: 1200 + k * 31 + i * 7 + Math.round(d * 3) }), { solid: false });
    }
  }
}

/** A broken pillar of the Flame's old chapels: a square base, a fluted shaft broken at `h`, its top
 * jagged. */
function pillar(o, mat, x, z, h, k) {
  o.box([x - 0.75, 0, z - 0.75], [x + 0.75, 0.45, z + 0.75], mat);
  o.box([x - 0.6, 0.45, z - 0.6], [x + 0.6, 0.7, z + 0.6], mat);
  o.cylinder([x, 0.7, z], [x, h, z], 0.46, 12, mat, { r1: 0.43 });
  for (let i = 0; i < 12; i += 2) { const a = i / 12 * TAU; o.beam([x + Math.cos(a) * 0.44, 0.75, z + Math.sin(a) * 0.44], [x + Math.cos(a) * 0.41, h - 0.1, z + Math.sin(a) * 0.41], 0.07, 0.07, mat); }   // (its flutes)
  o.blob([x, h, z], [0.48, 0.22, 0.44], mat, { detail: 1, jitter: 0.35, seed: 1500 + k });          // (where it broke)
}

/** A ruin: a ring (or a row) of broken pillars at different heights, round a cracked floor, their
 * fallen drums and a capital lying where they came down. */
function ruin(b, M, ctx, x, z, k, row = false) {
  const marble = M('castle_keep_ivory_chapel_marble', 1.4, { tint: 0xf0e8dc, tri: true }), floor = M('cathedral_graveyard_nave_flagstone', 1.6, { tint: 0x9a968c });
  const y = groundAt(ctx, x, z), n = row ? 6 : 7, rot = rnd() * TAU, R = 6.5;
  const spots = Array.from({ length: n }, (_, i) => row ? [(i - (n - 1) / 2) * 3.2, 0] : [Math.cos(i / n * TAU) * R, Math.sin(i / n * TAU) * R]);
  b.place(x, y - 0.25, z, rot, 1, (o) => {
    if (!row) for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + 0.2, r = 2.2 + (i % 3) * 1.4; o.box([Math.cos(a) * r - 1.1, 0, Math.sin(a) * r - 1.1], [Math.cos(a) * r + 1.1, 0.32, Math.sin(a) * r + 1.1], floor); }   // (the floor's last slabs)
    spots.forEach(([px, pz], i) => { const h = [5.2, 1.4, 3.6, 2.2, 6.1, 0.9, 4.4][(i + k) % 7]; pillar(o, marble, px, pz, h, k * 10 + i); });
    for (let i = 0; i < 4; i++) {                 // (the drums that fell, lying on their sides)
      const a = rot + i * 1.9 + k, r = row ? 4 + i : R * 0.55 + i * 0.9, px = Math.cos(a) * r, pz = Math.sin(a) * r, d = (i % 2 ? 1 : -1);
      o.cylinder([px - Math.sin(a) * 0.6 * d, 0.45, pz + Math.cos(a) * 0.6 * d], [px + Math.sin(a) * 0.6 * d, 0.45, pz - Math.cos(a) * 0.6 * d], 0.44, 12, marble);
    }
    o.box([R * 0.2 - 0.8, 0.2, -R * 0.3 - 0.8], [R * 0.2 + 0.8, 0.75, -R * 0.3 + 0.8], marble);   // (a capital, upside down in the grass)
    for (let i = 0; i < 9; i++) { const a = i * 0.7 + k, r = (row ? 2 : R) * (0.6 + (i % 3) * 0.3), s = 0.22 + (i % 4) * 0.1;   // (rubble where they broke)
      o.blob([Math.cos(a) * r, s * 0.4, Math.sin(a) * r], [s * 1.4, s * 0.7, s], marble, { detail: 0, jitter: 0.35, seed: 1600 + k * 13 + i }); }
  }, { solid: false });
  for (const [px, pz] of spots) { const c = Math.cos(rot), s = Math.sin(rot), wx = x + px * c + pz * s, wz = z - px * s + pz * c; ctx.physics.add([wx - 0.55, y, wz - 0.55], [wx + 0.55, y + 2.5, wz + 0.55], 'pillar'); }
}

/** A grove: a knot of broadleaf trees, a few stones and some undergrowth among them. */
function grove(ctx, M, x, z, n, k) {
  const sp = ['oak', 'beech', 'elm', 'maple', 'oak', 'laurel'];
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, r = Math.sqrt(rnd()) * (5 + n * 0.8), tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
    ctx.trees3d?.add(sp[(i + k) % sp.length], tx, groundAt(ctx, tx, tz) - 0.2, tz, 0.95 + rnd() * 0.6);
  }
  const rock = M('rock_06_overworld_mossy_rock_1_03', 2.6, { tint: 0xc0c4b0, tri: true });
  for (let i = 0; i < 3; i++) { const a = rnd() * TAU, r = 3 + rnd() * 6, sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r, s = 0.5 + rnd() * 0.7;
    ctx.b.place(sx, groundAt(ctx, sx, sz) - 0.2, sz, rnd() * 6, 1, (o) => o.blob([0, s * 0.4, 0], [s * 1.2, s * 0.7, s], rock, { detail: 1, jitter: 0.25, seed: 1700 + k * 9 + i }), { solid: s > 0.9, tag: 'rock' }); }
  const tufts = ctx.lib.sprites ? ctx.lib.sprites('scatter', (s) => /fern|leafy_shrub|bramble|wildflowers/.test(s.id)) : [];
  for (let i = 0; tufts.length && i < n * 2; i++) { const a = rnd() * TAU, r = rnd() * (6 + n), sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r; ctx.bill.add(tufts[(i + k) % tufts.length].id, sx, groundAt(ctx, sx, sz), sz, 0.7 + rnd() * 0.4, 0.85 + rnd() * 0.2); }
}

// ------------------------------------------------------------------ laid out
/** The clear places, registered before anything's laid (the temple and the camps add theirs). */
export function detailClear(ctx) {
  const zones = [];
  ctx.details = { zones, keepsClear: (x, z) => zones.some((q) => Math.hypot(x - q[0], z - q[1]) < q[2]), statues: [] };
  return ctx.details;
}

/** Everything above, laid over the world (main.js: after the mountain, the temple and the camps are
 * laid out, before the forest is planted, before b.finish). */
export function layDetails(ctx, M) {
  const { b } = ctx, S = ctx.mountain, D = ctx.details, { roadD, free } = makeFree(ctx);
  seed = 4447;
  const stats = { kerbs: 0, outcrops: 0, groves: 0, ruins: 0, statueSpots: 0 };
  // kerbs: on the stretches of road where something's near (a gate, a bend, a place's approach): every
  // path, one stretch in three, a few metres to a few dozen long, on one side or both
  for (const [pi, p] of (ctx.paths || []).entries()) {
    const P = p.pts;
    for (let i = 2; i + 8 < P.length; i += 9 + Math.floor(rnd() * 12)) {
      if (rnd() < 0.55) continue;
      const len = 4 + Math.floor(rnd() * 10), run = P.slice(i, Math.min(P.length, i + len));
      const both = rnd() < 0.4, side = rnd() < 0.5 ? 1 : -1;
      if (run.some(([x, z]) => ctx.details.keepsClear(x, z))) continue;
      kerb(b, M, ctx, run, side, p.w, pi * 100 + i); if (both) kerb(b, M, ctx, run, -side, p.w, pi * 100 + i + 50);
      stats.kerbs++;
    }
  }
  // outcrops: the Darkwood, the downs, the foothills
  const tryPlace = (gen, want, fn) => { for (let t = 0, n = 0; t < want * 60 && n < want; t++) { const [x, z] = gen(); if (free(x, z, 9) && fn(x, z, n) !== false) n++; } };   // (fn false: not there after all)
  tryPlace(() => { const a = rnd() * TAU, r = 125 + rnd() * 150; return [Math.cos(a) * r, Math.sin(a) * r]; }, 9, (x, z, n) => { outcrop(b, M, x, groundAt(ctx, x, z), z, 2.4 + rnd() * 2.2, n); D.zones.push([x, z, 6]); stats.outcrops++; });
  tryPlace(() => [300 + rnd() * 460, -240 + rnd() * 480], 12, (x, z, n) => { outcrop(b, M, x, groundAt(ctx, x, z), z, 2.2 + rnd() * 3, n + 20); stats.outcrops++; });
  if (S) {
    tryPlace(() => { const a = 2.62 + rnd() * 2.6, r = 330 + rnd() * 260; return [Math.cos(a) * r, Math.sin(a) * r]; }, 12, (x, z, n) => {
      if (!S.covers(x, z) || S.slopeAt(x, z) > 0.5) return false; outcrop(b, M, x, S.heightAt(x, z), z, 3 + rnd() * 3, n + 40); stats.outcrops++; });
    // groves of broadleaf round the mountain's feet: on its lowest, gentlest ground
    tryPlace(() => { const a = 2.62 + rnd() * 2.6, r = 312 + rnd() * 240; return [Math.cos(a) * r, Math.sin(a) * r]; }, 18, (x, z, n) => {
      if (!S.covers(x, z) || S.heightAt(x, z) > 120 || S.slopeAt(x, z) > 0.55) return false; grove(ctx, M, x, z, 6 + (n % 5), n); stats.groves++; });
  }
  // the old ruins: in Darkwood clearings, on the downs, one in the foothills
  const ruinSpots = [[-150, -205, true], [205, -95, false], [520, 175, false], [420, -200, true], [-120, 200, false]];
  if (S) { for (let t = 0; t < 60; t++) { const a = 2.8 + rnd() * 2.2, r = 340 + rnd() * 120, x = Math.cos(a) * r, z = Math.sin(a) * r; if (S.covers(x, z) && S.slopeAt(x, z) < 0.2 && S.heightAt(x, z) < 60 && free(x, z, 10)) { ruinSpots.push([x, z, false]); break; } } }
  ruinSpots.forEach(([x, z, row], k) => { if (!free(x, z, 6)) return; ruin(b, M, ctx, x, z, k, row); D.zones.push([x, z, 10]); stats.ruins++; });
  // where statues stand by the roads (statues.js): beside the Bellwood Trail, the downs' roads and the
  // Pilgrims' Road, a few strides off, facing the road
  for (const [pi, p] of (ctx.paths || []).entries()) {
    const P = p.pts;
    if (P.length < 30) continue;
    for (let i = 12 + (pi % 7); i + 2 < P.length; i += 60 + Math.floor(rnd() * 50)) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], L = Math.hypot(bx - ax, bz - az) || 1, side = rnd() < 0.5 ? 1 : -1;
      const x = ax - (bz - az) / L * (p.w + 3.2) * side, z = az + (bx - ax) / L * (p.w + 3.2) * side;
      if (!free(x, z, 1.5) || Math.hypot(x, z) < 110) continue;
      D.statues.push({ x, z, y: groundAt(ctx, x, z), yaw: Math.atan2(ax - x, az - z), kind: D.statues.length % 4 });
      stats.statueSpots++;
    }
  }
  void roadD;
  D.stats = stats;
  console.info('details:', JSON.stringify(stats));
  return stats;
}
