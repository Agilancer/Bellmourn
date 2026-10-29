// What stands on the Green Downs: Millhaven farm (farmhouse, barn, fenced fields), the windmill
// on its hill, a hamlet of four homes along the stream with a bridge across it, rock
// outcrops, big trees, groves of conifers under the cliff, and the grass and flowers between.
// Built on terrain.js's ground: every building gets a levelled pad first.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder } from './geo.js';
import { detailedHouse } from './buildings.js';
import { REGION, POOL, CLIFF, STREAM, terrainHeight, addPad, buildTerrain, buildWater, streamAt } from './terrain.js';

function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export const ENTRANCE = [REGION.x0 + 6, 0];
export const SPOTS = { // named places on the downs (for the place names on screen)
  farm: [438, 92, 48, 'Millhaven Farm'], mill: [520, 160, 26, 'The Millhaven Windmill'], hamlet: [560, 10, 70, 'Millhaven'],
  falls: [POOL.x, POOL.z, 70, 'Brightwater Falls'],
};

export function buildRegion(ctx, M, hm) {
  const { b, props, bill, lib, physics } = ctx;
  const R = rng(2207);
  const P = (i, t = 1.2) => { const pl = lib.ofKind('plank'); return M(pl[i % pl.length], t); };

  // ---------------------------------------------------------------- pads, then the ground
  const farm = { x: 430, z: 80 }, barn = { x: 458, z: 108 }, mill = { x: 520, z: 160 };
  farm.y = addPad(farm.x, farm.z, 12); barn.y = addPad(barn.x, barn.z, 12); mill.y = addPad(mill.x, mill.z, 7);
  const fields = [[392, 118, 34, 22], [402, 156, 30, 22], [470, 150, 26, 18]].map(([x, z, w, d]) => ({ x, z, w, d, y: addPad(x, z, Math.max(w, d) * 0.62) }));
  const homes = [
    { name: 'brookside', title: 'Brookside Cottage', x: 560, z: 70, w: 11, d: 9, door: 's', wall: 'town_wall_oak_plaster', upper: 'town_wall_wattle_daub', roof: 'town_roof_straw_thatch', floor: 'vc_planks_03', chimney: [3, -2] },
    { name: 'millers', title: "The Miller's House", x: 606, z: -10, w: 12, d: 9, door: 'w', wall: 'town_wall_fieldstone', upper: 'town_wall_oak_plaster', roof: 'town_roof_blue_slate', floor: 'vc_planks_07', chimney: [-3, 2] },
    { name: 'shepherd', title: "The Shepherd's Lodge", x: 540, z: -44, w: 10, d: 8, door: 'n', wall: 'town_wall_pine_siding', upper: 'town_wall_oak_plaster', roof: 'town_roof_oak_shingles', floor: 'vc_planks_11', chimney: [3, 1] },
    { name: 'weaver', title: "The Weaver's House", x: 498, z: -90, w: 12, d: 10, door: 'e', wall: 'town_wall_dressed_limestone', upper: 'town_wall_wattle_daub', roof: 'town_roof_terracotta', floor: 'vc_planks_05', chimney: [-3, -2] },
  ];
  for (const h of homes) h.y = addPad(h.x, h.z, Math.max(h.w, h.d) * 0.75);
  const paths = [
    [[REGION.x0 - 2, 0], [330, 6], [370, 26], [404, 52], [430, 68]],
    [[430, 68], [470, 72], [520, 76], [556, 78], [560, 76]],
    [[440, 92], [470, 128], [500, 146], [516, 156]],
    [[560, 76], [586, 52], [592, 30], [596, 8], [600, -10]],
    [[592, 30], [572, 4], [548, -34], [520, -62], [504, -84]],
    [[604, -10], [640, -24], [672, -34], [684, -36]],
  ];
  const downsMat = buildTerrain(ctx, lib, paths);
  ctx.water = buildWater(ctx, lib);
  const H = (x, z) => terrainHeight(x, z);

  // ---------------------------------------------------------------- the farm
  detailedHouse(ctx, { name: 'farmhouse', title: 'Millhaven Farmhouse', x: farm.x, z: farm.z, y: farm.y, w: 15, d: 10, h: 3.9, storeys: 2, timber: true,
    wall: 'town_wall_oak_plaster', upper: 'town_wall_wattle_daub', roof: 'town_roof_straw_thatch', floor: 'vc_planks_02', door: 's', chimney: [4, -2], dormers: 2,
    furnish: [['table', -2, 0, 0], ['stool', -2, 1.2], ['stool', -3.2, 0], ['bed', 5, -2.5, Math.PI / 2], ['barrel', -6, -3.5], ['barrel', -6, -2.4], ['bookshelf', 2, -4.2, 0], ['candelabrum', 6, 3.5]] },
  M, { ...hm, ...hm.perHouse(1) });
  detailedHouse(ctx, { name: 'barn', title: 'Millhaven Barn', x: barn.x, z: barn.z, y: barn.y, w: 14, d: 18, h: 6.2, storeys: 1, timber: true,
    wall: 'vc_planks_06', roof: 'town_roof_oak_shingles', floor: 'town_stable_yard', door: 'w', openFront: true, furnish: [] }, M, { ...hm, ...hm.perHouse(2) });
  const S = (id, x, z, s = 1, rot = null, dy = 0) => ctx.scatter.place(id, x, H(x, z) + dy, z, s, rot);
  for (const [x, z] of [[452, 100], [452, 104], [453.5, 102], [462, 114], [463, 117]]) S('town_scatter_06_hay_bale', x, z, 1, 0.1);
  S('town_scatter_07_handcart', 446, 120, 1, 1.2); S('town_scatter_10_horse_trough', 418, 92, 1, 0); S('town_scatter_16_firewood_stack', 420, 74, 1, Math.PI / 2);
  S('town_scatter_05_grain_sacks', 462, 98); S('town_scatter_36_water_bucket', 425, 90); S('town_scatter_35_grain_handmill', 440, 92);
  props.add('well', 444, H(444, 88), 88, 0, 1.1);
  // fields: furrowed soil, rows of wheat, a split-rail fence round each
  const soil = M('town_cart_rut_earth', 2.2, { overlay: true });
  fields.forEach((f, i) => {
    const y = f.y + 0.03, x0 = f.x - f.w / 2, x1 = f.x + f.w / 2, z0 = f.z - f.d / 2, z1 = f.z + f.d / 2;
    b.quad(soil, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]]);
    const crop = ['town_scatter_25_dry_reeds', 'town_scatter_26_wildflowers', 'town_scatter_25_dry_reeds'][i];
    for (let z = z0 + 1; z < z1 - 0.5; z += 1.6) for (let x = x0 + 0.8; x < x1 - 0.5; x += 0.9) bill.add(crop, x + (R() - 0.5) * 0.3, f.y, z, i === 1 ? 0.55 : 0.62);
    fenceAt(ctx, [[x0 - 1, z0 - 1], [x1 + 1, z0 - 1], [x1 + 1, z1 + 1], [x0 - 1, z1 + 1], [x0 - 1, z0 + 2]], f.y, hm);
  });

  // ---------------------------------------------------------------- the windmill
  windmill(ctx, M, mill.x, mill.z, mill.y, hm);

  // ---------------------------------------------------------------- the hamlet
  homes.forEach((h, i) => detailedHouse(ctx, { ...h, h: 3.7, storeys: 2, timber: i % 2 === 0,
    furnish: [['table', 0, 0.5, 0], ['stool', 0, 1.7], ['bed', h.w / 2 - 1.6, -h.d / 2 + 1.4, Math.PI / 2], ['barrel', -h.w / 2 + 1, -h.d / 2 + 1], ['candelabrum', -h.w / 2 + 1, h.d / 2 - 1.2], ['bookshelf', 1.5, -h.d / 2 + 0.6, 0]] },
  M, { ...hm, ...hm.perHouse(3 + i) }));
  for (const h of homes) { // a little clutter by each home
    S(['town_scatter_16_firewood_stack', 'town_scatter_01_closed_barrel', 'town_scatter_31_vegetable_basket', 'town_scatter_17_workbench'][homes.indexOf(h)], h.x + h.w / 2 + 2, h.z - 2);
    S('town_scatter_36_water_bucket', h.x - h.w / 2 - 1.5, h.z + 1);
  }
  bridge(ctx, [592, 30], hm);

  // ---------------------------------------------------------------- rocks, trees, grass
  const rock = [M('castle_rubble', 2.4), M('castle_basalt', 2.6), M('castle_keep_rough_battlement_block', 2.4), M('castle_slate', 2.4)];
  const moss = M('castle_mossy', 2);
  const clearOf = (x, z, pad) => !homes.some((h) => Math.hypot(x - h.x, z - h.z) < Math.max(h.w, h.d) + pad)
    && Math.hypot(x - farm.x, z - farm.z) > 24 + pad && Math.hypot(x - barn.x, z - barn.z) > 20 + pad && Math.hypot(x - mill.x, z - mill.z) > 12 + pad
    && !fields.some((f) => Math.abs(x - f.x) < f.w / 2 + pad && Math.abs(z - f.z) < f.d / 2 + pad)
    && streamAt(x, z).d > 10 + pad * 0.5 && Math.hypot(x - POOL.x, z - POOL.z) > POOL.r + 8;
  let made = 0;
  for (let i = 0; i < 400 && made < 16; i++) { // outcrops on the hilltops
    const x = REGION.x0 + 60 + R() * (CLIFF.x - REGION.x0 - 80), z = REGION.z0 + 30 + R() * (REGION.z1 - REGION.z0 - 60);
    if (H(x, z) < 5 || !clearOf(x, z, 8)) continue;
    made++;
    const n = 3 + Math.floor(R() * 4), m = rock[made % rock.length];
    for (let k = 0; k < n; k++) {
      const a = R() * 6.28, d = R() * 5, sx = 2 + R() * 3.5, sy = 1.5 + R() * 4, cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
      b.place(cx, H(cx, cz) - 0.6, cz, R() * 6.28, 1, (B) => {
        B.blob([0, sy * 0.5, 0], [sx, sy, sx * (0.7 + R() * 0.5)], m, { detail: 1, jitter: 0.22, seed: made * 13 + k });
        if (R() < 0.5) B.blob([0, sy * 1.0, 0], [sx * 0.8, sy * 0.25, sx * 0.6], moss, { detail: 1, jitter: 0.3, seed: k });
      }, { tag: 'rock' });
    }
  }
  // crags along the cliff face and fallen rock at its foot
  for (let i = 0; i < 70; i++) {
    const z = REGION.z0 + 14 + (i / 70) * (REGION.z1 - REGION.z0 - 28) + (R() - 0.5) * 6;
    if (Math.abs(z - (POOL.z - 2)) < 7) continue; // leave the waterfall clear
    const cx = CLIFF.x + Math.sin(z * 0.021) * 9 + Math.sin(z * 0.06) * 3, up = R();
    const x = cx - 7 + up * 9, s = 1.8 + R() * 3.2, y = H(x, z) - s * 0.4;
    b.place(x, y, z, R() * 6.28, 1, (B) => B.blob([0, 0, 0], [s * (0.8 + R() * 0.5), s * (1 + R() * 0.8), s], rock[i % 4], { detail: 1, jitter: 0.25, seed: 900 + i }), { tag: 'rock' });
  }
  // boulders in the stream and round the pool
  for (let i = 0; i < 26; i++) {
    const [x, z] = i < 14 ? STREAM[1 + (i % (STREAM.length - 2))].map((v, j) => v + (R() - 0.5) * 14) : [POOL.x + Math.cos(i) * (POOL.r + 3), POOL.z + Math.sin(i) * (POOL.r + 3)];
    const s = 0.6 + R() * 1.4;
    b.place(x, H(x, z) - 0.3, z, R() * 6.28, 1, (B) => B.blob([0, s * 0.5, 0], [s * 1.3, s, s], rock[i % 4], { seed: 500 + i }), { tag: 'rock' });
  }
  // big broadleaf trees across the downs, conifer groves under the cliff and on the plateau
  const broad = ['oak', 'elm', 'beech', 'maple', 'forest', 'mossy'];
  for (let i = 0, n = 0; i < 2000 && n < 110; i++) {
    const x = REGION.x0 + 30 + R() * (CLIFF.x - REGION.x0 - 40), z = REGION.z0 + 10 + R() * (REGION.z1 - REGION.z0 - 20);
    if (!clearOf(x, z, 6)) continue;
    ctx.trees3d.add(broad[n % broad.length], x, H(x, z) - 0.15, z, 1.3 + R() * 0.8);
    n++;
  }
  for (let i = 0, n = 0; i < 1500 && n < 90; i++) {
    const onTop = R() < 0.45;
    const x = onTop ? CLIFF.x + 18 + R() * (REGION.x1 - CLIFF.x - 22) : CLIFF.x - 60 + R() * 50, z = REGION.z0 + 10 + R() * (REGION.z1 - REGION.z0 - 20);
    if (!clearOf(x, z, 4)) continue;
    ctx.trees3d.add(['pine', 'cedar', 'redwood', 'pine'][n % 4], x, H(x, z) - 0.2, z, 0.9 + R() * 0.4);
    n++;
  }
  // dense forest along the north and south edges and round the back of the plateau
  const edgeTrees = lib.sprites('tree', (s) => /dark_forest|town_tree_(13|14|15|16|09|07)/.test(s.id));
  for (let i = 0; i < 1400; i++) {
    const side = i % 3, t = R();
    const x = side === 2 ? REGION.x1 - R() * 14 : REGION.x0 + 20 + t * (REGION.x1 - REGION.x0 - 20);
    const z = side === 0 ? REGION.z0 + R() * 16 : side === 1 ? REGION.z1 - R() * 16 : REGION.z0 + t * (REGION.z1 - REGION.z0);
    const tr = edgeTrees[i % edgeTrees.length];
    bill.add(tr.id, x, H(x, z), z, 1.0 + R() * 0.6, 0.8 + R() * 0.3);
    if (i % 4 === 0) ctx.trees3d.add(['pine', 'cedar', 'oak', 'forest'][i % 4 === 0 ? (i / 4) % 4 : 0], x + 4, H(x + 4, z), z, 1 + R() * 0.4);
  }
  // grass tufts, flowers, shrubs and ferns over everything
  const veg = lib.sprites('scatter', (s) => /fern|leafy_shrub|wildflowers|dry_reeds|thorn_bush|dead_bramble/.test(s.id));
  for (let i = 0; i < 2600; i++) {
    const x = REGION.x0 + 10 + R() * (REGION.x1 - REGION.x0 - 20), z = REGION.z0 + 10 + R() * (REGION.z1 - REGION.z0 - 20);
    const st = streamAt(x, z);
    if (st.d < 4.5 || Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 2) continue;
    const y = H(x, z);
    if (x > CLIFF.x - 12 && x < CLIFF.x + 8) continue; // not on the cliff face
    const s = veg[(st.d < 14 && i % 3 === 0) ? veg.findIndex((v) => /reeds/.test(v.id)) : i % veg.length];
    bill.add(s.id, x, y, z, 0.6 + R() * 0.5, 0.85 + R() * 0.25);
  }
  return { homes, farm, barn, mill, paths, downsMat };
}

/** A split-rail fence along a polyline at ground height y. */
function fenceAt(ctx, pts, y, hm) {
  const { b } = ctx;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.4));
    for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n; b.box([x - 0.08, y, z - 0.08], [x + 0.08, y + 1.2, z + 0.08], hm.post); }
    for (const h of [0.5, 1.0]) b.beam([x0, y + h, z0], [x1, y + h, z1], 0.07, 0.1, hm.rail);
  }
}

/** A plank bridge across the stream at `at`, square to its flow, with posts and rails. */
function bridge(ctx, [x, z], hm) {
  const { b, physics } = ctx;
  // the stream's direction here, and the bridge across it
  let best = 0, bi = 0;
  for (let i = 0; i + 1 < STREAM.length; i++) { const d = Math.hypot(STREAM[i][0] - x, STREAM[i][1] - z); if (i === 0 || d < best) { best = d; bi = i; } }
  const [ax, az] = STREAM[Math.max(0, bi - 1)], [cx, cz] = STREAM[Math.min(STREAM.length - 1, bi + 1)];
  const fl = Math.hypot(cx - ax, cz - az), dx = (cx - ax) / fl, dz = (cz - az) / fl; // along the flow
  const ux = -dz, uz = dx, L = 9; // across
  const e0 = [x - ux * L, z - uz * L], e1 = [x + ux * L, z + uz * L];
  const y0 = terrainHeight(...e0) + 0.15, y1 = terrainHeight(...e1) + 0.15, mid = Math.max(y0, y1) + 0.5;
  const yAt = (t) => (t < 0.5 ? y0 + (mid - y0) * Math.sin(t * Math.PI) : y1 + (mid - y1) * Math.sin(t * Math.PI));
  const N = 24;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N, p0 = [e0[0] + (e1[0] - e0[0]) * t0, e0[1] + (e1[1] - e0[1]) * t0], p1 = [e0[0] + (e1[0] - e0[0]) * t1, e0[1] + (e1[1] - e0[1]) * t1];
    b.beam([p0[0], yAt(t0) - 0.05, p0[1]], [p1[0], yAt(t1) - 0.05, p1[1]], 2.4, 0.1, hm.counter, { up: [0, 1, 0] });
    const pc = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], yc = (yAt(t0) + yAt(t1)) / 2;
    physics.add([pc[0] - 0.45, yc - 0.6, pc[1] - 0.45], [pc[0] + 0.45, yc, pc[1] + 0.45], 'bridge'); // walk on the deck
    if (i % 4 === 0) for (const s of [-1, 1]) {
      const px = p0[0] + dx * s * 1.15, pz = p0[1] + dz * s * 1.15;
      b.box([px - 0.07, yAt(t0) - 0.1, pz - 0.07], [px + 0.07, yAt(t0) + 1.0, pz + 0.07], hm.post, { solid: false });
    }
  }
  for (const s of [-1, 1]) for (const h of [0.55, 0.95]) {
    let prev = null;
    for (let i = 0; i <= N; i += 4) {
      const t = i / N, p = [e0[0] + (e1[0] - e0[0]) * t + dx * s * 1.15, yAt(t) + h, e0[1] + (e1[1] - e0[1]) * t + dz * s * 1.15];
      if (prev) b.beam(prev, p, 0.06, 0.08, hm.rail);
      prev = p;
    }
  }
}

/** The windmill: a tapering stone tower you can walk into (millstones, sacks, a ladder), a
 * timber cap, and four lattice sails that turn in the wind. */
function windmill(ctx, M, x, z, y, hm) {
  const { b, physics, props } = ctx;
  const stone = M('castle_keep_pale_keep_limestone', 2.4), inner = M('castle_ashlar', 2.4), timber = hm.timber, floor = M('vc_planks_04', 2);
  const n = 10, r0 = 4.4, r1 = 3.1, hgt = 12, door = 0; // door on side 0 (facing south)
  b.box([x - r0 - 0.3, y - 0.6, z - r0 - 0.3], [x + r0 + 0.3, y + 0.25, z + r0 + 0.3], { top: floor, side: stone, bottom: stone });
  for (let k = 0; k < n; k++) {
    const a0 = Math.PI / 2 + (k - 0.5) / n * Math.PI * 2, a1 = Math.PI / 2 + (k + 0.5) / n * Math.PI * 2;
    const q = (a, r, h) => [x + Math.cos(a) * r, y + h, z + Math.sin(a) * r];
    const side = 2 * r0 * Math.sin(Math.PI / n);
    if (k === door) { // the doorway: a lintel above, the wall either side
      const am = (a0 + a1) / 2, dw = 0.36;
      for (const [s0, s1] of [[a0, am - dw], [am + dw, a1]]) {
        b.quad(stone, q(s1, r0, 0.25), q(s0, r0, 0.25), q(s0, r1, hgt), q(s1, r1, hgt), [[0, 0], [side / 3, 0], [side / 3, hgt], [0, hgt]]);
        b.quad(inner, q(s0, r0 - 0.5, 0.25), q(s1, r0 - 0.5, 0.25), q(s1, r1 - 0.5, hgt), q(s0, r1 - 0.5, hgt), [[0, 0], [side / 3, 0], [side / 3, hgt], [0, hgt]], 0.7);
      }
      const l0 = 2.6;
      b.quad(stone, q(am + dw, r0 - 0.1, l0), q(am - dw, r0 - 0.1, l0), q(am - dw, r1, hgt), q(am + dw, r1, hgt), [[0, 0], [1.6, 0], [1.6, hgt - l0], [0, hgt - l0]]);
      b.quad(inner, q(am - dw, r0 - 0.6, l0), q(am + dw, r0 - 0.6, l0), q(am + dw, r1 - 0.5, hgt), q(am - dw, r1 - 0.5, hgt), [[0, 0], [1.6, 0], [1.6, hgt - l0], [0, hgt - l0]], 0.7);
      const d0 = q(am - dw, r0 - 0.25, 0.25);
      ctx.doors?.add({ hinge: d0, along: -Math.atan2(Math.sin(am + dw) - Math.sin(am - dw), Math.cos(am + dw) - Math.cos(am - dw)), width: 2 * Math.sin(dw) * (r0 - 0.25), height: 2.45, opens: -1, name: 'windmill door' });
      for (const s of [am - dw - 0.12, am + dw + 0.12]) { const p = q(s, r0 - 0.25, 0); physics.add([p[0] - 0.25, y, p[2] - 0.25], [p[0] + 0.25, y + hgt, p[2] + 0.25], 'wall'); }
      continue;
    }
    b.quad(stone, q(a1, r0, 0.25), q(a0, r0, 0.25), q(a0, r1, hgt), q(a1, r1, hgt), [[0, 0], [side, 0], [side, hgt], [0, hgt]]);
    b.quad(inner, q(a0, r0 - 0.5, 0.25), q(a1, r0 - 0.5, 0.25), q(a1, r1 - 0.5, hgt), q(a0, r1 - 0.5, hgt), [[0, 0], [side, 0], [side, hgt], [0, hgt]], 0.7);
    for (const f of [0.25, 0.75]) { // colliders round the ring
      const a = a0 + (a1 - a0) * f, p = q(a, r0 - 0.25, 0);
      physics.add([p[0] - 0.55, y, p[2] - 0.55], [p[0] + 0.55, y + hgt, p[2] + 0.55], 'wall');
    }
    if (k === 3 || k === 7) { // a small window, lit at night
      const am = (a0 + a1) / 2, w = q(am, r0 + 0.02 - (r0 - r1) * 0.55, hgt * 0.55);
      b.place(w[0], w[1], w[2], -am + Math.PI / 2, 1, (B) => B.box([-0.35, -0.5, -0.05], [0.35, 0.5, 0.05], hm.glass, { solid: false }), { solid: false });
    }
  }
  // floors inside, a ceiling, the cap
  b.box([x - r1, y + hgt - 0.2, z - r1], [x + r1, y + hgt, z + r1], timber, { solid: false, shade: 0.7 });
  b.cone(x, z, r1 + 0.6, y + hgt, 3.2, n, M('town_roof_oak_shingles', 2));
  // millstones, sacks, a ladder and a lamp
  b.cylinder([x, y + 0.25, z], [x, y + 0.75, z], 1.2, 14, M('castle_slatestone', 1));
  b.cylinder([x, y + 0.75, z], [x, y + 1.15, z], 1.15, 14, M('castle_slatestone', 1));
  b.cylinder([x, y + 1.15, z], [x, y + hgt - 0.2, z], 0.16, 8, timber);
  physics.add([x - 1.2, y, z - 1.2], [x + 1.2, y + 1.15, z + 1.2], 'prop');
  for (const [dx, dz] of [[-2.5, -1.5], [-2.6, 0.2], [2.3, 1.8]]) ctx.scatter.place('town_scatter_05_grain_sacks', x + dx, y + 0.25, z + dz, 0.9);
  for (let i = 0; i < 2; i++) b.beam([x + 2.6 + i * 0.45, y + 0.25, z - 2], [x + 2.2 + i * 0.45, y + hgt - 0.3, z - 2.4], 0.07, 0.07, timber);
  for (let k = 0; k < 14; k++) b.beam([x + 2.58, y + 0.6 + k * 0.8, z - 2.05 - k * 0.028], [x + 3.07, y + 0.6 + k * 0.8, z - 2.05 - k * 0.028], 0.05, 0.05, timber);
  props.add('candelabrum', x - 2.2, y + 0.25, z + 2.2);
  ctx.zones.push({ x0: x - r0, z0: z - r0, x1: x + r0, z1: z + r0, y0: y - 1, y1: y + hgt, name: 'The Millhaven Windmill' });
  // the sails: their own mesh, turning about the hub on the side facing the wind (west)
  const sb = new Builder({ add() {} });
  const cloth = M('cloth_04_aged_cream_linen', 1.2, { side: THREE.DoubleSide });
  sb.cylinder([0, 0, 0], [-0.9, 0, 0], 0.35, 8, timber);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, d = [0, Math.cos(a), Math.sin(a)], s = [0, -Math.sin(a), Math.cos(a)];
    const p = (l, w) => [-0.9, d[1] * l + s[1] * w, d[2] * l + s[2] * w];
    sb.beam(p(0, 0), p(8.5, 0), 0.22, 0.22, timber);
    for (let l = 1.5; l <= 8.5; l += 1) sb.beam(p(l, 0), p(l, 1.5), 0.06, 0.06, timber);
    sb.beam(p(1.5, 1.5), p(8.5, 1.5), 0.08, 0.08, timber);
    sb.quad(cloth, p(1.5, 0.1), p(8.4, 0.1), p(8.4, 1.45), p(1.5, 1.45), [[0, 0], [6.9, 0], [6.9, 1.35], [0, 1.35]]);
  }
  const sails = new THREE.Group();
  for (const [mat, chunks] of sb.batches) {
    const geos = [...chunks.values()].flat();
    for (const g of geos) g.deleteAttribute('color');
    const m2 = mat.clone(); m2.vertexColors = false;
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), m2);
    mesh.castShadow = true;
    sails.add(mesh);
  }
  sails.position.set(x - r1 - 0.4, y + hgt + 0.8, z);
  ctx.scene.add(sails);
  (ctx.animated ??= []).push((dt, t) => { sails.rotation.x = t * 0.45; });
}
