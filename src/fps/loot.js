// Loot: what lies on the ground to be taken up, and what the world keeps in its chests, crates,
// barrels, sacks and pots. A drop lies turning slowly above the ground in a shaft of its
// rarity's colour until you walk over it: gold and draughts go straight into the purse and the
// bag, gear into the first free place in the bag (it stays put if the bag is full). A container
// is searched with E: whatever it held spills out in front of it, and it stays searched.
//
// What anything holds is rolled for where it is: better in the undercroft and the caves than in
// the village, better the further out into the wild countries.
// foes.js calls ctx.loot.drop([x, y, z], { tier }) when something dies (tier 1-4).
import * as THREE from 'three';
import { makeGear, makePotion, RARITY, addToBag, itemColor } from './gear.js';
import { GEMS } from './gems.js';
import { MATS, addMat } from './craft.js';

// how good what a place holds is (an item level), from where it is
export function placeLevel(p, under = false) {
  const d = Math.hypot(p.x, p.z);
  let lv = d < 100 ? 1 + d / 50 : 3 + (d - 100) / 70;
  if (under) lv += 5;
  return Math.max(1, Math.min(30, Math.round(lv + (Math.random() - 0.5) * 2)));
}

// what each kind of container can hold: [items min, max], chance of gold, gold scale, chance of
// a draught, rarity bonus, the verb for the prompt
const HOLDS = [
  [/Chest_Gold/, { items: [2, 4], gold: 1, goldK: 4, potion: 0.6, bonus: 2.5, name: 'gilded chest' }],
  [/ossuary_chest/, { items: [1, 3], gold: 0.7, goldK: 2, potion: 0.3, bonus: 1.2, name: 'ossuary chest' }],
  [/Chest/, { items: [1, 3], gold: 0.8, goldK: 2, potion: 0.5, bonus: 0.8, name: 'chest' }],
  [/Cabinet|Drawers/, { items: [0, 1], gold: 0.4, goldK: 0.8, potion: 0.5, bonus: 0.2, name: 'cupboard' }],
  [/Crate/, { items: [0, 1], gold: 0.25, goldK: 0.6, potion: 0.35, bonus: 0, name: 'crate' }],
  [/Barrel/, { items: [0, 1], gold: 0.2, goldK: 0.5, potion: 0.4, bonus: 0, name: 'barrel' }],
  [/Bag_Coins/, { items: [0, 0], gold: 1, goldK: 2.5, potion: 0, bonus: 0, name: 'coin purse' }],
  [/Bag|Pouch/, { items: [0, 1], gold: 0.7, goldK: 1, potion: 0.3, bonus: 0.2, name: 'sack' }],
  [/Pot_|Vase/, { items: [0, 1], gold: 0.5, goldK: 0.5, potion: 0.25, bonus: 0, name: 'pot' }],
];
const KIND_OF = (id) => HOLDS.find(([re]) => re.test(id))?.[1] || null;
// the Velscour world's props (props.js) that hold something
const PROP_HOLDS = { treasure_chest: KIND_OF('Chest'), crate: KIND_OF('Crate'), barrel: KIND_OF('Barrel'),
  sarcophagus: { ...KIND_OF('ossuary_chest'), name: 'sarcophagus' } };
// the pottery (there's a lot of it, and a spell breaks a whole huddle): mostly empty, now and
// then a draught, a few coins or one thing worth having (itemP: the chance of one item)
const POTTERY = { items: [0, 0], itemP: 0.1, gold: 0.35, goldK: 0.3, potion: 0.1, bonus: 0, name: 'pot' };
// the crates, barrels, chests and pottery modelled for the object texture sheets (props.js)
const propHolds = (id) => PROP_HOLDS[id] || (/^chest_gilded/.test(id) ? KIND_OF('Chest_Gold')
  : /^chest_domed_stone/.test(id) ? { ...KIND_OF('ossuary_chest'), name: 'reliquary' }
    : /^chest_/.test(id) ? KIND_OF('Chest') : /^crate_/.test(id) ? KIND_OF('Crate') : /^barrel_/.test(id) ? KIND_OF('Barrel')
      : /^(jar_|amphora|vase_|urn_|crock_)/.test(id) ? { ...POTTERY, name: /^jar|^crock/.test(id) ? 'jar' : /^urn/.test(id) ? 'urn' : /^amphora/.test(id) ? 'amphora' : 'vase' } : null);

const glowTex = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const S = 32, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    t = new THREE.CanvasTexture(cv);
    return t;
  };
})();

export class Loot {
  /** hooks: { char(), models: async (item) -> Object3D, onTake(item, text), full(), zone(p) -> {under},
   * find() -> the rarity bonus for better things found, extra(container's name, item level) -> more
   * things it holds (materials, gems, plans: craft.js) } */
  constructor(ctx, hooks = {}) {
    this.ctx = ctx;
    this.hooks = hooks;
    this.list = [];
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    this.beamGeo = new THREE.CylinderGeometry(0.03, 0.09, 2.2, 6, 1, true).translate(0, 1.1, 0);
    this.containers = [];
    this.grid = new Map();
  }

  // -------------------------------------------------------------- containers
  /** Every container the kit placed becomes something to search. */
  findContainers(kit) {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (const [key, list] of kit.placed) {
      const id = key.split('|')[0], info = kit.info_(id) || {};
      if (info.category !== 'container' && !/Cabinet|Drawers|Prop_Crate|ossuary_chest/.test(id)) continue;
      const holds = KIND_OF(id);
      if (!holds) continue;
      if (/FarmCrate|Coin_Pile/.test(id)) continue;   // the market's open crates of apples: nothing hidden in them
      const hi = info.max || [0.4, 0.8, 0.4];
      for (const e of list) {
        e.m.decompose(p, q, s);
        this.addContainer({ id, holds, x: p.x, y: p.y + hi[1] * s.y * 0.55, z: p.z, top: p.y + hi[1] * s.y, r: Math.max(hi[0], hi[2]) * Math.max(s.x, s.z), searched: false, rot: new THREE.Euler().setFromQuaternion(q, 'YXZ').y });
      }
    }
    return this.containers.length;
  }

  /** Every chest, crate, barrel and sarcophagus among the world's props (once they've loaded). */
  findProps(props) {
    for (const [id, list] of props.place) {
      const holds = propHolds(id), bb = props.boxes.get(id);
      if (!holds || !bb) continue;
      const r = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z);
      list.forEach((p, i) => this.addContainer({ id, holds, x: p.x, y: p.y + bb.max.y * p.scale * 0.55, z: p.z, top: p.y + bb.max.y * p.scale, r: r * p.scale, searched: false, rot: p.rot, index: i }));
    }
    return this.containers.length;
  }

  addContainer(c) {
    this.containers.push(c);
    const k = `${Math.floor(c.x / 8)},${Math.floor(c.z / 8)}`;
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push(c);
  }

  /** The container you're looking at, close enough to reach. */
  aimed(camera) {
    const o = camera.position, d = camera.getWorldDirection(new THREE.Vector3());
    let best = null, bestS = 0;
    const gx = Math.floor(o.x / 8), gz = Math.floor(o.z / 8);
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) for (const c of this.grid.get(`${gx + i},${gz + k}`) || []) {
      if (c.broken) continue;
      const tx = c.x - o.x, ty = c.y - o.y, tz = c.z - o.z, dist = Math.hypot(tx, ty, tz);
      if (dist > 2.6 + c.r) continue;
      const dot = (tx * d.x + ty * d.y + tz * d.z) / dist;
      const need = Math.cos(Math.min(0.9, Math.atan2(c.r + 0.25, dist)));
      if (dot < need) continue;
      const score = dot - dist * 0.05;
      if (score > bestS) { best = c; bestS = score; }
    }
    return best;
  }

  /** Search it: what it holds spills out at your feet (a container with `contents` of its own,
   * like the Red Throne's hoard, gives those instead of a roll for the place). */
  search(c, player) {
    if (c.index !== undefined) this.ctx.props?.open(c.id, c.index);   // (a chest's lid swings back)
    // toward you, out of the front of it
    return this.spill(c, Math.atan2(player.pos.z - c.z, player.pos.x - c.x));
  }

  /** A crate, barrel or pot broken (props.js): whatever it still held lies on the ground where
   * it stood, thrown the way the blow went. */
  broke(id, index, dir) {
    const c = this.containers.find((q) => q.id === id && q.index === index);
    if (!c || c.broken) return 0;
    c.broken = true;
    if (c.searched) return 0;
    return this.spill(c, dir ? Math.atan2(dir.z, dir.x) : Math.random() * 6.28, true);
  }

  /** What a container holds (rolled now, for where it is), out onto the ground in a fan about
   * `toward` (radians in the xz plane); `wide`: all round, as from something smashed. */
  spill(c, toward, wide = false) {
    c.searched = true;
    const H = c.holds, under = this.hooks.zone?.(c)?.under;
    const lv = placeLevel(c, under);
    const out = c.contents ? c.contents(lv) : [];
    const n = c.contents ? 0 : H.itemP !== undefined ? (Math.random() < H.itemP ? 1 : 0) : H.items[0] + Math.floor(Math.random() * (H.items[1] - H.items[0] + 1));
    for (let i = 0; i < n; i++) out.push(makeGear({ ilvl: lv, bonus: H.bonus + (this.hooks.find?.() || 0) }));
    if (!c.contents) out.push(...(this.hooks.extra?.(H.name, lv) || []));
    if (!c.contents && Math.random() < H.gold) out.push({ type: 'gold', amount: Math.max(1, Math.round((3 + lv * 2.5) * H.goldK * (0.5 + Math.random()))) });
    if (!c.contents && Math.random() < H.potion) out.push(makePotion(Math.random() < 0.6 ? 'life' : 'mana', 1));
    const step = wide ? Math.min(1.2, 6.28 / Math.max(1, out.length)) : Math.min(0.5, 2.4 / out.length), far = out.length > 4 ? 0.5 : 0;   // (a big haul fans out wider, still in front)
    out.forEach((it, i) => {
      const a = toward + (i - (out.length - 1) / 2) * step;
      const r = (wide ? c.r * 0.6 + 0.35 : c.r + 0.55) + far * (i % 2);
      this.spawn(it, c.x + Math.cos(a) * r, wide ? c.y + 0.2 : c.top, c.z + Math.sin(a) * r, { pop: true });
    });
    return out.length;
  }

  // -------------------------------------------------------------- drops
  /** A foe's death: maybe gear, maybe gold, maybe a draught. tier 1-4. */
  drop(at, { tier = 1, under = false } = {}) {
    const [x, y, z] = Array.isArray(at) ? at : [at.x, at.y, at.z];
    const lv = Math.max(placeLevel({ x, z }, under), tier * 3);
    this.spawn(makeGear({ ilvl: lv, bonus: tier * 0.4 + (this.hooks.find?.() || 0) }), x, y + 0.5, z, { pop: true });
    if (Math.random() < 0.5) this.spawn({ type: 'gold', amount: Math.round((4 + lv * 3) * (0.5 + Math.random())) }, x + 0.4, y + 0.5, z + 0.3, { pop: true });
    if (Math.random() < 0.25) this.spawn(makePotion('life', 1), x - 0.4, y + 0.5, z - 0.2, { pop: true });
  }

  /** Something lying in the world to be taken up (it comes to rest on the floor below). */
  spawn(item, x, y, z, { pop = false } = {}) {
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    this.group.add(holder);
    const col = new THREE.Color(item.type === 'gear' || item.type === 'gem' || item.type === 'recipe' ? itemColor(item) : item.type === 'gold' ? '#ffd34a'
      : item.type === 'mat' ? (MATS[item.mat]?.tier >= 3 ? MATS[item.mat].tint[0] : '#d8c8a0') : item.kind === 'mana' ? '#6a8aff' : '#ff5a4a');
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.65 }));
    glow.scale.setScalar(item.type === 'gear' ? 0.9 : item.type === 'gem' ? 0.75 : 0.6);
    holder.add(glow);
    let beam = null;
    // the better things show from afar (a fine gem, a rare plan, a great one's reagent too)
    const shows = item.type === 'gear' ? item.rarity >= 1 : item.type === 'gem' ? item.grade >= 3 || GEMS[item.gem]?.only : item.type === 'recipe' ? item.tier >= 2 : item.type === 'mat' && MATS[item.mat]?.tier >= 3;
    if (shows) {
      beam = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22 + (item.rarity ?? 2) * 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = -0.45;
      holder.add(beam);
    }
    const it = { item, holder, glow, beam, t: Math.random() * 6, vy: pop ? 2.2 + Math.random() : 0, rest: !pop, floor: null, model: null, age: 0 };
    const phys = this.ctx.physics;
    const fl = phys.floorAt(x, z, y + 0.3, 0.15, 3);
    it.floor = Number.isFinite(fl) ? fl : y - 0.5;
    if (!pop) holder.position.y = it.floor + 0.45;
    this.hooks.models?.(item).then((obj) => {
      if (!obj || !this.list.includes(it)) return;
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = true; } });
      holder.add(obj);
      it.model = obj;
    });
    this.list.push(it);
    return it;
  }

  /** take: whether walking over things takes them up (not while flying in no-clip: the Debug Menu). */
  update(dt, player, take = true) {
    const p = player.pos;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i], h = it.holder.position;
      it.t += dt; it.age += dt;
      if (!it.rest) {
        it.vy -= 12 * dt;
        h.y += it.vy * dt;
        if (h.y <= it.floor + 0.45 && it.vy < 0) { h.y = it.floor + 0.45; it.rest = true; }
      } else h.y = it.floor + 0.45 + Math.sin(it.t * 2.2) * 0.04;
      if (it.model) it.model.rotation.y += dt * 1.2;
      it.glow.material.opacity = 0.45 + 0.25 * Math.max(0, Math.sin(it.t * 4.3)) ** 4;
      if (it.age < 0.6 || !take) continue;
      const near = Math.hypot(p.x - h.x, p.z - h.z) < 1.2 && Math.abs(p.y + 0.5 - h.y) < 1.6;
      if (!near) { it.warned = false; continue; }
      const took = this.take(it.item);
      if (!took) { if (!it.warned) { it.warned = true; this.hooks.full?.(it.item); } continue; }
      this.list.splice(i, 1);
      this.group.remove(it.holder);
      it.glow.material.dispose(); it.beam?.material.dispose();
    }
  }

  take(item) {
    const c = this.hooks.char();
    if (item.type === 'gold') { c.gold += item.amount; this.hooks.onTake?.(item, `${item.amount} gold`); return true; }
    // materials go into the crafter's pouch (no room in the bag taken): craft.js
    if (item.type === 'mat') { addMat(c, item.mat, item.n || 1); this.hooks.onTake?.(item, `${item.n > 1 ? item.n + ' × ' : ''}${MATS[item.mat]?.name || item.mat}`); return true; }
    if (!addToBag(c, item)) return false;
    this.hooks.onTake?.(item, item.type === 'potion' ? `a ${item.name}` : item.type === 'gem' ? `a ${item.name}` : `the ${item.name}`);
    return true;
  }
}
