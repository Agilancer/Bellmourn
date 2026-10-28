// The first-person view: the gauntleted arms (templates/models/gauntlets) and the equipped
// items, in their own scene drawn over the world through the rigs' camera (90 degree
// horizontal FOV at 16:10, shrunk 0.58 toward the bottom centre), so the arms move exactly
// like the approved rigs. Clips are the rig animations by id; hit/fire times come from the
// manifest.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT = 'templates/models/';
export const ITEMS = {
  onehand: { id: 'arming_sword', name: 'Arming Sword', type: 'one-handed sword', hands: ['R', 'L'] },
  twohand: { id: 'greatsword', name: 'Greatsword', type: 'two-handed sword', hands: ['R', 'L'], both: true },
  wand: { id: 'crystal_wand', name: 'Crystal Wand', type: 'wand', hands: ['R', 'L'], tip: 0.34 },
  staff: { id: 'gnarled_staff', name: 'Gnarled Crystal Staff', type: 'staff', hands: ['R'], tip: 0.62 },
  shield_round: { id: 'ironbound', name: 'Iron-Bound Roundshield', type: 'round shield', hands: ['L'] },
  shield_kite: { id: 'knights_kite', name: "Knight's Kite", type: 'kite shield', hands: ['L'] },
};
const WALK = {
  R: { onehand: 'r1h_walk_3d', twohand: 'r2h_walk_3d', wand: 'r1w_walk', staff: 'r1s_walk', null: 'r1c_walk' },
  L: { onehand: 'l1h_walk_3d', shield_round: 'lsh_walk', shield_kite: 'lks_walk', wand: 'l1w_walk', null: 'l1c_walk' },
};
const ACT = {
  R: { onehand: 'r1h_swing_3d', twohand: 'r2h_swing_3d', wand: 'r1w_cast', staff: 'r1s_cast' },
  L: { onehand: 'l1h_swing_3d', wand: 'l1w_cast', shield_round: 'lsh_block', shield_kite: 'lks_block' },
};

export class ViewModel {
  constructor(manifest, lib = null) {
    this.manifest = manifest;
    this.lib = lib; // for normal maps made from each model's skin
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.hemi = new THREE.HemisphereLight(0xfff0dd, 0x302838, 1.2);
    this.sun = new THREE.DirectionalLight(0xffe0b0, 1.4);
    this.sun.position.set(-0.5, 0.8, 0.4);
    this.torch = new THREE.PointLight(0xffa050, 0, 3, 1.5);
    this.torch.position.set(0.2, 0.2, -0.3);
    this.flash = new THREE.PointLight(0xffffff, 0, 3, 1.5); // spells going off in your hands
    this.flash.position.set(0, -0.15, -0.45);
    this.scene.add(this.hemi, this.sun, this.torch, this.flash);
    this.loader = new GLTFLoader();
    this.arms = {};           // side -> {scene, mixer, actions, socket, item}
    this.equip = { R: 'onehand', L: 'shield_round' };
    this.state = { R: null, L: null }; // the playing one-shot: {name, t, events, done}
    this.blocking = false;
    this.listeners = [];
    this.gauntlet = 'wayfarer';
    this.itemCache = new Map();
  }

  on(fn) { this.listeners.push(fn); }
  emit(...a) { for (const f of this.listeners) f(...a); }

  resize(aspect) {
    // the rigs' projection (tools/models/viewer.html), widened for any aspect ratio
    const H = 240, S = this.manifest.view_scale, F = (H * 1.6 / 2) * S;
    const CY = H - (H / 2) * S, near = 0.02, far = 20;
    const fy = 2 * F / H, fx = fy / aspect;
    this.camera.projectionMatrix.set(
      fx, 0, 0, 0,
      0, fy, 2 * CY / H - 1, 0,
      0, 0, -(far + near) / (far - near), -2 * far * near / (far - near),
      0, 0, -1, 0);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  }

  async load(gauntlet = this.gauntlet) {
    this.gauntlet = gauntlet;
    const entry = this.manifest.arms.find((a) => a.id === gauntlet) || this.manifest.arms[0];
    for (const side of ['R', 'L']) {
      const old = this.arms[side];
      const g = await this.loader.loadAsync(ROOT + entry[side]);
      g.scene.traverse((o) => { if (o.isMesh) o.material = this.skin(o, false); });
      if (old) this.scene.remove(old.scene);
      this.scene.add(g.scene);
      const mixer = new THREE.AnimationMixer(g.scene);
      const actions = {};
      for (const clip of g.animations) actions[clip.name] = mixer.clipAction(clip);
      this.arms[side] = { scene: g.scene, mixer, actions, socket: g.scene.getObjectByName('item'),
        hand: g.scene.getObjectByName('hand'), item: null, walk: null };
    }
    await this.applyEquip();
  }

  async itemScene(kind) {
    const it = ITEMS[kind];
    const list = Object.values(this.manifest.items).flat();
    const entry = list.find((e) => e.id === it.id);
    if (!this.itemCache.has(kind)) {
      const g = await this.loader.loadAsync(ROOT + entry.path);
      g.scene.traverse((o) => { if (o.isMesh) o.material = this.skin(o, true); });
      this.itemCache.set(kind, g.scene);
    }
    return this.itemCache.get(kind).clone();
  }

  /** A retro-filtered, lit material for a model's skin: steel and gilt catch the light. */
  skin(o, item) {
    o.frustumCulled = false;
    const m = o.material;
    if (m.map) { m.map.magFilter = THREE.NearestFilter; m.map.minFilter = THREE.NearestFilter; m.map.generateMipmaps = false; m.map.needsUpdate = true; }
    const out = new THREE.MeshPhongMaterial({ map: m.map, side: THREE.DoubleSide,
      specular: item ? 0x6a625a : 0x1c1a18, shininess: item ? 48 : 16 });
    if (m.map && this.lib?.normals) out.normalMap = this.lib.normalFrom(m.map, item ? 1.0 : 1.3);
    return out;
  }

  /** Put the equipped items in the hands and start the matching walk loops. */
  async applyEquip() {
    if (this.equip.R && ITEMS[this.equip.R].both) this.equip.L = null; // two hands on one grip
    for (const side of ['R', 'L']) {
      const arm = this.arms[side];
      if (arm.item) { arm.socket.remove(arm.item); arm.item = null; }
      const kind = this.equip[side];
      if (kind && !(side === 'L' && this.equip.R && ITEMS[this.equip.R].both)) {
        arm.item = await this.itemScene(kind);
        arm.socket.add(arm.item);
      }
      this.state[side] = null;
      this.playWalk(side, true);
    }
  }

  walkClip(side) {
    if (this.equip.R && ITEMS[this.equip.R].both) return 'r2h_walk_3d';
    return WALK[side][this.equip[side] ?? 'null'];
  }

  playWalk(side, snap = false) {
    const arm = this.arms[side];
    const a = arm.actions[this.walkClip(side)];
    if (!a) return;
    for (const other of Object.values(arm.actions)) if (other !== a) other.stop();
    a.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (!snap) a.fadeIn(0.06);
    arm.walk = a;
    if (arm.item) arm.item.visible = true;
  }

  /** Play a one-shot clip on one arm (or both); events fire at the manifest's times. */
  play(side, name, { hold = null, hideItem = false } = {}) {
    const arm = this.arms[side];
    const a = arm.actions[name];
    if (!a) return false;
    for (const other of Object.values(arm.actions)) if (other !== a) other.stop();
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.play();
    if (arm.item) arm.item.visible = !hideItem;
    const ev = this.manifest.events[name] || {};
    this.state[side] = { name, action: a, last: 0, events: ev, duration: ev.duration ?? a.getClip().duration, hold };
    return true;
  }

  busy(side) { return !!this.state[side]; }

  /** Attack with the right hand (LMB). Returns what happened, for the caller. */
  attackRight() {
    if (this.busy('R')) return null;
    const kind = this.equip.R;
    if (!kind) return 'spell';
    const both = ITEMS[kind].both;
    if (both && this.busy('L')) return null;
    this.play('R', ACT.R[kind]);
    if (both) this.play('L', ACT.R[kind]);
    return kind;
  }

  /** The left hand's action (RMB): shields block while held; wands cast; swords swing. */
  actLeft(held) {
    const kind = this.equip.L;
    if (this.equip.R && ITEMS[this.equip.R].both) return null;
    if (kind === 'shield_round' || kind === 'shield_kite') {
      if (held && !this.blocking && !this.busy('L')) {
        this.blocking = true;
        const name = ACT.L[kind];
        const t3 = this.manifest.frame_starts[name][3];
        this.play('L', name, { hold: t3 });
        if (this.equip.R === 'onehand' && !this.busy('R')) this.play('R', 'r1h_shield_back_3d', { hold: t3 });
      }
      if (!held && this.blocking) { // let go: play on from the hold to the end
        this.blocking = false;
        for (const s of ['L', 'R']) if (this.state[s]) this.state[s].hold = null;
      }
      return this.blocking ? 'block' : null;
    }
    if (!held || this.busy('L')) return null;
    if (!kind) return 'spell';
    this.play('L', ACT.L[kind]);
    return kind;
  }

  /** Cast a spell with free hands: one-hand spells use the left hand if it's free, else the
   * right, else the left lowers what it holds; two-hand spells lower both. */
  cast(spell) {
    if (this.busy('R') || this.busy('L') || this.blocking) return null;
    if (spell.hands === 2) {
      this.play('R', 'b2c_cast', { hideItem: true });
      this.play('L', 'b2c_cast', { hideItem: true });
      return 'both';
    }
    const side = !this.equip.L || (this.equip.R && ITEMS[this.equip.R].both) ? 'L' : (!this.equip.R ? 'R' : 'L');
    if (side === 'L' && this.equip.R && ITEMS[this.equip.R].both) { // the two-hander: both hands come off it
      this.play('R', 'b2c_cast', { hideItem: true });
      this.play('L', 'b2c_cast', { hideItem: true });
      return 'both';
    }
    this.play(side, side === 'R' ? 'r1c_cast' : 'l1c_cast', { hideItem: true });
    return side;
  }

  /** Where a held item's tip (or an empty hand's palm) is, in view-model camera space. */
  castPoint(side) {
    const arm = this.arms[side];
    const kind = this.equip[side];
    const it = kind && ITEMS[kind];
    const p = new THREE.Vector3();
    if (arm.item && arm.item.visible && it?.tip) {
      p.set(0, it.tip, 0);
      arm.socket.localToWorld(p);
    } else {
      p.set(side === 'R' ? -0.06 : 0.06, 0, -0.06); // just in front of the palm
      arm.hand.localToWorld(p);
    }
    return p;
  }

  update(dt, speed) {
    for (const side of ['R', 'L']) {
      const arm = this.arms[side];
      if (!arm) continue;
      const st = this.state[side];
      if (st) {
        const a = st.action;
        if (st.hold != null && a.time >= st.hold) { a.time = st.hold; a.paused = true; }
        else a.paused = false;
        const t = a.time;
        for (const [kind, times] of Object.entries(st.events)) {
          if (!Array.isArray(times)) continue;
          for (const et of times) if (st.last < et && t >= et) this.emit(kind, side, st.name);
        }
        st.last = t;
        if (!a.paused && t >= st.duration - 1e-4) {
          this.state[side] = null;
          this.playWalk(side);
        }
      } else if (arm.walk) {
        arm.walk.timeScale = 0.25 + Math.min(1.3, speed / 6.2);
      }
      arm.mixer.update(dt);
    }
  }

  /** ambient: 0 (dark) .. 1 (daylight); torch: warm light from flames nearby; flash: a spell. */
  setLight(ambient, sun, torch, flash, flashColor) {
    this.hemi.intensity = 0.03 + 1.0 * ambient;
    this.sun.intensity = 1.4 * sun;
    this.torch.intensity = torch;
    this.flash.intensity = flash;
    if (flashColor) this.flash.color.copy(flashColor);
  }
}
