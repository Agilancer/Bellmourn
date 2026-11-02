// Gems and sockets. The rarer the gear, the likelier it comes with sockets (a Common piece hardly
// ever has one, a Mythic always has three); Garrow cuts more into anything for a fee, up to what its
// kind and rarity will hold. A gem set in a socket gives one thing in a weapon or staff, another in
// armour, gauntlets or a ring, and a third in a shield (an enchantment, like the shields' own), and
// in a weapon, a shield or a gauntlet it shows: flames on the blade, frost, lightning, orbs circling
// it (gemfx.js). Gems come in five grades, Chipped to Perfect; three of a grade make one of the next
// at Idris's. The Starshard is a piece of the green star itself, and comes only in the one grade.
//
// A gem lying loose is an item in the bag ({type: 'gem', gem, grade, count}: like gems stack); one
// set in a socket is just {gem, grade} in its item's `sockets` (null: an empty socket).

export const GRADES = [
  null,
  { name: 'Chipped', value: 14 },
  { name: 'Flawed', value: 38 },
  { name: '', value: 105 },
  { name: 'Flawless', value: 270 },
  { name: 'Perfect', value: 680 },
];

// weapon / armor / shield: what one gem of each grade (1..5) gives there; a shield's is an
// enchantment (gear.js ENCHANTS). fx: its look (gemfx.js). look*: what the tooltip says it looks like.
export const GEMS = {
  ruby: { name: 'Ruby', color: '#ff3b30', fx: 'fire', weight: 8,
    weapon: { burnHit: [3, 5, 8, 12, 18], dmg: [1, 2, 3, 5, 7] }, armor: { life: [8, 13, 19, 27, 38] }, shield: { fire: [2, 3, 5, 7, 10] },
    look: 'Flames lick along it, and embers stream from every swing', lookWorn: 'Embers drift up about you', lookHands: 'Your hands smoulder' },
  sapphire: { name: 'Sapphire', color: '#3a7bff', fx: 'frost', weight: 8,
    weapon: { chillHit: [1, 1.5, 2, 2.5, 3.5], dmg: [1, 2, 3, 4, 6] }, armor: { mana: [8, 13, 19, 27, 38] }, shield: { frost: [1, 1, 1, 1, 1] },
    look: 'Frost smokes off it, and snow glitters in the air about it', lookWorn: 'A cold mist curls at your feet', lookHands: 'Rime creeps over your knuckles' },
  topaz: { name: 'Topaz', color: '#ffc21a', fx: 'lightning', weight: 7,
    weapon: { shockHit: [5, 9, 14, 21, 32] }, armor: { magicFind: [5, 8, 12, 17, 25] }, shield: { storm: [5, 9, 14, 21, 32] },
    look: 'Lightning crawls over it, crackling, and leaps off it into the air', lookWorn: 'Sparks snap about you', lookHands: 'Lightning crawls between your fingers' },
  emerald: { name: 'Emerald', color: '#26d36a', fx: 'venom', weight: 7,
    weapon: { poisonHit: [3, 5, 8, 12, 18] }, armor: { crit: [1, 1.5, 2, 3, 4] }, shield: { venom: [3, 5, 8, 12, 18] },
    look: 'Venom beads on it and drips, green fumes curling off it', lookWorn: 'Green fumes cling about you', lookHands: 'Venom drips from your fingertips' },
  amethyst: { name: 'Amethyst', color: '#b04dff', fx: 'arcane', weight: 7,
    weapon: { spellPct: [4, 7, 10, 14, 20], manaSteal: [0.5, 0.8, 1.2, 1.7, 2.5] }, armor: { armor: [5, 8, 12, 17, 24] }, shield: { ward: [1, 1, 1, 1, 1] },
    look: 'Orbs of violet light circle it, trailing sparks', lookWorn: 'Violet motes circle you', lookHands: 'Orbs of violet light circle your wrists' },
  diamond: { name: 'Diamond', color: '#e8f4ff', fx: 'holy', weight: 6,
    weapon: { critDmg: [8, 13, 19, 27, 40], dmgPct: [1, 2, 3, 4, 6] }, armor: { lifeRegen: [0.3, 0.5, 0.8, 1.2, 1.8] }, shield: { holy: [1, 2, 3, 4, 6] },
    look: 'It shines with a holy light, and motes of gold rise from it', lookWorn: 'Motes of gold rise about you', lookHands: 'Your hands shine' },
  bloodstone: { name: 'Bloodstone', color: '#b3001b', fx: 'blood', weight: 6,
    weapon: { lifeSteal: [0.6, 1, 1.5, 2.1, 3] }, armor: { dmgPct: [2, 3, 5, 7, 10] }, shield: { thorns: [4, 7, 11, 16, 24] },
    look: 'Blood wells up on it and runs off it, in a red mist', lookWorn: 'A red mist hangs about your feet', lookHands: 'Blood runs from your hands' },
  voidstone: { name: 'Voidstone', color: '#6b2bd6', fx: 'void', weight: 3,
    weapon: { crit: [1.5, 2.5, 3.5, 5, 7], dmgPct: [2, 4, 6, 8, 12] }, armor: { spellWard: [3, 5, 8, 11, 16] }, shield: { repel: [1, 1, 1, 1, 1] },
    look: 'Shadow coils about it, and the light about it is drawn in', lookWorn: 'Shadow coils about you', lookHands: 'Shadow coils about your hands' },
  // a piece of the green star you came down in: one grade only, and a weapon's look like no other's
  starshard: { name: 'Starshard', color: '#5dff8a', fx: 'star', weight: 0, only: 5,
    weapon: { dmgPct: [0, 0, 0, 0, 18], burnHit: [0, 0, 0, 0, 14], shockHit: [0, 0, 0, 0, 12] }, armor: { life: [0, 0, 0, 0, 30], mana: [0, 0, 0, 0, 30], spellWard: [0, 0, 0, 0, 8] },
    shield: { holy: [0, 0, 0, 0, 5], fire: [0, 0, 0, 0, 8] },
    look: 'Green star-fire burns along it, and comets wheel about it', lookWorn: 'Green star-fire flickers about you', lookHands: 'Green star-fire burns in your hands' },
};
export const GEM_KINDS = Object.keys(GEMS);

// how much grade adds to the look (gemfx.js): faint, clear, strong, blazing
export const GRADE_LOOK = ['', 'faintly', 'faintly', '', 'brightly', 'blazingly'];

let serial = 1;
const uid = () => `g${Date.now().toString(36)}${(serial++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export const gemName = (gem, grade) => {
  const G = GEMS[gem];
  if (!G) return 'Gem';
  if (G.only) return G.name;
  const g = GRADES[grade]?.name;
  return g ? `${g} ${G.name}` : G.name;
};

/** A loose gem (n of them, stacked). */
export function makeGem(gem, grade = 3, n = 1) {
  const G = GEMS[gem] || GEMS.ruby;
  const gr = G.only || Math.max(1, Math.min(5, Math.round(grade)));
  return { id: uid(), type: 'gem', gem: GEMS[gem] ? gem : 'ruby', grade: gr, count: n, name: gemName(gem, gr) };
}

/** A gem's grade for a place (an item level): chipped and flawed early on, a perfect one only far
 * out or deep down. */
export function rollGrade(ilvl, R = Math.random) {
  const w = [0, 10, 5 + ilvl * 0.35, 0.6 + ilvl * 0.4, Math.max(0, ilvl - 5) * 0.28, Math.max(0, ilvl - 11) * 0.14];
  let x = R() * w.reduce((a, b) => a + b, 0);
  for (let i = 1; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; }
  return 1;
}

/** A gem found (dropped or in a chest), for an item level; `star`: the chance it's a Starshard. */
export function rollGem(ilvl, R = Math.random, star = 0) {
  if (star && R() < star) return makeGem('starshard', 5);
  const kinds = GEM_KINDS.filter((k) => GEMS[k].weight);
  const tot = kinds.reduce((a, k) => a + GEMS[k].weight, 0);
  let x = R() * tot, kind = kinds[0];
  for (const k of kinds) { x -= GEMS[k].weight; if (x <= 0) { kind = k; break; } }
  return makeGem(kind, rollGrade(ilvl, R));
}

export const gemValue = (gem, grade) => (GEMS[gem]?.only ? 2400 : GRADES[grade]?.value || 10);

// ------------------------------------------------------------------ sockets
// how many sockets a kind of thing can hold at most, and a rarity at most (Garrow cuts up to the
// smaller of the two)
const KIND_MAX = { twohand: 4, staff: 4, onehand: 3, shield_round: 3, shield_kite: 3, body: 3, head: 2, hands: 2, legs: 2, feet: 1, ring: 1 };
const RARITY_MAX = [1, 2, 3, 4, 4, 4];
export const maxSockets = (it) => (it?.type !== 'gear' ? 0 : Math.min(KIND_MAX[it.kind] ?? KIND_MAX[it.slot] ?? 0, RARITY_MAX[it.rarity] ?? 1));
/** Sockets on a piece just found (rarer: likelier, and more of them). */
export function rollSockets(it, R = Math.random) {
  const chance = [0.04, 0.2, 0.55, 0.85, 1, 1][it.rarity] ?? 0;
  if (R() >= chance) return [];
  const n = [1, 1, 1 + (R() < 0.35 ? 1 : 0), 1 + Math.floor(R() * 2), 2 + (R() < 0.5 ? 1 : 0), 3][it.rarity] ?? 1;
  return Array(Math.max(0, Math.min(n, maxSockets(it)))).fill(null);
}
/** What Garrow asks to cut another socket (a little more for each one already in it). */
export const socketPrice = (it) => Math.round((30 + it.ilvl * 6) * (1 + (it.sockets?.length || 0) * 0.85));
/** What Idris asks to prise the gems out of something whole (they come back to you). */
export const unsocketPrice = (it) => (it.sockets || []).filter(Boolean).reduce((a, g) => a + 25 + g.grade * g.grade * 12, 0);
/** What Idris asks to make three gems one of the next grade. */
export const combinePrice = (grade) => [0, 20, 60, 160, 420][grade] || 0;
export const freeSocket = (it) => (it?.sockets ? it.sockets.indexOf(null) : -1);

/** Where in the body of things a slot counts: weapon (a weapon or staff), shield, or armour
 * (everything worn, the gauntlets and the rings). */
export const gemPlace = (slot) => (slot === 'weapon' ? 'weapon' : slot === 'offhand' ? 'shield' : 'armor');

/** What one socketed gem gives where it's set: { stats: [[stat, v]], enchants: [[enchant, v]] }. */
export function gemBonus(g, place) {
  const G = GEMS[g?.gem];
  if (!G) return { stats: [], enchants: [] };
  const i = Math.max(0, Math.min(4, (g.grade || 1) - 1));
  const of = (t) => Object.entries(t || {}).map(([k, v]) => [k, v[i]]).filter(([, v]) => v);
  return place === 'shield' ? { stats: [], enchants: of(G.shield) } : { stats: of(place === 'weapon' ? G.weapon : G.armor), enchants: [] };
}

/** Add an item's gems to the character's numbers (computeStats: gear.js). */
export function applyGems(st, it, slot) {
  const place = gemPlace(slot);
  for (const g of it.sockets || []) {
    if (!g) continue;
    const b = gemBonus(g, place);
    for (const [s, v] of b.stats) st[s] = (st[s] || 0) + v;
    for (const [e, v] of b.enchants) {
      if (e === 'thorns') st.thorns = (st.thorns || 0) + v;   // (a bloodstone's thorns count with the rest)
      else st.enchants[e] = (st.enchants[e] || 0) + v;
    }
  }
}

/** The looks an item's gems give it, strongest first: [{fx, k (how strong: 0.2 .. 1.6), top (the best grade)}]. */
export function gemLooks(it) {
  const by = new Map();
  for (const g of it?.sockets || []) {
    if (!g || !GEMS[g.gem]) continue;
    const fx = GEMS[g.gem].fx, o = by.get(fx) || { fx, k: 0, top: 0, color: GEMS[g.gem].color };
    o.k += g.grade / 5; o.top = Math.max(o.top, g.grade);
    by.set(fx, o);
  }
  return [...by.values()].map((o) => ({ ...o, k: Math.min(1.6, Math.max(0.2, o.k)) })).sort((a, b) => b.k - a.k);
}
