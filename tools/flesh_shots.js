// Flesh, gore and the characters, for comparing the two renderers (WebGL and WebGPU): pictures to
// art/view/shots/<prefix>_<name>.png (the harness's POST /shot), and the pipelines (programs) made
// along the way. The game's own loop is held meanwhile and every frame stepped by hand (with a new
// node frame each, as three's own loop gives WebGPU), so it works headless. In the page, once a game
// is under way:
//   await (await import('/tools/flesh_shots.js')).gore('wgpu')    one of the dead in front of you, struck, burnt, frozen, cut apart
//   await (await import('/tools/flesh_shots.js')).arms('wgpu')    the hands: bare and gauntleted, a sword and a staff
//   await (await import('/tools/flesh_shots.js')).people('wgpu')  villagers close up, by day and in the evening
// Math.random is seeded before each blow, so both renderers see the same wounds and blood.
import * as THREE from 'three';
import { programCount } from '../src/fps/engine.js';

const bm = () => window.bellmourn;
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Held: the game's loop (and three's) stopped, the canvas w x h, the HUD away; returns undo. */
function holdLoop(w, h) {
  const b = bm();
  b.begin?.();
  const raf = window.requestAnimationFrame, held = [];
  window.requestAnimationFrame = (f) => { held.push(f); return 0; };
  b.renderer.setSize(w, h, false); b.composer.setSize(w, h);
  b.camera.aspect = w / h; b.camera.updateProjectionMatrix(); b.vm.resize?.(w / h);
  b.hud.hud.classList.add('hidden');
  // (point sprites sized by the canvas: as view_shot.js keeps them)
  const sized = [];
  b.scene.traverse((q) => {
    const u = q.material?.uniforms?.scale;
    if (!u || !(q.isPoints || q.material.isPointsNodeMaterial)) return;
    sized.push([u, Object.getOwnPropertyDescriptor(u, 'value')]);
    Object.defineProperty(u, 'value', { configurable: true, get: () => (h / 2) * b.camera.projectionMatrix.elements[5], set: () => {} });
  });
  return () => {
    for (const [u, d] of sized) { if (d) Object.defineProperty(u, 'value', d); else delete u.value; }
    b.hud.hud.classList.remove('hidden'); b.vm.scene.visible = true;
    window.requestAnimationFrame = raf;
    for (const f of held) raf(f);
  };
}
/** One frame, stepped by hand (a new node frame first: WebGPU's passes draw once a frame). */
function frame(dt = 1 / 60) {
  const b = bm(), nf = b.renderer._nodes?.nodeFrame;
  if (nf) { nf.update(); b.renderer.info.frame = nf.frameId; }
  b.tick(dt);
}
async function snap(name) {
  const b = bm(), r = b.renderer;
  if (r.backend?.device) await r.backend.device.queue.onSubmittedWorkDone();
  const cv = document.getElementById('game'), bin = atob(cv.toDataURL('image/png').split(',')[1]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await fetch('/shot?name=' + name, { method: 'POST', body: u8 });
  return name;
}

/** One of the dead (`variant`) stood 1.9 m before you on the meadow by day, still (no brain), then
 * struck where you look: a slash, a blunt blow, fire, frost and lightning; then cut apart (an arm, the
 * head, the waist). A picture after each; the pipelines before and after; then a second one cut apart
 * at once (nothing new should be made for it). */
export async function gore(prefix = 'g', { hour = 12, variant = 'rotting_zombie', at = [360, -10] } = {}) {
  const b = bm(), Z = b.zombies, p = b.player, cam = b.camera;
  const undo = holdLoop(960, 600);
  b.setHour(hour);
  const rnd = Math.random;
  const out = { shots: [], pipes: {}, drops: {} };
  const pipes = (k) => { out.pipes[k] = programCount(b.renderer); out.drops[k] = Z.gore.n; };
  pipes('start');
  try {
    const [x, zz] = at, y = b.physics.groundAt(x, zz);
    const hold = (n, pitch = -0.12) => { for (let i = 0; i < n; i++) { p.pos.set(x, y, zz); p.vel.set(0, 0, 0); p.yaw = 0; p.pitch = pitch; p.health = p.maxHealth || 100; b.vm.scene.visible = false; frame(); } };
    hold(10);
    Math.random = seeded(1234);
    const z = Z.spawn(variant, x, zz - 1.9, { zone: 'wild' });
    out.variant = z.variant;
    z.hp = 1e6;
    for (const k of Object.keys(z.limbHp)) z.limbHp[k] = 1e6;     // (nothing comes off till asked)
    z.yaw = 0;                                                     // (facing you)
    z.update = function () { this.sync(); };                       // (stood still: no brain, no steps)
    z.play('idle', 0); z.mixer.update(0.5);
    hold(30);
    out.shots.push(await snap(`${prefix}_gore_a_whole`));
    pipes('whole');
    // the blows, each where the eye's ray through a point of the body meets it
    const strike = (q, bone, kind, { heavy = true, dy = 0, dx = 0, seed = 1 } = {}) => {
      Math.random = seeded(seed);
      const bb = q.bones[bone];
      const pt = bb.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(dx, dy, 0));
      const o = cam.getWorldPosition(new THREE.Vector3()), d = pt.clone().sub(o).normalize();
      const h = q.ray(o, d, 6) || { t: 1, bone: bb, point: pt, z: q };
      q.hit(h, { dmg: 20, dir: d, heavy, kind, edge: kind === 'blade' ? new THREE.Vector3(1, 0.4, 0).normalize() : null, push: 0, blow: 0 });
    };
    strike(z, 'chest', 'blade', { seed: 11 });
    strike(z, 'upper_armL', 'blunt', { seed: 12 });
    strike(z, 'spine', 'fire', { dx: 0.06, seed: 13 });
    strike(z, 'thighR', 'frost', { seed: 14 });
    strike(z, 'head', 'lightning', { heavy: false, seed: 15 });
    Math.random = seeded(16);
    hold(3);
    out.shots.push(await snap(`${prefix}_gore_b_struck`));
    hold(90);
    out.shots.push(await snap(`${prefix}_gore_c_wounds`));
    pipes('wounds');
    // closer, a little from the side
    for (let i = 0; i < 6; i++) { p.pos.set(x + 0.5, y, zz - 0.8); p.vel.set(0, 0, 0); p.yaw = 0.35; p.pitch = -0.25; b.vm.scene.visible = false; frame(); }
    out.shots.push(await snap(`${prefix}_gore_c2_close`));
    hold(2);
    // cut apart: an arm, the head, then in two at the waist
    Math.random = seeded(21);
    z.sever('upper_armR', new THREE.Vector3(1, 0.3, 0.2).normalize());
    Math.random = seeded(22);
    z.sever('head', new THREE.Vector3(-0.3, 1, 0.2).normalize());
    Math.random = seeded(23);
    hold(4);
    out.shots.push(await snap(`${prefix}_gore_d_cut`));
    Math.random = seeded(24);
    z.sever('waist', new THREE.Vector3(0, 0, 1));
    Math.random = seeded(25);
    hold(120);
    out.shots.push(await snap(`${prefix}_gore_e_apart`));
    pipes('apart');
    // the pieces on the ground, from above
    hold(20, -0.75);
    out.shots.push(await snap(`${prefix}_gore_f_ground`));
    // a second one, cut apart at once (all its shaders made by now: nothing new)
    Math.random = seeded(31);
    const z2 = Z.spawn(variant, x + 0.8, zz - 2.4, { zone: 'wild' });
    z2.hp = 1e6; z2.update = function () { this.sync(); };
    hold(5);
    pipes('second');
    strike(z2, 'chest', 'blade', { seed: 32 }); strike(z2, 'spine', 'fire', { seed: 33 }); strike(z2, 'thighL', 'frost', { seed: 34 });
    z2.sever('forearmL', new THREE.Vector3(-1, 0.2, 0)); z2.sever('waist', new THREE.Vector3(0, 0, 1));
    hold(60);
    pipes('second_apart');
    for (const q of [z, z2]) { q.gone = true; q.root.removeFromParent(); Z.list.splice(Z.list.indexOf(q), 1); }
    for (const o of Z.pieces.splice(0)) o.m.removeFromParent();
    hold(5);
  } finally {
    Math.random = rnd;
    undo();
  }
  return out;
}

/** The hands: bare (the flesh) and in their gauntlets, carrying a sword and a staff, in the world at
 * noon and against a plain grey (lit the same, the world hidden). */
export async function arms(prefix = 'a') {
  const b = bm(), vm = b.vm, p = b.player;
  const at = [p.pos.x, p.pos.y, p.pos.z, p.yaw];
  const was = vm.gauntlet, wasEq = { ...vm.equip };
  const out = [];
  for (const g of ['bare', was || 'wayfarer']) {
    await vm.load(g);
    for (const R of ['onehand', 'staff', null]) {
      vm.equip.R = R; vm.equip.L = null; await vm.applyEquip();
      vm.state = { R: null, L: null };
      for (const s of ['R', 'L']) vm.playWalk?.(s, true);
      const name = `${prefix}_arms_${g}_${R || 'empty'}`;
      for (const backdrop of [false, true]) {
        const undo = holdLoop(640, 400);
        const hidden = [], bg = b.scene.background;
        if (backdrop) { for (const c of b.scene.children) if (c.visible && !c.isLight) { c.visible = false; hidden.push(c); } b.scene.background = new THREE.Color(0x5c5f63); }
        try {
          for (let i = 0; i < 24; i++) {
            p.pos.set(at[0], at[1] + (backdrop ? 150 : 0), at[2]); p.vel.set(0, 0, 0); p.yaw = at[3]; p.pitch = backdrop ? 1.1 : 0.1;
            b.setHour?.(12); vm.scene.visible = true; frame();
          }
          out.push(await snap(name + (backdrop ? '_bd' : '')));
        } finally { for (const c of hidden) c.visible = true; b.scene.background = bg; undo(); }
      }
    }
  }
  Object.assign(vm.equip, wasEq);
  vm.gauntlet = was; await b.applyGear?.();
  return { shots: out, pipes: programCount(b.renderer) };
}

/** Villagers close up: the nearest few to the plaza, stood before you, by day and in the evening. */
export async function people(prefix = 'p') {
  const b = bm(), p = b.player, V = b.villagers;
  const undo = holdLoop(960, 600);
  const out = [];
  try {
    const list = V.list.filter((a) => !a.hidden).sort((a, c) => Math.hypot(a.pos.x + 6, a.pos.z - 24) - Math.hypot(c.pos.x + 6, c.pos.z - 24)).slice(0, 2);
    for (const [k, a] of list.entries()) {
      for (const hour of [12, 18.5]) {
        const ax = a.pos.x, az = a.pos.z, fy = a.yaw ?? 0;
        const ex = ax + Math.sin(fy) * 1.6, ez = az + Math.cos(fy) * 1.6;
        for (let i = 0; i < 20; i++) {
          a.pos.set(ax, a.pos.y, az); a.want = null; a.path = [];
          p.pos.set(ex, b.physics.groundAt(ex, ez), ez); p.vel.set(0, 0, 0);
          p.yaw = Math.atan2(-(ax - ex), -(az - ez)); p.pitch = -0.1; b.setHour(hour); b.vm.scene.visible = false; frame();
        }
        out.push(await snap(`${prefix}_people_${k}_${hour < 15 ? 'day' : 'eve'}`));
      }
    }
  } finally { undo(); }
  return { shots: out, pipes: programCount(b.renderer) };
}
