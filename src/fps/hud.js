// The HUD and menus, in HTML over the canvas: life and mana in their orbs, the shield's Guard, the
// spell slots, the crosshair, place names, the start/pause screen, and the rotate-to-landscape
// screen for phones. (The inventory and spellbook are bag.js; the chat log chatlog.js.)
//
// The orbs: pixel liquid sloshing in a glass globe, drawn a pixel at a time on a 61x78 canvas (shown
// at twice that, pixelated) under the bronze cradle from the HUD's pixel art (tools/ui/hud.px.js,
// uiart.js): its surface waves, it swirls and catches the light like a sphere, bubbles rise in it,
// the glass shines over it, and the life throbs when it runs low. The spell slots between them wear
// the art's bronze frames, with the Guard, what's in your hands and the experience bar.
import { uiArt } from './uiart.js';

// 12x12 pixel-art spell icons: one character per pixel

/** The keys the spell slots are cast with (Z is the mana potion, Q the life one). */
export const SPELL_KEYS = ['F', 'R', 'X', 'C', 'V'];
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

// ------------------------------------------------------------------ the orbs
const OX = 30, OY = 40, OR = 22.6;        // the liquid's circle in the cradle (orb_life in hud.px.js)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const LIFE = ['#140103', '#340508', '#5c0a0e', '#8a1216', '#bc2219', '#ea4a2c', '#ff9a72'];
const MANA = ['#02031a', '#050e38', '#0a1c62', '#132f94', '#2452c8', '#4c8cff', '#a8d4ff'];
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

class Orb {
  constructor(canvas, ramp, frame) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.img = this.g.createImageData(canvas.width, canvas.height);
    this.ramp = ramp.map(rgb); this.frame = frame;
    this.bubbles = Array.from({ length: 7 }, () => this.bubble({}, true));
    this.t = Math.random() * 10; this.acc = 1;
  }
  bubble(b, any = false) {
    b.x = OX + (Math.random() - 0.5) * 30; b.y = any ? OY + (Math.random() - 0.2) * 40 : OY + 20 + Math.random() * 3;
    b.v = 3 + Math.random() * 6; b.w = Math.random() * 6;
    return b;
  }
  /** frac 0-1 full; throb: 0-1 how hard the low-life pulse beats. */
  draw(frac, dt, throb = 0) {
    this.t += dt;
    if ((this.acc += dt) < 1 / 30 && Math.abs(frac - (this.lastF ?? -1)) < 0.004) return;   // (thirty frames a second is plenty)
    this.acc = 0; this.lastF = frac;
    const W = this.c.width, d = this.img.data, R = this.ramp, n = R.length, t = this.t;
    d.fill(0);
    const top = OY + OR - Math.max(0, Math.min(1, frac)) * OR * 2;
    const pulse = throb * Math.pow(Math.max(0, Math.sin(t * 7)), 3) * 0.22;
    for (const b of this.bubbles) {   // bubbles rise, wobbling, and burst at the top
      b.y -= b.v * dt; b.x += Math.sin(t * 3 + b.w) * dt * 2;
      if (b.y < top + 1 || frac < 0.04) this.bubble(b);
    }
    for (let y = Math.floor(OY - OR); y <= OY + OR; y++) {
      for (let x = Math.floor(OX - OR); x <= OX + OR; x++) {
        const dx = x - OX, dy = y - OY;
        if (dx * dx + dy * dy > OR * OR) continue;
        const nx = dx / OR, ny = dy / OR, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lam = Math.max(0, -0.45 * nx - 0.55 * ny + 0.72 * nz);
        const surf = top + Math.sin(x * 0.42 + t * 2.3) * 0.9 + Math.sin(x * 0.17 - t * 1.4) * 0.8;
        const i = (y * W + x) * 4, dith = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) / n;
        let c, a = 255;
        if (y < surf) {   // the empty glass: dark, a breath of the colour deep in it
          const v = 0.02 + lam * 0.1 + dith;
          c = R[Math.max(0, Math.min(1, Math.floor(v * n)))];
          a = 228;
        } else {
          const swirl = Math.sin(x * 0.38 + t * 1.1 + Math.sin(y * 0.27 - t * 0.8) * 1.6) + Math.sin((x - y) * 0.21 + t * 1.7);
          let v = 0.12 + lam * 0.62 + swirl * 0.08 - (1 - nz) * 0.22 + pulse + dith;
          if (y - surf < 1.3) v += 0.3;   // the surface catches the light
          c = R[Math.max(0, Math.min(n - 1, Math.floor(v * n)))];
        }
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a;
      }
    }
    // the bubbles, the glass's shine (a crescent at the top-left, a glint) over everything
    const put = (x, y, k, rgbA) => {
      x = Math.round(x); y = Math.round(y);
      const dx = x - OX, dy = y - OY;
      if (dx * dx + dy * dy > OR * OR) return;
      const i = (y * W + x) * 4;
      for (let j = 0; j < 3; j++) d[i + j] = d[i + j] + (rgbA[j] - d[i + j]) * k;
      d[i + 3] = Math.max(d[i + 3], 255 * k);
    };
    for (const b of this.bubbles) if (b.y > top + 1) put(b.x, b.y, 0.75, R[n - 1]);
    for (let y = OY - 21; y < OY; y++) for (let x = OX - 21; x < OX; x++) {
      const e = Math.hypot(x - (OX - 4), y - (OY - 6));
      if (e > 13.2 && e < 15.4 && x - OX + (y - OY) < -12) put(x, y, 0.32, [255, 255, 255]);
    }
    put(OX - 12, OY - 10, 0.8, [255, 255, 255]); put(OX - 11, OY - 11, 0.8, [255, 255, 255]); put(OX - 13, OY - 8, 0.45, [255, 255, 255]);
    this.g.putImageData(this.img, 0, 0);
    if (uiArt.has(this.frame)) this.g.drawImage(uiArt.canvas(this.frame, 1), 0, 0);
  }
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
    // the dock along the bottom: the life orb, the slots (with the Guard, your hands and the
    // experience bar), the mana orb
    const dock = this.dock = el('div', 'dock');
    this.hp = this.lifeOrb = el('div', 'orb life', '<canvas width="61" height="78"></canvas><span class="ov"></span>');
    this.mp = el('div', 'orb mana', '<canvas width="61" height="78"></canvas><span class="ov"></span>');
    this.orbs = [new Orb(this.hp.querySelector('canvas'), LIFE, 'orb_life'), new Orb(this.mp.querySelector('canvas'), MANA, 'orb_mana')];
    this.gd = el('div', 'bar gd off', '<i></i><span></span><em>GUARD</em>');
    const mid = el('div', 'dock-mid');
    this.slots = el('div', 'slots');
    this.slotEl = {};
    for (const k of SPELL_KEYS) {
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
    // experience: a thin bar along the bottom, and the banner when a level comes
    this.xpEl = el('div', 'xpbar', '<i></i><span></span>');
    this.banner = el('div', 'banner');
    // the hour of the day, 24-hour, under the corner map
    this.clock = el('div', 'clock', '12:00');
    this.lastClock = '';
    mid.append(this.gd, this.hands, this.slots, this.xpEl);
    dock.append(this.hp, mid, this.mp);
    this.hud.append(dock, this.zoneEl, this.toastEl, this.promptEl, this.bossEl, this.banner, this.clock);
    r.append(this.hud);

    // ---- pause (the title screen, its settings and how to play are title.js's)
    this.overlay = el('div', 'overlay hidden');
    this.overlay.innerHTML = `
      <img class="logo" src="assets/title/bellmourn.webp" alt="Bellmourn: Velscour's Throne" draggable="false">
      <div class="go"></div>
      <div class="menu"></div>`;
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
      <div class="tbtn qlogb" data-code="KeyL">!</div>
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
    for (const k of SPELL_KEYS) {
      const id = book[k], s = this.o.spells[id];
      const slot = this.slotEl[k];
      const img = slot.querySelector('img');
      if (id && this.spellIcons[id]) img.src = this.spellIcons[id];
      img.style.visibility = id && this.spellIcons[id] ? '' : 'hidden';   // (an empty slot: no broken picture)
      slot.querySelector('small').textContent = s ? s.name : '—';
      const t = this.touch.querySelector('.spell' + k + ' img');   // (a phone has buttons for F and R only)
      if (t) { if (id && this.spellIcons[id]) t.src = this.spellIcons[id]; t.style.visibility = id && this.spellIcons[id] ? '' : 'hidden'; }
    }
  }

  update(player, book) {
    const hp = Math.max(0, player.health / player.maxHealth), mp = Math.max(0, player.mana / player.maxMana);
    const now = performance.now() / 1000, dt = Math.min(0.1, now - (this.orbT || now));
    this.orbT = now;
    if (!this.hud.classList.contains('hidden')) {
      this.orbs[0].draw(hp, dt, hp < 0.3 ? 1 - hp / 0.3 : 0);
      this.orbs[1].draw(mp, dt);
    }
    const hv = `<b>${Math.max(0, Math.round(player.health))}</b><small>/${Math.round(player.maxHealth)}</small>`;
    const mv = `<b>${Math.max(0, Math.round(player.mana))}</b><small>/${Math.round(player.maxMana)}</small>`;
    if (hv !== this.hv) { this.hv = hv; this.hp.querySelector('.ov').innerHTML = hv; }
    if (mv !== this.mv) { this.mv = mv; this.mp.querySelector('.ov').innerHTML = mv; }
    this.hp.classList.toggle('low', hp < 0.3);
    for (const k of SPELL_KEYS) {
      const s = this.o.spells[book[k]];
      this.slotEl[k].classList.toggle('low', !!s && player.mana < s.mana);
    }
  }

  /** The clock under the map: the game's hour (0-24, fractional) as HH:MM, military time. */
  clockTime(hour) {
    const m = Math.floor((((hour % 24) + 24) % 24) * 60), t = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    if (t !== this.lastClock) { this.lastClock = t; this.clock.textContent = t; }
  }

  zone(name) {
    if (!name || name === this.lastZone) return;
    this.lastZone = name;
    this.onZone?.(name);   // (the chat log, main.js)
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


  /** 'pause' | 'lost' | null (the title screen is title.js's). The pause screen carries the menu;
   * onMenu(action) is called with the button's action. */
  showOverlay(mode, touch) {
    this.mode = mode;
    this.overlay.classList.toggle('hidden', !mode);
    this.overlay.classList.toggle('is-touch', !!touch);
    const go = this.overlay.querySelector('.go');
    go.textContent = mode === 'lost' ? (touch ? 'Tap' : 'Click') + ' to raise it again — the graphics were lost' : mode === 'pause' ? 'Paused' : '';
    const menu = this.overlay.querySelector('.menu');
    const items = mode === 'pause' ? [['resume', 'Resume'], ['save', 'Save Game'], ['load', 'Load Game'], ['log', 'Quest Log'], ['settings', 'Settings'], ['howto', 'How to Play'], ['new', 'New Game']] : [];
    menu.innerHTML = '';
    for (const [a, label] of items) {
      const b = el('button', a === 'resume' ? 'sel' : '', label);
      b.dataset.action = a;
      b.onclick = (e) => { e.stopPropagation(); this.onMenu?.(a); };
      menu.append(b);
    }
  }

  /** Experience along the bottom: level, and how far to the next. */
  xp(level, have, need) {
    const w = need ? Math.min(100, have / need * 100).toFixed(1) + '%' : '100%';
    if (this.xpEl.dataset.w !== w + level) {
      this.xpEl.dataset.w = w + level;
      this.xpEl.querySelector('i').style.width = w;
      this.xpEl.querySelector('span').textContent = need ? `Level ${level} · ${have} / ${need}` : `Level ${level}`;
    }
  }

  /** The banner across the screen (a level gained). */
  announce(title, sub = '') {
    this.banner.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  showTouch(on) { this.touch.classList.toggle('hidden', !on); }
}
