// Rooms: collision (solid AABBs + one-way platforms), a builder API used by rooms.js to lay out
// castle-kit pieces, prerendered layers, animated props (torches, candles), breakables, exits,
// and the per-room decal canvas that blood and scorch marks are painted onto.
import { Flash } from './fx.js';

export const VIEW_W = 640;
export const VIEW_H = 360;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

// Multiply-tint a layer without filling its transparent pixels (canvas 'multiply' would).
function tintLayer(c, g, color) {
  const [keep, kg] = canvas(c.width, c.height);
  kg.drawImage(c, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(keep, 0, 0);
  g.globalCompositeOperation = 'source-over';
}

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Pieces whose walkable top is a few pixels below the image top.
const LIP = { ledge: 1, beam: 4, floor: 1, marble: 2 };
const TORCH_SEQ = [1, 2, 3, 4, 3, 2];

export class Room {
  constructor(id, def, atlas) {
    this.id = id;
    this.atlas = atlas;
    this.name = def.name;
    this.w = def.w; this.h = def.h;
    this.ambient = def.ambient ?? [96, 86, 128];
    this.exterior = !!def.exterior;
    this.solids = [];
    this.oneways = [];
    this.exits = [];
    this.lights = [];       // static lights {x,y,r,color,a,flicker}
    this.torches = [];
    this.props = [];        // animated / breakable props
    this.shafts = [];       // moonlight shafts
    this.motes = [];
    this.spawn = def.spawn;
    this.def = def;
    this.ops = { far: [], back: [], fg: [], front: [] };
    def.build(this);
    for (const [side, y0, y1, to, entry] of def.exits ?? []) this.exit(side, y0, y1, to, entry);
    this.prerender();
  }

  // ---------------------------------------------------------------- builder API (rooms.js)
  piece(layer, name, x, y, opts = {}) { this.ops[layer].push({ kind: 'piece', name, x, y, ...opts }); }
  op(layer, fn) { this.ops[layer].push({ kind: 'fn', fn }); }

  solid(x, y, w, h, style = 'stone') {
    this.solids.push({ x, y, w, h });
    this.ops.fg.push({ kind: 'block', x, y, w, h, style });
  }

  // A stretch of floor: walk band on top, masonry fill beneath down to `bottom`.
  floor(x0, x1, y, opts = {}) {
    const bottom = opts.bottom ?? this.h;
    const band = opts.style === 'marble' ? ['marble_m1', 'marble_m2'] : ['floor_m1', 'floor_m2'];
    const lip = LIP[opts.style === 'marble' ? 'marble' : 'floor'];
    this.solids.push({ x: x0, y, w: x1 - x0, h: bottom - y });
    this.ops.fg.push({ kind: 'floor', x0, x1, y: y - lip, bottom, band, capL: opts.capL, capR: opts.capR });
  }

  // One-way platform made of a left cap, n middles and a right cap.
  ledge(x, y, n = 1, style = 'ledge') {
    const parts = style === 'beam' ? ['beam_l', 'beam_m', 'beam_r'] : ['ledge_l', 'ledge_m1', 'ledge_r'];
    const mids = style === 'beam' ? ['beam_m'] : ['ledge_m1', 'ledge_m2'];
    const lip = LIP[style];
    let cx = x;
    const seq = [parts[0]];
    for (let i = 0; i < n; i++) seq.push(mids[i % mids.length]);
    seq.push(parts[2]);
    const overlapPx = style === 'beam' ? 4 : 2;
    for (const p of seq) {
      this.ops.fg.push({ kind: 'piece', name: p, x: cx, y: y - lip });
      cx += this.atlas.size(p).w - overlapPx;
    }
    this.oneways.push({ x: x + 4, y, w: cx - x - 6 });
    return cx;
  }

  torch(x, y) {
    this.torches.push({ x, y, phase: Math.random() * 60 | 0, speed: 6 + (Math.random() * 3 | 0) });
    this.lights.push({ x: x + 30, y: y + 12, r: 150, color: [255, 150, 80], a: 1, flicker: true });
  }

  candle(name, x, y, opts = {}) {
    const s = this.atlas.size(name);
    const prop = { name, x, y, w: s.w, h: s.h, breakable: opts.breakable ?? true, broken: false,
      flames: opts.flames ?? [[s.w / 2, 4]], phase: Math.random() * 10 };
    this.props.push(prop);
    prop.light = { x: x + s.w / 2, y: y + (opts.lightY ?? 6), r: opts.r ?? 100, color: [255, 180, 110], a: 0.9, flicker: true };
    this.lights.push(prop.light);
    return prop;
  }

  window(layer, name, x, y, opts = {}) {
    const s = this.atlas.size(name);
    this.piece(layer, name, x, y);
    // moonlight leaks through the glass at a slant onto the floor
    const len = opts.len ?? 220;
    this.shafts.push({ layer, x: x + 6, y: y + 10, w: s.w - 12, len, slant: opts.slant ?? 70, color: opts.color ?? [150, 170, 255] });
    this.lights.push({ x: x + s.w / 2, y: y + s.h / 2, r: 90, color: [120, 140, 230], a: 0.7, layer });
  }

  exit(side, y0, y1, to, entry) { this.exits.push({ side, y0, y1, to, entry }); }

  // ---------------------------------------------------------------- collision
  blocked(r) { for (const s of this.solids) if (overlap(r, s)) return true; return false; }

  pointSolid(x, y) {
    for (const s of this.solids) if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return true;
    return false;
  }

  move(e, dx, dy, ignoreOneway) {
    const hw = 8;
    const res = { wall: false, ceiling: false, impactVy: dy };
    // X
    e.x += dx;
    let box = { x: e.x - hw, y: e.y - e.h, w: hw * 2, h: e.h - 0.01 };
    for (const s of this.solids) {
      if (!overlap(box, s)) continue;
      if (dx > 0) e.x = s.x - hw; else if (dx < 0) e.x = s.x + s.w + hw;
      else e.x = (e.x < s.x + s.w / 2) ? s.x - hw : s.x + s.w + hw;
      res.wall = true;
      box = { x: e.x - hw, y: e.y - e.h, w: hw * 2, h: e.h - 0.01 };
    }
    // Y
    const prevBottom = e.y;
    e.y += dy;
    box = { x: e.x - hw, y: e.y - e.h, w: hw * 2, h: e.h };
    let landed = false;
    for (const s of this.solids) {
      if (!overlap(box, s)) continue;
      if (dy > 0) { e.y = s.y; landed = true; } else if (dy < 0) { e.y = s.y + s.h + e.h; res.ceiling = true; }
      box = { x: e.x - hw, y: e.y - e.h, w: hw * 2, h: e.h };
    }
    if (dy > 0 && !ignoreOneway && !landed) {
      for (const o of this.oneways) {
        if (e.x + hw > o.x && e.x - hw < o.x + o.w && prevBottom <= o.y + 0.01 && e.y >= o.y) { e.y = o.y; landed = true; break; }
      }
    }
    e.onGround = landed || (dy >= 0 && this.standing(e, ignoreOneway));
    return res;
  }

  standing(e, ignoreOneway) {
    const hw = 8;
    const probe = { x: e.x - hw, y: e.y, w: hw * 2, h: 1 };
    for (const s of this.solids) if (overlap(probe, s)) return true;
    if (!ignoreOneway) for (const o of this.oneways) if (e.x + hw > o.x && e.x - hw < o.x + o.w && Math.abs(e.y - o.y) < 0.5) return true;
    return false;
  }

  oneWayUnder(box) {
    const feet = box.y + box.h;
    const probe = { x: box.x, y: feet, w: box.w, h: 1 };
    for (const s of this.solids) if (overlap(probe, s)) return false;
    return this.oneways.some((o) => box.x + box.w > o.x && box.x < o.x + o.w && Math.abs(feet - o.y) < 0.5);
  }

  solidUnderFeet(e) {
    const l = { x: e.x - 9, y: e.y, w: 1, h: 2 }, r = { x: e.x + 8, y: e.y, w: 1, h: 2 };
    let a = false, b = false;
    for (const s of this.solids) { if (overlap(l, s)) a = true; if (overlap(r, s)) b = true; }
    return a && b;
  }

  // ---------------------------------------------------------------- combat hooks
  breakProp(game, p, dir) {
    p.broken = true;
    const cx = p.x + p.w / 2, cy = p.y + p.h * 0.35;
    game.fx.sparks(cx, cy, dir, 18);
    game.fx.burst(cx, cy, 10, { color: ['#e8dcc0', '#b8a888', '#d6b05a'], speed: 2.4, life: 40, gravity: 0.2, glow: false, size: 2 });
    game.fx.add(new Flash(cx, cy, 70, 'rgba(255,200,120,', 12));
    game.fx.smoke(cx, p.y + 4, 6);
    p.light.a = 0;
    game.shake(1);
  }

  hitSegment(game, seg, hits, dir) {
    for (const p of this.props) {
      if (!p.breakable || p.broken || hits.has(p)) continue;
      for (let k = 0; k <= 6; k++) {
        const x = seg.x0 + (seg.x1 - seg.x0) * k / 6, y = seg.y0 + (seg.y1 - seg.y0) * k / 6;
        if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) {
          hits.add(p); this.breakProp(game, p, dir); game.hitstop(4); break;
        }
      }
    }
  }

  hitPoint(game, x, y, dir) {
    for (const p of this.props) {
      if (p.breakable && !p.broken && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) { this.breakProp(game, p, dir); return true; }
    }
    return false;
  }

  // Keep decals only where foreground stone is painted, so stains never float in the air.
  clipDecal(x, y, r) {
    const g = this.decalCtx;
    const x0 = Math.max(0, Math.floor(x - r)), y0 = Math.max(0, Math.floor(y - r));
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(this.fgCanvas, x0, y0, r * 2, r * 2, x0, y0, r * 2, r * 2);
    g.globalCompositeOperation = 'source-over';
  }

  stain(x, y, color, size) {
    const g = this.decalCtx;
    g.fillStyle = color;
    const s = size + (Math.random() < 0.3 ? 1 : 0);
    g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    if (Math.random() < 0.3) g.fillRect(Math.round(x + (Math.random() * 4 - 2)), Math.round(y), 1, 1);
    this.clipDecal(x, y, 4);
  }

  scorch(x, y) {
    const g = this.decalCtx;
    const gr = g.createRadialGradient(x, y, 0, x, y, 14);
    gr.addColorStop(0, 'rgba(10,6,8,0.65)');
    gr.addColorStop(1, 'rgba(10,6,8,0)');
    g.fillStyle = gr;
    g.fillRect(x - 14, y - 14, 28, 28);
    this.clipDecal(x, y, 15);
  }

  reset() {
    for (const p of this.props) { p.broken = false; p.light.a = 0.9; }
  }

  // ---------------------------------------------------------------- prerender
  prerender() {
    const A = this.atlas;
    const farW = Math.ceil(this.w * 0.82 + VIEW_W * 0.18) + 2;
    const farH = Math.ceil(this.h * 0.82 + VIEW_H * 0.18) + 2;
    let g;
    [this.farCanvas, g] = canvas(farW, farH);
    this.farW = farW; this.farH = farH;
    if (this.def.farTexture) this.tile(g, this.def.farTexture, 0, 0, farW, farH);
    this.runOps(g, this.ops.far);
    // recede: darker, colder
    tintLayer(this.farCanvas, g, this.def.farTint ?? '#4a4566');

    [this.backCanvas, g] = canvas(this.w, this.h);
    this.runOps(g, this.ops.back);
    tintLayer(this.backCanvas, g, this.def.backTint ?? '#8a83a6');

    [this.fgCanvas, g] = canvas(this.w, this.h);
    this.runOps(g, this.ops.fg);
    [this.frontCanvas, g] = canvas(this.w * 1.25 + VIEW_W, this.h);
    this.runOps(g, this.ops.front);

    // decals live on top of the foreground stone, clipped to it (see clipDecal)
    [this.decalCanvas, this.decalCtx] = canvas(this.w, this.h);

    for (let i = 0; i < 40; i++) this.motes.push({ x: Math.random() * this.w, y: Math.random() * this.h, p: Math.random() * 6.28 });
  }

  tile(g, names, x, y, w, h, inset = 1) {
    const A = this.atlas;
    const list = Array.isArray(names) ? names : [names];
    const r0 = A.size(list[0]);
    const tw = r0.w - inset * 2, th = r0.h - inset * 2;
    let row = 0;
    for (let yy = y; yy < y + h; yy += th, row++) {
      let col = 0;
      for (let xx = x; xx < x + w; xx += tw, col++) {
        const n = list[(row * 7 + col * 3 + ((row * col) % 5)) % list.length];
        const cw = Math.min(tw, x + w - xx), ch = Math.min(th, y + h - yy);
        A.drawPart(g, n, inset, inset, cw, ch, xx, yy);
      }
    }
  }

  runOps(g, ops) {
    const A = this.atlas;
    for (const o of ops) {
      if (o.kind === 'fn') { o.fn(g, A, this); continue; }
      if (o.kind === 'piece') {
        g.save();
        if (o.alpha !== undefined) g.globalAlpha = o.alpha;
        if (o.scale) {
          const r = A.size(o.name);
          g.translate(Math.round(o.x), Math.round(o.y));
          if (o.flip) { g.translate(r.w * o.scale, 0); g.scale(-1, 1); }
          g.drawImage(A.img, r.x, r.y, r.w, r.h, 0, 0, r.w * o.scale, r.h * o.scale);
        } else {
          A.draw(g, o.name, o.x, o.y, o.flip);
        }
        g.restore();
        continue;
      }
      if (o.kind === 'block') { this.drawBlock(g, o); continue; }
      if (o.kind === 'floor') { this.drawFloor(g, o); continue; }
    }
  }

  drawBlock(g, o) {
    g.save();
    g.beginPath(); g.rect(o.x, o.y, o.w, o.h); g.clip();
    this.tile(g, ['fill_1', 'fill_2'], o.x, o.y, o.w, o.h);
    // depth shading: masonry darkens away from its exposed top edge
    const gr = g.createLinearGradient(0, o.y, 0, o.y + o.h);
    gr.addColorStop(0, 'rgba(10,8,18,0.05)');
    gr.addColorStop(1, 'rgba(10,8,18,0.55)');
    g.fillStyle = gr;
    g.fillRect(o.x, o.y, o.w, o.h);
    g.restore();
    g.strokeStyle = '#0b0a10';
    g.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
  }

  drawFloor(g, o) {
    const A = this.atlas;
    const bh = A.size(o.band[0]).h;
    g.save();
    g.beginPath(); g.rect(o.x0, o.y, o.x1 - o.x0, o.bottom - o.y); g.clip();
    // masonry under the band
    this.tile(g, ['fill_1', 'fill_2'], o.x0, o.y + bh - 3, o.x1 - o.x0, o.bottom - o.y - bh + 3);
    const gr = g.createLinearGradient(0, o.y + bh, 0, o.y + bh + 90);
    gr.addColorStop(0, 'rgba(8,6,14,0.15)');
    gr.addColorStop(1, 'rgba(8,6,14,0.75)');
    g.fillStyle = gr;
    g.fillRect(o.x0, o.y + bh - 3, o.x1 - o.x0, o.bottom - o.y);
    let x = o.x0, i = 0;
    while (x < o.x1) {
      const n = o.band[i++ % o.band.length];
      A.draw(g, n, x, o.y);
      x += A.size(n).w - 2;
    }
    g.restore();
    if (o.capL) A.draw(g, 'wall_l', o.x0 - 4, o.y - 6);
    if (o.capR) A.draw(g, 'wall_r', o.x1 - A.size('wall_r').w + 4, o.y - 6);
  }

  // ---------------------------------------------------------------- per-frame drawing
  drawFar(ctx, cam) {
    const fx = cam.x * 0.82, fy = cam.y * 0.82;
    ctx.drawImage(this.farCanvas, Math.round(fx), Math.round(fy), VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
  }

  drawBack(ctx, cam, t) {
    ctx.drawImage(this.backCanvas, Math.round(cam.x), Math.round(cam.y), VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
    const A = this.atlas;
    for (const tr of this.torches) {
      const k = Math.floor((t + tr.phase) / tr.speed) % TORCH_SEQ.length;
      A.draw(ctx, 'torch_' + TORCH_SEQ[k], tr.x - cam.x, tr.y - cam.y);
    }
    for (const p of this.props) {
      if (p.broken) {
        if (p.stump) A.draw(ctx, p.stump, p.x - cam.x, p.y + p.h - A.size(p.stump).h - cam.y);
        continue;
      }
      A.draw(ctx, p.name, p.x - cam.x, p.y - cam.y);
    }
  }

  drawFg(ctx, cam) {
    ctx.drawImage(this.fgCanvas, Math.round(cam.x), Math.round(cam.y), VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
    ctx.drawImage(this.decalCanvas, Math.round(cam.x), Math.round(cam.y), VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
  }

  drawFront(ctx, cam) {
    // foreground silhouettes scroll faster than the playfield for depth
    const k = 1.25;
    ctx.drawImage(this.frontCanvas, Math.round(cam.x * k), Math.round(cam.y), VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
  }

  // Lights in screen space, with torch flicker.
  screenLights(cam, t) {
    const out = [];
    for (const l of this.lights) {
      if (l.a <= 0) continue;
      const par = l.layer === 'far' ? 0.82 : 1;
      const x = l.x - cam.x * par, y = l.y - cam.y * par;
      if (x < -l.r || x > VIEW_W + l.r || y < -l.r || y > VIEW_H + l.r) continue;
      const fl = l.flicker ? 0.86 + 0.1 * Math.sin(t * 0.31 + l.x) + 0.05 * Math.sin(t * 1.7 + l.y) : 1;
      out.push({ x, y, r: l.r * (l.flicker ? 0.96 + 0.04 * fl : 1), color: l.color, a: l.a * fl });
    }
    return out;
  }

  // Flame glows (additive) and moon shafts, drawn after the lighting multiply.
  drawGlow(ctx, cam, t) {
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.shafts) {
      const par = s.layer === 'far' ? 0.82 : 1;
      const x = s.x - cam.x * par, y = s.y - cam.y * par;
      if (x > VIEW_W + 200 || x + s.w + s.slant < -200) continue;
      const gr = ctx.createLinearGradient(0, y, 0, y + s.len);
      const [r, gg, b] = s.color;
      gr.addColorStop(0, `rgba(${r},${gg},${b},0.16)`);
      gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + s.w, y);
      ctx.lineTo(x + s.w + s.slant, y + s.len); ctx.lineTo(x + s.slant - 10, y + s.len);
      ctx.closePath(); ctx.fill();
      // motes drifting in the beam
      for (let i = 0; i < 7; i++) {
        const u = ((t * 0.0021 * (1 + i * 0.13) + i * 0.37) % 1);
        const mx = x + s.w * ((i * 0.618) % 1) + s.slant * u + Math.sin(t * 0.02 + i) * 3;
        const my = y + s.len * u;
        ctx.fillStyle = `rgba(200,210,255,${0.35 * Math.sin(u * Math.PI)})`;
        ctx.fillRect(Math.round(mx), Math.round(my), 1, 1);
      }
    }
    for (const tr of this.torches) {
      const x = tr.x + 30 - cam.x, y = tr.y + 12 - cam.y;
      if (x < -60 || x > VIEW_W + 60) continue;
      const f = 0.85 + 0.15 * Math.sin(t * 0.4 + tr.phase);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, 26 * f);
      gr.addColorStop(0, 'rgba(255,170,80,0.38)');
      gr.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - 28, y - 28, 56, 56);
    }
    for (const p of this.props) {
      if (p.broken) continue;
      for (const [fx, fy] of p.flames) {
        const x = p.x + fx - cam.x, y = p.y + fy - cam.y;
        const f = 0.8 + 0.2 * Math.sin(t * 0.5 + p.phase + fx);
        const gr = ctx.createRadialGradient(x, y, 0, x, y, 9 * f);
        gr.addColorStop(0, 'rgba(255,200,120,0.45)');
        gr.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(x - 10, y - 10, 20, 20);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  update(game) {
    const t = game.t;
    for (const tr of this.torches) if (Math.random() < 0.18) game.fx.embers(tr.x + 30, tr.y + 6, 1);
    for (const p of this.props) if (!p.broken && Math.random() < 0.02) {
      const [fx, fy] = p.flames[(Math.random() * p.flames.length) | 0];
      game.fx.embers(p.x + fx, p.y + fy, 1);
    }
    this.def.update?.(this, game, t);
  }
}
