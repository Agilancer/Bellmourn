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
import { WEBGPU, T } from './nodes.js';

const ROOT = 'templates/models/';
const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _d = new THREE.Vector3(), _h = new THREE.Vector3();
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
// Where a fist really closes, per arm model, in its 'item' socket's own frame (metres; the
// rig's grip line is the socket's y axis). The gauntlets' fingers wrap the rig's grip line; the
// bare (SDF) hands' fingers are fuller and close a little off it, so the handle would run
// through the curled fingertips. Their items are seated in the fist's own hole (measured on
// the bare arms with tools/grip_shots.js), and on a two-hander the support arm is moved onto
// the handle (slide()).
// A model's entry may be given per held kind ({kind: {R, L}}), else for anything it holds. The
// bare fist's hole is 4 mm toward the palm and 6 mm out (BARE_HOLE); a sword's grip sits 10 mm
// nearer the fingertips than that, so the fingers read wrapped round it. The glove gauntlets
// hold a sword 8 mm out toward their fingertips for the same reason. The plated gauntlets'
// finger lames reach a little past the rig's grip, into a sword's guard: they hold it 8 mm
// further down the grip.
const BARE_HOLE = { R: [0.004, 0, 0.006], L: [-0.004, 0, 0.006] };
const OUT = { R: [-0.012, 0.004, 0], L: [0.012, 0.004, 0] };
const GLOVE_STAFF = { R: [-0.006, 0, 0], L: [0.006, 0, 0] };
const LOWER = { R: [0, 0.008, 0], L: [0, 0.008, 0] };
const GRIP_SEAT = {
  bare: { R: [-0.006, 0, 0.006], L: [0.006, 0, 0.006], staff: BARE_HOLE, shield_round: BARE_HOLE, shield_kite: BARE_HOLE },
  brawler: { onehand: OUT, twohand: OUT, staff: GLOVE_STAFF }, hunter: { onehand: OUT, twohand: OUT, staff: GLOVE_STAFF },
  runebound: { onehand: OUT, twohand: OUT, staff: GLOVE_STAFF },
  knight: LOWER, templar: LOWER, wayfarer: LOWER, drake: LOWER, fiend: LOWER, boneward: LOWER, mailed: LOWER };
// and per held kind, for every arm model (added to the above): a staff's thick shaft sits out
// under the curled fingers rather than back against the heel of the hand
const ITEM_SEAT = { staff: { R: [-0.020, 0, 0], L: [0.020, 0, 0] } };
// The rig's fist closes the bare fingers solid (no tunnel for a handle), so while a bare hand
// holds something each finger opens about its own curl axis by these angles (degrees, at the
// knuckle, middle and end joints; negative closes), so a handle runs through the fist with the
// fingertips tucked round it. The glove-like gauntlets tuck their fingertips round a handle a
// little more; shields' thin bars, every other pose and the plated gauntlets are left as keyed.
const TUCK = { onehand: [0, -2, -12], twohand: [0, -2, -12], staff: [0, -2, -10] };
const GRIP_OPEN = { bare: { default: [8, 6, 4], onehand: [8, 0, -14], twohand: [8, 0, -14], staff: [6, 2, -6] },
  brawler: TUCK, hunter: TUCK, runebound: TUCK };
const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion();

function restoreGrip(arm) {
  for (const [b, p, q] of arm.saved) { b.position.copy(p); b.quaternion.copy(q); }
}

function openGrip(arm, deg) {
  arm.saved ||= FINGERS.flatMap((f) => arm.fingers[f].filter(Boolean)).map((b) => [b, new THREE.Vector3(), new THREE.Quaternion()]);
  for (const [b, p, q] of arm.saved) { p.copy(b.position); q.copy(b.quaternion); }
  for (const f of FINGERS) {
    const b = arm.fingers[f];
    if (!b[2]) continue;
    _s1.subVectors(b[1].position, b[0].position); _s2.subVectors(b[2].position, b[1].position);
    _n.crossVectors(_s1, _s2);   // (turning the first segment about this curls it further)
    if (_n.lengthSq() < 1e-12) continue;
    _n.normalize();
    const seg = [_s1.clone(), _s2.clone()];
    let a = 0;
    for (let k = 0; k < 3; k++) {   // each segment turns by every opening up to it, about its own joint
      a -= deg[k] * Math.PI / 180;
      _q.setFromAxisAngle(_n, a);
      b[k].quaternion.premultiply(_q);
      if (k < 2) b[k + 1].position.copy(b[k].position).add(seg[k].applyQuaternion(_q));
    }
  }
}
const BLOCK = { shield_round: 'round_block', shield_kite: 'kite_block' };
const SHIELD = { shield_round: 'round', shield_kite: 'kite' };
// what each held kind attacks with: a slot in fp_moves.json, whose picked option is a chain
const SLOT_OF = { onehand: 'onehand', twohand: 'twohand', staff: 'staff' };
const CHAIN_FADE = 0.1;   // the blend from one blow of a combo into the next
// Melee pace (the user's call): every blow wants its own click and plays a little slower (PACE);
// between the blows of a one-hander's combo the next waits cocked at its wind-up for COCK_WAIT
// seconds (a click lets it go), then eases back to the carry; after a one-hander's last blow, and
// after every two-handed blow, the weapon rests (back to the carry) before the next, two-handers
// taking turns about their blows.
const PACE = { onehand: 0.85, twohand: 0.75 };
const COCK_WAIT = 1.0, COCK_FADE = 0.22;
// a cocked blow not asked for unwinds: its clip plays backward (at this speed) from the wind-up to
// its start, the way it came, so the blade stays on screen, then the carry takes over
const UNWIND = 0.35;
// a click this close to the end of a rest (seconds) is kept, and the blow goes as the carry's reached
const BUFFER = 0.4;
// a cocked blow held where its wind-up would be hard to see (low in the corner) is brought in and
// up while it waits ([in toward the middle, up], metres in the view)
const COCK_LIFT = { sword_rise: [0.04, 0.06] };
// The shove's ghost (the user's call): a see-through copy of the shield leaps out of it, swells
// GHOST_GROW times larger and flies GHOST_FLY metres on toward the crosshair over GHOST_TIME
// seconds, fading as it goes.
const GHOST_TIME = 0.32, GHOST_FLY = 0.25, GHOST_GROW = 2.2, GHOST_ALPHA = 0.9;
const GHOST_MAX = 1.4;   // (no taller than this, swollen: a kite's ghost grows less than a buckler's)
// (lit at its rims, faint across its face: a ghost, not a white plate)
const GHOST_VERT = `varying vec3 vN; varying vec3 vV;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const GHOST_FRAG = `uniform vec3 color; uniform float alpha; varying vec3 vN; varying vec3 vV;
void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(color * (0.10 + 1.3 * f), alpha); }`;

/** The ghost's see-through, rim-lit material ({m, alpha(a)}): a node material under WebGPU, the
 * same thing in GLSL under WebGL. */
function ghostMaterial() {
  const color = new THREE.Color(0xb8dcff);
  if (WEBGPU) {
    const { Fn, uniform, normalView, positionView, normalize, abs, dot, pow, vec4 } = T;
    const uA = uniform(GHOST_ALPHA), uC = uniform(color);
    const m = new THREE.NodeMaterial();
    m.fragmentNode = Fn(() => {
      const f = pow(abs(dot(normalize(normalView), normalize(positionView.negate()))).oneMinus(), 2.0);
      return vec4(uC.mul(f.mul(1.3).add(0.10)), uA);
    })();
    Object.assign(m, { transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    return { m, alpha: (a) => { uA.value = a; } };
  }
  const m = new THREE.ShaderMaterial({ uniforms: { color: { value: color }, alpha: { value: GHOST_ALPHA } },
    vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  return { m, alpha: (a) => { m.uniforms.alpha.value = a; } };
}
const EVENTS = new Set(['hit', 'fire', 'whoosh']);   // the catalog's times that are told to the game

/** (WebGPU) The bare arms' skin as a node material of its own kind: Phong, but the sun's (and the
 * torch's) light wraps a little past the shadow's edge, warmer just there; the sky's and the ground's
 * mostly greyed; and in dim light the skin goes grey, not chocolate (what's lit faintly a quarter
 * greyed, before any fog). The GLSL patch in flesh() does the same to lights_phong_pars_fragment. */
let Flesh = null;
function fleshKind() {
  if (Flesh) return Flesh;
  const { vec3, dot, mix, smoothstep, normalView, positionViewDirection, specularColor, shininess, diffuseColor, materialSpecularStrength,
    BRDF_Lambert, F_Schlick } = T;
  const LUMA = vec3(0.299, 0.587, 0.114);
  class FleshLighting extends THREE.PhongLightingModel {
    direct({ lightDirection, lightColor, reflectedLight }) {
      const nlw = normalView.dot(lightDirection);
      const tint = mix(vec3(1.0, 0.88, 0.82), vec3(1.0), smoothstep(-0.05, 0.2, nlw));
      reflectedLight.directDiffuse.addAssign(nlw.add(0.25).div(1.25).clamp().mul(tint).mul(lightColor).mul(BRDF_Lambert({ diffuseColor: diffuseColor.rgb })));
      // (the sheen as Phong's: BRDF_BlinnPhong times the shine map)
      const irradiance = nlw.clamp().mul(lightColor);
      const half = lightDirection.add(positionViewDirection).normalize();
      const dotNH = normalView.dot(half).clamp(), dotVH = positionViewDirection.dot(half).clamp();
      const F = F_Schlick({ f0: specularColor, f90: 1.0, dotVH });
      const D = shininess.mul(0.5).add(1.0).mul(1 / Math.PI).mul(dotNH.pow(shininess));
      reflectedLight.directSpecular.addAssign(irradiance.mul(F.mul(0.25).mul(D)).mul(materialSpecularStrength));
    }
    indirect(builder) {
      const { ambientOcclusion, irradiance, reflectedLight } = builder.context;
      reflectedLight.indirectDiffuse.addAssign(mix(irradiance, vec3(dot(irradiance, LUMA)), 0.65).mul(BRDF_Lambert({ diffuseColor: diffuseColor.rgb })));
      reflectedLight.indirectDiffuse.mulAssign(ambientOcclusion);
    }
  }
  Flesh = class FleshMaterial extends THREE.MeshPhongNodeMaterial {
    static get type() { return 'FleshMaterial'; }
    setupLightingModel() { return new FleshLighting(); }
    setupLighting(builder) {
      const out = super.setupLighting(builder);
      const l = dot(out, LUMA);
      return mix(out, vec3(l), smoothstep(0.08, 0.3, l).oneMinus().mul(0.25));
    }
  };
  return Flesh;
}

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
    this.grip = { seat: GRIP_SEAT, item: ITEM_SEAT, open: GRIP_OPEN };   // (per arm model; tunable from the move viewer)
    this.turn = {};   // (side -> the two-hander's next blow)
    this.buffered = {};   // (side -> a click kept from the end of a rest)
    this.ghosts = [];   // (the shove's ghost shields in flight)
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    // (WebGPU's depth runs 0..1, not WebGL's -1..1: three sets the camera's coordinate system and asks
    // for its projection again, which is the rigs' own: resize)
    this.camera.updateProjectionMatrix = () => this.resize(this.aspect ?? 1.6);
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
      ...(this.camera.coordinateSystem === THREE.WebGPUCoordinateSystem
        ? [0, 0, -far / (far - near), -far * near / (far - near)]
        : [0, 0, -(far + near) / (far - near), -2 * far * near / (far - near)]),
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
        hand: g.scene.getObjectByName('hand'), item: null, walk: null, current: null, roll: 0,
        fingers: Object.fromEntries(FINGERS.map((f) => [f, [1, 2, 3].map((k) => g.scene.getObjectByName(f + k))])) };
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
    const out = new (WEBGPU ? fleshKind() : THREE.MeshPhongMaterial)({ map: m.map, side: THREE.DoubleSide, specular: 0x2a231e, shininess: 24 });
    if (m.aoMap && this.lib?.normals) out.normalMap = this.lib.normalFrom(m.aoMap, 0.9);
    const shine = m.metalnessMap || m.roughnessMap;
    if (shine) out.specularMap = shine;
    if (WEBGPU) return crisp(out);   // (its light is its kind's own: fleshKind)
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
        const m = this.grip.seat[this.gauntlet], a = m?.[kind]?.[side] ?? m?.[side], b = this.grip.item[kind]?.[side];
        if (a || b) arm.item.position.set(0, 0, 0).add(_p.fromArray(a || [0, 0, 0])).add(_a.fromArray(b || [0, 0, 0]));
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

  /** What this hand is closed on, if anything shown: its own item's kind, or the two-hander's
   * (the support hand). */
  gripping(side) {
    if (this.arms[side]?.item?.visible) return this.equip[side];
    return side === 'L' && this.twoHanded() && this.arms.R?.item?.visible ? this.equip.R : null;
  }

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

  playWalk(side, snap = false, fade = 0.14) {
    const arm = this.arms[side];
    const a = arm.actions[this.walkClip(side)];
    if (!a) return;
    a.setLoop(THREE.LoopRepeat, Infinity);
    this.switchTo(arm, a, snap ? 0 : fade);
    arm.walk = a;
    if (arm.item) arm.item.visible = true;
  }

  /** Play a one-shot clip on one arm; events fire at the catalog's times. `from` starts it
   * part-way (a combo's next blow enters at its wind-up); a `quiet` arm fires no events (the
   * left hand on a two-handed grip: the right one speaks for both). */
  play(side, name, { hold = null, hideItem = false, from = 0, fade = 0.1, quiet = false, freeze = false, speed = 1 } = {}) {
    const arm = this.arms[side];
    const a = arm.actions[name];
    if (!a) return false;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    this.switchTo(arm, a, fade, freeze);
    a.timeScale = speed;
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
    return { attack: true, heavy: !!c.heavy, stab: !!c.stab, power: c.power ?? 1, edge: [side === 'L' ? -e[0] : e[0], e[1]] };
  }

  busy(side) { return !!this.state[side]; }

  /** Attack with the right hand (LMB). Returns what happened, for the caller ('queued' when
   * the next blow of a combo will follow the one under way). */
  attackRight() { return this.attack('R'); }

  attack(side) {
    const kind = this.equip[side];
    if (!kind) return 'spell';
    let st = this.state[side];
    if (st?.unwind) { this.state[side] = null; st = null; }   // (winding back down: a click starts afresh)
    if (st && !/_aside_/.test(st.name)) {   // (stepping aside for the other hand: cut it short)
      if (st.cocked) { this.loose(side); return 'loosed'; }   // the cocked blow goes
      // a blow under way: a click asks for the next in its combo, which follows once this one's
      // follow-through is done (asked for any time before its recovery is well along); a weapon
      // that rests after this blow takes no more until it has
      if (st.chain && !st.queued && !this.rests(side, st) && st.action.time < (st.events.link ?? st.duration) + 0.15) { st.queued = true; return 'queued'; }
      // near the end of a rest: kept, and it goes as soon as the weapon is back at the carry
      if (st.chain && this.rests(side, st) && (st.duration - st.action.time) / (st.action.timeScale || 1) <= BUFFER) { this.buffered[side] = true; return 'buffered'; }
      return null;
    }
    const both = ITEMS[kind]?.both;
    if (both && this.busy('L') && !/_aside_/.test(this.state.L.name)) return null;
    const list = this.pick(SLOT_OF[kind])?.chain;
    if (!list) return null;
    const index = both ? (this.turn[side] ?? 0) : 0;   // (two-handers take turns about their blows)
    this.strike(side, list, index, 0, 0.1);
    if (both) this.turn[side] = index + 1;
    return kind;
  }

  /** Whether the weapon rests after this blow (back to the carry) rather than cocking the next. */
  rests(side, st) {
    if (!st.chain || ITEMS[this.equip[side]]?.both) return true;
    const { list, index } = st.chain;
    return index % list.length === list.length - 1;
  }

  /** A cocked blow goes: it plays on from its wind-up, and the other hand's step-aside with it. */
  loose(side) {
    for (const s of ['R', 'L']) {
      const o = this.state[s];
      if (o && (s === side || /_aside_/.test(o.name))) { o.hold = null; o.cocked = false; }
    }
  }

  /** A cocked blow not asked for: the weapon (and the other hand's step-aside) unwinds the way it
   * came, back to the start of its clip, then to the carry; `now`, straight to the carry. */
  relax(side, now = false) {
    for (const s of ['R', 'L']) {
      const o = this.state[s];
      if (!o || !(s === side || (/_aside_/.test(o.name) && o.hold != null))) continue;
      if (now) { this.state[s] = null; this.playWalk(s); continue; }
      o.hold = null; o.cocked = false; o.unwind = true;
      o.action.paused = false; o.action.timeScale = -UNWIND;
    }
  }

  /** With the shield up the sword hand only stabs, round the shield's edge (LMB). */
  stab() {
    if (!this.blocking || this.equip.R !== 'onehand') return null;
    const st = this.state.R;
    if (st && st.name !== 'sword_guard') return null;
    this.play('R', 'sword_stab', { fade: 0.06, speed: PACE.onehand });
    return 'stab';
  }

  /** The shove made visible: a see-through ghost of the held shield leaps out of it, swelling
   * and flying on ahead as it fades (the push's wave; a bigger shield throws a bigger one). */
  shoveGhost() {
    const it = this.arms.L?.item;
    if (!it || !SHIELD[this.equip.L]) return;
    it.updateMatrixWorld(true);
    const g = it.clone(true);   // (sharing the shield's geometry)
    const { m: mat, alpha } = ghostMaterial();
    g.traverse((o) => { if (o.isMesh) { o.material = mat; o.renderOrder = 10; } });
    it.matrixWorld.decompose(g.position, g.quaternion, g.scale);
    g.matrixAutoUpdate = true;
    this.scene.add(g);
    const from = g.position.clone();
    const dir = new THREE.Vector3(0, -0.04, -1.3).sub(from).normalize();   // (on toward the crosshair)
    const grow = Math.min(GHOST_GROW, GHOST_MAX / Math.max(0.2, this.shieldSize()?.h || 0.5)) - 1;
    this.ghosts.push({ g, mat, alpha, t: 0, from, dir, grow, s0: g.scale.clone() });
  }

  /** The held shield's size in metres ({w, h}: across its face and along its grip), from its
   * own model (the shove's reach and width go by it). */
  shieldSize() {
    const it = this.arms.L?.item;
    if (!it || !SHIELD[this.equip.L]) return null;
    if (!it.userData.size) {
      it.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(it.matrixWorld).invert(), m = new THREE.Matrix4();
      const b = new THREE.Box3(), mb = new THREE.Box3();
      it.traverse((o) => {
        if (!o.isMesh) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        b.union(mb.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)));
      });
      const sz = b.getSize(new THREE.Vector3());
      it.userData.size = { w: sz.x, h: sz.y };
    }
    return it.userData.size;
  }

  /** Blow `index` of a combo (wrapping round), entering it at time `from`. */
  strike(side, list, index, from, fade) {
    const name = list[index % list.length];
    const kind = this.equip[side];
    const freeze = index > 0;   // (chained: the blow before holds where it was cut)
    const speed = this.clipInfo(name)?.kind === 'attack' ? PACE[kind] ?? 1 : 1;
    if (!this.play(side, name, { from, fade, freeze, speed })) return;
    if (this.clipInfo(name)?.kind === 'attack') this.state[side].chain = { list, index };
    if (ITEMS[kind]?.both) this.play('L', name, { from, fade, quiet: true, freeze, speed });
    // a shield swings out of the sword's way, frame for frame with the blow
    const sh = this.equip.L;
    if (side === 'R' && kind === 'onehand' && SHIELD[sh] && !this.blocking && (!this.state.L || /_aside_/.test(this.state.L.name)))
      this.play('L', `${SHIELD[sh]}_aside_${name.split('_')[1]}`, { from, fade, freeze, speed });
    // and a sword in the other hand makes room for this one
    const other = side === 'R' ? 'L' : 'R';
    if (kind === 'onehand' && this.equip[other] === 'onehand' && (!this.state[other] || /_aside_/.test(this.state[other].name)))
      this.play(other, `sword_aside_${name.split('_')[1]}`, { from, fade, freeze, speed });
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
        if (this.state.R?.cocked) this.relax('R', true);   // (a cocked blow gives way to the shield)
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
      const clip = this.pick('twospell')?.chain[0] || 'both_cast';
      this.play('R', clip, { hideItem: true, hold: hold(clip) });
      this.play('L', clip, { hideItem: true, hold: hold(clip) });
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
      arm.item.localToWorld(p);   // (the item, not the socket: it may be seated off the socket)
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
      } else if (st?.chain && !st.queued && !st.cocked && st.hold == null && !this.rests(side, st)
        && st.action.time >= (st.events.link ?? st.duration)) {
        // no click yet: the next blow waits, cocked at its wind-up, for a moment
        const { list, index } = st.chain;
        const next = list[(index + 1) % list.length], enter = this.manifest.events[next]?.enter ?? 0;
        this.strike(side, list, index + 1, enter, COCK_FADE);
        st = this.state[side];
        st.hold = enter; st.cocked = true;
        for (const s of ['R', 'L']) { const o = this.state[s]; if (s !== side && o && /_aside_/.test(o.name)) o.hold = enter; }
      }
      const roll = arm.item && ITEMS[this.equip[side]]?.roll;
      if (roll) {   // eased, so a combo entering mid-swing turns the blade rather than snapping it
        const on = st && this.clipInfo(st.name)?.roll && st.action.time > roll.in && st.action.time < st.duration - roll.out;
        arm.roll += ((on ? 1 : 0) - arm.roll) * Math.min(1, dt * 14);
        arm.item.rotation.y = roll.angle * arm.roll * arm.roll * (3 - 2 * arm.roll);
      }
      if (st) {
        const a = st.action;
        if (st.hold != null && a.time >= st.hold) { a.time = st.hold; a.paused = true; st.heldFor = (st.heldFor || 0) + dt; }
        else { a.paused = false; st.heldFor = 0; }
        if (st.cocked && st.heldFor > COCK_WAIT) this.relax(side);
        else if (st.unwind && a.time <= 1e-3) { this.state[side] = null; this.playWalk(side, false, 0.18); }   // (unwound)
        else if (!st.unwind && !a.paused && a.time >= st.duration - 1e-4) {
          this.state[side] = null;
          const t3 = this.manifest.events[BLOCK[this.equip.L]]?.hold;
          if (st.name === 'sword_stab' && this.blocking && t3 != null) this.play('R', 'sword_guard', { from: t3, hold: t3, fade: 0.1 });   // (back behind the shield)
          else this.playWalk(side);
          if (this.buffered[side]) { this.buffered[side] = false; if (st.chain) (this.kept ||= []).push(side); }   // (the kept click: below, once both hands are done)
        }
      } else if (arm.walk) {
        arm.walk.timeScale = 0.25 + Math.min(1.3, speed / 6.2);
      }
      // (the mixer only writes a bone whose value changed, so a grip opened last frame is put
      // back first, or it would keep opening while a pose holds)
      if (arm.opened) { restoreGrip(arm); arm.opened = false; }
      arm.mixer.update(dt);
      const open = this.grip.open[this.gauntlet], held = this.gripping(side);
      const deg = held && (Array.isArray(open) ? open : open?.[held] || open?.default);
      if (deg) { openGrip(arm, deg); arm.opened = true; }
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
    for (const s of this.kept?.splice(0) || []) this.attack(s);
    for (let i = this.ghosts.length - 1; i >= 0; i--) {   // the shove's ghosts: out, larger, fading
      const gh = this.ghosts[i];
      gh.t += dt;
      const k = Math.min(1, gh.t / GHOST_TIME), e = 1 - (1 - k) ** 3;
      gh.g.position.copy(gh.from).addScaledVector(gh.dir, GHOST_FLY * e);
      gh.g.scale.copy(gh.s0).multiplyScalar(1 + gh.grow * e);
      gh.alpha(GHOST_ALPHA * (k < 0.1 ? 1 : ((1 - k) / 0.9) ** 2.2));   // (full a tic, then gone quickly: the staggered foe shows through)
      if (k >= 1) { this.scene.remove(gh.g); gh.mat.dispose(); this.ghosts.splice(i, 1); }
    }
    this.slide(dt);
  }

  /** Slide each arm sideways on screen (a shear: every depth moves the same distance on screen,
   * so nothing bends) by how far its grip is from the centre, so the hands ride wide. Two hands
   * on one grip slide together. */
  slide(dt = 1 / 60) {
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
      // a charge held on its frame trembles, a pixel or two at first and more the longer it is
      // held, so the clenched fist reads as power building rather than a frozen frame
      const st = this.state[side];
      let tx = 0, ty = 0;
      if (st?.heldFor > 0 && this.clipInfo(st.name)?.kind === 'cast') {
        const t = st.heldFor, amp = 0.0003 + 0.0004 * Math.min(1, t / 1.5), ph = side === 'L' ? 1.7 : 0;
        tx = amp * Math.sin(t * 47 + ph);
        ty = amp * (Math.sin(t * 61 + ph * 0.6) + 0.8 * Math.max(0, Math.sin(t * 9)) ** 4);
      }
      // a cocked blow breathes while it waits, lifted into view if its wind-up sits low, and
      // sags in its last moment before it eases back (the lift itself eases in and out)
      const cocked = st?.cocked && st.heldFor > 0, want = (cocked || st?.unwind) && COCK_LIFT[st.name];
      const k10 = Math.min(1, dt * 10), sx = side === 'L' ? 1 : -1;   // (in toward the middle)
      arm.liftX = (arm.liftX || 0) + ((want ? want[0] * sx : 0) - (arm.liftX || 0)) * k10;
      arm.lift = (arm.lift || 0) + ((want ? want[1] : 0) - (arm.lift || 0)) * k10;
      tx += arm.liftX; ty += arm.lift;
      if (cocked) {
        const t = st.heldFor, ph = side === 'L' ? 1.1 : 0;
        tx += 0.0004 * Math.sin(t * 5.3 + ph);
        ty += 0.0006 * Math.sin(t * 3.1 + ph) - 0.012 * Math.max(0, (t - (COCK_WAIT - 0.2)) / 0.2);
      }
      arm.scene.matrix.set(1, 0, -k, tx, 0, 1, 0, ty, 0, 0, 1, 0, 0, 0, 0, 1);
      arm.scene.updateMatrixWorld(true);
    }
    // a seated two-hander: move the support hand so its fist's hole is on the handle's line
    const m = this.grip.seat[this.gauntlet], sl = m?.[this.equip.R]?.L ?? m?.L;
    if (sl && this.twoHanded() && this.arms.R?.item && this.arms.L) {
      const R = this.arms.R, L = this.arms.L;
      const a = R.item.getWorldPosition(_a), d = _d.set(0, 1, 0).transformDirection(R.item.matrixWorld);
      const h = L.socket.localToWorld(_h.fromArray(sl));
      const off = _a.addScaledVector(d, _p.subVectors(h, a).dot(d)).sub(h);   // (nearest point on the line, minus the hole)
      L.scene.matrix.elements[12] += off.x; L.scene.matrix.elements[13] += off.y; L.scene.matrix.elements[14] += off.z;
      L.scene.updateMatrixWorld(true);
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
