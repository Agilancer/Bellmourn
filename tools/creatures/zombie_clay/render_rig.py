"""Render posed, turned frames of the rigged clay zombie.

    python render_rig.py <root> fit           fit the shade thresholds on the approved idle D1
    python render_rig.py <root> turn          rest pose from D1-D5 -> turn.png
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

import clay
import zclay as Z5
import zrig

DIR_YAW = {1: 0.0, 2: -45.0, 3: -90.0, 4: -135.0, 5: 180.0}
BOUNDS = (-0.95, 0.95, -0.05, 1.9)
HERE = os.path.dirname(os.path.abspath(__file__))
TH_PATH = os.path.join(HERE, "rig_thresholds.json")


def render(pose, d, bounds=BOUNDS, ss=4):
    f, joints = zrig.field(pose)
    sc = clay.Scene(f, yaw=DIR_YAW[d])
    res = sc.render(*bounds, ss=ss)
    value = clay.shade(res, sc.light, sc.fill)
    value = value * (0.9 + 0.16 * clay.fbm(res["P"], 22, 31))
    V, M, cov = clay.downsample(res, value, res["mat"])
    ax, ay = clay.project(sc, res, np.zeros(3))[0]
    return V, M, cov, (ax, ay)


def fit(V, M, cov):
    th = {}
    for m in Z5.RAMPS:
        sel = (M == m) & (cov >= 0.5)
        L = len(Z5.RAMPS[m])
        if sel.sum() > 40:
            c = Z5.CENTRE.get(m, 0.5)
            w = np.exp(-0.5 * ((np.arange(L) - (L - 1) * c) / (L * 0.30)) ** 2)
            th[m] = [float(q) for q in np.quantile(V[sel], np.cumsum(w / w.sum())[:-1])]
        elif sel.any():
            th[m] = [float(t) for t in np.linspace(V[sel].min(), V[sel].max() + 1e-6, L + 1)[1:-1]]
    return th


def colour(V, M, cov, th, ramps):
    img = np.zeros(V.shape + (4,), np.uint8)
    for m, ramp in Z5.RAMPS.items():
        sel = (M == m) & (cov >= 0.5)
        if not sel.any():
            continue
        cols = np.array([ramps[r][s] for r, s in ramp])
        t = th.get(str(m), th.get(m))
        if t is None:
            t = list(np.linspace(0.1, 0.9, len(cols) - 1))
        img[sel, :3] = cols[np.searchsorted(np.array(t), V[sel])]
        img[sel, 3] = 255
    # no orphan pixels: keep the body and anything touching it
    lab, n = ndimage.label(img[..., 3] > 0, structure=np.ones((3, 3)))
    if n > 1:
        sizes = ndimage.sum(img[..., 3] > 0, lab, range(1, n + 1))
        img[(lab > 0) & (lab != 1 + int(np.argmax(sizes)))] = 0
    return img


def trim(img, anchor):
    ys, xs = np.nonzero(img[..., 3])
    y0, x0 = ys.min(), xs.min()
    return img[y0:ys.max() + 1, x0:xs.max() + 1], (anchor[0] - x0, anchor[1] - y0)


def frame(pose, d, root, bounds=BOUNDS, ss=4):
    ramps, _ = clay.load_palette(root)
    th = json.load(open(TH_PATH))
    V, M, cov, anc = render(pose, d, bounds, ss)
    return trim(colour(V, M, cov, th, ramps), anc)


if __name__ == "__main__":
    root, cmd = sys.argv[1], sys.argv[2]
    if cmd == "fit":
        V, M, cov, anc = render(None, 1, (-0.6, 0.6, -0.03, 1.85))
        th = fit(V, M, cov)
        json.dump({str(k): t for k, t in th.items()}, open(TH_PATH, "w"), indent=1)
        ramps, _ = clay.load_palette(root)
        Image.fromarray(colour(V, M, cov, json.load(open(TH_PATH)), ramps)).save("rig_rest_D1.png")
        print("fitted", len(th), "materials")
