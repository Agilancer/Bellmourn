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
import { speak, tickTalk } from './speech.js';
import { voice } from './voice.js';
import { MORE_BARKS, MORE_GREETS, MORE_SITUATIONAL as MS } from './lines/barks.js';
import { MORE_CHATS } from './lines/chats.js';

// (the town's words, and the many more in lines/: what they mutter, greet you with, and say at dusk,
// in flight, at prayer, at the well and the stalls)
CHATS.push(...MORE_CHATS.filter((c) => !c.tags.includes('trio')));   // (the scenes seat two: the trios wait for a third)
for (const [k, v] of Object.entries(MORE_BARKS)) BARKS[k] = [...(BARKS[k] || []), ...v];
for (const [k, v] of Object.entries(MORE_GREETS)) GREETS[k] = [...(GREETS[k] || []), ...v];
DUSK.push(...MS.dusk, ...MS.night); FLEE.push(...MS.flee); PRAY.push(...MS.pray); WELL.push(...MS.well); SHOPPING.push(...MS.shopping.map((s) => [[s]]));   // (a stall's exchanges are lists of lines)
import { SACRED_CHATS, GARRISON_CHATS, SACRED_GREETS, SACRED_TALK, SACRED_BARKS, HUSH } from './tessariel.js';
import { GIVERS } from './quests.js';
import { TOUCH } from './input.js';
import { loadUal, ualBody, RECIPES, CALM, LOOPING, VILLAGER_BONES } from './ual.js';
import { cullable, shareSkeletons } from './engine.js';

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
        return { ...made, clips: [...made.clips, ...g.animations.filter((c) => !have.has(c.name))] };
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
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
      if (c.isBone && c.name === 'Head') head = c;
    });
    // one skeleton for all thirteen-odd parts of them, culled to what can be seen (engine.js)
    shareSkeletons(model);
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

  /** a says text (paged into more bubbles if it's long, and aloud in their own voice). */
  say(a, text, toYou = false) {
    return speak(a, text, toYou, { voice: this.voiceOf(a) });
  }

  /** How a villager sounds (voice.js). */
  voiceOf(a) {
    return { key: a.name, sex: /_f\d/.test(a.m) ? 'f' : 'm', kind: 'villager', age: a.tags?.includes('old') ? 'old' : a.tags?.includes('young') ? 'young' : null, pos: a.pos };
  }

  near(a, player) { return player && Math.hypot(player.pos.x - a.pos.x, player.pos.z - a.pos.z) < NEAR; }

  talkingNear(player) { return this.list.filter((q) => q.talk && q.talk.t > 0.15 && !q.inside && this.near(q, player)).length; }

  canSpeak(a, priority = 0) {
    if (this.time < QUIET) return false;
    const p = this.player;
    if (!this.near(a, p)) return true;   // out of earshot: free
    const n = this.talkingNear(p);
    return priority ? n < 3 : n < 2 && this.time >= this.nextAmbient;
  }

  /** A line in a scene: waits for a speech slot (giving up after `patience` s: acted out silently). */
  * line(a, text, priority = 0, patience = 6) {
    let waited = 0;
    while (!this.canSpeak(a, priority) && waited < patience) { waited += 0.25; yield 0.25; }
    if (waited >= patience) { yield 1.2; return; }
    const dur = this.say(a, text);
    this.nextAmbient = this.time + 0.9;
    yield dur + 0.25;
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
      else if ((s.wait -= dt) > 0) continue;
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
    if (r < 0.58 && partner) return this.run(this.chat([a, partner]), [a, partner]);
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

  talkTo(a, player) {
    if (a.gathered) return;   // (at the edge of town after the green star: they're already talking to you)
    this.stopScenes(a);
    a.busy = true; a.greeted = this.time;
    const self = this;
    this.run((function* () {
      self.face(a, player);
      yield 0.2;
      if (chance(0.4)) self.gesture(a, 'wave');
      // Garrow the smith, the first time: he gives you his son's great sword
      if (a.name === 'Garrow' && self.onGift && !self.gave('garrowsoath')) {
        a.talk = null;
        for (const ln of GARROW_GIFT) { const d = self.say(a, ln, true); yield d + 0.3; }
        if (chance(0.6)) self.gesture(a, 'wave');
        self.onGift('garrowsoath', a);
        return;
      }
      const lines = a.garrison ? SACRED_TALK.velscour : [...SACRED_TALK.any, ...a.tags.flatMap((t) => (t === 'velscour' ? [] : SACRED_TALK[t] || []))];
      a.talk = null;
      const d = self.say(a, pick(lines), true);
      yield d + 0.4;
    })(), [a]);
  }

  /** After the green star: the village gathered on the meadow at the edge of town, well back from the
   * crater (nobody goes near the hole). `cast` [{name, at: [x, z]}] are put where they stand (main
   * does it in the black, so they've been there a while), facing `look` [x, z], the crater. Till you
   * come to them they talk among themselves about the man who fell out of the sky (`chatter`
   * [{name, text}], in turn and round again), and call out when you climb out of it (`sight`, once
   * out(player)); once you're within `near` m of them they turn to you, and `script` [{name, text,
   * gift, wave}] is said in turn, each to you (they wait whenever you walk off), onGift(gift, who)
   * as each gives theirs; onDone() after the last line. False if none of them is here. */
  gather(player, cast, { look, chatter, sight, script, out, near = 9, onGift, onDone }) {
    const people = cast.map((c) => ({ ...c, a: this.list.find((v) => v.name === c.name) })).filter((c) => c.a);
    if (!people.length) return false;
    const self = this, id = (this.gatherId = (this.gatherId || 0) + 1);   // (a new game's gathering ends the last one: it gives nothing then)
    const mid = [people.reduce((s, c) => s + c.at[0], 0) / people.length, people.reduce((s, c) => s + c.at[1], 0) / people.length];
    const far = () => Math.hypot(player.pos.x - mid[0], player.pos.z - mid[1]);
    for (const c of people) {
      this.stopScenes(c.a);
      Object.assign(c.a, { inside: false, flee: 0, headingHome: false, hurry: false, path: [], goal: null, talk: null, gesture: 0 });
      c.a.root.visible = true;
      c.a.pos.set(c.at[0], 0, c.at[1]);
      c.a.pos.y = this.physics.floorAt(c.at[0], c.at[1], 5, 0.25, 9);
      this.face(c.a, look[0] + rand(-4, 4), look[1] + rand(-4, 4));
      c.a.yaw = c.a.faceTo;
    }
    // a line: the speaker turns to `to` (you, or the crater), the rest to the speaker (or, once
    // they've seen you, to you)
    let seen = false;
    const speak = (ln, toYou) => {
      const c = people.find((q) => q.name === ln.name);
      if (!c) return 0;
      for (const q of people) {
        if (q === c) { if (toYou || seen) self.face(q.a, player); else self.face(q.a, look[0], look[1]); } else self.face(q.a, seen ? player : c.a);
      }
      if (ln.wave) self.gesture(c.a, 'wave');
      c.a.talk = null;
      return self.say(c.a, ln.text, toYou);
    };
    for (const c of people) c.a.gathered = true;   // (E on one of them doesn't break it up: talkTo)
    let given = 0, finished = false;
    this.run((function* () {
      try {
        // among themselves, watching the hole, till you come
        let i = 0;
        yield 1.5;
        while (far() > near) {
          if (!seen && out(player)) {
            seen = true;
            for (const ln of sight) { const d = speak(ln, false); yield d * 0.75 + 0.15; if (far() <= near) break; }
            continue;
          }
          const d = speak(chatter[i++ % chatter.length], false);
          yield d * 0.8 + rand(0.3, 0.9);
        }
        // you've come: they turn to you, and say it all in turn (waiting if you walk off)
        seen = true;
        for (const c of people) self.face(c.a, player);
        yield 0.5;
        for (const ln of script) {
          while (far() > near + 7) yield 0.25;
          const c = people.find((q) => q.name === ln.name);
          if (ln.gift) { given++; if (c) self.gesture(c.a, 'interact'); }
          if (!c) { if (ln.gift) onGift?.(ln.gift, null); continue; }
          const d = speak(ln, true);
          if (ln.gift) onGift?.(ln.gift, c.a);
          yield d + 0.35;
        }
        finished = true;
        onDone?.();
        yield 1;
      } finally {
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

  /** Call off the gathering after the green star (a new game, or a save loaded): they go about their
   * day, and give nothing more. */
  endGather() {
    this.gatherId = (this.gatherId || 0) + 1;
    for (const a of this.list) if (a.gathered) { a.gathered = false; this.stopScenes(a); }
  }

  /** Someone you come up to: they stop, turn to you, wave and say good day. */
  greet(a, player) {
    this.stopScenes(a);
    a.busy = true;
    const self = this;
    this.run((function* () {
      self.face(a, player);
      yield 0.25;
      self.gesture(a, 'wave');
      const lines = a.garrison ? [...GREETS.velscour, ...SACRED_GREETS.velscour]
        : chance(0.8) ? [...SACRED_GREETS.any, ...a.tags.flatMap((t) => SACRED_GREETS[t] || [])] : [...GREETS.any, ...a.tags.flatMap((t) => GREETS[t] || [])];
      let waited = 0;
      while (!self.canSpeak(a, 1) && waited < 3) { waited += 0.25; yield 0.25; }
      if (waited < 3) { a.talk = null; const d = self.say(a, pick(lines), true); yield d + 0.3; }
      yield 0.8;
    })(), [a]);
  }

  // ------------------------------------------------------------------ each frame
  update(dt, player, hour, danger) {
    this.time += dt; this.player = player;
    const night = this.night = hour < 6.2 || hour > 20.5;
    this.stepScenes(dt);
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
        a.inside = true; a.root.visible = false; a.busy = false; a.headingHome = false; a.flee = 0; a.talk = null; continue;
      }
      if (!goHome) a.headingHome = false;
      if (!goHome && a.busy && !this.scenes.some((s) => s.people.includes(a))) a.busy = false;   // a flight or a walk home called off
      // a free villager picks something to do
      if (!a.busy && !goHome && (a.nextT -= dt) <= 0) { this.pickRoutine(a); a.nextT = rand(0.5, 2.5); }
      // you come up to them, and they greet you
      if (!goHome && !this.hush && dist < 3.6 && this.time - a.greeted > 50 && this.time - this.greetT > 6 && !a.tending && !(a.talk && a.talk.t > 0) && !(a.busy && this.scenes.some((sc) => sc.people.includes(a) && sc.people.length > 2))) {
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
      } else if (a.faceTo != null) {
        let e = a.faceTo - a.yaw; while (e > Math.PI) e -= Math.PI * 2; while (e < -Math.PI) e += Math.PI * 2;
        a.yaw += Math.max(-dt * 3, Math.min(dt * 3, e));
      }
      a.pos.y = this.physics.floorAt(a.pos.x, a.pos.z, a.pos.y + 0.5, 0.25, 0.6);
      if (!Number.isFinite(a.pos.y)) a.pos.y = 0;
      if (a.gesture > 0 && !moving) a.gesture -= dt;
      else {
        if (moving) a.gesture = 0;
        const run = a.flee > 0 || a.hurry, gait = run ? 'run' : 'walk';
        if (moving) this.play(a, gait, a.gait?.[gait] ? Math.max(0.3, a.sp / a.gait[gait]) : run ? 1 : a.speed / 1.05);   // (the feet don't slide)
        else this.play(a, a.ual && a.talk && a.talk.t > 0 ? 'idle_talk' : a.rest);   // (talking with their hands while their words are up; some stand arms folded)
      }
      // speech ages
      if (a.talk) tickTalk(a, dt);
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
  }

  draw(vill, camera, markOf = null, extra = null) {
    const c = this.canvas, g = this.g, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const talking = this.hidden ? [] : vill.list.filter((a) => a.talk && !a.inside && a.root.visible && a.head);
    if (!this.hidden && extra) for (const a of extra()) if (a.talk && a.root?.visible !== false) talking.push(a);
    const marked = markOf && !this.hidden ? vill.list.filter((a) => !a.inside && a.root.visible && a.head && (a.mark = markOf(a))) : [];
    if (!talking.length && !marked.length) { if (this.shown) { g.clearRect(0, 0, W, H); this.shown = false; } return; }
    g.clearRect(0, 0, W, H); this.shown = true;
    camera.getWorldPosition(_w);
    for (const a of marked) this.mark(g, a, camera, vill, dpr, W, H);
    const items = [];
    for (const a of talking) {
      if (a.speechAt) a.speechAt(_v); else { a.head.getWorldPosition(_v); _v.y += 0.36; }
      const dist = _v.distanceTo(_w);
      if (dist > SHOW) continue;
      // behind a wall? (checked a few times a second)
      if (!((a.occT = (a.occT ?? 0) - 1 / 60) > 0)) {
        a.occT = 0.25;
        _d.copy(_v).sub(_w).normalize();
        const hit = vill.physics.ray ? vill.physics.ray(_w, _d, dist) : null;
        a.occluded = !!(hit && hit.t < dist - 0.6);
      }
      if (a.occluded) continue;
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
