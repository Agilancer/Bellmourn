// The reworked Quaternius kit (templates/models/kit, built by tools/kit): every model of the six
// packs reshaped and repainted for Bellmourn, one bundle per pack. Placements become instances
// of InstancedMeshes, grouped in 64 m cells that are hidden past their model's view distance
// (trees and big rocks swap to their low-detail copy first), each with a collider and, for
// candles, torches and fires, a flame that the torch-light pool can pick up.
//
// One material per repainted atlas (and per colour variant), shared by everything drawn with
// it, nearest-filtered with a normal map the GPU derives from it. On the GPU each one is
// weathered where it stands: world-space grime from the packs' own noise, damp rising from the
// foot of every piece, moss on the tops of stone and timber, snow on the upward faces in the
// cold country (from the land's biome map), and then the colour snapped back onto Bellmourn's
// palette through a lookup table, so the weathering can never leave the 16 ramps.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crisp, WEBGPU } from './engine.js';
import { drawNormalMap, T, sharpGrad, shared, keyed, ref, sourceOf, settled } from './nodes.js';

const ROOT = 'templates/models/kit/';
const PACKS = ['props', 'village', 'nature', 'trees', 'ultimate', 'dungeon', 'bellmourn'];
const CELL = 96;
// the growing things and stones are batched: every species drawn with one atlas shares one
// BatchedMesh for the whole world (and a low-detail twin), each species' geometry stored once,
// and every cell shows and hides its own instances in it; one-off pieces (a house's walls, a
// room's furniture) are merged per cell and atlas; anything placed many times in a cell is
// instanced
const BATCHED = /^(tree|plant|rock|log|cactus|path)$/;

// how each atlas weathers: grime, damp at the foot, moss on top, snow sticks
const WEATHER = {
  stone: { grime: 0.8, damp: 0.9, moss: 0.8, snow: 1 },
  wood: { grime: 0.7, damp: 0.6, moss: 0.4, snow: 1 },
  metal: { grime: 0.6, damp: 0.3, moss: 0, snow: 0.6 },
  cloth: { grime: 0.6, damp: 0.5, moss: 0, snow: 0.5 },
  leaf: { grime: 0.25, damp: 0, moss: 0, snow: 0.8 },
  plain: { grime: 0.6, damp: 0.6, moss: 0.3, snow: 1 },
};
const ATLAS_KIND = (a) => (/brick|rock|plaster|roundtiles|pathrocks|rocktrim|page/.test(a) ? 'stone'
  : /bark|wood|furniture/.test(a) ? 'wood' : /metal/.test(a) ? 'metal' : /cloth/.test(a) ? 'cloth'
    : /leaves|pine|foliage|flowers|grass|vine|mushrooms|birch(leaves|gold)/.test(a) ? 'leaf' : 'plain');

const NM_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const NM_FRAG = /* glsl */`
  uniform sampler2D src; uniform vec2 texel; uniform float strength;
  varying vec2 vUv;
  float h(vec2 o) { return dot(texture2D(src, vUv + o * texel).rgb, vec3(0.299, 0.587, 0.114)); }
  void main() {
    float tl = h(vec2(-1.0, 1.0)), t = h(vec2(0.0, 1.0)), tr = h(vec2(1.0, 1.0));
    float l = h(vec2(-1.0, 0.0)), r = h(vec2(1.0, 0.0));
    float bl = h(vec2(-1.0, -1.0)), b = h(vec2(0.0, -1.0)), br = h(vec2(1.0, -1.0));
    float dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
    float dy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
    gl_FragColor = vec4(normalize(vec3(-dx * strength, -dy * strength, 1.0)) * 0.5 + 0.5, 1.0);
  }`;

export class Kit {
  constructor(renderer, scene, physics, { normals = true, shadows = true, packs = PACKS } = {}) {
    this.renderer = renderer;
    this.packs = packs;
    this.scene = scene;
    this.physics = physics;
    this.normals = normals;
    this.shadows = shadows;
    this.models = new Map();  // id -> { parts: [{ geo, atlas }], info }
    this.mats = new Map();
    this.tex = new Map();
    this.nrm = new Map();
    this.placed = new Map();  // id|variant -> [{ m, cull }]
    this.cells = [];          // { x, z, groups: [{ near: [meshes or Slices], far, lodAt, cull }] }
    this.used = new Set();    // model ids placed
    this.flames = [];         // [x, y, z, size]
    this.loader = new THREE.TextureLoader();
    // shared by every kit material: the weathering textures, the palette table, the biome map
    // (WebGPU: TSL nodes, whose .value is set as the GLSL uniforms' was)
    this.U = WEBGPU ? {
      kGrime: T.texture(new THREE.Texture()), kLut: T.texture(new THREE.Texture()), kBiome: T.texture(new THREE.Texture()),
      kBiomeRect: T.uniform(new THREE.Vector4(-1, -1, 2, 2)).setGroup(T.renderGroup), kSnow: T.uniform(new THREE.Color(0xd8dee3)).setGroup(T.renderGroup),
      kMoss: T.uniform(new THREE.Color(0x2b4b19)).setGroup(T.renderGroup),
    } : {
      kGrime: { value: null }, kLut: { value: null }, kBiome: { value: null },
      kBiomeRect: { value: new THREE.Vector4(-1, -1, 2, 2) }, kSnow: { value: new THREE.Color(0xd8dee3) },
      kMoss: { value: new THREE.Color(0x2b4b19) },
    };
  }

  async load() {
    const [info, tex, pal] = await Promise.all([
      fetch(ROOT + 'kit.json').then((r) => r.json()),
      fetch(ROOT + 'tex/textures.json').then((r) => r.json()),
      fetch('templates/style/bellmourn_palette.json').then((r) => r.json()),
    ]);
    this.info = info;
    this.texInfo = tex;
    this.palette = pal;
    this.U.kGrime.value = this.texture('grime.png', true, false);
    this.U.kLut.value = paletteLUT(pal.colors.slice(0, 256));
    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    blank.needsUpdate = true;
    this.U.kBiome.value = blank;
    const loader = new GLTFLoader();
    await Promise.all(this.packs.map(async (p) => {
      const gltf = await loader.loadAsync(ROOT + p + '.glb');
      for (const node of gltf.scene.children) this.ingest(node);
    }));
    return this;
  }

  ingest(node) {
    const id = node.userData.name || node.name;
    const parts = [];
    node.updateMatrixWorld(true);
    node.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone();
      if (!o.matrixWorld.equals(new THREE.Matrix4())) geo.applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      geo.computeBoundingBox();
      parts.push({ geo, atlas: o.material.name || 'swatch' });
    });
    this.models.set(id, { parts, info: this.info[id] || null });
  }

  has(id) { return this.models.has(id); }
  info_(id) { return this.info[id]; }
  /** Every model id matching a test (a RegExp or function), lod copies left out. */
  ids(test) {
    const f = typeof test === 'function' ? test : (id) => test.test(id);
    return [...this.models.keys()].filter((id) => !id.endsWith('~lod') && f(id));
  }

  // -------------------------------------------------------------- textures and materials
  texture(file, repeat = true, nearest = true) {
    const k = file + (repeat ? '|r' : '') + (nearest ? '|n' : '');
    if (this.tex.has(k)) return this.tex.get(k);
    const t = this.loader.load(ROOT + 'tex/' + file, () => { for (const f of t.userData.wait || []) f(t); t.userData.wait = null; });
    t.userData.wait = [];
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false; // glTF UVs: (0, 0) is the image's top-left
    // (all linear: `nearest` texels are kept crisp in the shader, engine.js sharpTexel)
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.anisotropy = THREE.Texture.DEFAULT_ANISOTROPY;
    this.tex.set(k, t);
    return t;
  }

  whenLoaded(t, fn) { if (t.image && t.image.width) fn(t); else (t.userData.wait ||= []).push(fn); }

  /** A normal map rendered on the GPU from a texture's brightness (Sobel), at twice its size. */
  normalFrom(tex, strength = 1.2) {
    const k = tex.uuid + '|' + strength;
    if (this.nrm.has(k)) return this.nrm.get(k);
    const rt = new THREE.WebGLRenderTarget(4, 4, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false });
    this.nrm.set(k, rt.texture);
    const draw = () => {
      const img = tex.image;
      rt.setSize(img.width * 2, img.height * 2);
      const src = new THREE.Texture(img);
      src.flipY = tex.flipY;
      src.wrapS = src.wrapT = THREE.RepeatWrapping;
      src.magFilter = src.minFilter = THREE.LinearFilter;
      src.generateMipmaps = false;
      src.needsUpdate = true;
      // (WebGPU: the same pass as a node material, nodes.js)
      if (WEBGPU) { drawNormalMap(this.renderer, rt, src, 1 / img.width, 1 / img.height, strength); src.dispose(); return; }
      if (!this.nmPass) {
        this.nmPass = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: NM_VERT, fragmentShader: NM_FRAG,
          depthTest: false, depthWrite: false, uniforms: { src: { value: null }, texel: { value: new THREE.Vector2() }, strength: { value: 1 } } }));
        this.nmPass.frustumCulled = false;
        this.nmScene = new THREE.Scene();
        this.nmScene.add(this.nmPass);
        this.nmCam = new THREE.Camera();
      }
      const u = this.nmPass.material.uniforms;
      u.src.value = src; u.texel.value.set(1 / img.width, 1 / img.height); u.strength.value = strength;
      const r = this.renderer, prev = r.getRenderTarget();
      r.setRenderTarget(rt);
      r.render(this.nmScene, this.nmCam);
      r.setRenderTarget(prev);
      src.dispose();
    };
    if (tex.image && tex.image.width) draw(); else this.whenLoaded(tex, draw);
    return rt.texture;
  }

  /** The file of an atlas (or one of its colour variants). */
  atlasFile(atlas, variant) {
    if (atlas === 'swatch') return 'swatch.png';
    const a = this.texInfo.atlases[atlas];
    if (!a) return 'swatch.png';
    // a variant is one of the atlas's repaints, or a sibling atlas (trees_leaves + 'red')
    return (variant && (a.variants[variant] || this.texInfo.atlases[atlas + '_' + variant]?.file)) || a.file;
  }

  variantsOf(atlas) {
    const own = Object.keys(this.texInfo.atlases[atlas]?.variants || {});
    const sib = Object.keys(this.texInfo.atlases).filter((k) => k.startsWith(atlas + '_')).map((k) => k.slice(atlas.length + 1));
    return [...own, ...sib];
  }

  /** The shared material for an atlas (and variant). opts.tile makes a separate copy for
   * world-UV geometry built by geo.js (metres per repeat). */
  material(atlas, variant = '', opts = {}) {
    const file = this.atlasFile(atlas, variant);
    const key = file + (opts.tile ? '|t' + opts.tile : '') + (opts.weather ? '|' + opts.weather : '');
    if (this.mats.has(key)) return this.mats.get(key);
    const cut = !!this.texInfo.atlases[atlas]?.cutout;
    const map = this.texture(file);
    const kind = opts.weather || ATLAS_KIND(atlas);
    const shiny = kind === 'metal';
    const m = new THREE.MeshPhongMaterial({ map, side: THREE.DoubleSide, alphaTest: cut ? 0.5 : 0,
      specular: shiny ? 0x2a2622 : 0x0a0908, shininess: shiny ? 30 : 8 });
    if (this.normals && atlas !== 'swatch' && !cut) m.normalMap = this.normalFrom(map, kind === 'stone' ? 1.5 : 1.1);
    if (opts.tile) m.userData = { tileU: opts.tile, tileV: opts.tile, chunk: 32 };
    m.userData.kind = kind;
    m.name = atlas + (variant ? '@' + variant : '');
    this.weather(m, WEATHER[kind], !!opts.tile);
    crisp(m);
    if (atlas === 'village_glass') { m.emissive = new THREE.Color(0xffa040); m.emissiveMap = map; m.emissiveIntensity = 0.2; this.glass = m; }
    this.mats.set(key, m);
    return m;
  }

  /** Weathering, in the material's shader (no palette snap: the colour is the weathering's own). */
  weather(m, w, built) {
    const U = this.U;
    if (WEBGPU) {   // (one graph for every kit material: its weathering and its map are its own)
      m.userData.kW = [w.grime, w.damp, w.moss, w.snow];
      m.userData.kBuilt = built ? 1 : 0;
      m.colorNode = settled(this.weatherNode(m.map));
      keyed(m, 'kit');
      return;
    }
    m.customProgramCacheKey = () => 'kit' + JSON.stringify(w) + (built ? 'b' : '');
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.uniforms.kW = { value: new THREE.Vector4(w.grime, w.damp, w.moss, w.snow) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 kP; varying vec3 kN; varying float kY;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 kw = vec4(transformed, 1.0);
          vec3 kn = objectNormal;
          #ifdef USE_BATCHING
            kw = batchingMatrix * kw; kn = mat3(batchingMatrix) * kn;
          #endif
          #ifdef USE_INSTANCING
            kw = instanceMatrix * kw; kn = mat3(instanceMatrix) * kn;
          #endif
          kw = modelMatrix * kw;
          kP = kw.xyz; kN = normalize(mat3(modelMatrix) * kn);
          kY = ${built ? '9.0' : 'transformed.y'};`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 kP; varying vec3 kN; varying float kY;
          uniform sampler2D kGrime, kLut, kBiome; uniform vec4 kBiomeRect, kW; uniform vec3 kSnow, kMoss;
          vec3 kSnap(vec3 c) { // linear -> sRGB, the nearest palette entry, back to linear
            vec3 s = clamp(pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)), 0.0, 1.0) * 31.0 + 0.5;
            vec2 uv = vec2((floor(s.b) * 32.0 + floor(s.r) + 0.5) / 1024.0, (floor(s.g) + 0.5) / 32.0);
            return pow(texture2D(kLut, uv).rgb, vec3(2.2));
          }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            vec3 n = normalize(kN);
            vec3 tw = pow(abs(n), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
            vec4 g = texture2D(kGrime, kP.zy * 0.31) * tw.x + texture2D(kGrime, kP.xz * 0.31) * tw.y + texture2D(kGrime, kP.xy * 0.31) * tw.z;
            diffuseColor.rgb *= mix(1.0, 0.6 + 0.5 * g.r, kW.x);
            float damp = (1.0 - smoothstep(0.0, 0.7 + 0.9 * g.g, kY)) * kW.y;
            diffuseColor.rgb *= 1.0 - 0.45 * damp;
            float up = smoothstep(0.5, 0.85, n.y);
            float mo = up * smoothstep(0.52, 0.7, texture2D(kGrime, kP.xz * 0.09).b + g.g * 0.25) * kW.z;
            diffuseColor.rgb = mix(diffuseColor.rgb, kMoss * (0.55 + 0.7 * g.r), mo * 0.85);
            vec2 bu = (kP.xz - kBiomeRect.xy) / kBiomeRect.zw;
            float snow = texture2D(kBiome, bu).a * kW.w;
            float sn = smoothstep(0.35, 0.7, n.y + snow * 0.25 - (1.0 - snow) * 0.6 + (g.b - 0.5) * 0.3) * snow;
            diffuseColor.rgb = mix(diffuseColor.rgb, kSnow * (0.82 + 0.25 * g.r), sn);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), 0.18) * 0.9; // Bellmourn's drab light
          }`);
    };
  }

  /** weather() in TSL (WebGPU): the material's map crisp (as crisp() would draw it) times its colour,
   * then weathered where it stands, one graph for every kit material (per kind of map texture). */
  weatherNode(like) {
    const key = `${like?.colorSpace}|${like?.type}|${like?.minFilter}|${like?.magFilter}`;
    this.weatherNodes ??= new Map();
    if (this.weatherNodes.has(key)) return this.weatherNodes.get(key);
    const { Fn, uv, dFdx, dFdy, positionWorld, positionGeometry, normalWorldGeometry, vec3, vec4, pow, abs, normalize, mix, smoothstep, dot } = T;
    const U = this.U, G = U.kGrime;
    const base = shared((mat) => mat.map, like);
    const u = uv();
    const map = sharpGrad(base, u, dFdx(u), dFdy(u));
    map.onObjectUpdate((f) => sourceOf(f).map || undefined);   // (as nodes.js crispColor)
    const color = ref('color', 'color'), kW = [0, 1, 2, 3].map((i) => ref(`userData.kW.${i}`, 'float')), built = ref('userData.kBuilt', 'float');
    const g = Fn(() => {
      const dc = vec4(map.rgb.mul(color), map.a).toVar();   // (map_fragment: the diffuse colour)
      const kP = positionWorld.toVar(), n = normalize(normalWorldGeometry).toVar();
      const kY = mix(positionGeometry.y, 9.0, built);   // (geo.js's world-UV pieces: never damp)
      const tw0 = pow(abs(n), vec3(4.0)), tw = tw0.div(tw0.x.add(tw0.y).add(tw0.z)).toVar();
      const g = G.sample(kP.zy.mul(0.31)).mul(tw.x).add(G.sample(kP.xz.mul(0.31)).mul(tw.y)).add(G.sample(kP.xy.mul(0.31)).mul(tw.z)).toVar();
      const c = dc.rgb.mul(mix(1.0, g.r.mul(0.5).add(0.6), kW[0])).toVar();
      const damp = smoothstep(0.0, g.g.mul(0.9).add(0.7), kY).oneMinus().mul(kW[1]);
      c.mulAssign(damp.mul(0.45).oneMinus());
      const up = smoothstep(0.5, 0.85, n.y);
      const mo = up.mul(smoothstep(0.52, 0.7, G.sample(kP.xz.mul(0.09)).b.add(g.g.mul(0.25)))).mul(kW[2]);
      c.assign(mix(c, U.kMoss.mul(g.r.mul(0.7).add(0.55)), mo.mul(0.85)));
      const bu = kP.xz.sub(U.kBiomeRect.xy).div(U.kBiomeRect.zw);
      const snow = U.kBiome.sample(bu).a.mul(kW[3]).toVar();
      const sn = smoothstep(0.35, 0.7, n.y.add(snow.mul(0.25)).sub(snow.oneMinus().mul(0.6)).add(g.b.sub(0.5).mul(0.3))).mul(snow);
      c.assign(mix(c, U.kSnow.mul(g.r.mul(0.25).add(0.82)), sn));
      c.assign(mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), 0.18).mul(0.9));   // Bellmourn's drab light
      return vec4(c, dc.a);
    })();
    this.weatherNodes.set(key, g);
    return g;
  }

  /** A geo.js material: the atlas tiling every `tile` metres in world-UV geometry. */
  surface(atlas, tile = 2, variant = '', weather = null) { return this.material(atlas, variant, { tile, weather }); }

  // -------------------------------------------------------------- placing
  /**
   * Put model `id` in the world. s: a scale or [sx, sy, sz]. opts:
   *   variant  colour variant name (applied to every atlas that has one of that name)
   *   solid    true (rotated bounding box), 'trunk' (a post at the foot), false (none)
   *   tag      physics tag ('prop' by default; 'tree' for trunks)
   *   cast     cast shadows (default: anything taller than 0.6 m)
   *   tilt     [x, z] small tilts in radians (rocks and trees settling on a slope)
   *   cull     view distance in metres (default from the model's size)
   *   layer    'over' (default) or 'under': the undercroft is only drawn from below ground
   */
  place(id, x, y, z, rot = 0, s = 1, opts = {}) {
    const mdl = this.models.get(id);
    if (!mdl) { (this.missing ||= new Set()).add(id); if (!id) console.warn('kit.place: no model id', new Error().stack); return null; }
    const info = mdl.info || {};
    const S = Array.isArray(s) ? s : [s, s, s];
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.tilt?.[0] || 0, rot, opts.tilt?.[1] || 0, 'YXZ'));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(...S));
    const lo = info.min || [-0.5, 0, -0.5], hi = info.max || [0.5, 1, 0.5];
    const size = Math.max((hi[0] - lo[0]) * S[0], (hi[1] - lo[1]) * S[1], (hi[2] - lo[2]) * S[2]);
    const key = id + '|' + (opts.variant || '');
    if (!this.placed.has(key)) this.placed.set(key, []);
    const cull = opts.cull ?? Math.min(900, Math.max(45, size * 55));
    const cast = opts.cast ?? (this.shadows && size > 0.6);
    this.placed.get(key).push({ m, cull, cast, x, z, size, layer: opts.layer || 'over' });
    this.used.add(id);
    // the collider
    const solid = opts.solid ?? (!/tree|plant/.test(info.category || '') && !(info.tags || []).includes('plant'));
    if (solid === 'trunk') {
      const r = Math.max(0.18, Math.min(0.6, 0.12 * size / 4)) ;
      this.physics.add([x - r, y, z - r], [x + r, y + Math.min(6, (hi[1]) * S[1]), z + r], opts.tag || 'tree');
    } else if (solid) {
      const p = new THREE.Vector3(), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (const cx of [lo[0], hi[0]]) for (const cy of [lo[1], hi[1]]) for (const cz of [lo[2], hi[2]]) {
        p.set(cx, cy, cz).applyMatrix4(m);
        mn[0] = Math.min(mn[0], p.x); mn[1] = Math.min(mn[1], p.y); mn[2] = Math.min(mn[2], p.z);
        mx[0] = Math.max(mx[0], p.x); mx[1] = Math.max(mx[1], p.y); mx[2] = Math.max(mx[2], p.z);
      }
      if (mx[1] - mn[1] > 0.12) this.physics.add(mn, mx, opts.tag || 'prop');
    }
    // flames (near ones merged: a candle's wick is one flame)
    if (opts.flames !== false && info.flames?.length) {
      const size0 = /Candle|Chandelier|shrine/.test(id) ? 0.12 : /fire|brazier|Woodfire/i.test(id) ? 0.45 : 0.3;
      const merged = [];
      for (const f of info.flames) if (!merged.some((g) => Math.hypot(g[0] - f[0], g[1] - f[1], g[2] - f[2]) < 0.14)) merged.push(f);
      for (const f of merged) {
        const p = new THREE.Vector3(...f).applyMatrix4(m);
        this.flames.push([p.x, p.y, p.z, size0 * S[1]]);
      }
    }
    return { m, info, size };
  }

  /** A model as an ordinary mesh group (doors that swing, things picked up). */
  mesh(id, variant = '') {
    const mdl = this.models.get(id);
    const g = new THREE.Group();
    if (!mdl) return g;
    for (const p of mdl.parts) {
      const me = new THREE.Mesh(p.geo, this.material(p.atlas, variant && this.variantsOf(p.atlas).includes(variant) ? variant : ''));
      me.castShadow = this.shadows; me.receiveShadow = true;
      g.add(me);
    }
    this.used.add(id);
    return g;
  }

  // -------------------------------------------------------------- building the instances
  finish() {
    const cells = new Map();
    const cellOf = (p) => {
      const i = Math.floor(p.x / CELL), k = Math.floor(p.z / CELL), ck = `${i},${k},${p.layer}`;
      if (!cells.has(ck)) cells.set(ck, { x: (i + 0.5) * CELL, z: (k + 0.5) * CELL, layer: p.layer, groups: [], merge: [] });
      return cells.get(ck);
    };
    const mat = (atlas, variant) => this.material(atlas, variant && this.variantsOf(atlas).includes(variant) ? variant : '');
    const add = (o, cast) => { o.castShadow = cast; o.receiveShadow = true; o.matrixAutoUpdate = false; o.visible = false; this.scene.add(o); return o; };
    for (const [key, list] of this.placed) {
      const [id, variant] = key.split('|');
      const mdl = this.models.get(id);
      const lod = mdl.info?.lod && this.models.get(mdl.info.lod);
      const byCell = new Map();
      for (const p of list) { const c = cellOf(p); if (!byCell.has(c)) byCell.set(c, []); byCell.get(c).push(p); }
      const batched = BATCHED.test(mdl.info?.category || '');
      for (const [c, ps] of byCell) {
        if (batched) { (c.batch ||= []).push({ mdl, lod, variant, ps }); continue; }
        if (ps.length <= 4) { c.merge.push({ mdl, lod, variant, ps }); continue; }
        const cull = Math.max(...ps.map((p) => p.cull)), cast = ps.some((p) => p.cast);
        const make = (model) => model.parts.map((part) => {
          const im = new THREE.InstancedMesh(part.geo, mat(part.atlas, variant), ps.length);
          ps.forEach((p, n) => im.setMatrixAt(n, p.m));
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
          return add(im, cast);
        });
        c.groups.push({ near: make(mdl), far: lod ? make(lod) : null, lodAt: lod ? Math.min(85, cull * 0.25) : Infinity, cull });
      }
    }
    // the vegetation: per material, one world-wide batch of every species near (those that cast
    // shadows apart from those that don't) and one of their low-detail copies further out. A
    // cell's share of each is a Slice, shown and hidden like a mesh. (A batch per cell would
    // copy every species into each of six hundred cells: well over a gigabyte, which phones
    // can't hold.)
    const worldBatch = new Map(); // material -> { cast: [], flat: [], far: [] } of [geo, matrix, slice]
    for (const c of cells.values()) {
      if (!c.batch) continue;
      const byMat = new Map();
      for (const { mdl, lod, variant, ps } of c.batch) for (const part of mdl.parts) {
        const m = mat(part.atlas, variant);
        if (!byMat.has(m)) byMat.set(m, { near: [], far: [], cull: 0, lodAt: Infinity, cast: false });
        const e = byMat.get(m), lp = lod?.parts.find((q) => q.atlas === part.atlas);
        for (const p of ps) {
          e.near.push([part.geo, p.m]);
          if (lod) e.far.push([lp ? lp.geo : null, p.m]); else e.far.push([part.geo, p.m]);
          e.cull = Math.max(e.cull, p.cull);
          e.cast ||= p.cast;
          if (lod) e.lodAt = Math.min(e.lodAt, Math.min(55, p.cull * 0.2));
        }
      }
      for (const [m, e] of byMat) {
        if (!worldBatch.has(m)) worldBatch.set(m, { cast: [], flat: [], far: [] });
        const w = worldBatch.get(m), near = new Slice(), far = e.lodAt < Infinity ? new Slice() : null;
        for (const [g, mx] of e.near) w[e.cast ? 'cast' : 'flat'].push([g, mx, near]);
        if (far) for (const [g, mx] of e.far) if (g) w.far.push([g, mx, far]);
        c.groups.push({ near: [near], far: far ? [far] : null, lodAt: e.lodAt, cull: e.cull, batch: e.near.length });
      }
      c.batch = null;
    }
    const batchable = new Map(); // every geometry in a batch needs the same attributes and an index
    const fit = (g) => {
      if (batchable.has(g)) return batchable.get(g);
      let f = g;
      if (!g.attributes.uv || !g.index) {
        f = g.clone();
        if (!f.attributes.uv) f.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(f.attributes.position.count * 2), 2));
        if (!f.index) f.setIndex([...Array(f.attributes.position.count).keys()]);
      }
      batchable.set(g, f);
      return f;
    };
    const batch = (m, items, cast) => {
      if (!items.length) return;
      const geos = [...new Set(items.map((i) => fit(i[0])))];
      let nv = 0, ni = 0;
      for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
      const bm = new THREE.BatchedMesh(items.length, nv, ni, m);
      const gid = new Map(geos.map((g) => [g, bm.addGeometry(g)]));
      for (const [g, mx, slice] of items) {
        const id = bm.addInstance(gid.get(fit(g)));
        bm.setMatrixAt(id, mx);
        bm.setVisibleAt(id, false);
        slice.ids.push(bm, id);
      }
      bm.sortObjects = false;
      add(bm, cast).visible = true; // its instances come and go, not the batch
    };
    for (const [m, w] of worldBatch) { batch(m, w.cast, true); batch(m, w.flat, false); batch(m, w.far, false); }
    // the one-off pieces: merged per cell and material, near (full) and far (low detail, and
    // nothing smaller than a person)
    this.merged = 0;
    for (const c of cells.values()) {
      if (!c.merge.length) continue;
      const near = new Map(), far = new Map();
      let cull = 0;
      const put = (bucket, model, variant, p) => {
        for (const part of model.parts) {
          const m = mat(part.atlas, variant);
          if (!bucket.has(m)) bucket.set(m, []);
          const g = part.geo.clone().applyMatrix4(p.m);
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          bucket.get(m).push(g);
        }
      };
      for (const { mdl, lod, variant, ps } of c.merge) for (const p of ps) {
        cull = Math.max(cull, p.cull);
        put(near, mdl, variant, p);
        if (p.size >= 1.6) put(far, lod || mdl, variant, p);
      }
      const build = (bucket) => [...bucket.entries()].map(([m, geos]) => {
        const g = mergeGeometries(geos, false);
        for (const x of geos) x.dispose();
        g.computeBoundingSphere();
        this.merged += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        return add(new THREE.Mesh(g, m), this.shadows);
      });
      c.groups.push({ near: build(near), far: build(far), lodAt: 70, cull: Math.min(cull, 600) });
      c.merge = null;
    }
    this.cells = [...cells.values()];
    this.placed.clear();
    this.instances = this.cells.reduce((a, c) => a + c.groups.reduce((b, g) => b + (g.batch || g.near.reduce((n, m) => n + (m.count || 1), 0)), 0), 0);
  }

  /** Show what's within view distance of the camera (and the low-detail copies further out);
   * the undercroft only from below the ground, the world above only from above its floor. */
  update(pos, far = 1e9, under = false) {
    for (const c of this.cells) {
      const d = Math.hypot(Math.max(0, Math.abs(c.x - pos.x) - CELL / 2), Math.max(0, Math.abs(c.z - pos.z) - CELL / 2)); // to the cell's nearest edge
      const layerOn = c.layer === 'under' ? pos.y < 0.5 : !under;
      for (const g of c.groups) {
        const show = layerOn && d < Math.min(g.cull, far);
        const near = show && d < g.lodAt;
        for (const m of g.near) m.visible = near;
        if (g.far) for (const m of g.far) m.visible = show && !near;
        else if (show && !near) for (const m of g.near) m.visible = true;
      }
    }
  }

  /** The land's biome map: R = snow cover, over the world rectangle [x0, z0, w, d]. */
  setBiome(tex, rect) { this.U.kBiome.value = tex; this.U.kBiomeRect.value.set(...rect); }
}

/** One cell's instances in a world-wide BatchedMesh, shown and hidden together like a mesh. */
class Slice {
  constructor() { this.ids = []; this.on = false; } // ids: [batch, instance id, batch, instance id, ...]
  get visible() { return this.on; }
  set visible(v) {
    if (v === this.on) return;
    this.on = v;
    for (let i = 0; i < this.ids.length; i += 2) this.ids[i].setVisibleAt(this.ids[i + 1], v);
  }
}

/** The palette as a lookup table: every 5-bit colour (32^3, laid out as 32 slices of 32x32 in a
 * 1024 x 32 texture) to its nearest palette entry. */
function paletteLUT(colors) {
  const pal = colors.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const data = new Uint8Array(1024 * 32 * 4);
  for (let b = 0; b < 32; b++) for (let g = 0; g < 32; g++) for (let r = 0; r < 32; r++) {
    const R = r * 255 / 31, G = g * 255 / 31, B = b * 255 / 31;
    let best = 0, bd = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const p = pal[i], dr = p[0] - R, dg = p[1] - G, db = p[2] - B;
      const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11 + (Math.abs(dr - dg) + Math.abs(dg - db)) * 0; // perceptual-ish
      if (d < bd) { bd = d; best = i; }
    }
    const o = (g * 1024 + b * 32 + r) * 4;
    data[o] = pal[best][0]; data[o + 1] = pal[best][1]; data[o + 2] = pal[best][2]; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, 1024, 32);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
