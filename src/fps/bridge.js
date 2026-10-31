// The sexton's rope bridge over the Mourning Gulf: simulated, not animated. Two deck cables with a
// plank lashed across them every half metre, two hand ropes above on hangers, all of it Verlet
// points held by distance constraints (the planks keep the cables apart and square; the hangers
// only pull). Gravity sags it, a draught moves it, and whoever is on it weighs it down where they
// stand, so it dips under you, rolls when you keep to one side, bounces with your steps and with
// your landing, and swings you with it. A run of planks a third of the way over is gone: jump it,
// or fall. The dead weigh on it too, and the ones that walk into the gap fall.
//
// It is a moving surface for the physics (physics.dynamic): floorAt gives the deck under you, slide
// keeps you between the hand ropes unless you jump over them.
import * as THREE from 'three';
import { TOUCH } from './input.js';

const SEG = 0.5;          // between planks (metres)
const SLACK = 0.018;      // how much longer the cables are than the span (it hangs a good 2.5 m at its middle)
const NODE_KG = 3.2;      // a plank and its lashings
const G_BR = 13;          // (a little more than earth's: it settles crisply)
const ITER = TOUCH ? 10 : 22, SUB = TOUCH ? 1 : 2;   // (a phone: a softer, cheaper solve)

export class RopeBridge {
  /** a, b: the deck's ends [x, y, z] (anchored at the posts); width; gap: [first, last] plank missing. */
  constructor(ctx, { a, b, width = 1.5, gap = null, planks = 'town_repaired_planks' }) {
    this.ctx = ctx;
    const A = this.A = new THREE.Vector3(...a), B = this.B = new THREE.Vector3(...b);
    const span = this.span = Math.hypot(B.x - A.x, B.z - A.z);
    this.dir = new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize();
    this.across = new THREE.Vector3(-this.dir.z, 0, this.dir.x);     // (the deck's left to right)
    const N = this.N = Math.round(span / SEG);
    this.hw = width / 2;
    this.gap = gap;
    // the points: deck L and R (0..N), hand ropes L and R over every second deck point (0..N/2)
    const M = this.M = Math.floor(N / 2);
    const count = 2 * (N + 1) + 2 * (M + 1);
    this.p = new Float32Array(count * 3); this.pp = new Float32Array(count * 3);
    this.w = new Float32Array(count);       // inverse masses (0: anchored)
    this.load = new Float32Array(count);    // what stands on each this frame (kg)
    const dl = (i) => i, dr = (i) => N + 1 + i, rl = (j) => 2 * (N + 1) + j, rr = (j) => 2 * (N + 1) + M + 1 + j;
    this.ix = { dl, dr, rl, rr };
    const sag = 0.08 * span;
    const put = (n, s, side, up) => {
      const f = s / span, x = A.x + (B.x - A.x) * f + this.across.x * side, z = A.z + (B.z - A.z) * f + this.across.z * side;
      const y = A.y + (B.y - A.y) * f - sag * 4 * f * (1 - f) + up;
      this.p.set([x, y, z], n * 3); this.pp.set([x, y, z], n * 3);
    };
    for (let i = 0; i <= N; i++) { put(dl(i), i * span / N, -this.hw, 0); put(dr(i), i * span / N, this.hw, 0); }
    // (the hand ropes' ends are made fast high on the posts)
    for (let j = 0; j <= M; j++) { const s = Math.min(span, j * 2 * span / N), up = j === 0 || j === M ? 1.95 : 1.05; put(rl(j), s, -this.hw - 0.08, up); put(rr(j), s, this.hw + 0.08, up); }
    for (let n = 0; n < count; n++) this.w[n] = 1 / NODE_KG;
    for (const n of [dl(0), dr(0), dl(N), dr(N), rl(0), rr(0), rl(M), rr(M)]) this.w[n] = 0;
    // the constraints: [a, b, rest, kind] (kind 1: a rope that only pulls)
    const C = [];
    const len = (a2, b2) => Math.hypot(this.p[a2 * 3] - this.p[b2 * 3], this.p[a2 * 3 + 1] - this.p[b2 * 3 + 1], this.p[a2 * 3 + 2] - this.p[b2 * 3 + 2]);
    const rest = span * (1 + SLACK) / N;
    for (let i = 0; i < N; i++) {
      C.push([dl(i), dl(i + 1), rest, 0], [dr(i), dr(i + 1), rest, 0]);
      C.push([dl(i), dr(i + 1), Math.hypot(rest, width), 0], [dr(i), dl(i + 1), Math.hypot(rest, width), 0]);
    }
    for (let i = 0; i <= N; i++) C.push([dl(i), dr(i), width, 0]);
    for (let j = 0; j < M; j++) C.push([rl(j), rl(j + 1), len(rl(j), rl(j + 1)) * 1.004, 1], [rr(j), rr(j + 1), len(rr(j), rr(j + 1)) * 1.004, 1]);
    this.hang = [];
    for (let j = 1; j < M; j++) for (const i of [j * 2 - 1, j * 2 + 1]) {
      if (i < 0 || i > N) continue;
      this.hang.push([rl(j), dl(i)], [rr(j), dr(i)]);
      C.push([rl(j), dl(i), len(rl(j), dl(i)), 1], [rr(j), dr(i), len(rr(j), dr(i)), 1]);
    }
    this.C = C;
    // tethers: no deck point further from either end than the cable between them (stops the stretch
    // a heavy load would put in a soft solve)
    this.tether = [];
    // (each measured from its own cable's anchors, not the deck's middle)
    for (let i = 1; i < N; i++) { this.tether.push([dl(i), i * rest, (N - i) * rest, dl(0), dl(N)]); this.tether.push([dr(i), i * rest, (N - i) * rest, dr(0), dr(N)]); }
    this.t = 0;
    this.prevC = new Float32Array((N + 1) * 3);    // the deck's middle line last frame (to carry you with it)
    for (let k = 0; k < 400; k++) this.step(1 / 120);  // settle
    this.mid(this.prevC);
    this.bbox();
    this.riders = new Map();
  }

  bbox() { // the physics' first test: a box round the deck, with room for its swing
    const xs = [this.A.x, this.B.x], zs = [this.A.z, this.B.z];
    this.x0 = Math.min(...xs) - 2.5; this.x1 = Math.max(...xs) + 2.5; this.z0 = Math.min(...zs) - 0.5; this.z1 = Math.max(...zs) + 0.5;
  }

  /** The middle line of the deck (one point a plank row) into out. */
  mid(out) {
    const { dl, dr } = this.ix, p = this.p;
    for (let i = 0; i <= this.N; i++) for (let c = 0; c < 3; c++) out[i * 3 + c] = (p[dl(i) * 3 + c] + p[dr(i) * 3 + c]) / 2;
  }

  step(h) {
    const { p, pp, w, load } = this, n = w.length;
    this.t += h;
    // a slow draught up the gulf
    const gust = 0.35 * Math.sin(this.t * 0.37) + 0.22 * Math.sin(this.t * 1.13 + 1.7);
    for (let q = 0; q < n; q++) {
      if (!w[q]) continue;
      const j = q * 3;
      const vx = (p[j] - pp[j]) * 0.996, vy = (p[j + 1] - pp[j + 1]) * 0.996, vz = (p[j + 2] - pp[j + 2]) * 0.996;
      pp[j] = p[j]; pp[j + 1] = p[j + 1]; pp[j + 2] = p[j + 2];
      p[j] += vx + this.across.x * gust * h * h; p[j + 1] += vy - G_BR * h * h; p[j + 2] += vz + this.across.z * gust * h * h;
    }
    // the masses this step (what stands on it weighs it down where it stands)
    const inv = this.inv ||= new Float32Array(n);
    for (let q = 0; q < n; q++) inv[q] = w[q] ? 1 / (1 / w[q] + load[q]) : 0;
    const C = this.C;
    for (let it = 0; it < ITER; it++) {
      for (let c = 0; c < C.length; c++) {
        const cc = C[c], a = cc[0], b = cc[1], rest = cc[2], rope = cc[3], ia = a * 3, ib = b * 3;
        const dx = p[ib] - p[ia], dy = p[ib + 1] - p[ia + 1], dz = p[ib + 2] - p[ia + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-6 || (rope && d < rest)) continue;
        const wa = inv[a], wb = inv[b], ws = wa + wb;
        if (!ws) continue;
        const k = (d - rest) / d / ws;
        p[ia] += dx * k * wa; p[ia + 1] += dy * k * wa; p[ia + 2] += dz * k * wa;
        p[ib] -= dx * k * wb; p[ib + 1] -= dy * k * wb; p[ib + 2] -= dz * k * wb;
      }
      const tq = this.tether;
      for (let t = 0; t < tq.length; t++) {
        const tt = tq[t], j = tt[0] * 3;
        for (let e = 0; e < 2; e++) {
          const E = (e ? tt[4] : tt[3]) * 3, r = e ? tt[2] : tt[1];
          const dx = p[j] - p[E], dy = p[j + 1] - p[E + 1], dz = p[j + 2] - p[E + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > r) { const k = r / d; p[j] = p[E] + dx * k; p[j + 1] = p[E + 1] + dy * k; p[j + 2] = p[E + 2] + dz * k; }
        }
      }
    }
  }

  /** Where along it (metres from the near end), its plank row, and how far across from its middle. */
  locate(x, z) {
    const s = (x - this.A.x) * this.dir.x + (z - this.A.z) * this.dir.z;
    if (s < -0.3 || s > this.span + 0.3) return null;
    const fi = Math.max(0, Math.min(this.N - 1e-4, s / this.span * this.N)), i = Math.floor(fi), f = fi - i;
    const { dl, dr } = this.ix, p = this.p;
    const lx = p[dl(i) * 3] + (p[dl(i + 1) * 3] - p[dl(i) * 3]) * f, lz = p[dl(i) * 3 + 2] + (p[dl(i + 1) * 3 + 2] - p[dl(i) * 3 + 2]) * f;
    const rx = p[dr(i) * 3] + (p[dr(i + 1) * 3] - p[dr(i) * 3]) * f, rz = p[dr(i) * 3 + 2] + (p[dr(i + 1) * 3 + 2] - p[dr(i) * 3 + 2]) * f;
    const cx = (lx + rx) / 2, cz = (lz + rz) / 2, ax = (rx - lx) / (2 * this.hw), az = (rz - lz) / (2 * this.hw);
    const u = (x - cx) * ax + (z - cz) * az;                    // -hw (the left cable) .. +hw (the right)
    return { s, i, f, u, q: Math.min(1, Math.max(0, (u + this.hw) / (2 * this.hw))), ax, az };
  }

  deckY(L) {
    const { dl, dr } = this.ix, p = this.p, { i, f, q } = L;
    const yl = p[dl(i) * 3 + 1] + (p[dl(i + 1) * 3 + 1] - p[dl(i) * 3 + 1]) * f, yr = p[dr(i) * 3 + 1] + (p[dr(i + 1) * 3 + 1] - p[dr(i) * 3 + 1]) * f;
    return yl + (yr - yl) * q + 0.05;
  }

  missing(k) { return this.gap && k >= this.gap[0] && k <= this.gap[1]; }

  // ---------------------------------------------------------------- the physics' moving surface
  floorAt(x, z, y, r) {
    const L = this.locate(x, z);
    if (!L || Math.abs(L.u) > this.hw + 0.12) return -Infinity;
    // a plank under the foot (anything within its reach of the middle of you)
    const k0 = Math.floor((L.s - r * 0.6) / this.span * this.N), k1 = Math.floor((L.s + r * 0.6) / this.span * this.N);
    let any = false;
    for (let k = Math.max(0, k0); k <= Math.min(this.N - 1, k1); k++) if (!this.missing(k)) { any = true; break; }
    if (!any) return -Infinity;
    const top = this.deckY(L);
    return top <= y + 0.6 ? top : -Infinity;
  }

  /** On the deck, the hand ropes hold you between them (unless you're over them: a jump). */
  slide(p, r) {
    const L = this.locate(p.x, p.z);
    if (!L || L.s < 0.6 || L.s > this.span - 0.6) return;
    const top = this.deckY(L);
    if (p.y < top - 0.8 || p.y > top + 0.95 || Math.abs(L.u) > this.hw + 0.5) return;
    const lim = this.hw - r * 0.55;
    if (Math.abs(L.u) <= lim) return;
    const push = Math.sign(L.u) * lim - L.u;
    p.x += L.ax * push; p.z += L.az * push;
  }

  // ---------------------------------------------------------------- each frame
  /** Load it with whoever stands on it, step it, carry the player with it, and draw it. */
  update(dt, player, bodies) {
    const load = this.load;
    load.fill(0);
    const { dl, dr } = this.ix;
    const weigh = (pos, kg, kick = 0) => {
      const L = this.locate(pos.x, pos.z);
      if (!L || Math.abs(L.u) > this.hw + 0.1 || Math.abs(pos.y - this.deckY(L)) > 0.25) return null;
      const { i, f, q } = L;
      const share = [[dl(i), (1 - f) * (1 - q)], [dl(i + 1), f * (1 - q)], [dr(i), (1 - f) * q], [dr(i + 1), f * q]];
      for (const [n, k] of share) {
        load[n] += kg * k;
        if (kick) this.pp[n * 3 + 1] += kick * k * dt;     // a downward shove (Verlet: move where it was from)
      }
      return L;
    };
    // the player: weight, footfalls, and the landing from a jump
    const was = this.riders.get(player) || { on: false, step: 0, vy: 0 };
    let kick = 0;
    if (player.onGround) {
      if (!was.on && was.vy < -2) kick = Math.min(6, -was.vy * 0.55);
      if (player.speed > 1.2) { was.step += dt * player.speed; if (was.step > 0.9) { was.step = 0; kick += 0.9 + player.speed * 0.06; } }
    }
    const L = weigh(player.pos, 85, kick);
    was.on = !!L && player.onGround; was.vy = player.vel.y;
    this.riders.set(player, was);
    for (const z of bodies) if (!z.gone && z.root?.visible !== false) {
      const kg = 70 * (z.size || 1) ** 2;
      const zr = this.riders.get(z) || { step: 0 };
      zr.step += dt * 1.1;
      let zk = 0;
      if (zr.step > 0.8) { zr.step = 0; zk = 0.6; }
      weigh(z.pos, kg, zk);
      this.riders.set(z, zr);
    }
    // the solve (a fixed step, so it behaves the same at any frame rate)
    this.acc = Math.min(0.1, (this.acc || 0) + dt);
    const H = 1 / 60 / SUB;
    while (this.acc >= 1 / 60) { for (let s = 0; s < SUB; s++) this.step(H); this.acc -= 1 / 60; }
    // carry the player: the deck under you moved, so do you (it's ground under your feet)
    const now = this.now ||= new Float32Array(this.prevC.length);
    this.mid(now);
    if (L && player.onGround) {
      const j = L.i * 3, f = L.f;
      const dx = (now[j] - this.prevC[j]) * (1 - f) + (now[j + 3] - this.prevC[j + 3]) * f;
      const dz = (now[j + 2] - this.prevC[j + 2]) * (1 - f) + (now[j + 5] - this.prevC[j + 5]) * f;
      player.pos.x += dx; player.pos.z += dz;
      // and the deck's roll comes into your view a little
      const yl = this.p[dl(L.i) * 3 + 1], yr = this.p[dr(L.i) * 3 + 1];
      player.roll = Math.atan2(yr - yl, 2 * this.hw) * 0.6;
    } else if (player.roll) player.roll *= Math.max(0, 1 - dt * 4);
    this.prevC.set(now);
    this.draw();
  }

  /** A blast near it throws it about. */
  blast(at, r, k) {
    for (let q = 0; q < this.w.length; q++) {
      if (!this.w[q]) continue;
      const j = q * 3, dx = this.p[j] - at.x, dy = this.p[j + 1] - at.y, dz = this.p[j + 2] - at.z, d = Math.hypot(dx, dy, dz);
      if (d > r) continue;
      const s = (1 - d / r) * k / 60 / (d || 1);
      this.pp[j] -= dx * s; this.pp[j + 1] -= dy * s; this.pp[j + 2] -= dz * s;
    }
  }

  // ---------------------------------------------------------------- drawing
  /** Instanced planks and rope segments, laid on the points each frame. */
  makeMeshes(lib) {
    const N = this.N, M = this.M;
    const plankTex = lib.material('town_repaired_planks', { tile: 1.6 });
    const pm = plankTex.clone(); pm.vertexColors = false;
    const pg = new THREE.BoxGeometry(2 * this.hw + 0.18, 0.06, SEG * 0.86);
    const uv = pg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.0, uv.getY(i) * 0.27);
    this.planks = new THREE.InstancedMesh(pg, pm, N);
    this.planks.receiveShadow = true;
    const rg = new THREE.CylinderGeometry(0.036, 0.036, 1, 6, 1, true).translate(0, 0.5, 0);
    const rm = new THREE.MeshPhongMaterial({ color: 0x4e3c28, specular: 0x1a1510, shininess: 8 });
    this.ropeN = 2 * N + 2 * M + this.hang.length + 2 * N;   // deck cables, hand ropes, hangers, the lashings' cross ties
    this.ropes = new THREE.InstancedMesh(rg, rm, this.ropeN);
    // the sexton's lanterns, hung from the hand ropes every few metres (their flames light the deck)
    this.lamps = [];
    for (let j = 4; j < M - 2; j += 7) this.lamps.push([j, j % 2 ? 1 : -1]);
    const lg = new THREE.BoxGeometry(0.16, 0.24, 0.16), lm = new THREE.MeshPhongMaterial({ color: 0x2a2018, emissive: 0xffa040, emissiveIntensity: 1.6 });
    this.lampMesh = new THREE.InstancedMesh(lg, lm, this.lamps.length);
    for (const [j, side] of this.lamps) { const n = side < 0 ? this.ix.rl(j) : this.ix.rr(j); this.ctx.flames?.push([this.p[n * 3], this.p[n * 3 + 1] - 0.3, this.p[n * 3 + 2], 0.22]); }
    for (const m of [this.planks, this.ropes, this.lampMesh]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.ctx.scene.add(m); }
    // the broken ends at the gap hang down: drawn as planks dangling off their last lashing
    this.draw();
    return [this.planks, this.ropes, this.lampMesh];
  }

  draw() {
    if (!this.planks) return;
    const { dl, dr, rl, rr } = this.ix, p = this.p, N = this.N, M = this.M;
    const m = this._m ||= new THREE.Matrix4(), X = this._x ||= new THREE.Vector3(), Y = this._y ||= new THREE.Vector3(), Z = this._z ||= new THREE.Vector3(), O = this._o ||= new THREE.Vector3();
    const P = (n, v) => v.set(p[n * 3], p[n * 3 + 1], p[n * 3 + 2]);
    const a = this._a ||= new THREE.Vector3(), b = this._b ||= new THREE.Vector3(), c = this._c ||= new THREE.Vector3(), d = this._d ||= new THREE.Vector3();
    for (let k = 0; k < N; k++) {
      P(dl(k), a); P(dr(k), b); P(dl(k + 1), c); P(dr(k + 1), d);
      if (this.missing(k)) {   // gone; the ones at the gap's edges hang down off their last lashing
        const edge = k === this.gap[0] ? 0 : k === this.gap[1] ? 1 : -1;
        if (edge < 0) { m.makeScale(0, 0, 0); this.planks.setMatrixAt(k, m); continue; }
        const [e0, e1] = edge === 0 ? [a, b] : [c, d], far = edge === 0 ? c : a;
        X.copy(e1).sub(e0).normalize();
        Z.set(0, -1, 0).addScaledVector(O.copy(far).sub(e0).normalize(), 0.28).normalize();
        Y.crossVectors(Z, X).normalize(); Z.crossVectors(X, Y);
        O.copy(e0).add(e1).multiplyScalar(0.5).addScaledVector(Z, SEG * 0.43);
        m.makeBasis(X, Y, Z).setPosition(O.x, O.y, O.z);
        this.planks.setMatrixAt(k, m);
        continue;
      }
      O.copy(a).add(b).add(c).add(d).multiplyScalar(0.25);
      X.copy(b).sub(a).add(d).sub(c).normalize();
      Z.copy(c).sub(a).add(d).sub(b).normalize();
      Y.crossVectors(Z, X).normalize(); Z.crossVectors(X, Y);
      m.makeBasis(X, Y, Z).setPosition(O.x, O.y + 0.01, O.z);
      this.planks.setMatrixAt(k, m);
    }
    this.planks.instanceMatrix.needsUpdate = true;
    let r = 0;
    const rope = (n0, n1, drop = 0) => {
      P(n0, a); P(n1, b); b.y -= drop;
      const L = a.distanceTo(b) || 1e-3;
      Y.copy(b).sub(a).divideScalar(L);
      const q = this._q ||= new THREE.Quaternion();
      q.setFromUnitVectors(this._up ||= new THREE.Vector3(0, 1, 0), Y);
      m.compose(a, q, this._s ||= new THREE.Vector3()); this._s.set(1, L, 1);
      m.compose(a, q, this._s);
      this.ropes.setMatrixAt(r++, m);
    };
    for (let i = 0; i < N; i++) { rope(dl(i), dl(i + 1)); rope(dr(i), dr(i + 1)); }
    for (let j = 0; j < M; j++) { rope(rl(j), rl(j + 1)); rope(rr(j), rr(j + 1)); }
    for (const [a2, b2] of this.hang) rope(a2, b2);
    for (let i = 0; i < N; i++) { rope(dl(i), dr(i)); rope(dl(i + 1), dr(i + 1)); }
    this.ropes.count = r;
    this.ropes.instanceMatrix.needsUpdate = true;
    this.lamps.forEach(([j, side], i) => {
      const n = side < 0 ? rl(j) : rr(j);
      m.makeTranslation(p[n * 3] + side * 0.06, p[n * 3 + 1] - 0.28, p[n * 3 + 2]);
      this.lampMesh.setMatrixAt(i, m);
    });
    this.lampMesh.instanceMatrix.needsUpdate = true;
  }
}
