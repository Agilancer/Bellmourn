// The still world in render bundles (WebGPU). The builders' meshes (houses, walls, the cathedral, the
// dungeon: thousands of small pieces) are gathered into 40 m cells, each a BundleGroup: the GPU keeps
// the cell's draws recorded and replays them, so the CPU no longer walks each piece every frame (which,
// under three's WebGPU renderer, cost ~10 µs a draw: the frame was the CPU's, not the GPU's).
//  - a cell is culled whole, against whichever camera is drawing (the world's, the sun's, a torch's);
//    inside, everything is drawn (the GPU has the time);
//  - a cell is recorded again only when one of its pieces is shown, hidden or stops casting shadow;
//  - the sun's still-world map (sunshadow.js) draws its slices without bundles (withoutBundles), as its
//    casters are filtered slice by slice.
import * as THREE from 'three';

let current = null, all = 0, bundles = true;
const pool = [];

/** Draw everything in `fn` without bundles (cells as plain groups). */
export function withoutBundles(fn) { const was = bundles; bundles = false; try { return fn(); } finally { bundles = was; } }

class Cell extends THREE.BundleGroup {
  constructor() { super(); this.box = new THREE.Box3(); this.shown = true; this.isCell = true; this.sig = ''; }
  get visible() { return this.shown && (all > 0 || current === null || current.intersectsBox(this.box)); }
  set visible(v) { this.shown = v; }
  get isBundleGroup() { return bundles; }
  set isBundleGroup(v) { /* (BundleGroup's constructor sets it) */ }
}

/** Gather `meshes` (static, fixed matrices, direct children of `scene`) into cells. Returns
 * { cells, update(), all(on) }: update() each frame (re-records a cell whose pieces changed). */
export function makeCells(renderer, scene, meshes, size = 40) {
  const byKey = new Map(), _b = new THREE.Box3();
  for (const m of meshes) {
    if (m.parent !== scene || !m.isMesh || !m.geometry?.attributes?.position) continue;
    const g = m.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    _b.copy(g.boundingBox).applyMatrix4(m.matrixWorld);
    const c = _b.getCenter(new THREE.Vector3()), big = _b.getSize(new THREE.Vector3()).length() > size * 2;
    const key = big ? 'big' + m.id : `${Math.floor(c.x / size)},${Math.floor(c.z / size)},${c.y < -2 ? 'u' : 's'}`;
    let cell = byKey.get(key);
    if (!cell) { cell = new Cell(); cell.name = 'cell ' + key; byKey.set(key, cell); scene.add(cell); }
    scene.remove(m);
    cell.add(m);   // (the cell sits at the origin: the piece's matrices stand)
    m.frustumCulled = false;
    cell.box.union(_b);
  }
  const cells = [...byKey.values()];
  for (const c of cells) { c.updateMatrixWorld(true); c.sig = sig(c); }
  // each render's camera frustum, for the cells' culling (nested renders: the shadows inside the world)
  const render = renderer.render.bind(renderer);
  let depth = 0;
  renderer.render = (sc, cam) => {
    const prev = current;
    const f = pool[depth] ||= new THREE.Frustum();
    if (cam) { cam.updateMatrixWorld(); f.setFromProjectionMatrix(_m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse), cam.coordinateSystem); current = f; }
    depth++;
    try { return render(sc, cam); } finally { depth--; current = prev; }
  };
  return {
    cells,
    update() { for (const c of cells) { const s = sig(c); if (s !== c.sig) { c.sig = s; c.needsUpdate = true; } } },
    all(on) { all += on ? 1 : -1; },
    count: () => cells.reduce((n, c) => n + c.children.length, 0),
  };
}

const _m = new THREE.Matrix4();
/** What of a cell's pieces is shown and casts: when it changes, the cell is recorded again. */
function sig(cell) {
  let s = '', n = 0, k = 0;
  for (const m of cell.children) { k = k * 31 + (m.visible ? 1 : 0) + (m.castShadow ? 2 : 0) | 0; if (++n % 24 === 0) { s += k.toString(36); k = 0; } }
  return s + k.toString(36);
}
