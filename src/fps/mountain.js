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
import { WEBGPU, T as TSL, sharpGrad, untiled, untileMask, snoise, keyed, ref, settled } from './nodes.js';

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
  const skirt = (17 + fbm(x * 0.02, z * 0.02) * 8) * (1 - gw) + GATE.h * gw;
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

// ------------------------------------------------------------------ the heightfield
export class Sorrowhorn {
  constructor() {
    this.road = makeRoad();
    this.camps = CAMPS.map(([want, name]) => {
      const i = Math.floor(this.road.length * want), [x, z, y] = this.road[i], dx = MOUNT.x - x, dz = MOUNT.z - z, L = Math.hypot(dx, dz);
      return { x, z, y: y + 1.2, ux: dx / L, uz: dz / L, road: i, name };
    });
    this.h = new Float32Array(NX * NZ);
    this.carve();
  }

  /** The grid's heights: the mountain, with the road's bench cut into it. */
  carve() {
    const R = this.road, cell = 32, buckets = new Map(), key = (i, k) => i * 100003 + k;
    for (let s = 0; s + 1 < R.length; s++) {
      const [ax, az] = R[s], [bx, bz] = R[s + 1];
      for (const [x, z] of [[ax, az], [bx, bz]]) for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) {
        const kk = key(Math.floor(x / cell) + di, Math.floor(z / cell) + dk);
        let l = buckets.get(kk); if (!l) buckets.set(kk, l = new Set()); l.add(s);
      }
    }
    this.buckets = buckets; this.cell = cell;
    // each camp's shelf: in from the road, as far as it must be to keep clear of it (the road can bend)
    for (const c of this.camps) {
      const [rx, rz] = this.road[c.road];
      for (let off = 17; off < 40; off += 1.5) { c.x = rx + c.ux * off; c.z = rz + c.uz * off; if ((this.roadAt(c.x, c.z)?.d ?? 99) > 13) break; }
    }
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
      const x = BOX.x0 + i * G, z = BOX.z0 + k * G;
      let h = natural(x, z);
      const r = this.roadAt(x, z);
      if (r) {
        const span = Math.min(18, Math.max(3, Math.abs(h - r.y) * 0.9));
        const w = 1 - smooth(ROAD_W, ROAD_W + span, r.d);
        h += (r.y - 0.15 - h) * w;
      }
      for (const c of this.camps) {
        const d = Math.hypot(x - c.x, z - c.z);
        if (d < 17) h += (c.y - h) * (1 - smooth(8.5, 17, d));
      }
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
      if (!best || d < best.d) best = { d, y: ay + (by - ay) * t, s: (s + t) / (this.road.length - 1) };
    }
    return best;
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
    const mat = mountainMaterial(ctx.lib), out = [], T = 32;   // (128 m tiles: few draws for the whole mountain)
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
    this.meshes = out;
    return out;
  }

  /** The road's gravel strip, laid on the carved bench (a ribbon of quads a hand above the ground). */
  buildRoad(ctx, mat) {
    const R = this.road, P = [], U = [], I = [];
    let along = 0;
    for (let s = 0; s < R.length; s++) {
      const [x, z] = R[s], [nx, nz] = s + 1 < R.length ? R[s + 1] : R[s], [px, pz] = s > 0 ? R[s - 1] : R[s];
      const dx = nx - px, dz = nz - pz, L = Math.hypot(dx, dz) || 1, ox = -dz / L, oz = dx / L, w = 1.9 + Math.sin(s * 0.37) * 0.15;
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
const LAYERS = [['ground_grass_05', 0xb8d0a0], ['rock_06_overworld_mossy_rock_1_03', 0xc8ccb8], ['ground_gravel_03', 0xc8c4be], ['rock_05_overworld_granite_1_02', 0xd6d2cc],
  ['rock_08_mountain_alpine_granite_3_01', 0xd4d8e0], ['ground_snow_06', 0xe6e8ee], ['cliff_07_coarse_gravel_11_01', 0xc4c0ba], ['ground_grass_05', 0xd8d49c]];
const BANDS = { meadow: 165, granite: 230, basalt: 340, snow: 400 };

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
      float rockW = max(smoothstep(0.3, 0.5, slope + (n2 - 0.5) * 0.14), vMR);
      vec3 c = vec3(0.0);
      if (rockW < 0.999) {   // the level ground: meadow, then scree and gravel, then old snow
        float hi = smoothstep(${BANDS.snow}.0, ${BANDS.snow + 70}.0, y);
        float sc = smoothstep(${BANDS.meadow - 25}.0, ${BANDS.meadow + 25}.0, y), sn = smoothstep(${BANDS.snow - 20}.0, ${BANDS.snow + 15}.0, y) * (1.0 - smoothstep(0.12 + 0.2 * hi, 0.26 + 0.24 * hi, slope));
        vec3 g = vec3(0.0);
        if (sc < 0.999) g = mix(mTex(mT0, gp, 1.8) * ${tint[0]}, mTex(mT1, gp, 3.0) * ${tint[1]}, smoothstep(0.55, 0.75, n2) * 0.7);
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
    const rockW = max(smoothstep(0.3, 0.5, slope.add(n2.sub(0.5).mul(0.14))), attribute('rocky', 'float')).toVar();
    const c = vec3(0.0).toVar();
    If(rockW.lessThan(0.999), () => {
      const sc = smoothstep(BANDS.meadow - 25, BANDS.meadow + 25, y).toVar();
      const hi = smoothstep(BANDS.snow, BANDS.snow + 70, y);
      const sn = smoothstep(BANDS.snow - 20, BANDS.snow + 15, y).mul(smoothstep(hi.mul(0.2).add(0.12), hi.mul(0.24).add(0.26), slope).oneMinus()).toVar();
      const g = vec3(0.0).toVar();
      If(sc.lessThan(0.999), () => { g.assign(mix(mTex(0, 1.8).mul(tint(tints[0])), mTex(1, 3.0).mul(tint(tints[1])), smoothstep(0.55, 0.75, n2).mul(0.7))); });
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
  S.meshes = S.buildMesh(ctx);
  S.roadMesh = S.buildRoad(ctx, M('ground_gravel_03', 1.6, { tint: 0xd0c8bc }));
  S.farLand = farLand(ctx, S);
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
      if (S.camps.some((c) => Math.hypot(x - c.x, z - c.z) < 70)) continue;   // (not under the goat men's noses)
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
    for (let k = 0; k < 4; k++) { const a = n + k * 1.57 + 0.4; P('hide_bedroll', c.x + Math.cos(a) * 3.4, c.z + Math.sin(a) * 3.4, 1, a + Math.PI / 2); }
    const ta = n * 2.1 + 0.9; P('hide_tent', c.x + Math.cos(ta) * 6.5, c.z + Math.sin(ta) * 6.5, 1.1, ta + Math.PI);
    P('gnawed_bones', c.x + Math.cos(ta + 2.2) * 5, c.z + Math.sin(ta + 2.2) * 5, 1);
    P('goat_weapon_cache', c.x + Math.cos(ta - 1.9) * 5.2, c.z + Math.sin(ta - 1.9) * 5.2, 1, ta);
    // the ram's skull on its stake, facing the road
    const [rx, rz] = S.road[c.road], sa = Math.atan2(rx - c.x, rz - c.z), sx = c.x + Math.sin(sa) * 8, sz = c.z + Math.cos(sa) * 8, sy = S.heightAt(sx, sz);
    const bone = M('castle_keep_ivory_chapel_marble', 0.5), pole = M('castle_keep_pale_keep_limestone', 0.6, { tint: 0x8a7458 });   // (a weathered stave, a bleached skull)
    b.place(sx, sy, sz, sa, 1, (o) => {
      o.box([-0.05, 0, -0.05], [0.05, 2.3, 0.05], pole);
      o.blob([0, 2.42, 0.05], [0.16, 0.2, 0.24], bone, { detail: 1, jitter: 0.06, seed: 50 + n });
      for (const s of [-1, 1]) {                            // the horns, curling back and out
        let px = s * 0.1, py = 2.55, pz = -0.02, r = 0.075;
        for (let k = 0; k < 6; k++) {
          const a = k * 0.62, nx = s * (0.14 + Math.sin(a) * 0.16) + px * 0.55, ny = py + Math.cos(a) * 0.12 - 0.02, nz = pz - 0.08 + k * 0.01;
          o.beam([px, py, pz], [nx, ny, nz], r, r * 0.82, bone);
          px = nx; py = ny; pz = nz; r *= 0.82;
        }
      }
    }, { solid: false });
    physics.add([sx - 0.12, sy - 0.2, sz - 0.12], [sx + 0.12, sy + 2.4, sz + 0.12], 'post');
  });

  // ---- what grows and lies on it: conifers in the foothills and up the lower flanks (thinning as
  // it climbs), boulders fallen from the crags (more higher up), grass and heather along the road.
  // Never on the road, never in the lookouts
  { let seed = 4242; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const offRoad = (x, z, pad) => { const r = S.roadAt(x, z); return !r || r.d > ROAD_W + pad; };
    const awayFromViews = (x, z) => !views.some((v) => Math.hypot(x - v.x, z - v.z) < 12) && !camps.some((c) => Math.hypot(x - c.x, z - c.z) < 15);
    const boulder = [rock, M('rock_02_cave_dark_basalt_1_05', 3, { tint: 0xb8b8c0, tri: true }), moss];
    let trees = 0, rocks = 0;
    for (let i = 0; i < 9000 && (trees < 520 || rocks < 260); i++) {
      const x = BOX.x0 + R() * (BOX.x1 - BOX.x0), z = BOX.z0 + R() * (BOX.z1 - BOX.z0), k = R(), sc = R();
      if (!S.covers(x, z) || Math.hypot(x, z) < GATE.r1 + 6) continue;
      const y = S.heightAt(x, z), sl = S.slopeAt(x, z);
      if (!offRoad(x, z, 2) || !awayFromViews(x, z)) continue;
      const treeChance = (1 - smooth(110, 230, y)) * (sl < 0.55 ? 1 : 0);
      if (trees < 520 && k < treeChance * 0.7 && ctx.trees3d) { ctx.trees3d.add(['pine', 'cedar', 'pine', 'redwood'][trees % 4], x, y - 0.2, z, 0.85 + sc * 0.5); trees++; continue; }
      if (rocks < 260 && k > 0.7 && sl < 0.8) {
        const s = 0.7 + sc * (y > 200 ? 2.6 : 1.6), m = boulder[rocks % 3];
        b.place(x, y - s * 0.3, z, sc * 6.28, 1, (o) => o.blob([0, s * 0.45, 0], [s * 1.2, s * 0.8, s], m, { detail: 2, jitter: 0.22, seed: 600 + rocks }), { solid: s > 1.1, tag: 'rock' });
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

  // where you may walk on the mountain, and what each part of it is called
  S.place = (p) => {
    if (!S.covers(p.x, p.z)) return null;
    const ro = Math.hypot(p.x, p.z);
    if (ro < GATE.r1 + 30 && Math.abs(bearingOf(p.x, p.z) - GATE.bearing) < 0.2) return GATE.name;
    for (const v of views) if (Math.hypot(p.x - v.x, p.z - v.z) < 12) return v.name;
    for (const c of camps) if (Math.hypot(p.x - c.x, p.z - c.z) < 16) return c.name;
    const d = Math.hypot(p.x - MOUNT.x, p.z - MOUNT.z);
    if (d > MOUNT.R) return 'The Foothills of the Sorrowhorn';
    if (p.y > SHOULDER - 10 && d < 200) return 'The Horn of the Sorrowhorn';
    const r = S.roadAt(p.x, p.z);
    if (r && r.d < 8) return "The Pilgrims' Road";
    return MOUNT.name;
  };
  return S;
}
