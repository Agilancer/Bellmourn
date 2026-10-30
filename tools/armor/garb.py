"""Cloth and leather for the armour sets: coats and robes, capes, tabards, hoods with mantles
and belts. Above the waist they ride the torso like its plates; below it they hang from the
waist and their hems follow the legs (build.py's `blend` weights), split where the legs need
room, so they swing like cloth instead of cutting through the stride.
"""
import math

import numpy as np

from pieces import TAU, Fit, cyl, edge_tube, norm, piece, shell, smooth
from plates import CUIRASS, TORSO, head_fit, helm_edge, rim_along, wrap

LEGS = ("UpperLeg", "LowerLeg")


def body_fit(body, lo, hi, hard=0.06, shoulders=False, box=0.0):
    """The torso and legs (not the arms) round the body's vertical axis, as a hard shell."""
    names = TORSO + LEGS + (("Shoulder",) if shoulders else ())
    m = body.mask(*names)
    if shoulders:
        m |= body.mask("UpperArm") & (np.abs(body.V[:, 0]) < 0.22)
    yc = float(body.head("Chest")[1])
    return Fit(body.V[m], (0, yc, 0), (0, 0, 1), (0, -1, 0), lo, hi, nt=48, na=48, hard=hard,
               box=box)


def _drop(v, f, keep):
    """Faces whose centre passes keep(angle from the front, height)."""
    out = []
    for q in f:
        c = v[q].mean(0)
        a = math.atan2(c[0], -c[1])  # 0 at the front, + toward the villager's left
        if keep(a, c[2]):
            out.append(q)
    return out


def coat(body, mat, hem, gap=0.03, flare=0.07, top=None, scoop=0.05, splits=(0.0,),
         split_w=0.16, split_at=None, strips=0, jag=0.0, teeth=16, hard=0.06, name="coat",
         solid=0.0, rows=16, rim=None, box=0.0):
    """A coat, jerkin or robe from the shoulders (armholes cut like a cuirass's) or from height
    `top`, down to `hem`, flaring below the waist. `splits` (angles from the front) open the
    skirt from `split_at` down; `strips` cuts it into that many hanging strips instead
    (pteruges); `jag` tears the hem."""
    waist = body.waist
    front, back, pit = body.neck - scoop, body.neck - 0.025, body.armpit + 0.01
    fit = body_fit(body, hem - 0.06, body.neck + 0.05, hard, box=box)

    def hi(a):
        if top is not None:
            return top
        b = front + (back - front) * (1 - math.cos(a)) / 2
        g = smooth(abs(math.sin(a)), 0.45, 0.85)
        return b * (1 - g) + pit * g

    def lo(a):
        if not jag:
            return hem
        f = (a * teeth / TAU) % 1.0
        return hem - jag * abs(2 * f - 1) ** 1.5

    def off(t, a):
        s = float(np.clip((waist - t) / max(waist - hem, 1e-3), 0, 1))
        return gap + flare * s ** 1.3

    v, f, cols = shell(fit, lo, hi, off, rows=rows, cols=48)
    split_at = waist - 0.08 if split_at is None else split_at
    if strips:
        def keep(a, z):
            if z > split_at:
                return True
            k = (a / TAU * strips) % 1.0
            return 0.12 < k < 0.88
    else:
        def keep(a, z):
            return z > split_at or all(abs(wrap(a - s)) > split_w for s in splits)
    f = _drop(v, f, keep)
    w = {"blend": CUIRASS, "top": waist - 0.03, "bottom": hem}
    out = [piece(name, v, f, mat, cyl(fit, math.pi), w=w, solid=solid, sharp=22 if box else 38)]
    if rim:
        out.append(rim_along(f"{name} collar", v, cols, rows - 1, rim, fit, r=0.006, w=CUIRASS))
    return out


def cape(body, mat, hem, width=1.3, gap=0.06, flare=0.14, top=None, jag=0.0, teeth=14,
         name="cape", stiff=True, rim=None, folds=0.045, nfolds=6):
    """A cloak hanging down the back from below the shoulders: rigid with the chest at the top,
    its hem following the backs of the legs."""
    top = body.armpit + 0.04 if top is None else top
    fit = body_fit(body, hem - 0.06, top + 0.06, hard=0.08, shoulders=True)

    def lo(a):
        if not jag:
            return hem
        f = (a * teeth / TAU) % 1.0
        return hem - jag * abs(2 * f - 1) ** 1.5
    def off(t, a):  # flaring toward the hem, falling into folds
        s = float(np.clip((top - t) / (top - hem), 0, 1))
        fold = folds * s ** 1.6 * math.sin((a - math.pi) / width * math.pi * nfolds / 2) ** 2
        return gap + flare * s ** 1.6 + fold
    v, f, _ = shell(fit, lo, top, off, rows=16, cols=56, arc=(math.pi - width, math.pi + width))
    if stiff:  # hangs from the chest and swings with the hips, clear of the legs
        def w(p):
            k = float(smooth(p[2], hem, top - 0.05))
            return {"Chest": k, "Hips": 1 - k} if k < 1 else {"Chest": 1.0}
    else:
        w = {"blend": {"Chest": 1.0}, "top": top - 0.05, "bottom": hem}
    out = [piece(name, v, f, mat, cyl(fit, 0.0), w=w, solid=0.003)]
    if rim:
        out.append(rim_along(f"{name} hem", v, 56, 0, rim, fit, r=0.005, closed=False, w=w))
    return out


def tabard(body, mat, hem, width=0.5, gap=0.034, flare=0.06, top=None, back=True, jag=0.0,
           teeth=8, name="tabard", rim=None, stiff=False, centers=None):
    """Front (and back) panels from the chest to `hem`, hanging straight from the waist; a
    `stiff` one (a loincloth, a heavy apron) rides the hips instead of following the legs."""
    waist = body.waist
    top = body.neck - 0.07 if top is None else top
    fit = body_fit(body, hem - 0.06, top + 0.06, hard=0.07)

    def off(t, a):
        hang = max(0.0, fit.radius(waist, a) - fit.radius(t, a)) if t < waist else 0.0
        s = float(np.clip((waist - t) / max(waist - hem, 1e-3), 0, 1))
        return gap + hang + flare * s ** 1.5

    def lo(a):
        if not jag:
            return hem
        f = (a * teeth / (2 * width)) % 1.0
        return hem - jag * abs(2 * f - 1) ** 1.5

    out = []
    if stiff:
        def w(p):
            k = float(smooth(p[2], hem, waist))
            return {"Torso": 0.5 * k, "Chest": 0.5 * k, "Hips": 1 - k} if k > 0 else {"Hips": 1.0}
    else:
        w = {"blend": CUIRASS, "top": waist - 0.03, "bottom": hem}
    centers = centers or ((0.0, math.pi) if back else (0.0,))
    for k, ac in enumerate(centers):
        v, f, cols = shell(fit, lo, top, off, rows=14, cols=17, arc=(ac - width, ac + width))
        nm = f"{name} {'front' if ac == 0 else 'back' if ac == math.pi else k + 1}"
        out.append(piece(nm, v, f, mat, cyl(fit, ac + math.pi), w=w, solid=0.003))
        if rim:
            out.append(rim_along(f"{nm} hem", v, cols, 0, rim, fit, r=0.004, closed=False, w=w))
            for c in (0, cols - 1):  # and down both sides
                side = v[c::cols]
                q = side - fit.o
                outw = norm(q - np.outer(q @ fit.ax, fit.ax))
                rv, rf = edge_tube(side + outw * 0.002, 0.004, closed=False)
                out.append(piece(f"{nm} edge {c}", rv, rf, rim, cyl(fit, math.pi), w=w))
    return out


def hood(body, mat, gap=0.022, mantle=True, mantle_hem=None, drape=0.06, peak=0.035,
         name="hood"):
    """A hood, its face open from the brow to the chin, and a mantle over the shoulders."""
    from plates import aventail, helm
    e = body.eye
    edge = helm_edge(body, front=0.065, side=-0.11, back=-0.16, face=0.72, ramp=1.45)
    out = helm(body, mat, name, edge, gap, rise=0.03, crown_gap=gap + 0.012, tail=0.02,
               solid=0.004)
    if mantle:
        hem = body.armpit + 0.02 if mantle_hem is None else mantle_hem
        out += aventail(body, mat, gap=gap + drape, chin=0.12, edge=edge, name=f"{name} mantle",
                        bottom=hem)
    return out


def belt(body, mat, z=None, h=0.045, gap=0.028, buckle=None, name="belt"):
    """A belt round the waist; `buckle` (a vee or sigil maker) is set on its front."""
    from ornament import band
    z = body.waist - 0.03 if z is None else z
    fit = body_fit(body, z - 0.1, z + 0.1, hard=0.05)
    out = [band(fit, name, z - h / 2, z + h / 2, gap, mat, CUIRASS, cols=48, solid=0.004)]
    if buckle:
        out.append(buckle(name, fit.point(z, 0, fit.radius(z, 0)), fit.dir(0), (0, 0, 1)))
    return out


def mantle(body, mat, hem=None, top=None, gap=0.035, flare=0.035, jag=0.0, teeth=20, rim=None,
           name="mantle"):
    """A shoulder mantle (a capelet, a fur collar) from round the neck down over the shoulders."""
    top = body.neck + 0.01 if top is None else top
    hem = body.armpit + 0.04 if hem is None else hem
    fit = body_fit(body, hem - 0.05, top + 0.05, hard=0.06, shoulders=True)

    def lo(a):
        if not jag:
            return hem
        f = (a * teeth / TAU) % 1.0
        return hem - jag * abs(2 * f - 1) ** 1.5
    off = lambda t, a: gap + flare * float(np.clip((top - t) / (top - hem), 0, 1)) ** 1.3
    v, f, cols = shell(fit, lo, top, off, rows=7, cols=48)
    w = {"Chest": 0.7, "Neck": 0.3}
    out = [piece(name, v, f, mat, cyl(fit, math.pi), w=w, solid=0.004)]
    if rim:
        out.append(rim_along(f"{name} rim", v, cols, 6, rim, fit, r=0.006, w=w))
    return out
