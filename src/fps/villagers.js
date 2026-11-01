// The people of Bellmourn: twenty-two men and women (templates/models/creatures/villagers, built by
// tools/villagers), each with a name, a calling and a house of their own, who live in the village the
// way Velscour's townsfolk live in Herrington Hollow (velscour src/game/townlife.js).
//
// A director gives every free villager a routine when the last one ends: wander to the well, a stall,
// the cathedral steps or a neighbour's door and stand a while; walk over to someone and talk; buy at a
// stall a merchant is keeping; keep a stall; work at their own door; draw water; pray on the steps; go
// home and come out again later. The watch patrols. Routines are generator functions that yield seconds
// to wait, or a function to wait on (with a timeout), and use go / say / line / face. At dusk everyone
// but the watch goes home, and comes out again in the morning; anything dead or hostile close by sends
// them running for their door. Someone you walk up to turns, waves and greets you.
//
// Speech (after Velscour's townspeech): rounded parchment bubbles over their heads, anchored in 3D and
// drawn at full resolution over the picture, smaller with distance, hidden behind walls. It is rationed
// so they never swamp the screen: nothing for the first seconds, at most two ambient bubbles near you at
// once (three for something said to you), and a gap between lines.
//
// Some of them wear Lord Velscour's armour (templates/models/armor, built by tools/armor): the watch,
// the hunter, a traveller, and his garrison, six men and women at arms who walk the watch with the
// village's own. A set is skinned to the villagers' own skeleton, so it is bound to theirs by bone
// name; their clothes are hidden under it, and their hair under its helm.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CHATS, BARKS, GREETS, SHOPPING, WORK, DUSK, FLEE, PRAY, WELL } from './townscripts.js';
import { speak, talking, hush } from './speech.js';
import { voice } from './voice.js';
import { MORE_BARKS, MORE_GREETS, MORE_SITUATIONAL as MS } from './lines/barks.js';
import { MORE_CHATS } from './lines/chats.js';

// (the town's words, and the many more in lines/: what they mutter, greet you with, and say at dusk,
// in flight, at prayer, at the well and the stalls)
CHATS.push(...MORE_CHATS.filter((c) => !c.tags.includes('trio')));
const TRIOS = MORE_CHATS.filter((c) => c.tags.includes('trio'));      // (held by three: trio())
for (const [k, v] of Object.entries(MORE_BARKS)) BARKS[k] = [...(BARKS[k] || []), ...v];
for (const [k, v] of Object.entries(MORE_GREETS)) GREETS[k] = [...(GREETS[k] || []), ...v];
DUSK.push(...MS.dusk, ...MS.night); FLEE.push(...MS.flee); PRAY.push(...MS.pray); WELL.push(...MS.well); SHOPPING.push(...MS.shopping.map((s) => [[s]]));   // (a stall's exchanges are lists of lines)
import { SACRED_CHATS, GARRISON_CHATS, SACRED_GREETS, SACRED_TALK, SACRED_BARKS, HUSH } from './tessariel.js';
import { GIVERS } from './quests.js';
import { TOUCH } from './input.js';
import { loadUal, ualBody, RECIPES, CALM, LOOPING, VILLAGER_BONES } from './ual.js';
import { cullable, shareSkeletons } from './engine.js';
import { WEBGPU, T, keyed, ref, shared, sharpGrad, sourceOf } from './nodes.js';

// a phone loads their phone copies (villagers/phone/, from tools/creatures/phone_copies.py: every
// image at most 256 square): ten of the full ones, with their 2048 heads and hair, came to over a
// gigabyte between the decoded images and the GPU, and the tab died
const ROOT = 'templates/models/creatures/villagers/' + (TOUCH ? 'phone/' : '');
const ARMOR = 'templates/models/armor/';
// who lives here: model, name, what others call them, their callings, the house they live in, and
// the armour set they wear
const ROSTER = [
  { m: 'villager_m01', name: 'Tobias', tags: ['innkeeper', 'merchant', 'worker'], home: /Tolling Bell/ },
  { m: 'villager_f01', name: 'Elsie', tags: ['young', 'worker'], home: /Tolling Bell/ },
  { m: 'villager_m08', name: 'Brand', call: 'Sergeant', tags: ['guard'], home: /Barracks/, watch: true, armor: 'knight' },
  { m: 'villager_f09', name: 'Hild', tags: ['guard'], home: /Barracks/, watch: true, armor: 'mailed' },
  { m: 'villager_m09', name: 'Garrow', tags: ['smith', 'worker'], home: /Hammerfall/ },
  { m: 'villager_f06', name: 'Agnes', tags: ['baker', 'worker'], home: /Bakehouse/ },
  { m: 'villager_m10', name: 'Grimwald', call: 'Master Grimwald', tags: ['merchant'], home: /Grimwald/, couple: 'Bertha', stall: true },
  { m: 'villager_f07', name: 'Bertha', call: 'Mistress Grimwald', tags: ['merchant'], home: /Grimwald/, couple: 'Grimwald', stall: true },
  { m: 'villager_f02', name: 'Hesk', call: 'Mother Hesk', tags: ['healer', 'old'], home: /Mending/ },
  { m: 'villager_m04', name: 'Idris', tags: ['learned', 'merchant'], home: /Alchemist/, stall: true },
  { m: 'villager_m02', name: 'Osric', call: 'Reeve', tags: ['old', 'gentry'], home: /Town Hall/ },
  { m: 'villager_f05', name: 'Isolde', call: 'my lady', tags: ['gentry'], home: /Town Hall/ },
  { m: 'villager_m03', name: 'Wat', tags: ['worker', 'young'], home: /Cooper/ },
  { m: 'villager_f04', name: 'Maud', tags: ['worker'], home: /Cooper/ },
  { m: 'villager_f10', name: 'Ebb', tags: ['merchant', 'worker'], home: /Chandler/, stall: true },
  { m: 'villager_f11', name: 'Harrow', call: 'Widow Harrow', tags: ['old'], home: /Harrow/ },
  { m: 'villager_m07', name: 'Tam', tags: ['farmer', 'worker'], home: /Stables/ },
  { m: 'villager_m06', name: 'Hob', tags: ['worker'], home: /Stables/ },
  { m: 'villager_f03', name: 'Wren', tags: ['hunter'], home: /Mending|Harrow/, armor: 'hunter' },
  { m: 'villager_f08', name: 'Joan', tags: ['worker'], home: /Chandler|Cooper/ },
  { m: 'villager_m05', name: 'Sigurd', tags: ['traveller'], home: /Tolling Bell/, armor: 'wayfarer' },
  { m: 'villager_m11', name: 'Corin', tags: ['traveller'], home: /Tolling Bell/ },
  // the keeper of the cathedral's holy texts (Hild's body: under her armour it's never seen otherwise)
  { m: 'villager_f09', name: 'Odile', call: 'Sister Odile', tags: ['priest'], home: /Mending/ },
  // Lord Velscour's garrison, on the watch (their bodies are other villagers', shared with them)
  { m: 'villager_m03', name: 'Aldric', call: 'Ser Aldric', tags: ['guard', 'velscour'], home: /Barracks/, watch: true, garrison: true, armor: 'templar' },
  { m: 'villager_f08', name: 'Morwen', call: 'Black Morwen', tags: ['guard', 'velscour'], home: /Barracks/, watch: true, garrison: true, armor: 'fiend' },
  { m: 'villager_f04', name: 'Sabine', call: 'Dame Sabine', tags: ['guard', 'velscour'], home: /Barracks/, watch: true, garrison: true, armor: 'drake' },
  { m: 'villager_m09', name: 'Ulf', tags: ['guard', 'velscour'], home: /Barracks/, watch: true, garrison: true, armor: 'boneward' },
  { m: 'villager_m04', name: 'Corvus', call: 'Magister Corvus', tags: ['guard', 'velscour', 'learned'], home: /Barracks/, watch: true, garrison: true, armor: 'runebound' },
  { m: 'villager_m07', name: 'Bram', tags: ['guard', 'velscour'], home: /Barracks/, watch: true, garrison: true, armor: 'brawler' },
];
const GARRISON_ON_PHONE = 3;   // a phone gets this many of the garrison (each set is another download)
const PHONE_WAIT = 4;          // seconds after the village is built before a phone starts bringing them in

const QUIET = 5;          // seconds of silence when the game starts
const NEAR = 22;          // metres: speech this close to you counts against the bubble budget
const SHOW = 26;          // metres: bubbles further than this aren't drawn
// what Garrow says as he gives you his son's sword (the first time you speak to him)
const GARROW_GIFT = [
  "You. You're the one who went down the stair and came back up. Wait there.",
  "I made this for my boy, Aldo. A great sword, two hands, proper steel, the best thing I ever forged. He took it down that same stair the winter the bell first rang wrong, and he never came back up.",
  "They found it at the foot of the stair the next spring. No sign of him. I've had it on my wall since, and I can't look at it any more.",
  "Take it. Swing it with both hands, put your back into it, and it'll split a dead man to the belt. Bring it back up every time. That's all I ask.",
];

const lineTime = (text) => Math.min(5.5, Math.max(2.4, 1.6 + text.length * 0.06));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();

export class Villagers {
  /** scene: where they stand; ctx: the world (its physics, its interiors). */
  constructor(scene, ctx) {
    this.scene = scene; this.ctx = ctx; this.physics = ctx.physics;
    this.list = [];
    this.scenes = [];
    this.time = 0; this.nextAmbient = QUIET; this.greetT = 0;
    this.graph = this.streets(ctx);
    this.stalls = this.graph.map((n, i) => [n, i]).filter(([n]) => n.what === 'stall').map(([, i]) => i);
    this.camera = null;
    this.bubbles = new Bubbles();
  }

  /** Bring them in: up to `n` of them (fewer on a phone), each loading in the background and walking
   * out of their door as soon as their model has come. */
  populate(n = ROSTER.length) {
    const loader = new GLTFLoader(), cache = new Map();
    const load = (url) => { if (!cache.has(url)) cache.set(url, loader.loadAsync(url)); return cache.get(url); };
    let who = ROSTER.slice(0, n);
    // a phone gets the watch, a few of the garrison and a cross-section of the rest
    if (n < ROSTER.length) {
      const garrison = ROSTER.filter((p) => p.garrison).slice(0, GARRISON_ON_PHONE);
      const givers = ROSTER.filter((p) => GIVERS[p.name] && !p.garrison);   // those with work for you, always
      who = [...new Set([...givers, ...ROSTER.filter((p) => p.watch && !p.garrison), ...garrison, ...ROSTER.filter((p) => !p.watch)])].slice(0, Math.max(n, givers.length + 2));
    }
    let k = 0;
    const bring = (p) => {
      const jobs = [load(ROOT + p.m + '.glb')];
      if (p.armor) jobs.push(load(`${ARMOR}${p.armor}/${p.armor}_${p.m.includes('_f') ? 'f' : 'm'}.glb`));
      this.onLoading?.(p);
      return Promise.all(jobs).then(async ([g, armor]) => this.spawn(g, p, k++, armor, await this.clipsFor(g, p.m.includes('_f') ? 'f' : 'm', loader)))
        .catch((e) => console.warn('villager', p.m, p.armor, e))
        .finally(() => this.onLoading?.(null));
    };
    // a phone brings them one at a time, once the world has been drawn: all at once, over the first
    // frames' uploads, was more than it could hold. `ready`: when they're all in (the opening waits).
    this.wanted = who.length;
    if (TOUCH) this.ready = who.reduce((prev, p) => prev.then(() => bring(p)), new Promise((r) => setTimeout(r, PHONE_WAIT * 1000)));
    else this.ready = Promise.all(who.map(bring));
    return who.length;
  }

  /** The knight's clips for the villagers (ual.js), standing easy (no shield): made once for the men's
   * skeleton and once for the women's (every villager is on one or the other), a few milliseconds at
   * a time, with the villagers' own wave, which the library hasn't. Null if the library can't be had
   * (they keep their own clips). */
  clipsFor(g, sex, loader) {
    return ((this.sets ||= {})[sex] ||= loadUal(loader)
      .then((src) => ualBody(src, g, { names: VILLAGER_BONES, recipes: { ...RECIPES, ...CALM } }))
      .then((made) => {
        const have = new Set(made.clips.map((c) => c.name));
        const clips = [...made.clips, ...g.animations.filter((c) => !have.has(c.name))];
        relaxHands(clips, g.scene);
        return { ...made, clips };
      })
      .catch((e) => { console.warn('villagers: the library', e); return null; }));
  }

  /** A copy of a loaded model's scene, sharing its geometry and textures: the original stays as it
   * loaded, since a body may be shared by two people and one of them may dress it in armour. */
  static take(gltf) {
    return cloneSkinned(gltf.scene);
  }

  /** Put an armour set on a villager's model: its meshes bound to the villager's own bones (by name:
   * the set was built on the same skeleton), the villager's clothes hidden under it, and the hair under
   * its helm. The face stays: it shows through the helm's eye slits. */
  wear(model, gltf) {
    const set = Villagers.take(gltf), bones = {};
    model.traverse((c) => {
      if (c.isBone) bones[c.name] = c;
      if (c.isMesh && (!/^V_/.test(c.name) || /^V_Hair/.test(c.name))) c.visible = false;
    });
    const host = bones.Root ? bones.Root.parent : model;   // the armature, where the villager's meshes hang
    const meshes = [];
    set.traverse((c) => { if (c.isSkinnedMesh) meshes.push(c); });
    for (const m of meshes) {
      const skel = new THREE.Skeleton(m.skeleton.bones.map((b) => bones[b.name]), m.skeleton.boneInverses);
      if (skel.bones.some((b) => !b)) { console.warn('armour: a bone it needs is missing', m.name); continue; }
      host.add(m);
      m.bind(skel, m.bindMatrix);
      m.castShadow = true; m.receiveShadow = true;
    }
  }

  homeFor(p, k) {
    const hit = this.homes.find((i) => p.home && p.home.test(this.graph[i].zone.name || ''));
    if (hit !== undefined) return hit;
    const bar = this.graph.findIndex((n) => n.zone && /Barracks/.test(n.zone.name));
    if (p.watch && bar >= 0) return bar;
    return this.homes[k % this.homes.length];
  }

  spawn(gltf, p, k, armor = null, set = null) {
    const model = Villagers.take(gltf), root = new THREE.Group();
    root.add(model);
    if (armor) this.wear(model, armor);
    let head = null;
    model.traverse((c) => {
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; skinTone(c.material); }
      if (c.isBone && c.name === 'Head') head = c;
    });
    // one skeleton for all thirteen-odd parts of them, culled to what can be seen (engine.js)
    shareSkeletons(model);
    fitHands(model, !armor);           // (hands that look like hands: see the end of the file)
    cullable(model);
    // their clips: the knight's (clipsFor), or their own; each made into an action when first played
    const mixer = new THREE.AnimationMixer(model), actions = {};
    const clips = Object.fromEntries((set?.clips || gltf.animations).map((c) => [c.name, c]));
    const home = this.homeFor(p, k), nd = this.graph[home];
    const x = nd.x + rand(-1, 1), z = nd.z + rand(-1, 1);
    const a = { ...p, call: p.call || p.name, root, model, head, mixer, actions, clips, ual: !!set, gait: set?.gaits || null, rest: set && Math.random() < 0.3 ? 'idle_arms' : 'idle', cur: null,
      pos: new THREE.Vector3(x, 0, z), yaw: rand(0, 6.28), want: null, path: [], goal: null, node: this.nearestNode(x, z), home,
      speed: p.tags.includes('old') ? 0.8 : rand(1.0, 1.25), busy: false, inside: false, flee: 0, faceTo: null, gesture: 0,
      talk: null, greeted: -99, frame: k % 4, acc: 0, stuck: 0, last: new THREE.Vector3(x, 0, z), nextT: rand(0, 3), occT: 0, hidden: false };
    this.play(a, 'idle');
    mixer.update(Math.random() * 3);
    this.scene.add(root);
    this.list.push(a);
    return a;
  }

  /** A villager's action for a clip, made the first time it's wanted (most of the fifty never are):
   * the gestures and one-offs play once and hold their end. */
  act(a, name) {
    if (a.actions[name] || !a.clips[name]) return a.actions[name];
    const act = a.actions[name] = a.mixer.clipAction(a.clips[name]);
    if (a.ual ? !LOOPING.has(name) : name === 'wave' || name === 'interact') { act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; }
    return act;
  }

  /** What they do with their hands at a job (at work, a stall or the well): on the library's clips,
   * more than the one reach. */
  chore(a, at = 'work') {
    if (!a.ual) return 'interact';
    return pick({ work: ['interact', 'interact', 'pickup', 'kneel', 'harvest', 'plant'], stall: ['interact', 'pickup', 'open_chest'],
      well: ['interact', 'pickup', 'consume'] }[at]);
  }

  play(a, name, speed = 1) {
    const act = this.act(a, name);
    if (!act) return;
    act.timeScale = speed;
    if (a.cur === name) return;
    const prev = a.actions[a.cur];
    act.reset().setEffectiveWeight(1).fadeIn(0.25).play();
    if (prev) prev.fadeOut(0.25);
    a.cur = name;
  }

  /** A one-off gesture (wave, interact), then back to whatever they were doing. */
  gesture(a, name) {
    const act = this.act(a, name);
    if (!act) return 0;
    this.play(a, name);
    a.gesture = act.getClip().duration;
    return a.gesture;
  }

  // ------------------------------------------------------------------ the streets (as before)
  /** Nodes along the high street, the east road, round the plaza and before every front door
   * and the village's places, each joined to its neighbours. */
  streets(ctx) {
    const nodes = [], edges = [];
    const add = (x, z, tag = null) => { nodes.push({ x, z, tag, n: [] }); return nodes.length - 1; };
    const link = (a, b) => { if (a !== b && !nodes[a].n.includes(b)) { nodes[a].n.push(b); nodes[b].n.push(a); } };
    const lineOf = (pts) => { let prev = null; for (const [x, z] of pts) { const i = add(x, z); if (prev !== null) link(prev, i); prev = i; } };
    // the four roads out from the plaza, each as far as it runs clear of the buildings
    const blocked = (x, z) => (ctx.zones || []).some((r) => x > r.x0 - 1.5 && x < r.x1 + 1.5 && z > r.z0 - 1.5 && z < r.z1 + 1.5);
    const road = (pts) => { const out = []; for (const p of pts) { if (blocked(...p)) break; out.push(p); } lineOf(out); };
    const out = (to) => Array.from({ length: Math.floor((to - 26) / 10) + 1 }, (_, k) => 26 + k * 10);
    road(out(46).map((z) => [1.4, 2 - z])); road(out(96).map((z) => [1.4, z]));
    road(out(96).map((x) => [-x, -1.4])); road(out(96).map((x) => [x, -1.4]));
    const ring = [];
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; ring.push(add(Math.cos(a) * 14.5, Math.sin(a) * 14.5, 'plaza')); }
    ring.forEach((i, k) => link(i, ring[(k + 1) % ring.length]));
    const near = (x, z, skip = -1) => { let best = -1, bd = 1e9; nodes.forEach((n, i) => { if (i === skip || n.tag === 'door' || n.tag === 'spot') return; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = i; } }); return best; };
    // the four roads meet the plaza
    for (const [x, z] of [[1.4, -24], [1.4, 24], [-24, -1.4], [24, -1.4]]) link(near(x, z), near(x * 0.6, z * 0.6));
    // front doors, and the places people go
    this.homes = [];
    for (const zone of ctx.interiors) {
      if (zone.biome !== 'village' || !zone.door || Math.hypot(zone.door.x, zone.door.z) > 100) continue;
      const i = add(zone.door.x, zone.door.z, 'door');
      link(i, near(zone.door.x, zone.door.z, i));
      nodes[i].zone = zone;
      if (!/Tower|Cathedral|Sacristy|Burnt|Barracks/.test(zone.name)) this.homes.push(i);
    }
    for (const [x, z, what] of [[2.4, 2.4, 'well'], [8.5, 8.5, 'stall'], [-8.5, 8.5, 'stall'], [8.5, -8.5, 'stall'], [-8.5, -8.5, 'stall'], [0, -37, 'steps'], [-5, -37, 'steps'], [5, -37, 'steps']]) {
      const i = add(x, z, 'spot'); nodes[i].what = what;
      link(i, near(x, z, i));
    }
    void edges;
    return nodes;
  }

  route(from, to) {
    const N = this.graph, prev = new Map([[from, -1]]), q = [from];
    while (q.length) { const a = q.shift(); if (a === to) break; for (const b of N[a].n) if (!prev.has(b)) { prev.set(b, a); q.push(b); } }
    if (!prev.has(to)) return [to];
    const path = []; for (let a = to; a !== -1 && a !== from; a = prev.get(a)) path.unshift(a);
    return path;
  }

  nearestNode(x, z) { let best = 0, bd = 1e9; this.graph.forEach((n, i) => { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = i; } }); return best; }

  /** Arrived somewhere: face what's there (the well, a stall, the door, the cathedral). */
  faceFor(v, n) {
    if (n.what === 'well') return Math.atan2(-n.x, -n.z);
    if (n.what === 'stall') return Math.atan2(n.x * 1.3 - n.x, n.z * 1.3 - n.z);
    if (n.what === 'steps') return Math.PI;   // north, up at the cathedral
    if (n.tag === 'door' && n.zone) return Math.atan2((n.zone.x0 + n.zone.x1) / 2 - n.x, (n.zone.z0 + n.zone.z1) / 2 - n.z);
    return null;
  }

  // ------------------------------------------------------------------ the director's helpers
  /** Walk to (x, z) by the streets; returns a test for having got there. */
  go(a, x, z) {
    const from = this.nearestNode(a.pos.x, a.pos.z), to = this.nearestNode(x, z);
    a.path = from === to ? [] : this.route(from, to).slice();
    a.goal = [x, z]; a.faceTo = null; a.stuck = 0;
    return () => !a.goal;
  }

  face(a, x, z) { if (x && x.pos) { z = x.pos.z; x = x.pos.x; } a.faceTo = Math.atan2(x - a.pos.x, z - a.pos.z); }

  /** a says text (paged into more bubbles if it's long, and aloud in their own voice), on their turn
   * (speech.js): the scene they're in waits till they're done. o: { group, must, wait } (speech.js);
   * a scene of two or more is a conversation (its lines keep the floor between them). */
  say(a, text, toYou = false, o = {}) {
    const group = o.group ?? this.scenes.find((s) => !s.dead && s.people.length > 1 && s.people.includes(a)) ?? null;
    return speak(a, text, toYou, { voice: { ...this.voiceOf(a), pri: toYou ? 2 : 0 }, group, must: o.must, wait: o.wait, now: o.now });
  }

  /** Walk straight to (x, z), off the streets (the meadow by the crater). */
  walkTo(a, x, z) { a.path = []; a.goal = [x, z]; a.faceTo = null; a.stuck = 0; return () => !a.goal; }

  /** How a villager sounds (voice.js): Velscour's garrison in the town as the knights they are. */
  voiceOf(a) {
    return { key: a.name, sex: /_f\d/.test(a.m) ? 'f' : 'm', kind: a.garrison ? 'knight' : 'villager',
      age: a.tags?.includes('old') ? 'old' : a.tags?.includes('young') ? 'young' : null, pos: a.pos };
  }

  near(a, player) { return player && Math.hypot(player.pos.x - a.pos.x, player.pos.z - a.pos.z) < NEAR; }

  /** A line in a scene, said on their turn (let go if it waits `patience` s for it); the scene goes
   * on a moment after it's said. Quiet for the first few seconds of a game. */
  * line(a, text, priority = 0, patience = 9) {
    if (this.time < QUIET) { yield 1.2; return; }
    this.say(a, text, false, { wait: patience });
    yield 0.25;
  }

  fill(text, a, b) {
    return text.replace(/\{a\}/g, a ? a.call : 'friend').replace(/\{b\}/g, b ? b.call : 'friend');
  }

  /** Run a routine for `people`: they're busy until it ends (or is called off). */
  run(gen, people) {
    for (const q of people) q.busy = true;
    this.scenes.push({ gen, people, wait: 0, test: null, testT: 0, dead: false });
  }

  stopScenes(a) {
    for (const s of this.scenes) {
      if (s.dead || !s.people.includes(a)) continue;
      s.dead = true;
      for (const q of s.people) { q.busy = false; q.goal = null; q.path = []; }
      try { s.gen.return(); } catch { /* (it was the one running) */ }   // its `finally` runs: what it must still do
    }
  }

  stepScenes(dt) {
    for (const s of this.scenes) {
      if (s.dead) continue;
      if (s.test) { s.testT += dt; if (!s.test() && s.testT < 25) continue; s.test = null; }
      else if (s.people.some(talking) ? (s.talkT = (s.talkT || 0) + dt) < 40 : (s.wait -= dt) > 0) continue;   // (a wait starts once they've said their piece)
      s.talkT = 0;
      const r = s.gen.next();
      if (r.done) { s.dead = true; for (const q of s.people) q.busy = false; continue; }
      if (typeof r.value === 'function') { s.test = r.value; s.testT = 0; } else s.wait = r.value || 0;
    }
    this.scenes = this.scenes.filter((s) => !s.dead);
  }

  // ------------------------------------------------------------------ routines
  /** Where a quest giver waits while they've work for you (main can move it: postAt). */
  postOf(a) { return this.postAt?.[a.name] || GIVERS[a.name]?.post || null; }
  /** Does this one stay at their post (they've something for you)? */
  stays(a) { return !!(GIVERS[a.name] && this.quests?.business(a.name) && !a.garrison); }

  pickRoutine(a) {
    if (this.stays(a)) return this.run(this.keepPost(a), [a]);
    const free = (q) => q !== a && !q.busy && !q.inside && q.flee <= 0;
    const near = this.list.filter((q) => free(q) && Math.hypot(q.pos.x - a.pos.x, q.pos.z - a.pos.z) < 18);
    const partner = a.couple && chance(0.4) ? near.find((q) => q.name === a.couple) || pick(near) : pick(near);
    const r = Math.random();
    if (a.watch) {
      if (r < 0.55) return this.run(this.patrol(a), [a]);
      if (partner && r < 0.85) return this.run(this.chat([a, partner]), [a, partner]);
      return this.run(this.wander(a), [a]);
    }
    const tending = this.list.filter((q) => q.tending && q !== a);
    if (a.stall && r < 0.3 && !this.list.some((q) => q.tending === a.stallAt)) return this.run(this.keepStall(a), [a]);
    if (r < 0.2 && tending.length) return this.run(this.shop(a, pick(tending)), [a]);
    if (r < 0.58 && partner) {
      // now and then a third joins them
      const third = chance(0.3) ? pick(near.filter((q) => q !== partner)) : null;
      if (third) return this.run(this.trio([a, partner, third]), [a, partner, third]);
      return this.run(this.chat([a, partner]), [a, partner]);
    }
    if (r < 0.68) return this.run(this.work(a), [a]);
    if (r < 0.74) return this.run(this.well(a), [a]);
    if (r < 0.79) return this.run(this.pray(a), [a]);
    if (r < 0.87) return this.run(this.visitHome(a), [a]);
    return this.run(this.wander(a), [a]);
  }

  /** What someone mutters to themselves: since the green star, mostly about him. */
  barks(a) {
    if (a.garrison) return [...BARKS.velscour, ...SACRED_BARKS.velscour];
    const sacred = [...SACRED_BARKS.any, ...a.tags.flatMap((t) => (t === 'velscour' ? [] : SACRED_BARKS[t] || []))];
    return chance(0.75) ? sacred : [...BARKS.any, ...a.tags.flatMap((t) => BARKS[t] || [])];
  }

  /** Is any of Velscour's garrison within earshot of a? (Nobody says the name then.) */
  garrisonNear(a, r = 16) { return this.list.some((q) => q.garrison && !q.inside && Math.hypot(q.pos.x - a.pos.x, q.pos.z - a.pos.z) < r); }

  /** The conversation two people have: one that suits who they are (Velscour's pickChat). Since the
   * green star most of it is about him; the garrison have their own (and never his name), and nobody
   * says "Tessariel" with the garrison in earshot. */
  pickChat(a, b) {
    const has = (q, t) => q.tags.includes(t);
    const couple = a.couple === b.name;
    const gossip = chance(0.35) && !has(a, 'guard') && !has(b, 'guard');
    const fits = (c) => c.tags.some((t) => t === 'any' || (t === 'gossip' && gossip) || (t === 'couple' && couple) || has(a, t) || has(b, t));
    const named = (c) => c.lines.some(([, x]) => /Tessariel/.test(x));
    let source = CHATS;
    if (a.garrison || b.garrison) {
      // one of the garrison holds it: their own talk, them speaking first
      if (chance(0.7)) { const c = pick(GARRISON_CHATS); return { c, order: a.garrison ? [a, b] : [b, a] }; }
    } else if (chance(0.72)) {
      source = SACRED_CHATS;
      if (this.garrisonNear(a) || this.garrisonNear(b)) source = SACRED_CHATS.filter((c) => !named(c));
    }
    let list = source.filter((c) => fits(c) && !(c.tags.includes('couple') && !couple));
    if (!list.length) list = CHATS.filter((c) => fits(c) && !(c.tags.includes('couple') && !couple));
    // favour the conversations of their callings over small talk
    const own = list.filter((c) => c.tags.some((t) => t !== 'any' && t !== 'gossip'));
    if (own.length && chance(0.5)) list = own;
    // don't repeat what was just said
    this.said ||= [];
    const fresh = list.filter((c) => !this.said.includes(c));
    const c = pick(fresh.length ? fresh : list);
    this.said.push(c); if (this.said.length > 60) this.said.shift();
    // a calling's conversation is begun by the one who has it
    const role = c.tags.find((t) => t !== 'any' && t !== 'gossip' && t !== 'couple');
    const order = role && !has(a, role) && has(b, role) ? [b, a] : [a, b];
    return { c, order };
  }

  * chat(people) {
    const [a, b] = people;
    // b walks over to a
    const ang = rand(0, 6.28);
    yield this.go(b, a.pos.x + Math.sin(ang) * 1.15, a.pos.z + Math.cos(ang) * 1.15);
    this.face(a, b); this.face(b, a);
    yield 0.4;
    const { c, order } = this.pickChat(a, b);
    // (the whole exchange voiced ahead, so each line is ready as it's said)
    voice.prefetch(c.lines.map(([who, text]) => { const sp = order[who] || order[0], other = order[1 - who] || order[1]; return [sp, this.fill(text, sp, other), this.voiceOf(sp)]; }));
    for (const [who, text] of c.lines) {
      const sp = order[who] || order[0], other = order[1 - who] || order[1];
      this.face(other, sp);
      yield* this.line(sp, this.fill(text, sp, other));
      // the name said out loud: the other hushes them
      if (/Tessariel/.test(text) && !other.garrison && chance(0.3)) { this.face(sp, other); yield* this.line(other, pick(HUSH)); }
    }
    if (chance(0.25)) this.gesture(pick(people), 'wave');
    yield rand(0.6, 1.6);
  }

  /** Three of them, stood round together, in one of the conversations for three: the other two
   * come over to the first, all three face in, and each line is said in turn. */
  * trio(people) {
    const [a, b, c] = people;
    const ang = rand(0, 6.28);
    const gb = this.go(b, a.pos.x + Math.sin(ang) * 1.25, a.pos.z + Math.cos(ang) * 1.25);
    const gc = this.go(c, a.pos.x + Math.sin(ang + 1.9) * 1.25, a.pos.z + Math.cos(ang + 1.9) * 1.25);
    yield () => gb() && gc();
    const mid = { pos: { x: (a.pos.x + b.pos.x + c.pos.x) / 3, z: (a.pos.z + b.pos.z + c.pos.z) / 3 } };
    for (const q of people) this.face(q, mid);
    yield 0.4;
    const t = this.pickTrio(people);
    if (!t) return;
    const { conv, order } = t;
    const fill = (s) => s.replace(/\{a\}/g, order[0].call).replace(/\{b\}/g, order[1].call).replace(/\{c\}/g, order[2].call);
    voice.prefetch(conv.lines.map(([w, s]) => [order[w], fill(s), this.voiceOf(order[w])]));
    for (const [w, s] of conv.lines) {
      const sp = order[w];
      for (const q of order) if (q !== sp) this.face(q, sp);
      yield* this.line(sp, fill(s));
    }
    for (const q of people) this.face(q, mid);
    if (chance(0.3)) this.gesture(pick(people), 'wave');
    yield rand(0.6, 1.6);
  }

  /** A conversation for these three, and who says which part: one of a calling's is begun by the one
   * who has it (the garrison's by one of the garrison); nobody says "Tessariel" with the garrison by. */
  pickTrio(people) {
    const has = (q, role) => q.tags.includes(role) || (role === 'velscour' && q.garrison);
    const roleOf = (c) => c.tags.find((x) => x !== 'trio' && x !== 'any' && x !== 'gossip');
    const hush = people.some((q) => q.garrison || this.garrisonNear(q));
    const list = TRIOS.filter((c) => {
      const role = roleOf(c);
      if (role && !people.some((q) => has(q, role))) return false;
      if (!role && people.some((q) => q.garrison)) return false;          // (the garrison don't gossip with the town)
      return !(hush && c.lines.some(([, x]) => /Tessariel/.test(x)));
    });
    if (!list.length) return null;
    this.saidTrio ||= [];
    const fresh = list.filter((c) => !this.saidTrio.includes(c));
    const conv = pick(fresh.length ? fresh : list);
    this.saidTrio.push(conv); if (this.saidTrio.length > 12) this.saidTrio.shift();
    const role = roleOf(conv);
    let order = people.slice().sort(() => Math.random() - 0.5);
    if (role) { const lead = order.find((q) => has(q, role)); order = [lead, ...order.filter((q) => q !== lead)]; }
    return { conv, order };
  }

  /** At their post, facing out, waiting for you: a word now and then, while there's work. */
  * keepPost(a) {
    const [x, z, yaw] = this.postOf(a);
    yield this.go(a, x, z);
    a.faceTo = yaw;
    const until = this.time + rand(40, 70);
    while (this.time < until && this.stays(a)) {
      const [px, pz] = this.postOf(a);
      if (Math.hypot(a.pos.x - px, a.pos.z - pz) > 1.5) { yield this.go(a, px, pz); a.faceTo = this.postOf(a)[2]; }
      if (chance(0.12)) yield* this.line(a, pick([...SACRED_BARKS.any, ...a.tags.flatMap((t) => SACRED_BARKS[t] || [])]), 0, 2);
      yield rand(2, 4);
    }
  }

  * wander(a) {
    const spots = this.graph.map((n, i) => [n, i]).filter(([n]) => n.tag === 'spot' || n.tag === 'plaza' || n.tag === 'door');
    const [n] = pick(spots);
    yield this.go(a, n.x + rand(-1.2, 1.2), n.z + rand(-1.2, 1.2));
    const f = this.faceFor(a, n); if (f != null) a.faceTo = f;
    if (chance(0.25)) yield* this.line(a, pick(this.barks(a)), 0, 2);
    yield rand(3, 10);
  }

  * patrol(a) {
    const n = 3 + Math.floor(Math.random() * 3), r = rand(10, 30), a0 = rand(0, 6.28);
    for (let i = 0; i < n; i++) {
      const ang = a0 + i / n * 6.28;
      const nd = this.graph[this.nearestNode(Math.cos(ang) * r, Math.sin(ang) * r)];
      yield this.go(a, nd.x, nd.z);
      if (chance(0.25)) yield* this.line(a, pick(a.garrison ? [...BARKS.velscour, ...SACRED_BARKS.velscour] : [...BARKS.guard, ...(SACRED_BARKS.guard || [])]), 0, 2);
      yield rand(1.5, 4);
    }
  }

  * keepStall(a) {
    const open = this.stalls.filter((s) => !this.list.some((q) => q.tending === s));
    if (!open.length) return;
    const i = pick(open), n = this.graph[i];
    yield this.go(a, n.x, n.z);
    a.faceTo = this.faceFor(a, n);   // at the stall, facing out to the square's edge where buyers stand
    a.tending = i; a.stallAt = i;
    const until = this.time + rand(25, 50);
    while (this.time < until && !this.night) {
      if (chance(0.3)) yield* this.line(a, pick(BARKS.merchant), 0, 2);
      if (chance(0.3)) this.gesture(a, this.chore(a, 'stall'));
      yield rand(4, 8);
    }
    a.tending = null;
  }

  * shop(a, v) {
    const n = this.graph[v.tending];
    if (!n) return;
    yield this.go(a, n.x * 1.25, n.z * 1.25);
    this.face(a, v); this.face(v, a);
    const [l1, l2, l3] = pick(SHOPPING);
    yield* this.line(a, l1[0]);
    if (v.tending == null) return;
    if (l2) yield* this.line(v, l2[0]);
    if (l3) yield* this.line(a, l3[0]);
    this.gesture(v, 'interact');
    yield rand(1, 2.5);
  }

  * work(a) {
    const n = this.graph[a.home];
    yield this.go(a, n.x + rand(-0.8, 0.8), n.z + rand(-0.8, 0.8));
    const f = this.faceFor(a, n); if (f != null) a.faceTo = f;
    const lines = a.tags.map((t) => WORK[t]).find(Boolean) || WORK.any;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
      yield this.gesture(a, this.chore(a)) || 2;
      if (chance(0.3)) yield* this.line(a, pick(lines), 0, 1);
      yield rand(0.8, 2);
    }
  }

  * well(a) {
    const n = this.graph.find((q) => q.what === 'well');
    yield this.go(a, n.x + rand(-0.6, 0.6), n.z + rand(-0.6, 0.6));
    a.faceTo = this.faceFor(a, n);
    yield this.gesture(a, this.chore(a, 'well')) || 2;
    if (chance(0.5)) yield* this.line(a, pick(WELL), 0, 2);
    yield rand(2, 5);
  }

  * pray(a) {
    const steps = this.graph.filter((q) => q.what === 'steps'), n = pick(steps);
    yield this.go(a, n.x + rand(-0.8, 0.8), n.z + rand(-0.5, 0.5));
    a.faceTo = Math.PI;
    if (chance(0.5)) yield* this.line(a, pick(PRAY), 0, 2);
    yield rand(5, 12);
  }

  * visitHome(a) {
    const n = this.graph[a.home];
    yield this.go(a, n.x, n.z);
    a.root.visible = false; a.inside = true;
    yield rand(10, 28);
    a.inside = false; a.root.visible = true;
  }

  /** The villager you're looking at, close enough to speak with (or null). */
  aimed(camera, reach = 3.4) {
    const o = camera.position, d = camera.getWorldDirection(_d);
    let best = null, bs = 0;
    for (const a of this.list) {
      if (a.inside || !a.root.visible) continue;
      const tx = a.pos.x - o.x, ty = a.pos.y + 1.2 - o.y, tz = a.pos.z - o.z, dist = Math.hypot(tx, ty, tz);
      if (dist > reach) continue;
      const dot = (tx * d.x + ty * d.y + tz * d.z) / dist;
      if (dot < 0.82) continue;
      const sc = dot - dist * 0.05;
      if (sc > bs) { bs = sc; best = a; }
    }
    return best;
  }

  /** You speak to someone with nothing to give you: they turn, and say something about who you are. */
  /** Whether a villager's gift (a unique's id) has been given already (this game). */
  gave(id) { try { return !!localStorage.getItem('bm.taken.gift.' + id); } catch { return false; } }

  /** What `a` will say when you next speak to them (picked ahead, so it can be made ahead): Garrow's
   * gift the first time, else a line of theirs about who you are. */
  replyFor(a) {
    if (a.name === 'Garrow' && this.onGift && !this.gave('garrowsoath')) return GARROW_GIFT;
    if (!a.reply) {
      const lines = a.garrison ? SACRED_TALK.velscour : [...SACRED_TALK.any, ...a.tags.flatMap((t) => (t === 'velscour' ? [] : SACRED_TALK[t] || []))];
      a.reply = [pick(lines)];
    }
    return a.reply;
  }

  /** You're about to speak to `a` (coming up to them, or looking at them in reach: pri higher): their
   * answer, and their good day, made now, so either is heard the moment it's due. */
  expect(a, pri = 2) {
    if (!a || a.gathered || !voice.natural || (a.expected >= pri && this.time - a.expectT < 20)) return;
    a.expected = pri; a.expectT = this.time;
    const v = this.voiceOf(a), list = this.replyFor(a).map((t) => [a, t, v]);
    if (pri < 8 && this.time - a.greeted > 50) list.push([a, this.greetingFor(a), v]);
    voice.prefetch(list, pri);
  }

  /** You speak to someone: they answer at once (whoever else was talking stops for them), turning
   * to you as they do, the line they'd ready for you (expect). */
  talkTo(a, player) {
    if (a.gathered) { this.gatherPoke = a; return; }   // (at the crater after the green star: it hurries them on)
    if (a.answering && talking(a)) return;              // (still answering you)
    this.stopScenes(a);
    a.busy = true; a.greeted = this.time;
    const lines = this.replyFor(a), gift = lines === GARROW_GIFT;
    a.reply = null; a.expected = 0;
    this.face(a, player); a.quick = 0.8;
    if (chance(gift ? 0.2 : 0.35)) this.gesture(a, 'wave'); else if (chance(0.3)) this.gesture(a, 'nod_yes');
    const self = this, turn = { answer: a };
    a.answering = true;
    this.say(a, lines[0], true, { now: true, must: true, group: turn });
    this.run((function* () {
      try {
        // Garrow the smith, the first time: he gives you his son's great sword
        for (const ln of lines.slice(1)) { yield 0.3; self.face(a, player); self.say(a, ln, true, { must: true, group: turn }); }
        yield 0.4;
        if (gift) { if (chance(0.6)) self.gesture(a, 'wave'); self.onGift('garrowsoath', a); }
      } finally { a.answering = false; }
    })(), [a]);
  }

  /** After the green star: the village has come out to the crater. One of them (`caller` {name, at:
   * [x, z]}) stands up on its edge where you'll see her as you come round, looking down at you; the
   * rest (`group` [{name, at}]) keep back from the hole, in a loose knot on the meadow, spread out,
   * hidden from you by the rim till you climb up to it. main puts them there in the black, so they've
   * been there a while; `look` [x, z] is the crater's middle.
   *  - The caller calls down to you (`calls` [{name, text, toYou, wave}]: the first exchange, the
   *    group calling to her and her answering over her shoulder; then `again`, her calls now and then,
   *    and between them the group's own talk, `chatter`), till you come up near her (or out of the
   *    hole anywhere: `out(player)`).
   *  - Then she says `lead` to you, turns, and walks back to the others (stopping for you if you
   *    lag: `lag`), and they call out at the sight of you climbing out (`sight`).
   *  - Once you're come to them, they turn to you, step in round you a little, and `script` [{name,
   *    text, ifArms (said instead while the knight's things still lie in the crater: arms()), gift,
   *    wave}] is said in turn, each to you: who they are, who you are, what they give you
   *    (onGift(gift, who) as each gives theirs). They wait whenever you walk off (`away`, once).
   *    onDone() after the last line.
   * E on one of them hurries it on (talkTo). False if none of them is here. */
  gather(player, { caller, group, look, calls = [], again = [], chatter = [], lead = [], lag = [], sight = [], script = [], away = [], out, arms, onGift, onDone }) {
    const find = (c) => ({ ...c, a: this.list.find((v) => v.name === c.name) });
    const crowd = group.filter((g) => g.name !== caller?.name).map(find).filter((c) => c.a), C = caller ? find(caller) : null;
    const people = [...crowd, ...(C?.a ? [C] : [])];
    if (!people.length) return false;
    const self = this, id = (this.gatherId = (this.gatherId || 0) + 1);   // (a new game's gathering ends the last one: it gives nothing then)
    const flat = (p, q) => Math.hypot(p.x - q[0], p.z - q[1]);
    const mid = [crowd.reduce((s, c) => s + c.at[0], 0) / Math.max(1, crowd.length), crowd.reduce((s, c) => s + c.at[1], 0) / Math.max(1, crowd.length)];
    const home = C?.a ? (group.find((g) => g.name === C.name)?.at || mid) : mid;   // (where the caller goes back to)
    const toGroup = () => Math.min(...people.filter((c) => c !== C || C.back).map((c) => flat(player.pos, [c.a.pos.x, c.a.pos.z])));
    for (const c of people) {
      this.stopScenes(c.a);
      hush(c.a);
      Object.assign(c.a, { inside: false, flee: 0, headingHome: false, hurry: false, path: [], goal: null, gesture: 0, reply: null, greeting: null });
      c.a.root.visible = true;
      c.a.pos.set(c.at[0], 0, c.at[1]);
      c.a.pos.y = this.physics.floorAt(c.at[0], c.at[1], 5, 0.25, 9);
      // (the caller looks down into it; the rest at her, or at the hole, or at each other, as people stand)
      if (c === C) this.face(c.a, look[0], look[1]);
      else if (C?.a && chance(0.6)) this.face(c.a, C.at[0] + rand(-1.5, 1.5), C.at[1] + rand(-1.5, 1.5));
      else this.face(c.a, look[0] + rand(-5, 5), look[1] + rand(-5, 5));
      c.a.yaw = c.a.faceTo;
    }
    if (C) C.back = !C.a;
    const gathering = { gather: id };    // (their lines keep the floor between them)
    let seen = false, given = 0, finished = false;
    // a line: the speaker turns to you and keeps to you while they say it (or, said among
    // themselves, to whoever it's said to), the rest to the speaker (some of them to you, once you're
    // among them); the caller, up on the edge, keeps her eyes on you, unless it's her they're calling to
    const speak = (ln, toYou) => {
      const c = people.find((q) => q.name === ln.name);
      if (!c) return 0;
      const toHer = !toYou && c !== C && ln.to === 'caller', crowdTalk = !toYou && c === C && !C.back;
      for (const q of people) {
        q.a.track = null;
        if (q === C && !C.back) {
          if (q === c && crowdTalk) self.face(q.a, mid[0], mid[1]);     // (answering the others, over her shoulder)
          else if (toHer) self.face(q.a, c.a);
          else q.a.track = player;
        } else if (q === c) {
          if (toYou || seen) q.a.track = player;
          else self.face(q.a, toHer || (C?.a && !C.back) ? C.a : { pos: { x: look[0], z: look[1] } });
        } else if (seen && chance(0.3)) self.face(q.a, player);
        else self.face(q.a, c.a);
      }
      if (ln.wave) self.gesture(c.a, 'wave');
      else if (seen && chance(0.2)) { const n = pick(people.filter((q) => q !== c && q.a.gesture <= 0 && !q.a.goal)); if (n) self.gesture(n.a, 'nod_yes'); }   // (someone nods along)
      const text = ln.ifArms && arms?.() ? ln.ifArms : ln.text;
      return self.say(c.a, text, toYou, { group: gathering, must: toYou, wait: 20 });
    };
    const after = (s) => { const t0 = self.time; return () => self.time - t0 >= s; };
    // wait `s` once everyone's quiet, or till `brk()` (checked every frame)
    const wait = (s, brk = null) => {
      let quiet = null;
      return () => {
        if (brk?.()) return true;
        if (people.some((q) => talking(q.a))) { quiet = null; return false; }
        quiet ??= self.time;
        return self.time - quiet >= s;
      };
    };
    const poked = () => { const p = self.gatherPoke; self.gatherPoke = null; return !!p; };
    const nearCaller = () => !C?.a || flat(player.pos, [C.a.pos.x, C.a.pos.z]) < 6.5 || out(player);
    for (const c of people) c.a.gathered = true;   // (E on one of them doesn't break it up: talkTo)
    this.run((function* () {
      try {
        // ------------------------------------------------ the caller, down into the crater
        yield 1.2;
        if (C?.a) C.a.track = player;
        // (the first exchange; then two of her calls to one of the others' remarks, round again)
        let n = 0, ai = 0, ci = 0;
        const first = calls.slice();
        while (C?.a && !nearCaller() && !poked()) {
          let ln;
          if (first.length) ln = first.shift();
          else if (again.length && (n++ % 3 !== 2 || !chatter.length)) ln = { ...again[ai++ % again.length], name: C.name, toYou: true };
          else ln = { ...chatter[ci++ % chatter.length], toYou: false };
          speak(ln, !!ln.toYou);
          yield wait(first.length ? rand(0.3, 0.7) : ln.toYou ? rand(3.5, 6) : rand(1.2, 2.5), nearCaller);
        }
        // ------------------------------------------------ she takes you to the others
        if (C?.a && !C.back) {
          if (lead.length) speak({ ...lead[0], name: C.name }, true);
          yield wait(0, () => talking(C.a) && C.a.talk?.state === 'up');   // (she's begun)
          yield after(0.9);                                                  // (and turns, still talking)
          C.a.track = null;
          let lagged = 0;
          self.walkTo(C.a, home[0], home[1]);
          while (C.a.goal) {
            if (!seen && out(player)) { seen = true; for (const ln of sight) speak(ln, false); }
            // (you've fallen behind: she stops and turns, and waits for you)
            if (flat(player.pos, [C.a.pos.x, C.a.pos.z]) > 9 && flat(C.a.pos, C.at) > 3 && lag.length) {
              const goal = C.a.goal;
              C.a.goal = null; self.face(C.a, player);
              if (lagged++ < 3) speak({ ...lag[(lagged - 1) % lag.length], name: C.name, toYou: true }, true);
              yield wait(0.2, () => flat(player.pos, [C.a.pos.x, C.a.pos.z]) < 6);
              yield () => flat(player.pos, [C.a.pos.x, C.a.pos.z]) < 6;
              self.walkTo(C.a, goal[0], goal[1]);
            }
            yield () => !C.a.goal || (!seen && out(player)) || flat(player.pos, [C.a.pos.x, C.a.pos.z]) > 9;
          }
          C.back = true;
          self.face(C.a, player);
        }
        // ------------------------------------------------ till you come to them
        while (toGroup() > 7.5 && !poked()) {
          if (!seen && out(player)) { seen = true; for (const ln of sight) speak(ln, false); }
          yield wait(0.3, () => toGroup() <= 7.5 || (!seen && out(player)));
        }
        seen = true;
        // ------------------------------------------------ you've come: they turn to you and close in a little
        for (const c of people) { self.face(c.a, player); c.a.quick = 0; }
        self.closeIn(people.map((c) => c.a), player.pos);
        yield 0.6;
        let left = false;
        for (const ln of script) {
          // (you walk off: they wait, one of them calls after you once)
          if (toGroup() > 13) {
            if (!left && away.length) { left = true; speak(away[0], true); }
            yield () => toGroup() < 9;
            for (const c of people) self.face(c.a, player);
            yield 0.4;
          }
          const c = people.find((q) => q.name === ln.name);
          if (ln.gift) { given++; if (c) self.gesture(c.a, 'interact'); }
          if (!c) { if (ln.gift) onGift?.(ln.gift, null); continue; }
          speak(ln, true);
          if (ln.gift) onGift?.(ln.gift, c.a);
          yield wait(rand(0.22, 0.5));
        }
        finished = true;
        onDone?.();
        yield 1;
      } finally {
        for (const c of people) c.a.track = null;
        if (id === self.gatherId) for (const c of people) c.a.gathered = false;
        // broken up before the end (something dead came at them): you still get what they'd have given
        if (!finished && id === self.gatherId) {
          for (const ln of script.filter((l) => l.gift).slice(given)) onGift?.(ln.gift, null);
          onDone?.();
        }
      }
    })(), people.map((c) => c.a));
    return true;
  }

  /** A few people turning to meet someone at `at`: each takes a step or two in, to between 3.2 and 5
   * m off, kept a little apart from the next, so they stand round them in a loose half-ring. */
  closeIn(list, at) {
    const spots = list.map((a) => {
      const dx = a.pos.x - at.x, dz = a.pos.z - at.z, d = Math.hypot(dx, dz) || 1;
      const r = Math.min(d, Math.max(3.2, Math.min(5, d * 0.55)) + rand(-0.3, 0.3));
      return { a, x: at.x + (dx / d) * r, z: at.z + (dz / d) * r };
    });
    for (let it = 0; it < 24; it++) {
      for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
        const p = spots[i], q = spots[j], dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
        if (d >= 1.6 || d < 1e-4) continue;
        const push = (1.6 - d) / 2;
        p.x -= (dx / d) * push; p.z -= (dz / d) * push; q.x += (dx / d) * push; q.z += (dz / d) * push;
      }
    }
    for (const s of spots) if (Math.hypot(s.x - s.a.pos.x, s.z - s.a.pos.z) > 0.6) this.walkTo(s.a, s.x, s.z);
  }

  /** Call off the gathering after the green star (a new game, or a save loaded): they go about their
   * day, and give nothing more. */
  endGather() {
    this.gatherId = (this.gatherId || 0) + 1;
    for (const a of this.list) if (a.gathered) { a.gathered = false; this.stopScenes(a); }
  }

  /** The good day `a` will give you next (picked ahead, as their answer is). */
  greetingFor(a) {
    return (a.greeting ||= pick(a.garrison ? [...GREETS.velscour, ...SACRED_GREETS.velscour]
      : chance(0.8) ? [...SACRED_GREETS.any, ...a.tags.flatMap((t) => SACRED_GREETS[t] || [])] : [...GREETS.any, ...a.tags.flatMap((t) => GREETS[t] || [])]));
  }

  /** Someone you come up to: they stop, turn to you, wave and say good day. */
  greet(a, player) {
    this.stopScenes(a);
    a.busy = true;
    const self = this, line = this.greetingFor(a);
    a.greeting = null;
    this.run((function* () {
      self.face(a, player); a.quick = 0.6;
      yield 0.25;
      self.gesture(a, 'wave');
      if (self.time >= QUIET) { self.say(a, line, true, { wait: 3 }); yield 0.3; }   // (a passing good day: let go if others are talking)
      yield 0.8;
    })(), [a]);
  }

  // ------------------------------------------------------------------ each frame
  update(dt, player, hour, danger) {
    this.time += dt; this.player = player;
    const night = this.night = hour < 6.2 || hour > 20.5;
    this.stepScenes(dt);
    // whoever you're walking up to: what they'll say to you made now (expect), so it's heard at once
    if ((this.expectIn = (this.expectIn || 0) - dt) <= 0 && this.camera && voice.natural) {
      this.expectIn = 0.3;
      this.camera.getWorldDirection(_d);
      const fl = Math.max(Math.hypot(_d.x, _d.z), 1e-3);
      let best = null, bs = -1;
      for (const a of this.list) {
        if (a.inside || !a.root.visible || a.gathered) continue;
        const dx = a.pos.x - player.pos.x, dz = a.pos.z - player.pos.z, d = Math.hypot(dx, dz);
        if (d > 10 || d < 1e-3) continue;
        const dot = (dx * _d.x + dz * _d.z) / d / fl;
        if (dot > 0.5 && dot - d * 0.06 > bs) { bs = dot - d * 0.06; best = a; }
      }
      if (best) this.expect(best, 2);
    }
    for (const a of this.list) {
      const dx = player.pos.x - a.pos.x, dz = player.pos.z - a.pos.z, dist = Math.hypot(dx, dz);
      const far = dist > 95 || player.pos.y < -4;
      // danger: run for the door
      a.flee = Math.max(0, a.flee - dt);
      if (danger && !a.watch && a.flee <= 0 && !a.inside && (a.dangerT = (a.dangerT || 0) + dt) > 0.8) {
        a.dangerT = 0;
        if (danger(a.pos)) {
          this.stopScenes(a); a.flee = 10; a.busy = true;
          if (chance(0.6)) this.say(a, pick(FLEE));
          const n = this.graph[a.home]; this.go(a, n.x, n.z);
        }
      }
      // home at night (the watch stays out), out again by day
      const goHome = (night && !a.watch && !this.stays(a)) || a.flee > 0;
      if (a.inside) {
        if (!goHome && !a.busy) { a.inside = false; a.root.visible = !far; a.nextT = rand(1, 25); }
        else continue;
      }
      if (goHome && !a.flee && !a.headingHome) {
        this.stopScenes(a); a.headingHome = true; a.busy = true;
        if (chance(0.4)) this.say(a, pick(DUSK));
        const n = this.graph[a.home]; this.go(a, n.x, n.z);
      }
      if (goHome && !a.goal && Math.hypot(this.graph[a.home].x - a.pos.x, this.graph[a.home].z - a.pos.z) < 1.6) {
        a.inside = true; a.root.visible = false; a.busy = false; a.headingHome = false; a.flee = 0; hush(a); continue;
      }
      if (!goHome) a.headingHome = false;
      if (!goHome && a.busy && !this.scenes.some((s) => s.people.includes(a))) a.busy = false;   // a flight or a walk home called off
      // a free villager picks something to do
      if (!a.busy && !goHome && (a.nextT -= dt) <= 0) { this.pickRoutine(a); a.nextT = rand(0.5, 2.5); }
      // you come up to them, and they greet you
      if (!goHome && !this.hush && !a.gathered && dist < 3.6 && this.time - a.greeted > 50 && this.time - this.greetT > 6 && !a.tending && !talking(a) && !(a.busy && this.scenes.some((sc) => sc.people.includes(a) && sc.people.length > 2))) {
        // only if you're looking their way
        let looking = true;
        if (this.camera) { this.camera.getWorldDirection(_d); looking = -(dx * _d.x + dz * _d.z) / Math.max(dist, 1e-3) / Math.max(Math.hypot(_d.x, _d.z), 1e-3) > 0.6; }
        if (looking) { a.greeted = this.time; this.greetT = this.time; this.greet(a, player); }
      }
      // walk
      let moving = false;
      if (a.goal) {
        const n = a.path.length ? this.graph[a.path[0]] : null;
        const tx = (n ? n.x : a.goal[0]) - a.pos.x, tz = (n ? n.z : a.goal[1]) - a.pos.z, d = Math.hypot(tx, tz);
        if (d < (n ? 0.9 : 0.35)) {
          if (n) { a.node = a.path.shift(); } else { a.goal = null; }
        } else {
          const want = Math.atan2(tx, tz);
          let e = want - a.yaw; while (e > Math.PI) e -= Math.PI * 2; while (e < -Math.PI) e += Math.PI * 2;
          a.yaw += Math.max(-dt * 5, Math.min(dt * 5, e));
          // (on the knight's clips a run is the library's jog, which would look slowed at 3.4)
          const run = a.flee > 0 || a.hurry, sp = a.sp = (run ? (a.ual ? 4.2 : 3.4) : a.speed) * Math.max(0.15, Math.cos(Math.min(1.5, Math.abs(e))));
          this.physics.slide(a.pos, Math.sin(a.yaw) * sp * dt, Math.cos(a.yaw) * sp * dt, 0.28, 1.6, 0.45);
          moving = true;
          a.stuck += dt;
          if (a.stuck > 1.5) {
            if (a.last.distanceTo(a.pos) < 0.4) { if (a.path.length) a.node = a.path.shift(); else a.goal = null; }
            a.last.copy(a.pos); a.stuck = 0;
          }
        }
      } else {
        if (a.track) this.face(a, a.track);         // (whoever they're talking to, wherever they go)
        if (a.faceTo != null) {
          // (turned to quickly when you speak to them: a.quick)
          let e = a.faceTo - a.yaw; while (e > Math.PI) e -= Math.PI * 2; while (e < -Math.PI) e += Math.PI * 2;
          const turn = (a.quick > 0 ? 8 : 3) * dt;
          a.yaw += Math.max(-turn, Math.min(turn, e));
        }
      }
      if (a.quick > 0) a.quick -= dt;
      a.pos.y = this.physics.floorAt(a.pos.x, a.pos.z, a.pos.y + 0.5, 0.25, 0.6);
      if (!Number.isFinite(a.pos.y)) a.pos.y = 0;
      if (a.gesture > 0 && !moving) a.gesture -= dt;
      else {
        if (moving) a.gesture = 0;
        const run = a.flee > 0 || a.hurry, gait = run ? 'run' : 'walk';
        if (moving) this.play(a, gait, a.gait?.[gait] ? Math.max(0.3, a.sp / a.gait[gait]) : run ? 1 : a.speed / 1.05);   // (the feet don't slide)
        else this.play(a, a.ual && a.talk && a.talk.t > 0 ? 'idle_talk' : a.rest);   // (talking with their hands while their words are up; some stand arms folded)
      }
      // you can't walk through them
      if (dist < 0.55 && dist > 1e-4 && Math.abs(player.pos.y - a.pos.y) < 1.5) { player.pos.x = a.pos.x + dx / dist * 0.55; player.pos.z = a.pos.z + dz / dist * 0.55; }
      a.root.visible = !far;
      if (far) continue;
      // animate (less often further off)
      a.acc += dt;
      if (dist < 25 || ++a.frame % (dist < 55 ? 2 : 4) === 0) { a.mixer.update(a.acc); a.acc = 0; }
      a.root.position.copy(a.pos);
      a.root.rotation.y = a.yaw;
    }
    if (this.camera) this.bubbles.draw(this, this.camera, this.quests ? (a) => this.quests.markOf(a.name) : null, this.extraSpeakers);
  }
}

// ====================================================================== hands
// The villagers' hands. Their models' finger bones sit a segment's worth further out than the
// fingers they move (each joint 1.5 to 3 cm past where its skin hands over to the next bone), so a
// finger bent in the middle of a bone, not at a knuckle; and the library's clips, carried over joint
// for joint, bent every finger joint 65-80 degrees (claws), all alike, partly about the wrong axis.
// So: each villager's finger joints are moved to where the skin hands over (fitHands: the hands
// rigged as the hands are built), a little fuller across; and a hand rests as a hand does (relaxHands):
// each finger curled a little more than the one before it, a few degrees apart (whatever the model's
// own spread), the end joint following the middle one, the thumb easy beside the first finger; the
// clip's own motion (a fist, a hand opened to wave) laid over that, bend only, about each finger's
// own hinge, a part of it, within a joint's reach. A little shading goes with them: pale nails, shade
// between the fingers and in the palm (in the skin's own shader: skinTone).
const FINGER = /^(Index|Middle|Ring|Pinky|Thumb)(\d)([LR])$/;
const REST_CURL = { Index: [15, 25, 10], Middle: [20, 30, 12], Ring: [25, 35, 15], Pinky: [30, 40, 18] };   // degrees: knuckle, middle joint, last
const SPREAD = { Index: 3, Middle: 0, Ring: -2.5, Pinky: -5 };                                               // degrees from the middle finger, toward the thumb
const TAKE = [0.35, 0.5, 0.3];                                                                               // how much of the clip's own bend each joint takes
const MAX_CURL = [55, 65, 35];
const DEG = Math.PI / 180;

/** Each skeleton's clips, once: the fingers' turns remade (as above), their moves and stretches dropped. */
function relaxHands(clips, scene) {
  let mesh = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
  if (!mesh) return;
  const sk = mesh.skeleton, at = new Map(sk.bones.map((b, i) => [b, i]));
  const named = (n) => sk.bones.find((b) => b.name === n);
  const bindWorld = (b) => new THREE.Matrix4().copy(sk.boneInverses[at.get(b)]).invert();
  const where = (n) => { const b = named(n); return b ? new THREE.Vector3().setFromMatrixPosition(bindWorld(b)) : null; };
  const info = new Map(), hands = {};
  for (const side of ['L', 'R']) {
    const w = where('Wrist' + side), i2 = where('Index2' + side), p2 = where('Pinky2' + side);
    if (!w || !i2 || !p2) continue;
    const across = i2.clone().sub(p2).normalize();                        // (toward the thumb)
    const palm = new THREE.Vector3().crossVectors(i2.clone().sub(w), p2.clone().sub(w)).normalize();
    hands[side] = { across, palm };
    for (const b of sk.bones) {
      const m = b.name.match(FINGER);
      if (!m || m[3] !== side) continue;
      const W = bindWorld(b), R = new THREE.Matrix4().extractRotation(W), Rt = R.clone().transpose();
      const local = (at.has(b.parent) ? bindWorld(b.parent).invert() : new THREE.Matrix4()).multiply(W);
      const rest = new THREE.Quaternion();
      local.decompose(new THREE.Vector3(), rest, new THREE.Vector3());
      const dir = new THREE.Vector3(0, 1, 0).applyMatrix4(R).normalize();
      const hingeW = new THREE.Vector3().crossVectors(dir, palm).normalize();
      const toward = new THREE.Vector3().crossVectors(palm, dir).dot(across) >= 0 ? 1 : -1;   // (a turn about the palm's normal that takes it toward the thumb)
      info.set(b.name, { rest, f: m[1], k: +m[2], side, dir, hingeW, hinge: hingeW.clone().applyMatrix4(Rt).normalize(), spread: palm.clone().applyMatrix4(Rt).normalize(), toward, spreadDeg: 0 });
    }
  }
  // which way is a curl: the library's idle curls the fingers in, so its middle joints' mean bend is a curl
  const bend = (I, q) => {
    const d = I.rest.clone().invert().multiply(q);
    if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w);
    return 2 * Math.atan2(d.x * I.hinge.x + d.y * I.hinge.y + d.z * I.hinge.z, d.w);
  };
  const idle = clips.find((c) => c.name === 'idle') || clips[0];
  const q = new THREE.Quaternion();
  const idleFirst = new Map((idle?.tracks || []).filter((t) => t.name.endsWith('.quaternion')).map((t) => [t.name.slice(0, -11), new THREE.Quaternion().fromArray(t.values, 0)]));
  const first = (bone) => idleFirst.get(bone) || null;     // (read before any clip is remade)
  for (const side of Object.keys(hands)) {
    let sum = 0;
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) { const I = info.get(f + '3' + side), q0 = I && first(f + '3' + side); if (q0) sum += bend(I, q0); }
    if (sum < 0) for (const I of info.values()) if (I.side === side) { I.hinge.negate(); I.hingeW.negate(); }
    // each finger's spread as modelled, measured from the middle finger in the palm's plane: what's
    // turned is the difference to a hand's few degrees
    const mid = info.get('Middle2' + side);
    if (!mid) continue;
    const plane = (v) => v.clone().addScaledVector(hands[side].palm, -v.dot(hands[side].palm)).normalize();
    const ref = plane(mid.dir);
    for (const f of ['Index', 'Ring', 'Pinky', 'Middle']) {
      const I = info.get(f + '2' + side);
      if (!I) continue;
      const d = plane(I.dir), a = Math.acos(Math.max(-1, Math.min(1, d.dot(ref)))) * (d.dot(hands[side].across) >= ref.dot(hands[side].across) ? 1 : -1);
      I.spreadDeg = SPREAD[f] - a / DEG;
    }
  }
  // the idle's bend at each joint: what the clips' motion is measured from; the thumb's idle pose
  const base = new Map(), thumbIdle = new Map();
  for (const t of idle?.tracks || []) {
    const bone = t.name.slice(0, t.name.lastIndexOf('.')), I = info.get(bone);
    if (!I || !t.name.endsWith('.quaternion')) continue;
    q.fromArray(t.values, 0);
    if (I.f === 'Thumb') { if (I.rest.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w); thumbIdle.set(bone, I.rest.clone().slerp(q, 0.4)); }
    else base.set(bone, bend(I, q));
  }
  const hq = new THREE.Quaternion(), sq = new THREE.Quaternion(), dq = new THREE.Quaternion(), one = new THREE.Quaternion();
  for (const c of clips) {
    c.tracks = c.tracks.filter((t) => !(info.has(t.name.slice(0, t.name.lastIndexOf('.'))) && !t.name.endsWith('.quaternion')));
    const byBone = new Map(c.tracks.filter((t) => t.name.endsWith('.quaternion')).map((t) => [t.name.slice(0, -11), t]));
    const middles = new Map();          // a finger's middle-joint bends, key by key (its last joint follows them)
    const order = [...byBone.keys()].filter((b) => info.has(b)).sort((a, b) => info.get(a).k - info.get(b).k);
    for (const bone of order) {
      const I = info.get(bone), t = byBone.get(bone), v = t.values;
      for (let i = 0, key = 0; i < v.length; i += 4, key++) {
        q.fromArray(v, i);
        if (I.f === 'Thumb') {                               // the thumb: eased a little toward its idle (the library curls it hard), and a little of the clip's motion from there
          const easy = thumbIdle.get(bone) || I.rest, idleQ = first(bone) || I.rest;
          dq.copy(idleQ).invert().multiply(q);
          if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w);
          hq.copy(easy).multiply(one.identity().slerp(dq, 0.35)).toArray(v, i);
          continue;
        }
        const j = I.k - 2;                                   // (0 the knuckle, 1 the middle joint, 2 the last; the palm's bone stays)
        if (j < 0) { I.rest.toArray(v, i); continue; }
        let a = REST_CURL[I.f][j] * DEG + TAKE[j] * (bend(I, q) - (base.get(bone) ?? 0));
        a = Math.max(-8 * DEG, Math.min(MAX_CURL[j] * DEG, a));
        if (j === 1) (middles.get(I.f) || middles.set(I.f, []).get(I.f))[key] = a;
        if (j === 2) { const m = middles.get(I.f)?.[key]; if (m != null) a = Math.min(MAX_CURL[2] * DEG, Math.max(a, 0.66 * m)); }
        hq.setFromAxisAngle(I.hinge, a);
        sq.setFromAxisAngle(I.spread, j === 0 ? I.spreadDeg * DEG * I.toward : 0);
        hq.premultiply(sq).premultiply(I.rest).toArray(v, i);
      }
    }
  }
}

/** Where a model's finger joints belong: for each finger bone, the point along its parent where the
 * skin hands over from the one to the other (the vertices about half and half). Bind space; worked out
 * once for each model (from its body's skin). */
function fingerJoints(mesh) {
  const g = mesh.geometry;
  if (g.userData.fingerJoints) return g.userData.fingerJoints;
  const sk = mesh.skeleton, at = new Map(sk.bones.map((b, i) => [b.name, i]));
  const bind = (n) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[at.get(n)]).invert());
  const P = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const out = {}, v = new THREE.Vector3();
  for (const side of ['L', 'R']) {
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) {
      const chain = (f === 'Thumb' ? [1, 2, 3] : [1, 2, 3, 4]).map((k) => f + k + side).filter((n) => at.has(n));
      for (let c = 1; c < chain.length; c++) {
        const A = at.get(chain[c - 1]), B = at.get(chain[c]);
        const a = out[chain[c - 1]] || bind(chain[c - 1]), b = bind(chain[c]), dir = b.clone().sub(bind(chain[c - 1])).normalize();
        const ss = [];
        for (let i = 0; i < P.count; i++) {
          let wa = 0, wb = 0;
          for (let k = 0; k < 4; k++) { const s = si.getComponent(i, k), w = sw.getComponent(i, k); if (s === A) wa += w; else if (s === B) wb += w; }
          if (wa > 0.08 && wb > 0.08 && Math.abs(wa - wb) < 0.4) ss.push(v.fromBufferAttribute(P, i).applyMatrix4(mesh.bindMatrix).sub(a).dot(dir));
        }
        if (ss.length < 4) continue;
        ss.sort((x, y) => x - y);
        const s = ss[ss.length >> 1];
        const len = b.clone().sub(a).dot(dir);
        if (s > 0.25 * len && s < 1.05 * len) out[chain[c]] = a.clone().addScaledVector(dir, s);
      }
    }
  }
  return (g.userData.fingerJoints = out);
}

/** The villagers' skin (head and body: V_Skin_*) a little less orange than its pictures paint it, as
 * the first-person arms' skin is (the world's warm light deepens it further): a quarter of its
 * colour greyed out, in the shader, once for each material; and on the hands, their tone (bmTone:
 * fitHands) — nails paler, shade between the fingers and in the palm. */
function skinTone(m) {
  if (!m || Array.isArray(m) || !/^V_Skin/.test(m.name || '') || m.userData.toned) return;
  m.userData.toned = true;
  if (WEBGPU) {
    // TSL: the colour (its map crisp, as crisp() would make it, greyed and toned) and the light it
    // ends with (greyed where faint, before the fog), on the material three keeps for them
    m.colorNode = skinColor(m.map);
    m.setupLighting = skinLighting;   // (copied onto the node material three draws it with)
    keyed(m, 'bm-skin');
    return;
  }
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float bmTone;\nvarying float vBmTone;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBmTone = bmTone;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBmTone;').replace('#include <map_fragment>',
      '#include <map_fragment>\n\tdiffuseColor.rgb = mix( diffuseColor.rgb, vec3( dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) ) ), 0.27 );\n\tdiffuseColor.rgb *= 1.0 + vBmTone * mix( vec3( 1.0 ), vec3( 0.8, 1.0, 1.1 ), step( 0.0, vBmTone ) );')
      // (in shadow skin goes grey, not orange-brown: what's lit faintly is greyed by up to a third)
      .replace('#include <opaque_fragment>', 'outgoingLight = mix( outgoingLight, vec3( dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) ) ), 0.32 * ( 1.0 - smoothstep( 0.06, 0.3, dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) ) ) ) );\n#include <opaque_fragment>');
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + '|bm-skin';
  m.needsUpdate = true;
}

// (WebGPU) the skin's colour, one graph for every skin material (per kind of map): its map sampled
// crisp, times its colour, a quarter greyed, times the hands' tone (bmTone; 0 where a body has none)
const _skin = new Map();
function skinColor(map) {
  const k = map ? 'map|' + map.colorSpace + '|' + map.type : 'none';
  if (_skin.has(k)) return _skin.get(k);
  const { Fn, uv, dFdx, dFdy, attribute, float, vec3, vec4, dot, mix, step } = T;
  let tex = null;
  if (map) {
    const u = uv();
    tex = sharpGrad(shared((mat) => mat.map, map), u, dFdx(u), dFdy(u));
    tex.onObjectUpdate((f) => sourceOf(f).map || undefined);   // (the sample follows the material too)
  }
  const tone = Fn((builder) => (builder.geometry?.hasAttribute('bmTone') ? attribute('bmTone', 'float') : float(0)))();
  const g = Fn(() => {
    const b = (tex || vec4(1)).toVar();
    const c = b.rgb.mul(ref('color', 'color')).toVar();
    c.assign(mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))), 0.27));
    const t = tone.toVar();
    c.mulAssign(t.mul(mix(vec3(1.0), vec3(0.8, 1.0, 1.1), step(0.0, t))).add(1.0));
    return vec4(c, b.a);
  })();
  _skin.set(k, g);
  return g;
}

/** (WebGPU) The skin's light as it leaves (setupLighting, on the node material three makes of the
 * skin's): in shadow, grey, not orange-brown — what's lit faintly greyed by up to a third. */
function skinLighting(builder) {
  const { vec3, dot, mix, smoothstep } = THREE.TSL;
  const out = Object.getPrototypeOf(this).setupLighting.call(this, builder);
  const l = dot(out, vec3(0.299, 0.587, 0.114));
  return mix(out, vec3(l), smoothstep(0.06, 0.3, l).oneMinus().mul(0.32));
}

/** A villager's own hands, once each (their bones and binds are their own; the meshes are shared, and
 * smoothed and toned once each): each finger joint moved to where the skin hands over (fingerJoints),
 * so it bends at its knuckle; the fingers a little fuller across; unless gauntlets cover them (they're
 * bound to the bones as they were). The hands' faceted normals smoothed, and their tone. */
function fitHands(model, bare) {
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  let body = null;
  const skels = new Set();
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    skels.add(o.skeleton);
    if (o.material?.name === 'V_Skin_Body') body = o;
    const g = o.geometry;
    if (g.userData.handsSmoothed || !g.attributes.normal || !g.attributes.skinIndex) return;
    g.userData.handsSmoothed = true;
    const names = o.skeleton.bones.map((b) => b.name);
    const hand = new Set(names.map((n, i) => (/^(Wrist|Index|Middle|Ring|Pinky|Thumb)/.test(n) ? i : -1)).filter((i) => i >= 0));
    const P = g.attributes.position, N = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, at = new Map();
    const tone = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) {
      let h = 0, top = 0, topW = 0;
      for (let k = 0; k < 4; k++) {
        const s = si.getComponent(i, k), w = sw.getComponent(i, k);
        if (hand.has(s)) h += w;
        if (w > topW) { topW = w; top = s; }
      }
      if (h < 0.5) continue;
      const key = `${P.getX(i).toFixed(5)},${P.getY(i).toFixed(5)},${P.getZ(i).toFixed(5)}`;
      if (!at.has(key)) at.set(key, []);
      at.get(key).push(i);
      // the tone: pale at the fingertips' backs (the nails), shade where two fingers' bones share it (between them)
      const nm = names[top] || '';
      if (/^(Index|Middle|Ring|Pinky)4/.test(nm)) tone[i] = 0.09;
      else if (/^Thumb3/.test(nm)) tone[i] = 0.06;
      let fingers = new Set();
      for (let k = 0; k < 4; k++) { const n = names[si.getComponent(i, k)] || ''; const f = n.match(/^(Index|Middle|Ring|Pinky)[2][LR]/); if (f && sw.getComponent(i, k) > 0.12) fingers.add(f[1]); }
      if (fingers.size > 1) tone[i] = -0.14;
    }
    const n = new THREE.Vector3();
    for (const ids of at.values()) {
      if (ids.length < 2) continue;
      n.set(0, 0, 0);
      for (const i of ids) n.x += N.getX(i), n.y += N.getY(i), n.z += N.getZ(i);
      n.normalize();
      for (const i of ids) N.setXYZ(i, n.x, n.y, n.z);
    }
    N.needsUpdate = true;
    g.setAttribute('bmTone', new THREE.BufferAttribute(tone, 1));
  });
  if (!bare || !body) return;
  const J = fingerJoints(body), full = new THREE.Matrix4().makeScale(1.08, 1, 1.08);
  const bindOf = (s, i) => new THREE.Matrix4().copy(s.boneInverses[i]).invert();
  const body0 = body.skeleton, at0 = new Map(body0.bones.map((b, i) => [b.name, i]));
  for (const side of ['L', 'R']) {
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) {
      const chain = (f === 'Thumb' ? [1, 2, 3, '3_end'] : [1, 2, 3, 4, '4_end']).map((k) => typeof k === 'number' ? f + k + side : f + k.replace('_end', '') + side + '_end');
      // the chain's binds, old and new, in the body's bind space (the ends keep where they were)
      const oldW = {}, newW = {};
      for (const n of chain) {
        const i = at0.get(n);
        if (i == null) continue;
        oldW[n] = bindOf(body0, i);
        newW[n] = oldW[n].clone();
        if (J[n]) newW[n].setPosition(J[n]);
      }
      // each bone's rest place under its parent, from the new binds
      for (let c = 1; c < chain.length; c++) {
        const n = chain[c], p = chain[c - 1], b = bones[n];
        if (!b || !newW[p]) continue;
        const wpos = newW[n] ? new THREE.Vector3().setFromMatrixPosition(newW[n]) : b.getWorldPosition(new THREE.Vector3());
        if (!newW[n]) continue;
        b.position.copy(wpos.applyMatrix4(newW[p].clone().invert()));
      }
      // every skeleton bound as the body is: its inverse binds moved with them, the fingers a little fuller
      const was = Object.fromEntries(chain.filter((n) => at0.has(n)).map((n) => [n, body0.boneInverses[at0.get(n)].clone()]));
      for (const s of skels) {
        for (const n of chain) {
          const i = s.bones.findIndex((x) => x.name === n), i0 = at0.get(n);
          if (i < 0 || i0 == null || !newW[n]) continue;
          if (s !== body0 && !s.boneInverses[i].equals(was[n])) continue;
          const inv = newW[n].clone().invert();
          if (!/_end$/.test(n) && !/^(Index|Middle|Ring|Pinky|Thumb)1/.test(n)) inv.premultiply(full);
          s.boneInverses[i] = inv;
        }
      }
    }
  }
}

// ====================================================================== speech bubbles
/** Velscour's parchment bubbles (townspeech.js), anchored over each speaker's head in 3D and drawn
 * on a full-resolution canvas laid over the (pixelated) picture, so the words stay crisp. Smaller
 * with distance, hidden behind walls, stepping aside for each other. */
class Bubbles {
  constructor() {
    const c = this.canvas = document.createElement('canvas');
    c.className = 'bubbles';   // (hidden under the title screen: index.html)
    Object.assign(c.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    const game = document.getElementById('game');
    if (game && game.parentNode) game.parentNode.insertBefore(c, game.nextSibling); else document.body.appendChild(c);
    this.g = c.getContext('2d');
    this.shown = false;
    this.cinema = null;   // { who, camera }: a scene's one speaker (the opening's knight), shown alone, from its camera, even while hidden
  }

  draw(vill, camera, markOf = null, extra = null) {
    const c = this.canvas, g = this.g, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const cine = this.cinema;
    if (cine?.camera) camera = cine.camera;
    const talking = cine ? (cine.who?.talk && cine.who.root?.visible !== false ? [cine.who] : []) : this.hidden ? [] : vill.list.filter((a) => a.talk && !a.talk.hidden && !a.inside && a.root.visible && a.head);
    if (!cine && !this.hidden && extra) for (const a of extra()) if (a.talk && !a.talk.hidden && a.root?.visible !== false) talking.push(a);
    const marked = markOf && !this.hidden && !cine ? vill.list.filter((a) => !a.inside && a.root.visible && a.head && (a.mark = markOf(a))) : [];
    if (!talking.length && !marked.length) { if (this.shown) { g.clearRect(0, 0, W, H); this.shown = false; } return; }
    g.clearRect(0, 0, W, H); this.shown = true;
    camera.getWorldPosition(_w);
    for (const a of marked) this.mark(g, a, camera, vill, dpr, W, H);
    const items = [];
    for (const a of talking) {
      if (a.speechAt) a.speechAt(_v); else { a.head.getWorldPosition(_v); _v.y += 0.36; }
      let dist = _v.distanceTo(_w);
      if (cine) dist = Math.min(dist, 8);   // (a scene's speaker: always shown, never behind a wall)
      else if (dist > SHOW) continue;
      // behind a wall, or the lie of the ground (a crater's rim, a hill)? (checked a few times a second)
      if (!cine && !((a.occT = (a.occT ?? 0) - 1 / 60) > 0)) {
        a.occT = 0.25;
        _d.copy(_v).sub(_w).normalize();
        const hit = vill.physics.ray ? vill.physics.ray(_w, _d, dist) : null;
        let hid = !!(hit && hit.t < dist - 0.6);
        // (the ground's only in the way out of doors: both of you above it, not down in the undercroft)
        const G = vill.physics.groundAt?.bind(vill.physics), outside = G && _w.y > G(_w.x, _w.z) - 0.3 && _v.y > G(_v.x, _v.z) - 0.3;
        for (let s = 0.12; s < 0.94 && !hid && outside; s += 0.08) {
          const k = dist * s;
          if (G(_w.x + _d.x * k, _w.z + _d.z * k) > _w.y + _d.y * k + 0.05) hid = true;
        }
        a.occluded = hid;
      }
      if (!cine && a.occluded) continue;
      const p = _v.clone().project(camera);
      if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.2 || Math.abs(p.y) > 1.3) continue;
      items.push({ a, x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, dist });
    }
    items.sort((p, q) => p.dist - q.dist);
    const placed = [];
    for (const it of items) this.bubble(g, it, dpr, placed);
  }

  /** A quest mark over someone's head: a yellow ! (work for you), a yellow ? (come back, it's done)
   * or a grey ? (under way), standing up off the head, bobbing a little, hidden behind walls. */
  mark(g, a, camera, vill, dpr, W, H) {
    a.head.getWorldPosition(_v); _v.y += 0.62 + Math.sin(vill.time * 2.4 + a.pos.x) * 0.04;
    const dist = _v.distanceTo(_w);
    if (dist > 70) return;
    if ((a.markT = (a.markT ?? 0) - 1 / 60) <= 0) {
      a.markT = 0.3;
      _d.copy(_v).sub(_w).normalize();
      const hit = vill.physics.ray ? vill.physics.ray([_w.x, _w.y, _w.z], [_d.x, _d.y, _d.z], dist) : null;
      a.markHidden = !!(hit && hit.t < dist - 0.6);
    }
    if (a.markHidden) return;
    const p = _v.clone().project(camera);
    if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return;
    const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
    const s = dpr * Math.max(0.5, Math.min(1.6, 9 / Math.max(dist, 1)));
    const glyph = a.mark === '!' ? '!' : '?', grey = a.mark === 'g';
    g.save();
    g.font = `900 ${Math.round(34 * s)}px "Cinzel Decorative", Cinzel, Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    if (!grey) { g.shadowColor = 'rgba(255, 200, 40, 0.85)'; g.shadowBlur = 14 * s; }
    g.lineWidth = 4 * s; g.strokeStyle = grey ? '#2a2620' : '#3a2204';
    g.strokeText(glyph, x, y);
    g.fillStyle = grey ? '#9a958c' : '#ffd21a';
    g.fillText(glyph, x, y);
    g.shadowBlur = 0;
    if (!grey) { g.fillStyle = 'rgba(255, 250, 200, 0.55)'; g.fillText(glyph, x - 1.2 * s, y - 1.2 * s); }
    g.restore();
  }

  bubble(g, { a, x, y, dist }, dpr, placed) {
    const t = a.talk, k = Math.min(1, t.age / 0.18), fade = Math.min(1, t.t / 0.35);
    // (big enough to read at a distance: a larger hand, a wider sheet, five lines a page)
    const s = dpr * Math.max(0.82, Math.min(1.25, Math.pow(7 / Math.max(dist, 1), 0.45)));
    g.save();
    g.globalAlpha = Math.min(k, fade) * Math.max(0.5, Math.min(1, (SHOW - dist) / 5));
    const fs = 19 * s;
    g.font = `600 ${fs}px "Alegreya Sans", "Segoe UI", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const maxW = 340 * s, lines = [];
    let line = '';
    for (const word of String(t.text).split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (line && g.measureText(next).width > maxW - 28 * s) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length > 5) { lines.length = 5; lines[4] += '…'; }
    const lh = fs * 1.2, w = Math.min(maxW, Math.max(70 * s, ...lines.map((l) => g.measureText(l).width + 30 * s)));
    const h = lines.length * lh + 14 * s;
    let bx = x - w / 2, by = y - h - 12 * s + (1 - k) * 8 * s;
    // step aside for bubbles already placed (Velscour's offsets)
    const offs = [[0, 0], [-0.3, -0.1], [0.3, -0.1], [0, -1.1], [-0.6, -0.2], [0.6, -0.2], [-0.35, -1.15], [0.35, -1.15]];
    const hits = (X, Y) => placed.some(([l, tp, r, b]) => X < r + 6 && X + w > l - 6 && Y < b + 6 && Y + h > tp - 6);
    const [ox, oy] = offs.find(([dx, dy]) => !hits(bx + dx * w, by + dy * h)) || [0, 0];
    bx = Math.round(bx + ox * w); by = Math.round(by + oy * h);
    placed.push([bx, by, bx + w, by + h + 10 * s]);
    const r = 9 * s;
    const round = (x0, y0, ww, hh, rr) => {
      g.beginPath(); g.moveTo(x0 + rr, y0); g.lineTo(x0 + ww - rr, y0); g.quadraticCurveTo(x0 + ww, y0, x0 + ww, y0 + rr);
      g.lineTo(x0 + ww, y0 + hh - rr); g.quadraticCurveTo(x0 + ww, y0 + hh, x0 + ww - rr, y0 + hh); g.lineTo(x0 + rr, y0 + hh);
      g.quadraticCurveTo(x0, y0 + hh, x0, y0 + hh - rr); g.lineTo(x0, y0 + rr); g.quadraticCurveTo(x0, y0, x0 + rr, y0); g.closePath();
    };
    // soft shadow, a double-trimmed parchment and a tail down to the speaker
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 7 * s; g.shadowOffsetY = 2 * s;
    g.fillStyle = '#19100d'; round(bx - 3 * s, by - 3 * s, w + 6 * s, h + 6 * s, r + 2 * s); g.fill();
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
    const [rim, paper, ink, rule] = t.toYou ? ['#d8b870', '#f6e8c6', '#2a1a0e', '#8a6a3a'] : ['#bb9360', '#f0dfbc', '#302115', '#7b573b'];
    g.fillStyle = rim; round(bx - 1 * s, by - 1 * s, w + 2 * s, h + 2 * s, r + 1 * s); g.fill();
    g.fillStyle = paper; round(bx + 1 * s, by + 1 * s, w - 2 * s, h - 2 * s, r); g.fill();
    g.strokeStyle = rule; g.lineWidth = 0.9 * s; round(bx + 3 * s, by + 3 * s, w - 6 * s, h - 6 * s, r - 1 * s); g.stroke();
    const baseX = Math.max(bx + 16 * s, Math.min(bx + w - 16 * s, x)), bottom = by + h, tip = y - 2 * s;
    g.fillStyle = '#19100d'; g.beginPath(); g.moveTo(baseX - 8 * s, bottom - 2 * s); g.lineTo(baseX + 8 * s, bottom - 2 * s); g.lineTo(x, tip); g.closePath(); g.fill();
    g.fillStyle = paper; g.beginPath(); g.moveTo(baseX - 5 * s, bottom - 4 * s); g.lineTo(baseX + 5 * s, bottom - 4 * s); g.lineTo(x, tip - 2 * s); g.closePath(); g.fill();
    g.fillStyle = ink;
    for (let i = 0; i < lines.length; i++) g.fillText(lines[i], bx + w / 2, by + 7 * s + lh * (i + 0.5));
    // their name, small, on the rim
    g.font = `italic 600 ${fs * 0.72}px "Alegreya Sans", "Segoe UI", sans-serif`;
    g.fillStyle = '#8a6a3a'; g.textAlign = 'left';
    g.fillText((a.speaker || a.name) + (t.pages && t.pages.length > 1 ? `  ${t.pi + 1}/${t.pages.length}` : ''), bx + 9 * s, by - 7 * s);
    g.restore();
  }
}
