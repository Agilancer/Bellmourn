// Gear: what you carry and wear, laid out the way Velscour does it. Every item is rolled from a
// base (the arms are the manifest's own models, so what you find is what you hold; the
// gauntlets are the arm rigs; helms, coats, legs, boots and rings are worn unseen) at an item
// level and a rarity, which fixes its finish (a weapon's or shield's painted variant) and how
// many affixes it carries. Shields carry Guard (the bar that soaks blows while the shield is up)
// and Block (how much of a blow it stops); the better ones last longer and stop more, and from
// Rare up they come enchanted: thorns, frost, fire, holy light, a ward against spells, a shove.
//
// The character (equipment, bag, gold, potions) lives in localStorage under bm.char.

export const RARITY = [
  { id: 0, name: 'Common', color: '#e8e8e8', weight: 70, affixes: [0, 0], finish: 'worn', mul: 1 },
  { id: 1, name: 'Uncommon', color: '#4fd65a', weight: 22, affixes: [1, 2], finish: 'bright', mul: 1.12 },
  { id: 2, name: 'Rare', color: '#4f8dff', weight: 6.5, affixes: [2, 3], finish: 'ancient', mul: 1.25, enchant: 0.5 },
  { id: 3, name: 'Epic', color: '#b45cff', weight: 1.4, affixes: [3, 4], finish: 'frostbound', mul: 1.4, enchant: 1 },
  { id: 4, name: 'Legendary', color: '#ff9a2a', weight: 0.3, affixes: [4, 5], finish: 'gilded', mul: 1.6, enchant: 1 },
  { id: 5, name: 'Mythic', color: '#ff4058', weight: 0.05, affixes: [5, 6], finish: 'bloodforged', mul: 1.85, enchant: 2 },
];

export const SLOTS = ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'ring1', 'ring2', 'ring3', 'ring4'];
export const RING_SLOTS = ['ring1', 'ring2', 'ring3', 'ring4'];
export const SLOT_NAMES = { weapon: 'Weapon', offhand: 'Off-hand', head: 'Head', body: 'Body', hands: 'Hands', legs: 'Legs', feet: 'Feet', ring: 'Ring', ring1: 'Ring', ring2: 'Ring', ring3: 'Ring', ring4: 'Ring' };
export const BAG_SIZE = 40;

// ------------------------------------------------------------------ the bases
// arms: the view model's kinds; dmg is the base roll at item level 1 (a two-hander hits harder,
// wands and staves put their worth into their bolts)
const ARM = {
  onehand: { slot: 'weapon', dmg: [28, 38], type: 'One-handed' },
  twohand: { slot: 'weapon', dmg: [52, 70], type: 'Two-handed' },
  wand: { slot: 'weapon', dmg: [15, 21], type: 'Wand', spell: true },
  staff: { slot: 'weapon', dmg: [26, 34], type: 'Staff', spell: true },
  shield_round: { slot: 'offhand', guard: 60, block: 0.55, type: 'Round shield' },
  shield_kite: { slot: 'offhand', guard: 95, block: 0.65, type: 'Kite shield' },
};
// a few models lean one way or another: [damage, crit] or for shields [guard, block, implicit]
const LEAN = {
  bearded_axe: [1.08, 0], butchers_axe: [1.1, 0], bone_cleaver: [1.12, -1], coffin_hammer: [1.1, -2], falchion: [1.04, 2],
  fang_blade: [0.96, 4], flanged_mace: [1.06, 0], gaolers_hook: [0.95, 5], grave_messer: [1.0, 2], morning_star: [1.12, -1],
  mourners_rapier: [0.88, 9], nail_club: [1.05, -2], reliquary_blade: [1.06, 3], scimitar: [0.98, 5], war_hammer: [1.14, -3],
  wolfjaw_sickle: [0.94, 6], claymore: [1.04, 1], flamberge: [1.02, 4], headsman: [1.12, 0], bloodletter: [0.98, 6],
  warmaul: [1.18, -3], ogre_club: [1.16, -4], tombstone: [1.22, -5], scythe: [1.0, 7], great_axe: [1.12, 0], dane_axe: [1.08, 1],
  glaive: [1.02, 3], poleaxe: [1.06, 2], gravewarden_halberd: [1.08, 1], penitents_greatsword: [1.06, 2],
};
const SHIELD_LEAN = {
  hide_targe: [0.8, 0.9, null], ironbound: [1, 1, null], skull_boss: [1.05, 1, ['thorns', 4]], spiked_buckler: [0.75, 0.95, ['thorns', 6]],
  sun_bronze: [1.15, 1.05, ['holy', 1]], banded_kite: [1, 1, null], knights_kite: [1.08, 1.02, null], scale_kite: [1.15, 1.05, ['fire', 1]],
  templar_kite: [1.12, 1.04, ['holy', 1]], thorned_kite: [1.05, 1, ['thorns', 8]],
};
// the gauntlets (the arm rigs): armour and what each is good for
const GAUNTLETS = {
  bare: { name: 'Bare hands', armor: 0 }, wayfarer: { name: "Wayfarer's Gauntlet", armor: 3 }, hunter: { name: "Hunter's Wraps", armor: 2, imp: ['crit', 3] },
  mailed: { name: 'Mailed Glove', armor: 6 }, knight: { name: "Knight's Hourglass", armor: 8, imp: ['guard', 15] }, templar: { name: 'Gilded Templar', armor: 8, imp: ['life', 15] },
  brawler: { name: 'Spiked Brawler', armor: 5, imp: ['dmgPct', 6] }, boneward: { name: 'Bone-Ward', armor: 6, imp: ['lifeSteal', 2] },
  drake: { name: 'Drakescale', armor: 9, imp: ['armorPct', 8] }, fiend: { name: "Fiend's Claw", armor: 5, imp: ['dmgPct', 9] },
  runebound: { name: 'Runebound Glove', armor: 4, imp: ['spellPct', 10] },
};
// the worn things: [name, armour, item level it starts dropping]
const WORN = {
  head: [['Hood', 2, 1, 'hood'], ['Leather Cap', 4, 1, 'cap'], ['Kettle Helm', 7, 4, 'kettle'], ['Sallet', 10, 8, 'sallet'], ['Great Helm', 14, 12, 'great']],
  body: [['Tunic', 3, 1, 'tunic'], ['Gambeson', 7, 1, 'gambeson'], ['Mail Hauberk', 13, 4, 'mail'], ['Brigandine', 18, 8, 'brigandine'], ['Plate Cuirass', 26, 12, 'plate']],
  legs: [['Breeches', 2, 1, 'breeches'], ['Padded Chausses', 4, 1, 'chausses'], ['Mail Leggings', 8, 5, 'mailLegs'], ['Plate Greaves', 13, 10, 'greaves']],
  feet: [['Shoes', 1, 1, 'shoes'], ['Riding Boots', 3, 1, 'boots'], ['Hobnailed Boots', 5, 5, 'hobnail'], ['Sabatons', 9, 10, 'sabatons']],
  ring: [['Iron Ring', 0, 1, 'ringIron'], ['Silver Ring', 0, 3, 'ringSilver'], ['Bone Ring', 0, 6, 'ringBone'], ['Gold Ring', 0, 9, 'ringGold']],
};

// ------------------------------------------------------------------ affixes
// s: the stat; v: [min, max] at item level 1, growing with it; where: the slots it rolls on
const AFFIXES = [
  { s: 'dmgPct', v: [4, 10], where: ['weapon', 'hands', 'ring'] },
  { s: 'dmg', v: [2, 6], where: ['weapon', 'ring'] },
  { s: 'crit', v: [2, 5], where: ['weapon', 'hands', 'ring', 'head'] },
  { s: 'critDmg', v: [10, 25], where: ['weapon', 'ring'] },
  { s: 'lifeSteal', v: [1, 3], where: ['weapon', 'ring', 'hands'] },
  { s: 'spellPct', v: [5, 12], where: ['weapon', 'head', 'ring', 'offhand'] },
  { s: 'armor', v: [3, 8], where: ['head', 'body', 'legs', 'feet', 'hands', 'offhand'] },
  { s: 'armorPct', v: [6, 14], where: ['head', 'body', 'legs', 'feet', 'offhand'] },
  { s: 'life', v: [8, 20], where: ['head', 'body', 'legs', 'feet', 'ring', 'offhand', 'hands'] },
  { s: 'mana', v: [8, 20], where: ['head', 'ring', 'weapon', 'body'] },
  { s: 'lifeRegen', v: [0.4, 1.2], where: ['body', 'ring', 'head'] },
  { s: 'manaRegen', v: [0.5, 1.5], where: ['ring', 'head', 'weapon'] },
  { s: 'moveSpeed', v: [4, 9], where: ['feet', 'legs'] },
  { s: 'guard', v: [10, 25], where: ['offhand', 'body', 'hands'] },
  { s: 'guardRegen', v: [10, 25], where: ['offhand', 'ring'] },
  { s: 'blockPct', v: [3, 7], where: ['offhand'] },
  { s: 'thorns', v: [3, 7], where: ['offhand', 'body'] },
];
// the shields' enchantments (Rare and up): what happens to whatever strikes the raised shield
export const ENCHANTS = {
  thorns: { name: 'Thorns', desc: (v) => `Strikes against your shield cost the attacker ${v} life`, v: [6, 12] },
  frost: { name: 'Frostbound', desc: () => 'Strikes against your shield chill the attacker: it slows to a crawl', v: [1, 1] },
  fire: { name: 'Searing', desc: (v) => `Strikes against your shield set the attacker burning (${v} a second)`, v: [3, 6] },
  holy: { name: 'Sanctified', desc: (v) => `Each blow your shield turns heals you ${v}`, v: [2, 5] },
  ward: { name: 'Spellward', desc: () => 'The raised shield stops spells as it stops blades', v: [1, 1] },
  repel: { name: 'Repelling', desc: () => 'Blows against your shield throw the attacker back', v: [1, 1] },
};
const STAT_LABEL = {
  dmgPct: (v) => `+${v}% Damage`, dmg: (v) => `+${v} Damage`, crit: (v) => `+${v}% Critical Strike`, critDmg: (v) => `+${v}% Critical Damage`,
  lifeSteal: (v) => `${v}% of melee damage stolen as life`, spellPct: (v) => `+${v}% Spell Damage`, armor: (v) => `+${v} Armour`,
  armorPct: (v) => `+${v}% Armour`, life: (v) => `+${v} Life`, mana: (v) => `+${v} Mana`, lifeRegen: (v) => `+${v} Life a second`,
  manaRegen: (v) => `+${v} Mana a second`, moveSpeed: (v) => `+${v}% Movement Speed`, guard: (v) => `+${v} Guard`,
  guardRegen: (v) => `+${v}% Guard Recovery`, blockPct: (v) => `+${v}% Blocked`, thorns: (v) => `Thorns: ${v} damage to whatever strikes your shield`,
};
export const statLabel = (s, v) => (STAT_LABEL[s] ? STAT_LABEL[s](v) : `${s} ${v}`);

// ------------------------------------------------------------------ rolling items
let manifest = null;
/** The view model's manifest: the arms' models, names and finishes. */
export function useManifest(m) { manifest = m; }
const modelsOf = (kind) => manifest?.items?.[kind] || [];
const pick = (a, R = Math.random) => a[Math.floor(R() * a.length)];
const growth = (ilvl) => 1 + (ilvl - 1) * 0.09;          // what an item level adds to the numbers
const roll = (v, ilvl, mul, R = Math.random) => {
  const x = (v[0] + (v[1] - v[0]) * R()) * growth(ilvl) * mul;
  return x < 3 ? Math.round(x * 10) / 10 : Math.round(x);
};
let serial = 1;
const uid = () => `i${Date.now().toString(36)}${(serial++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export function rollRarity(bonus = 0, R = Math.random) {
  const w = RARITY.map((r, i) => r.weight * (i ? 1 + bonus : 1));
  let x = R() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; }
  return 0;
}

/** A piece of gear. opts: {ilvl, rarity, slot ('weapon', 'offhand', 'head', ... 'ring'), kind
 * (an arm's kind), model (its id), finish}. Anything left out is rolled. */
export function makeGear(opts = {}) {
  const R = opts.R || Math.random;
  const ilvl = Math.max(1, Math.round(opts.ilvl || 1));
  const rarity = opts.rarity ?? rollRarity(opts.bonus || 0, R);
  const Rr = RARITY[rarity];
  let slot = opts.slot, kind = opts.kind;
  if (!slot && kind) slot = ARM[kind] ? ARM[kind].slot : kind === 'gauntlet' ? 'hands' : null;
  if (!slot) slot = pick(['weapon', 'weapon', 'weapon', 'offhand', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'ring'], R);
  const it = { id: uid(), type: 'gear', slot, ilvl, rarity, affixes: [], implicit: [] };
  if (slot === 'weapon' || slot === 'offhand') {
    kind ||= slot === 'weapon' ? pick(['onehand', 'onehand', 'onehand', 'twohand', 'twohand', 'wand', 'staff'], R) : pick(['shield_round', 'shield_round', 'shield_kite'], R);
    const A = ARM[kind], list = modelsOf(kind);
    const m = list.find((e) => e.id === opts.model) || pick(list, R) || { id: kind, name: A.type };
    Object.assign(it, { kind, model: m.id, base: m.name, finish: opts.finish ?? Rr.finish, slot: A.slot });
    if (A.dmg) {
      const [k, c] = LEAN[m.id] || [1, 0];
      const lo = Math.round(A.dmg[0] * k * growth(ilvl) * (0.96 + 0.08 * R())), hi = Math.round(A.dmg[1] * k * growth(ilvl) * (0.96 + 0.08 * R()));
      it.dmg = [lo, Math.max(lo + 1, hi)];
      if (c > 0) it.implicit.push({ s: 'crit', v: c });
      if (A.spell) it.implicit.push({ s: 'spellPct', v: Math.round((kind === 'staff' ? 14 : 8) * growth(ilvl)) });
    } else {
      const [g, b, imp] = SHIELD_LEAN[m.id] || [1, 1, null];
      it.guard = Math.round(A.guard * g * (1 + (ilvl - 1) * 0.045) * Rr.mul);
      it.block = Math.min(0.92, A.block * b + rarity * 0.035 + Math.min(0.08, ilvl * 0.004));
      it.armor = Math.round((kind === 'shield_kite' ? 6 : 4) * growth(ilvl));
      if (imp) it.enchants = [{ e: imp[0], v: imp[0] === 'thorns' ? Math.round(imp[1] * growth(ilvl)) : ENCHANTS[imp[0]].v[0] }];
    }
  } else if (slot === 'hands') {
    const keys = Object.keys(GAUNTLETS).filter((k) => k !== 'bare');
    const g = GAUNTLETS[opts.model] ? opts.model : pick(keys, R);
    Object.assign(it, { kind: 'gauntlet', model: g, base: GAUNTLETS[g].name, armor: Math.round(GAUNTLETS[g].armor * growth(ilvl)) });
    if (GAUNTLETS[g].imp) it.implicit.push({ s: GAUNTLETS[g].imp[0], v: GAUNTLETS[g].imp[1] });
  } else {
    const key = slot.startsWith('ring') ? 'ring' : slot;
    it.slot = key;
    const pool = WORN[key].filter((b) => b[2] <= ilvl + 2);
    const b = WORN[key].find((x) => x[0] === opts.base) || pick(pool, R);
    Object.assign(it, { kind: key, base: b[0], icon: b[3] });
    if (b[1]) it.armor = Math.round(b[1] * growth(ilvl) * (0.9 + 0.2 * R()));
  }
  // affixes
  const [a0, a1] = Rr.affixes, n = a0 + Math.floor(R() * (a1 - a0 + 1));
  const where = it.slot;
  const pool = AFFIXES.filter((a) => a.where.includes(where) && !(a.s === 'spellPct' && it.kind && ARM[it.kind] && !ARM[it.kind].spell && where === 'weapon'));
  const taken = new Set();
  for (let i = 0; i < n && taken.size < pool.length; i++) {
    let a = pick(pool, R);
    while (taken.has(a.s)) a = pick(pool, R);
    taken.add(a.s);
    it.affixes.push({ s: a.s, v: roll(a.v, ilvl, Rr.mul, R) });
  }
  // a shield's enchantments
  if (it.slot === 'offhand' && Rr.enchant) {
    const k = Math.floor(Rr.enchant) + (R() < Rr.enchant % 1 ? 1 : 0);
    it.enchants ||= [];
    for (let i = 0; i < k; i++) {
      const have = new Set(it.enchants.map((e) => e.e));
      const e = pick(Object.keys(ENCHANTS).filter((x) => !have.has(x)), R);
      if (!e) break;
      const E = ENCHANTS[e];
      it.enchants.push({ e, v: E.v[0] === E.v[1] ? E.v[0] : roll(E.v, ilvl, 1, R) });
    }
  }
  it.name = itemName(it, R);
  it.req = Math.max(1, Math.floor(ilvl * 0.8));
  return it;
}

const PREFIX = ['Grim', 'Mourning', 'Ashen', 'Hallowed', 'Gravebound', 'Vigilant', 'Hollow', 'Wailing', 'Bellwrought', 'Pale', 'Sorrowing', 'Iron-sworn', 'Tolling', 'Lantern-lit', 'Cinder', 'Rimed'];
const SUFFIX = ['of the Undercroft', 'of Bellmourn', 'of the Last Rite', 'of Ash', 'of Vigil', 'of the Mourner', 'of the Barrow', 'of Embers', 'of the Knell', 'of Gloam', 'of the Shroud', 'of Rust', 'of Thorns', 'of the Sexton'];
const UNIQUE = ['Knellbreaker', 'The Ninth Bell', 'Gravetide', 'Saint Harrow\'s Mercy', 'Widowmaker', 'The Sexton\'s Due', 'Lamentation', 'Coldiron Oath', 'The Black Chime', 'Dirge of Velscour'];
export function itemName(it, R = Math.random) {
  if (it.rarity <= 0) return it.base;
  if (it.rarity === 1) return `${pick(PREFIX, R)} ${it.base}`;
  if (it.rarity === 2) return `${pick(PREFIX, R)} ${it.base} ${pick(SUFFIX, R)}`;
  return `${pick(UNIQUE, R)}, ${it.base}`;
}

export const itemColor = (it) => (it.type === 'gear' ? RARITY[it.rarity].color : it.type === 'gold' ? '#ffd34a' : '#e8dcc0');
export const fitsSlot = (it, slot) => !!it && it.type === 'gear' && (it.slot === slot || (it.slot === 'ring' && RING_SLOTS.includes(slot)));
export const slotFor = (equip, it) => (it.slot !== 'ring' ? it.slot : RING_SLOTS.find((s) => !equip[s]) || RING_SLOTS[0]);
export const isTwoHanded = (it) => it && (it.kind === 'twohand');

export function makePotion(kind = 'life', n = 1) {
  return { id: uid(), type: 'potion', kind, count: n, name: kind === 'life' ? 'Healing Draught' : 'Mana Draught' };
}

export function itemValue(it) {
  if (it.type === 'potion') return 12 * (it.count || 1);
  return Math.round((8 + it.ilvl * 4) * (1 + it.rarity * it.rarity * 0.9) * (1 + it.affixes.length * 0.25));
}

// ------------------------------------------------------------------ the character
// the plain arm of each kind you set out with
const STARTER = { onehand: 'arming_sword', twohand: 'greatsword', wand: 'crystal_wand', staff: 'gnarled_staff', shield_round: 'ironbound', shield_kite: 'knights_kite' };

export function newCharacter() {
  const c = { equip: Object.fromEntries(SLOTS.map((s) => [s, null])), bag: Array(BAG_SIZE).fill(null), gold: 0, starter: true };
  const g = (o) => makeGear({ ilvl: 1, rarity: 0, ...o });
  c.equip.weapon = g({ kind: 'onehand', model: STARTER.onehand });
  c.equip.offhand = g({ kind: 'shield_round', model: STARTER.shield_round });
  c.equip.hands = g({ slot: 'hands', model: 'wayfarer' });
  c.equip.body = g({ slot: 'body', base: 'Tunic' });
  c.equip.feet = g({ slot: 'feet', base: 'Shoes' });
  // the rest of the arms you set out with, in the bag
  [g({ kind: 'staff', model: STARTER.staff }), g({ kind: 'twohand', model: STARTER.twohand }), g({ kind: 'wand', model: STARTER.wand }),
    g({ kind: 'shield_kite', model: STARTER.shield_kite }), makePotion('life', 3), makePotion('mana', 2)].forEach((it, i) => { c.bag[i] = it; });
  return c;
}

/** Once the manifest is in (a first visit's character is made before it, so its arms have no
 * models yet): every arm without a model of its kind gets its kind's plain one, and every
 * character, an old one too, is given the basic sword, shield and staff once, in the bag. */
export function fitCharacter(c) {
  for (const it of [...Object.values(c.equip), ...c.bag]) {
    if (!it || it.type !== 'gear' || !ARM[it.kind] || modelsOf(it.kind).some((m) => m.id === it.model)) continue;
    const e = modelsOf(it.kind).find((m) => m.id === STARTER[it.kind]) || modelsOf(it.kind)[0];
    if (!e) continue;
    it.name = it.name.replace(it.base, e.name);
    it.model = e.id; it.base = e.name;
  }
  if (!c.starter) {
    c.starter = true;
    const has = (kind) => [...Object.values(c.equip), ...c.bag].some((it) => it?.kind === kind && it.model === STARTER[kind]);
    for (const kind of ['onehand', 'shield_round', 'staff']) if (!has(kind)) addToBag(c, makeGear({ ilvl: 1, rarity: 0, kind, model: STARTER[kind] }));
  }
  return c;
}

export function loadCharacter() {
  try {
    const c = JSON.parse(localStorage.getItem('bm.char') || 'null');
    if (c && c.equip && Array.isArray(c.bag)) {
      for (const s of SLOTS) if (!(s in c.equip)) c.equip[s] = null;
      while (c.bag.length < BAG_SIZE) c.bag.push(null);
      return c;
    }
  } catch { /* a damaged save: start again */ }
  return newCharacter();
}
export function saveCharacter(c) { try { localStorage.setItem('bm.char', JSON.stringify(c)); } catch { /* private window */ } }

/** Put an item in the first free place in the bag (potions stack). False when it's full. */
export function addToBag(c, it) {
  if (it.type === 'potion') {
    const same = c.bag.find((b) => b && b.type === 'potion' && b.kind === it.kind);
    if (same) { same.count += it.count || 1; return true; }
  }
  const i = c.bag.findIndex((b) => !b);
  if (i < 0) return false;
  c.bag[i] = it;
  return true;
}

// ------------------------------------------------------------------ what it all adds up to
/** The character's numbers from what it wears. */
export function computeStats(c) {
  const st = { dmgPct: 0, dmg: 0, crit: 5, critDmg: 50, lifeSteal: 0, spellPct: 0, armor: 0, armorPct: 0, life: 0, mana: 0,
    lifeRegen: 0.4, manaRegen: 6, moveSpeed: 0, guard: 0, guardRegen: 0, blockPct: 0, thorns: 0, enchants: {} };
  for (const s of SLOTS) {
    const it = c.equip[s];
    if (!it) continue;
    if (it.armor) st.armor += it.armor;
    for (const a of [...(it.implicit || []), ...(it.affixes || [])]) st[a.s] = (st[a.s] || 0) + a.v;
    if (s === 'offhand') for (const e of it.enchants || []) st.enchants[e.e] = (st.enchants[e.e] || 0) + e.v;
  }
  st.armor = Math.round(st.armor * (1 + st.armorPct / 100));
  const w = c.equip.weapon, sh = c.equip.offhand;
  st.weapon = w?.dmg ? w.dmg : [6, 9];                    // fists
  st.weaponKind = w?.kind || null;
  // the shield: how much Guard it holds, how much of a blow it stops while it holds
  st.shield = sh && sh.guard ? { guard: sh.guard + st.guard, block: Math.min(0.95, sh.block + st.blockPct / 100), regen: 1 + st.guardRegen / 100 } : null;
  if (st.enchants.thorns || st.thorns) st.enchants.thorns = (st.enchants.thorns || 0) + st.thorns;
  st.maxLife = 100 + st.life;
  st.maxMana = 100 + st.mana;
  return st;
}
