// Roads and paths of loose stone, laid over the ground: the way a real track looks, not one picture
// repeated down a strip. Under your feet the gravel changes as you go: four of the ground sheets'
// gravels (each its own take on the same grit) lie in long patches whose joins are staggered and
// ragged (where two meet, the lighter stones of either win, stone by stone, so the line between
// them wanders over several metres); the flat rock the gravel has worn off shows through in places,
// most where two gravels meet; trodden earth runs along a wandering middle line where feet and
// hooves go; and the sides fray into the ground under them with noise and the stones' own light and
// dark, each side at its own width, here narrow, there spilling wide. One material for each kind of
// road (for the WebGL renderer, GLSL; for WebGPU, the same in TSL), one mesh for each road, laid on
// the ground's own heights.
import * as THREE from 'three';
import { SHARP_GLSL, WEBGPU } from './engine.js';
import { T, untiled, untileMask, vnoise, settled, keyed } from './nodes.js';
import { TOUCH } from './input.js';

// kind -> its stone: [id, tint] gravels (four), the earth, the flat rock; their repeats in metres
export const ROAD_KINDS = {
  // the Pilgrims' Road up the Sorrowhorn: pale grey grit off the granite
  mountain: { gravel: [['ground_gravel_02', 0xd2ccc2], ['ground_gravel_05', 0xc8c4bc], ['ground_gravel_07', 0xd8d0c4], ['ground_gravel_09', 0xc4c0b8]],
    earth: ['ground_dirt_04', 0x8a8580], flat: ['rock_08_mountain_alpine_granite_3_02', 0xbab8b4], tile: 1.7, earthTile: 2.2, flatTile: 2.6 },
  // the mountain's side paths: more earth than stone, the gravel thinner
  trail: { gravel: [['ground_gravel_01', 0xb4aca0], ['ground_gravel_04', 0xaca498], ['ground_gravel_08', 0xb8b0a2], ['ground_gravel_10', 0xa8a094]],
    earth: ['ground_dirt_02', 0x8a8074], flat: ['rock_08_mountain_alpine_granite_1_05', 0xa8a6a2], tile: 1.5, earthTile: 2.0, flatTile: 2.4, earthy: 0.15, wear: 0.55 },
  // the lowland roads (the Vigil Road): darker grit, damp earth
  lowland: { gravel: [['ground_gravel_07', 0x9a9a9a], ['ground_gravel_03', 0x9c9890], ['ground_gravel_06', 0x949490], ['ground_gravel_10', 0x989690]],
    earth: ['ground_dirt_05', 0x7a7470], flat: ['rock_05_overworld_granite_1_02', 0x8e8c88], tile: 1.5, earthTile: 2.0, flatTile: 2.6, earthy: 0.15 },
};

const col = (c) => { const k = new THREE.Color(c); return [k.r, k.g, k.b]; };
const glslVec3 = (c) => `vec3(${col(c).map((v) => v.toFixed(3)).join(', ')})`;

/** The material of a kind of road (one per kind, shared by every road of that kind). */
export function roadMaterial(lib, kind = 'mountain') {
  const K = ROAD_KINDS[kind];
  const lite = TOUCH;   // (a phone: two gravels, not four)
  const ids = [...K.gravel.slice(0, lite ? 2 : 4), K.earth, K.flat].map(([id]) => (lib.surf.has(id) ? id : 'ground_gravel_03'));
  const tex = ids.map((id) => { lib.used?.add(id); const t = lib.texture(lib.surf.get(id).file); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; });
  const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x0a0a0a, shininess: 6, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  tex.forEach((t, i) => { m['roadT' + i] = t; });   // (as the material's own: engine.js texturesOf uploads them before play)
  m.userData = { noCast: true, noGlass: true, road: kind };
  const nG = lite ? 2 : 4, tints = [...K.gravel.slice(0, nG).map(([, c]) => c), K.earth[1], K.flat[1]], earthy = K.earthy ?? 0;
  if (WEBGPU) { m.colorNode = settled(roadNode(tex, tints, nG, K, earthy)); keyed(m, `road-${kind}-${nG}`); return m; }
  m.customProgramCacheKey = () => `road-${kind}-${nG}`;
  m.onBeforeCompile = (sh) => {
    tex.forEach((t, i) => { sh.uniforms['rT' + i] = { value: t }; });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 road;\nvarying vec2 vRoadP; varying vec2 vRoadE;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRoadP = (modelMatrix * vec4(transformed, 1.0)).xz; vRoadE = road;');
    const G = (i, off) => `untiled(rT${i}, q + ${off}, dq, eq, um, false)`;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vRoadP; varying vec2 vRoadE;
      ${tex.map((_, i) => `uniform sampler2D rT${i};`).join('\n')}
      float rHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float rNoise(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
        return mix(mix(rHash(i), rHash(i + vec2(1.0, 0.0)), u.x), mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), u.x), u.y); }
      ${SHARP_GLSL}`)
      .replace('#include <map_fragment>', `{
        vec2 P = vRoadP, dP = dFdx(P), eP = dFdy(P);
        float um = untileMask(P, 11.0);
        vec2 q = P / ${K.tile.toFixed(2)}, dq = dP / ${K.tile.toFixed(2)}, eq = eP / ${K.tile.toFixed(2)};
        // the gravels in long patches, their joins staggered stone by stone
        float n1 = rNoise(P * 0.031 + 4.1) * 0.7 + rNoise(P * 0.13 + 9.7) * 0.3;
        vec3 g0 = ${G(0, '0.0')}.rgb * ${glslVec3(tints[0])}, g1 = ${G(1, '0.37')}.rgb * ${glslVec3(tints[1])};
        vec3 c = mix(g0, g1, smoothstep(-0.35, 0.35, (n1 - 0.5) * 6.0 + dot(g1 - g0, vec3(0.333)) * 4.0));
        float trans = clamp(1.0 - abs(n1 - 0.5) * 9.0, 0.0, 1.0);
        ${nG > 2 ? `
        float n2 = rNoise(P * 0.027 + 17.3) * 0.7 + rNoise(P * 0.11 + 2.9) * 0.3;
        vec3 g2 = ${G(2, '0.71')}.rgb * ${glslVec3(tints[2])}, g3 = ${G(3, '0.19')}.rgb * ${glslVec3(tints[3])};
        vec3 cb = mix(g2, g3, smoothstep(-0.35, 0.35, (n1 - 0.5) * 6.0 + dot(g3 - g2, vec3(0.333)) * 4.0));
        c = mix(c, cb, smoothstep(-0.35, 0.35, (n2 - 0.5) * 6.0 + dot(cb - c, vec3(0.333)) * 4.0));
        trans = max(trans, clamp(1.0 - abs(n2 - 0.5) * 9.0, 0.0, 1.0));` : ''}
        // the trodden earth along the middle, worn through in stretches (and more of it on an earthy path),
        // the stones lighter than it left lying on it
        float wear = smoothstep(0.45, 0.95, vRoadE.y + (rNoise(P * 0.45 + 41.0) - 0.5) * 0.8) * smoothstep(0.42, 0.78, rNoise(P * 0.07 + 13.0)) * ${(0.85 * (K.wear ?? 1)).toFixed(3)} + ${earthy.toFixed(2)} * rNoise(P * 0.2 + 5.0);
        if (wear > 0.04) {
          vec3 ea = untiled(rT${nG}, P / ${K.earthTile.toFixed(2)} + 0.61, dP / ${K.earthTile.toFixed(2)}, eP / ${K.earthTile.toFixed(2)}, um, false).rgb * ${glslVec3(tints[nG])};
          c = mix(c, ea, smoothstep(-0.35, 0.35, (wear - 0.55) * 3.0 + dot(ea - c, vec3(0.333)) * 3.0));
        }
        // the flat rock showing through, most where two gravels meet; the gravel's light stones over its edges
        float fw = (rNoise(P * 0.19 + 23.0) * 0.6 + rNoise(P * 0.71 + 5.0) * 0.4 - 0.68 + trans * 0.18) * 7.0;
        if (fw > -1.2) {
          vec3 fr = untiled(rT${nG + 1}, P / ${K.flatTile.toFixed(2)} + 0.13, dP / ${K.flatTile.toFixed(2)}, eP / ${K.flatTile.toFixed(2)}, um, false).rgb * ${glslVec3(tints[nG + 1])};
          c = mix(c, fr, smoothstep(-0.3, 0.3, fw + dot(fr - c, vec3(0.333)) * 2.5));
        }
        c *= 0.9 + 0.2 * rNoise(P * 0.05 + 7.0);   // (a slow drift of tone)
        // the sides frayed into the ground: by noise at a few sizes, the stones holding on longest
        float fn = rNoise(P * 0.16 + 3.1) * 0.42 + rNoise(P * 0.55) * 0.3 + rNoise(P * 1.9 + 7.3) * 0.18 + rNoise(P * 5.3 + 2.1) * 0.1;
        float e = vRoadE.x;
        float fe = e + ((fn - 0.5) * 1.25 + clamp(dot(c, vec3(0.333)) - 0.42, -0.3, 0.3) * 1.5) * 4.0 * e * (1.0 - e);
        diffuseColor.a *= smoothstep(0.42, 0.58, fe);
        diffuseColor.rgb *= c * mix(0.86, 1.0, smoothstep(0.5, 0.9, fe));
      }`);
  };
  return m;
}

/** The same in TSL. */
function roadNode(tex, tints, nG, K, earthy) {
  const { Fn, If, texture, attribute, positionWorld, dFdx, dFdy, vec2, vec3, vec4, float, mix, smoothstep, dot, clamp, abs, max } = T;
  const tn = tex.map((t) => texture(t));
  const tint = (c) => vec3(...col(c).map((v) => +v.toFixed(3)));
  const L = vec3(0.333);
  return Fn(() => {
    const P = positionWorld.xz.toVar(), dP = dFdx(P).toVar(), eP = dFdy(P).toVar();
    const um = untileMask(P, 11.0).toVar();
    const at = (i, tile, off) => untiled(tn[i], P.div(tile).add(off), dP.div(tile), eP.div(tile), um, false).rgb;
    const n1 = vnoise(P.mul(0.031).add(4.1)).mul(0.7).add(vnoise(P.mul(0.13).add(9.7)).mul(0.3)).toVar();
    const g0 = at(0, K.tile, 0.0).mul(tint(tints[0])).toVar(), g1 = at(1, K.tile, 0.37).mul(tint(tints[1])).toVar();
    const c = mix(g0, g1, smoothstep(-0.35, 0.35, n1.sub(0.5).mul(6.0).add(dot(g1.sub(g0), L).mul(4.0)))).toVar();
    const trans = clamp(float(1.0).sub(abs(n1.sub(0.5)).mul(9.0)), 0.0, 1.0).toVar();
    if (nG > 2) {
      const n2 = vnoise(P.mul(0.027).add(17.3)).mul(0.7).add(vnoise(P.mul(0.11).add(2.9)).mul(0.3)).toVar();
      const g2 = at(2, K.tile, 0.71).mul(tint(tints[2])).toVar(), g3 = at(3, K.tile, 0.19).mul(tint(tints[3])).toVar();
      const cb = mix(g2, g3, smoothstep(-0.35, 0.35, n1.sub(0.5).mul(6.0).add(dot(g3.sub(g2), L).mul(4.0)))).toVar();
      c.assign(mix(c, cb, smoothstep(-0.35, 0.35, n2.sub(0.5).mul(6.0).add(dot(cb.sub(c), L).mul(4.0)))));
      trans.assign(max(trans, clamp(float(1.0).sub(abs(n2.sub(0.5)).mul(9.0)), 0.0, 1.0)));
    }
    const E = attribute('road', 'vec2').toVar();
    const wear = smoothstep(0.45, 0.95, E.y.add(vnoise(P.mul(0.45).add(41.0)).sub(0.5).mul(0.8))).mul(smoothstep(0.42, 0.78, vnoise(P.mul(0.07).add(13.0)))).mul(0.85 * (K.wear ?? 1))
      .add(vnoise(P.mul(0.2).add(5.0)).mul(earthy)).toVar();
    If(wear.greaterThan(0.04), () => {
      const ea = at(nG, K.earthTile, 0.61).mul(tint(tints[nG])).toVar();
      c.assign(mix(c, ea, smoothstep(-0.35, 0.35, wear.sub(0.55).mul(3.0).add(dot(ea.sub(c), L).mul(3.0)))));
    });
    const fw = vnoise(P.mul(0.19).add(23.0)).mul(0.6).add(vnoise(P.mul(0.71).add(5.0)).mul(0.4)).sub(0.68).add(trans.mul(0.18)).mul(7.0).toVar();
    If(fw.greaterThan(-1.2), () => {
      const fr = at(nG + 1, K.flatTile, 0.13).mul(tint(tints[nG + 1])).toVar();
      c.assign(mix(c, fr, smoothstep(-0.3, 0.3, fw.add(dot(fr.sub(c), L).mul(2.5)))));
    });
    c.mulAssign(vnoise(P.mul(0.05).add(7.0)).mul(0.2).add(0.9));
    const fn = vnoise(P.mul(0.16).add(3.1)).mul(0.42).add(vnoise(P.mul(0.55)).mul(0.3)).add(vnoise(P.mul(1.9).add(7.3)).mul(0.18)).add(vnoise(P.mul(5.3).add(2.1)).mul(0.1));
    const e = E.x;
    const fe = e.add(fn.sub(0.5).mul(1.25).add(clamp(dot(c, L).sub(0.42), -0.3, 0.3).mul(1.5)).mul(4.0).mul(e).mul(e.oneMinus())).toVar();
    return vec4(c.mul(mix(0.86, 1.0, smoothstep(0.5, 0.9, fe))), smoothstep(0.42, 0.58, fe));
  })();
}

// ------------------------------------------------------------------ the road's own shape
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/** Smooth 1D value noise, 0..1. */
function wave(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; }

/** A road along `pts` [[x, z], ...]: a mesh laid on the ground (`heightAt`), `half` metres either side of its
 * line on average, each side's width wandering on its own (here narrow, there spilling wide) and frayed over
 * `fray` metres; trodden earth along a middle line that wanders too. Its `road` attribute carries
 * (edge: 0 at the outer fray, 1 inside; middle: 1 on the trodden line, 0 at the sides). */
export function roadGeometry(pts, { half = 1.9, fray = 0.9, heightAt, lift = 0.05, seed = 1, step = 2.0, spill = 1, wander = 0.4 } = {}) {
  // evenly spaced points (so the width can wander smoothly whatever the line's own spacing)
  const P = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) P.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  P.push(pts[pts.length - 1].slice(0, 2));
  const pos = [], uv = [], rd = [], idx = [], C = 7;
  let total = 0; for (let i = 1; i < P.length; i++) total += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    const [x, z] = P[i], a = P[Math.max(0, i - 2)], b = P[Math.min(P.length - 1, i + 2)];
    if (i) s += Math.hypot(x - P[i - 1][0], z - P[i - 1][1]);
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, ox = -dz / l, oz = dx / l;
    // each side's width: a slow wander, a quicker one, and now and then a spill of stone out over the verge
    const side = (ph) => half * (1 + (wave(s * 0.045 + seed * 7.1 + ph) - 0.5) * wander + (wave(s * 0.19 + seed * 3.3 + ph) - 0.5) * wander * 0.45)
      + Math.max(0, wave(s * 0.021 + seed * 5.7 + ph) - 0.72) * 4.5 * half * spill;
    const wl = side(0), wr = side(91.7), wan = (wave(s * 0.05 + seed * 11.3) - 0.5) * 0.7 * half;
    const f = Math.min(fray, Math.min(wl, wr) * 0.7);
    const ks = [-(wl + f), -(wl - f), -(wl - f) * 0.5 + wan * 0.5, wan, (wr - f) * 0.5 + wan * 0.5, wr - f, wr + f];
    // (its ends fray out into the ground too, over a few metres, ragged as its sides: never a square end)
    const end = Math.min(1, Math.min(s, total - s) / Math.min(3, total * 0.3)), ed = [0, end, end, end, end, end, 0];
    ks.forEach((k, j) => {
      const vx = x + ox * k, vz = z + oz * k;
      pos.push(vx, heightAt(vx, vz) + lift, vz);
      uv.push(k, s);
      rd.push(ed[j], Math.max(0, 1 - Math.abs(k - wan) / Math.max(0.5, k < wan ? wl : wr)));
    });
    if (i) for (let j = 0; j + 1 < C; j++) { const p = (i - 1) * C + j, q = i * C + j; idx.push(p, p + 1, q, p + 1, q + 1, q); }   // (wound to face up)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('road', new THREE.Float32BufferAttribute(rd, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Lay one mesh of `kind` for every line in `lines` ([{pts, half?, fray?, seed?}]) and add it to the scene. */
export function layRoads(ctx, lib, kind, lines, { heightAt, lift = 0.05, order = 1 } = {}) {
  if (!lines.length) return null;
  const geos = lines.map((l, i) => roadGeometry(l.pts, { half: l.half ?? 1.9, fray: l.fray ?? 0.9, heightAt, lift: l.lift ?? lift, seed: l.seed ?? i + 1, spill: l.spill ?? 1, step: l.step ?? 2.0, wander: l.wander ?? 0.4 }));
  const g = geos.length === 1 ? geos[0] : mergeIndexed(geos);
  const m = new THREE.Mesh(g, roadMaterial(lib, kind));
  m.receiveShadow = true; m.castShadow = false; m.renderOrder = order;
  g.computeBoundingSphere();
  ctx.scene.add(m);
  return m;
}

/** Indexed geometries with the same attributes, one after another. */
function mergeIndexed(geos) {
  const names = Object.keys(geos[0].attributes), out = new THREE.BufferGeometry(), idx = [];
  let base = 0;
  for (const g of geos) { for (const i of g.index.array) idx.push(i + base); base += g.attributes.position.count; }
  for (const k of names) {
    const w = geos[0].attributes[k].itemSize, arr = new Float32Array(base * w);
    let o = 0;
    for (const g of geos) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, w));
  }
  out.setIndex(base > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  return out;
}
