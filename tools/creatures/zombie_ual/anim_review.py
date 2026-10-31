"""Contact sheets for the clip takes: one sheet per zombie clip, the original and its four takes
as rows, five moments across the clip as columns.

  blender -b <out>/zombie_ual.blend --python anim_review.py -- <out_dir>
"""
import math
import os
import subprocess
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
OUT = argv[0]
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
ARM = bpy.data.objects["Armature"]
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        sc.render.engine = eng
        break
    except TypeError:
        pass
sc.render.resolution_x, sc.render.resolution_y = 240, 300
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
next(n for n in w.node_tree.nodes if n.type == "BACKGROUND").inputs[0].default_value = (0.05, 0.055, 0.065, 1)
for nm, rot, e in (("key", (52, 0, -35), 3.0), ("rim", (-60, 0, 160), 2.2), ("fill", (70, 0, 60), 0.8)):
    ld = bpy.data.lights.new(nm, "SUN"); ld.energy = e
    ob = bpy.data.objects.new(nm, ld); sc.collection.objects.link(ob)
    ob.rotation_euler = [math.radians(a) for a in rot]
cd = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cd); sc.collection.objects.link(cam); sc.camera = cam
cd.lens = 40
d = Vector((0.55, -1, 0.12)).normalized()
cam.location = Vector((0, -0.1, 0.8)) + d * 2.55
cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
ad = ARM.animation_data or ARM.animation_data_create()
for t in ad.nla_tracks:
    t.mute = True

for base in ("Zombie_Idle_Loop", "Zombie_Walk_Fwd_Loop", "Zombie_Scratch"):
    paths = []
    ncol = 8 if "Scratch" in base else 5      # the attacks need more moments to catch the wind-up and the hit
    for name in [base] + [base + "_" + s for s in "BCDE"]:
        act = bpy.data.actions.get(name)
        if act is None:
            continue
        ad.action = act
        if hasattr(ad, "action_slot") and len(act.slots):
            ad.action_slot = act.slots[0]
        f0, f1 = act.frame_range
        for i in range(ncol):
            sc.frame_set(int(round(f0 + (f1 - f0) * i / ncol)))
            p = os.path.join(OUT, "%s_%d.png" % (name, i))
            sc.render.filepath = p
            bpy.ops.render.render(write_still=True)
            paths.append(p)
    sheet = os.path.join(OUT, base + ".png")
    code = ("import sys;from PIL import Image,ImageDraw;n=int(sys.argv[2]);ps=sys.argv[3:];ims=[Image.open(p) for p in ps];w,h=ims[0].size;"
            "s=Image.new('RGB',(w*n,h*(len(ims)//n)));d=ImageDraw.Draw(s)\n"
            "for i,(p,im) in enumerate(zip(ps,ims)):\n"
            "  s.paste(im,((i%n)*w,(i//n)*h))\n"
            "  if i%n==0: d.text((4,(i//n)*h+4),p.replace('\\\\','/').split('/')[-1][:-6],fill=(255,220,120))\n"
            "s.save(sys.argv[1])")
    subprocess.run(["python", "-c", code, sheet, str(ncol)] + paths, check=True)
    print("[anim] sheet", sheet)
