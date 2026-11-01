// The first-person view: the gauntleted arms (templates/models/gauntlets) and the equipped
// items, in their own scene drawn over the world through the rigs' camera (90 degree
// horizontal FOV at 16:10, shrunk 0.58 toward the bottom centre). Every arm model shares one
// skeleton, so the moves (tools/templates/moves.py: carries, attacks, blocks, casts) come from
// one clip file per side, templates/models/arms/fp_moves_*.glb, with their times in
// fp_moves.json and the player's choice of attack in fp_picks.json (the move viewer,
// moves.html, writes it). Each arm is slid sideways on screen by how far its grip is from the
// centre (the catalog's `stretch`, wider still on wide screens), so the hands sit at the sides
// and leave the middle of the view open.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { refineTexture, crisp } from './engine.js';

const ROOT = 'templates/models/';
const _p = new THREE.Vector3();
// the greatsword turns a quarter in the hands as a swing lifts it, so it cuts with the edge
// (the carry shows the flat); it turns back as the blade comes home
const ROLL_2H = { angle: Math.PI / 2, in: 0.06, out: 0.22 };
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
  R: { onehand: 'sword_walk', twohand: 'great_walk', staff: 'staff_walk', null: 'hand_walk' },
  L: { onehand: 'sword_walk', shield_round: 'round_walk', shield_kite: 'kite_walk', null: 'hand_walk' },
};
const BLOCK = { shield_round: 'round_block', shield_kite: 'kite_block' };
const SHIELD = { shield_round: 'round', shield_kite: 'kite' };
// what each held kind attacks with: a slot in fp_moves.json, whose picked option is a chain
const SLOT_OF = { onehand: 'onehand', twohand: 'twohand', staff: 'staff' };
const CHAIN_FADE = 0.1;   // the blend from one blow of a combo into the next
const EVENTS = new Set(['hit', 'fire', 'whoosh']);   // the catalog's times that are told to the game

/** The move set: catalog + each side's clips (smoothed once), fetched on first use. */
let movesP = null;
export function loadMoves(loader = new GLTFLoader()) {
  movesP ||= (async () => {
    const get = (u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [cat, picks, gR, gL] = await Promise.all([get(ROOT + 'fp_moves.json'), get(ROOT + 'fp_picks.json'),
      loader.loadAsync(ROOT + 'arms/fp_moves_R.glb'), loader.loadAsync(ROOT + 'arms/fp_moves_L.glb')]);
    const clips = {};
    for (const [side, g] of [['R', gR], ['L', gL]]) {
      clips[side] = {};
      for (const c of g.animations) clips[side][c.name] = smoothClip(c, cat.clips[c.name]?.kind === 'walk');
    }
    return { cat, clips, picks: picks || {} };
  })();
  return movesP;
}

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
    this.aspect = 1.6;
    this.moves = null;        // {cat, clips, picks} (loadMoves)
    this.picks = {};          // slot -> option id (over fp_picks.json and the catalog's defaults)
  }

  /** The option picked for a slot ({id, name, chain}). */
  pick(slot) {
    const s = this.moves?.cat.slots[slot];
    if (!s) return null;
    const want = this.picks[slot] ?? this.moves.picks[slot] ?? s.default;
    return s.options.find((o) => o.id === want) || s.options.find((o) => o.id === s.default) || s.options[0];
  }

  /** Choose a slot's option (the move viewer); takes effect on the next blow. */
  setPick(slot, id) { this.picks[slot] = id; }

  clipInfo(name) { return this.moves?.cat.clips[name]; }

  on(fn) { this.listeners.push(fn); }
  emit(...a) { for (const f of this.listeners) f(...a); }

  resize(aspect) {
    this.aspect = aspect;
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
    if (!this.moves) {
      this.moves = await loadMoves(this.loader);
      // the moves' times, where the rest of the game looks for clip times
      for (const [name, c] of Object.entries(this.moves.cat.clips)) {
        this.manifest.events[name] = c.events;
        this.manifest.frame_starts[name] = c.starts;
      }
    }
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
      for (const [name, clip] of Object.entries(this.moves.clips[side])) actions[name] = mixer.clipAction(clip);
      g.scene.matrixAutoUpdate = false;   // (its matrix is the sideways slide: slide())
      this.arms[side] = { scene: g.scene, mixer, actions, socket: g.scene.getObjectByName('item'),
        hand: g.scene.getObjectByName('hand'), item: null, walk: null, current: null, roll: 0 };
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
    if (!item && m.userData?.height) return this.flesh(m);
    const out = new THREE.MeshPhongMaterial({ map: m.map, side: THREE.DoubleSide,
      specular: item ? 0x6a625a : 0x1c1a18, shininess: item ? 48 : 16 });
    if (m.map && this.lib?.normals) out.normalMap = this.lib.normalFrom(m.map, item ? 1.0 : 1.3);
    return crisp(out);
  }

  /** Bare skin (the bare arms, tools/models/hands/build_hands.py): its bumps from its own height map
   * (carried in the occlusion slot), never from its colour; a soft sheen that its shine map (in the
   * metal/rough slot) raises on the knuckles, fingertips and nails and lowers on the palm; and light
   * that wraps a little past the shadow's edge, warmer just there, as it does through skin. */
  flesh(m) {
    const out = new THREE.MeshPhongMaterial({ map: m.map, side: THREE.DoubleSide, specular: 0x2a231e, shininess: 24 });
    if (m.aoMap && this.lib?.normals) out.normalMap = this.lib.normalFrom(m.aoMap, 0.9);
    const shine = m.metalnessMap || m.roughnessMap;
    if (shine) out.specularMap = shine;
    out.onBeforeCompile = (sh) => {
      // (and the sky's and the ground's light on it mostly greyed: the world's warm fill made skin clay)
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_phong_pars_fragment>', THREE.ShaderChunk.lights_phong_pars_fragment.replace(
        'vec3 irradiance = dotNL * directLight.color;\n\treflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
        'vec3 irradiance = dotNL * directLight.color;\n\tfloat nlw = dot( geometryNormal, directLight.direction );\n\tvec3 tint = mix( vec3( 1.0, 0.88, 0.82 ), vec3( 1.0 ), smoothstep( -0.05, 0.2, nlw ) );\n\treflectedLight.directDiffuse += saturate( ( nlw + 0.25 ) / 1.25 ) * tint * directLight.color * BRDF_Lambert( material.diffuseColor );').replace(
        'reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
        'reflectedLight.indirectDiffuse += mix( irradiance, vec3( dot( irradiance, vec3( 0.299, 0.587, 0.114 ) ) ), 0.65 ) * BRDF_Lambert( material.diffuseColor );'))
        // (in dim light skin goes grey, not chocolate: what's lit faintly is a quarter greyed)
        .replace('#include <opaque_fragment>', 'outgoingLight = mix( outgoingLight, vec3( dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) ) ), 0.25 * ( 1.0 - smoothstep( 0.08, 0.3, dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) ) ) ) );\n#include <opaque_fragment>');
    };
    out.customProgramCacheKey = () => 'bm-flesh';
    return crisp(out);
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
    if (this.twoHanded()) return 'great_walk';
    return WALK[side][this.equip[side] ?? 'null'];
  }

  twoHanded() { return !!(this.equip.R && ITEMS[this.equip.R]?.both); }

  /** Switch an arm to action `a`, cross-fading from whatever it was playing so the weights
   * always sum to one (fading in from nothing would let the bind pose show through). */
  switchTo(arm, a, fade, freeze = false) {
    const prev = arm.current;
    for (const other of Object.values(arm.actions)) if (other !== a && other !== prev) other.stop();
    // (a blow cut short for the next one holds where it was cut, rather than playing on into
    // its recovery underneath the blend)
    if (freeze && prev && prev !== a) prev.setEffectiveTimeScale(0);
    a.reset();
    a.setEffectiveTimeScale(1);
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

  /** Play a one-shot clip on one arm; events fire at the catalog's times. `from` starts it
   * part-way (a combo's next blow enters at its wind-up); a `quiet` arm fires no events (the
   * left hand on a two-handed grip: the right one speaks for both). */
  play(side, name, { hold = null, hideItem = false, from = 0, fade = 0.1, quiet = false, freeze = false } = {}) {
    const arm = this.arms[side];
    const a = arm.actions[name];
    if (!a) return false;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    this.switchTo(arm, a, fade, freeze);
    a.time = from;
    if (arm.item) arm.item.visible = !hideItem;
    const ev = this.manifest.events[name] || {};
    this.state[side] = { name, action: a, last: from - 1e-6, events: quiet ? {} : ev, duration: ev.duration ?? a.getClip().duration,
      hold, info: this.hitInfo(side, name) };
    return true;
  }

  /** What a blow carries for the game: heavy or not, which way the edge sweeps (x right, y up). */
  hitInfo(side, name) {
    const c = this.clipInfo(name);
    if (!c || c.kind !== 'attack') return null;
    const e = c.events.edge || [0.8, 0.6];
    return { attack: true, heavy: !!c.heavy, power: c.power ?? 1, edge: [side === 'L' ? -e[0] : e[0], e[1]] };
  }

  busy(side) { return !!this.state[side]; }

  /** Attack with the right hand (LMB). Returns what happened, for the caller ('queued' when
   * the next blow of a combo will follow the one under way). */
  attackRight() { return this.attack('R'); }

  attack(side) {
    const kind = this.equip[side];
    if (!kind) return 'spell';
    const st = this.state[side];
    if (st && !/_aside_/.test(st.name)) {   // (stepping aside for the other hand: cut it short)
      // a blow under way: the next in its combo follows once this one's follow-through is done
      // (asked for any time before its recovery is well along)
      if (st.chain && !st.queued && st.action.time < (st.events.link ?? st.duration) + 0.15) { st.queued = true; return 'queued'; }
      return null;
    }
    const both = ITEMS[kind]?.both;
    if (both && this.busy('L') && !/_aside_/.test(this.state.L.name)) return null;
    const list = this.pick(SLOT_OF[kind])?.chain;
    if (!list) return null;
    this.strike(side, list, 0, 0, 0.1);
    return kind;
  }

  /** Blow `index` of a combo (wrapping round), entering it at time `from`. */
  strike(side, list, index, from, fade) {
    const name = list[index % list.length];
    const kind = this.equip[side];
    const freeze = index > 0;   // (chained: the blow before holds where it was cut)
    if (!this.play(side, name, { from, fade, freeze })) return;
    if (this.clipInfo(name)?.kind === 'attack') this.state[side].chain = { list, index };
    if (ITEMS[kind]?.both) this.play('L', name, { from, fade, quiet: true, freeze });
    // a shield swings out of the sword's way, frame for frame with the blow
    const sh = this.equip.L;
    if (side === 'R' && kind === 'onehand' && SHIELD[sh] && !this.blocking && (!this.state.L || /_aside_/.test(this.state.L.name)))
      this.play('L', `${SHIELD[sh]}_aside_${name.split('_')[1]}`, { from, fade, freeze });
    // and a sword in the other hand makes room for this one
    const other = side === 'R' ? 'L' : 'R';
    if (kind === 'onehand' && this.equip[other] === 'onehand' && (!this.state[other] || /_aside_/.test(this.state[other].name)))
      this.play(other, `sword_aside_${name.split('_')[1]}`, { from, fade, freeze });
  }

  /** The left hand's action (RMB): shields block while held; swords swing. */
  actLeft(held) {
    const kind = this.equip.L;
    if (this.equip.R && ITEMS[this.equip.R].both) return null;
    if (BLOCK[kind]) {
      if (held && !this.blocking && (!this.busy('L') || /_aside_/.test(this.state.L.name))) {
        this.blocking = true;
        const name = BLOCK[kind];
        const t3 = this.manifest.events[name]?.hold ?? this.manifest.frame_starts[name][3];
        this.play('L', name, { hold: t3 });
        if (this.equip.R === 'onehand' && !this.busy('R')) this.play('R', 'sword_guard', { hold: t3 });
      }
      if (!held && this.blocking) { // let go: play on from the hold to the end
        this.blocking = false;
        for (const s of ['L', 'R']) if (this.state[s]) this.state[s].hold = null;
      }
      return this.blocking ? 'block' : null;
    }
    if (!held) return null;
    if (!kind) return this.busy('L') ? null : 'spell';
    return this.attack('L');
  }

  /** Cast a spell with free hands: one-hand spells use the left hand if it's free, else the
   * right, else the left lowers what it holds; two-hand spells lower both. */
  cast(spell, { charge = false } = {}) {
    if (this.busy('R') || this.busy('L') || this.blocking) return null;
    // a charged spell holds on its CHARGE frame (or the frame before it leaves the hand)
    const hold = (clip) => {
      if (!charge) return null;
      if (this.manifest.events[clip]?.hold != null) return this.manifest.events[clip].hold;
      const fire = this.manifest.events[clip]?.fire?.[0] ?? 0;
      return Math.max(0, ...this.manifest.frame_starts[clip].filter((t) => t < fire - 1e-3));
    };
    const both = () => {
      this.play('R', 'both_cast', { hideItem: true, hold: hold('both_cast') });
      this.play('L', 'both_cast', { hideItem: true, hold: hold('both_cast') });
      return 'both';
    };
    if (spell.hands === 2) return both();
    const side = !this.equip.L || (this.equip.R && ITEMS[this.equip.R].both) ? 'L' : (!this.equip.R ? 'R' : 'L');
    if (side === 'L' && this.equip.R && ITEMS[this.equip.R].both) return both(); // the two-hander: both hands come off it
    const clip = this.pick('spell')?.chain[0] || 'hand_thrust';
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
      let st = this.state[side];
      // a combo: the next blow takes over once this one's follow-through is done
      if (st?.queued && st.action.time >= (st.events.link ?? st.duration)) {
        const { list, index } = st.chain;
        const next = list[(index + 1) % list.length];
        this.strike(side, list, index + 1, this.manifest.events[next]?.enter ?? 0, CHAIN_FADE);
        st = this.state[side];
      }
      const roll = arm.item && ITEMS[this.equip[side]]?.roll;
      if (roll) {   // eased, so a combo entering mid-swing turns the blade rather than snapping it
        const on = st && this.clipInfo(st.name)?.roll && st.action.time > roll.in && st.action.time < st.duration - roll.out;
        arm.roll += ((on ? 1 : 0) - arm.roll) * Math.min(1, dt * 14);
        arm.item.rotation.y = roll.angle * arm.roll * arm.roll * (3 - 2 * arm.roll);
      }
      if (st) {
        const a = st.action;
        if (st.hold != null && a.time >= st.hold) { a.time = st.hold; a.paused = true; }
        else a.paused = false;
        if (!a.paused && a.time >= st.duration - 1e-4) {
          this.state[side] = null;
          this.playWalk(side);
        }
      } else if (arm.walk) {
        arm.walk.timeScale = 0.25 + Math.min(1.3, speed / 6.2);
      }
      arm.mixer.update(dt);
      // events once the pose has moved on to them, so a hit fires on the frame that shows it
      st = this.state[side];
      if (st) {
        const t = st.action.time;
        for (const [kind, times] of Object.entries(st.events)) {
          if (!EVENTS.has(kind)) continue;
          for (const et of times) if (st.last < et - 1e-5 && t >= et - 1e-5) this.emit(kind, side, st.name, st.info);   // (time sums drift)
        }
        st.last = t;
      }
    }
    this.slide();
  }

  /** Slide each arm sideways on screen (a shear: every depth moves the same distance on screen,
   * so nothing bends) by how far its grip is from the centre, so the hands ride wide. Two hands
   * on one grip slide together. */
  slide() {
    const fx = this.camera.projectionMatrix.elements[0];
    const f = Math.min(2.2, Math.max(0.8, (this.moves?.cat.stretch ?? 1) * this.aspect / 1.6));
    const shift = {};
    for (const side of ['R', 'L']) {
      const arm = this.arms[side];
      if (!arm) continue;
      arm.scene.matrix.identity();
      arm.scene.updateMatrixWorld(true);
      const p = arm.socket.getWorldPosition(_p);
      shift[side] = p.z < -0.01 ? (fx * p.x / -p.z) * (f - 1) : 0;
    }
    if (this.twoHanded() && shift.R !== undefined) shift.L = shift.R;
    for (const side of ['R', 'L']) {
      const arm = this.arms[side];
      if (!arm) continue;
      const k = shift[side] / fx;   // x' = x - k z: on screen, + fx k
      arm.scene.matrix.set(1, 0, -k, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
      arm.scene.updateMatrixWorld(true);
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
