"""Blender (headless) half of build_hands.py: the arm's surface brought down to a game's triangle
count and unwrapped, with the sleeve joined on.
    blender -b -P blender_uv.py -- body.obj sleeve.obj out.obj triangles
Coordinates pass through unchanged (the OBJs are read and written with forward Y, up Z)."""
import math
import sys

import bpy

body, sleeve, out, tris = sys.argv[sys.argv.index('--') + 1:][:4]
tris = int(tris)
bpy.ops.wm.read_factory_settings(use_empty=True)


def load(path, mat):
    bpy.ops.wm.obj_import(filepath=path, forward_axis='Y', up_axis='Z')
    ob = bpy.context.selected_objects[0]
    m = bpy.data.materials.get(mat) or bpy.data.materials.new(mat)
    ob.data.materials.clear()
    ob.data.materials.append(m)
    return ob


arm = load(body, 'skin')
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=1e-7)
bpy.ops.mesh.quads_convert_to_tris()
bpy.ops.object.mode_set(mode='OBJECT')
dec = arm.modifiers.new('fewer', 'DECIMATE')
dec.ratio = min(1.0, tris / max(1, len(arm.data.polygons)))
bpy.ops.object.modifier_apply(modifier='fewer')

cuff = load(sleeve, 'sleeve')
for o in bpy.context.selected_objects:
    o.select_set(False)
arm.select_set(True)
cuff.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.join()

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.quads_convert_to_tris()
bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
for p in arm.data.polygons:
    p.use_smooth = True
bpy.ops.wm.obj_export(filepath=out, forward_axis='Y', up_axis='Z', export_uv=True, export_normals=False,
                      export_materials=True, export_selected_objects=False, apply_modifiers=True,
                      export_triangulated_mesh=True)
print('arm out', len(arm.data.polygons), 'faces')
