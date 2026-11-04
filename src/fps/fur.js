// Fur (the beast men): strands grown over a beast's coat when the first of its kind is made, bound
// to its bones as its skin is, so they go with it through every move, the fall and the ragdoll.
// Where it grows comes from the body itself: its painted roughness (the coat is dry; the eyes, the wet
// nose and gums, the teeth are glossy and the claws horn: nothing grows there) and the bone each place
// hangs from (the mane on the neck and shoulders longest, the face shortest, none on the hands, the
// pads or the soles). It's combed down the limbs, down the body and back over the head. Each strand
// is two blades crossed, wide at the root and coming to a point, the colour of the skin under its root
// (a little darker at the root; a kind with `frost` goes lighter to the tip, the dark coat's guard
// hairs catching the light), drawn with the body's own gore shader on the body's own
// wounds: a strand rooted in a hole goes with it, blood thrown on the skin is on the fur. One set of
// strands for each kind of body, shared by every one of it; the nearer you, the more of them drawn
// (`lod`), none past FAR. A limb cut off takes its strands with it (`sync`).
import * as THREE from 'three';
import { goreMaterial } from './zombies.js';
import { TOUCH } from './input.js';

const EYE_BARE = 0.05, EYE_SHORT = 0.11;   // (none this near an eye, short to here: the eyes must show)
const NEAR = 5, FAR = 26;      // (all of them drawn this near, a quarter of them out at FAR, none past it)
const PER = 36;                // indices a strand: two blades, three triangles each, both ways round
// each point of a blade reads the skin a little off its root (in uv), so the blade spans a patch of the
// picture and the shader takes a blurred mip of it: the colour of the skin there, not of one fleck
const PATCH = 0.003, AT = [[-1, 0], [1, 0], [-0.6, 0.5], [0.6, 0.5], [0, 1]];
// the coat by the bone it hangs from (by the names zombies.js adaptBeast gives them): [bone, length (m),
// lift off the skin (rad), how it's combed, only where the skin faces this far up, only this far (m)
// from the bone, thinning out] (the fingers and the thumbs are bare, and the hands but for a cuff at
// the wrist: the pads and the claws)
const COAT = [
  [/^(head|jaw)$/, 0.026, 0.38, 'head'],
  [/^neck/, 0.09, 0.62, 'mane'],
  [/^(chest|shoulder)/, 0.08, 0.52, 'body'],
  [/^(spine|hips|root)/, 0.06, 0.42, 'body'],
  [/^upper_arm/, 0.062, 0.4, 'limb'],
  [/^forearm/, 0.05, 0.36, 'limb'],
  [/^hand/, 0.03, 0.34, 'limb', null, 0.1],
  [/^thigh/, 0.062, 0.4, 'limb'],
  [/^shin/, 0.05, 0.36, 'limb'],
  [/^(foot|ball)/, 0.02, 0.3, 'limb', 0.25],   // (the top of the paw: none on the sole)
];
// combed (in the body's bind space, +y up, +z the way it faces)
const FLOW = { head: new THREE.Vector3(0, -0.3, -1).normalize(), mane: new THREE.Vector3(0, -0.7, -1).normalize(),
  body: new THREE.Vector3(0, -1, -0.25).normalize(), tail: new THREE.Vector3(0, -1, -0.7).normalize() };

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Where the coat is, from the body's roughness map (the dry coat between the wet and the horn), as
 * a 512 x 512 mask in its uv; null if the picture can't be read (the coat then grows everywhere the
 * bones allow). */
function coatMask(mat) {
  const t = mat?.roughnessMap || mat?.metalnessMap, img = t?.image, S = 512;
  if (!img?.width) return null;
  try {
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, S, S);
    const d = cx.getImageData(0, 0, S, S).data, m = new Uint8Array(S * S);
    for (let i = 0; i < S * S; i++) { const r = d[i * 4 + 1]; m[i] = r >= 150 && r <= 236 ? 1 : 0; }
    return { S, m, flip: t.flipY };
  } catch (e) { console.warn('fur: the coat mask', e); return null; }
}

/** The strands of a kind of body (made once, kept on its gltf): the shared vertices, the whole index,
 * and for each strand the body triangle it grows from. `o.n`: how many (a phone grows fewer); `o.eyes`:
 * where its eyes are in its bind pose; `o.frost`: 0, the skin's own colour, to 1, frosted tips; `o.flat`:
 * how far its strands lift off the skin (1: all the way the coat allows; less lies closer). */
export function furOf(gltf, o = {}) {
  if (gltf.userData.fur !== undefined) return gltf.userData.fur;
  let body = null;
  gltf.scene.traverse((c) => { if (c.isSkinnedMesh && (!body || c.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = c; });
  gltf.userData.fur = body ? grow(body, o) : null;
  return gltf.userData.fur;
}

function grow(body, o) {
  const T0 = performance.now();
  const g = body.geometry, P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
  const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, idx = g.index.array, nv = P.count;
  const bones = body.skeleton.bones, mask = coatMask(body.material);
  const unit = 1 / new THREE.Vector3().setFromMatrixScale(body.bindMatrix).x;   // (metres to the body's units)
  // each bone's place in bind space, and which way down it its limb goes
  // (not body.bindMatrixInverse: three keeps that the inverse of where the body is now, its scale in it)
  const inv = body.bindMatrix.clone().invert(), eyes = (o.eyes || []).map((e) => new THREE.Vector3(...e).applyMatrix4(inv)), at = bones.map((b, j) => new THREE.Vector3().setFromMatrixPosition(inv.clone().multiply(body.skeleton.boneInverses[j].clone().invert())));
  const along = bones.map((b, j) => {
    const kid = b.children.find((c) => c.isBone), k = kid ? bones.indexOf(kid) : -1;
    const d = k >= 0 ? at[k].clone().sub(at[j]) : at[j].clone().sub(at[Math.max(0, bones.indexOf(b.parent))]);
    return d.lengthSq() > 1e-10 ? d.normalize() : FLOW.body.clone();
  });
  const rule = bones.map((b) => COAT.find(([re]) => re.test(b.name)) || null);
  const pelvis = bones.findIndex((b) => b.name === 'hips'), tailZ = pelvis >= 0 ? at[pelvis].z - 0.2 / unit : -1e9;
  // each vertex's strongest bone
  const dom = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; best = SI.getComponent(i, k); } }
    dom[i] = best;
  }
  // the triangles by their area of coat, to pick roots from
  const nt = idx.length / 3, cdf = new Float64Array(nt), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let sum = 0;
  for (let t = 0; t < nt; t++) {
    const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
    const coat = (rule[dom[i0]] ? 1 : 0) + (rule[dom[i1]] ? 1 : 0) + (rule[dom[i2]] ? 1 : 0);
    if (coat) {
      a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1).sub(a); c.fromBufferAttribute(P, i2).sub(a);
      sum += b.cross(c).length() * 0.5 * coat / 3;
    }
    cdf[t] = sum;
  }
  const want = o.n || 9000, rnd = seeded(o.seed || 7), roots = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Vector3();
  for (let tries = 0; roots.length < want && tries < want * 5 && sum > 0; tries++) {
    const r = rnd() * sum;
    let lo = 0, hi = nt - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < r) lo = m + 1; else hi = m; }
    const t = lo, I = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
    let u = rnd(), v = rnd();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = [1 - u - v, u, v], near = I[w.indexOf(Math.max(...w))];
    const R = rule[dom[near]];
    if (!R) continue;
    const ru = w[0] * UV.getX(I[0]) + w[1] * UV.getX(I[1]) + w[2] * UV.getX(I[2]);
    const rv = w[0] * UV.getY(I[0]) + w[1] * UV.getY(I[1]) + w[2] * UV.getY(I[2]);
    if (mask) {
      const x = Math.min(mask.S - 1, Math.max(0, Math.floor((ru - Math.floor(ru)) * mask.S)));
      const y = Math.min(mask.S - 1, Math.max(0, Math.floor((mask.flip ? 1 - rv : rv) * mask.S)));
      if (!mask.m[y * mask.S + x]) continue;
    }
    p.set(0, 0, 0); n.set(0, 0, 0);
    for (let k = 0; k < 3; k++) { p.addScaledVector(q.fromBufferAttribute(P, I[k]), w[k]); n.addScaledVector(q.fromBufferAttribute(N, I[k]), w[k]); }
    n.normalize();
    if (R[4] != null && n.y < R[4]) continue;
    let short = 1;
    if (R[5]) {
      const f = 1 - p.distanceTo(at[dom[near]]) / (R[5] * unit);
      if (f <= 0 || rnd() > f + 0.2) continue;
      short = Math.max(0.35, f);
    }
    if (R[3] === 'mane' && n.z > 0.35) short = 0.45;   // (kept short down the throat: never a beard)
    if (R[3] === 'head' && eyes.length) {
      const e = Math.min(...eyes.map((c) => p.distanceTo(c))) / unit;   // (metres)
      if (e < EYE_BARE) continue;
      short = Math.max(0.3, Math.min(1, (e - EYE_BARE) / (EYE_SHORT - EYE_BARE)));
    }
    const tail = R[3] === 'body' && p.z < tailZ;
    roots.push({ t, p: p.clone(), n: n.clone(), u: ru, v: rv, near, R, tail, short, flow: R[3] === 'limb' ? along[dom[near]] : FLOW[tail ? 'tail' : R[3]] });
  }
  // the strands: two blades each, crossed, five points to a blade (root, middle, tip)
  const S = roots.length, V = S * 10;
  const pos = new Float32Array(V * 3), nor = new Float32Array(V * 3), uvs = new Float32Array(V * 2), col = new Float32Array(V * 3), bind = new Float32Array(V * 3);
  const si = new THREE.BufferAttribute(new SI.array.constructor(V * 4), 4, SI.normalized), sw = new THREE.BufferAttribute(new SW.array.constructor(V * 4), 4, SW.normalized);
  const index = new Uint32Array(S * PER), tri = new Uint32Array(S);
  const W = (TOUCH ? 0.008 : 0.0055) * unit, tg = new THREE.Vector3(), side = new THREE.Vector3(), d0 = new THREE.Vector3(), d1 = new THREE.Vector3(), e = new THREE.Vector3();
  const P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), P2 = new THREE.Vector3(), sA = new THREE.Vector3(), sB = new THREE.Vector3();
  // the strands in tufts: those rooted near each other lean their tips together, and share a shade
  const frost = o.frost || 0, spread = 0.08 + 0.2 * frost, mix = (a, b) => a + (b - a) * frost;
  const CELL = 0.035 * unit, tufts = new Map();
  for (const r of roots) {
    const key = `${Math.floor(r.p.x / CELL)},${Math.floor(r.p.y / CELL)},${Math.floor(r.p.z / CELL)}`;
    if (!tufts.has(key)) tufts.set(key, { at: r.p, k: 1 - spread + 2 * spread * rnd() });
    r.tuft = tufts.get(key);
  }
  roots.forEach((r, s) => {
    tri[s] = r.t;
    // combed: the flow laid on the skin, turned a little either way, lifted off it
    tg.copy(r.flow).addScaledVector(r.n, -r.flow.dot(r.n));
    if (tg.lengthSq() < 1e-6) tg.set(1, 0, 0).addScaledVector(r.n, -r.n.x);
    tg.normalize();
    const j = (rnd() - 0.5) * 0.7;
    side.crossVectors(r.n, tg);
    tg.multiplyScalar(Math.cos(j)).addScaledVector(side, Math.sin(j)).normalize();
    const lift = r.R[2] * (o.flat || 1) * (r.tail ? 1.3 : 1) * (0.75 + 0.5 * rnd()), L = r.R[1] * r.short * (r.tail ? 1.5 : 1) * (0.65 + 0.7 * rnd()) * unit;
    d0.copy(tg).multiplyScalar(Math.cos(lift)).addScaledVector(r.n, Math.sin(lift));
    d1.copy(tg).multiplyScalar(Math.cos(lift * 0.3)).addScaledVector(r.n, Math.sin(lift * 0.3)).addScaledVector(FLOW.body, 0.15).normalize();
    P0.copy(r.p).addScaledVector(r.n, -0.25 * W);   // (rooted a little under the skin)
    P1.copy(P0).addScaledVector(d0, L * 0.5);
    P2.copy(P1).addScaledVector(d1, L * 0.5);
    // (the tip toward the tuft's first strand's tip, kept to the skin's side: a pointed lock, not a fuzz)
    e.copy(r.tuft.at).addScaledVector(d0, L * 0.5).addScaledVector(d1, L * 0.5);
    P2.lerp(e, 0.55);
    sA.crossVectors(d0, r.n).normalize();            // (one blade lying along the skin, one standing off it)
    sB.crossVectors(d0, sA).normalize();
    const k = r.tuft.k * (1 - spread * 0.5 + spread * rnd()), long = r.R[1] >= 0.06 || r.tail;
    const mid = mix(0.96, long ? 1.5 : 1.2), tip = mix(0.98, long ? 2.3 : 1.6), root = mix(0.78, 0.9);
    const shades = [root, root, mid, mid, tip];
    [sA, sB].forEach((sd, bl) => {
      const v0 = s * 10 + bl * 5;
      const pts = [e.copy(P0).addScaledVector(sd, -W / 2).toArray(), P0.clone().addScaledVector(sd, W / 2).toArray(),
        P1.clone().addScaledVector(sd, -W * 0.3).toArray(), P1.clone().addScaledVector(sd, W * 0.3).toArray(), P2.toArray()];
      for (let m = 0; m < 5; m++) {
        const vi = v0 + m;
        pos.set(pts[m], vi * 3); nor.set([r.n.x, r.n.y, r.n.z], vi * 3); bind.set([r.p.x, r.p.y, r.p.z], vi * 3);
        uvs[vi * 2] = r.u + AT[m][0] * PATCH; uvs[vi * 2 + 1] = r.v + AT[m][1] * PATCH;
        col[vi * 3] = shades[m] * k; col[vi * 3 + 1] = shades[m] * k * (1 + 0.02 * frost); col[vi * 3 + 2] = shades[m] * k * (1 + 0.06 * frost);
        for (let c4 = 0; c4 < 4; c4++) { si.setComponent(vi, c4, SI.getComponent(r.near, c4)); sw.setComponent(vi, c4, SW.getComponent(r.near, c4)); }
      }
      index.set([v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2, v0 + 2, v0 + 3, v0 + 4,
        v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3, v0 + 2, v0 + 4, v0 + 3], s * PER + bl * 18);
    });
  });
  const attrs = { position: new THREE.BufferAttribute(pos, 3), normal: new THREE.BufferAttribute(nor, 3), uv: new THREE.BufferAttribute(uvs, 2),
    color: new THREE.BufferAttribute(col, 3), bindPos: new THREE.BufferAttribute(bind, 3), skinIndex: si, skinWeight: sw };
  console.info(`fur: ${S} strands (${V} vertices) in ${Math.round(performance.now() - T0)} ms${mask ? '' : ', no coat mask'}`);
  return { attrs, index: new THREE.BufferAttribute(index, 1), tri, count: S };
}

/** One body's fur: the kind's strands, on its bones, with the body's wounds. */
export class Fur {
  constructor(F, mesh, skin = 1) {
    this.F = F;
    const g = this.geometry = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(F.attrs)) g.setAttribute(k, a);
    g.setIndex(F.index);
    const src = [mesh.material].flat()[0];
    src.color.setScalar(skin);
    const mat = this.material = goreMaterial({ map: src.map, name: 'fur' }, null, src.userData.u);
    mat.side = THREE.FrontSide;     // (each blade is drawn both ways round: never its back, which the gore shader takes for the inside of the body)
    mat.vertexColors = true;
    mat.shininess = 14;
    mat.specular?.setHex?.(0x1a1612);
    const m = this.mesh = new THREE.SkinnedMesh(g, mat);
    m.name = 'fur';
    m.bind(mesh.skeleton, mesh.bindMatrix);
    m.bindMode = mesh.bindMode;
    m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
    m.boundingSphere = mesh.boundingSphere; m.frustumCulled = mesh.frustumCulled;
    m.castShadow = false; m.receiveShadow = true;
    mesh.parent.add(m);
    this.shown = F.count;
  }

  /** As many of its strands drawn as `d` (metres from you) calls for. */
  lod(d) {
    const on = d < FAR;
    this.mesh.visible = on;
    if (!on) return;
    const k = d <= NEAR ? 1 : 1 - 0.75 * (d - NEAR) / (FAR - NEAR);
    this.geometry.setDrawRange(0, Math.round(this.shown * k) * PER);
  }

  /** The strands still on it, after a limb came off (`alive`: the body's triangles, 1 if still on). */
  sync(alive) {
    const F = this.F, src = F.index.array, keep = [];
    for (let s = 0; s < F.count; s++) if (alive[F.tri[s]]) keep.push(s);
    if (keep.length === this.shown) return;
    const out = new Uint32Array(keep.length * PER);
    keep.forEach((s, i) => out.set(src.subarray(s * PER, s * PER + PER), i * PER));
    this.geometry.setIndex(new THREE.BufferAttribute(out, 1));
    this.shown = keep.length;
  }

  /** Let it go (after engine.js letGo has told three), but not the strands its kind shares. */
  dispose() {
    const g = this.geometry;
    this.mesh.removeFromParent();
    for (const k of Object.keys(this.F.attrs)) g.deleteAttribute(k);
    if (g.index === this.F.index) g.setIndex(null);
    g.dispose();
    this.material.dispose();
  }
}
