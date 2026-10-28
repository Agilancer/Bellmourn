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


def smearable(arm):
    """Points of the filled blade/head and shield shapes. If one of these falls behind the
    camera the shape smears across the screen; fists, arms and shafts just clip cleanly (a
    spear's rear hand at the hip passes beside the camera)."""
    out = []
    if arm["weapon"]:
        p = R.PROXY[arm["weapon"]]
        out += [arm["G"] + arm["D"] * p[j] for j in ("guard", "tip")]
    if arm["shield"]:
        out += R.shield_ring(arm)[1]
    return out


def points(arm):
    """Every 3D point the guide draws for one arm: fist corners and the weapon proxy."""
    g, d, a, k, h = arm["G"], arm["D"], arm["A"], arm["K"], arm.get("H", arm["D"])
    centre = g - a * (R.FIST[0] * 0.55) + k * (R.FIST[2] * 0.35)
    out = [centre + a * sa * R.FIST[0] + h * sd * R.FIST[1] + k * sk * R.FIST[2]
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
        arms = R.pose_frame(f)
        raw = [q for arm in arms for q in points(arm)]
        # a support fist pulled off the two-handed grip because it can't reach, in metres
        slip = max([arm["reach_miss"] for arm in arms if arm.get("support")] or [0])
        behind = sum(q[2] <= R.NEAR for arm in arms for q in smearable(arm))
        pts = [R.project(q) for q in raw if q[2] > R.NEAR]
        top = min(p[1] for p in pts)
        left, right = min(p[0] for p in pts), max(p[0] for p in pts)
        flag = ("  <-- OFF TOP" if top < 0 else "") + ("  <-- BEHIND CAMERA" if behind else "")
        flag += f"  <-- HAND SLIPS {slip * 100:.1f} cm (out of reach)" if slip > 0.01 else ""
        bad += int(top < 0 or behind > 0 or slip > 0.01)
        print(f"{name} {i:02d} {f['name']:<10} top {top:7.1f}  x {left:6.1f}..{right:6.1f}{flag}")
    return bad


if __name__ == "__main__":
    sys.exit(sum(check(n) for n in sys.argv[1:] or anims.ANIMS))
