// The world fills up again. Everything placed in it at the start (the dead in the dungeons, caves and
// woods, the Vigil's knights and sorcerers on the downs and in their houses and ruins, the keep's
// Sworn, the slimes) comes back where it first stood, a few minutes after it's cut down, once you're
// well away from the spot: out of that dungeon or cave altogether, or out of sight of it above ground.
// So the quests that want so many of a kind can always be finished, and the world never goes empty.
// The graveyard keeps its own (zombies.js), the great ones raised for quests don't come back, nor does
// the Red Hand.
//
// It notes how each one was made (each spawn's arguments) while the world is populated, then takes
// them all as its own once everything is in (adopt).

const LATER = { surface: [150, 220], under: [200, 300], keep: [260, 360] };   // seconds, before one can come back

export class Respawns {
  /** o: { zombies (and the foes in its list), foes, slimes } */
  constructor(o) {
    this.o = o;
    this.slots = [];
    this.t = 0; this.tick = 0;
    this.recording = true;
    this.made = 0;
    const note = (owner, fn, recipe) => {
      const f = owner[fn].bind(owner);
      owner[fn] = (...a) => { const c = f(...a); if (c && this.recording) c.recipe = recipe(...a); return c; };
    };
    note(o.zombies, 'spawn', (v, x, z, opts = {}) => ({ who: 'zombie', v, x, z, opts: { ...opts } }));
    if (o.foes) note(o.foes, 'spawn', (v, x, z, opts = {}) => ({ who: 'foe', v, x, z, opts: { ...opts } }));
    if (o.slimes) this.slimes(o.slimes);
  }

  /** The slimes come in later than the dead (main makes them after): noted from then. */
  slimes(s) {
    if (this.o.slimesNoted === s) return;
    this.o.slimes = s; this.o.slimesNoted = s;
    const f = s.spawn.bind(s);
    s.spawn = (key, size, at, opts = {}) => { const c = f(key, size, at, opts); if (c && this.recording) c.recipe = { who: 'slime', key, size, at: at.clone(), opts: { ...opts } }; return c; };
  }
  foes(f) {
    if (this.o.foesNoted === f) return;
    this.o.foes = f; this.o.foesNoted = f;
    const g = f.spawn.bind(f);
    f.spawn = (v, x, z, opts = {}) => { const c = g(v, x, z, opts); if (c && this.recording) c.recipe = { who: 'foe', v, x, z, opts: { ...opts } }; return c; };
  }

  /** Everything in the world now becomes something that comes back (call once it's all in). */
  adopt() {
    this.recording = false;
    const take = (c) => {
      const r = c.recipe;
      if (!r || c.dead || c.gone || c.champ || c.def?.boss || c.zone === 'yard' || r.opts?.zone === 'yard' || c.rehearsal || r.opts?.rehearsal) return;
      if (r.who === 'slime' && c.state === 'cling' && c.n?.y < -0.5) r.roof = true;   // (hung from a cave's roof)
      this.slots.push({ r, c, deadAt: null, due: 0 });
    };
    for (const c of this.o.zombies.list) take(c);
    for (const c of this.o.slimes?.list || []) take(c);
    console.info(`respawns: ${this.slots.length} in the world will come back when cut down`);
  }

  /** Where a slot's one stands, and what it's in. */
  spot(s) {
    const r = s.r;
    if (r.who === 'slime') return { x: r.at.x, y: r.at.y, z: r.at.z, dg: r.opts.dg || null };
    return { x: r.x, y: r.opts.y ?? null, z: r.z, dg: r.opts.dg || null };
  }

  /** Far enough that nobody sees it come: out of its dungeon or cave altogether (or a long way off in
   * it), or well out of sight above ground (further if it's ahead of you). */
  away(s, player, camera) {
    const p = this.spot(s), P = player.pos;
    const d = Math.hypot(P.x - p.x, P.z - p.z);
    if (p.dg) return !p.dg.contains?.(P) || d > 55;
    if (p.y != null && Math.abs(P.y - p.y) > 10 && d > 20) return true;   // (you're below ground, or it is)
    if (d > 120) return true;
    if (d < 70) return false;
    // between: only behind you
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    return ((p.x - P.x) * fx + (p.z - P.z) * fz) / d < 0.1;
  }

  /** Each frame (playing): a few times a second, what's been dead long enough and is out of sight
   * comes back, a few at a time. */
  update(dt, player, playing, camera = null) {
    if (!playing || this.recording) return;
    this.t += dt;
    if ((this.tick -= dt) > 0) return;
    this.tick = 0.5;
    let n = 0;
    for (const s of this.slots) {
      const c = s.c;
      if (c && !c.dead && !c.gone) continue;
      if (s.deadAt == null) {
        s.deadAt = this.t;
        const kind = s.r.opts?.zone === 'keep' ? 'keep' : s.r.opts?.dg ? 'under' : 'surface', [a, b] = LATER[kind];
        s.due = this.t + a + Math.random() * (b - a);
      }
      if (this.t < s.due || !this.away(s, player, camera)) continue;
      if (this.bring(s)) n++;
      if (n >= 3) break;   // (a few at a time: each one is a body to make)
    }
  }

  /** Make it again where it first stood (its old body, if it still lies there, goes). */
  bring(s) {
    const { zombies, foes, slimes } = this.o, r = s.r;
    try {
      if (s.c && !s.c.gone) s.c.remove?.();
      let c = null;
      if (r.who === 'zombie') {
        // (above ground the dead claw their way up out of it: if you did happen to look)
        const start = !r.opts.dg && r.opts.zone === 'wild' && (r.opts.start || 'stand') === 'stand' ? 'rise' : r.opts.start;
        c = zombies.spawn(r.v, r.x, r.z, { ...r.opts, start });
        if (c && r.opts.zone === 'wild') c.yaw = Math.random() * 6.28;
      } else if (r.who === 'foe' && foes) {
        if (!foes.gltf?.[r.v]) return false;
        c = foes.spawn(r.v, r.x, r.z, { ...r.opts });
      } else if (r.who === 'slime' && slimes) {
        c = slimes.spawn(r.key, r.size, r.at.clone(), { ...r.opts, home: r.opts.home?.clone?.() || r.opts.home });
        if (r.roof && c) slimes.hang(c, r.at.x, r.at.z);
      }
      if (!c) return false;
      c.recipe = r;
      s.c = c; s.deadAt = null;
      this.made++;
      return true;
    } catch (e) {
      console.warn('respawn', r.who, r.v || r.key, e);
      s.due = this.t + 60;
      return false;
    }
  }

  /** How many are waiting to come back (and how many are about): for the debug line. */
  census() {
    let dead = 0;
    for (const s of this.slots) if (!s.c || s.c.dead || s.c.gone) dead++;
    return { slots: this.slots.length, dead, made: this.made };
  }

  /** Bring back everything that's dead now, at once, wherever you are (a test; not used in play). */
  all() { let n = 0; for (const s of this.slots) if (!s.c || s.c.dead || s.c.gone) n += this.bring(s) ? 1 : 0; return n; }
}
