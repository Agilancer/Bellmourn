"""Cut the V-and-circle of Lord Velscour out of its square tile (art/velscour/sigil_512.png).

    python tools/velscour/cut_sigil.py
Keeps the medallion (everything inside the ring's outer edge: the ring, the V, the gem and the
fire behind them) and, outside it, the points: the grey and bone pixels of the spikes and the
V's dark tail, never the saturated red fire of the square's background or its frame. Writes
art/velscour/sigil_cut.png (RGBA, the cut-out squared up round its own bounds).
"""
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "art", "velscour", "sigil_512.png")
DST = os.path.join(ROOT, "art", "velscour", "sigil_cut.png")
CX, CY, RING = 257, 246, 207  # the ring's centre and outer edge (px)
REACH = 252                   # the points' tips


def main():
    im = np.asarray(Image.open(SRC).convert("RGB"), float)
    H, W, _ = im.shape
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.hypot(xx - CX, yy - CY)
    mx, mn = im.max(-1), im.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    lum = im @ np.array([0.3, 0.59, 0.11])
    frame = (xx < 22) | (xx > W - 23) | (yy < 22) | (yy > H - 23)
    points = (r < REACH) & (sat < 0.5) & (lum > 22) & ~frame
    m = Image.fromarray(((r <= RING) | points).astype(np.uint8) * 255)
    m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))  # specks off
    # keep only what joins the medallion
    a = np.asarray(m) > 127
    keep = np.zeros_like(a)
    keep[(r <= RING)] = True
    for _ in range(80):
        grow = keep.copy()
        grow[1:] |= keep[:-1]
        grow[:-1] |= keep[1:]
        grow[:, 1:] |= keep[:, :-1]
        grow[:, :-1] |= keep[:, 1:]
        grow &= a
        if (grow == keep).all():
            break
        keep = grow
    alpha = (keep * 255).astype(np.uint8)
    rgba = np.dstack([im.astype(np.uint8), alpha])
    ys, xs = np.nonzero(keep)
    half = max(CX - xs.min(), xs.max() - CX, CY - ys.min(), ys.max() - CY) + 2
    box = (CX - half, CY - half, CX + half, CY + half)
    out = Image.fromarray(rgba, "RGBA").crop(box)
    out.save(DST)
    print("wrote", DST, out.size)


if __name__ == "__main__":
    main()
