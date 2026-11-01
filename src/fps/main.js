// Bellmourn: the village, the cathedral, the graveyard and the dungeon under it, walked in
// first person with the approved arm rigs. One of each weapon type in the bag, spells on F
// and R. Mouse and keyboard on desktop; a thumb stick and buttons in landscape on phones.
//
// Rendering (engine.js): the screen's own resolution with 4x multisampling, texels crisp but
// anti-aliased, Phong surfaces with GPU-made normal maps, a sun (or moon) whose shadow map
// follows you, the nearest torches casting their own shadows, spells as moving shadow-casting
// lights, bloom, tone mapping and a light grade. The dungeon has no ambient light at all:
// only the torches on its walls (and whatever you cast) light it. Everything is loaded,
// uploaded and compiled before play (prepare).
import * as THREE from 'three';
import { makeRenderer, multisample, refineScene, visibleMatrices, DetailCull, settled, texturesOf, upload, compile, Resolution, TEXELS, groundMist } from './engine.js';
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
import { buildCatacombs } from './catacombs.js';
import { buildDelves } from './delves.js';
import { Input, TOUCH } from './input.js';
import { Player, EYE } from './player.js';
import { ViewModel, ITEMS } from './viewmodel.js';
import { SPELLS, BOLTS, Magic, Flames } from './spells.js';
import { Sky, Shafts, Mist, Smoke, dayState } from './effects.js';
import { Hud, SPELL_KEYS } from './hud.js';
import { voice } from './voice.js';
import { Chatter } from './chatter.js';
import { Doors } from './doors.js';
import { Scatter3D, isVegetation } from './scatter3d.js';
import { Trees3D } from './trees3d.js';
import { Cutouts } from './cutout.js';
import { Loot } from './loot.js';
import { useManifest, loadCharacter, saveCharacter, computeStats, fitCharacter, newCharacter, addToBag, slotFor, makeGear, makePotion } from './gear.js';
import { Bag, armorCut } from './bag.js';
import { terrainHeight, REGION, POOL, STREAM, streamAt, streamLevel, riverAt, riverLevel } from './terrain.js';
import { SPOTS } from './region.js';
import { title } from './title.js';   // (the title screen: up before any of this has loaded; it has the sounds)
import { Zombies } from './zombies.js';
import { Foes } from './foes.js';
import { Slimes } from './slimes.js';
import { Villagers } from './villagers.js';
import { buildKeep } from './keep.js';
import { WorldMap } from './map.js';
import { StainedGlass } from './glass.js';
import { Crater, CRATER, CRATER_ARMS, formCrater } from './crater.js';
import { Intro } from './intro.js';
import { Ambience } from './ambience.js';
import { Quests, GIVERS } from './quests.js';
import { SaveMenu, SLOT_COUNT, readSlot } from './saves.js';
import { grantXp, xpFor, xpToNext, fitLevel, MAX_LEVEL } from './level.js';
import { makeUnique } from './uniques.js';
import { Fireflies } from './polish.js';
import { Tufts } from './grass.js';

const touch = TOUCH;
// mist lying on the graveyard's ground (in the fog shader, so made before anything is compiled)
groundMist([GRAVEYARD.x0, GRAVEYARD.z0, GRAVEYARD.x1, GRAVEYARD.z1], { density: 0.055 });
// the mouse captured for looking (a refusal, say from a window in the background, is no matter)
const lockPointer = () => { try { document.getElementById('game').requestPointerLock?.()?.catch?.(() => {}); } catch { /* not now */ } };
const QUALITY = localStorage.getItem('bm.quality') || (touch ? 'low' : 'high');
const HI = QUALITY === 'high';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
const renderer = makeRenderer(canvas, { touch });
const res = new Resolution({ touch });
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

// the green star's light: it rides the comet down in the opening, then glows in the crater
const cometLight = new THREE.PointLight(0x50ff80, 0, 30, 1.4);
scene.add(cometLight);
// underground, a faint warm fill about you (no shadows), so the walls and floor a few steps off can
// be made out between the torches: the dark stays dark
const lantern = new THREE.PointLight(0xffd2a0, 0, 7, 2);
scene.add(lantern);

const sfx = title.sfx;
// the voices play through the game's own sound, and are fetched from the start (the model and every
// voice in it: voice.js); a new game waits for them, so the village speaks to you as you wake
voice.useSound(sfx);
voice.warm();
// the music (title.js made it: it has the title's song) and the world's own sound (ambience.js)
const music = title.music, ambience = new Ambience(sfx);
ambience.prefetch(['wind_calm', 'wind_forest', 'birds', 'night', 'fire_small', 'fire_medium', 'torch']);
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
let hud, vm, player, magic, flames, skyDome, shafts, mist, smoke, physics, ctx, bill, gameInput, lib, kit, zombies, foes, villagers, slimes;
let quests = null, saves = null, intro = null, introBusy = false, holdHour = false, chatter = null;
// the game under way (besides the character): whether he has come down yet, the quests, where you
// stood and the hour. "Continue" picks it up (bm.progress); the save slots keep copies (saves.js).
const PROGRESS = 'bm.progress';
let progress = (() => { try { return JSON.parse(localStorage.getItem(PROGRESS) || 'null'); } catch { return null; } })();
// the dead: a horde about the graves (kept up by more clawing out of the ground, with a few
// lying buried); the catacombs place their own, each where it would be (catacombs.js), and the
// delves and caves fill theirs (delves.js)
const YARD_DEAD = 40, YARD_BURIED = 10;   // (more of them, and each easier to kill)
// what each kind of spell does to flesh: a direct hit, its blast (radius, damage), and how
// likely a direct hit is to blow off the head or limb it lands on (zombies.js BLOW: by where)
const SPELL_DMG = { fire: 45, frost: 22, lightning: 60, staff: 30, wisp: 25 };
const SPELL_BLAST = { fire: [2.2, 40], lightning: [3.0, 50], frost: [0.8, 10] };
const SPELL_BLOW = { fire: 1, lightning: 1.25, staff: 0.85, frost: 0.5 };
const book = { F: 'firebolt', R: 'mend' };
const pending = { R: null, L: null };
let timeMode = localStorage.getItem('bm.time') || 'cycle';
let hour = { golden: 17.6, noon: 12, night: 23, cycle: 12 }[timeMode] ?? 12;   // (a new game begins at noon)
let started = false, paused = false, lost = false;
let W = 2, H = 2;
let shake = 0, flameList = [], lightTimer = 0;
// the character: what's worn and carried (gear.js), what it adds up to, and the shield's Guard
let char = loadCharacter(), st = computeStats(char), bag = null, map = null;
const guard = { v: 0, max: 0, broken: false, wait: 0 };

// ------------------------------------------------------------------ post-processing
const composer = new EffectComposer(renderer);
composer.setPixelRatio(1);
multisample(composer, renderer, touch ? 2 : 4);   // (the world's buffer: no jagged edges)
res.gpuTimer(renderer);   // (what the picture's size goes by, where the GPU can time itself)
const worldPass = new RenderPass(scene, camera);
const vmPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
vmPass.clear = false; vmPass.clearDepth = true;
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 0.92);
// the grade, last: flashes, the vignette, the red at the edges when hurt, a gentle contrast curve
// and a little sharpening (the picture is full resolution now: no pixel-art dither)
const GRADE = {
  uniforms: { tDiffuse: { value: null }, flash: { value: new THREE.Color() }, flashAmt: { value: 0 },
    hurt: { value: 0 }, texel: { value: new THREE.Vector2(1, 1) }, sharpen: { value: 0.45 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec3 flash; uniform float flashAmt, hurt, sharpen; uniform vec2 texel;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // contrast-adaptive sharpening (after AMD's CAS): crisper detail with no halos on hard edges
      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb, s = texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;
      vec3 e = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb, w = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb;
      vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
      vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
      vec3 k = -amp * 0.2 * sharpen;   // (gentle: crisp texels don't want much more)
      c = clamp((c + (n + s + e + w) * k) / (1.0 + 4.0 * k), 0.0, 1.0);
      c += flash * flashAmt * (0.6 + 0.4 * c);
      float d = distance(vUv, vec2(0.5));
      c *= mix(1.0, smoothstep(0.95, 0.3, d), 0.45);                 // vignette
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.18);                       // a touch more contrast in the mids
      c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))) * vec3(1.2, 0.5, 0.45), hurt * smoothstep(0.2, 0.7, d));
      gl_FragColor = vec4(c, 1.0);
    }`,
};
const grade = new ShaderPass(GRADE);
composer.addPass(worldPass);
composer.addPass(vmPass);
if (HI || QUALITY === 'low') composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.addPass(grade);

// the picture's size (engine.js Resolution): the screen's own, eased down (to 0.6) when frames run
// long and back up when there's time to spare
function resize() {
  [W, H] = res.size();
  renderer.setSize(W, H, false);
  composer.setSize(W, H);
  bloom.setSize(touch ? Math.ceil(W / 2) : W, touch ? Math.ceil(H / 2) : H);
  grade.uniforms.texel.value.set(1 / W, 1 / H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  vm?.resize(W / H);
  hud?.rotate.classList.toggle('show', touch && innerHeight > innerWidth);
}
addEventListener('resize', resize);

// ------------------------------------------------------------------ build everything
// how far through the build each step is (as it runs on a desktop), for the loading line: a
// phone takes a minute or more, and should be seen to be getting on with it
const LOADED = { library: 8, world: 28, props: 34, arms: 52, icons: 54, zombies: 60, foes: 66, people: 80, 'arms ready': 85, uploaded: 92, compiled: 97, warm: 100 };

async function build() {
  const T0 = performance.now(), times = (window.buildTimes = []);
  const mark = async (k) => {
    times.push([k, Math.round(performance.now() - T0)]);
    run.step = `built ${k}`; trace();
    if (LOADED[k]) { title.progress(LOADED[k]); await new Promise((r) => setTimeout(r)); } // let it paint
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
  ctx.tufts = new Tufts();   // (grass at the roads' edges: the builders add, finished with the rest)
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
  // the catacombs under the cathedral (the Undercroft, the Mourning Gulf's floor and the Deep
  // Undercroft: catacombs.js); Blackvigil Keep; the Darkwood's delves and the cliff's caves
  ctx.entrances = [[STAIRS.x, STAIRS.z]];
  ctx.catacombs = buildCatacombs(ctx);
  ctx.dungeon = ctx.catacombs.upper; ctx.deep = ctx.catacombs.deep; await mark('dungeon');
  buildKeep(ctx); await mark('keep');
  ctx.unders = [{ dg: ctx.dungeon, haunt: 'undercroft', cat: true }, { dg: ctx.deep, haunt: 'deep', cat: true }, { dg: ctx.catacombs.gulfDg, haunt: 'undercroft', cat: true }, ...buildDelves(ctx)];
  await mark('delves');
  // what lies wholly under the ground (the dungeons' rooms; not the flights down to them) is drawn
  // only from below
  ctx.built = b.finish(scene);
  ctx.builtUnder = ctx.built.filter((m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox.max.y < -1; });
  ctx.builtUnder.push(...ctx.catacombs.meshes);    // (the bridge and the bell move, so aren't merged)
  await mark('merge');
  bill.finish(); await mark('billboards');
  ctx.trees3d.finish(scene); await mark('trees');
  ctx.tufts.finish(scene);
  await props.finish();
  ctx.loot = new Loot(ctx, { char: () => char });      // (its hooks are filled in once the hands are made)
  ctx.containers = ctx.loot.findProps(props);          // the chests, crates, barrels and sarcophagi
  // a crate broken or a lid swung: the torches near it redraw their shadows (they only do when they move)
  props.onChange = (at) => {
    for (const l of torchPool) if (l.castShadow && l.userData.flame && l.position.distanceToSquared(at) < 17 * 17) l.shadow.needsUpdate = true;
  };
  // a crate, barrel or pot broken: what it held lies where it stood, in a puff of dust or grit
  props.onBreak = (p, at, dir) => {
    ctx.loot.broke(p.id, p.i, dir);
    const clay = /^(jar_|amphora|vase_|urn_|crock_)/.test(p.id);
    // (dust, soft, low and spreading: the pieces themselves are the debris)
    for (let i = 0; i < 6; i++) smoke.emit(at.clone().setY(p.y + 0.15 + Math.random() * 0.3), new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.25, (Math.random() - 0.5) * 1.2), { life: 1.6, size: 0.5, grow: 0.9, alpha: 0.2, shade: clay ? 0.8 : 0.7 });
    sfx.smash?.(clay, at);
    zombies.noise(at, 14);
  };
  ctx.keep.claimChest(ctx.loot);                       // (the Red Throne's, sealed till its lord falls)
  await mark('props');
  ctx.stained.applyTo(scene);
  if (ctx.scatter.unmatched.size) console.info('scatter without a model of its own:', [...ctx.scatter.unmatched].join(' '));
  console.info(`3D scatter models: ${ctx.scatter.count}; textures: ${lib.used.size}/${lib.surf.size} surfaces, ${lib.usedSprites.size}/${lib.spr.size} sprites in use; ${ctx.containers} containers`);
  flameList = [...props.lights, ...ctx.flames];
  flames = new Flames(scene, flameList);
  ctx.flameFx = { fx: flames, list: flameList };   // (for the few flames that move: the bridge's lanterns)
  skyDome = new Sky(scene);
  shafts = new Shafts(scene, ctx.stained.shafts());
  const indoors = ctx.zones.filter((z) => z.x0 > GRAVEYARD.x0 - 4 && z.x1 < GRAVEYARD.x1 + 4 && z.z0 > GRAVEYARD.z0 - 4 && z.z1 < GRAVEYARD.z1 + 4);
  // (the mist on the ground is in the fog shader: engine.js groundMist; these are the wisps drifting over it)
  mist = new Mist(scene, [GRAVEYARD.x0 - 4, GRAVEYARD.z0 - 4, GRAVEYARD.x1 + 4, GRAVEYARD.z1 + 4],
    { exclude: indoors.map((z) => [z.x0, z.z0, z.x1, z.z1]), layers: 2, base: 0.75, height: 0.45, density: 0.16 });
  smoke = new Smoke(scene);
  for (const [x, y, z] of ctx.chimneys) smoke.addEmitter(x, y, z, 2.5);
  // where Tessariel came down: its shards, flames, embers and smoke, and the knight's armour
  ctx.crater = new Crater(ctx);
  ctx.crater.smokers = ctx.crater.smokeSpots.map(([x, y, z]) => { smoke.addEmitter(x, y, z, 1.6); return smoke.emitters[smoke.emitters.length - 1]; });
  ctx.crater.armourReady = ctx.crater.armour().catch((e) => console.warn("the knight's armour", e));   // (the opening waits for it)
  ctx.fireflies = new Fireflies(scene, (x, z) => physics.groundAt(x, z), touch ? 120 : 260);

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
    onTake: (it, what) => { sfx.equip(); hud.toast(`You take up ${what}`); autoEquip(it); saveCharacter(char); bag.render(); if (it?.unique) { try { localStorage.setItem('bm.taken.' + it.unique, '1'); } catch { /* no storage */ } } },
    full: () => hud.toast('Your bag is full'),
  });
  await mark('arms');
  await mark('icons');
  player = new Player(physics, camera, { contains: ctx.inBounds });
  voice.listener = player;            // (how loud each voice is: by how far from you it is)
  player.onFall = (d) => hurtPlayer(d, null, 'fall');
  player.onJump = () => sfx.jump(underfoot(), inMail());
  player.onLand = (k) => sfx.land(underfoot(), inMail(), k);
  sfx.stinger = (k) => music.stinger(k);   // (a quest done: quests.js, through audio.js)      // (a long drop hurts: the gulf)
  await applyGear(true);
  magic = new Magic(scene, physics, sfx, { shadows: HI, smoke });
  zombies = new Zombies(scene, physics, kit, sfx);
  await zombies.load(); await mark('zombies');
  const G = GRAVEYARD;
  zombies.populateYard(G, YARD_DEAD, YARD_BURIED, [-7, G.z0 + 3, 7, G.z0 + 17]); // not in the mausoleum
  // every place below ground, and out in the world the dead about the water, the bridge, the
  // cliff and the deep of the wood (a phone gets half)
  // (more of the dead everywhere than there were, half again on a computer; a phone, fewer)
  const few = (n) => (touch && !HI ? Math.ceil(n * 0.6) : Math.round(n * 1.5));
  for (const u of ctx.unders) {
    if (u.cat) continue;
    if (u.plan) zombies.populateCave(u.dg, u.plan.map(([tag, n, haunt]) => [tag, few(n), haunt]));
    else zombies.populateDungeon(u.dg, few(u.n), u.haunt);
  }
  ctx.catacombs.populate(zombies, few);
  ctx.catacombs.toast = (t) => hud.toast(t);
  const awayFromHomes = (x, z) => Math.hypot(x, z) > VILLAGE_R + 25 && ctx.inBounds(x, z);
  zombies.populateWild([
    { x: POOL.x - 14, z: POOL.z + 18, r: 10, n: few(3), haunt: 'water' },                       // the falls' pool
    ...[3, 6, 8, 10].map((i) => ({ x: STREAM[i][0], z: STREAM[i][1], r: 7, n: few(2), haunt: 'water' })),   // down the stream
    { x: 596, z: 36, r: 4, n: 1, haunt: 'troll' },                                               // under the bridge
    { x: 712, z: 150, r: 12, n: few(2), haunt: 'troll' },                                       // before the Trollhole
    { x: 200, z: 34, r: 18, n: few(2), haunt: 'wood', ok: awayFromHomes },                       // the Darkwood about the trail
    { x: -150, z: -170, r: 24, n: few(3), haunt: 'wood', ok: awayFromHomes },
    { x: -225, z: 122, r: 18, n: few(3), haunt: 'barrow', ok: awayFromHomes },                   // about the Barrow
    { x: 130, z: 222, r: 14, n: few(2), haunt: 'cellars', ok: awayFromHomes },                   // about the Cellars
    { x: 230, z: -120, r: 20, n: few(2), haunt: 'fungal', ok: awayFromHomes },
  ]);
  zombies.onPlayerHit = hurtPlayer;
  zombies.onGrab = () => hud.toast('It has hold of you! Strike it to break free');
  foes = new Foes(zombies, manifest, ctx);   // dark knights and sorcerers abroad, ghasts and grubbers in the cave
  await foes.load(); foes.populate(ctx);
  ctx.foes = foes;
  foes.onBossDown = (f) => { hud.toast(`${f.def.title.split(',')[0]} falls, and the seal on the chest breaks`); shake = 1; sfx.lock(true); music.stinger('triumph'); };
  // the slimes of the caves, the Darkwood's bog, the wet meadow and the falls (slimes.js): they take
  // the dead's blows, blasts and noises through zombies.kin
  slimes = new Slimes(scene, physics, sfx, zombies);
  slimes.populate(ctx, few);
  zombies.kin.push(slimes);
  ctx.slimes = slimes;
  slimes.onPlayerHit = hurtPlayer;
  slimes.onGrab = () => hud.toast('The ooze has closed over you! Strike it, or pull free');
  slimes.fx = { particles: magic.particles, waves: magic.waves, flash: (p, c, k) => magic.flashAt(p, c, k), smoke };
  slimes.loot = ctx.loot;
  // the people of the village (tools/villagers' men and women), fewer on a phone, Velscour's Sworn at
  // the keep, and the open country's knights and sorcerers onto the knight's clips (ual.js): all of
  // them in before play (prepare waits; a phone brings the Sworn once the village is in, and the
  // clips once the Sworn are, so it never holds two loads at once)
  villagers = new Villagers(scene, ctx);
  chatter = new Chatter(zombies);                       // (what the Sworn and the dead say)
  villagers.extraSpeakers = () => chatter.talking();     // (their bubbles drawn with the villagers')
  // a villager's gift: into your bag (or at your feet if it's full), remembered for this game
  villagers.onGift = (id) => {
    const it = makeUnique(id);
    if (!it) return;
    try { localStorage.setItem('bm.taken.gift.' + id, '1'); } catch { /* no storage */ }
    // (into your hands at once; your old weapon goes back in the bag)
    if (addToBag(char, it)) { const i = char.bag.indexOf(it); if (i >= 0) bag.equipFromBag(i, 'weapon'); }
    else { const d = ctx.loot.spawn(it, player.pos.x, player.pos.y + 1, player.pos.z, { pop: true }); d.age = -1.5; }
    hud.announce('A gift from Garrow', it.name);
    hud.toast(`${it.name}: a great sword, swung with both hands`);
    saveCharacter(char); bag.render();
  };
  villagers.camera = camera;
  villagers.onLoading = (p) => { run.bringing = p?.name || ''; trace(); };   // who is coming in (null: they're in)
  villagers.populate(touch && !HI ? 10 : 22);
  const sworn = () => foes.loadSworn(touch ? ['sworn_m', 'sworn_lord'] : undefined).then(() => foes.populateKeep(ctx.keep)).catch((e) => console.warn('the Sworn', e));
  foes.swornReady = touch ? Promise.resolve(villagers.ready).catch(() => {}).then(sworn) : sworn();
  foes.ualReady = (touch ? foes.swornReady : Promise.resolve()).then(() => foes.upgrade()).catch((e) => console.warn('foes: the library', e));
  await mark('foes');
  magic.hitTest = (p, d, far) => zombies.ray(p, d, far);
  magic.hitAll = (p, d, far) => [...zombies.list, ...slimes.list].map((z) => z.ray(p, d, far)).filter(Boolean);
  magic.targets = () => zombies.list.concat(slimes.list);
  magic.nearest = (z, p) => zombies.nearest(z, p);
  // o: what a spell's own blow overrides (dmg, heavy, blow)
  magic.onHit = (def, at, d, h, o = {}) => h.z.hit(h, { dmg: (o.dmg ?? def.dmg ?? spellDamage(def)) * (def.dmg || o.dmg ? 1 + st.spellPct / 100 : 1), dir: d,
    heavy: o.heavy ?? def.size > 0.4, kind: def.kind, blow: o.blow ?? def.blow ?? SPELL_BLOW[def.kind] ?? 0 });
  magic.area = (at, r, dmg, kind) => { const hit = zombies.blast(at, r, dmg, kind); zombies.noise(at, 22); return hit; };
  magic.noise = (at, r) => zombies.noise(at, r);
  magic.onBlast = (def, at) => {
    const b = SPELL_BLAST[def.kind];
    if (b) zombies.blast(at, b[0], b[1], def.kind);
    if (b) ctx.catacombs.bridge.blast(at, b[0] * 2.2, b[1] * 0.12);   // (the bridge is thrown about)
    if (b) ctx.props.blast(at, b[0], b[1]);                           // (crates, barrels and pots near it break)
    zombies.noise(at, def.size > 0.4 ? 26 : 16);   // the dead hear it go off
  };

  bag = new Bag(ui, {
    char: () => char, stats: () => st, player: () => player, icon: itemIcon, toast: (t) => hud.toast(t),
    onChange: () => applyGear(), onUse: drinkAt, onDrop: dropFromBag,
    spells: SPELLS, spellIcons: hud.spellIcons, book: () => book, onAssign: assign, onClose: () => setInventory(false),
  });
  hud.refresh(vm.equip, book);
  map = new WorldMap(ui, ctx, { touch, onClose: () => setMap(false) });
  // the quests (quests.js): who gives them, what's done, the tracker, the log
  quests = new Quests({ ui, ctx, zombies, foes, villagers, sfx, char: () => char, toast: (t) => hud.toast(t), onReward: reward,
    // (a quest giver reads you the quest aloud, in their own voice; closing the window hushes them)
    speak: (name, text) => { const v = villagers.list.find((a) => a.name === name); voice.say(v || { name }, text, { toYou: true, pri: 3, key: name, sex: v && /_f\d/.test(v.m) ? 'f' : 'm', kind: 'villager', pos: v?.pos || player.pos }); },
    hush: () => voice.stop(),
    onOpen: (on) => { if (touch) { hud.showTouch(!on); gameInput.release(); } else if (on) document.exitPointerLock?.(); else if (started && !paused) lockPointer(); },
    onChange: () => { if (quests && villagers) { if (quests.status('undercroft') !== 'available') villagers.postAt = null; } saveProgress(); } });
  villagers.quests = quests;
  map.pins = () => quests.pins(villagers);
  zombies.onDeath = onDeath;
  slimes.onDeath = onDeath;
  // (the save slots open over the title and the pause screen alike: in the title's layer)
  saves = new SaveMenu({ ui: title.modal, snapshot, restore, canSave: () => started && !introBusy, toast: (t) => hud.toast(t),
    onClose: () => { title.refresh(); if (paused || !started) return; if (!touch) lockPointer(); } });
  hud.onMenu = menu;
  title.onMenu = menu;
  vm.on(onEvent);
  resize();
  await prepare(mark);
  ready = true; run.step = 'loaded';
  await rehearse();
  ctx.props.coldStart();   // (the broken pieces' shaders are compiled now: their stand-ins go)
}

/** Every spell cast once and one of the dead cut to pieces, out past the edge of the world where
 * nothing is (and nobody can go): what they make the first time (their shaders, their shadows) is
 * made now, in the loading, and not in your first fight. Everything is put back after. */
async function rehearse() {
  const T0 = performance.now(), p0 = renderer.info.programs.length;
  const was = { started, paused, introBusy, book: { ...book }, mana: player.mana, health: player.health, pos: player.pos.clone(), yaw: player.yaw, pitch: player.pitch };
  const at = new THREE.Vector3(2600, 0, 2600);
  started = true; paused = false; introBusy = true;   // (the hands work; nothing walks, nothing hurts you)
  const quiet = { toast: hud.toast, zone: hud.zone };   // (and nothing is said on screen)
  hud.toast = () => {}; hud.zone = () => {};
  const look = () => { camera.position.set(at.x, physics.groundAt(at.x, at.z) + 1.58, at.z); camera.rotation.set(-0.3, 0, 0, 'YXZ'); camera.updateMatrixWorld(); };
  const step = async (n, dt = 1 / 10) => { for (let i = 0; i < n; i++) { look(); player.pos.set(at.x, physics.groundAt(at.x, at.z), at.z); tick(dt); } await new Promise((r) => setTimeout(r)); };
  try {
    for (const id of Object.keys(SPELLS)) {
      book.F = id; player.mana = 9999;
      for (let i = 0; i < 24 && (vm.busy('R') || vm.busy('L')); i++) await step(1);
      castSlot('F');
      await step(8);
    }
    // one of the dead, cut and burnt and blasted at every part of it until it comes apart (and
    // dropping nothing: zombies.quiet)
    zombies.quiet = true;
    const z = zombies.spawn(null, at.x, at.z - 3.2, { zone: 'wild' });
    await step(2);
    const kinds = [['blade', true], ['blunt', true], ['fire', true], ['lightning', true], ['frost', false]];
    for (let round = 0; round < 2; round++) {
      for (const [k, c] of z.capsules().entries()) {
        const [kind, heavy] = kinds[(k + round) % kinds.length], p = c.a.clone().lerp(c.b, 0.5);
        const dir = p.clone().sub(camera.position).normalize();
        if (!z.gone) z.hit({ bone: c.bone, point: p, z }, { dmg: 45, dir, heavy, kind, edge: kind === 'blade' ? new THREE.Vector3(1, 0.4, 0).normalize() : null, push: 0.2, blow: 2 });
      }
      await step(4);
    }
    await step(20);
    z.gone = true; z.root.removeFromParent();
    zombies.list.splice(zombies.list.indexOf(z), 1);
    await slimes.rehearse(at, step);   // (and a slime of every body, struck, frozen and burst)
    if (magic.wisp) magic.wisp.t = 0;   // (the wisp would follow you for a minute and a half: sent off)
    await step(10);
  } catch (e) { console.warn('the rehearsal', e); }
  zombies.quiet = false;
  for (const s of ['R', 'L']) pending[s] = null;
  magic.endCharge(); magic.arcana.endChannels();
  Object.assign(book, was.book);
  player.mana = was.mana; player.health = was.health; player.pos.copy(was.pos); player.yaw = was.yaw; player.pitch = was.pitch; player.vel.set(0, 0, 0);
  started = was.started; paused = was.paused; introBusy = was.introBusy;
  Object.assign(hud, quiet);
  hud.refresh(vm.equip, book);
  console.info(`rehearsed in ${Math.round(performance.now() - T0)} ms: ${renderer.info.programs.length - p0} more programs`);
}

/** Everything in before play, so nothing loads or is made on the GPU mid-game: the whole village and
 * the Sworn, the knight's armour, every arm that can lie on the ground (a phone: the ones it carries
 * and the knight's), every gauntlet (not on a phone); then every picture refined and uploaded, every
 * shader compiled, and the world drawn once whole, with its shadows, so every buffer is on the GPU. */
async function prepare(mark) {
  const T0 = performance.now(), p0 = renderer.info.programs.length;
  const wait = (p, what) => Promise.resolve(p).catch((e) => console.warn(what, e));
  await Promise.all([wait(villagers.ready, 'the village'), wait(foes.swornReady, 'the Sworn'), wait(foes.ualReady, "the foes' clips"), wait(ctx.crater.armourReady, "the knight's armour")]);
  await mark('people');
  const items = touch
    ? [...Object.values(char.equip), ...char.bag, ...['vigilsword', 'vigilshield', 'vigilstaff'].map(makeUnique)].filter((it) => it?.model && it.kind !== 'gauntlet').map((it) => [it.model, it.finish || ''])
    : Object.entries(vm.manifest.items).filter(([k]) => k !== 'wand').flatMap(([, list]) => list.map((e) => [e.id, '']));
  const arms = await Promise.all(items.map(([id, f]) => vm.modelScene(id, f).catch((e) => console.warn('arm', id, e))));
  if (!touch) await Promise.all(vm.manifest.arms.map((a) => vm.prefetch(a.id).catch(() => {})));
  else await wait(vm.prefetch('wayfarer'), 'the gauntlet');
  await settled();
  await mark('arms ready');
  // the arms as they'd lie on the ground, in the world for the warm-up (and out again after); and
  // every body's materials on a plain mesh too, as a cut-off limb is drawn (the shaders differ)
  const lying = new THREE.Group();
  arms.forEach((o, i) => { if (o) { o.position.set(i * 0.6, -50, 0); lying.add(o); } });
  const limbs = new Set();
  scene.traverse((o) => { if (o.isSkinnedMesh) for (const m of [o.material].flat()) if (!limbs.has(m)) { limbs.add(m); const p = new THREE.Mesh(o.geometry, o.material); p.position.set(0, -60, 0); p.castShadow = true; lying.add(p); } });
  scene.add(lying);
  // the villagers cast shadows only near you (the dead see to their own); every body has one
  // skeleton and culls itself (engine.js, from the bodies' constructors)
  const skels = new Set();
  for (const a of villagers.list) { a.casts = []; a.root.traverse((c) => { if (c.isMesh && c.castShadow) a.casts.push(c); if (c.isSkinnedMesh) skels.add(c.skeleton); }); }
  for (const z of zombies.list) z.root.traverse((c) => { if (c.isSkinnedMesh) skels.add(c.skeleton); });
  const skel = skels.size;
  // the world's matrices only where something's shown, and its small pieces left out far off
  visibleMatrices(scene);
  ctx.detail = new DetailCull(ctx.built, { touch, under: ctx.builtUnder });
  // pictures: linear-filtered, mipmapped, anisotropic (crisp texels come from the shader), and
  // smooth-edged leaves, hair and lashes
  const r1 = refineScene(scene), r2 = refineScene(vm.scene);
  const tex = texturesOf(vm.scene, texturesOf(scene));
  await upload(renderer, tex, (k) => title.progress(Math.round(86 + 6 * k)));
  await mark('uploaded');
  await compile(renderer, [[scene, camera], [vm.scene, vm.camera]], composer.readBuffer);
  await mark('compiled');
  await warmWorld();
  scene.remove(lying);
  await mark('warm');
  console.info(`prepared in ${Math.round(performance.now() - T0)} ms: ${tex.size} textures, ${r1.materials + r2.materials} materials (${r1.a2c + r2.a2c} alpha to coverage), ${renderer.info.programs.length - p0} programs, ${skel} skeletons, ${ctx.detail.list.length} small pieces culled by distance; texels ${TEXELS}, ${W}x${H}`);
}

/** The world drawn once with everything in it shown and nothing culled, so every program it needs is
 * made and every buffer uploaded; then once more into the shadow maps (the sun's, the torches', the
 * spells') with every kind of caster in it, so the depth programs are made too. Drawn into a small
 * buffer of the same kind as the composer's (the programs and buffers don't depend on its size, and
 * a phone isn't asked to draw the whole world at full size). Put back as it was. */
async function warmWorld() {
  const small = new THREE.WebGLRenderTarget(256, 144, { type: THREE.HalfFloatType });
  const saved = [];
  scene.traverse((o) => { if (o.isLight) return; saved.push([o, o.visible, o.frustumCulled]); o.visible = true; o.frustumCulled = false; });   // (lights stay as they are: their count is in every shader)
  const autoShadow = renderer.shadowMap.autoUpdate, was = renderer.getRenderTarget();
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
  renderer.setRenderTarget(small);
  renderer.render(scene, camera);
  renderer.render(vm.scene, vm.camera);
  await new Promise((r) => setTimeout(r));
  // shadows: bodies, instanced and batched growth and anything cut out by alpha into every kind of map
  for (const [o, , fc] of saved) o.frustumCulled = fc && !(o.isSkinnedMesh || o.isInstancedMesh || o.isBatchedMesh || o.material?.alphaTest > 0);
  const casters = [];
  scene.traverse((o) => { if (o.isLight && o.castShadow) casters.push([o, o.shadow.autoUpdate]); });
  for (const [l] of casters) { l.shadow.autoUpdate = true; l.shadow.needsUpdate = true; }
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  renderer.setRenderTarget(was);
  small.dispose();
  for (const [o, v, fc] of saved) { o.visible = v; o.frustumCulled = fc; }
  for (const [l, au] of casters) { l.shadow.autoUpdate = au; l.shadow.needsUpdate = true; }   // (redrawn as they really are)
  renderer.shadowMap.autoUpdate = autoShadow; renderer.shadowMap.needsUpdate = true;
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
    const held = vm.equip.R;   // (what was in the hand: a blade drawn, or put away, is heard)
    st = computeStats(char);
    const w = char.equip.weapon, o = char.equip.offhand;
    if (w) vm.setArm(w.kind, w.model, w.name, w.finish);
    if (o) vm.setArm(o.kind, o.model, o.name, o.finish);
    vm.equip.R = w ? w.kind : null;
    vm.equip.L = o && w?.kind !== 'twohand' ? o.kind : null;
    vm.blocking = false;
    pending.R = pending.L = null;
    magic?.endCharge();
    magic?.arcana.endChannels();
    player.maxHealth = st.maxLife; player.maxMana = st.maxMana;
    if (first) { player.health = st.maxLife; player.mana = st.maxMana; }
    player.health = Math.min(player.health, st.maxLife); player.mana = Math.min(player.mana, st.maxMana);
    player.lifeRegen = st.lifeRegen; player.manaRegen = st.manaRegen; player.speedMul = 1 + st.moveSpeed / 100;
    guard.max = st.shield?.guard || 0;
    guard.v = first ? guard.max : Math.min(guard.v, guard.max);
    const g = char.equip.hands?.model || 'bare';
    if (vm.gauntlet !== g) await vm.load(g); else await vm.applyEquip();
    if (!first) {
      const edged = (k) => k && k !== 'staff' && !BLUNT.test(char.equip.weapon?.model || char.equip.weapon?.kind || '');
      if (vm.equip.R !== held && vm.equip.R && edged(vm.equip.R)) sfx.unsheath();
      else if (vm.equip.R !== held && !vm.equip.R && held) sfx.sheath();
      else sfx.equip();
    }
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
  for (const other of SPELL_KEYS) if (other !== slot && book[other] === id) book[other] = book[slot];   // (one spell, one key: they swap)
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
/** A spell's damage: its own, the staff's for its bolts, and the spell bonus. */
function spellDamage(def) {
  const w = char.equip.weapon;
  const base = def.kind === 'staff' && w?.dmg ? w.dmg[0] + Math.random() * (w.dmg[1] - w.dmg[0]) : SPELL_DMG[def.kind] ?? 30;
  return base * (1 + st.spellPct / 100) * (def.dmgMul || 1);   // (a staff bolt held and gathered: up to two and a half times)
}

// ------------------------------------------------------------------ the shield and the staff
// A shield raised just as the blow comes (a third of a second before it lands) turns it aside
// whole: the Guard pays nothing, the one who swung reels, and your next blow, struck while it does,
// lands nearly twice as hard. A swing with the shield up is a bash: a shove that knocks whatever's
// in front of you back a stride and sets it reeling. A staff gathers its bolt while you hold the
// button (the longer, the bigger and harder it flies), and with the left hand free it sweeps
// round in front of you, knocking the dead back off you.
let blockAt = -9, riposteUntil = 0, bashCool = 0, sweepCool = 0, staffCharge = -1;
/** Set something reeling for t seconds (and out of any blow it was in). */
function reel(z, t) {
  if (z.dead) return;
  if (z.def) { z.state = 'hit'; z.play('hit', 0.06); z.cool = Math.max(z.cool || 0, t); z.comboQ = null; }
  else {
    if (z.state === 'attack' || z.state === 'grab') z.state = 'move';
    z.stagger = Math.max(z.stagger || 0, t);
    if (z.actions.hit) { z.holdT = 0; z.play('hit', 0.06); z.holdT = Math.min(t, z.actions.hit.getClip().duration); }
  }
}
/** Knock something back along (dx, dz), about `m` metres. */
function shove(z, dx, dz, m) { if (z.dead || z.mode === 'crawl') return; z.knock = new THREE.Vector3(dx * m * 9, 0, dz * m * 9); }
/** What's in front of you, within reach and the cone (cos of its half-angle). */
function inFront(reach, cone) {
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), out = [];
  for (const z of zombies.list.concat(slimes.list)) {
    if (z.dead || z.gone || z.state === 'buried' || z.state === 'playdead') continue;
    const dx = z.pos.x - player.pos.x, dz = z.pos.z - player.pos.z, d = Math.hypot(dx, dz) || 1e-3;
    if (d > reach || Math.abs(z.pos.y - player.pos.y) > 1.3 || (dx * fx + dz * fz) / d < cone) continue;
    out.push({ z, dx: dx / d, dz: dz / d, d });
  }
  return out;
}
function parried(by) {
  reel(by, 1.3);
  riposteUntil = zombies.time + 1.6;
  if (!sfx.play('sword_parry', { vol: 1.3 })) { sfx.clang(false); sfx.clang(false); }
  sfx.play('sword_blocked', { vol: 0.8, delay: 0.03 });
  shake = Math.max(shake, 0.5);
  magic.particles.burst(fromView(vm.castPoint('L'), 0.6), [new THREE.Color('#ffffff'), new THREE.Color('#fff0b0'), new THREE.Color('#ffc040')], 34, { speed: 6, size: 0.035, grav: 7, life: 0.5 });
  hud.toast('Parried! Strike while it reels');
  answerBlow(by);
}
function shieldBash() {
  if (bashCool > 0 || !st.shield || guard.broken) return;
  bashCool = 1.1; guard.v = Math.max(0, guard.v - 12); guard.wait = 0.6;
  const hit = inFront(2.3, 0.45);
  for (const { z, dx, dz } of hit) {
    const b = z.bones.chest || z.bones.spine;
    if (b) z.hit({ bone: b, point: b.getWorldPosition(new THREE.Vector3()) }, { dmg: 6 + Math.random() * 5, dir: new THREE.Vector3(dx, 0.1, dz), kind: 'blunt' });
    reel(z, 0.9); shove(z, dx, dz, 1.4);       // (after the blow's own flinch, so the reel holds)
  }
  if (hit.length) sfx.hit('blunt', true); else sfx.swing(true, true);
  shake = Math.max(shake, hit.length ? 0.8 : 0.35);
  if (hit.length) magic.particles.burst(fromView(vm.castPoint('L'), 0.7), [new THREE.Color('#d0d0d0'), new THREE.Color('#ffb040')], 18, { speed: 4, size: 0.03, grav: 9, life: 0.4 });
}
function staffSweep() {
  if (sweepCool > 0 || vm.busy('R')) return;
  if (!vm.attackRight()) return;
  sweepCool = 1.4;
  const w = char.equip.weapon, roll = w?.dmg ? w.dmg[0] + Math.random() * (w.dmg[1] - w.dmg[0]) : 14;
  for (const { z, dx, dz } of inFront(2.9, 0.25)) {
    const b = z.bones.chest || z.bones.spine;
    if (b) z.hit({ bone: b, point: b.getWorldPosition(new THREE.Vector3()) }, { dmg: roll * 0.7, dir: new THREE.Vector3(dx, 0.15, dz), kind: 'blunt' });
    reel(z, 0.75); shove(z, dx, dz, 1.8);
  }
  shake = Math.max(shake, 0.5);
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

/** A blow (or a spell: kind 'spell') lands on you from `by`. A raised shield with Guard left
 * stops most of a blow from the front: the Guard pays for what it stops, and when it's gone the
 * guard breaks and the shield stops nothing until it has come back (it only comes back while
 * the shield is down). Its enchantments answer whoever struck it. Armour takes its share of
 * whatever gets through. If it kills you, you wake in the village. */
function hurtPlayer(dmg, by = null, kind = 'melee') {
  if (introBusy) return;
  // (a fall costs health and the climb back, never your life: it leaves you on your last legs)
  if (kind === 'fall') { shake = Math.max(shake, 1.4); sfx.impact?.(); player.health = Math.max(Math.min(player.health, 8), player.health - dmg); hud.toast('The fall all but breaks you'); return; }
  let d = dmg * (by?.champ?.dmg || 1);   // a quest's champion hits harder
  const sh = st.shield;
  let front = true;
  if (by?.pos) {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), dx = by.pos.x - player.pos.x, dz = by.pos.z - player.pos.z;
    front = (fx * dx + fz * dz) / (Math.hypot(dx, dz) || 1) > 0.25;
  }
  if (vm.blocking && sh && !guard.broken && front && kind === 'melee' && by && !by.dead && zombies.time - blockAt < 0.33) { parried(by); return; }   // (raised just in time)
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
    sfx.block(guard.broken);
    magic.particles.burst(fromView(vm.castPoint('L'), 0.6), [new THREE.Color('#fff0b0'), new THREE.Color('#ffb040'), new THREE.Color('#d0d0d0')], 16,
      { speed: 4, size: 0.03, grav: 9, life: 0.4 });
    if (by && kind === 'melee' && !by.dead) answerBlow(by);
    shake = Math.max(shake, 0.35);
  } else {
    shake = Math.max(shake, 0.9);
    sfx.hurt();
  }
  hurtAt = performance.now();
  d *= 1 - armorCut(st.armor);
  player.health -= d;
  if (player.health <= 0) {
    player.health = player.maxHealth;
    player.pos.set(0, 0, 12); player.vel.set(0, 0, 0);
    zombies.forget();
    hud.toast('Torn apart by the dead... you wake in the village');
    music.stinger('fell');
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
function onEvent(kind, side, clip, info) {
  if (kind === 'fire') {
    const p = pending[side];
    if (!p) return;
    pending[side] = null;
    sfx.cast(KIND_SOUND[p.def.kind] || p.def.kind, p.id);
    if (p.def.self) { magic.selfCast(p.def, player, camera); if (p.def.self === 'heal') hud.toast('Your wounds close'); return; }
    const from = fromView(castFrom(p));
    const dir = aimPoint().sub(from).normalize();
    magic.cast(p.def, from, dir, player, camera);
  } else if (kind === 'whoosh') sfx.swing(!!info?.heavy, BLUNT.test((ITEMS[vm.equip[side]] || ITEMS[vm.equip.R])?.id || ''));
  else if (kind === 'hit' && info?.attack) melee(info.heavy ? 3.5 : 2.9, info.heavy, side, info.edge, info.power);
}

// the weapons that crush rather than cut (no gash: a split in the flesh where they land)
const BLUNT = /mace|hammer|club|morning_star|maul|tombstone|crook|staff|orb|crosier/;
/** A swing landing: the nearest thing in reach across the blade's arc gets sparks or chips. */
function melee(reach, heavy, side = 'R', sweep = null, power = 1) {
  player.swingAt = zombies.time;            // (the Sworn see it coming)
  const o = camera.position;
  let best = null, flesh = null;
  // the rays fan out along the blade's sweep across the view (a chop's fan stands up, a
  // sweep's lies flat), a little either side of it
  const sx = sweep ? sweep[0] : 1, sy = sweep ? sweep[1] : 0;
  for (const [a, b] of [[-0.35, 0], [-0.15, 0], [0, 0], [0.15, 0], [0.35, 0], [0, -0.1], [0, 0.1]]) {
    const d = new THREE.Vector3(a * sx - b * sy, -0.05 + a * sy + b * sx, -1)
      .applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ')).normalize();
    const hit = physics.ray([o.x, o.y, o.z], [d.x, d.y, d.z], reach);
    if (hit && (!best || hit.t < best.t)) best = { ...hit, d };
    const zh = zombies.ray(o, d, reach);
    if (zh && (!flesh || zh.t < flesh.t)) flesh = { ...zh, d };
  }
  if (flesh && (!best || flesh.t < best.t)) { // the blade bites into a zombie
    const it = ITEMS[vm.equip[side]] || ITEMS[vm.equip.R];
    // the edge's sweep across the view, as the blow travels on screen (fp_moves.json)
    const right = _v.set(1, 0, 0).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const sw = sweep || [heavy ? 0.94 : 0.82, (heavy ? -0.34 : 0.57) * (side === 'L' ? -1 : 1)];
    const edge = right.clone().multiplyScalar(sw[0]).addScaledVector(up, sw[1]).normalize();
    const blunt = BLUNT.test(it?.id || '');
    // (a chop, slower than a cut, lands harder; struck while it reels from your parry, harder again)
    const ripo = zombies.time < riposteUntil;
    if (ripo) { riposteUntil = 0; heavy = true; hud.toast('Riposte!'); }
    const dmg = stats.meleeDamage(heavy, side) * power * (ripo ? 1.8 : 1);
    flesh.z.hit(flesh, { dmg, dir: flesh.d, heavy, kind: blunt ? 'blunt' : 'blade', edge: blunt ? null : edge, push: (heavy ? 0.8 : 0.45) * (blunt ? 1.4 : 1) * power });
    sfx.hit(blunt ? 'blunt' : 'flesh', heavy);
    // a treasure's powers: the dead set burning, or chilled to a crawl
    // (it shows where the blade bit: char, or rime, about the wound, never the whole body)
    if (st.burnHit && !flesh.z.dead) { flesh.z.burning = Math.max(flesh.z.burning || 0, 3); flesh.z.burnDps = Math.max(flesh.z.burnDps || 0, st.burnHit); flesh.z.mark?.(flesh.point, flesh.bone, 0.07, 1); }
    if (st.chillHit && !flesh.z.dead) { flesh.z.chilled = Math.max(flesh.z.chilled || 0, st.chillHit); flesh.z.mark?.(flesh.point, flesh.bone, 0.07, 2); }
    zombies.noise(o, 14);
    shake = heavy ? 1.0 : 0.6;
    return;
  }
  if (!best) return;
  zombies.noise(o, 14);   // steel on stone carries
  const p = o.clone().addScaledVector(best.d, best.t);
  const n = new THREE.Vector3(...best.normal);
  const tag = best.box ? best.box.tag : 'ground';
  if (tag === 'prop') ctx.props.hit(best.box, stats.meleeDamage(heavy, side) * power, best.d);   // (a crate, a barrel or a pot may break)
  const wood = tag === 'tree' || tag === 'prop';
  const cols = tag === 'ground' ? ['#6a5a40', '#8a7858', '#4a3c2a'] : wood ? ['#8a6a40', '#5a4028', '#b08850'] : ['#fff0b0', '#ffb040', '#d0d0d0'];
  magic.particles.burst(p.addScaledVector(n, 0.04), cols.map((c) => new THREE.Color(c)), heavy ? 30 : 18,
    { speed: wood || tag === 'ground' ? 2.5 : 5.5, nrm: n, size: 0.035, grav: 9, life: 0.55, floor: n.y > 0.7 ? p.y : null });
  if (!wood && tag !== 'ground') magic.flashAt(p, 0xffc070, 0.3);
  if (tag === 'ground' || wood) for (let i = 0; i < 4; i++) smoke.emit(p.clone(), new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6), { life: 1.2, size: 0.3, grow: 0.5, alpha: 0.25, shade: 0.7 });
  sfx.hit(wood ? 'wood' : tag === 'ground' ? 'ground' : 'stone', heavy);
  shake = heavy ? 0.9 : 0.55;
}

// ------------------------------------------------------------------ zones and light
function zoneAt(p) {
  for (const u of ctx.unders) if (u.dg.contains(p)) return { name: u.dg.where?.(p) || u.dg.name, region: u.dg.name, kind: 'under', fog: u.dg.fogAt?.(p), amb: u.dg.ambAt?.(p) };
  if (p.y < terrainHeight(p.x, p.z) - 1.5 && p.x < REGION.x0) return { name: 'The Undercroft', kind: 'under' };
  if (p.x > REGION.x0) {   // the downs: see a long way
    for (const z of ctx.zones) if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1 && p.y < z.y1 && p.y > z.y0) return { name: z.name, kind: 'in', open: 1 };
    for (const [x, z, r, name] of Object.values(SPOTS)) if (Math.hypot(p.x - x, p.z - z) < r) return { name, kind: 'out', open: 1 };
    return { name: 'The Green Downs', kind: 'out', open: 1 };
  }
  if (p.x > 110 && Math.abs(p.z) < 8) return { name: 'The Bellwood Trail', kind: 'out' };
  for (const z of ctx.zones) if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1 && p.y < z.y1) return { name: z.name, kind: 'in' };
  const keep = ctx.keep.place(p);
  if (keep) return { name: keep, kind: 'out' };
  if (p.x > GRAVEYARD.x0 && p.x < GRAVEYARD.x1 && p.z > GRAVEYARD.z0 && p.z < GRAVEYARD.z1) return { name: 'The Bellmourn Graveyard', kind: 'out' };
  if (CRATER.k && Math.hypot(p.x - CRATER.x, p.z - CRATER.z) < CRATER.reach) return { name: 'Where the Green Star Fell', kind: 'out' };
  if (Math.hypot(p.x, p.z) > VILLAGE_R + 10) return { name: 'The Darkwood', kind: 'out' };
  return { name: 'Bellmourn', kind: 'out' };
}

const L = { out: 1, under: 0, inCathedral: 0, open: 0, fog: 46, amb: 0 }; // smoothed zone weights (and how far you see underground)
let billLights = null;
const MOON = new THREE.Color(0x8aa0e0);
const _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _c = new THREE.Vector3(), _tdir = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0), WHITE = new THREE.Color(1, 1, 1), WISP = new THREE.Color(0xffe8b0);
let day = dayState(hour);
function light(dt, t) {
  if (timeMode === 'cycle' && !holdHour) hour = (hour + dt / 60) % 24; // an hour a minute
  day = dayState(hour);
  const z = zoneAt(player.pos);
  here = z;
  hud.zone(z.name);
  const k = Math.min(1, dt * 2.5);
  L.out += ((z.kind === 'out' ? 1 : 0) - L.out) * k;
  L.under += ((z.kind === 'under' ? 1 : 0) - L.under) * k;
  L.inCathedral += ((z.name.startsWith('Cathedral') ? 1 : 0) - L.inCathedral) * k;
  L.open += ((z.open ? 1 : 0) - L.open) * k * 0.5; // the downs: see a long way
  L.fog += ((z.fog || 46) - L.fog) * k * 0.6;        // a great space below: see across it
  L.amb += ((z.amb || 0) - L.amb) * k * 0.6;         // (and a faint cold glow in the gulf)
  const indoor = Math.max(0, 1 - L.out - L.under);
  const surface = 1 - L.under; // underground nothing but torches and spells

  // sun by day, moon by night; with shadows the roofs keep it out of interiors by themselves
  const isDay = day.day > 0.02;
  sun.color.copy(isDay ? day.sunColor : MOON);
  sun.intensity = (isDay ? day.sunPower * day.day : 0.55) * surface * (HI ? 1 : L.out + 0.25 * indoor);
  sun.shadow.autoUpdate = L.under < 0.95;   // (deep below, the sun's shadow map isn't redrawn: it lights nothing down here)
  const ld = day.lightDir;
  if (HI) { // keep the shadow map's texels fixed in the world as it follows you (no shimmer)
    _lx.crossVectors(UP, ld).normalize();
    _ly.crossVectors(ld, _lx);
    const tx = 144 / 4096;
    _c.copy(player.pos);
    const px = _c.dot(_lx), py = _c.dot(_ly);
    _c.addScaledVector(_lx, Math.round(px / tx) * tx - px).addScaledVector(_ly, Math.round(py / tx) * tx - py);
    sun.target.position.copy(_c);
    sun.position.copy(_c).addScaledVector(ld, 300);
  } else { sun.target.position.set(0, 0, 0); sun.position.copy(ld).multiplyScalar(300); }
  hemi.color.copy(day.zenith).lerp(WHITE, 0.55);
  hemi.groundColor.copy(day.horizon).multiplyScalar(0.3);
  hemi.intensity = day.ambient * (L.out + (0.55 + 0.45 * L.inCathedral) * indoor) * surface * 1.15;
  if (L.amb > 0.002 && L.under > 0.5) {   // below: the gulf's glow, from its stream and its fungus
    hemi.color.setRGB(0.47, 0.58, 0.6); hemi.groundColor.setRGB(0.1, 0.14, 0.15);
    hemi.intensity += L.amb * L.under;
  }
  scene.fog.color.copy(day.fog).lerp(BLACK, L.under);
  scene.fog.near = 30 * surface + 3 * L.under;
  scene.fog.far = ((isDay ? 300 : 170) + (isDay ? 420 : 140) * L.open) * surface * (touch ? 0.75 : 1) + L.fog * L.under;   // (a phone draws less of the distance)
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
  lantern.position.set(camera.position.x, camera.position.y + 0.35, camera.position.z);
  lantern.intensity = 0.8 * L.under;

  // the nearest flames get the pool's lights; the closest few get the shadow-casting ones.
  // A light keeps its flame while that flame is still wanted, so shadows rarely re-render.
  lightTimer -= dt;
  if (lightTimer <= 0) {
    lightTimer = 0.25;
    const p = camera.position;
    const ranked = flameList.map((f) => [f, (f[0] - p.x) ** 2 + (f[1] - p.y) ** 2 * 4 + (f[2] - p.z) ** 2])
      .filter((a) => a[1] < 55 * 55).sort((a, b) => a[1] - b[1]).map((a) => a[0]);
    // (a flame marked f[4] sits in its own brazier or candles, which would shadow it: never a shadow light)
    const shadowed = ranked.filter((f) => !f[4]).slice(0, TORCH_SHADOWS);
    const groups = [[torchPool.slice(0, TORCH_SHADOWS), shadowed],
      [torchPool.slice(TORCH_SHADOWS), ranked.filter((f) => !shadowed.includes(f)).slice(0, TORCHES - TORCH_SHADOWS)]];
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
  let warm = 0, best = 0;
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
    const w = Math.max(0, 1 - d / l.distance) ** 2 * (big ? 0.9 : 0.45) * flick;
    warm += w;
    if (w > best) { best = w; _tdir.subVectors(l.position, camera.position); }   // (the hands are lit from the strongest)
  });
  // by day out of doors a torch is no light on the hands
  warm *= 1 - 0.85 * L.out * day.day;
  _tdir.applyQuaternion(_q.copy(camera.quaternion).invert());
  bill.setLights(billLights ||= [...torchPool, ...magic.lights.map((x) => x.light)]);   // (the same lights every frame)
  const amb = (day.ambient * (L.out + (0.55 + 0.45 * L.inCathedral) * indoor)) * surface;
  vm.setLight(amb, sun.intensity / 2.5 * (L.out + 0.25 * indoor), warm,
    magic.vmFlash.amount * 4 + (magic.wisp ? 1.6 : 0), magic.vmFlash.amount > 0.05 ? magic.vmFlash.color : magic.wisp ? WISP : null, best > 0 ? _tdir : null);
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
  if (!introBusy) music.play();
  started = true;
  paused = false;
  title.hide();
  hud.showOverlay(null);
  if (touch) {
    hud.showTouch(true);
    document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  } else {
    lockPointer();
  }
}

function setMap(on) {
  map.show(on, player);
  if (on && bag.open) bag.show(false);
  if (touch) { gameInput.release(); }
  else if (on) document.exitPointerLock?.(); else lockPointer();
}

function setInventory(on) {
  if (on && map.open) map.show(false);
  bag.show(on);
  if (touch) { hud.showTouch(!on); gameInput.release(); } // the thumb controls would lie over the bag
  if (on) { document.exitPointerLock?.(); hud.refresh(vm.equip, book); }
  else if (!touch) lockPointer();
}

function pause() {
  if (introBusy) return;
  paused = true;
  bag?.show(false); map?.show(false); quests?.close(); saves?.show(null);
  hud.showOverlay('pause', touch);
  if (touch) { hud.showTouch(false); gameInput.release(); }
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && started && !bag?.open && !map?.open && !quests?.open && !saves?.open && !introBusy) pause();
});

// ------------------------------------------------------------------ a new game, a game picked up, saved and loaded
const hasGame = () => { try { return !!localStorage.getItem('bm.char'); } catch { return false; } };

/** The newest game there is to pick up: the one that keeps itself as you play ({auto}), or a save
 * slot's ({slot, data}), whichever was made last (null: none). A game kept before the time was noted
 * counts as the newest: it was written every few seconds as you played. */
function latestSave() {
  let best = hasGame() && progress?.arrived ? { auto: true, at: progress.at ?? Infinity } : null;
  for (let i = 1; i <= SLOT_COUNT; i++) {
    const d = readSlot(i);
    if (d?.char && (!best || (d.at || 0) > best.at)) best = { slot: i, data: d, at: d.at || 0 };
  }
  return best;
}
const anySlot = () => { for (let i = 1; i <= SLOT_COUNT; i++) if (readSlot(i)?.char) return true; return false; };
/** What the title's menu can do: Continue needs a game to pick up, Load a slot to load. */
const titleState = () => ({ continue: !!latestSave(), load: anySlot() });

/** The title's and the pause screen's buttons. */
function menu(a) {
  sfx.start();
  if (a === 'new') newGame();
  else if (a === 'continue') continueGame();
  else if (a === 'load') saves.show('load');
  else if (a === 'save') saves.show('save');
  else if (a === 'resume') begin();
  else if (a === 'settings' || a === 'howto') title.panel(a);
  else if (a === 'log') { paused = false; hud.showOverlay(null); if (touch) hud.showTouch(true); quests.showLog(true); }
}

/** Where things stand, beyond the character: kept as you play (Continue) and in each save. */
function makeProgress() {
  const p = player.pos;
  // (welcomed: the village has had its say at the edge of town, and gifts: what they've given so far)
  return { arrived: true, at: Date.now(), welcomed: progress?.welcomed !== false, gifts: progress?.gifts || [], quests: quests.save(), hour, book: { ...book }, arms: armsLying(),
    player: { x: p.x, y: p.y, z: p.z, yaw: player.yaw, pitch: player.pitch } };
}
function saveProgress() {
  if (!quests || !player || introBusy || !started) return;
  progress = makeProgress();
  try { localStorage.setItem(PROGRESS, JSON.stringify(progress)); } catch { /* private window */ }
  saveCharacter(char);
}
addEventListener('pagehide', () => saveProgress());

/** A save slot's worth: who you are, where, and everything to pick it up again. */
function snapshot() {
  if (!started || introBusy || !quests) return null;
  return { level: char.level, gold: char.gold, place: zoneAt(player.pos).name, quests: Object.values(quests.state).filter((q) => q.s === 'done').length,
    char: JSON.parse(JSON.stringify(char)), progress: makeProgress() };
}

/** Put a game in progress back: the crater, the quests, the hour, where you stood, the knight's arms
 * if they still lie in the crater. */
function applyProgress(pr) {
  formCrater(1);
  holdHour = false;
  quests.load(pr?.quests || {});
  if (pr?.hour != null && timeMode === 'cycle') hour = pr.hour;
  if (pr?.book) { Object.assign(book, pr.book); hud.refresh(vm.equip, book); }
  const P = pr?.player;
  if (P && Number.isFinite(P.x)) { player.pos.set(P.x, P.y, P.z); player.yaw = P.yaw || 0; player.pitch = P.pitch || 0; } else player.pos.set(0, 0, 12);
  player.vel.set(0, 0, 0);
  layArms(pr?.arms || []);
  zombies.forget();
  villagers.endGather();
  villagers.postAt = quests.status('undercroft') === 'available' && pr?.arrived ? villagers.postAt : null;
  // left before the village had said its piece: what they hadn't yet given you
  if (pr?.arrived && pr.welcomed === false) {
    for (const k of ['armor', 'gloves', 'gold', 'potions']) if (!pr.gifts?.includes(k)) gift(k, null);
    pr.welcomed = true;
    try { localStorage.setItem(PROGRESS, JSON.stringify(pr)); } catch { /* private window */ }
  }
}

/** Load a save (from a slot). */
async function restore(d) {
  if (intro?.running) intro.skip();
  char = fitLevel(fitCharacter(JSON.parse(JSON.stringify(d.char))));
  saveCharacter(char);
  progress = { ...d.progress, at: Date.now() };   // (now the game being played: Continue's, newer than the slot)
  try { localStorage.setItem(PROGRESS, JSON.stringify(progress)); } catch { /* private window */ }
  applyProgress(progress);
  await applyGear(true);
  bag.render();
  hud.toast('Game loaded');
  if (!started) begin();
  else { paused = false; hud.showOverlay(null); if (touch) hud.showTouch(true); else lockPointer(); }
}

/** Pick up the newest game: where it was left (bm.char and bm.progress), or the newest save slot. */
function continueGame() {
  const s = latestSave();
  if (!s) return;
  if (s.slot) { restore(s.data); return; }
  applyProgress(progress);
  applyGear(true);
  begin();
}

/** The knight's sword, shield and staff, lying in the crater (those of `ids` still there). */
function layArms(ids = ['vigilsword', 'vigilshield', 'vigilstaff']) {
  const L = ctx.loot;
  for (const it of [...L.list]) if (/^vigil/.test(it.item.unique || '')) { L.group.remove(it.holder); L.list.splice(L.list.indexOf(it), 1); }
  const of = { onehand: 'vigilsword', shield: 'vigilshield', staff: 'vigilstaff' };
  for (const [dx, dz, k] of CRATER_ARMS) {
    const id = of[k];
    if (!ids.includes(id)) continue;
    const x = CRATER.x + dx, z = CRATER.z + dz;
    L.spawn(makeUnique(id), x, physics.groundAt(x, z) + 0.9, z, { pop: true });
  }
}
const armsLying = () => (ctx?.loot.list || []).filter((it) => /^vigil/.test(it.item.unique || '')).map((it) => it.item.unique);

/** Gear taken up goes straight on if its hand or place is free. */
function autoEquip(it) {
  if (it?.type !== 'gear') return;
  const i = char.bag.indexOf(it);
  if (i < 0) return;
  const slot = slotFor(char.equip, it);
  if (char.equip[slot]) return;
  if (slot === 'offhand' && char.equip.weapon?.kind === 'twohand') return;
  if (slot === 'weapon' && it.kind === 'twohand' && char.equip.offhand) return;
  bag.equipFromBag(i, slot);
}

/** Experience: from what you kill and the work you do. A level brings a peal, a banner, a column of
 * gold about you, full life and mana, and points to spend. */
function gainXp(n) {
  const up = grantXp(char, n * (1 + (st.xpPct || 0) / 100));
  if (up) {
    sfx.levelUp();
    hud.announce(`Level ${char.level}`, `${char.points} point${char.points === 1 ? '' : 's'} to spend · Tab, then your character`);
    applyGear().then(() => { player.health = player.maxHealth; player.mana = player.maxMana; });
    const at = player.pos.clone().add(new THREE.Vector3(0, 0.2, 0));
    magic.particles.burst(at, [new THREE.Color('#fff2b0'), new THREE.Color('#ffc840'), new THREE.Color('#ffffff')], 90, { speed: 2.5, size: 0.05, grav: -3, life: 1.6, drag: 1 });
    bag.render();
  }
  saveCharacter(char);
}

/** Every death in the world: experience, the quests' counts, and a champion's hoard. */
function onDeath(z) {
  if (introBusy) return;
  gainXp(xpFor(z));
  quests?.onKill(z);
  if (z.champ) for (let i = 0; i < 2; i++) ctx.loot.drop([z.pos.x + i * 0.6, z.pos.y + 0.1, z.pos.z], { tier: 4, under: true });
}

/** A quest handed in: its experience, coin and treasures (into the bag, or at your feet if it's full). */
function reward({ xp = 0, gold = 0, items = [], title = '' }) {
  if (gold) { char.gold += gold; sfx.coin(); }
  for (const it of items) if (!addToBag(char, it)) { const d = ctx.loot.spawn(it, player.pos.x, player.pos.y + 1, player.pos.z, { pop: true }); d.age = -1.5; }
  hud.announce('Quest complete', title);
  hud.toast(`${xp} experience${gold ? `, ${gold} gold` : ''}${items.length ? ` · ${items.map((i) => i.name).join(', ')}` : ''}`);
  gainXp(xp);
  saveCharacter(char);
  bag.render();
}

// ------------------------------------------------------------------ the opening, and the village coming to the crater
/** Start over as Tessariel: nothing in your hands, nothing in your bag, and the green star coming down. */
let starting = false;
async function newGame() {
  if (introBusy || starting) return;
  // asked on the screen, in the game's own box: a journey under way is lost unless it's in a slot
  const lose = started || (hasGame() && progress?.arrived);
  if ((lose || anySlot()) && !(await title.confirm({ title: 'Begin a New Game?',
    text: lose ? 'Are you sure? The journey you are on will be lost, unless it is kept in a save slot.' : 'Are you sure? Your saved games will be kept.',
    yes: 'Begin', no: 'Go Back' }))) return;
  if (introBusy || starting) return;
  starting = true;
  try { await startOver(); } finally { starting = false; }
}

async function startOver() {
  music.intro();   // (the opening's song from this moment, over the getting-ready and the whole of it)
  found.clear(); try { localStorage.removeItem('bm.found'); } catch { /* no storage */ }
  saves.show(null); quests.close(); bag.show(false); map.show(false);
  hud.showOverlay(null);
  if (touch) hud.showTouch(false);
  await title.show('The sky is opening…');   // (black over the world before anything in it moves)
  char = newCharacter(true);
  fitCharacter(char); saveCharacter(char);
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('bm.taken.')) localStorage.removeItem(k); } catch { /* no storage */ }
  quests.load({});
  progress = { arrived: false };
  try { localStorage.removeItem(PROGRESS); } catch { /* no storage */ }
  if (timeMode === 'cycle') hour = 12;        // noon: the game begins at midday (held there till the village has met you)
  holdHour = true;
  await applyGear(true);
  zombies.forget();
  layArms([]);
  villagers.endGather();
  // you're put where you'll wake (unseen till then): the sun's shadows, which follow you, fall on the
  // meadow the opening plays in
  player.pos.set(CRATER.x + 0.6, 0, CRATER.z); player.vel.set(0, 0, 0);
  started = true; paused = false; introBusy = true;
  setCinema(true);
  if (touch) document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  else lockPointer();
  if (!intro) {
    const say = (text) => title.status(text);
    intro = new Intro({ ui, scene, camera, worldPass, renderer, sfx, foes, ctx, villagers, light: cometLight, smoke, particles: magic.particles,
      // a frame drawn as the game draws one (hands: with your arms in it)
      render: (hands = false) => { showUnder(); const was = vmPass.enabled; vmPass.enabled = hands; composer.render(1 / 60); vmPass.enabled = was; },
      compileTarget: () => composer.readBuffer,
      layArms,
      // the village gathered where it will stand when you wake, for warm's frames of it (on), and
      // back as it was (off); the views of it: from where you wake, and from the crater's rim
      stage: (on) => {
        if (!on) { for (const [a, p, y, v] of staged) { a.root.position.copy(p); a.root.rotation.y = y; a.root.visible = v; } staged = []; return []; }
        const { cast } = gatherSpots();
        staged = [];
        for (const c of cast) {
          const a = villagers.list.find((q) => q.name === c.name);
          if (!a) continue;
          staged.push([a, a.root.position.clone(), a.root.rotation.y, a.root.visible]);
          a.root.position.set(c.at[0], physics.groundAt(c.at[0], c.at[1]), c.at[1]); a.root.rotation.y = Math.atan2(CRATER.x - c.at[0], CRATER.z - c.at[1]); a.root.visible = true;
        }
        const d = new THREE.Vector3(GATHER.x - CRATER.x, 0, GATHER.z - CRATER.z).normalize(), at = new THREE.Vector3(GATHER.x, 1.2, GATHER.z);
        const rim = new THREE.Vector3(CRATER.x, 0, CRATER.z).addScaledVector(d, CRATER.R + 1);
        return [{ pos: new THREE.Vector3(CRATER.x + 0.6, -CRATER.depth + 1.6, CRATER.z), look: at }, { pos: rim.setY(physics.groundAt(rim.x, rim.z) + 1.6), look: at },
          { pos: new THREE.Vector3(GATHER.x, 1.6, GATHER.z).addScaledVector(d, -7), look: at }];
      },
      // the Sworn (built on the animation library's clips) whole before it starts: nothing of them is
      // retargeted while it plays (knight_a stands in if they never come)
      knight: async () => { await Promise.race([foes.swornReady, new Promise((r) => setTimeout(r, 90000))]); return foes.gltf.sworn_m ? 'sworn_m' : 'knight_a'; },
      // what comes after it, brought in now: the whole village (a phone brings them one at a time),
      // the knight's armour in the crater, his sword, shield and staff, and the gauntlets you're given
      preload: async (line) => {
        const all = villagers.wanted || 0;
        const count = () => line(`The village comes out to look… ${Math.min(villagers.list.length, all)} of ${all}`);
        count();
        const every = setInterval(count, 300);
        await Promise.race([villagers.ready, new Promise((r) => setTimeout(r, 120000))]).finally(() => clearInterval(every));
        line('The knights of the open country…');
        await Promise.race([foes.ualReady, new Promise((r) => setTimeout(r, 60000))]);
        if (voice.enabled && voice.neural !== 'failed' && voice.neural !== 'off') {
          const tell = () => { const [g, o] = voice.progress; line(o ? `The voices of the village… ${g} of ${o}` : 'The voices of the village…'); };
          tell();
          const each = setInterval(tell, 300);
          await Promise.race([voice.ready, new Promise((r) => setTimeout(r, 240000))]).finally(() => clearInterval(each));
        }
        // what they'll say to you from the rim, made now, so each line is in the air the moment it's due
        voice.prefetch(GATHER_TALK.map((w) => { const v = villagers.list.find((q) => q.name === w.name); return [v || { name: w.name }, w.text, v ? villagers.voiceOf(v) : { key: w.name }]; }));
        line('The knight’s arms and armour…');
        await Promise.all([ctx.crater.armourReady, vm.prefetch('wayfarer'),
          ...['vigilsword', 'vigilshield', 'vigilstaff'].map((id) => { const it = makeUnique(id); return vm.modelScene(it.model, it.finish); })]
          .map((p) => Promise.resolve(p).catch((e) => console.warn('the opening, bringing in', e))));
      },
      compileAlso: [[vm.scene, vm.camera]],
      // the picture sized once, before it starts (the frame-time easing is held while it plays):
      // smaller if its heaviest shot would draw slowly for want of the GPU (a smaller picture is no
      // help to a frame the CPU holds up)
      calibrate: (ms, gpu) => {
        const was = res.level, want = ms > 22 && gpu > ms * 0.35 ? res.fit(Math.sqrt(16 / ms)) : was;
        console.info(`the opening: ${ms.toFixed(1)} ms a frame (${gpu.toFixed(1)} waiting on the GPU) at ${(res.rs * 100).toFixed(0)}%${want !== was ? `, drawing it at ${(res.LEVELS[want] * 100).toFixed(0)}%` : ''}`);
        if (want !== was) { res.set(want); resize(); }
      },
      onImpact: () => layArms(),
      onPlace: placeInCrater,
      onControl: () => {
        introBusy = false; setCinema(false); if (!touch && !document.pointerLockElement) pause();
        music.endIntro(6);   // (the opening's song fades as you wake; the place's music follows)
      },
      onDone: () => { introBusy = false; setCinema(false); saveProgress(); const done = intro; intro = null; setTimeout(() => done.dispose(), 500); } });
    await intro.prepare(say);
  }
  title.hide();   // (it fades off the opening's first shot)
  intro.start(touch);
}

/** The opening hides the HUD and the marks over heads; the game has them back after. */
function setCinema(on) {
  hud.hud.classList.toggle('hidden', on);
  villagers.bubbles.hidden = on;
  if (touch) { hud.showTouch(!on); gameInput.release(); }
  if (!on) hud.refresh(vm.equip, book);
}

// After the green star the village comes out to the crater and stands round its rim, looking down at
// you as you wake, and talks to you from there. GATHER is the rim toward the town (where you face as
// you wake, and where Sister Odile stands); each of the rest stands [name, degrees round the rim from
// her], RING metres from the crater's middle.
const RING = CRATER.R + 2.5;
const GATHER_DIR = (() => { const l = Math.hypot(30, 12); return [30 / l, 12 / l]; })();   // (toward the town)
const GATHER = { x: CRATER.x + GATHER_DIR[0] * RING, z: CRATER.z + GATHER_DIR[1] * RING };
const GATHER_CAST = [['Odile', 0], ['Osric', -38], ['Hesk', 38], ['Garrow', -78], ['Tobias', 80], ['Wren', -122], ['Elsie', 125]];
// what they say among themselves while you're still down in it (round again, till you come)
const GATHER_CHATTER = [
  { name: 'Elsie', text: 'Did you see it? He fell right out of the sky!' },
  { name: 'Tobias', text: 'Out of the sky, in a ball of green fire.' },
  { name: 'Wren', text: 'Spinning like a top, all the way down.' },
  { name: 'Osric', text: 'And square on top of one of the Sworn.' },
  { name: 'Garrow', text: "Nothing left of that knight but his armour." },
  { name: 'Hesk', text: 'Nobody lives through a fall like that.' },
  { name: 'Elsie', text: 'Is he dead, down there?' },
  { name: 'Odile', text: 'Green fire out of the vault of heaven… It cannot be. It cannot.' },
  { name: 'Tobias', text: "Stay back from the edge, all of you. The ground's still smoking." },
  { name: 'Wren', text: 'Somebody ought to go and look.' },
  { name: 'Osric', text: 'After you, then.' },
  { name: 'Elsie', text: 'Do you think he is an angel?' },
  { name: 'Hesk', text: "If he lives, he'll come to us. Wait." },
];
// and when he climbs up out of it
const GATHER_SIGHT = [
  { name: 'Elsie', text: "There! He's climbing out!" },
  { name: 'Tobias', text: "Saints preserve us. He's alive." },
  { name: 'Wren', text: "He's in his smallclothes!" },
  { name: 'Odile', text: 'Nobody run. Let him come to us.', wave: true },
];
// what they tell you when you come to them, in turn (and give you)
const GATHER_TALK = [
  { name: 'Odile', text: "Gently, now. You're among friends. This is Bellmourn.", wave: true },
  { name: 'Elsie', text: 'You fell out of the sky! In a ball of green fire! We all saw!' },
  { name: 'Osric', text: "And came down on one of Lord Velscour's Sworn. There's nothing left of him but his armour." },
  { name: 'Odile', text: 'A green star out of heaven, a man curled as a child, girded in black. It is written, child.' },
  { name: 'Odile', text: 'You are Tessariel. The Sacred Flame, sent down to kill the Demon Lord Velscour.' },
  { name: 'Hesk', text: "Hush! Say that name where the garrison can hear and they'll hang the lot of us." },
  { name: 'Tobias', text: 'Velscour rules us from his far throne. The Book says you will end him. It is your destiny.' },
  { name: 'Garrow', text: "Not in your smallclothes, though. Here: you'll want more than that.", gift: 'armor' },
  { name: 'Wren', text: "Wraps for your hands. The knight's sword and shield are in the crater: take them.", gift: 'gloves' },
  { name: 'Tobias', text: "Forty crowns from the inn's box. Don't spend it all on ale.", gift: 'gold' },
  { name: 'Hesk', text: 'Draughts, dear. Red for the blood, blue for the mind.', gift: 'potions' },
  { name: 'Odile', text: 'But before the Fiend, Flame, we have a task for you.' },
  { name: 'Odile', text: 'The dead are walking beneath our cathedral. Speak with me, and I will tell you all of it.' },
];

/** Where each of the village stands round the crater's rim (all facing its middle, Odile toward the
 * town), and f: the way from her into the crater. */
function gatherSpots() {
  const f = [-GATHER_DIR[0], -GATHER_DIR[1]], a0 = Math.atan2(GATHER_DIR[1], GATHER_DIR[0]);
  return { f, cast: GATHER_CAST.map(([name, deg]) => { const a = a0 + deg * Math.PI / 180; return { name, at: [CRATER.x + Math.cos(a) * RING, CRATER.z + Math.sin(a) * RING] }; }) };
}
let staged = [];   // (the village as it was, while warm draws it gathered)

/** In the black after the white: you stand in the crater's middle, facing the town, and the village
 * stands round the rim above you, looking down; they speak to you from there as you wake. */
function placeInCrater() {
  const x = CRATER.x + 0.6, z = CRATER.z;
  player.pos.set(x, physics.groundAt(x, z), z); player.vel.set(0, 0, 0);
  player.yaw = Math.atan2(-(GATHER.x - x), -(GATHER.z - z)); player.pitch = 0.06;   // (toward them)
  player.health = player.maxHealth; player.mana = player.maxMana;
  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  const { f, cast } = gatherSpots();
  villagers.postAt = { Odile: [GATHER.x, GATHER.z, Math.atan2(f[0], f[1])] };   // she waits there till you take her work
  progress = { ...(progress || {}), arrived: true, welcomed: false, gifts: [] };
  const done = () => { holdHour = false; progress.welcomed = true; hud.toast('Sister Odile has a task for you: walk up to her and press E'); saveProgress(); };
  const out = (p) => Math.hypot(p.pos.x - CRATER.x, p.pos.z - CRATER.z) > CRATER.R - 2 && p.pos.y > -0.8;   // up at the rim, or over it
  if (!villagers.gather(player, cast, { look: [CRATER.x, CRATER.z], chatter: GATHER_CHATTER, sight: GATHER_SIGHT, script: GATHER_TALK, out, near: RING + 8, onGift: gift, onDone: done })) {
    for (const w of GATHER_TALK) if (w.gift) gift(w.gift, null);
    done();
  }
}

/** The village's gifts. */
function gift(kind, from) {
  if (progress) (progress.gifts ||= []).push(kind);
  const who = from?.call || '';
  const g = (o) => makeGear({ ilvl: 1, rarity: 0, ...o });
  const give = (items, say) => {
    for (const it of items) { if (addToBag(char, it)) autoEquip(it); }
    hud.toast(say);
    sfx.equip();
  };
  if (kind === 'armor') give([g({ slot: 'body', base: 'Gambeson' }), g({ slot: 'legs', base: 'Padded Chausses' }), g({ slot: 'feet', base: 'Riding Boots' }), g({ slot: 'head', base: 'Leather Cap' })],
    `${who || 'Garrow'} gives you a gambeson, padded chausses, riding boots and a leather cap`);
  else if (kind === 'gloves') give([g({ slot: 'hands', model: 'wayfarer' })], `${who || 'Wren'} gives you a wayfarer's gauntlet`);
  else if (kind === 'gold') { char.gold += 40; sfx.coin(); hud.toast(`${who || 'Tobias'} gives you 40 gold`); }
  else if (kind === 'potions') give([makePotion('life', 4), makePotion('mana', 3)], `${who || 'Mother Hesk'} gives you 4 healing and 3 mana draughts`);
  saveCharacter(char);
  bag.render();
}

/** What's under the ground: drawn only from below it, or from the head of the stairs down to it. */
function showUnder() {
  const cp = camera.position, atStairs = ctx.entrances.some(([x, z]) => Math.hypot(cp.x - x, cp.z - z) < 30);
  for (const m of ctx.builtUnder) m.visible = cp.y < physics.groundAt(cp.x, cp.z) + 0.5 || atStairs;   // (the crater's floor is below 0 but not under it)
  ctx.detail?.update(cp);   // (and the small pieces far off left out: engine.js DetailCull)
}

// ------------------------------------------------------------------ the sounds of the place
let here = null, hurtAt = -1e9;
const found = new Set((() => { try { return JSON.parse(localStorage.getItem('bm.found') || '[]'); } catch { return []; } })());
// the places worth a stinger the first time you come to them
const FINDS = /^(The Green Downs|Millhaven|Brightwater Falls|Blackvigil Keep|The Bellmourn Graveyard|The Darkwood)$/;

/** Which of the music's sets (music.js SETS) plays where you are. */
function musicSet(z, p) {
  if (!z) return 'village';
  if (z.kind === 'under') return 'under';
  if (z.name === 'Blackvigil Keep' || z.name === 'The Vigil Road' || ctx.keep?.regionOf?.(p)) return 'keep';
  if (p.x > GRAVEYARD.x0 - 4 && p.x < GRAVEYARD.x1 + 4 && p.z > GRAVEYARD.z0 - 4 && p.z < GRAVEYARD.z1 + 4) return 'graveyard';
  if (z.name === 'The Darkwood' || z.name === 'The Bellwood Trail') return 'wood';
  if (p.x > REGION.x0) return 'downs';
  return 'village';
}

/** What's under your feet: water (wading), wood (floors, bridges), stone (below, the plaza, the
 * cathedral, the keep), or earth. */
function underfoot() {
  const p = player.pos, z = here || {};
  if (p.x > REGION.x0) {
    const s = streamAt(p.x, p.z), r = riverAt(p.x, p.z);
    if ((s.d < 5 && p.y < streamLevel(s.s) + 0.05) || (r.d < 4.5 && p.y < riverLevel(r.s) + 0.05) || (Math.hypot(p.x - POOL.x, p.z - POOL.z) < POOL.r && p.y < POOL.level + 0.05)) return 'water';
  }
  if (z.kind === 'under') return /Grotto/.test(z.region || '') && Math.random() < 0.3 ? 'water' : 'stone';
  const g = physics.groundAt(p.x, p.z);
  if (z.kind === 'in') return /Cathedral|Sacristy|Stair|Mausoleum|Hall of the Sworn|Barracks of the Vigil|Chapel|Armoury|Reliquary|Throne/.test(z.name) ? 'stone' : 'wood';
  if (physics.dynamic.some((d) => p.x > d.x0 && p.x < d.x1 && p.z > d.z0 && p.z < d.z1)) return 'wood';   // (the rope bridge)
  if (p.y > g + 0.12) return 'stone';   // (on something built: steps, a wall walk, a pad)
  if ((Math.abs(p.x) < 21 && Math.abs(p.z) < 21) || (Math.abs(p.x) < 17 && Math.abs(p.z + 47.5) < 8.5) || z.name === 'Blackvigil Keep') return 'stone';   // (the plaza, the forecourt, the keep)
  return 'dirt';
}
/** In mail or plate: the footsteps jingle. */
const inMail = () => /Mail|Brigandine|Plate/.test(`${char.equip.body?.base || ''} ${char.equip.legs?.base || ''}`);

/** Each frame: where you hear from; the music (the place's, a fight's); the world's own sound. */
function sounds(dt) {
  sfx.hear(camera);
  if (!sfx.ctx) return;
  const z = here, p = player.pos, playing = started && !introBusy;
  const set = musicSet(z, p);
  // how many hunt you, near (a knight or a sorcerer counts twice; a lord's fight more)
  let threat = 0;
  if (playing) {
    for (const e of zombies.list) {
      if (e.dead || e.gone || !e.aggro) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
      if (dx * dx + dz * dz > 24 * 24 || Math.abs(e.pos.y - p.y) > 6) continue;
      threat += e.kindName === 'knight' || e.kindName === 'sorcerer' ? 2 : 1;
    }
    for (const e of slimes.list) {   // (a big slime counts as one of the dead; a small one, half)
      if (e.dead || !e.aggro) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
      if (dx * dx + dz * dz > 24 * 24 || Math.abs(e.pos.y - p.y) > 8) continue;
      threat += e.big ? 1 : 0.5;
    }
    if (foes.bossBar(player)) threat += 3;
  }
  music.update(dt, { set, threat, hurt: performance.now() - hurtAt < 4000, paused: paused || !started });
  ambience.update(dt, { on: playing, zone: z, set, out: L.out, under: L.under, day: day.day, hour, flames: flameList, crater: CRATER.k, paused });
  // somewhere new: a stinger, the first time
  const place = z?.kind === 'under' ? z.region : z?.name;
  if (playing && place && (z.kind === 'under' || FINDS.test(place)) && !found.has(place)) {
    found.add(place);
    try { localStorage.setItem('bm.found', JSON.stringify([...found])); } catch { /* no storage */ }
    music.stinger('found');
  }
}

// ------------------------------------------------------------------ the loop
const clock = new THREE.Clock();
let t = 0, lastBob = 0, shadowFrame = 0, mapT = 0, saveT = 10;
const QUICK = { Digit1: 'onehand', Digit2: 'twohand', Digit3: 'staff', Digit4: 'shield_round', Digit5: 'shield_kite' };

let lastFrame = performance.now(), lastWork = 0;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  // (held through the opening: it's sized once, before it)
  if (res.frame(now - lastFrame, lastWork, ready && started && !paused && !introBusy)) resize();
  lastFrame = now;
  tick(Math.min(0.05, clock.getDelta()));
  lastWork = performance.now() - now;
}

/** One frame of the game: input, the player, hands, magic, light, then the picture. */
function tick(dt) {
  t += dt;
  if (!ready) return;
  const inp = gameInput;
  if (intro?.running) {   // the opening has the camera: Esc (or a click or tap) skips it
    intro.update(dt);
    if (inp.was('Escape') || inp.was('Space')) intro.skip();
  }
  const active = started && !paused && !bag.open && !map.open && !quests.open && !saves.open && !introBusy;

  if (started && !introBusy && (inp.was('Tab') || inp.was('KeyI'))) { quests.close(); setInventory(!bag.open); }
  if (started && !paused && !introBusy && inp.was('KeyM')) { quests.close(); setMap(!map.open); }
  if (started && !paused && !introBusy && inp.was('KeyL')) { if (bag.open) setInventory(false); if (map.open) setMap(false); quests.showLog(!quests.open); }
  if (started && !paused && !introBusy && inp.was('KeyT')) quests.toggleTracker();
  if (started && !introBusy && inp.was('Escape')) {
    if (quests.open) quests.close();
    else if (saves.open) { saves.show(null); if (!paused && !touch) lockPointer(); }
    else if (bag.open || map.open) { bag.show(false); map.show(false); pause(); } else if (touch) pause();
  }
  if (active) {
    player.update(dt, inp);
    for (const [code, kind] of Object.entries(QUICK)) if (inp.was(code)) equip(kind);
    if (inp.was('KeyQ')) drink('life');
    if (inp.was('KeyZ')) drink('mana');
    // right hand
    // (a blade asked for again mid-blow goes on into the next of its combo: the view model
    // queues it; the swish comes with each blow's own whoosh)
    const bolt = BOLTS[vm.equip.R];
    bashCool -= dt; sweepCool -= dt;
    if (vm.blocking && inp.was('Mouse0')) shieldBash();                 // (a swing with the shield up: a bash)
    else if (bolt) {
      // a staff: held, it gathers its bolt; let go, it flies (a tap, a plain bolt)
      if (inp.held('Mouse0') && !vm.busy('R') && staffCharge < 0 && player.mana >= bolt.mana) staffCharge = 0;
      if (staffCharge >= 0 && inp.held('Mouse0')) {
        staffCharge += dt;
        const k = Math.min(1, Math.max(0, staffCharge - 0.25) / 1.0);
        if (k > 0 && Math.random() < dt * 40) magic.particles.burst(fromView(vm.castPoint('R'), 0.62), [new THREE.Color('#ffffff'), new THREE.Color('#c0fff0'), new THREE.Color('#30c8b0')], 1 + Math.round(k * 3), { speed: 0.4 + k, size: 0.015 + k * 0.03, grav: -1, life: 0.3 });
      } else if (staffCharge >= 0) {
        const k = 1 + Math.min(1, Math.max(0, staffCharge - 0.25) / 1.0) * 1.5, cost = Math.round(bolt.mana * (k > 1.05 ? 0.6 + k * 0.6 : 1));
        staffCharge = -1;
        if (player.mana < cost) noMana();
        else {
          const did = vm.attackRight();
          if (did && did !== 'queued') { player.mana -= cost; pending.R = { def: k > 1.05 ? { ...bolt, size: bolt.size * (1 + (k - 1) * 0.6), power: bolt.power * k, burst: Math.round(bolt.burst * k), dmgMul: k } : bolt, side: 'R' }; }
        }
      } else if (inp.was('Mouse0') && player.mana < bolt.mana) noMana();
    } else if (inp.held('Mouse0')) vm.attackRight();
    // left hand (shields are held up as long as the button is); a staff with the left hand free sweeps
    if (vm.equip.R === 'staff' && !vm.equip.L && inp.was('Mouse2')) staffSweep();
    const wasBlocking = vm.blocking;
    vm.actLeft(inp.held('Mouse2'));
    if (vm.blocking && !wasBlocking) blockAt = zombies.time;
    for (const k of SPELL_KEYS) if (inp.was('Key' + k)) castSlot(k);   // (F, R, X, C, V)
    // footsteps on the bob's down-beats
    if (player.onGround && player.speed > 1 && Math.floor(player.bob / Math.PI) !== Math.floor(lastBob / Math.PI)) sfx.step(underfoot(), player.speed > 7.5, inMail());
    lastBob = player.bob;
    // the swing's kick and the spells' blasts
    const sh = shake + magic.shake;
    if (sh > 0) {
      camera.rotation.x += (Math.random() - 0.5) * 0.012 * sh;
      camera.rotation.y += (Math.random() - 0.5) * 0.012 * sh;
      shake = Math.max(0, shake - dt * 5);
    }
  } else if (!started && !intro?.running) { // a slow drift round the plaza behind the title
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
  // doors: the one you're looking at, and E to open or close it
  // and the chest, crate, barrel or sack you're looking at, to search with E
  // and the person in front of you, to speak with (and take work from)
  const who = active ? villagers.aimed(camera) : null;
  if (who) {
    const mark = quests.markOf(who.name);
    hud.prompt(mark === '!' ? `E — ${who.call} has work for you` : mark === '?' ? `E — speak with ${who.call} (the work is done)` : `E — speak with ${who.call}`);
    if (inp.was('KeyE')) { if (!quests.talk(who.name, who)) villagers.talkTo(who, player); else if (!who.gathered) { villagers.stopScenes(who); villagers.face(who, player); } }
  } else if (active && ctx.catacombs.prompt) {
    hud.prompt(ctx.catacombs.prompt);
    if (inp.was('KeyE')) ctx.catacombs.act?.();
  } else if (active && ctx.catacombs.bell?.prompt) {
    hud.prompt(ctx.catacombs.bell.prompt);
    if (inp.was('KeyE')) ctx.catacombs.bell.ring(zombies, sfx, hud);
  } else if (active) {
    const door = ctx.doors.aimed(camera), box = ctx.loot.aimed(camera);
    const boxFirst = box && (!door || box.x !== undefined && camera.position.distanceTo(_v.set(box.x, box.y, box.z)) < camera.position.distanceTo(door.center));
    if (boxFirst) {
      hud.prompt(box.searched ? `The ${box.holds.name} is empty` : box.sealed || `E — search the ${box.holds.name}`);
      if (box.sealed && inp.was('KeyE')) { sfx.lock(false); hud.toast('It will not open while he lives'); }
      if (!box.searched && !box.sealed && inp.was('KeyE')) {
        const n = ctx.loot.search(box, player);
        if (box.holds?.kind === 'chest' || /chest|coffer|coffin/i.test(box.holds?.name || '')) sfx.chest(true); else sfx.splinter(false);
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
  player.blocking = vm.blocking;            // (the Sworn bash through a raised shield)
  ctx.doors.update(dt);
  ctx.props.update(dt);   // (searched chests' lids swinging open, broken things' pieces flying)
  if (active) ctx.loot.update(dt, player);
  ctx.trees3d.update(t);
  ctx.tufts.update(t);
  ctx.crater.update(dt, t, camera);
  ctx.fireflies.update(dt, t, camera, 1 - day.day, L.under > 0.5 || camera.position.y < physics.groundAt(camera.position.x, camera.position.z) - 1);
  // the crater's glow (the opening has the light while it runs)
  if (!intro?.running) {
    const fl = 0.8 + 0.2 * Math.sin(t * 7.1) * Math.sin(t * 3.3);
    cometLight.position.set(CRATER.x, physics.groundAt(CRATER.x, CRATER.z) + 1.4, CRATER.z);
    cometLight.distance = 24; cometLight.intensity = CRATER.k ? 7 * fl * (0.4 + 0.6 * (1 - day.day)) : 0;
  }
  showUnder();
  for (const a of villagers.list) {   // (villagers' shadows: near you only)
    const near = Math.abs(a.pos.x - camera.position.x) < 42 && Math.abs(a.pos.z - camera.position.z) < 42;
    if (a.castsNear !== near && a.casts) { a.castsNear = near; for (const m of a.casts) m.castShadow = near; }
  }
  for (const f of ctx.animated) f(dt, t);
  zombies.update(dt, player, active, camera, H, 0.3 + 0.7 * day.day);
  slimes.update(dt, player, active, camera, H);
  ctx.catacombs.update(dt, player, zombies, active);   // the bridge, its ambush, the First Bell
  foes.night = day.day < 0.35;          // (some of the Sworn carry a lantern after dark)
  foes.update(dt, player);
  chatter.update(dt, player, active);
  for (const c of ctx.caves) if (c !== foes.cave) c.update(dt, player);   // (the Gloamhollow is the foes')
  ctx.keep.update(dt, t, player);
  hud.boss(foes.bossBar(player) || quests.bossBar(player));
  if (active || started) quests.update(dt, player);
  hud.xp(char.level, char.xp, char.level >= MAX_LEVEL ? 0 : xpToNext(char.level));
  if ((saveT -= dt) <= 0 && started && !introBusy) { saveT = 10; saveProgress(); }
  villagers.update(dt, player, hour, (p) => zombies.list.some((z) => !z.dead && !z.gone && z.standing && (z.aggro || z.kindName === 'knight' || z.kindName === 'sorcerer') && Math.abs(z.pos.x - p.x) < 14 && Math.abs(z.pos.z - p.z) < 14));
  ctx.water?.update(dt, t, { camera, height: H, sun, hemi, day });
  magic.update(dt, camera, H, player);
  flames.update(t, camera, H);
  smoke.update(dt, camera, H, 0.25 + 0.75 * day.day * (1 - L.under) + 0.1);
  light(dt, t);
  hud.update(player, book);
  hud.clockTime(hour);
  if (started && ((mapT += dt) > 0.1 || map.open)) { mapT = 0; map.update(player); }   // the corner map ten times a second

  vmPass.enabled = started && !introBusy; // no arms behind the title screen, or in the opening
  if (touch && HI) renderer.shadowMap.needsUpdate = (++shadowFrame & 1) === 0 || magic.lights.some((l) => l.light.intensity > 0);
  sounds(dt);
  res.timer.begin(); composer.render(dt); res.timer.end();
  if (++run.frames % 30 === 1) trace();
  inp.endFrame();
}

// ------------------------------------------------------------------ go
hud = new Hud(ui, { spells: SPELLS, items: ITEMS });
try { Object.assign(book, JSON.parse(localStorage.getItem('bm.book') || '{}')); } catch { /* first visit */ }
// (the title screen is up already, and shows how the loading goes: title.js)
if (lastRun) title.lastRun(lastRun);
gameInput = new Input(canvas, ui);
// a phone can take the GPU back (short of memory, or the browser put away): start over on a tap
canvas.addEventListener('webglcontextlost', () => {
  lost = true; ready = false;
  bag?.show(false); hud.showTouch(false);
  title.hide(true);
  hud.showOverlay('lost', touch);
});
canvas.addEventListener('mousedown', () => sfx.start());
// the pause screen's menu (hud.onMenu), and a click elsewhere on it resumes
hud.overlay.addEventListener('click', (e) => { if (e.target.closest('.menu')) return; if (lost) location.reload(); else if (hud.mode === 'pause') begin(); });
hud.overlay.addEventListener('touchend', (e) => { if (e.target.closest('.menu')) return; e.preventDefault(); if (lost) location.reload(); else if (hud.mode === 'pause') begin(); });
// the settings (in the title's Settings window, which the pause screen opens too)
const $ = (id) => document.getElementById(id);
const optRes = $('optRes'), optTex = $('optTex'), optSens = $('optSens'), optGfx = $('optGfx'), optTime = $('optTime');
optRes.value = String(res.choice);
optRes.onchange = () => { res.choice = Number(optRes.value); localStorage.setItem('bm.res', optRes.value); resize(); };
optTex.value = TEXELS;
optTex.onchange = () => { localStorage.setItem('bm.texels', optTex.value); saveProgress(); title.reload(); };   // (the shaders are made with it)
optSens.value = localStorage.getItem('bm.sens') || '1';
const sens = () => { gameInput.sensitivity = 0.0022 * Number(optSens.value); gameInput.touchLook = 0.006 * Number(optSens.value); };
optSens.oninput = () => { localStorage.setItem('bm.sens', optSens.value); sens(); };
sens();
optGfx.value = QUALITY;
optGfx.onchange = () => { localStorage.setItem('bm.quality', optGfx.value); saveProgress(); title.reload(); };
optTime.value = timeMode;
optTime.onchange = () => {
  timeMode = optTime.value; localStorage.setItem('bm.time', timeMode);
  hour = { golden: 17.6, noon: 12, night: 23, cycle: hour }[timeMode];
};
resize();
build().then(() => {
  title.ready(titleState);   // (the menu comes up once Bellmourn's logo is in)
  window.bellmourn = { scene, camera, renderer, composer, player, vm, magic, physics, ctx, lib, bill, kit, zombies, foes, villagers, slimes, char: () => char, guard, bag, map, setInventory, setMap, hurtPlayer, applyGear, melee, equip, assign, castSlot, hud, begin, L,
    quests: () => quests, saves: () => saves, intro: () => intro, newGame, continueGame, snapshot, restore, reward, onDeath, cometLight,
    setHour: (h) => { hour = h; }, get hour() { return hour; }, torchPool, sun, hemi, bloom, grade, tick, RaycasterClass: THREE.Raycaster, title, latestSave, voice, music, ambience, sfx, input: () => gameInput, combat: () => ({ riposte: riposteUntil > zombies.time, blockAt, staffCharge }) };
}).catch((e) => {
  console.error(e);
  window.bootError = e;
  title.status('Failed to load: ' + e.message);
});
frame();
