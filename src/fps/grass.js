// Grass tufts along the frayed edges of the roads, paths and yards, so the meadow grows onto the
// dirt and in between the stones instead of stopping at them. Each tuft is a crossed pair of cards
// with blades drawn pixel by pixel on a small canvas (crisp and low resolution, like everything
// else), all of them one instanced draw, nodding a little in the wind and lit as the ground is.
import * as THREE from 'three';

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** A tuft: two dozen blades, each a pixel wide, leaning a little, dark at the root and paler at the
 * tip, on a 32 x 32 canvas. */
function tuftTexture() {
  const S = 32, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), R = rng(77);
  const root = ['#4b5a2b', '#556630', '#5f7135', '#687a3a'], tip = ['#86944a', '#94a052', '#a3a95c', '#8a9a46'];
  for (let i = 0; i < 30; i++) {
    let x = 3 + R() * 26;
    const lean = (R() - 0.5) * 0.9, h = 9 + R() * 21, a = root[Math.floor(R() * root.length)], b = tip[Math.floor(R() * tip.length)];
    for (let k = 0; k < h; k++) {
      g.fillStyle = k > h * 0.62 ? b : a;
      g.fillRect(Math.round(x), S - 1 - k, 1, 1);
      x += lean * (k / h) * 0.9;
    }
  }
  // into a texture whose clear pixels carry the grass's colour (a canvas keeps them black, and
  // filtering and mipmaps would bleed that black into every one-pixel blade), rows flipped for WebGL
  const src = g.getImageData(0, 0, S, S).data, data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4, o = ((S - 1 - y) * S + x) * 4;
    if (src[i + 3]) data.set([src[i], src[i + 1], src[i + 2], 255], o);
    else data.set([90, 104, 50, 0], o);
  }
  const t = new THREE.DataTexture(data, S, S);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = THREE.Texture.DEFAULT_ANISOTROPY;
  t.needsUpdate = true;
  return t;
}

/** Smooth value noise in 0..1 (the ground shaders' kind of drift). */
function noise2(x, z) {
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return (h(i, j) * (1 - su) + h(i + 1, j) * su) * (1 - sv) + (h(i, j + 1) * (1 - su) + h(i + 1, j + 1) * su) * sv;
}

export class Tufts {
  constructor() {
    this.at = [];              // [x, z, turn, scale, tone]
    this.R = rng(911);         // (its own: the world's draws are left as they were)
    this.time = { value: 0 };
  }

  /** Tufts along both verges of a road through `pts` [[x, z, w?]...], w metres either side of its
   * line, scattered across its frayed band (f metres either side of the verge), one every `every`
   * metres or so; none where clear(x, z) is false. */
  verge(pts, w, f, { every = 0.75, clear = () => true, tint = [1, 1, 1] } = {}) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], wa = pts[i][2] ?? w;
      const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / (len || 1), dz = (bz - az) / (len || 1);
      for (let s = 0; s < len; s += every * (0.6 + this.R() * 0.8)) {
        for (const side of [-1, 1]) {
          const off = side * (wa + f * (this.R() * 1.3 - 0.45)), x = ax + dx * s - dz * off, z = az + dz * s + dx * off;
          if (this.R() < 0.25 || !clear(x, z)) continue;
          this.add(x, z, undefined, tint);
        }
      }
    }
  }

  /** Tufts round a patch's outline [[x, z]...] (the plaza, a yard), f metres either side of it. */
  ring(outline, f, opts = {}) {
    this.verge([...outline, outline[0]].map(([x, z]) => [x, z, 0]), 0, f, opts);
  }

  add(x, z, scale = 0.55 + this.R() * 0.5, tint = [1, 1, 1]) {
    // toned as the ground drifts (its slow light and dark), a little darker than their paint
    const drift = 0.92 + 0.16 * noise2(x * 0.09 + 21, z * 0.09 + 21);
    this.at.push([x, z, this.R() * Math.PI, scale, (0.68 + this.R() * 0.22) * drift, tint]);
  }

  /** All of them into the scene: one instanced mesh. */
  finish(scene) {
    if (!this.at.length) return;
    const quad = (rot) => new THREE.PlaneGeometry(0.55, 0.45).translate(0, 0.225, 0).rotateY(rot);
    const geo = new THREE.BufferGeometry().copy(quad(0));
    const two = [quad(0), quad(Math.PI / 2)];
    const pos = [], uv = [], idx = [];
    two.forEach((q, k) => {
      pos.push(...q.attributes.position.array); uv.push(...q.attributes.uv.array);
      idx.push(...q.index.array.map((i) => i + k * 4));
    });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));   // (lit as the ground: straight up)
    geo.setIndex(idx);
    const mat = new THREE.MeshLambertMaterial({ map: tuftTexture(), alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide });
    mat.defines = { SHARP_MAP: '' };   // (painted pixel by pixel: crisp, engine.js)
    const time = this.time;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTuftTime = time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTuftTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 tw = instanceMatrix[3].xyz;
          #else
            vec3 tw = vec3(0.0);
          #endif
          float tsw = sin(uTuftTime * 1.6 + tw.x * 0.37 + tw.z * 0.29) + 0.4 * sin(uTuftTime * 3.1 + tw.x * 1.3);
          transformed.xz += vec2(1.0, 0.6) * tsw * 0.045 * position.y / 0.45;`);
    };
    mat.customProgramCacheKey = () => 'tufts';
    const mesh = new THREE.InstancedMesh(geo, mat, this.at.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    this.at.forEach(([x, z, r, s, tone, tint], i) => {
      m.compose(new THREE.Vector3(x, 0.01, z), q.setFromAxisAngle(up, r), new THREE.Vector3(s, s * (0.85 + 0.3 * ((i * 7919) % 13) / 13), s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setRGB(tone * tint[0], tone * (0.97 + 0.06 * ((i * 104729) % 7) / 7) * tint[1], tone * 0.92 * tint[2]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    scene.add(mesh);
    this.mesh = mesh;
    return mesh;
  }

  update(t) { this.time.value = t; }
}
