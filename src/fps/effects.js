// World effects that run on the GPU: the sky (sun, moon, stars and drifting clouds across a
// day and night), sunbeams through the cathedral's stained glass, graveyard mist, chimney
// smoke, scorch and frost marks, shockwave rings and lightning arcs.
import * as THREE from 'three';

const NOISE = /* glsl */`
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }`;

/** Times of day: 0..24. The palette the sky, sun, ambient light and fog all follow. */
const KEYS = [ // hour, zenith, horizon, sun colour, sun power, ambient, fog
  [0, 0x03050c, 0x0b1020, 0x9ab0ff, 0.30, 0.3, 0x0a0e18],
  [4.8, 0x05081a, 0x18182c, 0x9ab0ff, 0.25, 0.3, 0x141626],
  [6.0, 0x2a3a6a, 0xe08a5a, 0xff9a5a, 1.0, 0.6, 0x8a7068],
  [7.5, 0x3d6aa8, 0xc8c8c0, 0xffd8a8, 2.0, 0.8, 0xa8b0b8],
  [12, 0x3a6eb0, 0xbcd0e2, 0xfff4e4, 2.5, 1.0, 0xb0bfcc],
  [16.5, 0x3a64a4, 0xc8c4b8, 0xffe0b0, 2.3, 1.0, 0xb0b4b4],
  [18.2, 0x2a3466, 0xf09050, 0xff8a40, 1.6, 0.78, 0x9a6a58],
  [19.4, 0x0c1030, 0x3a2a40, 0xff6a40, 0.4, 0.4, 0x2a2232],
  [21, 0x03050c, 0x0b1020, 0x9ab0ff, 0.30, 0.3, 0x0a0e18],
  [24, 0x03050c, 0x0b1020, 0x9ab0ff, 0.30, 0.3, 0x0a0e18],
];
const _a = new THREE.Color(), _b = new THREE.Color();
export function dayState(hour) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= hour) i++;
  const [h0, ...A] = KEYS[i], [h1, ...B] = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (hour - h0) / (h1 - h0)));
  const mix = (k) => _a.setHex(A[k]).lerp(_b.setHex(B[k]), t).clone();
  // the sun climbs from the east at 6 to the south at noon and sets in the west at 18;
  // the moon runs opposite
  const a = (hour - 12) / 12 * Math.PI;
  const el = Math.asin(Math.cos(a) * Math.sin(1.08));
  const sunDir = new THREE.Vector3(-Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el) * 0.6 + 0.25).normalize();
  const moonDir = new THREE.Vector3(-sunDir.x, Math.abs(sunDir.y) * 0.8 + 0.25, -sunDir.z).normalize();
  const day = THREE.MathUtils.smoothstep(sunDir.y, -0.08, 0.12);
  return {
    zenith: mix(0), horizon: mix(1), sunColor: mix(2), sunPower: A[3] + (B[3] - A[3]) * t,
    ambient: A[4] + (B[4] - A[4]) * t, fog: mix(5), sunDir, moonDir, day,
    lightDir: day > 0.02 ? sunDir : moonDir,
  };
}

export class Sky {
  constructor(scene) {
    this.uniforms = {
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() }, day: { value: 1 }, time: { value: 0 }, dim: { value: 1 },
    };
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uniforms,
      vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: /* glsl */`
        uniform vec3 zenith, horizon, sunColor, sunDir, moonDir; uniform float day, time, dim;
        varying vec3 vP;
        ${NOISE}
        void main() {
          vec3 d = normalize(vP);
          float h = max(d.y, 0.0);
          vec3 c = mix(horizon, zenith, pow(smoothstep(-0.02, 0.6, d.y), 0.7));
          // the sun's glow, wider and redder near the horizon
          float sd = max(dot(d, sunDir), 0.0);
          c += sunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 64.0) * 0.6) * (0.4 + 0.6 * day);
          c += sunColor * smoothstep(0.9993, 0.9997, sd) * 6.0;              // the disc
          float md = max(dot(d, moonDir), 0.0);
          c += vec3(0.85, 0.9, 1.0) * smoothstep(0.9990, 0.9994, md) * 2.5 * (1.0 - day);
          c += vec3(0.4, 0.5, 0.8) * pow(md, 24.0) * 0.12 * (1.0 - day);
          // stars: hashed points on a grid of directions, twinkling
          vec2 sp = vec2(atan(d.z, d.x), asin(d.y)) * 140.0;
          vec2 cell = floor(sp), f = fract(sp) - 0.5;
          float hs = hash2(cell);
          float st = step(0.985, hs) * step(length(f), 0.28) * smoothstep(0.04, 0.3, d.y);
          float night = pow(1.0 - day, 3.0);
          c += vec3(0.9, 0.95, 1.0) * st * night * (0.55 + 0.45 * sin(time * 2.0 + hs * 60.0)) * (1.0 + 2.0 * fract(hs * 91.0));
          // clouds: a moving fbm layer projected on a dome
          if (d.y > 0.0) {
            vec2 cp = d.xz / (d.y + 0.12) * 1.6 + vec2(time * 0.012, time * 0.004);
            float n = fbm(cp);
            float cov = smoothstep(0.48, 0.78, n);
            vec3 lit = mix(vec3(0.16, 0.17, 0.24), vec3(1.0), day) * (0.75 + 0.35 * sunColor * pow(sd, 3.0));
            vec3 cc = mix(lit * 0.55, lit, smoothstep(0.5, 0.9, fbm(cp + sunDir.xz * 0.08)));
            c = mix(c, cc * mix(horizon, vec3(1.0), 0.5 + 0.5 * day), cov * smoothstep(0.0, 0.18, d.y) * 0.9);
          }
          c = mix(c, horizon * 0.7, smoothstep(0.0, -0.25, d.y)); // below the horizon
          gl_FragColor = vec4(c * dim, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), m);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(state, t, camPos, dim) {
    const u = this.uniforms;
    u.zenith.value.copy(state.zenith); u.horizon.value.copy(state.horizon);
    u.sunColor.value.copy(state.sunColor); u.sunDir.value.copy(state.sunDir); u.moonDir.value.copy(state.moonDir);
    u.day.value = state.day; u.time.value = t; u.dim.value = dim;
    this.mesh.position.copy(camPos);
  }
}

/** Light pouring through the cathedral's stained glass: prisms swept from each window along
 * the sun's direction, brightest at the glass, fading as they cross the nave. */
export class Shafts {
  constructor(scene, windows) { // windows: [{x, y, z, w, h, normal: [nx, 0, nz] (pointing in), color}]
    this.windows = windows;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, power: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec2 st; attribute vec3 tint; varying vec2 vSt; varying vec3 vTint; varying vec3 vW;
        void main() { vSt = st; vTint = tint; vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float time, power; varying vec2 vSt; varying vec3 vTint; varying vec3 vW;
        ${NOISE}
        void main() {
          float along = vSt.x, across = vSt.y;
          float a = (1.0 - along) * (1.0 - along) * smoothstep(0.0, 0.25, across) * smoothstep(1.0, 0.75, across);
          a *= 0.7 + 0.3 * vnoise(vec2(vW.x * 1.5 + time * 0.2, vW.y * 1.5 + vW.z * 0.7));  // drifting dust
          gl_FragColor = vec4(vTint * a * power * 0.16, 1.0);
        }`,
    });
    this.lastDir = new THREE.Vector3();
  }

  update(state, t, visible) {
    this.mat.uniforms.time.value = t;
    const p = visible ? state.day * Math.max(0, Math.min(1, state.sunDir.y * 3)) : 0;
    this.mat.uniforms.power.value = p;
    this.group.visible = p > 0.01;
    if (!this.group.visible || this.lastDir.distanceTo(state.sunDir) < 0.01) return;
    this.lastDir.copy(state.sunDir);
    this.group.clear();
    const travel = state.sunDir.clone().negate(); // the direction the light moves
    const pos = [], st = [], tint = [];
    for (const w of this.windows) {
      const n = new THREE.Vector3(...w.normal);
      if (travel.dot(n) <= 0.05) continue; // the sun is on the other side
      const len = Math.min(28, 10 / Math.max(0.2, -travel.y));
      const right = new THREE.Vector3(-n.z, 0, n.x);
      const c = new THREE.Vector3(w.x, w.y, w.z);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) =>
        c.clone().addScaledVector(right, a * w.w / 2).add(new THREE.Vector3(0, b * w.h / 2, 0)));
      const far = corners.map((q) => q.clone().addScaledVector(travel, len));
      const col = new THREE.Color(w.color);
      for (let e = 0; e < 4; e++) { // four sides of the prism
        const a0 = corners[e], a1 = corners[(e + 1) % 4], b0 = far[e], b1 = far[(e + 1) % 4];
        for (const [q, s] of [[a0, [0, 0]], [a1, [0, 1]], [b1, [1, 1]], [a0, [0, 0]], [b1, [1, 1]], [b0, [1, 0]]]) {
          pos.push(q.x, q.y, q.z); st.push(...s); tint.push(col.r, col.g, col.b);
        }
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('st', new THREE.Float32BufferAttribute(st, 2));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
    const m = new THREE.Mesh(g, this.mat);
    m.frustumCulled = false;
    this.group.add(m);
  }
}

/** Low drifting mist: a few stacked sheets with noise in them, lit by the sky. */
export class Mist {
  constructor(scene, rect, { layers = 4, height = 1.4, color = 0xc8d0d8, density = 0.22, exclude = [] } = {}) {
    this.uniforms = { time: { value: 0 }, color: { value: new THREE.Color(color) }, light: { value: 1 }, density: { value: density } };
    const [x0, z0, x1, z1] = rect;
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: this.uniforms, fog: false,
      vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */`
        uniform float time, light, density; uniform vec3 color; varying vec3 vW;
        ${NOISE}
        void main() {
          float n = fbm(vW.xz * 0.08 + vec2(time * 0.03, time * 0.017) + vW.y * 3.0);
          float a = smoothstep(0.35, 0.8, n) * density;
          vec2 e = min(vW.xz - vec2(${x0.toFixed(1)}, ${z0.toFixed(1)}), vec2(${x1.toFixed(1)}, ${z1.toFixed(1)}) - vW.xz);
          a *= smoothstep(0.0, 10.0, min(e.x, e.y));
          ${exclude.map(([a0, b0, a1, b1]) => `if (vW.x > ${a0.toFixed(1)} && vW.x < ${a1.toFixed(1)} && vW.z > ${b0.toFixed(1)} && vW.z < ${b1.toFixed(1)}) a = 0.0;`).join(' ')}
          gl_FragColor = vec4(color * light, a);
        }`,
    });
    this.group = new THREE.Group();
    for (let i = 0; i < layers; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m);
      p.rotation.x = -Math.PI / 2;
      p.position.set((x0 + x1) / 2, 0.12 + (i / Math.max(1, layers - 1)) * height, (z0 + z1) / 2);
      p.renderOrder = 3;
      this.group.add(p);
    }
    scene.add(this.group);
  }

  update(t, light) { this.uniforms.time.value = t; this.uniforms.light.value = light; }
}

/** Soft, normally blended puffs: chimney smoke, spell smoke, dust. */
export class Smoke {
  constructor(scene, max = 600) {
    this.max = max;
    this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.data = new Float32Array(max * 4); // size, alpha, shade, unused
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pdata', new THREE.BufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { scale: { value: 300 }, light: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: /* glsl */`
        attribute vec4 pdata; uniform float scale; varying vec2 vA;
        void main() { vA = pdata.yz; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = pdata.x * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        uniform vec3 light; varying vec2 vA;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float d = length(q) * 2.0;
          if (d > 1.0) discard;
          // a soft lumpy puff: radial falloff broken up by a few lobes
          float lobes = 0.82 + 0.18 * sin(atan(q.y, q.x) * 5.0 + vA.y * 17.0);
          float a = vA.x * smoothstep(1.0, 0.15, d / lobes);
          gl_FragColor = vec4(light * vA.y, a * 0.8);
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    this.emitters = [];
  }

  emit(p, v, { life = 4, size = 0.6, grow = 1.2, alpha = 0.35, shade = 0.55 } = {}) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ p: p.clone(), v: v.clone(), age: 0, life, size, grow, alpha, shade });
  }

  addEmitter(x, y, z, rate = 3) { this.emitters.push({ p: new THREE.Vector3(x, y, z), rate, acc: Math.random() }); }

  update(dt, camera, height, light) {
    for (const e of this.emitters) {
      e.acc += dt * e.rate;
      while (e.acc > 1) {
        e.acc -= 1;
        this.emit(e.p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)),
          new THREE.Vector3(0.35 + Math.random() * 0.2, 0.9 + Math.random() * 0.4, 0.15), { life: 6, size: 0.7, grow: 0.9, alpha: 0.3 });
      }
    }
    const live = [];
    for (const s of this.list) {
      s.age += dt;
      if (s.age < s.life) { s.p.addScaledVector(s.v, dt); s.v.multiplyScalar(1 - dt * 0.15); live.push(s); }
    }
    this.list = live;
    live.forEach((s, i) => {
      this.pos.set([s.p.x, s.p.y, s.p.z], i * 3);
      const k = s.age / s.life;
      this.data.set([s.size + s.grow * s.age, s.alpha * Math.min(1, s.age * 4) * (1 - k), s.shade, 0], i * 4);
    });
    this.geo.setDrawRange(0, live.length);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pdata.needsUpdate = true;
    this.mat.uniforms.scale.value = height / 2 * camera.projectionMatrix.elements[5];
    this.mat.uniforms.light.value.setScalar(light);
  }
}

function radialTexture(draw, n = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  draw(c.getContext('2d'), n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Marks spells leave on walls and floors (scorch, frost, rune circles), fading away. */
export class Decals {
  constructor(scene, max = 48) {
    this.scene = scene;
    this.max = max;
    this.list = [];
    const blot = (inner, outer) => radialTexture((g, n) => {
      for (let y = 0; y < n; y += 2) for (let x = 0; x < n; x += 2) {
        const d = Math.hypot(x - n / 2, y - n / 2) / (n / 2) + (Math.random() - 0.5) * 0.25;
        if (d > 1) continue;
        g.fillStyle = d < 0.55 ? inner : outer;
        g.globalAlpha = Math.min(1, (1 - d) * 2.2);
        g.fillRect(x, y, 2, 2);
      }
    });
    this.tex = {
      scorch: blot('#0a0604', '#2a1a10'),
      frost: blot('#f0faff', '#9ad0ff'),
      rune: radialTexture((g, n) => {
        g.strokeStyle = '#d8ffb0'; g.lineWidth = 2; g.fillStyle = '#d8ffb0';
        for (const r of [0.46, 0.36]) { g.beginPath(); g.arc(n / 2, n / 2, r * n, 0, Math.PI * 2); g.stroke(); }
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2;
          g.fillRect(n / 2 + Math.cos(a) * 0.41 * n - 1.5, n / 2 + Math.sin(a) * 0.41 * n - 1.5, 3, 3);
        }
        g.beginPath();
        for (let i = 0; i <= 5; i++) { const a = i * 4 / 5 * Math.PI - Math.PI / 2; g.lineTo(n / 2 + Math.cos(a) * 0.33 * n, n / 2 + Math.sin(a) * 0.33 * n); }
        g.stroke();
      }, 128),
    };
  }

  add(kind, p, normal, size, { life = 25, glow = false, spin = 0 } = {}) {
    const m = new THREE.MeshBasicMaterial({ map: this.tex[kind], transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending, color: glow ? new THREE.Color(2, 2, 2) : 0xffffff });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    q.position.copy(p).addScaledVector(normal, 0.02);
    q.lookAt(p.clone().add(normal));
    q.rotateZ(Math.random() * Math.PI * 2);
    q.renderOrder = 2;
    this.scene.add(q);
    this.list.push({ q, age: 0, life, spin });
    if (this.list.length > this.max) this.remove(this.list.shift());
  }

  remove(d) { this.scene.remove(d.q); d.q.geometry.dispose(); d.q.material.dispose(); }

  update(dt) {
    this.list = this.list.filter((d) => {
      d.age += d.life ? dt : 0;
      d.q.rotateZ(d.spin * dt);
      const k = d.age / d.life;
      d.q.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      if (k >= 1) { this.remove(d); return false; }
      return true;
    });
  }
}

/** Expanding shockwave rings and spheres for bursts. */
export class Waves {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 48, 1);
    this.sphereGeo = new THREE.IcosahedronGeometry(1, 3);
  }

  add(p, normal, color, { size = 3, life = 0.45, sphere = false } = {}) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, wireframe: sphere });
    const w = new THREE.Mesh(sphere ? this.sphereGeo : this.ringGeo, m);
    w.position.copy(p).addScaledVector(normal || new THREE.Vector3(), 0.05);
    if (normal && !sphere) w.lookAt(p.clone().add(normal));
    w.scale.setScalar(0.1);
    this.scene.add(w);
    this.list.push({ w, age: 0, life, size });
  }

  update(dt) {
    this.list = this.list.filter((o) => {
      o.age += dt;
      const k = o.age / o.life;
      o.w.scale.setScalar(0.1 + o.size * (1 - (1 - k) * (1 - k)));
      o.w.material.opacity = 1 - k;
      if (k >= 1) { this.scene.remove(o.w); o.w.material.dispose(); return false; }
      return true;
    });
  }
}

/** Jagged lightning: line strips re-rolled every few frames between two points. */
export class Arcs {
  constructor(scene, max = 24) {
    this.max = max;
    this.seg = 10;
    this.pos = new Float32Array(max * this.seg * 2 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = g;
    this.mat = new THREE.LineBasicMaterial({ color: new THREE.Color(2.4, 2.2, 3.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
    scene.add(this.lines);
    this.list = [];
  }

  add(a, b, life = 0.12, jag = 0.25) { this.list.push({ a: a.clone(), b: b.clone(), age: 0, life, jag }); if (this.list.length > this.max) this.list.shift(); }

  update(dt) {
    this.list = this.list.filter((o) => (o.age += dt) < o.life);
    let k = 0;
    const d = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3();
    for (const o of this.list) {
      d.subVectors(o.b, o.a);
      const len = d.length();
      q.copy(o.a);
      for (let s = 1; s <= this.seg; s++) {
        p.copy(o.a).addScaledVector(d, s / this.seg);
        if (s < this.seg) p.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(len * o.jag));
        this.pos.set([q.x, q.y, q.z, p.x, p.y, p.z], k); k += 6;
        q.copy(p);
      }
    }
    this.geo.setDrawRange(0, k / 3);
    this.geo.attributes.position.needsUpdate = true;
  }
}
