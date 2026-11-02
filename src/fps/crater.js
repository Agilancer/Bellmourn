// The crater: where Tessariel came down in the green star and struck one of Velscour's Sworn as he
// walked out of the western wood. It lies in the meadow between the cathedral and the trees: a bowl
// some 26 m across and over 3 m deep, a ridge of thrown-up earth round it, the ground charred and
// streaked out to 40 m, the floor fused into green glass that still glows in its cracks.
//
// Its shape is one height function (craterHeight), added to the village's flat ground by terrain.js,
// so the physics walks in it and everything that asks for the ground's height finds the bowl. The
// village ground leaves the crater's square out (world.js) and the bowl is built here, smooth-shaded,
// in the ground's own material (whose shader chars and lights it: lib.ground's `crater`).
//
// In it: shards of the green star, still burning; smoke and embers; and the knight, or what's left:
// his armour (the Fiend's Panoply, cut into its pieces) scorched and thrown about. The armour can't
// be taken up. His sword, shield and staff can (main.js lays them out for a new game).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WEBGPU, T } from './nodes.js';
import { pointQuads, pointQuad } from './effects.js';

export const CRATER = { x: -74, z: -58, R: 13, depth: 3.4, rim: 1.15, reach: 25, k: 1 };   // k: how far it's formed (0 before he lands)

function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Is (x, z) in the crater's ground (the square the village's own ground leaves out)? */
export const inCraterSquare = (x, z) => Math.abs(x - CRATER.x) < CRATER.reach && Math.abs(z - CRATER.z) < CRATER.reach;
/** Is (x, z) close enough to the crater that nothing should stand or grow there? */
export const nearCrater = (x, z, pad = 3) => Math.hypot(x - CRATER.x, z - CRATER.z) < CRATER.reach + pad;

/** The crater's height at (x, z): 0 outside its reach. */
export function craterHeight(x, z) {
  const dx = x - CRATER.x, dz = z - CRATER.z, d = Math.hypot(dx, dz);
  if (d >= CRATER.reach || !CRATER.k) return 0;
  const { R, depth, rim, reach } = CRATER;
  // a ragged lip: the radius wanders with the angle and a little noise
  const a = Math.atan2(dz, dx);
  const r = d * (1 + 0.06 * Math.sin(a * 3 + 1.3) + 0.04 * Math.sin(a * 7 + 0.4)) + (vnoise(x * 0.35, z * 0.35) - 0.5) * 1.4;
  const t = r / R;
  let h = 0;
  if (t < 1) h -= depth * Math.pow(1 - t * t, 1.2);
  // the ridge of thrown-up earth, and the ejecta beyond it thinning out
  h += rim * Math.exp(-(((r - R) / 3.1) ** 2)) + rim * 0.35 * (1 - smooth(R, reach - 2, r)) * (r > R ? 1 : 0);
  // clods and lumps
  h += (vnoise(x * 0.9 + 3.1, z * 0.9 + 7.7) - 0.5) * 0.28 * (1 - smooth(R * 0.3, reach - 3, r));
  return h * (1 - smooth(reach - 5, reach, d)) * CRATER.k;
}

let bowl = null, groundMat = null;
/** The bowl's ground, in the village ground's own material, smooth-shaded: a mesh of its own, so it
 * can lie flat until the green star comes down (formCrater). */
export function buildCraterGround(scene, ground) {
  groundMat = ground;
  const { x: cx, z: cz, reach } = CRATER, S = 1, N = Math.round(reach * 2 / S);
  const x0 = cx - reach, z0 = cz - reach;
  const H = craterHeight, e = 0.35;
  const P = [], U = [], Nn = [];
  const vert = (x, z) => {
    const y = H(x, z);
    const nx = H(x - e, z) - H(x + e, z), nz = H(x, z - e) - H(x, z + e), l = Math.hypot(nx, 2 * e, nz);
    P.push(x, y, z); U.push(x, -z); Nn.push(nx / l, 2 * e / l, nz / l);
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const xa = x0 + i * S, xb = xa + S, za = z0 + j * S, zb = za + S;
    // two triangles, wound to face up (as Builder.quad's a, b, c / a, c, d with a = (xa, zb))
    vert(xa, zb); vert(xb, zb); vert(xb, za);
    vert(xa, zb); vert(xb, za); vert(xa, za);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(P.length).fill(1), 3));
  g.userData.y = Float32Array.from({ length: P.length / 3 }, (_, i) => P[i * 3 + 1]);
  g.userData.n = Float32Array.from(Nn);
  g.computeBoundingSphere();
  bowl = new THREE.Mesh(g, ground);
  bowl.receiveShadow = true;
  bowl.matrixAutoUpdate = false;
  scene.add(bowl);
  formCrater(CRATER.k);
}

/** Shape the crater k of the way (0: the meadow as it was; 1: the crater): its ground, its char
 * and its glow. The physics follows craterHeight, which reads CRATER.k. */
export function formCrater(k) {
  CRATER.k = k;
  if (bowl) {
    const g = bowl.geometry, pos = g.attributes.position, nrm = g.attributes.normal, y = g.userData.y, n0 = g.userData.n;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, y[i] * k);
      const nx = n0[i * 3] * k, ny = n0[i * 3 + 1], nz = n0[i * 3 + 2] * k, l = Math.hypot(nx, ny, nz) || 1;
      nrm.setXYZ(i, nx / l, ny / l, nz / l);
    }
    pos.needsUpdate = true; nrm.needsUpdate = true;
    g.computeBoundingSphere();
  }
  const u = groundMat?.userData.crater?.value;
  if (u) u.set(k > 0 ? CRATER.x : 1e5, k > 0 ? CRATER.z : 1e5, CRATER.R, CRATER.reach);
}

// ---------------------------------------------------------------------- what lies in it
const flameTex = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const W = 32, Hh = 64, c = document.createElement('canvas');
    c.width = W; c.height = Hh;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(W / 2, Hh * 0.72, 1, W / 2, Hh * 0.6, Hh * 0.55);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(W / 2, 2); g.quadraticCurveTo(W * 0.95, Hh * 0.6, W / 2, Hh - 2); g.quadraticCurveTo(W * 0.05, Hh * 0.6, W / 2, 2); g.fill();
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
})();
export const glowTex = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const S = 64, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    t = new THREE.CanvasTexture(c);
    t.userData.shared = true;   // (used all over: never disposed with any one thing)
    return t;
  };
})();

/** Soft glowing points (embers, fireflies): `size` metres across, the glow texture in each point's own
 * vertex colour, added on. three's PointsMaterial under WebGL; under WebGPU, where a point is drawn a
 * pixel wide, a quad each (effects.js pointQuads), sized as PointsMaterial sizes them, so the code that
 * moves them (geometry.attributes.position / color, setXYZ, needsUpdate) works on either. */
export const glowPoints = (() => {
  const mats = new Map();
  return (geo, size) => {
    if (!WEBGPU) return new THREE.Points(geo, new THREE.PointsMaterial({ size, map: glowTex(), vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    let m = mats.get(size);
    if (!m) {
      const { vec4, attribute, texture, positionView, screenSize } = T;
      const { vertex, coord } = pointQuad(T.float(size).mul(screenSize.y.mul(0.5)).div(positionView.z.negate().max(0.05)));
      m = new THREE.MeshBasicNodeMaterial({ blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
      m.vertexNode = vertex;
      const g = texture(glowTex()).sample(coord);
      m.colorNode = vec4(g.rgb.mul(attribute('color', 'vec3')), g.a);
      mats.set(size, m);
    }
    return new THREE.Mesh(pointQuads(geo), m);
  };
})();

// the knight's armour, cut into its pieces by the bone that carries each triangle
const PIECES = {
  Hips: 'faulds', Abdomen: 'cuirass', Torso: 'cuirass', Chest: 'cuirass', Neck: 'cuirass', Body: 'faulds',
  ShoulderL: 'pauldronL', UpperArmL: 'pauldronL', LowerArmL: 'vambraceL', WristL: 'vambraceL',
  ShoulderR: 'pauldronR', UpperArmR: 'pauldronR', LowerArmR: 'vambraceR', WristR: 'vambraceR',
  UpperLegL: 'cuisseL', LowerLegL: 'greaveL', FootL: 'sabatonL', UpperLegR: 'cuisseR', LowerLegR: 'greaveR', FootR: 'sabatonR',
};
// where each lies (crater-relative x, z, how far it's sunk, its tilt), thrown out from where he stood
const LIE = {
  helm: [-1.8, -6.4, 0.06, 1.2], cuirass: [-6.8, 1.0, 0.2, 1.45], faulds: [2.4, 7.4, 0.05, 1.3], pauldronL: [8.6, -2.2, 0.04, 0.6], pauldronR: [-9.4, -5.8, 0.06, 2.2],
  vambraceL: [11.6, 5.0, 0.03, 1.57], vambraceR: [-3.5, 10.6, 0.04, 1.4], cuisseL: [6.5, -9.4, 0.06, 1.5], cuisseR: [-12.4, 3.4, 0.05, 1.6],
  greaveL: [14.6, -6.8, 0.04, 1.5], greaveR: [-1.4, -12.6, 0.05, 1.55], sabatonL: [10.0, 10.6, 0.02, 0.3], sabatonR: [-15.6, -2.0, 0.03, 2.6],
};

export class Crater {
  /** ctx: the world (scene, physics, smoke later). */
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'crater';
    ctx.scene.add(this.group);
    this.t = 0;
    this.y = (x, z) => craterHeight(CRATER.x + x, CRATER.z + z);
    this.shards();
    this.flamesAndEmbers();
    this.smokeSpots = [[0, 0.6], [-3, 2], [4, -2.5], [-6.8, 1.0], [8, 6]].map(([x, z]) => [CRATER.x + x, this.y(x, z) + 0.3, CRATER.z + z]);
  }

  /** The green star's broken heart: glassy shards standing out of the floor, burning from inside. */
  shards() {
    const geo = new THREE.OctahedronGeometry(1, 0);
    geo.scale(0.35, 1, 0.35);
    const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 2.4, 0.7), toneMapped: false });
    const glass = new THREE.MeshPhongMaterial({ color: 0x0c2a16, emissive: 0x1aff6a, emissiveIntensity: 0.55, specular: 0x9affc0, shininess: 90, flatShading: true });
    const R = (() => { let s = 77; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const n = 26, inner = new THREE.InstancedMesh(geo, glass, n), core = new THREE.InstancedMesh(geo, hot, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = i < 6 ? R() * 1.6 : 1.2 + R() * 6.5;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, s = (i < 6 ? 1.3 : 0.45) * (0.6 + R() * 0.8);
      e.set((R() - 0.5) * 1.1, R() * 6.28, (R() - 0.5) * 1.1);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(CRATER.x + x, this.y(x, z) + s * 0.45, CRATER.z + z), q, new THREE.Vector3(s, s, s));
      inner.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(CRATER.x + x, this.y(x, z) + s * 0.45, CRATER.z + z), q, new THREE.Vector3(s * 0.45, s * 0.8, s * 0.45));
      core.setMatrixAt(i, m);
    }
    core.material.depthWrite = true;
    this.glass = glass;
    inner.castShadow = true;
    this.group.add(core, inner);
  }

  /** Little green flames licking about the floor, and embers rising off it. */
  flamesAndEmbers() {
    this.flames = [];
    const R = (() => { let s = 4242; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    for (let i = 0; i < 14; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 9;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const mat = new THREE.SpriteMaterial({ map: flameTex(), color: new THREE.Color(0.4, 1.6, 0.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
      const s = new THREE.Sprite(mat);
      s.center.set(0.5, 0.08);
      s.position.set(CRATER.x + x, this.y(x, z) - 0.05, CRATER.z + z);
      const k = 0.5 + R() * 0.9;
      s.userData = { k, ph: R() * 10 };
      s.scale.set(k * 0.5, k, 1);
      this.flames.push(s);
      this.group.add(s);
    }
    // embers: points drifting up and fading, sent up again from the floor
    const N = 160, P = new Float32Array(N * 3), C = new Float32Array(N * 3);
    this.emb = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, vy: 0, life: 0, t: 1 + Math.random() }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    this.embers = glowPoints(geo, 0.09);
    this.embers.frustumCulled = false;
    this.group.add(this.embers);
  }

  /** The knight's armour, scorched and thrown about the crater. From the Fiend's Panoply (the
   * Sworn's set), each piece cut out of the set by the bones that carry it, baked as it was worn. */
  async armour() {
    const g = await new GLTFLoader().loadAsync('templates/models/armor/fiend/fiend_m.glb');
    g.scene.updateMatrixWorld(true);
    const parts = new Map();   // piece -> [{geo, mat}]
    g.scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const mat0 = [o.material].flat()[0];
      if (/cloth|sigil/i.test(mat0.name)) return;   // the cloth burned away
      const geo = o.geometry, idx = geo.index, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, pos = geo.attributes.position;
      const bones = o.skeleton.bones;
      const dom = (v) => { let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > bw) { bw = w; best = si.getComponent(v, k); } } return bones[best]?.name || ''; };
      const by = new Map();
      const helm = /^Helm/.test(o.name);
      const n = idx ? idx.count : pos.count;
      for (let t = 0; t < n; t += 3) {
        const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
        let piece = helm ? 'helm' : null;
        if (!piece) {
          let bn = dom(a);
          bn = bn.replace(/^(Index|Middle|Pinky|Ring|Thumb)\d.*?(L|R)(_end)?$/, 'Wrist$2').replace(/_end$/, '');
          if (/^Head/.test(bn)) bn = 'Neck';
          if (/^PT|^Root/.test(bn)) bn = 'Hips';
          piece = PIECES[bn];
        }
        if (!piece) continue;
        if (!by.has(piece)) by.set(piece, []);
        by.get(piece).push(a, b, c);
      }
      // each vertex where the skeleton puts it as it was worn (the set's own units are its bones')
      const at = new Map(), _p = new THREE.Vector3();
      const placed = (v) => {
        if (!at.has(v)) { _p.fromBufferAttribute(pos, v); o.applyBoneTransform(v, _p); _p.applyMatrix4(o.matrixWorld); at.set(v, [_p.x, _p.y, _p.z]); }
        return at.get(v);
      };
      for (const [piece, list] of by) {
        const remap = new Map(), P = [], U = [], I = [];
        for (const v of list) {
          if (!remap.has(v)) {
            remap.set(v, remap.size);
            P.push(...placed(v));
            if (geo.attributes.uv) U.push(geo.attributes.uv.getX(v), geo.attributes.uv.getY(v));
          }
          I.push(remap.get(v));
        }
        const pg = new THREE.BufferGeometry();
        pg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        if (U.length) pg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        pg.setIndex(I);
        pg.computeVertexNormals();
        if (!parts.has(piece)) parts.set(piece, []);
        parts.get(piece).push({ geo: pg, mat: mat0 });
      }
    });
    const mats = new Map();
    const scorch = (m) => {
      if (!mats.has(m)) {
        const c = m.clone();
        c.color = (c.color || new THREE.Color(1, 1, 1)).clone().multiplyScalar(0.62);
        if (c.roughness !== undefined) c.roughness = Math.min(1, (c.roughness ?? 0.6) + 0.2);
        if (c.emissive) { c.emissive = new THREE.Color(0x0c2a10); c.emissiveIntensity = 1; }
        mats.set(m, c);
      }
      return mats.get(m);
    };
    for (const [piece, list] of parts) {
      const at = LIE[piece];
      if (!at) continue;
      const holder = new THREE.Group();
      const box = new THREE.Box3();
      for (const { geo } of list) { geo.computeBoundingBox(); box.union(geo.boundingBox); }
      const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      for (const { geo, mat } of list) {
        geo.translate(-c.x, -c.y, -c.z);
        const m = new THREE.Mesh(geo, scorch(mat));
        m.castShadow = true; m.receiveShadow = true;
        holder.add(m);
      }
      // laid on its side (tilt about x), turned, sunk a little into the soil
      const [x, z, sink, tilt] = at;
      holder.rotation.set(tilt, (x * 1.7 + z) % 6.28, (z * 0.37) % 0.6, 'YXZ');
      const lowest = Math.min(size.x, size.y, size.z) * 0.5;
      holder.position.set(CRATER.x + x, this.y(x, z) + lowest - sink, CRATER.z + z);
      this.group.add(holder);
    }
    // the helm and cuirass smoulder
    return [...parts.keys()];
  }

  update(dt, t, camera) {
    this.t += dt;
    for (const e of this.smokers || []) e.rate = CRATER.k ? 1.6 : 0;   // no smoke till it's made
    const near = CRATER.k > 0 && camera.position.distanceTo(new THREE.Vector3(CRATER.x, 0, CRATER.z)) < 90;
    this.group.visible = near;
    if (!near) return;
    for (const s of this.flames) {
      const u = s.userData, f = 0.75 + 0.25 * Math.sin(t * 9 + u.ph) * Math.sin(t * 5.3 + u.ph * 2) + 0.1 * Math.sin(t * 23 + u.ph);
      s.scale.set(u.k * 0.5 * (0.9 + 0.2 * Math.sin(t * 7 + u.ph)), u.k * f, 1);
      s.material.opacity = 0.6 + 0.4 * f;
    }
    this.glass.emissiveIntensity = 0.45 + 0.25 * Math.sin(t * 1.7) ** 2;
    const P = this.embers.geometry.attributes.position, C = this.embers.geometry.attributes.color;
    this.emb.forEach((e, i) => {
      e.t += dt;
      if (e.t > e.life) {
        const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * 10;
        e.x = CRATER.x + Math.cos(a) * d; e.z = CRATER.z + Math.sin(a) * d; e.y = this.y(e.x - CRATER.x, e.z - CRATER.z) + 0.1;
        e.vy = 0.5 + Math.random() * 1.4; e.life = 2 + Math.random() * 3; e.t = 0; e.g = Math.random() < 0.6;
      }
      e.y += e.vy * dt; e.x += Math.sin(t * 1.3 + i) * dt * 0.3; e.z += Math.cos(t * 1.1 + i * 1.7) * dt * 0.3;
      const k = Math.max(0, 1 - e.t / e.life) * Math.min(1, e.t * 4);
      P.setXYZ(i, e.x, e.y, e.z);
      if (e.g) C.setXYZ(i, 0.4 * k * 2, 2.2 * k, 0.6 * k); else C.setXYZ(i, 2.0 * k, 0.9 * k, 0.2 * k);
    });
    P.needsUpdate = true; C.needsUpdate = true;
  }
}
