// What the monsters drop: the packs' weapons, reworked for Bellmourn (the bronze sword drawn out
// long and hacked with notches, the hatchet and the pick with forged back-spikes, the hide
// targe with an iron boss spike), each in a tier's colours: rusted, plain, gilded or bloodied.
// A drop lies turning slowly above the ground, glinting, until the player walks over it; then it
// goes straight into the hand it belongs in (the right for a weapon, the left for a shield),
// and hits harder than what it replaced if its tier is higher.
//
// foes.js calls ctx.loot.drop([x, y, z], { tier }) when something dies (tier 1-4; the caves'
// monsters drop one better).
import * as THREE from 'three';
import { ITEMS } from './viewmodel.js';

export const WEAPONS = [
  { id: 'notched_blade', kind: 'onehand', model: 'props/Sword_Bronze', name: 'Notched Blade', type: 'one-handed sword', grip: 0.13, len: 0.82, weight: 3 },
  { id: 'reaver_hatchet', kind: 'onehand', model: 'props/Axe_Bronze', name: "Reaver's Hatchet", type: 'one-handed axe', grip: 0.16, len: 0.72, weight: 3 },
  { id: 'grubber_pick', kind: 'onehand', model: 'props/Pickaxe_Bronze', name: "Grubber's Pick", type: 'one-handed pick', grip: 0.16, len: 0.74, weight: 2 },
  { id: 'spiked_targe', kind: 'shield_round', model: 'props/Shield_Wooden', name: 'Spiked Targe', type: 'round shield', size: 0.56, weight: 2 },
];
const TIERS = {
  1: { variant: 'rust', prefix: 'Rusted', power: 0.95 },
  2: { variant: '', prefix: '', power: 1.1 },
  3: { variant: 'gilt', prefix: 'Gilded', power: 1.3 },
  4: { variant: 'blood', prefix: 'Bloodied', power: 1.55 },
};

/** A weapon of a tier (1-4): `kind` 'onehand' or 'shield_round' to choose, otherwise by weight.
 * Also what the chests hold (items.js). */
export function rollWeapon({ tier = 1, kind = null } = {}) {
  const pool = WEAPONS.filter((w) => !kind || w.kind === kind);
  let r = Math.random() * pool.reduce((a, w) => a + w.weight, 0), w = pool[0];
  for (const p of pool) { r -= p.weight; if (r <= 0) { w = p; break; } }
  const t = TIERS[Math.max(1, Math.min(4, tier | 0))] || TIERS[1];
  return { ...w, tier, power: t.power, variant: t.variant, title: (t.prefix ? t.prefix + ' ' : '') + w.name };
}

export class Loot {
  /** hooks: { vm, onTake(weapon) } */
  constructor(ctx, hooks = {}) {
    this.ctx = ctx;
    this.hooks = hooks;
    this.list = [];
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    this.taken = [];
  }

  /** Drop a weapon at [x, y, z] (on the ground below it). tier 1-4; kind 'onehand' or
   * 'shield_round' to choose, otherwise by weight. Returns the drop. */
  drop(at, { tier = 1, kind = null } = {}) {
    const [x, y0, z] = Array.isArray(at) ? at : [at.x, at.y, at.z];
    const w = rollWeapon({ tier, kind });
    const ground = this.ctx.physics.floorAt ? this.ctx.physics.floorAt(x, z, y0 + 1, 0.2, 2) : null;
    const y = Number.isFinite(ground) ? ground : y0;
    const obj = this.ctx.kit.mesh(w.model, w.variant);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
    const holder = new THREE.Group();
    holder.add(obj);
    holder.position.set(x, y + 0.55, z);
    this.group.add(holder);
    const glint = new THREE.PointLight(w.variant === 'gilt' ? 0xffd070 : w.variant === 'blood' ? 0xff4030 : 0xc0c8ff, 0.9, 3.5, 2);
    glint.position.set(0, 0.2, 0);
    holder.add(glint);
    const item = { ...w, holder, glint, t: Math.random() * 6 };
    this.list.push(item);
    return item;
  }

  update(dt, player) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      it.t += dt;
      it.holder.rotation.y += dt * 1.4;
      it.holder.position.y += Math.sin(it.t * 2.2) * dt * 0.08;
      it.glint.intensity = 0.6 + 0.5 * Math.max(0, Math.sin(it.t * 5.3)) ** 6;
      const p = player.pos, h = it.holder.position;
      if (Math.hypot(p.x - h.x, p.z - h.z) < 1.3 && Math.abs(p.y + 0.5 - h.y) < 2) {
        this.list.splice(i, 1);
        this.group.remove(it.holder);
        this.take(it);
      }
    }
  }

  /** Into the hand: the held model built from the kit piece, turned to the hands' grip. */
  take(it) {
    const vm = this.hooks.vm;
    this.taken.push(it);
    if (!vm) { this.hooks.onTake?.(it); return; }
    const held = this.heldModel(it);
    vm.itemCache.set(it.kind, held);
    Object.assign(ITEMS[it.kind], { id: 'loot_' + it.id, name: it.title, type: it.type, power: it.power });
    if (it.kind === 'shield_round') vm.equip.L = 'shield_round';
    else { vm.equip.R = 'onehand'; if (vm.equip.L && ITEMS[vm.equip.L]?.both) vm.equip.L = null; }
    vm.applyEquip();
    this.hooks.onTake?.(it);
  }

  /** The kit weapon as the hands hold one: grip at the origin, blade up +y with its edges
   * along z (a shield: its face toward -z, centred). */
  heldModel(it) {
    const obj = this.ctx.kit.mesh(it.model, it.variant);
    const g = new THREE.Group(), inner = new THREE.Group();
    inner.add(obj);
    g.add(inner);
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj), size = b.getSize(new THREE.Vector3());
    if (it.kind === 'shield_round') {
      const s = it.size / Math.max(size.x, size.y);
      inner.scale.setScalar(s);
      inner.rotation.y = Math.PI;
      inner.position.set((b.min.x + b.max.x) / 2 * s, -(b.min.y + b.max.y) / 2 * s, 0);
    } else {
      const s = it.len / size.y;
      inner.rotation.y = Math.PI / 2; // the edge (model x) to the hand's z
      inner.scale.setScalar(s);
      const gripY = b.min.y + size.y * it.grip, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      inner.position.set(-cz * s, -gripY * s, cx * s);
    }
    g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    return g;
  }
}
