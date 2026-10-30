// The Green Downs: the open country east of the forest, reached by the trail from the village's
// east road. Rolling grass hills, a cliff and plateau along the east with a waterfall dropping
// into a broad pool, and a stream that winds from the pool out across the downs to the south
// west. One height function shapes it all; the physics walks on it and the mesh is built from
// it, textured by slope (rock), wetness (mud and gravel by the water, sand round the pool),
// height (old snow on the plateau) and paths.
import * as THREE from 'three';

export const REGION = { x0: 290, x1: 780, z0: -262, z1: 262 };
export const POOL = { x: 700, z: -40, r: 24, level: -0.6 };
export const CLIFF = { x: 736, top: 30 };
// where along the cliff the caves open (z): the Gloamhollow, the Drowned Grotto, the Trollhole
export const CAVE_MOUTHS = { gloam: 8, grotto: -74, troll: 150 };
// the stream, from the pool to where it leaves the downs
export const STREAM = [[692, -36], [660, -14], [620, 20], [574, 38], [530, 36], [492, 14], [458, -22], [428, -62], [404, -108], [384, -158], [366, -210], [352, -262]];
const pads = []; // flattened ground for buildings: {x, z, r, y}
const tiles = []; // the ground's meshes (holes are cut in them for caves' mouths)
const TQ = 3;     // the ground mesh's step (metres)
let groundMat = null, attrAt = null;   // its material, and its blend weights at (x, z)

function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => vnoise(x, z) * 0.55 + vnoise(x * 2.03 + 5.2, z * 2.03 + 1.3) * 0.28 + vnoise(x * 4.1 + 9.7, z * 4.1 + 3.1) * 0.17;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Distance from (x, z) to the stream, and how far along it (0 at the pool .. 1 at its end). */
const SEG = STREAM.slice(1).map((b, i) => Math.hypot(b[0] - STREAM[i][0], b[1] - STREAM[i][1]));
const SEG_TOTAL = SEG.reduce((a, b) => a + b, 0);
export function streamAt(x, z) {
  let best = Infinity, along = 0, acc = 0;
  const L = SEG, total = SEG_TOTAL;
  for (let i = 0; i + 1 < STREAM.length; i++) {
    const [ax, az] = STREAM[i], [bx, bz] = STREAM[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) { best = d; along = (acc + t * L[i]) / total; }
    acc += L[i];
  }
  return { d: best, s: along };
}
export const streamLevel = (s) => POOL.level - 0.4 - s * 3.2; // the water falls gently away from the pool

/** Height before the building pads are levelled. */
function natural(x, z) {
  if (x < REGION.x0 - 2) return 0;
  const edge = smooth(REGION.x0 + 6, REGION.x0 + 70, x); // meets the forest floor at y = 0
  let h = (fbm(x * 0.007, z * 0.007) * 15 - 3 + Math.sin(x * 0.019 + z * 0.006) * 2.5) * edge;
  h = Math.max(h, -1) * 0.85 + 0.6 * edge;
  const st = streamAt(x, z);
  const valley = 1 - smooth(10, 60, st.d); // the stream runs in its own broad, shallow valley
  h = h * (1 - valley * 0.85) + valley * 0.2;
  const bed = streamLevel(st.s) - 0.9;
  h = h + (bed - h) * (1 - smooth(3.5, 15, st.d));
  const dp = Math.hypot(x - POOL.x, z - POOL.z); // the pool's basin
  h = h + (POOL.level - 2.4 - h) * (1 - smooth(POOL.r - 8, POOL.r + 6, dp));
  // the escarpment along the east, with the plateau above it
  const cx = CLIFF.x + Math.sin(z * 0.021) * 9 + Math.sin(z * 0.06) * 3;
  const c = smooth(cx - 7, cx + 3, x);
  h = h + (CLIFF.top + fbm(x * 0.05, z * 0.05) * 4 - h) * c;
  return h;
}

export function terrainHeight(x, z) {
  if (x < REGION.x0 - 2) return 0;
  let h = natural(x, z);
  for (const p of pads) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 10) h = h + (p.y - h) * (1 - smooth(p.r, p.r + 10, d)); }
  return h;
}

/** Level the ground for a building centred at (x, z) of radius r; returns the floor height. */
export function addPad(x, z, r) {
  const y = natural(x, z);
  pads.push({ x, z, r, y });
  return y;
}

/** The ground: smooth-normalled tiles built from the height function, with the downs' own
 * blended material. Paths are [[x, z], ...] polylines worn into dirt. */
export function buildTerrain(ctx, lib, paths) {
  const mat = groundMat = downsMaterial(lib);
  const TILE = 60, Q = TQ;
  const pathD = (x, z) => {
    let best = Infinity;
    for (const pl of paths) for (let i = 0; i + 1 < pl.length; i++) {
      const [ax, az] = pl[i], [bx, bz] = pl[i + 1], dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  };
  attrAt = (x, z) => {        // wetness by the water, wear along the paths, and the pool's shore
    const st = streamAt(x, z), dp = Math.hypot(x - POOL.x, z - POOL.z);
    const wet = Math.max(1 - smooth(4, 12, st.d), 1 - smooth(POOL.r - 4, POOL.r + 10, dp));
    return [wet, 1 - smooth(1.2, 3.2, pathD(x, z)), 1 - smooth(POOL.r + 1, POOL.r + 15, dp)];
  };
  for (let tx = REGION.x0 - 2; tx < REGION.x1 + 40; tx += TILE) for (let tz = REGION.z0 - 40; tz < REGION.z1 + 40; tz += TILE) {
    const n = TILE / Q + 1, pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), att = new Float32Array(n * n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
      const x = tx + i * Q, z = tz + k * Q, y = terrainHeight(x, z), j = (k * n + i);
      pos.set([x, y, z], j * 3);
      const e = 1.0, nx = terrainHeight(x - e, z) - terrainHeight(x + e, z), nz = terrainHeight(x, z - e) - terrainHeight(x, z + e), l = Math.hypot(nx, 2 * e, nz);
      nor.set([nx / l, 2 * e / l, nz / l], j * 3);
      att.set(attrAt(x, z), j * 3);
    }
    const idx = [];
    for (let i = 0; i + 1 < n; i++) for (let k = 0; k + 1 < n; k++) { const a = k * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('downs', new THREE.BufferAttribute(att, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true; mesh.castShadow = true;
    mesh.matrixAutoUpdate = false;
    ctx.scene.add(mesh);
    mesh.userData.tile = [tx, tz];
    tiles.push(mesh);
  }
  return mat;
}

/** A hole in the ground for a cave's mouth: the ground about it is drawn again finer (its 3 m
 * triangles are coarser than the mouth, and lie off the true slope enough for the cave's rock to
 * show through), its edge on the coarse ground's own edges so no crack opens; the triangles over
 * [x0, x1] x [z0, z1] lower than yTop are left out; and the physics has no ground there (the
 * cave's own floor carries you in). */
export function holeTerrain(x0, z0, x1, z1, yTop, physics, scene) {
  physics.groundHoles.push([x0, z0, x1, z1]);
  // the patch: the coarse cells within 9 m of the hole, on the coarse grid
  const gx = REGION.x0 - 2, gz = REGION.z0 - 40;
  const cx0 = gx + Math.floor((x0 - 9 - gx) / TQ) * TQ, cx1 = gx + Math.ceil((x1 + 9 - gx) / TQ) * TQ;
  const cz0 = gz + Math.floor((z0 - 9 - gz) / TQ) * TQ, cz1 = gz + Math.ceil((z1 + 9 - gz) / TQ) * TQ;
  for (const m of tiles) {                   // the coarse cells there come out of their tiles
    const g = m.geometry, P = g.attributes.position.array, I = g.index.array, keep = [];
    for (let t = 0; t < I.length; t += 3) {
      let cx = 0, cz = 0;
      for (let q = 0; q < 3; q++) { const v = I[t + q] * 3; cx += P[v]; cz += P[v + 2]; }
      cx /= 3; cz /= 3;
      if (cx > cx0 && cx < cx1 && cz > cz0 && cz < cz1) continue;
      keep.push(I[t], I[t + 1], I[t + 2]);
    }
    if (keep.length !== I.length) g.setIndex(keep);
  }
  // the fine patch: true heights inside; along its edge, the coarse triangles' own edges
  const F = 0.75, nx = Math.round((cx1 - cx0) / F) + 1, nz = Math.round((cz1 - cz0) / F) + 1;
  const coarse = (x, z) => {                 // the height the coarse mesh draws at (x, z) on a grid line
    const fx = (x - gx) / TQ, fz = (z - gz) / TQ, ix = Math.floor(fx + 1e-6), iz = Math.floor(fz + 1e-6);
    const ux = fx - ix, uz = fz - iz, X = gx + ix * TQ, Z = gz + iz * TQ;
    if (ux < 1e-6) return terrainHeight(X, Z) + (terrainHeight(X, Z + TQ) - terrainHeight(X, Z)) * uz;
    return terrainHeight(X, Z) + (terrainHeight(X + TQ, Z) - terrainHeight(X, Z)) * ux;
  };
  const pos = new Float32Array(nx * nz * 3), nor = new Float32Array(nx * nz * 3), att = new Float32Array(nx * nz * 3);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const x = cx0 + i * F, z = cz0 + k * F, j = k * nx + i;
    const edge = i === 0 || k === 0 || i === nx - 1 || k === nz - 1;
    pos.set([x, edge ? coarse(x, z) : terrainHeight(x, z), z], j * 3);
    const e = 1.0, ddx = terrainHeight(x - e, z) - terrainHeight(x + e, z), ddz = terrainHeight(x, z - e) - terrainHeight(x, z + e), l = Math.hypot(ddx, 2 * e, ddz);
    nor.set([ddx / l, 2 * e / l, ddz / l], j * 3);
    att.set(attrAt ? attrAt(x, z) : [0, 0, 0], j * 3);
  }
  const idx = [];
  for (let k = 0; k + 1 < nz; k++) for (let i = 0; i + 1 < nx; i++) {
    const a = k * nx + i, b = a + 1, c = a + nx, d = c + 1;
    const mx = cx0 + (i + 0.5) * F, mz = cz0 + (k + 0.5) * F, my = (pos[a * 3 + 1] + pos[d * 3 + 1]) / 2;
    if (mx > x0 && mx < x1 && mz > z0 && mz < z1 && my < yTop - 0.6) continue;     // the mouth (under the cave's roof)
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('downs', new THREE.BufferAttribute(att, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, groundMat);
  mesh.receiveShadow = true; mesh.castShadow = true;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);
}

function downsMaterial(lib) {
  // [id, tint]: the ground sheets' tiles (tools/world/import_ground.py) are brighter than the
  // Velscour floors, so they're toned down to sit with them. The grass is laid twice, turned and
  // tinted apart, for lush and dry patches (the dry tint is below)
  const layers = [['ground_grass_05', 0xe8bff5], ['town_wildflower_grass'], ['ground_sand_04', 0xa9aaa2], ['castle_rubble'],
    ['town_damp_mud'], ['ground_gravel_03', 0xb8b4b1], ['ground_dirt_02', 0xb2aab4], ['ground_snow_06', 0xd2d4da]];
  const tex = layers.map(([id]) => { lib.used.add(id); return lib.texture(lib.surf.get(id).file); });
  const T = (c) => { const k = new THREE.Color(c ?? 0xffffff); return `vec3(${[k.r, k.g, k.b].map((v) => v.toFixed(3)).join(', ')})`; };
  const tint = layers.map(([, c]) => T(c));
  const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x080808, shininess: 6 });
  m.userData.noGlass = true;
  m.onBeforeCompile = (sh) => {
    tex.forEach((t, i) => { sh.uniforms['dT' + i] = { value: t }; });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 downs;\nvarying vec3 vDP; varying vec3 vDN; varying vec3 vDA;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDP = (modelMatrix * vec4(transformed, 1.0)).xyz; vDN = normal; vDA = downs;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vDP; varying vec3 vDN; varying vec3 vDA;
      ${tex.map((_, i) => `uniform sampler2D dT${i};`).join('\n')}
      float dHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float dNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), f.x), mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), f.x), f.y); }
      vec3 dTex(sampler2D t, vec2 p, float tile) { return texture2D(t, p / tile).rgb; }
      vec3 dTri(sampler2D t, vec3 p, vec3 n, float tile) { // rock wraps round the cliffs without stretching
        vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
        return texture2D(t, p.zy / tile).rgb * w.x + texture2D(t, p.xz / tile).rgb * w.y + texture2D(t, p.xy / tile).rgb * w.z;
      }`)
      .replace('#include <map_fragment>', `
      vec2 gp = vDP.xz;
      float n1 = dNoise(gp * 0.035), n2 = dNoise(gp * 0.11 + 7.0), n3 = dNoise(gp * 0.06 + 31.0);
      vec3 lush = dTex(dT0, gp, 1.7) * ${tint[0]}, dry = dTex(dT0, mat2(0.6, -0.8, 0.8, 0.6) * gp + 0.37, 1.9) * ${T(0xffa8ff)};
      vec3 grass = mix(lush, dry, smoothstep(0.4, 0.62, n2));
      grass = mix(grass, dTex(dT1, gp, 2.6) * ${tint[1]}, smoothstep(0.7, 0.8, n1 * 0.6 + n3 * 0.4));
      float slope = 1.0 - normalize(vDN).y;
      vec3 rock = dTri(dT3, vDP, normalize(vDN), 3.5) * ${tint[3]};
      vec3 c = mix(grass, rock, smoothstep(0.22, 0.4, slope + (n2 - 0.5) * 0.12));
      // the banks: mud and gravel, a ragged beach of sand round the pool (on the low, level
      // ground, not up the cliff) and bars of it along the stream
      vec3 bank = mix(dTex(dT4, gp, 2.5) * ${tint[4]}, dTex(dT5, gp, 1.3) * ${tint[5]}, smoothstep(0.4, 0.7, n1));
      float shore = smoothstep(0.42, 0.58, vDA.z + (n2 - 0.5) * 0.3) * (1.0 - smoothstep(0.25, 0.45, slope))
        * (1.0 - smoothstep(${(POOL.level + 2.5).toFixed(1)}, ${(POOL.level + 5).toFixed(1)}, vDP.y));
      float sand = max(shore, smoothstep(0.6, 0.7, n3) * smoothstep(0.3, 0.8, vDA.x));
      bank = mix(bank, dTex(dT2, gp, 1.6) * ${tint[2]}, smoothstep(0.2, 0.8, sand));
      c = mix(c, bank, smoothstep(0.2, 0.7, max(vDA.x, shore)));
      c = mix(c, dTex(dT6, gp, 1.5) * ${tint[6]}, smoothstep(0.3, 0.8, vDA.y) * (1.0 - smoothstep(0.3, 0.5, slope)));
      // old snow lying in the hollows of the plateau above the falls, in ragged drifts
      float snow = smoothstep(${(CLIFF.top - 2.5).toFixed(1)}, ${(CLIFF.top + 0.5).toFixed(1)}, vDP.y) * (1.0 - smoothstep(0.1, 0.28, slope))
        * smoothstep(0.42, 0.56, n1 * 0.45 + n2 * 0.35 + dNoise(gp * 0.45 + 13.0) * 0.2);
      c *= 0.84 + 0.32 * dNoise(gp * 0.013 + 3.0);
      c = mix(c, dTex(dT7, gp, 3.0) * ${tint[7]} * (0.86 + 0.22 * n3), snow);
      diffuseColor.rgb *= c;`);
  };
  return m;
}

/** Water: the pool, the stream as a ribbon down its channel, and the waterfall off the cliff,
 * with spray at its foot. Returns {update(dt, t)}. */
export function buildWater(ctx, lib) {
  const { scene } = ctx;
  // a rippled normal map made on the GPU from a noise image
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    let v = 0; for (const [f, a] of [[4, 0.5], [8, 0.3], [16, 0.2]]) v += a * (0.5 + 0.5 * Math.sin((x / 128) * Math.PI * 2 * f + Math.sin((y / 128) * Math.PI * 2 * (f / 2 + 1)) * 2) * Math.cos((y / 128) * Math.PI * 2 * f));
    const b = Math.round(v * 255); img.data.set([b, b, b, 255], (y * 128 + x) * 4);
  }
  g.putImageData(img, 0, 0);
  const noise = new THREE.CanvasTexture(c); noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  const make = (k) => { // each water gets its own normal map so their ripples drift apart
    const m = new THREE.MeshPhongMaterial({ color: 0x24505c, specular: 0xb0c8d8, shininess: 140, transparent: true, opacity: 0.84, depthWrite: false, side: THREE.DoubleSide });
    m.normalMap = lib.normalFrom(noise, k); m.normalScale.set(0.6, 0.6);
    return m;
  };
  const poolMat = make(2.0), streamMat = make(1.7);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(POOL.r + 7, 40), poolMat);
  pool.rotation.x = -Math.PI / 2; pool.position.set(POOL.x, POOL.level, POOL.z); pool.receiveShadow = true;
  scene.add(pool);
  // the stream ribbon: a strip down the polyline, its UVs running along the flow
  const P = [], U = [], I = [];
  let along = 0;
  const steps = [];
  for (let i = 0; i + 1 < STREAM.length; i++) {
    const [ax, az] = STREAM[i], [bx, bz] = STREAM[i + 1], l = Math.hypot(bx - ax, bz - az);
    for (let k = 0; k < Math.ceil(l / 3); k++) steps.push([ax + (bx - ax) * k / Math.ceil(l / 3), az + (bz - az) * k / Math.ceil(l / 3)]);
  }
  steps.push(STREAM.at(-1));
  steps.forEach(([x, z], i) => {
    const [nx, nz] = steps[Math.min(i + 1, steps.length - 1)], [px, pz] = steps[Math.max(i - 1, 0)];
    const dx = nx - px, dz = nz - pz, l = Math.hypot(dx, dz) || 1, sx = -dz / l, sz = dx / l, w = 5.2;
    const s = streamAt(x, z).s, y = streamLevel(s);
    if (i) along += Math.hypot(x - steps[i - 1][0], z - steps[i - 1][1]);
    P.push(x + sx * w, y, z + sz * w, x - sx * w, y, z - sz * w);
    U.push(0, along / 6, 1.7, along / 6);
    if (i) { const a = (i - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  sg.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  sg.setIndex(I);
  const stream = new THREE.Mesh(sg, streamMat); stream.receiveShadow = true; scene.add(stream);
  // the waterfall: a curved sheet from the lip of the cliff into the pool, its streaks pouring down
  const fallMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { time: { value: 0 }, light: { value: 1 } }, fog: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform float time, light; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float streak = n(vec2(vUv.x * 40.0, vUv.y * 3.0 + time * 2.6)) * 0.6 + n(vec2(vUv.x * 90.0, vUv.y * 8.0 + time * 4.0)) * 0.4;
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        float a = (0.55 + 0.45 * streak) * edge * (0.75 + 0.25 * smoothstep(0.0, 0.2, vUv.y));
        vec3 col = mix(vec3(0.55, 0.7, 0.78), vec3(1.0), smoothstep(0.55, 0.95, streak)) * (0.4 + 0.75 * light);
        gl_FragColor = vec4(col * 1.25, a * 0.92);
      }`,
  });
  const FW = 9, fz = POOL.z - 2, P2 = [], U2 = [], I2 = [];
  const top = CLIFF.top + 0.6, lip = CLIFF.x - 1 + Math.sin(fz * 0.021) * 9 + Math.sin(fz * 0.06) * 3;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, y = top + (POOL.level - top) * t, x = lip - 1.5 - 6 * t - 3 * t * t; // arcing out clear of the cliff face
    P2.push(x, y, fz - FW / 2, x, y, fz + FW / 2); U2.push(0, 1 - t, 1, 1 - t);
    if (i) { const a = (i - 1) * 2; I2.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(U2, 2)); fg.setIndex(I2);
  const fall = new THREE.Mesh(fg, fallMat); fall.renderOrder = 4; scene.add(fall);
  // the plateau stream that feeds it
  const feed = new THREE.Mesh(new THREE.PlaneGeometry(40, FW * 0.9), streamMat);
  feed.rotation.x = -Math.PI / 2; feed.position.set(lip + 21, top - 0.15, fz); scene.add(feed);
  const foot = new THREE.Vector3(lip - 10, POOL.level + 0.2, fz);
  return {
    pool, stream, fall, foot,
    update(dt, t, light, smoke, particles) {
      poolMat.normalMap.offset.set(t * 0.01, t * 0.013);
      streamMat.normalMap.offset.set(0, -t * 0.12);
      poolMat.normalMap.repeat.set(4, 4); streamMat.normalMap.repeat.set(1, 1);
      fallMat.uniforms.time.value = t; fallMat.uniforms.light.value = light;
      if (smoke && Math.random() < dt * 30) smoke.emit(foot.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * FW)),
        new THREE.Vector3((Math.random() - 0.7) * 2, 1.2 + Math.random(), (Math.random() - 0.5)), { life: 2.2, size: 0.9, grow: 1.4, alpha: 0.22, shade: 1.6 });
    },
  };
}
