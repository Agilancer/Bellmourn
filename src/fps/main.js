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
import { Kit } from './kit.js';
import { Builder } from './geo.js';
import { buildWorld, VILLAGE_R, GRAVEYARD } from './realm.js';
import { buildCrypt } from './crypt.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { ViewModel, ITEMS } from './viewmodel.js';
import { SPELLS, BOLTS, Magic, Flames } from './spells.js';
import { Sky, Shafts, Mist, Smoke, dayState } from './effects.js';
import { Hud } from './hud.js';
import { KitDoors } from './kitdoors.js';
import { Loot } from './loot.js';
import { Containers } from './containers.js';
import { Bag, GOODS, describe } from './items.js';
import { REGION } from './terrain.js';
import { worldHeight, biomeAt, BIOMES } from './land.js';
import { SPOTS } from './wilds.js';
import { Sfx } from './audio.js';
import { Zombies } from './zombies.js';
import { Foes } from './foes.js';
import { buildCave } from './cave.js';
import { StainedGlass } from './glass.js';

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
let hud, vm, player, magic, flames, skyDome, shafts, mist, smoke, physics, ctx, gameInput, kit, zombies, foes;
// the dead: a horde about the graves (kept up by more clawing out of the ground, with a few
// lying buried), and more spread through the dungeon below
const YARD_DEAD = 28, YARD_BURIED = 6, DUNGEON_DEAD = 18;
// what each kind of spell does to flesh: a direct hit, its blast (radius, damage), and how
// likely a direct hit is to blow off the head or limb it lands on (zombies.js BLOW: by where)
const SPELL_DMG = { fire: 45, frost: 22, lightning: 60, staff: 30, wisp: 25 };
const SPELL_BLAST = { fire: [2.2, 40], lightning: [3.0, 50], frost: [0.8, 10] };
const SPELL_BLOW = { fire: 1, lightning: 1.25, staff: 0.85, frost: 0.5 };
const book = { F: 'firebolt', R: 'mend' };
const bag = new Bag(24);        // what you carry: gold, potions, odds and ends, spare arms
const wielded = {};             // the looted weapon in each hand's kind (what goes back in the bag)
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
  const T0 = performance.now(), times = (window.buildTimes = []), mark = (k) => times.push([k, Math.round(performance.now() - T0)]);
  physics = new Physics();
  // the reworked Quaternius kit: every model of the six packs, reshaped and repainted
  kit = await new Kit(renderer, scene, physics, { normals: HI, shadows: HI }).load();
  const b = new Builder(physics);
  ctx = { kit, lib: kit, b, scene, physics, flames: [], chimneys: [], sfx, animated: [] };
  ctx.stained = await new StainedGlass(ctx).load(); // the windows, and the light through them
  physics.terrain = worldHeight; // the whole land: flat in the village, hills and mountains beyond
  ctx.doors = new KitDoors(ctx);
  // the pots, crates, barrels and chests the world places: searched with E, smashed by blows
  ctx.containers = kit.loose = new Containers(ctx);
  mark('kit');
  buildWorld(ctx); mark('world');
  ctx.dungeon = buildCrypt(ctx, ctx.stairBottom); mark('dungeon');
  ctx.cave = buildCave(ctx); mark('cave');   // the Gloamhollow, in the cliff beside Brightwater Falls
  ctx.builtUnder = b.finish(scene).filter((m) => m.geometry.boundingSphere.center.y < -6); mark('merge');
  kit.finish(); mark('instances');
  await ctx.land.ready;
  ctx.stained.applyTo(scene);
  ctx.glass = kit.glass;
  if (kit.missing?.size) console.warn('kit models not found:', [...kit.missing].join(' '));
  console.info(`kit: ${kit.used.size}/${kit.ids(() => true).length} models placed, ${kit.instances} instances in ${kit.cells.length} cells; flora`, ctx.floraCounts,
    'late', ctx.coverage, 'land ms', ctx.land.timeHeights, ctx.land.timeMap, ctx.land.timeMesh);
  flameList = [...kit.flames, ...ctx.flames];
  flames = new Flames(scene, flameList);
  skyDome = new Sky(scene);
  shafts = new Shafts(scene, ctx.stained.shafts());
  const indoors = ctx.zones.filter((z) => z.x0 > GRAVEYARD.x0 - 4 && z.x1 < GRAVEYARD.x1 + 4 && z.z0 > GRAVEYARD.z0 - 4 && z.z1 < GRAVEYARD.z1 + 4);
  mist = new Mist(scene, [GRAVEYARD.x0 - 4, GRAVEYARD.z0 - 4, GRAVEYARD.x1 + 4, GRAVEYARD.z1 + 4],
    { exclude: indoors.map((z) => [z.x0, z.z0, z.x1, z.z1]) });
  smoke = new Smoke(scene);
  for (const [x, y, z] of ctx.chimneys) smoke.addEmitter(x, y, z, 2.5);

  const manifest = await (await fetch('templates/models/manifest.json')).json();
  vm = new ViewModel(manifest, kit);
  vm.equip = { R: 'onehand', L: 'shield_round' };
  await vm.load('wayfarer');
  vmPass.scene = vm.scene; vmPass.camera = vm.camera;
  // what the monsters drop: the packs' reworked weapons, taken up by walking over them
  ctx.loot = new Loot(ctx, { vm, onTake: (it) => {
    sfx.equip(); hud.toast(`You take up the ${it.title}`);
    const old = wielded[it.kind];   // the looted one it replaces goes in the bag
    wielded[it.kind] = it;
    if (old && old !== it) { const { holder, glint, ...w } = old; bag.add({ id: 'weapon', n: 1, w }); }
    hud.refresh(vm.equip, book, vm.gauntlet); hud.refreshBag();
    renderIcons().then((icons) => { hud.setIcons(icons); hud.refresh(vm.equip, book, vm.gauntlet); });
  } });
  ctx.containers.hooks = { onSearch: openLoot, onBreak: shattered, onPick: pickUp };
  mark('arms');
  const icons = await renderIcons(); mark('icons');
  player = new Player(physics, camera, { contains: ctx.inBounds });
  magic = new Magic(scene, physics, sfx, { shadows: HI, smoke });
  zombies = new Zombies(scene, physics, kit, sfx);
  await zombies.load(); mark('zombies');
  const G = GRAVEYARD;
  zombies.populateYard(G, YARD_DEAD, YARD_BURIED, [-7, G.z0 + 3, 7, G.z0 + 17]); // not in the mausoleum
  zombies.populateDungeon(ctx.dungeon, DUNGEON_DEAD);
  zombies.onPlayerHit = hurtPlayer;
  foes = new Foes(zombies, manifest, ctx);   // dark knights and sorcerers abroad, ghasts and grubbers in the cave
  await foes.load(); foes.populate(ctx); mark('foes');
  magic.hitTest = (p, d, far) => zombies.ray(p, d, far);
  magic.hitAll = (p, d, far) => zombies.list.map((z) => z.ray(p, d, far)).filter(Boolean);
  magic.targets = () => zombies.list;
  magic.nearest = (z, p) => zombies.nearest(z, p);
  // o: what a spell's own blow overrides (dmg, heavy, blow)
  magic.onHit = (def, at, d, h, o = {}) => h.z.hit(h, { dmg: o.dmg ?? def.dmg ?? SPELL_DMG[def.kind] ?? 30, dir: d,
    heavy: o.heavy ?? def.size > 0.4, kind: def.kind, blow: o.blow ?? def.blow ?? SPELL_BLOW[def.kind] ?? 0 });
  magic.area = (at, r, dmg, kind) => { const hit = zombies.blast(at, r, dmg, kind); ctx.containers.blast(at, r, dmg); zombies.noise(at, 22); return hit; };
  magic.smash = (at, r, dmg) => ctx.containers.blast(at, r, dmg);
  magic.noise = (at, r) => zombies.noise(at, r);
  magic.onBlast = (def, at) => {
    const b = SPELL_BLAST[def.kind];
    if (b) { zombies.blast(at, b[0], b[1], def.kind); ctx.containers.blast(at, b[0], b[1]); }
    zombies.noise(at, def.size > 0.4 ? 26 : 16);   // the dead hear it go off
  };

  hud.setIcons(icons);
  hud.o.gauntlets = manifest.arms.map((a) => ({ id: a.id, name: a.name.replace(/^bare arm$/, 'Bare hands') }));
  hud.o.models = (kind) => vm.models(kind);  // every one- and two-handed model, to choose from
  hud.o.onModel = async (kind, id) => {
    await vm.setModel(kind, id);
    sfx.equip();
    hud.setIcons(await renderIcons());
    hud.refresh(vm.equip, book, vm.gauntlet);
  };
  hud.refresh(vm.equip, book, vm.gauntlet);
  vm.on(onEvent);
  resize();
  ready = true;
}

/** Small pictures of the six arms for the inventory, rendered from their models. */
async function renderIcons() {
  const out = {};
  for (const kind of Object.keys(ITEMS)) out[kind] = snapshot(await vm.itemScene(kind));
  return out;
}

/** A model's picture for a slot (a data URL), lit from the front-left on nothing. */
let snap = null;
function snapshot(obj, { flat = false } = {}) {
  const S = 96;
  if (!snap) {
    snap = { rt: new THREE.WebGLRenderTarget(S, S), sc: new THREE.Scene(), buf: new Uint8Array(S * S * 4), cv: document.createElement('canvas') };
    snap.sc.add(new THREE.HemisphereLight(0xfff0dd, 0x403848, 2.2));
    const dl = new THREE.DirectionalLight(0xffe8c8, 3); dl.position.set(-1, 2, 3); snap.sc.add(dl);
    snap.cv.width = snap.cv.height = S;
  }
  const { rt, sc, buf, cv } = snap, g = cv.getContext('2d');
  const tm = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
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
  const dir = long ? new THREE.Vector3(0.25, 0.15, 1) : flat ? new THREE.Vector3(0.3, 0.5, 1)
    : new THREE.Vector3(thin === 'x' ? 1 : 0.2, 0.2, thin === 'z' ? 1 : 0.3);
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
  sc.remove(holder);
  renderer.toneMapping = tm;
  return cv.toDataURL();
}

/** The icon of a thing in the bag: drawn from its kit model once its textures are in (until
 * then '', and the bag is redrawn when it's ready). */
const bagIcons = new Map();
function iconOf(it) {
  const d = describe(it), key = d.model + '|' + d.variant;
  if (bagIcons.has(key)) return bagIcons.get(key);
  bagIcons.set(key, '');
  const obj = kit.mesh(d.model, d.variant);
  const maps = [];
  obj.traverse((o) => { if (o.material?.map) maps.push(o.material.map); });
  Promise.all(maps.map((t) => new Promise((res) => kit.whenLoaded(t, res)))).then(() => requestAnimationFrame(() => {
    bagIcons.set(key, snapshot(obj, { flat: it.id !== 'weapon' }));
    hud.refreshBag();
  }));
  return '';
}

// ------------------------------------------------------------------ the bag and searching
/** E on a container (once a chest's lid is up): its window, and the bag beside it. */
function openLoot(c) {
  if (hud.lootOpen || paused) return;
  document.exitPointerLock?.();
  hud.openLoot(c);
  if (!c.searched) { c.searched = true; zombies.noise(player.pos, 6); }
}

function closeLoot() {
  hud.showInventory(false);
  if (!touch) canvas.requestPointerLock?.();
}

const bagOf = (grid) => (grid === 'bag' ? bag : hud.looting?.bag);

/** A thing dragged from one slot to another (i -1: anywhere in that window). */
function moveItem(from, to) {
  const src = bagOf(from.grid), dst = bagOf(to.grid);
  if (!src || !dst || (src === dst && to.i < 0)) return;
  const it = src.take(from.i);
  if (!it) return;
  let back;
  if (to.i < 0) back = dst.add(it) ? null : it;   // into the first slot that'll have it
  else back = dst.put(to.i, it);                  // onto that slot (swapping what's there)
  if (back && back.n > 0) { src.slots[from.i] = back; }
  if (back === it && to.i < 0 && to.grid === 'bag') hud.toast('Your bag is full');
  if (from.grid !== to.grid) (it.id === 'gold' ? sfx.coins() : sfx.equip());
  hud.refreshBag();
}

/** Double-click: out of the container into the bag; in the bag, drink it or wield it (or, while
 * searching, put it back). */
function useItem(from) {
  const src = bagOf(from.grid), it = src?.slots[from.i];
  if (!it) return;
  if (from.grid === 'loot') {
    if (!bag.add(it)) hud.toast('Your bag is full');
    if (it.n <= 0) src.slots[from.i] = null;
    it.id === 'gold' ? sfx.coins() : sfx.equip();
  } else if (GOODS[it.id]?.drink) {
    const hp = GOODS[it.id].drink === 'health';
    if (hp && player.health >= player.maxHealth) { hud.toast('You are not hurt'); return; }
    if (!hp && player.mana >= player.maxMana) { hud.toast('Your mana is full'); return; }
    if (hp) player.health = Math.min(player.maxHealth, player.health + 60);
    else player.mana = Math.min(player.maxMana, player.mana + 60);
    if (--it.n <= 0) bag.slots[from.i] = null;
    sfx.drink();
    hud.toast(hp ? 'Your wounds close' : 'Your mind clears');
  } else if (it.id === 'weapon') {
    bag.slots[from.i] = null;
    ctx.loot.take(it.w);   // into the hand: the one it replaces comes back to the bag
  } else if (hud.looting) {
    hud.looting.bag.add(it);
    if (it.n <= 0) bag.slots[from.i] = null;
  }
  hud.refreshBag();
}

function takeAll() {
  const c = hud.looting;
  if (!c) return;
  let gold = false, full = false;
  c.bag.slots.forEach((it, i) => {
    if (!it) return;
    gold ||= it.id === 'gold';
    if (!bag.add(it)) full = true;
    if (it.n <= 0) c.bag.slots[i] = null;
  });
  gold ? sfx.coins() : sfx.equip();
  if (full) { hud.toast('Your bag is full'); hud.refreshBag(); } else closeLoot();
}

/** Something spilled on the floor walked over: into the bag if there's room. */
let fullWarned = 0;
function pickUp(it) {
  const d = describe(it), n = it.n;
  const all = bag.add(it);
  if (it.n < n) {
    it.id === 'gold' ? sfx.coins() : sfx.equip();
    hud.toast(it.id === 'gold' ? `+${n - it.n} gold` : `${d.name}${n - it.n > 1 ? ' ×' + (n - it.n) : ''}`);
    hud.refreshBag();
  }
  if (!all && performance.now() - fullWarned > 4000) { fullWarned = performance.now(); hud.toast('Your bag is full'); }
  return all;
}

/** A pot, crate or barrel smashed: splinters or sherds, dust, the crash (and the dead hear it). */
function shattered(c, at, dir) {
  const clay = c.kind === 'pot';
  const cols = clay ? ['#9a5a38', '#c08060', '#6a3a24'] : ['#8a6a40', '#5a4028', '#b08850'];
  magic.particles.burst(at, cols.map((x) => new THREE.Color(x)), clay ? 26 : 34,
    { speed: 3.2, nrm: new THREE.Vector3(0, 1, 0), size: 0.03, grav: 9, life: 0.7, floor: c.base });
  for (let i = 0; i < 3; i++) smoke.emit(at.clone().setY(c.base + 0.2), new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 1.2),
    { life: 1.2, size: 0.3, grow: 0.5, alpha: 0.16, shade: 0.55 });
  sfx.shatter(c.kind);
  zombies.noise(at, 12);
  shake = Math.max(shake, 0.4);
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
    magic.endCharge();
    magic.arcana.endChannels();
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
  // a spell with a charge holds the cast just before it leaves the hand until it has gathered;
  // a held one (a channel) holds there as long as its key is down
  const side = vm.cast(def, { charge: !!def.charge || !!def.channel });
  if (!side) return;
  player.mana -= def.mana;
  pending[side === 'both' ? 'R' : side] = { def, both: side === 'both', id: book[slot], side, charge: def.charge || 0, t: 0,
    channel: !!def.channel, key: 'Key' + slot, held: true, ct: 0 };
  if (def.charge) sfx.chargeUp?.(def.charge);
}

/** A zombie's blow lands on you; if it kills you, you wake in the village. */
function hurtPlayer(dmg) {
  player.health -= dmg;
  shake = Math.max(shake, 0.9);
  sfx.clang(true);
  if (player.health <= 0) {
    player.health = player.maxHealth;
    player.pos.set(0, 0, 12); player.vel.set(0, 0, 0);
    zombies.forget();
    hud.toast('Torn apart by the dead... you wake in the village');
  }
}

function noMana() { hud.flashMana(); hud.toast('Not enough mana'); sfx.fizzle(); }

/** A held spell, once the hands reach the hold: it runs while its key is down (and for its
 * least time even if tapped) and there's mana for it, then the hands play on and drop. */
function channel(p, side, st, at, dt, active) {
  if (!gameInput.held(p.key)) p.held = false;
  if (st.hold == null || st.action.time < st.hold - 1e-3) { magic.charge(at, p.def, dt); return; }
  if (!active) return;
  p.ct += dt;
  if ((p.held || p.ct < (p.def.minHold || 0)) && player.mana > 0) {
    const k = magic.arcana.channel(p, at, aimPoint().sub(at).normalize(), dt, player, camera);
    player.mana = Math.max(0, player.mana - p.def.drain * k * dt);
    return;
  }
  if (player.mana <= 0) noMana();
  magic.arcana.endChannel(p);
  pending[side] = null;
  for (const s of ['R', 'L']) if (vm.state[s]) vm.state[s].hold = null;
}

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

const KIND_SOUND = { fire: 'fire', frost: 'frost', lightning: 'lightning', heal: 'heal', wisp: 'wisp', staff: 'staff' };
function onEvent(kind, side, clip) {
  if (kind === 'fire') {
    const p = pending[side];
    if (!p) return;
    pending[side] = null;
    sfx.cast(KIND_SOUND[p.def.kind] || p.def.kind);
    if (p.def.self) { magic.selfCast(p.def, player, camera); if (p.def.self === 'heal') hud.toast('Your wounds close'); return; }
    const from = fromView(castFrom(p));
    const dir = aimPoint().sub(from).normalize();
    magic.cast(p.def, from, dir, player, camera);
  } else if (kind === 'hit' && /swing/.test(clip) && !(clip.startsWith('r2h') && side === 'L')) {
    melee(clip.startsWith('r2h') ? 3.0 : 2.4, clip.startsWith('r2h'));
  }
}

/** A swing landing: the nearest thing in reach across the blade's arc gets sparks or chips. */
function melee(reach, heavy) {
  const o = camera.position;
  let best = null, flesh = null;
  for (const a of [-0.35, -0.15, 0, 0.15, 0.35]) {
    const d = new THREE.Vector3(0, -0.05, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), a)
      .applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ')).normalize();
    const hit = physics.ray([o.x, o.y, o.z], [d.x, d.y, d.z], reach);
    if (hit && (!best || hit.t < best.t)) best = { ...hit, d };
    const zh = zombies.ray(o, d, reach);
    if (zh && (!flesh || zh.t < flesh.t)) flesh = { ...zh, d };
  }
  if (flesh && (!best || flesh.t < best.t)) { // the blade bites into a zombie
    flesh.z.hit(flesh, { dmg: (heavy ? 60 : 34) * (ITEMS[vm.equip.R]?.power || 1), dir: flesh.d, heavy });
    zombies.noise(o, 14);
    shake = heavy ? 1.0 : 0.6;
    return;
  }
  if (!best) return;
  zombies.noise(o, 14);   // steel on stone carries
  if (best.box && ctx.containers.hit(best.box, (heavy ? 60 : 34) * (ITEMS[vm.equip.R]?.power || 1), best.d) && best.box.off) {
    shake = heavy ? 0.8 : 0.5;   // smashed it
    return;
  }
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
  if (p.y < worldHeight(p.x, p.z) - 1.5) {
    const d = ctx.dungeon?.bounds;
    return { name: d && p.x > d.x0 && p.x < d.x1 && p.z > d.z0 && p.z < d.z1 ? 'The Undercroft' : ctx.cave?.contains(p) ? ctx.cave.name : 'The Caves', kind: 'under' };
  }
  const far = Math.hypot(p.x, p.z) > 300 || p.x > REGION.x0 ? 1 : 0; // out of the forest: see a long way
  for (const z of ctx.zones) if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1 && p.y < z.y1 && p.y > z.y0) return { name: z.name, kind: 'in', open: far };
  for (const [x, z, r, name] of Object.values(SPOTS)) if (Math.hypot(p.x - x, p.z - z) < r) return { name, kind: 'out', open: 1 };
  if (p.x > 110 && p.x < REGION.x0 && Math.abs(p.z) < 8) return { name: 'The Bellwood Trail', kind: 'out' };
  if (p.x > GRAVEYARD.x0 && p.x < GRAVEYARD.x1 && p.z > GRAVEYARD.z0 && p.z < GRAVEYARD.z1) return { name: 'The Bellmourn Graveyard', kind: 'out' };
  const bio = biomeAt(p.x, p.z);
  if (bio === 'core') return { name: Math.hypot(p.x, p.z) > VILLAGE_R + 10 ? 'The Darkwood' : 'Bellmourn', kind: 'out' };
  return { name: BIOMES[bio].name, kind: 'out', open: 1 };
}

const L = { out: 1, under: 0, inCathedral: 0, open: 0 }; // smoothed zone weights
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
  L.open += ((z.open ? 1 : 0) - L.open) * k * 0.5; // the downs: see a long way
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
  scene.fog.far = ((isDay ? 300 : 170) + (isDay ? 420 : 140) * L.open) * surface + 46 * L.under;
  skyDome.update(day, t, camera.position, surface);
  shafts.update(day, t, L.inCathedral > 0.05 || L.out > 0.5);
  ctx.stained.update(ld, day.day * surface, day.ambient * surface);
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
  if (!on) hud.closeLoot();
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
const QUICK = { Digit1: ['onehand', 'R'], Digit2: ['twohand', 'R'], Digit3: ['staff', 'R'],
  Digit4: ['shield_round', 'L'], Digit5: ['shield_kite', 'L'] };

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

  if (started && hud.lootOpen && (inp.was('KeyE') || inp.was('Tab') || inp.was('KeyI'))) closeLoot();
  else if (started && (inp.was('Tab') || inp.was('KeyI'))) setInventory(!hud.invOpen);
  if (started && inp.was('Escape')) { if (hud.lootOpen) closeLoot(); else if (hud.invOpen) { hud.showInventory(false); pause(); } else if (touch) pause(); }
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
    const did = vm.actLeft(inp.held('Mouse2'));
    if (did === 'onehand') setTimeout(() => sfx.swing(false), 140);
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
  // spells gathering in the hand before they leave it; a charged one holds there, growing,
  // until it's ready, then the cast plays on and lets it go
  for (const side of ['R', 'L']) {
    const p = pending[side], st = vm.state[p?.both ? 'R' : side];
    if (p?.channel && !st) { magic.arcana.endChannel(p); pending[side] = null; continue; }
    if (!p || !st) continue;
    const at = fromView(castFrom(p), 0.75);
    if (p.channel) { channel(p, side, st, at, dt, active); continue; }
    magic.charge(at, p.def, dt);
    if (p.charge) {
      p.t += dt;
      magic.chargeBall(at, p.def, Math.min(1, p.t / p.charge), dt);
      if (p.t >= p.charge) { p.charge = 0; for (const s2 of ['R', 'L']) if (vm.state[s2]) vm.state[s2].hold = null; magic.endCharge(); }
    }
  }
  // what you're looking at: a container to search, or a door to open or close, and E for it
  if (active) {
    const box = ctx.containers.aimed(camera);
    const door = box ? null : ctx.doors.aimed(camera);
    if (box) {
      const shut = box.lid && box.lidT === 0;
      hud.prompt(box.opening ? '' : `E — ${shut ? 'open' : 'search'} the ${box.name}${box.searched && box.bag.empty ? ' (empty)' : ''}`);
      if (inp.was('KeyE')) ctx.containers.search(box);
    } else {
      hud.prompt(door ? `E — ${door.open ? 'close' : 'open'} the ${door.name}` : '');
      if (door && inp.was('KeyE')) ctx.doors.toggle(door);
    }
  } else hud.prompt('');
  ctx.doors.update(dt);
  ctx.containers.update(dt, camera, camera.position.y < -6, active ? player : null);
  if (active) ctx.loot.update(dt, player);
  kit.update(camera.position, scene.fog.far, camera.position.y < -6);
  ctx.land.update(camera.position, scene.fog.far);
  for (const m of ctx.builtUnder) m.visible = camera.position.y < 0.5; // the undercroft, only from below
  for (const f of ctx.animated) f(dt, t);
  zombies.update(dt, player, active, camera, H, 0.3 + 0.7 * day.day);
  foes.update(dt, player);
  ctx.water?.update(dt, t, 0.3 + 0.7 * day.day, smoke);
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
  onGauntlet: gauntlet, onClose: () => setInventory(false),
  bag, iconOf, onMove: moveItem, onUse: useItem, onTakeAll: takeAll, onCloseLoot: closeLoot });
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
  window.bellmourn = { scene, camera, renderer, composer, player, vm, magic, physics, ctx, kit, zombies, foes, melee, equip, assign, castSlot, hud, begin, L,
    setHour: (h) => { hour = h; }, get hour() { return hour; }, torchPool, sun, hemi, bloom, grade, tick, bag };
  document.getElementById('boot')?.remove();
}).catch((e) => {
  console.error(e);
  window.bootError = e;
  hud.overlay.querySelector('.go').textContent = 'Failed to load: ' + e.message;
});
frame();
