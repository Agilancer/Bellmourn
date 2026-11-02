// What a fight shows over the picture, and what it writes in the chat log.
//
// Over each foe once it's been hurt, a small red life bar (the pale trail behind it what the last
// blow took); a champion's is longer and gold-edged, its name above it. It fades a while after the
// last blow, drains away when the foe dies, and hides behind walls.
//
// Numbers and words are set in Cinzel, the title's Roman capitals: the numbers heavy, lit from above
// in their kind's colours (steel and heavy blows in the subtitle's gold, fire, frost, lightning,
// arcane, holy, poison, blood) with a dark bevelled edge; the words (BURNING, FROZEN, BLOCKED...)
// small and widely spaced, like VELSCOUR'S THRONE under the logo. Every foe has its own lanes, so
// nothing lands on anything else: words rise from just over its bar, at most two stacked; numbers
// burst from just under it and arc out to the sides. A heavy blow's number is bigger, a killing one
// turns red and white; hits on one foe within 450 ms add into the number still up, which counts up;
// burns and poisons tick in one small count a second. A limb off comes up where the cut was
// (BEHEADED, SEVERED, CUT IN TWO), SLAIN where the bar was. Damage you take and healing rise off the
// life bar. Nothing lands on the crosshair: numbers are pushed out of a box about it.
//
// The chat log gets a line for each blow (a foe struck again within 2 s: the same line, counting),
// a blast's foes in one line, afflictions taking hold and what they burned or poisoned away, limbs
// off and deaths. The bodies report here: Zombie.hit/harm/sever (zombies.js; the foes through them)
// and Slime.hit/harm (slimes.js) call owner.feed.*; main.js tells it of deaths, blocks and your hurts.
// It draws on its own full-resolution canvas laid over the game, like the speech bubbles.

import * as THREE from 'three';
import { fmt } from './chatlog.js';

// each kind's colours: the fill lit from above (top, middle, bottom) and the bevelled edge
const R = (top, mid, low, edge) => ({ top, mid, low, edge });
export const RAMPS = {
  phys: R('#fff8e4', '#f0dca8', '#c8a464', '#2a1a08'),
  heavy: R('#fffbe0', '#ffd860', '#c88a20', '#2a1400'),
  kill: R('#ffffff', '#ff9080', '#d02818', '#1e0202'),
  fire: R('#fff4b0', '#ffb040', '#e8501a', '#2a0800'),
  frost: R('#ffffff', '#b8ecff', '#4aa8f0', '#04102a'),
  shock: R('#ffffff', '#e0d8ff', '#9a7aff', '#100430'),
  arcane: R('#ffe8ff', '#f0a0ff', '#b448d8', '#1a0420'),
  holy: R('#ffffff', '#fff0b0', '#e8c060', '#261a00'),
  poison: R('#f4ffd0', '#b8f060', '#5aa820', '#081800'),
  blood: R('#ffe0e0', '#ff6878', '#b81828', '#1a0004'),
  gore: R('#ffd8c8', '#ff4a38', '#a81010', '#140202'),
  hurt: R('#ffe0d0', '#ff7a5a', '#d02010', '#140000'),
  heal: R('#eaffea', '#90ff90', '#38b048', '#021806'),
  grey: R('#ffffff', '#d8d8d8', '#9a9a9a', '#101010'),
  gold: R('#fffbe0', '#ffe080', '#d8a030', '#241400'),
  name: R('#fff4d0', '#f0d080', '#c89a40', '#140a02'),
};
// a blow's kind -> its colours, and the word the log puts after the number
const KIND = { blade: 'phys', blunt: 'phys', thorns: 'phys', bone: 'phys', fire: 'fire', burn: 'fire', frost: 'frost', lightning: 'shock',
  staff: 'arcane', arcane: 'arcane', void: 'arcane', wisp: 'holy', heal: 'holy', poison: 'poison', drain: 'blood', harm: 'arcane' };
const WORD = { fire: 'fire', frost: 'frost', shock: 'lightning', arcane: 'arcane', holy: 'holy', poison: 'poison', blood: 'blood' };
// afflictions: key, is it on, its word, its colours, the log's phrase, what it does over time
const AFF = [
  { k: 'burn', on: (z) => z.burning > 0 || z.burnT > 0, tag: 'Burning', ramp: 'fire', says: 'is set ablaze', dot: 'burned' },
  { k: 'frozen', on: (z) => z.frozen > 0, tag: 'Frozen', ramp: 'frost', says: 'is frozen solid' },
  { k: 'chill', on: (z) => !(z.frozen > 0) && (z.chilled > 0 || z.chillT > 0), tag: 'Chilled', ramp: 'frost', says: 'is chilled to a crawl' },
  { k: 'poison', on: (z) => z.poisoned > 0, tag: 'Poisoned', ramp: 'poison', says: 'is poisoned', dot: 'poisoned' },
];
const SIDE = { L: 'left', R: 'right' };
const LIMB = { upper_arm: 'arm', forearm: 'forearm', hand: 'hand', thigh: 'leg', shin: 'leg', foot: 'foot' };
const SIZE_WORD = { XS: 'Tiny ', S: 'Small ', M: '', L: 'Great ', XL: 'Huge ' };
const BAR_SHOW = 7, BAR_FADE = 1.6, BAR_FAR = 46;   // s shown after the last blow, s to fade, metres
const MERGE = 0.45;        // s: a hit on a foe whose number is still up adds into it
const RUN = 2;             // s: the log's line for a foe keeps counting its hits
const MAX_POPS = 90;
const TOUCH = matchMedia('(pointer: coarse)').matches;
const NUM_FONT = 'Cinzel, Georgia, serif', WORD_FONT = 'Cinzel, Georgia, serif';
// (the canvas only draws in a web font once it's loaded: both weights asked for now, before any fight)
try { document.fonts?.load('900 26px Cinzel'); document.fonts?.load('700 16px Cinzel'); } catch { /* no font loading API */ }

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
/** "the Rotting Zombie", but "Grumehollow the Rotten": a champion's or a lord's name takes no article. */
export const theName = (z, html) => (z?.champ?.name || z?.def?.boss ? html : 'the ' + html);
/** A number and its kind's word kept on one line. */
const numWord = (n, css, word) => `<span class="c-nw">${fmt.num(n, css)}${word}</span>`;

/** Text set once into its own canvas (device px): heavy numbers or spaced capitals, filled with the
 * ramp lit from above, a dark bevelled edge and a soft shadow under it. */
function setText(text, px, ramp, { weight = 900, spacing = 0 } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const font = `${weight} ${px}px ${spacing ? WORD_FONT : NUM_FONT}`;
  g.font = font;
  if (spacing) g.letterSpacing = `${spacing}em`;
  const edge = Math.max(2, Math.round(px * 0.11)), pad = edge + Math.ceil(px * 0.12);
  const w = Math.ceil(g.measureText(text).width) + pad * 2, h = Math.ceil(px * 1.18) + pad * 2;
  c.width = w; c.height = h;
  g.font = font;
  if (spacing) g.letterSpacing = `${spacing}em`;
  g.textBaseline = 'middle'; g.lineJoin = 'round';
  const x = pad, y = h / 2 + px * 0.04;
  g.shadowColor = 'rgba(0, 0, 0, .75)'; g.shadowBlur = Math.round(px * 0.18); g.shadowOffsetY = Math.round(px * 0.06);
  g.lineWidth = edge * 2; g.strokeStyle = ramp.edge;
  g.strokeText(text, x, y);
  g.shadowColor = 'transparent';
  const grad = g.createLinearGradient(0, y - px * 0.45, 0, y + px * 0.45);
  grad.addColorStop(0, ramp.top); grad.addColorStop(0.45, ramp.mid); grad.addColorStop(1, ramp.low);
  g.fillStyle = grad;
  g.fillText(text, x, y);
  // a hairline of light along the top of the letters (the subtitle's bevel)
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(255, 255, 255, .22)';
  g.fillRect(0, 0, w, y - px * 0.28);
  return c;
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();

export class CombatFx {
  /** o: { camera, physics, chat, lists() -> [arrays of foes], bar() -> the life bar's element } */
  constructor(o) {
    this.o = o;
    this.state = new Map();      // foe -> what it shows (see st)
    this.pops = [];              // numbers and words
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
    if (!s) this.state.set(z, (s = { seen: -99, frac: 1, trail: 1, trailHold: 0, max: 0, af: 0, dot: {}, dotAcc: 0, dotKind: 'fire', dotT: 0, occT: 0, occ: false, dead: -1, tags: [], num: null, run: null }));
    return s;
  }
  maxOf(z, s) {
    const m = z.slime ? z.max : z.champ?.max || (z.kindName && z.kind?.hp) || 120;
    return Math.max(m || 1, s.max || 0);
  }
  get dpr() { return Math.min(2, window.devicePixelRatio || 1); }
  /** A plain number's size in device px: 26 css px at 900 lines (larger screens a little more). */
  get px() { return Math.round(Math.max(20, Math.min(34, innerHeight * 0.029)) * (TOUCH ? 0.8 : 1) * this.dpr); }
  big(z) { return !!(z.champ || z.def?.boss); }

  // -------------------------------------------------------------- what the bodies report
  /** A blow landed (hp was `before`): h the hit (point, bone), o its options (dmg, kind, heavy). */
  struck(z, before, h, o = {}) {
    const s = this.st(z);
    if (!s.max) s.max = Math.max(before, 1);
    const amt = this.oneHit(z) ? before : Math.max(0, before - z.hp);
    s.seen = this.now; z.fxBarT = performance.now();   // (villagers.js: no speech bubble over its bar while it shows)
    if (amt < 0.5) {
      if ((o.dmg || 0) > 0 && !z.dead && z.slime && (z.sp?.resist?.[o.kind] ?? 1) <= 0) this.word('Immune', 'grey', z);
      return;
    }
    const kind = KIND[o.kind] || 'phys';
    this.number(z, amt, kind === 'phys' && o.heavy ? 'heavy' : kind, !!o.heavy);
    if (kind === 'shock' && Math.random() < 0.5) this.word('Shocked', 'shock', z);
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
    const bone = z.bones?.[waist ? 'spine' : limb];
    const at = head ? this.headOf(z, new THREE.Vector3()).add(_d.set(0, -0.3, 0)) : bone ? bone.getWorldPosition(new THREE.Vector3()) : this.headOf(z, new THREE.Vector3());
    const px = Math.round(this.px * 0.95);
    this.push({ type: 'gore', img: setText(head ? 'Beheaded' : waist ? 'Cut in Two' : 'Severed', px, RAMPS.gore, { weight: 700, spacing: 0.16 }), t: 0, life: 1.1, at });
    this.st(z).goreAt = this.now;
    const nm = fmt.foe(nameOf(z)), the = theName(z, nm);
    const part = LIMB[limb.replace(/[LR]$/, '')], side = SIDE[limb.slice(-1)];
    this.later.push(head ? `${fmt.you()} take the head off ${the}!` : waist ? `${fmt.you()} cut ${the} in two!`
      : `${fmt.you()} sever ${the}'s ${side ? side + ' ' : ''}${part || 'limb'}!`);
  }

  /** A foe's shield (or blade) turned your blow. */
  blocked(z) {
    this.word('Blocked', 'grey', z);
    this.st(z).seen = this.now;
    this.o.chat?.add('block', `${fmt.foe(nameOf(z))} turns your blow aside`);
  }

  /** You parried its blow (main.js). */
  parried(z) {
    if (z) { this.st(z).seen = this.now; this.word('Parried', 'gold', z); }
    this.o.chat?.add('block', `${fmt.you()} parry ${z ? `${theName(z, fmt.foe(nameOf(z)))}'s` : 'the'} blow!`);
  }

  died(z) {
    const s = this.st(z);
    s.dead = this.now;
    this.endDots(z, s, true);
    // the number still up becomes the killing blow's: red and white, a size up
    const p = s.num;
    if (p && !p.done) { p.ramp = 'kill'; p.size = Math.max(p.size, Math.round(this.px * 1.35)); p.render = true; p.bump = this.now; p.t = Math.min(p.t, 0.12); p.life = 1.15; }
    // SLAIN where the bar was (not when a limb's word already says it)
    if (!(this.now - (s.goreAt ?? -9) < 0.3)) this.push({ type: 'slain', z, img: setText('Slain', Math.round(this.px * 0.8), RAMPS.gold, { weight: 700, spacing: 0.22 }), t: 0, life: 1.2, at: this.headOf(z, new THREE.Vector3()) });
    this.o.chat?.add('kill', `${fmt.foe(nameOf(z))} is slain`);
  }

  /** You were hurt: dmg what got through; by who (or null); kind 'melee'|'spell'|'fall'; blocked
   * what your shield stopped. */
  hurt(dmg, by, kind, blocked = 0) {
    const chat = this.o.chat, nm = by ? fmt.foe(nameOf(by)) : null, the = by ? theName(by, nm) : '';
    if (blocked >= 0.5 && nm) chat?.add('block', `${fmt.you()} block ${fmt.num(Math.round(blocked))} of ${the}'s ${kind === 'spell' ? 'spell' : 'blow'}`);
    if (dmg < 0.5) return;
    const n = Math.round(dmg);
    this.barNumber('-' + n, 'hurt');
    const The = the.startsWith('the ') ? 'The ' + the.slice(4) : the;
    if (kind === 'fall') chat?.add('hurt', `The fall hurts you for ${fmt.num(n, 'hurt')}`);
    else if (nm) chat?.add('hurt', kind === 'spell' ? `${The}'s spell strikes you for ${fmt.num(n, 'hurt')}` : `${The} hits you for ${fmt.num(n, 'hurt')}`);
    else chat?.add('hurt', `You take ${fmt.num(n, 'hurt')} damage`);
  }

  /** Life coming back (shown in lumps, not every frame's trickle). */
  healed(n) { this.heal += n; }

  // -------------------------------------------------------------- pops
  /** A blow's number on foe z: added into the one still up (same colours, within MERGE s), or a new
   * one bursting from under the bar, out to the side away from the last. */
  number(z, n, ramp, heavy = false) {
    const s = this.st(z), size = heavy ? Math.round(this.px * 1.3) : this.px, live = s.num;
    if (live && !live.done && live.ramp === ramp && this.now - live.born < MERGE) {
      live.value += n; live.size = Math.max(live.size, size); live.bump = this.now; live.t = Math.min(live.t, 0.12); live.born = this.now;
      return;
    }
    if (live) live.done = true;   // (no more added into it)
    const side = (s.side = -(s.side || (Math.random() < 0.5 ? 1 : -1)));
    const p = { type: 'num', z, value: n, shown: 0, ramp, size, render: true, t: 0, born: this.now, life: heavy ? 1.1 : 0.9,
      side, ox: side * 26, vx: side * (60 + Math.random() * 50), vy: -80, g: 420, at: this.headOf(z, new THREE.Vector3()) };
    this.push(p);
    s.num = p;
  }
  /** A word over foe z, in its lane: at most two, the newest at the bottom pushing the older up. */
  word(text, ramp, z, life = 1.2) {
    const s = this.st(z);
    s.words ||= {};
    if (this.now - (s.words[text] ?? -9) < 0.8) return;
    s.words[text] = this.now;
    s.tags = s.tags.filter((p) => !p.gone);
    if (s.tags.length >= 2) { const old = s.tags.shift(); old.gone = true; }
    const p = { type: 'tag', z, img: setText(text.toUpperCase(), Math.round(this.px * 0.58), RAMPS[ramp], { weight: 700, spacing: 0.22 }), t: 0, life, y: 0, at: this.headOf(z, new THREE.Vector3()) };
    s.tags.push(p);
    this.push(p);
  }
  /** Your hurts and heals, off the life bar: hurts from its right end, heals from its left, each soon
   * after the last a step higher. */
  barNumber(txt, ramp) {
    const el = this.o.bar?.();
    if (!el) return;
    const r = el.getBoundingClientRect(), heal = txt[0] === '+';
    const step = this.now - (this.barLast ?? -9) < 0.5 ? (this.barStep = (this.barStep || 0) + 1) % 4 : (this.barStep = 0);
    this.barLast = this.now;
    const p = TOUCH
      ? { sx: heal ? r.left + 20 : r.right - 20, sy: r.bottom + 14 + step * 12, vy: 30 }
      : { sx: heal ? r.left + 24 : r.right - 24, sy: r.top - 14 - step * 16, vy: -40 };
    this.push({ type: 'screen', img: setText(txt, Math.round(this.px * 0.85), RAMPS[ramp]), t: 0, life: 1.0, ...p });
  }
  push(p) {
    if (this.pops.length >= MAX_POPS) this.pops.shift();
    this.pops.push(p);
  }

  // -------------------------------------------------------------- each frame
  update(dt) {
    this.now += dt;
    this.flushLog();
    // healing in lumps of at least 5, every so often
    if ((this.healT -= dt) <= 0) { if (this.heal >= 5) this.barNumber('+' + Math.round(this.heal), 'heal'); this.heal = 0; this.healT = 0.8; }
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
          this.word(A.tag, A.ramp, z);
          this.o.chat?.add('ail', `${fmt.foe(nameOf(z))} ${A.says}`);
          s.seen = this.now;
        });
        if (gone) this.endDots(z, s, false, gone);
        s.af = bits;
        // a spell's touch, every 0.3 s
        if (s.hAcc > 0 && ((s.hT = (s.hT || 0) + dt) >= 0.3 || z.dead)) {
          this.number(z, s.hAcc, s.hKind);
          this.batch.push({ z, amt: s.hAcc, kind: s.hKind, heavy: false });
          s.hAcc = 0; s.hT = 0;
        }
        // the burn's and the poison's harm: one small count a second, on the far side of the bar
        if (s.dotAcc > 0 && (s.dotT += dt) >= 1) {
          if (s.dotAcc >= 0.5) this.push({ type: 'num', z, value: s.dotAcc, shown: s.dotAcc, ramp: s.dotKind, size: Math.round(this.px * 0.62), render: true, t: 0, born: this.now, life: 0.8, done: true,
            side: 1, ox: 40, vx: 18, vy: -36, g: 0, at: this.headOf(z, new THREE.Vector3()) });
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
      if (t >= 1) this.o.chat?.add('ail', `${fmt.foe(nameOf(z))} was ${A.dot} for ${numWord(Math.round(t), A.ramp, '')}`);
      s.dot[A.k] = 0;
    });
  }

  /** This frame's blows into the log: a foe struck again within RUN s keeps its line, counting; a
   * blast's foes share one. */
  flushLog() {
    if (!this.batch.length && !this.later.length) return;
    const chat = this.o.chat, by = new Map(), later = this.later;
    for (const b of this.batch) (by.get(b.kind) || by.set(b.kind, []).get(b.kind)).push(b);
    this.batch = []; this.later = [];
    if (!chat) return;
    for (const list of by.values()) {
      const kind = list[0].kind, heavy = list.some((b) => b.heavy), word = WORD[kind] ? ` ${WORD[kind]}` : '', css = kind === 'phys' && heavy ? 'heavy' : kind;
      const per = new Map();
      for (const b of list) per.set(b.z, (per.get(b.z) || 0) + b.amt);
      if (per.size === 1) {
        const [[z, n]] = per, s = this.st(z), key = 'hit:' + (z.id ?? nameOf(z));
        // (the same foe again, its line still the log's last: one line, counting)
        let run = s.run;
        if (!run || this.now - run.t > RUN || chat.tailKey?.() !== key) run = s.run = { hits: [] };
        run.t = this.now; run.hits.push([Math.round(n), css]);
        const nm = fmt.foe(nameOf(z));
        if (run.hits.length === 1) chat.add('hit', `${fmt.you()} ${heavy ? 'smite' : 'hit'} ${theName(z, nm)} for ${numWord(Math.round(n), css, word)}`, { key });
        else {
          const total = run.hits.reduce((a, [v]) => a + v, 0), last = run.hits.slice(-4);
          chat.add('hit', `${fmt.you()} hit ${theName(z, nm)} <b class="c-x">×${run.hits.length}</b> ${run.hits.length > 4 ? '… ' : ''}${last.map(([v, c]) => fmt.num(v, c)).join(' · ')} <i>(${total})</i>`, { key });
        }
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
  /** Just over its head: where its bar sits. */
  headOf(z, out) {
    if (z.slime) { (z.center ? z.center(out) : out.copy(z.pos)); out.y += (z.H || 0.5) * 0.6 + 0.3; return out; }
    const head = z.bones?.head;
    const sz = z.size || 1;
    if (head && !z.lost?.has('head') && !z.dead) { head.getWorldPosition(out); out.y += 0.42 * sz; return out; }
    out.copy(z.pos); out.y += (z.mode === 'crawl' || z.dead ? 0.8 : 1.95) * sz;
    return out;
  }
  barK(dpr) { return Math.max(1, Math.round(2 * dpr)); }
  /** Where a foe's lanes are on screen this frame (device px; null: behind you): the bar's bottom
   * centre, and how tall the bar (and a champion's name) stands. */
  anchor(z, W, H, dpr) {
    const s = this.state.get(z);
    if (s?.scr !== undefined && s.scrAt === this.frameNo) return s.scr;
    const at = z.gone ? (s?.last || this.headOf(z, _w)) : this.headOf(z, _w);
    if (s) s.last = (s.last || new THREE.Vector3()).copy(at);
    _v.copy(at).project(this.o.camera);
    const k = this.barK(dpr);
    const scr = _v.z > 1 || _v.z < -1 ? null : { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H, top: 6 * k + (this.big(z) ? Math.round(this.px * 0.6) + 4 * k : 0) };
    if (s) { s.scr = scr; s.scrAt = this.frameNo; }
    return scr;
  }
  project(at, W, H) {
    if (!at) return null;
    _v.copy(at).project(this.o.camera);
    return _v.z > 1 || _v.z < -1 ? null : { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H, top: 0 };
  }

  // -------------------------------------------------------------- drawing
  draw(dt) {
    const c = this.canvas, g = this.g, dpr = this.dpr;
    const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; this.drawn = true; }
    this.frameNo = (this.frameNo || 0) + 1;
    const bars = this.hidden ? [] : this.barList(dt, W, H, dpr);
    if (!bars.length && (!this.pops.length || this.hidden)) {
      if (this.drawn) { g.clearRect(0, 0, W, H); this.drawn = false; }
      if (this.hidden) this.pops.length = 0;
      return;
    }
    g.clearRect(0, 0, W, H); this.drawn = true;
    for (const b of bars) this.bar(g, b, dpr);
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      if (p.t >= p.life || p.gone) { this.pops.splice(i, 1); continue; }
      this.drawPop(g, p, dt, W, H, dpr);
    }
    g.globalAlpha = 1;
  }

  /** Keep a pop's box out of the crosshair's (pushed out sideways); on a phone, clear of the thumb
   * buttons on the right and the screen's edges. Returns [x, y]. */
  clear(x, y, w, h, W, H, dpr, push = true) {
    const cx = W / 2, cy = H / 2, R = (TOUCH ? 20 : 28) * dpr;
    if (push && Math.abs(x - cx) < R + w / 2 && Math.abs(y - cy) < R + h / 2) x = x < cx ? cx - R - w / 2 : cx + R + w / 2;
    if (TOUCH) { x = Math.min(Math.max(x, w / 2 + 4), W * 0.6 - w / 2); y = Math.min(Math.max(y, 40 * dpr + h / 2), H - 90 * dpr - h / 2); }
    return [x, y];
  }

  drawPop(g, p, dt, W, H, dpr) {
    const t = p.t;
    let x, y, k = 1, a = t > p.life - 0.22 ? Math.max(0, (p.life - t) / 0.22) : 1;
    if (p.type === 'num') {
      // counting up to what it's been given, set again as the whole number changes
      p.shown += (p.value - p.shown) * Math.min(1, dt / 0.06);
      if (Math.abs(p.value - p.shown) < 0.5) p.shown = p.value;
      const v = Math.max(1, Math.round(p.shown));
      if (p.render || v !== p.drawnV) { p.drawnV = v; p.render = false; p.img = setText(String(v), p.size, RAMPS[p.ramp]); }
      const A = this.anchor(p.z, W, H, dpr) || this.project(p.at, W, H);
      if (!A) return;
      x = A.x + (p.ox + p.vx * t) * dpr;
      y = A.y + (8 + p.vy * t + 0.5 * p.g * t * t) * dpr + p.img.height / 2;
      const since = this.now - (p.bump ?? -9), pop = Math.min(t, since);
      k = pop < 0.09 ? 1.35 - 0.35 * (pop / 0.09) : 1;
      [x, y] = this.clear(x, y, p.img.width * k, p.img.height * k, W, H, dpr);
    } else if (p.type === 'tag') {
      const A = this.anchor(p.z, W, H, dpr) || this.project(p.at, W, H);
      if (!A) return;
      // its slot: the newest just over the bar, each older one stacked above it
      const s = this.state.get(p.z), list = (s?.tags || []).filter((q) => !q.gone);
      let slot = 0;
      for (let i = list.indexOf(p) + 1; i < list.length; i++) slot += list[i].img.height;
      p.y += (slot - p.y) * Math.min(1, dt * 18);
      x = A.x;
      y = A.y - A.top - 4 * dpr - p.y - Math.min(t, 1) * 12 * dpr - p.img.height / 2;
      k = t < 0.08 ? 1.25 - 0.25 * (t / 0.08) : 1;
      [x, y] = this.clear(x, y, p.img.width, p.img.height, W, H, dpr, false);
    } else if (p.type === 'gore') {
      const A = this.project(p.at, W, H);
      if (!A) return;
      x = A.x; y = A.y;
      const R = (TOUCH ? 20 : 28) * dpr;   // (by the wound, but over the crosshair, never on it)
      if (Math.abs(x - W / 2) < R + p.img.width / 2 && y > H / 2 - R - p.img.height / 2) y = H / 2 - R - p.img.height / 2;
      k = t < 0.09 ? 1.8 - 0.8 * (t / 0.09) : 1;
      if (t > 0.8) y -= ((t - 0.8) / 0.3) * 20 * dpr;
      [x, y] = this.clear(x, y, p.img.width, p.img.height, W, H, dpr, false);
    } else if (p.type === 'slain') {
      const A = this.anchor(p.z, W, H, dpr) || this.project(p.at, W, H);
      if (!A) return;
      x = A.x; y = A.y - A.top / 2 - Math.max(0, t - 0.5) * 16 * dpr;
      k = t < 0.09 ? 1.3 - 0.3 * (t / 0.09) : 1;
      [x, y] = this.clear(x, y, p.img.width, p.img.height, W, H, dpr, false);
    } else {   // off the life bar
      x = p.sx * dpr; y = (p.sy + p.vy * (1 - (1 - Math.min(1, t / 0.8)) ** 2) * 0.8) * dpr;
      k = t < 0.08 ? 1.3 - 0.3 * (t / 0.08) : 1;
    }
    const img = p.img, w = img.width * k, h = img.height * k;
    g.globalAlpha = a;
    g.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
  }

  /** The foes whose bars show this frame, nearest last (so it's drawn on top). */
  barList(dt, W, H, dpr) {
    const out = [];
    this.o.camera.getWorldPosition(_w);
    const eye = _w.clone();
    for (const [z, s] of this.state) {
      if (z.gone || z.state === 'buried') continue;
      const since = this.now - s.seen, deadFor = s.dead >= 0 ? this.now - s.dead : -1;
      if (s.seen < 0 || since > BAR_SHOW + BAR_FADE || deadFor > 0.35) continue;
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
      const A = this.anchor(z, W, H, dpr);
      if (!A || A.x < -W * 0.1 || A.x > W * 1.1 || A.y < -H * 0.1 || A.y > H * 1.1) continue;
      let a = since > BAR_SHOW ? 1 - (since - BAR_SHOW) / BAR_FADE : 1;
      if (deadFor >= 0) a *= Math.max(0, 1 - deadFor / 0.35);
      out.push({ z, s, A, dist, a, frac });
    }
    return out.sort((p, q) => q.dist - p.dist);
  }

  bar(g, b, dpr) {
    const { z, s, A } = b;
    const big = this.big(z);
    const k = this.barK(dpr) - (b.dist > 26 && !big && dpr >= 1 ? Math.min(1, this.barK(dpr) - 1) : 0);   // device px per bar pixel
    const inner = big ? 56 : 28, bw = (inner + 2) * k, bh = 6 * k;
    const x0 = Math.round(A.x - bw / 2), y0 = Math.round(A.y - bh);
    g.globalAlpha = b.a;
    if (big) {   // a champion's: a gold frame, its name above in the title's capitals
      g.fillStyle = '#c8a050'; g.fillRect(x0 - k, y0 - k, bw + 2 * k, bh + 2 * k);
      s.nameImg ||= setText(nameOf(z).toUpperCase(), Math.round(this.px * 0.5), RAMPS.name, { weight: 700, spacing: 0.14 });
      g.drawImage(s.nameImg, Math.round(A.x - s.nameImg.width / 2), Math.round(y0 - 2 * k - s.nameImg.height));
    }
    g.fillStyle = '#07060a'; g.fillRect(x0, y0, bw, bh);
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
    g.globalAlpha = 1;
  }
}
