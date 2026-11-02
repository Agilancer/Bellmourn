// Merchants. Three shops in Bellmourn buy anything you carry (at what it's worth) and sell their own
// goods (at four times that, about): Garrow at Hammerfall Forge (arms and armour; he cuts sockets for
// a fee, forges from the plans you know, and breaks down what you don't want for its materials),
// Idris at the Alchemist's (gems; three of a grade made one of the next, gems prised out whole, the
// Starshard's formula) and Master and Mistress Grimwald at their stall in the square (draughts,
// materials by the bundle, plans, a few rings and boots). What you sold this visit can be bought
// back at what you got for it. Speak with them (E) to trade; Esc or E again to leave.
import { makeGear, makePotion, addToBag, itemValue, itemColor, SLOTS, SLOT_NAMES, RARITY } from './gear.js';
import { GEMS, makeGem, rollGem, gemName, maxSockets, socketPrice, unsocketPrice, combinePrice, GRADES } from './gems.js';
import { MATS, RECIPES, PLAN_COLOR, makeMat, makeRecipe, recipeValue, matValue, known, knows, check, forge, made, salvageYield, fitCraft } from './craft.js';
import { tooltip, sockDots, needsHtml, planMakes, matTip, craftIcon } from './bag.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ------------------------------------------------------------------ the shops
export const SHOPS = {
  smith: { name: 'Hammerfall Forge', keeper: 'Garrow the smith', tabs: ['buy', 'sell', 'sockets', 'forge', 'salvage', 'back'],
    greet: ['What needs mending?', 'Hammerfall’s open. Mind the sparks.', 'Steel for coin, coin for steel. What have you got?', 'Bring me the Vigil’s black steel and I can make you something worth carrying.'] },
  gems: { name: 'The Alchemist’s', keeper: 'Idris the alchemist', tabs: ['buy', 'sell', 'gemcraft', 'back'],
    greet: ['Gems! Yes. Everything is perfectly safe in here.', 'Three small stones make one fine one. Mostly.', 'Do not touch the green ones. Well. You may touch the green ones.', 'A stone in a socket sings. Let me hear what yours say.'] },
  goods: { name: 'Grimwald’s Goods', keeper: 'Master and Mistress Grimwald', tabs: ['buy', 'sell', 'back'],
    greet: ['Draughts, scraps and odds and ends. Have a look.', 'We buy anything. Anything at all. Within reason.', 'Fresh from Millhaven, before the knights came. Mostly.', 'Coin first, then the goods. That’s how it’s done.'] },
};
/** Who keeps which shop. */
export const MERCHANT_OF = { Garrow: 'smith', Idris: 'gems', Grimwald: 'goods', Bertha: 'goods' };
/** Where the Grimwalds stand: in front of their stalls in the square, facing the well (Garrow and
 * Idris keep their own posts by their doors: quests.js GIVERS). */
export const SHOP_POSTS = { Grimwald: [8.4, 8.4, Math.atan2(-1, -1)], Bertha: [-8.4, 8.4, Math.atan2(1, -1)] };
const TAB_NAME = { buy: 'Buy', sell: 'Sell', back: 'Buy Back', sockets: 'Sockets', forge: 'Forge', salvage: 'Break Down', gemcraft: 'Gemcraft' };

/** What a merchant asks for it (a stack: for all of it). */
export function buyPrice(it) {
  if (it.price) return it.price;
  if (it.type === 'potion') return 25 * (it.count || 1);
  if (it.type === 'mat') return matValue(it.mat) * 5 * (it.n || 1);
  if (it.type === 'recipe') return recipeValue(it.recipe) * 5;
  if (it.type === 'gem') return itemValue(it) * 3 * (it.count || 1);
  return Math.max(10, Math.round(itemValue(it) * 4));
}
/** What a merchant gives for it (all of a stack). */
export const sellPrice = (it) => (it.type === 'gear' ? itemValue(it) : itemValue(it) * (it.count || 1));

// ------------------------------------------------------------------ the window
export class Trade {
  /** o: { ui, char(), icon(item, again) -> url, toast(t), sfx, onChange() (what's worn changed),
   * onMade(item, how) (a new thing: into the bag, or at your feet), onClose(), say(name, line) } */
  constructor(o) {
    this.o = o;
    this.stock = {};          // shop -> { items, at, level }
    this.sold = [];           // [{ it, price }]: what can be bought back
    this.shop = null; this.who = null; this.tab = 'buy'; this.sel = null;
    const p = this.panel = el('div', 'panel trade hidden');
    const close = el('button', 'close', '&times;');
    close.onclick = () => o.onClose?.();
    this.head = el('div', 'tr-head');
    this.tabs = el('div', 'tabs');
    this.body = el('div', 'tr-body');
    this.foot = el('div', 'tr-foot');
    p.append(close, this.head, this.tabs, this.body, this.foot);
    this.tip = el('div', 'tt hidden');
    o.ui.append(p, this.tip);
    addEventListener('pointermove', (e) => this.tipMove(e));
  }

  get open() { return !this.panel.classList.contains('hidden'); }

  /** Open a shop (its key, and the name of who's keeping it). */
  show(shop, who = null) {
    this.shop = shop; this.who = who; this.tab = 'buy'; this.sel = null;
    this.panel.className = `panel trade shop-${shop}`;
    this.restock();
    this.render();
    const S = SHOPS[shop];
    if (who) this.o.say?.(who, pick(S.greet));
  }
  close() { this.panel.classList.add('hidden'); this.tip.classList.add('hidden'); this.shop = null; }

  // -------------------------------------------------------------- stock
  /** A shop's goods, rolled fresh every ten minutes or so, or when you've gone up a level. */
  restock(force = false) {
    const c = this.o.char(), lv = c.level || 1, now = performance.now();
    const S = this.stock[this.shop];
    if (S && !force && now - S.at < 600000 && S.level === lv) return;
    const items = [];
    const gear = (o) => makeGear({ ilvl: Math.max(1, lv + Math.floor(Math.random() * 3) - 1), bonus: 0.8, ...o });
    const plans = (tier, n) => {
      const ids = Object.keys(RECIPES).filter((k) => RECIPES[k].tier === tier && !knows(c, k) && RECIPES[k].at === (this.shop === 'gems' ? 'gems' : 'forge'));
      for (let i = 0; i < n && ids.length; i++) items.push(makeRecipe(ids.splice(Math.floor(Math.random() * ids.length), 1)[0]));
    };
    const bundle = (mat, n) => ({ ...makeMat(mat, n), infinite: true });
    if (this.shop === 'smith') {
      for (const slot of ['weapon', 'weapon', 'weapon', 'weapon', 'offhand', 'offhand', 'head', 'body', 'body', 'hands', 'legs', 'feet']) items.push(gear({ slot }));
      // one finer piece, always with a socket or two
      const fine = gear({ slot: pick(['weapon', 'weapon', 'offhand', 'body']), rarity: lv >= 8 && Math.random() < 0.4 ? 3 : 2 });
      if (!fine.sockets.length) fine.sockets = [null];
      items.push(fine);
      plans(1, 3);
      items.push(bundle('iron', 5), bundle('leather', 5), bundle('timber', 5));
    } else if (this.shop === 'gems') {
      const n = 10 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) { const g = rollGem(Math.min(lv + 4, 30)); if (g.gem !== 'starshard') items.push(g); }
      for (const k of ['ruby', 'sapphire', 'topaz', 'emerald', 'amethyst', 'diamond']) items.push({ ...makeGem(k, 1), infinite: true });   // (the chipped ones, always)
      items.push(bundle('arcane', 1), { ...makeMat('starglass', 1), infinite: true, price: 260 });
      plans(2, 1);
      if (!knows(c, 'starshard')) items.push(makeRecipe('starshard'));
      const fp = Object.keys(RECIPES).filter((k) => RECIPES[k].tier === 2 && RECIPES[k].at === 'forge' && !knows(c, k));
      if (fp.length) items.push(makeRecipe(pick(fp)));
    } else {
      items.push({ ...makePotion('life', 1), infinite: true }, { ...makePotion('mana', 1), infinite: true });
      items.push(bundle('iron', 5), bundle('leather', 5), bundle('linen', 5), bundle('timber', 5), bundle('bone', 5));
      for (const slot of ['ring', 'ring', 'feet', 'head']) items.push(gear({ slot }));
      plans(1, 2);
    }
    this.stock[this.shop] = { items, at: now, level: lv };
  }

  // -------------------------------------------------------------- doing business
  gold() { return this.o.char().gold || 0; }
  pay(n) { const c = this.o.char(); if ((c.gold || 0) < n) { this.o.toast?.('You haven’t the gold'); this.o.sfx?.lock?.(false); return false; } c.gold -= n; this.o.sfx?.coin?.(); return true; }

  buy(i) {
    const S = this.stock[this.shop], it = S?.items[i];
    if (!it) return;
    const c = this.o.char(), price = buyPrice(it);
    if (c.gold < price) { this.o.toast?.('You haven’t the gold'); this.o.sfx?.lock?.(false); return; }
    let got;
    if (it.type === 'mat') { fitCraft(c); c.mats[it.mat] = (c.mats[it.mat] || 0) + (it.n || 1); got = true; }
    else {
      const copy = it.infinite ? { ...JSON.parse(JSON.stringify(it)), id: it.id + Math.random().toString(36).slice(2, 6), infinite: undefined, price: undefined } : it;
      delete copy.infinite; delete copy.price;
      got = addToBag(c, copy);
    }
    if (!got) { this.o.toast?.('Your bag is full'); return; }
    this.pay(price);
    if (!it.infinite) { S.items.splice(i, 1); this.sel = null; }
    this.o.toast?.(`Bought ${it.type === 'mat' ? `${it.n} × ${MATS[it.mat].name}` : it.name} for ${price} gold`);
    this.done();
  }

  sell(i) {
    const c = this.o.char(), it = c.bag[i];
    if (!it) return;
    const price = sellPrice(it);
    c.bag[i] = null;
    c.gold = (c.gold || 0) + price;
    this.sold.unshift({ it, price });
    this.sold.length = Math.min(this.sold.length, 15);
    this.o.sfx?.coin?.();
    this.o.toast?.(`Sold ${it.name}${it.count > 1 ? ` (${it.count})` : ''} for ${price} gold`);
    this.sel = null;
    this.done();
  }

  /** Sell everything of a rarity and below that's in the bag (not what has gems set in it). */
  sellAll(maxRarity) {
    const c = this.o.char();
    let n = 0, g = 0;
    c.bag.forEach((it, i) => {
      if (it?.type !== 'gear' || it.rarity > maxRarity || it.unique || (it.sockets || []).some(Boolean)) return;
      const p = sellPrice(it);
      c.bag[i] = null; g += p; n++;
      this.sold.unshift({ it, price: p });
    });
    this.sold.length = Math.min(this.sold.length, 15);
    if (!n) { this.o.toast?.('Nothing like that in the bag'); return; }
    c.gold += g;
    this.o.sfx?.coin?.();
    this.o.toast?.(`Sold ${n} piece${n > 1 ? 's' : ''} for ${g} gold`);
    this.sel = null;
    this.done();
  }

  buyBack(i) {
    const s = this.sold[i], c = this.o.char();
    if (!s) return;
    if (c.gold < s.price) { this.o.toast?.('You haven’t the gold'); return; }
    if (!addToBag(c, s.it)) { this.o.toast?.('Your bag is full'); return; }
    this.pay(s.price);
    this.sold.splice(i, 1);
    this.sel = null;
    this.done();
  }

  /** Garrow cuts another socket. */
  cut(it) {
    if (!it || it.type !== 'gear') return;
    if ((it.sockets?.length || 0) >= maxSockets(it)) { this.o.toast?.(`${it.name} will take no more sockets`); return; }
    if (!this.pay(socketPrice(it))) return;
    (it.sockets ||= []).push(null);
    this.o.sfx?.clang?.(false);
    setTimeout(() => this.o.sfx?.clang?.(false), 260);
    this.o.toast?.(`Garrow cuts a socket into ${it.name}`);
    this.o.onChange?.();
    this.done();
  }

  /** Garrow forges from a plan. */
  forgeIt(id) {
    const c = this.o.char();
    if (!check(c, id).ok) { this.o.toast?.('Not enough to make it yet'); return; }
    const free = c.bag.some((b) => !b);
    const it = forge(c, id);
    if (!it) return;
    this.o.sfx?.clang?.(true);
    setTimeout(() => this.o.sfx?.clang?.(false), 300);
    setTimeout(() => this.o.sfx?.clang?.(true), 620);
    this.o.onMade?.(it, RECIPES[id].at === 'gems' ? 'Made at the Alchemist’s' : 'Forged at Hammerfall');
    if (!free) this.o.toast?.('Your bag was full: it lies at your feet');
    this.done();
  }

  /** Break a piece down for its materials (its gems come back). */
  salvage(i) {
    const c = this.o.char(), it = c.bag[i];
    if (!it || it.type !== 'gear') return;
    if (it.unique) { this.o.toast?.(`Garrow won’t break down ${it.name}. "Not that. Never that."`); return; }
    const y = salvageYield(it);
    c.bag[i] = null;
    fitCraft(c);
    for (const [m, n] of Object.entries(y.mats)) c.mats[m] = (c.mats[m] || 0) + n;
    for (const g of y.gems) if (!addToBag(c, g)) this.o.onMade?.(g, null);
    this.o.sfx?.clang?.(false);
    this.o.toast?.(`Broken down: ${Object.entries(y.mats).map(([m, n]) => `${n} ${MATS[m].name}`).join(', ') || 'nothing worth keeping'}${y.gems.length ? `, and ${y.gems.length} gem${y.gems.length > 1 ? 's' : ''} back` : ''}`);
    this.sel = null;
    this.done();
  }

  salvageAll(maxRarity) {
    const c = this.o.char();
    const list = c.bag.map((it, i) => [it, i]).filter(([it]) => it?.type === 'gear' && it.rarity <= maxRarity && !it.unique && !(it.sockets || []).some(Boolean));
    if (!list.length) { this.o.toast?.('Nothing like that in the bag'); return; }
    const sum = {};
    for (const [it, i] of list) { for (const [m, n] of Object.entries(salvageYield(it).mats)) sum[m] = (sum[m] || 0) + n; c.bag[i] = null; }
    fitCraft(c);
    for (const [m, n] of Object.entries(sum)) c.mats[m] = (c.mats[m] || 0) + n;
    this.o.sfx?.clang?.(true);
    this.o.toast?.(`${list.length} broken down: ${Object.entries(sum).map(([m, n]) => `${n} ${MATS[m].name}`).join(', ')}`);
    this.sel = null;
    this.done();
  }

  /** Idris makes three gems of a grade one of the next. */
  combine(i) {
    const c = this.o.char(), g = c.bag[i];
    if (!g || g.type !== 'gem' || g.count < 3 || g.grade >= 5 || GEMS[g.gem]?.only) return;
    if (!this.pay(combinePrice(g.grade))) return;
    g.count -= 3;
    if (g.count <= 0) c.bag[i] = null;
    const out = makeGem(g.gem, g.grade + 1);
    if (!addToBag(c, out)) this.o.onMade?.(out, null);
    this.o.sfx?.chime?.();
    this.o.toast?.(`Idris fuses three into a ${out.name}`);
    this.sel = null;
    this.done();
  }

  /** Idris prises the gems out of a piece, whole. */
  unsocket(it) {
    const c = this.o.char(), gems = (it?.sockets || []).filter(Boolean);
    if (!gems.length) return;
    const free = c.bag.filter((b) => !b).length, stacks = gems.filter((g) => !c.bag.some((b) => b?.type === 'gem' && b.gem === g.gem && b.grade === g.grade)).length;
    if (stacks > free) { this.o.toast?.('Your bag hasn’t the room for them'); return; }
    if (!this.pay(unsocketPrice(it))) return;
    for (const g of gems) addToBag(c, makeGem(g.gem, g.grade));
    it.sockets = it.sockets.map(() => null);
    this.o.sfx?.chime?.();
    this.o.toast?.(`The gems come out of ${it.name} whole`);
    this.o.onChange?.();
    this.done();
  }

  done() { this.o.onTrade?.(); this.render(); }

  // -------------------------------------------------------------- drawing
  render() {
    if (!this.shop) return;
    const S = SHOPS[this.shop], c = this.o.char();
    this.panel.classList.remove('hidden');
    this.head.innerHTML = `<div><h2>${esc(S.name)}</h2><div class="tr-keeper">${esc(this.who === 'Bertha' ? 'Mistress Grimwald' : this.who === 'Grimwald' ? 'Master Grimwald' : S.keeper)}</div></div><div class="tr-gold">&#9673; <b>${c.gold || 0}</b> gold</div>`;
    this.tabs.innerHTML = '';
    for (const t of S.tabs) {
      const b = el('button', t === this.tab ? 'sel' : '', TAB_NAME[t] + (t === 'back' && this.sold.length ? ` (${this.sold.length})` : ''));
      b.onclick = () => { this.tab = t; this.sel = null; this.render(); };
      this.tabs.append(b);
    }
    this.body.innerHTML = '';
    const left = el('div', 'tr-list'), right = el('div', 'tr-card');
    this.body.append(left, right);
    this.tip.classList.add('hidden');
    ({ buy: () => this.drawBuy(left, right), sell: () => this.drawSell(left, right), back: () => this.drawBack(left, right), sockets: () => this.drawSockets(left, right),
      forge: () => this.drawForge(left, right), salvage: () => this.drawSalvage(left, right), gemcraft: () => this.drawGemcraft(left, right) })[this.tab]();
    this.foot.innerHTML = `<span class="dim">${this.footNote()}</span><span class="dim">Esc or E to leave · double-click to ${({ buy: 'buy', sell: 'sell', back: 'buy back', sockets: 'cut a socket', forge: 'forge', salvage: 'break down', gemcraft: 'do it' })[this.tab]}</span>`;
  }

  footNote() {
    return ({ buy: 'Everything here is yours for the price.', sell: 'Anything you carry, at what it’s worth. What you sell can be bought back while you’re here.',
      back: 'What you sold, at what you got for it.', sockets: 'Garrow cuts sockets for gems, up to what the piece will hold: the rarer, the more.',
      forge: 'Garrow forges from the plans you know. The materials go into it, and some gold.', salvage: 'Garrow breaks down what you don’t want for its materials. Any gems come back.',
      gemcraft: 'Idris makes three gems of a grade one of the next, prises gems out whole, and knows a formula or two.' })[this.tab] || '';
  }

  /** A cell for a thing (its picture, its sockets, a price under it). */
  cell(it, ref, price = null, opts = {}) {
    const d = el('div', 'tslot ' + (it.type === 'gear' ? 'r' + it.rarity : it.type === 'recipe' ? 'p' + (it.tier ?? 1) : 'r0') + (this.same(ref) ? ' sel' : '') + (opts.dim ? ' dim' : ''));
    const box = el('div', 'icell');
    const url = it.type === 'mat' ? craftIcon(it) : this.o.icon?.(it, () => this.render());
    if (url) { const img = new Image(); img.src = url; img.alt = ''; img.draggable = false; box.append(img); }
    const n = it.type === 'mat' ? it.n : it.count;
    if (it.type !== 'gear' && n > 1) box.append(el('span', 'stack', 'x' + n));
    if (it.sockets?.length) box.append(sockDots(it));
    d.append(box);
    if (price != null) d.append(el('span', 'price' + (price > (this.o.char().gold || 0) && opts.buy ? ' dear' : ''), String(price)));
    d.onclick = () => { this.sel = ref; this.render(); };
    d.ondblclick = () => { this.sel = ref; opts.act?.(); };
    d.oncontextmenu = (e) => { e.preventDefault(); this.sel = ref; opts.act?.(); };
    d.onpointerenter = (e) => { if (e.pointerType !== 'mouse') return; this.tip.innerHTML = this.tipOf(it); this.tip.classList.remove('hidden'); this.tipMove(e); };
    d.onpointerleave = () => this.tip.classList.add('hidden');
    return d;
  }
  same(ref) { return this.sel && ref && Object.keys(ref).every((k) => this.sel[k] === ref[k]); }
  tipOf(it) {
    if (it.type === 'mat') return matTip(it.mat, 0) + `<div class="tt-price">${it.n} for ${buyPrice(it)} gold</div>`;
    const c = this.o.char(), cmp = it.type === 'gear' ? c.equip[it.slot === 'ring' ? 'ring1' : it.slot] : null;
    return tooltip(it, { compare: cmp && cmp !== it ? cmp : null, char: c });
  }
  tipMove(e) {
    if (this.tip.classList.contains('hidden')) return;
    const r = this.tip.getBoundingClientRect();
    let x = e.clientX + 16, y = e.clientY + 12;
    if (x + r.width > innerWidth - 4) x = e.clientX - r.width - 12;
    if (y + r.height > innerHeight - 4) y = innerHeight - r.height - 4;
    this.tip.style.left = x + 'px'; this.tip.style.top = Math.max(4, y) + 'px';
  }

  /** The card on the right: the thing's tip and what can be done with it. */
  card(right, it, actions = [], extra = '') {
    if (!it) { right.innerHTML = `<div class="dim">${extra || 'Click something to look at it.'}</div>`; return; }
    right.innerHTML = this.tipOf(it) + extra;
    const row = el('div', 'row');
    for (const [label, fn, cls = 'sel', off = false] of actions) { const b = el('button', cls, label); b.disabled = off; b.onclick = fn; row.append(b); }
    right.append(row);
  }

  bagGrid(left, { filter = () => true, price = null, act = null } = {}) {
    const c = this.o.char(), grid = el('div', 'tgrid bagrid-t');
    c.bag.forEach((it, i) => {
      if (!it) { grid.append(el('div', 'tslot empty')); return; }
      const ok = filter(it);
      grid.append(this.cell(it, { where: 'bag', idx: i }, ok && price ? price(it) : null, { dim: !ok, act: ok ? () => act?.(i) : null }));
    });
    left.append(grid);
  }

  drawBuy(left, right) {
    const S = this.stock[this.shop], grid = el('div', 'tgrid');
    S.items.forEach((it, i) => grid.append(this.cell(it, { where: 'stock', idx: i }, buyPrice(it), { buy: true, act: () => this.buy(i) })));
    left.append(el('h3', null, 'For sale'), grid);
    const it = this.sel?.where === 'stock' ? S.items[this.sel.idx] : null;
    this.card(right, it, it ? [[`Buy — ${buyPrice(it)} gold`, () => this.buy(this.sel.idx), 'sel', buyPrice(it) > this.gold()]] : [], it ? '' : 'Click something to look at it, double-click to buy it.');
  }

  drawSell(left, right) {
    left.append(el('h3', null, 'Your bag'));
    this.bagGrid(left, { price: sellPrice, act: (i) => this.sell(i) });
    const row = el('div', 'row');
    const q = (label, fn) => { const b = el('button', 'small', label); b.onclick = fn; row.append(b); };
    q('Sell every Common piece', () => this.sellAll(0));
    q('…and every Uncommon', () => this.sellAll(1));
    left.append(row, el('div', 'dim small', 'Pieces with gems set in them, and treasures, are never sold in a heap.'));
    const it = this.sel?.where === 'bag' ? this.o.char().bag[this.sel.idx] : null;
    const gems = (it?.sockets || []).filter(Boolean).length;
    this.card(right, it, it ? [[`Sell — ${sellPrice(it)} gold`, () => this.sell(this.sel.idx), 'sel red']] : [], it && gems ? `<div class="warn">The ${gems > 1 ? 'gems' : 'gem'} in it go with it. (Idris prises them out whole.)</div>` : it ? '' : 'Click a thing to look at it, double-click to sell it.');
  }

  drawBack(left, right) {
    const grid = el('div', 'tgrid');
    this.sold.forEach((s, i) => grid.append(this.cell(s.it, { where: 'back', idx: i }, s.price, { buy: true, act: () => this.buyBack(i) })));
    left.append(el('h3', null, 'Sold to us'), this.sold.length ? grid : el('div', 'dim', 'Nothing yet.'));
    const s = this.sel?.where === 'back' ? this.sold[this.sel.idx] : null;
    this.card(right, s?.it, s ? [[`Buy back — ${s.price} gold`, () => this.buyBack(this.sel.idx), 'sel', s.price > this.gold()]] : []);
  }

  /** Everything you have (worn first), for Garrow's and Idris's work. */
  everything(filter) {
    const c = this.o.char(), out = [];
    for (const s of SLOTS) if (c.equip[s] && filter(c.equip[s])) out.push({ it: c.equip[s], ref: { where: 'equip', slot: s }, label: SLOT_NAMES[s] });
    c.bag.forEach((it, i) => { if (it && filter(it)) out.push({ it, ref: { where: 'bag', idx: i }, label: 'bag' }); });
    return out;
  }
  item(ref) { const c = this.o.char(); return !ref ? null : ref.where === 'equip' ? c.equip[ref.slot] : ref.where === 'bag' ? c.bag[ref.idx] : null; }

  drawSockets(left, right) {
    const list = this.everything((it) => it.type === 'gear');
    const grid = el('div', 'tgrid');
    for (const { it, ref } of list) {
      const room = (it.sockets?.length || 0) < maxSockets(it);
      grid.append(this.cell(it, ref, room ? socketPrice(it) : null, { dim: !room, buy: true, act: room ? () => this.cut(it) : null }));
    }
    left.append(el('h3', null, 'Worn, then in the bag'), list.length ? grid : el('div', 'dim', 'You’ve nothing to cut.'));
    const it = this.item(this.sel);
    if (!it) { this.card(right, null, [], 'Pick a piece: Garrow says how many sockets it will hold, and what he asks to cut another.'); return; }
    const have = it.sockets?.length || 0, max = maxSockets(it);
    const note = `<div class="tt-sep"></div><div>Sockets: <b>${have}</b> of <b>${max}</b> it will hold${max < 4 ? ` <span class="dim">(${RARITY[it.rarity].name} ${SLOT_NAMES[it.slot] || ''}: rarer pieces hold more)</span>` : ''}</div>`;
    this.card(right, it, have < max ? [[`Cut a socket — ${socketPrice(it)} gold`, () => this.cut(it), 'sel', socketPrice(it) > this.gold()]] : [], note);
  }

  drawForge(left, right) {
    const c = this.o.char(), ids = known(c, 'forge');
    left.append(el('h3', null, 'The plans you know'));
    for (const id of ids) {
      const R = RECIPES[id], ok = check(c, id).ok;
      const row = el('div', 'plan-pick' + (this.sel?.plan === id ? ' sel' : '') + (ok ? ' ok' : ''));
      row.innerHTML = `<img src="${craftIcon({ type: 'recipe', tier: R.tier })}" alt=""><div><b style="color:${PLAN_COLOR[R.tier]}">${esc(R.name)}</b>${ok ? ' <em class="up">ready</em>' : ''}<div class="dim small">${esc(planMakes(R))}</div></div>`;
      row.onclick = () => { this.sel = { plan: id }; this.render(); };
      row.ondblclick = () => this.forgeIt(id);
      left.append(row);
    }
    const unknown = Object.keys(RECIPES).filter((k) => RECIPES[k].at === 'forge' && !knows(c, k)).length;
    left.append(el('div', 'dim small', `${unknown} more plans are out there: in chests, on the Vigil’s dead, and carried by the great.`));
    const id = this.sel?.plan;
    if (!id) { this.card(right, null, [], 'Pick a plan to see what it makes and what it wants.'); return; }
    const R = RECIPES[id], chk = check(c, id);
    // (a fixed roll, the same each time it's drawn: not a constant, or the affixes would be picked forever)
    let q = 0; for (const ch of id) q = (q * 31 + ch.charCodeAt(0)) % 2147483647;
    const preview = (this.previews ||= {})[id + c.level] ||= made(R, Math.max(R.level || 1, c.level || 1), () => { q = (q * 16807 + 11) % 2147483647; return q / 2147483647; });
    right.innerHTML = `<div class="tt-name" style="color:${PLAN_COLOR[R.tier]}">${esc(R.name)}</div><div class="tt-line">${esc(planMakes(R))}</div>`
      + (R.desc ? `<div class="tt-lore">${esc(R.desc)}</div>` : '')
      + '<div class="tt-sep"></div><div class="dim small">What it wants</div>' + needsHtml(id, c)
      + ((c.level || 1) < (R.level || 1) - 3 ? `<div class="warn">Garrow: "Come back when you’ve more years on you." (level ${R.level - 3})</div>` : '')
      + '<div class="tt-sep"></div><div class="dim small">Like this (each one forged comes out its own way)</div><div class="preview">' + tooltip(preview) + '</div>';
    const row = el('div', 'row');
    const b = el('button', 'sel', `Forge it — ${R.gold} gold`);
    b.disabled = !chk.ok;
    b.onclick = () => this.forgeIt(id);
    row.append(b);
    right.append(row);
  }

  drawSalvage(left, right) {
    left.append(el('h3', null, 'Your bag'));
    this.bagGrid(left, { filter: (it) => it.type === 'gear' && !it.unique, act: (i) => this.salvage(i) });
    const row = el('div', 'row');
    const q = (label, fn) => { const b = el('button', 'small', label); b.onclick = fn; row.append(b); };
    q('Break down every Common piece', () => this.salvageAll(0));
    q('…and every Uncommon', () => this.salvageAll(1));
    left.append(row);
    const it = this.sel?.where === 'bag' ? this.o.char().bag[this.sel.idx] : null;
    if (!it || it.type !== 'gear') { this.card(right, null, [], 'Pick a piece: Garrow says what it would give.'); return; }
    const y = salvageYield(it);
    const yields = `<div class="tt-sep"></div><div class="dim small">Breaking it down gives</div><div class="needs">${Object.entries(y.mats).map(([m, n]) => `<span><img src="${craftIcon({ type: 'mat', mat: m })}" alt="">${esc(MATS[m].name)} × ${n}</span>`).join('')}</div>`
      + (y.gems.length ? `<div class="up small">and back: ${y.gems.map((g) => esc(g.name)).join(', ')}</div>` : '');
    this.card(right, it, it.unique ? [] : [['Break it down', () => this.salvage(this.sel.idx), 'sel red']], yields);
  }

  drawGemcraft(left, right) {
    const c = this.o.char();
    left.append(el('h3', null, 'Three made one finer'));
    const grid = el('div', 'tgrid');
    let any = false;
    c.bag.forEach((g, i) => {
      if (g?.type !== 'gem' || GEMS[g.gem]?.only || g.grade >= 5) return;
      any = true;
      grid.append(this.cell(g, { where: 'bag', idx: i, job: 'combine' }, g.count >= 3 ? combinePrice(g.grade) : null, { dim: g.count < 3, buy: true, act: g.count >= 3 ? () => this.combine(i) : null }));
    });
    left.append(any ? grid : el('div', 'dim', 'You carry no gems that could be made finer.'));
    left.append(el('h3', null, 'Gems prised out'));
    const set = this.everything((it) => it.type === 'gear' && (it.sockets || []).some(Boolean));
    const g2 = el('div', 'tgrid');
    for (const { it, ref } of set) g2.append(this.cell(it, { ...ref, job: 'unsocket' }, unsocketPrice(it), { buy: true, act: () => this.unsocket(it) }));
    left.append(set.length ? g2 : el('div', 'dim', 'Nothing you have has a gem set in it.'));
    const formulas = known(c, 'gems');
    if (formulas.length) {
      left.append(el('h3', null, 'Formulas'));
      for (const id of formulas) {
        const R = RECIPES[id], ok = check(c, id).ok;
        const row = el('div', 'plan-pick' + (this.sel?.plan === id ? ' sel' : '') + (ok ? ' ok' : ''));
        row.innerHTML = `<img src="${craftIcon({ type: 'gem', gem: R.makes.gem, grade: 5 })}" alt=""><div><b style="color:${GEMS[R.makes.gem].color}">${esc(R.name)}</b>${ok ? ' <em class="up">ready</em>' : ''}<div class="dim small">${esc(planMakes(R))}</div></div>`;
        row.onclick = () => { this.sel = { plan: id }; this.render(); };
        left.append(row);
      }
    }
    // the card
    if (this.sel?.plan) {
      const id = this.sel.plan, R = RECIPES[id];
      right.innerHTML = tooltip(makeGem(R.makes.gem, 5)) + '<div class="tt-sep"></div><div class="dim small">What it wants</div>' + needsHtml(id, c);
      const row = el('div', 'row'), b = el('button', 'sel', `Make it — ${R.gold} gold`);
      b.disabled = !check(c, id).ok; b.onclick = () => this.forgeIt(id); row.append(b); right.append(row);
      return;
    }
    const it = this.item(this.sel);
    if (!it) { this.card(right, null, [], 'Pick a gem to have three made one finer, or a piece to have its gems prised out.'); return; }
    if (this.sel.job === 'combine') {
      const next = makeGem(it.gem, it.grade + 1);
      this.card(right, it, it.count >= 3 ? [[`Make a ${next.name} — ${combinePrice(it.grade)} gold`, () => this.combine(this.sel.idx), 'sel', combinePrice(it.grade) > this.gold()]] : [],
        `<div class="tt-sep"></div><div>Three ${esc(gemName(it.gem, it.grade))}s make one <b style="color:${GEMS[it.gem].color}">${esc(next.name)}</b>. You have ${it.count}.</div>`);
    } else {
      this.card(right, it, [[`Prise them out — ${unsocketPrice(it)} gold`, () => this.unsocket(it), 'sel', unsocketPrice(it) > this.gold()]], '<div class="tt-sep"></div><div class="dim">The gems come out whole and go into your bag; the sockets stay, empty.</div>');
    }
  }
}

// ------------------------------------------------------------------ over their heads, and on the map
/** The mark over a merchant's head (villagers.js Bubbles): a gold coin with the shop's sign on it. */
export function drawShopMark(g, mark, x, y, s) {
  const r = 11 * s;
  g.save();
  g.shadowColor = 'rgba(255, 200, 60, 0.7)'; g.shadowBlur = 10 * s;
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 1.3, r * 0.2, x, y - r, r * 1.1);
  gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.55, '#e0a830'); gr.addColorStop(1, '#7a4a08');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y - r, r, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0; g.lineWidth = 1.6 * s; g.strokeStyle = '#3a2204'; g.stroke();
  shopSign(g, mark, x, y - r, r * 0.62);
  g.restore();
}
/** The shop's sign inside a coin of radius r at (x, y): an anvil, a gem, or a pair of scales. */
export function shopSign(g, mark, x, y, r) {
  g.fillStyle = '#3a2204'; g.strokeStyle = '#3a2204'; g.lineWidth = Math.max(1, r * 0.16);
  g.beginPath();
  if (mark === '$smith') {   // an anvil
    g.moveTo(x - r, y - r * 0.45); g.lineTo(x + r * 0.95, y - r * 0.45); g.lineTo(x + r * 0.5, y); g.lineTo(x + r * 0.25, y);
    g.lineTo(x + r * 0.45, y + r * 0.6); g.lineTo(x - r * 0.55, y + r * 0.6); g.lineTo(x - r * 0.3, y); g.lineTo(x - r * 0.45, y); g.closePath(); g.fill();
  } else if (mark === '$gems') {   // a cut gem
    g.moveTo(x - r * 0.9, y - r * 0.25); g.lineTo(x - r * 0.45, y - r * 0.75); g.lineTo(x + r * 0.45, y - r * 0.75); g.lineTo(x + r * 0.9, y - r * 0.25); g.lineTo(x, y + r * 0.85); g.closePath(); g.fill();
    g.strokeStyle = '#f0c860'; g.lineWidth = Math.max(0.8, r * 0.1); g.beginPath(); g.moveTo(x - r * 0.9, y - r * 0.25); g.lineTo(x + r * 0.9, y - r * 0.25); g.moveTo(x - r * 0.2, y - r * 0.75); g.lineTo(x, y + r * 0.85); g.stroke();
  } else {   // scales
    g.moveTo(x, y - r * 0.85); g.lineTo(x, y + r * 0.7); g.moveTo(x - r * 0.45, y + r * 0.7); g.lineTo(x + r * 0.45, y + r * 0.7); g.moveTo(x - r * 0.85, y - r * 0.5); g.lineTo(x + r * 0.85, y - r * 0.5); g.stroke();
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(x + sx * r * 0.62, y - r * 0.05, r * 0.32, 0, Math.PI); g.fill(); }
  }
}
