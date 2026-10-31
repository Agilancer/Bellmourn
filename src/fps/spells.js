// Magic and effects: the spellbook, projectiles that are real moving lights (the brightest
// cast shadows), bursts with fireballs, shockwaves, sparks, smoke, scorch and frost marks,
// lightning that arcs to the walls around it, the follow-me wisp, healing runes, and the
// flickering flames on every torch and candle. The second spellbook's workings (walls, beams,
// novas, storms and the rest) are in arcana.js.
import * as THREE from 'three';
import { Decals, Waves, Arcs } from './effects.js';
import { Arcana } from './arcana.js';

const FIRE = ['#fff6c0', '#ffb040', '#e0501c', '#701c10'], ICE = ['#ffffff', '#bfe8ff', '#5aa8e8', '#23407a'];
const ARCANE = ['#ffffff', '#d8a0ff', '#9050e0', '#3a1060'];
// hands: 1 = cast from one free hand, 2 = both hands (whatever they hold is lowered).
// cast: how arcana.js works it ('bolt' flies like a firebolt; land: what it does where it lands).
// channel: held down (the key), costing `mana` to begin and `drain` a second while it lasts.
export const SPELLS = {
  firebolt: { name: 'Firebolt', kind: 'fire', hands: 1, mana: 8, speed: 34, size: 0.55, charge: 2.0,
    colors: ['#fff6c0', '#ffb040', '#e0501c', '#701c10'], light: 0xff7a30, power: 30, burst: 90, desc: 'Gathers in the hand for two seconds, then roars away and bursts where it lands.' },
  frost: { name: 'Frost Shards', kind: 'frost', hands: 1, mana: 12, speed: 40, size: 0.26, shards: 3, spread: 0.05,
    colors: ['#ffffff', '#bfe8ff', '#5aa8e8', '#23407a'], light: 0x8fc8ff, power: 14, burst: 34, desc: 'Three splinters of ice that shatter into frost.' },
  lightning: { name: 'Ball Lightning', kind: 'lightning', hands: 2, mana: 22, speed: 12, size: 0.9,
    colors: ['#ffffff', '#d8d0ff', '#8a70ff', '#3a2490'], light: 0xa890ff, power: 46, burst: 140, desc: 'A slow sphere of storm that lashes the walls around it, then detonates.' },
  mend: { name: 'Mend', kind: 'heal', hands: 2, mana: 25, self: 'heal', amount: 35,
    colors: ['#ffffff', '#d8ffb0', '#6ad860', '#1c6a30'], light: 0x9cff8a, power: 30, desc: 'A circle of light closes your wounds (restores 35 health).' },
  wisp: { name: 'Wisp Light', kind: 'wisp', hands: 1, mana: 15, self: 'wisp', duration: 90,
    colors: ['#ffffff', '#fff2c0', '#ffd070', '#a06a20'], light: 0xffe8b0, power: 16, desc: 'A spirit-light that follows you for 90 seconds.' },
  wallfire: { name: 'Wall of Fire', kind: 'fire', cast: 'wall', hands: 2, mana: 30, range: 24, length: 9, duration: 8, dps: 14, burn: 7,
    colors: FIRE, light: 0xff7a30, power: 14, desc: 'Raises a wall of fire nine paces long where you look, for eight seconds. The dead that cross it go up in flames.' },
  missiles: { name: 'Magic Missiles', kind: 'arcane', cast: 'swarm', channel: true, hands: 1, mana: 8, drain: 16, minHold: 0.25,
    volley: 5, every: 0.2, interval: 0.5, max: 24, dmg: 14, size: 0.12,
    colors: ['#ffffff', '#ffb0f0', '#d050ff', '#5a1a8a'], light: 0xe070ff, power: 10,
    desc: 'Hold: spinning missiles fan out and hang in the air before you, more the longer you hold (it drinks mana fast). One every half second darts off to seek one of the dead.' },
  arcaneblast: { name: 'Arcane Blast', kind: 'arcane', cast: 'cone', hands: 2, mana: 24, range: 9, angle: 0.6, dmg: 50, force: 17, size: 0.6,
    colors: ARCANE, light: 0xb070ff, power: 30, desc: 'A thunderclap of raw force from both hands: everything in a cone before you is torn at and hurled back.' },
  firebeam: { name: 'Fire Beam', kind: 'fire', cast: 'beam', channel: true, hands: 2, mana: 6, drain: 18, minHold: 0.3, range: 18, dmg: 8,
    colors: FIRE, light: 0xff7a30, power: 26, desc: 'Hold: a roaring jet of flame pours from your hands, searing and setting alight whatever it plays across.' },
  chain: { name: 'Chain Lightning', kind: 'lightning', cast: 'chain', channel: true, hands: 1, mana: 6, drain: 15, minHold: 0.3, range: 26, jumps: 5, reach: 8, dmg: 9,
    colors: ['#ffffff', '#d8d0ff', '#8a70ff', '#3a2490'], light: 0xa890ff, power: 28,
    desc: 'Hold: lightning streams from your hand, and from whatever it strikes it leaps to the nearest of the others, and on, up to five times.' },
  nova: { name: 'Frost Nova', kind: 'frost', cast: 'nova', hands: 2, mana: 32, radius: 10, freeze: 5, dmg: 12,
    colors: ICE, light: 0x8fc8ff, power: 30, desc: 'Ice bursts out from where you stand: all the dead within ten paces are frozen solid for five seconds, and take half again from every blow.' },
  meteor: { name: 'Meteor', kind: 'fire', cast: 'meteor', hands: 2, mana: 45, range: 60, fall: 1.3, radius: 5.5, dmg: 95,
    colors: FIRE, light: 0xff6a20, power: 60, desc: 'Calls a burning stone down on where you look, out of the sky (or the ceiling), leaving the ground on fire.' },
  blizzard: { name: 'Blizzard', kind: 'frost', cast: 'storm', hands: 2, mana: 38, range: 38, radius: 5, duration: 7, dmg: 6,
    colors: ICE, light: 0x8fc8ff, power: 12, desc: 'Ice shards rain on the ground you mark for seven seconds, cutting and slowing all beneath.' },
  drain: { name: 'Life Drain', kind: 'drain', cast: 'drain', channel: true, hands: 1, mana: 4, drain: 10, minHold: 0.3, range: 18, dmg: 7, heal: 0.7,
    colors: ['#ffd0d0', '#ff6070', '#c01828', '#3a0610'], light: 0xff3040, power: 14,
    desc: 'Hold: a red thread fastens on the nearest of the dead before you and pulls its stolen life into yours.' },
  blink: { name: 'Blink', kind: 'arcane', cast: 'blink', hands: 1, mana: 18, range: 14, dmg: 22,
    colors: ARCANE, light: 0xb070ff, power: 20, desc: 'Vanish and step out up to fourteen paces ahead, tearing through any of the dead in the way.' },
  lance: { name: 'Bone Lance', kind: 'bone', cast: 'bolt', land: 'stick', mesh: 'lance', hands: 1, mana: 16, speed: 48, size: 0.3, pierce: true, dmg: 55, blow: 1.1,
    colors: ['#ffffff', '#e8f0d0', '#90c8a0', '#2a5040'], light: 0xc0ffd8, power: 16, burst: 40,
    desc: 'A spear of sharpened bone that runs through every body in its line, taking limbs as it goes, and sticks quivering in the wall.' },
  well: { name: 'Gravity Well', kind: 'void', cast: 'bolt', land: 'well', mesh: 'void', hands: 2, mana: 34, speed: 13, size: 0.7, fuse: 1.4, dmg: 20, radius: 10, duration: 3.2,
    colors: ['#ffffff', '#c8a0ff', '#5a20b0', '#100020'], light: 0x9a60ff, power: 24, burst: 60,
    desc: 'A mote of darkness that hangs where it lands, dragging the dead (and the dead-again) in from ten paces round, then bursts.' },
  plague: { name: 'Plague Flask', kind: 'poison', cast: 'bolt', land: 'cloud', mesh: 'flask', hands: 1, mana: 20, speed: 17, size: 0.3, grav: 12, lift: 0.2,
    radius: 4.2, duration: 9, dps: 7, dmg: 10, colors: ['#f0ffc0', '#a8f040', '#4a9a20', '#1a3a10'], light: 0x9aff50, power: 10, burst: 40,
    desc: 'A lobbed flask that bursts in a choking green cloud: for nine seconds everything inside it rots and slows.' },
  blades: { name: 'Spirit Blades', kind: 'blade', cast: 'blades', hands: 2, mana: 35, count: 4, duration: 20, dmg: 16, radius: 1.6,
    colors: ['#ffffff', '#b0f8ff', '#40c8e0', '#106070'], light: 0x70e8ff, power: 8, desc: 'Four ghostly swords wheel round you for twenty seconds, hacking at anything that comes near.' },
  spikes: { name: 'Earthsplitter', kind: 'stone', cast: 'spikes', hands: 2, mana: 28, count: 13, step: 1.15, dmg: 45,
    colors: ['#e8dcc8', '#a89c8c', '#6f665c', '#2a2622'], light: 0xffc890, power: 6,
    desc: 'Spikes of stone burst from the ground in a line before you, impaling the dead and flinging them into the air.' },
};
// what staves shoot (left mouse button)
export const BOLTS = {
  staff: { name: 'Staff Bolt', kind: 'staff', mana: 5, speed: 30, size: 0.46, spiral: 2,
    colors: ['#ffffff', '#c0fff0', '#30c8b0', '#10504a'], light: 0x50ffd8, power: 18, burst: 50 },
};

/** A 16x16 pixel-art glow in four bands of colour: the look of Heretic's projectiles. */
export function orbTexture(colors, n = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const m = (n - 1) / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x - m, y - m) / (n / 2);
    const band = d < 0.28 ? 0 : d < 0.5 ? 1 : d < 0.74 ? 2 : d < 0.96 ? 3 : -1;
    if (band < 0) continue;
    if (band === 3 && (x + y) % 2) continue; // dithered rim
    g.fillStyle = colors[band];
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const pVert = /* glsl */`
  attribute vec3 color; attribute float size; attribute float alpha;
  uniform float scale;
  varying vec3 vC; varying float vA;
  void main() {
    vC = color; vA = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, size * scale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const pFrag = /* glsl */`
  uniform float boost;
  varying vec3 vC; varying float vA;
  void main() {
    if (vA <= 0.01) discard;
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float k = (1.0 - d) * (1.0 - d) * 1.6 + step(d, 0.35) * 0.6; // a hot core in a soft glow
    gl_FragColor = vec4(vC * vA * boost * k, 1.0);
  }`;

/** Square, additive particles: sparks, embers, motes. One draw call for all of them; bright
 * enough to bloom. Sparks with `bounce` skip off the floor they fall onto. */
export class Particles {
  constructor(scene, max = 4000) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3); this.size = new Float32Array(max);
    this.alpha = new Float32Array(max); this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.floor = new Float32Array(max).fill(-1e9);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol);
    g.setAttribute('size', this.aSize); g.setAttribute('alpha', this.aAlpha);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({ vertexShader: pVert, fragmentShader: pFrag, uniforms: { scale: { value: 300 }, boost: { value: 2.2 } },
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.geo = g;
    scene.add(this.points);
  }

  emit(p, v, color, { life = 0.6, size = 0.06, grav = 0, drag = 1.5, floor = null } = {}) {
    const i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    this.pos.set(p, i * 3); this.vel.set(v, i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.size[i] = size; this.life[i] = life; this.age[i] = 0; this.alpha[i] = 1;
    this.grav[i] = grav; this.drag[i] = drag; this.floor[i] = floor ?? -1e9;
  }

  /** A spherical burst of `n` sparks at p (thrown off a surface with normal nrm). */
  burst(p, colors, n, { speed = 5, life = 0.7, size = 0.07, grav = 6, nrm = null, drag = 1.5, floor = null } = {}) {
    for (let k = 0; k < n; k++) {
      const d = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      if (nrm && d.dot(nrm) < 0) d.addScaledVector(nrm, -2 * d.dot(nrm));
      const s = speed * (0.25 + Math.random() * 0.75);
      this.emit([p.x, p.y, p.z], [d.x * s, d.y * s, d.z * s], colors[Math.floor(Math.random() * colors.length)],
        { life: life * (0.5 + Math.random() * 0.7), size: size * (0.6 + Math.random() * 0.8), grav, drag, floor });
    }
  }

  update(dt, camera, height) {
    this.mat.uniforms.scale.value = height / 2 * camera.projectionMatrix.elements[5];
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) continue;
      const f = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= f; this.vel[i * 3 + 2] *= f;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * f - this.grav[i] * dt;
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      if (this.pos[i * 3 + 1] < this.floor[i]) { // skip off the floor
        this.pos[i * 3 + 1] = this.floor[i];
        this.vel[i * 3 + 1] = Math.abs(this.vel[i * 3 + 1]) * 0.4;
        this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6;
      }
      const k = this.age[i] / this.life[i];
      this.alpha[i] = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      if (w !== i) { // compact the live ones to the front
        for (const arr of [this.pos, this.vel, this.col]) { arr[w * 3] = arr[i * 3]; arr[w * 3 + 1] = arr[i * 3 + 1]; arr[w * 3 + 2] = arr[i * 3 + 2]; }
        for (const arr of [this.size, this.alpha, this.life, this.age, this.grav, this.drag, this.floor]) arr[w] = arr[i];
      }
      w++;
    }
    this.n = w;
    this.geo.setDrawRange(0, w);
    for (const a of [this.aPos, this.aCol, this.aSize, this.aAlpha]) a.needsUpdate = true;
  }
}

const fVert = /* glsl */`
  attribute float phase; attribute float size;
  uniform float scale; uniform float time;
  varying float vPhase;
  void main() {
    vPhase = phase;
    vec3 p = position + vec3(0.0, size * 0.25, 0.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float flick = 0.85 + 0.15 * sin(time * 17.0 + phase * 7.0) * sin(time * 5.3 + phase);
    gl_PointSize = max(2.0, size * flick * scale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
// a pixelated teardrop flame drawn inside the point sprite, flickering per flame; HDR so it blooms
const fFrag = /* glsl */`
  uniform float time;
  varying float vPhase;
  void main() {
    vec2 q = floor(gl_PointCoord * 10.0) / 10.0 + 0.05;
    q.y = 1.0 - q.y;
    float sway = 0.07 * sin(time * 9.0 + vPhase * 5.0 + q.y * 4.0) * q.y;
    float x = abs(q.x - 0.5 - sway);
    float w = 0.36 * (1.0 - q.y) * smoothstep(0.0, 0.25, q.y + 0.08) + 0.06 * (1.0 - q.y);
    float h = 0.82 + 0.12 * sin(time * 13.0 + vPhase * 3.0);
    if (x > w || q.y > h) discard;
    float k = x / max(w, 0.001) * 0.6 + q.y / h * 0.6;
    vec3 c = k < 0.45 ? vec3(1.0, 0.95, 0.7) * 3.2 : k < 0.75 ? vec3(1.0, 0.62, 0.18) * 2.4 : vec3(0.85, 0.25, 0.06) * 1.6;
    gl_FragColor = vec4(c, 1.0);
  }`;

/** Every flame in the world (torches, candles, braziers): animated sprites, one draw call. */
export class Flames {
  constructor(scene, list) {
    const n = list.length;
    const pos = new Float32Array(n * 3), phase = new Float32Array(n), size = new Float32Array(n);
    list.forEach((p, i) => { pos.set(p.slice(0, 3), i * 3); phase[i] = Math.random() * 10; size[i] = p[3] || 0.32; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    this.mat = new THREE.ShaderMaterial({ vertexShader: fVert, fragmentShader: fFrag,
      uniforms: { scale: { value: 300 }, time: { value: 0 } } });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(t, camera, height) {
    this.mat.uniforms.time.value = t;
    this.mat.uniforms.scale.value = height / 2 * camera.projectionMatrix.elements[5];
  }
}

let glowTex = null;
/** A soft round glow (for halos close to the eye, where pixel art would turn to blocks). */
function softGlow() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,220,160,0.7)'); gr.addColorStop(0.6, 'rgba(255,140,60,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

const rnd = () => new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);

/** Projectiles, bursts, the wisp and self-spells. Every spell is a light: the pool's first
 * lights cast shadows, so a firebolt throws moving shadows down a corridor. */
export class Magic {
  constructor(scene, physics, sfx, { shadows = true, smoke = null } = {}) {
    this.scene = scene;
    this.physics = physics;
    this.sfx = sfx;
    this.smoke = smoke;
    this.particles = new Particles(scene, 6000);
    this.decals = new Decals(scene);
    this.waves = new Waves(scene);
    this.arcs = new Arcs(scene, 96);
    this.flying = [];
    this.burning = [];   // fires left where firebolts land
    this.flashes = [];   // big short-lived sprites (fireballs, lightning flashes)
    this.tex = new Map();
    this.lights = [];
    for (let i = 0; i < 6; i++) { // a fixed pool, so shaders never recompile
      const l = new THREE.PointLight(0xffffff, 0, 16, 1.25);
      if (shadows && i < 2) {
        l.castShadow = true;
        l.shadow.mapSize.set(512, 512);
        l.shadow.bias = -0.004; l.shadow.normalBias = 0.03;
        l.shadow.camera.near = 0.1; l.shadow.camera.far = 18;
      }
      scene.add(l);
      this.lights.push({ light: l, owner: null, flash: 0, peak: 0, color: new THREE.Color() });
    }
    this.wisp = null;
    this.healing = null;
    this.vmFlash = { color: new THREE.Color(), amount: 0 };
    this.screen = { color: new THREE.Color(), amount: 0 }; // a full-screen flash for big bursts
    this.shake = 0;
    this.arcana = new Arcana(this, Flames);
  }

  texture(def) {
    const k = def.colors.join();
    if (!this.tex.has(k)) this.tex.set(k, orbTexture(def.colors));
    return this.tex.get(k);
  }

  sprite(def, size, k = 3) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture(def), blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, fog: false, color: new THREE.Color(k, k, k) }));
    sp.scale.setScalar(size);
    sp.renderOrder = 6;
    this.scene.add(sp);
    return sp;
  }

  /** A light from the pool: shadow casters first for the owners that want them. */
  grabLight(owner, shadow = false) {
    const free = (l) => !l.owner && l.flash <= 0;
    const order = shadow ? this.lights : [...this.lights].reverse();
    const l = order.find(free) || order.find((x) => !x.owner) || order[0];
    l.owner = owner; l.flash = 0;
    return l;
  }

  release(l, flash = 0, at = null) {
    if (!l) return;
    l.owner = null;
    if (flash > 0) { l.flash = flash; l.peak = flash; if (at) l.light.position.copy(at); }
    else l.light.intensity = 0;
  }

  /** A short bright light where something burst. */
  flashAt(p, color, power, shadow = false) {
    const l = this.grabLight(null, shadow);
    l.owner = null;
    l.light.position.copy(p);
    l.light.color.set(color);
    l.flash = l.peak = power;
  }

  /** Sparks drawn in toward a hand while a spell gathers (called every frame of the wind-up). */
  charge(p, def, dt) {
    const cols = def.colors.slice(0, 3).map((c) => new THREE.Color(c));
    for (let i = 0; i < 3; i++) if (Math.random() < dt * 60) {
      const o = rnd().normalize().multiplyScalar(0.25 + Math.random() * 0.2);
      this.particles.emit([p.x + o.x, p.y + o.y, p.z + o.z], [-o.x * 3, -o.y * 3, -o.z * 3], cols[i], { life: 0.12, size: 0.018, drag: 0 });
    }
  }

  /** A charging spell's orb, growing in the hand (k: 0..1), and the light it throws. */
  chargeBall(p, def, k, dt) {
    if (!this.chargeOrb) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlow(), blending: THREE.AdditiveBlending, depthWrite: false,
        transparent: true, fog: false, color: new THREE.Color(def.light).multiplyScalar(1.6) }));
      halo.renderOrder = 6; this.scene.add(halo);
      this.chargeOrb = { core: this.sprite(def, 0.05, 3.4), halo, light: this.grabLight('charge', true), t: 0 };
      this.chargeOrb.light.light.color.set(def.light);
    }
    const o = this.chargeOrb, pulse = 1 + 0.12 * Math.sin((o.t += dt) * 30);
    o.core.position.copy(p); o.halo.position.copy(p);
    // it sits a hand's length from the eye, so it stays small: a fist-sized ball at full charge
    o.core.scale.setScalar(def.size * (0.08 + 0.22 * k) * pulse);
    o.halo.scale.setScalar(def.size * (0.25 + 0.6 * k) * pulse);
    o.halo.material.opacity = 0.5 + 0.5 * k;
    o.core.material.rotation += dt * 8; o.halo.material.rotation -= dt * 3;
    o.light.light.position.copy(p);
    o.light.light.intensity = def.power * (0.2 + 0.8 * k) * (0.85 + 0.15 * Math.random());
    o.light.light.distance = 6 + 8 * k;
    this.vmFlash.color.set(def.light); this.vmFlash.amount = Math.max(this.vmFlash.amount, 0.6 + 1.6 * k);
    const cols = def.colors.slice(0, 3).map((c) => new THREE.Color(c));
    for (let i = 0; i < 4; i++) if (Math.random() < dt * (40 + 120 * k)) { // flames and sparks swirling in
      const r = 0.06 + Math.random() * (0.08 + 0.12 * k), a = Math.random() * 6.28, q = p.clone().add(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.3) * r, Math.sin(a) * r));
      this.particles.emit([q.x, q.y, q.z], [(p.x - q.x) * 5 - Math.sin(a) * 0.8, (p.y - q.y) * 5 + 0.3, (p.z - q.z) * 5 + Math.cos(a) * 0.8], cols[i % 3], { life: 0.16, size: 0.012 + 0.016 * k, drag: 0 });
    }
    if (Math.random() < dt * 10 * k) this.smoke?.emit(p.clone(), new THREE.Vector3(0, 0.7, 0), { life: 1.0, size: 0.12, grow: 0.4, alpha: 0.18, shade: 0.12 });
  }

  endCharge() {
    if (!this.chargeOrb) return;
    for (const s of [this.chargeOrb.core, this.chargeOrb.halo]) { this.scene.remove(s); s.material.dispose(); }
    this.release(this.chargeOrb.light);
    this.chargeOrb = null;
  }

<<<<<<< HEAD
  /** A spell leaving the hand: a projectile, a spell on yourself, or one of arcana.js's. */
  cast(def, origin, dir, player, camera) {
    if (def.self) this.selfCast(def, player, camera);
    else if (def.cast && def.cast !== 'bolt') this.arcana.cast(def, origin, dir, player, camera);
    else this.launch(def, origin, dir);
  }

=======
>>>>>>> origin/main
  /** Launch a projectile spell (or staff bolt) from origin along dir. */
  launch(def, origin, dir) {
    const shots = def.shards || 1;
    if (def.lift) dir = dir.clone().add(new THREE.Vector3(0, def.lift, 0)).normalize();   // lobbed
    for (let s = 0; s < shots; s++) {
      const d = dir.clone();
      if (shots > 1) {
        const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
        d.addScaledVector(side, (s - (shots - 1) / 2) * def.spread).addScaledVector(rnd(), 0.01).normalize();
      }
      const shot = { def, pos: origin.clone(), vel: d.clone().multiplyScalar(def.speed * (shots > 1 ? 0.92 + Math.random() * 0.16 : 1)),
        age: 0, trail: 0, phase: Math.random() * 6, pierced: def.pierce ? new Set() : null };
      shot.core = this.sprite(def, def.size, 3.2);
      shot.halo = this.sprite(def, def.size * 2.6, 0.7);
      if (def.kind === 'frost') { // a real crystal, pointing where it flies
        shot.mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0),
          new THREE.MeshBasicMaterial({ color: hdr('#d8f4ff', 2.2) }));
        shot.mesh.scale.set(1, 1, 4.2);
        this.scene.add(shot.mesh);
      } else if (def.mesh) shot.mesh = this.arcana.shotMesh(def);
      if (s === Math.floor(shots / 2)) {
        shot.light = this.grabLight(shot, true);
        shot.light.light.color.set(def.light);
      }
      this.flying.push(shot);
    }
    this.vmFlash.color.set(def.light); this.vmFlash.amount = 1.8;
  }

  /** Spells cast on yourself. */
  selfCast(def, player, camera) {
    this.vmFlash.color.set(def.light); this.vmFlash.amount = 2.6;
    const feet = player.pos.clone();
    if (def.self === 'heal') {
      player.health = Math.min(player.maxHealth, player.health + def.amount);
      this.decals.add('rune', feet.clone().setY(feet.y + 0.01), new THREE.Vector3(0, 1, 0), 3.2, { life: 3, glow: true, spin: 0.8 });
      this.waves.add(feet.clone().setY(feet.y + 0.05), new THREE.Vector3(0, 1, 0), def.light, { size: 3.4, life: 0.8 });
      this.healing = { t: 0, def, light: this.grabLight('heal', true) };
      this.healing.light.light.color.set(def.light);
      this.screen.color.set(def.light); this.screen.amount = 0.35;
    } else if (def.self === 'wisp') {
      if (!this.wisp) {
        const core = this.sprite(def, 0.22, 3.5), halo = this.sprite(def, 0.8, 0.6);
        core.position.copy(camera.position); halo.position.copy(camera.position);
        this.wisp = { core, halo, light: this.grabLight('wisp', true), t: 0, def, pos: camera.position.clone() };
        this.wisp.light.light.color.set(def.light);
      }
      this.wisp.t = def.duration;
      this.waves.add(this.wisp.pos, null, def.light, { size: 1.6, life: 0.5, sphere: true });
    }
  }

  impact(s, at, n, flesh = false) {
    const def = s.def, cols = def.colors.slice(0, 3).map((c) => new THREE.Color(c));
    const nrm = n || new THREE.Vector3(0, 1, 0);
    const floorY = nrm.y > 0.7 ? at.y : null;
    const big = def.kind === 'lightning';
    this.particles.burst(at, cols, def.burst, { speed: 3 + def.size * 9, nrm: n, size: 0.04 + def.size * 0.06, grav: def.kind === 'frost' ? 9 : 5, floor: floorY, life: big ? 1.1 : 0.8 });
    this.waves.add(at, nrm, def.light, { size: 1 + def.size * 4, life: 0.35 + def.size * 0.3 });
    const fb = this.sprite(def, def.size, 4);
    fb.position.copy(at);
    this.flashes.push({ s: fb, age: 0, life: 0.25 + def.size * 0.35, to: 1 + def.size * 5 });
    if (s.light) { this.release(s.light, 1.6, at); s.light = null; }
    else this.flashAt(at, def.light, 1.2);
    if (def.land) { // a lance sticks, a well opens, a flask breaks
      this.arcana.landed(s, at, n, flesh);
    } else if (flesh) { // no scorch marks or fires left hanging in the air
    } else if (def.kind === 'fire') {
      this.decals.add('scorch', at, nrm, 1.6 + Math.random() * 0.6, { life: 40 });
      for (let i = 0; i < 10; i++) this.smoke?.emit(at.clone().addScaledVector(rnd(), 0.3), new THREE.Vector3(0, 0.8 + Math.random(), 0).addScaledVector(nrm, 0.6),
        { life: 2.5 + Math.random() * 2, size: 0.4, grow: 0.7, alpha: 0.35, shade: 0.1 });
      this.burning.push({ p: at.clone().addScaledVector(nrm, 0.05), nrm, t: 3.5, light: this.grabLight('fire'), acc: 0 });
      this.burning.at(-1).light.light.color.set(def.light);
    } else if (def.kind === 'frost') {
      this.decals.add('frost', at, nrm, 1.1 + Math.random() * 0.4, { life: 30 });
      for (let i = 0; i < 4; i++) this.smoke?.emit(at.clone(), rnd().multiplyScalar(0.5).addScaledVector(nrm, 0.5), { life: 1.6, size: 0.4, grow: 0.6, alpha: 0.3, shade: 1.4 });
    } else if (big) {
      this.decals.add('scorch', at, nrm, 2.6, { life: 40 });
      this.waves.add(at, null, def.light, { size: 5, life: 0.6, sphere: true });
      for (let i = 0; i < 14; i++) { // the storm lashes out at everything near
        const d = rnd().normalize();
        const hit = this.physics.ray([at.x, at.y, at.z], [d.x, d.y, d.z], 7);
        const end = at.clone().addScaledVector(d, hit ? hit.t : 2 + Math.random() * 3);
        this.arcs.add(at, end, 0.18 + Math.random() * 0.2, 0.22);
        if (hit) this.particles.burst(end, cols, 8, { speed: 3, size: 0.04, grav: 8 });
      }
      this.screen.color.set(def.light); this.screen.amount = 0.6;
      this.shake = Math.max(this.shake, 1.2);
    } else {
      this.decals.add('frost', at, nrm, 0.5, { life: 6 });
    }
    this.sfx?.boom(def.size, at);
    this.onBlast?.(def, at);
  }

  update(dt, camera, height, player) {
    const live = [];
    for (const s of this.flying) {
      s.age += dt;
      if (s.def.grav) s.vel.y -= s.def.grav * dt;
      const p = s.pos;
      const speed = s.vel.length(), step = speed * dt;
      const d = s.vel.clone().divideScalar(speed);
      const hit = this.physics.ray([p.x, p.y, p.z], [d.x, d.y, d.z], step);
      const cols = s.def.colors.slice(0, 3).map((c) => new THREE.Color(c));
      if (s.pierced) { // it runs through every body in its way
        const through = (this.hitAll?.(p, d, step) || []).filter((h) => !s.pierced.has(h.z) && (!hit || h.t < hit.t)).sort((a, b) => a.t - b.t);
        for (const h of through) {
          s.pierced.add(h.z);
          this.onHit?.(s.def, h.point.clone(), d.clone(), h);
          this.particles.burst(h.point, cols, 16, { speed: 4, size: 0.05, grav: 9 });
        }
      }
      const flesh = !s.pierced && this.hitTest?.(p, d, step);   // something alive (or undead) in the way
      if (flesh && (!hit || flesh.t < hit.t)) {
        p.addScaledVector(d, flesh.t);
        this.onHit?.(s.def, p.clone(), d.clone(), flesh);
        this.impact(s, p.clone(), null, true);
        for (const o of [s.core, s.halo]) { this.scene.remove(o); o.material.dispose(); }
        if (s.mesh) { this.scene.remove(s.mesh); s.mesh.geometry.dispose(); }
        continue;
      }
      if (hit || s.age > (s.def.fuse || 5)) {
        if (hit) p.addScaledVector(d, hit.t);
        const n = hit ? new THREE.Vector3(...hit.normal) : null;
        this.impact(s, n ? p.clone().addScaledVector(n, 0.06) : p.clone(), n);
        for (const o of [s.core, s.halo]) { this.scene.remove(o); o.material.dispose(); }
        if (s.mesh) { this.scene.remove(s.mesh); s.mesh.geometry.dispose(); }
        continue;
      }
      p.addScaledVector(s.vel, dt);
      // the visible orb wobbles about the true path; spirals for staff bolts
      const side = new THREE.Vector3(-d.z, 0, d.x).normalize(), up = side.clone().cross(d);
      const vis = p.clone();
      if (s.def.spiral) {
        const r = 0.06 * s.def.spiral, a = s.age * 22 + s.phase;
        vis.addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r);
        if (s.def.spiral > 1) { // a second strand
          const q = p.clone().addScaledVector(side, -Math.cos(a) * r).addScaledVector(up, -Math.sin(a) * r);
          this.particles.emit([q.x, q.y, q.z], [0, 0, 0], cols[1], { life: 0.35, size: 0.05 });
        }
      }
      s.core.position.copy(vis); s.halo.position.copy(vis);
      s.core.material.rotation += dt * 9; s.halo.material.rotation -= dt * 4;
      const pulse = 1 + 0.15 * Math.sin(s.age * 40 + s.phase);
      s.core.scale.setScalar(s.def.size * pulse);
      if (s.mesh) { s.mesh.position.copy(vis); s.mesh.lookAt(vis.clone().add(d)); s.mesh.rotateZ(s.age * 12); }
      // trails
      s.trail += dt;
      const every = s.def.kind === 'lightning' ? 0.01 : 0.006;
      while (s.trail > every) {
        s.trail -= every;
        const j = rnd().multiplyScalar(s.def.size * 0.3);
        const back = vis.clone().addScaledVector(d, -Math.random() * step).add(j);
        this.particles.emit([back.x, back.y, back.z], [j.x * 2, j.y * 2 + 0.4, j.z * 2], cols[1 + Math.floor(Math.random() * 2)],
          { life: 0.3 + Math.random() * 0.35, size: Math.min(0.12, s.def.size * 0.3), grav: s.def.kind === 'frost' ? 2 : -0.8 });
      }
      if (s.def.kind === 'fire' && Math.random() < dt * 18) this.smoke?.emit(vis.clone().addScaledVector(d, -0.3), new THREE.Vector3(0, 0.5, 0), { life: 1.2, size: 0.18, grow: 0.45, alpha: 0.22, shade: 0.12 });
      if (s.def.kind === 'lightning') { // arcs crawl over the ball and lash the walls nearby
        if (Math.random() < dt * 40) this.arcs.add(vis, vis.clone().addScaledVector(rnd().normalize(), s.def.size * 0.8), 0.06, 0.35);
        if (Math.random() < dt * 9) {
          const r = rnd().normalize();
          const h = this.physics.ray([vis.x, vis.y, vis.z], [r.x, r.y, r.z], 5);
          if (h) {
            const end = vis.clone().addScaledVector(r, h.t);
            this.arcs.add(vis, end, 0.1, 0.22);
            this.particles.burst(end, cols, 10, { speed: 2.5, size: 0.035, grav: 8 });
            this.sfx?.zap?.();
          }
        }
      }
      if (s.light) {
        s.light.light.position.copy(vis);
        const flick = s.def.kind === 'lightning' ? 0.6 + Math.random() * 0.8 : 0.9 + 0.1 * Math.sin(s.age * 50);
        s.light.light.intensity = s.def.power * flick;
        s.light.light.distance = 10 + s.def.size * 12;
      }
      live.push(s);
    }
    this.flying = live;

    // fires burning where firebolts landed
    this.burning = this.burning.filter((f) => {
      f.t -= dt;
      const k = Math.min(1, f.t / 1.5);
      f.acc += dt * 40 * k;
      while (f.acc > 1) {
        f.acc -= 1;
        const o = rnd().multiplyScalar(0.35); o.y = Math.abs(o.y) * 0.2;
        const c = new THREE.Color(['#fff6c0', '#ffb040', '#e0501c'][Math.floor(Math.random() * 3)]);
        this.particles.emit([f.p.x + o.x, f.p.y + o.y, f.p.z + o.z], [o.x * 0.5 + f.nrm.x, 1.2 + Math.random() + f.nrm.y * 0.3, o.z * 0.5 + f.nrm.z], c,
          { life: 0.3 + Math.random() * 0.3, size: 0.07, grav: -1, drag: 2 });
      }
      if (Math.random() < dt * 6 * k) this.smoke?.emit(f.p.clone(), new THREE.Vector3(0.1, 1, 0), { life: 3, size: 0.35, grow: 0.6, alpha: 0.22, shade: 0.1 });
      f.light.light.position.copy(f.p).addScaledVector(f.nrm, 0.4);
      f.light.light.intensity = 10 * k * (0.75 + 0.25 * Math.sin(f.t * 23) * Math.sin(f.t * 7));
      f.light.light.distance = 8;
      if (f.t <= 0) { this.release(f.light); return false; }
      return true;
    });

    // the healing column
    if (this.healing) {
      const h = this.healing;
      h.t += dt;
      const k = 1 - h.t / 2.2;
      const cols = h.def.colors.slice(0, 3).map((c) => new THREE.Color(c));
      for (let i = 0; i < 6; i++) {
        const a = h.t * 6 + i * 1.047, r = 0.9 - h.t * 0.25;
        this.particles.emit([player.pos.x + Math.cos(a) * r, player.pos.y + h.t * 1.1 + Math.random() * 0.2, player.pos.z + Math.sin(a) * r],
          [-Math.sin(a) * 0.8, 0.9, Math.cos(a) * 0.8], cols[i % 3], { life: 0.9, size: 0.05, drag: 0.6 });
      }
      h.light.light.position.set(player.pos.x, player.pos.y + 0.4 + h.t * 0.8, player.pos.z);
      h.light.light.intensity = h.def.power * Math.max(0, k) * (0.8 + 0.2 * Math.sin(h.t * 20));
      h.light.light.distance = 9;
      if (k <= 0) { this.release(h.light); this.healing = null; }
    }

    // the wisp: drifts after you, a little ahead and to the right, bobbing
    if (this.wisp) {
      const w = this.wisp;
      w.t -= dt;
      const tgt = camera.position.clone()
        .add(new THREE.Vector3(-Math.sin(player.yaw) * 0.9 + Math.cos(player.yaw) * 0.75, 0.5, -Math.cos(player.yaw) * 0.9 - Math.sin(player.yaw) * 0.75));
      tgt.y += Math.sin(performance.now() / 420) * 0.1;
      w.pos.lerp(tgt, Math.min(1, dt * 3));
      w.core.position.copy(w.pos); w.halo.position.copy(w.pos);
      const fade = Math.min(1, w.t / 3);
      const pulse = 0.9 + 0.1 * Math.sin(performance.now() / 160);
      w.halo.scale.setScalar(0.8 * pulse);
      w.halo.material.opacity = fade; w.core.material.opacity = fade;
      w.light.light.position.copy(w.pos);
      w.light.light.intensity = w.def.power * fade * pulse;
      w.light.light.distance = 24;
      if (Math.random() < dt * 30) { // motes orbiting it
        const a = Math.random() * Math.PI * 2, r = 0.25;
        const c = new THREE.Color(w.def.colors[1 + Math.floor(Math.random() * 2)]);
        this.particles.emit([w.pos.x + Math.cos(a) * r, w.pos.y + (Math.random() - 0.5) * 0.2, w.pos.z + Math.sin(a) * r],
          [-Math.sin(a) * 0.8, -0.1, Math.cos(a) * 0.8], c, { life: 0.7, size: 0.025, drag: 0.4 });
      }
      if (w.t <= 0) {
        for (const o of [w.core, w.halo]) { this.scene.remove(o); o.material.dispose(); }
        this.release(w.light);
        this.wisp = null;
      }
    }

    // fireball and flash sprites
    this.flashes = this.flashes.filter((f) => {
      f.age += dt;
      const k = f.age / f.life;
      f.s.scale.setScalar(0.3 + f.to * Math.sqrt(k));
      f.s.material.opacity = 1 - k;
      f.s.material.rotation += dt * 3;
      if (k >= 1) { this.scene.remove(f.s); f.s.material.dispose(); return false; }
      return true;
    });

    for (const l of this.lights) {
      if (l.owner) continue;
      if (l.flash > 0) { l.light.intensity = 36 * l.flash; l.light.distance = 14; l.flash -= dt * 3.5; }
      else l.light.intensity = 0;
    }
    this.arcana.update(dt, camera, height, player);
    this.vmFlash.amount = Math.max(0, this.vmFlash.amount - dt * 5);
    this.screen.amount = Math.max(0, this.screen.amount - dt * 2.5);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.particles.update(dt, camera, height);
    this.decals.update(dt);
    this.waves.update(dt);
    this.arcs.update(dt);
  }

  /** The lights the billboards should be lit by. */
  activeLights() { return this.lights.map((l) => l.light).filter((l) => l.intensity > 0); }
}
