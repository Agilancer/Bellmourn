// The green star: Tessariel coming down, curled up and spinning inside a ball of green fire with a
// great tail behind it. And the deep sky it falls out of (Space): stars, a band of nebula, the world
// below with its blue rim of air, and the sun.
//
// The comet is a group that can be carried from the space scene into the world's: the hero spinning
// at its heart; a glassy shell of light round him (bright at its rim, clear in the middle so he shows
// through); a shell of flame streaming back off it; a glow; three layered tails (a green plasma
// cone, a teal veil, a white-hot core streak) with flowing noise; and particles let go into the world
// as it flies, so they hang where it has been: embers, sparks flung wide, and two streamers spiralling
// round its path.
import * as THREE from 'three';
import { glowTex } from './crater.js';

const TOUCH_LITE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

const NOISE = /* glsl */`
  float cHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float cNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(cHash(i), cHash(i + vec3(1, 0, 0)), f.x), mix(cHash(i + vec3(0, 1, 0)), cHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(cHash(i + vec3(0, 0, 1)), cHash(i + vec3(1, 0, 1)), f.x), mix(cHash(i + vec3(0, 1, 1)), cHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float cFbm(vec3 p) { return cNoise(p) * 0.5 + cNoise(p * 2.03 + 3.1) * 0.27 + cNoise(p * 4.1 + 7.7) * 0.15 + cNoise(p * 8.3 + 1.7) * 0.08; }
`;

/** The shell of light: fresnel rim, clear in the middle. */
function shellMaterial(color, rim = 2.2, core = 0.05) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uRim: { value: rim }, uCore: { value: core }, uAmt: { value: 1 } },
    vertexShader: /* glsl */`
      varying vec3 vN, vV, vP;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = position; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uTime, uRim, uCore, uAmt;
      varying vec3 vN, vV, vP;
      ${NOISE}
      void main() {
        float f = clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);   // (clamped: pow of a hair below 0 is NaN, which bloom smears into a black box)
        float n = cFbm(vP * 3.0 + vec3(0.0, uTime * 2.3, uTime * 1.1)), m = cFbm(vP * 7.0 - vec3(uTime * 3.1, 0.0, uTime * 1.7));
        float a = pow(f, uRim) * smoothstep(0.2, 0.8, n * 0.6 + m * 0.6) * 1.4 + uCore * n;
        gl_FragColor = vec4(uColor * a * 0.55 * uAmt, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** The flames streaming back off the ball: a sphere pushed out by noise, more so behind it (the
 * comet flies along -z in its own space). */
function flameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmt: { value: 1 }, uR: { value: 0.6 } },
    vertexShader: /* glsl */`
      uniform float uTime, uR;
      varying float vHeat; varying vec3 vN, vV, vP;
      ${NOISE}
      void main() {
        vec3 p = position;
        float back = smoothstep(-0.2, 1.0, normalize(position).z);      // behind it (+z)
        float n = cFbm(p / uR * 1.3 + vec3(0.0, 0.0, -uTime * 6.0));
        p += normal * uR * (n * 0.25 + back * (0.2 + 1.3 * n * n));
        vHeat = n;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vP = p; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uAmt;
      varying float vHeat; varying vec3 vN, vV, vP;
      ${NOISE}
      void main() {
        float f = clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);   // (clamped: pow of a hair below 0 is NaN, which bloom smears into a black box)
        float n = cFbm(vP / 0.6 * 1.6 + vec3(0.0, 0.0, -uTime * 9.0)), m = cNoise(vP / 0.6 * 4.0 + vec3(uTime * 4.0, 0.0, -uTime * 12.0));
        float a = smoothstep(0.42, 0.95, n * 0.65 + vHeat * 0.45 + m * 0.2) * (0.15 + 0.85 * f);
        vec3 c = mix(vec3(0.05, 0.55, 0.15), vec3(0.85, 1.0, 0.55), smoothstep(0.55, 0.95, n + m * 0.2));
        gl_FragColor = vec4(c * a * 0.55 * uAmt, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** A tail: an open cone along +z (head at 0, end at len), its noise flowing back. */
function tailMaterial(color, speed, edge, bright) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uAmt: { value: 1 }, uNear: { value: 10 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN, vV, vP; varying float vCam;
      void main() {
        vUv = uv; vP = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vCam = distance(cameraPosition, wp.xyz);
        vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uAmt, uNear; uniform vec3 uColor;
      varying vec2 vUv; varying vec3 vN, vV, vP; varying float vCam;
      ${NOISE}
      void main() {
        float along = vUv.y;                                     // 0 at the head, 1 at the end
        float face = abs(dot(normalize(vN), vV));                // edge-on is faint
        float n = cFbm(vec3(vUv.x * 6.0, along * 5.0 - uTime * ${speed.toFixed(2)}, along * 2.0));
        float streak = cFbm(vec3(vUv.x * 22.0, along * 1.4 - uTime * ${(speed * 0.6).toFixed(2)}, 4.0));
        float a = pow(clamp(1.0 - along, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.04, along) * (0.35 + 0.9 * n) * (0.5 + 0.8 * streak);
        a *= mix(1.0, face, ${edge.toFixed(2)}) * smoothstep(uNear * 0.3, uNear, vCam);
        gl_FragColor = vec4(uColor * a * ${bright.toFixed(2)} * uAmt, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** Particles let go into the world as the comet flies (they stay where they were let go, drifting).
 * smoke: drawn over what's behind (not added to it), swelling as it thins. */
class Trail {
  constructor(n = 1600, { smoke = false } = {}) {
    this.n = n; this.smoke = smoke;
    this.p = []; this.i = 0;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n); this.fade = new Float32Array(n);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('fade', new THREE.BufferAttribute(this.fade, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTex() }, uScale: { value: 600 } },
      vertexShader: /* glsl */`
        attribute float size, fade; attribute vec3 color; varying vec3 vC; varying float vF; uniform float uScale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float near = smoothstep(2.0, 7.0, -mv.z);          // none swelling up over the lens
          vC = color * near; vF = fade * near;
          gl_PointSize = min(${smoke ? '180.0' : '64.0'}, size * uScale / max(0.5, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: smoke ? /* glsl */`
        uniform sampler2D uMap; varying vec3 vC; varying float vF;
        void main() { float a = texture2D(uMap, gl_PointCoord).r * vF; gl_FragColor = vec4(vC, clamp(a, 0.0, 1.0)); }` : /* glsl */`
        uniform sampler2D uMap; varying vec3 vC;
        void main() { float a = texture2D(uMap, gl_PointCoord).r; gl_FragColor = vec4(vC * a, 1.0); }`,
      blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    for (let k = 0; k < n; k++) this.p.push({ x: 0, y: -1e5, z: 0, vx: 0, vy: 0, vz: 0, t: 1, life: 1, s: 0, c: [0, 0, 0] });
  }
  emit(x, y, z, vx, vy, vz, life, size, c) {
    const q = this.p[this.i]; this.i = (this.i + 1) % this.n;
    Object.assign(q, { x, y, z, vx, vy, vz, t: 0, life, s: size, c });
  }
  update(dt) {
    for (let k = 0; k < this.n; k++) {
      const q = this.p[k];
      if (q.t >= q.life) { this.size[k] = 0; continue; }
      q.t += dt;
      const drag = Math.exp(-dt * 1.2);
      q.vx *= drag; q.vy *= drag; q.vz *= drag;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const u = q.t / q.life, f = (1 - u) * Math.min(1, q.t * 8);
      this.pos[k * 3] = q.x; this.pos[k * 3 + 1] = q.y; this.pos[k * 3 + 2] = q.z;
      const g = this.smoke ? 1 : f;   // (smoke keeps its colour and thins instead)
      this.col[k * 3] = q.c[0] * g; this.col[k * 3 + 1] = q.c[1] * g; this.col[k * 3 + 2] = q.c[2] * g;
      this.fade[k] = this.smoke ? f * (1 - u) * 0.55 : 1;
      this.size[k] = q.s * (1 + u * (this.smoke ? 3.5 : 1.5));
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.fade.needsUpdate = true;
  }
  clear() { for (const q of this.p) q.t = q.life = 1; }
}

/** Green lightning crackling over the ball: jagged arcs from one point of its shell to another,
 * bowing out from it, thrown anew every few frames (in the comet's own space). */
class Arcs {
  constructor(r, n = 9, seg = 9) {
    this.r = r; this.n = n; this.seg = seg; this.t = 0;
    this.pos = new Float32Array(n * seg * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(1.1, 2.6, 1.4), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.lines.frustumCulled = false;
  }
  update(dt, amount) {
    this.lines.material.opacity = amount * (0.55 + 0.45 * Math.random());
    if ((this.t -= dt) > 0) return;
    this.t = 0.04 + Math.random() * 0.05;
    const P = this.pos, R = this.r, unit = (v) => v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      const a = unit(_a), b = unit(_b).lerp(a, 0.35).normalize(), out = R * (0.3 + Math.random() * 0.9);
      let px = a.x * R * 1.5, py = a.y * R * 1.5, pz = a.z * R * 1.5;
      for (let s = 1; s <= this.seg; s++) {
        const t = s / this.seg, j = s === this.seg ? 0 : R * 0.22;
        const d = _v.copy(a).lerp(b, t).normalize(), rr = R * 1.5 + Math.sin(t * Math.PI) * out;
        const x = d.x * rr + (Math.random() - 0.5) * j, y = d.y * rr + (Math.random() - 0.5) * j, z = d.z * rr + (Math.random() - 0.5) * j;
        P.set([px, py, pz, x, y, z], k); k += 6;
        px = x; py = y; pz = z;
      }
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);

export class Comet {
  /** hero: loadHero()'s curled body (or null). */
  constructor(hero) {
    this.group = new THREE.Group();         // follows the head of the comet, pointed along its flight
    this.body = new THREE.Group();          // turned so its +z points back along the flight
    this.group.add(this.body);
    this.hero = hero;
    const r = hero?.userData.size || 0.6;
    if (hero) { this.spin = new THREE.Group(); this.spin.add(hero); this.group.add(this.spin); }
    this.r = r;
    this.mats = [];
    this.glowK = 1;
    const sphere = (rad, mat, seg = 32) => { const m = new THREE.Mesh(new THREE.SphereGeometry(rad, seg, seg / 2), mat); m.frustumCulled = false; this.mats.push(mat); return m; };
    this.inner = sphere(r * 1.45, shellMaterial(0x40ff88, 1.8, 0.0));
    this.inner.material.uniforms.uColor.value.multiplyScalar(0.8);
    this.outer = sphere(r * 1.9, shellMaterial(0x7aff5a, 1.5, 0.0));
    this.outer.material.uniforms.uColor.value.multiplyScalar(0.55);
    this.flame = sphere(r * 1.75, flameMaterial(), 72);
    this.flame.material.uniforms.uR.value = r;
    this.body.add(this.inner, this.outer, this.flame);
    // the glow round it
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(0.03, 0.26, 0.09), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.glow.scale.setScalar(r * 6.5);
    this.hot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(0.5, 0.9, 0.55), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: 0.3 }));
    this.hot.scale.setScalar(r * 3.2);
    // a beacon of a constant size on the screen, so the head reads from afar (it fades out close to)
    this.beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(0.7, 1.6, 0.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, sizeAttenuation: false }));
    this.beacon.scale.setScalar(0.07);
    this.group.add(this.glow, this.beacon);
    // the tails: open cones along +z (back along the flight)
    const cone = (len, r0, r1, mat) => {
      const g = new THREE.CylinderGeometry(r1, r0, len, 48, 24, true);   // (its top turns to +z: the far end)
      g.rotateX(Math.PI / 2); g.translate(0, 0, len / 2);
      // uv.y along it from the head
      const uv = g.attributes.uv, pos = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setY(i, pos.getZ(i) / len);
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; this.mats.push(mat);
      return m;
    };
    this.tails = [
      cone(r * 150, r * 1.6, r * 16, tailMaterial(0x2aff70, 1.6, 0.6, 0.32)),
      cone(r * 210, r * 2.0, r * 30, tailMaterial(0x18c8b0, 1.1, 0.8, 0.17)),
      cone(r * 90, r * 0.6, r * 3.4, tailMaterial(0xd8ffd0, 2.6, 0.3, 0.4)),
    ];
    this.body.add(...this.tails);
    // a lens's streak across the head (an anamorphic flare: wide and thin, always level on the screen)
    this.flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(0.22, 0.85, 0.42), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.flare.scale.set(r * 48, r * 1.2, 1);
    // lightning crackling over the ball
    this.arcs = new Arcs(r);
    this.group.add(this.flare, this.arcs.lines);
    this.trail = new Trail(TOUCH_LITE ? 1200 : 2600);
    this.smoke = new Trail(TOUCH_LITE ? 260 : 520, { smoke: true });   // (smoke hanging behind it)
    this.smokeAcc = 0;
    this.t = 0; this.acc = 0;
    this.amount = 1;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(0, -1, 0);
    this.spinRate = new THREE.Vector3(38, 52, 26);   // (radians a second: he tumbles about eight times a second)
  }

  /** Put the comet (and its trail) into a scene. */
  setScene(scene) {
    scene.add(this.group); scene.add(this.trail.points); scene.add(this.smoke.points);
  }
  remove() { this.group.removeFromParent(); this.trail.points.removeFromParent(); this.smoke.points.removeFromParent(); }
  /** Let go of every particle it has shed. */
  clear() { this.trail.clear(); this.smoke.clear(); }

  /** How big it is drawn (1: as he is; the sky shot draws it bigger, to read from afar). */
  setScale(k) { this.group.scale.setScalar(k); this.scale = k; for (const t of this.tails) t.material.uniforms.uNear.value = 10 * k; }

  /** Move the head to p, flying along v (m/s); let particles go into the world behind it. */
  update(dt, p, v, { emit = true, camera = null } = {}) {
    this.t += dt;
    this.pos.copy(p); this.vel.copy(v);
    this.group.position.copy(p);
    const back = _v.copy(v).normalize().negate();
    if (back.lengthSq() > 0.5) this.body.quaternion.setFromUnitVectors(_z, back);
    if (this.spin) {
      this.spin.rotation.x += this.spinRate.x * dt; this.spin.rotation.y += this.spinRate.y * dt; this.spin.rotation.z += this.spinRate.z * dt;
    }
    for (const m of this.mats) { m.uniforms.uTime.value = this.t; m.uniforms.uAmt.value = this.amount; }
    const flick = 0.85 + 0.15 * Math.sin(this.t * 31) * Math.sin(this.t * 13.7);
    this.glow.material.opacity = this.amount * flick;
    const far = camera ? Math.min(1, Math.max(0, (camera.position.distanceTo(p) / (this.scale || 1) - 25) / 80)) : 1;
    this.beacon.material.opacity = this.amount * far * flick;
    this.flare.material.opacity = Math.min(1, this.amount * 0.55) * flick * (0.75 + 0.25 * Math.sin(this.t * 17.3));
    this.arcs.update(dt, Math.min(1, this.amount * 0.7));
    // particles: embers shed off the ball, sparks flung wide, glowing rock breaking off, two
    // streamers spiralling round the path; and smoke left hanging behind it
    if (emit && this.amount > 0.05) {
      const k = this.scale || 1, r = this.r * k, speed = v.length();
      // a frame round the flight
      _a.set(0, 1, 0).cross(back); if (_a.lengthSq() < 1e-4) _a.set(1, 0, 0); _a.normalize();
      _b.copy(back).cross(_a).normalize();
      this.smokeAcc += dt * (TOUCH_LITE ? 40 : 80);
      while (this.smokeAcc > 1) {
        this.smokeAcc -= 1;
        const s = Math.random() * dt, a = Math.random() * 6.28, rr = r * Math.random() * 1.2;
        const x = p.x - v.x * s + (_a.x * Math.cos(a) + _b.x * Math.sin(a)) * rr + back.x * r * 2.2;
        const y = p.y - v.y * s + (_a.y * Math.cos(a) + _b.y * Math.sin(a)) * rr + back.y * r * 2.2;
        const z = p.z - v.z * s + (_a.z * Math.cos(a) + _b.z * Math.sin(a)) * rr + back.z * r * 2.2;
        const sh = 0.1 + Math.random() * 0.08;
        this.smoke.emit(x, y, z, back.x * speed * 0.03 + (Math.random() - 0.5) * k, back.y * speed * 0.03 + Math.random() * 0.6 * k, back.z * speed * 0.03 + (Math.random() - 0.5) * k,
          3 + Math.random() * 3, r * (1.0 + Math.random() * 1.2), [sh, sh * 1.35, sh * 1.1]);
      }
      this.acc += dt * (TOUCH_LITE ? 340 : 720);
      while (this.acc > 1) {
        this.acc -= 1;
        const kind = Math.random();
        const s = Math.random() * dt;   // spread along the frame's step, so a fast comet leaves no gaps
        const ox = p.x - v.x * s, oy = p.y - v.y * s, oz = p.z - v.z * s;
        if (kind < 0.55) {            // embers off the ball
          const a = Math.random() * 6.28, rr = r * (1.2 + Math.random() * 0.8);
          const x = ox + (_a.x * Math.cos(a) + _b.x * Math.sin(a)) * rr, y = oy + (_a.y * Math.cos(a) + _b.y * Math.sin(a)) * rr, z = oz + (_a.z * Math.cos(a) + _b.z * Math.sin(a)) * rr;
          const out = 0.6 + Math.random() * 1.2;
          this.trail.emit(x, y, z, back.x * speed * 0.08 + (x - ox) * out, back.y * speed * 0.08 + (y - oy) * out, back.z * speed * 0.08 + (z - oz) * out,
            1.2 + Math.random() * 2.2, r * (0.14 + Math.random() * 0.2), Math.random() < 0.7 ? [0.08, 0.6, 0.2] : [0.35, 0.7, 0.35]);
        } else if (kind < 0.64) {     // glowing rock breaking off it, tumbling away and cooling
          const a = Math.random() * 6.28, sp = (1.5 + Math.random() * 4) * k;
          this.trail.emit(ox, oy, oz, (_a.x * Math.cos(a) + _b.x * Math.sin(a)) * sp + back.x * speed * 0.1, (_a.y * Math.cos(a) + _b.y * Math.sin(a)) * sp + back.y * speed * 0.1 - k,
            (_a.z * Math.cos(a) + _b.z * Math.sin(a)) * sp + back.z * speed * 0.1, 1.5 + Math.random() * 2, r * (0.09 + Math.random() * 0.08), Math.random() < 0.5 ? [1.2, 0.55, 0.12] : [0.7, 1.1, 0.2]);
        } else if (kind < 0.8) {      // sparks flung wide
          const a = Math.random() * 6.28, sp = (4 + Math.random() * 10) * k;
          this.trail.emit(ox, oy, oz, (_a.x * Math.cos(a) + _b.x * Math.sin(a)) * sp + back.x * speed * 0.15, (_a.y * Math.cos(a) + _b.y * Math.sin(a)) * sp + back.y * speed * 0.15,
            (_a.z * Math.cos(a) + _b.z * Math.sin(a)) * sp + back.z * speed * 0.15, 0.5 + Math.random() * 0.9, r * 0.07, [0.9, 1.4, 0.8]);
        } else {                      // two streamers wound round the path
          const side = kind < 0.9 ? 0 : Math.PI, a = this.t * 9 + side, rr = r * 1.9;
          const x = ox + (_a.x * Math.cos(a) + _b.x * Math.sin(a)) * rr, y = oy + (_a.y * Math.cos(a) + _b.y * Math.sin(a)) * rr, z = oz + (_a.z * Math.cos(a) + _b.z * Math.sin(a)) * rr;
          this.trail.emit(x, y, z, back.x * speed * 0.03, back.y * speed * 0.03, back.z * speed * 0.03, 2.4 + Math.random() * 1.2, r * 0.2, side ? [0.12, 0.45, 0.6] : [0.25, 0.75, 0.15]);
        }
      }
    }
    this.trail.update(dt);
    this.smoke.update(dt);
  }
}


// ====================================================================== the deep sky
/** Space: stars, a nebula band, the world below with its rim of air, and the sun. */
export class Space {
  constructor() {
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0x010103);
    // stars
    const N = TOUCH_LITE ? 2500 : 6000, P = new Float32Array(N * 3), C = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * 6.28, r = 1400, q = Math.sqrt(1 - u * u);
      P.set([Math.cos(a) * q * r, u * r, Math.sin(a) * q * r], i * 3);
      const b = Math.pow(Math.random(), 3) * 2.2 + 0.3, tint = Math.random();
      C.set(tint < 0.2 ? [b * 0.8, b * 0.9, b * 1.3] : tint < 0.35 ? [b * 1.3, b * 1.1, b * 0.8] : [b, b, b], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(P, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(C, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: false, vertexColors: true, toneMapped: false, depthWrite: false }));
    s.add(this.stars);
    // the nebula: a band of faint cloud across the sky
    this.nebula = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        varying vec3 vD;
        ${NOISE}
        void main() {
          float bd = dot(vD, normalize(vec3(0.3, 0.8, 0.5))) / 0.32, band = exp(-bd * bd);
          float n = cFbm(vD * 4.0), m = cFbm(vD * 9.0 + 3.0);
          vec3 c = mix(vec3(0.05, 0.02, 0.09), vec3(0.03, 0.08, 0.12), m) * smoothstep(0.35, 0.8, n) * band * 1.6;
          c += vec3(0.12, 0.05, 0.1) * pow(smoothstep(0.55, 0.9, n * m * 1.6), 2.0) * band;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    s.add(this.nebula);
    // the world below, lit by the sun from the east, its night side to the west
    this.sunDir = new THREE.Vector3(0.75, 0.35, -0.55).normalize();
    const R = 900;
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.ShaderMaterial({
      uniforms: { uSun: { value: this.sunDir }, uTime: { value: 0 } },
      vertexShader: 'varying vec3 vN, vP; void main() { vN = normalize(position); vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uSun; uniform float uTime; varying vec3 vN, vP;
        ${NOISE}
        void main() {
          vec3 n = normalize(vN);
          float land = smoothstep(0.5, 0.56, cFbm(n * 3.2 + 2.0));
          float forest = cFbm(n * 12.0);
          vec3 ground = mix(vec3(0.02, 0.06, 0.16), mix(vec3(0.09, 0.16, 0.06), vec3(0.22, 0.2, 0.12), forest), land);
          float cl = smoothstep(0.66, 0.9, cFbm(n * 5.0 + vec3(uTime * 0.01, 0.0, 0.0)) * 0.7 + cFbm(n * 15.0) * 0.4);
          vec3 c = mix(ground, vec3(0.7), cl * 0.8);
          float day = dot(n, uSun);
          float lit = smoothstep(-0.12, 0.35, day);
          vec3 V = normalize(cameraPosition - vP);
          float rim = pow(clamp(1.0 - dot(n, V), 0.0, 1.0), 3.0);
          vec3 col = c * lit * 1.0 + vec3(0.12, 0.3, 0.7) * rim * 0.4 * (0.1 + lit);
          // the lights of towns on the night side
          col += vec3(1.0, 0.7, 0.3) * step(0.86, cNoise(n * 140.0)) * land * (1.0 - smoothstep(-0.2, 0.05, day)) * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
    this.planet.position.set(0, -R - 160, 0);
    s.add(this.planet);
    // its air: a slightly bigger shell glowing at the limb
    this.air = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 96, 64), new THREE.ShaderMaterial({
      uniforms: { uSun: { value: this.sunDir } },
      vertexShader: 'varying vec3 vN, vP; void main() { vN = normalize(mat3(modelMatrix) * normal); vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uSun; varying vec3 vN, vP;
        void main() {
          vec3 V = normalize(cameraPosition - vP);
          float f = pow(clamp(1.0 - abs(dot(normalize(vN), V)), 0.0, 1.0), 4.0);
          float lit = smoothstep(-0.3, 0.4, dot(normalize(vN), uSun));
          gl_FragColor = vec4(vec3(0.25, 0.5, 1.0) * f * (0.08 + 0.8 * lit), 1.0);
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.FrontSide, toneMapped: false,
    }));
    this.air.position.copy(this.planet.position);
    s.add(this.air);
    // the sun
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(3, 2.6, 2), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.sun.position.copy(this.sunDir).multiplyScalar(1300);
    this.sun.scale.setScalar(220);
    s.add(this.sun);
    // light for him: the sun, a little starlight, and the green fire round him
    const key = new THREE.DirectionalLight(0xfff0e0, 1.4); key.position.copy(this.sunDir); s.add(key);
    s.add(new THREE.AmbientLight(0x203040, 0.6));
    this.fire = new THREE.PointLight(0x60ff90, 7, 14, 1.6);
    s.add(this.fire);
    this.camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 5000);
  }

  update(t) { this.planet.material.uniforms.uTime.value = t; this.planet.rotation.y = t * 0.004; }
}
