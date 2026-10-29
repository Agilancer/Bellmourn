"""Review frames of a built foe's clips, with held items in its sockets.

  blender -b <out>/<foe>.blend --python review.py -- <out.png> <clip>:<f>,<f>,... [<clip>:...]
          [item:<socket>=<path.glb>] [view:<yaw degrees>]

Renders each listed frame (30 fps, from 0) side by side, a row per clip, from a three-quarter
front view with the style lock's warm key from the upper left. Items are the game's own held
models (origin = grip, +y along the blade), parented to the build's socket empties.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]
out = a[0]
rows, items, yaw = [], {}, -30.0
for x in a[1:]:
    if x.startswith("item:"):
        k, v = x[5:].split("=", 1)
        items[k] = v
    elif x.startswith("view:"):
        yaw = float(x[5:])
    else:
        clip, fr = x.split(":")
        rows.append((clip, [int(f) for f in fr.split(",")]))

sc = bpy.context.scene
ao = next(o for o in sc.objects if o.type == "ARMATURE")
for sock, path in items.items():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    for o in set(bpy.data.objects) - before:
        if o.parent is None:
            o.parent = sc.objects[sock]
            o.matrix_parent_inverse.identity()
            o.location = (0, 0, 0)
            o.rotation_mode = "XYZ"
            o.rotation_euler = (math.radians(-90), 0, 0)   # glTF +y (the blade) -> the socket's +y
for m in bpy.data.materials:
    if m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE":
                n.interpolation = "Closest"
try:
    sc.render.engine = "BLENDER_EEVEE"
except TypeError:
    sc.render.engine = "BLENDER_EEVEE_NEXT"
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (0.05, 0.05, 0.06, 1)
bg.inputs[1].default_value = 1.2
sc.view_settings.view_transform = "Standard"
floor = bpy.data.meshes.new("floor")
floor.from_pydata([(-9, -9, 0), (9, -9, 0), (9, 9, 0), (-9, 9, 0)], [], [(0, 1, 2, 3)])
fo = bpy.data.objects.new("floor", floor)
sc.collection.objects.link(fo)
r = math.radians(yaw)
for name, e, col, rot in (("key", 3.5, (1, .95, .88), (math.radians(50), 0, r - math.radians(35))),
                          ("fill", 1.2, (.6, .66, .85), (math.radians(70), 0, r + math.radians(150)))):
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy, ld.color = e, col
    lo = bpy.data.objects.new(name, ld)
    sc.collection.objects.link(lo)
    lo.rotation_euler = rot
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.lens = 50
h = ao.data.bones["head"].head_local.z + 0.2
target = Vector((0, 0, h * 0.5))
fwd = Vector((math.sin(r), -math.cos(r), 0))
cam.location = target + fwd * (h * 2.0 + 0.6) + Vector((0, 0, h * 0.15))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.render.resolution_x, sc.render.resolution_y = 360, 520
sc.render.film_transparent = False
grid = []
for clip, frames in rows:
    act = bpy.data.actions.get(clip)
    if act is None:
        print("NO CLIP", clip)
        continue
    ao.animation_data.action = act
    if hasattr(ao.animation_data, "action_slot") and act.slots:
        ao.animation_data.action_slot = act.slots[0]
    row = []
    for f in frames:
        sc.frame_set(f + 1)
        p = out.replace(".png", f"_{clip}_{f}.png")
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(p)
        row.append(np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4))
        os.remove(p)
    grid.append(np.concatenate(row, 1))
wmax = max(g.shape[1] for g in grid)
grid = [np.pad(g, ((0, 0), (0, wmax - g.shape[1]), (0, 0))) for g in grid]
img = np.concatenate(grid[::-1], 0)
o = bpy.data.images.new("sheet", img.shape[1], img.shape[0])
o.pixels = img.ravel()
o.filepath_raw = out
o.file_format = "PNG"
o.save()
