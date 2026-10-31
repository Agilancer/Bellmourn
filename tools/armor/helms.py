"""Helms, after the historical forms that read heroic in games: rounded skulls (an ellipsoid
widest at the brow, its crown standing off the scalp for padding, never a point), height
from a comb running front to back, a brow ridge shading the eye slit, a visor projecting
at the mouth, a throat pinched in above the gorget, a tail flaring over the nape, and rolled
rims on every edge. Horns and wings follow the skull's curve instead of rising beside it.

Every function returns pieces (pieces.py) or emblems, all riding the head.
"""
import math

import numpy as np

import ornament as O
from pieces import TAU, norm, piece, shell, smooth
from plates import head_fit, helm, helm_edge, rim_along, vee

HEAD = {"Head": 1.0}


def closed(body, throat=0.165):
    """A lower edge closing the face, pinched in at the throat."""
    e = body.eye
    return lambda a: e - throat


def slit(body, name, dark, ridge, gap, width=0.85, h=0.024, box=0.0, brow=True):
    """An eye slit across the visor at the eyes, and a raised brow ridge over it."""
    hf = head_fit(body, box)
    e = body.eye
    l_, n = O.on(hf, e, -width, gap)
    r_, _ = O.on(hf, e, width, gap)
    out = [O.strap(name, l_, r_, (0, -1, 0), h, dark, thick=0.0015, group="helm", name="eye slit")]
    if brow:
        up = np.array([0.0, 0.0, h * 0.5 + 0.011])
        out.append(O.strap(name, l_ + up, r_ + up, (0, -1, 0), 0.017, ridge, thick=0.009,
                           group="helm", name="brow ridge"))
    return out


def cheeks(body, mat, gap, rim=None, box=0.0, lo=None, hi=None, name="cheek plate"):
    """Cheek plates hanging from the skull's sides, not meeting at the chin (a burgonet's)."""
    hf = head_fit(body, box)
    e = body.eye
    lo = e - 0.115 if lo is None else lo
    hi = e + 0.0 if hi is None else hi
    out = []
    for s in (1, -1):
        arc = (0.72, 1.85) if s > 0 else (-1.85, -0.72)
        v, f, cols = shell(hf, lo, hi, gap + 0.008, rows=4, cols=9, arc=arc)
        out.append(piece(f"{name} {'L' if s > 0 else 'R'}", v, f, mat, ("cyl", hf.o.tolist(),
                         hf.ax.tolist(), hf.dir(math.pi).tolist()), w=HEAD, solid=0.004, group="helm"))
        if rim:
            out.append(rim_along(f"{name} rim {s}", v, cols, 0, rim, hf, r=0.0045, closed=False, w=HEAD))
            out[-1]["group"] = "helm"
    return out


def peak(body, mat, z, gap, width=0.055, droop=0.012, arc=1.0, box=0.0, name="peak"):
    """A peak jutting over the eyes (a burgonet's or a morion's front brim)."""
    hf = head_fit(body, box)
    V, rows = [], 3
    angs = np.linspace(-arc, arc, 17)
    for i, s in enumerate((0.0, 0.5, 1.0)):
        for a in angs:
            wa = width * math.cos(a / arc * math.pi / 2) ** 0.7
            r = hf.radius(z, a) + gap + wa * s
            V.append(hf.point(z - droop * s, a, r))
    n = len(angs)
    F = [[i * n + k, i * n + k + 1, (i + 1) * n + k + 1, (i + 1) * n + k]
         for i in range(rows - 1) for k in range(n - 1)]
    return piece(name, np.array(V), F, mat, ("cyl", hf.o.tolist(), hf.ax.tolist(),
                 hf.dir(math.pi).tolist()), w=HEAD, solid=0.004, group="helm")


def wings(body, mat, gap, box=0.0, size=0.09, feathers=5, name="wing"):
    """A pair of wings swept back along the sides of the skull (a holy crest)."""
    hf = head_fit(body, box)
    e = body.eye
    out = []
    for s in (1, -1):
        angs = np.linspace(1.2, 2.5, 11) * s
        ts = np.linspace(e + 0.03, e + 0.075, 11)
        base = [hf.point(t, a, hf.radius(t, a) + gap + 0.01) for t, a in zip(ts, angs)]
        outw = [norm(hf.dir(a) * 0.9 + np.array([0, 0.25, 0.75])) for a in angs]
        out.append(O.fin(f"{name} {'L' if s > 0 else 'R'}", base, outw,
                         lambda q: size * (0.25 + 0.75 * q ** 0.8), 0.006, mat, HEAD,
                         teeth=feathers, group="helm"))
    return out


def comb(skull, mat, height, z0, teeth=0, thick=0.007, name="comb"):
    """A keel-shaped comb along a helm skull's profile (its piece's "profile"), from height z0
    at the brow over the top to z0 at the nape."""
    prof = np.asarray(skull["profile"], float)
    pts = prof[prof[:, 2] >= z0]
    c = np.array([pts[:, 0].mean(), pts[:, 1].mean(), z0 - 0.08])
    outs = [norm(p - c) for p in pts]
    return O.fin(name, pts - np.array(outs) * 0.002, outs,
                 lambda s: height * (0.35 + 0.65 * math.sin(math.pi * s)), thick, mat, HEAD,
                 teeth=teeth, group="helm")


def visor_ridge(body, name, mat, gap, box=0.0, width=0.8):
    """The ridge where the visor projects at the mouth, and breaths cut in its right cheek."""
    hf = head_fit(body, box)
    e = body.eye
    l_, _ = O.on(hf, e - 0.075, -width, gap)
    r_, _ = O.on(hf, e - 0.075, width, gap)
    return [O.strap(name, l_, r_, (0, -1, 0), 0.012, mat, thick=0.012, group="helm", name="visor ridge")]


def breaths(body, name, dark, gap, box=0.0, n=4):
    """Breathing slots on the right of the visor."""
    hf = head_fit(body, box)
    e = body.eye
    out = []
    for i in range(n):
        a = -0.35 - 0.12 * i
        top_, d = O.on(hf, e - 0.04, a, gap)
        bot_, _ = O.on(hf, e - 0.065, a, gap)
        out.append(O.strap(name, top_, bot_, d, 0.009, dark, thick=0.0015, group="helm",
                           name=f"breath {i + 1}"))
    return out


def swept_horns(body, mat, r=0.03, back=0.2, out=0.07, up=0.07, curl=0.25, name="horn",
                root_off=0.03, z=0.065):
    """Horns from the temples, rooted on the helm's surface (`root_off` out from the head),
    sweeping back along the skull's curve."""
    return O.horns(body, mat, body.eye + z, sweep=(out, back, up), r=r, curl=curl, name=name,
                   root_off=root_off)


# ------------------------------------------------------------------ the forms


def armet(body, mat, rim, dark, comb_h=0.018, gap=0.016, crown_gap=0.022, vees=None, box=0.0,
          name="armet"):
    """A close helm (armet): a rounded skull with a low comb, the face closed by a visor that
    projects at the mouth, its eye slit shaded by a brow ridge, a tail over the nape."""
    out = helm(body, mat, name, closed(body), gap=gap, rise=0.006, rim=rim, crown_gap=crown_gap,
               tail=0.03, prow=0.04, skull=0.014, pinch=0.01, jaw=0.022, box=box)
    out += slit(body, name, dark, rim, gap, box=box)
    out += visor_ridge(body, name, rim, gap + 0.04, box=box)
    out += breaths(body, name, dark, gap + 0.03, box=box)
    if comb_h:
        out.append(comb(out[0], rim, comb_h, body.eye + 0.06))
    if vees:
        hf = head_fit(body, box)
        out.append(vee(name, *O.on(hf, body.eye + 0.07, 0.0), (0, 0, 1), 0.05, *vees, group="helm"))
    return out


def burgonet(body, mat, rim, comb_h=0.06, gap=0.016, crown_gap=0.03, vees=None, box=0.0,
             teeth=0, comb_mat=None, name="burgonet"):
    """An open burgonet: a rounded skull, a tall comb, a peak over the eyes, cheek plates and
    a tail flaring over the nape."""
    e = body.eye
    edge = helm_edge(body, front=0.04, side=0.0, back=-0.1, face=0.7, ramp=1.3)
    out = helm(body, mat, name, edge, gap=gap, rise=0.022, rim=rim, crown_gap=crown_gap, tail=0.05,
               box=box)
    out.append(peak(body, mat, e + 0.04, gap, box=box))
    out += cheeks(body, mat, gap, rim, box=box)
    out.append(comb(out[0], comb_mat or mat, comb_h, e + 0.03, teeth=teeth))
    if vees:
        hf = head_fit(body, box)
        out.append(vee(name, *O.on(hf, e + 0.085, 0.0), (0, 0, 1), 0.045, *vees, group="helm"))
    return out


def barbute(body, mat, rim, dark, gap=0.016, crown_gap=0.022, vees=None, box=0.0, name="barbute"):
    """A barbute: a rounded skull closing round the face but for a T: an eye slit and a slot
    down to the chin, edged with a raised rim."""
    e = body.eye
    out = helm(body, mat, name, closed(body), gap=gap, rise=0.008, rim=rim, crown_gap=crown_gap,
               tail=0.03, skull=0.014, pinch=0.01, jaw=0.02, box=box)
    out += slit(body, name, dark, rim, gap, width=0.62, h=0.028, box=box)
    hf = head_fit(body, box)
    top_, n = O.on(hf, e - 0.01, 0.0, gap)
    bot_, _ = O.on(hf, e - 0.14, 0.0, gap)
    out.append(O.strap(name, top_, bot_, n, 0.05, rim, thick=0.004, group="helm", name="T rim"))
    out.append(O.strap(name, top_, bot_, n, 0.032, dark, thick=0.005, group="helm", name="T slot"))
    if vees:
        out.append(vee(name, *O.on(hf, e + 0.075, 0.0), (0, 0, 1), 0.05, *vees, group="helm"))
    return out


def great_helm(body, mat, rim, gap=0.022, crown_gap=0.02, box=4.0, name="great helm"):
    """A great helm: closed, broad, a low dome on a nearly flat crown (never a point)."""
    return helm(body, mat, name, closed(body, 0.155), gap=gap, rise=0.0, rim=rim,
                crown_gap=crown_gap, tail=0.012, skull=0.018, pinch=0.004, jaw=0.014, box=box,
                dome_from=0.025)


def nasal_helm(body, mat, rim, nasal_mat, gap=0.024, crown_gap=0.034, vees=None, name="nasal helm"):
    """An open rounded helm with a brow band and a nasal (a Norman helm, its skull rounded)."""
    e = body.eye
    edge = helm_edge(body, front=0.035, side=0.015, back=-0.03, face=1.0, ramp=1.7)
    out = helm(body, mat, name, edge, gap=gap, rise=0.024, rim=rim, crown_gap=crown_gap, tail=0.015,
               vees=vees, vsize=0.05, vz=0.08)
    hf = head_fit(body)
    top_, d = O.on(hf, e + 0.05, 0.0, gap)
    bot_, _ = O.on(hf, e - 0.045, 0.0, gap - 0.004)
    out.append(O.tube("nasal", [top_, (top_ + bot_) / 2 - d * 0.004, bot_], 0.011, 0.008, nasal_mat,
                      HEAD, group="helm"))
    return out
