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
// The model and every voice it speaks in are fetched while the game loads (warm(), from main.js at
// once; a new game waits for them: ready), on a phone too. While they're still coming, or if they
// can't, the browser's own speech synthesis speaks instead.
//
// Every voice is heard at one level: each sentence is brought to the same loudness as it's made, it
// plays through the game's own sound (the master volume, the limiter), and distance only softens a
// voice a little (all of a crowd round you is heard).
//
// Settings: localStorage bm.voices = '0' turns all voices off; bm.neural = '0' keeps to the
// browser's voices.

const EARSHOT = 28;          // metres
const PHONE = typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)));
/** Which build of the model, on how many threads: the full one on a computer whose page is isolated
 * (coi.js), on all but a few of its cores; else the 8-bit one (tts_worker.js says why). */
function build() {
  const cores = navigator.hardwareConcurrency || 4, iso = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
  const threads = iso ? Math.max(1, Math.min(10, cores - 4)) : 1;
  return { dtype: !PHONE && iso && threads >= 4 ? 'fp32' : 'q8', threads };
}
const LOUD = 0.12;           // every sentence's loudness (RMS) before its speaker's volume
const CHUNK = 80;            // characters: a longer sentence is made in pieces
/** How loud a speaker d metres off is heard: all of it near, never less than a little over half. */
const near = (d, pri) => (pri >= 2 ? 1 : Math.max(0.6, Math.min(1, 1.15 - (0.55 * d) / EARSHOT)));
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
export function neuralCast(key, { sex = 'm', kind = 'villager', age = null, fear = false } = {}) {
  const h = hash(kind + '|' + key), r = (n) => ((h >>> n) & 1023) / 1023;
  const list = kind === 'knight' ? (sex === 'f' ? KOKORO.knightF : KOKORO.knight) : kind === 'villager' ? KOKORO[sex === 'f' ? 'f' : 'm'] : KOKORO[kind] || KOKORO.m;
  let rate = 0.97 + r(5) * 0.06, fx = null;
  if (age === 'old') rate -= 0.06; else if (age === 'young') rate += 0.05;
  if (kind === 'knight') { rate = 0.84 + r(5) * 0.06; fx = 'helm'; }
  if (kind === 'lord') { rate = 0.76; fx = 'helm'; }
  if (kind === 'sorcerer') { rate = 0.98 + r(5) * 0.06; fx = 'echo'; }
  if (kind === 'undead') { rate = 0.6 + r(5) * 0.12; fx = 'undead'; }
  if (kind === 'beast') { rate = 1.45 + r(5) * 0.2; fx = 'undead'; }
  // terrified (the opening's knight as the star comes for him): his voice up and strained, rushed,
  // shaking, still behind his helm
  if (fear) return { voice: list[h % list.length], rate: 1.04, speed: 1.3, fx: kind === 'knight' || kind === 'lord' ? 'fear-helm' : 'fear' };
  return { voice: list[h % list.length], rate, speed: Math.max(0.6, Math.min(1.6, (0.96 + r(13) * 0.08) / rate)), fx };
}

/** A speaker's effect, feeding `out`: what to connect their voice to. */
export function fxInput(ctx, fx, out) {
  if (fx === 'fear' || fx === 'fear-helm') {   // terror: the voice wavers in pitch and quavers in breath, a little hoarse
    const t = ctx.currentTime, end = t + 12;   // (its wobblers run a while, then stop: a line is said by then)
    const into = fx === 'fear-helm' ? fxInput(ctx, 'helm', out) : out;
    const ws = ctx.createWaveShaper(), n = 1024, curve = new Float32Array(n), k = 2.2;
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)) * 0.8; }
    ws.curve = curve;
    // pitch: a delay swept by a fast, uneven wobble
    const dl = ctx.createDelay(0.05); dl.delayTime.value = 0.006;
    const w1 = ctx.createOscillator(), g1 = ctx.createGain(); w1.frequency.value = 6.8; g1.gain.value = 0.0014;
    const w2 = ctx.createOscillator(), g2 = ctx.createGain(); w2.frequency.value = 2.3; g2.gain.value = 0.0009;
    w1.connect(g1); g1.connect(dl.delayTime); w2.connect(g2); g2.connect(dl.delayTime);
    // breath: the level quavering
    const trem = ctx.createGain(); trem.gain.value = 0.78;
    const w3 = ctx.createOscillator(), g3 = ctx.createGain(); w3.frequency.value = 9.5; g3.gain.value = 0.22;
    w3.connect(g3); g3.connect(trem.gain);
    for (const o of [w1, w2, w3]) { o.start(t); o.stop(end); }
    ws.connect(dl); dl.connect(trem); trem.connect(into);
    return ws;
  }
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

  wanted() { return store('bm.neural') !== '0'; },
  got: 0, of: 0,             // how many of the voices are in (every one is fetched before it's ready)
  dl: null,                  // [loaded, total] bytes of the model, while it's coming
  model: null,               // { dtype, threads }: what it runs

  start() {
    if (this.state !== 'off' || !this.wanted() || typeof Worker === 'undefined') { if (this.state === 'off') this.settle(false); return; }
    this.state = 'loading';
    try {
      this.worker = new Worker(new URL('./tts_worker.js', import.meta.url), { type: 'module' });
    } catch (e) { this.state = 'failed'; console.warn('voices: no worker', e); return; }
    this.worker.onmessage = (e) => this.onMessage(e.data);
    this.worker.onerror = (e) => { this.state = 'failed'; this.settle(false); console.warn('voices: the neural voices failed', e.message); };
    const all = [...new Set(Object.values(KOKORO).flat())];
    this.of = all.length;
    this.worker.postMessage({ type: 'load', voices: all, ...build() });
  },

  settle(ok) { this.done?.(ok); this.done = null; },

  onMessage(m) {
    if (m.type === 'progress') { this.got = m.got; this.of = m.of; this.dl = null; return; }
    if (m.type === 'download') { this.dl = [m.loaded, m.total]; return; }
    if (m.type === 'model') { this.model = { dtype: m.dtype, threads: m.threads }; this.dl = null; return; }
    if (m.type === 'ready') { this.state = 'ready'; this.got = this.of; this.settle(true); console.info(`voices: the neural voices are ready (Kokoro-82M ${this.model?.dtype || ''}, ${this.model?.threads || 1} threads, ${this.of} voices)`); return; }
    if (m.type === 'error') { this.state = 'failed'; this.settle(false); console.warn('voices: the neural voices could not load', m.error); return; }
    const w = this.wait.get(m.id);
    this.wait.delete(m.id);
    if (!w) return;
    if (m.type === 'fail') { this.cache.delete(w.key); for (const { line } of w.lines) line.dead = true; return; }
    if (m.ms) { this.ms.push(m.ms); if (this.ms.length > 40) this.ms.shift(); }
    // (brought to one loudness, whoever speaks: Kokoro's voices come out louder and softer)
    let sq = 0, pk = 0;
    for (let i = 0; i < m.audio.length; i++) { const x = m.audio[i]; sq += x * x; if (x > pk) pk = x; else if (-x > pk) pk = -x; }
    const rms = Math.sqrt(sq / Math.max(1, m.audio.length));
    const part = { audio: m.audio, rate: m.rate, gain: rms > 1e-5 ? Math.max(0.25, Math.min(8, LOUD / rms, 0.95 / Math.max(pk, 1e-5))) : 1 };
    this.cache.set(w.key, part);
    while (this.cache.size > 160) this.cache.delete(this.cache.keys().next().value);   // (the oldest go)
    for (const { line, i } of w.lines) { line.parts[i] = part; this.pump(line); }
  },

  /** A line in the pieces it's made in: its sentences, a long one broken at a comma (or a dash, a
   * colon) so the first words are ready the sooner. */
  sentences(text) {
    const out = [];
    for (let s of String(text).replace(/[{}]/g, '').match(/[^.!?…]+[.!?…]+["'”’)]*|[^.!?…]+$/g)?.map((x) => x.trim()).filter(Boolean) || []) {
      while (s.length > CHUNK) {
        let cut = -1;
        const re = /[,;:—–]\s/g;
        let m;
        while ((m = re.exec(s)) && m.index < CHUNK) if (m.index > 18) cut = m.index + 1;
        if (cut < 0) break;
        out.push(s.slice(0, cut).trim()); s = s.slice(cut).trim();
      }
      if (s) out.push(s);
    }
    return out;
  },

  /** A sentence in a voice: from the cache, or asked for (line i of `line` gets it when it comes).
   * Made in order of how pressing: a line being said now (9), one waiting its turn (its priority, 0
   * to 3), one made ahead (`ahead`: -1, or more for one due soon). */
  want(cast, s, line = null, i = 0, ahead = -1) {
    const key = cast.voice + '|' + cast.speed.toFixed(2) + '|' + s, hit = this.cache.get(key);
    const pri = line ? (line.hold ? line.pri ?? 0 : 9) : ahead;
    if (hit?.audio) { if (line) line.parts[i] = hit; return; }
    if (hit?.id && this.wait.has(hit.id)) {
      if (line) { this.wait.get(hit.id).lines.push({ line, i }); line.need.push(hit.id); this.worker.postMessage({ type: 'bump', ids: [hit.id], pri }); }
      return;
    }
    const id = this.next++;
    this.cache.set(key, { id });
    this.wait.set(id, { key, lines: line ? [{ line, i }] : [] });
    if (line) { line.ids.push(id); line.need.push(id); }
    this.worker.postMessage({ type: 'say', id, text: s, voice: cast.voice, speed: cast.speed, pri });
  },

  /** Make a line ahead of when it's said (a scene's, a group's, a quest's), so it plays on time
   * (pri: made before what's made ahead with less). */
  prefetch(text, cast, pri = -1) { if (this.state === 'ready') for (const s of this.sentences(text)) this.want(cast, s, null, 0, pri); },

  /** The game's own sound (voice.useSound): its context, and a line for the voices under its master
   * volume, evened by a compressor. */
  audio() {
    const S = voice.sound;
    if (S && !S.ctx) S.start();
    if (S?.ctx && this.ctx !== S.ctx) {
      this.ctx = S.ctx;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
      const out = this.ctx.createGain(); out.gain.value = 1.6;
      comp.connect(out); out.connect(S.out);
      this.bus = comp;
    }
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.bus = this.ctx.destination;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },

  /** Say a line: its sentences sent off to be made, each played as it comes, in order. o.hold: made
   * now, but not played till its handle's go() (speech.js: on the speaker's turn). Returns its handle. */
  say(who, text, cast, o) {
    const sents = this.sentences(text);
    if (!sents.length) return null;
    const line = { who, cast, o, sents, parts: new Array(sents.length).fill(null), at: 0, when: 0, ids: [], need: [], t0: performance.now(), pri: o.pri, hold: !!o.hold, starts: [], durs: [], recs: [] };
    sents.forEach((s, i) => this.want(cast, s, line, i));
    if (!line.hold) this.pump(line);
    return this.handle(line);
  },

  /** A line's handle: started (its first word is heard), done (its last is over, or it failed),
   * failed (gone before a word), progress() (how much of it is said, 0 to 1), go(), cancel(). */
  handle(line) {
    const self = this, chars = line.sents.map((s) => s.length + 1), C = chars.reduce((a, b) => a + b, 0);
    return {
      get started() { return line.starts.length > 0 && !!self.ctx && self.ctx.currentTime >= line.starts[0]; },
      get failed() { return !!line.dead && !line.starts.length; },
      get done() { return !!line.dead || (line.at >= line.parts.length && !!self.ctx && self.ctx.currentTime >= line.when - 0.06); },
      progress() {
        const now = self.ctx?.currentTime ?? 0;
        let said = 0;
        for (let i = 0; i < line.starts.length; i++) said += chars[i] * Math.max(0, Math.min(1, (now - line.starts[i]) / line.durs[i]));
        return said / C;
      },
      go() {
        if (!line.hold) return;
        line.hold = false; line.t0 = performance.now();
        const ids = line.need.filter((id) => self.wait.has(id));     // (its turn: what's still to be made, first)
        if (ids.length) self.worker.postMessage({ type: 'bump', ids, pri: 9 });
        self.pump(line);
      },
      cancel() { for (const r of line.recs) { try { r.src.stop(); } catch { /* done */ } } self.drop(line); },
    };
  },

  /** Play what's ready of a line, in order (a sentence starts as the one before it ends). */
  pump(line) {
    if (line.dead || line.hold) return;
    const ctx = this.audio();
    if (!ctx) return;
    while (line.at < line.parts.length && line.parts[line.at]) {
      const p = line.parts[line.at++];
      const buf = ctx.createBuffer(1, p.audio.length, p.rate);
      buf.copyToChannel(p.audio, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.playbackRate.value = line.cast.rate;
      const out = this.chain(ctx, line, p.gain || 1);
      src.connect(out.input);
      const start = Math.max(ctx.currentTime + 0.02, line.when);
      src.start(start);
      line.starts.push(start); line.durs.push(buf.duration / line.cast.rate);
      line.when = start + buf.duration / line.cast.rate + 0.08;
      const rec = { src, pri: line.pri, who: line.who, end: line.when };
      line.recs.push(rec);
      this.playing.push(rec);
      src.onended = () => { const i = this.playing.indexOf(rec); if (i >= 0) this.playing.splice(i, 1); };
    }
  },

  /** Where it's heard: the speaker's effect, then how loud and which side, by where they stand. */
  chain(ctx, line, level = 1) {
    const o = line.o, gain = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const pos = o.pos || line.who?.pos, l = voice.listener;
    let vol = 1, side = 0;
    if (pos && l?.pos) {
      const dx = pos.x - l.pos.x, dz = pos.z - l.pos.z, d = Math.hypot(dx, dz, (pos.y ?? 0) - (l.pos.y ?? 0));
      vol = near(d, o.pri);
      const yaw = l.yaw || 0, rx = Math.cos(yaw), rz = -Math.sin(yaw);   // (the listener's right)
      side = d > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / d)) : 0;
    }
    // (the dead's rasp drives the voice hard: brought back down after it)
    gain.gain.value = vol * (line.cast.fx === 'undead' ? 0.4 : 1);
    if (pan) { pan.pan.value = side; gain.connect(pan); pan.connect(this.bus); } else gain.connect(this.bus);
    const lv = ctx.createGain();
    lv.gain.value = level;
    lv.connect(fxInput(ctx, line.cast.fx, gain));
    return { input: lv };
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

let browserCur = null;
/** A line in the browser's own voice (o.hold: not till go()); its handle, as the neural one's. */
function browserSay(who, text, o, d) {
  if (!synth) return null;
  const { voice: v, pitch, rate } = voiceOf(o.key || who?.name || 'someone', o);
  const clean = String(text).replace(/[{}]/g, '');
  const u = new SpeechSynthesisUtterance(clean);
  if (v) u.voice = v;
  u.pitch = pitch; u.rate = rate;
  u.volume = near(d, o.pri) * (voice.sound ? Math.min(1, voice.sound.volume * 2) : 1);
  const h = {
    started: false, done: false, failed: false, at: 0, t0: 0, est: 0.6 + (clean.length * 0.075) / rate,
    progress() {
      if (!this.started) return 0;
      return Math.max(this.at / clean.length, Math.min(0.97, (performance.now() - this.t0) / 1000 / this.est));
    },
    go() {
      if (synth.speaking || synth.pending) synth.cancel();
      try { synth.speak(u); } catch { this.failed = this.done = true; return; }
      setTimeout(() => { if (!this.started && !this.done) { this.failed = this.done = true; if (browserCur === u) synth.cancel(); } }, 1800);
    },
    cancel() { if (!this.done && (browserCur === u || synth.pending)) synth.cancel(); this.done = true; },
  };
  u.onstart = () => { h.started = true; h.t0 = performance.now(); browserCur = u; };
  u.onboundary = (e) => { h.at = e.charIndex || h.at; };
  u.onend = u.onerror = () => { h.done = true; if (!h.started) h.failed = true; if (browserCur === u) browserCur = null; };
  if (!o.hold) h.go();
  return h;
}

// ------------------------------------------------------------------ the voice
export const voice = {
  listener: null,              // (the player: who is listening, for how loud and which side)
  sound: null,                 // (the game's Sfx: the voices play through it)
  useSound(sfx) { this.sound = sfx; },
  /** Resolves (true) once the neural voices and every voice of theirs are in; false if they won't come. */
  ready: null,
  enabled: store('bm.voices') !== '0',
  set(on) { this.enabled = on; try { localStorage.setItem('bm.voices', on ? '1' : '0'); } catch { /* no storage */ } if (!on) this.stop(); },
  /** Start fetching the neural voices (after the game is up: they're big). */
  warm() { if (this.enabled) neural.start(); else neural.settle(false); return this.ready; },
  /** How far the voices' download has got: [in, of]. */
  get progress() { return [neural.got, neural.of]; },
  /** The model's download while it's coming: [MB in, MB of], else null. */
  get download() { return neural.dl ? [Math.round(neural.dl[0] / 1e6), Math.round(neural.dl[1] / 1e6)] : null; },
  get model() { return neural.model; },
  /** Whether the neural voices are wanted and loaded (else the browser's speak). */
  get natural() { return neural.state === 'ready' && neural.wanted(); },
  get neural() { return neural.state; },
  get debug() { return { state: neural.state, model: neural.model, waiting: neural.wait.size, cached: neural.cache.size, playing: neural.playing.length, audio: neural.ctx?.state || 'none' }; },
  get speed() { const m = neural.ms; return m.length ? Math.round(m.reduce((a, b) => a + b, 0) / m.length) : null; },

  /** Whether something said at `pos` is heard (a quest giver always is). */
  hears(pos, pri = 0) {
    const l = this.listener?.pos;
    if (!pos || !l || pri >= 3) return true;
    return Math.hypot(pos.x - l.x, pos.z - l.z, (pos.y ?? 0) - (l.y ?? 0)) <= EARSHOT;
  },

  /** `who` says `text` aloud. o: { key (who they are: their name), sex, kind, age, toYou, pri, pos,
   * hold (made now, played on the handle's go()), browser (the browser's own voice: a neural line
   * that didn't come in time) }. Returns the line's handle (speech.js waits on
   * it: started, done, progress()), or null if it isn't said aloud. */
  say(who, text, o = {}) {
    if (!this.enabled || !text || (typeof document !== 'undefined' && document.hidden)) return null;
    const pos = o.pos || who?.pos || who?.root?.position, l = this.listener?.pos;
    const d = pos && l ? Math.hypot(pos.x - l.x, pos.z - l.z, (pos.y ?? 0) - (l.y ?? 0)) : 0;
    if (d > EARSHOT && !(o.pri >= 3)) return null;
    const pri = o.pri ?? (o.toYou ? 2 : o.kind && o.kind !== 'villager' ? 1 : 0);
    const oo = { ...o, pri };
    if (neural.state === 'off') neural.start();
    if (!o.browser && neural.state === 'ready' && neural.wanted()) return neural.say(who, text, neuralCast(o.key || who?.name || 'someone', o), oo);
    return browserSay(who, text, oo, d);
  },

  /** Make lines ahead of time: [[who, text, o], ...] (o as for say). pri: before other lines made
   * ahead (-1) with a higher one (the opening's, due before the rest). */
  prefetch(list, pri = -1) {
    if (!this.enabled || neural.state !== 'ready') return;
    for (const [who, text, o = {}] of list) neural.prefetch(text, neuralCast(o.key || who?.name || 'someone', o), pri);
  },

  stop() { neural.stop(); synth?.cancel(); browserCur = null; },
};

voice.ready = new Promise((r) => { neural.done = r; });
