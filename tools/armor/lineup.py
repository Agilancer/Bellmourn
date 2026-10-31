"""Proof of fit: several villagers each wearing the exported set, bound to their own skeletons.

    blender -b --factory-startup --python tools/armor/lineup.py -- <set_x.glb> <out.png> villager_m01 villager_m08 ...

Each villager's body meshes are hidden (the set replaces them) and the set's `Armor` and `Helm`
are re-parented to that villager's armature by bone name, as the game will do. With `--bare`
the helm is left off.
"""
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render as R  # noqa: E402

VILLAGERS = os.path.join(os.path.dirname(os.path.dirname(HERE)), "templates", "models",
                         "creatures", "villagers")


def load(path):
    before_o, before_a = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    return ([o for o in bpy.data.objects if o not in before_o],
            [a for a in bpy.data.actions if a not in before_a])


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    bare = "--bare" in argv
    argv = [a for a in argv if a != "--bare"]
    glb, out, names = argv[0], argv[1], argv[2:]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    gap = 0.95
    for i, n in enumerate(names):
        objs, acts = load(os.path.join(VILLAGERS, n + ".glb"))
        arm = next(o for o in objs if o.type == "ARMATURE")
        for o in objs:
            if o.type == "MESH" and o.parent is None:
                bpy.data.objects.remove(o)
            elif o.type == "MESH" and not o.name.startswith("V_"):
                o.hide_render = True
            elif o.type == "MESH" and o.name.startswith("V_Hair") and not bare:
                o.hide_render = True
        aobjs, aacts = load(glb)
        aarm = next(o for o in aobjs if o.type == "ARMATURE")
        for o in aobjs:
            if o.type != "MESH":
                continue
            if o.parent is None:
                bpy.data.objects.remove(o)
                continue
            o.parent = arm
            for m in o.modifiers:
                if m.type == "ARMATURE":
                    m.object = arm
            if o.name.startswith("Helm") and bare:
                o.hide_render = True
        bpy.data.objects.remove(aarm)
        arm.location.x = (i - (len(names) - 1) / 2) * gap
        idle = next(a for a in acts if a.name.startswith("idle"))
        ad = arm.animation_data or arm.animation_data_create()
        ad.action = idle
        if hasattr(ad, "action_slot") and len(getattr(idle, "slots", [])):
            ad.action_slot = idle.slots[0]
    cam = R.stage()
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = 380 * len(names), 900
    sc.frame_set(20)
    span = gap * len(names)
    cam.location = (0.0, -max(5.2, span * 1.45), 1.15)
    cam.data.lens = 50
    R.look(cam, (0, 0, 0.92))
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
