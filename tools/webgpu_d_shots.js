// Views for the WebGPU port of the spells, the billboards, the stained glass, the tufts, the trees'
// leaves and the portals (the same under either renderer, to put side by side): contact sheets saved
// to art/view/shots/<prefix>_<name>.png (POST /shot, the harness). Steps the game by hand, so it
// works headless. In the page, once loaded:
//   (await import('/tools/webgpu_d_shots.js')).spells('gl')     every spell cast, two moments of each, and the shaders made
//   (await import('/tools/webgpu_d_shots.js')).glass('gl')      the cathedral's windows and their light on the floor, by day
//   (await import('/tools/webgpu_d_shots.js')).portals('gl')    a seal asleep, awake, waking, and by night
//   (await import('/tools/webgpu_d_shots.js')).growth('gl')     billboards, tufts and the 3D trees close to
const bm = () => window.bellmourn;
const programs = () => { const r = bm().renderer; return r.isWebGPURenderer ? r._pipelines.caches.size : r.info.programs.length; };
const W = 400, H = 225;

/** A sheet of tiles, `cols` across: add() the canvas as it is now, then save(). */
function sheet(name, cols = 3) {
  const tiles = [];
  return {
    add(label) {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.drawImage(document.getElementById('game'), 0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, W, 16); g.fillStyle = '#fff'; g.font = '12px monospace'; g.fillText(label, 4, 12);
      tiles.push(c);
    },
    async save() {
      const rows = Math.ceil(tiles.length / cols), c = document.createElement('canvas');
      c.width = W * cols; c.height = H * rows;
      const g = c.getContext('2d');
      tiles.forEach((t, i) => g.drawImage(t, (i % cols) * W, Math.floor(i / cols) * H));
      const bin = atob(c.toDataURL('image/png').split(',')[1]), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      await fetch(`/shot?name=${name}`, { method: 'POST', body: u8 });
      return tiles.length;
    },
  };
}

/** Playing, the HUD away, the game's own loop held (frames are stepped here); returns undo. */
function setup({ hands = false } = {}) {
  const b = bm();
  b.begin?.();
  const raf = window.requestAnimationFrame, held = [];
  window.requestAnimationFrame = (f) => { held.push(f); return 0; };
  b.hud.hud.classList.add('hidden');
  b.vm.scene.visible = hands;
  return () => { window.requestAnimationFrame = raf; for (const f of held) raf(f); b.hud.hud.classList.remove('hidden'); b.vm.scene.visible = true; };
}
/** One frame (three's node frame too, as its own loop would). */
function frame(dt = 1 / 60) { const b = bm(), nf = b.renderer._nodes?.nodeFrame; if (nf) { nf.update(); b.renderer.info.frame = nf.frameId; } b.tick(dt); }
/** n frames with the feet held at (x, y, z) (y null: the ground), looking at (lx, ly, lz). */
function hold(n, [x, y0, z], [lx, ly, lz]) {
  const b = bm(), p = b.player, ph = b.physics;
  const y = y0 ?? Math.max(ph.groundAt(x, z), ph.floorAt(x, z, ph.groundAt(x, z) + 1.5, 0.3, 0.2));
  const yaw = Math.atan2(-(lx - x), -(lz - z)), pitch = Math.atan2(ly - (y + 1.72), Math.hypot(lx - x, lz - z));
  for (let i = 0; i < n; i++) { p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; p.health = p.maxHealth; frame(); }
}

// when to look at each (seconds after the cast)
const WHEN = { firebolt: [1.6, 2.5], frost: [0.5, 0.9], lightning: [0.9, 2.2], wisp: [0.8, 2], mend: [0.5, 1.2], wallfire: [0.8, 2.4],
  missiles: [0.9, 2.0], meteor: [1.1, 1.9], blizzard: [1.2, 2.6], well: [1.2, 2.6], blades: [1.0, 2.0], spikes: [0.5, 1.0], plague: [0.9, 1.8] };

/** Every spell (or `ids`) cast at the square at dusk with one of the dead before you: two moments of
 * each on a sheet, and the shaders made by each cast (after the loading's rehearsal: should be 0). */
export async function spells(prefix = 's', ids = null) {
  const b = bm(), undo = setup({ hands: true }), inp = b.input();
  const { SPELLS } = await import('/src/fps/spells.js');
  const list = ids || Object.keys(SPELLS);
  const hour = b.hour, was = b.player.pos.clone();
  b.setHour(19.5);
  const at = [3, null, 14], look = [1, 0.4, 2];
  b.zombies.quiet = true;
  const z = b.zombies.spawn(null, 1.5, 3, { zone: 'wild' });
  const made = {}, sh = sheet(`${prefix}_spells`, 4);
  let p0 = programs();
  try {
    hold(30, at, look);
    for (const id of list) {
      const def = SPELLS[id];
      b.assign(id, 'F');
      for (let i = 0; i < 240 && (b.vm.busy('R') || b.vm.busy('L')); i++) hold(1, at, look);
      if (z && !z.dead) { z.pos.set(1.5, z.pos.y, 3); }
      b.player.mana = 9999;
      const before = programs();
      if (def.channel) inp.keys.add('KeyF');
      b.castSlot('F');
      const [t1, t2] = WHEN[id] || (def.channel ? [0.9, 1.8] : [0.6, 1.3]);
      let t = 0;
      for (const tt of [t1, t2]) {
        const n = Math.round((tt - t) * 60);
        hold(n, at, look); t = tt;
        sh.add(`${id} ${tt}s`);
      }
      inp.keys.delete('KeyF');
      hold(90, at, look);
      made[id] = programs() - before;
    }
  } finally {
    b.magic.endCharge?.(); b.magic.arcana.endChannels?.();
    if (z) { z.gone = true; z.root.removeFromParent(); b.zombies.list.splice(b.zombies.list.indexOf(z), 1); }
    b.zombies.quiet = false;
    b.setHour(hour); b.player.pos.copy(was);
    undo();
  }
  await sh.save();
  return { made, total: programs() - p0, programs: programs() };
}

/** The cathedral by day: where its windows' light lands on the floor (worked out from the sun as the
 * shader does), seen from inside; the windows from below; and outside. */
export async function glass(prefix = 'g', hours = [10, 13, 15.5]) {
  const b = bm(), undo = setup(), S = b.ctx.stained, hour = b.hour, sh = sheet(`${prefix}_glass`, 3), out = [];
  try {
    for (const h of hours) {
      b.setHour(h);
      hold(20, [17, null, -38], [0, 8, -60]);
      const sun = S.uniforms.gSun.value.clone();
      // the biggest window of the biggest room whose light falls on its floor
      const room = S.rooms.map((r, i) => ({ r, i, v: (r[3] - r[0]) * (r[5] - r[2]) })).sort((a, c) => c.v - a.v)[0].r;
      const inRoom = (p) => p.x > room[0] && p.x < room[3] && p.z > room[2] && p.z < room[5];
      const ph = b.physics, mx = (room[0] + room[3]) / 2, mz = (room[2] + room[5]) / 2;
      const floorY = Math.max(ph.groundAt(mx, mz), ph.floorAt(mx, mz, ph.groundAt(mx, mz) + 1.5, 0.3, 0.2));
      let best = null;
      for (const w of S.list) {
        if (sun.y < 0.05 || !inRoom(w.center.clone().addScaledVector(w.normal, 0.5))) continue;
        const t = (w.center.y - floorY) / sun.y;
        const P = w.center.clone().addScaledVector(sun, -t);
        if (!inRoom(P) || w.normal.dot(sun) > 0) continue;
        if (!best || w.w * w.h > best.w.w * best.w.h) best = { w, P };
      }
      if (!best) { out.push({ h, none: true }); continue; }
      const { w, P } = best;
      // stand back from the patch of light, toward the room's middle, looking down at it
      const mid = [(room[0] + room[3]) / 2, (room[2] + room[5]) / 2];
      const d = Math.hypot(mid[0] - P.x, mid[1] - P.z) || 1;
      const ex = P.x + (mid[0] - P.x) / d * 5, ez = P.z + (mid[1] - P.z) / d * 5;
      hold(40, [ex, null, ez], [P.x, floorY, P.z]);
      sh.add(`${h}h floor light`);
      hold(10, [ex, null, ez], [w.center.x, w.center.y, w.center.z]);
      sh.add(`${h}h window`);
      hold(10, [17, null, -38], [0, 8, -60]);
      sh.add(`${h}h outside`);
      out.push({ h, window: w.id, at: [+P.x.toFixed(1), +P.z.toFixed(1)] });
    }
  } finally { b.setHour(hour); undo(); }
  await sh.save();
  return out;
}

/** The village's seal asleep, waking, awake and by night; and the graveyard's, awake from afar. */
export async function portals(prefix = 'p') {
  const b = bm(), undo = setup(), P = b.ctx.portals, keep = P.save(), hour = b.hour, sh = sheet(`${prefix}_portals`, 3);
  const v = P.list[0], g = P.list.find((p) => p.id === 'graveyard');
  const cx = v.x + 3.4, cz = v.z + 2.2, eye = [cx, null, cz], at = [v.x - 0.4, v.y + 0.6, v.z - 0.2];
  try {
    b.setHour(13);
    P.load([]); P.noWake = true;
    hold(120, eye, at); sh.add('asleep, close');
    hold(10, [v.x + 7, null, v.z + 6], [v.x, v.y + 0.5, v.z]); sh.add('asleep');
    P.noWake = false; P.wake(v);
    hold(40, eye, at); sh.add('waking 0.7s');
    hold(80, eye, at); sh.add('waking 2s');
    hold(200, eye, at); sh.add('awake, close');
    hold(10, [v.x + 7, null, v.z + 6], [v.x, v.y + 0.5, v.z]); sh.add('awake');
    b.setHour(23);
    hold(60, [v.x + 9, null, v.z + 12], [v.x, v.y + 0.6, v.z]); sh.add('night');
    P.wake(g, true);
    hold(60, [g.x + 10, null, g.z + 8], [g.x, g.y + 1, g.z]); sh.add('graveyard night');
    hold(30, [v.x + 0.3, null, v.z + 0.3], [v.x, v.y + 1.5, v.z - 6]); sh.add('standing on it');
  } finally { P.load(keep); P.noWake = false; b.setHour(hour); undo(); }
  await sh.save();
  return { programs: programs() };
}

/** Plants and trees close to: a billboard clump, the tufts at a road's edge, the 3D trees' leaves
 * and their shadows, at noon and at dusk. */
export async function growth(prefix = 'w') {
  const b = bm(), undo = setup(), hour = b.hour, sh = sheet(`${prefix}_growth`, 3);
  try {
    const tuft = b.ctx.tufts.at[Math.floor(b.ctx.tufts.at.length / 3)];
    const tree = [...b.ctx.trees3d.place.values()][0]?.[0];
    // a billboard tree and a billboard plant (the biggest groups of each), from 9 m and from 40 m
    const groups = [...b.bill.groups.entries()].map(([id, list]) => ({ id, list, cat: b.lib.sprite(id)?.category })).sort((x, y) => y.list.length - x.list.length);
    const btree = groups.find((g) => g.cat === 'tree'), bplant = groups.find((g) => g.cat !== 'tree');
    for (const h of [12, 18.5]) {
      b.setHour(h);
      for (const [g, d] of [[btree, 9], [btree, 40], [bplant, 4]]) {
        if (!g) continue;
        const q = g.list[Math.floor(g.list.length / 2)];
        hold(30, [q.x + d * 0.8, null, q.z + d * 0.6], [q.x, q.y + (g === btree ? 3 : 0.5), q.z]); sh.add(`${h}h ${g.id} ${d}m`);
      }
      if (tuft) { hold(20, [tuft[0] + 2.2, null, tuft[1] + 1.2], [tuft[0], 0.1, tuft[1]]); sh.add(`${h}h tufts`); }
      if (tree) { hold(20, [tree.x + 9, null, tree.z + 7], [tree.x, tree.y + 4, tree.z]); sh.add(`${h}h tree`); }
      hold(20, [-6, null, 24], [8, 4, -40]); sh.add(`${h}h plaza`);
    }
  } finally { b.setHour(hour); undo(); }
  await sh.save();
  return { programs: programs() };
}

/** What a cast does, step by step (why a spell might not show). */
export async function castDiag(id = 'firebolt') {
  const b = bm(), undo = setup({ hands: true }), out = { busy: [b.vm.busy('R'), b.vm.busy('L'), b.vm.blocking], equip: { ...b.vm.equip } };
  try {
    b.assign(id, 'F'); b.player.mana = 9999;
    hold(5, [3, null, 14], [1, 0.4, 2]);
    out.manaBefore = b.player.mana;
    b.castSlot('F');
    out.manaAfter = b.player.mana; out.busyAfter = [b.vm.busy('R'), b.vm.busy('L')];
    out.steps = [];
    for (let i = 0; i < 6; i++) { hold(30, [3, null, 14], [1, 0.4, 2]); out.steps.push([b.magic.flying.length, b.magic.particles.n, b.vm.busy('R'), b.vm.busy('L')]); }
  } finally { undo(); }
  // and a billboard's picture as the GPU has it
  const m = b.scene.children.find((o) => o.material?.uniforms?.map && o.material?.uniforms?.wind)?.material;
  const t = m?.uniforms.map.value;
  if (t) {
    out.tex = { w: t.image?.width, h: t.image?.height, min: t.minFilter, mag: t.magFilter, mips: t.generateMipmaps, cs: t.colorSpace };
    const g = b.renderer.backend?.get?.(t);
    if (g?.texture) out.tex.gpu = { mipLevelCount: g.texture.mipLevelCount, format: g.texture.format };
  }
  return out;
}
