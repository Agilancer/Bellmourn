// The ragdolls (src/fps/ragdoll.js), seen and measured: one of the dead or a foe stood before you,
// struck dead (a blade, a blunt blow, a spell, a blast), then watched from the side as it falls, a
// picture at each moment to art/view/shots/<prefix>_<n>.png (the harness's POST /shot), and how it lay:
// its points' lowest against the ground under them, the trunk's height, how long it took to settle,
// what a step costs. The game's loop is held and stepped by hand (as flesh_shots.js does), so it works
// headless. In the page, once a game is under way:
//   await (await import('/tools/ragdoll_shots.js')).fall('r1', { variant: 'rotting_zombie' })
//   await (await import('/tools/ragdoll_shots.js')).fall('r2', { variant: 'sworn_m', foe: true, kind: 'blunt' })
//   await (await import('/tools/ragdoll_shots.js')).sweep('rs')     several bodies and blows, one picture each
//   await (await import('/tools/ragdoll_shots.js')).scenes('rc')    against a wall, onto a box, down steps, flung, a corpse cut, ten at once
// Options worth knowing: view ('side', 'front', 'above'), around (four close-ups where it lies), props
// (boxes about it), stand (it stands that high), keep (left lying, returned as out.z).
import * as THREE from 'three';

const bm = () => window.bellmourn;
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function holdLoop(w, h) {
  const b = bm();
  b.begin?.();
  const raf = window.requestAnimationFrame, held = [];
  window.requestAnimationFrame = (f) => { held.push(f); return 0; };
  b.renderer.setSize(w, h, false); b.composer.setSize(w, h);
  b.camera.aspect = w / h; b.camera.updateProjectionMatrix(); b.vm.resize?.(w / h);
  b.hud.hud.classList.add('hidden');
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

/** How a ragdoll lies: its lowest ball's bottom over the ground under it, the trunk's middle over the
 * ground, and whether any bone went wrong. */
function lying(z) {
  const r = z.rag, ph = bm().physics;
  if (!r) return { rag: false };
  let low = Infinity, sink = Infinity;
  for (let i = 0; i < r.n; i++) {
    const x = r.P[i * 3], y = r.P[i * 3 + 1] - r.R[i], zz = r.P[i * 3 + 2];
    low = Math.min(low, y);
    const f = ph.floorAt(x, zz, y + 0.6, 0.02, 0.05);
    if (f > -Infinity) sink = Math.min(sink, y - f);
  }
  const gy = ph.floorAt(r.c.x, r.c.z, r.c.y + 0.5, 0.02, 0.05);
  let bad = 0;
  for (const b of z.skel.bones) if (![b.position.x, b.position.y, b.position.z, b.quaternion.w].every(Number.isFinite)) bad++;
  // (what still moves most, mm a step)
  const moving = r.keys.map((k, i) => [k, Math.hypot(r.P[i * 3] - r.Q[i * 3], r.P[i * 3 + 1] - r.Q[i * 3 + 1], r.P[i * 3 + 2] - r.Q[i * 3 + 2]) * 1000])
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
  return { rag: true, awake: r.awake, t: +r.t.toFixed(2), low: +low.toFixed(3), under: +sink.toFixed(3), trunk: +(r.c.y - gy).toFixed(3), bad, points: r.n, thuds: r.thuds, moving };
}

/** One body (`variant`; `foe`: one of the foes) stood `dist` m before you on the meadow, struck dead on
 * `bone` with `kind` along your look (`dir` turns it: [x, y, z] added), then watched from the side
 * (`view`: 'side', 'front' or 'above') at each of `times` (seconds after the blow). */
export async function fall(prefix = 'r', { variant = 'rotting_zombie', foe = false, kind = 'blade', heavy = true, bone = 'chest', at = [360, -10], hour = 12,
  dist = 2.2, push = 0.8, dir = [0, 0, 0], view = 'side', times = [0, 0.12, 0.3, 0.55, 0.9, 1.5, 3], seed = 7, crawl = false, blast = false, shove = null, pre = true, keep = false, props = [], then = null, stand = 0, around = false, w = 960, h = 600 } = {}) {
  const b = bm(), Z = b.zombies, p = b.player;
  const undo = holdLoop(w, h);
  b.setHour(hour);
  const rnd = Math.random;
  const out = { variant, kind, shots: [], at: [] };
  const quiet = Z.quiet;
  Z.quiet = true;   // (nothing dropped: loot would pile up where the tests are)
  const loot = b.foes.ctx?.loot, drop = loot?.drop;
  if (loot) loot.drop = () => {};
  let z = null;
  const made = [];
  try {
    const [x, zz] = at, y = b.physics.groundAt(x, zz);
    // boxes about where it stands (offsets from its feet: [x0, y0, z0, x1, y1, z1]), solid and seen
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 });
    for (const [a0, b0, c0, a1, b1, c1] of props) {
      const min = [x + a0, y + b0, zz - dist + c0], max = [x + a1, y + b1, zz - dist + c1];
      const box = b.physics.add(min, max, 'test');
      const m = new THREE.Mesh(new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]), mat);
      m.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
      m.castShadow = m.receiveShadow = true; m.userData.mover = true;
      b.scene.add(m);
      made.push({ box, m });
    }
    const eye = (px, pz, yaw, pitch) => { p.pos.set(px, b.physics.floorAt(px, pz, y + 2, 0.3, 0.5), pz); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; p.health = p.maxHealth || 100; b.vm.scene.visible = false; };
    // (close: from 1.7 m off where the body is now, a quarter turn at a time; yaw 0 looks along -z)
    const near = (k) => () => {
      const c = z?.rag?.c || z?.pos || new THREE.Vector3(x, y, zz - dist), a = Math.PI / 4 + k * Math.PI / 2;
      eye(c.x + Math.sin(a) * 1.7, c.z + Math.cos(a) * 1.7, a, -0.62);
    };
    const views = { front: () => eye(x, zz, 0, -0.18), side: () => eye(x + 2.6, zz - dist - 0.5, Math.PI / 2, -0.42), above: near(0), near0: near(0), near1: near(1), near2: near(2), near3: near(3) };
    const hold = (n, v = 'front') => { for (let i = 0; i < n; i++) { views[v](); frame(); } };
    hold(8);
    Math.random = seeded(seed);
    const o2 = { zone: 'wild', y: y + stand };
    z = foe ? b.foes.spawn(variant, x, zz - dist, o2) : Z.spawn(variant, x, zz - dist, o2);
    z.yaw = 0; z.sync();
    const real = Object.getPrototypeOf(z).update;
    z.update = function (...a) { if (this.dead) return real.apply(this, a); this.sync(); };   // (stood still till it dies: no brain)
    if (crawl) z.cripple(['shinL', 'shinR']);
    z.play(crawl ? 'crawl' : 'idle', 0); z.mixer.update(0.4);
    hold(20);
    if (pre) { hold(2, view); out.shots.push(await snap(`${prefix}_pre`)); hold(2); }
    // the blow, where your look through the bone meets it (the last one: it has 1 life left)
    const cam = b.camera, bb = z.bones[bone] || z.bones.chest;
    const pt = bb.getWorldPosition(new THREE.Vector3());
    const o = cam.getWorldPosition(new THREE.Vector3()), d = pt.clone().sub(o).add(new THREE.Vector3(...dir)).normalize();
    const hit = z.ray(o, d, 8) || { t: 1, bone: bb, point: pt, z };
    z.hp = 1;
    const t0 = performance.now();
    if (blast) Z.blast(pt.clone().addScaledVector(d, -0.9).add(new THREE.Vector3(0, -0.6, 0)), 3, 60, kind);
    else z.hit(hit, { dmg: 40, dir: d, heavy, kind, edge: kind === 'blade' ? new THREE.Vector3(1, 0.4, 0).normalize() : null, push, blow: 0 });
    if (shove) z.shove(...shove);
    out.made = +(performance.now() - t0).toFixed(2);
    out.ragdoll = !!z.rag;
    // and watched as it falls
    let t = 0, ms = 0, steps = 0;
    for (const [k, when] of times.entries()) {
      while (t < when - 1e-6) {
        views[view]();
        const a = performance.now();
        frame(1 / 60);
        ms += performance.now() - a; steps++;
        t += 1 / 60;
      }
      views[view](); frame(0);
      out.shots.push(await snap(`${prefix}_${k}`));
      out.at.push({ t: +when.toFixed(2), ...lying(z) });
    }
    out.frameMs = +(ms / Math.max(1, steps)).toFixed(2);
    if (around) for (let k = 0; k < 4; k++) { views['near' + k](); frame(0); views['near' + k](); frame(0); out.shots.push(await snap(`${prefix}_around${k}`)); }
    if (then) {   // (and more done to it where it lies, watched: then(z, { run(seconds), snap(name) }))
      const run = (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) { views[view](); frame(1 / 60); } };
      out.then = await then(z, { run, snap: async (n) => { views[view](); frame(0); out.shots.push(await snap(`${prefix}_${n}`)); out.at.push({ t: n, ...lying(z) }); }, cam: b.camera });
    }
    // what a step costs, on its own (woken and stepped again where it lies, as many times)
    if (z.rag) {
      const r = z.rag, keep = [r.P.slice(), r.Q.slice(), r.t, r.life];
      r.wake(5);
      const a = performance.now();
      for (let i = 0; i < 200; i++) r.step();
      out.stepUs = +((performance.now() - a) / 200 * 1000).toFixed(1);
      r.P.set(keep[0]); r.Q.set(keep[1]); r.t = keep[2]; r.life = keep[3]; r.sleep();
    }
  } finally {
    Math.random = rnd;
    Z.quiet = quiet;
    if (loot) loot.drop = drop;
    for (const { box, m } of made) { box.off = true; m.removeFromParent(); m.geometry.dispose(); }   // (the boxes gone: near() passes over one that's off)
    for (const l of b.foes.lost.splice(0)) l.g.removeFromParent();   // (and what the foes let fall)
    if (z && keep) out.z = z;   // (left lying, for a test to go on with)
    else if (z) { z.remove(); Z.list.splice(Z.list.indexOf(z), 1); }
    for (const o of Z.pieces.splice(0)) o.m.removeFromParent();
    undo();
  }
  return out;
}

/** Several bodies and blows, the last moment of each (and the first few of the first). */
export async function sweep(prefix = 'rs', list = null) {
  const b = bm();
  const foes = Object.keys(b.foes.gltf || {});
  const pick = (want) => want.find((v) => foes.includes(v));
  list ||= [
    { variant: 'rotting_zombie', kind: 'blade' },
    { variant: 'rotting_zombie', kind: 'blunt', bone: 'head' },
    { variant: 'tomb_mummy', kind: 'fire', blast: true },
    { variant: 'pale_ghoul', kind: 'blade', crawl: true },
    { variant: pick(['knight_a', 'knight_b', 'knight_c']), foe: true, kind: 'blunt' },
    { variant: pick(['sworn_m', 'sworn_f']), foe: true, kind: 'blade', bone: 'spine' },
    { variant: pick(['goat_a', 'goat_b']), foe: true, kind: 'blunt' },
    { variant: pick(['ghast_a', 'ghast_b']), foe: true, kind: 'arcane', heavy: true },
  ].filter((o) => o.variant);
  const out = [];
  for (const [i, o] of list.entries()) {
    try { out.push(await fall(`${prefix}${i}`, { times: [0.2, 0.6, 3], ...o })); } catch (e) { out.push({ ...o, error: String(e?.stack || e).slice(0, 400) }); }
  }
  return out;
}

/** The hard ones: killed against a wall, onto a box, down steps; flung by a blast; a corpse struck
 * and cut; and ten at once, the cost of it. */
export async function scenes(prefix = 'rc') {
  const out = {};
  const T = [0.25, 0.7, 2.5];
  // against a wall half a metre behind it (the blow drives it into it)
  out.wall = await fall(prefix + 'w', { variant: 'sworn_m', foe: true, kind: 'blunt', times: T, props: [[-1.5, 0, -0.75, 1.5, 2.4, -0.45]] });
  // onto a waist-high box behind it
  out.box = await fall(prefix + 'b', { variant: 'rotting_zombie', kind: 'blunt', times: T, props: [[-0.6, 0, -1.4, 0.6, 0.85, -0.5]] });
  // down three steps behind it
  out.steps = await fall(prefix + 's', { variant: 'knight_a', foe: true, kind: 'blunt', at: [360, -10], times: T, stand: 0.45,
    props: [[-1.2, -0.0, -0.9, 1.2, 0.45, 2], [-1.2, 0, -1.3, 1.2, 0.3, -0.9], [-1.2, 0, -1.7, 1.2, 0.15, -1.3]] });
  // a fire blast and the shove of a meteor: flung
  out.flung = await fall(prefix + 'f', { variant: 'rotting_zombie', kind: 'fire', blast: true, shove: [0, -9, 4], times: [0.2, 0.5, 1, 3] });
  // a corpse struck, then an arm and the head cut from it as it lies
  out.corpse = await fall(prefix + 'c', { variant: 'pale_ghoul', kind: 'blade', times: [2], then: async (z, h) => {
    const p = z.bones.chest.getWorldPosition(new THREE.Vector3());
    z.hit({ bone: z.bones.chest, point: p, z }, { dmg: 20, dir: new THREE.Vector3(0.3, 0.2, -1).normalize(), heavy: true, kind: 'blunt', push: 1 });
    h.run(0.4); await h.snap('struck');
    z.sever('upper_armR', new THREE.Vector3(1, 0.4, 0).normalize());
    z.sever('head', new THREE.Vector3(0, 0.6, -1).normalize());
    h.run(1.5); await h.snap('cut');
    return { lost: [...z.lost], awake: z.rag?.awake };
  } });
  // ten round you, one blast: what each step costs while they fall
  const b = bm(), Z = b.zombies, p = b.player, undo = holdLoop(960, 600);
  const quiet = Z.quiet; Z.quiet = true;
  const ten = [];
  try {
    const [x, zz] = [360, -10], y = b.physics.groundAt(x, zz);
    const hold = (n) => { for (let i = 0; i < n; i++) { p.pos.set(x, y, zz + 4); p.vel.set(0, 0, 0); p.yaw = 0; p.pitch = -0.35; frame(); } };
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, z = Z.spawn('rotting_zombie', x + Math.cos(a) * 1.6, zz + Math.sin(a) * 1.6, { zone: 'wild' });
      const real = Object.getPrototypeOf(z).update;
      z.update = function (...q) { if (this.dead) return real.apply(this, q); this.sync(); };
      z.hp = 1; ten.push(z);
    }
    hold(10);
    let spent = 0, calls = 0;
    const realStep = (await import('/src/fps/ragdoll.js')).Ragdoll.prototype.step;
    (await import('/src/fps/ragdoll.js')).Ragdoll.prototype.step = function () { const a = performance.now(); realStep.call(this); spent += performance.now() - a; calls++; };
    Z.blast(new THREE.Vector3(x, y + 0.3, zz), 3, 80, 'fire');
    let ms = 0;
    for (let i = 0; i < 90; i++) { const a = performance.now(); hold(1); ms += performance.now() - a; }
    (await import('/src/fps/ragdoll.js')).Ragdoll.prototype.step = realStep;
    out.shots = [await snap(prefix + '_ten')];
    out.ten = { ragdolls: ten.filter((z) => z.rag).length, asleep: ten.filter((z) => z.rag && !z.rag.awake).length, stepMsPerFrame: +(spent / 90).toFixed(2), steps: calls, frameMs: +(ms / 90).toFixed(2), bad: ten.filter((z) => z.skel.bones.some((q) => !Number.isFinite(q.position.x))).length };
  } finally {
    Z.quiet = quiet;
    for (const z of ten) { z.remove(); Z.list.splice(Z.list.indexOf(z), 1); }
    undo();
  }
  return out;
}
