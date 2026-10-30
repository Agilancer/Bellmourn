"""Procedural pieces for the foes, added to the body after it is rigged.

Every builder returns a `Piece`: vertices (metres, Blender axes: +X the creature's left, -Y
forward, +Z up), quad/tri faces, per-vertex bone weights (the 20-bone rig's names) and a part
name per face, which paint.py turns into a material. Shells (armour, capes, robes, hats) are
fitted to the body by measuring it: `Fit` bins the body's vertices around an axis and returns
the outermost radius in each direction, so a plate sits just proud of whatever it covers.
"""
import math

import numpy as np


def norm(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.where(n < 1e-12, 1, n)


def frame(axis):
    """Two unit vectors perpendicular to axis (and to each other)."""
    a = norm(axis)
    ref = np.array([0.0, 0.0, 1.0]) if abs(a[2]) < 0.9 else np.array([0.0, -1.0, 0.0])
    u = norm(np.cross(ref, a))
    return u, np.cross(a, u)


class Piece:
    def __init__(self):
        self.v, self.f, self.w, self.part = [], [], [], []

    def add(self, verts, faces, weights, part):
        o = len(self.v)
        self.v += [tuple(map(float, p)) for p in verts]
        if callable(weights):
            self.w += [weights(np.asarray(p)) for p in verts]
        elif isinstance(weights, dict):
            self.w += [dict(weights) for _ in verts]
        else:
            self.w += list(weights)
        for fc in faces:
            self.f.append([o + i for i in fc])
            self.part.append(part)
        return self

    def extend(self, other):
        o = len(self.v)
        self.v += other.v
        self.w += other.w
        self.f += [[o + i for i in fc] for fc in other.f]
        self.part += other.part
        return self


def grid_faces(rows, cols, wrap=True, flip=False):
    out = []
    cc = cols if wrap else cols - 1
    for r in range(rows - 1):
        for c in range(cc):
            a, b = r * cols + c, r * cols + (c + 1) % cols
            q = [a, b, b + cols, a + cols]
            out.append(q[::-1] if flip else q)
    return out


def tube(path, radii, n=8, cap_end=True, cap_start=False, squash=1.0, up=None):
    """A tube swept along `path` (points) with a radius per point; tips with radius 0 close."""
    path = np.asarray(path, float)
    m = len(path)
    verts = []
    prev_u = None
    for i in range(m):
        t = path[min(i + 1, m - 1)] - path[max(i - 1, 0)]
        u, w = frame(t)
        if up is not None:
            u = norm(np.cross(norm(t), up))
            w = np.cross(norm(t), u)
        elif prev_u is not None:                      # keep the rings from twisting
            u = norm(prev_u - norm(t) * np.dot(prev_u, norm(t)))
            w = np.cross(norm(t), u)
        prev_u = u
        for k in range(n):
            a = 2 * math.pi * k / n
            verts.append(path[i] + radii[i] * (math.cos(a) * u + squash * math.sin(a) * w))
    faces = grid_faces(m, n)
    if cap_end:
        verts.append(path[-1] + (path[-1] - path[-2]) * 0.0)
        c = len(verts) - 1
        faces += [[(m - 1) * n + k, (m - 1) * n + (k + 1) % n, c] for k in range(n)]
    if cap_start:
        verts.append(path[0])
        c = len(verts) - 1
        faces += [[(k + 1) % n, k, c] for k in range(n)]
    return np.array(verts), faces


def lathe(profile, centre, n=16, axis=(0, 0, 1), start=0.0, sweep=2 * math.pi, squash=(1.0, 1.0)):
    """Surface of revolution: profile is [(r, h), ...] from the bottom; squash scales the two
    perpendicular directions (an oval helm). Closes the top if its radius is 0."""
    axis = norm(axis)
    u, w = frame(axis)
    full = abs(sweep - 2 * math.pi) < 1e-6
    cols = n if full else n + 1
    verts = []
    for r, h in profile:
        for k in range(cols):
            a = start + sweep * k / n
            verts.append(np.asarray(centre) + axis * h + r * (math.cos(a) * squash[0] * u + math.sin(a) * squash[1] * w))
    faces = grid_faces(len(profile), cols, wrap=full)
    return np.array(verts), faces


def cone(base, tip, r, n=6):
    base, tip = np.asarray(base, float), np.asarray(tip, float)
    u, w = frame(tip - base)
    verts = [base + r * (math.cos(2 * math.pi * k / n) * u + math.sin(2 * math.pi * k / n) * w) for k in range(n)]
    verts += [tip, base]
    faces = [[k, (k + 1) % n, n] for k in range(n)] + [[(k + 1) % n, k, n + 1] for k in range(n)]
    return np.array(verts), faces


def sphere(c, r, nu=8, nv=6, scale=(1, 1, 1)):
    verts = []
    for i in range(1, nv):
        th = math.pi * i / nv
        for k in range(nu):
            ph = 2 * math.pi * k / nu
            verts.append([math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)])
    verts = np.array(verts) * r * np.array(scale) + c
    top, bot = len(verts), len(verts) + 1
    verts = np.vstack([verts, np.asarray(c) + [0, 0, r * scale[2]], np.asarray(c) - [0, 0, r * scale[2]]])
    faces = grid_faces(nv - 1, nu)
    faces = [f[::-1] for f in faces]
    faces += [[k, (k + 1) % nu, top][::-1] for k in range(nu)]
    o = (nv - 2) * nu
    faces += [[o + (k + 1) % nu, o + k, bot][::-1] for k in range(nu)]
    return verts, faces


def bezier(p0, p1, p2, p3, m=10):
    t = np.linspace(0, 1, m)[:, None]
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


class Fit:
    """The body's outer surface measured around an axis: radius(t, angle)."""

    def __init__(self, P, origin, axis, t0, t1, nt=24, na=24, mask=None, pct=100):
        self.o, self.ax = np.asarray(origin, float), norm(axis)
        self.u, self.w = frame(self.ax)
        self.t0, self.t1, self.nt, self.na = t0, t1, nt, na
        Q = P if mask is None else P[mask]
        d = Q - self.o
        t = d @ self.ax
        x, y = d @ self.u, d @ self.w
        a = np.mod(np.arctan2(y, x), 2 * math.pi)
        r = np.hypot(x, y)
        R = np.zeros((nt, na))
        ti = np.clip(((t - t0) / (t1 - t0) * nt).astype(int), -1, nt)
        ai = (a / (2 * math.pi) * na).astype(int) % na
        ok = (ti >= 0) & (ti < nt)
        for i, k, rr in zip(ti[ok], ai[ok], r[ok]):
            if rr > R[i, k]:
                R[i, k] = rr
        # fill empty bins from their neighbours, then smooth
        for _ in range(8):
            z = R == 0
            if not z.any():
                break
            nb = (np.roll(R, 1, 1) + np.roll(R, -1, 1) + np.roll(R, 1, 0) + np.roll(R, -1, 0))
            cnt = ((np.roll(R, 1, 1) > 0).astype(int) + (np.roll(R, -1, 1) > 0) + (np.roll(R, 1, 0) > 0) + (np.roll(R, -1, 0) > 0))
            R[z] = np.where(cnt[z] > 0, nb[z] / np.maximum(cnt[z], 1), 0)
        for _ in range(2):
            R = 0.5 * R + 0.25 * (np.roll(R, 1, 1) + np.roll(R, -1, 1))
            R[1:-1] = 0.5 * R[1:-1] + 0.25 * (R[:-2] + R[2:])
        self.R = R

    def radius(self, t, a):
        ft = np.clip((t - self.t0) / (self.t1 - self.t0) * self.nt - 0.5, 0, self.nt - 1)
        fa = np.mod(a / (2 * math.pi) * self.na - 0.5, self.na)
        i0, k0 = int(ft), int(fa)
        i1, k1 = min(i0 + 1, self.nt - 1), (k0 + 1) % self.na
        s, q = ft - i0, fa - k0
        return ((1 - s) * ((1 - q) * self.R[i0, k0] + q * self.R[i0, k1]) +
                s * ((1 - q) * self.R[i1, k0] + q * self.R[i1, k1]))

    def point(self, t, a, r):
        return self.o + self.ax * t + r * (math.cos(a) * self.u + math.sin(a) * self.w)

    def shell(self, ts, na, offset, top=None, keep=None):
        """A tube of rings at heights ts, `offset` proud of the body (a number or f(t, a));
        top(a) optionally lowers the last ring per angle; keep(a) -> False leaves a gap."""
        verts, rows = [], len(ts)
        for i, t in enumerate(ts):
            for k in range(na):
                a = 2 * math.pi * k / na
                tt = t
                if top is not None and i == rows - 1:
                    tt = min(t, top(a))
                off = offset(tt, a) if callable(offset) else offset
                verts.append(self.point(tt, a, self.radius(tt, a) + off))
        faces = grid_faces(rows, na)
        if keep is not None:
            faces = [f for j, f in enumerate(faces) if keep(2 * math.pi * ((j % na) + 0.5) / na)]
        return np.array(verts), faces


# ------------------------------------------------------------------ weights

def lerp_w(a, b, k):
    """Blend two weight dicts."""
    out = {}
    for n, x in a.items():
        out[n] = out.get(n, 0) + x * (1 - k)
    for n, x in b.items():
        out[n] = out.get(n, 0) + x * k
    return {n: x for n, x in out.items() if x > 1e-4}


def side_leg(p, bone, mid=0.03):
    """Weights to the leg on p's side (blended across the middle)."""
    k = np.clip((p[0] + mid) / (2 * mid), 0, 1)
    return lerp_w({f"{bone}.R": 1.0}, {f"{bone}.L": 1.0}, k)
