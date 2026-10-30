// The grotesques in the game itself: the real index.html, the graveyard, the player's own eyes.
//
//   node ingame.cjs <port> <out_dir> [three_dir]
//
// Loads the game headless, clears the graveyard's horde, stands the player at the yard's edge and
// lines the ten grotesques up before him; shots at golden hour and at night, far and near. Serve
// the repo first (python tools/serve.py <port>). three_dir as in shots.cjs.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const NAMES = ['rotting_zombie', 'bloated_drowner', 'plague_bearer', 'tomb_mummy', 'ember_husk',
  'pale_ghoul', 'chitin_fiend', 'deep_maw', 'fungal_husk', 'bog_troll'];

(async () => {
  const [port, out, three] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  if (three) {
    await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (route) => {
      const rel = route.request().url().split('three@0.170.0/')[1];
      route.fulfill({ path: path.join(three, rel), contentType: 'application/javascript' });
    });
  }
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  page.on('console', (m) => { if (/grotesque|error/i.test(m.text())) console.log('console:', m.text()); });
  // low graphics and big pixels: a software renderer takes seconds a frame at full quality
  await page.addInitScript(() => { localStorage.setItem('bm.time', 'golden'); localStorage.setItem('bm.quality', 'low'); localStorage.setItem('bm.pix', '2'); });
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => window.bellmourn || window.bootError, null, { timeout: 900000 });
  const err = await page.evaluate(() => window.bootError && String(window.bootError));
  if (err) { console.log('BOOT ERROR', err); process.exit(1); }
  const pool = await page.evaluate(() => window.bellmourn.zombies.pool);
  console.log('pool', pool.length, pool.filter((p) => p.includes('_')).join(','));

  const stage = async (names, z, spread, hour) => page.evaluate(({ names, z, spread, hour }) => {
    const b = window.bellmourn, zs = b.zombies;
    b.begin();
    b.setHour(hour);
    if (zs.yard) zs.yard.target = 0;
    for (const zb of zs.list) zb.root.parent?.remove(zb.root);
    zs.list.length = 0;
    const px = 0, pz = -124;
    b.player.pos.set(px, b.physics.groundAt(px, pz), pz);
    b.player.yaw = 0; b.player.pitch = -0.05;
    names.forEach((n, i) => {
      const x = (i - (names.length - 1) / 2) * spread;
      const zb = zs.spawn(n, x, z, { zone: 'yard', kind: 'shambler', start: 'stand' });
      zb.yaw = 0;
      zb.sync();
    });
  }, { names, z, spread, hour });
  const shot = async (name, wait = 1200) => {
    await page.waitForTimeout(wait);
    const file = path.join(out, `${name}.png`);
    await page.screenshot({ path: file, timeout: 300000 });
    console.log('shot', file);
  };
  await stage(NAMES, -131, 1.25, 17.6); await shot('lineup_golden');
  await stage(NAMES, -131, 1.25, 23); await shot('lineup_night');
  await stage(NAMES.slice(0, 5), -127.6, 1.0, 18.4); await shot('near_a');
  await stage(NAMES.slice(5), -127.6, 1.0, 18.4); await shot('near_b');
  await browser.close();
})();
