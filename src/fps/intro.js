// The opening: how Tessariel came to Bellmourn, played in the engine.
//
//  1. The deep sky. A green star crosses over the world; then close, alongside it, a man curled up
//     in black smallclothes, spinning inside the fire. (The Canticle's words, under it.)
//  2. The sky over Bellmourn: the star comes down out of it, trailing green.
//  3. One of Velscour's Sworn, come from the keep, walks out of the wood behind the town. Cut: he's
//     out in the meadow; he stops and looks up, and the green light grows on him.
//  4. Behind the star as it dives at him, him getting bigger beneath it.
//  5. It strikes him. White.
//  6. Out of the white: a crater, smoking, nothing left of him but armour thrown about, and his
//     sword, shield and staff. Every soul in the village screams at once.
//  7. Black; then your own eyes, standing in the crater.
//
// Esc (or a tap) skips to the end. main.js runs it: update(dt) each frame while `running`, the
// world camera is the intro's, the hands and the HUD are put away.
import * as THREE from 'three';
import { loadHero } from './hero.js';
import { Comet, Space } from './comet.js';
import { CRATER, formCrater } from './crater.js';

const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, t) => a + (b - a) * t;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// where he is struck: a step west of the crater's middle, out in the meadow
const STRIKE = new THREE.Vector3(CRATER.x - 3, 0, CRATER.z + 0.5);
// the shots: [start, end, name]
const SHOTS = [[0, 4.2, 'space-wide'], [4.2, 9.0, 'space-close'], [9.0, 12.6, 'sky'], [12.6, 15.6, 'knight-out'], [15.6, 19.6, 'knight-look'],
  [19.6, 22.2, 'dive'], [22.2, 23.2, 'white'], [23.2, 30.2, 'crater'], [30.2, 32.6, 'black']];
const END = 32.6;
const CAPTIONS = [
  [0.8, 4.0, '“And in the latter days a star of green fire shall fall out of the vault of heaven…”', 'The Book of the Green Star, 1:1'],
  [5.0, 8.6, '“…curled as a child in the womb, girded in black, and burning.”', 'The Canticle of Embers, 7:12'],
  [16.3, 19.4, '“…and the first of the Fiend’s servants shall be struck down where he stood.”', 'The Book of the Green Star, 2:9'],
  [25.0, 29.6, '“And every soul of the town shall cry out as one.”', 'The Litany of the Ninth Bell, verse 4'],
];

export class Intro {
  /** o: { ui, scene, camera, worldPass, sfx, foes, ctx, light (a green PointLight in the scene),
   * smoke, particles, onImpact(), onDone(), knight: () => Promise<variant> } */
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

  /** Load what it needs (the hero, the comet, the deep sky, the knight). */
  async prepare() {
    const hero = await loadHero();
    this.comet = new Comet(hero);
    this.space = new Space();
    this.knightVariant = await this.o.knight();
    return this;
  }

  start(touch = false) {
    const o = this.o;
    this.running = true; this.t = 0; this.shot = null; this.struck = false; this.screamed = false;
    this.el.classList.remove('hidden');
    const sk = this.el.querySelector('.cskip');
    sk.textContent = touch ? 'Tap here to skip' : 'Esc — skip';
    sk.onclick = sk.ontouchend = (e) => { e.preventDefault(); this.skip(); };
    formCrater(0);                     // the meadow as it was
    this.roar = o.sfx.roar();
    this.flight = null;
  }

  // ------------------------------------------------------------------ the knight
  spawnKnight(x, z) {
    const f = this.o.foes, v = this.knightVariant;
    if (this.knight) this.dropKnight();
    const k = f.spawn(v, x, z, { y: 0, zone: 'keep', fitting: 0, weapon: 'arming_sword', shield: 'thorned_kite' });
    const list = f.zombies.list, i = list.indexOf(k);
    if (i >= 0) list.splice(i, 1);     // no mind of its own: the intro walks it
    k.yaw = Math.PI / 2;               // east, toward the town
    k.play('walk', 0);
    k.sync();
    this.knight = k;
    return k;
  }

  dropKnight() {
    if (!this.knight) return;
    try { this.knight.remove(); } catch { this.knight.root.removeFromParent(); }
    for (const it of this.knight.items || []) it.removeFromParent?.();
    this.knight = null;
  }

  /** Walk the knight along, and (look > 0) tip his head back to the sky. */
  poseKnight(dt, x, z, walk, look) {
    const k = this.knight;
    if (!k) return;
    k.pos.set(x, 0, z);
    k.play(walk ? 'walk' : 'idle', 0.35, walk ? 1.15 : 1);
    k.mixer.update(dt);
    k.sync();
    k.root.updateMatrixWorld(true);
    if (look > 0) {
      // the neck and head tip back (about his own left-right axis), toward the north-west sky
      const side = _v.set(0, 0, 1).applyQuaternion(k.root.quaternion);   // his left, in the world (he faces +x)
      for (const [b, a] of [[k.bones.chest, 0.12], [k.bones.neck, 0.45], [k.bones.head, 0.7]]) {
        if (!b) continue;
        const q = new THREE.Quaternion().setFromAxisAngle(side, -a * look);
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
    const o = this.o, cam = o.camera;
    this.t += dt;
    const t = this.t;
    const s = SHOTS.find(([a, b]) => t >= a && t < b) || SHOTS[SHOTS.length - 1];
    const u = (t - s[0]) / (s[1] - s[0]), name = s[2];
    if (name !== this.shot) this.cut(name);
    this.captions(t);
    const comet = this.comet;
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
      sp.camera.updateProjectionMatrix();
      sp.fire.position.copy(p).lerp(sp.camera.position, 0.5);
      comet.update(dt, p, v, { camera: sp.camera });
      this.roar.set(name === 'space-close' ? 0.45 : 0.25, name === 'space-close' ? 0.3 : 0);
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
      this.roar.set(0.35 + 0.2 * u, 0);
      if (u < 0.08) fade = 1 - u / 0.08;
    } else if (name === 'knight-out' || name === 'knight-look') {
      if (name === 'knight-out') {
        // he steps out of the trees
        const x = lerp(-104, -98.5, u);
        this.poseKnight(dt, x, STRIKE.z - 0.6, true, 0);
        o.light.position.set(STRIKE.x - 120, 140, STRIKE.z - 140); o.light.intensity = 0; o.light.distance = 1;
        cam.position.set(-94.2 + u * 0.8, 1.0, STRIKE.z + 3.4);
        cam.lookAt(x - 0.5, 1.45, STRIKE.z - 0.6);
        cam.fov = 48;
      } else {
        // out in the meadow: he stops, and looks up
        const walk = u < 0.3, x = walk ? lerp(STRIKE.x - 3.2, STRIKE.x, u / 0.3) : STRIKE.x;
        const look = ease((u - 0.33) / 0.3);
        this.poseKnight(dt, x, STRIKE.z, walk, look);
        cam.position.set(STRIKE.x + 3.4 - u * 0.5, 0.75 + u * 0.15, STRIKE.z + 3.0 - u * 0.3);
        cam.lookAt(STRIKE.x, 1.75 + look * 0.5, STRIKE.z);
        cam.fov = 44;
        // the green light falls on him from the sky
        // the star comes on across the sky toward him, and its light falls on him
        const Q0 = new THREE.Vector3(-230, 140, -150), P0 = new THREE.Vector3(STRIKE.x - 70, 150, STRIKE.z - 75);
        const cp = _w.copy(Q0).lerp(P0, u);
        comet.setScale(lerp(4, 1.6, u)); comet.amount = lerp(2.6, 1.6, u);
        comet.update(dt, cp, P0.clone().sub(Q0).multiplyScalar(1 / 4), { camera: cam });
        o.light.position.copy(cp);
        o.light.intensity = 20 + 120 * ease((u - 0.3) / 0.7) ** 2;
        o.light.distance = 260;
      }
      this.roar.set(name === 'knight-look' ? 0.4 + 0.4 * u : 0.3, 0);
    } else if (name === 'dive') {
      // behind the star, diving at him
      const k = u * u;
      const P0 = new THREE.Vector3(STRIKE.x - 70, 150, STRIKE.z - 75), I = new THREE.Vector3(STRIKE.x, 1.0, STRIKE.z);
      const p = _v.copy(P0).lerp(I, k), v = _w.copy(I).sub(P0).multiplyScalar(2 * Math.max(u, 0.05) / 2.6);
      comet.setScale(1.6); comet.amount = 1.6;
      comet.update(dt, p, v, { camera: cam });
      const fwd = v.clone().normalize(), side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      cam.position.copy(p).addScaledVector(fwd, -lerp(9, 6, u)).addScaledVector(side, lerp(4, 2.6, u)).add(new THREE.Vector3(0, lerp(1.5, 0.6, u), 0));
      cam.lookAt(_v.copy(p).lerp(I, lerp(0.7, 0.55, u)));
      cam.fov = lerp(60, 75, u);
      this.poseKnight(dt, STRIKE.x, STRIKE.z, false, 1);
      o.light.position.copy(p); o.light.intensity = 30 + 220 * k; o.light.distance = 90;
      this.roar.set(0.8 + 0.2 * u, u);
    } else if (name === 'white') {
      if (!this.struck) this.strike();
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
      if (Math.random() < dt * 30) o.smoke?.emit(new THREE.Vector3(CRATER.x + (Math.random() - 0.5) * 8, -1.5, CRATER.z + (Math.random() - 0.5) * 8),
        new THREE.Vector3((Math.random() - 0.5) * 0.8, 2.2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8), { life: 5, size: 2.2, grow: 2.6, alpha: 0.45, shade: 0.35 });
      o.light.position.set(CRATER.x, 1.5, CRATER.z); o.light.intensity = lerp(60, 6, ease(u)); o.light.distance = 40;
      if (!this.screamed && u > 0.12) { this.screamed = true; o.sfx.scream(18, 0.6); }
      if (u > 0.88) fade = (u - 0.88) / 0.12;
    } else if (name === 'black') {
      fade = 1;
      if (u > 0.2 && !this.placed) { this.placed = true; this.o.onPlace?.(); }
      fade = u < 0.45 ? 1 : 1 - ease((u - 0.45) / 0.55);
      if (u >= 0.45 && !this.handed) { this.handed = true; this.o.onControl?.(); }
    }
    cam.updateProjectionMatrix();
    this.fadeEl.style.background = white > fade ? '#fff' : '#000';
    this.fadeEl.style.opacity = Math.max(white, fade).toFixed(3);
    if (t >= END) this.finish();
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
    if (name === 'knight-out') this.spawnKnight(-104, STRIKE.z - 0.6);
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
  }
}
