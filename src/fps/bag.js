// The inventory, after Velscour's: the paper doll (head, weapon, body, off-hand, hands, legs,
// feet and four rings round the figure), the bag (forty places), the selected item's card with
// what you can do with it, and the character's numbers. Drag an item onto a slot or another
// place in the bag (mouse or finger); click to look at it; double-click (or right-click) to put
// it on or take it off; drag it out of the window to drop it. Potions drink on double-click.
// Drag a gem onto anything with an empty socket to set it there (or pick it from the gem's card);
// double-click a plan to learn it. The spellbook is the second tab; the third is the materials
// pouch and the plans you know (craft.js).
import { SLOTS, SLOT_NAMES, RARITY, ENCHANTS, statLabel, itemColor, fitsSlot, slotFor, itemValue, computeStats } from './gear.js';
import { GEMS, GRADES, gemName, gemBonus, gemPlace, freeSocket } from './gems.js';
import { MATS, MAT_TIER, MAT_TIER_COLOR, RECIPES, PLAN_TIER, PLAN_COLOR, known, knows, check, learn, fitCraft } from './craft.js';
import { ATTRS, xpToNext, fitLevel, MAX_LEVEL } from './level.js';
import { SPELL_KEYS } from './hud.js';

const DOLL = { head: [2, 1], weapon: [1, 2], body: [2, 2], offhand: [3, 2], hands: [1, 3], legs: [2, 3], feet: [2, 4],
  ring1: [4, 1], ring2: [4, 2], ring3: [4, 3], ring4: [4, 4] };

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ pixel icons for the worn things
// 16x16, one character a pixel; the palette is tinted per item (m: metal, d: dark, l: light, a: accent)
const PX = {
  hood: ['....dddddd......', '...dmmmmmmd.....', '..dmmllmmmmd....', '..dmllmmmmmmd...', '.dmmlmddddmmmd..', '.dmmmd....dmmd..', '.dmmd......dmd..', '.dmmd......dmd..',
    '.dmmmd....dmmd..', '..dmmmddddmmd...', '..dmmmmmmmmmd...', '.dmmmmmmmmmmmd..', '.dmmmmmmmmmmmmd.', 'dmmmmmmmmmmmmmd.', 'dddddddddddddddd', '................'],
  cap: ['................', '................', '.....dddddd.....', '...ddmmmmmmdd...', '..dmmlllmmmmmd..', '..dmlmmmmmmmmd..', '.dmmmmmmmmmmmmd.', '.dmmmmmmmmmmmmd.',
    '.daaaaaaaaaaaad.', '.dddddddddddddd.', '................', '................', '................', '................', '................', '................'],
  kettle: ['................', '......dddd......', '....ddmmmmdd....', '...dmmllmmmmd...', '...dmlmmmmmmd...', '...dmmmmmmmmd...', '..dmmmmmmmmmmd..', 'dddmmmmmmmmmmddd',
    'dmmmmmmmmmmmmmmd', 'dddddddddddddddd', '................', '................', '................', '................', '................', '................'],
  sallet: ['................', '.....dddddd.....', '...ddmmmmmmdd...', '..dmmllmmmmmmd..', '..dmlmmmmmmmmd..', '.dmmmmmmmmmmmmd.', '.dmmddddddddmmd.', '.dmd........dmd.',
    '.dmmddddddddmmd.', '.dmmmmmmmmmmmmmd', '..dmmmmmmmmmmmmd', '...ddmmmmmmmmmd.', '.....ddddddddd..', '................', '................', '................'],
  great: ['....dddddddd....', '...dmmmmmmmmd...', '..dmllmmmmmmmd..', '..dmlmmmmmmmmd..', '..dmmmmmmmmmmd..', '..dddddddddddd..', '..dmmdmmmmdmmd..', '..dddddddddddd..',
    '..dmmmmammmmmd..', '..dmmmmammmmmd..', '..dmmmmammmmmd..', '..dmmmmmmmmmmd..', '..dmmmmmmmmmmd..', '...dmmmmmmmmd...', '....dddddddd....', '................'],
  tunic: ['................', '...ddd....ddd...', '..dmmmd..dmmmd..', '.dmmmmmddmmmmmd.', 'dmmmmmmmmmmmmmmd', 'dmmdmmmmmmmmdmmd', '.dd.dmmmmmmd.dd.', '....dmmmmmmd....',
    '....dmmmmmmd....', '....daaaaaad....', '....dmmmmmmd....', '...dmmmmmmmmd...', '...dmmmmmmmmd...', '..dmmmmmmmmmmd..', '..dddddddddddd..', '................'],
  gambeson: ['................', '...ddd....ddd...', '..dmlmd..dmmmd..', '.dmmlmmddmmmmmd.', 'dmmmlmmmmmmmmmmd', 'dmmdldmdmdmmdmmd', '.dd.dmdmdmdd.dd.', '....dmdmdmdd....',
    '....dmdmdmdd....', '....dmdmdmdd....', '....dmdmdmdd....', '...dmdmdmdmdd...', '...dmdmdmdmdd...', '...dddddddddd...', '................', '................'],
  mail: ['................', '...ddd....ddd...', '..dmlmd..dmlmd..', '.dmlmlmddmlmlmd.', 'dmlmlmlmlmlmlmld', 'dmldmlmlmlmldmld', '.dd.dlmlmlmd.dd.', '....dmlmlmld....',
    '....dlmlmlmd....', '....dmlmlmld....', '....dlmlmlmd....', '...dmlmlmlmld...', '...dlmlmlmlmd...', '...dddddddddd...', '................', '................'],
  brigandine: ['................', '...ddd....ddd...', '..dmmmd..dmmmd..', '.dmmmmmddmmmmmd.', 'dmmammmmmmmmammd', 'dmmdmmammammdmmd', '.dd.dmmmmmmd.dd.', '....dammammad....',
    '....dmmmmmmd....', '....dammammad....', '....dmmmmmmd....', '...dmmmmmmmmd...', '...dmmmmmmmmd...', '...dddddddddd...', '................', '................'],
  plate: ['................', '..dddd....dddd..', '.dmmmmd..dmmmmd.', 'dmlllmmddmmmmmmd', 'dmlmmmmmmmmmmmmd', 'dmmdmllmmmmmdmmd', '.dd.dlmmmmmd.dd.', '....dmmmmmmd....',
    '....ddddddddd...', '....dmmmmmmd....', '....ddddddddd...', '...dmmmmmmmmd...', '...dmmmmmmmmd...', '...dddddddddd...', '................', '................'],
  breeches: ['................', '...dddddddddd...', '...daaaaaaaad...', '...dmmmmmmmmd...', '...dmmmmmmmmd...', '...dmmmddmmmd...', '...dmmd..dmmd...', '...dmmd..dmmd...',
    '...dmmd..dmmd...', '...dmmd..dmmd...', '...dmmd..dmmd...', '...dmmd..dmmd...', '...dddd..dddd...', '................', '................', '................'],
  chausses: ['................', '...dddddddddd...', '...daaaaaaaad...', '...dmlmmmmlmd...', '...dmlmmmmlmd...', '...dmlmddmlmd...', '...dmld..dmld...', '...dmld..dmld...',
    '...dmld..dmld...', '...dmld..dmld...', '...dmld..dmld...', '...dmmd..dmmd...', '...dddd..dddd...', '................', '................', '................'],
  mailLegs: ['................', '...dddddddddd...', '...daaaaaaaad...', '...dmlmlmlmld...', '...dlmlmlmlmd...', '...dmlmddmlmd...', '...dlmd..dlmd...', '...dmld..dmld...',
    '...dlmd..dlmd...', '...dmld..dmld...', '...dlmd..dlmd...', '...dmld..dmld...', '...dddd..dddd...', '................', '................', '................'],
  greaves: ['................', '...dddddddddd...', '...daaaaaaaad...', '...dmmmmmmmmd...', '...dmlmmmmlmd...', '...dmlmddmlmd...', '...ddddd.ddddd..', '...dmld..dmld...',
    '...dmld..dmld...', '...dlmd..dlmd...', '...dmmd..dmmd...', '...dmmd..dmmd...', '...dddd..dddd...', '................', '................', '................'],
  shoes: ['................', '................', '................', '................', '................', '................', '................', '...dddd...dddd..',
    '...dmmd...dmmd..', '...dmmd...dmmd..', '..dmmmd..dmmmd..', '.dmmmmd.dmmmmd..', '.dmlmmd.dmlmmd..', '.daaaad.daaaad..', '.dddddd.dddddd..', '................'],
  boots: ['................', '................', '...dddd...dddd..', '...dmmd...dmmd..', '...dlmd...dlmd..', '...dmmd...dmmd..', '...dmmd...dmmd..', '...dmmd...dmmd..',
    '...dmmd...dmmd..', '...dmmd...dmmd..', '..dmmmd..dmmmd..', '.dmmmmd.dmmmmd..', '.dmlmmd.dmlmmd..', '.daaaad.daaaad..', '.dddddd.dddddd..', '................'],
  hobnail: ['................', '................', '...dddd...dddd..', '...daad...daad..', '...dmmd...dmmd..', '...dlmd...dlmd..', '...dmmd...dmmd..', '...dmmd...dmmd..',
    '...dmmd...dmmd..', '...dmmd...dmmd..', '..dmmmd..dmmmd..', '.dmmmmd.dmmmmd..', '.dmlmmd.dmlmmd..', '.dmmmmd.dmmmmd..', '.dadada.dadada..', '................'],
  sabatons: ['................', '................', '...dddd...dddd..', '...dmmd...dmmd..', '...dlmd...dlmd..', '...dddd...dddd..', '...dmmd...dmmd..', '...dlmd...dlmd..',
    '...dddd...dddd..', '..dmmmd..dmmmd..', '.dmlmmd.dmlmmd..', '.ddddddddddddd..', '.dmlmmd.dmlmmd..', '.dmmmmd.dmmmmd..', '.dddddd.dddddd..', '................'],
  ring: ['................', '................', '................', '......aaa.......', '.....alaaa......', '......aaa.......', '.....dmmmd......', '....dm...md.....',
    '...dm.....md....', '...dm.....md....', '...dm.....md....', '....dm...md.....', '.....dmmmd......', '................', '................', '................'],
  gauntlet: ['................', '.....d.d.d......', '....dmdmdmd.....', '....dmdmdmdd....', '....dmmmmmmd.dd.', '....dmlmmmmddmd.', '....dmlmmmmmmd..', '....dmmmmmmmd...',
    '....dddddddd....', '....dmamamad....', '....dmmmmmmd....', '....dmmmmmmd....', '....dmlmmmmd....', '....dmmmmmmd....', '....dddddddd....', '................'],
  potion: ['................', '......ddd.......', '......dmd.......', '......ddd.......', '......dld.......', '.....daaad......', '....daaaaad.....', '...daalaaaad....',
    '...dalaaaaad....', '...daaaaaaad....', '...daaaaaaad....', '...daaaaaaad....', '....daaaaad.....', '.....ddddd......', '................', '................'],
};
// gems by grade (1 chipped .. 5 perfect; the starshard its own), a plan's scroll, and the materials
Object.assign(PX, {
  gem1: ['................', '................', '................', '................', '................', '................', '......dd........', '.....dlmd.......',
    '....dlmmmd......', '....dmmmad......', '.....dmmd.......', '......dd........', '................', '................', '................', '................'],
  gem2: ['................', '................', '................', '................', '.....dddd.......', '....dllmmd......', '...dlmmmmmd.....', '...dmmmmmad.....',
    '....dmmmmd......', '.....dmmd.......', '......dd........', '................', '................', '................', '................', '................'],
  gem3: ['................', '................', '................', '.....dddddd.....', '....dllmmmmd....', '...dlmmmmmmad...', '..dddddddddddd..', '..dmlmmmmmmmmd..',
    '...dmlmmmmmmd...', '....dmmmmmmd....', '.....dmmmmd.....', '......dmmd......', '.......dd.......', '................', '................', '................'],
  gem4: ['................', '................', '....dddddddd....', '...dllllmmmmd...', '..dlmmmmmmmmad..', '.dlmmmmmmmmmmad.', 'dddddddddddddddd', 'dmllmmmmmmmmmmmd',
    '.dmlmmmmmmmmmmd.', '..dmlmmmmmmmmd..', '...dmmmmmmmmd...', '....dmmmmmmd....', '.....dmmmmd.....', '......dmmd......', '.......dd.......', '................'],
  gem5: ['.......a........', '......aaa..a....', '....dddddddd....', '...dllllmmmmd...', '..dlallmmmmmad..', '.dlmmmmmmmmmmad.', 'dddddddddddddddd', 'dmllammmmmmmmmmd',
    '.dmlmmmmmmmmmmd.', '..dmlmmmmmmmmd..', '...dmmmmmmmmd...', '....dmmmmmmd....', '.a...dmmmmd.....', 'aaa...dmmd......', '.a.....dd.......', '................'],
  star: ['........a.......', '.......dld......', '......dllmd.....', '......dlmmd.....', '.....dllmmmd....', '.....dlmmmad....', '....dllmmmmd....', '....dlmmmmad.a..',
    '...dllmmmmmd.aa.', '...dlmmmmmd..a..', '..dllmmmmmd.....', '..dlmmmmmd......', '.dlmmmmmd.......', '.ddddddd........', '................', '................'],
  scroll: ['................', '..dddddddddddd..', '.dllllllllllllld', '.dmmmmmmmmmmmmmd', '..dllllllllllld.', '..dlddddddddlld.', '..dllllllllllld.', '..dldddddlllld..',
    '..dllllllllllld.', '..dlddddddlaad..', '..dllllllllaaad.', '.dddddddddaaad..', '.dllllllllllad..', '.dmmmmmmmmmmmd..', '..ddddddddddd...', '................'],
  ingot: ['................', '................', '................', '................', '................', '.....dddddddd...', '....dllllllld...', '...dllllllldmd..',
    '..dmmmmmmmdmmd..', '..dmmmmmmmdmd...', '..dmmmmmmmdd....', '..ddddddddd.....', '................', '................', '................', '................'],
  hide: ['................', '................', '....dd....dd....', '...dmmd..dmmd...', '...dmmmddmmmd...', '....dmlmmmmd....', '...dmllmmmmmd...', '..dmmlmmmmmmmd..',
    '..dmmmmmmmammd..', '...dmmmmmmmmd...', '...dmmmddmmmd...', '....dd...ddd....', '................', '................', '................', '................'],
  cloth: ['................', '................', '................', '..dddddddddddd..', '..dlllllllllld..', '..dmmmmmmmmmmd..', '..dlllllllllld..', '..dmmmmmmmmmmd..',
    '..dllllllllllld.', '..dmmmmmmmmmmmd.', '..ddddddddddddd.', '................', '................', '................', '................', '................'],
  bone: ['................', '................', '................', '..dd.........dd.', '.dlld.......dlld', '.dllld.....dllld', '..dlllddddddlld.', '...dlllllllllld.',
    '..dllddddddlllld', '.dlld.......dlld', '.dlld.......dlld', '..dd.........dd.', '................', '................', '................', '................'],
  log: ['................', '................', '................', '................', '....ddddddddd...', '...dmmmmmmmmdld.', '..dmmmmmmmmdlald', '..dmlmmmmmmdlald',
    '..dmmmmlmmmdlald', '...dmmmmmmmmdld.', '....ddddddddd...', '................', '................', '................', '................', '................'],
  pile: ['................', '................', '................', '................', '................', '................', '.......dd.......', '.....ddmmdd.....',
    '....dmmlmmmd....', '...dmmlmmamd....', '..dmmmmmmmmmmd..', '.dmmlmmmammmmmd.', '.dddddddddddddd.', '................', '................', '................'],
  blob: ['................', '................', '................', '......dddd......', '....ddllmmdd....', '...dllmmmmmmd...', '...dlmmmmmmmd...', '..dlmmmmmmmmmd..',
    '..dmmmmmmmmamd..', '..dmmmmmmmmmmd..', '...dmmmmmmmmd...', '....dddddddd....', '................', '................', '................', '................'],
  fang: ['................', '.....ddddd......', '....dlllllld....', '....dllllmld....', '.....dllmmd.....', '.....dlllmd.....', '......dllmd.....', '......dllmd.....',
    '.......dlmd.....', '.......dlmd.....', '........dld.....', '........dmd.....', '.........d......', '................', '................', '................'],
  plate: ['................', '................', '...dddddddddd...', '..dllllllllmmd..', '..dlmmmmmmmmmd..', '..ddddddddddd...', '..dlmmmmmmmmmd..', '..dmmmmmmmmmmd..',
    '...ddddddddd....', '...dlmmmmmmd....', '....dmmmmmd.....', '.....ddddd......', '................', '................', '................', '................'],
  sparkle: ['.......a........', '......aaa.......', '.......a....a...', '...a.......aaa..', '..aaa.......a...', '...a..dddd......', '.....dmlmmd.....', '....dmlmmamd....',
    '...dmmmmmmmmd...', '..dmmlmmmammmd..', '..dddddddddddd..', '................', '................', '................', '................', '................'],
  flame: ['.......d........', '......dld.......', '......dlld......', '.....dllld......', '....dllalld.....', '....dlaaalld....', '...dllaaaalld...', '...dlaaaaaald...',
    '...dllaaaalld...', '....dllaalld....', '.....dlllld.....', '......dddd......', '................', '................', '................', '................'],
  shard: ['.........d......', '........dld.....', '.......dlld.....', '......dllmd.....', '.....dllmmd.....', '.....dlmmmd.....', '....dllmmd......', '....dlmmmd......',
    '...dllmmd.......', '...dlmmd........', '..dlmmd.........', '..dddd..........', '................', '................', '................', '................'],
  heart: ['................', '...ddd...ddd....', '..dllmd.dmmmd...', '.dlllmmdmmmmmd..', '.dllmmmmmmmmmd..', '.dlmmmmmmmmmmd..', '..dmmmmmmmmmd...', '...dmmmmmmmd....',
    '....dmmmmmd.....', '.....dmmmd......', '......dmd.......', '.......d........', '................', '................', '................', '................'],
  vial: ['......dddd......', '......dmmd......', '.......dd.......', '......dlld......', '.....dlllld.....', '....dlmmmmld....', '...dlmaammmmd...', '...dlmaammmmd...',
    '...dmmmmmmmmd...', '...dmmmmmmmmd...', '....dmmmmmmd....', '.....dddddd.....', '................', '................', '................', '................'],
  signet: ['................', '......aaaa......', '.....aallaa.....', '.....aaaaaa.....', '......aaaa......', '.....dmmmmd.....', '....dm....md....', '...dm......md...',
    '...dm......md...', '...dm......md...', '....dm....md....', '.....dmmmmd.....', '................', '................', '................', '................'],
});
/** A colour's dark, light and sparkle for a gem (from its own colour). */
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return '#' + c.map((v) => Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1)).toString(16).padStart(2, '0')).join(''); };
const gemTint = (gem) => { const c = GEMS[gem]?.color || '#ffffff'; return { m: c, d: shade(c, 0.32), l: shade(c, 1.55), a: '#ffffff' }; };
/** The picture of a gem, a plan or a material (gems.js, craft.js), as a data URL. */
export function craftIcon(it) {
  if (it.type === 'gem') return pixelIcon(GEMS[it.gem]?.only ? 'star' : 'gem' + Math.max(1, Math.min(5, it.grade || 3)), gemTint(it.gem));
  if (it.type === 'recipe') return pixelIcon('scroll', { l: '#efe0b4', m: '#c8a868', d: '#4a3418', a: PLAN_COLOR[it.tier ?? 1] });
  const M = MATS[it.mat || it.id];
  if (!M) return pixelIcon('pile', { m: '#888', d: '#222', l: '#ccc', a: '#fff' });
  const [m, d, l, a] = M.tint;
  return pixelIcon(M.icon, M.icon === 'signet' ? { m: '#d8a838', d: '#3a2a08', l: '#fff0a0', a: m } : { m, d, l, a: a || l });
}

const TINT = {
  hood: { m: '#5a4a3a', d: '#1a120c', l: '#7a6a50', a: '#8a6a40' }, cap: { m: '#6a4a2a', d: '#1e140a', l: '#8a6a40', a: '#a07040' },
  kettle: { m: '#8a8e94', d: '#22262a', l: '#c8ccd0', a: '#6a5a40' }, sallet: { m: '#9aa0a8', d: '#202428', l: '#d8dce0', a: '#6a5a40' },
  great: { m: '#9aa0a8', d: '#1a1d20', l: '#e0e4e8', a: '#c8a040' }, tunic: { m: '#6a5a40', d: '#1e160c', l: '#8a7a58', a: '#4a3020' },
  gambeson: { m: '#a08a60', d: '#2a2014', l: '#c8b080', a: '#5a4428' }, mail: { m: '#8a9096', d: '#24282c', l: '#b8c0c8', a: '#5a4a30' },
  brigandine: { m: '#6a3020', d: '#1e0c08', l: '#8a4a30', a: '#c8b060' }, plate: { m: '#a0a6ae', d: '#1c2024', l: '#e8ecf0', a: '#6a5a40' },
  breeches: { m: '#5a4a34', d: '#1a120a', l: '#7a6a4a', a: '#3a2818' }, chausses: { m: '#8a7a5a', d: '#241c10', l: '#b0a07a', a: '#4a3820' },
  mailLegs: { m: '#8a9096', d: '#24282c', l: '#b8c0c8', a: '#5a4a30' }, greaves: { m: '#a0a6ae', d: '#1c2024', l: '#e8ecf0', a: '#5a4a30' },
  shoes: { m: '#5a3a22', d: '#1a0e06', l: '#7a5a3a', a: '#3a2412' }, boots: { m: '#4a2e1a', d: '#160c04', l: '#6a4a2e', a: '#2a1a0c' },
  hobnail: { m: '#4a2e1a', d: '#160c04', l: '#6a4a2e', a: '#9aa0a8' }, sabatons: { m: '#9aa0a8', d: '#1c2024', l: '#e0e4e8', a: '#5a4a30' },
  ringIron: { m: '#6a6e74', d: '#22262a', l: '#a0a4aa', a: '#c83030' }, ringSilver: { m: '#c0c6cc', d: '#40464c', l: '#ffffff', a: '#4a7aff' },
  ringBone: { m: '#d8ccaa', d: '#5a5040', l: '#f4ecd8', a: '#30c060' }, ringGold: { m: '#d8a838', d: '#5a3a08', l: '#fff0a0', a: '#c030ff' },
  life: { m: '#b0b0b0', d: '#2a1a1a', l: '#ffd0d0', a: '#c81c1c' }, mana: { m: '#b0b0b0', d: '#1a1a2a', l: '#d0d8ff', a: '#2c4ac8' },
};
const pxCache = new Map();
export function pixelIcon(shape, tint, scale = 4) {
  const key = shape + '|' + JSON.stringify(tint);
  if (pxCache.has(key)) return pxCache.get(key);
  const rows = PX[shape] || PX.ring, c = document.createElement('canvas');
  c.width = c.height = 16 * scale;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = tint[ch] || '#f0f'; g.fillRect(x * scale, y * scale, scale, scale);
  }));
  const url = c.toDataURL();
  pxCache.set(key, url);
  return url;
}
const GAUNT_TINT = { wayfarer: '#7a5a3a', hunter: '#5a4a2a', mailed: '#8a9096', knight: '#a0a6ae', templar: '#d8b048', brawler: '#5a5a60',
  boneward: '#d8ccaa', drake: '#4a7a40', fiend: '#8a2a20', runebound: '#4a5aa0' };

export class Bag {
  /** opts: {char(), stats(), icon(item, done) -> url|null, onChange(), onUse(idx), onDrop(idx),
   * spells, spellIcons, book(), onAssign(spell, slot), onClose()} */
  constructor(root, opts) {
    this.o = opts;
    this.sel = null;          // {where: 'bag'|'equip', idx|slot}
    this.tab = 'gear';
    const p = this.panel = el('div', 'panel inv bag hidden');
    const close = el('button', 'close', '&times;');
    close.onclick = () => opts.onClose?.();
    const tabs = el('div', 'tabs');
    this.tabBtn = {};
    for (const [k, label] of [['gear', 'Inventory &amp; Character'], ['spells', 'Spellbook'], ['mats', 'Materials &amp; Plans']]) {
      const b = el('button', '', label);
      b.onclick = () => { this.tab = k; this.render(); };
      this.tabBtn[k] = b;
      tabs.append(b);
    }
    this.body = el('div', 'bag-body');
    p.append(close, el('div', 'keys', 'Tab or I to close · Esc to go back to the game'), tabs, this.body);
    this.tip = el('div', 'tt hidden');
    root.append(p, this.tip);
    this.drag = null;
    addEventListener('pointermove', (e) => this.dragMove(e));
    addEventListener('pointerup', (e) => this.dragEnd(e));
  }

  get open() { return !this.panel.classList.contains('hidden'); }
  show(on) { this.panel.classList.toggle('hidden', !on); this.tip.classList.add('hidden'); if (on) this.render(); }

  // -------------------------------------------------------------- gems and plans
  /** Set the gem in bag place `gi` into the first empty socket of `target` (an item). */
  socket(gi, target) {
    const c = this.o.char(), g = c.bag[gi];
    if (!g || g.type !== 'gem' || !target || target.type !== 'gear') return false;
    const i = freeSocket(target);
    if (i < 0) { this.o.toast?.(target.sockets?.length ? `${target.name} has no empty socket` : `${target.name} has no sockets: Garrow the smith can cut one`); return false; }
    target.sockets[i] = { gem: g.gem, grade: g.grade };
    if (--g.count <= 0) c.bag[gi] = null;
    this.o.toast?.(`The ${gemName(g.gem, g.grade)} is set in ${target.name}`);
    this.o.onSocket?.(target, g);
    this.changed();
    return true;
  }

  /** Read a plan: learnt for good (the scroll is used up). */
  learnAt(i) {
    const c = this.o.char(), it = c.bag[i];
    if (!it || it.type !== 'recipe') return;
    fitCraft(c);
    if (!learn(c, it.recipe)) { this.o.toast?.('You know these plans already: a merchant will buy them'); return; }
    if (--it.count <= 0) c.bag[i] = null;
    const R = RECIPES[it.recipe];
    this.o.toast?.(`Learnt: ${R.name}. ${R.at === 'gems' ? 'Idris' : 'Garrow'} can make it for you`);
    this.o.onLearn?.(it);
    this.sel = null;
    this.changed();
  }

  /** Everything gear in the bag and worn with room for a gem: [{it, where}] (what's worn first). */
  socketable() {
    const c = this.o.char(), out = [];
    for (const s of SLOTS) if (freeSocket(c.equip[s]) >= 0) out.push({ it: c.equip[s], where: SLOT_NAMES[s] });
    for (const it of c.bag) if (it?.type === 'gear' && freeSocket(it) >= 0) out.push({ it, where: 'bag' });
    return out;
  }

  item(ref) {
    const c = this.o.char();
    if (!ref) return null;
    return ref.where === 'bag' ? c.bag[ref.idx] : c.equip[ref.slot];
  }

  // -------------------------------------------------------------- moving things about
  equipFromBag(idx, slot) {
    const c = this.o.char(), it = c.bag[idx];
    if (!it || it.type !== 'gear') return false;
    const to = slot && fitsSlot(it, slot) ? slot : slotFor(c.equip, it);
    const old = c.equip[to];
    c.equip[to] = it;
    c.bag[idx] = old || null;
    // a two-hander takes both hands: the off-hand goes back in the bag (and a shield taken up
    // puts a two-hander away)
    if (to === 'weapon' && it.kind === 'twohand' && c.equip.offhand) this.stow('offhand');
    if (to === 'offhand' && c.equip.weapon?.kind === 'twohand') this.stow('weapon');
    this.sel = { where: 'equip', slot: to };
    this.changed();
    return true;
  }

  stow(slot) {
    const c = this.o.char();
    const i = c.bag.findIndex((b) => !b);
    if (i < 0) return false;
    c.bag[i] = c.equip[slot];
    c.equip[slot] = null;
    return true;
  }

  unequip(slot, toIdx) {
    const c = this.o.char(), it = c.equip[slot];
    if (!it) return false;
    if (toIdx !== undefined && c.bag[toIdx]) {   // onto an item: swap if it fits
      const other = c.bag[toIdx];
      if (fitsSlot(other, slot)) { c.bag[toIdx] = it; c.equip[slot] = other; this.changed(); return true; }
    }
    const i = toIdx !== undefined && !c.bag[toIdx] ? toIdx : c.bag.findIndex((b) => !b);
    if (i < 0) { this.o.toast?.('Your bag is full'); return false; }
    c.bag[i] = it;
    c.equip[slot] = null;
    this.sel = { where: 'bag', idx: i };
    this.changed();
    return true;
  }

  use(idx) {
    const c = this.o.char(), it = c.bag[idx];
    if (!it) return;
    if (it.type === 'gear') this.equipFromBag(idx);
    else if (it.type === 'potion') { this.o.onUse?.(idx); this.changed(); }
    else if (it.type === 'recipe') this.learnAt(idx);
    else if (it.type === 'gem') {   // into the first empty socket of what you're wearing (the weapon first)
      const to = this.socketable().find((x) => x.where !== 'bag');
      if (to) this.socket(idx, to.it); else this.o.toast?.('Nothing you wear has an empty socket: drag the gem onto a piece in the bag');
    }
  }

  dropOnBag(idx, data) {
    const c = this.o.char();
    if (data.where === 'bag') {
      if (data.idx === idx) return;
      // a gem dropped on gear: set in it
      if (c.bag[data.idx]?.type === 'gem' && c.bag[idx]?.type === 'gear') { this.socket(data.idx, c.bag[idx]); return; }
      [c.bag[data.idx], c.bag[idx]] = [c.bag[idx], c.bag[data.idx]];
      this.sel = { where: 'bag', idx };
      this.changed();
    } else this.unequip(data.slot, idx);
  }

  dropOnEquip(slot, data) {
    if (data.where !== 'bag') {
      // ring to ring
      const c = this.o.char();
      if (data.slot !== slot && fitsSlot(c.equip[data.slot], slot)) { [c.equip[data.slot], c.equip[slot]] = [c.equip[slot], c.equip[data.slot]]; this.changed(); }
      return;
    }
    const it = this.o.char().bag[data.idx];
    if (it?.type === 'gem' && this.o.char().equip[slot]) { this.socket(data.idx, this.o.char().equip[slot]); return; }
    if (!fitsSlot(it, slot)) { this.o.toast?.(`That doesn't go there`); return; }
    this.equipFromBag(data.idx, slot);
  }

  sort() {
    const c = this.o.char();
    const items = c.bag.filter(Boolean);
    const rank = (it) => ({ gear: 0, potion: 1, gem: 2, recipe: 3 }[it.type] ?? 4);
    items.sort((a, b) => rank(a) - rank(b) || (b.rarity || 0) - (a.rarity || 0) || (a.slot || '').localeCompare(b.slot || '') || (b.ilvl || 0) - (a.ilvl || 0)
      || (a.gem || '').localeCompare(b.gem || '') || (b.grade || 0) - (a.grade || 0) || (b.tier || 0) - (a.tier || 0));
    c.bag = c.bag.map((_, i) => items[i] || null);
    this.sel = null;
    this.changed();
  }

  changed() { this.o.onChange?.(); this.render(); }

  // -------------------------------------------------------------- drag and drop (mouse and touch)
  grab(e, data, cell) {
    if (e.button === 2) return;
    this.drag = { data, x0: e.clientX, y0: e.clientY, cell, ghost: null, moved: false };
  }

  dragMove(e) {
    const d = this.drag;
    if (!d) { this.tipMove(e); return; }
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 7) return;
    if (!d.moved) {
      d.moved = true;
      const img = d.cell.querySelector('img');
      d.ghost = el('div', 'ghost');
      if (img) d.ghost.append(img.cloneNode());
      document.body.append(d.ghost);
      this.tip.classList.add('hidden');
    }
    d.ghost.style.left = e.clientX - 22 + 'px';
    d.ghost.style.top = e.clientY - 22 + 'px';
  }

  dragEnd(e) {
    const d = this.drag;
    this.drag = null;
    if (!d || !d.moved) return;
    d.ghost?.remove();
    const at = document.elementFromPoint(e.clientX, e.clientY);
    const cell = at?.closest('[data-bag], [data-slot]');
    if (cell?.dataset.bag !== undefined) this.dropOnBag(Number(cell.dataset.bag), d.data);
    else if (cell?.dataset.slot) this.dropOnEquip(cell.dataset.slot, d.data);
    else if (!at?.closest('.panel.bag') && d.data.where === 'bag') { this.o.onDrop?.(d.data.idx); this.sel = null; this.changed(); }
  }

  // -------------------------------------------------------------- drawing
  cellFor(it, ref) {
    const d = el('div', 'icell');
    if (!it) return d;
    const img = new Image();
    img.draggable = false;
    img.alt = '';
    const url = this.iconOf(it, () => this.render());
    if (url) img.src = url;
    d.append(img);
    if (it.type !== 'gear' && it.count > 1) d.append(el('span', 'stack', 'x' + it.count));
    if (it.sockets?.length) d.append(sockDots(it));
    return d;
  }

  iconOf(it, again) {
    if (it.type === 'potion') return pixelIcon('potion', TINT[it.kind] || TINT.life);
    if (it.type === 'gem' || it.type === 'recipe' || it.type === 'mat') return craftIcon(it);
    if (it.type === 'quest') return pixelIcon('ring', TINT.ringGold || TINT.tunic);
    if (it.kind === 'gauntlet') { const m = GAUNT_TINT[it.model] || '#7a5a3a'; return pixelIcon('gauntlet', { m, d: '#141010', l: '#e8e0d0', a: '#2a2420' }); }
    if (it.icon) return pixelIcon(PX[it.icon] ? it.icon : 'ring', TINT[it.icon] || TINT.tunic);
    return this.o.icon?.(it, again) || null;
  }

  rclass(it) { return it ? (it.type === 'gear' ? 'r' + it.rarity : it.type === 'gem' ? 'gm' : it.type === 'recipe' ? 'p' + (it.tier ?? 1) : 'r0') : ''; }

  render() {
    if (!this.open) return;
    for (const [k, b] of Object.entries(this.tabBtn)) b.classList.toggle('sel', k === this.tab);
    this.body.innerHTML = '';
    if (this.tab === 'spells') { this.renderSpells(); return; }
    if (this.tab === 'mats') { this.renderMats(); return; }
    const c = this.o.char();
    const wrap = el('div', 'inv-wrap');
    // the doll and the card
    const left = el('div', 'col');
    const doll = el('div', 'paperdoll');
    const fig = el('div', 'figure', '<svg viewBox="0 0 40 80"><circle cx="20" cy="9" r="6.5"/><path d="M8 20 Q20 15 32 20 L35 44 L30 45 L28 30 L27 50 L29 78 L23 78 L20 54 L17 78 L11 78 L13 50 L12 30 L10 45 L5 44 Z"/></svg>');
    fig.style.gridColumn = 3; fig.style.gridRow = '3 / span 2';
    doll.append(fig);
    for (const s of SLOTS) {
      const it = c.equip[s], d = el('div', 'eslot ' + this.rclass(it));
      d.dataset.slot = s;
      const [cx, cy] = DOLL[s];
      d.style.gridColumn = cx; d.style.gridRow = cy;
      if (this.sel?.where === 'equip' && this.sel.slot === s) d.classList.add('sel');
      if (it) d.append(this.cellFor(it)); else d.append(el('span', 'lbl', SLOT_NAMES[s]));
      // a two-hander's shadow in the off-hand
      if (s === 'offhand' && !it && c.equip.weapon?.kind === 'twohand') { d.classList.add('ghosted'); d.append(this.cellFor(c.equip.weapon)); }
      this.wire(d, it ? { where: 'equip', slot: s } : null, () => this.unequip(s));
      doll.append(d);
    }
    left.append(doll, this.detail());
    // the bag
    const mid = el('div', 'col');
    const bag = el('div', 'bagrid');
    c.bag.forEach((it, i) => {
      const d = el('div', 'bslot ' + this.rclass(it));
      d.dataset.bag = i;
      if (this.sel?.where === 'bag' && this.sel.idx === i) d.classList.add('sel');
      if (it) d.append(this.cellFor(it));
      this.wire(d, it ? { where: 'bag', idx: i } : null, () => this.use(i));
      bag.append(d);
    });
    const info = el('div', 'row');
    const pot = (k) => c.bag.filter((b) => b?.type === 'potion' && b.kind === k).reduce((a, b) => a + b.count, 0);
    info.innerHTML = `<span class="gold">&#9673; ${c.gold} gold</span><span class="dim">Draughts: <b style="color:#ff6a5a">${pot('life')}</b> healing (Q) · <b style="color:#7a9aff">${pot('mana')}</b> mana (Z)</span>`;
    const sortB = el('button', 'small', 'Sort');
    sortB.onclick = () => this.sort();
    info.append(sortB);
    mid.append(bag, info);
    wrap.append(left, mid, this.statsBlock());
    this.body.append(wrap);
  }

  /** Clicks, double-clicks, right-clicks, drags and hover tips on a cell. */
  wire(d, ref, quick) {
    d.onpointerdown = (e) => { if (ref) this.grab(e, ref, d); };
    d.onclick = () => { this.sel = ref; this.render(); };
    d.ondblclick = () => { if (ref) quick(); };
    d.oncontextmenu = (e) => { e.preventDefault(); if (ref) quick(); };
    if (ref) {
      d.onpointerenter = (e) => { if (e.pointerType === 'mouse' && !this.drag) this.showTip(ref, e); };
      d.onpointerleave = () => this.tip.classList.add('hidden');
    }
  }

  showTip(ref, e) {
    const it = this.item(ref);
    if (!it) return;
    const c = this.o.char();
    const cmp = ref.where === 'bag' && it.type === 'gear' ? c.equip[slotFor(c.equip, it)] : null;
    const hint = ref.where !== 'bag' ? 'Double-click to take it off' : it.type === 'gear' ? 'Double-click to put it on' : it.type === 'potion' ? 'Double-click to drink'
      : it.type === 'gem' ? 'Drag it onto a piece with an empty socket (double-click: into what you wear)' : it.type === 'recipe' ? 'Double-click to learn it' : '';
    this.tip.innerHTML = tooltip(it, { compare: cmp, hint, char: c });
    this.tip.classList.remove('hidden');
    this.tipMove(e);
  }

  tipMove(e) {
    if (this.tip.classList.contains('hidden')) return;
    const r = this.tip.getBoundingClientRect();
    let x = e.clientX + 16, y = e.clientY + 12;
    if (x + r.width > innerWidth - 4) x = e.clientX - r.width - 12;
    if (y + r.height > innerHeight - 4) y = innerHeight - r.height - 4;
    this.tip.style.left = x + 'px'; this.tip.style.top = Math.max(4, y) + 'px';
  }

  detail() {
    const box = el('div', 'item-detail');
    const it = this.item(this.sel);
    if (!it) { box.innerHTML = '<div class="dim">Tap or click a thing to look at it. Drag to put it on, move it, or (out of the window) drop it. Double-click to put on, take off or drink.</div>'; return box; }
    const c = this.o.char();
    box.innerHTML = tooltip(it, { compare: this.sel.where === 'bag' && it.type === 'gear' ? c.equip[slotFor(c.equip, it)] : null, char: c });
    const row = el('div', 'row');
    const btn = (label, fn, cls = 'small') => { const b = el('button', cls, label); b.onclick = fn; row.append(b); };
    if (this.sel.where === 'bag') {
      const i = this.sel.idx;
      if (it.type === 'gear') btn('Put on', () => this.equipFromBag(i));
      if (it.type === 'potion') btn('Drink', () => this.use(i));
      if (it.type === 'recipe') btn(knows(c, it.recipe) ? 'Known already' : 'Learn it', () => this.learnAt(i), knows(c, it.recipe) ? 'small' : 'small sel');
      if (it.type === 'gem') {   // set it: in which piece (what's worn first)
        const list = this.socketable();
        if (list.length) {
          const pickEl = el('select', 'gemto');
          list.forEach((x, k) => { const o = el('option', null, esc(`${x.it.name} (${x.where === 'bag' ? 'in the bag' : x.where})`)); o.value = k; pickEl.append(o); });
          row.append(pickEl);
          btn('Set it', () => this.socket(i, list[Number(pickEl.value)]?.it), 'small sel');
        } else row.append(el('span', 'dim small', 'Nothing has an empty socket. Garrow the smith cuts them.'));
      }
      btn('Drop', () => { this.o.onDrop?.(i); this.sel = null; this.changed(); }, 'small red');
    } else {
      const s = this.sel.slot;
      btn('Take off', () => this.unequip(s));
    }
    box.append(row);
    return box;
  }

  statsBlock() {
    const st = this.o.stats(), p = this.o.player?.();
    const box = el('div', 'col stats');
    const [a, b] = st.weapon;
    const k = 1 + st.dmgPct / 100;
    const rows = [
      ['Life', p ? `${Math.round(p.health)} / ${st.maxLife}` : st.maxLife], ['Mana', p ? `${Math.round(p.mana)} / ${st.maxMana}` : st.maxMana],
      ['Damage', `${Math.round((a + st.dmg) * k)}–${Math.round((b + st.dmg) * k)}`], ['Critical', `${st.crit.toFixed(0)}% / +${Math.round(st.critDmg)}%`],
      ['Spell Damage', `+${Math.round(st.spellPct)}%`], ['Armour', `${st.armor} (${Math.round(armorCut(st.armor) * 100)}% less hurt)`],
      ['Guard', st.shield ? `${st.shield.guard}` : '—'], ['Blocked', st.shield ? `${Math.round(st.shield.block * 100)}%` : '—'],
      ['Life Steal', `${st.lifeSteal.toFixed(1)}%`], ['Life Regen', `${st.lifeRegen.toFixed(1)}/s`],
      ['Mana Regen', `${st.manaRegen.toFixed(1)}/s`], ['Move Speed', `+${Math.round(st.moveSpeed)}%`],
    ];
    const c = fitLevel(this.o.char()), need = xpToNext(c.level);
    let h = `<h3>Tessariel <em>— level ${c.level}</em></h3>`;
    h += `<div class="xpline"><i style="width:${c.level >= MAX_LEVEL ? 100 : Math.min(100, c.xp / need * 100).toFixed(1)}%"></i><span>${c.level >= MAX_LEVEL ? 'the highest level' : `${c.xp} / ${need} experience`}</span></div>`;
    h += `<div class="attrs"><div class="dim small">${c.points ? `<b class="gold">${c.points}</b> point${c.points > 1 ? 's' : ''} to spend` : "No class: put each level's points where you like"}</div>`;
    for (const [k, A] of Object.entries(ATTRS)) h += `<div class="attr" title="${A.desc}"><span>${A.name}</span><b>${c.attrs[k]}</b><button class="small plus" data-attr="${k}" ${c.points ? '' : 'disabled'}>+</button></div>`;
    h += `<div class="dim small">${Object.values(ATTRS).map((A) => `${A.name}: ${A.desc}`).join('<br>')}</div>`;
    h += `<button class="small respec" ${Object.values(c.attrs).some((v) => v) ? '' : 'disabled'}>Take the points back</button></div>`;
    h += '<h3>Numbers</h3><div class="stats-grid">';
    for (const [k2, v] of rows) h += `<span class="dim">${k2}</span><span class="v">${v}</span>`;
    h += '</div>';
    const en = Object.entries(st.enchants).filter(([, v]) => v);
    if (en.length) h += '<h3>Shield</h3>' + en.map(([e, v]) => `<div class="tt-ench">${ENCHANTS[e].name}: ${esc(ENCHANTS[e].desc(v))}</div>`).join('');
    box.innerHTML = h;
    // spend a point (or take them all back): the numbers follow at once
    for (const b of box.querySelectorAll('button.plus')) b.onclick = () => {
      const ch = this.o.char();
      if (ch.points <= 0) return;
      ch.points--; ch.attrs[b.dataset.attr]++;
      this.changed();
    };
    box.querySelector('button.respec').onclick = () => {
      const ch = this.o.char();
      for (const k of Object.keys(ch.attrs)) { ch.points += ch.attrs[k]; ch.attrs[k] = 0; }
      this.changed();
    };
    return box;
  }

  /** The third tab: the materials pouch, the plans known, and the great ones' reagents. */
  renderMats() {
    const c = fitCraft(this.o.char());
    const wrap = el('div', 'mats-wrap');
    const left = el('div', 'col');
    left.append(el('h3', null, 'Materials <em>— what the dead, the Vigil and the boxes leave. They take no room in the bag</em>'));
    const grid = el('div', 'matgrid');
    const have = Object.keys(MATS).filter((m) => c.mats[m] > 0 && !MATS[m].boss).sort((a, b) => MATS[a].tier - MATS[b].tier);
    if (!have.length) grid.append(el('div', 'dim', 'Nothing yet. Strike down the dead and the Vigil, break crates and search chests: what a smith can use goes in here.'));
    for (const m of have) grid.append(this.matCell(m, c.mats[m]));
    left.append(grid);
    left.append(el('h3', null, 'Reagents of the Great <em>— each carried by one of them only</em>'));
    const great = el('div', 'matgrid');
    for (const m of Object.keys(MATS).filter((k) => MATS[k].boss)) great.append(this.matCell(m, c.mats[m] || 0, true));
    left.append(great);
    const right = el('div', 'col plans');
    right.append(el('h3', null, 'Plans you know <em>— forged at Hammerfall (Garrow); gems at the Alchemist’s (Idris)</em>'));
    for (const id of known(c)) right.append(planRow(id, c));
    right.append(el('div', 'dim small', 'More plans lie in chests and on the bodies of the Vigil, and merchants sell some. Double-click one in the bag to learn it.'));
    wrap.append(left, right);
    this.body.append(wrap);
  }

  matCell(m, n, great = false) {
    const M = MATS[m], d = el('div', 'mcell' + (great && !n ? ' none' : ''));
    d.innerHTML = `<img src="${craftIcon({ type: 'mat', mat: m })}" alt=""><b style="color:${MAT_TIER_COLOR[M.tier]}">${esc(M.name)}</b><span>${n ? '× ' + n : great ? (M.future ? 'not yet risen' : 'not had') : ''}</span>`;
    d.onpointerenter = (e) => { if (e.pointerType !== 'mouse') return; this.tip.innerHTML = matTip(m, n); this.tip.classList.remove('hidden'); this.tipMove(e); };
    d.onpointerleave = () => this.tip.classList.add('hidden');
    d.onclick = (e) => { this.tip.innerHTML = matTip(m, n); this.tip.classList.remove('hidden'); this.tipMove(e); };
    return d;
  }

  renderSpells() {
    const { spells, spellIcons } = this.o, book = this.o.book();
    const grid = el('div', 'grid spells');
    for (const [id, s] of Object.entries(spells)) {
      const card = el('div', 'card spell');
      card.innerHTML = `<img src="${spellIcons[id]}" alt=""><div class="nm">${s.name}</div>
        <div class="ty">${s.hands === 2 ? 'two hands' : 'one hand'} · ${s.mana} mana</div><div class="ds">${s.desc}</div>`;
      const row = el('div', 'hb');
      for (const slot of SPELL_KEYS) {
        const b = el('button', book[slot] === id ? 'sel' : '', slot);
        b.onclick = () => { this.o.onAssign(id, slot); this.render(); };
        row.append(b);
      }
      card.append(row);
      grid.append(card);
    }
    this.body.append(el('h3', null, 'Spellbook <em>— set a spell to F, R, X, C or V, then press that key to cast. Every spell is open to you, at any level, while Bellmourn is in beta</em>'), grid);
  }
}

/** How much of a blow armour takes off (a share, never all of it). */
export const armorCut = (a) => a / (a + 60);

export function tooltip(it, opts = {}) {
  const { compare = null, hint = '' } = opts;
  const col = itemColor(it);
  let h = `<div class="tt-name" style="color:${col}">${esc(it.name)}</div>`;
  if (it.type === 'potion') {
    h += `<div class="dim">${it.kind === 'life' ? 'Heals 45 life over a moment' : 'Restores 50 mana'}. ${it.count > 1 ? `(${it.count} in the bag)` : ''}</div>`;
  } else if (it.type === 'gear') {
    const R = RARITY[it.rarity];
    h += `<div class="tt-base">${esc(it.base)} · ${R.name} ${SLOT_NAMES[it.slot]} · Item Level ${it.ilvl}</div>`;
    if (it.dmg) h += `<div>Damage: <b>${it.dmg[0]}–${it.dmg[1]}</b>${cmpLine(compare, it, 'dmg')}</div>`;
    if (it.guard) h += `<div>Guard: <b>${it.guard}</b>${cmpLine(compare, it, 'guard')} · Blocks <b>${Math.round(it.block * 100)}%</b></div>`;
    if (it.armor) h += `<div>Armour: <b>${it.armor}</b>${cmpLine(compare, it, 'armor')}</div>`;
    if (it.implicit?.length || it.affixes.length) h += '<div class="tt-sep"></div>';
    for (const a of it.implicit || []) h += `<div class="tt-imp">${esc(statLabel(a.s, a.v))}</div>`;
    for (const a of it.affixes) h += `<div class="tt-line">${esc(statLabel(a.s, a.v))}</div>`;
    if (it.enchants?.length) {
      h += '<div class="tt-sep"></div>';
      for (const e of it.enchants) h += `<div class="tt-ench"><b>${ENCHANTS[e.e].name}</b>: ${esc(ENCHANTS[e.e].desc(e.v))}</div>`;
    }
    if (it.sockets?.length) {
      h += '<div class="tt-sep"></div>';
      const place = gemPlace(it.slot);
      for (const g of it.sockets) {
        if (!g || !GEMS[g.gem]) { h += '<div class="tt-gem empty"><i></i>Empty socket</div>'; continue; }
        const G = GEMS[g.gem];
        h += `<div class="tt-gem"><i style="background:${G.color}; box-shadow: 0 0 6px ${G.color}"></i><b style="color:${G.color}">${esc(gemName(g.gem, g.grade))}</b>: ${esc(gemWhat(g, place))}</div>`;
      }
      const look = it.sockets.find((g) => g && GEMS[g.gem]);
      const worn = ['head', 'body', 'legs', 'feet', 'ring'].includes(it.slot);
      if (look) h += `<div class="tt-look">${esc(worn ? GEMS[look.gem].lookWorn : it.slot === 'hands' ? GEMS[look.gem].lookHands : GEMS[look.gem].look)}</div>`;
    }
    if (it.forged) h += `<div class="tt-forged">Forged at Hammerfall from the plans for ${esc(it.forged)}</div>`;
    if (it.lore) h += `<div class="tt-sep"></div><div class="tt-lore">${esc(it.lore)}</div>`;
    h += `<div class="tt-price">${it.unique ? '<span class="tt-uniq">Unique</span> · ' : ''}Worth ${itemValue(it)} gold</div>`;
  } else if (it.type === 'gem') {
    const G = GEMS[it.gem] || GEMS.ruby, g = { gem: it.gem, grade: it.grade };
    h += `<div class="tt-base">${G.only ? 'A piece of the green star' : `${GRADES[it.grade]?.name || 'Cut'} gem`}${it.count > 1 ? ` · ${it.count} of them` : ''}</div>`;
    const line = (place, label) => `<div class="tt-gemplace"><b>${label}:</b> ${esc(gemWhat(g, place))}</div>`;
    h += '<div class="tt-sep"></div>' + line('weapon', 'In a weapon or staff') + line('armor', 'In armour, gauntlets or a ring') + line('shield', 'In a shield');
    h += `<div class="tt-sep"></div><div class="tt-look"><b>In hand:</b> ${esc(G.look)}</div><div class="tt-look"><b>On gauntlets:</b> ${esc(G.lookHands)}</div><div class="tt-look"><b>Worn:</b> ${esc(G.lookWorn)}</div>`;
    if (!G.only) h += `<div class="dim small">${it.grade >= 5 ? 'A perfect stone: it shows at its brightest.' : 'The finer the gem, the brighter it shows. Three of a grade make one of the next, at Idris’s.'}</div>`;
    h += `<div class="tt-price">Worth ${itemValue(it)} gold${it.count > 1 ? ' each' : ''}</div>`;
  } else if (it.type === 'recipe') {
    const R = RECIPES[it.recipe];
    if (R) {
      h += `<div class="tt-base">${PLAN_TIER[R.tier]} · for ${R.at === 'gems' ? 'Idris the alchemist' : 'Garrow’s forge'} · level ${R.level || 1}</div>`;
      h += `<div class="tt-line">${esc(planMakes(R))}</div>`;
      if (R.desc || R.makes.unique?.lore) h += `<div class="tt-lore">${esc(R.desc || R.makes.unique.lore)}</div>`;
      h += '<div class="tt-sep"></div>' + needsHtml(it.recipe, opts.char);
      if (opts.char && knows(opts.char, it.recipe)) h += '<div class="dim small">You know these plans already.</div>';
    }
    h += `<div class="tt-price">Worth ${itemValue(it)} gold</div>`;
  }
  if (hint) h += `<div class="dim small">${hint}</div>`;
  return h;
}

function cmpLine(other, it, k) {
  if (!other || other === it || other[k] === undefined) return '';
  const a = Array.isArray(it[k]) ? (it[k][0] + it[k][1]) / 2 : it[k], b = Array.isArray(other[k]) ? (other[k][0] + other[k][1]) / 2 : other[k];
  const d = Math.round(a - b);
  return d ? ` <span class="${d > 0 ? 'up' : 'down'}">(${d > 0 ? '+' : ''}${d})</span>` : '';
}

/** What a gem does where it's set, in words. */
export function gemWhat(g, place) {
  const b = gemBonus(g, place);
  return [...b.stats.map(([st, v]) => statLabel(st, v)), ...b.enchants.map(([e, v]) => (e === 'thorns' ? statLabel('thorns', v) : `${ENCHANTS[e]?.name}: ${ENCHANTS[e]?.desc(v)}`))].join('; ');
}

/** The small round sockets on a cell: empty ones dark, filled ones the gem's colour. */
export function sockDots(it) {
  const d = el('div', 'sock');
  for (const g of it.sockets) {
    const i = el('i');
    if (g && GEMS[g.gem]) { i.style.background = GEMS[g.gem].color; i.style.boxShadow = `0 0 4px ${GEMS[g.gem].color}`; i.className = 'on'; }
    d.append(i);
  }
  return d;
}

// what each kind of thing is called in a plan
const MAKES = { onehand: 'One-handed weapon', twohand: 'Two-handed weapon', staff: 'Staff', shield_round: 'Round shield', shield_kite: 'Kite shield',
  head: 'Helm', body: 'Body armour', legs: 'Leg armour', feet: 'Boots', hands: 'Gauntlet', ring: 'Ring' };
const ADDS = { spellPct: 'spell damage', moveSpeed: 'speed', armor: 'armour', dmgPct: 'damage', guard: 'guard', crit: 'critical strike', critDmg: 'critical damage', life: 'life', lifeRegen: 'life regeneration' };
/** What a plan makes, in a line. */
export function planMakes(R) {
  const M = R.makes;
  if (M.gem) return `Makes a ${GEMS[M.gem]?.name || 'gem'}`;
  if (M.unique) { const u = M.unique; return `Makes ${u.name}: a ${RARITY[u.rarity].name} ${(MAKES[u.kind || u.slot] || '').toLowerCase()}, ${u.sockets} socket${u.sockets === 1 ? '' : 's'}`; }
  const r = M.rarity[0] === M.rarity[1] ? RARITY[M.rarity[0]].name : `${RARITY[M.rarity[0]].name} or ${RARITY[M.rarity[1]].name}`;
  const so = M.sockets ? (M.sockets[0] === M.sockets[1] ? `${M.sockets[0]}` : `${M.sockets[0]}-${M.sockets[1]}`) : '0';
  const extra = Object.keys(M.add || {}).map((k) => ADDS[k] || k);
  return `Makes a ${r} ${(MAKES[M.kind || M.slot] || '').toLowerCase()}${M.base ? ` (${M.base})` : ''}, ${so} socket${so === '1' ? '' : 's'}${extra.length ? `, with more ${extra.join(' and ')}` : ''}`;
}
/** What a plan wants, with what you have of each. */
export function needsHtml(id, c = null) {
  const R = RECIPES[id];
  const chk = c ? check(c, id) : null;
  let h = '<div class="needs">';
  for (const [m, n] of Object.entries(R.needs)) {
    const M = MATS[m], hv = c ? c.mats?.[m] || 0 : null;
    h += `<span class="${hv == null ? '' : hv >= n ? 'up' : 'down'}"><img src="${craftIcon({ type: 'mat', mat: m })}" alt="">${esc(M?.name || m)} ${hv == null ? '' : hv + ' / '}${n}</span>`;
  }
  h += `<span class="${chk ? (chk.gold ? 'up' : 'down') : ''}">&#9673; ${R.gold || 0} gold</span></div>`;
  return h;
}
/** A known plan, in the materials tab: what it makes and what it wants. */
function planRow(id, c) {
  const R = RECIPES[id], d = el('div', 'plan-row');
  const ok = check(c, id).ok;
  d.innerHTML = `<img src="${craftIcon({ type: 'recipe', tier: R.tier })}" alt=""><div><b style="color:${PLAN_COLOR[R.tier]}">${esc(R.name)}</b>${ok ? ' <em class="up">ready to make</em>' : ''}
    <div class="dim small">${esc(planMakes(R))} · ${R.at === 'gems' ? 'Idris' : 'Garrow'}</div>${needsHtml(id, c)}</div>`;
  return d;
}
/** A material's tip. */
export function matTip(m, n = 0) {
  const M = MATS[m];
  let h = `<div class="tt-name" style="color:${MAT_TIER_COLOR[M.tier]}">${esc(M.name)}</div><div class="tt-base">${MAT_TIER[M.tier]}${n ? ` · ${n} in the pouch` : ''}</div>`;
  h += `<div class="tt-lore">${esc(M.desc)}</div>`;
  if (M.from) h += `<div class="tt-sep"></div><div class="${M.future ? 'tt-future' : 'tt-ench'}">Carried by ${esc(M.from)}${M.future ? ' — a power not yet risen in Bellmourn' : ''}</div>`;
  const uses = Object.entries(RECIPES).filter(([, R]) => R.needs[m]).map(([, R]) => R.name);
  if (uses.length) h += `<div class="dim small">Wanted for: ${esc(uses.slice(0, 6).join(', '))}${uses.length > 6 ? '…' : ''}</div>`;
  return h;
}
