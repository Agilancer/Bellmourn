// Shots of the ground's own shaders (lib.js ground, feathered, triplanar, cracks; terrain, gulf, cave,
// kit, land) for comparing the two renderers: the crater by day and by night, the gulf from its
// near landing, the tomb's glowing volcanic floor, a road's wheel tracks close to. Pictures go to
// art/view/shots/<prefix>_<view>.png (POST /shot, the harness).
//   (await import('/tools/ground_shots.js')).shots('gpu')
//   (await import('/tools/ground_shots.js')).landTest()   // land.js's ground material, drawn on a test patch
import * as THREE from 'three';
import { CRATER, formCrater } from '/src/fps/crater.js';
import { zs, zc, BX, BY } from '/src/fps/gulf.js';

export const VIEWS = {
  crater_day: { at: [CRATER.x + 26, null, CRATER.z + 20], look: [CRATER.x, -2, CRATER.z], hour: 13, crater: 1 },
  crater_night: { at: [CRATER.x + 26, null, CRATER.z + 20], look: [CRATER.x, -2, CRATER.z], hour: 23, crater: 1 },
  crater_floor: { at: [CRATER.x + 6, null, CRATER.z + 5], look: [CRATER.x - 2, -4, CRATER.z - 2], hour: 23, crater: 1 },
  gulf: { at: () => [BX, BY, zs(BX) - 1], look: () => [BX + 18, -32, zc(BX + 18)], hour: 22 },
  crater_rim: { at: [CRATER.x + 34, null, CRATER.z - 6], look: [CRATER.x, -3, CRATER.z], hour: 15, crater: 1 },
  yard_day: { at: [4, null, -112], look: [8, 0, -140], hour: 13 },
  tracks: { at: [36, null, 3], look: [18, -1, 4], hour: 13 },
  tomb: { at: [46, -40, -387.5], yaw: 0, pitch: -0.42, hour: 22 },
};

function pngOf(cv) {
  const bin = atob(cv.toDataURL('image/png').split(',')[1]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

const cave = (name) => window.bellmourn.ctx.caves.find((c) => c.name === name);

/** Shots of `views` (these, or texpack_shots.js's VIEWS: the same form), each stepped as three's own
 * loop would (a new node frame each tick under WebGPU: without it the lights keep the first frame's
 * values and the hour never comes through). */
export async function shots(prefix = 'g', only = null, { w = 800, h = 500, views = VIEWS } = {}) {
  const bm = window.bellmourn, p = bm.player, ph = bm.physics;
  const frameNodes = () => { const nf = bm.renderer._nodes?.nodeFrame; if (nf) { nf.update(); bm.renderer.info.frame = nf.frameId; } };
  bm.begin?.();
  const zu = bm.zombies.update;
  bm.zombies.update = function (...a) { this.time += a[0]; this.gore.update(a[0], a[3], a[4], 1); };
  bm.renderer.setSize(w, h, false); bm.composer.setSize(w, h);
  bm.camera.aspect = w / h; bm.camera.updateProjectionMatrix(); bm.vm.resize?.(w / h);
  bm.hud.hud.classList.add('hidden');
  const out = [];
  for (const [name, v] of Object.entries(views)) {
    if (only && !only.includes(name)) continue;
    if (v.crater != null) formCrater(v.crater);
    let x, y, z, yaw, pitch;
    if (v.cave) {   // (as texpack_shots.js: in the cave's first room, looking across it)
      const c = cave(v.cave), room = c.features.find((f) => f.type === 'room');
      x = c.px + room.a - room.ra * 0.6; z = c.pz + room.b;
      y = c.floorAt(x, z) ?? c.mouth.y;
      yaw = Math.atan2(-(c.px + room.a - x), -(c.pz + room.b - z)); pitch = 0.12;
    } else {
      [x, y, z] = typeof v.at === 'function' ? v.at() : v.at;
      if (y == null) y = Math.max(ph.groundAt(x, z), ph.floorAt(x, z, ph.groundAt(x, z) + 1.5, 0.3, 0.2));
      if (v.look) {
        const L = typeof v.look === 'function' ? v.look() : v.look;
        const [lx, ly, lz] = L.length === 2 ? [L[0], y + 1.6, L[1]] : L;
        yaw = Math.atan2(-(lx - x), -(lz - z));
        pitch = Math.atan2(ly - (y + 1.7), Math.hypot(lx - x, lz - z));
      } else ({ yaw, pitch } = v);
    }
    bm.setHour?.(v.hour ?? 13);
    for (let i = 0; i < 40; i++) { p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; bm.vm.scene.visible = false; frameNodes(); bm.tick(1 / 60); }
    await fetch(`/shot?name=${prefix}_${name}`, { method: 'POST', body: pngOf(document.getElementById('game')) });
    out.push(name);
  }
  bm.zombies.update = zu;
  bm.vm.scene.visible = true;
  bm.hud.hud.classList.remove('hidden');
  return out;
}

/** land.js's ground material (the realm's, not built in the game as it is) drawn on a test patch
 * before the eye, with a hole cut in it: does it compile, and what does it look like. */
export async function landTest(prefix = 'g') {
  const bm = window.bellmourn, p = bm.player;
  const { Land } = await import('/src/fps/land.js');
  const NX = 64, NZ = 64, data = new Uint8Array(NX * NZ * 4);
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    const o = (k * NX + i) * 4;
    data[o] = ((i >> 3) % 6) * 16; data[o + 1] = ((k >> 3) % 6 + 3) * 16; data[o + 2] = (i * 7 + k * 13) % 256; data[o + 3] = i > 40 ? 255 : 0;
  }
  const map = new THREE.DataTexture(data, NX, NZ);
  map.magFilter = map.minFilter = THREE.NearestFilter; map.needsUpdate = true;
  const fake = { map };
  const m = Land.prototype.groundMaterial.call(fake, { kit: bm.kit });
  await fake.ready;
  // a bumpy patch at the plaza's edge, its cell map laid over the world's (land.js WORLD) at the
  // patch: the patch is moved there so the map's cells show
  const g = new THREE.PlaneGeometry(30, 30, 30, 30).rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, Math.max(0, Math.sin(pos.getX(i) * 0.4) * 4 + Math.cos(pos.getZ(i) * 0.3) * 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(0, 0.6, 60);
  mesh.updateMatrixWorld();
  bm.scene.add(mesh);
  Land.prototype.hole.call(fake, -4, 52, 4, 60, 3);
  const x = 0, y = 2, z = 82;
  bm.setHour?.(13);
  const frameNodes = () => { const nf = bm.renderer._nodes?.nodeFrame; if (nf) { nf.update(); bm.renderer.info.frame = nf.frameId; } };
  for (let i = 0; i < 30; i++) { p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.yaw = 0; p.pitch = -0.3; bm.vm.scene.visible = false; frameNodes(); bm.tick(1 / 60); }
  await fetch(`/shot?name=${prefix}_land`, { method: 'POST', body: pngOf(document.getElementById('game')) });
  bm.scene.remove(mesh);
  bm.vm.scene.visible = true;
  return 'land';
}
