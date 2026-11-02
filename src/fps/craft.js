// Crafting. Everything you kill and every box you break leaves something a smith can use: iron and
// leather off the Vigil's knights, bone and grave linen off the dead, gel from the slimes, fangs and
// chitin from the Gloamhollow's things, ash and arcane dust from the sorcerers. They go into your
// materials pouch (no room in the bag taken). Plans (recipes) are found in chests and on bodies, or
// bought; read one and it's yours for good. Garrow forges from plans at Hammerfall: the materials,
// some gold, and you have a new piece, cut with sockets. The great plans want the great's own parts
// (the Ember Abbot's heart, the Red Hand's signet), and the greatest want parts of powers that have
// not yet risen in Bellmourn at all. Garrow also breaks down what you don't want for its materials
// (any gems in it come back to you).
//
// The pouch is char.mats {id: count}; the plans learned, char.recipes [id] (the basic three are
// known to everyone).
import { makeGear, RARITY } from './gear.js';
import { rollGem, makeGem, maxSockets } from './gems.js';

// ------------------------------------------------------------------ materials
// tier: 0 common .. 4 a great one's; icon: its picture (bag.js); boss: who carries it (from: where
// said); future: a power not yet met in Bellmourn
export const MATS = {
  iron: { name: 'Iron Scrap', tier: 0, value: 3, icon: 'ingot', tint: ['#8a9096', '#2a2e33', '#c8ced4'], desc: 'Bent nails, broken links, a buckle or two. Good iron, to a smith.' },
  leather: { name: 'Leather Scraps', tier: 0, value: 3, icon: 'hide', tint: ['#7a4e2a', '#2a160a', '#a87448'], desc: 'Strap ends and offcuts, still supple.' },
  linen: { name: 'Grave Linen', tier: 0, value: 2, icon: 'cloth', tint: ['#cfc4a4', '#5a5040', '#f0e8d0'], desc: 'Shroud cloth. Boiled, it is as good as new. Do not ask whose.' },
  bone: { name: 'Bone Shards', tier: 0, value: 2, icon: 'bone', tint: ['#e0d6b8', '#6a604a', '#fffbe8'], desc: 'Splinters of the restless dead. They make good pins and better charms.' },
  timber: { name: 'Seasoned Timber', tier: 0, value: 3, icon: 'log', tint: ['#8a6038', '#2e1c0c', '#b88a58'], desc: 'Old oak and ash, dry as a sermon: hafts, staves and shield boards.' },
  dust: { name: 'Grave Dust', tier: 1, value: 7, icon: 'pile', tint: ['#8c8a88', '#2c2a28', '#c8c4c0'], desc: 'Grey dust from the oldest graves. It never quite settles.' },
  steel: { name: 'Blackened Steel', tier: 1, value: 12, icon: 'ingot', tint: ['#3e4048', '#0e0e12', '#8a90a0'], desc: 'Velscour’s black steel, cut from the Vigil’s arms. Garrow swears it remembers its shape.' },
  ash: { name: 'Ember Ash', tier: 1, value: 9, icon: 'pile', tint: ['#5a4a44', '#1a1210', '#ff8a3a'], desc: 'Still warm. It glows when you breathe on it.' },
  gel: { name: 'Slime Gel', tier: 1, value: 7, icon: 'blob', tint: ['#4ac86a', '#0e3a1a', '#b8ffc8'], desc: 'A quivering lump of ooze that will not quite die.' },
  fang: { name: 'Ghast Fang', tier: 1, value: 10, icon: 'fang', tint: ['#e8e0c8', '#4a4030', '#ffffff'], desc: 'Long as a finger and hollow, like a viper’s.' },
  chitin: { name: 'Grubber Chitin', tier: 1, value: 10, icon: 'plate', tint: ['#5a6a3a', '#1a200e', '#a8b878'], desc: 'A plate of grubber shell, harder than horn and half the weight.' },
  arcane: { name: 'Arcane Dust', tier: 2, value: 24, icon: 'sparkle', tint: ['#9a5aff', '#2a0e5a', '#e8d0ff'], desc: 'What is left when an enchantment is broken: a glittering violet grit.' },
  soul: { name: 'Soul Ember', tier: 3, value: 70, icon: 'flame', tint: ['#5ab8ff', '#0a2a5a', '#e0f4ff'], desc: 'A coal that burns without heat, and whispers. The great dead leave them.' },
  starglass: { name: 'Starglass', tier: 3, value: 45, icon: 'shard', tint: ['#4aff7a', '#0a4a1a', '#dcffe4'], desc: 'Green glass the falling star left behind it. It hums in the hand.' },
  // the great ones' own (each carries one)
  cinderheart: { name: 'Cinder Heart', tier: 4, value: 400, icon: 'heart', tint: ['#ff5a1a', '#4a0e00', '#ffd08a'], boss: 'abbot', from: 'Abbot Cindermaw, the Ember Abbot', desc: 'The Ember Abbot’s heart, still burning a hundred years on.' },
  brine: { name: 'Brine of the Drowned Mother', tier: 4, value: 400, icon: 'vial', tint: ['#5ab8c8', '#0a2a30', '#d8ffff'], boss: 'mother', from: 'the Drowned Mother', desc: 'Black water that was in her instead of blood. It is colder than it should be.' },
  saintsash: { name: 'Ashes of Saint Ivo', tier: 4, value: 400, icon: 'vial', tint: ['#d8c088', '#3a3010', '#fff4c8'], boss: 'wight', from: 'the Wight of Saint Ivo', desc: 'What the wight wore of the saint. It is warm, and smells of incense.' },
  tusk: { name: 'Gnarlgut’s Tusk', tier: 4, value: 400, icon: 'fang', tint: ['#d8c8a0', '#4a3a20', '#fff8e0'], boss: 'king', from: 'Old Gnarlgut, the Trollhole King', desc: 'A tusk as long as your arm, yellow and notched with forty winters of fights.' },
  signet: { name: 'The Red Hand’s Signet', tier: 4, value: 600, icon: 'signet', tint: ['#c81a1a', '#3a0000', '#ffb0a0'], boss: 'malgrave', from: 'Ser Malgrave, the Red Hand', desc: 'Velscour’s V, cut into a ruby the size of a thumbnail. Malgrave sealed his hangings with it.' },
  // the parts of powers not yet risen in Bellmourn (the greatest plans want them)
  ichor: { name: 'Black Ichor of Velscour', tier: 4, value: 2000, icon: 'vial', tint: ['#3a0a3a', '#000000', '#ff3a8a'], boss: 'velscour', future: true, from: 'the Demon Lord Velscour, upon his far throne', desc: 'Said to be the only thing that can cut what he is. Nobody living has seen it.' },
  wyrmscale: { name: 'Scale of the Bell-Wyrm', tier: 4, value: 1500, icon: 'plate', tint: ['#7a8a9a', '#1a2028', '#e0eaff'], boss: 'bellwyrm', future: true, from: 'the Bell-Wyrm that sleeps beneath the Mourning Bell', desc: 'The Litany says the first bell was hung over its head to keep it sleeping.' },
  hollowcrown: { name: 'Shard of the Hollow Crown', tier: 4, value: 1500, icon: 'shard', tint: ['#c8a838', '#3a2a08', '#fff0a0'], boss: 'hollowking', future: true, from: 'the Hollow King of the Barrowdeep', desc: 'A king was buried with it, and something with no face wears it now.' },
  gloamheart: { name: 'Heart of the Gloam', tier: 4, value: 1500, icon: 'heart', tint: ['#4affd0', '#003a2a', '#d8fff4'], boss: 'gloammother', future: true, from: 'the Gloam Mother, far beneath the Gloamhollow', desc: 'Every glowcap in the cliff grows from one root. This is where the root ends.' },
};
export const MAT_TIER = ['Common', 'Uncommon', 'Rare', 'Precious', 'Reagent of the Great'];
export const MAT_TIER_COLOR = ['#cfc4a8', '#4fd65a', '#4f8dff', '#b45cff', '#ff9a2a'];
/** The reagent a great one leaves, by who they are (quests.js champions' keys, 'malgrave', and the
 * ones still to come). */
export const BOSS_REAGENT = Object.fromEntries(Object.entries(MATS).filter(([, m]) => m.boss).map(([id, m]) => [m.boss, id]));

export const makeMat = (mat, n = 1) => ({ type: 'mat', mat, n, name: MATS[mat]?.name || mat });

// ------------------------------------------------------------------ plans
// at: 'forge' (Garrow) or 'gems' (Idris). tier: 0 known to all, 1 common plans, 2 rare, 3 the great
// ones' (their reagents), 4 the greatest (reagents of powers not yet met). makes: {kind | slot, model,
// base, rarity [min, max], sockets [min, max], add {stat: [min, max]}} or {unique: {...}} or {gem}.
export const RECIPES = {
  blade: { name: 'Forged Blade', tier: 0, at: 'forge', level: 1, gold: 40, needs: { iron: 6, leather: 2 },
    makes: { kind: 'onehand', model: 'arming_sword', rarity: [1, 1], sockets: [1, 1] }, desc: 'A plain, honest sword, with a socket cut in its guard.' },
  roundshield: { name: 'Banded Roundshield', tier: 0, at: 'forge', level: 1, gold: 40, needs: { iron: 5, timber: 3 },
    makes: { kind: 'shield_round', model: 'ironbound', rarity: [1, 1], sockets: [1, 1] }, desc: 'Boards of seasoned oak, banded with iron.' },
  jerkin: { name: 'Stitched Jerkin', tier: 0, at: 'forge', level: 1, gold: 30, needs: { leather: 4, linen: 4 },
    makes: { slot: 'body', base: 'Gambeson', rarity: [1, 1], sockets: [1, 1] }, desc: 'Quilted linen under a skin of leather.' },
  // plans found about the world, or bought
  greatblade: { name: 'Two-Hand Blade', tier: 1, at: 'forge', level: 3, gold: 120, needs: { iron: 10, steel: 2, leather: 3 },
    makes: { kind: 'twohand', rarity: [1, 2], sockets: [1, 2] }, desc: 'A long blade or a heavy head on a long haft: whichever the steel wants to be.' },
  emberstaff: { name: 'Ember-Wood Staff', tier: 1, at: 'forge', level: 3, gold: 120, needs: { timber: 6, ash: 3, arcane: 1 },
    makes: { kind: 'staff', rarity: [1, 2], sockets: [1, 2], add: { spellPct: [8, 14] } }, desc: 'Ash wood soaked in ember ash. Spells run up it like fire up a wick.' },
  helm: { name: 'Riveted Helm', tier: 1, at: 'forge', level: 2, gold: 60, needs: { iron: 6, linen: 2 },
    makes: { slot: 'head', rarity: [1, 2], sockets: [1, 1] }, desc: 'Plates riveted over a padded cap.' },
  greaves: { name: 'Ringed Greaves', tier: 1, at: 'forge', level: 3, gold: 60, needs: { iron: 6, leather: 2 },
    makes: { slot: 'legs', rarity: [1, 2], sockets: [1, 1] } },
  ghastboots: { name: 'Ghast-Hide Boots', tier: 1, at: 'forge', level: 4, gold: 80, needs: { leather: 5, fang: 2 },
    makes: { slot: 'feet', rarity: [1, 2], sockets: [0, 1], add: { moveSpeed: [5, 9] } }, desc: 'Soled with ghast hide: you go as quietly as they do, and as quickly.' },
  chitingrip: { name: 'Chitin Gauntlet', tier: 1, at: 'forge', level: 5, gold: 150, needs: { steel: 3, leather: 3, chitin: 2 },
    makes: { slot: 'hands', rarity: [2, 2], sockets: [1, 1], add: { armor: [4, 7] } } },
  bonering: { name: 'Bone-Set Ring', tier: 1, at: 'forge', level: 4, gold: 140, needs: { bone: 6, dust: 3, arcane: 1 },
    makes: { slot: 'ring', base: 'Bone Ring', rarity: [2, 2], sockets: [1, 1] }, desc: 'Grave dust pressed into a band of bone. It rattles faintly when the dead are near.' },
  // rare plans
  vigilblade: { name: 'Vigil Longsword', tier: 2, at: 'forge', level: 8, gold: 400, needs: { steel: 6, iron: 8, arcane: 2 },
    makes: { kind: 'onehand', model: 'reliquary_blade', rarity: [2, 3], sockets: [2, 2], add: { dmgPct: [12, 20] } }, desc: 'The pattern the Vigil’s armourers kept, before the Vigil turned.' },
  swornkite: { name: 'Sworn Kite', tier: 2, at: 'forge', level: 10, gold: 600, needs: { steel: 8, chitin: 4, arcane: 3 },
    makes: { kind: 'shield_kite', model: 'knights_kite', rarity: [3, 3], sockets: [2, 2], add: { guard: [20, 35] } } },
  swornplate: { name: 'Sworn Plate', tier: 2, at: 'forge', level: 12, gold: 800, needs: { steel: 10, iron: 10, soul: 1 },
    makes: { slot: 'body', base: 'Plate Cuirass', rarity: [3, 3], sockets: [2, 3] }, desc: 'Black plate, as the Sworn wear it. Garrow scrubs the V off for you.' },
  ghastrapier: { name: 'Ghast-Tooth Rapier', tier: 2, at: 'forge', level: 9, gold: 500, needs: { fang: 6, steel: 4, arcane: 2 },
    makes: { kind: 'onehand', model: 'mourners_rapier', rarity: [3, 3], sockets: [1, 2], add: { crit: [5, 8], critDmg: [20, 35] } } },
  oozering: { name: 'Ring of the Living Ooze', tier: 2, at: 'forge', level: 7, gold: 450, needs: { gel: 10, arcane: 3 },
    makes: { slot: 'ring', base: 'Silver Ring', rarity: [3, 3], sockets: [1, 1], add: { life: [20, 30], lifeRegen: [1, 1.8] } } },
  // the great ones' plans: each wants the reagent its great one carries
  cinderbrand: { name: 'Cinderbrand', tier: 3, at: 'forge', level: 12, gold: 2500, needs: { cinderheart: 1, soul: 3, steel: 12, ash: 10 },
    makes: { unique: { name: 'Cinderbrand', kind: 'twohand', model: 'flamberge', finish: 'bloodforged', rarity: 4, sockets: 3,
      affixes: { dmgPct: 38, burnHit: 18, critDmg: 35, life: 30 }, lore: 'Quenched in the Ember Abbot’s heart. Its waves never stop glowing.' } } },
  tidecaller: { name: 'Tidecaller', tier: 3, at: 'forge', level: 12, gold: 2500, needs: { brine: 1, soul: 3, gel: 12, arcane: 8 },
    makes: { unique: { name: 'Tidecaller', kind: 'staff', model: 'serpent_staff', finish: 'frostbound', rarity: 4, sockets: 3,
      affixes: { spellPct: 40, mana: 50, manaRegen: 3, chillHit: 3 }, lore: 'The serpent’s mouth is always wet. Hold it to your ear and the Grotto breathes.' } } },
  saintsward: { name: 'Saint Ivo’s Ward', tier: 3, at: 'forge', level: 12, gold: 2500, needs: { saintsash: 1, soul: 2, steel: 10, linen: 8 },
    makes: { unique: { name: 'Saint Ivo’s Ward', kind: 'shield_kite', model: 'templar_kite', finish: 'gilded', rarity: 4, sockets: 2,
      affixes: { guard: 60, blockPct: 8, life: 40, lifeRegen: 1.5 }, enchants: [['holy', 6], ['ward', 1]], lore: 'His ashes are sealed in its boss. It has never once been broken.' } } },
  gnarlhide: { name: 'Gnarlhide Grips', tier: 3, at: 'forge', level: 12, gold: 2500, needs: { tusk: 1, chitin: 12, leather: 12, soul: 2 },
    makes: { unique: { name: 'Gnarlhide Grips', slot: 'hands', model: 'drake', rarity: 4, sockets: 2,
      affixes: { armor: 18, dmgPct: 16, life: 35, lifeSteal: 2 }, lore: 'Troll hide over chitin, the knuckles shod with his tusk. They heal when you hit things.' } } },
  redhand: { name: 'The Red Hand Undone', tier: 3, at: 'forge', level: 14, gold: 6000, needs: { signet: 1, soul: 5, starglass: 6, steel: 15 },
    makes: { unique: { name: 'The Red Hand Undone', kind: 'onehand', model: 'reliquary_blade', finish: 'bloodforged', rarity: 5, sockets: 3,
      affixes: { dmgPct: 55, crit: 9, critDmg: 60, lifeSteal: 3.5, burnHit: 20 }, lore: 'Malgrave’s seal, cut out of its ring and set in a blade forged to hang him with.' } } },
  // the greatest: they want parts of powers that have not yet risen
  velscourbane: { name: 'Velscourbane', tier: 4, at: 'forge', level: 20, gold: 15000, needs: { ichor: 1, wyrmscale: 1, soul: 8, starglass: 12 },
    makes: { unique: { name: 'Velscourbane', kind: 'twohand', model: 'penitents_greatsword', finish: 'gilded', rarity: 5, sockets: 4,
      affixes: { dmgPct: 80, critDmg: 90, crit: 10, lifeSteal: 4, shockHit: 30, burnHit: 30 }, lore: 'The Canticle’s last page: “and the Flame took up the black blood of the Fiend, and made of it the blade that ended him.”' } } },
  wyrmhauberk: { name: 'Wyrmscale Hauberk', tier: 4, at: 'forge', level: 18, gold: 9000, needs: { wyrmscale: 2, soul: 6, steel: 20 },
    makes: { unique: { name: 'Wyrmscale Hauberk', slot: 'body', base: 'Plate Cuirass', rarity: 5, sockets: 3,
      affixes: { armor: 60, armorPct: 30, life: 80, spellWard: 20, lifeRegen: 3 }, lore: 'Every scale rings like a bell when it is struck.' } } },
  hollowcrown: { name: 'The Hollow Crown', tier: 4, at: 'forge', level: 18, gold: 9000, needs: { hollowcrown: 1, soul: 5, arcane: 12 },
    makes: { unique: { name: 'The Hollow Crown', slot: 'head', base: 'Great Helm', rarity: 5, sockets: 2,
      affixes: { armor: 30, life: 60, mana: 60, spellPct: 30, xpPct: 15 }, lore: 'Whoever wears it hears a king counting, very slowly, in the dark.' } } },
  gloamring: { name: 'Heart of the Gloam', tier: 4, at: 'forge', level: 16, gold: 6000, needs: { gloamheart: 1, starglass: 4, gel: 10 },
    makes: { unique: { name: 'Heart of the Gloam', slot: 'ring', base: 'Gold Ring', rarity: 4, sockets: 1,
      affixes: { life: 40, mana: 40, magicFind: 30, spellWard: 12 }, lore: 'It glows in the dark, and in the light it glows a little more.' } } },
  // Idris's formulas
  starshard: { name: 'Starshard', tier: 2, at: 'gems', level: 6, gold: 1500, needs: { starglass: 12, soul: 2 },
    makes: { gem: 'starshard' }, desc: 'Twelve pieces of the green star, fused in a soul’s ember into one. Idris will not say how he knows.' },
};
export const PLAN_TIER = ['Plain', 'Plans', 'Rare Plans', 'Plans of the Great', 'Plans of Legend'];
export const PLAN_COLOR = ['#cfc4a8', '#4fd65a', '#4f8dff', '#ff9a2a', '#ff4058'];
// the plans each great one carries with their reagent
export const BOSS_PLAN = { abbot: 'cinderbrand', mother: 'tidecaller', wight: 'saintsward', king: 'gnarlhide', malgrave: 'redhand' };

export const makeRecipe = (id) => ({ type: 'recipe', recipe: id, name: `${RECIPES[id]?.at === 'gems' ? 'Formula' : 'Plans'}: ${RECIPES[id]?.name || id}`, tier: RECIPES[id]?.tier ?? 1, count: 1 });
export const recipeValue = (id) => [10, 30, 140, 700, 1500][RECIPES[id]?.tier ?? 1];
export const matValue = (mat) => MATS[mat]?.value || 2;

/** A plan found, of tiers up to `max` (the greatest are rare even where they can be found). */
export function rollRecipe(max = 1, R = Math.random) {
  let tier = 1;
  if (max >= 2 && R() < 0.3) tier = 2;
  if (max >= 4 && R() < 0.06) tier = 4;
  const ids = Object.keys(RECIPES).filter((k) => RECIPES[k].tier === tier);
  return makeRecipe(ids[Math.floor(R() * ids.length)]);
}

// ------------------------------------------------------------------ the character's pouch and plans
export function fitCraft(c) {
  if (!c.mats || typeof c.mats !== 'object') c.mats = {};
  if (!Array.isArray(c.recipes)) c.recipes = [];
  return c;
}
export const knows = (c, id) => RECIPES[id]?.tier === 0 || (c.recipes || []).includes(id);
export const known = (c, at = null) => Object.keys(RECIPES).filter((id) => knows(c, id) && (!at || RECIPES[id].at === at));
export function addMat(c, mat, n = 1) { fitCraft(c); c.mats[mat] = (c.mats[mat] || 0) + n; }
/** Learn a plan (false: known already). */
export function learn(c, id) { fitCraft(c); if (!RECIPES[id] || knows(c, id)) return false; c.recipes.push(id); return true; }

/** What a plan still wants: [[mat, have, need]] for each, and whether the gold is there. */
export function check(c, id) {
  const r = RECIPES[id];
  fitCraft(c);
  const needs = Object.entries(r.needs).map(([m, n]) => [m, c.mats[m] || 0, n]);
  const gold = (c.gold || 0) >= (r.gold || 0);
  return { needs, gold, ok: gold && needs.every(([, h, n]) => h >= n) && (c.level || 1) >= (r.level || 1) - 3, level: r.level || 1 };
}

/** Make it: takes the materials and gold, returns the new thing (or null). */
export function forge(c, id, R = Math.random) {
  const r = RECIPES[id];
  if (!r || !knows(c, id) || !check(c, id).ok) return null;
  for (const [m, n] of Object.entries(r.needs)) c.mats[m] -= n;
  c.gold -= r.gold || 0;
  return made(r, Math.max(r.level || 1, c.level || 1), R);
}

/** What a plan makes, at an item level (also how its preview is shown: R a fixed roll). */
export function made(r, ilvl, R = Math.random) {
  const M = r.makes;
  if (M.gem) return makeGem(M.gem, 5);
  if (M.unique) {
    const u = M.unique;
    const it = makeGear({ ilvl, rarity: u.rarity, kind: u.kind, slot: u.slot, model: u.model, base: u.base, finish: u.finish, R });
    it.name = u.name;
    it.affixes = Object.entries(u.affixes).map(([s, v]) => ({ s, v }));
    if (u.enchants) it.enchants = u.enchants.map(([e, v]) => ({ e, v }));
    it.sockets = Array(u.sockets || 0).fill(null);
    it.lore = u.lore;
    it.forged = r.name;
    return it;
  }
  const rarity = M.rarity[0] + Math.floor(R() * (M.rarity[1] - M.rarity[0] + 1));
  const it = makeGear({ ilvl, rarity, kind: M.kind, slot: M.slot, model: M.model, base: M.base, R });
  for (const [s, [a, b]] of Object.entries(M.add || {})) {
    const v = a + (b - a) * R(), val = v < 3 ? Math.round(v * 10) / 10 : Math.round(v);
    const have = it.affixes.find((x) => x.s === s);
    if (have) have.v = Math.max(have.v, val); else it.affixes.push({ s, v: val });
  }
  const n = M.sockets ? M.sockets[0] + Math.floor(R() * (M.sockets[1] - M.sockets[0] + 1)) : 0;
  it.sockets = Array(Math.max(it.sockets?.length || 0, Math.min(n, Math.max(n, maxSockets(it))))).fill(null);
  it.forged = r.name;
  return it;
}

// ------------------------------------------------------------------ breaking things down
// a fixed roll from the item's id, so what Garrow says you'll get is what you get
const seeded = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; };
const METAL = /Mail|Plate|Sallet|Kettle|Great Helm|Greaves|Sabatons|Hobnail|Iron Ring/;
const HIDE = /Leather|Boots|Shoes|Brigandine/;
/** What breaking a piece down gives: { mats: {id: n}, gems: [loose gems back] }. */
export function salvageYield(it) {
  const R = seeded(it.id), mats = {}, add = (m, n) => { if (n > 0) mats[m] = (mats[m] || 0) + n; };
  const r = (a, b) => a + Math.floor(R() * (b - a + 1));
  const big = it.kind === 'twohand';
  if (it.kind === 'staff') { add('timber', r(2, 3)); add('ash', R() < 0.3 ? 1 : 0); }
  else if (it.slot === 'weapon') { add('iron', r(big ? 3 : 1, big ? 5 : 3)); add('leather', R() < 0.4 ? 1 : 0); add('timber', /axe|hammer|maul|club|glaive|halberd|poleaxe|scythe/.test(it.model || '') ? 1 : 0); }
  else if (it.slot === 'offhand') { add('iron', r(1, 2)); add('timber', r(1, 2)); }
  else if (it.slot === 'hands') { add('leather', r(1, 2)); add('iron', R() < 0.6 ? 1 : 0); }
  else if (it.slot === 'ring') { if (/Bone/.test(it.base)) add('bone', r(2, 3)); else add('iron', 1); add('dust', R() < 0.5 ? 1 : 0); }
  else if (METAL.test(it.base || '')) { add('iron', r(2, 4)); add('leather', R() < 0.3 ? 1 : 0); }
  else if (HIDE.test(it.base || '')) { add('leather', r(2, 3)); if (/Brigandine/.test(it.base)) add('iron', r(1, 2)); }
  else add('linen', r(2, 4));
  const metal = it.slot === 'weapon' && it.kind !== 'staff' || it.slot === 'offhand' || METAL.test(it.base || '');
  if (metal && it.ilvl >= 8) add('steel', r(1, it.ilvl >= 15 ? 3 : 2));
  const q = it.rarity || 0;
  if (q === 1) add(Object.keys(mats)[0] || 'iron', 1);
  if (q >= 2) add('arcane', q - 1 + (R() < 0.5 ? 1 : 0));
  if (q >= 3) add('soul', q === 3 ? (R() < 0.3 ? 1 : 0) : q - 3);
  if (q >= 5) add('starglass', 1);
  const gems = (it.sockets || []).filter(Boolean).map((g) => makeGem(g.gem, g.grade));
  return { mats, gems };
}

// ------------------------------------------------------------------ what's found
const chance = (p, R) => R() < p;
const between = (a, b, R) => a + Math.floor(R() * (b - a + 1));
/** What a death leaves for the crafter besides its loot: materials, now and then a gem, rarely a plan.
 * z: the dead (zombies.js, foes.js) or a slime; lv: the place's item level. */
export function deathDrops(z, lv, R = Math.random) {
  const out = [], mat = (m, n = 1) => { if (n > 0) out.push(makeMat(m, n)); };
  let gem = 0, plan = 0;
  if (z.slime) {
    if (chance(z.big ? 0.9 : 0.4, R)) mat('gel', z.big ? between(2, 4, R) : 1);
    gem = z.big ? 0.06 : 0.015;
  } else if (z.def) {
    const sworn = !!z.def.body, k = z.kindName;
    if (sworn) { if (chance(0.65, R)) mat('steel', between(1, 2, R)); if (chance(0.45, R)) mat('iron', between(1, 3, R)); if (chance(0.25, R)) mat('leather', 1); if (chance(0.12, R)) mat('arcane', 1); gem = 0.14; plan = 0.04; }
    else if (k === 'knight') { if (chance(0.7, R)) mat('iron', between(1, 3, R)); if (chance(0.3, R)) mat('steel', 1); if (chance(0.3, R)) mat('leather', 1); gem = 0.08; plan = 0.025; }
    else if (k === 'sorcerer') { if (chance(0.5, R)) mat('linen', between(1, 2, R)); if (chance(0.6, R)) mat('ash', between(1, 2, R)); if (chance(0.15, R)) mat('arcane', 1); gem = 0.1; plan = 0.025; }
    else if (k === 'ghast') { if (chance(0.55, R)) mat('fang', 1); if (chance(0.3, R)) mat('bone', 1); gem = 0.05; }
    else if (k === 'grubber') { if (chance(0.6, R)) mat('chitin', between(1, 2, R)); gem = 0.05; }
  } else {
    const under = z.zone === 'dungeon';
    if (chance(0.35, R)) mat('bone', between(1, 2, R));
    if (chance(0.22, R)) mat('linen', 1);
    if (chance(under ? 0.3 : 0.12, R)) mat('dust', 1);
    if (z.variant === 'ember_husk' && chance(0.5, R)) mat('ash', between(1, 2, R));
    if (z.variant === 'bloated_drowner' && chance(0.3, R)) mat('gel', 1);
    gem = under ? 0.06 : 0.04; plan = under ? 0.008 : 0.004;
  }
  if (chance(0.006, R)) mat('starglass', 1);
  if (gem && chance(gem, R)) out.push(rollGem(lv, R, 0.004));
  if (plan && chance(plan, R)) out.push(rollRecipe(lv >= 8 ? 2 : 1, R));
  return out;
}

/** A great one's death: its reagent, its plan, soul embers and gems. key: a champion's (quests.js)
 * or 'malgrave' (or one of those still to come: BOSS_REAGENT). */
export function greatDrops(key, lv, R = Math.random) {
  const out = [];
  if (BOSS_REAGENT[key]) out.push(makeMat(BOSS_REAGENT[key], 1));
  if (BOSS_PLAN[key]) out.push(makeRecipe(BOSS_PLAN[key]));
  out.push(makeMat('soul', between(2, 3, R)), makeMat('arcane', between(2, 4, R)));
  out.push(rollGem(Math.max(lv, 12), R, 0.12), rollGem(Math.max(lv, 10), R));
  return out;
}

/** What a container holds for the crafter, by its kind (loot.js HOLDS names) at an item level. */
export function containerDrops(name, lv, R = Math.random) {
  const out = [], mat = (m, n = 1) => out.push(makeMat(m, n));
  const n = String(name || '');
  if (/gilded|reliquary/.test(n)) {
    mat(['steel', 'arcane', 'dust', 'iron'][between(0, 3, R)], between(1, 3, R));
    if (chance(0.5, R)) out.push(rollGem(lv + 2, R, 0.03));
    if (chance(0.16, R)) out.push(rollRecipe(4, R));
    if (chance(0.25, R)) mat('starglass', 1);
  } else if (/chest|coffer/.test(n) || /ossuary|sarcophagus/.test(n)) {
    const tomb = /ossuary|sarcophagus/.test(n);
    if (chance(0.6, R)) mat(tomb ? ['bone', 'linen', 'dust'][between(0, 2, R)] : ['iron', 'leather', 'linen', 'timber'][between(0, 3, R)], between(1, 3, R));
    if (chance(tomb ? 0.14 : 0.22, R)) out.push(rollGem(lv, R, 0.006));
    if (chance(0.07, R)) out.push(rollRecipe(lv >= 8 ? 2 : 1, R));
  } else if (/crate|barrel/.test(n)) {
    if (chance(0.38, R)) mat(['timber', 'iron', 'leather', 'linen'][between(0, 3, R)], between(1, 2, R));
    if (chance(0.03, R)) out.push(rollGem(lv, R));
  } else if (/sack|cupboard/.test(n)) {
    if (chance(0.3, R)) mat(['linen', 'leather'][between(0, 1, R)], between(1, 2, R));
    if (chance(0.03, R)) out.push(rollGem(lv, R));
  } else if (chance(0.08, R)) mat(['dust', 'bone'][between(0, 1, R)], 1);   // (the pots, jars, urns)
  return out;
}

export const rarityColor = (r) => RARITY[r]?.color || '#ccc';
