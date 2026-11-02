// What a fight shows over the picture, and what it writes in the chat log.
//
// Over each foe once it's been hurt, a small red life bar (the pale trail behind it what the last
// blow took), with marks for what ails it (burning, frozen, chilled, poisoned, shocked) and a skull
// on a champion's; it fades a while after the last blow, drains away when it dies, and hides behind
// walls. Every blow throws up its damage in chunky pixel digits (tools/ui/hud.px.js) coloured by
// its kind (steel pale, a heavy blow gold, fire, frost, lightning, arcane, holy, poison, blood),
// popping out and arcing away; what it did besides comes up in words over it: BURNING, FROZEN,
// SEVERED, BEHEADED, CUT IN TWO, BLOCKED, SLAIN. Damage you take, and healing, rises off the life
// orb. The chat log gets a line for each (several foes struck in one frame by one blast share a
// line), afflictions taking hold and what they burned or poisoned away, limbs off, and deaths.
//
// The bodies report to it: Zombie.hit/harm/sever (zombies.js, the foes through them) and Slime.hit/
// harm (slimes.js) call owner.feed.struck/harmed/severed; main.js tells it of deaths, blocks and your
// own hurts. It draws on its own full-resolution canvas laid over the game, like the speech bubbles.

import * as THREE from 'three';
import { uiArt } from './uiart.js';
import { fmt } from './chatlog.js';

// each kind of damage's colours: four tones light to dark, and the outline
const R = (tones, edge) => ({ tones, edge });
export const RAMPS = {
  phys: R(['#ffffff', '#f0e6d0', '#c8b898', '#8a7a60'], '#140c06'),
  heavy: R(['#fff8d0', '#ffe080', '#f0b030', '#a86010'], '#240c00'),
  fire: R(['#fff4b0', '#ffc040', '#ff6a1a', '#b82a08'], '#260600'),
  frost: R(['#ffffff', '#c8f0ff', '#6ac0ff', '#2a68c8'], '#040e26'),
  shock: R(['#ffffff', '#e8e0ff', '#b090ff', '#6a40d8'], '#0e0426'),
  arcane: R(['#ffe8ff', '#f0a0ff', '#c050e0', '#702090'], '#18041e'),
  holy: R(['#ffffff', '#fff2b0', '#ffd870', '#c09030'], '#241800'),
  poison: R(['#f0ffc0', '#b8f060', '#6ac028', '#2e6a10'], '#061600'),
  blood: R(['#ffd0d0', '#ff6070', '#c01828', '#6a0810'], '#180004'),
  hurt: R(['#ffd8c8', '#ff7a5a', '#e02818', '#7a0808'], '#120000'),
  heal: R(['#e8ffe8', '#90ff90', '#40c850', '#1a7a2a'], '#021806'),
  grey: R(['#ffffff', '#d0d0d0', '#a0a0a0', '#606060'], '#0e0e0e'),
  gold: R(['#fffbe0', '#ffe890', '#f8c040', '#b07010'], '#201000'),
};
// a blow's kind -> its colours, and the word the log puts after the number
const KIND = { blade: 'phys', blunt: 'phys', thorns: 'phys', bone: 'phys', fire: 'fire', burn: 'fire', frost: 'frost', lightning: 'shock',
  staff: 'arcane', arcane: 'arcane', void: 'arcane', wisp: 'holy', heal: 'holy', poison: 'poison', drain: 'blood', harm: 'arcane' };
const WORD = { fire: 'fire', frost: 'frost', shock: 'lightning', arcane: 'arcane', holy: 'holy', poison: 'poison', blood: 'blood' };
// afflictions: key, is it on, its word, its colours, the log's phrase, its mark, what it does over time
const AFF = [
  { k: 'burn', on: (z) => z.burning > 0 || z.burnT > 0, tag: 'burning', ramp: 'fire', says: 'is set ablaze', mark: 'af_burn', dot: 'burned' },
  { k: 'frozen', on: (z) => z.frozen > 0, tag: 'frozen', ramp: 'frost', says: 'is frozen solid', mark: 'af_frozen' },
  { k: 'chill', on: (z) => !(z.frozen > 0) && (z.chilled > 0 || z.chillT > 0), tag: 'chilled', ramp: 'frost', says: 'is chilled to a crawl', mark: 'af_chill' },
  { k: 'poison', on: (z) => z.poisoned > 0, tag: 'poisoned', ramp: 'poison', says: 'is poisoned', mark: 'af_poison', dot: 'poisoned' },
];
const SIDE = { L: 'left', R: 'right' };
const LIMB = { upper_arm: 'arm', forearm: 'forearm', hand: 'hand', thigh: 'leg', shin: 'leg', foot: 'foot' };
const SIZE_WORD = { XS: 'Tiny ', S: 'Small ', M: '', L: 'Great ', XL: 'Huge ' };
const BAR_SHOW = 7, BAR_FADE = 1.6, BAR_FAR = 46;   // s shown after the last blow, s to fade, metres
const MAX_POPS = 90;

/** What to call one of them in the log. */
export function nameOf(z) {
  if (!z) return 'Something';
  if (z.champ?.name) return z.champ.name;
  if (z.def?.title) return z.def.title.split(',')[0];
  if (z.slime) return (SIZE_WORD[z.size] || '') + (z.sp?.name || 'Slime');
  const v = String(z.variant || '');
  if (v.length > 2) return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return 'Zombie';
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();

export class CombatFx {
  /** o: { camera, physics, chat, lists() -> [arrays of foes], orb() -> the life orb's element, time() } */
  constructor(o) {
    this.o = o;
    this.state = new Map();      // foe -> what it shows (see st)
    this.pops = [];              // numbers and words rising
    this.batch = [];             // this frame's blows, for the log
    this.later = [];             // and what they did (limbs off), written after them
    this.now = 0;
    this.hidden = false;
    this.heal = 0; this.healT = 0;
    const c = this.canvas = document.createElement('canvas');
    c.className = 'combatfx';
    Object.assign(c.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    const game = document.getElementById('game');
    if (game?.parentNode) game.parentNode.insertBefore(c, game.nextSibling); else document.body.append(c);
    this.g = c.getContext('2d');
    this.drawn = false;
  }

  st(z) {
    let s = this.state.get(z);
    if (!s) this.state.set(z, (s = { seen: -99, frac: 1, trail: 1, trailHold: 0, max: 0, af: 0, dot: {}, dotAcc: 0, dotKind: 'fire', dotT: 0, occT: 0, occ: false, shock: -99, dead: -1 }));
    return s;
  }
  maxOf(z, s) {
    const m = z.slime ? z.max : z.champ?.max || (z.kindName && z.kind?.hp) || 120;
    return Math.max(m || 1, s.max || 0);
  }
  get scale() { return Math.max(2, Math.round(innerHeight / 340)); }
  get dpr() { return Math.min(2, window.devicePixelRatio || 1); }

  // -------------------------------------------------------------- what the bodies report
  /** A blow landed (hp was `before`): h the hit (point, bone), o its options (dmg, kind, heavy). */
  struck(z, before, h, o = {}) {
    const s = this.st(z);
    if (!s.max) s.max = Math.max(before, 1);
    const amt = this.oneHit(z) ? before : Math.max(0, before - z.hp);
    s.seen = this.now;
    const at = this.pointOf(h, z);
    if (amt < 0.5) {
      if ((o.dmg || 0) > 0 && !z.dead && z.slime && (z.sp?.resist?.[o.kind] ?? 1) <= 0) this.word('immune', 'grey', at, z, 1.5);
      return;
    }
    const kind = KIND[o.kind] || 'phys';
    const ramp = kind === 'phys' && o.heavy ? 'heavy' : kind;
    this.number(amt, ramp, at, { big: !!o.heavy, crit: o.ripo });
    if (kind === 'shock') { s.shock = this.now + 2; if (Math.random() < 0.6) this.word('shocked', 'shock', at, z, 1); }
    this.batch.push({ z, amt, kind, heavy: !!o.heavy });
  }

  /** Harm with no wound (an affliction's burn, a spell's touch): kind 'burn'/'poison' run over time. */
  harmed(z, before, kind) {
    const amt = this.oneHit(z) ? before : Math.max(0, before - z.hp);
    if (amt <= 0) return;
    const s = this.st(z);
    if (!s.max) s.max = Math.max(before, 1);
    s.seen = this.now;
    if (kind === 'burn' || kind === 'poison') {
      s.dot[kind] = (s.dot[kind] || 0) + amt;
      s.dotAcc += amt; s.dotKind = kind === 'burn' ? 'fire' : 'poison';
      return;
    }
    // (a beam or a drain touches every frame: its harm is shown in lumps, like the burn's)
    s.hAcc = (s.hAcc || 0) + amt; s.hKind = KIND[kind] || 'arcane';
  }

  severed(z, limb) {
    const head = limb === 'head', waist = limb === 'waist';
    const at = (head ? this.headOf(z, _w) : z.bones?.[limb === 'waist' ? 'spine' : limb]?.getWorldPosition(_w) || this.headOf(z, _w)).clone();
    this.word(head ? 'beheaded' : waist ? 'cut_in_two' : 'severed', 'blood', at, z, 1.6, 2);
    const nm = fmt.foe(nameOf(z));
    const part = LIMB[limb.replace(/[LR]$/, '')], side = SIDE[limb.slice(-1)];
    this.later.push(head ? `${fmt.you()} take the head off the ${nm}!` : waist ? `${fmt.you()} cut the ${nm} in two!`
      : `${fmt.you()} sever the ${nm}'s ${side ? side + ' ' : ''}${part || 'limb'}!`);
  }

  /** A foe's shield (or blade) turned your blow. */
  blocked(z, h) {
    this.word('blocked', 'grey', this.pointOf(h, z), z, 1.2);
    this.st(z).seen = this.now;
    this.o.chat?.add('block', `${fmt.foe(nameOf(z))} turns your blow aside`);
  }

  /** You parried its blow (main.js). */
  parried(z) {
    if (z) this.word('parried', 'gold', this.headOf(z, _w).clone(), z, 1.4);
    this.o.chat?.add('block', `${fmt.you()} parry ${z ? `the ${fmt.foe(nameOf(z))}'s` : 'the'} blow!`);
  }

  died(z) {
    const s = this.st(z);
    s.dead = this.now;
    this.endDots(z, s, true);
    this.word('slain', 'gold', this.headOf(z, _w).clone().add(_d.set(0, 0.25, 0)), z, 1.6, 1);
    this.o.chat?.add('kill', `${fmt.foe(nameOf(z))} is slain`);
  }

  /** You were hurt: dmg what got through; by who (or null); kind 'melee'|'spell'|'fall'; blocked
   * what your shield stopped. */
  hurt(dmg, by, kind, blocked = 0) {
    const chat = this.o.chat, nm = by ? fmt.foe(nameOf(by)) : null;
    if (blocked >= 0.5 && nm) chat?.add('block', `${fmt.you()} block ${fmt.num(Math.round(blocked))} of the ${nm}'s ${kind === 'spell' ? 'spell' : 'blow'}`);
    if (dmg < 0.5) return;
    const n = Math.round(dmg);
    this.orbNumber('-' + n, 'hurt', dmg >= 20);
    if (kind === 'fall') chat?.add('hurt', `The fall hurts you for ${fmt.num(n, 'hurt')}`);
    else if (nm) chat?.add('hurt', kind === 'spell' ? `The ${nm}'s spell strikes you for ${fmt.num(n, 'hurt')}` : `The ${nm} hits you for ${fmt.num(n, 'hurt')}`);
    else chat?.add('hurt', `You take ${fmt.num(n, 'hurt')} damage`);
  }

  /** Life coming back (shown in lumps, not every frame's trickle). */
  healed(n) { this.heal += n; }

  // -------------------------------------------------------------- pops
  number(n, ramp, at, { big = false, crit = false } = {}) {
    const txt = String(Math.max(1, Math.round(n))) + (crit ? '!' : '');
    this.pop(this.strip(txt, RAMPS[ramp] || RAMPS.phys, this.scale + (big ? 1 : 0)), at, { arc: true, life: big ? 1.25 : 1.0, pop: big ? 1.9 : 1.6 });
  }
  /** A tag word over a foe (at most one of each kind per foe every `gap` s). */
  word(tag, ramp, at, z, life = 1.3, up = 0) {
    if (!uiArt.has('tag_' + tag)) return;
    const s = z ? this.st(z) : null;
    if (s) { s.words ||= {}; if (this.now - (s.words[tag] ?? -9) < 0.8) return; s.words[tag] = this.now; }
    const img = uiArt.canvas('tag_' + tag, Math.max(3, this.scale + up), RAMPS[ramp]);
    this.pop(img, at, { arc: false, life, pop: 1.4, rise: 34, lift: 44 + up * 12 });   // (clear of the life bar)
  }
  orbNumber(txt, ramp, big) {
    const el = this.o.orb?.();
    if (!el) return;
    const r = el.getBoundingClientRect();
    this.pop(this.strip(txt, RAMPS[ramp], this.scale + (big ? 1 : 0)), null, { sx: r.left + r.width * (0.35 + Math.random() * 0.3), sy: r.top + r.height * 0.2, arc: false, life: 1.3, pop: 1.5, rise: 60 });
  }
  /** A run of digits (and + - !) in one canvas, each 1 px of outline overlapping the next. */
  strip(txt, ramp, scale) {
    const names = [...txt].map((ch) => (ch === '+' ? 'd_plus' : ch === '-' ? 'd_minus' : ch === '!' ? 'd_bang' : 'd_' + ch));
    const step = 8 * scale, w = (names.length - 1) * step + 9 * scale, h = 12 * scale;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    names.forEach((n, i) => g.drawImage(uiArt.canvas(n, scale, ramp), i * step, 0));
    return c;
  }
  pop(img, at, o) {
    if (!img || img.width < 2) return;
    if (this.pops.length >= MAX_POPS) this.pops.shift();
    const side = (this.side = -(this.side || 1));
    this.pops.push({ img, at: at ? at.clone?.() || new THREE.Vector3(...at) : null, sx: o.sx, sy: o.sy, t: 0, life: o.life || 1, pop: o.pop || 1.5,
      vx: o.arc ? side * (24 + Math.random() * 46) : (Math.random() - 0.5) * 10, vy: o.arc ? -(150 + Math.random() * 50) : -(o.rise || 30), g: o.arc ? 330 : 0,
      lift: o.lift || 0, jy: (Math.random() - 0.5) * 10 });
  }

  // -------------------------------------------------------------- each frame
  update(dt) {
    this.now += dt;
    this.flushLog();
    // healing in lumps of at least 5, every so often
    if ((this.healT -= dt) <= 0) { if (this.heal >= 5) this.orbNumber('+' + Math.round(this.heal), 'heal', false); this.heal = 0; this.healT = 0.8; }
    this.watch(dt);
    this.draw(dt);
  }

  /** Afflictions coming and going (on what you've struck, or anything close by: the shield's frost
   * on whatever hit it), and their harm over time. Nothing till the game is under way (live). */
  watch(dt) {
    if (!this.live) return;
    const eye = this.o.camera.getWorldPosition(this.eye ||= new THREE.Vector3());
    for (const list of this.o.lists()) {
      for (const z of list) {
        if (z.gone) continue;
        let s = this.state.get(z);
        if (!s && !((z.burning > 0 || z.burnT > 0 || z.frozen > 0 || z.chilled > 0 || z.chillT > 0 || z.poisoned > 0) && z.pos.distanceToSquared(eye) < 900)) continue;
        s ||= this.st(z);
        let bits = 0;
        if (!z.dead) AFF.forEach((A, i) => { if (A.on(z)) bits |= 1 << i; });
        const fresh = bits & ~s.af, gone = s.af & ~bits;
        if (fresh) AFF.forEach((A, i) => {
          if (!(fresh & (1 << i))) return;
          this.word(A.tag, A.ramp, this.headOf(z, _w).clone(), z, 1.4);
          this.o.chat?.add('ail', `${fmt.foe(nameOf(z))} ${A.says}`);
          s.seen = this.now;
        });
        if (gone) this.endDots(z, s, false, gone);
        s.af = bits;
        // a spell's touch, every 0.3 s; the burn's and the poison's harm, every half second
        if (s.hAcc > 0 && ((s.hT = (s.hT || 0) + dt) >= 0.3 || z.dead)) {
          this.number(s.hAcc, s.hKind, this.headOf(z, _w).clone().add(_d.set(0, -0.5, 0)), {});
          this.batch.push({ z, amt: s.hAcc, kind: s.hKind, heavy: false });
          s.hAcc = 0; s.hT = 0;
        }
        // the burn's and the poison's harm, shown every half second
        if (s.dotAcc > 0 && (s.dotT += dt) >= 0.55) {
          if (s.dotAcc >= 0.5) this.pop(this.strip(String(Math.round(s.dotAcc)), RAMPS[s.dotKind], Math.max(2, this.scale - 1)), this.headOf(z, _w).clone().add(_d.set((Math.random() - 0.5) * 0.3, -0.25, 0)), { arc: false, life: 0.9, pop: 1.2, rise: 40 });
          s.dotAcc = 0; s.dotT = 0;
        }
      }
    }
    // forget the long-quiet and the gone
    if ((this.sweepT = (this.sweepT || 0) - dt) <= 0) {
      this.sweepT = 3;
      for (const [z, s] of this.state) if (z.gone || (this.now - s.seen > 30 && !s.af)) this.state.delete(z);
    }
  }

  /** An affliction over (or its foe dead): what it burned or poisoned away, in the log. */
  endDots(z, s, all, bits = 0) {
    AFF.forEach((A, i) => {
      if (!A.dot || !(all || bits & (1 << i))) return;
      const t = s.dot[A.k];
      if (t >= 1) this.o.chat?.add('ail', `${fmt.foe(nameOf(z))} was ${A.dot} for ${fmt.num(Math.round(t), A.ramp)}`);
      s.dot[A.k] = 0;
    });
  }

  /** This frame's blows into the log: one line a blow, or one for a blast that took several. */
  flushLog() {
    if (!this.batch.length && !this.later.length) return;
    const chat = this.o.chat, by = new Map(), later = this.later;
    for (const b of this.batch) (by.get(b.kind) || by.set(b.kind, []).get(b.kind)).push(b);
    this.batch = []; this.later = [];
    if (!chat) return;
    for (const list of by.values()) {
      const kind = list[0].kind, heavy = list.some((b) => b.heavy), word = WORD[kind] ? ` ${WORD[kind]}` : '', css = kind === 'phys' && heavy ? 'heavy' : kind;
      // (one foe struck twice in a frame: added up)
      const per = new Map();
      for (const b of list) per.set(b.z, (per.get(b.z) || 0) + b.amt);
      if (per.size === 1) {
        const [[z, n]] = per;
        chat.add('hit', `${fmt.you()} ${heavy ? 'smite' : 'hit'} the ${fmt.foe(nameOf(z))} for ${fmt.num(Math.round(n), css)}${word}`);
      } else {
        const total = [...per.values()].reduce((a, n) => a + n, 0);
        const each = [...per].map(([z, n]) => `${fmt.foe(nameOf(z))} ${fmt.num(Math.round(n), css)}`).join(' · ');
        chat.add('hit', `Your${word || ' blow'} strikes ${per.size} foes for ${fmt.num(Math.round(total), css)}: ${each}`);
      }
    }
    for (const html of later) chat.add('hit', html);
  }

  // -------------------------------------------------------------- where things are
  oneHit(z) { return !!(z.owner?.oneHit); }   // (GOD MODE: what it had left, not a million)
  pointOf(h, z) {
    const p = h?.point;
    if (p?.isVector3) return p.clone();
    if (Array.isArray(p)) return new THREE.Vector3(p[0], p[1], p[2]);
    return this.headOf(z, new THREE.Vector3()).add(_d.set(0, -0.4, 0));
  }
  /** Just over its head. */
  headOf(z, out) {
    if (z.slime) { (z.center ? z.center(out) : out.copy(z.pos)); out.y += (z.H || 0.5) * 0.6 + 0.3; return out; }
    const head = z.bones?.head;
    const sz = z.size || 1;
    if (head && !z.lost?.has('head') && !z.dead) { head.getWorldPosition(out); out.y += 0.42 * sz; return out; }
    out.copy(z.pos); out.y += (z.mode === 'crawl' || z.dead ? 0.8 : 1.95) * sz;
    return out;
  }

  // -------------------------------------------------------------- drawing
  draw(dt) {
    const c = this.canvas, g = this.g, dpr = this.dpr;
    const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; this.drawn = true; }
    const bars = this.hidden ? [] : this.barList(dt);
    if (!bars.length && (!this.pops.length || this.hidden)) {
      if (this.drawn) { g.clearRect(0, 0, W, H); this.drawn = false; }
      if (this.hidden) this.pops.length = 0;
      return;
    }
    g.clearRect(0, 0, W, H); this.drawn = true;
    g.imageSmoothingEnabled = false;
    const cam = this.o.camera;
    for (const b of bars) this.bar(g, b, dpr);
    // the numbers and words
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      if (p.t >= p.life) { this.pops.splice(i, 1); continue; }
      let x, y;
      if (p.at) {
        _v.copy(p.at).project(cam);
        if (_v.z > 1 || _v.z < -1) continue;
        x = (_v.x * 0.5 + 0.5) * W; y = (-_v.y * 0.5 + 0.5) * H;
      } else { x = p.sx * dpr; y = p.sy * dpr; }
      const t = p.t;
      x += p.vx * t * dpr; y += (p.vy * t + 0.5 * p.g * t * t - p.lift + p.jy) * dpr;
      const k = t < 0.09 ? p.pop - (p.pop - 1) * (t / 0.09) : 1;
      const a = t > p.life * 0.68 ? Math.max(0, 1 - (t - p.life * 0.68) / (p.life * 0.32)) : 1;
      const w = p.img.width * k * dpr, h = p.img.height * k * dpr;
      g.globalAlpha = a;
      g.drawImage(p.img, Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
    }
    g.globalAlpha = 1;
  }

  /** The foes whose bars show this frame, nearest last (so it's drawn on top). */
  barList(dt) {
    const cam = this.o.camera, out = [];
    cam.getWorldPosition(_w);
    const eye = _w.clone();
    for (const [z, s] of this.state) {
      if (z.gone || z.state === 'buried') continue;
      const since = this.now - s.seen, deadFor = s.dead >= 0 ? this.now - s.dead : -1;
      if (s.seen < 0 || since > BAR_SHOW + BAR_FADE || deadFor > 0.9) continue;
      const frac = z.dead ? 0 : Math.max(0, Math.min(1, z.hp / this.maxOf(z, s)));
      // the pale trail waits a moment, then follows the red down
      if (frac < s.frac) s.trailHold = 0.35;
      s.frac = frac;
      if ((s.trailHold -= dt) <= 0) s.trail = Math.max(frac, s.trail - 1.4 * dt);
      if (frac > s.trail) s.trail = frac;
      const at = this.headOf(z, _v);
      const dist = at.distanceTo(eye);
      if (dist > BAR_FAR) continue;
      if ((s.occT -= dt) <= 0) {   // behind a wall? (a few times a second)
        s.occT = 0.25;
        _d.copy(at).sub(eye).normalize();
        const hit = this.o.physics?.ray?.([eye.x, eye.y, eye.z], [_d.x, _d.y, _d.z], dist);
        s.occ = !!(hit && hit.t < dist - 0.7);
      }
      if (s.occ) continue;
      const p = at.clone().project(cam);
      if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) continue;
      let a = since > BAR_SHOW ? 1 - (since - BAR_SHOW) / BAR_FADE : 1;
      if (deadFor >= 0) a *= Math.max(0, 1 - deadFor / 0.9);
      out.push({ z, s, x: (p.x * 0.5 + 0.5), y: (-p.y * 0.5 + 0.5), dist, a, frac });
    }
    return out.sort((p, q) => q.dist - p.dist);
  }

  bar(g, b, dpr) {
    const W = this.canvas.width, H = this.canvas.height;
    const { z, s } = b;
    const big = !!(z.champ || z.def?.boss);
    const k = Math.max(1, Math.round((b.dist > 22 ? 1.5 : 2) * dpr));   // px per bar pixel
    const inner = big ? 40 : 28, bw = (inner + 2) * k, bh = 6 * k;
    const x0 = Math.round(b.x * W - bw / 2), y0 = Math.round(b.y * H - bh);
    g.globalAlpha = b.a;
    g.fillStyle = big ? '#c8a050' : '#07060a'; g.fillRect(x0 - (big ? k : 0), y0 - (big ? k : 0), bw + (big ? 2 * k : 0), bh + (big ? 2 * k : 0));
    if (big) { g.fillStyle = '#07060a'; g.fillRect(x0, y0, bw, bh); }
    const ix = x0 + k, iy = y0 + k, iw = inner * k;
    g.fillStyle = '#3a1012'; g.fillRect(ix, iy, iw, 4 * k);
    g.fillStyle = '#240608'; g.fillRect(ix, iy + 3 * k, iw, k);
    const tw = Math.round(inner * s.trail) * k, fw = Math.round(inner * b.frac) * k;
    if (tw > fw) { g.fillStyle = '#f0d8a0'; g.fillRect(ix, iy, tw, 4 * k); }
    if (fw > 0) {
      g.fillStyle = '#ff8a6a'; g.fillRect(ix, iy, fw, k);
      g.fillStyle = '#e8322a'; g.fillRect(ix, iy + k, fw, k);
      g.fillStyle = '#b81c1c'; g.fillRect(ix, iy + 2 * k, fw, k);
      g.fillStyle = '#6a0a0a'; g.fillRect(ix, iy + 3 * k, fw, k);
    }
    // a champion's skull on the left, what ails it on the right
    const ik = Math.max(1, k - (k > 2 ? 1 : 0));
    if (big && uiArt.has('af_champ')) { const sk = uiArt.canvas('af_champ', ik); g.drawImage(sk, x0 - sk.width - k, y0 + bh / 2 - sk.height / 2); }
    let ax = x0 + bw + k;
    const marks = [];
    AFF.forEach((A, i) => { if (s.af & (1 << i)) marks.push(A.mark); });
    if (s.shock > this.now) marks.push('af_shock');
    for (const m of marks) {
      const ic = uiArt.canvas(m, ik);
      g.drawImage(ic, ax, Math.round(y0 + bh / 2 - ic.height / 2));
      ax += ic.width;
    }
    g.globalAlpha = 1;
  }
}

