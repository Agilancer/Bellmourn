"""Build the ten gauntlets: per gauntlet a folder in templates/models/gauntlets/<id>/ with the
right and left arm .glb (every rig animation), texture sheet, mask, placeholder texture,
info.json and PROMPT.md.

    python tools/models/build_gauntlets.py [ids...]
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import assets  # noqa: E402
import export  # noqa: E402
import gauntlets as G  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "templates", "models", "gauntlets")
VIEWS = ((30, 20, "3/4 FRONT"), (210, 20, "3/4 BACK"), (60, 25, "HAND: BACK", "hand"),
         (240, 10, "HAND: PALM", "hand"))


def build_one(gid):
    name, desc = next((n, d) for g, n, _, d in G.GAUNTLETS if g == gid)
    right = G.build(gid, "R")
    right.pack()
    left = G.build(gid, "L")
    for (_, a), (_, b) in zip(right.islands(), left.islands()):  # one shared UV layout
        b.px, b.rot = a.px, a.rot
    left.density = right.density
    folder = os.path.join(OUT, gid)
    return assets.write(
        folder, gid, name, "gauntlet (a first-person arm: sleeve, elbow, bracer and gloved hand)",
        desc, [(right, f"{gid}_R.glb", lambda m, p: export.export_arm_model(m, "R", p)),
               (left, f"{gid}_L.glb", lambda m, p: export.export_arm_model(m, "L", p))],
        right, notes=["One texture serves both the right and the left arm."], angles=VIEWS)


if __name__ == "__main__":
    ids = sys.argv[1:] or [g[0] for g in G.GAUNTLETS]
    for gid in ids:
        info = build_one(gid)
        print(f"{gid:<10} {info['triangles']:>5} tris  {len(info['parts'])} parts")
