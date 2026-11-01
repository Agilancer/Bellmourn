"""Modelled pieces of a beast man (horns, ears, beard, tail), each mapped onto its painted island.

make(species, finish, tube, log) -> list of objects; build.py joins them to the body. Part ids
(the "part" attribute): 6 fur and skin pieces, 7 horn.
"""
import math

import bmesh
import numpy as np
from mathutils import Vector

import sdf
import uvmap


def _frame(a):
    a = np.asarray(a, float); a /= np.linalg.norm(a)
    e1 = np.array([0, 0, 1.0]) - a[2] * a; e1 /= np.linalg.norm(e1)
    e2 = np.cross(e1, a)                      # 90 deg on from "up" = behind
    return a, e1, e2


def horn_path(side, n=120):
    """A ram's horn: up off the boss, back over the ear, down behind it and forward beneath it,
    the tip turning up and out beside the cheek; the coil drifts outward as it goes."""
    a, e1, e2 = _frame((1.0, -0.3, -0.22))
    phi = np.radians(np.linspace(-28, 318, n))
    t = (phi - phi[0]) / (phi[-1] - phi[0])
    S = sdf.HEAD_S                                                    # grown with the head
    r = (0.072 - 0.032 * t) * S
    lat = (0.074 * (1 - np.exp(-t / 0.1)) + 0.06 * t) * S
    B = np.array(sdf.HORN_BOSS) + np.array([-0.006, 0.0, -0.01]) * S  # rooted inside the boss
    C = B - r[0] * (np.cos(phi[0]) * e1 + np.sin(phi[0]) * e2)
    P = C + r[:, None] * (np.cos(phi)[:, None] * e1 + np.sin(phi)[:, None] * e2) + lat[:, None] * a
    rad = (0.035 * (1 - t) ** 0.8 + 0.0025) * S
    P[:, 0] *= side
    return P, rad, t


def _project(Q, C):
    """Length fraction along a polyline and angle round it for each point."""
    seglen = np.linalg.norm(np.diff(C, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seglen)]) / seglen.sum()
    best = np.full(len(Q), 1e9); t = np.zeros(len(Q)); ang = np.zeros(len(Q))
    for j in range(len(C) - 1):
        p0, ab = C[j], C[j + 1] - C[j]
        s_ = np.clip(((Q - p0) @ ab) / (ab @ ab), 0, 1)
        c = p0 + s_[:, None] * ab
        dd = np.linalg.norm(Q - c, axis=1)
        tg = ab / np.linalg.norm(ab)
        ref = np.array([0, 0, 1.0]) - tg[2] * tg
        ref /= np.linalg.norm(ref) + 1e-9
        r = Q - c
        an = np.arctan2((r * np.cross(tg, ref)).sum(1), (r * ref).sum(1))
        sel = dd < best
        best = np.where(sel, dd, best); t = np.where(sel, cum[j] + s_ * (cum[j + 1] - cum[j]), t); ang = np.where(sel, an, ang)
    return t, ang


def make_horn(side, finish, tube, log):
    C, rad, tt = horn_path(side)
    ring = lambda t_: (16 * (t_ + 0.02 * math.sin(t_ * 11 + 1))) % 1.0
    rr = [float(r) * (1 + 0.085 * ring(t_) ** 3 * (t_ < 0.9)) for r, t_ in zip(rad, tt)]   # growth rings, a lip on each
    bm = bmesh.new()
    tube(bm, [tuple(p) for p in C], rr, 20)
    clear = sdf.body(C[tt > 0.18]) - rad[tt > 0.18]
    log("horn", side, "tip", np.round(C[-1], 3).tolist(), "min clearance from the body mm", round(float(clear.min()) * 1000, 1))

    def uvfn(Q, lv2):
        t, ang = _project(Q, C)
        v = 14 + t * 258                                     # base at the top of the painted horn, tip at its foot
        u = uvmap.strip_u("horn", v, ang / np.pi, 0.9)
        return u, v
    return finish(bm, "horn_" + ("l" if side > 0 else "r"), uvfn, 7, levels=0)


EAR_L, EAR_W = 0.104 * sdf.HEAD_S, 0.026 * sdf.HEAD_S


def _ear_frame():
    d = np.array([0.95, 0.06, -0.34]); d /= np.linalg.norm(d)         # out through the coil, drooping
    up = np.array([0, 0, 1.0]) - d[2] * d; up /= np.linalg.norm(up)
    dep = np.cross(d, up)                                              # its depth axis (points back)
    return d, up, dep


EAR_ROOT = sdf.HD((0.06, 0.004, 1.697))


def make_ear(side, finish, tube, log):
    """A long goat's ear standing out sideways through the horn's coil, cupped toward the front."""
    d, up, dep = _ear_frame()
    nu, nv = 6, 12
    bm = bmesh.new()
    grid = {}
    for i in range(nu + 1):
        for j in range(nv + 1):
            s = i / nu * 2 - 1; t = j / nv
            w = EAR_W * math.sin(math.pi * min(1.0, 0.14 + t * 0.95)) ** 0.7 * (1 - 0.5 * t)
            cup = 0.008 * (1 - s * s) * math.sin(math.pi * min(t * 1.2, 1.0))
            q = EAR_ROOT + d * (t * EAR_L) + up * (s * w) + dep * cup
            grid[i, j] = bm.verts.new((side * q[0], q[1], q[2]))
    for i in range(nu):
        for j in range(nv):
            f = (grid[i, j], grid[i + 1, j], grid[i + 1, j + 1], grid[i, j + 1])
            bm.faces.new(f if side > 0 else f[::-1])
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.0032)

    def uvfn(Q, lv2):
        m = Q.copy(); m[:, 0] *= side
        rel = m - EAR_ROOT
        t = np.clip((rel @ d) / EAR_L, 0, 1)
        w = EAR_W * np.sin(np.pi * np.minimum(1.0, 0.14 + t * 0.95)) ** 0.7 * (1 - 0.5 * t) + 1e-4
        return uvmap.ear_uv(t, np.clip((rel @ up) / w, -1, 1), side)
    return finish(bm, "ear_" + ("l" if side > 0 else "r"), uvfn, 6)


def make_beard(finish, tube, log):
    """The goat's beard: a hank of hair off the chin, bushy below it and drawn to a point,
    flattened front to back and swept a little forward."""
    pts = [tuple(sdf.HD(q)) for q in [(0, -0.131, 1.548), (0, -0.134, 1.522), (0, -0.132, 1.496), (0, -0.126, 1.472), (0, -0.117, 1.452), (0, -0.108, 1.437)]]
    rad = [0.012, 0.0135, 0.011, 0.0075, 0.004, 0.001]                # a wispy tuft swept down and back
    bm = bmesh.new()
    tube(bm, pts, rad, 14)
    C = np.array(pts, float)
    for v in bm.verts:                         # flat front to back
        c = C[np.argmin(np.abs(C[:, 2] - v.co.z))]
        v.co.y = c[1] + (v.co.y - c[1]) * 0.7
    B = uvmap.L["beard"]

    def uvfn(Q, lv2):
        t, _ = _project(Q, C)
        v = B["v0"] + t * (B["v1"] - B["v0"])
        r = np.interp(t, np.linspace(0, 1, len(rad)), rad) + 1e-4
        u = B["cx"] + np.clip(Q[:, 0] / r, -1, 1) * np.interp(v, B["hw_v"], B["hw"]) * 0.85
        return u, v
    return finish(bm, "beard", uvfn, 6)


def make_tail(finish, tube, log):
    """A short goat's tail cocked up off the sacrum."""
    pts = [(0, 0.126, 0.972), (0, 0.165, 0.986), (0, 0.2, 1.012), (0, 0.222, 1.05), (0, 0.228, 1.088)]
    rad = [0.028, 0.03, 0.026, 0.017, 0.003]                          # a bushy flag of a tail
    bm = bmesh.new()
    tube(bm, pts, rad, 10)
    for v in bm.verts:                         # flat, broad side to side
        v.co.x *= 1.35
    C = np.array(pts, float)
    rng = np.random.default_rng(3)             # a fringe of long hair off its back and tip
    for t in np.linspace(0.25, 1.0, 16):
        i = min(int(t * (len(C) - 1)), len(C) - 2); f = t * (len(C) - 1) - i
        c = C[i] * (1 - f) + C[i + 1] * f; r0 = rad[i] * (1 - f) + rad[i + 1] * f
        a = rng.uniform(-1.2, 1.2)
        radial = np.array([np.sin(a) * 1.35, np.cos(a) * 0.6, np.cos(a) * 0.8]); radial /= np.linalg.norm(radial)
        d = radial * 0.4 + np.array([0, 0.55, -0.7]); d /= np.linalg.norm(d)
        ln = 0.055 * rng.uniform(0.7, 1.2)
        tube(bm, [tuple(c + radial * r0 * 0.8 + d * ln * s_ + np.array([0, 0, -0.5]) * ln * s_ * s_) for s_ in np.linspace(0, 1, 4)],
             [0.013, 0.0095, 0.005, 0.0015], 4)

    def uvfn(Q, lv2):
        t, ang = _project(Q, C)
        r0, c, h = uvmap.PROF["tail"]
        v = r0 + 4 + t * (len(c) - 10)
        return uvmap.strip_u("tail", v, ang / np.pi, 0.9), v
    return finish(bm, "tail", uvfn, 6)


def _snap(p, it=8):
    p = np.atleast_2d(np.asarray(p, float))
    for _ in range(it):
        p = p - sdf.body(p)[:, None] * sdf.grad(p)
    return p


# tufts: (name, seeds(rng) -> points, flow (left side; x mirrors), length, count, sheet colour by side)
def _fur_regions():
    X = sdf.HIP_X
    A = lambda q: sdf.to_A(np.atleast_2d(q))[0]
    adir = lambda d: A(sdf.SHOULDER + np.asarray(d, float)) - sdf.SHOULDER
    return [
        ("groin", lambda r: [(r.uniform(-0.075, 0.075), -0.16, r.uniform(0.87, 0.93))], (0, -0.12, -1), 0.05, 11,
         {1: (540, 742), -1: (540, 742)}, 0.25),
        ("fetlock", lambda r: [(s * X + 0.06 * np.cos(t), 0.02 + 0.06 * np.sin(t), r.uniform(0.1, 0.16))
                               for s in (1, -1) for t in [r.uniform(0, 2 * np.pi)]], (0, 0.05, -1), 0.045, 6,
         {1: (650, 1100), -1: (420, 1100)}, 0.3),
        ("mane", lambda r: [(r.uniform(-0.055, 0.055), 0.16, r.uniform(1.47, 1.63))], (0, 0.45, -0.9), 0.06, 12,
         {1: (757, 236), -1: (757, 236)}, 0.3),
    ]


def make_fur(finish, tube, log):
    """Clumps of shaggy fur strands where the sheet paints its longest hair: the groin tuft, the
    fetlocks over the hooves and the mane (no beard: the user had it removed). They break the
    silhouette's edge; each takes the colour of the painted fur it grows from."""
    rng = np.random.default_rng(11)
    out = []
    for name, seeds, flow, L, count, col, wn in _fur_regions():
        bm = bmesh.new()
        n = 0
        # grouped: each seed is a clump of three strands of different lengths
        Q = np.array([np.asarray(q) + rng.normal(0, 0.009, 3) for _ in range(count) for q in seeds(rng) for _k in range(3)], float)
        BS = _snap(Q)                                  # all of a region's roots at once (the SDF is slow per point)
        NS = sdf.grad(BS)
        for b, nrm in zip(BS, NS):
            if True:
                fl = np.array(flow, float) * (np.sign(b[0]) or 1, 1, 1) if name in ("cheek", "forearm") else np.array(flow, float)
                d = nrm * wn + fl / np.linalg.norm(fl)
                if name == "beard":                     # drawn together to a point below the chin
                    d = d + 1.6 * (sdf.HD((0, -0.13, 1.43)) - b) / np.linalg.norm(sdf.HD((0, -0.13, 1.43)) - b)
                d /= np.linalg.norm(d)
                thick = {"fetlock": 1.35, "beard": 1.1}.get(name, 1.0) * rng.uniform(0.7, 1.3)
                ln = L * rng.uniform(0.55, 1.2)
                tt = np.linspace(0, 1, 5)
                # a clump, not a quill: thick at the root, lying along the hide, drooping under its own weight
                pts = [b - nrm * 0.004 + d * ln * t + np.array([0, 0, -0.9]) * ln * t * t + rng.normal(0, 0.004, 3) * t for t in tt]
                rad = [r_ * thick for r_ in (0.012, 0.01, 0.0075, 0.0042, 0.0012)]   # blunt, curling tips
                tube(bm, [tuple(p) for p in pts], rad, 4)
                n += 1

        def uvfn(Q, lv2, col=col):
            side = np.where(Q[:, 0] < 0, -1, 1)
            u = np.where(side > 0, col[1][0], col[-1][0]) + 5 * np.sin(Q[:, 2] * 700 + Q[:, 0] * 300)
            v = np.where(side > 0, col[1][1], col[-1][1]) + 5 * np.sin(Q[:, 1] * 650)
            return u, v
        out.append(finish(bm, "fur_" + name, uvfn, 6, levels=0))
        log("fur", name, n, "strands")
    return out


def make(species, finish, tube, log):
    assert species == "goat", species
    return ([make_horn(s, finish, tube, log) for s in (1, -1)] + [make_ear(s, finish, tube, log) for s in (1, -1)]
            + [make_tail(finish, tube, log)] + make_fur(finish, tube, log))     # the beard is a hank of fur clumps
