// The living foes (templates/models/creatures/foes/*.glb, built by tools/creatures/foes3d): dark
// knights and sorcerers who roam the open country and keep to its houses, and the things that
// live in the cave beside Brightwater Falls.
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
//             pounce from a few strides off, rake and fall back
//   grubbers  waddle, charge, smash with their nail-studded clubs and bite
// Weapons and shields are the player's own models (the viewmodel's), held in sockets the build
// put in the hands; a severed arm or a death drops them. A death may leave loot (ctx.loot).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Zombie, goreMaterial, wrap } from './zombies.js';

const ROOT = 'templates/models/creatures/foes/';
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
};
export const VARIANTS = Object.keys(FOES);

// how each kind stands up to you: hp, damage taken (armour), limb toughness, speeds, senses
const KIND = {
  knight: { hp: 260, armor: 0.72, limb: 1.45, walk: 1.3, run: 3.5, sight: 28, hear: 1.0, turn: 3.6, reach: 2.05, flinch: 0.25, tier: 3,
    dmg: { attack1: 12, attack2: 16, attack3: 11, bash: 6 }, cool: [0.6, 1.4] },
  sorcerer: { hp: 140, armor: 1, limb: 0.9, walk: 1.15, run: 2.8, sight: 32, hear: 1.1, turn: 3.2, reach: 1.8, flinch: 0.6, tier: 2,
    dmg: { attack1: 10 }, cool: [0.8, 1.4] },
  ghast: { hp: 130, armor: 1, limb: 0.8, walk: 1.5, run: 5.2, sight: 20, hear: 1.6, turn: 5.5, reach: 1.9, flinch: 0.45, tier: 1,
    dmg: { attack1: 7, attack2: 7, attack3: 12 }, cool: [0.5, 1.2] },
  grubber: { hp: 170, armor: 0.9, limb: 1.1, walk: 0.95, run: 2.6, sight: 13, hear: 1.5, turn: 2.8, reach: 1.65, flinch: 0.3, tier: 1,
    dmg: { attack1: 14, attack2: 9, attack3: 11 }, cool: [0.8, 1.5] },
};
const LIMB_HP = { head: 42, upper_armL: 52, forearmL: 36, handL: 22, thighL: 62, shinL: 46, footL: 26,
  upper_armR: 52, forearmR: 36, handR: 22, thighR: 62, shinR: 46, footR: 26, waist: 88 };
const ONCE = new Set(['jump', 'attack1', 'attack2', 'attack3', 'bash', 'cast1', 'cast2', 'blink', 'hit', 'shriek', 'death',
  'collapse', 'crawl_attack', 'crawl_death', 'rise', 'getup']);
const SPELL = { // bolt colour, its glow, damage
  arcane: { core: 0xe6b8ff, glow: 0x9a4cff, dmg: 10, speed: 14 },
  blood: { core: 0xffb0a0, glow: 0xff2a1a, dmg: 12, speed: 13 },
  venom: { core: 0xd8ffc0, glow: 0x5cff3a, dmg: 9, speed: 12 },
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3();

/** The gore shader, plus: armour, capes and robes stay armour and cloth inside (the `shell`
 * vertex attribute), and the glow map (eyes, slits, runes, cracks, caps) shines in the dark. */
function foeMaterial(src, lib) {
  const mat = goreMaterial(src, lib);
  if (src.emissiveMap) {
    const e = src.emissiveMap;
    e.magFilter = THREE.NearestFilter; e.minFilter = THREE.NearestMipmapLinearFilter; e.needsUpdate = true;
    mat.emissiveMap = e;
    mat.emissive = new THREE.Color(1.6, 1.6, 1.6);
  }
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

// ------------------------------------------------------------------ a foe
class Foe extends Zombie {
  static ONCE = ONCE;

  constructor(gltf, variant, owner, o) {
    super(gltf, variant, owner, { ...o, kind: 'shambler' });
    this.foes = owner.foes;
    this.def = FOES[variant];
    this.kindName = this.def.kind;
    this.kind = KIND[this.kindName];
    const meta = gltf.userData.foe;
    this.radius = meta.radius; this.tips = meta.tip; this.hits = meta.hits || {};
    this.hp = this.kind.hp;
    this.limbHp = Object.fromEntries(Object.entries(LIMB_HP).map(([k, v]) => [k, v * this.kind.limb]));
    const geo = this.mesh.geometry;
    if (geo.attributes._shell) geo.setAttribute('shell', geo.attributes._shell);
    else geo.setAttribute('shell', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
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
    if (o.start === 'ambush') { this.state = 'ambush'; this.play('idle', 0); }
  }

  material(src, lib) { return foeMaterial(src, lib); }

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
    if (!this.dead && this.state === 'block' && this.shield && this.arm('L') && this.has('handL')) {
      const f = this.forward(_t);
      if (f.dot(opts.dir) < -0.3) return this.deflect(h, opts);
    }
    const wasState = this.state;
    super.hit(h, { ...opts, dmg: opts.dmg * this.kind.armor });
    if (this.dead || this.mode !== 'stand' || this.state === 'collapse') return;
    if (this.state === 'ambush') { this.state = 'move'; }
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
    const p = this.shield.g.getWorldPosition(new THREE.Vector3());
    const sp = [new THREE.Color(1, 0.9, 0.5), new THREE.Color(1, 0.6, 0.2), new THREE.Color(0.9, 0.9, 0.9)];
    for (let i = 0; i < 26; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(5).addScaledVector(opts.dir, -2);
      g.drop(p, _v, 0.008 + Math.random() * 0.01, sp[i % 3]);
    }
    sfx?.clang?.(false);
    this.foes.flash(p, 0xffd080, 0.25);
    this.blockT = Math.min(this.blockT, 0.25);
    this.hunt(this.owner.player?.pos, true);
    if (opts.heavy) { this.state = 'hit'; this.play('hit', 0.06); }
    else if (Math.random() < 0.45) this.counter = 'bash';
  }

  sever(name, dir) {
    super.sever(name, dir);
    this.drop((it) => this.cutAway(it.bone));
    if (this.mode === 'stand' && !this.legs) this.drop((it) => it.socket === 'shieldL');
  }

  die() {
    super.die();
    this.drop();
    this.foes.voice(this, 'die');
    const loot = this.foes.ctx?.loot;
    if (loot?.drop) {
      const tier = this.kind.tier + (this.zone === 'cave' ? 1 : 0);
      const chance = { knight: 0.8, sorcerer: 0.75, ghast: 0.35, grubber: 0.4 }[this.kindName];
      if (Math.random() < chance) loot.drop([this.pos.x, this.pos.y + 0.1, this.pos.z], { tier });
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
    if (this.gone) return;
    if (this.dead || this.mode === 'crawl' || ['collapse', 'buried', 'rise', 'playdead', 'getup'].includes(this.state)) {
      super.update(dt, player, active, far, mid);
      return;
    }
    const owner = this.owner;
    if (far && !this.aggro && this.goal === 'wander') return;   // out of the way: it waits
    this.mixAcc += dt;
    if (!mid || ++this.frame % (far ? 6 : 3) === 0) { this.mixer.update(this.mixAcc); this.mixAcc = 0; }
    this.bleed(dt);
    for (const k of ['cool', 'spellCool', 'bigCool', 'blinkCool', 'blockCool', 'retreatT', 'chargeCool', 'lungeT']) this[k] = Math.max(0, this[k] - dt);
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
    else if (st === 'blink') this.blinking(dt, player);
    else if (st === 'jump') {
      this.pos.addScaledVector(this.forward(), 2.3 * dt);
      if (this.done()) { this.state = 'move'; owner.physics.slide(this.pos, 0, 0, 0.3, 1.6, 0.45); }
    } else this.decide(dt, player, active, dist, facingErr);
    this.ground(dt);
    // you can't walk through it
    const r = this.kindName === 'grubber' ? 0.42 : 0.36;
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
    if (this.goal === 'chase' && active) {
      if (this.kindName === 'knight') return this.knight(dt, player, dist, facingErr);
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
    return p;
  }

  /** Turn toward `target` and move at `speed`: forward, or backing/side-stepping while facing
   * `face`. Feels ahead for walls, jumps what it can, and plays the matching gait. */
  go(dt, target, speed, { face = null, back = false, side = 0 } = {}) {
    const phys = this.owner.physics, K = this.kind;
    speed *= this.pace;
    const look = face || target;
    if (look) {
      if (this.avoidT > 0) this.avoidT -= dt;
      const want = Math.atan2(look.x - this.pos.x, look.z - this.pos.z) + (!face && this.avoidT > 0 ? this.avoid : 0);
      const turn = K.turn * dt;
      this.yaw += Math.max(-turn, Math.min(turn, wrap(want - this.yaw)));
    }
    if (speed <= 0 || !target) { this.play('idle', 0.3); return; }
    const ang = this.yaw + (back ? Math.PI : 0) + side * Math.PI / 2;
    const f = _f.set(Math.sin(ang), 0, Math.cos(ang));
    this.feelT -= dt;
    if (this.feelT <= 0) {
      this.feelT = 0.2;
      const y0 = this.pos.y + 0.45;
      const low = phys.ray([this.pos.x, y0, this.pos.z], [f.x, 0, f.z], 1.0);
      if (low && low.box && !face) {
        const high = phys.ray([this.pos.x, this.pos.y + 1.65, this.pos.z], [f.x, 0, f.z], 1.6);
        if (this.goal === 'chase' && this.feet && this.air === 0 && !high && low.box.max[1] - this.pos.y < 1.5) { this.state = 'jump'; this.play('jump', 0.1); return; }
        const sideRay = (a) => { const c = Math.cos(this.yaw + a), s = Math.sin(this.yaw + a); return phys.ray([this.pos.x, y0, this.pos.z], [s, 0, c], 1.4); };
        const l = sideRay(0.8), r = sideRay(-0.8);
        this.avoid = !l ? 0.9 : !r ? -0.9 : (l.t > r.t ? 0.9 : -0.9);
        this.avoidT = 0.7;
      }
      this.stuckT = (this.stuckT || 0) + 0.2;
      if (this.stuckT >= 1) {
        if (this.stuckAt && this.stuckAt.distanceTo(this.pos) < 0.15 * speed) { this.avoid = Math.random() < 0.5 ? 1.3 : -1.3; this.avoidT = 0.9; }
        (this.stuckAt || (this.stuckAt = new THREE.Vector3())).copy(this.pos);
        this.stuckT = 0;
      }
    }
    const err = face ? 0 : Math.abs(wrap(Math.atan2(target.x - this.pos.x, target.z - this.pos.z) - this.yaw));
    const sp = speed * Math.max(0.25, Math.cos(Math.min(Math.PI / 2, err)));
    phys.slide(this.pos, f.x * sp * dt, f.z * sp * dt, this.kindName === 'grubber' ? 0.36 : 0.3, 1.6, 0.45);
    if (side) this.play('walk', 0.3, 0.8);
    else if (speed > K.walk * 1.6) this.play('run', 0.25, speed / K.run);
    else this.play('walk', 0.3, (back ? -1 : 1) * Math.max(0.5, speed / K.walk));
  }

  /** Start a melee move (it lands at the clip's hit frame). */
  strike(name, lunge = 0) {
    this.state = 'attack';
    this.lungeT = lunge;
    this.play(name, 0.1);
    this.foes.voice(this, 'attack');
  }

  attacking(dt, player, active, dist, facingErr) {
    const a = this.actions[this.cur];
    if (this.lungeT > 0) {
      const f = this.forward();
      this.owner.physics.slide(this.pos, f.x * 4.6 * dt, f.z * 4.6 * dt, 0.3, 1.6, 0.45);
    } else if (this.goal === 'chase' && active) {             // keep turning onto you through the wind-up
      const turn = this.kind.turn * 0.5 * dt, want = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      this.yaw += Math.max(-turn, Math.min(turn, wrap(want - this.yaw)));
    }
    const at = this.hits[this.cur] ?? 14;
    if (!this.fired && a && a.time * FPS >= at) {
      this.fired = true;
      const reach = this.kind.reach + (this.cur === 'attack3' && this.kindName === 'ghast' ? 0.4 : 0.2);
      this.foes.sound('swing', this.pos, this.kindName);
      if (active && dist < reach && facingErr < 1.1 && Math.abs(player.pos.y - this.pos.y) < 1.3) {
        this.owner.onPlayerHit?.(this.kind.dmg[this.cur] ?? 10, this);
        if (this.cur === 'bash' || (this.kindName === 'grubber' && this.cur === 'attack1')) {   // knocked back
          const f = this.forward();
          player.vel.x += f.x * 6; player.vel.z += f.z * 6; player.vel.y = Math.max(player.vel.y, 2.5);
        }
      }
    }
    if (this.done()) { this.state = 'move'; this.cool = this.kind.cool[0] + Math.random() * (this.kind.cool[1] - this.kind.cool[0]); }
  }

  // ---- knights
  raiseShield(t) {
    if (!this.shield || !this.arm('L')) return;
    this.state = 'block'; this.blockT = t; this.play('block', 0.12);
  }

  blocking(dt, player, active, dist) {
    this.blockT -= dt;
    const turn = this.kind.turn * dt, want = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.yaw += Math.max(-turn, Math.min(turn, wrap(want - this.yaw)));
    if (dist > 1.3 && dist < 4) this.owner.physics.slide(this.pos, Math.sin(this.yaw) * 0.5 * dt, Math.cos(this.yaw) * 0.5 * dt, 0.3, 1.6, 0.45);
    if (this.blockT <= 0 || !this.shield) {
      this.state = 'move'; this.blockCool = 1.2 + Math.random() * 1.5;
      if (this.counter && dist < this.kind.reach + 0.3) { this.strike(this.counter); this.counter = null; }
    }
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
    if (this.canSee && hands && !this.spellCool && dist < 30 && fe < 0.3) { this.state = 'cast'; this.spell = 'cast1'; this.play('cast1', 0.1); return; }
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
    if (!this.shrieked && this.has('head')) {
      this.shrieked = true; this.state = 'shriek'; this.play('shriek', 0.1);
      this.foes.voice(this, 'shriek');
      this.owner.alert(this, player.pos, 26);
      return;
    }
    if (dist < 1.7 && fe < 0.6 && !this.cool) {
      const moves = [this.arm('R') && 'attack1', this.arm('L') && 'attack2'].filter(Boolean);
      if (moves.length) { this.strike(moves[Math.floor(Math.random() * moves.length)]); this.retreatT = Math.random() < 0.4 ? 0.9 : 0; return; }
    }
    if (dist > 2.6 && dist < 5 && fe < 0.3 && this.lungeCool < 0 && this.feet && (this.arm('L') || this.arm('R'))) {
      this.lungeCool = 3 + Math.random() * 3;
      this.strike('attack3', 0.45);
      return;
    }
    if (this.retreatT > 0) { this.go(dt, player.pos, K.run * 0.6, { face: player.pos, back: true }); return; }
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
    if (dist < K.reach && fe < 0.6 && !this.cool) {
      const moves = [this.arm('R') && 'attack1', this.has('head') && 'attack2', this.arm('R') && 'attack3'].filter(Boolean);
      if (moves.length) { this.chargeT = 0; this.strike(moves[Math.floor(Math.random() * moves.length)]); return; }
    }
    if (!this.chargeT && !this.chargeCool && dist > 3 && dist < 9 && this.feet) { this.chargeT = 2.5; this.foes.voice(this, 'alert'); }
    if (this.chargeT > 0) { this.chargeT = Math.max(0, this.chargeT - dt); if (!this.chargeT) this.chargeCool = 4 + Math.random() * 3; }
    this.go(dt, this.route(player.pos), dist < K.reach * 0.9 ? 0 : this.chargeT > 0 ? K.run : K.walk, dist < K.reach * 0.9 ? { face: player.pos } : {});
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
        this.foes.zombies.onPlayerHit?.(b.S.dmg, b.by);
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
  }

  async load(variants = VARIANTS) {
    await Promise.all(variants.map(async (v) => {
      const g = await this.loader.loadAsync(`${ROOT}${v}.glb`);
      g.userData = { ...(g.userData || {}), foe: JSON.parse(g.scene.userData.foe || '{}') };
      this.gltf[v] = g;
    }));
    const ids = new Set();
    for (const v of variants) for (const s of ['R', 'L']) for (const id of FOES[v][s] || []) ids.add(`${id}|${FOES[v].finish || ''}`);
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
    if (def.R) { const it = this.items[`${pick(def.R)}|${def.finish || ''}`]; if (it) f.hold('gripR', it.clone()); }
    if (def.L) { const it = this.items[`${pick(def.L)}|${def.finish || ''}`]; if (it) f.hold('shieldL', it.clone()); }
    phys.slide(f.pos, 0, 0, 0.3, 1.6, 0.45);
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
      f.pos.set(x, fl, z);
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
      const p = 85 + Math.random() * 20;
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
          this.zombies.onPlayerHit?.(18, h.by);
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
    const bands = [['knight_a', 'knight_a'], ['knight_b', 'sorcerer_a'], ['knight_c', 'knight_c', 'sorcerer_c'], ['knight_a', 'sorcerer_b'], ['knight_b', 'knight_b']];
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
