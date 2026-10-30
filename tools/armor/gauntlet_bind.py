"""The gauntlets' bind skeleton as build.py needs it, written to gauntlet_bind.json.

Run with the system Python (the arm modules need PIL, which Blender's Python lacks):
    python tools/armor/gauntlet_bind.py

Everything is in the axes a gauntlet .glb has once Blender imports it: rig (x, y, z) becomes
(x, z, y), so the arm runs along +y to the fingers, +x is the back of the right hand (-x of the
left) and +z the index side.
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "models"))

import arm as A  # noqa: E402
import gauntlets as G  # noqa: E402


def to_b(p, sx):
    return [round(float(p[0]) * sx, 6), round(float(p[2]), 6), round(float(p[1]), 6)]


out = {}
for side, sx in (("R", 1), ("L", -1)):
    fingers = {}
    for f in A.FINGERS + ("thumb",):
        j = A.finger_joints(f)
        fingers[f] = dict(joints=[to_b(p, sx) for p in j],
                          back=[to_b(G._out(f, k), sx) for k in range(3)],
                          width=A.finger_width(f))
    out[side] = dict(fingers=fingers, back=[sx, 0, 0])
out["fore_radius"] = [[z, *G.fore_radius(z)] for z in np.linspace(-0.30, 0.0, 13).round(4)]
out["hand"] = A.HAND

# which part every texel of each gauntlet's UV layout belongs to (index into `parts`, 0 for
# none), so build.py can dress each part of the gauntlet in the set's own swatches
from PIL import Image, ImageDraw  # noqa: E402

RES = 512
os.makedirs(os.path.join(HERE, "gauntlet_parts"), exist_ok=True)
out["parts"] = {}
for gid, *_ in G.GAUNTLETS:
    model = G.build(gid, "R")
    model.pack()  # the same layout the .glb was exported with (build_gauntlets.py)
    names, im = [], Image.new("L", (RES, RES), 0)
    d = ImageDraw.Draw(im)
    for part, isl in model.islands():
        if part.name not in names:
            names.append(part.name)
        k = names.index(part.name) + 1
        uv = isl.px / model.tex * RES
        for tri in isl.t:
            d.polygon([tuple(uv[i]) for i in tri], fill=k)
    im.save(os.path.join(HERE, "gauntlet_parts", f"{gid}.png"))
    out["parts"][gid] = names

with open(os.path.join(HERE, "gauntlet_bind.json"), "w") as fh:
    json.dump(out, fh, indent=1)
print("wrote gauntlet_bind.json and gauntlet_parts/")
