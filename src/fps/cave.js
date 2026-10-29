// The Gloamhollow: a cave system cut into the cliff just north of Brightwater Falls, home to
// the ghasts and grubbers (foes.js). A tunnel runs in from the foot of the cliff and down into
// the rock to a great domed cavern round a glowing pool; from there passages lead north to the
// ghasts' nest (pitch dark, heaped with bones), south to the grubbers' warren (lit by the fungus
// they farm), west to a sunken shrine, and round the back between them so a chase can loop.
//
// The shape is one signed distance field over a half-metre grid: capsules for passages, ovals
// for chambers, roughened with noise. Floor and ceiling are two height fields that curl up and
// down into each other where the field crosses the wall, so the walls come out as smooth rock
// rather than blocks. Physics gets merged boxes: the floor under every open cell and a wall
// round the edge. The cliff face is opened with the land's ground hole (ctx.land.hole), which
// also drops the outdoor ground there so the boxes are what you walk on. Foes find their way
// to you along the passages by a flow field over the open cells.
import * as THREE from 'three';

const G = 0.5;                                    // grid step (metres)
const DEEP = -9;                                  // the cavern floor (well under the 'under' line)

function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 5.2, z * 2.1 + 1.3) * 0.3 + vnoise(x * 4.3 + 9.7, z * 4.3 + 3.1) * 0.15;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** Passages (capsules along a polyline) and chambers (ovals), in the cave's own frame:
 * a metres into the cliff (east), b metres along it (+z). Floors and heights may vary. */
function layout() {
  const F = [];
  const pass = (pts, r, f0, f1, h = 3.6, tag = 'pass') => F.push({ type: 'pass', pts, r, f0, f1, h, tag });
  const room = (a, b, ra, rb, floor, dome, tag) => F.push({ type: 'room', a, b, ra, rb, floor, dome, tag });
  pass([[-5, 0], [6, 1], [14, -1], [24, 2]], 2.3, null, DEEP, 3.8, 'entrance');    // f0 null: follows the ground at the mouth
  room(35, 2, 12, 15, DEEP - 0.4, 7.5, 'cavern');
  pass([[32, -11], [28, -24], [24, -37]], 1.9, DEEP - 0.4, DEEP - 1.6, 3.4, 'north');
  room(22, -47, 9, 8, DEEP - 1.6, 4.0, 'nest');
  pass([[37, 14], [35, 26], [30, 39]], 2.1, DEEP - 0.4, DEEP - 0.2, 3.6, 'south');
  room(28, 49, 10, 9, DEEP - 0.2, 5.0, 'warren');
  pass([[12, -1], [11, -11], [8, -21]], 1.5, null, DEEP - 2.6, 3.0, 'stair');      // down from the tunnel to the shrine
  room(6, -27, 5.5, 5, DEEP - 2.6, 3.2, 'shrine');
  pass([[30, -47], [41, -38], [46, -22], [47, -4]], 1.6, DEEP - 1.6, DEEP - 0.6, 3.0, 'loop');
  pass([[47, -4], [47, 14], [44, 27]], 1.6, DEEP - 0.6, DEEP - 0.4, 3.0, 'loop');
  room(43, 31, 5, 4.5, DEEP - 0.4, 3.0, 'bones');
  pass([[40, 33], [33, 44]], 1.5, DEEP - 0.4, DEEP - 0.2, 3.0, 'loop');
  return F;
}

/** Signed distance (negative inside), floor and height of one feature at (a, b). */
function feature(f, a, b, entryFloor = () => 0) {
  if (f.type === 'room') {
    const qa = (a - f.a) / f.ra, qb = (b - f.b) / f.rb, q = Math.hypot(qa, qb);
    const s = (q - 1) * Math.min(f.ra, f.rb);
    const h = 3.6 + f.dome * Math.max(0, 1 - q * q);
    return { s, floor: f.floor, h };
  }
  // a capsule along the polyline: distance, and how far along it we are (0..1)
  let best = Infinity, along = 0, acc = 0, total = 0;
  const L = [];
  for (let i = 0; i + 1 < f.pts.length; i++) { const l = Math.hypot(f.pts[i + 1][0] - f.pts[i][0], f.pts[i + 1][1] - f.pts[i][1]); L.push(l); total += l; }
  for (let i = 0; i + 1 < f.pts.length; i++) {
    const [ax, az] = f.pts[i], [bx, bz] = f.pts[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((a - ax) * dx + (b - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(a - ax - dx * t, b - az - dz * t);
    if (d < best) { best = d; along = (acc + t * L[i]) / total; }
    acc += L[i];
  }
  const f0 = f.f0 ?? entryFloor(f);
  const floor = lerp(f0, f.f1, smooth(0, 1, along));
  return { s: best - f.r, floor, h: f.h };
}

function rockTexture() {
  const S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), img = g.createImageData(S, S);
  const ramp = [[11, 11, 16], [22, 22, 27], [32, 32, 38], [43, 43, 49], [53, 53, 60], [64, 64, 71], [74, 74, 82], [85, 85, 93], [98, 98, 105], [114, 113, 118]];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // a tiling value: noise sampled on a torus
    const u = x / S * Math.PI * 2, v = y / S * Math.PI * 2;
    const n = vnoise(Math.cos(u) * 3 + 10, Math.sin(u) * 3 + Math.cos(v) * 3) * 0.6 + vnoise(Math.cos(u) * 7 + 40, Math.sin(v) * 7 + Math.sin(u) * 2) * 0.4;
    const crack = Math.abs(vnoise(Math.cos(u) * 5 + 70, Math.sin(v) * 5 + 20) - 0.5) < 0.03;
    let k = Math.floor(n * 9.99);
    if (crack) k = Math.max(0, k - 4);
    k = Math.max(0, Math.min(9, k + ((x + y * 3) % 4 === 0 && n * 10 % 1 > 0.6 ? 1 : 0)));
    const c = ramp[k], i = (y * S + x) * 4;
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Rock wrapped round any surface without stretching (triplanar), darkened in its folds. */
function rockMaterial(tex) {
  // two-sided: the roof's top shows as a ledge over the mouth from outside
  const m = new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, specular: 0x181a1c, shininess: 14, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tRock = { value: tex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 cP; varying vec3 cN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\ncP = (modelMatrix * vec4(transformed, 1.0)).xyz; cN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 cP; varying vec3 cN; uniform sampler2D tRock;')
      .replace('#include <map_fragment>', `
        vec3 tw = pow(abs(normalize(cN)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
        vec3 rk = texture2D(tRock, cP.zy / 2.6).rgb * tw.x + texture2D(tRock, cP.xz / 2.2).rgb * tw.y + texture2D(tRock, cP.xy / 2.6).rgb * tw.z;
        float wet = smoothstep(0.6, 0.95, normalize(cN).y);
        rk = mix(rk, rk * vec3(0.78, 0.92, 0.86), wet * 0.6);
        diffuseColor.rgb *= rk * 2.2;`);
  };
  m.customProgramCacheKey = () => 'cave-rock';
  return m;
}

/** A small glowing mushroom (stem and cap), for instancing. */
function mushroomGeometry() {
  const stem = new THREE.CylinderGeometry(0.025, 0.035, 0.16, 5).translate(0, 0.08, 0);
  const cap = new THREE.SphereGeometry(0.08, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0, 0.15, 0);
  const g = new THREE.BufferGeometry();
  const pos = [], nor = [], col = [];
  for (const [part, c] of [[stem, [0.55, 0.52, 0.45]], [cap, [1, 1, 1]]]) {
    const p = part.toNonIndexed();
    pos.push(...p.attributes.position.array); nor.push(...p.attributes.normal.array);
    for (let i = 0; i < p.attributes.position.count; i++) col.push(...c);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export class Cave {
  constructor(ctx, { z = -14 } = {}) {
    this.ctx = ctx;
    this.name = 'The Gloamhollow';
    const phys = this.phys = ctx.physics;
    const H = (x, z2) => phys.groundAt(x, z2);
    // the mouth: at the foot of the cliff, where the ground starts climbing steeper than 45 degrees
    const cliff = (zz) => 736 + Math.sin(zz * 0.021) * 9 + Math.sin(zz * 0.06) * 3;
    let xf = cliff(z) - 16;
    while (xf < cliff(z) + 4 && H(xf + 0.5, z) - H(xf, z) < 0.5) xf += 0.5;
    const px = xf + 0.5;
    this.px = px; this.pz = z;
    const gMouth = H(xf, z);
    this.mouth = new THREE.Vector3(px - 5, H(px - 5, z), z);
    const F = this.features = layout();
    // the grid, in the cave's frame: a = x - px, b = z - pz
    const a0 = -6, a1 = 54, b0 = -60, b1 = 62;
    this.a0 = a0; this.b0 = b0;
    const nx = this.nx = Math.round((a1 - a0) / G) + 1, nz = this.nz = Math.round((b1 - b0) / G) + 1;
    const N = nx * nz;
    const S = this.s = new Float32Array(N), FL = this.floor = new Float32Array(N), HT = this.height = new Float32Array(N);
    // the entrance runs down from the ground at the mouth; the shrine stair leaves it 12 m in
    F[0].f0 = gMouth;
    F.find((f) => f.tag === 'stair').f0 = feature(F[0], 12, -1).floor;
    const entry = () => gMouth;
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const a = a0 + i * G, b = b0 + k * G, x = px + a, zz = z + b;
      let ws = 0, wf = 0, wh = 0, smin = Infinity;
      for (const f of F) {
        const r = feature(f, a, b, entry);
        if (r.s < smin) smin = r.s;
        const w = Math.exp(-2.2 * Math.max(r.s, -3));
        ws += w; wf += w * r.floor; wh += w * r.h;
      }
      let floor = wf / ws, h = wh / ws;
      // a rough edge, a bowl for the pool in the cavern
      let s = smin + (fbm(x * 0.35, zz * 0.35) - 0.5) * 1.6 * (0.15 + 0.85 * smooth(3, 9, a));
      const dp = Math.hypot(a - 36, b - 6);
      floor -= 1.1 * Math.max(0, 1 - (dp / 6.5) ** 2);
      floor += (fbm(x * 0.6 + 7, zz * 0.6) - 0.5) * 0.35 * smooth(2, 10, a);
      h += (fbm(x * 0.3 + 3, zz * 0.3 + 9) - 0.5) * 1.2 * smooth(4, 10, a);
      if (a < 0) { floor = H(x, zz); h = 3.8; }                     // outside: the ground itself
      else if (a < 4) floor = lerp(gMouth, floor, smooth(0, 4, a));
      // never closer than 1.5 m to the land above (away from the mouth)
      if (a > 3 && H(x, zz) < floor + h + 1.5) s = Math.max(s, 0.5);
      const j = k * nx + i;
      S[j] = s; FL[j] = floor; HT[j] = h;
    }
    this.water = { x: px + 36, z: z + 6, r: 6.2, y: DEEP - 0.4 - 0.45 };
    this.build();
  }

  idx(x, z) {
    const i = Math.round((x - this.px - this.a0) / G), k = Math.round((z - this.pz - this.b0) / G);
    if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) return -1;
    return k * this.nx + i;
  }

  /** Whether p is inside the cave (open space, between its floor and roof). */
  contains(p) {
    const j = this.idx(p.x, p.z);
    if (j < 0 || this.s[j] > 0.4) return false;
    if (p.x < this.px - 0.5) return false;
    return p.y > this.floor[j] - 3 && p.y < this.floor[j] + this.height[j] + 0.5;
  }

  floorAt(x, z) { const j = this.idx(x, z); return j < 0 ? null : this.floor[j]; }

  build() {
    const { nx, nz, s: S, floor: FL, height: HT, px, pz, a0, b0, ctx } = this;
    const X = (i) => px + a0 + i * G, Z = (k) => pz + b0 + k * G;
    // ------------------------------------------------ the rock: floor and roof curling into walls
    const pos = [], col = [], idxF = [], idxC = [];
    const vid = new Int32Array(nx * nz * 2).fill(-1);
    const lift = (j) => smooth(-1.2, 0.9, S[j]) * (HT[j] * 0.5 + 0.35);
    const vert = (j, roof) => {
      const key = j * 2 + (roof ? 1 : 0);
      if (vid[key] >= 0) return vid[key];
      const i = j % nx, k = (j - i) / nx;
      const a = a0 + i * G;
      const l = a < 0 ? 0 : lift(j) * smooth(-0.5, 1.5, a);
      const y = roof ? FL[j] + HT[j] - l : FL[j] + l;
      // rough the walls a little in and out
      const rough = l > 0.2 ? (fbm(X(i) * 1.3 + (roof ? 5 : 0), y * 1.3 + Z(k)) - 0.5) * 0.35 : 0;
      pos.push(X(i) + rough, y, Z(k) - rough * 0.7);
      const ao = roof ? 0.55 + 0.45 * (1 - smooth(0, 1, l / 2)) : 0.45 + 0.55 * (1 - smooth(0.2, 1.6, l));
      col.push(ao, ao, ao);
      vid[key] = pos.length / 3 - 1;
      return vid[key];
    };
    for (let k = 0; k + 1 < nz; k++) for (let i = 0; i + 1 < nx; i++) {
      const j00 = k * nx + i, j10 = j00 + 1, j01 = j00 + nx, j11 = j01 + 1;
      const smin = Math.min(S[j00], S[j10], S[j01], S[j11]);
      if (smin > 0.9) continue;
      const a = a0 + i * G;
      if (a < 0) {                       // outside the cliff: just the floor, and only inside the cut
        const b = b0 + k * G;
        if (Math.abs(b) > 1.9 || a < -1.0) continue;
      }
      const f = [vert(j00, false), vert(j10, false), vert(j01, false), vert(j11, false)];
      idxF.push(f[0], f[2], f[1], f[1], f[2], f[3]);
      if (a >= 0.5) {
        const c = [vert(j00, true), vert(j10, true), vert(j01, true), vert(j11, true)];
        idxC.push(c[0], c[1], c[2], c[1], c[3], c[2]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex([...idxF, ...idxC]);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.rockTex = rockTexture();
    const mesh = this.mesh = new THREE.Mesh(geo, rockMaterial(this.rockTex));
    mesh.receiveShadow = true; mesh.castShadow = true;
    ctx.scene.add(mesh);

    // ------------------------------------------------ the mouth: the cliff opened, the ground dropped
    const HW = 1.9;                                     // the cut's half width
    const hx0 = px - 1.0, hx1 = px + 2.5, hz0 = pz - HW, hz1 = pz + HW;
    const yTop = this.floorAt(px + 0.5, pz) + 3.0;
    if (ctx.land?.hole) ctx.land.hole(hx0, hz0, hx1, hz1, yTop, this.phys);
    else this.phys.groundHoles.push([hx0, hz0, hx1, hz1]);
    (this.phys.belowGround ||= []).push((p) => this.contains(p));    // you may be under the land in here

    // ------------------------------------------------ physics: floors and walls, merged into runs
    const open = (j) => S[j] < 0;
    const inHole = (i, k) => { const x = X(i), z = Z(k); return x > hx0 - 0.3 && x < hx1 + 0.3 && z > hz0 - 0.3 && z < hz1 + 0.3; };
    let boxes = 0;
    // floors: runs along each row of cells at much the same height, then runs that match the
    // row before (same span, same height) grown into one rectangle
    let live = new Map();                                 // "i0,i1" -> {k0, top}
    const emit = (key, r, k1) => {
      const [i0, i1] = key.split(',').map(Number);
      this.phys.add([X(i0) - G / 2, r.top - 0.8, Z(r.k0) - G / 2], [X(i1) + G / 2, r.top, Z(k1) + G / 2], 'cave');
      boxes++;
    };
    for (let k = 0; k <= nz; k++) {
      const runs = new Map();
      for (let i = 0; k < nz && i < nx;) {
        const j = k * nx + i;
        if (!open(j) || (a0 + i * G < 0 && !inHole(i, k))) { i++; continue; }
        const top = FL[j];
        let e = i + 1;
        while (e < nx && open(k * nx + e) && Math.abs(FL[k * nx + e] - top) < 0.08 && !(a0 + e * G < 0 && !inHole(e, k))) e++;
        runs.set(`${i},${e - 1}`, top);
        i = e;
      }
      const next = new Map();
      for (const [key, top] of runs) {
        const r = live.get(key);
        if (r && Math.abs(r.top - top) < 0.08) { next.set(key, r); live.delete(key); } else next.set(key, { k0: k, top });
      }
      for (const [key, r] of live) emit(key, r, k - 1);
      live = next;
    }
    // walls: closed cells beside open ones (and the sides of the mouth, where the ground is gone)
    const wall = (i, k) => {
      const j = k * nx + i;
      if (open(j)) return false;
      const a = a0 + i * G;
      if (a < 0 && !inHole(i, k)) return false;          // outside the cliff the land is the wall
      for (let dk = -2; dk <= 2; dk++) for (let di = -2; di <= 2; di++) {
        const ii = i + di, kk = k + dk;
        if (ii >= 0 && kk >= 0 && ii < nx && kk < nz && open(kk * nx + ii)) return true;
      }
      return false;
    };
    for (let k = 0; k < nz; k++) {
      let i = 0;
      while (i < nx) {
        if (!wall(i, k)) { i++; continue; }
        const j = k * nx + i;
        let e = i + 1;
        while (e < nx && wall(e, k)) e++;
        const lo = Math.min(...Array.from({ length: e - i }, (_, q) => FL[j + q])) - 1;
        const hi = Math.max(...Array.from({ length: e - i }, (_, q) => FL[j + q] + HT[j + q])) + 3;
        this.phys.add([X(i) - G / 2, lo, Z(k) - G / 2], [X(e - 1) + G / 2, hi, Z(k) + G / 2], 'cave');
        boxes++;
        i = e;
      }
    }

    // ------------------------------------------------ the pool, the fungus, the spikes of rock
    const w = this.water;
    const wm = new THREE.Mesh(new THREE.CircleGeometry(w.r, 32).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({
      color: 0x041014, emissive: 0x03181c, specular: 0x5ab8c0, shininess: 120, transparent: true, opacity: 0.82 }));
    wm.position.set(w.x, w.y, w.z);
    ctx.scene.add(wm);
    this.waterMesh = wm;
    const R = (() => { let q = 9001; return () => { q = (q * 16807) % 2147483647; return q / 2147483647; }; })();
    const spot = (tag, inset = 1.5) => {          // a random open point in a chamber, `inset` from its walls
      const f = this.features.find((ff) => ff.tag === tag);
      for (let t = 0; t < 60; t++) {
        let a, b;
        if (f.type === 'room') { const ang = R() * 6.283, r = Math.sqrt(R()); a = f.a + Math.cos(ang) * f.ra * r; b = f.b + Math.sin(ang) * f.rb * r; }
        else { const seg = Math.floor(R() * (f.pts.length - 1)), u = R(); a = lerp(f.pts[seg][0], f.pts[seg + 1][0], u); b = lerp(f.pts[seg][1], f.pts[seg + 1][1], u); }
        const j = this.idx(px + a, pz + b);
        if (j >= 0 && S[j] < -inset && Math.hypot(px + a - w.x, pz + b - w.z) > w.r + 0.8) return new THREE.Vector3(px + a, FL[j], pz + b);
      }
      return null;
    };
    this.spot = spot;
    // stalagmites and stalactites
    const spikes = [];
    for (const [tag, n] of [['cavern', 26], ['nest', 10], ['warren', 12], ['bones', 4], ['shrine', 4]]) {
      for (let q = 0; q < n; q++) {
        const p = spot(tag, 1.6);
        if (!p) continue;
        const j = this.idx(p.x, p.z), roof = FL[j] + HT[j];
        if (R() < 0.45) {                                   // up from the floor
          const r = 0.18 + R() * 0.35, h = 0.6 + R() * 2.2;
          spikes.push(new THREE.ConeGeometry(r, h, 7).translate(p.x, p.y + h / 2 - 0.05, p.z));
          if (r > 0.22) this.phys.add([p.x - r * 0.7, p.y - 0.2, p.z - r * 0.7], [p.x + r * 0.7, p.y + h * 0.8, p.z + r * 0.7], 'cave');
        } else {                                             // down from the roof
          const r = 0.12 + R() * 0.3, h = 0.5 + R() * Math.min(2.4, HT[j] * 0.35);
          spikes.push(new THREE.ConeGeometry(r, h, 6).rotateX(Math.PI).translate(p.x, roof - h / 2 + 0.1, p.z));
        }
      }
    }
    if (spikes.length) {
      const merged = new THREE.BufferGeometry();
      const P = [], Nn = [], C = [];
      for (const g of spikes) {
        const ng = g.toNonIndexed();
        ng.computeVertexNormals();
        P.push(...ng.attributes.position.array); Nn.push(...ng.attributes.normal.array);
        for (let i = 0; i < ng.attributes.position.count; i++) C.push(0.8, 0.8, 0.8);
      }
      merged.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      merged.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
      merged.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      const sm = new THREE.Mesh(merged, mesh.material);
      sm.castShadow = true; sm.receiveShadow = true;
      ctx.scene.add(sm);
    }
    // glowing fungus in clusters, and the few lights in the dark
    const mg = mushroomGeometry();
    const clusters = [['cavern', 0x40d8e8, 7], ['warren', 0x7cff5a, 9], ['warren', 0xb8ff70, 6], ['shrine', 0xb070ff, 3], ['nest', 0x4060ff, 2], ['bones', 0x9cf0ff, 2]];
    const fungus = [];
    for (const [tag, color, n] of clusters) for (let q = 0; q < n; q++) {
      const p = spot(tag, 0.6);
      if (p) fungus.push([p, color]);
    }
    const count = fungus.length * 9;
    // unlit: they are their own light (stem dimmer than cap, each cluster its own colour)
    const im = new THREE.InstancedMesh(mg, new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff }), count);
    const mtx = new THREE.Matrix4(), q4 = new THREE.Quaternion(), sc = new THREE.Vector3(), cc = new THREE.Color();
    let n = 0;
    for (const [p, color] of fungus) for (let u = 0; u < 9; u++) {
      const s2 = 0.6 + R() * 1.6;
      const x = p.x + (R() - 0.5) * 1.2, z = p.z + (R() - 0.5) * 1.2, y = (this.floorAt(x, z) ?? p.y) - 0.02;
      q4.setFromEuler(new THREE.Euler((R() - 0.5) * 0.4, R() * 6.28, (R() - 0.5) * 0.4));
      mtx.compose(new THREE.Vector3(x, y, z), q4, sc.set(s2, s2, s2));
      im.setMatrixAt(n, mtx);
      im.setColorAt(n, cc.set(color));
      n++;
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    ctx.scene.add(im);
    this.lights = [];
    const glow = (p, color, power, dist) => {
      const l = new THREE.PointLight(color, 0, dist, 1.6);
      l.position.copy(p);
      ctx.scene.add(l);
      this.lights.push({ l, power });
    };
    glow(new THREE.Vector3(w.x, w.y + 1.2, w.z), 0x2fc8d8, 5, 16);              // two lights only: lights are dear
    const wf = this.features.find((f) => f.tag === 'warren');
    glow(new THREE.Vector3(px + wf.a, DEEP + 2.2, pz + wf.b), 0x6aff4a, 4, 14);

    // ------------------------------------------------ the kit: torches, bones, a fire, old stone
    const kit = ctx.kit;
    if (kit?.place) {
      const P = (id, p, rot = 0, s = 1, solid = false) => kit.place(id, p.x, p.y, p.z, rot, s, { layer: 'under', solid, cull: 60 });
      // torches on the walls of the lower tunnel and the cavern (none in the nest)
      for (const [tag, n2] of [['entrance', 3], ['cavern', 5], ['warren', 2], ['shrine', 2]]) {
        for (let q = 0, made = 0; q < 40 && made < n2; q++) {
          const p = this.wallSpot(tag, R);
          if (!p || p.y > -1.5) continue;
          P('dungeon/Torch', p, p.rot);
          made++;
        }
      }
      for (let q = 0; q < 7; q++) { const p = spot('nest', 1.2); if (p) P(q % 3 ? 'dungeon/Skull' : 'bellmourn/bone_heap', p, R() * 6.28, 0.8 + R() * 0.5); }
      for (let q = 0; q < 4; q++) { const p = spot('bones', 1.0); if (p) P(q % 2 ? 'bellmourn/bone_heap' : 'dungeon/Skull', p, R() * 6.28, 0.9 + R() * 0.4); }
      for (const tag of ['north', 'loop']) { const p = spot(tag, 0.8); if (p) P('bellmourn/skull_pike', p, R() * 6.28, 1, true); }
      for (let q = 0; q < 6; q++) { const p = this.wallSpot(['nest', 'north', 'loop', 'bones'][q % 4], R); if (p) P(q % 2 ? 'dungeon/Cobweb' : 'dungeon/Cobweb2', p.clone().add(new THREE.Vector3(0, 0.6, 0)), p.rot); }
      const fire = spot('warren', 2.5);
      if (fire) P('dungeon/Woodfire', fire, R() * 6.28, 1, false);
      for (let q = 0; q < 3; q++) { const p = spot('shrine', 1.2); if (p) P(q ? 'dungeon/Column~broken' : 'dungeon/Pedestal', p, R() * 6.28, 1, true); }
      for (let q = 0; q < 10; q++) { const p = spot(['cavern', 'warren', 'nest', 'south', 'north'][q % 5], 1.0); if (p) P(`ultimate/Rock_${1 + (q % 7)}`, p.clone().add(new THREE.Vector3(0, -0.15, 0)), R() * 6.28, 0.5 + R() * 0.6, true); }
    }
    // rocks heaped round the mouth outside, to frame it
    if (kit?.place) {
      for (let q = 0; q < 6; q++) {
        const side = q % 2 ? 1 : -1, x = px - 0.5 - R() * 2.5, z = pz + side * (2.6 + R() * 1.4);
        kit.place(`ultimate/Rock_Moss_${1 + (q % 7)}`, x, this.phys.groundAt(x, z) - 0.2, z, R() * 6.28, 1.2 + R() * 0.9, { solid: true, cull: 160 });
      }
    }
    // the flow field's walkable cells (a margin off the walls)
    this.walk = new Uint8Array(nx * nz);
    for (let j = 0; j < nx * nz; j++) this.walk[j] = S[j] < -0.2 ? 1 : 0;
    this.flow = null; this.flowKey = -1; this.flowT = 0;
    console.info(`cave: ${boxes} boxes, ${pos.length / 3} verts, ${spikes.length} spikes, ${n} mushrooms; mouth at`, this.mouth.toArray().map((v) => v.toFixed(1)).join(','));
  }

  /** Which feature (chamber or passage) a point is nearest. */
  tagAt(p) {
    let best = null, bs = Infinity;
    for (const f of this.features) { const r = feature(f, p.x - this.px, p.z - this.pz, () => 0); if (r.s < bs) { bs = r.s; best = f.tag; } }
    return best;
  }

  /** A point on the wall of a feature at torch height, facing in: Vector3 with .rot. */
  wallSpot(tag, R) {
    const f = this.features.find((ff) => ff.tag === tag);
    for (let t = 0; t < 30; t++) {
      let a, b;
      if (f.type === 'room') { const ang = R() * 6.283; a = f.a + Math.cos(ang) * f.ra * 0.8; b = f.b + Math.sin(ang) * f.rb * 0.8; }
      else { const seg = Math.floor(R() * (f.pts.length - 1)), u = R(); a = lerp(f.pts[seg][0], f.pts[seg + 1][0], u); b = lerp(f.pts[seg][1], f.pts[seg + 1][1], u); }
      // walk out from the middle until the field says wall
      const ang = R() * 6.283, dx = Math.cos(ang), dz = Math.sin(ang);
      let last = null;
      for (let r = 0; r < 14; r += 0.25) {
        const j = this.idx(this.px + a + dx * r, this.pz + b + dz * r);
        if (j < 0) break;
        if (this.s[j] > 0.45) {                 // where the rock has curled up to torch height
          if (!last) break;
          const p = new THREE.Vector3(last.x, this.floor[last.j] + 2.0, last.z);
          p.rot = Math.atan2(dx, dz);
          return p;
        }
        last = { x: this.px + a + dx * r, z: this.pz + b + dz * r, j };
      }
    }
    return null;
  }

  // ------------------------------------------------ the way to you along the passages
  flowUpdate(player, dt) {
    this.flowT -= dt;
    const j0 = this.contains(player.pos) ? this.idx(player.pos.x, player.pos.z) : -1;
    if (j0 < 0) { this.flow = null; this.flowKey = -1; return; }
    if (j0 === this.flowKey && this.flowT > 0) return;
    this.flowKey = j0; this.flowT = 0.4;
    const { nx, nz } = this, N = nx * nz;
    const dist = this.flow && this.flow.length === N ? this.flow : new Int16Array(N);
    dist.fill(-1);
    const q = this.queue || (this.queue = new Int32Array(N));
    let h = 0, t = 0;
    dist[j0] = 0; q[t++] = j0;
    while (h < t) {
      const c = q[h++], d = dist[c];
      if (d >= 600) continue;
      const i = c % nx, k = (c - i) / nx;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nk = k + dk;
        if (ni < 0 || nk < 0 || ni >= nx || nk >= nz) continue;
        const n = nk * nx + ni;
        if (dist[n] >= 0 || !this.walk[n]) continue;
        dist[n] = d + 1; q[t++] = n;
      }
    }
    this.flow = dist;
  }

  /** The way toward you along the passages from p, into out; false if there is none. */
  flowDir(p, out) {
    if (!this.flow) return false;
    const { nx, nz } = this;
    const i = Math.round((p.x - this.px - this.a0) / G), k = Math.round((p.z - this.pz - this.b0) / G);
    const at = (a, b) => (a < 0 || b < 0 || a >= nx || b >= nz ? -1 : this.flow[b * nx + a]);
    const here = at(i, k);
    let best = here < 0 ? Infinity : here, bi = i, bk = k;
    for (let di = -2; di <= 2; di++) for (let dk = -2; dk <= 2; dk++) {
      if (!di && !dk) continue;
      const d = at(i + di, k + dk);
      if (d >= 0 && d + Math.hypot(di, dk) * 0.01 < best) { best = d; bi = i + di; bk = k + dk; }
    }
    if (bi === i && bk === k) return false;
    out.set(this.px + this.a0 + bi * G - p.x, 0, this.pz + this.b0 + bk * G - p.z).normalize();
    return true;
  }

  update(dt, player) {
    this.flowUpdate(player, dt);
    // the cave's own lights only burn while you're near
    const d = Math.hypot(player.pos.x - (this.px + 25), player.pos.z - this.pz);
    const k = 1 - smooth(70, 110, d);
    const t = performance.now() / 1000;
    this.lights.forEach(({ l, power }, i) => { l.intensity = power * k * (0.85 + 0.15 * Math.sin(t * (1.3 + i * 0.37))); });
    if (this.waterMesh) this.waterMesh.material.emissive.setRGB(0.01, 0.07 + 0.015 * Math.sin(t * 0.8), 0.085 + 0.02 * Math.sin(t * 0.8 + 1));
  }
}

export function buildCave(ctx, opts) { return new Cave(ctx, opts); }
