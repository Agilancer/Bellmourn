"""Armour pieces fitted to a villager's body (numpy only; build.py turns them into meshes).

Blender axes: +X the villager's left, -Y forward, +Z up; the bind pose is a T-pose. `Body`
holds the under-layer's bind-pose vertices with the bone that carries most of each, the bone
heads and tails, and the point cloud of every head of that sex (for the helm). A `Fit` measures
the body round an axis: the outermost radius per height and angle, so a plate sits a set gap
proud of whatever it covers. Angle 0 is the fit's `ref` direction and angle pi/2 the side
`axis x ref` (mirrored on the right, so pi/2 is the same side, front or inner, on both).

A piece is a dict: name, v (n, 3), f (faces), mat (swatch id), uv (how build.py unwraps it),
w ('body' to take the body's weights where it lies, or {bone: weight}, or a function of the
vertex), solid (plate thickness; 0 for single-sided mail and cloth) and group ('armor' or
'helm').
"""
import math

import numpy as np

TAU = 2 * math.pi


def norm(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.where(n < 1e-12, 1, n)


def smooth(x, a, b):
    s = np.clip((x - a) / (b - a), 0, 1)
    return s * s * (3 - 2 * s)


def ring_hull(r):
    """Radii round a ring (bin centres) pushed out to their convex hull."""
    na = len(r)
    a = (np.arange(na) + 0.5) / na * TAU
    P = np.stack([r * np.cos(a), r * np.sin(a)], 1)
    pts = sorted(map(tuple, P))

    def cross(o, p, q):
        return (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    H = np.array(lower[:-1] + upper[:-1])
    out = r.copy()
    for k in range(na):
        d = np.array([math.cos(a[k]), math.sin(a[k])])
        best = r[k]
        for i in range(len(H)):
            p, q = H[i], H[(i + 1) % len(H)]
            e = q - p
            den = d[0] * (-e[1]) - d[1] * (-e[0])
            if abs(den) < 1e-12:
                continue
            s = (p[0] * (-e[1]) - p[1] * (-e[0])) / den
            u = (d[0] * p[1] - d[1] * p[0]) / den
            if s > 0 and -1e-9 <= u <= 1 + 1e-9:
                best = max(best, s)
        out[k] = best
    return out


def ring_box(r, n):
    """Radii round a ring pushed out to the superellipse of exponent n through its extents
    (front, back and each side measured apart)."""
    na = len(r)
    a = (np.arange(na) + 0.5) / na * TAU
    x, y = r * np.cos(a), r * np.sin(a)
    xp, xn = max(x.max(), 1e-3), max(-x.min(), 1e-3)
    yp, yn = max(y.max(), 1e-3), max(-y.min(), 1e-3)
    c, s = np.cos(a), np.sin(a)
    A = np.where(c >= 0, xp, xn)
    B = np.where(s >= 0, yp, yn)
    rs = ((np.abs(c) / A) ** n + (np.abs(s) / B) ** n) ** (-1.0 / n)
    return np.maximum(r, rs)


class Fit:
    """The body's outer surface round an axis: radius(t, angle)."""

    def __init__(self, P, origin, axis, ref, t0, t1, nt=24, na=32, mirror=False, floor=0.02,
                 hard=0.0, box=0.0):
        """hard (metres) makes it a shell, not a skin: the radius is the largest within that
        distance along the axis, each ring is its convex hull (no dips at the waist, between
        the breasts or down the spine), and the result is smoothed. box (a superellipse
        exponent, 3 to 8) squares each ring off round its front, back and side extents: flat
        faces and square shoulders, a forged plate rather than a rounded one."""
        self.o, self.ax = np.asarray(origin, float), norm(axis)
        self.u = norm(np.asarray(ref, float) - self.ax * np.dot(ref, self.ax))
        self.w = np.cross(self.ax, self.u) * (-1 if mirror else 1)
        self.t0, self.t1, self.nt, self.na = t0, t1, nt, na
        d = np.asarray(P, float) - self.o
        t = d @ self.ax
        x, y = d @ self.u, d @ self.w
        a = np.mod(np.arctan2(y, x), TAU)
        r = np.hypot(x, y)
        R = np.zeros((nt, na))
        ti = np.floor((t - t0) / (t1 - t0) * nt).astype(int)
        ai = (a / TAU * na).astype(int) % na
        ok = (ti >= 0) & (ti < nt)
        np.maximum.at(R, (ti[ok], ai[ok]), r[ok])
        for _ in range(12):  # empty bins from their neighbours
            z = R == 0
            if not z.any():
                break
            Rp = np.pad(R, ((1, 1), (0, 0)), mode="edge")
            nb = [np.roll(R, 1, 1), np.roll(R, -1, 1), Rp[:-2], Rp[2:]]
            s = sum(nb)
            c = sum((q > 0).astype(int) for q in nb)
            R[z] = np.where(c[z] > 0, s[z] / np.maximum(c[z], 1), 0)
        R = np.maximum(R, floor)
        passes = 2
        if hard:
            k = max(1, int(round(hard / ((t1 - t0) / nt))))
            Rp = np.pad(R, ((k, k), (0, 0)), mode="edge")
            R = np.max([Rp[i:i + nt] for i in range(2 * k + 1)], axis=0)
            R = np.array([ring_hull(row) for row in R])
            passes = 4
        for _ in range(passes):
            R = 0.5 * R + 0.25 * (np.roll(R, 1, 1) + np.roll(R, -1, 1))
            R[1:-1] = 0.5 * R[1:-1] + 0.25 * (R[:-2] + R[2:])
        if hard:
            R = np.array([ring_hull(row) for row in R])
        if box:
            R = np.array([ring_box(row, box) for row in R])
        self.R = R

    def radius(self, t, a):
        ft = np.clip((t - self.t0) / (self.t1 - self.t0) * self.nt - 0.5, 0, self.nt - 1)
        fa = np.mod(a / TAU * self.na - 0.5, self.na)
        i0, k0 = int(ft), int(fa)
        i1, k1 = min(i0 + 1, self.nt - 1), (k0 + 1) % self.na
        s, q = ft - i0, fa - k0
        return ((1 - s) * ((1 - q) * self.R[i0, k0] + q * self.R[i0, k1]) +
                s * ((1 - q) * self.R[i1, k0] + q * self.R[i1, k1]))

    def dir(self, a):
        return math.cos(a) * self.u + math.sin(a) * self.w

    def point(self, t, a, r):
        return self.o + self.ax * t + r * self.dir(a)


def grid(rows, cols, wrap):
    out = []
    cc = cols if wrap else cols - 1
    for r in range(rows - 1):
        for c in range(cc):
            a, b = r * cols + c, r * cols + (c + 1) % cols
            out.append([a, b, b + cols, a + cols])
    return out


def shell(fit, lo, hi, off, rows=8, cols=32, arc=None, rmax=None):
    """A band round fit's axis: per angle a, from t=lo(a) to hi(a), off(t, a) proud of the
    body. arc=(a0, a1) makes a partial band with clean edges; rmax caps the radius."""
    lo = lo if callable(lo) else (lambda a, x=lo: x)
    hi = hi if callable(hi) else (lambda a, x=hi: x)
    off = off if callable(off) else (lambda t, a, x=off: x)
    if arc is None:
        angs = [TAU * k / cols for k in range(cols)]
    else:
        angs = list(np.linspace(arc[0], arc[1], cols))
    V = []
    for i in range(rows):
        for a in angs:
            t = lo(a) + (hi(a) - lo(a)) * i / (rows - 1)
            r = fit.radius(t, a) + off(t, a)
            if rmax is not None:
                r = min(r, rmax(t, a) if callable(rmax) else rmax)
            V.append(fit.point(t, a, r))
    return np.array(V), grid(rows, len(angs), arc is None), len(angs)


def edge_tube(ring, r, n=6, closed=True):
    """A rolled edge: a thin tube along a ring of points."""
    ring = np.asarray(ring, float)
    m = len(ring)
    V = []
    for i in range(m):
        t = norm(ring[(i + 1) % m] - ring[i - 1]) if closed else norm(
            ring[min(i + 1, m - 1)] - ring[max(i - 1, 0)])
        u = norm(np.cross(t, [0.0, 0.0, 1.0]) if abs(t[2]) < 0.9 else np.cross(t, [1.0, 0, 0]))
        w = np.cross(t, u)
        for k in range(n):
            a = TAU * k / n
            V.append(ring[i] + r * (math.cos(a) * u + math.sin(a) * w))
    F = []
    for i in range(m if closed else m - 1):
        j = (i + 1) % m
        for k in range(n):
            F.append([i * n + k, i * n + (k + 1) % n, j * n + (k + 1) % n, j * n + k])
    return np.array(V), F


class Body:
    """The under-layer (bind pose) and the skeleton, measured."""

    def __init__(self, V, labels, bones, heads, eyes):
        self.V, self.lab = np.asarray(V, float), np.asarray(labels)
        self.bones = {k: (np.asarray(h, float), np.asarray(t, float)) for k, (h, t) in bones.items()}
        self.heads, self.eyes = np.asarray(heads, float), np.asarray(eyes, float)

    def head(self, n):
        return self.bones[n][0]

    def tail(self, n):
        return self.bones[n][1]

    def mask(self, *names, side=None):
        m = np.zeros(len(self.V), bool)
        for n in names:
            m |= np.char.startswith(self.lab.astype(str), n)
        if side is not None:
            m &= self.V[:, 0] * (1 if side == "L" else -1) > 0
        return m

    def pts(self, mask):
        return self.V[mask]

    # landmarks (bind-pose heights)
    @property
    def waist(self):
        """The natural waist, where a breastplate ends: 40% up the abdomen bone."""
        a, t = self.head("Abdomen")[2], self.head("Torso")[2]
        return float(a + 0.4 * (t - a))

    @property
    def neck(self):
        return float(self.head("Neck")[2])

    @property
    def armpit(self):
        return float(self.head("UpperArm.L")[2]) - 0.075

    @property
    def eye(self):
        return float(self.eyes[2])


def sgn(side):
    return 1.0 if side == "L" else -1.0


def limb_fit(body, bone, side, ref, t0=-0.05, t1=1.05, names=None, extra=None, nt=20, hard=0.0,
             box=0.0):
    """A fit round one limb bone, t in metres from its head."""
    h, tl = body.head(bone + "." + side), body.tail(bone + "." + side)
    L = float(np.linalg.norm(tl - h))
    m = body.mask(*(names or (bone + "." + side,)))
    P = body.pts(m)
    if extra is not None:
        P = np.vstack([P, extra])
    return Fit(P, h, tl - h, ref, t0 * L, t1 * L, nt=nt, mirror=(side == "R"), hard=hard,
               box=box), L


def piece(name, v, f, mat, uv, w="body", solid=0.0, group="armor", sharp=38):
    """`sharp`: the angle (degrees) past which an edge shades hard (lower for crisper facets)."""
    return dict(name=name, v=np.asarray(v, float), f=f, mat=mat, uv=uv, w=w, solid=solid,
                group=group, sharp=sharp)


def cyl(fit, seam):
    """Unwrap round fit's axis with the seam at angle `seam`."""
    return ("cyl", fit.o.tolist(), fit.ax.tolist(), fit.dir(seam).tolist())
