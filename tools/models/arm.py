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
           ("elbow", None, np.array([0, 0, -0.30])),
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
    # elbow helper: halfway between the upper arm and the forearm, its +x (-x on the mirrored
    # left arm) toward the outside of the bend, where the elbow point sticks out. That
    # direction is the IK pole across the shoulder-wrist line, defined even for a straight arm
    sw = norm(arm["W"] - arm["S"])
    pole = np.asarray(arm.get("pole", (1.0, -0.6, -0.1)), float)
    out_dir = norm(pole - sw * np.dot(pole, sw)) * (1 if arm["side"] == "R" else -1)
    ex, ey, ez = _frame(uz + fz, out_dir)
    out["elbow"] = mat(arm["E"], ex, ey, ez)
    # item socket: +y along the handle/blade, +z toward the knuckles (weapons) or out of the
    # shield's face. Blades are modelled flat across x, which is what faces the camera.
    iy = norm(arm["D"])
    if arm.get("shield"):
        # shields ride on the fist: the grip bar runs along the hand's grip axis, so the board
        # turns with the hand however the arm moves. The face points along +z of the socket,
        # which the block poses aim at the enemy; the board sits in front of the knuckles.
        iz = norm(arm["face"])
        if arm["shield"] == "kite":
            iy = norm(np.array([0.0, 1.0, 0.0]) - iz * iz[1])  # upright, like the 2D rig
        else:
            iy = norm(h_y - iz * np.dot(h_y, iz))
    else:
        aim = arm["A"]
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
    # (the wrist itself is the end of the forearm skin: see forearm_skin)
    for f in FINGERS + ("thumb",):
        j = finger_joints(f)
        w = finger_width(f) * scale
        for k in range(3):
            parts.append(Part(f"{f} {k + 1}", f"{f}{k + 1}", color,
                              segment(f"{f} {k + 1}", j[k], j[k + 1], w, w * 0.88,
                                      cap_end=(k == 2)), weight=2.2))
    return parts


def _ellipsoid(name, bone, color, c, rx, ry, rz, n=8, rings=6, **kw):
    hs = [-rz * math.cos(math.pi * k / rings) for k in range(rings + 1)]
    secs = [circle(max(ry * math.sin(math.pi * k / rings), 1e-4), n,
                   max(rx * math.sin(math.pi * k / rings), 1e-4)) for k in range(rings + 1)]
    return Part(name, bone, color, loft(name, [(c[0], c[1], c[2] + h) for h in hs], secs,
                                        caps=(True, True)), **kw)


# The wrist bends over this band of bind z: behind it the skin rides the forearm, in front of
# it the hand; in between it blends, so the wrist bends like skin instead of hinging.
WRIST_BLEND = (-0.04, 0.010)
# forearm skin cross-sections: (z, x radius, y radius, x centre). The last rings narrow a
# little at the wrist, then fill out into the base of the palm (x -0.020..0.027).
FOREARM = [(-0.275, 0.038, 0.042, 0.0), (-0.24, 0.040, 0.045, 0.0), (-0.15, 0.034, 0.039, 0.0),
           (-0.07, 0.029, 0.033, 0.0), (-0.04, 0.027, 0.031, 0.0), (-0.02, 0.025, 0.030, 0.001),
           (-0.005, 0.0245, 0.031, 0.002), (0.008, 0.0235, 0.0325, 0.0030),
           (0.018, 0.022, 0.032, 0.0035)]


def forearm_skin(name, color, z_start=-0.275, pad=0.0, n=12, weight=0.8):
    """The forearm as one surface running on through the wrist into the palm, skinned across
    the wrist (WRIST_BLEND) so it bends smoothly with the hand. `z_start` > -0.275 gives just
    the wrist end (a glove's wrist under a bracer); `pad` makes it fuller."""
    rings = [r for r in FOREARM if r[0] >= z_start - 1e-9]
    if rings[0][0] > z_start + 1e-9:  # start part-way down the forearm
        lo = max(r for r in FOREARM if r[0] < z_start)
        hi = rings[0]
        t = (z_start - lo[0]) / (hi[0] - lo[0])
        rings.insert(0, tuple([z_start] + [lo[i] + (hi[i] - lo[i]) * t for i in (1, 2, 3)]))
    secs = [[(cx + (rx + pad) * math.cos(2 * math.pi * k / n),
              (ry + pad) * math.sin(2 * math.pi * k / n)) for k in range(n)]
            for z, rx, ry, cx in rings]
    return Part(name, "fore", color, loft(name, [(0, 0, z) for z, *_ in rings], secs,
                                          caps=(True, True)),
                weight=weight, v_label="toward hand", blend=("hand",) + WRIST_BLEND)


def elbow_parts(sleeve=SLEEVE, cuff_color=SLEEVE, scale=1.0):
    """The elbow, riding on the elbow helper bone (bind space, elbow at z=-0.30, +x = the
    outside of the bend). The joint keeps the arm's own thickness so the outline runs on
    smoothly through the bend; what makes it read as an elbow is the point (olecranon), a
    rounded wedge on the outside of the bend, and the two knobs at the ends of the hinge
    (epicondyles). A rolled sleeve cuff sits just below the joint."""
    zc = -0.30
    hs = (-0.045, -0.03, -0.012, 0.006, 0.024, 0.04)
    secs = []
    for h in hs:
        k = math.sqrt(max(1 - (h / 0.05) ** 2, 0.2))
        secs.append(circle(0.046 * k * scale, 10, 0.040 * k * scale))
    joint = Part("elbow", "elbow", sleeve, loft(
        "elbow", [(0, 0, zc + h) for h in hs], secs, caps=(True, True)), weight=0.6,
        v_label="toward hand")
    # the elbow point: a wedge narrowing outward from the back of the joint to a blunt tip
    pts = [(0.016, zc + 0.006), (0.036, zc + 0.003), (0.054, zc - 0.002)]
    psec = [rounded_rect(0.042 * scale, 0.036 * scale), rounded_rect(0.027 * scale, 0.025 * scale),
            rounded_rect(0.011 * scale, 0.012 * scale)]
    point = Part("elbow point", "elbow", sleeve, loft(
        "elbow point", [(x * scale, 0, z) for x, z in pts], psec, up=(0, 1, 0),
        caps=(True, True)), weight=0.6)
    knobs = [_ellipsoid(f"elbow knob {s}", "elbow", sleeve, (0.008 * scale, s * 0.037 * scale,
                                                             zc - 0.006),
                        0.010 * scale, 0.008 * scale, 0.014 * scale, weight=0.4)
             for s in (1, -1)]
    knobs[0].name, knobs[1].name = "elbow knob top", "elbow knob bottom"
    cuff = Part("sleeve cuff", "fore", cuff_color, loft(
        "sleeve cuff", [(0, 0, -0.27), (0, 0, -0.245), (0, 0, -0.225)],
        [circle(0.047 * scale, 10, 0.043 * scale), circle(0.049 * scale, 10, 0.045 * scale),
         circle(0.046 * scale, 10, 0.042 * scale)], caps=(True, True)), weight=0.6)
    return [joint, point] + knobs + [cuff]


def bare_arm(side="R"):
    parts = [
        Part("upper arm", "upper", SLEEVE, loft(
            "upper arm", [(0, 0, -0.60), (0, 0, -0.42), (0, 0, -0.30)],
            [circle(0.052, 10, 0.048), circle(0.048, 10, 0.044), circle(0.043, 10, 0.038)],
            caps=(False, True)), weight=0.3, v_label="toward elbow"),
    ] + elbow_parts(SLEEVE, SLEEVE) + [
        forearm_skin("forearm", SKIN),
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
        for isl in part.islands:
            b0, b1, w = part.skin(isl)
            m0, m1 = mats[b0], mats[b1]
            v0 = (isl.v - bind[b0]) @ m0[:3, :3].T + m0[:3, 3]
            v1 = (isl.v - bind[b1]) @ m1[:3, :3].T + m1[:3, 3]
            v = v0 * (1 - w)[:, None] + v1 * w[:, None]
            for t in isl.t:
                tris.append(v[t])
                cols.append(part.color)
    return tris, cols
