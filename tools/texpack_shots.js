// Views of where the October texture packs went into the world (the Downs' cliffs and rocks, the
// caves, the cathedral, the houses' rooms, the keep, the catacombs' shrine and tomb, and the new
// crates, chests and pottery), saved to art/view/shots/<prefix>_<name>.png for review. Steps the
// game by hand, so it works with the browser pane hidden. In the page, once loaded:
//   (await import('/tools/texpack_shots.js')).shots('t1')
//   (await import('/tools/texpack_shots.js')).shots('t1', ['downs_cliff'])   // just some
// A view: where the eye stands (y null: on the ground or floor there), what it looks at
// ([x, z], or [x, y, z]), the hour, and (cave) the cave whose floor it stands on.
const cave = (name) => window.bellmourn.ctx.caves.find((c) => c.name === name);
export const VIEWS = {
  downs_cliff: { at: [704, null, -14], look: [737, 13, 4], hour: 13 },
  downs_falls: { at: [668, null, -8], look: [736, 10, -40], hour: 15 },
  downs_crags: { at: [712, null, 104], look: [740, 8, 128], hour: 11 },
  gloam_mouth: { at: () => [cave('The Gloamhollow').mouth.x - 14, null, cave('The Gloamhollow').mouth.z - 5], look: () => [cave('The Gloamhollow').px, cave('The Gloamhollow').mouth.y + 1.5, cave('The Gloamhollow').pz], hour: 12 },
  gloam_inside: { cave: 'The Gloamhollow', in: 10, hour: 22 },
  grotto_inside: { cave: 'The Drowned Grotto', in: 12, hour: 22 },
  troll_inside: { cave: 'The Trollhole', in: 12, hour: 22 },
  cathedral_out: { at: [17, null, -38], look: [0, 8, -60], hour: 14 },
  cathedral_stair: { at: [5, -3.5, -101.5], look: [5, -6, -108], hour: 22 },
  inn_room: { at: [23.4, null, 15.5], look: [34, 1.2, 20], hour: 20 },
  smithy_room: { at: [-25, null, 21], look: [-34, 1.0, 16], hour: 20 },
  store_room: { at: [23.6, null, -15.6], look: [34, 1.0, -20], hour: 13 },
  alchemist_room: { at: [-25.8, null, -15.2], look: [-34, 1.0, -21], hour: 13 },
  hall_room: { at: [0, null, 37], look: [0, 1.4, 48], hour: 13 },
  bakery_room: { at: [-53.6, null, -5.4], look: [-63, 1.0, -9], hour: 13 },
  healer_room: { at: [39.6, null, -45.8], look: [49, 1.0, -50], hour: 13 },
  barracks_room: { at: [52, null, 40.6], look: [52, 1.0, 49], hour: 13 },
  keep_walls: { at: [-180, null, 18], look: [-200, 7, 0], hour: 16 },
  keep_throne: { at: [-262, null, 3], look: [-273, 1.2, 0], hour: 22 },
  delve_barrow: { at: [-205, null, 107], look: [-205, 2, 95], hour: 14 },
  store_chest: { at: [29.6, null, -16.4], look: [31, 0.4, -14.2], hour: 13 },
  ossuary_pots: { at: [41, -21, -277], yaw: -Math.PI / 2, pitch: -0.18, hour: 22 },
  shrine_floor: { at: [1.5, -37, -351], yaw: -Math.PI / 2 + 0.25, pitch: -0.45, hour: 22 },
  tomb: { at: [46, -40, -387.5], yaw: 0, pitch: -0.42, hour: 22 },
};

/** The canvas as PNG bytes, at once (toBlob is put off for a long time in a hidden tab). */
function pngOf(cv) {
  const bin = atob(cv.toDataURL('image/png').split(',')[1]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export async function shots(prefix = 't', only = null, { w = 800, h = 500 } = {}) {
  const bm = window.bellmourn, p = bm.player, ph = bm.physics;
  bm.begin?.();
  // (the dead and the foes hold still while the camera goes round)
  const zu = bm.zombies.update;
  bm.zombies.update = function (...a) { this.time += a[0]; this.gore.update(a[0], a[3], a[4], 1); };
  bm.renderer.setSize(w, h, false); bm.composer.setSize(w, h);
  bm.camera.aspect = w / h; bm.camera.updateProjectionMatrix(); bm.vm.resize?.(w / h);
  bm.hud.hud.classList.add('hidden');
  const sized = [];
  bm.scene.traverse((o) => {
    const u = o.isPoints && o.material?.uniforms?.scale;
    if (!u) return;
    sized.push([u, Object.getOwnPropertyDescriptor(u, 'value')]);
    Object.defineProperty(u, 'value', { configurable: true, get: () => (h / 2) * bm.camera.projectionMatrix.elements[5], set: () => {} });
  });
  const out = [];
  for (const [name, v] of Object.entries(VIEWS)) {
    if (only && !only.includes(name)) continue;
    let x, y, z, yaw, pitch;
    if (v.cave) {
      // in the cave's great chamber (its first room), near its mouth-ward end, looking across it
      const c = cave(v.cave), room = c.features.find((f) => f.type === 'room');
      x = c.px + room.a - room.ra * 0.6; z = c.pz + room.b;
      y = c.floorAt(x, z) ?? c.mouth.y;
      yaw = Math.atan2(-(c.px + room.a - x), -(c.pz + room.b - z)); pitch = 0.12;
    } else {
      [x, y, z] = typeof v.at === 'function' ? v.at() : v.at;
      if (y == null) y = Math.max(ph.groundAt(x, z), ph.floorAt(x, z, ph.groundAt(x, z) + 1.5, 0.3, 0.2));
      if (v.look) {
        const L = typeof v.look === 'function' ? v.look() : v.look;
        const [lx, ly, lz] = L.length === 2 ? [L[0], y + 1.6, L[1]] : L;
        yaw = Math.atan2(-(lx - x), -(lz - z));
        pitch = Math.atan2(ly - (y + 1.7), Math.hypot(lx - x, lz - z));
      } else ({ yaw, pitch } = v);
    }
    bm.setHour?.(v.hour ?? 13);
    for (let i = 0; i < 40; i++) { p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; bm.vm.scene.visible = false; bm.tick(1 / 60); }
    await fetch(`/shot?name=${prefix}_${name}`, { method: 'POST', body: pngOf(document.getElementById('game')) });
    out.push(name);
  }
  for (const [u, d] of sized) Object.defineProperty(u, 'value', d);
  bm.zombies.update = zu;
  bm.vm.scene.visible = true;
  bm.hud.hud.classList.remove('hidden');
  return out;
}

/** A searched chest, its lid swinging: open the nearest chest to (x, z) and shoot it half open
 * and open (for the critics: does the lid hinge where it should?). */
export async function lid(prefix, x, y, z, yaw, pitch = -0.35) {
  const bm = window.bellmourn, p = bm.player, props = bm.ctx.props;
  let best = null;
  for (const id of props.lids.keys()) for (const q of props.place.get(id) || []) { const d = Math.hypot(q.x - x, q.z - z); if (!best || d < best.d) best = { id, q, d }; }
  if (!best) return null;
  props.open(best.id, best.q.i);
  for (let i = 0; i < 60; i++) { p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; bm.vm.scene.visible = false; bm.tick(1 / 60); }
  await fetch(`/shot?name=${prefix}_lid_${best.id}`, { method: 'POST', body: pngOf(document.getElementById('game')) });
  return best.id;
}

/** Smash the breakables nearest (x, z) one after another, from an eye at `at` looking at them,
 * shooting before, as the pieces fly and once they've settled; reports what spilled and whether
 * any shader had to be compiled for it (it shouldn't). */
export async function breakTest(prefix = 'brk', x = 33.6, z = -21.4, at = [30.6, null, -19.2], n = 3) {
  const bm = window.bellmourn, p = bm.player, P = bm.ctx.props, L = bm.ctx.loot, ph = bm.physics;
  bm.renderer.setSize(800, 500, false); bm.composer.setSize(800, 500);
  bm.camera.aspect = 1.6; bm.camera.updateProjectionMatrix();
  bm.hud.hud.classList.add('hidden');
  const near = [...P.byBox.values()].filter((q) => !q.broken).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)).slice(0, n);
  let [ex, ey, ez] = at;
  if (ey == null) ey = Math.max(ph.groundAt(ex, ez), ph.floorAt(ex, ez, ph.groundAt(ex, ez) + 1.5, 0.3, 0.2));
  const yaw = Math.atan2(-(x - ex), -(z - ez)), pitch = -0.35;
  const run = async (frames, name) => {
    for (let i = 0; i < frames; i++) { p.pos.set(ex, ey, ez); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; bm.vm.scene.visible = false; bm.tick(1 / 60); }
    if (name) await fetch(`/shot?name=${prefix}_${name}`, { method: 'POST', body: (() => { const b = atob(document.getElementById('game').toDataURL('image/png').split(',')[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; })() });
  };
  await run(30, 'a_before');
  const progs = bm.renderer.info.programs.length, loot0 = L.list.length;
  for (const q of near) P.hit(q.box, 999, { x: q.x - ex, y: 0, z: q.z - ez });
  await run(14, 'b_flying');
  await run(150);
  // (settled: the loot's glow hidden, from closer, so the pieces themselves can be seen)
  const lootVis = L.group.visible;
  L.group.visible = false;
  const cx = near.reduce((a, q) => a + q.x, 0) / near.length, cz = near.reduce((a, q) => a + q.z, 0) / near.length;
  const d = Math.hypot(cx - ex, cz - ez), k = Math.min(1, 2.2 / d);
  const sx = cx + (ex - cx) * k, sz = cz + (ez - cz) * k, sy = Math.max(ph.groundAt(sx, sz), ph.floorAt(sx, sz, ph.groundAt(sx, sz) + 1.5, 0.3, 0.2));
  for (let i = 0; i < 4; i++) { p.pos.set(sx, sy, sz); p.vel.set(0, 0, 0); p.yaw = Math.atan2(-(cx - sx), -(cz - sz)); p.pitch = -0.6; bm.vm.scene.visible = false; bm.tick(1 / 60); }
  await fetch(`/shot?name=${prefix}_c_settled`, { method: 'POST', body: (() => { const b = atob(document.getElementById('game').toDataURL('image/png').split(',')[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; })() });
  L.group.visible = lootVis;
  const resting = P.shards.filter((s) => s.rest && !s.settle).length;
  const out = { broke: near.map((q) => q.id), spilt: L.list.length - loot0, newPrograms: bm.renderer.info.programs.length - progs,
    searchable: near.map((q) => !!L.aimed && L.containers.find((c) => c.id === q.id && c.index === q.i)?.broken), shards: P.shards.length, resting };
  bm.hud.hud.classList.remove('hidden'); bm.vm.scene.visible = true;
  return out;
}

/** Draw calls and triangles for one frame (every pass, shadows included) seen from a few places:
 * the village street, the store's room, the catacombs, the downs. */
export function drawCalls() {
  const bm = window.bellmourn, p = bm.player, r = bm.renderer, ph = bm.physics;
  const spots = { village: [10, null, 18, -Math.PI / 2, 0, 13], store: [23.6, null, -15.6, -1.9, -0.1, 13], catacombs: [41, -21, -277, -Math.PI / 2, 0, 22], downs: [704, null, -14, -1.0, 0.1, 13] };
  const out = {};
  for (const [k, [x, y0, z, yaw, pitch, hour]] of Object.entries(spots)) {
    const y = y0 ?? Math.max(ph.groundAt(x, z), ph.floorAt(x, z, ph.groundAt(x, z) + 1.5, 0.3, 0.2));
    bm.setHour?.(hour);
    for (let i = 0; i < 30; i++) { p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; bm.tick(1 / 60); }
    r.info.autoReset = false; r.info.reset();
    p.pos.set(x, y, z); bm.tick(1 / 60);
    out[k] = { calls: r.info.render.calls, tris: r.info.render.triangles };
    r.info.autoReset = true;
  }
  return out;
}
