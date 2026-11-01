// The first-person hands, for review: a few poses rendered as the game draws them, to
// art/view/shots/hands_<tag>_<pose>.png (640 x 400), and the same against a plain grey backdrop
// (hands_<tag>_<pose>_bd.png: high above the world, looking up, the world hidden; lit as at noon). In the page, once a game
// is under way:
//   await (await import('/tools/hands_shots.js')).hands('r1')
// (tools/models/hands/build_hands.py builds the arms.)
// Poses: idle (bare hands at rest), palm (an open hand pushed out: a spell), fist (the thrust),
// sword (a one-handed grip), great (both hands on a great sword).
// tools/models/hands/review_sheet.py makes the sheets the critics see.
import * as THREE from 'three';
import { shot } from './view_shot.js';

export async function hands(tag = 'r1', only = null) {
  const bm = window.bellmourn, vm = bm.vm, p = bm.player;
  const at = [p.pos.x, p.pos.y, p.pos.z, p.yaw, 0.1];
  const set = async (R, L) => { vm.equip.R = R; vm.equip.L = L; await vm.applyEquip(); };
  await vm.load('bare');             // (bare hands: no gauntlets; the character's put back after)
  const pose = (side, name, t) => () => { vm.play(side, name, { from: t, freeze: true, quiet: true, fade: 0 }); };
  const POSES = [
    ['idle', null, null, []],
    ['palm', null, null, [pose('R', 'hand_push', 0.32), pose('L', 'hand_push', 0.32)]],
    ['fist', null, null, [pose('R', 'hand_thrust', 0.22)]],
    ['sword', 'onehand', null, []],
    ['great', 'twohand', null, []],
  ];
  const out = [];
  for (const backdrop of [false, true]) {
    const hidden = [], bg = bm.scene.background;
    if (backdrop) {
      for (const c of bm.scene.children) if (c.visible && !c.isLight) { c.visible = false; hidden.push(c); }
      bm.scene.background = new THREE.Color(0x5c5f63);
    }
    try {
      for (const [name, R, L, moves] of POSES) {
        if (only && !only.includes(name)) continue;
        await set(R, L);
        vm.state = { R: null, L: null };
        for (const side of ['R', 'L']) vm.playWalk?.(side, true);
        out.push(await shot(`hands_${tag}_${name}${backdrop ? '_bd' : ''}`, backdrop ? [at[0], at[1] + 150, at[2], at[3], 1.1] : at, { hands: true, hour: 12, ticks: 24, each: (b, i) => { b.setHour?.(12); if (i === 18) for (const m of moves) m(); } }));
      }
    } finally {
      for (const c of hidden) c.visible = true;
      bm.scene.background = bg;
    }
  }
  await set(null, null);
  vm.gauntlet = null; await bm.applyGear?.();
  return out;
}
