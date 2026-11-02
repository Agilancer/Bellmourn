// The chat log in the bottom-right corner: everything said and done, line by line. Who said what,
// quests taken, furthered and done, quest things gathered, every blow you strike and take (and on
// whom), afflictions, kills, what you pick up, gold, experience and levels, places and portals.
//
// It scrolls (the wheel scrolls it even while the mouse steers the view; PageUp/PageDown/End too)
// and is resized from its top-left grip. The gear opens a menu to turn each kind of line on or off
// (lines already in the log hide and come back with it), timestamps, text size and the backdrop.
// During play the mouse belongs to the view: Enter frees it for the log (Esc, Enter or a click on
// the world takes it back); with any window open the log can be used as it is.
// The game's clock stamps each line. Several lines in one frame go in a sensible order (blows,
// then afflictions, then deaths, experience and levels), and a line said twice in a row is counted.

import { uiArt } from './uiart.js';

/** The kinds of line, in the gear menu's groups. */
export const CATS = {
  talk: { label: 'Dialogue', icon: 'talk', group: 'Talk' },
  taunt: { label: 'Enemy taunts', icon: 'talk', group: 'Talk' },
  quest: { label: 'Quests', icon: 'quest', group: 'Quests' },
  qitem: { label: 'Quest items', icon: 'qitem', group: 'Quests' },
  loot: { label: 'Items picked up', icon: 'loot', group: 'Loot' },
  gold: { label: 'Gold', icon: 'gold', group: 'Loot' },
  trade: { label: 'Trade and crafting', icon: 'gem', group: 'Loot' },
  xp: { label: 'Experience', icon: 'xp', group: 'Progress' },
  level: { label: 'Level ups', icon: 'level', group: 'Progress' },
  hit: { label: 'Damage you deal', icon: 'hit', group: 'Combat' },
  hurt: { label: 'Damage you take', icon: 'hurt', group: 'Combat' },
  ail: { label: 'Afflictions', icon: 'ail', group: 'Combat' },
  kill: { label: 'Kills', icon: 'kill', group: 'Combat' },
  block: { label: 'Blocks and parries', icon: 'shield', group: 'Combat' },
  heal: { label: 'Healing and draughts', icon: 'potion', group: 'Combat' },
  world: { label: 'Places and portals', icon: 'portal', group: 'World' },
  sys: { label: 'Notices', icon: 'bell', group: 'World' },
};
// within one frame: blows first, then what they did
const ORDER = { hit: 0, hurt: 0, block: 0, ail: 1, kill: 2, xp: 3, level: 4 };
const MAX_LINES = 400;
const KEY = 'bm.chatlog';
const MIN_W = 240, MIN_H = 96;

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Bits of a line, coloured: a speaker, a foe, you, a number (of a kind of damage), an item (its
 * rarity's colour), a quest. */
export const fmt = {
  who: (n) => `<b class="c-who">${esc(n)}</b>`,
  foe: (n) => `<b class="c-foe">${esc(n)}</b>`,
  you: (t = 'You') => `<b class="c-you">${t}</b>`,
  num: (n, kind = '') => `<b class="c-num ${kind}">${n}</b>`,
  item: (n, col) => `<b class="c-item"${col ? ` style="color:${col}"` : ''}>${esc(n)}</b>`,
  q: (n) => `<b class="c-q">${esc(n)}</b>`,
  gold: (n) => `<b class="c-gold">${n} gold</b>`,
};

export class ChatLog {
  /** o: { clock() -> 'HH:MM', touch, onFocus(on) } */
  constructor(ui, o = {}) {
    this.o = o;
    this.pending = []; this.seq = 0; this.count = 0; this.unread = 0;
    this.focused = false;
    this.cfg = { w: 380, h: 200, off: [], stamps: true, size: 'm', faint: false, collapsed: !!o.touch };
    try { Object.assign(this.cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* none kept */ }
    this.build(ui);
    this.apply();
    // the wheel scrolls the log even while the mouse steers the view (nothing else in the game takes it)
    addEventListener('wheel', (e) => {
      if (!document.pointerLockElement || this.root.classList.contains('hidden')) return;
      this.body.scrollTop += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    }, { passive: true });
    addEventListener('keydown', (e) => {
      if (e.target?.closest?.('input, textarea, select')) return;
      const page = this.body.clientHeight * 0.85;
      if (e.code === 'PageUp') this.body.scrollTop -= page;
      else if (e.code === 'PageDown') this.body.scrollTop += page;
      else if (e.code === 'End' && (document.pointerLockElement || this.focused)) this.toBottom();
      else return;
      e.preventDefault();
    });
    uiArt.ready.then(() => this.root.classList.add('art'));
  }

  build(ui) {
    const r = this.root = document.createElement('div');
    r.className = 'chatlog';
    r.innerHTML = `
      <div class="cl-head">
        <span class="cl-grip" title="Drag to resize"></span>
        <b class="cl-title">Chronicle</b>
        <span class="cl-hint"></span>
        <button class="cl-gear" title="What the log shows" aria-label="Chat log settings"></button>
      </div>
      <div class="cl-body" tabindex="-1"></div>
      <button class="cl-new hidden">&#x25BC; <span></span></button>
      <div class="cl-menu hidden"></div>`;
    ui.append(r);
    this.body = r.querySelector('.cl-body');
    this.newBtn = r.querySelector('.cl-new');
    this.menu = r.querySelector('.cl-menu');
    this.hint = r.querySelector('.cl-hint');
    this.hint.textContent = this.o.touch ? '' : 'Enter';
    // the filters as CSS (a line's kind off: hidden, however old)
    const css = document.createElement('style');
    css.textContent = Object.keys(CATS).map((k) => `.chatlog.off-${k} .ln.c-${k}{display:none}`).join('\n');
    document.head.append(css);

    this.body.addEventListener('scroll', () => { if (this.atBottom()) this.markRead(); });
    this.newBtn.onclick = (e) => { e.stopPropagation(); this.toBottom(); };
    r.querySelector('.cl-gear').onclick = (e) => { e.stopPropagation(); this.showMenu(this.menu.classList.contains('hidden')); };
    // (on a phone the head folds the log away and back)
    r.querySelector('.cl-head').addEventListener('click', (e) => {
      if (!this.o.touch || e.target.closest('.cl-gear, .cl-grip')) return;
      this.cfg.collapsed = !this.cfg.collapsed; this.apply(); this.save();
    });
    document.addEventListener('pointerdown', (e) => { if (!this.menu.classList.contains('hidden') && !e.target.closest('.cl-menu, .cl-gear')) this.showMenu(false); });
    // resizing from the top-left corner (the log keeps its bottom-right where it is)
    const grip = r.querySelector('.cl-grip');
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      grip.setPointerCapture(e.pointerId);
      const sx = e.clientX, sy = e.clientY, sw = r.offsetWidth, sh = r.offsetHeight;
      const move = (ev) => {
        this.cfg.w = Math.round(sw + sx - ev.clientX);
        this.cfg.h = Math.round(sh + sy - ev.clientY);
        this.apply();
      };
      const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); this.save(); };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
    // a click in the log while it has the mouse keeps it (not a click on the world)
    r.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  /** Size, filters and look, from cfg. */
  apply() {
    const r = this.root, c = this.cfg;
    const maxW = Math.max(MIN_W, Math.min(960, innerWidth - 32)), maxH = Math.max(MIN_H, Math.min(760, innerHeight - 120));
    c.w = Math.max(MIN_W, Math.min(maxW, c.w || 380));
    c.h = Math.max(MIN_H, Math.min(maxH, c.h || 200));
    if (!this.o.touch) { r.style.width = c.w + 'px'; r.style.height = c.h + 'px'; }
    for (const k of Object.keys(CATS)) r.classList.toggle('off-' + k, c.off.includes(k));
    r.classList.toggle('stamps', !!c.stamps);
    r.classList.toggle('faint', !!c.faint);
    r.classList.toggle('collapsed', !!c.collapsed);
    r.dataset.size = c.size;
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.cfg)); } catch { /* no storage */ } }

  showMenu(on) {
    this.menu.classList.toggle('hidden', !on);
    this.root.querySelector('.cl-gear').classList.toggle('on', on);
    if (!on) return;
    const c = this.cfg, groups = {};
    for (const [k, v] of Object.entries(CATS)) (groups[v.group] ||= []).push([k, v]);
    const check = (id, label, on, icon = '') => `<label class="cm-row"><input type="checkbox" data-k="${id}"${on ? ' checked' : ''}><i class="cm-box"></i>${icon ? `<i class="ci" style="background-image:var(--ic-${icon})"></i>` : ''}<span>${label}</span></label>`;
    this.menu.innerHTML = `<div class="cm-cols">${Object.entries(groups).map(([g, list]) =>
      `<div class="cm-group"><h4>${g} <a data-all="${g}">all</a></h4>${list.map(([k, v]) => check(k, v.label, !c.off.includes(k), v.icon)).join('')}</div>`).join('')}
      <div class="cm-group"><h4>Display</h4>${check('#stamps', 'Timestamps', c.stamps)}${check('#faint', 'Faint backdrop', c.faint)}
        <div class="cm-size">Text <button data-size="s"${c.size === 's' ? ' class="sel"' : ''}>S</button><button data-size="m"${c.size === 'm' ? ' class="sel"' : ''}>M</button><button data-size="l"${c.size === 'l' ? ' class="sel"' : ''}>L</button></div>
        <div class="cm-act"><button data-act="clear">Clear</button><button data-act="size">Reset size</button></div></div></div>`;
    this.menu.onchange = (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      if (k === '#stamps') c.stamps = e.target.checked;
      else if (k === '#faint') c.faint = e.target.checked;
      else c.off = e.target.checked ? c.off.filter((x) => x !== k) : [...new Set([...c.off, k])];
      this.apply(); this.save();
      if (this.atBottom(40)) this.toBottom();
    };
    this.menu.onclick = (e) => {
      e.stopPropagation();
      const all = e.target.dataset.all, size = e.target.dataset.size, act = e.target.dataset.act;
      if (all) {
        const ks = groups[all].map(([k]) => k), anyOn = ks.some((k) => !c.off.includes(k));
        c.off = anyOn ? [...new Set([...c.off, ...ks])] : c.off.filter((k) => !ks.includes(k));
        this.apply(); this.save(); this.showMenu(true);
      } else if (size) { c.size = size; this.apply(); this.save(); this.showMenu(true); this.toBottom(); }
      else if (act === 'clear') { this.body.innerHTML = ''; this.count = 0; this.last = null; this.markRead(); }
      else if (act === 'size') { c.w = 380; c.h = 200; this.apply(); this.save(); this.toBottom(); }
    };
  }

  /** The mouse given to the log (Enter in play), or taken back. */
  focus(on) {
    if (this.focused === on) return;
    this.focused = on;
    this.root.classList.toggle('focus', on);
    this.hint.textContent = this.o.touch ? '' : on ? 'Esc to return' : 'Enter';
    if (!on) this.showMenu(false);
    this.o.onFocus?.(on);
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  /** A line of a kind (CATS) in HTML (build it with fmt/esc: names are escaped there). */
  add(cat, html) {
    if (!html) return;
    if (!CATS[cat]) cat = 'sys';
    this.pending.push({ cat, html, pri: ORDER[cat] ?? 5, n: this.seq++ });
  }

  /** Each frame: what was said this frame goes in. */
  update() {
    if (!this.pending.length) return;
    const stick = this.atBottom();
    const list = this.pending.sort((a, b) => a.pri - b.pri || a.n - b.n);
    this.pending = [];
    const stamp = this.o.clock?.() || '';
    const frag = document.createDocumentFragment();
    let shown = 0;
    for (const L of list) {
      // the same line again: counted on the one before, not written twice
      if (this.last && this.last.cat === L.cat && this.last.html === L.html && this.last.el.isConnected) {
        const n = ++this.last.times;
        let x = this.last.el.querySelector('.ln-x');
        if (!x) { x = document.createElement('em'); x.className = 'ln-x'; this.last.el.append(x); }
        x.textContent = '×' + n;
        continue;
      }
      const el = document.createElement('div');
      el.className = 'ln c-' + L.cat;
      el.innerHTML = `<i class="ci" style="background-image:var(--ic-${CATS[L.cat].icon})"></i><time>${stamp}</time><span>${L.html}</span>`;
      frag.append(el);
      this.last = { ...L, el, times: 1 };
      this.count++;
      if (!this.cfg.off.includes(L.cat)) shown++;
    }
    this.body.append(frag);
    while (this.count > MAX_LINES && this.body.firstChild) { this.body.firstChild.remove(); this.count--; }
    if (stick) this.toBottom();
    else if (shown) { this.unread += shown; this.newBtn.classList.remove('hidden'); this.newBtn.querySelector('span').textContent = `${this.unread} new`; }
  }

  atBottom(slack = 6) { const b = this.body; return b.scrollHeight - b.scrollTop - b.clientHeight <= slack; }
  toBottom() { this.body.scrollTop = this.body.scrollHeight; this.markRead(); }
  markRead() { this.unread = 0; this.newBtn.classList.add('hidden'); }
}
