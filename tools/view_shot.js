// A view of the game from anywhere, for review: art/view/shots/<name>.png at 640 x 400 (works with
// the browser pane hidden). In the page, once loaded:
//   const v = await import('/tools/view_shot.js');
//   await v.shot('yard', [x, y, z, yaw, pitch], { ticks: 30, hour: 12, setup: (bm) => {...} })
export async function shot(name, [x, y, z, yaw, pitch = 0], o = {}) {
  const bm = window.bellmourn, p = bm.player;
  bm.begin?.();
  bm.renderer.setSize(640, 400, false); bm.composer.setSize(640, 400);
  bm.camera.aspect = 1.6; bm.camera.updateProjectionMatrix(); bm.vm.resize?.(1.6);
  bm.hud.hud.classList.toggle('hidden', !o.hud);
  if (o.hour != null) bm.setHour?.(o.hour);
  // (point sprites are sized by the window's height, which a hidden pane hasn't got)
  const sized = [];
  bm.scene.traverse((q) => {
    const u = q.isPoints && q.material?.uniforms?.scale;
    if (!u) return;
    sized.push([u, Object.getOwnPropertyDescriptor(u, 'value')]);
    Object.defineProperty(u, 'value', { configurable: true, get: () => 200 * bm.camera.projectionMatrix.elements[5], set: () => {} });
  });
  o.setup?.(bm);
  for (let i = 0; i < (o.ticks ?? 30); i++) { p.pos.set(x, y ?? p.pos.y, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; p.health = p.maxHealth || 100; bm.vm.scene.visible = !!o.hands; o.each?.(bm, i); bm.tick(1 / 60); }
  const cv = document.getElementById('game'), bin = atob(cv.toDataURL('image/png').split(',')[1]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await fetch('/shot?name=' + name, { method: 'POST', body: u8 });
  for (const [u, d] of sized) Object.defineProperty(u, 'value', d);
  bm.vm.scene.visible = true;
  bm.hud.hud.classList.remove('hidden');
  return name;
}
