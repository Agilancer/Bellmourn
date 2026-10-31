// The inventory, after Velscour's: the paper doll (head, weapon, body, off-hand, hands, legs,
// feet and four rings round the figure), the bag (forty places), the selected item's card with
// what you can do with it, and the character's numbers. Drag an item onto a slot or another
// place in the bag (mouse or finger); click to look at it; double-click (or right-click) to put
// it on or take it off; drag it out of the window to drop it. Potions drink on double-click.
// The spellbook is the second tab.
import { SLOTS, SLOT_NAMES, RARITY, ENCHANTS, statLabel, itemColor, fitsSlot, slotFor, itemValue } from './gear.js';

const DOLL = { head: [2, 1], weapon: [1, 2], body: [2, 2], offhand: [3, 2], hands: [1, 3], legs: [2, 3], feet: [2, 4],
  ring1: [4, 1], ring2: [4, 2], ring3: [4, 3], ring4: [4, 4] };

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ pixel icons for the worn things
// 16x16, one character a pixel; the palette is tinted per item (m: metal, d: dark, l: light, a: accent)
const PX = {
  hood: ['....dddddd......', '...dmmmmmmd.....', '..dmmllmmmmd....', '..dmllmmmmmmd...', '.dmmlmddddmmmd..', '.dmmmd....dmmd..', '.dmmd......dmd..', '.dmmd......dmd..',
    '.dmmmd....dmmd..', '..dmmmddddmmd...', '..dmmmmmmmmmd...', '.dmmmmmmmmmmmd..', '.dmmmmmmmmmmmmd.', 'dmmmmmmmmmmmmmd.', 'dddddddddddddddd', '................'],
  cap: ['................', '................', '.....dddddd.....', '...ddmmmmmmdd...', '..dmmlllmmmmmd..', '..dmlmmmmmmmmd..', '.dmmmmmmmmmmmmd.', '.dmmmmmmmmmmmmd.',
    '.daaaaaaaaaaaad.', '.dddddddddddddd.', '................', '................', '................', '................', '................', '................'],
  kettle: ['................', '......dddd......', '....ddmmmmdd....', '...dmmllmmmmd...', '...dmlmmmmmmd...', '...dmmmmmmmmd...', '..dmmmmmmmmmmd..', 'dddmmmmmmmmmmddd',
    'dmmmmmmmmmmmmmmd', 'dddddddddddddddd', '................', '................', '................', '................', '................', '................'],
  sallet: ['................', '.....dddddd.....', '...ddmmmmmmdd...', '..dmmllmmmmmmd..', '..dmlmmmmmmmmd..', '.dmmmmmmmmmmmmd.', '.dmmddddddddmmd.', '.dmd........dmd.',
    '.dmmddddddddmmd.', '.dmmmmmmmmmmmmmd', '..dmmmmmmmmmmmmd', '...ddmmmmmmmmmd.', '.....ddddddddd..', '................', '................', '................'],
  great: ['....dddddddd....', '...dmmmmmmmmd...', '..dmllmmmmmmmd..', '..dmlmmmmmmmmd..', '..dmmmmmmmmmmd..', '..dddddddddddd..', '..dmmdmmmmdmmd..', '..dddddddddddd..',
    '..dmmmmammmmmd..', '..dmmmmammmmmd..', '..dmmmmammmmmd..', '..dmmmmmmmmmmd..', '..dmmmmmmmmmmd..', '...dmmmmmmmmd...', '....dddddddd....', '................'],
  tunic: ['................', '...ddd....ddd...', '..dmmmd..dmmmd..', '.dmmmmmddmmmmmd.', 'dmmmmmmmmmmmmmmd', 'dmmdmmmmmmmmdmmd', '.dd.dmmmmmmd.dd.', '....dmmmmmmd....',
    '....dmmmmmmd....', '....daaaaaad....', '....dmmmmmmd....', '...dmmmmmmmmd...', '...dmmmmmmmmd...', '..dmmmmmmmmmmd..', '..dddddddddddd..', '................'],
  gambeson: ['................', '...ddd....ddd...', '..dmlmd..dmmmd..', '.dmmlmmddmmmmmd.', 'dmmmlmmmmmmmmmmd', 'dmmdldmdmdmmdmmd', '.dd.dmdmdmdd.dd.', '....dmdmdmdd....',
    '....dmdmdmdd....', '....dmdmdmdd....', '....dmdmdmdd....', '...dmdmdmdmdd...', '...dmdmdmdmdd...', '...dddddddddd...', '................', '................'],
  mail: ['................', '...ddd....ddd...', '..dmlmd..dmlmd..', '.dmlmlmddmlmlmd.', 'dmlmlmlmlmlmlmld', 'dmldmlmlmlmldmld', '.dd.dlmlmlmd.dd.', '....dmlmlmld....',
    '....dlmlmlmd....', '....dmlmlmld....', '....dlmlmlmd....', '...dmlmlmlmld...', '...dlmlmlmlmd...', '...dddddddddd...', '................', '................'],
  brigandine: ['................', '...ddd....ddd...', '..dmmmd..dmmmd..', '.dmmmmmddmmmmmd.', 'dmmammmmmmmmammd', 'dmmdmmammammdmmd', '.dd.dmmmmmmd.dd.', '....dammammad....',
    '....dmmmmmmd....', '....dammammad....', '....dmmmmmmd....', '...dmmmmmmmmd...', '...dmmmmmmmmd...', '...dddddddddd...', '................', '................'],
  plate: ['................', '..dddd....dddd..', '.dmmmmd..dmmmmd.', 'dmlllmmddmmmmmmd', 'dmlmmmmmmmmmmmmd', 'dmmdmllmmmmmdmmd', '.dd.dlmmmmmd.dd.', '....dmmmmmmd....',
    '....ddddddddd...', '....dmmmmmmd....', '....ddddddddd...', '...dmmmmmmmmd...', '...dmmmmmmmmd...', '...dddddddddd...', '................', '................'],
  breeches: ['................', '...dddddddddd...', '...daaaaaaaad...', '...dmmmmmmmmd...', '...dmmmmmmmmd...', '...dmmmddmmmd...', '...dmmd..dmmd...', '...dmmd..dmmd...',
    '...dmmd..dmmd...', '...dmmd..dmmd...', '...dmmd..dmmd...', '...dmmd..dmmd...', '...dddd..dddd...', '................', '................', '................'],
  chausses: ['................', '...dddddddddd...', '...daaaaaaaad...', '...dmlmmmmlmd...', '...dmlmmmmlmd...', '...dmlmddmlmd...', '...dmld..dmld...', '...dmld..dmld...',
    '...dmld..dmld...', '...dmld..dmld...', '...dmld..dmld...', '...dmmd..dmmd...', '...dddd..dddd...', '................', '................', '................'],
  mailLegs: ['................', '...dddddddddd...', '...daaaaaaaad...', '...dmlmlmlmld...', '...dlmlmlmlmd...', '...dmlmddmlmd...', '...dlmd..dlmd...', '...dmld..dmld...',
    '...dlmd..dlmd...', '...dmld..dmld...', '...dlmd..dlmd...', '...dmld..dmld...', '...dddd..dddd...', '................', '................', '................'],
  greaves: ['................', '...dddddddddd...', '...daaaaaaaad...', '...dmmmmmmmmd...', '...dmlmmmmlmd...', '...dmlmddmlmd...', '...ddddd.ddddd..', '...dmld..dmld...',
    '...dmld..dmld...', '...dlmd..dlmd...', '...dmmd..dmmd...', '...dmmd..dmmd...', '...dddd..dddd...', '................', '................', '................'],
  shoes: ['................', '................', '................', '................', '................', '................', '................', '...dddd...dddd..',
    '...dmmd...dmmd..', '...dmmd...dmmd..', '..dmmmd..dmmmd..', '.dmmmmd.dmmmmd..', '.dmlmmd.dmlmmd..', '.daaaad.daaaad..', '.dddddd.dddddd..', '................'],
  boots: ['................', '................', '...dddd...dddd..', '...dmmd...dmmd..', '...dlmd...dlmd..', '...dmmd...dmmd..', '...dmmd...dmmd..', '...dmmd...dmmd..',
    '...dmmd...dmmd..', '...dmmd...dmmd..', '..dmmmd..dmmmd..', '.dmmmmd.dmmmmd..', '.dmlmmd.dmlmmd..', '.daaaad.daaaad..', '.dddddd.dddddd..', '................'],
  hobnail: ['................', '................', '...dddd...dddd..', '...daad...daad..', '...dmmd...dmmd..', '...dlmd...dlmd..', '...dmmd...dmmd..', '...dmmd...dmmd..',
    '...dmmd...dmmd..', '...dmmd...dmmd..', '..dmmmd..dmmmd..', '.dmmmmd.dmmmmd..', '.dmlmmd.dmlmmd..', '.dmmmmd.dmmmmd..', '.dadada.dadada..', '................'],
  sabatons: ['................', '................', '...dddd...dddd..', '...dmmd...dmmd..', '...dlmd...dlmd..', '...dddd...dddd..', '...dmmd...dmmd..', '...dlmd...dlmd..',
    '...dddd...dddd..', '..dmmmd..dmmmd..', '.dmlmmd.dmlmmd..', '.ddddddddddddd..', '.dmlmmd.dmlmmd..', '.dmmmmd.dmmmmd..', '.dddddd.dddddd..', '................'],
  ring: ['................', '................', '................', '......aaa.......', '.....alaaa......', '......aaa.......', '.....dmmmd......', '....dm...md.....',
    '...dm.....md....', '...dm.....md....', '...dm.....md....', '....dm...md.....', '.....dmmmd......', '................', '................', '................'],
  gauntlet: ['................', '.....d.d.d......', '....dmdmdmd.....', '....dmdmdmdd....', '....dmmmmmmd.dd.', '....dmlmmmmddmd.', '....dmlmmmmmmd..', '....dmmmmmmmd...',
    '....dddddddd....', '....dmamamad....', '....dmmmmmmd....', '....dmmmmmmd....', '....dmlmmmmd....', '....dmmmmmmd....', '....dddddddd....', '................'],
  potion: ['................', '......ddd.......', '......dmd.......', '......ddd.......', '......dld.......', '.....daaad......', '....daaaaad.....', '...daalaaaad....',
    '...dalaaaaad....', '...daaaaaaad....', '...daaaaaaad....', '...daaaaaaad....', '....daaaaad.....', '.....ddddd......', '................', '................'],
};
const TINT = {
  hood: { m: '#5a4a3a', d: '#1a120c', l: '#7a6a50', a: '#8a6a40' }, cap: { m: '#6a4a2a', d: '#1e140a', l: '#8a6a40', a: '#a07040' },
  kettle: { m: '#8a8e94', d: '#22262a', l: '#c8ccd0', a: '#6a5a40' }, sallet: { m: '#9aa0a8', d: '#202428', l: '#d8dce0', a: '#6a5a40' },
  great: { m: '#9aa0a8', d: '#1a1d20', l: '#e0e4e8', a: '#c8a040' }, tunic: { m: '#6a5a40', d: '#1e160c', l: '#8a7a58', a: '#4a3020' },
  gambeson: { m: '#a08a60', d: '#2a2014', l: '#c8b080', a: '#5a4428' }, mail: { m: '#8a9096', d: '#24282c', l: '#b8c0c8', a: '#5a4a30' },
  brigandine: { m: '#6a3020', d: '#1e0c08', l: '#8a4a30', a: '#c8b060' }, plate: { m: '#a0a6ae', d: '#1c2024', l: '#e8ecf0', a: '#6a5a40' },
  breeches: { m: '#5a4a34', d: '#1a120a', l: '#7a6a4a', a: '#3a2818' }, chausses: { m: '#8a7a5a', d: '#241c10', l: '#b0a07a', a: '#4a3820' },
  mailLegs: { m: '#8a9096', d: '#24282c', l: '#b8c0c8', a: '#5a4a30' }, greaves: { m: '#a0a6ae', d: '#1c2024', l: '#e8ecf0', a: '#5a4a30' },
  shoes: { m: '#5a3a22', d: '#1a0e06', l: '#7a5a3a', a: '#3a2412' }, boots: { m: '#4a2e1a', d: '#160c04', l: '#6a4a2e', a: '#2a1a0c' },
  hobnail: { m: '#4a2e1a', d: '#160c04', l: '#6a4a2e', a: '#9aa0a8' }, sabatons: { m: '#9aa0a8', d: '#1c2024', l: '#e0e4e8', a: '#5a4a30' },
  ringIron: { m: '#6a6e74', d: '#22262a', l: '#a0a4aa', a: '#c83030' }, ringSilver: { m: '#c0c6cc', d: '#40464c', l: '#ffffff', a: '#4a7aff' },
  ringBone: { m: '#d8ccaa', d: '#5a5040', l: '#f4ecd8', a: '#30c060' }, ringGold: { m: '#d8a838', d: '#5a3a08', l: '#fff0a0', a: '#c030ff' },
  life: { m: '#b0b0b0', d: '#2a1a1a', l: '#ffd0d0', a: '#c81c1c' }, mana: { m: '#b0b0b0', d: '#1a1a2a', l: '#d0d8ff', a: '#2c4ac8' },
};
const pxCache = new Map();
export function pixelIcon(shape, tint, scale = 4) {
  const key = shape + '|' + JSON.stringify(tint);
  if (pxCache.has(key)) return pxCache.get(key);
  const rows = PX[shape] || PX.ring, c = document.createElement('canvas');
  c.width = c.height = 16 * scale;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = tint[ch] || '#f0f'; g.fillRect(x * scale, y * scale, scale, scale);
  }));
  const url = c.toDataURL();
  pxCache.set(key, url);
  return url;
}
const GAUNT_TINT = { wayfarer: '#7a5a3a', hunter: '#5a4a2a', mailed: '#8a9096', knight: '#a0a6ae', templar: '#d8b048', brawler: '#5a5a60',
  boneward: '#d8ccaa', drake: '#4a7a40', fiend: '#8a2a20', runebound: '#4a5aa0' };

export class Bag {
  /** opts: {char(), stats(), icon(item, done) -> url|null, onChange(), onUse(idx), onDrop(idx),
   * spells, spellIcons, book(), onAssign(spell, slot), onClose()} */
  constructor(root, opts) {
    this.o = opts;
    this.sel = null;          // {where: 'bag'|'equip', idx|slot}
    this.tab = 'gear';
    const p = this.panel = el('div', 'panel inv bag hidden');
    const close = el('button', 'close', '&times;');
    close.onclick = () => opts.onClose?.();
    const tabs = el('div', 'tabs');
    this.tabBtn = {};
    for (const [k, label] of [['gear', 'Inventory &amp; Character'], ['spells', 'Spellbook']]) {
      const b = el('button', '', label);
      b.onclick = () => { this.tab = k; this.render(); };
      this.tabBtn[k] = b;
      tabs.append(b);
    }
    this.body = el('div', 'bag-body');
    p.append(close, tabs, this.body);
    this.tip = el('div', 'tt hidden');
    root.append(p, this.tip);
    this.drag = null;
    addEventListener('pointermove', (e) => this.dragMove(e));
    addEventListener('pointerup', (e) => this.dragEnd(e));
  }

  get open() { return !this.panel.classList.contains('hidden'); }
  show(on) { this.panel.classList.toggle('hidden', !on); this.tip.classList.add('hidden'); if (on) this.render(); }

  item(ref) {
    const c = this.o.char();
    if (!ref) return null;
    return ref.where === 'bag' ? c.bag[ref.idx] : c.equip[ref.slot];
  }

  // -------------------------------------------------------------- moving things about
  equipFromBag(idx, slot) {
    const c = this.o.char(), it = c.bag[idx];
    if (!it || it.type !== 'gear') return false;
    const to = slot && fitsSlot(it, slot) ? slot : slotFor(c.equip, it);
    const old = c.equip[to];
    c.equip[to] = it;
    c.bag[idx] = old || null;
    // a two-hander takes both hands: the off-hand goes back in the bag (and a shield taken up
    // puts a two-hander away)
    if (to === 'weapon' && it.kind === 'twohand' && c.equip.offhand) this.stow('offhand');
    if (to === 'offhand' && c.equip.weapon?.kind === 'twohand') this.stow('weapon');
    this.sel = { where: 'equip', slot: to };
    this.changed();
    return true;
  }

  stow(slot) {
    const c = this.o.char();
    const i = c.bag.findIndex((b) => !b);
    if (i < 0) return false;
    c.bag[i] = c.equip[slot];
    c.equip[slot] = null;
    return true;
  }

  unequip(slot, toIdx) {
    const c = this.o.char(), it = c.equip[slot];
    if (!it) return false;
    if (toIdx !== undefined && c.bag[toIdx]) {   // onto an item: swap if it fits
      const other = c.bag[toIdx];
      if (fitsSlot(other, slot)) { c.bag[toIdx] = it; c.equip[slot] = other; this.changed(); return true; }
    }
    const i = toIdx !== undefined && !c.bag[toIdx] ? toIdx : c.bag.findIndex((b) => !b);
    if (i < 0) { this.o.toast?.('Your bag is full'); return false; }
    c.bag[i] = it;
    c.equip[slot] = null;
    this.sel = { where: 'bag', idx: i };
    this.changed();
    return true;
  }

  use(idx) {
    const c = this.o.char(), it = c.bag[idx];
    if (!it) return;
    if (it.type === 'gear') this.equipFromBag(idx);
    else if (it.type === 'potion') { this.o.onUse?.(idx); this.changed(); }
  }

  dropOnBag(idx, data) {
    const c = this.o.char();
    if (data.where === 'bag') {
      if (data.idx === idx) return;
      [c.bag[data.idx], c.bag[idx]] = [c.bag[idx], c.bag[data.idx]];
      this.sel = { where: 'bag', idx };
      this.changed();
    } else this.unequip(data.slot, idx);
  }

  dropOnEquip(slot, data) {
    if (data.where !== 'bag') {
      // ring to ring
      const c = this.o.char();
      if (data.slot !== slot && fitsSlot(c.equip[data.slot], slot)) { [c.equip[data.slot], c.equip[slot]] = [c.equip[slot], c.equip[data.slot]]; this.changed(); }
      return;
    }
    const it = this.o.char().bag[data.idx];
    if (!fitsSlot(it, slot)) { this.o.toast?.(`That doesn't go there`); return; }
    this.equipFromBag(data.idx, slot);
  }

  sort() {
    const c = this.o.char();
    const items = c.bag.filter(Boolean);
    const rank = (it) => (it.type === 'gear' ? 0 : it.type === 'potion' ? 1 : 2);
    items.sort((a, b) => rank(a) - rank(b) || (b.rarity || 0) - (a.rarity || 0) || (a.slot || '').localeCompare(b.slot || '') || (b.ilvl || 0) - (a.ilvl || 0));
    c.bag = c.bag.map((_, i) => items[i] || null);
    this.sel = null;
    this.changed();
  }

  changed() { this.o.onChange?.(); this.render(); }

  // -------------------------------------------------------------- drag and drop (mouse and touch)
  grab(e, data, cell) {
    if (e.button === 2) return;
    this.drag = { data, x0: e.clientX, y0: e.clientY, cell, ghost: null, moved: false };
  }

  dragMove(e) {
    const d = this.drag;
    if (!d) { this.tipMove(e); return; }
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 7) return;
    if (!d.moved) {
      d.moved = true;
      const img = d.cell.querySelector('img');
      d.ghost = el('div', 'ghost');
      if (img) d.ghost.append(img.cloneNode());
      document.body.append(d.ghost);
      this.tip.classList.add('hidden');
    }
    d.ghost.style.left = e.clientX - 22 + 'px';
    d.ghost.style.top = e.clientY - 22 + 'px';
  }

  dragEnd(e) {
    const d = this.drag;
    this.drag = null;
    if (!d || !d.moved) return;
    d.ghost?.remove();
    const at = document.elementFromPoint(e.clientX, e.clientY);
    const cell = at?.closest('[data-bag], [data-slot]');
    if (cell?.dataset.bag !== undefined) this.dropOnBag(Number(cell.dataset.bag), d.data);
    else if (cell?.dataset.slot) this.dropOnEquip(cell.dataset.slot, d.data);
    else if (!at?.closest('.panel.bag') && d.data.where === 'bag') { this.o.onDrop?.(d.data.idx); this.sel = null; this.changed(); }
  }

  // -------------------------------------------------------------- drawing
  cellFor(it, ref) {
    const d = el('div', 'icell');
    if (!it) return d;
    const img = new Image();
    img.draggable = false;
    img.alt = '';
    const url = this.iconOf(it, () => this.render());
    if (url) img.src = url;
    d.append(img);
    if (it.type === 'potion' && it.count > 1) d.append(el('span', 'stack', 'x' + it.count));
    return d;
  }

  iconOf(it, again) {
    if (it.type === 'potion') return pixelIcon('potion', TINT[it.kind] || TINT.life);
    if (it.kind === 'gauntlet') { const m = GAUNT_TINT[it.model] || '#7a5a3a'; return pixelIcon('gauntlet', { m, d: '#141010', l: '#e8e0d0', a: '#2a2420' }); }
    if (it.icon) return pixelIcon(PX[it.icon] ? it.icon : 'ring', TINT[it.icon] || TINT.tunic);
    return this.o.icon?.(it, again) || null;
  }

  rclass(it) { return it ? (it.type === 'gear' ? 'r' + it.rarity : 'r0') : ''; }

  render() {
    if (!this.open) return;
    for (const [k, b] of Object.entries(this.tabBtn)) b.classList.toggle('sel', k === this.tab);
    this.body.innerHTML = '';
    if (this.tab === 'spells') { this.renderSpells(); return; }
    const c = this.o.char();
    const wrap = el('div', 'inv-wrap');
    // the doll and the card
    const left = el('div', 'col');
    const doll = el('div', 'paperdoll');
    const fig = el('div', 'figure', '<svg viewBox="0 0 40 80"><circle cx="20" cy="9" r="6.5"/><path d="M8 20 Q20 15 32 20 L35 44 L30 45 L28 30 L27 50 L29 78 L23 78 L20 54 L17 78 L11 78 L13 50 L12 30 L10 45 L5 44 Z"/></svg>');
    fig.style.gridColumn = 3; fig.style.gridRow = '3 / span 2';
    doll.append(fig);
    for (const s of SLOTS) {
      const it = c.equip[s], d = el('div', 'eslot ' + this.rclass(it));
      d.dataset.slot = s;
      const [cx, cy] = DOLL[s];
      d.style.gridColumn = cx; d.style.gridRow = cy;
      if (this.sel?.where === 'equip' && this.sel.slot === s) d.classList.add('sel');
      if (it) d.append(this.cellFor(it)); else d.append(el('span', 'lbl', SLOT_NAMES[s]));
      // a two-hander's shadow in the off-hand
      if (s === 'offhand' && !it && c.equip.weapon?.kind === 'twohand') { d.classList.add('ghosted'); d.append(this.cellFor(c.equip.weapon)); }
      this.wire(d, it ? { where: 'equip', slot: s } : null, () => this.unequip(s));
      doll.append(d);
    }
    left.append(doll, this.detail());
    // the bag
    const mid = el('div', 'col');
    const bag = el('div', 'bagrid');
    c.bag.forEach((it, i) => {
      const d = el('div', 'bslot ' + this.rclass(it));
      d.dataset.bag = i;
      if (this.sel?.where === 'bag' && this.sel.idx === i) d.classList.add('sel');
      if (it) d.append(this.cellFor(it));
      this.wire(d, it ? { where: 'bag', idx: i } : null, () => this.use(i));
      bag.append(d);
    });
    const info = el('div', 'row');
    const pot = (k) => c.bag.filter((b) => b?.type === 'potion' && b.kind === k).reduce((a, b) => a + b.count, 0);
    info.innerHTML = `<span class="gold">&#9673; ${c.gold} gold</span><span class="dim">Draughts: <b style="color:#ff6a5a">${pot('life')}</b> healing (Q) · <b style="color:#7a9aff">${pot('mana')}</b> mana (Z)</span>`;
    const sortB = el('button', 'small', 'Sort');
    sortB.onclick = () => this.sort();
    info.append(sortB);
    mid.append(bag, info);
    wrap.append(left, mid, this.statsBlock());
    this.body.append(wrap);
  }

  /** Clicks, double-clicks, right-clicks, drags and hover tips on a cell. */
  wire(d, ref, quick) {
    d.onpointerdown = (e) => { if (ref) this.grab(e, ref, d); };
    d.onclick = () => { this.sel = ref; this.render(); };
    d.ondblclick = () => { if (ref) quick(); };
    d.oncontextmenu = (e) => { e.preventDefault(); if (ref) quick(); };
    if (ref) {
      d.onpointerenter = (e) => { if (e.pointerType === 'mouse' && !this.drag) this.showTip(ref, e); };
      d.onpointerleave = () => this.tip.classList.add('hidden');
    }
  }

  showTip(ref, e) {
    const it = this.item(ref);
    if (!it) return;
    const c = this.o.char();
    const cmp = ref.where === 'bag' && it.type === 'gear' ? c.equip[slotFor(c.equip, it)] : null;
    this.tip.innerHTML = tooltip(it, { compare: cmp, hint: ref.where === 'bag' ? (it.type === 'gear' ? 'Double-click to put it on' : 'Double-click to drink') : 'Double-click to take it off' });
    this.tip.classList.remove('hidden');
    this.tipMove(e);
  }

  tipMove(e) {
    if (this.tip.classList.contains('hidden')) return;
    const r = this.tip.getBoundingClientRect();
    let x = e.clientX + 16, y = e.clientY + 12;
    if (x + r.width > innerWidth - 4) x = e.clientX - r.width - 12;
    if (y + r.height > innerHeight - 4) y = innerHeight - r.height - 4;
    this.tip.style.left = x + 'px'; this.tip.style.top = Math.max(4, y) + 'px';
  }

  detail() {
    const box = el('div', 'item-detail');
    const it = this.item(this.sel);
    if (!it) { box.innerHTML = '<div class="dim">Tap or click a thing to look at it. Drag to put it on, move it, or (out of the window) drop it. Double-click to put on, take off or drink.</div>'; return box; }
    const c = this.o.char();
    box.innerHTML = tooltip(it, { compare: this.sel.where === 'bag' && it.type === 'gear' ? c.equip[slotFor(c.equip, it)] : null });
    const row = el('div', 'row');
    const btn = (label, fn, cls = 'small') => { const b = el('button', cls, label); b.onclick = fn; row.append(b); };
    if (this.sel.where === 'bag') {
      const i = this.sel.idx;
      if (it.type === 'gear') btn('Put on', () => this.equipFromBag(i));
      if (it.type === 'potion') btn('Drink', () => this.use(i));
      btn('Drop', () => { this.o.onDrop?.(i); this.sel = null; this.changed(); }, 'small red');
    } else {
      const s = this.sel.slot;
      btn('Take off', () => this.unequip(s));
    }
    box.append(row);
    return box;
  }

  statsBlock() {
    const st = this.o.stats(), p = this.o.player?.();
    const box = el('div', 'col stats');
    const [a, b] = st.weapon;
    const k = 1 + st.dmgPct / 100;
    const rows = [
      ['Life', p ? `${Math.round(p.health)} / ${st.maxLife}` : st.maxLife], ['Mana', p ? `${Math.round(p.mana)} / ${st.maxMana}` : st.maxMana],
      ['Damage', `${Math.round((a + st.dmg) * k)}–${Math.round((b + st.dmg) * k)}`], ['Critical', `${st.crit.toFixed(0)}% / +${Math.round(st.critDmg)}%`],
      ['Spell Damage', `+${Math.round(st.spellPct)}%`], ['Armour', `${st.armor} (${Math.round(armorCut(st.armor) * 100)}% less hurt)`],
      ['Guard', st.shield ? `${st.shield.guard}` : '—'], ['Blocked', st.shield ? `${Math.round(st.shield.block * 100)}%` : '—'],
      ['Life Steal', `${st.lifeSteal.toFixed(1)}%`], ['Life Regen', `${st.lifeRegen.toFixed(1)}/s`],
      ['Mana Regen', `${st.manaRegen.toFixed(1)}/s`], ['Move Speed', `+${Math.round(st.moveSpeed)}%`],
    ];
    let h = '<h3>The Wayfarer</h3><div class="stats-grid">';
    for (const [k2, v] of rows) h += `<span class="dim">${k2}</span><span class="v">${v}</span>`;
    h += '</div>';
    const en = Object.entries(st.enchants).filter(([, v]) => v);
    if (en.length) h += '<h3>Shield</h3>' + en.map(([e, v]) => `<div class="tt-ench">${ENCHANTS[e].name}: ${esc(ENCHANTS[e].desc(v))}</div>`).join('');
    box.innerHTML = h;
    return box;
  }

  renderSpells() {
    const { spells, spellIcons } = this.o, book = this.o.book();
    const grid = el('div', 'grid spells');
    for (const [id, s] of Object.entries(spells)) {
      const card = el('div', 'card spell');
      card.innerHTML = `<img src="${spellIcons[id]}" alt=""><div class="nm">${s.name}</div>
        <div class="ty">${s.hands === 2 ? 'two hands' : 'one hand'} · ${s.mana} mana</div><div class="ds">${s.desc}</div>`;
      const row = el('div', 'hb');
      for (const slot of ['F', 'R']) {
        const b = el('button', book[slot] === id ? 'sel' : '', slot);
        b.onclick = () => { this.o.onAssign(id, slot); this.render(); };
        row.append(b);
      }
      card.append(row);
      grid.append(card);
    }
    this.body.append(el('h3', null, 'Spellbook <em>— set a spell to F or R, then press that key to cast</em>'), grid);
  }
}

/** How much of a blow armour takes off (a share, never all of it). */
export const armorCut = (a) => a / (a + 60);

export function tooltip(it, { compare = null, hint = '' } = {}) {
  const col = itemColor(it);
  let h = `<div class="tt-name" style="color:${col}">${esc(it.name)}</div>`;
  if (it.type === 'potion') {
    h += `<div class="dim">${it.kind === 'life' ? 'Heals 45 life over a moment' : 'Restores 50 mana'}. ${it.count > 1 ? `(${it.count} in the bag)` : ''}</div>`;
  } else if (it.type === 'gear') {
    const R = RARITY[it.rarity];
    h += `<div class="tt-base">${esc(it.base)} · ${R.name} ${SLOT_NAMES[it.slot]} · Item Level ${it.ilvl}</div>`;
    if (it.dmg) h += `<div>Damage: <b>${it.dmg[0]}–${it.dmg[1]}</b>${cmpLine(compare, it, 'dmg')}</div>`;
    if (it.guard) h += `<div>Guard: <b>${it.guard}</b>${cmpLine(compare, it, 'guard')} · Blocks <b>${Math.round(it.block * 100)}%</b></div>`;
    if (it.armor) h += `<div>Armour: <b>${it.armor}</b>${cmpLine(compare, it, 'armor')}</div>`;
    if (it.implicit?.length || it.affixes.length) h += '<div class="tt-sep"></div>';
    for (const a of it.implicit || []) h += `<div class="tt-imp">${esc(statLabel(a.s, a.v))}</div>`;
    for (const a of it.affixes) h += `<div class="tt-line">${esc(statLabel(a.s, a.v))}</div>`;
    if (it.enchants?.length) {
      h += '<div class="tt-sep"></div>';
      for (const e of it.enchants) h += `<div class="tt-ench"><b>${ENCHANTS[e.e].name}</b>: ${esc(ENCHANTS[e.e].desc(e.v))}</div>`;
    }
    h += `<div class="tt-price">Worth ${itemValue(it)} gold</div>`;
  }
  if (hint) h += `<div class="dim small">${hint}</div>`;
  return h;
}

function cmpLine(other, it, k) {
  if (!other || other === it || other[k] === undefined) return '';
  const a = Array.isArray(it[k]) ? (it[k][0] + it[k][1]) / 2 : it[k], b = Array.isArray(other[k]) ? (other[k][0] + other[k][1]) / 2 : other[k];
  const d = Math.round(a - b);
  return d ? ` <span class="${d > 0 ? 'up' : 'down'}">(${d > 0 ? '+' : ''}${d})</span>` : '';
}
