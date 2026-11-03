// The war on the Sorrowhorn, built: the keeps and towers, the Red Scythe's war camp, the small bands'
// ledges and the ambushes' hiding rocks that mountain.js laid out (planHolds), a signpost where each
// side path leaves the road, and the crags and tors that break up the mountain's flanks. reavers.js
// peoples them; quests.js sends you to them.
//
// Every keep is built square to the world's axes (so each wall's collider is the wall), its gate on
// whichever side faces the road. Its court is cobbled; its great tower stands against the back wall
// with a stair up two of its sides to a walled roof. Greywatch, the Wardens' keep, is kept: slate
// roofs on its corner towers, blue banners, a well, a forge, the watch's bunks and stores. Scythe
// Hold was the Wardens' too, before the Red Scythe took it: its towers stand open to the sky, its
// banners are red with a bone-white scythe on them, there are heads on its spikes and a pyre in its
// court.
import * as THREE from 'three';

const TAU = Math.PI * 2;
let seed = 7331;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/** A site's frame: its front (toward the road) snapped to the nearest world axis, its right beside it.
 * at(lx, lz) is a point in it, in the world. */
function frame(site) {
  const fx0 = site.side === 'out' ? site.ux : -site.ux, fz0 = site.side === 'out' ? site.uz : -site.uz;
  const fx = Math.abs(fx0) > Math.abs(fz0) ? Math.sign(fx0) : 0, fz = fx ? 0 : Math.sign(fz0);
  const F = { x: site.x, z: site.z, y: site.y, fx, fz, rx: -fz, rz: fx };
  F.at = (lx, lz) => [F.x + F.rx * lx + F.fx * lz, F.z + F.rz * lx + F.fz * lz];
  F.yaw = Math.atan2(fx, fz);     // (a thing turned by this faces the road)
  F.dir = (d) => { const [x, z] = d === 'r' ? [F.rx, F.rz] : d === 'l' ? [-F.rx, -F.rz] : d === 'f' ? [F.fx, F.fz] : [-F.fx, -F.fz]; return x > 0.5 ? '+x' : x < -0.5 ? '-x' : z > 0.5 ? '+z' : '-z'; };
  return F;
}

/** An axis-aligned box given in a frame's terms. */
function lbox(b, F, x0, y0, z0, x1, y1, z1, mat, opts) {
  const [ax, az] = F.at(x0, z0), [bx, bz] = F.at(x1, z1);
  b.box([Math.min(ax, bx), y0, Math.min(az, bz)], [Math.max(ax, bx), y1, Math.max(az, bz)], mat, opts);
}

/** Merlons along a wall top from (x0, z0) to (x1, z1) in the frame, `out` the side they stand to. */
function merlons(b, F, x0, z0, x1, z1, y, mat, { w = 0.9, gap = 0.9, h = 0.95, t = 0.55 } = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  for (let s = 0.3; s + w <= L; s += w + gap) {
    const ax = x0 + ux * s, az = z0 + uz * s, bx = x0 + ux * (s + w), bz = z0 + uz * (s + w);
    lbox(b, F, Math.min(ax, bx) - (uz ? t / 2 : 0), y, Math.min(az, bz) - (ux ? t / 2 : 0), Math.max(ax, bx) + (uz ? t / 2 : 0), y + h, Math.max(az, bz) + (ux ? t / 2 : 0), mat, { solid: false });
  }
}

/** A hanging banner on a wall's face (in the frame: centre lx, the face at lz facing +lz), with its
 * device: a white tower (the Wardens') or a bone-white scythe (the Red Scythe's). */
function banner(b, M, F, lx, lz, top, color, device, flip = 1) {
  const cloth = M('cloth_04_aged_cream_linen', 0.6, { tint: color }), bone = M('castle_keep_ivory_chapel_marble', 0.5);
  const [x, z] = F.at(lx, lz);
  b.place(x, top, z, F.yaw + (flip < 0 ? Math.PI : 0), 1, (o) => {
    o.box([-0.06, -0.08, -0.04], [0.06, 0.08, 0.5], M('ship_01_tarblack_oak', 1));
    o.box([-0.85, -3.6, 0.04], [0.85, -0.05, 0.1], cloth);
    for (let k = 0; k < 3; k++) o.box([-0.85 + k * 0.6, -3.95, 0.04], [-0.6 + k * 0.6, -3.55, 0.1], cloth);   // (its swallowtail)
    if (device === 'tower') { o.box([-0.25, -2.7, 0.1], [0.25, -1.2, 0.13], bone); for (const s of [-0.25, -0.05, 0.15]) o.box([s, -1.2, 0.1], [s + 0.1, -0.95, 0.13], bone); }
    else if (device === 'scythe') {
      o.beam([-0.35, -3.0, 0.12], [0.3, -0.8, 0.12], 0.07, 0.03, bone);
      let px = 0.3, py = -0.8;
      for (let k = 1; k <= 6; k++) { const a = k / 6, nx = 0.3 - a * 0.95, ny = -0.8 + Math.sin(a * 2.4) * 0.35 - a * a * 0.3; o.beam([px, py, 0.12], [nx, ny, 0.12], 0.13 * (1 - a * 0.7), 0.03, bone); px = nx; py = ny; }
    }
  }, { solid: false });
}

/** A stake with a head on it (the Red Scythe's warning). */
function headStake(b, M, x, y, z, rot, k) {
  const pole = M('ship_01_tarblack_oak', 1, { tint: 0x8a6a50 }), bone = M('castle_keep_ivory_chapel_marble', 0.5, { tint: 0xc8b090 }), gore = M('cloth_04_aged_cream_linen', 0.4, { tint: 0x5a1010 });
  b.place(x, y, z, rot, 1, (o) => {
    o.box([-0.05, 0, -0.05], [0.05, 2.3, 0.05], pole);
    o.cone(0, 0, 0.07, 2.3, 0.3, 5, pole);
    o.blob([0, 2.25, 0], [0.13, 0.16, 0.15], bone, { detail: 1, jitter: 0.12, seed: 70 + k });
    o.blob([0, 2.08, 0], [0.1, 0.06, 0.1], gore, { detail: 0, jitter: 0.2, seed: 90 + k });
  }, { solid: false });
}

/** A fire: a ring of stones round burning logs, its flame, its smoke and its embers. */
function fire(ctx, S, x, y, z, size = 1) {
  ctx.scatter?.place('campfire', x, y, z, size);
  ctx.flames.push([x, y + 0.35 * size, z, 0.42 * size, 1]);
  ctx.chimneys?.push([x, y + 1.2, z]);
  (S.holdFires ||= []).push([x, y, z]);
}

// ------------------------------------------------------------------ keeps
function keep(ctx, S, site, M, kept) {
  const { b } = ctx, F = frame(site), y = site.y, W = 13, D = 11, H = 6.5, T = 1.4, base = y - 16;   // (founded deep: the bastion falls away under its corners)
  const stone = M(kept ? 'castle_keep_rough_battlement_block' : 'castle_keep_rough_battlement_block', 2.4, { tint: kept ? 0xc8c4bc : 0x8a7e76 });
  const dark = M('castle_basalt', 1.2, { tint: kept ? 0x8a8880 : 0x4a3e3a });
  const wood = M('ship_01_tarblack_oak', 1), iron = M('met_02_riveted_black_iron', 1);
  const P = (id, lx, lz, s = 1, rot = null) => { const [x, z] = F.at(lx, lz); ctx.scatter?.place(id, x, y + 0.06, z, s, rot ?? F.yaw + rnd() * 0.6 - 0.3); };
  // the court, cobbled
  lbox(b, F, -W + T / 2, y - 0.8, -D + T / 2, W - T / 2, y + 0.06, D - T / 2, M('ground_cobbles_02', 1.6, { tint: kept ? 0xb0aca4 : 0x7a6e66 }));
  // the curtain walls, the gate in the front one under its gatehouse
  const wall = (x0, z0, x1, z1) => lbox(b, F, x0, base, z0, x1, y + H, z1, stone);
  wall(-W - T / 2, -D - T / 2, W + T / 2, -D + T / 2);
  wall(-W - T / 2, -D, -W + T / 2, D);
  wall(W - T / 2, -D, W + T / 2, D);
  wall(-W - T / 2, D - T / 2, -2.3, D + T / 2); wall(2.3, D - T / 2, W + T / 2, D + T / 2);
  lbox(b, F, -2.3, y + 4.6, D - T / 2, 2.3, y + H, D + T / 2, stone);
  for (const s of [-1, 1]) lbox(b, F, s * 2.3 - (s > 0 ? 0 : 1.5), base, D - 0.9, s * 2.3 + (s > 0 ? 1.5 : 0), y + H + 1.8, D + 1.7, stone);   // (the gate's two towers)
  lbox(b, F, -3.8, y + H, D - 0.9, 3.8, y + H + 1.8, D + 1.7, stone);
  merlons(b, F, -3.8, D + 1.5, 3.8, D + 1.5, y + H + 1.8, stone);
  for (let k = 0; k < 7; k++) lbox(b, F, -1.9 + k * 0.62, y + 3.5, D + 0.25, -1.82 + k * 0.62, y + 4.6, D + 0.35, iron, { solid: false });   // (the portcullis, up)
  lbox(b, F, -1.9, y + 3.45, D + 0.2, 1.9, y + 3.6, D + 0.4, iron, { solid: false });
  // the wall tops' merlons, outside
  merlons(b, F, -W, -D - 0.45, W, -D - 0.45, y + H, stone);
  merlons(b, F, -W - 0.45, -D, -W - 0.45, D, y + H, stone);
  merlons(b, F, W + 0.45, -D, W + 0.45, D, y + H, stone);
  merlons(b, F, -W, D + 0.45, -3.8, D + 0.45, y + H, stone); merlons(b, F, 3.8, D + 0.45, W, D + 0.45, y + H, stone);
  // the corner towers: slate-roofed while the Wardens keep it, open and burnt black inside since
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const [cx, cz] = F.at(sx * W, sz * D), top = y + H + 3.5;
    b.ring(cx, cz, 3.1, base, top, 12, stone);
    b.cylinder([cx, top - 0.4, cz], [cx, top, cz], 3.0, 12, dark);
    for (let k = 0; k < 12; k += 2) { const a = k / 12 * TAU; b.place(cx + Math.cos(a) * 2.9, top, cz + Math.sin(a) * 2.9, -a, 1, (o) => o.box([-0.35, 0, -0.5], [0.35, 0.9, 0.5], stone), { solid: false }); }
    if (kept) b.cone(cx, cz, 3.5, top + 0.9, 4.6, 12, M('castle_roof_black', 1.6, { tint: 0x7a8494 }));
    else for (let k = 0; k < 5; k++) b.place(cx + (rnd() - 0.5) * 2, top, cz + (rnd() - 0.5) * 2, rnd() * 6, 1, (o) => o.beam([0, 0, 0], [(rnd() - 0.5) * 2, 1.2 + rnd(), (rnd() - 0.5) * 2], 0.16, 0.16, M('ship_01_tarblack_oak', 1, { tint: 0x2a2220 })), { solid: false });   // (burnt rafters)
  }
  // the great tower against the back wall: a stair up its front and its right side to the walled roof
  const tz0 = -D + T / 2, tz1 = tz0 + 9.2, top = y + 15.12;
  lbox(b, F, -5, base, tz0, 5, top, tz1, stone);
  lbox(b, F, -5.12, y, tz0 + 3.5, -5, y + 3.2, tz0 + 5.7, wood, { solid: false });     // (its door, barred, on its left side)
  lbox(b, F, -5.3, y + 3.2, tz0 + 3.4, -5, y + 3.45, tz0 + 5.8, dark, { solid: false });
  for (const lx of [-3.2, 3.2]) for (const ly of [6, 10.5]) lbox(b, F, lx - 0.25, y + ly, tz1, lx + 0.25, y + ly + 1.3, tz1 + 0.05, M('castle_basalt', 1, { tint: 0x101010 }), { solid: false });   // (arrow slits)
  { const [sx, sz] = F.at(-4.6, tz1 + 0.75);
    b.stairs(sx, sz, y, 7.56, 1.5, F.dir('r'), stone, { step: 0.36, run: 0.42 });
    lbox(b, F, 4.25, y - 0.5, tz1 - 0.6, 6.5, y + 7.56, tz1 + 1.5, stone);           // (the landing at its corner)
    const [qx, qz] = F.at(5.75, tz1 - 0.6);
    b.stairs(qx, qz, y + 7.56, 7.56, 1.5, F.dir('b'), stone, { step: 0.36, run: 0.42 }); }
  merlons(b, F, -5, tz0 + 0.3, 5, tz0 + 0.3, top, stone); merlons(b, F, -5, tz1 - 0.3, 5, tz1 - 0.3, top, stone);
  merlons(b, F, -4.7, tz0, -4.7, tz1, top, stone);
  // on its roof: the flag, and a brazier the watch keeps lit (or the Red Scythe's war-fire)
  { const [fx, fz] = F.at(-2.5, tz0 + 2.5), [bx, bz] = F.at(0, tz0 + 4.6);
    b.place(fx, top, fz, F.yaw, 1, (o) => { o.box([-0.06, 0, -0.06], [0.06, 6, 0.06], wood); o.box([0.06, 4.2, -0.02], [2.2, 5.8, 0.02], M('cloth_04_aged_cream_linen', 0.6, { tint: kept ? 0x3a5a8a : 0x8a1a14 })); }, { solid: false });
    ctx.scatter?.place('brazier', bx, top, bz, 1.4);
    ctx.flames.push([bx, top + 1.2, bz, 0.4, 1]);
    (S.holdFires ||= []).push([bx, top + 0.8, bz]); }
  // banners either side of the gate, and on the side walls
  for (const s of [-1, 1]) banner(b, M, F, s * 5.6, D + T / 2 + 0.02, y + H - 0.2, kept ? 0x2e4e7e : 0x7a1610, kept ? 'tower' : 'scythe');
  // the court: what each keeps in it
  if (kept) {
    P('stone_well', 6.5, 1.5, 1.1); P('forge', -9.5, -5.5, 1.1); P('workbench', -9.5, -1.5, 1); P('shield_rack', -11.5, 3, 1, F.yaw + Math.PI / 2); P('spear_rack', -11.5, 6, 1, F.yaw + Math.PI / 2);
    for (let k = 0; k < 4; k++) P('hide_bedroll', 9 + (k % 2) * 1.6, -6 + Math.floor(k / 2) * 2.6, 1, F.yaw + Math.PI / 2);
    P('supply_crate', 10.5, 4, 1); P('crate_stack', 11, 6.5, 1); P('armory_barrel', 8.8, 7.5, 1); P('water_barrel', 7.5, 8.2, 1); P('hay_bale', -7, 8, 1); P('banner_stand', 0, 6.5, 1.1);
    fire(ctx, S, ...F.at(3, 3).flatMap((v, i) => (i === 0 ? [v, y + 0.06] : [v])), 1);
  } else {
    P('weapon_cache', -9, -4, 1.1); P('armory_barrel', -10.5, 2, 1); P('cart_debris', 9, 6, 1.2); P('broken_wheel', 10.5, 3, 1); P('timber_heap', 9.5, -5, 1.1); P('skull_pile', -4, 7.5, 1);
    P('bone_pile', 7, -2, 1); P('crate_stack', -10.5, 6.5, 1); P('supply_crate', -8.5, 7.8, 1);
    fire(ctx, S, ...F.at(0, 2).flatMap((v, i) => (i === 0 ? [v, y + 0.06] : [v])), 1.6);   // (the war-fire, a pyre of the Wardens' own furniture)
    for (let k = 0; k < 9; k++) { const [hx, hz] = F.at(-4 + k, D + 3.2 + (k % 2) * 0.6); headStake(b, M, hx, S.heightAt(hx, hz), hz, F.yaw, k); }
    // a gibbet cage hung from the wall walk
    { const [gx, gz] = F.at(-W + 1.8, -2); b.place(gx, y, gz, F.yaw, 1, (o) => {
      o.box([-0.08, 0, -0.08], [0.08, 4.4, 0.08], M('ship_01_tarblack_oak', 1)); o.box([-0.08, 4.3, -0.08], [1.4, 4.45, 0.08], M('ship_01_tarblack_oak', 1));
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; o.beam([1.25 + Math.cos(a) * 0.4, 1.6, Math.sin(a) * 0.4], [1.25 + Math.cos(a) * 0.4, 3.4, Math.sin(a) * 0.4], 0.03, 0.03, iron); }
      o.blob([1.25, 2.3, 0], [0.22, 0.6, 0.18], M('castle_keep_ivory_chapel_marble', 0.5, { tint: 0xa89070 }), { detail: 1, jitter: 0.2, seed: 99 }); }, { solid: false }); }
  }
  site.frame = F;
  site.court = { x: F.x, z: F.z, y: y + 0.06 };
  site.roof = { at: F.at(0, tz0 + 4.6), y: top };
  site.gate = F.at(0, D + 2.5);
}

// ------------------------------------------------------------------ towers
/** Cairnwatch: a round signal tower on its bastion, a stair of stones round its outside to a walled
 * top where the Wardens keep a beacon burning. */
function watchTower(ctx, S, site, M) {
  const { b, physics } = ctx, F = frame(site), y = site.y, R = 3.6, H = 15, base = y - 5;
  const stone = M('castle_keep_rough_battlement_block', 2.4, { tint: 0xc8c4bc }), dark = M('castle_basalt', 1.2, { tint: 0x8a8880 });
  b.cylinder([F.x, base, F.z], [F.x, y + H, F.z], R, 14, stone);
  physics.add([F.x - R * 0.8, base, F.z - R * 0.8], [F.x + R * 0.8, y + H, F.z + R * 0.8], 'wall');
  const [dx, dz] = F.at(0, R);
  b.place(dx, y, dz, F.yaw, 1, (o) => o.box([-0.8, 0, -0.1], [0.8, 2.6, 0.1], M('ship_01_tarblack_oak', 1)), { solid: false });
  // the stair: a stone every 0.36 m up, round the outside
  const a0 = Math.atan2(F.fz, F.fx) + 0.6;
  let aTop = a0;
  for (let k = 0, h = 0.36; h <= H + 0.31; k++, h += 0.36) {
    aTop = a0 + k * 0.19;
    const a = a0 + k * 0.19, x = F.x + Math.cos(a) * (R + 0.75), z = F.z + Math.sin(a) * (R + 0.75);
    b.place(x, y + h - 0.3, z, -a, 1, (o) => o.box([-0.8, 0, -0.42], [0.8, 0.3, 0.42], dark), { solid: false });
    physics.add([x - 0.5, y + h - 0.3, z - 0.5], [x + 0.5, y + h, z + 0.5], 'step');
  }
  b.cylinder([F.x, y + H - 0.01, F.z], [F.x, y + H + 0.3, F.z], R + 0.4, 14, dark);
  { const r = R + 0.4;    // (its floor: a cross of two boxes and four at the diagonals, as near round as boxes go)
    for (const [hx, hz] of [[r, r * 0.42], [r * 0.42, r]]) physics.add([F.x - hx, y + H, F.z - hz], [F.x + hx, y + H + 0.3, F.z + hz], 'floor');
    for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, cx = F.x + Math.cos(a) * r * 0.62, cz = F.z + Math.sin(a) * r * 0.62; physics.add([cx - 0.8, y + H, cz - 0.8], [cx + 0.8, y + H + 0.3, cz + 0.8], 'floor'); } }
  for (let k = 0; k < 14; k += 2) { const a = k / 14 * TAU; if (Math.abs(Math.atan2(Math.sin(a - aTop), Math.cos(a - aTop))) < 0.55) continue; b.place(F.x + Math.cos(a) * (R + 0.1), y + H + 0.3, F.z + Math.sin(a) * (R + 0.1), -a, 1, (o) => o.box([-0.25, 0, -0.5], [0.25, 1.0, 0.5], stone), { solid: true }); }
  ctx.scatter?.place('brazier', F.x, y + H + 0.3, F.z, 1.8);
  ctx.flames.push([F.x, y + H + 1.9, F.z, 0.6, 1]);
  (S.holdFires ||= []).push([F.x, y + H + 1.2, F.z]);
  banner(b, M, F, 0, R + 0.02, y + H - 1, 0x2e4e7e, 'tower');
  site.frame = F; site.top = { x: F.x + 1.5, z: F.z, y: y + H + 0.3 };
  site.court = { x: F.x + F.fx * (R + 3), z: F.z + F.fz * (R + 3), y };
}

/** The Hollow Tower: the old watch's tower up its side path, broken open and burnt out, the dead
 * round it; a climb of ledges inside up to what's left of its top floor, and what was hidden there. */
function hollowTower(ctx, S, site, M, ledgeClimb) {
  const { b } = ctx, F = frame(site), y = site.y, R = 4.4, base = y - 3;
  const stone = M('castle_keep_rough_battlement_block', 2.4, { tint: 0x8a8682 }), moss = M('rock_06_overworld_mossy_rock_1_03', 2.4, { tint: 0x9aa088, tri: true });
  const n = 14, door = Math.round(((Math.atan2(F.fz, F.fx) + TAU) % TAU) / TAU * n) % n;
  b.ring(F.x, F.z, R, base, y + 7, n, stone, { door });
  for (let k = 0; k < n; k++) {        // (its broken crown: each face standing to a different height)
    if (k === door) continue;
    const a = (k + 0.5) / n * TAU, hgt = [6, 9, 3, 11, 7.5, 2, 10, 5, 8.5, 4, 12, 6.5, 3.5, 9][k], w = 2 * R * Math.sin(Math.PI / n);
    b.place(F.x + Math.cos(a) * (R - 0.1), y + 7, F.z + Math.sin(a) * (R - 0.1), -a - Math.PI / 2, 1, (o) => {
      o.box([-w / 2, 0, -0.35], [w / 2, hgt, 0.35], stone);
      o.blob([0, hgt, 0], [w * 0.45, 0.35, 0.4], stone, { detail: 1, jitter: 0.3, seed: 300 + k });
    }, { solid: true, minHeight: 1 });
  }
  for (let k = 0; k < 12; k++) { const a = rnd() * TAU, r = R + 1 + rnd() * 5, x = F.x + Math.cos(a) * r, z = F.z + Math.sin(a) * r, s = 0.4 + rnd() * 0.8;   // (fallen stone)
    if (Math.abs(Math.atan2(Math.sin(a - Math.atan2(F.fz, F.fx)), Math.cos(a - Math.atan2(F.fz, F.fx)))) < 0.5) continue;
    b.place(x, S.heightAt(x, z), z, rnd() * 6, 1, (o) => o.blob([0, s * 0.4, 0], [s * 1.3, s * 0.7, s], stone, { detail: 1, jitter: 0.25, seed: 340 + k }), { solid: s > 0.8 }); }
  const ledges = ledgeClimb(ctx, stone, moss, F.x, F.z, y + 1.0, y + 13.5, R - 1.6, Math.atan2(F.fz, F.fx) + Math.PI, 360, { step: 0.55 });
  const L = ledges[ledges.length - 1], top = L[1] + 1.0;
  b.place(F.x, top - 0.4, F.z, 0, 1, (o) => o.blob([0, 0, 0], [2.2, 0.4, 2.0], stone, { detail: 2, jitter: 0.15, seed: 380 }), { solid: false });   // (the top floor's last corner)
  ctx.physics.add([F.x - 1.6, top - 0.8, F.z - 1.5], [F.x + 1.6, top, F.z + 1.5], 'rock');
  ctx.props?.add('chest_gilded_iron', F.x, top, F.z, Math.atan2(F.fx, F.fz), 1);
  (S.chests ||= []).push({ id: 'chest_gilded_iron', x: F.x, z: F.z, name: 'The Last Watch-Captain\'s Chest', charm: null });
  // graves dug round it, the dead come up out of them
  for (let k = 0; k < 6; k++) { const a = Math.atan2(F.fz, F.fx) + 0.9 + k * 0.75, x = F.x + Math.cos(a) * (R + 3.5), z = F.z + Math.sin(a) * (R + 3.5);
    ctx.scatter?.place(k % 2 ? 'broken_headstone' : 'rounded_headstone', x, S.heightAt(x, z), z, 1, a + Math.PI / 2); }
  site.frame = F; site.court = { x: F.x + F.fx * (R + 4), z: F.z + F.fz * (R + 4), y };
}

/** Crowstep: a square watchtower the bandits took, up its side path: a timber gallery on top, a
 * stair of planks up two of its sides, a palisade round the pad, their tents and their loot. */
function banditTower(ctx, S, site, M) {
  const { b, physics } = ctx, F = frame(site), y = site.y, base = y - 3, top = y + 10.08;
  const stone = M('stone_06_mossy_fieldstone_1_03', 1.8, { tri: true }), wood = M('ship_01_tarblack_oak', 1), plank = M('town_oak_boards', 1.2, { tint: 0x9a8a78 });
  const P = (id, lx, lz, s = 1, rot = null) => { const [x, z] = F.at(lx, lz); ctx.scatter?.place(id, x, S.heightAt(x, z), z, s, rot ?? F.yaw + rnd() * 0.8 - 0.4); };
  lbox(b, F, -3.2, base, -6.4, 3.2, top, 0, stone);
  // the stair: up its front, then its right side
  { const [sx, sz] = F.at(-3.0, 0.75); b.stairs(sx, sz, y, 5.04, 1.4, F.dir('r'), plank, { step: 0.36, run: 0.42 });
    lbox(b, F, 2.0, y - 0.5, -0.6, 4.7, y + 5.04, 1.45, plank);
    const [qx, qz] = F.at(3.95, -0.6); b.stairs(qx, qz, y + 5.04, 5.04, 1.4, F.dir('b'), plank, { step: 0.36, run: 0.42 }); }
  // the gallery: a plank floor out past the walls, a rail, a roof of boards on posts
  lbox(b, F, -3.9, top - 0.15, -7.1, 3.22, top, 0.7, plank);        // (its right edge flush with the tower's, where the stair comes up)
  for (const [lx, lz] of [[-3.8, -7], [3.1, -7], [-3.8, 0.6], [3.1, 0.6]]) lbox(b, F, lx - 0.1, top, lz - 0.1, lx + 0.1, top + 2.6, lz + 0.1, wood, { solid: false });
  lbox(b, F, -4.1, top + 2.6, -7.3, 4.1, top + 2.75, 0.9, plank, { solid: false });
  for (const [x0, z0, x1, z1] of [[-3.9, -7.1, 3.2, -7.0], [-3.9, -7.1, -3.8, 0.7]]) lbox(b, F, x0, top + 0.9, z0, x1, top + 1.05, z1, wood);
  // the palisade round the pad, open toward the path
  const stake = M('ship_01_tarblack_oak', 1, { tint: 0xb8a088 }), open = Math.atan2(F.fz, F.fx);
  for (let k = 0; k < 44; k++) {
    const a = k / 44 * TAU; if (Math.abs(Math.atan2(Math.sin(a - open), Math.cos(a - open))) < 0.32) continue;
    const r = site.r0 - 0.8, x = F.x + Math.cos(a) * r, z = F.z + Math.sin(a) * r, h = 1.8 + (k % 4) * 0.15, yy = S.heightAt(x, z);
    b.place(x, yy - 0.2, z, a, 1, (o) => { o.box([-0.1, 0, -0.1], [0.1, h, 0.1], stake); o.cone(0, 0, 0.14, h, 0.35, 5, stake); }, { solid: false });
    physics.add([x - 0.15, yy - 0.2, z - 0.15], [x + 0.15, yy + h, z + 0.15], 'post');
  }
  P('hide_tent', -6, 2, 1.1, F.yaw + 0.6); P('hide_tent', 6.5, 1.5, 1.1, F.yaw - 0.6); P('hide_bedroll', -5, 4.5, 1); P('hide_bedroll', 5, 5, 1);
  P('wagon', -6.5, -4, 1, F.yaw + Math.PI / 2); P('sacks', 6, -4, 1); P('supply_crate', 7, -2, 1); P('caravan_chest', 5.5, -6, 1, F.yaw); P('closed_barrel', -4.5, -6.8, 1); P('weapon_cache', 0, 5.5, 1);
  fire(ctx, S, ...F.at(0, 3.5).flatMap((v, i) => (i === 0 ? [v, S.heightAt(...F.at(0, 3.5))] : [v])), 1);
  site.frame = F; site.court = { x: F.at(0, 3)[0], z: F.at(0, 3)[1], y };
  site.top = { at: F.at(0, -3.2), y: top };
}

// ------------------------------------------------------------------ the Red Fold
/** The Red Scythe's war camp, cut into the slope beside the road: their tents round a great fire,
 * red banners with the scythe on them, racks of axes, a war drum, a pyre with a stake in it, heads on
 * spikes along the road side. */
function warCamp(ctx, S, site, M) {
  const { b, physics } = ctx, F = frame(site), y = site.y;
  const red = M('cloth_04_aged_cream_linen', 0.8, { tint: 0x7a1812 }), red2 = M('cloth_04_aged_cream_linen', 0.8, { tint: 0x4a0e0c }), wood = M('ship_01_tarblack_oak', 1), hide = M('cloth_04_aged_cream_linen', 0.6, { tint: 0x6a4a30 });
  const P = (id, lx, lz, s = 1, rot = null) => { const [x, z] = F.at(lx, lz); ctx.scatter?.place(id, x, S.heightAt(x, z), z, s, rot ?? F.yaw + rnd() * 0.8 - 0.4); };
  // the tents: tall red pyramids, their doors to the fire
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * 0.15 + k / 6 * Math.PI * 1.7 + Math.atan2(-F.fz, -F.fx) - Math.PI, r = 10.5, x = F.x + Math.cos(a) * r, z = F.z + Math.sin(a) * r, yy = S.heightAt(x, z), s = 1.6 + (k % 3) * 0.2;
    b.place(x, yy, z, -a + Math.PI / 4, 1, (o) => { o.cone(0, 0, s * 1.5, 0, s * 2.1, 4, k % 2 ? red : red2); o.box([-0.05, 0, -0.05], [0.05, s * 2.4, 0.05], wood); }, { solid: true });
  }
  fire(ctx, S, F.x, y, F.z, 1.9);
  // banners on poles round it
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * TAU + 0.3, x = F.x + Math.cos(a) * 6.5, z = F.z + Math.sin(a) * 6.5, yy = S.heightAt(x, z);
    b.place(x, yy, z, -a, 1, (o) => { o.box([-0.06, 0, -0.06], [0.06, 5.2, 0.06], wood); o.box([-0.05, 3.0, 0.06], [0.05, 5.0, 1.3], red); }, { solid: false });
  }
  { const [fx, fz] = F.at(0, -site.r0 + 3); const FF = { ...F, x: fx, z: fz, at: (lx, lz) => [fx + F.rx * lx + F.fx * lz, fz + F.rz * lx + F.fz * lz] }; banner(b, M, FF, 0, 0, y + 5.5, 0x7a1610, 'scythe'); b.place(fx, y, fz, F.yaw, 1, (o) => { o.box([-1.2, 0, -0.1], [-1.05, 5.8, 0.05], wood); o.box([1.05, 0, -0.1], [1.2, 5.8, 0.05], wood); o.box([-1.2, 5.5, -0.1], [1.2, 5.7, 0.05], wood); }, { solid: false }); }
  // the war drum
  { const [dx, dz] = F.at(-5, -4); b.place(dx, y, dz, 0, 1, (o) => { o.cylinder([0, 0.1, 0], [0, 1.2, 0], 0.7, 12, hide); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; o.beam([Math.cos(a) * 0.72, 0.1, Math.sin(a) * 0.72], [Math.cos(a) * 0.72, 1.2, Math.sin(a) * 0.72], 0.05, 0.05, wood); } }, { solid: true }); }
  // the pyre: logs stacked round a stake, someone's armour on it
  { const [px, pz] = F.at(5, -5); b.place(px, y, pz, 0.4, 1, (o) => {
    for (let k = 0; k < 10; k++) { const a = k * 0.63; o.beam([Math.cos(a) * 1.2, 0.2 + (k % 3) * 0.25, Math.sin(a) * 1.2], [-Math.cos(a) * 1.2, 0.3 + (k % 3) * 0.25, -Math.sin(a) * 1.2], 0.14, 0.14, M('ship_01_tarblack_oak', 1, { tint: 0x5a4434 })); }
    o.box([-0.08, 0, -0.08], [0.08, 3.4, 0.08], wood);
    o.blob([0, 2.2, 0.1], [0.3, 0.75, 0.25], M('castle_basalt', 1, { tint: 0x2a2624 }), { detail: 1, jitter: 0.2, seed: 501 });
  }, { solid: true }); }
  P('weapon_cache', 7, 2, 1.1); P('spear_rack', -8, 1, 1, F.yaw + Math.PI / 2); P('armory_barrel', 8, -1.5, 1); P('supply_crate', -7.5, -6, 1); P('skull_pile', 3, 6, 1); P('hide_bedroll', -3, 4.5, 1); P('hide_bedroll', 3.5, -2.5, 1);
  for (let k = 0; k < 7; k++) { const [hx, hz] = F.at(-6 + k * 2, site.r0 - 1.5); headStake(b, M, hx, S.heightAt(hx, hz), hz, F.yaw, 20 + k); }
  site.frame = F; site.court = { x: F.x, z: F.z, y };
  void physics;
}

// ------------------------------------------------------------------ the ledges
function ledge(ctx, S, site, M) {
  const { b } = ctx, F = frame(site), y = site.y;
  const P = (id, lx, lz, s = 1, rot = null) => { const [x, z] = F.at(lx, lz); ctx.scatter?.place(id, x, S.heightAt(x, z), z, s, rot ?? F.yaw + rnd() * 0.8 - 0.4); };
  const rock = M('rock_05_overworld_granite_1_02', 3, { tint: 0xb8b2a8, tri: true });
  switch (site.folk) {
    case 'slimes': {     // a seep out of the rock, a green pool under it
      const [px, pz] = F.at(0, -3);
      b.place(px, y - 0.25, pz, 0, 1, (o) => o.blob([0, 0, 0], [3.2, 0.3, 2.4], M('rock_06_overworld_mossy_rock_1_03', 2, { tint: 0x6a8a5a, tri: true }), { detail: 2, jitter: 0.2, seed: 610 }), { solid: false });
      for (let k = 0; k < 5; k++) { const [x, z] = F.at(-4 + k * 2, -5.5 + (k % 2)); b.place(x, S.heightAt(x, z), z, k, 1, (o) => o.blob([0, 0.5, 0], [1.1, 0.9, 0.9], rock, { detail: 2, jitter: 0.25, seed: 620 + k }), { solid: true }); }
      (S.slimeSpots ||= []).push({ x: F.x, z: F.z, r: 4.5, mix: [['mire', 'S', 2], ['mire', 'M', 2], ['toxic', 'XS', 2], ['bog', 'L', 1]] });
      break;
    }
    case 'bandit': P('hide_tent', -3, -3, 1); P('closed_barrel', 3, -3.5, 1); P('supply_crate', 3.8, -1.5, 1); P('sacks', -4, 0.5, 1);
      fire(ctx, S, F.x, S.heightAt(F.x, F.z), F.z, 0.9); break;
    case 'goats': P('hide_bedroll', -2.5, -2.5, 1); P('hide_bedroll', 2.5, -2.8, 1); P('gnawed_bones', 0, 2.5, 1); P('goat_weapon_cache', -3, 1.5, 1);
      fire(ctx, S, F.x, S.heightAt(F.x, F.z), F.z, 0.9); break;
    case 'scythe': {
      const [fx, fz] = F.at(0, -2.5);
      b.place(fx, S.heightAt(fx, fz), fz, F.yaw, 1, (o) => { o.box([-0.06, 0, -0.06], [0.06, 4.6, 0.06], M('ship_01_tarblack_oak', 1)); o.box([0.06, 2.8, -0.02], [1.5, 4.4, 0.02], M('cloth_04_aged_cream_linen', 0.8, { tint: 0x7a1812 })); }, { solid: false });
      P('weapon_cache', 3, -2, 1); P('hide_bedroll', -3, -1, 1);
      fire(ctx, S, F.x, S.heightAt(F.x, F.z), F.z, 0.9);
      for (let k = 0; k < 3; k++) { const [hx, hz] = F.at(-2 + k * 2, site.r0 - 1.5); headStake(b, M, hx, S.heightAt(hx, hz), hz, F.yaw, 40 + k + site.road); }
      break;
    }
    case 'dead': {       // the pilgrims' barrow: a long mound, a ring of stones, their graves torn open
      const [mx, mz] = F.at(0, -3);
      b.place(mx, y - 0.6, mz, F.yaw, 1, (o) => o.blob([0, 0, 0], [4.2, 1.5, 2.2], M('ground_grass_05', 2, { tint: 0x8a9070 }), { detail: 2, jitter: 0.1, seed: 640 }), { solid: true });
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, [x, z] = [F.x + Math.cos(a) * 5.4, F.z + Math.sin(a) * 5.4]; ctx.scatter?.place('standing_stone', x, S.heightAt(x, z), z, 0.8 + (k % 3) * 0.15, a); }
      P('broken_headstone', -2.5, 2, 1); P('rounded_headstone', 2.5, 2.2, 1); P('open_sarcophagus', 0, 2.5, 1);
      break;
    }
  }
  site.frame = F; site.court = { x: F.x, z: F.z, y };
}

// ------------------------------------------------------------------ ambushes, signposts, crags
/** Each ambush's hiding places: a big rock between each one and the road, so you don't see them till
 * they're coming down at you. */
function ambushRocks(ctx, S, M) {
  const { b } = ctx, rock = M('rock_05_overworld_granite_1_02', 3, { tint: 0xb0aaa0, tri: true }), moss = M('rock_06_overworld_mossy_rock_1_03', 2.6, { tint: 0xc0c4b0, tri: true });
  S.ambushes.forEach((A, n) => A.spots.forEach(([x, z], k) => {
    const rx = x - A.ux * 1.6, rz = z - A.uz * 1.6, s = 1.3 + ((n + k) % 3) * 0.25;
    b.place(rx, S.heightAt(rx, rz) - 0.3, rz, n + k, 1, (o) => {
      o.blob([0, s * 0.6, 0], [s * 1.3, s, s * 1.1], (n + k) % 2 ? rock : moss, { detail: 2, jitter: 0.24, seed: 700 + n * 10 + k });
      o.blob([s * 0.6, s * 0.3, s * 0.5], [s * 0.6, s * 0.5, s * 0.5], rock, { detail: 1, jitter: 0.25, seed: 760 + n * 10 + k });
    }, { solid: true, tag: 'rock' });
  }));
}

/** Where each side path leaves the road: a signpost and a cairn (and red rags on it where the Red
 * Scythe are). */
function signposts(ctx, S, M) {
  const { b } = ctx, cm = M('stone_06_mossy_fieldstone_1_03', 1.6, { tri: true });
  for (const site of [...S.holds, ...S.ledges]) {
    if (!site.path) continue;
    const [x, z] = site.path.pts[0], [x2, z2] = site.path.pts[2] || site.path.pts[1], a = Math.atan2(x2 - x, z2 - z), sx = x + Math.cos(a) * 1.8, sz = z - Math.sin(a) * 1.8, sy = S.heightAt(sx, sz);
    ctx.scatter?.place('trail_sign', sx, sy, sz, 1, a);
    b.place(sx + Math.sin(a) * 0.9, sy, sz + Math.cos(a) * 0.9, a, 1, (o) => {
      for (let k = 0; k < 4; k++) o.blob([Math.sin(k * 2.1) * 0.06, 0.13 + k * 0.17, 0], [0.24 - k * 0.04, 0.11, 0.21 - k * 0.035], cm, { detail: 0, jitter: 0.25, seed: 1900 + site.road + k });
      if (site.folk === 'scythe') o.box([-0.02, 0.5, -0.12], [0.02, 0.9, 0.12], M('cloth_04_aged_cream_linen', 0.5, { tint: 0x7a1812 }));
    }, { solid: false });
  }
}

/** Crags and tors on the open flanks, off the road and every path and pad: stacks of weathered
 * blocks, lone spires, split boulders. */
function crags(ctx, S, M, n = 70) {
  const { b } = ctx;
  const mats = [M('rock_05_overworld_granite_1_02', 3, { tint: 0xb8b2a8, tri: true }), M('rock_02_cave_dark_basalt_1_05', 3, { tint: 0xa8a8b0, tri: true }), M('rock_06_overworld_mossy_rock_1_03', 2.6, { tint: 0xc0c4b0, tri: true })];
  const free = (x, z, r) => { const rr = S.roadAt(x, z), t = S.trailAt(x, z); return (!rr || rr.d > 6 + r) && (!t || t.d > t.w + 3 + r) && !S.shelves.some((c) => Math.hypot(x - c.x, z - c.z) < (c.r1 || 10) + r + 3) && !(S.views || []).some((v) => Math.hypot(x - v.x, z - v.z) < 14 + r); };
  let made = 0;
  for (let i = 0; i < 4000 && made < n; i++) {
    const a = rnd() * TAU, d = 120 + rnd() * 700, x = -1000 + Math.cos(a) * d, z = -1000 + Math.sin(a) * d;
    if (!S.covers(x, z) || Math.hypot(x, z) < 330) continue;
    const kind = made % 3, r = kind === 1 ? 2.5 : 4;
    if (!free(x, z, r) || S.slopeAt(x, z) > 0.9) continue;
    const y = S.heightAt(x, z) - 0.6, m = mats[made % 3], sd = 2000 + made * 13;
    if (kind === 0) {       // a tor: weathered blocks stacked, leaning
      const h = 3 + rnd() * 4;
      b.place(x, y, z, rnd() * 6, 1, (o) => { for (let k = 0; k < 5; k++) o.blob([Math.sin(k * 1.7) * 0.5, 0.8 + k * h / 5, Math.cos(k * 1.3) * 0.4], [2.4 - k * 0.3, h / 9 + 0.35, 2.0 - k * 0.25], m, { detail: 2, jitter: 0.2, seed: sd + k }); }, { solid: true, tag: 'rock' });
    } else if (kind === 1) {   // a spire
      const h = 6 + rnd() * 8;
      b.place(x, y, z, rnd() * 6, 1, (o) => { o.cylinder([0, -1, 0], [(rnd() - 0.5) * 1.5, h, (rnd() - 0.5) * 1.5], 1.9, 7, m, { r1: 0.5 }); for (let k = 0; k < 3; k++) o.blob([Math.sin(k * 2.2) * 1.2, 0.6 + k * h * 0.22, Math.cos(k * 2.2) * 1.1], [1.1, 1.3, 1.0], m, { detail: 2, jitter: 0.22, seed: sd + k }); }, { solid: true, tag: 'rock' });
    } else {                // a split boulder, its halves fallen apart
      const s = 2 + rnd() * 1.8;
      b.place(x, y, z, rnd() * 6, 1, (o) => { o.blob([-s * 0.45, s * 0.7, 0], [s * 0.55, s, s * 0.9], m, { detail: 2, jitter: 0.2, seed: sd }); o.blob([s * 0.55, s * 0.6, 0.2], [s * 0.5, s * 0.9, s * 0.85], m, { detail: 2, jitter: 0.2, seed: sd + 1 }); }, { solid: true, tag: 'rock' });
    }
    made++;
  }
  return made;
}

/** Everything above, built (mountain.js buildMountain, after the road, trails and caves). */
export function buildHolds(ctx, S, M, { ledgeClimb }) {
  seed = 7331;
  for (const site of S.holds) {
    if (site.kind === 'keep') keep(ctx, S, site, M, site.folk === 'wardens');
    else if (site.id === 'cairnwatch') watchTower(ctx, S, site, M);
    else if (site.id === 'hollowtower') hollowTower(ctx, S, site, M, ledgeClimb);
    else if (site.id === 'crowstep') banditTower(ctx, S, site, M);
    else if (site.kind === 'camp') warCamp(ctx, S, site, M);
  }
  for (const site of S.ledges) ledge(ctx, S, site, M);
  // the Wardens at their posts (main.js reads S.givers): the captain in Greywatch's court, two of the
  // watch on its gate, Edda at Cairnwatch's foot
  const G = S.givers ||= {}, gw = S.holds.find((h) => h.id === 'greywatch'), cw = S.holds.find((h) => h.id === 'cairnwatch');
  if (gw?.frame) {
    const F = gw.frame, [x, z] = F.at(-3.5, 4), [tx, tz] = F.at(0, 9);
    G.Halvard = { key: 'gwHalvard', post: [x, z, Math.atan2(tx - x, tz - z)], floor: gw.y + 0.06 };
    for (const [k, s] of [['gwWardenA', -3.2], ['gwWardenB', 3.2]]) { const [wx, wz] = F.at(s, 14.2); G[k] = { key: k, post: [wx, wz, F.yaw], floor: S.heightAt(wx, wz) }; }
  }
  if (cw?.frame) { const F = cw.frame, [x, z] = F.at(2.6, 6.2); G.Edda = { key: 'cwEdda', post: [x, z, F.yaw], floor: S.heightAt(x, z) }; }
  ambushRocks(ctx, S, M);
  signposts(ctx, S, M);
  S.crags = crags(ctx, S, M);
  S.hold = (id) => S.holds.find((h) => h.id === id);
}
