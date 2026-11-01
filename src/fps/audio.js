// The game's sounds. Recorded ones (assets/audio/sfx, from the user's effects pack: tools/audio/
// build_audio.py) for blades, blows, blocks, footsteps on each ground (and in mail), doors, chests and
// the spells; until they're in (and for what the pack has nothing for) little synthesized ones:
// swings, clangs, casts, bursts, bells. Music and the ambience have their own lines out (music.js,
// ambience.js), each with its own volume, all under the one master volume.
// The context starts on the first click or key, as browsers require.

const SFX_DIR = 'assets/audio/sfx/';
// the effects, by name, and how many takes of each (name_1 .. name_n; a 0 is a single file, `name`)
const TAKES = {
  sword_attack: 3, sword_blocked: 3, sword_impact_hit: 3, sword_parry: 3, sword_sheath: 2, sword_unsheath: 2, bow_impact_hit: 3,
  chop: 4, mine: 5, chest_open: 2, chest_close: 2, door_open: 2, door_close: 2, lock_unlock: 0,
  fireball: 3, firebuff: 2, firespray: 2, waterspray: 2, wave_attack: 2, rock_wall: 2, spell_impact: 3,
  ice_barrage: 2, ice_freeze: 2, ice_throw: 2, ice_wall: 2, rock_meteor_swarm: 2, rock_meteor_throw: 2, light_torch: 2, torch_attack_strike: 2,
};
for (const g of ['dirt', 'stone', 'water', 'wood']) for (const c of ['', 'chain_']) {
  TAKES[`${g}_${c}walk`] = 5; TAKES[`${g}_${c}run`] = 5; TAKES[`${g}_${c}jump`] = 0; TAKES[`${g}_${c}land`] = 0;
}
// what each spell sounds like as it leaves the hand: [effect, volume, pitch]
const SPELL_CAST = {
  firebolt: ['fireball', 1.1], frost: ['ice_throw', 1], wallfire: ['firespray', 1.1], firebeam: ['firebuff', 1], meteor: ['firebuff', 0.9, 0.8],
  arcaneblast: ['wave_attack', 0.9, 1.15], nova: ['ice_wall', 1], blizzard: ['ice_barrage', 0.9], lance: ['rock_meteor_throw', 1.2, 1.1],
  plague: ['rock_meteor_throw', 0.7, 1.35], blades: ['sword_unsheath', 1.1], spikes: ['rock_wall', 1.2], wisp: ['light_torch', 1], staff: ['spell_impact', 0.5, 0.7],
};
// how loud the recorded crowds play at the strike (tools/audio/crowd_preview.html tries them)
const CROWD_VOL = { gasp: 0.8, panic: 1.2 };
const clamp1 = (x) => Math.max(-1, Math.min(1, x));
/** Where a decoded effect's sound begins (past the file's own silence and the encoder's), seconds. */
export function onset(b) {
  const d = b.getChannelData(0), n = Math.min(d.length, Math.round(b.sampleRate * 0.25));
  for (let i = 0; i < n; i++) if (Math.abs(d[i]) > 0.0025) return Math.max(0, i - b.sampleRate * 0.004) / b.sampleRate;
  return 0;
}

export class Sfx {
  constructor() {
    this.ctx = null;
    this.volume = 0.5;
    this.musicVolume = 0.7; this.ambVolume = 0.8;
    try {
      const m = parseFloat(localStorage.getItem('bm.music')), a = parseFloat(localStorage.getItem('bm.ambience'));
      if (Number.isFinite(m)) this.musicVolume = m;
      if (Number.isFinite(a)) this.ambVolume = a;
    } catch { /* no storage */ }
    this.bank = {};          // name -> [{b: AudioBuffer, off: where its sound starts}]
    this.pick = {};          // name -> the take last played (never the same twice running)
    this.voices = 0;
    this.ear = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };   // where you hear from, and which way is your right
    this.onStart = [];       // (music.js: its players are let play by the same click)
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      for (const f of this.onStart) f();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    // master volume, then a gentle limiter so music, the world and a fight together never crackle
    this.out = c.createGain();
    this.out.gain.value = this.volume;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 4; lim.ratio.value = 10; lim.attack.value = 0.003; lim.release.value = 0.2;
    this.out.connect(lim); lim.connect(c.destination);
    this.music = c.createGain(); this.music.gain.value = this.musicVolume; this.music.connect(this.out);
    this.amb = c.createGain(); this.amb.gain.value = this.ambVolume; this.amb.connect(this.out);
    const n = c.sampleRate;
    this.noise = c.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    for (const f of this.onStart) f();
  }

  setMusicVolume(v) { this.musicVolume = v; if (this.music) this.music.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setAmbVolume(v) { this.ambVolume = v; if (this.amb) this.amb.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  /** A file fetched and decoded (null if it can't be). */
  async decode(url) {
    if (!this.ctx) this.start();
    const c = this.ctx;
    if (!c) return null;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const ab = await r.arrayBuffer();
      return await new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); p?.catch?.(rej); });
    } catch (e) { console.warn('sound', url, e?.message || e); return null; }
  }

  /** The village's gasp and panic at the green star's strike (recorded crowds: the whole gasp, the
   * panic's first 1.5 s), fetched first and on their own, so the opening can wait for just these. */
  loadCrowd() {
    if (this.crowding) return this.crowding;
    this.crowding = Promise.all(['crowd_gasp', 'crowd_panic'].map(async (name) => {
      const b = await this.decode(SFX_DIR + name + '.mp3');
      if (b) this.bank[name] = [{ b, off: 0 }];
    }));
    return this.crowding;
  }

  /** The effects, fetched and decoded a few at a time (each plays as soon as it's in). */
  loadBank() {
    if (this.banking) return this.banking;
    this.loadCrowd();
    const files = [];
    for (const [name, k] of Object.entries(TAKES)) for (let i = 1; i <= Math.max(1, k); i++) files.push([name, k ? `${name}_${i}` : name]);
    let next = 0;
    const one = async () => {
      while (next < files.length) {
        const [name, f] = files[next++];
        const b = await this.decode(SFX_DIR + f + '.mp3');
        if (b) (this.bank[name] ||= []).push({ b, off: onset(b) });
      }
    };
    this.banking = Promise.all([one(), one(), one(), one()]).then(() => this.bank);
    return this.banking;
  }

  /** Where you hear from (the camera), each frame. */
  hear(camera) {
    const p = camera.position, e = camera.matrixWorld.elements;
    this.ear.x = p.x; this.ear.y = p.y; this.ear.z = p.z;
    const l = Math.hypot(e[0], e[2]) || 1;
    this.ear.rx = e[0] / l; this.ear.rz = e[2] / l;
  }

  /** How loud (0..1) and to which side (-1..1) a sound at p is, heard `far` metres off at most. */
  place(p, far = 35) {
    const E = this.ear, x = p.x ?? p[0], y = p.y ?? p[1], z = p.z ?? p[2];
    const dx = x - E.x, dz = z - E.z, d = Math.hypot(dx, y - E.y, dz), h = Math.hypot(dx, dz);
    const k = Math.max(0, 1 - d / far);
    return { k: k * k, pan: h > 0.3 ? clamp1((dx * E.rx + dz * E.rz) / h) * Math.min(1, d / 3) * 0.85 : 0, d };
  }

  /** One take of a recorded effect: false if it isn't in yet (the caller makes do). o: {vol, rate,
   * vary (pitch wander), at (a place: heard from there), far, pan, delay, to (a line out)} */
  play(name, { vol = 1, rate = 1, vary = 0.05, at = null, far = 35, pan = 0, delay = 0, to = null } = {}) {
    const takes = this.bank[name];
    if (!this.ok || !takes?.length) return false;
    let g = vol, p = pan;
    if (at) { const q = this.place(at, far); if (q.k < 0.004) return true; g *= q.k; p = q.pan; }
    if (this.voices > 48) return true;
    let i = Math.floor(Math.random() * takes.length);
    if (takes.length > 1 && i === this.pick[name]) i = (i + 1) % takes.length;
    this.pick[name] = i;
    const s = takes[i], c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = s.b;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    const gn = c.createGain();
    gn.gain.value = g;
    src.connect(gn);
    let last = gn;
    if (p && c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = clamp1(p); gn.connect(pn); last = pn; }
    last.connect(to || this.out);
    src.start(t, s.off);
    this.voices++;
    src.onended = () => { this.voices--; last.disconnect(); };
    return true;
  }
  has(name) { return !!this.bank[name]?.length; }

  _noise(t0, dur, { type = 'bandpass', f0 = 800, f1 = 800, q = 1, gain = 0.4, attack = 0.01 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.out);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
  }

  _tone(t0, dur, { type = 'sine', f0 = 440, f1 = 440, gain = 0.2, attack = 0.005 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.out);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  get ok() { return this.ctx && this.ctx.state === 'running'; }

  /** A blow through the air: a blade's swish, or a staff's or a mace's heavier whoom. */
  swing(heavy = false, blunt = false) {
    if (!this.ok) return;
    if (this.play(blunt ? 'torch_attack_strike' : 'sword_attack', { vol: (heavy ? 1.15 : 0.9) * (blunt ? 0.85 : 1), rate: heavy ? 0.86 : 1 })) return;
    const t = this.ctx.currentTime;
    this._noise(t, heavy ? 0.42 : 0.28, { f0: heavy ? 300 : 500, f1: heavy ? 1400 : 2400, q: 1.6, gain: heavy ? 0.5 : 0.35, attack: 0.08 });
  }

  /** Something smashed, heard from `at`: boards splitting with a crack and a clatter, or pottery
   * shattering (the recordings; made-up sounds until they're in). */
  smash(clay = false, at = null) {
    if (!this.ok) return;
    if (clay ? this.play('mine', { vol: 0.9, rate: 1.7, at }) : this.play('chop', { vol: 1.25, rate: 0.78, at })) {
      if (clay) this.play('chop', { vol: 0.5, rate: 1.5, at, delay: 0.02 });
      else this.play('chop', { vol: 0.6, rate: 1.15, at, delay: 0.14 });
      return;
    }
    const t = this.ctx.currentTime;
    if (clay) {
      this._noise(t, 0.12, { type: 'highpass', f0: 3200, f1: 1800, gain: 0.55, attack: 0.002 });
      for (let i = 0; i < 7; i++) {
        const f = 2400 + Math.random() * 2600, at = t + 0.02 + Math.random() * 0.28;
        this._tone(at, 0.09 + Math.random() * 0.1, { type: 'triangle', f0: f, f1: f * 0.96, gain: 0.04 + Math.random() * 0.04 });
      }
      return;
    }
    this._noise(t, 0.16, { type: 'bandpass', f0: 1600, f1: 500, q: 1.2, gain: 0.7, attack: 0.002 });
    this._noise(t, 0.35, { type: 'lowpass', f0: 700, f1: 160, gain: 0.45, attack: 0.004 });
    for (let i = 0; i < 6; i++) this._noise(t + 0.08 + Math.random() * 0.35, 0.04 + Math.random() * 0.05, { type: 'bandpass', f0: 900 + Math.random() * 900, f1: 400, q: 2, gain: 0.08 + Math.random() * 0.1, attack: 0.002 });
  }

  /** Steel on steel (a blow on a shield, yours or theirs: `at` a place, or none for your own), or soft:
   * a dull knock. */
  clang(soft = false, at = null) {
    if (!this.ok) return;
    if (!soft && this.play('sword_blocked', { vol: 1.1, at, far: 40 })) return;
    const t = this.ctx.currentTime;
    if (soft) { this._noise(t, 0.18, { type: 'lowpass', f0: 900, f1: 200, gain: 0.5 }); return; }
    for (const [f, g] of [[1180, 0.12], [1730, 0.08], [2610, 0.05]]) this._tone(t, 0.5, { type: 'triangle', f0: f, f1: f * 0.97, gain: g });
    this._noise(t, 0.08, { type: 'highpass', f0: 3000, f1: 2000, gain: 0.3 });
  }

  /** Your blow landing: in flesh (blunt: a crushing thud), on stone or metal, in wood, in the dirt. */
  hit(what, heavy = false) {
    if (!this.ok) return;
    const k = heavy ? 1.15 : 0.95;
    const done = what === 'flesh' ? this.play('sword_impact_hit', { vol: k * 1.1, rate: heavy ? 0.9 : 1 })
      : what === 'blunt' ? this.play('sword_impact_hit', { vol: k * 1.2, rate: 0.68 }) && this.play('dirt_land', { vol: 0.9 * k, rate: 0.7 })
      : what === 'wood' ? this.play('chop', { vol: k })
      : what === 'ground' ? this.play('dirt_land', { vol: 1.3 * k, rate: 0.85 })
      : this.play('mine', { vol: k * 0.95 });
    if (!done) this.clang(what !== 'stone');
  }

  /** A blow taken on your raised shield (broken: the Guard gives out under it). */
  block(broken = false) {
    if (!this.ok) return;
    if (!this.play('sword_blocked', { vol: 1.2, rate: broken ? 0.85 : 1 })) { this.clang(false); return; }
    if (broken) this.play('sword_parry', { vol: 1.1, rate: 0.7, delay: 0.04 });
  }

  /** A blow getting through to you. */
  hurt() {
    if (!this.ok) return;
    if (!this.play('sword_impact_hit', { vol: 0.85, rate: 0.78 })) { this.clang(true); return; }
    this._noise(this.ctx.currentTime, 0.16, { type: 'lowpass', f0: 700, f1: 150, gain: 0.35 });
  }

  /** A blade drawn into the hand, or put away. */
  unsheath() { if (this.ok && !this.play('sword_unsheath', { vol: 0.9 })) this.equip(); }
  sheath() { if (this.ok && !this.play('sword_sheath', { vol: 0.8 })) this.equip(); }

  /** A chest's lid swung up (or let fall). */
  chest(open = true) {
    if (!this.ok) return;
    if (!this.play(open ? 'chest_open' : 'chest_close', { vol: 1.1 })) this.door(open);
  }

  /** A lock: a sealed thing tried (it rattles), or its seal broken. */
  lock(opens = false) {
    if (!this.ok) return;
    if (!this.play('lock_unlock', { vol: opens ? 1.3 : 0.9, rate: opens ? 1 : 1.25 })) this.clang(!opens);
  }

  /** A footstep (surface: dirt, stone, wood, water; chain: in mail or plate), a jump, a landing. */
  step(surface = 'dirt', run = false, chain = false) {
    if (!this.ok) return;
    if (typeof surface === 'boolean') surface = surface ? 'stone' : 'dirt';
    if (this.play(`${surface}_${chain ? 'chain_' : ''}${run ? 'run' : 'walk'}`, { vol: run ? 1.5 : 1.7, vary: 0.04 })) return;
    const t = this.ctx.currentTime, stone = surface === 'stone';
    this._noise(t, 0.09, { type: 'lowpass', f0: stone ? 900 : 500, f1: 150, gain: stone ? 0.16 : 0.11, attack: 0.004 });
  }
  jump(surface = 'dirt', chain = false) { if (this.ok) this.play(`${surface}_${chain ? 'chain_' : ''}jump`, { vol: 1.4 }); }
  land(surface = 'dirt', chain = false, hard = 0.5) {
    if (!this.ok) return;
    if (!this.play(`${surface}_${chain ? 'chain_' : ''}land`, { vol: 0.7 + 0.8 * hard, rate: 1 - 0.12 * hard })) this.step(surface, true, chain);
  }

  /** A spell let go (`id`: which, for its own sound; kind for the made-up one where it has none). */
  cast(kind = 'fire', id = null) {
    if (!this.ok) return;
    const s = SPELL_CAST[id] || (kind === 'staff' ? SPELL_CAST.staff : null);
    if (s && this.play(s[0], { vol: s[1], rate: s[2] || 1 })) { if (kind === 'staff') this._castTone(kind, 0.5); return; }
    this._castTone(kind, 1);
  }

  _castTone(kind, vol) {
    const t = this.ctx.currentTime;
    const base = { fire: 220, frost: 660, lightning: 140, heal: 520, wisp: 880, staff: 330, arcane: 520, drain: 110, bone: 300,
      void: 90, poison: 180, blade: 760, stone: 70 }[kind] || 400;
    this._tone(t, 0.35, { type: kind === 'lightning' ? 'sawtooth' : 'triangle', f0: base, f1: base * 2.2, gain: 0.12 * vol, attack: 0.02 });
    this._noise(t, 0.3, { f0: base * 2, f1: base * 6, q: 2, gain: 0.25 * vol, attack: 0.03 });
    if (kind === 'heal' || kind === 'wisp') for (const k of [1, 1.25, 1.5]) this._tone(t + 0.05 * k, 0.7, { f0: base * k, f1: base * k, gain: 0.06 * vol });
  }

  /** A spell bursting (size: how big), heard from `at` if given: the crack of it, and its weight
   * under it (a big one brings stone down with it). */
  boom(size = 0.3, at = null) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    let k = 1;
    if (at) { k = this.place(at, 70).k ** 0.5; if (k < 0.02) return; }
    if (size >= 1.2) this.play('rock_meteor_swarm', { vol: 1.2, at, far: 90 });
    else if (size > 0.04) this.play('spell_impact', { vol: 0.5 + size * 0.7, rate: 1.15 - Math.min(0.4, size * 0.35), at, far: 50 });
    this._noise(t, 0.25 + size * 0.6, { type: 'lowpass', f0: 1800, f1: 120, gain: (0.35 + size * 0.4) * k, attack: 0.005 });
  }

  fizzle() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone(t, 0.25, { type: 'square', f0: 300, f1: 90, gain: 0.05 });
  }

  /** A door swung open or shut (big: the cathedral's, heavier and slower). */
  door(open, big = false) {
    if (!this.ok) return;
    if (this.play(open ? 'door_open' : 'door_close', { vol: big ? 1.35 : 1.15, rate: big ? 0.8 : 1 })) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.5, { type: 'bandpass', f0: open ? 300 : 500, f1: open ? 700 : 220, q: 4, gain: 0.18, attack: 0.05 }); // the hinge
    this._noise(t + (open ? 0.42 : 0.4), 0.18, { type: 'lowpass', f0: 600, f1: 120, gain: open ? 0.12 : 0.4 });   // and the thump
  }

  /** Something breaking: a pot (or a flask) into shards, or ice. */
  shatter(kind = 'pot', at = null) {
    if (!this.ok) return;
    if (kind === 'ice') { if (this.play('ice_freeze', { vol: 1, rate: 1.35, at })) return; }
    else if (this.play('mine', { vol: 0.8, rate: 1.7, at })) { this.play('chop', { vol: 0.5, rate: 1.5, at, delay: 0.02 }); return; }
    const t = this.ctx.currentTime;
    this._noise(t, 0.25, { type: 'highpass', f0: 3500, f1: 1500, gain: 0.3, attack: 0.002 });
  }

  /** Wood split (a crate or a barrel struck, or broken). */
  splinter(heavy = false, at = null) {
    if (!this.ok) return;
    if (!this.play('chop', { vol: heavy ? 1.2 : 0.9, rate: heavy ? 0.8 : 1, at })) this.clang(true);
  }

  /** A rising roar while a spell gathers for `secs` seconds. */
  chargeUp(secs = 2) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone(t, secs, { type: 'sawtooth', f0: 70, f1: 220, gain: 0.05, attack: secs * 0.8 });
    this._noise(t, secs, { type: 'bandpass', f0: 200, f1: 1600, q: 1.2, gain: 0.22, attack: secs * 0.9 });
  }

  /** A crack of lightning striking home. */
  zap() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.09, { type: 'highpass', f0: 4000, f1: 1800, gain: 0.22, attack: 0.002 });
    this._tone(t, 0.07, { type: 'square', f0: 900 + Math.random() * 600, f1: 200, gain: 0.04 });
  }

  /** Ice forming: a glassy crackle and a cold chime. */
  freeze() {
    if (!this.ok) return;
    if (this.play('ice_freeze', { vol: 1.1 })) { this._tone(this.ctx.currentTime, 1.2, { f0: 1320, f1: 1310, gain: 0.03 }); return; }
    const t = this.ctx.currentTime;
    this._noise(t, 0.7, { type: 'highpass', f0: 5000, f1: 2500, gain: 0.25, attack: 0.01 });
    for (let i = 0; i < 6; i++) this._tone(t + i * 0.04 + Math.random() * 0.03, 0.5, { type: 'triangle', f0: 2200 + Math.random() * 1800, f1: 1800, gain: 0.04 });
    this._tone(t, 1.2, { f0: 1320, f1: 1310, gain: 0.05 });
  }

  /** A missile summoned or let fly: a little bright ping. */
  chime(high = false) {
    if (!this.ok) return;
    const t = this.ctx.currentTime, f = (high ? 1600 : 1100) * (0.9 + Math.random() * 0.25);
    this._tone(t, 0.18, { type: 'triangle', f0: f, f1: f * (high ? 2 : 1.4), gain: 0.04 });
  }

  /** Torn through the air (a blink). */
  whoosh() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.35, { f0: 400, f1: 3500, q: 1.2, gain: 0.4, attack: 0.03 });
    this._tone(t, 0.3, { type: 'sine', f0: 900, f1: 180, gain: 0.08 });
  }

  /** A held spell's sound, running until stop(): fire roars, lightning buzzes, a drain moans,
   * a storm howls. */
  loop(kind, volume = 1) {
    if (!this.ok) return { stop() {} };
    const c = this.ctx, t = c.currentTime;
    const S = { fire: { f: 700, type: 'lowpass', q: 0.7, g: 0.32 }, lightning: { f: 2600, type: 'bandpass', q: 0.9, g: 0.12, osc: [['sawtooth', 58, 0.05], ['square', 117, 0.02]] },
      drain: { f: 380, type: 'bandpass', q: 5, g: 0.16, osc: [['sine', 68, 0.07], ['sine', 71.5, 0.07]] },
      wind: { f: 650, type: 'bandpass', q: 2.5, g: 0.2, lfo: 320 } }[kind] || { f: 800, type: 'bandpass', q: 1, g: 0.15 };
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(volume, t + 0.15);
    out.connect(this.out);
    const nodes = [];
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = S.type; f.frequency.value = S.f; f.Q.value = S.q;
    const g = c.createGain(); g.gain.value = S.g;
    src.connect(f); f.connect(g); g.connect(out); src.start(t); nodes.push(src);
    if (S.lfo) { // the wind rises and falls
      const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 0.35; lg.gain.value = S.lfo;
      l.connect(lg); lg.connect(f.frequency); l.start(t); nodes.push(l);
    }
    for (const [type, fr, gain] of S.osc || []) {
      const o = c.createOscillator(), og = c.createGain(); o.type = type; o.frequency.value = fr; og.gain.value = gain;
      o.connect(og); og.connect(out); o.start(t); nodes.push(o);
    }
    return { stop: () => {
      const n = c.currentTime;
      out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), n); out.gain.exponentialRampToValueAtTime(0.0001, n + 0.3);
      for (const x of nodes) x.stop(n + 0.35);
    } };
  }

  /** The green star coming down: a roar of torn air and fire that swells and rises (set(k) from 0
   * to 1 as it comes closer), with a low throb under it. */
  roar() {
    if (!this.ok) return { set() {}, stop() {} };
    const c = this.ctx, t = c.currentTime;
    const out = c.createGain(); out.gain.value = 0.0001; out.connect(this.out);
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 0.8;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.4;
    const g1 = c.createGain(); g1.gain.value = 0.9; const g2 = c.createGain(); g2.gain.value = 0.25;
    src.connect(lp); lp.connect(g1); g1.connect(out); src.connect(bp); bp.connect(g2); g2.connect(out);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 38;
    const og = c.createGain(); og.gain.value = 0.05; const ol = c.createBiquadFilter(); ol.type = 'lowpass'; ol.frequency.value = 160;
    o.connect(ol); ol.connect(og); og.connect(out);
    src.start(t); o.start(t);
    return {
      set: (k, near = 0) => {
        const n = c.currentTime;
        out.gain.setTargetAtTime(0.05 + 0.75 * k, n, 0.15);
        lp.frequency.setTargetAtTime(200 + 1400 * k + 2000 * near, n, 0.2);
        bp.frequency.setTargetAtTime(600 + 2400 * k, n, 0.2);
        o.frequency.setTargetAtTime(34 + 40 * k, n, 0.3);
      },
      stop: (fade = 0.1) => {
        const n = c.currentTime;
        out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), n); out.gain.exponentialRampToValueAtTime(0.0001, n + fade);
        src.stop(n + fade + 0.05); o.stop(n + fade + 0.05);
      },
    };
  }

  /** The green star strikes: a crack, a huge low boom rolling away, and earth and stones raining down. */
  impact() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.12, { type: 'highpass', f0: 2500, f1: 900, gain: 0.9, attack: 0.002 });
    this._noise(t, 3.2, { type: 'lowpass', f0: 2400, f1: 40, gain: 1.0, attack: 0.004 });
    this._tone(t, 2.6, { type: 'sine', f0: 62, f1: 24, gain: 0.7, attack: 0.01 });
    this._tone(t + 0.05, 1.8, { type: 'triangle', f0: 120, f1: 30, gain: 0.25, attack: 0.01 });
    for (let i = 0; i < 26; i++) this._noise(t + 0.6 + Math.random() * 2.8, 0.06 + Math.random() * 0.12, { type: 'lowpass', f0: 900 + Math.random() * 900, f1: 150, gain: 0.05 + Math.random() * 0.12, attack: 0.003 });
  }

  /** Every soul in the village screaming at once: a crowd of voices (men's and women's) through the
   * vowel's formants, rising, held and breaking off, heard from across the meadow. */
  scream(voices = 16, far = 0.6) {
    if (!this.ok) return;
    const c = this.ctx, t0 = c.currentTime;
    const out = c.createGain(); out.gain.value = 0.55;
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5200 - far * 2600;
    // a little room: a short feedback echo off the houses
    const dl = c.createDelay(1); dl.delayTime.value = 0.13; const fb = c.createGain(); fb.gain.value = 0.28;
    out.connect(tone); tone.connect(this.out); tone.connect(dl); dl.connect(fb); fb.connect(dl); fb.connect(this.out);
    const FORMANTS = [[[820, 1250, 2900], [1, 0.55, 0.25]], [[650, 1900, 2800], [1, 0.6, 0.3]], [[750, 1100, 2600], [1, 0.5, 0.2]]];
    for (let i = 0; i < voices; i++) {
      const woman = i % 3 !== 0, f0 = woman ? 560 + Math.random() * 300 : 240 + Math.random() * 170;
      const t = t0 + Math.random() * 0.18, dur = 1.4 + Math.random() * 0.9;
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * 0.75, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.1 + Math.random() * 0.15), t + 0.22);
      o.frequency.setValueAtTime(f0 * (1.1 + Math.random() * 0.1), t + dur * 0.65);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + dur);
      const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 5 + Math.random() * 3; vg.gain.value = f0 * 0.035;
      vib.connect(vg); vg.connect(o.frequency);
      const env = c.createGain();
      env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.1, t + 0.07);
      env.gain.setValueAtTime(0.1, t + dur * 0.7); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      if (pan) pan.pan.value = (Math.random() - 0.5) * 1.4;
      const [fs, gs] = FORMANTS[i % FORMANTS.length];
      for (let k = 0; k < 3; k++) {
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fs[k] * (woman ? 1.12 : 1); bp.Q.value = 7 + k * 2;
        const g = c.createGain(); g.gain.value = gs[k] * 1.6;
        o.connect(bp); bp.connect(g); g.connect(env);
      }
      if (pan) { env.connect(pan); pan.connect(out); } else env.connect(out);
      o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
      // breath under the voice
      this._noise(t, dur * 0.8, { type: 'bandpass', f0: 2400, f1: 1800, q: 2, gain: 0.02, attack: 0.08 });
    }
  }

  /** A portal's seal waking: a low swell from under the stone, a cold open chord over it, and
   * glassy notes climbing as the blue runs out to the rim. */
  portalWake() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone(t, 2.8, { type: 'sine', f0: 49, f1: 98, gain: 0.16, attack: 0.8 });
    this._noise(t, 2.4, { type: 'bandpass', f0: 220, f1: 2600, q: 1.4, gain: 0.07, attack: 1.3 });
    [294, 440, 587, 880].forEach((f, i) => this._tone(t + 0.2 + i * 0.14, 2.4, { type: 'triangle', f0: f, f1: f * 1.004, gain: 0.03, attack: 0.45 }));
    [1175, 1397, 1760, 2093, 2349, 2794].forEach((f, i) => this._tone(t + 0.55 + i * 0.12, 0.7, { type: 'triangle', f0: f, f1: f * 0.997, gain: 0.018 }));
  }

  /** Stepping through a portal: the air torn and drawn in, a deep thud, and a shimmer as you land. */
  portalJump() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.6, { type: 'bandpass', f0: 3800, f1: 260, q: 0.9, gain: 0.45, attack: 0.04 });
    this._tone(t, 0.55, { type: 'sine', f0: 140, f1: 38, gain: 0.22, attack: 0.01 });
    this._tone(t + 0.05, 0.9, { type: 'sine', f0: 660, f1: 1320, gain: 0.04, attack: 0.2 });
    [1568, 2093, 2637].forEach((f, i) => this._tone(t + 0.25 + i * 0.07, 0.9, { type: 'triangle', f0: f, f1: f, gain: 0.02 }));
  }

  /** The strike, heard from the village: everyone gasps and screams at once, the recorded crowds
   * over the synthesized one (all three together). */
  villageScreams() {
    if (!this.ok) return;
    this.scream(18, 0.6);
    this.play('crowd_gasp', { vol: CROWD_VOL.gasp, vary: 0 });
    this.play('crowd_panic', { vol: CROWD_VOL.panic, vary: 0 });
  }

  /** A level gained: a rising peal. */
  levelUp() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(t + i * 0.09, 1.2, { type: 'triangle', f0: f, f1: f, gain: 0.07 }));
    this._noise(t, 1.4, { type: 'highpass', f0: 6000, f1: 3000, gain: 0.05, attack: 0.2 });
  }

  /** A quest taken (low) or done (high): two notes and a bell. */
  quest(done = false) {
    if (!this.ok) return;
    if (done) this.stinger?.('triumph');
    const t = this.ctx.currentTime, b = done ? 660 : 440;
    this._tone(t, 0.5, { type: 'triangle', f0: b, f1: b, gain: 0.07 });
    this._tone(t + 0.14, 0.9, { type: 'triangle', f0: b * 1.5, f1: b * 1.5, gain: 0.07 });
    if (done) this._tone(t + 0.28, 1.4, { type: 'sine', f0: b * 2, f1: b * 2, gain: 0.06 });
  }

  /** The First Bell: a great bronze toll, its partials out of tune with each other as a bell's
   * are, dying away over seconds. */
  toll() {
    if (!this.ok) return;
    const t = this.ctx.currentTime, f = 82;
    [[0.5, 0.11, 9], [1, 0.16, 7], [1.19, 0.08, 5], [1.5, 0.07, 4.5], [2, 0.06, 3.5], [2.52, 0.04, 2.5], [3.01, 0.03, 2], [4.07, 0.02, 1.4]]
      .forEach(([k, g, d]) => this._tone(t, d, { type: 'sine', f0: f * k, f1: f * k * 0.998, gain: g }));
    this._noise(t, 0.25, { type: 'bandpass', f0: 900, f1: 500, gain: 0.08 });
  }

  /** Coin counted into the purse. */
  coin() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) this._tone(t + i * 0.05, 0.12, { type: 'triangle', f0: 2400 + Math.random() * 700, f1: 2200, gain: 0.03 });
  }

  equip() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.12, { type: 'highpass', f0: 2500, f1: 4000, gain: 0.12 });
    this._tone(t + 0.04, 0.2, { type: 'triangle', f0: 900, f1: 860, gain: 0.05 });
  }
}
