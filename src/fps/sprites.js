// Daggerfall-style billboards: instanced quads that turn about their vertical axis to face
// the camera. One instanced mesh per sprite image. Trees and plants sway in the wind, cast
// sun shadows (their shadow quad turns to face the sun instead), and every billboard is lit
// by the sky and by the nearby torches and spells (the same lights the world uses).
import * as THREE from 'three';
import { SHARP_GLSL, refineTexture } from './engine.js';
import { fogUniforms, WEBGPU, T, ref, shared, sharpGrad, sourceOf } from './nodes.js';

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

/** The billboards under WebGPU (vert / frag, and depthVert / depthFrag for the sun's shadow), as
 * one graph every billboard material shares: what differs, its picture (material.uniforms.map) and
 * its wind (uniforms.wind), comes from the material drawn. `B` the Billboards (its light, time, sun
 * and lights: shared, once a render); `like` a picture of the kind they all are. */
function billboardGraph(B, like) {
  const { Fn, Loop, If, attribute, positionGeometry, cameraPosition, cameraProjectionMatrix, uniformArray, renderGroup, varying, uv,
    vec2, vec3, vec4, sin, max, min, normalize, distance, dFdx, dFdy, fwidth, textureSize, log2, clamp, select } = T;
  const offset = attribute('offset', 'vec3'), size = attribute('size', 'vec2'), shade = attribute('shade', 'float');
  const wind = ref('uniforms.wind.value', 'float');
  // the quad turned about its upright to `face`, swaying with the wind
  const billboard = (face) => {
    const right = normalize(vec3(face.z, 0.0, face.x.negate()).add(1e-5));
    const p = positionGeometry, up = max(p.y, 0.0).mul(size.y);
    const gust = sin(B.time.mul(1.3).add(offset.x.mul(0.21)).add(offset.z.mul(0.17))).mul(0.6).add(sin(B.time.mul(2.9).add(offset.x.mul(0.53))).mul(0.25));
    const sway = vec3(1.0, 0.0, 0.55).mul(gust.mul(wind).mul(0.035).mul(up).mul(min(1.0, up.div(4.0))));
    return offset.add(right.mul(p.x.mul(size.x))).add(vec3(0.0, p.y.mul(size.y), 0.0)).add(sway);
  };
  const world = billboard(cameraPosition.sub(offset));
  // lit by the sky and the nearby torches and spells, per vertex
  const lp = uniformArray(B.lp.value, 'vec4').setGroup(renderGroup), lc = uniformArray(B.lc.value, 'vec4').setGroup(renderGroup);
  const vLight = varying(Fn(() => {
    const l = vec3(B.light).toVar();
    Loop(MAX_LIGHTS, ({ i }) => {
      const p = lp.element(i), c = lc.element(i);
      If(p.w.greaterThan(0.0), () => {
        const f = max(0.0, distance(world, p.xyz).div(c.w).oneMinus());
        l.addAssign(c.rgb.mul(p.w).mul(f).mul(f).mul(0.12));
      });
    });
    return l.mul(shade);
  })());
  const pick = (m) => m.uniforms?.map?.value;
  const follow = (s) => { s.onObjectUpdate((f) => pick(sourceOf(f)) || undefined); return s; };
  const map = shared(pick, like);
  const t = uv(), dx = dFdx(t), dy = dFdy(t);
  // crisp texels, and an edge cut at half alpha but anti-aliased by alpha to coverage; far off, where
  // the mipmaps soften the edge, the alpha is lifted so the sprite doesn't thin away
  const frag = Fn(() => {
    const c = follow(sharpGrad(map, t, dx, dy)).toVar();
    const tw = fwidth(t.mul(vec2(textureSize(map, 0))));
    const a0 = c.a.mul(max(0.0, log2(max(tw.x, tw.y))).mul(0.25).add(1.0));
    const a = clamp(a0.sub(0.5).div(max(fwidth(a0), 1e-4)).add(0.5), 0.0, 1.0);
    a.lessThanEqual(0.0).discard();
    return vec4(c.rgb.mul(vLight), a);
  })();
  // the sun's shadow: the quad turned to face the sun, cut at half alpha; in a perspective shadow (a
  // point light's) none at all (WebGL: its customDistanceMaterial draws nothing): all four corners
  // at one point (projection [2][3] is -1 for perspective, 0 for the sun's orthographic camera)
  const persp = cameraProjectionMatrix.element(2).w.lessThan(-0.5);
  const castAt = select(persp, vec3(0.0, -1e5, 0.0), billboard(vec3(B.sunDir)));
  const mask = follow(map.sample(t)).a.greaterThanEqual(0.5);
  return { world, frag, castAt, mask };
}

export class Billboards {
  constructor(lib, scene) {
    this.lib = lib;
    this.scene = scene;
    this.groups = new Map(); // sprite id -> [{x, y, z, scale, shade}]
    // shared by every billboard material (WebGPU: uniforms shared by them all, set once a render)
    const U = WEBGPU ? (v) => T.uniform(v).setGroup(T.renderGroup) : (v) => ({ value: v });
    this.light = U(new THREE.Color(1, 1, 1));
    this.time = U(0);
    this.sunDir = U(new THREE.Vector3(0, 1, 0));
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
      const casts = this.shadows && s.height_m > 1.2 && s.category !== 'window' && s.category !== 'hanging';
      if (WEBGPU) {
        const G = this.graph ||= billboardGraph(this, tex);
        const m = new THREE.NodeMaterial();
        m.positionNode = G.world; m.fragmentNode = G.frag;
        m.castShadowPositionNode = G.castAt; m.maskShadowNode = G.mask;   // (the sun's shadow: three draws its depth with these)
        m.side = THREE.DoubleSide; m.alphaToCoverage = true; m.fog = true;
        m.uniforms = { map: { value: tex }, wind };
        const mesh = new THREE.Mesh(g, m);
        mesh.frustumCulled = false;
        mesh.castShadow = casts;
        this.scene.add(mesh);
        continue;
      }
      const shared = { map: { value: tex }, time: this.time, wind };
      const m = new THREE.ShaderMaterial({
        uniforms: { ...fogUniforms(), ...shared, light: this.light, lp: this.lp, lc: this.lc },
        vertexShader: vert, fragmentShader: frag, fog: true, side: THREE.DoubleSide, alphaToCoverage: true,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      // tall things cast sun shadows; nothing casts torch shadows (those would need a turn
      // toward each light)
      if (casts) {
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
