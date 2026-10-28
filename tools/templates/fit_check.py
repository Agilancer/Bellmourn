"""Report how high each frame of a rig reaches on screen. Nothing may go above the top edge.

    python tools/templates/fit_check.py r1h_swing r1h_walk
"""
import itertools
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import anims  # noqa: E402
import fp_rig as R  # noqa: E402


def points(arm):
    """Every 3D point the guide draws for one arm: fist corners and the weapon proxy."""
    g, d, a, k = arm["G"], arm["D"], arm["A"], arm["K"]
    centre = g - a * (R.FIST[0] * 0.55) + k * (R.FIST[2] * 0.35)
    out = [centre + a * sa * R.FIST[0] + d * sd * R.FIST[1] + k * sk * R.FIST[2]
           for sa, sd, sk in itertools.product((1, -1), repeat=3)]
    if arm["weapon"]:
        p = R.PROXY[arm["weapon"]]
        out += [g + d * p[j] for j in ("pommel", "guard", "tip")]
    if arm["shield"]:
        out += R.shield_ring(arm)[1]
    return out


def check(name):
    bad = 0
    for i, f in enumerate(anims.ANIMS[name]["frames"]):
        R.set_view(f.get("view", R.REST_SCALE))
        raw = [q for side in ("R", "L") if side in f for q in points(R.pose_arm(side, f[side]))]
        behind = sum(q[2] <= R.NEAR for q in raw)  # these smear off the screen when drawn
        pts = [R.project(q) for q in raw if q[2] > R.NEAR]
        top = min(p[1] for p in pts)
        left, right = min(p[0] for p in pts), max(p[0] for p in pts)
        flag = ("  <-- OFF TOP" if top < 0 else "") + ("  <-- BEHIND CAMERA" if behind else "")
        bad += int(top < 0 or behind > 0)
        print(f"{name} {i:02d} {f['name']:<10} top {top:7.1f}  x {left:6.1f}..{right:6.1f}{flag}")
    return bad


if __name__ == "__main__":
    sys.exit(sum(check(n) for n in sys.argv[1:] or anims.ANIMS))
