// Bellmourn: the village, the cathedral, the graveyard and the dungeon under it, walked in
// first person with the approved arm rigs. One of each weapon type in the bag, spells on F
// and R. Mouse and keyboard on desktop; a thumb stick and buttons in landscape on phones.
//
// Rendering: Phong surfaces with GPU-made normal maps, a sun (or moon) whose shadow map
// follows you, the nearest torches casting their own shadows, spells as moving shadow-casting
// lights, bloom, tone mapping and a light grade. The dungeon has no ambient light at all:
// only the torches on its walls (and whatever you cast) light it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Physics } from './physics.js';
import { Library } from './lib.js';
import { Builder } from './geo.js';
import { Billboards } from './sprites.js';
import { Props } from './props.js';
import { buildWorld, WORLD_R, VILLAGE_R, GRAVEYARD } from './world.js';
import { buildDungeon } from './dungeon.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { ViewModel, ITEMS } from './viewmodel.js';
import { SPELLS, BOLTS, Magic, Flames } from './spells.js';
import { Sky, Shafts, Mist, Smoke, dayState } from './effects.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';

const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const QUALITY = localStorage.getItem('bm.quality') || (touch ? 'low' : 'high');
const HI = QUALITY === 'high';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = HI;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// the world camera: the rigs' 90 degree horizontal view at 16:10 (64 degrees vertical), which
// stays the vertical view at any aspect ratio
const camera = new THREE.PerspectiveCamera(64, 1.6, 0.05, 1200);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa9b7c4, 40, 280);
scene.background = new THREE.Color(0x000000);
const BLACK = new THREE.Color(0x000000);

const hemi = new THREE.HemisphereLight(0xc8d8ff, 0x3a3026, 1.0);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
scene.add(hemi, sun, sun.target);
if (HI) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const c = sun.shadow.camera;
  c.left = c.bottom = -72; c.right = c.top = 72; c.near = 1; c.far = 600;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
}
const TORCHES = HI ? 16 : 8, TORCH_SHADOWS = HI ? 4 : 0;
const torchPool = [];
for (let i = 0; i < TORCHES; i++) {
  const l = new THREE.PointLight(0xff9a48, 0, 16, 1.25);
  if (i < TORCH_SHADOWS) {
    l.castShadow = true;
    l.shadow.mapSize.set(512, 512);
    l.shadow.autoUpdate = false; // torches don't move: re-render only when it moves to another
    l.shadow.bias = -0.003; l.shadow.normalBias = 0.04;
    l.shadow.camera.near = 0.15; l.shadow.camera.far = 17;
  }
  l.userData.flame = null;
  scene.add(l);
  torchPool.push(l);
}

const sfx = new Sfx();
let ready = false;
let hud, vm, player, magic, flames, skyDome, shafts, mist, smoke, physics, ctx, bill, gameInput, lib;
const book = { F: 'firebolt', R: 'mend' };
const pending = { R: null, L: null };
let pix = Number(localStorage.getItem('bm.pix') || (HI ? 2 : 2));
let timeMode = localStorage.getItem('bm.time') || 'cycle';
let hour = { golden: 17.6, noon: 12, night: 23, cycle: 16.8 }[timeMode] ?? 16.8;
let started = false, paused = false;
let W = 2, H = 2;
let shake = 0, flameList = [], lightTimer = 0;

// ------------------------------------------------------------------ post-processing
const composer = new EffectComposer(renderer);
composer.setPixelRatio(1);
const worldPass = new RenderPass(scene, camera);
const vmPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
vmPass.clear = false; vmPass.clearDepth = true;
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 0.92);
const GRADE = {
  uniforms: { tDiffuse: { value: null }, flash: { value: new THREE.Color() }, flashAmt: { value: 0 },
    hurt: { value: 0 }, dither: { value: HI ? 1 : 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec3 flash; uniform float flashAmt, hurt, dither;
    varying vec2 vUv;
    float bayer(vec2 p) {
      vec2 q = mod(floor(p), 4.0);
      int i = int(q.x + q.y * 4.0);
      float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
      return m[i] / 16.0;
    }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c += flash * flashAmt * (0.6 + 0.4 * c);
      float d = distance(vUv, vec2(0.5));
      c *= mix(1.0, smoothstep(0.95, 0.3, d), 0.55);                 // vignette
      c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))) * vec3(1.2, 0.5, 0.45), hurt * smoothstep(0.2, 0.7, d));
      // 32/64-bit era colour: a fine ordered dither down to 6 bits a channel
      if (dither > 0.5) c = floor(c * 63.0 + bayer(gl_FragCoord.xy)) / 63.0;
      gl_FragColor = vec4(c, 1.0);
    }`,
};
const grade = new ShaderPass(GRADE);
composer.addPass(worldPass);
composer.addPass(vmPass);
if (HI || QUALITY === 'low') composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.addPass(grade);

function resize() {
  W = Math.max(2, Math.floor(innerWidth / pix));
  H = Math.max(2, Math.floor(innerHeight / pix));
  renderer.setSize(W, H, false);
  composer.setSize(W, H);
  bloom.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  vm?.resize(W / H);
  hud?.rotate.classList.toggle('show', touch && innerHeight > innerWidth);
}
addEventListener('resize', resize);

// ------------------------------------------------------------------ build everything
async function build() {
  physics = new Physics();
  lib = await new Library(renderer, { normals: HI }).load();
  const b = new Builder(physics);
  bill = new Billboards(lib, scene);
  bill.shadows = HI;
  const props = new Props(scene, physics, lib);
  ctx = { lib, b, props, bill, scene, physics, flames: [], windows: [], chimneys: [] };
  buildWorld(ctx);
  ctx.dungeon = buildDungeon(ctx, ctx.stairBottom);
  b.finish(scene);
  bill.finish();
  await props.finish();
  flameList = [...props.lights, ...ctx.flames];
  flames = new Flames(scene, flameList);
  skyDome = new Sky(scene);
  shafts = new Shafts(scene, ctx.windows);
  mist = new Mist(scene, [GRAVEYARD.x0 - 4, GRAVEYARD.z0 - 4, GRAVEYARD.x1 + 4, GRAVEYARD.z1 + 4]);
  smoke = new Smoke(scene);
  for (const [x, y, z] of ctx.chimneys) smoke.addEmitter(x, y, z, 2.5);

  const manifest = await (await fetch('templates/models/manifest.json')).json();
  vm = new ViewModel(manifest, lib);
  vm.equip = { R: 'onehand', L: 'shield_round' };
  await vm.load('wayfarer');
  vmPass.scene = vm.scene; vmPass.camera = vm.camera;
  const icons = await renderIcons();
  player = new Player(physics, camera, { r: WORLD_R - 4 });
  magic = new Magic(scene, physics, sfx, { shadows: HI, smoke });

  hud.setIcons(icons);
  hud.o.gauntlets = manifest.arms.map((a) => ({ id: a.id, name: a.name.replace(/^bare arm$/, 'Bare hands') }));
  hud.refresh(vm.equip, book, vm.gauntlet);
  vm.on(onEvent);
  resize();
  const used = lib.used.size, all = lib.surf.size;
  console.info(`textures: ${used}/${all} surfaces, ${lib.usedSprites.size}/${lib.spr.size} sprites in use`);
  ready = true;
}

/** Small pictures of the six arms for the inventory, rendered from their models. */
async function renderIcons() {
  const out = {};
  const S = 96;
  const rt = new THREE.WebGLRenderTarget(S, S);
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xfff0dd, 0x403848, 2.2));
  const dl = new THREE.DirectionalLight(0xffe8c8, 3); dl.position.set(-1, 2, 3); sc.add(dl);
  const buf = new Uint8Array(S * S * 4);
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const tm = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  for (const kind of Object.keys(ITEMS)) {
    const obj = await vm.itemScene(kind);
    const holder = new THREE.Group();
    holder.add(obj);
    sc.add(holder);
    let box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const thin = ['x', 'y', 'z'].reduce((a, k) => (size[k] < size[a] ? k : a), 'x');
    const long = size.y > 2.2 * Math.max(size.x, size.z);
    if (long) holder.rotation.z = -Math.PI / 4; // blades and staves lie corner to corner
    box = new THREE.Box3().setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const r = Math.max(sz.x, sz.y, sz.z) * 0.56;
    const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.01, 20);
    const dir = long ? new THREE.Vector3(0.25, 0.15, 1) : new THREE.Vector3(thin === 'x' ? 1 : 0.2, 0.2, thin === 'z' ? 1 : 0.3);
    cam.position.copy(c).addScaledVector(dir.normalize(), 5);
    cam.lookAt(c);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(sc, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf);
    renderer.setRenderTarget(null);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) img.data.set(buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    g.clearRect(0, 0, S, S);
    g.putImageData(img, 0, 0);
    out[kind] = cv.toDataURL();
    sc.remove(holder);
  }
  renderer.toneMapping = tm;
  rt.dispose();
  return out;
}

// ------------------------------------------------------------------ equipment and spells
let equipping = Promise.resolve();
function equip(kind, side) {
  equipping = equipping.then(async () => {
    const e = vm.equip, it = ITEMS[kind];
    if (!it || !it.hands.includes(side)) return;
    const wasIn = e.R === kind || e.L === kind;
    if (it.both) {
      if (e.R === kind) e.R = null; else { e.R = kind; e.L = null; }
    } else if (e[side] === kind) {
      e[side] = null;
    } else {
      for (const s of ['R', 'L']) if (e[s] === kind) e[s] = null; // only one of each
      if (side === 'L' && e.R && ITEMS[e.R].both) e.R = null;
      e[side] = kind;
    }
    vm.blocking = false;
    pending.R = pending.L = null;
    await vm.applyEquip();
    sfx.equip();
    const now = e.R === kind || e.L === kind;
    hud.toast(now ? `${it.name} — ${it.both ? 'both hands' : side === 'R' ? 'right hand' : 'left hand'}` : wasIn ? `${it.name} put away` : '');
    hud.refresh(e, book, vm.gauntlet);
  });
}

function assign(id, slot) {
  const other = slot === 'F' ? 'R' : 'F';
  if (book[other] === id) book[other] = book[slot];
  book[slot] = id;
  localStorage.setItem('bm.book', JSON.stringify(book));
  hud.refresh(vm.equip, book, vm.gauntlet);
}

function gauntlet(id) {
  equipping = equipping.then(async () => {
    await vm.load(id);
    sfx.equip();
    hud.refresh(vm.equip, book, vm.gauntlet);
  });
}

function castSlot(slot) {
  const def = SPELLS[book[slot]];
  if (!def || vm.busy('R') || vm.busy('L') || vm.blocking) return;
  if (player.mana < def.mana) { noMana(); return; }
  const side = vm.cast(def);
  if (!side) return;
  player.mana -= def.mana;
  pending[side === 'both' ? 'R' : side] = { def, both: side === 'both', id: book[slot], side };
}

function noMana() { hud.flashMana(); hud.toast('Not enough mana'); sfx.fizzle(); }

/** Where a point in the view model's camera space appears in the world, 0.8 m out. */
const _v = new THREE.Vector3();
function fromView(p, out = 0.8) {
  const ndc = p.clone().applyMatrix4(vm.camera.projectionMatrix);
  const d = _v.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
  const o = camera.position;
  const hit = physics.ray([o.x, o.y, o.z], [d.x, d.y, d.z], out);
  return o.clone().addScaledVector(d, hit ? Math.max(0.05, hit.t - 0.05) : out);
}

function castFrom(p) {
  return p.both ? vm.castPoint('R').add(vm.castPoint('L')).multiplyScalar(0.5) : vm.castPoint(p.side);
}

function aimPoint() {
  const d = camera.getWorldDirection(new THREE.Vector3());
  const o = camera.position;
  const hit = physics.ray([o.x, o.y, o.z], [d.x, d.y, d.z], 400);
  return o.clone().addScaledVector(d, hit ? hit.t : 400);
}

const KIND_SOUND = { fire: 'fire', frost: 'frost', lightning: 'lightning', heal: 'heal', wisp: 'wisp', arcane: 'wand', staff: 'staff' };
function onEvent(kind, side, clip) {
  if (kind === 'fire') {
    const p = pending[side];
    if (!p) return;
    pending[side] = null;
    sfx.cast(KIND_SOUND[p.def.kind]);
    if (p.def.self) { magic.selfCast(p.def, player, camera); if (p.def.self === 'heal') hud.toast('Your wounds close'); return; }
    const from = fromView(castFrom(p));
    const dir = aimPoint().sub(from).normalize();
    magic.launch(p.def, from, dir);
  } else if (kind === 'hit' && /swing/.test(clip) && !(clip.startsWith('r2h') && side === 'L')) {
    melee(clip.startsWith('r2h') ? 3.0 : 2.4, clip.startsWith('r2h'));
  }
}

/** A swing landing: the nearest thing in reach across the blade's arc gets sparks or chips. */
function melee(reach, heavy) {
  const o = camera.position;
  let best = null;
  for (const a of [-0.35, -0.15, 0, 0.15, 0.35]) {
    const d = new THREE.Vector3(0, -0.05, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), a)
      .applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ')).normalize();
    const hit = physics.ray([o.x, o.y, o.z], [d.x, d.y, d.z], reach);
    if (hit && (!best || hit.t < best.t)) best = { ...hit, d };
  }
  if (!best) return;
  const p = o.clone().addScaledVector(best.d, best.t);
  const n = new THREE.Vector3(...best.normal);
  const tag = best.box ? best.box.tag : 'ground';
  const wood = tag === 'tree' || tag === 'prop';
  const cols = tag === 'ground' ? ['#6a5a40', '#8a7858', '#4a3c2a'] : wood ? ['#8a6a40', '#5a4028', '#b08850'] : ['#fff0b0', '#ffb040', '#d0d0d0'];
  magic.particles.burst(p.addScaledVector(n, 0.04), cols.map((c) => new THREE.Color(c)), heavy ? 30 : 18,
    { speed: wood || tag === 'ground' ? 2.5 : 5.5, nrm: n, size: 0.035, grav: 9, life: 0.55, floor: n.y > 0.7 ? p.y : null });
  if (!wood && tag !== 'ground') magic.flashAt(p, 0xffc070, 0.3);
  if (tag === 'ground' || wood) for (let i = 0; i < 4; i++) smoke.emit(p.clone(), new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6), { life: 1.2, size: 0.3, grow: 0.5, alpha: 0.25, shade: 0.7 });
  sfx.clang(wood || tag === 'ground');
  shake = heavy ? 0.9 : 0.55;
}

// ------------------------------------------------------------------ zones and light
function zoneAt(p) {
  if (p.y < -1.5) return { name: 'The Undercroft', kind: 'under' };
  for (const z of ctx.zones) if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1 && p.y < z.y1) return { name: z.name, kind: 'in' };
  if (p.x > GRAVEYARD.x0 && p.x < GRAVEYARD.x1 && p.z > GRAVEYARD.z0 && p.z < GRAVEYARD.z1) return { name: 'The Bellmourn Graveyard', kind: 'out' };
  if (Math.hypot(p.x, p.z) > VILLAGE_R + 10) return { name: 'The Darkwood', kind: 'out' };
  return { name: 'Bellmourn', kind: 'out' };
}

const L = { out: 1, under: 0, inCathedral: 0 }; // smoothed zone weights
const MOON = new THREE.Color(0x8aa0e0);
const _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _c = new THREE.Vector3();
let day = dayState(hour);
function light(dt, t) {
  if (timeMode === 'cycle') hour = (hour + dt / 60) % 24; // an hour a minute
  day = dayState(hour);
  const z = zoneAt(player.pos);
  hud.zone(z.name);
  const k = Math.min(1, dt * 2.5);
  L.out += ((z.kind === 'out' ? 1 : 0) - L.out) * k;
  L.under += ((z.kind === 'under' ? 1 : 0) - L.under) * k;
  L.inCathedral += ((z.name.startsWith('Cathedral') ? 1 : 0) - L.inCathedral) * k;
  const indoor = Math.max(0, 1 - L.out - L.under);
  const surface = 1 - L.under; // underground nothing but torches and spells

  // sun by day, moon by night; with shadows the roofs keep it out of interiors by themselves
  const isDay = day.day > 0.02;
  sun.color.copy(isDay ? day.sunColor : MOON);
  sun.intensity = (isDay ? day.sunPower * day.day : 0.55) * surface * (HI ? 1 : L.out + 0.25 * indoor);
  const ld = day.lightDir;
  if (HI) { // keep the shadow map's texels fixed in the world as it follows you (no shimmer)
    _lx.crossVectors(new THREE.Vector3(0, 1, 0), ld).normalize();
    _ly.crossVectors(ld, _lx);
    const tx = 144 / 4096;
    _c.copy(player.pos);
    const px = _c.dot(_lx), py = _c.dot(_ly);
    _c.addScaledVector(_lx, Math.round(px / tx) * tx - px).addScaledVector(_ly, Math.round(py / tx) * tx - py);
    sun.target.position.copy(_c);
    sun.position.copy(_c).addScaledVector(ld, 300);
  } else { sun.target.position.set(0, 0, 0); sun.position.copy(ld).multiplyScalar(300); }
  hemi.color.copy(day.zenith).lerp(new THREE.Color(1, 1, 1), 0.55);
  hemi.groundColor.copy(day.horizon).multiplyScalar(0.3);
  hemi.intensity = day.ambient * (L.out + (0.55 + 0.45 * L.inCathedral) * indoor) * surface * 1.15;
  scene.fog.color.copy(day.fog).lerp(BLACK, L.under);
  scene.fog.near = 30 * surface + 3 * L.under;
  scene.fog.far = (isDay ? 300 : 170) * surface + 46 * L.under;
  skyDome.update(day, t, camera.position, surface);
  bill.light.value.copy(hemi.color).multiplyScalar(hemi.intensity * 0.55 + sun.intensity * 0.22 * L.out);
  bill.time.value = t;
  bill.sunDir.value.copy(ld);
  shafts.update(day, t, L.inCathedral > 0.05 || L.out > 0.5);
  // lit windows and lanterns come up as the light goes
  const dusk = 1 - THREE.MathUtils.smoothstep(day.day, 0.1, 0.9);
  if (ctx.glass) ctx.glass.emissiveIntensity = 0.12 + 1.5 * dusk;
  if (ctx.lantern) ctx.lantern.color.setRGB(0.9 + 1.8 * dusk, 0.6 + 1.1 * dusk, 0.3 + 0.55 * dusk);
  mist.update(t, 0.35 + 0.65 * day.day);

  // the nearest flames get the pool's lights; the closest few get the shadow-casting ones.
  // A light keeps its flame while that flame is still wanted, so shadows rarely re-render.
  lightTimer -= dt;
  if (lightTimer <= 0) {
    lightTimer = 0.25;
    const p = camera.position;
    const ranked = flameList.map((f) => [f, (f[0] - p.x) ** 2 + (f[1] - p.y) ** 2 * 4 + (f[2] - p.z) ** 2])
      .filter((a) => a[1] < 55 * 55).sort((a, b) => a[1] - b[1]).map((a) => a[0]);
    const groups = [[torchPool.slice(0, TORCH_SHADOWS), ranked.slice(0, TORCH_SHADOWS)],
      [torchPool.slice(TORCH_SHADOWS), ranked.slice(TORCH_SHADOWS, TORCHES)]];
    for (const [ls, want] of groups) {
      const free = want.filter((f) => !ls.some((l) => l.userData.flame === f));
      for (const l of ls) {
        if (l.userData.flame && want.includes(l.userData.flame)) continue;
        l.userData.flame = free.shift() || null;
        if (l.userData.flame) {
          const f = l.userData.flame;
          l.position.set(f[0], f[1] + 0.18, f[2]);
          if (l.castShadow) l.shadow.needsUpdate = true;
        }
      }
    }
  }
  let warm = 0;
  const night = 1 - day.day;
  torchPool.forEach((l, i) => {
    const f = l.userData.flame;
    if (!f) { l.intensity = 0; return; }
    const big = f[3] > 0.2;
    const flick = 0.84 + 0.1 * Math.sin(t * 11 + i * 3.1) * Math.sin(t * 4.3 + i) + 0.06 * Math.sin(t * 23 + i * 7);
    // torches read best at night and underground; by day outdoors they're a glow
    const vis = L.under + indoor + L.out * (0.35 + 0.65 * night);
    l.intensity = (big ? 13 : 5) * flick * Math.min(1.2, vis + 0.2);
    l.distance = big ? 16 : 9;
    const d = camera.position.distanceTo(l.position);
    warm += Math.max(0, 1 - d / l.distance) ** 2 * (big ? 0.9 : 0.45) * flick;
  });
  bill.setLights([...torchPool, ...magic.lights.map((x) => x.light)]);
  const amb = (day.ambient * (L.out + (0.55 + 0.45 * L.inCathedral) * indoor)) * surface;
  vm.setLight(amb, sun.intensity / 2.5 * (L.out + 0.25 * indoor), warm,
    magic.vmFlash.amount * 4 + (magic.wisp ? 1.6 : 0), magic.vmFlash.amount > 0.05 ? magic.vmFlash.color : magic.wisp ? new THREE.Color(0xffe8b0) : null);
  vm.sun.color.copy(sun.color);
  grade.uniforms.flash.value.copy(magic.screen.color);
  grade.uniforms.flashAmt.value = magic.screen.amount;
  grade.uniforms.hurt.value = Math.max(0, 1 - player.health / 40);
}

// ------------------------------------------------------------------ start, pause, menus
function begin() {
  sfx.start();
  if (!ready) return;
  started = true;
  paused = false;
  hud.showOverlay(null);
  if (touch) {
    hud.showTouch(true);
    document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  } else {
    canvas.requestPointerLock?.();
  }
}

function setInventory(on) {
  hud.showInventory(on);
  if (on) { document.exitPointerLock?.(); hud.refresh(vm.equip, book, vm.gauntlet); }
  else if (!touch) canvas.requestPointerLock?.();
}

function pause() {
  paused = true;
  hud.showInventory(false);
  hud.showOverlay('pause', touch);
  if (touch) hud.showTouch(false);
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && started && !hud.invOpen) pause();
});

// ------------------------------------------------------------------ the loop
const clock = new THREE.Clock();
let t = 0, lastBob = 0;
const QUICK = { Digit1: ['onehand', 'R'], Digit2: ['twohand', 'R'], Digit3: ['wand', 'R'], Digit4: ['staff', 'R'],
  Digit5: ['shield_round', 'L'], Digit6: ['shield_kite', 'L'] };

function frame() {
  requestAnimationFrame(frame);
  tick(Math.min(0.05, clock.getDelta()));
}

/** One frame of the game: input, the player, hands, magic, light, then the picture. */
function tick(dt) {
  t += dt;
  if (!ready) return;
  const inp = gameInput;
  const active = started && !paused && !hud.invOpen;

  if (started && (inp.was('Tab') || inp.was('KeyI'))) setInventory(!hud.invOpen);
  if (started && inp.was('Escape')) { if (hud.invOpen) { hud.showInventory(false); pause(); } else if (touch) pause(); }
  if (active) {
    player.update(dt, inp);
    for (const [code, [kind, side]] of Object.entries(QUICK)) if (inp.was(code)) equip(kind, side);
    // right hand
    if (inp.held('Mouse0') && !vm.busy('R')) {
      const kind = vm.equip.R, bolt = BOLTS[kind];
      if (bolt && player.mana < bolt.mana) { if (inp.was('Mouse0')) noMana(); }
      else {
        const did = vm.attackRight();
        if (did && bolt) { player.mana -= bolt.mana; pending.R = { def: bolt, side: 'R' }; }
        else if (did === 'onehand' || did === 'twohand') setTimeout(() => sfx.swing(did === 'twohand'), did === 'twohand' ? 200 : 140);
      }
    }
    // left hand (shields are held up as long as the button is)
    const lk = vm.equip.L;
    if (lk === 'wand' && inp.held('Mouse2') && !vm.busy('L') && player.mana < BOLTS.wand.mana) { if (inp.was('Mouse2')) noMana(); }
    else {
      const did = vm.actLeft(inp.held('Mouse2'));
      if (did === 'wand') { player.mana -= BOLTS.wand.mana; pending.L = { def: BOLTS.wand, side: 'L' }; }
      else if (did === 'onehand') setTimeout(() => sfx.swing(false), 140);
    }
    if (inp.was('KeyF')) castSlot('F');
    if (inp.was('KeyR')) castSlot('R');
    // footsteps on the bob's down-beats
    if (player.onGround && player.speed > 1 && Math.floor(player.bob / Math.PI) !== Math.floor(lastBob / Math.PI)) sfx.step(L.out < 0.5);
    lastBob = player.bob;
    // the swing's kick and the spells' blasts
    const sh = shake + magic.shake;
    if (sh > 0) {
      camera.rotation.x += (Math.random() - 0.5) * 0.012 * sh;
      camera.rotation.y += (Math.random() - 0.5) * 0.012 * sh;
      shake = Math.max(0, shake - dt * 5);
    }
  } else if (!started) { // a slow drift round the plaza behind the title
    camera.position.set(Math.sin(t * 0.05) * 22, 6, 30 + Math.cos(t * 0.05) * 6);
    camera.lookAt(0, 6, -60);
  }

  vm.update(dt, active ? player.speed : 0);
  camera.updateMatrixWorld();
  // spells gathering in the hand before they leave it
  for (const side of ['R', 'L']) {
    const p = pending[side], st = vm.state[p?.both ? 'R' : side];
    if (p && st) magic.charge(fromView(castFrom(p), 0.75), p.def, dt);
  }
  magic.update(dt, camera, H, player);
  flames.update(t, camera, H);
  smoke.update(dt, camera, H, 0.25 + 0.75 * day.day * (1 - L.under) + 0.1);
  light(dt, t);
  hud.update(player, book);

  vmPass.enabled = started; // no arms behind the title screen
  composer.render(dt);
  inp.endFrame();
}

// ------------------------------------------------------------------ go
hud = new Hud(ui, { spells: SPELLS, items: ITEMS, gauntlets: [], onEquip: equip, onAssign: assign,
  onGauntlet: gauntlet, onClose: () => setInventory(false) });
try { Object.assign(book, JSON.parse(localStorage.getItem('bm.book') || '{}')); } catch { /* first visit */ }
hud.showOverlay('loading', touch);
gameInput = new Input(canvas, ui);
canvas.addEventListener('mousedown', () => sfx.start());
hud.overlay.addEventListener('click', (e) => { if (!e.target.closest('.opts')) begin(); });
hud.overlay.addEventListener('touchend', (e) => { if (!e.target.closest('.opts')) { e.preventDefault(); begin(); } });
const optPix = ui.querySelector('#optPix'), optSens = ui.querySelector('#optSens');
const optGfx = ui.querySelector('#optGfx'), optTime = ui.querySelector('#optTime');
optPix.value = String(pix);
optPix.onchange = () => { pix = Number(optPix.value); localStorage.setItem('bm.pix', pix); resize(); };
optSens.value = localStorage.getItem('bm.sens') || '1';
const sens = () => { gameInput.sensitivity = 0.0022 * Number(optSens.value); gameInput.touchLook = 0.006 * Number(optSens.value); };
optSens.oninput = () => { localStorage.setItem('bm.sens', optSens.value); sens(); };
sens();
optGfx.value = QUALITY;
optGfx.onchange = () => { localStorage.setItem('bm.quality', optGfx.value); location.reload(); };
optTime.value = timeMode;
optTime.onchange = () => {
  timeMode = optTime.value; localStorage.setItem('bm.time', timeMode);
  hour = { golden: 17.6, noon: 12, night: 23, cycle: hour }[timeMode];
};
resize();
build().then(() => {
  hud.showOverlay('start', touch);
  window.bellmourn = { scene, camera, renderer, composer, player, vm, magic, physics, ctx, lib, equip, assign, castSlot, hud, begin, L,
    setHour: (h) => { hour = h; }, get hour() { return hour; }, torchPool, sun, hemi, bloom, grade, tick };
  document.getElementById('boot')?.remove();
}).catch((e) => {
  console.error(e);
  window.bootError = e;
  hud.overlay.querySelector('.go').textContent = 'Failed to load: ' + e.message;
});
frame();
