// Little synthesized sounds (no audio files yet): swings, clangs, casts, bursts, footsteps.
// The context starts on the first click or key, as browsers require.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.volume = 0.5;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(this.ctx.destination);
    const n = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

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

  swing(heavy = false) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, heavy ? 0.42 : 0.28, { f0: heavy ? 300 : 500, f1: heavy ? 1400 : 2400, q: 1.6, gain: heavy ? 0.5 : 0.35, attack: 0.08 });
  }

  clang(soft = false) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    if (soft) { this._noise(t, 0.18, { type: 'lowpass', f0: 900, f1: 200, gain: 0.5 }); return; }
    for (const [f, g] of [[1180, 0.12], [1730, 0.08], [2610, 0.05]]) this._tone(t, 0.5, { type: 'triangle', f0: f, f1: f * 0.97, gain: g });
    this._noise(t, 0.08, { type: 'highpass', f0: 3000, f1: 2000, gain: 0.3 });
  }

  cast(kind = 'fire') {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const base = { fire: 220, frost: 660, lightning: 140, heal: 520, wisp: 880, staff: 330, arcane: 520, drain: 110, bone: 300,
      void: 90, poison: 180, blade: 760, stone: 70 }[kind] || 400;
    this._tone(t, 0.35, { type: kind === 'lightning' ? 'sawtooth' : 'triangle', f0: base, f1: base * 2.2, gain: 0.12, attack: 0.02 });
    this._noise(t, 0.3, { f0: base * 2, f1: base * 6, q: 2, gain: 0.25, attack: 0.03 });
    if (kind === 'heal' || kind === 'wisp') for (const k of [1, 1.25, 1.5]) this._tone(t + 0.05 * k, 0.7, { f0: base * k, f1: base * k, gain: 0.06 });
  }

  boom(size = 0.3) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.25 + size * 0.6, { type: 'lowpass', f0: 1800, f1: 120, gain: 0.35 + size * 0.4, attack: 0.005 });
  }

  fizzle() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone(t, 0.25, { type: 'square', f0: 300, f1: 90, gain: 0.05 });
  }

  step(stone = false) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.09, { type: 'lowpass', f0: stone ? 900 : 500, f1: 150, gain: stone ? 0.16 : 0.11, attack: 0.004 });
  }

  door(open) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.5, { type: 'bandpass', f0: open ? 300 : 500, f1: open ? 700 : 220, q: 4, gain: 0.18, attack: 0.05 }); // the hinge
    this._noise(t + (open ? 0.42 : 0.4), 0.18, { type: 'lowpass', f0: 600, f1: 120, gain: open ? 0.12 : 0.4 });   // and the thump
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
    const t = this.ctx.currentTime, b = done ? 660 : 440;
    this._tone(t, 0.5, { type: 'triangle', f0: b, f1: b, gain: 0.07 });
    this._tone(t + 0.14, 0.9, { type: 'triangle', f0: b * 1.5, f1: b * 1.5, gain: 0.07 });
    if (done) this._tone(t + 0.28, 1.4, { type: 'sine', f0: b * 2, f1: b * 2, gain: 0.06 });
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
