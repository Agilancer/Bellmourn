"""Preview frames of a built set on its reference villager (Cycles on the CPU).

Called by build.py with `render`; or on a saved build:
    blender -b <out>/<set>_<m|f>.blend --python tools/armor/render.py -- <out>/<set>_<m|f>
Frames: idle three-quarter front and back, a walk stride from the side, the face, and the
helm off.
"""
import math
import os
import sys

import bpy
from mathutils import Vector


def look(cam, target):
    d = Vector(target) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def stage():
    sc = bpy.context.scene
    try:
        sc.render.engine = "CYCLES"
    except TypeError:
        pass
    sc.cycles.device = "CPU"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 640, 960
    sc.view_settings.view_transform = "AgX" if "AgX" in [
        i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties[
            "view_transform"].enum_items] else "Filmic"
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.05, 0.05, 0.055, 1)
    bg.inputs["Strength"].default_value = 1.0
    sc.world = world
    for name, loc, energy, size in (("key", (2.2, -2.6, 3.2), 190, 2.0),
                                     ("fill", (-2.8, -1.6, 1.8), 70, 3.0),
                                     ("rim", (0.5, 3.0, 2.8), 200, 2.0)):
        L = bpy.data.lights.new(name, "AREA")
        L.energy, L.size = energy, size
        o = bpy.data.objects.new(name, L)
        o.location = loc
        sc.collection.objects.link(o)
        look(o, (0, 0, 1.0))
    bpy.ops.mesh.primitive_plane_add(size=8)
    floor = bpy.context.active_object
    m = bpy.data.materials.new("floor")
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (0.09, 0.08, 0.07, 1)
    b.inputs["Roughness"].default_value = 0.9
    floor.data.materials.append(m)
    cd = bpy.data.cameras.new("cam")
    cd.sensor_fit = "VERTICAL"
    cd.sensor_height = 24
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def play(arm, clip, frame):
    act = bpy.data.actions.get(clip)
    arm.data.pose_position = "POSE"
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    if hasattr(ad, "action_slot") and act is not None and len(getattr(act, "slots", [])):
        ad.action_slot = act.slots[0]
    bpy.context.scene.frame_set(frame)


def shots(arm, A, H, body_objs, prefix, quick=False):
    """The preview frames; `quick` (for iterating on a set) renders only the three-quarter front
    and back, small and at a few samples."""
    cam = stage()
    if quick:
        sc = bpy.context.scene
        sc.cycles.samples = 16
        sc.render.resolution_x, sc.render.resolution_y = 480, 720
    for o in body_objs:
        o.hide_render = True
    hair = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("V_Hair")
            and not o.name.startswith("V_HairShell")]
    eye = next((o for o in bpy.data.objects if o.name.startswith("V_Eyes")), None)
    ez = (eye.matrix_world @ eye.data.vertices[0].co).z if eye else 1.7

    def shot(name, clip, frame, pos, target, lens, helm=True):
        play(arm, clip, frame)
        if H:
            H.hide_render = not helm
        for o in hair:
            o.hide_render = bool(H) and helm
        cam.location = pos
        cam.data.lens = lens
        look(cam, target)
        bpy.context.scene.render.filepath = f"{prefix}_{name}.png"
        bpy.ops.render.render(write_still=True)

    shot("front", "idle", 20, (1.7, -3.6, 1.25), (0, 0, 0.93), 50)
    shot("back", "idle", 20, (-1.9, 3.5, 1.3), (0, 0, 0.93), 50)
    if quick:
        shot("face", "idle", 20, (0.5, -1.25, ez + 0.05), (0, 0, ez - 0.08), 50)
        return
    shot("walk", "walk", 8, (-3.9, -0.6, 1.1), (0, 0, 0.93), 50)
    shot("face", "idle", 20, (0.5, -1.25, ez + 0.05), (0, 0, ez - 0.08), 50)
    shot("nohelm", "idle", 20, (1.2, -2.0, ez - 0.1), (0, 0, ez - 0.35), 50, helm=False)
    play(arm, "idle", 20)
    w = arm.matrix_world @ arm.pose.bones["Wrist.R"].head
    shot("hand", "idle", 20, (w.x - 0.75, w.y - 0.95, w.z + 0.3), (w.x, w.y, w.z + 0.04), 50)


if __name__ == "__main__":
    prefix = sys.argv[sys.argv.index("--") + 1]
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    A = bpy.data.objects["Armor"]
    H = bpy.data.objects.get("Helm")
    body = [o for o in bpy.data.objects if o.type == "MESH" and o.parent == arm
            and not o.name.startswith("V_") and o not in (A, H)]
    shots(arm, A, H, body, prefix)
