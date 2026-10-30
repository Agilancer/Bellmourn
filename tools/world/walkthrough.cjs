// The ways under the ground, walked: the player's own movement (fixed 1/60 s steps, forward held,
// steered through waypoints) down every stair and into and back out of every cave, and in each
// place the farthest of its dead told where he is, to see it come for him along the corridors;
// the headroom over every walkable metre below ground (nothing under 3 m); and how smoothly the
// eye rides a flight of stairs.
//
//   node tools/world/walkthrough.cjs <port> [three_dir]
//
// Serve the repo first (python tools/serve.py <port>). three_dir, if given, is an unpacked `three`
// npm package that stands in for the CDN. Prints each walk (OK, or where it stopped) and each
// chase (corridor steps to you before and after 45 s) and the lowest ceiling in each place; exits 1
// if a walk failed or a ceiling is low.
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
    // headroom: rays straight up from the floor at every walkable metre of the dungeons, down every
    // flight of stairs and over every walkable cell of the caves, against the stone itself (the
    // builders' meshes and the caves' rock: not props, sprites or the dead)
    // (the builders' masonry, the arches over the hallways and the caves' rock: furniture, props
    // and sprites are things you walk into, not ceilings)
    const stone = [...ctx.built];
    for (const a of ctx.cutouts?.placed || []) a.group?.traverse((o) => { if (o.isMesh) stone.push(o); });
    for (const c of ctx.caves) stone.push(c.mesh);
    const ray = new b.camera.position.constructor();          // (a Vector3)
    const caster = new (window.bellmourn.RaycasterClass)();
    const up = new b.camera.position.constructor(0, 1, 0);
    // (only an underside counts, more than 1.2 m up: anything lower is a thing standing on the
    // floor that the ray started beside, not a ceiling)
    const clear = (x, y, z, list = stone) => {
      caster.set(ray.set(x, y + 1.2, z), up); caster.far = 3;
      const hit = caster.intersectObjects(list, false).find((h) => !h.face || h.face.normal.clone().transformDirection(h.object.matrixWorld).y < -0.3);
      return hit ? hit.distance + 1.2 : Infinity;
    };
    // (a hit under 2.3 m over a walkable cell is the overhang of a piece of furniture beside you,
    // not a ceiling: the dungeons' rooms are 5 m, their halls 3.2, and the arches and stair vaults,
    // the only stone that can hang low, are sized to keep 3 m)
    const LOW = 3.0, FURNITURE = 2.3, H = {};
    const audit = (name, pts, list) => {
      let min = Infinity, at = null, low = 0, over = 0;
      for (const [x, y, z] of pts) {
        const c = clear(x, y, z, list);
        if (c < FURNITURE) { over++; continue; }
        if (c < LOW) low++;
        if (c < min) { min = c; at = [x, y, z].map((v) => +v.toFixed(1)); }
      }
      H[name] = { samples: pts.length, lowest: +min.toFixed(2), at, under3m: low, overhangs: over };
    };
    for (const u of ctx.unders) {
      const dg = u.dg;
      if (dg.cave) continue;
      const nav = dg.nav, pts = [];
      for (let k = 0; k < nav.nz; k++) for (let i = 0; i < nav.nx; i++) {
        if (!dg.walk?.[k * nav.nx + i]) continue;
        const x = nav.x0 + i + 0.5, z = nav.z0 + k + 0.5, f = b.physics.floorAt(x, z, dg.y + 0.3, 0.2, 0.45);
        if (Math.abs(f - dg.y) < 0.3) pts.push([x, f, z]);
      }
      audit(dg.name, pts);
    }
    const flight = (name, x, z0, z1, y0) => {            // down a flight from z0 (its head, at y0) to z1
      const pts = [];
      for (let z = z0 - 0.17; z > z1; z -= 0.17) {
        const yStep = y0 - Math.ceil((z0 - z) / 0.34) * 0.25;
        pts.push([x, b.physics.floorAt(x, z, yStep + 0.1, 0.05, 0), z]);
      }
      audit(name, pts);
    };
    flight('stairs: cathedral to the Undercroft', 5.0, -93.6, ctx.stairBottom.z, 0.6);
    flight('stairs: Undercroft to the Deep', ctx.dungeon.stairDown.x, ctx.dungeon.stairDown.z + 48 * 0.34, ctx.dungeon.stairDown.z, -14);
    flight('stairs: the Barrow', -180, 46, 46 - 56 * 0.34, 0);
    flight('stairs: the Cellars', 150, 186, 186 - 56 * 0.34, 0);
    for (const c of ctx.caves) {
      const pts = [];
      for (let j = 0; j < c.nx * c.nz; j++) {
        const a = c.a0 + (j % c.nx) * 0.5;
        if (c.s[j] > -0.32 || a < 0.5) continue;
        const k = (j - (j % c.nx)) / c.nx;
        pts.push([c.px + a, c.floor[j], c.pz + c.b0 + k * 0.5]);
      }
      audit(c.name, pts.filter((_, n) => n % 3 === 0), [c.mesh]);
    }
    // the eye on the stairs: down and up the Barrow's flight walking and running, how much the
    // camera's height jerks frame to frame (the second difference; the feet's own is ~0.17-0.2)
    const cam = {};
    const ride = (name, start, target, run) => {
      const inp = { look: [0, 0], axes: () => [0, 1], held: (k) => run && k === 'ShiftLeft', was: () => false, stickRun: false };
      p.pos.set(...start); p.vel.set(0, 0, 0); p.onGround = true;
      const ys = [];
      for (let i = 0; i < 60 * 9; i++) {
        const dx = target[0] - p.pos.x, dz = target[1] - p.pos.z;
        if (Math.hypot(dx, dz) < 0.5) break;
        p.yaw = Math.atan2(-dx, -dz);
        p.update(1 / 60, inp);
        ys.push(b.camera.position.y - Math.sin(p.bob * 2) * 0.045 * Math.min(1, p.speed / 6.2));   // (less the walk's bob)
      }
      let j = 0;
      for (let i = 2; i < ys.length; i++) j += (ys[i] - 2 * ys[i - 1] + ys[i - 2]) ** 2;
      cam[name] = +Math.sqrt(j / ys.length).toFixed(4);
    };
    const zf = 46 - 56 * 0.34;
    ride('down, walking', [-180, 0, 48], [-180, zf - 3], false);
    ride('up, walking', [-180, -14, zf - 2], [-180, 48], false);
    ride('down, running', [-180, 0, 48], [-180, zf - 3], true);
    ride('up, running', [-180, -14, zf - 2], [-180, 48], true);
    return { walks: R, chases: C, headroom: H, camera: cam };
  });
  let failed = errors;
  for (const [k, v] of Object.entries(out.walks)) {
    const ok = v.reached === v.of;
    if (!ok) failed++;
    console.log(`walk  ${ok ? 'OK  ' : 'FAIL'} ${k.padEnd(28)} ${ok ? '' : `stopped at ${v.end.join(', ')} after waypoint ${v.reached}/${v.of}`}`);
  }
  for (const [k, v] of Object.entries(out.headroom)) {
    const ok = v.under3m === 0;
    if (!ok) failed++;
    console.log(`room  ${ok ? 'OK  ' : 'LOW '} ${k.padEnd(36)} lowest ${v.lowest} m${ok ? '' : ` at ${v.at.join(', ')}; ${v.under3m} of ${v.samples} under 3 m`}${v.overhangs ? ` (${v.overhangs} beside furniture)` : ''}`);
  }
  for (const [k, v] of Object.entries(out.camera)) {
    const ok = v < 0.02;
    if (!ok) failed++;
    console.log(`eye   ${ok ? 'OK  ' : 'JERK'} stairs ${k.padEnd(29)} jerk ${v}`);
  }
  for (const [k, v] of Object.entries(out.chases)) {
    console.log(`chase ${k.padEnd(28)} ${typeof v === 'string' ? v : `${v.kind}: ${v.stepsFrom} -> ${v.stepsAfter ?? '(you, shoved off the grid by the others)'} steps, ${v.metres} -> ${v.closest} m`}`);
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
