// Voices: everyone who speaks in Bellmourn says their words aloud as well as in the bubble, each in a
// voice of their own for good (picked from their name).
//
// On a computer the voices are neural: Kokoro-82M (Apache-2.0), run in a worker (tts_worker.js),
// its model fetched once and cached by the browser. Villagers speak in its British and American
// voices; Velscour's Sworn in its deepest men's voices, pitched down further and muffled as if from
// behind a helm, their lord deeper still; the sorcerers with a ring to them; the dead dragged low,
// slowed and roughened into a moan over the gibberish they mutter. Each line is played where its
// speaker stands: quieter further off, to the left or the right. A long line is said a sentence
// at a time, so it starts at once.
//
// On a phone (the model is about 90 MB, and a phone's memory is short), while the neural voices are
// still loading, or if they can't, the browser's own speech synthesis speaks instead.
//
// Settings: localStorage bm.voices = '0' turns all voices off; bm.neural = '0' keeps to the
// browser's voices, '1' asks for the neural ones on a phone too.
import { TOUCH } from './input.js';

const EARSHOT = 28;          // metres
const store = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

// ------------------------------------------------------------------ the neural voices (Kokoro)
const KOKORO = {
  f: ['bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily', 'af_heart', 'af_bella', 'af_sarah', 'af_nicole', 'af_aoede', 'af_kore', 'af_jessica', 'af_river'],
  m: ['bm_george', 'bm_lewis', 'bm_daniel', 'bm_fable', 'am_michael', 'am_adam', 'am_eric', 'am_liam', 'am_echo', 'am_puck'],
  knight: ['am_onyx', 'am_fenrir', 'bm_george', 'bm_lewis', 'am_adam', 'bm_daniel'],
  knightF: ['bf_isabella', 'af_kore', 'bf_alice'],
  lord: ['am_onyx'],
  sorcerer: ['bm_fable', 'am_echo', 'bf_alice'],
  undead: ['am_onyx', 'bm_lewis', 'am_fenrir', 'af_nicole', 'bf_isabella', 'bm_daniel'],
  beast: ['af_sky', 'am_puck'],
};

/** How a speaker sounds through the neural voices: { voice, rate (pitch: the playback rate), speed
 * (the model's pace, set so pitch and pace come out right together), fx }. */
export function neuralCast(key, { sex = 'm', kind = 'villager', age = null } = {}) {
  const h = hash(kind + '|' + key), r = (n) => ((h >>> n) & 1023) / 1023;
  const list = kind === 'knight' ? (sex === 'f' ? KOKORO.knightF : KOKORO.knight) : kind === 'villager' ? KOKORO[sex === 'f' ? 'f' : 'm'] : KOKORO[kind] || KOKORO.m;
  let rate = 0.97 + r(5) * 0.06, fx = null;
  if (age === 'old') rate -= 0.06; else if (age === 'young') rate += 0.05;
  if (kind === 'knight') { rate = 0.84 + r(5) * 0.06; fx = 'helm'; }
  if (kind === 'lord') { rate = 0.76; fx = 'helm'; }
  if (kind === 'sorcerer') { rate = 0.98 + r(5) * 0.06; fx = 'echo'; }
  if (kind === 'undead') { rate = 0.6 + r(5) * 0.12; fx = 'undead'; }
  if (kind === 'beast') { rate = 1.45 + r(5) * 0.2; fx = 'undead'; }
  return { voice: list[h % list.length], rate, speed: Math.max(0.6, Math.min(1.6, (0.96 + r(13) * 0.08) / rate)), fx };
}

/** A speaker's effect, feeding `out`: what to connect their voice to. */
export function fxInput(ctx, fx, out) {
  if (fx === 'helm') {             // muffled behind steel, a little ring of it
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3100; lp.Q.value = 0.9;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 900; pk.gain.value = 4; pk.Q.value = 1.4;
    lp.connect(pk); pk.connect(out);
    return lp;
  }
  if (fx === 'undead') {           // low, rough, rotten
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700;
    const ws = ctx.createWaveShaper(), n = 1024, curve = new Float32Array(n), k = 9;
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    ws.curve = curve;
    ws.connect(lp); lp.connect(out);
    return ws;
  }
  if (fx === 'echo') {             // a sorcerer's ring
    const dry = ctx.createGain(), dl = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
    dl.delayTime.value = 0.13; fb.gain.value = 0.32; wet.gain.value = 0.4;
    dry.connect(out); dry.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(out);
    return dry;
  }
  return out;
}

const neural = {
  state: 'off',              // off | loading | ready | failed
  worker: null, ctx: null, next: 1,
  wait: new Map(),           // id -> { key, lines: [{ line, i }] }: who wants its audio when it comes
  cache: new Map(),          // voice|speed|sentence -> { audio, rate } (made already), or { id } (on its way)
  playing: [],               // { src, pri, end, who }
  ms: [],                    // how long the lines took to make (for the log)

  wanted() { const s = store('bm.neural'); return s === '1' || (s !== '0' && !TOUCH); },

  start() {
    if (this.state !== 'off' || !this.wanted() || typeof Worker === 'undefined') return;
    this.state = 'loading';
    try {
      this.worker = new Worker(new URL('./tts_worker.js', import.meta.url), { type: 'module' });
    } catch (e) { this.state = 'failed'; console.warn('voices: no worker', e); return; }
    this.worker.onmessage = (e) => this.onMessage(e.data);
    this.worker.onerror = (e) => { this.state = 'failed'; console.warn('voices: the neural voices failed', e.message); };
    this.worker.postMessage({ type: 'load' });
  },

  onMessage(m) {
    if (m.type === 'ready') { this.state = 'ready'; console.info('voices: the neural voices are ready (Kokoro-82M)'); return; }
    if (m.type === 'error') { this.state = 'failed'; console.warn('voices: the neural voices could not load', m.error); return; }
    const w = this.wait.get(m.id);
    this.wait.delete(m.id);
    if (!w) return;
    if (m.type === 'fail') { this.cache.delete(w.key); for (const { line } of w.lines) line.dead = true; return; }
    if (m.ms) { this.ms.push(m.ms); if (this.ms.length > 40) this.ms.shift(); }
    const part = { audio: m.audio, rate: m.rate };
    this.cache.set(w.key, part);
    while (this.cache.size > 160) this.cache.delete(this.cache.keys().next().value);   // (the oldest go)
    for (const { line, i } of w.lines) { line.parts[i] = part; this.pump(line); }
  },

  sentences(text) { return String(text).replace(/[{}]/g, '').match(/[^.!?…]+[.!?…]+["'”’)]*|[^.!?…]+$/g)?.map((s) => s.trim()).filter(Boolean) || []; },

  /** A sentence in a voice: from the cache, or asked for (line i of `line` gets it when it comes). */
  want(cast, s, line = null, i = 0) {
    const key = cast.voice + '|' + cast.speed.toFixed(2) + '|' + s, hit = this.cache.get(key);
    if (hit?.audio) { if (line) line.parts[i] = hit; return; }
    if (hit?.id && this.wait.has(hit.id)) { if (line) this.wait.get(hit.id).lines.push({ line, i }); return; }
    const id = this.next++;
    this.cache.set(key, { id });
    this.wait.set(id, { key, lines: line ? [{ line, i }] : [] });
    if (line) line.ids.push(id);
    this.worker.postMessage({ type: 'say', id, text: s, voice: cast.voice, speed: cast.speed });
  },

  /** Make a line ahead of when it's said (a scene's, a group's, a quest's), so it plays on time. */
  prefetch(text, cast) { if (this.state === 'ready') for (const s of this.sentences(text)) this.want(cast, s); },

  audio() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },

  /** Say a line: its sentences sent off to be made, each played as it comes, in order. */
  say(who, text, cast, o) {
    const sentences = this.sentences(text);
    if (!sentences.length) return;
    // too much already said and waiting? an ambient line is let go
    const queued = this.wait.size;
    if (o.pri === 0 && (queued > 2 || this.playing.length >= 2)) return;
    if (o.pri > 0 && this.playing.length >= 2) this.cut(o.pri);
    const line = { who, cast, o, parts: new Array(sentences.length).fill(null), at: 0, when: 0, ids: [], t0: performance.now(), pri: o.pri };
    if (who) who.voiceLine = line;
    sentences.forEach((s, i) => this.want(cast, s, line, i));
    this.pump(line);
  },

  /** Play what's ready of a line, in order (a sentence starts as the one before it ends). */
  pump(line) {
    if (line.dead) return;
    const ctx = this.audio();
    if (!ctx) return;
    // (stale: the speaker has moved on to another line, or it's been too long coming)
    if ((line.who && line.who.voiceLine !== line) || performance.now() - line.t0 > 20000) { this.drop(line); return; }
    while (line.at < line.parts.length && line.parts[line.at]) {
      const p = line.parts[line.at++];
      const buf = ctx.createBuffer(1, p.audio.length, p.rate);
      buf.copyToChannel(p.audio, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.playbackRate.value = line.cast.rate;
      const out = this.chain(ctx, line);
      src.connect(out.input);
      const start = Math.max(ctx.currentTime + 0.02, line.when);
      src.start(start);
      line.when = start + buf.duration / line.cast.rate + 0.08;
      const rec = { src, pri: line.pri, who: line.who, end: line.when };
      this.playing.push(rec);
      src.onended = () => { const i = this.playing.indexOf(rec); if (i >= 0) this.playing.splice(i, 1); };
    }
  },

  /** Where it's heard: the speaker's effect, then how loud and which side, by where they stand. */
  chain(ctx, line) {
    const o = line.o, gain = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const pos = o.pos || line.who?.pos, l = voice.listener;
    let vol = 1, side = 0;
    if (pos && l?.pos) {
      const dx = pos.x - l.pos.x, dz = pos.z - l.pos.z, d = Math.hypot(dx, dz, (pos.y ?? 0) - (l.pos.y ?? 0));
      vol = o.pri >= 3 ? 1 : Math.max(0.15, Math.min(1, 1 - d / EARSHOT));
      const yaw = l.yaw || 0, rx = Math.cos(yaw), rz = -Math.sin(yaw);   // (the listener's right)
      side = d > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / d)) : 0;
    }
    gain.gain.value = vol * (line.cast.fx === 'undead' ? 0.85 : 1);
    if (pan) { pan.pan.value = side; gain.connect(pan); pan.connect(ctx.destination); } else gain.connect(ctx.destination);
    return { input: fxInput(ctx, line.cast.fx, gain) };
  },

  /** Make room for a more pressing line: stop the least pressing one playing. */
  cut(pri) {
    const low = this.playing.filter((p) => p.pri < pri).sort((a, b) => a.pri - b.pri)[0];
    if (low) { try { low.src.stop(); } catch { /* already done */ } }
  },

  drop(line) {
    line.dead = true;
    // (what nobody else is waiting for is dropped from the worker's queue)
    const ids = line.ids.filter((id) => { const w = this.wait.get(id); if (!w) return false; w.lines = w.lines.filter((x) => x.line !== line); return !w.lines.length; });
    for (const id of ids) { this.cache.delete(this.wait.get(id).key); this.wait.delete(id); }
    if (ids.length) this.worker.postMessage({ type: 'drop', ids });
  },

  stop() {
    for (const p of this.playing) { try { p.src.stop(); } catch { /* done */ } }
    this.playing.length = 0;
    const ids = [...this.wait.keys()];
    for (const id of ids) this.cache.delete(this.wait.get(id).key);
    this.wait.clear();
    if (ids.length) this.worker?.postMessage({ type: 'drop', ids });
  },
};

// ------------------------------------------------------------------ the browser's own voices
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voices = [];
const loadVoices = () => { try { voices = (synth?.getVoices() || []).filter((v) => /^en/i.test(v.lang)); } catch { voices = []; } };
if (synth) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices); }
const FEMALE = /zira|susan|hazel|libby|sonia|jenny|aria|natasha|samantha|karen|moira|tessa|fiona|victoria|serena|kate|female|woman|ava|allison|emma|clara|michelle|elizabeth|catherine|nicola|joanna|amy|salli|kimberly|ivy|kendra|olivia|maisie|ana\b|emily|sara/i;
const MALE = /david|mark|george|ryan|guy|daniel|alex|fred|male|thomas|james|oliver|arthur|eric|brian|christopher|roger|steffan|william|liam|matthew|joey|justin|russell|tom\b|aaron|gordon|rishi|lee\b/i;
const rank = (v) => (/(natural|neural|online)/i.test(v.name) ? 6 : /google/i.test(v.name) ? 4 : v.localService === false ? 3 : 1) + (/en[-_](gb|ie|au|nz)/i.test(v.lang) ? 1 : 0);
const cast = new Map();

/** How a speaker sounds through the browser's voices (kept for good): { voice, pitch, rate }. */
export function voiceOf(key, { sex = 'm', kind = 'villager', age = null } = {}) {
  const k = kind + '|' + key;
  if (cast.has(k) && (cast.get(k).voice || !voices.length)) return cast.get(k);
  const h = hash(k), r = (n) => ((h >>> n) & 1023) / 1023;
  const want = sex === 'f' ? FEMALE : MALE, other = sex === 'f' ? MALE : FEMALE;
  let pool = voices.filter((v) => want.test(v.name) || !other.test(v.name));
  if (!pool.length) pool = voices;
  const best = Math.max(0, ...pool.map(rank)), top = pool.filter((v) => rank(v) >= best - 2);
  const voice = top.length ? top[h % top.length] : null;
  let pitch = sex === 'f' ? 1.05 + r(3) * 0.3 : 0.85 + r(3) * 0.25, rate = 0.92 + r(13) * 0.16;
  if (age === 'young') { pitch += 0.15; rate += 0.05; } else if (age === 'old') { pitch -= 0.12; rate -= 0.1; }
  if (kind === 'knight') { pitch = 0.55 + r(5) * 0.25; rate = 0.86 + r(9) * 0.12; }
  if (kind === 'lord') { pitch = 0.45; rate = 0.82; }
  if (kind === 'sorcerer') { pitch = 1.1 + r(5) * 0.25; rate = 0.8 + r(9) * 0.1; }
  if (kind === 'undead') { pitch = 0.1 + r(5) * 0.35; rate = 0.55 + r(9) * 0.25; }
  if (kind === 'beast') { pitch = 1.6 + r(5) * 0.4; rate = 1.3 + r(9) * 0.3; }
  const v = { voice, pitch: Math.max(0, Math.min(2, pitch)), rate: Math.max(0.5, Math.min(1.6, rate)) };
  cast.set(k, v);
  return v;
}

let browserEnd = 0, browserPri = 0;
function browserSay(who, text, o, d) {
  if (!synth) return;
  const now = performance.now();
  const busy = synth.speaking && now < browserEnd;
  if (busy && o.pri <= browserPri) return;          // (an ambient line doesn't queue: it's let go)
  if (synth.speaking || synth.pending) synth.cancel();
  const { voice: v, pitch, rate } = voiceOf(o.key || who?.name || 'someone', o);
  const u = new SpeechSynthesisUtterance(String(text).replace(/[{}]/g, ''));
  if (v) u.voice = v;
  u.pitch = pitch; u.rate = rate;
  u.volume = o.pri >= 3 ? 1 : Math.max(0.12, Math.min(1, 1 - d / EARSHOT)) * (o.kind === 'undead' ? 0.8 : 1);
  browserEnd = now + 1000 * (0.6 + text.length * 0.075 / rate); browserPri = o.pri;
  try { synth.speak(u); } catch { /* no voice today */ }
}

// ------------------------------------------------------------------ the voice
export const voice = {
  listener: null,              // (the player: who is listening, for how loud and which side)
  enabled: store('bm.voices') !== '0',
  set(on) { this.enabled = on; try { localStorage.setItem('bm.voices', on ? '1' : '0'); } catch { /* no storage */ } if (!on) this.stop(); },
  /** Start fetching the neural voices (after the game is up: they're big). */
  warm() { if (this.enabled) neural.start(); },
  /** Whether the neural voices are wanted and loaded (else the browser's speak). */
  get natural() { return neural.state === 'ready' && neural.wanted(); },
  get neural() { return neural.state; },
  get debug() { return { state: neural.state, waiting: neural.wait.size, cached: neural.cache.size, playing: neural.playing.length, audio: neural.ctx?.state || 'none' }; },
  get speed() { const m = neural.ms; return m.length ? Math.round(m.reduce((a, b) => a + b, 0) / m.length) : null; },

  /** `who` says `text` aloud. o: { key (who they are: their name), sex, kind, age, toYou, pri, pos } */
  say(who, text, o = {}) {
    if (!this.enabled || !text || (typeof document !== 'undefined' && document.hidden)) return;
    const pos = o.pos || who?.pos || who?.root?.position, l = this.listener?.pos;
    const d = pos && l ? Math.hypot(pos.x - l.x, pos.z - l.z, (pos.y ?? 0) - (l.y ?? 0)) : 0;
    if (d > EARSHOT && !(o.pri >= 3)) return;
    const pri = o.pri ?? (o.toYou ? 2 : o.kind && o.kind !== 'villager' ? 1 : 0);
    const oo = { ...o, pri };
    if (neural.state === 'off') neural.start();
    if (neural.state === 'ready' && neural.wanted()) neural.say(who, text, neuralCast(o.key || who?.name || 'someone', o), oo);
    else browserSay(who, text, oo, d);
  },

  /** Make lines ahead of time: [[who, text, o], ...] (o as for say). */
  prefetch(list) {
    if (!this.enabled || neural.state !== 'ready') return;
    for (const [who, text, o = {}] of list) neural.prefetch(text, neuralCast(o.key || who?.name || 'someone', o));
  },

  stop() { neural.stop(); synth?.cancel(); browserEnd = 0; },
};
