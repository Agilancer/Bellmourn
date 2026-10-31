// The walking dead (the grotesques: templates/models/creatures/grotesques/<name>.glb): a horde in
// the graveyard that keeps clawing its way back out of the graves, more in every dungeon level and
// cave (each place a registered "under", with its own walkable grid), and some out in the world.
//
// Every zombie is a skinned glTF with its own clips (idle, walk, run, jump, attack1-3, fall,
// death, dead, rise, getup, and on the ground: collapse, crawl, crawl_attack, crawl_death,
// crawl_dead). The seven zombie bodies before them (a-c from the warrior, d-e from the female
// fighter, f-g from the male fighter) and the nine monsters stay loadable but aren't loaded.
//
// The brain: each zombie sees (a cone, a range, and a clear line from its eyes to yours),
// hears (you running carries far, walking less, standing still hardly at all; swings, clangs
// and spells carry further) and remembers where it last saw or heard you. One that finds you
// moans, and the others in earshot come. They close in from different sides instead of
// queueing, keep apart from each other, feel their way round what's in the way and jump the
// graves and walls they can get over; runners sprint and lunge. Down in the dungeon they follow
// you through the corridors by a flow field over the carved grid of whichever level or cave
// you are in. Lose them and they search
// where they last had you, then drift back to wandering. Temperaments: shamblers, runners, and
// lurkers that lie buried in the graveyard or sprawled like corpses in the dungeon until you
// come close.
//
// Gore: a blow punches a jagged hole in the flesh where it lands. Wounds are kept in the
// mesh's bind space so they ride the animation; the shader tears the skin away inside them,
// rims them in raw meat and draws the body's own inner faces as wet red innards and gut. Enough
// damage to a limb, the head or the waist cuts it off: its triangles leave the body and tumble
// away as a piece of their own, the stump keeps a bone stub and spurts with a fading pulse. A
// zombie without its head keeps coming (by sound); one without a leg, or cut in half, drops
// and drags itself along with whatever arms it has left. Only destroying the body stops it.
// Spells punch round holes instead, seared black at the rim (frost: rimed white), and may blow
// off whatever they hit outright: a head, an arm, a leg (and down it goes, crawling). Blood is
// opaque droplets that splat and pool on the ground, with gibs of meat. Corpses sink into the
// earth after a while.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { TOUCH } from './input.js';

const ROOT = 'templates/models/creatures/zombie/';
export const VARIANTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
// The monster bodies (templates/models/creatures/monsters/<name>.glb): one human body under nine
// skins, each with its own hand-keyed idle, move, attack1, attack2, roar, hit and death. Their
// UE-style bones are renamed to the zombie body's on load so the brain and the gore drive them.
// A phone loads their phone copies (monsters/phone/, from tools/creatures/phone_copies.py:
// every image at most 512 square), one at a time: the full ones carry five 2048 images apiece,
// and nine of them decoding together ran to hundreds of megabytes and killed the tab.
const MONSTER_ROOT = 'templates/models/creatures/monsters/' + (TOUCH ? 'phone/' : '');
export const MONSTERS = ['grave_zombie', 'drowned_zombie', 'plague_zombie', 'frost_zombie', 'mummified_zombie',
  'cinder_zombie', 'infernal_demon', 'obsidian_demon', 'bone_demon'];
// The grotesques (templates/models/creatures/grotesques/<name>.glb, from tools/creatures/grotesques):
// the Humans FBX's bare man reshaped and sculpted under ten painted skins, built on the zombies' own
// bones with the zombies' own clips, so they rise, hunt, crawl and come apart exactly like them.
// The ember husk's cracks and the chitin fiend's eyes glow (their emissive maps). A phone loads
// their phone copies (grotesques/phone/), one at a time, with the monsters.
// They are the game's dead now: the seven zombies and nine monsters before them stay in the repo
// (load(VARIANTS, MONSTERS) brings them back) but aren't loaded.
const GROTESQUE_ROOT = 'templates/models/creatures/grotesques/' + (TOUCH ? 'phone/' : '');
export const GROTESQUES = ['rotting_zombie', 'bloated_drowner', 'plague_bearer', 'tomb_mummy', 'ember_husk',
  'pale_ghoul', 'chitin_fiend', 'deep_maw', 'fungal_husk', 'bog_troll'];
// who haunts where: each place draws its dead from its own few (repeats weight the draw)
export const HAUNTS = {
  yard: ['rotting_zombie', 'rotting_zombie', 'rotting_zombie', 'plague_bearer', 'plague_bearer', 'pale_ghoul', 'tomb_mummy'],
  undercroft: ['rotting_zombie', 'rotting_zombie', 'tomb_mummy', 'tomb_mummy', 'pale_ghoul', 'plague_bearer', 'ember_husk'],
  deep: ['ember_husk', 'chitin_fiend', 'chitin_fiend', 'pale_ghoul', 'tomb_mummy', 'fungal_husk', 'bog_troll'],
  barrow: ['tomb_mummy', 'tomb_mummy', 'rotting_zombie', 'pale_ghoul', 'pale_ghoul'],
  cellars: ['plague_bearer', 'plague_bearer', 'rotting_zombie', 'fungal_husk', 'bloated_drowner', 'ember_husk'],
  water: ['bloated_drowner', 'bloated_drowner', 'deep_maw', 'deep_maw'],
  fungal: ['fungal_husk', 'fungal_husk', 'chitin_fiend'],
  troll: ['bog_troll', 'bog_troll', 'fungal_husk'],
  hollow: ['chitin_fiend', 'fungal_husk', 'pale_ghoul'],
  wood: ['pale_ghoul', 'rotting_zombie', 'fungal_husk'],
};
const MONSTER_BONES = { pelvis: 'hips', spine_01: 'spine', spine_03: 'chest', neck_01: 'neck', Head: 'head',
  clavicle_l: 'shoulderL', clavicle_r: 'shoulderR', upperarm_l: 'upper_armL', upperarm_r: 'upper_armR',
  lowerarm_l: 'forearmL', lowerarm_r: 'forearmR', hand_l: 'handL', hand_r: 'handR',
  thigh_l: 'thighL', thigh_r: 'thighR', calf_l: 'shinL', calf_r: 'shinR', foot_l: 'footL', foot_r: 'footR' };
const FPS = 30;
const DI = [1, -1, 0, 0], DK = [0, 0, 1, -1];   // (the flow field's four ways)
const HIT_AT = { attack1: 14, attack2: 14, attack3: 21, crawl_attack: 13 };   // frame the blow lands
const ATTACK_DMG = { attack1: 9, attack2: 8, attack3: 14, crawl_attack: 7 };
const ONCE = new Set(['jump', 'attack1', 'attack2', 'attack3', 'death', 'collapse', 'crawl_attack', 'crawl_death', 'rise', 'getup', 'roar', 'hit']);
// what can be cut off, and how much it takes (waist: the body cut in two at the hips). The legs
// take a good deal more than the arms: a crawler should be earned, not the first thing a fight does
const LIMB_HP = { head: 42, upper_armL: 52, forearmL: 36, handL: 22, thighL: 150, shinL: 120, footL: 70,
  upper_armR: 52, forearmR: 36, handR: 22, thighR: 150, shinR: 120, footR: 70, waist: 150 };
const RADIUS = { hips: 0.17, spine: 0.16, chest: 0.18, neck: 0.065, head: 0.12, shoulder: 0.07, upper_arm: 0.06,
  forearm: 0.052, hand: 0.05, thigh: 0.085, shin: 0.065, foot: 0.06 };
const TIP = { head: 0.24, hand: 0.27, foot: 0.19 };           // leaf bones' lengths (along their +y)
const HP = 170;
const WOUNDS = 16;
const STAINS = 14;   // marks on the skin (blood, char, rime): the oldest gives way to the newest
// a spell's wound is round, its rim burned (uWoundD.w = 2) or frozen (3)
const SPELL_RIM = { fire: 2, lightning: 2, staff: 2, frost: 3, arcane: 2, missile: 2, void: 2 };
// the mark a blow of each kind leaves on the skin about where it landed (STAINS: 0 blood, 1 char,
// 2 rime, 3 poison). A body never changes colour as a whole: what a spell does shows where it took.
const MARK = { fire: 1, lightning: 1, frost: 2, poison: 3 };
// the chance a spell blows off what it hits, by where it hits (times the spell's own `blow`). The
// legs are thick and hard to take: a spell rarely blows one off, and never off anything big
const BLOW = { head: 0.4, upper_arm: 0.3, forearm: 0.35, hand: 0.35, thigh: 0.08, shin: 0.1, foot: 0.08, waist: 0.05 };
const LEG = /^(thigh|shin|foot)|^waist$/;
// how much harder the legs are to cut through on something big (heft: a champion 3, the lord 5)
const legToughness = (heft = 1) => 1 + Math.max(0, heft - 1) * 1.6;
// how fast one drags itself along the ground: after you (a base and a share for each arm it still
// has), going to look, and wandering; and how quickly it turns
const CRAWL = { chase: [0.26, 0.27], hunt: 0.42, wander: 0.32, turn: 1.9 };
// temperaments: walking speed, sprint speed (0: never runs), how far it sees, how well it hears
const KINDS = {
  shambler: { walk: 0.8, run: 0, sight: 20, hear: 1.0, turn: 2.4 },
  runner: { walk: 0.95, run: 3.3, sight: 24, hear: 1.2, turn: 3.2 },
  lurker: { walk: 0.8, run: 2.7, sight: 10, hear: 0.7, turn: 3.0 },
};

const GORE_GLSL = /* glsl */`
uniform vec4 uWound[${WOUNDS}];
uniform vec4 uWoundD[${WOUNDS}];
uniform vec3 uWoundB[${WOUNDS}];
uniform float uWoundN;
uniform vec4 uStain[${STAINS}];
uniform float uStainT[${STAINS}];
uniform float uStainN;
varying vec3 vBind;
float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// wounds (w > 0: a hole torn in the skin), cuts (w < 0: a severed joint), slashes (uWoundD
// .w = 1: a gash along the segment w.xyz +- uWoundD.xyz, w.w wide, the blood running from it)
// and spells' round holes (uWoundD.w = 2: burned, 3: frozen; w.w their radius)
// Marks on the skin where it was struck, never the whole body: blood thrown over it (uStainT 0:
// a ragged splash with spatter round it and runs down from it), char where fire took (1), rime
// where frost took (2), a sick dark weeping where poison took (3). uStain: centre and radius.
float stains(inout vec3 c) {
  float wet = 0.0;
  for (int i = 0; i < ${STAINS}; i++) {
    if (float(i) >= uStainN) break;
    vec4 s = uStain[i];
    vec3 q = vBind - s.xyz;
    float d = length(q) / s.w;
    if (d > 3.2) continue;
    float t = uStainT[i], seed = float(i) * 13.7;
    float edge = d + (gNoise(vBind * 38.0 + seed) - 0.5) * 0.9 + (gNoise(vBind * 110.0 + seed) - 0.5) * 0.35;
    float drop = step(0.83, gNoise(vBind * 260.0 + seed)) * step(d, 2.6) * step(0.9, edge);   // the spatter round it
    if (t < 0.5) {
      // and the runs: down from the splash (bind space is the body standing), thinning as they go
      float below = -q.y / s.w, across = length(q.xz) / s.w;
      float run = step(0.0, below) * step(below, 3.0) * step(0.62, gNoise(vec3(vBind.x * 90.0, 0.0, vBind.z * 90.0) + seed)) * step(across, 0.95 - below * 0.22);
      float k = max(max(step(edge, 1.0), drop), run * 0.85);
      if (k > 0.0) {
        vec3 blood = mix(vec3(0.26, 0.012, 0.016), vec3(0.45, 0.03, 0.03), gNoise(vBind * 70.0 + seed));
        c = mix(c, mix(c * vec3(0.45, 0.04, 0.04), blood, 0.65), k);
        wet = max(wet, 0.85 * k);
      }
    } else if (t < 1.5) {
      float k = smoothstep(1.15, 0.7, edge);
      c = mix(c, c * mix(0.06, 0.32, gNoise(vBind * 55.0 + seed)), k);
    } else if (t < 2.5) {
      float k = smoothstep(1.2, 0.75, edge);
      c = mix(c, mix(vec3(0.78, 0.88, 0.98), vec3(0.95, 0.98, 1.0), gNoise(vBind * 90.0 + seed)), k * 0.85);
      wet = max(wet, k);
    } else {
      float k = max(smoothstep(1.1, 0.7, edge), drop);
      c = mix(c, c * vec3(0.3, 0.42, 0.16), k);
      wet = max(wet, 0.6 * k);
    }
  }
  return wet;
}
float gore(inout vec4 col) {
  float hole = 99.0, cut = 99.0, gash = 99.0, run = 0.0, burn = 99.0, ice = 99.0;
  for (int i = 0; i < ${WOUNDS}; i++) {
    if (float(i) >= uWoundN) break;
    vec4 w = uWound[i], D = uWoundD[i];
    if (D.w > 1.5) {
      float d = length(vBind - w.xyz) / w.w;
      if (D.w > 2.5) ice = min(ice, d); else burn = min(burn, d);
      continue;
    }
    if (D.w > 0.5) {
      vec3 q = vBind - w.xyz, B = uWoundB[i];
      float dep = dot(q, B);
      if (dep > 0.07 || dep < -0.16) continue;   // only the side the blow struck
      q -= B * dep;                       // in the plane across the blow: it wraps round the body
      float t = clamp(dot(q, D.xyz) / max(dot(D.xyz, D.xyz), 1e-6), -1.0, 1.0);
      vec3 e = q - D.xyz * t;
      gash = min(gash, length(e) / w.w);
      // the blood that ran down from it: under the gash, narrowing as it goes
      float below = -e.y, side = length(e.xz) / w.w;
      if (below > 0.0 && below < w.w * 9.0) run = max(run, (1.0 - below / (w.w * 9.0)) * step(side, 1.1 - below / (w.w * 10.0)));
      continue;
    }
    float d = length(vBind - w.xyz) / abs(w.w);
    if (w.w > 0.0) hole = min(hole, d); else cut = min(cut, d);
  }
  float n = gNoise(vBind * 60.0) * 0.65 + gNoise(vBind * 170.0) * 0.35;
  float h = hole + (n - 0.5) * 0.6;
  float c = cut + (n - 0.5) * 0.5;
  float s = gash + (n - 0.5) * 0.45;
  float sp = min(burn, ice) + (n - 0.5) * 0.08;        // spell holes: clean discs, barely ragged
  vec3 raw = mix(vec3(0.30, 0.015, 0.02), vec3(0.70, 0.12, 0.10), n);
  if (gl_FrontFacing) {
    if (h < 0.6 || sp < 0.62) discard;                  // torn (or blown) open
    if (s < 0.45) { col.rgb = mix(vec3(0.16, 0.0, 0.01), raw, smoothstep(0.12, 0.45, s)); return 1.0; }   // the gash
    if (s < 2.4 || run * (0.6 + 0.8 * gNoise(vBind * vec3(240.0, 30.0, 240.0))) > 0.75) {
      float k = s < 2.4 ? smoothstep(0.45, 2.4, s) : 0.3;
      col.rgb = mix(col.rgb * vec3(0.32, 0.03, 0.03), col.rgb, k);   // blood about the lips of it, and down from it
      if (s < 2.4) return (1.0 - k) * 0.9;
    }
    if (h < 0.86 || c < 0.55) { col.rgb = raw; return 1.0; }
    if (sp < 0.7) { col.rgb = raw * 0.5; return 1.0; }  // a thin lip of seared meat
    float soak = min(smoothstep(0.86, 1.8, h), smoothstep(0.55, 1.5, c));
    col.rgb = mix(col.rgb * vec3(0.40, 0.05, 0.04), col.rgb, soak);   // blood-soaked around it
    float wet = (1.0 - soak) * 0.7;
    wet = max(wet, stains(col.rgb));
    if (sp < 1.9) {
      bool frozen = ice < burn;
      // the rim: a glowing edge gone to char (frost: white rime), then soot (a blue chill) fading out
      vec3 rim = frozen ? mix(vec3(0.92, 0.97, 1.0), vec3(0.55, 0.74, 0.92), smoothstep(0.7, 1.0, sp + n * 0.2))
                        : mix(vec3(0.62, 0.17, 0.03), vec3(0.03, 0.022, 0.018), smoothstep(0.7, 0.78, sp + n * 0.06));
      vec3 fade = frozen ? col.rgb * vec3(0.6, 0.76, 1.0) : col.rgb * mix(0.12, 0.45, n);
      col.rgb = sp < 1.0 ? rim : mix(fade, col.rgb, smoothstep(1.0, 1.9, sp));
      wet = sp < 1.0 ? (frozen ? 1.0 : 0.05) : max(wet, frozen ? 0.5 : 0.0);
    }
    return wet;
  }
  // inside the body: wet meat, coils of gut, yellow fat (the kilt's inner face stays cloth)
  if (vBind.y > 0.52 && vBind.y < 1.0 && h > 3.0 && c > 3.0 && sp > 3.0) { col.rgb *= 0.4; return 0.0; }
  float coil = sin(vBind.x * 95.0 + sin(vBind.y * 60.0) * 2.5 + vBind.z * 40.0);
  vec3 meat = mix(vec3(0.20, 0.008, 0.015), vec3(0.58, 0.07, 0.07), n);
  meat = mix(meat, vec3(0.72, 0.36, 0.34), smoothstep(0.7, 0.95, coil) * 0.65);
  meat = mix(meat, vec3(0.80, 0.70, 0.45), step(0.88, n) * 0.5);
  col.rgb = meat;
  return 1.0;
}`;

/** The gore shader on a body's material. `u`: the wound uniforms to use (a body of several
 * materials shares one set, so a wound shows across all of them); a new set if not given. */
export function goreMaterial(src, lib, u = null) {
  const normals = goreMaterial.normals || (goreMaterial.normals = new Map());
  const map = src.map;
  if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapLinearFilter; map.needsUpdate = true; }
  const mat = new THREE.MeshPhongMaterial({ map, side: THREE.DoubleSide, alphaTest: 0.5, specular: 0x2c1e1c, shininess: 30 });
  mat.name = src.name || '';   // (the Sworn's fittings find their pieces by it)
  if (map && lib?.normals) {
    if (!normals.has(map)) normals.set(map, lib.normalFrom(map, 1.0));
    mat.normalMap = normals.get(map);
  }
  if (src.emissiveMap) {     // what glows: embers in the cracks, eyes
    const e = src.emissiveMap;
    e.magFilter = THREE.NearestFilter; e.minFilter = THREE.NearestMipmapLinearFilter; e.needsUpdate = true;
    mat.emissiveMap = e;
    mat.emissive = new THREE.Color(1.6, 1.6, 1.6);
  }
  u ||= { uWound: { value: Array.from({ length: WOUNDS }, () => new THREE.Vector4(0, -99, 0, 0.001)) },
    uWoundD: { value: Array.from({ length: WOUNDS }, () => new THREE.Vector4()) },
    uWoundB: { value: Array.from({ length: WOUNDS }, () => new THREE.Vector3()) }, uWoundN: { value: 0 } };
  u.uStain ||= { value: Array.from({ length: STAINS }, () => new THREE.Vector4(0, -99, 0, 0.001)) };
  u.uStainT ||= { value: new Array(STAINS).fill(0) };
  u.uStainN ||= { value: 0 };
  mat.userData.u = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 bindPos;\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = bindPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GORE_GLSL)
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat goreWet = gore(diffuseColor);')
      .replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\nspecularStrength = mix(0.15, 2.6, goreWet);');
  };
  mat.customProgramCacheKey = () => 'zombie-gore';
  return mat;
}

// ------------------------------------------------------------------ blood, splats, gibs
const DROP_VERT = /* glsl */`
attribute float size; attribute vec3 color; varying vec3 vCol; uniform float scale;
void main() { vCol = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(size * scale / -mv.z, 1.0, 5.0); gl_Position = projectionMatrix * mv; }`;
const DROP_FRAG = /* glsl */`
varying vec3 vCol; uniform float light;
void main() { vec2 q = gl_PointCoord - 0.5; if (dot(q, q) > 0.25) discard; gl_FragColor = vec4(vCol * light, 1.0); }`;

function splatTexture() {
  const S = 64, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  const blob = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  blob(32, 32, 13);
  for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28, d = 6 + Math.random() * 10; blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 4 + Math.random() * 6); }
  for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, d = 16 + Math.random() * 14; blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1 + Math.random() * 2.2); }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}

class Gore {
  constructor(scene, physics, floor) {
    this.scene = scene; this.physics = physics;
    this.floorY = floor;     // (x, z, y) -> the surface below
    const M = this.max = 3000;
    this.n = 0;
    this.pos = new Float32Array(M * 3); this.vel = new Float32Array(M * 3); this.col = new Float32Array(M * 3);
    this.size = new Float32Array(M); this.life = new Float32Array(M); this.floor = new Float32Array(M);
    this.blood = new Uint8Array(M);   // blood splats where it lands; earth doesn't
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setAttribute('size', this.aSize);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({ vertexShader: DROP_VERT, fragmentShader: DROP_FRAG,
      uniforms: { scale: { value: 300 }, light: { value: 1 } } });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.geo = g;
    scene.add(this.points);
    this.reds = ['#4a0306', '#6a0709', '#8a0c0c', '#a5150f', '#5c0a0a'].map((c) => new THREE.Color(c));
    this.soil = ['#2a2016', '#3a2c1c', '#4a3a26', '#1e1810'].map((c) => new THREE.Color(c));
    // splats and pools on the ground
    this.splatMax = 600;
    const sg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.splats = new THREE.InstancedMesh(sg, new THREE.MeshPhongMaterial({ map: splatTexture(), alphaTest: 0.5, color: 0x8a8a8a,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, shininess: 60, specular: 0x401010 }), this.splatMax);
    this.splats.count = 0; this.splatNext = 0;
    this.splats.receiveShadow = true;
    this.splats.frustumCulled = false;
    scene.add(this.splats);
    this.pools = [];        // splats that spread: {i, x, y, z, rot, r, to, k}
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    // gibs
    this.gibGeo = new THREE.IcosahedronGeometry(1, 0);
    this.gibMat = new THREE.MeshPhongMaterial({ color: 0x5a0a0c, specular: 0x803030, shininess: 50, flatShading: true });
    this.gibs = [];
  }

  drop(p, v, size = 0.014, color = null) {
    const i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    const c = color || this.reds[Math.floor(Math.random() * this.reds.length)];
    this.col.set([c.r, c.g, c.b], i * 3);
    this.size[i] = size; this.life[i] = 3; this.blood[i] = color ? 0 : 1;
    this.floor[i] = this.floorY(p.x, p.z, p.y);
  }

  /** A spray of `n` drops from p, thrown along dir with some spread. */
  spray(p, dir, n, { speed = 3, spread = 0.6, size = 0.014 } = {}) {
    const v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).multiplyScalar(spread).add(dir).normalize()
        .multiplyScalar(speed * (0.3 + Math.random() * 0.9));
      this.drop(p, v, size * (0.5 + Math.random()));
    }
  }

  splat(x, y, z, r, grow = 0, color = null) {
    const i = this.splatNext;
    this.splatNext = (i + 1) % this.splatMax;
    this.splats.count = Math.max(this.splats.count, i + 1);
    const rot = Math.random() * 6.28;
    const c = color || this.reds[Math.floor(Math.random() * 3)];
    this.splats.setColorAt(i, c);
    this.splats.instanceColor.needsUpdate = true;
    this.pools = this.pools.filter((p) => p.i !== i);
    if (grow) this.pools.push({ i, x, y, z, rot, r: r * 0.2, to: r, k: grow });
    this.place(i, x, y, z, rot, grow ? r * 0.2 : r);
  }

  place(i, x, y, z, rot, r) {
    this._q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rot);
    this._m.compose(this._p.set(x, y + 0.012 + (i % 50) * 0.0004, z), this._q, this._s.set(r, 1, r));
    this.splats.setMatrixAt(i, this._m);
    this.splats.instanceMatrix.needsUpdate = true;
  }

  gib(p, v) {
    if (this.gibs.length > 80) { const o = this.gibs.shift(); this.scene.remove(o.m); }
    const m = new THREE.Mesh(this.gibGeo, this.gibMat);
    const s = 0.008 + Math.random() * 0.014;
    m.scale.set(s * (0.7 + Math.random() * 0.6), s, s * (0.7 + Math.random() * 0.6));
    m.position.copy(p);
    m.castShadow = true;
    this.scene.add(m);
    this.gibs.push({ m, v: v.clone(), spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(14), s, rest: false });
  }

  update(dt, camera, height, light) {
    this.mat.uniforms.scale.value = height / 2 * camera.projectionMatrix.elements[5];
    this.mat.uniforms.light.value = light;
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      V[j + 1] -= 13 * dt;
      const dr = Math.max(0, 1 - 0.6 * dt);
      V[j] *= dr; V[j + 2] *= dr;
      P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt;
      this.life[i] -= dt;
      if (P[j + 1] <= this.floor[i] || this.life[i] <= 0) {
        if (P[j + 1] <= this.floor[i] && this.blood[i] && Math.random() < 0.22) this.splat(P[j], this.floor[i], P[j + 2], 0.06 + this.size[i] * 8);
        const k = --this.n;                              // swap-remove
        if (i !== k) {
          P.copyWithin(j, k * 3, k * 3 + 3); V.copyWithin(j, k * 3, k * 3 + 3); this.col.copyWithin(j, k * 3, k * 3 + 3);
          this.size[i] = this.size[k]; this.life[i] = this.life[k]; this.floor[i] = this.floor[k]; this.blood[i] = this.blood[k];
        }
        i--;
      }
    }
    this.geo.setDrawRange(0, this.n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
    for (const p of this.pools) {
      if (p.r >= p.to) continue;
      p.r = Math.min(p.to, p.r + dt * p.k);
      this.place(p.i, p.x, p.y, p.z, p.rot, p.r);
    }
    for (const g of this.gibs) {
      if (g.rest) continue;
      g.v.y -= 13 * dt;
      g.m.position.addScaledVector(g.v, dt);
      g.m.rotation.x += g.spin.x * dt; g.m.rotation.y += g.spin.y * dt; g.m.rotation.z += g.spin.z * dt;
      if (Math.random() < dt * 6) this.drop(g.m.position, new THREE.Vector3(0, -0.5, 0), 0.01);
      const fl = this.floorY(g.m.position.x, g.m.position.z, g.m.position.y + g.s) + g.s;
      if (g.m.position.y < fl) {
        g.m.position.y = fl;
        if (g.v.y < -1.2) { g.v.y *= -0.25; g.v.x *= 0.5; g.v.z *= 0.5; g.spin.multiplyScalar(0.5); this.splat(g.m.position.x, fl - g.s, g.m.position.z, 0.1); }
        else { g.rest = true; }
      }
    }
  }
}

// ------------------------------------------------------------------ a zombie
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3(), _f = new THREE.Vector3(), _m = new THREE.Matrix4();
const normals = new Map();   // texture -> its normal map, made once per body
const ZERO4 = new THREE.Vector4(), ZERO3 = new THREE.Vector3();
const EMBER = [new THREE.Color(1, 0.7, 0.2), new THREE.Color(1, 0.35, 0.05), new THREE.Color(0.3, 0.2, 0.15)];
const FROST = new THREE.Color(0.85, 0.94, 1.0);

// The monsters carry the same hair, eye and body-detail images byte for byte: one copy of each
// serves them all (with a copy of the hair per monster, they alone ran past half a gigabyte of
// graphics memory).
const sharedTex = new Map();   // image name -> the texture every monster uses

function shareTextures(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const k of Object.keys(m)) {
        const t = m[k];
        if (!t?.isTexture) continue;
        const kept = t.name && sharedTex.get(t.name);
        if (kept && kept !== t) { if (kept.source !== t.source) t.image?.close?.(); m[k] = kept; continue; }
        if (t.name) sharedTex.set(t.name, t);
      }
    }
  });
}

/** A monster body in the zombie body's terms: bones and tracks renamed, turned to face +z, and
 * the clips the brain asks for (walk, run, attack3, dead) made from its own. */
function adaptMonster(gltf) {
  shareTextures(gltf.scene);
  gltf.scene.traverse((o) => { if (MONSTER_BONES[o.name]) o.name = MONSTER_BONES[o.name]; });
  gltf.scene.rotation.y = Math.PI;                         // built facing -z
  const clips = {};
  for (const c of gltf.animations) {
    for (const t of c.tracks) {
      const i = t.name.lastIndexOf('.'), n = t.name.slice(0, i);
      if (MONSTER_BONES[n]) t.name = MONSTER_BONES[n] + t.name.slice(i);
    }
    clips[c.name] = c;
  }
  const alias = (src, name) => { if (clips[src]) { const c = clips[src].clone(); c.name = name; gltf.animations.push(c); } };
  alias('move', 'walk'); alias('move', 'run'); alias('attack1', 'attack3');
  if (clips.death) {
    const last = Math.round(clips.death.duration * FPS);
    gltf.animations.push(THREE.AnimationUtils.subclip(clips.death, 'dead', last - 1, last, FPS));
  }
  return gltf;
}

export class Zombie {
  static ONCE = ONCE;      // clips that play once (subclasses bring their own)

  constructor(gltf, variant, owner, o) {
    this.owner = owner;
    this.variant = variant;
    this.id = owner.nextId++;
    const root = this.root = new THREE.Group();
    const model = cloneSkinned(gltf.scene);
    root.add(model);
    // the body is the biggest skinned mesh (monsters also carry eyes, brows and bones)
    model.traverse((c) => { if (c.isSkinnedMesh && (!this.mesh || c.geometry.attributes.position.count > this.mesh.geometry.attributes.position.count)) this.mesh = c; });
    const mesh = this.mesh;
    // every body of a kind shares its vertices; each has its own triangles, as limbs come off
    const src = mesh.geometry, geo = mesh.geometry = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(src.attributes)) geo.setAttribute(k, a);
    geo.setAttribute('bindPos', src.attributes.position);
    geo.setIndex(src.index.clone());
    for (const g of src.groups) geo.addGroup(g.start, g.count, g.materialIndex);
    this.shared = Object.keys(geo.attributes);
    mesh.material = this.material(mesh.material, owner.lib);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.u = [mesh.material].flat()[0].userData.u;
    // a body of several materials (the sworn's armour): which group each triangle draws in, so
    // the groups can be laid out again as limbs come off
    if (geo.groups.length > 1) {
      this.triGroup = new Uint8Array(geo.index.count / 3);
      geo.groups.forEach((g, i) => this.triGroup.fill(i, g.start / 3, (g.start + g.count) / 3));
    }
    this.skel = mesh.skeleton;
    this.bones = {};
    for (const b of this.skel.bones) this.bones[b.name] = b;
    this.bindInv = mesh.bindMatrix.clone().invert();
    // each vertex belongs to its strongest bone
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, nv = si.count;
    this.dom = new Uint8Array(nv);
    for (let i = 0; i < nv; i++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      this.dom[i] = best;
    }
    this.index = geo.index.array.slice();
    this.alive = new Uint8Array(this.index.length / 3).fill(1);

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      if (this.constructor.ONCE.has(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[clip.name] = a;
    }
    this.cur = null;

    this.pos = new THREE.Vector3(o.x, o.y, o.z);
    this.yaw = o.yaw ?? Math.random() * Math.PI * 2;
    this.zone = o.zone || 'yard';
    this.home = this.pos.clone();
    this.room = o.room || null;            // dungeon room rectangle it haunts
    this.dg = o.dg || null;                // the underground place it haunts (its corridors' flow)
    this.kindName = o.kind || 'shambler';
    this.kind = KINDS[this.kindName];
    this.pace = 0.88 + Math.random() * 0.24;
    this.flank = [-1, 0, 1][this.id % 3];
    this.vy = 0; this.air = 0;
    this.hp = HP;
    this.limbHp = { ...LIMB_HP };
    this.lost = new Set();     // bones cut away (with all below them); 'waist' for the legs and hips
    this.wounds = []; this.cuts = [];
    this.stumps = [];
    this.mode = 'stand';       // stand | crawl
    this.state = 'move';       // move | attack | jump | collapse | rise | getup | buried | playdead | dead
    // the brain
    this.aggro = false;        // hunting you
    this.goal = 'wander';      // wander | chase | hunt (go where it last had you) | search
    this.lastSeen = new THREE.Vector3(); this.lastT = -99; this.hasLast = false;
    this.canSee = false; this.dist = 99;
    this.think = Math.random() * 0.25;
    this.wander = null; this.wanderT = Math.random() * 4;
    this.searchT = 0;
    this.groanT = 2 + Math.random() * 6;
    this.avoid = 0; this.avoidT = 0; this.feelT = Math.random() * 0.2;
    this.lungeT = 0; this.lungeCool = 2 + Math.random() * 4;
    this.stagger = 0; this.cool = 0; this.jitter = 0;
    this.deadT = 0; this.sinking = false; this.gone = false;
    this.mixAcc = 0; this.frame = this.id;

    const start = o.start || 'stand';
    if (start === 'buried') { this.state = 'buried'; root.visible = false; }
    else if (start === 'rise') this.beginRise();
    else if (start === 'playdead') { this.state = 'playdead'; this.play('dead', 0); this.mixer.update(0); }   // (posed at once: lying, not standing in its bind pose till you come near)
    else { this.play('idle', 0); this.mixer.update(Math.random() * 2); }
    owner.scene.add(root);
    this.sync();
  }

  /** The skin's material: the zombies' gore shader (other bodies extend it). */
  material(src, lib) { return goreMaterial(src, lib); }

  get dead() { return this.state === 'dead'; }
  get slow() { return this.chillT > 0 ? 0.4 : 1; }

  /** Made a champion (a quest's boss): bigger by C.scale, C.hp times as hard to kill, hitting
   * C.dmg times as hard (main's hurtPlayer reads champ.dmg), glowing faintly in its tint. */
  champion(C) {
    const s = C.scale || 1.5, k = C.hp || 6;
    this.champ = { key: C.key, name: C.name, dmg: C.dmg || 2, max: HP * k, xp: C.xp };
    this.root.scale.setScalar(s); this.size = s;
    this.radius = {}; this.tips = {};
    for (const b of this.skel.bones) {
      const kind = b.name.replace(/[LR]$/, '');
      if (RADIUS[kind]) this.radius[b.name] = RADIUS[kind] * s;
      if (TIP[kind]) this.tips[b.name] = TIP[kind] * s;
    }
    this.hp = this.champ.max;
    for (const l of Object.keys(this.limbHp)) this.limbHp[l] *= k * 0.45;
    this.kind = { ...this.kind, sight: 26, hear: 1.6, run: Math.max(this.kind.run || 0, 2.4) };
    this.heft = 3;
    // its glow shows in what already glows (an ember husk's cracks): a body is never lit up whole
    for (const m of [this.mesh.material].flat()) if (m.emissive && m.emissiveMap) { m.emissive.setRGB(...(C.tint || [1, 1, 1])).multiplyScalar(1.4); }
    return this;
  }

  /** Frost and fire from a shield's enchantments: chilled it moves slow, burning it smoulders. */
  afflictShield(dt) {
    if (this.chillT > 0) this.chillT -= dt;
    this.mixer.timeScale = this.chillT > 0 ? 0.45 : 1;
    if (this.burnT > 0 && !this.dead) {
      this.burnT -= dt;
      this.hp -= (this.burnDps || 3) * dt;
      if (Math.random() < dt * 24) this.owner.gore.drop(_t.copy(this.pos).add(_u.set((Math.random() - 0.5) * 0.5, 0.6 + Math.random(), (Math.random() - 0.5) * 0.5)),
        _w.set((Math.random() - 0.5) * 0.4, 1.2, (Math.random() - 0.5) * 0.4), 0.014, EMBER[Math.floor(Math.random() * 3)]);
      if (this.hp <= 0) this.die();
    }
  }
  get standing() { return !this.dead && this.state !== 'buried' && this.state !== 'rise' && this.state !== 'playdead'; }
  has(b) { return !this.lost.has(b); }
  arm(s) { return this.has('upper_arm' + s) && this.has('forearm' + s); }
  get legs() { return this.has('waist') && ['thighL', 'shinL', 'thighR', 'shinR'].every((b) => this.has(b)); }
  get feet() { return this.has('footL') && this.has('footR'); }
  forward(out = _v) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  play(name, fade = 0.25, speed = 1) {
    const a = this.actions[name];
    if (!a) return;
    if (this.holdT > 0 && (name === 'walk' || name === 'run' || name === 'idle')) return;   // let a roar or flinch finish
    a.timeScale = speed;
    if (this.cur === name) {
      if (this.constructor.ONCE.has(name) && this.done()) { a.reset().play(); this.fired = false; }   // again, from the top
      return;
    }
    const prev = this.actions[this.cur];
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    this.cur = name;
    this.fired = false;
  }

  done() { const a = this.actions[this.cur]; return !a || !a.isRunning() || a.time >= a.getClip().duration - 1e-3; }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  /** Up out of the ground; `speed` > 1 scrambles out (a set piece's dead: zb.quick). */
  beginRise(speed = this.quick || 1) {
    this.state = 'rise';
    this.root.visible = true;
    this.play('rise', 0, speed);
    this.riseT = 0;
    this.owner.dirt(this.pos, 1.0);
    this.owner.sound('dirt', this.pos);
  }

  wake(target, speed = this.quick || 1) {
    if (this.state === 'playdead') { this.state = 'getup'; this.play('getup', 0.1, speed); }
    else if (this.state === 'buried') this.beginRise(speed);
    this.hunt(target, true);
  }

  /** Something gave you away at `p`: chase if `sure`, else go and look. */
  hunt(p, sure) {
    if (!p) return;
    this.lastSeen.copy(p); this.hasLast = true; this.lastT = this.owner.time;
    if (sure) { this.aggro = true; this.goal = 'chase'; } else if (!this.aggro) this.goal = 'hunt';
  }

  // -------------------------------------------------------------- hits
  /** Bone capsules in world space: [{bone, a, b, r}] for the bones still attached. */
  capsules() {
    const out = [];
    if (this.state === 'buried') return out;
    this.root.updateMatrixWorld(true);
    for (const b of this.skel.bones) {
      if (b.name === 'root' || this.cutAway(b.name) || (b.name === 'hips' && !this.has('waist'))) continue;
      const kind = b.name.replace(/[LR]$/, '');
      const r = this.radius?.[b.name] ?? RADIUS[kind];   // a body built with its own hit shapes, or the zombies'
      if (!r) continue;
      const a = b.getWorldPosition(new THREE.Vector3());
      const child = b.children.find((c) => c.isBone && !c.name.startsWith('shoulder') && !c.name.startsWith('thigh'));
      let e;
      if (child && kind !== 'hips') e = child.getWorldPosition(new THREE.Vector3());
      else if (kind === 'hips') e = this.bones.spine.getWorldPosition(new THREE.Vector3());
      else e = b.localToWorld(new THREE.Vector3(0, this.tips?.[b.name] ?? TIP[kind] ?? 0.2, 0));
      out.push({ bone: b, a, b: e, r });
    }
    return out;
  }

  cutAway(name) {
    let b = this.bones[name];
    while (b && b.isBone) { if (this.lost.has(b.name)) return true; b = b.parent; }
    return false;
  }

  /** Ray (origin o, unit d) against this zombie's capsules: {t, bone, point} or null. */
  ray(o, d, far) {
    if (this.gone || this.state === 'buried' || o.distanceTo(this.pos) > far + 2.5) return null;
    let best = null;
    for (const c of this.capsules()) {
      const t = rayCapsule(o, d, c.a, c.b, c.r);
      if (t !== null && t <= far && (!best || t < best.t)) best = { t, bone: c.bone, point: o.clone().addScaledVector(d, t), z: this };
    }
    return best;
  }

  /** Where a world point sits in the mesh's bind space, carried by bone b. */
  toBind(p, b) {
    const i = this.skel.bones.indexOf(b);
    this.mesh.updateMatrixWorld(true);
    _m.copy(b.matrixWorld).invert();
    const q = p.clone().applyMatrix4(_m);
    _m.copy(this.skel.boneInverses[i]).invert();
    return q.applyMatrix4(_m).applyMatrix4(this.bindInv);
  }

  writeWounds() {
    const all = [...this.cuts, ...this.wounds].slice(0, WOUNDS);
    all.forEach((w, i) => { this.u.uWound.value[i].copy(w); this.u.uWoundD.value[i].copy(w.d || ZERO4); this.u.uWoundB.value[i].copy(w.b || ZERO3); });
    this.u.uWoundN.value = all.length;
  }

  /** A hole of radius r at a world point; rim: a spell's round one (SPELL_RIM), seared or frozen. */
  wound(point, bone, r, rim = 0) {
    const c = this.toBind(point, bone);
    const w = new THREE.Vector4(c.x, c.y, c.z, r);
    if (rim) w.d = new THREE.Vector4(0, 0, 0, rim);
    this.wounds.push(w);
    while (this.wounds.length + this.cuts.length > WOUNDS) this.wounds.shift();
    this.writeWounds();
  }

  /** A mark on the skin at a world point, carried by bone b: blood (type 0), char (1), rime (2) or
   * poison (3), `r` metres across its middle. Only ever where something struck. */
  mark(point, bone, r, type = 0) {
    const c = this.toBind(point, bone);
    (this.marks ||= []).push({ v: new THREE.Vector4(c.x, c.y, c.z, r), t: type });
    while (this.marks.length > STAINS) this.marks.shift();
    this.writeMarks();
  }

  writeMarks() {
    const S = this.u.uStain, T = this.u.uStainT, m = this.marks || [];
    if (!S) return;
    m.forEach((s, i) => { S.value[i].copy(s.v); T.value[i] = s.t; });
    this.u.uStainN.value = m.length;
  }

  /** The marks of one kind wear off (the rime, as it thaws). */
  unmark(type) {
    if (!this.marks?.some((s) => s.t === type)) return;
    this.marks = this.marks.filter((s) => s.t !== type);
    this.writeMarks();
  }

  /** Marks of a kind on a few places about the body (frost over a frozen one, char on a burning one). */
  markAbout(type, n, r) {
    const at = ['chest', 'head', 'upper_armL', 'upper_armR', 'thighL', 'thighR', 'spine', 'forearmL', 'forearmR', 'shinL', 'shinR'];
    for (let i = 0, k = Math.floor(Math.random() * at.length); i < n; i++, k += 3) {
      const b = this.bones[at[k % at.length]];
      if (!b || this.cutAway(b.name)) continue;
      this.mark(b.getWorldPosition(_t).add(_u.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12)), b, r * (0.8 + Math.random() * 0.4), type);
    }
  }

  /** A blade's gash across the body where it bit: from a to b (world), `width` wide, the blow
   * coming along `dir` (world: the gash is measured across it, so it follows the body round). */
  slash(a, b, bone, width, dir) {
    const ca = this.toBind(a, bone), cb = this.toBind(b, bone);
    const w = new THREE.Vector4((ca.x + cb.x) / 2, (ca.y + cb.y) / 2, (ca.z + cb.z) / 2, width);
    w.d = new THREE.Vector4((cb.x - ca.x) / 2, (cb.y - ca.y) / 2, (cb.z - ca.z) / 2, 1);
    const mid = a.clone().lerp(b, 0.5);
    w.b = this.toBind(mid.clone().add(dir), bone).sub(this.toBind(mid, bone)).normalize();
    this.wounds.push(w);
    while (this.wounds.length + this.cuts.length > WOUNDS) this.wounds.shift();
    this.writeWounds();
  }

  /** What a hit on bone b can cut off, or null for the chest. */
  limbOf(b) {
    const n = b.name;
    if (LIMB_HP[n] !== undefined) return n;
    if (n === 'neck') return 'head';
    if (n === 'hips' || n === 'spine') return 'waist';
    return null;
  }

  /** A blow landing at h (bone, point) along dir. kind: 'blade' (a gash along `edge`, the
   * blade's sweep in the world, when given), 'blunt', or a spell's; push: how hard it shoves;
   * blow: a spell's chance (times BLOW for where it lands) to blow off what it hits. */
  hit(h, { dmg, dir, heavy = false, kind = 'blade', edge = null, push = 0, blow = 0 }) {
    const owner = this.owner, g = owner.gore;
    const b = h.bone, p = h.point;
    const back = dir.clone().negate();
    if (this.frozen > 0) dmg *= 1.5;   // brittle with ice
    // the wound and its blood: an edge leaves a gash where it cut, a spell a round hole seared at
    // the rim, anything else a ragged hole
    const rim = SPELL_RIM[kind] || 0;
    const r = rim ? (heavy ? 0.1 : 0.07) + (kind === 'fire' ? 0.02 : 0) + Math.random() * 0.015
      : (heavy ? 0.085 : 0.06) + (kind === 'fire' ? 0.03 : 0) + Math.random() * 0.02;
    if (kind === 'blade' && edge) {
      const half = (heavy ? 0.17 : 0.12) * (0.85 + Math.random() * 0.3);
      this.slash(_t.copy(p).addScaledVector(edge, -half), _f.copy(p).addScaledVector(edge, half), b, heavy ? 0.03 : 0.022, dir);
    } else this.wound(p, b, r, rim);
    g.spray(p, dir, heavy ? 70 : 45, { speed: heavy ? 4.5 : 3.4, spread: 0.9 });
    g.spray(p, back.clone().add(_u.set(0, 0.6, 0)), heavy ? 40 : 26, { speed: 2.6, spread: 0.8 });
    for (let i = 0; i < (heavy ? 7 : 4); i++) g.gib(p, _w.copy(dir).multiplyScalar(2 + Math.random() * 2).add(_u.set((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3)));
    g.splat(p.x, owner.floorY(p.x, p.z, p.y), p.z, 0.35 + Math.random() * 0.3);
    owner.sound('squelch', p, heavy);
    // the blood (or char, or rime) thrown over the skin about the blow: a splash where it landed and
    // a smaller one or two flung on along it
    this.mark(p, b, (heavy ? 0.11 : 0.085) * (0.85 + Math.random() * 0.3), MARK[kind] ?? 0);
    for (let i = 0; i < (heavy ? 2 : 1); i++) {
      _t.copy(p).addScaledVector(dir, 0.05).add(_u.set((Math.random() - 0.5) * 0.22, (Math.random() - 0.4) * 0.22, (Math.random() - 0.5) * 0.22));
      this.mark(_t, b, 0.04 + Math.random() * 0.03, 0);
    }
    // damage: limbs come off, the trunk dies. The legs are thick: an edge bites them no deeper than
    // anything else, and something big is a good deal harder again to bring down to the ground
    const limb = this.limbOf(b);
    if (limb && !this.lost.has(limb)) {
      const leg = LEG.test(limb);
      this.limbHp[limb] -= dmg * (leg ? (kind === 'blade' ? 0.85 : 0.5) / legToughness(this.heft) : kind === 'blade' ? (heavy ? 1.4 : 1.15) : 0.7);
      this.hp -= dmg * (limb === 'waist' ? 0.6 : 0.35);
      const big = (this.heft || 1) >= 1.6 || this.champ || this.def?.boss;
      if (this.limbHp[limb] <= 0) this.sever(limb, dir);
      else if (blow && !(leg && big) && Math.random() < blow * BLOW[limb.replace(/[LR]$/, '')] / (leg ? this.heft || 1 : 1)) this.blowOff(limb, dir, rim);
    } else {
      this.hp -= dmg;
    }
    if (this.state === 'playdead' || this.state === 'buried') this.wake(owner.player?.pos);
    else this.hunt(owner.player?.pos, true);
    owner.alert(this, owner.player?.pos, 9);
    // (a blow doesn't throw the body back: it takes it where it stands. Only the shield's repel
    // enchantment, and the spells that are themselves a force, move it: see knock and shove)
    void push;
    if (!this.dead) {
      if (this.state === 'move' || this.state === 'attack') {
        if (this.state === 'move') this.stagger = heavy ? 0.55 : 0.32;
        if (this.state === 'move' && this.actions.hit) { this.holdT = 0; this.play('hit', 0.06); this.holdT = this.actions.hit.getClip().duration; this.stagger = Math.max(this.stagger, this.holdT); }
      }
      if (this.hp <= 0) this.die();
    }
  }

  /** A spell takes the limb clean off: a foot or a hand goes with the shin or forearm above it
   * (so a leg shot always brings it down to crawl), flung hard, the stump seared. */
  blowOff(limb, dir, rim) {
    const name = limb.replace(/^foot/, 'shin').replace(/^hand/, 'forearm');
    if (this.lost.has(name)) return;
    const joint = this.bones[name === 'waist' ? 'spine' : name].getWorldPosition(new THREE.Vector3());
    const stay = name === 'waist' ? this.bones.spine : this.bones[name].parent;
    this.sever(name, dir.clone().multiplyScalar(1.8).add(_u.set(0, 0.4, 0)));
    this.wound(joint, stay, name === 'waist' ? 0.16 : name === 'head' ? 0.1 : 0.085, rim || 2);
    this.owner.gore.spray(joint, dir, 90, { speed: 6, spread: 1.2, size: 0.016 });
  }

  sever(name, dir) {
    const owner = this.owner, g = owner.gore;
    const waist = name === 'waist';
    const bone = waist ? this.bones.spine : this.bones[name];
    const parent = waist ? this.bones.spine : bone.parent;    // what stays on the body
    // the triangles of the limb and everything below it (cut in half: the hips and both legs)
    const set = new Set();
    const take = (o) => o.traverse((c) => { if (c.isBone) set.add(this.skel.bones.indexOf(c)); });
    if (waist) { set.add(this.skel.bones.indexOf(this.bones.hips)); take(this.bones.thighL); take(this.bones.thighR); } else take(bone);
    const idx = this.index, keep = [], gone = [], keptT = [], goneT = [];
    for (let t = 0; t < this.alive.length; t++) {
      if (!this.alive[t]) continue;
      const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
      const n = set.has(this.dom[a]) + set.has(this.dom[b]) + set.has(this.dom[c]);
      if (n >= 2) { this.alive[t] = 0; gone.push(a, b, c); goneT.push(t); } else { keep.push(a, b, c); keptT.push(t); }
    }
    this.lost.add(name);
    if (waist) { this.lost.add('thighL'); this.lost.add('thighR'); }
    this.mesh.geometry.setIndex(keep);
    const goneGroups = this.triGroup ? this.regroup(this.mesh.geometry, keptT, goneT) : null;
    // the joint, in world space and bind space; a cut there colours the stump and the piece
    const joint = bone.getWorldPosition(new THREE.Vector3());
    const jb = this.toBind(joint, parent);
    this.cuts.push(new THREE.Vector4(jb.x, jb.y, jb.z, -(waist ? 0.15 : name === 'head' ? 0.09 : 0.075)));
    this.writeWounds();
    if (gone.length) owner.addPiece(this, gone, joint, dir, goneGroups);
    // a bone stub on the stump (the spine, cut in two), and a spurting pulse
    const at = waist ? new THREE.Vector3(0, 0.01, 0) : bone.position.clone();
    const along = waist ? new THREE.Vector3(0, -1, 0) : bone.position.clone().normalize();
    const stub = new THREE.Mesh(owner.stubGeo, owner.stubMat);
    stub.position.copy(at).addScaledVector(along, 0.015);
    stub.quaternion.setFromUnitVectors(_u.set(0, 1, 0), along);
    if (waist) stub.scale.set(1.6, 1.4, 1.6);
    parent.add(stub);
    this.stumps.push({ bone: parent, at, dir: along.clone(), t: 0, life: waist ? 14 : 9 });
    g.spray(joint, _w.copy(dir).add(_u.set(0, 1, 0)), waist ? 260 : 160, { speed: 4.5, spread: 0.8, size: 0.018 });
    for (let i = 0; i < (waist ? 22 : 10); i++) g.gib(joint, _w.set((Math.random() - 0.5) * 4, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 4));
    g.splat(joint.x, owner.floorY(joint.x, joint.z, joint.y), joint.z, waist ? 1.4 : 0.9, 0.15);
    owner.sound('sever', joint);
    if (name === 'head') { this.hp -= 30; this.jitter = 1; }
    // without a leg (or its legs) it can no longer stand
    if (!this.dead && this.mode === 'stand' && !this.legs) {
      this.state = 'collapse';
      this.play('collapse', 0.12);
      if (waist) this.pos.y += 0;   // the upper half drops where it stood
    }
  }

  /** Without its legs from the start (it fell, long ago): the legs' triangles gone and the stumps
   * shown cut, but none of a fresh wound's spray, pieces or cries. It drags itself from the first. */
  cripple(names = ['shinL', 'shinR']) {
    const set = new Set();
    for (const name of names) this.bones[name]?.traverse((c) => { if (c.isBone) set.add(this.skel.bones.indexOf(c)); });
    const idx = this.index, keep = [], keptT = [], goneT = [];
    for (let t = 0; t < this.alive.length; t++) {
      if (!this.alive[t]) continue;
      const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
      if (set.has(this.dom[a]) + set.has(this.dom[b]) + set.has(this.dom[c]) >= 2) { this.alive[t] = 0; goneT.push(t); } else { keep.push(a, b, c); keptT.push(t); }
    }
    this.mesh.geometry.setIndex(keep);
    if (this.triGroup) this.regroup(this.mesh.geometry, keptT, goneT);
    this.root.updateMatrixWorld(true);
    for (const name of names) {
      const bone = this.bones[name];
      if (!bone) continue;
      this.lost.add(name);
      const jb = this.toBind(bone.getWorldPosition(new THREE.Vector3()), bone.parent);
      this.cuts.push(new THREE.Vector4(jb.x, jb.y, jb.z, -0.075));
    }
    this.writeWounds();
    this.mode = 'crawl'; this.state = 'move';
    this.play('crawl', 0);
  }

  /** The body's material groups laid out again over the triangles it keeps (`kept` and `gone` are
   * triangle numbers in their first order, so each group's still sit together); returns the groups
   * of the piece cut off, as [start, count, material]. */
  regroup(geo, kept, gone) {
    const n = new Uint32Array(this.mesh.material.length);
    const groups = (tris) => {
      n.fill(0);
      for (const t of tris) n[this.triGroup[t]]++;
      const out = [];
      let at = 0;
      n.forEach((c, g) => { if (c) out.push([at, c * 3, g]); at += c * 3; });
      return out;
    };
    geo.clearGroups();
    for (const [s, c, g] of groups(kept)) geo.addGroup(s, c, g);
    return groups(gone);
  }

  // -------------------------------------------------------------- spells that linger
  /** Frozen solid for t seconds: nothing moves, rime over it in patches (never a body gone blue). */
  freeze(t) {
    if (this.dead) return;
    if (!(this.frozen > 0)) this.markAbout(2, 5, 0.15);
    this.frozen = Math.max(this.frozen || 0, t); this.burning = 0;
  }
  /** Slowed to a crawl by cold (or choking smoke) for t seconds. */
  chill(t) { if (!this.dead) this.chilled = Math.max(this.chilled || 0, t); }
  /** Set alight: `dps` a second for t seconds (ice puts it out): char where it took, and embers. */
  ignite(t, dps = 6) {
    if (this.dead) return;
    if (!(this.burning > 0)) this.markAbout(1, 2, 0.1);
    this.burning = Math.max(this.burning || 0, t); this.burnDps = Math.max(this.burnDps || 0, dps); this.frozen = 0;
    this.unmark(2);
  }
  poison(t, dps = 5) {
    if (this.dead) return;
    if (!(this.poisoned > 0)) this.markAbout(3, 2, 0.1);
    this.poisoned = Math.max(this.poisoned || 0, t); this.poisonDps = Math.max(this.poisonDps || 0, dps);
  }
  /** A shove (m/s) from a spell that is itself a force, worn off by friction; a frozen one slides
   * like a statue on ice. One down on the ground isn't moved: it lies where it fell. */
  shove(x, z, up = 0) {
    if (this.mode === 'crawl' || this.state === 'collapse' || this.dead) return;
    (this.pushV ||= new THREE.Vector3()).x += x; this.pushV.z += z;
    if (up > 0 && !this.dead) { this.pos.y += 0.05; this.vy = Math.max(this.vy, up); }
  }
  /** Damage with no wound to show for it (fire, poison, a drained life). */
  harm(dmg) {
    if (this.dead || this.gone) return;
    this.hp -= dmg * (this.kind.armor ?? 1) * (this.frozen > 0 ? 1.5 : 1);
    if (this.state === 'playdead' || this.state === 'buried') this.wake(this.owner.player?.pos);
    else this.hunt(this.owner.player?.pos, true);
    if (this.hp <= 0) this.die();
  }
  /** The lingering spells' clocks: returns how fast it moves this frame (0: frozen). Run once a
   * frame, by the horde's update (with the shield's enchantments' afflictions). */
  afflict(dt) {
    if (this.chillT > 0 || this.burnT > 0) this.afflictShield(dt);
    if (!(this.frozen || this.chilled || this.burning || this.poisoned || this.pushV)) return 1;
    if (this.dead) this.frozen = this.chilled = this.burning = this.poisoned = 0;
    if (this.burning > 0) { this.burning -= dt; this.harm(this.burnDps * dt); }
    if (this.poisoned > 0) { this.poisoned -= dt; this.harm(this.poisonDps * dt); }
    if (this.frozen > 0) this.frozen -= dt;
    if (this.chilled > 0) this.chilled -= dt;
    const v = this.pushV;
    if (v && v.lengthSq() > 1e-4) {
      this.owner.physics.slide(this.pos, v.x * dt, v.z * dt, 0.3, 1.6, 0.45);
      v.multiplyScalar(Math.exp(-dt * (this.frozen > 0 ? 1.2 : 3)));
      if (this.frozen > 0 || this.dead) this.sync();
    } else this.pushV = null;
    // what a lingering spell does shows on the body where it took (see mark), and in what comes off
    // it: embers and smoke off the burning, a cold mist off the frozen. The skin is never re-coloured.
    const g = this.owner.gore;
    if (this.burning > 0 && Math.random() < dt * 22) {
      const b = this.bones[['chest', 'spine', 'head', 'upper_armL', 'upper_armR'][Math.floor(Math.random() * 5)]];
      if (b && !this.cutAway(b.name)) g.drop(b.getWorldPosition(_t).add(_u.set((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25)),
        _w.set((Math.random() - 0.5) * 0.4, 1.1 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4), 0.012, EMBER[Math.floor(Math.random() * 3)]);
    }
    if (this.frozen > 0 && Math.random() < dt * 10) g.drop(_t.copy(this.pos).add(_u.set((Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 1.3, (Math.random() - 0.5) * 0.5)),
      _w.set((Math.random() - 0.5) * 0.2, -0.3, (Math.random() - 0.5) * 0.2), 0.01, FROST);
    if (this.frozen <= 0 && this.marks?.some((s) => s.t === 2)) this.unmark(2);   // thawed: the rime goes
    if (!(this.frozen > 0 || this.chilled > 0 || this.burning > 0 || this.poisoned > 0)) this.frozen = this.chilled = this.burning = this.poisoned = 0;
    return this.frozen > 0 ? 0 : this.chilled > 0 ? 0.4 : 1;
  }

  die() {
    this.state = 'dead';
    this.deadT = 0;
    this.owner.onDeath?.(this);   // (experience, and the quests' counts)
    // the dead carried things into the ground with them, now and then
    const loot = this.owner.foes?.ctx?.loot;
    if (loot && this.constructor === Zombie && Math.random() < 0.18) loot.drop([this.pos.x, this.pos.y + 0.1, this.pos.z], { tier: this.zone === 'dungeon' ? 2 : 1, under: this.zone === 'dungeon' });
    this.play(this.mode === 'crawl' || this.cur === 'collapse' ? 'crawl_death' : 'death', 0.15);
    const g = this.owner.gore;
    g.splat(this.pos.x, this.owner.floorY(this.pos.x, this.pos.z, this.pos.y), this.pos.z, 2.0, 0.18);
    this.owner.sound('die', this.pos);
  }

  // -------------------------------------------------------------- the brain
  /** What it can see and hear of you (a few times a second). */
  sense(player, active) {
    const owner = this.owner;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = this.dist = Math.hypot(dx, dz);
    this.canSee = false;
    if (!active) return;
    const same = Math.abs(player.pos.y - this.pos.y) < (this.dg?.sameY ?? 2.6);
    const eyes = this.has('head');
    if (eyes && same && d < this.kind.sight * (this.zone === 'dungeon' ? 0.8 : 1)) {
      const facing = (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / Math.max(d, 1e-3);
      if (d < 2.5 || facing > 0.2) {
        const ey = this.pos.y + (this.mode === 'crawl' ? 0.4 : 1.5);
        const dir = _t.set(dx, player.pos.y + 1.5 - ey, dz);
        const len = dir.length();
        dir.divideScalar(len);
        const hit = owner.physics.ray([this.pos.x, ey, this.pos.z], [dir.x, dir.y, dir.z], len);
        this.canSee = !hit || hit.t > len - 0.4;
      }
    }
    // you running carries far, walking less, standing still hardly at all; blind, it listens harder
    const loud = player.speed > 7 ? 15 : player.speed > 1 ? 7.5 : 2.2;
    const heard = same && d < loud * this.kind.hear * (eyes ? 1 : 1.6);
    // (it gave up at an edge it can't cross and is going back: unless you are right there beside it)
    if (this.balkT > owner.time) { if (this.canSee && d < 5 && Math.abs(player.pos.y - this.pos.y) < 1) this.balkT = 0; else return; }
    if (this.canSee) {
      if (!this.aggro) {
        this.aggro = true; owner.sound('groan', this.pos, true); owner.alert(this, player.pos, 18);
        if (this.actions.roar && this.state === 'move' && this.dist > 3) {   // it has you: it roars first
          this.holdT = 0; this.play('roar', 0.2); this.holdT = this.actions.roar.getClip().duration; this.stagger = this.holdT;
        }
      }
      this.hunt(player.pos, true);
    } else if (heard) {
      this.hunt(player.pos, this.aggro);
    } else if (this.goal === 'chase') {
      // lost sight: down below it can still follow the corridors to you; up top it goes to where
      // it last had you
      const near = this.zone === 'dungeon' && owner.flowAt(this.pos, this.dg) < 32;
      if (!near && owner.time - this.lastT > 1.2) this.goal = 'hunt';
    }
  }

  update(dt, player, active, far, mid) {
    const owner = this.owner, phys = owner.physics;
    if (this.gone) return;
    if (this.state === 'buried') {
      // lurking under a grave: it comes up when you walk over it
      const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      if (active && d < 5.5 && Math.abs(player.pos.y - this.pos.y) < 2) this.wake(player.pos);
      return;
    }
    if (far && (this.dead || (!this.aggro && this.goal === 'wander'))) {   // out of the way: it waits
      if (this.dead) this.corpse(dt);
      return;
    }
    // animation (every third frame when far off, every sixth when unseen but still hunting you)
    this.mixAcc += dt;
    if (!mid || ++this.frame % (far ? 6 : 3) === 0) { this.mixer.update(this.mixAcc); this.mixAcc = 0; }
    // the stumps spurt in pulses that fade, then drip
    for (const s of this.stumps) {
      s.t += dt;
      const k = Math.max(0.04, 1 - s.t / s.life), beat = Math.pow(Math.max(0, Math.sin(s.t * 8.5)), 3);
      const n = Math.random() < dt * 60 * k * (0.2 + beat) ? Math.ceil(k * 3 * beat + 0.5) : 0;
      if (n) {
        const p = s.bone.localToWorld(_w.copy(s.at));
        const d = _u.copy(s.dir).transformDirection(s.bone.matrixWorld);
        owner.gore.spray(p, d, n, { speed: 0.6 + 3.2 * k * beat, spread: 0.35, size: 0.014 });
      }
    }
    if (this.dead) {
      if (this.cur === 'death' && this.done()) this.play('dead', 0.3);
      if (this.cur === 'crawl_death' && this.done()) this.play('crawl_dead', 0.3);
      this.corpse(dt);
      this.ground(dt);
      this.sync();
      return;
    }
    this.think -= dt;
    if (this.think <= 0) { this.think = mid ? 0.6 : 0.22 + Math.random() * 0.06; this.sense(player, active); }
    if (this.aggro) {
      this.groanT -= dt;
      if (this.groanT < 0) { this.groanT = 3 + Math.random() * 5; owner.sound('groan', this.pos); }
    }
    const crawl = this.mode === 'crawl';
    const toX = player.pos.x - this.pos.x, toZ = player.pos.z - this.pos.z;
    const dist = Math.hypot(toX, toZ);
    const facingErr = Math.abs(wrap(Math.atan2(toX, toZ) - this.yaw));

    if (this.state === 'rise') {
      this.riseT += dt;
      if (this.riseT < 1.6 && Math.random() < dt * 14) owner.dirt(this.pos, 0.25);
      if (this.done()) {
        this.state = 'move';
        if (active && dist < 28) this.hunt(player.pos, true);
      }
    } else if (this.state === 'getup') {
      if (this.done()) this.state = 'move';
    } else if (this.state === 'playdead') {
      if (active && dist < 4.2 && Math.abs(player.pos.y - this.pos.y) < 2) this.wake(player.pos);
    } else if (this.state === 'collapse') {
      if (this.done()) { this.mode = 'crawl'; this.state = 'move'; }
    } else if (this.state === 'attack') {
      const a = this.actions[this.cur];
      if (this.lungeT > 0) {   // the pounce carries it at you
        this.lungeT -= dt;
        const f = this.forward();
        phys.slide(this.pos, f.x * 4.2 * dt, f.z * 4.2 * dt, 0.3, 1.6, 0.45);
      }
      if (!this.fired && a.time * FPS >= HIT_AT[this.cur]) {
        this.fired = true;
        const reach = crawl ? 2.0 : 1.9;
        if (active && dist < reach && facingErr < 1.2 && Math.abs(player.pos.y - this.pos.y) < 1.2) owner.onPlayerHit?.(ATTACK_DMG[this.cur], this);
      }
      if (this.done()) { this.state = 'move'; this.cool = 0.35 + Math.random() * 0.4; }
    } else if (this.state === 'jump') {
      const f = this.forward();
      this.pos.addScaledVector(f, (this.leapV ?? 2.3) * dt);
      // (a hop ends with its clip; a leap when it comes down)
      this.leapT = (this.leapT || 0) + dt;
      const over = this.leapV ? (this.leapT > 0.15 && this.air === 0) || this.leapT > 1.6 : this.done();
      if (over) { this.state = 'move'; this.leapV = null; phys.slide(this.pos, 0, 0, 0.3, 1.6, 0.45); }
    } else {
      this.steer(dt, player, active, dist, facingErr);
    }
    this.ground(dt);
    // the player can't walk through it
    if (this.state !== 'playdead' && this.state !== 'rise') {
      const c = crawl ? this.forward(_u).multiplyScalar(0.5).add(this.pos) : this.pos;
      const dx = player.pos.x - c.x, dz = player.pos.z - c.z, d = Math.hypot(dx, dz), min = (crawl ? 0.45 : 0.35) + 0.32;
      if (d < min && d > 1e-4 && Math.abs(player.pos.y - this.pos.y) < 1.5) { player.pos.x = c.x + dx / d * min; player.pos.z = c.z + dz / d * min; }
    }
    this.sync();
  }

  /** Where to go and how: the 'move' state. */
  steer(dt, player, active, dist, facingErr) {
    const owner = this.owner, phys = owner.physics, kind = this.kind;
    const crawl = this.mode === 'crawl';
    this.cool = Math.max(0, this.cool - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    if (this.rush > 0) this.rush -= dt;
    this.holdT = Math.max(0, (this.holdT || 0) - dt);
    this.lungeCool -= dt;
    let target = null, speed = 0, routed = false;
    if (this.goal === 'chase' && active) {
      target = _v.copy(player.pos);
      if (!this.has('head')) {        // blind: it lurches after the sound of you, off line
        this.jitter += dt;
        target.x += Math.sin(this.jitter * 0.9) * Math.min(3, dist * 0.35);
        target.z += Math.cos(this.jitter * 0.7) * Math.min(3, dist * 0.35);
      } else if (this.flank && !this.narrow && dist > 2.4 && dist < 10 && owner.chasers > 2) {
        // with company it comes at you from the side, so they close round you (not on a bridge's
        // deck or a ledge, where the side is a drop)
        const s = this.flank * Math.min(2.6, dist * 0.45) / dist;
        target.x += -toZOf(player, this) * s; target.z += toXOf(player, this) * s;
      }
      if (this.zone === 'dungeon' && (!this.canSee || Math.abs(player.pos.y - this.pos.y) > 0.8) && owner.flowDir(this.pos, _w, this.dg)) { target.copy(this.pos).addScaledVector(_w, 2); routed = true; }
      if (crawl) speed = CRAWL.chase[0] + CRAWL.chase[1] * (this.arm('L') + this.arm('R'));
      else if (!this.feet) speed = 0.65;
      else speed = kind.run && (dist < 13 || this.rush > 0) && dist > 1.7 && this.has('head') ? kind.run : kind.walk * (this.rush > 0 ? 1.7 : 1.05);   // (rush: sent at you from far off, the slow ones hurrying too)
    } else if (this.goal === 'hunt' && this.hasLast) {
      target = _v.copy(this.lastSeen);
      // (the corridors' flow leads to you: not for one going back from an edge it gave up at)
      if (this.zone === 'dungeon' && !(this.balkT > owner.time) && owner.flowDir(this.pos, _w, this.dg)) { target.copy(this.pos).addScaledVector(_w, 2); routed = true; }
      speed = crawl ? CRAWL.hunt : kind.walk;
      if (Math.hypot(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z) < 1.3) { this.goal = 'search'; this.searchT = 7 + Math.random() * 5; this.wander = null; this.wanderT = 0; }
    } else if (this.goal === 'search') {
      this.searchT -= dt; this.wanderT -= dt;
      if (this.wanderT < 0 || !this.wander) {
        this.wanderT = 2.5 + Math.random() * 2;
        this.wander = this.lastSeen.clone().add(_u.set((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
      }
      if (this.wander.distanceTo(this.pos) > 0.6) { target = _v.copy(this.wander); speed = crawl ? CRAWL.hunt : kind.walk * 0.9; }
      if (this.searchT < 0) { this.aggro = false; this.goal = 'wander'; }
    } else {
      this.wanderT -= dt;
      if (this.wanderT < 0) {
        this.wanderT = 5 + Math.random() * 7;
        this.wander = null;
        if (Math.random() < 0.65) for (let t = 0; t < 6; t++) {
          const r = this.room;
          const w = r ? new THREE.Vector3(r.x0 + 1 + Math.random() * (r.x1 - r.x0 - 2), this.pos.y, r.z0 + 1 + Math.random() * (r.z1 - r.z0 - 2))
            : this.home.clone().add(_u.set((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12));
          const nav = this.dg?.nav, walk = this.dg?.walk;
          if (nav && walk) {
            const c = Math.floor(w.z - nav.z0) * nav.nx + Math.floor(w.x - nav.x0);
            if (c < 0 || c >= walk.length || !walk[c] || (nav.h && Math.abs(nav.h[c] - this.pos.y) > 0.6)) continue;
          }
          this.wander = w;
          break;
        }
      }
      if (this.wander && this.wander.distanceTo(this.pos) > 0.6) { target = _v.copy(this.wander); speed = crawl ? CRAWL.wander : kind.walk * 0.85; }
    }
    if (!crawl && this.has('head') === false) speed = Math.min(speed, kind.walk * 1.1);
    speed *= this.pace * this.slow;
    if (this.stagger > 0) speed = 0;
    if (target) {
      if (this.avoidT > 0) this.avoidT -= dt;
      const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z) + (this.avoidT > 0 ? this.avoid : 0);
      const turn = (crawl ? CRAWL.turn : kind.turn) * dt;
      this.yaw += Math.max(-turn, Math.min(turn, wrap(want - this.yaw)));
    }
    // attacks: in reach and facing you; runners and lurkers pounce from a little further off
    const chasing = this.goal === 'chase' && active;
    const reach = crawl ? 1.55 : 1.35;
    const moves = crawl ? (this.arm('R') || this.has('head') ? ['crawl_attack'] : [])
      : [this.arm('R') && 'attack1', this.arm('L') && 'attack2', (this.arm('L') || this.arm('R') || this.has('head')) && 'attack3'].filter(Boolean);
    if (chasing && dist < reach && facingErr < 0.6 && !this.cool && moves.length && Math.abs(player.pos.y - this.pos.y) < 1.2) {
      this.state = 'attack';
      this.play(moves[Math.floor(Math.random() * moves.length)], 0.12);
      return;
    }
    if (chasing && !crawl && kind.run && this.feet && this.lungeCool < 0 && dist > 1.9 && dist < 3.4 && facingErr < 0.3 && moves.includes('attack3')) {
      this.state = 'attack'; this.lungeT = 0.42; this.lungeCool = 4 + Math.random() * 4;
      this.play('attack3', 0.08);
      owner.sound('groan', this.pos, true);
      return;
    }
    if (speed > 0 && !(chasing && dist < reach * 0.8)) {
      const f = this.forward(_f);
      // feel ahead: jump what it can get over, else turn to the clearer side
      this.feelT -= dt;
      if (this.feelT <= 0) {
        this.feelT = 0.2;
        const y0 = this.pos.y + (crawl ? 0.25 : 0.45);
        const low = phys.ray([this.pos.x, y0, this.pos.z], [f.x, 0, f.z], crawl ? 0.8 : 1.0);
        if (low && low.box) {
          const high = phys.ray([this.pos.x, this.pos.y + 1.65, this.pos.z], [f.x, 0, f.z], 1.6);
          if (this.goal === 'chase' && !crawl && this.feet && this.air === 0 && !high && low.box.max[1] - this.pos.y < 1.6) {
            this.state = 'jump';
            this.play('jump', 0.1);
            return;
          }
          if (!routed) {   // (the corridors' own route already goes round the walls)
            const side = (a) => { const c = Math.cos(this.yaw + a), s = Math.sin(this.yaw + a); return phys.ray([this.pos.x, y0, this.pos.z], [s, 0, c], 1.4); };
            const l = side(0.8), r = side(-0.8);
            this.avoid = !l ? 0.9 : !r ? -0.9 : (l.t > r.t ? 0.9 : -0.9);
            this.avoidT = 0.7;
          }
        }
        // stuck on something for a second: sidestep
        this.stuckT = (this.stuckT || 0) + 0.2;
        if (this.stuckT >= 1) {
          if (this.stuckAt && this.stuckAt.distanceTo(this.pos) < 0.15 * speed && !this.edgeAhead) { this.avoid = Math.random() < 0.5 ? 1.3 : -1.3; this.avoidT = 0.9; }   // (not when it stopped at an edge on purpose)
          (this.stuckAt || (this.stuckAt = new THREE.Vector3())).copy(this.pos);
          this.stuckT = 0;
        }
      }
      const along = Math.max(0.25, Math.cos(Math.min(Math.PI / 2, Math.abs(wrap((target ? Math.atan2(target.x - this.pos.x, target.z - this.pos.z) : this.yaw) - this.yaw)))));
      let sp = speed * along;
      // the edge of a drop ahead (more than a jump down): it stops there, and bellows across it
      // (felt for with the rest, five times a second)
      if (this.feelT === 0.2) {
        const y = this.pos.y;
        this.edgeAhead = phys.floorAt(this.pos.x + f.x * 0.75, this.pos.z + f.z * 0.75, y + 0.3, 0.2, 0.75) < y - 1.5;
        // (narrow footing: a drop a metre to either side)
        this.narrow = phys.floorAt(this.pos.x + f.z, this.pos.z - f.x, y + 0.3, 0.2, 0.75) < y - 1.5 || phys.floorAt(this.pos.x - f.z, this.pos.z + f.x, y + 0.3, 0.2, 0.75) < y - 1.5;
      }
      // one sent at you (rush) doesn't stop at an edge with footing beyond it: it leaps for it (and one
      // in three falls short). With nothing to land on, it stops like the rest.
      if (this.edgeAhead && this.rush > 0 && this.goal === 'chase' && !crawl && this.feet && this.air === 0 && dist > 2.2 && !this.pushV) {
        let land = 0;
        for (const dd of [2.6, 3.2, 3.8]) if (phys.floorAt(this.pos.x + f.x * dd, this.pos.z + f.z * dd, this.pos.y + 0.5, 0.2, 1.0) > this.pos.y - 1) { land = dd; break; }
        if (land) {
          this.state = 'jump'; this.play('jump', 0.1); owner.sound('groan', this.pos, true);
          this.vy = 5.5; this.pos.y += 0.05; this.leapT = 0;
          this.leapV = (land + 0.4) / 0.5 * (Math.random() < 0.34 ? 0.7 : 1);     // (half a second in the air)
          return;
        }
      }
      // held at an edge for long, it gives up, goes back, and won't come straight back to it
      if (this.edgeAhead && this.goal === 'chase') { this.edgeT2 = (this.edgeT2 || 0) + dt; if (this.edgeT2 > 3.5) { this.edgeT2 = 0; this.goal = 'hunt'; this.aggro = false; this.lastSeen.copy(this.home); this.hasLast = true; this.balkT = owner.time + 15; } } else this.edgeT2 = Math.max(0, (this.edgeT2 || 0) - dt);   // (a glance aside doesn't start it over)
      if (!this.pushV && this.edgeAhead) {
        sp = 0;
        if ((this.edgeT = (this.edgeT || 0) - dt) < 0) { this.edgeT = 3 + Math.random() * 3; owner.sound('groan', this.pos, true); }
      }
      phys.slide(this.pos, f.x * sp * dt, f.z * sp * dt, crawl ? 0.35 : 0.3, crawl ? 0.6 : 1.6, 0.45);
      if (crawl) this.play('crawl', 0.3, Math.max(0.45, speed / 0.55));
      else if (speed > 2) this.play('run', 0.25, speed / 3.0);
      else this.play('walk', 0.3, Math.max(0.5, speed / 0.85));
    } else {
      this.play(crawl ? 'crawl' : 'idle', 0.35, crawl ? 0.15 : 1);
    }
  }

  /** Stand on whatever is below; fall when there's nothing. (And slide on with a shove.) */
  ground(dt) {
    const phys = this.owner.physics;
    if (this.mode === 'crawl' || this.dead) this.knock = null;   // (one on the ground lies where it is)
    if (this.knock && this.knock.lengthSq() > 1e-4) {
      phys.slide(this.pos, this.knock.x * dt, this.knock.z * dt, 0.3, 1.6, 0.45);
      this.knock.multiplyScalar(Math.exp(-9 * dt));
    }
    const fl = phys.floorAt(this.pos.x, this.pos.z, this.pos.y, 0.3, 0.45);
    if (fl === -Infinity) return;
    if (this.pos.y > fl + 0.02) {
      if (!this.air) this.fallFrom = this.pos.y;
      this.vy -= 22 * dt;
      this.pos.y = Math.max(fl, this.pos.y + this.vy * dt);
      this.air += dt;
      if (this.air > 0.25 && !this.dead && this.mode === 'stand' && this.state === 'move') this.play('fall', 0.15);
    } else {
      // a long fall (off the bridge, into the gulf) bursts it on the rock
      if (this.air && (this.fallFrom ?? fl) - fl > 7 && !this.dead) {
        const g = this.owner.gore;
        g.spray(_t.copy(this.pos).add(_u.set(0, 0.3, 0)), _w.set(0, 1, 0), 220, { speed: 5, spread: 1.2, size: 0.02 });
        for (let i = 0; i < 16; i++) g.gib(this.pos, _w.set((Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5));
        g.splat(this.pos.x, fl, this.pos.z, 1.8, 0.2);
        this.owner.sound('sever', this.pos);
        this.hp = 0; this.die();
      }
      this.pos.y = fl;
      this.vy = 0;
      this.air = 0;
    }
  }

  /** A body lies a while, then the earth takes it. */
  corpse(dt) {
    this.deadT += dt;
    if (!this.sinking && this.deadT > 120) this.sinking = true;
    if (this.sinking) {
      this.sinkT = (this.sinkT || 0) + dt;
      this.root.position.y = this.pos.y - this.sinkT * 0.12;
      if (this.sinkT > 6) this.remove();
    }
  }

  remove() {
    this.gone = true;
    this.owner.scene.remove(this.root);
    for (const k of this.shared) this.mesh.geometry.deleteAttribute(k); // the other bodies still draw with them
    this.mesh.geometry.dispose();
    for (const m of [this.mesh.material].flat()) m.dispose();
    this.mixer.stopAllAction();
  }
}

const toXOf = (player, z) => (player.pos.x - z.pos.x) / Math.max(1e-3, Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z));
const toZOf = (player, z) => (player.pos.z - z.pos.z) / Math.max(1e-3, Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z));

/** Distance along a ray (o, unit d) to a capsule (segment a-b, radius r), or null. */
function rayCapsule(o, d, a, b, r) {
  const ab = _u.subVectors(b, a), ao = _w.subVectors(o, a);
  const abab = ab.dot(ab), abd = ab.dot(d), abao = ab.dot(ao), dao = d.dot(ao);
  const den = abab - abd * abd;
  let t = den > 1e-8 ? (abd * abao - abab * dao) / den : 0;
  t = Math.max(0, t);
  const s = Math.max(0, Math.min(1, abab > 0 ? (abao + t * abd) / abab : 0));
  // closest points: on the ray at t, on the segment at s; refine t for that s
  const q = a.clone().addScaledVector(ab, s);
  const tq = Math.max(0, q.clone().sub(o).dot(d));
  const dist = o.clone().addScaledVector(d, tq).distanceTo(q);
  if (dist > r) return null;
  return Math.max(0, tq - Math.sqrt(r * r - dist * dist));
}

export function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

function closestOnSeg(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / Math.max(1e-8, ab.dot(ab))));
  return a.clone().addScaledVector(ab, t);
}

function pickKind(lurk = 0.15) {
  const r = Math.random();
  return r < lurk ? 'lurker' : r < lurk + 0.32 ? 'runner' : 'shambler';
}

// ------------------------------------------------------------------ the horde
export class Zombies {
  constructor(scene, physics, lib = null, sfx = null) {
    this.scene = scene; this.physics = physics; this.lib = lib; this.sfx = sfx;
    this.list = [];
    this.pieces = [];
    this.gltf = {};
    this.nextId = 0;
    this.time = 0;
    this.chasers = 0;
    this.player = null;
    this.gore = new Gore(scene, physics, (x, z, y) => this.floorY(x, z, y));
    this.stubGeo = new THREE.CylinderGeometry(0.014, 0.02, 0.06, 5);
    this.stubMat = new THREE.MeshPhongMaterial({ color: 0xd8ccae, specular: 0x302820, shininess: 20 });
    this.onPlayerHit = null;
    this.yard = null;         // {x0, z0, x1, z1, target, graves, spawnT}
    this.dg = null;           // the dungeon: {nav, y, ...}
    this.flow = null; this.flowKey = -1; this.flowT = 0;
  }

  async load(variants = [], monsters = [], grotesques = GROTESQUES) {
    const loader = new GLTFLoader();
    const monster = async (m) => { this.gltf[m] = adaptMonster(await loader.loadAsync(`${MONSTER_ROOT}${m}.glb`)); };
    const grotesque = async (g) => {   // one that won't load is left out of the horde, not fatal
      try { this.gltf[g] = await loader.loadAsync(`${GROTESQUE_ROOT}${g}.glb`); } catch (e) { console.warn('grotesque', g, e); }
    };
    const one = async () => {   // a phone: one decoding at a time
      for (const m of monsters) await monster(m);
      for (const g of grotesques) await grotesque(g);
    };
    await Promise.all([
      ...variants.map(async (v) => { this.gltf[v] = await loader.loadAsync(`${ROOT}zombie_${v}.glb`); }),
      ...(TOUCH ? [one()] : [...monsters.map(monster), ...grotesques.map(grotesque)]),
    ]);
    this.pool = [...variants, ...monsters, ...grotesques.filter((g) => this.gltf[g])];
  }

  /** The surface something at (x, y, z) would land on (works underground too). */
  floorY(x, z, y) {
    const f = this.physics.floorAt(x, z, y, 0.02, 0.05);
    return f === -Infinity ? y - 30 : f;
  }

  spawn(variant, x, z, opts = {}) {
    const y = opts.y ?? this.physics.groundAt(x, z);
    const v = variant || this.randomVariant();
    const zb = new Zombie(this.gltf[v], v, this, { ...opts, x, y, z });
    this.physics.slide(zb.pos, 0, 0, 0.3, 1.6, 0.45);
    zb.home.copy(zb.pos);
    zb.sync();
    this.list.push(zb);
    return zb;
  }

  /** One of the dead for a place (a HAUNTS key), from those that loaded; any of them without one. */
  randomVariant(haunt) {
    const p = this.pool || VARIANTS;
    const h = (HAUNTS[haunt] || []).filter((v) => p.includes(v));
    const from = h.length ? h : p;
    return from[Math.floor(Math.random() * from.length)];
  }

  /** The graveyard: `n` of the dead about the graves, `buried` more under them, and the horde
   * kept at `n` by more clawing out of the ground. `avoid` [x0, z0, x1, z1] keeps them out of
   * the mausoleum. */
  populateYard(b, n, buried, avoid) {
    const graves = [];
    for (const box of this.physics.boxes) {
      if (box.tag !== 'prop') continue;
      const cx = (box.min[0] + box.max[0]) / 2, cz = (box.min[2] + box.max[2]) / 2, h = box.max[1] - box.min[1];
      const w = Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2]);
      if (cx < b.x0 + 2 || cx > b.x1 - 2 || cz < b.z0 + 2 || cz > b.z1 - 2 || h < 0.4 || h > 1.6 || w > 2.4) continue;
      graves.push([cx, cz, box]);
    }
    this.yard = { ...b, target: n, graves, spawnT: 3, avoid };
    const spot = () => {
      for (let i = 0; i < 30; i++) {
        const x = b.x0 + 3 + Math.random() * (b.x1 - b.x0 - 6), z = b.z0 + 3 + Math.random() * (b.z1 - b.z0 - 6);
        if (avoid && x > avoid[0] && x < avoid[2] && z > avoid[1] && z < avoid[3]) continue;
        return [x, z];
      }
      return [(b.x0 + b.x1) / 2, b.z1 - 4];
    };
    for (let i = 0; i < n; i++) { const [x, z] = spot(); this.spawn(this.randomVariant('yard'), x, z, { zone: 'yard', kind: pickKind(0.08) }); }
    for (let i = 0; i < buried; i++) { const [x, z] = this.graveSpot(null) || spot(); this.spawn(this.randomVariant('yard'), x, z, { zone: 'yard', kind: 'lurker', start: 'buried' }); }
  }

  /** Beside a grave, between `near` and `far` metres from p (any grave if p is null). */
  graveSpot(p, near = 7, far = 40) {
    const g = this.yard?.graves;
    if (!g?.length) return null;
    for (let i = 0; i < 40; i++) {
      const [cx, cz, box] = g[Math.floor(Math.random() * g.length)];
      // in front of or behind the stone, whichever side is clear
      const along = box.max[0] - box.min[0] > box.max[2] - box.min[2] ? 'z' : 'x';
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = along === 'x' ? cx + side * ((box.max[0] - box.min[0]) / 2 + 0.9) : cx;
      const z = along === 'z' ? cz + side * ((box.max[2] - box.min[2]) / 2 + 0.9) : cz;
      if (!p) return [x, z];
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > near && d < far) return [x, z];
    }
    return null;
  }

  /** An underground place the dead can find their way about in (a dungeon level or a cave): which
   * cells of its grid can be walked (carved, and not filled by furniture between knee and head
   * height). dg: {nav, y or floorAt(x, z), contains(p)}. */
  addUnder(dg) {
    if (dg.walk) return dg;
    const nav = dg.nav, floorY = (x, z) => dg.floorAt?.(x, z) ?? dg.y;
    dg.walk = new Uint8Array(nav.nx * nav.nz);
    for (let k = 0; k < nav.nz; k++) for (let i = 0; i < nav.nx; i++) {
      const c = k * nav.nx + i;
      if (nav.cell[c] < 0) continue;
      const x = nav.x0 + i + 0.5, z = nav.z0 + k + 0.5, fy = floorY(x, z);
      let open = true;
      for (const b of this.physics.near(x, z, x, z)) {
        if (b.tag !== 'prop' || b.max[1] < fy + 0.45 || b.min[1] > fy + 1.6) continue;   // (walls are in the grid)
        if (b.seg) {   // (a prop set at an angle: by its distance from the line, not its bounds)
          const t = Math.max(0, Math.min(b.len, (x - b.ax) * b.ux + (z - b.az) * b.uz));
          if (Math.hypot(x - b.ax - b.ux * t, z - b.az - b.uz * t) < b.half) { open = false; break; }
          continue;
        }
        if (x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2]) { open = false; break; }
      }
      dg.walk[c] = open ? 1 : 0;
    }
    (this.unders ||= []).push(dg);
    return dg;
  }

  /** A dungeon level: `n` of the dead from its haunt spread through its rooms; some lie as if
   * dead; two sprawled at the foot of its stairs, waiting. */
  populateDungeon(dg, n, haunt = 'undercroft') {
    this.addUnder(dg);
    const nav = dg.nav, walk = dg.walk;
    const rooms = dg.roomList;
    // a spot on the room's own floor: walkable, not in a pit, not up on a dais or in furniture
    const spot = (r, pad) => {
      for (let t = 0; t < 24; t++) {
        const x = r.x0 + pad + Math.random() * (r.x1 - r.x0 - 2 * pad), z = r.z0 + pad + Math.random() * (r.z1 - r.z0 - 2 * pad);
        const c = Math.floor(z - nav.z0) * nav.nx + Math.floor(x - nav.x0);
        if (walk[c] && Math.abs(this.physics.floorAt(x, z, dg.y + 0.3, 0.3, 0.45) - dg.y) < 0.1) return [x, z];
      }
      return null;
    };
    for (let i = 0; i < n; i++) {
      const r = rooms[1 + (i % (rooms.length - 1))], p = spot(r, 1.2);
      if (!p) continue;
      const kind = pickKind(0.3);
      this.spawn(this.randomVariant(haunt), p[0], p[1], { y: dg.y, zone: 'dungeon', dg, room: r, kind, start: kind === 'lurker' ? 'playdead' : 'stand' });
    }
    const e = rooms[0];
    for (let i = 0; i < 2; i++) {
      const p = spot(e, 2);
      if (p) this.spawn(this.randomVariant(haunt), p[0], p[1], { y: dg.y, zone: 'dungeon', dg, room: e, kind: 'lurker', start: 'playdead' });
    }
  }

  /** A cave: plan [[chamber tag, how many, haunt], ...]; they keep to their chamber till they
   * find you, and follow its passages after you. */
  populateCave(cv, plan) {
    this.addUnder(cv);
    let n = 0;
    for (const [tag, count, haunt] of plan) for (let i = 0; i < count; i++) {
      const p = cv.spot(tag, 1.0);
      if (!p) continue;
      const kind = pickKind(0.25);
      const zb = this.spawn(this.randomVariant(haunt), p.x, p.z, { y: p.y, zone: 'dungeon', dg: cv, kind, start: kind === 'lurker' ? 'playdead' : 'stand' });
      zb.yaw = Math.random() * 6.28;
      n++;
    }
    return n;
  }

  /** Out in the world: the dead about a place, [{x, z, r, n, haunt}], wandering near it (they
   * don't come back when cut down: only the graveyard keeps its dead). */
  populateWild(places) {
    let n = 0;
    for (const pl of places) for (let i = 0; i < pl.n; i++) {
      const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * pl.r;
      const x = pl.x + Math.cos(a) * d, z = pl.z + Math.sin(a) * d;
      if (pl.ok && !pl.ok(x, z)) continue;
      const zb = this.spawn(this.randomVariant(pl.haunt), x, z, { zone: 'wild', kind: pickKind(pl.lurk ?? 0.15), start: pl.start || 'stand' });
      zb.yaw = Math.random() * 6.28;
      n++;
    }
    return n;
  }

  /** A zombie that has found you calls the others within `r` metres. */
  alert(from, p, r = 14) {
    if (!p) return;
    for (const z of this.list) {
      if (z === from || z.dead || z.gone || z.state === 'buried' || z.balkT > this.time) continue;
      if (z.pos.distanceTo(from.pos) > r || Math.abs(z.pos.y - from.pos.y) > (z.dg?.sameY ?? 2.5)) continue;
      if (z.state === 'playdead') { if (z.pos.distanceTo(from.pos) < r * 0.5) z.wake(p); continue; }
      z.hunt(p, true);
    }
  }

  /** A noise at p (a clash of steel, a spell going off) carries `r` metres. */
  noise(p, r) {
    for (const z of this.list) {
      if (z.dead || z.gone || z.state === 'buried' || z.balkT > this.time) continue;
      const d = z.pos.distanceTo(p);
      if (d > r * (z.has('head') ? 1 : 1.4) || Math.abs(z.pos.y - p.y) > 3) continue;
      if (z.state === 'playdead') { if (d < r * 0.4) z.wake(p); continue; }
      z.hunt(p, z.aggro);
    }
  }

  /** You died: they lose you. */
  forget() {
    for (const z of this.list) { z.aggro = false; z.goal = 'wander'; z.hasLast = false; }
  }

  // -------------------------------------------------------------- the dungeon's flow field
  /** Steps along the corridors from you (a breadth-first flood over the carved grid, redone when
   * you move to another cell). */
  flowUpdate(player, dt) {
    this.flowT -= dt;
    const p = player.pos;
    // the place you are in (the dead of the others can't follow you there)
    const dg = (this.unders || []).find((u) => u.contains(p)) || null;
    if (dg !== this.dg) { this.dg = dg; this.flow = null; this.flowKey = -1; }
    if (!dg) return;
    const nav = dg.nav;
    const ci = Math.floor(p.x - nav.x0), ck = Math.floor(p.z - nav.z0);
    if (ci < 0 || ck < 0 || ci >= nav.nx || ck >= nav.nz) { this.flow = null; this.flowKey = -1; return; }
    const walk = dg.walk;
    let key = ck * nav.nx + ci;
    if (!walk[key]) {         // (on a ledge's lip, the top of a stair's wall: from the open cell nearest)
      let best = -1;
      for (let r = 1; r <= 2 && best < 0; r++) for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
        const a = ci + di, b = ck + dk;
        if (a >= 0 && b >= 0 && a < nav.nx && b < nav.nz && walk[b * nav.nx + a]) { best = b * nav.nx + a; break; }
      }
      if (best < 0) { this.flow = null; this.flowKey = -1; return; }
      key = best;
    }
    if (key === this.flowKey && this.flowT > 0) return;
    this.flowKey = key; this.flowT = 0.5;
    const N = nav.nx * nav.nz;
    const dist = this.flow && this.flow.length === N ? this.flow : new Int16Array(N);
    dist.fill(-1);
    const q = this.queue && this.queue.length === N ? this.queue : (this.queue = new Int32Array(N));
    let h = 0, t = 0;
    dist[key] = 0; q[t++] = key;
    while (h < t) {
      const c = q[h++], d = dist[c];
      if (d >= 260) continue;
      const i = c % nav.nx, k = (c - i) / nav.nx;
      for (let s = 0; s < 4; s++) {
        const ni = i + DI[s], nk = k + DK[s];
        if (ni < 0 || nk < 0 || ni >= nav.nx || nk >= nav.nz) continue;
        const n = nk * nav.nx + ni;
        if (dist[n] >= 0 || !walk[n]) continue;
        dist[n] = d + 1; q[t++] = n;
      }
    }
    this.flow = dist;
  }

  /** How many corridor steps from you p is (Infinity if not reachable, or not where you are). */
  flowAt(p, dg = this.dg) {
    if (!this.flow || dg !== this.dg) return Infinity;
    const nav = this.dg.nav, i = Math.floor(p.x - nav.x0), k = Math.floor(p.z - nav.z0);
    if (i < 0 || k < 0 || i >= nav.nx || k >= nav.nz) return Infinity;
    const d = this.flow[k * nav.nx + i];
    return d < 0 ? Infinity : d;
  }

  /** The way toward you along the corridors from p, into out; false if there is none. */
  flowDir(p, out, dg = this.dg) {
    if (!this.flow || dg !== this.dg) return false;
    const nav = this.dg.nav, i = Math.floor(p.x - nav.x0), k = Math.floor(p.z - nav.z0);
    const at = (a, b) => (a < 0 || b < 0 || a >= nav.nx || b >= nav.nz ? -1 : this.flow[b * nav.nx + a]);
    const here = at(i, k);
    let best = here < 0 ? Infinity : here, bi = i, bk = k;   // (in among the furniture: out to the nearest open cell)
    for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) {
      if (!di && !dk) continue;
      if (di && dk && here >= 0 && (at(i + di, k) < 0 || at(i, k + dk) < 0)) continue;   // no cutting corners
      const d = at(i + di, k + dk);
      if (d >= 0 && d < best) { best = d; bi = i + di; bk = k + dk; }
    }
    if (bi === i && bk === k) return false;
    out.set(nav.x0 + bi + 0.5 - p.x, 0, nav.z0 + bk + 0.5 - p.z).normalize();
    return true;
  }

  /** The nearest zombie a ray hits within `far`: {t, bone, point, z} or null. */
  ray(o, d, far) {
    let best = null;
    for (const z of this.list) {
      const h = z.ray(o, d, far);
      if (h && (!best || h.t < best.t)) best = h;
    }
    return best;
  }

  /** A blast at `at`: every zombie near takes damage at its nearest bone. */
  blast(at, radius, dmg, kind = 'fire') {
    const hit = [];
    for (const z of this.list) {
      if (z.gone || z.pos.distanceTo(at) > radius + 1.5) continue;
      const best = this.nearest(z, at);
      if (!best || best.d >= radius) continue;
      const k = 1 - Math.max(0, best.d) / radius;
      const dir = best.point.clone().sub(at).normalize();
      z.hit({ ...best, t: 0, z }, { dmg: dmg * k, dir, heavy: k > 0.6, kind });
      hit.push({ z, k, dir });
    }
    return hit;
  }

  /** The bone of z nearest a point: {d (past its skin), bone, point} or null. */
  nearest(z, at) {
    let best = null;
    for (const c of z.capsules()) {
      const p = closestOnSeg(at, c.a, c.b);
      const d = p.distanceTo(at) - c.r;
      if (!best || d < best.d) best = { d, bone: c.bone, point: p };
    }
    return best;
  }

  /** A piece cut off z: its triangles `tris` (vertex numbers in threes), drawn in `groups`
   * ([start, count, material]) when z has several materials. */
  addPiece(z, tris, joint, dir, groups = null) {
    const src = z.mesh.geometry, uv = src.attributes.uv, bind = src.attributes.bindPos, shell = src.attributes.shell;
    const map = new Map(), pos = [], bp = [], uvs = [], sh = [], index = [];
    const v = new THREE.Vector3();
    z.mesh.updateMatrixWorld(true);
    for (const i of tris) {
      if (!map.has(i)) {
        map.set(i, pos.length / 3);
        z.mesh.getVertexPosition(i, v);
        v.applyMatrix4(z.mesh.matrixWorld);
        pos.push(v.x, v.y, v.z);
        bp.push(bind.getX(i), bind.getY(i), bind.getZ(i));
        uvs.push(uv.getX(i), uv.getY(i));
        if (shell) sh.push(shell.getX(i));
      }
      index.push(map.get(i));
    }
    const c = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) c.add(v.set(pos[i], pos[i + 1], pos[i + 2]));
    c.divideScalar(pos.length / 3);
    for (let i = 0; i < pos.length; i += 3) { pos[i] -= c.x; pos[i + 1] -= c.y; pos[i + 2] -= c.z; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('bindPos', new THREE.Float32BufferAttribute(bp, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (shell) g.setAttribute('shell', new THREE.Float32BufferAttribute(sh, 1));   // armour and cloth stay armour and cloth inside
    g.setIndex(index);
    for (const [s, n, k] of groups || []) g.addGroup(s, n, k);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    // the piece keeps a material of its own (sharing the body's wounds), so it outlives the body
    const own = (src) => {
      const mat = src.clone();
      mat.userData.u = z.u;
      mat.onBeforeCompile = src.onBeforeCompile;
      mat.customProgramCacheKey = src.customProgramCacheKey;
      return mat;
    };
    const m = new THREE.Mesh(g, Array.isArray(z.mesh.material) ? z.mesh.material.map(own) : own(z.mesh.material));
    m.position.copy(c);
    m.castShadow = true;
    this.scene.add(m);
    if (this.pieces.length > 50) { const o = this.pieces.shift(); this.scene.remove(o.m); o.m.geometry.dispose(); for (const x of [o.m.material].flat()) x.dispose(); }
    // its long axis (towards the farthest vertex) and how thick it is, to lie it down on the ground
    let far = 0;
    const long = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) { const d = v.set(pos[i], pos[i + 1], pos[i + 2]).length(); if (d > far) { far = d; long.copy(v).normalize(); } }
    this.pieces.push({ long, half: far, thick: tris.length > 600 ? 0.1 : 0.05, m,
      v: dir.clone().multiplyScalar(2 + Math.random() * 2).add(new THREE.Vector3(0, 2.2 + Math.random() * 1.5, 0)),
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), w: 5 + Math.random() * 7,
      cut: m.worldToLocal(joint.clone()), bleed: 0, rest: false, age: 0 });
  }

  /** Earth thrown up where one claws its way out. */
  dirt(p, amount) {
    const g = this.gore;
    const n = Math.round(40 * amount);
    for (let i = 0; i < n; i++) {
      const v = _t.set((Math.random() - 0.5) * 2.4, 1.5 + Math.random() * 3 * amount, (Math.random() - 0.5) * 2.4);
      g.drop(_u.set(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.05, p.z + (Math.random() - 0.5) * 0.6), v, 0.02 + Math.random() * 0.03, g.soil[Math.floor(Math.random() * g.soil.length)]);
    }
    if (amount >= 1) g.splat(p.x, p.y, p.z, 1.4, 0, g.soil[0]);
  }

  sound(kind, p, loud = false) {
    const s = this.sfx;
    if (!s?.ctx) return;
    const cam = this.listener;
    const d = cam ? cam.distanceTo(p) : 5;
    const k = Math.max(0, 1 - d / 40) * (loud ? 1.3 : 1);
    if (k <= 0) return;
    const t = s.ctx.currentTime;
    if (kind === 'squelch') {
      s._noise(t, 0.22, { type: 'lowpass', f0: 1400, f1: 160, gain: 0.55 * k, attack: 0.004 });
      s._tone(t, 0.18, { type: 'sine', f0: 140, f1: 45, gain: 0.25 * k });
      if (loud) s._noise(t + 0.03, 0.12, { type: 'highpass', f0: 2600, f1: 1200, gain: 0.15 * k });
    } else if (kind === 'sever') {
      s._noise(t, 0.06, { type: 'highpass', f0: 3200, f1: 1800, gain: 0.35 * k });          // the crack of bone
      s._noise(t + 0.02, 0.45, { type: 'lowpass', f0: 1100, f1: 90, gain: 0.7 * k, attack: 0.004 });
      s._tone(t, 0.3, { type: 'sine', f0: 110, f1: 35, gain: 0.3 * k });
    } else if (kind === 'groan') {
      if (this.groaning > t) return;                                                  // not a choir
      this.groaning = t + 0.35;
      const f = 70 + Math.random() * 40, dur = 0.9 + Math.random() * 1.0;
      s._tone(t, dur, { type: 'sawtooth', f0: f, f1: f * (0.7 + Math.random() * 0.2), gain: 0.07 * k, attack: 0.15 });
      s._tone(t, dur, { type: 'sawtooth', f0: f * 1.51, f1: f * 1.2, gain: 0.03 * k, attack: 0.2 });
      s._noise(t, dur, { type: 'bandpass', f0: 380, f1: 260, q: 3, gain: 0.12 * k, attack: 0.2 });
    } else if (kind === 'die') {
      s._tone(t, 1.6, { type: 'sawtooth', f0: 95, f1: 40, gain: 0.08 * k, attack: 0.05 });
      s._noise(t + 0.5, 0.3, { type: 'lowpass', f0: 600, f1: 100, gain: 0.5 * k });
    } else if (kind === 'dirt') {
      s._noise(t, 1.2, { type: 'lowpass', f0: 500, f1: 120, gain: 0.45 * k, attack: 0.02 });
      s._noise(t + 0.3, 0.8, { type: 'bandpass', f0: 900, f1: 300, q: 1.5, gain: 0.2 * k, attack: 0.05 });
    }
  }

  update(dt, player, active, camera, height, light = 1) {
    this.time += dt;
    this.player = player;
    this.listener = camera.position;
    this.flowUpdate(player, dt);
    let chasers = 0;
    const list = this.list;
    for (const z of list) {
      if (z.gone) continue;
      const d = Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z);
      const otherLevel = Math.abs(player.pos.y - z.pos.y) > 6;
      const far = d > 85 || (otherLevel && d > 12);
      if (z.state !== 'buried') z.root.visible = !far;
      z.mesh.castShadow = d < 28;
      const pace = z.afflict(dt);
      if (pace > 0) z.update(dt * pace, player, active, far, d > 32);
      else if (d < 0.75 && Math.abs(player.pos.y - z.pos.y) < 1.5) {   // a frozen one is still in the way
        const k = 0.75 / Math.max(d, 1e-3);
        player.pos.x = z.pos.x + (player.pos.x - z.pos.x) * k; player.pos.z = z.pos.z + (player.pos.z - z.pos.z) * k;
      }
      if (z.goal === 'chase' && !z.dead && d < 12) chasers++;
    }
    this.chasers = chasers;
    // they keep a little apart (and crawlers take more room)
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.standing || a.gone) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.standing || b.gone) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = (a.mode === 'crawl' ? 0.5 : 0.36) + (b.mode === 'crawl' ? 0.5 : 0.36);
        if (Math.abs(dx) > min || Math.abs(dz) > min || Math.abs(b.pos.y - a.pos.y) > 1.5) continue;
        const d = Math.hypot(dx, dz);
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) * 0.5 / d;
        a.pos.x -= dx * push; a.pos.z -= dz * push; b.pos.x += dx * push; b.pos.z += dz * push;
      }
    }
    // the graveyard keeps its dead: more claw their way out as you cut them down
    const y = this.yard;
    if (y) {
      let alive = 0, corpses = [];
      for (const z of list) {
        if (z.gone || z.zone !== 'yard') continue;
        if (z.dead) corpses.push(z); else alive++;
      }
      // too many bodies: the oldest sink first
      corpses = corpses.filter((z) => !z.sinking).sort((a, b) => b.deadT - a.deadT);
      for (let i = 0; i < corpses.length - 24; i++) corpses[i].sinking = true;
      y.spawnT -= dt;
      if (alive < y.target && y.spawnT <= 0) {
        y.spawnT = 2 + Math.random() * 4;
        const inYard = player.pos.x > y.x0 - 20 && player.pos.x < y.x1 + 20 && player.pos.z > y.z0 - 20 && player.pos.z < y.z1 + 20;
        const s = this.graveSpot(inYard ? player.pos : null);
        if (s) {
          const zb = this.spawn(this.randomVariant('yard'), s[0], s[1], { zone: 'yard', kind: pickKind(0.08), start: 'rise' });
          zb.yaw = Math.atan2(player.pos.x - zb.pos.x, player.pos.z - zb.pos.z);
        }
      }
    }
    if (list.some((z) => z.gone)) this.list = list.filter((z) => !z.gone);
    const g = this.gore;
    for (const p of this.pieces) {
      p.bleed += dt;
      if (p.bleed < 4 && Math.random() < dt * 40 * (1 - p.bleed / 4)) {
        g.spray(p.m.localToWorld(_w.copy(p.cut)), _u.set(0, 0.3, 0), 1, { speed: 0.8, spread: 1, size: 0.014 });
      }
      if (p.rest) continue;
      p.v.y -= 13 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotateOnWorldAxis(p.spin, p.w * dt);
      const ax = _u.copy(p.long).applyQuaternion(p.m.quaternion);
      const reach = Math.abs(ax.y) * p.half * 0.85 + p.thick;   // how far it hangs below its middle
      const gy = this.floorY(p.m.position.x, p.m.position.z, p.m.position.y);
      if (p.m.position.y - reach < gy) {
        p.m.position.y = gy + reach;
        if (p.v.y < -1.5) {
          p.v.y *= -0.3; p.v.x *= 0.55; p.v.z *= 0.55; p.w *= 0.5;
          g.splat(p.m.position.x, gy, p.m.position.z, 0.5);
        } else { // it topples and lies along the ground
          const flat = _w.set(ax.x, 0, ax.z);
          if (flat.lengthSq() < 1e-4) flat.set(1, 0, 0);
          p.m.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(ax, flat.normalize()));
          p.m.position.y = gy + p.thick;
          p.v.set(0, 0, 0); p.rest = true;
          g.splat(p.m.position.x, gy, p.m.position.z, 0.7, 0.08);
        }
      }
    }
    g.update(dt, camera, height, light);
  }
}
