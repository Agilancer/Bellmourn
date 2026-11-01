// The texture library (assets/textures/library.json): tiling surfaces become materials
// (crisp-texelled, repeating) with normal maps the GPU derives from each texture, so torch
// and spell light rakes across every stone and plank; sprites become billboard textures.
// It also keeps track of which surfaces the world has used, so builders can ask for ones
// that haven't been used yet (every Velscour texture ends up somewhere).
import * as THREE from 'three';
import { SHARP_GLSL, crisp, WEBGPU } from './engine.js';
import { drawNormalMap, T, sharpGrad, untiled, untileMask, vnoise, snoise, shared, keyed, ref, sourceOf } from './nodes.js';

const ROOT = 'assets/textures/';
const SHINY = /iron|met_|gold|marble|slate|wet|sewer|ice|glass|polish|lacquer|obsidian|basalt|tile|inlay|salt/;

const NM_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// height = brightness (mortar and cracks are dark, so they sink); Sobel slope -> tangent normal
const NM_FRAG = /* glsl */`
  uniform sampler2D src; uniform vec2 texel; uniform float strength;
  varying vec2 vUv;
  float h1(vec2 o) { return dot(texture2D(src, vUv + o * texel).rgb, vec3(0.299, 0.587, 0.114)); }
  // the height a little blurred first (four taps half a texel apart), so single noisy texels don't
  // each become a bump that catches the light
  float h(vec2 o) { return 0.25 * (h1(o + vec2(-0.5, -0.5)) + h1(o + vec2(0.5, -0.5)) + h1(o + vec2(-0.5, 0.5)) + h1(o + vec2(0.5, 0.5))); }
  void main() {
    float tl = h(vec2(-1.0, 1.0)), t = h(vec2(0.0, 1.0)), tr = h(vec2(1.0, 1.0));
    float l = h(vec2(-1.0, 0.0)), r = h(vec2(1.0, 0.0));
    float bl = h(vec2(-1.0, -1.0)), b = h(vec2(0.0, -1.0)), br = h(vec2(1.0, -1.0));
    float dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
    float dy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
    vec3 n = normalize(vec3(-dx * strength, -dy * strength, 1.0));
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  }`;

/** A ground overlay (a road, a plaza, a yard) whose edge frays into what's under it instead of
 * stopping in a straight line: geo.js lays it with an `edge` running 0 .. 1 across a band
 * `feather` metres either side of its outline, and here that band is broken up by noise at a few
 * sizes and by the texture's own light and dark (cobbles and pebbles hold on furthest; the dirt
 * between them goes first), with the rim a little darker, as trodden edges are. It's blended over
 * the ground, the higher-laid overlays after the lower (geo.js renderOrder). */
function feathered(m, f) {
  m.transparent = true;
  m.depthWrite = false;
  m.userData.feather = f;
  m.userData.noCast = true;
  if (WEBGPU) {   // (one graph per grain and tracks; the track gauge and the tiles are the material's)
    const grain = !!m.userData.grain, tracks = !!m.userData.tracks;
    m.colorNode = featherNode(grain, tracks, m.map);
    keyed(m, `feather${grain ? '-grain' : ''}${tracks ? '-tracks' : ''}`);
    return;
  }
  m.customProgramCacheKey =() => 'feather' + (m.userData.grain ? '-grain' : '') + (m.userData.tracks ? `-tracks${m.userData.tracks}-${m.userData.tileU}-${m.userData.tileV}` : '');
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float edge; varying float vEdge; varying vec2 vFeatherP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvEdge = edge; vFeatherP = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vEdge; varying vec2 vFeatherP;
      float fHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float fNoise(vec2 p) {
        vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
        return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), u.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), u.x), u.y);
      }`)
      .replace('#include <map_fragment>', `
      #ifdef USE_MAP
        // its repeat hidden (engine.js untiled: laid slabs keep their way)
        vec4 sampledDiffuseColor = untiled( map, vMapUv, dFdx( vMapUv ), dFdy( vMapUv ), untileMask( vFeatherP, 11.0 ), ${m.userData.grain ? 'true' : 'false'} );
        ${m.userData.tracks ? `{
          // a road's two wheel tracks (ribbon UVs: u metres across, v along): darker, packed smooth
          // (a coarser mip), wandering a little; a lighter crown between them
          float across = vMapUv.x * ${m.userData.tileU.toFixed(3)}, along = vMapUv.y * ${m.userData.tileV.toFixed(3)};
          float wan = sin(along * 0.31) * 0.12 + sin(along * 0.083 + 1.7) * 0.18;
          float d = abs(abs(across - wan) - ${m.userData.tracks.toFixed(2)});
          float tr = 1.0 - smoothstep(0.12, 0.42, d + (fNoise(vec2(along * 0.9, across * 3.0)) - 0.5) * 0.12);
          vec4 packed = textureLod( map, vMapUv, 3.5 );
          sampledDiffuseColor = mix( sampledDiffuseColor, packed * 0.7, tr * 0.75 );
          sampledDiffuseColor.rgb *= 1.0 + 0.07 * (1.0 - smoothstep(0.3, 0.6, abs(across - wan) / ${m.userData.tracks.toFixed(2)}));
        }` : ''}
        diffuseColor *= sampledDiffuseColor;
      #endif
      {
        // (a long, slow wander, so a road's verge isn't a ruled line with wiggles in it, then finer)
        float fn = fNoise(vFeatherP * 0.16 + 3.1) * 0.42 + fNoise(vFeatherP * 0.55) * 0.3 + fNoise(vFeatherP * 1.9 + 7.3) * 0.18 + fNoise(vFeatherP * 5.3 + 2.1) * 0.1;
        float frel = 0.0;
        #ifdef USE_MAP
          // light against dark a few mips down (whole stones, not single texels), against the
          // picture's average (its last mip)
          frel = dot(textureLod(map, vMapUv, 2.2).rgb - textureLod(map, vMapUv, 16.0).rgb, vec3(0.3333));
        #endif
        // the fray: strongest mid-band, none at its two ends (so it never shows the band's own lines)
        float fe = vEdge + ((fn - 0.5) * 1.25 + clamp(frel, -0.3, 0.3) * 1.5) * 4.0 * vEdge * (1.0 - vEdge);
        diffuseColor.a *= smoothstep(0.42, 0.58, fe);
        diffuseColor.rgb *= mix(0.9, 1.0, smoothstep(0.5, 0.9, fe));
        diffuseColor.rgb *= 0.92 + 0.16 * fNoise(vFeatherP * 0.09 + 23.0);   // (a slow drift of tone: no grid of tiles)
      }`);
  };
}

/** The map sampled by world position along whichever axis the surface faces most (blended at the
 * turns), so rock wraps a boulder without stretching or a seam at every facet. */
function triplanar(m, tile) {
  if (WEBGPU) {   // (as in GLSL, an overlay's own sampling, laid first, stays)
    if (m.colorNode) return;
    m.userData.tri = tile;
    m.colorNode = triNode(m.map);
    keyed(m, 'tri');
    return;
  }
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTriP; varying vec3 vTriN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTriP = (modelMatrix * vec4(transformed, 1.0)).xyz; vTriN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTriP; varying vec3 vTriN;')
      .replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec3 tw = pow(abs(normalize(vTriN)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
        vec3 tp = vTriP / ${tile.toFixed(2)}, tdx = dFdx(tp), tdy = dFdy(tp);   // (gradients outside the branches)
        vec4 triC = vec4(0.0);
        if (tw.x > 0.01) triC += sharpTexelGrad(map, tp.zy, tdx.zy, tdy.zy) * tw.x;
        if (tw.y > 0.01) triC += sharpTexelGrad(map, tp.xz + 0.37, tdx.xz, tdy.xz) * tw.y;
        if (tw.z > 0.01) triC += sharpTexelGrad(map, tp.xy + 0.71, tdx.xy, tdy.xy) * tw.z;
        diffuseColor *= triC;
      #endif`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + `|tri${tile}`;
}

/** Where the picture is red (lava in the cracks of volcanic rock), it gives off light of its own,
 * `k` strong, a little uneven as embers are. */
function glowCracks(m, k) {
  if (WEBGPU) {
    m.userData.cracks = k;
    const g = cracksNode(m.map);
    // (the plain crisp map, as crisp() would draw it, and the glow read off that same sample; over
    // an overlay's or a triplanar's own colour, a plain crisp sample of the map for the glow)
    if (!m.colorNode) m.colorNode = g.color;
    m.emissiveNode = g.emissive;
    keyed(m, 'cracks');
    return;
  }
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      #ifdef USE_MAP
      {
        vec3 cc = sampledDiffuseColor.rgb;
        // (only the cracks: red well above both green and blue, and bright; the rock round them
        // stays rock even in orange torchlight)
        float lava = smoothstep(0.12, 0.3, cc.r - max(cc.g, cc.b)) * smoothstep(0.2, 0.45, cc.r);
        totalEmissiveRadiance += vec3(1.0, 0.25, 0.06) * lava * ${k.toFixed(2)};
      }
      #endif`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + `|cracks${k}`;
}

// ------------------------------------------------------------------ the same in TSL (WebGPU)
// Each kind's graph is made once and shared by every material of its kind (docs/WEBGPU.md rule 1):
// the material's own map comes in through nodes.js shared(), its numbers (track gauge, tiles,
// triplanar repeat, glow) through ref().
const likeKey = (t) => `${t?.colorSpace}|${t?.type}|${t?.minFilter}|${t?.magFilter}`;
/** A zero that builds a shared() texture's own node into the graph, so its picture follows the drawn
 * material whichever of its samples the shader keeps (the samples are copies that read it). */
export const heldTex = (base) => T.float(T.textureSize(base, 0).x).mul(0.0);

const _feather = new Map();
/** feathered()'s colour: the map untiled (and, on a road, its wheel tracks), the edge band frayed by
 * noise and by the picture's own light and dark, the rim darker, a slow drift of tone. */
function featherNode(grain, tracks, like) {
  const key = `${grain}|${tracks}|${likeKey(like)}`;
  if (_feather.has(key)) return _feather.get(key);
  const { Fn, uv: uvOf, dFdx, dFdy, positionWorld, attribute, vec2, vec3, vec4, sin, abs, smoothstep, mix, clamp, dot } = T;
  const base = shared((mat) => mat.map, like);
  const color = ref('color', 'color');
  const g = Fn(() => {
    const uv = uvOf().toVar(), dx = dFdx(uv).toVar(), dy = dFdy(uv).toVar();
    const P = positionWorld.xz.toVar();
    const s = untiled(base, uv, dx, dy, untileMask(P, 11.0).toVar(), grain).toVar();
    if (tracks) {
      // a road's two wheel tracks (ribbon UVs: u metres across, v along): darker, packed smooth
      // (a coarser mip), wandering a little; a lighter crown between them
      const gauge = ref('userData.tracks', 'float', 1), across = uv.x.mul(ref('userData.tileU', 'float', 1)).toVar(), along = uv.y.mul(ref('userData.tileV', 'float', 1)).toVar();
      const wan = sin(along.mul(0.31)).mul(0.12).add(sin(along.mul(0.083).add(1.7)).mul(0.18)).toVar();
      const d = abs(abs(across.sub(wan)).sub(gauge));
      const tr = smoothstep(0.12, 0.42, d.add(vnoise(vec2(along.mul(0.9), across.mul(3.0))).sub(0.5).mul(0.12))).oneMinus();
      const packed = base.sample(uv).level(3.5);
      s.assign(mix(s, packed.mul(0.7), tr.mul(0.75)));
      const crown = smoothstep(0.3, 0.6, abs(across.sub(wan)).div(gauge)).oneMinus().mul(0.07).add(1.0);
      s.assign(vec4(s.rgb.mul(crown), s.a));
    }
    // (a long, slow wander, so a road's verge isn't a ruled line with wiggles in it, then finer)
    const fn = vnoise(P.mul(0.16).add(3.1)).mul(0.42).add(vnoise(P.mul(0.55)).mul(0.3)).add(vnoise(P.mul(1.9).add(7.3)).mul(0.18)).add(vnoise(P.mul(5.3).add(2.1)).mul(0.1));
    // light against dark a few mips down (whole stones, not single texels), against the picture's
    // average (its last mip)
    const frel = dot(base.sample(uv).level(2.2).rgb.sub(base.sample(uv).level(16.0).rgb), vec3(0.3333));
    const e = attribute('edge', 'float').toVar();
    // the fray: strongest mid-band, none at its two ends (so it never shows the band's own lines)
    const fe = e.add(fn.sub(0.5).mul(1.25).add(clamp(frel, -0.3, 0.3).mul(1.5)).mul(4.0).mul(e).mul(e.oneMinus())).toVar();
    const rgb = color.mul(s.rgb).mul(mix(0.9, 1.0, smoothstep(0.5, 0.9, fe))).mul(vnoise(P.mul(0.09).add(23.0)).mul(0.16).add(0.92));
    return vec4(rgb.add(heldTex(base)), s.a.mul(smoothstep(0.42, 0.58, fe)));
  })();
  _feather.set(key, g);
  return g;
}

const _tri = new Map();
/** triplanar()'s colour: the map by world position along each axis the surface faces, blended. */
function triNode(like) {
  const key = likeKey(like);
  if (_tri.has(key)) return _tri.get(key);
  const { Fn, If, dFdx, dFdy, positionWorld, normalWorldGeometry, vec3, vec4, pow, abs, normalize } = T;
  const base = shared((mat) => mat.map, like);
  const color = ref('color', 'color'), tile = ref('userData.tri', 'float', 1);
  const g = Fn(() => {
    const tw0 = pow(abs(normalize(normalWorldGeometry)), vec3(4.0));
    const tw = tw0.div(tw0.x.add(tw0.y).add(tw0.z)).toVar();
    const tp = positionWorld.div(tile).toVar(), tdx = dFdx(tp).toVar(), tdy = dFdy(tp).toVar();   // (gradients outside the branches)
    const c = vec4(0.0).toVar();
    If(tw.x.greaterThan(0.01), () => { c.addAssign(sharpGrad(base, tp.zy, tdx.zy, tdy.zy).mul(tw.x)); });
    If(tw.y.greaterThan(0.01), () => { c.addAssign(sharpGrad(base, tp.xz.add(0.37), tdx.xz, tdy.xz).mul(tw.y)); });
    If(tw.z.greaterThan(0.01), () => { c.addAssign(sharpGrad(base, tp.xy.add(0.71), tdx.xy, tdy.xy).mul(tw.z)); });
    return vec4(c.rgb.mul(color).add(heldTex(base)), c.a);
  })();
  _tri.set(key, g);
  return g;
}

const _cracks = new Map();
/** glowCracks(): the crisp map (as crisp() draws it) and, off the same sample, the lava's light. */
function cracksNode(like) {
  const key = likeKey(like);
  if (_cracks.has(key)) return _cracks.get(key);
  const { uv: uvOf, dFdx, dFdy, vec3, vec4, max, smoothstep, materialEmissive } = T;
  const base = shared((mat) => mat.map, like);
  const u = uvOf();
  const s = sharpGrad(base, u, dFdx(u), dFdy(u));
  s.onObjectUpdate((f) => sourceOf(f).map || undefined);   // (as nodes.js crispColor)
  const cc = s.rgb;
  // (only the cracks: red well above both green and blue, and bright; the rock round them stays
  // rock even in orange torchlight)
  const lava = smoothstep(0.12, 0.3, cc.r.sub(max(cc.g, cc.b))).mul(smoothstep(0.2, 0.45, cc.r));
  const g = {
    color: vec4(s.rgb.mul(ref('color', 'color')).add(heldTex(base)), s.a),
    emissive: materialEmissive.add(vec3(1.0, 0.25, 0.06).mul(lava).mul(ref('userData.cracks', 'float'))),
  };
  _cracks.set(key, g);
  return g;
}

let _grounds = 0;
/** Library.ground() in TSL. Its textures, tiles, tints and the village's size are its own, so it has
 * a graph of its own (there is one such ground); the yard is a uniform, the crater and its glow the
 * material's userData uniforms (crater.js sets them). */
function groundNodes(m, { village, yard, layers, tex }) {
  const { Fn, If, texture, uniform, property, positionWorld, dFdx, dFdy, vec2, vec3, vec4, length, clamp, smoothstep, mix, atan, abs, max, materialEmissive } = T;
  const tn = tex.map((t) => texture(t));
  const gYard = uniform(new THREE.Vector4(...yard)).setGroup(T.renderGroup), gCrater = m.userData.crater, gGlow = m.userData.glow;
  const fbm = (p) => snoise(p).mul(0.55).add(snoise(p.mul(2.1).add(9.1)).mul(0.3)).add(snoise(p.mul(4.3).add(3.7)).mul(0.15));
  const glow = property('float', 'gGroundGlow');   // (worked out with the colour, given off as light)
  const f1 = (v) => +v.toFixed(1), f2 = (v) => +v.toFixed(2), f3 = (v) => +v.toFixed(3);
  m.colorNode = Fn(() => {
    // dx, dy: the world position's screen gradients, worked out once for every layer
    const gp = positionWorld.xz.toVar(), gdx = dFdx(gp).toVar(), gdy = dFdy(gp).toVar();
    const gUm = untileMask(gp, 0.0).toVar();   // (where the second copies show: one mask for every layer)
    // one layer at its own scale and turn, its repeat hidden (untiled), in its tint (the meadow's
    // grasses take a blurrier mip a little sooner: a fine noisy texture otherwise sparkles)
    const L = (i, rot) => {
      const tile = f2(layers[i][1]), c = Math.cos(rot) / tile, s = Math.sin(rot) / tile, soft = i < 3 ? 1.6 : 1;
      const R = (v) => vec2(v.x.mul(c).add(v.y.mul(s)), v.y.mul(c).sub(v.x.mul(s)));
      const k = new THREE.Color(layers[i][2] ?? 0xffffff);
      return untiled(tn[i], R(gp), R(gdx.mul(soft)), R(gdy.mul(soft)), gUm, false).rgb.mul(vec3(f3(k.r), f3(k.g), f3(k.b)));
    };
    const r = length(gp);
    const n1 = fbm(gp.mul(0.03)).toVar(), n2 = fbm(gp.mul(0.09).add(17.0)).toVar(), n3 = fbm(gp.mul(0.05).add(41.0)).toVar();
    const vil = smoothstep(f1(village - 14), f1(village + 12), r.add(n1.sub(0.5).mul(40.0))).oneMinus();
    const yc = clamp(gp, gYard.xy, gYard.zw);
    const yd = smoothstep(0.0, 5.0, length(gp.sub(yc)).add(n2.sub(0.5).mul(5.0))).oneMinus().toVar();
    // the meadow, the forest floor and the grave soil, each drawn only where it shows (the layers
    // within each likewise): mostly two or three textures a pixel, not eight
    const wg = vil.mul(yd.oneMinus()).toVar(), wf = vil.oneMinus().mul(yd.oneMinus()).toVar(), ws = yd;
    const gc = vec3(0.0).toVar();
    If(wg.greaterThan(0.001), () => {
      const a = smoothstep(0.42, 0.58, n2).toVar(), b = smoothstep(0.66, 0.74, n1.mul(0.5).add(n3.mul(0.5))).toVar();
      const c = vec3(0.0).toVar();
      If(a.lessThan(0.999), () => { c.assign(L(0, 0.0)); });
      If(a.greaterThan(0.001), () => { c.assign(mix(c, L(1, 0.7), a)); });
      If(b.greaterThan(0.001), () => { c.assign(mix(c, L(2, 1.9), b)); });
      gc.addAssign(c.mul(wg));
    });
    If(wf.greaterThan(0.001), () => {
      const a = smoothstep(0.38, 0.62, n3).toVar(), b = smoothstep(0.62, 0.72, n2).toVar();
      const c = vec3(0.0).toVar();
      If(a.lessThan(0.999), () => { c.assign(L(3, 0.3)); });
      If(a.greaterThan(0.001), () => { c.assign(mix(c, L(4, 1.1), a)); });
      If(b.greaterThan(0.001), () => { c.assign(mix(c, L(5, 2.3), b)); });
      gc.addAssign(c.mul(wf));
    });
    If(ws.greaterThan(0.001), () => {
      const a = smoothstep(0.45, 0.6, n1).toVar();
      const c = vec3(0.0).toVar();
      If(a.lessThan(0.999), () => { c.assign(L(6, 0.0)); });
      If(a.greaterThan(0.001), () => { c.assign(mix(c, L(7, 0.9), a)); });
      gc.addAssign(c.mul(ws));
    });
    gc.mulAssign(snoise(gp.mul(0.012).add(3.0)).mul(0.36).add(0.82));
    gc.mulAssign(snoise(gp.mul(0.09).add(21.0)).mul(0.16).add(0.92));   // (and a gentler drift every ten metres or so)
    // where Tessariel came down: charred out past the lip, streaked with what was thrown, the floor
    // fused to dark green glass whose cracks still glow (worked out only within its reach: it is
    // nothing beyond, as in GLSL)
    glow.assign(0.0);
    const cq = gp.sub(gCrater.xy).toVar(), cr = length(cq).toVar();
    If(cr.lessThan(max(gCrater.w.add(14.0), gCrater.z.mul(0.62).add(1.5))), () => {
      const cn = fbm(gp.mul(0.31).add(7.0)).toVar();
      const rays = smoothstep(0.62, 0.9, snoise(vec2(atan(cq.y, cq.x).mul(7.0), cr.mul(0.06))).mul(0.7).add(cn.mul(0.5)));
      const scorch = max(smoothstep(gCrater.z.mul(0.85), gCrater.w.add(4.0), cr.add(cn.sub(0.5).mul(9.0))).oneMinus(),
        rays.mul(smoothstep(gCrater.z, gCrater.w.add(14.0), cr).oneMinus())).toVar();
      const ash = mix(vec3(0.07, 0.065, 0.06), vec3(0.24, 0.22, 0.2), snoise(gp.mul(1.9)).mul(0.6).add(cn.mul(0.4)));
      gc.assign(mix(gc, gc.mul(0.18).add(ash), scorch.mul(0.94)));
      const core = smoothstep(gCrater.z.mul(0.25), gCrater.z.mul(0.62), cr.add(cn.sub(0.5).mul(3.0))).oneMinus().toVar();
      gc.assign(mix(gc, vec3(0.04, 0.1, 0.06).add(snoise(gp.mul(4.0)).mul(0.06)), core.mul(0.85)));
      const crack = max(smoothstep(0.002, 0.013, abs(snoise(gp.mul(1.15).add(2.0)).sub(0.5))).oneMinus(),
        smoothstep(0.001, 0.007, abs(snoise(gp.mul(2.7).add(9.0)).sub(0.5))).oneMinus().mul(0.5));
      glow.assign(crack.mul(core).mul(core).mul(gGlow).mul(snoise(gp.mul(0.6).add(1.0)).mul(0.45).add(0.55)));
    });
    return vec4(gc.mul(ref('color', 'color')), 1.0);
  })();
  m.emissiveNode = materialEmissive.add(vec3(0.12, 0.7, 0.26).mul(glow));
  keyed(m, 'ground' + _grounds++);
}

export class Library {
  constructor(renderer, { normals = true } = {}) {
    this.renderer = renderer;
    this.loader = new THREE.TextureLoader();
    this.maxAniso = THREE.Texture.DEFAULT_ANISOTROPY;
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
    // the ground sheets (tools/world/import_ground.py): ten seamless tiles each of snow,
    // flagstones, forest floor, sand, concrete, cobbles, gravel, dirt and grass, as
    // ground_<set>_NN (only ever asked for by name: take() passes them by)
    try {
      const gr = await (await fetch(ROOT + 'ground.json')).json();
      for (const s of gr.surfaces) this.surf.set(s.id, s);
    } catch (e) { console.warn('no ground textures', e); }
    // the October texture packs (tools/world/import_texpacks.py, from the whole cut library in
    // art/_texlib): castle stone, interior walls and floors, natural rock, cliff faces matched to
    // the ground sheets, mythic stone, as surfaces of kind pack_<kind> (asked for by name only)
    try {
      const pk = await (await fetch(ROOT + 'packs.json')).json();
      for (const s of pk.surfaces) this.surf.set(s.id, s);
    } catch (e) { console.warn('no pack textures', e); }
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
    // linear and mipmapped: the texels are kept crisp, and their seams anti-aliased, in the shader
    // (engine.js sharpTexel)
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
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
    // (WebGPU: the same pass as a node material, nodes.js)
    if (WEBGPU) { drawNormalMap(this.renderer, rt, src, 1 / img.width, 1 / img.height, strength); src.dispose(); return; }
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
   * metres in the UVs and divide by this). `tri`: wrapped round the shape by world position
   * (triplanar: rock on a lumpy boulder, no seam at every facet); `matte`: no sheen even where
   * the name says slate or tile; `cracks`: the red in the picture glows (lava in cracked rock). */
  material(id, { tile = 2, tint = 0xffffff, emissive = 0x000000, side = THREE.FrontSide, overlay = false, bump = 1, feather = 0, tracks = 0, tri = false, matte = false, cracks = 0 } = {}) {
    const k = `${id}|${tile}|${tint}|${emissive}|${side}|${overlay}|${bump}|${feather}|${tracks}|${tri}|${matte}|${cracks}`;
    if (this.mats.has(k)) return this.mats.get(k);
    const s = this.surf.get(id);
    if (!s) throw new Error('no such surface: ' + id);
    this.used.add(id);
    const map = this.texture(s.file);
    const shiny = !matte && SHINY.test(id);
    const m = new THREE.MeshPhongMaterial({ map, color: tint, emissive, side,
      specular: shiny ? 0x383430 : 0x121110, shininess: shiny ? 42 : 12 });
    if (this.normals && bump > 0 && !tri) {   // (a derived normal map follows the UVs: not a triplanar's)
      // (gentler than before: at full resolution a strong derived relief read as an emboss filter)
      m.normalMap = this.normalMap(s.file, /cloth|sail/.test(id) ? 0.6 : 1.15);
      const k = feather ? 0.5 : bump;   // (ground overlays: low relief, or the gravel sparkles like static)
      m.normalScale.set(k, k);
    }
    if (overlay || feather) { // roads and paving laid over the ground: always win the depth test
      m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4;
    }
    if (feather) {
      if (/wheel_worn|cart_rut|paving|flagstone|setts|slab/.test(id)) m.userData.grain = true;   // (ruts, laid slabs: mirrored along, never turned)
      if (tracks) m.userData.tracks = tracks;
      feathered(m, feather);
    }
    // `tile` metres per repeat vertically; across, scaled by the texture's own aspect so
    // tall strip textures (the castle walls) keep their proportions
    m.userData.tileV = tile;
    m.userData.tileU = tile * (s.size[0] / s.size[1]);
    m.userData.id = id;
    if (tri) triplanar(m, tile);
    if (cracks) glowCracks(m, cracks);
    crisp(m);
    this.mats.set(k, m);
    return m;
  }

  /** The next surface not used yet that passes `pred` (or, once they're all used, any that
   * does): how the dungeon and the houses get through the whole library. */
  take(pred, salt = 0) {
    // one-off floor decals, full-height wall panels, the ground sheets' and the packs' tiles are
    // only ever asked for by name
    const all = [...this.surf.values()].filter((s) => s.kind !== 'decal' && s.kind !== 'ground' && !String(s.kind).startsWith('pack_') && !s.wall_set && pred(s));
    const fresh = all.find((s) => !this.used.has(s.id) && !this.reserved?.has(s.id));
    if (fresh) { (this.reserved ??= new Set()).add(fresh.id); return fresh.id; }
    return all.length ? all[Math.abs(salt) % all.length].id : 'castle_slatestone';
  }

  /** The outdoor ground: one material that blends meadow, forest floor and graveyard soil
   * with noise in the shader, so there are no tile seams or squares across the whole map.
   * `layers` are [id, metres per repeat, tint?] (a tint as a material's). */
  ground({ village, yard, layers, crater = null }) {
    const tex = layers.map(([id]) => { this.used.add(id); return this.texture(this.surf.get(id).file); });
    const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x0a0a0a, shininess: 6 });
    m.userData.tileU = m.userData.tileV = 1;
    // the crater (crater.js): where it is, and how brightly its floor's cracks burn
    const c4 = new THREE.Vector4(crater?.x ?? 1e5, crater?.z ?? 1e5, crater?.R ?? 1, crater?.reach ?? 1);
    // (WebGPU: TSL uniforms, whose .value the game sets as it did the GLSL's; the render's, not the
    // object's, so a static mesh still sees them change)
    m.userData.crater = WEBGPU ? T.uniform(c4).setGroup(T.renderGroup) : { value: c4 };
    m.userData.glow = WEBGPU ? T.uniform(1).setGroup(T.renderGroup) : { value: 1 };
    m.userData.noGlass = true; // out of doors, and its samplers are spoken for
    if (WEBGPU) { groundNodes(m, { village, yard, layers, tex }); return m; }
    // one layer, sampled at its own scale and turn, in its tint
    // (the meadow's grasses take a blurrier mip a little sooner: a fine noisy texture otherwise
    // sparkles at middle distance)
    const L = (i, rot) => {
      const c = new THREE.Color(layers[i][2] ?? 0xffffff), tint = [c.r, c.g, c.b].map((v) => v.toFixed(3)).join(', '), soft = i < 3 ? ' * 1.6' : '';
      return `gTex(gT${i}, gp, gdx${soft}, gdy${soft}, ${layers[i][1].toFixed(2)}, ${rot}, gUm) * vec3(${tint})`;
    };
    m.onBeforeCompile = (sh) => {
      tex.forEach((t, i) => { sh.uniforms['gT' + i] = { value: t }; });
      sh.uniforms.gYard = { value: new THREE.Vector4(...yard) };
      sh.uniforms.gCrater = m.userData.crater;
      sh.uniforms.gGlow = m.userData.glow;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vGround;
        ${tex.map((_, i) => `uniform sampler2D gT${i};`).join('\n')}
        uniform vec4 gYard, gCrater;
        uniform float gGlow;
        float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float gFbm(vec2 p) { return gNoise(p) * 0.55 + gNoise(p * 2.1 + 9.1) * 0.3 + gNoise(p * 4.3 + 3.7) * 0.15; }
        ${SHARP_GLSL}
        // one layer at its own scale and turn, and again turned half round and shifted, switched by a
        // slow noise so its tiling never lines up into rows (the second only where it shows). dx, dy:
        // the world position's screen gradients, worked out once for every layer
        vec3 gTex(sampler2D t, vec2 p, vec2 dx, vec2 dy, float tile, float rot, float k) {
          mat2 R = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) / tile;
          return untiled(t, R * p, R * dx, R * dy, k, false).rgb;
        }`)
        .replace('#include <map_fragment>', `
        vec2 gp = vGround.xz, gdx = dFdx(gp), gdy = dFdy(gp);
        float gUm = untileMask(gp, 0.0);   // (where the second copies show: one mask for every layer)
        float r = length(gp);
        float n1 = gFbm(gp * 0.03), n2 = gFbm(gp * 0.09 + 17.0), n3 = gFbm(gp * 0.05 + 41.0);
        float village = 1.0 - smoothstep(${(village - 14).toFixed(1)}, ${(village + 12).toFixed(1)}, r + (n1 - 0.5) * 40.0);
        vec2 yc = clamp(gp, gYard.xy, gYard.zw);
        float yard = 1.0 - smoothstep(0.0, 5.0, length(gp - yc) + (n2 - 0.5) * 5.0);
        // the meadow, the forest floor and the grave soil, each drawn only where it shows (the layers
        // within each likewise): mostly two or three textures a pixel, not eight
        float wg = village * (1.0 - yard), wf = (1.0 - village) * (1.0 - yard), ws = yard;
        vec3 gc = vec3(0.0);
        if (wg > 0.001) {
          float a = smoothstep(0.42, 0.58, n2), b = smoothstep(0.66, 0.74, n1 * 0.5 + n3 * 0.5);
          vec3 c = vec3(0.0);
          if (a < 0.999) c = ${L(0, '0.0')};
          if (a > 0.001) c = mix(c, ${L(1, '0.7')}, a);
          if (b > 0.001) c = mix(c, ${L(2, '1.9')}, b);
          gc += c * wg;
        }
        if (wf > 0.001) {
          float a = smoothstep(0.38, 0.62, n3), b = smoothstep(0.62, 0.72, n2);
          vec3 c = vec3(0.0);
          if (a < 0.999) c = ${L(3, '0.3')};
          if (a > 0.001) c = mix(c, ${L(4, '1.1')}, a);
          if (b > 0.001) c = mix(c, ${L(5, '2.3')}, b);
          gc += c * wf;
        }
        if (ws > 0.001) {
          float a = smoothstep(0.45, 0.6, n1);
          vec3 c = vec3(0.0);
          if (a < 0.999) c = ${L(6, '0.0')};
          if (a > 0.001) c = mix(c, ${L(7, '0.9')}, a);
          gc += c * ws;
        }
        gc *= 0.82 + 0.36 * gNoise(gp * 0.012 + 3.0);
        gc *= 0.92 + 0.16 * gNoise(gp * 0.09 + 21.0);   // (and a gentler drift every ten metres or so)
        // where Tessariel came down: charred out past the lip, streaked with what was thrown, the
        // floor fused to dark green glass whose cracks still glow
        vec2 cq = gp - gCrater.xy;
        float cr = length(cq), cn = gFbm(gp * 0.31 + 7.0);
        float scorch = 1.0 - smoothstep(gCrater.z * 0.85, gCrater.w + 4.0, cr + (cn - 0.5) * 9.0);
        float rays = smoothstep(0.62, 0.9, gNoise(vec2(atan(cq.y, cq.x) * 7.0, cr * 0.06)) * 0.7 + cn * 0.5);
        scorch = max(scorch, rays * (1.0 - smoothstep(gCrater.z, gCrater.w + 14.0, cr)));
        vec3 ash = mix(vec3(0.07, 0.065, 0.06), vec3(0.24, 0.22, 0.2), gNoise(gp * 1.9) * 0.6 + cn * 0.4);
        gc = mix(gc, gc * 0.18 + ash, scorch * 0.94);
        float core = 1.0 - smoothstep(gCrater.z * 0.25, gCrater.z * 0.62, cr + (cn - 0.5) * 3.0);
        gc = mix(gc, vec3(0.04, 0.1, 0.06) + 0.06 * gNoise(gp * 4.0), core * 0.85);
        float crack = 1.0 - smoothstep(0.002, 0.013, abs(gNoise(gp * 1.15 + 2.0) - 0.5));
        crack = max(crack, 0.5 * (1.0 - smoothstep(0.001, 0.007, abs(gNoise(gp * 2.7 + 9.0) - 0.5))));
        float vGlow = crack * core * core * gGlow * (0.55 + 0.45 * gNoise(gp * 0.6 + 1.0));
        diffuseColor.rgb *= gc;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.12, 0.7, 0.26) * vGlow;`);
    };
    return m;
  }

  sprite(id) { this.usedSprites.add(id); return this.spr.get(id); }
  sprites(category, filter = () => true) {
    return [...this.spr.values()].filter((s) => s.category === category && filter(s));
  }
}
