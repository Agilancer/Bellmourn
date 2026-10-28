"""The first-person arm: skeleton, bind-pose geometry and posing from the 2D rigs.

Bind pose (rig space, right arm): wrist at the origin, the arm straight back along -z
(elbow at z=-0.30, shoulder at z=-0.60), every bone unrotated. In the hand's frame +z runs
toward the fingers (A), +y along the handle (D) and +x is the back of the hand (K), so the
fist closes around a handle on the y axis through the grip point G = (0, 0, 0.06).
The left arm is the exact mirror (x -> -x).

Fingers are posed once, closed around a 16 mm grip; each finger has three bones so other
poses can be added later. `item` is a socket the rig animates directly: weapons, wands and
shields are modelled around its origin (G) and attach there.
"""
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "templates"))

import fp_rig as R  # noqa: E402
from geom import Model, Part, extrude, loft, norm, rounded_rect, circle  # noqa: E402

HAND = R.HAND  # wrist -> grip point (0.06 m)
GRIP_R = 0.016  # handle radius the fingers close around
FINGERS = ("index", "middle", "ring", "pinky")
FINGER_Y = dict(index=0.0255, middle=0.0085, ring=-0.0085, pinky=-0.0255)
SKIN, SLEEVE = (206, 154, 122), (122, 32, 36)


def finger_joints(name):
    """Bind-space joint points (knuckle, middle, end, tip) of a finger curled round the grip:
    they lie on a circle around the handle axis, going over the top and back underneath."""
    if name == "thumb":
        return [np.array(p) for p in ((-0.006, 0.030, 0.010), (-0.024, 0.040, 0.034),
                                      (-0.036, 0.037, 0.058), (-0.033, 0.031, 0.079))]
    r, angs = (0.025, (55, 135, 205, 255)) if name == "pinky" else (0.027, (50, 130, 200, 250))
    y = FINGER_Y[name]
    return [np.array([r * math.cos(math.radians(a)), y, HAND + r * math.sin(math.radians(a))])
            for a in angs]


def finger_width(name):
    return dict(thumb=0.018, index=0.0158, middle=0.0164, ring=0.0156, pinky=0.0138)[name]


def bones(side="R"):
    """[(name, parent, bind origin)] in rig space; all bind rotations are identity."""
    sx = 1 if side == "R" else -1
    out = [("upper", None, np.array([0, 0, -0.60])),
           ("fore", None, np.array([0, 0, -0.30])),
           ("hand", None, np.zeros(3)),
           ("item", None, np.array([0, 0, HAND]))]
    for f in FINGERS + ("thumb",):
        j = finger_joints(f)
        for k in range(3):
            p = j[k].copy()
            p[0] *= sx
            out.append((f"{f}{k + 1}", "hand", p))
    return out


def mat(origin, x, y, z):
    m = np.eye(4)
    m[:3, 0], m[:3, 1], m[:3, 2], m[:3, 3] = x, y, z, origin
    return m


def _frame(z, x_hint):
    z = norm(z)
    x = norm(np.asarray(x_hint, float) - z * np.dot(x_hint, z))
    return x, np.cross(z, x), z


def pose(arm):
    """World (rig-space) matrices of the animated bones for one posed arm from fp_rig."""
    h_y = norm(arm.get("H", arm["D"]))
    h_z = norm(arm["A"] - h_y * np.dot(arm["A"], h_y))
    h_x = np.cross(h_y, h_z)  # == K for the right hand, -K for the (mirrored) left hand
    out = dict(hand=mat(arm["W"], h_x, h_y, h_z))
    fx, fy, fz = _frame(arm["W"] - arm["E"], h_x)
    out["fore"] = mat(arm["E"], fx, fy, fz)
    ux, uy, uz = _frame(arm["E"] - arm["S"], fx)
    out["upper"] = mat(arm["S"], ux, uy, uz)
    iy = norm(arm["D"])
    aim = arm["face"] if arm.get("face") is not None else arm["A"]
    iz = norm(aim - iy * np.dot(aim, iy))
    out["item"] = mat(arm["G"], np.cross(iy, iz), iy, iz)
    return out


def world_mats(arm, side):
    """Every bone's world matrix for a posed arm (fingers follow the hand)."""
    m = pose(arm)
    bind = {n: o for n, _, o in bones(side)}
    for n, parent, o in bones(side):
        if parent == "hand":
            local = np.eye(4)
            local[:3, 3] = o - bind["hand"]
            m[n] = m["hand"] @ local
    return m


# ----------------------------------------------------------------- the bare arm


def segment(name, a, b, width, thick, up=(0, 1, 0), extend=0.003, cap_end=False, taper=0.9):
    """One finger/thumb segment: a rounded box swept from joint a to joint b."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = norm(b - a)
    path = [a - d * extend, b + d * extend]
    secs = [rounded_rect(thick, width), rounded_rect(thick * taper, width * taper)]
    return loft(name, path, secs, up=up, caps=(False, cap_end))


def hand_parts(color=SKIN, scale=1.0):
    """Palm, four fingers and a thumb (right hand, bind space). `scale` thickens everything
    (gauntlets wrap a little outside the bare hand)."""
    parts = []
    palm = [(-0.020, 0.000), (0.020, 0.000), (0.027, 0.055), (0.023, 0.080), (0.010, 0.088),
            (0.010, 0.046), (-0.013, 0.040)]
    palm = [(x * scale, z) for x, z in palm]
    parts.append(Part("palm", "hand", color, extrude(
        "palm", palm, (0, 0, 0), (1, 0, 0), (0, 0, 1), 0.068 * scale), label="palm", weight=2.2))
    for f in FINGERS + ("thumb",):
        j = finger_joints(f)
        w = finger_width(f) * scale
        for k in range(3):
            parts.append(Part(f"{f} {k + 1}", f"{f}{k + 1}", color,
                              segment(f"{f} {k + 1}", j[k], j[k + 1], w, w * 0.88,
                                      cap_end=(k == 2)), weight=2.2))
    return parts


def bare_arm(side="R"):
    parts = [
        Part("upper arm", "upper", SLEEVE, loft(
            "upper arm", [(0, 0, -0.60), (0, 0, -0.30)],
            [circle(0.050, 8, 0.046), circle(0.045, 8, 0.041)], caps=(False, False)),
             weight=0.3),
        Part("forearm", "fore", SKIN, loft(
            "forearm", [(0, 0, -0.30), (0, 0, -0.15), (0, 0, -0.004)],
            [circle(0.042, 8, 0.038), circle(0.039, 8, 0.035), circle(0.031, 8, 0.027)]),
             weight=0.8),
    ] + hand_parts()
    model = Model(f"arm_bare_{side}", parts, tex=128)
    return mirrored(model) if side == "L" else model


def mirrored(model):
    """The left-hand version of a right-hand model (x -> -x, winding reversed)."""
    flip = np.diag([-1.0, 1.0, 1.0, 1.0])
    for part in model.parts:
        new = []
        for isl in part.islands:
            m = isl.transformed(flip)
            m.t = m.t[:, ::-1].copy()
            new.append(m)
        part.islands = new
    model.name = model.name.replace("_R", "_L")
    return model


def posed_triangles(model, mats, side):
    """Camera-space triangles and colours of a model posed by bone matrices."""
    bind = {n: o for n, _, o in bones(side)}
    tris, cols = [], []
    for part in model.parts:
        m = mats[part.bone]
        o = bind[part.bone]
        for isl in part.islands:
            v = (isl.v - o) @ m[:3, :3].T + m[:3, 3]
            for t in isl.t:
                tris.append(v[t])
                cols.append(part.color)
    return tris, cols
