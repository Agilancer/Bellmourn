// How a beast man holds its arms: close-ups of the hand or the forearm through its clips, one sheet to
// art/view/shots/<name>.png (WebGL: the picture is taken as it's drawn; works with the pane hidden).
// In the page, once loaded with ?renderer=webgl:
//   const G = await import('/tools/beast_grips.js');
//   await G.sheet('g_r', { variant: 'goat_a', bone: 'handR', weapon: 'bearded_axe' })
//   await G.sheet('g_l', { variant: 'goat_a', bone: 'forearmL', shield: 'spiked_buckler', d: 1.0 })
// Rows are clips ([name, fraction through it]), columns are views round the body (radians from its front).
import * as THREE from 'three';

export const CLIPS = [['idle', 0.1], ['walk', 0.25], ['run', 0.5], ['attack1', 0.3], ['attack2', 0.55], ['attack3', 0.5], ['leap', 0.4]];

const _p = new THREE.Vector3(), _d = new THREE.Vector3();

function pose(z, clip, frac) {
  z.mixer.stopAllAction();
  const a = z.actions[clip];
  if (!a) return false;
  a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
  a.time = a.getClip().duration * frac;
  z.mixer.timeScale = 1;
  z.mixer.update(0);
  z.cur = clip;
  z.carryShield?.(0);
  z.root.updateMatrixWorld(true);
  return true;
}

/** The arm in its socket on z: swapped for `id`, in `finish`. */
function arm(bm, z, socket, id) {
  if (!id) return;
  const had = z.items.filter((i) => i.socket === socket);
  for (const i of had) { i.g.removeFromParent(); z.items.splice(z.items.indexOf(i), 1); }
  const key = Object.keys(bm.foes.items).find((k) => k.startsWith(id + '|'));
  if (key) z.hold(socket, bm.foes.items[key].clone());
}

export async function sheet(name, { variant = 'goat_a', bone = 'handR', weapon, shield, clips = CLIPS, views = [0.5, 2.2], d = 0.62, T = 300, fur = true } = {}) {
  const bm = window.bellmourn, R = bm.renderer, cam = bm.camera;
  const z = bm.zombies.list.find((q) => q.variant === variant && !q.dead && !q.cuts.length);
  z.update = () => {};
  bm.begin?.();
  z.sync();
  z.root.visible = true;   // (one far from you is hidden, its matrices left alone)
  arm(bm, z, 'gripR', weapon); arm(bm, z, 'shieldL', shield);
  if (z.fur) z.fur.mesh.visible = fur;
  R.setSize(T, T, false); cam.aspect = 1; cam.fov = 40; cam.updateProjectionMatrix();
  const cv = document.createElement('canvas'), cx = cv.getContext('2d');
  cv.width = 70 + views.length * T; cv.height = clips.length * T;
  cx.fillStyle = '#111'; cx.fillRect(0, 0, cv.width, cv.height); cx.font = '13px sans-serif';
  const gl = document.getElementById('game');
  // (just it and the lights: each picture is then quick, and easy to read)
  const hid = bm.scene.children.filter((c) => !c.isLight && c !== z.root && c.visible);
  for (const c of hid) c.visible = false;
  const bg = bm.scene.background; bm.scene.background = new THREE.Color(0x5c5f63);
  for (let j = 0; j < clips.length; j++) {
    const [clip, frac] = clips[j];
    await new Promise((res) => setTimeout(res));
    cx.fillStyle = '#ddc'; cx.fillText(clip, 4, j * T + 18); cx.fillText(frac.toFixed(2), 4, j * T + 34);
    if (!pose(z, clip, frac)) continue;
    if (z.fur) z.fur.mesh.visible = fur;
    z.bones[bone].getWorldPosition(_p);
    views.forEach((v, i) => {
      const yaw = z.root.rotation.y + v;
      _d.set(Math.sin(yaw), 0.35, Math.cos(yaw)).normalize();
      cam.position.copy(_p).addScaledVector(_d, d);
      cam.lookAt(_p); cam.updateMatrixWorld(true);
      R.setRenderTarget(null);
      R.render(bm.scene, cam);
      cx.drawImage(gl, 70 + i * T, j * T, T, T);
    });
  }
  for (const c of hid) c.visible = true;
  bm.scene.background = bg;
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  await fetch('/shot?name=' + name, { method: 'POST', body: blob });
  return { name, held: z.items.map((i) => i.socket), keys: Object.keys(z.actions).slice(0, 14) };
}
