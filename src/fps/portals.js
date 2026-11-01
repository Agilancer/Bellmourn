// The portals: the old star-seals. One lies at the heart of every village and before the door of
// every keep, barrow and cave worth the name; step onto one you have woken and it takes you to any
// other you have woken.
//
// Intent (docs/DUNGEON_BUILDING.md):
//  - Who made them: the first priests of the Canticle, who wrote that the Sacred Flame would fall
//    and would need to go where he was needed. They cut a seal into the ground at each such place:
//    a round dais of grey stone on a footing course of blocks, a four-pointed star at its heart
//    (one arm pointed at the way it serves), its rim and its side set with blue stones. They were
//    cut to be walked onto: two low steps (0.2 and 0.4 m) all round.
//  - What happened since: centuries asleep. Moss in the joints, the grass grown up to the footing,
//    the blue gone dull as slate; folk cross them on the way to the well and forget them. They wake under the star-born's feet: walk
//    up to one and the blue floods out from its heart to its rim, and it stays awake.
//  - Its job: travel. Arrive, look about, leave. Nothing walls it in or stands on it.
//  - First view: a low glowing disc in open ground, framed by what it serves (the well, a gate, a
//    door, a cave's mouth); awake, a soft blue column over it and motes rising, and at night its
//    own blue light on the ground about it (one of the flame lights' pool, main.js).
//  - The way off: step down anywhere.
//
// The world is built with the portals' ground left bare (keepPortalsClear: whatever would grow or
// stand there is drawn for and not planted, so the rest of the world comes out as it always has;
// trees keep further back than grass); on the downs the ground is levelled for each first
// (region.js adds the pads). One instanced mesh each for the seals' tops, lips, sides, footings,
// shadows and columns, and one set of points for their motes: seven draw calls for all nine.
import * as THREE from 'three';
import { crisp } from './engine.js';

export const SEAL_R = 2.4;              // the dais's radius (m)
export const SEAL_H = 0.6;              // its top: two steps up (the player steps 0.42)
const FOOT_R = SEAL_R + 0.4, FOOT_H = 0.2;   // the footing course it stands on: the first step
const CHAMFER = 0.09;                   // the top's edge, bevelled
export const PORTAL_PAD = SEAL_R + 1.6; // on the downs: the ground levelled this far round (and eased 10 m beyond)
const CLEAR_R = SEAL_R + 2.4;           // no prop or rock this near
const TREE_CLEAR = 6.5;                 // no tree this near (nor its canopy over the seal)
const PLANT_CLEAR = FOOT_R + 0.35;      // the grass and the forest floor's plants grow up to its foot
const WAKE_R = SEAL_R + 3.6;            // come this near and it wakes
const TEX = 'portal/';
const LIGHT = 0x6fb0ff;
// the side strip's three courses, as v in the picture (portal_edge.webp: rows 0-132 bricks,
// 132-562 the gem frieze, 562-724 bricks, of 724; v counts up from the bottom)
const V_FRIEZE = [1 - 562 / 724, 1 - 132 / 724], V_LOW = [0, 1 - 562 / 724], V_TOP = [1 - 132 / 724, 1];
const EDGE_ASPECT = 1082 / 724;         // the repeat's width over the strip's height

/** Every portal: where it lies, what it serves, and what you face when you arrive there (look:
 * [x, z], or a cave by name). land: the menu's heading it comes under. */
export const PORTALS = [
  // the village: on the square, north of the well, between the well and the cathedral's forecourt
  { id: 'bellmourn', name: 'Bellmourn', where: 'The village square', land: 'Bellmourn and the Darkwood', x: 0, z: -9, look: [0, 4] },
  // east of the lane, before the graveyard's gate
  { id: 'graveyard', name: 'The Bellmourn Graveyard', where: 'Before the graveyard gate', land: 'Bellmourn and the Darkwood', x: 30.5, z: -113, look: [17, -122] },
  // in the keep's clearing, north of the Vigil Road, a stone's throw from the gatehouse
  { id: 'keep', name: 'Blackvigil Keep', where: 'Outside the gatehouse', land: 'Bellmourn and the Darkwood', x: -186, z: -18, look: [-192, 0] },
  // in the delves' clearings, off to one side of the stair-house doors (they face south)
  { id: 'barrow', name: 'The Barrow of Saint Ivo', where: "By the barrow's door", land: 'Bellmourn and the Darkwood', x: -198, z: 105, look: [-205, 99] },
  { id: 'cellars', name: 'The Old Watch Cellars', where: "By the cellars' door", land: 'Bellmourn and the Darkwood', x: 157, z: 196, look: [150, 190] },
  // the hamlet's green, in the fork of its two paths below the miller's (well back from the stream)
  { id: 'millhaven', name: 'Millhaven', where: 'The green at the fork', land: 'The Green Downs', x: 585, z: 8, look: [560, 18], spur: [596, 8] },
  // on the flats below the cliff, twenty-odd metres out from each cave's mouth
  { id: 'gloam', name: 'The Gloamhollow', where: 'Below the cave mouth', land: 'The Green Downs', x: 706, z: 14, look: 'The Gloamhollow' },
  { id: 'grotto', name: 'The Drowned Grotto', where: 'Below the cave mouth', land: 'The Green Downs', x: 700, z: -86, look: 'The Drowned Grotto' },
  { id: 'troll', name: 'The Trollhole', where: 'Below the cave mouth', land: 'The Green Downs', x: 704, z: 144, look: 'The Trollhole' },
];

/** While the world is built: nothing planted on a portal's ground (the trees, the forest floor's
 * scatter, props, grass tufts and their colliders). Each is drawn for as before and only left out,
 * so nothing else in the world moves. Returns the function that ends it. */
export function keepPortalsClear(ctx) {
  const near = (x, z, r) => PORTALS.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < r * r);
  const undo = [];
  // at(args) -> [x, z, how far it keeps back] (or null: not ours to move)
  const wrap = (o, name, at, skip = () => undefined) => {
    if (!o?.[name]) return;
    const f = o[name];
    o[name] = function (...a) { const q = at(a); return q && near(q[0], q[1], q[2]) ? skip.call(this, a, f) : f.apply(this, a); };
    undo.push(() => { o[name] = f; });
  };
  const isTree = (id) => ctx.lib?.spr?.get(id)?.category === 'tree';
  wrap(ctx.bill, 'add', (a) => [a[1], a[3], isTree(a[0]) ? TREE_CLEAR : PLANT_CLEAR]);
  wrap(ctx.props, 'add', (a) => [a[1], a[3], CLEAR_R], (a) => ({ id: a[0], x: a[1], y: a[2], z: a[3], rot: a[4] ?? 0, scale: a[5] ?? 1, off: true }));   // (its caller may keep it: a placement, never placed)
  wrap(ctx.scatter, 'place', (a) => [a[1], a[3], CLEAR_R]);
  wrap(ctx.trees3d, 'add', (a) => [a[1], a[3], TREE_CLEAR]);
  // (a tuft draws its own scale and tone as it's added: added, then taken back, so the rest keep theirs)
  wrap(ctx.tufts, 'add', (a) => [a[0], a[1], FOOT_R + 0.15], function (a, f) { f.apply(this, a); this.at.pop(); });
  wrap(ctx.physics, 'add', (a) => (a[2] === 'tree' || a[2] === 'prop' ? [(a[0][0] + a[1][0]) / 2, (a[0][2] + a[1][2]) / 2, a[2] === 'tree' ? TREE_CLEAR : CLEAR_R] : null),
    (a) => ({ min: a[0], max: a[1], tag: a[2], off: true }));
  return () => { for (const u of undo.reverse()) u(); };
}

// ------------------------------------------------------------------ the shaders' pieces
// the blue in the paint: the seal's stones, its runes and the light in its heart
const BLUE_GLSL = /* glsl */`
  float sealBlue(vec3 c) { return smoothstep(0.06, 0.24, c.b - max(c.r, c.g) * 0.92) * smoothstep(0.18, 0.5, c.b); }
  vec3 sealDull(vec3 c, float m) { float l = dot(c, vec3(0.3, 0.59, 0.11)); vec3 g = mix(c, vec3(l) * vec3(0.92, 0.94, 0.98), 0.65); return mix(g, vec3(l) * vec3(0.7, 0.72, 0.78) * 0.6, m); }
`;
// per seal (instanced): x how far awake (0 asleep .. 1 awake: the blue spreads from the heart),
// y a flash (1 .. 0, on waking and on every jump), z its own phase
const VERT_DECL = 'attribute vec3 aSeal;\nvarying vec3 vSeal;\n';

/** The seal's top: the dull stone wakes from the heart out; awake, the blue glows, the heart's
 * light turns, and a ring of light runs out from the middle with each flash. */
function topMaterial(map, normalMap, time) {
  const m = new THREE.MeshPhongMaterial({ map, normalMap, specular: 0x24242c, shininess: 22, vertexColors: true });
  if (normalMap) m.normalScale.set(0.9, 0.9);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = VERT_DECL + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSeal = aSeal;');
    sh.fragmentShader = 'uniform float uTime;\nvarying vec3 vSeal;\n' + BLUE_GLSL + sh.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
      vec2 sq = vMapUv - 0.5;
      float sr = length(sq) * 2.0;                                     // 0 at the heart, 1 at the rim
      float sAwake = clamp((vSeal.x * 1.3 - sr) / 0.25, 0.0, 1.0);     // (the heart wakes first)
      vec3 sPaint = diffuseColor.rgb;
      float sBlue = sealBlue(sPaint);
      diffuseColor.rgb = mix(sealDull(sPaint, sBlue), sPaint, sAwake);`)
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
      {
        float t = uTime + vSeal.z * 7.0;
        // the heart's light turning: the picture sampled again, swung round the middle (faster near it)
        float sa = t * (0.22 + 0.5 * (1.0 - sr));
        vec2 rq = mat2(cos(sa), -sin(sa), sin(sa), cos(sa)) * sq;
        vec3 sw = texture2D(map, rq + 0.5).rgb;
        float core = 1.0 - smoothstep(0.4, 0.5, sr);
        float swirl = sealBlue(sw) * core;
        float breathe = 0.78 + 0.22 * sin(t * 1.3 - sr * 7.0);
        vec3 glow = sPaint * sBlue * (0.45 + 0.3 * breathe) * (1.0 - core * 0.6) + sw * swirl * 0.5 * breathe;
        // asleep: now and then the faintest glimmer, to be noticed
        float sleep = 0.05 * sBlue * (0.5 + 0.5 * sin(t * 0.7));
        // a flash: a ring of light running out from the heart
        float rd = (sr - (1.0 - vSeal.y) * 1.15) * 7.0;
        float ring = exp(-rd * rd) * vSeal.y;
        totalEmissiveRadiance += glow * sAwake + sleep * (1.0 - sAwake) + vec3(0.35, 0.55, 1.0) * ring * 1.6;
      }`);
  };
  m.customProgramCacheKey = () => 'portal-top';
  return crisp(m);
}

/** The seal's side: the gems of its frieze dull or glowing, twinkling one after another. */
function sideMaterial(map, normalMap, time) {
  const m = new THREE.MeshPhongMaterial({ map, normalMap, specular: 0x1c1c22, shininess: 16 });
  if (normalMap) m.normalScale.set(0.9, 0.9);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = VERT_DECL + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSeal = aSeal;');
    sh.fragmentShader = 'uniform float uTime;\nvarying vec3 vSeal;\n' + BLUE_GLSL + sh.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
      float sAwake = clamp((vSeal.x * 1.3 - 1.0) / 0.25, 0.0, 1.0);
      vec3 sPaint = diffuseColor.rgb;
      float sBlue = sealBlue(sPaint);
      diffuseColor.rgb = mix(sealDull(sPaint, sBlue), sPaint, sAwake);`)
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
      {
        float t = uTime + vSeal.z * 7.0;
        float tw = 0.6 + 0.4 * sin(t * 0.7 + floor(vMapUv.x * 2.0 + 0.5) * 2.4);
        // (and a faint blue in the frieze's stone, so the band isn't black at night: not on the footing)
        float frieze = step(${V_FRIEZE[0].toFixed(4)}, vMapUv.y) * step(vMapUv.y, ${V_FRIEZE[1].toFixed(4)});
        totalEmissiveRadiance += sPaint * sBlue * (tw * 0.5 * sAwake + 0.03 * (1.0 - sAwake) + vSeal.y * 1.2) + vec3(0.01, 0.015, 0.04) * sAwake * frieze;
      }`);
  };
  m.customProgramCacheKey = () => 'portal-side';
  return crisp(m);
}

/** A soft column of blue over an awake seal, streaked and rising, fading out at its top, at its
 * edges, into the fog, and as you step into it. */
function columnMaterial(time, fog) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uFog: fog, uDay: { value: 1 } },
    vertexShader: /* glsl */`
      ${VERT_DECL}
      varying vec2 vUv; varying float vFace, vDist, vNear;
      void main() {
        vUv = uv; vSeal = aSeal;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec4 mv = viewMatrix * w;
        vec3 n = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vFace = abs(dot(n, normalize(-mv.xyz)));
        vDist = length(mv.xyz);
        vNear = length(cameraPosition.xz - c.xz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uDay; uniform vec2 uFog;
      varying vec3 vSeal; varying vec2 vUv; varying float vFace, vDist, vNear;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n1(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main() {
        float t = uTime + vSeal.z * 7.0;
        float v = vUv.y;
        float streak = n1(vec2(vUv.x * 22.0, v * 3.0 - t * 0.9)) * n1(vec2(vUv.x * 9.0 + 3.0, v * 1.5 - t * 0.5));
        float a = (1.0 - v) * (1.0 - v) * smoothstep(0.0, 0.1, v);
        a *= (0.12 + 1.5 * streak * streak) * vFace * vFace * vFace;   // (rays, feathered at the sides: light, not a tube)
        a *= smoothstep(0.7, 2.6, vNear);                        // (standing in it, it's not in your eyes)
        a *= 1.0 - smoothstep(uFog.x, uFog.y, vDist);
        a *= clamp(vSeal.x * 1.6 - 0.6, 0.0, 1.0) * (0.35 + 0.1 * (1.0 - uDay)) + vSeal.y * 0.8;
        gl_FragColor = vec4(vec3(0.32, 0.52, 1.0) * a * 0.8, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

/** Motes rising from the heart of an awake seal, turning as they go. */
function moteMaterial(time, fog, px) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uFog: fog, uPx: px },
    vertexShader: /* glsl */`
      uniform float uTime, uPx; uniform vec2 uFog;
      attribute vec3 aCenter; attribute vec4 aRnd; attribute float aWake;
      varying float vA;
      void main() {
        float life = fract(uTime * aRnd.y + aRnd.x);
        float ang = aRnd.z * 6.2832 + life * (1.5 + aRnd.w * 2.0);
        float rad = position.x * (1.0 - 0.45 * life);
        vec3 p = aCenter + vec3(cos(ang) * rad, 0.1 + life * (1.6 + 2.4 * aRnd.w), sin(ang) * rad);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = clamp((0.035 + 0.05 * aRnd.w) * uPx / max(d, 0.5), 1.0, 12.0);
        // (gone before they'd reach the eye: standing in the seal, they rise about you, not in your face)
        vA = sin(life * 3.14159) * aWake * (1.0 - smoothstep(uFog.x, uFog.y, d)) * smoothstep(1.8, 4.0, d);
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vA;
        gl_FragColor = vec4(vec3(0.55, 0.75, 1.0) * a * 1.4, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

/** The darkening on the ground about its foot, where centuries of rain and shade have sat. */
function shadowMaterial(fog) {
  return new THREE.ShaderMaterial({
    uniforms: { uFog: fog },
    vertexShader: /* glsl */`
      varying float vT, vDist;
      void main() {
        vT = clamp((length(position.xz) - ${(FOOT_R - 0.02).toFixed(2)}) / 0.75, 0.0, 1.0);
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        vDist = length(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec2 uFog; varying float vT, vDist;
      void main() {
        float k = 1.0 - vT;
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.38 * k * k * (1.0 - smoothstep(uFog.x * 0.5, uFog.y * 0.5, vDist)));
      }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
  });
}

// ------------------------------------------------------------------ the shapes
/** Two indexed geometries with the same attributes as one. */
function mergeTwo(a, b) {
  const out = new THREE.BufferGeometry();
  for (const k of Object.keys(a.attributes)) {
    const A = a.attributes[k], B = b.attributes[k], arr = new Float32Array(A.array.length + B.array.length);
    arr.set(A.array); arr.set(B.array, A.array.length);
    out.setAttribute(k, new THREE.BufferAttribute(arr, A.itemSize));
  }
  const na = a.attributes.position.count;
  out.setIndex([...a.index.array, ...[...b.index.array].map((i) => i + na)]);
  return out;
}

const mesh = (pos, nrm, uv, idx, col = null) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
};

/** A wall round the seal from y0 to y1 at radius r: one course of the side strip (v from vr[0] at
 * height vy0 up to vr[1] at y1; below vy0 the picture's edge row carries on) wrapped `reps` times,
 * read left to right from outside; `flare` widens its foot a hair. */
function wallRing(r, y0, y1, vy0, vr, n, reps, flare = 0) {
  const pos = [], nrm = [], uv = [], idx = [];
  const vAt = (y) => vr[0] + (vr[1] - vr[0]) * (y - vy0) / (y1 - vy0);
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    pos.push(c * (r + flare), y0, s * (r + flare), c * r, y1, s * r);
    nrm.push(c, 0.06, s, c, 0.06, s);
    const u = (n - i) / n * reps;
    uv.push(u, vAt(y0), u, vr[1]);
  }
  for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  return mesh(pos, nrm, uv, idx);
}

/** The footing course's top: a ring of blocks between the drum and the footing's edge (the strip's
 * top course laid flat, its bricks running round). */
function footTop(r0, r1, h, n, reps) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), u = i / n * reps;
    pos.push(c * r0, h, s * r0, c * r1, h, s * r1);
    nrm.push(0, 1, 0, 0, 1, 0);
    uv.push(u, V_TOP[0], u, V_TOP[1]);
  }
  for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  return mesh(pos, nrm, uv, idx);
}

/** The top: a disc whose UVs lie on the picture's disc (the picture is centred on it, import_portal.py),
 * all but its outermost CHAMFER, which the bevel turns down over the edge. */
function topGeometry(r, h, n) {
  const g = new THREE.CircleGeometry(r - CHAMFER, n);
  g.rotateX(-Math.PI / 2);
  g.translate(0, h, 0);
  const uv = g.attributes.uv;
  const k = (r - CHAMFER) / r;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + (uv.getX(i) - 0.5) * k, 0.5 + (uv.getY(i) - 0.5) * k);
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(uv.count * 3).fill(1), 3));
  return g;
}

/** The bevel round the top's edge, at 45 degrees: the picture's rim blocks turned down over it,
 * darker where it meets the side (worn and shaded). */
function lipGeometry(r, h, n) {
  const pos = [], nrm = [], uv = [], idx = [], col = [];
  const k = (r - CHAMFER) / r;
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    pos.push(c * (r - CHAMFER), h, s * (r - CHAMFER), c * r, h - CHAMFER, s * r);
    nrm.push(c * 0.7, 0.7, s * 0.7, c * 0.7, 0.7, s * 0.7);
    uv.push(0.5 + c * 0.5 * k, 0.5 - s * 0.5 * k, 0.5 + c * 0.5, 0.5 - s * 0.5);
    col.push(0.94, 0.94, 0.94, 0.68, 0.68, 0.68);
  }
  for (let i = 0; i < n; i++) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  return mesh(pos, nrm, uv, idx, col);
}

const MOTES = 36;   // a seal

// ------------------------------------------------------------------ the portals
export class Portals {
  /** Built after the world (on its levelled ground), before the frame's first draw. */
  constructor(ctx) {
    this.ctx = ctx;
    const { lib, scene, physics } = ctx;
    this.time = { value: 0 };
    this.fog = { value: new THREE.Vector2(30, 300) };
    this.px = { value: 600 };
    this.found = new Set();
    this.standing = null;      // the seal you stand on
    this.onWake = null;        // (main.js: the toast, the sound, the sparks)
    this.noWake = false;       // (tools/portal_shots.js: a sleeping one seen from close)
    this.list = PORTALS.map((d, i) => {
      const y = physics.groundAt(d.x, d.z);
      return { ...d, i, y, wake: 0, flash: 0, seed: (i * 0.618) % 1, light: null };
    });
    // the faces you arrive facing: toward what each serves
    for (const p of this.list) {
      let [lx, lz] = Array.isArray(p.look) ? p.look : [p.x, p.z - 1];
      if (typeof p.look === 'string') { const c = ctx.caves?.find((q) => q.name === p.look); if (c) [lx, lz] = [c.mouth.x, c.mouth.z]; }
      p.yaw = Math.atan2(-(lx - p.x), -(lz - p.z));
    }

    // ---- the meshes: one instance a seal
    const n = this.list.length;
    const topTex = lib.texture(TEX + 'portal_top.webp', false);
    const edgeTex = lib.texture(TEX + 'portal_edge.webp', true);
    edgeTex.wrapT = THREE.ClampToEdgeWrapping;
    const nm = (file) => (lib.normals ? lib.normalMap(TEX + file, 1.0) : null);
    const topNormal = nm('portal_top.webp'), edgeNormal = nm('portal_edge.webp');
    if (topNormal) topNormal.wrapS = topNormal.wrapT = THREE.ClampToEdgeWrapping;
    // each course wrapped round as many whole times as keeps it at the picture's own proportions
    const repsFor = (r, h, vr) => Math.max(1, Math.round((2 * Math.PI * r) / (h / (vr[1] - vr[0]) * EDGE_ASPECT)));
    const friezeH = SEAL_H - CHAMFER - FOOT_H;
    const SEG = 112;
    const state = new Float32Array(n * 3);
    this.state = new THREE.InstancedBufferAttribute(state, 3);
    this.state.setUsage(THREE.DynamicDrawUsage);
    const inst = (geo, mat, { cast = false, receive = true } = {}) => {
      geo.setAttribute('aSeal', this.state);
      const m = new THREE.InstancedMesh(geo, mat, n);
      const M = new THREE.Matrix4();
      this.list.forEach((p, i) => {
        M.makeRotationY(p.yaw); M.setPosition(p.x, p.y, p.z);   // (the star's north arm points at what it serves)
        m.setMatrixAt(i, M);
      });
      m.castShadow = cast; m.receiveShadow = receive;
      m.frustumCulled = false;   // (spread over the whole land: always drawn, four calls in all)
      m.userData.noCull = true;
      scene.add(m);
      return m;
    };
    this.top = inst(topGeometry(SEAL_R, SEAL_H, SEG), topMaterial(topTex, topNormal, this.time));
    this.lip = inst(lipGeometry(SEAL_R, SEAL_H, SEG), this.top.material);
    // the drum's side: the gem frieze, from the footing up to the bevel
    this.side = inst(wallRing(SEAL_R, FOOT_H - 0.03, SEAL_H - CHAMFER, FOOT_H, V_FRIEZE, SEG, repsFor(SEAL_R, friezeH, V_FRIEZE)),
      sideMaterial(edgeTex, edgeNormal, this.time), { cast: true });
    // the footing: a course of blocks (the strip's lower bricks, at their own scale) running 0.15 m
    // into the ground so no ground shows under it, its top a ring of blocks (one geometry, one call)
    const ringReps = Math.max(1, Math.round(2 * Math.PI * (SEAL_R + 0.2) / ((FOOT_R - SEAL_R) / (V_TOP[1] - V_TOP[0]) * EDGE_ASPECT)));
    this.foot = inst(mergeTwo(wallRing(FOOT_R, -0.15, FOOT_H, 0, V_LOW, SEG, repsFor(FOOT_R, FOOT_H, V_LOW), 0.02),
      footTop(SEAL_R - 0.02, FOOT_R, FOOT_H, SEG, ringReps)), this.side.material, { cast: true });
    // the ground darkened about its foot
    const shGeo = new THREE.RingGeometry(FOOT_R - 0.02, FOOT_R + 0.75, 72, 1);
    shGeo.rotateX(-Math.PI / 2); shGeo.translate(0, 0.04, 0);
    this.shade = inst(shGeo, shadowMaterial(this.fog), { receive: false });
    this.shade.renderOrder = 1;   // (after the roads' and the square's overlays)
    const col = new THREE.CylinderGeometry(1.3, 1.0, 2.2, 28, 1, true);   // (opening upward: light rising, not a jet)
    col.translate(0, SEAL_H + 1.1, 0);
    this.column = inst(col, columnMaterial(this.time, this.fog), { receive: false });
    this.column.renderOrder = 2;
    // the motes: their own points, every seal's in one set
    const N = n * MOTES, mp = new Float32Array(N * 3), mc = new Float32Array(N * 3), mr = new Float32Array(N * 4);
    this.moteWake = new THREE.BufferAttribute(new Float32Array(N), 1);
    this.moteWake.setUsage(THREE.DynamicDrawUsage);
    let s = 9001;
    const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    this.list.forEach((p, i) => {
      for (let k = 0; k < MOTES; k++) {
        const j = i * MOTES + k;
        mp[j * 3] = 0.2 + Math.sqrt(R()) * 1.05;   // (the radius it starts at; the shader turns it)
        mc.set([p.x, p.y + SEAL_H, p.z], j * 3);
        mr.set([R(), 0.12 + R() * 0.16, R(), R()], j * 4);
      }
    });
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('aCenter', new THREE.BufferAttribute(mc, 3));
    mg.setAttribute('aRnd', new THREE.BufferAttribute(mr, 4));
    mg.setAttribute('aWake', this.moteWake);
    this.motes = new THREE.Points(mg, moteMaterial(this.time, this.fog, this.px));
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 2;
    scene.add(this.motes);

    // ---- the colliders: the footing and the drum, each as four boxes turned through a quarter (a
    // circle's worth), each a step up from the one below: walked onto from any side
    for (const p of this.list) {
      for (const [r, h] of [[FOOT_R, FOOT_H], [SEAL_R, SEAL_H]]) {
        for (const a of [11.25, 33.75, 56.25, 78.75]) {
          const c = Math.cos(a * Math.PI / 180) * r, sn = Math.sin(a * Math.PI / 180) * r;
          physics.add([p.x - c, p.y - 0.2, p.z - sn], [p.x + c, p.y + h, p.z + sn], 'portal');
        }
      }
    }
    this.overgrow(ctx);
    this.write();
  }

  /** The meadow and the forest floor grown up to each footing (not on the village square, which is
   * swept): grass tufts where the ground is the village's flat, and the downs' and the forest's own
   * plants (built with the world: before the billboards and tufts are finished). */
  overgrow(ctx) {
    const { bill, lib, physics, tufts } = ctx;
    const plants = lib.sprites('scatter', (q) => /fern|leafy_shrub|wildflowers|dry_reeds/.test(q.id)).map((q) => q.id);
    let s = 4242;
    const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (const p of this.list) {
      if (p.id === 'bellmourn') continue;
      if (tufts && Math.abs(p.y) < 0.05) {
        for (let k = 0; k < 26; k++) { const a = R() * Math.PI * 2, r = FOOT_R + 0.04 + R() * 0.55; tufts.add(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r); }
      }
      if (!plants.length || !bill) continue;
      for (let k = 0; k < 7; k++) {
        const a = R() * Math.PI * 2, r = FOOT_R + 0.15 + R() * 0.6, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        bill.add(plants[Math.floor(R() * plants.length)], x, physics.groundAt(x, z), z, 0.45 + R() * 0.3, 0.8 + R() * 0.15);
      }
    }
  }

  /** Wake a seal (quiet: as a save is loaded, no fuss). */
  wake(p, quiet = false) {
    if (!p || this.found.has(p.id)) return;
    this.found.add(p.id);
    if (quiet) { p.wake = 1; p.flash = 0; } else { p.flash = 1; this.onWake?.(p); }
    this.write();
  }

  /** The woken seals, by id (for a save), and back. */
  save() { return [...this.found]; }
  load(ids = []) {
    this.found.clear();
    for (const p of this.list) { p.wake = 0; p.flash = 0; }
    for (const id of ids) this.wake(this.list.find((p) => p.id === id), true);
    this.write();
  }

  /** A flash on a seal (a jump from or to it). */
  flash(p) { if (p) p.flash = 1; }

  /** The seal under (x, z) at feet height y, if you stand on it. */
  under(pos) {
    for (const p of this.list) {
      if ((pos.x - p.x) ** 2 + (pos.z - p.z) ** 2 < (SEAL_R - 0.15) ** 2 && Math.abs(pos.y - (p.y + SEAL_H)) < 0.5) return p;
    }
    return null;
  }

  /** The awake seals' lights, for the flame lights' pool (main.js): [x, y, z, size, own-light] with
   * its colour and strength. */
  get lights() {
    const out = [];
    for (const p of this.list) {
      if (p.wake < 0.3) continue;
      // (over it, not on it: a pool of blue on the ground about it, not a hot spot on its face)
      const l = p.light ||= Object.assign([p.x, p.y + SEAL_H + 1.8, p.z, 0.3, true], { color: LIGHT, portal: p });
      out.push(l);
    }
    return out;
  }

  /** The awake seals for the map. */
  woken() { return this.list.filter((p) => this.found.has(p.id)); }

  write() {
    const s = this.state.array;
    for (const p of this.list) { s[p.i * 3] = p.wake; s[p.i * 3 + 1] = p.flash; s[p.i * 3 + 2] = p.seed; }
    this.state.needsUpdate = true;
    const w = this.moteWake.array;
    for (const p of this.list) w.fill(Math.max(0, Math.min(1, p.wake * 1.5 - 0.5)), p.i * MOTES, (p.i + 1) * MOTES);
    this.moteWake.needsUpdate = true;
  }

  /** Each frame: the time, the waking and flashing, and whether you've come near a sleeping one. */
  update(dt, { player, playing, fog, day = 1, px = 600 }) {
    this.time.value += dt;
    if (fog) this.fog.value.set(fog.near, fog.far);
    this.column.material.uniforms.uDay.value = day;
    this.px.value = px;
    let changed = false;
    for (const p of this.list) {
      const want = this.found.has(p.id) ? 1 : 0;
      if (p.wake !== want) { p.wake = want ? Math.min(1, p.wake + dt / 2.4) : 0; changed = true; }
      if (p.flash > 0) { p.flash = Math.max(0, p.flash - dt / 1.6); changed = true; }
    }
    if (playing && player && !this.noWake) {
      const q = player.pos;
      for (const p of this.list) {
        if (this.found.has(p.id)) continue;
        if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 < WAKE_R * WAKE_R && Math.abs(q.y - p.y) < 4) this.wake(p);
      }
    }
    this.standing = player ? this.under(player.pos) : null;
    if (this.standing && !this.found.has(this.standing.id)) this.standing = null;
    if (changed) this.write();
  }
}

// ------------------------------------------------------------------ the portals' window
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The list of every other portal there is, by land: the woken ones to step through to, the rest
 * greyed (not yet found). o: { ui, onPick(p), onClose() } */
export class PortalMenu {
  constructor(o) {
    this.o = o;
    this.el = el('div', 'panel portals hidden');
    o.ui.append(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  get open() { return !this.el.classList.contains('hidden'); }
  close() { this.el.classList.add('hidden'); }

  show(portals, here) {
    const E = this.el;
    E.innerHTML = '';
    const close = el('button', 'close', '&times;');
    close.onclick = () => { this.close(); this.o.onClose?.(); };
    E.append(close, el('h2', null, 'Portals'));
    E.append(el('div', 'p-here', `You stand on the seal of <b>${esc(here.name)}</b>`));
    const lands = [...new Set(portals.list.map((p) => p.land))];
    let n = 0;
    for (const land of lands) {
      E.append(el('h3', null, esc(land)));
      const list = el('div', 'p-list');
      for (const p of portals.list.filter((q) => q.land === land && q !== here)) {
        const ok = portals.found.has(p.id);
        const row = el(ok ? 'button' : 'div', 'p-row' + (ok ? '' : ' locked'));
        row.innerHTML = `<i class="p-seal"></i><span class="p-name"><b>${esc(ok ? p.name : p.name)}</b><em>${ok ? esc(p.where) : 'Not yet found'}</em></span>${ok ? '<span class="p-go">Travel</span>' : '<span class="p-lock"></span>'}`;
        if (ok) { row.onclick = () => { this.close(); this.o.onPick?.(p); }; n++; }
        list.append(row);
      }
      E.append(list);
    }
    E.append(el('div', 'dim small p-foot', n ? 'Walk up to a portal anywhere in the land to wake it.' : 'No other portal is awake yet. Walk up to one anywhere in the land to wake it.'));
    E.classList.remove('hidden');
  }
}
