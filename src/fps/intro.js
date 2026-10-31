// The opening: how Tessariel came to Bellmourn, played in the engine.
//
//  1. The deep sky. A green star crosses over the world; then close, alongside it, a man curled up
//     in black smallclothes, spinning inside the fire. (The Canticle's words, under it.)
//  2. The sky over Bellmourn: the star comes down out of it, trailing green.
//  3. One of Velscour's Sworn, come from the keep, walks out of the wood behind the town on his round.
//     Cut: he's out in the meadow. The green light grows behind him; he stops, turns, looks up at it,
//     flinches with a yell, and cowers under his shield.
//  4. Behind the star as it dives at him: he turns and runs for the town, and it catches him.
//  5. It strikes him. White.
//  6. Out of the white: a crater, smoking, nothing left of him but armour thrown about, and his
//     sword, shield and staff. Every soul in the village screams at once.
//  7. Black; then your own eyes, standing in the crater.
//
// Nothing is fetched, built or compiled while it plays: prepare() waits for everything it shows (and
// what main brings in for after it: the village, the knight's armour and arms, the gifts), compiles
// every shader both scenes draw, and draws a frame of every shot behind the loading screen.
//
// Esc (or a tap) skips to the end. main.js runs it: update(dt) each frame while `running`, the
// world camera is the intro's, the hands and the HUD are put away.
import * as THREE from 'three';
import { loadHero } from './hero.js';
import { Comet, Space } from './comet.js';
import { CRATER, formCrater } from './crater.js';

const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, t) => a + (b - a) * t;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Quaternion();

// the shots: [start, end, name]
const SHOTS = [[0, 4.2, 'space-wide'], [4.2, 9.0, 'space-close'], [9.0, 12.6, 'sky'], [12.6, 15.6, 'knight-out'], [15.6, 18.2, 'knight-look'],
  [18.2, 20.6, 'knight-fear'], [20.6, 23.2, 'dive'], [23.2, 24.2, 'white'], [24.2, 31.2, 'crater'], [31.2, 33.6, 'black']];
const END = 33.6;
const startOf = (name) => SHOTS.find((s) => s[2] === name)[0];
const T_OUT = startOf('knight-out'), T_LOOK = startOf('knight-look'), T_FEAR = startOf('knight-fear'), T_DIVE = startOf('dive'), T_HIT = startOf('white');
const CAPTIONS = [
  [0.8, 4.0, '“And in the latter days a star of green fire shall fall out of the vault of heaven…”', 'The Book of the Green Star, 1:1'],
  [5.0, 8.6, '“…curled as a child in the womb, girded in black, and burning.”', 'The Canticle of Embers, 7:12'],
  [15.9, 19.2, '“…and the first of the Fiend’s servants shall be struck down where he stood.”', 'The Book of the Green Star, 2:9'],
  [26.0, 30.6, '“And every soul of the town shall cry out as one.”', 'The Litany of the Ninth Bell, verse 4'],
];

// ------------------------------------------------------------------ the knight's part
// Out of the wood on his round (the formal walk, his shield carried at his side); then, cut, on into
// the meadow, where he stops at the green light behind him, turns to it, looks up, flinches with a
// yell, and cowers under his raised shield, backing off; then (seen from the star) turns and runs for
// the town, and is caught a stride or two into the crater's ground.
const WALK = 1.3;                              // m/s, on his round
const RUN = 5.5;                               // m/s, flat out
const OUT = { x: -104, z: CRATER.z - 0.1 };    // where he steps out of the trees
// in the meadow (seconds into the 'knight-look' shot): he stops; turns round to the light; has turned;
// flinches (and yells); cowers under the shield. back: how far the flinch throws him back (m), creep:
// how fast he backs off under the shield (m/s)
const K = { stop: 1.2, turn: 1.6, turned: 2.4, flinch: 3.0, cower: 3.43, back: 0.45, creep: 0.3 };
const TURN_BACK = 0.3, RAMP = 0.45;            // the dive: turning to run (s), getting up to speed (s)
const BACKED = K.back + K.creep * (T_DIVE - T_LOOK - K.cower);   // how far he's backed off when he runs
const RAN = RUN * (T_HIT - T_DIVE - TURN_BACK - RAMP / 2);        // how far he gets
// where he stops: as far west of the crater's middle as he gets before he's caught
const STOP = new THREE.Vector3(CRATER.x + 1 - BACKED - RAN, 0, CRATER.z + 0.5);
// the star: where the sky shot leaves it, and where it turns down at him (west of him, high up, near
// enough to fill his sky), and how it falls from there (faster and faster: STRIKE at 1)
const Q0 = new THREE.Vector3(-230, 140, -150);
const P0 = STOP.clone().add(new THREE.Vector3(-70, 55, -15));
const FALL = 1.7;
const FACE = Math.atan2(P0.x - STOP.x, P0.z - STOP.z);   // his heading, turned to it
// a clip's stand-in for a knight without the animation library's clips (knight_a)
const STAND_IN = { patrol: 'walk', hit_head: 'hit', block: 'idle', sprint: 'run' };

/** The knight at time t of the opening: where he is, his heading, his clip and its rate (v: over the
 * ground at v m/s; ts: at that time scale), how far his head is tipped back to the sky (0..1), and
 * whether he yells. */
function knightAt(t) {
  if (t < T_LOOK) return { x: OUT.x + WALK * (t - T_OUT), z: OUT.z, yaw: Math.PI / 2, clip: 'patrol', v: WALK, look: 0 };
  if (t < T_DIVE) {
    const s = t - T_LOOK;
    if (s < K.stop) return { x: STOP.x - WALK * (K.stop - s), z: STOP.z, yaw: Math.PI / 2, clip: 'patrol', v: WALK, look: 0 };
    // turning round by his right, the short way (his face to the camera as he comes round)
    const turn = ease((s - K.turn) / (K.turned - K.turn)), yaw = lerp(Math.PI / 2, FACE, turn);
    const x = STOP.x + K.back * ease((s - K.flinch) / 0.35) + K.creep * Math.max(0, s - K.cower);
    if (s >= K.cower) return { x, z: STOP.z, yaw, clip: 'block', ts: 1, look: 0.55 };
    if (s >= K.flinch) return { x, z: STOP.z, yaw, clip: 'hit_head', ts: 1, look: lerp(1, 0.55, (s - K.flinch) / (K.cower - K.flinch)), yell: true };
    if (s >= K.turned) return { x, z: STOP.z, yaw, clip: 'idle', ts: 1, look: ease((s - K.turned) / 0.5) };
    if (s >= K.turn) return { x, z: STOP.z, yaw, clip: 'walk', ts: 0.9, look: 0.25 * (1 - turn) };
    return { x, z: STOP.z, yaw, clip: 'idle', ts: 1, look: 0.25 * ease((s - K.stop) / 0.4) };   // (what's that light?)
  }
  // the star coming down at him: he whirls round and runs
  const d = t - T_DIVE, r = Math.max(0, d - TURN_BACK);
  const ran = r < RAMP ? RUN * r * r / (2 * RAMP) : RUN * (r - RAMP / 2);
  return { x: STOP.x + BACKED + ran, z: STOP.z, yaw: lerp(FACE, Math.PI / 2, ease(d / TURN_BACK)),
    clip: 'sprint', v: RUN * Math.max(0.35, Math.min(1, r / RAMP)), look: 0 };
}
// where the star finds him
const CAUGHT = knightAt(T_HIT - 1e-3);
const STRIKE = new THREE.Vector3(CAUGHT.x, 1.0, CAUGHT.z);

export class Intro {
  /** o: { ui, scene, camera, worldPass, renderer, render(), sfx, foes, ctx, light (a green PointLight
   * in the scene), smoke, particles, villagers, layArms(ids), onImpact(), onPlace(), onControl(),
   * onDone(), knight: () => Promise<variant>, preload: (say) => Promise, calibrate(ms) } */
  constructor(o) {
    this.o = o;
    this.running = false;
    this.t = 0;
    this.el = document.createElement('div');
    this.el.className = 'cine hidden';
    this.el.innerHTML = '<div class="cbar top"></div><div class="cbar bot"></div><div class="ccap"><i></i><b></b></div><div class="cfade"></div><div class="cskip"></div>';
    o.ui.append(this.el);
    this.fadeEl = this.el.querySelector('.cfade');
    this.capEl = this.el.querySelector('.ccap');
  }

  /** Make ready everything the opening shows, so that nothing is fetched, built or compiled while it
   * plays: the hero, the comet, the deep sky, the knight (o.knight waits for the Sworn), what main
   * brings in (o.preload: the village, the knight's armour and arms, the gifts), then warm(). say(text):
   * the loading line. */
  async prepare(say = () => {}) {
    say('Bringing down the green star…');
    const hero = await loadHero();
    this.comet = new Comet(hero);
    this.space = new Space();
    say('A knight rides out of Blackvigil…');
    this.knightVariant = await this.o.knight();
    await this.o.preload?.(say);
    say('Lighting the sky…');
    await this.warm();
    return this;
  }

  /** Every shader both scenes draw compiled, and a frame of every shot drawn (behind the loading
   * screen), so the textures and buffers are on the GPU before it starts; then how long the heaviest
   * shot takes to draw, for main to size the picture to (o.calibrate). */
  async warm() {
    const o = this.o, R = o.renderer, breathe = () => new Promise((r) => setTimeout(r, 0));
    // compiled as the game draws them: into its own picture, not straight to the screen (whose
    // shaders differ: they'd tone-map and convert colour themselves)
    const compile = (sc, c) => {
      const was = R.getRenderTarget();
      R.setRenderTarget(o.compileTarget?.() ?? was);
      const p = R.compileAsync(sc, c);
      R.setRenderTarget(was);
      return p;
    };
    this.spawnKnight();
    // the crater as it will be (its arms laid out, their models hung on), the knight out, every
    // villager out of doors: compiled, in the world and in the deep sky, with the comet in each
    formCrater(1);
    o.layArms?.();
    await breathe();
    o.ctx.crater.group.visible = true;
    const vis = (o.villagers?.list || []).map((a) => [a.root, a.root.visible]);
    for (const [r] of vis) r.visible = true;
    this.knight.root.visible = true;
    this.comet.setScene(o.scene);
    this.comet.update(0.016, _v.set(STOP.x - 20, 30, STOP.z), _w.set(30, -30, 0), { camera: o.camera });
    const done = compile(o.scene, o.camera);
    for (const [r, v] of vis) r.visible = v;
    await done;
    this.comet.remove(); this.comet.setScene(this.space.scene);
    await compile(this.space.scene, this.space.camera);
    for (const [sc, c] of o.compileAlso || []) await compile(sc, c);   // (the hands, as the picture comes back)
    // their textures up to the GPU (the village, the knight, the arms, the crater's armour)
    for (const root of [...vis.map(([r]) => r), this.knight.root, o.ctx.crater.group, o.ctx.loot?.group, this.space.scene, this.comet.group]) this.upload(root);
    // a frame of each shot: its first (the widest new view) and a later one
    for (const t of [0.05, 2.0, 4.25, 6.5, 8.8, 9.05, 11.0, 12.65, 14.0, 15.65, 17.2, 18.25, 19.5, 20.62, 20.8, 21.4, 22.6, 23.0, 23.3, 24.25, 26.0, 29.5]) {
      this.show(t, 1 / 30, true);
      o.ctx.crater.group.visible = true;   // (the game's own frames hide it while the camera's far off)
      o.render();
      await breathe();
    }
    // what you see when you wake: the village where it will stand, from the crater and from its rim,
    // your hands up (o.stage puts them there for these frames alone)
    const cam = o.camera;
    for (const v of o.stage?.(true) || []) {
      cam.position.copy(v.pos); cam.lookAt(v.look); cam.fov = 70; cam.updateProjectionMatrix();
      o.ctx.crater.group.visible = true;
      o.render(true);
    }
    o.stage?.(false);
    // how long the heaviest shot takes (the knight under the star): the whole frame (the GPU waited
    // on) and the part of it spent waiting on the GPU
    if (o.calibrate) {
      this.show(19.5, 1 / 30, true);
      const gl = R.getContext(), px = new Uint8Array(4);
      const time = () => {
        const a = performance.now();
        o.render();
        const b = performance.now();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return [performance.now() - a, performance.now() - b];
      };
      time(); time();
      let ms = 0, gpu = 0;
      for (let i = 0; i < 4; i++) { const [m, g] = time(); ms += m / 4; gpu += g / 4; }
      o.calibrate(ms, gpu);
    }
    // and back as it was before it all
    o.layArms?.([]);
    formCrater(0);
    this.knight.root.visible = false;
    this.comet.remove(); this.comet.trail.clear(); this.comet.t = 0;
    o.worldPass.scene = o.scene; o.worldPass.camera = o.camera;
    o.light.intensity = 0;
    this.shot = null; this.kClip = null;
  }

  /** Put a model's textures on the GPU now (not the first time it's drawn). */
  upload(root) {
    const R = this.o.renderer, seen = new Set();
    root?.traverse((o) => {
      for (const m of [o.material].flat()) {
        if (!m) continue;
        for (const v of Object.values(m)) if (v?.isTexture && !seen.has(v)) { seen.add(v); if (v.image) R.initTexture(v); }
        for (const u of Object.values(m.uniforms || {})) if (u?.value?.isTexture && !seen.has(u.value)) { seen.add(u.value); if (u.value.image) R.initTexture(u.value); }
      }
    });
  }

  start(touch = false) {
    const o = this.o;
    this.running = true; this.t = 0; this.shot = null; this.struck = false; this.screamed = false; this.yelled = false; this.kClip = null;
    this.el.classList.remove('hidden');
    const sk = this.el.querySelector('.cskip');
    sk.textContent = touch ? 'Tap here to skip' : 'Esc — skip';
    sk.onclick = sk.ontouchend = (e) => { e.preventDefault(); this.skip(); };
    formCrater(0);                     // the meadow as it was
    this.roar = o.sfx.roar();
    this.flight = null;
  }

  // ------------------------------------------------------------------ the knight
  /** The knight, made once (in warm), hidden till his shot. */
  spawnKnight() {
    if (this.knight) return this.knight;
    const f = this.o.foes, v = this.knightVariant;
    const k = f.spawn(v, OUT.x, OUT.z, { y: 0, zone: 'keep', fitting: 0, weapon: 'arming_sword', shield: 'thorned_kite' });
    const list = f.zombies.list, i = list.indexOf(k);
    if (i >= 0) list.splice(i, 1);     // no mind of its own: the intro walks it
    k.state = 'intro';                 // (and plays what it's told: no at-ease swaps)
    k.yaw = Math.PI / 2;               // east, toward the town
    k.play(k.actions.patrol ? 'patrol' : 'walk', 0);
    k.sync();
    k.root.visible = false;
    this.knight = k;
    return k;
  }

  dropKnight() {
    if (!this.knight) return;
    try { this.knight.remove(); } catch { this.knight.root.removeFromParent(); }
    for (const it of this.knight.items || []) it.g?.removeFromParent?.();
    this.knight = null;
  }

  /** The knight as he is at time t (knightAt): moved, turned, his clip at its rate, his head tipped
   * back to the sky. */
  poseKnight(dt, t, dry = false) {
    const k = this.knight;
    if (!k) return;
    const p = knightAt(t);
    k.pos.set(p.x, 0, p.z);
    k.yaw = p.yaw;
    const clip = k.actions[p.clip] ? p.clip : STAND_IN[p.clip] || 'idle';
    if (clip !== this.kClip) { this.kClip = clip; k.holdT = 0; k.play(clip, this.shot === 'knight-look' && clip === 'hit_head' ? 0.06 : dry ? 0 : 0.3); }
    const a = k.actions[k.cur];
    if (a) a.timeScale = p.v ? Math.max(0.45, p.v / (k.kind.gait?.[clip] || p.v)) : p.ts ?? 1;
    if (p.yell && !this.yelled && !dry) { this.yelled = true; this.o.sfx.scream(1, 0.25); }   // a man's yell, alone
    k.mixer.update(dt);
    k.carryShield?.(dt);
    k.sync();
    k.root.updateMatrixWorld(true);
    if (p.look > 0) {
      // the chest, neck and head tip back (about his own left-right axis) to the sky
      const side = _d.set(1, 0, 0).applyQuaternion(k.root.quaternion);
      for (const [b, ang] of [[k.bones.chest, 0.12], [k.bones.neck, 0.3], [k.bones.head, 0.38]]) {
        if (!b) continue;
        const q = _q.setFromAxisAngle(side, -ang * p.look);
        const wq = b.getWorldQuaternion(new THREE.Quaternion());
        const pq = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        b.quaternion.copy(pq.multiply(q.multiply(wq)));
        b.updateMatrixWorld(true);
      }
    }
  }

  // ------------------------------------------------------------------ each frame
  update(dt) {
    if (!this.running) return;
    this.t += dt;
    this.show(this.t, dt, false);
    if (this.t >= END) this.finish();
  }

  /** The opening as it is at time t: the shot, its camera, the comet, the knight, the light. dry:
   * only the picture (warm draws each shot with it: no sound, no strike, no captions, no fades). */
  show(t, dt, dry) {
    const o = this.o, cam = o.camera;
    const s = SHOTS.find(([a, b]) => t >= a && t < b) || SHOTS[SHOTS.length - 1];
    const u = (t - s[0]) / (s[1] - s[0]), name = s[2];
    if (name !== this.shot) this.cut(name);
    if (!dry) this.captions(t);
    const comet = this.comet, roar = (k, near = 0) => { if (!dry) this.roar?.set(k, near); };
    let fade = 0, white = 0;

    if (name === 'space-wide' || name === 'space-close') {
      const sp = this.space;
      sp.update(t);
      // its flight across the deep sky, toward the world's rim
      const p = _v.set(-170 + 70 * t, 85 - 26 * t, -95 + 38 * t), v = _w.set(70, -26, 38);
      if (name === 'space-wide') {
        sp.camera.position.set(-30 + 20 * u, 62 - 6 * u, 92 - 6 * u);
        sp.camera.lookAt(p.x - 22, p.y + 6, p.z - 12);   // the head a little right of the middle, its tail across the sky
        sp.camera.fov = 58;
      } else {
        const a = 0.2 + 1.5 * ease(u), d = lerp(8.5, 5.4, ease(u));
        const side = new THREE.Vector3().crossVectors(v.clone().normalize(), new THREE.Vector3(0, 1, 0)).normalize();
        const up = new THREE.Vector3().crossVectors(side, v.clone().normalize()).normalize();
        sp.camera.position.copy(p).addScaledVector(side, Math.cos(a) * d).addScaledVector(up, Math.sin(a) * d * 0.6 + 0.8).addScaledVector(v.clone().normalize(), lerp(2.6, 1.2, u));
        sp.camera.lookAt(p.x - v.x * 0.012, p.y - v.y * 0.012, p.z - v.z * 0.012);
        sp.camera.fov = 52;
      }
      sp.camera.aspect = cam.aspect;
      sp.camera.updateProjectionMatrix();
      sp.fire.position.copy(p).lerp(sp.camera.position, 0.5);
      comet.update(dt, p, v, { camera: sp.camera });
      roar(name === 'space-close' ? 0.45 : 0.25, name === 'space-close' ? 0.3 : 0);
      if (name === 'space-close' && u > 0.92) fade = (u - 0.92) / 0.08;
    } else if (name === 'sky') {
      // seen from the meadow by the town, the star comes down out of the north-west sky
      const k = ease(u * 0.9);
      const p = _v.set(lerp(60, -230, k), lerp(360, 140, k), lerp(-400, -150, k));   // across the sky, east to west, coming down
      const v = _w.set(-290, -220, 250).multiplyScalar(1 / 3.6);
      cam.position.set(-48, 1.6, -40);
      cam.lookAt(lerp(-30, -150, u), lerp(250, 150, u), lerp(-330, -200, u));
      cam.fov = 70;
      comet.setScale(4); comet.amount = 2.6;
      comet.update(dt, p, v, { camera: cam });
      o.light.position.copy(p); o.light.intensity = 0;
      roar(0.35 + 0.2 * u);
      if (u < 0.08) fade = 1 - u / 0.08;
    } else if (name === 'knight-out') {
      // he steps out of the trees, on his round
      const kp = knightAt(t);
      this.poseKnight(dt, t, dry);
      o.light.position.set(STOP.x - 120, 140, STOP.z - 140); o.light.intensity = 0; o.light.distance = 1;
      cam.position.set(OUT.x + 8.2 + u * 0.4, 1.0, OUT.z + 4.0);
      cam.lookAt(kp.x - 0.5, 1.45, kp.z);
      cam.fov = 48;
      roar(0.3);
    } else if (name === 'knight-look' || name === 'knight-fear') {
      // out in the meadow: the light grows behind him; he stops, turns, looks up at it and breaks
      const sec = t - T_LOOK, kp = knightAt(t), w = (t - T_LOOK) / (T_DIVE - T_LOOK);
      this.poseKnight(dt, t, dry);
      const cp = _w.copy(Q0).lerp(P0, w);   // (the star coming on across the sky at him, over both shots)
      comet.setScale(lerp(4, 1.6, w)); comet.amount = lerp(2.6, 1.6, w);
      comet.update(dt, cp, _e.copy(P0).sub(Q0).multiplyScalar(1 / (T_DIVE - T_LOOK)), { camera: cam });
      if (name === 'knight-look') {
        // low in front of him; drawing back as he turns away to it, and coming up off him to take in
        // the sky he's turned to
        const back = ease((sec - 1.4) / 1.2);
        cam.position.set(STOP.x + lerp(3.6, 5.8, back) - sec * 0.05, lerp(0.78, 1.0, back), STOP.z + lerp(3.1, 4.6, back));
        const up = 0.32 * ease((sec - 1.7) / 0.9);
        const toHim = _v.set(kp.x, 1.3, kp.z).sub(cam.position).normalize(), toIt = _d.copy(cp).sub(cam.position).normalize();
        cam.lookAt(toHim.multiplyScalar(1 - up).addScaledVector(toIt, up).normalize().add(cam.position));
        cam.fov = lerp(44, 60, up / 0.32);
      } else {
        // the reverse: low in front of him, between him and the star, up at him in its light as he
        // looks up, flinches and throws his shield over his head (backing off: the camera half keeps up)
        const s2 = t - T_FEAR, fx = Math.sin(FACE), fz = Math.cos(FACE), x = lerp(STOP.x, kp.x, 0.5);
        cam.position.set(x + fx * 3.4 - fz * 0.9, 0.5 + s2 * 0.04, STOP.z + fz * 3.4 + fx * 0.9);
        cam.lookAt(kp.x, 1.75, kp.z);
        cam.fov = 50;
        // the flinch shakes the picture
        const jolt = Math.max(0, 1 - Math.abs(sec - K.flinch - 0.08) / 0.25);
        if (jolt > 0 && !dry) cam.rotateZ((Math.random() - 0.5) * 0.05 * jolt).rotateX((Math.random() - 0.5) * 0.04 * jolt);
      }
      // the green light falls on him (and the meadow and the wood) from the star
      o.light.position.copy(cp);
      o.light.intensity = 30 + 1300 * ease((w - 0.2) / 0.8) ** 2;
      o.light.distance = 260;
      roar(0.35 + 0.45 * w);
    } else if (name === 'dive') {
      // behind the star and off to its side, diving at him as he runs; it pulls away from the camera,
      // which falls back to a dozen metres behind him and off its path, and it goes past into him
      const k = u ** FALL;
      const p = _v.copy(P0).lerp(STRIKE, k), v = _w.copy(STRIKE).sub(P0).multiplyScalar(FALL * Math.max(u, 0.05) ** (FALL - 1) / (T_HIT - T_DIVE));
      comet.setScale(1.6); comet.amount = 1.6;
      comet.update(dt, p, v, { camera: cam });
      const kp = knightAt(t), him = new THREE.Vector3(kp.x, 1.0, kp.z);
      const fwd = _d.copy(v).normalize(), side = _e.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const riding = new THREE.Vector3().copy(p).addScaledVector(fwd, -lerp(10, 7, u)).addScaledVector(side, lerp(7.5, 5, u)).add(new THREE.Vector3(0, lerp(2.2, 1.0, u), 0));
      const flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();   // (back along its course over the ground: it comes in over the camera)
      const behind = new THREE.Vector3(STRIKE.x, 2.6, STRIKE.z).addScaledVector(flat, -12).addScaledVector(side, 3.5);
      const b = ease((u - 0.35) / 0.5);
      cam.position.copy(riding).lerp(behind, b);
      cam.lookAt(new THREE.Vector3().copy(p).lerp(him, lerp(0.8, 0.68, u)).lerp(him.setY(0.9), b));
      cam.fov = lerp(lerp(60, 72, u), 42, b);
      this.poseKnight(dt, t, dry);
      o.light.position.copy(p); o.light.intensity = 30 + 220 * k; o.light.distance = 90;
      roar(0.8 + 0.2 * u, u);
    } else if (name === 'white') {
      if (!this.struck && !dry) this.strike();
      white = 1;
      cam.position.set(STRIKE.x + 14, 9, STRIKE.z + 18);
      cam.lookAt(CRATER.x, -2, CRATER.z);
    } else if (name === 'crater') {
      white = 1 - ease(u / 0.26);
      // a high, slow swing round the smoking crater
      const a = 0.9 + u * 0.55, d = lerp(34, 26, ease(u)), h = lerp(16, 9, ease(u));
      cam.position.set(CRATER.x + Math.cos(a) * d, h, CRATER.z + Math.sin(a) * d);
      cam.lookAt(CRATER.x, -1.5, CRATER.z);
      cam.fov = 55;
      // smoke pours up out of it a while
      if (!dry && Math.random() < dt * 30) o.smoke?.emit(new THREE.Vector3(CRATER.x + (Math.random() - 0.5) * 8, -1.5, CRATER.z + (Math.random() - 0.5) * 8),
        new THREE.Vector3((Math.random() - 0.5) * 0.8, 2.2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8), { life: 5, size: 2.2, grow: 2.6, alpha: 0.45, shade: 0.35 });
      o.light.position.set(CRATER.x, 1.5, CRATER.z); o.light.intensity = lerp(60, 6, ease(u)); o.light.distance = 40;
      if (!this.screamed && u > 0.12 && !dry) { this.screamed = true; o.sfx.scream(18, 0.6); }
      if (u > 0.88) fade = (u - 0.88) / 0.12;
    } else if (name === 'black' && !dry) {
      fade = 1;
      if (u > 0.2 && !this.placed) { this.placed = true; this.o.onPlace?.(); }
      fade = u < 0.45 ? 1 : 1 - ease((u - 0.45) / 0.55);
      if (u >= 0.45 && !this.handed) { this.handed = true; this.o.onControl?.(); }
    }
    cam.updateProjectionMatrix();
    if (!dry) {
      this.fadeEl.style.background = white > fade ? '#fff' : '#000';
      this.fadeEl.style.opacity = Math.max(white, fade).toFixed(3);
    }
  }

  /** A cut to another shot: into the deep sky or out of it. */
  cut(name) {
    const o = this.o, inSpace = name.startsWith('space');
    this.shot = name;
    if (inSpace) {
      o.worldPass.scene = this.space.scene; o.worldPass.camera = this.space.camera;
      this.comet.remove(); this.comet.setScene(this.space.scene); this.comet.setScale(1); this.comet.amount = 1;
      this.space.camera.aspect = o.camera.aspect;
    } else {
      o.worldPass.scene = o.scene; o.worldPass.camera = o.camera;
      if (!this.struck) { this.comet.remove(); this.comet.setScene(o.scene); }
    }
    if (name === 'sky') this.comet.trail.clear();
    if (this.knight) this.knight.root.visible = name === 'knight-out' || name === 'knight-look' || name === 'knight-fear' || name === 'dive';
    if (name === 'dive') this.comet.trail.clear();
  }

  /** The star strikes: white, the boom, the knight gone, the crater made, his things thrown about. */
  strike() {
    const o = this.o;
    this.struck = true;
    this.roar.stop(0.05);
    o.sfx.impact();
    this.dropKnight();
    this.comet.remove();
    formCrater(1);
    o.onImpact?.();
    // earth, stones and green fire thrown up, to come down as the white clears
    const P = o.particles, at = new THREE.Vector3(CRATER.x, 0.5, CRATER.z);
    if (P) {
      P.burst(at, [new THREE.Color('#5a4630'), new THREE.Color('#3a2c1e'), new THREE.Color('#7a6448')], 260, { speed: 16, size: 0.12, grav: 12, life: 4.5, drag: 0.4 });
      P.burst(at, [new THREE.Color('#9affb0'), new THREE.Color('#40ff70'), new THREE.Color('#e8ffe0')], 160, { speed: 22, size: 0.06, grav: 5, life: 3, drag: 0.6 });
    }
    for (let i = 0; i < 40; i++) o.smoke?.emit(new THREE.Vector3(CRATER.x + (Math.random() - 0.5) * 14, 0, CRATER.z + (Math.random() - 0.5) * 14),
      new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 5, (Math.random() - 0.5) * 4), { life: 6, size: 3, grow: 3.5, alpha: 0.55, shade: 0.3 });
  }

  captions(t) {
    const c = CAPTIONS.find(([a, b]) => t >= a && t < b);
    const key = c ? c[2] : '';
    if (key !== this.capKey) {
      this.capKey = key;
      this.capEl.querySelector('i').textContent = c ? c[2] : '';
      this.capEl.querySelector('b').textContent = c ? '— ' + c[3] : '';
    }
    this.capEl.style.opacity = c ? Math.min(1, (t - c[0]) / 0.6, (c[1] - t) / 0.6).toFixed(2) : '0';
  }

  /** Straight to the end (Esc or a tap). */
  skip() {
    if (!this.running) return;
    if (!this.struck) this.strike();
    this.dropKnight();
    this.o.worldPass.scene = this.o.scene; this.o.worldPass.camera = this.o.camera;
    if (!this.placed) { this.placed = true; this.o.onPlace?.(); }
    if (!this.handed) { this.handed = true; this.o.onControl?.(); }
    this.finish();
  }

  finish() {
    this.running = false;
    this.roar?.stop(0.3);
    this.el.classList.add('hidden');
    this.o.worldPass.scene = this.o.scene; this.o.worldPass.camera = this.o.camera;
    this.o.light.position.set(CRATER.x, 1.5, CRATER.z); this.o.light.distance = 30;
    this.comet.remove();
    this.dropKnight();
    this.o.onDone?.();
  }

  /** Let go of the deep sky, the comet and the hero (the GPU keeps nothing of them). */
  dispose() {
    const free = (root) => root?.traverse((o) => {
      o.geometry?.dispose?.();
      for (const m of [o.material].flat()) if (m) { for (const v of Object.values(m)) if (v?.isTexture && !v.userData?.shared) v.dispose?.(); m.dispose?.(); }
    });
    free(this.space?.scene); free(this.comet?.group); free(this.comet?.trail.points);
    this.space = this.comet = null;
    this.el.remove();
    this.dropKnight();
  }
}
