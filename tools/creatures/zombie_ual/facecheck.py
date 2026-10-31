"""Face alignment check: the head in rest pose wearing the raw sheet (not the bake), front and
profile, so painted eyes / nose / mouth can be compared with the sculpted ones.

  blender -b <out>/zombie_ual.blend --python facecheck.py -- <tex_dir> <out.png> [wire]
"""
import math
import os
import subprocess
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
TEX, OUTP = argv[0], argv[1]
WIRE = len(argv) > 2
sc = bpy.context.scene
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        sc.render.engine = eng
        break
    except TypeError:
        pass
sc.render.resolution_x = sc.render.resolution_y = 520
bpy.data.objects["Armature"].data.pose_position = "REST"
mat = bpy.data.materials["ZombieSkin"]
for nd in mat.node_tree.nodes:
    if nd.type == "TEX_IMAGE" and nd.image and "atlas" in nd.image.name:
        nm = nd.image.name.replace("_atlas", "")
        if not os.path.exists(os.path.join(TEX, nm)):
            continue
        cs = nd.image.colorspace_settings.name
        nd.image = bpy.data.images.load(os.path.join(TEX, nm)); nd.image.colorspace_settings.name = cs
    if nd.type in ("UVMAP", "NORMAL_MAP"):
        nd.uv_map = "UVMap"
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
next(n for n in w.node_tree.nodes if n.type == "BACKGROUND").inputs[0].default_value = (0.25, 0.25, 0.27, 1)
ld = bpy.data.lights.new("k", "SUN"); ld.energy = 2.5
ob = bpy.data.objects.new("k", ld); sc.collection.objects.link(ob); ob.rotation_euler = (math.radians(60), 0, math.radians(-20))
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); sc.collection.objects.link(cam); sc.camera = cam
cd.type = "ORTHO"; cd.ortho_scale = 0.3
if WIRE:
    sc.render.use_freestyle = True
    sc.render.line_thickness = 0.5
    sc.view_layers[0].freestyle_settings.linesets[0].select_by_visibility = True
paths = []
for nm, d in (("front", (0, -1, 0)), ("side", (1, 0, 0))):
    d = Vector(d)
    cam.location = Vector((0, 0.0, 1.69)) + d * 1.0
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    p = os.path.splitext(OUTP)[0] + "_" + nm + ".png"
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    paths.append(p)
subprocess.run(["python", "-I", "-c",
                "import sys;from PIL import Image;a,b=[Image.open(p) for p in sys.argv[2:]];"
                "s=Image.new('RGB',(a.width*2,a.height));s.paste(a,(0,0));s.paste(b,(a.width,0));s.save(sys.argv[1])",
                OUTP] + paths, check=True)
