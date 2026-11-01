// The world's own sound under the music (assets/audio/amb: the user's nature pack, and the effects
// pack's torch and babbling stream; tools/audio/build_audio.py).
//
// Beds, everywhere about you, mixed by where you are and the hour: wind (calm in the open, in the
// trees in the wood), birds by day, the night's insects by night, cicadas on the downs in the heat
// of the day; below the ground the caves' dark air, their drips, the deep's low breath, the
// Mourning Gulf's far surge, the Drowned Grotto's running water and patter. Indoors the outside is
// heard through the walls (muffled, and less of it).
//
// And sounds from a place, heard from where they are (louder near, to your left or right): the
// nearest torches' crackle and braziers' and hearths' fire, the smouldering crater, the stream and
// the river (from their nearest point to you), Brightwater Falls and its pool.
//
// Every loop is played as two overlapping copies crossfaded at the seam (equal power), each booked
// a whole loop ahead on the audio clock, so none clicks or gaps even when the game is busy. The
// loops are fetched when first wanted and let go a while after they're last heard.
import { STREAM, RIVER, POOL, FALLS, cliffX } from './terrain.js';
import { CRATER } from './crater.js';
import { TOUCH } from './input.js';

const DIR = 'assets/audio/amb/';
const XF = 2.5;                         // the crossfade at a loop's seam (s)
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const IN = new Float32Array(64).map((_, i) => Math.sin((i / 63) * Math.PI / 2));
const OUT = new Float32Array(64).map((_, i) => Math.cos((i / 63) * Math.PI / 2));

/** The nearest point on a path [[x, z], ...] to (x, z). */
function nearestOn(path, x, z) {
  let best = Infinity, bx = 0, bz = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i], [cx, cz] = path[i + 1], dx = cx - ax, dz = cz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bx = px; bz = pz; }
  }
  return [bx, bz, best];
}

export class Ambience {
  constructor(sfx) {
    this.sfx = sfx;
    this.bufs = {};          // name -> AudioBuffer (or a promise of one)
    this.used = {};          // name -> when last heard (s)
    this.loops = new Map();  // key -> a running loop: {name, g (its level), pan, voices, next, level}
    this.on = false;
  }

  get ctx() { return this.sfx.ctx; }

  /** The lines out: the outside's beds through a muffle (indoors), the rest straight. */
  lines() {
    if (this.outside || !this.sfx.amb) return;
    const c = this.ctx;
    this.muffle = c.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.5;
    this.outside = c.createGain();
    this.outside.connect(this.muffle); this.muffle.connect(this.sfx.amb);
    this.below = c.createGain(); this.below.connect(this.sfx.amb);
    this.master = 0;
  }

  buf(name) {
    const b = this.bufs[name];
    if (b && !b.then) return b;
    if (!b) this.bufs[name] = this.sfx.decode(DIR + name + '.mp3').then((x) => {
      // (a phone keeps them in one channel: half the memory)
      if (x && TOUCH && x.numberOfChannels > 1) {
        const m = this.ctx.createBuffer(1, x.length, x.sampleRate), d = m.getChannelData(0), l = x.getChannelData(0), r = x.getChannelData(1);
        for (let i = 0; i < d.length; i++) d[i] = (l[i] + r[i]) * 0.5;
        x = m;
      }
      this.bufs[name] = x || null;
      return x;
    });
    return null;
  }

  /** The wanted loops fetched ahead (where you'll first be: the village, its edge). */
  prefetch(names) { for (const n of names) this.buf(n); }

  /** A loop (key: which one, of name's sound) brought toward `level` (0..1), heard from `at` [x, z]
   * if given, out on `line`. */
  want(key, name, level, line, at = null, far = 40) {
    let L = this.loops.get(key);
    if (level < 0.003 && !L) return;
    const c = this.ctx, now = c.currentTime;
    this.used[name] = now;
    if (!L) {
      const b = this.buf(name);
      if (!b) return;
      const g = c.createGain(); g.gain.value = 0;
      const pan = at && c.createStereoPanner ? c.createStereoPanner() : null;
      if (pan) { g.connect(pan); pan.connect(line); } else g.connect(line);
      L = { key, name, b, g, pan, voices: [], next: now + 0.05, level: 0, quietT: 0, first: true };
      this.loops.set(key, L);
    }
    let k = level, side = 0;
    if (at) {
      const E = this.sfx.ear, dx = at[0] - E.x, dz = at[1] - E.z, d = Math.hypot(dx, dz);
      k *= Math.max(0, 1 - d / far) ** 1.6;
      side = d > 0.5 ? Math.max(-1, Math.min(1, (dx * E.rx + dz * E.rz) / d)) * Math.min(1, d / 4) * 0.8 : 0;
      if (L.pan) L.pan.pan.setTargetAtTime(side, now, 0.15);
    }
    L.target = k;
  }

  /** Each loop's copies booked a whole loop ahead; its level eased; a silent one let go. */
  run(dt) {
    const c = this.ctx, now = c.currentTime;
    for (const [key, L] of this.loops) {
      const t = L.target ?? 0;
      L.target = 0;   // (wanted again next frame, or it fades)
      L.g.gain.setTargetAtTime(t, now, t > L.level ? 0.6 : 0.9);
      L.level += (t - L.level) * Math.min(1, dt * 1.5);
      L.quietT = t < 0.003 ? L.quietT + dt : 0;
      if (L.quietT > 6) {
        for (const v of L.voices) { try { v.stop(); } catch { /* done */ } }
        L.g.disconnect(); L.pan?.disconnect();
        this.loops.delete(key);
        continue;
      }
      const D = L.b.duration, x = Math.min(XF, D * 0.25);
      while (L.next < now + D) {
        const src = c.createBufferSource(), e = c.createGain();
        src.buffer = L.b;
        src.connect(e); e.connect(L.g);
        const off = L.first ? Math.random() * (D - x * 2) : 0, len = D - off;
        const at = Math.max(L.next, now + 0.02);
        if (!L.first) e.gain.setValueCurveAtTime(IN, at, x);   // (a curve can't share its start with another event)
        e.gain.setValueCurveAtTime(OUT, at + len - x, x);
        src.start(at, off); src.stop(at + len + 0.05);
        src.onended = () => { e.disconnect(); const i = L.voices.indexOf(src); if (i >= 0) L.voices.splice(i, 1); };
        L.voices.push(src);
        L.next = at + len - x;
        L.first = false;
      }
    }
    // loops not heard for a while let go of (a phone sooner)
    if ((this.sweepT = (this.sweepT || 0) - dt) < 0) {
      this.sweepT = 10;
      for (const n of Object.keys(this.bufs)) {
        const inUse = [...this.loops.values()].some((L) => L.name === n);
        if (!inUse && this.bufs[n] && !this.bufs[n].then && now - (this.used[n] || 0) > (TOUCH ? 60 : 150)) delete this.bufs[n];
      }
    }
  }

  /** Each frame. s: {on (in the game, not the opening), zone ({name, kind, region, open}), set (the
   * music's place), out, under (the zone weights), day (0..1), hour, flames ([x, y, z, size]...),
   * crater (formed 0..1), paused} */
  update(dt, s) {
    if (!this.sfx.ok || !this.sfx.amb) return;
    this.lines();
    const c = this.ctx, now = c.currentTime;
    // the whole of it up in the game, down behind the title and in the opening
    const m = s.on ? (s.paused ? 0.5 : 1) : 0;
    if (m !== this.master) { this.master = m; this.sfx.amb.gain.setTargetAtTime(this.sfx.ambVolume * m, now, m ? 1.2 : 0.4); }
    if (!s.on && ![...this.loops.values()].some((L) => L.level > 0.01)) { this.run(dt); return; }
    const z = s.zone || {}, E = this.sfx.ear, set = s.set;
    const surf = 1 - s.under, out = s.out, indoor = Math.max(0, surf - out);
    const day = s.day, night = 1 - smooth(0.15, 0.6, day);
    // indoors: the outside comes through the walls, muffled
    this.muffle.frequency.setTargetAtTime(600 + 19400 * Math.pow(out / Math.max(0.001, surf), 3), now, 0.3);
    this.outside.gain.setTargetAtTime(surf * (out + indoor * 0.45), now, 0.3);
    this.below.gain.setTargetAtTime(s.under, now, 0.3);
    const O = this.outside, B = this.below;
    // ---- the outside's beds
    if (surf > 0.01) {
      const wood = set === 'wood', downs = set === 'downs', yard = set === 'graveyard', keep = set === 'keep', village = set === 'village';
      this.want('wind_calm', 'wind_calm', downs ? 0.6 : yard || keep ? 0.55 : wood ? 0.25 : 0.32, O);
      this.want('wind_forest', 'wind_forest', wood ? 0.75 : village ? 0.18 : downs ? 0.12 : 0.1, O);
      this.want('birds', 'birds', day * (wood ? 0.85 : downs ? 0.6 : village ? 0.45 : yard ? 0.12 : 0.15), O);
      this.want('night', 'night', night * (yard ? 0.85 : keep ? 0.5 : 0.7), O);
      const heat = smooth(9.5, 12, s.hour) * (1 - smooth(16.5, 19, s.hour));
      this.want('cicadas', 'cicadas', downs ? heat * 0.42 : 0, O);
      // the crater, smouldering (stronger the nearer)
      if (s.crater > 0.5) this.want('crater', 'fire_small', 0.9, O, [CRATER.x, CRATER.z], 30);
      // the water on the downs: the stream and the river from their nearest points, the falls, the pool
      if (E.x > 280) {
        const st = nearestOn(STREAM, E.x, E.z), rv = nearestOn(RIVER, E.x, E.z);
        if (st[2] < 45) this.want('stream', 'stream', 0.9, O, st, 45);
        if (rv[2] < 50) this.want('river', 'river', 0.95, O, rv, 50);
        const fx = cliffX(FALLS.z) - 1, fz = FALLS.z, df = Math.hypot(E.x - fx, E.z - fz);
        if (df < 160) this.want('falls', 'waterfall_strong', 1.05, O, [fx, fz], 160);
        if (df < 30) this.want('spray', 'rain_strong', 0.5, O, [fx, fz], 30);
        if (Math.hypot(E.x - POOL.x, E.z - POOL.z) < POOL.r + 45) this.want('pool', 'waterfall_calm', 0.55, O, [POOL.x, POOL.z], POOL.r + 45);
      }
    }
    // ---- below the ground: by which place
    if (s.under > 0.01) {
      const r = z.region || z.name || '';
      const deep = /Deep Undercroft/.test(r), gulf = /Mourning Gulf/.test(r), grotto = /Drowned Grotto/.test(r), troll = /Trollhole/.test(r);
      this.want('cave_dark', 'cave_dark', grotto ? 0.25 : troll ? 0.35 : deep ? 0.3 : gulf ? 0.2 : 0.7, B);
      this.want('cave_deep', 'cave_deep', deep || troll ? 0.8 : gulf ? 0.7 : 0.15, B);
      this.want('drips', 'cave_drips', grotto ? 0.75 : gulf ? 0.35 : 0.55, B);
      this.want('surge', 'sea', gulf ? 0.4 : 0, B);
      this.want('grotto_water', 'grotto_stream', grotto ? 0.6 : 0, B);
      this.want('patter', 'rain_calm', grotto ? 0.3 : 0, B);
    }
    // ---- fire: the nearest torches, braziers and hearths, each from where it burns
    const fires = [], torches = [];
    for (const f of s.flames || []) {
      const d = Math.hypot(f[0] - E.x, (f[1] - E.y) * 1.5, f[2] - E.z);
      if (f[3] > 0.2) { if (d < 16) fires.push([d, f]); } else if (d < 7) torches.push([d, f]);
    }
    fires.sort((a, b) => a[0] - b[0]); torches.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < 2; i++) { const f = fires[i]?.[1]; if (f) { const n = f[3] > 0.45 ? 'fire_big' : 'fire_medium'; this.want(n + i, n, 0.8, this.sfx.amb, [f[0], f[2]], 16); } }
    for (let i = 0; i < 2; i++) { const f = torches[i]?.[1]; if (f) this.want('torch' + i, 'torch', 0.55, this.sfx.amb, [f[0], f[2]], 7); }
    this.run(dt);
  }
}
