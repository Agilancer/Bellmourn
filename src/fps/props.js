// World props (templates/models/props/<id>/<id>.glb): every placement of a prop is one
// instance of an InstancedMesh, so a graveyard of 150 headstones is a single draw call. Each
// placement also gets a collider (its rotated bounding box) and, for flames, a light source.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT = 'templates/models/props/';
// every prop there is (load() reads them all before the world is laid out, so a placement can
// ask how much floor a prop will cover)
export const PROPS = ['altar', 'anvil', 'barrel', 'bed', 'bookshelf', 'candelabrum', 'crate', 'gravestone_cross', 'gravestone_obelisk',
  'gravestone_round', 'pew', 'pillar_broken', 'pillar_fluted', 'pillar_gothic', 'pillar_round', 'pillar_square', 'pillar_twisted', 'pulpit',
  'sarcophagus', 'stool', 'table', 'treasure_chest', 'wall_torch', 'well'];
// where each prop's flames are (prop space): torches and candles light the world around them
const FLAMES = {
  wall_torch: [[0, 2.06, 0.2, 0.36]],
  candelabrum: [[-0.3, 1.66, 0, 0.13], [0, 1.74, 0, 0.13], [0.3, 1.66, 0, 0.13]],
  altar: [[-0.7, 1.55, 0, 0.13], [0.7, 1.55, 0, 0.13]],
};
const NO_COLLIDE = new Set(['wall_torch']);
// props with flames in them would shadow their own light
const NO_CAST = new Set(['wall_torch', 'candelabrum']);
const SHINY = new Set(['anvil', 'treasure_chest', 'altar', 'sarcophagus', 'pillar_gothic', 'pillar_fluted', 'gravestone_obelisk']);

export class Props {
  constructor(scene, physics, lib = null) {
    this.scene = scene;
    this.physics = physics;
    this.lib = lib;
    this.place = new Map(); // id -> [{x, y, z, rot, scale}]
    this.lights = [];       // [x, y, z, size] flames
    this.boxes = new Map(); // id -> its model's bounding box (once loaded)
    this.models = new Map(); // id -> Promise of { geo, mat, bb } (or null)
  }

  /** Read every prop's model (or those named), so footprint() knows their sizes. */
  async load(ids = PROPS) {
    await Promise.all(ids.map((id) => this.model(id)));
    return this;
  }

  /** A prop's model, ready to instance: { geo, mat, bb }, or null if it can't be had. */
  model(id) {
    if (!this.models.has(id)) this.models.set(id, (async () => {
      let gltf;
      try { gltf = await new GLTFLoader().loadAsync(`${ROOT}${id}/${id}.glb`); } catch (e) { console.warn('prop', id, e); return null; }
      let src = null;
      gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
      if (!src) return null;
      const map = src.material.map;
      if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapLinearFilter; map.needsUpdate = true; }
      const mat = new THREE.MeshPhongMaterial({ map, side: THREE.DoubleSide,
        specular: SHINY.has(id) ? 0x302c28 : 0x0e0d0c, shininess: SHINY.has(id) ? 36 : 10 });
      if (map && this.lib?.normals) mat.normalMap = this.lib.normalFrom(map, 1.2);
      const geo = src.geometry.clone();
      src.updateWorldMatrix(true, false);
      geo.applyMatrix4(src.matrixWorld);
      geo.scale(1, 1, -1); // glTF stores the models z-mirrored: back to as built (front = +z)
      geo.computeBoundingBox();
      this.boxes.set(id, geo.boundingBox);
      return { geo, mat, bb: geo.boundingBox };
    })());
    return this.models.get(id);
  }

  /** Place prop `id`; `fit` (metres) scales it to that height instead of by `scale`. */
  add(id, x, y, z, rot = 0, scale = 1, fit = null) {
    if (!this.place.has(id)) this.place.set(id, []);
    this.place.get(id).push({ x, y, z, rot, scale, fit });
  }

  /** The floor a placement of `id` would cover, [x0, z0, x1, z1] (its turned bounding box, as
   * its collider will be); null for a prop that has no collider. A model not read yet (see
   * load()) is taken as a metre square. */
  footprint(id, x, z, rot = 0, scale = 1, fit = null) {
    if (NO_COLLIDE.has(id)) return null;
    const bb = this.boxes.get(id);
    if (!bb) return [x - 0.5, z - 0.5, x + 0.5, z + 0.5];
    const s = fit ? fit / Math.max(0.05, bb.max.y - bb.min.y) : scale, c = Math.cos(rot), sn = Math.sin(rot), xs = [], zs = [];
    for (const px of [bb.min.x, bb.max.x]) for (const pz of [bb.min.z, bb.max.z]) { xs.push(x + (px * c + pz * sn) * s); zs.push(z + (-px * sn + pz * c) * s); }
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  }

  async finish() {
    await Promise.all([...this.place.entries()].map(async ([id, list]) => {
      const mdl = await this.model(id);
      if (!mdl) return;
      const { geo, mat, bb } = mdl;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      list.forEach((p, i) => {
        if (p.fit) p.scale = p.fit / Math.max(0.05, bb.max.y - bb.min.y);
        q.setFromAxisAngle(up, p.rot);
        m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
        mesh.setMatrixAt(i, m);
        const c = Math.cos(p.rot), s = Math.sin(p.rot);
        if (!NO_COLLIDE.has(id)) { // rotated bounding box -> axis-aligned collider
          const xs = [], zs = [];
          for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) {
            xs.push(p.x + (x * c + z * s) * p.scale); zs.push(p.z + (-x * s + z * c) * p.scale);
          }
          this.physics.add([Math.min(...xs), p.y + bb.min.y * p.scale, Math.min(...zs)],
            [Math.max(...xs), p.y + bb.max.y * p.scale, Math.max(...zs)], 'prop').src = id;
        }
        for (const f of FLAMES[id] || []) {
          this.lights.push([p.x + (f[0] * c + f[2] * s) * p.scale, p.y + f[1] * p.scale,
            p.z + (-f[0] * s + f[2] * c) * p.scale, f[3] * p.scale]);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = !NO_CAST.has(id);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }));
  }
}
