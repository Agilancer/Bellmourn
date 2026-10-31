"""Review renders of a built monster (Cycles, CPU): a turnaround, close-ups, and clip frames.

    python review.py -- <built .blend> <out_dir> [turn] [close] [clips] [clay]

`turn`: front, three-quarter, side and back, full length, in a dim three-point light over a
dark floor; `close`: the head front and three-quarter, and a hand; `clips`: frames from the
clips (idle, walk, attack1, attack3) at the moments that read; `clay`: the turnaround without
the texture, to judge the shapes. Everything is written as PNGs plus contact sheets.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

VIEWS = {"front": 0, "34": 35, "side": 90, "back": 180}
CLIP_FRAMES = {"idle": [0, 30], "walk": [0, 10, 20], "attack1": [6, 14], "attack3": [12, 21], "rise": [10, 30]}


def setup(res=(720, 1080), samples=48):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.035, 0.038, 0.045, 1)
    bg.inputs[1].default_value = 1.0
    for name, (rx, rz, e, col, size) in {
        "key": (52, 35, 4.2, (1.0, 0.93, 0.82), 3),
        "fill": (68, -70, 0.9, (0.65, 0.75, 1.0), 10),
        "rim": (60, 165, 3.2, (0.9, 0.95, 1.0), 4),
    }.items():
        L = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        L.data.energy = e
        L.data.color = col
        L.data.angle = math.radians(size)
        L.rotation_euler = (math.radians(rx), 0, math.radians(rz))
        sc.collection.objects.link(L)
    if "floor" not in bpy.data.objects:
        bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
        fl = bpy.context.active_object
        fl.name = "floor"
        m = bpy.data.materials.new("floor")
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (0.05, 0.048, 0.045, 1)
        b.inputs["Roughness"].default_value = 0.95
        fl.data.materials.append(m)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def aim(cam, target, az, dist, elev=8, lens=50):
    a, e = math.radians(az), math.radians(elev)
    t = Vector(target)
    cam.data.lens = lens
    cam.location = t + Vector((-math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()


def shot(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def sheet(paths, out, cols=None, scale=1.0):
    from PIL import Image
    ims = [Image.open(p).convert("RGB") for p in paths]
    cols = cols or len(ims)
    w, h = ims[0].size
    rows = (len(ims) + cols - 1) // cols
    S = Image.new("RGB", (w * cols, h * rows), (10, 10, 12))
    for i, im in enumerate(ims):
        S.paste(im.resize((w, h)), ((i % cols) * w, (i // cols) * h))
    if scale != 1:
        S = S.resize((int(S.width * scale), int(S.height * scale)))
    S.save(out)
    return out


def body():
    return max((o for o in bpy.data.objects if o.type == "MESH" and o.name != "floor"),
               key=lambda o: len(o.data.vertices))


def clay(on):
    o = body()
    if on:
        m = bpy.data.materials.get("clay") or bpy.data.materials.new("clay")
        m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.55, 0.53, 0.5, 1)
        o["_mats"] = [m2.name for m2 in o.data.materials]
        o.data.materials.clear()
        o.data.materials.append(m)
    elif "_mats" in o:
        o.data.materials.clear()
        for n in o["_mats"]:
            o.data.materials.append(bpy.data.materials[n])


def pose_clip(name, frame):
    rig = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if rig is None:
        return False
    act = bpy.data.actions.get(name)
    if act is None:
        return False
    rig.animation_data_create()
    rig.animation_data.action = act
    if hasattr(rig.animation_data, "action_slot") and act.slots:
        rig.animation_data.action_slot = act.slots[0]
    bpy.context.scene.frame_set(frame + 1)
    return True


def rest():
    rig = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if rig and rig.animation_data:
        rig.animation_data.action = None
        for pb in rig.pose.bones:
            pb.location = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.rotation_euler = (0, 0, 0)
        bpy.context.view_layer.update()


def run(out, what, idle_pose=True):
    os.makedirs(out, exist_ok=True)
    cam = setup()
    made = {}
    stance = ("idle", 0) if idle_pose else None
    if "turn" in what or "clay" in what:
        for mode in [m for m in ("turn", "clay") if m in what]:
            clay(mode == "clay")
            rest()
            if stance:
                pose_clip(*stance)
            ps = []
            for v, az in VIEWS.items():
                aim(cam, (0, 0, 0.92), az, 4.6, 6, 50)
                ps.append(shot(os.path.join(out, f"{mode}_{v}.png")))
            made[mode] = sheet(ps, os.path.join(out, f"{mode}.png"), scale=0.6)
            clay(False)
    if "close" in what:
        rest()
        if stance:
            pose_clip(*stance)
        rig = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
        head = (rig.matrix_world @ rig.pose.bones["head"].head) if rig else Vector((0, -0.04, 1.66))
        hand = (rig.matrix_world @ rig.pose.bones["hand.R"].head) if rig else Vector((-0.66, -0.08, 1.43))
        sc = bpy.context.scene
        sc.render.resolution_x, sc.render.resolution_y = 900, 900
        ps = []
        for v, az in (("front", 0), ("34", 40), ("side", 90)):
            aim(cam, head + Vector((0, 0, 0.08)), az, 1.1, 4, 85)
            ps.append(shot(os.path.join(out, f"head_{v}.png")))
        aim(cam, hand + Vector((0, -0.02, -0.06)), -30, 0.75, 25, 85)
        ps.append(shot(os.path.join(out, "hand.png")))
        made["close"] = sheet(ps, os.path.join(out, "close.png"), scale=0.55)
        sc.render.resolution_x, sc.render.resolution_y = 720, 1080
    if "clips" in what:
        ps = []
        bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = 600, 800
        for clip, frames in CLIP_FRAMES.items():
            for fr in frames:
                if not pose_clip(clip, fr):
                    continue
                aim(cam, (0, 0, 0.85), 30, 4.4, 8, 50)
                ps.append(shot(os.path.join(out, f"clip_{clip}_{fr}.png")))
        if ps:
            made["clips"] = sheet(ps, os.path.join(out, "clips.png"), cols=6, scale=0.5)
    return made


if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 1:]
    bpy.ops.wm.open_mainfile(filepath=a[0])
    print(run(a[1], set(a[2:]) or {"turn", "close"}))
