// Pots, crates, barrels and chests that hold things. The kit hands every one it places to this
// (kit.loose) instead of instancing it, so each is its own mesh: a pot can shatter into its own
// pieces and a chest's lid can swing open. E searches one (a chest's lid opens first, and stays
// open so you know it's been searched); a blow or a blast breaks a pot, crate or barrel, and
// what was in it spills across the floor, picked up by walking over it.
//
// hooks (set by main.js): onSearch(c) opens the loot window, onBreak(c, at, dir) for the dust
// and the noise, onPick(item) puts a spilled thing in the bag (true if it all went in).
import * as THREE from 'three';
import { rollContents, describe } from './items.js';

const KINDS = [
  [/Pot_1|Vase_2|Vase_4|dungeon\/Vase$/, { kind: 'pot', name: 'pot', hp: 1, slots: 4 }],
  [/FarmCrate|Crate_Wooden|dungeon\/Crate$|Prop_Crate/, { kind: 'crate', name: 'crate', hp: 40, slots: 6 }],
  [/Crate_Metal/, { kind: 'crate', name: 'iron-bound crate', hp: 110, slots: 6 }],
  [/Barrel$|Barrel2$|Barrel_Apples/, { kind: 'barrel', name: 'barrel', hp: 55, slots: 6 }],
  // chests: which triangles are the lid (model space centroid [x, y, z]), its hinge [y, z] (else
  // the lid's back bottom edge), and the lid's angle shut and open (the gilded one comes open)
  [/Chest_Wood|ossuary_chest/, { kind: 'chest', name: 'chest', slots: 10, lid: (c) => c[1] > 0.47, shut: 0, open: -1.9 }],
  [/dungeon\/Chest$/, { kind: 'chest', name: 'chest', slots: 10, lid: (c) => c[1] > 0.57, shut: 0, open: -1.9 }],
  [/Chest_Gold/, { kind: 'chest', name: 'gilded chest', slots: 10, rich: true, lid: (c) => c[2] < -0.42, hinge: [0.48, -0.43], shut: 2.5, open: 0 }],
];
const LID_TIME = 0.9;   // seconds for a lid to swing open
const SHOW = 45;        // metres: containers further off aren't drawn
const REACH = 2.6;
const SHARD_LIFE = 5;

/** Sort a geometry's triangles into n buckets by fn(centroid) (-1 drops one); a non-indexed
 * geometry for each bucket, or null where none went. */
function partition(geo, fn, n) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const P = g.attributes.position, keys = Object.keys(g.attributes);
  const tris = Array.from({ length: n }, () => []);
  const c = [0, 0, 0];
  for (let t = 0; t < P.count; t += 3) {
    for (let a = 0; a < 3; a++) c[a] = 0;
    for (let k = 0; k < 3; k++) { c[0] += P.getX(t + k) / 3; c[1] += P.getY(t + k) / 3; c[2] += P.getZ(t + k) / 3; }
    const b = fn(c);
    if (b >= 0) tris[b].push(t);
  }
  return tris.map((list) => {
    if (!list.length) return null;
    const o = new THREE.BufferGeometry();
    for (const k of keys) {
      const A = g.attributes[k], s = A.itemSize, arr = new Float32Array(list.length * 3 * s);
      list.forEach((t, i) => arr.set(A.array.subarray(t * s, (t + 3) * s), i * 3 * s));
      o.setAttribute(k, new THREE.BufferAttribute(arr, s));
    }
    o.computeBoundingBox();
    o.computeBoundingSphere();
    return o;
  });
}

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();

export class Containers {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    this.byBox = new Map();
    this.split = new Map();   // model id -> its lid and body, or its shards
    this.shards = [];
    this.spilt = [];          // things lying on the floor
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    this.hooks = {};
  }

  /** Is this kit model one of ours? (kit.place asks) */
  wants(id) { return KINDS.find(([re]) => re.test(id))?.[1] || null; }

  /** The kit placed one: build it, and fill it. p: { id, m, box, variant, layer, info } */
  take(p) {
    const def = this.wants(p.id), kit = this.ctx.kit;
    const mdl = kit.models.get(p.id);
    const mat = (atlas) => kit.material(atlas, p.variant && kit.variantsOf(atlas).includes(p.variant) ? p.variant : '');
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    g.matrix.copy(p.m);
    g.matrix.decompose(g.position, g.quaternion, g.scale);
    const c = { id: p.id, def, name: def.name, kind: def.kind, group: g, m: p.m, variant: p.variant, layer: p.layer,
      hp: def.hp, box: p.box, searched: false, broken: false };
    const add = (parent, geo, atlas) => {
      const me = new THREE.Mesh(geo, mat(atlas));
      me.castShadow = kit.shadows; me.receiveShadow = true;
      parent.add(me);
    };
    if (def.lid) {
      const s = this.lidOf(p.id, def);
      for (const b of s.body) add(g, b.geo, b.atlas);
      const pivot = new THREE.Group(), inner = new THREE.Group();
      pivot.position.set(0, s.hinge[0], s.hinge[1]);
      inner.position.set(0, -s.hinge[0], -s.hinge[1]);
      pivot.rotation.x = def.shut;
      pivot.add(inner);
      for (const l of s.lid) add(inner, l.geo, l.atlas);
      g.add(pivot);
      c.lid = pivot; c.lidT = 0;
    } else for (const part of mdl.parts) add(g, part.geo, part.atlas);
    g.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    c.lid?.traverse((o) => { o.matrixAutoUpdate = o === c.lid; });
    g.updateMatrixWorld(true);
    // where it is: its box in the world (the collider's, or the model's own)
    const info = p.info || {}, lo = info.min || [-0.3, 0, -0.3], hi = info.max || [0.3, 0.6, 0.3];
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
      _v.set(x, y, z).applyMatrix4(p.m);
      mn[0] = Math.min(mn[0], _v.x); mn[1] = Math.min(mn[1], _v.y); mn[2] = Math.min(mn[2], _v.z);
      mx[0] = Math.max(mx[0], _v.x); mx[1] = Math.max(mx[1], _v.y); mx[2] = Math.max(mx[2], _v.z);
    }
    c.min = mn; c.max = mx;
    c.center = new THREE.Vector3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
    c.base = mn[1];
    c.bag = rollContents(def.kind, def.slots, { deep: c.base < -6, rich: !!def.rich });
    if (p.box) { this.byBox.set(p.box, c); p.box.container = c; }
    g.visible = false;
    this.group.add(g);
    this.list.push(c);
    return c;
  }

  /** A chest's lid and body, split once per model. */
  lidOf(id, def) {
    if (this.split.has(id)) return this.split.get(id);
    const out = { lid: [], body: [], hinge: def.hinge };
    let hy = Infinity, hz = Infinity;
    for (const part of this.ctx.kit.models.get(id).parts) {
      const [lid, body] = partition(part.geo, (c) => (def.lid(c) ? 0 : 1), 2);
      if (lid) { out.lid.push({ geo: lid, atlas: part.atlas }); hy = Math.min(hy, lid.boundingBox.min.y); hz = Math.min(hz, lid.boundingBox.min.z); }
      if (body) out.body.push({ geo: body, atlas: part.atlas });
    }
    out.hinge ||= [hy, hz];
    this.split.set(id, out);
    return out;
  }

  /** A model broken into a dozen pieces (six around, two high), each about its own middle. */
  shardsOf(id) {
    if (this.split.has('~' + id)) return this.split.get('~' + id);
    const parts = this.ctx.kit.models.get(id).parts;
    const bb = new THREE.Box3();
    for (const p of parts) bb.union(p.geo.boundingBox);
    const mid = bb.getCenter(new THREE.Vector3()), h = Math.max(0.01, bb.max.y - bb.min.y);
    const N = 12, pieces = Array.from({ length: N }, () => ({ parts: [], c: new THREE.Vector3(), w: 0 }));
    for (const p of parts) {
      const geos = partition(p.geo, (c) => {
        const a = Math.floor(((Math.atan2(c[2] - mid.z, c[0] - mid.x) + Math.PI) / (Math.PI * 2)) * 6) % 6;
        return a + (c[1] - bb.min.y > h * 0.5 ? 6 : 0);
      }, N);
      geos.forEach((geo, i) => {
        if (!geo) return;
        const ctr = geo.boundingBox.getCenter(new THREE.Vector3());
        const w = geo.attributes.position.count;
        pieces[i].c.addScaledVector(ctr, w); pieces[i].w += w;
        pieces[i].parts.push({ geo, atlas: p.atlas });
      });
    }
    const out = pieces.filter((q) => q.w).map((q) => {
      q.c.divideScalar(q.w);
      for (const p of q.parts) p.geo.translate(-q.c.x, -q.c.y, -q.c.z);
      return q;
    });
    this.split.set('~' + id, out);
    return out;
  }

  /** The container the player is looking at, within reach (and not broken). */
  aimed(camera) {
    const o = camera.position, d = camera.getWorldDirection(_v);
    let best = null, bestT = REACH;
    for (const c of this.list) {
      if (c.broken || Math.abs(c.center.x - o.x) > 4 || Math.abs(c.center.z - o.z) > 4 || Math.abs(c.center.y - o.y) > 4) continue;
      const t = rayBox(o, d, c.min, c.max, 0.12);
      if (t !== null && t < bestT) { best = c; bestT = t; }
    }
    return best;
  }

  /** E on it: a shut chest swings open first (then the window); anything else opens at once. */
  search(c) {
    if (c.lid && c.lidT === 0 && !c.opening) {
      c.opening = true;
      this.ctx.sfx?.chest?.();
      return;
    }
    if (!c.opening) this.hooks.onSearch?.(c);
  }

  /** A blow on a collider: if it's one of ours, it takes the damage (and may break). */
  hit(box, dmg, dir) {
    const c = this.byBox.get(box);
    if (!c || c.broken) return false;
    if (c.kind === 'chest') { this.ctx.sfx?.hit?.('wood'); return true; }   // too stout to smash
    c.hp -= dmg;
    if (c.hp <= 0) this.break(c, dir);
    else { c.shake = 0.25; if (c.kind === 'pot') this.ctx.sfx?.shatter?.('pot'); else this.ctx.sfx?.splinter?.(false); }
    return true;
  }

  /** A spell going off at `at`: everything breakable within r takes it. */
  blast(at, r, dmg) {
    for (const c of this.list) {
      if (c.broken || c.kind === 'chest') continue;
      const d = c.center.distanceTo(at);
      if (d > r + 0.4) continue;
      c.hp -= dmg * (1 - 0.5 * Math.min(1, d / (r + 0.4)));
      if (c.hp <= 0) this.break(c, _v.copy(c.center).sub(at).setY(0.3).normalize().clone());
    }
  }

  /** Smash it: gone from the world, in pieces across the floor, and whatever was inside it with them. */
  break(c, dir = null) {
    c.broken = true;
    this.group.remove(c.group);
    if (c.box) c.box.off = true;
    const kit = this.ctx.kit;
    const mat = (atlas) => kit.material(atlas, c.variant && kit.variantsOf(atlas).includes(c.variant) ? c.variant : '');
    c.m.decompose(_v, _q, _s);
    const pos = _v.clone(), rot = _q.clone(), scl = _s.clone();
    const push = dir ? new THREE.Vector3(dir.x, 0, dir.z) : new THREE.Vector3();
    for (const piece of this.shardsOf(c.id)) {
      const g = new THREE.Group();
      for (const p of piece.parts) { const me = new THREE.Mesh(p.geo, mat(p.atlas)); me.castShadow = kit.shadows; g.add(me); }
      g.position.copy(piece.c).multiply(scl).applyQuaternion(rot).add(pos);
      g.quaternion.copy(rot);
      g.scale.copy(scl);
      const out = g.position.clone().sub(c.center).setY(0);
      if (out.lengthSq() < 1e-4) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      out.normalize();
      const up = piece.c.y > 0.3 ? 2.4 : 1.4;
      const vel = out.multiplyScalar(1.2 + Math.random() * 1.8).addScaledVector(push, 1.6 + Math.random())
        .add(new THREE.Vector3(0, up + Math.random() * 1.6, 0));
      const spin = new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14);
      this.ctx.scene.add(g);
      this.shards.push({ g, vel, spin, t: 0, rest: false, scale: scl.x });
    }
    // what was in it, tossed out across the floor
    c.bag.slots.forEach((it) => { if (it) this.spill(it, c); });
    c.bag.slots.fill(null);
    this.hooks.onBreak?.(c, c.center.clone(), dir);
  }

  /** One thing out of a broken container, hopping to a spot on the floor nearby. */
  spill(it, c) {
    const d = describe(it), kit = this.ctx.kit;
    const obj = kit.mesh(d.model, d.variant);
    const holder = new THREE.Group(), inner = new THREE.Group();
    inner.add(obj);
    holder.add(inner);
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj), size = b.getSize(new THREE.Vector3());
    if (it.id === 'weapon') inner.rotation.set(Math.PI / 2, 0, Math.random() * 6.3);   // lying flat
    else inner.rotation.y = Math.random() * 6.3;
    inner.position.y = it.id === 'weapon' ? Math.min(size.x, size.z) * 0.5 : -b.min.y;
    const a = Math.random() * Math.PI * 2, r = 0.35 + Math.random() * 0.6;
    const tx = c.center.x + Math.cos(a) * r, tz = c.center.z + Math.sin(a) * r;
    const fl = this.ctx.physics.floorAt(tx, tz, c.base + 0.4, 0.05, 0.6);
    const ty = Number.isFinite(fl) ? fl : c.base;
    holder.position.copy(c.center);
    this.ctx.scene.add(holder);
    this.spilt.push({ it, holder, from: c.center.clone(), to: new THREE.Vector3(tx, ty, tz), t: 0, layer: c.layer });
  }

  update(dt, camera, under, player) {
    const p = camera.position;
    for (const c of this.list) {
      if (c.broken) continue;
      const layerOn = c.layer === 'under' ? p.y < 0.5 : !under;
      c.group.visible = layerOn && Math.abs(c.center.x - p.x) < SHOW && Math.abs(c.center.z - p.z) < SHOW;
      if (c.opening) { // the lid swinging up, and the window once it's open
        c.lidT = Math.min(1, c.lidT + dt / LID_TIME);
        const e = 1 - (1 - c.lidT) ** 3;
        c.lid.rotation.x = c.def.shut + (c.def.open - c.def.shut) * e + Math.sin(c.lidT * Math.PI * 3) * 0.05 * (1 - c.lidT);
        c.lid.updateMatrix();
        c.lid.updateMatrixWorld(true);
        if (c.lidT >= 1) {
          c.opening = false;
          if (player && player.pos.distanceTo(c.center) < 4) this.hooks.onSearch?.(c);
        }
      }
      if (c.shake > 0) { // a blow that didn't break it rocks it
        c.shake = Math.max(0, c.shake - dt);
        const k = c.shake * 0.25;
        c.group.matrix.copy(c.m).multiply(new THREE.Matrix4().makeRotationFromEuler(_e.set(Math.sin(c.shake * 60) * k, 0, Math.cos(c.shake * 50) * k)));
        c.group.updateMatrixWorld(true);
      }
    }
    const phys = this.ctx.physics;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i], g = s.g;
      s.t += dt;
      if (!s.rest) {
        s.vel.y -= 9.8 * dt;
        g.position.addScaledVector(s.vel, dt);
        g.rotation.x += s.spin.x * dt; g.rotation.y += s.spin.y * dt; g.rotation.z += s.spin.z * dt;
        const fl = phys.floorAt(g.position.x, g.position.z, g.position.y + 0.1, 0.03, 0.15);
        if (Number.isFinite(fl) && g.position.y < fl + 0.03 && s.vel.y < 0) {
          g.position.y = fl + 0.03;
          s.vel.y *= -0.3; s.vel.x *= 0.55; s.vel.z *= 0.55; s.spin.multiplyScalar(0.5);
          if (Math.abs(s.vel.y) < 0.4) s.rest = true;
        }
        if (g.position.y < -200) s.t = SHARD_LIFE + 1;
      }
      if (s.t > SHARD_LIFE) { // then they sink away
        g.scale.setScalar(s.scale * Math.max(0, 1 - (s.t - SHARD_LIFE)));
        if (s.t > SHARD_LIFE + 1) { this.ctx.scene.remove(g); this.shards.splice(i, 1); }
      }
    }
    for (let i = this.spilt.length - 1; i >= 0; i--) {
      const d = this.spilt[i], h = d.holder;
      if (d.t < 1) { // the hop out
        d.t = Math.min(1, d.t + dt / 0.45);
        h.position.lerpVectors(d.from, d.to, d.t);
        h.position.y += Math.sin(d.t * Math.PI) * 0.5;
        d.wait = 0.7;   // let it be seen landing before it's picked up
        continue;
      }
      h.visible = d.layer === 'under' ? p.y < 0.5 : !under;
      if (!player || d.wait > 0) { d.wait -= dt; continue; }
      const pp = player.pos;
      if (Math.hypot(pp.x - h.position.x, pp.z - h.position.z) < 0.9 && Math.abs(pp.y - h.position.y) < 1.5) {
        if (this.hooks.onPick?.(d.it)) { this.ctx.scene.remove(h); this.spilt.splice(i, 1); }
        else d.wait = 2;   // the bag's full: try again in a bit
      }
    }
  }
}

/** Where a ray (o, unit d) first enters the box [mn, mx] grown by pad, or null. */
function rayBox(o, d, mn, mx, pad) {
  let t0 = 0, t1 = Infinity;
  for (const [a, k] of [['x', 0], ['y', 1], ['z', 2]]) {
    const lo = mn[k] - pad, hi = mx[k] + pad;
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo || o[a] > hi) return null; continue; }
    let ta = (lo - o[a]) / d[a], tb = (hi - o[a]) / d[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}
