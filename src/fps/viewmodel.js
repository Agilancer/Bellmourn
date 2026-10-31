// The first-person view: the gauntleted arms (templates/models/gauntlets) and the equipped
// items, in their own scene drawn over the world through the rigs' camera (90 degree
// horizontal FOV at 16:10, shrunk 0.58 toward the bottom centre), so the arms move exactly
// like the approved rigs. Clips are the rig animations by id; hit/fire times come from the
// manifest.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { refineTexture } from './engine.js';

const ROOT = 'templates/models/';
// the greatsword turns a quarter in the hands as the swing lifts it, so it cuts with the edge
// (the upright carry shows the flat); it turns back as it rises to upright again
const ROLL_2H = { clip: 'r2h_swing_3d', angle: Math.PI / 2, in: [0.04, 0.2], out: 0.22 };
// the two-handed blades that turn like it; axes, hammers and polearms keep their head leading
const ROLLED = new Set(['greatsword', 'claymore', 'flamberge', 'headsman', 'bloodletter',
  'penitents_greatsword', 'tombstone']);
// the kinds whose model can be chosen in the inventory (every model of that kind in the manifest)
const MODEL_TYPE = { onehand: 'one-handed weapon', twohand: 'two-handed weapon' };
export const ITEMS = {
  onehand: { id: 'arming_sword', name: 'Arming Sword', type: 'one-handed sword', hands: ['R', 'L'] },
  twohand: { id: 'greatsword', name: 'Greatsword', type: 'two-handed sword', hands: ['R', 'L'], both: true,
    roll: ROLL_2H },
  staff: { id: 'gnarled_staff', name: 'Gnarled Crystal Staff', type: 'staff', hands: ['R'], tip: 0.62 },
  shield_round: { id: 'ironbound', name: 'Iron-Bound Roundshield', type: 'round shield', hands: ['L'] },
  shield_kite: { id: 'knights_kite', name: "Knight's Kite", type: 'kite shield', hands: ['L'] },
};
const WALK = {
  R: { onehand: 'r1h_walk_3d', twohand: 'r2h_walk_3d', staff: 'r1s_walk', null: 'r1c_walk' },
  L: { onehand: 'l1h_walk_3d', shield_round: 'lsh_walk', shield_kite: 'lks_walk', null: 'l1c_walk' },
};
const ACT = {
  R: { onehand: 'r1h_swing_3d', twohand: 'r2h_swing_3d', staff: 'r1s_cast' },
  L: { onehand: 'l1h_swing_3d', shield_round: 'lsh_block', shield_kite: 'lks_block' },
};

/**
 * The rigs are keyed like sprite frames: one pose per frame, each held until the next (the
 * exporter writes STEP tracks). Played that way in 3D they judder, so every track is resampled
 * at 60 Hz along a monotone cubic through the frame poses: time-aware tangents keep the short
 * smear frames fast and let held frames ease, and it never overshoots a pose. Walk loops wrap
 * round to their first pose; one-shots (which start and end on the carry) ease in and out.
 * Quaternions stay in one hemisphere and are renormalised.
 */
const RATE = 60;
export function smoothClip(clip, loop) {
  const end = clip.duration;
  const tracks = clip.tracks.map((tr) => {
    const S = tr.getValueSize(), n = tr.times.length;
    const m = n > 1 && Math.abs(tr.times[n - 1] - end) < 1e-4 ? n - 1 : n; // drop the end hold
    if (m < 2) return tr;
    const T = [], V = [];
    for (let i = 0; i < m; i++) { T.push(tr.times[i]); V.push(Array.from(tr.values.subarray(i * S, i * S + S))); }
    T.push(end); V.push((loop ? V[0] : V[m - 1]).slice());
    const quat = tr.name.endsWith('.quaternion');
    const dot = (a, b) => a.reduce((s, x, c) => s + x * b[c], 0);
    if (quat) for (let i = 1; i < V.length; i++) if (dot(V[i], V[i - 1]) < 0) V[i] = V[i].map((x) => -x);
    const K = V.length;
    // neighbours either side of key i (across the seam for loops)
    const prev = (i) => (i > 0 ? [V[i - 1], T[i - 1]] : loop ? [V[K - 2], T[K - 2] - end] : null);
    const next = (i) => (i < K - 1 ? [V[i + 1], T[i + 1]] : loop ? [V[1], end + T[1]] : null);
    const tan = V.map((v, i) => {
      const p = prev(i), q = next(i);
      if (!p || !q || (!loop && i >= K - 2)) return v.map(() => 0); // ease out of / into rest
      const a = quat && dot(p[0], v) < 0 ? p[0].map((x) => -x) : p[0];
      const b = quat && dot(q[0], v) < 0 ? q[0].map((x) => -x) : q[0];
      return v.map((x, c) => {
        const d0 = (x - a[c]) / (T[i] - p[1]), d1 = (b[c] - x) / (q[1] - T[i]);
        if (d0 * d1 <= 0) return 0; // a turning point: hold still there (no overshoot)
        const t = (b[c] - a[c]) / (q[1] - p[1]);
        return Math.sign(t) * Math.min(Math.abs(t), 3 * Math.abs(d0), 3 * Math.abs(d1));
      });
    });
    const times = [], values = [];
    let seg = 0;
    const steps = Math.max(1, Math.round(end * RATE));
    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * end;
      while (seg < K - 2 && t > T[seg + 1]) seg++;
      const h = T[seg + 1] - T[seg], u = h > 0 ? Math.min(1, Math.max(0, (t - T[seg]) / h)) : 0;
      const u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      const out = V[seg].map((x, c) => h00 * x + h10 * h * tan[seg][c] + h01 * V[seg + 1][c] + h11 * h * tan[seg + 1][c]);
      if (quat) { const l = Math.hypot(...out) || 1; for (let c = 0; c < 4; c++) out[c] /= l; }
      times.push(t); values.push(...out);
    }
    return new tr.constructor(tr.name, times, values);
  });
  return new THREE.AnimationClip(clip.name, end, tracks);
}

export class ViewModel {
  constructor(manifest, lib = null) {
    this.manifest = manifest;
    this.lib = lib; // for normal maps made from each model's skin
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.hemi = new THREE.HemisphereLight(0xfff0dd, 0x302838, 1.2);
    this.sun = new THREE.DirectionalLight(0xffe0b0, 1.4);
    this.sun.position.set(-0.5, 0.8, 0.4);
    // the nearest flames' light, from where they are (a point light by the hands burnt a spot into
    // whatever was held: setLight aims this)
    this.torch = new THREE.DirectionalLight(0xffa050, 0);
    this.torch.position.set(0.6, 0.5, 0.2);
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

  /** Fetch a gauntlet's two arm models ahead of time: load() then has them at once (the opening
   * brings in the gauntlets the village gives you). */
  prefetch(gauntlet) {
    const entry = this.manifest.arms.find((a) => a.id === gauntlet);
    if (!entry) return Promise.resolve();
    this.fetched ||= new Map();
    return Promise.all(['R', 'L'].map((side) => {
      const url = ROOT + entry[side];
      if (!this.fetched.has(url)) this.fetched.set(url, new THREE.FileLoader().setResponseType('arraybuffer').loadAsync(url).catch((e) => { this.fetched.delete(url); throw e; }));
      return this.fetched.get(url);
    }));
  }

  async load(gauntlet = this.gauntlet) {
    this.gauntlet = gauntlet;
    const entry = this.manifest.arms.find((a) => a.id === gauntlet) || this.manifest.arms[0];
    for (const side of ['R', 'L']) {
      const old = this.arms[side];
      const url = ROOT + entry[side], ahead = this.fetched?.get(url);
      if (ahead) this.fetched.delete(url);   // (used once: not kept about)
      const g = ahead ? await this.loader.parseAsync(await ahead, THREE.LoaderUtils.extractUrlBase(url)) : await this.loader.loadAsync(url);
      g.scene.traverse((o) => { if (o.isMesh) o.material = this.skin(o, false); });
      if (old) this.scene.remove(old.scene);
      this.scene.add(g.scene);
      const mixer = new THREE.AnimationMixer(g.scene);
      const actions = {};
      for (const clip of g.animations) actions[clip.name] = mixer.clipAction(smoothClip(clip, /_walk/.test(clip.name)));
      this.arms[side] = { scene: g.scene, mixer, actions, socket: g.scene.getObjectByName('item'),
        hand: g.scene.getObjectByName('hand'), item: null, walk: null, current: null };
    }
    await this.applyEquip();
  }

  async itemScene(kind) {
    const it = ITEMS[kind];
    return this.modelScene(it.id, it.finish);
  }

  /** A clone of arm model `id` (any kind) in a finish (one of the manifest's painted variants),
   * loaded once. */
  async modelScene(id, finish = '') {
    const key = id + '|' + (finish || '');
    if (!this.itemCache.has(key)) {
      this.itemCache.set(key, (async () => {
        const entry = Object.values(this.manifest.items).flat().find((e) => e.id === id);
        if (!entry) return new THREE.Group();
        const g = await this.loader.loadAsync(ROOT + entry.path);
        let map = null;
        if (finish && entry.variants?.[finish]) {
          map = await (this.texLoader ||= new THREE.TextureLoader()).loadAsync(ROOT + entry.variants[finish]).catch(() => null);
          if (map) { map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; }
        }
        g.scene.traverse((o) => { if (o.isMesh) { if (map) o.material.map = map; o.material = this.skin(o, true); } });
        return g.scene;
      })());
    }
    return (await this.itemCache.get(key)).clone();
  }

  /** The models `kind` can be ([{id, name}]; none for kinds without a choice). */
  models(kind) {
    return MODEL_TYPE[kind] ? (this.manifest.items[kind] || []).map((e) => ({ id: e.id, name: e.name })) : [];
  }

  /** Make `kind` that model (dropping a loot drop's power) and re-arm the hands. */
  /** Make the `kind` in the hands model `id` in a finish (from the gear worn); applyEquip() after. */
  setArm(kind, id, name, finish = '') {
    Object.assign(ITEMS[kind], { id, name, finish, power: undefined });
    if (ITEMS[kind].both) ITEMS[kind].roll = ROLLED.has(id) ? ROLL_2H : undefined;
  }

  async setModel(kind, id) {
    const e = this.models(kind).find((m) => m.id === id);
    if (!e) return;
    Object.assign(ITEMS[kind], { id, name: e.name, type: MODEL_TYPE[kind], power: undefined });
    if (ITEMS[kind].both) ITEMS[kind].roll = ROLLED.has(id) ? ROLL_2H : undefined;
    await this.applyEquip();
  }

  /** The models `kind` can be ([{id, name}]; none for kinds without a choice). */
  models(kind) {
    return MODEL_TYPE[kind] ? (this.manifest.items[kind] || []).map((e) => ({ id: e.id, name: e.name })) : [];
  }

  /** Make `kind` that model (dropping a loot drop's power) and re-arm the hands. */
  async setModel(kind, id) {
    const e = this.models(kind).find((m) => m.id === id);
    if (!e) return;
    Object.assign(ITEMS[kind], { id, name: e.name, type: MODEL_TYPE[kind], power: undefined });
    if (ITEMS[kind].both) ITEMS[kind].roll = ROLLED.has(id) ? ROLL_2H : undefined;
    this.itemCache.delete(kind);
    await this.applyEquip();
  }

  /** A lit material for a model's skin, its texels crisp but anti-aliased (engine.js): steel and gilt
   * catch the light. */
  skin(o, item) {
    o.frustumCulled = false;
    const m = o.material;
    refineTexture(m.map);
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

  /** Switch an arm to action `a`, cross-fading from whatever it was playing so the weights
   * always sum to one (fading in from nothing would let the bind pose show through). */
  switchTo(arm, a, fade) {
    const prev = arm.current;
    for (const other of Object.values(arm.actions)) if (other !== a && other !== prev) other.stop();
    a.reset();
    a.setEffectiveWeight(1);
    a.play();
    if (prev && prev !== a && fade > 0) a.crossFadeFrom(prev, fade, false);
    else if (prev && prev !== a) prev.stop();
    arm.current = a;
  }

  playWalk(side, snap = false) {
    const arm = this.arms[side];
    const a = arm.actions[this.walkClip(side)];
    if (!a) return;
    a.setLoop(THREE.LoopRepeat, Infinity);
    this.switchTo(arm, a, snap ? 0 : 0.14);
    arm.walk = a;
    if (arm.item) arm.item.visible = true;
  }

  /** Play a one-shot clip on one arm (or both); events fire at the manifest's times. */
  play(side, name, { hold = null, hideItem = false } = {}) {
    const arm = this.arms[side];
    const a = arm.actions[name];
    if (!a) return false;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    this.switchTo(arm, a, 0.1);
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
    // a shield swings out of the sword's way, frame for frame with the swing
    const sh = this.equip.L;
    if (kind === 'onehand' && (sh === 'shield_round' || sh === 'shield_kite') && !this.busy('L') && !this.blocking)
      this.play('L', sh === 'shield_round' ? 'lsh_aside_3d' : 'lks_aside_3d');
    return kind;
  }

  /** The left hand's action (RMB): shields block while held; swords swing. */
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
  cast(spell, { charge = false } = {}) {
    if (this.busy('R') || this.busy('L') || this.blocking) return null;
    // a charged spell holds on the frame before it leaves the hand
    const hold = (clip) => {
      if (!charge) return null;
      const fire = this.manifest.events[clip]?.fire?.[0] ?? 0;
      return Math.max(0, ...this.manifest.frame_starts[clip].filter((t) => t < fire - 1e-3));
    };
    const both = () => {
      this.play('R', 'b2c_cast', { hideItem: true, hold: hold('b2c_cast') });
      this.play('L', 'b2c_cast', { hideItem: true, hold: hold('b2c_cast') });
      return 'both';
    };
    if (spell.hands === 2) return both();
    const side = !this.equip.L || (this.equip.R && ITEMS[this.equip.R].both) ? 'L' : (!this.equip.R ? 'R' : 'L');
    if (side === 'L' && this.equip.R && ITEMS[this.equip.R].both) return both(); // the two-hander: both hands come off it
    const clip = side === 'R' ? 'r1c_cast' : 'l1c_cast';
    this.play(side, clip, { hideItem: true, hold: hold(clip) });
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
      const roll = arm.item && ITEMS[this.equip[side]]?.roll;
      if (roll) {
        const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
        const on = st && st.name === roll.clip;
        const t = on ? st.action.time : 0, d = on ? st.duration : 1;
        arm.item.rotation.y = on ? roll.angle * ss(roll.in[0], roll.in[1], t) * (1 - ss(d - roll.out, d - 0.03, t)) : 0;
      }
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

  /** ambient: 0 (dark) .. 1 (daylight); torch: warm light from flames nearby, coming from
   * torchDir (in the view's own space, toward the flame); flash: a spell. */
  setLight(ambient, sun, torch, flash, flashColor, torchDir = null) {
    this.hemi.intensity = 0.03 + 1.0 * ambient;
    this.sun.intensity = 1.4 * sun;
    this.torch.intensity = Math.min(1.6, torch * 0.9);
    if (torchDir) this.torch.position.copy(torchDir).normalize();
    this.flash.intensity = flash;
    if (flashColor) this.flash.color.copy(flashColor);
  }
}
