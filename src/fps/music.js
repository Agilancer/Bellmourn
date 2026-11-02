// Bellmourn's music (assets/audio/music, made from the user's files by tools/audio/build_audio.py).
//
//  - The title: "Frozen Hearts", from the instant Bellmourn's logo begins to fade in, round and round
//    under the menu. It's fetched and decoded before the first card comes up (title.js waits for it)
//    and booked on the audio clock at the logo's moment, the same as the title's bells: it starts on
//    the very sample however hard the loading holds the main thread.
//  - The opening: "Cursed Citadel", from the opening's first shot (the title's song plays on under the
//    getting-ready before it), over the whole of the opening, fading as you wake in the crater.
//  - Then the music of wherever you are (SETS: the village, the open country, the wood, the
//    graveyard, the keep, below the ground), a track at a time with a quiet between, crossfading
//    when you go somewhere else; a fight brings in the action tracks over it (the place's own track
//    waits, and picks up where it left off when the fight is done).
//  - Stingers (the pack's Fx): somewhere new found, a death, a triumph (a quest done, a lord felled).
//
// The songs and the tracks stream through <audio> players into the music's line out (no track is
// decoded whole: a phone's memory is kept for the world); only the title's song is decoded, for its
// timing, and let go once the game has begun.

const DIR = 'assets/audio/music/';
export const TITLE_SONG = DIR + 'title_frozen_hearts.mp3';
export const INTRO_SONG = DIR + 'intro_cursed_citadel.mp3';
const T = (k, n) => Array.from({ length: n }, (_, i) => `${k}_${i + 1}`);
// where each of the pack's tracks plays
export const SETS = {
  village: T('light', 5),                                                            // Bellmourn: its streets, houses, cathedral, the crater at its edge
  downs: ['ambient_1', 'ambient_2', 'ambient_3', 'ambient_4', 'ambient_8', 'ambient_9'],   // the Green Downs, Millhaven, Brightwater Falls
  wood: ['ambient_6', 'ambient_7', 'ambient_10'],                                     // the Darkwood and the Bellwood Trail
  graveyard: ['dark_2', 'dark_3', 'ambient_7'],                                       // the graveyard and its mausoleum
  keep: ['ambient_5', 'dark_1', 'ambient_6'],                                         // Blackvigil Keep and the Vigil Road
  under: T('dark', 5),                                                                // the Undercroft, the catacombs, the delves, the caves
};
const COMBAT = T('action', 5);
export const STINGERS = { found: 'fx_1', fell: 'fx_2', triumph: 'fx_3' };
const LEVEL = { title: 0.62, intro: 0.9, track: 1, combat: 0.95, stinger: 0.9 };   // (the two songs keep their own loudness: this matches them to the rest)
const GAP = [7, 20];                // the quiet between one track and the next (s)

/** A short silence, to let a player play from inside a click (an iPhone wants each one let). */
function silence() {
  const n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const s = (o, t) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.phase = 'title';   // title | intro | game
    this.slots = [];        // the players: {el, g (its gain), url, use: what it's playing for, ended}
    this.queue = {};        // each set's tracks still to come, in a shuffled order
    this.last = {};         // each set's last track (not straight again)
    this.set = null; this.want = null; this.wantT = 0;
    this.area = null;       // the player with the place's music
    this.fight = null;      // the player with a fight's
    this.hotT = 0; this.coolT = 0; this.inFight = false;
    this.gapUntil = 0;
    this.duckK = 1; this.pausedK = 1;
    sfx.onStart.push(() => this.unlock());
  }

  get ctx() { return this.sfx.ctx; }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  /** The music's own line (into the music volume): ducked under a stinger, and while paused. */
  get bus() {
    if (!this._bus && this.sfx.music) { this._bus = this.ctx.createGain(); this._bus.connect(this.sfx.music); }
    return this._bus;
  }

  /** A player (made the first time: five in all, one kept for the stingers). */
  player(i) {
    if (this.slots[i]) return this.slots[i];
    if (!this.bus) return null;
    const el = new Audio();
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    const g = this.ctx.createGain();
    g.gain.value = 0;
    this.ctx.createMediaElementSource(el).connect(g);
    g.connect(i === 4 ? this.sfx.music : this.bus);
    const s = { i, el, g, url: null, use: null, ended: false };
    el.addEventListener('ended', () => { s.ended = true; });
    el.addEventListener('error', () => { if (s.use) console.warn('music: could not play', s.url); s.ended = true; });
    return (this.slots[i] = s);
  }

  /** Inside a click: every idle player let play (an iPhone won't start one later otherwise). */
  unlock() {
    if (!this.ctx || this.ctx.state === 'closed') return;
    this.silent ||= silence();
    for (let i = 0; i < 5; i++) {
      const s = this.player(i);
      if (!s || s.unlocked || s.use) continue;
      if (!s.url) s.el.src = this.silent;
      s.el.play().then(() => { s.unlocked = true; if (!s.use) s.el.pause(); }).catch(() => {});
    }
  }

  /** A free player (not the stingers'). */
  free() {
    for (let i = 0; i < 4; i++) { const s = this.player(i); if (s && !s.use) return s; }
    // all busy (fades overlapping): the one that's been fading longest
    return this.slots.filter((s) => s.i < 4).sort((a, b) => (a.fadeAt || 0) - (b.fadeAt || 0))[0] || null;
  }

  /** Start `url` on player s, fading up to vol over `fade` s (from `at` seconds into it). */
  begin(s, url, use, { loop = false, vol = 1, fade = 2, at = 0 } = {}) {
    if (!s) return null;
    clearTimeout(s.stopT);
    s.use = use; s.ended = false; s.fadeAt = 0; s.vol = vol;
    s.el.loop = loop;
    if (s.url !== url) { s.el.src = url; s.url = url; }
    try { s.el.currentTime = at; } catch { /* not seekable yet */ }
    const g = s.g.gain, n = this.now;
    g.cancelScheduledValues(n); g.setValueAtTime(fade > 0 ? 0 : vol, n);
    if (fade > 0) g.linearRampToValueAtTime(vol, n + fade);
    s.el.play()?.catch?.((e) => { console.warn('music:', e?.message || e); });
    return s;
  }

  /** Fade player s out over `secs`; stopped there (or only paused: kept where it was, `park`). */
  fade(s, secs = 2, park = false) {
    if (!s || !s.use) return;
    const g = s.g.gain, n = this.now;
    g.cancelScheduledValues(n); g.setValueAtTime(g.value, n); g.linearRampToValueAtTime(0, n + secs);
    s.fadeAt = n;
    clearTimeout(s.stopT);
    s.stopT = setTimeout(() => { s.el.pause(); if (!park) { s.use = null; s.ended = false; } }, secs * 1000 + 60);
  }

  // ------------------------------------------------------------------ the title's song
  /** Fetched and decoded (title.js waits on this before the first card). */
  async preloadTitle() {
    if (!this.titleBuf) this.titleBuf = await this.sfx.decode(TITLE_SONG);
    return !!this.titleBuf;
  }

  /** The song booked to start at `when` (the audio clock's), round and round. A booking already
   * made is let go first (the cards skipped: the logo comes up sooner). */
  bookTitle(when) {
    const c = this.ctx;
    if (!c || !this.titleBuf || this.phase !== 'title') return false;
    const old = this.titleSong;
    if (old) { try { old.src.stop(); } catch { /* not started */ } old.g.disconnect(); }
    const src = c.createBufferSource();
    src.buffer = this.titleBuf; src.loop = true;
    const g = c.createGain();
    g.gain.value = LEVEL.title;
    src.connect(g); g.connect(this.bus);
    src.start(Math.max(when, c.currentTime));
    this.titleSong = { src, g, when };
    return true;
  }

  /** The title's song away (and let go of: the title never comes back). */
  leaveTitle(fade = 2) {
    const S = this.titleSong;
    this.titleSong = null;
    if (S) {
      const n = this.now, g = S.g.gain;
      g.cancelScheduledValues(n); g.setValueAtTime(g.value, n); g.linearRampToValueAtTime(0, n + fade);
      try { S.src.stop(n + fade + 0.05); } catch { /* never started */ }
      S.src.onended = () => S.g.disconnect();
    }
    this.titleBuf = null;
  }

  /** The opening's song loaded ahead, so it starts on the opening's first shot. */
  preloadIntro() {
    const s = this.player(0);
    if (!s || s.use || s.url === INTRO_SONG) return;
    s.el.src = s.url = INTRO_SONG;
    s.el.load();
  }

  // ------------------------------------------------------------------ the opening's song
  /** A new game asked for: the place's music (a game under way) gives way, and nothing new starts
   * till the opening does; the title's song plays on under the getting-ready. The opening's song is
   * made ready on a player of its own. */
  toIntro() {
    for (const s of this.slots) if (s?.use && s.use !== 'stinger') this.fade(s, 1.2);
    this.area = this.fight = null; this.inFight = false; this.set = this.want = null;
    this.phase = 'intro';
    const s = this.slots[0]?.url === INTRO_SONG && !this.slots[0].use ? this.slots[0] : this.free();
    if (s && !s.use && s.url !== INTRO_SONG) { s.el.src = s.url = INTRO_SONG; s.el.load(); }
    this.introNext = s;
  }

  /** The opening's first shot: its song from this very moment, the title's fading under it. */
  intro() {
    if (this.phase !== 'intro') this.toIntro();
    this.leaveTitle(1.4);
    const n = this.introNext;
    this.introNext = null;
    const s = n && !n.use ? n : this.free();
    this.introSlot = this.begin(s, INTRO_SONG, 'intro', { loop: true, vol: LEVEL.intro, fade: 0.06 });
  }

  /** You've woken (or skipped it): the opening's song fades, and the place's music follows it. */
  endIntro(fade = 6) {
    if (this.phase !== 'intro') return;
    this.phase = 'game';
    this.fade(this.introSlot, fade);
    this.introSlot = null;
    this.gapUntil = this.now + fade * 0.7;
  }

  /** The game begun from the title (continued or loaded): the place's music after the song fades. */
  play() {
    if (this.phase === 'game') return;
    if (this.phase === 'intro') { this.endIntro(2.5); return; }
    this.leaveTitle(2.5);
    this.phase = 'game';
    this.gapUntil = this.now + 2;
  }

  // ------------------------------------------------------------------ the place's music, and a fight's
  /** Each frame in the game. o: {set (SETS's), threat (how many hunt you, near), hurt (you were struck
   * just now), paused} */
  update(dt, o) {
    if (!this.ctx || this.phase !== 'game' || !this.bus) return;
    const n = this.now;
    // paused: the music drops back
    const pk = o.paused ? 0.45 : 1;
    if (pk !== this.pausedK) { this.pausedK = pk; this.bus.gain.setTargetAtTime(pk * this.duckK, n, 0.25); }
    // the place: a change holds a few seconds before the music follows it (a door in and out is nothing)
    if (o.set !== this.want) { this.want = o.set; this.wantT = 0; }
    this.wantT += dt;
    if (this.want && this.want !== this.set && (this.wantT > 3.5 || !this.set)) {
      const was = this.set;
      this.set = this.want;
      if (this.area && !this.inFight) { this.fade(this.area, 3); this.area = null; this.gapUntil = n + (was ? 2.2 : 0); }
      else if (this.area) { this.fade(this.area, 0.5); this.area = null; }   // (parked under the fight: let go)
    }
    // a fight: so many hunting you, near, for a moment (or one, and you've been struck); over once
    // none has for a while
    const hot = o.threat >= 2 || (o.threat >= 1 && o.hurt);
    this.hotT = hot ? this.hotT + dt : 0;
    this.coolT = o.threat > 0 ? 0 : this.coolT + dt;
    if (!this.inFight && this.hotT > 0.8 && !o.paused && this.sfx.musicVolume > 0.01) this.startFight();
    else if (this.inFight && this.coolT > 7) this.endFight();
    if (this.inFight) {
      if (this.fight?.ended) this.fight = this.begin(this.fight, DIR + this.pick('combat', COMBAT) + '.mp3', 'fight', { vol: LEVEL.combat, fade: 0.3 });
      return;
    }
    // a track done: the quiet, then the next
    if (this.area?.ended) { this.area.use = null; this.area = null; this.gapUntil = n + GAP[0] + Math.random() * (GAP[1] - GAP[0]); }
    if (!this.area && this.set && n > this.gapUntil && this.sfx.musicVolume > 0.01) {
      this.area = this.begin(this.free(), DIR + this.pick(this.set, SETS[this.set]) + '.mp3', 'area', { vol: LEVEL.track, fade: 3 });
    }
  }

  /** The next of a set's tracks: all of them in turn, shuffled, never the same twice running. */
  pick(set, list) {
    let q = this.queue[set];
    if (!q?.length) {
      q = this.queue[set] = shuffle([...list]);
      if (q.length > 1 && q[0] === this.last[set]) q.push(q.shift());
    }
    return (this.last[set] = q.shift());
  }

  startFight() {
    this.inFight = true;
    this.coolT = 0;
    if (this.area) this.fade(this.area, 1.2, true);   // (parked: it picks up where it was)
    this.fight = this.begin(this.free(), DIR + this.pick('combat', COMBAT) + '.mp3', 'fight', { vol: LEVEL.combat, fade: 0.7 });
  }

  endFight() {
    this.inFight = false;
    this.hotT = 0;
    this.fade(this.fight, 3.5);
    this.fight = null;
    const a = this.area;
    if (a && a.use === 'area' && !a.ended) {   // the place's own track, back where it was
      clearTimeout(a.stopT);
      setTimeout(() => {
        if (this.area !== a || this.inFight) return;
        const g = a.g.gain, n = this.now;
        g.cancelScheduledValues(n); g.setValueAtTime(0, n); g.linearRampToValueAtTime(a.vol, n + 3.5);
        a.el.play()?.catch?.(() => {});
      }, 1800);
    } else { this.area = null; this.gapUntil = this.now + 4; }
  }

  /** A stinger over the music (which drops under it): found, fell or triumph. */
  stinger(kind) {
    const f = STINGERS[kind], s = this.player(4);
    if (!f || !s || this.phase === 'title' || this.sfx.musicVolume < 0.01) return;
    this.begin(s, DIR + f + '.mp3', 'stinger', { vol: LEVEL.stinger, fade: 0.05 });
    const bus = this.bus.gain, n = this.now, dur = { found: 11, fell: 3.5, triumph: 7 }[kind];
    this.duckK = 0.35;
    bus.cancelScheduledValues(n); bus.setTargetAtTime(this.duckK * this.pausedK, n, 0.2);
    clearTimeout(this.duckT);
    this.duckT = setTimeout(() => { this.duckK = 1; this.bus.gain.setTargetAtTime(this.pausedK, this.now, 1.2); }, dur * 1000);
    clearTimeout(s.stopT);
    s.stopT = setTimeout(() => { s.use = null; }, (dur + 4) * 1000);
  }
}
