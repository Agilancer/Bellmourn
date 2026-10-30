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
import { Kit } from './kit.js';
import { Builder } from './geo.js';
import { Billboards } from './sprites.js';
import { Props } from './props.js';
import { buildWorld, VILLAGE_R, GRAVEYARD, STAIRS } from './world.js';
import { buildDungeon, UNDERCROFT, DEEP_UNDERCROFT } from './dungeon.js';
import { buildDelves } from './delves.js';
import { Input, TOUCH } from './input.js';
import { Player } from './player.js';
import { ViewModel, ITEMS } from './viewmodel.js';
import { SPELLS, BOLTS, Magic, Flames } from './spells.js';
import { Sky, Shafts, Mist, Smoke, dayState } from './effects.js';
import { Hud } from './hud.js';
import { Doors } from './doors.js';
import { Scatter3D, isVegetation } from './scatter3d.js';
import { Trees3D } from './trees3d.js';
import { Cutouts } from './cutout.js';
import { Loot } from './loot.js';
import { useManifest, loadCharacter, saveCharacter, computeStats, fitCharacter } from './gear.js';
import { Bag, armorCut } from './bag.js';
import { terrainHeight, REGION, POOL, STREAM } from './terrain.js';
import { SPOTS } from './region.js';
import { Sfx } from './audio.js';
import { Zombies } from './zombies.js';
import { Foes } from './foes.js';
import { Villagers } from './villagers.js';
import { WorldMap } from './map.js';
import { StainedGlass } from './glass.js';

const touch = TOUCH;
const QUALITY = localStorage.getItem('bm.quality') || (touch ? 'low' : 'high');
const HI = QUALITY === 'high';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = HI;
// a phone at high: plain PCF (a quarter the taps of soft), the sun's map redrawn every other
// frame (see tick), and less of everything else below
renderer.shadowMap.type = touch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
if (touch) renderer.shadowMap.autoUpdate = false;

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
  sun.shadow.mapSize.set(touch ? 2048 : 4096, touch ? 2048 : 4096);
  const c = sun.shadow.camera;
  c.left = c.bottom = -72; c.right = c.top = 72; c.near = 1; c.far = 600;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
}
// every point light is paid for in every lit pixel: a phone gets fewer
const TORCHES = HI ? (touch ? 10 : 16) : 8, TORCH_SHADOWS = HI ? (touch ? 2 : 4) : 0;
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
// A phone that runs out of memory is killed and reloaded by the browser with no word of why (Safari's
// "A problem repeatedly occurred"), so each run notes how far it has got; if it never closed cleanly,
// the next shows where it stopped, under the title.
const TRACE = 'bm.trace';
const run = { step: 'starting', frames: 0, bringing: '' };
let lastRun = null;
try { lastRun = localStorage.getItem(TRACE); localStorage.removeItem(TRACE); } catch { /* no storage */ }
function trace() {
  const i = renderer.info;
  const s = `${run.step}, ${run.frames} frames drawn${started ? ' (playing)' : ''}, ${villagers?.list.length ?? 0} villagers in`
    + `${run.bringing ? `, bringing ${run.bringing}` : ''}, ${i.memory.textures} textures, ${i.programs?.length ?? 0} shaders, ${(performance.now() / 1000).toFixed(1)}s`;
  try { localStorage.setItem(TRACE, s); } catch { /* no storage */ }
}
addEventListener('pagehide', () => { try { localStorage.removeItem(TRACE); } catch { /* no storage */ } });
let ready = false;
let hud, vm, player, magic, flames, skyDome, shafts, mist, smoke, physics, ctx, bill, gameInput, lib, kit, zombies, foes, villagers;
// the dead: a horde about the graves (kept up by more clawing out of the ground, with a few
// lying buried), and more spread through the Undercroft and the Deep Undercroft (the delves and
// caves fill their own: delves.js)
const YARD_DEAD = 28, YARD_BURIED = 6, DUNGEON_DEAD = 26, DEEP_DEAD = 20;
// what each kind of spell does to flesh: a direct hit, and its blast (radius, damage)
const SPELL_DMG = { fire: 45, frost: 22, lightning: 60, arcane: 18, staff: 30, wisp: 25 };
const SPELL_BLAST = { fire: [2.2, 40], lightning: [3.0, 50], frost: [0.8, 10] };
const book = { F: 'firebolt', R: 'mend' };
const pending = { R: null, L: null };
let pix = Number(localStorage.getItem('bm.pix') || (HI ? 2 : 2));
let timeMode = localStorage.getItem('bm.time') || 'cycle';
let hour = { golden: 17.6, noon: 12, night: 23, cycle: 16.8 }[timeMode] ?? 16.8;
let started = false, paused = false, lost = false;
let W = 2, H = 2;
let shake = 0, flameList = [], lightTimer = 0;
// the character: what's worn and carried (gear.js), what it adds up to, and the shield's Guard
let char = loadCharacter(), st = computeStats(char), bag = null, map = null;
const guard = { v: 0, max: 0, broken: false, wait: 0 };

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

// dynamic resolution: the picture is drawn at `rs` of the chosen pixel size's resolution, eased
// down (to 0.55) when frames run long and back up when there's time to spare
let rs = 1, frameMs = 16, rsT = 0;
function resize() {
  W = Math.max(2, Math.floor(innerWidth / pix * rs));
  H = Math.max(2, Math.floor(innerHeight / pix * rs));
  renderer.setSize(W, H, false);
  composer.setSize(W, H);
  bloom.setSize(touch ? Math.ceil(W / 2) : W, touch ? Math.ceil(H / 2) : H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  vm?.resize(W / H);
  hud?.rotate.classList.toggle('show', touch && innerHeight > innerWidth);
}
addEventListener('resize', resize);

// ------------------------------------------------------------------ build everything
// how far through the build each step is (as it runs on a desktop), for the loading line: a
// phone takes a minute or more, and should be seen to be getting on with it
const LOADED = { library: 10, world: 37, props: 45, arms: 73, icons: 77, zombies: 80, foes: 100 };

async function build() {
  const T0 = performance.now(), times = (window.buildTimes = []);
  const mark = async (k) => {
    times.push([k, Math.round(performance.now() - T0)]);
    run.step = `built ${k}`; trace();
    if (LOADED[k]) { hud.loading(LOADED[k]); await new Promise((r) => setTimeout(r)); } // let it paint
  };
  physics = new Physics();
  // the world is built from the Velscour texture library, its sprites and props; the kit's
  // props bundle only gives what lies on the ground (a purse, draughts, a pouch)
  lib = await new Library(renderer, { normals: HI }).load();
  kit = await new Kit(renderer, scene, physics, { normals: HI, shadows: HI, packs: ['props'] }).load();
  const b = new Builder(physics);
  bill = new Billboards(lib, scene);
  bill.shadows = HI;
  const props = new Props(scene, physics, lib);
  ctx = { lib, kit, b, props, bill, scene, physics, flames: [], chimneys: [], sfx, animated: [] };
  ctx.stained = await new StainedGlass(ctx).load(); // the windows, and the light through them
  ctx.cutouts = await new Cutouts(ctx).load();      // the biome packs' arches and gateways
  physics.terrain = terrainHeight; // the downs; flat ground everywhere else
  ctx.doors = new Doors(ctx);
  ctx.scatter = new Scatter3D(ctx);
  ctx.trees3d = new Trees3D(ctx);
  // every scatter sprite that isn't a plant is built as a 3D model instead
  bill.redirect = (id, x, y, z, sc) => {
    const s = lib.spr.get(id);
    if (!s || s.category !== 'scatter' || isVegetation(id)) return false;
    ctx.scatter.place(id, x, y, z, sc);
    return true;
  };
  await mark('library');
  buildWorld(ctx); await mark('world');
  // the Undercroft and the Deep Undercroft below it, the Darkwood's delves and the cliff's caves
  ctx.entrances = [[STAIRS.x, STAIRS.z]];
  ctx.dungeon = buildDungeon(ctx, ctx.stairBottom, UNDERCROFT);
  ctx.deep = buildDungeon(ctx, ctx.dungeon.stairDown, DEEP_UNDERCROFT);
  ctx.unders = [{ dg: ctx.dungeon, haunt: 'undercroft', n: DUNGEON_DEAD }, { dg: ctx.deep, haunt: 'deep', n: DEEP_DEAD }, ...buildDelves(ctx)];
  await mark('dungeon');
  // what lies wholly under the ground (the dungeons' rooms; not the flights down to them) is drawn
  // only from below
  ctx.builtUnder = b.finish(scene).filter((m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox.max.y < -1; });
  await mark('merge');
  bill.finish(); await mark('billboards');
  ctx.trees3d.finish(scene); await mark('trees');
  await props.finish();
  ctx.loot = new Loot(ctx, { char: () => char });      // (its hooks are filled in once the hands are made)
  ctx.containers = ctx.loot.findProps(props);          // the chests, crates, barrels and sarcophagi
  await mark('props');
  ctx.stained.applyTo(scene);
  if (ctx.scatter.unmatched.size) console.info('scatter without a model of its own:', [...ctx.scatter.unmatched].join(' '));
  console.info(`3D scatter models: ${ctx.scatter.count}; textures: ${lib.used.size}/${lib.surf.size} surfaces, ${lib.usedSprites.size}/${lib.spr.size} sprites in use; ${ctx.containers} containers`);
  flameList = [...props.lights, ...ctx.flames];
  flames = new Flames(scene, flameList);
  skyDome = new Sky(scene);
  shafts = new Shafts(scene, ctx.stained.shafts());
  const indoors = ctx.zones.filter((z) => z.x0 > GRAVEYARD.x0 - 4 && z.x1 < GRAVEYARD.x1 + 4 && z.z0 > GRAVEYARD.z0 - 4 && z.z1 < GRAVEYARD.z1 + 4);
  mist = new Mist(scene, [GRAVEYARD.x0 - 4, GRAVEYARD.z0 - 4, GRAVEYARD.x1 + 4, GRAVEYARD.z1 + 4],
    { exclude: indoors.map((z) => [z.x0, z.z0, z.x1, z.z1]) });
  smoke = new Smoke(scene);
  for (const [x, y, z] of ctx.chimneys) smoke.addEmitter(x, y, z, 2.5);

  const manifest = await (await fetch('templates/models/manifest.json')).json();
  useManifest(manifest);
  fitCharacter(char); saveCharacter(char);   // its arms' models, and the basic sword, shield and staff
  vm = new ViewModel(manifest, kit);
  await vm.load(char.equip.hands?.model || 'bare');
  vmPass.scene = vm.scene; vmPass.camera = vm.camera;
  // what lies about to be taken up, and what the chests, crates, barrels and sacks hold
  Object.assign(ctx.loot.hooks, {
    models: lootModel,
    zone: (p) => ({ under: p.y < terrainHeight(p.x, p.z) - 3 }),
    onTake: (it, what) => { sfx.equip(); hud.toast(`You take up ${what}`); saveCharacter(char); bag.render(); },
    full: () => hud.toast('Your bag is full'),
  });
  await mark('arms');
  await mark('icons');
  player = new Player(physics, camera, { contains: ctx.inBounds });
  await applyGear(true);
  magic = new Magic(scene, physics, sfx, { shadows: HI, smoke });
  zombies = new Zombies(scene, physics, kit, sfx);
  await zombies.load(); await mark('zombies');
  const G = GRAVEYARD;
  zombies.populateYard(G, YARD_DEAD, YARD_BURIED, [-7, G.z0 + 3, 7, G.z0 + 17]); // not in the mausoleum
  // every place below ground, and out in the world the dead about the water, the bridge, the
  // cliff and the deep of the wood (a phone gets half)
  const few = (n) => (touch && !HI ? Math.ceil(n / 2) : n);
  for (const u of ctx.unders) {
    if (u.plan) zombies.populateCave(u.dg, u.plan.map(([tag, n, haunt]) => [tag, few(n), haunt]));
    else zombies.populateDungeon(u.dg, few(u.n), u.haunt);
  }
  const awayFromHomes = (x, z) => Math.hypot(x, z) > VILLAGE_R + 25 && ctx.inBounds(x, z);
  zombies.populateWild([
    { x: POOL.x - 14, z: POOL.z + 18, r: 10, n: few(3), haunt: 'water' },                       // the falls' pool
    ...[3, 6, 8, 10].map((i) => ({ x: STREAM[i][0], z: STREAM[i][1], r: 7, n: few(2), haunt: 'water' })),   // down the stream
    { x: 596, z: 36, r: 4, n: 1, haunt: 'troll' },                                               // under the bridge
    { x: 712, z: 150, r: 12, n: few(2), haunt: 'troll' },                                       // before the Trollhole
    { x: 200, z: 34, r: 18, n: few(2), haunt: 'wood', ok: awayFromHomes },                       // the Darkwood about the trail
    { x: -150, z: -170, r: 24, n: few(3), haunt: 'wood', ok: awayFromHomes },
    { x: -205, z: 86, r: 18, n: few(3), haunt: 'barrow', ok: awayFromHomes },                    // about the Barrow
    { x: 130, z: 222, r: 14, n: few(2), haunt: 'cellars', ok: awayFromHomes },                   // about the Cellars
    { x: 230, z: -120, r: 20, n: few(2), haunt: 'fungal', ok: awayFromHomes },
  ]);
  zombies.onPlayerHit = hurtPlayer;
  foes = new Foes(zombies, manifest, ctx);   // dark knights and sorcerers abroad, ghasts and grubbers in the cave
  await foes.load(); foes.populate(ctx);
  // the people of the village (tools/villagers' men and women), fewer on a phone; they load in the
  // background and walk out of their doors as they arrive
  villagers = new Villagers(scene, ctx);
  villagers.camera = camera;
  villagers.onLoading = (p) => { run.bringing = p?.name || ''; trace(); };   // who is coming in (null: they're in)
  villagers.populate(touch && !HI ? 10 : 22);
  await mark('foes');
  magic.hitTest = (p, d, far) => zombies.ray(p, d, far);
  magic.onHit = (def, at, d, h) => h.z.hit(h, { dmg: spellDamage(def), dir: d, heavy: def.size > 0.4, kind: def.kind });
  magic.onBlast = (def, at) => {
    const b = SPELL_BLAST[def.kind];
    if (b) zombies.blast(at, b[0], b[1], def.kind);
    zombies.noise(at, def.size > 0.4 ? 26 : 16);   // the dead hear it go off
  };

  bag = new Bag(ui, {
    char: () => char, stats: () => st, player: () => player, icon: itemIcon, toast: (t) => hud.toast(t),
    onChange: () => applyGear(), onUse: drinkAt, onDrop: dropFromBag,
    spells: SPELLS, spellIcons: hud.spellIcons, book: () => book, onAssign: assign, onClose: () => setInventory(false),
  });
  hud.refresh(vm.equip, book);
  map = new WorldMap(ui, ctx, { touch, onClose: () => setMap(false) });
  vm.on(onEvent);
  resize();
  ready = true; run.step = 'loaded';
}

/** A small picture of an arm model for the bag, rendered from the model itself. */
const iconRT = { rt: null, sc: null, cv: null };
function renderIcon(obj) {
  const S = 96;
  if (!iconRT.rt) {
    iconRT.rt = new THREE.WebGLRenderTarget(S, S);
    iconRT.sc = new THREE.Scene();
    iconRT.sc.add(new THREE.HemisphereLight(0xfff0dd, 0x403848, 2.0));
    iconRT.key = new THREE.DirectionalLight(0xffe8c8, 3.2); iconRT.sc.add(iconRT.key, iconRT.key.target);
    iconRT.cv = document.createElement('canvas'); iconRT.cv.width = iconRT.cv.height = S;
  }
  const { rt, sc, cv } = iconRT, g = cv.getContext('2d'), buf = new Uint8Array(S * S * 4);
  const tm = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  const holder = new THREE.Group();
  holder.add(obj);
  sc.add(holder);
  let box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  const thin = ['x', 'y', 'z'].reduce((a, k) => (size[k] < size[a] ? k : a), 'x');
  const long = size.y > 2.2 * Math.max(size.x, size.z);
  // the arms are held blade up with their edges along z (their flat to x), shields face -z:
  // look at a blade's flat and a shield's face. Blades and staves lie corner to corner.
  if (long) holder.rotation.x = Math.PI / 4;
  box = new THREE.Box3().setFromObject(holder);
  const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  const r = Math.max(sz.x, sz.y, sz.z) * 0.56;
  const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.01, 20);
  const dir = long ? new THREE.Vector3(1, 0.12, -0.2) : thin === 'z' ? new THREE.Vector3(0.2, 0.25, -1) : new THREE.Vector3(1, 0.25, -0.3);
  cam.position.copy(c).addScaledVector(dir.normalize(), 5);
  cam.lookAt(c);
  iconRT.key.position.copy(c).addScaledVector(dir, 3).add(new THREE.Vector3(0, 2, 0)); iconRT.key.target.position.copy(c);
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(sc, cam);
  renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf);
  renderer.setRenderTarget(null);
  renderer.toneMapping = tm;
  sc.remove(holder);
  // (the target holds linear light: brought to sRGB for the page)
  const lut = iconRT.lut ||= Uint8Array.from({ length: 256 }, (_, i) => { const c = i / 255; return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)); });
  for (let i = 0; i < buf.length; i += 4) { buf[i] = lut[buf[i]]; buf[i + 1] = lut[buf[i + 1]]; buf[i + 2] = lut[buf[i + 2]]; }
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) img.data.set(buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
  g.clearRect(0, 0, S, S);
  g.putImageData(img, 0, 0);
  return cv.toDataURL();
}

const icons = new Map();   // model|finish -> data URL ('' while it's being made)
function itemIcon(it, again) {
  if (!it.model || it.kind === 'gauntlet') return null;
  const key = it.model + '|' + (it.finish || '');
  if (icons.has(key)) return icons.get(key) || null;
  icons.set(key, '');
  vm.modelScene(it.model, it.finish).then((obj) => { icons.set(key, renderIcon(obj)); again?.(); });
  return null;
}

/** What a thing lying on the ground looks like: its own model for an arm, else a sack, a purse
 * of coin or a flask. */
async function lootModel(it) {
  if (it.type === 'gear' && it.model && it.kind !== 'gauntlet') {
    const o = await vm.modelScene(it.model, it.finish);
    const g = new THREE.Group(); g.add(o);
    o.rotation.z = /shield/.test(it.kind) ? 0 : 0.5;
    const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3());
    o.position.sub(c);
    return g;
  }
  const id = it.type === 'gold' ? 'props/Coin_Pile' : it.type === 'potion' ? (it.kind === 'mana' ? 'props/Potion_2' : 'props/Potion_1') : 'props/Pouch_Large';
  const m = kit.mesh(id);
  m.scale.setScalar(it.type === 'potion' ? 2.2 : it.type === 'gear' ? 2.4 : 1.4);
  m.position.y = -0.35;
  return m;
}

// ------------------------------------------------------------------ equipment and spells
let equipping = Promise.resolve();
/** Put what the character wears into the hands (and the gauntlets onto them), and take its
 * numbers: life, mana, regeneration, speed, the shield's Guard. */
function applyGear(first = false) {
  equipping = equipping.then(async () => {
    st = computeStats(char);
    const w = char.equip.weapon, o = char.equip.offhand;
    if (w) vm.setArm(w.kind, w.model, w.name, w.finish);
    if (o) vm.setArm(o.kind, o.model, o.name, o.finish);
    vm.equip.R = w ? w.kind : null;
    vm.equip.L = o && w?.kind !== 'twohand' ? o.kind : null;
    vm.blocking = false;
    pending.R = pending.L = null;
    magic?.endCharge();
    player.maxHealth = st.maxLife; player.maxMana = st.maxMana;
    if (first) { player.health = st.maxLife; player.mana = st.maxMana; }
    player.health = Math.min(player.health, st.maxLife); player.mana = Math.min(player.mana, st.maxMana);
    player.lifeRegen = st.lifeRegen; player.manaRegen = st.manaRegen; player.speedMul = 1 + st.moveSpeed / 100;
    guard.max = st.shield?.guard || 0;
    guard.v = first ? guard.max : Math.min(guard.v, guard.max);
    const g = char.equip.hands?.model || 'bare';
    if (vm.gauntlet !== g) await vm.load(g); else await vm.applyEquip();
    if (!first) sfx.equip();
    hud.refresh(vm.equip, book);
    saveCharacter(char);
  });
  return equipping;
}

/** The quick keys: the first thing of that kind in the bag into its hand (or, if it's already
 * held, back into the bag). */
function equip(kind) {
  const slot = /shield/.test(kind) ? 'offhand' : 'weapon';
  if (char.equip[slot]?.kind === kind) { bag.unequip(slot); return; }
  const i = char.bag.findIndex((b) => b?.type === 'gear' && b.kind === kind);
  if (i < 0) { hud.toast(`No ${ITEMS[kind]?.type || kind} in the bag`); return; }
  bag.equipFromBag(i, slot);
  hud.toast(`${char.equip[slot].name} in hand`);
}

/** Drink a draught: Q for healing, Z for mana (or double-click it in the bag). */
function drink(kind) {
  const i = char.bag.findIndex((b) => b?.type === 'potion' && b.kind === kind);
  if (i < 0) { hud.toast(kind === 'life' ? 'No healing draughts' : 'No mana draughts'); return; }
  drinkAt(i);
  bag.render();
}
function drinkAt(i) {
  const it = char.bag[i];
  if (!it || it.type !== 'potion') return;
  if (it.kind === 'life') player.healing += 45; else player.mana = Math.min(player.maxMana, player.mana + 50);
  if (--it.count <= 0) char.bag[i] = null;
  sfx.cast?.('heal');
  hud.toast(it.kind === 'life' ? 'You drink a healing draught' : 'You drink a mana draught');
  saveCharacter(char);
}

/** Out of the bag onto the ground in front of you. */
function dropFromBag(i) {
  const it = char.bag[i];
  if (!it) return;
  char.bag[i] = null;
  const f = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const d = ctx.loot.spawn(it, player.pos.x + f.x * 1.6, player.pos.y + 1.2, player.pos.z + f.z * 1.6, { pop: true });
  d.age = -1.5;   // not taken straight back up
  saveCharacter(char);
}

function assign(id, slot) {
  const other = slot === 'F' ? 'R' : 'F';
  if (book[other] === id) book[other] = book[slot];
  book[slot] = id;
  localStorage.setItem('bm.book', JSON.stringify(book));
  hud.refresh(vm.equip, book);
}

/** A melee blow's damage: the weapon's roll, what's worn, and now and then a critical. */
const stats = {
  crit: false,
  meleeDamage(heavy, side) {
    const w = char.equip.weapon, d = w?.dmg || st.weapon;
    let x = (d[0] + Math.random() * (d[1] - d[0]) + st.dmg) * (1 + st.dmgPct / 100);
    this.crit = Math.random() * 100 < st.crit;
    if (this.crit) x *= 1 + st.critDmg / 100;
    if (st.lifeSteal) player.health = Math.min(player.maxHealth, player.health + x * st.lifeSteal / 100);
    return x;
  },
};
/** A spell's damage: its own, the wand's or staff's for their bolts, and the spell bonus. */
function spellDamage(def) {
  const w = char.equip.weapon;
  const base = (def.kind === 'arcane' || def.kind === 'staff') && w?.dmg ? w.dmg[0] + Math.random() * (w.dmg[1] - w.dmg[0]) : SPELL_DMG[def.kind] ?? 30;
  return base * (1 + st.spellPct / 100);
}

function castSlot(slot) {
  const def = SPELLS[book[slot]];
  if (!def || vm.busy('R') || vm.busy('L') || vm.blocking) return;
  if (player.mana < def.mana) { noMana(); return; }
  // a spell with a charge holds the cast just before it leaves the hand until it has gathered
  const side = vm.cast(def, { charge: !!def.charge });
  if (!side) return;
  player.mana -= def.mana;
  pending[side === 'both' ? 'R' : side] = { def, both: side === 'both', id: book[slot], side, charge: def.charge || 0, t: 0 };
  if (def.charge) sfx.chargeUp?.(def.charge);
}

/** A blow (or a spell: kind 'spell') lands on you from `by`. A raised shield with Guard left
 * stops most of a blow from the front: the Guard pays for what it stops, and when it's gone the
 * guard breaks and the shield stops nothing until it has come back (it only comes back while
 * the shield is down). Its enchantments answer whoever struck it. Armour takes its share of
 * whatever gets through. If it kills you, you wake in the village. */
function hurtPlayer(dmg, by = null, kind = 'melee') {
  let d = dmg;
  const sh = st.shield;
  let front = true;
  if (by?.pos) {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), dx = by.pos.x - player.pos.x, dz = by.pos.z - player.pos.z;
    front = (fx * dx + fz * dz) / (Math.hypot(dx, dz) || 1) > 0.25;
  }
  if (vm.blocking && sh && !guard.broken && guard.v > 0 && front && (kind !== 'spell' || st.enchants.ward)) {
    const stop = d * sh.block;
    guard.v -= stop;
    guard.wait = 0.7;
    d -= stop;
    if (guard.v <= 0) {           // what the Guard couldn't pay for comes through
      d += -guard.v; guard.v = 0; guard.broken = true;
      hud.toast('Your guard is broken!'); hud.flashGuard();
      shake = Math.max(shake, 1.2);
    }
    sfx.clang(false);
    magic.particles.burst(fromView(vm.castPoint('L'), 0.6), [new THREE.Color('#fff0b0'), new THREE.Color('#ffb040'), new THREE.Color('#d0d0d0')], 16,
      { speed: 4, size: 0.03, grav: 9, life: 0.4 });
    if (by && kind === 'melee' && !by.dead) answerBlow(by);
    shake = Math.max(shake, 0.35);
  } else {
    shake = Math.max(shake, 0.9);
    sfx.clang(true);
  }
  d *= 1 - armorCut(st.armor);
  player.health -= d;
  if (player.health <= 0) {
    player.health = player.maxHealth;
    player.pos.set(0, 0, 12); player.vel.set(0, 0, 0);
    zombies.forget();
    hud.toast('Torn apart by the dead... you wake in the village');
  }
}

/** The shield's enchantments, on whatever struck it. */
function answerBlow(by) {
  const e = st.enchants;
  const away = new THREE.Vector3(by.pos.x - player.pos.x, 0, by.pos.z - player.pos.z).normalize();
  const chest = by.bones?.chest;
  if (e.thorns && chest) by.hit({ bone: chest, point: chest.getWorldPosition(new THREE.Vector3()), z: by }, { dmg: e.thorns, dir: away, kind: 'thorns', push: 0.15 });
  if (e.frost) { by.chillT = 3.5; magic.particles.burst(by.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), [new THREE.Color('#bfe8ff'), new THREE.Color('#5aa8e8')], 20, { speed: 2, size: 0.03, grav: 2, life: 0.8 }); }
  if (e.fire) { by.burnT = 3; by.burnDps = e.fire; }
  if (e.holy) player.healing += e.holy;
  if (e.repel) { by.knock = away.clone().multiplyScalar(7); by.stagger = 0.6; }
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
    melee(clip.startsWith('r2h') ? 3.5 : 2.9, clip.startsWith('r2h'), side);
  }
}

// the weapons that crush rather than cut (no gash: a split in the flesh where they land)
const BLUNT = /mace|hammer|club|morning_star|maul|tombstone|crook|staff|orb|crosier/;
/** A swing landing: the nearest thing in reach across the blade's arc gets sparks or chips. */
function melee(reach, heavy, side = 'R') {
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
    const it = ITEMS[vm.equip[side]] || ITEMS[vm.equip.R];
    // the edge's sweep across the view: a rising diagonal for a one-hander, flatter for a two
    const right = _v.set(1, 0, 0).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const edge = right.clone().multiplyScalar(heavy ? 0.94 : 0.82).addScaledVector(up, (heavy ? -0.34 : 0.57) * (side === 'L' ? -1 : 1)).normalize();
    const blunt = BLUNT.test(it?.id || '');
    const dmg = stats.meleeDamage(heavy, side);
    flesh.z.hit(flesh, { dmg, dir: flesh.d, heavy, kind: blunt ? 'blunt' : 'blade', edge: blunt ? null : edge, push: (heavy ? 0.8 : 0.45) * (blunt ? 1.4 : 1) });
    zombies.noise(o, 14);
    shake = heavy ? 1.0 : 0.6;
    return;
  }
  if (!best) return;
  zombies.noise(o, 14);   // steel on stone carries
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
  for (const u of ctx.unders) if (u.dg.contains(p)) return { name: u.dg.name, kind: 'under' };
  if (p.y < terrainHeight(p.x, p.z) - 1.5 && p.x < REGION.x0) return { name: 'The Undercroft', kind: 'under' };
  if (p.x > REGION.x0) {   // the downs: see a long way
    for (const z of ctx.zones) if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1 && p.y < z.y1 && p.y > z.y0) return { name: z.name, kind: 'in', open: 1 };
    for (const [x, z, r, name] of Object.values(SPOTS)) if (Math.hypot(p.x - x, p.z - z) < r) return { name, kind: 'out', open: 1 };
    return { name: 'The Green Downs', kind: 'out', open: 1 };
  }
  if (p.x > 110 && Math.abs(p.z) < 8) return { name: 'The Bellwood Trail', kind: 'out' };
  for (const z of ctx.zones) if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1 && p.y < z.y1) return { name: z.name, kind: 'in' };
  if (p.x > GRAVEYARD.x0 && p.x < GRAVEYARD.x1 && p.z > GRAVEYARD.z0 && p.z < GRAVEYARD.z1) return { name: 'The Bellmourn Graveyard', kind: 'out' };
  if (Math.hypot(p.x, p.z) > VILLAGE_R + 10) return { name: 'The Darkwood', kind: 'out' };
  return { name: 'Bellmourn', kind: 'out' };
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
  scene.fog.far = ((isDay ? 300 : 170) + (isDay ? 420 : 140) * L.open) * surface * (touch ? 0.75 : 1) + 46 * L.under;   // (a phone draws less of the distance)
  skyDome.update(day, t, camera.position, surface);
  bill.light.value.copy(hemi.color).multiplyScalar(hemi.intensity * 0.55 + sun.intensity * 0.22 * L.out);
  bill.time.value = t;
  bill.sunDir.value.copy(ld);
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
  if (lost) { location.reload(); return; }
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

function setMap(on) {
  map.show(on, player);
  if (on && bag.open) bag.show(false);
  if (touch) { gameInput.release(); }
  else if (on) document.exitPointerLock?.(); else canvas.requestPointerLock?.();
}

function setInventory(on) {
  if (on && map.open) map.show(false);
  bag.show(on);
  if (touch) { hud.showTouch(!on); gameInput.release(); } // the thumb controls would lie over the bag
  if (on) { document.exitPointerLock?.(); hud.refresh(vm.equip, book); }
  else if (!touch) canvas.requestPointerLock?.();
}

function pause() {
  paused = true;
  bag?.show(false); map?.show(false);
  hud.showOverlay('pause', touch);
  if (touch) { hud.showTouch(false); gameInput.release(); }
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && started && !bag?.open && !map?.open) pause();
});

// ------------------------------------------------------------------ the loop
const clock = new THREE.Clock();
let t = 0, lastBob = 0, shadowFrame = 0, mapT = 0;
const QUICK = { Digit1: 'onehand', Digit2: 'twohand', Digit3: 'wand', Digit4: 'staff', Digit5: 'shield_round', Digit6: 'shield_kite' };

let lastFrame = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  frameMs += (Math.min(100, now - lastFrame) - frameMs) * 0.05;
  lastFrame = now;
  if (ready && started && !paused && (rsT += 1) > 90) {   // every second and a half or so
    rsT = 0;
    const want = frameMs > 26 ? Math.max(0.55, rs * 0.88) : frameMs < 18 ? Math.min(1, rs * 1.07) : rs;
    if (Math.abs(want - rs) > 0.01) { rs = want; resize(); }
  }
  tick(Math.min(0.05, clock.getDelta()));
}

/** One frame of the game: input, the player, hands, magic, light, then the picture. */
function tick(dt) {
  t += dt;
  if (!ready) return;
  const inp = gameInput;
  const active = started && !paused && !bag.open && !map.open;

  if (started && (inp.was('Tab') || inp.was('KeyI'))) setInventory(!bag.open);
  if (started && !paused && inp.was('KeyM')) setMap(!map.open);
  if (started && inp.was('Escape')) { if (bag.open || map.open) { bag.show(false); map.show(false); pause(); } else if (touch) pause(); }
  if (active) {
    player.update(dt, inp);
    for (const [code, kind] of Object.entries(QUICK)) if (inp.was(code)) equip(kind);
    if (inp.was('KeyQ')) drink('life');
    if (inp.was('KeyZ')) drink('mana');
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
  // spells gathering in the hand before they leave it; a charged one holds there, growing,
  // until it's ready, then the cast plays on and lets it go
  for (const side of ['R', 'L']) {
    const p = pending[side], st = vm.state[p?.both ? 'R' : side];
    if (!p || !st) continue;
    const at = fromView(castFrom(p), 0.75);
    magic.charge(at, p.def, dt);
    if (p.charge) {
      p.t += dt;
      magic.chargeBall(at, p.def, Math.min(1, p.t / p.charge), dt);
      if (p.t >= p.charge) { p.charge = 0; for (const s2 of ['R', 'L']) if (vm.state[s2]) vm.state[s2].hold = null; magic.endCharge(); }
    }
  }
  // doors: the one you're looking at, and E to open or close it
  // and the chest, crate, barrel or sack you're looking at, to search with E
  if (active) {
    const door = ctx.doors.aimed(camera), box = ctx.loot.aimed(camera);
    const boxFirst = box && (!door || box.x !== undefined && camera.position.distanceTo(_v.set(box.x, box.y, box.z)) < camera.position.distanceTo(door.center));
    if (boxFirst) {
      hud.prompt(box.searched ? `The ${box.holds.name} is empty` : `E — search the ${box.holds.name}`);
      if (!box.searched && inp.was('KeyE')) {
        const n = ctx.loot.search(box, player);
        sfx.door?.(true);
        if (!n) hud.toast(`Nothing in the ${box.holds.name}`);
      }
    } else {
      hud.prompt(door ? `E — ${door.open ? 'close' : 'open'} the ${door.name}` : '');
      if (door && inp.was('KeyE')) ctx.doors.toggle(door);
    }
  } else hud.prompt('');
  // the shield's Guard: it comes back (quickly) only while the shield is down
  if (guard.max) {
    if (vm.blocking) guard.wait = Math.max(guard.wait, 0.25);
    else if ((guard.wait -= dt) <= 0 && guard.v < guard.max) {
      guard.v = Math.min(guard.max, guard.v + guard.max * 0.45 * (st.shield?.regen || 1) * dt);
      if (guard.broken && guard.v >= guard.max * 0.5) { guard.broken = false; hud.toast('Your guard is back'); }
    }
  }
  hud.guard(guard, vm.blocking);
  ctx.doors.update(dt);
  if (active) ctx.loot.update(dt, player);
  ctx.trees3d.update(t);
  // what's under the ground: only from below it, or from the head of the stairs down to it
  const cp = camera.position, atStairs = ctx.entrances.some(([x, z]) => Math.hypot(cp.x - x, cp.z - z) < 30);
  for (const m of ctx.builtUnder) m.visible = cp.y < 0.5 || atStairs;
  for (const f of ctx.animated) f(dt, t);
  zombies.update(dt, player, active, camera, H, 0.3 + 0.7 * day.day);
  foes.update(dt, player);
  for (const c of ctx.caves) if (c !== foes.cave) c.update(dt, player);   // (the Gloamhollow is the foes')
  villagers.update(dt, player, hour, (p) => zombies.list.some((z) => !z.dead && !z.gone && z.standing && (z.aggro || z.kindName === 'knight' || z.kindName === 'sorcerer') && Math.abs(z.pos.x - p.x) < 14 && Math.abs(z.pos.z - p.z) < 14));
  ctx.water?.update(dt, t, 0.3 + 0.7 * day.day, smoke);
  magic.update(dt, camera, H, player);
  flames.update(t, camera, H);
  smoke.update(dt, camera, H, 0.25 + 0.75 * day.day * (1 - L.under) + 0.1);
  light(dt, t);
  hud.update(player, book);
  if (started && ((mapT += dt) > 0.1 || map.open)) { mapT = 0; map.update(player); }   // the corner map ten times a second

  vmPass.enabled = started; // no arms behind the title screen
  if (touch && HI) renderer.shadowMap.needsUpdate = (++shadowFrame & 1) === 0 || magic.lights.some((l) => l.light.intensity > 0);
  composer.render(dt);
  if (++run.frames % 30 === 1) trace();
  inp.endFrame();
}

// ------------------------------------------------------------------ go
hud = new Hud(ui, { spells: SPELLS, items: ITEMS });
try { Object.assign(book, JSON.parse(localStorage.getItem('bm.book') || '{}')); } catch { /* first visit */ }
hud.showOverlay('loading', touch);
if (lastRun) hud.lastRun(lastRun);
gameInput = new Input(canvas, ui);
// a phone can take the GPU back (short of memory, or the browser put away): start over on a tap
canvas.addEventListener('webglcontextlost', () => {
  lost = true; ready = false;
  bag?.show(false); hud.showTouch(false);
  hud.showOverlay('lost', touch);
});
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
  window.bellmourn = { scene, camera, renderer, composer, player, vm, magic, physics, ctx, lib, bill, kit, zombies, foes, villagers, char: () => char, guard, bag, map, setInventory, setMap, hurtPlayer, applyGear, melee, equip, assign, castSlot, hud, begin, L,
    setHour: (h) => { hour = h; }, get hour() { return hour; }, torchPool, sun, hemi, bloom, grade, tick };
  document.getElementById('boot')?.remove();
}).catch((e) => {
  console.error(e);
  window.bootError = e;
  hud.overlay.querySelector('.go').textContent = 'Failed to load: ' + e.message;
});
frame();
