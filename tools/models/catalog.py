"""Catalog sheets: every model of a kind rendered side by side (part colours, flat shaded),
for review.

    python tools/models/catalog.py gauntlets|items
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import arm as A  # noqa: E402
import anims  # noqa: E402
import fp_rig as R  # noqa: E402
import raster  # noqa: E402
import texkit  # noqa: E402
from geom import norm  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))


def look(eye, target):
    f = norm(np.subtract(target, eye))
    r = norm(np.cross([0, 1, 0], f))
    return np.stack([r, np.cross(f, r), f])


def render(tris, cols, eye, target, size=360, fov=1.0):
    rot = look(eye, target)
    cam = [(t - eye) @ rot.T for t in tris]
    f = size / 2 / math.tan(fov / 2)
    proj = lambda p: (size / 2 + p[0] / p[2] * f, size / 2 - p[1] / p[2] * f)  # noqa: E731
    return raster.zbuffer(cam, cols, proj, size, near=0.01, light=norm([-0.3, 0.8, -0.5]),
                          bg=(44, 40, 50), cull=False)


def gauntlet_sheet(out):
    import gauntlets as G
    frame = anims.ANIMS["r1h_walk"]["frames"][0]
    arm = next(a for a in R.pose_frame(frame) if a["side"] == "R")
    mats = A.world_mats(arm, "R")
    tiles = []
    for gid, name, _, _ in G.GAUNTLETS:
        model = G.build(gid, "R")
        tris, cols = A.posed_triangles(model, mats, "R")
        target = arm["W"] * 0.8 + arm["E"] * 0.2
        eye = target + np.array([0.26, 0.13, -0.14])
        img = render(tris, cols, eye, target, fov=0.9)
        ImageDraw.Draw(img).text((8, 6), name, fill=(240, 220, 170), font=texkit.font(16, True))
        hand = arm["W"] + arm["A"] * 0.045
        close = render(tris, cols, hand + np.array([0.13, 0.09, -0.07]), hand, fov=0.9)
        tiles.append((img, close))
    sheet = Image.new("RGB", (360 * 5, 360 * 4))
    for i, (t, c) in enumerate(tiles):
        sheet.paste(t, ((i % 5) * 360, (i // 5) * 720))
        sheet.paste(c, ((i % 5) * 360, (i // 5) * 720 + 360))
    sheet.save(out)
    return out


def item_sheet(kind, out):
    import items as I
    import props as P
    tiles = []
    for spec in (P.PROPS if kind == "props" else I.ITEMS[kind]):
        model = spec["build"]()
        tris, cols = [], []
        for part, isl in model.islands():
            for t in isl.t:
                tris.append(isl.v[t])
                cols.append(part.color)
        pts = np.concatenate([i.v for _, i in model.islands()])
        c = (pts.max(0) + pts.min(0)) / 2
        r = np.linalg.norm(pts - c, axis=1).max()
        eye = (c + np.array([r * 1.3, r * 0.9, r * 2.0]) if kind == "props"  # props: 3/4 front
               else c + np.array([-r * 2.2, r * 0.5, -r * 1.1]))  # held: the camera's side
        img = render(tris, cols, eye, c, size=300)
        ImageDraw.Draw(img).text((8, 6), spec["name"], fill=(240, 220, 170),
                                 font=texkit.font(14, True))
        tiles.append(img)
        if kind.startswith("shield"):  # the face the enemy sees
            front = render(tris, cols, c + np.array([r * 1.4, r * 0.4, r * 2.2]), c, size=300)
            ImageDraw.Draw(front).text((8, 6), "front", fill=(200, 200, 200),
                                       font=texkit.font(12))
            tiles.append(front)
    cols_n = 5 if not kind.startswith("shield") else 6
    sheet = Image.new("RGB", (300 * cols_n, 300 * ((len(tiles) + cols_n - 1) // cols_n)))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols_n) * 300, (i // cols_n) * 300))
    sheet.save(out)
    return out


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "gauntlets"
    os.makedirs(os.path.join(ROOT, "templates", "models", "catalog"), exist_ok=True)
    if what == "gauntlets":
        print(gauntlet_sheet(os.path.join(ROOT, "templates", "models", "catalog", "gauntlets.png")))
    elif what == "props":
        print(item_sheet("props", os.path.join(ROOT, "templates", "models", "catalog", "props.png")))
    else:
        import items as I
        for kind in I.ITEMS:
            print(item_sheet(kind, os.path.join(ROOT, "templates", "models", "catalog",
                                                f"{kind}.png")))
