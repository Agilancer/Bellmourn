// Doors that open: the kit's own door leaves (the village doors, the dungeon's arched door,
// the trapdoor), each on a hinge, swung by E. While shut a door is a collider; it stops being
// one the moment it starts to open, and is one again when it's shut.
import * as THREE from 'three';

const SWING = 0.7; // seconds to open

export class KitDoors {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
  }

  /**
   * hinge: [x, y, z] the foot of the hinge side; along: the world angle the shut door runs from
   * its hinge to its latch (three.js rotation.y of the leaf); width, height: the doorway (the
   * leaf is scaled to it); opens: +1 or -1; model: the kit door; double: two leaves.
   */
  add({ hinge, along, width = 1.12, height = 2.2, opens = 1, name = 'door', model = 'village/Door_1_Flat', double = false, variant = '' }) {
    const kit = this.ctx.kit, info = kit.info_(model) || { min: [0, 0, -0.05], max: [1.1, 2.1, 0.1] };
    const mw = info.max[0] - info.min[0], mh = info.max[1] - info.min[1];
    const leaves = double ? [{ h: hinge, a: along, w: width / 2, o: opens },
      { h: [hinge[0] + Math.cos(along) * width, hinge[1], hinge[2] - Math.sin(along) * width], a: along + Math.PI, w: width / 2, o: -opens }]
      : [{ h: hinge, a: along, w: width, o: opens }];
    const door = { name, leaves: [], open: false, t: 0, boxes: [] };
    for (const L of leaves) {
      const pivot = new THREE.Group();
      pivot.position.set(...L.h);
      pivot.rotation.y = L.a;
      const leaf = kit.mesh(model, variant);
      leaf.scale.set(L.w / mw, height / mh, 1);
      leaf.position.set(-info.min[0] * L.w / mw, -info.min[1] * height / mh, 0);
      if (L !== leaves[0]) { leaf.scale.x *= -1; leaf.position.x = L.w + info.min[0] * L.w / mw; }
      pivot.add(leaf);
      this.group.add(pivot);
      const ex = [L.h[0], L.h[0] + Math.cos(L.a) * L.w], ez = [L.h[2], L.h[2] - Math.sin(L.a) * L.w];
      door.boxes.push(this.ctx.physics.add([Math.min(...ex) - 0.06, L.h[1], Math.min(...ez) - 0.06], [Math.max(...ex) + 0.06, L.h[1] + height, Math.max(...ez) + 0.06], 'door'));
      door.leaves.push({ pivot, base: L.a, dir: L.o });
    }
    door.center = new THREE.Vector3(hinge[0] + Math.cos(along) * width / 2, hinge[1] + height * 0.5, hinge[2] - Math.sin(along) * width / 2);
    this.list.push(door);
    return door;
  }

  /** The door the player is looking at, within reach. */
  aimed(camera) {
    const o = camera.position, d = camera.getWorldDirection(new THREE.Vector3());
    let best = null, bestD = 2.8;
    for (const door of this.list) {
      const to = door.center.clone().sub(o);
      const dist = to.length();
      if (dist > bestD) continue;
      if (to.normalize().dot(d) < 0.55) continue;
      best = door; bestD = dist;
    }
    return best;
  }

  toggle(door) {
    door.open = !door.open;
    if (door.open) for (const b of door.boxes) b.off = true;
    this.ctx.sfx?.door?.(door.open);
  }

  update(dt) {
    for (const door of this.list) {
      const target = door.open ? 1 : 0;
      if (door.t === target) continue;
      door.t = Math.max(0, Math.min(1, door.t + (target ? dt : -dt) / SWING));
      const e = door.t * door.t * (3 - 2 * door.t);
      for (const L of door.leaves) L.pivot.rotation.y = L.base + L.dir * e * Math.PI * 0.52;
      if (door.t === 0) for (const b of door.boxes) b.off = false;
    }
  }
}
