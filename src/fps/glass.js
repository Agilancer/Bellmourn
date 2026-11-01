// Stained glass (assets/textures/stained_glass, cut out by tools/world/import_windows.py):
// the window panes, glowing with the daylight behind them, and the light that comes through
// them. Every lit surface inside a building with stained glass traces its line to the sun (or
// the moon); where that line passes through a window, the sunlight reaching the surface takes
// the colour of the glass at that exact point, so each window's picture lands, stretched along
// the light, on whatever the sun falls on: floor, pews, pillars, walls. The shadow map still
// decides what is lit, so pillars and pews throw their shadows through the picture.
import * as THREE from 'three';
import { TOUCH } from './input.js';
import { fogUniforms, WEBGPU, T, ref, keyed } from './nodes.js';

const MAX = 40, ROOMS = 4;
// (WebGPU) the materials patch() has taught; the sun's light colours itself through the windows for
// these only, as the GLSL patch does
const _lit = new WeakSet();

export class StainedGlass {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];  // {id, kind, color, center, right, up, w, h, normal (into the building), rect}
    this.rooms = []; // [min, max] boxes the projected light is worked out in
    this.used = new Set();
    // (WebGPU: shared by every pane, set once a render)
    const U = WEBGPU ? (v) => T.uniform(v).setGroup(T.renderGroup) : (v) => ({ value: v });
    this.glow = U(1.2);
    this.stone = U(0.6);
  }

  async load() {
    const meta = await (await fetch('assets/textures/' + 'stained_glass.json')).json();
    this.meta = meta;
    this.byKind = {};
    for (const w of meta.windows) (this.byKind[w.kind] ??= []).push(w);
    const tex = await new THREE.TextureLoader().loadAsync('assets/textures/' + meta.atlas);
    if (TOUCH) {   // a phone gets it, and the stone mask made from it, at half size: 2048 x 2240 twice was ~50 MB on its GPU
      const half = document.createElement('canvas');
      half.width = tex.image.width / 2; half.height = tex.image.height / 2;
      half.getContext('2d').drawImage(tex.image, 0, 0, half.width, half.height);
      tex.image = half;
    }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    this.atlas = tex;
    // the stone round each window's shape: the atlas with its alpha turned inside out (an
    // alphaMap, read from the green channel)
    const cv = document.createElement('canvas');
    cv.width = tex.image.width; cv.height = tex.image.height;
    const g = cv.getContext('2d');
    g.drawImage(tex.image, 0, 0);
    const px = g.getImageData(0, 0, cv.width, cv.height), d = px.data;
    for (let i = 0; i < d.length; i += 4) { const s = 255 - d[i + 3]; d[i] = d[i + 1] = d[i + 2] = s; d[i + 3] = 255; }
    g.putImageData(px, 0, 0);
    this.stoneMask = new THREE.CanvasTexture(cv);
    this.stoneMask.channel = 1; // read with the window's own UVs; the stone's texture keeps uv
    this.fills = new Map(); // a wall's material -> its copy masked to a window's surround
    this.uniforms = {
      gAtlas: { value: tex }, gCount: { value: 0 }, gSun: { value: new THREE.Vector3(0, 1, 0) }, gBoost: { value: 5 },
      gC: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) }, gR: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
      gU: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) }, gUV: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
      gMin: { value: Array.from({ length: ROOMS }, () => new THREE.Vector3(1e9, 1e9, 1e9)) },
      gMax: { value: Array.from({ length: ROOMS }, () => new THREE.Vector3(-1e9, -1e9, -1e9)) },
    };
    if (WEBGPU) {
      // the light's values as uniforms shared by every lit material (once a render); the windows and
      // rooms, which change only as the world is built, in a little float texture (pack()), so the
      // hundred lit materials don't each carry and upload four arrays of forty
      const R = T.renderGroup, U = this.uniforms;
      U.gCount = T.uniform(0, 'int').setGroup(R);
      U.gSun = T.uniform(new THREE.Vector3(0, 1, 0)).setGroup(R);
      U.gBoost = T.uniform(5).setGroup(R);
      this.table = new THREE.DataTexture(new Float32Array(MAX * 6 * 4), MAX, 6, THREE.RGBAFormat, THREE.FloatType);
      this.table.magFilter = this.table.minFilter = THREE.NearestFilter;
      this.table.generateMipmaps = false;
      this.pack();
    }
    return this;
  }

  /** (WebGPU) The windows and rooms into the table: rows gC, gR, gU, gUV (a window a texel), gMin, gMax (a room a texel). */
  pack() {
    const d = this.table.image.data, U = this.uniforms;
    [U.gC, U.gR, U.gU, U.gUV, U.gMin, U.gMax].forEach(({ value }, y) => value.forEach((v, x) => d.set([v.x, v.y, v.z, v.w ?? 0], (y * MAX + x) * 4)));
    this.table.needsUpdate = true;
  }

  /** (WebGPU) glassTint(P) of the GLSL below, as a node: the colour the sun's light has picked up on
   * its way to world position P through a window (white if it came in some other way, black where
   * the window's frame or stone blocks it). */
  tintNode(P) {
    const { Fn, Loop, If, vec2, vec3, ivec2, int, float, bool, all, any, abs, cross, dot, mix, pow, step, texture } = T;
    const U = this.uniforms, tab = texture(this.table), atlas = texture(this.atlas);
    const at = (row, i) => tab.load(ivec2(i, int(row)));
    return Fn(() => {
      const out = vec3(1.0).toVar();
      const inside = bool(false).toVar();
      Loop(ROOMS, ({ i }) => {
        If(all(P.greaterThan(at(4, i).xyz)).and(all(P.lessThan(at(5, i).xyz))), () => { inside.assign(true); });
      });
      If(inside, () => {
        // the nearest window the line to the light passes through
        const best = float(1e9).toVar(), uvAt = vec2(0.0).toVar(), frame = bool(false).toVar();
        Loop({ start: int(0), end: U.gCount, type: 'int', condition: '<' }, ({ i }) => {
          const C = at(0, i), R = at(1, i), V = at(2, i);
          const n = cross(R.xyz, V.xyz);
          const dn = dot(U.gSun, n);
          If(abs(dn).greaterThanEqual(1e-4), () => {
            const t = dot(C.xyz.sub(P), n).div(dn);
            If(t.greaterThan(0.05).and(t.lessThan(best)), () => {
              const Q = P.add(U.gSun.mul(t)).sub(C.xyz);
              const f = vec2(dot(Q, R.xyz).div(R.w), dot(Q, V.xyz).div(V.w));
              // a hand's breadth of frame round the opening, where the soft shadow's edge would
              // otherwise let a fringe of plain sunlight past the picture
              If(any(abs(f).greaterThan(float(0.3).div(vec2(R.w, V.w)).add(1.0))).not(), () => {
                best.assign(t);
                frame.assign(any(abs(f).greaterThan(vec2(1.0))));
                const UV = at(3, i);
                uvAt.assign(mix(UV.xy, UV.zw, f.mul(0.5).add(0.5)));
              });
            });
          });
        });
        If(best.lessThanEqual(1e8), () => {
          If(frame, () => { out.assign(vec3(0.0)); }).Else(() => {
            // read at the picture's full detail (in a branch: no mip level to be had); sunlight
            // through coloured glass is still sunlight: the colours lifted a little out of the dark
            const g = atlas.sample(uvAt).level(0);
            out.assign(pow(g.rgb, vec3(0.85)).mul(step(0.5, g.a)).mul(U.gBoost));
          });
        });
      });
      return out;
    })();
  }

  /** (WebGPU) A directional light's colour (its colour times its intensity, as three's own) times
   * the windows' tint for the materials patch() taught: three's light node takes light.colorNode. */
  lightColor(light) {
    const c = new THREE.Color();
    const base = light.colorNode || T.uniform(c).setGroup(T.renderGroup).onRenderUpdate(() => { c.copy(light.color).multiplyScalar(light.intensity); });
    const tint = this.tint ||= this.tintNode(T.positionWorld);
    return base.mul(T.Fn((builder) => (_lit.has(builder.material) ? tint : T.vec3(1.0)))());
  }

  /** The next window of a kind ('rose', 'arched', 'lancet') not yet set in a wall. */
  next(kind) {
    const all = this.byKind[kind] || [];
    const w = all.find((x) => !this.used.has(x.id)) || all[this.used.size % all.length];
    this.used.add(w.id);
    return w;
  }

  /** A building whose inside receives the coloured light: an [x0, y0, z0, x1, y1, z1] box. */
  room(box) {
    const i = this.rooms.length;
    this.rooms.push(box);
    this.uniforms.gMin.value[i].set(box[0], box[1], box[2]);
    this.uniforms.gMax.value[i].set(box[3], box[4], box[5]);
    if (WEBGPU) this.pack();
  }

  /**
   * Set a window in a wall. center: the middle of the opening (in the wall's middle plane);
   * normal: [x, 0, z] pointing into the building; w, h: the opening's size in metres; stone:
   * the wall's material, which fills the opening round the window's shape. The picture is
   * fitted to the opening's height and centred across it.
   */
  add(kind, center, normal, w, h, stone = null) {
    const meta = this.next(kind);
    const n = new THREE.Vector3(...normal).normalize(), up = new THREE.Vector3(0, 1, 0);
    // as seen from inside, looking out through it: right = facing x up
    const right = new THREE.Vector3().crossVectors(n.clone().negate(), up).normalize();
    const c = new THREE.Vector3(...center);
    const win = { id: meta.id, kind, color: new THREE.Color(...meta.color.map((v) => v / 255)), center: c, right, up, w, h, normal: n, rect: meta.rect };
    this.list.push(win);
    const i = this.list.length - 1, U = this.uniforms;
    U.gC.value[i].set(c.x, c.y, c.z, 0); U.gR.value[i].set(right.x, right.y, right.z, w / 2);
    U.gU.value[i].set(0, 1, 0, h / 2); U.gUV.value[i].set(...meta.rect);
    U.gCount.value = this.list.length;
    if (WEBGPU) this.pack();
    // the pane: one double-sided quad in the opening; masonry fills round the picture's shape
    const g = new THREE.BufferGeometry();
    const p = (sx, sy) => c.clone().addScaledVector(right, sx * w / 2).addScaledVector(up, sy * h / 2).toArray();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...p(-1, -1), ...p(1, -1), ...p(1, 1), ...p(-1, 1)], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const mat = WEBGPU ? this.paneMaterial(meta.rect) : new THREE.ShaderMaterial({
      side: THREE.DoubleSide, fog: true,
      uniforms: { ...fogUniforms(), atlas: { value: this.atlas }, rect: { value: new THREE.Vector4(...meta.rect) }, glow: this.glow, stone: this.stone },
      vertexShader: /* glsl */`
        #include <fog_pars_vertex>
        varying vec2 vUv;
        void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <fog_pars_fragment>
        uniform sampler2D atlas; uniform vec4 rect; uniform float glow, stone;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(atlas, mix(rect.xy, rect.zw, vUv));
          if (c.a < 0.5) discard; // round the picture's shape: the wall's own stone (surround)
          gl_FragColor = vec4(c.rgb * glow, 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 1;
    this.ctx.scene.add(mesh);
    if (stone) this.surround(meta, c, n, right, up, w, h, stone);
    return win;
  }

  /** (WebGPU) A pane's material: the ShaderMaterial's above as one graph for every pane, each its
   * own part of the atlas (uniforms.rect). */
  paneMaterial(rect) {
    if (!this.pane) {
      const { Fn, texture, uv, mix, vec4 } = T;
      const r = ref('uniforms.rect.value', 'vec4');
      const c = texture(this.atlas, mix(r.xy, r.zw, uv()));
      this.pane = Fn(() => {
        c.a.lessThan(0.5).discard();   // round the picture's shape: the wall's own stone (surround)
        return vec4(c.rgb.mul(this.glow), 1.0);
      })();
    }
    const m = new THREE.NodeMaterial();
    m.fragmentNode = this.pane;
    m.side = THREE.DoubleSide; m.fog = true;
    m.uniforms = { atlas: { value: this.atlas }, rect: { value: new THREE.Vector4(...rect) } };
    return m;
  }

  /** The masonry round a window's glass, inside and out: the wall's own material, lit and
   * shadowed like the rest of the wall, cut to the window's shape. */
  surround(meta, c, n, right, up, w, h, stone) {
    let fill = this.fills.get(stone);
    if (!fill) {
      fill = stone.clone();
      fill.alphaMap = this.stoneMask; fill.alphaTest = 0.5;
      fill.userData = { ...stone.userData };
      this.fills.set(stone, fill);
    }
    const tu = fill.userData.tileU || 1, tv = fill.userData.tileV || 1, [u0, v0, u1, v1] = meta.rect;
    for (const s of [1, -1]) { // the inside face, then the outside
      const r = right.clone().multiplyScalar(s), N = n.clone().multiplyScalar(s);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const P = corners.map(([sx, sy]) => c.clone().addScaledVector(r, sx * w / 2).addScaledVector(up, sy * h / 2).addScaledVector(N, 0.004));
      const q = new THREE.BufferGeometry();
      q.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap((p) => p.toArray()), 3));
      q.setAttribute('normal', new THREE.Float32BufferAttribute(P.flatMap(() => N.toArray()), 3));
      q.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap((p) => [p.dot(r) / tu, p.y / tv]), 2));
      // across the picture the outside face runs the other way
      q.setAttribute('uv1', new THREE.Float32BufferAttribute(corners.flatMap(([sx, sy]) =>
        [u0 + (u1 - u0) * (sx * s * 0.5 + 0.5), v0 + (v1 - v0) * (sy * 0.5 + 0.5)]), 2));
      q.setIndex([0, 1, 2, 0, 2, 3]);
      const m = new THREE.Mesh(q, fill);
      m.receiveShadow = true;
      this.ctx.scene.add(m);
    }
  }

  /** Teach every lit material in the scene to colour its sunlight through the windows. */
  applyTo(scene) {
    const done = new Set();
    if (WEBGPU) {   // (the sun's light node is made when the scene is first drawn: after this)
      scene.traverse((o) => { if (o.isDirectionalLight && !o.userData.glassLit) { o.colorNode = this.lightColor(o); o.userData.glassLit = true; } });
    }
    scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || done.has(m) || m.userData.noGlass || !(m.isMeshPhongMaterial || m.isMeshLambertMaterial || m.isMeshStandardMaterial)) continue;
        done.add(m);
        this.patch(m);
      }
    });
  }

  patch(m) {
    if (WEBGPU) { _lit.add(m); keyed(m, 'glass'); return; }   // (the light does the rest: lightColor)
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey();
    const U = this.uniforms;
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlassWP;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 gwp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            gwp = instanceMatrix * gwp;
          #endif
          vGlassWP = (modelMatrix * gwp).xyz;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vGlassWP;
        uniform sampler2D gAtlas; uniform int gCount; uniform vec3 gSun; uniform float gBoost;
        uniform vec4 gC[${MAX}], gR[${MAX}], gU[${MAX}], gUV[${MAX}];
        uniform vec3 gMin[${ROOMS}], gMax[${ROOMS}];
        // the colour the sun's light has picked up on its way here through a window (white if
        // it came in some other way, black where the window's frame or stone blocks it)
        vec3 glassTint(vec3 P) {
          bool inside = false;
          for (int r = 0; r < ${ROOMS}; r++) if (all(greaterThan(P, gMin[r])) && all(lessThan(P, gMax[r]))) inside = true;
          if (!inside) return vec3(1.0);
          // the nearest window the line to the light passes through
          float best = 1e9; vec2 uv = vec2(0.0); bool frame = false;
          for (int i = 0; i < ${MAX}; i++) {
            if (i >= gCount) break;
            vec3 n = cross(gR[i].xyz, gU[i].xyz);
            float dn = dot(gSun, n);
            if (abs(dn) < 1e-4) continue;
            float t = dot(gC[i].xyz - P, n) / dn;
            if (t <= 0.05 || t >= best) continue;
            vec3 Q = P + gSun * t - gC[i].xyz;
            vec2 f = vec2(dot(Q, gR[i].xyz) / gR[i].w, dot(Q, gU[i].xyz) / gU[i].w);
            // a hand's breadth of frame round the opening, where the soft shadow's edge would
            // otherwise let a fringe of plain sunlight past the picture
            if (any(greaterThan(abs(f), 1.0 + 0.3 / vec2(gR[i].w, gU[i].w)))) continue;
            best = t; frame = any(greaterThan(abs(f), vec2(1.0)));
            uv = mix(gUV[i].xy, gUV[i].zw, f * 0.5 + 0.5);
          }
          if (best > 1e8) return vec3(1.0);
          if (frame) return vec3(0.0);
          // read at the picture's full detail, outside the loop (inside a loop that breaks the
          // GPU can't work out a mip level, and reads garbage)
          vec4 g = textureLod(gAtlas, uv, 0.0);
          // sunlight through coloured glass is still sunlight: the colours lifted a little out of
          // the dark so the picture reads against the candlelit stone
          return pow(g.rgb, vec3(0.85)) * step(0.5, g.a) * gBoost;
        }`)
        .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
          'getDirectionalLightInfo( directionalLight, directLight );',
          'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= glassTint( vGlassWP );'));
    };
    m.customProgramCacheKey = () => prevKey + '|glass';
    m.needsUpdate = true;
  }

  /** Each frame: where the light comes from, and how bright the panes are. */
  update(lightDir, daylight, ambient) {
    this.uniforms.gSun.value.copy(lightDir);
    this.glow.value = 0.18 + 1.5 * daylight;
    this.stone.value = 0.2 + 0.8 * ambient;
  }

  /** Windows for the sunbeams (effects.js Shafts): coloured by each window's glass. */
  shafts() {
    return this.list.map((w) => ({ x: w.center.x, y: w.center.y, z: w.center.z, w: w.w * 0.85, h: w.h * 0.9,
      normal: [w.normal.x, 0, w.normal.z], color: w.color.getHex() }));
  }
}
