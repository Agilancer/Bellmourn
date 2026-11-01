// The portals (src/fps/portals.js) for review: views saved to art/view/shots/<prefix>_<name>.png, and a
// check of the whole round (walk up and wake one, stand on it, E, the window, a jump). Steps the game
// by hand, so it works with the browser pane hidden. In the page, once loaded:
//   (await import('/tools/portal_shots.js')).views('p1')    every seal asleep and awake, and a close look
//   (await import('/tools/portal_shots.js')).round()        walk up, wake, E, the window, travel: what happened ({ tag } names its snaps)
//   (await import('/tools/portal_shots.js')).census()       where they stand and what they cost
// (window.cdpSnap(name), where a harness gives it, captures the whole screen: the window included.)
const bm = () => window.bellmourn;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function pngOf(cv) {
  const bin = atob(cv.toDataURL('image/png').split(',')[1]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
async function shoot(name) { await fetch(`/shot?name=${name}`, { method: 'POST', body: pngOf(document.getElementById('game')) }); }

/** Ready for pictures: playing, the hands and the HUD away, the canvas a fixed size; returns undo. */
function setup(w = 960, h = 560) {
  const b = bm();
  b.begin?.();
  b.renderer.setSize(w, h, false); b.composer.setSize(w, h);
  b.camera.aspect = w / h; b.camera.updateProjectionMatrix(); b.vm.resize?.(w / h);
  b.hud.hud.classList.add('hidden');
  b.vm.scene.visible = false;
  return () => { b.hud.hud.classList.remove('hidden'); b.vm.scene.visible = true; };
}

/** n frames with the feet held at (x, y, z), looking at (lx, ly, lz). */
function hold(n, at, look, dt = 1 / 60) {
  const b = bm(), p = b.player;
  const [x, y, z] = at, [lx, ly, lz] = look;
  const yaw = Math.atan2(-(lx - x), -(lz - z)), pitch = Math.atan2(ly - (y + 1.72), Math.hypot(lx - x, lz - z));
  for (let i = 0; i < n; i++) { p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; p.health = p.maxHealth; b.tick(dt); }
}
const floor = (x, z) => { const ph = bm().physics; return ph.floorAt(x, z, ph.groundAt(x, z) + 1, 0.3, 1.2); };

/** Each seal from where you'd come on it (what it serves behind it), asleep then awake; a look
 * down at one from its rim; the village's at night. */
export async function views(prefix = 'p', { only = null } = {}) {
  const b = bm(), P = b.ctx.portals, undo = setup(), keep = P.save(), hour = b.hour;
  const P0 = b.renderer.info.programs.length, shots = [];
  b.setHour(13);
  for (const p of P.list) {
    if (only && !only.includes(p.id)) continue;
    P.load([]);
    // (7.5 m back from it, the far side from what it faces: just out of its waking reach)
    const dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw);
    const ex = p.x - dx * 7.5, ez = p.z - dz * 7.5;
    hold(40, [ex, floor(ex, ez), ez], [p.x + dx * 2, p.y + 0.2, p.z + dz * 2]);
    await shoot(`${prefix}_${p.id}_asleep`); shots.push(`${p.id}_asleep`);
    P.wake(p, true);
    hold(40, [ex, floor(ex, ez), ez], [p.x + dx * 2, p.y + 0.2, p.z + dz * 2]);
    await shoot(`${prefix}_${p.id}_awake`); shots.push(`${p.id}_awake`);
  }
  // close: from beside the rim, looking down across it
  const v = P.list[0];
  const cx = v.x + 3.4, cz = v.z + 2.2;
  // (woken quietly and left to settle: no flash, no sparks still in the air)
  P.load([v.id]);
  hold(200, [cx, floor(cx, cz), cz], [v.x - 0.4, v.y + 0.6, v.z - 0.2]);
  await shoot(`${prefix}_close_awake`); shots.push('close_awake');
  P.load([]); P.noWake = true;
  hold(200, [cx, floor(cx, cz), cz], [v.x - 0.4, v.y + 0.6, v.z - 0.2]);
  await shoot(`${prefix}_close_asleep`); shots.push('close_asleep');
  // the wake: a few moments into it
  P.noWake = false;
  P.wake(v);
  for (const [n, name] of [[30, 'wake_0.5s'], [60, 'wake_1.5s'], [90, 'wake_3s']]) { hold(n, [cx, floor(cx, cz), cz], [v.x - 0.4, v.y + 0.6, v.z - 0.2]); await shoot(`${prefix}_${name}`); shots.push(name); }
  // the village's at night, from across the square
  b.setHour(23);
  hold(60, [v.x + 9, 0, v.z + 12], [v.x, v.y + 0.6, v.z]);
  await shoot(`${prefix}_bellmourn_night`); shots.push('bellmourn_night');
  b.setHour(hour);
  P.load(keep);
  undo();
  return { shots, newPrograms: b.renderer.info.programs.length - P0 };
}

/** The whole round, as a player would do it; reports what happened at each step. */
export async function round({ tag = '' } = {}) {
  const b = bm(), P = b.ctx.portals, inp = b.input(), out = {};
  b.begin?.();
  const P0 = b.renderer.info.programs.length;
  P.load([]);
  const home = P.list.find((p) => p.id === 'bellmourn'), far = P.list.find((p) => p.id === 'millhaven');
  // walk up from 20 m off: where does it wake?
  let wokeAt = null;
  for (let d = 20; d > 0 && wokeAt === null; d -= 0.25) {
    hold(1, [home.x, 0, home.z - d], [home.x, 0.5, home.z]);
    if (P.found.has(home.id)) wokeAt = d;
  }
  out.wokeAt = wokeAt;
  out.banner = b.hud.banner?.textContent?.trim().replace(/\s+/g, ' ');
  // onto it: the prompt
  hold(30, [home.x + 0.5, floor(home.x + 0.5, home.z + 0.5), home.z + 0.5], [home.x, home.y + 1.5, home.z + 5]);
  out.standing = P.standing?.id || null;
  out.prompt = b.hud.promptEl?.textContent;
  // E: the window, with nothing else awake
  inp.pressed.add('KeyE'); b.tick(1 / 60);
  const panel = () => document.querySelector('.panel.portals');
  out.openAlone = !panel().classList.contains('hidden');
  out.textAlone = panel().innerText.replace(/\s+/g, ' ').slice(0, 600);
  out.travelButtons = panel().querySelectorAll('button.p-row').length;
  window.cdpSnap?.('portal_menu_alone' + tag); await wait(1200);
  // E again closes it; Esc closes it too (and pauses, as the map does)
  inp.pressed.add('KeyE'); b.tick(1 / 60);
  out.eCloses = panel().classList.contains('hidden');
  inp.pressed.add('KeyE'); b.tick(1 / 60);
  out.eReopens = !panel().classList.contains('hidden');
  inp.pressed.add('Escape'); b.tick(1 / 60);
  out.escCloses = panel().classList.contains('hidden');
  b.begin();   // (resume)
  // another woken far off, and the window again
  P.wake(far, true); P.wake(P.list.find((p) => p.id === 'keep'), true);
  hold(2, [home.x + 0.5, floor(home.x + 0.5, home.z + 0.5), home.z + 0.5], [home.x, home.y + 1.5, home.z + 5]);
  inp.pressed.add('KeyE'); b.tick(1 / 60);
  out.travelButtons2 = panel().querySelectorAll('button.p-row').length;
  out.rows = [...panel().querySelectorAll('.p-row')].map((r) => (r.classList.contains('locked') ? '(locked) ' : '') + r.querySelector('b').textContent);
  window.cdpSnap?.('portal_menu' + tag); await wait(1200);
  // travel to Millhaven
  const btn = [...panel().querySelectorAll('button.p-row')].find((r) => r.textContent.includes('Millhaven'));
  btn.click();
  out.closedOnPick = panel().classList.contains('hidden');
  const at = b.player.pos;
  out.arrived = [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)];
  out.target = [far.x, +(far.y + (await import('/src/fps/portals.js')).SEAL_H).toFixed(2), far.z];
  out.yaw = +b.player.yaw.toFixed(2);
  for (let i = 0; i < 40; i++) b.tick(1 / 60);
  out.after = [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)];
  out.standingAfter = P.standing?.id || null;
  out.zone = b.hud.zoneEl?.textContent;
  try { out.saved = JSON.parse(localStorage.getItem('bm.progress')).portals; } catch { out.saved = 'none'; }
  window.cdpSnap?.('portal_arrived' + tag); await wait(1200);
  out.newPrograms = b.renderer.info.programs.length - P0;
  // a load puts them back as saved
  P.load(['bellmourn']);
  out.afterLoad = P.save();
  return out;
}

/** Where each stands, its ground, what's on it, and what they cost to draw. */
export function census() {
  const b = bm(), P = b.ctx.portals, ph = b.physics;
  const list = P.list.map((p) => {
    const boxes = [...ph.near(p.x - 3, p.z - 3, p.x + 3, p.z + 3)].filter((q) => !q.seg && q.tag !== 'portal' && q.max[1] > p.y + 0.42 && q.min[1] < p.y + 2
      && q.max[0] > p.x - 2.6 && q.min[0] < p.x + 2.6 && q.max[2] > p.z - 2.6 && q.min[2] < p.z + 2.6);
    const g = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ph.groundAt(p.x + Math.cos(k * 0.785) * 2.6, p.z + Math.sin(k * 0.785) * 2.6));
    return { id: p.id, at: [p.x, +p.y.toFixed(2), p.z], yaw: +p.yaw.toFixed(2), groundSpread: +(Math.max(...g) - Math.min(...g)).toFixed(3), inTheWay: boxes.map((q) => q.src || q.tag) };
  });
  return { list, meshes: [P.top, P.lip, P.side, P.column, P.motes].map((m) => m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count) };
}
