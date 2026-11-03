// The Sorrowhorn's reavers and bandits (foes.js FOES: the Red Scythe and the crag bandits), in the places
// holds.js built for them: the Red Scythe holding Scythe Hold and their war camp, the Red Fold, and
// watching the road from their ledges; the bandits in Crowstep Tower and their nooks; the dead round
// the Hollow Tower and the Pilgrims' Barrow; and, above the road behind their rocks, the ambushes, who
// wait unseen and unseeing till you walk into them, then all come down at you at once.
//
// And the Red Scythe's thrown axes: a hatchet out of the fist at the top of an overhand throw, aimed
// where you'll be when it gets there, turning end over end along its arc; it bites into you, or rings
// off your raised shield, or sticks where it lands, and lies there a while.
import * as THREE from 'three';

// a bandit's colours (foes.js recolour): each a few cloth and leather shades, multiplying the clothes'
// own (their greens and creams brought down to the mud, soot and old blood of men who live rough)
export const BANDIT_PALETTES = [
  [[0.62, 0.5, 0.36], [0.42, 0.36, 0.3], [0.7, 0.6, 0.45]],     // mud
  [[0.36, 0.34, 0.33], [0.5, 0.46, 0.42], [0.28, 0.26, 0.26]],  // soot
  [[0.62, 0.22, 0.17], [0.4, 0.34, 0.3], [0.3, 0.13, 0.11]],    // old blood
  [[0.42, 0.52, 0.32], [0.36, 0.32, 0.26], [0.55, 0.5, 0.38]],  // moss
  [[0.72, 0.4, 0.22], [0.45, 0.4, 0.34], [0.3, 0.25, 0.22]],    // rust
  [[0.3, 0.32, 0.4], [0.46, 0.44, 0.42], [0.62, 0.56, 0.48]],   // slate
];
// the axes they throw (loaded with the rest of their kit: foes.js loadItems reads `T`)
export const THROWN = ['bearded_axe', 'butchers_axe'];
const GRAV = 13;         // (a heavier arc than the world's: they're thrown hard and low)

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3();

/** Distance from the segment p + d*[0, len] to the vertical segment a + y*[0, h]. */
function closest(p, d, len, a, h) {
  let best = Infinity;
  for (let i = 0; i <= 4; i++) {
    const q = _w.copy(p).addScaledVector(d, len * i / 4), y = Math.max(a.y, Math.min(a.y + h, q.y));
    best = Math.min(best, Math.hypot(q.x - a.x, q.y - y, q.z - a.z));
  }
  return best;
}

export class Axes {
  constructor(foes) { this.foes = foes; this.list = []; }

  /** Has `f` a clear throw at you (from its shoulder to your chest)? */
  clear(f, player) {
    const ph = this.foes.zombies.physics, from = _v.set(f.pos.x, f.pos.y + 1.6 * (f.scale || 1), f.pos.z);
    const to = _w.set(player.pos.x - from.x, player.pos.y + 1.2 - from.y, player.pos.z - from.z), L = to.length();
    to.divideScalar(L);
    const hit = ph.ray([from.x, from.y, from.z], [to.x, to.y, to.z], L);
    return !hit || hit.t > L - 0.6;
  }

  /** Let fly: from `f`'s throwing hand at you, timed to land where you're going. */
  toss(f, player) {
    const F = this.foes, def = f.def, id = THROWN[Math.floor(Math.random() * THROWN.length)];
    const finish = [def.finish || ''].flat()[0];
    const src = F.items[`${id}|${finish}`] || F.items[`${id}|`] || Object.entries(F.items).find(([k]) => k.startsWith(id + '|'))?.[1];
    if (!src) return false;
    const hand = f.bones[f.arm('R') ? 'handR' : 'handL'];
    const from = hand.getWorldPosition(new THREE.Vector3()).addScaledVector(f.forward(_a), 0.3);
    from.y += 0.2;
    const aim = _v.set(player.pos.x, player.pos.y + 1.1, player.pos.z);
    const T = Math.min(1.25, Math.max(0.38, from.distanceTo(aim) / 17));
    aim.addScaledVector(player.vel, T * 0.75);                          // (where you'll be)
    const v = new THREE.Vector3((aim.x - from.x) / T, (aim.y - from.y) / T + 0.5 * GRAV * T, (aim.z - from.z) / T);
    const g = new THREE.Group();
    const m = src.clone();
    m.traverse((c) => { if (c.isMesh) c.castShadow = true; });
    g.add(m);
    g.position.copy(from);
    // turning end over end: about the axis across its flight
    const spin = new THREE.Vector3(v.z, 0, -v.x).normalize();
    F.scene.add(g);
    this.list.push({ g, v, spin, w: 15 + Math.random() * 5, life: 4, by: f, dmg: f.kind.dmg.throw ?? 12, stuck: 0, whir: 0, flown: 0 });
    F.sound('swing', from, 'knight');
    return true;
  }

  update(dt, player) {
    const F = this.foes, zb = F.zombies, ph = zb.physics;
    for (const a of this.list) {
      a.life -= dt;
      if (a.stuck) { a.stuck -= dt; if (a.stuck < 0.6) a.g.traverse((c) => { if (c.isMesh) { c.material.transparent = true; c.material.opacity = Math.max(0, a.stuck / 0.6); } }); continue; }
      a.v.y -= GRAV * dt;
      const step = a.v.length() * dt, d = _a.copy(a.v).normalize(), p = a.g.position;
      a.g.rotateOnWorldAxis(a.spin, a.w * dt);
      if ((a.whir -= dt) < 0) { a.whir = 0.18; if (p.distanceTo(player.pos) < 9) zb.sfx?.whoosh?.(); }
      // you: a capsule from your feet to your head
      const q = closest(p, d, step, _v.set(player.pos.x, player.pos.y + 0.2, player.pos.z), 1.5);
      if (q < 0.5) {
        const fx = player.pos.x - p.x, fz = player.pos.z - p.z, facing = -Math.sin(player.yaw) * -fx + -Math.cos(player.yaw) * -fz;
        if (player.blocking && facing > 0.3 * Math.hypot(fx, fz)) {          // rung off your shield, and away
          zb.sfx?.clang?.(true);
          a.v.set(-a.v.x * 0.25 + (Math.random() - 0.5) * 3, 3 + Math.random() * 2, -a.v.z * 0.25 + (Math.random() - 0.5) * 3);
          a.w *= 0.6;
          continue;
        }
        zb.onPlayerHit?.(a.dmg, a.by, 'axe');
        player.vel.x += d.x * 2.5; player.vel.z += d.z * 2.5;
        zb.gore?.spray?.(_w.copy(p), _v.copy(d).negate(), 30, { speed: 3, spread: 0.6, size: 0.012 });
        this.drop(a);
        continue;
      }
      // (clear of the thrower and whatever he stood beside before it can hit anything but you)
      a.flown += step;
      const hit = a.flown > 1.2 ? ph.ray([p.x, p.y, p.z], [d.x, d.y, d.z], step) : null;
      const fl = a.flown > 1.2 ? zb.floorY(p.x, p.z, p.y + 0.4) : -Infinity;
      if (hit || p.y + d.y * step < fl + 0.05) {                               // it bites in where it lands
        if (hit) p.addScaledVector(d, Math.max(0, hit.t - 0.1)); else p.y = fl + 0.12;
        a.stuck = 8; zb.sfx?.clang?.(false);
        continue;
      }
      p.addScaledVector(d, step);
    }
    for (const a of this.list) if (a.life <= 0 && !a.stuck || a.stuck < 0) this.free(a);
    this.list = this.list.filter((a) => !a.gone);
  }

  /** Falls from you where it hit (no sticking in you: it lies at your feet). */
  drop(a) { a.stuck = 3; a.g.position.y = this.foes.zombies.floorY(a.g.position.x, a.g.position.z, a.g.position.y) + 0.08; }

  free(a) {
    this.foes.scene.remove(a.g);
    a.g.traverse((c) => { if (c.isMesh && c.material.transparent) c.material.dispose(); });
    a.gone = true;
  }
}

// ------------------------------------------------------------------ who's where
// (desktop; a phone takes the first of each list, and fewer of them)
const KEEPS = {
  crowstep: { band: 'crowstep', court: ['bandit_m', 'bandit_m2', 'bandit_f', 'bandit_m'], top: ['bandit_m2'], chief: ['bandit_chief', 'corrick'] },
  redfold: { band: 'redfold', court: ['scythe_m', 'scythe_axes', 'scythe_f', 'scythe_mage_m', 'scythe_axes', 'scythe_mage_f', 'scythe_m'], chief: ['scythe_pyre', 'ysolde'] },
  scythehold: { band: 'scythehold', court: ['scythe_m', 'scythe_axes', 'scythe_f', 'scythe_mage_m', 'scythe_m', 'scythe_axes'], top: ['scythe_axes'], gate: ['scythe_f', 'scythe_m'], chief: ['scythe_warlord', 'hask'] },
};
const LEDGE_FOLK = { bandit: ['bandit_m', 'bandit_m2', 'bandit_f'], scythe: ['scythe_m', 'scythe_axes', 'scythe_mage_m'] };
const AMBUSH_FOLK = { bandit: ['bandit_m', 'bandit_m2', 'bandit_f', 'bandit_m'], scythe: ['scythe_axes', 'scythe_m', 'scythe_f', 'scythe_axes'] };

/** The mountain's reavers and bandits at their places (foes.js, once their bodies are made). Returns
 * how many. The dead of the Hollow Tower and the Barrow come from the zombies (mountain dead). */
export function populateReavers(foes, S, { touch = false } = {}) {
  if (!S?.holds) return 0;
  const have = (v) => !!foes.gltf[v];
  const pick = (v) => (have(v) ? v : [v.startsWith('scythe') ? 'scythe_m' : 'bandit_m'].find(have));   // (a phone has only one body of each)
  const out = [];
  const put = (v, x, z, o = {}) => {
    const w = pick(v);
    if (!w) return null;
    const f = foes.spawn(w, x, z, { zone: 'mountain', ...o });
    f.band = o.band || null;
    if (o.yaw != null) f.yaw = o.yaw;
    out.push(f);
    return f;
  };
  const few = (list) => (touch ? list.slice(0, Math.ceil(list.length / 2)) : list);
  for (const site of S.holds) {
    const K = KEEPS[site.id];
    if (!K || !site.frame) continue;
    const F = site.frame, C = site.court, area = { x: C.x, z: C.z, r: site.r0 - 3 };
    few(K.court).forEach((v, k) => { const a = k / K.court.length * Math.PI * 2, [x, z] = [C.x + Math.cos(a) * 5, C.z + Math.sin(a) * 5]; put(v, x, z, { band: K.band, area, y: C.y }); });
    if (K.top && site.roof && !touch) for (const v of K.top) { const [x, z] = site.roof.at; put(v, x, z, { band: K.band, y: site.roof.y, area: { x, z, r: 1.5 }, yaw: F.yaw }); }
    if (K.top && site.top && !touch) for (const v of K.top) { const [x, z] = site.top.at; put(v, x, z, { band: K.band, y: site.top.y, area: { x, z, r: 1.5 }, yaw: F.yaw }); }
    if (K.gate && site.gate) K.gate.forEach((v, k) => { const [x, z] = site.gate; put(v, x + (k ? 1.6 : -1.6) * F.rx, z + (k ? 1.6 : -1.6) * F.rz, { band: K.band, area: { x, z, r: 3 }, yaw: F.yaw }); });
    if (K.chief) { const [v, slay] = K.chief, [x, z] = F.at(0, -2), f = put(v, x, z, { band: K.band, area: { x: C.x, z: C.z, r: 6 }, y: C.y }); if (f) { f.slay = slay; f.named = true; } }
  }
  for (const L of S.ledges) {
    const list = LEDGE_FOLK[L.folk];
    if (!list) continue;
    few(list).forEach((v, k) => { const a = k * 2.1; put(v, L.x + Math.cos(a) * 2.5, L.z + Math.sin(a) * 2.5, { band: L.id, area: { x: L.x, z: L.z, r: L.r0 - 1 } }); });
  }
  // the ambushes: crouched behind their rocks, blind and deaf till you're in the trap (Foe.sense)
  for (const A of S.ambushes) {
    const list = AMBUSH_FOLK[A.folk];
    A.spots.slice(0, touch ? 2 : 4).forEach(([x, z], k) => {
      const f = put(list[k % list.length], x, z, { band: 'ambush', area: { x, z, r: 1 }, yaw: Math.atan2(-A.ux, -A.uz) });
      if (f) f.lurk = A;
    });
  }
  console.info(`foes: ${out.length} reavers and bandits on the Sorrowhorn`);
  return out.length;
}

/** The dead the Hollow Tower and the Pilgrims' Barrow raised (the zombies', on the mountain), and the
 * pilgrims frozen round their reliquary on the Frostmere's shore (lying still till you come near). */
export function populateMountainDead(zombies, S, { touch = false } = {}) {
  let n = 0;
  for (const site of [...(S?.holds || []), ...(S?.ledges || [])]) {
    if (site.folk !== 'dead') continue;
    const C = site.court || site, count = (site.kind === 'tower' ? 7 : 5) - (touch ? 3 : 0);
    for (let k = 0; k < count; k++) {
      const a = k / count * Math.PI * 2 + 0.4, r = site.kind === 'tower' ? 7 + (k % 2) * 2 : 3 + (k % 2) * 1.5;
      const z = zombies.spawn(null, site.x + Math.cos(a) * r, site.z + Math.sin(a) * r, { zone: 'wild', area: { x: site.x, z: site.z, r: site.r0 } });
      z.band = site.id === 'hollowtower' ? 'hollow' : site.id;
      n++;
    }
    void C;
  }
  const W = S?.mere;
  for (const [x, z] of (W?.dead || []).filter((_, k) => !touch || k % 2 === 0)) {
    const v = (zombies.pool || []).includes('pale_ghoul') ? 'pale_ghoul' : zombies.randomVariant('water');   // (what the cold made of them)
    const zb = zombies.spawn(v, x, z, { zone: 'wild', start: 'playdead', area: { x, z, r: 6 } });
    zb.band = 'frostmere'; n++;
  }
  return n;
}

/** You've walked into ambush A: everyone lying in wait there comes for you at once, with a shout. */
export function spring(foes, A, player) {
  if (A.sprung) return;
  A.sprung = true;
  let first = true;
  for (const f of foes.zombies.list) {
    if (f.lurk !== A || f.dead) continue;
    f.lurk = null;
    f.aggro = true;
    f.hunt?.(player.pos, true);
    if (first) { foes.voice(f, 'alert'); first = false; }
    f.throwCool = 0.3 + Math.random() * 1.2;     // (the axes come first)
  }
}
