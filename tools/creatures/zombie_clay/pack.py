"""Pack rendered clay frames into the game: python pack.py <root> <frames dir> [creature id]

Writes assets/creatures/<id>/ (atlas, creature.json, preview GIFs) and the index, using the
same packer as tools/templates/import_bundle.py. The corpse is the held last death frame.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

import anims as A

ROOT, SRC = sys.argv[1], sys.argv[2]
CID = sys.argv[3] if len(sys.argv) > 3 else "grotesque_zombie_clay"
sys.path.insert(0, os.path.join(ROOT, "tools", "templates"))
import frame_ops as F  # noqa: E402
import import_bundle as IB  # noqa: E402

if os.environ.get("PACK_OUT"):          # dry runs go elsewhere
    IB.IC.OUT = os.environ["PACK_OUT"]

meta = json.load(open(os.path.join(SRC, "frames.json")))
frames, timing = {}, {}
for anim, (poses, tics, events, loop) in A.ANIMS.items():
    frames[anim] = {}
    for m in meta[anim]:
        rgba = np.asarray(Image.open(os.path.join(SRC, anim, m["file"])).convert("RGBA")).copy()
        frames[anim][(m["dir"], m["frame"])] = F.Frame(rgba, m["ax"], m["ay"])
    timing[anim] = dict(frames_per_direction=len(poses), loop=loop, tics=tics, events=events)
frames["corpse"] = {(d, 0): frames["death"][(d, 3)] for d in range(1, 6)}
timing["corpse"] = dict(frames_per_direction=1, loop=False, tics=[0], events={})
layout = dict(id=CID, name="Grotesque Zombie (clay)", tier="enemy", height_m=1.8,
              size_class="M", mirror={"6": 4, "7": 3, "8": 2})
folder, data = IB.build(layout, frames, timing)
n = sum(1 for a in data["anims"].values() for fr in a["frames"] for e in fr["dirs"] if e)
print(f"{CID}: {len(data['anims'])} animations, {n} frame views -> {folder}")
