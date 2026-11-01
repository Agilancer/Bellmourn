// Doors you open and close with E (the main interact key): a plank leaf with iron straps and a
// ring handle, or one of the biome packs' painted door leaves (front and back, grilles and
// gates with real gaps), hinged on one side of its doorway. Shut, it blocks the way (a collider in the
// doorway); it swings open over half a second, out of the way, and shuts again on E.
import * as THREE from 'three';

const SWING = 0.55; // seconds

export class Doors {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    const lib = ctx.lib, planks = lib.ofKind('plank');
    this.mats = (planks.length ? planks : ['ship_05_red_mahogany']).map((id) => lib.material(id, { tile: 1.6 }));
    this.iron = lib.material('met_02_riveted_black_iron', { tile: 0.6 });
    for (const m of [...this.mats, this.iron]) m.userData.door = true;
  }

  /**
   * A door in a doorway. hinge: [x, y, z] the bottom of the hinge side; along: the world angle
   * the shut door runs from its hinge toward its latch (0 = +x); width, height; opens: +1 swings
   * one way (counter-clockwise seen from above), -1 the other; name for the prompt.
   */
  add({ hinge, along, width = 1.6, height = 2.5, thick = 0.09, opens = 1, name = 'door', double = false, plank = 0, design = null }) {
    const art = design && this.art(design);
    // a double doorway about as wide as the painting splits it down the middle between its
    // leaves; a wider one gives each leaf the whole painting
    const split = art && double && width / height < (art.aspect * 1.6);
    const leaves = double ? [{ h: hinge, a: along, w: width / 2, o: opens },
      { h: [hinge[0] + Math.cos(along) * width, hinge[1], hinge[2] - Math.sin(along) * width], a: along + Math.PI, w: width / 2, o: -opens }]
      : [{ h: hinge, a: along, w: width, o: opens }];
    const door = { name, leaves: [], open: false, t: 0, boxes: [] };
    for (const L of leaves) {
      const pivot = new THREE.Group();
      pivot.position.set(...L.h);
      pivot.rotation.y = L.a;
      const mat = this.mats[(plank + this.list.length) % this.mats.length];
      if (art) { // the painted leaf: front on one face, back on the other, edges in iron
        const g = new THREE.BoxGeometry(L.w, height, thick);
        const second = leaves.length > 1 && L === leaves[1];
        artUV(g, split);
        const slab = new THREE.Mesh(g, [this.iron, this.iron, this.iron, this.iron, second ? art.back : art.front, second ? art.front : art.back]);
        slab.position.set(L.w / 2, height / 2, 0);
        pivot.add(slab);
      } else {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(L.w, height, thick), mat);
        fitUV(slab.geometry, L.w, height, mat);
        slab.position.set(L.w / 2, height / 2, 0);
        pivot.add(slab);
      }
      if (!art) for (const y of [0.35, height - 0.4]) { // iron straps and the ring handle
        const strap = new THREE.Mesh(new THREE.BoxGeometry(L.w * 0.82, 0.07, thick + 0.03), this.iron);
        strap.position.set(L.w * 0.42, y, 0);
        pivot.add(strap);
      }
      if (!art) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 5, 10), this.iron);
        ring.position.set(L.w - 0.15, height * 0.45, thick / 2 + 0.03);
        pivot.add(ring);
      }
      pivot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(pivot);
      // its collider while shut: the slab's bounds in the doorway
      const ex = [L.h[0], L.h[0] + Math.cos(L.a) * L.w], ez = [L.h[2], L.h[2] - Math.sin(L.a) * L.w];
      const box = this.ctx.physics.add([Math.min(...ex) - 0.06, L.h[1], Math.min(...ez) - 0.06], [Math.max(...ex) + 0.06, L.h[1] + height, Math.max(...ez) + 0.06], 'door');
      door.boxes.push(box);
      door.leaves.push({ pivot, base: L.a, dir: L.o });
    }
    door.center = new THREE.Vector3(hinge[0] + Math.cos(along) * width / 2, hinge[1] + height * 0.5, hinge[2] - Math.sin(along) * width / 2);
    this.list.push(door);
    return door;
  }

  /** The front and back materials of a biome pack door design (lib.biome.doors). */
  art(design) {
    this.artMats ??= new Map();
    if (this.artMats.has(design)) return this.artMats.get(design);
    const d = this.ctx.lib.biome?.doors.get(design);
    if (!d) { console.warn('no door design', design); return null; }
    const mat = (file) => {
      const t = this.ctx.lib.texture(file, false);
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      const m = new THREE.MeshPhongMaterial({ map: t, specular: 0x1a1816, shininess: 18, alphaTest: d.holes ? 0.5 : 0, side: d.holes ? THREE.DoubleSide : THREE.FrontSide });
      if (this.ctx.lib.normals) m.normalMap = this.ctx.lib.normalMap(file, 1.3);
      m.userData.door = true;
      return m;
    };
    const out = { front: mat(d.front), back: mat(d.back), aspect: d.size[0] / d.size[1] };
    this.artMats.set(design, out);
    return out;
  }

  /** The door the player is looking at, within reach. */
  aimed(camera) {
    const o = camera.position, d = camera.getWorldDirection(new THREE.Vector3());
    let best = null, bestD = 2.8;
    for (const door of this.list) {
      const to = door.center.clone().sub(o);
      const dist = to.length();
      if (dist > bestD) continue;
      to.normalize();
      if (to.dot(d) < 0.55) continue;
      best = door; bestD = dist;
    }
    return best;
  }

  toggle(door) {
    door.open = !door.open;
    if (door.open) for (const b of door.boxes) b.off = true; // walk through as soon as it moves
    this.ctx.sfx?.door?.(door.open, /cathedral/i.test(door.name));
  }

  update(dt) {
    for (const door of this.list) {
      const target = door.open ? 1 : 0;
      if (door.t === target) continue;
      door.t = Math.max(0, Math.min(1, door.t + (target ? dt : -dt) / SWING));
      const e = door.t * door.t * (3 - 2 * door.t);
      for (const L of door.leaves) L.pivot.rotation.y = L.base + L.dir * e * Math.PI * 0.52;
      if (door.t === 0) for (const b of door.boxes) b.off = false; // shut again: solid
    }
  }
}

/** A painted leaf's UVs: the painting across the front (+z) and back (-z) faces, or, for half
 * of a split pair, the half of it this leaf carries (the hinge side outermost on both faces). */
function artUV(g, split) {
  const uv = g.attributes.uv;
  // BoxGeometry faces: +x, -x, +y, -y, +z, -z, four vertices each
  for (let i = 16; i < 24; i++) {
    const u = uv.getX(i);
    uv.setX(i, !split ? u : i < 20 ? u * 0.5 : 0.5 + u * 0.5);
  }
}

/** Box UVs in metres over the material's tile size (like the rest of the world). */
function fitUV(g, w, h, mat) {
  const uv = g.attributes.uv, tu = mat.userData.tileU || 1, tv = mat.userData.tileV || 1;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tu, uv.getY(i) * h / tv);
}
