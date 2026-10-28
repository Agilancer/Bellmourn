// The HUD and menus, in HTML over the canvas: health and mana, the two spell slots (F and R),
// the crosshair, place names, the inventory (one of each weapon type, the gauntlets, the
// spellbook), the start/pause screen, and the rotate-to-landscape screen for phones.

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
    bars.append(this.hp, this.mp);
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
    this.hud.append(bars, this.slots, this.hands, this.zoneEl, this.toastEl);
    r.append(this.hud);

    // ---- inventory
    this.inv = el('div', 'panel inv hidden');
    this.inv.append(el('h2', null, 'Inventory'));
    const close = el('button', 'close', '&times;');
    close.onclick = () => this.o.onClose?.();
    this.inv.append(close);
    this.inv.append(el('h3', null, 'Arms <em>— tap R or L to put it in that hand</em>'));
    this.itemGrid = el('div', 'grid items');
    this.inv.append(this.itemGrid);
    this.inv.append(el('h3', null, 'Gauntlets'));
    this.gauntGrid = el('div', 'grid gaunts');
    this.inv.append(this.gauntGrid);
    this.inv.append(el('h3', null, 'Spellbook <em>— set a spell to F or R, then press that key to cast</em>'));
    this.spellGrid = el('div', 'grid spells');
    this.inv.append(this.spellGrid);
    r.append(this.inv);

    // ---- start / pause
    this.overlay = el('div', 'overlay');
    this.overlay.innerHTML = `
      <div class="title">BELLMOURN</div>
      <div class="sub">the village under the mourning bell</div>
      <div class="go"></div>
      <table class="keys">
        <tr><td>W A S D</td><td>move</td><td>Mouse</td><td>look</td></tr>
        <tr><td>Shift</td><td>run</td><td>Space</td><td>jump</td></tr>
        <tr><td>Left click</td><td>right hand: swing / shoot</td><td>Right click</td><td>left hand: block / swing / shoot</td></tr>
        <tr><td>F &nbsp; R</td><td>cast the spells set to F and R</td><td>Tab / I</td><td>inventory &amp; spellbook</td></tr>
        <tr><td>1 – 6</td><td>quick-equip arms</td><td>Esc</td><td>pause</td></tr>
      </table>
      <div class="touchkeys">Left thumb: move (push far to run) · Right thumb: look · Buttons: attack, left hand, F, R, jump, bag</div>
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
      <div class="tbtn pause" data-code="Escape">&#x275A;&#x275A;</div>`;
    r.append(this.touch);
  }

  setIcons(icons) { this.itemIcons = icons; }

  /** Rebuild the inventory panel's contents for the current equipment. */
  refresh(equip, book, gauntlet) {
    const { items, spells, gauntlets } = this.o;
    this.itemGrid.innerHTML = '';
    for (const [kind, it] of Object.entries(items)) {
      const card = el('div', 'card');
      const inR = equip.R === kind, inL = equip.L === kind || (equip.R === kind && it.both);
      if (inR || inL) card.classList.add('on');
      card.innerHTML = `<img src="${this.itemIcons?.[kind] || ''}" alt=""><div class="nm">${it.name}</div><div class="ty">${it.type}</div>`;
      const row = el('div', 'hb');
      for (const side of ['R', 'L']) {
        const ok = it.hands.includes(side);
        const b = el('button', (side === 'R' ? inR : inL && !it.both) ? 'sel' : '', it.both && side === 'L' ? '2H' : side);
        b.disabled = !ok;
        b.onclick = () => this.o.onEquip(kind, side);
        row.append(b);
      }
      card.append(row);
      this.itemGrid.append(card);
    }
    this.gauntGrid.innerHTML = '';
    for (const g of gauntlets) {
      const b = el('button', 'gaunt' + (g.id === gauntlet ? ' sel' : ''), g.name);
      b.onclick = () => this.o.onGauntlet(g.id);
      this.gauntGrid.append(b);
    }
    this.spellGrid.innerHTML = '';
    for (const [id, s] of Object.entries(spells)) {
      const card = el('div', 'card spell');
      card.innerHTML = `<img src="${this.spellIcons[id]}" alt=""><div class="nm">${s.name}</div>
        <div class="ty">${s.hands === 2 ? 'two hands' : 'one hand'} · ${s.mana} mana</div><div class="ds">${s.desc}</div>`;
      const row = el('div', 'hb');
      for (const slot of ['F', 'R']) {
        const b = el('button', book[slot] === id ? 'sel' : '', slot);
        b.onclick = () => this.o.onAssign(id, slot);
        row.append(b);
      }
      card.append(row);
      this.spellGrid.append(card);
    }
    this.updateSlots(book);
    this.hands.innerHTML = `<span>R</span> ${equip.R ? items[equip.R].name : 'bare hand'}`
      + (items[equip.R]?.both ? '' : ` &nbsp; <span>L</span> ${equip.L ? items[equip.L].name : 'bare hand'}`);
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

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  flashMana() {
    this.mp.classList.remove('flash');
    void this.mp.offsetWidth;
    this.mp.classList.add('flash');
  }

  get invOpen() { return !this.inv.classList.contains('hidden'); }
  showInventory(on) { this.inv.classList.toggle('hidden', !on); }

  /** 'start' | 'pause' | 'loading' | null */
  showOverlay(mode, touch) {
    this.overlay.classList.toggle('hidden', !mode);
    this.overlay.classList.toggle('is-touch', !!touch);
    const go = this.overlay.querySelector('.go');
    go.textContent = mode === 'loading' ? 'Raising the village…'
      : (touch ? 'Tap to ' : 'Click to ') + (mode === 'pause' ? 'resume' : 'enter');
    this.overlay.classList.toggle('loading', mode === 'loading');
  }

  showTouch(on) { this.touch.classList.toggle('hidden', !on); }
}
