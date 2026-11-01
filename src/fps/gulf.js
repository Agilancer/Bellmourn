// The Mourning Gulf: the chasm an earthquake tore through the catacombs (docs/DUNGEON_BUILDING.md).
//
// Intent. Maker: the earth, long after the masons; the sexton strung a rope bridge over it to keep
// the way to the Founders open. Since: the dead who walked into it lie broken at its foot, and the
// galleries it cut through hang open in its walls. Job: spectacle, and a crossing that is a fight.
// First view: from the near landing, an alcove in the south wall, the bridge going out into the dark
// over a glowing stream twenty metres down. Exit: the far landing, lit, straight ahead. A fall costs
// health and the climb: the scree at the west end and a stair cut along the south wall lead back up
// to the near landing, in sight from the bridge.
//
// The rock is one surface: a signed distance field (the fissure, three alcoves cut into its walls,
// shelves and the cut ledge) roughened with noise and drawn by surface nets, so its walls are tall,
// smooth, overhanging and torn rather than blocks. Collision is the same shapes without the noise:
// columns of rock up to the floor at every half metre, walls where the rock stands.
import * as THREE from 'three';
import { TOUCH } from './input.js';
import { WEBGPU, T, keyed, ref } from './nodes.js';

/** The gulf's rock: torn strata on its walls (the layers the earthquake split, running level along
 * them), broken stone and grit underfoot, wrapped round the surface without stretching (triplanar),
 * warm grey-brown, darkened in its folds (the vertex shade). */
function strataMaterial(lib) {
  // (copies of the library's textures, filtered smoothly: natural rock, not pixel blocks)
  const own = (id) => { const t = lib.texture(lib.surf.get(id)?.file || `surfaces/${id}.png`).clone(); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
  const wallT = own('cave_dec_11'), floorT = own('cave_dec_03');
  const m = new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, specular: 0x141210, shininess: 10, side: THREE.FrontSide });
  m.userData = { tileU: 1, tileV: 1, noCast: true };   // (84k triangles: not drawn again into every torch's shadow cube)
  if (WEBGPU) { strataNodes(m, wallT, floorT); keyed(m, 'gulf-strata'); return m; }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tWall = { value: wallT }; sh.uniforms.tFloor = { value: floorT };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 gP; varying vec3 gN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\ngP = (modelMatrix * vec4(transformed, 1.0)).xyz; gN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 gP; varying vec3 gN; uniform sampler2D tWall; uniform sampler2D tFloor;')
      .replace('#include <map_fragment>', `
        vec3 nn = normalize(gN), tw = pow(abs(nn), vec3(5.0)); tw /= (tw.x + tw.y + tw.z);
        // two samples at scales that never line up (no banding), and a fine one close to (no smear)
        float near1 = 1.0 - smoothstep(4.0, 14.0, length(gP - cameraPosition));
        vec3 wx = mix(texture2D(tWall, vec2(gP.z, gP.y) / 4.0).rgb, texture2D(tWall, vec2(gP.z, gP.y) / 6.47 + 0.37).rgb, 0.5);
        vec3 wz = mix(texture2D(tWall, vec2(gP.x, gP.y) / 4.0).rgb, texture2D(tWall, vec2(gP.x, gP.y) / 6.47 + 0.37).rgb, 0.5);
        vec3 fy = mix(texture2D(tFloor, gP.xz / 2.6).rgb, texture2D(tFloor, gP.xz / 4.13 + 0.21).rgb, 0.5);
        vec3 fine = texture2D(tWall, vec2(gP.x + gP.z, gP.y) / 1.05).rgb;
        wx = mix(wx, wx * fine * 1.6, near1 * 0.5); wz = mix(wz, wz * fine * 1.6, near1 * 0.5);
        vec3 rk = wx * tw.x + fy * tw.y + wz * tw.z;
        vec3 tint = mix(vec3(0.60, 0.53, 0.46), vec3(0.46, 0.47, 0.45), smoothstep(-36.0, -14.0, gP.y));
        float wet = smoothstep(0.55, 0.95, nn.y) * (1.0 - smoothstep(-39.0, -34.0, gP.y));
        // the ledges catch what falls (grit, lichen): lighter and greener on top; under each bed, dark
        float up = smoothstep(0.35, 0.8, nn.y), dn = smoothstep(0.15, 0.75, -nn.y);
        vec3 lichen = mix(vec3(1.0), vec3(0.8, 0.93, 0.68), up * (1.0 - wet) * 0.7);
        // and the rift goes up into the dark: no roof to be seen over the rims
        float lost = 1.0 - 0.93 * smoothstep(-15.0, -6.5, gP.y);
        // (the beds alternate, harder and paler, softer and darker)
        lost *= 1.0 + 0.13 * (mod(floor(gP.y / 2.3 + 0.18 * sin(gP.y * 0.7) + 0.5), 2.0) * 2.0 - 1.0) * (1.0 - up);
        diffuseColor.rgb *= rk * tint * lichen * mix(1.25, 0.9, wet) * (1.0 + 0.5 * up) * (1.0 - 0.72 * dn) * lost;
        vec3 gRock = rk * tint;`)
      // the stream's and the fungus's cold glow off the lowest rock, so the terraces stand out
      // against it from the bridge
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += gRock * vec3(0.05, 0.13, 0.14) * (1.0 - smoothstep(-40.0, -29.0, gP.y)) * (0.4 + 0.6 * up);`);
  };
  m.customProgramCacheKey = () => 'gulf-strata';
  return m;
}

/** strataMaterial in TSL (WebGPU): the colour as above, and the low rock's cold glow from the same
 * rock (handed from the colour to the light by a shader property). */
function strataNodes(m, wallT, floorT) {
  const { Fn, texture, property, positionWorld, normalWorldGeometry, cameraPosition, vec2, vec3, vec4, pow, abs, normalize, length, smoothstep, mix, floor, sin, materialEmissive } = T;
  const tWall = texture(wallT), tFloor = texture(floorT);
  const gRock = property('vec3', 'gStrataRock'), gUp = property('float', 'gStrataUp');
  m.colorNode = Fn(() => {
    const gP = positionWorld.toVar();
    const nn = normalize(normalWorldGeometry).toVar(), tw0 = pow(abs(nn), vec3(5.0)), tw = tw0.div(tw0.x.add(tw0.y).add(tw0.z)).toVar();
    // two samples at scales that never line up (no banding), and a fine one close to (no smear)
    const near1 = smoothstep(4.0, 14.0, length(gP.sub(cameraPosition))).oneMinus();
    const zy = vec2(gP.z, gP.y), xy = vec2(gP.x, gP.y);
    const wx = mix(tWall.sample(zy.div(4.0)).rgb, tWall.sample(zy.div(6.47).add(0.37)).rgb, 0.5).toVar();
    const wz = mix(tWall.sample(xy.div(4.0)).rgb, tWall.sample(xy.div(6.47).add(0.37)).rgb, 0.5).toVar();
    const fy = mix(tFloor.sample(gP.xz.div(2.6)).rgb, tFloor.sample(gP.xz.div(4.13).add(0.21)).rgb, 0.5);
    const fine = tWall.sample(vec2(gP.x.add(gP.z), gP.y).div(1.05)).rgb.toVar();
    wx.assign(mix(wx, wx.mul(fine).mul(1.6), near1.mul(0.5))); wz.assign(mix(wz, wz.mul(fine).mul(1.6), near1.mul(0.5)));
    const rk = wx.mul(tw.x).add(fy.mul(tw.y)).add(wz.mul(tw.z)).toVar();
    const tint = mix(vec3(0.60, 0.53, 0.46), vec3(0.46, 0.47, 0.45), smoothstep(-36.0, -14.0, gP.y));
    const wet = smoothstep(0.55, 0.95, nn.y).mul(smoothstep(-39.0, -34.0, gP.y).oneMinus()).toVar();
    // the ledges catch what falls (grit, lichen): lighter and greener on top; under each bed, dark
    const up = smoothstep(0.35, 0.8, nn.y).toVar(), dn = smoothstep(0.15, 0.75, nn.y.negate());
    const lichen = mix(vec3(1.0), vec3(0.8, 0.93, 0.68), up.mul(wet.oneMinus()).mul(0.7));
    // and the rift goes up into the dark: no roof to be seen over the rims
    const lost = smoothstep(-15.0, -6.5, gP.y).mul(0.93).oneMinus().toVar();
    // (the beds alternate, harder and paler, softer and darker; GLSL's mod, floored)
    const bed = floor(gP.y.div(2.3).add(sin(gP.y.mul(0.7)).mul(0.18)).add(0.5));
    const alt = bed.sub(floor(bed.mul(0.5)).mul(2.0));
    lost.mulAssign(alt.mul(2.0).sub(1.0).mul(0.13).mul(up.oneMinus()).add(1.0));
    gRock.assign(rk.mul(tint)); gUp.assign(up);
    const c = rk.mul(tint).mul(lichen).mul(mix(1.25, 0.9, wet)).mul(up.mul(0.5).add(1.0)).mul(dn.mul(0.72).oneMinus()).mul(lost);
    return vec4(c.mul(ref('color', 'color')), 1.0);
  })();
  // the stream's and the fungus's cold glow off the lowest rock, so the terraces stand out against
  // it from the bridge
  m.emissiveNode = materialEmissive.add(gRock.mul(vec3(0.05, 0.13, 0.14)).mul(smoothstep(-40.0, -29.0, positionWorld.y).oneMinus()).mul(gUp.mul(0.6).add(0.4)));
}

// (a cell at a drop's lip used to come off the dead's map; it stays now, and the flow search
// (zombies.js) keeps to steps it can climb, so open-sided stairs and pits stay reachable)
const LIPS = false;
export const BY = -19;            // the landings and the bridge
export const GF = -40;            // the gulf's floor under the bridge
const ROOF = -4.5;
export const LEDGE = { x0: -38, x1: 6.5 };   // (it runs on under the near shelf's end, so there's no gap between them)   // the cut stair along the south wall, west end to the near shelf

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// cheap value noise (2D and 3D) over a hashed lattice
const PERM = (() => { const p = new Uint8Array(512); let s = 1234567; for (let i = 0; i < 256; i++) p[i] = i; for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 256; i++) p[i + 256] = p[i]; return p; })();
const h3 = (x, y, z) => PERM[(PERM[(PERM[x & 255] + y) & 255] + z) & 255] / 255;
function vn3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h3(ix, iy, iz), h3(ix + 1, iy, iz), u), l(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), u), v),
    l(l(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), u), l(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), u), v), w);
}
const fbm3 = (x, y, z) => vn3(x * 0.35, y * 0.22, z * 0.35) * 0.55 + vn3(x * 0.9 + 17, y * 0.7 + 3, z * 0.9) * 0.3 + vn3(x * 2.3 + 5, y * 2.3, z * 2.3 + 11) * 0.15 - 0.5;
const n2 = (x, z) => vn3(x * 0.25, 0.5, z * 0.25) - 0.5;

// the fissure's line, half width, and rims (south: +z, north: -z): torn, not drawn with compasses.
// Its line kinks, its width swells and pinches, and it narrows hard at its ends to a slot.
export const zc = (x) => -215.5 + 1.8 * Math.sin(x * 0.05 + 0.2) + 2.0 * Math.sin(x * 0.13 + 1.1) + 0.8 * Math.sin(x * 0.31);
export const hw = (x) => { const t = (x - 7) / 53; return Math.abs(t) >= 1 ? 0 : 18 * Math.sqrt(1 - t ** 4) * (1 + 0.09 * Math.sin(x * 0.17 + 2) + 0.06 * Math.sin(x * 0.43 + 0.5)); };
// bays and buttresses along each rim (quieter by the bridge, where its landings are)
const bay = (x, side) => (vn3(x * 0.07 + side * 40, 0.5, 3.1) - 0.5) * 4.4 * (0.35 + 0.65 * smooth(4, 14, Math.abs(x - 12)));
export const zs = (x) => zc(x) + hw(x) + bay(x, 0);
export const zn = (x) => zc(x) - hw(x) - bay(x, 1);
/** The fissure's walls batter out as they rise (a V, steepest at the rim), in terraces: a sheer
 * riser of rock four metres high, then a ledge a metre or two deep, six times up to the rims.
 * terraces(x, side): [riser (as a fraction q of the way from the fissure's line out to that rim),
 * the terrace's top] for each, wandering along the rift; along the cut stair (the south wall, west)
 * none stands above the stair, so the stair is the top of the terraces, in sight from the bridge. */
const NT = 6, TOP = 25, VA = 0.5, VP = 1.6;
const qOf = (Y) => VA + (1 - VA) * Math.pow(Math.max(0, Y) / TOP, 1 / VP);
function terraces(x, side) {
  // (each riser's height wanders along the rift, two metres to six; the risers wander in and out
  // on their own, so here a ledge pinches out and two risers stand as one sheer face)
  const out = new Float32Array(NT * 2), w = new Float32Array(NT);
  let sum = 0;
  for (let k = 0; k < NT; k++) { w[k] = 0.5 + vn3(x * 0.035 + k * 5.1, side * 3.3, k * 1.7) * 1.1; sum += w[k]; }
  let Y = 0;
  for (let k = 0; k < NT; k++) {
    const h = TOP * w[k] / sum;
    Y += h;
    let top = GF + Y + 0.5 * n2(x * 0.45 + k * 7.3, side * 5 + k);
    if (side > 0 && x > LEDGE.x0 - 3 && x < LEDGE.x1 + 3) top = Math.min(top, ledgeStep(Math.min(LEDGE.x1 - 0.01, Math.max(LEDGE.x0, x))) - 0.3);
    out[k * 2] = qOf(Y - h / 2) + 0.16 * n2(x * 0.11 + k * 3.1, side * 9 + 2);
    out[k * 2 + 1] = top;
  }
  // (and here and there a ledge is gone altogether, two risers standing as one sheer face 6 to 9 m
  // high: about one stretch in three)
  for (let k = NT - 2; k >= 0; k--) if (vn3(x * 0.045 + k * 9.7, side * 2.1 + 4, k) > 0.62) out[k * 2] = Math.max(out[k * 2], out[(k + 1) * 2]);
  return out;
}
/** Which side of the fissure's line (x, z) is on, that side's half width, and how far out it is. */
function across(x, z) {
  const c = zc(x), side = z > c ? 1 : -1, W = Math.max(1, side > 0 ? zs(x) - c : c - zn(x));
  return { side, W, q: Math.abs(z - c) / W };
}
/** The height of the terraced wall at (x, z), or -Infinity on the gulf's floor. */
export function wallY(x, z) {
  const { side, q } = across(x, z), T = terraces(x, side);
  let y = -Infinity;
  for (let k = 0; k < NT; k++) if (q >= T[k * 2]) y = Math.max(y, T[k * 2 + 1]);
  return y;
}
/** How far in from the rim the face of the terraces stands at height y (on that side, at x). */
export function faceInset(x, side, y) {
  const c = zc(x), W = Math.max(1, side > 0 ? zs(x) - c : c - zn(x)), T = terraces(x, side);
  let q = 1;
  for (let k = 0; k < NT; k++) if (T[k * 2 + 1] >= y) q = Math.min(q, T[k * 2]);
  return Math.max(0, (1 - q) * W);
}
// the bridge's line, and where the alcoves are
export const BX = 12;
export const NEAR_BACK = -190, FAR_BACK = Math.round(zn(BX) - 6);
const OVER = { x0: 27, x1: 35, y: -14 };
export const OVER_MOUTH = { x: 31, z: Math.round(zs(31) + 4.5), y: OVER.y };   // where the overlook's passage comes in
// [x, floor, side (-1 north wall, 1 south)]: the old galleries the gulf tore through, at all heights
export const STUBS = [[-20, -26.5, -1], [30, -24, -1], [0, -33, -1], [44, -15.5, 1], [24, -31, 1]];
export const stubMouth = (x, side) => (side < 0 ? zn(x) : zs(x));

/** The ledge's height along x: up from the top of the scree to the near shelf, in flights. */
export function ledgeY(x) {
  const t = smooth(LEDGE.x0, LEDGE.x1, x) * 0.15 + Math.min(1, Math.max(0, (x - LEDGE.x0) / (LEDGE.x1 - LEDGE.x0))) * 0.85;
  return floorY(LEDGE.x0) + (BY - 0.25 - floorY(LEDGE.x0)) * t;
}
/** The cut stair: exact quarter-metre treads from the top of the scree to a step under the near
 * shelf, each as long as the run allows. ledgeStep(x): the tread under x; LEDGE_N, LEDGE_RUN. */
const LEDGE_Y0 = Math.floor((GF + 8 * smooth(-8, -40, LEDGE.x0) - 0.3) / 0.25) * 0.25;   // (a little under the scree, so its first tread is a step up from it)   // (its foot, on the scree)
export const LEDGE_N = Math.round((BY - LEDGE_Y0) / 0.25) - 1;
export const LEDGE_RUN = (LEDGE.x1 - 1 - LEDGE.x0) / LEDGE_N;
export function ledgeStep(x) {
  const i = Math.max(0, Math.min(LEDGE_N - 1, Math.floor((x - LEDGE.x0) / LEDGE_RUN)));
  return LEDGE_Y0 + (i + 1) * 0.25;
}
/** The gulf's own floor (rising to the west into scree), before the ledge and the shelves. */
export function floorY(x, z = zc(x)) {
  let f = GF + 8 * smooth(-8, -40, x) + n2(x, z) * (x < -28 ? 0.45 : 1.2);   // (the scree smooth where the cut stair starts)
  const sc = zc(x) + 3 * Math.sin(x * 0.09), d = Math.abs(z - sc);         // the stream's bed
  if (d < 2.6 && x > -22) f -= 0.9 * (1 - (d / 2.6) ** 2);
  // the rockfalls: cones of fallen rock heaped against the foot of the walls
  for (const [cx, side, h, r] of CONES) {
    const dd = Math.hypot(x - cx, z - (zc(cx) + side * hw(cx) * 0.64));
    if (dd < r) f = Math.max(f, GF + h * Math.pow(1 - dd / r, 1.25) + n2(x * 2, z * 2) * 0.3);
  }
  return f;
}
const CONES = [[-6, 1, 3.6, 5], [27, -1, 3.2, 4.6], [41, 1, 2.8, 4.2]];   // [x, side, height, radius]

function polyD(poly, x, z) {       // signed distance to a convex polygon (negative inside)
  let inside = true, best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    if (dx * (z - az) - dz * (x - ax) < 0) inside = false;               // (wound so the inside is on the left)
  }
  return inside ? -best : best;
}
const ccw = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s > 0 ? p : [...p].reverse(); };

/** The void, as prisms: plan distance s(x, z), floor F, roof C. */
function features() {
  // (each alcove's front runs straight out past the most-forward point of the torn rim, so the rock
  // never stands between an alcove and its shelf)
  const rim = (f, x0, x1, pick) => { let v = f(x0); for (let x = x0; x <= x1; x += 0.5) v = pick(v, f(x)); return v; };
  const nf = rim(zs, 6, 18, Math.min) - 1.0, ff = rim(zn, 6, 18, Math.max) + 1.0, of = rim(zs, OVER.x0, OVER.x1, Math.min) - 0.8;
  const near = ccw([[6, nf], [18, nf], [16.5, NEAR_BACK], [7.5, NEAR_BACK]]);
  const far = ccw([[6, ff], [18, ff], [16.5, FAR_BACK], [7.5, FAR_BACK]]);
  const over = ccw([[OVER.x0, of], [OVER.x1, of], [OVER.x1 - 1, OVER_MOUTH.z], [OVER.x0 + 1, OVER_MOUTH.z]]);
  const box = (cx, cz, hx, hz) => (x, z) => Math.max(Math.abs(x - cx) - hx, Math.abs(z - cz) - hz);
  return [
    { tag: 'gulf', s: (x, z) => (hw(x) <= 0 ? 9 : Math.max(z - zs(x), zn(x) - z)), F: fissureFloor, Fs: fissureOpen, C: (x, z) => ROOF + n2(x + 40, z) * 3 - 5 * (1 - smooth(-40, -20, x)) - 3 * (1 - smooth(48, 60, -x + 108)) },
    { tag: 'near', s: (x, z) => polyD(near, x, z), F: () => BY, C: (x, z) => -10.5 + 1.5 * smooth(zs(x) + 4, zs(x) - 0.5, z) },
    { tag: 'far', s: (x, z) => polyD(far, x, z), F: () => BY, C: (x, z) => -11.5 + 1.5 * smooth(zn(x) - 4, zn(x) + 0.5, z) },
    { tag: 'over', s: (x, z) => polyD(over, x, z), F: () => OVER.y, C: () => -8.6 },
    // (each cut out through the terraces in front of it: a notch in the cliff, its floor the
    // gallery's, open to the gulf)
    ...STUBS.map(([sx, y, side]) => {
      const m = stubMouth(sx, side), z0 = m - side * (faceInset(sx, side, y + 0.3) + 0.8), z1 = m + side * 4.8;
      return { tag: 'stub', s: box(sx, (z0 + z1) / 2, 1.55, Math.abs(z1 - z0) / 2), F: () => y, C: () => y + 3.9 };
    }),
    // the passages' mouths: stubs out through the back walls to the edge of the field, a little
    // wider and taller than the masonry that lines them (so the rock stands just behind it)
    { tag: 'mouth', s: box(BX, (NEAR_BACK - 186) / 2 + 0.15, 2.85, (-186 - NEAR_BACK) / 2 + 0.45), F: () => BY, C: () => BY + 8.2 },
    { tag: 'mouth', s: box(BX, (FAR_BACK - 240) / 2 - 0.15, 2.55, (FAR_BACK + 240) / 2 + 0.45), F: () => BY, C: () => BY + 7 },
    { tag: 'mouth', s: box(OVER_MOUTH.x, (OVER_MOUTH.z - 186) / 2 + 0.15, 1.75, (-186 - OVER_MOUTH.z) / 2 + 0.45), F: () => OVER.y, C: () => OVER.y + 5.0 },
  ];
}

/** The fissure's floor without its terraces: the gulf's own, the cut ledge along the south wall,
 * the shelves that carry the bridge's ends and the overlook out over the edge. KIND says which it
 * found: 0 the gulf's own floor, 1 a shelf, the lip or the cut stair (walked on, no terraces over
 * it), 2 (fissureFloor) the top of a terrace. */
let KIND = 0;
function fissureOpen(x, z) {
  const s = zs(x), n = zn(x);
  const edge = n2(x * 3, 1) * 0.6 + n2(x * 0.7 + 9, 2) * 0.5;      // (the shelves' and the ledge's lips, ragged)
  KIND = 1;
  if (x >= 6 && x <= 18 && z > s - 1.4 + edge) return BY;                       // the near shelf
  if (x >= 6 && x <= 18 && z < n + 1.4 - edge) return BY;                       // the far shelf
  if (x >= OVER.x0 && x <= OVER.x1 && z > s - 1.6 + edge) return OVER.y;        // the overlook's lip
  if (x >= LEDGE.x0 && x <= LEDGE.x1 && z > s - 2.4 + edge) return ledgeStep(x);   // the ledge
  KIND = 0;
  return floorY(x, z);
}
/** The fissure's floor with its terraces (what stands under each column, for its collider). */
function fissureFloor(x, z) {
  const f = fissureOpen(x, z);
  if (KIND) return f;
  const w = wallY(x, z);
  if (w > f + 0.25) { KIND = 2; return Math.ceil(w * 2) / 2; }                   // (in half metres for their colliders)
  return f;
}

export class Gulf {
  constructor(ctx) {
    this.ctx = ctx;
    this.F = features();
    const X0 = this.X0 = -50, X1 = 64, Z0 = this.Z0 = -240, Z1 = -186;
    this.G = 0.5;
    this.nx = Math.round((X1 - X0) / this.G); this.nz = Math.round((Z1 - Z0) / this.G);
    this.columns();
  }

  /** Every half-metre column's open interval [floor, roof] (NaN in the rock), and its feature. */
  columns() {
    const { nx, nz, G, X0, Z0 } = this, N = nx * nz;
    this.fl = new Float32Array(N).fill(NaN); this.rf = new Float32Array(N); this.tag = new Int8Array(N).fill(-1);
    this.plain = new Uint8Array(N);     // the gulf's own floor (not a ledge, shelf or stub): no boxes, a height lookup
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const x = X0 + (i + 0.5) * G, z = Z0 + (k + 0.5) * G, j = k * nx + i;
      this.F.forEach((f, t) => {
        if (f.s(x, z) >= 0) return;
        const F = f.F(x, z), C = f.C(x, z);
        if (Number.isNaN(this.fl[j]) || F < this.fl[j]) { this.fl[j] = F; this.tag[j] = t; this.plain[j] = t === 0 && F === floorY(x, z) ? 1 : 0; }
        this.rf[j] = Math.max(this.rf[j] || -Infinity, C);
      });
    }
  }

  idx(x, z) { const i = Math.floor((x - this.X0) / this.G), k = Math.floor((z - this.Z0) / this.G); return i < 0 || k < 0 || i >= this.nx || k >= this.nz ? -1 : k * this.nx + i; }
  floorAt(x, z) { const j = this.idx(x, z); return j < 0 || Number.isNaN(this.fl[j]) ? null : this.fl[j]; }
  /** Which part of the gulf (x, z) is in: 'gulf' (the fissure), 'near', 'far', 'over', or null. */
  partAt(x, z) { const j = this.idx(x, z); return j < 0 || this.tag[j] < 0 ? null : this.F[this.tag[j]].tag; }

  /** The signed distance to the rock at a point (negative in the open), roughened. */
  sdf(x, y, z, cols) {
    // each void: inside its plan, over its floor, under its roof; the fissure's also clear of its
    // terraces (each a quarter-space of rock: out past its riser and under its top). Which term
    // won says whether this is a wall (rough, its beds weathered) or a floor or a roof.
    let d = Infinity, wall = false, fl = cols.lo;
    for (let t = 0; t < this.F.length; t++) {
      const c = cols[t];
      if (c.s > 3) continue;
      let m = c.F - y, w = false;
      if (y - c.C > m) m = y - c.C;
      if (c.s > m) { m = c.s; w = true; }
      if (t === 0 && cols.v) {
        const { q, W, T } = cols.v;
        let best = -Infinity, bw = false;
        for (let k = 0; k < NT; k++) { const a = (q - T[k * 2]) * W, h = T[k * 2 + 1] - y, v = a < h ? a : h; if (v > best) { best = v; bw = a < h; } }
        if (best > m) { m = best; w = bw; }
      }
      if (m < d) { d = m; wall = w; fl = c.F; }
    }
    if (d > 4) return d;
    const n = fbm3(x, y, z);
    // walls rough, roofs rougher, floors only a little (they are walked on)
    let r = d + n * (wall ? 0.7 : y < fl + 0.6 ? 0.25 : 0.85);
    // the soft beds weathered back between the hard ones, level along every wall (cut in, never
    // out, and not within a stride of a floor)
    if (wall && y > fl + 0.8) {
      const u = y / 2.3 + 0.18 * Math.sin(y * 0.7) + cols.warp, f = u - Math.floor(u);     // (beds 1.8 to 3.2 m apart)
      r -= 0.55 * smooth(fl + 0.8, fl + 2, y) * smooth(0, 0.1, f) * (1 - smooth(0.36, 0.5, f));
    }
    // and joints: upright cracks through the beds every eight metres or so
    if (wall && y > fl + 0.3) {
      const jf = x / 8.3 + 0.8 * vn3(x * 0.05, y * 0.03, z * 0.05), j = Math.abs(jf - Math.round(jf));
      if (j < 0.04) r -= 0.45 * (1 - j / 0.04) * smooth(fl + 0.3, fl + 1.2, y);
    }
    return r;
  }

  /** The rock's surface: sampled on a 0.6 m lattice over the gulf, drawn by surface nets. */
  build(b, skip) {
    const h = TOUCH ? 0.75 : 0.6, x0 = this.X0, z0 = this.Z0, y0 = -44, y1 = -1;
    const NX = Math.ceil((64 - x0) / h) + 1, NZ = Math.ceil((-186 - z0) / h) + 1, NY = Math.ceil((y1 - y0) / h) + 1;
    const V = new Float32Array(NX * NY * NZ).fill(9);
    const I = (i, j, k) => (k * NY + j) * NX + i;
    const cols = this.F.map(() => ({ s: 9, F: 0, C: 0 }));
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
      const x = x0 + i * h, z = z0 + k * h;
      let near = false, lo = Infinity, kind = -1;
      this.F.forEach((f, t) => {
        const s = f.s(x, z); cols[t].s = s;
        if (s >= 3) return;
        near = true; cols[t].F = (f.Fs || f.F)(x, z); cols[t].C = f.C(x, z); lo = Math.min(lo, cols[t].F);
        if (t === 0) kind = KIND;
      });
      if (!near) continue;
      cols.lo = lo;
      // (the terraces stand over the gulf's own floor, not over its shelves or its stair)
      if (kind === 0) { const a = across(x, z); cols.v = { q: a.q, W: a.W, T: terraces(x, a.side) }; } else cols.v = null;
      cols.warp = (vn3(x * 0.03, 0.7, z * 0.03) - 0.5) * 1.2;          // (the beds dip a little across the gulf)
      for (let j = 0; j < NY; j++) V[I(i, j, k)] = this.sdf(x, y0 + j * h, z, cols);
    }
    // surface nets: a vertex in every cell the surface passes through (the mean of its edge
    // crossings), a quad across every lattice edge it crosses
    const vid = new Int32Array(NX * NY * NZ).fill(-1), P = [];
    const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const v = new Float32Array(8);
    for (let k = 0; k + 1 < NZ; k++) for (let j = 0; j + 1 < NY; j++) for (let i = 0; i + 1 < NX; i++) {
      let neg = 0;
      for (let c = 0; c < 8; c++) { v[c] = V[I(i + corner[c][0], j + corner[c][1], k + corner[c][2])]; if (v[c] < 0) neg++; }
      if (neg === 0 || neg === 8) continue;
      let sx = 0, sy = 0, sz = 0, m = 0;
      for (const [a, c] of EDGES) {
        if ((v[a] < 0) === (v[c] < 0)) continue;
        const t = v[a] / (v[a] - v[c]);
        sx += corner[a][0] + (corner[c][0] - corner[a][0]) * t; sy += corner[a][1] + (corner[c][1] - corner[a][1]) * t; sz += corner[a][2] + (corner[c][2] - corner[a][2]) * t;
        m++;
      }
      vid[I(i, j, k)] = P.length / 3;
      P.push(x0 + (i + sx / m) * h, y0 + (j + sy / m) * h, z0 + (k + sz / m) * h);
    }
    // (each quad's corners in the plane across its edge, (u, w) in turn with the edge's axis a so
    // that u x w = a; wound to face the open side, so the normals point out of the rock)
    const tri = [];
    const quad = (c00, c10, c01, c11, open0) => {
      if (c00 < 0 || c10 < 0 || c01 < 0 || c11 < 0) return;
      if (open0) tri.push(c00, c11, c10, c00, c01, c11); else tri.push(c00, c10, c11, c00, c11, c01);
    };
    for (let k = 1; k + 1 < NZ; k++) for (let j = 1; j + 1 < NY; j++) for (let i = 1; i + 1 < NX; i++) {
      const s0 = V[I(i, j, k)] < 0;
      if (s0 !== (V[I(i + 1, j, k)] < 0)) quad(vid[I(i, j - 1, k - 1)], vid[I(i, j, k - 1)], vid[I(i, j - 1, k)], vid[I(i, j, k)], s0);   // a = x: (y, z)
      if (s0 !== (V[I(i, j + 1, k)] < 0)) quad(vid[I(i - 1, j, k - 1)], vid[I(i - 1, j, k)], vid[I(i, j, k - 1)], vid[I(i, j, k)], s0);   // a = y: (z, x)
      if (s0 !== (V[I(i, j, k + 1)] < 0)) quad(vid[I(i - 1, j - 1, k)], vid[I(i, j - 1, k)], vid[I(i - 1, j, k)], vid[I(i, j, k)], s0);   // a = z: (x, y)
    }
    // shade: darker in the folds and toward the depths (how open it is a metre out along the gradient)
    const nv = P.length / 3, shade = new Float32Array(nv);
    this.glowSpots = [];
    const at = (x, y, z) => {
      const i = Math.max(0, Math.min(NX - 2, (x - x0) / h)), j = Math.max(0, Math.min(NY - 2, (y - y0) / h)), k = Math.max(0, Math.min(NZ - 2, (z - z0) / h));
      return V[I(Math.round(i), Math.round(j), Math.round(k))];
    };
    for (let q = 0; q < nv; q++) {
      const x = P[q * 3], y = P[q * 3 + 1], z = P[q * 3 + 2], e = h;
      let gx = at(x + e, y, z) - at(x - e, y, z), gy = at(x, y + e, z) - at(x, y - e, z), gz = at(x, y, z + e) - at(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
      const open = Math.min(1, Math.max(0, -at(x - gx * 1.4, y - gy * 1.4, z - gz * 1.4) / 1.4));
      shade[q] = (0.32 + 0.68 * open) * (0.72 + 0.28 * smooth(GF, BY + 6, y));
      // where the glowing fungus grows: low on the walls, out of the wet, in the open
      const sc = zc(x) + 3 * Math.sin(x * 0.09), bank = Math.abs(z - sc) < 5.5 && y < GF + 3;
      // (on the walls and the stream's banks, never strewn on the open floor)
      if (q % 5 === 0 && open > 0.5 && (bank ? -gy < 0.92 : y < -31 && -gy < 0.72) && vn3(x * 0.11 + 7, y * 0.11, z * 0.11) > (bank ? 0.5 : 0.6)) this.glowSpots.push([x, y, z, -gx, -gy, -gz]);
    }
    // (one knot of them every few metres at most, so each reads as a cluster from the bridge)
    { const seen = new Set(), keep = [];
      for (const s of this.glowSpots) { const k = Math.floor(s[0] / 3.5) + ',' + Math.floor(s[1] / 3.5) + ',' + Math.floor(s[2] / 3.5); if (!seen.has(k)) { seen.add(k); keep.push(s); } }
      this.glowSpots = keep; }
    // cut into 16 m slabs east-west so each can be culled on its own
    const mat = this.mat = strataMaterial(this.ctx.lib);
    const slabs = new Map();
    for (let t = 0; t < tri.length; t += 3) {
      const a = tri[t], c = tri[t + 1], d = tri[t + 2];
      const cx = (P[a * 3] + P[c * 3] + P[d * 3]) / 3, cz = (P[a * 3 + 2] + P[c * 3 + 2] + P[d * 3 + 2]) / 3;
      if (skip?.(cx, cz, (P[a * 3 + 1] + P[c * 3 + 1] + P[d * 3 + 1]) / 3)) continue;      // (an opening an arch frames)
      const key = Math.floor(cx / 16) + ',' + Math.floor(cz / 26);
      if (!slabs.has(key)) slabs.set(key, []);
      slabs.get(key).push(a, c, d);
    }
    let tris = 0;
    for (const list of slabs.values()) {
      const map = new Map(), PP = [], SS = [], II = [];
      for (const q of list) {
        if (!map.has(q)) { map.set(q, PP.length / 3); PP.push(P[q * 3], P[q * 3 + 1], P[q * 3 + 2]); SS.push(shade[q]); }
        II.push(map.get(q));
      }
      b.smooth(mat, PP, new Array(PP.length / 3 * 2).fill(0), II, SS);
      tris += II.length / 3;
    }
    this.tris = tris;
  }

  /** Collision: the rock under every open column up to its floor, and the rock round the void as
   * walls (merged into runs). `taken(x, z)`: cells the masonry owns (the passages into it). */
  colliders(phys, taken) {
    const { nx, nz, G, X0, Z0, fl } = this, X = (i) => X0 + i * G, Z = (k) => Z0 + k * G;
    const open = (j) => !Number.isNaN(fl[j]);
    // the rock near the void (within 1.5 m) stands as wall; further in nothing is needed
    const near = new Uint8Array(nx * nz);
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      if (!open(k * nx + i)) continue;
      for (let dk = -3; dk <= 3; dk++) for (let di = -3; di <= 3; di++) { const a = i + di, c = k + dk; if (a >= 0 && c >= 0 && a < nx && c < nz) near[c * nx + a] = 1; }
    }
    const topOf = (i, k) => { const j = k * nx + i; if (open(j)) return this.plain[j] ? null : fl[j]; return near[j] && !taken(X(i) + G / 2, Z(k) + G / 2) ? -1 : null; };
    let live = new Map(), n = 0;
    const emit = (key, r, k1) => { const [i0, i1] = key.split(',').map(Number); phys.add([X(i0), -46, Z(r.k0)], [X(i1 + 1), r.top, Z(k1 + 1)], 'cave'); n++; };
    for (let k = 0; k <= nz; k++) {
      const runs = new Map();
      for (let i = 0; k < nz && i < nx;) {
        const t = topOf(i, k);
        if (t === null) { i++; continue; }
        let e = i + 1;
        while (e < nx && topOf(e, k) === t) e++;
        runs.set(`${i},${e - 1}`, t);
        i = e;
      }
      const next = new Map();
      for (const [key, t] of runs) { const r = live.get(key); if (r && r.top === t) { next.set(key, r); live.delete(key); } else next.set(key, { k0: k, top: t }); }
      for (const [key, r] of live) emit(key, r, k - 1);
      live = next;
    }
    this.boxes = n;
    // the plain floor: asked of directly (physics.dynamic), the cell under the foot
    const self = this;
    phys.dynamic.push({ x0: X0, z0: Z0, x1: X0 + nx * G, z1: Z0 + nz * G, floorAt(x, z, y) {
      const j = self.idx(x, z);
      if (j < 0 || !self.plain[j]) return -Infinity;
      return fl[j] <= y + 0.6 ? fl[j] : -Infinity;
    } });
  }

  /** Glowing fungus in clusters on the lower walls: what lets you see how deep the gulf goes. */
  fungus(scene) {
    // (a flat cap on a short stalk, 30 faces: there are thousands)
    const geo = new THREE.LatheGeometry([[0.016, 0], [0.016, 0.05], [0.075, 0.056], [0, 0.084]].map(([r, h]) => new THREE.Vector2(r, h)), TOUCH ? 4 : 5);
    const spots = this.glowSpots, per = TOUCH ? 7 : 13, M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), wn = new THREE.Vector3();
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), spots.length * per);
    const col = new THREE.Color();
    let i = 0, seed = 7;
    const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const [x, y, z, nx, ny, nz] of spots) {
      n.set(nx, ny + 0.9, nz).normalize(); q.setFromUnitVectors(up, n);     // (out of the rock, turning up to the light)
      // (spread over the rock's face round the spot, the big ones in the middle)
      wn.set(nx, ny, nz).normalize(); t1.crossVectors(wn, Math.abs(wn.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize(); t2.crossVectors(wn, t1);
      const hue = R() < 0.7 ? [0.08, 0.5, 0.48] : [0.2, 0.55, 0.26];
      for (let k = 0; k < per; k++) {
        const a = (R() - 0.5) * 0.7, c = (R() - 0.5) * 0.7, mid = 1 - Math.min(1, Math.hypot(a, c) / 0.45), s = 0.5 + R() * 0.5 + mid * 0.7;
        M.compose(new THREE.Vector3(x + t1.x * a + t2.x * c - wn.x * 0.03, y + t1.y * a + t2.y * c - wn.y * 0.03, z + t1.z * a + t2.z * c - wn.z * 0.03), q, new THREE.Vector3(s, s * 0.8, s));
        mesh.setMatrixAt(i, M); mesh.setColorAt(i, col.setRGB(hue[0], hue[1] * (0.7 + R() * 0.5), hue[2] * (0.7 + R() * 0.5)));
        i++;
      }
    }
    mesh.count = i;
    scene.add(mesh);
    return mesh;
  }

  /** The sheared galleries: what's left of each passage the gulf cut through, a floor, two walls and
   * a barrel vault running into the rock, broken off ragged at the cliff, its fallen stones below. */
  stubs(b, mat, props) {
    for (const [sx, y, side] of STUBS) {
      const m = stubMouth(sx, side), z0 = m - side * 0.8, z1 = m + side * 4.6, r = 1.4, sp = 2.2;
      const zz = (t) => z0 + (z1 - z0) * t;
      b.box([sx - 1.5, y - 0.35, Math.min(z0, z1)], [sx + 1.5, y, Math.max(z0, z1)], mat.floor, { solid: false, shade: 0.85 });
      for (const wx of [-1.42, 1.42]) b.box([sx + wx - 0.08, y, Math.min(z0 + side * 0.6, z1)], [sx + wx + 0.08, y + sp, Math.max(z0 + side * 0.6, z1)], mat.wall, { solid: false, shade: 0.8 });
      const P = [], U = [], N = 10;
      for (let k = 0; k < N; k++) {
        const a0 = Math.PI * k / N, a1 = Math.PI * (k + 1) / N, p = (a, t) => [sx + Math.cos(a) * r, y + sp + Math.sin(a) * r, zz(t)];
        const t0 = 0.12 + 0.18 * Math.abs(Math.sin(k * 2.3 + sx));    // (broken off raggedly)
        const A = p(a0, t0), B = p(a1, t0), C = p(a1, 1), D = p(a0, 1);
        P.push(...A, ...C, ...B, ...A, ...D, ...C);
        U.push(a0 * r, 0, a1 * r, 4.6, a1 * r, 0, a0 * r, 0, a0 * r, 4.6, a1 * r, 4.6);
      }
      b.raw(mat.roof, P, U, 0.7);
      // the gallery's stones fallen below (its brazier at the broken end: catacombs.js)
      void props;
      for (let k = 0; k < 6; k++) {
        const fx = sx + Math.sin(k * 1.7 + sx) * 2.2, fz = m - side * (2 + (k % 3) * 1.4), fy = this.floorAt(fx, fz);
        if (fy == null || fy > y - 2) continue;
        const s2 = 0.35 + (k % 3) * 0.15;
        b.box([fx - s2, fy, fz - s2 * 0.7], [fx + s2, fy + s2 * 0.9, fz + s2 * 0.7], mat.wall, { solid: false, shade: 0.7 });
      }
    }
  }

  /** The stream along the floor (lit from within), and its bed. */
  stream(b) {
    const m = new THREE.MeshPhongMaterial({ color: 0x010304, emissive: 0x021a1e, specular: 0x9ae8f0, shininess: 140 });
    m.userData = { tileU: 1, tileV: 1, noCast: true };
    const P = [], U = [];
    for (let x = -21; x < 52; x += 1) {
      const pts = [x, x + 1].map((xx) => { const c = zc(xx) + 3 * Math.sin(xx * 0.09); return [xx, c]; });
      const y = (xx) => Math.min(floorY(xx, zc(xx) + 3 * Math.sin(xx * 0.09)) + 0.45, GF - 0.55);
      const w = (xx) => 1.4 * (0.6 + 0.75 * vn3(xx * 0.15, 3.3, 1.1));           // (it widens into pools and narrows over the rock)
      const w0 = w(pts[0][0]), w1 = w(pts[1][0]);
      const a = [pts[0][0], y(pts[0][0]), pts[0][1] - w0], bb = [pts[1][0], y(pts[1][0]), pts[1][1] - w1], c = [pts[1][0], y(pts[1][0]), pts[1][1] + w1], d = [pts[0][0], y(pts[0][0]), pts[0][1] + w0];
      P.push(...a, ...c, ...bb, ...a, ...d, ...c);
      U.push(0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1);
    }
    b.raw(m, P, U, 1);
    return m;
  }

  /** The gulf's own walkable grid (its floor, the scree and the ledge), for the dead who fall in. */
  nav() {
    const x0 = this.X0, z0 = this.Z0, W = Math.floor(this.nx * this.G), D = Math.floor(this.nz * this.G);
    const cell = new Int16Array(W * D).fill(-1), h = new Float32Array(W * D).fill(NaN);
    for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
      const x = x0 + i + 0.5, z = z0 + k + 0.5, j = this.idx(x, z);
      if (j < 0 || this.tag[j] !== 0) continue;
      const f = this.fl[j];
      if (f < BY - 0.1) { cell[k * W + i] = 0; h[k * W + i] = f; }
    }
    // (a cell standing more than a stride over its neighbour is a lip: off the map, so the terraces
    // are islands and the dead go round by the scree and the cut stair, not at the cliff under you)
    for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
      const c = k * W + i;
      if (cell[c] < 0) continue;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = k + dk;
        if (a < 0 || b < 0 || a >= W || b >= D) continue;
        const o = b * W + a;
        if (cell[o] >= 0 && h[c] - h[o] > 0.65 && LIPS) { cell[c] = -2; break; }
      }
    }
    for (let c = 0; c < cell.length; c++) if (cell[c] === -2) cell[c] = -1;
    return { x0, z0, nx: W, nz: D, cell, h };
  }
}
