// The green star's broken heart: crystal burst up out of the crater where it struck. Each is a spire
// blazing from inside (hot), wrapped in jagged chunks of the star's own glass (art/crater/crystal_green.webp,
// tools/world/import_crater.py), the light showing through the gaps between them and crawling up the veins
// in them. A crown of great ones stands round where you wake, two colossal enough to show over the rim
// from the town; lesser clusters break through the floor and the walls, a few were flung past the rim, and
// splinters hang in the air over the heart, turning. Built here, no models; all of it only there once the
// star has come down (withCrater).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { WEBGPU, T, settled, keyed } from './nodes.js';
import { CRATER, craterHeight, paintTex, withCrater, glowPoints, glowTex } from './crater.js';

const TAU = Math.PI * 2;
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const UP = new THREE.Vector3(0, 1, 0);

/** A convex hull's facets given their own patch of the texture (each flat face its own, so they catch
 * different veins) and their own brightness (so the unlit spires still read as cut faces). */
function faceted(points, seed, tile) {
  const g = new ConvexGeometry(points), P = g.attributes.position, n = new THREE.Vector3();
  const R = rng(seed), uv = new Float32Array(P.count * 2), col = new Float32Array(P.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  const faces = new Map();
  for (let t = 0; t < P.count; t += 3) {
    a.fromBufferAttribute(P, t); b.fromBufferAttribute(P, t + 1); c.fromBufferAttribute(P, t + 2);
    n.subVectors(b, a).cross(t1.subVectors(c, a)).normalize();
    const key = `${Math.round(n.x * 12)},${Math.round(n.y * 12)},${Math.round(n.z * 12)}`;
    if (!faces.has(key)) faces.set(key, [R(), R(), 0.6 + R() * 0.65]);
    const [ox, oy, lit] = faces.get(key);
    t1.crossVectors(n, Math.abs(n.y) < 0.9 ? UP : t2.set(1, 0, 0)).normalize();
    t2.crossVectors(n, t1);
    for (let i = 0; i < 3; i++) {
      const v = i === 0 ? a : i === 1 ? b : c, j = t + i;
      uv[j * 2] = v.dot(t1) * tile / 1.5 + ox; uv[j * 2 + 1] = v.dot(t2) * tile + oy;   // (the texture's 3:2)
      col[j * 3] = col[j * 3 + 1] = col[j * 3 + 2] = lit;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A crystal: `width` across at its foot for each 1 of height, a many-sided prism narrowing to a point
 * set off to one side. */
function spireShape(seed, sides, width) {
  const R = rng(seed), pts = [], turn = R() * TAU;
  for (const [y, r] of [[-0.12, 1], [0.38, 0.92], [0.64, 0.74], [0.8, 0.44]]) {
    for (let i = 0; i < sides; i++) {
      const a = turn + (i + (R() - 0.5) * 0.3) / sides * TAU, k = r * width * (0.9 + R() * 0.2);
      pts.push(new THREE.Vector3(Math.cos(a) * k, y + (R() - 0.5) * 0.05, Math.sin(a) * k));
    }
  }
  pts.push(new THREE.Vector3(width * 0.2 * (R() - 0.5), 1, width * 0.2 * (R() - 0.5)));
  return faceted(pts, seed + 1, 2.2);
}

/** A chunk of the glass: an irregular cut lump, stretched by `shape` (y along the crystal, z out from it). */
function chunkShape(seed, shape, points = 13) {
  const R = rng(seed), pts = [];
  for (let i = 0; i < points; i++) {
    const u = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - u * u), k = 0.62 + R() * 0.45;
    pts.push(new THREE.Vector3(s * Math.cos(a) * k * shape[0], u * k * shape[1], s * Math.sin(a) * k * shape[2]));
  }
  return faceted(pts, seed + 1, 0.8);
}

const SPIRES = [[9011, 6, 0.17], [9127, 5, 0.13], [9241, 7, 0.21]].map(([seed, sides, width]) => ({ seed, sides, width }));
const CHUNKS = [[4231, [0.62, 1, 0.3]], [4463, [0.7, 0.72, 0.42]], [4787, [0.34, 1.3, 0.34]], [5011, [0.85, 0.58, 0.28]], [5273, [0.5, 0.9, 0.5]]];

export class StarCrystals {
  /** ctx: the world. keep(x, z, r): may a thing of radius r stand here? (main.js craterStoneMayLie) */
  constructor(ctx, keep = () => true, touch = false) {
    this.ctx = ctx; this.keep = keep; this.touch = touch;
    this.group = new THREE.Group();
    this.group.name = 'starCrystals';
    this.spires = SPIRES.map(() => []);    // [matrix, tint]
    this.chunks = CHUNKS.map(() => []);
    this.halos = [];                       // [x, y, z, how strong, phase]
    this.pools = [];                       // [x, z, radius]: the glow on the ground round them
    this.boxes = [];
    this.lay();
    this.build();
    ctx.scene.add(this.group);
    withCrater(this.group);
  }

  /** A crystal of height h, foot at (x, z), leaning `lean` toward angle `dir`. Its chunks go on with it. */
  grow(x, z, h, lean, dir, R) {
    const v = Math.floor(R() * SPIRES.length), width = SPIRES[v].width;
    const y0 = this.groundAt(x, z);
    const axis = new THREE.Vector3(Math.sin(lean) * Math.cos(dir), Math.cos(lean), Math.sin(lean) * Math.sin(dir)).normalize();
    const e1 = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
    const e2 = new THREE.Vector3().crossVectors(axis, e1);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, axis).multiply(new THREE.Quaternion().setFromAxisAngle(UP, R() * TAU));
    const foot = new THREE.Vector3(x, y0 - 0.1, z);
    this.spires[v].push([new THREE.Matrix4().compose(foot, q, new THREE.Vector3(h, h, h)), 0.82 + R() * 0.3]);
    // the chunks: thick at the foot, thinning up it, the tip left bare to blaze
    const n = Math.min(this.touch ? 14 : 28, Math.round((this.touch ? 6 : 10) + h * (this.touch ? 1.8 : 3.4)));
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), xa = new THREE.Vector3(), ya = new THREE.Vector3(), za = new THREE.Vector3(), s = new THREE.Vector3();
    const q2 = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const t = R() ** 1.2 * 0.8, a = i * 2.399 + R() * 0.7;
      const taper = t < 0.38 ? 1 - t * 0.2 : t < 0.64 ? 0.92 - (t - 0.38) * 0.7 : 0.74 - (t - 0.64) * 1.8;
      const rad = za.copy(e1).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a)).clone();
      p.copy(foot).addScaledVector(axis, t * h).addScaledVector(rad, width * h * taper * 0.86);
      // along the crystal, splayed out from it (more at the foot, as if it burst up through them)
      ya.copy(axis).addScaledVector(rad, (0.5 - t * 0.5) * R() + 0.05).addScaledVector(e1, (R() - 0.5) * 0.42).addScaledVector(e2, (R() - 0.5) * 0.42).normalize();
      xa.crossVectors(ya, rad).normalize();
      za.crossVectors(xa, ya);
      const size = Math.max(0.12, h * (0.17 + R() * 0.16) * (1 - t * 0.62));
      m.makeBasis(xa, ya, za);
      q2.setFromRotationMatrix(m);
      this.chunks[Math.floor(R() * CHUNKS.length)].push([new THREE.Matrix4().compose(p, q2, s.setScalar(size)), 0.8 + R() * 0.4]);
    }
    this.halos.push([foot.x + axis.x * h * 0.6, foot.y + axis.y * h * 0.6, foot.z + axis.z * h * 0.6, Math.min(1, 0.35 + h * 0.1), R() * TAU]);
    if (h > 1.6) {
      const w = width * h * 1.2, cx = x + axis.x * h * 0.22, cz = z + axis.z * h * 0.22;
      this.boxes.push(this.ctx.physics.add([cx - w, y0 - 1, cz - w], [cx + w, y0 + h * 0.74, cz + w], 'prop'));
    }
    return width * h;
  }

  groundAt(x, z) {
    return Math.hypot(x - CRATER.x, z - CRATER.z) < CRATER.reach ? craterHeight(x, z) : this.ctx.physics.groundAt(x, z);
  }

  /** Where they all stand. */
  lay() {
    const R = rng(52711), { x: cx, z: cz } = CRATER;
    // the crown round where you wake (each as near as the keep allows, the way up to Wren left open),
    // and the two colossi behind it, tall enough to clear the rim
    for (let i = 0; i < 13; i++) {
      const dir = (i + (R() - 0.5) * 0.5) / 13 * TAU, h = 3.4 + (i % 3 === 0 ? 3.4 : 1.2) * (0.5 + R() * 0.7), r = h * 0.17;
      const d = 3.7 + r + R() * 1.5, x = cx + Math.cos(dir) * d, z = cz + Math.sin(dir) * d;
      if (this.keep(x, z, r * 1.2)) { this.grow(x, z, h, 0.2 + R() * 0.32, dir, R); this.pools.push([x, z, 2 + h * 0.5]); }
    }
    for (const [dir, d, h] of [[3.75, 8.4, 10.5], [1.95, 8.8, 9.2]]) {
      const x = cx + Math.cos(dir) * d, z = cz + Math.sin(dir) * d;
      if (!this.keep(x, z, h * 0.2)) continue;
      this.grow(x, z, h, 0.16, dir, R); this.pools.push([x, z, 2.5 + h * 0.5]);
      for (let k = 0; k < 4; k++) {   // (their brood at the foot)
        const a = R() * TAU, far = h * 0.2 + 0.6 + R() * 1.2, px = x + Math.cos(a) * far, pz = z + Math.sin(a) * far;
        this.grow(px, pz, 1.8 + R() * 2.6, 0.25 + R() * 0.35, a, R);
      }
    }
    // the floor and the walls: clusters breaking through
    for (let c = 0, tries = 0; c < (this.touch ? 8 : 12) && tries < 80; tries++) {
      const dir = R() * TAU, d = 9 + R() * 11, x = cx + Math.cos(dir) * d, z = cz + Math.sin(dir) * d;
      if (!this.keep(x, z, 1.4)) continue;
      const n = 3 + Math.floor(R() * 3), big = 1.4 + R() * 2.2;
      for (let k = 0; k < n; k++) {
        const a = R() * TAU, far = k ? 0.5 + R() * 1.1 : 0, px = x + Math.cos(a) * far, pz = z + Math.sin(a) * far;
        this.grow(px, pz, big * (k ? 0.45 + R() * 0.5 : 1), 0.12 + R() * 0.42, k ? a : dir, R);
      }
      this.pools.push([x, z, 1.6 + big * 0.7]);
      c++;
    }
    // flung past the rim
    const { physics } = this.ctx, clear = this.ctx.craterRocks?.offRoads || (() => true);
    for (let c = 0, tries = 0; c < 6 && tries < 60; tries++) {
      const dir = R() * TAU, d = CRATER.reach + 1 + R() * 20, x = cx + Math.cos(dir) * d, z = cz + Math.sin(dir) * d;
      if (!this.keep(x, z, 1.6) || !clear(x, z, 2.5) || [...physics.near(x - 2.5, z - 2.5, x + 2.5, z + 2.5)].length) continue;
      const n = 2 + Math.floor(R() * 2), big = 1 + R() * 1.3;
      for (let k = 0; k < n; k++) {
        const a = R() * TAU, far = k ? 0.4 + R() * 0.7 : 0;
        this.grow(x + Math.cos(a) * far, z + Math.sin(a) * far, big * (k ? 0.5 + R() * 0.4 : 1), 0.35 + R() * 0.4, dir, R);   // (still leaning the way they flew)
      }
      this.pools.push([x, z, 1.4 + big * 0.7]);
      c++;
    }
  }

  build() {
    const mirror = (t) => { t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; return t; };
    const map = mirror(paintTex('crystal.webp')), veins = mirror(paintTex('crystal_glow.webp', false));
    this.hot = new THREE.MeshBasicMaterial({ map, vertexColors: true, toneMapped: false });
    this.shell = this.shellMaterial(map, veins);
    const put = (geo, list, mat, shadow) => {
      if (!list.length) return null;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length), c = new THREE.Color();
      list.forEach(([m, tint], i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.setRGB(tint, tint, tint)); });
      mesh.castShadow = shadow; mesh.receiveShadow = mat === this.shell;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      return mesh;
    };
    SPIRES.forEach((o, i) => put(spireShape(o.seed, o.sides, o.width), this.spires[i], this.hot, true));
    CHUNKS.forEach(([seed, shape], i) => put(chunkShape(seed, shape), this.chunks[i], this.shell, true));
    this.spires = this.chunks = null;
    this.splinters();
    this.lights();
  }

  /** The chunks: lit like stone, the veins in them burning, with more veins seen deeper in (read off the
   * same map, shifted by the angle you look in at), a pulse of light climbing every crystal, and the
   * edges of each facet catching green as they turn from you. */
  shellMaterial(map, veins) {
    const mat = new THREE.MeshPhongMaterial({ map, color: 0x6a8a70, vertexColors: true, specular: 0xb8ffd0, shininess: 90 });
    this.gTime = WEBGPU ? T.uniform(0).setGroup(T.renderGroup) : { value: 0 };
    if (WEBGPU) {
      const { texture, uv, vec3, float, pow, sin, clamp, dot, normalView, positionView, positionWorld } = T;
      const V = positionView.negate().normalize(), rim = pow(float(1).sub(clamp(dot(normalView, V), 0, 1)), 2.5);
      const vein = texture(veins, uv()).r, deep = texture(veins, uv().sub(V.xy.mul(0.14))).r;
      const wave = pow(sin(positionWorld.y.mul(1.7).sub(this.gTime.mul(2.4)).add(deep.mul(5))).mul(0.5).add(0.5), 3);
      mat.emissiveNode = settled(vec3(0.06, 1, 0.16).mul(vein.mul(wave.mul(2.6).add(0.75)).add(deep.mul(0.22)).add(rim.mul(0.3))));
      return keyed(mat, 'crystalShell');
    }
    mat.emissiveMap = veins;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.gTime = this.gTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCrystalY;')
        .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 crystalAt = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          crystalAt = instanceMatrix * crystalAt;
        #endif
        vCrystalY = (modelMatrix * crystalAt).y;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float gTime;\nvarying float vCrystalY;')
        .replace('#include <emissivemap_fragment>', `
        vec3 crystalV = normalize(vViewPosition);
        float crystalRim = pow(1.0 - clamp(dot(normal, crystalV), 0.0, 1.0), 2.5);
        float crystalVein = texture2D(emissiveMap, vEmissiveMapUv).r, crystalDeep = texture2D(emissiveMap, vEmissiveMapUv - crystalV.xy * 0.14).r;
        float crystalWave = pow(0.5 + 0.5 * sin(vCrystalY * 1.7 - gTime * 2.4 + crystalDeep * 5.0), 3.0);
        totalEmissiveRadiance += vec3(0.06, 1.0, 0.16) * (crystalVein * (0.75 + 2.6 * crystalWave) + crystalDeep * 0.22 + crystalRim * 0.3);`);
    };
    return keyed(mat, 'crystalShell');
  }

  /** Splinters hanging in the air over the heart, turning. */
  splinters() {
    const R = rng(33179), n = this.touch ? 16 : 34, { x: cx, z: cz } = CRATER;
    this.floats = Array.from({ length: n }, () => {
      const r = 2.2 + R() * 8;
      return { r, a: R() * TAU, w: (0.05 + R() * 0.14) * (R() < 0.5 ? -1 : 1), y: craterHeight(cx + r * 0.7, cz) + 1 + R() * 5.5, ph: R() * TAU, s: 0.1 + R() * R() * 0.5 };
    });
    this.floaters = new THREE.InstancedMesh(chunkShape(6101, [0.32, 1.25, 0.32], 9), this.hot, n);
    this.floaters.frustumCulled = false;
    this.floaters.castShadow = false;
    this.group.add(this.floaters);
    this.placeSplinters(0);
  }

  placeSplinters(t) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    this.floats.forEach((f, i) => {
      const a = f.a + t * f.w;
      p.set(CRATER.x + Math.cos(a) * f.r, f.y + Math.sin(t * 0.7 + f.ph) * 0.4, CRATER.z + Math.sin(a) * f.r);
      e.set(t * 0.3 + f.ph, t * 0.5 * Math.sign(f.w) + f.ph * 2, 0.4 + Math.sin(t * 0.4 + f.ph) * 0.4);
      this.floaters.setMatrixAt(i, m.compose(p, q.setFromEuler(e), s.setScalar(f.s)));
    });
    this.floaters.instanceMatrix.needsUpdate = true;
  }

  /** The glow they give: soft light hanging round each, and pooled on the ground under them. */
  lights() {
    const N = this.halos.length, P = new Float32Array(N * 3), C = new Float32Array(N * 3);
    this.halos.forEach(([x, y, z], i) => { P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    this.haze = glowPoints(geo, 5.5);
    this.haze.frustumCulled = false;
    this.group.add(this.haze);
    this.pulse(0);
    // the pools: a little grid over the ground for each, one mesh
    const Q = [], U = [], STEPS = 7;
    for (const [x, z, r] of this.pools) {
      const at = (i, k) => {
        const px = x + (i / STEPS * 2 - 1) * r, pz = z + (k / STEPS * 2 - 1) * r;
        Q.push(px, this.groundAt(px, pz) + 0.06, pz); U.push(i / STEPS, k / STEPS);
      };
      for (let k = 0; k < STEPS; k++) for (let i = 0; i < STEPS; i++) { at(i, k + 1); at(i + 1, k + 1); at(i + 1, k); at(i, k + 1); at(i + 1, k); at(i, k); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(Q, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.computeBoundingSphere();
    this.poolMat = new THREE.MeshBasicMaterial({ map: glowTex(), color: new THREE.Color(0.03, 0.32, 0.09), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.group.add(new THREE.Mesh(g, this.poolMat));
    this.pools = null;
  }

  pulse(t) {
    const C = this.haze.geometry.attributes.color;
    this.halos.forEach(([, , , k, ph], i) => {
      const f = k * (0.1 + 0.05 * Math.sin(t * 1.3 + ph));
      C.setXYZ(i, 0.06 * f, f, 0.18 * f);
    });
    C.needsUpdate = true;
  }

  update(dt, t, camera) {
    if (!CRATER.k) return;
    const d = Math.hypot(camera.position.x - CRATER.x, camera.position.z - CRATER.z);
    this.group.visible = d < 320;
    if (d > 120) return;
    this.gTime.value = t;
    const beat = 0.84 + 0.2 * Math.sin(t * 1.15) ** 2 + 0.05 * Math.sin(t * 5.3);   // (the heart of it, slow)
    this.hot.color.setRGB(0.7 * beat, 2.5 * beat, 0.5 * beat);
    this.poolMat.color.setRGB(0.03 * beat, 0.32 * beat, 0.09 * beat);
    this.placeSplinters(t);
    this.pulse(t);
  }
}
