// The fur (src/fps/fur.js), seen: a werewolf stood before you at the Deepwood's edge in daylight, a
// picture from each side to art/view/shots/<prefix>_<view>.png (works with the browser pane hidden).
// In the page, once a game is under way:
//   await (await import('/tools/fur_shots.js')).around('f1')
//   await (await import('/tools/fur_shots.js')).around('f2', { fur: false })     the same without it
// (o.on: a bone to look at, with d: how close, e.g. { on: 'Head', d: 0.8, views: [['face', 0], ['profile', 1.3]] })
// Options: clip (it holds that clip's first frame on), at (seconds into it), d (metres off), h (eye height
// off the ground), hour, views.
export async function around(prefix, o = {}) {
  const bm = window.bellmourn, p = bm.player, W = 900, H = 900;
  bm.begin?.();
  bm.renderer.setSize(W, H, false); bm.composer.setSize(W, H);
  bm.camera.aspect = W / H; bm.camera.updateProjectionMatrix(); bm.vm.resize?.(W / H);
  bm.hud.hud.classList.add('hidden');
  bm.setHour?.(o.hour ?? 11);
  const z = bm.zombies.list.filter((q) => q.variant === (o.variant || 'wolf_a') && !q.dead).at(-1), zp = z.pos.clone();   // (the last: the one that hunts alone)
  // it stands still, out of its mind, in the clip asked for
  z.update = () => {};
  z.sync();   // (one out of your sight hasn't turned to its yaw yet)
  z.mixer.stopAllAction();
  const a = z.actions[o.clip || 'idle'];
  z.mixer.timeScale = 1;
  a.reset().play(); z.mixer.update(o.at ?? 0.1); z.mixer.timeScale = 0;
  z.cur = o.clip || 'idle'; z.carryShield?.(0);
  if (z.fur && o.fur === false) z.fur.mesh.layers.disable(0);
  // (close up: it's lifted so what's looked at is level with your eye)
  const lift = o.on ? 1.58 - (z.bones[o.on].getWorldPosition(new (await import('three')).Vector3()).y - zp.y) : 0, y0 = z.root.position.y;
  z.root.position.y = y0 + lift;
  const out = [], d = o.d ?? 2.5, eye = o.on ? z.bones[o.on].getWorldPosition(new (await import('three')).Vector3()).y - zp.y : o.h ?? 1.0;
  for (const [name, turn] of o.views || [['front', 0], ['three', 0.8], ['side', 1.57], ['back', 3.14]]) {
    const yaw = z.yaw + turn, x = zp.x + Math.sin(yaw) * d, y = bm.physics.groundAt(x, zp.z + Math.cos(yaw) * d), zz = zp.z + Math.cos(yaw) * d;
    for (let i = 0; i < 6; i++) {
      p.pos.set(x, y, zz); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = o.on ? 0 : Math.atan2((y + 1.58) - (zp.y + eye), d) * -1; p.health = p.maxHealth || 100;
      bm.vm.scene.visible = false; bm.tick(1 / 60);
    }
    const bin = atob(document.getElementById('game').toDataURL('image/png').split(',')[1]), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    await fetch(`/shot?name=${prefix}_${name}`, { method: 'POST', body: u8 });
    out.push(`${prefix}_${name}`);
  }
  z.root.position.y = y0;
  if (z.fur) z.fur.mesh.layers.enable(0);
  bm.vm.scene.visible = true; bm.hud.hud.classList.remove('hidden');
  return { shots: out, strands: z.fur?.F.count, drawn: z.fur?.geometry.drawRange.count / 36, calls: bm.renderer.info?.render?.calls };
}

/** Cut and struck: its left forearm off (its strands with it), a blow on the chest (blood on the fur,
 * the strands rooted in the hole gone), pictures of that. Then the body taken away, and the rest of
 * its kind must still have their strands. Returns the counts. */
export async function gore(prefix) {
  const bm = window.bellmourn, THREE = await import('three');
  const list = () => bm.zombies.list.filter((q) => q.variant === 'wolf_a' && !q.dead);
  const z = list().at(-1), before = z.fur.shown;
  z.hp = 99999;
  z.sever('forearmL', new THREE.Vector3(1, 0.2, 0));
  const after = z.fur.shown;
  const chest = z.capsules().find((c) => c.bone === z.bones.chest || c.bone?.name === 'chest') || z.capsules()[2], point = chest.a.clone().lerp(chest.b, 0.5);
  for (let i = 0; i < 3; i++) z.hit({ bone: chest.bone, point, z }, { dmg: 20, dir: new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), z.yaw), heavy: true, kind: 'blade', edge: new THREE.Vector3(1, 0.4, 0).normalize(), push: 0, blow: 2 });
  const shots = await around(prefix, { views: [['front', 0.15], ['side', 1.4]] });
  const others = list().filter((q) => q !== z), keepAttr = others[0].fur.geometry.attributes.position;
  z.remove();
  bm.zombies.list.splice(bm.zombies.list.indexOf(z), 1);
  return { before, after, cutGoneStrands: before - after, shots: shots.shots, othersStrands: others.map((q) => q.fur.shown), sharedKept: others[0].fur.geometry.attributes.position === keepAttr && !!keepAttr.array?.length };
}

/** Wounds on a body of `variant`: a blow of each kind on its chest, and a limb off, pictures after. */
export async function wounds(prefix, variant, kinds = ['blunt', 'blade', 'fire']) {
  const bm = window.bellmourn, THREE = await import('three');
  const z = bm.zombies.list.filter((q) => q.variant === variant && !q.dead).at(-1);
  z.hp = 99999;
  const caps = z.capsules(), chest = caps.find((c) => c.bone === z.bones.chest) || caps[2];
  const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), z.root.rotation.y);
  kinds.forEach((kind, i) => {
    const point = chest.a.clone().lerp(chest.b, 0.3 + 0.2 * i).addScaledVector(fwd, 0.12).add(new THREE.Vector3(0.09 * (i - 1), 0, 0));
    z.hit({ bone: chest.bone, point, z }, { dmg: 30, dir: fwd.clone().negate(), heavy: true, kind, edge: kind === 'blade' ? new THREE.Vector3(1, 0.4, 0).normalize() : null, push: 0, blow: 2 });
  });
  const a = await around(prefix + '_hit', { variant, on: 'chest', d: 1.3, views: [['front', 0.1]] });
  const u = z.u, n = u.uWoundN.value;
  const limb = z.bones.forearmL ? 'forearmL' : Object.keys(z.bones).find((k) => /forearm|lower.?arm/i.test(k));
  if (limb) z.sever(limb, new THREE.Vector3(1, 0.2, 0));
  const b = await around(prefix + '_cut', { variant, views: [['front', 0.1]] });
  return { variant, limb, shots: [...a.shots, ...b.shots], wounds: u.uWound.value.slice(0, n).map((w, i) => [+w.w.toFixed(3), u.uWoundD.value[i].w]), strands: z.fur?.shown };
}
