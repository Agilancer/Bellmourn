// Quests, after the way World of Warcraft does them. Someone with a yellow ! over their head has
// work for you: speak with them (E) and they tell you about it; take it and the ! turns to a grey ?
// over their head (it's under way); finish it and the ? turns yellow (come back); hand it in and it's
// gone, unless they've more for you. Every quest says on the map where it's done, and what's under
// way can be followed in the tracker on the screen (T shows and hides it; the quest log, L, picks
// what it follows).
//
// The work: the dead of the Undercroft (as many as lie there: counted when you take it), the Ember
// Abbot in the Deep Undercroft, gravebloom from the graveyard, Velscour's dread knights on the downs,
// Sworn steel from their bodies, glowcaps from the Gloamhollow, the Trollhole's king, the Drowned
// Mother, Saint Ivo's reliquary from his barrow, the old watch's standard from its cellars, and in
// the end Velscour's Red Hand on his throne. Each pays in experience and coin, and in one of the
// village's treasures (uniques.js).
//
// Kills come in through onKill (every death in the world), things to gather lie about the world while
// they're wanted, and the bosses (champions: one of the dead grown huge) are raised when the quest is
// taken (and again when a game is loaded with it under way).
import * as THREE from 'three';
import { makeUnique } from './uniques.js';
import { makePotion, RARITY } from './gear.js';
import { tooltip } from './bag.js';
import { STAIRS, GRAVEYARD } from './world.js';
import { DELVES } from './delves.js';
import { glowTex } from './crater.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ---------------------------------------------------------------------- who gives work, and where they wait
// [x, z, which way they face] in front of (and beside) their doors, clear of the doorway
export const GIVERS = {
  Odile: { call: 'Sister Odile', post: [-5.5, -43.6, 0] },
  Hesk: { call: 'Mother Hesk', post: [34.0, -45.2, -Math.PI / 2] },
  Garrow: { call: 'Garrow', post: [-20.2, 20.6, Math.PI / 2] },
  Brand: { call: 'Sergeant Brand', post: [54.6, 35.2, Math.PI] },
  Hild: { call: 'Hild', post: [49.2, 35.2, Math.PI] },
  Idris: { call: 'Idris', post: [-20.6, -15.4, Math.PI / 2] },
  Tobias: { call: 'Tobias', post: [18.2, 20.6, -Math.PI / 2] },
  Osric: { call: 'Reeve Osric', post: [3.2, 31.8, Math.PI] },
  Wren: { call: 'Wren', post: [84, 7.5, -Math.PI / 2] },
};

// ---------------------------------------------------------------------- the quests
// objectives: kill {where, count ('all': as many as are there when it's taken)}, boss {champ},
// gather {item, count, spots}, drop {item, count, from}, fetch {item, at}, slay (a named one already
// in the world: Ser Malgrave)
export const QUESTS = [
  { id: 'undercroft', giver: 'Odile', title: 'The Dead Beneath the Bell', lvl: 1,
    text: (n) => `Sacred Flame. I have kept the Litany for forty years, and it says: "beneath the bell, the dead lie down." They do not lie down. They walk the Undercroft under our feet, and they knock at the floor at night. I went down with a lamp and counted them: ${n[0]}. Not one more, not one fewer. Go down through the office behind the pulpit and give them their rest. All ${n[0]}.`,
    brief: (n) => `Destroy all ${n[0]} of the dead in the Undercroft beneath the cathedral.`,
    wait: 'They are still down there. I can hear them through the stones.',
    done: 'The knocking has stopped. For the first time in a year the bell rang tonight on its own and I was not afraid. Take Bellwarden: it was cast from the first bell\'s clapper, and it was waiting for you.',
    objectives: [{ type: 'kill', where: 'undercroft', count: 'all', label: 'Dead of the Undercroft destroyed' }],
    map: 'undercroft', reward: { xp: 450, gold: 40, items: ['bellwarden'] } },
  { id: 'gravebloom', giver: 'Hesk', title: 'Gravebloom', lvl: 1,
    text: 'You will be hurt, dear. Flames get hurt. Gravebloom grows only on the graves behind the cathedral, white as milk, and glows a little at dusk. Bring me six and I\'ll make you draughts that put you back together. Mind the dead: they don\'t like their flowers picked.',
    brief: 'Gather 6 gravebloom from the graves in the graveyard behind the cathedral.',
    wait: 'Six, dear. White ones. The graveyard.', done: 'Lovely. Lovely. Here: draughts, and a ring I\'ve wound from the root. It pricks. That is how you know it works.',
    objectives: [{ type: 'gather', item: 'gravebloom', name: 'Gravebloom', count: 6, label: 'Gravebloom gathered', spots: 'graves' }],
    map: 'graveyard', reward: { xp: 300, gold: 15, items: ['thornring'], potions: [['life', 5]] } },
  { id: 'steel', giver: 'Garrow', title: 'Sworn Steel', lvl: 2,
    text: 'That armour in the crater is ruined, but the steel under it... Velscour\'s smiths know something I don\'t. Bring me four shards of Sworn steel, cut off his dread knights on the Green Downs east of the village, and I\'ll make you something that won\'t let go of a sword.',
    brief: 'Take 4 shards of Sworn steel from the dread knights on the Green Downs.',
    wait: 'Four shards. The dread knights carry it. They won\'t hand it over.', done: 'Look at the grain on that. Here, put your hands in these. Quenched in the oil of a dozen of their blades.',
    objectives: [{ type: 'drop', item: 'steel', name: 'Sworn steel', count: 4, from: 'knights', label: 'Shards of Sworn steel' }],
    map: 'downs', reward: { xp: 650, gold: 50, items: ['hammerfall'] } },
  { id: 'downs', giver: 'Brand', title: 'Dread on the Downs', lvl: 3, after: ['undercroft'],
    text: 'The Vigil\'s dread knights and their sorcerers march the Green Downs as if they owned them, between Millhaven, the windmill and the falls. Millhaven sends no bread any more. I\'ve two watchmen and a crossbow with no string. You came down out of the sky and killed one of them with your face. Kill eight more.',
    brief: 'Kill 8 of Velscour\'s dread knights and sorcerers on the Green Downs.',
    wait: 'Eight. Out east, past the Bellwood Trail.', done: 'Millhaven sent a cart this morning. A cart! Take the Wall of the Watch. I painted the V off it myself, years ago, when I still thought it would come back.',
    objectives: [{ type: 'kill', where: 'downs', count: 8, label: 'Dread knights and sorcerers slain' }],
    map: 'downs', reward: { xp: 750, gold: 80, items: ['wallofthewatch'] } },
  { id: 'cellars', giver: 'Hild', title: 'The Old Watch\'s Standard', lvl: 3, after: ['undercroft'],
    text: 'Before the Vigil turned, the old watch kept its standard in the cellars under its tower, south-east in the Darkwood. The tower\'s fallen and the cellars are full of the dead. Bring the standard home, and put down eight of whatever guards it. Brand won\'t say it, but he cries about that banner.',
    brief: 'Bring back the old watch\'s standard from the Old Watch Cellars, and destroy 8 of the dead there.',
    wait: 'The cellars are south-east, in the Darkwood. Follow the stair down.', done: 'Oh, it\'s still blue under the mould. Take these: the old watchmen\'s boots. They walked the walls in them every night for sixty years.',
    objectives: [{ type: 'fetch', item: 'standard', name: 'The old watch\'s standard', at: 'cellars', label: 'The old watch\'s standard' },
      { type: 'kill', where: 'cellars', count: 8, label: 'Dead of the cellars destroyed' }],
    map: 'cellars', reward: { xp: 800, gold: 60, items: ['striders'] } },
  { id: 'glowcap', giver: 'Idris', title: 'Lights of the Gloamhollow', lvl: 4, after: ['undercroft'],
    text: 'The Gloamhollow, in the cliff north of Brightwater Falls, grows glowcaps: mushrooms that give their own light, quite safely, mostly. I need six for a staff I have been meaning to make for someone exactly like you. The ghasts there are very fast. Do not let them be faster.',
    brief: 'Gather 6 glowcaps in the Gloamhollow, the cave north of Brightwater Falls.',
    wait: 'Six glowcaps. North of the falls, in the cliff. Bring a light. Well, you are one.', done: 'Perfect. Hold this. It is perfectly safe. I have no eyebrows for unrelated reasons.',
    objectives: [{ type: 'gather', item: 'glowcap', name: 'Glowcap', count: 6, label: 'Glowcaps gathered', spots: 'gloam' }],
    map: 'gloam', reward: { xp: 800, gold: 50, items: ['gloamstaff'] } },
  { id: 'grotto', giver: 'Tobias', title: 'The Drowned Mother', lvl: 5, after: ['undercroft'],
    text: 'My brother fished below Brightwater Falls. Something came up out of the Drowned Grotto beside it, big as a cart, white as a corpse, and pulled him in by the leg. They call it the Drowned Mother. The others in there are her children, if you believe that kind of thing. I didn\'t, before.',
    brief: 'Slay the Drowned Mother in the Drowned Grotto, beside Brightwater Falls.',
    wait: 'The Grotto opens in the cliff by the falls, a little south.', done: 'Then he can rest. Drinks are free for you for as long as I live, which, thanks to you, may be a while. And this was in her. He gave it to our mother, once.',
    objectives: [{ type: 'boss', champ: 'mother', label: 'The Drowned Mother slain' }],
    map: 'grotto', reward: { xp: 1000, gold: 100, items: ['pearl'] } },
  { id: 'barrow', giver: 'Osric', title: 'Saint Ivo\'s Reliquary', lvl: 5, after: ['undercroft'],
    text: 'The Barrow of Saint Ivo lies north-west in the Darkwood. His Testament says the Fiend upon his far throne shall know fear, and our grandparents buried that fear with him. Something sits his bone throne now, wearing his face. Bring his reliquary out of there, and if you meet what sits on that throne, see that it sits no longer.',
    brief: 'Slay the Wight of Saint Ivo and bring back the saint\'s reliquary from his barrow.',
    wait: 'North-west, in the Darkwood. A stair-house of grey stone.', done: 'His halo. Inside, all this time. Wear it, Flame: the Testament would want it on a head that will be raised against the Fiend.',
    objectives: [{ type: 'boss', champ: 'wight', label: 'The Wight of Saint Ivo slain' }, { type: 'fetch', item: 'reliquary', name: 'Saint Ivo\'s reliquary', at: 'barrow', label: 'Saint Ivo\'s reliquary' }],
    map: 'barrow', reward: { xp: 1100, gold: 90, items: ['halo'] } },
  { id: 'deep', giver: 'Odile', title: 'The Ember Abbot', lvl: 6, after: ['undercroft'],
    text: 'There is a second stair, in the Undercroft\'s stair hall, that goes down to the Deep Undercroft. The abbots of the cathedral were buried there. One of them has not stopped burning. Abbot Cindermaw swings his censer in the dark and the dead come to him like moths. Put him out, and twelve of his flock.',
    brief: 'Slay Abbot Cindermaw, the Ember Abbot, and destroy 12 of the dead in the Deep Undercroft.',
    wait: 'The Deep Undercroft: down the stair in the Undercroft\'s stair hall.', done: 'His censer. I remember it swinging at my confirmation. Carry it, and let it burn for the right side now.',
    objectives: [{ type: 'boss', champ: 'abbot', label: 'Abbot Cindermaw slain' }, { type: 'kill', where: 'deep', count: 12, label: 'Dead of the Deep Undercroft destroyed' }],
    map: 'undercroft', reward: { xp: 1300, gold: 120, items: ['censer'] } },
  { id: 'trollhole', giver: 'Wren', title: 'The Trollhole King', lvl: 7, after: ['downs'],
    text: 'Far up the eastern cliff, north of the falls, there\'s the Trollhole. My grandfather went in after its king with his good axe forty winters ago. The king\'s still there. So, I think, is the axe. Old Gnarlgut. He\'s bigger than you\'re thinking. Bigger than that.',
    brief: 'Slay Old Gnarlgut, the Trollhole King, in the Trollhole far north on the eastern cliff.',
    wait: 'North along the cliff, past the falls and the Gloamhollow.', done: 'That\'s Grandfather\'s axe. It was in him? Of course it was. Take it, it\'s Trollbane now. He\'d have liked you.',
    objectives: [{ type: 'boss', champ: 'king', label: 'Old Gnarlgut slain' }],
    map: 'troll', reward: { xp: 1300, gold: 150, items: ['trollbane'] } },
  { id: 'redhand', giver: 'Odile', title: 'The Red Hand of Velscour', lvl: 9, after: ['deep', 'downs', 'barrow'],
    text: 'Now you are ready, as ready as the Canticle allows. West along the Vigil Road is Blackvigil Keep, where the Sworn keep their vigil for the Demon Lord Velscour. On the Red Throne sits Ser Malgrave, the Red Hand, who hangs men for saying your name. The Book says the Fiend upon his far throne shall know fear. Begin with his hand.',
    brief: 'Slay Ser Malgrave, the Red Hand of Velscour, on the Red Throne of Blackvigil Keep.',
    wait: 'West, along the Vigil Road, to Blackvigil Keep. The Red Throne is at the end of its hall.', done: 'His hand is cut off. Now Velscour knows your name, and he will be afraid of it. This was struck from Malgrave\'s blade in the green fire you came down in. It is yours. It was always yours.',
    objectives: [{ type: 'slay', who: 'malgrave', label: 'Ser Malgrave, the Red Hand, slain' }],
    map: 'keep', reward: { xp: 2600, gold: 400, items: ['tessarielsbrand'] } },
];
const BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

// the champions: one of the dead grown huge, in its place below ground
const CHAMPS = {
  abbot: { name: 'Abbot Cindermaw, the Ember Abbot', variant: 'ember_husk', place: 'deep', scale: 1.55, hp: 9, dmg: 2.4, xp: 900, tint: [1.6, 0.7, 0.3] },
  mother: { name: 'The Drowned Mother', variant: 'bloated_drowner', place: 'grotto', tag: 'drowned', scale: 1.65, hp: 10, dmg: 2.5, xp: 950, tint: [0.7, 0.9, 1.1] },
  wight: { name: 'The Wight of Saint Ivo', variant: 'tomb_mummy', place: 'barrow', scale: 1.45, hp: 9, dmg: 2.4, xp: 900, tint: [1.2, 1.15, 0.7] },
  king: { name: 'Old Gnarlgut, the Trollhole King', variant: 'bog_troll', place: 'troll', tag: 'lair', scale: 1.7, hp: 12, dmg: 2.8, xp: 1200, tint: [0.8, 1.05, 0.7] },
};

// where each quest is done, for the map (above ground: the way in)
function places(ctx) {
  const cave = (n) => ctx.caves?.find((c) => c.name === n);
  const m = (c) => (c ? { x: c.mouth.x, z: c.mouth.z } : null);
  return {
    undercroft: { x: STAIRS.x, z: STAIRS.z, r: 0, name: 'The stair down, in the cathedral office' },
    graveyard: { x: (GRAVEYARD.x0 + GRAVEYARD.x1) / 2, z: (GRAVEYARD.z0 + GRAVEYARD.z1) / 2, r: 40, name: 'The graveyard' },
    downs: { x: 520, z: 30, r: 140, name: 'The Green Downs' },
    cellars: { x: DELVES[1].x, z: DELVES[1].z, r: 0, name: DELVES[1].name },
    barrow: { x: DELVES[0].x, z: DELVES[0].z, r: 0, name: DELVES[0].name },
    gloam: { ...m(cave('The Gloamhollow')), r: 0, name: 'The Gloamhollow' },
    grotto: { ...m(cave('The Drowned Grotto')), r: 0, name: 'The Drowned Grotto' },
    troll: { ...m(cave('The Trollhole')), r: 0, name: 'The Trollhole' },
    keep: { x: -262, z: 0, r: 0, name: 'The Red Throne, Blackvigil Keep' },
  };
}

// ---------------------------------------------------------------------- things to take up
const ITEM_LOOK = {
  gravebloom: { color: 0xe8fff0, glow: [0.6, 1.0, 0.75], shape: 'flower' },
  glowcap: { color: 0x60ffc0, glow: [0.3, 1.2, 0.8], shape: 'cap' },
  steel: { color: 0x40404a, glow: [1.0, 0.85, 0.4], shape: 'shard' },
  reliquary: { color: 0xd8a838, glow: [1.2, 1.0, 0.5], shape: 'box' },
  standard: { color: 0x2a4a9a, glow: [0.6, 0.8, 1.4], shape: 'banner' },
};
function itemModel(kind) {
  const L = ITEM_LOOK[kind], g = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({ color: L.color, emissive: L.color, emissiveIntensity: 0.35, shininess: 60 });
  if (L.shape === 'flower') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.32), new THREE.MeshLambertMaterial({ color: 0x3a6a3a }));
    stem.position.y = -0.16; g.add(stem);
    for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), mat); p.scale.set(1, 0.35, 0.55); p.position.set(Math.cos(i) * 0.07, 0, Math.sin(i) * 0.07); p.rotation.y = -i; g.add(p); }
  } else if (L.shape === 'cap') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat); g.add(cap);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.22), new THREE.MeshLambertMaterial({ color: 0xd8e8d0 })); st.position.y = -0.11; g.add(st);
  } else if (L.shape === 'shard') {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshPhongMaterial({ color: 0x4a4a54, specular: 0xffffff, shininess: 90 })); s.scale.set(0.5, 1.4, 0.3); g.add(s);
  } else if (L.shape === 'box') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.24), mat); g.add(b);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.36, 10, 1, false, 0, Math.PI), mat); lid.rotation.z = Math.PI / 2; lid.position.y = 0.13; g.add(lid);
  } else {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4), new THREE.MeshLambertMaterial({ color: 0x5a4028 })); g.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.7), new THREE.MeshLambertMaterial({ color: L.color, side: THREE.DoubleSide, emissive: 0x101830 })); cloth.position.set(0.29, 0.25, 0); g.add(cloth);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(...L.glow), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
  glow.scale.setScalar(0.9); g.add(glow);
  // a pale gold beam, so quest things show from across a room
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.07, 2.4, 6, 1, true).translate(0, 1.2, 0),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = -0.3; g.add(beam);
  g.userData.glow = glow;
  return g;
}

// ====================================================================== the quests' state and work
export class Quests {
  /** o: { ui, ctx, zombies, foes, villagers, sfx, char(), toast(text), onReward({xp, gold, items, potions}), onOpen(on) } */
  constructor(o) {
    this.o = o;
    this.ctx = o.ctx;
    this.state = {};            // id -> { s: 'active'|'ready'|'done', p: [progress], n: [needed], track }
    this.flags = { tracker: true };
    this.items = [];            // things lying about to be taken up
    this.champs = new Map();    // champ key -> the zombie
    this.group = new THREE.Group();
    o.ctx.scene.add(this.group);
    this.buildUi(o.ui);
    this.places = places(o.ctx);
  }

  // -------------------------------------------------------------- state
  get(id) { return this.state[id]; }
  status(id) { return this.state[id]?.s || (this.available(id) ? 'available' : 'locked'); }
  available(id) {
    const q = BY_ID[id];
    return !this.state[id] && (q.after || []).every((a) => this.state[a]?.s === 'done');
  }
  /** What a giver shows over their head: '!' (work to give), '?' (come back: done), 'g' (under
   * way), or null. */
  markOf(name) {
    const mine = QUESTS.filter((q) => q.giver === name);
    if (mine.some((q) => this.state[q.id]?.s === 'ready')) return '?';
    if (mine.some((q) => this.available(q.id))) return '!';
    if (mine.some((q) => this.state[q.id]?.s === 'active')) return 'g';
    return null;
  }
  /** Has this giver anything to say about work (to stay at their post for)? */
  business(name) { return !!this.markOf(name); }

  /** Save and load: what's under way and done, and how far. */
  save() { return { state: JSON.parse(JSON.stringify(this.state)), flags: { ...this.flags } }; }
  load(data) {
    for (const it of this.items) this.group.remove(it.obj);
    this.items = [];
    for (const z of this.champs.values()) if (!z.dead && !z.gone) { z.remove?.(); z.gone = true; }
    this.champs.clear();
    this.state = data?.state ? JSON.parse(JSON.stringify(data.state)) : {};
    this.flags = { tracker: true, ...(data?.flags || {}) };
    for (const id of Object.keys(this.state)) if (this.state[id].s === 'active') this.raise(id);
    this.refresh();
  }

  // -------------------------------------------------------------- taking, doing and handing in
  accept(id) {
    const q = BY_ID[id];
    if (!this.available(id)) return;
    const n = q.objectives.map((ob) => this.needed(ob));
    this.state[id] = { s: 'active', p: q.objectives.map(() => 0), n, track: true };
    this.raise(id);
    this.o.sfx?.quest(false);
    this.o.toast(`Quest taken: ${q.title}`);
    this.check(id);
    this.refresh();
  }

  abandon(id) {
    const st = this.state[id];
    if (!st || st.s === 'done') return;
    delete this.state[id];
    this.items = this.items.filter((it) => { if (it.quest === id) { this.group.remove(it.obj); return false; } return true; });
    this.o.toast(`Quest given up: ${BY_ID[id].title}`);
    this.refresh();
  }

  complete(id) {
    const q = BY_ID[id], st = this.state[id];
    if (!st || st.s !== 'ready') return;
    st.s = 'done';
    const items = (q.reward.items || []).map((u) => makeUnique(u)).filter(Boolean);
    const potions = (q.reward.potions || []).map(([k, c]) => makePotion(k, c));
    this.o.onReward({ xp: q.reward.xp, gold: q.reward.gold || 0, items: [...items, ...potions], title: q.title });
    this.o.sfx?.quest(true);
    this.o.toast(`Quest done: ${q.title}`);
    this.refresh();
  }

  /** How many an objective wants (a count of 'all' is everything of its kind there now). */
  needed(ob) {
    if (ob.type === 'kill') return ob.count === 'all' ? Math.max(1, this.o.zombies.list.filter((z) => !z.dead && !z.gone && this.matches(ob.where, z)).length) : ob.count;
    if (ob.type === 'gather' || ob.type === 'drop') return ob.count;
    return 1;
  }

  /** Is z one of the kind an objective wants? */
  matches(where, z) {
    const c = this.ctx, nm = z.dg?.name || '';
    switch (where) {
      case 'undercroft': return z.dg === c.dungeon;
      case 'deep': return z.dg === c.deep;
      case 'cellars': return nm === 'The Old Watch Cellars';
      case 'downs': return !!z.def && !z.def.body && (z.kindName === 'knight' || z.kindName === 'sorcerer');
      case 'knights': return !!z.def && z.kindName === 'knight';
      default: return false;
    }
  }

  /** Every death in the world comes through here. */
  onKill(z) {
    for (const [id, st] of Object.entries(this.state)) {
      if (st.s !== 'active') continue;
      const q = BY_ID[id];
      q.objectives.forEach((ob, i) => {
        if (st.p[i] >= st.n[i]) return;
        if (ob.type === 'kill' && this.matches(ob.where, z)) { st.p[i]++; this.progress(q, ob, st, i); }
        else if (ob.type === 'boss' && z.champ?.key === ob.champ) { st.p[i] = 1; this.progress(q, ob, st, i); }
        else if (ob.type === 'slay' && ob.who === 'malgrave' && z.def?.boss) { st.p[i] = 1; this.progress(q, ob, st, i); }
        else if (ob.type === 'drop' && this.matches(ob.from, z)) {
          const want = st.n[i] - st.p[i] - this.items.filter((it) => it.quest === id && it.obj_i === i).length;
          if (want > 0) this.drop(id, i, ob.item, z.pos.x, z.pos.y + 0.5, z.pos.z);
        }
      });
      this.check(id);
    }
    this.refresh();
  }

  progress(q, ob, st, i) {
    this.o.toast(`${ob.label}: ${Math.min(st.p[i], st.n[i])}/${st.n[i]}`);
  }

  /** All its objectives met: it's ready to hand in. */
  check(id) {
    const st = this.state[id];
    if (!st || st.s !== 'active') return;
    if (st.p.every((v, i) => v >= st.n[i])) {
      st.s = 'ready';
      this.o.sfx?.quest(true);
      this.o.toast(`${BY_ID[id].title}: done — return to ${GIVERS[BY_ID[id].giver].call}`);
    }
  }

  // -------------------------------------------------------------- what lies about, and the champions
  /** Put a quest's things and champions in the world (on taking it, or loading a game with it). */
  raise(id) {
    const q = BY_ID[id], st = this.state[id];
    q.objectives.forEach((ob, i) => {
      if (st.p[i] >= st.n[i]) return;
      if (ob.type === 'gather') {
        const spots = this.spots(ob.spots, ob.count + 2);
        for (const [x, y, z] of spots) this.drop(id, i, ob.item, x, y, z, true);
      } else if (ob.type === 'fetch') {
        const r = this.deepest(ob.at);
        if (r) this.drop(id, i, ob.item, r[0], r[1], r[2], true);
      } else if (ob.type === 'boss') this.champion(ob.champ);
    });
  }

  /** Spots for things to gather: beside graves, or about a cave's chambers. */
  spots(kind, n) {
    const out = [], Z = this.o.zombies;
    if (kind === 'graves') {
      for (let i = 0; i < n * 4 && out.length < n; i++) {
        const s = Z.graveSpot?.(null);
        if (s && !out.some((o) => Math.hypot(o[0] - s[0], o[2] - s[1]) < 6)) out.push([s[0], 0.4, s[1]]);
      }
    } else if (kind === 'gloam') {
      const cave = this.ctx.caves?.find((c) => c.name === 'The Gloamhollow');
      const tags = ['cavern', 'north', 'nest', 'south', 'warren', 'shrine', 'bones', 'loop', 'cavern', 'warren'];
      for (const t of tags) { if (out.length >= n) break; const p = cave?.spot(t, 1.0); if (p) out.push([p.x, p.y + 0.4, p.z]); }
    }
    return out;
  }

  /** The room furthest from a dungeon's way in (a spot on its floor), or a cave chamber. */
  deepest(place) {
    const dg = this.dungeonOf(place);
    if (!dg) return null;
    if (dg.spot) { const p = dg.spot(this.CAVE_TAG?.[place] || 'pool', 1); return p ? [p.x, p.y + 0.4, p.z] : null; }
    const rooms = dg.roomList, e = rooms[0], cx = (r) => (r.x0 + r.x1) / 2, cz = (r) => (r.z0 + r.z1) / 2;
    const far = rooms.reduce((a, r) => (Math.hypot(cx(r) - cx(e), cz(r) - cz(e)) > Math.hypot(cx(a) - cx(e), cz(a) - cz(e)) ? r : a), e);
    const P = this.ctx.physics;
    const fy = far.y ?? dg.y;      // (a room's own floor, where the place's floors aren't all one height)
    for (let t = 0; t < 40; t++) {
      const x = far.x0 + 1.5 + Math.random() * (far.x1 - far.x0 - 3), z = far.z0 + 1.5 + Math.random() * (far.z1 - far.z0 - 3);
      const f = P.floorAt(x, z, fy + 0.3, 0.3, 0.45);
      if (Math.abs(f - fy) < 0.1) return [x, fy + 0.45, z, far];
    }
    return [cx(far), fy + 0.45, cz(far), far];
  }

  dungeonOf(place) {
    const c = this.ctx, cave = (n) => c.caves?.find((q) => q.name === n);
    return { deep: c.deep, undercroft: c.dungeon, barrow: c.unders?.find((u) => u.dg.name === 'The Barrow of Saint Ivo')?.dg,
      cellars: c.unders?.find((u) => u.dg.name === 'The Old Watch Cellars')?.dg, grotto: cave('The Drowned Grotto'), troll: cave('The Trollhole'),
      gloam: cave('The Gloamhollow') }[place] || null;
  }

  /** Raise a champion (if it isn't up already). */
  champion(key) {
    const C = CHAMPS[key];
    const have = this.champs.get(key);
    if (have && !have.dead && !have.gone) return have;
    const dg = this.dungeonOf(C.place), Z = this.o.zombies;
    if (!dg || !Z.gltf[C.variant]) return null;
    let at;
    if (dg.bossSpot) at = [...dg.bossSpot];            // (a place that keeps its boss's tomb: he rises from it)
    else if (dg.spot) { const p = dg.spot(C.tag, 1.5); if (!p) return null; at = [p.x, p.y, p.z]; }
    else { const r = this.deepest(C.place); if (!r) return null; at = [r[0], r[1] - 0.45, r[2], r[3]]; }
    const z = Z.spawn(C.variant, at[0], at[2], { y: at[1], zone: 'dungeon', dg, room: at[3] || null, kind: 'runner', start: dg.bossSpot ? 'buried' : 'stand' });
    z.champion?.({ ...C, key });
    this.champs.set(key, z);
    return z;
  }

  /** Something to take up, lying at (x, y, z). */
  drop(quest, i, item, x, y, z, rest = false) {
    const obj = itemModel(item);
    const P = this.ctx.physics, f = P.floorAt(x, z, y + 0.3, 0.15, 3);
    const floor = Number.isFinite(f) ? f : y - 0.4;
    obj.position.set(x, rest ? floor + 0.45 : y, z);
    this.group.add(obj);
    this.items.push({ quest, obj_i: i, item, obj, floor, vy: rest ? 0 : 3, t: Math.random() * 6 });
  }

  /** Each frame: things to take up turn and glint, and come into the bag of quest things when
   * you walk over them; the tracker and the givers' marks follow. */
  update(dt, player) {
    const p = player.pos;
    for (let k = this.items.length - 1; k >= 0; k--) {
      const it = this.items[k], o = it.obj;
      it.t += dt;
      if (it.vy) { it.vy -= 10 * dt; o.position.y += it.vy * dt; if (o.position.y <= it.floor + 0.45) { o.position.y = it.floor + 0.45; it.vy = 0; } }
      else o.position.y = it.floor + 0.45 + Math.sin(it.t * 2) * 0.05;
      o.rotation.y += dt * 1.1;
      o.userData.glow.material.opacity = 0.45 + 0.25 * Math.sin(it.t * 3.4);
      if (Math.hypot(p.x - o.position.x, p.z - o.position.z) < 1.3 && Math.abs(p.y + 0.6 - o.position.y) < 1.8) {
        const st = this.state[it.quest];
        this.items.splice(k, 1); this.group.remove(o);
        if (!st || st.s !== 'active' || st.p[it.obj_i] >= st.n[it.obj_i]) continue;
        st.p[it.obj_i]++;
        const ob = BY_ID[it.quest].objectives[it.obj_i];
        this.o.sfx?.equip();
        this.o.toast(`${ob.name}: ${st.p[it.obj_i]}/${st.n[it.obj_i]}`);
        // a gathered set is complete: the spare ones wither
        if (st.p[it.obj_i] >= st.n[it.obj_i]) this.items = this.items.filter((q) => { if (q.quest === it.quest && q.obj_i === it.obj_i) { this.group.remove(q.obj); return false; } return true; });
        this.check(it.quest);
        this.refresh();
      }
    }
    this.flash = Math.max(0, (this.flash || 0) - dt);
  }

  /** The champion nearest you that's fighting you, for the boss bar. */
  bossBar(player) {
    for (const z of this.champs.values()) {
      if (z.gone) continue;
      const d = Math.hypot(z.pos.x - player.pos.x, z.pos.z - player.pos.z);
      if (d < 30 && Math.abs(z.pos.y - player.pos.y) < 5 && (z.aggro || z.dead)) {
        if (z.dead) { if ((z.deadT || 0) < 2.5) return { name: z.champ.name, frac: 0 }; continue; }
        return { name: z.champ.name, frac: Math.max(0, z.hp / z.champ.max) };
      }
    }
    return null;
  }

  /** Map pins: who has work (!/?) and where tracked work is done. */
  pins(villagers) {
    const out = [];
    for (const [name, g] of Object.entries(GIVERS)) {
      const mark = this.markOf(name);
      if (!mark) continue;
      const v = villagers?.list.find((a) => a.name === name);
      out.push({ kind: mark, x: v ? v.pos.x : g.post[0], z: v ? v.pos.z : g.post[1], label: g.call });
    }
    for (const [id, st] of Object.entries(this.state)) {
      if (st.s !== 'active' || !st.track) continue;
      const pl = this.places[BY_ID[id].map];
      if (pl && Number.isFinite(pl.x)) out.push({ kind: 'area', x: pl.x, z: pl.z, r: pl.r, label: BY_ID[id].title, sub: pl.name });
    }
    return out;
  }

  // -------------------------------------------------------------- the screen: tracker, log, the giver's words
  buildUi(ui) {
    this.tracker = el('div', 'qtrack');
    ui.querySelector('.hud')?.append(this.tracker);
    this.logEl = el('div', 'panel qlog hidden');
    ui.append(this.logEl);
    this.dlg = el('div', 'panel qdlg hidden');
    ui.append(this.dlg);
    this.tip = el('div', 'tt hidden');
    ui.append(this.tip);
  }

  get open() { return !this.logEl.classList.contains('hidden') || !this.dlg.classList.contains('hidden'); }
  close() { this.logEl.classList.add('hidden'); this.dlg.classList.add('hidden'); this.tip.classList.add('hidden'); this.o.hush?.(); this.o.onOpen?.(false); }

  /** The tracker on the screen: what's under way and being followed. */
  refresh() {
    const T = this.tracker;
    const list = Object.entries(this.state).filter(([, st]) => st.s !== 'done' && st.track);
    T.classList.toggle('hidden', !this.flags.tracker || !list.length);
    let h = '<div class="qt-head">Quests <span>T to hide · L for the log</span></div>';
    for (const [id, st] of list) {
      const q = BY_ID[id];
      h += `<div class="qt-q${st.s === 'ready' ? ' ready' : ''}"><b>${esc(q.title)}</b>`;
      if (st.s === 'ready') h += `<div class="qt-o done">Return to ${esc(GIVERS[q.giver].call)}</div>`;
      else q.objectives.forEach((ob, i) => { h += `<div class="qt-o${st.p[i] >= st.n[i] ? ' done' : ''}">${esc(ob.label)}: ${Math.min(st.p[i], st.n[i])}/${st.n[i]}</div>`; });
      h += '</div>';
    }
    if (T.dataset.h !== h) { T.dataset.h = h; T.innerHTML = h; }
    if (!this.logEl.classList.contains('hidden')) this.renderLog();
    this.o.onChange?.();
  }

  toggleTracker() {
    this.flags.tracker = !this.flags.tracker;
    this.o.toast(this.flags.tracker ? 'Quest tracker shown' : 'Quest tracker hidden');
    this.refresh();
  }

  rewardHtml(q) {
    const items = (q.reward.items || []).map((u) => makeUnique(u));
    let h = `<div class="q-rew"><div class="dim">Reward: <b class="xp">${q.reward.xp} experience</b>${q.reward.gold ? ` · <b class="gold">${q.reward.gold} gold</b>` : ''}${(q.reward.potions || []).map(([k, c]) => ` · ${c} ${k === 'life' ? 'healing' : 'mana'} draughts`).join('')}</div>`;
    items.forEach((it, i) => { h += `<div class="q-item" data-i="${i}" style="color:${RARITY[it.rarity].color}; border-color:${RARITY[it.rarity].color}">${esc(it.name)} <span class="dim">· ${esc(it.base)}</span></div>`; });
    return [h + '</div>', items];
  }

  /** Hover tips on the reward cards. */
  wireTips(root, items) {
    for (const d of root.querySelectorAll('.q-item')) {
      const it = items[Number(d.dataset.i)];
      d.onpointerenter = (e) => { this.tip.innerHTML = tooltip(it); this.tip.classList.remove('hidden'); this.moveTip(e); };
      d.onpointermove = (e) => this.moveTip(e);
      d.onpointerleave = () => this.tip.classList.add('hidden');
      d.onclick = (e) => { this.tip.innerHTML = tooltip(it); this.tip.classList.toggle('hidden'); this.moveTip(e); };
    }
  }
  moveTip(e) {
    const r = this.tip.getBoundingClientRect();
    let x = e.clientX + 16, y = e.clientY + 12;
    if (x + r.width > innerWidth - 4) x = e.clientX - r.width - 12;
    if (y + r.height > innerHeight - 4) y = innerHeight - r.height - 4;
    this.tip.style.left = x + 'px'; this.tip.style.top = Math.max(4, y) + 'px';
  }

  /** Speak with a giver: their work (one quest at once, or a list to choose from). True if they
   * had any. */
  talk(name, v = null) {
    const mine = QUESTS.filter((q) => q.giver === name && (this.available(q.id) || ['active', 'ready'].includes(this.state[q.id]?.s)));
    if (!mine.length) return false;
    const ready = mine.find((q) => this.state[q.id]?.s === 'ready');
    if (mine.length === 1 || ready) this.show(ready || mine[0], name);
    else this.choose(mine, name);
    this.o.onOpen?.(true);
    return true;
  }

  choose(list, name) {
    const D = this.dlg;
    D.innerHTML = '';
    D.append(this.closeBtn(), el('h2', null, esc(GIVERS[name].call)));
    D.append(el('div', 'q-text', 'There is more than one thing to be done.'));
    this.o.speak?.(name, 'There is more than one thing to be done.');
    for (const q of list) {
      const st = this.state[q.id];
      const b = el('button', 'q-pick', `<span class="qm ${st ? (st.s === 'ready' ? 'q' : 'g') : 'e'}">${st ? '?' : '!'}</span> ${esc(q.title)}`);
      b.onclick = () => this.show(q, name);
      D.append(b);
    }
    D.classList.remove('hidden');
  }

  closeBtn() { const c = el('button', 'close', '&times;'); c.onclick = () => this.close(); return c; }

  show(q, name) {
    const D = this.dlg, st = this.state[q.id];
    const n = st ? st.n : q.objectives.map((ob) => this.needed(ob));
    D.innerHTML = '';
    D.append(this.closeBtn(), el('h2', null, esc(q.title)), el('div', 'q-giver', esc(GIVERS[name].call)));
    const body = st?.s === 'ready' ? q.done : st?.s === 'active' ? q.wait : typeof q.text === 'function' ? q.text(n) : q.text;
    D.append(el('div', 'q-text', esc(body)));
    this.o.speak?.(name, body);      // (and the giver says it aloud)
    if (!st || st.s === 'active') {
      const ob = el('div', 'q-obj');
      ob.innerHTML = `<h3>What is to be done</h3><div>${esc(typeof q.brief === 'function' ? q.brief(n) : q.brief)}</div>` +
        (st ? q.objectives.map((o, i) => `<div class="dim">${esc(o.label)}: ${Math.min(st.p[i], st.n[i])}/${st.n[i]}</div>`).join('') : '') +
        `<div class="dim small">Where: ${esc(this.places[q.map]?.name || '')} (marked on the map)</div>`;
      D.append(ob);
    }
    const [rh, items] = this.rewardHtml(q);
    D.append(el('div', null, rh));
    this.wireTips(D, items);
    const row = el('div', 'hb');
    const btn = (label, fn, cls = '') => { const b = el('button', cls, label); b.onclick = fn; row.append(b); };
    if (!st) { btn('Accept', () => { this.accept(q.id); this.close(); }, 'sel'); btn('Decline', () => this.close()); }
    else if (st.s === 'ready') btn('Complete the quest', () => { this.complete(q.id); this.close(); }, 'sel');
    else btn('Goodbye', () => this.close());
    D.append(row);
    D.classList.remove('hidden');
  }

  /** The quest log (L). */
  showLog(on = true) {
    this.logEl.classList.toggle('hidden', !on);
    if (on) { this.dlg.classList.add('hidden'); this.renderLog(); }
    else this.tip.classList.add('hidden');
    this.o.onOpen?.(on);
  }

  renderLog() {
    const L = this.logEl;
    L.innerHTML = '';
    L.append(this.closeBtn(), el('h2', null, 'Quest Log'));
    const top = el('label', 'q-toggle', `<input type="checkbox" ${this.flags.tracker ? 'checked' : ''}> Show the quest tracker on the screen (T)`);
    top.querySelector('input').onchange = (e) => { this.flags.tracker = e.target.checked; this.refresh(); };
    L.append(top);
    const wrap = el('div', 'q-wrap'), left = el('div', 'q-list'), right = el('div', 'q-detail');
    const entries = QUESTS.filter((q) => this.state[q.id]);
    const open = entries.filter((q) => this.state[q.id].s !== 'done'), done = entries.filter((q) => this.state[q.id].s === 'done');
    if (!this.sel || !this.state[this.sel]) this.sel = open[0]?.id || done[0]?.id || null;
    const row = (q) => {
      const st = this.state[q.id];
      const r = el('div', 'q-row' + (this.sel === q.id ? ' sel' : '') + (st.s === 'done' ? ' fin' : ''),
        `<input type="checkbox" title="Follow it in the tracker" ${st.track ? 'checked' : ''} ${st.s === 'done' ? 'disabled' : ''}><span>${esc(q.title)}</span><em>${st.s === 'ready' ? 'done' : st.s === 'done' ? '' : 'level ' + q.lvl}</em>`);
      r.querySelector('input').onclick = (e) => { e.stopPropagation(); st.track = e.target.checked; this.refresh(); };
      r.onclick = () => { this.sel = q.id; this.renderLog(); };
      return r;
    };
    left.append(el('h3', null, 'Under way'));
    if (!open.length) left.append(el('div', 'dim small', 'Nothing yet. Look for a yellow ! over someone\'s head.'));
    open.forEach((q) => left.append(row(q)));
    if (done.length) { left.append(el('h3', null, 'Done')); done.forEach((q) => left.append(row(q))); }
    const q = BY_ID[this.sel];
    if (q) {
      const st = this.state[q.id];
      right.append(el('h3', null, esc(q.title)), el('div', 'q-giver', `From ${esc(GIVERS[q.giver].call)}`));
      right.append(el('div', 'q-text', esc(typeof q.brief === 'function' ? q.brief(st.n) : q.brief)));
      const ob = el('div', 'q-obj');
      ob.innerHTML = q.objectives.map((o, i) => `<div class="${st.p[i] >= st.n[i] ? 'up' : ''}">${esc(o.label)}: ${Math.min(st.p[i], st.n[i])}/${st.n[i]}</div>`).join('')
        + (st.s === 'ready' ? `<div class="up">Return to ${esc(GIVERS[q.giver].call)}</div>` : '')
        + `<div class="dim small">Where: ${esc(this.places[q.map]?.name || '')}</div>`;
      right.append(ob);
      const [rh, items] = this.rewardHtml(q);
      right.append(el('div', null, rh));
      this.wireTips(right, items);
      if (st.s !== 'done') { const b = el('button', 'small red', 'Give it up'); b.onclick = () => { this.abandon(q.id); }; right.append(b); }
    } else right.append(el('div', 'dim', 'Quests you take show here.'));
    wrap.append(left, right);
    L.append(wrap);
  }
}
