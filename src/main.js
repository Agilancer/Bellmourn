// Bellmourn : Castle Velscour — boot, fixed 60Hz loop, camera, room transitions and the frame
// compositor (sky -> far wall -> back props -> actors -> masonry -> lighting -> glow -> fog -> HUD).
import { Input } from './input.js';
import { SpriteSet, Atlas, loadImage, loadJSON } from './assets.js';
import { Player, Sword } from './player.js';
import { FX } from './fx.js';
import { Room, VIEW_W, VIEW_H } from './world.js';
import { ROOMS } from './rooms.js';

const TICK = 1000 / 60;
const FADE = 14;

class Game {
  constructor(sprites, atlas, sword) {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.text = document.getElementById('text');
    this.tctx = this.text.getContext('2d');
    [this.light, this.lctx] = this.makeCanvas(VIEW_W, VIEW_H);
    this.input = new Input();
    this.fx = new FX();
    this.atlas = atlas;
    this.rooms = {};
    for (const id of Object.keys(ROOMS)) this.rooms[id] = new Room(id, ROOMS[id], atlas);
    this.player = new Player(sprites, sword);
    this.cam = { x: 0, y: 0 };
    this.t = 0;
    this.shakeT = 0; this.shakeMag = 0;
    this.hitstopT = 0;
    this.flashA = 0; this.flashColor = '#fff';
    this.fade = { a: 1, dir: -1, then: null };
    this.banner = null;
    this.titleT = 0;
    this.debug = false;
    this.enter('hall', 'start');
    this.snapCamera();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return [c, g];
  }

  resize() {
    const s = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)));
    const k = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H) >= 1 ? s : Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
    this.scale = k;
    const stage = document.getElementById('stage');
    stage.style.width = VIEW_W * k + 'px';
    stage.style.height = VIEW_H * k + 'px';
    const dpr = devicePixelRatio || 1;
    this.text.width = Math.round(VIEW_W * k * dpr);
    this.text.height = Math.round(VIEW_H * k * dpr);
    this.textScale = k * dpr;
  }

  // ------------------------------------------------------------------ rooms
  enter(id, entryName) {
    this.room = this.rooms[id];
    this.room.reset();
    const e = this.room.def.entries[entryName];
    this.player.place(e.x, e.y, e.f);
    this.fx.reset();
    this.banner = { s: this.room.name, t: 0 };
  }

  goTo(id, entry) {
    if (this.fade.then) return;
    this.fade = { a: 0, dir: 1, then: () => { this.enter(id, entry); this.snapCamera(); } };
  }

  respawn() {
    if (this.fade.then) return;
    const p = this.player;
    this.fade = { a: 0, dir: 1, then: () => {
      p.place(p.lastSafe.x, p.lastSafe.y, p.facing);
      p.hp = Math.max(1, p.hp - 10);
      this.snapCamera();
      this.flash(0.4, '#7a0a14');
    } };
  }

  // Debug helpers for the console: game.paused = true; game.step(5, ['right'])
  step(n = 1, hold = []) {
    for (let i = 0; i < n; i++) {
      for (const k of hold) this.input.down.add(k);
      this.update();
    }
    for (const k of hold) this.input.down.delete(k);
    this.render();
  }

  press(k) { this.input.queued.add(k); }

  shake(m) { this.shakeMag = Math.max(this.shakeMag, m); this.shakeT = 10; }
  hitstop(n) { this.hitstopT = Math.max(this.hitstopT, n); }
  flash(a, color) { this.flashA = a; this.flashColor = color; }

  // ------------------------------------------------------------------ update
  update() {
    this.input.tick();
    if (this.input.pressed.debug) this.debug = !this.debug;
    if (this.fade.then || this.fade.dir < 0) {
      this.fade.a += this.fade.dir / FADE;
      if (this.fade.dir > 0 && this.fade.a >= 1) { this.fade.a = 1; const f = this.fade.then; this.fade = { a: 1, dir: -1, then: null }; f(); }
      else if (this.fade.dir < 0 && this.fade.a <= 0) { this.fade.a = 0; this.fade.dir = 0; }
      if (this.fade.then) return;   // the world holds still while the screen is dark (SOTN doors)
    }
    this.t++;
    this.titleT++;
    if (this.banner) this.banner.t++;
    if (this.hitstopT > 0) { this.hitstopT--; return; }

    const p = this.player;
    p.update(this);
    this.room.update(this);
    this.fx.update(this);

    // exits & pits
    const room = this.room;
    for (const ex of room.exits) {
      const out = ex.side === 'W' ? p.x < 4 : p.x > room.w - 4;
      if (out && p.y >= ex.y0 && p.y <= ex.y1 + 2) { this.goTo(ex.to, ex.entry); break; }
    }
    p.x = Math.max(2, Math.min(room.w - 2, p.x));
    if (p.y > room.h + 80) this.respawn();

    this.updateCamera();
    if (this.shakeT > 0) this.shakeT--; else this.shakeMag = 0;
    this.flashA *= 0.86;
  }

  camTarget() {
    const p = this.player;
    return {
      x: Math.max(0, Math.min(this.room.w - VIEW_W, p.x + p.facing * 28 - VIEW_W / 2)),
      y: Math.max(0, Math.min(this.room.h - VIEW_H, p.y - 44 - VIEW_H / 2 + 20)),
    };
  }

  snapCamera() { const t = this.camTarget(); this.cam.x = t.x; this.cam.y = t.y; }

  updateCamera() {
    const t = this.camTarget();
    this.cam.x += (t.x - this.cam.x) * 0.14;
    // vertical follow is lazier on the ground, quicker when falling far (shaft)
    const ky = this.player.vy > 6 ? 0.25 : 0.1;
    this.cam.y += (t.y - this.cam.y) * ky;
  }

  // ------------------------------------------------------------------ render
  render() {
    const ctx = this.ctx;
    const room = this.room;
    const sh = this.shakeMag ? { x: (Math.random() - 0.5) * this.shakeMag * 2, y: (Math.random() - 0.5) * this.shakeMag * 2 } : { x: 0, y: 0 };
    const cam = { x: Math.round(this.cam.x + sh.x), y: Math.round(this.cam.y + sh.y) };
    const t = this.t;

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    room.def.drawSky?.(ctx, cam, t, room);
    room.drawFar(ctx, cam);
    room.def.drawFarExtra?.(ctx, cam, t, room);
    room.drawBack(ctx, cam, t);
    this.player.draw(ctx, cam);
    this.fx.draw(ctx, cam);
    room.drawFg(ctx, cam);

    this.renderLighting(ctx, cam, t);
    room.drawGlow(ctx, cam, t);
    this.fx.drawGlow(ctx, cam);
    room.drawFront(ctx, cam);
    this.renderAtmosphere(ctx, t);
    this.fx.drawText(ctx, cam);
    this.renderHUD(ctx);
    if (this.debug) this.renderDebug(ctx, cam);

    if (this.flashA > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flashA;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.fade.a > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.fade.a})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    this.renderText();
  }

  // Multiply a light map over the scene: ambient fill + additive radial lights.
  renderLighting(ctx, cam, t) {
    const l = this.lctx;
    const [ar, ag, ab] = this.room.ambient;
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = `rgb(${ar},${ag},${ab})`;
    l.fillRect(0, 0, VIEW_W, VIEW_H);
    l.globalCompositeOperation = 'lighter';
    const lights = this.room.screenLights(cam, t);
    for (const f of this.fx.lights()) lights.push({ ...f, x: f.x - cam.x, y: f.y - cam.y });
    // the hero carries a faint aura so she always reads against the dark
    const p = this.player;
    lights.push({ x: p.x - cam.x, y: p.y - 40 - cam.y, r: 110, color: [150, 130, 170], a: 0.5 });
    for (const L of lights) {
      const g = l.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
      const [r, gg, b] = L.color;
      g.addColorStop(0, `rgba(${r},${gg},${b},${0.85 * L.a})`);
      g.addColorStop(0.45, `rgba(${r},${gg},${b},${0.32 * L.a})`);
      g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      l.fillStyle = g;
      l.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.light, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  renderAtmosphere(ctx, t) {
    // slow fog band + vignette; a cold violet grade that is Velscour's own (SOTN leans blue-grey)
    const fy = 240 + Math.sin(t * 0.004) * 20;
    const fog = ctx.createLinearGradient(0, fy - 60, 0, fy + 120);
    fog.addColorStop(0, 'rgba(70,50,90,0)');
    fog.addColorStop(0.5, 'rgba(70,50,90,0.10)');
    fog.addColorStop(1, 'rgba(70,50,90,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const v = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(4,0,8,0.62)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // Ornate gauges: gold-framed HP (crimson) and MP (blue) bars, pixel-drawn.
  renderHUD(ctx) {
    const p = this.player;
    const x = 12, y = 10;
    const bar = (yy, w, frac, c1, c2) => {
      ctx.fillStyle = '#0a0610'; ctx.fillRect(x + 22, yy, w + 4, 7);
      ctx.fillStyle = '#7a6230'; ctx.fillRect(x + 22, yy - 1, w + 4, 1); ctx.fillRect(x + 22, yy + 7, w + 4, 1);
      ctx.fillStyle = '#d6b05a'; ctx.fillRect(x + 22 + w + 4, yy - 1, 1, 9);
      ctx.fillStyle = c2; ctx.fillRect(x + 24, yy + 2, Math.round(w * frac), 3);
      ctx.fillStyle = c1; ctx.fillRect(x + 24, yy + 2, Math.round(w * frac), 1);
    };
    // medallion
    ctx.fillStyle = '#0a0610'; ctx.fillRect(x, y - 2, 22, 22);
    ctx.fillStyle = '#7a6230'; ctx.fillRect(x + 1, y - 1, 20, 20);
    ctx.fillStyle = '#1a0d18'; ctx.fillRect(x + 3, y + 1, 16, 16);
    ctx.fillStyle = '#9b111e'; ctx.fillRect(x + 8, y + 4, 6, 10); ctx.fillRect(x + 6, y + 6, 10, 4);
    ctx.fillStyle = '#ff5a6a'; ctx.fillRect(x + 9, y + 5, 1, 3);
    bar(y, 90, p.hp / p.hpMax, '#ff6070', '#a3122a');
    bar(y + 11, 60, p.mp / p.mpMax, '#9ec8ff', '#2a4ab0');
  }

  renderDebug(ctx, cam) {
    ctx.strokeStyle = '#0f0';
    const b = this.player.box;
    ctx.strokeRect(b.x - cam.x + 0.5, b.y - cam.y + 0.5, b.w, b.h);
    ctx.strokeStyle = '#ff0';
    for (const o of this.room.oneways) { ctx.beginPath(); ctx.moveTo(o.x - cam.x, o.y - cam.y + 0.5); ctx.lineTo(o.x + o.w - cam.x, o.y - cam.y + 0.5); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,0,255,0.6)';
    for (const s of this.room.solids) ctx.strokeRect(s.x - cam.x + 0.5, s.y - cam.y + 0.5, s.w - 1, s.h - 1);
    const seg = this.player.swordSegment();
    if (seg) { ctx.strokeStyle = '#f00'; ctx.beginPath(); ctx.moveTo(seg.x0 - cam.x, seg.y0 - cam.y); ctx.lineTo(seg.x1 - cam.x, seg.y1 - cam.y); ctx.stroke(); }
    ctx.fillStyle = '#0f0'; ctx.font = '8px monospace'; ctx.textAlign = 'left';
    const p = this.player;
    ctx.fillText(`${p.anim}:${p.frame} ${p.action ? p.action.set + ':' + p.action.i : ''} vx ${p.vx.toFixed(2)} vy ${p.vy.toFixed(2)} ${p.onGround ? 'G' : 'A'}`, 6, VIEW_H - 6);
  }

  // Crisp text on the overlay canvas (display resolution): title card, room banners, HUD numbers.
  renderText() {
    const g = this.tctx, s = this.textScale;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.text.width, this.text.height);
    g.setTransform(s, 0, 0, s, 0, 0);
    const p = this.player;
    g.textAlign = 'left';
    g.font = '700 6px Cinzel, serif';
    g.fillStyle = '#e8d8b0';
    g.fillText(`HP ${p.hp}`, 12 + 120, 10 + 6);
    g.fillStyle = '#b8ccff';
    g.fillText(`MP ${p.mp}`, 12 + 90, 21 + 6);

    // title card on boot
    const tt = this.titleT;
    if (tt < 420) {
      const a = Math.min(1, tt / 40) * Math.min(1, (420 - tt) / 60);
      g.textAlign = 'center';
      g.globalAlpha = a;
      g.shadowColor = 'rgba(120,0,20,0.9)'; g.shadowBlur = 8;
      g.fillStyle = '#e9dcc2';
      g.font = '700 30px "Cinzel Decorative", Cinzel, serif';
      g.fillText('Bellmourn', VIEW_W / 2, 132);
      g.font = '500 11px Cinzel, serif';
      g.fillStyle = '#b89a6a';
      g.fillText('~  C A S T L E   V E L S C O U R  ~', VIEW_W / 2, 152);
      g.shadowBlur = 0;
      g.font = '500 7px Cinzel, serif';
      g.fillStyle = '#9a8aa8';
      g.fillText('ARROWS move   ·   C jump (twice to double jump, ↓+C slide / drop)   ·   V attack   ·   X fireball', VIEW_W / 2, 336);
      g.globalAlpha = 1;
    } else if (this.banner && this.banner.t < 200) {
      const bt = this.banner.t;
      const a = Math.min(1, bt / 25) * Math.min(1, (200 - bt) / 40);
      g.globalAlpha = a;
      g.textAlign = 'center';
      g.font = '700 12px Cinzel, serif';
      g.fillStyle = '#d9c7a0';
      g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 4;
      g.fillText(this.banner.s, VIEW_W / 2, 58);
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(184,154,106,0.8)';
      g.fillRect(VIEW_W / 2 - 70, 63, 140, 0.6);
      g.globalAlpha = 1;
    }
  }
}

async function boot() {
  const [sprites, atlas, swordImg, swordMeta, weapon] = await Promise.all([
    SpriteSet.load('assets/player/'),
    Atlas.load('assets/castle/atlas.png', 'assets/castle/atlas.json'),
    loadImage('assets/player/sword.png'),
    loadJSON('assets/player/sword.json'),
    loadJSON('assets/player/weapon.json'),
  ]);
  try { await document.fonts.load('700 12px Cinzel'); } catch { /* fonts are optional */ }
  document.getElementById('loading').remove();
  const game = new Game(sprites, atlas, new Sword(swordImg, swordMeta, weapon));
  window.game = game;   // handy for console poking
  let acc = 0, last = performance.now();
  const frame = (now) => {
    acc += Math.min(100, now - last);
    last = now;
    if (game.paused) acc = 0;
    while (acc >= TICK) { game.update(); acc -= TICK; }
    game.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  document.getElementById('loading').textContent = 'The castle refused to rise: ' + e.message;
  console.error(e);
});
