// Daggerfall-style billboards: instanced quads that turn about their vertical axis to face
// the camera. One instanced mesh per sprite image. Trees and plants sway in the wind, cast
// sun shadows (their shadow quad turns to face the sun instead), and every billboard is lit
// by the sky and by the nearby torches and spells (the same lights the world uses).
import * as THREE from 'three';
import { SHARP_GLSL, refineTexture } from './engine.js';
import { fogUniforms } from './nodes.js';

export const MAX_LIGHTS = 24;

const common = /* glsl */`
  attribute vec3 offset;      // ground point of this instance
  attribute vec2 size;        // width, height in metres
  attribute float shade;
  uniform float time;
  uniform float wind;
  vec3 billboard(vec3 face) {
    face.y = 0.0;
    vec3 right = normalize(vec3(face.z, 0.0, -face.x) + 1e-5);
    float up = max(position.y, 0.0) * size.y;
    float gust = sin(time * 1.3 + offset.x * 0.21 + offset.z * 0.17) * 0.6 + sin(time * 2.9 + offset.x * 0.53) * 0.25;
    vec3 sway = vec3(1.0, 0.0, 0.55) * gust * wind * 0.035 * up * min(1.0, up / 4.0);
    return offset + right * (position.x * size.x) + vec3(0.0, position.y * size.y, 0.0) + sway;
  }`;

const vert = /* glsl */`
  #include <fog_pars_vertex>
  ${common}
  uniform vec3 light;
  uniform vec4 lp[${MAX_LIGHTS}];   // xyz position, w intensity
  uniform vec4 lc[${MAX_LIGHTS}];   // rgb colour, a range
  varying vec2 vUv;
  varying vec3 vLight;
  void main() {
    vUv = uv;
    vec3 world = billboard(cameraPosition - offset);
    vec3 l = light;
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (lp[i].w <= 0.0) continue;
      float d = distance(world, lp[i].xyz);
      float f = max(0.0, 1.0 - d / lc[i].a);
      l += lc[i].rgb * lp[i].w * f * f * 0.12;
    }
    vLight = l * shade;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
// crisp texels (engine.js), and an edge cut at half alpha but anti-aliased by alpha to coverage; far
// off, where the mipmaps soften the edge, the alpha is lifted so the sprite doesn't thin away
const frag = /* glsl */`
  #include <fog_pars_fragment>
  ${SHARP_GLSL}
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec3 vLight;
  void main() {
    vec4 c = sharpTexel(map, vUv);
    vec2 tw = fwidth(vUv * vec2(textureSize(map, 0)));
    c.a *= 1.0 + max(0.0, log2(max(tw.x, tw.y))) * 0.25;
    c.a = clamp((c.a - 0.5) / max(fwidth(c.a), 1e-4) + 0.5, 0.0, 1.0);
    if (c.a <= 0.0) discard;
    gl_FragColor = vec4(c.rgb * vLight, c.a);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;
// the sun's shadow pass: the quad turns to face the sun so the shadow has the sprite's shape
const depthVert = /* glsl */`
  ${common}
  uniform vec3 sunDir;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * vec4(billboard(sunDir), 1.0);
  }`;
const depthFrag = /* glsl */`
  #include <packing>
  uniform sampler2D map;
  varying vec2 vUv;
  void main() {
    if (texture2D(map, vUv).a < 0.5) discard;
    gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
  }`;
const PLANT = /grass|fern|bush|flower|reed|weed|shrub|brush|thistle|bramble|nettle|heather|briar|sapling|ivy|vine|cattail|bracken|hedge|tuft|clover/;

export class Billboards {
  constructor(lib, scene) {
    this.lib = lib;
    this.scene = scene;
    this.groups = new Map(); // sprite id -> [{x, y, z, scale, shade}]
    // shared by every billboard material
    this.light = { value: new THREE.Color(1, 1, 1) };
    this.time = { value: 0 };
    this.sunDir = { value: new THREE.Vector3(0, 1, 0) };
    this.lp = { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) };
    this.lc = { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(1, 1, 1, 10)) };
    this.shadows = true;
  }

  add(id, x, y, z, scale = 1, shade = 1) {
    if (this.redirect && this.redirect(id, x, y, z, scale)) return; // built in 3D instead
    this.lib.usedSprites.add(id);
    if (!this.groups.has(id)) this.groups.set(id, []);
    this.groups.get(id).push({ x, y, z, scale, shade });
  }

  /** Point lights to light the billboards with: [{position, intensity, color, distance}]. */
  setLights(lights) {
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = lights[i];
      if (!l || l.intensity <= 0) { this.lp.value[i].w = 0; continue; }
      this.lp.value[i].set(l.position.x, l.position.y, l.position.z, l.intensity);
      this.lc.value[i].set(l.color.r, l.color.g, l.color.b, l.distance || 10);
    }
  }

  finish() {
    for (const [id, list] of this.groups) {
      const s = this.lib.sprite(id);
      if (!s) continue;
      const tex = this.lib.texture(s.file, false);
      refineTexture(tex);
      const [w, h] = s.size;
      const ax = s.anchor[0] / w, ay = 1 - s.anchor[1] / h;
      // a unit quad whose bottom-centre sits on the sprite's ground anchor
      const g = new THREE.InstancedBufferGeometry();
      const pos = new Float32Array([-ax, -ay, 0, 1 - ax, -ay, 0, 1 - ax, 1 - ay, 0, -ax, 1 - ay, 0]);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      const off = new Float32Array(list.length * 3), size = new Float32Array(list.length * 2);
      const shade = new Float32Array(list.length);
      const hm = s.height_m, wm = s.height_m * (w / h);
      list.forEach((p, i) => {
        off.set([p.x, p.y, p.z], i * 3);
        size.set([wm * p.scale, hm * p.scale], i * 2);
        shade[i] = p.shade;
      });
      g.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 3));
      g.setAttribute('size', new THREE.InstancedBufferAttribute(size, 2));
      g.setAttribute('shade', new THREE.InstancedBufferAttribute(shade, 1));
      g.instanceCount = list.length;
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      const tree = s.category === 'tree';
      const wind = { value: tree ? 1 : PLANT.test(id) ? 2.2 : 0 };
      const shared = { map: { value: tex }, time: this.time, wind };
      const m = new THREE.ShaderMaterial({
        uniforms: { ...fogUniforms(), ...shared, light: this.light, lp: this.lp, lc: this.lc },
        vertexShader: vert, fragmentShader: frag, fog: true, side: THREE.DoubleSide, alphaToCoverage: true,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      // tall things cast sun shadows; nothing casts torch shadows (those would need a turn
      // toward each light)
      if (this.shadows && s.height_m > 1.2 && s.category !== 'window' && s.category !== 'hanging') {
        mesh.castShadow = true;
        mesh.customDepthMaterial = new THREE.ShaderMaterial({ uniforms: { ...shared, sunDir: this.sunDir },
          vertexShader: depthVert, fragmentShader: depthFrag, side: THREE.DoubleSide });
        mesh.customDistanceMaterial = new THREE.ShaderMaterial({ vertexShader: 'void main() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }',
          fragmentShader: 'void main() { discard; }' });
      }
      this.scene.add(mesh);
    }
  }
}

/** A flat textured panel on a wall (stained glass, banners): a quad facing `normal`. */
export function wallPanel(lib, scene, id, x, y, z, normal, height, { glow = false } = {}) {
  const s = lib.sprite(id);
  if (!s) return null;
  const tex = lib.texture(s.file, false);
  refineTexture(tex);
  const w = height * s.size[0] / s.size[1];
  const g = new THREE.PlaneGeometry(w, height);
  // stained glass glows (bright enough to bloom); hangings are lit like walls
  const m = glow ? new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color(1.7, 1.7, 1.7) })
    : new THREE.MeshPhongMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, shininess: 4, specular: 0x080808 });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.lookAt(x + normal[0], y + normal[1], z + normal[2]);
  mesh.receiveShadow = !glow;
  mesh.userData.glass = glow;
  scene.add(mesh);
  return mesh;
}
