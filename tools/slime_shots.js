// Views of the slimes (src/fps/slimes.js) for review, saved to art/view/shots/<prefix>_<name>.png.
// Steps the game by hand, so it works with the browser pane hidden. In the page, once loaded:
//   (await import('/tools/slime_shots.js')).lineup('s1')    every kind side by side, by day and in the dark
//   (await import('/tools/slime_shots.js')).homes('s1')     where they live, as you'd come on them
//   (await import('/tools/slime_shots.js')).fight('s1')     a pounce, a stick, a blow, a pop, a split
//   (await import('/tools/slime_shots.js')).census()        how many, where, of what
const bm = () => window.bellmourn;

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
  const sized = [];
  b.scene.traverse((o) => {   // (the particles' size goes by the canvas: keep them right for this one)
    const u = o.isPoints && o.material?.uniforms?.scale;
    if (!u) return;
    sized.push([u, Object.getOwnPropertyDescriptor(u, 'value')]);
    Object.defineProperty(u, 'value', { configurable: true, get: () => (h / 2) * b.camera.projectionMatrix.elements[5], set: () => {} });
  });
  return () => { for (const [u, d] of sized) Object.defineProperty(u, 'value', d); b.hud.hud.classList.remove('hidden'); b.vm.scene.visible = true; };
}

/** n frames with the eye held at (x, y, z) looking at (lx, ly, lz); you can't be hurt meanwhile. */
function hold(n, at, look, dt = 1 / 60) {
  const b = bm(), p = b.player;
  const [x, y, z] = at, [lx, ly, lz] = look;
  const yaw = Math.atan2(-(lx - x), -(lz - z)), pitch = Math.atan2(ly - (y + 1.7), Math.hypot(lx - x, lz - z));
  for (let i = 0; i < n; i++) { p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; p.health = p.maxHealth; p.heldT = 0; b.tick(dt); }
}

const ground = (x, z) => { const ph = bm().physics; return Math.max(ph.groundAt(x, z), ph.floorAt(x, z, ph.groundAt(x, z) + 1.5, 0.3, 0.2)); };
/** Stood still where they are (posed, breathing; no brain). */
function still(s) { s.think = function () { this.ground(); this.sqTo = 1 + 0.03 * Math.sin(this.owner.time * 2.2 + this.wobP); }; s.sense = () => {}; return s; }

export async function lineup(prefix = 's', { dark = true } = {}) {
  const b = bm(), S = b.slimes, undo = setup();
  const kinds = Object.keys((await import('/src/fps/slimes.js')).SPECIES);
  const P0 = b.programs0 ?? b.renderer.info.programs.length;
  const shots = [];
  const row = async (name, x0, z0, hour, sizes, cave = null) => {
    b.setHour(hour);
    const made = [];
    kinds.forEach((k, i) => {
      const x = x0 + (i - (kinds.length - 1) / 2) * 2.2, z = z0;
      for (const [j, size] of sizes(k).entries()) {
        const zz = z - j * 2.4;
        const y = cave ? cave.rockAt(x, zz, {})?.floor ?? ground(x, zz) : ground(x, zz);
        made.push(still(S.spawn(k, size, new window.THREE_V(x, y, zz), cave ? { dg: { rock: cave } } : {})));
      }
    });
    const ey = cave ? cave.rockAt(x0, z0 + 7, {})?.floor ?? ground(x0, z0 + 7) : ground(x0, z0 + 7);
    hold(50, [x0, ey, z0 + 7], [x0, ey + 0.3, z0 - 1.5]);
    await shoot(`${prefix}_lineup_${name}`); shots.push(name);
    for (const s of made) { s.remove(); }
    S.list = S.list.filter((s) => !s.gone);
  };
  window.THREE_V = window.THREE_V || (await import('three')).Vector3;
  const sz = { mire: ['M', 'L'], bog: ['M', 'L'], azure: ['S', 'M'], crimson: ['M', 'L'], amber: ['M', 'L'], violet: ['XS', 'S'], toxic: ['XS', 'S'], pitch: ['M', 'L'], ossuary: ['M', 'L'] };
  await row('day', 360, -30, 13, (k) => sz[k]);
  if (dark) {
    const c = b.ctx.caves.find((cv) => cv.name === 'The Gloamhollow'), room = c.features.find((f) => f.tag === 'cavern');
    await row('cave', c.px + room.a, c.pz + room.b - 2, 22, (k) => [sz[k][0]], c);
  }
  undo();
  return { shots, newPrograms: b.renderer.info.programs.length - P0 };
}

/** Each place they live, from a few metres off the middle of them. */
export async function homes(prefix = 's', { only = null, hide = null } = {}) {
  const b = bm(), S = b.slimes, undo = setup();
  // (hide: 'shadows' or 'all', to see what is theirs in a picture)
  if (hide) { S.goo.shadows.visible = false; if (hide === 'all') { S.goo.splats.visible = S.goo.chunks.visible = S.goo.points.visible = false; for (const s of S.list) s.root.visible = false; S.update = function () {}; } }
  const groups = new Map();
  for (const s of S.list) {
    const key = s.cave ? `${s.cave.name}:${s.cave.tagAt(s.home)}` : `wild:${Math.round(s.home.x)},${Math.round(s.home.z)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const out = [];
  for (const [key, list] of groups) {
    if (only && !only.some((o) => key.toLowerCase().replace(/[^\w]+/g, '_').includes(o))) continue;
    const cx = list.reduce((a, s) => a + s.pos.x, 0) / list.length, cz = list.reduce((a, s) => a + s.pos.z, 0) / list.length;
    const cave = list[0].cave;
    // stand off 7 m, on open floor
    let at = null;
    for (let i = 0; i < 24 && !at; i++) {
      const a = i / 24 * Math.PI * 2, x = cx + Math.cos(a) * 7, z = cz + Math.sin(a) * 7;
      if (cave) { const r = cave.rockAt(x, z, {}); if (r && r.s < -0.6) at = [x, r.floor, z]; }
      else at = [x, ground(x, z), z];
    }
    if (!at) continue;
    b.setHour(cave ? 22 : 15);
    const ly = list.reduce((a, s) => a + s.pos.y, 0) / list.length;
    hold(40, at, [cx, ly + 0.4, cz]);
    const name = key.replace(/[^\w]+/g, '_').toLowerCase();
    await shoot(`${prefix}_home_${name}`);
    out.push([name, list.length]);
  }
  undo();
  return out;
}

/** A fight out on the meadow: a pounce, a blow, a pop, a big one coming apart; an azure jelly
 * sticking to the cliff by the falls; one dropping from a cave's roof. Reports what new shaders it
 * took (none, if the rehearsal did its work). */
export async function fight(prefix = 's') {
  const b = bm(), S = b.slimes, undo = setup();
  const V = (await import('three')).Vector3;
  const P0 = b.renderer.info.programs.length;
  const out = { shots: [] };
  const snap = async (n) => { await shoot(`${prefix}_fight_${n}`); out.shots.push(n); };
  // the pounce
  b.setHour(14);
  const ex = 360, ez = -10, ey = ground(ex, ez);
  const mire = S.spawn('mire', 'M', new V(ex, ground(ex, ez - 4.5), ez - 4.5));
  mire.aggro = true; mire.canSee = true; mire.hasLast = true; mire.last.set(ex, ey, ez); mire.atkCool = 0; mire.wait = 0; mire.t = 1;
  mire.sense = function () { this.canSee = true; this.aggro = true; this.last.copy(b.player.pos); this.lastT = this.owner.time; };
  let pounced = false;
  for (let i = 0; i < 90 && !pounced; i++) { hold(1, [ex, ey, ez], [ex, ey + 0.6, ez - 4]); if (mire.state === 'crouch') { await snap('a_crouch'); pounced = true; } }
  for (let i = 0; i < 40; i++) { hold(1, [ex, ey, ez], [ex, ey + 0.6, ez - 4]); if (mire.state === 'air' && mire.vel.y < 1) { await snap('b_pounce'); break; } }
  hold(30, [ex, ey, ez], [ex, ey + 0.6, ez - 3]);
  // the blow and the pop (sat on the ground 3 m in front)
  mire.state = 'idle'; mire.think = function () { this.ground(); }; mire.sense = () => {}; mire.aggro = false;
  mire.vel.set(0, 0, 0); mire.n.set(0, 1, 0); mire.pos.set(ex, ground(ex, ez - 3), ez - 3);
  const look = [mire.pos.x, mire.pos.y + 0.35, mire.pos.z];
  hold(20, [ex, ey, ez], look);
  mire.hit({ point: mire.center(new V()), bone: mire.core, z: mire }, { dmg: 20, dir: new V(0, -0.2, -1).normalize(), heavy: true, kind: 'blade' });
  hold(3, [ex, ey, ez], look); await snap('c_struck');
  hold(20, [ex, ey, ez], look);
  mire.hit({ point: mire.center(new V()), bone: mire.core, z: mire }, { dmg: 99, dir: new V(0, -0.2, -1).normalize(), heavy: true, kind: 'blade' });
  hold(7, [ex, ey, ez], look); await snap('d_pop');
  hold(10, [ex, ey, ez], look); await snap('e_pop2');
  hold(60, [ex, ey, ez], look); await snap('f_after');
  // a big one comes apart
  const cr = S.spawn('crimson', 'XL', new V(ex + 1, ground(ex + 1, ez - 6), ez - 6));
  cr.think = function () { this.ground(); };
  hold(20, [ex, ey, ez], [ex + 1, ey + 0.8, ez - 6]); await snap('g_big');
  cr.hit({ point: cr.center(new V()), bone: cr.core, z: cr }, { dmg: 999, dir: new V(0, 0, -1), heavy: true, kind: 'lightning' });
  hold(8, [ex, ey, ez], [ex + 1, ey + 0.8, ez - 6]); await snap('h_split');
  hold(30, [ex, ey, ez], [ex + 1, ey + 0.5, ez - 6]); await snap('i_split2');
  out.split = S.list.filter((s) => s.key === 'crimson' && s.size === 'M' && Math.hypot(s.pos.x - ex - 1, s.pos.z - ez + 6) < 8).length;
  for (const s of S.list) if (s.key === 'crimson' && s.size === 'M' && Math.hypot(s.pos.x - ex - 1, s.pos.z - ez + 6) < 12) s.remove();
  S.list = S.list.filter((s) => !s.gone);
  // a jelly on the cliff by the falls
  b.setHour(15);
  const fx = 712, fz = -58, fy = ground(fx, fz);
  const az = S.spawn('azure', 'M', new V(fx, fy, fz));
  az.aggro = false;
  let stuck = false;
  for (let i = 0; i < 400 && !stuck; i++) {
    if (az.state === 'idle') az.t = az.wait + 1;
    hold(1, [fx - 9, ground(fx - 9, fz), fz], [fx + 8, fy + 3, fz]);
    if (az.state === 'cling' && Math.abs(az.n.y) < 0.6) stuck = true;
  }
  out.cliffStuck = stuck;
  if (stuck) {   // from 4 m out from the face it's stuck to
    const cx = az.pos.x + az.n.x * 4, cz = az.pos.z + az.n.z * 4;
    az.think = function () {};
    hold(10, [cx, ground(cx, cz), cz], [az.pos.x, az.pos.y, az.pos.z]); await snap('j_cliff');
  }
  // one hanging from a cave's roof, then dropping
  const c = b.ctx.caves.find((cv) => cv.name === 'The Gloamhollow');
  const room = c.features.find((f) => f.tag === 'cavern');
  const gx = c.px + room.a + 3, gz = c.pz + room.b + 2, gy = c.rockAt(gx, gz, {}).floor;
  b.setHour(22);
  const dg = b.ctx.unders.find((u) => u.dg?.rock === c).dg;
  const vi = S.spawn('violet', 'S', new V(gx, gy, gz), { dg });
  S.hang(vi, gx, gz);
  vi.sense = function () { this.canSee = true; this.aggro = true; this.last.copy(b.player.pos); this.lastT = this.owner.time; };
  hold(20, [gx - 5, c.rockAt(gx - 5, gz, {}).floor, gz], [vi.pos.x, vi.pos.y - 0.3, vi.pos.z]); await snap('k_roof');
  let dropped = false;
  for (let i = 0; i < 400 && !dropped; i++) { hold(1, [gx, gy, gz], [gx + 2, gy + 4, gz]); if (vi.state === 'drip') { dropped = true; } }
  out.roofDrip = dropped;
  if (dropped) {   // (from beside where it hangs: you've stepped out from under it)
    const at = [vi.pos.x - 4, c.rockAt(vi.pos.x - 4, vi.pos.z, {})?.floor ?? gy, vi.pos.z], top = vi.pos.clone();
    vi.sense = function () { this.canSee = true; this.aggro = true; this.last.set(top.x, gy, top.z); };
    for (let i = 0; i < 14; i++) hold(1, at, [top.x, top.y - 0.8, top.z]);
    await snap('l_drip');
    for (let i = 0; i < 16; i++) hold(1, at, [top.x, (top.y + gy) / 2, top.z]);
    await snap('m_drop');
  }
  out.newPrograms = b.renderer.info.programs.length - P0;
  undo();
  return out;
}

export function census() {
  const S = bm().slimes, out = {};
  for (const s of S.list) {
    const where = s.cave ? s.cave.name : `wild ${Math.round(s.home.x)},${Math.round(s.home.z)}`;
    out[where] ||= {};
    const k = `${s.key} ${s.size}`;
    out[where][k] = (out[where][k] || 0) + 1;
  }
  return { total: S.list.length, out };
}

/** Five seconds stood among a few of them on the meadow (do they reach you, and how hard?); a
 * sword swing at the nearest (does the blade find it?); what their update costs a frame, there
 * and in the Trollhole's grove. */
export async function duel() {
  const b = bm(), S = b.slimes, p = b.player, V = (await import('three')).Vector3;
  b.begin?.();
  b.setHour(14);
  const ex = 360, ez = -10, ey = ground(ex, ez);
  const made = [['mire', 'M', -3, -4], ['bog', 'L', 3, -5], ['toxic', 'S', 0, -6], ['crimson', 'L', -4, 3], ['amber', 'M', 4, 2]]
    .map(([k, size, dx, dz]) => S.spawn(k, size, new V(ex + dx, ground(ex + dx, ez + dz), ez + dz)));
  let hits = 0, dmg = 0, held = 0;
  const was = S.onPlayerHit;
  S.onPlayerHit = (d) => { hits++; dmg += d; };
  let cost = 0;
  const upd = S.update;
  S.update = function (...a) { const t = performance.now(); upd.apply(this, a); cost += performance.now() - t; };
  for (let i = 0; i < 300; i++) { p.pos.set(ex, ey, ez); p.vel.set(0, 0, 0); p.health = p.maxHealth; if (p.heldT > 0) held++; b.tick(1 / 60); }
  const near = { slimes: S.list.filter((s) => s.pos.distanceTo(p.pos) < 30).length, msPerFrame: +(cost / 300).toFixed(3) };
  S.onPlayerHit = was;
  // a swing: face the nearest and cut
  const t = made.filter((s) => !s.dead).sort((a, c) => a.pos.distanceTo(p.pos) - c.pos.distanceTo(p.pos))[0];
  let melee = null;
  if (t) {
    for (const s of made) if (s !== t && !s.gone) s.remove();   // (nothing else in the blade's way)
    t.think = function () { this.ground(); }; t.state = 'idle'; t.vel.set(0, 0, 0); t.n.set(0, 1, 0);
    t.pos.set(ex, ground(ex, ez - 2), ez - 2);
    const c = t.center(new V());
    p.yaw = Math.atan2(-(c.x - ex), -(c.z - ez)); p.pitch = Math.atan2(c.y - (ey + 1.7), Math.hypot(c.x - ex, c.z - ez));
    for (let i = 0; i < 3; i++) { p.pos.set(ex, ey, ez); p.vel.set(0, 0, 0); b.tick(1 / 60); }
    const hp = t.hp;
    b.melee(3.5, true);
    melee = { kind: t.key, hpBefore: Math.round(hp), hpAfter: Math.round(t.hp), dead: t.dead };
  }
  for (const s of made) if (!s.gone) s.remove();
  for (const s of S.list) if (!s.gone && s.home.distanceTo(new V(ex, ey, ez)) < 12 && !s.cave) s.remove();
  S.list = S.list.filter((s) => !s.gone);
  // the grove's own, from its middle
  const c = b.ctx.caves.find((cv) => cv.name === 'The Trollhole'), room = c.features.find((f) => f.tag === 'grove');
  const gx = c.px + room.a, gz = c.pz + room.b, gy = c.rockAt(gx, gz, {}).floor;
  cost = 0;
  for (let i = 0; i < 300; i++) { p.pos.set(gx, gy, gz); p.vel.set(0, 0, 0); p.health = p.maxHealth; b.tick(1 / 60); }
  const grove = { slimes: S.list.filter((s) => s.pos.distanceTo(p.pos) < 30).length, msPerFrame: +(cost / 300).toFixed(3) };
  S.update = upd;
  return { hits, dmg: Math.round(dmg), heldFrames: held, meadow: near, melee, grove, total: S.list.length };
}

/** Frames of each way of moving (every `every` frames, `n` of them) from a fixed eye at the side,
 * for a contact sheet: a mire slime hopping after you, a bog ooze pouring after you; then the ground
 * each one crossed, from above (its trail). */
export async function motion(prefix = 's', { n = 20, every = 5 } = {}) {
  const b = bm(), S = b.slimes, p = b.player, V = (await import('three')).Vector3, undo = setup(640, 400);
  b.setHour(14);
  const out = {};
  const frame = (eye, look) => { b.camera.position.set(...eye); b.camera.lookAt(...look); b.camera.updateMatrixWorld(); b.composer.render(); };
  const run = async (name, s, eye, look, target) => {
    s.sense = function () { this.canSee = true; this.aggro = true; this.last.copy(target); this.hasLast = true; this.lastT = this.owner.time; };
    s.wait = 0; s.atkCool = 9;   // (on its way to you, not pouncing yet)
    const start = s.pos.clone();
    for (let i = 0; i < n * every; i++) {
      // (you stand at `target`; the eye is elsewhere, still, watching from the side)
      p.pos.copy(target); p.vel.set(0, 0, 0); p.health = p.maxHealth; p.heldT = 0;
      b.tick(1 / 60);
      frame(eye, look);
      if (i % every === every - 1) await shoot(`${prefix}_motion_${name}_${String(i / every | 0).padStart(2, '0')}`);
    }
    out[name] = { state: s.state, moved: +s.pos.distanceTo(start).toFixed(2) };
    // the way it came, from above
    const mid = start.clone().lerp(s.pos, 0.5);
    s.remove(); S.list = S.list.filter((q) => !q.gone);
    for (let i = 0; i < 3; i++) { p.pos.copy(target); b.tick(1 / 60); }
    frame([mid.x - 0.5, mid.y + 3.2, mid.z - 3.2], [mid.x, mid.y, mid.z]);
    await shoot(`${prefix}_trail_${name}`);
  };
  const ex = 360, ez = -10, gy = ground(ex, ez);
  const mire = S.spawn('mire', 'M', new V(ex - 5, ground(ex - 5, ez), ez));
  await run('hop', mire, [ex - 1, gy + 1.0, ez - 6.5], [ex - 1, gy + 0.6, ez], new V(ex + 4, ground(ex + 4, ez), ez));
  const bz = ez - 12;
  const bog = S.spawn('bog', 'L', new V(ex - 4, ground(ex - 4, bz), bz));
  await run('ooze', bog, [ex - 1.5, gy + 1.2, bz - 6], [ex - 1.5, gy + 0.3, bz], new V(ex + 5, ground(ex + 5, bz), bz));
  undo();
  return out;
}
