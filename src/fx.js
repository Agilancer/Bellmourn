// Effects: pooled pixel particles (embers, sparks, dust, smoke, blood), the fireball, the sword
// slash arc and floating text. Blood droplets collide with room solids and leave decals, which is
// the groundwork for the gore-heavy combat to come.

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

const BLOOD = ['#5c0610', '#7a0a14', '#9b111e', '#b3172a', '#6a0812'];
const FIRE = ['#fff3c4', '#ffd36b', '#ffa43a', '#ff6a1f', '#d8321a'];

export class FX {
  constructor() {
    this.parts = [];
    this.ents = [];
    this.texts = [];
  }

  reset() { this.parts.length = 0; this.ents.length = 0; this.texts.length = 0; }

  add(ent) { this.ents.push(ent); return ent; }

  p(o) {
    if (this.parts.length > 2500) this.parts.shift();
    const life = o.life ?? 30;
    this.parts.push({
      x: o.x, y: o.y, vx: o.vx ?? 0, vy: o.vy ?? 0, life, max: life,
      color: o.color ?? '#fff', size: o.size ?? 1, gravity: o.gravity ?? 0, drag: o.drag ?? 1,
      glow: !!o.glow, kind: o.kind ?? 'plain', collide: !!o.collide, fade: o.fade ?? true,
    });
  }

  burst(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * (o.speed ?? 2);
      this.p({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.lift ?? 0), life: rand(0.6, 1) * (o.life ?? 24),
        color: Array.isArray(o.color) ? pick(o.color) : o.color, size: o.size ?? 1, gravity: o.gravity ?? 0.08,
        drag: 0.94, glow: o.glow ?? true });
    }
  }

  sparks(x, y, dir, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = rand(-1.1, 1.1) + (dir < 0 ? Math.PI : 0);
      const s = rand(1.5, 4.5);
      this.p({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: rand(10, 24), color: pick(['#fff6d0', '#ffd27a', '#ff9a3c']),
        gravity: 0.18, drag: 0.95, glow: true, collide: true, kind: 'spark' });
    }
  }

  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.p({ x: x + rand(-8, 8), y: y - rand(0, 3), vx: rand(-0.8, 0.8), vy: rand(-0.7, -0.1), life: rand(16, 30),
        color: pick(['#6b6377', '#544d61', '#7d7488']), size: pick([1, 1, 2]), drag: 0.92 });
    }
  }

  embers(x, y, n = 1) {
    for (let i = 0; i < n; i++) {
      this.p({ x: x + rand(-3, 3), y, vx: rand(-0.25, 0.25), vy: rand(-0.9, -0.35), life: rand(30, 70),
        color: pick(['#ffcf6a', '#ff8a3a', '#ff5a2a']), glow: true, drag: 0.99, kind: 'ember' });
    }
  }

  smoke(x, y, n = 1, big = false) {
    for (let i = 0; i < n; i++) {
      this.p({ x: x + rand(-3, 3), y: y + rand(-3, 3), vx: rand(-0.3, 0.3), vy: rand(-0.6, -0.15), life: rand(24, 48),
        color: pick(['#2b2633', '#3a3344', '#1f1b26']), size: big ? pick([2, 3, 4]) : pick([1, 2]), drag: 0.97, kind: 'smoke' });
    }
  }

  // Arterial spray: droplets fly in `dir`, fall, and stain whatever they hit.
  blood(x, y, dir, n = 40) {
    for (let i = 0; i < n; i++) {
      const s = rand(1, 5.5);
      const a = rand(-0.9, 0.35);
      this.p({ x, y, vx: Math.cos(a) * s * dir, vy: Math.sin(a) * s - rand(0, 1.5), life: rand(50, 110),
        color: pick(BLOOD), size: pick([1, 1, 1, 2, 2, 3]), gravity: 0.22, drag: 0.985, collide: true, kind: 'blood', fade: false });
    }
  }

  text(x, y, s, color) { this.texts.push({ x, y, s, color, life: 50 }); }

  update(game) {
    const room = game.room;
    for (const e of this.ents) e.update(game, this);
    this.ents = this.ents.filter((e) => !e.dead);
    for (const p of this.parts) {
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.gravity;
      const nx = p.x + p.vx, ny = p.y + p.vy;
      if (p.collide && room.pointSolid(nx, ny)) {
        if (p.kind === 'blood') {
          room.stain(nx, ny, p.color, p.size);
          // some droplets run down walls instead of stopping
          if (Math.random() < 0.25 && !room.pointSolid(p.x, ny)) { p.vx = 0; p.vy = 0.3; p.gravity = 0.01; p.x = p.x; continue; }
          p.life = 0;
        } else {
          p.vy *= -0.4; p.vx *= 0.6;
        }
        continue;
      }
      p.x = nx; p.y = ny;
      p.life--;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const t of this.texts) { t.life--; t.y -= 0.4; }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  draw(ctx, cam) {
    for (const e of this.ents) e.draw?.(ctx, cam);
    for (const p of this.parts) {
      if (p.glow) continue;
      ctx.globalAlpha = p.fade ? Math.min(1, (p.life / p.max) * 1.6) : 1;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // Additive pass, drawn after lighting so fire and sparks punch through the dark.
  drawGlow(ctx, cam) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      if (!p.glow) continue;
      const a = p.life / p.max;
      ctx.globalAlpha = Math.min(1, a * 1.4);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.size, p.size);
      if (p.size === 1 && a > 0.5) {
        ctx.globalAlpha = a * 0.25;
        ctx.fillRect(Math.round(p.x - cam.x) - 1, Math.round(p.y - cam.y), 3, 1);
        ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y) - 1, 1, 3);
      }
    }
    for (const e of this.ents) e.drawGlow?.(ctx, cam);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawText(ctx, cam) {
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life / 20);
      ctx.fillStyle = '#000';
      ctx.fillText(t.s, Math.round(t.x - cam.x) + 1, Math.round(t.y - cam.y) + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.s, Math.round(t.x - cam.x), Math.round(t.y - cam.y));
    }
    ctx.globalAlpha = 1;
  }

  lights() {
    const out = [];
    for (const e of this.ents) if (e.light) out.push(e.light());
    return out;
  }
}

// X: a hellfire bolt from the gauntlet. Pixel core, flickering corona, ember trail, smoke,
// and a burst + scorch when it hits stone or a breakable.
export class Fireball {
  constructor(x, y, dir) {
    this.x = x; this.y = y; this.dir = dir;
    this.vx = 6.4 * dir; this.t = 0; this.life = 80; this.dead = false;
  }

  update(game, fx) {
    this.t++;
    this.x += this.vx;
    this.y += Math.sin(this.t * 0.35) * 0.35;
    for (let i = 0; i < 3; i++) {
      fx.p({ x: this.x - this.dir * rand(0, 6), y: this.y + rand(-3, 3), vx: -this.dir * rand(0.3, 1.4), vy: rand(-0.6, 0.3),
        life: rand(8, 18), color: pick(FIRE), size: pick([1, 1, 2]), glow: true, drag: 0.9 });
    }
    if (this.t % 3 === 0) fx.smoke(this.x - this.dir * 8, this.y, 1);
    const hitBreakable = game.room.hitPoint(game, this.x + this.dir * 4, this.y, this.dir);
    if (hitBreakable || game.room.pointSolid(this.x + this.dir * 5, this.y) || --this.life <= 0) this.explode(game, fx);
  }

  explode(game, fx) {
    this.dead = true;
    fx.burst(this.x, this.y, 34, { color: FIRE, speed: 3.6, life: 26, gravity: 0.05, size: 1 });
    fx.burst(this.x, this.y, 10, { color: FIRE, speed: 1.6, life: 30, gravity: -0.02, size: 2 });
    fx.smoke(this.x, this.y, 12, true);
    fx.add(new Flash(this.x, this.y, 110, 'rgba(255,150,60,', 14));
    game.room.scorch(this.x + this.dir * 4, this.y);
    game.shake(2);
  }

  draw() {}

  drawGlow(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    const f = 1 + Math.sin(this.t * 1.7) * 0.15;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 16 * f);
    g.addColorStop(0, 'rgba(255,220,150,0.9)');
    g.addColorStop(0.35, 'rgba(255,120,40,0.55)');
    g.addColorStop(1, 'rgba(160,20,10,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(x - 18, y - 18, 36, 36);
    // pixel core: a teardrop pointing along travel
    const d = this.dir;
    const px = (ox, oy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + (d > 0 ? ox : -ox - w), y + oy, w, h); };
    px(-6, -2, 4, 4, '#ff6a1f');
    px(-3, -3, 5, 6, '#ffa43a');
    px(-1, -2, 4, 4, '#ffd36b');
    px(0, -1, 3, 2, '#fffbe8');
  }

  light() { return { x: this.x, y: this.y, r: 120 + Math.sin(this.t) * 8, color: [255, 150, 70], a: 1 }; }
}

// Short-lived light + glow (explosions, breaking candles).
export class Flash {
  constructor(x, y, r, rgba, life) { Object.assign(this, { x, y, r, rgba, life, max: life, dead: false }); }
  update() { if (--this.life <= 0) this.dead = true; }
  drawGlow(ctx, cam) {
    const a = this.life / this.max;
    const x = this.x - cam.x, y = this.y - cam.y, r = this.r * (0.4 + 0.3 * (1 - a));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, this.rgba + (0.7 * a) + ')');
    g.addColorStop(1, this.rgba + '0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  light() { return { x: this.x, y: this.y, r: this.r * 1.6, color: [255, 160, 90], a: this.life / this.max }; }
}

// The crescent left by a sword swing, swept from the raised blade to the follow-through,
// pinned to the swordsman so it travels with a moving attack.
export class SlashArc {
  constructor(player, action) {
    this.pl = player; this.action = action;
    this.t = 0; this.life = 10; this.dead = false;
    this.facing = player.facing;
  }

  update() { if (++this.t >= this.life) this.dead = true; }

  drawGlow(ctx, cam) {
    const pl = this.pl;
    const seg = pl.swordSegment();
    // pivot near the shoulder; radius reaches the blade tip at full extension
    const px = pl.x + this.facing * 2 - cam.x;
    const py = pl.y - 52 - cam.y + (pl.h < 50 ? 20 : 0);
    const R = Math.max(30, seg ? Math.hypot(seg.x1 - cam.x - px, seg.y1 - cam.y - py) : 44);
    const a0 = -100 * Math.PI / 180, a1 = 40 * Math.PI / 180;
    const k = this.t / this.life;
    const head = a0 + (a1 - a0) * Math.min(1, k * 2.2);   // leading edge sweeps fast
    const tail = a0 + (a1 - a0) * Math.max(0, k * 1.6 - 0.35);
    const steps = 14;
    ctx.save();
    ctx.translate(px, py);
    if (this.facing < 0) ctx.scale(-1, 1);
    for (let i = 0; i < steps; i++) {
      const u0 = tail + (head - tail) * (i / steps);
      const u1 = tail + (head - tail) * ((i + 1) / steps);
      const w = 1 + 6 * Math.sin(Math.PI * (i + 0.5) / steps) * (1 - k * 0.6);
      ctx.strokeStyle = `rgba(255,${120 + i * 9},${150 + i * 7},${0.55 * (1 - k)})`;
      ctx.lineWidth = w + 2;
      ctx.beginPath(); ctx.arc(0, 0, R - w / 2, u0, u1 + 0.02); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
      ctx.lineWidth = Math.max(1, w * 0.4);
      ctx.beginPath(); ctx.arc(0, 0, R - 1, u0, u1 + 0.02); ctx.stroke();
    }
    ctx.restore();
  }
}
