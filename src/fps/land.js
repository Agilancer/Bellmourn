// The land: Bellmourn's whole world, ten times what it was. The village and its forest still sit
// flat in the middle (r < 300) and the Green Downs keep their own hills, cliff, falls and stream
// (terrain.js); round them lie seven more countries, each with its own ground and lie of the land:
//
//   north      The Weeping Fen      black water, reeds and willows, a drowned hamlet
//   north-east The Rustwood         an autumn forest on the high ground above the cliff, a ruined abbey
//   west       The Ashen Waste      bone-dry mesas and canyons, thornspires, a ruined caravanserai
//   south-west The Barrow Moor      heather, barrow mounds and standing stones
//   south      The Rimeholt Fells   snowfields climbing to mountains, a frozen watch-fort
//   south-east The Gallowswood      dead and twisted trees, the hanged men's crossroads
//   north-west The Deepwood         the Darkwood going on, older and darker
//
// One height grid (3 m) is worked out once and drives both the ground mesh and the physics. The
// ground is one material: a baked map says which of the repainted ground tiles lies in each 3 m
// cell (and its neighbour), and the shader dithers between them with the packs' own noise, wraps
// rock round anything steep, and dusts the cold country with snow.
import * as THREE from 'three';
import { REGION, POOL, STREAM, terrainHeight as downsHeight, streamAt } from './terrain.js';
import { WEBGPU, T, keyed, ref, settled } from './nodes.js';

export const WORLD = { x0: -1150, x1: 1250, z0: -1200, z1: 1200 };
export const CORE_R = 300;   // the village clearing and the Darkwood: flat ground (y = 0)
const STEP = 3;              // the height grid
const NX = Math.round((WORLD.x1 - WORLD.x0) / STEP) + 1, NZ = Math.round((WORLD.z1 - WORLD.z0) / STEP) + 1;
export const LAYERS = ['meadow', 'forest', 'deadgrass', 'mud', 'desert', 'snow', 'ash', 'heather', 'marsh', 'gravesoil', 'gravel', 'cliff', 'cobble', 'rust'];
const L = Object.fromEntries(LAYERS.map((n, i) => [n, i]));

export const BIOMES = {
  core: { name: 'The Darkwood', ground: [['forest', 0.55], ['deadgrass', 0.25], ['mud', 0.2]] },
  downs: { name: 'The Green Downs', ground: [['meadow', 0.6], ['deadgrass', 0.25], ['heather', 0.15]] },
  deepwood: { name: 'The Deepwood', c: [[-560, -620], [-420, -360]], ground: [['forest', 0.65], ['mud', 0.2], ['rust', 0.15]] },
  fen: { name: 'The Weeping Fen', c: [[-40, -760], [260, -600], [-200, -1000]], ground: [['marsh', 0.5], ['mud', 0.3], ['deadgrass', 0.2]] },
  rustwood: { name: 'The Rustwood', c: [[820, -640], [1080, -260], [620, -1000]], ground: [['rust', 0.6], ['forest', 0.3], ['deadgrass', 0.1]] },
  ashen: { name: 'The Ashen Waste', c: [[-830, -160], [-860, -900], [-700, 250]], ground: [['desert', 0.6], ['ash', 0.3], ['gravel', 0.1]] },
  barrow: { name: 'The Barrow Moor', c: [[-700, 700], [-420, 980]], ground: [['deadgrass', 0.5], ['heather', 0.35], ['mud', 0.15]] },
  rimeholt: { name: 'The Rimeholt Fells', c: [[150, 860], [-160, 720], [420, 1040]], ground: [['snow', 0.8], ['gravel', 0.2]] },
  gallows: { name: 'The Gallowswood', c: [[920, 720], [1080, 360], [700, 1020]], ground: [['ash', 0.45], ['forest', 0.35], ['gravesoil', 0.2]] },
};
const OUTER = Object.entries(BIOMES).filter(([, b]) => b.c);

// ------------------------------------------------------------------ noise
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, z) => vnoise(x, z) * 0.55 + vnoise(x * 2.03 + 5.2, z * 2.03 + 1.3) * 0.28 + vnoise(x * 4.1 + 9.7, z * 4.1 + 3.1) * 0.17;
const ridged = (x, z) => { const n = 1 - Math.abs(fbm(x, z) * 2 - 1); return n * n; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How far (x, z) is inside the Green Downs' box (0 outside its 60 m margin, 1 within it). */
function downsWeight(x, z) {
  const dx = Math.max(REGION.x0 - x, x - REGION.x1, 0), dz = Math.max(REGION.z0 - z, z - REGION.z1, 0);
  return 1 - smooth(0, 60, Math.hypot(dx, dz));
}

/** The weights of the outer countries at (x, z) (warped nearest-centre, softened). */
export function biomeWeights(x, z) {
  const wx = x + (fbm(x * 0.004, z * 0.004) - 0.5) * 260, wz = z + (fbm(x * 0.004 + 17, z * 0.004 + 9) - 0.5) * 260;
  const ds = OUTER.map(([k, b]) => [k, Math.min(...b.c.map(([cx, cz]) => Math.hypot(wx - cx, wz - cz)))]);
  const dmin = Math.min(...ds.map((d) => d[1]));
  const out = {};
  let tot = 0;
  for (const [k, d] of ds) { const w = Math.exp(-(d - dmin) / 45); out[k] = w; tot += w; }
  for (const k in out) out[k] /= tot;
  return out;
}

/** The country at (x, z): 'core', 'downs' or one of the outer ones. */
export function biomeAt(x, z) {
  if (Math.hypot(x, z) < CORE_R + 30 || (x > 100 && x < REGION.x0 && Math.abs(z) < 12)) return 'core';
  if (downsWeight(x, z) > 0.5) return 'downs';
  const w = biomeWeights(x, z);
  return Object.keys(w).reduce((a, b) => (w[a] > w[b] ? a : b));
}

const HEIGHT = {
  deepwood: (x, z) => (fbm(x * 0.008, z * 0.008) - 0.5) * 14 + 2,
  fen: (x, z) => (fbm(x * 0.011, z * 0.011) - 0.45) * 3.2 - 0.55 - smooth(0.52, 0.68, fbm(x * 0.02 + 40, z * 0.02)) * 2.0,
  rustwood: (x, z) => 26 * smooth(480, 780, x) + 10 * smooth(-300, -700, z) * smooth(300, 700, x) + (fbm(x * 0.009, z * 0.009) - 0.5) * 18,
  ashen: (x, z) => { const b = (fbm(x * 0.0055, z * 0.0055) - 0.38) * 46; const t = Math.round(b / 6) * 6; return Math.max(-2, t + (b - t) * 0.25 + (fbm(x * 0.05, z * 0.05) - 0.5) * 1.2); },
  barrow: (x, z) => (fbm(x * 0.007, z * 0.007) - 0.45) * 16 + (fbm(x * 0.03, z * 0.03) - 0.5) * 2.5,
  rimeholt: (x, z) => 6 + ridged(x * 0.0045, z * 0.0045) * 70 * smooth(420, 1100, z) + (fbm(x * 0.01, z * 0.01) - 0.5) * 10 * smooth(320, 500, z),
  gallows: (x, z) => (fbm(x * 0.008, z * 0.008) - 0.42) * 26 + 4,
};

const pads = []; // { x, z, r, y }: ground levelled for buildings out in the new countries

/** The world's natural height at (x, z), before building pads. */
function natural(x, z) {
  const r = Math.hypot(x, z);
  const dw = downsWeight(x, z);
  if (r < CORE_R && dw <= 0) return 0;
  const w = biomeWeights(x, z);
  let h = 0;
  for (const k in w) if (w[k] > 0.002) h += w[k] * HEIGHT[k](x, z);
  h *= smooth(CORE_R - 10, CORE_R + 110, r); // the Darkwood's floor runs on out level, then rises
  // the trail east stays level all the way to the downs
  h *= 1 - (1 - smooth(10, 40, Math.abs(z))) * (1 - smooth(REGION.x0 - 10, REGION.x0 + 30, x)) * (x > 0 ? 1 : 0);
  // the world's rim: mountains
  const edge = Math.min(x - WORLD.x0, WORLD.x1 - x, z - WORLD.z0, WORLD.z1 - z);
  h += (1 - smooth(0, 170, edge)) * (55 + 40 * fbm(x * 0.01, z * 0.01));
  if (dw > 0) h = h + (downsHeight(x, z) - h) * dw;
  return h;
}

function padded(x, z) {
  let h = natural(x, z);
  for (const p of pads) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 12) h = h + (p.y - h) * (1 - smooth(p.r, p.r + 12, d)); }
  return h;
}

/** Level ground for something built at (x, z), radius r (outside the downs; inside them use
 * terrain.js addPad). Returns the floor height. */
export function flatten(x, z, r, y = null) {
  const h = y ?? natural(x, z);
  pads.push({ x, z, r, y: h });
  return h;
}

let grid = null;
/** The ground height anywhere in the world (bilinear on the 3 m grid once it's built). */
export function worldHeight(x, z) {
  if (!grid) return padded(x, z);
  const fx = (x - WORLD.x0) / STEP, fz = (z - WORLD.z0) / STEP;
  const i = Math.max(0, Math.min(NX - 2, Math.floor(fx))), k = Math.max(0, Math.min(NZ - 2, Math.floor(fz)));
  const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - k));
  const a = grid[k * NX + i], b = grid[k * NX + i + 1], c = grid[(k + 1) * NX + i], d = grid[(k + 1) * NX + i + 1];
  // the two triangles the mesh draws, so you stand exactly on what you see
  return u + v < 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

/** Land.groundMaterial's colour in TSL (WebGPU): no ground in the holes, the tile of the cell under a
 * jittered point, rock round anything steep, snow on the gentler slopes, then snapped back onto the
 * palette. One graph for the one land (its textures are its own). */
function landNode({ arr, map, rect, kitU, holes }) {
  const { Fn, If, Discard, texture, uniform, uniformArray, positionWorld, normalGeometry, vec2, vec3, vec4, float, int, floor, step, mix, pow, abs, max, clamp, dot, normalize } = T;
  const gArr = texture(arr), gMap = texture(map), gRect = uniform(rect), G = kitU.kGrime, lut = kitU.kLut;
  const boxN = uniformArray(holes.box.value, 'vec4').setGroup(T.renderGroup), topN = uniformArray(holes.top.value, 'float').setGroup(T.renderGroup), n = holes.n;
  const gTex = (layer, p) => gArr.sample(p.div(3.0)).depth(int(layer.add(0.5))).rgb;
  const gSnap = (c) => {
    const s = clamp(pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)), 0.0, 1.0).mul(31.0).add(0.5);
    const uv = vec2(floor(s.b).mul(32.0).add(floor(s.r)).add(0.5).div(1024.0), floor(s.g).add(0.5).div(32.0));
    return pow(lut.sample(uv).rgb, vec3(2.2));
  };
  return Fn(() => {
    const gP = positionWorld.toVar();
    for (let i = 0; i < 8; i++) {   // cave mouths and the like: no ground here (below their top)
      const hb = boxN.element(i);
      If(n.greaterThan(i).and(gP.x.greaterThan(hb.x)).and(gP.x.lessThan(hb.z)).and(gP.z.greaterThan(hb.y)).and(gP.z.lessThan(hb.w)).and(gP.y.lessThan(topN.element(i))), () => { Discard(); });
    }
    const gp = gP.xz;
    const nz = G.sample(gp.mul(0.21)).toVar(), nz2 = G.sample(gp.mul(0.047).add(0.3)).toVar();
    // which tile: the cell under a jittered point, so the borders come out ragged
    const j = vec2(nz.r, nz2.g).sub(0.5).mul(4.0);
    const cell = gMap.sample(gp.add(j).sub(gRect.xy).div(gRect.zw)).toVar();
    const ta = floor(cell.r.mul(255.0 / 16.0).add(0.5)), tb = floor(cell.g.mul(255.0 / 16.0).add(0.5));
    const pick = step(cell.b.oneMinus(), nz.b.mul(0.9).add(nz.g.mul(0.1)));
    const c = gTex(mix(ta, tb, pick), gp).toVar();
    // rock wraps round anything steep
    const nn = normalize(normalGeometry).toVar();
    const slope = nn.y.oneMinus().toVar();
    const w0 = pow(abs(nn), vec3(4.0)), w = w0.div(w0.x.add(w0.y).add(w0.z)).toVar();
    const cliff = float(L.cliff);
    const rock = gTex(cliff, gP.zy).mul(w.x).add(gTex(cliff, gP.xz).mul(w.y)).add(gTex(cliff, gP.xy).mul(w.z));
    c.assign(mix(c, rock, step(nz.r.sub(0.5).mul(0.12).add(0.32), slope)));
    // snow settles on the gentler slopes
    const snow = cell.a.mul(step(slope, nz.g.mul(0.1).add(0.42)));
    c.assign(mix(c, gTex(float(L.snow), gp), step(0.55, snow.add(nz2.b.sub(0.5).mul(0.3)))));
    c.assign(mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), 0.3).mul(nz2.r.mul(0.35).add(0.7)));   // a drabber, darker country
    return vec4(gSnap(c).mul(ref('color', 'color')), 1.0);
  })();
}

// ------------------------------------------------------------------ the ground mesh
export class Land {
  /** paths: [{ pts: [[x, z]...], w: half width, layer }] worn into the ground. rects: [{ x0, z0,
   * x1, z1, layer }] laid over it (plaza, graveyard). holes: [[x0, z0, x1, z1]] cut out. */
  build(ctx, { paths = [], rects = [], holes = [] } = {}) {
    const T0 = performance.now();
    grid = null;
    const g = new Float32Array(NX * NZ);
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) g[k * NX + i] = padded(WORLD.x0 + i * STEP, WORLD.z0 + k * STEP);
    grid = g;
    this.timeHeights = Math.round(performance.now() - T0);
    this.map = this.groundMap(paths, rects);
    this.timeMap = Math.round(performance.now() - T0);
    this.material = this.groundMaterial(ctx);
    this.meshes = [];
    const TILE = 120, Q = TILE / STEP;
    for (let tx = 0; tx < NX - 1; tx += Q) for (let tz = 0; tz < NZ - 1; tz += Q) {
      const n = Q + 1, pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3);
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        const i = Math.min(NX - 1, tx + a), k = Math.min(NZ - 1, tz + b), j = b * n + a;
        const x = WORLD.x0 + i * STEP, z = WORLD.z0 + k * STEP;
        pos.set([x, g[k * NX + i], z], j * 3);
        const hl = g[k * NX + Math.max(0, i - 1)], hr = g[k * NX + Math.min(NX - 1, i + 1)];
        const hu = g[Math.max(0, k - 1) * NX + i], hd = g[Math.min(NZ - 1, k + 1) * NX + i];
        const nx = hl - hr, nz = hu - hd, l = Math.hypot(nx, 2 * STEP, nz);
        nor.set([nx / l, 2 * STEP / l, nz / l], j * 3);
      }
      const idx = [];
      for (let a = 0; a + 1 < n; a++) for (let b = 0; b + 1 < n; b++) {
        const x = WORLD.x0 + (tx + a + 0.5) * STEP, z = WORLD.z0 + (tz + b + 0.5) * STEP;
        if (holes.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) continue;
        const p = b * n + a, q = p + 1, r = p + n, s = r + 1;
        idx.push(p, r, q, q, r, s);
      }
      if (!idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.userData.center = [WORLD.x0 + (tx + Q / 2) * STEP, WORLD.z0 + (tz + Q / 2) * STEP];
      ctx.scene.add(mesh);
      this.meshes.push(mesh);
    }
    this.timeMesh = Math.round(performance.now() - T0);
    return this;
  }

  /** The ground tiles cell by cell (RGBA: tile, second tile, how much of the second, snow). */
  groundMap(paths, rects) {
    const data = new Uint8Array(NX * NZ * 4);
    const segs = paths.flatMap((p) => p.pts.slice(1).map((b, i) => [p.pts[i], b, p.w, L[p.layer || 'gravel']]));
    // a coarse bucket of path segments so each cell only measures the near ones
    const B = 60, buckets = new Map();
    for (const s of segs) {
      const [a, b, w] = s;
      for (let x = Math.floor((Math.min(a[0], b[0]) - w) / B); x <= Math.floor((Math.max(a[0], b[0]) + w) / B); x++)
        for (let z = Math.floor((Math.min(a[1], b[1]) - w) / B); z <= Math.floor((Math.max(a[1], b[1]) + w) / B); z++) {
          const key = x * 10007 + z;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(s);
        }
    }
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
      const x = WORLD.x0 + i * STEP, z = WORLD.z0 + k * STEP, o = (k * NX + i) * 4;
      const bio = biomeAt(x, z), def = BIOMES[bio].ground;
      const n1 = fbm(x * 0.03 + 3, z * 0.03), n2 = fbm(x * 0.09, z * 0.09 + 7);
      // the biome's ground: its tiles in noise-chosen patches
      let acc = 0, a = def[0][0], b = def[Math.min(1, def.length - 1)][0];
      for (const [t, w] of def) { acc += w; if (n1 < acc) { a = t; break; } }
      b = def.find(([t]) => t !== a)?.[0] || a;
      let ta = L[a], tb = L[b], mix = Math.round(smooth(0.3, 0.9, n2) * 120);
      if (bio === 'core' && Math.hypot(x, z) < 100) { ta = n1 < 0.62 ? L.meadow : L.deadgrass; tb = L.forest; mix = Math.round(smooth(0.55, 0.9, n2) * 90); }
      if (bio === 'downs' && x > REGION.x0) { // wet banks along the stream and round the pool
        const st = streamAt(x, z), dp = Math.hypot(x - POOL.x, z - POOL.z);
        if (st.d < 9 || dp < POOL.r + 8) { ta = n1 < 0.5 ? L.mud : L.gravel; tb = L.mud; mix = 60; }
      }
      // snow: all over the fells, and on the high tops anywhere
      const h = grid[k * NX + i];
      const snow = bio === 'rimeholt' ? 1 : smooth(48, 70, h);
      if (snow > 0.5 && bio !== 'rimeholt') { ta = L.snow; tb = L.gravel; }
      for (const r of rects) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) { ta = L[r.layer]; tb = L[r.second || r.layer]; mix = r.mix ?? 50; }
      // paths
      let pd = Infinity, pl = 0;
      for (const s of buckets.get(Math.floor(x / B) * 10007 + Math.floor(z / B)) || []) {
        const [[ax, az], [bx, bz], w, layer] = s, dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        const d = Math.hypot(x - ax - dx * t, z - az - dz * t) - w;
        if (d < pd) { pd = d; pl = layer; }
      }
      if (pd < 0) { tb = ta; ta = pl; mix = Math.round(smooth(-2.5, 0, pd) * 160); }
      else if (pd < 1.5) { tb = pl; mix = Math.round((1 - pd / 1.5) * 110); }
      data[o] = ta * 16; data[o + 1] = tb * 16; data[o + 2] = mix; data[o + 3] = Math.round(snow * 255);
    }
    const t = new THREE.DataTexture(data, NX, NZ);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    this.mapData = data;
    return t;
  }

  /** The tile under (x, z) by name (what the scatter asks before it plants something). */
  groundAt(x, z) {
    const i = Math.round((x - WORLD.x0) / STEP), k = Math.round((z - WORLD.z0) / STEP);
    if (i < 0 || k < 0 || i >= NX || k >= NZ) return 'cliff';
    return LAYERS[this.mapData[(k * NX + i) * 4] / 16];
  }

  /** How steep the ground is at (x, z): 0 flat .. 1 sheer. */
  slope(x, z) {
    const e = 1.5, dx = worldHeight(x + e, z) - worldHeight(x - e, z), dz = worldHeight(x, z + e) - worldHeight(x, z - e);
    return 1 - 2 * e / Math.hypot(dx, 2 * e, dz);
  }

  groundMaterial(ctx) {
    const kit = ctx.kit;
    // the tiles as one texture array (each 128 px, 3 m)
    const arr = new THREE.DataArrayTexture(new Uint8Array(128 * 128 * 4 * LAYERS.length), 128, 128, LAYERS.length);
    arr.format = THREE.RGBAFormat;
    arr.colorSpace = THREE.SRGBColorSpace;
    arr.magFilter = THREE.NearestFilter;
    arr.minFilter = THREE.NearestMipmapLinearFilter;
    arr.wrapS = arr.wrapT = THREE.RepeatWrapping;
    arr.generateMipmaps = true;
    this.ready = Promise.all(LAYERS.map((name, n) => new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, 128, 128);
        arr.image.data.set(g.getImageData(0, 0, 128, 128).data, n * 128 * 128 * 4);
        res();
      };
      img.onerror = res;
      img.src = `templates/models/kit/tex/ground_${name}.png`;
    }))).then(() => { arr.needsUpdate = true; });
    const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x060606, shininess: 4 });
    m.userData.noGlass = true;
    if (WEBGPU) {   // (the same in TSL: hole() fills the same arrays; the count is a uniform)
      const box = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)), top = new Array(8).fill(0);
      this.holes = { box: { value: box }, top: { value: top }, n: T.uniform(0).setGroup(T.renderGroup) };
      m.colorNode = landNode({ arr, map: this.map, rect: new THREE.Vector4(WORLD.x0 - STEP / 2, WORLD.z0 - STEP / 2, NX * STEP, NZ * STEP), kitU: kit.U, holes: this.holes });
      settled(m.colorNode);
      keyed(m, 'land');
      return m;
    }
    this.holes ={ box: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) }, top: { value: new Float32Array(8) }, n: { value: 0 } };
    const U = { gHoleBox: this.holes.box, gHoleTop: this.holes.top, gHoleN: this.holes.n, gArr: { value: arr }, gMap: { value: this.map }, gRect: { value: new THREE.Vector4(WORLD.x0 - STEP / 2, WORLD.z0 - STEP / 2, NX * STEP, NZ * STEP) },
      gCliff: { value: L.cliff }, gSnowL: { value: L.snow } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, kit.U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 gP; varying vec3 gN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\ngP = (modelMatrix * vec4(transformed, 1.0)).xyz; gN = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 gP; varying vec3 gN;
        uniform highp sampler2DArray gArr; uniform sampler2D gMap, kGrime, kLut; uniform vec4 gRect; uniform float gCliff, gSnowL;
        uniform vec4 gHoleBox[8]; uniform float gHoleTop[8]; uniform int gHoleN;
        vec3 gTex(float layer, vec2 p) { return texture(gArr, vec3(p / 3.0, layer)).rgb; }
        vec3 gSnap(vec3 c) {
          vec3 s = clamp(pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)), 0.0, 1.0) * 31.0 + 0.5;
          vec2 uv = vec2((floor(s.b) * 32.0 + floor(s.r) + 0.5) / 1024.0, (floor(s.g) + 0.5) / 32.0);
          return pow(texture2D(kLut, uv).rgb, vec3(2.2));
        }`)
        .replace('#include <map_fragment>', `
        {
          for (int i = 0; i < 8; i++) { // cave mouths and the like: no ground here (below their top)
            if (i >= gHoleN) break;
            vec4 hb = gHoleBox[i];
            if (gP.x > hb.x && gP.x < hb.z && gP.z > hb.y && gP.z < hb.w && gP.y < gHoleTop[i]) discard;
          }
          vec2 gp = gP.xz;
          vec4 nz = texture2D(kGrime, gp * 0.21);
          vec4 nz2 = texture2D(kGrime, gp * 0.047 + 0.3);
          // which tile: the cell under a jittered point, so the borders come out ragged
          vec2 j = (vec2(nz.r, nz2.g) - 0.5) * 4.0;
          vec4 cell = texture2D(gMap, (gp + j - gRect.xy) / gRect.zw);
          float ta = floor(cell.r * 255.0 / 16.0 + 0.5), tb = floor(cell.g * 255.0 / 16.0 + 0.5);
          float pick = step(1.0 - cell.b, nz.b * 0.9 + nz.g * 0.1);
          vec3 c = gTex(mix(ta, tb, pick), gp);
          // rock wraps round anything steep
          vec3 n = normalize(gN);
          float slope = 1.0 - n.y;
          vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
          vec3 rock = gTex(gCliff, gP.zy) * w.x + gTex(gCliff, gP.xz) * w.y + gTex(gCliff, gP.xy) * w.z;
          c = mix(c, rock, step(0.32 + (nz.r - 0.5) * 0.12, slope));
          // snow settles on the gentler slopes
          float snow = cell.a * step(slope, 0.42 + nz.g * 0.1);
          c = mix(c, gTex(gSnowL, gp), step(0.55, snow + (nz2.b - 0.5) * 0.3));
          c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), 0.3) * (0.7 + 0.35 * nz2.r); // a drabber, darker country
          diffuseColor.rgb *= gSnap(c);
        }`);
    };
    return m;
  }

  /** Open a hole in the ground (a cave mouth in a cliff face): the ground mesh is not drawn
   * inside [x0, z0]-[x1, z1] below yTop, and the physics has no outdoor ground there. Up to 8. */
  hole(x0, z0, x1, z1, yTop, physics = null) {
    const n = this.holes.n.value;
    if (n >= 8) return false;
    this.holes.box.value[n].set(x0, z0, x1, z1);
    this.holes.top.value[n] = yTop;
    this.holes.n.value = n + 1;
    physics?.groundHoles.push([x0, z0, x1, z1]);
    return true;
  }

  /** Hide ground tiles past `far` metres. */
  update(pos, far) {
    for (const m of this.meshes) m.visible = Math.hypot(m.userData.center[0] - pos.x, m.userData.center[1] - pos.z) < far + 90;
  }

  /** The snow map for the kit's weathering (one channel of the ground map). */
  biomeTexture() {
    return { tex: this.map, rect: [WORLD.x0 - STEP / 2, WORLD.z0 - STEP / 2, NX * STEP, NZ * STEP] };
  }
}

export { STREAM };
