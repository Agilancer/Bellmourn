// The ways under the ground, walked: the player's own movement (fixed 1/60 s steps, forward held,
// steered through waypoints) down every stair and into and back out of every cave, and in each
// place the farthest of its dead told where he is, to see it come for him along the corridors.
//
//   node tools/world/walkthrough.cjs <port> [three_dir]
//
// Serve the repo first (python tools/serve.py <port>). three_dir, if given, is an unpacked `three`
// npm package that stands in for the CDN. Prints each walk (OK, or where it stopped) and each
// chase (corridor steps to you before and after 45 s); exits 1 if a walk failed.
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const [port, three] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  if (three) {
    await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (route) => {
      route.fulfill({ path: path.join(three, route.request().url().split('three@0.170.0/')[1]), contentType: 'application/javascript' });
    });
  }
  let errors = 0;
  page.on('pageerror', (e) => { errors++; console.log('PAGE ERROR', e.message); });
  await page.addInitScript(() => { localStorage.setItem('bm.quality', 'low'); localStorage.setItem('bm.pix', '6'); });
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => window.bellmourn || window.bootError, null, { timeout: 900000 });
  const out = await page.evaluate(async () => {
    const b = window.bellmourn, ctx = b.ctx, p = b.player, zs = b.zombies;
    b.begin(); b.setHour(12);
    zs.onPlayerHit = () => {};
    const zoneName = () => ctx.unders.find((u) => u.dg.contains(p.pos))?.dg.name || 'surface';
    const fwd = { look: [0, 0], axes: () => [0, 1], held: () => false, was: () => false, stickRun: false };
    // walk through waypoints [[x, z], ...]; report where it ends and if it ever stalled
    const walk = (start, pts, limit = 90) => {
      p.pos.set(start[0], start[1], start[2]); p.vel.set(0, 0, 0); p.onGround = true;
      let i = 0, t = 0, stall = 0, minY = p.pos.y, log = [];
      let last = p.pos.clone();
      while (i < pts.length && t < limit) {
        const [x, z] = pts[i], dx = x - p.pos.x, dz = z - p.pos.z;
        if (Math.hypot(dx, dz) < 0.6) { i++; log.push(`wp${i}@${p.pos.x.toFixed(1)},${p.pos.y.toFixed(2)},${p.pos.z.toFixed(1)}`); continue; }
        p.yaw = Math.atan2(-dx, -dz);
        p.update(1 / 60, fwd);
        t += 1 / 60;
        minY = Math.min(minY, p.pos.y);
        if (Math.round(t * 60) % 60 === 0) {
          if (p.pos.distanceTo(last) < 0.3) { stall++; if (stall > 3) break; } else stall = 0;
          last = p.pos.clone();
        }
      }
      return { reached: i, of: pts.length, end: [p.pos.x, p.pos.y, p.pos.z].map((v) => +v.toFixed(2)), minY: +minY.toFixed(2), secs: +t.toFixed(1), zone: zoneName(), log };
    };
    const R = {};
    const u = (name) => ctx.unders.find((q) => q.dg.name === name).dg;
    // the delves: from outside the stair-house door, in, down the flight, into the entry hall
    const n = Math.round(14 / 0.25), run = n * 0.34;
    for (const [key, x, z] of [['barrow', -180, 46], ['cellars', 150, 186]]) {
      R[key] = walk([x, 0, z + 9], [[x, z + 4], [x, z + 0.5], [x, z - run + 0.3], [x, z - run - 6]]);
    }
    // the Undercroft: down from the cathedral office's stair-house into the entry hall, then across
    // to the stair hall and down the stairwell into the Deep Undercroft
    const sb = ctx.stairBottom, sd = ctx.dungeon.stairDown;
    R.undercroft = walk([5.0, 0.6, -92.5], [[5.0, -94.5], [sb.x, sb.z + 0.3], [sb.x, sb.z - 6]]);
    const wellTop = sd.z + 48 * 0.34;
    R.deep = walk([sd.x, -14, wellTop + 2], [[sd.x, wellTop - 0.3], [sd.x, sd.z + 0.3], [sd.x, sd.z - 6]]);
    // the caves: from the grass before each mouth into its first chamber
    for (const c of ctx.caves) {
      const f = c.features, first = f.find((q) => q.type === 'room');
      const ent = f[0].pts.map(([a, bb]) => [c.px + a, c.pz + bb]);
      R[c.name] = walk([c.px - 9, b.physics.groundAt(c.px - 9, c.pz), c.pz], [[c.px - 7, c.pz], ...ent, [c.px + first.a, c.pz + first.b]]);
      // and back out again (up the slope through the mouth)
      R[c.name + ' (out)'] = walk([p.pos.x, p.pos.y, p.pos.z], [...ent.slice().reverse(), [c.px - 7, c.pz]]);
    }
    // back up out of the Deep Undercroft
    R['deep (up)'] = walk([sd.x, -26, sd.z - 4], [[sd.x, sd.z - 0.3], [sd.x, wellTop + 0.3], [sd.x, wellTop + 1.5]]);
    // the chase: in each place, the farthest of its dead is told where you are; after 30 s (simulated,
    // the whole horde updating) how close has it come?
    const chase = (dg, at) => {
      p.pos.set(at[0], at[1], at[2]); p.vel.set(0, 0, 0);
      const mine = zs.list.filter((z) => z.dg === dg && !z.dead && z.state !== 'buried');
      if (!mine.length) return 'none here';
      const far = mine.reduce((m, z) => (z.pos.distanceTo(p.pos) > m.pos.distanceTo(p.pos) ? z : m));
      if (far.state === 'playdead') far.wake(p.pos); else far.hunt(p.pos, true);
      // corridor steps from you to it (the nearest walkable cell about it)
      const steps = () => { let m = Infinity; for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) m = Math.min(m, zs.flowAt({ x: far.pos.x + dx, z: far.pos.z + dz }, dg)); return m; };
      zs.update(1 / 30, p, true, b.camera, 1.6, 1);
      const s0 = steps(), d0 = far.pos.distanceTo(p.pos);
      let best = d0;
      for (let s = 0; s < 45 * 30; s++) { zs.update(1 / 30, p, true, b.camera, 1.6, 1); best = Math.min(best, far.pos.distanceTo(p.pos)); if (best < 2) break; }
      const after = steps();
      return { kind: far.variant, metres: +d0.toFixed(1), stepsFrom: s0, stepsAfter: Number.isFinite(after) ? after : null, closest: +best.toFixed(1), state: far.state, goal: far.goal };
    };
    const room = (dg, i) => { const r = dg.roomList[i]; return [(r.x0 + r.x1) / 2, dg.y, (r.z0 + r.z1) / 2]; };
    const C = {};
    C.undercroft = chase(u('The Undercroft'), room(u('The Undercroft'), 0));
    C.deep = chase(u('The Deep Undercroft'), room(u('The Deep Undercroft'), 0));
    C.barrow = chase(u('The Barrow of Saint Ivo'), room(u('The Barrow of Saint Ivo'), 0));
    for (const c of ctx.caves) {
      const dg = ctx.unders.find((q) => q.dg.name === c.name && q.dg.cave)?.dg;
      const s = c.spot(c.features.find((q) => q.type === 'room').tag, 1.0);
      if (dg && s) C[c.name] = chase(dg, [s.x, s.y, s.z]);
    }
    return { walks: R, chases: C };
  });
  let failed = errors;
  for (const [k, v] of Object.entries(out.walks)) {
    const ok = v.reached === v.of;
    if (!ok) failed++;
    console.log(`walk  ${ok ? 'OK  ' : 'FAIL'} ${k.padEnd(28)} ${ok ? '' : `stopped at ${v.end.join(', ')} after waypoint ${v.reached}/${v.of}`}`);
  }
  for (const [k, v] of Object.entries(out.chases)) {
    console.log(`chase ${k.padEnd(28)} ${typeof v === 'string' ? v : `${v.kind}: ${v.stepsFrom} -> ${v.stepsAfter ?? '(you, shoved off the grid by the others)'} steps, ${v.metres} -> ${v.closest} m`}`);
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
