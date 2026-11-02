// The living foes (templates/models/creatures/foes/*.glb, built by tools/creatures/foes3d): dark
// knights and sorcerers who roam the open country and keep to its houses, and the things that
// live in the cave beside Brightwater Falls; and Velscour's Sworn, who hold Blackvigil Keep
// (keep.js), on bodies put together from the villagers and their armour (sworn.js).
//
// Every foe is a zombie underneath (zombies.js): the same 20-bone body, so a blade tears wounds
// in it, takes off its arms, legs and head and cuts it in half, and one that loses a leg drops
// and drags itself after you like the dead do. They join the horde's list, so swings, spells,
// blasts and noises reach them through it. What differs is how they fight:
//   knights   close in behind a shield, raise it when you face them (a blow from the front rings
//             off it), cut, chop, sweep and bash; plate takes the edge off what gets through
//   sorcerers keep their distance, cast bolts, raise the dead around you or hex the ground under
//             you, and blink away when you get close
//   ghasts    lie in wait in the dark, shriek when they find you, come at you in a zigzag lope,
//             pounce from a few strides off, rake and fall back. Each has its own way for good: a
//             raker (both hands, again and again), a pouncer (from further off, raking as it lands)
//             or a circler (wheeling round you till your back is to it, then in and away); badly
//             hurt, one shrieks again for the others
//   grubbers  waddle, charge, smash with their nail-studded clubs and bite: a brawler (club blows
//             one after another), a biter (the jaws first) or a charger (from further off, a ram that
//             throws you back); badly hurt, frenzied: quicker, and hardly a pause between blows
// Weapons and shields are the player's own models (the viewmodel's), held in sockets the build
// put in the hands; a severed arm or a death drops them. A death may leave loot (ctx.loot).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Zombie, goreMaterial, goreShell, wrap, longLow } from './zombies.js';
import { WEBGPU } from './nodes.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { swornBody, shieldLift } from './sworn.js';
import { loadUal, ualBody, RECIPES, CALM } from './ual.js';
import { TOUCH } from './input.js';

// a phone loads their phone copies (foes/phone/, from tools/creatures/phone_copies.py: their
// atlases at 512, cut down nearest so the paint keeps its palette)
const ROOT = 'templates/models/creatures/foes/' + (TOUCH ? 'phone/' : '');
const VILLAGERS = 'templates/models/creatures/villagers/' + (TOUCH ? 'phone/' : '');
const ARMOR = 'templates/models/armor/';
const ITEM_ROOT = 'templates/models/';
const FPS = 30;

// the variants (look: what their spells and glows are made of)
export const FOES = {
  knight_a: { kind: 'knight', title: 'Dread Knight', R: ['arming_sword', 'flanged_mace', 'morning_star'], L: ['thorned_kite', 'knights_kite'], finish: 'bloodforged' },
  knight_b: { kind: 'knight', title: 'Ashen Templar', R: ['falchion', 'war_hammer', 'arming_sword'], L: ['templar_kite', 'banded_kite'], finish: 'bright' },
  knight_c: { kind: 'knight', title: 'Gravewarden', R: ['bone_cleaver', 'bearded_axe', 'nail_club'], L: ['skull_boss', 'spiked_buckler'], finish: 'ancient' },
  sorcerer_a: { kind: 'sorcerer', title: 'Hollow Magister', R: ['crosier', 'caged_orb', 'crescent_staff'], spell: 'arcane', big: 'summon' },
  sorcerer_b: { kind: 'sorcerer', title: 'Blood Witch', R: ['serpent_staff', 'antler_staff', 'brazier_staff'], spell: 'blood', big: 'hex' },
  sorcerer_c: { kind: 'sorcerer', title: 'Rot Hierophant', R: ['skull_staff', 'gnarled_staff', 'iron_crook'], spell: 'venom', big: 'summon' },
  ghast_a: { kind: 'ghast', title: 'Ashen Ghast' },
  ghast_b: { kind: 'ghast', title: 'Pale Ghast' },
  ghast_c: { kind: 'ghast', title: 'Cinder Ghast' },
  grubber_a: { kind: 'grubber', title: 'Mire Grubber' },
  grubber_b: { kind: 'grubber', title: 'Rot Grubber' },
  grubber_c: { kind: 'grubber', title: 'Flayed Grubber' },
  // Velscour's Sworn, who hold Blackvigil Keep (keep.js): villagers in the Fiend's Panoply on the
  // knights' clips (sworn.js), each with one of a dozen blades, axes, maces and hammers in a dark
  // finish and a kite shield on the arm (the round ones are dished too deep to ride a vambrace).
  // Their adepts go bareheaded with burning eyes, a blade in one hand and a staff in the other, and
  // cast. Their lord is the same body half as big again, burning red.
  sworn_m: { kind: 'knight', title: 'Sworn of the Vigil', body: { villager: 'villager_m08', armor: 'fiend', sex: 'm' }, finish: ['ancient', 'bloodforged', 'worn'], stats: 'sworn',
    R: ['arming_sword', 'bearded_axe', 'flanged_mace', 'morning_star', 'falchion', 'war_hammer', 'grave_messer', 'coffin_hammer', 'reliquary_blade', 'fang_blade', 'wolfjaw_sickle', 'scimitar'],
    L: ['thorned_kite', 'knights_kite', 'banded_kite'] },
  sworn_f: { kind: 'knight', title: 'Sworn of the Vigil', body: { villager: 'villager_f08', armor: 'fiend', sex: 'f' }, finish: ['ancient', 'bloodforged', 'worn'], stats: 'sworn',
    R: ['arming_sword', 'falchion', 'scimitar', 'grave_messer', 'fang_blade', 'flanged_mace', 'morning_star', 'wolfjaw_sickle', 'gaolers_hook', 'bearded_axe'],
    L: ['thorned_kite', 'knights_kite', 'banded_kite'] },
  sworn_adept_m: { kind: 'knight', title: 'Adept of the Vigil', body: { villager: 'villager_m08', armor: 'fiend', sex: 'm', helm: false, casts: 'sorcerer_b' }, finish: ['bloodforged', 'ancient'], stats: 'adept',
    caster: true, spell: 'blood', R: ['reliquary_blade', 'grave_messer', 'fang_blade', 'flanged_mace'], L: ['serpent_staff', 'antler_staff', 'brazier_staff', 'skull_staff'], Lsock: 'gripL' },
  sworn_adept_f: { kind: 'knight', title: 'Adept of the Vigil', body: { villager: 'villager_f08', armor: 'fiend', sex: 'f', helm: false, casts: 'sorcerer_b' }, finish: ['bloodforged', 'ancient'], stats: 'adept',
    caster: true, spell: 'blood', R: ['reliquary_blade', 'scimitar', 'fang_blade', 'grave_messer'], L: ['serpent_staff', 'skull_staff', 'crosier', 'iron_crook'], Lsock: 'gripL' },
  sworn_lord: { kind: 'knight', title: 'Ser Malgrave, the Red Hand of Velscour', body: { villager: 'villager_m08', armor: 'fiend', sex: 'm' }, finish: ['bloodforged'], stats: 'lord',
    boss: true, scale: 1.35, glow: 0xff2410, R: ['penitents_greatsword'], L: ['thorned_kite'] },
};
export const VARIANTS = Object.keys(FOES).filter((v) => !FOES[v].body);
export const SWORN = Object.keys(FOES).filter((v) => FOES[v].body);

// how each kind stands up to you: hp, damage taken (armour), limb toughness, speeds, senses
const KIND = {
  knight: { hp: 195, armor: 0.72, limb: 1.45, walk: 1.3, run: 3.5, sight: 28, hear: 1.0, turn: 3.6, reach: 2.05, flinch: 0.25, tier: 3, heft: 1.6,
    dmg: { attack1: 12, attack2: 16, attack3: 11, bash: 6 }, cool: [0.6, 1.4] },
  sorcerer: { hp: 105, armor: 1, limb: 0.9, walk: 1.15, run: 2.8, sight: 32, hear: 1.1, turn: 3.2, reach: 1.8, flinch: 0.6, tier: 2,
    dmg: { attack1: 10 }, cool: [0.8, 1.4] },
  ghast: { hp: 100, armor: 1, limb: 0.8, walk: 1.5, run: 5.2, sight: 20, hear: 1.6, turn: 5.5, reach: 1.9, flinch: 0.45, tier: 1,
    dmg: { attack1: 7, attack2: 7, attack3: 12 }, cool: [0.5, 1.2] },
  grubber: { hp: 130, armor: 0.9, limb: 1.1, walk: 0.95, run: 2.6, sight: 13, hear: 1.5, turn: 2.8, reach: 1.65, flinch: 0.3, tier: 1, heft: 1.4,
    dmg: { attack1: 14, attack2: 9, attack3: 11 }, cool: [0.8, 1.5] },
};
// a variant's own `stats` over its kind's: the Sworn in heavier plate than the dark knights of the
// downs and quicker on their feet and with a blade (`swing`: how fast their cuts play; `gait`: the
// walk and run their clips were made at, so their feet don't slide), their adepts lighter, and
// their lord, who shrugs off what would fell them, hits like a falling bell and calls Velscour's
// fire up under you
const GAIT = { walk: 1.3, run: 3.5 };
// the Sworn's five fittings, so a garrison isn't one knight over and over: each changes a piece or
// two of the Fiend's Panoply, found by its material's name (the same in the men's and women's
// sets): the helm's ram's horns and the cloth of the cape and loincloth. A colour multiplies the
// piece's own texture (gilt horns average (0.31, 0.21, 0.07), the crimson cloth (0.39, 0.09,
// 0.10)); null takes the piece off.
export const FITTINGS = [
  {},                                                                                     // gilt horns, crimson cloth
  { tarnished_gold_dark: [2.8, 3.8, 9.5], cloth_01: [0.1, 0.35, 0.35] },                  // bone horns, black cloth
  { tarnished_gold_dark: [0.3, 0.38, 1.0] },                                              // blackened horns
  { tarnished_gold_dark: [2.0, 0.4, 0.6], cloth_01: [0.57, 0.7, 3.0] },                   // blood-red horns, violet cloth
  { tarnished_gold_dark: null, cloth_01: [0.77, 3.2, 2.7] },                              // no horns, ash-grey cloth
];
export const STATS = {
  sworn: { hp: 240, armor: 0.62, limb: 1.7, walk: 1.7, run: 4.4, turn: 4.8, sight: 26, tier: 4, heft: 1.8, swing: 1.18, gait: GAIT,
    dmg: { attack1: 14, attack2: 18, attack3: 13, attack4: 20, bash: 7, lunge: 16, leap: 20, punch1: 5, punch2: 7 }, cool: [0.3, 0.85] },
  adept: { hp: 165, armor: 0.78, limb: 1.4, walk: 1.65, run: 4.2, turn: 4.6, sight: 30, hear: 1.2, reach: 2.0, flinch: 0.4, tier: 4, heft: 1.3, swing: 1.2, gait: GAIT,
    dmg: { attack1: 12, attack2: 15, attack3: 11, attack4: 16, lunge: 13, leap: 16, punch1: 4, punch2: 6 }, cool: [0.5, 1.1] },
  lord: { hp: 1150, armor: 0.55, limb: 4.5, walk: 1.45, run: 3.9, sight: 34, hear: 1.3, turn: 3.4, reach: 2.75, flinch: 0.05, tier: 6, heft: 5, swing: 1.05, gait: GAIT,
    dmg: { attack1: 24, attack2: 30, attack3: 22, attack4: 34, bash: 14, lunge: 26, leap: 32, heavy: 20, punch1: 10, punch2: 13 }, cool: [0.6, 1.3] },
};
// (as the zombies': the legs take far more than the arms, and zombies.js makes them harder still on
// anything heavy, so a knight or the lord is seldom brought down to crawl)
const LIMB_HP = { head: 42, upper_armL: 52, forearmL: 36, handL: 22, thighL: 150, shinL: 120, footL: 70,
  upper_armR: 52, forearmR: 36, handR: 22, thighR: 150, shinR: 120, footR: 70, waist: 150 };
const ONCE = new Set(['jump', 'attack1', 'attack2', 'attack3', 'bash', 'cast1', 'cast2', 'blink', 'hit', 'shriek', 'death',
  'collapse', 'crawl_attack', 'crawl_death', 'rise', 'getup',
  'attack1_rec', 'attack2_rec', 'lunge', 'parry', 'guardbreak', 'knockdown', 'heavy',
  'attack4', 'punch1', 'punch2', 'roll', 'hit_head', 'hit_chest', 'death2', 'cast', 'sit', 'stand', 'interact', 'pickup',
  'sword_combo', 'shield_hit', 'punch3', 'punch3_rec', 'throw', 'climb', 'slide_start', 'slide_exit', 'nod_yes', 'rail_call', 'open_chest',
  'consume', 'harvest', 'plant', 'water', 'zombie_scratch', 'leap', 'nod_no', 'cast_ready']);
// the Sworn on the animation library's clips (ual.js): where in a move its feet carry it forward,
// [from, to] seconds into the clip, at m/s (the clips stay in place; the body is moved instead)
export const DASH = { lunge: [0.1, 0.38, 6.5], bash: [0, 0.16, 5], roll: [0.1, 0.95, 3], leap: [0.05, 0.62, 7.2] };
const SPELL = { // bolt colour, its glow, damage
  arcane: { core: 0xe6b8ff, glow: 0x9a4cff, dmg: 10, speed: 14 },
  blood: { core: 0xffb0a0, glow: 0xff2a1a, dmg: 12, speed: 13 },
  venom: { core: 0xd8ffc0, glow: 0x5cff3a, dmg: 9, speed: 12 },
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3();
const EMBERS = [new THREE.Color(1, 0.55, 0.15), new THREE.Color(1, 0.22, 0.06), new THREE.Color(0.9, 0.08, 0.03)];
const _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

/** The gore shader (which also makes a glow map, eyes, slits, runes, cracks and caps, shine in the
 * dark), plus: armour, capes and robes stay armour and cloth inside (the `shell` vertex attribute),
 * and a sworn knight's eyes burn behind the slits. `u`: wound uniforms shared with the body's other
 * materials (sworn.js's bodies have several). */
function foeMaterial(src, lib, u = null) {
  const mat = goreMaterial(src, lib, u);
  if (!src.emissiveMap && src.userData?.glow) {      // a sworn knight's eyes, burning behind the slits
    mat.emissive = src.emissive.clone().multiplyScalar(src.emissiveIntensity);
    mat.map = null;
    mat.userData.eyes = true;
    if (WEBGPU) mat.colorNode = null;   // (the crisp map it had is gone: its colour alone)
  }
  if (WEBGPU) return goreShell(mat);    // (TSL: zombies.js goreKind, its shell variant)
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    base(sh);
    sh.vertexShader = sh.vertexShader
      .replace('attribute vec3 bindPos;', 'attribute vec3 bindPos;\nattribute float shell;\nvarying float vShell;')
      .replace('vBind = bindPos;', 'vBind = bindPos; vShell = shell;');
    sh.fragmentShader = sh.fragmentShader
      .replace('varying vec3 vBind;', 'varying vec3 vBind;\nvarying float vShell;')
      .replace('vBind.y > 0.52 && vBind.y < 1.0 && h > 3.0 && c > 3.0', 'vShell > 0.5 && h > 3.0 && c > 3.0');
  };
  mat.customProgramCacheKey = () => 'foe-gore';
  return mat;
}

/** A held item's frame relative to its bone, from the build's socket (model space at rest). */
function socketLocal(model, s) {
  const bone = model.getObjectByName(s.bone);
  if (!bone) return null;
  model.updateMatrixWorld(true);
  const Y = new THREE.Vector3(...s.y), Z = new THREE.Vector3(...s.z), X = Y.clone().cross(Z);
  const m = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(...s.pos);
  return { bone: s.bone, m: bone.matrixWorld.clone().invert().multiply(m) };
}

/** The shield arm's poses for a body (model space), from its bind (the arm straight out along +x,
 * the shield flat on the forearm, face up): the carry (the upper arm hanging a little out, the
 * forearm forward and a little down, turned so the shield stands upright beside the leg with its
 * face out and its top leaning clear of the shoulder). For the Sworn (`sworn`), whose plate is
 * bulkier and whose shields ride further out, the carry is held wider of the body, and there are
 * more: the guard (the upper arm forward and down, the forearm across before the chest, so the
 * shield covers the body with its face to the front, as a shield is held), the swing (the arm
 * drawn back out of the way of the sword's wide sweep) and, for the sword arm, the cock (drawn
 * back behind the shoulder as the shield goes into a bash, ready to follow it). Each was tried
 * against every clip's arms and body, and the blends between them, until nothing passed through
 * the shield. */
export function shieldPoses(skel, bones, sworn = false) {
  const bindQ = (b) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(skel.boneInverses[skel.bones.indexOf(b)].clone().invert()));
  // the arms' bind frames: along the arm, its outer (back of the hand's) side, and their cross
  const bind = { L: new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)),
    R: new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)) };
  const pose = (up, d, o, s = 'L') => {
    up.normalize(); d.normalize(); o.addScaledVector(d, -o.dot(d)).normalize();   // (o: the forearm's outer side, the shield's face)
    const turn = new THREE.Matrix4().makeBasis(d, o, d.clone().cross(o)).multiply(bind[s].clone().invert());
    return { up: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(s === 'L' ? 1 : -1, 0, 0), up).multiply(bindQ(bones['upper_arm' + s])),
      fore: new THREE.Quaternion().setFromRotationMatrix(turn).multiply(bindQ(bones['forearm' + s])) };
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  if (!sworn) return { carry: pose(V(0.3, -0.95, 0.08), V(0.12, -0.42, 0.9), V(1, -0.16, 0)) };
  return { carry: pose(V(0.5, -0.86, 0.08), V(0.2, -0.4, 0.9), V(1, -0.1, 0)),
    guard: pose(V(0.35, -0.5, 0.8), V(-1, 0.15, 0.3), V(0, 0.1, 1)),
    swing: pose(V(0.55, -0.75, -0.35), V(0.25, -0.55, -0.8), V(1, 0, 0)),
    cock: pose(V(-0.45, -0.55, -0.7), V(-0.1, 0.75, -0.65), V(-1, 0, 0), 'R') };
}

/** How the shield arm is posed in clip c: drawn into the carry by w (0: the clip's own), and (the
 * Sworn) how far into the guard (blocking, bashing, charging) or the swing (the wide third cut), and
 * whether the sword arm is cocked (the bash). On the library's clips (`ual`) the arm holds the shield
 * as a shield is held already, but for the bash, whose dash would turn its face aside: there it's
 * held in the guard, its face to the front; and at ease, its arm hanging, the shield on the forearm
 * would stick out flat before him: there it's carried upright beside the leg. */
const AT_EASE = new Set(['idle_calm', 'idle_talk', 'patrol', 'torch', 'sit', 'sit_idle', 'sit_talk', 'stand', 'interact', 'pickup', 'kneel', 'push', 'dance', 'crouch', 'crouch_walk']);
export function shieldArm(c, state, standing, sworn, ual = false) {
  if (!standing || ['collapse', 'getup', 'death', 'dead', 'knockdown'].includes(c)) return { w: 0, guard: 0, swing: 0, cock: 0 };
  if (ual) { const g = c === 'bash' ? 1 : 0; return { w: g || (AT_EASE.has(c) ? 1 : 0), guard: g, swing: 0, cock: 0 }; }
  if (!sworn) return { w: state === 'block' || ['block', 'bash', 'fall', 'jump'].includes(c) ? 0 : c === 'hit' ? 0.55 : 1, guard: 0, swing: 0, cock: 0 };
  const guard = state === 'block' || state === 'charge' || c === 'block' || c === 'bash' ? 1 : 0;
  return { w: c === 'hit' && !guard ? 0.55 : 1, guard, swing: !guard && c === 'attack3' ? 1 : 0, cock: c === 'bash' ? 1 : 0 };
}

// ------------------------------------------------------------------ a foe
class Foe extends Zombie {
  static ONCE = ONCE;

  constructor(gltf, variant, owner, o) {
    super(gltf, variant, owner, { ...o, kind: 'shambler' });
    this.foes = owner.foes;
    this.def = FOES[variant];
    this.kindName = this.def.kind;
    this.kind = this.def.stats ? { ...KIND[this.kindName], ...STATS[this.def.stats] } : KIND[this.kindName];
    const meta = gltf.userData.foe;
    // on the animation library's clips (the Sworn): its gaits go at the paces they were measured at
    this.ual = !!meta.ual;
    if (this.ual && meta.gait) this.kind = { ...this.kind, gait: { ...this.kind.gait, ...meta.gait } };
    // a body built bigger (the Sworn's lord): its hit shapes and its footprint grow with it
    const size = this.size = this.def.scale || 1;
    const grow = (o) => (o && size !== 1 ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * size])) : o);
    this.root.scale.setScalar(size);
    this.r = (this.kindName === 'grubber' ? 0.36 : 0.3) * size;
    this.radius = grow(meta.radius); this.tips = grow(meta.tip); this.hits = meta.hits || {};
    this.hp = this.kind.hp;
    this.heft = this.kind.heft || 1;     // how hard it is to shove
    this.limbHp = Object.fromEntries(Object.entries(LIMB_HP).map(([k, v]) => [k, v * this.kind.limb]));
    const geo = this.mesh.geometry;
    geo.setAttribute('shell', geo.attributes._shell
      || (gltf.userData.noShell ||= new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count), 1)));
    this.shared.push('shell');
    this.zone = o.zone || 'wild';
    this.area = o.area || null;            // {x, z, r} it keeps to, or a room rect via o.room
    this.patrol = o.patrol || null;        // [[x, z], ...] it walks round
    this.patrolI = 0;
    this.items = [];
    this.spellCool = 1 + Math.random() * 2; this.bigCool = 6 + Math.random() * 8; this.blinkCool = 2;
    this.blockCool = 0; this.blockT = 0; this.blockSoon = -1;
    this.retreatT = 0; this.chargeT = 0; this.chargeCool = 2 + Math.random() * 3;
    this.shrieked = false; this.summoned = [];
    this.zig = Math.random() * 6.28;
    this.wardCool = 3 + Math.random() * 4; this.rushCool = 2 + Math.random() * 3; this.comboQ = null;
    this.keeps = o.keeps || null;          // a room it holds and won't be drawn out of (the Red Throne's)
    this.postYaw = o.yaw ?? this.yaw;
    if (o.start === 'ambush') { this.state = 'ambush'; this.play('idle', 0); }
    // the Sworn's eyes burn: a glint at each (through the helm's slits, or bare on an adept)
    if (this.def.body && meta.eyes?.length) {
      const head = this.bones.head, inv = this.skel.boneInverses[this.skel.bones.indexOf(head)];
      this.eyes = meta.eyes.map((e) => {
        const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
          color: this.def.caster ? new THREE.Color(2.4, 0.3, 0.1) : new THREE.Color(0xff3010) }));   // (an adept's, bare, burn brightest)
        g.position.set(...e).applyMatrix4(inv);
        g.scale.setScalar(this.def.caster ? 0.09 : 0.05);
        head.add(g);
        return g;
      });
    }
    if (this.def.body && !this.def.boss) this.fit(o.fitting ?? Math.floor(Math.random() * FITTINGS.length));
    if (this.ual && this.state === 'move') { this.play('idle', 0); this.mixer.update(Math.random() * 2); }   // (at ease, now it knows it can be)
    // a lord of the Sworn burns: his armour glows from within (brightest where it's gilded)
    if (this.def.glow) {
      this.glowMats = [this.mesh.material].flat().filter((m) => !m.userData.eyes && m.map);
      for (const m of this.glowMats) { m.emissiveMap = m.map; m.emissive = new THREE.Color(this.def.glow); m.needsUpdate = true; }
    }
  }

  /** New clips for a foe already out in the world (the open country's, once the library's are made:
   * Foes.upgrade). Taken up where it stands; one already fighting, down or dead keeps what it has. */
  adopt(g) {
    if (this.ual || this.dead || this.mode !== 'stand' || this.state !== 'move') return false;
    const meta = g.userData.foe, cur = this.cur;
    this.mixer.stopAllAction();
    this.actions = {};
    for (const clip of g.animations) {
      const a = this.mixer.clipAction(clip);
      if (ONCE.has(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[clip.name] = a;
    }
    this.ual = true; this.hits = meta.hits || {};
    if (meta.gait) this.kind = { ...this.kind, gait: { ...this.kind.gait, ...meta.gait } };
    this.cur = null;
    this.play(cur === 'walk' || cur === 'run' ? cur : 'idle', 0.2);
    this.mixer.update(Math.random() * 2);
    return true;
  }

  /** On the library's clips the Sworn have more than one of some moves: at ease when nobody's after
   * them (talking, the ones given to it), the formal walk of a round, the sword guard once the shield
   * is gone, a flinch at the head or the chest. */
  play(name, fade, speed = 1) {
    if (this.ual) {
      if (this.holdT > 0 && (name === 'walk' || name === 'run' || name === 'idle')) return;   // (let a flinch finish)
      const A = this.actions, calm = !this.aggro && this.goal === 'wander' && this.state === 'move';
      if (name === 'idle' && calm) {
        // (each at ease in its own way: talking, arms folded, a lantern held up after dark)
        this.ease ||= this.chat && A.idle_talk ? 'idle_talk' : A.idle_arms && Math.random() < 0.35 ? 'idle_arms' : 'idle_calm';
        name = this.foes.night && A.lantern && this.id % 3 === 0 ? 'lantern' : this.ease;
      }
      else if (name === 'idle' && !this.shield && this.kindName === 'knight' && A.idle_sword) name = 'idle_sword';
      else if (name === 'walk' && calm && A.patrol) { speed *= (this.kind.gait.walk || 1) / (this.kind.gait.patrol || 1); name = 'patrol'; }
      else if (name === 'hit' && this.cur !== 'hit' && this.cur !== 'hit_head' && this.cur !== 'hit_chest') name = ['hit', 'hit_head', 'hit_chest'][Math.floor(Math.random() * 3)];
      if (!A[name]) name = { idle_calm: 'idle', idle_talk: 'idle', idle_arms: 'idle', lantern: 'idle', patrol: 'walk', hit_head: 'hit', hit_chest: 'hit', crouch_walk: 'walk' }[name] || name;
    }
    return super.play(name, fade, speed);
  }

  material(src, lib) {
    if (!Array.isArray(src)) return foeMaterial(src, lib);
    const first = foeMaterial(src[0], lib);       // one set of wounds for all of them
    return [first, ...src.slice(1).map((m) => foeMaterial(m, lib, first.userData.u))];
  }

  /** Dress a Sworn in fitting i (FITTINGS): its pieces recoloured, or taken off. */
  fit(i) {
    this.fitting = i % FITTINGS.length;
    for (const m of [this.mesh.material].flat()) for (const [piece, tint] of Object.entries(FITTINGS[this.fitting])) {
      if (!m.name.includes(piece)) continue;
      if (tint) m.color.setRGB(...tint); else m.visible = false;
    }
  }

  /** Put an item model (already cloned) in a socket. */
  hold(socketName, obj) {
    const s = this.foes.sockets(this.variant, socketName);
    if (!s) return;
    const bone = this.bones[s.bone];
    const g = new THREE.Group();
    s.m.decompose(g.position, g.quaternion, g.scale);
    g.add(obj);
    bone.add(g);
    obj.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.frustumCulled = false; } });
    this.items.push({ g, bone: s.bone, socket: socketName });
  }

  get shield() { return this.items.find((i) => i.socket === 'shieldL'); }

  /** The clips swing the shield arm across the body (the shield goes through the chest as it
   * walks, and across it as the sword comes round). Unless it's blocking or bashing, the arm is
   * drawn into a carry instead: the upper arm hanging a little out from the side, the forearm
   * forward and turned so the shield stands upright beside the leg, its face out. The Sworn's
   * bulkier arms would go through their shields in the knights' own blocks and bashes, so theirs
   * are drawn into a guard there instead (and as they charge), and they keep the carry as they
   * jump and fall (see shieldArm). Blended in and out over the clip (dt 0: at once). */
  carryShield(dt = 0) {
    if (!this.shield || !this.arm('L')) return;
    const { w, guard, swing, cock } = shieldArm(this.cur, this.state, !this.dead && this.mode === 'stand', !!this.def.body, this.ual);
    const k = dt ? Math.min(1, dt * 7) : 1, k2 = dt ? Math.min(1, dt * 9) : 1;
    this.carryW = (this.carryW ?? w) + (w - (this.carryW ?? w)) * k;
    this.guardW = (this.guardW ?? guard) + (guard - (this.guardW ?? guard)) * k2;
    this.swingW = (this.swingW ?? swing) + (swing - (this.swingW ?? swing)) * k2;
    this.cockW = (this.cockW ?? cock) + (cock - (this.cockW ?? cock)) * k2;
    if (this.carryW < 0.01) return;
    const P = this.foes.poses(this);
    this.root.updateMatrixWorld(true);
    const model = this.root.children[0], qm = model.getWorldQuaternion(_q0);
    for (const part of ['up', 'fore']) {
      const bone = part === 'up' ? this.bones.upper_armL : this.bones.forearmL;
      _q3.copy(P.carry[part]);
      if (P.guard) _q3.slerp(P.guard[part], this.guardW).slerp(P.swing[part], this.swingW);
      const pq = bone.parent.getWorldQuaternion(_q1).invert();
      _q2.copy(qm).multiply(_q3).premultiply(pq);
      bone.quaternion.slerp(_q2, this.carryW);
      bone.updateMatrixWorld(true);
    }
    if (P.cock && this.cockW > 0.01 && this.arm('R')) {        // the sword arm drawn back as the shield goes in
      for (const part of ['up', 'fore']) {
        const bone = part === 'up' ? this.bones.upper_armR : this.bones.forearmR;
        const pq = bone.parent.getWorldQuaternion(_q1).invert();
        _q2.copy(qm).multiply(P.cock[part]).premultiply(pq);
        bone.quaternion.slerp(_q2, this.cockW);
        bone.updateMatrixWorld(true);
      }
    }
  }

  /** Let go of what a lost arm (or a dead hand) held: it falls and lies where it lands. */
  drop(which = null) {
    for (const it of [...this.items]) {
      if (which && !which(it)) continue;
      this.foes.loose(it.g, this.forward(_u).clone().multiplyScalar(-0.5).add(_v.set((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2)));
      this.items.splice(this.items.indexOf(it), 1);
    }
  }

  // -------------------------------------------------------------- being hit
  hit(h, opts) {
    // (GOD MODE, the Debug Menu: no shield or parry turns a blow)
    if (!this.dead && !this.owner.oneHit && this.state === 'block' && (this.shield && this.arm('L') && this.has('handL') || this.parrying)) {
      const f = this.forward(_t);
      if (f.dot(opts.dir) < -0.3) return this.deflect(h, opts);
    }
    const wasState = this.state;
    super.hit(h, { ...opts, dmg: opts.dmg * this.kind.armor });
    if (this.dead || this.mode !== 'stand' || this.state === 'collapse') return;
    if (this.state === 'ambush') { this.state = 'move'; }
    // (a heavy blow no longer throws the Sworn back off their feet: a body takes a blow where it stands)
    if ((wasState === 'move' || wasState === 'block' || wasState === 'ambush') && (opts.heavy || Math.random() < this.kind.flinch)) {
      this.state = 'hit'; this.play('hit', 0.06);
    }
    if (this.kindName === 'knight' && Math.random() < 0.4) this.blockSoon = 0.35;
    if (this.kindName === 'ghast') this.retreatT = 0.5 + Math.random() * 0.6;
    if (this.kindName === 'sorcerer' && this.blinkCool <= 0 && Math.random() < 0.5) this.blinkNow = true;
    this.foes.voice(this, 'hurt');
  }

  /** A blow rings off the shield: sparks, a clang, and the knight shoves back. */
  deflect(h, opts) {
    const g = this.owner.gore, sfx = this.owner.sfx;
    const by = this.parrying ? this.items.find((i) => i.socket === 'gripR') || this.shield : this.shield;
    const p = by ? by.g.getWorldPosition(new THREE.Vector3()) : this.bones.handR.getWorldPosition(new THREE.Vector3());
    const sp = [new THREE.Color(1, 0.9, 0.5), new THREE.Color(1, 0.6, 0.2), new THREE.Color(0.9, 0.9, 0.9)];
    for (let i = 0; i < 26; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(5).addScaledVector(opts.dir, -2);
      g.drop(p, _v, 0.008 + Math.random() * 0.01, sp[i % 3]);
    }
    sfx?.clang?.(false, p);   // (heard from the shield)
    this.foes.flash(p, 0xffd080, 0.25);
    this.blockT = Math.min(this.blockT, 0.25);
    this.hunt(this.owner.player?.pos, true);
    if (opts.heavy) { this.state = 'hit'; this.play(this.ual && !this.parrying ? 'guardbreak' : 'hit', 0.06); this.parrying = false; }
    else if (this.def.body) this.counter = (this.ual ? ['attack1', 'attack1', 'bash'] : ['attack1', 'attack2', 'bash'])[Math.floor(Math.random() * 3)];   // the Sworn always answer it
    else if (Math.random() < 0.45) this.counter = 'bash';
  }

  sever(name, dir) {
    super.sever(name, dir);
    if (this.eyes && this.cutAway('head')) for (const g of this.eyes) g.visible = false;
    this.drop((it) => this.cutAway(it.bone));
    if (this.mode === 'stand' && !this.legs) this.drop((it) => it.socket === 'shieldL');
  }

  die() {
    const lying = this.cur === 'knockdown';
    super.die();
    if (lying && this.actions.dead) this.play('dead', 0.4);
    else if (this.ual && this.mode === 'stand' && this.cur === 'death' && this.actions.death2 && Math.random() < 0.5) this.play('death2', 0.15);
    this.drop();
    for (const g of this.eyes || []) g.visible = false;
    this.foes.voice(this, 'die');
    if (this.def.boss) this.foes.bossDown(this);
    const loot = this.foes.ctx?.loot;
    if (loot?.drop) {
      const tier = this.kind.tier + (this.zone === 'cave' ? 1 : 0);
      const chance = { knight: 0.8, sorcerer: 0.75, ghast: 0.35, grubber: 0.4 }[this.kindName];
      if (Math.random() < chance) loot.drop([this.pos.x, this.pos.y + 0.1, this.pos.z], { tier, under: this.zone === 'cave' || this.zone === 'dungeon' });
    }
  }

  /** What it can see and hear of you (its own cry when it first has you). */
  sense(player, active) {
    const was = this.aggro;
    const groan = this.owner.sound;
    this.owner.sound = (k, p, loud) => { if (k !== 'groan') groan.call(this.owner, k, p, loud); };
    super.sense(player, active);
    this.owner.sound = groan;
    if (!was && this.aggro) this.foes.voice(this, 'alert');
  }

  // -------------------------------------------------------------- the brain
  update(dt, player, active, far, mid) {
    if (this.def.boss) this.burn(dt, player);
    if (this.gone) return;
    if (this.dead && this.cur === 'death2' && this.done()) this.play('dead2', 0.3);
    if (this.dead || this.mode === 'crawl' || ['collapse', 'buried', 'rise', 'playdead', 'getup'].includes(this.state)) {
      super.update(dt, player, active, far, mid);
      return;
    }
    const owner = this.owner;
    if (far && !this.aggro && this.goal === 'wander') return;   // out of the way: it waits
    // in the keep, one in a room you can't see into isn't drawn (unless it's after you)
    if (this.zone === 'keep' && !this.aggro && this.foes.keep && !this.foes.keep.sees(this.pos, player.pos)) this.root.visible = false;
    this.mixAcc += dt;
    if (!mid || ++this.frame % (far ? 6 : 3) === 0) { const t = this.mixAcc; this.mixer.update(t); this.mixAcc = 0; if (this.kindName === 'knight') this.carryShield(t); }
    // (its afflictions run once a frame, in the horde's update)
    if (this.dead) return;
    this.bleed(dt);
    // (holdT too: the zombies' flinch sets it, and play() keeps the walk, run and idle off while it lasts)
    for (const k of ['cool', 'spellCool', 'bigCool', 'blinkCool', 'blockCool', 'retreatT', 'chargeCool', 'lungeT', 'wardCool', 'rushCool', 'holdT']) this[k] = Math.max(0, (this[k] || 0) - dt);
    this.lungeCool -= dt;
    if (this.blockSoon >= 0) { this.blockSoon -= dt; if (this.blockSoon < 0 && this.state === 'move') this.raiseShield(0.9 + Math.random() * 0.8); }
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const facingErr = Math.abs(wrap(Math.atan2(dx, dz) - this.yaw));
    if (this.state === 'ambush') {           // crouched in the dark, twitching, waiting
      if (active && dist < 7 && Math.abs(player.pos.y - this.pos.y) < 2.5) { this.state = 'move'; this.hunt(player.pos, true); }
      this.sync();
      return;
    }
    if (mid && !this.aggro && this.goal === 'wander' && this.zone === 'cave') { this.sync(); return; }
    this.think -= dt;
    if (this.think <= 0) { this.think = mid ? 0.6 : 0.2 + Math.random() * 0.06; this.sense(player, active); }
    const st = this.state;
    if (st === 'attack') this.attacking(dt, player, active, dist, facingErr);
    else if (st === 'cast') this.casting(dt, player, active, dist);
    else if (st === 'block') this.blocking(dt, player, active, dist);
    else if (st === 'hit' || st === 'shriek') { if (this.done()) this.state = 'move'; }
    else if (st === 'gesture') {
      const turn = this.kind.turn * 0.6 * dt, want = Math.atan2(dx, dz);
      this.yaw += Math.max(-turn, Math.min(turn, wrap(want - this.yaw)));
      if ((this.gestureT -= dt) <= 0 || (active && dist < this.kind.reach + 0.4)) this.state = 'move';   // (you closing in ends it)
    }
    else if (st === 'blink') this.blinking(dt, player);
    else if (st === 'charge') this.charging(dt, player, dist, facingErr);
    else if (st === 'down') { if (this.done()) { this.state = 'getup'; this.play('getup', 0.12); } }
    else if (st === 'jump') {
      // up and over (it can't pass through what it hasn't cleared), ending when it comes down
      const f = this.forward();
      owner.physics.slide(this.pos, f.x * 2.3 * dt, f.z * 2.3 * dt, this.r, 1.6, 0.45);
      this.leapT = (this.leapT || 0) + dt;
      if ((this.leapT > 0.15 && this.air === 0) || this.leapT > 1.6) this.state = 'move';
    } else this.decide(dt, player, active, dist, facingErr);
    this.ground(dt);
    // you can't walk through it
    const r = (this.kindName === 'grubber' ? 0.42 : 0.36) * this.size;
    const pdx = player.pos.x - this.pos.x, pdz = player.pos.z - this.pos.z, d = Math.hypot(pdx, pdz), min = r + 0.32;
    if (d < min && d > 1e-4 && Math.abs(player.pos.y - this.pos.y) < 1.5) { player.pos.x = this.pos.x + pdx / d * min; player.pos.z = this.pos.z + pdz / d * min; }
    this.sync();
  }

  /** The stumps spurt in pulses that fade. */
  bleed(dt) {
    for (const s of this.stumps) {
      s.t += dt;
      const k = Math.max(0.04, 1 - s.t / s.life), beat = Math.pow(Math.max(0, Math.sin(s.t * 8.5)), 3);
      const n = Math.random() < dt * 60 * k * (0.2 + beat) ? Math.ceil(k * 3 * beat + 0.5) : 0;
      if (n) {
        const p = s.bone.localToWorld(_w.copy(s.at));
        const d = _u.copy(s.dir).transformDirection(s.bone.matrixWorld);
        this.owner.gore.spray(p, d, n, { speed: 0.6 + 3.2 * k * beat, spread: 0.35, size: 0.014 });
      }
    }
  }

  decide(dt, player, active, dist, facingErr) {
    this.stagger = Math.max(0, this.stagger - dt);
    if (this.stagger > 0) { this.play('idle', 0.2); return; }
    if (this.keeps && !this.foes.keep?.inside(this.keeps, player.pos)) return this.keepPost(dt, player, active, dist);
    if (this.goal === 'chase' && active) {
      if (this.kindName === 'knight') return this.def.caster ? this.adept(dt, player, dist, facingErr) : this.def.body ? this.sworn(dt, player, dist, facingErr) : this.knight(dt, player, dist, facingErr);
      if (this.kindName === 'sorcerer') return this.sorcerer(dt, player, dist, facingErr);
      if (this.kindName === 'ghast') return this.ghast(dt, player, dist, facingErr);
      return this.grubber(dt, player, dist, facingErr);
    }
    const t = this.roam(dt);
    this.go(dt, t ? t.target : null, t ? t.speed : 0);
  }

  /** Not hunting you: go where it last had you, search there, walk its round, or mill about. */
  roam(dt) {
    const K = this.kind;
    if (this.goal === 'hunt' && this.hasLast) {
      if (Math.hypot(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z) < 1.3) { this.goal = 'search'; this.searchT = 8 + Math.random() * 5; this.wander = null; this.wanderT = 0; }
      return { target: this.route(this.lastSeen), speed: K.walk };
    }
    if (this.goal === 'search') {
      this.searchT -= dt; this.wanderT -= dt;
      if (this.wanderT < 0 || !this.wander) { this.wanderT = 2.5 + Math.random() * 2; this.wander = this.lastSeen.clone().add(_u.set((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8)); }
      if (this.searchT < 0) { this.aggro = false; this.goal = 'wander'; }
      return this.wander.distanceTo(this.pos) > 0.6 ? { target: this.wander, speed: K.walk * 0.9 } : null;
    }
    if (this.patrol) {
      const [x, z] = this.patrol[this.patrolI % this.patrol.length];
      if (Math.hypot(x - this.pos.x, z - this.pos.z) < 1.5) { this.patrolI++; this.pauseT = 1 + Math.random() * 3; }
      if (this.pauseT > 0) { this.pauseT -= dt; return null; }
      return { target: _t.set(x, this.pos.y, z), speed: K.walk * 0.8 };
    }
    this.wanderT -= dt;
    if (this.wanderT < 0) {
      this.wanderT = 5 + Math.random() * 7;
      const r = this.room, a = this.area;
      if (Math.random() < 0.6) {
        this.wander = r ? new THREE.Vector3(r.x0 + 0.8 + Math.random() * (r.x1 - r.x0 - 1.6), this.pos.y, r.z0 + 0.8 + Math.random() * (r.z1 - r.z0 - 1.6))
          : a ? new THREE.Vector3(a.x + (Math.random() - 0.5) * a.r * 2, this.pos.y, a.z + (Math.random() - 0.5) * a.r * 2)
            : this.home.clone().add(_u.set((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12));
      } else this.wander = null;
    }
    return this.wander && this.wander.distanceTo(this.pos) > 0.6 ? { target: this.wander, speed: K.walk * 0.75 } : null;
  }

  /** In the cave, out of sight: the way to p along the passages (else straight at it). */
  route(p) {
    if (this.zone === 'cave' && !this.canSee && this.foes.cave?.flowDir(this.pos, _w)) return _t.copy(this.pos).addScaledVector(_w, 2);
    if (this.zone === 'keep' && !this.canSee && this.foes.keep?.flowDir(this.pos, _w)) return _t.copy(this.pos).addScaledVector(_w, 2);
    return p;
  }

  /** Turn toward `target` and move at `speed`: forward, or backing/side-stepping while facing
   * `face`. Feels ahead for walls, jumps what it can, and plays the matching gait. */
  go(dt, target, speed, { face = null, back = false, side = 0 } = {}) {
    const phys = this.owner.physics, K = this.kind, lean = this.def.body ? 0.75 : 0;
    speed *= this.pace * this.slow;
    // where the straight way is shut (it's in a house and you're out, a wall between), the way round
    // it: nav.js (out by the door, opening it; down the stair)
    if (target && !face && !back && !side && phys.nav) target = phys.nav.steer(this, target, { r: this.r, h: 1.6, step: 0.45 });
    const look = face || target;
    if (look) {
      if (this.avoidT > 0) this.avoidT -= dt;
      // (circling, the Sworn turn partly the way they're going, so they walk round you rather than slide)
      // (the way round what's in front of it, felt for below, or a sidestep when stuck)
      const want = Math.atan2(look.x - this.pos.x, look.z - this.pos.z) + (face ? 0 : this.avoidT > 0 ? this.avoid : this.detour || 0) + side * lean;
      const turn = K.turn * dt;
      this.yaw += Math.max(-turn, Math.min(turn, wrap(want - this.yaw)));
    }
    if (speed <= 0 || !target) { this.play('idle', 0.3); return; }
    const ang = this.yaw + (back ? Math.PI : 0) + side * (Math.PI / 2 - lean);
    const f = _f.set(Math.sin(ang), 0, Math.cos(ang));
    this.feelT -= dt;
    if (this.feelT <= 0) {
      this.feelT = 0.2;
      // walk round what's in the way (a grave, a crate, a pillar) the nearest clear way to where it's
      // going; only a long low wall, with no way round in sight, is jumped
      const direct = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
      const far = Math.max(0.4, Math.min(1.8, Math.hypot(target.x - this.pos.x, target.z - this.pos.z)));
      const way = face ? direct : phys.wayRound(this.pos, direct, this.r, 1.6, 0.45, far, this.detourSide || (this.id % 2 ? 1 : -1));
      if (face) this.detour = 0;
      else if (way !== null) {
        this.detour = wrap(way - direct);
        if (Math.abs(this.detour) > 0.01) this.detourSide = Math.sign(this.detour);
      } else {
        this.detour = 0;
        const y0 = this.pos.y + 0.45;
        const low = phys.ray([this.pos.x, y0, this.pos.z], [f.x, 0, f.z], 1.0);
        if (low && low.box) {
          const high = phys.ray([this.pos.x, this.pos.y + 1.65, this.pos.z], [f.x, 0, f.z], 1.6);
          if (this.goal === 'chase' && this.feet && this.air === 0 && !high && longLow(low.box, this.pos.y, 1.5)) { this.vault(low.box.max[1]); return; }
          const sideRay = (a) => { const c = Math.cos(this.yaw + a), s = Math.sin(this.yaw + a); return phys.ray([this.pos.x, y0, this.pos.z], [s, 0, c], 1.4); };
          const l = sideRay(0.8), r = sideRay(-0.8);
          this.avoid = !l ? 0.9 : !r ? -0.9 : (l.t > r.t ? 0.9 : -0.9);
          this.avoidT = 0.7;
        }
      }
      this.stuckT = (this.stuckT || 0) + 0.2;
      if (this.stuckT >= 1) {
        if (this.stuckAt && this.stuckAt.distanceTo(this.pos) < 0.15 * speed) { this.avoid = Math.random() < 0.5 ? 1.3 : -1.3; this.avoidT = 0.9; }
        (this.stuckAt || (this.stuckAt = new THREE.Vector3())).copy(this.pos);
        this.stuckT = 0;
      }
    }
    const err = face ? 0 : Math.abs(wrap(Math.atan2(target.x - this.pos.x, target.z - this.pos.z) + (this.avoidT > 0 ? this.avoid : this.detour || 0) - this.yaw));   // (slows to turn, not to go round)
    const sp = speed * Math.max(0.25, Math.cos(Math.min(Math.PI / 2, err)));
    phys.slide(this.pos, f.x * sp * dt, f.z * sp * dt, this.r, 1.6, 0.45);
    if (side) this.play('walk', 0.3, lean ? Math.max(0.5, speed / (K.gait?.walk || K.walk)) : 0.8);
    else if (speed > K.walk * 1.6) this.play('run', 0.25, speed / (K.gait?.run || K.run));      // (at the pace its clips were made for)
    else this.play('walk', 0.3, (back ? -1 : 1) * Math.max(0.5, speed / (K.gait?.walk || K.walk)));
  }

  /** Start a melee move (it lands at the clip's hit frame). */
  /** A gesture (nod_no, nod_yes, idle_talk, cast_ready): where it stands, facing you. */
  gesture(name) {
    if (!this.ual || !this.actions[name] || this.state !== 'move' || this.dead || !this.feet) return false;
    this.state = 'gesture';
    this.play(name, 0.18);
    this.gestureT = Math.min(1.8, this.actions[name].getClip().duration);
    return true;
  }

  strike(name, lunge = 0) {
    this.state = 'attack';
    this.lungeT = this.ual ? 0 : lunge;
    this.dash = this.ual ? DASH[name] || null : null;
    this.hitI = 0; this.recovering = false;
    this.play(name, 0.1, this.kind.swing || 1);
    this.foes.voice(this, 'attack');
  }

  attacking(dt, player, active, dist, facingErr) {
    const a = this.actions[this.cur];
    const dash = this.dash && a && a.time >= this.dash[0] && a.time <= this.dash[1] ? this.dash[2] : 0;
    if (this.lungeT > 0 || dash) {
      const f = this.forward(), sp = dash || 4.6;
      this.owner.physics.slide(this.pos, f.x * sp * dt, f.z * sp * dt, this.r, 1.6, 0.45);
    } else if (this.goal === 'chase' && active && !this.recovering) {             // keep turning onto you through the wind-up
      const turn = this.kind.turn * 0.5 * dt, want = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      this.yaw += Math.max(-turn, Math.min(turn, wrap(want - this.yaw)));
    }
    const at = [this.hits[this.cur] ?? 14].flat();      // (a move may land more than one blow)
    if (!this.fired && a && a.time * FPS >= at[this.hitI || 0]) {
      this.hitI = (this.hitI || 0) + 1;
      this.fired = this.hitI >= at.length;
      const reach = this.kind.reach + (this.cur === 'attack3' && this.kindName === 'ghast' ? 0.4 : 0.2);
      this.foes.sound('swing', this.pos, this.kindName);
      if (active && dist < reach && facingErr < 1.1 && Math.abs(player.pos.y - this.pos.y) < 1.3 && !this.owner.physics.between(this.pos, player.pos)) {
        this.owner.onPlayerHit?.(this.kind.dmg[this.cur] ?? 10, this);
        if (this.cur === 'bash' || (this.kindName === 'grubber' && this.cur === 'attack1')) {   // knocked back
          const f = this.forward();
          player.vel.x += f.x * 6; player.vel.z += f.z * 6; player.vel.y = Math.max(player.vel.y, 2.5);
        }
      }
    }
    if (this.done()) {
      this.state = 'move';
      const was = this.cur, rec = this.recovering;
      this.recovering = false;
      const next = !rec && this.comboQ?.shift();     // the next cut of a combination, while you're still there
      if (next && active && this.goal === 'chase' && dist < this.kind.reach + 0.5 && facingErr < 1.0 && (next !== 'bash' || this.shield)) { this.strike(next); return; }
      this.comboQ = null;
      if (!rec) this.cool = this.kind.cool[0] + Math.random() * (this.kind.cool[1] - this.kind.cool[0]);
      // a cut that ends with the blade up or out comes back to the guard (no blow in it)
      if (!rec && this.actions[was + '_rec']) {
        this.state = 'attack'; this.recovering = true; this.dash = null;
        this.play(was + '_rec', 0.06, this.kind.swing || 1);
        this.fired = true;
      }
    }
  }

  // ---- knights
  raiseShield(t) {
    this.parrying = false;
    if (!this.shield || !this.arm('L')) {
      // the Sworn on the library's clips parry with the blade instead, while they've an arm to
      if (!this.ual || !this.arm('R') || !this.has('handR') || !this.actions.parry) return;
      this.parrying = true;
      this.state = 'block'; this.blockT = Math.min(t, 0.9); this.play('parry', 0.1);
      return;
    }
    this.state = 'block'; this.blockT = t; this.play('block', 0.12);
  }

  blocking(dt, player, active, dist) {
    this.blockT -= dt;
    const turn = this.kind.turn * dt, want = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.yaw += Math.max(-turn, Math.min(turn, wrap(want - this.yaw)));
    const advance = dist > 1.3 && dist < 4;
    if (advance) this.owner.physics.slide(this.pos, Math.sin(this.yaw) * 0.5 * dt, Math.cos(this.yaw) * 0.5 * dt, this.r, 1.6, 0.45);
    // the Sworn step in behind the shield (it stays up: see shieldArm), the others edge in on the block
    if (this.def.body && !this.parrying) this.play(advance ? 'walk' : 'block', 0.2, advance ? 0.5 / (this.kind.gait?.walk || this.kind.walk) : 1);
    if (this.blockT <= 0 || (!this.shield && !this.parrying)) {
      this.state = 'move'; this.blockCool = 1.2 + Math.random() * 1.5; this.parrying = false;
      if (this.counter && dist < this.kind.reach + 0.3) {
        this.strike(this.counter);
        if (this.def.body) this.comboQ = !this.ual ? ['attack2'] : this.counter === 'attack1' ? ['attack2'] : ['attack1', 'attack2'];
        this.counter = null;
      }
    }
  }

  /** Out of the room it keeps, you're none of its business: back to its post, facing the way in.
   * Their lord can still call Velscour's fire down on you if he can see you. */
  keepPost(dt, player, active, dist) {
    if (this.def.boss && active && this.canSee && !this.bigCool && dist < 24) { this.invoke(player); return; }
    const away = Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z) > 0.7;
    if (away) this.go(dt, this.home, this.kind.walk);
    else this.go(dt, null, 0, { face: _v.set(this.pos.x + Math.sin(this.postYaw) * 4, this.pos.y, this.pos.z + Math.cos(this.postYaw) * 4) });
  }

  /** The lord raises his blade to Velscour, and the ground under you burns a moment later. */
  invoke(player) {
    this.foes.hex(this, player);
    this.bigCool = (this.enraged ? 5 : 8) + Math.random() * 4;
    this.strike(this.ual ? 'attack1' : 'attack2');
  }

  /** Brought to half his life, the lord's fire comes up: he's quicker, and strikes sooner. */
  enrage() {
    this.enraged = true;
    this.kind = { ...this.kind, walk: this.kind.walk * 1.25, run: this.kind.run * 1.2, turn: this.kind.turn * 1.3, cool: [0.45, 1.0] };
    this.foes.flash(this.pos.clone().add(_u.set(0, 2.2, 0)), 0xff3010, 0.9);
    this.voiceT = 0;
    this.foes.voice(this, 'alert');
    const g = this.owner.gore;
    for (let i = 0; i < 60; i++) g.drop(_t.copy(this.pos).add(_u.set((Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 2.2, (Math.random() - 0.5) * 1.2)),
      _w.set((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5), 0.016, EMBERS[i % 3]);
  }

  /** The lord's glow (pulsing; brighter enraged; fading when he's dead), the embers coming off
   * him and the red light he throws. */
  burn(dt, player) {
    const k = (this.dead ? Math.max(0, 1 - this.deadT / 3) : 1) * (0.72 + 0.28 * Math.sin(this.owner.time * 3.1)) * (this.enraged ? 1.6 : 1);
    for (const m of this.glowMats || []) m.emissive.setRGB(1.7 * k, 0.17 * k, 0.05 * k);
    const L = this.foes.bossLight;
    if (L) {
      this.bones.chest.getWorldPosition(L.position);
      L.position.addScaledVector(this.forward(_u), 0.6);
      L.intensity = this.gone || Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) > 45 ? 0 : 7 * k;
    }
    if (k > 0.05 && this.root.visible && Math.random() < dt * 26 * k) {
      const b = this.bones[['chest', 'upper_armL', 'upper_armR', 'head', 'thighL', 'thighR'][Math.floor(Math.random() * 6)]];
      if (!this.cutAway(b.name)) this.owner.gore.drop(b.getWorldPosition(_t), _w.set((Math.random() - 0.5) * 0.6, 1 + Math.random() * 1.6, (Math.random() - 0.5) * 0.6), 0.012, EMBERS[Math.floor(Math.random() * 3)]);
    }
  }

  // ---- the Sworn
  /** A knight of the Vigil. They take you two at a time (their lord as he likes), the rest
   * circling a few strides off with their shields ready, waiting their turn. Up close they cut in
   * combinations of two and three; from further off they lunge, or come at you behind the shield at
   * a run and bash you off your feet. They get the shield up when they see you swing, bash your
   * guard when you hide behind yours, and answer any blow that rings off theirs. */
  sworn(dt, player, dist, fe) {
    const K = this.kind, now = this.owner.time;
    if (this.def.boss) {
      if (!this.enraged && this.hp < K.hp * 0.5) this.enrage();
      if (this.canSee && !this.bigCool && dist > 4 && dist < 18 && Math.random() < dt * 1.5) { this.invoke(player); return; }
    }
    const shield = this.shield && this.arm('L'), armed = this.arm('R') && this.has('handR');
    const guard = shield || (this.ual && armed);      // (on the library's clips they parry with the blade when the shield's gone)
    if (guard && !this.blockCool && dist < K.reach + 1.2 && fe < 0.9 && now - (player.swingAt ?? -9) < 0.2 && Math.random() < (this.def.boss ? 0.3 : shield ? 0.45 : 0.3)) {
      if (!shield && this.feet && this.actions.roll && Math.random() < 0.5) this.dodge(); else this.raiseShield(0.45 + Math.random() * 0.35);
      return;
    }
    const turn = this.def.boss || this.foes.engage(this, player);
    if (dist < K.reach * 1.1 && fe < 0.5 && !this.cool && (turn || dist < K.reach * 0.8)) {   // (they stop at 1.05 reach: see below)
      if (player.blocking && shield && Math.random() < 0.6) { this.strike('bash'); this.comboQ = armed ? (this.ual ? ['attack1', 'attack2'] : ['attack2']) : null; return; }   // through your guard
      if (armed) { this.combo(shield); return; }
      if (shield) { this.strike('bash'); return; }
      if (this.ual && this.actions.punch1 && (this.arm('L') || this.arm('R'))) {      // bare-handed: a jab, a cross
        this.strike(this.arm('L') ? 'punch1' : 'punch2');
        this.comboQ = this.arm('L') && this.arm('R') ? ['punch2'] : null;
        return;
      }
    }
    if (turn && this.feet && armed && fe < 0.35 && dist > 2.6 && dist < 5.2 && this.lungeCool < 0) {   // a lunging cut
      this.lungeCool = 3.5 + Math.random() * 3;
      this.strike(this.ual ? 'lunge' : 'attack3', 0.42);
      return;
    }
    // a leaping strike: up and on you from five to eight strides off, the blow landing as it comes down
    this.leapCool = (this.leapCool ?? Math.random() * 2.5) - dt;
    if (this.ual && this.actions.leap && turn && this.feet && armed && fe < 0.3 && dist > 5.2 && dist < 8 && this.leapCool < 0 && this.canSee) {
      this.leapCool = 9 + Math.random() * 7;
      this.hits.leap ??= Math.round(this.actions.leap.getClip().duration * FPS * 0.74);
      this.strike('leap');
      return;
    }
    if (turn && this.feet && shield && this.canSee && !this.rushCool && dist > 5.5 && dist < 11 && fe < 0.4) {   // the shield charge
      this.state = 'charge'; this.rushT = 2.4; this.rushCool = 7 + Math.random() * 5;
      this.foes.voice(this, 'alert');
      return;
    }
    if (dist < 0.95) { this.go(dt, player.pos, K.walk * 0.8, { face: player.pos, back: true }); return; }
    if (turn) {
      const close = dist < K.reach * 1.05;
      this.go(dt, this.flanked(player, dist), close ? 0 : dist > 5 && this.feet ? K.run : K.walk * 1.2, close ? { face: player.pos } : {});
      return;
    }
    // waiting its turn: round you a few strides off, facing you, shield up now and then
    this.circleT = (this.circleT ?? 0) - dt;
    if (this.circleT < 0) { this.circleT = 1.5 + Math.random() * 2.5; this.circleDir = Math.random() < 0.5 ? -1 : 1; }
    if (shield && !this.blockCool && dist < 5 && Math.random() < dt * 0.35) { this.raiseShield(0.6 + Math.random() * 0.6); return; }
    if (dist > 5.5 || !this.canSee) this.go(dt, this.route(player.pos), dist > 9 && this.feet ? K.run : K.walk);
    else if (dist < 3.2) this.go(dt, player.pos, K.walk * 0.9, { face: player.pos, back: true });
    else this.go(dt, player.pos, K.walk * 0.75, { face: player.pos, side: this.circleDir });
  }

  /** Out of the way of your swing: a roll to one side (no blow in it; the cut ends it). */
  dodge() {
    this.state = 'attack'; this.comboQ = null; this.recovering = true; this.hitI = 0;
    this.yaw += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    this.lungeT = 0; this.dash = DASH.roll;
    this.play('roll', 0.08);
    this.fired = true;
    this.blockCool = 1.5 + Math.random();
  }

  /** Two or three cuts one after another (attacking() strikes the rest while you're still there). */
  combo(shield) {
    if (this.ual) {
      if (this.def.boss && this.actions.heavy && Math.random() < 0.3) { this.strike('heavy'); return; }   // the lord's four great blows
      // the three cuts flow one into the next: the first ends with the blade up, where the second
      // starts, and the third ends back in the guard (so a combination always opens with the first)
      const U = [['attack1'], ['attack1', 'attack2'], ['attack1', 'attack2'], ['attack1', 'attack2', 'attack3'], ['attack1', 'attack2', 'attack3']];
      if (this.actions.attack4) U.push(['attack4'], ['attack4', 'attack1']);     // the overhead cut
      if (shield) U.push(['bash', 'attack1', 'attack2'], ['attack1', 'attack2', 'bash']);
      const c = U[Math.floor(Math.random() * U.length)];
      this.strike(c[0]);
      this.comboQ = c.slice(1);
      return;
    }
    const C = [['attack1', 'attack2'], ['attack2', 'attack1', 'attack3'], ['attack1', 'attack3'], ['attack2', 'attack3'], ['attack3', 'attack1']];
    if (shield) C.push(['attack1', 'attack2', 'bash'], ['bash', 'attack2']);
    const c = C[Math.floor(Math.random() * C.length)];
    this.strike(c[0]);
    this.comboQ = c.slice(1);
  }

  /** The shield charge: at a run straight at you behind the shield, and the bash when it gets there
   * (spent after a couple of seconds, or when something stops it). */
  charging(dt, player, dist, fe) {
    this.rushT -= dt;
    const K = this.kind, turn = K.turn * 0.8 * dt, want = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.yaw += Math.max(-turn, Math.min(turn, wrap(want - this.yaw)));
    const gait = this.ual && this.actions.sprint ? 'sprint' : 'run';     // (on the library's clips, flat out)
    const f = this.forward(_u), sp = K.run * (gait === 'sprint' ? 1.4 : 1.1) * this.pace * this.slow, x0 = this.pos.x, z0 = this.pos.z;
    this.owner.physics.slide(this.pos, f.x * sp * dt, f.z * sp * dt, this.r, 1.6, 0.45);
    this.play(gait, 0.2, sp / (K.gait?.[gait] || K.run));
    if (dist < K.reach + 0.4 && fe < 0.6) { this.strike('bash', 0.2); this.comboQ = this.arm('R') ? ['attack1'] : null; return; }
    if (this.rushT <= 0 || !this.shield || Math.hypot(this.pos.x - x0, this.pos.z - z0) < sp * dt * 0.3) this.state = 'move';
  }

  // ---- the Vigil's adepts
  /** An adept keeps a few strides off, circling, casting blood at you, calling Velscour's fire up
   * under you and mending its wounded brothers; cornered, it cuts at you or blinks away. */
  adept(dt, player, dist, fe) {
    const K = this.kind, F = this.foes, now = this.owner.time, hands = this.arm('L') || this.arm('R');
    if (dist < 2.4 && this.feet && !this.blinkCool && (now - (player.swingAt ?? -9) < 0.3 || Math.random() < dt * 0.8)) { this.state = 'blink'; this.play('blink', 0.1); return; }
    if (dist < K.reach && fe < 0.5 && !this.cool && this.arm('R') && this.has('handR')) { this.combo(false); return; }
    if (hands && !this.wardCool && !this.spellCool) {
      const ally = F.wounded(this, 14);
      if (ally) { this.state = 'cast'; this.spell = 'ward'; this.wardOn = ally; this.play('cast2', 0.12); F.voice(this, 'chant'); return; }
    }
    if (this.canSee && hands && !this.bigCool && dist > 4 && dist < 18) { this.state = 'cast'; this.spell = 'cast2'; this.play('cast2', 0.12); F.voice(this, 'chant'); return; }
    if (this.canSee && hands && !this.spellCool && dist < 26 && fe < 0.9) { this.state = 'cast'; this.spell = 'cast1'; this.play(this.ual && this.actions.cast ? 'cast' : 'cast1', 0.1, 1.15); return; }
    if (!this.canSee || dist > 12) { this.go(dt, this.route(player.pos), dist > 9 && this.feet ? K.run : K.walk); return; }
    if (dist < 5) { this.go(dt, player.pos, K.walk, { face: player.pos, back: true }); return; }
    this.circleT = (this.circleT ?? 0) - dt;
    if (this.circleT < 0) { this.circleT = 1.5 + Math.random() * 2.5; this.circleDir = Math.random() < 0.5 ? -1 : 1; }
    this.go(dt, player.pos, K.walk * 0.8, { face: player.pos, side: this.circleDir });
  }

  knight(dt, player, dist, fe) {
    const K = this.kind;
    // you squaring up to it with your eyes on it: it gets its shield up
    const pf = _u.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const toMe = _w.set(this.pos.x - player.pos.x, 0, this.pos.z - player.pos.z).normalize();
    const watched = pf.dot(toMe) > 0.85;
    if (watched && dist < 3.2 && !this.blockCool && !this.cool && this.shield && this.arm('L') && Math.random() < dt * 2.2) {
      this.raiseShield(0.7 + Math.random() * 1.1);
      return;
    }
    if (this.ual && dist < K.reach * 1.1 && fe < 0.5 && !this.cool && this.arm('R') && this.has('handR')) { this.combo(this.shield && this.arm('L')); return; }
    if (dist < K.reach && fe < 0.5 && !this.cool) {
      const moves = [];
      if (this.arm('R') && this.has('handR')) moves.push('attack1', 'attack2', 'attack3', 'attack1');
      if (this.shield && this.arm('L')) moves.push('bash');
      if (moves.length) { this.strike(moves[Math.floor(Math.random() * moves.length)]); return; }
    }
    if (dist < 0.95) { this.go(dt, player.pos, K.walk * 0.7, { face: player.pos, back: true }); return; }
    const target = this.flanked(player, dist);
    this.go(dt, target, dist > 7 && this.feet ? K.run : dist < K.reach * 1.1 ? 0 : K.walk, dist < K.reach * 1.1 ? { face: player.pos } : {});
  }

  /** With company it comes at you from the side, so they close round you. */
  flanked(player, dist) {
    const t = this.route(_v.copy(player.pos));
    if (t === _v && this.flank && dist > 2.4 && dist < 10 && this.owner.chasers > 1) {
      const s = this.flank * Math.min(2.6, dist * 0.45) / dist;
      t.x += -(player.pos.z - this.pos.z) * s; t.z += (player.pos.x - this.pos.x) * s;
    }
    return t;
  }

  // ---- sorcerers
  sorcerer(dt, player, dist, fe) {
    const K = this.kind;
    if ((this.blinkNow || dist < 2.6) && !this.blinkCool && this.feet) { this.blinkNow = false; this.state = 'blink'; this.play('blink', 0.1); return; }
    if (dist < 1.8 && fe < 0.6 && !this.cool && this.arm('R')) { this.strike('attack1'); return; }
    const hands = this.arm('L') || this.arm('R');
    if (this.canSee && hands && !this.bigCool && dist < 22 && dist > 4) { this.state = 'cast'; this.spell = 'cast2'; this.play('cast2', 0.12); this.foes.voice(this, 'chant'); return; }
    if (this.canSee && hands && !this.spellCool && dist < 30 && fe < 0.3) { this.state = 'cast'; this.spell = 'cast1'; this.play(this.ual && this.actions.cast ? 'cast' : 'cast1', 0.1); return; }
    // keep its distance: back off when you're close, close in when it can't see you, else circle
    if (!this.canSee || dist > 17) { this.go(dt, this.route(player.pos), dist > 12 ? K.run * 0.8 : K.walk); return; }
    if (dist < 7) { this.go(dt, player.pos, K.walk * 1.1, { face: player.pos, back: true }); return; }
    this.circleT = (this.circleT ?? 0) - dt;
    if (this.circleT < 0) { this.circleT = 2 + Math.random() * 3; this.circleDir = Math.random() < 0.5 ? -1 : 1; }
    this.go(dt, player.pos, K.walk * 0.7, { face: player.pos, side: this.circleDir });
  }

  casting(dt, player, active, dist) {
    const a = this.actions[this.cur];
    const turn = this.kind.turn * dt, want = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.yaw += Math.max(-turn, Math.min(turn, wrap(want - this.yaw)));
    if (!this.fired && a && a.time * FPS >= (this.hits[this.cur] ?? 15)) {
      this.fired = true;
      if (this.spell === 'cast1') {
        const hand = this.bones[this.arm('L') ? 'handL' : 'handR'];
        const from = hand.getWorldPosition(new THREE.Vector3());
        from.addScaledVector(this.forward(_u), 0.25);
        this.foes.bolts.fire(from, player, this.def.spell, this);
        this.spellCool = 2.2 + Math.random() * 1.8;
      } else if (this.spell === 'ward') {    // an adept mending a brother
        this.foes.ward(this, this.wardOn);
        this.wardCool = 12 + Math.random() * 6;
        this.spellCool = 1.2;
      } else {
        if (this.def.big === 'summon') this.foes.summon(this, player);
        else this.foes.hex(this, player);
        this.bigCool = 16 + Math.random() * 10;
        this.spellCool = 1.5;
      }
    }
    if (this.done()) { this.state = 'move'; this.cool = 0.4; }
  }

  blinking(dt, player) {
    const a = this.actions[this.cur];
    if (!this.fired && a && a.time * FPS >= 14) {
      this.fired = true;
      this.foes.blink(this, player);
    }
    if (this.done()) { this.state = 'move'; this.blinkCool = 6 + Math.random() * 4; }
  }

  // ---- ghasts
  ghast(dt, player, dist, fe) {
    const K = this.kind;
    this.routine ??= ['raker', 'pouncer', 'circler'][Math.floor(Math.random() * 3)];
    if (!this.shrieked && this.has('head')) {
      this.shrieked = true; this.state = 'shriek'; this.play('shriek', 0.1);
      this.foes.voice(this, 'shriek');
      this.owner.alert(this, player.pos, 26);
      return;
    }
    // badly hurt: it falls back and shrieks again, and whatever's near comes
    if (!this.shrieked2 && this.hp < K.hp * 0.45 && this.has('head') && dist > 1.8) {
      this.shrieked2 = true; this.state = 'shriek'; this.play('shriek', 0.1);
      this.foes.voice(this, 'shriek');
      this.owner.alert(this, player.pos, 32);
      this.retreatT = 0.7;
      return;
    }
    if (dist < 1.7 && fe < 0.6 && !this.cool) {
      const moves = [this.arm('R') && 'attack1', this.arm('L') && 'attack2'].filter(Boolean);
      if (moves.length) {
        const first = moves[Math.floor(Math.random() * moves.length)];
        this.strike(first);
        this.diving = false; this.circleT = 0;
        if (this.routine === 'raker' && moves.length > 1) {          // one hand, the other, and again
          this.comboQ = Math.random() < 0.5 ? [first === 'attack1' ? 'attack2' : 'attack1'] : [first === 'attack1' ? 'attack2' : 'attack1', first];
          this.retreatT = Math.random() < 0.5 ? 2.4 : 0;
        } else this.retreatT = this.routine === 'circler' ? 1.3 : Math.random() < 0.4 ? 0.9 : 0;   // (the circler: in, and away)
        return;
      }
    }
    const far = this.routine === 'pouncer' ? 6.8 : 5;
    if (dist > 2.6 && dist < far && fe < 0.3 && this.lungeCool < 0 && this.feet && (this.arm('L') || this.arm('R'))) {
      this.lungeCool = (this.routine === 'pouncer' ? 1.6 : 3) + Math.random() * 3;
      this.strike('attack3', 0.45);
      if (this.routine === 'pouncer') this.comboQ = [this.arm('R') ? 'attack1' : 'attack2'];   // (raking as it lands)
      return;
    }
    if (this.retreatT > 0) { this.go(dt, player.pos, K.run * 0.6, { face: player.pos, back: true }); return; }
    // the circler wheels round you a few strides off till your back is to it (or it tires of it), then darts in
    if (this.routine === 'circler' && !this.diving && dist > 2.4 && dist < 8 && this.feet) {
      const fx = -Math.sin(player.yaw || 0), fz = -Math.cos(player.yaw || 0), tx = this.pos.x - player.pos.x, tz = this.pos.z - player.pos.z, tl = Math.hypot(tx, tz) || 1;
      const looking = (fx * tx + fz * tz) / tl;
      this.circleT = (this.circleT || 0) + dt;
      if (looking < 0.2 || this.circleT > 7) this.diving = true;
      else {
        this.wheel ??= Math.random() < 0.5 ? 1 : -1;
        const a = Math.atan2(tx, tz) + this.wheel * 0.9, r = 4.2;
        _v.set(player.pos.x + Math.sin(a) * r, this.pos.y, player.pos.z + Math.cos(a) * r);
        this.go(dt, this.route(_v), K.run * 0.75, { face: player.pos });
        return;
      }
    }
    const t = this.route(_v.copy(player.pos));
    if (t === _v && dist > 3) {                    // a zigzag lope
      this.zig += dt * 3;
      const s = Math.sin(this.zig) * Math.min(2, dist * 0.3) / dist;
      t.x += -(player.pos.z - this.pos.z) * s; t.z += (player.pos.x - this.pos.x) * s;
    }
    this.go(dt, t, dist < 1.4 ? 0 : this.feet ? K.run : K.walk, dist < 1.4 ? { face: player.pos } : {});
  }

  // ---- grubbers
  grubber(dt, player, dist, fe) {
    const K = this.kind;
    this.routine ??= ['brawler', 'biter', 'charger'][Math.floor(Math.random() * 3)];
    const mad = this.hp < K.hp * 0.35;                 // (badly hurt: frenzied)
    if (mad && this.cool > 0.35) this.cool = 0.35;
    // charging into you: a ram, and you're thrown back (its club blow knocks you back)
    if (this.chargeT > 0 && dist < K.reach + 0.7 && fe < 0.5 && this.arm('R') && !this.cool) {
      this.chargeT = 0; this.chargeCool = 2.5 + Math.random() * 2; this.strike('attack1'); return;
    }
    if (dist < K.reach && fe < 0.6 && !this.cool) {
      const club = this.arm('R') && 'attack1', over = this.arm('R') && 'attack3', jaw = this.has('head') && 'attack2';
      const runs = this.routine === 'brawler' ? [[club, over], [over, club], [club, jaw], [club]]
        : this.routine === 'biter' ? [[jaw, club], [jaw], [jaw, over]]
        : [[club], [over], [jaw]];
      const ok = runs.map((r) => r.filter(Boolean)).filter((r) => r.length);
      if (ok.length) {
        const r = ok[Math.floor(Math.random() * ok.length)];
        this.chargeT = 0; this.strike(r[0]); this.comboQ = r.length > 1 ? r.slice(1) : null;
        return;
      }
    }
    const reach = this.routine === 'charger' ? 12 : 9;
    if (!this.chargeT && !this.chargeCool && dist > 3 && dist < reach && this.feet) { this.chargeT = this.routine === 'charger' ? 3.2 : 2.5; this.foes.voice(this, 'alert'); }
    if (this.chargeT > 0) { this.chargeT = Math.max(0, this.chargeT - dt); if (!this.chargeT) this.chargeCool = (this.routine === 'charger' ? 2.5 : 4) + Math.random() * 3; }
    const speed = (this.chargeT > 0 ? K.run * (this.routine === 'charger' ? 1.15 : 1) : K.walk) * (mad ? 1.3 : 1);
    this.go(dt, this.route(player.pos), dist < K.reach * 0.9 ? 0 : speed, dist < K.reach * 0.9 ? { face: player.pos } : {});
  }
}
const _f = new THREE.Vector3();

// ------------------------------------------------------------------ bolts, hexes, blinks
const glowTex = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const S = 64, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    t = new THREE.CanvasTexture(cv);
    return t;
  };
})();

class Bolts {
  constructor(foes) {
    this.foes = foes;
    this.list = [];
    this.core = new THREE.SphereGeometry(0.07, 8, 6);
    this.lights = [new THREE.PointLight(0xffffff, 0, 7, 1.6)];   // one light, on the newest bolt (lights are dear)
    foes.scene.add(this.lights[0]);
  }

  fire(from, player, kind, by) {
    const S = SPELL[kind] || SPELL.arcane;
    const aim = _v.copy(player.pos).add(_u.set(0, 1.2, 0));
    aim.addScaledVector(player.vel, from.distanceTo(aim) / S.speed * 0.6);    // leads you a little
    const v = aim.clone().sub(from).normalize().multiplyScalar(S.speed);   // its own (the scratch vectors move on)
    const m = new THREE.Mesh(this.core, new THREE.MeshBasicMaterial({ color: S.core, toneMapped: false }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: S.glow, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.scale.setScalar(0.7);
    m.add(halo);
    m.position.copy(from);
    this.foes.scene.add(m);
    this.list.push({ m, v, life: 3.5, S, by, home: 0.6, col: new THREE.Color(S.glow) });
    this.foes.sound('cast', from, kind);
  }

  burst(p, b) {
    const g = this.foes.zombies.gore;
    const c = [b.col, new THREE.Color(b.S.core), b.col.clone().multiplyScalar(0.6)];
    for (let i = 0; i < 40; i++) g.drop(p, _v.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).multiplyScalar(6), 0.012 + Math.random() * 0.012, c[i % 3]);
    this.foes.flash(p, b.S.glow, 0.35);
    this.foes.sound('burst', p, b.S);
  }

  update(dt, player) {
    const phys = this.foes.zombies.physics;
    for (const b of this.list) {
      b.life -= dt;
      if (b.home > 0) {                        // curls after you for a moment
        b.home -= dt;
        const want = _v.copy(player.pos).add(_u.set(0, 1.2, 0)).sub(b.m.position).normalize().multiplyScalar(b.v.length());
        b.v.lerp(want, Math.min(1, dt * 1.6));
      }
      const step = b.v.length() * dt, d = _w.copy(b.v).normalize(), p = b.m.position;
      const hit = phys.ray([p.x, p.y, p.z], [d.x, d.y, d.z], step);
      // you: a capsule from your feet to your head
      const a = _t.set(player.pos.x, player.pos.y + 0.3, player.pos.z);
      const q = closest(p, d, step, a, 1.3);
      if (q < 0.42) {
        this.foes.zombies.onPlayerHit?.(b.S.dmg, b.by, 'spell');
        this.burst(p.clone().addScaledVector(d, step * 0.5), b);
        b.life = 0;
        continue;
      }
      if (hit) { this.burst(p.clone().addScaledVector(d, hit.t), b); b.life = 0; continue; }
      p.addScaledVector(d, step);
      if (Math.random() < dt * 40) this.foes.zombies.gore.drop(p, _v.set((Math.random() - 0.5) * 0.4, -0.2, (Math.random() - 0.5) * 0.4), 0.008, b.col);
    }
    for (const b of this.list) if (b.life <= 0) { this.foes.scene.remove(b.m); b.m.material.dispose(); b.m.children[0].material.dispose(); }
    this.list = this.list.filter((b) => b.life > 0);
    this.lights.forEach((l, i) => {
      const b = this.list[this.list.length - 1 - i];
      if (!b) { l.intensity = 0; return; }
      l.position.copy(b.m.position); l.color.copy(b.col); l.intensity = 4;
    });
  }
}

/** Distance from the segment p + d*[0, len] to the vertical segment a + y*[0, h]. */
function closest(p, d, len, a, h) {
  let best = Infinity;
  for (let i = 0; i <= 4; i++) {
    const t = len * i / 4, x = p.x + d.x * t, y = p.y + d.y * t, z = p.z + d.z * t;
    const yy = Math.max(a.y, Math.min(a.y + h, y));
    best = Math.min(best, Math.hypot(x - a.x, y - yy, z - a.z));
  }
  return best;
}

// ------------------------------------------------------------------ the foes
export class Foes {
  /** zombies: the horde (the foes join its list); manifest: templates/models/manifest.json. */
  constructor(zombies, manifest, ctx) {
    this.zombies = zombies; this.manifest = manifest; this.ctx = ctx;
    this.scene = zombies.scene;
    zombies.foes = this;
    this.gltf = {}; this.items = {}; this.sock = {};
    this.loader = new GLTFLoader();
    this.texLoader = new THREE.TextureLoader();
    this.bolts = new Bolts(this);
    this.hexes = [];
    this.lost = [];       // dropped weapons and shields
    this.flashes = [];
    this.cave = null;
    this.flashLight = new THREE.PointLight(0xffffff, 0, 8, 1.5);
    this.scene.add(this.flashLight);
    this.keep = null; this.boss = null;
    // the light the Sworn's burning lord throws about him (made now, with the others: a light added
    // later would have every material rebuilt; a phone does without)
    this.bossLight = TOUCH ? null : new THREE.PointLight(0xff3018, 0, 10, 1.6);
    if (this.bossLight) this.scene.add(this.bossLight);
  }

  async load(variants = VARIANTS) {
    await Promise.all(variants.map(async (v) => {
      const g = await this.loader.loadAsync(`${ROOT}${v}.glb`);
      g.userData = { ...(g.userData || {}), foe: JSON.parse(g.scene.userData.foe || '{}') };
      this.gltf[v] = g;
    }));
    await this.loadItems(variants);
  }

  /** The open country's knights and sorcerers on the knight's clips (ual.js), made once the world is
   * up so the start doesn't wait on them: once for each skeleton (two between the six of them), a
   * few milliseconds at a time. A sorcerer (no shield) takes the library's own stance, walk, jog and
   * sprint, the knight's guard kept as `guard`; each keeps its own clips where the library has none
   * (the crawls, the spells). Those already out take them up where they stand. */
  async upgrade(variants = VARIANTS.filter((v) => FOES[v].kind === 'knight' || FOES[v].kind === 'sorcerer')) {
    const src = await loadUal(this.loader), sets = new Map();
    const both = { ...RECIPES, ...Object.fromEntries(['idle', 'walk', 'run', 'sprint'].map((k) => ['calm_' + k, CALM[k]])) };
    for (const v of variants) {
      const g = this.gltf[v];
      if (!g || g.userData.foe.ual) continue;
      let skel = null;
      g.scene.traverse((o) => { if (o.isSkinnedMesh && !skel) skel = o.skeleton; });
      const key = skel.boneInverses.map((m) => m.elements.map((x) => x.toFixed(3)).join()).join();
      if (!sets.has(key)) sets.set(key, await ualBody(src, g, { recipes: both }));
      const made = sets.get(key), calm = FOES[v].kind === 'sorcerer', G = made.gaits;
      const clips = made.clips.flatMap((c) => {
        const m = /^calm_(.*)/.exec(c.name);
        if (m) return calm ? [Object.assign(c.clone(), { name: m[1] })] : [];
        if (calm && c.name === 'idle') return [Object.assign(c.clone(), { name: 'guard' })];
        return calm && CALM[c.name] ? [] : [c];
      });
      const have = new Set(clips.map((c) => c.name));
      g.old = g.animations;
      g.animations = [...clips, ...g.old.filter((c) => !have.has(c.name))];
      const gait = calm ? { ...G, walk: G.calm_walk, run: G.calm_run, sprint: G.calm_sprint } : G;
      Object.assign(g.userData.foe, { ual: true, calm, gait, hits: { ...g.userData.foe.hits, ...made.hits } });
      for (const f of this.zombies.list || []) if (f instanceof Foe && f.variant === v) f.adopt(g);
    }
  }

  /** The Sworn (sworn.js): each body (a villager and its armour set, helmed or bareheaded, with
   * the sorcerers' casting if it casts) put together once on the animation library's clips (ual.js;
   * `ual` false: knight_a's alone, and `legacy` as they first were), then their weapons.
   * Each villager and set is loaded once, and built from copies. A phone loads the villagers' phone
   * copies, one body at a time. */
  async loadSworn(variants = SWORN, { ual = true, legacy = false } = {}) {
    const knight = this.gltf.knight_a || (await this.load(['knight_a']), this.gltf.knight_a);
    // the animation library (ual.js), read once
    if (ual && !this.ual) this.ual = await loadUal(this.loader);
    const files = new Map(), bodies = new Map();
    const file = (url) => { if (!files.has(url)) files.set(url, this.loader.loadAsync(url)); return files.get(url); };
    const body = (b) => {
      const key = `${b.villager}|${b.armor}|${b.helm !== false}|${b.casts || ''}`;
      if (!bodies.has(key)) bodies.set(key, (async () => {
        const [villager, armor] = await Promise.all([file(`${VILLAGERS}${b.villager}.glb`), file(`${ARMOR}${b.armor}/${b.armor}_${b.sex}.glb`)]);
        if (b.casts && !this.gltf[b.casts]) await this.load([b.casts]);
        return swornBody(knight, { scene: cloneSkinned(villager.scene) }, { scene: cloneSkinned(armor.scene) },
          { helm: b.helm !== false, casts: b.casts ? this.gltf[b.casts] : null, ual: ual ? this.ual : null, legacy });
      })());
      return bodies.get(key);
    };
    for (const v of variants) {
      const p = body(FOES[v].body);   // (all at once; a phone one at a time)
      if (TOUCH) await p;
    }
    for (const v of variants) this.gltf[v] = await body(FOES[v].body);
    await this.loadItems(variants);
  }

  /** How far out a Sworn's shield rides off the forearm (sworn.js's shieldLift), once per body
   * and shield. */
  lift(v, id, item) {
    const key = `${v}|${id}`;
    if (!(key in (this._lift ||= {}))) this._lift[key] = shieldLift(this.gltf[v], this.gltf[v].userData.foe.sockets.shieldL, item);
    return this._lift[key];
  }

  /** The weapons and shields the variants carry, in each of their finishes. */
  async loadItems(variants) {
    const ids = new Set();
    for (const v of variants) for (const s of ['R', 'L']) for (const id of FOES[v][s] || []) for (const f of [FOES[v].finish || ''].flat()) ids.add(`${id}|${f}`);
    const all = Object.values(this.manifest.items).flat();
    await Promise.all([...ids].map(async (key) => {
      const [id, finish] = key.split('|');
      const e = all.find((x) => x.id === id);
      if (!e) return;
      const g = await this.loader.loadAsync(ITEM_ROOT + e.path);
      let map = null;
      if (finish && e.variants?.[finish]) map = await this.texLoader.loadAsync(ITEM_ROOT + e.variants[finish]).catch(() => null);
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        const m = map || o.material.map;
        if (m) { if (map) { map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; } m.magFilter = THREE.NearestFilter; m.minFilter = THREE.NearestFilter; m.generateMipmaps = false; m.needsUpdate = true; }
        o.material = new THREE.MeshPhongMaterial({ map: m, side: THREE.DoubleSide, specular: 0x6a625a, shininess: 48 });
      });
      this.items[key] = g.scene;
    }));
  }

  /** The shield arm's carry and guard for a body (shieldPoses), worked out once per variant. */
  poses(f) {
    return (this._poses ||= {})[f.variant] ||= shieldPoses(f.skel, f.bones, !!f.def.body);
  }

  /** A socket of variant v as {bone, m (relative to the bone)}, worked out once per body. */
  sockets(v, name) {
    const key = `${v}|${name}`;
    if (!(key in this.sock)) {
      const s = this.gltf[v].userData.foe.sockets?.[name];
      this.sock[key] = s ? socketLocal(this.gltf[v].scene, s) : null;
    }
    return this.sock[key];
  }

  /** A foe of variant v at (x, z): opts {y, zone, room, area, patrol, start}. */
  spawn(v, x, z, opts = {}) {
    const zb = this.zombies, phys = zb.physics;
    const y = opts.y ?? phys.groundAt(x, z);
    const f = new Foe(this.gltf[v], v, zb, { ...opts, x, y, z });
    const def = FOES[v];
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const finish = pick([def.finish || ''].flat());
    if (def.R) { const it = this.items[`${opts.weapon || pick(def.R)}|${finish}`]; if (it) f.hold('gripR', it.clone()); }
    if (def.L) {                // a shield on the forearm (a Sworn's out as far as its dish needs), or an adept's staff
      const id = opts.shield || pick(def.L), it = this.items[`${id}|${finish}`], sock = def.Lsock || 'shieldL';
      if (it) {
        const obj = it.clone();
        if (def.body && sock === 'shieldL') obj.position.z = this.lift(v, id, it);
        f.hold(sock, obj);
      }
    }
    phys.slide(f.pos, 0, 0, f.r, 1.6, 0.45);
    f.home.copy(f.pos);
    f.sync();
    zb.list.push(f);
    return f;
  }

  // -------------------------------------------------------------- spells
  /** The dead clawing up out of the ground round you. */
  summon(by, player) {
    by.summoned = by.summoned.filter((z) => !z.dead && !z.gone);
    const n = Math.min(3, 5 - by.summoned.length);
    const phys = this.zombies.physics;
    for (let i = 0, made = 0; i < 12 && made < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 3;
      const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
      const fl = phys.floorAt(x, z, player.pos.y + 0.5, 0.3, 1.0);
      if (fl === -Infinity || Math.abs(fl - player.pos.y) > 1.2) continue;
      if ([...phys.near(x - 0.4, z - 0.4, x + 0.4, z + 0.4)].some((b) => b.min[1] < fl + 1.5 && b.max[1] > fl + 0.3 && x > b.min[0] - 0.3 && x < b.max[0] + 0.3 && z > b.min[2] - 0.3 && z < b.max[2] + 0.3)) continue;
      const zb = this.zombies.spawn(this.zombies.randomVariant(), x, z, { y: fl, zone: by.zone, kind: 'shambler', start: 'rise' });
      zb.yaw = Math.atan2(player.pos.x - x, player.pos.z - z);
      by.summoned.push(zb);
      made++;
    }
    this.flash(by.pos.clone().add(_u.set(0, 2, 0)), SPELL[by.def.spell].glow, 0.6);
  }

  /** A blood-red ring under you that bursts a moment later. */
  hex(by, player) {
    const y = this.zombies.floorY(player.pos.x, player.pos.z, player.pos.y + 0.3);
    const m = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.position.set(player.pos.x, y + 0.04, player.pos.z);
    this.scene.add(m);
    this.hexes.push({ m, t: 0, by });
    this.sound('hex', m.position);
  }

  /** Gone in a puff, and back out of one some way off. */
  blink(f, player) {
    const phys = this.zombies.physics, g = this.zombies.gore;
    const puff = (p) => {
      const c = new THREE.Color(SPELL[f.def.spell]?.glow ?? 0x8040ff);
      for (let i = 0; i < 50; i++) g.drop(_t.copy(p).add(_u.set((Math.random() - 0.5) * 0.6, Math.random() * 1.6, (Math.random() - 0.5) * 0.6)),
        _v.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.015, i % 3 ? c : new THREE.Color(0.08, 0.06, 0.1));
      this.flash(p.clone().add(_u.set(0, 1, 0)), SPELL[f.def.spell]?.glow ?? 0x8040ff, 0.4);
    };
    puff(f.pos);
    for (let i = 0; i < 16; i++) {
      const a = Math.atan2(f.pos.x - player.pos.x, f.pos.z - player.pos.z) + (Math.random() - 0.5) * 2.4;
      const r = 8 + Math.random() * 5;
      let x = player.pos.x + Math.sin(a) * r, z = player.pos.z + Math.cos(a) * r;
      const rm = f.room;
      if (rm) { x = Math.max(rm.x0 + 0.6, Math.min(rm.x1 - 0.6, x)); z = Math.max(rm.z0 + 0.6, Math.min(rm.z1 - 0.6, z)); }
      const fl = phys.floorAt(x, z, f.pos.y + 1.0, 0.3, 2.0);
      if (fl === -Infinity || Math.abs(fl - f.pos.y) > 2) continue;
      const blocked = [...phys.near(x - 0.4, z - 0.4, x + 0.4, z + 0.4)].some((b) => b.min[1] < fl + 1.7 && b.max[1] > fl + 0.45 && x > b.min[0] - 0.35 && x < b.max[0] + 0.35 && z > b.min[2] - 0.35 && z < b.max[2] + 0.35);
      if (blocked) continue;
      // (only where it can see you from: not inside a house you're outside of, not behind a wall)
      const ex = player.pos.x - x, ey = player.pos.y + 1.4 - (fl + 1.5), ez = player.pos.z - z, el = Math.hypot(ex, ey, ez) || 1;
      const sight = phys.ray([x, fl + 1.5, z], [ex / el, ey / el, ez / el], el, true);
      if (sight && sight.t < el - 0.5) continue;
      f.pos.set(x, fl, z);
      phys.nav?.forget(f);
      break;
    }
    f.yaw = Math.atan2(player.pos.x - f.pos.x, player.pos.z - f.pos.z);
    puff(f.pos);
    this.sound('blink', f.pos);
  }

  flash(p, color, t) {
    this.flashLight.position.copy(p);
    this.flashLight.color.set(color);
    this.flashT = t; this.flashMax = t;
  }

  /** An item let go of: it tumbles to the ground and lies there a while. */
  loose(g, v) {
    this.scene.attach(g);
    this.lost.push({ g, v: v.clone(), spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), w: 6 + Math.random() * 6, rest: false, age: 0 });
    if (this.lost.length > 40) { const o = this.lost.shift(); this.scene.remove(o.g); }
  }

  // -------------------------------------------------------------- voices and sounds
  sound(kind, p, extra) {
    const s = this.zombies.sfx;
    if (!s?.ctx) return;
    const d = this.zombies.listener ? this.zombies.listener.distanceTo(p) : 5;
    const k = Math.max(0, 1 - d / 40);
    if (k <= 0) return;
    const t = s.ctx.currentTime;
    if (kind === 'swing' && s.play('sword_attack', { at: p, far: 40, vol: 0.95, rate: extra === 'knight' ? 0.9 : 1.05 })) return;
    if (kind === 'cast' && s.play(extra === 'frost' || extra === 'ice' ? 'ice_throw' : extra === 'blood' || extra === 'venom' ? 'firebuff' : 'fireball', { at: p, far: 45, vol: 0.9, rate: extra === 'venom' ? 0.8 : 1 })) return;
    if (kind === 'burst' && s.play('spell_impact', { at: p, far: 45, vol: 1, rate: 0.9 })) { s._tone(t, 0.25, { type: 'sine', f0: 220, f1: 60, gain: 0.2 * k }); return; }
    if (kind === 'erupt' && s.play('rock_wall', { at: p, far: 50, vol: 1.1 })) return;
    if (kind === 'swing') {
      s._noise(t, 0.18, { type: 'bandpass', f0: extra === 'knight' ? 1800 : 1200, f1: 400, q: 2, gain: 0.25 * k, attack: 0.02 });
    } else if (kind === 'cast') {
      const f = extra === 'blood' ? 180 : extra === 'venom' ? 140 : 260;
      s._tone(t, 0.35, { type: 'sawtooth', f0: f, f1: f * 2.5, gain: 0.06 * k, attack: 0.02 });
      s._noise(t, 0.4, { type: 'bandpass', f0: 2400, f1: 900, q: 3, gain: 0.18 * k, attack: 0.03 });
    } else if (kind === 'burst') {
      s._noise(t, 0.35, { type: 'lowpass', f0: 2600, f1: 200, gain: 0.45 * k, attack: 0.004 });
      s._tone(t, 0.25, { type: 'sine', f0: 220, f1: 60, gain: 0.25 * k });
    } else if (kind === 'hex') {
      s._tone(t, 1.1, { type: 'sawtooth', f0: 55, f1: 110, gain: 0.08 * k, attack: 0.3 });
    } else if (kind === 'erupt') {
      s._noise(t, 0.6, { type: 'lowpass', f0: 900, f1: 120, gain: 0.7 * k, attack: 0.005 });
    } else if (kind === 'blink') {
      s._noise(t, 0.3, { type: 'highpass', f0: 3000, f1: 800, gain: 0.25 * k, attack: 0.005 });
      s._tone(t, 0.3, { type: 'sine', f0: 900, f1: 200, gain: 0.1 * k });
    }
  }

  /** A foe's own cry: armoured grunts, whispers, shrieks, snorts. */
  voice(f, what) {
    const s = this.zombies.sfx;
    if (!s?.ctx) return;
    const d = this.zombies.listener ? this.zombies.listener.distanceTo(f.pos) : 5;
    const k = Math.max(0, 1 - d / 45) * (what === 'shriek' ? 1.6 : 1);
    if (k <= 0 || (f.voiceT || 0) > s.ctx.currentTime) return;
    const t = s.ctx.currentTime;
    f.voiceT = t + (what === 'attack' ? 0.6 : 0.3);
    const kn = f.kindName;
    if (what === 'die') { this.zombies.sound('die', f.pos); return; }
    if (kn === 'knight') {
      const p = (85 + Math.random() * 20) / (f.size || 1);   // (the lord's is deeper)
      s._tone(t, what === 'alert' ? 0.7 : 0.3, { type: 'sawtooth', f0: p, f1: p * 0.8, gain: 0.07 * k, attack: 0.04 });
      s._noise(t, 0.12, { type: 'highpass', f0: 4000, f1: 2500, gain: 0.08 * k });    // the plate shifting
    } else if (kn === 'sorcerer') {
      s._noise(t, what === 'chant' ? 1.4 : 0.6, { type: 'bandpass', f0: 1600, f1: 700, q: 5, gain: 0.18 * k, attack: 0.15 });
      if (what === 'chant') s._tone(t, 1.4, { type: 'triangle', f0: 110, f1: 98, gain: 0.07 * k, attack: 0.3 });
    } else if (kn === 'ghast') {
      const p = what === 'shriek' ? 900 : 500 + Math.random() * 300;
      s._tone(t, what === 'shriek' ? 1.1 : 0.35, { type: 'sawtooth', f0: p, f1: p * 1.6, gain: 0.06 * k, attack: 0.03 });
      s._noise(t, what === 'shriek' ? 1.0 : 0.3, { type: 'bandpass', f0: 3200, f1: 1800, q: 4, gain: 0.2 * k, attack: 0.05 });
    } else {
      const p = 60 + Math.random() * 20;
      s._tone(t, 0.45, { type: 'sawtooth', f0: p, f1: p * 0.7, gain: 0.09 * k, attack: 0.03 });
      s._noise(t, 0.4, { type: 'lowpass', f0: 600, f1: 200, gain: 0.3 * k, attack: 0.02 });
    }
  }

  // -------------------------------------------------------------- each frame
  update(dt, player) {
    this.bolts.update(dt, player);
    const g = this.zombies.gore;
    for (const h of this.hexes) {
      h.t += dt;
      const k = Math.min(1, h.t / 1.2);
      h.m.material.opacity = 0.25 + 0.6 * k * (0.7 + 0.3 * Math.sin(h.t * 30));
      h.m.scale.setScalar(1.4 - 0.5 * k);
      if (h.t >= 1.2 && !h.done) {
        h.done = true;
        const p = h.m.position;
        g.spray(_t.copy(p).add(_u.set(0, 0.1, 0)), _v.set(0, 1, 0), 220, { speed: 7, spread: 0.35, size: 0.02 });
        g.splat(p.x, p.y - 0.04, p.z, 1.6, 0.2);
        this.flash(p.clone().add(_u.set(0, 1, 0)), 0xff2010, 0.4);
        this.sound('erupt', p);
        if (Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 1.7 && Math.abs(player.pos.y - p.y) < 1.5) {
          this.zombies.onPlayerHit?.(18, h.by, 'spell');
          player.vel.y = Math.max(player.vel.y, 5);
        }
      }
      if (h.t > 1.6) { this.scene.remove(h.m); h.m.geometry.dispose(); h.m.material.dispose(); h.gone = true; }
    }
    this.hexes = this.hexes.filter((h) => !h.gone);
    if (this.flashT > 0) { this.flashT -= dt; this.flashLight.intensity = 9 * Math.max(0, this.flashT / this.flashMax); } else this.flashLight.intensity = 0;
    for (const o of this.lost) {
      o.age += dt;
      if (o.rest) continue;
      o.v.y -= 13 * dt;
      o.g.position.addScaledVector(o.v, dt);
      o.g.rotateOnWorldAxis(o.spin, o.w * dt);
      const fl = this.zombies.floorY(o.g.position.x, o.g.position.z, o.g.position.y + 0.3) + 0.05;
      if (o.g.position.y < fl) {
        o.g.position.y = fl;
        if (o.v.y < -2) { o.v.multiplyScalar(0.35); o.v.y *= -0.5; o.w *= 0.4; this.zombies.sfx?.clang?.(true); }
        else {                                  // it falls flat
          const up = _u.set(0, 1, 0).applyQuaternion(o.g.getWorldQuaternion(new THREE.Quaternion()));
          const flat = _v.set(up.x, 0, up.z);
          if (flat.lengthSq() < 1e-4) flat.set(1, 0, 0);
          o.g.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(up.clone(), flat.normalize()));
          o.rest = true;
        }
      }
    }
    this.cave?.update?.(dt, player);
  }

  // -------------------------------------------------------------- Blackvigil Keep
  /** The keep's garrison at their posts (keep.js), the two guards of the Red Throne and its lord.
   * A phone gets half the garrison, all of them on the one body it loaded. */
  populateKeep(keep) {
    if (!keep) return;
    this.keep = keep;
    const put = ([v, x, z, o]) => {
      if (!this.gltf[v]) v = 'sworn_m';
      if (!this.gltf[v]) return null;
      const f = this.spawn(v, x, z, { y: 0, zone: 'keep', fitting: (this.fittings = (this.fittings ?? -1) + 1), ...o });   // (each fitting in turn)
      f.chat = !!o?.room && Math.random() < 0.6;      // (in the hall and the barracks, at ease, some talk)
      if (f.chat) f.play('idle', 0);
      return f;
    };
    let n = 0;
    for (const p of TOUCH ? keep.posts.filter((_, i) => i % 2 === 0) : keep.posts) n += put(p) ? 1 : 0;
    for (const p of keep.guards) n += put(p) ? 1 : 0;
    this.boss = put(keep.lord);
    console.info(`Blackvigil Keep: ${n} of the Sworn${this.boss ? ', and their lord' : ''}`);
  }

  /** Whether f may press you now: no more than two of the Sworn at a time, each for a while
   * before it falls back (only if another is waiting) and lets the next one in. */
  engage(f, player) {
    const t = this.zombies.time, waiting = t - (this.waitT ?? -9) < 0.6;
    this.pressing = (this.pressing || []).filter((q) => {
      const stay = !q.dead && !q.gone && q.goal === 'chase' && Math.hypot(q.pos.x - player.pos.x, q.pos.z - player.pos.z) < 10 && (t - q.pressT < 6 || !waiting);
      if (!stay) q.restT = t + 2 + Math.random() * 1.5;
      return stay;
    });
    if (this.pressing.includes(f)) return true;
    if (this.pressing.length >= 2 || (f.restT || 0) > t) { this.waitT = t; return false; }
    f.pressT = t;
    this.pressing.push(f);
    return true;
  }

  /** The most wounded of the Sworn within r of `by` (under 60% of its life), or null. */
  wounded(by, r) {
    let best = null;
    for (const z of this.zombies.list) {
      if (z === by || z.dead || z.gone || !z.def?.body || z.hp > z.kind.hp * 0.6) continue;
      if (Math.hypot(z.pos.x - by.pos.x, z.pos.z - by.pos.z) > r || Math.abs(z.pos.y - by.pos.y) > 2) continue;
      if (!best || z.hp / z.kind.hp < best.hp / best.kind.hp) best = z;
    }
    return best;
  }

  /** An adept mends a brother: Velscour's blood swirls up round him and closes a third of his wounds. */
  ward(by, f) {
    if (!f || f.dead || f.gone) return;
    f.hp = Math.min(f.kind.hp, f.hp + f.kind.hp * 0.35);
    const S = SPELL[by.def.spell] || SPELL.blood, g = this.zombies.gore;
    const col = [new THREE.Color(S.glow), new THREE.Color(S.core), new THREE.Color(1, 0.8, 0.4)];
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * 6.28, r = 0.4 + Math.random() * 0.4;
      g.drop(_t.copy(f.pos).add(_u.set(Math.cos(a) * r, 0.2 + Math.random() * 1.8 * f.size, Math.sin(a) * r)),
        _v.set(-Math.cos(a) * 0.6, 1.5 + Math.random() * 2, -Math.sin(a) * 0.6), 0.012, col[i % 3]);
    }
    this.flash(f.pos.clone().add(_u.set(0, 1.4, 0)), S.glow, 0.5);
    this.sound('cast', f.pos, by.def.spell);
  }

  /** The lord is dead: his light goes out, and the seal on the chest behind him breaks. */
  bossDown(f) {
    this.flash(f.pos.clone().add(_u.set(0, 2, 0)), 0xffc070, 1.2);
    this.keep?.unseal();
    this.onBossDown?.(f);
  }

  /** What the boss bar shows: the lord's name and life while you're fighting him (or in his room),
   * at nothing for a moment once he's down; null otherwise. */
  bossBar(player) {
    const b = this.boss;
    if (!b || b.gone) return null;
    if (b.dead) return b.deadT < 2.5 ? { name: b.def.title, frac: 0 } : null;
    const near = Math.hypot(player.pos.x - b.pos.x, player.pos.z - b.pos.z) < 32 && Math.abs(player.pos.y - b.pos.y) < 4;
    const engaged = b.aggro || (b.keeps && this.keep?.inside(b.keeps, player.pos));
    return near && engaged ? { name: b.def.title, frac: b.hp / b.kind.hp } : null;
  }

  // -------------------------------------------------------------- placing them
  /** A pair or three walking a round between points (each keeps its own place in the file). */
  band(variants, x, z, opts = {}) {
    const out = [];
    const ring = opts.patrol || null;
    variants.forEach((v, i) => {
      const a = (i / variants.length) * Math.PI * 2;
      const f = this.spawn(v, x + Math.cos(a) * 1.6, z + Math.sin(a) * 1.6, { ...opts, patrol: ring ? ring.map(([px, pz]) => [px + Math.cos(a) * 1.4, pz + Math.sin(a) * 1.4]) : null });
      out.push(f);
    });
    return out;
  }

  /** Everyone in their places: knights and sorcerers walking rounds across the Green Downs and
   * holding its houses, a few more in the other countries' ruins, keeps and chapels, and the
   * ghasts and grubbers in the Gloamhollow (ctx.cave). */
  populate(ctx) {
    const R = (() => { let q = 4242; return () => { q = (q * 16807) % 2147483647; return q / 2147483647; }; })();
    const pick = (a) => a[Math.floor(R() * a.length)];
    const KN = ['knight_a', 'knight_b', 'knight_c'], SO = ['sorcerer_a', 'sorcerer_b', 'sorcerer_c'];
    const round = (x, z, r, n = 5) => Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + R() * 0.6, d = r * (0.45 + R() * 0.45);
      return [x + Math.cos(a) * d, z + Math.sin(a) * d];
    });
    let n = 0;
    // the downs: bands on the march between its places
    const downs = ctx.biomes?.downs?.lairs || [];
    // (bands of three and four: more of them, and they talk it over among themselves as they come)
    const bands = [['knight_a', 'knight_a', 'knight_b'], ['knight_b', 'sorcerer_a', 'knight_c'], ['knight_c', 'knight_c', 'sorcerer_c', 'knight_a'], ['knight_a', 'sorcerer_b', 'knight_b'], ['knight_b', 'knight_b', 'knight_a', 'sorcerer_a']];
    downs.forEach((l, i) => {
      const next = downs[(i + 1) % downs.length];
      const route = [...round(l.x, l.z, l.r, 3), [(l.x + next.x) / 2, (l.z + next.z) / 2], ...round(next.x, next.z, next.r, 2)];
      n += this.band(bands[i % bands.length], route[0][0], route[0][1], { zone: 'downs', patrol: route }).length;
    });
    // and one keeping watch over the falls (not at the cave's mouth)
    if (ctx.cave) {
      const m = ctx.cave.mouth;
      n += this.band(['knight_a', 'sorcerer_c'], m.x - 40, m.z + 30, { zone: 'downs', area: { x: m.x - 40, z: m.z + 30, r: 14 } }).length;
    }
    // the downs' houses: a sorcerer at his work, a knight on guard
    const phys = this.zombies.physics;
    const inRoom = (v, r, i, of) => {          // a spot on the room's own floor, clear of its furniture
      const fy = r.floor ?? r.y0, w = r.x1 - r.x0, d = r.z1 - r.z0;
      for (let t = 0; t < 8; t++) {
        const x = r.x0 + w * (t ? 0.2 + 0.6 * R() : 0.3 + 0.4 * ((i + 0.5) / of)), z = r.z0 + d * (t ? 0.2 + 0.6 * R() : 0.5);
        if (Math.abs(phys.floorAt(x, z, fy + 0.3, 0.3, 0.45) - fy) > 0.2) continue;
        const f = this.spawn(v, x, z, { y: fy, zone: 'house', room: r });
        if (f.pos.x > r.x0 && f.pos.x < r.x1 && f.pos.z > r.z0 && f.pos.z < r.z1) return 1;
        f.remove();
        this.zombies.list.splice(this.zombies.list.indexOf(f), 1);
      }
      return 0;
    };
    const inside = (ctx.interiors || []).filter((r) => !r.outdoor);
    for (const r of inside.filter((q) => q.biome === 'downs')) {
      if (r.x1 - r.x0 < 2 || r.z1 - r.z0 < 2) continue;
      const who = /barn/i.test(r.name) ? ['knight_c', 'knight_c'] : /farm/i.test(r.name) ? ['sorcerer_b', 'knight_a'] : /windmill/i.test(r.name) ? ['sorcerer_a'] : [pick(SO), ...(R() < 0.5 ? [pick(KN)] : [])];
      who.forEach((v, i) => { n += inRoom(v, r, i, who.length); });
    }
    // the other countries: a few at their ruins, keeps, chapels and crossroads
    const elsewhere = { rustwood: ['ruin', 'cloister', 'camp'], rimeholt: ['fort', 'shrine'], gallows: ['crossroads', 'hut'], fen: ['ruin', 'hamlet'],
      ashen: ['altar', 'ruin'], barrow: ['stones'], deepwood: ['hollow'] };
    for (const [key, kinds] of Object.entries(elsewhere)) {
      const lairs = (ctx.biomes?.[key]?.lairs || []).filter((l) => kinds.includes(l.kind));
      for (const l of lairs.slice(0, 2)) {
        const crew = l.kind === 'fort' || l.kind === 'camp' ? [pick(KN), pick(KN)] : l.kind === 'altar' || l.kind === 'shrine' || l.kind === 'hut' ? [pick(SO)] : [pick(KN), pick(SO)];
        n += this.band(crew, l.x + 3, l.z + 3, { zone: key, area: { x: l.x, z: l.z, r: Math.max(8, l.r * 0.8) } }).length;
      }
    }
    for (const key of ['rustwood', 'rimeholt', 'fen', 'gallows', 'ashen']) {
      let k = 0;
      for (const r of inside.filter((q) => q.biome === key)) if (k < 2) k += inRoom(/keep|tower/i.test(r.name) ? pick(KN) : pick(SO), r, 0, 1);
      n += k;
    }
    // the Gloamhollow
    const cave = this.cave = ctx.cave || null;
    let c = 0;
    if (cave) {
      const G = ['ghast_a', 'ghast_b', 'ghast_c'], U = ['grubber_a', 'grubber_b', 'grubber_c'];
      const put = (v, tag, opts = {}) => {
        const p = cave.spot(tag, 1.0);
        if (!p) return;
        const f = cave.features.find((q) => q.tag === tag);
        const area = f.type === 'room' ? { x: cave.px + f.a, z: cave.pz + f.b, r: Math.min(f.ra, f.rb) * 0.7 } : { x: p.x, z: p.z, r: 3 };
        const foe = this.spawn(v, p.x, p.z, { y: p.y, zone: 'cave', area, ...opts });
        foe.yaw = R() * 6.28;
        c++;
      };
      for (let i = 0; i < 6; i++) put(G[i % 3], 'nest', { start: R() < 0.6 ? 'ambush' : 'stand' });
      for (let i = 0; i < 2; i++) put(G[(i + 1) % 3], 'north', { start: 'ambush' });
      for (let i = 0; i < 2; i++) put(G[i % 3], 'loop', { start: 'ambush' });
      for (let i = 0; i < 2; i++) put(G[2 - i], 'bones');
      for (let i = 0; i < 6; i++) put(U[i % 3], 'warren');
      for (let i = 0; i < 2; i++) put(U[(i + 2) % 3], 'south');
      for (let i = 0; i < 3; i++) put(U[i % 3], 'cavern');
      put('ghast_c', 'shrine', { start: 'ambush' }); put('grubber_c', 'shrine');
      put('grubber_b', 'entrance');
    }
    console.info(`foes: ${n} knights and sorcerers abroad, ${c} things in the cave`);
  }
}
