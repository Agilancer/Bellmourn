// The Debug Menu, for trying the game out: Velscour's Skull (the one his own game talks to him
// through, assets/ui/velscour_skull.png) sits beside the corner map. Click it (on a computer, Esc
// first to free the mouse) and it asks for a word; the wrong word closes it and nothing happens.
// The right one opens the menu: enemies' blows turned off, no-clip (fly anywhere, through anything,
// seen by nothing, touching nothing, the hands put away), every portal woken, a heap of gear and
// gold at your feet (GEAR GOD: Epic to Mythic; GEAR PEASANT: Common to Rare), a level up or down,
// and GOD MODE (nothing hurts you, and everything dies at one blow, the lords too).
//
// This is only the windows: main.js does what each button asks (its callbacks below). The cheats
// last until the page is reloaded.

const PASSWORD = '6669';
const SKULL = 'assets/ui/velscour_skull.png';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// the switches: [key, name, what it does]
const TOGGLES = [
  ['noDamage', 'No Enemy Damage', 'Nothing an enemy does can hurt you'],
  ['fly', 'No-Clip / Inspect', 'WASD flies through anything (Space up, C down, Shift fast); unseen, touching nothing, hands away'],
  ['god', 'GOD MODE', 'No damage, and everything dies at one blow from anything, the lords too'],
];
// what the little line under the skull says while a cheat is on
const TAGS = { god: 'GOD', fly: 'NO-CLIP', noDamage: 'NO DMG' };

export class DebugMenu {
  /** o: { ui, cheats ({noDamage, fly, god}, shared with main.js), onOpen(), onUnlock(), onClose(how: 'cancel'
   * | 'button' | 'key'), onToggle(key, on), onPortals(), portals() -> [awake, all], onGear('god' | 'peasant'),
   * onLevel(+1 | -1), level() -> [level, max] }. What an action returns (a line of text) is shown in the
   * menu, under its buttons. */
  constructor(o) {
    this.o = o;
    this.cheats = o.cheats;
    this.note = '';

    // ---- the skull by the corner map
    const hud = o.ui.querySelector('.hud') || o.ui;
    this.skull = el('button', 'vskull', `<img src="${SKULL}" alt="" draggable="false">`);
    this.skull.type = 'button';
    this.skull.title = "Velscour's Skull";
    this.skull.setAttribute('aria-label', "Velscour's Skull");
    this.tag = el('div', 'vskull-tag');
    hud.append(this.skull, this.tag);
    // (a tap answers at once and isn't also a click; the button gives up the focus, so Space or
    // Enter in play never presses it)
    this.skull.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); this.ask(); }, { passive: false });
    this.skull.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.skull.addEventListener('click', (e) => { e.stopPropagation(); this.skull.blur(); this.ask(); });

    // ---- the word
    this.pass = el('div', 'panel vpass hidden');
    this.pass.innerHTML = `
      <img class="vp-skull" src="${SKULL}" alt="" draggable="false">
      <h2>Velscour's Skull</h2>
      <p class="vp-line">Speak the word, and the skull will answer.</p>
      <form class="vp-form" autocomplete="off">
        <input class="vp-input" type="password" inputmode="numeric" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Password" placeholder="&bull; &bull; &bull; &bull;">
        <div class="vp-btns"><button type="button" class="vp-cancel">Cancel</button><button type="submit" class="vp-unlock sel">Unlock</button></div>
      </form>`;
    this.input = this.pass.querySelector('.vp-input');
    this.pass.querySelector('.vp-form').addEventListener('submit', (e) => { e.preventDefault(); this.unlock(); });
    this.pass.querySelector('.vp-cancel').onclick = () => this.cancel();

    // ---- the menu
    this.panel = el('div', 'panel debug hidden');

    for (const p of [this.pass, this.panel]) {
      p.addEventListener('pointerdown', (e) => e.stopPropagation());
      p.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      o.ui.append(p);
    }

    // while either window is up the game hears no keys: Esc backs out, the rest go to the window
    // (window, capturing: before the game's own listener)
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      e.stopPropagation();
      if (e.code !== 'Escape') return;
      e.preventDefault();
      if (this.asking) this.cancel(); else this.close('key');
    }, true);
    this.showTag();
  }

  get asking() { return !this.pass.classList.contains('hidden'); }
  get menuOpen() { return !this.panel.classList.contains('hidden'); }
  get open() { return this.asking || this.menuOpen; }

  /** Whether the skull can be seen (and pressed): not over the other windows. */
  showSkull(on) {
    if (this.skullOn === on) return;
    this.skullOn = on;
    this.skull.classList.toggle('off', !on);
    this.tag.classList.toggle('off', !on);
  }

  /** The skull is pressed: it asks for the word. */
  ask() {
    if (this.open || !this.skullOn) return;
    this.o.onOpen?.();
    this.input.value = '';
    this.pass.classList.remove('hidden');
    this.input.focus({ preventScroll: true });
  }

  /** The word given: the right one opens the menu; anything else just closes the window. */
  unlock() {
    if (!this.asking) return;
    const ok = this.input.value.trim() === PASSWORD;
    this.input.value = '';
    this.input.blur();
    this.pass.classList.add('hidden');
    if (!ok) { this.o.onClose?.('cancel'); return; }
    this.o.onUnlock?.();
    this.note = '';
    this.render();
    this.panel.classList.remove('hidden');
  }

  cancel() {
    if (!this.asking) return;
    this.input.value = '';
    this.input.blur();
    this.pass.classList.add('hidden');
    this.o.onClose?.('cancel');
  }

  close(how = 'button') {
    if (!this.menuOpen) return;
    document.activeElement?.blur?.();
    this.panel.classList.add('hidden');
    this.o.onClose?.(how);
  }

  /** The line under the skull: which cheats are on. */
  showTag() {
    const on = Object.keys(TAGS).filter((k) => this.cheats[k]).map((k) => TAGS[k]);
    this.tag.textContent = on.join(' · ');
    this.skull.classList.toggle('lit', on.length > 0);
  }

  render() {
    const P = this.panel, c = this.cheats;
    P.innerHTML = '';
    const close = el('button', 'close', '&times;');
    close.title = 'Close';
    close.onclick = () => this.close('button');
    P.append(close, el('div', 'dbg-head', `<img src="${SKULL}" alt="" draggable="false"><h2>Debug Menu</h2>`));

    P.append(el('h3', null, 'Cheats'));
    const togs = el('div', 'dbg-list');
    for (const [k, name, desc] of TOGGLES) {
      const b = el('button', `dbg-tog${k === 'god' ? ' god' : ''}${c[k] ? ' on' : ''}`, `<span class="dbg-name"><b>${name}</b><em>${desc}</em></span><i class="dbg-sw">${c[k] ? 'ON' : 'OFF'}</i>`);
      b.setAttribute('aria-pressed', String(!!c[k]));
      b.onclick = () => { c[k] = !c[k]; this.act(this.o.onToggle?.(k, c[k])); this.showTag(); };
      togs.append(b);
    }
    P.append(togs);

    P.append(el('h3', null, 'World'));
    const [awake, all] = this.o.portals?.() || [0, 0];
    const portals = el('button', 'dbg-act', `<span class="dbg-name"><b>Unlock All Portals</b><em>${awake >= all ? `All ${all} portals are awake: stand on any seal and travel to any other` : `Wake every seal in the land, so you can travel to any of them (${awake} of ${all} awake)`}</em></span>`);
    portals.disabled = all > 0 && awake >= all;
    portals.onclick = () => this.act(this.o.onPortals?.());
    P.append(portals);

    P.append(el('h3', null, 'Gear'));
    const gear = el('div', 'dbg-gear');
    const god = el('button', 'dbg-gearbtn god', '<b>GEAR GOD</b><em>Epic, Legendary, Mythic: every kind, and a fortune in gold</em>');
    const peasant = el('button', 'dbg-gearbtn peasant', '<b>GEAR PEASANT</b><em>Common, Uncommon, Rare: every kind, and a fortune in gold</em>');
    god.onclick = () => this.act(this.o.onGear?.('god'));
    peasant.onclick = () => this.act(this.o.onGear?.('peasant'));
    gear.append(god, peasant);
    P.append(gear);

    P.append(el('h3', null, 'Level'));
    const [lv, max] = this.o.level?.() || [1, 40];
    const lvl = el('div', 'dbg-level');
    const down = el('button', 'dbg-step', '&minus;'), up = el('button', 'dbg-step', '+');
    down.title = 'One level down'; up.title = 'One level up';
    down.disabled = lv <= 1; up.disabled = lv >= max;
    down.onclick = () => this.act(this.o.onLevel?.(-1));
    up.onclick = () => this.act(this.o.onLevel?.(1));
    lvl.append(down, el('div', 'dbg-lv', `<b>Level ${lv}</b><em>of ${max}</em>`), up);
    P.append(lvl);

    const foot = el('div', 'dbg-foot');
    const said = el('div', 'dbg-note');
    said.textContent = this.note;
    const done = el('button', 'sel', 'Close');
    done.onclick = () => this.close('button');
    foot.append(said, done, el('div', 'dim small', 'The cheats last until the page is reloaded.'));
    P.append(foot);
  }

  /** An action done: what it says, shown in the menu (kept where it was scrolled to). */
  act(said) {
    this.note = typeof said === 'string' ? said : '';
    const top = this.panel.scrollTop;
    this.render();
    this.panel.scrollTop = top;
  }
}
