// A plan of the catacombs for review: every walkable cell of each place (the Undercroft warm, the
// Deep Undercroft cold, the gulf's floor teal, by floor height), the flames, the dead (red standing,
// violet lying still, brown buried), the bridge, and each space's name. In the page, once loaded:
//   (await import('/tools/catacombs_plan.js')).plan()        // saves art/view/shots/plan.png
export async function plan(name = 'plan', S = 4) {
  const bm = window.bellmourn, cat = bm.ctx.catacombs, m = cat.mason;
  const X0 = -52, Z0 = -412, X1 = 66, Z1 = -108, W = (X1 - X0) * S, H = (Z1 - Z0) * S;
  const cv = document.createElement('canvas'); cv.width = W + 260; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#100c0a'; g.fillRect(0, 0, cv.width, cv.height);
  const px = (x) => (x - X0) * S, pz = (z) => (z - Z0) * S;
  const shadeOf = (h, lo, hi) => Math.max(0.35, Math.min(1, 0.35 + 0.65 * (h - lo) / (hi - lo)));
  // the gulf's floor first (under the bridge), then the two levels
  const gn = cat.gulfDg.nav;
  for (let k = 0; k < gn.nz; k++) for (let i = 0; i < gn.nx; i++) {
    if (gn.cell[k * gn.nx + i] < 0) continue;
    const f = cat.gulf.floorAt(gn.x0 + i + 0.5, gn.z0 + k + 0.5) ?? -40, s = shadeOf(f, -41, -18);
    g.fillStyle = `rgb(${30 * s},${120 * s},${120 * s})`; g.fillRect(px(gn.x0 + i), pz(gn.z0 + k), S, S);
  }
  for (const [dg, col] of [[cat.upper, [200, 150, 90]], [cat.deep, [110, 140, 210]]]) {
    const n = dg.nav;
    for (let k = 0; k < n.nz; k++) for (let i = 0; i < n.nx; i++) {
      const v = n.cell[k * n.nx + i];
      if (v < 0) continue;
      const h = n.h[k * n.nx + i], s = shadeOf(h, -42, -12) * (v >= 1000 ? 0.75 : 1);
      g.fillStyle = `rgb(${col[0] * s},${col[1] * s},${col[2] * s})`; g.fillRect(px(n.x0 + i), pz(n.z0 + k), S, S);
    }
  }
  // the bridge
  const br = cat.bridge;
  g.strokeStyle = '#e0c080'; g.lineWidth = 3; g.beginPath(); g.moveTo(px(br.A.x), pz(br.A.z)); g.lineTo(px(br.B.x), pz(br.B.z)); g.stroke();
  const gz = br.A.z + (br.B.z - br.A.z) * (br.gap[0] / br.N), gz1 = br.A.z + (br.B.z - br.A.z) * ((br.gap[1] + 1) / br.N);
  g.strokeStyle = '#ff3030'; g.beginPath(); g.moveTo(px(br.A.x), pz(gz)); g.lineTo(px(br.A.x), pz(gz1)); g.stroke();
  // flames
  for (const f of [...bm.ctx.props.lights, ...bm.ctx.flames]) {
    if (f[1] > -8 || f[0] < X0 || f[0] > X1 || f[2] < Z0 || f[2] > Z1) continue;
    g.fillStyle = '#ffd040'; g.beginPath(); g.arc(px(f[0]), pz(f[2]), 2.2, 0, 7); g.fill();
  }
  // the dead
  for (const z of bm.zombies.list) {
    if (![cat.upper, cat.deep, cat.gulfDg].includes(z.dg)) continue;
    g.fillStyle = z.state === 'buried' ? '#9a6a30' : z.state === 'playdead' ? '#b060ff' : z.mode === 'crawl' ? '#ff9090' : '#ff2020';
    g.beginPath(); g.arc(px(z.pos.x), pz(z.pos.z), 3.2, 0, 7); g.fill();
  }
  // names
  g.font = '13px sans-serif'; g.fillStyle = '#f4e8d0'; g.textAlign = 'left';
  const seen = new Set();
  for (const s of m.spaces) {
    if (seen.has(s.name) || !s.name) continue;
    seen.add(s.name);
    const [x, z] = s.type === 'room' ? [s.cx, s.cz] : s.pts ? s.pts[Math.floor(s.pts.length / 2)] : [12, -213];
    g.fillText(s.name, px(x) + 6, pz(z));
  }
  // a key
  const key = [['#c8965a', 'The Undercroft (lighter: higher)'], ['#6e8cd2', 'The Deep Undercroft'], ['#1e7878', "The Gulf's floor"], ['#ffd040', 'flame'], ['#ff2020', 'the dead, standing'],
    ['#b060ff', 'lying still (wakes near)'], ['#9a6a30', 'buried (claws up near)'], ['#ff9090', 'crawling'], ['#e0c080', 'rope bridge'], ['#ff3030', "the bridge's gap"]];
  key.forEach(([c, t], i) => { g.fillStyle = c; g.fillRect(W + 14, 20 + i * 22, 14, 14); g.fillStyle = '#f4e8d0'; g.fillText(t, W + 34, 32 + i * 22); });
  g.fillStyle = '#f4e8d0'; g.fillText(`N up; ${S} px a metre`, W + 14, 20 + key.length * 22 + 20);
  const bin = atob(cv.toDataURL('image/png').split(',')[1]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await fetch('/shot?name=' + name, { method: 'POST', body: u8 });
  return name;
}
