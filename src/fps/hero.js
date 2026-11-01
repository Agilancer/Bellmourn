// Tessariel as he falls: the one time you see yourself. A man of the village (villager_m09's body,
// the Worker build: the slimmest of the outfits) stripped to black smallclothes and curled up in a
// ball, the way the Canticle says the Sacred Flame comes down.
//
// The remodel is done as he loads: every piece of his clothes is turned to bare skin (a skin tone
// read off his own body texture, with a little mottling so it isn't flat), his boots to bare feet,
// and a pair of black briefs drawn onto the hips in the bind pose (waistband, leg openings cut high
// at the sides). Then the bones are bent, each turned in the world so its child lies along a
// direction of the curl: back rounded, head tucked down to the knees, thighs drawn up to the chest,
// heels to the seat, arms wrapped round the shins.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { TOUCH } from './input.js';
import { WEBGPU, T, ref, shared } from './nodes.js';

const MODEL = 'templates/models/creatures/villagers/' + (TOUCH ? 'phone/' : '') + 'villager_m09.glb';

// the curl: [bone, child it points at, direction (model space: +y up, +z his front, +x his left)]
const CURL = [
  ['Abdomen', 'Torso', [0, 0.9, 0.44]], ['Torso', 'Chest', [0, 0.66, 0.75]], ['Chest', 'Neck', [0, 0.38, 0.92]],
  ['Neck', 'Head', [0, 0.12, 0.99]], ['Head', 'Head_end', [0, -0.42, 0.9]],
  ['UpperLegL', 'LowerLegL', [0.12, 0.6, 0.79]], ['LowerLegL', 'LowerLegL_end', [0.03, -0.72, -0.69]], ['FootL', 'FootL_end', [0.02, -0.5, -0.86]],
  ['UpperLegR', 'LowerLegR', [-0.12, 0.6, 0.79]], ['LowerLegR', 'LowerLegR_end', [-0.03, -0.72, -0.69]], ['FootR', 'FootR_end', [-0.02, -0.5, -0.86]],
  ['UpperArmL', 'LowerArmL', [0.24, -0.42, 0.87]], ['LowerArmL', 'WristL', [-0.86, -0.28, 0.42]],
  ['UpperArmR', 'LowerArmR', [-0.24, -0.42, 0.87]], ['LowerArmR', 'WristR', [0.86, -0.18, 0.47]],
];

/** The skin colour of a body texture: its average, from a small copy of it. */
function averageColour(tex) {
  const img = tex?.image;
  if (!img) return new THREE.Color(0.62, 0.45, 0.36);
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  try { g.drawImage(img, 0, 0, 16, 16); } catch { return new THREE.Color(0.62, 0.45, 0.36); }
  const d = g.getImageData(0, 0, 16, 16).data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  return new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

/** Bare skin with the briefs drawn on: in the bind pose, between the waistband and the leg
 * openings (high at the hips, low at the crotch), the skin is black cloth. */
function skinMaterial(skin, src) {
  const m = new (WEBGPU ? THREE.MeshStandardNodeMaterial : THREE.MeshStandardMaterial)({ color: skin, roughness: 0.62, metalness: 0 });
  if (src?.normalMap) { /* the clothes' normal maps are their weave: bare skin has none */ }
  if (WEBGPU) { m.name = 'tessariel_skin'; return skinNodes(m); }
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vBind;
      float hHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      // a little mottling, so the skin isn't paint
      diffuseColor.rgb *= 0.93 + 0.1 * hHash(floor(vBind * 90.0));
      // the briefs: waistband at 1.0 m, the leg openings rising from the crotch to the hips
      float ax = abs(vBind.x);
      float bottom = mix(0.835, 0.955, smoothstep(0.035, 0.19, ax));
      float brief = step(bottom, vBind.y) * step(vBind.y, 1.015);
      float band = step(0.975, vBind.y) * brief;
      vec3 cloth = vec3(0.018, 0.017, 0.02) * (0.85 + 0.3 * hHash(floor(vBind * 220.0)));
      diffuseColor.rgb = mix(diffuseColor.rgb, cloth + band * vec3(0.03), brief);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.85, step(mix(0.835, 0.955, smoothstep(0.035, 0.19, abs(vBind.x))), vBind.y) * step(vBind.y, 1.015));`);
  };
  m.name = 'tessariel_skin';
  return m;
}

// (WebGPU) the same in TSL: one graph with a map, one without (skinNodes again once a map is given)
const _skin = new Map();
function skinNodes(m) {
  const k = m.map ? 'map|' + m.map.colorSpace : 'none';
  if (!_skin.has(k)) {
    const { Fn, vec3, vec4, floor, fract, sin, dot, abs, mix, step, smoothstep, positionGeometry: vb } = T;
    const hHash = (p) => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
    // the briefs: waistband at 1.0 m, the leg openings rising from the crotch to the hips
    const brief = step(mix(0.835, 0.955, smoothstep(0.035, 0.19, abs(vb.x))), vb.y).mul(step(vb.y, 1.015));
    const tex = m.map ? shared((mat) => mat.map, m.map) : null;
    const color = Fn(() => {
      const b = (tex || vec4(1)).toVar();
      const c = b.rgb.mul(ref('color', 'color')).toVar();
      c.mulAssign(hHash(floor(vb.mul(90.0))).mul(0.1).add(0.93));   // a little mottling, so the skin isn't paint
      const band = step(0.975, vb.y).mul(brief);
      const cloth = vec3(0.018, 0.017, 0.02).mul(hHash(floor(vb.mul(220.0))).mul(0.3).add(0.85));
      c.assign(mix(c, cloth.add(band.mul(vec3(0.03))), brief));
      return vec4(c, b.a);
    })();
    _skin.set(k, { color, rough: mix(ref('roughness', 'float'), 0.85, brief) });
  }
  const g = _skin.get(k);
  m.colorNode = g.color; m.roughnessNode = g.rough;
  m.needsUpdate = true;
  return m;
}

/** Turn bone `name` (in the world) so that its child `to` lies along `dir` (model space). */
function aim(bones, root, name, to, dir) {
  const b = bones[name], c = bones[to];
  if (!b || !c) return;
  root.updateMatrixWorld(true);
  const a = b.getWorldPosition(new THREE.Vector3()), e = c.getWorldPosition(new THREE.Vector3());
  const cur = e.sub(a).normalize();
  const want = new THREE.Vector3(...dir).normalize().transformDirection(root.matrixWorld);
  const turn = new THREE.Quaternion().setFromUnitVectors(cur, want);
  const wq = b.getWorldQuaternion(new THREE.Quaternion());
  const pq = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  b.quaternion.copy(pq.multiply(turn.multiply(wq)));
  b.updateMatrixWorld(true);
}

/** The model: { root (centred on his middle), size (his curled radius) }. */
export async function loadHero({ curl = true } = {}) {
  const gltf = await new GLTFLoader().loadAsync(MODEL);
  const model = cloneSkinned(gltf.scene);
  let skinTex = null;
  model.traverse((o) => { if (o.isMesh && /V_Skin_Body/.test([o.material].flat()[0]?.name || '')) skinTex = [o.material].flat()[0].map; });
  const skin = averageColour(skinTex).multiplyScalar(1.05);
  const bare = skinMaterial(skin);
  // the body's own skin keeps its texture but gets the briefs too
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = true;
    const name = [o.material].flat()[0]?.name || '';
    if (/^V_(Skin_Head|Eye|Lashes|HairShell)/.test(name)) return;
    if (/V_Skin_Body/.test(name)) {
      const m = skinMaterial(skin);
      m.map = o.material.map; m.color.set(0xffffff);
      if (WEBGPU) skinNodes(m);
      o.material = m;
      return;
    }
    o.material = bare;   // the clothes and boots: bare skin now
  });
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  // fingers loosely curled
  for (const [n, b] of Object.entries(bones)) if (/^(Index|Middle|Ring|Pinky)[123][LR]$/.test(n)) b.rotation.z += (n.endsWith('L') ? -1 : 1) * 0.55;
  for (const [name, to, dir] of curl ? CURL : []) {
    // the feet hang off the root (the rig's IK): bring each to its ankle before turning it
    if (/^Foot[LR]$/.test(name) && bones['LowerLeg' + name.slice(-1) + '_end']) {
      model.updateMatrixWorld(true);
      const ankle = bones['LowerLeg' + name.slice(-1) + '_end'].getWorldPosition(new THREE.Vector3());
      bones[name].position.copy(bones[name].parent.worldToLocal(ankle));
    }
    aim(bones, model, name, to, dir);
  }
  // centre him on the middle of the ball he makes
  model.updateMatrixWorld(true);
  const pts = ['Hips', 'Chest', 'Head', 'LowerLegL', 'LowerLegR', 'FootL', 'FootR', 'WristL', 'WristR'].map((n) => bones[n]?.getWorldPosition(new THREE.Vector3())).filter(Boolean);
  const mid = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const size = Math.max(...pts.map((p) => p.distanceTo(mid))) + 0.18;
  const root = new THREE.Group();
  model.position.sub(mid);
  root.add(model);
  root.userData.size = size;
  return root;
}
