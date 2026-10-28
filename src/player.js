// The Agilancer. Movement is Alucard's, read from the SOTN decompilation (src/dra/*.c,
// sotn-decomp) and scaled by K because our hero is ~80px tall against Alucard's ~50px:
//   walk / air speed 1.5 px/f   jump -4.875   double jump -4.25   gravity 22/128
//   apex "hang": gravity /5 while jump is held and -1/8 < vy < 3/8 (else /2 there)
//   releasing jump while vy < -1 clamps vy to -1     terminal velocity 7
//   walking off a ledge drops with 0.75 px/f of drift     ground attacks root you in place
import { Fireball, SlashArc } from './fx.js';

const K = 1.6;
export const PHYS = {
  walk: 1.5 * K,
  run: 2.4 * K,           // not in SOTN: double-tap a direction to break into a run (uses the run/stop art)
  doubleTap: 14,          // ticks allowed between the two taps
  air: 1.5 * K,
  airDecel: K / 16,
  ledgeDrift: 0.75 * K,
  jump: -4.875 * K,
  doubleJump: -4.25 * K,
  gravity: (22 / 128) * K,
  apexLo: (-1 / 8) * K,
  apexHi: (3 / 8) * K,
  releaseClamp: -1 * K,
  terminal: 7 * K,
  ceilingBounce: -0.25 * K,
  slide: 4.6 * K,
  slideFriction: 0.93,
};

const W = 16;            // collision box
const H_STAND = 64;
const H_LOW = 40;

const ANIM_TICKS = {
  idle: [9, 9, 9, 9, 9, 9, 9, 9],
  // Solved against the art so the planted foot stays put at walk speed (72px per 30-tick cycle):
  // the doubled contact poses (3/4, 7/0, as in the reference sheet) are kept short, the passing
  // poses long. WALK_NUDGE adds the remaining per-frame offset (residual slide <= 1.4px).
  walk: [3, 3, 7, 2, 3, 3, 7, 2],
  run: [4, 3, 3, 4, 4, 3, 3, 4],
  stop: [3, 3, 3, 3, 3, 4, 4, 4],
  double_jump: [3, 3, 3, 3, 3, 3, 3, 4],
  slide: [2, 4, 4, 4, 4, 3, 3, 3],
};
const WALK_NUDGE = [-1, -2, 1, 2, -3, 1, -1, 3];

// Attack: ready, cock back, raise, drive, extend, follow-through, retract, ready.
const ATTACK_TICKS = [2, 3, 3, 2, 3, 3, 3, 3];
const ATTACK_ACTIVE = [3, 4, 5];
// Smear ghosts trailing the blade on the fast frames: angles swept since the previous frame.
const SMEAR = { 3: [[195, 0.18], [230, 0.28], [265, 0.4]], 4: [[315, 0.25], [330, 0.35], [345, 0.45]], 5: [[8, 0.3]] };

const CAST_FRAMES = [[1, 4], [3, 3], [4, 16], [5, 4]];  // [attack frame, ticks]
const CAST_COST = 8;

export class Player {
  constructor(sprites, sword) {
    this.sprites = sprites;
    this.sword = sword;   // Sword: pre-rendered angles + per-set swing table
    this.x = 0; this.y = 0;        // feet centre
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = true;
    this.h = H_STAND;
    this.anim = 'idle'; this.frame = 0; this.ft = 0;
    this.tapDir = 0; this.tapT = 99;
    this.running = false;
    this.jumpHeld = false;
    this.doubleJumped = false;
    this.airSpeed = PHYS.air;
    this.action = null;            // { kind: 'attack'|'cast', set, i, t, ... }
    this.crouching = false;
    this.slideT = 0;
    this.landT = 0;
    this.dropT = 0;
    this.afterimages = [];
    this.hp = 100; this.hpMax = 100;
    this.mp = 50; this.mpMax = 50; this.mpRegen = 0;
    this.lastSafe = { x: 0, y: 0 };
  }

  get box() { return { x: this.x - W / 2, y: this.y - this.h, w: W, h: this.h }; }

  place(x, y, facing = 1) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.facing = facing;
    this.onGround = true; this.action = null; this.setAnim('idle');
    this.lastSafe = { x, y };
  }

  setAnim(name, frame = 0) {
    if (this.anim !== name || frame !== this.frame) { this.anim = name; this.frame = frame; this.ft = 0; }
  }

  stepAnim(ticks, loop = true) {
    this.ft++;
    if (this.ft >= ticks[this.frame]) {
      this.ft = 0;
      if (this.frame < ticks.length - 1) this.frame++;
      else if (loop) this.frame = 0;
      else return true;
    }
    return false;
  }

  update(game) {
    const inp = game.input;
    const room = game.room;
    const dir = inp.axisX();
    const wasGround = this.onGround;

    // double-tap detection for the run
    this.tapT++;
    const tap = inp.pressed.right ? 1 : inp.pressed.left ? -1 : 0;
    if (tap) {
      if (tap === this.tapDir && this.tapT <= PHYS.doubleTap && this.onGround && !this.crouching) this.running = true;
      this.tapDir = tap; this.tapT = 0;
    }
    if (++this.mpRegen >= 40) { this.mpRegen = 0; this.mp = Math.min(this.mpMax, this.mp + 1); }
    if (this.dropT > 0) this.dropT--;

    // ---- action starts -------------------------------------------------------------------
    if (inp.pressed.jump && !this.ground_locked()) {
      if (this.onGround) {
        if (inp.held.down) {
          if (room.oneWayUnder(this.box)) { this.dropT = 12; this.y += 2; this.onGround = false; this.airSpeed = PHYS.ledgeDrift; }
          else if (!this.slideT) this.startSlide(game);
        } else {
          this.jump(game, PHYS.jump);
        }
      } else if (!this.doubleJumped && !this.action) {
        this.doubleJumped = true;
        this.vy = PHYS.doubleJump;
        this.jumpHeld = true;
        if (dir) this.facing = dir;
        this.setAnim('double_jump');
        game.fx.burst(this.x, this.y - 6, 10, { color: '#c9b8ff', speed: 1.6, life: 18, gravity: 0.05, size: 1 });
      }
    }
    if (inp.pressed.attack && !this.action && !this.slideT) this.startAttack(dir);
    if (inp.pressed.cast && !this.action && !this.slideT) {
      if (this.mp >= CAST_COST) this.startCast();
      else game.fx.text(this.x, this.y - 84, 'NO MP', '#7aa0ff');
    }
    if (inp.pressed.debugBlood) game.fx.blood(this.x + this.facing * 26, this.y - 46, this.facing, 60);

    // ---- horizontal --------------------------------------------------------------------
    if (this.onGround) this.groundMove(game, dir, inp);
    else this.airMove(dir);

    // ---- vertical ----------------------------------------------------------------------
    if (!this.onGround) {
      if (this.jumpHeld && !inp.held.jump) this.jumpHeld = false;
      if (this.vy < PHYS.releaseClamp && !this.jumpHeld) this.vy = PHYS.releaseClamp;
      let g = PHYS.gravity;
      if (this.vy > PHYS.apexLo && this.vy < PHYS.apexHi) g = this.jumpHeld ? g / 5 : g / 2;
      this.vy = Math.min(PHYS.terminal, this.vy + g);
    }

    // ---- collide -----------------------------------------------------------------------
    const lowNow = this.slideT > 0 || this.crouching || (this.action && this.action.set === 'attack_crouching');
    this.setHeight(lowNow ? H_LOW : H_STAND, room);
    const hit = room.move(this, this.vx, this.vy, this.dropT > 0);
    if (hit.ceiling && this.vy < 0) this.vy = PHYS.ceilingBounce;
    if (hit.wall && this.slideT) this.slideT = Math.min(this.slideT, 3);

    if (this.onGround) {
      this.vy = 0;
      this.doubleJumped = false;
      if (!wasGround) this.land(game, hit.impactVy);
      if (room.solidUnderFeet(this)) this.lastSafe = { x: this.x, y: this.y };
    } else if (wasGround && this.vy >= 0) {
      // walked off a ledge: SOTN gives only a little drift
      this.airSpeed = this.running ? PHYS.run * 0.6 : PHYS.ledgeDrift;
      this.running = false;
      if (!this.action) this.setAnim('jump', 5);
    }

    this.updateAction(game, dir);
    this.updateAnim();
    this.updateAfterimages();
  }

  ground_locked() {
    // ground attacks and casts commit you (SOTN); air attacks don't block the double jump input buffer
    return this.action && this.onGround;
  }

  setHeight(h, room) {
    if (h === this.h) return;
    if (h > this.h && room.blocked({ x: this.x - W / 2, y: this.y - h, w: W, h: h - 1 })) return;  // can't stand up
    this.h = h;
  }

  jump(game, v) {
    this.vy = v;
    this.onGround = false;
    this.jumpHeld = true;
    this.crouching = false;
    this.slideT = 0;
    this.airSpeed = this.running ? PHYS.run : PHYS.air;
    this.setAnim('jump', 2);
    game.fx.dust(this.x, this.y, 6);
  }

  startSlide(game) {
    this.slideT = 30;
    this.crouching = false;
    this.vx = this.facing * PHYS.slide;
    this.setAnim('slide');
    game.fx.dust(this.x - this.facing * 6, this.y, 8);
  }

  land(game, impactVy) {
    this.running = this.running && game.input.axisX() !== 0;
    if (this.action && this.action.set === 'attack_jumping') {
      this.action.set = 'attack_standing';
    } else if (!this.action && impactVy > 5) {
      this.landT = impactVy > 9 ? 9 : 6;
      this.setAnim('jump', 6);
    }
    if (impactVy > 4) game.fx.dust(this.x, this.y, impactVy > 9 ? 12 : 6);
    if (impactVy > 10.5) game.shake(3);
  }

  groundMove(game, dir, inp) {
    const act = this.action;
    if (this.slideT) {
      this.slideT--;
      this.vx *= PHYS.slideFriction;
      if (this.slideT % 3 === 0) game.fx.dust(this.x - this.facing * 10, this.y, 1);
      if (!this.slideT) this.vx = 0;
      return;
    }
    if (act) {
      if (act.kind === 'cast' || act.set === 'attack_standing' || act.set === 'attack_crouching') { this.vx = 0; return; }
      // moving attacks keep stride while the direction is held, otherwise plant and finish standing
      const moving = dir === this.facing;
      if (!moving) { act.set = 'attack_standing'; this.vx = 0; this.running = false; return; }
      this.vx = this.facing * (act.set.startsWith('attack_running') ? PHYS.run : PHYS.walk);
      return;
    }
    this.crouching = inp.held.down;
    if (this.crouching) {
      if (dir) this.facing = dir;
      this.vx = 0; this.running = false;
      return;
    }
    if (this.landT > 0) {
      this.landT--;
      if (!dir) { this.vx = 0; return; }
      this.landT = 0;
    }
    if (dir) {
      if (dir !== this.facing) this.running = false;
      this.facing = dir;
      this.vx = dir * (this.running ? PHYS.run : PHYS.walk);
    } else {
      if (this.running) {
        this.running = false;
        this.setAnim('stop');
        this.vx = this.facing * PHYS.run * 0.7;
      }
      if (this.anim === 'stop') {
        this.vx *= 0.8;
        if (Math.abs(this.vx) < 0.2) this.vx = 0;
        if (this.frame < 3 && this.ft === 0) game.fx.dust(this.x + this.facing * 8, this.y, 1);
      } else {
        this.vx = 0;
      }
    }
  }

  airMove(dir) {
    const attacking = this.action && this.action.kind === 'attack';
    if (dir) {
      this.vx = dir * this.airSpeed;
      if (!attacking && this.action?.kind !== 'cast') this.facing = dir;
    } else {
      const s = Math.max(0, Math.abs(this.vx) - PHYS.airDecel);
      this.vx = Math.sign(this.vx) * s;
    }
  }

  // ---- attacks / spells ----------------------------------------------------------------
  startAttack(dir) {
    let set;
    if (!this.onGround) set = 'attack_jumping';
    else if (this.crouching) set = 'attack_crouching';
    else if (dir && this.running) set = 'attack_running';
    else if (dir && this.anim === 'walk') set = 'attack_walking';
    else set = 'attack_standing';
    // Moving attacks have two leg phases (A starts on step 0, B on step 4): pick the one closest
    // to where the locomotion cycle is now so the legs don't pop.
    if (set === 'attack_walking' || set === 'attack_running') {
      const p = this.frame;
      if (p >= 2 && p <= 5) set += '_b';
    }
    this.action = { kind: 'attack', set, i: 0, t: 0, hits: new Set(), slashed: false };
    if (set === 'attack_standing' || set === 'attack_crouching') this.running = false;
  }

  startCast() {
    this.mp -= CAST_COST;
    this.action = { kind: 'cast', set: this.onGround ? 'attack_standing' : 'attack_jumping', step: 0, t: 0, i: CAST_FRAMES[0][0], fired: false };
    this.running = false;
  }

  updateAction(game, dir) {
    const a = this.action;
    if (!a) return;
    if (a.kind === 'attack') {
      // a running/walking attack started mid-air or that lost its stride falls back gracefully
      if (!this.onGround && a.set !== 'attack_jumping') a.set = 'attack_jumping';
      a.t++;
      if (a.t >= ATTACK_TICKS[a.i]) {
        a.t = 0; a.i++;
        if (a.i >= ATTACK_TICKS.length) {
          this.action = null;
          // resume locomotion on the step the attack legs ended on
          if (this.onGround && dir) {
            const name = this.running ? 'run' : 'walk';
            this.setAnim(name, a.set.endsWith('_b') ? 4 : 0);
          }
          return;
        }
      }
      if (a.i === 3 && a.t === 0 && !a.slashed) {
        a.slashed = true;
        game.fx.add(new SlashArc(this, a));
      }
      if (ATTACK_ACTIVE.includes(a.i)) {
        const seg = this.swordSegment();
        if (seg) game.room.hitSegment(game, seg, a.hits, this.facing);
      }
    } else if (a.kind === 'cast') {
      a.t++;
      a.i = CAST_FRAMES[a.step][0];
      if (a.step === 2 && !a.fired) {
        a.fired = true;
        const f = this.sprites.frame(a.set, a.i);
        const hx = this.facing > 0 ? this.x + (f.hand[0] - f.ax) : this.x - (f.hand[0] - f.ax);
        const hy = this.y - f.ay + f.hand[1];
        game.fx.add(new Fireball(hx + this.facing * 6, hy, this.facing));
        game.fx.burst(hx + this.facing * 4, hy, 14, { color: '#ffb347', speed: 2.2, life: 16, size: 1 });
        game.flash(0.12, '#ff8a3a');
      }
      if (a.t >= CAST_FRAMES[a.step][1]) {
        a.t = 0; a.step++;
        if (a.step >= CAST_FRAMES.length) { this.action = null; return; }
        a.i = CAST_FRAMES[a.step][0];
      }
      if (!this.onGround) a.set = 'attack_jumping';
      else if (a.set === 'attack_jumping') a.set = 'attack_standing';
    }
  }

  // World-space sword grip + tip for the current attack frame, or null.
  swordSegment() {
    const a = this.action;
    if (!a || a.kind !== 'attack') return null;
    const deg = this.sword.angle(a.set, a.i);
    if (deg === null) return null;
    const f = this.sprites.frame(a.set, a.i);
    const hx = this.x + this.facing * (f.hand[0] - f.ax);
    const hy = this.y - f.ay + f.hand[1];
    const r = deg * Math.PI / 180;
    const dx = Math.cos(r) * this.facing, dy = Math.sin(r);
    const L = this.sword.blade + 6;
    return { x0: hx, y0: hy, x1: hx + dx * L, y1: hy + dy * L, deg, dx, dy };
  }

  // ---- animation selection ---------------------------------------------------------------
  updateAnim() {
    if (this.action) return;  // action frames are drawn directly
    if (this.slideT) { this.stepAnim(ANIM_TICKS.slide, false); return; }
    if (this.onGround) {
      if (this.anim === 'jump' && this.landT > 0) {
        this.setAnim('jump', this.landT > 3 ? 6 : 7);
        return;
      }
      if (this.crouching) {
        if (this.anim !== 'crouch') this.setAnim('crouch', 2);
        if (this.frame < 6) this.stepAnim([2, 2, 2, 2, 2, 2, 99, 99], false);
        return;
      }
      if (this.anim === 'crouch' && this.frame > 1) {   // stand back up through the crouch frames
        this.ft++;
        if (this.ft >= 2) { this.ft = 0; this.frame -= 2; }
        if (this.frame > 1) return;
      }
      if (this.anim === 'stop' && this.vx !== 0) { this.stepAnim(ANIM_TICKS.stop, false); return; }
      if (this.anim === 'stop' && this.frame < 7) { if (this.stepAnim(ANIM_TICKS.stop, false)) this.setAnim('idle'); return; }
      if (this.vx !== 0) {
        const name = this.running ? 'run' : 'walk';
        if (this.anim !== name) {
          // walk -> run keeps the step phase (both cycles start on a contact/stride)
          const keep = (this.anim === 'walk' || this.anim === 'run') ? this.frame : 0;
          this.setAnim(name, keep);
        }
        this.stepAnim(ANIM_TICKS[name]);
      } else {
        if (this.anim !== 'idle') this.setAnim('idle');
        this.stepAnim(ANIM_TICKS.idle);
      }
      return;
    }
    if (this.anim === 'double_jump') {
      if (!this.stepAnim(ANIM_TICKS.double_jump, false)) return;
    }
    // airborne: pose chosen from vertical velocity
    let f;
    if (this.vy < -5) f = 2;
    else if (this.vy < -1.6) f = 3;
    else if (this.vy < 1.8) f = 4;
    else f = 5;
    this.anim = 'jump'; this.frame = f; this.ft = 0;
  }

  updateAfterimages() {
    const fast = this.slideT > 0 || this.anim === 'double_jump' || (this.running && this.onGround && this.vx !== 0) ||
      (this.action && this.action.set && this.action.set.startsWith('attack_running'));
    this.ghostTick = (this.ghostTick || 0) + 1;
    if (fast && this.ghostTick % 4 === 0) {
      const { anim, frame } = this.drawFrame();
      this.afterimages.push({ anim, frame, x: this.x, y: this.y, flip: this.facing < 0, life: 15 });
    }
    for (const g of this.afterimages) g.life--;
    this.afterimages = this.afterimages.filter((g) => g.life > 0);
  }

  drawFrame() {
    if (this.action) return { anim: this.action.set, frame: this.action.i };
    return { anim: this.anim, frame: this.frame };
  }

  // ---- render ------------------------------------------------------------------------------
  draw(ctx, cam) {
    const S = this.sprites;
    for (const g of this.afterimages) {
      ctx.globalAlpha = (g.life / 15) * 0.22;
      S.draw(ctx, g.anim, g.frame, g.x - cam.x, g.y - cam.y, g.flip, S.tinted(g.anim, '#9a1f5c'));
    }
    ctx.globalAlpha = 1;
    const { anim, frame } = this.drawFrame();
    const nudge = anim === 'walk' ? WALK_NUDGE[frame] * this.facing : 0;
    const x = this.x - cam.x + nudge, y = this.y - cam.y;
    const seg = this.swordSegment();
    const behind = seg && this.sword.behind.includes(this.action.i);   // wind-up over the far shoulder
    if (seg && behind) this.drawSword(ctx, seg, cam);
    S.draw(ctx, anim, frame, x, y, this.facing < 0);
    if (seg && !behind) this.drawSword(ctx, seg, cam);
  }

  drawSword(ctx, seg, cam) {
    const sx = seg.x0 - cam.x, sy = seg.y0 - cam.y;
    const smear = this.action.t < 2 ? SMEAR[this.action.i] : null;
    if (smear) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [deg, a] of smear) { ctx.globalAlpha = a; this.sword.draw(ctx, sx, sy, deg, this.facing, true); }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    this.sword.draw(ctx, sx, sy, seg.deg, this.facing);
  }
}

// The longsword: 72 pre-rendered angles (tools/build_sword.py) plus the swing table
// (assets/player/weapon.json). Angles are in the facing direction: 0 forward, +90 down.
export class Sword {
  constructor(img, meta, weapon) {
    this.img = img;
    this.frames = meta.frames;
    this.step = meta.step;
    this.blade = meta.blade;
    this.angles = weapon.angles;
    this.behind = weapon.behind;
    // pale silhouette for smear ghosts
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#d8d0ff';
    g.fillRect(0, 0, c.width, c.height);
    this.ghost = c;
  }

  angle(set, i) {
    const t = this.angles[set.replace(/_b$/, '')] ?? this.angles.default;
    return t[i];
  }

  draw(ctx, x, y, deg, facing, ghost = false) {
    const world = facing > 0 ? deg : 180 - deg;      // mirror the swing when facing left
    const n = this.frames.length;
    const f = this.frames[((Math.round(world / this.step) % n) + n) % n];
    ctx.drawImage(ghost ? this.ghost : this.img, f.x, f.y, f.w, f.h, Math.round(x - f.px), Math.round(y - f.py), f.w, f.h);
  }
}
