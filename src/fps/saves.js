// Saved games: ten slots, each with the time and date it was made, who you were (level, where you
// stood, how much gold), and everything to pick the game up again: the character, the quests, where
// and which way you were facing, the hour, the spellbook. Kept in localStorage (bm.save.1 .. 10).
// The game you're playing also keeps itself as it goes (bm.char, bm.progress): that's "Continue".
const KEY = (i) => `bm.save.${i}`;
export const SLOT_COUNT = 10;

export function readSlot(i) {
  try { return JSON.parse(localStorage.getItem(KEY(i)) || 'null'); } catch { return null; }
}
export function writeSlot(i, data) {
  try { localStorage.setItem(KEY(i), JSON.stringify({ ...data, at: Date.now() })); return true; } catch (e) { console.warn('save', e); return false; }
}
export function clearSlot(i) { try { localStorage.removeItem(KEY(i)); } catch { /* no storage */ } }

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = (t) => {
  const d = new Date(t);
  return `${d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
};

/** The save / load window. o: { ui, snapshot() -> data (or null when there's nothing to save),
 * restore(data), onClose(), toast(text) } */
export class SaveMenu {
  constructor(o) {
    this.o = o;
    this.el = el('div', 'panel saves hidden');
    o.ui.append(this.el);
    this.mode = 'save';
  }
  get open() { return !this.el.classList.contains('hidden'); }
  show(mode) {
    if (!mode) { this.el.classList.add('hidden'); return; }
    this.mode = mode;
    this.confirm = null;
    this.render();
    this.el.classList.remove('hidden');
  }

  render() {
    const E = this.el, save = this.mode === 'save';
    E.innerHTML = '';
    const close = el('button', 'close', '&times;');
    close.onclick = () => { this.show(null); this.o.onClose?.(); };
    E.append(close, el('h2', null, save ? 'Save Game' : 'Load Game'));
    const tabs = el('div', 'tabs');
    for (const [m, label] of [['save', 'Save'], ['load', 'Load']]) {
      const b = el('button', m === this.mode ? 'sel' : '', label);
      b.disabled = m === 'save' && !this.o.canSave?.();
      b.onclick = () => { this.mode = m; this.confirm = null; this.render(); };
      tabs.append(b);
    }
    E.append(tabs);
    const list = el('div', 'slots-list');
    for (let i = 1; i <= SLOT_COUNT; i++) {
      const d = readSlot(i);
      const row = el('div', 'save-slot' + (d ? '' : ' empty') + (this.confirm === i ? ' confirm' : ''));
      const info = d
        ? `<b>Slot ${i}</b><span class="when">${esc(when(d.at))}</span><span class="who">Level ${d.level || 1} · ${esc(d.place || 'Bellmourn')} · ${d.gold || 0} gold${d.quests ? ` · ${d.quests} quest${d.quests > 1 ? 's' : ''} done` : ''}</span>`
        : `<b>Slot ${i}</b><span class="when">Empty</span>`;
      row.innerHTML = `<div class="si">${info}</div>`;
      const btns = el('div', 'sb');
      if (save) {
        const b = el('button', this.confirm === i ? 'red' : 'sel', this.confirm === i ? 'Overwrite?' : 'Save here');
        b.onclick = () => {
          if (d && this.confirm !== i) { this.confirm = i; this.render(); return; }
          const data = this.o.snapshot();
          if (!data) { this.o.toast?.('Nothing to save yet'); return; }
          if (writeSlot(i, data)) this.o.toast?.(`Saved in slot ${i}`); else this.o.toast?.('Could not save (the browser refused the space)');
          this.confirm = null; this.render();
        };
        btns.append(b);
      } else if (d) {
        const b = el('button', 'sel', 'Load');
        b.onclick = () => { this.show(null); this.o.restore(d); };
        btns.append(b);
      }
      if (d) {
        const x = el('button', 'small red', this.confirm === -i ? 'Delete?' : '✕');
        x.title = 'Delete this save';
        x.onclick = () => { if (this.confirm !== -i) { this.confirm = -i; this.render(); return; } clearSlot(i); this.confirm = null; this.render(); };
        btns.append(x);
      }
      row.append(btns);
      list.append(row);
    }
    E.append(list);
    E.append(el('div', 'dim small', save ? 'Ten slots. Each keeps your character, your quests, where you stand and the hour.' : 'Loading puts you back where that save was made.'));
  }
}
