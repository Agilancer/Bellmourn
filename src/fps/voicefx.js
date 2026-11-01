// Monster voices: Web Audio effects that take the human out of a voice, laid over what the neural
// voices say (voice.js fxInput hands any of these names to monsterFx; a speaker's fx can be a chain
// of them, ['sub', 'fry', 'undead', 'ring:45'], the voice going through each in turn). A name can
// carry a number: 'ring:45' (the ring's tone in Hz), 'shift:1.4' (a pitch ratio).
//
//   ring      ring modulation: the voice times a low tone, hollow and metallic, no throat in it
//   sub       a second voice an octave under the first, dragging a breath behind it
//   shift     the voice moved up or down in pitch without its pace changing
//   fry       a creak: the voice chopped thirty-odd times a second, a rattle in a crushed windpipe
//   whisper   a noise vocoder: the words carried by breath instead of a voice, no pitch at all
//   chorus    a few copies a little sharp and a little flat: many mouths in unison
//   gurgle    the pitch and a throat's resonance wobbling: said through water
//   crypt     a stone room's echo
// And, made from the whole of a line before it's heard: swellBuffer, a reversed echo rising into
// each word before it comes (the ghost's).
//
// Oscillators and the sweeps that drive these run LIFE seconds and stop: every piece of a line gets
// its own chain (voice.js chain), and is said by then.
const LIFE = 16;

const gain = (ctx, v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
const filter = (ctx, type, f, q = 0.707, db = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = db; return b; };
const shaper = (ctx, fn, n = 1024) => { const w = ctx.createWaveShaper(), c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1); w.curve = c; return w; };
const osc = (ctx, f, type = 'sine') => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
function run(ctx, ...nodes) { const t = ctx.currentTime; for (const n of nodes) { n.start(t); n.stop(t + LIFE); } }

const sweeps = new WeakMap();
/** A looping source of fn(phase 0..1) over `period` s, to drive an AudioParam; its buffer made once
 * per context and `key` (a chorus's slow sweeps run to megabytes, and every piece of a line has one). */
function sweep(ctx, period, fn, key) {
  const have = sweeps.get(ctx) || new Map(), k = key + '|' + period.toFixed(5);
  let b = have.get(k);
  if (!b) {
    const sr = ctx.sampleRate, n = Math.max(2, Math.round(period * sr));
    b = ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = fn(i / n);
    have.set(k, b); sweeps.set(ctx, have);
  }
  const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
  return s;
}

const noiseOf = new WeakMap();
/** Two seconds of white noise for this context, made once. */
function noise(ctx) {
  if (!noiseOf.has(ctx)) {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseOf.set(ctx, b);
  }
  const s = ctx.createBufferSource(); s.buffer = noiseOf.get(ctx); s.loop = true;
  return s;
}

/** Pitch moved by `ratio` (under 1 down, over 1 up) with the pace kept: two taps of a delay line,
 * each swept so it reads slower or faster than it's written, crossfaded where each jumps back. A
 * little grain to it, which suits a monster. Returns its input; it feeds `out`. */
export function shifter(ctx, ratio, out, W = 0.07) {
  const input = gain(ctx, 1), T = W / Math.max(0.01, Math.abs(1 - ratio)), down = ratio < 1;
  for (const off of [0, 0.5]) {
    const dl = ctx.createDelay(W + 0.05); dl.delayTime.value = 0;
    const ramp = sweep(ctx, T, (p) => { const q = (p + off) % 1; return (down ? q : 1 - q) * W; }, `ramp|${down}|${off}|${W}`);
    const fade = sweep(ctx, T, (p) => Math.sin(Math.PI * ((p + off) % 1)), `fade|${off}`);
    const g = gain(ctx, 0);
    ramp.connect(dl.delayTime); fade.connect(g.gain);
    input.connect(dl); dl.connect(g); g.connect(out);
    run(ctx, ramp, fade);
  }
  return input;
}

const irOf = new WeakMap();
/** A stone room's echo: early bounces off near walls, then a tail that darkens as it dies. */
function cryptIR(ctx, len = 2.4) {
  const key = 'crypt' + len;
  const have = irOf.get(ctx) || {};
  if (have[key]) return have[key];
  const sr = ctx.sampleRate, n = Math.round(len * sr), b = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, a = 0.55 - 0.45 * Math.min(1, t / len);          // (the tail darkening)
      y += a * ((Math.random() * 2 - 1) - y);
      d[i] = y * Math.exp(-t / 0.55) * (1 - Math.exp(-t / 0.006)) * 0.6;
    }
    for (const [t, g] of [[0.017, 0.5], [0.031 + ch * 0.004, 0.42], [0.049, 0.33], [0.071 + ch * 0.006, 0.27], [0.097, 0.2]]) d[Math.round(t * sr)] += g;
  }
  irOf.set(ctx, { ...have, [key]: b });
  return b;
}

/** One of the monster effects by name ('ring:45'), feeding `out`; returns what to connect the voice to. */
export function monsterFx(ctx, name, out) {
  const [kind, arg] = String(name).split(':'), v = arg != null ? +arg : null;
  const input = gain(ctx, 1);
  if (kind === 'ring') {
    // the voice times a tone (its frequency itself wandering a little, so it's not a machine's)
    const f = v || 45, ring = gain(ctx, 0), tone = osc(ctx, f), wob = osc(ctx, 0.7), wobG = gain(ctx, f * 0.18);
    wob.connect(wobG); wobG.connect(tone.frequency); tone.connect(ring.gain);
    input.connect(ring); ring.connect(gain(ctx, 0.95)).connect(out);
    input.connect(gain(ctx, 0.3)).connect(out);
    run(ctx, tone, wob);
  } else if (kind === 'sub') {
    // an octave under, a breath behind, darker
    const lo = filter(ctx, 'lowpass', 1400), drag = ctx.createDelay(0.2); drag.delayTime.value = 0.045;
    const sub = shifter(ctx, v || 0.5, lo);
    input.connect(sub); lo.connect(drag); drag.connect(gain(ctx, 0.85)).connect(out);
    input.connect(gain(ctx, 0.7)).connect(out);
  } else if (kind === 'shift') {
    input.connect(shifter(ctx, v || 1.3, out));
  } else if (kind === 'fry') {
    // chopped by narrow pulses at an uneven thirty-odd a second
    const g = gain(ctx, 0.22), saw = osc(ctx, 34, 'sawtooth'), jit = osc(ctx, 1.7), jitG = gain(ctx, 8);
    const pulse = shaper(ctx, (x) => (x > 0.3 ? 0.95 : 0));
    jit.connect(jitG); jitG.connect(saw.frequency); saw.connect(pulse); pulse.connect(g.gain);
    input.connect(g); g.connect(out);
    run(ctx, saw, jit);
  } else if (kind === 'whisper') {
    // a vocoder: each band of the voice's loudness opens the same band of breath
    const N = 16, lo = 170, hi = 7600, mix = gain(ctx, 3.2), carrier = noise(ctx);
    // (|x| with an odd number of points, so silence is exactly 0, and a hair of a gate: else the
    // breath leaks through between the words, a hiss that never stops)
    const abs = () => shaper(ctx, (x) => Math.max(0, Math.abs(x) - 0.004), 1025);
    for (let i = 0; i < N; i++) {
      const f = lo * Math.pow(hi / lo, (i + 0.5) / N), q = 5.5;
      const env = filter(ctx, 'lowpass', 28), band = gain(ctx, 0), k = gain(ctx, 7 + i * 0.6);   // (the highs, thin in a voice, given more)
      input.connect(filter(ctx, 'bandpass', f, q)).connect(abs()).connect(env).connect(k).connect(band.gain);
      carrier.connect(filter(ctx, 'bandpass', f, q)).connect(band).connect(mix);
    }
    mix.connect(out);
    input.connect(filter(ctx, 'highpass', 2200)).connect(gain(ctx, 0.12)).connect(out);   // (a trace of the voice's edges, for the words)
    run(ctx, carrier);
  } else if (kind === 'chorus') {
    // a few mouths: a little flat, a little sharp, each a moment apart
    input.connect(gain(ctx, 0.55)).connect(out);
    for (const [r, d, g] of [[0.982, 0.019, 0.5], [1.021, 0.033, 0.45], [0.991, 0.052, 0.4], [1.009, 0.071, 0.35]]) {
      const dl = ctx.createDelay(0.2); dl.delayTime.value = d;
      input.connect(shifter(ctx, r, dl)); dl.connect(gain(ctx, g)).connect(out);
    }
  } else if (kind === 'gurgle') {
    // the pitch wobbling unevenly, a throat's resonance sloshing, the level bubbling
    const dl = ctx.createDelay(0.05); dl.delayTime.value = 0.009;
    const a = osc(ctx, 7.3), aG = gain(ctx, 0.0026), b = osc(ctx, 11.9), bG = gain(ctx, 0.0011);
    a.connect(aG); aG.connect(dl.delayTime); b.connect(bG); bG.connect(dl.delayTime);
    const pk = filter(ctx, 'peaking', 650, 5, 10), s = osc(ctx, 4.1), sG = gain(ctx, 260);
    s.connect(sG); sG.connect(pk.frequency);
    const trem = gain(ctx, 0.72), t = osc(ctx, 8.7), tG = gain(ctx, 0.28);
    t.connect(tG); tG.connect(trem.gain);
    input.connect(dl); dl.connect(pk); pk.connect(trem); trem.connect(out);
    run(ctx, a, b, s, t);
  } else if (kind === 'crypt') {
    const cv = ctx.createConvolver(); cv.normalize = true; cv.buffer = cryptIR(ctx, v || 2.4);
    input.connect(gain(ctx, 0.85)).connect(out);
    input.connect(cv); cv.connect(gain(ctx, 0.5)).connect(out);
  } else {
    input.connect(out);
  }
  return input;
}
export const MONSTER_FX = ['ring', 'sub', 'shift', 'fry', 'whisper', 'chorus', 'gurgle', 'crypt'];

/** A line's reversed echo rising into each word before it's said: the voice reversed, through a
 * long echo, reversed back, laid `len` s before the voice itself. Made from the whole buffer, so
 * it's done before the line is heard. Resolves to a new buffer, `len` s longer. */
export async function swellBuffer(buffer, len = 1.1, wet = 0.75) {
  const sr = buffer.sampleRate, n = buffer.length, pre = Math.round(len * sr), src = buffer.getChannelData(0);
  const oc = new OfflineAudioContext(1, n + pre, sr);
  const rev = oc.createBuffer(1, n, sr), r = rev.getChannelData(0);
  for (let i = 0; i < n; i++) r[i] = src[n - 1 - i];
  const ir = oc.createBuffer(1, pre, sr), d = ir.getChannelData(0);
  for (let i = 0; i < pre; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-(i / sr) / (len * 0.32));
  const s = oc.createBufferSource(); s.buffer = rev;
  const cv = oc.createConvolver(); cv.normalize = true; cv.buffer = ir;
  s.connect(cv); cv.connect(oc.destination); s.start();
  const tail = (await oc.startRendering()).getChannelData(0);
  const out = new AudioBuffer({ length: n + pre, sampleRate: sr, numberOfChannels: 1 }), o = out.getChannelData(0);
  for (let i = 0; i < n + pre; i++) o[i] = tail[n + pre - 1 - i] * wet;
  for (let i = 0; i < n; i++) o[pre + i] += src[i];
  return out;
}
