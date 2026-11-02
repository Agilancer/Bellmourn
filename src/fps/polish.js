// Small things that make the world feel lived in:
//  - fireflies over the meadows, the forest edge and the downs from dusk till dawn, drifting and
//    blinking (they keep to the open ground about you, and never go below it);
//  - the village's offerings at the crater: candles, wreaths and funeral flowers set round its rim on
//    the town's side, where the people of Bellmourn have come to pray to the one who fell.
import * as THREE from 'three';
import { glowPoints, CRATER } from './crater.js';

export class Fireflies {
  constructor(scene, ground, n = 260) {
    this.n = n; this.ground = ground;
    const P = new Float32Array(n * 3), C = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    this.points = glowPoints(g, 0.11);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.f = Array.from({ length: n }, () => ({ x: 0, y: -999, z: 0, ph: Math.random() * 6.28, sp: 0.3 + Math.random() * 0.6, h: 0.4 + Math.random() * 1.8, set: false }));
  }

  /** night: 0 by day .. 1 at night; under: you're below ground (none then). */
  update(dt, t, camera, night, under) {
    const vis = under ? 0 : Math.max(0, Math.min(1, (night - 0.35) / 0.4));
    this.points.visible = vis > 0.01;
    if (!this.points.visible) return;
    const P = this.points.geometry.attributes.position, C = this.points.geometry.attributes.color, cp = camera.position, R = 34;
    this.f.forEach((f, i) => {
      // keep a cloud of them about you: one that strays too far comes back on the far side
      if (!f.set || Math.hypot(f.x - cp.x, f.z - cp.z) > R) {
        const a = Math.random() * 6.28, d = (f.set ? 0.85 : Math.sqrt(Math.random())) * R;
        f.x = cp.x + Math.cos(a) * d; f.z = cp.z + Math.sin(a) * d; f.set = true;
      }
      f.x += Math.sin(t * f.sp + f.ph) * dt * 0.6; f.z += Math.cos(t * f.sp * 0.8 + f.ph * 1.3) * dt * 0.6;
      const gy = this.ground(f.x, f.z);
      f.y = gy + f.h + Math.sin(t * f.sp * 1.7 + f.ph) * 0.3;
      const blink = Math.max(0, Math.sin(t * (1.2 + f.sp) + f.ph * 3)) ** 3;
      P.setXYZ(i, f.x, f.y, f.z);
      const k = blink * vis * 1.6;
      C.setXYZ(i, 0.75 * k, 1.0 * k, 0.25 * k);
    });
    P.needsUpdate = true; C.needsUpdate = true;
  }
}

/** The village's offerings round the crater's rim, on the side toward the town (bill.add places the
 * sprites; scatter ones become 3D candles and the like through bill.redirect). Call once the crater's
 * keep-clear has been lifted. */
export function craterOfferings(ctx) {
  const { bill } = ctx;
  const R = (() => { let s = 919; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const kinds = ['cathedral_graveyard_votive_candles', 'cathedral_graveyard_votive_candles', 'cathedral_graveyard_funeral_flowers',
    'cathedral_graveyard_dry_wreath', 'catacombs_vigil_candles', 'town_scatter_26_wildflowers'];
  for (let i = 0; i < 16; i++) {
    // an arc on the town's side (east), on the lip, a stride inside the ridge
    const a = (-70 + 140 * (i / 15) + (R() - 0.5) * 6) * Math.PI / 180, r = CRATER.reach + 1.2 + R() * 1.8;   // just past the char
    const x = CRATER.x + Math.cos(a) * r, z = CRATER.z + Math.sin(a) * r;
    const id = kinds[i % kinds.length];
    if (!ctx.lib.spr.get(id)) continue;
    bill.add(id, x, 0, z, 0.55 + R() * 0.25);
  }
}
