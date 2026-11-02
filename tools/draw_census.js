// Where a frame's draw calls go (WebGPU): every draw the backend makes in one frame at a view, counted
// by pass (the world, the arms, each shadow map, the post) and by what is drawn (the scene's top-level
// groups, characters, kinds of mesh). In the page:
//   (await import('/tools/draw_census.js')).census('plaza')
import { VIEWS } from './gpu_bench.js';

function place(bm, v) {
  const p = bm.player, ph = bm.physics;
  let [x, y, z] = v.at;
  if (y == null) y = Math.max(ph.groundAt(x, z), ph.floorAt(x, z, ph.groundAt(x, z) + 1.5, 0.3, 0.2));
  let yaw, pitch;
  if (v.look) { const [lx, ly, lz] = v.look; yaw = Math.atan2(-(lx - x), -(lz - z)); pitch = Math.atan2(ly - (y + 1.7), Math.hypot(lx - x, lz - z)); } else ({ yaw, pitch } = v);
  return () => { p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; };
}

/** The top-level thing an object belongs to, and what kind of thing it is. */
function owner(o, scene) {
  let top = o, kind = o.isSkinnedMesh ? 'skinned' : o.isInstancedMesh ? 'instanced' : o.isBatchedMesh ? 'batched' : o.isPoints ? 'points' : o.isSprite ? 'sprite' : 'mesh';
  for (let p = o; p && p !== scene; p = p.parent) {
    top = p;
    if (p.userData?.villager || /villager/i.test(p.name)) kind = 'villager';
    else if (p.userData?.zombie || /zombie/i.test(p.name)) kind = 'zombie';
  }
  return `${top.name || top.type}#${scene.children.indexOf(top)} ${kind}`;
}

export async function census(view = 'plaza', { hour } = {}) {
  const bm = window.bellmourn, r = bm.renderer, backend = r.backend;
  if (!r.isWebGPURenderer) return 'WebGPU only';
  bm.begin?.();
  const v = VIEWS[view], put = place(bm, v);
  bm.setHour?.(hour ?? v.hour ?? 13);
  for (let i = 0; i < 30; i++) { put(); bm.tick(1 / 60); }
  const byPass = new Map(), byOwner = new Map(), byPassOwner = new Map();
  const draw = backend.draw.bind(backend);
  backend.draw = (ro, info) => {
    const cam = ro.camera, pass = cam === bm.camera ? 'world' : cam === bm.vm.camera ? 'arms' : ro.object?.isQuadMesh ? 'post'
      : cam?.isOrthographicCamera ? 'shadow:sun/ortho' : cam?.isPerspectiveCamera && cam !== bm.camera ? 'shadow:point/persp' : 'other';
    byPass.set(pass, (byPass.get(pass) || 0) + 1);
    const ow = owner(ro.object, ro.scene);
    byOwner.set(ow, (byOwner.get(ow) || 0) + 1);
    const k = pass + ' | ' + ow;
    byPassOwner.set(k, (byPassOwner.get(k) || 0) + 1);
    return draw(ro, info);
  };
  // what kind of thing each draw is: built world (ctx.built: the builders' merged meshes), characters
  // (skinned), instanced/batched growth, and the rest; and how many distinct materials and geometries
  const built = new Set(bm.ctx.built || []), under = new Set(bm.ctx.builtUnder || []);
  const byKind = new Map(), mats = new Map(), sizes = [];
  const draw2 = backend.draw.bind(backend);
  backend.draw = (ro, info) => {
    const o = ro.object, cam = ro.camera;
    const pass = cam === bm.camera ? 'world' : cam === bm.vm.camera ? 'arms' : o?.isQuadMesh ? 'post' : 'shadow';
    const kind = built.has(o) ? 'built' : under.has(o) ? 'builtUnder' : o.isSkinnedMesh ? 'skinned' : o.isInstancedMesh ? 'instanced' : o.isBatchedMesh ? 'batched' : o.isPoints ? 'points' : o.isSprite ? 'sprite' : 'other-mesh';
    const k = pass + ' ' + kind;
    byKind.set(k, (byKind.get(k) || 0) + 1);
    if (pass === 'world') { mats.set(ro.material, (mats.get(ro.material) || 0) + 1); sizes.push(o.geometry?.index ? o.geometry.index.count : o.geometry?.attributes?.position?.count || 0); }
    return draw2(ro, info);
  };
  try { put(); bm.tick(1 / 60); } finally { backend.draw = draw; }
  sizes.sort((a, b) => a - b);
  const small = sizes.filter((n) => n < 600).length;
  const top = (m, n = 30) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
  return { view, total: [...byPass.values()].reduce((a, b) => a + b, 0), byPass: Object.fromEntries(top(byPass)), byKind: Object.fromEntries(top(byKind)),
    worldMaterials: mats.size, worldDrawsUnder600Indices: small, medianIndices: sizes[sizes.length >> 1], byPassOwner: top(byPassOwner, 12) };
}
