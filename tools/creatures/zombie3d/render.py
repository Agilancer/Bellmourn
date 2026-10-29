"""Render review images of built zombie .glb files, side by side.

  blender -b --factory-startup --python render.py -- <out_prefix> <a.glb> [<b.glb> ...]

Writes <out_prefix>_<view>.png for the views front, three_quarter, side, back and head (a
close-up). Lighting follows the style lock: a warm key from the viewer's upper left, a weak
cool fill, a dark backdrop. Textures are sampled nearest-neighbour, as in the game.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]
prefix, glbs = a[0], a[1:]
ortho = os.environ.get("ORTHO") == "1"
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
GAP = 1.25
for i, g in enumerate(glbs):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=g)
    for o in set(bpy.data.objects) - before:
        if o.parent is None:
            o.location.x += (i - (len(glbs) - 1) / 2) * GAP
for m in bpy.data.materials:
    if m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE":
                n.interpolation = "Closest"

try:
    sc.render.engine = "BLENDER_EEVEE"
except TypeError as e:
    print(e)
    sc.render.engine = "BLENDER_EEVEE_NEXT"
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (0.02, 0.02, 0.028, 1)
bg.inputs[1].default_value = 1.0

floor = bpy.data.meshes.new("floor")
floor.from_pydata([(-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)], [], [(0, 1, 2, 3)])
fo = bpy.data.objects.new("floor", floor)
sc.collection.objects.link(fo)
fm = bpy.data.materials.new("floor")
fm.use_nodes = True
next(n for n in fm.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (0.05, 0.045, 0.04, 1)
floor.materials.append(fm)


def light(name, kind, energy, color, rot):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    lo = bpy.data.objects.new(name, ld)
    sc.collection.objects.link(lo)
    lo.rotation_euler = rot
    return lo


cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.clip_start = 0.05
sc.render.resolution_x = 700 * max(1, len(glbs))
sc.render.resolution_y = 1000
sc.view_settings.view_transform = "Standard"

span = GAP * len(glbs)
VIEWS = {"front": 0, "three_quarter": -35, "side": -90, "back": 180}
for view, yaw in list(VIEWS.items()) + [("head", -20), ("head_back", 160)]:
    for o in [o for o in sc.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(o)
    r = math.radians(yaw)
    # the key light sits at the viewer's upper left, whatever the view
    light("key", "SUN", 4.0, (1.0, 0.94, 0.84), (math.radians(50), 0, r + math.radians(-35)))
    light("fill", "SUN", 0.9, (0.55, 0.62, 0.8), (math.radians(70), 0, r + math.radians(150)))
    fwd = Vector((math.sin(r), -math.cos(r), 0))
    if view.startswith("head"):
        sc.render.resolution_y = 600
        cam.data.type = "PERSP"
        cam.data.lens = 85
        target = Vector((0, 0, 1.55))
        cam.location = target + fwd * 1.0 * len(glbs) + Vector((0, 0, 0.08))
    elif ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = max(span, 1.0 * 1.43 * len(glbs) * 0.7 / 0.7)
        target = Vector((0, 0, 0.9))
        cam.location = target + fwd * 6
    else:
        sc.render.resolution_y = 1000
        cam.data.type = "PERSP"
        cam.data.lens = 50
        target = Vector((0, 0, 0.88))
        dist = 2.7 + 1.35 * len(glbs)
        cam.location = target + fwd * dist + Vector((0, 0, 0.55))
    d = target - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = f"{prefix}_{view}.png"
    bpy.ops.render.render(write_still=True)
