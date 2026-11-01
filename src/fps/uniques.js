// The village's own treasures: one of a kind, given for the work you do for Bellmourn (quests.js).
// Each is a real model (the manifest's arms, the gauntlet rigs, the worn things) in its own finish,
// with its own name, its own fixed powers and a line of its story. Some carry powers nothing else
// rolls: blows that set the dead burning, or chill them to a crawl.
import { makeGear } from './gear.js';

export const UNIQUES = {
  garrowsoath: { name: "Garrow's Oath", kind: 'twohand', model: 'claymore', finish: 'worn', rarity: 3, ilvl: 3,
    affixes: { dmgPct: 20, crit: 4, life: 18, critDmg: 20 },
    lore: 'Garrow the smith forged it for his son, who took the cathedral stair and did not come back up. He gave it to the stranger who did.' },
  bellwarden: { name: 'Bellwarden', kind: 'onehand', model: 'reliquary_blade', finish: 'gilded', rarity: 3, ilvl: 6,
    affixes: { dmgPct: 22, crit: 5, lifeSteal: 2, burnHit: 6 },
    lore: 'Forged from the clapper of the first Mourning Bell. It hums when the dead are near, and they burn where it bites.' },
  censer: { name: 'Censer of the Ninth Bell', kind: 'staff', model: 'brazier_staff', finish: 'gilded', rarity: 4, ilvl: 14,
    affixes: { spellPct: 34, mana: 40, manaRegen: 2.5, burnHit: 9 },
    lore: 'The Ember Abbot swung it over the Deep Undercroft for a hundred years. The coals in its cage never go out.' },
  ringers: { name: "The Ringers' Clapper", slot: 'ring', base: 'Bone Ring', rarity: 3, ilvl: 3,
    affixes: { life: 16, lifeRegen: 0.8, xpPct: 8 },
    lore: 'A sliver of the first clapper, worn on a ring by the ringers of Bellmourn. They say the dead go quiet near it. They do not.' },
  thornring: { name: "Mother Hesk's Thornring", slot: 'ring', base: 'Bone Ring', rarity: 3, ilvl: 5,
    affixes: { life: 28, lifeRegen: 1.6, lifeSteal: 1.5 },
    lore: 'Gravebloom root, wound and dried and set in bone. "It pricks. That is how you know it works."' },
  wallofthewatch: { name: 'Wall of the Watch', kind: 'shield_kite', model: 'templar_kite', rarity: 3, ilvl: 10,
    affixes: { guard: 40, blockPct: 6, armor: 12, life: 20 }, enchants: [['holy', 4], ['ward', 1]],
    lore: 'Carried by the sergeants of Bellmourn since before the Vigil turned. Brand painted over the V himself.' },
  hammerfall: { name: 'Hammerfall Grips', slot: 'hands', model: 'drake', rarity: 3, ilvl: 10,
    affixes: { armor: 10, dmgPct: 12, guard: 25, crit: 3 },
    lore: 'Garrow quenched these in the oil of a dozen Sworn blades. Nothing they hold ever slips.' },
  gloamstaff: { name: 'Gloamstaff', kind: 'staff', model: 'caged_orb', finish: 'frostbound', rarity: 3, ilvl: 11,
    affixes: { spellPct: 28, mana: 30, manaRegen: 2.2, chillHit: 3 },
    lore: 'A glowcap cap in a cage of black iron. Idris says it is perfectly safe. Idris has no eyebrows.' },
  trollbane: { name: 'Trollbane', kind: 'twohand', model: 'dane_axe', finish: 'bloodforged', rarity: 4, ilvl: 16,
    affixes: { dmgPct: 34, critDmg: 45, lifeSteal: 3, crit: 4 },
    lore: 'Wren’s grandfather’s axe, lost in the Trollhole forty winters ago and found in its king’s belly.' },
  pearl: { name: "The Drowned Mother's Pearl", slot: 'ring', base: 'Silver Ring', rarity: 4, ilvl: 14,
    affixes: { mana: 35, spellPct: 18, manaRegen: 2, moveSpeed: 6 },
    lore: 'Cold as the bottom of the Grotto. Hold it to your ear and something on the other side is breathing.' },
  halo: { name: 'Halo of Saint Ivo', slot: 'head', base: 'Sallet', rarity: 4, ilvl: 15,
    affixes: { armor: 18, life: 35, lifeRegen: 1.2, spellPct: 12 },
    lore: 'The saint’s own helm, from his reliquary. The gilt ring set into its brow still gives off a little light.' },
  striders: { name: "Watchman's Striders", slot: 'feet', base: 'Riding Boots', rarity: 3, ilvl: 9,
    affixes: { moveSpeed: 14, armor: 8, life: 18 },
    lore: 'The old watch walked the walls in these every night for sixty years. They still want to keep moving.' },
  tessarielsbrand: { name: "Tessariel's Brand", kind: 'onehand', model: 'arming_sword', finish: 'gilded', rarity: 5, ilvl: 22,
    affixes: { dmgPct: 48, crit: 8, critDmg: 55, lifeSteal: 3, spellPct: 20, burnHit: 16 },
    lore: 'Struck from the Red Hand’s own blade in the green fire you came down in. The Canticle calls it the Flame’s first tooth.' },
  // the knight's things, thrown about the crater
  vigilsword: { name: 'Vigil Arming Sword', kind: 'onehand', model: 'arming_sword', finish: 'ancient', rarity: 1, ilvl: 2, affixes: { dmgPct: 6 },
    lore: 'A Sworn’s sword, scorched black. Still sharp.' },
  vigilshield: { name: 'Vigil Knight’s Kite', kind: 'shield_kite', model: 'knights_kite', rarity: 1, ilvl: 2, affixes: { guard: 10 },
    lore: 'Velscour’s V, half melted off its face.' },
  vigilstaff: { name: 'Vigil Crescent Staff', kind: 'staff', model: 'crescent_staff', rarity: 1, ilvl: 2, affixes: { spellPct: 6 },
    lore: 'The knight carried it for an adept who never came back from the wood.' },
};

/** A treasure by its id, made fresh. */
export function makeUnique(id) {
  const u = UNIQUES[id];
  if (!u) return null;
  const it = makeGear({ ilvl: u.ilvl, rarity: u.rarity, kind: u.kind, slot: u.slot, model: u.model, base: u.base, finish: u.finish });
  it.name = u.name;
  it.unique = id;
  it.lore = u.lore;
  it.affixes = Object.entries(u.affixes).map(([s, v]) => ({ s, v }));
  if (u.enchants) it.enchants = u.enchants.map(([e, v]) => ({ e, v }));
  return it;
}
