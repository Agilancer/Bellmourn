// The title screen. Two cards first, Blastorama Gaming and then Jamie Herrington, each fading in with
// sparkles glinting about it and a tinkle of little bells for every glint, then out; then Bellmourn's
// own logo, with a distant bell and a couple of tinkles, over a black cover while the whole game loads
// behind it; then the menu (New Game, Continue, Load, Settings, How to Play) and the village drifting
// by through a dark veil. Here too: the confirm box, the Settings and How to Play windows (the pause
// screen opens them as well), and the "click to begin" a browser asks for before it plays a sound.
//
// The cards, their glints and the logo's fade are CSS animations of opacity and transform only, all
// set going at one moment with their delays, and every sound is booked on the audio clock at that same
// moment: the compositor and the audio thread play them, so they keep time with each other however
// hard the loading holds the main thread.
import { Sfx } from './audio.js';
import { Music } from './music.js';
import { TOUCH } from './input.js';

const LOGOS = {
  blastorama: 'assets/title/blastorama.webp',
  herrington: 'assets/title/herrington.webp',
  bellmourn: 'assets/title/bellmourn.webp',
};
const CARD = 5.2, GAP = 0.45;                  // each card's time on screen, and the black between them
const CARD_GLINTS = [0.85, 1.4, 1.95, 2.55, 3.1];
const SHINE_AT = 1.0;                          // the light sweeping across each card's letters
const MAIN_AT = 2 * (CARD + GAP);              // when Bellmourn's logo begins to come up
const MAIN_IN = 1.9;                           // its fade
const MAIN_GLINTS = [1.25, 2.05];              // its couple of tinkles
// where on a logo each glint lands, in turn: its ends first, then between
const ZONES = [[0, 0.2], [0.8, 1], [0.24, 0.5], [0.5, 0.76], [0.02, 0.3], [0.7, 0.98]];
// little bells: E major pentatonic, high (E6 .. F#7)
const SCALE = [1318.5, 1480, 1661.2, 1975.5, 2217.5, 2637, 2960];
// [ratio, level, decay seconds] of a struck glass bell's partials, and of a big bronze bell far off
const TING = [[1, 1, 1.5], [2.0, 0.38, 0.75], [3.0, 0.16, 0.45], [4.2, 0.1, 0.28], [5.4, 0.05, 0.18]];
const TOLL = [[0.5, 0.5, 7], [1, 0.55, 5], [1.19, 0.35, 4], [1.5, 0.2, 3], [2, 0.45, 3.5], [2.51, 0.15, 2.2], [2.66, 0.12, 2], [3.01, 0.1, 1.6], [4.07, 0.06, 1.2]];
const MENU = [['new', 'New Game'], ['continue', 'Continue'], ['load', 'Load'], ['settings', 'Settings'], ['howto', 'How to Play']];

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const MODS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn']);

const SETTINGS = `
  <h2>Settings</h2><div class="t-rule"></div>
  <div class="t-set">
    <label><span>Volume</span><input id="optVol" type="range" min="0" max="1" step="0.05" value="0.5"></label>
    <label><span>Music</span><input id="optMusic" type="range" min="0" max="1" step="0.05" value="0.7"></label>
    <label><span>Ambience</span><input id="optAmb" type="range" min="0" max="1" step="0.05" value="0.8"></label>
    <label><span>Look speed</span><input id="optSens" type="range" min="0.5" max="2.5" step="0.1" value="1"></label>
    <label><span>Resolution</span><select id="optRes"><option value="1" selected>Full</option><option value="0.75">75%</option><option value="0.5">Half</option></select></label>
    <label><span>Graphics</span><select id="optGfx"><option value="high">High (shadows)</option><option value="low">Low</option></select></label>
    <label><span>Texels</span><select id="optTex"><option value="crisp" selected>Crisp</option><option value="smooth">Smooth</option></select></label>
    <label><span>Voices</span><select id="optVoice"><option value="neural">Natural (Kokoro, a 90 MB download)</option><option value="basic">Basic (the browser's own)</option><option value="off">Off</option></select></label>
    <label><span>Time of day</span><select id="optTime"><option value="cycle">Day &amp; night</option><option value="golden">Golden hour</option><option value="noon">Noon</option><option value="night">Night</option></select></label>
  </div>
  <p class="t-note">Graphics and texels restart the game to take hold.</p>
  <div class="t-dbtns"><button class="t-btn" data-close><span>Done</span></button></div>`;

const KEYS = [['W A S D', 'move'], ['Mouse', 'look'], ['Shift', 'run'], ['Space', 'jump'],
  ['Left click', 'right hand: swing, shoot'], ['Right click', 'left hand: block, swing, shoot'],
  ['F R X C V', 'cast the spells set to those keys'], ['Q &nbsp; Z', 'drink healing, mana'],
  ['E', 'open doors, search chests, speak'], ['1 – 5', 'quick-equip arms'],
  ['Tab / I', 'inventory &amp; spellbook'], ['M', 'map'], ['L &nbsp; T', 'quest log, quest tracker'], ['Esc', 'pause: save, load, settings']];
const HOWTO = `
  <h2>How to Play</h2><div class="t-rule"></div>
  <div class="t-keys">${KEYS.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('')}</div>
  <div class="t-touchkeys">
    <p><b>Left thumb</b> moves (push it right out to run); <b>right thumb</b> looks about.</p>
    <p>The buttons: attack, left hand, the spells on F and R, jump, use (doors, chests, people), drink, the map, the bag, the quest log and pause.</p>
  </div>
  <h3>Along the way</h3>
  <ul class="t-tips">
    <li>A gold <b>!</b> over someone's head: they have work for you. A gold <b>?</b>: the work is done, go back to them.</li>
    <li>A raised shield takes blows on its Guard; let it down a moment and the Guard comes back. Raise it <b>just as a blow comes</b> and you parry it whole: the one who swung reels, and your next blow strikes nearly twice as hard.</li>
    <li>Swing with the shield up to <b>bash</b>: what's in front of you is knocked back and reels.</li>
    <li>A <b>staff</b>: hold the button to gather its bolt (the longer, the bigger and harder it flies). With the left hand free, right click <b>sweeps</b> it round, knocking the dead back off you.</li>
    <li>The dead hunt each in their own way: some come round your side, some stalk you till your back is turned, some grab hold (strike them off), some lie still and wait.</li>
    <li>Spells cost mana. Set up to five on F, R, X, C and V in the spellbook.</li>
    <li>The game keeps itself as you play: <b>Continue</b> picks up wherever you were last. Pause to keep a copy in one of ten save slots.</li>
  </ul>
  <div class="t-dbtns"><button class="t-btn" data-close><span>Done</span></button></div>`;

const DIALOG = `<h2></h2><div class="t-rule"></div><p class="t-msg"></p>
  <div class="t-dbtns"><button class="t-btn" data-v="yes"><span></span></button><button class="t-btn" data-v="no"><span></span></button></div>`;

/** A four-pointed star of light, drawn once, for the glints. */
function starSprite(n = 160) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), h = n / 2;
  g.globalCompositeOperation = 'lighter';
  const glow = g.createRadialGradient(h, h, 0, h, h, h * 0.55);
  glow.addColorStop(0, 'rgba(255,236,190,0.85)');
  glow.addColorStop(0.22, 'rgba(255,205,110,0.3)');
  glow.addColorStop(1, 'rgba(255,190,80,0)');
  g.fillStyle = glow; g.fillRect(0, 0, n, n);
  const ray = (ang, len, w, a) => {
    g.save(); g.translate(h, h); g.rotate(ang);
    const gr = g.createLinearGradient(-len, 0, len, 0);
    gr.addColorStop(0, 'rgba(255,225,150,0)');
    gr.addColorStop(0.5, `rgba(255,253,240,${a})`);
    gr.addColorStop(1, 'rgba(255,225,150,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(-len, 0); g.lineTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w); g.closePath(); g.fill();
    g.restore();
  };
  ray(0, h, n * 0.03, 1); ray(Math.PI / 2, h, n * 0.03, 1);
  ray(Math.PI / 4, h * 0.42, n * 0.02, 0.6); ray(-Math.PI / 4, h * 0.42, n * 0.02, 0.6);
  const core = g.createRadialGradient(h, h, 0, h, h, n * 0.08);
  core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core; g.fillRect(0, 0, n, n);
  return c.toDataURL();
}

/** The upper edges of a logo's letters (where a gilded edge catches the light), as fractions of it. */
function edgesOf(img) {
  const w = 360, h = Math.max(1, Math.round(w * (img.naturalHeight || 1) / (img.naturalWidth || 1)));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  let d;
  try { g.drawImage(img, 0, 0, w, h); d = g.getImageData(0, 0, w, h).data; } catch { return []; }
  const pts = [];
  for (let y = 3; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 200 && d[((y - 3) * w + x) * 4 + 3] < 30) pts.push([x / w, y / h]);
  }
  return pts;
}

/** A room's echo: a couple of seconds of decaying noise, a little different in each ear. */
function impulse(c, secs, decay) {
  const n = Math.round(c.sampleRate * secs), b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * Math.min(1, i / (c.sampleRate * 0.012));
  }
  return b;
}

export class Title {
  constructor() {
    this.sfx = new Sfx();
    this.music = new Music(this.sfx);   // (the title's song, the opening's, and the world's music: music.js)
    try { const v = parseFloat(localStorage.getItem('bm.volume')); if (Number.isFinite(v)) this.sfx.volume = v; } catch { /* no storage */ }
    this.mode = 'boot';          // boot | gate | splash | main | loading | hidden
    this.isReady = false; this.logoIn = false; this.menuOn = false;
    this.state = () => ({});
    this.onMenu = null;          // (action): new, continue, load (the game's)
    this.edges = {};
    this.build();
    this.boot();
  }

  // ------------------------------------------------------------------ the screen
  build() {
    const R = this.root = document.getElementById('title') || document.body.appendChild(el('div'));
    R.id = 'title';
    R.classList.toggle('is-touch', TOUCH);
    R.style.setProperty('--t-star', `url(${starSprite()})`);
    this.screen = R.querySelector('.t-screen') || R.appendChild(el('div', 't-screen'));
    this.cover = this.screen.querySelector('.t-cover') || this.screen.appendChild(el('div', 't-cover'));
    this.screen.insertBefore(el('div', 't-veil'), this.cover);
    this.cards = el('div', 't-cards');
    this.main = el('div', 't-main', `
      <div class="t-logo t-mainlogo"><img alt="Bellmourn: Velscour's Throne" src="${LOGOS.bellmourn}" draggable="false">
        <div class="t-shine" style="--m:url(${LOGOS.bellmourn})"><i></i></div><div class="t-glints"></div><div class="t-motes"></div></div>
      <div class="t-under"><div class="t-status"><span></span><div class="t-bar"><i></i></div></div><nav class="t-menu"></nav></div>`);
    this.mainLogo = this.main.querySelector('.t-mainlogo');
    this.statusEl = this.main.querySelector('.t-status');
    this.menuEl = this.main.querySelector('.t-menu');
    MENU.forEach(([a, label], i) => {
      const b = el('button', 't-btn', `<span>${label}</span>`);
      b.dataset.a = a; b.style.setProperty('--i', i);
      b.onclick = (e) => { e.stopPropagation(); this.chime(); this.act(a, b); };
      this.menuEl.append(b);
    });
    this.gate = el('div', 't-gate', `<b>${TOUCH ? 'Tap' : 'Click'} to begin</b>`);
    this.skipEl = el('div', 't-skip', TOUCH ? 'Tap to skip' : 'Click or press a key to skip');
    this.lastEl = el('div', 't-last');
    this.screen.append(this.cards, this.main, this.gate, this.skipEl, this.lastEl);
    // ambient gold dust about Bellmourn's logo, drifting up while the title is up
    const motes = this.mainLogo.querySelector('.t-motes');
    for (let i = 0; i < 16; i++) motes.append(this.mote(rnd(0.02, 0.98), rnd(-0.1, 1.15), rnd(0, 7), true));

    // the windows over everything: settings, how to play, the confirm box, and the save slots
    this.modal = R.querySelector('.t-modal') || R.appendChild(el('div', 't-modal'));
    this.scrim = el('div', 't-scrim');
    this.settings = el('div', 't-frame t-settings', SETTINGS);
    this.howto = el('div', 't-frame t-howto', HOWTO);
    this.dialog = el('div', 't-frame t-dialog', DIALOG);
    this.modal.append(this.scrim, this.settings, this.howto, this.dialog);
    for (const f of [this.settings, this.howto]) f.querySelector('[data-close]').onclick = () => { this.chime(); this.frame(f, false); };
    for (const b of this.dialog.querySelectorAll('[data-v]')) b.onclick = () => { this.chime(); this.answer?.(b.dataset.v === 'yes'); };
    this.scrim.onclick = () => this.closeTop();
    // the scrim shows whenever a window is open (the save slots' panel opens and closes itself)
    new MutationObserver(() => this.scrim.classList.toggle('on', !!this.top())).observe(this.modal, { subtree: true, attributes: true, attributeFilter: ['class'] });
    // the menu buttons' hover tick (and the windows' buttons)
    R.addEventListener('pointerover', (e) => { const b = e.target.closest?.('.t-btn'); if (b && b !== this.hovered && !b.disabled) { this.hovered = b; this.tick(); } });
    R.addEventListener('pointerout', (e) => { if (this.hovered && e.target.closest?.('.t-btn') === this.hovered && !this.hovered.contains(e.relatedTarget)) this.hovered = null; });
    addEventListener('keydown', (e) => this.key(e), true);
    // the volume is the title's (it has the sounds); the rest are wired by the game (main.js)
    const vol = this.settings.querySelector('#optVol');
    vol.value = String(this.sfx.volume);
    vol.oninput = () => {
      this.sfx.volume = Number(vol.value);
      if (this.sfx.out) this.sfx.out.gain.value = this.sfx.volume;
      try { localStorage.setItem('bm.volume', vol.value); } catch { /* no storage */ }
    };
    vol.onchange = () => this.tick(1.6);
    // and the music's and the ambience's, under it
    for (const [id, key, set, now] of [['#optMusic', 'bm.music', 'setMusicVolume', this.sfx.musicVolume], ['#optAmb', 'bm.ambience', 'setAmbVolume', this.sfx.ambVolume]]) {
      const r = this.settings.querySelector(id);
      r.value = String(now);
      r.oninput = () => { this.sfx[set](Number(r.value)); try { localStorage.setItem(key, r.value); } catch { /* no storage */ } };
    }
    // the voices: natural (neural, a computer's default), the browser's own (a phone's), or none
    const vo = this.settings.querySelector('#optVoice'), get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    vo.value = get('bm.voices') === '0' ? 'off' : get('bm.neural') === '0' ? 'basic' : 'neural';
    vo.onchange = () => {
      try {
        localStorage.setItem('bm.voices', vo.value === 'off' ? '0' : '1');
        localStorage.setItem('bm.neural', vo.value === 'neural' ? '1' : '0');
      } catch { /* no storage */ }
      const v = window.bellmourn?.voice;
      if (v) { v.set(vo.value !== 'off'); if (vo.value === 'neural') v.warm(); }
    };
  }

  /** One mote of gold dust at (x, y) of a logo, `delay` seconds on (loop: forever). */
  mote(x, y, delay, loop = false) {
    const m = el('s', loop ? 't-mote loop' : 't-mote');
    m.style.cssText = `left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%;animation-delay:${delay.toFixed(2)}s;--dx:${rnd(-14, 14).toFixed(0)}px;--dy:${rnd(-70, -30).toFixed(0)}px;--z:${rnd(0.6, 1.3).toFixed(2)}`;
    return m;
  }

  glint(x, y, delay, s = 1) {
    const g = el('i', 't-glint');
    g.style.cssText = `left:${(x * 100).toFixed(2)}%;top:${(y * 100).toFixed(2)}%;animation-delay:${delay.toFixed(3)}s;--s:${s.toFixed(2)}`;
    return g;
  }

  /** A spot on a logo's edges within the zone [x0, x1], not too near one already taken. */
  spot(name, [x0, x1], taken) {
    const pts = (this.edges[name] || []).filter(([x]) => x >= x0 && x <= x1);
    for (let k = 0; k < 24 && pts.length; k++) {
      const p = pts[Math.floor(Math.random() * pts.length)];
      if (taken.every(([x, y]) => Math.hypot((x - p[0]) * 4, y - p[1]) > 0.35)) { taken.push(p); return p; }
    }
    const p = pts.length ? pts[Math.floor(Math.random() * pts.length)] : [rnd(x0, x1), rnd(0.25, 0.6)];
    taken.push(p);
    return p;
  }

  // ------------------------------------------------------------------ the start
  async boot() {
    let skip = false;
    try { skip = sessionStorage.getItem('bm.skipSplash') === '1'; sessionStorage.removeItem('bm.skipSplash'); } catch { /* no storage */ }
    // the pictures in hand (and their edges found), and the title's song fetched and decoded, before
    // anything fades in: it's booked to start the instant Bellmourn's logo does (music.js)
    this.sfx.start();
    const song = this.music.preloadTitle();
    const imgs = Object.entries(LOGOS).map(([k, src]) => { const i = new Image(); i.src = src; return [k, i]; });
    await Promise.race([Promise.all([...imgs.map(([, i]) => i.decode().catch(() => {})), song]), wait(20000)]);
    // (a song slower than that is booked when it comes, from then; then the effects come in)
    song.then((ok) => { if (ok && this.mainAt != null && !this.music.titleSong) this.music.bookTitle(Math.max(this.mainAt, this.sfx.ctx.currentTime)); })
      .finally(() => { this.sfx.loadBank(); this.music.preloadIntro(); });
    for (const [k, i] of imgs) this.edges[k] = edgesOf(i);
    // a browser plays no sound till it's been clicked (or a key pressed), unless it trusts the site
    this.sfx.start();
    const c = this.sfx.ctx;
    if (c && c.state !== 'running') await Promise.race([new Promise((r) => c.addEventListener('statechange', r, { once: true })), wait(250)]);
    if (this.mode === 'hidden') return;   // (the game gave up: the graphics were lost)
    if (skip || !c || c.state === 'running') { this.run(skip); return; }
    this.mode = 'gate';
    this.gate.classList.add('on');
    // (a click, not a press: on a phone only the lifted finger counts as the go-ahead for sound)
    const go = (e) => {
      if (this.mode !== 'gate' || (e.type === 'keydown' && MODS.has(e.key))) return;
      e.preventDefault?.();
      this.gate.removeEventListener('click', go);
      if (TOUCH) document.documentElement.requestFullscreen?.()?.then(() => screen.orientation?.lock?.('landscape'))?.catch(() => {});
      this.gate.classList.remove('on');
      this.mode = 'boot';
      Promise.race([c.resume(), wait(400)]).catch(() => {}).then(() => this.run(false));
    };
    this.gate.addEventListener('click', go);
    this.gateKey = go;
  }

  /** The cards, then Bellmourn's logo (straight to it when `skip`). */
  run(skip) {
    if (this.mode === 'hidden') return;
    this.mode = skip ? 'main' : 'splash';
    const c = this.audio(), lead = 0.08;
    this.t0 = performance.now() + lead * 1000;
    this.bus = this.newBus();
    const at0 = c ? c.currentTime + lead : 0;
    if (!skip) {
      this.cardEls = [this.card('blastorama', 0, at0, 1), this.card('herrington', CARD + GAP, at0, 3)];
      this.cards.append(...this.cardEls);
      this.skipEl.classList.add('on');
      this.splashT = setTimeout(() => this.skip(true), MAIN_AT * 1000);
    }
    this.beginMain(skip ? 0 : MAIN_AT, at0);
  }

  /** One splash card: its logo fading in and out at `at` seconds, its glints and their tinkles. */
  card(name, at, at0, from) {
    const src = LOGOS[name], c = el('div', 't-card');
    c.style.animationDelay = `${at}s`;
    c.innerHTML = `<div class="t-logo"><img src="${src}" alt="" draggable="false"><div class="t-shine" style="--m:url(${src})"><i style="animation-delay:${at + SHINE_AT}s"></i></div><div class="t-glints"></div><div class="t-motes"></div></div>`;
    const glints = c.querySelector('.t-glints'), motes = c.querySelector('.t-motes'), taken = [];
    let note = from;
    CARD_GLINTS.forEach((d, i) => {
      const [x, y] = this.spot(name, ZONES[i % ZONES.length], taken), t = at + d + rnd(-0.08, 0.08);
      glints.append(this.glint(x, y, t, rnd(0.75, 1.2)));
      // each its own little bell, wandering up and down the scale (no two alike in a row)
      if (this.bus) this.tinkle(this.bus, at0 + t + 0.07, note, (x - 0.5) * 1.3, 1);
      note = Math.max(0, Math.min(SCALE.length - 3, note + [-2, -1, 1, 2][Math.floor(Math.random() * 4)]));
    });
    for (let i = 0; i < 14; i++) motes.append(this.mote(rnd(0, 1), rnd(-0.15, 1.1), at + rnd(0.5, 3.4)));
    return c;
  }

  /** Bellmourn's logo coming up `at` seconds on: a bell far off, then a couple of tinkles. */
  beginMain(at, at0) {
    const L = this.mainLogo, taken = [], shine = L.querySelector('.t-shine i');
    // (cleared and set again, so they start over from now: a new delay alone would count from before)
    for (const e of [L, this.statusEl, shine]) e.style.animation = 'none';
    void L.offsetWidth;
    L.style.animation = `t-main ${MAIN_IN}s cubic-bezier(.25,.6,.3,1) ${at}s both`;
    this.statusEl.style.animation = `t-fade 1.2s ease ${at + 1.2}s both`;
    shine.style.animation = `t-shine 1.7s ease-in-out ${at + 0.9}s both`;
    const glints = L.querySelector('.t-glints');
    glints.querySelectorAll('.t-glint').forEach((g) => g.remove());
    if (this.bus) this.toll(this.bus, at0 + at + 0.05);
    // the title's song, from the logo's first moment
    this.mainAt = at0 + at;
    if (this.sfx.ctx) this.music.bookTitle(this.mainAt);   // (booked on a context not yet let run, it plays once it is)
    MAIN_GLINTS.forEach((d, i) => {
      const [x, y] = this.spot('bellmourn', ZONES[i], taken);
      glints.append(this.glint(x, y, at + d, 1.15));
      if (this.bus) this.tinkle(this.bus, at0 + at + d + 0.07, [2, 4][i], (x - 0.5) * 1.3, 0.9);
    });
    clearTimeout(this.inT);
    this.inT = setTimeout(() => { this.logoIn = true; this.maybeMenu(); }, (at + MAIN_IN * 0.75) * 1000);
  }

  /** Past the cards (a click, a key, or their end): straight on to Bellmourn's logo. */
  skip(ended = false) {
    if (this.mode !== 'splash') return;
    this.mode = 'main';
    clearTimeout(this.splashT);
    this.skipEl.classList.remove('on');
    if (ended) { for (const c of this.cardEls || []) c.remove(); return; }
    // cut short: the cards fade from where they are, their booked bells are hushed, and the logo
    // comes up now
    for (const c of this.cardEls || []) {
      const o = getComputedStyle(c).opacity;
      c.style.animation = 'none'; c.style.opacity = o;
      void c.offsetWidth;
      c.style.transition = 'opacity .35s'; c.style.opacity = '0';
      setTimeout(() => c.remove(), 450);
    }
    this.hush();
    const c = this.audio();
    this.bus = this.newBus();
    this.beginMain(0.3, c ? c.currentTime : 0);
  }

  /** The booked bells hushed (the cards skipped, or the title put away). */
  hush() {
    const old = this.bus, c = this.audio();
    this.bus = null;
    if (old && c) { old.gain.setTargetAtTime(0, c.currentTime, 0.06); setTimeout(() => old.disconnect(), 600); }
  }

  // ------------------------------------------------------------------ what the game tells it
  /** The game is loaded: the menu comes up once the logo is in. state() -> {continue, load}. */
  ready(state) {
    if (state) this.state = state;
    this.isReady = true;
    this.maybeMenu();
  }

  maybeMenu() {
    if (!this.isReady || !this.logoIn || this.mode !== 'main' || this.menuOn) return;
    this.menuOn = true;
    this.refresh();
    this.main.classList.add('menu-on');
    this.cover.classList.add('reveal');      // the black lifts: the village, dim, behind the logo
    this.idle();
  }

  /** Continue and Load, live or not (there's a game to pick up, a slot to load). */
  refresh() {
    const s = this.state() || {};
    for (const b of this.menuEl.children) {
      const a = b.dataset.a;
      b.disabled = a === 'continue' ? !s.continue : a === 'load' ? !s.load : false;
    }
  }

  /** The loading line, `pct` per cent of the way. */
  progress(pct) { this.status(`Raising the village… ${pct}%`, pct); }

  /** The line under the logo (and its bar, given a per cent). */
  status(text, pct = null) {
    this.statusEl.querySelector('span').textContent = text;
    this.statusEl.classList.toggle('has-bar', pct != null);
    if (pct != null) this.statusEl.querySelector('.t-bar i').style.transform = `scaleX(${Math.max(0, Math.min(1, pct / 100))})`;
  }

  /** Where the last run stopped, if it never closed cleanly (main.js's trace). */
  lastRun(text) { this.lastEl.textContent = 'Last time it stopped: ' + text; }

  /** The title back up over the game, black, the logo and a line under it (a new game getting ready).
   * Resolves once the black is down. */
  show(text = '') {
    clearTimeout(this.goneT); clearTimeout(this.idleT);
    document.body.classList.add('title-up');
    this.mode = 'loading';
    this.menuOn = false;
    this.main.classList.remove('menu-on');
    this.cover.classList.remove('reveal');
    this.mainLogo.style.animation = 'none'; this.mainLogo.style.opacity = '1';
    this.statusEl.style.animation = 'none'; this.statusEl.style.opacity = '1';
    this.status(text);
    const S = this.screen;
    if (S.classList.contains('gone')) { S.classList.remove('gone'); void S.offsetWidth; }
    S.classList.remove('out');
    return wait(450);
  }

  /** The title away (the game's begun). `now`: at once, no fade. */
  hide(now = false) {
    if (this.mode === 'hidden') return;
    if (this.mode === 'splash') { this.skip(true); this.hush(); }
    this.mode = 'hidden';
    clearTimeout(this.idleT); clearTimeout(this.inT); clearTimeout(this.splashT);
    this.gate.classList.remove('on'); this.skipEl.classList.remove('on');
    document.body.classList.remove('title-up');
    this.screen.classList.add('out');
    clearTimeout(this.goneT);
    this.goneT = setTimeout(() => this.screen.classList.add('gone'), now ? 0 : 900);
  }

  get up() { return this.mode !== 'hidden'; }

  /** Restart the game (a setting the shaders are made with), straight to the title this time. */
  reload() {
    try { sessionStorage.setItem('bm.skipSplash', '1'); } catch { /* no storage */ }
    location.reload();
  }

  /** Now and then a glint on the logo while the menu waits (no sound: once was enough). */
  idle() {
    clearTimeout(this.idleT);
    this.idleT = setTimeout(() => {
      if (!this.menuOn || this.mode !== 'main') return;
      const [x, y] = this.spot('bellmourn', [0, 1], []);
      const g = this.glint(x, y, 0, rnd(0.7, 1.05));
      this.mainLogo.querySelector('.t-glints').append(g);
      setTimeout(() => g.remove(), 1400);
      this.idle();
    }, rnd(2800, 6500));
  }

  // ------------------------------------------------------------------ the menu and the windows
  act(a, from) {
    if (a === 'settings') this.panel('settings', from);
    else if (a === 'howto') this.panel('howto', from);
    else this.onMenu?.(a);
  }

  /** Settings or How to Play, opened (the pause screen opens them too). */
  panel(which, from = null) {
    const f = which === 'settings' ? this.settings : this.howto;
    for (const o of [this.settings, this.howto]) if (o !== f) this.frame(o, false);
    this.opener = from || document.activeElement;
    this.frame(f, true);
  }

  frame(f, on) {
    f.classList.toggle('open', on);
    if (on) { f.scrollTop = 0; f.querySelector('select, input, .t-btn')?.focus({ preventScroll: true }); }
    else if (this.opener?.isConnected) { this.opener.focus({ preventScroll: true }); this.opener = null; }
  }

  /** The in-game "are you sure" box: resolves true (yes) or false. o: {title, text, yes, no} */
  confirm(o) {
    this.answer?.(false);
    const D = this.dialog;
    D.querySelector('h2').textContent = o.title;
    D.querySelector('.t-msg').textContent = o.text;
    D.querySelector('[data-v=yes] span').textContent = o.yes || 'Yes';
    D.querySelector('[data-v=no] span').textContent = o.no || 'Go Back';
    const opener = document.activeElement;
    return new Promise((res) => {
      this.answer = (v) => {
        this.answer = null;
        D.classList.remove('open');
        if (opener?.isConnected && !v) opener.focus({ preventScroll: true });
        res(v);
      };
      D.classList.add('open');
      D.querySelector('[data-v=no]').focus({ preventScroll: true });
    });
  }

  /** The window on top: the confirm box, then settings or how to play, then the save slots. */
  top() {
    if (this.dialog.classList.contains('open')) return this.dialog;
    return [this.settings, this.howto].find((f) => f.classList.contains('open'))
      || [...this.modal.querySelectorAll('.panel')].find((p) => !p.classList.contains('hidden')) || null;
  }

  closeTop() {
    const f = this.top();
    if (!f) return false;
    if (f === this.dialog) this.answer?.(false);
    else if (f === this.settings || f === this.howto) this.frame(f, false);
    else f.querySelector('.close')?.click();
    return true;
  }

  /** Keys: any skips the cards; Esc shuts the top window; the arrows walk the buttons. The game's
   * own keys (input.js) don't hear what's used here. */
  key(e) {
    if (this.mode === 'gate') { this.gateKey?.(e); e.stopPropagation(); return; }
    if (this.mode === 'splash') {
      if (!MODS.has(e.key)) { e.preventDefault(); this.skip(); }
      e.stopPropagation();
      return;
    }
    const f = this.top(), menu = this.menuOn && this.mode === 'main' ? this.menuEl : null;
    if (!f && !menu) return;
    if (e.code === 'Escape' && f) { e.stopPropagation(); e.preventDefault(); this.closeTop(); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && !(e.target.matches?.('select, input') && f)) {
      const list = [...(f || menu).querySelectorAll('.t-btn, button, select, input')].filter((b) => !b.disabled && b.offsetParent);
      if (list.length) {
        const i = list.indexOf(document.activeElement), d = e.code === 'ArrowUp' || e.code === 'ArrowLeft' ? -1 : 1;
        list[i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length].focus();
        this.tick();
        e.preventDefault();
      }
      e.stopPropagation();
      return;
    }
    if (['Enter', 'Space', 'Tab'].includes(e.code)) e.stopPropagation();   // (the buttons' own)
  }

  // ------------------------------------------------------------------ the sounds
  audio() { const c = this.sfx.ctx; return c && c.state === 'running' ? c : null; }

  /** A fresh line out (straight, and into the echo) for a run of booked sounds. */
  newBus() {
    const c = this.audio();
    if (!c || !this.sfx.out) return null;
    if (!this.verb) {
      this.verb = c.createConvolver();
      this.verb.buffer = impulse(c, 2.8, 2.6);
      const wet = c.createGain();
      wet.gain.value = 0.42;
      this.verb.connect(wet); wet.connect(this.sfx.out);
    }
    const g = c.createGain();
    g.connect(this.sfx.out); g.connect(this.verb);
    return g;
  }

  /** One small bell struck at `when`. */
  bell(bus, when, f, gain, pan = 0, len = 1, partials = TING) {
    const c = bus.context;
    let to = bus;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(bus); to = p; }
    for (const [r, a, d] of partials) {
      const o = c.createOscillator(), e = c.createGain(), end = when + d * len;
      o.frequency.value = f * r * (1 + (Math.random() - 0.5) * 0.004);
      e.gain.setValueAtTime(0.0001, when);
      e.gain.exponentialRampToValueAtTime(gain * a, when + 0.004);
      e.gain.exponentialRampToValueAtTime(0.0001, end);
      o.connect(e); e.connect(to);
      o.start(when); o.stop(end + 0.05);
    }
  }

  /** A tinkle: a bell on note `i` of the scale, two smaller after it, and a breath of shimmer. */
  tinkle(bus, when, i, pan = 0, vol = 1) {
    const n = (k) => SCALE[Math.min(SCALE.length - 1, k)];
    this.bell(bus, when, n(i), 0.11 * vol, pan, 1);
    this.bell(bus, when + rnd(0.06, 0.085), n(i + 2), 0.05 * vol, pan * 0.8, 0.8);
    this.bell(bus, when + rnd(0.13, 0.17), n(i + 4) * (i + 4 >= SCALE.length ? 1.5 : 1), 0.025 * vol, pan * 0.6, 0.6);
    const c = bus.context;
    if (!this.sfx.noise) return;
    const s = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.sfx.noise; hp.type = 'highpass'; hp.frequency.value = 7000;
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.02 * vol, when + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
    s.connect(hp); hp.connect(g); g.connect(bus);
    s.start(when, Math.random() * 0.5); s.stop(when + 0.35);
  }

  /** The bell of Bellmourn, far off. */
  toll(bus, when) {
    const c = bus.context, lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1700; lp.connect(bus);
    this.bell(lp, when, 98, 0.2, 0, 1, TOLL);
    if (!this.sfx.noise) return;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.sfx.noise; f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.09, when + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(when); s.stop(when + 0.15);
  }

  /** The hover tick, and the click's chime. */
  tick(k = 1) {
    const c = this.audio();
    if (!c) return;
    this.ui ||= this.newBus();
    if (this.ui) this.bell(this.ui, c.currentTime + 0.005, 3520 * k * rnd(0.98, 1.02), 0.022, 0, 0.16);
  }

  chime() {
    this.sfx.start();
    const c = this.audio();
    if (!c) return;
    this.ui ||= this.newBus();
    if (this.ui) this.tinkle(this.ui, c.currentTime + 0.005, 1 + Math.floor(Math.random() * 3), 0, 0.5);
  }
}

export const title = new Title();
window.bmTitle = title;
