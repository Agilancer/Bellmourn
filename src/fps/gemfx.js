// What gems look like (gems.js): in a weapon, a staff or a shield, the thing itself burns, smokes with
// frost, crawls with lightning, drips venom, has orbs of light wheeling about it, shines, bleeds, drinks
// the light, or burns with the green star's fire; on gauntlets, the hands do; set in armour, it rises
// about you as you go (seen when you look down). The finer the gem, the stronger: a chipped one is a
// faint glow, a perfect one blazes and throws its light on your hands, and every swing leaves a stream
// of it behind. More of everything under WebGPU, and less on a phone.
//
// Everything is made of plain three.js parts (instanced quads, additive or plain blending, a few
// ribbons for the lightning, one point light by the hands), so it draws the same under WebGL and
// WebGPU. The held things' particles live in the view model's scene (the hands' space), the worn ones'
// in the world. Points are sampled once over each held model's own surface, so the fire is on the
// blade, not in a box about it.
import * as THREE from 'three';
import { gemLooks } from './gems.js';

// ------------------------------------------------------------------ pictures
function canvasTex(S, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  draw(c.getContext('2d'), S);
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
const radial = (g, x, y, r, stops) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); for (const [k, a] of stops) gr.addColorStop(k, `rgba(255,255,255,${a})`); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
function textures(S) {
  return {
    soft: canvasTex(S, (g) => radial(g, S / 2, S / 2, S / 2, [[0, 1], [0.22, 0.62], [0.55, 0.16], [1, 0]])),
    core: canvasTex(S, (g) => radial(g, S / 2, S / 2, S / 2, [[0, 1], [0.12, 0.96], [0.3, 0.42], [0.6, 0.08], [1, 0]])),
    // a tongue of flame, its point up (+v): soft discs climbing and narrowing
    flame: canvasTex(S, (g) => {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const k = i / 13, y = S * (0.78 - 0.62 * k), r = S * (0.25 * (1 - k) ** 0.8 + 0.025);
        radial(g, S / 2 + Math.sin(k * 5) * S * 0.015, y, r, [[0, 0.32], [0.5, 0.16], [1, 0]]);
      }
    }),
    // a streak along +u
    spark: canvasTex(S, (g) => { g.save(); g.translate(S / 2, S / 2); g.scale(1, 0.16); radial(g, 0, 0, S / 2, [[0, 1], [0.3, 0.5], [1, 0]]); g.restore(); }),
    // a four-pointed glint
    star: canvasTex(S, (g) => {
      for (const [sx, sy] of [[1, 0.07], [0.07, 1]]) { g.save(); g.translate(S / 2, S / 2); g.scale(sx, sy); radial(g, 0, 0, S / 2, [[0, 1], [0.25, 0.45], [1, 0]]); g.restore(); }
      radial(g, S / 2, S / 2, S * 0.16, [[0, 1], [1, 0]]);
    }),
    // a soft puff (for smoke and blood: drawn plainly blended)
    puff: canvasTex(S, (g) => { for (let i = 0; i < 7; i++) { const a = i * 2.4, d = i ? S * 0.12 : 0; radial(g, S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * (i ? 0.3 : 0.4), [[0, 0.55], [0.6, 0.25], [1, 0]]); } }),
    ring: canvasTex(S, (g) => { g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = S * 0.05; g.shadowColor = '#fff'; g.shadowBlur = S * 0.08; g.beginPath(); g.arc(S / 2, S / 2, S * 0.38, 0, Math.PI * 2); g.stroke(); }),
    // across a ribbon (v): bright in its middle, nothing at its edges
    across: canvasTex(S, (g) => { const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }),
  };
}

// ------------------------------------------------------------------ a pool of quads
const _m = new THREE.Vector3(), _n = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const UPW = new THREE.Vector3(0, 1, 0), NOTURN = new THREE.Quaternion();
const rnd = (o = _c) => { do o.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1); while (o.lengthSq() > 1); return o; };
const R = (a, b) => a + Math.random() * (b - a);

class Pool {
  /** parent: the scene it draws in; how: 'add' (light) or 'normal' (smoke, blood). */
  constructor(parent, tex, max, how = 'add', order = 6) {
    this.max = max; this.n = 0; this.boost = 1;
    this.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      blending: how === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: how === 'add' ? 1 : 0.8 });
    const m = this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.mat, max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.frustumCulled = false; m.renderOrder = order;
    parent.add(m);
    this.add = how === 'add';
    const F = (k = 1) => new Float32Array(max * k);
    this.p = F(3); this.v = F(3); this.col = F(3); this.lp = F(3);
    this.age = F(); this.life = F(); this.s0 = F(); this.s1 = F(); this.grav = F(); this.drag = F(); this.rot = F(); this.spin = F(); this.str = F(); this.wob = F();
    this.own = new Int8Array(max).fill(-1);
  }
  /** One particle. o: {grav (along up; negative rises), drag, rot, spin, str (stretch along its way;
   * -1: point along it, as a flame), own (an owner to stay fixed to), wob (sway)} */
  emit(p, v, life, s0, s1, r, g, b, o = {}) {
    const i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    this.p[i * 3] = p.x; this.p[i * 3 + 1] = p.y; this.p[i * 3 + 2] = p.z;
    this.v[i * 3] = v.x; this.v[i * 3 + 1] = v.y; this.v[i * 3 + 2] = v.z;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0 * this.boost; this.s1[i] = s1 * this.boost;
    this.grav[i] = o.grav || 0; this.drag[i] = o.drag ?? 1.2; this.rot[i] = o.rot ?? Math.random() * 6.283; this.spin[i] = o.spin || 0; this.str[i] = o.str || 0; this.wob[i] = o.wob || 0;
    this.own[i] = o.own ?? -1;
    if (o.own != null && o.own >= 0) { this.lp[i * 3] = o.lp.x; this.lp[i * 3 + 1] = o.lp.y; this.lp[i * 3 + 2] = o.lp.z; }
    return i;
  }
  /** up: the world's up in this pool's space; owners: [Matrix4] the attached ones follow; basis:
   * the camera's [right, up, back] (null: the view model's own space, looking down -z); comp: how
   * the view turned since last frame (free particles stay put in the world as you turn). */
  update(dt, up, owners, basis, comp, t) {
    const { p, v, col, age, life, s0, s1, grav, drag, rot, spin, str, wob, own, lp } = this;
    const M = this.mesh.instanceMatrix.array, C = this.mesh.instanceColor.array;
    const rx = basis ? basis[0] : null, ux = basis ? basis[1] : null, bx = basis ? basis[2] : null;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      age[i] += dt;
      if (age[i] >= life[i]) continue;
      const k = age[i] / life[i], i3 = i * 3;
      let x, y, z;
      if (own[i] >= 0 && owners[own[i]]) {   // fixed to its owner (drifting a little in its own frame)
        _a.set(lp[i3] + v[i3] * age[i], lp[i3 + 1] + v[i3 + 1] * age[i], lp[i3 + 2] + v[i3 + 2] * age[i]).applyMatrix4(owners[own[i]]);
        x = _a.x; y = _a.y; z = _a.z;
      } else {
        if (comp) { _a.set(p[i3], p[i3 + 1], p[i3 + 2]).applyQuaternion(comp); p[i3] = _a.x; p[i3 + 1] = _a.y; p[i3 + 2] = _a.z; _a.set(v[i3], v[i3 + 1], v[i3 + 2]).applyQuaternion(comp); v[i3] = _a.x; v[i3 + 1] = _a.y; v[i3 + 2] = _a.z; }
        const dg = Math.exp(-drag[i] * dt), gk = grav[i] * dt;
        v[i3] = v[i3] * dg - up.x * gk; v[i3 + 1] = v[i3 + 1] * dg - up.y * gk; v[i3 + 2] = v[i3 + 2] * dg - up.z * gk;
        if (wob[i]) { const s = Math.sin(t * 5 + i * 1.7) * wob[i] * dt; v[i3] += s; v[i3 + 2] += Math.cos(t * 4.3 + i) * wob[i] * dt; }
        p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
        x = p[i3]; y = p[i3 + 1]; z = p[i3 + 2];
      }
      // light: in fast, out slow (plainly blended things shrink away instead)
      const fade = Math.min(1, k * 8) * (1 - k) * (1 - k * 0.3);
      let size = s0[i] + (s1[i] - s0[i]) * k;
      if (!this.add) size *= Math.min(1, k * 5) * (1 - k * k);
      if (size <= 0) continue;
      // which way it lies on screen
      let sx = size, sy = size, a = (rot[i] += spin[i] * dt);
      if (str[i]) {
        const vx = basis ? v[i3] * rx.x + v[i3 + 1] * rx.y + v[i3 + 2] * rx.z : v[i3], vy = basis ? v[i3] * ux.x + v[i3 + 1] * ux.y + v[i3 + 2] * ux.z : v[i3 + 1];
        const sp = Math.hypot(vx, vy);
        if (str[i] < 0) { if (sp > 1e-4) a = Math.atan2(-vx, vy); sy = size * (1 + Math.min(1.2, sp * 1.5)); }   // a flame: its point the way it goes
        else { a = Math.atan2(vy, vx); sx = size * (1 + Math.min(14, sp * str[i])); sy = size * 0.4; }
      }
      const cs = Math.cos(a), sn = Math.sin(a), o = w * 16;
      if (basis) {
        M[o] = (rx.x * cs + ux.x * sn) * sx; M[o + 1] = (rx.y * cs + ux.y * sn) * sx; M[o + 2] = (rx.z * cs + ux.z * sn) * sx; M[o + 3] = 0;
        M[o + 4] = (ux.x * cs - rx.x * sn) * sy; M[o + 5] = (ux.y * cs - rx.y * sn) * sy; M[o + 6] = (ux.z * cs - rx.z * sn) * sy; M[o + 7] = 0;
        M[o + 8] = bx.x; M[o + 9] = bx.y; M[o + 10] = bx.z; M[o + 11] = 0;
      } else {
        M[o] = cs * sx; M[o + 1] = sn * sx; M[o + 2] = 0; M[o + 3] = 0;
        M[o + 4] = -sn * sy; M[o + 5] = cs * sy; M[o + 6] = 0; M[o + 7] = 0;
        M[o + 8] = 0; M[o + 9] = 0; M[o + 10] = 1; M[o + 11] = 0;
      }
      M[o + 12] = x; M[o + 13] = y; M[o + 14] = z; M[o + 15] = 1;
      const f = this.add ? fade : 1;
      C[w * 3] = col[i3] * f; C[w * 3 + 1] = col[i3 + 1] * f; C[w * 3 + 2] = col[i3 + 2] * f;
      // (kept: the live ones are packed to the front, so the pool's order follows what's drawn)
      if (w !== i) this.move(i, w);
      w++;
    }
    this.n = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
  move(i, w) {
    for (const a of [this.p, this.v, this.col, this.lp]) { a[w * 3] = a[i * 3]; a[w * 3 + 1] = a[i * 3 + 1]; a[w * 3 + 2] = a[i * 3 + 2]; }
    for (const a of [this.age, this.life, this.s0, this.s1, this.grav, this.drag, this.rot, this.spin, this.str, this.wob, this.own]) a[w] = a[i];
  }
  clear() { this.n = 0; this.mesh.count = 0; }
}

// ------------------------------------------------------------------ lightning: crooked ribbons
class Ribbons {
  constructor(parent, tex, maxSeg = 600) {
    this.max = maxSeg;
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(maxSeg * 4 * 3); this.col = new Float32Array(maxSeg * 4 * 3);
    const uv = new Float32Array(maxSeg * 4 * 2), idx = new Uint32Array(maxSeg * 6);
    for (let s = 0; s < maxSeg; s++) {
      uv.set([0, 0, 0, 1, 1, 0, 1, 1], s * 8);
      idx.set([s * 4, s * 4 + 1, s * 4 + 2, s * 4 + 2, s * 4 + 1, s * 4 + 3], s * 6);
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 7;
    parent.add(this.mesh);
    this.list = [];
  }
  /** A bolt along the points (each [x, y, z] in this space), `w` wide, its colour, for `life` seconds. */
  add(pts, w, r, g, b, life) { if (this.list.length < 80) this.list.push({ pts, w, r, g, b, life, age: 0 }); }
  /** eye: where the eye is in this space (the view model's: its origin). */
  update(dt, eye) {
    let s = 0;
    this.list = this.list.filter((L) => (L.age += dt) < L.life);
    for (const L of this.list) {
      const k = 1 - L.age / L.life, f = k * (0.7 + Math.random() * 0.3);
      for (let j = 1; j < L.pts.length && s < this.max; j++, s++) {
        const a = L.pts[j - 1], b = L.pts[j];
        _a.set(b.x - a.x, b.y - a.y, b.z - a.z);
        _b.set((a.x + b.x) / 2 - eye.x, (a.y + b.y) / 2 - eye.y, (a.z + b.z) / 2 - eye.z);
        _n.crossVectors(_a, _b).normalize().multiplyScalar(L.w * (0.6 + 0.4 * k));
        const P = this.pos, o = s * 12;
        P[o] = a.x - _n.x; P[o + 1] = a.y - _n.y; P[o + 2] = a.z - _n.z;
        P[o + 3] = a.x + _n.x; P[o + 4] = a.y + _n.y; P[o + 5] = a.z + _n.z;
        P[o + 6] = b.x - _n.x; P[o + 7] = b.y - _n.y; P[o + 8] = b.z - _n.z;
        P[o + 9] = b.x + _n.x; P[o + 10] = b.y + _n.y; P[o + 11] = b.z + _n.z;
        for (let q = 0; q < 4; q++) { this.col[o + q * 3] = L.r * f; this.col[o + q * 3 + 1] = L.g * f; this.col[o + q * 3 + 2] = L.b * f; }
      }
    }
    this.geo.setDrawRange(0, s * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
  clear() { this.list = []; this.geo.setDrawRange(0, 0); }
}
/** A crooked path from a to b (midpoints pushed aside, `jag` of the length), as Vector3s. */
function bolt(a, b, jag = 0.22, depth = 4) {
  let pts = [a.clone(), b.clone()];
  let amp = a.distanceTo(b) * jag;
  for (let d = 0; d < depth; d++) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const m = pts[i - 1].clone().lerp(pts[i], 0.5).add(rnd(new THREE.Vector3()).multiplyScalar(amp));
      out.push(m, pts[i]);
    }
    pts = out; amp *= 0.5;
  }
  return pts;
}

// ------------------------------------------------------------------ where on a held thing
/** Points spread over a model's own surface, in the model's frame: [positions, normals] (a third
 * of the triangles' share each, by area). keep(p): which part of it (the blade, not the grip). */
function sampleSurface(root, n, keep = null) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), tris = [];
  let total = 0;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), E1 = new THREE.Vector3(), E2 = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index, rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      A.fromBufferAttribute(pos, ia).applyMatrix4(rel); B.fromBufferAttribute(pos, ib).applyMatrix4(rel); Cc.fromBufferAttribute(pos, ic).applyMatrix4(rel);
      const area = E1.subVectors(B, A).cross(E2.subVectors(Cc, A)).length() * 0.5;
      if (area <= 1e-9) continue;
      total += area;
      tris.push([total, A.clone(), B.clone(), Cc.clone()]);
    }
  });
  const P = [], N = [];
  if (!tris.length) return [P, N];
  for (let t = 0; t < n * 4 && P.length < n; t++) {
    const x = Math.random() * total;
    let lo = 0, hi = tris.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tris[mid][0] < x) lo = mid + 1; else hi = mid; }
    const [, a, b, c] = tris[lo];
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const p = new THREE.Vector3().copy(a).addScaledVector(E1.subVectors(b, a), u).addScaledVector(E2.subVectors(c, a), v);
    if (keep && !keep(p)) continue;
    P.push(p); N.push(new THREE.Vector3().crossVectors(E1.subVectors(b, a), E2.subVectors(c, a)).normalize());
  }
  return [P, N];
}

/** Something that carries a look: a held thing, a hand, or you (the armour's). */
class Owner {
  constructor(id, kind) { this.id = id; this.kind = kind; this.obj = null; this.pts = []; this.nrm = []; this.looks = []; this.M = new THREE.Matrix4(); this.swing = 0; this.tip = new THREE.Vector3(); this.tipLast = null; this.y0 = 0; this.y1 = 1; this.r = 0.05; this.scale = 1; this.axis = 'y'; this.center = new THREE.Vector3(); }
  /** A point on it (and its normal) where it is now. */
  pick(p, n = null) {
    const i = Math.floor(Math.random() * this.pts.length);
    p.copy(this.pts[i]).applyMatrix4(this.M);
    if (n) n.copy(this.nrm[i]).transformDirection(this.M);
    return i;
  }
  /** A local point on it (for things fixed to it). */
  local(i) { return this.pts[i]; }
  /** Where on its circle round its long axis (u: 0..1 along it, a: the angle, r: out from it), now. */
  orbit(out, u, a, r) {
    const y = this.y0 + (this.y1 - this.y0) * u;
    if (this.axis === 'y') out.set(Math.cos(a) * r, y, Math.sin(a) * r);
    else if (this.axis === 'z') out.set(this.center.x + Math.cos(a) * r, this.center.y + Math.sin(a) * r, this.center.z);   // (a shield: round its face)
    else out.copy(this.dir).multiplyScalar(y).addScaledVector(this.side1, Math.cos(a) * r).addScaledVector(this.side2, Math.sin(a) * r);
    return out.applyMatrix4(this.M);
  }
}

// ------------------------------------------------------------------ the looks
// Each: (fx: the system, o: the owner, k: how strong 0.2..1.6, top: the best gem's grade, dt, t).
// fx.emit(n): how many to make this frame of a rate per second (more on a swing).
const LOOK = {
  fire(S, o, k, top, dt) {
    const sw = 1 + o.swing * 2.5;
    S.each(S.rate(70 + 130 * k) * sw * dt, () => {
      o.pick(_m, _n);
      _b.copy(S.up).multiplyScalar(R(0.18, 0.4)).addScaledVector(_n, 0.06).add(rnd().multiplyScalar(0.05));
      const hot = Math.random();
      S.flame.emit(_m, _b, R(0.3, 0.6), 0.05 * o.scale * (0.6 + k * 0.4), 0.014, 2.2 + hot * 0.8, 0.5 + hot * 0.9, 0.05 + hot * 0.25, { drag: 1.6, grav: -0.35, str: -1 });
    });
    S.each(S.rate(26 * k + 6) * dt, () => { const i = o.pick(_m); S.soft.emit(_m, _c.set(0, 0, 0), R(0.2, 0.35), 0.05 * o.scale, 0.035 * o.scale, 0.55 * k, 0.16 * k, 0.03 * k, { own: o.id, lp: o.local(i) }); });
    if (top >= 2) S.each(S.rate(8 + 26 * k) * (1 + o.swing * 4) * dt, () => {
      o.pick(_m);
      _b.copy(S.up).multiplyScalar(R(0.35, 0.8)).add(rnd().multiplyScalar(0.35));
      S.spark.emit(_m, _b, R(0.7, 1.4), 0.0055 * o.scale, 0.002, 3.2, 1.5, 0.35, { drag: 0.9, grav: -0.25, str: 3, wob: 0.6 });
    });
    if (top >= 3) S.each(S.rate(22 * k) * dt, () => { const i = o.pick(_m); S.soft.emit(_m, _c.set(0, 0, 0), R(0.25, 0.45), 0.1 * o.scale, 0.07 * o.scale, 0.42 * k, 0.12 * k, 0.02 * k, { own: o.id, lp: o.local(i) }); });
    if (top >= (S.gpu ? 4 : 5)) {   // white-hot at the heart of it, and smoke curling off the top
      S.each(S.rate(36) * sw * dt, () => { o.pick(_m, _n); _b.copy(S.up).multiplyScalar(R(0.1, 0.2)).addScaledVector(_n, 0.03); S.flame.emit(_m, _b, R(0.16, 0.26), 0.02 * o.scale, 0.004, 3.2, 2.6, 1.7, { drag: 2, grav: -0.2, str: -1 }); });
      S.each(S.rate(6) * dt, () => { o.pick(_m); _m.addScaledVector(S.up, 0.06); _b.copy(S.up).multiplyScalar(R(0.08, 0.16)).add(rnd().multiplyScalar(0.03)); S.smoke.emit(_m, _b, R(0.9, 1.5), 0.02 * o.scale, 0.08 * o.scale, 0.06, 0.05, 0.045, { drag: 0.8, wob: 0.2 }); });
    }
    S.glow(o, 1.0, 0.45, 0.14, 0.5 * k * (0.8 + 0.2 * Math.sin(S.t * 23) * Math.sin(S.t * 7.3)));
  },
  frost(S, o, k, top, dt) {
    S.each(S.rate(14 + 26 * k) * dt, () => {
      o.pick(_m, _n);
      _b.copy(S.up).multiplyScalar(-R(0.03, 0.09)).addScaledVector(_n, 0.03).add(rnd().multiplyScalar(0.02));
      S.soft.emit(_m, _b, R(0.9, 1.6), 0.03 * o.scale, 0.11 * o.scale, 0.3 * k, 0.48 * k, 0.75 * k, { drag: 1.2, grav: 0.05 });
    });
    S.sheath(o, 20 + 30 * k, 0.06, 0.25 * k, 0.5 * k, 0.95 * k);
    S.each(S.rate(18 + 30 * k) * dt, () => { const i = o.pick(_m); S.star.emit(_m, _c.set(0, 0, 0), R(0.18, 0.42), R(0.016, 0.03) * o.scale * (0.7 + k * 0.3), 0.002, 2.2, 2.7, 3.4, { own: o.id, lp: o.local(i), spin: R(-2, 2) }); });
    if (top >= 3) S.each(S.rate(10 + 14 * k) * (1 + o.swing * 3) * dt, () => { o.pick(_m); _m.add(rnd().multiplyScalar(0.05)); _b.copy(S.up).multiplyScalar(-R(0.02, 0.06)).add(rnd().multiplyScalar(0.03)); S.soft.emit(_m, _b, R(1.2, 2.2), 0.005 * o.scale, 0.003, 1.0, 1.15, 1.35, { drag: 0.6, grav: 0.04, wob: 0.15 }); });
    if (top >= (S.gpu ? 4 : 5)) S.orbiters(o, 3, k, dt, { r: 1.4, w: 1.6, core: [1.3, 1.8, 2.6], trail: [0.35, 0.6, 1.0], size: 0.012 });
    S.glow(o, 0.55, 0.78, 1.0, 0.28 * k);
  },
  lightning(S, o, k, top, dt) {
    o.arcT = (o.arcT ?? 0) - dt;
    if (o.arcT <= 0) {
      o.arcT = R(0.02, 0.06) / (0.6 + k * 0.6) / Math.min(1.6, S.q);
      const n = 1 + (Math.random() < k * 0.6 ? 1 : 0) + (top >= 3 ? 1 : 0) + (top >= 5 ? 1 : 0);
      for (let j = 0; j < n; j++) {
        o.pick(_a, _n);
        const leap = top >= (S.gpu ? 4 : 5) && Math.random() < 0.25;
        if (Math.random() < 0.55 || leap) {   // a crackle off the surface, or (perfect) a bolt leaping out and back
          const far = (leap ? R(0.12, 0.3) : R(0.025, 0.09)) * o.scale;
          _b.copy(_a).addScaledVector(_n, far).add(rnd().multiplyScalar(far * 0.7));
          if (leap) { const back = _c; o.pick(back); S.arcs.add(bolt(_a, _b, 0.3), 0.011 * o.scale, 2.4, 3.0, 5.0, R(0.1, 0.18)); S.arcs.add(bolt(_b, back, 0.3), 0.009 * o.scale, 2.0, 2.6, 4.6, R(0.1, 0.18)); }
          else S.arcs.add(bolt(_a, _b, 0.35, 3), 0.008 * o.scale, 2.2, 2.8, 4.6, R(0.08, 0.14));
        } else {   // from one place on it to another
          o.pick(_b);
          if (_a.distanceTo(_b) > 0.4 * o.scale) _b.lerp(_a, 0.6);
          S.arcs.add(bolt(_a, _b, 0.25), 0.008 * o.scale, 2.0, 2.6, 4.4, R(0.08, 0.15));
        }
        for (let s = 0; s < 3; s++) S.spark.emit(_b, rnd(_c).multiplyScalar(R(0.4, 1.0)), R(0.12, 0.3), 0.004 * o.scale, 0.001, 2.0, 2.4, 3.2, { drag: 2, grav: 1.5, str: 4 });
      }
      o.flick = 1;
    }
    o.flick = Math.max(0, (o.flick || 0) - dt * 14);
    S.sheath(o, 30 * k + 10, 0.06, (0.2 + o.flick * 0.4) * k, (0.32 + o.flick * 0.5) * k, (0.8 + o.flick) * k, [0.05, 0.14]);
    S.glow(o, 0.6, 0.75, 1.0, (0.12 + 0.6 * o.flick) * k);
  },
  venom(S, o, k, top, dt) {
    S.each(S.rate(10 + 24 * k) * (1 + o.swing * 2) * dt, () => {
      for (let t = 0; t < 3; t++) { o.pick(_m, _n); if (_n.dot(S.up) < 0.1) break; }   // (from the underside, mostly)
      _b.copy(_n).multiplyScalar(0.02).addScaledVector(S.up, -0.03);
      S.spark.emit(_m, _b, R(0.5, 0.9), 0.008 * o.scale, 0.006 * o.scale, 0.35, 1.7, 0.25, { drag: 0.5, grav: 1.7, str: 9, rot: 0 });
    });
    S.each(S.rate(10 + 16 * k) * dt, () => { const i = o.pick(_m); S.core.emit(_m, _c.set(0, 0, 0), R(0.4, 0.9), R(0.006, 0.013) * o.scale, 0.016 * o.scale, 0.3, 1.25, 0.2, { own: o.id, lp: o.local(i) }); });
    S.each(S.rate(5 + 10 * k) * dt, () => { o.pick(_m); _b.copy(S.up).multiplyScalar(R(0.03, 0.07)).add(rnd().multiplyScalar(0.02)); S.soft.emit(_m, _b, R(1.2, 2.0), 0.03 * o.scale, 0.11 * o.scale, 0.06 * k, 0.22 * k, 0.03 * k, { drag: 0.9, wob: 0.15 }); });
    S.sheath(o, 16 + 20 * k, 0.055, 0.1 * k, 0.5 * k, 0.06 * k);
    if (top >= (S.gpu ? 4 : 5)) S.sheath(o, 14, 0.09, 0.14, 0.62, 0.06, [0.25, 0.4]);
    S.glow(o, 0.35, 1.0, 0.25, 0.22 * k);
  },
  arcane(S, o, k, top, dt) {
    const n = [1, 1, 2, 3, 4, 6][top] + (k > 1 ? 1 : 0) + (S.gpu && top >= 4 ? 2 : 0);
    S.orbiters(o, n, k, dt, { r: 1.0, w: 2.6, core: [2.4, 1.3, 3.4], trail: [1.0, 0.35, 2.2], size: 0.018 });
    if (top >= 4) S.orbiters(o, Math.ceil(n / 2), k * 0.7, dt, { r: 1.7, w: -1.7, core: [1.8, 1.1, 3.0], trail: [0.6, 0.25, 1.6], size: 0.011, key: 'b', u: [0.2, 0.8] });
    S.each(S.rate(8 + 14 * k) * dt, () => { o.pick(_m, _n); _m.addScaledVector(_n, 0.015); _b.copy(rnd()).multiplyScalar(0.03); S.star.emit(_m, _b, R(0.3, 0.6), R(0.01, 0.02) * o.scale, 0.002, 1.7, 1.0, 2.7, { spin: R(-3, 3), drag: 2 }); });
    if (top >= (S.gpu ? 4 : 5)) {   // now and then a thread of light from an orb to the blade, and a ring turning at the guard
      if (Math.random() < dt * 5 && o.orbs?.length) { const q = o.orbs[Math.floor(Math.random() * o.orbs.length)]; o.pick(_b); S.arcs.add(bolt(q, _b, 0.18, 3), 0.0028 * o.scale, 1.5, 0.6, 2.6, 0.12); }
      if (o.kind === 'blade' && Math.random() < dt * 3) S.ring.emit(_c.set(0, o.y0 + (o.y1 - o.y0) * 0.05, 0), _a.set(0, 0, 0), 0.9, 0.06 * o.scale, 0.11 * o.scale, 1.0, 0.45, 1.8, { own: o.id, lp: _c, spin: 1.5 });
    }
    S.glow(o, 0.75, 0.4, 1.0, 0.3 * k);
  },
  holy(S, o, k, top, dt) {
    S.each(S.rate(20 * k + 8) * dt, () => { const i = o.pick(_m); S.soft.emit(_m, _c.set(0, 0, 0), R(0.35, 0.6), 0.05 * o.scale, 0.04 * o.scale, 0.38 * k, 0.3 * k, 0.15 * k, { own: o.id, lp: o.local(i) }); });
    S.each(S.rate(8 + 18 * k) * (1 + o.swing) * dt, () => { o.pick(_m); _b.copy(S.up).multiplyScalar(R(0.05, 0.12)).add(rnd().multiplyScalar(0.02)); S.soft.emit(_m, _b, R(1.4, 2.4), 0.009 * o.scale, 0.004, 2.2, 1.8, 0.8, { drag: 0.6, grav: -0.02, wob: 0.12 }); });
    S.each(S.rate(4 + 9 * k) * dt, () => { const i = o.pick(_m); S.star.emit(_m, _c.set(0, 0, 0), R(0.3, 0.7), R(0.02, 0.04) * o.scale, 0.003, 2.6, 2.3, 1.6, { own: o.id, lp: o.local(i), spin: R(-1, 1) }); });
    if (top >= (S.gpu ? 4 : 5)) S.each(S.rate(5) * dt, () => {   // rays of light standing out from it
      _c.set(0, o.y0 + (o.y1 - o.y0) * R(0.2, 0.8), 0);
      if (o.kind !== 'blade') _c.copy(o.center);
      S.spark.emit(_c, _a.set(0, 0, 0), R(0.8, 1.4), 0.2 * o.scale, 0.26 * o.scale, 0.5, 0.42, 0.2, { own: o.id, lp: _c.clone(), rot: Math.random() * 6.28, spin: R(-0.2, 0.2) });
    });
    S.glow(o, 1.0, 0.85, 0.6, 0.32 * k);
  },
  blood(S, o, k, top, dt) {
    S.each(S.rate(8 + 20 * k) * (1 + o.swing * 2) * dt, () => {
      for (let t = 0; t < 3; t++) { o.pick(_m, _n); if (_n.dot(S.up) < 0.2) break; }
      _b.copy(_n).multiplyScalar(0.015).addScaledVector(S.up, -0.02);
      S.blood.emit(_m, _b, R(0.5, 0.85), 0.009 * o.scale, 0.006 * o.scale, 0.32, 0.0, 0.02, { drag: 0.4, grav: 1.9 });
    });
    S.each(S.rate(6 + 10 * k) * dt, () => { o.pick(_m); _b.copy(rnd()).multiplyScalar(0.02).addScaledVector(S.up, 0.01); S.soft.emit(_m, _b, R(1, 1.8), 0.03 * o.scale, 0.1 * o.scale, 0.2 * k, 0.01, 0.025 * k, { drag: 1 }); });
    S.sheath(o, 18 + 18 * k, 0.06, 0.5 * k, 0.0, 0.04 * k, [0.3, 0.5]);
    if (top >= (S.gpu ? 4 : 5)) S.orbiters(o, 5, k, dt, { r: 1.2, w: 3.2, core: [1.0, 0.02, 0.06], trail: [0.5, 0.0, 0.03], size: 0.009, blood: true });
    S.glow(o, 1.0, 0.1, 0.12, 0.2 * k);
  },
  void(S, o, k, top, dt) {
    S.each(S.rate(14 + 30 * k) * dt, () => {   // the light drawn in
      o.pick(_a);
      const life = R(0.35, 0.6);
      _m.copy(_a).add(rnd().normalize().multiplyScalar(R(0.06, 0.16) * o.scale));
      _b.subVectors(_a, _m).divideScalar(life);
      S.spark.emit(_m, _b, life, 0.0045 * o.scale, 0.001, 1.1, 0.45, 2.2, { drag: 0, str: 2 });
    });
    S.each(S.rate(6 + 12 * k) * dt, () => { o.pick(_m); _b.copy(S.up).multiplyScalar(R(0.02, 0.05)).add(rnd().multiplyScalar(0.02)); S.smoke.emit(_m, _b, R(0.8, 1.4), 0.02 * o.scale, 0.07 * o.scale, 0.05, 0.0, 0.09, { drag: 1, wob: 0.2 }); });
    S.sheath(o, 14 + 14 * k, 0.05, 0.22 * k, 0.05 * k, 0.5 * k);
    if (top >= 4) S.orbiters(o, top >= 5 ? 4 : 2, k, dt, { r: 1.3, w: -2.0, core: [0.9, 0.25, 1.8], trail: [0.25, 0.05, 0.6], size: 0.014, dark: true });
    S.glow(o, 0.5, 0.2, 1.0, 0.14 * k);
  },
  star(S, o, k, top, dt) {
    const sw = 1 + o.swing * 2.5;
    S.each(S.rate(150) * sw * dt, () => {
      o.pick(_m, _n);
      _b.copy(S.up).multiplyScalar(R(0.18, 0.4)).addScaledVector(_n, 0.06).add(rnd().multiplyScalar(0.05));
      const hot = Math.random();
      S.flame.emit(_m, _b, R(0.3, 0.55), 0.05 * o.scale, 0.014, 0.3 + hot * 1.4, 2.2 + hot * 0.9, 0.5 + hot * 0.9, { drag: 1.6, grav: -0.35, str: -1 });
    });
    S.sheath(o, 34, 0.06, 0.12, 0.6, 0.18);
    S.each(S.rate(26) * (1 + o.swing * 3) * dt, () => { o.pick(_m); _b.copy(S.up).multiplyScalar(R(0.3, 0.7)).add(rnd().multiplyScalar(0.3)); S.spark.emit(_m, _b, R(0.6, 1.2), 0.005 * o.scale, 0.002, 1.2, 3.2, 1.4, { drag: 1, grav: -0.2, str: 3, wob: 0.5 }); });
    S.each(S.rate(14) * dt, () => { const i = o.pick(_m); S.star.emit(_m, _c.set(0, 0, 0), R(0.25, 0.5), R(0.02, 0.04) * o.scale, 0.003, 2.2, 3.2, 2.4, { own: o.id, lp: o.local(i), spin: R(-2, 2) }); });
    S.orbiters(o, S.gpu ? 4 : 3, 1.2, dt, { r: 1.2, w: 2.0, core: [1.8, 3.4, 2.0], trail: [0.5, 2.0, 0.7], size: 0.02, long: true });
    S.glow(o, 0.4, 1.0, 0.5, 0.55 * (0.85 + 0.15 * Math.sin(S.t * 9)));
  },
};

// the armour's, about you: gentler, below the eye, away from your face
const AURA = {
  fire: [6, (S, p, k) => S.wspark.emit(p, _b.set(R(-0.1, 0.1), R(0.4, 0.8), R(-0.1, 0.1)), R(0.8, 1.6), 0.012, 0.004, 3, 1.4, 0.35, { drag: 0.8, grav: -0.3, str: 2, wob: 0.5 })],
  frost: [4, (S, p, k) => { p.y -= 0.6; S.wsoft.emit(p, _b.set(R(-0.1, 0.1), 0.02, R(-0.1, 0.1)), R(1.5, 2.5), 0.12, 0.4, 0.06 * k, 0.1 * k, 0.16 * k, { drag: 1 }); }],
  lightning: [3, (S, p) => { for (let i = 0; i < 4; i++) S.wspark.emit(p, rnd(_b).multiplyScalar(2), R(0.1, 0.25), 0.012, 0.003, 2, 2.4, 3.2, { drag: 3, grav: 2, str: 2 }); }],
  venom: [4, (S, p, k) => S.wsoft.emit(p, _b.set(R(-0.05, 0.05), R(0.05, 0.12), R(-0.05, 0.05)), R(1.4, 2.2), 0.03, 0.12, 0.05 * k, 0.2 * k, 0.03 * k, { drag: 0.8 })],
  arcane: [0, null],   // (it circles you: below)
  holy: [5, (S, p) => S.wsoft.emit(p, _b.set(R(-0.03, 0.03), R(0.15, 0.3), R(-0.03, 0.03)), R(1.4, 2.4), 0.022, 0.008, 2.0, 1.7, 0.8, { drag: 0.5, wob: 0.1 })],
  blood: [4, (S, p, k) => { p.y -= 0.6; S.wsoft.emit(p, _b.set(R(-0.05, 0.05), 0.02, R(-0.05, 0.05)), R(1.5, 2.5), 0.1, 0.35, 0.16 * k, 0.0, 0.02 * k, { drag: 1 }); }],
  void: [4, (S, p) => S.wsmoke.emit(p, _b.set(R(-0.05, 0.05), R(0.06, 0.12), R(-0.05, 0.05)), R(1, 1.8), 0.05, 0.16, 0.04, 0, 0.07, { drag: 0.8, wob: 0.2 })],
  star: [7, (S, p) => S.wspark.emit(p, _b.set(R(-0.1, 0.1), R(0.4, 0.8), R(-0.1, 0.1)), R(0.8, 1.6), 0.012, 0.004, 1.0, 3.2, 1.2, { drag: 0.8, grav: -0.3, str: 2, wob: 0.5 })],
};

// ------------------------------------------------------------------ the system
export class GemFx {
  /** vm: the view model (viewmodel.js); world: the scene; opts: {touch, hi, renderer}. */
  constructor(vm, world, { touch = false, hi = true, renderer = null } = {}) {
    this.vm = vm; this.world = world;
    this.gpu = !!renderer?.isWebGPURenderer;
    this.q = touch ? 0.38 : this.gpu ? 1.8 : hi ? 1 : 0.6;   // how much of everything
    const T = textures(this.gpu ? 128 : 64), big = this.gpu ? 2.2 : touch ? 0.4 : 1;
    const S = vm.scene;
    this.flame = new Pool(S, T.flame, Math.round(900 * big));
    this.soft = new Pool(S, T.soft, Math.round(1100 * big));
    this.core = new Pool(S, T.core, Math.round(500 * big));
    this.spark = new Pool(S, T.spark, Math.round(700 * big));
    this.star = new Pool(S, T.star, Math.round(300 * big));
    this.ring = new Pool(S, T.ring, 24);
    this.smoke = new Pool(S, T.puff, Math.round(220 * big), 'normal', 5);
    this.blood = new Pool(S, T.puff, Math.round(260 * big), 'normal', 5);
    this.arcs = new Ribbons(S, T.across, Math.round(500 * big));
    // about you, in the world
    this.wsoft = new Pool(world, T.soft, Math.round(300 * big));
    this.wspark = new Pool(world, T.spark, Math.round(260 * big));
    this.wsmoke = new Pool(world, T.puff, Math.round(120 * big), 'normal', 5);
    this.vmPools = [this.flame, this.soft, this.core, this.spark, this.star, this.ring, this.smoke, this.blood];
    // (the hands' scene is drawn smaller than the world's: everything in it a little larger; and over the
    // steel, not sunk half into it: the points are on its very surface)
    for (const p of this.vmPools) { p.boost = 1.6; p.mat.depthTest = false; }
    this.arcs.mesh.material.depthTest = false;
    this.worldPools = [this.wsoft, this.wspark, this.wsmoke];
    for (const p of this.worldPools) p.boost = 1.8;   // (seen at arm's length and more: a little larger)
    // the light a gem throws on your hands (in the view model's scene from the start: the hands'
    // shaders are made with it)
    this.light = new THREE.PointLight(0xffffff, 0, 1.4, 2);
    S.add(this.light);
    this.owners = [new Owner(0, 'blade'), new Owner(1, 'blade'), new Owner(2, 'hand'), new Owner(3, 'hand')];
    this.aura = { looks: [], orbs: [] };
    this.mats = [];
    this.up = new THREE.Vector3(0, 1, 0);
    this.qLast = new THREE.Quaternion(); this.comp = new THREE.Quaternion(); this.qInv = new THREE.Quaternion();
    this.t = 0; this.best = null;
    this.basis = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }

  /** What's worn now (gear.js's character): which looks go where. */
  setGear(char) {
    const e = char?.equip || {};
    const w = e.weapon, o = e.offhand && e.weapon?.kind !== 'twohand' ? e.offhand : null;
    this.owners[0].looks = gemLooks(w); this.owners[0].item = w;
    this.owners[1].looks = gemLooks(o); this.owners[1].item = o;
    const h = gemLooks(e.hands);
    this.owners[2].looks = h; this.owners[3].looks = h;
    const worn = { sockets: ['head', 'body', 'legs', 'feet', 'ring1', 'ring2', 'ring3', 'ring4'].flatMap((s) => e[s]?.sockets || []) };
    this.aura.looks = gemLooks(worn);
    this.any = this.owners.some((q) => q.looks.length) || this.aura.looks.length;
  }

  /** Points on what's in a hand (once for each thing put there). */
  fit(o, side) {
    const arm = this.vm.arms?.[side];
    if (o.kind === 'hand') {
      const hand = arm?.hand;
      if (!hand) { o.obj = null; return; }
      if (o.obj === hand && o.pts.length) return;
      o.obj = hand;
      // toward the fingers (the hand's children) and back up the wrist (to its parent)
      const kids = hand.children.filter((c) => c.isBone || c.type === 'Bone');
      // (the rig's bones may be scaled: everything here is measured in metres, then brought into the bone's frame)
      hand.updateWorldMatrix(true, false);
      const ws = Math.max(1e-4, new THREE.Vector3().setFromMatrixScale(hand.matrixWorld).x), toLocal = 1 / ws;
      const fwd = new THREE.Vector3();
      for (const c of kids) fwd.add(c.position);
      if (fwd.lengthSq() < 1e-12) fwd.set(0, 1, 0);
      const len = Math.min(0.12, Math.max(0.05, fwd.length() * ws / Math.max(1, kids.length) * 1.6));
      fwd.normalize();
      const back = hand.position.clone().multiplyScalar(-1).applyQuaternion(hand.quaternion.clone().invert());
      const pws = hand.parent ? Math.max(1e-4, new THREE.Vector3().setFromMatrixScale(hand.parent.matrixWorld).x) : ws;
      const blen = Math.min(0.12, back.length() * pws * 0.45);
      if (back.lengthSq() < 1e-12) back.copy(fwd).multiplyScalar(-1);
      back.normalize();
      o.pts = []; o.nrm = [];
      for (let i = 0; i < 160; i++) {
        const along = Math.random(), up = Math.random() < 0.6;
        const p = up ? fwd.clone().multiplyScalar(along * len) : back.clone().multiplyScalar(along * blen);
        const n = rnd(new THREE.Vector3()).normalize();
        p.addScaledVector(n, 0.03 + Math.random() * 0.012).multiplyScalar(toLocal);
        o.pts.push(p); o.nrm.push(n);
      }
      o.axis = 'dir'; o.dir = fwd.clone().multiplyScalar(toLocal); o.side1 = new THREE.Vector3().crossVectors(fwd, Math.abs(fwd.y) < 0.9 ? UPW : new THREE.Vector3(1, 0, 0)).normalize(); o.side2 = new THREE.Vector3().crossVectors(fwd, o.side1);
      o.side1.multiplyScalar(toLocal); o.side2.multiplyScalar(toLocal);
      o.y0 = -blen * 0.5; o.y1 = len; o.r = 0.055; o.scale = 0.75; o.center.set(0, 0, 0);
      return;
    }
    const item = arm?.item;
    if (!item) { o.obj = null; o.pts = []; return; }
    if (o.obj === item && o.pts.length) return;
    o.obj = item;
    const shield = /shield/.test(this.vm.equip?.[side] || '');
    const staff = this.vm.equip?.[side] === 'staff';
    // the model's extent, in its own frame
    let [P] = sampleSurface(item, 300);
    const box = new THREE.Box3().setFromPoints(P.length ? P : [new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
    const h = box.max.y - box.min.y;
    const cut = shield ? -Infinity : box.min.y + h * (staff ? 0.6 : 0.2);
    const [pts, nrm] = sampleSurface(item, 260, (p) => p.y > cut);
    o.pts = pts.length ? pts : [new THREE.Vector3(0, 0.3, 0)]; o.nrm = nrm.length ? nrm : [new THREE.Vector3(0, 0, 1)];
    o.kind = shield ? 'shield' : 'blade';
    const kb = new THREE.Box3().setFromPoints(o.pts);
    kb.getCenter(o.center);
    if (shield) {   // a shield's look circles its face
      o.axis = 'z'; o.y0 = 0; o.y1 = 1; o.mid = o.center.y;
      o.r = Math.max(kb.max.x - kb.min.x, kb.max.y - kb.min.y) * 0.58;
      o.scale = Math.max(0.8, Math.min(1.6, o.r / 0.25));
    } else {
      o.axis = 'y'; o.y0 = kb.min.y; o.y1 = kb.max.y;
      const rad = o.pts.map((p) => Math.hypot(p.x, p.z)).sort((a, b) => a - b);   // (most of it: a guard or a head sticks out)
      o.r = Math.min(0.11, (rad[Math.floor(rad.length * 0.7)] || 0.02) + 0.05);
      o.scale = Math.max(0.8, Math.min(1.7, (kb.max.y - kb.min.y) / 0.62));
    }
    o.tipLast = null;
  }

  /** A glow fixed over the surface (a sheath of the gem's light on the steel). */
  sheath(o, rate, size, r, g, b, life = [0.22, 0.4]) { this.each(this.rate(rate) * this.lastDt, () => { const i = o.pick(_m); this.soft.emit(_m, _c.set(0, 0, 0), R(life[0], life[1]), size * o.scale, size * 0.7 * o.scale, r, g, b, { own: o.id, lp: o.local(i) }); }); }

  /** How many to make this frame for `n` (a fraction makes one now and then). */
  each(n, fn) { let k = Math.floor(n); if (Math.random() < n - k) k++; for (let i = 0; i < k; i++) fn(); }
  rate(r) { return r * this.q; }

  /** Glow light on the hands from the strongest look: keeps the brightest asked for this frame. */
  glow(o, r, g, b, k) {
    if (o.kind === 'aura' || !(k > 0)) return;
    if (!this.best || k > this.best.k) this.best = { k, r, g, b, at: _m.copy(o.center).applyMatrix4(o.M).clone() };
  }

  /** Lights wheeling about the owner, each leaving a trail. o.r: how far out; w: how fast (and
   * which way); core, trail: their colours; key: a second ring of them. */
  orbiters(o, n, k, dt, { r = 1, w = 2, core, trail, size = 0.016, key = 'a', u = [0.15, 0.95], dark = false, blood = false, long = false }) {
    const list = (o.orbs ||= []);
    if (key === 'a') list.length = 0;
    for (let i = 0; i < n; i++) {
      const ph = (i / n) * Math.PI * 2 + (key === 'b' ? 0.7 : 0);
      const a = this.t * w + ph;
      const uu = u[0] + (u[1] - u[0]) * (0.5 + 0.5 * Math.sin(this.t * (0.9 + i * 0.13) + ph * 1.7));
      const p = o.orbit(new THREE.Vector3(), uu, a, o.r * r * (0.9 + 0.1 * Math.sin(this.t * 3 + i)));
      list.push(p);
      const s = size * o.scale * (0.85 + 0.25 * k);
      if (dark) { this.smoke.emit(p, _b.set(0, 0, 0), 0.05, s * 1.4, s * 1.4, 0.02, 0, 0.04); this.soft.emit(p, _b, 0.05, s * 3, s * 3, core[0] * 0.3, core[1] * 0.3, core[2] * 0.3); }
      else if (blood) this.blood.emit(p, _b.set(0, 0, 0), 0.05, s, s, core[0], core[1], core[2]);
      else { this.core.emit(p, _b.set(0, 0, 0), 0.05, s, s, core[0], core[1], core[2]); this.soft.emit(p, _b, 0.05, s * 3.2, s * 3.2, core[0] * 0.18, core[1] * 0.18, core[2] * 0.18); }
      const tl = long ? 0.55 : 0.32;
      if (blood) this.blood.emit(p, _b.set(0, 0, 0), tl, s * 0.7, 0.001, trail[0], trail[1], trail[2]);
      else this.soft.emit(p, _b.set(0, 0, 0), R(tl * 0.7, tl), s * 1.2, 0.001, trail[0], trail[1], trail[2]);
      if (long && Math.random() < 0.5) this.spark.emit(p, rnd(_c).multiplyScalar(0.2), 0.5, s * 0.3, 0.001, trail[0] * 1.5, trail[1] * 1.5, trail[2] * 1.5, { str: 2, drag: 2 });
    }
  }

  /** Each frame, after the hands have moved (vm.update) and before the picture. */
  update(dt, camera, player) {
    this.t += dt; this.lastDt = dt;
    const vm = this.vm;
    // the world's up in the hands' space, and how the view turned since the last frame
    this.qInv.copy(camera.quaternion).invert();
    this.up.set(0, 1, 0).applyQuaternion(this.qInv);
    this.comp.copy(this.qInv).multiply(this.qLast);
    this.comp.slerp(NOTURN, 0.2);   // (most of the way: the hands' view is narrower than the world's)
    this.qLast.copy(camera.quaternion);
    this.best = null;
    const mats = [];
    if (this.any && vm.arms?.R) {
      const sides = ['R', 'L', 'R', 'L'];
      this.owners.forEach((o, i) => {
        if (!o.looks.length) { mats[i] = null; return; }
        this.fit(o, sides[i]);
        const shown = o.obj && (o.kind === 'hand' || o.obj.visible) && vm.arms[sides[i]]?.scene?.visible !== false;
        if (!shown || !o.pts.length) { mats[i] = null; return; }
        o.M.copy(o.obj.matrixWorld);
        mats[i] = o.M;
        // how fast its tip is going (a swing): more of everything streams off it
        _a.set(0, o.y1, 0).applyMatrix4(o.M);
        if (o.tipLast && dt > 0) o.swing += (Math.min(2, _a.distanceTo(o.tipLast) / dt / 2.6) - o.swing) * Math.min(1, dt * 12);
        o.tipLast = (o.tipLast || new THREE.Vector3()).copy(_a);
        for (const L of o.looks) LOOK[L.fx]?.(this, o, L.k * (o.kind === 'hand' ? 0.6 : 1), L.top, dt, this.t);
      });
    }
    for (const p of this.vmPools) p.update(dt, this.up, mats, null, this.comp, this.t);
    this.arcs.update(dt, _c.set(0, 0, 0));
    // the light on the hands
    const b = this.best;
    if (b) { this.light.color.setRGB(b.r, b.g, b.b); this.light.intensity += (Math.min(1.4, b.k * 1.6) - this.light.intensity) * Math.min(1, dt * 18); this.light.position.copy(b.at); }
    else this.light.intensity = Math.max(0, this.light.intensity - dt * 4);
    // about you, the armour's
    const e = camera.matrixWorld.elements;
    this.basis[0].set(e[0], e[1], e[2]).normalize(); this.basis[1].set(e[4], e[5], e[6]).normalize(); this.basis[2].set(e[8], e[9], e[10]).normalize();
    if (this.aura.looks.length && player) {
      for (const L of this.aura.looks) {
        const [rate, emit] = AURA[L.fx] || [0, null];
        if (L.fx === 'arcane' || L.fx === 'star') {   // motes circling you at the waist
          const n = L.fx === 'star' ? 3 : 2 + (L.top >= 4 ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const a = this.t * 1.4 + (i / n) * 6.283, p = _m.set(player.pos.x + Math.cos(a) * 0.75, player.pos.y + 0.8 + Math.sin(this.t * 2 + i) * 0.12, player.pos.z + Math.sin(a) * 0.75);
            const c = L.fx === 'star' ? [1.0, 2.6, 1.2] : [1.6, 0.7, 2.6];
            this.wsoft.emit(p, _b.set(0, 0, 0), 0.4, 0.03, 0.002, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6);
            this.wsoft.emit(p, _b, 0.04, 0.02, 0.02, c[0], c[1], c[2]);
          }
        }
        if (emit) this.each(rate * Math.min(1.4, L.k) * this.q * dt * (player.speed > 1 ? 1.5 : 1), () => {
          const a = Math.random() * 6.283, r = R(0.55, 0.95);
          emit(this, _m.set(player.pos.x + Math.cos(a) * r, player.pos.y + R(0.1, 1.1), player.pos.z + Math.sin(a) * r), L.k);
        });
      }
    }
    for (const p of this.worldPools) p.update(dt, UPW, [], this.basis, null, this.t);
  }

  /** Everything gone at once (a new game, the opening). */
  clear() { for (const p of [...this.vmPools, ...this.worldPools]) p.clear(); this.arcs.clear(); this.light.intensity = 0; }
}
