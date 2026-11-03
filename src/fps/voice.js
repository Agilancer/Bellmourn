// Voices: everyone who speaks in Bellmourn says their words aloud as well as in the bubble, each in a
// voice of their own. The voices are recordings, made ahead of time with Qwen3-TTS (docs/VOICES.md):
// one MP3 a line, filed under its speaker and a hash of its words (lines/voicekey.js), fetched from
// the voices' own site (the Bellmourn2 repository on GitHub Pages; lines/voiced.js lists what each
// speaker has). A line nobody has recorded yet is shown in its bubble and isn't said aloud: nothing is
// synthesised in the browser.
//
// Each line is heard in 3D from where its speaker stands, following them as they move and you as you
// turn, softer the further off it is (an inverse-distance falloff: chain, tick). A speaker's kind gives
// their voice its effect (the Sworn behind their helms, the dead in their crypts: voicefx.js); the
// recordings are made at the right age and sex, so nothing is pitched.
//
// Recordings are fetched a few at a time, the most pressing first (what's being said now, then what's
// waiting its turn, then what's wanted ahead: the crater's lines while the game loads, the answer of
// whoever you're walking up to), and kept decoded, the least lately wanted let go first.
//
// Settings: localStorage bm.voices = '0' turns all voices off; bm.voicebase points the game at another
// copy of the recordings (a local one, while testing new lines).

import { monsterFx, MONSTER_FX, swellBuffer } from './voicefx.js';
import { VOICED } from './lines/voiced.js';
import { voiceKey } from './lines/voicekey.js';

const EARSHOT = 28;          // metres
const CACHE = 200;           // recordings kept decoded
const FETCHES = 3;           // recordings fetched at once
const GAIN = 1.2;            // the recordings' level (made at one loudness) up to the voices' old one
const SWELL = 1.1;           // s a sorcerer's reversed echo rises before each line
// Every voice is heard from where its speaker stands, in 3D (an HRTF panner: left and right, in
// front and behind, above and below, turning as you turn), and softer with distance as a voice in
// the open is: full within REF metres, then the inverse of the distance (half at 5 m, a quarter at
// 10, a tenth at 25); nothing past EARSHOT is said aloud at all.
const REF = 2.5, ROLL = 1;
const EAR = 1.6, MOUTH = 1.55;   // m above the feet: your ears; a speaker's mouth (times their size)
/** Where a line's speaker's mouth is now (they move as they talk), or null if they've no place. */
function mouth(line, out = {}) {
  const p = line.o?.pos || line.who?.pos || line.who?.root?.position;
  if (!p) return null;
  out.x = p.x; out.y = (p.y ?? 0) + MOUTH * (line.who?.size || 1); out.z = p.z;
  return out;
}
/** An AudioParam to `v`: at once (a new voice), or eased over a few hundredths (one that's moving). */
function ease(param, v, t, now) { if (now) param.value = v; else param.setTargetAtTime(v, t, 0.04); }
function place(panner, at, t, now = false) {
  if (!at) return;
  if (panner.positionX) { ease(panner.positionX, at.x, t, now); ease(panner.positionY, at.y, t, now); ease(panner.positionZ, at.z, t, now); }
  else panner.setPosition(at.x, at.y, at.z);
}
const store = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

// ------------------------------------------------------------------ who sounds how
// The monsters' effects (voicefx.js), lighter than they were on the old synthesised voices (the user
// found Malgrave and the dead too modulated to make out): the Red Hand an octave-down double behind
// his helm; the dead the same double in a crypt's echo; the drowned gurgling; the dry ancient dead
// (wraiths) words carried on breath; the cave's things pure breath; the sorcerers many mouths, a
// reversed echo rising into each line, in a crypt. `level`: each chain at about one loudness.
const KIND = {
  knight: { fx: 'helm' },
  lord: { fx: ['sub', 'helm'], level: 1.1 },
  sorcerer: { fx: ['chorus', 'crypt'], swell: true, level: 1.5 },
  beast: { fx: ['whisper'], level: 0.6 },
};
const UNDEAD = {
  dead: { fx: ['sub', 'crypt'], level: 0.9 },
  drowned: { fx: ['gurgle'], level: 0.5 },
  wraith: { fx: ['whisper', 'crypt'], level: 1.5 },
};
/** How a speaker sounds: { voice (whose recordings: their name, or the voice the line was recorded
 * in), fx, level, swell }. */
function castOf(key, { kind = 'villager', style = null } = {}) {
  const m = kind === 'undead' ? UNDEAD[style] || UNDEAD.dead : KIND[kind];
  return { voice: key, fx: m?.fx ?? null, level: m?.level ?? 1, swell: !!m?.swell };
}

// which lines each voice has been recorded saying
const have = new Map(Object.entries(VOICED.have || {}).map(([v, s]) => [v, new Set(String(s).split(/\s+/).filter(Boolean))]));
const base = () => store('bm.voicebase') || VOICED.base;
/** Where the recording of `voiceId` saying `text` is, or null if there isn't one. */
function recordingOf(voiceId, text) {
  const s = have.get(voiceId);
  if (!s || !text) return null;
  const k = voiceKey(String(text));
  return s.has(k) ? `${base()}${encodeURIComponent(voiceId)}/${k}.mp3` : null;
}
const keyOf = (who, o) => o.key || who?.name || 'someone';

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

// ------------------------------------------------------------------ the recordings
const rec = {
  ctx: null, bus: null, tap: null,
  cache: new Map(),          // url -> { buf } (decoded), or { waiters: [line...], pri, swell } (on its way)
  queue: [],                 // urls waiting to be fetched
  inflight: 0,
  playing: [],               // { src, g, panner, line, end }
  offline: null,

  /** Something to decode with before the game's sound has started (decoded buffers play anywhere). */
  decoder() {
    if (this.ctx) return this.ctx;
    if (!this.offline && typeof OfflineAudioContext !== 'undefined') this.offline = new OfflineAudioContext(1, 1, 48000);
    return this.offline;
  },

  /** The recording at `url`: from the cache, or fetched (the most pressing first). line: a line
   * waiting to say it; pri: how pressing (9: being said now; 0 to 8 waiting or wanted soon; -1 ahead). */
  want(url, line = null, pri = -1, swell = false) {
    const hit = this.cache.get(url);
    if (hit?.buf) { this.cache.delete(url); this.cache.set(url, hit); if (line) { line.buf = hit.buf; line.lead = hit.lead || 0; this.pump(line); } return hit; }
    if (hit) { if (line) hit.waiters.push(line); hit.pri = Math.max(hit.pri, pri); return hit; }
    const job = { waiters: line ? [line] : [], pri, swell, done: null };
    job.ready = new Promise((r) => { job.done = r; });
    this.cache.set(url, job);
    this.queue.push(url);
    this.next();
    return job;
  },

  next() {
    while (this.inflight < FETCHES && this.queue.length) {
      // (the most pressing waiting, first asked first among equals)
      let bi = 0;
      for (let i = 1; i < this.queue.length; i++) if ((this.cache.get(this.queue[i])?.pri ?? -9) > (this.cache.get(this.queue[bi])?.pri ?? -9)) bi = i;
      const url = this.queue.splice(bi, 1)[0], job = this.cache.get(url);
      if (!job || job.buf) continue;
      this.inflight++;
      fetch(url, { mode: 'cors' })
        .then((r) => { if (!r.ok) throw new Error(r.status + ' ' + url); return r.arrayBuffer(); })
        .then((ab) => this.decoder().decodeAudioData(ab))
        .then((buf) => (job.swell ? swellBuffer(buf, SWELL).then((b) => ({ buf: b, lead: SWELL }), () => ({ buf, lead: 0 })) : { buf, lead: 0 }))
        .then(({ buf, lead }) => {
          const got = { buf, lead };
          this.cache.delete(url); this.cache.set(url, got);
          for (const [k, v] of this.cache) { if (this.cache.size <= CACHE) break; if (v.buf) this.cache.delete(k); }
          for (const line of job.waiters) if (!line.dead) { line.buf = buf; line.lead = lead; this.pump(line); }
          job.done(true);
        })
        .catch((e) => {
          console.warn('voices: no recording', String(e));
          this.cache.delete(url);
          for (const line of job.waiters) line.dead = true;
          job.done(false);
        })
        .finally(() => { this.inflight--; this.next(); });
    }
  },

  /** The game's own sound (voice.useSound): its context, and a line for the voices under its master
   * volume. Each voice is evened by a compressor of its own before it's placed (chain); the line they
   * all go down has only a limiter, so a near voice and a far one keep their difference. */
  audio() {
    const S = voice.sound;
    if (S && !S.ctx) S.start();
    if (S?.ctx && this.ctx !== S.ctx) {
      this.ctx = S.ctx;
      const lim = this.ctx.createDynamicsCompressor();
      lim.threshold.value = -4; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.15;
      const out = this.ctx.createGain(); out.gain.value = 1.3;   // (a voice at arm's length as loud as before it was placed: measured)
      lim.connect(out); out.connect(S.out);
      this.bus = lim;
      this.tap = out;      // (where a test listens in: voice.meter)
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

  /** Say a line: its recording fetched if it isn't in yet, played as soon as it is. o.hold: not till
   * its handle's go() (speech.js: on the speaker's turn). Returns its handle. */
  say(who, url, cast, o) {
    const line = { who, cast, o, url, buf: null, lead: 0, dead: false, hold: !!o.hold, pri: o.pri ?? 0, start: 0, dur: 0, when: 0, rec: null };
    this.want(url, line, line.hold ? line.pri : 9, cast.swell);
    return this.handle(line);
  },

  /** A line's handle: started (its first word is heard), done (it's over, or it failed), failed (gone
   * before a word), progress() (how much of it is said, 0 to 1), go(), cancel(fade). */
  handle(line) {
    const self = this;
    return {
      get started() { return line.start > 0 && !!self.ctx && self.ctx.currentTime >= line.start; },
      get failed() { return line.dead && !line.start; },
      get done() { return line.dead || (line.start > 0 && !!self.ctx && self.ctx.currentTime >= line.when - 0.06); },
      progress() {
        if (!line.start || !self.ctx) return 0;
        return Math.max(0, Math.min(1, (self.ctx.currentTime - line.start) / (line.dur || 1)));
      },
      go() {
        if (!line.hold) return;
        line.hold = false;
        const job = self.cache.get(line.url);
        if (job && !job.buf) job.pri = 9;
        self.pump(line);
      },
      cancel(fade = 0) {
        const r = line.rec, now = self.ctx?.currentTime ?? 0;
        if (r) {
          try {
            if (fade > 0 && now < r.end) { r.g.gain.setTargetAtTime(0, now, fade / 3); r.src.stop(now + fade); } else r.src.stop();
          } catch { /* done */ }
        }
        line.dead = true;
      },
    };
  },

  /** Play a line once it's its turn and its recording is in. */
  pump(line) {
    if (line.dead || line.hold || !line.buf || line.rec) return;
    const ctx = this.audio();
    if (!ctx) return;
    voice.tick(true);    // (the listener where you are before a voice is placed about you)
    const src = ctx.createBufferSource();
    src.buffer = line.buf;
    const out = this.chain(ctx, line, GAIN);
    src.connect(out.input);
    const start = ctx.currentTime + 0.02;
    src.start(start);
    line.start = start + line.lead; line.dur = Math.max(0.1, line.buf.duration - line.lead); line.when = start + line.buf.duration;
    const r = { src, g: out.input, panner: out.panner, line, end: line.when };
    line.rec = r;
    this.playing.push(r);
    src.onended = () => { const i = this.playing.indexOf(r); if (i >= 0) this.playing.splice(i, 1); };
  },

  /** Where a line is heard: the speaker's effect, at one loudness, then a 3D panner at their mouth
   * (moved with them each frame: voice.tick), softer with distance. */
  chain(ctx, line, level = 1) {
    const gain = ctx.createGain();
    gain.gain.value = line.cast.level ?? 1;
    // (evened here, before distance: on the line all voices share, it squeezed a near voice and a far
    // one together, so the far one was heard at nearly twice the falloff's level)
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
    gain.connect(comp);
    const at = mouth(line);
    let panner = null;
    if (at && ctx.createPanner) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
      panner.refDistance = REF; panner.rolloffFactor = ROLL; panner.maxDistance = 1000;
      place(panner, at, ctx.currentTime, true);
      comp.connect(panner); panner.connect(this.bus);
    } else comp.connect(this.bus);
    const lv = ctx.createGain();
    lv.gain.value = level;
    lv.connect(fxInput(ctx, line.cast.fx, gain));
    return { input: lv, panner };
  },

  stop() {
    for (const p of this.playing) { try { p.src.stop(); } catch { /* done */ } p.line.dead = true; }
    this.playing.length = 0;
    for (const url of this.queue) { const job = this.cache.get(url); if (job && !job.buf) { for (const l of job.waiters) l.dead = true; job.waiters.length = 0; } }
  },
};

// ------------------------------------------------------------------ the voice
export const voice = {
  listener: null,              // (the player: who is listening, for how loud and which side)
  sound: null,                 // (the game's Sfx: the voices play through it)
  useSound(sfx) { this.sound = sfx; },
  /** Resolves at once: the recordings need nothing loaded before the game (each is fetched as it's wanted). */
  ready: Promise.resolve(true),
  enabled: store('bm.voices') !== '0',
  set(on) { this.enabled = on; try { localStorage.setItem('bm.voices', on ? '1' : '0'); } catch { /* no storage */ } if (!on) this.stop(); },
  warm() { return this.ready; },
  /** Whether lines can be made ahead (villagers.js expect): whenever voices are on. */
  get natural() { return this.enabled; },
  get debug() { return { cached: [...rec.cache.values()].filter((v) => v.buf).length, fetching: rec.inflight, waiting: rec.queue.length, playing: rec.playing.length, audio: rec.ctx?.state || 'none', base: base() }; },
  /** (for a test) How loud the voices are coming out now, left and right: { l, r } (RMS). */
  meter() {
    const ctx = rec.ctx, tap = rec.tap;
    if (!ctx || !tap) return null;
    if (!rec.meters) {
      const split = ctx.createChannelSplitter(2), l = ctx.createAnalyser(), r = ctx.createAnalyser();
      l.fftSize = r.fftSize = 2048;
      tap.connect(split); split.connect(l, 0); split.connect(r, 1);
      rec.meters = [l, r, new Float32Array(2048)];
    }
    const [l, r, buf] = rec.meters, rms = (a) => { a.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x; return Math.sqrt(s / buf.length); };
    return { l: rms(l), r: rms(r) };
  },

  /** Whether something said at `pos` is heard (a quest giver always is). */
  hears(pos, pri = 0) {
    const l = this.listener?.pos;
    if (!pos || !l || pri >= 3) return true;
    return Math.hypot(pos.x - l.x, pos.z - l.z, (pos.y ?? 0) - (l.y ?? 0)) <= EARSHOT;
  },
  /** Whether `who` has a recording of `text` (o: { key, ... } as for say). */
  has(who, text, o = {}) { return !!recordingOf(keyOf(who, o), text); },

  /** `who` says `text` aloud, if they've a recording of it. o: { key (who they are: their name, or the
   * voice their line was recorded in), kind, style, toYou, pri, pos, hold (fetched now, played on the
   * handle's go()) }. Returns the line's handle (speech.js waits on it: started, done, progress()), or
   * null if it isn't said aloud (nobody's recorded it, or it's out of earshot). */
  say(who, text, o = {}) {
    if (!this.enabled || !text || (typeof document !== 'undefined' && document.hidden)) return null;
    const pos = o.pos || who?.pos || who?.root?.position, l = this.listener?.pos;
    const d = pos && l ? Math.hypot(pos.x - l.x, pos.z - l.z, (pos.y ?? 0) - (l.y ?? 0)) : 0;
    if (d > EARSHOT && !(o.pri >= 3)) return null;
    const key = keyOf(who, o), url = recordingOf(key, text);
    if (!url) return null;
    const pri = o.pri ?? (o.toYou ? 2 : o.kind && o.kind !== 'villager' ? 1 : 0);
    return rec.say(who, url, castOf(key, o), { ...o, pri });
  },

  /** Fetch lines ahead of time: [[who, text, o], ...] (o as for say); pri: how soon they'll be wanted
   * (-1, whenever; up to 8, any moment: the one you're about to speak to). Resolves once they're all
   * in (or failed). */
  prefetch(list, pri = -1) {
    if (!this.enabled) return Promise.resolve();
    const jobs = [];
    for (const [who, text, o = {}] of list) {
      const key = keyOf(who, o), url = recordingOf(key, text);
      if (url) jobs.push(rec.want(url, null, pri, castOf(key, o).swell));
    }
    return Promise.all(jobs.map((j) => j.ready || true));
  },
  /** Whether a line is fetched already (so it's heard the moment it's said). */
  made(who, text, o = {}) { const url = recordingOf(keyOf(who, o), text); return !!(url && rec.cache.get(url)?.buf); },

  stop() { rec.stop(); },

  /** Each frame (speech.js tickSpeech): the ears where you are and the way you face, and every voice
   * still sounding moved to where its speaker is now. now: at once (no easing). */
  tick(now = false) {
    const ctx = rec.ctx, l = this.listener;
    if (!ctx || !l?.pos) return;
    const t = ctx.currentTime, L = ctx.listener, yaw = l.yaw || 0, pitch = l.pitch || 0;
    const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
    const ex = l.pos.x, ey = (l.pos.y ?? 0) + EAR, ez = l.pos.z;
    if (L.positionX) {
      ease(L.positionX, ex, t, now); ease(L.positionY, ey, t, now); ease(L.positionZ, ez, t, now);
      ease(L.forwardX, fx, t, now); ease(L.forwardY, fy, t, now); ease(L.forwardZ, fz, t, now);
      if (now) { L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    } else { L.setPosition(ex, ey, ez); L.setOrientation(fx, fy, fz, 0, 1, 0); }
    if (now) return;
    const at = {};
    for (const r of rec.playing) if (r.panner && r.line) place(r.panner, mouth(r.line, at), t);
  },
};
