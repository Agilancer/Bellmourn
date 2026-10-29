// The people of Bellmourn: men, women and children about the village by day, and the watch
// walking its streets. They're made from the foes' own bodies (no villager models exist yet):
// the robed men from the Hollow Magister (his gaunt grey face warmed back to living skin, his
// robe dyed in homespun browns, greys, blues and greens, his tall hood taken off: under it each
// has his own head of hair, cropped, tonsured, balding or bald, sometimes under a linen coif
// or a felt cap, and his own beard, the magister's long one cut to the chest or the chin, a
// short one, or shaved, in brown, black, red, fair or grey), the women from the Blood
// Witch (her dress and bodice dyed, her hair black, brown, auburn or grey, her witch's hat cut
// down to its brim: a wide straw, felt or linen hat, or cut away altogether), the children from
// either at two-thirds the size, and the watch from the Ashen Templar, sword in hand. Each is
// built a little differently (stout, slight, tall, short), the old stoop and walk slowly, and
// some of the men carry the tools of their work. Nobody's eyes glow.
//
// By day each goes about the village on the streets (a small graph of the roads, the plaza and
// every front door): to the well, the market stalls, the cathedral steps, a neighbour's door,
// and stands a while; two who meet may stop and face each other. At dusk they go home and
// in, and come out again in the morning. Anything dead or hostile close by sends them running
// for their door.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// dyes: [hue (0..1), saturation, value scale] for the cloth; skin tones [h, s, v]
const DYES = { russet: [0.06, 0.55, 0.85], umber: [0.08, 0.45, 0.6], moss: [0.24, 0.35, 0.65], slate: [0.6, 0.18, 0.75],
  woad: [0.6, 0.45, 0.75], oat: [0.11, 0.3, 1.2], madder: [0.98, 0.5, 0.8], sage: [0.3, 0.22, 0.85], ash: [0, 0, 0.9], ochre: [0.12, 0.6, 1.0] };
const SKIN = [[0.07, 0.42, 1.0], [0.06, 0.5, 0.82], [0.07, 0.36, 1.12], [0.05, 0.55, 0.62]];

const HAIR = { black: [0.07, 0.3, 0.09], brown: [0.07, 0.55, 0.26], auburn: [0.03, 0.65, 0.34], fair: [0.11, 0.45, 0.6], grey: [0.08, 0.06, 0.62] };
const HATS = { straw: [0.11, 0.5, 1.5], felt: [0.07, 0.35, 0.75], linen: [0.12, 0.12, 2.0] };   // [h, s, value gain]
const BUILDS = { even: [1, 1], stout: [1.12, 0.95], slight: [0.91, 1.02], tall: [0.98, 1.07], short: [1.02, 0.92] };   // [girth, height]
// a man's head: his beard cut (bind-space height below which it's gone; 0 keeps it whole), his
// hair (which painted parts of the scalp: crown, sides and back), his cap
const BEARDS = { long: 0, chest: 1.44, short: 1.53, goatee: 1.53, moustache: 9, shaved: 9 };
// which painted parts of the lower face each beard covers: [the beard itself, jaw and cheeks, chin, upper lip]
const BEARD_PAINT = { long: [1, 1, 1, 1], chest: [1, 1, 1, 1], short: [1, 1, 1, 1], goatee: [1, 0, 1, 1], moustache: [0, 0, 0, 1], shaved: [0, 0, 0, 0] };
const CROPS = { cropped: [1, 1, 1, 1], tonsure: [0, 0, 1, 1], balding: [0, 0, 0.6, 1], bald: [0, 0, 0, 0] };   // [crown, brow, upper sides, back]
const CAPS = { coif: [0.12, 0.12, 2.0, 0.58, 1.04], felt: [0.07, 0.4, 0.7, 0.42, 1.06], none: null };   // [h, s, v gain, how far down, how loose]
// his skull in the bind pose (its middle and radii) and how far out of it the hood begins
const SKULL = { c: [0, 1.69, -0.01], r: [0.095, 0.12, 0.11], hood: 1.16 };

/** Who lives here: an assortment, the same every time. Each: {body, dye, trim, skin, hair, hat,
 * build, elder, child, tool}. */
function folk(n) {
  let q = 7331;
  const R = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
  const pick = (a) => a[Math.floor(R() * a.length)];
  const dyes = Object.keys(DYES), builds = Object.keys(BUILDS);
  const out = [];
  // the mix: women, men, the old, children
  const kinds = ['woman', 'man', 'woman', 'man', 'child', 'woman', 'man', 'elder', 'woman', 'man', 'child', 'woman', 'man', 'elder', 'child', 'woman', 'man', 'child', 'elder', 'woman', 'child'];
  for (let i = 0; i < n; i++) {
    const k = kinds[i % kinds.length], elder = k === 'elder', child = k === 'child';
    const body = child ? (R() < 0.5 ? 'woman' : 'man') : elder ? (R() < 0.45 ? 'woman' : 'man') : k;
    const dye = pick(dyes);
    let trim = pick(dyes); if (trim === dye) trim = dyes[(dyes.indexOf(dye) + 3) % dyes.length];
    const man = body === 'man';
    out.push({ body, dye, trim, skin: Math.floor(R() * SKIN.length), hair: elder ? 'grey' : pick(['black', 'brown', 'brown', 'auburn', 'fair']),
      hat: body !== 'woman' ? null : pick(child ? ['bare', 'bare', 'linen'] : ['straw', 'straw', 'felt', 'linen', 'bare']),
      beard: !man ? null : child ? 'shaved' : elder ? pick(['long', 'chest', 'chest', 'short']) : pick(['short', 'short', 'goatee', 'moustache', 'chest', 'shaved', 'shaved']),
      crop: !man ? null : child ? 'cropped' : elder ? pick(['balding', 'bald', 'tonsure']) : pick(['cropped', 'cropped', 'cropped', 'tonsure', 'balding']),
      cap: !man ? null : pick(['none', 'none', 'none', 'coif', 'felt']),
      build: child ? 'even' : pick(builds), elder, child, tool: body === 'man' && !child && !elder && R() < 0.5 ? pick(['props/Axe_Bronze', 'props/Pickaxe_Bronze']) : null });
  }
  return out;
}
const BODY = { man: 'sorcerer_a', woman: 'sorcerer_b', guard: 'knight_b' };
const HAT_TOP = 1.78;  // the witch's hat above its brim (bind space) is cut away

const _v = new THREE.Vector3(), _u = new THREE.Vector3();
const hsv = (h, s, v) => { const f = (n) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return new THREE.Color().setRGB(f(5), f(3), f(1), THREE.SRGBColorSpace); };

/** Recolour a body's atlas: its cloth to a dye (a woman's bodice to another), its skin to a
 * living tone, her hair and her hat. */
function recolor(img, body, { dye, trim = dye, skin = 0, hair = 'black', hat = 'straw' }, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, size, size);
  const d = g.getImageData(0, 0, size, size), p = d.data;
  const [dh, ds, dv] = DYES[dye], [kh, ks, kv] = SKIN[skin], [th, ts, tv] = DYES[trim], [hh, hs, hv] = HAIR[hair], [ah, as, av] = HATS[hat] || HATS.straw;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 8) continue;
    const r = p[i] / 255, gg = p[i + 1] / 255, b = p[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), v = mx, s = mx ? (mx - mn) / mx : 0;
    let h = 0;
    if (mx !== mn) h = (mx === r ? (gg - b) / (mx - mn) + (gg < b ? 6 : 0) : mx === gg ? (b - r) / (mx - mn) + 2 : (r - gg) / (mx - mn) + 4) / 6;
    let out = null;
    if (body === 'woman') {
      if ((h > 0.93 || h < 0.035) && s > 0.35) out = [dh, ds * Math.min(1, s * 1.2), Math.min(1, v * dv)];               // the red dress
      else if (h >= 0.035 && h < 0.14 && s > 0.12 && s < 0.65 && v > 0.32) { out = [kh, ks * (0.7 + s * 0.6), Math.min(1, v * kv)]; p[i + 3] = 254; }   // skin (marked: see below)
      else if (h > 0.5 && h < 0.75 && s < 0.16 && v >= 0.16 && v < 0.5) out = [ah, as, Math.min(1, 0.2 + v * av)];   // the hat
      else if (h > 0.5 && h < 0.75 && v < 0.16) out = [hh, hs, Math.min(1, hv * (0.6 + v * 4))];                     // her hair
      else if (h > 0.55 && h < 0.66 && s >= 0.3 && v < 0.4) out = [th, ts, Math.min(1, v * tv * 2.2)];               // the bodice and straps
    } else if (body === 'man') {
      if (h > 0.68 && h < 0.86 && s > 0.3) out = [dh, ds * Math.min(1, s * 1.1), Math.min(1, v * dv * 1.25)];          // the purple robe and hood
      else if (s < 0.2 && v > 0.12 && v < 0.62) out = [kh, ks * 0.85, Math.min(1, (v * 0.9 + 0.12) * kv)];           // grey dead skin: living
      else if (h >= 0.04 && h < 0.16 && s > 0.12 && v > 0.32) { out = [kh, ks, Math.min(1, v * kv)]; p[i + 3] = 254; }   // the tan mottling on it
      else if (h > 0.5 && h < 0.68 && s < 0.5 && v > 0.06 && v < 0.62) out = [kh, ks * 0.9, Math.min(1, (v * 0.8 + 0.1) * kv)];   // and its blue veins
      else if (h > 0.62 && h < 0.98 && v > 0.62 && s < 0.6) out = [0.08, 0.45, 0.22];                                 // his glowing eyes: plain brown
    } else if (body === 'guard') {
      if (h > 0.7 && h < 0.9 && s > 0.25) out = [0.99, 0.62, Math.min(1, v * 0.9)];                                  // the tabard: Bellmourn's crimson
    }
    if (!out) continue;
    const [H, S, V] = out, f = (n) => { const k = (n + H * 6) % 6; return V - V * S * Math.max(0, Math.min(k, 4 - k, 1)); };
    p[i] = f(5) * 255; p[i + 1] = f(3) * 255; p[i + 2] = f(1) * 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  return t;
}

export class Villagers {
  /** foes: the Foes (its bodies and held items are already loaded); ctx: the world. */
  constructor(foes, ctx) {
    this.foes = foes; this.ctx = ctx;
    this.scene = foes.scene; this.physics = ctx.physics;
    this.list = [];
    this.mats = new Map(); this.geos = new Map();
    this.graph = this.streets(ctx);
  }

  // -------------------------------------------------------------- the streets
  /** Nodes along the high street, the east road, round the plaza and before every front door
   * and the village's places, each joined to its neighbours. */
  streets(ctx) {
    const nodes = [], edges = [];
    const add = (x, z, tag = null) => { nodes.push({ x, z, tag, n: [] }); return nodes.length - 1; };
    const link = (a, b) => { if (a !== b && !nodes[a].n.includes(b)) { nodes[a].n.push(b); nodes[b].n.push(a); } };
    const lineOf = (pts) => { let prev = null; for (const [x, z] of pts) { const i = add(x, z); if (prev !== null) link(prev, i); prev = i; } };
    const high = [], east = [];
    for (let z = -44; z <= 96; z += 10) if (Math.abs(z) > 16) high.push([1.4, z]);
    for (let x = -96; x <= 96; x += 10) if (Math.abs(x) > 16) east.push([x, -1.4]);
    lineOf(high.filter(([, z]) => z < 0)); lineOf(high.filter(([, z]) => z > 0));
    lineOf(east.filter(([x]) => x < 0)); lineOf(east.filter(([x]) => x > 0));
    const ring = [];
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; ring.push(add(Math.cos(a) * 14.5, Math.sin(a) * 14.5, 'plaza')); }
    ring.forEach((i, k) => link(i, ring[(k + 1) % ring.length]));
    const near = (x, z, skip = -1) => { let best = -1, bd = 1e9; nodes.forEach((n, i) => { if (i === skip || n.tag === 'door' || n.tag === 'spot') return; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = i; } }); return best; };
    // the four roads meet the plaza
    for (const [x, z] of [[1.4, -24], [1.4, 24], [-24, -1.4], [24, -1.4]]) link(near(x, z), near(x * 0.6, z * 0.6));
    // front doors, and the places people go
    this.homes = [];
    for (const zone of ctx.interiors) {
      if (zone.biome !== 'village' || !zone.door || Math.hypot(zone.door.x, zone.door.z) > 100) continue;
      const i = add(zone.door.x, zone.door.z, 'door');
      link(i, near(zone.door.x, zone.door.z, i));
      nodes[i].zone = zone;
      if (!/Tower|Cathedral|Sacristy|Burnt|Barracks/.test(zone.name)) this.homes.push(i);
    }
    for (const [x, z, what] of [[2.4, 2.4, 'well'], [8.5, 8.5, 'stall'], [-8.5, 8.5, 'stall'], [8.5, -8.5, 'stall'], [-8.5, -8.5, 'stall'], [0, -37, 'steps'], [-5, -37, 'steps'], [5, -37, 'steps']]) {
      const i = add(x, z, 'spot'); nodes[i].what = what;
      link(i, near(x, z, i));
    }
    void edges;
    return nodes;
  }

  route(from, to) {
    const N = this.graph, prev = new Map([[from, -1]]), q = [from];
    while (q.length) { const a = q.shift(); if (a === to) break; for (const b of N[a].n) if (!prev.has(b)) { prev.set(b, a); q.push(b); } }
    if (!prev.has(to)) return [to];
    const path = []; for (let a = to; a !== -1 && a !== from; a = prev.get(a)) path.unshift(a);
    return path;
  }

  nearestNode(x, z) { let best = 0, bd = 1e9; this.graph.forEach((n, i) => { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = i; } }); return best; }

  // -------------------------------------------------------------- bodies
  material(body, look) {
    const key = `${body}|${look.dye}|${look.trim}|${look.skin}|${look.hair}|${look.hat}|${look.crop}|${look.beard}`;
    if (this.mats.has(key)) return this.mats.get(key);
    const src = this.meshOf(BODY[body]).material;
    const map = src.map?.image ? recolor(src.map.image, body, look) : src.map;
    const m = new THREE.MeshPhongMaterial({ map, side: THREE.DoubleSide, alphaTest: 0.5, specular: 0x1c1814, shininess: 14 });
    // the witch's pale bone trim is skin's colour on the atlas: what the recolour marked as skin
    // (alpha 254) that sits on the skirt (below the hips in the bind pose) is cloth of the trim's dye
    if (body !== 'guard') {
      const [th, ts, tv] = DYES[look.trim || look.dye];
      const trim = { value: new THREE.Color().setHSL(th, ts, Math.min(0.75, 0.32 * tv)) };
      // a man's hair and beard are painted over the skin where the geometry's `hair` attribute
      // says (1: beard, 2: the crown of the scalp, 3: its upper sides, 4: the back and lower sides)
      const [hh, hs, hv] = HAIR[look.hair || 'brown'];
      const hairCol = { value: hsv(hh, hs, hv) }, crop = CROPS[look.crop] || [0, 0, 0, 0];
      const on = { value: new THREE.Vector4(...crop) }, bp = BEARD_PAINT[look.beard] || BEARD_PAINT.shaved;
      const beardOn = { value: new THREE.Vector4(...bp) };
      const man = body === 'man';
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTrim = trim; sh.uniforms.uHair = hairCol; sh.uniforms.uHairOn = on; sh.uniforms.uBeardOn = beardOn;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vBY;' + (man ? '\nattribute float hair;\nvarying float vHair;' : ''))
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBY = position.y;' + (man ? ' vHair = hair;' : ''));
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBY;\nuniform vec3 uTrim;' + (man ? '\nvarying float vHair;\nuniform vec3 uHair; uniform vec4 uHairOn, uBeardOn;' : ''))
          .replace('#include <map_fragment>', `#include <map_fragment>
            if (diffuseColor.a > 0.985 && diffuseColor.a < 0.9995 && vBY < ${body === 'woman' ? '1.08' : '1.2'}) diffuseColor.rgb = uTrim * (0.55 + 1.6 * dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)));
            ${man ? `float hk = floor(vHair + 0.5);
            float paint = hk == 1.0 ? uBeardOn.x : hk == 2.0 ? uHairOn.x : hk == 8.0 ? uHairOn.y : hk == 3.0 ? uHairOn.z : hk == 4.0 ? uHairOn.w : hk == 5.0 ? uBeardOn.y : hk == 6.0 ? uBeardOn.z : hk == 7.0 ? uBeardOn.w : 0.0;
            if (hk == 3.0 && uHairOn.z > 0.1 && uHairOn.z < 0.9 && vBY > 1.765) paint = 0.0;   // balding: only low on the sides
            if (paint > 0.5) diffuseColor.rgb = uHair * (0.55 + 0.9 * dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)) + 0.25 * fract(sin(dot(floor(vBY * 400.0), 12.9898)) * 43758.5));` : ''}`);
      };
      m.customProgramCacheKey = () => 'villager-' + body;
    }
    if (this.ctx.kit?.normals && map) m.normalMap = this.ctx.kit.normalFrom(map, 0.9);
    this.mats.set(key, m);
    return m;
  }

  meshOf(v) { let m = null; this.foes.gltf[v].scene.traverse((c) => { if (c.isSkinnedMesh) m = c; }); return m; }

  /** The body's geometry, shared: the woman's without the cone of her hat (bare: without its
   * brim either). */
  geometry(body, bare = false, beard = 'long') {
    const gk = body + (bare ? '|bare' : '') + (body === 'man' ? '|' + beard : '');
    if (this.geos.has(gk)) return this.geos.get(gk);
    const mesh = this.meshOf(BODY[body]), src = mesh.geometry;
    let geo = src;
    if (body === 'man') geo = this.manGeometry(mesh, beard);
    if (body === 'woman') {
      geo = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(src.attributes)) geo.setAttribute(k, a);
      const P = src.attributes.position, idx = src.index.array, keep = [];
      // the brim: what of the head stands out wide of it, above the brow
      const head = mesh.skeleton.bones.findIndex((b) => b.name === 'head'), SI = src.attributes.skinIndex, SW = src.attributes.skinWeight;
      const onHead = (i) => { let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; best = SI.getComponent(i, k); } } return best === head; };
      const hc = new THREE.Vector2(); let hn = 0;
      for (let i = 0; i < P.count; i++) if (P.getY(i) > 1.55 && P.getY(i) < 1.68 && onHead(i)) { hc.x += P.getX(i); hc.y += P.getZ(i); hn++; }
      if (hn) hc.divideScalar(hn);
      const brim = (i) => P.getY(i) > 1.68 && Math.hypot(P.getX(i) - hc.x, P.getZ(i) - hc.y) > 0.112 && onHead(i);
      const gone = (i) => P.getY(i) > HAT_TOP || (bare && brim(i));
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t], b = idx[t + 1], c = idx[t + 2];
        if (bare ? gone(a) + gone(b) + gone(c) >= 2 : gone(a) && gone(b) && gone(c)) continue;
        keep.push(a, b, c);
      }
      geo.setIndex(keep);
      geo.boundingSphere = src.boundingSphere; geo.boundingBox = src.boundingBox;
      // where the hat's crown was cut: a straw top over it
      const c = new THREE.Vector3(); let n = 0, r = 0;
      for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y > HAT_TOP - 0.025 && y < HAT_TOP + 0.01) { c.x += P.getX(i); c.y += y; c.z += P.getZ(i); n++; } }
      if (n) {
        c.divideScalar(n);
        for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y > HAT_TOP - 0.025 && y < HAT_TOP + 0.01) r = Math.max(r, Math.hypot(P.getX(i) - c.x, P.getZ(i) - c.z)); }
        this.cap = { c, r: Math.min(0.16, r) };
      }
    }
    this.geos.set(gk, geo);
    return geo;
  }

  /** The magister's body without his hood, his beard cut to `beard`, and a `hair` attribute
   * marking his beard (1), scalp (2 crown, 8 brow, 3 upper sides, 4 back and lower sides) and lower face
   * (5 jaw and cheeks, 6 chin, 7 upper lip) for the paint. */
  manGeometry(mesh, beard) {
    const src = mesh.geometry, P = src.attributes.position, SI = src.attributes.skinIndex, SW = src.attributes.skinWeight;
    if (!this.manClass) {
      const bones = mesh.skeleton.bones, head = bones.findIndex((b) => b.name === 'head'), neck = bones.findIndex((b) => b.name === 'neck');
      const cls = new Uint8Array(P.count), hair = new Float32Array(P.count);   // cls: 0 body, 1 hood, 2 beard
      const [cx, cy, cz] = SKULL.c, [rx, ry, rz] = SKULL.r;
      for (let i = 0; i < P.count; i++) {
        let best = 0, bw = -1;
        for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; best = SI.getComponent(i, k); } }
        if (best !== head && best !== neck) continue;
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const e = Math.hypot((x - cx) / rx, (y - cy) / ry, (z - cz) / rz);
        const inBeard = best === head && y < 1.575 && z > -0.035 && Math.abs(x) < 0.11;
        if (inBeard) { cls[i] = 2; hair[i] = 1; continue; }
        if (e > SKULL.hood) { cls[i] = 1; continue; }
        // the lower face, for beards painted on: jaw and cheeks (5), chin (6), upper lip (7)
        if (best === head && z > -0.005 && y > 1.545 && y < 1.64) {
          if (y > 1.6 && y < 1.628 && z > 0.07 && Math.abs(x) < 0.04) hair[i] = 7;
          else if (y < 1.6 && Math.abs(x) < 0.042) hair[i] = 6;
          else if (y < 1.625) hair[i] = 5;
          continue;
        }
        if (best === head && (y > 1.745 || (z < -0.045 && y > 1.6))) hair[i] = y > 1.775 && Math.abs(x) < 0.06 && z > -0.075 ? 2 : y > 1.745 && z > 0.035 ? 8 : y > 1.745 ? 3 : 4;
      }
      this.manClass = cls;
      this.manHair = new THREE.BufferAttribute(hair, 1);
    }
    const cls = this.manClass, cut = BEARDS[beard] ?? 0, idx = src.index.array, keep = [];
    const hood = (i) => cls[i] === 1, gone = (i) => cls[i] === 2 && cut && P.getY(i) < cut;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (hood(a) || hood(b) || hood(c) || gone(a) + gone(b) + gone(c) >= 2) continue;
      keep.push(a, b, c);
    }
    const geo = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(src.attributes)) geo.setAttribute(k, a);
    geo.setAttribute('hair', this.manHair);
    geo.setIndex(keep);
    geo.boundingSphere = src.boundingSphere; geo.boundingBox = src.boundingBox;
    return geo;
  }

  /** A cap over a man's skull, from his crown down `down` of the way to his chin. */
  manCap(hb, sk, kind) {
    const [h, s, v, down, loose] = CAPS[kind];
    const geo = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * down);
    const cap = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: new THREE.Color().setHSL(h, s, Math.min(0.8, 0.22 * v)), shininess: 6 }));
    const bind = sk.boneInverses[sk.bones.indexOf(hb)].clone().invert();
    const [cx, cy, cz] = SKULL.c, [rx, ry, rz] = SKULL.r;
    cap.applyMatrix4(bind.invert().multiply(new THREE.Matrix4().compose(new THREE.Vector3(cx, cy + 0.004, cz - 0.012), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, 0, 0)), new THREE.Vector3(rx * 1.06 * loose, ry * 0.98 * loose, rz * 1.06 * loose))));
    cap.castShadow = true;
    hb.add(cap);
  }

  /** A villager of `look` (see folk()) at (x, z), living at graph node `home`. */
  spawn(look, x, z, home) {
    const { body, child } = look;
    const gltf = this.foes.gltf[BODY[body]];
    const root = new THREE.Group();
    const model = cloneSkinned(gltf.scene);
    root.add(model);
    let mesh = null;
    model.traverse((c) => { if (c.isSkinnedMesh) mesh = c; });
    const bare = body === 'woman' && look.hat === 'bare';
    mesh.geometry = this.geometry(body, bare, look.beard || 'long');
    mesh.material = this.material(body, look);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    const bones = {};
    for (const b of mesh.skeleton.bones) bones[b.name] = b;
    if (body === 'man' && look.cap && CAPS[look.cap]) this.manCap(bones.head, mesh.skeleton, look.cap);
    if (body === 'woman' && this.cap && !bare) {
      const sk = mesh.skeleton, hb = bones.head, bind = sk.boneInverses[sk.bones.indexOf(hb)].clone().invert();
      this.capGeo ||= new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
      const [ah, as, av] = HATS[look.hat] || HATS.straw;
      const cap = new THREE.Mesh(this.capGeo, new THREE.MeshPhongMaterial({ color: new THREE.Color().setHSL(ah, as, Math.min(0.8, 0.22 * av)), shininess: 6, side: THREE.DoubleSide }));
      cap.applyMatrix4(bind.invert().multiply(new THREE.Matrix4().compose(this.cap.c.clone().add(_u.set(0, 0.004, 0)), new THREE.Quaternion(), _v.setScalar(this.cap.r + 0.01))));
      hb.add(cap);
    }
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const clip of gltf.animations) if (/^(idle|walk|run)$/.test(clip.name)) actions[clip.name] = mixer.clipAction(clip);
    const [girth, tall] = BUILDS[look.build || 'even'];
    const scale = (child ? 0.62 + Math.random() * 0.1 : 0.95 + Math.random() * 0.06) * (look.elder ? 0.96 : 1);
    root.scale.set(scale * girth, scale * tall, scale * girth);
    const v = { root, model, mesh, bones, mixer, actions, cur: null, child, body, scale, elder: !!look.elder,
      pos: new THREE.Vector3(x, 0, z), yaw: Math.random() * 6.28, path: [], node: this.nearestNode(x, z), home,
      wait: Math.random() * 4, speed: child ? 1.45 : body === 'guard' ? 1.15 : look.elder ? 0.68 : 0.95 + Math.random() * 0.3, inside: false, flee: 0, frame: Math.floor(Math.random() * 3), acc: 0, stuck: 0, last: new THREE.Vector3(x, 0, z) };
    if (look.tool && this.ctx.kit) {   // a woodcutter's axe or a delver's pick in his hand
      const s = this.foes.sockets(BODY[body], 'gripR');
      if (s) { const g = new THREE.Group(); s.m.decompose(g.position, g.quaternion, g.scale); g.add(this.tool(look.tool)); bones[s.bone].add(g); }
    }
    if (body === 'guard') {   // the watch wears its sword
      const it = this.foes.items['arming_sword|bright'] || this.foes.items[Object.keys(this.foes.items).find((k) => /\|bright$/.test(k) && !/kite/.test(k))];
      const s = this.foes.sockets('knight_b', 'gripR');
      if (it && s) { const g = new THREE.Group(); s.m.decompose(g.position, g.quaternion, g.scale); g.add(it.clone()); bones[s.bone].add(g); }
    }
    this.play(v, 'idle');
    mixer.update(Math.random() * 3);
    this.scene.add(root);
    this.list.push(v);
    return v;
  }

  play(v, name, speed = 1) {
    const a = v.actions[name];
    if (!a) return;
    a.timeScale = speed;
    if (v.cur === name) return;
    const prev = v.actions[v.cur];
    a.reset().setEffectiveWeight(1).fadeIn(0.3).play();
    if (prev) prev.fadeOut(0.3);
    v.cur = name;
  }

  /** A kit tool as the hand holds it: the grip at the origin, the haft up the hand's y. */
  tool(id) {
    const obj = this.ctx.kit.mesh(id), g = new THREE.Group(), inner = new THREE.Group();
    inner.add(obj); g.add(inner);
    const b = new THREE.Box3().setFromObject(obj), size = b.getSize(new THREE.Vector3());
    const s = 0.75 / size.y;
    inner.rotation.y = Math.PI / 2; inner.scale.setScalar(s);
    inner.position.set(-(b.min.z + b.max.z) / 2 * s, -(b.min.y + size.y * 0.15) * s, (b.min.x + b.max.x) / 2 * s);
    return g;
  }

  /** Everyone at their door or about the village. */
  populate(n = 21, watch = 4) {
    if (!this.homes.length) return 0;
    folk(n).forEach((look, i) => {
      const home = this.homes[i % this.homes.length], nd = this.graph[home];
      this.spawn(look, nd.x + (Math.random() - 0.5) * 2, nd.z + (Math.random() - 0.5) * 2, home);
    });
    // the watch: four, from the barracks
    const bar = this.graph.findIndex((n) => n.zone && /Barracks/.test(n.zone.name));
    for (let i = 0; i < watch; i++) {
      const n = this.graph[bar >= 0 ? bar : 0];
      const g = this.spawn({ body: 'guard', dye: 'ash', build: ['even', 'stout', 'tall', 'even'][i % 4] }, n.x + i, n.z + 1, bar >= 0 ? bar : 0);
      g.guard = true;
    }
    return this.list.length;
  }

  // -------------------------------------------------------------- each frame
  update(dt, player, hour, danger) {
    const night = hour < 6.2 || hour > 20.5;
    for (const v of this.list) {
      const dx = player.pos.x - v.pos.x, dz = player.pos.z - v.pos.z, dist = Math.hypot(dx, dz);
      const far = dist > 95 || player.pos.y < -4;
      // home at night (the watch stays out), out again by day; running from danger
      v.flee = Math.max(0, v.flee - dt);
      if (danger && !v.guard && v.flee <= 0 && (v.dt = (v.dt || 0) + dt) > 0.8) {
        v.dt = 0;
        if (danger(v.pos)) { v.flee = 8; v.path = this.route(v.node, v.home); v.wait = 0; }
      }
      const goHome = (night && !v.guard) || v.flee > 0;
      if (v.inside) {
        if (!goHome) { v.inside = false; v.root.visible = true; v.wait = Math.random() * 20; }
        else continue;
      }
      if (goHome && !v.path.length && v.node === v.home && Math.hypot(this.graph[v.home].x - v.pos.x, this.graph[v.home].z - v.pos.z) < 1.2) {
        v.inside = true; v.root.visible = false; continue;
      }
      // choose where next
      if (!v.path.length) {
        v.wait -= dt;
        if (v.wait <= 0) {
          let to;
          if (goHome) to = v.home;
          else if (v.guard) to = Math.floor(Math.random() * this.graph.length);
          else {
            const r = Math.random(), spots = this.graph.map((n, i) => [n, i]).filter(([n]) => n.tag === 'spot' || n.tag === 'plaza');
            to = r < 0.55 ? spots[Math.floor(Math.random() * spots.length)][1] : r < 0.8 ? this.homes[Math.floor(Math.random() * this.homes.length)] : v.home;
          }
          v.path = this.route(v.node, to);
          v.wait = (v.guard ? 2 : 4) + Math.random() * (v.guard ? 4 : 12);
        }
      }
      // walk the path
      let moving = false;
      if (v.path.length) {
        const n = this.graph[v.path[0]];
        const tx = n.x - v.pos.x, tz = n.z - v.pos.z, d = Math.hypot(tx, tz);
        if (d < 0.8) { v.node = v.path.shift(); if (!v.path.length) v.face = this.faceFor(v, n); }
        else {
          const want = Math.atan2(tx, tz);
          let e = want - v.yaw; while (e > Math.PI) e -= Math.PI * 2; while (e < -Math.PI) e += Math.PI * 2;
          v.yaw += Math.max(-dt * 4, Math.min(dt * 4, e));
          const sp = (v.flee > 0 ? 3.2 : v.speed) * Math.max(0.2, Math.cos(Math.min(1.5, Math.abs(e))));
          this.physics.slide(v.pos, Math.sin(v.yaw) * sp * dt, Math.cos(v.yaw) * sp * dt, 0.28, 1.6, 0.45);
          moving = true;
          // stuck against something: give up on this leg and go on to the next node
          v.stuck += dt;
          if (v.stuck > 1.5) { if (v.last.distanceTo(v.pos) < 0.5) { v.node = v.path.shift() ?? v.node; } v.last.copy(v.pos); v.stuck = 0; }
        }
      } else if (v.face != null) {
        let e = v.face - v.yaw; while (e > Math.PI) e -= Math.PI * 2; while (e < -Math.PI) e += Math.PI * 2;
        v.yaw += Math.max(-dt * 2, Math.min(dt * 2, e));
      }
      // two standing close face each other, as if talking
      if (!moving && !v.guard && (v.chatT = (v.chatT || 0) - dt) < 0) {
        v.chatT = 2;
        const o = this.list.find((w) => w !== v && !w.inside && Math.hypot(w.pos.x - v.pos.x, w.pos.z - v.pos.z) < 2.6);
        if (o) v.face = Math.atan2(o.pos.x - v.pos.x, o.pos.z - v.pos.z);
      }
      v.pos.y = this.physics.floorAt(v.pos.x, v.pos.z, v.pos.y + 0.5, 0.25, 0.6);
      if (!Number.isFinite(v.pos.y)) v.pos.y = 0;
      this.play(v, moving ? (v.flee > 0 ? 'run' : 'walk') : 'idle', moving ? (v.flee > 0 ? 1 : v.speed / 1.15) * (v.child ? 1.3 : 1) : 1);
      // you can't walk through them
      if (dist < 0.62 && dist > 1e-4 && Math.abs(player.pos.y - v.pos.y) < 1.5) { player.pos.x = v.pos.x + dx / dist * 0.62; player.pos.z = v.pos.z + dz / dist * 0.62; }
      v.root.visible = !far;
      if (far) continue;
      // animate (less often further off)
      v.acc += dt;
      if (dist < 25 || ++v.frame % (dist < 55 ? 2 : 4) === 0) {
        v.mixer.update(v.acc); v.acc = 0;
        if (v.elder && v.bones.spine) { v.bones.spine.rotateX(0.38); v.bones.neck?.rotateX(-0.2); }   // the old stoop
      }
      v.root.position.copy(v.pos);
      v.root.rotation.y = v.yaw;
    }
  }

  /** Arrived somewhere: face what's there (the well, a stall, the door, the cathedral). */
  faceFor(v, n) {
    if (n.what === 'well') return Math.atan2(-n.x, -n.z);
    if (n.what === 'stall') return Math.atan2(n.x * 1.3 - n.x, n.z * 1.3 - n.z);
    if (n.what === 'steps') return Math.PI;   // north, up at the cathedral
    if (n.tag === 'door' && n.zone) return Math.atan2((n.zone.x0 + n.zone.x1) / 2 - n.x, (n.zone.z0 + n.zone.z1) / 2 - n.z);
    return null;
  }
}
