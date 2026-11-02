// The chat log in the bottom-left corner: everything said and done, line by line. Who said what,
// quests taken, furthered and done, quest things gathered, every blow you strike and take (and on
// whom), afflictions, kills, what you pick up, gold, experience and levels, places and portals.
//
// It scrolls (the wheel scrolls it even while the mouse steers the view; PageUp/PageDown/End too)
// and is resized from its top-right grip. The gear opens a menu to turn each kind of line on or off
// (lines already in the log hide and come back with it), timestamps, text size and the backdrop.
// During play the mouse belongs to the view: Enter frees it for the log (Esc, Enter or a click on
// the world takes it back); with any window open the log can be used as it is.
// The game's clock stamps each line. Several lines in one frame go in a sensible order (blows,
// then afflictions, then deaths, experience and levels), and a line said twice in a row is counted.

/** The kinds of line, in the gear menu's groups. */
export const CATS = {
  talk: { label: 'Dialogue', group: 'Talk' },
  taunt: { label: 'Enemy taunts', group: 'Talk' },
  quest: { label: 'Quests', group: 'Quests' },
  qitem: { label: 'Quest items', group: 'Quests' },
  loot: { label: 'Items picked up', group: 'Loot' },
  gold: { label: 'Gold', group: 'Loot' },
  trade: { label: 'Trade and crafting', group: 'Loot' },
  xp: { label: 'Experience', group: 'Progress' },
  level: { label: 'Level ups', group: 'Progress' },
  hit: { label: 'Damage you deal', group: 'Combat' },
  hurt: { label: 'Damage you take', group: 'Combat' },
  ail: { label: 'Afflictions', group: 'Combat' },
  kill: { label: 'Kills', group: 'Combat' },
  block: { label: 'Blocks and parries', group: 'Combat' },
  heal: { label: 'Healing and draughts', group: 'Combat' },
  world: { label: 'Places and portals', group: 'World' },
  sys: { label: 'Notices', group: 'World' },
};
// within one frame: blows first, then what they did
/** The tabs along the log's head: each shows its kinds of line (All: every kind the gear leaves on). */
export const TABS = {
  all: { label: 'All', cats: null },
  talk: { label: 'Talk', cats: ['talk', 'taunt'], pip: true },
  fight: { label: 'Combat', cats: ['hit', 'hurt', 'ail', 'kill', 'block', 'heal'] },
  loot: { label: 'Loot', cats: ['loot', 'gold', 'trade'], pip: 'notable' },
  quest: { label: 'Quests', cats: ['quest', 'qitem', 'xp', 'level'], pip: true },
};
// (places and notices show only in All; Combat and All never light a pip: they'd be lit for ever)
const NOWRAP = new Set(['hit', 'hurt', 'ail', 'kill', 'block', 'heal', 'xp', 'gold', 'loot']);   // one line each, cut with … (all of it on hover)
const IDLE = 6, FRESH = 8;   // s quiet before the frame fades; s a line stays up in the faded log
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
    this.cfg = { w: 400, h: 210, off: [], stamps: true, size: 'm', faint: false, collapsed: !!o.touch, tab: 'all' };
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
  }

  build(ui) {
    const r = this.root = document.createElement('div');
    r.className = 'chatlog';
    r.innerHTML = `
      <div class="cl-head" title="Chronicle">
        <nav class="cl-tabs">${Object.entries(TABS).map(([k, t]) => `<button data-tab="${k}">${t.label}<i></i></button>`).join('')}</nav>
        <span class="cl-tick"><span></span><b></b></span>
        <span class="cl-hint"></span>
        <button class="cl-gear" title="What the log shows" aria-label="Chat log settings">&#x2699;</button>
        <span class="cl-grip" title="Drag to resize"></span>
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
    css.textContent = Object.keys(CATS).map((k) => `.chatlog.off-${k} .ln.c-${k}{display:none}`).join('\n') + '\n'
      + Object.entries(TABS).filter(([, t]) => t.cats).map(([k, t]) => `.chatlog.tab-${k} .ln${t.cats.map((c) => `:not(.c-${c})`).join('')}{display:none}`).join('\n');
    document.head.append(css);

    this.body.addEventListener('scroll', () => { if (this.atBottom()) this.markRead(); });
    this.newBtn.onclick = (e) => { e.stopPropagation(); this.toBottom(); };
    r.querySelector('.cl-gear').onclick = (e) => { e.stopPropagation(); this.showMenu(this.menu.classList.contains('hidden')); };
    // the tabs; and on a phone the head folds the log away and back (a tab opens it)
    r.querySelector('.cl-head').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        e.stopPropagation();
        this.setTab(tab.dataset.tab);
        if (this.o.touch && this.cfg.collapsed) { this.cfg.collapsed = false; this.apply(); this.save(); this.toBottom(); }
        return;
      }
      if (!this.o.touch || e.target.closest('.cl-gear, .cl-grip')) return;
      this.cfg.collapsed = !this.cfg.collapsed; this.apply(); this.save();
      if (!this.cfg.collapsed) { this.toBottom(); this.folded = 0; this.root.querySelector('.cl-tick b').textContent = ''; }   // (what came while it was folded: the newest at the bottom)
    });
    document.addEventListener('pointerdown', (e) => { if (!this.menu.classList.contains('hidden') && !e.target.closest('.cl-menu, .cl-gear')) this.showMenu(false); });
    // resizing from the top-right corner (the log keeps its bottom-left where it is)
    const grip = r.querySelector('.cl-grip');
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      grip.setPointerCapture(e.pointerId);
      const sx = e.clientX, sy = e.clientY, sw = r.offsetWidth, sh = r.offsetHeight;
      const move = (ev) => {
        this.cfg.w = Math.round(sw + ev.clientX - sx);
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
    // the faded log comes back while the mouse is over it
    r.addEventListener('pointerenter', () => { this.hover = true; this.wake(); });
    r.addEventListener('pointerleave', () => { this.hover = false; });
    // with the mouse given to the log: Tab and Shift+Tab go through the tabs
    addEventListener('keydown', (e) => {
      if (!this.focused || e.code !== 'Tab') return;
      e.preventDefault(); e.stopPropagation();
      const ks = Object.keys(TABS), i = ks.indexOf(this.cfg.tab);
      this.setTab(ks[(i + (e.shiftKey ? ks.length - 1 : 1)) % ks.length]);
    }, true);
  }

  /** Another tab: where it was left if it was scrolled back, else its newest line. */
  setTab(k) {
    if (!TABS[k] || k === this.cfg.tab) return;
    (this.scrolls ||= {})[this.cfg.tab] = this.atBottom() ? null : this.body.scrollTop;
    this.cfg.tab = k; this.apply(); this.save();
    const back = this.scrolls[k];
    if (back != null) this.body.scrollTop = back; else this.toBottom();
    this.wake();
  }

  /** The faded log back to full (a new line, the mouse over it, the mouse given to it). */
  wake() { this.quietT = 0; this.root.classList.remove('idle'); }

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
    if (!TABS[c.tab]) c.tab = 'all';
    for (const k of Object.keys(TABS)) r.classList.toggle('tab-' + k, c.tab === k);
    for (const b of r.querySelectorAll('[data-tab]')) {
      const on = b.dataset.tab === c.tab;
      b.classList.toggle('on', on);
      if (on) b.classList.remove('new');
    }
    r.classList.toggle('pips', !!r.querySelector('[data-tab].new'));
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.cfg)); } catch { /* no storage */ } }

  showMenu(on) {
    this.menu.classList.toggle('hidden', !on);
    this.root.querySelector('.cl-gear').classList.toggle('on', on);
    if (!on) return;
    const c = this.cfg, groups = {};
    for (const [k, v] of Object.entries(CATS)) (groups[v.group] ||= []).push([k, v]);
    const check = (id, label, on) => `<label class="cm-row"><input type="checkbox" data-k="${id}"${on ? ' checked' : ''}><i class="cm-box"></i><span>${label}</span></label>`;
    this.menu.innerHTML = `<button class="cm-close" data-act="close" aria-label="Close">&#x2715;</button><div class="cm-cols">${Object.entries(groups).map(([g, list]) =>
      `<div class="cm-group"><h4>${g} <a data-all="${g}">all</a></h4>${list.map(([k, v]) => check(k, v.label, !c.off.includes(k))).join('')}</div>`).join('')}
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
      else if (act === 'close') this.showMenu(false);
      else if (act === 'clear') { this.body.innerHTML = ''; this.count = 0; this.last = null; this.markRead(); }
      else if (act === 'size') { c.w = 380; c.h = 200; this.apply(); this.save(); this.toBottom(); }
    };
  }

  /** The mouse given to the log (Enter in play), or taken back. */
  focus(on) {
    if (this.focused === on) return;
    this.focused = on;
    this.root.classList.toggle('focus', on);
    if (on) this.wake();
    this.hint.textContent = this.o.touch ? '' : on ? 'Esc to return' : 'Enter';
    if (!on) this.showMenu(false);
    this.o.onFocus?.(on);
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  /** A line of a kind (CATS) in HTML (build it with fmt/esc: names are escaped there). o: { key (a
   * line with the same key as the log's last is that line, rewritten: a foe's run of hits), big (a
   * moment: a level, a quest done, a rare find: a gilded row), notable (lights the Loot tab's pip) } */
  add(cat, html, o = {}) {
    if (!html) return;
    if (!CATS[cat]) cat = 'sys';
    this.pending.push({ cat, html, pri: ORDER[cat] ?? 5, n: this.seq++, key: o.key || null, big: !!o.big, notable: !!o.notable });
  }

  /** The key of the newest line (waiting to go in, or in). */
  tailKey() {
    if (this.pending.length) return this.pending[this.pending.length - 1].key;
    return this.last?.el?.isConnected ? this.last.key : null;
  }

  /** Each frame: what was said this frame goes in; the log fades when it's been quiet a while. */
  update(dt = 1 / 60) {
    this.idleTick(dt);
    if (!this.pending.length) return;
    const stick = this.atBottom();
    const list = this.pending.sort((a, b) => a.pri - b.pri || a.n - b.n);
    this.pending = [];
    const stamp = this.o.clock?.() || '';
    const frag = document.createDocumentFragment();
    let shown = 0;
    for (const L of list) {
      // a foe's run of hits: the log's last line, rewritten
      if (L.key && this.last?.key === L.key && this.last.el.isConnected) {
        const sp = this.last.el.querySelector('span');
        sp.innerHTML = L.html;
        if (NOWRAP.has(L.cat)) this.last.el.title = sp.textContent;
        this.last.el.classList.remove('bump'); void this.last.el.offsetWidth; this.last.el.classList.add('bump');
        this.last.html = L.html;
        continue;
      }
      // the same line again: counted on the one before, not written twice
      if (this.last && this.last.cat === L.cat && this.last.html === L.html && this.last.el.isConnected) {
        const n = ++this.last.times;
        let x = this.last.el.querySelector('.ln-x');
        if (!x) { x = document.createElement('em'); x.className = 'ln-x'; this.last.el.append(x); }
        x.textContent = '×' + n;
        continue;
      }
      const el = document.createElement('div');
      el.className = 'ln c-' + L.cat + (NOWRAP.has(L.cat) ? ' nw' : '') + (L.big ? ' big' : '');
      // (the time only where the minute changes: the rest keep its column, blank)
      const fresh = stamp !== this.stampShown;
      if (fresh) this.stampShown = stamp;
      el.innerHTML = `<time${fresh ? '' : ' class="rep"'}>${stamp}</time><span>${L.html}</span>`;
      if (NOWRAP.has(L.cat)) el.title = el.querySelector('span').textContent;
      frag.append(el);
      (this.freshEls ||= []).push([el, this.age || 0]);
      el.classList.add('fresh');
      this.last = { ...L, el, times: 1 };
      this.count++;
      if (this.cfg.off.includes(L.cat)) continue;
      this.wake();
      this.tick(el);
      // (a line for a tab not being looked at: a gold pip on that tab, where that tab lights one)
      const tab = TABS[this.cfg.tab];
      if (!tab.cats || tab.cats.includes(L.cat)) shown++;
      for (const b of this.root.querySelectorAll('[data-tab]')) {
        const t = TABS[b.dataset.tab];
        if (b.dataset.tab === this.cfg.tab || !t.cats?.includes(L.cat) || !t.pip || (t.pip === 'notable' && !L.notable)) continue;
        if (!b.classList.contains('new')) { b.classList.add('new'); this.root.classList.add('pips'); }
      }
    }
    this.body.append(frag);
    while (this.count > MAX_LINES && this.body.firstChild) { this.body.firstChild.remove(); this.count--; }
    if (stick) this.toBottom();
    else if (shown) { this.unread += shown; this.newBtn.classList.remove('hidden'); this.newBtn.querySelector('span').textContent = `${this.unread} new`; }
  }

  /** The folded log's head (a phone): the newest line, and how many came while it was folded. */
  tick(el) {
    if (!this.o.touch) return;
    const t = this.root.querySelector('.cl-tick');
    t.querySelector('span').textContent = el.querySelector('span').textContent;
    if (this.cfg.collapsed) { this.folded = (this.folded || 0) + 1; t.querySelector('b').textContent = this.folded > 99 ? '99+' : this.folded; }
  }

  /** Quiet IDLE s (no new line, no mouse over it, not in use): the frame and backdrop fade away, and
   * only the lines newer than FRESH s stay up, till something new comes. */
  idleTick(dt) {
    this.age = (this.age || 0) + dt;
    if (this.freshEls?.length && this.age - this.freshEls[0][1] > FRESH) {
      while (this.freshEls.length && this.age - this.freshEls[0][1] > FRESH) this.freshEls.shift()[0].classList.remove('fresh');
    }
    if (this.o.touch || this.focused || this.hover || !this.menu.classList.contains('hidden')) { this.quietT = 0; return; }
    if ((this.quietT = (this.quietT || 0) + dt) > IDLE) this.root.classList.add('idle');
  }

  atBottom(slack = 6) { const b = this.body; return b.scrollHeight - b.scrollTop - b.clientHeight <= slack; }
  toBottom() { this.body.scrollTop = this.body.scrollHeight; this.markRead(); }
  markRead() { this.unread = 0; this.newBtn.classList.add('hidden'); }
}
