// The texture library (assets/textures/library.json): tiling surfaces become retro materials
// (nearest-filtered, repeating) with normal maps the GPU derives from each texture, so torch
// and spell light rakes across every stone and plank; sprites become billboard textures.
// It also keeps track of which surfaces the world has used, so builders can ask for ones
// that haven't been used yet (every Velscour texture ends up somewhere).
import * as THREE from 'three';

const ROOT = 'assets/textures/';
const SHINY = /iron|met_|gold|marble|slate|wet|sewer|ice|glass|polish|lacquer|obsidian|basalt|tile|inlay|salt/;

const NM_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// height = brightness (mortar and cracks are dark, so they sink); Sobel slope -> tangent normal
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
    vec3 n = normalize(vec3(-dx * strength, -dy * strength, 1.0));
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  }`;

export class Library {
  constructor(renderer, { normals = true } = {}) {
    this.renderer = renderer;
    this.loader = new THREE.TextureLoader();
    this.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.normals = normals;
    this.surf = new Map();
    this.spr = new Map();
    this.mats = new Map();
    this.tex = new Map();
    this.nrm = new Map();
    this.used = new Set();      // surface ids the world has made materials from
    this.usedSprites = new Set();
    this.waiting = new Map();   // file -> [callbacks for when the image arrives]
  }

  async load() {
    const lib = await (await fetch(ROOT + 'library.json')).json();
    for (const s of lib.surfaces) this.surf.set(s.id, s);
    for (const s of lib.sprites) this.spr.set(s.id, s);
    // VectorClad's wood: bark, leaves and planks as surfaces, leaf cards for the 3D trees
    // (tools/world/import_vectorclad.py)
    this.cards = new Map();
    try {
      const vc = await (await fetch(ROOT + 'vectorclad.json')).json();
      for (const s of vc.surfaces) this.surf.set(s.id, s);
      for (const c of vc.cards) this.cards.set(c.id, c);
    } catch (e) { console.warn('no VectorClad textures', e); }
    // the biome packs' flat source art (tools/world/import_biome_art.py): floors, wall panels,
    // roofs and floor decals as surfaces (over the earlier un-projected copies of the same
    // names); door leaves, arches and shop signs for the builders
    this.biome = { doors: new Map(), arches: new Map(), signs: new Map() };
    try {
      const bio = await (await fetch(ROOT + 'biome.json')).json();
      for (const s of bio.surfaces) this.surf.set(s.id, s);
      for (const k of ['doors', 'arches', 'signs']) for (const x of bio[k]) this.biome[k].set(x.id, x);
    } catch (e) { console.warn('no biome pack art', e); }
    return this;
  }

  /** Surface ids of one kind ('bark', 'leaves', 'plank'), optionally for one species. */
  ofKind(kind, species = null) {
    return [...this.surf.values()].filter((s) => s.kind === kind && (!species || s.species === species)).map((s) => s.id);
  }

  texture(file, repeat = true) {
    if (this.tex.has(file)) return this.tex.get(file);
    const t = this.loader.load(ROOT + file, () => {
      for (const f of this.waiting.get(file) || []) f(t);
      this.waiting.delete(file);
    });
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.anisotropy = this.maxAniso;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    this.tex.set(file, t);
    return t;
  }

  whenLoaded(file, fn) {
    const t = this.texture(file);
    if (t.image && t.image.width) fn(t);
    else { if (!this.waiting.has(file)) this.waiting.set(file, []); this.waiting.get(file).push(fn); }
  }

  /** A normal map for a texture that is already loaded (a model's own skin). */
  normalFrom(tex, strength = 1.2) {
    const k = tex.uuid + '|' + strength;
    if (this.nrm.has(k)) return this.nrm.get(k);
    const rt = this._normalTarget();
    this.nrm.set(k, rt.texture);
    this._renderNormal(rt, tex.image, strength, tex.flipY, tex.wrapS === THREE.RepeatWrapping);
    return rt.texture;
  }

  _normalTarget() {
    const rt = new THREE.WebGLRenderTarget(4, 4, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false });
    rt.texture.anisotropy = this.maxAniso;
    return rt;
  }

  _renderNormal(rt, img, strength, flipY = true, repeat = true) {
    rt.setSize(img.width * 2, img.height * 2);
    const src = new THREE.Texture(img); // a smooth (linear) copy just for this pass
    src.flipY = flipY;
    src.wrapS = src.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    src.magFilter = src.minFilter = THREE.LinearFilter;
    src.generateMipmaps = false;
    src.needsUpdate = true;
    if (!this.nmPass) {
      this.nmPass = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        vertexShader: NM_VERT, fragmentShader: NM_FRAG, depthTest: false, depthWrite: false,
        uniforms: { src: { value: null }, texel: { value: new THREE.Vector2() }, strength: { value: 1 } } }));
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
  }

  /** A normal map for a texture, rendered on the GPU from its brightness at twice its size. */
  normalMap(file, strength = 1.6) {
    const k = file + '|' + strength;
    if (this.nrm.has(k)) return this.nrm.get(k);
    const rt = this._normalTarget();
    this.nrm.set(k, rt.texture);
    this.whenLoaded(file, (t) => this._renderNormal(rt, t.image, strength));
    return rt.texture;
  }

  /** A lit material for a library surface. `tile` = metres per repeat (the builders put world
   * metres in the UVs and divide by this). */
  material(id, { tile = 2, tint = 0xffffff, emissive = 0x000000, side = THREE.FrontSide, overlay = false, bump = 1 } = {}) {
    const k = `${id}|${tile}|${tint}|${emissive}|${side}|${overlay}|${bump}`;
    if (this.mats.has(k)) return this.mats.get(k);
    const s = this.surf.get(id);
    if (!s) throw new Error('no such surface: ' + id);
    this.used.add(id);
    const map = this.texture(s.file);
    const shiny = SHINY.test(id);
    const m = new THREE.MeshPhongMaterial({ map, color: tint, emissive, side,
      specular: shiny ? 0x383430 : 0x121110, shininess: shiny ? 42 : 12 });
    if (this.normals && bump > 0) {
      m.normalMap = this.normalMap(s.file, /cloth|sail/.test(id) ? 0.8 : 1.6);
      m.normalScale.set(bump, bump);
    }
    if (overlay) { // roads and paving laid over the ground: always win the depth test
      m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4;
    }
    // `tile` metres per repeat vertically; across, scaled by the texture's own aspect so
    // tall strip textures (the castle walls) keep their proportions
    m.userData.tileV = tile;
    m.userData.tileU = tile * (s.size[0] / s.size[1]);
    m.userData.id = id;
    this.mats.set(k, m);
    return m;
  }

  /** The next surface not used yet that passes `pred` (or, once they're all used, any that
   * does): how the dungeon and the houses get through the whole library. */
  take(pred, salt = 0) {
    // one-off floor decals and full-height wall panels are only ever asked for by name
    const all = [...this.surf.values()].filter((s) => s.kind !== 'decal' && !s.wall_set && pred(s));
    const fresh = all.find((s) => !this.used.has(s.id) && !this.reserved?.has(s.id));
    if (fresh) { (this.reserved ??= new Set()).add(fresh.id); return fresh.id; }
    return all.length ? all[Math.abs(salt) % all.length].id : 'castle_slatestone';
  }

  /** The outdoor ground: one material that blends meadow, forest floor and graveyard soil
   * with noise in the shader, so there are no tile seams or squares across the whole map. */
  ground({ village, yard, layers }) {
    const tex = layers.map(([id]) => { this.used.add(id); return this.texture(this.surf.get(id).file); });
    const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x0a0a0a, shininess: 6 });
    m.userData.tileU = m.userData.tileV = 1;
    m.userData.noGlass = true; // out of doors, and its samplers are spoken for
    const tiles = layers.map(([, t]) => t);
    m.onBeforeCompile = (sh) => {
      tex.forEach((t, i) => { sh.uniforms['gT' + i] = { value: t }; });
      sh.uniforms.gYard = { value: new THREE.Vector4(...yard) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vGround;
        ${tex.map((_, i) => `uniform sampler2D gT${i};`).join('\n')}
        uniform vec4 gYard;
        float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float gFbm(vec2 p) { return gNoise(p) * 0.55 + gNoise(p * 2.1 + 9.1) * 0.3 + gNoise(p * 4.3 + 3.7) * 0.15; }
        vec3 gTex(sampler2D t, vec2 p, float tile, float rot) {
          float c = cos(rot), s = sin(rot);
          return texture2D(t, mat2(c, -s, s, c) * p / tile).rgb;
        }`)
        .replace('#include <map_fragment>', `
        vec2 gp = vGround.xz;
        float r = length(gp);
        float n1 = gFbm(gp * 0.03), n2 = gFbm(gp * 0.09 + 17.0), n3 = gFbm(gp * 0.05 + 41.0);
        float village = 1.0 - smoothstep(${(village - 14).toFixed(1)}, ${(village + 12).toFixed(1)}, r + (n1 - 0.5) * 40.0);
        vec2 yc = clamp(gp, gYard.xy, gYard.zw);
        float yard = 1.0 - smoothstep(0.0, 5.0, length(gp - yc) + (n2 - 0.5) * 5.0);
        vec3 grass = mix(gTex(gT0, gp, ${tiles[0].toFixed(2)}, 0.0), gTex(gT1, gp, ${tiles[1].toFixed(2)}, 0.7), smoothstep(0.42, 0.58, n2));
        grass = mix(grass, gTex(gT2, gp, ${tiles[2].toFixed(2)}, 1.9), smoothstep(0.66, 0.74, n1 * 0.5 + n3 * 0.5));
        vec3 forest = mix(gTex(gT3, gp, ${tiles[3].toFixed(2)}, 0.3), gTex(gT4, gp, ${tiles[4].toFixed(2)}, 1.1), smoothstep(0.38, 0.62, n3));
        forest = mix(forest, gTex(gT5, gp, ${tiles[5].toFixed(2)}, 2.3), smoothstep(0.62, 0.72, n2));
        vec3 soil = mix(gTex(gT6, gp, ${tiles[6].toFixed(2)}, 0.0), gTex(gT7, gp, ${tiles[7].toFixed(2)}, 0.9), smoothstep(0.45, 0.6, n1));
        vec3 gc = mix(forest, grass, village);
        gc = mix(gc, soil, yard);
        gc *= 0.82 + 0.36 * gNoise(gp * 0.012 + 3.0);
        diffuseColor.rgb *= gc;`);
    };
    return m;
  }

  sprite(id) { this.usedSprites.add(id); return this.spr.get(id); }
  sprites(category, filter = () => true) {
    return [...this.spr.values()].filter((s) => s.category === category && filter(s));
  }
}
