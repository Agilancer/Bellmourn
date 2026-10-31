// Geometry builder for the world: boxes, walls with openings, gable roofs, cones and stairs,
// all with UVs in world metres (divided by each material's tile size) so every texture tiles
// at a real-world size. Geometry is batched per material and per 32 m chunk of the map, so
// the camera and every shadow-casting light only draw the chunks they can see; solid pieces
// register colliders with the physics world.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export class Builder {
  constructor(physics) {
    this.physics = physics;
    this.batches = new Map(); // material -> chunk key -> [geometry]
  }

  push(mat, geo) {
    if (!this.batches.has(mat)) this.batches.set(mat, new Map());
    if (mat.userData.feather && !geo.attributes.edge)   // (a feathered overlay laid some other way: solid throughout)
      geo.setAttribute('edge', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(1), 1));
    const p = geo.attributes.position.array, C = mat.userData.chunk || 32;
    let x = 0, y = 0, z = 0;
    const n = p.length / 3;
    for (let i = 0; i < p.length; i += 3) { x += p[i]; y += p[i + 1]; z += p[i + 2]; }
    const key = `${Math.floor(x / n / C)},${Math.floor(y / n / 8)},${Math.floor(z / n / C)}`;
    const chunks = this.batches.get(mat);
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(geo);
  }

  /** Raw triangles: positions [[x,y,z]...], uvs [[u,v]...] in metres, tris [[a,b,c]...]. */
  mesh(mat, pos, uv, tris, shade = 1) {
    const g = new THREE.BufferGeometry();
    const tu = mat.userData.tileU || 1, tv = mat.userData.tileV || 1;
    const P = new Float32Array(tris.length * 9), U = new Float32Array(tris.length * 6);
    tris.forEach(([a, b, c], i) => {
      [a, b, c].forEach((v, j) => {
        P.set(pos[v], i * 9 + j * 3);
        U.set([uv[v][0] / tu, uv[v][1] / tv], i * 6 + j * 2);
      });
    });
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.computeVertexNormals();
    const C = new Float32Array(tris.length * 9).fill(shade);
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    this.push(mat, g);
  }

  /** A quad from four corners (counter-clockwise seen from the front), UVs in metres. A ground
   * overlay with a feathered edge (lib.material `feather`) is laid as a feathered quad instead. */
  quad(mat, a, b, c, d, uvs, shade = 1) {
    if (mat.userData.feather) { this.featherQuad(mat, a, b, c, d, uvs, shade); return; }
    this.mesh(mat, [a, b, c, d], uvs, [[0, 1, 2], [0, 2, 3]], shade);
  }

  // ------------------------------------------------------------ feathered ground overlays
  // A road, a plaza, a yard laid over the ground has no hard straight edge: its edge is a band
  // `feather` metres either side of where it was drawn, with an `edge` value running from 0 outside
  // the band to 1 inside it, and the overlay's shader (lib.material) frays it there with noise and
  // the texture's own light and dark (stones last, dirt between them first).

  /** Triangles with an `edge` per vertex (0 .. 1), UVs in metres. */
  edgeMesh(mat, pos, uv, edge, tris, shade = 1) {
    const g = new THREE.BufferGeometry();
    const tu = mat.userData.tileU || 1, tv = mat.userData.tileV || 1;
    const P = new Float32Array(tris.length * 9), U = new Float32Array(tris.length * 6), E = new Float32Array(tris.length * 3);
    tris.forEach(([a, b, c], i) => {
      [a, b, c].forEach((v, j) => {
        P.set(pos[v], i * 9 + j * 3);
        U.set([uv[v][0] / tu, uv[v][1] / tv], i * 6 + j * 2);
        E[i * 3 + j] = edge[v];
      });
    });
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.setAttribute('edge', new THREE.BufferAttribute(E, 1));
    g.computeVertexNormals();
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tris.length * 9).fill(shade), 3));
    this.push(mat, g);
  }

  /** A feathered quad: the four corners grown out and shrunk in by the feather (no more than 0.4 of
   * its narrower side), its UVs carried on out from the corners'. */
  featherQuad(mat, a, b, c, d, uvs, shade = 1) {
    const P = [a, b, c, d].map((p) => new THREE.Vector3(...p));
    const n = new THREE.Vector3().subVectors(P[1], P[0]).cross(new THREE.Vector3().subVectors(P[2], P[0])).normalize();
    const side = Math.min(P[0].distanceTo(P[1]), P[1].distanceTo(P[2]), P[2].distanceTo(P[3]), P[3].distanceTo(P[0]));
    const f = Math.min(mat.userData.feather, side * 0.4);
    // UVs: affine in the quad's plane (the builders' UVs are world metres), from corners 0, 1, 3
    const s = new THREE.Vector3().subVectors(P[1], P[0]).normalize(), t = new THREE.Vector3().crossVectors(n, s);
    const flat = (p) => { const q = new THREE.Vector3().subVectors(p, P[0]); return [q.dot(s), q.dot(t)]; };
    const [x1, y1] = flat(P[1]), [x3, y3] = flat(P[3]), det = x1 * y3 - x3 * y1 || 1e-9;
    const uvAt = (p) => {
      const [x, y] = flat(p), k1 = (x * y3 - x3 * y) / det, k3 = (x1 * y - x * y1) / det;
      return [0, 1].map((i) => uvs[0][i] + (uvs[1][i] - uvs[0][i]) * k1 + (uvs[3][i] - uvs[0][i]) * k3);
    };
    // each corner moved along its mitre so both its sides move by f
    const off = (i, k) => {
      const p = P[i], prev = P[(i + 3) % 4], next = P[(i + 1) % 4];
      const n1 = new THREE.Vector3().subVectors(p, prev).cross(n).normalize(), n2 = new THREE.Vector3().subVectors(next, p).cross(n).normalize();
      const m = n1.clone().add(n2), den = 1 + n1.dot(n2);
      return p.clone().addScaledVector(m, (k * f) / Math.max(den, 0.2));
    };
    const pts = [0, 1, 2, 3].map((i) => off(i, 1)).concat([0, 1, 2, 3].map((i) => off(i, -1)));
    const edge = [0, 0, 0, 0, 1, 1, 1, 1], tris = [[4, 5, 6], [4, 6, 7]];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; tris.push([i, j, 4 + j], [i, 4 + j, 4 + i]); }
    this.edgeMesh(mat, pts.map((p) => p.toArray()), pts.map(uvAt), edge, tris, shade);
  }

  /** A feathered patch of ground round (x, z) at height y: `outline` [[x, z]...] counter-clockwise
   * seen from above (a ragged ring), its UVs world metres (x, -z). */
  patch(mat, x, z, y, outline, shade = 1) {
    const f = mat.userData.feather || 1, n = outline.length;
    const pos = [[x, y, z]], edge = [1];
    for (const k of [1, -1]) for (const [px, pz] of outline) {
      const dx = px - x, dz = pz - z, r = Math.hypot(dx, dz) || 1, g = Math.max(0.2, (r + k * f) / r);
      pos.push([x + dx * g, y, z + dz * g]); edge.push(k > 0 ? 0 : 1);
    }
    const tris = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, oi = 1 + i, oj = 1 + j, ii = 1 + n + i, ij = 1 + n + j;
      tris.push([0, ij, ii], [oi, ii, ij], [oi, ij, oj]);
    }
    this.edgeMesh(mat, pos, pos.map((p) => [p[0], -p[2]]), edge, tris, shade);
  }

  /** A feathered road along `pts` [[x, z, w?]...] at height y, w metres either side of its line (a
   * point's own w, else `w`), frayed along its sides (and at its ends unless ends === false). Its
   * UVs run along it (u: metres along, v: metres across), so ruts and setts follow the road. */
  ribbon(mat, pts, w, y = 0.02, { ends = true, shade = 1 } = {}) {
    const fmax = mat.userData.feather || 1, n = pts.length;
    const pos = [], edge = [], uv = [], tris = [];
    let along = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], [x, z] = pts[i], wi = pts[i][2] ?? w;
      if (i) along += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const ox = -dz, oz = dx, f = Math.min(fmax, wi * 0.8);
      const e = ends && (i === 0 || i === n - 1) ? 0.5 : 1;   // (an end: half way out, frayed with the rest)
      for (const [k, ev] of [[wi + f, 0], [wi - f, e], [-(wi - f), e], [-(wi + f), 0]]) { pos.push([x + ox * k, y, z + oz * k]); edge.push(ev); uv.push([along, k]); }
    }
    for (let i = 0; i + 1 < n; i++) for (let s = 0; s < 3; s++) {
      const a = i * 4 + s, b = a + 1, c = a + 4, d = a + 5;
      tris.push([a, c, b], [b, c, d]);
    }
    this.edgeMesh(mat, pos, uv, edge, tris, shade);
  }

  /** An axis-aligned box. mats: one material or {top, bottom, side}. Collides unless
   * opts.solid === false. opts.shade darkens it (interiors, undersides). */
  box(min, max, mats, opts = {}) {
    const m = mats.isMaterial ? { top: mats, bottom: mats, side: mats } : mats;
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const sh = opts.shade ?? 1;
    const top = opts.faces?.top !== false, bot = opts.faces?.bottom !== false;
    if (top) this.quad(m.top, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0],
      [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]], sh);
    if (bot) this.quad(m.bottom, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
      [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], sh * 0.8);
    const f = opts.faces || {};
    const s = m.side;
    // UV v runs up the wall from y0 (or a fixed base so stacked walls line up)
    const vb = opts.vbase ?? 0;
    if (f.south !== false) this.quad(s, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
      [[x0, y0 - vb], [x1, y0 - vb], [x1, y1 - vb], [x0, y1 - vb]], sh);
    if (f.north !== false) this.quad(s, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0],
      [[-x1, y0 - vb], [-x0, y0 - vb], [-x0, y1 - vb], [-x1, y1 - vb]], sh);
    if (f.east !== false) this.quad(s, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1],
      [[-z1, y0 - vb], [-z0, y0 - vb], [-z0, y1 - vb], [-z1, y1 - vb]], sh);
    if (f.west !== false) this.quad(s, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0],
      [[z0, y0 - vb], [z1, y0 - vb], [z1, y1 - vb], [z0, y1 - vb]], sh);
    if (opts.solid !== false) this.physics.add(min, max, opts.tag);
  }

  /** A straight wall from (x0, z0) to (x1, z1) (axis-aligned), y0..y1, `thick` metres, with
   * openings [{at (metres from the start), w, y0, y1}] cut out (doors, windows). */
  wall(x0, z0, x1, z1, y0, y1, thick, mat, openings = [], opts = {}) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const dir = alongX ? Math.sign(x1 - x0) : Math.sign(z1 - z0);
    const seg = (a, b, ya, yb) => { // along-wall span a..b (metres from the start), heights ya..yb
      if (b - a < 0.01 || yb - ya < 0.01) return;
      const p = (t) => (alongX ? x0 : z0) + dir * t;
      const lo = Math.min(p(a), p(b)), hi = Math.max(p(a), p(b));
      if (alongX) this.box([lo, ya, z0 - thick / 2], [hi, yb, z0 + thick / 2], mat, { vbase: 0, ...opts });
      else this.box([x0 - thick / 2, ya, lo], [x0 + thick / 2, yb, hi], mat, { vbase: 0, ...opts });
    };
    const ops = [...openings].sort((a, b) => a.at - b.at);
    let cur = 0;
    for (const o of ops) {
      const a = o.at - o.w / 2, b = o.at + o.w / 2;
      seg(cur, a, y0, y1);
      seg(a, b, y0, o.y0 ?? y0);              // below a window
      seg(a, b, o.y1, y1);                     // above the opening
      cur = b;
    }
    seg(cur, len, y0, y1);
  }

  /** A straight axis-aligned wall like wall(), but its holes may sit above one another (a
   * window over a door, an oculus over a lancet): holes [{a0, a1, y0, y1}] in metres along the
   * wall from its start and in height. Built as rows of boxes round the holes. */
  holeyWall(x0, z0, x1, z1, y0, y1, thick, mat, holes, opts = {}) {
    if (opts.thinShadow) { // the stone is drawn but casts no shadow; a thin sheet in its middle
      // plane does, so slanting sun gets through the whole window instead of the reveals
      // swallowing it (and lands where the stained glass shader expects it)
      const { thinShadow, ...rest } = opts;
      void thinShadow;
      this.holeyWall(x0, z0, x1, z1, y0, y1, thick, this.uncast(mat), holes, rest);
      this.holeyWall(x0, z0, x1, z1, y0, y1, 0.1, this.shadowOnly(), holes, { ...rest, solid: false });
      return;
    }
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0), dir = alongX ? Math.sign(x1 - x0) : Math.sign(z1 - z0);
    const as = [...new Set([0, len, ...holes.flatMap((h) => [h.a0, h.a1])])].filter((a) => a >= 0 && a <= len).sort((a, b) => a - b);
    const ys = [...new Set([y0, y1, ...holes.flatMap((h) => [h.y0, h.y1])])].filter((y) => y >= y0 && y <= y1).sort((a, b) => a - b);
    const open = (a, y) => holes.some((h) => a > h.a0 && a < h.a1 && y > h.y0 && y < h.y1);
    for (let j = 0; j + 1 < ys.length; j++) {
      const ym = (ys[j] + ys[j + 1]) / 2;
      let i = 0;
      while (i + 1 < as.length) { // a run of solid cells along this band
        if (open((as[i] + as[i + 1]) / 2, ym)) { i++; continue; }
        let k = i + 1;
        while (k + 1 < as.length && !open((as[k] + as[k + 1]) / 2, ym)) k++;
        const p = (a) => (alongX ? x0 : z0) + dir * a, lo = Math.min(p(as[i]), p(as[k])), hi = Math.max(p(as[i]), p(as[k]));
        if (alongX) this.box([lo, ys[j], z0 - thick / 2], [hi, ys[j + 1], z0 + thick / 2], mat, { vbase: 0, ...opts });
        else this.box([x0 - thick / 2, ys[j], lo], [x0 + thick / 2, ys[j + 1], hi], mat, { vbase: 0, ...opts });
        i = k;
      }
    }
  }

  /** A square floor decal (one of the biome packs' one-off floor tiles: a grate, a memorial
   * brass, a mosaic), `size` metres, flat at height y, centred on (x, z), turned by rot (its
   * top toward -z at 0). mat: an overlay material made with tile = size. */
  decal(mat, x, y, z, size, rot = 0) {
    const c = Math.cos(rot), s = Math.sin(rot), h = size / 2;
    const P = [[-h, h], [h, h], [h, -h], [-h, -h]].map(([u, v]) => [x + u * c + v * s, y, z - u * s + v * c]);
    this.quad(mat, P[0], P[1], P[2], P[3], [[0, 0], [size, 0], [size, size], [0, size]]);
  }

  /** A copy of `mat` that casts no shadow. */
  uncast(mat) {
    this._uncast ??= new Map();
    if (!this._uncast.has(mat)) {
      const m = mat.clone();
      m.userData = { ...mat.userData, noCast: true };
      this._uncast.set(mat, m);
    }
    return this._uncast.get(mat);
  }

  /** A material that is never seen and only casts shadows. */
  shadowOnly() {
    this._shadowOnly ??= Object.assign(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), { userData: { tileU: 1, tileV: 1 } });
    return this._shadowOnly;
  }

  /** A gable roof over the rectangle x0..x1, z0..z1 with the ridge along `ridge` ('x' or 'z'),
   * eaves at y, ridge at y + rise, `over` metres of overhang. Also fills the two gable ends
   * with wall material (if given). Roofs don't collide. */
  gable(x0, z0, x1, z1, y, rise, roofMat, gableMat, ridge = 'x', over = 0.5, shade = 1) {
    const t = 0.12;
    if (ridge === 'x') {
      const zm = (z0 + z1) / 2, X0 = x0 - over, X1 = x1 + over, Z0 = z0 - over, Z1 = z1 + over;
      const ry = y + rise, ey = y - over * rise / ((z1 - z0) / 2);
      const slope = Math.hypot((z1 - z0) / 2 + over, rise + (y - ey));
      // south and north slopes (top faces), UV: across = x, up-slope = metres along the slope
      this.quad(roofMat, [X0, ey, Z1], [X1, ey, Z1], [X1, ry, zm], [X0, ry, zm], [[X0, 0], [X1, 0], [X1, slope], [X0, slope]], shade);
      this.quad(roofMat, [X1, ey, Z0], [X0, ey, Z0], [X0, ry, zm], [X1, ry, zm], [[-X1, 0], [-X0, 0], [-X0, slope], [-X1, slope]], shade);
      // undersides
      this.quad(roofMat, [X1, ey - t, Z1], [X0, ey - t, Z1], [X0, ry - t, zm], [X1, ry - t, zm], [[X1, 0], [X0, 0], [X0, slope], [X1, slope]], shade * 0.55);
      this.quad(roofMat, [X0, ey - t, Z0], [X1, ey - t, Z0], [X1, ry - t, zm], [X0, ry - t, zm], [[X0, 0], [X1, 0], [X1, slope], [X0, slope]], shade * 0.55);
      if (gableMat) for (const [x, s] of [[x0, -1], [x1, 1]]) {
        const tri = s > 0 ? [[x, y, z1], [x, y, z0], [x, ry, zm]] : [[x, y, z0], [x, y, z1], [x, ry, zm]];
        this.mesh(gableMat, tri, tri.map((p) => [s > 0 ? -p[2] : p[2], p[1]]), [[0, 1, 2]], shade);
        const inner = tri.map((p) => [p[0] - s * 0.25, p[1], p[2]]).reverse();
        this.mesh(gableMat, inner, inner.map((p) => [p[2], p[1]]), [[0, 1, 2]], shade * 0.6);
      }
    } else {
      const xm = (x0 + x1) / 2, X0 = x0 - over, X1 = x1 + over, Z0 = z0 - over, Z1 = z1 + over;
      const ry = y + rise, ey = y - over * rise / ((x1 - x0) / 2);
      const slope = Math.hypot((x1 - x0) / 2 + over, rise + (y - ey));
      this.quad(roofMat, [X1, ey, Z1], [X1, ey, Z0], [xm, ry, Z0], [xm, ry, Z1], [[-Z1, 0], [-Z0, 0], [-Z0, slope], [-Z1, slope]], shade);
      this.quad(roofMat, [X0, ey, Z0], [X0, ey, Z1], [xm, ry, Z1], [xm, ry, Z0], [[Z0, 0], [Z1, 0], [Z1, slope], [Z0, slope]], shade);
      this.quad(roofMat, [X1, ey - t, Z0], [X1, ey - t, Z1], [xm, ry - t, Z1], [xm, ry - t, Z0], [[Z0, 0], [Z1, 0], [Z1, slope], [Z0, slope]], shade * 0.55);
      this.quad(roofMat, [X0, ey - t, Z1], [X0, ey - t, Z0], [xm, ry - t, Z0], [xm, ry - t, Z1], [[-Z1, 0], [-Z0, 0], [-Z0, slope], [-Z1, slope]], shade * 0.55);
      if (gableMat) for (const [z, s] of [[z0, -1], [z1, 1]]) {
        const tri = s > 0 ? [[x0, y, z], [x1, y, z], [xm, ry, z]] : [[x1, y, z], [x0, y, z], [xm, ry, z]];
        this.mesh(gableMat, tri, tri.map((p) => [s > 0 ? p[0] : -p[0], p[1]]), [[0, 1, 2]], shade);
        const inner = tri.map((p) => [p[0], p[1], p[2] - s * 0.25]).reverse();
        this.mesh(gableMat, inner, inner.map((p) => [p[0], p[1]]), [[0, 1, 2]], shade * 0.6);
      }
    }
  }

  /** A timber of cross-section w x h from point a to point b at any angle (braces, rafters,
   * barge boards). `up` steers which way its h side faces. Never collides. */
  beam(a, b, w, h, mat, { up = [0, 1, 0], shade = 1, caps = true } = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    if (len < 1e-4) return;
    const d = B.clone().sub(A).divideScalar(len);
    let u = new THREE.Vector3(...up);
    if (Math.abs(u.dot(d)) > 0.95) u = Math.abs(d.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const s = new THREE.Vector3().crossVectors(d, u).normalize().multiplyScalar(w / 2);
    u = new THREE.Vector3().crossVectors(s, d).normalize().multiplyScalar(h / 2);
    const c = (p, i, j) => p.clone().addScaledVector(s, i).addScaledVector(u, j).toArray();
    const corners = [[-1, -1], [-1, 1], [1, 1], [1, -1]]; // wound so every face points out
    const ring0 = corners.map(([i, j]) => c(A, i, j)), ring1 = corners.map(([i, j]) => c(B, i, j));
    const sideLen = [h, w, h, w];
    for (let k = 0; k < 4; k++) { // four long faces, UV u along the timber
      const k1 = (k + 1) % 4;
      this.quad(mat, ring0[k], ring0[k1], ring1[k1], ring1[k], [[0, 0], [sideLen[k], 0], [sideLen[k], len], [0, len]].map(([x, y]) => [y, x]), shade);
    }
    if (caps) {
      this.quad(mat, ring0[3], ring0[2], ring0[1], ring0[0], [[0, h], [w, h], [w, 0], [0, 0]], shade * 0.8);
      this.quad(mat, ring1[0], ring1[1], ring1[2], ring1[3], [[0, 0], [w, 0], [w, h], [0, h]], shade * 0.8);
    }
  }

  /** A cylinder of radius r from a to b with n sides (wheels, posts, bells' shoulders). */
  cylinder(a, b, r, n, mat, { shade = 1, caps = true, r1 = r } = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const d = B.clone().sub(A), len = d.length();
    d.normalize();
    const s = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const e1 = new THREE.Vector3().crossVectors(d, s).normalize(), e2 = new THREE.Vector3().crossVectors(d, e1);
    const ring = (P, R, k) => { const t = (k / n) * Math.PI * 2; return P.clone().addScaledVector(e1, Math.cos(t) * R).addScaledVector(e2, Math.sin(t) * R).toArray(); };
    const circ = 2 * Math.PI * r / n;
    for (let k = 0; k < n; k++) {
      this.quad(mat, ring(A, r, k), ring(A, r, k + 1), ring(B, r1, k + 1), ring(B, r1, k),
        [[k * circ, 0], [(k + 1) * circ, 0], [(k + 1) * circ, len], [k * circ, len]], shade);
      if (caps) {
        this.mesh(mat, [A.toArray(), ring(A, r, k + 1), ring(A, r, k)], [[0, 0], [Math.cos((k + 1) / n * 6.283) * r, Math.sin((k + 1) / n * 6.283) * r], [Math.cos(k / n * 6.283) * r, Math.sin(k / n * 6.283) * r]], [[0, 1, 2]], shade * 0.85);
        if (r1 > 0) this.mesh(mat, [B.toArray(), ring(B, r1, k), ring(B, r1, k + 1)], [[0, 0], [Math.cos(k / n * 6.283) * r1, Math.sin(k / n * 6.283) * r1], [Math.cos((k + 1) / n * 6.283) * r1, Math.sin((k + 1) / n * 6.283) * r1]], [[0, 1, 2]], shade * 0.85);
      }
    }
  }

  /** Triangles straight from positions (flat [x,y,z,...] in threes) with UVs in metres. */
  raw(mat, P, U, shade = 1) {
    const g = new THREE.BufferGeometry();
    const tu = mat.userData.tileU || 1, tv = mat.userData.tileV || 1;
    const uv = new Float32Array(U.length);
    for (let i = 0; i < U.length; i += 2) { uv[i] = U[i] / tu; uv[i + 1] = U[i + 1] / tv; }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(P.length).fill(shade), 3));
    this.push(mat, g);
  }

  /** A shape turned on a lathe about the vertical through (x, z): profile [[radius, y], ...]
   * from the bottom up (urns, bells, basins, bowls). */
  lathe(x, z, profile, n, mat, { shade = 1, y = 0 } = {}) {
    const P = [], U = [];
    let along = 0;
    for (let i = 0; i + 1 < profile.length; i++) {
      const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
      const seg = Math.hypot(r1 - r0, y1 - y0);
      for (let k = 0; k < n; k++) {
        const t0 = (k / n) * Math.PI * 2, t1 = ((k + 1) / n) * Math.PI * 2;
        const p = (r, yy, t) => [x - r * Math.sin(t), y + yy, z - r * Math.cos(t)];
        const a = p(r0, y0, t0), b = p(r0, y0, t1), c = p(r1, y1, t1), d = p(r1, y1, t0);
        const u0 = k * 2 * Math.PI * Math.max(r0, r1) / n, u1 = u0 + 2 * Math.PI * Math.max(r0, r1) / n;
        P.push(...a, ...b, ...c, ...a, ...c, ...d);
        U.push(u0, along, u1, along, u1, along + seg, u0, along, u1, along + seg, u0, along + seg);
      }
      along += seg;
    }
    this.raw(mat, P, U, shade);
  }

  /** A lumpy closed blob (rocks, heads, sacks, bones): a jittered icosphere of radii (rx, ry,
   * rz) centred at c, flattened below `floor` if given. UVs are projected per face. */
  blob(c, [rx, ry, rz], mat, { detail = 1, jitter = 0.18, seed = 1, shade = 1, floor = null } = {}) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const pos = g.attributes.position.array;
    const hash = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.13) * 43758.5453; return s - Math.floor(s); };
    const P = new Array(pos.length), U = [];
    for (let i = 0; i < pos.length; i += 3) {
      const vx = pos[i], vy = pos[i + 1], vz = pos[i + 2];
      const k = 1 + (hash(Math.round(vx * 100), Math.round(vy * 100), Math.round(vz * 100)) - 0.5) * 2 * jitter;
      P[i] = c[0] + vx * rx * k; P[i + 1] = c[1] + vy * ry * k; P[i + 2] = c[2] + vz * rz * k;
      if (floor != null && P[i + 1] < floor) P[i + 1] = floor;
    }
    for (let i = 0; i < P.length; i += 9) { // project each face onto its dominant plane
      const ax = P[i + 3] - P[i], ay = P[i + 4] - P[i + 1], az = P[i + 5] - P[i + 2];
      const bx = P[i + 6] - P[i], by = P[i + 7] - P[i + 1], bz = P[i + 8] - P[i + 2];
      const nx = Math.abs(ay * bz - az * by), ny = Math.abs(az * bx - ax * bz), nz = Math.abs(ax * by - ay * bx);
      for (let j = 0; j < 9; j += 3) {
        const x = P[i + j], y = P[i + j + 1], z = P[i + j + 2];
        if (ny >= nx && ny >= nz) U.push(x, z); else if (nx >= nz) U.push(z, y); else U.push(x, y);
      }
    }
    g.dispose();
    this.raw(mat, P, U, shade);
  }

  /** Build a model in its own space and set it down at (x, y, z), turned `rot` about the
   * vertical and scaled. fn(sub) builds with a builder whose geometry lands there; the whole
   * model gets one collider, its turned bounding box shrunk a little (unless solid: false). */
  place(x, y, z, rot, scale, fn, { solid = true, tag = 'prop', minHeight = 0.45 } = {}) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(scale, scale, scale));
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const sub = Object.create(Builder.prototype);
    sub.physics = { add() {} };
    sub.push = (mat, geo) => {
      geo.applyMatrix4(m);
      geo.computeBoundingBox();
      lo.min(geo.boundingBox.min); hi.max(geo.boundingBox.max);
      this.push(mat, geo);
    };
    fn(sub);
    if (solid && isFinite(lo.x) && hi.y - lo.y > minHeight) {
      const sx = (hi.x - lo.x) * 0.12, sz = (hi.z - lo.z) * 0.12;
      this.physics.add([lo.x + sx, lo.y, lo.z + sz], [hi.x - sx, hi.y, hi.z - sz], tag);
    }
    return { min: lo, max: hi };
  }

  /** An n-sided cone (spires, tower roofs) centred at (x, z), base radius r at y, apex at
   * y + h. */
  cone(x, z, r, y, h, n, mat, shade = 1) {
    const pos = [], uv = [], tris = [];
    const slant = Math.hypot(r, h);
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const i = pos.length;
      pos.push([x + r * Math.cos(a0), y, z + r * Math.sin(a0)], [x + r * Math.cos(a1), y, z + r * Math.sin(a1)], [x, y + h, z]);
      const w = 2 * r * Math.sin(Math.PI / n);
      uv.push([0, 0], [w, 0], [w / 2, slant]);
      tris.push([i, i + 2, i + 1]);
    }
    this.mesh(mat, pos, uv, tris, shade);
  }

  /** An n-sided prism wall ring (towers): radius r, y0..y1, solid. */
  ring(x, z, r, y0, y1, n, mat, opts = {}) {
    const side = 2 * r * Math.sin(Math.PI / n);
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const p0 = [x + r * Math.cos(a0), z + r * Math.sin(a0)], p1 = [x + r * Math.cos(a1), z + r * Math.sin(a1)];
      if (opts.door === k) continue;
      this.quad(mat, [p1[0], y0, p1[1]], [p0[0], y0, p0[1]], [p0[0], y1, p0[1]], [p1[0], y1, p1[1]],
        [[k * side, y0], [(k + 1) * side, y0], [(k + 1) * side, y1], [k * side, y1]].map(([u, v]) => [-u, v]), opts.shade ?? 1);
      this.quad(mat, [p0[0] * 0.94 + x * 0.06, y0, p0[1] * 0.94 + z * 0.06], [p1[0] * 0.94 + x * 0.06, y0, p1[1] * 0.94 + z * 0.06],
        [p1[0] * 0.94 + x * 0.06, y1, p1[1] * 0.94 + z * 0.06], [p0[0] * 0.94 + x * 0.06, y1, p0[1] * 0.94 + z * 0.06],
        [[k * side, y0], [(k + 1) * side, y0], [(k + 1) * side, y1], [k * side, y1]], (opts.shade ?? 1) * 0.6);
      const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2;
      const hw = side / 2 + 0.2;
      this.physics.add([Math.min(p0[0], p1[0]) - 0.15, y0, Math.min(p0[1], p1[1]) - 0.15],
        [Math.max(p0[0], p1[0]) + 0.15, y1, Math.max(p0[1], p1[1]) + 0.15]);
      void mx; void mz; void hw;
    }
  }

  /** Stairs climbing from (x, y0, z0) along `dir` ('+z', '-z', '+x', '-x'), `width`, `rise`
   * metres total, steps of `step` height and `run` depth. Each step is a solid box. */
  stairs(x, z, y0, rise, width, dir, mat, { step = 0.25, run = 0.36, shade = 1 } = {}) {
    const n = Math.round(Math.abs(rise) / step);
    const sgn = Math.sign(rise);
    for (let i = 0; i < n; i++) {
      const top = y0 + sgn * (i + 1) * step;
      const lo = Math.min(top, y0) - (sgn < 0 ? 0 : 0);
      const a = i * run, b = (i + 1) * run;
      // a descending flight: each step's top is `top`, filled down to well below
      const yb = sgn > 0 ? y0 : top - 0.6;
      let min, max;
      if (dir === '+z') { min = [x - width / 2, yb, z + a]; max = [x + width / 2, top, z + b]; }
      else if (dir === '-z') { min = [x - width / 2, yb, z - b]; max = [x + width / 2, top, z - a]; }
      else if (dir === '+x') { min = [x + a, yb, z - width / 2]; max = [x + b, top, z + width / 2]; }
      else { min = [x - b, yb, z - width / 2]; max = [x - a, top, z + width / 2]; }
      void lo;
      this.box(min, max, mat, { shade });
    }
    return n * run;
  }

  /** Merge every batch into one mesh per material and chunk, and add them to `scene`. Every
   * mesh receives shadows; all but the ground (userData.noCast) cast them. */
  finish(scene) {
    const meshes = [];
    for (const [mat, chunks] of this.batches) {
      mat.vertexColors = true;
      for (const geos of chunks.values()) {
        let g = mergeGeometries(geos, false);
        if (mat.userData.feather) {   // a feathered overlay: its solid middle drawn without blending
          const [band, solid] = splitFeather(g);
          if (solid) meshes.push(this.addMesh(scene, solid, solidTwin(mat), -1000.5 + layerOf(solid)));
          if (!band) continue;
          g = band;
        }
        g.computeBoundingSphere();
        const mesh = new THREE.Mesh(g, mat);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = !mat.userData.noCast;
        mesh.receiveShadow = true;
        // feathered overlays blend over the ground (and over each other, the higher laid last)
        if (mat.userData.feather) mesh.renderOrder = -1000 + layerOf(g);
        scene.add(mesh);
        meshes.push(mesh);
      }
    }
    this.batches.clear();
    return meshes;
  }

  addMesh(scene, g, mat, renderOrder = 0) {
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = renderOrder;
    scene.add(mesh);
    return mesh;
  }
}

/** Where a feathered overlay was laid, as an order: how far above its ground (the builders lay the
 * higher overlays a few millimetres up), in thousandths. */
function layerOf(g) {
  g.computeBoundingBox();
  return Math.round(((g.boundingBox.min.y % 1) + 1) % 1 * 1000);
}

/** A feathered overlay's triangles split into its band (where its edge frays: blended) and its solid
 * middle (all edge 1: drawn whole). Returns [band, solid] (either may be null). */
function splitFeather(g) {
  const e = g.attributes.edge.array, n = e.length / 3;
  const keep = [[], []];
  for (let t = 0; t < n; t++) keep[e[t * 3] > 0.999 && e[t * 3 + 1] > 0.999 && e[t * 3 + 2] > 0.999 ? 1 : 0].push(t);
  return keep.map((tris) => {
    if (!tris.length) return null;
    const out = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(g.attributes)) {
      const w = a.itemSize, src = a.array, dst = new src.constructor(tris.length * 3 * w);
      tris.forEach((t, i) => dst.set(src.subarray(t * 3 * w, (t + 1) * 3 * w), i * 3 * w));
      out.setAttribute(k, new THREE.BufferAttribute(dst, w));
    }
    return out;
  });
}

/** The solid middle's material: the overlay's own, unblended and writing no depth, drawn in turn with
 * the frayed bands after everything solid (renderOrder: each layer's middle just before its band,
 * the higher-laid after the lower, so a plaza covers the roads' frayed edges under it). */
function solidTwin(m) {
  if (!m.userData.solid) {
    const s = m.clone();
    s.defines = { ...(m.defines || {}) };   // (clone() leaves them behind)
    s.transparent = true; s.blending = THREE.NoBlending; s.depthWrite = false;
    s.onBeforeCompile = m.onBeforeCompile; s.customProgramCacheKey = m.customProgramCacheKey;
    s.userData = { ...m.userData, solid: null };
    m.userData.solid = s;
  }
  return m.userData.solid;
}
