// 3D trees from VectorClad's bark and leaves: ten species (oak, maple, beech, elm, mixed
// forest, mossy, laurel, pine, cedar, redwood), a few generated variants of each with a
// tapering trunk, branches and canopies of cut-out leaf cards. Every placement of a variant is
// an instance, so hundreds of trees are a handful of draw calls; they cast shadows (the cards
// are alpha-tested) and their leaves move in the wind.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder } from './geo.js';
import { WEBGPU, T } from './nodes.js';

const BROAD = { // trunk height, trunk radius, branches, branch length, branch lift (0 flat .. 1 up), cluster size, crown height
  oak: { h: [3.2, 4.2], r: [0.42, 0.55], n: [6, 8], len: [3.2, 4.4], lift: 0.35, leaf: [2.2, 2.9], crown: 1.2 },
  maple: { h: [3.8, 5.0], r: [0.3, 0.4], n: [5, 7], len: [2.6, 3.4], lift: 0.55, leaf: [2.0, 2.6], crown: 1.6 },
  beech: { h: [5.0, 6.5], r: [0.32, 0.42], n: [5, 7], len: [2.4, 3.2], lift: 0.6, leaf: [2.0, 2.5], crown: 2.0 },
  elm: { h: [4.5, 5.5], r: [0.32, 0.42], n: [5, 6], len: [3.6, 4.6], lift: 0.8, leaf: [2.2, 2.8], crown: 1.4 },
  forest: { h: [4.0, 5.5], r: [0.3, 0.4], n: [5, 7], len: [2.8, 3.6], lift: 0.55, leaf: [2.0, 2.6], crown: 1.6 },
  mossy: { h: [2.8, 3.6], r: [0.45, 0.6], n: [5, 7], len: [3.0, 4.0], lift: 0.25, leaf: [2.2, 2.8], crown: 1.0, gnarl: 0.5 },
  laurel: { h: [1.6, 2.4], r: [0.2, 0.28], n: [6, 8], len: [1.8, 2.4], lift: 0.5, leaf: [1.8, 2.2], crown: 1.2 },
};
const CONIFER = { // trunk height, radius, crown starts at (fraction of height), widest radius, layer spacing
  pine: { h: [12, 16], r: [0.3, 0.4], start: 0.35, wide: [2.6, 3.4], step: 0.9 },
  cedar: { h: [10, 13], r: [0.4, 0.5], start: 0.2, wide: [3.4, 4.2], step: 0.8 },
  redwood: { h: [24, 32], r: [0.9, 1.2], start: 0.55, wide: [3.6, 4.6], step: 1.3 },
};
export const SPECIES = [...Object.keys(BROAD), ...Object.keys(CONIFER)];
const VARIANTS = 3;

function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

let _sway = null;
/** (WebGPU) The leaves' sway (the GLSL patch below), more toward the outside of the crown: worked
 * in the tree's own space as the GLSL's `transformed` is, so turned and scaled by each instance's
 * matrix (TSL's positionLocal has the instance matrix in it already). */
function leafSway(time) {
  if (!_sway) {
    const { referenceAttribute, positionGeometry: p, positionLocal, vec4, sin, max, length } = T;
    const M = referenceAttribute('instanceMatrix', 'mat4'), at = M.element(3);
    const ph = at.x.mul(0.31).add(at.z.mul(0.17));
    const sway = max(0.0, p.y.sub(1.5)).mul(0.012).add(length(p.xz).mul(0.01));
    const dx = sin(time.mul(1.6).add(ph).add(p.y.mul(0.6))).mul(sway);
    const dz = sin(time.mul(1.2).add(ph.mul(1.3)).add(p.x.mul(0.5))).mul(sway).mul(0.7);
    _sway = positionLocal.add(M.mul(vec4(dx, 0.0, dz, 0.0)).xyz);
  }
  return _sway;
}

export class Trees3D {
  constructor(ctx) {
    this.ctx = ctx;
    this.lib = ctx.lib;
    this.place = new Map(); // variant key -> [{x, y, z, s, rot}]
    this.time = WEBGPU ? T.uniform(0).setGroup(T.renderGroup) : { value: 0 };
    this.meshes = [];
  }

  /** A tree of `species` at (x, y, z), `scale` times its natural size. */
  add(species, x, y, z, scale = 1) {
    const h = Math.abs(Math.round(x * 13.7 + z * 7.3));
    const key = `${species}|${h % VARIANTS}`;
    if (!this.place.has(key)) this.place.set(key, []);
    this.place.get(key).push({ x, y, z, s: scale * (0.85 + (h % 31) / 100), rot: (h % 628) / 100 });
  }

  materials(species, v) {
    const lib = this.lib;
    const barks = lib.ofKind('bark', species), leafs = [...lib.cards.values()].filter((c) => c.species === species);
    const barkId = barks[v % barks.length] || 'ship_01_tarblack_oak';
    const bark = lib.material(barkId, { tile: species === 'redwood' ? 2.4 : 1.2 });
    const card = leafs[(v * 3) % Math.max(1, leafs.length)];
    const map = card ? lib.texture(card.file, false) : null;
    if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.LinearMipmapLinearFilter; }
    if (WEBGPU) {   // (the sway below as one graph for every species' leaves; their shadows stand still, as WebGL's do)
      const leaves = new THREE.MeshPhongNodeMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, shininess: 6, specular: 0x0a0a0a });
      leaves.userData = { tileU: 1, tileV: 1 };
      leaves.positionNode = leafSway(this.time);
      leaves.castShadowPositionNode = T.positionLocal;
      return { bark, leaves };
    }
    const leaves = new THREE.MeshPhongMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, shininess: 6, specular: 0x0a0a0a });
    leaves.userData = { tileU: 1, tileV: 1 };
    const time = this.time;
    leaves.onBeforeCompile = (sh) => { // leaves sway, more toward the outside of the crown
      sh.uniforms.uTime = time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17;
          #else
            float ph = 0.0;
          #endif
          float sway = max(0.0, position.y - 1.5) * 0.012 + length(position.xz) * 0.01;
          transformed.x += sin(uTime * 1.6 + ph + position.y * 0.6) * sway;
          transformed.z += sin(uTime * 1.2 + ph * 1.3 + position.x * 0.5) * sway * 0.7;`);
    };
    return { bark, leaves };
  }

  /** Build one variant's geometry: {bark, leaves} buffer geometries in its own space. */
  build(species, v, mats) {
    const R = rng(1000 + SPECIES.indexOf(species) * 97 + v * 31);
    const b = new Builder({ add() {} });
    const between = ([a, c]) => a + R() * (c - a);
    const card = (c, size) => { // three crossed leaf cards round a point
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 6.28, R() * 6.28, R() * 6.28));
      for (let k = 0; k < 3; k++) {
        const e = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (k * Math.PI) / 3, k === 2 ? Math.PI / 2 : 0));
        const r = q.clone().multiply(e);
        const ax = new THREE.Vector3(size / 2, 0, 0).applyQuaternion(r), ay = new THREE.Vector3(0, size / 2, 0).applyQuaternion(r);
        const p = (sx, sy) => [c.x + ax.x * sx + ay.x * sy, c.y + ax.y * sx + ay.y * sy, c.z + ax.z * sx + ay.z * sy];
        b.quad(mats.leaves, p(-1, -1), p(1, -1), p(1, 1), p(-1, 1), [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }
    };
    let crown = new THREE.Vector3();
    if (BROAD[species]) {
      const P = BROAD[species], H = between(P.h), r0 = between(P.r), g = P.gnarl || 0.15;
      // the trunk: a few tapering, slightly wandering segments, with root flares at the foot
      let pt = new THREE.Vector3(0, 0, 0), r = r0;
      const segs = 4;
      for (let i = 0; i < segs; i++) {
        const nx = pt.clone().add(new THREE.Vector3((R() - 0.5) * g, H / segs, (R() - 0.5) * g));
        b.cylinder(pt.toArray(), nx.toArray(), r, 9, mats.bark, { r1: r * 0.86, caps: false });
        pt = nx; r *= 0.86;
      }
      for (let k = 0; k < 4; k++) { const a = k * 1.57 + R(); b.beam([Math.cos(a) * r0 * 0.3, 0.45, Math.sin(a) * r0 * 0.3], [Math.cos(a) * r0 * 2.2, -0.05, Math.sin(a) * r0 * 2.2], r0 * 0.6, r0 * 0.5, mats.bark); }
      crown = pt.clone().add(new THREE.Vector3(0, P.crown, 0));
      const n = Math.round(between(P.n));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.28 + R() * 0.6, lift = P.lift * (0.7 + R() * 0.6);
        const from = new THREE.Vector3(0, H * (0.55 + R() * 0.45), 0);
        const len = between(P.len);
        const dir = new THREE.Vector3(Math.cos(a), lift + 0.2, Math.sin(a)).normalize();
        const mid = from.clone().addScaledVector(dir, len * 0.55).add(new THREE.Vector3(0, 0.2, 0));
        const tip = from.clone().addScaledVector(dir, len).add(new THREE.Vector3(0, len * 0.15, 0));
        b.cylinder(from.toArray(), mid.toArray(), r0 * 0.42, 6, mats.bark, { r1: r0 * 0.3, caps: false });
        b.cylinder(mid.toArray(), tip.toArray(), r0 * 0.3, 5, mats.bark, { r1: r0 * 0.12, caps: false });
        for (let k = 0; k < 2; k++) { // twigs off the branch
          const a2 = a + (k ? 0.9 : -0.9), t2 = mid.clone().add(new THREE.Vector3(Math.cos(a2), 0.6, Math.sin(a2)).multiplyScalar(len * 0.4));
          b.cylinder(mid.toArray(), t2.toArray(), r0 * 0.14, 4, mats.bark, { r1: r0 * 0.05, caps: false });
          card(t2, between(P.leaf) * 0.85);
        }
        card(tip, between(P.leaf)); card(mid.clone().add(new THREE.Vector3(0, 0.5, 0)), between(P.leaf) * 0.9);
      }
      for (let i = 0; i < 4; i++) card(crown.clone().add(new THREE.Vector3((R() - 0.5) * 2, (R() - 0.3) * 1.5, (R() - 0.5) * 2)), between(P.leaf) * 1.1);
    } else {
      const P = CONIFER[species], H = between(P.h), r0 = between(P.r), wide = between(P.wide);
      b.cylinder([0, 0, 0], [0, H, 0], r0, 10, mats.bark, { r1: r0 * 0.12, caps: false });
      for (let k = 0; k < 5; k++) { const a = k * 1.26 + R(); b.beam([Math.cos(a) * r0 * 0.3, 0.5, Math.sin(a) * r0 * 0.3], [Math.cos(a) * r0 * 2.4, -0.05, Math.sin(a) * r0 * 2.4], r0 * 0.6, r0 * 0.5, mats.bark); }
      crown = new THREE.Vector3(0, H * (0.5 + P.start / 2), 0);
      for (let y = H * P.start; y < H - 0.6; y += P.step * (0.85 + R() * 0.3)) {
        const t = (y - H * P.start) / (H * (1 - P.start)), rad = wide * (1 - t * 0.92) + 0.4;
        const n = 5 + Math.round(R() * 2);
        for (let i = 0; i < n; i++) { // drooping boughs: a branch with a card along it, angled down
          const a = (i / n) * 6.28 + R() * 0.8 + y;
          const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-out.z, 0, out.x);
          const root = new THREE.Vector3(0, y, 0), end = root.clone().addScaledVector(out, rad).add(new THREE.Vector3(0, -rad * 0.35, 0));
          b.cylinder(root.toArray(), end.toArray(), r0 * 0.12, 4, mats.bark, { r1: 0.02, caps: false });
          const w = Math.max(0.9, rad * 0.9);
          const p = (u, s) => root.clone().lerp(end, u).addScaledVector(side, s * w * (0.4 + u * 0.6)).add(new THREE.Vector3(0, 0.15, 0)).toArray();
          const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
          b.quad(mats.leaves, p(0, -0.5), p(1.05, -0.5), p(1.05, 0.5), p(0, 0.5), UV);
          const lift = (q) => [q[0], q[1] + w * 0.45, q[2]];
          b.quad(mats.leaves, p(0, 0), p(1.05, 0), lift(p(1.05, 0)), lift(p(0, 0)), UV);
        }
      }
      card(new THREE.Vector3(0, H - 0.3, 0), 1.6);
    }
    // merge, and give the leaves normals that point out from the crown, so the canopy shades
    // as one soft mass instead of a jumble of flat cards
    const out = {};
    for (const [mat, chunks] of b.batches) {
      const geos = [...chunks.values()].flat().map((g) => { g.deleteAttribute('color'); return g; });
      const g = mergeGeometries(geos, false);
      if (mat === mats.leaves) {
        const P = g.attributes.position, N = g.attributes.normal, v3 = new THREE.Vector3(), n3 = new THREE.Vector3();
        for (let i = 0; i < P.count; i++) {
          v3.fromBufferAttribute(P, i).sub(crown).normalize();
          n3.fromBufferAttribute(N, i).multiplyScalar(0.3).addScaledVector(v3, 0.7).add(new THREE.Vector3(0, 0.25, 0)).normalize();
          N.setXYZ(i, n3.x, n3.y, n3.z);
        }
        out.leaves = g;
      } else out.bark = g;
    }
    return out;
  }

  finish(scene) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const [key, list] of this.place) {
      const [species, vs] = key.split('|'), v = Number(vs);
      const mats = this.materials(species, v);
      const geo = this.build(species, v, mats);
      for (const [part, g] of Object.entries(geo)) {
        const mat = part === 'leaves' ? mats.leaves : mats.bark.clone();
        if (part === 'bark') { mat.vertexColors = false; mat.userData = { ...mats.bark.userData }; }
        const mesh = new THREE.InstancedMesh(g, mat, list.length);
        list.forEach((p, i) => {
          q.setFromAxisAngle(up, p.rot);
          m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
          mesh.setMatrixAt(i, m);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        this.meshes.push(mesh);
      }
      const r = (BROAD[species]?.r[1] || CONIFER[species].r[1]) * 0.9;
      for (const p of list) this.ctx.physics.add([p.x - r * p.s, p.y, p.z - r * p.s], [p.x + r * p.s, p.y + 6, p.z + r * p.s], 'tree');
    }
  }

  update(t) { this.time.value = t; }
}
