// The wayside camps: travellers' fires here and there off the roads, two or three folk at each, who'll
// talk with you and ask you to join them in something to pass the time:
//   - knucklebones: a stake of coin, two dice each, the higher wins (doubles beat any pair; a tie is
//     thrown again);
//   - the dash: touch the cairn they point you to and get back to the fire before their candle-mark
//     burns down; beat it and they pay, and the mark gets harder next time.
// Each camp: a fire, a tent or two, logs to sit on, packs; its folk are villagers.js keepers posted at
// it (ctx[key]). main.js asks pastimes.offer(who) for the prompt and pastimes.talk(who) on E.
import * as THREE from 'three';
import { groundAt } from './details.js';

// [key, name, the camp, its folk [[keeper key, name, game]], where (x, z or a function of the world)]
export const CAMPS = [
  { id: 'tinkers', name: "The Tinkers' Fire", x: 128, z: 112, folk: [['campPell', 'Pell', 'dice'], ['campWynn', 'Wynn', null]], goal: null },
  { id: 'pilgrims', name: "The Pilgrims' Rest", x: 476, z: 128, folk: [['campCade', 'Cade', 'dash'], ['campAgna', 'Agna', null]], goal: [520, 175] },
  { id: 'hunters', name: "The Hunters' Camp", x: -150, z: 152, folk: [['campRook', 'Rook', 'dice'], ['campSef', 'Sef', 'dash']], goal: [-120, 200] },
  { id: 'drovers', name: "The Drovers' Camp", x: 0, z: 0, mountain: 0.035, folk: [['campHob', 'Hob', 'dash'], ['campMerra', 'Merra', 'dice']], goal: null },
];
// what each says when you come up (the offer), how they take a win and a loss
const LINES = {
  Pell: { dice: ['Knucklebones? Ten crowns says I take you.', 'Again? My luck is due.'], win: ['Pah. Take it before I change my mind.'], lose: ['Mine. The bones like me tonight.'] },
  Rook: { dice: ['Sit. Throw the bones with me. Ten crowns.', 'Once more. I was not ready.'], win: ['Fair throw. Fair coin.'], lose: ['The bones know a hunter.'] },
  Merra: { dice: ['Ten crowns, two bones. Brave enough?', 'Again. The wind took that one.'], win: ['Robbed by a stranger. Again.'], lose: ['Drovers always win. Ask anyone.'] },
  Cade: { dash: ['See the old pillars on the rise? Touch one and get back before my candle burns to the mark.', 'Again? I will cut the mark lower.'], win: ['Faster than a novice at supper. Here.'], lose: ['Slow. The saints were faster, and they were dead.'] },
  Sef: { dash: ['The broken pillars past the hollow. There and back before the mark. Go!', 'Again, then. Shorter mark.'], win: ['Huh. You run like a deer.'], lose: ['Too slow. The wolves would have you.'] },
  Hob: { dash: ['See that cairn up the road? There and back before the mark burns down.', 'Again. Lower mark.'], win: ['Ha! Here, you earned it.'], lose: ['My old ewe runs faster.'] },
  Wynn: { talk: ['Pell cheats at bones. Everyone knows. Nobody can tell how.'] },
  Agna: { talk: ['Cade was a novice once. He still runs to supper like one.'] },
};
const STAKE = 10, PURSE = 25;

/** The camps laid out (before the forest's planted: they stay clear), their fires and tents built, their
 * folk's posts set (ctx[key]). */
export function layCamps(ctx, M) {
  const { b } = ctx, S = ctx.mountain, D = ctx.details;
  const wood = M('ship_01_tarblack_oak', 1, { tint: 0x8a7058 }), cloth = M('cloth_04_aged_cream_linen', 0.6, { tint: 0x9a8a70 });
  const out = [];
  for (const C of CAMPS) {
    if (C.mountain != null) {      // (the drovers: just off the Pilgrims' Road where it starts to climb, on its outer side)
      if (!S) continue;
      const i = Math.floor(S.road.length * C.mountain), [x, z] = S.road[i], dx = x + 1000, dz = z + 1000, L = Math.hypot(dx, dz);
      C.x = x + dx / L * 13; C.z = z + dz / L * 13;
      const j = Math.floor(S.road.length * (C.mountain + 0.04)), [gx, gz] = S.road[j], ex = gx + 1000, ez = gz + 1000, E = Math.hypot(ex, ez); C.goal = [gx + ex / E * 6.5, gz + ez / E * 6.5];   // (beside the road, not on it)
    }
    const y = groundAt(ctx, C.x, C.z);
    D.zones.push([C.x, C.z, 9]);
    ctx.scatter?.place('campfire', C.x, y, C.z, 1);
    ctx.flames.push([C.x, y + 0.35, C.z, 0.4, 1]);
    (ctx.campFires ||= []).push([C.x, y, C.z]);
    ctx.chimneys?.push([C.x, y + 1.2, C.z]);
    // a lean-to tent, a log on each side of the fire, packs and a pot
    const a0 = Math.atan2(-C.x, -C.z);
    { const tx = C.x + Math.sin(a0 + Math.PI) * 4.5, tz = C.z + Math.cos(a0 + Math.PI) * 4.5;
      b.place(tx, groundAt(ctx, tx, tz), tz, a0, 1, (o) => { o.beam([-1.6, 0, 1.1], [-1.6, 1.9, 0], 0.08, 0.08, wood); o.beam([1.6, 0, 1.1], [1.6, 1.9, 0], 0.08, 0.08, wood); o.box([-1.7, 1.85, -0.05], [1.7, 1.95, 0.05], wood);
        o.beam([-1.6, 1.9, 0], [-1.6, 0, -1.4], 0.04, 0.04, wood); o.box([-1.6, 0, -1.4], [1.6, 0.04, 1.1], M('cloth_04_aged_cream_linen', 0.6, { tint: 0x5a4a38 }));
        for (let k = 0; k < 6; k++) o.beam([-1.6 + k * 0.64, 1.9, 0], [-1.6 + k * 0.64, 0.05, -1.4], 0.32, 0.02, cloth); }, { solid: true }); }
    for (const s of [-1, 1]) { const lx = C.x + Math.cos(a0) * 2.2 * s, lz = C.z - Math.sin(a0) * 2.2 * s; b.place(lx, groundAt(ctx, lx, lz), lz, a0 + Math.PI / 2, 1, (o) => o.cylinder([-1.1, 0.22, 0], [1.1, 0.22, 0], 0.22, 8, wood), { solid: false }); }
    ctx.scatter?.place('sacks', C.x + Math.sin(a0 + 2.2) * 3.4, y, C.z + Math.cos(a0 + 2.2) * 3.4, 1);
    ctx.scatter?.place('crate_stack', C.x + Math.sin(a0 + 2.7) * 4.2, y, C.z + Math.cos(a0 + 2.7) * 4.2, 0.9);
    // a lantern on a post where you come in (toward the road), seen from it
    { const lx = C.x + Math.sin(a0) * 6.5, lz = C.z + Math.cos(a0) * 6.5, ly = groundAt(ctx, lx, lz);
      b.place(lx, ly, lz, a0, 1, (o) => { o.box([-0.07, 0, -0.07], [0.07, 2.6, 0.07], wood); o.box([-0.05, 2.5, -0.05], [0.05, 2.58, 0.7], wood); }, { solid: true });
      ctx.scatter?.place('lantern', lx, ly + 2.05, lz + 0.0, 1); ctx.flames.push([lx, ly + 2.25, lz, 0.14, 1]); }
    // where they throw the bones: a board on a stump, two dice on it
    if (C.folk.some((f) => f[2] === 'dice')) { const bx = C.x + Math.sin(a0 - 0.9) * 2.2, bz = C.z + Math.cos(a0 - 0.9) * 2.2, by = groundAt(ctx, bx, bz);
      b.place(bx, by, bz, a0, 1, (o) => { o.cylinder([0, 0, 0], [0, 0.5, 0], 0.32, 8, wood); o.box([-0.45, 0.5, -0.32], [0.45, 0.56, 0.32], wood); for (const d of [-0.12, 0.1]) o.box([d - 0.035, 0.56, -0.035], [d + 0.035, 0.63, 0.035], M('castle_keep_ivory_chapel_marble', 0.3)); }, { solid: false });
      ctx.scatter?.place('candle', bx + 0.3, by + 0.56, bz, 1); ctx.flames.push([bx + 0.3, by + 0.75, bz, 0.07, 1]); }
    ctx.scatter?.place('water_barrel', C.x + Math.sin(a0 - 2.3) * 3.6, y, C.z + Math.cos(a0 - 2.3) * 3.6, 0.9);
    // the folk: one either side of the fire, facing it
    C.folk.forEach(([key, name], k) => {
      const a = a0 + (k ? -1 : 1) * 1.1, px = C.x + Math.sin(a) * 2.9, pz = C.z + Math.cos(a) * 2.9;
      ctx[key] = { post: [px, pz, Math.atan2(C.x - px, C.z - pz)], floor: groundAt(ctx, px, pz) };
    });
    // the dash's goal: a cairn with a red rag, where they point you
    if (C.goal) { const [gx, gz] = C.goal, gy = groundAt(ctx, gx, gz);
      b.place(gx, gy, gz, 0, 1, (o) => { const st = M('stone_06_mossy_fieldstone_1_03', 1.6, { tri: true }); for (let k = 0; k < 5; k++) o.blob([Math.sin(k * 2.1) * 0.08, 0.18 + k * 0.22, 0], [0.42 - k * 0.07, 0.16, 0.38 - k * 0.06], st, { detail: 0, jitter: 0.25, seed: 2100 + k + out.length * 7 });
        o.box([-0.03, 1.0, -0.03], [0.03, 2.2, 0.03], wood); o.box([0.03, 1.8, -0.01], [0.6, 2.15, 0.01], M('cloth_04_aged_cream_linen', 0.5, { tint: 0xb02020 })); }, { solid: true }); C.goalY = gy; }
    out.push(C);
  }
  return out;
}

/** The games, each frame (main.js): the dash's clock, and what's on the screen for it. */
export class Pastimes {
  constructor(ctx, { char, sfx, hud, villagers }) {
    Object.assign(this, { ctx, char, sfx, hud, villagers });
    this.byName = {};
    for (const C of CAMPS) for (const [key, name, game] of C.folk) this.byName[name] = { C, game, key, wins: 0, asked: 0 };
    this.run = null;      // the dash under way: {who, C, t, limit, touched}
  }

  /** What E would do with `who` (a prompt for main), or null if they've no game for you. */
  offer(who) {
    const g = this.byName[who?.name];
    if (!g || !g.game) return null;
    if (this.run) return this.run.who === who ? `E — ${who.call || who.name}: the dash is on` : null;
    return g.game === 'dice' ? `E — throw knucklebones with ${who.call || who.name} (${STAKE} crowns)` : `E — race ${who.call || who.name}'s candle`;
  }

  /** E on `who`: the first time they ask; the second (while they're waiting) you play. True if handled. */
  talk(who, player) {
    const g = this.byName[who?.name], V = this.villagers;
    if (!g) return false;
    const L = LINES[who.name] || {};
    if (!g.game) { V.say(who, (L.talk || ['Warm yourself.'])[0], true, { now: true, must: true }); V.face?.(who, player); return true; }
    V.face?.(who, player);
    const now = performance.now() / 1000;
    if (now - g.asked > 10) {         // they ask first
      g.asked = now;
      V.say(who, L[g.game][g.wins || this.lost?.[who.name] ? 1 : 0], true, { now: true, must: true });
      this.hud.toast(g.game === 'dice' ? `E again to throw (${STAKE} crowns)` : 'E again to start the dash');
      return true;
    }
    g.asked = 0;
    return g.game === 'dice' ? this.dice(who, g, L) : this.dash(who, g, L, player);
  }

  dice(who, g, L) {
    if (this.char.gold < STAKE) { this.villagers.say(who, 'Come back with coin.', true, { now: true }); return true; }
    const roll = () => [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    const score = ([a, b]) => (a === b ? 100 + a : a + b);
    let you, them;
    do { you = roll(); them = roll(); } while (score(you) === score(them));
    const won = score(you) > score(them);
    this.char.gold += won ? STAKE : -STAKE;
    this.sfx.coin?.();
    this.hud.toast(`You throw ${you.join(' and ')}; ${who.call || who.name} throws ${them.join(' and ')}. ${won ? `You win ${STAKE} crowns.` : `You lose ${STAKE} crowns.`}`);
    this.villagers.say(who, (won ? L.win : L.lose)[0], true, { now: true, must: true });
    if (won) g.wins++; else (this.lost ||= {})[who.name] = true;
    return true;
  }

  dash(who, g, L, player) {
    const C = g.C;
    if (!C.goal) return false;
    const [gx, gz] = C.goal, d = Math.hypot(gx - C.x, gz - C.z) * 2;
    const limit = Math.max(8, d / 6.2 + 6 - g.wins * 2);      // (a brisk run there and back, a little slack; less each win)
    this.run = { who, g, C, t: 0, limit, touched: false, L, start: player.pos.clone() };
    this.hud.toast(`Go! Touch the cairn and get back to the fire: ${Math.round(limit)} heartbeats.`);
    this.sfx.bell?.();
    return true;
  }

  update(dt, player) {
    const R = this.run;
    if (!R) return;
    R.t += dt;
    const [gx, gz] = R.C.goal;
    if (!R.touched && Math.hypot(player.pos.x - gx, player.pos.z - gz) < 2.4) { R.touched = true; this.hud.toast('Touched! Back to the fire!'); this.sfx.coin?.(); }
    const home = Math.hypot(player.pos.x - R.C.x, player.pos.z - R.C.z) < 4;
    const left = R.limit - R.t;
    if (Math.floor(left) !== Math.floor(left + dt) && left > 0 && left < 6) this.hud.toast(`${Math.ceil(left)}…`);
    if (R.touched && home) {
      this.char.gold += PURSE; this.sfx.coin?.();
      this.hud.toast(`Back in ${R.t.toFixed(1)} heartbeats. ${R.who.call || R.who.name} pays you ${PURSE} crowns.`);
      this.villagers.say(R.who, R.L.win[0], true, { now: true, must: true });
      R.g.wins++; this.run = null;
    } else if (left <= 0) {
      this.hud.toast('The candle burned down to the mark.');
      this.villagers.say(R.who, R.L.lose[0], true, { now: true, must: true });
      (this.lost ||= {})[R.who.name] = true; this.run = null;
    }
  }
}
void THREE;
