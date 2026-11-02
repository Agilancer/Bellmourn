// World props (templates/models/props/<id>/<id>.glb): every placement of a prop is one
// instance of an InstancedMesh, so a graveyard of 150 headstones is a single draw call. Each
// placement also gets a collider (its rotated bounding box) and, for flames, a light source.
//
// The crates, barrels, chests and pottery modelled in Blender for the object texture sheets
// (tools/models/texprops.py, listed in templates/models/props/texprops.json) come in as built
// (front +z, not mirrored), crisp-texelled like the library's surfaces, and a chest's lid is
// its own instanced mesh hinged at the back, so searching one swings it open (open()). The old
// single 'crate', 'barrel' and 'treasure_chest' are families of them now: each placement takes
// one, chosen by where it stands (above ground plain chests, below it the domed and gilded).
//
// Crates, barrels and pottery break (chests don't): a blow (hit()) or a spell going off nearby
// (blast()) wears down a placement's hits, and at none it's gone from its instanced mesh and its
// collider, and in its place a dozen pieces of it tumble out across the floor, lie there a while
// and sink away; onBreak(p, at, dir) lets the loot spill what it held, onChange(at) has the torch
// shadows there redrawn. The pieces are the model's own (cut with thickness in Blender); each is
// an InstancedMesh of one with a copy of the prop's material compiled at load, so breaking one
// never compiles a shader.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { crisp } from './engine.js';

const ROOT = 'templates/models/props/';
// where each prop's flames are (prop space): torches and candles light the world around them
const FLAMES = {
  wall_torch: [[0, 2.06, 0.2, 0.36]],
  candelabrum: [[-0.3, 1.66, 0, 0.13], [0, 1.74, 0, 0.13], [0.3, 1.66, 0, 0.13]],
  altar: [[-0.7, 1.55, 0, 0.13], [0.7, 1.55, 0, 0.13]],
};
const NO_COLLIDE = new Set(['wall_torch']);
// props with flames in them would shadow their own light
const NO_CAST = new Set(['wall_torch', 'candelabrum']);
const SHINY = new Set(['anvil', 'treasure_chest', 'altar', 'sarcophagus', 'pillar_gothic', 'pillar_fluted', 'gravestone_obelisk']);
const GLAZED = /^(jar_glazed|vase_|chest_gilded)/;
const UNDER = -3;   // below this a placement is underground
const FAMILY = {
  crate: () => ['crate_plank', 'crate_braced', 'crate_ironbound', 'crate_slatted', 'crate_plank', 'crate_braced'],
  barrel: () => ['barrel_oak', 'barrel_oak', 'barrel_dark'],
  treasure_chest: (y) => (y < UNDER ? ['chest_domed_iron', 'chest_domed_gothic', 'chest_domed_moss', 'chest_domed_bronze', 'chest_gilded_iron']
    : ['chest_rustic_oak', 'chest_rustic_red', 'chest_rustic_moss', 'chest_rustic_carved']),
};
// what breaks, and how many hits it takes (a pot goes at a touch; iron-bound oak is stubborn)
const BREAKS = [[/^crate_ironbound/, 110], [/^crate_/, 40], [/^barrel_/, 55], [/^(jar_|amphora|vase_|urn_|crock_)/, 1]];
const hitsOf = (id) => BREAKS.find(([re]) => re.test(id))?.[1] ?? 0;
const CLAY = /^(jar_|amphora|vase_|urn_|crock_)/;
const SHARD_REST = 9;    // seconds the pieces lie before they sink away
const SHARD_SINK = 1.5;
const LID_OPEN = 1.85;   // radians a searched chest's lid swings back
const LID_TIME = 0.55;   // seconds to swing it
const hashXZ = (x, z) => { let h = Math.imul(Math.round(x * 10) | 0, 73856093) ^ Math.imul(Math.round(z * 10) | 0, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _h = new THREE.Matrix4(), _r = new THREE.Matrix4();

const GROUP = 48;        // metres: a prop's instances are drawn in groups this size (off-screen ones culled)
const _a = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

/** Turn every triangle of `g` the other way round (after a mirror has turned them inside out). */
function flipWinding(g) {
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i + 2 < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    g.index.needsUpdate = true;
    return;
  }
  for (const attr of Object.values(g.attributes)) {
    for (let v = 0; v + 2 < attr.count; v += 3) for (let k = 0; k < attr.itemSize; k++) {
      const t = attr.getComponent(v + 1, k); attr.setComponent(v + 1, k, attr.getComponent(v + 2, k)); attr.setComponent(v + 2, k, t);
    }
    attr.needsUpdate = true;
  }
}

export class Props {
  constructor(scene, physics, lib = null) {
    this.scene = scene;
    this.physics = physics;
    this.lib = lib;
    this.place = new Map(); // id -> [placement {x, y, z, rot, scale, fit}]
    this.lights = [];       // [x, y, z, size] flames
    this.boxes = new Map(); // id -> its model's bounding box (once loaded)
    this.lids = new Map();  // id -> { hinge } for the chests whose lids open
    this.swinging = [];     // placements whose lids are moving
    this.byBox = new Map(); // collider -> the breakable placement it belongs to
    this.geos = new Map();  // id -> its body geometry (the breakables')
    this.pieces = new Map(); // id -> the pieces it breaks into: [{ geo, c, thin }]
    this.shards = [];       // pieces flying or lying about
    this.shaking = [];      // placements jolted by a blow that didn't break them
    this.shardMats = new Map(); // id -> its pieces' material: two-sided (their cut ends are open)
    this.warm = [];         // stand-ins that get the pieces' shaders compiled at load (coldStart drops them)
    this.onBreak = null;    // (p, at: Vector3, dir) when a placement breaks
    this.onChange = null;   // (at: Vector3) when something's shape changed there: torch shadows to redraw
  }

  /** A blow on a collider: if it's a breakable placement's, it takes the damage (and may
   * break). True if it was one of ours. */
  hit(box, dmg, dir = null) {
    const p = this.byBox.get(box);
    if (!p || p.broken) return false;
    p.hp -= dmg;
    if (p.hp <= 0) this.smash(p, dir);
    else this._jolt(p);   // (it jolts: the blow told)
    return true;
  }

  /** A spell going off at `at`: every breakable within r takes it, the whole of it within 0.8 m of
   * the thing (so a firebolt into a crate breaks it), less toward the edge; what stands jolts. */
  blast(at, r, dmg) {
    for (const p of this.byBox.values()) {
      if (p.broken) continue;
      const b = p.box, cx = Math.max(b.min[0], Math.min(at.x, b.max[0])), cy = Math.max(b.min[1], Math.min(at.y, b.max[1])), cz = Math.max(b.min[2], Math.min(at.z, b.max[2]));
      const d = Math.hypot(cx - at.x, cy - at.y, cz - at.z);
      if (d > r) continue;
      p.hp -= d < 0.8 ? dmg : dmg * (1 - 0.6 * Math.min(1, (d - 0.8) / Math.max(0.1, r - 0.8)));
      if (p.hp <= 0) this.smash(p, new THREE.Vector3(p.x - at.x, 0.4, p.z - at.z).normalize());
      else this._jolt(p);
    }
  }

  _jolt(p) {
    p.shake = 0.25;
    if (!this.shaking.includes(p)) this.shaking.push(p);
  }

  /** It breaks: gone from its mesh and the world's colliders, in pieces across the floor (and
   * whatever stood on it comes down with it). */
  smash(p, dir = null) {
    p.broken = true;
    p.box.off = true;
    p.mesh.setMatrixAt(p.idx, _m.makeScale(0, 0, 0));
    p.mesh.instanceMatrix.needsUpdate = true;
    _q.setFromAxisAngle(_up, p.rot);
    const centre = new THREE.Vector3(p.x, p.y + 0.35 * p.scale, p.z);
    const push = dir ? new THREE.Vector3(dir.x, 0, dir.z) : new THREE.Vector3();
    const clay = CLAY.test(p.id);
    for (const piece of this._piecesOf(p.id)) {
      const m = new THREE.InstancedMesh(piece.geo, this.shardMats.get(p.id), 1);
      m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false;   // (a handful, and moving)
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const pos = piece.c.clone().multiplyScalar(p.scale).applyQuaternion(_q).add(_s.set(p.x, p.y, p.z));
      const out = pos.clone().sub(centre).setY(0);
      if (out.lengthSq() < 1e-4) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      out.normalize();
      const up = piece.c.y > 0.3 ? 2.0 : 1.1;
      const vel = out.multiplyScalar((clay ? 1.4 : 0.9) + Math.random() * 1.3).addScaledVector(push, 1.2 + Math.random())
        .add(new THREE.Vector3(0, up + Math.random() * 1.2, 0));
      const spin = new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 12);
      const s = { m, pos, rot: new THREE.Quaternion().copy(_q), vel, spin, scale: p.scale, t: 0, rest: false, settle: 0, sink: 0, bb: piece.geo.boundingBox, face: piece.face };
      this._shardMatrix(s);
      this.scene.add(m);
      this.shards.push(s);
    }
    this.onChange?.(centre);
    this.onBreak?.(p, centre, dir);
    if (p.above && !p.above.broken) this.smash(p.above, dir);
  }

  /** The pieces a model breaks into: its own (modelled with thickness, texprops.py), else a
   * dozen wedges of its surface, each about its own middle; and each piece's thinnest axis. */
  _piecesOf(id) {
    if (this.pieces.has(id)) return this.pieces.get(id);
    const geo = this.geos.get(id), g = geo.index ? geo.toNonIndexed() : geo;
    const P = g.attributes.position, keys = Object.keys(g.attributes);
    const bb = this.boxes.get(id), mid = bb.getCenter(new THREE.Vector3()), h = Math.max(0.01, bb.max.y - bb.min.y);
    const tris = Array.from({ length: 12 }, () => []);
    for (let t = 0; t < P.count; t += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) { cx += P.getX(t + k) / 3; cy += P.getY(t + k) / 3; cz += P.getZ(t + k) / 3; }
      const a = Math.floor(((Math.atan2(cz - mid.z, cx - mid.x) + Math.PI) / (Math.PI * 2)) * 6) % 6;
      tris[a + (cy - bb.min.y > h * 0.5 ? 6 : 0)].push(t);
    }
    const out = [];
    for (const list of tris) {
      if (!list.length) continue;
      const o = new THREE.BufferGeometry();
      for (const k of keys) {
        const A = g.attributes[k], n = A.itemSize, arr = new Float32Array(list.length * 3 * n);
        list.forEach((t, i) => arr.set(A.array.subarray(t * n, (t + 3) * n), i * 3 * n));
        o.setAttribute(k, new THREE.BufferAttribute(arr, n));
      }
      o.computeBoundingBox();
      const c = o.boundingBox.getCenter(new THREE.Vector3());
      o.translate(-c.x, -c.y, -c.z);
      o.computeBoundingSphere();
      out.push({ geo: o, c, face: faceOf(o) });
    }
    this.pieces.set(id, out);
    return out;
  }

  /** How far below a piece's middle its lowest corner lies, turned as it is now. */
  _lowest(s, rot = s.rot) {
    const b = s.bb;
    let lo = 0;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      lo = Math.min(lo, _p.set(x, y, z).applyQuaternion(rot).y * s.scale);
    }
    return lo;
  }

  _shardMatrix(s) {
    s.m.setMatrixAt(0, _m.compose(s.pos, s.rot, _p.set(s.scale, s.scale, s.scale)));
    s.m.instanceMatrix.needsUpdate = true;
  }

  /** Place prop `id`; `fit` (metres) scales it to that height instead of by `scale`. A family
   * ('crate', 'barrel', 'treasure_chest') takes one of its models by where it stands. Returns
   * the placement ({ id, x, y, z, ... }: set `above` to what stands on it, so it falls with it). */
  add(id, x, y, z, rot = 0, scale = 1, fit = null) {
    const fam = FAMILY[id]?.(y);
    if (fam) id = fam[hashXZ(x, z) % fam.length];
    if (!this.place.has(id)) this.place.set(id, []);
    const p = { id, x, y, z, rot, scale, fit };
    this.place.get(id).push(p);
    return p;
  }

  /** Swing a chest's lid open (placement `i` of prop `id`); false if it has no lid. */
  open(id, i) {
    const p = this.lids.has(id) ? this.place.get(id)?.[i] : null;
    if (!p || p.lidTo === LID_OPEN) return false;
    p.lidTo = LID_OPEN;
    if (!this.swinging.includes(p)) this.swinging.push(p);
    return true;
  }

  /** Once everything's shaders are compiled (main.js, after the rehearsal): the stand-ins go. */
  coldStart() {
    for (const w of this.warm) this.scene.remove(w);
    this.warm.length = 0;
  }

  update(dt) {
    for (let k = this.shaking.length - 1; k >= 0; k--) {
      const p = this.shaking[k];
      p.shake = Math.max(0, p.shake - dt);
      const j = p.broken ? 0 : p.shake * 0.5 * Math.sin(p.shake * 70);
      if (!p.broken) {
        _q.setFromEuler(new THREE.Euler(j * 0.6, p.rot + j, -j * 0.4));
        p.mesh.setMatrixAt(p.idx, _m.compose(_s.set(p.x, p.y, p.z), _q, _p.set(p.scale, p.scale, p.scale)));
        p.mesh.instanceMatrix.needsUpdate = true;
      }
      if (!p.shake || p.broken) this.shaking.splice(k, 1);
    }
    // the pieces of what's been broken: thrown, tumbling, glancing off walls, coming to rest on
    // the floor laid flat on their broadest face, lying a while, then sinking away
    for (let k = this.shards.length - 1; k >= 0; k--) {
      const s = this.shards[k];
      s.t += dt;
      if (!s.rest) {
        s.vel.y -= 11 * dt;
        const step = Math.hypot(s.vel.x, s.vel.z) * dt;
        if (step > 1e-4) {
          const hit = this.physics.ray([s.pos.x, s.pos.y + 0.05, s.pos.z], [s.vel.x * dt / step, 0, s.vel.z * dt / step], step + 0.08);
          if (hit && hit.box && hit.t < step + 0.08) {   // a wall: bounce back off it, slowed
            const n = hit.normal, vn = s.vel.x * n[0] + s.vel.z * n[2];
            if (vn < 0) { s.vel.x -= 1.6 * vn * n[0]; s.vel.z -= 1.6 * vn * n[2]; s.vel.x *= 0.55; s.vel.z *= 0.55; s.spin.multiplyScalar(0.6); }
          }
        }
        s.pos.addScaledVector(s.vel, dt);
        s.rot.multiply(_q.setFromEuler(new THREE.Euler(s.spin.x * dt, s.spin.y * dt, s.spin.z * dt)));
        // (the floor meets the piece's lowest corner as it's turned, not its middle)
        const low = this._lowest(s);
        const f = this.physics.floorAt(s.pos.x, s.pos.z, s.pos.y + low, 0.05, 0.2);
        const floor = Number.isFinite(f) ? f + 0.005 - low : -1e9;
        if (s.pos.y <= floor && s.vel.y < 0) {
          s.pos.y = floor;
          if (Math.abs(s.vel.y) < 1.4 || s.t > 2.5) this._landed(s); else { s.vel.y *= -0.3; s.vel.x *= 0.5; s.vel.z *= 0.5; s.spin.multiplyScalar(0.5); }
        }
        if (s.t > 6) this._landed(s);
      } else if (s.settle > 0) {   // turning over onto its broadest face, flat on the floor
        s.settle = Math.max(0, s.settle - dt);
        s.rot.slerp(s.lie, 1 - s.settle / 0.15);
        const f = this.physics.floorAt(s.pos.x, s.pos.z, s.pos.y + 0.3, 0.05, 0.4);
        if (Number.isFinite(f)) s.pos.y = f + 0.005 - this._lowest(s);
        if (!s.settle) s.t = 0;
      } else if (s.t > SHARD_REST) {
        s.sink += dt;
        s.pos.y -= dt * 0.12;
        if (s.sink > SHARD_SINK) { this.scene.remove(s.m); s.m.dispose(); this.shards.splice(k, 1); continue; }
      } else continue;
      this._shardMatrix(s);
    }
    for (let k = this.swinging.length - 1; k >= 0; k--) {
      const p = this.swinging[k];
      const step = (LID_OPEN / LID_TIME) * dt, d = p.lidTo - p.lid;
      p.lid += Math.sign(d) * Math.min(Math.abs(d), step);
      this._lidMatrix(p);
      p.lidMesh.instanceMatrix.needsUpdate = true;
      // (its shadow redrawn as it starts to swing and once it's open: not every frame between)
      if (!p.swung || p.lid === p.lidTo) { p.swung = true; this.onChange?.(_a.set(p.x, p.y + 0.5, p.z)); }
      if (p.lid === p.lidTo) this.swinging.splice(k, 1);
    }
  }

  /** A piece has come down to stay: it turns over to lie on its broadest face (the way its
   * surface faces on the whole, upright, whichever way up it's nearer), keeping the way it faced. */
  _landed(s) {
    s.rest = true;
    s.t = 0;
    _a.copy(s.face).applyQuaternion(s.rot);
    const flip = _a.y < 0 ? -1 : 1;
    _qa.setFromUnitVectors(_a.normalize(), _p.set(0, flip, 0));
    s.lie = _qb.copy(_qa).multiply(s.rot).clone();
    s.settle = 0.15;
  }

  _lidMatrix(p) {
    // the placement, then the hinge, then the lid turned back about it (its front lifting)
    const L = this.lids.get(p.id);
    _q.setFromAxisAngle(_up, p.rot);
    _m.compose(_s.set(p.x, p.y, p.z), _q, _p.set(p.scale, p.scale, p.scale));
    _h.makeTranslation(L.hinge.x, L.hinge.y, L.hinge.z);
    _r.makeRotationX(-p.lid);
    p.lidMesh.setMatrixAt(p.idx, _m.multiply(_h).multiply(_r));
  }

  async finish() {
    const loader = new GLTFLoader();
    let made = {};
    try { made = (await (await fetch(ROOT + 'texprops.json')).json()).props; } catch (e) { console.warn('no texture-sheet props', e); }
    await Promise.all([...this.place.entries()].map(async ([id, list]) => {
      let gltf;
      try { gltf = await loader.loadAsync(`${ROOT}${id}/${id}.glb`); } catch (e) { console.warn('prop', id, e); return; }
      if (made[id]) { this._built(id, list, gltf); return; }
      let src = null;
      gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
      if (!src) return;
      const map = src.material.map;
      if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapLinearFilter; map.needsUpdate = true; }
      const mat = new THREE.MeshPhongMaterial({ map, side: THREE.DoubleSide,
        specular: SHINY.has(id) ? 0x302c28 : 0x0e0d0c, shininess: SHINY.has(id) ? 36 : 10 });
      if (map && this.lib?.normals) mat.normalMap = this.lib.normalFrom(map, 1.2);
      const geo = src.geometry.clone();
      src.updateWorldMatrix(true, false);
      geo.applyMatrix4(src.matrixWorld);
      geo.scale(1, 1, -1); // glTF stores the models z-mirrored: back to as built (front = +z)
      // a mirror turns every face inside out: wind them back, or the two-sided material takes each
      // face it shows for its back, turns its normal away, and lights it black (the graveyard's
      // headstones and the slabs before them came out as black blocks)
      flipWinding(geo);
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      this.boxes.set(id, bb);
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      list.forEach((p, i) => {
        if (p.fit) p.scale = p.fit / Math.max(0.05, bb.max.y - bb.min.y);
        q.setFromAxisAngle(up, p.rot);
        m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
        mesh.setMatrixAt(i, m);
        const c = Math.cos(p.rot), s = Math.sin(p.rot);
        if (!NO_COLLIDE.has(id)) { // rotated bounding box -> axis-aligned collider
          const xs = [], zs = [];
          for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) {
            xs.push(p.x + (x * c + z * s) * p.scale); zs.push(p.z + (-x * s + z * c) * p.scale);
          }
          this.physics.add([Math.min(...xs), p.y + bb.min.y * p.scale, Math.min(...zs)],
            [Math.max(...xs), p.y + bb.max.y * p.scale, Math.max(...zs)], 'prop');
        }
        for (const f of FLAMES[id] || []) {
          this.lights.push([p.x + (f[0] * c + f[2] * s) * p.scale, p.y + f[1] * p.scale,
            p.z + (-f[0] * s + f[2] * c) * p.scale, f[3] * p.scale]);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = !NO_CAST.has(id);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }));
  }

  /** One of the Blender-built props (texprops.json): as built, crisp, lid apart, its pieces kept
   * for when it breaks; its instances drawn in groups by where they stand (GROUP metres, and
   * above or below ground), so the ones out of view aren't drawn. */
  _built(id, list, gltf) {
    let body = null, lid = null;
    const bits = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const name = /^(lid|piece_)/.test(o.name) ? o.name : o.parent?.name || '';
      if (name.startsWith('piece_')) bits.push(o);
      else if (name === 'lid') lid = o;
      else if (!body) body = o;
    });
    if (!body) return;
    const map = body.material.map;
    if (map) {
      map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
      map.anisotropy = THREE.Texture.DEFAULT_ANISOTROPY; map.needsUpdate = true;
    }
    const shiny = GLAZED.test(id), clay = CLAY.test(id);
    const mat = crisp(new THREE.MeshPhongMaterial({ map, specular: shiny ? 0x3a3630 : 0x100f0e, shininess: shiny ? 40 : 10 }));
    // (no relief derived for pottery: its glaze and paint are smooth, and a derived normal map
    // would raise the painted bands as if carved)
    if (map && this.lib?.normals && !clay) { mat.normalMap = this.lib.normalFrom(map, 1.0); mat.normalScale.set(0.8, 0.8); }
    const geo = body.geometry.clone().applyMatrix4(body.matrixWorld);
    geo.computeBoundingBox();
    const bb = geo.boundingBox.clone();
    let lidGeo = null, hinge = null;
    if (lid) {
      // the lid's own vertices about the hinge (its node sits on it)
      hinge = new THREE.Vector3().setFromMatrixPosition(lid.matrixWorld);
      lidGeo = lid.geometry.clone().applyMatrix4(new THREE.Matrix4().copy(lid.matrixWorld).setPosition(0, 0, 0));
      lidGeo.computeBoundingBox();
      bb.union(lidGeo.boundingBox.clone().translate(hinge));
      this.lids.set(id, { hinge });
    }
    this.boxes.set(id, bb);
    const breaks = hitsOf(id) > 0;
    if (breaks) {
      this.geos.set(id, geo);
      if (bits.length) {
        this.pieces.set(id, bits.map((o) => {
          const c = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
          const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().copy(o.matrixWorld).setPosition(0, 0, 0));
          g.computeBoundingBox(); g.computeBoundingSphere();
          return { geo: g, c, face: faceOf(g) };
        }));
      }
    }
    // the groups
    const groups = new Map();
    list.forEach((p, i) => {
      const key = `${Math.floor(p.x / GROUP)},${Math.floor(p.z / GROUP)},${p.y < UNDER ? 'u' : 'a'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
      p.id = id; p.i = i; p.lid = 0; p.lidTo = 0;
    });
    for (const members of groups.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, members.length);
      const lidMesh = lidGeo ? new THREE.InstancedMesh(lidGeo, mat, members.length) : null;
      members.forEach((p, j) => {
        if (p.fit) p.scale = p.fit / Math.max(0.05, bb.max.y - bb.min.y);
        _q.setFromAxisAngle(_up, p.rot);
        _m.compose(_s.set(p.x, p.y, p.z), _q, _p.set(p.scale, p.scale, p.scale));
        mesh.setMatrixAt(j, _m);
        p.mesh = mesh; p.idx = j; p.lidMesh = lidMesh;
        if (lidMesh) this._lidMatrix(p);
        const c = Math.cos(p.rot), s = Math.sin(p.rot), xs = [], zs = [];
        for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) {
          xs.push(p.x + (x * c + z * s) * p.scale); zs.push(p.z + (-x * s + z * c) * p.scale);
        }
        p.box = this.physics.add([Math.min(...xs), p.y + bb.min.y * p.scale, Math.min(...zs)],
          [Math.max(...xs), p.y + bb.max.y * p.scale, Math.max(...zs)], 'prop');
        p.hp = hitsOf(id);
        if (p.hp) this.byBox.set(p.box, p);
      });
      for (const m of [mesh, lidMesh]) {
        if (!m) continue;
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
        m.castShadow = true;
        m.receiveShadow = true;
        this.scene.add(m);
      }
      if (lidMesh || breaks) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (lidMesh) lidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    if (breaks) {
      // its pieces' material: the same, two-sided (their cut ends are open; and crisp again:
      // clone() drops defines). A piece of nothing in it stands in the scene until play, so the
      // stained glass's light is worked into it and its shader compiled with the rest, not at
      // the first blow (coldStart takes the stand-ins away)
      const sm = crisp(mat.clone());
      sm.side = THREE.DoubleSide;
      this.shardMats.set(id, sm);
      const warm = new THREE.InstancedMesh(geo, sm, 1);
      warm.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0));
      warm.frustumCulled = false;
      warm.castShadow = false;
      this.scene.add(warm);
      this.warm.push(warm);
    }
  }
}

/** The way a piece's surface faces on the whole (its normals summed, weighted by area, signs
 * folded to one side so its inner and outer skins don't cancel): the axis it should lie flat
 * across. A curved sherd's is its bowl's, not its bounding box's thinnest side. */
function faceOf(g) {
  const P = g.attributes.position, N = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const idx = g.index ? g.index.array : null, count = idx ? idx.length : P.count;
  for (let i = 0; i < count; i += 3) {
    const i0 = idx ? idx[i] : i, i1 = idx ? idx[i + 1] : i + 1, i2 = idx ? idx[i + 2] : i + 2;
    a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
    n.crossVectors(b.sub(a), c.sub(a));   // (length: twice the triangle's area)
    if (n.dot(N) < 0) n.negate();
    N.add(n);
  }
  if (N.lengthSq() < 1e-12) N.set(0, 1, 0);
  return N.normalize();
}
