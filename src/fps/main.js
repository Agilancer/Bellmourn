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
import { makeRenderer, multisample, refineScene, visibleMatrices, DetailCull, settled, texturesOf, upload, compile, programCount, hideUnported, findBadDraw, Resolution, TEXELS, groundMist, WEBGPU, MIST } from './engine.js';
import { fogNode, SKY, settled as settledGraph } from './nodes.js';
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
import { speak, hush, hushAll, tickSpeech, speaking } from './speech.js';
import { Chatter } from './chatter.js';
import { Doors } from './doors.js';
import { Nav } from './nav.js';
import { Scatter3D, isVegetation } from './scatter3d.js';
import { Trees3D } from './trees3d.js';
import { Cutouts } from './cutout.js';
import { Loot, placeLevel } from './loot.js';
import { useManifest, loadCharacter, saveCharacter, computeStats, fitCharacter, newCharacter, addToBag, slotFor, makeGear, makePotion, RARITY } from './gear.js';
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
import { Crater, CRATER, craterHeight, formCrater } from './crater.js';
import { Intro } from './intro.js';
import { Ambience } from './ambience.js';
import { Quests, GIVERS } from './quests.js';
import { SaveMenu, SLOT_COUNT, readSlot } from './saves.js';
import { grantXp, xpFor, xpToNext, fitLevel, MAX_LEVEL, POINTS_PER_LEVEL } from './level.js';
import { makeUnique } from './uniques.js';
import { Fireflies } from './polish.js';
import { Tufts } from './grass.js';
import { Portals, PortalMenu, keepPortalsClear, SEAL_H } from './portals.js';
import { shoveArea, launchWave, stepWaves } from './shovewave.js';
import { DebugMenu } from './debug.js';
import { Trade, SHOPS, MERCHANT_OF, SHOP_POSTS, drawShopMark } from './trade.js';
import { GemFx } from './gemfx.js';
import { Respawns } from './respawn.js';
import { deathDrops, greatDrops, containerDrops, makeMat, makeRecipe } from './craft.js';
import { makeGem, GEMS } from './gems.js';

const touch = TOUCH;
// the composer's classes: WebGL's from three's addons (r170's: they'd not load under r187's WebGPU
// build), WebGPU's its own (post.js)
const POST = WEBGPU ? await import('./post.js') : await (async () => {
  const [a, b, c, d, e] = await Promise.all(['EffectComposer', 'RenderPass', 'UnrealBloomPass', 'OutputPass', 'ShaderPass'].map((n) => import(`three/addons/postprocessing/${n}.js`)));
  return { EffectComposer: a.EffectComposer, RenderPass: b.RenderPass, UnrealBloomPass: c.UnrealBloomPass, OutputPass: d.OutputPass, ShaderPass: e.ShaderPass };
})();
// mist lying on the graveyard's ground (in the fog shader, so made before anything is compiled)
groundMist([GRAVEYARD.x0, GRAVEYARD.z0, GRAVEYARD.x1, GRAVEYARD.z1], { density: 0.055 });
// the mouse captured for looking (a refusal, say from a window in the background, is no matter)
const lockPointer = () => { try { document.getElementById('game').requestPointerLock?.()?.catch?.(() => {}); } catch { /* not now */ } };
const QUALITY = localStorage.getItem('bm.quality') || (touch ? 'low' : 'high');
const HI = QUALITY === 'high';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
// (WebGPU: once the GPU's device is ours; where there's none to be had, the page goes back to WebGL
// for the rest of the session: index.html)
const renderer = await (async () => {
  try { return await makeRenderer(canvas, { touch }); } catch (e) {
    if (!WEBGPU) throw e;
    console.warn('WebGPU would not start: drawing with WebGL', e);
    try { sessionStorage.setItem('bm.nogpu', '1'); } catch { /* no storage */ }
    location.reload();
    return new Promise(() => {});
  }
})();
const res = new Resolution({ touch });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = HI;
// a phone at high: plain PCF (a quarter the taps of soft), the sun's map redrawn every other
// frame (see tick), and less of everything else below
// (WebGPU has no soft PCF of its own: its PCF, softened by each light's radius)
renderer.shadowMap.type = touch || WEBGPU ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
if (touch) renderer.shadowMap.autoUpdate = false;   // (WebGPU: each light's own, light() and tick())

// the world camera: the rigs' 90 degree horizontal view at 16:10 (64 degrees vertical), which
// stays the vertical view at any aspect ratio
const camera = new THREE.PerspectiveCamera(64, 1.6, 0.05, 1200);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa9b7c4, 40, 280);
scene.background = new THREE.Color(0x000000);
if (WEBGPU) scene.fogNode = fogNode(scene.fog, MIST);   // (the graveyard's ground mist in it: engine.js groundMist)
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
    + `${run.bringing ? `, bringing ${run.bringing}` : ''}, ${i.memory.textures} textures, ${programCount(renderer)} shaders${WEBGPU ? ' (WebGPU)' : ''}, ${(performance.now() / 1000).toFixed(1)}s`;
  try { localStorage.setItem(TRACE, s); } catch { /* no storage */ }
}
addEventListener('pagehide', () => { try { localStorage.removeItem(TRACE); } catch { /* no storage */ } });
let ready = false;
let hud, vm, player, magic, flames, skyDome, shafts, mist, smoke, physics, ctx, bill, gameInput, lib, kit, zombies, foes, villagers, slimes;
let sunShadows = null;   // (WebGPU: the sun's two maps, sunshadow.js)
let cells = null;        // (WebGPU: the still world in render bundles, cells.js)
let quests = null, saves = null, portalMenu = null, intro = null, introBusy = false, holdHour = false, chatter = null, questVoice = null;
let trade = null, gemFx = null, respawns = null;   // the merchants (trade.js), the gems' looks (gemfx.js), the world filling up again (respawn.js)
// the Debug Menu's cheats (debug.js, behind Velscour's Skull by the corner map): enemies' blows off,
// no-clip (flyFrom: where you took off, which a save keeps while you fly), and GOD MODE
const cheats = { noDamage: false, fly: false, god: false };
let debugMenu = null, debugFrom = null, flyFrom = null;
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
// (WebGPU: post.js, the same steps in a node graph, the last of them done in one pass)
const { composer, worldPass, vmPass, bloom, grade } = WEBGPU
  ? POST.makeComposer(renderer, scene, camera, { samples: touch ? 2 : 4, bloom: HI || QUALITY === 'low', touch })
  : glComposer();
res.gpuTimer(renderer);   // (what the picture's size goes by, where the GPU can time itself)

/** WebGL's composer (three's EffectComposer): the world, the arms over it, bloom, tone mapping, the grade. */
function glComposer() {
const { EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass } = POST;
const composer = new EffectComposer(renderer);
composer.setPixelRatio(1);
multisample(composer, renderer, touch ? 2 : 4);   // (the world's buffer: no jagged edges)
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
return { composer, worldPass, vmPass, bloom, grade };
}

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
  physics.nav = new Nav(physics, ctx.doors);   // (monsters finding their way: out of a house by its door; nav.js)
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
  // (the portals' ground is left bare as the world is built: portals.js)
  const portalsClear = keepPortalsClear(ctx);
  buildWorld(ctx); await mark('world');
  // the catacombs under the cathedral (the Undercroft, the Mourning Gulf's floor and the Deep
  // Undercroft: catacombs.js); Blackvigil Keep; the Darkwood's delves and the cliff's caves
  ctx.entrances = [[STAIRS.x, STAIRS.z]];
  ctx.catacombs = buildCatacombs(ctx);
  ctx.dungeon = ctx.catacombs.upper; ctx.deep = ctx.catacombs.deep; await mark('dungeon');
  buildKeep(ctx); await mark('keep');
  ctx.unders = [{ dg: ctx.dungeon, haunt: 'undercroft', cat: true }, { dg: ctx.deep, haunt: 'deep', cat: true }, { dg: ctx.catacombs.gulfDg, haunt: 'undercroft', cat: true }, ...buildDelves(ctx)];
  await mark('delves');
  portalsClear();
  ctx.portals = new Portals(ctx);   // the star-seals: at every village, and before every keep, barrow and cave
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
    sunShadows?.invalidate();   // (and the sun's map of the still world, where it's kept: sunshadow.js)
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
    { exclude: indoors.map((z) => [z.x0, z.z0, z.x1, z.z1]), layers: 2, base: 0.45, height: 0.35, density: 0.16 });   // (low, so they meet the stones down in the ground mist)
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
    find: () => (st.magicFind || 0) / 100,                    // (gems: better things found)
    extra: (name, lv) => containerDrops(name, lv),             // (materials, gems and plans: craft.js)
  });
  // the gems' looks on what's held (in the hands' scene from the start: its light is in their shaders)
  gemFx = new GemFx(vm, scene, { touch, hi: HI, renderer });
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
  respawns = new Respawns({ zombies });   // (notes how each is made, so it can be made again: respawn.js)
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
  respawns.foes(foes);
  await foes.load(); foes.populate(ctx);
  ctx.foes = foes;
  foes.onBossDown = (f) => {
    hud.toast(`${f.def.title.split(',')[0]} falls, and the seal on the chest breaks`); shake = 1; sfx.lock(true); music.stinger('triumph');
    spill(greatDrops('malgrave', 18), f.pos);   // (his signet, his plans, and the rest: craft.js)
  };
  // the slimes of the caves, the Darkwood's bog, the wet meadow and the falls (slimes.js): they take
  // the dead's blows, blasts and noises through zombies.kin
  slimes = new Slimes(scene, physics, sfx, zombies);
  respawns.slimes(slimes);
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
  magic.onHit = (def, at, d, h, o = {}) => {
    const dmg = (o.dmg ?? def.dmg ?? spellDamage(def)) * (def.dmg || o.dmg ? 1 + st.spellPct / 100 : 1);
    h.z.hit(h, { dmg, dir: d, heavy: o.heavy ?? def.size > 0.4, kind: def.kind, blow: o.blow ?? def.blow ?? SPELL_BLOW[def.kind] ?? 0 });
    if (def.kind === 'staff') gemPowers(h.z, h.point || at, h.bone, dmg, false);   // (a staff's gems ride its bolts)
  };
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
  // the merchants (trade.js): they keep their shops (villagers stay at them) and wear a coin over their heads
  trade = new Trade({ ui, char: () => char, icon: (it, again) => bag.iconOf(it, again), toast: (t) => hud.toast(t), sfx,
    onChange: () => applyGear(), onTrade: () => { saveCharacter(char); bag.render(); },
    onMade: (it, how) => {
      if (how) { hud.announce(how, it.name); magic.particles.burst(player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), [new THREE.Color('#fff2b0'), new THREE.Color('#ffb040')], 40, { speed: 2, size: 0.04, grav: -1, life: 1.2 }); }
      if (!addToBag(char, it)) { const d = ctx.loot.spawn(it, player.pos.x, player.pos.y + 1, player.pos.z, { pop: true }); d.age = -1.5; }
      saveCharacter(char);
    },
    say: (name, text) => { const v = villagers.list.find((a) => a.name === name); if (v && !v.gathered) villagers.say(v, text, true, { now: true, must: true }); },
    onClose: () => setTrade(false) });
  villagers.shops = { Garrow: GIVERS.Garrow.post, Idris: GIVERS.Idris.post, ...SHOP_POSTS };
  villagers.shopMark = (a) => (MERCHANT_OF[a.name] ? '$' + MERCHANT_OF[a.name] : null);
  villagers.drawShopMark = drawShopMark;
  bag.o.onSocket = () => { sfx.chime?.(true); applyGear(); };
  bag.o.onLearn = () => { sfx.quest?.(false); };
  hud.refresh(vm.equip, book);
  map = new WorldMap(ui, ctx, { touch, onClose: () => setMap(false) });
  map.shopMark = drawShopMark;
  // the quests (quests.js): who gives them, what's done, the tracker, the log
  quests = new Quests({ ui, ctx, zombies, foes, villagers, sfx, char: () => char, toast: (t) => hud.toast(t), onReward: reward,
    // (a quest giver reads you the quest aloud, in their own voice, first of anyone: the town's chatter
    // stops for them; closing the window hushes them)
    speak: (name, text) => {
      const v = villagers.list.find((a) => a.name === name);
      if (questVoice && questVoice !== v) hush(questVoice);
      questVoice = v || { name, pos: player.pos };
      speak(questVoice, text, true, { noBubble: true, must: true, now: true, voice: { ...(v ? villagers.voiceOf(v) : { key: name, kind: 'villager' }), pri: 3, pos: v?.pos || player.pos } });
    },
    hush: () => { if (questVoice) hush(questVoice); questVoice = null; },
    onOpen: (on) => { if (touch) { hud.showTouch(!on); gameInput.release(); } else if (on) document.exitPointerLock?.(); else if (started && !paused && !trade?.open) lockPointer(); },
    // (a merchant with work for you: a Trade button in their window too)
    shopOf: (name) => MERCHANT_OF[name], onTrade: (name) => { const v = villagers.list.find((a) => a.name === name); if (v) setTrade(true, v); else quests.close(); },
    onChange: () => { if (quests && villagers) { if (quests.status('undercroft') !== 'available') villagers.postAt = null; } saveProgress(); } });
  villagers.quests = quests;
  map.pins = () => [...quests.pins(villagers), ...shopPins()];
  map.portals = () => ctx.portals.woken();
  portalMenu = new PortalMenu({ ui, onPick: travel, onClose: () => setPortals(false) });
  ctx.portals.onWake = portalWoken;
  // Velscour's Skull by the corner map: the word, then the Debug Menu (debug.js)
  debugMenu = new DebugMenu({ ui, cheats,
    onOpen: () => {
      debugFrom = paused ? 'pause' : 'play';
      if (paused) hud.showOverlay(null);
      if (touch) hud.showTouch(false);
      gameInput.release();
      document.exitPointerLock?.();
      sfx.chime?.(false);
    },
    onUnlock: () => sfx.lock?.(true),
    // (the wrong word, or Cancel: back to where you were; the menu closed: back to the game, or with Esc
    // on a computer to the pause screen, as the map and the bag, since Esc can't take the mouse back)
    onClose: (how) => {
      const from = debugFrom;
      debugFrom = null;
      if (how === 'cancel' && from === 'pause') hud.showOverlay('pause', touch);
      else if (how === 'key' && !touch) pause();
      else begin();
    },
    onToggle: setCheat,
    onPortals: wakeAllPortals,
    portals: () => [ctx.portals.found.size, ctx.portals.list.length],
    onGear: gearDrop,
    onLevel: shiftLevel,
    level: () => [char.level, MAX_LEVEL],
  });
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
  respawns.adopt();   // (everything in the world now comes back when cut down)
  ready = true; run.step = 'loaded';
  await rehearse();
  ctx.props.coldStart();   // (the broken pieces' shaders are compiled now: their stand-ins go)
}

/** Every spell cast once and one of the dead cut to pieces, out past the edge of the world where
 * nothing is (and nobody can go): what they make the first time (their shaders, their shadows) is
 * made now, in the loading, and not in your first fight. Everything is put back after. */
async function rehearse() {
  const T0 = performance.now(), p0 = programCount(renderer);
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
  console.info(`rehearsed in ${Math.round(performance.now() - T0)} ms: ${programCount(renderer) - p0} more programs`);
}

/** Everything in before play, so nothing loads or is made on the GPU mid-game: the whole village and
 * the Sworn, the knight's armour, every arm that can lie on the ground (a phone: the ones it carries
 * and the knight's), every gauntlet (not on a phone); then every picture refined and uploaded, every
 * shader compiled, and the world drawn once whole, with its shadows, so every buffer is on the GPU. */
async function prepare(mark) {
  const T0 = performance.now(), p0 = programCount(renderer);
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
  // (and what else can lie about now: a gem, a plan, a pouch of materials: their shaders made now)
  (await Promise.all([lootModel(makeGem('ruby', 3)), lootModel(makeRecipe('helm')), lootModel(makeMat('iron'))])).forEach((o, i) => { o.position.set(i * 0.6, -52, 0); lying.add(o); });
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
  // (WebGPU: the builders' meshes never move and their materials never change, but for the lit windows
  // and lanterns: three needn't look them over again each frame; nodes.js settled)
  if (WEBGPU && !/[?&]nostatic\b/.test(location.search)) {
    const mutable = new Set([ctx.glass, ctx.lantern].filter(Boolean));
    for (const m of [...(ctx.built || []), ...(ctx.builtUnder || [])]) {
      // (and their matrices worked out once, not every frame: engine.js visibleMatrices)
      if (m.matrixAutoUpdate) { m.updateMatrix(); m.matrixAutoUpdate = false; }
      if (![m.material].flat().some((x) => mutable.has(x))) m.static = true;
    }
  }
  // (WebGPU: the windows' glass drawn over the finished world, as the arms are, not with it: post.js
  // WorldPass.late says why)
  if (WEBGPU && ctx.glass) {
    const late = new THREE.Scene();
    late.fog = scene.fog; late.fogNode = scene.fogNode;
    for (const m of ctx.built || []) if (m.material === ctx.glass && m.parent === scene) { scene.remove(m); late.add(m); }
    worldPass.late = late;
  }
  // (WebGPU: the sun's shadow in two maps, the still world's kept and the moving things' redrawn each
  // frame; made before the shaders are compiled, which take it in)
  if (WEBGPU && HI && sun.castShadow && !/[?&]onemap\b/.test(location.search)) {
    const { installSunShadows } = await import('./sunshadow.js');
    sunShadows = installSunShadows(sun, { isStatic: (o) => o.static === true, staticSize: touch ? 2048 : 4096, dynSize: touch ? 1024 : 2048 });
  }
  // (WebGPU: the still world's pieces in render bundles by 40 m cells, which the GPU replays: cells.js;
  // those are drawn whole, so only what's left is culled piece by piece far off)
  if (WEBGPU && !/[?&]nocells/.test(location.search)) {
    const { makeCells } = await import('./cells.js');
    cells = makeCells(renderer, scene, [...(ctx.built || []), ...(ctx.builtUnder || [])].filter((m) => m.static));
    // and the billboards (sprites.js: a mesh a kind of plant, its graph read only from the material and
    // shared uniforms: settled), still too, in one bundle never culled
    const G = bill.graph;
    if (G) {
      for (const n of [G.world, G.frag, G.castAt, G.mask]) if (n) settledGraph(n);
      const boards = scene.children.filter((o) => o.isMesh && o.material?.positionNode === G.world);
      for (const m of boards) { m.updateMatrix(); m.matrixAutoUpdate = false; m.static = true; }
      cells.addGlobal(boards);
    }
  }
  ctx.detail = new DetailCull(cells ? ctx.built.filter((m) => !m.parent?.isCell) : ctx.built, { touch, under: ctx.builtUnder });
  // pictures: linear-filtered, mipmapped, anisotropic (crisp texels come from the shader), and
  // smooth-edged leaves, hair and lashes
  const r1 = refineScene(scene), r2 = refineScene(vm.scene);
  hideUnported(scene, vm.scene);   // (WebGPU: a GLSL shader left over is hidden, not thrown on)
  const tex = texturesOf(vm.scene, texturesOf(scene));
  await upload(renderer, tex, (k) => title.progress(Math.round(86 + 6 * k)));
  await mark('uploaded');
  await compile(renderer, [[scene, camera], [vm.scene, vm.camera]], composer.readBuffer);
  await mark('compiled');
  await warmWorld();
  scene.remove(lying);
  await mark('warm');
  console.info(`prepared in ${Math.round(performance.now() - T0)} ms: ${tex.size} textures, ${r1.materials + r2.materials} materials (${r1.a2c + r2.a2c} alpha to coverage), ${programCount(renderer) - p0} programs, ${skel} skeletons, ${ctx.detail.list.length} small pieces culled by distance; texels ${TEXELS}, ${W}x${H}`);
}

/** The world drawn once with everything in it shown and nothing culled, so every program it needs is
 * made and every buffer uploaded; then once more into the shadow maps (the sun's, the torches', the
 * spells') with every kind of caster in it, so the depth programs are made too. Drawn into a small
 * buffer of the same kind as the composer's (the programs and buffers don't depend on its size, and
 * a phone isn't asked to draw the whole world at full size). Put back as it was. */
async function warmWorld() {
  if (WEBGPU) return warmWorldGPU();
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

/** WebGPU's warm-up: drawn into a buffer made as the world's is (a pipeline belongs to its buffer's
 * format and samples), with every light's shadow map drawn in the same frame, everything shown and
 * nothing culled, so every pipeline and shadow pipeline is made now. */
async function warmWorldGPU() {
  const small = composer.warmTarget();
  const saved = [];
  scene.traverse((o) => { if (o.isLight) return; saved.push([o, o.visible, o.frustumCulled]); o.visible = true; o.frustumCulled = false; });
  const casters = [];
  scene.traverse((o) => { if (o.isLight && o.castShadow) casters.push([o, o.shadow.autoUpdate]); });
  for (const [l] of casters) { l.shadow.autoUpdate = true; l.shadow.needsUpdate = true; }
  sunShadows?.invalidate(true);   // (the still world's sun map drawn whole, with everything in it)
  cells?.all(true);
  const was = renderer.getRenderTarget();
  renderer.setRenderTarget(small);
  try { renderer.render(scene, camera); } catch (e) {
    if (/[?&]debugrender/.test(location.search)) await findBadDraw(renderer, scene, camera, small);
    throw e;
  }
  renderer.render(vm.scene, vm.camera);
  renderer.setRenderTarget(was);
  await renderer.backend.device?.queue.onSubmittedWorkDone();
  small.dispose();
  for (const [o, v, fc] of saved) { o.visible = v; o.frustumCulled = fc; }
  for (const [l, au] of casters) { l.shadow.autoUpdate = au; l.shadow.needsUpdate = true; }
  cells?.all(false);
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
  const { rt, sc } = iconRT, buf = new Uint8Array(S * S * 4);
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
  if (WEBGPU) {   // (WebGPU reads back only later; its rows come top first)
    renderer.setRenderTarget(null);
    renderer.toneMapping = tm;
    sc.remove(holder);
    return renderer.readRenderTargetPixelsAsync(rt, 0, 0, S, S).then((px) => iconPicture(px, S, false));
  }
  renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf);
  renderer.setRenderTarget(null);
  renderer.toneMapping = tm;
  sc.remove(holder);
  return iconPicture(buf, S, true);
}

/** An icon's pixels (linear light, RGBA) as a data URL; `flip`: its rows bottom first (WebGL's). */
function iconPicture(buf, S, flip) {
  const cv = iconRT.cv, g = cv.getContext('2d');
  // (the target holds linear light: brought to sRGB for the page)
  const lut = iconRT.lut ||= Uint8Array.from({ length: 256 }, (_, i) => { const c = i / 255; return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)); });
  for (let i = 0; i < buf.length; i += 4) { buf[i] = lut[buf[i]]; buf[i + 1] = lut[buf[i + 1]]; buf[i + 2] = lut[buf[i + 2]]; }
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) { const r = flip ? S - 1 - y : y; img.data.set(buf.subarray(r * S * 4, (r + 1) * S * 4), y * S * 4); }
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
  vm.modelScene(it.model, it.finish).then((obj) => renderIcon(obj)).then((url) => { icons.set(key, url); again?.(); });
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
  if (it.type === 'gem') return gemModel(it);
  if (it.type === 'recipe') return scrollModel(it);
  const id = it.type === 'gold' ? 'props/Coin_Pile' : it.type === 'potion' ? (it.kind === 'mana' ? 'props/Potion_2' : 'props/Potion_1') : 'props/Pouch_Large';
  const m = kit.mesh(id);
  m.scale.setScalar(it.type === 'potion' ? 2.2 : it.type === 'gear' ? 2.4 : 1.4);
  m.position.y = -0.35;
  return m;
}

// a gem lying on the ground: a cut stone of its colour (one material for each kind of gem, made once)
const gemMats = new Map(), gemGeo = (() => { const g = new THREE.OctahedronGeometry(0.11, 0); g.scale(1, 1.25, 1); return g; })();
function gemModel(it) {
  const col = GEMS[it.gem]?.color || '#ffffff';
  if (!gemMats.has(col)) gemMats.set(col, new THREE.MeshPhongMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, specular: 0xffffff, shininess: 120, flatShading: true }));
  const m = new THREE.Mesh(gemGeo, gemMats.get(col));
  m.scale.setScalar(0.6 + (it.grade || 3) * 0.12);
  return Promise.resolve(m);
}
// a plan: a rolled parchment tied with its tier's colour
const scrollMat = new THREE.MeshPhongMaterial({ color: 0xe8d4a0, shininess: 8 }), scrollGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.34, 10).rotateZ(Math.PI / 2);
const tieGeo = new THREE.TorusGeometry(0.054, 0.012, 6, 12).rotateY(Math.PI / 2), tieMats = new Map();
function scrollModel(it) {
  const g = new THREE.Group(), col = ['#cfc4a8', '#4fd65a', '#4f8dff', '#ff9a2a', '#ff4058'][it.tier ?? 1];
  if (!tieMats.has(col)) tieMats.set(col, new THREE.MeshPhongMaterial({ color: col, emissive: col, emissiveIntensity: 0.4 }));
  g.add(new THREE.Mesh(scrollGeo, scrollMat), new THREE.Mesh(tieGeo, tieMats.get(col)));
  return Promise.resolve(g);
}

/** Things thrown out about a point (a great one's death, a death's leavings). */
function spill(items, at) {
  items.forEach((it, i) => {
    const a = (i / Math.max(1, items.length)) * Math.PI * 2 + Math.random() * 0.5, r = 0.4 + Math.random() * 0.5;
    ctx.loot.spawn(it, at.x + Math.cos(a) * r, at.y + 0.7, at.z + Math.sin(a) * r, { pop: true });
  });
}

/** The merchants on the map: a coin with the shop's sign, where they stand. */
function shopPins() {
  const out = [];
  for (const [name, shop] of Object.entries(MERCHANT_OF)) {
    if (name === 'Bertha') continue;   // (one sign for the Grimwalds' stall)
    const v = villagers.list.find((a) => a.name === name), post = villagers.shops?.[name];
    if (!v && !post) continue;
    out.push({ kind: 'shop', mark: '$' + shop, x: v ? v.pos.x : post[0], z: v ? v.pos.z : post[1], label: SHOPS[shop].name });
  }
  return out;
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
    gemFx?.setGear(char);   // (what the gems in it look like: gemfx.js)
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
// lands nearly twice as hard. Raising the shield shoves: what's in front of it, across a width and
// out to a reach that go by the shield's own size, is knocked back and set reeling, before the
// shield settles to block. With the shield up the sword only stabs, round its edge (vm.stab).
// A staff gathers its bolt while you hold the
// button (the longer, the bigger and harder it flies), and with the left hand free it sweeps
// round in front of you, knocking the dead back off you.
let blockAt = -9, riposteUntil = 0, bashCool = 0, sweepCool = 0, staffCharge = -1, shoveAt = 0;
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
/** The shove as the shield comes up (its SHOVE frame): everything in a box in front of you, as
 * wide as the shield and a stride or two deep (a bigger shield pushes wider and further, and a
 * little harder), is knocked back and set reeling. */
function shieldShove() {
  if (bashCool > 0 || !st.shield || guard.broken) return;
  const size = vm.shieldSize() || { w: 0.45, h: 0.6 };
  const { half, reach, push } = shoveArea(size);
  bashCool = 0.9; guard.v = Math.max(0, guard.v - 8); guard.wait = 0.5;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  // the push made visible: a ghost of the shield thrown from its face, out across the shove's box
  // to its far end (on your line ahead), swelling to the box's width
  const front = vm.shieldFront();
  if (front) {
    const start = fromView(front, 0.7), o = camera.position;
    const end = new THREE.Vector3(o.x + fx * reach, start.y, o.z + fz * reach);
    launchWave(scene, vm.ghostOf(), start, end, half * 2, vm.manifest.view_scale * start.distanceTo(o) / Math.max(0.1, -front.z));
  }
  const hit = inFront(Math.hypot(reach, half), -1).filter(({ dx, dz, d }) => {
    const ahead = (dx * fx + dz * fz) * d, across = Math.abs(dx * fz - dz * fx) * d;
    return ahead > -0.2 && ahead <= reach && across <= half;
  });
  for (const { z, dx, dz } of hit) {
    reel(z, 0.7); shove(z, dx, dz, push);
  }
  if (hit.length) sfx.hit('blunt', true); else sfx.swing(true, true);
  shake = Math.max(shake, hit.length ? 0.8 : 0.5);   // (the shove's kick, landing or not)
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
  // (the Debug Menu: GOD MODE and no-clip take no harm at all; with enemy damage off, only a fall hurts)
  if (cheats.god || cheats.fly || (cheats.noDamage && kind !== 'fall')) return;
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
  if (kind === 'spell' && st.spellWard) d *= 1 - st.spellWard / 100;   // (voidstones in armour)
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
  if (e.venom) by.poison?.(4, e.venom);
  if (e.storm && chest) {   // lightning off the shield's face into whatever struck it
    const from = fromView(vm.castPoint('L'), 0.6), to = chest.getWorldPosition(new THREE.Vector3());
    magic.arcs.add(from, to, 0.16, 0.3); magic.arcs.add(from, to, 0.12, 0.45);
    by.hit({ bone: chest, point: to, z: by }, { dmg: e.storm, dir: away, kind: 'lightning', push: 0.1 });
    sfx.zap?.();
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
  else if (kind === 'hit' && info?.attack) melee(info.stab ? 3.2 : info.heavy ? 3.5 : 2.9, info.heavy, side, info.edge, info.power, info.stab);
}

// the weapons that crush rather than cut (no gash: a split in the flesh where they land)
const BLUNT = /mace|hammer|club|morning_star|maul|tombstone|crook|staff|orb|crosier/;
/** A swing landing: the nearest thing in reach across the blade's arc gets sparks or chips. */
function melee(reach, heavy, side = 'R', sweep = null, power = 1, stab = false) {
  player.swingAt = zombies.time;            // (the Sworn see it coming)
  const o = camera.position;
  let best = null, flesh = null;
  // the rays fan out along the blade's sweep across the view (a chop's fan stands up, a
  // sweep's lies flat), a little either side of it
  const sx = sweep ? sweep[0] : 1, sy = sweep ? sweep[1] : 0;
  // (a stab goes where you look: a narrow bundle of rays, a little further)
  const fan = stab ? [[-0.05, 0], [0, 0], [0.05, 0], [0, -0.04], [0, 0.04]] : [[-0.35, 0], [-0.15, 0], [0, 0], [0.15, 0], [0.35, 0], [0, -0.1], [0, 0.1]];
  for (const [a, b] of fan) {
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
    const sw = stab ? [0.15, 1] : sweep || [heavy ? 0.94 : 0.82, (heavy ? -0.34 : 0.57) * (side === 'L' ? -1 : 1)];   // (a stab: a short upright wound)
    const edge = right.clone().multiplyScalar(sw[0]).addScaledVector(up, sw[1]).normalize();
    const blunt = BLUNT.test(it?.id || '');
    // (a chop, slower than a cut, lands harder; struck while it reels from your parry, harder again)
    const ripo = zombies.time < riposteUntil;
    if (ripo) { riposteUntil = 0; heavy = true; hud.toast('Riposte!'); }
    const dmg = stats.meleeDamage(heavy, side) * power * (ripo ? 1.8 : 1);
    flesh.z.hit(flesh, { dmg, dir: flesh.d, heavy, kind: blunt ? 'blunt' : 'blade', edge: blunt ? null : edge, push: (heavy ? 0.8 : 0.45) * (blunt ? 1.4 : 1) * power });
    sfx.hit(blunt ? 'blunt' : 'flesh', heavy);
    // a treasure's (and the gems') powers: the dead set burning, chilled to a crawl, poisoned, lightning loosed
    gemPowers(flesh.z, flesh.point, flesh.bone, dmg, true);
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

/** What a blow (or a staff's bolt) carries beyond its damage, from treasures and gems: burning,
 * chill, poison, lightning leaping to the nearest others, and mana drunk from it. (It shows where the
 * blade bit: char, or rime, about the wound, never the whole body.) */
const ZAP = [new THREE.Color('#ffffff'), new THREE.Color('#bcd8ff'), new THREE.Color('#5a8aff')];
function gemPowers(z, point, bone, dmg, melee) {
  if (!z) return;
  if (st.burnHit && !z.dead) { z.burning = Math.max(z.burning || 0, 3); z.burnDps = Math.max(z.burnDps || 0, st.burnHit); z.mark?.(point, bone, 0.07, 1); }
  if (st.chillHit && !z.dead) { z.chilled = Math.max(z.chilled || 0, st.chillHit); z.mark?.(point, bone, 0.07, 2); }
  if (st.poisonHit && !z.dead) z.poison?.(4, st.poisonHit);
  if (melee && st.manaSteal) player.mana = Math.min(player.maxMana, player.mana + dmg * st.manaSteal / 100);
  if (st.shockHit && point) {   // lightning leaps from the wound to the nearest two others
    const from = point.clone ? point.clone() : new THREE.Vector3(...point);
    const near = zombies.list.concat(slimes.list).filter((q) => q !== z && !q.dead && !q.gone && q.state !== 'buried' && q.pos.distanceTo(from) < 7)
      .sort((a, b) => a.pos.distanceTo(from) - b.pos.distanceTo(from)).slice(0, 2);
    for (const q of near) {
      const b = q.slime ? q.core : q.bones?.chest || q.bones?.spine;
      const to = q.slime ? q.center(new THREE.Vector3()) : b?.getWorldPosition(new THREE.Vector3());
      if (!to) continue;
      magic.arcs.add(from, to, 0.14, 0.3); magic.arcs.add(from, to, 0.1, 0.45);
      q.hit({ bone: b, point: to, z: q }, { dmg: st.shockHit, dir: to.clone().sub(from).normalize(), kind: 'lightning', heavy: false, blow: 0 });
      magic.particles.burst(to, ZAP, 10, { speed: 3, size: 0.03, grav: 4, life: 0.3 });
    }
    if (near.length) { sfx.zap?.(); magic.flashAt(from, 0x9ab8ff, 0.4); }
  }
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
const _sp = new THREE.Vector3(), _cd = new THREE.Vector3();
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
  sun.shadow.autoUpdate = L.under < 0.95 && !(WEBGPU && touch);   // (deep below, the sun's shadow map isn't redrawn: it lights nothing down here; a phone's under WebGPU: every other frame, tick)
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
    sunShadows?.update();   // (WebGPU: the moving things' map follows; the world's is kept: sunshadow.js)
  } else { sun.target.position.set(0, 0, 0); sun.position.copy(ld).multiplyScalar(300); }
  if (WEBGPU) {   // the sky's light, for the haze's glow toward it and the god rays (nodes.js SKY, post.js)
    SKY.dir.value.copy(ld);
    SKY.color.value.copy(sun.color);
    SKY.glow.value = (isDay ? 0.25 + 0.75 * day.day : 0.35) * surface;
    _sp.copy(camera.position).addScaledVector(ld, 1000).project(camera);
    const facing = camera.getWorldDirection(_cd).dot(ld);
    composer.rays.uv.value.set(_sp.x * 0.5 + 0.5, _sp.y * 0.5 + 0.5);
    composer.rays.on.value = THREE.MathUtils.clamp((facing - 0.05) / 0.35, 0, 1) * (isDay ? Math.min(1, day.day * 2) : 0.3) * L.out * surface;
  }
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
  // (the glass is unlit: as bright as the day, warming a little with the lamps inside after dark)
  if (ctx.glass) { const k = 0.16 + 0.84 * day.day; ctx.glass.color.setRGB(k + 0.55 * dusk, k + 0.32 * dusk, k + 0.1 * dusk); }
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
    // (an awake portal's light, out of doors only: within 30 m it ranks as if three times nearer, so
    // a lamp post doesn't crowd it out; below ground or indoors it never takes a torch's place)
    const seals = ctx.portals && L.under < 0.5 && indoor < 0.5 ? ctx.portals.lights : [];
    const ranked = (seals.length ? [...flameList, ...seals] : flameList).map((f) => {
      const d2 = (f[0] - p.x) ** 2 + (f[1] - p.y) ** 2 * 4 + (f[2] - p.z) ** 2;
      return [f, f.portal && d2 < 900 ? d2 / 9 : d2];
    })
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
    if (f.portal) {   // an awake portal's own blue light, breathing (no light on the hands: it's no flame)
      const s = f.portal;
      l.color.setHex(f.color);
      // (its own light by night, strong enough to pool on the ground about it; by day only a glow)
      l.intensity = (1.2 + 15 * night + 6 * s.flash) * (0.88 + 0.12 * Math.sin(t * 1.3 + s.seed * 7)) * Math.min(1, s.wake);
      l.distance = 10;
      return;
    }
    l.color.setHex(0xff9a48);
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
  if (on && portalMenu?.open) portalMenu.close();
  if (on && trade?.open) trade.close();
  map.show(on, player);
  if (on && bag.open) bag.show(false);
  if (touch) { gameInput.release(); }
  else if (on) document.exitPointerLock?.(); else lockPointer();
}

/** Any of the game's windows up (the bag, the map, a giver's words or the log, the save slots, the
 * portals, a shop)? */
const windowOpen = () => !!(bag?.open || map?.open || quests?.open || saves?.open || portalMenu?.open || trade?.open || debugMenu?.open);
/** Every window shut and straight back to the game (never into the pause menu): the mouse taken up
 * again, or, where the browser wants a click for it first, a word on the screen to click. */
function backToGame() {
  bag.show(false); map.show(false); portalMenu.close(); trade.close();
  if (quests.open) quests.close();
  if (paused) { paused = false; hud.showOverlay(null); }
  if (touch) { hud.showTouch(true); gameInput.release(); } else lockPointer();
}

/** A merchant's shop: opened speaking with them (E); E again, Esc or the cross to leave. */
function setTrade(on, who = null) {
  if (on) {
    const shop = who && MERCHANT_OF[who.name];
    if (!shop) return;
    trade.show(shop, who.name);   // (first: the windows shut after it don't take the mouse back)
    if (bag.open) bag.show(false);
    if (map.open) map.show(false);
    if (portalMenu.open) portalMenu.close();
    if (quests.open) quests.close();
    villagers.stopScenes(who); villagers.face(who, player); who.quick = 0.8;
  } else trade.close();
  if (touch) { hud.showTouch(!on); gameInput.release(); }
  else if (on) document.exitPointerLock?.(); else if (started && !paused) lockPointer();
}

function setInventory(on) {
  if (on && map.open) map.show(false);
  if (on && portalMenu?.open) portalMenu.close();
  if (on && trade?.open) trade.close();
  bag.show(on);
  if (touch) { hud.showTouch(!on); gameInput.release(); } // the thumb controls would lie over the bag
  if (on) { document.exitPointerLock?.(); hud.refresh(vm.equip, book); }
  else if (!touch) lockPointer();
}

/** The portals' window: opened standing on an awake seal (E); every other portal, by land. */
function setPortals(on) {
  if (on) {
    if (!ctx.portals.standing) return;
    if (bag.open) bag.show(false);
    if (map.open) map.show(false);
    quests.close();
    hud.banner?.classList.remove('show');   // (no word of an old waking over the window)
    portalMenu.show(ctx.portals, ctx.portals.standing);
    sfx.chime?.();
  } else portalMenu.close();
  if (touch) { hud.showTouch(!on); gameInput.release(); }
  else if (on) document.exitPointerLock?.(); else if (started && !paused) lockPointer();
}

const PORTAL_BLUE = ['#ffffff', '#a8c8ff', '#5a86ff'].map((c) => new THREE.Color(c));
// (from the heart, or from eight points round the rim: where you land, not in your face)
const sealBurst = (p, n = 70, o = {}, ring = 0) => {
  for (let k = 0; k < (ring ? 8 : 1); k++) {
    const a = k / 8 * Math.PI * 2;
    magic.particles.burst(new THREE.Vector3(p.x + Math.cos(a) * ring, p.y + SEAL_H + 0.15, p.z + Math.sin(a) * ring), PORTAL_BLUE, ring ? Math.ceil(n / 8) : n,
      { speed: 3.0, size: 0.045, grav: -2.5, life: 1.3, drag: 1, ...o });
  }
};

/** Step through: a flash of blue and a rush of air, and you stand on the other seal facing what it
 * serves (its gate, its door, its cave). What hunted you loses you. */
function travel(to) {
  const from = ctx.portals.standing;
  setPortals(false);
  if (!to || !from || to === from) return;
  ctx.portals.flash(from); sealBurst(from);
  player.pos.set(to.x, to.y + SEAL_H, to.z);
  player.vel.set(0, 0, 0);
  player.yaw = to.yaw; player.pitch = -0.21;   // (a little down: the seal you stand on, the sparks at its rim)
  ctx.portals.flash(to); sealBurst(to, 64, { speed: 1.6, size: 0.03, grav: 4, life: 0.9 }, 2.3);   // (a splash at the rim, falling)
  hud.banner?.classList.remove('show');   // (no word of an old waking over where you land)
  magic.screen.color.set(0x7aa4ff); magic.screen.amount = 0.9;
  sfx.portalJump?.();
  zombies.forget();   // (and its kin: the slimes)
  player.unseenUntil = performance.now() + 1500;   // (while the blue clears, nothing has seen you come)
  saveProgress();
}

/** A seal woken as you came near: the blue floods out from its heart, a peal, and word of it. */
function portalWoken(p) {
  sfx.portalWake?.();
  sealBurst(p, 110, { speed: 2.2, size: 0.05, grav: -1.6, life: 2.2, drag: 1.2 });
  hud.announce('Portal Awakened', p.name);
  if (ctx.portals.found.size === 1) hud.toast(touch ? 'Stand on a portal and tap E to travel' : 'Stand on a portal and press E to travel');
  saveProgress();
}

// ------------------------------------------------------------------ the Debug Menu's cheats (debug.js)
/** A switch thrown in the Debug Menu (cheats[k] is already set): what it says, shown in the menu. */
function setCheat(k, on) {
  sfx.equip?.();
  if (k === 'god') {
    zombies.oneHit = slimes.oneHit = on;   // (zombies.js, foes.js, slimes.js: every blow, spell and burn kills)
    if (on) { player.health = player.maxHealth; player.mana = player.maxMana; }
    return on ? 'GOD MODE: nothing can hurt you, and everything dies at one blow' : 'God mode is off';
  }
  if (k === 'noDamage') return on ? 'Enemies can no longer hurt you' : 'Enemies can hurt you again';
  if (k === 'fly') {
    setFly(on);
    return on ? (touch ? 'No-clip: the stick flies you where you look; the jump button rises' : 'No-clip: WASD flies you where you look; Space rises, C sinks, Shift is faster')
      : 'No-clip is off: you stand where you were';
  }
  return '';
}

/** No-clip on: you fly (Player.fly), nothing sees or hears you (whatever hunted you loses you), you
 * touch nothing and your hands are put away. Off: you're set down on whatever is under you. */
function setFly(on) {
  player.vel.set(0, 0, 0);
  if (on) {
    flyFrom = player.pos.clone();
    zombies.forget();   // (and its kin: the slimes)
    player.unseenUntil = Infinity;
    vm.blocking = false; player.blocking = false; staffCharge = -1; shoveAt = 0;
    pending.R = pending.L = null;
    magic.endCharge(); magic.arcana.endChannels();
    hud.prompt('');
  } else {
    land();
    flyFrom = null;
    player.unseenUntil = performance.now() + 1500;   // (a moment's grace, as through a portal)
  }
  hud.touch.classList.toggle('fly', on);
}

/** Down out of the air onto the floor below you (or up out of the hillside you flew into), with no fall. */
function land() {
  const p = player.pos;
  const below = ctx.unders.some((u) => u.dg.contains?.(p)) || physics.belowGround?.some((inside) => inside(p));
  const g = physics.groundAt(p.x, p.z);
  if (!below && p.y < g) p.y = g;
  const f = physics.floorAt(p.x, p.z, p.y, 0.32, 0.42);
  if (Number.isFinite(f)) p.y = f;
  player.vel.set(0, 0, 0);
  player.onGround = true;
  camera.position.set(p.x, p.y + EYE, p.z);
}

/** Every seal in the land woken at once (with a flash on each): travel from any to any. */
function wakeAllPortals() {
  const P = ctx.portals, had = P.found.size;
  if (had >= P.list.length) return 'Every portal is already awake';
  for (const p of P.list) if (!P.found.has(p.id)) { P.wake(p, true); p.flash = 1; }
  P.write();
  sfx.portalWake?.();
  saveProgress();
  return `All ${P.list.length} portals are awake: stand on any seal and ${touch ? 'tap' : 'press'} E to travel to any other`;
}

// every kind of thing there is to wear or carry: the arms, the shields, and each place armour goes
const GEAR_KINDS = [{ kind: 'onehand' }, { kind: 'twohand' }, { kind: 'staff' }, { kind: 'shield_round' }, { kind: 'shield_kite' },
  { slot: 'head' }, { slot: 'body' }, { slot: 'hands' }, { slot: 'legs' }, { slot: 'feet' }, { slot: 'ring' }];
/** GEAR GOD (Epic, Legendary, Mythic) or GEAR PEASANT (Common, Uncommon, Rare): one of every kind at
 * each of those rarities, at your level, and a fortune in gold, dropped about you in rings (gold
 * nearest, then each rarity further out; kept this side of any wall). */
function gearDrop(which) {
  const tiers = which === 'god' ? [3, 4, 5] : [0, 1, 2];
  const lv = char.level, p = player.pos;
  let gold = 0;
  const piles = Array.from({ length: 8 }, () => {
    const amount = Math.round((300 + lv * 300) * (0.75 + Math.random() * 0.5));
    gold += amount;
    return { type: 'gold', amount };
  });
  const rings = [piles, ...tiers.map((r) => GEAR_KINDS.map((o) => makeGear({ ilvl: lv, rarity: r, ...o })))];
  rings.forEach((ring, i) => {
    const r = 1.7 + i, turn = i * 0.37;
    ring.forEach((it, j) => {
      const a = turn + j / ring.length * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      const hit = physics.ray([p.x, p.y + 1.0, p.z], [dx, 0, dz], r + 0.6);
      const d = hit ? Math.max(0.5, hit.t - 0.6) : r;
      ctx.loot.spawn(it, p.x + dx * d, p.y + 1.3, p.z + dz * d, { pop: true });
    });
  });
  sfx.coin?.();
  const n = rings.length - 1, names = tiers.map((r) => RARITY[r].name);
  return `${n * GEAR_KINDS.length} ${names[0]}, ${names[1]} and ${names[2]} pieces of every kind (item level ${lv}), and ${gold.toLocaleString()} gold, lie about you${cheats.fly ? '. Land to take them up' : ''}`;
}

/** A level more or less. Up: three more points to spend. Down: three fewer (if they're already spent,
 * every point is handed back to spend again, as the free respec does). Life and mana filled. */
function shiftLevel(d) {
  fitLevel(char);
  const to = Math.max(1, Math.min(MAX_LEVEL, char.level + d));
  if (to === char.level) return '';
  let back = false;
  if (d > 0) char.points += POINTS_PER_LEVEL;
  else if (char.points >= POINTS_PER_LEVEL) char.points -= POINTS_PER_LEVEL;
  else { for (const k of Object.keys(char.attrs)) char.attrs[k] = 0; char.points = (to - 1) * POINTS_PER_LEVEL; back = true; }
  char.level = to; char.xp = 0;
  if (d > 0) sfx.levelUp?.(); else sfx.equip?.();
  applyGear().then(() => { player.health = player.maxHealth; player.mana = player.maxMana; });
  bag.render();
  saveCharacter(char);
  return `Level ${to}: ${char.points} point${char.points === 1 ? '' : 's'} to spend${back ? ' (your spent points were handed back)' : ''}`;
}

function pause() {
  if (introBusy) return;
  paused = true;
  bag?.show(false); map?.show(false); quests?.close(); saves?.show(null); portalMenu?.close(); trade?.close();
  hud.showOverlay('pause', touch);
  if (touch) { hud.showTouch(false); gameInput.release(); }
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && started && !windowOpen() && !introBusy) pause();
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
  const p = cheats.fly && flyFrom ? flyFrom : player.pos;   // (flying in no-clip: kept where you took off, not in mid-air)
  // (welcomed: the village has had its say at the edge of town, and gifts: what they've given so far)
  return { arrived: true, at: Date.now(), welcomed: progress?.welcomed !== false, gifts: progress?.gifts || [], quests: quests.save(), hour, book: { ...book }, arms: armsLying(),
    portals: ctx.portals.save(),
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
  ctx.portals.load(pr?.portals || []);
  if (pr?.hour != null && timeMode === 'cycle') hour = pr.hour;
  if (pr?.book) { Object.assign(book, pr.book); hud.refresh(vm.equip, book); }
  const P = pr?.player;
  if (P && Number.isFinite(P.x)) { player.pos.set(P.x, P.y, P.z); player.yaw = P.yaw || 0; player.pitch = P.pitch || 0; } else player.pos.set(0, 0, 12);
  player.vel.set(0, 0, 0);
  if (cheats.fly) flyFrom = player.pos.clone();   // (still flying: this is where you took off now)
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
  hushAll();
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
  for (const [k, [u, v]] of Object.entries(ARMS_PATH)) {
    const id = of[k];
    if (!ids.includes(id)) continue;
    const [x, z] = along(u, v);
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
  // materials, now and then a gem or a plan (craft.js); a great one's reagent and its plans
  const lv = placeLevel(z.pos, z.zone === 'dungeon' || z.zone === 'cave' || !!z.cave);
  const left = deathDrops(z, lv);
  if (z.champ) left.push(...greatDrops(z.champ.key, Math.max(lv, 12)));
  if (left.length) spill(left, z.slime ? z.center(new THREE.Vector3()) : z.pos);
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
  hushAll();
  try { await startOver(); } finally { starting = false; }
}

async function startOver() {
  music.toIntro();   // (a game's music gives way; the title's song plays on under the getting-ready)
  found.clear(); try { localStorage.removeItem('bm.found'); } catch { /* no storage */ }
  saves.show(null); quests.close(); bag.show(false); map.show(false); portalMenu.close(); trade.close(); gemFx?.clear();
  ctx.portals.load([]);   // (every seal asleep again)
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
        const { caller, group } = gatherSpots();
        staged = [];
        for (const c of [caller, ...group.filter((g) => g.name !== caller.name)]) {
          const a = villagers.list.find((q) => q.name === c.name);
          if (!a) continue;
          staged.push([a, a.root.position.clone(), a.root.rotation.y, a.root.visible]);
          a.root.position.set(c.at[0], physics.groundAt(c.at[0], c.at[1]), c.at[1]); a.root.rotation.y = Math.atan2(CRATER.x - c.at[0], CRATER.z - c.at[1]); a.root.visible = true;
        }
        // (the views of them: from where you wake, up at her; from her place on the edge, out at the
        // rest; and from among them, back at the crater)
        const her = new THREE.Vector3(caller.at[0], 1.4, caller.at[1]), [gx, gz] = along(23), [bx, bz] = along(28), knot = new THREE.Vector3(gx, 1.2, gz);
        return [{ pos: new THREE.Vector3(CRATER.x + 0.6, -CRATER.depth + 1.6, CRATER.z), look: her }, { pos: her.clone().setY(2.6), look: knot },
          { pos: new THREE.Vector3(bx, 1.6, bz), look: her }];
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
          const tell = () => { const [g, o] = voice.progress, dl = voice.download; line(dl ? `The voices of the village… ${dl[0]} of ${dl[1]} MB` : o ? `The voices of the village… ${g} of ${o}` : 'The voices of the village…'); };
          tell();
          const each = setInterval(tell, 300);
          await Promise.race([voice.ready, new Promise((r) => setTimeout(r, 240000))]).finally(() => clearInterval(each));
        }
        // what they'll say to you at the crater, made now, so each line is in the air the moment it's due
        voice.prefetch(gatherLines().map((w) => { const v = villagers.list.find((q) => q.name === w.name); return [v || { name: w.name }, w.text, v ? villagers.voiceOf(v) : { key: w.name }]; }));
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
  music.intro();  // (the opening's song from its first shot)
  intro.start(touch);
}

/** The opening hides the HUD and the marks over heads; the game has them back after. */
function setCinema(on) {
  hud.hud.classList.toggle('hidden', on);
  villagers.bubbles.hidden = on;
  if (touch) { hud.showTouch(!on); gameInput.release(); }
  if (!on) hud.refresh(vm.equip, book);
}

// After the green star the village comes out to the crater. Wren the hunter, the one of them bold
// enough, goes up to its edge on the town's side and calls down to you as you wake (you come round
// facing her); the rest keep back from the hole, a loose knot of them out on the meadow beyond the
// rim, spread out, where the rim hides them from you till you climb up to it. Each stands [name,
// metres out from the crater's middle toward the town, metres to its left]. When you come up near
// Wren she walks you back to them, and there they tell you who they are, and who you are. The
// knight's sword, shield and staff lie on the way up to her (ARMS_PATH), so you take them as you go.
const GATHER_DIR = (() => { const l = Math.hypot(30, 12); return [30 / l, 12 / l]; })();   // (toward the town)
const GATHER_SIDE = [-GATHER_DIR[1], GATHER_DIR[0]];
const along = (u, v = 0) => [CRATER.x + GATHER_DIR[0] * u + GATHER_SIDE[0] * v, CRATER.z + GATHER_DIR[1] * u + GATHER_SIDE[1] * v];
const CALLER = 'Wren';
const GATHER_GROUP = [['Odile', 22.5, 0.4], ['Elsie', 21.6, 2.2], ['Osric', 24.2, -2.2], ['Hesk', 23.6, 2.6], ['Tobias', 25.0, 0.8], ['Garrow', 22.8, -3.6], ['Wren', 21.8, -1.6]];
const ARMS_PATH = { onehand: [3.2, 0.3], shield: [6.2, -0.3], staff: [8.9, 0.25] };   // (metres up the way to her, and to the side)
// Wren calls down to you as you come round, the others calling to her, and she to them over her shoulder
const GATHER_CALLS = [
  { name: 'Wren', text: 'Hoy! You, down there! Can you hear me?', toYou: true, wave: true },
  { name: 'Elsie', text: 'Is he alive, Wren?', to: 'caller' },
  { name: 'Wren', text: "He's moving! Saints, he's moving!" },
  { name: 'Wren', text: 'Easy, now. Can you stand? Are you hurt?', toYou: true },
  { name: 'Tobias', text: "Don't go any nearer the edge, girl. It's still smoking.", to: 'caller' },
  { name: 'Wren', text: "Come on up to me. Slowly, now. Mind the glass, it's still hot.", toYou: true },
  { name: 'Wren', text: "And bring the knight's things with you. He won't be needing them now.", toYou: true },
];
// and now and then after, while you're still down in it
const GATHER_AGAIN = [
  { text: "This way. Up here, where it's not so steep." },
  { text: 'That\'s it. Take your time.' },
  { text: 'Up here! Follow my voice.' },
  { text: 'Nobody here will hurt you. Come on up.' },
  { text: 'Can you hear me? Up here, friend.', wave: true },
  { text: "Don't be afraid. You're safe now." },
];
// what the others say among themselves, back from the edge (between her calls)
const GATHER_CHATTER = [
  { name: 'Elsie', text: 'Did you see it? He fell right out of the sky!' },
  { name: 'Osric', text: 'In a ball of green fire. Square on top of one of the Sworn.' },
  { name: 'Garrow', text: 'Nothing left of that knight but his armour.' },
  { name: 'Hesk', text: 'Nobody lives through a fall like that.' },
  { name: 'Odile', text: 'Green fire out of the vault of heaven… It cannot be. It cannot.' },
  { name: 'Garrow', text: "That girl's mad, going right up to the edge." },
  { name: 'Osric', text: 'Somebody had to. Better her than me.' },
  { name: 'Elsie', text: 'Do you think he is an angel?' },
  { name: 'Tobias', text: 'Spinning like a top, he was, all the way down.' },
  { name: 'Hesk', text: "If he lives, he'll come to us. Wait." },
];
// when you've come up near her: she turns, and takes you to them (and if you fall behind)
const GATHER_LEAD = [{ text: 'There you are. Gently, now. Come and meet the others.', wave: true }];
const GATHER_LAG = [{ text: 'This way. Over here.', wave: true }, { text: "Come on. They don't bite." }, { text: 'Over here, friend.' }];
// and the rest, seeing you climb out
const GATHER_SIGHT = [
  { name: 'Elsie', text: "There! He's climbing out!" },
  { name: 'Tobias', text: "Saints preserve us. He's alive." },
  { name: 'Garrow', text: 'And in his smallclothes, too.' },
  { name: 'Odile', text: 'Nobody run. Let him come to us.', wave: true },
];
// what they tell you when you come to them, in turn: who they are, who you are (and what they give you)
const GATHER_TALK = [
  { name: 'Odile', text: "Welcome, child. You're among friends. This is Bellmourn, and I am Sister Odile.", wave: true },
  { name: 'Elsie', text: "I'm Elsie! You fell out of the sky! In a ball of green fire! We all saw!" },
  { name: 'Osric', text: "Osric. I'm reeve here. You came down square on one of Lord Velscour's Sworn. There's nothing left of him but his armour." },
  { name: 'Odile', text: 'A green star out of heaven, a man curled as a child, girded in black. It is written, child.' },
  { name: 'Odile', text: 'You are Tessariel. The Sacred Flame, sent down to kill the Demon Lord Velscour.' },
  { name: 'Hesk', text: "Hush! Say that name where the garrison can hear, and they'll hang the lot of us." },
  { name: 'Tobias', text: "I'm Tobias. I keep the inn, the Tolling Bell. Velscour rules us from his far throne, and the Book says you will end him." },
  { name: 'Garrow', text: "Garrow. I'm the smith. You can't go about in your smallclothes, though. Here. You'll want more than that.", gift: 'armor' },
  { name: 'Wren', text: "I'm Wren. I hunt these woods. Wraps for your hands. And keep that sword close.",
    ifArms: "I'm Wren. I hunt these woods. Wraps for your hands. And the knight's sword and shield are still down there: take them.", gift: 'gloves' },
  { name: 'Tobias', text: "Forty crowns from the inn's box. Don't spend it all on ale.", gift: 'gold' },
  { name: 'Hesk', text: "And I'm Mother Hesk. I mend what gets broken. Draughts, dear: red for the blood, blue for the mind.", gift: 'potions' },
  { name: 'Odile', text: 'But before the Fiend, Flame, we have a task for you.' },
  { name: 'Odile', text: 'The dead are walking beneath our cathedral. Speak with me, and I will tell you all of it.' },
];
// if you walk off while they're talking to you
const GATHER_AWAY = [{ name: 'Elsie', text: 'Wait! Where are you going?' }];
/** Every line of the gathering, in the order they'll be wanted (made ahead, while the game loads). */
const gatherLines = () => [...GATHER_CALLS, ...GATHER_AGAIN.slice(0, 3).map((l) => ({ ...l, name: CALLER })), ...GATHER_LEAD.map((l) => ({ ...l, name: CALLER })), ...GATHER_SIGHT,
  ...GATHER_TALK.flatMap((l) => (l.ifArms ? [l, { ...l, text: l.ifArms }] : [l])), ...GATHER_AGAIN.slice(3).map((l) => ({ ...l, name: CALLER })),
  ...GATHER_LAG.map((l) => ({ ...l, name: CALLER })), ...GATHER_AWAY, ...GATHER_CHATTER];

/** Where they stand: Wren up on the crater's edge toward the town (just inside its crest, where you
 * see her from the bottom), the rest out on the meadow beyond; and f, the way from the town into the crater. */
function gatherSpots() {
  // (the crest on her line, with the crater as it will be, formed or not yet)
  const k = CRATER.k; CRATER.k = 1;
  let crest = CRATER.R, top = -1e9;
  for (let u = CRATER.R - 3; u <= CRATER.R + 3; u += 0.1) { const [x, z] = along(u, -0.4), h = craterHeight(x, z); if (h > top) { top = h; crest = u; } }
  CRATER.k = k;
  const f = [-GATHER_DIR[0], -GATHER_DIR[1]];
  return { f, caller: { name: CALLER, at: along(crest - 0.45, -0.4) }, group: GATHER_GROUP.map(([name, u, v]) => ({ name, at: along(u, v) })) };
}
let staged = [];   // (the village as it was, while warm draws it gathered)

/** In the black after the white: you lie in the crater's middle, and come round facing Wren up on its
 * edge, calling down to you; the rest of the village waits back from the hole. */
function placeInCrater() {
  const x = CRATER.x + 0.6, z = CRATER.z;
  const { f, caller, group } = gatherSpots();
  player.pos.set(x, physics.groundAt(x, z), z); player.vel.set(0, 0, 0);
  player.yaw = Math.atan2(-(caller.at[0] - x), -(caller.at[1] - z)); player.pitch = 0.12;   // (up at her)
  player.health = player.maxHealth; player.mana = player.maxMana;
  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  const odile = group.find((g) => g.name === 'Odile').at;
  villagers.postAt = { Odile: [odile[0], odile[1], Math.atan2(f[0], f[1])] };   // she waits there till you take her work
  progress = { ...(progress || {}), arrived: true, welcomed: false, gifts: [] };
  const done = () => { holdHour = false; progress.welcomed = true; hud.toast('Sister Odile has a task for you: walk up to her and press E'); saveProgress(); };
  const out = (p) => Math.hypot(p.pos.x - CRATER.x, p.pos.z - CRATER.z) > CRATER.R - 2 && p.pos.y > -0.8;   // up at the rim, or over it
  if (!villagers.gather(player, { caller, group, look: [CRATER.x, CRATER.z], calls: GATHER_CALLS, again: GATHER_AGAIN, chatter: GATHER_CHATTER, lead: GATHER_LEAD,
    lag: GATHER_LAG, sight: GATHER_SIGHT, script: GATHER_TALK, away: GATHER_AWAY, out, arms: () => armsLying().length > 0, onGift: gift, onDone: done })) {
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
  cells?.update();          // (a cell whose pieces were shown or hidden is recorded again: cells.js)
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
  const active = started && !paused && !windowOpen() && !introBusy;
  const acting = active && !cheats.fly;   // (no-clip: you fly, unseen, and touch nothing)
  // Velscour's Skull by the corner map, over the pause screen too, but not over the other windows
  debugMenu.showSkull(started && !introBusy && !lost && !windowOpen());

  // (from the pause menu the bag opens straight over the game, and closing it goes back to play)
  if (started && !introBusy && (inp.was('Tab') || inp.was('KeyI'))) { if (paused && !saves.open) { paused = false; hud.showOverlay(null); } if (!paused) { quests.close(); setInventory(!bag.open); } }
  if (started && !paused && !introBusy && inp.was('KeyM')) { quests.close(); setMap(!map.open); }
  if (started && !paused && !introBusy && inp.was('KeyL')) { if (bag.open) setInventory(false); if (map.open) setMap(false); if (portalMenu.open) setPortals(false); quests.showLog(!quests.open); }
  if (started && !paused && !introBusy && inp.was('KeyT')) quests.toggleTracker();
  if (started && !introBusy && portalMenu.open && inp.was('KeyE')) setPortals(false);   // (E again: off, and back to it)
  if (started && !introBusy && trade.open && inp.was('KeyE')) setTrade(false);
  // Esc shuts whatever window is up and goes straight back to the game (the pause menu is for Esc in
  // play); the save slots go back to where they were opened from
  if (started && !introBusy && inp.was('Escape')) {
    if (saves.open) { saves.show(null); if (!paused && !touch) lockPointer(); }
    else if (windowOpen()) backToGame();
    else if (touch) pause();
  }
  // the mouse not taken up again (the browser wanted a click for it): say so, and a click does it
  relock.classList.toggle('show', !touch && started && !paused && !introBusy && !windowOpen() && !document.pointerLockElement && !intro?.running);
  if (active && cheats.fly) player.fly(dt, inp);
  else if (active) {
    player.update(dt, inp);
    for (const [code, kind] of Object.entries(QUICK)) if (inp.was(code)) equip(kind);
    if (inp.was('KeyQ')) drink('life');
    if (inp.was('KeyZ')) drink('mana');
    // right hand
    // (a blade asked for again mid-blow goes on into the next of its combo: the view model
    // queues it; the swish comes with each blow's own whoosh)
    const bolt = BOLTS[vm.equip.R];
    bashCool -= dt; sweepCool -= dt;
    if (vm.blocking) { if (inp.was('Mouse0')) vm.stab(); }               // (shield up: the sword only stabs, round its edge)
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
    } else if (inp.was('Mouse0')) vm.attackRight();   // (a click for every blow: between a combo's blows the next waits cocked a moment)
    // left hand (shields are held up as long as the button is); a staff with the left hand free sweeps
    if (vm.equip.R === 'staff' && !vm.equip.L && inp.was('Mouse2')) staffSweep();
    const wasBlocking = vm.blocking;
    vm.actLeft(inp.held('Mouse2'));
    if (vm.blocking && !wasBlocking) {   // raised: it shoves on its SHOVE frame, then blocks
      blockAt = zombies.time;
      const c = vm.clipInfo(vm.state.L?.name), i = c ? c.names.indexOf('SHOVE') : -1;
      shoveAt = zombies.time + (i >= 0 ? c.starts[i] + 0.03 : 0.1);
    }
    if (shoveAt && zombies.time >= shoveAt) { shoveAt = 0; if (vm.blocking) shieldShove(); }
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

  vm.update(dt, acting ? player.speed : 0);
  camera.updateMatrixWorld();
  if (started && !introBusy) gemFx?.update(dt, camera, player);   // (after the hands have moved)
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
  const who = acting ? villagers.aimed(camera) : null;
  if (who) {
    const mark = quests.markOf(who.name);
    hud.prompt(mark === '!' ? `E — ${who.call} has work for you` : mark === '?' ? `E — speak with ${who.call} (the work is done)` : `E — speak with ${who.call}`);
    // (what they'd say if you spoke to them now, made while you look at them: heard the moment you do)
    villagers.expect(who, 8);
    const words = !who.gathered && quests.words(who.name);
    if (words && who.wordsMade !== words) { who.wordsMade = words; voice.prefetch([[who, words, villagers.voiceOf(who)]], 8); }
    // a merchant with nothing pressing to say trades; Garrow gives his gift first
    const shop = MERCHANT_OF[who.name], gift = who.name === 'Garrow' && villagers.onGift && !villagers.gave('garrowsoath');
    const trades = shop && mark !== '!' && mark !== '?' && !gift && !who.gathered;
    if (trades) hud.prompt(`E — trade with ${who.call} · ${SHOPS[shop].name}`);
    if (inp.was('KeyE')) {
      if (trades) setTrade(true, who);
      else if (!quests.talk(who.name, who)) villagers.talkTo(who, player); else if (!who.gathered) { villagers.stopScenes(who); villagers.face(who, player); who.quick = 0.8; }
    }
  } else if (acting && ctx.portals.standing) {   // on an awake seal: the portals' window
    hud.prompt('E — use the portal');
    if (inp.was('KeyE')) setPortals(true);
  } else if (acting && ctx.catacombs.prompt) {
    hud.prompt(ctx.catacombs.prompt);
    if (inp.was('KeyE')) ctx.catacombs.act?.();
  } else if (acting && ctx.catacombs.bell?.prompt) {
    hud.prompt(ctx.catacombs.bell.prompt);
    if (inp.was('KeyE')) ctx.catacombs.bell.ring(zombies, sfx, hud);
  } else if (acting) {
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
  physics.nav?.frame(dt);
  ctx.props.update(dt);   // (searched chests' lids swinging open, broken things' pieces flying)
  if (active) ctx.loot.update(dt, player, !cheats.fly);
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
  // (in no-clip nothing sees, hears or wakes for you: as while a window is up)
  zombies.update(dt, player, acting, camera, H, 0.3 + 0.7 * day.day);
  slimes.update(dt, player, acting, camera, H);
  ctx.catacombs.update(dt, player, zombies, acting);   // the bridge, its ambush, the First Bell
  foes.night = day.day < 0.35;          // (some of the Sworn carry a lantern after dark)
  foes.update(dt, player);
  chatter.update(dt, player, acting);
  tickSpeech(dt);                       // (everyone's words, in turn: speech.js)
  for (const c of ctx.caves) if (c !== foes.cave) c.update(dt, player);   // (the Gloamhollow is the foes')
  ctx.keep.update(dt, t, player);
  hud.boss(foes.bossBar(player) || quests.bossBar(player));
  if (started && !cheats.fly) quests.update(dt, player);   // (a quest's things, taken up as you walk over them)
  respawns?.update(dt, player, started && !introBusy && !paused, camera);   // (the dead long enough, and out of sight: back)
  hud.xp(char.level, char.xp, char.level >= MAX_LEVEL ? 0 : xpToNext(char.level));
  if ((saveT -= dt) <= 0 && started && !introBusy) { saveT = 10; saveProgress(); }
  villagers.update(dt, player, hour, (p) => zombies.list.some((z) => !z.dead && !z.gone && z.standing && (z.aggro || z.kindName === 'knight' || z.kindName === 'sorcerer') && Math.abs(z.pos.x - p.x) < 14 && Math.abs(z.pos.z - p.z) < 14));
  ctx.water?.update(dt, t, { camera, height: H, sun, hemi, day });
  magic.update(dt, camera, H, player);
  stepWaves(dt);   // (the shove's ghost shields in flight)
  flames.update(t, camera, H);
  smoke.update(dt, camera, H, 0.25 + 0.75 * day.day * (1 - L.under) + 0.1);
  ctx.portals.update(dt, { player, playing: started && !introBusy && !paused && !cheats.fly, fog: scene.fog, day: day.day, px: H / (2 * Math.tan(camera.fov * Math.PI / 360)) });
  light(dt, t);
  hud.update(player, book);
  hud.clockTime(hour);
  if (started && ((mapT += dt) > 0.1 || map.open)) { mapT = 0; map.update(player); }   // the corner map ten times a second

  vmPass.enabled = started && !introBusy && !cheats.fly; // no arms behind the title screen, in the opening, or in no-clip
  if (touch && HI) {
    const due = (++shadowFrame & 1) === 0 || magic.lights.some((l) => l.light.intensity > 0);
    if (WEBGPU) { if (due && L.under < 0.95) sun.shadow.needsUpdate = true; } else renderer.shadowMap.needsUpdate = due;
  }
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
const relock = document.createElement('div');
relock.className = 'relock'; relock.textContent = 'Click to take up the mouse again';
ui.append(relock);
// a phone can take the GPU back (short of memory, or the browser put away): start over on a tap
const onLost = () => {
  lost = true; ready = false;
  bag?.show(false); hud.showTouch(false);
  title.hide(true);
  hud.showOverlay('lost', touch);
};
canvas.addEventListener('webglcontextlost', onLost);
if (WEBGPU) renderer.onDeviceLost = (info) => { console.warn('the GPU device was lost', info?.message || info); onLost(); };
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
  window.bellmourn = { scene, camera, renderer, composer, res, webgpu: WEBGPU, sunShadows: () => sunShadows, cells: () => cells, player, vm, magic, physics, ctx, lib, bill, kit, zombies, foes, villagers, slimes, char: () => char, guard, bag, map, setInventory, setMap, hurtPlayer, applyGear, melee, equip, assign, castSlot, hud, begin, L,
    quests: () => quests, saves: () => saves, intro: () => intro, newGame, continueGame, snapshot, restore, reward, onDeath, cometLight,
    trade: () => trade, gemFx: () => gemFx, respawns: () => respawns, setTrade, backToGame,
    setHour: (h) => { hour = h; }, get hour() { return hour; }, torchPool, sun, hemi, bloom, grade, tick, RaycasterClass: THREE.Raycaster, title, latestSave, voice, music, ambience, sfx, input: () => gameInput, speaking, chatter: () => chatter, combat: () => ({ riposte: riposteUntil > zombies.time, blockAt, staffCharge }),
    cheats, debug: () => debugMenu, setCheat, gearDrop, shiftLevel, wakeAllPortals, handsShown: () => vmPass.enabled };
}).catch((e) => {
  console.error(e);
  window.bootError = e;
  title.status('Failed to load: ' + e.message);
});
frame();
