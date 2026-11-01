// Levels. Bellmourn has no classes: whatever you kill and whatever you do for the village earns
// experience, every level makes you a little harder to kill and a little deadlier, and gives you
// three points to put where you like:
//   Might    +2% damage, +2 life
//   Vigour   +8 life, +0.1 life a second
//   Arcana   +6 mana, +2% spell damage, +0.15 mana a second
//   Finesse  +0.6% critical strike, +2% critical damage, +0.4% movement speed
// Every spell is open to you from the start (it's a beta: they're all there to be tried).
// The numbers live on the character (gear.js's): level, xp, points, attrs.

export const MAX_LEVEL = 40;
export const POINTS_PER_LEVEL = 3;
/** Experience from one level to the next. */
export const xpToNext = (lv) => Math.round(120 * Math.pow(lv, 1.55));

export const ATTRS = {
  might: { name: 'Might', desc: '+2% damage, +2 life' },
  vigor: { name: 'Vigour', desc: '+8 life, +0.1 life a second' },
  arcana: { name: 'Arcana', desc: '+6 mana, +2% spell damage, +0.15 mana a second' },
  finesse: { name: 'Finesse', desc: '+0.6% critical strike, +2% critical damage, +0.4% speed' },
};

/** Give an older character (or a new one) its level and attributes. */
export function fitLevel(c) {
  c.level ||= 1;
  c.xp ||= 0;
  c.points ??= 0;
  c.attrs = { might: 0, vigor: 0, arcana: 0, finesse: 0, ...(c.attrs || {}) };
  return c;
}

/** Add experience; returns how many levels it brought. */
export function grantXp(c, n) {
  fitLevel(c);
  if (c.level >= MAX_LEVEL) return 0;
  c.xp += Math.max(0, Math.round(n));
  let up = 0;
  while (c.level < MAX_LEVEL && c.xp >= xpToNext(c.level)) {
    c.xp -= xpToNext(c.level);
    c.level++; up++;
    c.points += POINTS_PER_LEVEL;
  }
  if (c.level >= MAX_LEVEL) c.xp = 0;
  return up;
}

/** What the level and the attributes add to the character's numbers (computeStats calls it). */
export function levelStats(c, st) {
  fitLevel(c);
  const L = c.level - 1, a = c.attrs;
  st.life += L * 8 + a.vigor * 8 + a.might * 2;
  st.mana += L * 5 + a.arcana * 6;
  st.dmgPct += L * 1.5 + a.might * 2;
  st.spellPct += L * 1.5 + a.arcana * 2;
  st.lifeRegen += L * 0.04 + a.vigor * 0.1;
  st.manaRegen += L * 0.08 + a.arcana * 0.15;
  st.crit += a.finesse * 0.6;
  st.critDmg += a.finesse * 2;
  st.moveSpeed += Math.min(25, a.finesse * 0.4);
  st.armor += L * 1;
}

// what each of the dead and the living is worth
const XP_GROTESQUE = { rotting_zombie: 14, plague_bearer: 16, tomb_mummy: 18, pale_ghoul: 18, ember_husk: 24, bloated_drowner: 20,
  chitin_fiend: 26, deep_maw: 28, fungal_husk: 20, bog_troll: 42 };
const XP_FOE = { knight: 46, sorcerer: 40, ghast: 24, grubber: 28 };
const XP_STATS = { sworn: 75, adept: 85, lord: 1200 };
/** Experience for killing z (a zombie, a foe, a Sworn or a champion). */
export function xpFor(z) {
  if (z.slime) return z.xp;   // (by its size: slimes.js)
  if (z.champ) return z.champ.xp || 500;
  if (z.def) return XP_STATS[z.def.stats] ?? XP_FOE[z.kindName] ?? 30;
  return (XP_GROTESQUE[z.variant] ?? 15) + (z.kindName === 'runner' ? 4 : z.kindName === 'lurker' ? 2 : 0);
}
