// The one-handed sword-and-shield set, exercised on the game's own view model (headless, from
// moves.html): python tools/moves_review.py art/view/onehand_check.json
// Checks the combos on keys 1-6 (and the blunt ones), the shield stepping aside for each blow,
// the crosshair clips' slide easing out, the thrust (or a mace's bonk) over the raised shield, and
// where the shove's wave leaves the board, and the staff's lift to shoot. Returns a report; any "FAIL" line is a fault.
export async function run() {
  const vm = window.vm, out = [];
  const ok = (c, msg) => out.push(`${c ? 'ok  ' : 'FAIL'} ${msg}`);
  const step = (t, dt = 1 / 60) => { for (let s = 0; s < t; s += dt) vm.update(dt, 0); };
  vm.equip.R = 'onehand'; vm.equip.L = 'shield_kite'; vm.blocking = false;
  await vm.applyEquip();
  await vm.setModel('onehand', 'arming_sword');
  step(0.5);
  const COMBO = { 1: ['d1', 'd2', 'over'], 2: ['rise1', 'rise2', 'stab'], 3: ['flat1', 'flat2', 'over'],
                  4: ['stab', 'd1', 'd2'], 5: ['over', 'rise1', 'flat1'], 6: ['d2', 'flat2', 'stab', 'over'] };
  for (const [n, chain] of Object.entries(COMBO)) {
    const want = chain.map((c) => `blade_${c}`);
    ok(JSON.stringify(vm.pick(`onehand${n}`)?.chain) === JSON.stringify(want), `key ${n} slot is ${want.join(' > ')}`);
    const blunt = chain.map((c) => `blade_${c === 'stab' ? 'over' : c}`);
    ok(JSON.stringify(vm.pick(`blunt${n}`)?.chain) === JSON.stringify(blunt), `key ${n} blunt slot has no thrust`);
    // play the combo as presses: each blow, then a press while it swings queues the next
    const seen = [];
    vm.attack('R', `onehand${n}`);
    for (let b = 0; b < chain.length; b++) {
      const st = vm.state.R;
      seen.push(st?.name);
      if (b === 0) ok(/^kite_aside_/.test(vm.state.L?.name || ''), `key ${n}: the kite steps aside (${vm.state.L?.name})`);
      step(0.12);
      if (b === 0) ok((vm.slideK?.R ?? 1) < 0.25, `key ${n}: no sideways slide while it swings (k ${(vm.slideK?.R ?? 1).toFixed(2)})`);
      if (b < chain.length - 1) {
        vm.attack('R', `onehand${n}`);   // (queued, or loosed if it cocked)
        for (let i = 0; i < 120 && vm.state.R?.name === st?.name; i++) step(1 / 60);
      }
    }
    ok(JSON.stringify(seen) === JSON.stringify(want), `key ${n} plays ${seen.join(' > ')}`);
    step(2.5);
  }
  ok(vm.pick('onehand')?.chain?.[0] === 'blade_d1', `left click plays combo 1 (${vm.pick('onehand')?.chain})`);
  // shield up: a thrust over the rim with a blade, a bonk with a mace
  vm.actLeft(true); step(0.4);
  ok(vm.blocking && /kite_block/.test(vm.state.L?.name || ''), `right click raises the kite (${vm.state.L?.name})`);
  vm.stab(); ok(vm.state.R?.name === 'blade_stab', `with the shield up a blade thrusts (${vm.state.R?.name})`);
  step(1.2);
  const f = vm.shieldFront(), size = vm.shieldSize();
  ok(f && size?.c && Math.abs(size.c.x) > 0.08, `the shove leaves from the board's middle (${size?.c ? size.c.x.toFixed(3) : '?'} from the grip)`);
  vm.actLeft(false); step(1.5);
  await vm.setModel('onehand', 'flanged_mace'); step(0.3);
  ok(vm.blunt(), 'a flanged mace counts as blunt');
  vm.actLeft(true); step(0.4); vm.stab();
  ok(vm.state.R?.name === 'blade_over', `with the shield up a mace bonks (${vm.state.R?.name})`);
  vm.actLeft(false); step(1.5);
  await vm.setModel('onehand', 'arming_sword');
  // the staff: no blow, just a lift; the bolt leaves its head at the top of it
  vm.equip.R = 'staff'; vm.equip.L = null; await vm.applyEquip(); step(0.5);
  const did = vm.attackRight();
  ok(did && vm.state.R?.name === 'staff_lift', `a staff lifts to shoot (${vm.state.R?.name})`);
  const ev = vm.manifest.events.staff_lift || {}, names = vm.clipInfo('staff_lift')?.names || [];
  ok(ev.fire?.length === 1 && !ev.hit, `the lift has one fire mark and no hit (fire ${ev.fire})`);
  ok(!names.some((n) => /HIT|FOLLOW|WIND/.test(n)), `the lift has no swing in it (${names.join(', ')})`);
  const y0 = vm.castPoint('R').y; step(ev.fire?.[0] ?? 0.2); const y1 = vm.castPoint('R').y;
  ok(y1 > y0 + 0.02, `the staff's head rises before the bolt leaves (${(y1 - y0).toFixed(3)} up)`);
  step(1.0);
  vm.equip.R = 'onehand'; vm.equip.L = 'shield_kite'; await vm.applyEquip();
  return out.join('\n');
}
