"""Write binary glTF (.glb) files three.js can load: meshes (optionally skinned), a skeleton,
STEP-interpolated animations and one embedded nearest-filtered texture.

Everything is built in the rig's camera space (x right, y up, z forward) and converted here to
glTF/three.js space (z toward the viewer) by flipping z, which also flips triangle winding.
"""
import json
import struct

import numpy as np

FLIP = np.diag([1.0, 1.0, -1.0])


def to_gl_points(p):
    return np.asarray(p, float) @ FLIP


def to_gl_matrix(m):
    """Rig-space 4x4 -> glTF-space 4x4 (conjugate by the z flip)."""
    f = np.diag([1.0, 1.0, -1.0, 1.0])
    return f @ m @ f


def quat(r):
    """Rotation matrix -> quaternion (x, y, z, w)."""
    t = np.trace(r)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2
        q = [(r[2, 1] - r[1, 2]) / s, (r[0, 2] - r[2, 0]) / s, (r[1, 0] - r[0, 1]) / s, 0.25 * s]
    elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
        s = np.sqrt(1.0 + r[0, 0] - r[1, 1] - r[2, 2]) * 2
        q = [0.25 * s, (r[0, 1] + r[1, 0]) / s, (r[0, 2] + r[2, 0]) / s, (r[2, 1] - r[1, 2]) / s]
    elif r[1, 1] > r[2, 2]:
        s = np.sqrt(1.0 + r[1, 1] - r[0, 0] - r[2, 2]) * 2
        q = [(r[0, 1] + r[1, 0]) / s, 0.25 * s, (r[1, 2] + r[2, 1]) / s, (r[0, 2] - r[2, 0]) / s]
    else:
        s = np.sqrt(1.0 + r[2, 2] - r[0, 0] - r[1, 1]) * 2
        q = [(r[0, 2] + r[2, 0]) / s, (r[1, 2] + r[2, 1]) / s, 0.25 * s, (r[1, 0] - r[0, 1]) / s]
    q = np.array(q)
    return q / np.linalg.norm(q)


class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.j = dict(asset=dict(version="2.0", generator="Bellmourn tools/models"),
                      scene=0, scenes=[dict(nodes=[])], nodes=[], meshes=[], accessors=[],
                      bufferViews=[], buffers=[])

    def _view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin += data
        v = dict(buffer=0, byteOffset=off, byteLength=len(data))
        if target:
            v["target"] = target
        self.j["bufferViews"].append(v)
        return len(self.j["bufferViews"]) - 1

    def accessor(self, arr, kind, ctype=5126, target=None, minmax=False):
        arr = np.ascontiguousarray(arr)
        fmt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[ctype]
        data = arr.astype(fmt).tobytes()
        acc = dict(bufferView=self._view(data, target), componentType=ctype,
                   count=int(arr.shape[0]), type=kind)
        if minmax:
            flat = arr.reshape(arr.shape[0], -1)
            acc["min"] = [float(x) for x in flat.min(axis=0)]
            acc["max"] = [float(x) for x in flat.max(axis=0)]
        self.j["accessors"].append(acc)
        return len(self.j["accessors"]) - 1

    def node(self, name, parent=None, matrix=None, **extra):
        n = dict(name=name, **extra)
        if matrix is not None:
            m = to_gl_matrix(matrix)
            n["translation"] = [float(x) for x in m[:3, 3]]
            n["rotation"] = [float(x) for x in quat(m[:3, :3])]
        self.j["nodes"].append(n)
        i = len(self.j["nodes"]) - 1
        if parent is None:
            self.j["scenes"][0]["nodes"].append(i)
        else:
            self.j["nodes"][parent].setdefault("children", []).append(i)
        return i

    def texture(self, png_bytes):
        self.j["images"] = [dict(bufferView=self._view(png_bytes), mimeType="image/png")]
        self.j["samplers"] = [dict(magFilter=9728, minFilter=9728, wrapS=33071, wrapT=33071)]
        self.j["textures"] = [dict(sampler=0, source=0)]
        self.j["materials"] = [dict(name="retro", pbrMetallicRoughness=dict(
            baseColorTexture=dict(index=0), metallicFactor=0.0, roughnessFactor=1.0))]

    def mesh(self, name, pos, nrm, uv, idx, joints=None, weights=None):
        """Add a mesh from rig-space arrays; returns the mesh index."""
        pos = to_gl_points(pos)
        nrm = to_gl_points(nrm)
        idx = np.asarray(idx).reshape(-1, 3)[:, ::-1]  # the z flip mirrors winding
        attrs = dict(POSITION=self.accessor(pos, "VEC3", target=34962, minmax=True),
                     NORMAL=self.accessor(nrm, "VEC3", target=34962),
                     TEXCOORD_0=self.accessor(uv, "VEC2", target=34962))
        if joints is not None:
            attrs["JOINTS_0"] = self.accessor(joints, "VEC4", 5123, target=34962)
            attrs["WEIGHTS_0"] = self.accessor(weights, "VEC4", target=34962)
        prim = dict(attributes=attrs, indices=self.accessor(idx.reshape(-1), "SCALAR", 5125,
                                                             target=34963))
        if "materials" in self.j:
            prim["material"] = 0
        self.j["meshes"].append(dict(name=name, primitives=[prim]))
        return len(self.j["meshes"]) - 1

    def skin(self, joints, bind_world):
        """joints: node indices; bind_world: their rig-space world matrices at bind."""
        inv = np.array([np.linalg.inv(to_gl_matrix(m)).T.reshape(-1) for m in bind_world])
        self.j.setdefault("skins", []).append(dict(joints=joints, inverseBindMatrices=(
            self.accessor(inv, "MAT4"))))
        return len(self.j["skins"]) - 1

    def animation(self, name, times, tracks):
        """tracks: {node index: [rig-space 4x4 local matrix per key]}; STEP interpolation."""
        t_acc = self.accessor(np.asarray(times, float), "SCALAR", minmax=True)
        samplers, channels = [], []
        for node, mats in tracks.items():
            gl = [to_gl_matrix(m) for m in mats]
            tr = np.array([m[:3, 3] for m in gl])
            ro = np.array([quat(m[:3, :3]) for m in gl])
            for path, arr, kind in (("translation", tr, "VEC3"), ("rotation", ro, "VEC4")):
                samplers.append(dict(input=t_acc, output=self.accessor(arr, kind),
                                     interpolation="STEP"))
                channels.append(dict(sampler=len(samplers) - 1,
                                     target=dict(node=node, path=path)))
        self.j.setdefault("animations", []).append(dict(name=name, samplers=samplers,
                                                        channels=channels))

    def save(self, path):
        while len(self.bin) % 4:
            self.bin.append(0)
        self.j["buffers"] = [dict(byteLength=len(self.bin))]
        js = json.dumps(self.j, separators=(",", ":")).encode()
        js += b" " * ((4 - len(js) % 4) % 4)
        with open(path, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(self.bin)))
            f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
            f.write(struct.pack("<II", len(self.bin), 0x004E4942) + bytes(self.bin))
