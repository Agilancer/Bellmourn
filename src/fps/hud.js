// The HUD and menus, in HTML over the canvas: health and mana, the shield's Guard, the two spell
// slots (F and R), the crosshair, place names, the start/pause screen, and the rotate-to-landscape
// screen for phones. (The inventory and spellbook are bag.js.)

// 12x12 pixel-art spell icons: one character per pixel
const ICONS = {
  firebolt: { pal: { r: '#701c10', o: '#e0501c', y: '#ffb040', w: '#fff6c0' }, px: [
    '.....r......', '....ro......', '....roo.....', '...roor.r...', '...royor.r..', '..royyyor...',
    '..royyyyor..', '.royywyyor..', '.roywwwyor..', '.royywwyor..', '..royyyyr...', '...rrrrr....'] },
  frost: { pal: { d: '#23407a', b: '#5aa8e8', l: '#bfe8ff', w: '#ffffff' }, px: [
    '.........dw.', '........dlw.', '.......dbl..', '......dbl...', '..d..dbl....', '..dddbl.....',
    '...dwl......', '..dbwbd.....', '.dbl.dbd....', '.bl...dd....', 'wl..........', 'w...........'] },
  lightning: { pal: { p: '#3a2490', v: '#8a70ff', w: '#ffffff' }, px: [
    '.......pp...', '......pwp...', '.....pwvp...', '....pwvp....', '...pwwwwp...', '....pvwwp...',
    '.....pwvp...', '....pwvp....', '...pwvp.....', '..pwvp......', '..pwp.......', '..pp........'] },
  mend: { pal: { g: '#1c6a30', l: '#6ad860', w: '#d8ffb0' }, px: [
    '............', '....gggg....', '....glwg....', '....glwg....', '.ggggglwggg.', '.glllllwwwg.',
    '.gwwwwwwwlg.', '.ggggwlgggg.', '....gwlg....', '....gwlg....', '....gggg....', '............'] },
  wisp: { pal: { o: '#a06a20', y: '#ffd070', w: '#ffffff' }, px: [
    '.....y......', '.....y......', '....yoy.....', '..y.yoy.y...', '...yowoy....', 'yyyowwwoyyy.',
    '...yowoy....', '..y.yoy.y...', '....yoy.....', '.....y......', '.....y......', '............'] },
  wallfire: { pal: { r: '#701c10', o: '#e0501c', y: '#ffb040', w: '#fff6c0' }, px: [
    '............', '..o....o....', '..o..o.oo...', '.oyo.ooyo.o.', '.oyoooyyoooo', 'oyyyoyyyyoyo',
    'oywyyywyyyyo', 'oywwyywwyywo', 'rywwyywwyywr', 'rrrrrrrrrrrr', 'r.r.r.r.r.r.', '............'] },
  missiles: { pal: { p: '#5a1a8a', m: '#d050ff', k: '#ff90e0', w: '#ffffff' }, px: [
    '............', '.....w......', '....wmw.....', '.w...w...w..', 'wmw.....wmw.', '.w.......w..',
    '...k...k....', '..kwk.kwk...', '...k...k....', '.....m......', '....mwm.....', '.....p......'] },
  arcaneblast: { pal: { p: '#3a1060', v: '#9050e0', l: '#d8a0ff', w: '#ffffff' }, px: [
    '..........l.', '.......l.lv.', '....l.lvvv..', '..llvvvvvl..', '.lwwwvvvl.l.', 'pwwwwwvvvl..',
    'pwwwwwvvvl..', '.lwwwvvvl.l.', '..llvvvvvl..', '....l.lvvv..', '.......l.lv.', '..........l.'] },
  firebeam: { pal: { r: '#701c10', o: '#e0501c', y: '#ffb040', w: '#fff6c0' }, px: [
    '............', '............', '.........o.o', '....oooooooo', '.ooyyyyyyyyy', 'ryywwwwwwwww',
    'ryywwwwwwwww', '.ooyyyyyyyyy', '....oooooooo', '.........o.o', '............', '............'] },
  chain: { pal: { p: '#3a2490', v: '#8a70ff', y: '#d8d0ff', w: '#ffffff' }, px: [
    'w...........', '.w..........', '..ww.....vv.', '....w...vyyv', '.....w..vyyv', '......wv.vv.',
    '.vv...v.....', 'vyyv.w......', 'vyyvw.......', '.vv..w......', '......ww..vv', '........wvyv'] },
  nova: { pal: { d: '#23407a', b: '#5aa8e8', l: '#bfe8ff', w: '#ffffff' }, px: [
    '.....w......', '..l..l..l...', '...bbbbb....', '.lb.....bl..', '..b..w..b...', 'wlb.wlw.blw.',
    '..b..w..b...', '.lb.....bl..', '...bbbbb....', '..l..l..l...', '.....w......', '..d.....d...'] },
  meteor: { pal: { r: '#701c10', o: '#e0501c', y: '#ffb040', k: '#3a2a24', w: '#fff6c0' }, px: [
    'r...........', '.ro.........', '..roo.......', '...royo.....', '....ryyo....', '.....oyyo...',
    '......owkk..', '......okkkk.', '.......kkkk.', '........kk..', '...o..o..o..', '.orrrrrrrro.'] },
  blizzard: { pal: { d: '#2a3a5a', g: '#8898b0', l: '#bfe8ff', w: '#ffffff' }, px: [
    '............', '...gggg.....', '.ggddddgg...', 'gddddddddg..', '.ggggggggg..', '..w...w...w.',
    '.l..w...l...', 'w..l..w...w.', '..w..l..w...', '.l..w...l...', 'w..l..w..w..', '............'] },
  drain: { pal: { r: '#5a0a10', c: '#c01828', p: '#ff6070', w: '#ffd0d0' }, px: [
    '............', '.cc...cc....', 'cpwc.cppc...', 'cppcccppc...', 'cpppppppc...', '.cpppppc..c.',
    '..cpppc..cp.', '...cpc..cpc.', '....c...cc..', '.....r.r....', '......r.....', '.......r....'] },
  blink: { pal: { p: '#3a1060', v: '#9050e0', l: '#d8a0ff', w: '#ffffff' }, px: [
    '............', '........ll..', '..v.v..lwwl.', '.......lwwl.', '.v.v.v..ll..', '.......llll.',
    'v.v.v.lwwwwl', '.......llll.', '.p.v.v..ll..', '.......l..l.', '..p.v..l..l.', '............'] },
  lance: { pal: { b: '#c8c0a0', w: '#fffaf0', g: '#90c8a0', d: '#2a5040' }, px: [
    '..........ww', '.........wwb', '........wwb.', '.......wbb..', '......wbb...', '.....bbb....',
    '..g.bbb.....', '.g.bbb......', 'g.wbb.......', '..bw........', '.gb.........', 'd...........'] },
  well: { pal: { k: '#0a0010', p: '#3a1060', v: '#9050e0', l: '#d8a0ff' }, px: [
    '............', '....vvvv....', '..vv....vv..', '.v..pppp..v.', '.v.pp..pp.l.', 'v.pp.kk.p..v',
    'v.p.kkkk.p.v', 'l.p.kkkk.p.v', '.v.p.kk.pp.v', '.v..pp.pp.v.', '..vl....vv..', '....vvvv....'] },
  plague: { pal: { d: '#1a3a10', g: '#4a9a20', l: '#a8f040', w: '#f0ffc0', k: '#5a4a3a' }, px: [
    '....l..w....', '..w...l..l..', '....kkkk....', '.....dd.....', '.....dd.....', '....dggd....',
    '...dglggd...', '..dgllwlgd..', '..dgllllgd..', '..dgglllgd..', '...dggggd...', '....dddd....'] },
  blades: { pal: { d: '#106070', c: '#40c8e0', l: '#b0f8ff', w: '#ffffff' }, px: [
    'w..........w', '.l........l.', '..l......l..', '...l....l...', '....l..l....', '.....ll.....',
    '.....ll.....', '....d..d....', '...dc..cd...', '..c......c..', '.c........c.', 'd..........d'] },
  spikes: { pal: { k: '#2a2622', s: '#6f665c', l: '#a89c8c', b: '#5a4030' }, px: [
    '............', '.......l....', '..l....sl...', '..sl..lss...', '.lss..lss.l.', '.lss.lsss.sl',
    'lsss.lsss.ss', 'lssslssssls.', 'ssssssssssss', 'bbbbbbbbbbbb', 'b.b.bb.b.b.b', '............'] },
};

export function iconURL(id, scale = 4) {
  const ic = ICONS[id];
  const c = document.createElement('canvas');
  c.width = c.height = 12 * scale;
  const g = c.getContext('2d');
  ic.px.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = ic.pal[ch]; g.fillRect(x * scale, y * scale, scale, scale);
  }));
  return c.toDataURL();
}

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export class Hud {
  /** opts: {spells, items, gauntlets, icons, onEquip(kind, side), onAssign(spell, slot), onGauntlet(id)} */
  constructor(root, opts) {
    this.root = root;
    this.o = opts;
    this.spellIcons = Object.fromEntries(Object.keys(opts.spells).map((k) => [k, iconURL(k)]));
    this.build();
  }

  build() {
    const r = this.root;
    r.innerHTML = '';
    this.hud = el('div', 'hud');
    this.hud.append(el('div', 'crosshair'));
    const bars = el('div', 'bars');
    this.hp = el('div', 'bar hp', '<i></i><span></span>');
    this.mp = el('div', 'bar mp', '<i></i><span></span>');
    this.gd = el('div', 'bar gd off', '<i></i><span></span><em>GUARD</em>');
    bars.append(this.hp, this.mp, this.gd);
    this.slots = el('div', 'slots');
    this.slotEl = {};
    for (const k of ['F', 'R']) {
      const s = el('div', 'slot', `<img alt=""><b>${k}</b><small></small>`);
      s.dataset.slot = k;
      this.slotEl[k] = s;
      this.slots.append(s);
    }
    this.hands = el('div', 'hands');
    this.zoneEl = el('div', 'zone');
    this.toastEl = el('div', 'toast');
    this.promptEl = el('div', 'prompt');
    this.bossEl = el('div', 'bossbar off', '<b></b><div><i></i><u></u></div>');
    this.hud.append(bars, this.slots, this.hands, this.zoneEl, this.toastEl, this.promptEl, this.bossEl);
    r.append(this.hud);

    // ---- start / pause
    this.overlay = el('div', 'overlay');
    this.overlay.innerHTML = `
      <div class="title">BELLMOURN</div>
      <div class="sub">Velscour's Throne</div>
      <div class="go"></div>
      <table class="keys">
        <tr><td>W A S D</td><td>move</td><td>Mouse</td><td>look</td></tr>
        <tr><td>Shift</td><td>run</td><td>Space</td><td>jump</td></tr>
        <tr><td>Left click</td><td>right hand: swing / shoot</td><td>Right click</td><td>left hand: block / swing / shoot</td></tr>
        <tr><td>F &nbsp; R</td><td>cast the spells set to F and R</td><td>Tab / I</td><td>inventory &amp; spellbook</td></tr>
        <tr><td>E</td><td>open doors, search chests</td><td>1 – 6</td><td>quick-equip arms</td></tr>
        <tr><td>Q &nbsp; Z</td><td>drink healing / mana</td><td>M</td><td>map</td></tr>
        <tr><td>Esc</td><td>pause</td><td></td><td></td></tr>
      </table>
      <div class="touchkeys">Left thumb: move (push far to run) · Right thumb: look · Buttons: attack, left hand, F, R, jump, use, drink, map, bag</div>
      <div class="opts"><label>Pixels <select id="optPix"><option value="1">sharp</option><option value="2" selected>chunky</option><option value="3">very chunky</option></select></label>
      <label>Look speed <input id="optSens" type="range" min="0.5" max="2.5" step="0.1" value="1"></label>
      <label>Graphics <select id="optGfx"><option value="high">high (shadows)</option><option value="low">low</option></select></label>
      <label>Time <select id="optTime"><option value="cycle">day &amp; night</option><option value="golden">golden hour</option><option value="noon">noon</option><option value="night">night</option></select></label></div>`;
    r.append(this.overlay);

    this.rotate = el('div', 'rotate', '<div>&#x21bb;</div><p>Turn your phone sideways to play</p>');
    r.append(this.rotate);

    // ---- touch controls
    this.touch = el('div', 'touch hidden');
    this.touch.innerHTML = `
      <div id="touchlayer"></div>
      <div id="stick"><div id="knob"></div></div>
      <div class="tbtn big" data-code="Mouse0">&#x2694;</div>
      <div class="tbtn left" data-code="Mouse2">&#x26E8;</div>
      <div class="tbtn spellF" data-code="KeyF"><img alt=""><b>F</b></div>
      <div class="tbtn spellR" data-code="KeyR"><img alt=""><b>R</b></div>
      <div class="tbtn jump" data-code="Space">&#x2912;</div>
      <div class="tbtn bag" data-code="KeyI">&#x2630;</div>
      <div class="tbtn use" data-code="KeyE">E</div>
      <div class="tbtn potion" data-code="KeyQ">&#x2764;</div>
      <div class="tbtn map" data-code="KeyM">&#x25A6;</div>
      <div class="tbtn pause" data-code="Escape">&#x275A;&#x275A;</div>`;
    r.append(this.touch);
  }

  /** The spell slots, and what's in each hand along the bottom. */
  refresh(equip, book) {
    const { items } = this.o;
    this.updateSlots(book);
    this.hands.innerHTML = `<span>R</span> ${equip.R ? items[equip.R].name : 'bare hand'}`
      + (items[equip.R]?.both ? '' : ` &nbsp; <span>L</span> ${equip.L ? items[equip.L].name : 'bare hand'}`);
  }

  /** The Guard bar: shown while the shield is up or still filling, red while it's broken. */
  guard(g, up) {
    const show = g.max > 0 && (up || g.v < g.max - 0.5);
    this.gd.classList.toggle('off', !show);
    if (!show) return;
    this.gd.classList.toggle('broken', g.broken);
    this.gd.classList.toggle('up', up && !g.broken);
    this.gd.querySelector('i').style.width = (g.v / g.max * 100).toFixed(1) + '%';
    this.gd.querySelector('span').textContent = Math.round(g.v);
  }

  flashGuard() {
    this.gd.classList.remove('flash');
    void this.gd.offsetWidth;
    this.gd.classList.add('flash');
  }

  updateSlots(book) {
    for (const k of ['F', 'R']) {
      const id = book[k], s = this.o.spells[id];
      const slot = this.slotEl[k];
      slot.querySelector('img').src = id ? this.spellIcons[id] : '';
      slot.querySelector('small').textContent = s ? s.name : '—';
      const t = this.touch.querySelector(k === 'F' ? '.spellF img' : '.spellR img');
      if (t) t.src = id ? this.spellIcons[id] : '';
    }
  }

  update(player, book) {
    const hp = player.health / player.maxHealth, mp = player.mana / player.maxMana;
    this.hp.querySelector('i').style.width = (hp * 100).toFixed(1) + '%';
    this.mp.querySelector('i').style.width = (mp * 100).toFixed(1) + '%';
    this.hp.querySelector('span').textContent = Math.round(player.health);
    this.mp.querySelector('span').textContent = Math.round(player.mana);
    for (const k of ['F', 'R']) {
      const s = this.o.spells[book[k]];
      this.slotEl[k].classList.toggle('low', !!s && player.mana < s.mana);
    }
  }

  zone(name) {
    if (!name || name === this.lastZone) return;
    this.lastZone = name;
    this.zoneEl.textContent = name;
    this.zoneEl.classList.remove('show');
    void this.zoneEl.offsetWidth; // restart the fade
    this.zoneEl.classList.add('show');
  }

  /** A boss's name and life across the top while you fight him: {name, frac} or null. The red
   * shows what's left, the pale trail what was just lost. */
  boss(b) {
    this.bossEl.classList.toggle('off', !b);
    if (!b) { this.bossShown = null; return; }
    if (this.bossShown !== b.name) { this.bossShown = b.name; this.bossEl.querySelector('b').textContent = b.name; }
    const w = (Math.max(0, b.frac) * 100).toFixed(1) + '%';
    if (this.bossEl.dataset.w !== w) {
      this.bossEl.dataset.w = w;
      this.bossEl.querySelector('i').style.width = w;
      this.bossEl.querySelector('u').style.width = w;
    }
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  /** The interact prompt in the middle of the screen ('' hides it). */
  prompt(text) {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    this.promptEl.textContent = text;
    this.promptEl.classList.toggle('show', !!text);
    this.touch.querySelector('.use')?.classList.toggle('ready', !!text);
  }

  flashMana() {
    this.mp.classList.remove('flash');
    void this.mp.offsetWidth;
    this.mp.classList.add('flash');
  }


  /** 'start' | 'pause' | 'loading' | 'lost' | null */
  showOverlay(mode, touch) {
    this.overlay.classList.toggle('hidden', !mode);
    this.overlay.classList.toggle('is-touch', !!touch);
    const go = this.overlay.querySelector('.go');
    go.textContent = mode === 'loading' ? 'Raising the village…'
      : (touch ? 'Tap to ' : 'Click to ') + ({ pause: 'resume', lost: 'raise it again — the graphics were lost' }[mode] || 'enter');
    this.overlay.classList.toggle('loading', mode === 'loading');
  }

  /** Where the last run stopped, if it never closed cleanly (see main.js's trace). */
  lastRun(text) {
    const d = el('div', 'lastrun');
    d.textContent = 'Last time it stopped: ' + text;
    this.overlay.append(d);
  }

  /** The loading line, `pct` per cent of the way. */
  loading(pct) { this.overlay.querySelector('.go').textContent = `Raising the village… ${pct}%`; }

  showTouch(on) { this.touch.classList.toggle('hidden', !on); }
}
