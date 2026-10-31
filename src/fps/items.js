// What can be carried: gold, potions, odds and ends, and the monsters' weapons. Each good is a
// kit model (drawn as its icon and lying on the floor when it's spilled). A Bag is a row of
// slots, one item to a slot; coins and potions stack.
//
// An item is { id, n } (a good and how many), or { id: 'weapon', n: 1, w } with w a rolled
// weapon (loot.js).
import { rollWeapon } from './loot.js';

// tint: the glow behind its icon in a slot (the palette leaves potions much alike)
export const GOODS = {
  gold: { name: 'Gold', type: 'coin', model: 'props/Coin_Pile', variant: 'gilt', stack: 9999, tint: '#d8a840' },
  potion_health: { name: 'Potion of Healing', type: 'double-click to drink: +60 health', model: 'props/Potion_1', stack: 10, drink: 'health', tint: '#c02818' },
  potion_mana: { name: 'Potion of Mana', type: 'double-click to drink: +60 mana', model: 'props/Potion_2', variant: 'venom', stack: 10, drink: 'mana', tint: '#2858d8' },
  candle: { name: 'Tallow Candles', type: 'odds and ends', model: 'props/Candle_1', stack: 10 },
  mug: { name: 'Pewter Mug', type: 'odds and ends', model: 'props/Mug', stack: 1 },
  wine: { name: 'Bottle of Wine', type: 'odds and ends', model: 'props/Bottle_1', stack: 5 },
  scroll: { name: 'Mouldering Scroll', type: 'odds and ends', model: 'props/Scroll_1', stack: 5 },
  book: { name: 'Psalter', type: 'a prayer book', model: 'props/Book_5', stack: 1 },
  chalice: { name: 'Gilt Chalice', type: 'treasure', model: 'props/Chalice', variant: 'gilt', stack: 1, tint: '#a08040' },
  key: { name: 'Gilded Key', type: 'treasure', model: 'props/Key_Gold', variant: 'gilt', stack: 1, tint: '#a08040' },
  skull: { name: 'Yellowed Skull', type: 'a keepsake of the dead', model: 'dungeon/Skull', stack: 1 },
};
const TIER_TINT = { rust: '#7a4a28', gilt: '#d8b040', blood: '#b01818' };

/** A good's or weapon's name, kind line, kit model (with its colour variant) and tint. */
export function describe(it) {
  if (it.id === 'weapon') return { name: it.w.title, type: it.w.type + ' · double-click to wield', model: it.w.model, variant: it.w.variant, tint: TIER_TINT[it.w.variant] || '' };
  const g = GOODS[it.id];
  return { name: g.name, type: g.type, model: g.model, variant: g.variant || '', tint: g.tint || '' };
}

export const stackOf = (it) => (it.id === 'weapon' ? 1 : GOODS[it.id].stack);

export class Bag {
  constructor(size) { this.slots = new Array(size).fill(null); }

  get empty() { return this.slots.every((s) => !s); }
  count(id) { return this.slots.reduce((a, s) => a + (s?.id === id ? s.n : 0), 0); }

  /** Put it anywhere it fits: onto stacks of its kind first, then the first free slot. Takes
   * what fits out of `it` (it.n is what's left) and returns true if all of it went in. */
  add(it) {
    const max = stackOf(it);
    if (max > 1) for (const s of this.slots) {
      if (it.n <= 0) break;
      if (s?.id !== it.id || s.n >= max) continue;
      const k = Math.min(it.n, max - s.n);
      s.n += k; it.n -= k;
    }
    while (it.n > 0) {
      const i = this.slots.indexOf(null);
      if (i < 0) return false;
      const k = Math.min(it.n, max);
      this.slots[i] = { ...it, n: k };
      it.n -= k;
    }
    return true;
  }

  /** Put it in slot i: onto a stack of its kind, into the slot if it's free, otherwise swap.
   * Returns what's displaced (or left over), or null. */
  put(i, it) {
    const s = this.slots[i];
    if (!s) { this.slots[i] = it; return null; }
    if (s.id === it.id && it.id !== 'weapon') {
      const k = Math.min(it.n, stackOf(it) - s.n);
      s.n += k; it.n -= k;
      return it.n > 0 ? it : null;
    }
    this.slots[i] = it;
    return s;
  }

  take(i) { const s = this.slots[i]; this.slots[i] = null; return s; }
}

// what turns up in each kind of container: [good, weight, how many (min, max)]
const FINDS = {
  pot: [['gold', 50, 2, 14], ['potion_health', 14, 1, 1], ['potion_mana', 9, 1, 1], ['candle', 8, 1, 3], ['scroll', 4, 1, 1], ['key', 1, 1, 1]],
  crate: [['gold', 30, 3, 18], ['potion_health', 12, 1, 2], ['potion_mana', 8, 1, 1], ['candle', 12, 1, 4], ['wine', 12, 1, 2], ['mug', 8, 1, 1], ['scroll', 5, 1, 1], ['book', 3, 1, 1]],
  barrel: [['gold', 25, 3, 12], ['wine', 30, 1, 3], ['potion_health', 10, 1, 1], ['mug', 10, 1, 1], ['candle', 6, 1, 2]],
  chest: [['potion_health', 20, 1, 2], ['potion_mana', 14, 1, 2], ['chalice', 8, 1, 1], ['key', 4, 1, 1], ['book', 6, 1, 1], ['scroll', 8, 1, 2], ['wine', 8, 1, 2], ['candle', 6, 2, 4]],
};
const DEEP_FINDS = [['skull', 10, 1, 1], ['chalice', 4, 1, 1]];

/** What's inside a new container of `kind` ('pot' | 'crate' | 'barrel' | 'chest'): deep is
 * underground (better, and bones), rich a gilded chest. */
export function rollContents(kind, slots, { deep = false, rich = false } = {}) {
  const bag = new Bag(slots);
  const table = [...FINDS[kind], ...(deep ? DEEP_FINDS : [])];
  const total = table.reduce((a, f) => a + f[1], 0);
  const pick = () => {
    let r = Math.random() * total;
    for (const f of table) { r -= f[1]; if (r <= 0) return f; }
    return table[0];
  };
  const between = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const gold = (deep ? 1.6 : 1) * (rich ? 3 : 1);
  let finds;
  if (kind === 'chest') {
    finds = between(2, 4) + (rich ? 1 : 0);
    bag.add({ id: 'gold', n: Math.round(between(12, 45) * gold) });
    const tier = rich ? between(3, 4) : deep ? between(2, 3) : between(1, 2);
    if (Math.random() < (rich ? 0.9 : 0.5)) bag.add({ id: 'weapon', n: 1, w: rollWeapon({ tier }) });
  } else {
    // a third of the pots and crates hold nothing
    finds = Math.random() < 0.34 ? 0 : kind === 'pot' ? between(1, 2) : between(1, 3);
  }
  for (let i = 0; i < finds; i++) {
    const [id, , a, b] = pick();
    bag.add({ id, n: id === 'gold' ? Math.round(between(a, b) * gold) : between(a, b) });
  }
  if (kind !== 'chest' && deep && Math.random() < 0.05) bag.add({ id: 'weapon', n: 1, w: rollWeapon({ tier: between(1, 2) }) });
  return bag;
}
