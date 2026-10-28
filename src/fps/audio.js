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
    const base = { fire: 220, frost: 660, lightning: 140, heal: 520, wisp: 880, wand: 700, staff: 330 }[kind] || 400;
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

  equip() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.12, { type: 'highpass', f0: 2500, f1: 4000, gain: 0.12 });
    this._tone(t + 0.04, 0.2, { type: 'triangle', f0: 900, f1: 860, gain: 0.05 });
  }
}
