"""The foes' clips, keyed onto the 20-bone T-pose rig as Blender actions (30 fps).

Poses use the zombie conventions (tools/creatures/zombie3d/anims.py): bone -> (rx, ry, rz)
degrees about the armature's own axes (X the creature's left, -Y forward, Z up), applied at the
bone's rest head and carried by its parents; `.R` keys mirror `_L` values; `move` offsets the
hips (scaled per body by its hip height). Arms that hold things are posed by direction instead:
`arm_R=dict(up=, fore=, blade=, hand=)` gives where the upper arm and forearm point and where
the held item's +y (blade, haft, staff; a shield's top) points, in armature axes; `solve`
turns that into rotations through the parent chain, splitting the item's roll between the
forearm and the wrist so the elbow doesn't wring.

Clips per kind (all loop unless in ONCE in src/fps/foes.js):
  every kind  idle walk run hit jump fall death dead collapse crawl crawl_attack crawl_death
              crawl_dead getup
  knight      attack1 (diagonal cut) attack2 (overhead chop) attack3 (flat sweep) bash (shield)
              block (shield up, held)
  sorcerer    cast1 (bolt from the left hand) cast2 (staff raised, both hands: a summoning)
              attack1 (staff swing) blink (a crouch into nothing)
  ghast       attack1 (right rake) attack2 (left rake) attack3 (the pounce) shriek
  grubber     attack1 (overhead club smash) attack2 (lunging bite) attack3 (club sideswipe)
HITS gives the frame each blow lands or each spell leaves the hand.
"""
import importlib.util
import math
import os

import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

# the zombie's pose helpers and ground clips (loaded by path: its folder has a paint.py of its own)
_spec = importlib.util.spec_from_file_location(
    "zombie_anims", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "zombie3d", "anims.py"))
Z = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(Z)

FPS = 30
pose, over = Z.pose, Z.over
HITS = {
    "knight": {"attack1": 15, "attack2": 18, "attack3": 13, "bash": 10, "crawl_attack": 13},
    "sorcerer": {"cast1": 15, "cast2": 28, "attack1": 13, "crawl_attack": 13},
    "ghast": {"attack1": 11, "attack2": 11, "attack3": 13, "crawl_attack": 13},
    "grubber": {"attack1": 17, "attack2": 12, "attack3": 13, "crawl_attack": 13},
}


def nv(*v):
    v = np.array(v, float)
    return v / np.linalg.norm(v)


def arm(up, fore, blade=None, hand=None):
    return dict(up=nv(*up), fore=nv(*fore), blade=None if blade is None else nv(*blade), hand=None if hand is None else nv(*hand))


def mirror_arm(a):
    m = np.array([-1, 1, 1])
    return {k: (None if v is None else v * m) for k, v in a.items()}


def P(base=None, **kw):
    """A pose: Euler keys through zombie pose(), arm_L / arm_R direction targets kept aside."""
    ik = {}
    for s in ("L", "R"):
        if f"arm_{s}" in kw:
            ik[s] = kw.pop(f"arm_{s}")
    out = dict(base or {})
    out.update(pose(**kw))
    if ik:
        out["ik"] = {**out.get("ik", {}), **ik}
    return out


def mix(a, b, k):
    """Blend two poses (Euler keys linearly, arm targets by direction)."""
    out = Z.blend({x: y for x, y in a.items() if x != "ik"}, {x: y for x, y in b.items() if x != "ik"}, k)
    ia, ib = a.get("ik", {}), b.get("ik", {})
    if ia or ib:
        ik = {}
        for s in set(ia) | set(ib):
            if s in ia and s in ib:
                ik[s] = {key: (None if ia[s].get(key) is None or ib[s].get(key) is None else nv(*(ia[s][key] * (1 - k) + ib[s][key] * k)))
                         for key in ("up", "fore", "blade", "hand")}
            else:
                ik[s] = ia.get(s) or ib.get(s)
        out["ik"] = ik
    return out


# ------------------------------------------------------------------ solving held arms

def _frame(d, s):
    d = d / np.linalg.norm(d)
    s = s - d * np.dot(s, d)
    s = s / np.linalg.norm(s)
    return np.stack([d, s, np.cross(d, s)], 1)


def _rot(axis, ang):
    return np.array(Matrix.Rotation(ang, 3, Vector(axis)))


def _between(a, b):
    a, b = a / np.linalg.norm(a), b / np.linalg.norm(b)
    c = np.cross(a, b)
    s, cth = np.linalg.norm(c), np.dot(a, b)
    if s < 1e-8:
        return np.eye(3) if cth > 0 else _rot(np.array([0, 0, 1.0]), math.pi)
    return _rot(c / s, math.atan2(s, cth))


def _roll(axis, frm, to):
    f = frm - axis * np.dot(frm, axis)
    t = to - axis * np.dot(to, axis)
    if np.linalg.norm(f) < 1e-6 or np.linalg.norm(t) < 1e-6:
        return 0.0
    f, t = f / np.linalg.norm(f), t / np.linalg.norm(t)
    return math.atan2(np.dot(np.cross(f, t), axis), np.dot(f, t))


def arm_world(side, tgt):
    """World rotations of upper arm, forearm and hand for a direction target."""
    d0 = np.array([1.0 if side == "L" else -1.0, 0, 0])
    f0 = np.array([0, -1.0, 0])                      # rest front: the elbow bends this way; blades point this way
    up, fore = tgt["up"], tgt["fore"]
    fe = fore - up * np.dot(fore, up)
    if np.linalg.norm(fe) < 0.05:                    # a straight arm: keep the front facing forward-ish
        fe = (tgt["blade"] if tgt.get("blade") is not None else f0) - up * np.dot(tgt["blade"] if tgt.get("blade") is not None else f0, up)
        if np.linalg.norm(fe) < 0.05:
            fe = np.array([0, 0, 1.0]) - up * up[2]
    R_up = _frame(up, fe) @ _frame(d0, f0).T
    R_fore = _between(up, fore) @ R_up
    hand = tgt.get("hand")
    if hand is None and tgt.get("blade") is not None:
        # the fist holds its item across the hand: bend the wrist just enough for the blade to
        # point where it should (at most 70 degrees)
        b = tgt["blade"]
        h = fore - b * np.dot(fore, b)
        if np.linalg.norm(h) > 0.2:
            h = h / np.linalg.norm(h)
            ang = math.acos(np.clip(np.dot(fore, h), -1, 1))
            if ang > math.radians(70):
                ax = np.cross(fore, h)
                h = _rot(ax / np.linalg.norm(ax), math.radians(70)) @ fore
            hand = h
    if hand is None:
        hand = fore
    R_hand = _between(fore, hand) @ R_fore
    if tgt.get("blade") is not None:
        cur = R_hand @ f0
        phi = _roll(hand, cur, tgt["blade"])
        R_fore = _rot(fore, phi * 0.55) @ R_fore
        R_hand = _between(fore, hand) @ R_fore
        cur = R_hand @ f0
        R_hand = _rot(hand, _roll(hand, cur, tgt["blade"])) @ R_hand
    return {f"upper_arm.{side}": R_up, f"forearm.{side}": R_fore, f"hand.{side}": R_hand}


def solve(p, order, parent):
    """Local rotation (3x3) per bone for pose p."""
    want = {}
    for s, tgt in p.get("ik", {}).items():
        want.update(arm_world(s, tgt))
    Rw, local = {}, {}
    for bn in order:
        Rp = Rw[parent[bn]] if parent.get(bn) else np.eye(3)
        if bn in want:
            Rl = Rp.T @ want[bn]
        else:
            r = p.get(bn, (0, 0, 0))
            Rl = np.array(Euler([math.radians(a) for a in r], "XYZ").to_matrix())
        Rw[bn] = Rp @ Rl
        local[bn] = Rl
    return local


# ------------------------------------------------------------------ legs and gaits

def legs_walk(stride=1.0, bend=1.0):
    """Four leg keys of a plain walk (contact, pass, contact, pass), left leg first."""
    k = []
    for L, R in (("L", "R"), ("R", "L")):
        k.append({f"thigh_{L}": (-24 * stride, 0, 0), f"shin_{L}": (6 * bend, 0, 0), f"foot_{L}": (-10, 0, 0),
                  f"thigh_{R}": (16 * stride, 0, 0), f"shin_{R}": (22 * bend, 0, 0), f"foot_{R}": (14, 0, 0)})
        k.append({f"thigh_{L}": (-4 * stride, 0, 0), f"shin_{L}": (10 * bend, 0, 0), f"foot_{L}": (-4, 0, 0),
                  f"thigh_{R}": (-14 * stride, 0, 0), f"shin_{R}": (48 * bend, 0, 0), f"foot_{R}": (12, 0, 0)})
    return k


def legs_run(stride=1.0):
    k = []
    for L, R in (("L", "R"), ("R", "L")):
        k.append({f"thigh_{L}": (-44 * stride, 0, 0), f"shin_{L}": (14, 0, 0), f"foot_{L}": (-16, 0, 0),
                  f"thigh_{R}": (26 * stride, 0, 0), f"shin_{R}": (46, 0, 0), f"foot_{R}": (22, 0, 0)})
        k.append({f"thigh_{L}": (-14 * stride, 0, 0), f"shin_{L}": (34, 0, 0), f"foot_{L}": (0, 0, 0),
                  f"thigh_{R}": (-30 * stride, 0, 0), f"shin_{R}": (100, 0, 0), f"foot_{R}": (24, 0, 0)})
    return k


def cycle(base, legs, bob, frames, extra=None):
    """A looping gait: base pose + leg keys, hips bobbing, optional per-key extras."""
    out = []
    n = len(legs)
    for i, lg in enumerate(legs):
        p = P(base, **lg)
        m = list(p.get("move", (0, 0, 0)))
        m[2] += bob[i % len(bob)]
        p["move"] = tuple(m)
        if extra:
            p = extra(i, p)
        out.append((int(frames * i / n), p))
    out.append((frames, out[0][1]))
    return out


# ------------------------------------------------------------------ knights

K_STANCE = P(move=(0, 0, -0.03), spine=(6, 0, -6), chest=(4, 0, -8), neck=(-2, 0, 6), head=(-6, 0, 8),
             shoulder_B=(0, 0, 0), thigh_L=(-16, 0, 0), shin_L=(14, 0, 0), foot_L=(2, 0, 0),
             thigh_R=(12, 0, -4), shin_R=(16, 0, 0), foot_R=(-4, 0, 0),
             arm_R=arm((-0.25, -0.3, -1), (-0.1, -1, 0.45), (0.2, -0.45, 1)),
             arm_L=arm((0.35, -0.3, -1), (-1, -0.3, 0.15), (0, -0.1, 1)))
K_BREATH = P(K_STANCE, move=(0, 0, -0.04), spine=(7, 0, -5), chest=(6, 0, -7),
             arm_R=arm((-0.25, -0.32, -1), (-0.1, -1, 0.4), (0.22, -0.5, 1)))


def k_idle():
    return [(0, K_STANCE), (30, K_BREATH), (60, K_STANCE)]


def k_walk():
    def ex(i, p):
        p = dict(p)
        sw = (1, 0, -1, 0)[i]
        p.update(pose(spine=(6, 0, -6 + 3 * sw), chest=(4, 0, -8 - 2 * sw)))
        return p
    return cycle(K_STANCE, legs_walk(0.9), (-0.01, 0.015, -0.01, 0.015), 36, ex)


K_CHARGE = P(K_STANCE, spine=(18, 0, -4), chest=(8, 0, -6), neck=(-6, 0, 4), head=(-14, 0, 4),
             arm_R=arm((-0.4, 0.1, 0.3), (-0.2, -0.5, 1), (0.2, 0.6, 0.6)),
             arm_L=arm((0.3, -0.6, -1), (-0.8, -0.9, 0.2), (0, -0.2, 1)))


def k_run():
    return cycle(K_CHARGE, legs_run(0.9), (-0.06, 0.03, -0.06, 0.03), 20)


def k_attack1():
    # a diagonal cut: the sword drawn up over the right shoulder, then down and across to the left hip
    wind = P(K_STANCE, move=(0, 0.04, -0.02), spine=(0, 0, -22), chest=(-6, 0, -24), head=(-4, 0, 30),
             arm_R=arm((-0.6, 0.35, 0.6), (-0.15, 0.4, 1), (0.3, 0.9, -0.2)),
             thigh_R=(16, 0, 0), thigh_L=(-22, 0, 0))
    strike = P(K_STANCE, move=(0, -0.1, -0.08), spine=(20, 0, 18), chest=(10, 0, 22), head=(-14, 0, -16),
               arm_R=arm((0.1, -0.9, -0.2), (0.3, -0.9, -0.3), (0.8, 0.0, -0.6)),
               thigh_L=(-36, 0, 0), shin_L=(30, 0, 0), thigh_R=(18, 0, 0))
    follow = P(strike, spine=(24, 0, 24), chest=(12, 0, 28),
               arm_R=arm((0.4, -0.6, -0.6), (0.7, -0.4, -0.6), (0.5, 0.6, -0.6)))
    return [(0, K_STANCE), (9, wind), (15, strike), (20, follow), (32, K_STANCE)]


def k_attack2():
    # an overhead chop, straight down
    lift = P(K_STANCE, move=(0, 0.05, 0.0), spine=(-6, 0, -6), chest=(-10, 0, -6), head=(-2, 0, 4),
             arm_R=arm((-0.2, 0.1, 1), (0.0, 0.5, 1), (0.1, 1, -0.1)),
             thigh_L=(-10, 0, 0), thigh_R=(4, 0, 0))
    chop = P(K_STANCE, move=(0, -0.14, -0.12), spine=(28, 0, 0), chest=(14, 0, -2), head=(-20, 0, 0),
             arm_R=arm((-0.05, -1, -0.15), (0.0, -1, -0.2), (0.05, -0.4, -1)),
             thigh_L=(-40, 0, 0), shin_L=(36, 0, 0), thigh_R=(20, 0, 0), shin_R=(20, 0, 0))
    follow = P(chop, move=(0, -0.15, -0.16), spine=(32, 0, 0), arm_R=arm((-0.05, -0.8, -0.6), (0.05, -0.6, -0.8), (0.05, 0.5, -0.9)))
    return [(0, K_STANCE), (12, lift), (18, chop), (22, follow), (36, K_STANCE)]


def k_attack3():
    # a flat sweep from right to left at the chest, the whole body turning into it
    wind = P(K_STANCE, move=(0, 0.02, -0.04), spine=(4, 0, -34), chest=(2, 0, -26), head=(-4, 0, 44),
             arm_R=arm((-1, 0.4, -0.1), (-0.6, 0.8, 0.1), (-0.3, 0.2, 0.95)))
    sweep = P(K_STANCE, move=(0, -0.06, -0.06), spine=(10, 0, 26), chest=(6, 0, 30), head=(-8, 0, -30),
              arm_R=arm((0.2, -1, -0.05), (0.6, -0.8, 0.0), (1, 0.1, 0.05)),
              thigh_L=(-30, 0, 0), shin_L=(24, 0, 0))
    follow = P(sweep, spine=(12, 0, 36), chest=(8, 0, 40), arm_R=arm((0.7, -0.6, -0.2), (0.9, 0.3, -0.1), (0.3, 0.95, 0.1)))
    return [(0, K_STANCE), (8, wind), (13, sweep), (18, follow), (30, K_STANCE)]


def k_bash():
    brace = P(K_STANCE, move=(0, 0.04, -0.06), spine=(4, 0, 18), chest=(2, 0, 16), head=(-6, 0, -14),
              arm_L=arm((0.5, 0.2, -1), (-0.4, -0.4, 0.8), (0, 0.4, 1)))
    hit = P(K_STANCE, move=(0, -0.18, -0.06), spine=(18, 0, -14), chest=(8, 0, -18), head=(-14, 0, 12),
            arm_L=arm((0.15, -1, -0.15), (-0.5, -0.9, 0.1), (0, -0.1, 1)),
            thigh_L=(-40, 0, 0), shin_L=(32, 0, 0), thigh_R=(22, 0, 0))
    return [(0, K_STANCE), (6, brace), (10, hit), (14, hit), (26, K_STANCE)]


K_BLOCK = P(K_STANCE, move=(0, 0.03, -0.08), spine=(10, 0, 4), chest=(8, 0, 2), neck=(4, 0, 0), head=(-14, 0, 0),
            thigh_L=(-24, 0, 0), shin_L=(30, 0, 0), thigh_R=(16, 0, 0), shin_R=(26, 0, 0),
            arm_L=arm((0.45, -0.55, -0.6), (-1, -0.15, 0.3), (0, 0.1, 1)),
            arm_R=arm((-0.4, 0.35, -1), (-0.1, -0.3, 1), (0.1, 0.9, 0.4)))


def k_block():
    b2 = P(K_BLOCK, move=(0, 0.03, -0.085), spine=(11, 0, 4))
    return [(0, K_BLOCK), (20, b2), (40, K_BLOCK)]


def k_hit():
    rock = P(K_STANCE, move=(0, 0.09, -0.04), spine=(-12, 0, 8), chest=(-10, 0, 6), neck=(-8, 0, 0), head=(-24, 0, -12),
             arm_R=arm((-0.6, 0.3, -0.7), (-0.3, -0.6, 0.6), (0.2, 0.3, 1)),
             arm_L=arm((0.6, 0.2, -0.8), (-0.5, -0.8, 0.0), (0, -0.4, 1)),
             thigh_L=(-6, 0, 0), thigh_R=(20, 0, 0))
    return [(0, K_STANCE), (4, rock), (16, K_STANCE)]


# ------------------------------------------------------------------ sorcerers

S_STANCE = P(move=(0, 0, -0.01), spine=(8, 0, 0), chest=(8, 0, 0), neck=(6, 0, 0), head=(-10, 0, 0),
             thigh_L=(-6, 0, 0), shin_L=(8, 0, 0), thigh_R=(4, 0, 0), shin_R=(8, 0, 0),
             arm_R=arm((-0.28, -0.05, -1), (-0.15, -1, 0.15), (0, 0.05, 1)),
             arm_L=arm((0.3, -0.1, -1), (0.15, -0.8, -0.5), None))
S_BREATH = P(S_STANCE, spine=(9, 0, 2), chest=(10, 0, 0), head=(-8, 0, -4),
             arm_L=arm((0.32, -0.15, -1), (0.2, -0.85, -0.35), None))


def s_idle():
    return [(0, S_STANCE), (36, S_BREATH), (72, S_STANCE)]


def s_walk():
    def ex(i, p):
        p = dict(p)
        sw = (1, 0, -1, 0)[i]
        p["ik"] = dict(p["ik"])
        p["ik"]["R"] = arm((-0.28, -0.05 - 0.15 * sw, -1), (-0.15, -1, 0.15 - 0.1 * sw), (0, 0.05 + 0.2 * sw, 1))
        return p
    return cycle(S_STANCE, legs_walk(0.75, 0.9), (-0.01, 0.012, -0.01, 0.012), 40, ex)


S_HURRY = P(S_STANCE, spine=(18, 0, 0), chest=(10, 0, 0), head=(-18, 0, 0),
            arm_R=arm((-0.35, -0.4, -1), (-0.2, -1, 0.5), (0.1, -0.5, 1)),
            arm_L=arm((0.35, 0.3, -1), (0.2, -0.6, -0.6), None))


def s_run():
    return cycle(S_HURRY, legs_run(0.8), (-0.05, 0.02, -0.05, 0.02), 22)


def s_cast1():
    # a bolt from the left hand: drawn back to the shoulder, then thrust out, palm first
    draw = P(S_STANCE, move=(0, 0.04, -0.02), spine=(2, 0, 18), chest=(0, 0, 16), head=(-8, 0, -14),
             arm_L=arm((0.6, 0.6, -0.2), (-0.4, -0.5, 0.6), None, (-0.2, -0.3, 1)))
    thrust = P(S_STANCE, move=(0, -0.08, -0.04), spine=(14, 0, -12), chest=(10, 0, -14), head=(-12, 0, 10),
               arm_L=arm((0.15, -1, 0.1), (0.05, -1, 0.12), None, (0.0, -0.6, 0.8)),
               thigh_L=(-22, 0, 0), shin_L=(20, 0, 0))
    return [(0, S_STANCE), (10, draw), (15, thrust), (22, thrust), (34, S_STANCE)]


def s_cast2():
    # a summoning: the staff and the free hand lifted high, held, then brought down
    rise = P(S_STANCE, move=(0, 0.02, 0.0), spine=(-8, 0, 0), chest=(-12, 0, 0), neck=(-6, 0, 0), head=(-26, 0, 0),
             arm_R=arm((-0.4, -0.1, 0.9), (-0.15, -0.15, 1), (0, -0.2, 1)),
             arm_L=arm((0.6, -0.2, 0.75), (0.3, -0.2, 1), None, (0.2, -0.3, 1)))
    shake = P(rise, head=(-30, 0, 6), arm_L=arm((0.65, -0.15, 0.7), (0.35, -0.25, 1), None, (0.3, -0.4, 1)))
    slam = P(S_STANCE, move=(0, -0.06, -0.14), spine=(26, 0, 0), chest=(14, 0, 0), head=(-20, 0, 0),
             arm_R=arm((-0.2, -0.8, -0.6), (-0.1, -0.5, -1), (0, -0.2, -1)),
             arm_L=arm((0.6, -0.5, -0.4), (0.4, -0.9, -0.4), None),
             thigh_L=(-26, 0, 0), shin_L=(40, 0, 0), thigh_R=(14, 0, 0), shin_R=(36, 0, 0))
    return [(0, S_STANCE), (12, rise), (20, shake), (24, rise), (28, slam), (34, slam), (46, S_STANCE)]


def s_attack1():
    wind = P(S_STANCE, spine=(2, 0, -26), chest=(-2, 0, -20), head=(-8, 0, 30),
             arm_R=arm((-0.9, 0.4, 0.1), (-0.4, 0.8, 0.5), (-0.2, 0.5, -0.85)))
    swing = P(S_STANCE, move=(0, -0.06, -0.04), spine=(14, 0, 24), chest=(8, 0, 26), head=(-12, 0, -24),
              arm_R=arm((0.2, -1, 0.0), (0.7, -0.7, 0.0), (0.7, 0.7, 0.1)), thigh_L=(-26, 0, 0), shin_L=(22, 0, 0))
    return [(0, S_STANCE), (8, wind), (13, swing), (18, swing), (30, S_STANCE)]


def s_blink():
    crouch = P(S_STANCE, move=(0, 0, -0.3), spine=(36, 0, 0), chest=(16, 0, 0), head=(-26, 0, 0),
               thigh_B=(-60, 0, 0), shin_B=(100, 0, 0), foot_B=(-30, 0, 0),
               arm_L=arm((0.7, -0.4, 0.4), (0.3, -0.3, 1), None, (0.2, -0.2, 1)))
    return [(0, S_STANCE), (10, crouch), (18, crouch)]


def s_hit():
    rock = P(S_STANCE, move=(0, 0.08, -0.03), spine=(-14, 0, -8), chest=(-12, 0, -6), head=(-28, 0, 14),
             arm_L=arm((0.8, 0.3, -0.3), (0.4, -0.5, 0.6), None))
    return [(0, S_STANCE), (4, rock), (18, S_STANCE)]


# ------------------------------------------------------------------ the ghast

G_STANCE = P(move=(0, 0.02, -0.14), spine=(28, 0, 0), chest=(16, 0, 0), neck=(-12, 0, 0), head=(-26, 0, 0),
             thigh_B=(-34, 0, 4), shin_B=(56, 0, 0), foot_B=(-22, 0, 0),
             arm_R=arm((-0.4, -0.55, -1), (-0.1, -1, -0.5), None, (0.0, -0.7, -0.8)),
             arm_L=arm((0.4, -0.55, -1), (0.1, -1, -0.5), None, (0.0, -0.7, -0.8)))
G_TWITCH = P(G_STANCE, head=(-34, 6, 16), neck=(-8, 0, 0), spine=(30, 0, 2),
             arm_R=arm((-0.5, -0.5, -1), (-0.2, -1, -0.3), None, (-0.1, -0.8, -0.5)))


def g_idle():
    return [(0, G_STANCE), (14, G_TWITCH), (18, G_TWITCH), (30, G_STANCE), (44, P(G_STANCE, head=(-22, -4, -12))), (60, G_STANCE)]


def g_walk():
    def ex(i, p):
        p = dict(p)
        sw = (1, 0, -1, 0)[i]
        p["ik"] = {"R": arm((-0.4, -0.55 + 0.35 * sw, -1), (-0.1, -1, -0.5 + 0.2 * sw), None, (0.0, -0.7, -0.8)),
                   "L": arm((0.4, -0.55 - 0.35 * sw, -1), (0.1, -1, -0.5 - 0.2 * sw), None, (0.0, -0.7, -0.8))}
        return p
    return cycle(G_STANCE, legs_walk(1.0, 1.4), (-0.02, 0.01, -0.02, 0.01), 32, ex)


G_LOPE = P(G_STANCE, move=(0, 0, -0.2), spine=(46, 0, 0), chest=(18, 0, 0), neck=(-20, 0, 0), head=(-32, 0, 0))


def g_run():
    def ex(i, p):
        p = dict(p)
        sw = (1, 0, -1, 0)[i]
        p["ik"] = {"R": arm((-0.3, -0.2 + 0.8 * sw, -1), (-0.1, -0.6 + 0.8 * sw, -1), None),
                   "L": arm((0.3, -0.2 - 0.8 * sw, -1), (0.1, -0.6 - 0.8 * sw, -1), None)}
        return p
    return cycle(G_LOPE, legs_run(1.1), (-0.07, 0.03, -0.07, 0.03), 16, ex)


def g_rake(side):
    o = "L" if side == "R" else "R"
    sx = -1 if side == "R" else 1
    wind = P(G_STANCE, move=(0, 0.04, -0.1), spine=(14, 0, -24 * -sx), chest=(4, 0, -18 * -sx), head=(-30, 0, 18 * -sx),
             **{f"arm_{side}": arm((sx * 0.7, 0.3, 0.7), (sx * 0.3, 0.2, 1), None, (sx * 0.1, -0.2, 1))})
    strike = P(G_STANCE, move=(0, -0.16, -0.16), spine=(40, 0, 20 * -sx), chest=(20, 0, 22 * -sx), head=(-30, 0, -16 * -sx),
               thigh_L=(-44, 0, 0), shin_L=(50, 0, 0),
               **{f"arm_{side}": arm((-sx * 0.2, -1, -0.3), (-sx * 0.7, -0.6, -0.5), None, (-sx * 0.5, -0.4, -0.8))})
    follow = P(strike, **{f"arm_{side}": arm((-sx * 0.6, -0.6, -0.6), (-sx * 0.8, 0.1, -0.6), None)})
    return [(0, G_STANCE), (7, wind), (11, strike), (15, follow), (24, G_STANCE)]


def g_attack3():
    # the pounce: down on its haunches, then thrown forward with both claws out
    coil = P(G_STANCE, move=(0, 0.06, -0.3), spine=(44, 0, 0), chest=(20, 0, 0), head=(-36, 0, 0),
             thigh_B=(-70, 0, 0), shin_B=(110, 0, 0), foot_B=(-36, 0, 0),
             arm_R=arm((-0.6, 0.3, 0.6), (-0.2, -0.2, 1), None), arm_L=arm((0.6, 0.3, 0.6), (0.2, -0.2, 1), None))
    leap = P(G_STANCE, move=(0, -0.3, 0.12), spine=(24, 0, 0), chest=(6, 0, 0), head=(-20, 0, 0),
             thigh_B=(14, 0, 0), shin_B=(10, 0, 0), foot_B=(30, 0, 0),
             arm_R=arm((-0.25, -1, 0.3), (-0.1, -1, 0.1), None), arm_L=arm((0.25, -1, 0.3), (0.1, -1, 0.1), None))
    land = P(G_STANCE, move=(0, -0.2, -0.24), spine=(44, 0, 0), thigh_L=(-60, 0, 0), shin_L=(80, 0, 0),
             arm_R=arm((-0.3, -0.9, -0.6), (-0.1, -0.5, -1), None), arm_L=arm((0.3, -0.9, -0.6), (0.1, -0.5, -1), None))
    return [(0, G_STANCE), (8, coil), (13, leap), (19, land), (32, G_STANCE)]


def g_shriek():
    up = P(G_STANCE, move=(0, 0.04, -0.06), spine=(-4, 0, 0), chest=(-14, 0, 0), neck=(-22, 0, 0), head=(-30, 0, 0),
           arm_R=arm((-1, 0.2, 0.3), (-0.8, -0.4, 0.6), None), arm_L=arm((1, 0.2, 0.3), (0.8, -0.4, 0.6), None))
    shake = P(up, head=(-34, 0, 10), chest=(-16, 0, -4))
    return [(0, G_STANCE), (10, up), (16, shake), (22, up), (28, shake), (40, G_STANCE)]


def g_hit():
    rock = P(G_STANCE, move=(0, 0.1, -0.1), spine=(10, 0, 14), chest=(4, 0, 8), head=(-40, 0, -20))
    return [(0, G_STANCE), (4, rock), (14, G_STANCE)]


# ------------------------------------------------------------------ the grubber

U_STANCE = P(move=(0, 0, -0.04), spine=(18, 0, 0), chest=(10, 0, 0), neck=(-10, 0, 0), head=(-12, 0, 0),
             thigh_L=(-14, 0, 10), shin_L=(24, 0, 0), foot_L=(-8, 0, -6), thigh_R=(-14, 0, -10), shin_R=(24, 0, 0),
             foot_R=(-8, 0, 6),
             arm_R=arm((-0.6, 0.1, -0.8), (-0.3, -0.7, 0.6), (0.2, 0.5, 0.85)),
             arm_L=arm((0.5, -0.3, -0.8), (0.3, -0.9, -0.3), None))


def u_idle():
    b = P(U_STANCE, move=(0, 0, -0.05), spine=(20, -3, 0), head=(-8, 4, 10))
    c = P(U_STANCE, move=(0, 0, -0.035), spine=(17, 3, 0), head=(-14, -4, -8))
    return [(0, U_STANCE), (20, b), (40, c), (60, U_STANCE)]


def u_walk():
    def ex(i, p):
        p = dict(p)
        sw = (1, 0, -1, 0)[i]
        p.update(pose(spine=(18, 8 * sw, 0), hips=(0, -6 * sw, 0)))
        return p
    return cycle(U_STANCE, legs_walk(0.8, 1.1), (-0.01, 0.02, -0.01, 0.02), 30, ex)


U_CHARGE = P(U_STANCE, spine=(30, 0, 0), chest=(12, 0, 0), head=(-26, 0, 0),
             arm_R=arm((-0.5, 0.3, 0.6), (-0.2, 0.3, 1), (0.1, 0.9, 0.2)))


def u_run():
    return cycle(U_CHARGE, legs_run(0.8), (-0.04, 0.02, -0.04, 0.02), 18)


def u_attack1():
    lift = P(U_STANCE, move=(0, 0.04, 0.0), spine=(-6, 0, 0), chest=(-10, 0, 0), head=(-6, 0, 0),
             arm_R=arm((-0.3, 0.1, 1), (0.0, 0.6, 1), (0.1, 1, -0.2)), arm_L=arm((0.6, 0.0, 0.3), (0.3, -0.4, 0.6), None))
    smash = P(U_STANCE, move=(0, -0.12, -0.12), spine=(40, 0, 0), chest=(16, 0, 0), head=(-22, 0, 0),
              arm_R=arm((-0.1, -1, -0.3), (0, -0.6, -0.8), (0, -0.1, -1)),
              thigh_B=(-36, 0, 0), shin_B=(50, 0, 0))
    return [(0, U_STANCE), (11, lift), (17, smash), (22, smash), (36, U_STANCE)]


def u_attack2():
    back = P(U_STANCE, move=(0, 0.05, -0.02), spine=(6, 0, 0), neck=(-20, 0, 0), head=(-20, 0, 0))
    bite = P(U_STANCE, move=(0, -0.18, -0.08), spine=(34, 0, 0), chest=(18, 0, 0), neck=(10, 0, 0), head=(-4, 0, 0),
             thigh_L=(-40, 0, 0), shin_L=(40, 0, 0))
    return [(0, U_STANCE), (7, back), (12, bite), (16, bite), (26, U_STANCE)]


def u_attack3():
    wind = P(U_STANCE, spine=(14, 0, -30), chest=(8, 0, -20),
             arm_R=arm((-1, 0.3, 0.1), (-0.6, 0.7, 0.3), (-0.2, 0.3, 0.9)))
    swipe = P(U_STANCE, move=(0, -0.06, -0.06), spine=(22, 0, 26), chest=(10, 0, 28),
              arm_R=arm((0.2, -1, 0.0), (0.8, -0.6, -0.1), (0.6, 0.8, 0.0)))
    return [(0, U_STANCE), (8, wind), (13, swipe), (17, swipe), (28, U_STANCE)]


def u_hit():
    rock = P(U_STANCE, move=(0, 0.08, -0.03), spine=(4, 0, -12), head=(-30, 0, 16))
    return [(0, U_STANCE), (4, rock), (14, U_STANCE)]


# ------------------------------------------------------------------ shared: falls, deaths, the ground

def ground_set(stance):
    """The zombie's jump, fall, death and crawl clips, starting from this kind's stance."""
    Z.STANCE = {k: v for k, v in stance.items() if k != "ik"}
    out = {"jump": Z.jump, "fall": Z.fall, "death": Z.death, "dead": Z.dead, "collapse": Z.collapse, "crawl": Z.crawl,
           "crawl_attack": Z.crawl_attack, "crawl_death": Z.crawl_death, "crawl_dead": Z.crawl_dead, "getup": Z.getup}
    keys = {}
    for name, fn in out.items():
        # wherever the zombie stands in its own stance, this kind stands in its own (arms holding things)
        keys[name] = [(f, stance if p is Z.STANCE else p) for f, p in fn()]
    return keys


KINDS = {
    "knight": dict(stance=K_STANCE, idle=k_idle, walk=k_walk, run=k_run, attack1=k_attack1, attack2=k_attack2,
                   attack3=k_attack3, bash=k_bash, block=k_block, hit=k_hit),
    "sorcerer": dict(stance=S_STANCE, idle=s_idle, walk=s_walk, run=s_run, cast1=s_cast1, cast2=s_cast2, attack1=s_attack1,
                     blink=s_blink, hit=s_hit),
    "ghast": dict(stance=G_STANCE, idle=g_idle, walk=g_walk, run=g_run, attack1=lambda: g_rake("R"),
                  attack2=lambda: g_rake("L"), attack3=g_attack3, shriek=g_shriek, hit=g_hit),
    "grubber": dict(stance=U_STANCE, idle=u_idle, walk=u_walk, run=u_run, attack1=u_attack1, attack2=u_attack2,
                    attack3=u_attack3, hit=u_hit),
}


def clip_keys(kind):
    k = KINDS[kind]
    out = {n: fn() for n, fn in k.items() if n != "stance"}
    out.update(ground_set(k["stance"]))
    return out


def bake(ao, kind, J):
    """Key every clip of `kind` onto the armature `ao` (rest = T-pose) as its own action."""
    rest = {b.name: b.matrix_local.copy() for b in ao.data.bones}
    order = [b.name for b in ao.data.bones]
    parent = {b.name: (b.parent.name if b.parent else None) for b in ao.data.bones}
    scale = float(J["hips"][0][2]) / 0.95                        # moves were keyed for a man's hips
    for pb in ao.pose.bones:
        pb.rotation_mode = "QUATERNION"
    ao.animation_data_create()
    for name, frames in clip_keys(kind).items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        ao.animation_data.action = act
        for frame, p in frames:
            local = solve(p, order, parent)
            for bn in order:
                R = Matrix(local[bn].tolist()).to_4x4()
                h = rest[bn].translation
                L4 = Matrix.Translation(h) @ R @ Matrix.Translation(-h)
                if bn == "hips" and "move" in p:
                    L4 = Matrix.Translation(Vector(p["move"]) * scale) @ L4
                basis = rest[bn].inverted() @ L4 @ rest[bn]
                loc, rot, _ = basis.decompose()
                pb = ao.pose.bones[bn]
                pb.location = loc
                pb.rotation_quaternion = rot
                pb.keyframe_insert("location", frame=frame + 1, group=bn)
                pb.keyframe_insert("rotation_quaternion", frame=frame + 1, group=bn)
    ao.animation_data.action = None
    for pb in ao.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
