// The second spellbook's workings: a wall of fire, a swarm of seeking missiles, beams held on
// the dead (fire, lightning that leaps body to body, a red thread that drinks their life), an
// arcane blast, a nova of ice, a meteor, a blizzard, a blink, a lance of bone that runs through
// them, a well of darkness that drags them in, a plague cloud, wheeling spirit blades and spikes
// of stone. Everything borrows Magic's particles, lights, decals, waves and arcs, and reaches the
// dead through its hooks: targets(), nearest(z, p), hitTest(p, d, far), onHit(def, at, dir, h, o),
// area(at, r, dmg, kind) (returns who it caught), smash(at, r, dmg) for pots and crates, and
// noise(at, r). What lingers on a body (frozen, chilled, burning, poisoned, shoved) is the
// zombie's own (zombies.js afflict); this only draws it.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const rnd = () => new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);
const flat = (v) => new THREE.Vector3(v.x, 0, v.z).normalize();
const disk = (r) => { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r; return [Math.cos(a) * d, Math.sin(a) * d]; };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();

function closestOnSeg(p, a, b, out = new THREE.Vector3()) {
  const ab = _c.subVectors(b, a), l = ab.lengthSq();
  const t = l > 0 ? Math.max(0, Math.min(1, _a.subVectors(p, a).dot(ab) / l)) : 0;
  return out.copy(a).addScaledVector(ab, t);
}

const beamVert = /* glsl */`
  uniform float time; uniform float len; uniform float wave;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() {
    vUv = uv;
    vec3 p = position;
    float s = sin(uv.y * 3.14159);
    p.x += wave * s * sin(uv.y * len * 2.3 - time * 9.0);
    p.z += wave * s * cos(uv.y * len * 1.9 - time * 7.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
// bright down the middle, fading to the edges, with pulses running along it; HDR so it blooms
const beamFrag = /* glsl */`
  uniform vec3 core; uniform vec3 edge; uniform float time; uniform float len; uniform float alpha;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float flow = 0.6 + 0.4 * sin(vUv.y * len * 5.0 - time * 38.0 + sin(vUv.x * 18.85) * 1.5);
    vec3 c = mix(edge, core, f * f * f);
    gl_FragColor = vec4(c * f * f * flow * alpha * smoothstep(0.0, 0.05, vUv.y), 1.0);
  }`;

/** A beam from a to b: nested additive tubes, widening away from the hand. */
class Beam {
  constructor(scene, layers) {
    this.scene = scene;
    this.layers = layers.map((o) => {
      const geo = new THREE.CylinderGeometry(1, o.tail ?? 0.4, 1, 12, 24, true).translate(0, 0.5, 0);
      const mat = new THREE.ShaderMaterial({ vertexShader: beamVert, fragmentShader: beamFrag, blending: THREE.AdditiveBlending,
        transparent: true, depthWrite: false, uniforms: { time: { value: 0 }, len: { value: 1 }, wave: { value: (o.wave || 0) / o.r },
          core: { value: o.core }, edge: { value: o.edge }, alpha: { value: o.alpha ?? 1 } } });
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false; m.renderOrder = 6; m.visible = false;
      scene.add(m);
      return { m, r: o.r };
    });
  }

  set(a, b, t) {
    const d = _b.subVectors(b, a), len = d.length();
    if (len < 1e-3) { this.hide(); return; }
    d.divideScalar(len);
    for (const { m, r } of this.layers) {
      m.visible = true;
      m.position.copy(a);
      m.quaternion.setFromUnitVectors(UP, d);
      m.scale.set(r, len, r);
      m.material.uniforms.time.value = t; m.material.uniforms.len.value = len;
    }
  }

  hide() { for (const l of this.layers) l.m.visible = false; }
  dispose() { for (const { m } of this.layers) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } }
}

export class Arcana {
  constructor(magic, Flames) {
    this.m = magic;
    this.Flames = Flames;
    this.scene = magic.scene;
    this.physics = magic.physics;
    this.time = 0;
    this.fires = [];     // walls of fire, burning craters
    this.missiles = [];  // the swarm: out (flying to its place), hover, seek
    this.novas = []; this.ice = []; this.meteors = []; this.storms = []; this.wells = []; this.clouds = [];
    this.spikes = []; this.stuck = [];
    this.blades = null;
    this.channels = new Set();
    this.swarmT = 0; this.swarmHeld = 0; this.swarmLight = null;
    this.geo = {
      shard: new THREE.OctahedronGeometry(0.07, 0),
      spike: new THREE.ConeGeometry(0.16, 1, 5).translate(0, 0.5, 0),
      stone: new THREE.ConeGeometry(0.34, 1, 6).translate(0, 0.5, 0),
      missile: new THREE.OctahedronGeometry(0.055, 0),
      blade: new THREE.OctahedronGeometry(1, 0),
      ball: new THREE.SphereGeometry(1, 16, 10),
      ring: new THREE.TorusGeometry(1, 0.035, 6, 48),
    };
    this.mat = {
      ice: new THREE.MeshBasicMaterial({ color: hdr('#d8f4ff', 1.5) }),
      ice2: new THREE.MeshBasicMaterial({ color: hdr('#7ab8f0', 1.3) }),
      stone: new THREE.MeshLambertMaterial({ color: 0x7a7064, flatShading: true }),
      void: new THREE.MeshBasicMaterial({ color: 0x000000 }),
      missile: new Map(),
    };
  }

  get sfx() { return this.m.sfx; }

  // -------------------------------------------------------------- helpers
  /** The dead that can be struck (not the buried, nor those lying still to fool you). */
  foes() { return (this.m.targets?.() || []).filter((z) => !z.dead && !z.gone && z.state !== 'buried' && z.state !== 'playdead'); }
  chest(z, out = new THREE.Vector3()) { return out.set(z.pos.x, z.pos.y + (z.mode === 'crawl' ? 0.35 : 1.15), z.pos.z); }
  cols(def) { return def.colors.slice(0, 3).map((c) => new THREE.Color(c)); }

  /** Nothing solid between a and b. */
  sees(a, b) {
    const d = _b.subVectors(b, a), len = d.length();
    if (len < 1e-3) return true;
    d.divideScalar(len);
    const h = this.physics.ray([a.x, a.y, a.z], [d.x, d.y, d.z], len);
    return !h || h.t > len - 0.3;
  }

  floorY(x, z, y) { const f = this.physics.floorAt(x, z, y, 0.1, 1.2); return f === -Infinity ? null : f; }

  /** Where you're looking: {p, n (null in the open air), d}. */
  aim(camera, far) {
    const o = camera.position, d = camera.getWorldDirection(new THREE.Vector3());
    const h = this.physics.ray([o.x, o.y, o.z], [d.x, d.y, d.z], far);
    return { p: o.clone().addScaledVector(d, h ? h.t : far), n: h ? new THREE.Vector3(...h.normal) : null, d };
  }

  /** Where a spell aimed at the ground lands: the floor under where you look, off any wall. */
  groundAt(camera, far) {
    const { p, n, d } = this.aim(camera, far);
    if (n && n.y < 0.6) p.addScaledVector(n, 0.6);
    const f = this.floorY(p.x, p.z, p.y + 0.5);
    if (f !== null && f > p.y - 40) p.y = f;
    return { p, d };
  }

  /** A spell's blow landing on z, coming from `from`: on the bone it would meet. */
  strike(z, from, def, dmg, o = {}) {
    const c = this.chest(z), d = c.clone().sub(from);
    const len = d.length();
    d.divideScalar(Math.max(len, 1e-3));
    let h = z.ray(from, d, len + 1);
    if (!h) { const n = this.m.nearest?.(z, c); if (!n) return; h = { ...n, t: 0, z }; }
    this.m.onHit?.(def, h.point.clone(), o.dir || d, h, { dmg, ...o });
  }

  /** The one of the dead nearest the line of `fwd` from `from`, within `maxAngle` and in sight. */
  lockOn(from, fwd, range, maxAngle) {
    let best = null, bs = Infinity;
    for (const z of this.foes()) {
      const c = this.chest(z), v = c.clone().sub(from), d = v.length();
      if (d > range || d < 0.3) continue;
      const ang = Math.acos(Math.min(1, v.dot(fwd) / d));
      if (ang > maxAngle) continue;
      const score = ang * 10 + d * 0.15;
      if (score < bs && this.sees(from, c)) { best = z; bs = score; }
    }
    return best;
  }

  emit(p, v, color, o) { this.m.particles.emit([p.x, p.y, p.z], [v.x, v.y, v.z], color, o); }
  flash(def, at, size, life) {
    const fb = this.m.sprite(def, size * 0.2, 4);
    fb.position.copy(at);
    this.m.flashes.push({ s: fb, age: 0, life, to: size });
  }
  screen(color, amount, shake = 0) {
    this.m.screen.color.set(color); this.m.screen.amount = Math.max(this.m.screen.amount, amount);
    this.m.shake = Math.max(this.m.shake, shake);
  }
  hands(def, k = 2.6) { this.m.vmFlash.color.set(def.light); this.m.vmFlash.amount = Math.max(this.m.vmFlash.amount, k); }

  // -------------------------------------------------------------- casting
  cast(def, from, dir, player, camera) {
    const how = { wall: this.wall, cone: this.cone, nova: this.nova, meteor: this.meteor, storm: this.storm,
      blink: this.blink, blades: this.bladesCast, spikes: this.spikesCast }[def.cast];
    how?.call(this, def, from, dir, player, camera);
  }

  /** The body of a 'bolt' spell (Magic flies it): a bone lance, a mote of darkness, a flask. */
  shotMesh(def) {
    let m;
    if (def.mesh === 'lance') {
      m = new THREE.Mesh(new THREE.ConeGeometry(0.045, 1.1, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: hdr('#f4ecd8', 1.4) }));
    } else if (def.mesh === 'void') {
      m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), this.mat.void.clone());
    } else {
      m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: hdr('#a8f040', 1.4) }));
    }
    this.scene.add(m);
    return m;
  }

  /** Where a 'bolt' spell came down (s: Magic's shot, n: the surface, null in the air). */
  landed(s, at, n, flesh) {
    const def = s.def;
    if (def.land === 'stick') {
      const cols = [new THREE.Color('#fffaf0'), new THREE.Color('#c8c0a0'), new THREE.Color('#90c8a0')];
      this.m.particles.burst(at, cols, 30, { speed: 5, size: 0.04, grav: 12, nrm: n, floor: n && n.y > 0.7 ? at.y : null });
      if (!flesh && n && s.mesh) { // it goes in a hand's breadth and stays, quivering
        const m = s.mesh;
        s.mesh = null;
        m.position.copy(at).addScaledVector(s.vel.clone().normalize(), 0.3);
        this.stuck.push({ m, q: m.quaternion.clone(), t: 0, life: 12 });
        this.sfx?.clang(true);
      }
    } else if (def.land === 'well') {
      this.well(def, at, n);
    } else if (def.land === 'cloud') {
      this.cloud(def, at);
    }
  }

  // -------------------------------------------------------------- held spells
  /** One frame of a held spell (p: main.js's pending cast). Returns how much of its drain it
   * costs this frame. */
  channel(p, at, dir, dt, player, camera) {
    if (!p.ch) {
      p.ch = { acc: 0, tick: 0, lights: [], loop: null };
      this.channels.add(p);
      this.sfx?.cast(p.def.kind);
      this.hands(p.def, 2);
    }
    const how = { swarm: this.swarmHold, beam: this.beamHold, chain: this.chainHold, drain: this.drainHold }[p.def.cast];
    return how.call(this, p.ch, p.def, at, dir, dt, player, camera);
  }

  endChannel(p) {
    const ch = p.ch;
    if (!ch) return;
    ch.beam?.dispose();
    for (const l of ch.lights) this.m.release(l);
    ch.loop?.stop();
    p.ch = null;
    this.channels.delete(p);
  }

  endChannels() { for (const p of [...this.channels]) this.endChannel(p); }

  /** Magic missiles: while held, more join the fan in front of you. */
  swarmHold(ch, def, at, dir, dt, player) {
    if (!ch.started) { ch.started = true; for (let i = 0; i < def.volley; i++) this.summon(def, at, player); }
    this.swarmHeld = 0.15;
    const waiting = () => this.missiles.filter((m) => m.state !== 'seek').length;
    ch.acc += dt;
    while (ch.acc > def.every) {
      ch.acc -= def.every;
      if (waiting() < def.max) this.summon(def, at, player);
    }
    return waiting() < def.max ? 1 : 0.15;   // a full fan costs little to keep
  }

  summon(def, at, player) {
    const used = new Set(this.missiles.filter((m) => m.state !== 'seek').map((m) => m.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const k = def.colors[2];
    if (!this.mat.missile.has(k)) this.mat.missile.set(k, new THREE.MeshBasicMaterial({ color: hdr(def.colors[1], 2.6) }));
    const mesh = new THREE.Mesh(this.geo.missile, this.mat.missile.get(k));
    mesh.scale.set(1, 1, 1.8);
    const halo = this.m.sprite(def, 0.3, 1.1);
    this.scene.add(mesh);
    const fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    this.missiles.push({ def, slot, state: 'out', pos: at.clone(), vel: rnd().multiplyScalar(2.5).addScaledVector(fwd, 5), mesh, halo,
      age: 0, hoverT: 0, spin: rnd(), target: null });
    this.m.particles.burst(at, this.cols(def), 8, { speed: 2, size: 0.025, grav: 0, life: 0.3 });
    this.sfx?.chime();
  }

  /** A missile's place in the fan: three rows of eight, curving round you at chest height. */
  slotPos(slot, player, camera, out) {
    const ring = Math.floor(slot / 8), j = slot % 8;
    const a = ((j + 0.5) / 8 - 0.5) * 2.2 + (ring % 2 ? 0.14 : 0);
    const r = 1.5 + ring * 0.45;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    const bob = Math.sin(this.time * 2.6 + slot * 1.3) * 0.05;
    const o = camera.position;
    return out.set(o.x + fx * ca + rx * sa, o.y - 0.3 + ring * 0.3 + 0.12 * Math.cos(a * 2) + bob, o.z + fz * ca + rz * sa);
  }

  /** Who the next missile goes for: near, ahead, and not already sought by several. */
  pickTarget(from, camera) {
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    const seeking = new Map();
    for (const m of this.missiles) if (m.state === 'seek' && m.target) seeking.set(m.target, (seeking.get(m.target) || 0) + 1);
    const cand = [];
    for (const z of this.foes()) {
      const c = this.chest(z), v = c.clone().sub(camera.position), d = v.length();
      if (d > 38) continue;
      const facing = v.dot(fwd) / Math.max(d, 1e-3);
      if (facing < -0.2) continue;
      cand.push({ z, c, s: d * (1.8 - facing) + (seeking.get(z) || 0) * 7 });
    }
    cand.sort((a, b) => a.s - b.s);
    for (const o of cand.slice(0, 6)) if (this.sees(from, o.c)) return o.z;
    return null;
  }

  updateMissiles(dt, camera, player) {
    this.swarmT -= dt; this.swarmHeld -= dt;
    if (this.swarmT <= 0) {   // one at a time, every half second, the longest waiting first
      let ms = null;
      for (const m of this.missiles) if (m.state === 'hover' && (!ms || m.hoverT > ms.hoverT)) ms = m;
      if (ms) {
        const tgt = this.pickTarget(ms.pos, camera);
        if (tgt || (this.swarmHeld <= 0 && ms.hoverT > 8)) {   // nothing to hunt for long: it goes where you look
          ms.state = 'seek'; ms.target = tgt; ms.age = 0;
          const to = tgt ? this.chest(tgt) : this.aim(camera, 60).p;
          ms.vel.copy(to.sub(ms.pos).normalize()).multiplyScalar(7);
          this.swarmT = ms.def.interval;
          this.sfx?.chime(true);
        }
      }
    }
    const live = [];
    const centre = new THREE.Vector3();
    let waiting = 0;
    for (const ms of this.missiles) {
      ms.age += dt;
      ms.mesh.rotation.x += dt * 11 * ms.spin.x; ms.mesh.rotation.y += dt * 13 * ms.spin.y; ms.mesh.rotation.z += dt * 9;
      ms.halo.material.rotation += dt * 6;
      const cols = this.cols(ms.def);
      if (ms.state !== 'seek') {
        // a spring to its place in the fan, spinning there
        const s = this.slotPos(ms.slot, player, camera, _a);
        const k = ms.state === 'out' ? 7 : 14;
        ms.vel.addScaledVector(_b.subVectors(s, ms.pos), k * k * dt).multiplyScalar(Math.max(0, 1 - 2 * k * dt * 0.9));
        ms.pos.addScaledVector(ms.vel, dt);
        if (ms.state === 'out' && (ms.pos.distanceTo(s) < 0.12 || ms.age > 0.8)) ms.state = 'hover';
        if (ms.state === 'hover') ms.hoverT += dt;
        if (Math.random() < dt * 10) {   // motes circling it
          const a = Math.random() * 6.28;
          this.emit(_b.set(ms.pos.x + Math.cos(a) * 0.09, ms.pos.y + (Math.random() - 0.5) * 0.06, ms.pos.z + Math.sin(a) * 0.09),
            _c.set(-Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6), cols[1 + Math.floor(Math.random() * 2)], { life: 0.3, size: 0.018, drag: 1 });
        }
        centre.add(ms.pos); waiting++;
      } else {
        // seeking: away fast, curling in on its quarry
        if (ms.target && (ms.target.dead || ms.target.gone)) ms.target = this.pickTarget(ms.pos, camera);
        const spd = Math.min(26, 7 + ms.age * 45);
        const d = ms.vel.clone().normalize();
        if (ms.target) d.lerp(this.chest(ms.target).sub(ms.pos).normalize(), Math.min(1, dt * (6 + ms.age * 10))).normalize();
        ms.vel.copy(d).multiplyScalar(spd);
        const step = spd * dt, p = ms.pos;
        const hit = this.physics.ray([p.x, p.y, p.z], [d.x, d.y, d.z], step);
        const flesh = this.m.hitTest?.(p, d, step);
        if (flesh && (!hit || flesh.t < hit.t)) {
          const at = p.clone().addScaledVector(d, flesh.t);
          this.m.onHit?.(ms.def, at.clone(), d.clone(), flesh, { dmg: ms.def.dmg, heavy: false, blow: 0.25 });
          this.pop(ms, at, null);
          continue;
        }
        if (hit || ms.age > 4) {
          const n = hit ? new THREE.Vector3(...hit.normal) : null;
          this.pop(ms, hit ? p.clone().addScaledVector(d, hit.t) : p.clone(), n);
          continue;
        }
        p.addScaledVector(d, step);
        for (let i = 0; i < 2; i++) this.emit(p.clone().addScaledVector(d, -Math.random() * step), rnd().multiplyScalar(0.3), cols[1 + i], { life: 0.25, size: 0.03, drag: 2 });
      }
      ms.mesh.position.copy(ms.pos); ms.halo.position.copy(ms.pos);
      live.push(ms);
    }
    this.missiles = live;
    // one light for the waiting fan
    if (waiting && !this.swarmLight) { this.swarmLight = this.m.grabLight('swarm'); this.swarmLight.light.color.set(live[0].def.light); }
    if (this.swarmLight) {
      if (!waiting) { this.m.release(this.swarmLight); this.swarmLight = null; }
      else {
        this.swarmLight.light.position.copy(centre.divideScalar(waiting));
        this.swarmLight.light.intensity = live[0].def.power * Math.min(1.6, 0.3 + waiting / 8) * (0.9 + 0.1 * Math.sin(this.time * 20));
        this.swarmLight.light.distance = 9;
      }
    }
  }

  pop(ms, at, n) {
    this.m.particles.burst(at, this.cols(ms.def), 18, { speed: 3.5, size: 0.035, grav: 3, nrm: n, life: 0.45 });
    this.m.waves.add(at, n, ms.def.light, { size: 0.7, life: 0.25, sphere: !n });
    this.m.flashAt(at, ms.def.light, 0.35);
    this.scene.remove(ms.mesh); this.scene.remove(ms.halo); ms.halo.material.dispose();
    this.sfx?.boom(0.06);
  }

  /** Fire beam: the jet, its light at both ends, scorch where it plays on stone. */
  beamHold(ch, def, at, dir, dt) {
    if (!ch.beam) {
      ch.beam = new Beam(this.scene, [{ r: 0.07, core: hdr('#fff6c0', 3), edge: hdr('#ffb040', 2.2) },
        { r: 0.34, tail: 0.25, core: hdr('#ffb040', 1.4), edge: hdr('#e0501c', 0.9), alpha: 0.7, wave: 0.03 }]);
      ch.lights = [this.m.grabLight('beam', true), this.m.grabLight('beam')];
      for (const l of ch.lights) l.light.color.set(def.light);
      ch.loop = this.sfx?.loop('fire', 0.9);
      ch.scorch = 0;
    }
    const hit = this.physics.ray([at.x, at.y, at.z], [dir.x, dir.y, dir.z], def.range);
    const flesh = this.m.hitTest?.(at, dir, hit ? hit.t : def.range);
    const len = flesh ? flesh.t : hit ? hit.t : def.range;
    const end = at.clone().addScaledVector(dir, len);
    ch.beam.set(at, end, this.time);
    const cols = this.cols(def);
    for (let i = 0; i < 26; i++) {   // the jet of flame along it, widening
      const t = Math.random() * len, w = 0.04 + 0.22 * t / def.range;
      const p = at.clone().addScaledVector(dir, t).add(rnd().multiplyScalar(w));
      this.emit(p, dir.clone().multiplyScalar(5 + Math.random() * 7).add(rnd().multiplyScalar(1.2)), cols[Math.floor(Math.random() * 3)],
        { life: 0.1 + Math.random() * 0.2, size: 0.05 + 0.12 * t / def.range, grav: -1.5, drag: 2 });
    }
    if (hit || flesh) {
      const n = flesh ? dir.clone().negate() : new THREE.Vector3(...hit.normal);
      this.m.particles.burst(end, cols, 5, { speed: 4, size: 0.06, grav: 3, nrm: n, life: 0.5 });
      if (Math.random() < dt * 12) this.m.smoke?.emit(end.clone().addScaledVector(n, 0.2), new THREE.Vector3(0, 1, 0), { life: 2, size: 0.4, grow: 0.7, alpha: 0.3, shade: 0.1 });
      if (!flesh && (ch.scorch -= dt) <= 0) { ch.scorch = 0.35; this.m.decals.add('scorch', end, n, 1 + Math.random() * 0.4, { life: 25 }); }
    }
    if ((ch.tick -= dt) <= 0) {
      ch.tick = 0.2;
      if (flesh) { this.m.onHit?.(def, end.clone(), dir.clone(), flesh, { dmg: def.dmg, heavy: false, blow: 0.12 }); flesh.z.ignite(3, 8); }
      for (const z of this.foes()) if (z !== flesh?.z && this.chest(z).distanceTo(end) < 1.4) { z.harm(def.dmg * 0.5); z.ignite(3, 6); }
      this.m.smash?.(end, 0.8, 12);
      this.m.noise?.(end, 14);
    }
    const [far, near] = ch.lights;
    far.light.position.copy(end).addScaledVector(dir, -0.4);
    far.light.intensity = def.power * (0.8 + 0.4 * Math.random()); far.light.distance = 12;
    near.light.position.copy(at); near.light.intensity = 9; near.light.distance = 6;
    this.hands(def, 2.4);
    return 1;
  }

  /** Chain lightning: from the hand to the first it strikes, then on to the nearest of the others. */
  chainHold(ch, def, at, dir, dt, player, camera) {
    if (!ch.loop) {
      ch.lights = [this.m.grabLight('chain', true), this.m.grabLight('chain')];
      for (const l of ch.lights) l.light.color.set(def.light);
      ch.loop = this.sfx?.loop('lightning');
      ch.nodes = [];
    }
    if ((ch.tick -= dt) <= 0) {
      ch.tick = 0.2;
      const hit = this.physics.ray([at.x, at.y, at.z], [dir.x, dir.y, dir.z], def.range);
      const wallT = hit ? hit.t : def.range;
      let first = this.m.hitTest?.(at, dir, wallT)?.z || null;
      if (first && (first.dead || first.state === 'playdead')) first = null;
      if (!first) first = this.lockOn(at, camera.getWorldDirection(new THREE.Vector3()), def.range, 0.12);   // it bends to the nearest near your aim
      ch.end = at.clone().addScaledVector(dir, wallT);
      ch.wall = hit ? new THREE.Vector3(...hit.normal) : null;
      ch.nodes = [];
      if (first) {
        ch.nodes.push(first);
        let last = first;
        for (let j = 0; j < def.jumps; j++) {
          const from = this.chest(last);
          let best = null, bd = def.reach;
          for (const z of this.foes()) {
            if (ch.nodes.includes(z)) continue;
            const d = this.chest(z).distanceTo(from);
            if (d < bd && this.sees(from, this.chest(z))) { best = z; bd = d; }
          }
          if (!best) break;
          ch.nodes.push(best);
          last = best;
        }
        ch.nodes.forEach((z, j) => {
          this.strike(z, j ? this.chest(ch.nodes[j - 1]) : at, def, def.dmg * Math.pow(0.85, j), { heavy: false, blow: 0.06 });
          z.chill(0.3);   // locked rigid while it runs through them
        });
        this.sfx?.zap();
        this.m.noise?.(this.chest(first), 18);
      } else if (hit && Math.random() < 0.5) this.m.decals.add('scorch', ch.end, ch.wall, 0.5 + Math.random() * 0.4, { life: 20 });
    }
    const cols = this.cols(def);
    const pts = [at.clone(), ...ch.nodes.filter((z) => !z.gone).map((z) => this.chest(z).add(rnd().multiplyScalar(0.18)))];
    if (pts.length === 1) pts.push(ch.end.clone());
    for (let j = 1; j < pts.length; j++) {
      this.bolt(pts[j - 1], pts[j], cols, j === 1 ? 0.05 : 0.04);
      const jag = j === 1 ? 0.5 : 1;   // the stroke from the hand runs close by the eye: kept tighter
      this.m.arcs.add(pts[j - 1], pts[j], 0.05, 0.14 * jag);
      if (Math.random() < 0.6) this.m.arcs.add(pts[j - 1], pts[j], 0.04, 0.26 * jag);
      this.m.particles.burst(pts[j], cols, 3, { speed: 3, size: 0.03, grav: 8, life: 0.4 });
      if (Math.random() < dt * 10) this.m.arcs.add(pts[j], pts[j].clone().add(rnd().normalize().multiplyScalar(0.6 + Math.random())), 0.08, 0.35);
    }
    const [far, near] = ch.lights;
    far.light.position.copy(pts[1]); far.light.intensity = def.power * (0.4 + Math.random() * 0.9); far.light.distance = 14;
    near.light.position.copy(at); near.light.intensity = 8 * Math.random() + 4; near.light.distance = 6;
    this.hands(def, 1.6 + Math.random() * 1.4);
    if (Math.random() < dt * 3) this.screen(def.light, 0.15);
    return 1;
  }

  /** A thick jagged bolt from a to b for one frame: glowing beads along a crooked path (the
   * arcs are only a pixel wide), bright enough to bloom. */
  bolt(a, b, cols, size) {
    const d = _c.subVectors(b, a), len = d.length(), n = Math.max(4, Math.min(24, Math.round(len * 2.5)));
    const side = new THREE.Vector3();
    let prev = a.clone();
    for (let i = 1; i <= n; i++) {
      const k = i / n, next = a.clone().addScaledVector(d, k);
      if (i < n) next.add(side.copy(rnd()).multiplyScalar(len * 0.05 * Math.sin(k * Math.PI)));
      for (let s = 0; s < 3; s++) this.emit(prev.clone().lerp(next, s / 3), _b.set(0, 0, 0), s ? cols[1] : cols[0], { life: 0.045, size: size * (s ? 0.8 : 1.2), drag: 0 });
      prev = next;
    }
  }

  /** Life drain: a thread to the dead nearest your aim, its life running back down it into you. */
  drainHold(ch, def, at, dir, dt, player, camera) {
    if (!ch.beam) {
      ch.beam = new Beam(this.scene, [{ r: 0.035, tail: 1, core: hdr('#ffd0d0', 2.6), edge: hdr('#ff3040', 2), wave: 0.1 },
        { r: 0.13, tail: 0.6, core: hdr('#ff6070', 1.1), edge: hdr('#c01828', 0.8), alpha: 0.55, wave: 0.14 }]);
      ch.lights = [this.m.grabLight('drain', true)];
      ch.lights[0].light.color.set(def.light);
      ch.loop = this.sfx?.loop('drain');
      ch.tick = 0.25;
    }
    let z = ch.target;
    if (!(z && !z.dead && !z.gone && this.chest(z).distanceTo(at) < def.range + 4 && this.sees(at, this.chest(z))))
      z = ch.target = this.lockOn(at, camera.getWorldDirection(new THREE.Vector3()), def.range, 0.3);
    const cols = this.cols(def), l = ch.lights[0].light;
    if (!z) {   // nothing to fasten on: a few red wisps from the fingers
      ch.beam.hide();
      if (Math.random() < dt * 30) this.emit(at, dir.clone().multiplyScalar(2).add(rnd().multiplyScalar(0.6)), cols[1], { life: 0.4, size: 0.03, drag: 2 });
      l.position.copy(at); l.intensity = 3; l.distance = 4;
      return 0.35;
    }
    const c = this.chest(z);
    ch.beam.set(at, c, this.time);
    const back = at.clone().sub(c);
    for (let i = 0; i < 4; i++) if (Math.random() < dt * 40) {   // its life, running down the thread to you
      const p = c.clone().add(rnd().multiplyScalar(0.3));
      this.emit(p, at.clone().sub(p).divideScalar(0.4), cols[i % 3], { life: 0.4, size: 0.035 + Math.random() * 0.03, drag: 0 });
    }
    if (Math.random() < dt * 6) z.owner.gore?.spray(c, back.clone().normalize(), 3, { speed: 3.5, spread: 0.25 });
    if ((ch.tick -= dt) <= 0) {
      ch.tick = 0.25;
      z.harm(def.dmg);
      player.health = Math.min(player.maxHealth, player.health + def.dmg * def.heal);
      this.hands(def, 2.4);
      if (z.dead) {   // the last of it, all at once
        for (let i = 0; i < 50; i++) { const p = c.clone().add(rnd().multiplyScalar(0.5)); this.emit(p, at.clone().sub(p).divideScalar(0.5 + Math.random() * 0.2), cols[i % 3], { life: 0.6, size: 0.05, drag: 0 }); }
        player.health = Math.min(player.maxHealth, player.health + 10);
        this.screen(def.light, 0.3);
        ch.target = null;
      }
    }
    l.position.copy(c); l.intensity = def.power * (0.8 + 0.2 * Math.sin(this.time * 14)); l.distance = 8;
    return 1;
  }

  // -------------------------------------------------------------- cast spells
  /** A wall of fire across where you look. */
  wall(def, from, dir, player, camera) {
    const { p: c, d } = this.groundAt(camera, def.range);
    const fwd = flat(d), side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const pts = [], n = Math.round(def.length * 2.4);
    for (let row = 0; row < 2; row++) for (let i = 0; i < n; i++) {
      const s = (i / (n - 1) - 0.5) * def.length + (row ? 0.19 : 0), o = row ? 0.22 : -0.1;
      const x = c.x + side.x * s + fwd.x * o, z = c.z + side.z * s + fwd.z * o;
      const y = this.floorY(x, z, c.y + 1.2);
      if (y === null || Math.abs(y - c.y) > 2.2) continue;
      pts.push([x, y, z, row ? 0.9 + Math.random() * 0.5 : 1.4 + Math.random() * 0.7]);
    }
    if (!pts.length) { this.sfx?.fizzle(); return; }
    const half = def.length / 2 + 0.4;
    const zone = (p) => { const dx = p.x - c.x, dz = p.z - c.z; return Math.abs(dx * side.x + dz * side.z) < half && Math.abs(dx * fwd.x + dz * fwd.z) < 0.9 && Math.abs(p.y - c.y) < 2.5; };
    this.fire(def, pts, def.duration, zone, [c.clone().addScaledVector(side, -def.length / 4), c.clone().addScaledVector(side, def.length / 4)]);
    const cols = this.cols(def);
    for (let i = -1; i <= 1; i++) this.m.decals.add('scorch', c.clone().addScaledVector(side, i * def.length / 3).setY(c.y + 0.01), UP, 3, { life: 30 });
    for (const q of pts) {   // it bursts up out of the ground
      this.m.particles.burst(_a.set(q[0], q[1] + 0.2, q[2]), cols, 6, { speed: 4, size: 0.07, grav: -1, life: 0.6, nrm: UP });
      if (Math.random() < 0.3) this.m.smoke?.emit(new THREE.Vector3(q[0], q[1] + 1, q[2]), new THREE.Vector3(0, 1.2, 0), { life: 3, size: 0.5, grow: 0.8, alpha: 0.3, shade: 0.1 });
    }
    this.m.waves.add(c.clone().setY(c.y + 0.1), UP, def.light, { size: def.length * 0.6, life: 0.4 });
    this.hands(def);
    this.sfx?.boom(0.6);
    this.m.noise?.(c, 20);
  }

  /** Flames standing on the ground for `life` seconds: whatever `zone` holds burns. */
  fire(def, pts, life, zone, lightAt) {
    const flames = new this.Flames(this.scene, pts);
    const lights = lightAt.slice(0, 2).map((p, i) => {
      const l = this.m.grabLight('fire', i === 0);
      l.light.color.set(def.light);
      return { l, p: p.clone().add(new THREE.Vector3(0, 1, 0)) };
    });
    this.fires.push({ def, pts, flames, base: Float32Array.from(pts.map((q) => q[3])), t: 0, life, zone, lights, tick: 0,
      touched: new Set(), loop: this.sfx?.loop('fire', 0.45) });
  }

  updateFires(dt, camera, height) {
    this.fires = this.fires.filter((f) => {
      f.t += dt;
      const k = Math.max(0, Math.min(1, f.t / 0.35) * Math.min(1, (f.life - f.t) / 1.2));
      const sz = f.flames.points.geometry.attributes.size;
      for (let i = 0; i < f.base.length; i++) sz.array[i] = f.base[i] * k * (0.85 + 0.15 * Math.sin(this.time * 7 + i * 1.7));
      sz.needsUpdate = true;
      f.flames.update(this.time, camera, height);
      const cols = this.cols(f.def);
      for (let i = 0; i < 3; i++) if (Math.random() < dt * 45 * k) {   // embers and smoke off the top
        const q = f.pts[Math.floor(Math.random() * f.pts.length)];
        this.emit(_a.set(q[0] + (Math.random() - 0.5) * 0.4, q[1] + 0.3 + Math.random() * q[3] * 0.6, q[2] + (Math.random() - 0.5) * 0.4),
          _b.set((Math.random() - 0.5) * 0.6, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 0.6), cols[i], { life: 0.5 + Math.random() * 0.5, size: 0.04, grav: -0.5, drag: 1 });
      }
      if (Math.random() < dt * 10 * k) {
        const q = f.pts[Math.floor(Math.random() * f.pts.length)];
        this.m.smoke?.emit(new THREE.Vector3(q[0], q[1] + q[3] + 0.3, q[2]), new THREE.Vector3(0.1, 1, 0), { life: 3, size: 0.5, grow: 0.7, alpha: 0.25, shade: 0.1 });
      }
      for (const { l, p } of f.lights) {
        l.light.position.copy(p);
        l.light.intensity = f.def.power * k * (0.75 + 0.25 * Math.sin(this.time * 23 + p.x) * Math.sin(this.time * 7));
        l.light.distance = 12;
      }
      if ((f.tick -= dt) <= 0 && k > 0.3) {   // what stands in it burns
        f.tick = 0.25;
        for (const z of this.foes()) if (f.zone(z.pos)) {
          z.harm(f.def.dps * 0.25); z.ignite(4, f.def.burn);
          if (!f.touched.has(z)) { f.touched.add(z); this.strike(z, z.pos.clone().add(new THREE.Vector3(Math.random() - 0.5, 0.3, Math.random() - 0.5)), f.def, 12, { heavy: false, blow: 0 }); }
        }
      }
      if (f.t < f.life) return true;
      this.scene.remove(f.flames.points); f.flames.points.geometry.dispose(); f.flames.mat.dispose();
      for (const { l } of f.lights) this.m.release(l);
      f.loop?.stop();
      return false;
    });
  }

  /** Arcane blast: a cone of force from the hands. */
  cone(def, from, dir, player, camera) {
    const d = camera.getWorldDirection(new THREE.Vector3());
    const cosA = Math.cos(def.angle), cols = this.cols(def);
    for (const z of this.foes()) {
      const c = this.chest(z), v = c.clone().sub(from), dist = v.length();
      if (dist > def.range || (dist > 1.4 && v.dot(d) / dist < cosA) || !this.sees(from, c)) continue;
      const k = 1 - 0.6 * dist / def.range;
      this.strike(z, from, def, def.dmg * k, { heavy: true, blow: 0.5 });
      const f = flat(v);
      z.shove(f.x * def.force * k, f.z * def.force * k, 3 * k);
    }
    this.m.smash?.(from.clone().addScaledVector(d, 3), 3.5, 35);
    for (let i = 0; i < 280; i++) {
      const v = d.clone().addScaledVector(rnd(), Math.tan(def.angle) * Math.random()).normalize().multiplyScalar(8 + Math.random() * 18);
      this.emit(from, v, cols[i % 3], { life: 0.3 + Math.random() * 0.35, size: 0.04 + Math.random() * 0.08, drag: 2.5 });
    }
    for (const [s, size, life] of [[0.7, 2.2, 0.3], [2.6, 4.2, 0.4], [5, 6.5, 0.5]]) this.m.waves.add(from.clone().addScaledVector(d, s), d, def.light, { size, life });
    this.flash(def, from.clone().addScaledVector(d, 1), 3, 0.3);
    this.m.flashAt(from.clone().addScaledVector(d, 1.5), def.light, 1.4);
    this.screen(def.light, 0.45, 0.9);
    this.hands(def, 3);
    this.sfx?.boom(0.8);
    this.m.noise?.(from, 22);
  }

  /** Frost nova: a ring of ice running out from your feet, freezing all it passes. */
  nova(def, from, dir, player) {
    const c = player.pos.clone(), R = def.radius, cols = this.cols(def);
    const spikes = [];
    for (let i = 0; i < 64; i++) {
      const a = Math.random() * Math.PI * 2, r = 1.2 + Math.sqrt(Math.random()) * (R - 1.2);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      const y = this.floorY(x, z, c.y + 1.5);
      if (y === null || Math.abs(y - c.y) > 2) continue;
      spikes.push({ p: new THREE.Vector3(x, y, z), a, r, h: 0.35 + Math.random() * (1.2 - 0.5 * r / R) });
    }
    spikes.sort((p, q) => p.r - q.r);
    this.novas.push({ def, c, R, t: 0, spikes, i: 0, hit: new Set() });
    const feet = c.clone().setY(c.y + 0.08);
    this.m.waves.add(feet, UP, def.light, { size: R, life: 0.5 });
    this.m.waves.add(feet, UP, 0xffffff, { size: R * 0.6, life: 0.32 });
    this.m.waves.add(c.clone().setY(c.y + 1), null, def.light, { size: 2.5, life: 0.35, sphere: true });
    for (let i = 0; i < 320; i++) {
      const a = Math.random() * Math.PI * 2, s = 10 + Math.random() * 14;
      this.emit(_a.set(c.x, c.y + 0.2 + Math.random() * 1.4, c.z), _b.set(Math.cos(a) * s, Math.random() * 2, Math.sin(a) * s), cols[i % 3], { life: 0.5 + Math.random() * 0.3, size: 0.04 + Math.random() * 0.06, drag: 2.6, grav: 2 });
    }
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2;
      this.m.smoke?.emit(new THREE.Vector3(c.x + Math.cos(a) * 2, c.y + 0.4, c.z + Math.sin(a) * 2), new THREE.Vector3(Math.cos(a) * 6, 0.3, Math.sin(a) * 6),
        { life: 2.2, size: 0.8, grow: 1, alpha: 0.32, shade: 1.3, tint: 3 });
    }
    this.m.decals.add('frost', feet, UP, R * 1.6, { life: 14 });
    this.m.flashAt(c.clone().setY(c.y + 1), def.light, 1.6, true);
    this.screen(def.light, 0.5, 0.7);
    this.hands(def, 3);
    this.sfx?.freeze(); this.sfx?.boom(0.5);
    this.m.noise?.(c, 18);
  }

  updateNovas(dt) {
    this.novas = this.novas.filter((n) => {
      n.t += dt;
      const front = n.t * 24;
      while (n.i < n.spikes.length && n.spikes[n.i].r < front) this.iceSpike(n.spikes[n.i++], n.def);
      for (const z of this.foes()) {
        if (n.hit.has(z)) continue;
        const d = Math.hypot(z.pos.x - n.c.x, z.pos.z - n.c.z);
        if (d > Math.min(front, n.R) || Math.abs(z.pos.y - n.c.y) > 3) continue;
        n.hit.add(z);
        z.harm(n.def.dmg); z.freeze(n.def.freeze); z.chill(n.def.freeze + 3);   // and slow a while after it thaws
        for (let k = 0; k < 2; k++) {   // rime where the cold bit in
          const b = this.m.nearest?.(z, this.chest(z).add(rnd().multiplyScalar(0.5)));
          if (b) z.wound(b.point, b.bone, 0.05, 3);
        }
        this.m.decals.add('frost', z.pos.clone().setY(z.pos.y + 0.02), UP, 1.4, { life: 12 });
        this.m.particles.burst(this.chest(z), this.cols(n.def), 30, { speed: 3, size: 0.05, grav: 6, life: 0.7 });
      }
      return front < n.R + 2;
    });
  }

  iceSpike(s, def) {
    const m = new THREE.Mesh(this.geo.spike, Math.random() < 0.5 ? this.mat.ice : this.mat.ice2);
    m.position.copy(s.p);
    m.quaternion.setFromUnitVectors(UP, _a.set(Math.cos(s.a) * 0.45, 1, Math.sin(s.a) * 0.45).normalize());
    m.scale.set(0.01, 0.01, 0.01);
    this.scene.add(m);
    this.ice.push({ m, t: 0, life: 2 + Math.random() * 1.2, h: s.h, w: 0.8 + Math.random() * 0.7 });
    if (Math.random() < 0.5) this.m.particles.burst(s.p, this.cols(def), 5, { speed: 2.5, size: 0.04, grav: 8, life: 0.4, nrm: UP });
  }

  updateIce(dt) {
    this.ice = this.ice.filter((s) => {
      s.t += dt;
      const g = Math.min(1, s.t / 0.12), k = s.t > s.life ? Math.max(0, 1 - (s.t - s.life) / 0.4) : 1;
      s.m.scale.set(s.w * k, s.h * g * k + 0.001, s.w * k);
      if (s.t < s.life + 0.4) return true;
      this.scene.remove(s.m);
      return false;
    });
  }

  /** A meteor called down on where you look. */
  meteor(def, from, dir, player, camera) {
    const { p: T, d } = this.groundAt(camera, def.range);
    const f = flat(d);
    let S = T.clone().addScaledVector(f, -12).add(new THREE.Vector3(0, 34, 0));
    const roof = this.physics.ray([T.x, T.y + 0.3, T.z], [0, 1, 0], 40);
    if (roof) S = T.clone().add(new THREE.Vector3(0, Math.max(1.5, roof.t - 0.4), 0));   // under a roof it drops from the ceiling
    const fall = def.fall * Math.min(1, Math.max(0.35, S.distanceTo(T) / 36));
    const geo = new THREE.IcosahedronGeometry(0.55, 1), pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {   // lumpy (the same lump for the same corner)
      _a.fromBufferAttribute(pa, i);
      const h = Math.sin(_a.x * 12.9 + _a.y * 78.2 + _a.z * 37.7) * 43758.5;
      _a.multiplyScalar(0.82 + 0.3 * (h - Math.floor(h)));
      pa.setXYZ(i, _a.x, _a.y, _a.z);
    }
    const rock = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hdr('#ff6a20', 1.1) }));
    this.scene.add(rock);
    const light = this.m.grabLight('meteor', true);
    light.light.color.set(def.light);
    this.m.decals.add('rune', T.clone().setY(T.y + 0.02), UP, def.radius * 1.3, { life: fall + 0.8, glow: true, spin: 1.4, color: new THREE.Color(2.6, 0.9, 0.3) });
    this.meteors.push({ def, S, T, fall, t: 0, rock, core: this.m.sprite(def, 2.2, 3.2), halo: this.m.sprite(def, 5, 0.8), light, ring: 0 });
    this.hands(def, 2);
    this.sfx?.chargeUp(fall);
  }

  updateMeteors(dt) {
    this.meteors = this.meteors.filter((m) => {
      m.t += dt;
      const k = Math.min(1, m.t / m.fall), p = m.S.clone().lerp(m.T, k * k);
      const back = m.S.clone().sub(m.T).normalize();
      m.rock.position.copy(p); m.rock.rotation.x += dt * 3; m.rock.rotation.y += dt * 2;
      m.core.position.copy(p); m.halo.position.copy(p);
      m.core.material.rotation += dt * 6; m.halo.material.rotation -= dt * 3;
      const cols = this.cols(m.def);
      for (let i = 0; i < 30; i++) {
        const q = p.clone().addScaledVector(back, Math.random() * 1.5).add(rnd().multiplyScalar(0.4));
        this.emit(q, back.clone().multiplyScalar(4).add(rnd()), cols[i % 3], { life: 0.4 + Math.random() * 0.4, size: 0.15 + Math.random() * 0.15, drag: 1.5 });
      }
      if (Math.random() < dt * 40) this.m.smoke?.emit(p.clone().addScaledVector(back, 1), back.clone().multiplyScalar(1.5), { life: 3, size: 0.8, grow: 1.2, alpha: 0.4, shade: 0.15 });
      m.light.light.position.copy(p);
      m.light.light.intensity = m.def.power * (0.4 + 0.6 * k); m.light.light.distance = 20 + 20 * k;
      if ((m.ring -= dt) <= 0) { m.ring = 0.3; this.m.waves.add(m.T.clone().setY(m.T.y + 0.05), UP, m.def.light, { size: m.def.radius * 0.7, life: 0.3 }); }
      if (k < 1) return true;
      this.scene.remove(m.rock); m.rock.geometry.dispose(); m.rock.material.dispose();
      for (const s of [m.core, m.halo]) { this.scene.remove(s); s.material.dispose(); }
      this.m.release(m.light, 2.2, m.T.clone().setY(m.T.y + 1.5));
      this.meteorStrike(m.def, m.T);
      return false;
    });
  }

  meteorStrike(def, T) {
    const R = def.radius, cols = this.cols(def);
    for (const h of this.m.area?.(T, R, def.dmg, 'fire') || []) {   // flung, burning
      const f = flat(h.dir);
      h.z.shove(f.x * 15 * h.k, f.z * 15 * h.k, 7 * h.k);
      h.z.ignite(5, 8);
    }
    this.m.smash?.(T, R, 90);
    this.m.noise?.(T, 45);
    this.flash(def, T.clone().setY(T.y + 1), 10, 0.7);
    this.m.waves.add(T.clone().setY(T.y + 1), null, def.light, { size: 7, life: 0.7, sphere: true });
    this.m.waves.add(T.clone().setY(T.y + 0.1), UP, def.light, { size: 13, life: 0.8 });
    this.m.decals.add('scorch', T.clone().setY(T.y + 0.01), UP, 7, { life: 60 });
    this.m.particles.burst(T.clone().setY(T.y + 0.3), cols, 320, { speed: 16, size: 0.18, grav: 5, floor: T.y, life: 1.2, nrm: UP });
    const rock = [new THREE.Color('#3a2a24'), new THREE.Color('#6a4a30'), new THREE.Color('#ff7a30')];
    this.m.particles.burst(T.clone().setY(T.y + 0.3), rock, 90, { speed: 12, size: 0.09, grav: 14, floor: T.y, life: 2, nrm: UP, drag: 0.5 });
    for (let i = 0; i < 40; i++) this.m.smoke?.emit(T.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)),
      new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2), { life: 5 + Math.random() * 3, size: 1.2, grow: 1.4, alpha: 0.45, shade: 0.12 });
    // the crater burns on
    const pts = [];
    for (let i = 0; i < 18; i++) {
      const [x, z] = disk(3.6), y = this.floorY(T.x + x, T.z + z, T.y + 1);
      if (y !== null && Math.abs(y - T.y) < 1.5) pts.push([T.x + x, y, T.z + z, 0.7 + Math.random() * 0.9]);
    }
    if (pts.length) this.fire({ ...def, dps: 10, burn: 6, power: 16 }, pts, 7, (p) => Math.hypot(p.x - T.x, p.z - T.z) < 3.8 && Math.abs(p.y - T.y) < 2.5, [T]);
    this.screen(def.light, 0.9, 2.8);
    this.sfx?.boom(1.6);
  }

  /** A blizzard on the ground you mark. */
  storm(def, from, dir, player, camera) {
    const { p: c } = this.groundAt(camera, def.range);
    const roof = this.physics.ray([c.x, c.y + 0.3, c.z], [0, 1, 0], 12);
    const top = roof ? Math.max(2.2, roof.t - 0.2) : 10;
    const light = this.m.grabLight('storm');
    light.light.color.set(def.light);
    this.storms.push({ def, c, top, t: 0, acc: 0, tick: 0, light, shards: [], loop: this.sfx?.loop('wind', 0.8) });
    this.m.decals.add('frost', c.clone().setY(c.y + 0.02), UP, def.radius * 2.2, { life: def.duration + 6 });
    this.hands(def);
  }

  updateStorms(dt) {
    this.storms = this.storms.filter((s) => {
      s.t += dt;
      const def = s.def, R = def.radius, c = s.c, cols = this.cols(def);
      const on = s.t < def.duration, k = Math.min(1, s.t / 0.6) * Math.min(1, Math.max(0, (def.duration - s.t) / 1.2));
      if (on) {
        s.acc += dt * 34;
        while (s.acc > 1) {   // a shard, slanting down out of the cloud
          s.acc -= 1;
          const [x, z] = disk(R), fy = this.floorY(c.x + x, c.z + z, c.y + 1.5) ?? c.y;
          if (Math.abs(fy - c.y) > 3) continue;
          const v = new THREE.Vector3(2.5, -20, 1), tFall = (c.y + s.top - fy) / 20;
          const m = new THREE.Mesh(this.geo.shard, this.mat.ice);
          m.position.set(c.x + x - v.x * tFall, c.y + s.top, c.z + z - v.z * tFall);
          m.scale.set(1, 1, 3.5);
          m.lookAt(m.position.clone().add(v));
          this.scene.add(m);
          s.shards.push({ m, v, fy });
        }
        if (Math.random() < dt * 14) {
          const [x, z] = disk(R * 1.1);
          this.m.smoke?.emit(new THREE.Vector3(c.x + x, c.y + s.top - 0.3, c.z + z), new THREE.Vector3(0.4, -0.05, 0.1), { life: 2.5, size: 1.8, grow: 0.6, alpha: 0.35, shade: 0.5, tint: 3 });
        }
        for (let i = 0; i < 2; i++) if (Math.random() < dt * 45) {   // snow whirling in it
          const [x, z] = disk(R);
          this.emit(_a.set(c.x + x, c.y + Math.random() * s.top, c.z + z), _b.set(2 + Math.random(), -3, 0.6), cols[0], { life: 1.2, size: 0.025, drag: 0.2 });
        }
      }
      s.shards = s.shards.filter((sh) => {
        sh.m.position.addScaledVector(sh.v, dt);
        if (sh.m.position.y > sh.fy) return true;
        const p = sh.m.position.clone().setY(sh.fy + 0.03);
        this.scene.remove(sh.m);
        this.m.particles.burst(p, cols, 6, { speed: 2.2, size: 0.035, grav: 9, life: 0.4, nrm: UP, floor: sh.fy });
        if (Math.random() < 0.06) this.m.decals.add('frost', p, UP, 0.6 + Math.random() * 0.5, { life: 10 });
        for (const z of this.foes()) {
          if (Math.hypot(z.pos.x - p.x, z.pos.z - p.z) > 0.8 || Math.abs(z.pos.y - p.y) > 2) continue;
          z.harm(def.dmg); z.chill(2.5);
          if (Math.random() < 0.3) { const b = this.m.nearest?.(z, sh.m.position); if (b) z.wound(b.point, b.bone, 0.035, 3); }
        }
        return false;
      });
      if ((s.tick -= dt) <= 0 && on) {
        s.tick = 0.5;
        for (const z of this.foes()) if (Math.hypot(z.pos.x - c.x, z.pos.z - c.z) < R && Math.abs(z.pos.y - c.y) < 3) z.chill(1.2);
        this.m.noise?.(c, 10);
      }
      s.light.light.position.set(c.x, c.y + s.top * 0.6, c.z);
      s.light.light.intensity = def.power * k * (0.8 + 0.2 * Math.random()); s.light.light.distance = 14;
      if (on || s.shards.length) return true;
      this.m.release(s.light);
      s.loop?.stop();
      return false;
    });
  }

  /** Blink: gone, and out again further on. */
  blink(def, from, dir, player) {
    const f = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const start = player.pos.clone();
    let dist = def.range;
    for (const h of [0.35, 0.95, 1.55]) {
      const hit = this.physics.ray([start.x, start.y + h, start.z], [f.x, 0, f.z], def.range);
      if (hit) dist = Math.min(dist, hit.t - 0.45);
    }
    const inside = player.bounds?.contains, surface = start.y > this.physics.groundAt(start.x, start.z) - 2;
    let to = null;
    for (; dist > 0.4; dist -= 0.5) {
      to = start.clone().addScaledVector(f, dist);
      if (!inside || !surface || inside(to.x, to.z)) break;
    }
    if (dist <= 0.4) { this.sfx?.fizzle(); return; }
    const fl = this.physics.floorAt(to.x, to.z, start.y + 0.6, 0.32, 1.0);
    if (fl !== -Infinity && fl > start.y - 3) to.y = fl;
    const a = start.clone().setY(start.y + 1), b = to.clone().setY(to.y + 1);
    for (const z of this.foes()) {   // torn through on the way
      const c = this.chest(z), q = closestOnSeg(c, a, b);
      if (q.distanceTo(c) > 1.0) continue;
      this.strike(z, q.clone().addScaledVector(f, -0.5), def, def.dmg, { heavy: true, blow: 0.4, dir: f });
      const s = flat(c.clone().sub(q).add(new THREE.Vector3(1e-3, 0, 0)));
      z.shove(s.x * 6, s.z * 6, 1);
    }
    const cols = this.cols(def);
    this.m.particles.burst(a, cols, 140, { speed: 6, size: 0.06, grav: 0, life: 0.6, drag: 3 });
    this.m.waves.add(a, null, def.light, { size: 1.6, life: 0.3, sphere: true });
    for (let i = 0; i < 90; i++) this.emit(a.clone().lerp(b, Math.random()).add(rnd().multiplyScalar(0.35)), f.clone().multiplyScalar(4).add(rnd()), cols[i % 3], { life: 0.4 + Math.random() * 0.3, size: 0.05, drag: 3 });
    this.m.particles.burst(b, cols, 140, { speed: 7, size: 0.06, grav: 0, life: 0.5, drag: 3 });
    this.m.waves.add(to.clone().setY(to.y + 0.06), UP, def.light, { size: 2.6, life: 0.35 });
    this.m.flashAt(b, def.light, 1);
    player.pos.copy(to);
    player.vel.x += f.x * 3; player.vel.z += f.z * 3;
    this.screen(def.light, 0.55);
    this.hands(def, 3);
    this.sfx?.whoosh();
    this.m.noise?.(to, 12);
  }

  /** Spirit blades: four swords wheeling round you. */
  bladesCast(def, from, dir, player) {
    this.hands(def, 2.6);
    this.sfx?.whoosh();
    this.m.waves.add(player.pos.clone().setY(player.pos.y + 1), UP, def.light, { size: def.radius * 1.4, life: 0.4 });
    if (this.blades) { this.blades.t = Math.min(this.blades.t, 0.5); this.blades.life = def.duration + this.blades.t; return; }
    const mat = new THREE.MeshBasicMaterial({ color: hdr(def.colors[1], 2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const meshes = [];
    for (let i = 0; i < def.count; i++) {
      const m = new THREE.Mesh(this.geo.blade, mat);
      m.scale.set(0.07, 0.012, 0.62);
      this.scene.add(m);
      meshes.push(m);
    }
    const light = this.m.grabLight('blades');
    light.light.color.set(def.light);
    this.blades = { def, t: 0, life: def.duration, ang: 0, meshes, mat, cool: new Map(), light, swish: 0 };
  }

  updateBlades(dt, player) {
    const b = this.blades;
    if (!b) return;
    const def = b.def, n = b.meshes.length, cols = this.cols(def);
    b.t += dt;
    const k = Math.max(0, Math.min(1, b.t / 0.5) * Math.min(1, (b.life - b.t) / 1.5));
    b.ang += dt * 3.4;
    const r = def.radius * (0.4 + 0.6 * Math.min(1, b.t / 0.5));
    const seg = [];
    b.meshes.forEach((m, i) => {
      const a = b.ang + i * Math.PI * 2 / n;
      const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), tangent = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const centre = player.pos.clone().addScaledVector(radial, r).setY(player.pos.y + 1 + 0.18 * Math.sin(a * 2 + i));
      // point up and out, flat to you, cutting edge first
      const along = radial.clone().multiplyScalar(0.35).add(UP).normalize(), side = radial.clone().cross(along);
      m.matrix.makeBasis(side, radial, along);
      m.quaternion.setFromRotationMatrix(m.matrix);
      m.position.copy(centre);
      m.scale.set(0.07 * k + 0.001, 0.012, 0.62 * k + 0.001);
      for (const e of [0.6, -0.6]) if (Math.random() < dt * 50 * k) this.emit(centre.clone().addScaledVector(along, e * k), tangent.clone().multiplyScalar(-0.6), cols[e > 0 ? 1 : 2], { life: 0.3, size: 0.04, drag: 2 });
      seg.push({ c: centre, along, tangent, i });
    });
    b.mat.opacity = 0.9 * k;
    if (k > 0.3) for (const z of this.foes()) {   // what they meet is cut
      if (Math.hypot(z.pos.x - player.pos.x, z.pos.z - player.pos.z) > r + 1.6 || Math.abs(z.pos.y - player.pos.y) > 2) continue;
      const caps = z.capsules();
      for (const s of seg) {
        const key = z.id * 16 + s.i;
        if ((b.cool.get(key) || 0) > this.time) continue;
        let best = null;
        for (const e of [-0.45, 0, 0.45]) {
          const p = s.c.clone().addScaledVector(s.along, e);
          for (const c of caps) {
            const q = closestOnSeg(p, c.a, c.b), d = q.distanceTo(p) - c.r;
            if (d < 0.12 && (!best || d < best.d)) best = { d, bone: c.bone, point: q };
          }
        }
        if (!best) continue;
        b.cool.set(key, this.time + 0.4);
        this.m.onHit?.(def, best.point.clone(), s.tangent.clone(), { ...best, t: 0, z }, { dmg: def.dmg, heavy: false, blow: 0 });
        const out = flat(z.pos.clone().sub(player.pos).add(new THREE.Vector3(1e-3, 0, 0)));
        z.shove(out.x * 2.5 + s.tangent.x * 1.5, out.z * 2.5 + s.tangent.z * 1.5);
        this.m.particles.burst(best.point, cols, 10, { speed: 3, size: 0.04, grav: 4, life: 0.4 });
      }
    }
    if ((b.swish -= dt) <= 0) { b.swish = 0.9; if (k > 0.3) this.sfx?.swing(false); }
    b.light.light.position.set(player.pos.x, player.pos.y + 1.1, player.pos.z);
    b.light.light.intensity = def.power * k * (0.85 + 0.15 * Math.sin(this.time * 9)); b.light.light.distance = 7;
    if (b.t < b.life) return;
    for (const m of b.meshes) this.scene.remove(m);
    b.mat.dispose();
    this.m.release(b.light);
    this.blades = null;
  }

  /** Earthsplitter: a line of stone spikes running out from your feet. */
  spikesCast(def, from, dir, player) {
    const f = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)), side = new THREE.Vector3(-f.z, 0, f.x);
    let prev = player.pos.clone();
    const hit = new Set();
    for (let i = 0; i < def.count; i++) {
      const p = player.pos.clone().addScaledVector(f, 1.5 + i * def.step);
      const step = Math.hypot(p.x - prev.x, p.z - prev.z);
      if (this.physics.ray([prev.x, prev.y + 0.6, prev.z], [f.x, 0, f.z], step)) break;   // a wall stops it
      const y = this.floorY(p.x, p.z, prev.y + 0.9);
      if (y === null || y < prev.y - 1.6) break;
      p.y = y; prev = p;
      const h = 1.3 + Math.random() * 0.9 + i * 0.04;
      const g = new THREE.Group();
      const tilt = (m, x, z) => { m.rotation.set(x, 0, z); return m; };
      const main = tilt(new THREE.Mesh(this.geo.stone, this.mat.stone), (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4);
      main.scale.set(1, h, 1);
      g.add(main);
      for (const s of [-1, 1]) {
        const m = new THREE.Mesh(this.geo.stone, this.mat.stone);
        m.position.copy(side).multiplyScalar(s * (0.3 + Math.random() * 0.15));
        m.scale.set(0.55, h * (0.4 + Math.random() * 0.25), 0.55);
        m.quaternion.setFromUnitVectors(UP, side.clone().multiplyScalar(s * 0.5).add(UP).normalize());
        g.add(m);
      }
      for (const m of g.children) { m.castShadow = true; m.receiveShadow = true; }
      g.position.copy(p).setY(p.y - h);
      g.visible = false;
      this.scene.add(g);
      this.spikes.push({ def, p, t: -i * 0.05, h, g, f, hit, up: false, i });
    }
    if (!this.spikes.length) { this.sfx?.fizzle(); return; }
    this.hands(def, 2);
    this.sfx?.boom(0.5);
  }

  updateSpikes(dt) {
    this.spikes = this.spikes.filter((s) => {
      s.t += dt;
      if (s.t < 0) return true;
      if (!s.up) {   // out of the ground, through whatever stands there
        s.up = true; s.g.visible = true;
        const dust = [new THREE.Color('#6a5a48'), new THREE.Color('#4a3e32'), new THREE.Color('#8a7a64')];
        this.m.particles.burst(s.p.clone().setY(s.p.y + 0.1), dust, 20, { speed: 5, size: 0.06, grav: 12, floor: s.p.y, life: 1, nrm: UP });
        for (let i = 0; i < 4; i++) this.m.smoke?.emit(s.p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.2, (Math.random() - 0.5) * 0.8)),
          new THREE.Vector3((Math.random() - 0.5), 0.6, (Math.random() - 0.5)), { life: 2.5, size: 0.6, grow: 0.9, alpha: 0.35, shade: 0.45 });
        this.m.shake = Math.max(this.m.shake, 0.35);
        this.m.smash?.(s.p, 1, 40);
        if (s.i % 3 === 0) this.sfx?.boom(0.3);
        for (const z of this.foes()) {
          if (s.hit.has(z) || Math.hypot(z.pos.x - s.p.x, z.pos.z - s.p.z) > 1.1 || Math.abs(z.pos.y - s.p.y) > 1.6) continue;
          s.hit.add(z);
          this.strike(z, z.pos.clone().setY(z.pos.y + 0.05), s.def, s.def.dmg, { heavy: true, blow: 0.5, dir: UP });
          z.shove(s.f.x * 2, s.f.z * 2, 7.5);   // flung up off it
        }
        this.m.noise?.(s.p, 16);
      }
      const rise = Math.min(1, s.t / 0.09), sink = Math.max(0, Math.min(1, (s.t - 1.9) / 0.6));
      s.g.position.y = s.p.y - s.h * (1 - rise + sink);
      if (s.t < 2.5) return true;
      this.scene.remove(s.g);
      return false;
    });
  }

  /** Gravity well: where the mote lands, a darkness that drags all in, then bursts. */
  well(def, at, n) {
    const c = at.clone();
    if (n && n.y > 0.5) c.y += 1; else if (n) c.addScaledVector(n, 0.6);
    const core = new THREE.Mesh(this.geo.ball, this.mat.void);
    core.scale.setScalar(0.01);
    this.scene.add(core);
    const rings = [0, 1].map((i) => {
      const r = new THREE.Mesh(this.geo.ring, new THREE.MeshBasicMaterial({ color: hdr(def.colors[i + 1], 2.2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      r.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      this.scene.add(r);
      return r;
    });
    const light = this.m.grabLight('well', true);
    light.light.color.set(def.light);
    this.wells.push({ def, c, t: 0, core, rings, halo: this.m.sprite(def, 3, 0.9), light, loop: this.sfx?.loop('drain', 0.8) });
    this.sfx?.boom(0.4);
  }

  updateWells(dt) {
    this.wells = this.wells.filter((w) => {
      w.t += dt;
      const def = w.def, c = w.c, k = Math.min(1, w.t / 0.3), cols = this.cols(def);
      const pulse = 1 + 0.08 * Math.sin(this.time * 18);
      w.core.position.copy(c); w.core.scale.setScalar(0.42 * k * pulse);
      w.halo.position.copy(c); w.halo.material.rotation -= dt * 4; w.halo.scale.setScalar(3 * k * pulse);
      w.rings.forEach((r, i) => { r.position.copy(c); r.rotation.x += dt * (2.2 + i); r.rotation.y += dt * (3.1 - i); r.scale.setScalar((1 + 0.3 * Math.sin(this.time * 5 + i)) * k); });
      // the pull: everything near (the dead lying too) slides in toward it
      for (const z of this.m.targets?.() || []) {
        if (z.gone || z.state === 'buried') continue;
        const dx = c.x - z.pos.x, dz = c.z - z.pos.z, d = Math.hypot(dx, dz);
        if (d > def.radius || d < 0.6 || Math.abs(z.pos.y - c.y) > 4) continue;
        const a = (46 * (1 - d / def.radius) + 8) * dt;
        z.shove(dx / d * a, dz / d * a);
        if (!z.dead) z.chill(0.3);
      }
      for (let i = 0; i < 4; i++) if (Math.random() < dt * 40) {   // motes spiralling in
        const o = rnd().normalize().multiplyScalar(2.5 + Math.random() * 3.5), p = c.clone().add(o);
        const v = o.clone().multiplyScalar(-1.6).add(_a.set(-o.z, 0, o.x).normalize().multiplyScalar(3));
        this.emit(p, v, cols[i % 3], { life: 0.6, size: 0.04, drag: 0 });
      }
      w.light.light.position.copy(c);
      w.light.light.intensity = def.power * k * (0.7 + 0.3 * Math.sin(this.time * 11)); w.light.light.distance = 12;
      if (w.t < def.duration) return true;
      // it bursts
      for (const h of this.m.area?.(c, 5, 75, 'void') || []) { const f = flat(h.dir); h.z.shove(f.x * 13 * h.k, f.z * 13 * h.k, 5 * h.k); }
      this.m.smash?.(c, 5, 60);
      this.m.noise?.(c, 30);
      this.m.waves.add(c, null, def.light, { size: 6, life: 0.5, sphere: true });
      this.m.waves.add(c, UP, def.light, { size: 9, life: 0.6 });
      this.flash(def, c, 6, 0.5);
      this.m.particles.burst(c, cols, 260, { speed: 14, size: 0.07, grav: 2, life: 0.9 });
      this.m.decals.add('scorch', c.clone().setY(this.floorY(c.x, c.z, c.y) ?? c.y - 1), UP, 3.5, { life: 40 });
      this.screen(def.light, 0.6, 1.6);
      this.sfx?.boom(1.1);
      this.scene.remove(w.core);
      for (const r of w.rings) { this.scene.remove(r); r.material.dispose(); }
      this.scene.remove(w.halo); w.halo.material.dispose();
      this.m.release(w.light, 1.8, c);
      w.loop?.stop();
      return false;
    });
  }

  /** Plague: the flask breaks in a green cloud that lies on the ground. */
  cloud(def, at) {
    const c = at.clone(), fy = this.floorY(at.x, at.z, at.y + 0.5);
    if (fy !== null && fy > at.y - 3) c.y = fy;
    const cols = this.cols(def);
    this.m.area?.(c, 1.6, def.dmg, 'poison');
    this.m.decals.add('frost', c.clone().setY(c.y + 0.02), UP, def.radius * 1.5, { life: def.duration + 4, color: new THREE.Color(0.45, 0.9, 0.2) });
    for (let i = 0; i < 24; i++) this.m.smoke?.emit(c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.3 + Math.random(), (Math.random() - 0.5) * 2)),
      rnd().multiplyScalar(2).setY(0.4), { life: 3.5, size: 1, grow: 0.9, alpha: 0.35, shade: 0.6, tint: 1 });
    this.m.particles.burst(c.clone().setY(c.y + 0.2), cols, 60, { speed: 5, size: 0.05, grav: 9, floor: c.y, life: 0.8, nrm: UP });
    const light = this.m.grabLight('plague');
    light.light.color.set(def.light);
    this.clouds.push({ def, c, t: 0, tick: 0, light });
    this.sfx?.shatter('pot');
  }

  updateClouds(dt) {
    this.clouds = this.clouds.filter((cl) => {
      cl.t += dt;
      const def = cl.def, c = cl.c, R = def.radius, k = Math.max(0, Math.min(1, (def.duration - cl.t) / 2)), cols = this.cols(def);
      if (Math.random() < dt * 14 * k) {
        const [x, z] = disk(R * 0.9);
        this.m.smoke?.emit(new THREE.Vector3(c.x + x, c.y + 0.2 + Math.random(), c.z + z), new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.12, (Math.random() - 0.5) * 0.3),
          { life: 3.5, size: 1.2, grow: 0.7, alpha: 0.32, shade: 0.55, tint: 1 });
      }
      for (let i = 0; i < 2; i++) if (Math.random() < dt * 18 * k) {   // motes and bubbles
        const [x, z] = disk(R);
        this.emit(_a.set(c.x + x, c.y + 0.05 + Math.random() * 1.5, c.z + z), _b.set(0, 0.3, 0), cols[1 + i], { life: 1.5, size: 0.03, grav: -0.3, drag: 1 });
      }
      if ((cl.tick -= dt) <= 0 && k > 0.2) {
        cl.tick = 0.5;
        for (const z of this.foes()) if (Math.hypot(z.pos.x - c.x, z.pos.z - c.z) < R && Math.abs(z.pos.y - c.y) < 2.5) { z.poison(3, def.dps); z.chill(0.8); }
      }
      cl.light.light.position.set(c.x, c.y + 1.2, c.z);
      cl.light.light.intensity = def.power * k * (0.8 + 0.2 * Math.sin(this.time * 3)); cl.light.light.distance = 9;
      if (cl.t < def.duration) return true;
      this.m.release(cl.light);
      return false;
    });
  }

  /** Bone lances stuck in walls: they quiver, then crumble away. */
  updateStuck(dt) {
    this.stuck = this.stuck.filter((s) => {
      s.t += dt;
      s.m.quaternion.copy(s.q).multiply(_q.setFromAxisAngle(_a.set(1, 0, 0), 0.08 * Math.sin(s.t * 55) * Math.exp(-s.t * 6)));
      const k = Math.max(0, Math.min(1, (s.life - s.t) / 0.6));
      s.m.scale.setScalar(k + 0.001);
      if (s.t < s.life) return true;
      this.scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose();
      return false;
    });
  }

  /** What lingers on the dead: frost motes off the frozen (and a burst of ice when they thaw),
   * flames off the burning, green off the poisoned. */
  afflictions(dt) {
    const ice = this.cols({ colors: ['#ffffff', '#bfe8ff', '#5aa8e8'] });
    const fire = this.cols({ colors: ['#fff6c0', '#ffb040', '#e0501c'] });
    const rot = this.cols({ colors: ['#f0ffc0', '#a8f040', '#4a9a20'] });
    for (const z of this.m.targets?.() || []) {
      if (z.gone || !z.root.visible) continue;
      const tall = z.mode === 'crawl' ? 0.5 : 1.7;
      const at = () => _a.set(z.pos.x + (Math.random() - 0.5) * 0.5, z.pos.y + 0.1 + Math.random() * tall, z.pos.z + (Math.random() - 0.5) * 0.5);
      if (z.frozen > 0) {
        z.wasFrozen = true;
        if (Math.random() < dt * 10) this.emit(at(), _b.set(0, -0.3, 0), ice[Math.floor(Math.random() * 3)], { life: 0.8, size: 0.03, drag: 1 });
        if (Math.random() < dt * 1.5) this.m.smoke?.emit(at().clone(), new THREE.Vector3(0, -0.1, 0), { life: 2, size: 0.4, grow: 0.4, alpha: 0.2, shade: 1.3, tint: 3 });
      } else if (z.wasFrozen) {
        z.wasFrozen = false;
        this.m.particles.burst(_a.set(z.pos.x, z.pos.y + tall * 0.6, z.pos.z), ice, 40, { speed: 3, size: 0.05, grav: 9, floor: z.pos.y, life: 0.9 });
        this.sfx?.shatter('pot');
      }
      if (z.burning > 0) {
        for (let i = 0; i < 3; i++) if (Math.random() < dt * 22) this.emit(at(), _b.set((Math.random() - 0.5) * 0.4, 1.2 + Math.random(), (Math.random() - 0.5) * 0.4), fire[i], { life: 0.35 + Math.random() * 0.3, size: 0.06, grav: -1, drag: 2 });
        if (Math.random() < dt * 5) this.m.smoke?.emit(at().clone(), new THREE.Vector3(0, 1, 0), { life: 2.5, size: 0.35, grow: 0.6, alpha: 0.25, shade: 0.1 });
      }
      if (z.poisoned > 0 && Math.random() < dt * 12) this.emit(at(), _b.set(0, 0.4, 0), rot[Math.floor(Math.random() * 3)], { life: 0.8, size: 0.03, grav: -0.2, drag: 1 });
    }
  }

  update(dt, camera, height, player) {
    this.time += dt;
    this.updateFires(dt, camera, height);
    this.updateMissiles(dt, camera, player);
    this.updateNovas(dt);
    this.updateIce(dt);
    this.updateMeteors(dt);
    this.updateStorms(dt);
    this.updateBlades(dt, player);
    this.updateSpikes(dt);
    this.updateWells(dt);
    this.updateClouds(dt);
    this.updateStuck(dt);
    this.afflictions(dt);
  }
}
