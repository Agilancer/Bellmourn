// What the enemies say (lines in lines/foes.js), in bubbles over their heads and aloud (speech.js,
// voice.js). Velscour's Sworn call out when they see you, taunt you one at a time as they circle,
// and in a group talk it over among themselves (who goes first, a wager, a plan to flank, your
// weapon), the mood turning as the fight does: sure of themselves at first, uneasy when you cut
// one of them down, crowing when you're nearly done. They curse when hurt, and the dying say their
// last. Their lord and the sorcerers have words of their own. The dead mutter: broken fragments of
// what they were, and noises that are not words at all; the cave's things hiss and click.
//
// Paced so it never swamps the fight: one knight's taunt every few seconds, a group exchange now
// and then, one of the dead's mutterings at a time, and a speaker never talks over themselves.
import * as THREE from 'three';
import { speak, tickTalk } from './speech.js';
// (the lines: a big file, loaded after the game is up; till then the enemy keep quiet)
let KNIGHT = null, KNIGHT_BANTER = [], UNDEAD = null, BEAST = null, gibberish = () => '';
import('./lines/foes.js').then((m) => { ({ KNIGHT, KNIGHT_BANTER, UNDEAD, BEAST, gibberish } = m); }).catch((e) => console.warn('enemy lines', e));

const pick = (a) => (a && a.length ? a[Math.floor(Math.random() * a.length)] : null);
const chance = (p) => Math.random() < p;
const HEAR = 24;              // metres: further off they don't bother speaking to you

export class Chatter {
  constructor(zombies) {
    this.zombies = zombies;
    this.t = 0;
    this.nextTaunt = 4;        // the next lone taunt
    this.nextBanter = 9;       // the next group exchange
    this.nextMutter = 2;       // the next of the dead's mutterings
    this.seq = null;           // a group exchange under way: { lines, who, i, wait }
    this.fightT = 0;           // how long the Sworn have been at you
    this.fellT = -99;          // when you last cut one of them down
    this.lastHealth = null;
    this._talking = [];
  }

  /** Who among the enemy is speaking (for the bubbles). */
  talking() { return this._talking; }

  voiceOf(z) {
    if (this.isKnight(z)) {
      const lord = z.def?.stats === 'lord';
      return { key: z.variant + ':' + z.id, sex: z.def?.body?.sex || 'm', kind: z.kindName === 'sorcerer' ? 'sorcerer' : lord ? 'lord' : 'knight' };
    }
    if (z.kindName === 'ghast' || z.kindName === 'grubber') return { key: z.variant + ':' + z.id, kind: 'beast' };
    return { key: (z.variant || 'dead') + ':' + z.id, sex: z.id % 3 ? 'm' : 'f', kind: 'undead' };
  }

  isKnight(z) { return z.kindName === 'knight' || z.kindName === 'sorcerer'; }

  /** z says text (if it's not already talking and isn't dead, unless it's its last words). */
  say(z, text, o = {}) {
    if (!text || (z.dead && !o.last) || (z.talk && !o.cut)) return 0;
    z.speaker = this.isKnight(z) ? (z.def?.title || '') : '';
    if (!z.speechAt) z.speechAt = (out) => this.headOf(z, out);
    return speak(z, text, false, { voice: { ...this.voiceOf(z), pos: z.pos } });
  }

  headOf(z, out) {
    const b = z.bones?.head || z.bones?.neck || z.bones?.spine;
    if (b) b.getWorldPosition(out); else out.copy(z.pos).setY(z.pos.y + 1.7);
    out.y += 0.42 * (z.size || 1);
    return out;
  }

  /** Each frame. */
  update(dt, player, active) {
    this.t += dt;
    const list = this.zombies.list, talking = this._talking;
    talking.length = 0;
    for (const z of list) {
      if (z.talk) { tickTalk(z, dt); if (z.talk) talking.push(z); }
    }
    if (!active || !player || !KNIGHT) return;
    const P = player.pos;
    // who's close and what they're doing; and what's happened to them since the last frame
    const knights = [];
    let near = 0;
    for (const z of list) {
      if (z.gone) continue;
      const d = Math.hypot(z.pos.x - P.x, z.pos.z - P.z);
      if (d > HEAR || Math.abs(z.pos.y - P.y) > 6) { z._hpWas = z.hp; z._aggroWas = z.aggro; z._deadWas = z.dead; continue; }
      const knight = this.isKnight(z), beast = z.kindName === 'ghast' || z.kindName === 'grubber';
      const L = knight ? KNIGHT : null;
      // dying: their last words
      if (z.dead && !z._deadWas) {
        if (knight) { this.fellT = this.t; if (chance(0.7)) this.say(z, pick(L.die), { last: true, cut: true }); }
        else if (!beast && chance(0.35)) this.say(z, chance(0.5) ? pick(UNDEAD.die) : gibberish(), { last: true, cut: true });
      } else if (!z.dead) {
        // seeing you
        if (z.aggro && !z._aggroWas) {
          if (knight) this.say(z, z.def?.stats === 'lord' ? pick(L.lordTaunt) : z.kindName === 'sorcerer' ? pick(L.sorcerer) : pick(L.spot));
          else if (beast) { if (chance(0.5)) this.say(z, pick(BEAST[z.kindName])); }
          else if (chance(0.45)) this.say(z, chance(0.5) ? pick(UNDEAD.spot) : gibberish());
        }
        // hurt
        if (z._hpWas != null && z.hp < z._hpWas - 1) {
          const max = z.kind?.hp || z._hpMax || z.hp;
          if (knight) {
            if (!z._wounded && z.hp < max * 0.5) { z._wounded = true; this.say(z, pick(L.wounded), { cut: true }); }
            else if (chance(0.3)) this.say(z, pick(L.hurt));
          } else if (!beast && chance(0.18)) this.say(z, chance(0.4) ? pick(UNDEAD.hurt) : gibberish());
        }
        if (knight && z.aggro && z.goal === 'chase') knights.push({ z, d });
        if (z.aggro) near++;
      }
      z._hpWas = z.hp; z._aggroWas = z.aggro; z._deadWas = z.dead;
    }
    // a blow of theirs landing on you: the nearest knight crows about it
    if (this.lastHealth != null && player.health < this.lastHealth - 2 && knights.length && chance(0.4)) {
      const k = knights.reduce((a, b) => (b.d < a.d ? b : a));
      if (k.d < 3.5) this.say(k.z, pick(KNIGHT.hit));
    }
    this.lastHealth = player.health;
    // the fight with the Sworn: lone taunts, and now and then a group exchange
    this.fightT = knights.length ? this.fightT + dt : 0;
    if (this.seq) this.runSeq(dt);
    else if (knights.length) {
      const free = knights.filter((k) => !k.z.talk);
      if (free.length >= 2 && this.t > this.nextBanter) this.startBanter(free, player);
      else if (free.length && this.t > this.nextTaunt) {
        const k = pick(free);
        this.say(k.z, k.z.def?.stats === 'lord' ? pick(KNIGHT.lordTaunt) : k.z.kindName === 'sorcerer' ? pick(KNIGHT.sorcerer) : pick(KNIGHT.taunt));
        this.nextTaunt = this.t + 4 + Math.random() * 4 + (knights.length > 2 ? 0 : 2);
      }
    }
    // the dead mutter as they come (one at a time, every few seconds near you)
    if (this.t > this.nextMutter) {
      this.nextMutter = this.t + 2.5 + Math.random() * 4 / Math.max(1, Math.sqrt(near));
      const dead = [];
      for (const z of list) if (!z.dead && !z.gone && !z.talk && !this.isKnight(z) && z.state !== 'buried' && z.root?.visible && Math.hypot(z.pos.x - P.x, z.pos.z - P.z) < 16) dead.push(z);
      const z = pick(dead);
      if (z) {
        if (z.kindName === 'ghast' || z.kindName === 'grubber') { if (chance(0.5)) this.say(z, pick(BEAST[z.kindName])); }
        else this.say(z, chance(0.55) ? gibberish() : pick(UNDEAD.moan));
      }
    }
  }

  /** A group exchange among 2 to 4 of the knights at you, its mood from how the fight is going. */
  startBanter(free, player) {
    const hp = player.health / (player.maxHealth || 100);
    const mood = this.fightT < 8 ? 'start' : hp < 0.35 ? 'winning' : this.t - this.fellT < 20 ? 'losing' : 'fight';
    const n = Math.min(4, free.length);
    const fits = KNIGHT_BANTER.filter((b) => b.n <= n && b.mood === mood);
    const b = pick(fits.length ? fits : KNIGHT_BANTER.filter((x) => x.n <= n));
    this.nextBanter = this.t + 22 + Math.random() * 18;
    this.nextTaunt = this.t + 6;
    if (!b) return;
    // (the speakers: the nearest knights, in a shuffled order)
    const who = free.slice().sort((p, q) => p.d - q.d).slice(0, b.n).map((k) => k.z).sort(() => Math.random() - 0.5);
    this.seq = { lines: b.lines, who, i: 0, wait: 0 };
  }

  runSeq(dt) {
    const s = this.seq;
    if ((s.wait -= dt) > 0) return;
    if (s.i >= s.lines.length) { this.seq = null; return; }
    const [k, text] = s.lines[s.i++];
    const z = s.who[k % s.who.length];
    if (!z || z.dead) { s.wait = 0.2; return; }
    if (z.talk) z.talk = null;
    s.wait = this.say(z, text, { cut: true }) + 0.25;
  }
}
