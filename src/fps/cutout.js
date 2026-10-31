// Arches and gateways from the biome packs' flat elevations (assets/textures/biome/arches,
// front and back, with alpha): built as solid 3D pieces. The two faces are the paintings cut
// to their silhouettes (alpha test); between them the silhouette is extruded, pixel edge by
// pixel edge, each side face coloured by the painting's own edge pixels, so from any angle it
// reads as carved masonry (or timber) rather than a cardboard cut-out. Colliders stand where
// the piers meet the ground.
import * as THREE from 'three';

export class Cutouts {
  constructor(ctx) {
    this.ctx = ctx;
    this.masks = new Map();
    this.mats = new Map();
    this.placed = [];
  }

  /** Read every arch's silhouette (the front painting's alpha). */
  async load() {
    const arches = [...this.ctx.lib.biome.arches.values()];
    await Promise.all(arches.map(async (a) => {
      const img = await new THREE.ImageLoader().loadAsync('assets/textures/' + a.front);
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const m = new Uint8Array(img.width * img.height);
      for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
      this.masks.set(a.id, { w: img.width, h: img.height, m });
    }));
    return this;
  }

  materials(a) {
    if (this.mats.has(a.id)) return this.mats.get(a.id);
    const lib = this.ctx.lib;
    const tex = (f) => { const t = lib.texture(f, false); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
    const face = (f) => {
      const m = new THREE.MeshPhongMaterial({ map: tex(f), alphaTest: 0.5, specular: 0x121110, shininess: 12 });
      if (lib.normals) { m.normalMap = lib.normalMap(f, 1.4); m.normalScale.set(1, 1); }
      return m;
    };
    const out = { front: face(a.front), back: face(a.back), sides: new THREE.MeshPhongMaterial({ map: tex(a.front), specular: 0x121110, shininess: 12 }) };
    this.mats.set(a.id, out);
    return out;
  }

  /**
   * Stand arch `id` with the middle of its foot at (x, y, z) and its front facing `facing`
   * (radians about y; 0 faces +z), sized so its opening is `open` metres wide; `thick` deep.
   * `tag` is its colliders' ('wall' for an arch or gateway in a wall or fence: its piers stand
   * beside the way through it, and are the building's, not things in the way).
   * Returns its size: {width, height, opening: [width, height]} in metres.
   */
  place(id, x, y, z, facing, open, thick = 0.6, tag = 'solid') {
    const a = this.ctx.lib.biome.arches.get(id), mk = this.masks.get(id);
    if (!a || !mk) { console.warn('no arch', id); return null; }
    const { w: W, h: H, m } = mk;
    const s = open / (a.opening_px[1] - a.opening_px[0]); // metres per pixel
    const foot = a.foot_px;
    const solid = (c, r) => c >= 0 && c < W && r >= 0 && r < H && m[r * W + c] === 1;
    const X = (c) => (c - W / 2) * s, Y = (r) => (foot - r) * s, T = thick / 2;
    const U = (c) => (c + 0.5) / W, V = (r) => 1 - (r + 0.5) / H; // pixel centres (flipY)
    // the two painted faces
    const faces = new THREE.BufferGeometry();
    faces.setAttribute('position', new THREE.Float32BufferAttribute([
      X(0), Y(H), T, X(W), Y(H), T, X(W), Y(0), T, X(0), Y(0), T,
      X(W), Y(H), -T, X(0), Y(H), -T, X(0), Y(0), -T, X(W), Y(0), -T], 3));
    faces.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
    faces.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
    faces.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    faces.addGroup(0, 6, 0); faces.addGroup(6, 6, 1);
    // the extruded silhouette: a face on every pixel edge between solid and clear, merged
    // into runs, each run showing the strip of edge pixels it borders
    const P = [], N = [], UV = [];
    const quad = (pts, n, uvs) => {
      const [p0, p1, p2] = pts, e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const order = c[0] * n[0] + c[1] * n[1] + c[2] * n[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const i of order) { P.push(...pts[i]); N.push(...n); UV.push(...uvs[i]); }
    };
    for (let c = 0; c <= W; c++) { // vertical edges between columns c-1 and c
      let r = 0;
      while (r < H) {
        const l = solid(c - 1, r), rt = solid(c, r);
        if (l === rt) { r++; continue; }
        let e = r;
        while (e + 1 < H && solid(c - 1, e + 1) === l && solid(c, e + 1) === rt) e++;
        const col = l ? c - 1 : c, n = [l ? 1 : -1, 0, 0], x = X(c);
        quad([[x, Y(e + 1), -T], [x, Y(e + 1), T], [x, Y(r), T], [x, Y(r), -T]], n,
          [[U(col), V(e)], [U(col), V(e)], [U(col), V(r)], [U(col), V(r)]]);
        r = e + 1;
      }
    }
    for (let r = 0; r <= H; r++) { // horizontal edges between rows r-1 (above) and r
      let c = 0;
      while (c < W) {
        const up = solid(c, r - 1), dn = solid(c, r);
        if (up === dn) { c++; continue; }
        let e = c;
        while (e + 1 < W && solid(e + 1, r - 1) === up && solid(e + 1, r) === dn) e++;
        const row = up ? r - 1 : r, n = [0, up ? -1 : 1, 0], y = Y(r);
        quad([[X(c), y, -T], [X(e + 1), y, -T], [X(e + 1), y, T], [X(c), y, T]], n,
          [[U(c), V(row)], [U(e), V(row)], [U(e), V(row)], [U(c), V(row)]]);
        c = e + 1;
      }
    }
    const sides = new THREE.BufferGeometry();
    sides.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    sides.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    sides.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    const mats = this.materials(a);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(faces, [mats.front, mats.back]), new THREE.Mesh(sides, mats.sides));
    g.position.set(x, y, z);
    g.rotation.y = facing;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    g.updateMatrixWorld(true);
    this.ctx.scene.add(g);
    // colliders: each run of masonry along the foot, up as far as it stands solid
    const rb = foot - 1;
    let c = 0;
    while (c < W) {
      if (!solid(c, rb)) { c++; continue; }
      let e = c;
      while (e + 1 < W && solid(e + 1, rb)) e++;
      let top = rb;
      for (;;) {
        let all = true;
        for (let k = c; k <= e && all; k++) if (!solid(k, top - 1)) all = false;
        if (!all || top <= 0) break;
        top--;
      }
      const box = new THREE.Box3(new THREE.Vector3(X(c), 0, -T), new THREE.Vector3(X(e + 1), Y(top), T)).applyMatrix4(g.matrixWorld);
      this.ctx.physics.add(box.min.toArray(), box.max.toArray(), tag);
      c = e + 1;
    }
    const size = { width: W * s, height: foot * s, opening: [open, a.opening_px[2] * s], group: g };
    this.placed.push({ id, ...size });
    return size;
  }
}
