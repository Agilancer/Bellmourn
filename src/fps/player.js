// The player: an upright cylinder that walks, sprints, jumps and climbs stairs, looking with
// yaw and pitch. Fast like Heretic/Hexen, with a little acceleration so it never feels icy.
import * as THREE from 'three';

// (a tall man: the eye 1.72 m up, the head 1.8; the dead stand about 1.8 m, so you meet them eye to eye)
const R = 0.32, HEIGHT = 1.8, STEP = 0.42;
export const EYE = 1.72;
const WALK = 6.2, RUN = 9.4, ACCEL = 60, FRICTION = 12, GRAVITY = 24, JUMP = 7.4;

export class Player {
  constructor(physics, camera, bounds) {
    this.physics = physics;
    this.camera = camera;
    this.bounds = bounds; // {contains(x, z)}: where the player may walk (above ground)
    this.pos = new THREE.Vector3(0, 0, 12);
    this.vel = new THREE.Vector3();
    this.yaw = 0;     // 0 = looking north (-z)
    this.pitch = 0;
    this.onGround = false;
    this.bob = 0;     // walk-cycle phase (radians)
    // stairs: the feet's steps up and down added up (`stair`), and that sum eased through two
    // smoothing stages in turn (`ease`): the eye follows the eased one, so a flight reads as a slope
    this.stair = 0; this.ease = [0, 0];
    this.speed = 0;   // current ground speed (for the view model)
    this.health = 100; this.maxHealth = 100;
    this.mana = 100; this.maxMana = 100;
    this.speedMul = 1;          // from what's worn
    this.lifeRegen = 0.4; this.manaRegen = 6;
    this.healing = 0;           // life still to come from a draught
    this.onFall = null;         // (damage) a long drop hurts when you land
    this.roll = 0;              // a lean of the view (a swaying bridge under you)
  }

  update(dt, input) {
    this.yaw -= input.look[0];
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - input.look[1]));
    const [ax, ay] = input.axes();
    const run = input.held('ShiftLeft') || input.held('ShiftRight') || input.stickRun;
    const top = (run ? RUN : WALK) * this.speedMul;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); // forward
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);  // right
    const wx = (fx * ay + rx * ax) * top, wz = (fz * ay + rz * ax) * top;
    const control = this.onGround ? 1 : 0.35;
    // accelerate toward the wanted velocity; friction when there's no input
    const dvx = wx - this.vel.x, dvz = wz - this.vel.z;
    const dl = Math.hypot(dvx, dvz), maxd = ACCEL * control * dt;
    if (dl > 0) {
      const k = Math.min(1, maxd / dl);
      this.vel.x += dvx * k; this.vel.z += dvz * k;
    }
    if (!ax && !ay && this.onGround) {
      const f = Math.max(0, 1 - FRICTION * dt);
      this.vel.x *= f; this.vel.z *= f;
    }
    if (this.onGround && (input.was('Space'))) { this.vel.y = JUMP; this.onGround = false; }
    this.vel.y -= GRAVITY * dt;

    const p = this.pos, ox = p.x, oz = p.z, oy = p.y, wasOn = this.onGround;
    this.physics.slide(p, this.vel.x * dt, this.vel.z * dt, R, HEIGHT, this.onGround ? STEP : 0.1);
    // keep to the walkable world when on the surface (slide along its edge)
    if (p.y > this.physics.groundAt(p.x, p.z) - 2 && this.bounds.contains && !this.bounds.contains(p.x, p.z)) {
      if (this.bounds.contains(p.x, oz)) p.z = oz; else if (this.bounds.contains(ox, p.z)) p.x = ox; else { p.x = ox; p.z = oz; }
    }
    // vertical: land on the highest floor below, step up kerbs and stairs, bump ceilings
    const floor = this.physics.floorAt(p.x, p.z, p.y, R, this.onGround ? STEP : 0.05);
    p.y += this.vel.y * dt;
    const ceil = this.physics.ceilingAt(p.x, p.z, p.y + 0.5, R);
    if (p.y + HEIGHT > ceil) { p.y = ceil - HEIGHT; this.vel.y = Math.min(0, this.vel.y); }
    if (p.y <= floor) {
      // snap down stairs when walking off a step (but not off ledges); a long drop hurts (about
      // five metres before it does, a deadly forty)
      if (!wasOn && this.vel.y < -16) this.onFall?.((-this.vel.y - 16) * 2.6);
      p.y = floor; this.vel.y = 0; this.onGround = true;
    } else if (this.onGround && p.y - floor < STEP + 0.05 && this.vel.y <= 0) {
      p.y = floor; this.vel.y = 0;
    } else {
      this.onGround = false;
    }
    if (p.y < -60) { p.set(0, 0, 12); this.vel.set(0, 0, 0); } // fell out of the world
    // on the downs nothing is below the ground but caves (physics.belowGround): never sink into it
    if (this.physics.terrain && p.x > 286 && !this.physics.belowGround?.some((inside) => inside(p))) {
      const g = this.physics.groundAt(p.x, p.z);
      if (p.y < g - 0.25) { p.y = g; this.vel.y = Math.max(0, this.vel.y); this.onGround = true; }
    }

    // stairs and kerbs: the feet go up and down a step at a time (a stair every three or four frames
    // at a walk), but the eye glides. Steps taken on the ground (not jumps or falls, which the eye
    // follows at once) are summed and the sum eased twice over (45 ms each): that smooths the train
    // of steps into a slope with hardly a ripple, and the eye trails the feet by at most 0.8 m.
    const dy = p.y - oy;
    if (wasOn && this.onGround && Math.abs(dy) > 0.005 && Math.abs(dy) <= STEP + 0.1) this.stair += dy;
    const k = 1 - Math.exp(-dt / 0.045), e = this.ease;
    e[0] += (this.stair - e[0]) * k;
    e[1] += (e[0] - e[1]) * k;
    const over = e[1] - this.stair - Math.max(-0.8, Math.min(0.8, e[1] - this.stair));
    if (over) { e[0] -= over; e[1] -= over; }
    if (Math.abs(this.stair) > 1e4) { e[0] -= this.stair; e[1] -= this.stair; this.stair = 0; }   // (keep the numbers small)
    const lag = e[1] - this.stair;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround) this.bob += this.speed * dt * 1.7;
    const bobY = Math.sin(this.bob * 2) * 0.045 * Math.min(1, this.speed / WALK);
    this.camera.position.set(p.x, p.y + EYE + lag + bobY, p.z);
    this.camera.rotation.set(this.pitch, this.yaw, this.roll || 0, 'YXZ');
    this.mana = Math.min(this.maxMana, this.mana + dt * this.manaRegen);
    const h = Math.min(this.healing, dt * 30);
    this.healing -= h;
    this.health = Math.min(this.maxHealth, this.health + h + dt * this.lifeRegen);
  }
}
