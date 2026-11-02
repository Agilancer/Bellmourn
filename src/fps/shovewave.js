// The shield's shove made visible (the user's call): a see-through, rim-lit ghost of the shield
// bursts from its face and flies out as a projectile toward what it pushes, across the shove's
// reach, swelling to the shove's width as it goes and fading at the far end, so it shows the
// ground the shove covers. The game throws it from where the shield is seen (main.js
// shieldShove); the move viewer from its own camera (moves.html).
import * as THREE from 'three';

const WAVE_TIME = 0.36;   // seconds out to the far end of the shove
const waves = [];

/** A shield's shove from its own size {w, h} (metres): the half-width and reach of the box in
 * front of you it pushes, and how far it knocks what's in it. */
export function shoveArea(size) {
  return { half: 0.35 + size.w * 1.3, reach: 1.3 + size.h * 1.4, push: 1.0 + size.w * size.h * 2.2 };
}

/** Throw a ghost (vm.ghostOf(): {g, alpha, w}) from `start` to `end`, its face toward the way
 * it flies, growing from scale s0 (as big as the shield is seen) to `width` across. */
export function launchWave(scene, made, start, end, width, s0) {
  if (!made) return;
  const { g, alpha, w } = made;
  const up = new THREE.Vector3(0, 1, 0), f = end.clone().sub(start).setY(0).normalize();
  const x = new THREE.Vector3().crossVectors(up, f);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, f));   // (the shield's face, +z, ahead)
  g.position.copy(start);
  g.scale.setScalar(s0);
  scene.add(g);
  waves.push({ g, alpha, scene, t: 0, start: start.clone(), end: end.clone(), s0, s1: Math.max(s0, width / w) });
}

export function stepWaves(dt) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const v = waves[i];
    v.t += dt;
    const k = Math.min(1, v.t / WAVE_TIME), e = 1 - (1 - k) ** 2;
    v.g.position.lerpVectors(v.start, v.end, e);
    v.g.scale.setScalar(v.s0 + (v.s1 - v.s0) * e);
    v.alpha(0.9 * (k < 0.15 ? 1 : ((1 - k) / 0.85) ** 1.6));   // (bright as it leaves the shield, gone at the far end)
    if (k >= 1) {
      v.scene.remove(v.g);
      v.g.traverse((o) => o.material?.dispose?.());
      waves.splice(i, 1);
    }
  }
}
