// Charms: small things of power, kept in their own pouch beside the bag (twenty places). Every
// charm carried works: each one grants an ability, and the abilities are listed on the character
// sheet. They're found and earned about the world (the first, the Wingbell, is the Bellwright's
// reward in the bell tower on the downs) and are never sold, dropped or broken.
//
// An item: { type: 'charm', charm: <id>, name, id }. addToBag (gear.js) sends any charm here.

export const CHARM_SLOTS = 20;
export const CHARM_COLOR = '#c9b8ff';   // (their names, and the pouch's frames: a pale bell-silver violet)

/** What a charm can let you do. */
export const ABILITIES = {
  doubleJump: { name: 'Double Jump', desc: 'Press jump again while in the air to leap a second time.' },
};

// 16x16 pixel icons, one character a pixel; palette per charm
const ICONS = {
  // a little silver bell with a swift's wing swept back from its shoulder, on a violet cord
  wingbell: ['......vv........', '.....v..v.......', '......vv........', '......ss........', '....slllss......', '...slllllss..ww.',
    '...sllllsss.wwww', '..sllllsssswwww.', '..slllssssswww..', '..sllsssssssw...', '.sllssssssssd...', '.ssssssssssssd..',
    '.ddddddddddddd..', '......dyyd......', '.......yy.......', '................'],
};
const PAL = { wingbell: { v: '#8a5cff', s: '#b8bcc8', l: '#f4f6ff', d: '#5a5e6e', w: '#e8e0ff', y: '#ffd870' } };

export const CHARMS = {
  wingbell: { name: 'The Wingbell', ability: 'doubleJump',
    lore: 'A silver bell no bigger than a thumb, a swift\'s wing cast on its shoulder. Ring it in the air and the air rings back, and holds you up for one more step.' },
};

let uid = 0;
/** A charm to give (null for one that doesn't exist). */
export function makeCharm(id) {
  const C = CHARMS[id];
  return C ? { type: 'charm', charm: id, name: C.name, id: `charm-${id}-${Date.now().toString(36)}-${uid++}` } : null;
}

/** The pouch made whole on an old save (twenty places, unknown charms let go). */
export function fitCharms(c) {
  if (!Array.isArray(c.charms)) c.charms = [];
  c.charms = c.charms.map((it) => (it && CHARMS[it.charm] ? it : null));
  while (c.charms.length < CHARM_SLOTS) c.charms.push(null);
  c.charms.length = CHARM_SLOTS;
  return c;
}

/** Put a charm in the pouch (one of each: a second is no more use than the first). False when full. */
export function addCharm(c, it) {
  fitCharms(c);
  if (c.charms.some((x) => x?.charm === it.charm)) return true;
  const i = c.charms.findIndex((x) => !x);
  if (i < 0) return false;
  c.charms[i] = it;
  return true;
}

/** The abilities the carried charms give: [{id, name, desc, from}] */
export function abilitiesOf(c) {
  const out = [];
  for (const it of c?.charms || []) {
    const C = it && CHARMS[it.charm];
    if (C?.ability && ABILITIES[C.ability] && !out.some((a) => a.id === C.ability)) out.push({ id: C.ability, ...ABILITIES[C.ability], from: C.name });
  }
  return out;
}
export const hasAbility = (c, id) => !!c?.charms?.some((it) => it && CHARMS[it.charm]?.ability === id);

const iconCache = {};
/** A charm's icon (a data URL, drawn once). */
export function charmIcon(id) {
  if (iconCache[id]) return iconCache[id];
  const rows = ICONS[id], pal = PAL[id];
  if (!rows) return '';
  const cv = document.createElement('canvas');
  cv.width = cv.height = 16;
  const g = cv.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return (iconCache[id] = cv.toDataURL());
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
/** A charm's hover card. */
export function charmTip(it) {
  const C = CHARMS[it.charm], A = ABILITIES[C.ability];
  return `<div class="tt-name" style="color:${CHARM_COLOR}">${esc(C.name)}</div><div class="tt-base">Charm</div>`
    + (A ? `<div class="tt-ench">${esc(A.name)}: ${esc(A.desc)}</div>` : '')
    + `<div class="tt-lore">${esc(C.lore)}</div><div class="dim small">Works while it is carried in the charm pouch.</div>`;
}
