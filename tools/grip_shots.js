// Close-ups of the first-person hands holding things, on every arm model (bare hands and every
// gauntlet), for review: weapons, shields and casts, frozen on telling frames and seen from the
// player's own eye, magnified about the hand (the view-model projection zoomed, so it is
// exactly what the player sees, larger), on a plain grey backdrop. In moves.html:
//   await (await import('/tools/grip_shots.js')).grips('r1')
// writes art/view/shots/grips_<tag>_<group>_<n>.png (rows: arm models; columns: poses).
import * as THREE from 'three';

// [label, equip {R, L}, [[side, clip, time]], what to centre on: 'R' | 'L' | 'RL', zoom]
// a time is a number, or the name of a key in the clip, or 'hit' / 'hold' / 'fire'
const GROUPS = {
  weapons: [
    ['sword carry', { R: 'onehand', L: null }, [['R', 'sword_walk', 0]], 'R', 3.2],
    ['sword hit', { R: 'onehand', L: null }, [['R', 'sword_diag', 'hit']], 'R', 3.2],
    ['great carry', { R: 'twohand', L: null }, [['R', 'great_walk', 0], ['L', 'great_walk', 0]], 'RL', 2.6],
    ['great hit', { R: 'twohand', L: null }, [['R', 'great_cleave', 'hit'], ['L', 'great_cleave', 'hit']], 'RL', 2.6],
    ['staff carry', { R: 'staff', L: null }, [['R', 'staff_walk', 0]], 'R', 3.2],
    ['round block', { R: null, L: 'shield_round' }, [['L', 'round_block', 'hold']], 'L', 2.4],
    ['kite block', { R: null, L: 'shield_kite' }, [['L', 'kite_block', 'hold']], 'L', 2.4],
  ],
  casts: [
    ['charge (fist)', { R: null, L: null }, [['L', 'hand_mocap', 'hold']], 'L', 3.2],
    ['one-hand hold', { R: null, L: null }, [['L', 'hand_mocap', 'HOLD']], 'L', 3.2],
    ['two-hand hold', { R: null, L: null }, [['R', 'both_mocap', 'HOLD'], ['L', 'both_mocap', 'HOLD']], 'RL', 2.2],
    ['push (old cast)', { R: null, L: null }, [['L', 'hand_push', 'fire']], 'L', 3.2],
  ],
};
const W = 320, H = 200, PER_SHEET = 6;

function when(vm, clip, t) {
  if (typeof t === 'number') return t;
  const c = vm.clipInfo(clip), ev = c.events;
  if (t === 'hit' || t === 'fire') return ev[t][0];
  if (t === 'hold') return ev.hold;
  return c.starts[c.names.indexOf(t)];
}

// from a moves_review spec: {tool: '/tools/grip_shots.js', tag, groups?, arms?, grip?: {open, seat}}
export async function run(spec) {
  const vm = window.vm, keep = vm.grip;
  if (spec.grip) vm.grip = { seat: spec.grip.seat ?? keep.seat, item: spec.grip.item ?? keep.item, open: spec.grip.open ?? keep.open };
  try { return await grips(spec.tag, spec); } finally { vm.grip = keep; }
}

export async function grips(tag = 'r1', { groups = Object.keys(GROUPS), arms = null, poses: only = null } = {}) {
  const vm = window.vm;
  const ids = arms || vm.manifest.arms.map((a) => a.id);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.setClearColor(0x5c5f63, 1);
  const cam = new THREE.Camera(), v = new THREE.Vector3(), w = new THREE.Vector3();
  const before = { gauntlet: vm.gauntlet, R: vm.equip.R, L: vm.equip.L, aspect: vm.aspect };
  vm.resize(W / H);
  const out = [];
  try {
    for (const group of groups) {
      const poses = GROUPS[group].filter(([label]) => !only || only.includes(label));
      for (let s0 = 0; s0 < ids.length; s0 += PER_SHEET) {
        const rows = ids.slice(s0, s0 + PER_SHEET);
        const sheet = document.createElement('canvas');
        sheet.width = 110 + poses.length * W; sheet.height = 24 + rows.length * H;
        const g = sheet.getContext('2d');
        g.fillStyle = '#111'; g.fillRect(0, 0, sheet.width, sheet.height);
        g.font = '14px sans-serif'; g.fillStyle = '#e8d8a8';
        poses.forEach(([label], c) => g.fillText(label, 110 + c * W + 6, 17));
        for (const [r, id] of rows.entries()) {
          await vm.load(id);
          g.fillStyle = '#e8d8a8'; g.fillText(id, 6, 24 + r * H + H / 2);
          for (const [c, [, equip, plays, focus, zoom]] of poses.entries()) {
            vm.equip.R = equip.R; vm.equip.L = equip.L; await vm.applyEquip();
            vm.state = { R: null, L: null };
            for (const side of ['R', 'L']) vm.playWalk?.(side, true);
            for (const [side, clip, t] of plays) {
              const at = when(vm, clip, t);
              vm.play(side, clip, { from: at, fade: 0, quiet: true, hideItem: !vm.equip[side] });
              vm.state[side].hold = at;
            }
            for (let i = 0; i < 4; i++) vm.update(1 / 60, 0);
            // centre: the grip (weapon, shield) or the hand; both hands: halfway between
            const ctr = (side) => (vm.equip[side] ? vm.arms[side].socket : vm.arms[side].hand).getWorldPosition(new THREE.Vector3());
            const p = focus === 'RL' ? ctr('R').add(ctr('L')).multiplyScalar(0.5) : ctr(focus);
            v.copy(p).applyMatrix4(vm.camera.matrixWorldInverse).applyMatrix4(vm.camera.projectionMatrix);
            const zm = new THREE.Matrix4().set(zoom, 0, 0, -zoom * v.x, 0, zoom, 0, -zoom * v.y, 0, 0, 1, 0, 0, 0, 0, 1);
            cam.projectionMatrix.multiplyMatrices(zm, vm.camera.projectionMatrix);
            cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
            cam.matrixWorld.copy(vm.camera.matrixWorld); cam.matrixWorldInverse.copy(vm.camera.matrixWorldInverse);
            renderer.render(vm.scene, cam);
            g.drawImage(renderer.domElement, 110 + c * W, 24 + r * H);
            w.set(0, 0, 0);
          }
        }
        const blob = await new Promise((res) => sheet.toBlob(res, 'image/png'));
        const name = `grips_${tag}_${group}_${s0 / PER_SHEET + 1}`;
        await fetch('/shot?name=' + name, { method: 'POST', body: blob });
        out.push(name);
      }
    }
  } finally {
    renderer.dispose();
    vm.resize(before.aspect || 1.6);
    await vm.load(before.gauntlet);
    vm.equip.R = before.R; vm.equip.L = before.L; await vm.applyEquip();
    vm.state = { R: null, L: null };
  }
  return out;
}
