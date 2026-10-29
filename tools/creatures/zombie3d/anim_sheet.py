"""Render frames of every clip of a built zombie .blend for review.

  blender -b <zombie_x.blend> --python anim_sheet.py -- <out_dir> [yaw_degrees] [frames_per_clip]

Writes <out_dir>/<clip>_<i>.png (workbench, textured, nearest), one row per clip once
composed by the caller.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]
out = a[0]
yaw = math.radians(float(a[1]) if len(a) > 1 else -40)
per = int(a[2]) if len(a) > 2 else 6
os.makedirs(out, exist_ok=True)
sc = bpy.context.scene
ao = next(o for o in sc.objects if o.type == "ARMATURE")
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.light = "STUDIO"
sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x, sc.render.resolution_y = 260, 300
for m in bpy.data.materials:
    for n in (m.node_tree.nodes if m.node_tree else []):
        if n.type == "TEX_IMAGE":
            n.interpolation = "Closest"
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = "ORTHO"
cam.data.ortho_scale = 2.3
t = Vector((0, -0.2, 0.85))
cam.location = t + Vector((math.sin(yaw), -math.cos(yaw), 0.35)) * 6
cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
floor = bpy.data.meshes.new("floor")
floor.from_pydata([(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [], [(0, 1, 2, 3)])
sc.collection.objects.link(bpy.data.objects.new("floor", floor))
for act in [x for x in bpy.data.actions]:
    ao.animation_data.action = act
    f0, f1 = act.frame_range
    for i in range(per):
        f = f0 + (f1 - f0) * i / max(1, per - 1)
        sc.frame_set(int(round(f)))
        sc.render.filepath = os.path.join(out, f"{act.name}_{i}.png")
        bpy.ops.render.render(write_still=True)
