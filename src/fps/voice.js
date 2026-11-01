// Voices: everyone who speaks in Bellmourn says their words aloud as well as in the bubble, each in a
// voice of their own for good (picked from their name).
//
// On a computer the voices are neural: Kokoro-82M (Apache-2.0), run in a worker (tts_worker.js),
// its model fetched once and cached by the browser. Villagers speak in its British and American
// voices; Velscour's Sworn in its deepest men's voices, pitched down further and muffled as if from
// behind a helm, their lord deeper still; the sorcerers with a ring to them; the dead dragged low,
// slowed and roughened into a moan over the gibberish they mutter. Each line is played where its
// speaker stands: quieter further off, to the left or the right. A long line is said a sentence
// at a time, so it starts at once; the model's own quiet is cut from each sentence and the pauses
// between them come from the punctuation, so a line runs as it's spoken (pauseAfter, paceOf), and
// what it's given to say is a copy it can't spell out letter by letter (sayable).
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

import { monsterFx, MONSTER_FX, swellBuffer } from './voicefx.js';

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
const CHUNK = 150;           // characters: a longer sentence is made in pieces (at a comma; each piece is said as a whole)
const CACHE = 260;           // pieces kept made (a few seconds of audio each: some tens of MB in all)
const SWELL = 1.1;           // s a sorcerer's reversed echo rises before each piece
/** How loud a speaker d metres off is heard: all of it near, never less than a little over half. */
const near = (d, pri) => (pri >= 2 ? 1 : Math.max(0.6, Math.min(1, 1.15 - (0.55 * d) / EARSHOT)));
const store = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

// ------------------------------------------------------------------ how a line is said
// The voices read text through espeak's dictionary, which spells out any "word" it can't say: "Hm"
// came out "aitch-em", "Shh" "ess-aitch-aitch", and the dead's "mmrr... ghhaa" letter by letter. So
// what's said is a sayable copy of what's shown: the noises people make written as they sound, the
// dead's and the beasts' as syllables a mouth can make, a few names as they're meant to be said.
const SOUNDS = {
  hm: 'hmm', hmm: 'hmm', hmmm: 'hmm', mm: 'hmm', mmm: 'hmm', mmmm: 'hmm', mhm: 'uh-huh', hmph: 'humph',
  tch: 'tsk', shh: 'shush', sh: 'shush', shhh: 'shush', pst: 'psst', grr: 'gurr', grrr: 'gurr', brr: 'burr', brrr: 'burr',
};
const NAMES = { odile: 'Odeel', isolde: 'Izzolda' };
const VOWEL = /[aeiouy]/;
const KNOWN = new Set(['psst', 'tsk', 'pff', 'pfft', 'hmm', 'shh']);
// (the clusters a syllable can start with, and end with, that espeak says as sounds)
const ONSET = new Set(['', ...'bcdfghjklmnpqrstvwxz', 'sh', 'th', 'ch', 'ph', 'wh', 'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'kl', 'kr', 'pl', 'pr',
  'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'tr', 'tw', 'thr', 'shr', 'spr', 'str', 'scr', 'skr', 'spl', 'vr', 'gn', 'kn', 'wr', 'ps', 'gh', 'sch', 'chr',
  'phr', 'sph', 'dw', 'gw', 'sc', 'squ', 'qu', 'rh', 'shl', 'thw', 'ts', 'pn', 'sq']);
const CODA = new Set(['', ...'bcdfgklmnprstvxzw', 'gh', 'sh', 'th', 'ch', 'ng', 'nk', 'nd', 'nt', 'mp', 'lk', 'lm', 'ln', 'lt', 'rk', 'rm', 'rn', 'rt', 'rd',
  'rg', 'rl', 'rs', 'sk', 'st', 'ck', 'ft', 'ld', 'lf', 'mph', 'rgh', 'ngh', 'ght', 'tch', 'nch', 'rch', 'lch', 'rth', 'nth', 'pt', 'ct', 'xt', 'lp', 'sp',
  'mb', 'mn', 'lb', 'rb', 'rf', 'rp', 'rv', 'lv', 'nc', 'ns', 'nz', 'rc', 'lth', 'dth', 'fth', 'wn', 'wl', 'wd', 'wk', 'wt', 'ws', 'lg', 'lsh', 'rsh', 'nx',
  'ph', 'bt', 'tz', 'ts', 'ks', 'ps', 'h', 'gn', 'ngth', 'rmth', 'wth', 'pth', 'wns', 'nst', 'mpt', 'dst', 'rst', 'lst', 'xt', 'nks', 'rld', 'rmst', 'wnst']);
const medial = (m) => { for (let k = 0; k <= m.length; k++) if (CODA.has(m.slice(0, k)) && ONSET.has(m.slice(k))) return true; return false; };
/** Whether espeak can say `w` as a word (lower case): it has a vowel, and its consonants come in
 * clusters a syllable can start and end with (doubled letters are fine but at the start). */
export function speakable(w) {
  if (KNOWN.has(w)) return true;
  // (a vowel drawn out, "Aaaaaah!", is said drawn out: only consonants piled up are spelled)
  if (/^[^aeiouy]*([^aeiouy])\1/.test(w) || /([^aeiouy])\1\1/.test(w) || /hh/.test(w)) return false;
  const c = w.replace(/([^aeiouy])\1/g, '$1').split(/[aeiouy]+/);
  if (c.length < 2 || !ONSET.has(c[0])) return false;
  const end = c[c.length - 1];
  if (!CODA.has(end) && !CODA.has(end.replace(/(s|d|t)$/, ''))) return false;
  return c.slice(1, -1).every(medial);
}
const odd = (w) => !speakable(w);
/** One of those as syllables a mouth can make: its runs cut to one letter, the breath after a
 * consonant let go, and a vowel put in wherever its consonants pile up past saying. */
function mouthed(w) {
  if (/^[hsz]*s[hsz]*$/.test(w)) return 'hiss';     // (a hiss is said as one)
  let s = w.replace(/([^aeiouy])\1+/g, '$1').replace(/([bdfgjkmnlprvz])h/g, '$1').replace(/^h(?=[^aeiouy])/, '');
  if (!s) return 'haah';
  if (/^[mn]$/.test(s)) return 'hmm';
  // syllables: the consonants before each vowel run, the vowels, and whatever's left at the end
  const parts = s.match(/[^aeiouy]*[aeiouy]+|[^aeiouy]+$/g) || [s];
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i], v = p.search(VOWEL);
    let on = v < 0 ? p : p.slice(0, v), nu = v < 0 ? '' : p.slice(v);
    if (!nu) {                                  // (the consonants it ends with)
      if (out && CODA.has(on)) { out += on; continue; }
      if (!out) { out = on.slice(0, 1) + (/[sz]/.test(on) && !/r/.test(on) ? 'i' : 'u') + (CODA.has(on.slice(1)) ? on.slice(1) : ''); continue; }
      out += on[0] + (CODA.has(on.slice(1)) ? 'u' + on.slice(1) : 'uh');
      continue;
    }
    // a cluster that can't start a syllable: the longest end of it that can, and the rest closing the
    // syllable before (or said as one of its own)
    if (!ONSET.has(on)) {
      let k = 1;
      while (k < on.length && !ONSET.has(on.slice(k))) k++;
      const head = on.slice(0, k);
      on = on.slice(k);
      if (out && CODA.has(head)) out += head;
      else for (const c of head) out += c + 'u';
    }
    out += on + nu;
  }
  return out;
}
/** What the voices are given to say for `text`: the same words, with nothing in them they'd spell out. */
export function sayable(text) {
  return String(text).replace(/[{}*]/g, '').replace(/\.{3,}/g, '…').replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, (w) => {
    const l = w.toLowerCase();
    const r = NAMES[l] ?? SOUNDS[l] ?? (!l.includes("'") && odd(l) ? mouthed(l) : null);
    if (r == null) return w;
    return w[0] === w[0].toUpperCase() ? r[0].toUpperCase() + r.slice(1) : r;
  });
}

/** The pause after a piece of a line, by how it ends (the model's own quiet is cut from each piece,
 * a quarter second before it and half a second after): a full stop a breath, a question a little
 * more, a trailing off longer, a dash or a comma less. */
export function pauseAfter(s) {
  const e = String(s).trim().replace(/["'”’)\]]+$/, '');
  if (/(…|\.\.\.)$/.test(e)) return 0.5;
  if (/\?$/.test(e)) return 0.36;
  if (/!$/.test(e)) return 0.27;
  if (/\.$/.test(e)) return 0.3;
  if (/[—–-]$/.test(e)) return 0.2;
  return 0.15;
}

/** A line in the pieces the voices make it in (see neural.sentences). */
export function splitLine(text) {
  const out = [];
  const src = String(text).replace(/[{}*]/g, '').replace(/\.{3,}/g, '…').replace(/\s+/g, ' ').trim();
  // sentences, and the trailing offs inside them ("the bell… the bell…": each ends a piece)
  for (let s of src.match(/[^.!?…]*[^.!?…\s][^.!?…]*[.!?…]+["'”’)]*|[^.!?…]+$|^[.!?…]+/g)?.map((x) => x.trim()).filter(Boolean) || []) {
    // a break at a dash, words either side ("Wait — where are you going?")
    const bits = s.split(/(?<=[A-Za-z,'’]\s?[—–])\s*(?=\S)/);
    for (let b of bits) {
      b = b.trim();
      while (b.length > CHUNK) {
        let cut = -1;
        const re = /[,;:]\s/g;
        let m;
        while ((m = re.exec(b)) && m.index < CHUNK) if (m.index > 18) cut = m.index + 1;
        if (cut < 0) break;
        out.push(b.slice(0, cut).trim()); b = b.slice(cut).trim();
      }
      if (b) out.push(b);
    }
  }
  // (a lone "…" before the words, "…Sorry.": the hesitation goes with them)
  for (let i = out.length - 2; i >= 0; i--) if (!/[A-Za-z]/.test(out[i])) { out[i + 1] = out[i] + out[i + 1]; out.splice(i, 1); }
  return out;
}

/** How fast a piece is said, by what it is: an exclamation a little quicker, a trailing off slower. */
export function paceOf(s) {
  const e = String(s).trim().replace(/["'”’)\]]+$/, '');
  if (/(…|\.\.\.)$/.test(e)) return 0.93;
  if (/!$/.test(e)) return 1.05;
  return 1;
}

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
// The monsters' voices (voicefx.js), as the user chose them by ear (tools/monster_voices.js): the dead
// an octave-down double, a death rattle and a hollow ring, in a stone room's echo; the drowned
// gurgling; the dry ancient dead (wraiths) words carried on breath; the cave's things pure breath;
// the sorcerers many mouths, a reversed echo rising into each word, in a crypt; the Red Hand with
// something else speaking under him. `level`: each chain brought to the loudness that kind had before
// (measured by tools/monster_voices.js: the chain's loudness out over the voice's in; the dead were
// heard at 1.73 times their voice, the beasts 1.13, sorcerers 1.03, the lord 1.12).
const MONSTER_VOICE = {
  dead: { fx: ['sub', 'fry', 'undead', 'ring:45', 'crypt'], level: 0.9 },     // (1.93 out)
  drowned: { fx: ['gurgle', 'sub', 'undead'], level: 0.39 },                  // (4.41)
  wraith: { fx: ['whisper', 'crypt'], level: 1.5 },                           // (1.15)
  beast: { fx: ['whisper'], level: 0.6 },                                     // (1.88)
  sorcerer: { fx: ['chorus', 'crypt'], swell: true, level: 1.5 },             // (0.68, with the swell)
  lord: { fx: ['sub', 'ring:30', 'helm'], level: 1.34 },                      // (0.84)
};

/** How a speaker sounds through the neural voices: { voice, rate (pitch: the playback rate), speed
 * (the model's pace, set so pitch and pace come out right together), fx, level, swell }. The dead's
 * `style` ('drowned', 'wraith') picks their voice among the dead's. */
export function neuralCast(key, { sex = 'm', kind = 'villager', age = null, fear = false, style = null } = {}) {
  const h = hash(kind + '|' + key), r = (n) => ((h >>> n) & 1023) / 1023;
  const list = kind === 'knight' ? (sex === 'f' ? KOKORO.knightF : KOKORO.knight) : kind === 'villager' ? KOKORO[sex === 'f' ? 'f' : 'm'] : KOKORO[kind] || KOKORO.m;
  let rate = 0.97 + r(5) * 0.06, fx = null, m = null;
  if (age === 'old') rate -= 0.06; else if (age === 'young') rate += 0.05;
  if (kind === 'knight') { rate = 0.84 + r(5) * 0.06; fx = 'helm'; }
  if (kind === 'lord') { rate = 0.76; m = MONSTER_VOICE.lord; }
  if (kind === 'sorcerer') { rate = 0.98 + r(5) * 0.06; m = MONSTER_VOICE.sorcerer; }
  if (kind === 'undead') { rate = 0.6 + r(5) * 0.12; m = MONSTER_VOICE[style] || MONSTER_VOICE.dead; }
  if (kind === 'beast') { rate = 1.45 + r(5) * 0.2; m = MONSTER_VOICE.beast; }
  // terrified (the opening's knight as the star comes for him): his voice up and strained, rushed,
  // shaking, still behind his helm
  if (fear) return { voice: list[h % list.length], rate: 1.04, speed: 1.3, fx: kind === 'knight' || kind === 'lord' ? 'fear-helm' : 'fear' };
  return { voice: list[h % list.length], rate, speed: Math.max(0.6, Math.min(1.6, (0.96 + r(13) * 0.08) / rate)), fx: m ? m.fx : fx, level: m?.level ?? 1, swell: !!m?.swell };
}

/** A speaker's effect, feeding `out`: what to connect their voice to. `fx` is a name, or a chain of
 * them (the voice through each in turn); the monsters' effects are in voicefx.js. */
export function fxInput(ctx, fx, out) {
  if (Array.isArray(fx)) { let node = out; for (let i = fx.length - 1; i >= 0; i--) node = fxInput(ctx, fx[i], node); return node; }
  if (fx && MONSTER_FX.includes(String(fx).split(':')[0])) return monsterFx(ctx, fx, out);
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
    if (m.type === 'peek') { this.peeked = m; return; }
    if (m.type === 'download') { this.dl = [m.loaded, m.total]; return; }
    if (m.type === 'model') { this.model = { dtype: m.dtype, threads: m.threads }; this.dl = null; return; }
    if (m.type === 'ready') { this.state = 'ready'; this.got = this.of; this.settle(true); console.info(`voices: the neural voices are ready (Kokoro-82M ${this.model?.dtype || ''}, ${this.model?.threads || 1} threads, ${this.of} voices)`); return; }
    if (m.type === 'error') { this.state = 'failed'; this.settle(false); console.warn('voices: the neural voices could not load', m.error); return; }
    const w = this.wait.get(m.id);
    this.wait.delete(m.id);
    if (!w) return;
    // (a piece that couldn't be made: a line not yet begun is said in the browser's voice instead;
    // one already under way goes on past it, so its speaker doesn't fall silent with words still to come)
    if (m.type === 'fail') {
      this.cache.delete(w.key);
      for (const { line, i } of w.lines) { if (!line.starts.length) line.dead = true; else { line.parts[i] = { audio: new Float32Array(240), rate: 24000, gain: 1 }; this.pump(line); } }
      return;
    }
    if (m.ms) { this.ms.push(m.ms); if (this.ms.length > 40) this.ms.shift(); }
    // (brought to one loudness, whoever speaks: Kokoro's voices come out louder and softer)
    let sq = 0, pk = 0;
    for (let i = 0; i < m.audio.length; i++) { const x = m.audio[i]; sq += x * x; if (x > pk) pk = x; else if (-x > pk) pk = -x; }
    const rms = Math.sqrt(sq / Math.max(1, m.audio.length));
    const part = { audio: m.audio, rate: m.rate, gain: rms > 1e-5 ? Math.max(0.25, Math.min(8, LOUD / rms, 0.95 / Math.max(pk, 1e-5))) : 1 };
    // (a sorcerer's: its reversed echo made from the whole of it first, rising SWELL s before it)
    if (w.swell && typeof OfflineAudioContext !== 'undefined') {
      const buf = new AudioBuffer({ length: m.audio.length, sampleRate: m.rate, numberOfChannels: 1 });
      buf.copyToChannel(m.audio, 0);
      swellBuffer(buf, SWELL).then((b) => { part.audio = b.getChannelData(0); part.lead = SWELL; this.keep(w, part); }, () => this.keep(w, part));
      return;
    }
    this.keep(w, part);
  },

  /** A piece made: kept, and given to the lines waiting on it. */
  keep(w, part) {
    // (kept by when it was last made or wanted, the longest unwanted going first: a sentence made
    // ahead, for someone you're walking up to, had kept its place in the queue from when it was asked
    // for, and was among the first to go before it was ever said)
    this.cache.delete(w.key); this.cache.set(w.key, part);
    for (const [k, v] of this.cache) { if (this.cache.size <= CACHE) break; if (v.audio) this.cache.delete(k); }   // (what's still being made stays)
    for (const { line, i } of w.lines) { if (!line.dead) { line.parts[i] = part; this.pump(line); } }
  },

  /** The cache's key for a piece in a cast (a sorcerer's swelled piece is kept apart from the same words plain). */
  keyOf(cast, speed, text) { return cast.voice + '|' + speed.toFixed(2) + (cast.swell ? '|swell' : '') + '|' + text; },

  /** A line in the pieces it's made in, each said as a whole: its sentences; a trailing off ("the
   * bell… the bell") and a break ("Wait — where are you going?") end a piece too (the model runs
   * straight through them, and the hesitation is lost); a very long sentence is broken at a comma. */
  sentences(text) { return splitLine(text); },

  /** A piece in a voice: from the cache, or asked for (line i of `line` gets it when it comes).
   * Made in order of how pressing: a line being said now (9), one waiting its turn (its priority, 0
   * to 3), one made ahead (`ahead`: -1, or more for one about to be wanted). */
  want(cast, s, line = null, i = 0, ahead = -1) {
    const text = sayable(s).trim(), speed = Math.max(0.6, Math.min(1.6, cast.speed * paceOf(s)));
    const key = this.keyOf(cast, speed, text), hit = this.cache.get(key);
    const pri = line ? (line.hold ? line.pri ?? 0 : 9) : ahead;
    if (!/[A-Za-z]/.test(text)) { if (line) line.parts[i] = { audio: new Float32Array(240), rate: 24000, gain: 1 }; return; }   // (nothing in it to say)
    if (hit?.audio) { if (line) line.parts[i] = hit; this.cache.delete(key); this.cache.set(key, hit); return; }
    if (hit?.id && this.wait.has(hit.id)) {
      if (line) { this.wait.get(hit.id).lines.push({ line, i }); line.need.push(hit.id); }
      if (line || ahead > -1) this.worker.postMessage({ type: 'bump', ids: [hit.id], pri });
      return;
    }
    const id = this.next++;
    this.cache.set(key, { id });
    this.wait.set(id, { key, swell: !!cast.swell, lines: line ? [{ line, i }] : [] });
    if (line) { line.ids.push(id); line.need.push(id); }
    this.worker.postMessage({ type: 'say', id, text, voice: cast.voice, speed, pri });
  },

  /** Make a line ahead of when it's said (a scene's, a group's, a quest's), so it plays on time
   * (pri: how soon it'll be wanted, -1 to 8). */
  prefetch(text, cast, pri = -1) {
    if (this.state !== 'ready') return;
    // (the one you're looking at, about to speak to: their first words made before anything, even
    // what's being said now, which is already playing; the rest of it is made while those are heard)
    this.sentences(text).forEach((s, i) => this.want(cast, s, null, 0, i === 0 && pri >= 8 ? 9.5 : pri));
  },
  /** Whether every piece of a line is made already (so it would be heard the moment it's said). */
  made(text, cast) {
    return this.sentences(text).every((s) => {
      const t = sayable(s).trim(), sp = Math.max(0.6, Math.min(1.6, cast.speed * paceOf(s)));
      return !/[A-Za-z]/.test(t) || !!this.cache.get(this.keyOf(cast, sp, t))?.audio;
    });
  },

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
    // (the pauses between its pieces: by how each ends, longer for a slow voice, never quite the same twice)
    const pauses = sents.map((s, i) => (i === sents.length - 1 ? 0.04 : pauseAfter(s) * (0.88 + Math.random() * 0.24) / Math.max(0.6, cast.rate)));
    const line = { who, cast, o, sents, pauses, parts: new Array(sents.length).fill(null), at: 0, when: 0, ids: [], need: [], t0: performance.now(), pri: o.pri, hold: !!o.hold, starts: [], durs: [], recs: [] };
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
      /** Stop it (fade: over so many seconds, a voice falling away rather than snapped off). */
      cancel(fade = 0) {
        const now = self.ctx?.currentTime ?? 0;
        for (const r of line.recs) {
          try {
            if (fade > 0 && now < r.end) { r.g.gain.setTargetAtTime(0, now, fade / 3); r.src.stop(now + fade); } else r.src.stop();
          } catch { /* done */ }
        }
        self.drop(line);
      },
    };
  },

  /** Play what's ready of a line, in order (a sentence starts as the one before it ends). */
  pump(line) {
    if (line.dead || line.hold) return;
    const ctx = this.audio();
    if (!ctx) return;
    while (line.at < line.parts.length && line.parts[line.at]) {
      const i = line.at, p = line.parts[line.at++];
      const buf = ctx.createBuffer(1, p.audio.length, p.rate);
      buf.copyToChannel(p.audio, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.playbackRate.value = line.cast.rate;
      const out = this.chain(ctx, line, p.gain || 1);
      src.connect(out.input);
      // (a hesitation the line begins with, "…Sorry.": a beat before the word)
      // (a swelled piece's rising echo starts under the end of the one before it, up to half a second in)
      const lead = i > 0 && p.lead ? Math.min(p.lead / line.cast.rate, line.pauses[i - 1] + 0.5) : 0;
      const start = Math.max(ctx.currentTime + 0.02, line.when - lead) + (i === 0 && /^…/.test(line.sents[0]) ? 0.35 : 0);
      src.start(start);
      line.starts.push(start); line.durs.push(buf.duration / line.cast.rate);
      line.when = start + buf.duration / line.cast.rate + line.pauses[i];
      const rec = { src, g: out.input, pri: line.pri, who: line.who, end: line.when };
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
    gain.gain.value = vol * (line.cast.level ?? 1);   // (each effect brought back to one loudness: MONSTER_VOICE)
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
  const clean = sayable(text);
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
  /** (for a test) What the worker has waiting and is making: resolves { n, top, ids, doing }. */
  peek() { return new Promise((r) => { neural.peeked = null; neural.worker?.postMessage({ type: 'peek' }); const t0 = Date.now(); const k = setInterval(() => { if (neural.peeked || Date.now() - t0 > 3000) { clearInterval(k); r(neural.peeked); } }, 20); }); },
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

  /** Make lines ahead of time: [[who, text, o], ...] (o as for say); pri: how soon they'll be wanted
   * (-1, whenever; up to 8, any moment: the one you're about to speak to). */
  prefetch(list, pri = -1) {
    if (!this.enabled || neural.state !== 'ready') return;
    for (const [who, text, o = {}] of list) neural.prefetch(text, neuralCast(o.key || who?.name || 'someone', o), pri);
  },
  /** Whether a line is made already, every piece of it (so it's heard the moment it's said). */
  made(who, text, o = {}) { return neural.state === 'ready' && neural.made(text, neuralCast(o.key || who?.name || 'someone', o)); },

  stop() { neural.stop(); synth?.cancel(); browserCur = null; },
};

voice.ready = new Promise((r) => { neural.done = r; });
