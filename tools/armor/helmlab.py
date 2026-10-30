"""The helm lab: several helms side by side on the reference villager's head, rendered in one
frame (front and three-quarter), for iterating on helms cheaply: no body, no gauntlets.

    blender -b --factory-startup --python tools/armor/helmlab.py -- <male|female> <out.png> <helm> ...

Each <helm> names a function in HELMS below.
"""
import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE]

import build as Bd  # noqa: E402
import pieces as PC  # noqa: E402
import render as R  # noqa: E402
import greathelm as GH  # noqa: E402

STEEL, BRASS = "burnished_steel_mid", "tarnished_gold_mid"
DARK = "lib:cloth_02_stitched_charcoal@0e0c0c"
VEES = ("polished_gold_mid", "hammered_steel_dark")

TRIM = "brushed_steel_dark"
IRON, EMBER, HORN = "hammered_steel_dark", "polished_copper_light@e8701e", "lib:wood_03_rootwood_grain@3a2a22"


def fleur_helm(b):
    h = GH.great_helm(b, STEEL, BRASS, DARK, breaths=None, vees=VEES)
    return h + [GH.fleur(h, BRASS), GH.keyholes(h, DARK)]


def ram_helm(b):
    h = GH.great_helm(b, IRON, "scratched_steel_dark", DARK, breaths="slots", dot_cols=5,
                      vees=("tarnished_gold_mid", EMBER))
    return h + GH.ram_horns(h, HORN)


def board_helm(b):
    h = GH.great_helm(b, STEEL, TRIM, DARK, top=0.024, taper=0.05, vees=VEES)
    return h + GH.crest_boards(h, TRIM)


def antler_helm(b):
    h = GH.great_helm(b, IRON, "scratched_steel_light@decea8", DARK, vees=VEES)
    return h + GH.antlers(h, "scratched_steel_light@decea8")


def bat_helm(b):
    h = GH.great_helm(b, "verdigris_bronze_mid", "polished_copper_mid", DARK, vees=VEES)
    return h + GH.bat_wings(h, "polished_scale_mid@3c6a3a")


def ring_helm(b):
    h = GH.great_helm(b, "burnished_steel_light", "brushed_steel_mid", DARK, vees=VEES)
    return h + GH.ring_arch(h, "burnished_steel_light", knob="polished_copper_light@96ceff")


HELMS = {
    "antler": antler_helm, "bat": bat_helm, "ring": ring_helm,
    "fleur": fleur_helm, "ram": ram_helm, "boards": board_helm,
    "pot": lambda b: GH.great_helm(b, STEEL, STEEL, DARK, vees=VEES),
    "tall": lambda b: GH.great_helm(b, STEEL, STEEL, DARK, top=0.028, taper=0.04, vees=VEES),
    "shade": lambda b: GH.great_helm(b, IRON, "scratched_steel_dark", DARK, brow_shade=0.014, top=0.004,
                                     taper=0.09, vees=VEES),
    "slots": lambda b: GH.great_helm(b, STEEL, STEEL, DARK, breaths="slots", vees=VEES),
    "brass": lambda b: GH.great_helm(b, STEEL, BRASS, DARK, vees=VEES),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    sex, out, names = argv[0], argv[1], argv[2:]
    out_dir = os.path.dirname(out)
    Bd.TEXDIR = os.path.join(out_dir, "tex")
    os.makedirs(Bd.TEXDIR, exist_ok=True)
    heads, eyes = Bd.head_cloud(sex, os.path.join(out_dir, f"heads_{sex}.npz"))
    arm, bones, body_objs = Bd.reference(sex)
    for o in body_objs:
        o.hide_render = True
    hair = [o for o in bpy.data.objects if o.name.startswith("V_Hair")]
    for o in hair:
        o.hide_render = True
    body = PC.Body(np.zeros((1, 3)), np.array(["Root"]), bones, heads, eyes)
    head_objs = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("V_")]
    gap = 0.34
    for i, nm in enumerate(names):
        x = (i - (len(names) - 1) / 2) * gap
        made = {}
        objs = []
        for pc in HELMS[nm](body):
            if pc.get("kind") == "emblem":
                o = Bd.make_emblem(pc, made[pc["target"]], arm)
            else:
                o = Bd.make_piece(pc, arm, None)
                made[pc["name"]] = o
            objs.append(o)
        for o in objs:
            o.location.x += x
        for h in head_objs:  # a copy of the head under each helm (seen through its slits)
            if h.name.startswith("V_Hair"):
                continue
            c = h.copy()
            c.data = h.data
            c.matrix_world = h.matrix_world.copy()
            bpy.context.collection.objects.link(c)
            c.location.x += x
    for h in head_objs:
        h.hide_render = True
    cam = R.stage()
    sc = bpy.context.scene
    sc.cycles.samples = 20
    sc.render.resolution_x, sc.render.resolution_y = 380 * len(names), 640
    ez = float(eyes[2])
    span = gap * len(names)
    d = (span / 2 + 0.12) / (12 / 50 * sc.render.resolution_x / sc.render.resolution_y)
    for tag, pos in (("front", (0.0, -d, ez + 0.02)),
                     ("34", (d * 0.55, -d * 1.05, ez + 0.14))):
        cam.location = pos
        cam.data.lens = 50
        R.look(cam, (0, 0, ez + 0.06))
        sc.render.filepath = out.replace(".png", f"_{tag}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
