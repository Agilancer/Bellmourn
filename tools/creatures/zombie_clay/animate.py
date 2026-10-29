"""Render every animation frame from D1-D5 in parallel and lay out review sheets.

    python animate.py <root> <outdir> [anim ...]
Writes <outdir>/<anim>/D<d>_F<f>.png + frames.json (anchors) and <outdir>/sheet_<anim>.png
(rows = directions, columns = frames, all on one ground line, 3x).
"""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw

import anims as A
import render_rig as RR

ROOT, OUT = sys.argv[1], sys.argv[2]
BIG = (-1.35, 1.35, -0.05, 1.9)


def job(t):
    anim, f, d = t
    pose = A.ANIMS[anim][0][f]
    img, anc = RR.frame(pose, d, ROOT, BIG if anim in A.WIDE else RR.BOUNDS,
                        ss=int(os.environ.get("SS", "4")))
    return anim, f, d, img, anc


def sheet(anim, items, k=3):
    bg = (34, 32, 40, 255)
    left = max(a[0] for *_, i, a in items) + 3
    right = max(i.shape[1] - a[0] for *_, i, a in items) + 3
    up = max(a[1] for *_, i, a in items) + 3
    down = max(i.shape[0] - a[1] for *_, i, a in items) + 3
    cw, ch = int(left + right), int(up + down)
    frames = sorted({f for _, f, *_ in items})
    im = Image.new("RGBA", (cw * len(frames) + 22, ch * 5 + 12), bg)
    d = ImageDraw.Draw(im)
    for _, f, dd, img, a in items:
        x0, y0 = 22 + frames.index(f) * cw, 12 + (dd - 1) * ch
        d.line([(x0, y0 + int(up)), (x0 + cw, y0 + int(up))], fill=(0, 110, 110))
        d.line([(x0 + cw - 1, y0), (x0 + cw - 1, y0 + ch)], fill=(60, 60, 70))
        im.alpha_composite(Image.fromarray(img), (int(x0 + left - a[0]), int(y0 + up - a[1])))
    for dd in range(1, 6):
        d.text((2, 12 + (dd - 1) * ch + 4), f"D{dd}", fill=(240, 220, 170))
    for f in frames:
        d.text((22 + f * cw + 3, 0), f"F{f + 1}", fill=(240, 220, 170))
    im.resize((im.width * k, im.height * k), Image.NEAREST).convert("RGB").save(
        os.path.join(OUT, f"sheet_{anim}.png"))


if __name__ == "__main__":
    names = sys.argv[3:] or list(A.ANIMS)
    tasks = [(a, f, d) for a in names for f in range(4) for d in range(1, 6)]
    with Pool(15) as p:
        res = p.map(job, tasks, chunksize=1)
    meta = {}
    path = os.path.join(OUT, "frames.json")
    if os.path.isfile(path):
        meta = json.load(open(path))
    for a in names:
        os.makedirs(os.path.join(OUT, a), exist_ok=True)
        items = [r for r in res if r[0] == a]
        meta[a] = []
        for _, f, d, img, anc in items:
            Image.fromarray(img).save(os.path.join(OUT, a, f"D{d}_F{f}.png"))
            meta[a].append(dict(dir=d, frame=f, file=f"D{d}_F{f}.png",
                                ax=float(anc[0]), ay=float(anc[1])))
        sheet(a, items)
    json.dump(meta, open(path, "w"), indent=1)
    print("rendered", len(tasks), "frames")
