"""Cut the stained glass windows out of their sheets and pack them into one atlas.

    python tools/world/import_windows.py

Reads art/stained_glass/{rose,arched,lancet}_windows.jpg: sheets of windows painted on a
checkerboard "transparent" background. The background is found by flooding in from the sheet's
edges over light, grey pixels (the dark lead frame round every window stops it); every other
connected shape is a window. Each is cropped, its outside made transparent (with its fringe
trimmed), scaled, and packed into assets/textures/stained_glass/atlas.png. The windows'
places in the atlas, their shape and their average glass colour go to
assets/textures/stained_glass.json (read by src/fps/glass.js).
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, "art", "stained_glass")
OUT = os.path.join(ROOT, "assets", "textures", "stained_glass")
SHEETS = [("rose", "rose_windows.jpg", 384), ("arched", "arched_windows.jpg", 384), ("lancet", "lancet_windows.jpg", 520)]
ATLAS_W, PAD = 2048, 4


def windows(img):
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    spread = a.max(2) - a.min(2)
    light = (spread < 30) & (a.min(2) > 160)
    lab, n = ndimage.label(light)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    background = np.isin(lab, list(edge))
    fg = ndimage.binary_fill_holes(~background)
    fg = ndimage.binary_opening(fg, iterations=2)
    lab, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > fg.size * 0.004]
    out = []
    for k in keep:
        ys, xs = np.nonzero(lab == k)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        mask = ndimage.binary_erosion(lab[y0:y1, x0:x1] == k, iterations=2) # trim the checker fringe
        out.append(((y0 + y1) / 2, (x0 + x1) / 2, a[y0:y1, x0:x1].astype(np.uint8), mask))
    # reading order: rows (by centre height, allowing for uneven rows), then left to right
    out.sort(key=lambda w: w[0])
    rows, cur = [], [out[0]]
    for w in out[1:]:
        if abs(w[0] - cur[-1][0]) < 60:
            cur.append(w)
        else:
            rows.append(cur)
            cur = [w]
    rows.append(cur)
    return [w for row in rows for w in sorted(row, key=lambda w: w[1])]


def main():
    os.makedirs(OUT, exist_ok=True)
    tiles = []
    for kind, fname, target in SHEETS:
        found = windows(Image.open(os.path.join(SRC, fname)))
        print(f"{kind:7} {len(found)} windows")
        for i, (_, _, rgb, mask) in enumerate(found):
            h, w = mask.shape
            s = target / max(h, w) if kind == "rose" else target / h
            size = (max(8, round(w * s)), max(8, round(h * s)))
            rgba = np.dstack([rgb, (mask * 255).astype(np.uint8)])
            im = Image.fromarray(rgba, "RGBA").resize(size, Image.LANCZOS)
            arr = np.asarray(im).copy()
            arr[..., 3] = np.where(arr[..., 3] > 127, 255, 0)
            glass = arr[arr[..., 3] > 0][:, :3].astype(np.float32)
            bright = glass[glass.max(1) > 70] if (glass.max(1) > 70).any() else glass  # the glass, not the lead
            tiles.append(dict(id=f"{kind}_{i + 1:02d}", kind=kind, img=Image.fromarray(arr, "RGBA"),
                              color=[round(float(c)) for c in bright.mean(0)]))
    # shelf packing, tallest first
    order = sorted(tiles, key=lambda t: -t["img"].size[1])
    x = y = shelf = 0
    for t in order:
        w, h = t["img"].size
        if x + w + PAD * 2 > ATLAS_W:
            x, y, shelf = 0, y + shelf, 0
        t["at"] = (x + PAD, y + PAD)
        x += w + PAD * 2
        shelf = max(shelf, h + PAD * 2)
    H = -(-(y + shelf) // 64) * 64
    atlas = Image.new("RGBA", (ATLAS_W, H), (0, 0, 0, 0))
    for t in tiles:
        atlas.paste(t["img"], t["at"])
    # 256 colours keep every pane's colour (the glass is flat-coloured pixel art) at a fraction
    # of the size
    atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(os.path.join(OUT, "atlas.png"), optimize=True)
    meta = []
    for t in tiles:
        (px, py), (w, h) = t["at"], t["img"].size
        meta.append(dict(id=t["id"], kind=t["kind"], size=[w, h], aspect=round(w / h, 4), color=t["color"],
                         rect=[px / ATLAS_W, 1 - (py + h) / H, (px + w) / ATLAS_W, 1 - py / H]))  # u0 v0 u1 v1, v up
    with open(os.path.join(ROOT, "assets", "textures", "stained_glass.json"), "w") as f:
        json.dump(dict(atlas="stained_glass/atlas.png", size=[ATLAS_W, H], windows=meta), f, indent=1)
    print(f"atlas {ATLAS_W}x{H}, {len(meta)} windows")


if __name__ == "__main__":
    main()
