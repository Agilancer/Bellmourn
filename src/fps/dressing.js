// The world's dressing: the last pass that makes its ground read and its places stick in the mind.
//
//  - Ground decals cut from the terrain-borders sheets (tools/world/import_borders.py: one atlas):
//    each laid where something made it. Gravel edging along the Pilgrims' Road (the road's verge,
//    where its gravel gives way to turf); old flagstones on the trails and the downs' paths (the
//    worn remains of older ways); river pebbles round the pools and down the stream's banks (what the
//    water rolls); scree at the foot of the Sorrowhorn's cliffs and round its boulders (what falls);
//    dark damp rock in every cave's mouth (the wet that runs out of them); pale limestone about the
//    summit (the horn's own stone); broken setts on the roads where they leave Bellmourn (cartwheels);
//    cracked dry earth on the downs' high ground (where the turf is thin). Each is a quad draped on
//    the ground, merged by 80 m cell into a still mesh (the world's bundles draw them).
//  - Landmarks, built in code: the Old Ring (standing stones on the downs' second hill, the bell-folk's
//    before the tower was), outcrops on the hilltops and spurs, a rock arch over the stream, fallen
//    giants in the Darkwood, the bones of something huge in its heart, wayside shrines where the
//    downs' paths meet, and milestones up the Pilgrims' Road.
//  - Particles (crater.js glowPoints): snow blowing off the horn, motes in the caves' torchlight,
//    embers going up from the camp fires.
import * as THREE from 'three';
import { REGION, POOL, STREAM, terrainHeight, KNOLL } from './terrain.js';
import { VILLAGE_R, GRAVEYARD } from './world.js';
import { DELVES } from './delves.js';
import { keepClear } from './keep.js';
import { CRATER, glowPoints } from './crater.js';

const CELL = 80;
// how many atlas pixels make a metre, by group (the sheets were drawn at different scales)
const PXM = { edging: 100, flags: 92, cobble: 110, riverband: 105, rock_gray: 115, rock_brown: 115, rock_pale: 110, rock_dark: 105, pebbles: 120, clusters: 100, debris: 95, cracks: 80 };

/** The atlas's map of pieces (fetch early; the picture loads by itself). */
export async function loadDressing() {
  try { return await (await fetch('assets/textures/decals/borders.json')).json(); } catch (e) { console.warn('dressing', e); return null; }
}

class Decals {
  constructor(ctx, json) {
    this.ctx = ctx; this.G = json.groups; this.cells = new Map(); this.n = 0;
    const tex = new THREE.TextureLoader().load('assets/textures/decals/' + json.pages[0]);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    this.mat = new THREE.MeshPhongMaterial({ map: tex, alphaTest: 0.5, color: 0xf2ece4, specular: 0x262626, shininess: 22, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.mat.userData.noGlass = true;
    let s = 1234567; this.R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  }
  ground(x, z) { return this.ctx.physics.groundAt(x, z); }
  /** One piece of `group` at (x, z): along `rot` (its length), `k` which piece (else at random),
   * `scale`, `lift` over the ground; draped on it (3 x 3 points). */
  add(group, x, z, { rot = this.R() * 6.283, k = null, scale = 1, lift = 0.05, flip = this.R() < 0.5 } = {}) {
    const list = this.G[group];
    if (!list?.length) return;
    const p = list[k ?? Math.floor(this.R() * list.length)], m = PXM[group] || 100;
    const L = p.px[0] / m * scale, W = p.px[1] / m * scale, c = Math.cos(rot), s = Math.sin(rot);
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    let cell = this.cells.get(key);
    if (!cell) this.cells.set(key, cell = { P: [], U: [], I: [] });
    const base = cell.P.length / 3, [u0, v0, u1, v1] = p.uv, up = lift + (this.n++ % 7) * 0.003;
    for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) {
      const a = (i / 2 - 0.5) * L, b = (j / 2 - 0.5) * W * (flip ? -1 : 1), px = x + a * c - b * s, pz = z + a * s + b * c;
      cell.P.push(px, this.ground(px, pz) + up, pz);
      cell.U.push(u0 + (u1 - u0) * i / 2, 1 - (v0 + (v1 - v0) * j / 2));
    }
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const q = base + j * 3 + i; cell.I.push(q, q + 3, q + 1, q + 1, q + 3, q + 4); }
  }
  /** Pieces of `group` laid end to end along a polyline, `side` metres off it (+ left, - right),
   * `keep` the share of the run that's laid (gaps, not a ruled kerb). */
  strip(group, pts, side, { keep = 0.85, lift = 0.035, gap = 0.1, scale = 1 } = {}) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 0.01) continue;
      const ux = dx / L, uz = dz / L, ox = -uz, oz = ux, rot = Math.atan2(dz, dx);
      for (let d = this.R() * 0.8; d < L; d += 1.55 * scale + gap) {
        if (this.R() > keep) continue;
        const o = side + (this.R() - 0.5) * 0.15;
        this.add(group, ax + ux * d + ox * o, az + uz * d + oz * o, { rot: rot + (this.R() - 0.5) * 0.08, lift, scale: scale * (0.9 + this.R() * 0.2) });
      }
    }
  }
  /** n pieces of `group` strewn round (x, z) out to r (thicker toward the middle). */
  strew(group, x, z, r, n, o = {}) {
    for (let i = 0; i < n; i++) { const a = this.R() * 6.283, d = Math.sqrt(this.R()) * r; this.add(group, x + Math.cos(a) * d, z + Math.sin(a) * d, { scale: 0.7 + this.R() * 0.6, ...o }); }
  }
  finish() {
    const out = [];
    for (const { P, U, I } of this.cells.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      g.setIndex(I); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.mat);
      m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); m.static = true;
      this.ctx.scene.add(m);
      out.push(m);
    }
    return out;
  }
}

// ------------------------------------------------------------------ landmarks
function landmarks(ctx, M, D, free) {
  const { b, physics } = ctx, H = (x, z) => physics.groundAt(x, z);
  let r0 = 777; const R0 = () => { r0 = (r0 * 16807) % 2147483647; return r0 / 2147483647; };
  const T = (id, t, tint) => M(id, t, { tint, tri: true });
  const granite = T('rock_05_overworld_granite_1_02', 3, 0xc8c2b8), moss = T('rock_06_overworld_mossy_rock_1_03', 2.6, 0xc0c4b0), field = T('stone_06_mossy_fieldstone_1_03', 1.6);
  const bone = new THREE.MeshLambertMaterial({ color: 0xd9cfb4 }), bark = M('ship_01_tarblack_oak', 1.4, { tint: 0x8a7a68 });
  const solid = (x, z, r, h) => physics.add([x - r, H(x, z) - 0.5, z - r], [x + r, H(x, z) + h, z + r], 'rock');
  const placed = [];
  // an outcrop: three bands of stone, each set back a little and turned (bedding), lichen on top
  const outcrop = (x, z, s, seed) => {
    const y = H(x, z);
    b.place(x, y - 0.6 * s, z, seed, 1, (o) => {
      for (let k = 0; k < 3; k++) o.blob([k * 0.35 * s, (0.7 + k * 0.85) * s, -k * 0.25 * s], [(2.4 - k * 0.55) * s, 0.55 * s, (1.8 - k * 0.4) * s], k === 2 ? moss : granite, { detail: 2, jitter: 0.16, seed: seed * 7 + k });
    }, { solid: false });
    solid(x, z, 1.6 * s, 2.6 * s);
    D?.strew('clusters', x, z, 3.6 * s, 6); D?.strew('rock_gray', x, z, 4.5 * s, 5);
    placed.push([x, z]);
  };
  // ---- the downs: the Old Ring on the second hill, outcrops on the next highest
  const tops = [];
  for (let x = REGION.x0 + 30; x < REGION.x1 - 30; x += 12) for (let z = REGION.z0 + 30; z < REGION.z1 - 30; z += 12) {
    const y = terrainHeight(x, z);
    let top = true;
    for (const [dx, dz] of [[14, 0], [-14, 0], [0, 14], [0, -14], [10, 10], [-10, 10], [10, -10], [-10, -10]]) if (terrainHeight(x + dx, z + dz) > y) { top = false; break; }
    // (the downs proper: not the falls' plateau and its cliff to the east, not by the water)
    if (top && ![...physics.near(x - 13, z - 13, x + 13, z + 13)].some((q) => q.tag === 'tree' || q.tag === 'rock' || q.tag === 'prop') && x < REGION.x1 - 130 && Math.hypot(x - POOL.x, z - POOL.z) > 90 && Math.hypot(x - KNOLL.x, z - KNOLL.z) > KNOLL.r + 40 && free(x, z, 14)) tops.push([y, x, z]);
  }
  tops.sort((a, b2) => b2[0] - a[0]);
  const hills = [];
  for (const t of tops) if (!hills.some(([, x, z]) => Math.hypot(t[1] - x, t[2] - z) < 90)) hills.push(t);
  if (hills[0]) {   // the Old Ring: nine stones leaning, the tallest at the sunrise, a flat stone in the middle
    const [, rx, rz] = hills[0];
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2, x = rx + Math.cos(a) * 7.5, z = rz + Math.sin(a) * 7.5, h = (k === 0 ? 3.4 : 2.2) + (k * 37 % 5) * 0.18;
      b.place(x, H(x, z) - 0.3, z, a, 1, (o) => o.blob([0, h * 0.5, 0], [0.55, h * 0.55, 0.38], field, { detail: 2, jitter: 0.12, seed: 60 + k }), { solid: false });
      solid(x, z, 0.5, h);
    }
    b.place(rx, H(rx, rz) - 0.2, rz, 0.4, 1, (o) => o.blob([0, 0.35, 0], [1.4, 0.4, 0.9], field, { detail: 2, jitter: 0.1, seed: 77 }), { solid: true });
    for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; D?.add(k % 3 ? 'flags' : 'debris', rx + Math.cos(a) * 7.5, rz + Math.sin(a) * 7.5, { rot: a + Math.PI / 2, scale: 0.8 }); }   // (the trodden ring)
    D?.strew('rock_pale', rx, rz, 9, 6); D?.strew('cracks', rx, rz, 5, 4);
    ctx.oldRing = { x: rx, z: rz };
    placed.push([rx, rz]);
  }
  for (const [, x, z] of hills.slice(1, 5)) outcrop(x, z, 1 + ((x * 3) % 1) * 0.3, Math.round(x));
  // ---- the rock arch over the stream, where it runs between the downs' two halves
  { const [sx, sz] = STREAM[Math.floor(STREAM.length / 2)], [nx, nz] = STREAM[Math.floor(STREAM.length / 2) + 1], ux = nx - sx, uz = nz - sz, L = Math.hypot(ux, uz), ox = -uz / L, oz = ux / L;
    const ax = sx + ux / L * 6, az = sz + uz / L * 6, y = H(ax, az);
    b.place(ax, y, az, Math.atan2(ox, oz), 1, (o) => {
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) o.blob([s * 5.2, 0.9 + k * 1.3, 0], [1.2 - k * 0.12, 0.9, 1.0], k % 2 ? moss : granite, { detail: 2, jitter: 0.14, seed: 90 + k + (s > 0 ? 9 : 0) });
      for (let k = 0; k <= 6; k++) { const t = k / 6, a = Math.PI * t; o.blob([-Math.cos(a) * 4.7, 4.6 + Math.sin(a) * 1.6, 0], [1.1, 0.75, 0.95], k % 3 ? granite : moss, { detail: 2, jitter: 0.15, seed: 110 + k }); }
    }, { solid: false });
    for (const s of [-1, 1]) solid(ax + ox * 5.2 * s, az + oz * 5.2 * s, 1.0, 5);
    D?.strew('pebbles', ax, az, 6, 8, { lift: 0.04 });
    placed.push([ax, az]);
  }
  // ---- wayside shrines where the downs' paths meet: a stone pillar, a little roof, a candle in it
  const paths = ctx.region?.paths || [];
  const ends = [];
  for (const pl of paths) for (const p of [pl[0], pl[pl.length - 1]]) ends.push(p);
  const joints = ends.filter((p, i) => ends.some((q, j) => j !== i && Math.hypot(p[0] - q[0], p[1] - q[1]) < 6));
  const shrines = [];
  for (const [jx, jz] of joints) if (!shrines.some(([x, z]) => Math.hypot(x - jx, z - jz) < 40) && shrines.length < 4) shrines.push([jx, jz]);
  for (const [jx, jz] of shrines) {
    const x = jx + 4.2, z = jz + 3.1, y = H(x, z), roof = M('castle_slate', 1.2), wood = M('ship_01_tarblack_oak', 1);
    b.place(x, y, z, Math.atan2(jx - x, jz - z), 1, (o) => {
      o.box([-0.35, 0, -0.35], [0.35, 1.25, 0.35], field);
      o.box([-0.28, 1.25, -0.28], [0.28, 1.65, 0.28], wood);
      o.box([-0.5, 1.65, -0.5], [0.5, 1.78, 0.5], roof);
      o.box([-0.22, 0.85, 0.3], [0.22, 1.18, 0.36], M('castle_keep_ivory_chapel_marble', 1, { tint: 0x9a8a70 }));   // (the little carved face of the saint)
    }, { solid: true });
    ctx.scatter?.place('wayside_candle', x + 0.05, y + 1.27, z, 0.6);
    D?.strew('flags', x, z, 2.2, 3, { lift: 0.04 });
  }
  // ---- the Darkwood: fallen giants, and the bones of something huge in its heart
  const forest = [];
  let s = 4242; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 400 && forest.length < 6; i++) {
    const a = R() * 6.283, r = VILLAGE_R + 40 + R() * 130, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!free(x, z, 9) || forest.some(([fx, fz]) => Math.hypot(fx - x, fz - z) < 70)) continue;
    if ([...physics.near(x - 6, z - 6, x + 6, z + 6)].some((q) => q.tag === 'tree' && Math.hypot((q.min[0] + q.max[0]) / 2 - x, (q.min[2] + q.max[2]) / 2 - z) < 4)) continue;
    forest.push([x, z]);
  }
  forest.slice(0, 5).forEach(([x, z], i) => {   // a trunk down across the floor, its root plate up on end, shelf fungus on it
    const a = R() * 6.283, L = 13 + R() * 6, y = H(x, z), ex = x + Math.cos(a) * L, ez = z + Math.sin(a) * L;
    b.place(x, y, z, 0, 1, (o) => {
      o.cylinder([0, 0.55, 0], [ex - x, H(ex, ez) - y + 0.45, ez - z], 0.62, 10, bark, { r1: 0.38 });
      o.blob([-Math.cos(a) * 0.4, 1.3, -Math.sin(a) * 0.4], [1.6, 1.5, 0.5], M('ground_dirt_02', 1.4, { tint: 0x6a5a48 }), { detail: 2, jitter: 0.3, seed: 200 + i });
      for (let k = 1; k < 5; k++) { const t = k / 5; o.blob([(ex - x) * t, 0.9 + (H(ex, ez) - y) * t, (ez - z) * t + 0.5], [0.3, 0.06, 0.22], M('ground_grass_05', 1, { tint: 0xc8a060 }), { detail: 1, jitter: 0.2, seed: 220 + k }); }
    }, { solid: false });
    for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4, px = x + (ex - x) * t, pz = z + (ez - z) * t; physics.add([px - 0.6, H(px, pz), pz - 0.6], [px + 0.6, H(px, pz) + 1.1, pz + 0.6], 'log'); }
    D?.strew('rock_dark', x, z, 3, 3, { lift: 0.03 });
    placed.push([x, z]);
  });
  if (forest[5]) {   // the ribs of something huge, half sunk: a spine, eleven ribs arching over, a horned skull
    const [x, z] = forest[5], y = H(x, z), a = R() * 6.283, c = Math.cos(a), sn = Math.sin(a);
    b.place(x, y - 0.4, z, -a, 1, (o) => {
      o.blob([0, -0.2, 0], [8.5, 0.7, 4.2], M('ground_dirt_02', 1.6, { tint: 0x5a4a38 }), { detail: 2, jitter: 0.25, seed: 299 });   // (the mound it sank into)
      for (let k = 0; k < 9; k++) o.blob([k * 1.5 - 6, 0.5, 0], [0.55, 0.45, 0.5], bone, { detail: 1, jitter: 0.1, seed: 300 + k });
      for (let k = 0; k < 7; k++) for (const sd of [-1, 1]) {   // (seven pairs, far apart and heavy: they arch up and come down into the earth)
        const u = k * 1.75 - 5.2, h = 3.4 * Math.sin(Math.PI * (k + 1) / 8) + 1.4, w = 2.6 + 0.9 * Math.sin(Math.PI * (k + 1) / 8);
        let px = u, py = 0.45, pz = sd * 0.35;
        for (let q = 1; q <= 7; q++) { const t = q / 7, a = Math.PI * t, nx = u + 0.25 * t, ny = 0.45 + h * Math.sin(a) - 0.6 * t, nz = sd * (0.35 + w * (1 - Math.cos(a)) / 2); o.beam([px, py, pz], [nx, ny, nz], 0.26 - t * 0.1, 0.2 - t * 0.08, bone); px = nx; py = ny; pz = nz; }
      }
      o.blob([8, 1.0, 0], [1.6, 1.1, 1.3], bone, { detail: 3, jitter: 0.08, seed: 340 });
      for (const sd of [-1, 1]) { let px = 7.6, py = 1.8, pz = sd * 0.8, r = 0.32; for (let q = 0; q < 6; q++) { const nx = px - 0.25, ny = py + 0.45 - q * 0.12, nz = pz + sd * 0.55; o.beam([px, py, pz], [nx, ny, nz], r, r * 0.85, bone); px = nx; py = ny; pz = nz; r *= 0.84; } }
    }, { solid: false });
    for (let k = -1; k <= 1; k++) physics.add([x + c * k * 5 - 0.6, y, z - sn * k * 5 - 0.6], [x + c * k * 5 + 0.6, y + 0.9, z - sn * k * 5 + 0.6], 'bone');
    D?.strew('rock_dark', x, z, 8, 10); D?.strew('debris', x, z, 7, 5);
    (ctx.witchLights ||= []).push(Object.assign([x + c * 8, y + 0.6, z - sn * 8, 0.3, true], { color: 0x80ffb0, witch: true, range: 9, power: 2.4 }));   // (something cold glows in its skull)
    ctx.bones = { x, z };
  }
  // ---- the Sorrowhorn's base cliff: boulders fallen at its foot, buttresses of rock out of its face
  if (ctx.mountain) {
    const gate = 225 * Math.PI / 180, dark = T('rock_02_cave_dark_basalt_1_05', 3, 0xb8b8c0);
    for (let a = 150 * Math.PI / 180 + 0.05, n = 0; a < 300 * Math.PI / 180 - 0.05; a += 3.6 / 300, n++) {
      if (Math.abs(a - gate) < 0.07) continue;                                        // (the Broken Stair's own ground)
      const r = 299.6 - R0() * 1.6, x = Math.cos(a) * r, z = Math.sin(a) * r, s = 0.5 + R0() * 1.3;
      b.place(x, H(x, z) - s * 0.3, z, R0() * 6.28, 1, (o) => o.blob([0, s * 0.45, 0], [s * 1.25, s * 0.75, s], n % 3 ? granite : moss, { detail: 2, jitter: 0.22, seed: 1000 + n }), { solid: false });
      if (s > 0.9) physics.add([x - s * 0.8, H(x, z) - 0.3, z - s * 0.8], [x + s * 0.8, H(x, z) + s * 0.8, z + s * 0.8], 'rock');
      if (n % 4 === 0) {
        const br = 302.6, bx = Math.cos(a) * br, bz = Math.sin(a) * br, top = ctx.mountain.heightAt(Math.cos(a) * 304, Math.sin(a) * 304), h = top * (0.55 + R0() * 0.35);
        b.place(bx, 0, bz, a, 1, (o) => { o.blob([0, h * 0.5, 0], [2.2 + R0(), h * 0.55, 1.6], n % 8 ? granite : dark, { detail: 2, jitter: 0.18, seed: 1100 + n }); o.blob([0.4, h * 0.95, 0.2], [1.6, 1.2, 1.3], moss, { detail: 1, jitter: 0.25, seed: 1200 + n }); }, { solid: false });
        physics.add([bx - 2.1, -1, bz - 2.1], [bx + 2.1, h, bz + 2.1], 'rock');
      }
    }
  }
  // ---- milestones up the Pilgrims' Road: a standing stone every 600 m on its inner side, a bell cut in it
  const S = ctx.mountain;
  if (S) for (let i = 150, n = 1; i < S.road.length - 20; i += 150, n++) {
    const [x, z] = S.road[i], [x2, z2] = S.road[i + 1], L = Math.hypot(x2 - x, z2 - z) || 1;
    let ox = -(z2 - z) / L, oz = (x2 - x) / L;
    if (ox * (-1000 - x) + oz * (-1000 - z) < 0) { ox = -ox; oz = -oz; }        // (toward the mountain: the inner side)
    const mx = x + ox * 3.0, mz = z + oz * 3.0, y = H(mx, mz);
    b.place(mx, y - 0.15, mz, Math.atan2(-ox, -oz), 1, (o) => {
      o.box([-0.24, 0, -0.16], [0.24, 1.15, 0.16], field);
      o.blob([0, 1.15, 0], [0.24, 0.12, 0.16], field, { detail: 1, jitter: 0.05, seed: 400 + n });
      o.box([-0.1, 0.7, 0.16], [0.1, 0.95, 0.19], M('castle_keep_ivory_chapel_marble', 1, { tint: 0x8a7a60 }));   // (the bell, cut in)
    }, { solid: true });
    D?.strew('clusters', mx, mz, 1.2, 2);
  }
  return placed;
}

// ------------------------------------------------------------------ the ground's dressing
function groundDressing(ctx, D) {
  const S = ctx.mountain, H = (x, z) => ctx.physics.groundAt(x, z);
  // the Pilgrims' Road: its gravel verge both sides (the ribbon is 1.9 m to a side), and loose stone
  // on its outer side where the slope falls away
  if (S) {
    const pts = S.road.map(([x, z]) => [x, z]);
    D.strip('edging', pts, 2.05, { keep: 0.8, lift: 0.09 }); D.strip('edging', pts, -2.05, { keep: 0.8, lift: 0.09 });
    for (let i = 8; i < S.road.length; i += 9) {
      const [x, z] = S.road[i], [x2, z2] = S.road[i + 1] || S.road[i], L = Math.hypot(x2 - x, z2 - z) || 1;
      let ox = (z2 - z) / L, oz = -(x2 - x) / L;
      if (ox * (x - -1000) + oz * (z - -1000) < 0) { ox = -ox; oz = -oz; }
      D.strew('rock_gray', x + ox * 4.4, z + oz * 4.4, 1.6, 2);
    }
    // the trails' old flagstones (more of them broken the higher they go)
    for (const t of S.trails) for (let i = 1; i < t.pts.length - 1; i++) if (i % 2) { const [x, z] = t.pts[i], [x2, z2] = t.pts[i + 1]; D.add('flags', x, z, { rot: Math.atan2(z2 - z, x2 - x) + (D.R() - 0.5) * 0.4, lift: 0.09, scale: 0.7 }); }
    if (S.track) D.strip('flags', S.track, 0, { keep: 0.35, lift: 0.05, scale: 0.75 });
    // the scree under the skirt cliff, all along the forest side (thickest by the Broken Stair)
    for (let a = 150 * Math.PI / 180 + 0.05; a < 300 * Math.PI / 180 - 0.05; a += 4 / 299) {
      const near = Math.abs(a - 225 * Math.PI / 180) < 0.05;
      if (!near && D.R() < 0.85) continue;
      const r = 299 - D.R() * 3.5;
      D.add(D.R() < 0.6 ? 'rock_gray' : 'clusters', Math.cos(a) * r, Math.sin(a) * r, { scale: 0.7 + D.R() * 0.8 });
    }
    // the summit's own pale stone; the village's yard
    if (S.summitSite) D.strew('rock_pale', S.summitSite.x, S.summitSite.z, 14, 22, { scale: 1.3 });
    if (S.villageSite) D.strew('debris', S.villageSite.x, S.villageSite.z, 15, 10, { lift: 0.04 });
    if (S.falls) { const p = S.falls.pool; for (let k = 0; k < 26; k++) { const a = k / 26 * Math.PI * 2, r = p.r + 0.4 + D.R() * 0.9; D.add('pebbles', p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, { scale: 0.7 + D.R() * 0.5 }); } }
  }
  // every cave's mouth: the dark wet rock that runs out of it
  for (const c of ctx.caves || []) { const m = c.mouth; D.strew('rock_dark', m.x - 2.5, m.z, 4.5, 12); D.strew('pebbles', m.x - 5, m.z, 4, 4); }
  // Brightwater's pool, and the stream's banks down the downs
  for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2, r = POOL.r + 0.6 + D.R() * 1.6; D.add(k % 3 ? 'pebbles' : 'riverband', POOL.x + Math.cos(a) * r, POOL.z + Math.sin(a) * r, { rot: a + Math.PI / 2, scale: 0.8 + D.R() * 0.4 }); }
  for (let i = 0; i + 1 < STREAM.length; i++) {
    const [ax, az] = STREAM[i], [bx, bz] = STREAM[i + 1], L = Math.hypot(bx - ax, bz - az), ox = -(bz - az) / L, oz = (bx - ax) / L;
    for (let d = 0; d < L; d += 5) for (const sd of [-1, 1]) if (D.R() < 0.6) {
      const t = d / L, x = ax + (bx - ax) * t + ox * sd * (4.8 + D.R() * 1.2), z = az + (bz - az) * t + oz * sd * (4.8 + D.R() * 1.2);
      D.add('pebbles', x, z, { scale: 1.1 + D.R() * 0.6 });
    }
  }
  // the downs' paths: an old flag here and there, and the edging at their bends
  for (const pl of ctx.region?.paths || []) {
    D.strip('flags', pl, 0, { keep: 0.42, lift: 0.05, scale: 0.95 });
    for (let i = 1; i + 1 < pl.length; i++) {
      const [ax, az] = pl[i - 1], [x, z] = pl[i], [bx, bz] = pl[i + 1], turn = Math.abs(Math.atan2(bz - z, bx - x) - Math.atan2(z - az, x - ax));
      if (turn > 0.25 && turn < 6) { D.strip('edging', [[x - (x - ax) * 0.15, z - (z - az) * 0.15], [x + (bx - x) * 0.15, z + (bz - z) * 0.15]], 2.4, { keep: 1, lift: 0.04 }); }
    }
  }
  // the roads out of Bellmourn: broken setts where the carts come and go through the gates
  for (const [x0, z0, dx, dz] of [[VILLAGE_R - 6, 0, 1, 0], [-(VILLAGE_R - 6), 0, -1, 0], [0, VILLAGE_R - 6, 0, 1]]) {
    for (let d = 0; d < 26; d += 1.8) if (D.R() < 0.7) D.add('debris', x0 + dx * d + dz * (D.R() - 0.5) * 6, z0 + dz * d + dx * (D.R() - 0.5) * 6, { lift: 0.08, scale: 1.0 + D.R() * 0.5 });
  }
  // the downs' high dry ground: thin turf, cracked earth showing through
  for (let i = 0; i < 70; i++) {
    const x = REGION.x0 + 20 + D.R() * (REGION.x1 - REGION.x0 - 40), z = REGION.z0 + 20 + D.R() * (REGION.z1 - REGION.z0 - 40), y = terrainHeight(x, z);
    if (y < 4 || Math.hypot(x - KNOLL.x, z - KNOLL.z) < KNOLL.r || Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 20) continue;
    D.add('cracks', x, z, { lift: 0.05, scale: 1.4 + D.R() * 1.0 });
  }
  // the mountain's boulders sit in their own fallen stone
  for (const p of ctx.mountain?.boulders || []) if (D.R() < 0.5) D.strew('clusters', p[0], p[1], p[2] * 1.8, 2);
}

/** Dress the world (main.js, before b.finish): the decals' meshes, to go into ctx.built. */
export function dressWorld(ctx, M, json) {
  const D = json ? new Decals(ctx, json) : null;
  const free = (x, z, r = 6) => {
    if (Math.hypot(x, z) < VILLAGE_R + 8) return false;
    if (x > GRAVEYARD.x0 - 12 && x < GRAVEYARD.x1 + 12 && z > GRAVEYARD.z0 - 12 && z < GRAVEYARD.z1 + 14) return false;
    if (Math.abs(x) < 12 || Math.abs(z) < 12) return false;                                  // (the roads out of the village)
    if (DELVES.some((d) => Math.hypot(x - d.x, z - d.z) < 26)) return false;
    if (keepClear(x, z) || ctx.mountain?.keepsClear?.(x, z) || Math.hypot(x - CRATER.x, z - CRATER.z) < CRATER.reach + 8) return false;
    for (const pl of ctx.region?.paths || []) for (let i = 0; i + 1 < pl.length; i++) {
      const [ax, az] = pl[i], [bx, bz] = pl[i + 1], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < r) return false;
    }
    for (const zn of ctx.zones || []) if (x > zn.x0 - r && x < zn.x1 + r && z > zn.z0 - r && z < zn.z1 + r) return false;
    if (Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 10) return false;
    return true;
  };
  landmarks(ctx, M, D, free);
  if (D) groundDressing(ctx, D);
  // the fires whose embers go up (Motes): the goat men's camps, Hornhollow's green
  const S = ctx.mountain;
  ctx.fires = (S?.camps || []).map((c) => [c.x, c.y, c.z]);
  if (S?.villageSite) { const V = S.villageSite; ctx.fires.push([V.x - V.ux - V.uz * 4, V.y, V.z - V.uz + V.ux * 4]); }
  const meshes = D ? D.finish() : [];
  console.info(`dressing: ${D?.n || 0} ground pieces in ${meshes.length} cells`);
  return meshes;
}

// ------------------------------------------------------------------ particles
/** Snow off the horn (high on the Sorrowhorn), motes in the caves' torchlight, embers off the camp
 * fires: three small clouds of glowing points kept about you, each only where it belongs. */
export class Motes {
  constructor(scene, ctx, touch) {
    this.ctx = ctx;
    const make = (n, size) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); const p = glowPoints(g, size); p.frustumCulled = false; p.visible = false; scene.add(p); return { p, n, f: Array.from({ length: n }, () => ({ x: 0, y: -999, z: 0, v: 0, ph: Math.random() * 6.28, life: Math.random() })) }; };
    this.snow = make(touch ? 240 : 600, 0.14);
    this.dust = make(touch ? 60 : 120, 0.05);
    this.embers = make(touch ? 50 : 110, 0.07);
    this.fires = [];
  }
  update(dt, t, camera, under, day) {
    const cp = camera.position, S = this.ctx.mountain;
    // snow: above 380 m out of doors, blown across the horn
    this.run(this.snow, !under && cp.y > 370, (f, i, init) => {
      if (init || Math.hypot(f.x - cp.x, f.z - cp.z) > 26 || f.y < cp.y - 6) { const a = Math.random() * 6.28, r = Math.random() * 24; f.x = cp.x + Math.cos(a) * r; f.z = cp.z + Math.sin(a) * r; f.y = cp.y + 3 + Math.random() * 9; }
      f.x += (3.2 + Math.sin(t * 0.7 + f.ph) * 1.4) * dt; f.z += (1.2 + Math.cos(t * 0.5 + f.ph)) * dt; f.y -= (0.9 + (i % 5) * 0.12) * dt;
      return 0.55 + 0.25 * Math.sin(t * 3 + f.ph);
    }, [0.9, 0.95, 1.0]);
    // dust: below ground, a slow drift of motes about you, faint (lit by the torches you pass)
    this.run(this.dust, under, (f, i, init) => {
      if (init || Math.hypot(f.x - cp.x, f.z - cp.z) > 9 || Math.abs(f.y - cp.y) > 4) { const a = Math.random() * 6.28, r = 1 + Math.random() * 8; f.x = cp.x + Math.cos(a) * r; f.z = cp.z + Math.sin(a) * r; f.y = cp.y - 1 + Math.random() * 3; }
      f.x += Math.sin(t * 0.3 + f.ph) * 0.12 * dt; f.y += Math.sin(t * 0.2 + f.ph * 2) * 0.06 * dt; f.z += Math.cos(t * 0.27 + f.ph) * 0.12 * dt;
      return 0.18 + 0.12 * Math.sin(t * 1.3 + f.ph);
    }, [1.0, 0.85, 0.6]);
    // embers: off the nearest fires (the goat men's camps, Hornhollow, the pilgrims' rest), rising and going out
    const fires = this.fires.filter(([x, , z]) => Math.hypot(x - cp.x, z - cp.z) < 45);
    this.run(this.embers, !under && fires.length > 0, (f, i, init) => {
      f.life += dt * (0.35 + (i % 4) * 0.08);
      if (init || f.life > 1) { const s = fires[i % fires.length]; f.x = s[0] + (Math.random() - 0.5) * 0.6; f.y = s[1] + 0.3; f.z = s[2] + (Math.random() - 0.5) * 0.6; f.life = 0; }
      f.x += Math.sin(t * 2 + f.ph) * 0.3 * dt; f.y += 1.3 * dt; f.z += Math.cos(t * 1.7 + f.ph) * 0.3 * dt;
      return (1 - f.life) * (0.7 + 0.3 * Math.sin(t * 9 + f.ph)) * (0.5 + 0.5 * (1 - day));
    }, [1.0, 0.5, 0.15]);
  }
  run(c, on, step, rgb) {
    c.p.visible = on;
    if (!on) { c.init = true; return; }
    const P = c.p.geometry.attributes.position, C = c.p.geometry.attributes.color;
    c.f.forEach((f, i) => { const k = step(f, i, c.init); P.setXYZ(i, f.x, f.y, f.z); C.setXYZ(i, rgb[0] * k, rgb[1] * k, rgb[2] * k); });
    c.init = false;
    P.needsUpdate = true; C.needsUpdate = true;
  }
}
