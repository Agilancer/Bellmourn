"""Ornament for the armour sets: spikes, horns, fins and crests, scale bands, narrow bands,
gems, a hat's brim and Lord Velscour's sigil. Each returns pieces (pieces.py) or, for the
sigil, an emblem build.py lays onto a built piece.
"""
import math

import numpy as np

from pieces import TAU, Fit, cyl, norm, piece, shell, smooth
from plates import head_fit, wrap


def sigil(target, c, n, up, size, group="armor", boss="hammered_steel_dark", name=None):
    """The V and circle of Lord Velscour, cut from its square (art/velscour/sigil_cut.png):
    a raised dark-iron boss under the medallion, the image laid over it and its points."""
    ring = [(0.455 * math.cos(a), 0.455 * math.sin(a)) for a in np.linspace(0, TAU, 28, endpoint=False)]
    square = [(-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)]
    return dict(kind="emblem", name=name or f"sigil on {target}", target=target, group=group,
                c=np.asarray(c, float), n=norm(n), up=norm(up), size=size,
                layers=[(ring, boss, -0.001, 0.004, {"cuts": 3}),
                        (square, "sigil", 0.0046, 0.0046, {"cuts": 10})])


def on(fit, t, a, off=0.0):
    """The point `off` proud of the fit at (t, a), and the way out there."""
    return fit.point(t, a, fit.radius(t, a) + off), fit.dir(a)


def tube(name, path, r0, r1, mat, w, n=8, group="armor", cap=True):
    """A tapering tube along a path (a horn when r1 is 0)."""
    path = np.asarray(path, float)
    m = len(path)
    V, prev = [], None
    for i in range(m):
        t = norm(path[min(i + 1, m - 1)] - path[max(i - 1, 0)])
        if prev is None:
            ref = np.array([0, 0, 1.0]) if abs(t[2]) < 0.9 else np.array([1.0, 0, 0])
            u = norm(np.cross(t, ref))
        else:
            u = norm(prev - t * np.dot(prev, t))
        prev = u
        wv = np.cross(t, u)
        r = r0 + (r1 - r0) * (i / (m - 1)) ** 1.2
        for k in range(n):
            a = TAU * k / n
            V.append(path[i] + r * (math.cos(a) * u + math.sin(a) * wv))
    F = [[i * n + k, i * n + (k + 1) % n, (i + 1) * n + (k + 1) % n, (i + 1) * n + k]
         for i in range(m - 1) for k in range(n)]
    if cap:
        V.append(path[-1])
        c = len(V) - 1
        F += [[(m - 1) * n + k, (m - 1) * n + (k + 1) % n, c] for k in range(n)]
    V.append(path[0])
    c = len(V) - 1
    F += [[(k + 1) % n, k, c] for k in range(n)]
    return piece(name, np.array(V), F, mat, ("box",), w=w, group=group)


def bezier(p0, p1, p2, p3, m=10):
    p0, p1, p2, p3 = (np.asarray(p, float) for p in (p0, p1, p2, p3))
    t = np.linspace(0, 1, m)[:, None]
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def spike(name, base, out, length, r, mat, w, group="armor", n=6):
    """A cone from base along out."""
    return tube(name, [base, base + norm(out) * length * 0.5, base + norm(out) * length],
                r, 0.0, mat, w, n=n, group=group)


def spikes(fit, at, length, r, mat, w, off=0.0, tilt=0.0, name="spike", group="armor"):
    """Spikes standing off a fitted plate at [(t, a)], tilted along the fit's axis."""
    out = []
    for i, (t, a) in enumerate(at):
        p, d = on(fit, t, a, off - 0.004)
        out.append(spike(f"{name} {i + 1}", p, d + fit.ax * tilt, length, r, mat, w, group))
    return out


def fin(name, base, outward, height, thick, mat, w, teeth=0, group="armor"):
    """A blade standing up from a line of base points along `outward` (one vector or one per
    point): saw-toothed when `teeth`, as a spine or a crest."""
    base = np.asarray(base, float)
    m = len(base)
    outward = np.broadcast_to(np.asarray(outward, float), base.shape)
    top = []
    for i in range(m):
        s = i / (m - 1)
        h = height(s) if callable(height) else height
        if teeth:
            h *= 0.45 + 0.55 * abs(((s * teeth) % 1.0) * 2 - 1) ** 0.6
        top.append(base[i] + norm(outward[i]) * h)
    top = np.array(top)
    V, F = [], []
    for i in range(m):
        tng = norm(base[min(i + 1, m - 1)] - base[max(i - 1, 0)])
        side = norm(np.cross(tng, norm(outward[i]))) * thick / 2
        V += [base[i] + side, top[i] + side, top[i] - side, base[i] - side]
    for i in range(m - 1):
        a, b = 4 * i, 4 * (i + 1)
        F += [[a, b, b + 1, a + 1], [a + 1, b + 1, b + 2, a + 2], [a + 2, b + 2, b + 3, a + 3]]
    F += [[0, 1, 2, 3], [4 * (m - 1) + 3, 4 * (m - 1) + 2, 4 * (m - 1) + 1, 4 * (m - 1)]]
    return piece(name, np.array(V), F, mat, ("box",), w=w, group=group)


def band(fit, name, lo, hi, off, mat, w, arc=None, cols=36, solid=0.003, group="armor", rows=3):
    """A narrow plate or strap round a fit (a belt, a rib, a wrap, a trim)."""
    v, f, _ = shell(fit, lo, hi, off, rows=rows, cols=cols, arc=arc)
    return piece(name, v, f, mat, cyl(fit, math.pi), w=w, solid=solid, group=group)


def scales(fit, name, lo, hi, off, mat, w, teeth=18, depth=0.02, arc=None, solid=0.0025,
           group="armor"):
    """A row of scales: a band whose lower edge is scalloped into `teeth` rounded tongues."""
    def lo_a(a):
        f = (a * teeth / TAU) % 1.0
        return lo - depth * math.sqrt(max(1 - (2 * f - 1) ** 2, 0))
    v, f, _ = shell(fit, lo_a, hi, off, rows=3, cols=teeth * 4, arc=arc)
    return piece(name, v, f, mat, cyl(fit, math.pi), w=w, solid=solid, group=group)


def gem(name, c, n, up, size, mat, w, group="armor"):
    """A cut stone: a flattened octahedron facing n."""
    n, up = norm(n), norm(up)
    rt = np.cross(up, n)
    c = np.asarray(c, float)
    V = [c + up * size, c + rt * size * 0.7, c - up * size, c - rt * size * 0.7,
         c + n * size * 0.55, c - n * size * 0.2]
    F = [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [1, 0, 5], [2, 1, 5], [3, 2, 5], [0, 3, 5]]
    return piece(name, np.array(V), F, mat, ("box",), w=w, group=group)


def brim(body, mat, z, width=0.075, droop=0.035, gap=0.012, name="brim", cols=40):
    """A hat's brim round the head at height z, sloping down to its edge."""
    fit = head_fit(body)
    V = []
    for i, s in enumerate((0.0, 0.5, 1.0)):
        for k in range(cols):
            a = TAU * k / cols
            r = fit.radius(z, a) + gap + width * s
            V.append(fit.point(z - droop * s ** 1.4, a, r))
    F = [[i * cols + k, i * cols + (k + 1) % cols, (i + 1) * cols + (k + 1) % cols,
          (i + 1) * cols + k] for i in range(2) for k in range(cols)]
    return piece(name, np.array(V), F, mat, cyl(fit, math.pi), w={"Head": 1.0}, solid=0.004,
                 group="helm")


def horns(body, mat, root_z, spread=0.11, sweep=(0.10, 0.14, 0.10), r=0.022, curl=0.0,
          name="horn", group="helm", root_off=-0.005):
    """A pair of horns from the temples, sweeping out, back and up (`sweep`: out, back, up)
    and with `curl` turning their tips forward again (a ram's)."""
    fit = head_fit(body)
    out = []
    for s in (1.0, -1.0):
        a = math.pi / 2 if s > 0 else -math.pi / 2
        a += 0.25 * s  # a little behind the temple
        root = fit.point(root_z, a, fit.radius(root_z, a) + root_off)
        o, b, u = sweep
        p1 = root + np.array([s * o * 0.6, b * 0.1, u * 0.5])
        p2 = root + np.array([s * o, b * 0.7, u * 0.9])
        p3 = root + np.array([s * o * (1.1 - curl), b * (1 - curl * 1.4), u * (1 + curl * 0.2)]) + \
            np.array([0, -curl * 0.12, -curl * 0.08])
        out.append(tube(f"{name} {'L' if s > 0 else 'R'}", bezier(root, p1, p2, p3, 12), r, 0.0,
                        mat, {"Head": 1.0}, group=group))
    return out


def strap(target, a, b, n, width, mat, thick=0.004, group="armor", name=None, lift=-0.001):
    """A strap (or bar) from a to b laid over a built piece, `width` wide, raised `thick`."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    size = float(np.linalg.norm(b - a))
    hw = width / size / 2
    poly = [(-hw, -0.5), (hw, -0.5), (hw, 0.5), (-hw, 0.5)]
    return dict(kind="emblem", name=name or f"strap on {target}", target=target, group=group,
                c=(a + b) / 2, n=norm(n), up=norm(b - a), size=size,
                layers=[(poly, mat, lift, thick, {"cuts": 8})])


def crest(body, mat, gap, height=0.04, z0=None, teeth=0, box=0.0, thick=0.008, name="crest",
          lift=0.0):
    """A blade over the top of a helm from the brow to the nape (a comb, a frill, a ridge of
    spikes when `teeth`), `gap` being the helm's own gap so it stands on its surface."""
    fit = head_fit(body, box)
    top = float(body.heads[:, 2].max()) - 0.02
    z0 = body.eye + 0.06 if z0 is None else z0
    pts, outs = [], []
    for a in (0.0, math.pi):
        for t in np.linspace(z0, top, 6):
            pts.append(fit.point(t, a, fit.radius(t, a) + gap - 0.002))
    pts = pts[:6] + pts[6:][::-1]
    c = np.array([fit.o[0], fit.o[1], body.eye])
    pts = np.array(pts)
    pts[5:7, 2] += lift
    outs = [norm(p - c) for p in pts]
    return fin(name, pts, outs, lambda s: height * (0.5 + 0.5 * math.sin(math.pi * s)), thick, mat,
               {"Head": 1.0}, teeth=teeth, group="helm")
