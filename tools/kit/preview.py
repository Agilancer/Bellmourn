"""Render a reworked kit bundle as a contact sheet, textured with the repainted atlases.

  blender -b --factory-startup --python tools/kit/preview.py -- <kit_dir> <pack> <out.png> [filter regex] [columns]

Every model in <kit_dir>/<pack>.glb (lod copies left out) laid out in rows on a dark floor, each
with its name under it, seen from the front-left and above in torchlight-ish studio lighting.
"""
import math
import os
import re
import sys

import bpy
from mathutils import Vector


def atlas_material(mat, tex_dir):
    name = mat.name.split('.')[0]
    path = os.path.join(tex_dir, name + '.png')
    if not os.path.exists(path):
        return
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    img = nt.nodes.new('ShaderNodeTexImage')
    img.image = bpy.data.images.load(path, check_existing=True)
    img.interpolation = 'Closest'
    nt.links.new(img.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(img.outputs['Alpha'], bsdf.inputs['Alpha'])
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    try:
        mat.surface_render_method = 'DITHERED'
    except Exception:  # noqa: BLE001
        pass
    mat.blend_method = 'CLIP' if hasattr(mat, 'blend_method') else None


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    kit, pack, out = os.path.abspath(argv[0]), argv[1], os.path.abspath(argv[2])
    flt = re.compile(argv[3]) if len(argv) > 3 and argv[3] else None
    cols = int(argv[4]) if len(argv) > 4 else 10
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(kit, pack + '.glb'))
    tex = os.path.join(kit, 'tex')
    for m in bpy.data.materials:
        atlas_material(m, tex)
    obs = [o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.name.endswith('~lod') and (not flt or flt.search(o.name))]
    for o in bpy.context.scene.objects:
        if o not in obs:
            o.hide_render = True
    obs.sort(key=lambda o: o.name)
    # lay out in rows: each cell as wide as its model
    x = z = 0.0
    row_d = 0.0
    sizes = []
    for i, o in enumerate(obs):
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
        hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
        sizes.append((lo, hi))
    cell = max(2.0, sorted(max(hi.x - lo.x, hi.y - lo.y) for lo, hi in sizes)[int(len(sizes) * 0.8)] * 1.15)
    for i, (o, (lo, hi)) in enumerate(zip(obs, sizes)):
        c, r = i % cols, i // cols
        s = min(1.0, cell / max(1e-3, max(hi.x - lo.x, hi.y - lo.y, (hi.z - lo.z) * 0.8)))
        o.scale = (s, s, s)
        o.location = (c * cell - (lo.x + hi.x) / 2 * s, -r * cell * 1.15 - (lo.y + hi.y) / 2 * s, -lo.z * s)
        bpy.ops.object.text_add(location=(c * cell - cell * 0.45, -r * cell * 1.15 - cell * 0.5, 0.01))
        t = bpy.context.object
        t.data.body = o.name.split('/')[-1][:22]
        t.data.size = cell * 0.075
        row_d = r
    W, Hn = cols * cell, (row_d + 1) * cell * 1.15
    bpy.ops.mesh.primitive_plane_add(size=1, location=(W / 2 - cell / 2, -Hn / 2 + cell * 0.5, -0.01))
    fl = bpy.context.object
    fl.scale = (W * 1.2, Hn * 1.4, 1)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'TEXTURE'
    sh.show_shadows = True
    sh.show_cavity = True
    sh.background_type = 'VIEWPORT' if hasattr(sh, 'background_type') else None
    bpy.ops.object.camera_add(location=(W / 2 - cell / 2 - Hn * 0.25, -Hn / 2 - Hn * 0.55, Hn * 0.75))
    cam = bpy.context.object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(W, Hn) * 1.08
    target = Vector((W / 2 - cell / 2, -Hn / 2 + cell * 0.3, 0))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.resolution_x = 1600
    sc.render.resolution_y = int(1600 * min(1.6, (Hn * 0.8 + cell) / W))
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


main()
