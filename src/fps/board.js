// Shield boarding, after Zelda's shield surfing. Jump and keep Space held: by the time you land the
// shield is off your arm and under your feet, and you ride it on with the speed you had. Slopes
// speed you up (stairs too: a flight rides as a slope), flat ground slows you by what it is (old
// snow hardly at all, earth and grass more, stone most, throwing sparks), a crest or a ramp throws
// you into the air with the speed you had, and a landing on a downslope turns the drop into speed.
// W pushes a little, S drags a heel, A and D carve, all as you look: turn round and fight on the way
// down and the shield keeps going where it was going. Tap Space again quickly to hop; let go of it
// to step off (the shield back on the arm, and you run out your speed). A wall met side-on turns you
// along it; head-on at speed it throws you off. Ride into a foe fast and it's knocked flying.
//
// A two-hander can carry a shield too (bag.js): it gives nothing then, no Guard, no stats; it's only
// ridden. On a one-hander's arm the shield drops out of sight and comes back under your feet.
import * as THREE from 'three';
import { R, HEIGHT, STEP, GRAVITY } from './player.js';

const HOLD = 0.12;      // Space held this long, off the ground: the shield comes off the arm
const SWAP = 0.12;      // the arm dips out of sight this long, lets go of it, and comes back empty
const FLY = 0.2;        // the shield from the hand to under the feet
const RETAP = 0.2;      // let go of Space this long and you step off; pressed again sooner, a hop
const VMAX = 32;        // the fastest a shield goes on the ground (m/s; a run is 9.4)
const DRAG = 0.011;     // the air against you (x speed squared): about 20 m/s down a 20-degree slope of earth
const PUSH = 6.5, PUSH_TOP = 9;   // W: a push, strong from still, a little at speed
const BRAKE = 5;        // S (against the way you go): a heel dragged
const CARVE = 17, TURN = 2.6, AIR_TURN = 0.8;   // A/D: the sideways grip (m/s/s) and the fastest turn (rad/s)
const POP = 6.4;        // the hop
const CRASH = 11;       // m/s straight into a wall: thrown off
const RAM = 6;          // m/s: a foe in the way is knocked flying
const SOFT = 20;        // m/s into the ground before a landing hurts (on foot, 16)
const CROUCH = 0.3;     // the eye lower on the shield, the knees bent
// how much the ground holds the shield back (a share of its weight)
const GRIP = { snow: 0.045, dirt: 0.12, wood: 0.15, stone: 0.2, water: 0.6 };
// what flies up from under it
const C = (...h) => h.map((x) => new THREE.Color(x));
const SPRAY = {
  snow: { col: C('#ffffff', '#eef4ff', '#d8e4f4'), rate: 4, speed: 3.2, size: 0.06, grav: 3, life: 0.7 },
  dirt: { col: C('#7a6650', '#8e7a5e', '#5e5040'), rate: 1.6, speed: 1.8, size: 0.07, grav: 1.2, life: 0.8 },
  wood: { col: C('#a08a6a', '#806a50'), rate: 0.6, speed: 1.2, size: 0.04, grav: 4, life: 0.5 },
  stone: { col: C('#fff4d0', '#ffd27a', '#ff9a30'), rate: 2.4, speed: 4, size: 0.025, grav: 10, life: 0.35, min: 4 },
  water: { col: C('#ffffff', '#cfe8ff', '#a8d0f0'), rate: 5, speed: 3.5, size: 0.06, grav: 9, life: 0.6 },
};
const UP = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3(), _a = new THREE.Vector3(), _h = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _x = new THREE.Vector3(), _z = new THREE.Vector3(), _p = new THREE.Vector3();
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class Board {
  /** o: {scene, camera, vm, sfx, particles, surface: () => 'snow' | 'dirt' | 'stone' | 'wood' | 'water',
   * model: (id, finish) => Promise<Object3D> (the shield's own model), hooks: {onRam(player, speed) ->
   * how many were struck, onCrash(speed), onFirst()}} */
  constructor(o) {
    Object.assign(this, { scene: o.scene, camera: o.camera, vm: o.vm, sfx: o.sfx, particles: o.particles, surface: o.surface, model: o.model, hooks: o.hooks || {} });
    this.shield = null;      // what's ridden: {model, finish, onArm} (setShield)
    this.on = false;         // riding: the board's physics move you, in the air or on the ground
    this.air = false;
    this.landed = false;     // (touched the ground since getting on: before it, letting go just puts it back)
    this.holdT = 0;          // Space held this long
    this.upT = -1;           // Space let go this long (-1: it's held)
    this.cool = 0;
    this.speed = 0;
    this.kick = 0;           // degrees the view widens with speed (main.js adds it)
    this.n = new THREE.Vector3(0, 1, 0);   // the ground's slope under the shield
    this.look = new THREE.Vector3(0, 1, 0); this.head = new THREE.Vector3(0, 0, -1);   // (the board's own tilt and heading, eased)
    this.where = 'dirt'; this.whereT = 0;
    this.last = null;
    this.spray = 0;
    this.root = new THREE.Group();          // placed in the world each frame
    // the model laid flat in it, face down on the ground (you stand on its back) and its bottom
    // forward: a kite's point straight ahead under you. (The model's face is -z, its top +y.)
    this.inner = new THREE.Group();
    this.inner.rotation.set(-Math.PI / 2, Math.PI, 0, 'YXZ');
    // (as it's held: upright, its face out the way you look and its back to you, as on the arm)
    this.held = this.inner.quaternion.clone().invert();
    this.root.add(this.inner);
    this.root.visible = false;
    this.scene.add(this.root);
    this.mix = 0;            // 0: in the hand, 1: under the feet
    this.swap = null;        // the arm's dip: {t, off (taking the shield off the arm, or back)}
    this.tumble = null;      // thrown off: the shield flying loose {v, spin, t}
    this.loop = null;        // its scrape and the wind
  }

  /** Off the arm (mounting, riding or flying loose): main.js keeps the hand empty meanwhile. */
  get off() { return this.on || !!this.tumble || (this.swap?.off ?? false) || this.mix > 0; }

  /** What the character carries in the off-hand (gear), or null: what's ridden. `onArm`: it's on the
   * arm in the view (not with a two-hander, which carries it out of sight). */
  setShield(it, onArm) {
    const want = it && /shield/.test(it.kind) ? { model: it.model, finish: it.finish || '', onArm } : null;
    const same = want && this.shield && want.model === this.shield.model && want.finish === this.shield.finish;
    this.shield = want;
    if (!want) { if (this.on || this.mix > 0 || this.tumble) this.cancel(); this.inner.clear(); this.size = null; return; }
    if (same) return;
    const ask = this.asked = want.model + '|' + want.finish;
    this.model(want.model, want.finish).then((o) => {
      if (this.asked !== ask || !o) return;
      // centred, face down and its bottom forward, a hair over the ground
      const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
      o.position.sub(c);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
      this.inner.clear(); this.inner.add(o);
      this.inner.position.y = s.z / 2 + 0.015;
      this.size = { w: s.x, h: s.y };
    }).catch((e) => console.warn('the shield to ride', e));
  }

  /** One frame of the player's movement, if the board has it (true): getting on, riding, hops,
   * stepping off. Otherwise the player walks (false). */
  step(pl, dt, input) {
    const held = input.held('Space');
    this.cool = Math.max(0, this.cool - dt);
    if (!this.on) {
      this.holdT = held ? this.holdT + dt : 0;
      if (!(held && this.shield && this.size && !pl.onGround && this.holdT >= HOLD && pl.heldT <= 0 && this.cool <= 0 && !this.tumble)) return false;
      this.begin(pl);
    }
    // carried off by something else (a portal, a load, a death): off at once
    const p = pl.pos;
    if (this.last && (Math.abs(p.x - this.last.x) > 8 || Math.abs(p.z - this.last.z) > 8 || Math.abs(p.y - this.last.y) > 12)) { this.cancel(); return false; }
    // pushed back since last frame by something the board doesn't know of (a foe's body in the way):
    // the speed is only what you really made
    if (this.last) {
      const v = pl.vel, hs = Math.hypot(v.x, v.z), back = hs > 0.1 ? -((p.x - this.last.x) * v.x + (p.z - this.last.z) * v.z) / hs : 0;
      if (back > 1e-3) { const k = Math.max(0, 1 - back / Math.max(1e-3, dt) / hs); v.x *= k; v.z *= k; }
    }
    if (!this.landed && !held) { this.end(pl, false); return false; }   // (let go before landing: back on the arm)
    if (pl.heldT > 0) { this.end(pl, true); return false; }              // (taken hold of by one of the dead: pulled off)
    if (this.landed) {
      if (input.was('Space') && this.upT >= 0) { if (!this.air) this.hop(pl); this.upT = -1; }
      else if (held) this.upT = -1;
      else if ((this.upT = this.upT < 0 ? 0 : this.upT + dt) >= RETAP) { this.end(pl, true); return false; }
    }
    if ((this.whereT -= dt) <= 0) { this.whereT = 0.1; this.where = this.surface?.() || 'dirt'; }
    if (this.air) this.fly(pl, dt, input); else this.ride(pl, dt, input);
    if (!this.on) return true;   // (thrown off this frame)
    this.speed = pl.vel.length();
    pl.leanT = this.leanT || 0;
    pl.jitter = this.air ? 0 : Math.min(0.012, this.speed * (this.where === 'stone' ? 0.0005 : this.where === 'snow' ? 0.0001 : 0.0003));
    if (p.y < -60) { this.cancel(); p.set(0, 0, 12); pl.vel.set(0, 0, 0); }
    (this.last ||= new THREE.Vector3()).copy(p);
    return true;
  }

  begin(pl) {
    this.on = true; this.air = !pl.onGround; this.landed = false; this.upT = -1;
    this.last = pl.pos.clone();
    this.n.set(0, 1, 0);
    const v = pl.vel;
    if (Math.hypot(v.x, v.z) > 0.5) this.head.set(v.x, 0, v.z).normalize();
    else this.head.set(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw));
    this.look.set(0, 1, 0);
    this.tumble = null;
    // a shield on the arm: the arm dips out of sight and lets go of it (it flies under the feet once
    // it's out of the hand); a two-hander's comes from over the shoulder at once
    // (got on again while it was still on its way back: it turns round and comes straight down)
    if (this.shield.onArm && !this.vm.stowed) this.swap = { t: SWAP * (this.vm.dip.L || 0), off: true };
    else { this.swap = null; this.mix = Math.max(this.mix, 0.001); }
    if (!this.told) { this.told = true; this.hooks.onFirst?.(); }
  }

  /** Off the shield: `walk` (let go on the ground: a step off, running out your speed), or just put
   * back (let go before landing). */
  end(pl, walk) {
    if (walk && !this.air) {
      pl.vel.y = 2.4; pl.onGround = false;    // (a little step off it)
      pl.slip = 0.6;                          // (and the speed run out over a few strides: player.js)
      this.sfx.land?.(this.where === 'snow' ? 'dirt' : this.where === 'water' ? 'dirt' : this.where, false, 0.3);
    }
    this.on = false; this.air = false; this.landed = false;
    this.cool = 0.25; this.holdT = 0; this.last = null; this.speed = 0;
    pl.leanT = 0; pl.jitter = 0;
    this.back();
  }

  /** Off at once, nothing heard (a portal, a load, the shield taken off). */
  cancel() {
    this.on = false; this.air = false; this.landed = false; this.last = null; this.speed = 0; this.tumble = null;
    this.mix = 0; this.root.visible = false;
    this.swap = null; this.vm.dip.L = 0;
    if (this.vm.stowed) this.vm.stowLeft(false);
    this.loop?.stop(); this.loop = null;
  }

  /** The shield back to the arm: it flies up to the hand, then the arm dips and comes back with it. */
  back() {
    if (!this.shield?.onArm) { this.swap = null; return; }   // (a two-hander's goes back over the shoulder)
    this.swap = this.mix > 0 ? null : { t: 0, off: false };  // (once it's in the hand: draw)
  }

  hop(pl) {
    const v = pl.vel;
    v.addScaledVector(this.n, POP * 0.35); v.y += POP * 0.65;
    pl.pos.y += 0.02;
    this.air = true; pl.onGround = false;
    this.sfx.jump?.(this.where === 'stone' || this.where === 'wood' ? this.where : 'dirt', false);
  }

  /** The ground's slope under the shield (heights a stride either way: a flight of stairs is a slope). */
  normal(pl, out) {
    const ph = pl.physics, p = pl.pos, e = 0.55, top = p.y + 0.7;
    const h = (x, z) => { const f = ph.floorAt(x, z, top, 0.05, 0); return Number.isFinite(f) ? Math.max(p.y - 0.6, Math.min(p.y + 0.6, f)) : p.y; };
    const hx = (h(p.x + e, p.z) - h(p.x - e, p.z)) / (2 * e), hz = (h(p.x, p.z + e) - h(p.x, p.z - e)) / (2 * e);
    return out.set(-hx, 1, -hz).normalize();
  }

  /** The wish from the keys, as you look (x, z; up to 1 long). */
  wish(pl, input) {
    const [ax, ay] = input.axes();
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw), rx = Math.cos(pl.yaw), rz = -Math.sin(pl.yaw);
    return [fx * ay + rx * ax, fz * ay + rz * ax];
  }

  /** Turn the velocity (about `axis`) toward the wish by at most `rate` (rad/s) x how sideways it is. */
  carve(v, wx, wz, rate, dt) {
    const sp = Math.hypot(v.x, v.z), wl = Math.hypot(wx, wz);
    if (sp < 0.3 || wl < 0.1) return 0;
    const hx = v.x / sp, hz = v.z / sp, ux = wx / wl, uz = wz / wl;
    const cross = hx * uz - hz * ux, dot = hx * ux + hz * uz;   // (+: the wish is to the right)
    const want = Math.atan2(cross, dot);
    const turn = Math.sign(want) * Math.min(Math.abs(want), rate * Math.abs(cross) * dt * wl);
    if (!turn) return 0;
    const c = Math.cos(turn), s = Math.sin(turn);
    const nx = v.x * c - v.z * s, nz = v.x * s + v.z * c;   // (turning right: x toward the old z, in y-up)
    v.x = nx; v.z = nz;
    return turn / dt;
  }

  ride(pl, dt, input) {
    const ph = pl.physics, p = pl.pos, v = pl.vel, g = GRAVITY;
    const n = this.normal(pl, this.n);
    // gravity along the slope
    v.x += g * n.y * n.x * dt; v.y += g * (n.y * n.y - 1) * dt; v.z += g * n.y * n.z * dt;
    v.addScaledVector(n, -v.dot(n));   // (on the ground's plane)
    // the keys: W pushes, S drags a heel, A and D carve
    const [wx, wz] = this.wish(pl, input), wl = Math.hypot(wx, wz);
    let turn = 0, brake = 0;
    if (wl > 0.1) {
      const hs = Math.hypot(v.x, v.z), sp = v.length();
      if (hs < 0.6) {   // (all but still: push off the way you want to go)
        v.x += wx / wl * PUSH * dt; v.z += wz / wl * PUSH * dt;
      } else {
        const along = (v.x * wx + v.z * wz) / (hs * wl);
        if (along > 0) v.multiplyScalar(1 + PUSH * along * Math.max(0.12, 1 - sp / PUSH_TOP) * dt / Math.max(sp, 0.1));
        else brake = BRAKE * -along;
        turn = this.carve(v, wx, wz, Math.min(TURN, CARVE / hs), dt);
      }
      v.addScaledVector(n, -v.dot(n));
    }
    // the ground and the air holding you back (and a carve scrubs a little)
    const sp = v.length(), mu = GRIP[this.where] ?? GRIP.dirt;
    const left = Math.min(VMAX, Math.max(0, sp - (mu * g * n.y + DRAG * sp * sp + brake + 0.6 * Math.abs(turn)) * dt));
    if (sp > 1e-6) v.multiplyScalar(left / sp); else v.set(0, 0, 0);
    this.lean(pl, turn, Math.min(1, left / 12) * 0.07);
    // across the ground, along walls (riding up a bank, as high as it rises in the frame)
    const ox = p.x, oz = p.z, oy = p.y, step = STEP + Math.max(0, v.y) * dt * 1.2;
    if (!this.move(pl, dt, step)) return;
    // down the slope with it; a crest that falls away faster than you would throws you into the air
    const pred = oy + v.y * dt;
    const floor = ph.floorAt(p.x, p.z, oy, R, step);
    const terr = ph.terrain && ph.hasGround(p.x, p.z) ? ph.groundAt(p.x, p.z) : -Infinity;
    const built = Math.abs(floor - terr) > 0.02;   // (a box: stairs, a floor, a kerb)
    pl.boxStep = built;
    if (Number.isFinite(floor) && (floor >= pred - 0.5 * g * dt * dt - 0.025 || (built && oy - floor <= STEP + 0.05))) {
      p.y = floor;
      // the next stretch's slope: keep the speed (a sharp crease into a bank costs what goes into it)
      const n2 = this.normal(pl, _n), into = v.dot(n2);
      const was = v.length();
      v.addScaledVector(n2, -into);
      if (Math.abs(into) < 2.5) { const l = v.length(); if (l > 1e-6) v.multiplyScalar(was / l); }
    } else {
      this.air = true; pl.onGround = false;
      p.y = pred;
    }
    this.ceiling(pl);
    this.keepAbove(pl, ox, oz);
    pl.onGround = !this.air;
    // a foe in the way, fast: knocked flying (and the shield slowed by it)
    if (sp > RAM) {
      const n3 = this.hooks.onRam?.(pl, sp) || 0;
      if (n3) v.multiplyScalar(Math.pow(0.72, n3));
    }
  }

  fly(pl, dt, input) {
    const ph = pl.physics, p = pl.pos, v = pl.vel;
    v.y -= GRAVITY * dt;
    v.multiplyScalar(Math.max(0, 1 - DRAG * v.length() * dt));   // (the air, as on the ground)
    const [wx, wz] = this.wish(pl, input);
    this.lean(pl, this.carve(v, wx, wz, AIR_TURN, dt), 0.03);
    // (coming down, ground a little above the feet ahead is a landing, not a wall: an upslope)
    const ox = p.x, oz = p.z, step = v.y < 0 ? STEP : 0.1;
    if (!this.move(pl, dt, step)) return;
    const floor = ph.floorAt(p.x, p.z, p.y, R, step);
    p.y += v.y * dt;
    this.ceiling(pl);
    if (p.y <= floor) {
      p.y = floor;
      // the landing: what went into the ground is lost (and hurts if it was a lot); what went along it
      // is kept, so a drop onto a downslope comes out as speed
      const n = this.normal(pl, this.n), into = -v.dot(n);
      if (into > 0) v.addScaledVector(n, into);
      v.multiplyScalar(0.97);
      if (into > SOFT) pl.onFall?.((into - SOFT) * 1.6);
      if (into > 3) pl.onLand?.(Math.min(1, (into - 3) / 16));
      if (!this.landed) {   // (the shield meets the ground; down before it was quite under you: it is now)
        this.sfx.clang?.(true);
        if (this.swap?.off && !this.swap.done) this.swap.t = Math.max(this.swap.t, SWAP);
      }
      this.air = false; this.landed = true;
    }
    this.keepAbove(pl, ox, oz);
    pl.onGround = !this.air;
  }

  /** Move across (dx, dz), sliding along walls: a wall met head-on at speed throws you off (false). */
  move(pl, dt, step) {
    const ph = pl.physics, p = pl.pos, v = pl.vel;
    const dx = v.x * dt, dz = v.z * dt, ox = p.x, oz = p.z, oy = p.y;
    ph.slide(p, dx, dz, R, HEIGHT, step);
    const b = pl.bounds;
    if (p.y > ph.groundAt(p.x, p.z) - 2 && b?.contains && !b.contains(p.x, p.z)) {
      if (b.contains(p.x, oz)) p.z = oz; else if (b.contains(ox, p.z)) p.x = ox; else { p.x = ox; p.z = oz; }
    }
    // (the mountain: a slope steeper than about 50 degrees can't be ridden up, as it can't be walked)
    if (!this.air && ph.mountain?.covers(p.x, p.z) && !ph.belowGround?.some((inside) => inside(p))) {
      const moved = Math.hypot(p.x - ox, p.z - oz), rise = ph.groundAt(p.x, p.z) - Math.max(oy, ph.groundAt(ox, oz));
      if (moved > 1e-4 && rise > 0.12 && rise / moved > (pl.sureFoot ? 2.6 : 1.2)) { p.x = ox; p.z = oz; }
    }
    const mx = p.x - ox, mz = p.z - oz, bx = dx - mx, bz = dz - mz, lost = Math.hypot(bx, bz);
    if (lost < 1e-4) return true;
    const hs = Math.hypot(v.x, v.z), into = hs > 1e-4 ? (bx * v.x + bz * v.z) / hs / dt : 0;
    if (into > CRASH && into > 0.55 * hs) { this.crash(pl, into); return false; }
    // along the wall: what went into it is gone
    if (hs > 1e-4) { const k = Math.min(1, Math.hypot(mx, mz) / dt / hs); const ux = mx / dt, uz = mz / dt; v.x = ux; v.z = uz; if (k < 0.98) v.y *= k; }
    return true;
  }

  /** The view leans into a turn (`turn` rad/s, + to the right of the way you go), as you see it: a
   * right turn ridden looking back leans you to your left. */
  lean(pl, turn, k) {
    const v = pl.vel, hs = Math.hypot(v.x, v.z);
    if (hs < 0.3) { this.leanT = 0; return; }
    const face = (-v.z * Math.cos(pl.yaw) - v.x * Math.sin(pl.yaw)) / hs;   // (the way's right . the view's right)
    this.leanT = Math.max(-0.12, Math.min(0.12, -turn * k * face));
  }

  ceiling(pl) {
    const p = pl.pos, c = pl.physics.ceilingAt(p.x, p.z, p.y + 0.5, R), h = HEIGHT - CROUCH;
    if (p.y + h > c) { p.y = c - h; pl.vel.y = Math.min(0, pl.vel.y); }
  }

  /** On the downs and the mountain nothing is below the ground but caves: never sink into it. */
  keepAbove(pl, ox, oz) {
    const ph = pl.physics, p = pl.pos;
    if (!ph.terrain || !(p.x > 286 || ph.mountain?.covers(p.x, p.z)) || ph.belowGround?.some((inside) => inside(p))) return;
    const g = ph.groundAt(p.x, p.z);
    if (p.y < g - 0.25) { p.y = g; if (pl.vel.y < 0) pl.vel.y = 0; this.air = false; this.landed = true; }
  }

  /** Head-on into something at speed: thrown off, you and the shield bounced back off it. */
  crash(pl, into) {
    const v = pl.vel;
    this.hooks.onCrash?.(into);
    const sp = Math.max(0.1, Math.hypot(v.x, v.z));
    this.tumble = { v: new THREE.Vector3(-v.x / sp * 2.5, 4.5, -v.z / sp * 2.5), spin: new THREE.Vector3(7, 2, 4), t: 0 };
    v.set(-v.x * 0.12, 2.5, -v.z * 0.12);
    pl.heldT = Math.max(pl.heldT, 0.5);   // (a stumble: barely able to move a moment)
    this.on = false; this.air = false; this.landed = false;
    this.cool = 0.8; this.holdT = 0; this.last = null; this.speed = 0;
    pl.onGround = false; pl.leanT = 0; pl.jitter = 0;
    this.swap = null;
  }

  // ---------------------------------------------------------------- what it looks and sounds like
  /** Each frame, after the player has moved (and the camera with them): the shield in the world, the
   * arm's dip, the spray, the scrape. */
  draw(dt, pl) {
    const vm = this.vm;
    // the arm: down out of sight, the shield let go of (or taken back) at the bottom, and up again
    if (this.swap) {
      const s = this.swap;
      // (a spell leaving the left hand is let finish first)
      const casting = vm.state.L && vm.clipInfo(vm.state.L.name)?.kind === 'cast';
      if (!(s.t === 0 && casting)) s.t += dt;
      if (s.t >= SWAP && !s.done) {
        s.done = true;
        if (s.off) { vm.stowLeft(true); this.mix = Math.max(this.mix, 0.001); }
        else { vm.stowLeft(false); this.root.visible = false; }
      }
      vm.dip.L = s.t < SWAP ? smooth(s.t / SWAP) : 1 - smooth((s.t - SWAP) / 0.16);
      if (s.t >= SWAP + 0.16) { vm.dip.L = 0; this.swap = null; }
    } else if (vm.dip.L) vm.dip.L = Math.max(0, vm.dip.L - dt * 6);
    // the shield's flight between the hand and the feet (once you're down on it, it's under you)
    const toFeet = this.on && this.mix > 0;
    if (this.tumble) this.loose(dt, pl);
    else if (toFeet) this.mix = this.landed ? 1 : Math.min(1, this.mix + dt / FLY);
    else if (this.mix > 0) {
      this.mix = Math.max(0, this.mix - dt / FLY);
      if (this.mix === 0 && this.shield?.onArm) this.swap = { t: 0, off: false };   // (in the hand: the arm takes it)
    }
    this.kick += ((this.on ? 8 * smooth((this.speed - 9) / 22) : 0) - this.kick) * Math.min(1, dt * 3);
    if (Math.abs(this.kick) < 0.01 && !this.on) this.kick = 0;
    if (!this.tumble) {
      if (this.mix > 0 && this.size) this.place(dt, pl);
      else this.root.visible = false;
    }
    this.effects(dt, pl);
  }

  /** The shield in the world: under the feet, tilted to the ground, nosing the way it goes; or on its
   * way between there and the hand. */
  place(dt, pl) {
    const cam = this.camera, p = pl.pos, v = pl.vel;
    const hs = Math.hypot(v.x, v.z);
    if (this.on && hs > 0.5) {
      _h.set(v.x, 0, v.z).normalize();
      this.head.lerp(_h, Math.min(1, dt * 10));
      if (this.head.lengthSq() < 1e-4) this.head.copy(_h); else this.head.normalize();   // (turned right round)
    }
    this.look.lerp(this.on && !this.air ? this.n : UP, Math.min(1, dt * (this.air ? 3 : 14))).normalize();
    // under the feet: x across, y up the ground's normal, z back from the nose
    const up = this.look;
    _z.copy(this.head).negate().addScaledVector(up, this.head.dot(up)).normalize();
    _x.crossVectors(up, _z).normalize();
    _m.makeBasis(_x, up, _z);
    const feetQ = _q.setFromRotationMatrix(_m);
    const feetP = _p.set(p.x, p.y, p.z);
    const k = smooth(this.mix);
    if (k >= 1) { this.root.position.copy(feetP); this.root.quaternion.copy(feetQ); }
    else {
      // the hand: low on the left of the view (a two-hander's comes from over the left shoulder)
      const e = cam.matrixWorld.elements;
      const back = this.shield?.onArm ? -0.45 : 0.25, side = -0.34, down = this.shield?.onArm ? -0.48 : -0.2;
      const hand = _a.set(cam.position.x + e[0] * side + e[4] * down + e[8] * back,
        cam.position.y + e[1] * side + e[5] * down + e[9] * back,
        cam.position.z + e[2] * side + e[6] * down + e[10] * back);
      const handQ = new THREE.Quaternion().copy(cam.quaternion).multiply(this.held);
      this.root.position.lerpVectors(hand, feetP, k);
      // (an arc: up a little on its way down, so it reads as dropped under you rather than slid)
      this.root.position.y += Math.sin(k * Math.PI) * 0.15;
      this.root.quaternion.copy(handQ).slerp(feetQ, k);
    }
    this.root.visible = true;
  }

  /** Thrown off: the shield tumbles on, lands, and is back on the arm a moment later. */
  loose(dt, pl) {
    const t = this.tumble, r = this.root, ph = pl.physics;
    t.t += dt;
    t.v.y -= GRAVITY * 0.7 * dt;
    r.position.addScaledVector(t.v, dt);
    const f = ph.floorAt(r.position.x, r.position.z, r.position.y + 0.3, 0.1, 0.3);
    if (Number.isFinite(f) && r.position.y < f) { r.position.y = f; t.v.multiplyScalar(0.4); t.v.y = Math.abs(t.v.y) * 0.3; t.spin.multiplyScalar(0.5); }
    r.rotateX(t.spin.x * dt); r.rotateY(t.spin.y * dt); r.rotateZ(t.spin.z * dt);
    r.visible = true;
    if (t.t > 0.9) {   // (picked up again: the arm dips for it and comes back with it)
      this.tumble = null; this.mix = 0; r.visible = false;
      if (this.shield?.onArm) this.swap = { t: 0, off: false };
    }
  }

  /** The spray from under it and its scrape (and the wind, fast). */
  effects(dt, pl) {
    const riding = this.on && !this.air && this.mix >= 1;
    const sp = this.on ? this.speed : 0;
    if (this.on && !this.loop && this.sfx.board) this.loop = this.sfx.board();
    if (this.loop) {
      this.loop.set(sp, riding ? this.where : null, dt);
      if (!this.on) { this.loop.stop(); this.loop = null; }
    }
    const S = SPRAY[this.where];
    if (!riding || !S || !this.particles || sp < (S.min || 1.2)) { this.spray = 0; return; }
    const carve = Math.min(1, Math.abs(this.leanT || 0) * 8);
    this.spray += dt * S.rate * sp * (1 + carve * 1.5);
    const n = Math.floor(this.spray);
    if (!n) return;
    this.spray -= n;
    const p = pl.pos, h = this.head, l = (this.size?.h || 0.7) * 0.45;
    const at = _a.set(p.x - h.x * l, p.y + 0.05, p.z - h.z * l);
    this.particles.burst(at, S.col, Math.min(n, 12), { speed: S.speed * (0.6 + sp / 20), size: S.size, grav: S.grav, life: S.life, nrm: this.n });
  }
}
