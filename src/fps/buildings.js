// Detailed village architecture: half-timbered houses with jettied upper storeys, framed and
// glazed windows with shutters and flower boxes, doors, steps, barge boards, ridge caps,
// dormers, chimneys and shop signs, furnished inside; lamp posts, market stalls, fences, carts.
// Everything is built from the geometry builder's boxes, beams and cylinders.
import * as THREE from 'three';

/** A house's own frame: u along its front, v out through the front, quarter turns only so
 * boxes stay axis-aligned. rot: 0 front faces +z (south), 1 +x (east), 2 -z, 3 -x. */
export class Frame {
  constructor(b, x, z, rot, y0 = 0) {
    this.b = b; this.x = x; this.z = z; this.rot = rot; this.y0 = y0; // y0: the ground it stands on
    const th = rot * Math.PI / 2;
    this.c = Math.round(Math.cos(th)); this.s = Math.round(Math.sin(th));
  }

  p(u, y, v) { return [this.x + u * this.c + v * this.s, y + this.y0, this.z - u * this.s + v * this.c]; }
  local(dx, dz) { return [dx * this.c - dz * this.s, dx * this.s + dz * this.c]; }

  box(min, max, mat, opts) {
    const a = this.p(min[0], min[1], min[2]), b = this.p(max[0], max[1], max[2]);
    this.b.box([Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2])], [Math.max(a[0], b[0]), b[1], Math.max(a[2], b[2])], mat, opts);
  }

  beam(a, b, w, h, mat, opts = {}) {
    const up = opts.up ? (() => { const [x, , z] = this.p(opts.up[0], 0, opts.up[2]); return [x - this.x, opts.up[1], z - this.z]; })() : undefined;
    this.b.beam(this.p(...a), this.p(...b), w, h, mat, { ...opts, up });
  }

  cylinder(a, b, r, n, mat, opts) { this.b.cylinder(this.p(...a), this.p(...b), r, n, mat, opts); }

  /** A wall along u at depth v (alongU) or along v at u, with openings measured from the start. */
  wall(alongU, a0, a1, at, y0, y1, t, mat, openings, opts) {
    const P = alongU ? [this.p(a0, 0, at), this.p(a1, 0, at)] : [this.p(at, 0, a0), this.p(at, 0, a1)];
    const ops = (openings || []).map((o) => ({ ...o, y0: o.y0 + this.y0, y1: o.y1 + this.y0 }));
    this.b.wall(P[0][0], P[0][2], P[1][0], P[1][2], y0 + this.y0, y1 + this.y0, t, mat, ops, opts);
  }

  gable(u0, v0, u1, v1, y, rise, roof, gableMat, ridgeU, over, shade) {
    const a = this.p(u0, 0, v0), b = this.p(u1, 0, v1);
    const ridge = (ridgeU !== (this.rot % 2 === 1)) ? 'x' : 'z';
    this.b.gable(Math.min(a[0], b[0]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[2], b[2]), y + this.y0, rise, roof, gableMat, ridge, over, shade);
  }

  quad(mat, a, b, c, d, uvs, shade) { this.b.quad(mat, this.p(...a), this.p(...b), this.p(...c), this.p(...d), uvs, shade); }
}

const ROT = { s: 0, e: 1, n: 2, w: 3 };

/** Window openings along a wall of length len. */
function windows(len, y0, y1, { skipMid = false, w = 1.1, every = 3.2, edge = 1.0 } = {}) {
  const out = [];
  const n = Math.max(1, Math.floor((len - edge * 2) / every));
  for (let i = 0; i < n; i++) {
    const at = edge + (i + 0.5) * (len - edge * 2) / n;
    if (skipMid && Math.abs(at - len / 2) < 1.9) continue;
    out.push({ at, w, y0, y1 });
  }
  return out;
}

/**
 * A house. h: {x, z, w, d, h (ground storey height), door, ridge, wall, roof, floor, storeys,
 * timber, upper, chimney, furnish, openFront, title, sign, dormers}. M(id, tile) makes
 * materials; mats: shared {glass, timber, trim, iron, plinth, shutters[], lining, rug, door}.
 */
/** The painted signboard for a trade (lib.biome.signs: blacksmith, inn, tavern, bakery...). */
function signMaterial(lib, shop) {
  lib.signMats ??= new Map();
  if (lib.signMats.has(shop)) return lib.signMats.get(shop);
  const s = lib.biome?.signs.get('sign_' + shop);
  let m = null;
  if (s) {
    const t = lib.texture(s.file, false);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    m = new THREE.MeshPhongMaterial({ map: t, specular: 0x14120f, shininess: 14 });
    if (lib.normals) m.normalMap = lib.normalMap(s.file, 1.2);
  }
  lib.signMats.set(shop, m);
  return m;
}

export function detailedHouse(ctx, h, M, mats) {
  const { b, props } = ctx;
  const rot = ROT[h.door];
  const base = h.y || 0; // the ground the house stands on
  const F = new Frame(b, h.x, h.z, rot, base);
  const W = rot % 2 ? h.d : h.w, D = rot % 2 ? h.w : h.d; // along the front, front to back
  const t = 0.32, fl = 0.4, G = h.h, U = h.storeys > 1 ? 3.0 : 0, J = h.storeys > 1 ? 0.55 : 0;
  // the town pack's wall panels are storey-high paintings (a sill along the foot, a beam or
  // coping along the top): one panel to each storey, its foot on that storey's floor
  const panel = (id) => !!ctx.lib.surf.get(id)?.wall_set;
  const upperId = h.upper || 'town_wall_oak_plaster';
  const wallMat = M(h.wall, panel(h.wall) ? G - fl : 3), upperMat = M(upperId, panel(upperId) && U ? U - 0.28 : 3), roofMat = M(h.roof, 2.5);
  const wallBase = panel(h.wall) ? { vbase: base + fl } : {}, upperBase = panel(upperId) && U ? { vbase: base + G + 0.28 } : {};
  // the floor and the walls inside: the house's own (the interior sheets), each at the scale its
  // boards, tiles or bricks really are (h.floorTile, h.liningTile, metres a repeat) and toned to
  // sit in the lamplight (h.floorTint, h.liningTint); else the shared boards
  const floorMat = M(h.floor, h.floorTile || 2.5, { tint: h.floorTint ?? 0xffffff, matte: !!h.matte });
  const lining = h.lining ? M(h.lining, h.liningTile || (/panelling/.test(h.lining) ? 1.8 : 2.4), { tint: h.liningTint ?? 0xffffff }) : mats.lining;
  // and in a plastered room a dark oak wainscot to waist height, as a lived-in house has
  const wainscot = h.wainscot ? M('int_03_wall_oak_panelling_1_02', 0.95, { tint: 0xc0b0a0 }) : null;
  const timber = mats.timber, trim = mats.trim;
  const shutter = mats.shutters[(Math.abs(Math.round(h.x * 7 + h.z * 3))) % mats.shutters.length];
  const top = G + U;
  const zone = { ...worldRect(F, -W / 2, -D / 2, W / 2, D / 2), y0: base - 1, y1: base + G, name: h.title || h.name };
  ctx.zones.push(zone);

  // the stone plinth the house stands on, the floor inside, and a step at the door
  F.box([-W / 2 - 0.12, 0, -D / 2 - 0.12], [W / 2 + 0.12, fl, D / 2 + 0.12], { top: floorMat, bottom: mats.plinth, side: mats.plinth });
  const doorU = h.doorAt || 0;
  // its room, for the people who live in it (and anything that lies in wait there): the floor,
  // and the step outside the front door
  const [dx, , dz] = F.p(doorU, 0, D / 2 + 1.6);
  ctx.interiors?.push({ ...zone, floor: base + fl, door: { x: dx, z: dz }, biome: h.biome || 'village' });
  F.box([doorU - 1.2, 0, D / 2 + 0.12], [doorU + 1.2, 0.2, D / 2 + 0.62], mats.plinth);

  // ground storey walls
  const door = { at: W / 2 + doorU, w: 1.6, y0: fl, y1: fl + 2.55 };
  const gw = (len, skipMid) => windows(len, fl + 1.05, fl + 2.25, { skipMid });
  const faces = [ // [alongU, from, to, at, outward normal (u, v), openings]
    [true, -W / 2, W / 2, D / 2, [0, 1], h.openFront ? null : [door, ...gw(W, true)]],
    [true, W / 2, -W / 2, -D / 2, [0, -1], gw(W, false)],
    [false, D / 2, -D / 2, -W / 2, [-1, 0], gw(D, false)],
    [false, -D / 2, D / 2, W / 2, [1, 0], gw(D, false)],
  ];
  for (const [alongU, a0, a1, at, n, ops] of faces) {
    if (ops === null) { // open-fronted (the stables): posts and a beam
      for (const u of [-W / 2, -W / 6, W / 6, W / 2]) F.box([u - 0.18, fl, D / 2 - 0.18], [u + 0.18, G, D / 2 + 0.18], timber);
      F.box([-W / 2, G - 0.5, D / 2 - 0.2], [W / 2, G, D / 2 + 0.2], timber);
      continue;
    }
    F.wall(alongU, a0, a1, at, fl, G, t, wallMat, ops, wallBase);
    F.wall(alongU, a0, a1, at - (alongU ? n[1] : n[0]) * (t / 2 + 0.02), fl, G - 0.15, 0.03, lining, ops, { solid: false, shade: 0.9, vbase: base + fl });
    if (wainscot) F.wall(alongU, a0, a1, at - (alongU ? n[1] : n[0]) * (t / 2 + 0.06), fl, fl + 0.95, 0.05, wainscot, ops, { solid: false, shade: 0.85, vbase: base + fl });
    face(F, alongU, a0, a1, at, n, fl, G, ops, h.timber ? timber : null, trim, shutter, mats, t, true);
  }
  // inside: ceiling with joists, a rug, a lamp on the back wall
  F.box([-W / 2 + t / 2, G - 0.12, -D / 2 + t / 2], [W / 2 - t / 2, G, D / 2 - t / 2], mats.ceiling, { shade: 0.75, solid: false });
  for (let u = -W / 2 + 1; u < W / 2 - 0.5; u += 1.2) F.box([u - 0.09, G - 0.34, -D / 2 + t / 2], [u + 0.09, G - 0.12, D / 2 - t / 2], timber, { solid: false, shade: 0.7 });
  F.box([-W / 4, fl, -D / 4], [W / 4, fl + 0.015, D / 4], mats.rug, { solid: false });
  {
    const [x, , z] = F.p(W / 2 - 1.2, 0, -D / 2 + t / 2 + 0.02);
    props.add('wall_torch', x, base + fl - 0.3, z, rot * Math.PI / 2);
  }

  // the upper storey, jettied out over the front and back
  if (U) {
    const V = D / 2 + J;
    F.box([-W / 2, G, -V], [W / 2, G + 0.28, V], timber, { solid: false, shade: 0.8 });
    for (let u = -W / 2 + 0.3; u < W / 2; u += 0.55) for (const sgn of [1, -1]) // joist ends under the jetty
      F.box([u - 0.08, G - 0.2, sgn > 0 ? D / 2 : -V], [u + 0.08, G, sgn > 0 ? V : -D / 2], timber, { solid: false, shade: 0.7 });
    const uw = (len) => windows(len, G + 1.0, G + 2.1, { w: 1.0, every: 2.8 });
    const up = [
      [true, -W / 2, W / 2, V, [0, 1], uw(W)], [true, W / 2, -W / 2, -V, [0, -1], uw(W)],
      [false, V, -V, -W / 2, [-1, 0], uw(D + 2 * J)], [false, -V, V, W / 2, [1, 0], uw(D + 2 * J)],
    ];
    for (const [alongU, a0, a1, at, n, ops] of up) {
      F.wall(alongU, a0, a1, at, G + 0.28, top, t * 0.8, upperMat, ops, { solid: false, ...upperBase });
      face(F, alongU, a0, a1, at, n, G + 0.28, top, ops, timber, trim, shutter, mats, t * 0.8, false);
    }
    F.box([-W / 2 - 0.05, top - 0.25, -V - 0.05], [W / 2 + 0.05, top, V + 0.05], timber, { solid: false }); // wall plate
  }

  // the roof: steep gable, barge boards, ridge cap, fascia, dormers
  const V = D / 2 + J, ridgeU = W >= D * 0.9;
  const span = ridgeU ? 2 * V : W, rise = span * 0.62, over = 0.6;
  F.gable(-W / 2, -V, W / 2, V, top, rise, roofMat, h.timber || U ? upperMat : wallMat, ridgeU, over, 1);
  const ey = top - over * rise / (span / 2), ry = top + rise;
  if (ridgeU) {
    for (const u of [-W / 2 - over + 0.04, W / 2 + over - 0.04]) {
      F.beam([u, ey - 0.1, V + over], [u, ry + 0.05, 0], 0.08, 0.32, trim, { up: [0, 1, 0] });
      F.beam([u, ey - 0.1, -V - over], [u, ry + 0.05, 0], 0.08, 0.32, trim, { up: [0, 1, 0] });
    }
    F.beam([-W / 2 - over, ry + 0.06, 0], [W / 2 + over, ry + 0.06, 0], 0.26, 0.2, mats.ridge);
    for (const v of [V + over, -V - over]) F.beam([-W / 2 - over, ey - 0.05, v], [W / 2 + over, ey - 0.05, v], 0.06, 0.24, trim);
    // timber in the gable ends
    if (h.timber || U) for (const u of [-W / 2 - 0.02, W / 2 + 0.02]) {
      F.beam([u, top, 0], [u, ry - 0.2, 0], 0.18, 0.18, timber);
      F.beam([u, top + rise * 0.45, -V * 0.55], [u, top + rise * 0.45, V * 0.55], 0.16, 0.16, timber);
      F.beam([u, top, -V * 0.7], [u, top + rise * 0.45, -V * 0.35], 0.14, 0.14, timber);
      F.beam([u, top, V * 0.7], [u, top + rise * 0.45, V * 0.35], 0.14, 0.14, timber);
    }
    // dormers on the front slope
    const nd = h.dormers ?? (W > 11 ? 2 : W > 8 ? 1 : 0);
    for (let i = 0; i < nd; i++) {
      const u = -W / 2 + (i + 1) * W / (nd + 1);
      const v0 = V * 0.18, yb = top + rise * (1 - (V * 0.62) / V) - 0.1; // where the dormer's front meets the roof
      const dw = 1.7, dh = 1.6;
      F.box([u - dw / 2, yb - 0.6, v0], [u + dw / 2, yb + dh, V * 0.62], upperMat, { solid: false });
      F.box([u - 0.45, yb + 0.25, V * 0.62 - 0.02], [u + 0.45, yb + 1.25, V * 0.62 + 0.01], mats.glass, { solid: false });
      for (const du of [-0.5, 0.5]) F.beam([u + du, yb + 0.2, V * 0.62 + 0.04], [u + du, yb + 1.3, V * 0.62 + 0.04], 0.1, 0.1, trim);
      F.beam([u - 0.55, yb + 0.2, V * 0.62 + 0.05], [u + 0.55, yb + 0.2, V * 0.62 + 0.05], 0.1, 0.12, trim);
      F.beam([u - 0.55, yb + 1.3, V * 0.62 + 0.05], [u + 0.55, yb + 1.3, V * 0.62 + 0.05], 0.1, 0.12, trim);
      // its little roof
      const a = F.p(u - dw / 2 - 0.15, 0, v0), c = F.p(u + dw / 2 + 0.15, 0, V * 0.62 + 0.25);
      b.gable(Math.min(a[0], c[0]), Math.min(a[2], c[2]), Math.max(a[0], c[0]), Math.max(a[2], c[2]), base + yb + dh, 0.9, roofMat, upperMat,
        rot % 2 ? 'x' : 'z', 0.15);
    }
  } else {
    for (const v of [-V - over + 0.04, V + over - 0.04]) {
      F.beam([W / 2 + over, ey - 0.1, v], [0, ry + 0.05, v], 0.32, 0.08, trim, { up: [0, 1, 0] });
      F.beam([-W / 2 - over, ey - 0.1, v], [0, ry + 0.05, v], 0.32, 0.08, trim, { up: [0, 1, 0] });
    }
    F.beam([0, ry + 0.06, -V - over], [0, ry + 0.06, V + over], 0.26, 0.2, mats.ridge);
    for (const u of [W / 2 + over, -W / 2 - over]) F.beam([u, ey - 0.05, -V - over], [u, ey - 0.05, V + over], 0.24, 0.06, trim);
    if (h.timber || U) for (const v of [-V - 0.02, V + 0.02]) {
      F.beam([0, top, v], [0, ry - 0.2, v], 0.18, 0.18, timber);
      F.beam([-W * 0.28, top + rise * 0.45, v], [W * 0.28, top + rise * 0.45, v], 0.16, 0.16, timber);
      F.beam([-W * 0.35, top, v], [-W * 0.17, top + rise * 0.45, v], 0.14, 0.14, timber);
      F.beam([W * 0.35, top, v], [W * 0.17, top + rise * 0.45, v], 0.14, 0.14, timber);
    }
    // a gable-end window up in the front
    const gv = V + 0.03;
    F.box([-0.5, top + 0.6, gv - 0.02], [0.5, top + 1.7, gv + 0.01], mats.glass, { solid: false });
    for (const du of [-0.55, 0.55]) F.beam([du, top + 0.55, gv + 0.04], [du, top + 1.75, gv + 0.04], 0.1, 0.1, trim);
    F.beam([-0.6, top + 0.55, gv + 0.05], [0.6, top + 0.55, gv + 0.05], 0.1, 0.12, trim);
    F.beam([-0.6, top + 1.75, gv + 0.05], [0.6, top + 1.75, gv + 0.05], 0.1, 0.12, trim);
  }

  // chimney: a stone stack from the ground to above the ridge, with a cap and pots
  if (h.chimney) {
    const [cu, cv] = F.local(...h.chimney);
    const cy = ry + 1.3;
    F.box([cu - 0.65, 0, cv - 0.65], [cu + 0.65, cy, cv + 0.65], mats.chimney, { solid: false });
    F.box([cu - 0.8, cy, cv - 0.8], [cu + 0.8, cy + 0.22, cv + 0.8], mats.plinth, { solid: false });
    F.cylinder([cu - 0.25, cy + 0.22, cv], [cu - 0.25, cy + 0.75, cv], 0.16, 6, mats.pot, { r1: 0.12 });
    F.cylinder([cu + 0.25, cy + 0.22, cv], [cu + 0.25, cy + 0.6, cv], 0.16, 6, mats.pot, { r1: 0.13 });
    ctx.chimneys?.push(F.p(cu - 0.25, cy + 0.8, cv));
  }

  // the door: its frame, the door itself (opens with E, swinging inward), a lantern outside
  if (!h.openFront) {
    const du = doorU;
    for (const s of [-1, 1]) F.beam([du + s * 0.86, fl, D / 2 + t / 2 + 0.03], [du + s * 0.86, fl + 2.65, D / 2 + t / 2 + 0.03], 0.18, 0.12, trim);
    F.beam([du - 1.0, fl + 2.65, D / 2 + t / 2 + 0.05], [du + 1.0, fl + 2.65, D / 2 + t / 2 + 0.05], 0.22, 0.2, trim);
    ctx.doors?.add({ hinge: F.p(du - 0.78, fl, D / 2), along: rot * Math.PI / 2, width: 1.56, height: 2.52, opens: 1, name: h.title || h.name, plank: Math.abs(Math.round(h.x + h.z)),
      design: h.doorArt || 'town_cottage_oak' });
    const [x, , z] = F.p(du + 1.5, 0, D / 2 + 0.17);
    props.add('wall_torch', x, base + fl - 0.4, z, rot * Math.PI / 2);
    // a hanging sign for the shops: the town pack's signboard for its trade, both faces
    if (h.shop) {
      const sy = Math.min(G - 0.4, fl + 3.1);
      F.beam([du - 2.1, sy, D / 2 + t / 2], [du - 2.1, sy, D / 2 + 1.45], 0.08, 0.1, mats.iron);
      F.beam([du - 2.1, sy - 0.25, D / 2 + t / 2], [du - 2.1, sy, D / 2 + 0.7], 0.05, 0.05, mats.iron);
      for (const dv of [0.62, 1.28]) F.beam([du - 2.1, sy, D / 2 + dv], [du - 2.1, sy - 0.22, D / 2 + dv], 0.02, 0.02, mats.iron);
      const art = signMaterial(ctx.lib, h.shop), edge = mats.signs[Math.abs(Math.round(h.x)) % mats.signs.length];
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.74, 0.8), art ? [art, art, edge, edge, edge, edge] : edge);
      board.position.set(...F.p(du - 2.1, sy - 0.22 - 0.37, D / 2 + 0.95));
      board.rotation.y = rot * Math.PI / 2;
      board.castShadow = board.receiveShadow = true;
      ctx.scene.add(board);
    }
  }
  for (const [id, fx, fz, r = 0, sc = 1] of h.furnish || []) props.add(id, h.x + fx, base + fl, h.z + fz, r, sc);
  return { F, W, D, top: ry };
}

function worldRect(F, u0, v0, u1, v1) {
  const a = F.p(u0, 0, v0), b = F.p(u1, 0, v1);
  return { x0: Math.min(a[0], b[0]), z0: Math.min(a[2], b[2]), x1: Math.max(a[0], b[0]), z1: Math.max(a[2], b[2]) };
}

/** One face of a storey: timber framing on it (posts, rails, braces) when `timber`, and every
 * window's frame, glass, mullions, sill, shutters and (downstairs, at the front) flower box. */
function face(F, alongU, a0, a1, at, n, y0, y1, ops, timber, trim, shutter, mats, t, ground) {
  const len = Math.abs(a1 - a0), dir = Math.sign(a1 - a0);
  const off = t / 2 + 0.04; // just proud of the wall
  const P = (s, y, o = off) => { // s metres along the face from a0, height y, o out from the wall
    const a = a0 + dir * s;
    return alongU ? [a, y, at + n[1] * o] : [at + n[0] * o, y, a];
  };
  const out = [n[0], 0, n[1]];
  if (timber) {
    const posts = new Set([0.09, len - 0.09]);
    for (const o of ops) { posts.add(o.at - o.w / 2 - 0.1); posts.add(o.at + o.w / 2 + 0.1); }
    const sorted = [...posts].sort((a, b) => a - b);
    for (let i = 0; i + 1 < sorted.length; i++) { // fill wide panels with studs
      const g = sorted[i + 1] - sorted[i];
      const k = Math.floor(g / 1.5);
      for (let j = 1; j <= k; j++) posts.add(sorted[i] + j * g / (k + 1));
    }
    const all = [...posts].sort((a, b) => a - b).filter((s) => !ops.some((o) => Math.abs(s - o.at) < o.w / 2));
    for (const s of all) F.beam(P(s, y0), P(s, y1), 0.2, 0.08, timber, { up: out });
    const mid = ground ? y0 + 1.0 : y0 + 0.9;
    for (const y of [y0 + 0.1, mid, y1 - 0.1]) { // rails, broken by the openings they would cross
      let s0 = 0;
      for (const o of [...ops].sort((a, b) => a.at - b.at)) {
        const a = o.at - o.w / 2 - 0.1, b2 = o.at + o.w / 2 + 0.1;
        if (y > o.y0 - 0.05 && y < o.y1 + 0.05) { if (a - s0 > 0.05) F.beam(P(s0, y), P(a, y), 0.08, 0.18, timber, { up: [0, 1, 0] }); s0 = b2; }
      }
      if (len - s0 > 0.05) F.beam(P(s0, y), P(len, y), 0.08, 0.18, timber, { up: [0, 1, 0] });
    }
    for (let i = 0; i + 1 < all.length; i++) { // braces in the open panels, alternating
      const s0 = all[i], s1 = all[i + 1];
      if (s1 - s0 < 0.7 || ops.some((o) => o.at + o.w / 2 > s0 && o.at - o.w / 2 < s1)) continue;
      const up = i % 2 ? [P(s0, y0 + 0.1), P(s1, mid)] : [P(s1, y0 + 0.1), P(s0, mid)];
      F.beam(up[0], up[1], 0.16, 0.07, timber, { up: out });
      const hi = i % 2 ? [P(s0, mid), P(s1, y1 - 0.1)] : [P(s1, mid), P(s0, y1 - 0.1)];
      F.beam(hi[0], hi[1], 0.16, 0.07, timber, { up: out });
    }
  } else { // stone or brick: corner quoins
    for (const s of [0.2, len - 0.2]) for (let y = y0; y < y1 - 0.2; y += 0.6) {
      const wide = Math.round((y - y0) / 0.6) % 2 ? 0.55 : 0.35;
      F.box(alongU ? [Math.min(P(s - wide / 2, 0)[0], P(s + wide / 2, 0)[0]), y, at + (n[1] > 0 ? t / 2 - 0.02 : -t / 2 - 0.06)] : [at + (n[0] > 0 ? t / 2 - 0.02 : -t / 2 - 0.06), y, Math.min(P(s - wide / 2, 0)[2], P(s + wide / 2, 0)[2])],
        alongU ? [Math.max(P(s - wide / 2, 0)[0], P(s + wide / 2, 0)[0]), y + 0.56, at + (n[1] > 0 ? t / 2 + 0.06 : -t / 2 + 0.02)] : [at + (n[0] > 0 ? t / 2 + 0.06 : -t / 2 + 0.02), y + 0.56, Math.max(P(s - wide / 2, 0)[2], P(s + wide / 2, 0)[2])],
        mats.quoin, { solid: false });
    }
  }
  for (const o of ops) {
    if (o.y0 <= y0 + 0.01) continue; // the door has its own frame
    const s0 = o.at - o.w / 2, s1 = o.at + o.w / 2;
    // glass in the middle of the wall, a cross of glazing bars, a frame and a sill
    F.quad(mats.glass, alongU ? P(s0, o.y0, 0) : P(s1, o.y0, 0), alongU ? P(s1, o.y0, 0) : P(s0, o.y0, 0),
      alongU ? P(s1, o.y1, 0) : P(s0, o.y1, 0), alongU ? P(s0, o.y1, 0) : P(s1, o.y1, 0), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    const gm = (o.y0 + o.y1) / 2;
    F.beam(P(o.at, o.y0, 0.02), P(o.at, o.y1, 0.02), 0.05, 0.05, trim);
    F.beam(P(s0, gm, 0.02), P(s1, gm, 0.02), 0.05, 0.05, trim);
    F.beam(P(s0 - 0.06, o.y0 - 0.02), P(s0 - 0.06, o.y1 + 0.06), 0.12, 0.1, trim, { up: out });
    F.beam(P(s1 + 0.06, o.y0 - 0.02), P(s1 + 0.06, o.y1 + 0.06), 0.12, 0.1, trim, { up: out });
    F.beam(P(s0 - 0.14, o.y1 + 0.08), P(s1 + 0.14, o.y1 + 0.08), 0.12, 0.16, trim, { up: [0, 1, 0] });
    F.beam(P(s0 - 0.12, o.y0 - 0.06, off + 0.06), P(s1 + 0.12, o.y0 - 0.06, off + 0.06), 0.24, 0.08, mats.sill, { up: [0, 1, 0] });
    // shutters, opened flat to either side
    const sw = o.w / 2 + 0.05;
    for (const [sa, sb] of [[s0 - 0.12 - sw, s0 - 0.12], [s1 + 0.12, s1 + 0.12 + sw]]) {
      F.beam(P((sa + sb) / 2, o.y0, off + 0.02), P((sa + sb) / 2, o.y1, off + 0.02), sw, 0.05, shutter, { up: out });
      for (const y of [o.y0 + 0.2, o.y1 - 0.2]) F.beam(P(sa, y, off + 0.06), P(sb, y, off + 0.06), 0.04, 0.08, shutter, { up: out });
    }
    // flower boxes under the front windows downstairs
    if (ground && n[1] > 0) {
      F.beam(P(s0 - 0.05, o.y0 - 0.25, off + 0.2), P(s1 + 0.05, o.y0 - 0.25, off + 0.2), 0.26, 0.28, mats.box, { up: [0, 1, 0] });
      const fp = P(o.at, o.y0 - 0.11, off + 0.2);
      const [x, y, z] = F.p(...fp);
      for (const k of [-1, 0, 1]) {
        const [x2, , z2] = F.p(...P(o.at + k * o.w * 0.32, 0, off + 0.2));
        F.b.flowers?.push([x2, y, z2]);
      }
      void x; void z;
    }
  }
}

/** A lamp post: a timber post on a stone foot, an iron arm and a glazed lantern that burns. */
export function lampPost(ctx, x, z, toward, mats) {
  const { b } = ctx;
  b.box([x - 0.3, 0, z - 0.3], [x + 0.3, 0.35, z + 0.3], mats.plinth);
  b.box([x - 0.09, 0.35, z - 0.09], [x + 0.09, 3.6, z + 0.09], mats.timber);
  const ax = x + toward[0] * 0.75, az = z + toward[1] * 0.75;
  b.beam([x, 3.45, z], [ax, 3.45, az], 0.06, 0.08, mats.iron);
  b.beam([x, 3.0, z], [x + toward[0] * 0.5, 3.45, z + toward[1] * 0.5], 0.04, 0.04, mats.iron);
  b.beam([ax, 3.45, az], [ax, 3.2, az], 0.02, 0.02, mats.iron);
  b.box([ax - 0.17, 2.75, az - 0.17], [ax + 0.17, 3.2, az + 0.17], mats.lantern, { solid: false });
  b.cone(ax, az, 0.24, 3.2, 0.22, 4, mats.iron);
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.beam([ax + dx * 0.18, 2.74, az + dz * 0.18], [ax + dx * 0.18, 3.21, az + dz * 0.18], 0.03, 0.03, mats.iron);
  ctx.flames.push([ax, 2.88, az, 0.16]);
}

/** A market stall: four posts, a counter, a sloping striped canopy, goods on top. */
export function marketStall(ctx, x, z, rot, cloth, mats) {
  const { b, bill } = ctx;
  const F = new Frame(b, x, z, rot);
  const w = 3.2, d = 1.8;
  for (const [u, v, hgt] of [[-w / 2, d / 2, 2.4], [w / 2, d / 2, 2.4], [-w / 2, -d / 2, 2.9], [w / 2, -d / 2, 2.9]])
    F.box([u - 0.07, 0, v - 0.07], [u + 0.07, hgt, v + 0.07], mats.timber);
  F.box([-w / 2 + 0.1, 0, d / 2 - 0.5], [w / 2 - 0.1, 0.95, d / 2 - 0.1], mats.counter);
  F.box([-w / 2, 0.95, d / 2 - 0.6], [w / 2, 1.0, d / 2], mats.trim, { solid: false });
  const c0 = [-w / 2 - 0.2, 2.35, d / 2 + 0.35], c1 = [w / 2 + 0.2, 2.35, d / 2 + 0.35], c2 = [w / 2 + 0.2, 2.95, -d / 2 - 0.1], c3 = [-w / 2 - 0.2, 2.95, -d / 2 - 0.1];
  const uv = [[0, 0], [w + 0.4, 0], [w + 0.4, 2.4], [0, 2.4]];
  F.quad(cloth, c0, c1, c2, c3, uv);
  F.quad(cloth, c1, c0, c3, c2, uv, 0.7);
  for (let u = -w / 2; u <= w / 2 + 0.01; u += w / 4) F.beam([u, 2.3, d / 2 + 0.35], [u, 2.1, d / 2 + 0.38], 0.02, 0.2, cloth); // a scalloped edge
  const goods = ['town_scatter_31_vegetable_basket', 'town_scatter_34_potion_jars', 'town_scatter_05_grain_sacks', 'town_scatter_33_scroll_rack', 'town_scatter_04_cloth_crate'];
  const g = goods[((Math.round(x * 3 + z) % goods.length) + goods.length) % goods.length];
  for (const k of [-0.9, 0.9]) {
    const [gx, , gz] = F.p(k, 0, d / 2 - 0.3);
    bill.add(g, gx, 1.0, gz, 0.45);
  }
}

/** A split-rail fence along a polyline of [x, z] points. */
export function fence(ctx, pts, mats, { gap = 2.2, height = 1.1 } = {}) {
  const { b } = ctx;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / gap));
    for (let k = 0; k <= n; k++) {
      const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n;
      b.box([x - 0.08, 0, z - 0.08], [x + 0.08, height + 0.1, z + 0.08], mats.post);
    }
    for (const y of [height * 0.45, height * 0.9]) b.beam([x0, y, z0], [x1, y, z1], 0.07, 0.1, mats.rail);
    b.box([Math.min(x0, x1) - 0.05, 0, Math.min(z0, z1) - 0.05], [Math.max(x0, x1) + 0.05, height, Math.max(z0, z1) + 0.05], mats.rail, { faces: { top: false, bottom: false, north: false, south: false, east: false, west: false } });
  }
}

/** A hand cart: a plank bed on two spoked wheels with its shafts down on the ground. */
export function cart(ctx, x, z, rot, mats) {
  const F = new Frame(ctx.b, x, z, rot);
  F.box([-0.8, 0.65, -0.55], [0.8, 0.75, 0.55], mats.counter, { solid: false });
  for (const v of [-0.55, 0.55]) F.box([-0.8, 0.75, v - 0.04], [0.8, 1.05, v + 0.04], mats.counter, { solid: false });
  F.box([-0.84, 0.75, -0.55], [-0.76, 1.05, 0.55], mats.counter, { solid: false });
  for (const v of [-0.68, 0.68]) {
    F.cylinder([0, 0.5, v - 0.05], [0, 0.5, v + 0.05], 0.5, 12, mats.wheel);
    F.cylinder([0, 0.5, v - 0.12], [0, 0.5, v + 0.12], 0.08, 6, mats.iron);
  }
  for (const v of [-0.45, 0.45]) F.beam([0.8, 0.7, v], [2.3, 0.05, v], 0.07, 0.07, mats.timber);
  ctx.physics.add(...(() => { const a = F.p(-0.9, 0, -0.8), c = F.p(0.9, 1.1, 0.8); return [[Math.min(a[0], c[0]), 0, Math.min(a[2], c[2])], [Math.max(a[0], c[0]), 1.1, Math.max(a[2], c[2])]]; })(), 'prop');
}

/** Shared materials for the houses (some from the library's unused textures). */
export function houseMaterials(lib, M) {
  const glass = new THREE.MeshPhongMaterial({ color: 0x1c2430, specular: 0x9aaabb, shininess: 90, emissive: 0xffa040,
    emissiveIntensity: 0, side: THREE.DoubleSide, transparent: false });
  glass.userData = { tileU: 1, tileV: 1, noCast: true };
  const lantern = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.8) });
  lantern.userData = { tileU: 1, tileV: 1, noCast: true };
  const pick = (re) => lib.take((s) => re.test(s.id));
  const planks = lib.ofKind('plank'), P = (i, tile = 1.2) => M(planks.length ? planks[i % planks.length] : 'ship_05_red_mahogany', tile);
  return {
    glass, lantern,
    timber: M('ship_01_tarblack_oak', 1.6), trim: M('ship_10_black_walnut_rift_seam', 1.2), iron: M('met_02_riveted_black_iron', 1),
    plinth: M('castle_keep_mossline_foundation_stone', 1.6), quoin: M('castle_keep_pale_keep_limestone', 1.2),
    chimney: M('town_wall_town_brick', 2.2), pot: M('castle_roof_terracotta', 0.8), ridge: M('castle_slate', 1.2),
    sill: M('castle_keep_weathered_gatehouse_flag', 1), box: P(3, 0.8), door: P(8, 1.4),
    shutters: [P(0), P(1), P(2), P(4), P(5), P(6), M('ship_03_violet_teak', 1.2), M('wood_05_violet_streak_blackwood', 1.2)],
    signs: [P(9, 0.8), P(10, 0.8), P(11, 0.8)],
    lining: M(pick(/^town_(oak_boards|cedar_boards|bleached_boards|barn_boards|repaired_planks|split_boards|workshop_planks|nailed_decking)$/), 2),
    ceiling: M('ship_02_salt_worn_oak', 2), rug: M(pick(/^cloth_/), 1.4),
    counter: P(7, 1.5), wheel: M('wood_01_end_grain_timber', 0.8), post: M('ship_09_mossed_shipboard', 1.2),
    rail: P(1, 1.6),
    perHouse: (i = 0) => ({ lining: i % 2 ? P(i, 2) : M(pick(/^town_(oak_boards|cedar_boards|bleached_boards|barn_boards|repaired_planks|split_boards|workshop_planks|nailed_decking|diagonal_parquet|lime_screed|coarse_mortar)$/), 2),
      rug: M(pick(/^(cloth_|met_07|gold_)/), 1.4) }),
  };
}

/** The cathedral's gothic dressing: plinth and string courses, stepped buttresses with
 * pinnacles, a corbel table under the eaves, pointed hood moulds over the windows, a deep
 * stepped portal, tracery in the rose window, a crested ridge with a cross on the gable, rib
 * arches over the nave and aisles, and candle chandeliers hanging in the nave. */
export function gothicDetail(ctx, C, { F, H, t, M, windowsAt, pillarsZ, rise, hoods = null, lancet = null, roseY = null }) {
  const { b } = ctx;
  const trim = M('castle_keep_pale_keep_limestone', 1.5), stone = M('castle_ashlar', 3), lead = M('met_01_hammered_gunmetal', 1);
  const iron = M('met_02_riveted_black_iron', 1), cap = M('castle_keep_rough_battlement_block', 1.5);
  const xo0 = C.x0 - t / 2, xo1 = C.x1 + t / 2, zo0 = C.z0 - t / 2, zo1 = C.z1 + t / 2;
  // plinth course, string course and eaves course (split round the west door)
  for (const [y0, y1, o] of [[0, F + 0.7, 0.22], [F + 3.15, F + 3.4, 0.14], [H - 0.35, H - 0.1, 0.2]]) {
    const solid = y0 === 0;
    b.box([xo0 - o, y0, zo0], [xo0, y1, zo1], trim, { solid });
    b.box([xo1, y0, zo0], [xo1 + o, y1, zo1], trim, { solid });
    b.box([xo0 - o, y0, zo0 - o], [xo1 + o, y1, zo0], trim, { solid });
    if (solid) { b.box([xo0 - o, y0, zo1], [-2.6, y1, zo1 + o], trim); b.box([2.6, y0, zo1], [xo1 + o, y1, zo1 + o], trim); }
    else if (y0 > F + 6) b.box([xo0 - o, y0, zo1], [xo1 + o, y1, zo1 + o], trim, { solid: false });
    else { b.box([xo0 - o, y0, zo1], [-3.4, y1, zo1 + o], trim, { solid: false }); b.box([3.4, y0, zo1], [xo1 + o, y1, zo1 + o], trim, { solid: false }); }
  }
  // buttresses between the windows and at the corners, each crowned by a pinnacle
  const len = C.z1 - C.z0;
  const butt = [0.6, len - 0.6, windowsAt[0] - (windowsAt[1] - windowsAt[0]) / 2];
  for (let i = 0; i + 1 < windowsAt.length; i++) butt.push((windowsAt[i] + windowsAt[i + 1]) / 2);
  for (const at of butt) for (const s of [-1, 1]) {
    const z = C.z0 + at, xw = s < 0 ? xo0 : xo1;
    const X = (d) => xw + s * d;
    const box = (d0, d1, y0, y1, hw, m, solid) => b.box([Math.min(X(d0), X(d1)), y0, z - hw], [Math.max(X(d0), X(d1)), y1, z + hw], m, { solid });
    box(0, 1.6, 0, F + 6.5, 0.5, stone, true);
    b.beam([X(1.6), F + 6.5, z], [X(0.95), F + 7.6, z], 0.95, 0.12, cap, { up: [0, 1, 0] });
    box(0, 0.95, F + 6.5, F + 11.6, 0.42, stone, false);
    b.beam([X(0.95), F + 11.6, z], [X(0), F + 12.6, z], 0.8, 0.12, cap, { up: [0, 1, 0] });
    box(0.15, 0.8, F + 11.6, F + 13.2, 0.3, trim, false);
    b.cone(X(0.48), z, 0.34, F + 13.2, 2.4, 4, lead);
    for (const dz of [-0.3, 0.3]) b.cone(X(0.48), z + dz, 0.09, F + 13.2, 0.6, 4, lead);
  }
  // corbel table under the eaves
  for (let z = C.z0 + 0.6; z < C.z1 - 0.4; z += 0.9) for (const s of [-1, 1]) {
    const xw = s < 0 ? xo0 : xo1;
    b.box([Math.min(xw, xw + s * 0.32), H - 0.75, z - 0.14], [Math.max(xw, xw + s * 0.32), H - 0.35, z + 0.14], trim, { solid: false });
  }
  // pointed hood moulds over the windows, outside and in
  for (const s of [-1, 1]) for (const at of (hoods ? hoods[s] : windowsAt)) for (const side of [1, -1]) {
    const z = C.z0 + at;
    const x = s < 0 ? (side > 0 ? xo0 - 0.06 : C.x0 + t / 2 + 0.06) : (side > 0 ? xo1 + 0.06 : C.x1 - t / 2 - 0.06);
    const y0 = lancet ? lancet.y0 : F + 3.5, y1 = lancet ? lancet.y1 : F + 9.5, hw = lancet ? lancet.w / 2 + 0.08 : 0.92;
    const peak = lancet ? 0.65 : 1.5; // kept low so the oculus above has room
    b.beam([x, y0 - 0.1, z - hw], [x, y1, z - hw], 0.14, 0.2, trim);
    b.beam([x, y0 - 0.1, z + hw], [x, y1, z + hw], 0.14, 0.2, trim);
    b.beam([x, y1, z - hw], [x, y1 + peak, z], 0.14, 0.2, trim);
    b.beam([x, y1, z + hw], [x, y1 + peak, z], 0.14, 0.2, trim);
    b.beam([x, y0 - 0.15, z - hw - 0.1], [x, y0 - 0.15, z + hw + 0.1], 0.3, 0.16, trim);
  }
  // the west portal: three receding orders of jambs and pointed arches round the door
  for (let k = 0; k < 3; k++) {
    const hw = 1.75 + k * 0.38, d = 0.32 * (3 - k), top = F + 5.3 + k * 0.25;
    for (const s of [-1, 1]) b.box([Math.min(s * hw, s * (hw + 0.36)), F, zo1], [Math.max(s * hw, s * (hw + 0.36)), top, zo1 + d], trim);
    for (const s of [-1, 1]) b.beam([s * (hw + 0.18), top, zo1 + d / 2], [0, top + 1.6 + k * 0.4, zo1 + d / 2], 0.36, d, trim, { up: [0, 0, 1] });
  }
  // the rose window's stone ring (its glass has its own tracery)
  const rc = [0, roseY ?? F + 9.5, zo1 + 0.08], R = 2.3;
  for (let i = 0; i < 20; i++) {
    const a0 = i / 20 * Math.PI * 2, a1 = (i + 1) / 20 * Math.PI * 2;
    b.beam([Math.cos(a0) * R, rc[1] + Math.sin(a0) * R, rc[2]], [Math.cos(a1) * R, rc[1] + Math.sin(a1) * R, rc[2]], 0.26, 0.2, trim, { up: [0, 0, 1] });
  }

  // a crested ridge, and a cross on the west gable
  const ry = H + rise;
  for (let z = C.z0 + 1; z < C.z1; z += 2.2) b.cone(0, z, 0.14, ry + 0.05, 0.55, 4, lead);
  b.beam([0, ry - 0.2, zo1 + 0.3], [0, ry + 2.4, zo1 + 0.3], 0.22, 0.22, trim);
  b.beam([-0.75, ry + 1.6, zo1 + 0.3], [0.75, ry + 1.6, zo1 + 0.3], 0.2, 0.2, trim);
  // rib arches inside: across the nave between the pillars and out over the aisles
  const rib = M('castle_keep_pale_keep_limestone', 1.2);
  for (const z of pillarsZ) {
    for (const s of [-1, 1]) {
      b.beam([s * 6, F + 10.2, z], [0, H + rise * 0.55, z], 0.32, 0.4, rib, { up: [0, 0, 1] });
      b.beam([s * 6, F + 10.2, z], [s * (C.x1 - t / 2 - 0.1), H - 1.2, z], 0.3, 0.36, rib, { up: [0, 0, 1] });
    }
  }
  // chandeliers down the nave: an iron ring of candles on a chain
  const wax = M('castle_keep_ivory_chapel_marble', 0.5);
  for (let i = 0; i + 1 < pillarsZ.length; i += 2) {
    const z = (pillarsZ[i] + pillarsZ[i + 1]) / 2, y = F + 7.2;
    b.beam([0, H + rise * 0.5, z], [0, y + 1.2, z], 0.04, 0.04, iron);
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + 0.4;
      b.beam([0, y + 1.2, z], [Math.cos(a) * 1.15, y + 0.02, z + Math.sin(a) * 1.15], 0.025, 0.025, iron);
    }
    for (let k = 0; k < 12; k++) {
      const a0 = k / 12 * Math.PI * 2, a1 = (k + 1) / 12 * Math.PI * 2;
      b.beam([Math.cos(a0) * 1.15, y, z + Math.sin(a0) * 1.15], [Math.cos(a1) * 1.15, y, z + Math.sin(a1) * 1.15], 0.07, 0.07, iron);
    }
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2;
      const cx = Math.cos(a) * 1.15, cz = z + Math.sin(a) * 1.15;
      b.cylinder([cx, y + 0.03, cz], [cx, y + 0.26, cz], 0.035, 5, wax);
      ctx.flames.push([cx, y + 0.3, cz, 0.1]);
    }
  }
}

/** The bell tower: a shaft with string courses, an open belfry on corner piers with louvres
 * and a bronze bell, battlements, corner pinnacles and a tall spire. */
export function belfry(ctx, tw, M, roof) {
  const { b } = ctx;
  const stone = M('stone_01_gray_limestone_1_01', 3.2), trim = M('castle_keep_pale_keep_limestone', 1.5), lead = M('met_01_hammered_gunmetal', 1);
  const bronze = M('met_04_tarnished_bronze', 0.6), wood = M('ship_01_tarblack_oak', 1), gilt = M('gold_01_beaten_antique_gold', 0.5);
  const { x0, x1, z0, z1 } = tw, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  b.box([x0, 0, z0], [x1, 20, z1], stone);
  for (const y of [7, 14, 19.6]) b.box([x0 - 0.2, y, z0 - 0.2], [x1 + 0.2, y + 0.4, z1 + 0.2], trim, { solid: false });
  for (const [px, pz] of [[x0, z0], [x1 - 1.3, z0], [x0, z1 - 1.3], [x1 - 1.3, z1 - 1.3]]) b.box([px, 20, pz], [px + 1.3, 26, pz + 1.3], stone, { solid: false });
  b.box([x0, 25.6, z0], [x1, 26.4, z1], trim, { solid: false });
  for (let y = 21; y < 25.4; y += 0.55) { // louvres in the openings
    b.beam([x0 + 1.3, y, z0 + 0.3], [x1 - 1.3, y + 0.18, z0 + 0.05], 0.06, 0.4, wood, { up: [0, 0, -1] });
    b.beam([x0 + 1.3, y, z1 - 0.3], [x1 - 1.3, y + 0.18, z1 - 0.05], 0.06, 0.4, wood, { up: [0, 0, 1] });
  }
  b.beam([x0 + 1.3, 25.0, cz], [x1 - 1.3, 25.0, cz], 0.3, 0.3, wood); // the bell on its headstock
  b.cylinder([cx, 24.85, cz], [cx, 23.3, cz], 0.42, 12, bronze, { r1: 0.95 });
  b.cylinder([cx, 23.3, cz], [cx, 23.1, cz], 0.95, 12, bronze, { r1: 1.02, caps: false });
  for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) { // battlements
    const l = Math.hypot(bx - ax, bz - az), n = Math.floor(l / 0.9);
    for (let i = 0; i < n; i += 2) {
      const a = i / n, c = (i + 1) / n;
      const p0 = [ax + (bx - ax) * a, az + (bz - az) * a], p1 = [ax + (bx - ax) * c, az + (bz - az) * c];
      b.box([Math.min(p0[0], p1[0]) - 0.15, 26.4, Math.min(p0[1], p1[1]) - 0.15], [Math.max(p0[0], p1[0]) + 0.15, 27.2, Math.max(p0[1], p1[1]) + 0.15], trim, { solid: false });
    }
  }
  for (const [px, pz] of [[x0 + 0.4, z0 + 0.4], [x1 - 0.4, z0 + 0.4], [x0 + 0.4, z1 - 0.4], [x1 - 0.4, z1 - 0.4]]) b.cone(px, pz, 0.42, 26.4, 3.2, 4, lead);
  b.cone(cx, cz, (x1 - x0) / 2 - 0.5, 26.4, 15, 8, roof);
  b.beam([cx, 41.2, cz], [cx, 43.2, cz], 0.12, 0.12, gilt);
  b.beam([cx - 0.5, 42.6, cz], [cx + 0.5, 42.6, cz], 0.1, 0.1, gilt);
}
