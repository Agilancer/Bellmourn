// Creature billboards: loads what tools/templates/import_creatures.py writes to
// assets/creatures/<id>/ and answers, every frame, "which sprite do I draw, where, how big".
// No renderer dependency: hand the result to three.js (or a canvas) yourself, e.g.
//
//   const def = await loadCreature('assets/creatures/bell_ogre/creature.json');
//   const ogre = new CreatureAnimator(def, 'idle');
//   ogre.onEvent = (ev, anim) => { if (ev === 'hit') dealDamage(); };
//   // each game tic (35 per second):
//   ogre.tick();
//   const s = ogre.sprite(viewDir(camera.position, ogre.pos, ogre.facing));
//   // s.image, s.u0..s.v1 (UVs, v down), s.flip, s.width / s.height / s.offsetX / s.offsetY
//   // in metres: centre the quad on the creature's ground position plus offsetX to the right
//   // of the view and offsetY up. Each quad is sized from the frame, so frames of different
//   // sizes all keep their feet on the same spot.
//
// Directions follow CREATURE_GUIDE.md: 0 = D1 (faces the viewer), 2 = D3 (profile facing
// screen-left), 4 = D5 (back), 6 = D7 (profile facing screen-right).

export async function loadCreature(url) {
  const def = await (await fetch(url)).json();
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  def.images = await Promise.all(def.pages.map((p) => new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = base + p;
  })));
  return def;
}

// Which of the 8 views to show. viewer and creature are {x, z} on the ground (y up);
// facing is the creature's forward direction as {x, z}.
export function viewDir(viewer, creature, facing) {
  const dx = creature.x - viewer.x, dz = creature.z - viewer.z;  // viewer -> creature
  const toward = -(facing.x * dx + facing.z * dz);   // facing the viewer
  const left = facing.x * dz - facing.z * dx;        // facing the viewer's left
  const a = Math.atan2(left, toward) / (Math.PI / 4);
  return ((Math.round(a) % 8) + 8) % 8;
}

export class CreatureAnimator {
  constructor(def, anim = 'idle') {
    this.def = def;
    this.onEvent = null;  // (event, animName, frameIndex) => {}
    this.onEnd = null;    // (animName) => {}  for animations that do not loop
    this.play(anim);
  }

  // Start an animation (restarts it unless `keep` and it is already playing).
  play(anim, keep = false) {
    if (keep && anim === this.anim) return;
    if (!this.def.anims[anim]) throw new Error(`${this.def.id} has no animation ${anim}`);
    this.anim = anim;
    this.frame = 0;
    this.left = this.def.anims[anim].frames[0].tics;
    this.done = false;
    this.dead = false;
    this.fire(0);
  }

  // Swap to the corpse after the death animation has finished.
  corpse() { this.dead = true; }

  fire(i) {
    if (!this.onEvent) return;
    for (const ev of this.def.anims[this.anim].frames[i].events) this.onEvent(ev, this.anim, i);
  }

  // Advance one game tic (1/35 s).
  tick() {
    if (this.done || this.dead || this.left < 0) return;  // tics -1 = hold
    if (--this.left > 0) return;
    const a = this.def.anims[this.anim];
    if (this.frame + 1 < a.frames.length) this.frame++;
    else if (a.loop) this.frame = 0;
    else {
      this.done = true;
      if (this.anim === 'death') this.dead = true;
      if (this.onEnd) this.onEnd(this.anim);
      return;
    }
    this.left = a.frames[this.frame].tics;
    this.fire(this.frame);
    if (this.left < 0) {  // a held last frame: the animation is over
      this.done = true;
      if (this.anim === 'death') this.dead = true;
      if (this.onEnd) this.onEnd(this.anim);
    }
  }

  // The sprite for view direction 0..7, or null if that frame was never painted.
  sprite(dir) {
    const d = this.def;
    let e = this.dead ? d.corpse.dirs[dir] : d.anims[this.anim].frames[this.frame].dirs[dir];
    if (!e && this.dead) e = d.anims.death.frames.at(-1).dirs[dir];
    if (!e) return null;
    const img = d.images[e.page];
    const m = d.px_per_m;
    let u0 = e.x / img.width, u1 = (e.x + e.w) / img.width;
    if (e.flip) [u0, u1] = [u1, u0];
    return {
      image: img, page: e.page, flip: e.flip,
      u0, u1, v0: e.y / img.height, v1: (e.y + e.h) / img.height,
      width: e.w / m, height: e.h / m,
      // the quad's centre relative to the creature's foot point, in metres: x to the right
      // of the view, y up
      offsetX: (e.w / 2 - e.ax) / m, offsetY: (e.ay - e.h / 2) / m,
    };
  }
}
