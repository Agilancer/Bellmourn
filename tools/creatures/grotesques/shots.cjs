// In-game look shots of grotesques: the preview page in headless Chromium, one PNG per shot.
//
//   node shots.cjs <port> <out_dir> <shots.json> [three_dir]
//
// shots.json: [{"name": "34", "q": "m=...&view=34&clip=idle&t=0.4"}, ...]. Serve the repo first
// (python tools/serve.py <port>). three_dir, if given, is an unpacked `three` npm package that
// stands in for the CDN (for machines that can't reach it).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const [port, out, list, three] = process.argv.slice(2);
  const shots = JSON.parse(fs.readFileSync(list, 'utf8'));
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 1080 } });
  if (three) {
    await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (route) => {
      const rel = route.request().url().split('three@0.170.0/')[1];
      route.fulfill({ path: path.join(three, rel), contentType: 'application/javascript' });
    });
  }
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  for (const s of shots) {
    const vp = s.size || [960, 1080];
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    await page.goto(`http://127.0.0.1:${port}/tools/creatures/grotesques/preview/index.html?${s.q}`);
    await page.waitForFunction(() => window.READY, null, { timeout: 180000 });
    const file = path.join(out, `${s.name}.png`);
    await page.screenshot({ path: file });
    console.log('shot', file);
  }
  await browser.close();
})();
