// The HUD and menus, in HTML over the canvas: health and mana, the two spell slots (F and R),
// the crosshair, place names, the inventory (the bag, one of each weapon type, the gauntlets,
// the spellbook), the window of a container being searched beside the bag, the start/pause
// screen, and the rotate-to-landscape screen for phones.
import { describe } from './items.js';

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
  /** opts: {spells, items, gauntlets, icons, onEquip(kind, side), onAssign(spell, slot), onGauntlet(id),
   *   bag, iconOf(item) (a URL, or '' while it's drawn), onMove(from, to), onUse(from), onTakeAll(),
   *   onCloseLoot()} - from and to are {grid: 'bag' | 'loot', i} (i -1: anywhere in it) */
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
    this.promptEl = el('div', 'prompt');
    this.hud.append(bars, this.slots, this.hands, this.zoneEl, this.toastEl, this.promptEl);
    r.append(this.hud);

    // ---- inventory
    this.inv = el('div', 'panel inv hidden');
    this.inv.append(el('h2', null, 'Inventory'));
    const close = el('button', 'close', '&times;');
    close.onclick = () => this.o.onClose?.();
    this.inv.append(close);
    this.bagHead = el('h3', null, '');
    this.bagGrid = el('div', 'grid bag');
    this.bagInfo = el('div', 'binfo', '&nbsp;');
    this.inv.append(this.bagHead, this.bagGrid, this.bagInfo);
    const more = el('div', 'more');
    more.append(el('h3', null, 'Arms <em>— tap R or L to put it in that hand</em>'));
    this.itemGrid = el('div', 'grid items');
    more.append(this.itemGrid);
    more.append(el('h3', null, 'Gauntlets'));
    this.gauntGrid = el('div', 'grid gaunts');
    more.append(this.gauntGrid);
    more.append(el('h3', null, 'Spellbook <em>— set a spell to F or R, then press that key to cast</em>'));
    this.spellGrid = el('div', 'grid spells');
    more.append(this.spellGrid);
    this.inv.append(more);
    r.append(this.inv);

    // ---- what's in the container being searched
    this.lootP = el('div', 'panel lootp hidden');
    this.lootTitle = el('h2');
    const lclose = el('button', 'close', '&times;');
    lclose.onclick = () => this.o.onCloseLoot?.();
    this.lootGrid = el('div', 'grid bag');
    this.lootInfo = el('div', 'binfo', '&nbsp;');
    const take = el('button', 'takeall', 'Take all');
    take.onclick = () => this.o.onTakeAll?.();
    this.lootEmpty = el('div', 'lempty', 'Nothing left in it.');
    this.lootP.append(this.lootTitle, lclose, el('h3', null, 'Inside <em>— drag into your bag, or double-click</em>'), this.lootGrid, this.lootEmpty, this.lootInfo, take);
    r.append(this.lootP);
    this.dragging();

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
        <tr><td>E</td><td>doors; search pots, crates &amp; chests</td><td>1 – 6</td><td>quick-equip arms</td></tr>
        <tr><td>Esc</td><td>pause</td><td></td><td></td></tr>
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
      <div class="tbtn use" data-code="KeyE">E</div>
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
      const models = this.o.models?.(kind) || [];
      if (models.length > 1) { // which model this weapon is
        const pick = el('select', 'mdl');
        const list = models.some((m) => m.id === it.id) ? models : [{ id: it.id, name: it.name }, ...models];
        for (const m of list) pick.append(new Option(m.name, m.id, false, m.id === it.id));
        pick.onchange = () => this.o.onModel?.(kind, pick.value);
        card.append(pick);
      }
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
        <div class="ty">${s.hands === 2 ? 'two hands' : 'one hand'} · ${s.mana} mana${s.drain ? ` + ${s.drain}/s held` : ''}</div><div class="ds">${s.desc}</div>`;
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

  get invOpen() { return !this.inv.classList.contains('hidden'); }
  showInventory(on) {
    this.inv.classList.toggle('hidden', !on);
    if (!on) this.closeLoot();
    else this.refreshBag();
  }

  // ---- the bag, and searching
  get lootOpen() { return !!this.looting; }

  /** Search container c: its window, with the bag beside it. */
  openLoot(c) {
    this.looting = c;
    this.lootTitle.textContent = c.name[0].toUpperCase() + c.name.slice(1);
    this.lootP.classList.remove('hidden');
    this.inv.classList.add('looting');
    this.inv.classList.remove('hidden');
    this.refreshBag();
  }

  closeLoot() {
    this.looting = null;
    this.lootP.classList.add('hidden');
    this.inv.classList.remove('looting');
  }

  /** Redraw the bag (and the container's slots while searching). */
  refreshBag() {
    const bag = this.o.bag;
    if (!bag) return;
    this.bagHead.innerHTML = `Bag <span class="gold">${bag.count('gold')} gold</span>`;
    this.bagInfo.innerHTML = this.lootInfo.innerHTML = '&nbsp;';
    this.fillGrid(this.bagGrid, bag, 'bag');
    if (this.looting) {
      this.fillGrid(this.lootGrid, this.looting.bag, 'loot');
      this.lootEmpty.style.display = this.looting.bag.empty ? '' : 'none';
    }
  }

  fillGrid(grid, bag, name) {
    grid.innerHTML = '';
    bag.slots.forEach((it, i) => {
      const s = el('div', 'bslot' + (it ? ' full' : ''));
      s.dataset.grid = name; s.dataset.i = i;
      if (it) {
        const d = describe(it);
        if (d.tint) s.style.setProperty('--tint', d.tint);
        s.innerHTML = `<img alt="" draggable="false" src="${this.o.iconOf?.(it) || ''}">${it.n > 1 ? `<b>${it.n}</b>` : ''}`;
        s.title = d.name;
      }
      grid.append(s);
    });
  }

  /** The name of the thing under the pointer, under its grid. */
  info(slot) {
    const it = slot && (slot.dataset.grid === 'bag' ? this.o.bag : this.looting?.bag)?.slots[slot.dataset.i];
    let line = '&nbsp;';
    if (it) { const d = describe(it); line = `<b>${d.name}${it.n > 1 ? ' ×' + it.n : ''}</b> — ${d.type}`; }
    (slot?.dataset.grid === 'loot' ? this.lootInfo : this.bagInfo).innerHTML = line;
  }

  /** Dragging things between slots and windows (mouse or finger), and double-clicks/taps. */
  dragging() {
    let down = null, ghost = null, last = { t: 0, key: '' };
    const at = (s) => ({ grid: s.dataset.grid, i: Number(s.dataset.i) });
    this.root.addEventListener('pointerover', (e) => { const s = e.target.closest?.('.bslot'); if (s && !down) this.info(s); });
    this.root.addEventListener('pointerdown', (e) => {
      const s = e.target.closest?.('.bslot.full');
      if (!s || e.button > 0) return;
      e.preventDefault();
      down = { s, from: at(s), x: e.clientX, y: e.clientY };
      this.info(s);
    });
    addEventListener('pointermove', (e) => {
      if (!down) return;
      if (!ghost && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
        ghost = el('div', 'bghost', down.s.innerHTML);
        ghost.style.setProperty('--tint', down.s.style.getPropertyValue('--tint'));
        this.root.append(ghost);
        down.s.classList.add('lifted');
      }
      if (ghost) { ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; }
    });
    addEventListener('pointerup', (e) => {
      if (!down) return;
      const d = down;
      down = null;
      if (ghost) { // dropped: on a slot, or anywhere on the other window
        ghost.remove(); ghost = null;
        d.s.classList.remove('lifted');
        const t = document.elementFromPoint(e.clientX, e.clientY);
        const slot = t?.closest?.('.bslot');
        const to = slot ? at(slot) : t?.closest?.('.lootp') ? { grid: 'loot', i: -1 } : t?.closest?.('.inv') ? { grid: 'bag', i: -1 } : null;
        if (to && !(to.grid === d.from.grid && to.i === d.from.i)) this.o.onMove?.(d.from, to);
        return;
      }
      const key = d.from.grid + d.from.i, now = performance.now();
      if (key === last.key && now - last.t < 380) { last.key = ''; this.o.onUse?.(d.from); }
      else last = { t: now, key };
    });
    addEventListener('pointercancel', () => {
      if (ghost) { ghost.remove(); ghost = null; down?.s.classList.remove('lifted'); }
      down = null;
    });
  }

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
