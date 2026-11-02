// The map: M (or the map button) opens the whole country, drawn once at load like an old
// chart: the Darkwood, the village clearing and the Green Downs (its hills shaded from the
// north-west), the water, the roads and paths, every building, and the names of places;
// you're the arrow. A small round map in the corner shows what's about you, north up. Below
// ground the chart is of what you've walked: the undercroft's passages and rooms come out of
// the dark as you pass through them.
import { VILLAGE_R, WORLD_R, GRAVEYARD, CATHEDRAL } from './world.js';
import { REGION, POOL, STREAM, RIVER, terrainHeight } from './terrain.js';
import { SPOTS } from './region.js';
import { DELVES } from './delves.js';

// the chart's bounds: the forest round the village, the trail and the downs
const WORLD = { x0: -WORLD_R - 20, x1: REGION.x1 + 20, z0: -WORLD_R - 20, z1: WORLD_R + 20 };
const WASH = { forest: [44, 58, 36], deep: [26, 34, 22], downs: [106, 122, 60] };
const PX = 2;          // metres per pixel of the chart
const INK = '#2a1e12';

export class WorldMap {
  constructor(ui, ctx, { touch = false, onClose = null } = {}) {
    this.ctx = ctx;
    this.touch = touch;
    this.W = Math.ceil((WORLD.x1 - WORLD.x0) / PX); this.H = Math.ceil((WORLD.z1 - WORLD.z0) / PX);
    this.chart = this.draw(ctx);
    // the explored underground: one bit a metre, kept apart for each place down there (the two
    // levels of the Undercroft lie one over the other)
    this.seen = new Map();
    // the full map
    this.panel = document.createElement('div');
    this.panel.className = 'map-full hidden';
    this.panel.innerHTML = '<canvas></canvas><div class="map-title"></div><div class="map-hint"></div>';
    this.big = this.panel.querySelector('canvas');
    this.title = this.panel.querySelector('.map-title');
    this.panel.querySelector('.map-hint').textContent = touch ? 'Drag to look about' : 'M to close · drag or scroll to look about';
    const close = document.createElement('button');
    close.className = 'close'; close.innerHTML = '&times;';
    close.onclick = () => onClose?.();
    this.panel.append(close);
    ui.append(this.panel);
    // the corner map
    this.mini = document.createElement('canvas');
    this.mini.className = 'minimap';
    this.mini.width = this.mini.height = 132;
    ui.querySelector('.hud')?.append(this.mini);
    this.zoom = 1; this.pan = [0, 0];
    let drag = null;
    this.big.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; this.big.setPointerCapture(e.pointerId); });
    this.big.addEventListener('pointermove', (e) => { if (!drag) return; this.pan[0] += (e.clientX - drag[0]) / this.scale; this.pan[1] += (e.clientY - drag[1]) / this.scale; drag = [e.clientX, e.clientY]; this.drawBig(); });
    this.big.addEventListener('pointerup', () => { drag = null; });
    this.big.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.max(0.5, Math.min(6, this.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); this.drawBig(); }, { passive: false });
  }

  get open() { return !this.panel.classList.contains('hidden'); }
  show(on, player) {
    this.panel.classList.toggle('hidden', !on);
    if (on) { this.player = player; this.zoom = this.under(player) ? 3 : 1; this.pan = [0, 0]; this.drawBig(); }
  }

  /** World (x, z) to chart pixels. */
  px(x, z) { return [(x - WORLD.x0) / PX, (z - WORLD.z0) / PX]; }

  // -------------------------------------------------------------- the chart, drawn once
  draw(ctx) {
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    const g = c.getContext('2d');
    // the ground: the Darkwood, darker past where you can go, and the downs' grass shaded by
    // the slope of the hills (sampled every 4 px)
    const S = 4, img = g.createImageData(this.W, this.H), d = img.data;
    for (let j = 0; j < this.H; j += S) for (let i = 0; i < this.W; i += S) {
      const x = WORLD.x0 + i * PX, z = WORLD.z0 + j * PX;
      const downs = x >= REGION.x0 && Math.abs(z) <= REGION.z1;
      const col = downs ? WASH.downs : Math.hypot(x, z) < WORLD_R ? WASH.forest : WASH.deep;
      let shade = 1;
      if (downs) {
        const h = terrainHeight(x, z), hx = terrainHeight(x + 6, z), hz = terrainHeight(x, z + 6);
        shade = Math.max(0.55, Math.min(1.35, 1 + ((h - hx) + (h - hz)) * 0.06)) * (1 + Math.min(0.25, Math.max(-0.2, h * 0.004)));
      }
      for (let jj = 0; jj < S && j + jj < this.H; jj++) for (let ii = 0; ii < S && i + ii < this.W; ii++) {
        const k = ((j + jj) * this.W + i + ii) * 4;
        const n = ((i + ii) * 7 + (j + jj) * 13) % 5 * 2;   // a little grain
        d[k] = col[0] * shade + n; d[k + 1] = col[1] * shade + n; d[k + 2] = col[2] * shade + n;
        d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // the village clearing, lighter
    const [vx, vz] = this.px(0, 0);
    g.fillStyle = 'rgba(150, 150, 90, 0.35)'; g.beginPath(); g.arc(vx, vz, VILLAGE_R / PX, 0, Math.PI * 2); g.fill();
    // water
    g.fillStyle = '#3a5a6a';
    const [px0, pz0] = this.px(POOL.x, POOL.z); g.beginPath(); g.arc(px0, pz0, POOL.r / PX, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a5a6a'; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const line of [STREAM, RIVER]) { g.beginPath(); line.forEach(([x, z], k) => { const [a, b] = this.px(x, z); k ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); }
    // roads and paths: the village's streets, the lane to the graveyard, the trail east and the
    // downs' paths
    const rect = (x0, z0, x1, z1, fill, stroke) => { const [a, b] = this.px(x0, z0), [c2, d2] = this.px(x1, z1); g.fillStyle = fill; g.fillRect(a, b, c2 - a, d2 - b); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.strokeRect(a, b, c2 - a, d2 - b); } };
    const ROAD = '#c8b088', DIRT = '#9a7a52';
    rect(-4, -48, 4, VILLAGE_R + 20, ROAD); rect(-VILLAGE_R - 20, -4, VILLAGE_R + 20, 4, ROAD);
    rect(16, -50, 26, -44, DIRT); rect(20, -116, 26, -50, DIRT); rect(14, -126, 26, -116, DIRT);
    rect(VILLAGE_R + 20, -3, REGION.x0 + 6, 3, DIRT);
    g.strokeStyle = DIRT; g.lineWidth = 1.6;
    for (const pts of ctx.region?.paths || []) { g.beginPath(); pts.forEach(([x, z], k) => { const [a, b] = this.px(x, z); k ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); }
    // the Vigil Road west to Blackvigil Keep, and its curtain wall round the courtyard
    const keep = ctx.keep;
    if (keep) {
      g.strokeStyle = DIRT; g.lineWidth = 2.6;
      g.beginPath(); keep.road.forEach(([x, z], k) => { const [a, b2] = this.px(x, z); k ? g.lineTo(a, b2) : g.moveTo(a, b2); }); g.stroke();
      const K = keep.walls;
      rect(K.x0, K.z0, K.x1, K.z1, 'rgba(70, 64, 58, 0.75)', null);
      const [a0, b0] = this.px(K.x0, K.z0), [a1, b1] = this.px(K.x1, K.z1);
      g.strokeStyle = INK; g.lineWidth = 2.4; g.strokeRect(a0, b0, a1 - a0, b1 - b0);
    }
    // the graveyard, the plaza, the cathedral's forecourt, every building
    rect(GRAVEYARD.x0, GRAVEYARD.z0, GRAVEYARD.x1, GRAVEYARD.z1, 'rgba(60, 54, 40, 0.6)', '#1a140c');
    rect(-20, -20, 20, 20, '#8a8478'); rect(-16, -52, 16, -40, '#8a8478');
    for (const z of ctx.zones || []) rect(z.x0, z.z0, z.x1, z.z1, '#5a3a26', INK);
    rect(CATHEDRAL.x0, CATHEDRAL.z0, CATHEDRAL.x1, CATHEDRAL.z1, '#4a3a3a', INK);
    // crosses for the graves
    g.fillStyle = INK;
    const cross = (x, z) => { const [a, b] = this.px(x, z); g.fillRect(a - 0.5, b - 3, 1, 6); g.fillRect(a - 2, b - 1.5, 4, 1); };
    for (let x = GRAVEYARD.x0 + 8; x < GRAVEYARD.x1; x += 14) for (let z = GRAVEYARD.z0 + 8; z < GRAVEYARD.z1; z += 14) cross(x, z);
    // names
    g.textAlign = 'center';
    const name = (x, z, t, size = 11) => {
      const [a, b] = this.px(x, z);
      g.font = `700 ${size}px Cinzel, Georgia, serif`;
      g.lineWidth = 3; g.strokeStyle = 'rgba(232, 220, 190, 0.85)'; g.strokeText(t, a, b);
      g.fillStyle = INK; g.fillText(t, a, b);
    };
    name(0, -2, 'Bellmourn', 14); name(0, -102, 'Cathedral', 9); name(0, -150, 'Graveyard', 9);
    name((REGION.x0 + REGION.x1) / 2, -200, 'The Green Downs', 13);
    name(-160, 160, 'The Darkwood', 13);
    if (keep) { name((keep.walls.x0 + keep.walls.x1) / 2, keep.walls.z0 - 6, 'Blackvigil Keep', 10); name(-150, -9, 'The Vigil Road', 9); } name((VILLAGE_R + REGION.x0) / 2 + 20, -10, 'The Bellwood Trail', 9);
    for (const [x, z, , t] of Object.values(SPOTS)) { const [a, b] = this.px(x, z); g.fillStyle = INK; g.beginPath(); g.arc(a, b, 2.2, 0, Math.PI * 2); g.fill(); name(x, z - 14, t, 9); }
    // the ways under the ground: the delves' stair-houses and the caves' mouths, a dark door each
    const door = (x, z, t, dz = -10) => {
      const [a, b] = this.px(x, z);
      g.fillStyle = '#1a0e08'; g.beginPath(); g.arc(a, b, 3.2, Math.PI, 0); g.lineTo(a + 3.2, b + 2.5); g.lineTo(a - 3.2, b + 2.5); g.closePath(); g.fill();
      name(x, z + dz, t, 8);
    };
    for (const d of DELVES) door(d.x, d.z, d.name);
    // the caves' names in clear ground by their mouths (the cliff is the map's edge, and the falls,
    // Millhaven and the windmill are named nearby)
    const caveLabel = { 'The Drowned Grotto': [-40, -110], 'The Gloamhollow': [-30, 32], 'The Trollhole': [-25, 176] };
    for (const c of ctx.caves || []) {
      const [a, b] = this.px(c.mouth.x, c.mouth.z);
      g.fillStyle = '#1a0e08'; g.beginPath(); g.arc(a, b, 3.2, Math.PI, 0); g.lineTo(a + 3.2, b + 2.5); g.lineTo(a - 3.2, b + 2.5); g.closePath(); g.fill();
      const [lx, lz] = caveLabel[c.name] || [-30, c.mouth.z - 10];
      const [la, lb] = this.px(c.mouth.x + lx, lz);
      g.strokeStyle = "rgba(42, 30, 18, 0.6)"; g.lineWidth = 1; g.beginPath(); g.moveTo(a, b); g.lineTo(la + 20, lb - 3); g.stroke();
      g.textAlign = 'right';
      name(c.mouth.x + lx + 18 * PX, lz, c.name, 8);
      g.textAlign = 'center';
    }
    // the frame
    g.strokeStyle = '#1a120a'; g.lineWidth = 6; g.strokeRect(0, 0, this.W, this.H);
    return c;
  }

  under(p) { return p.pos.y < terrainHeight(p.pos.x, p.pos.z) - 3 || !!this.place(p); }

  /** Which place below ground you are in (its index among ctx.unders), or -1. */
  level(p) { return (this.ctx.unders || []).findIndex((u) => u.dg.contains(p.pos)); }
  place(p) { return this.ctx.unders?.[this.level(p)]?.dg || null; }

  // -------------------------------------------------------------- the explored dark
  explore(p) {
    if (!this.under(p)) return;
    const R = 5, lvl = this.level(p) + 1;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > R * R) continue;
      const k = (lvl * 4000 + Math.floor(p.pos.x) + dx + 2000) * 100003 + Math.floor(p.pos.z) + dz;
      this.seen.set(k, true);
    }
  }

  /** The chart of what's been walked below ground, about (cx, cz), `s` px a metre: the place you
   * are in (`dg`), drawn from its own carved grid. */
  drawUnder(g, w, h, cx, cz, s, dg = null) {
    g.fillStyle = '#0c0a0a'; g.fillRect(0, 0, w, h);
    const nav = dg?.nav, lvl = dg ? this.ctx.unders.findIndex((u) => u.dg === dg) + 1 : 0;
    const x0 = Math.floor(cx - w / 2 / s), x1 = Math.ceil(cx + w / 2 / s), z0 = Math.floor(cz - h / 2 / s), z1 = Math.ceil(cz + h / 2 / s);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!this.seen.get((lvl * 4000 + x + 2000) * 100003 + z)) continue;
      let open = true;
      if (nav && x >= nav.x0 && x < nav.x0 + nav.nx && z >= nav.z0 && z < nav.z0 + nav.nz) {
        const v = nav.cell[(z - nav.z0) * nav.nx + (x - nav.x0)];
        if (v < 0) continue;
        g.fillStyle = v >= 1000 || dg.cave ? '#6a5a48' : '#8a7860';
        open = false;
      } else g.fillStyle = '#5a4a3e';
      void open;
      g.fillRect((x - cx) * s + w / 2, (z - cz) * s + h / 2, Math.ceil(s), Math.ceil(s));
    }
  }

  // -------------------------------------------------------------- drawing
  arrow(g, x, y, yaw, size) {
    g.save(); g.translate(x, y); g.rotate(-yaw);
    g.fillStyle = '#f4e0a0'; g.strokeStyle = '#1a0a04'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -size); g.lineTo(size * 0.6, size * 0.7); g.lineTo(0, size * 0.35); g.lineTo(-size * 0.6, size * 0.7); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  drawBig() {
    const p = this.player, c = this.big;
    const w = c.width = Math.floor(this.panel.clientWidth * 0.94), h = c.height = Math.floor(this.panel.clientHeight * 0.86);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    if (this.under(p)) {
      const s = 3 * this.zoom;
      this.scale = s;
      const dg = this.place(p);
      this.drawUnder(g, w, h, p.pos.x - this.pan[0], p.pos.z - this.pan[1], s, dg);
      this.arrow(g, w / 2 + this.pan[0] * s, h / 2 + this.pan[1] * s, p.yaw, 9);
      this.title.textContent = dg?.name || 'Below the ground';
      return;
    }
    const fit = Math.min(w / this.W, h / this.H) * this.zoom;
    this.scale = fit / PX;
    const [ppx, ppz] = this.px(p.pos.x, p.pos.z);
    const cx = this.zoom > 1 ? ppx - this.pan[0] * PX : this.W / 2 - this.pan[0] * PX, cz = this.zoom > 1 ? ppz - this.pan[1] * PX : this.H / 2 - this.pan[1] * PX;
    g.fillStyle = '#1a140c'; g.fillRect(0, 0, w, h);
    g.drawImage(this.chart, cx - w / 2 / fit, cz - h / 2 / fit, w / fit, h / fit, 0, 0, w, h);
    const toBig = (x, z) => { const [a, b] = this.px(x, z); return [(a - cx) * fit + w / 2, (b - cz) * fit + h / 2]; };
    this.drawPortals(g, toBig, w, h, true);
    this.drawPins(g, toBig, fit / PX, w, h, true);
    this.arrow(g, (ppx - cx) * fit + w / 2, (ppz - cz) * fit + h / 2, p.yaw, 10);
    this.title.textContent = 'Bellmourn, the Darkwood and the Green Downs';
  }

  /** The quests on the map (quests.js pins): a yellow ! or ? over whoever has work for you (grey ?
   * for work under way), and a gold ring or star where each followed quest is done. */
  drawPins(g, to, k, w, h, big) {
    const pins = this.pins?.() || [];
    g.save();
    for (const q of pins) {
      const [x, y] = to(q.x, q.z);
      if (x < -60 || y < -60 || x > w + 60 || y > h + 60) continue;
      if (q.kind === 'area') {
        g.strokeStyle = 'rgba(255, 210, 60, 0.95)'; g.fillStyle = 'rgba(255, 210, 60, 0.16)'; g.lineWidth = big ? 2.5 : 2;
        if (q.r) { g.setLineDash([6, 4]); g.beginPath(); g.arc(x, y, Math.max(8, q.r * k), 0, Math.PI * 2); g.fill(); g.stroke(); g.setLineDash([]); }
        this.star(g, x, y, big ? 9 : 6);
        if (big) {
          g.font = '700 12px Cinzel, Georgia, serif'; g.textAlign = 'center';
          g.lineWidth = 3; g.strokeStyle = 'rgba(20, 12, 4, 0.9)'; g.strokeText(q.label, x, y - 14); g.fillStyle = '#ffd84a'; g.fillText(q.label, x, y - 14);
        }
      } else if (q.kind === 'shop') {   // a merchant: a coin with the shop's sign (trade.js)
        const s = big ? 1 : 0.62;
        this.shopMark?.(g, q.mark, x, y + 11 * s, s);
        if (big && k > 1.2) { g.font = '600 10px Cinzel, Georgia, serif'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(232, 220, 190, 0.85)'; g.strokeText(q.label, x, y + 18); g.fillStyle = INK; g.fillText(q.label, x, y + 18); }
      } else {
        const glyph = q.kind === '!' ? '!' : '?';
        g.font = `900 ${big ? 22 : 15}px "Cinzel Decorative", Cinzel, Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 3.5; g.strokeStyle = '#1a1004'; g.strokeText(glyph, x, y);
        g.fillStyle = q.kind === 'g' ? '#a8a296' : '#ffd21a'; g.fillText(glyph, x, y);
        g.textBaseline = 'alphabetic';
        if (big && k > 1.6) { g.font = '600 10px Cinzel, Georgia, serif'; g.lineWidth = 3; g.strokeStyle = 'rgba(232, 220, 190, 0.85)'; g.strokeText(q.label, x, y + 18); g.fillStyle = INK; g.fillText(q.label, x, y + 18); }
      }
    }
    g.restore();
  }

  /** The portals woken so far (portals.js): a blue seal with its four-pointed star, named when the
   * chart is zoomed in. */
  sealIcon(big) {
    const key = big ? 'iconBig' : 'iconSmall';
    if (this[key]) return this[key];
    const r = big ? 7 : 4.6, R = Math.ceil(r * 2.2), c = document.createElement('canvas');
    c.width = c.height = R * 2;
    const g = c.getContext('2d'), x = R, y = R;
    const glow = g.createRadialGradient(x, y, 0, x, y, r * 2.2);
    glow.addColorStop(0, 'rgba(120, 170, 255, 0.55)'); glow.addColorStop(1, 'rgba(80, 130, 255, 0)');
    g.fillStyle = glow; g.beginPath(); g.arc(x, y, r * 2.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1c2c6c'; g.strokeStyle = '#d8e4ff'; g.lineWidth = big ? 1.6 : 1.2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#9cc0ff';
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * 0.22 : r * 0.82; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
    return (this[key] = c);
  }

  drawPortals(g, to, w, h, big) {
    const list = this.portals?.() || [];
    if (!list.length) return;
    g.save();
    const r = big ? 7 : 4.6, icon = this.sealIcon(big), half = icon.width / 2;
    for (const q of list) {
      const [x, y] = to(q.x, q.z);
      if (x < -40 || y < -40 || x > w + 40 || y > h + 40) continue;
      g.drawImage(icon, x - half, y - half);
      if (big && this.zoom >= 2.4) {   // (zoomed out, the chart's own names say where they are)
        g.font = '700 10px Cinzel, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.lineWidth = 3; g.strokeStyle = 'rgba(232, 220, 190, 0.85)'; g.strokeText(q.name, x, y + r + 12);
        g.fillStyle = '#1c2c6c'; g.fillText(q.name, x, y + r + 12);
      }
    }
    g.restore();
  }

  star(g, x, y, r) {
    g.save(); g.fillStyle = '#ffd84a'; g.strokeStyle = '#3a2204'; g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill(); g.stroke(); g.restore();
  }

  /** On the corner map's rim: which way each followed quest lies, if it's off the map. */
  edgePins(g, p, S) {
    const k = S / 160, R = S / 2 - 7;
    for (const q of (this.pins?.() || []).filter((x) => x.kind === 'area' || x.kind === '?')) {
      const dx = (q.x - p.pos.x) * k, dz = (q.z - p.pos.z) * k, d = Math.hypot(dx, dz);
      if (d < R - 4) continue;
      const x = S / 2 + dx / d * R, y = S / 2 + dz / d * R;
      g.save(); g.translate(x, y); g.rotate(Math.atan2(dz, dx));
      g.fillStyle = q.kind === '?' ? '#ffd21a' : '#ffd84a'; g.strokeStyle = '#2a1804'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -5); g.lineTo(-2, 0); g.lineTo(-4, 5); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }

  /** The corner map, each frame (cheap: a crop of the chart). */
  update(p) {
    this.explore(p);
    const g = this.mini.getContext('2d'), S = this.mini.width;
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.clip();
    if (this.under(p)) this.drawUnder(g, S, S, p.pos.x, p.pos.z, 2.2, this.place(p));
    else {
      const [x, z] = this.px(p.pos.x, p.pos.z), span = 160 / PX;   // 160 m across
      g.imageSmoothingEnabled = false;
      g.drawImage(this.chart, x - span / 2, z - span / 2, span, span, 0, 0, S, S);
      const k = S / 160;   // pixels a metre
      this.drawPortals(g, (wx, wz) => [S / 2 + (wx - p.pos.x) * k, S / 2 + (wz - p.pos.z) * k], S, S, false);
      this.drawPins(g, (wx, wz) => [S / 2 + (wx - p.pos.x) * k, S / 2 + (wz - p.pos.z) * k], k, S, S, false);
    }
    g.restore();
    if (!this.under(p)) this.edgePins(g, p, S);
    this.arrow(g, S / 2, S / 2, p.yaw, 7);
    g.strokeStyle = '#8a7448'; g.lineWidth = 3; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#d8b870'; g.font = '700 11px Cinzel, serif'; g.textAlign = 'center'; g.fillText('N', S / 2, 13);
    if (this.open) this.drawBig();
  }
}
