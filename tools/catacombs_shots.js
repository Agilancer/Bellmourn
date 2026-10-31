// Views of the catacombs for review (each space's first view, the critical path, the set pieces),
// saved to art/view/shots/<prefix>_<name>.png. Steps the game by hand, so it works with the
// browser pane hidden. In the page, once loaded:
//   (await import('/tools/catacombs_shots.js')).shots('r1')
//   (await import('/tools/catacombs_shots.js')).shots('r1', ['bridge_mid'])   // just some
export const VIEWS = {
  arrival: [5, -14, -114.0, 0, -0.04],
  crypt_back: [5, -14, -131, Math.PI, 0.05],
  reliquary: [-12.6, -14, -127, Math.PI / 2, 0.02],
  gallery: [5.2, -14, -134.5, -0.15, 0],
  gallery_bend: [6.4, -14, -139.5, -0.6, 0],
  crossing: [10.5, -14, -151.5, 0, 0.1],
  erupt: [12.8, -14, -163.8, -0.5, -0.12],
  sexton_top: [12, -14, -176, 0, -0.32],
  sexton_foot: [12, -19, -189.5, Math.PI, 0.25],
  near_alcove: [12, -19, -192, 0, -0.03],
  bridge_start: [12, -19, -199.4, 0, -0.12],
  bridge_mid: [12, -21, -213, 0, -0.06],
  bridge_down: [12, -21, -207, -0.6, -0.75],
  gulf_east: [12, -21, -213, -1.4, 0.05],
  gulf_west_bridge: [12, -21, -213, 1.45, -0.18],
  gulf_floor: [4, null, -214, -0.15, 0.42],
  gulf_west: [-20, null, -215, 1.2, 0.18],
  ledge: [-14, null, -201.5, -Math.PI / 2 - 0.2, 0.05],
  overlook: [31, -14, -194.6, 1.2, -0.22],
  far_alcove: [12, -19, -232, Math.PI, 0.0],
  far_passage: [12, -19, -237.5, 0, -0.05],
  hall_entry: [12, -21, -251.5, 0, 0.14],
  hall_side: [-1.5, -21, -258, -0.75, 0.18],
  monument_top: [12, -14, -276.4, Math.PI, -0.12],
  plague: [41, -21, -277, -Math.PI / 2, 0.05],
  stairhall_top: [12, -21, -296.5, 0, -0.3],
  stairhall_landing: [12, -25, -308.2, Math.PI / 4, -0.1],
  tribune: [12, -32, -342.6, 0, 0.12],
  shrine_floor: [1.5, -37, -351, -Math.PI / 2 + 0.25, 0.25],
  shrine_bell: [12, -30, -354.2, 0.4, 0.4],
  charnel: [-14.6, -37, -362, Math.PI / 2, -0.35],
  abbots: [31, -37, -356.5, -1.2, 0],
  tomb: [46, -40, -387.5, 0, -0.05],
};

/** The canvas as PNG bytes, at once (toBlob is put off for a long time in a hidden tab). */
function pngOf(cv) {
  const bin = atob(cv.toDataURL('image/png').split(',')[1]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export async function shots(prefix = 'r', only = null) {
  const bm = window.bellmourn, p = bm.player, cat = bm.ctx.catacombs, gulf = cat.gulf;
  bm.begin?.();
  // (the dead hold still where they were put, and no ambush springs, while the camera goes round)
  const zu = bm.zombies.update, amb = cat.ambush, er = cat.erupt;
  bm.zombies.update = function (...a) { this.time += a[0]; this.gore.update(a[0], a[3], a[4], 1); };
  cat.ambush = []; cat.erupt = [];
  // (a hidden browser pane has no size: draw at a fixed 640 x 400 regardless)
  bm.renderer.setSize(640, 400, false); bm.composer.setSize(640, 400);
  bm.camera.aspect = 1.6; bm.camera.updateProjectionMatrix(); bm.vm.resize?.(1.6);
  bm.hud.hud.classList.add('hidden');
  bm.setHour?.(22);
  // (point sprites, the flames among them, are sized by the window's height, which a hidden pane
  // hasn't got: size them for the 400 px drawn here instead)
  const sized = [];
  bm.scene.traverse((o) => {
    const u = o.isPoints && o.material?.uniforms?.scale;
    if (!u) return;
    sized.push([u, Object.getOwnPropertyDescriptor(u, 'value')]);
    Object.defineProperty(u, 'value', { configurable: true, get: () => 200 * bm.camera.projectionMatrix.elements[5], set: () => {} });
  });
  const out = [];
  for (const [name, v] of Object.entries(VIEWS)) {
    if (only && !only.includes(name)) continue;
    let [x, y, z, yaw, pitch] = v;
    if (y == null) y = gulf.floorAt(x, z) ?? -40;
    // (any of the dead standing where the camera is would fill the view from inside: hidden)
    const hid = bm.zombies.list.filter((zb) => zb.root.visible && Math.hypot(zb.pos.x - x, zb.pos.z - z) < 1.2 && Math.abs(zb.pos.y - y) < 2);
    for (const zb of hid) zb.root.visible = false;
    for (let i = 0; i < 36; i++) { p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; bm.vm.scene.visible = false; bm.tick(1 / 60); }
    await fetch(`/shot?name=${prefix}_${name}`, { method: 'POST', body: pngOf(document.getElementById('game')) });
    for (const zb of hid) zb.root.visible = true;
    out.push(name);
  }
  for (const [u, d] of sized) Object.defineProperty(u, 'value', d);
  bm.zombies.update = zu; cat.ambush = amb; cat.erupt = er;
  bm.vm.scene.visible = true;
  bm.hud.hud.classList.remove('hidden');
  return out;
}
