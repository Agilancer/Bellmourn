"""Texture prep for a beast man (system Python: numpy, scipy, PIL).

  BEAST=goat python -I prep_beast.py <sheet.png> <out_dir>

prep_tex.py's maps (bled colour, normal, ORM, height, island mask, blurred colour), plus
beast_profiles.npz: for every strip-mapped island in uvmap's layout, its centre and half width per
row (smoothed, so ragged painted edges and fingers cannot make it jump).
"""
import os
import sys

import numpy as np
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import prep_tex  # noqa: E402
import uvmap  # noqa: E402


def profile(lab, seed, axis, smooth=15):
    k = lab == lab[seed[1], seed[0]]
    if axis == 1:
        k = k.T
    rows = np.where(k.any(1))[0]
    r0, r1 = rows.min(), rows.max() + 1
    c = np.full(r1 - r0, np.nan); h = np.full(r1 - r0, np.nan)
    for i, r in enumerate(range(r0, r1)):
        xs = np.where(k[r])[0]
        if len(xs):
            c[i] = (xs.min() + xs.max()) / 2; h[i] = (xs.max() - xs.min()) / 2
    idx = np.arange(len(c)); ok = ~np.isnan(c)
    c = np.interp(idx, idx[ok], c[ok]); h = np.interp(idx, idx[ok], h[ok])
    ker = np.ones(smooth) / smooth
    c = np.convolve(np.pad(c, smooth // 2, mode="edge"), ker, "valid")
    h = np.convolve(np.pad(h, smooth // 2, mode="edge"), ker, "valid")
    return r0, c, h


def main(src, out):
    prep_tex.main(src, out)
    # islands are told apart on a stricter mask than the texture's (that one keeps dark claws and
    # hoof tips, but lets neighbouring pieces touch)
    from PIL import Image
    lum = np.asarray(Image.open(src).convert("L"), np.float32) / 255.0
    edge = np.concatenate([lum[:4].ravel(), lum[-4:].ravel()])
    lab, _ = ndimage.label(ndimage.binary_opening(lum > np.percentile(edge, 30) + 0.045, iterations=2))
    z = {}
    for name, seed, axis in uvmap.strips():
        assert lab[seed[1], seed[0]], (name, seed)
        r0, c, h = profile(lab, seed, axis)
        z[name + "_r0"] = r0; z[name + "_c"] = c.astype(np.float32); z[name + "_h"] = h.astype(np.float32)
        print("%-8s rows %d-%d  centre %.0f..%.0f  half %.0f..%.0f" % (name, r0, r0 + len(c), c.min(), c.max(), h.min(), h.max()))
    np.savez(os.path.join(out, "beast_profiles.npz"), **z)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
