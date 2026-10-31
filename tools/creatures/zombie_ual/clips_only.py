"""Remake the clip takes inside a built monster, without rebuilding it.

  blender -b <work>/<name>/out/zombie_ual.blend --python clips_only.py -- [--diag] [--export clips.glb]

--diag prints, for every take, where the hands, head and feet go (metres from the pelvis,
character facing -Y), so a take can be checked before anything is rendered.
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import clipvars  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ARM = bpy.data.objects["Armature"]
clipvars.make(ARM)

if "--diag" in argv:
    sc = bpy.context.scene
    ad = ARM.animation_data or ARM.animation_data_create()
    for t in ad.nla_tracks:
        t.mute = True
    pb = ARM.pose.bones
    only = argv[argv.index("--diag") + 1] if len(argv) > argv.index("--diag") + 1 and not argv[argv.index("--diag") + 1].startswith("--") else ""
    for base in clipvars.BASE:
        for name in [base] + [base + "_" + s for s in "BCDE"]:
            if only and only not in name:
                continue
            act = bpy.data.actions[name]
            ad.action = act
            if hasattr(ad, "action_slot") and len(act.slots):
                ad.action_slot = act.slots[0]
            f0, f1 = act.frame_range
            print("==", name, "frames %.1f" % (f1 - f0))
            for i in range(9):
                fr = f0 + (f1 - f0) * i / 8
                sc.frame_set(int(fr), subframe=fr - int(fr))
                pel = pb["pelvis"].head
                r = lambda b, e="tail": tuple(round(c, 2) for c in (getattr(pb[b], e) - pel))
                print("  u%.2f pel%s hR%s hL%s head%s fR%s fL%s  limbL%s" % (
                    i / 8, tuple(round(c, 2) for c in pel), r("hand_r"), r("hand_l"), r("Head"), r("foot_r", "head"),
                    r("foot_l", "head"), tuple(round(c, 2) for c in (pb["hand_l"].tail - pb["upperarm_l"].head))))
                hd = [(pb[h].tail - pb[t].head).length for h in ("hand_l", "hand_r") for t in ("Head", "spine_03")]
                print("        toeZ L%.2f R%.2f  handZ L%.2f R%.2f  hand-head L%.2f R%.2f hand-chest L%.2f R%.2f  elbowL %.0f R %.0f" % (
                    pb["ball_l"].tail.z, pb["ball_r"].tail.z, pb["hand_l"].tail.z, pb["hand_r"].tail.z, hd[0], hd[2], hd[1], hd[3],
                    *[math.degrees((pb["upperarm" + s].tail - pb["upperarm" + s].head).angle(pb["lowerarm" + s].tail - pb["lowerarm" + s].head))
                      for s in ("_l", "_r")]))

if "--export" in argv:
    path = argv[argv.index("--export") + 1]
    for o in bpy.context.scene.objects:
        o.select_set(o == ARM)
    kw = dict(filepath=path, export_format="GLB", export_animations=True, use_selection=True, export_skins=True,
              export_apply=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    if "export_animation_mode" in props:
        kw["export_animation_mode"] = "ACTIONS"
    if "export_def_bones" in props:
        kw["export_def_bones"] = False
    bpy.ops.export_scene.gltf(**kw)
    print("[clips] exported", path, os.path.getsize(path) // 1024, "KB")
    bpy.ops.wm.save_mainfile()
