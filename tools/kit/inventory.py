"""Inventory the Quaternius packs: one line per model with its size, materials and textures.

  blender -b --factory-startup --python tools/kit/inventory.py -- <raw_dir> <out.json>

<raw_dir> is art/raw/quaternius (the six packs unzipped there, see README.md). Reads glTF where
a pack has it, FBX otherwise.
"""
import json
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from packs import sources  # noqa: E402


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def load(path):
    if path.endswith('.gltf') or path.endswith('.glb'):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        bpy.ops.import_scene.fbx(filepath=path)


def describe(path):
    clear()
    load(path)
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    mats, texs, verts, tris, uv = {}, set(), 0, 0, True
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH':
            continue
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
        me = ob.data
        verts += len(me.vertices)
        tris += sum(len(p.vertices) - 2 for p in me.polygons)
        uv = uv and bool(me.uv_layers)
        for s in ob.material_slots:
            m = s.material
            if not m:
                continue
            col = None
            if m.use_nodes:
                for n in m.node_tree.nodes:
                    if n.type == 'TEX_IMAGE' and n.image:
                        texs.add(os.path.basename(n.image.filepath or n.image.name))
                    if n.type == 'BSDF_PRINCIPLED':
                        col = list(n.inputs['Base Color'].default_value)[:3]
            mats[m.name] = [round(c, 3) for c in (col or m.diffuse_color[:3])]
    return {'size': [round(hi[i] - lo[i], 3) for i in range(3)], 'min': [round(v, 3) for v in lo],
            'verts': verts, 'tris': tris, 'uv': uv, 'materials': mats, 'textures': sorted(texs)}


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    raw, out = argv[0], argv[1]
    only = argv[2] if len(argv) > 2 else None
    res = {}
    for pack, name, path in sources(raw):
        if only and pack != only:
            continue
        try:
            res.setdefault(pack, {})[name] = describe(path)
        except Exception as e:  # noqa: BLE001
            res.setdefault(pack, {})[name] = {'error': str(e)}
        print('inventory', pack, name, flush=True)
    with open(out, 'w') as f:
        json.dump(res, f, indent=1)


main()
