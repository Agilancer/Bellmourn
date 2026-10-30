"""The armour pieces, each fitted to a `Body` (pieces.py) and dressed in swatches.

Every builder returns a list of pieces. Gaps are metres proud of the under-layer; plates are
solidified inward by build.py, so a gap is the clearance to the plate's inside face plus its
thickness. Plates are hard shells, not skins: their fits are `hard` (the convex hull of the
body round the axis, bridging the waist and the hollows), and each rides its bones rigidly
(one bone, or a fixed blend at a joint) instead of taking the body's weights, so it never
bends or twists with the flesh under it. Only mail and cloth follow the body.
"""
import math

import numpy as np

from pieces import (TAU, Fit, cyl, edge_tube, limb_fit, norm, piece, sgn, shell, smooth)


def wrap(a):
    return (a + math.pi) % TAU - math.pi


# ------------------------------------------------------------------ the V of Lord Velscour

# The V of the Velscour sigil (art/velscour/sigil_512.png), traced: two arms flaring at the top
# into an outward spike, a small point at each inner corner, meeting in a sharp point. Units:
# the bone V's height; its point at the origin.
_LEFT = [(0.0, 0.0), (-0.50, 0.80), (-0.68, 1.0), (-0.36, 0.93), (-0.29, 1.0), (-0.22, 0.88),
         (0.0, 0.24)]
V_POLY = _LEFT + [(-x, y) for x, y in reversed(_LEFT[1:-1])]


def offset_poly(poly, d, clamp=3.0):
    """The polygon grown by d (mitred corners, sharp points capped at clamp * d)."""
    P = np.asarray(poly, float)
    n = len(P)
    area = 0.5 * sum(P[i, 0] * P[(i + 1) % n, 1] - P[(i + 1) % n, 0] * P[i, 1] for i in range(n))
    sgn_ = 1.0 if area > 0 else -1.0
    out = []
    for i in range(n):
        e1, e2 = P[i] - P[i - 1], P[(i + 1) % n] - P[i]
        n1 = sgn_ * np.array([e1[1], -e1[0]]) / np.linalg.norm(e1)
        n2 = sgn_ * np.array([e2[1], -e2[0]]) / np.linalg.norm(e2)
        m = n1 + n2
        m = m / max(np.linalg.norm(m), 1e-9)
        k = min(d / max(np.dot(m, n1), 1e-6), clamp * d)
        out.append(P[i] + m * k)
    return [tuple(p) for p in out]


def vee(target, c, n, up, size, face="polished_gold_mid", back="hammered_steel_dark",
        group="armor", name=None):
    """A raised V on a piece: the bone V in `face`, on a larger dark V in `back` whose point runs
    further down, as on the sigil. build.py lays it onto the target's surface by casting rays
    along -n; `up` is the way the V's arms open."""
    poly = [(x, y - 0.5) for x, y in V_POLY]
    return dict(kind="emblem", name=name or f"V on {target}", target=target, group=group,
                c=np.asarray(c, float), n=norm(n), up=norm(up), size=size,
                layers=[(offset_poly(poly, 0.075), back, -0.001, 0.0025),
                        (poly, face, 0.0015, 0.0052)])


SHIELD = [(0.0, -0.5), (0.3, -0.22), (0.36, 0.28), (0.2, 0.5), (-0.2, 0.5), (-0.36, 0.28),
          (-0.3, -0.22)]  # a breastplate's inlaid panel, pointing down


def circle_poly(r, n=24):
    return [(r * math.cos(TAU * k / n), r * math.sin(TAU * k / n)) for k in range(n)]


def plaque(target, c, n, up, size, face, edge, poly=SHIELD, edge_w=0.07, group="armor", name=None):
    """An inlaid panel on a piece (a silver chest panel in a gold frame), laid low so a V or
    a sigil can sit on it."""
    return dict(kind="emblem", name=name or f"plaque on {target}", target=target, group=group,
                c=np.asarray(c, float), n=norm(n), up=norm(up), size=size,
                layers=[(offset_poly(poly, edge_w), edge, -0.001, 0.0018, {"cuts": 3}),
                        (poly, face, 0.0012, 0.0026, {"cuts": 3})])


def rondel(target, c, n, up, size, gold, inner, v=None, group="armor", name=None):
    """A round boss: a gold disc, a dark field and Lord Velscour's V raised on it."""
    vp = [(x * 0.62, (y - 0.5) * 0.62) for x, y in V_POLY]
    layers = [(circle_poly(0.5), gold, -0.001, 0.005, {"cuts": 2}),
              (circle_poly(0.39), inner, 0.005, 0.0058, {"cuts": 2}),
              (vp, v or gold, 0.0058, 0.009)]
    return dict(kind="emblem", name=name or f"rondel on {target}", target=target, group=group,
                c=np.asarray(c, float), n=norm(n), up=norm(up), size=size, layers=layers)


def rim_along(name, v, cols, row, mat, fit, r=0.005, closed=True, lift=0.002, w="body"):
    """A rolled edge along one row of a shell's vertices."""
    ring = v[row * cols:(row + 1) * cols]
    q = ring - fit.o
    out = q - np.outer(q @ fit.ax, fit.ax)
    rv, rf = edge_tube(ring + norm(out) * lift, r, closed=closed)
    return piece(name, rv, rf, mat, cyl(fit, math.pi), w=w)


def torso_fit(body, t0, t1, names=None, extra=None, hard=0.0, box=0.0):
    m = body.mask(*names) if names else np.ones(len(body.V), bool)
    P = body.pts(m)
    if extra is not None:
        P = np.vstack([P, extra])
    yc = float(body.head("Chest")[1])
    return Fit(P, (0, yc, 0), (0, 0, 1), (0, -1, 0), t0, t1, nt=40, na=48, hard=hard, box=box)


CUIRASS = {"Torso": 0.5, "Chest": 0.5}  # the ribcage: between the two bones that carry it


TORSO = ("Hips", "Abdomen", "Torso", "Chest", "Neck", "Body", "Root")


def cuirass(body, mat, rim=None, gap=0.022, ridge=0.012, scoop=0.065, point=0.042, vees=None,
            box=0.0, flutes=0.0, nflutes=11):
    """Breast and back plate in one: a ridge down the middle of the breast, armholes cut to the
    armpits, a scooped neck, a flare over the hips and a V-pointed waist; rolled rims round the
    top and the waist; `flutes` (their height) fans raised ridges up the breast."""
    base = body.waist - 0.015
    front, back, pit = body.neck - scoop, body.neck - 0.03, body.armpit
    fit = torso_fit(body, base - 0.08, body.neck + 0.05, TORSO, hard=0.07, box=box)

    def hi(a):
        base = front + (back - front) * (1 - math.cos(a)) / 2
        g = smooth(abs(math.sin(a)), 0.45, 0.85)
        return base * (1 - g) + pit * g

    def off(t, a):
        r = ridge * math.exp(-(wrap(a) / 0.22) ** 2) * smooth(t, base, base + 0.08) * (
            1 - smooth(t, front - 0.07, front))
        fl = 0.0
        if flutes and abs(wrap(a)) < 1.25:
            fl = flutes * (0.5 + 0.5 * math.cos(nflutes * wrap(a))) ** 6 * smooth(t, base, base + 0.1) * (
                1 - smooth(t, front - 0.12, front - 0.02)) * (1 - abs(wrap(a)) / 1.25)
        return (gap + r + fl + 0.008 * (1 - smooth(t, base, base + 0.07)) +
                0.014 * (1 - smooth(t, base - point, base)))

    lo = lambda a: base - point * max(0.0, 1 - abs(wrap(a)) / 0.55)  # the waist dips to a V
    v, f, cols = shell(fit, lo, hi, off, rows=13, cols=44)
    out = [piece("cuirass", v, f, mat, cyl(fit, math.pi), w=CUIRASS, solid=0.004, sharp=22 if box else 38)]
    out[0]["fit"] = fit
    if vees:
        t = base + (front - base) * 0.6
        out.append(vee("cuirass", fit.point(t, 0, fit.radius(t, 0)), fit.dir(0), (0, 0, 1),
                       0.15, *vees, name="V on the breast"))
        t = base + (back - base) * 0.68
        out.append(vee("cuirass", fit.point(t, math.pi, fit.radius(t, math.pi)), fit.dir(math.pi),
                       (0, 0, 1), 0.12, *vees, name="V on the back"))
    if rim:
        ring = v[-cols:]
        rv, rf = edge_tube(ring + norm(ring - [0, fit.o[1], ring[0][2]]) * 0.002, 0.0055)
        out.append(piece("cuirass rim", rv, rf, rim, cyl(fit, math.pi), w=CUIRASS))
        out.append(rim_along("cuirass waist rim", v, cols, 0, rim, fit, r=0.0055, w=CUIRASS))
    return out


def fauld(body, mat, lames=2, h=0.045, gap=0.016, box=0.0, rim=None):
    """Hooped lames below the breastplate, each a little wider than the one above."""
    top = body.waist
    fit = torso_fit(body, top - lames * h - 0.08, top + 0.05, TORSO, hard=0.05, box=box)
    out = []
    for k in range(lames):
        lo, hi = top - (k + 1) * h, top - k * h + 0.016
        off = lambda t, a, k=k, lo=lo, hi=hi: gap + 0.005 * k + 0.006 * (hi - t) / (hi - lo)
        v, f, _ = shell(fit, lo, hi, off, rows=3, cols=44)
        w = CUIRASS  # hung from the breastplate: they move with it
        out.append(piece(f"fauld {k + 1}", v, f, mat, cyl(fit, math.pi), w=w, solid=0.0035, sharp=22 if box else 38))
        if rim:
            out.append(rim_along(f"fauld rim {k + 1}", v, 44, 0, rim, fit, r=0.004, w=w))
    return out, top - lames * h


def skirt(body, mat, top, length=0.05, gap=0.024):
    """A hem of mail below the fauld, hung from the breastplate like the fauld."""
    fit = torso_fit(body, top - length - 0.08, top + 0.06, hard=0.04)
    lo = top - length
    off = lambda t, a: gap + 0.03 * max((top - t) / length, 0.0) ** 1.5  # flared: the thighs swing under it
    v, f, _ = shell(fit, lo, top + 0.02, off, rows=5, cols=44)
    return [piece("mail skirt", v, f, mat, cyl(fit, math.pi), w=CUIRASS)]


def tassets(body, mat, top, lames=2, h=0.055, gap=0.036, width=0.4, box=0.0, rim=None):
    """A plate hanging over the front of each thigh from the fauld."""
    fit = torso_fit(body, top - lames * h - 0.1, top + 0.05, hard=0.06, box=box)
    out = []
    for side in "LR":
        ac = 0.48 * sgn(side)
        for k in range(lames):
            lo, hi = top - (k + 1) * h, top - k * h + 0.018
            off = lambda t, a, k=k, lo=lo, hi=hi: gap + 0.004 * k + 0.012 * (hi - t) / (hi - lo)
            v, f, tc = shell(fit, lo, hi, off, rows=3, cols=10, arc=(ac - width, ac + width))
            if rim:
                out.append(rim_along(f"tasset rim {side} {k + 1}", v, tc, 0, rim, fit, r=0.0045,
                                     closed=False, w=CUIRASS))
            out.append(piece(f"tasset {side} {k + 1}", v, f, mat, cyl(fit, math.pi),
                             w=CUIRASS, solid=0.0035))
    return out


def gorget(body, mat, lames=3, gap=0.016):
    """Collar lames round the neck, the lowest lying out over the top of the chest."""
    yn = float(body.head("Neck")[1])
    P = np.vstack([body.pts(body.mask("Neck")), body.heads[body.heads[:, 2] < body.neck + 0.08]])
    base = body.neck - 0.045
    fit = Fit(P, (0, yn, 0), (0, 0, 1), (0, -1, 0), base - 0.05, base + 0.15, nt=30, na=40,
              hard=0.02)
    top = base + 0.032 * (lames - 1) + 0.045
    out = []
    for k in range(lames):
        lo = base + 0.032 * k
        hi = lo + 0.045
        off = lambda t, a, k=k: gap + 0.004 * (lames - 1 - k) + 0.55 * max(top - 0.03 - t, 0)
        v, f, _ = shell(fit, lo, hi, off, rows=3, cols=40)
        s = k / max(lames - 1, 1)
        out.append(piece(f"gorget {k + 1}", v, f, mat, cyl(fit, math.pi),
                         w={"Chest": 0.75 - 0.35 * s, "Neck": 0.25 + 0.35 * s}, solid=0.003))
    return out


def pauldron(body, side, mat, lames=4, gap=0.03, reach=0.07, rim=None, vees=None, box=0.0,
             lame_rims=False, haute=0.0):
    """Shoulder: a domed cop over the point of the shoulder reaching in toward the neck and
    round to the chest and shoulder blade, then lames stepping down the arm."""
    s = sgn(side)
    sh = body.head("UpperArm." + side)
    el = body.head("LowerArm." + side)
    m = (body.V[:, 0] * s > 0.03) & (body.V[:, 2] > body.armpit + 0.02)
    fit = Fit(body.V[m], sh, el - sh, (0, 0, 1), -0.14, 0.14, nt=28, na=36, mirror=(side == "R"),
              hard=0.04, box=box)
    cop = {"Shoulder." + side: 0.45, "UpperArm." + side: 0.55}
    out = []
    lo = lambda a: -reach + 0.035 * (1 - math.cos(a))
    hi = lambda a: 0.03 + 0.03 * math.cos(a)

    def off(t, a):
        q = (t - lo(a)) / (hi(a) - lo(a))
        return gap + 0.016 * math.sin(math.pi * min(max(q, 0), 1)) * math.cos(a / 2.2)
    v, f, cols = shell(fit, lo, hi, off, rows=9, cols=21, arc=(-1.7, 1.7))
    out.append(piece(f"pauldron {side}", v, f, mat, cyl(fit, math.pi), w=cop, solid=0.004, sharp=22 if box else 38))
    out[-1]["fit"] = fit
    if rim:
        out.append(rim_along(f"pauldron rim {side}", v, cols, 8, rim, fit, closed=False, w=cop))
    if haute:  # an upright guard on the cop's neck-side edge
        from ornament import fin
        angs = np.linspace(-1.15, 1.15, 11)
        base = [fit.point(lo(a) + 0.012, a, fit.radius(lo(a) + 0.012, a) + off(lo(a) + 0.012, a) - 0.002)
                for a in angs]
        out.append(fin(f"haute-piece {side}", base, (0, 0, 1),
                       lambda q: haute * math.sin(math.pi * q) ** 0.45, 0.005, mat, cop))
        if rim:
            top = [p + np.array([0, 0, haute * math.sin(math.pi * i / 10) ** 0.45]) for i, p in enumerate(base)]
            rv, rf = edge_tube(np.array(top), 0.004, closed=False)
            out.append(piece(f"haute-piece rim {side}", rv, rf, rim, ("box",), w=cop))
    if vees:
        a, t = 0.5, -0.012
        out.append(vee(f"pauldron {side}", fit.point(t, a, fit.radius(t, a)), fit.dir(a), -fit.ax,
                       0.062, *vees))
    for k in range(1, lames):
        lo_k = lambda a, k=k: 0.035 + 0.026 * (k - 1) + 0.022 * math.cos(a)
        hi_k = lambda a, k=k: lo_k(a) + 0.036
        offk = lambda t, a, k=k: gap - 0.004 * k + 0.002
        v, f, lc = shell(fit, lo_k, hi_k, offk, rows=3, cols=17, arc=(-1.55, 1.55))
        lw = {"Shoulder." + side: 0.3 - 0.08 * k, "UpperArm." + side: 0.7 + 0.08 * k}
        out.append(piece(f"pauldron {side} lame {k}", v, f, mat, cyl(fit, math.pi), w=lw,
                         solid=0.0035, sharp=22 if box else 38))
        if rim and lame_rims:
            out.append(rim_along(f"pauldron {side} lame rim {k}", v, lc, 2, rim, fit, r=0.004,
                                 closed=False, w=lw))
    return out


def rerebrace(body, side, mat, gap=0.026, t0=0.42, t1=0.86, box=0.0, rim=None):
    fit, L = limb_fit(body, "UpperArm", side, (0, 0, 1), hard=0.05, box=box)
    v, f, rc = shell(fit, t0 * L, t1 * L, gap, rows=5, cols=17, arc=(-2.3, 2.3))
    rims = [rim_along(f"rerebrace rim {side} {r}", v, rc, r, rim, fit, r=0.0042, closed=False,
                      w={"UpperArm." + side: 1.0}) for r in (0, 4)] if rim else []
    return rims + [piece(f"rerebrace {side}", v, f, mat, cyl(fit, math.pi), w={"UpperArm." + side: 1.0},
                  solid=0.0035, sharp=22 if box else 38)]


def cuisse(body, side, mat, gap=0.022, t0=0.24, t1=0.86, box=0.0, rim=None):
    fit, L = limb_fit(body, "UpperLeg", side, (0, -1, 0), hard=0.08, box=box)
    off = lambda t, a: gap + 0.006 * math.exp(-(wrap(a) / 0.35) ** 2)
    v, f, cc = shell(fit, t0 * L, t1 * L, off, rows=7, cols=19, arc=(-2.3, 0.95))
    rims = [rim_along(f"cuisse rim {side} {r}", v, cc, r, rim, fit, r=0.0045, closed=False,
                      w={"UpperLeg." + side: 1.0}) for r in (0, 6)] if rim else []
    return rims + [piece(f"cuisse {side}", v, f, mat, cyl(fit, math.pi * 0.6), w={"UpperLeg." + side: 1.0},
                  solid=0.0035, sharp=22 if box else 38)]


def poleyn(body, side, mat, gap=0.026, wing=True, vees=None, rim=None, boss=None):
    """A domed knee cop, a fan-shaped wing on the outside of the knee; `boss` (gold, field)
    sets a rondel on it, `vees` a V."""
    """A domed knee cop, with a fan-shaped wing on the outside of the knee."""
    k = body.head("LowerLeg." + side)
    d = norm(norm(body.tail("UpperLeg." + side) - body.head("UpperLeg." + side)) +
             norm(body.tail("LowerLeg." + side) - k))
    m = body.mask("UpperLeg." + side, "LowerLeg." + side)
    fit = Fit(body.V[m], k, d, (0, -1, 0), -0.14, 0.14, nt=28, na=36, mirror=(side == "R"),
              hard=0.04)
    knee = {"UpperLeg." + side: 0.5, "LowerLeg." + side: 0.5}
    e = lambda a: math.sqrt(max(1 - (a / 1.62) ** 2, 0.08))
    lo, hi = (lambda a: -0.065 * e(a)), (lambda a: 0.06 * e(a))

    def off(t, a):
        q = (t - lo(a)) / (hi(a) - lo(a))
        return gap + 0.018 * math.sin(math.pi * q) * e(a)
    v, f, _ = shell(fit, lo, hi, off, rows=8, cols=15, arc=(-1.55, 1.55))
    out = [piece(f"poleyn {side}", v, f, mat, cyl(fit, math.pi), w=knee, solid=0.004)]
    if rim:
        out.append(rim_along(f"poleyn rim {side}", v, 15, 0, rim, fit, r=0.0045, closed=False, w=knee))
        out.append(rim_along(f"poleyn rim top {side}", v, 15, 7, rim, fit, r=0.0045, closed=False, w=knee))
    if boss:
        out.append(rondel(f"poleyn {side}", fit.point(0.0, 0, fit.radius(0.0, 0)), fit.dir(0), -fit.ax,
                          0.06, *boss))
    out[0]["fit"] = fit
    if vees:
        out.append(vee(f"poleyn {side}", fit.point(0.0, 0, fit.radius(0.0, 0)), fit.dir(0), -fit.ax,
                       0.05, *vees))
    if wing:
        a0, a1 = -1.25, -2.15
        hh = lambda a: 0.008 + 0.045 * (1 - (a - a0) / (a1 - a0)) ** 0.8
        v, f, _ = shell(fit, lambda a: -hh(a), hh, gap + 0.012, rows=5, cols=9, arc=(a1, a0))
        out.append(piece(f"poleyn wing {side}", v, f, mat, cyl(fit, 0.0), w=knee, solid=0.003))
    return out


def greave(body, side, mat, gap=0.018, flare=0.016, ridge=0.006, t0=0.11, rim=None, vees=None,
           box=0.0):
    """A full greave from below the knee to the ankle, flaring over the instep like the
    gauntlet's hourglass cuff."""
    fit, L = limb_fit(body, "LowerLeg", side, (0, -1, 0), hard=0.07, box=box)
    shin = {"LowerLeg." + side: 1.0}
    t1 = float(body.head("LowerLeg." + side)[2]) - 0.115
    off = lambda t, a: gap + ridge * math.exp(-(wrap(a) / 0.3) ** 2) + flare * smooth(
        t, t1 - 0.09, t1)
    v, f, cols = shell(fit, t0 * L, t1, off, rows=10, cols=28)
    out = [piece(f"greave {side}", v, f, mat, cyl(fit, math.pi * 0.5), w=shin, solid=0.0035, sharp=22 if box else 38)]
    out[0]["fit"] = fit
    if rim:
        out.append(rim_along(f"greave rim {side}", v, cols, 0, rim, fit, w=shin))
    if vees:
        t = t0 * L + 0.075
        out.append(vee(f"greave {side}", fit.point(t, 0, fit.radius(t, 0)), fit.dir(0), -fit.ax,
                       0.07, *vees))
    return out


def sabaton(body, side, mat, lames=6, gap=0.012):
    """Lames over the top of the foot from the instep to the toe."""
    fh = body.head("Foot." + side)
    m = body.mask("Foot." + side)
    P = body.V[m]
    o = np.array([fh[0], fh[1], 0.035])
    t = (P - o) @ np.array([0, -1.0, 0])
    tmax = float(t.max())
    fit = Fit(P, o, (0, -1, 0), (0, 0, 1), -0.05, tmax + 0.01, nt=24, na=36, mirror=(side == "R"),
              hard=0.02)
    out = []
    t0, t1 = 0.035, tmax - 0.012
    step = (t1 - t0) / lames
    for k in range(lames):
        lo = t0 + k * step
        offk = lambda t, a, k=k: gap + 0.004 * (lames - k) / lames
        v, f, _ = shell(fit, lo, lo + step * 1.4, offk, rows=3, cols=15, arc=(-1.5, 1.5))
        out.append(piece(f"sabaton {side} {k + 1}", v, f, mat, cyl(fit, math.pi),
                         w={"Foot." + side: 1.0}, solid=0.003))
    return out


# ------------------------------------------------------------------------- the head


def head_fit(body, box=0.0, hard=0.035):
    """Every head of that sex round a vertical axis, as a hard shell: the convex hull of each
    ring, swollen over a few centimetres of height, so a helm is a clean forged skull and not a
    cast of a face (no dip under the nose or the chin)."""
    H = body.heads
    yh = float(np.mean(H[(H[:, 2] > body.eye - 0.05), 1]))
    return Fit(H, (0, yh, 0), (0, 0, 1), (0, -1, 0), body.eye - 0.2, float(H[:, 2].max()) + 0.01,
               box=box, hard=hard,
               nt=30, na=40)


def helm_edge(body, front=0.035, side=-0.03, back=-0.085, face=0.75, ramp=1.35, nasal=0.0):
    """Height of the helm's lower edge round the head: over the brow at the front, down past
    the ears at the sides and to the nape at the back (an open face)."""
    e = body.eye

    def hb(a):
        x = abs(wrap(a))
        if x <= face:
            return e + front - nasal * max(0.0, 1 - x / 0.22)  # the brow dips to a V
        if x <= ramp:
            s = smooth(x, face, ramp)
            return e + front + (side - front) * s
        return e + side + (back - side) * smooth(x, ramp, math.pi)
    return hb


def helm(body, mat, name="helm", edge=None, gap=0.010, rise=0.02, lean=0.0, profile="dome",
         rows=11, rim=None, vees=None, vsize=0.058, vz=0.095, solid=0.004, box=0.0,
         crown_gap=None, tail=0.0, prow=0.0, skull=0.0, pinch=0.0, jaw=0.0, dome_from=0.06):
    """A helm skull: rows from its lower edge (`edge(a)`, a height round the head) up to the
    crown, then closing over it in a smooth dome `rise` high (no apex: a helm reads heroic
    rounded, its height given by a comb, never a point). `crown_gap` lets the skull stand
    further off the scalp at the top than at the brow (padding: the widest point stays at the
    brow); `tail` flares the back of the lower edge out over the nape (a sallet's or a
    burgonet's); `prow` pushes the face forward at the mouth into a ridge (a sparrow-beak
    visor). An edge at the throat all round closes the face."""
    fit = head_fit(body, box)
    hb = edge or helm_edge(body)
    top_z = float(body.heads[:, 2].max())
    crown = top_z - dome_from  # the shell stops here; an elliptical dome closes it
    e = body.eye

    def off(t, a):
        g = gap if crown_gap is None else gap + (crown_gap - gap) * smooth(t, e + 0.02, crown)
        back, front = max(-math.cos(a), 0.0) ** 1.5, max(math.cos(a), 0.0) ** 3
        g += tail * back * (1 - smooth(t, hb(a), hb(a) + 0.07))
        g += prow * front * math.exp(-((t - (e - 0.075)) / 0.03) ** 2)
        g += skull * math.exp(-((t - (e + 0.045)) / 0.05) ** 2)  # widest just above the brow
        g -= pinch * (1 - smooth(t, hb(a), hb(a) + 0.06))       # drawn in at the throat
        g += jaw * max(math.cos(a), 0.0) ** 0.7 * math.exp(-((t - (e - 0.095)) / 0.035) ** 2)  # the bevor
        return g
    v, f, cols = shell(fit, hb, crown, off, rows=rows, cols=40)
    ring = v[-cols:]
    c0 = np.array([fit.o[0], fit.o[1], crown])
    # the dome: a quarter ellipse from the last ring to the top, `crown_gap` (or `gap`) above
    # the tallest scalp plus `rise`
    apex = np.array([0.0, fit.o[1] + lean, top_z + (crown_gap if crown_gap is not None else gap) + rise])
    V = [*v]
    base = len(v) - cols
    steps = (0.25, 0.45, 0.62, 0.76, 0.88, 0.96)
    for s in steps:
        ang = s * math.pi / 2
        z = crown + (apex[2] - crown) * math.sin(ang)
        k = math.cos(ang)
        c = c0 + (apex - c0) * (1 - k)
        for p in ring:
            q = p - c0
            V.append(np.array([c[0] + q[0] * k, c[1] + q[1] * k, z]))
    F = list(f)
    for r in range(len(steps)):
        a0, a1 = base + r * cols, base + (r + 1) * cols
        for i in range(cols):
            j = (i + 1) % cols
            F.append([a0 + i, a0 + j, a1 + j, a1 + i])
    V.append(apex)
    top = len(V) - 1
    last = base + len(steps) * cols
    F += [[last + i, last + (i + 1) % cols, top] for i in range(cols)]
    out = [piece(name, np.array(V), F, mat, cyl(fit, math.pi), w={"Head": 1.0}, solid=solid,
                 group="helm", sharp=24 if box else 38)]
    out[0]["fit"] = fit
    # the skull's profile from the brow over the top to the nape (for a comb or a crest)
    nr = len(V) // cols
    out[0]["profile"] = np.array([V[r * cols] for r in range(nr)] + [apex] +
                                 [V[r * cols + cols // 2] for r in range(nr)][::-1])
    if rim:
        edge_pts = v[:cols]
        c = np.array([fit.o[0], fit.o[1], 0])
        rv, rf = edge_tube(edge_pts + norm((edge_pts - c) * [1, 1, 0]) * 0.002, 0.006)
        out.append(piece(f"{name} rim", rv, rf, rim, cyl(fit, math.pi), w={"Head": 1.0},
                         group="helm"))
    if vees:
        t = body.eye + vz
        out.append(vee(name, fit.point(t, 0, fit.radius(t, 0)), fit.dir(0), (0, 0, 1), vsize,
                       *vees, group="helm"))
    return out


def bascinet(body, mat, rim=None, gap=0.010, rise=0.02, rows=11, nasal=0.0, vees=None):
    """An open-faced bascinet, its skull rounded (as they were from about 1410)."""
    return helm(body, mat, "bascinet", helm_edge(body, nasal=nasal), gap, rise, rows=rows,
                rim=rim, vees=vees, crown_gap=0.028, tail=0.02)


def aventail(body, mat, gap=0.03, chin=0.105, edge=None, name="aventail", bottom=None):
    """Mail hanging from the helm's edge over the neck, rising to cover the chin in front (a
    coif or a cowl, with another helm's `edge`)."""
    hb = edge or helm_edge(body)
    e = body.eye
    P = np.vstack([body.heads, body.pts(body.mask("Neck", "Chest", "Torso"))])
    yh = float(np.mean(body.heads[:, 1]))
    fit = Fit(P, (0, yh, 0), (0, 0, 1), (0, -1, 0), body.neck - 0.1, e + 0.1, nt=30, na=40)
    bottom = body.neck - 0.01 if bottom is None else bottom

    def top(a):
        x = abs(wrap(a))
        return (e - chin) + (hb(a) - 0.008 - (e - chin)) * smooth(x, 0.55, 1.3)
    off = lambda t, a: gap - 0.012 * smooth(t, bottom, top(a))
    v, f, _ = shell(fit, bottom, top, off, rows=7, cols=40)
    lo, hi = bottom, e

    def w(p):
        s = float(smooth(p[2], lo, hi))
        return {"Head": s, "Neck": 1 - s}
    return [piece(name, v, f, mat, cyl(fit, math.pi), w=w, group="helm")]
