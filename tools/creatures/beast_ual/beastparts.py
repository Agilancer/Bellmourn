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


# ---------------------------------------------------------------------------------------- wolf

WEAR_L, WEAR_W = 0.104 * sdf.HEAD_S, 0.031 * sdf.HEAD_S
WEAR_ROOT = sdf.HD((0.05, 0.016, 1.762))


def _wolf_ear_frame():
    d = np.array([0.3, 0.17, 0.94]); d /= np.linalg.norm(d)            # up, a little out and laid back
    f = np.array([0.32, -1.0, 0.08]); f -= (f @ d) * d; f /= np.linalg.norm(f)   # the cup faces forward and out
    w = np.cross(d, f)                                                  # across the ear
    return d, f, w


def _wolf_ear_shape(s, t):
    """Half width and the cup's depth (toward the back) at (s across -1..1, t up 0..1)."""
    w = WEAR_W * (1 - t) ** 0.85 * (1 - 0.15 * t) + 0.0012
    cup = 0.013 * sdf.HEAD_S * (1 - s * s) * np.sin(np.pi * np.minimum(t * 1.05, 1.0)) ** 0.8
    return w, cup


def make_wolf_ear(side, finish, tube, log):
    """A tall pointed wolf's ear, cupped to the front, standing up off the side of the crown and
    laid a little back; the pink inside on the painted ear, the back in the crown's fur."""
    d, fwd, wax = _wolf_ear_frame()
    nu, nv = 8, 14
    bm = bmesh.new()
    grid = {}
    for layer in (0, 1):                        # the cupped front, and the back: thick and furred at the root
        for i in range(nu + 1):
            for j in range(nv + 1):
                s_ = i / nu * 2 - 1; t = j / nv
                w, cup = _wolf_ear_shape(s_, t)
                q = WEAR_ROOT + d * (t * WEAR_L) + wax * (s_ * w) - fwd * cup - fwd * 0.012 * t * t   # tip bends back
                if layer:
                    edge = 1 - s_ * s_
                    q = q - fwd * (0.0025 + 0.016 * sdf.HEAD_S * (1 - t) ** 1.4 * edge ** 0.6)
                grid[layer, i, j] = bm.verts.new((side * q[0], q[1], q[2]))
    for i in range(nu):
        for j in range(nv):
            f = (grid[0, i, j], grid[0, i + 1, j], grid[0, i + 1, j + 1], grid[0, i, j + 1])
            bm.faces.new(f if side > 0 else f[::-1])
            f = (grid[1, i, j], grid[1, i, j + 1], grid[1, i + 1, j + 1], grid[1, i + 1, j])
            bm.faces.new(f if side > 0 else f[::-1])
    rim = ([((i, nv), (i + 1, nv)) for i in range(nu)] + [((i, 0), (i + 1, 0)) for i in range(nu)]
           + [((0, j), (0, j + 1)) for j in range(nv)] + [((nu, j), (nu, j + 1)) for j in range(nv)])
    for (i, j), (i2, j2) in rim:                 # close the rim (the root sinks into the skull)
        bm.faces.new((grid[0, i, j], grid[1, i, j], grid[1, i2, j2], grid[0, i2, j2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    E, B = uvmap.L["ear"][side], uvmap.L["ear_back"][side]

    def uvfn(Q, lv2):
        m = Q.copy(); m[:, 0] *= side
        rel = m - WEAR_ROOT
        t = np.clip((rel @ d) / WEAR_L, 0, 1)
        w, _ = _wolf_ear_shape(0.0, t)
        sw = np.clip((rel @ wax) / w, -1, 1)
        _, cup = _wolf_ear_shape(sw, t)
        off = -(rel @ fwd) - cup - 0.012 * t * t                      # depth behind the cup's surface
        back = off > 0.0012
        u = np.zeros(len(Q)); v = np.zeros(len(Q))
        for sel, P_ in ((~back, E), (back, B)):
            b = np.array(P_["base"], float); tp = np.array(P_["tip"], float)
            dd = tp - b; n = np.array([-dd[1], dd[0]]) / np.linalg.norm(dd)
            if n[0] * side < 0:                                        # the ear's outer edge to the panel's outer edge
                n = -n
            hw = P_["hw"] * (1 - t[sel]) ** 0.8 + 3
            q = b + t[sel, None] * dd + (sw[sel] * hw)[:, None] * n
            u[sel], v[sel] = q[:, 0], q[:, 1]
        return u, v
    return finish(bm, "ear_" + ("l" if side > 0 else "r"), uvfn, 6, levels=1)


WTAIL = [(0, 0.112, 0.99), (0, 0.168, 0.968), (0, 0.235, 0.925), (0, 0.298, 0.862), (0, 0.346, 0.786),
         (0, 0.376, 0.705), (0, 0.388, 0.632), (0, 0.388, 0.585)]
WTAIL_R = [0.042, 0.06, 0.074, 0.078, 0.072, 0.058, 0.036, 0.006]


def make_wolf_tail(finish, tube, log):
    """A long bushy tail held out behind and drooping, thick with long guard hair along its top and
    a ragged fringe at the tip."""
    bm = bmesh.new()
    C0 = np.array(WTAIL, float); R0 = np.array(WTAIL_R)
    seg0 = np.linalg.norm(np.diff(C0, axis=0), axis=1); cum0 = np.concatenate([[0], np.cumsum(seg0)]) / seg0.sum()
    tt_ = np.linspace(0, 1, 34)
    Cf = np.stack([np.interp(tt_, cum0, C0[:, k]) for k in range(3)], 1)
    Rf = np.interp(tt_, cum0, R0)
    meta = tube(bm, [tuple(q) for q in Cf], list(Rf), 16)
    for v_, (t_, a_) in meta.items():          # clumped: the hair parts in ridges down its length
        c_ = Cf[min(int(round(t_ * (len(Cf) - 1))), len(Cf) - 1)]
        rel = np.array(v_.co) - c_
        v_.co = tuple(c_ + rel * (1 + 0.1 * np.cos(a_ * 6 + t_ * 7) * (t_ > 0.12)))
    C = C0; R = R0
    rng = np.random.default_rng(5)
    tmeta = {}
    for k in range(40):                          # locks all round it, swept to the tip
        t = rng.uniform(0.08, 0.9)
        i = min(int(t * (len(C) - 1)), len(C) - 2); fr = t * (len(C) - 1) - i
        c = C[i] * (1 - fr) + C[i + 1] * fr; r0 = R[i] * (1 - fr) + R[i + 1] * fr
        tg = C[i + 1] - C[i]; tg /= np.linalg.norm(tg)
        ref = np.array([0, 0, 1.0]) if abs(tg[2]) < 0.9 else np.array([0, 1.0, 0])
        up = ref - (ref @ tg) * tg; up /= np.linalg.norm(up)
        a = rng.uniform(-np.pi, np.pi)
        nr = np.cos(a) * up + np.sin(a) * np.cross(tg, up)
        tmeta.update(_lock(bm, tube, c + nr * r0 * 0.85, nr, tg, 0.1, 0.016, 18, rng, droop=0.15))
    for k in range(0):
        t = rng.uniform(0.18, 0.98)
        i = min(int(t * (len(C) - 1)), len(C) - 2); fr = t * (len(C) - 1) - i
        c = C[i] * (1 - fr) + C[i + 1] * fr; r0 = R[i] * (1 - fr) + R[i + 1] * fr
        tg = C[i + 1] - C[i]; tg /= np.linalg.norm(tg)
        a = rng.uniform(-2.3, 2.3)                                      # mostly over the top and sides
        ref = np.array([0, 0, 1.0]) if abs(tg[2]) < 0.9 else np.array([0, 1.0, 0])   # (the tip hangs straight down)
        up = ref - (ref @ tg) * tg; up /= np.linalg.norm(up)
        sd = np.cross(tg, up)
        radial = np.cos(a) * up + np.sin(a) * sd
        dd = radial * 0.45 + tg * 0.9; dd /= np.linalg.norm(dd)
        ln = (0.07 + 0.05 * t) * rng.uniform(0.75, 1.2)
        tube(bm, [tuple(c + radial * r0 * 0.75 + dd * ln * s_ + np.array([0, 0, -0.45]) * ln * s_ * s_) for s_ in np.linspace(0, 1, 5)],
             [0.016, 0.013, 0.009, 0.005, 0.0012], 5)
    seg = np.linalg.norm(np.diff(C, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)]) / seg.sum()
    TL = uvmap.L["tail"]["v"]

    def uvfn(Q, lv2):
        t, ang = _project(Q, C)
        v = TL[0] + t * (TL[1] - TL[0])
        return uvmap.strip_u("tail", v, ang / np.pi, 0.9), v
    bm.verts.ensure_lookup_table()
    LT = np.array([max(tmeta[v][0], 0.6 * float(np.clip(_project(np.array([v.co[:]]), C)[0][0] * 1.6 - 0.7, 0, 1)))
                   if v in tmeta else float(np.clip(_project(np.array([v.co[:]]), C)[0][0] * 1.6 - 0.7, 0, 1)) for v in bm.verts])
    ob = finish(bm, "tail", uvfn, 6, levels=0)
    ob.data.attributes.new("lockT", "FLOAT", "POINT").data.foreach_set("value", LT.astype(np.float32))   # frosted toward the tip
    return ob


def _gum(x, y, upper):
    """Where the gape's lining is at (x, y) on the painted-scale head: its roof (upper) or floor."""
    c, r = np.array(sdf.MOUTH_C0), np.array(sdf.MOUTH_R0)
    k = 1 - (x / r[0]) ** 2 - ((y - c[1]) / r[1]) ** 2
    h = r[2] * np.sqrt(max(k, 0.02))
    return c[2] + h if upper else c[2] - h


def make_wolf_teeth(finish, tube, log):
    """The snarl's teeth on the painted-scale head (grown with it): six small incisors across the
    front of each jaw, the long upper fangs and the lower ones inside them, and a row of short
    shearing teeth down each side; every tooth curves back a little and is rooted in the gum."""
    bm = bmesh.new()
    rng = np.random.default_rng(7)
    spec = []
    for upper in (True, False):
        sg = -1.0 if upper else 1.0
        for x in ((-0.012, -0.0072, -0.0024, 0.0024, 0.0072, 0.012) if upper else (-0.0102, -0.0061, -0.002, 0.002, 0.0061, 0.0102)):   # incisors
            spec.append((x, -0.19 + 0.06 * x * x / 0.012, upper, (0.0052 if upper else 0.0044) * rng.uniform(0.85, 1.1), 0.0024))
        for sx in (-1, 1):
            spec.append((sx * (0.0195 if upper else 0.0148), -0.178 if upper else -0.187, upper, 0.034 if upper else 0.025, 0.0078 if upper else 0.0064))   # fangs: the lower in front of the upper
            for k in range(3):                                                 # cheek teeth
                spec.append((sx * (0.0222 - 0.0006 * k), -0.162 + 0.018 * k, upper, 0.0075 * rng.uniform(0.85, 1.1) * (1 - 0.15 * k), 0.003))
    TT = []
    for x, y, upper, ln, r0 in spec:
        sg = -1.0 if upper else 1.0
        z0 = _gum(x, y, upper) - sg * 0.0035                                   # rooted in the gum
        pts = []
        for t in np.linspace(0, 1, 6):
            pts.append(sdf.HD((x * (1 - 0.06 * t), y + 0.006 * t * t * (ln / 0.02), z0 + sg * (ln + 0.0035) * t)))
        rad = [r0 * sdf.HEAD_S * (1 - t) ** 0.9 + 0.0004 for t in np.linspace(0, 1, 6)]
        tube(bm, [tuple(q) for q in pts], rad, 8)
        TT.append((np.array(pts), upper))
    log("teeth", len(spec))

    def uvfn(Q, lv2):
        best = np.full(len(Q), 1e9); t = np.zeros(len(Q))
        for C, upper in TT:
            for j in range(len(C) - 1):
                ab = C[j + 1] - C[j]
                s_ = np.clip(((Q - C[j]) @ ab) / (ab @ ab), 0, 1)
                dd = np.linalg.norm(Q - (C[j] + s_[:, None] * ab), axis=1)
                sel = dd < best; best = np.where(sel, dd, best); t = np.where(sel, (j + s_) / (len(C) - 1), t)
        u = 1041 + 3.0 * np.sin(Q[:, 0] * 900 + Q[:, 1] * 400)              # down a painted fang, gum to point
        v = 258 + t * 32
        return u, v
    return finish(bm, "teeth", uvfn, 2, levels=0)


def _lock(bm, tube, root, nrm, flow, L, w, lift_deg, rng, thick=0.32, droop=0.35):
    """One lock of fur: a flattened, tapering clump rooted in the hide, lying along `flow` with its
    tip lifted off the skin and drooping. Returns {vert: (t along, across)}."""
    n_ = np.asarray(nrm, float); n_ /= np.linalg.norm(n_)
    f = np.asarray(flow, float) + rng.normal(0, 0.15, 3)
    f -= (f @ n_) * n_; f /= np.linalg.norm(f)
    a = np.radians(lift_deg * rng.uniform(0.75, 1.25))
    dvec = f * np.cos(a) + n_ * np.sin(a)
    ln = L * rng.uniform(0.5, 1.5)
    tt = np.linspace(0, 1, 6)
    pts = [root - n_ * 0.006 + dvec * ln * t + np.array([0, 0, -droop]) * ln * t * t + n_ * 0.004 * np.sin(np.pi * t) for t in tt]
    rad = [w * r_ for r_ in (0.9, 1.0, 0.86, 0.6, 0.3, 0.06)]
    meta = tube(bm, [tuple(p) for p in pts], rad, 6)
    C = np.array(pts)
    out = {}
    for v, (t, ang) in meta.items():               # flatten across the hide: thin, wide
        i = int(round(t * (len(C) - 1)))
        rel = np.array(v.co) - C[i]
        k = rel @ n_
        v.co = tuple(C[i] + rel - n_ * k * (1 - thick))
        out[v] = (t, np.sin(ang))
    return out


def _locks_part(name, finish, tube, log, spots, col, L, w, lift, part=6, thick=0.32, droop=0.35, seed=1):
    """A set of locks on the body: spots = [(point near the hide, flow)], each snapped onto it."""
    rng = np.random.default_rng(seed)
    P0 = np.array([s[0] for s in spots], float)
    S = _snap(P0); N = sdf.grad(S)
    bm = bmesh.new()
    meta = {}
    cols = []
    for (p0, flow), s_, n_ in zip(spots, S, N):
        fl = np.asarray(flow, float) * ((np.sign(s_[0]) or 1.0) if name in MIRROR_FLOW else 1.0, 1, 1)
        m = _lock(bm, tube, s_, n_, fl, L, w, lift, rng, thick, droop)
        meta.update(m)
        c = col[1 if s_[0] >= 0 else -1]
        cols += [(c[0] + rng.uniform(-14, 14), c[1] + rng.uniform(-14, 14))] * len(m)
    bm.verts.ensure_lookup_table()
    T = np.array([meta[v][0] for v in bm.verts]); A = np.array([meta[v][1] for v in bm.verts])
    order = {v: i for i, v in enumerate(meta)}
    CU = np.array([cols[order[v]][0] for v in bm.verts]); CV = np.array([cols[order[v]][1] for v in bm.verts])

    def uvfn(Q, lv2):                              # down a few px of painted fur, the hair's streaks along the lock
        return CU[lv2] + 7 * A[lv2], CV[lv2] - 26 + 52 * T[lv2]
    log("locks", name, len(spots))
    ob = finish(bm, name, uvfn, part, levels=0)
    at = ob.data.attributes.new("lockT", "FLOAT", "POINT")         # 0 root .. 1 tip: the frosted guard hair
    at.data.foreach_set("value", T.astype(np.float32))
    return ob


MIRROR_FLOW = ("fur_cheek", "fur_shoulder", "fur_forearm", "fur_hip")


def make_wolf_locks(finish, tube, log):
    """The werewolf's shaggy coat in locks: the mane down the nape and over the hump onto the
    shoulders, ruffs behind the jaw and under the throat, tufts off the backs of the forearms,
    the hips and the calves. Dark fur from the sheet, the hair's streaks run down each lock."""
    rng = np.random.default_rng(31)
    A = lambda q: sdf.to_A(np.atleast_2d(q))[0]
    adir = lambda d: A(sdf.SHOULDER + np.asarray(d, float)) - sdf.SHOULDER
    X = sdf.HIP_X
    out = []
    mane = []
    for z, w, n in ((1.56, 0.13, 7), (1.52, 0.17, 8),
                    (1.48, 0.2, 8), (1.44, 0.2, 8), (1.4, 0.16, 6), (1.36, 0.1, 4)):
        for x in np.linspace(-w, w, n) + rng.normal(0, 0.01, n):
            mane.append(((x + rng.normal(0, 0.01), 0.3, z + rng.normal(0, 0.014)), (0.35 * np.sign(x) * min(abs(x) / 0.12, 1), 0.35, -1)))
    out.append(_locks_part("fur_mane", finish, tube, log, mane, {1: (812, 150), -1: (585, 150)}, 0.088, 0.013, 10, droop=0.95, seed=2))
    cheek = []
    for y in (-0.03, -0.005, 0.02, 0.045, 0.07):
        for z in (1.585, 1.62, 1.655, 1.69):
            for sx in (1, -1):
                cheek.append(((sx * 0.12, y + rng.normal(0, 0.005), z + rng.normal(0, 0.005)), (0.45, 0.7, -0.55)))
    out.append(_locks_part("fur_cheek", finish, tube, log, cheek, {1: (1172, 205), -1: (944, 205)}, 0.08, 0.012, 22, droop=0.45, seed=3))
    # (no locks under the jaw: they read as a beard)
    sh = []
    for x in (0.25, 0.29, 0.33, 0.37, 0.41):
        for y in (-0.01, 0.05, 0.11):
            q = A((x + sdf.DW + rng.normal(0, 0.006), y, 1.55))
            for sx in (1, -1):
                sh.append(((sx * q[0], q[1], q[2]), tuple(adir((1, 0.15, -0.35)))))
    out.append(_locks_part("fur_shoulder", finish, tube, log, sh, {1: (40, 300), -1: (40, 300)}, 0.1, 0.013, 12, droop=0.6, seed=5))
    fa = []
    for x in (0.52, 0.57, 0.62, 0.67, 0.72):
        for z in (1.43, 1.47):
            q = A((x + sdf.DW, 0.16, z + rng.normal(0, 0.006)))
            for sx in (1, -1):
                fa.append(((sx * q[0], q[1], q[2]), tuple(adir((-0.75, 0.6, -0.1)))))
    out.append(_locks_part("fur_forearm", finish, tube, log, fa, {1: (40, 640), -1: (40, 640)}, 0.09, 0.014, 26, droop=0.45, seed=6))
    hip = [((sx * 0.26, y, z), (0.25, 0.25, -1)) for y in (-0.03, 0.03, 0.09) for z in (0.95, 0.88) for sx in (1, -1)]
    out.append(_locks_part("fur_hip", finish, tube, log, hip, {1: (850, 520), -1: (460, 520)}, 0.07, 0.018, 22, seed=7))
    calf = [((sx * (X + rng.normal(0, 0.012)), 0.2, z), (0, 0.4, -1)) for z in (0.46, 0.4, 0.34, 0.28, 0.22) for sx in (1, -1)]
    out.append(_locks_part("fur_calf", finish, tube, log, calf, {1: (995, 900), -1: (372, 900)}, 0.07, 0.012, 10, droop=0.3, seed=8))
    ankle = []                                     # a ruff round the ankle falling over the top of the paw
    for k in range(6):
        a = -2.2 + 4.4 * k / 5
        for sx in (1, -1):
            ankle.append(((sx * (X + 0.09 * np.sin(a)), 0.035 - 0.09 * np.cos(a), 0.215 + rng.normal(0, 0.01)), (0, -0.25 * np.cos(a), -1)))
    out.append(_locks_part("fur_ankle", finish, tube, log, ankle, {1: (995, 1000), -1: (372, 1000)}, 0.065, 0.02, 12, droop=0.25, thick=0.4, seed=9))
    return out


def _fur_regions_wolf():
    X = sdf.HIP_X
    A = lambda q: sdf.to_A(np.atleast_2d(q))[0]
    adir = lambda d: A(sdf.SHOULDER + np.asarray(d, float)) - sdf.SHOULDER
    both = lambda q: [q, (-q[0], q[1], q[2])]
    return [
        ("mane", lambda r: [(r.uniform(-0.11, 0.11), 0.2, r.uniform(1.44, 1.72))], (0, 0.5, -0.85), 0.085, 18,
         {1: (812, 150), -1: (582, 150)}, 0.35),
        ("cheek", lambda r: both((r.uniform(0.05, 0.075), r.uniform(-0.04, 0.025), r.uniform(1.59, 1.665))), (0.75, 0.45, -0.5), 0.06, 5,
         {1: (1152, 262), -1: (962, 262)}, 0.4),
        ("shoulder", lambda r: both(tuple(A((r.uniform(0.26, 0.36), r.uniform(0.0, 0.11), 1.54)))), tuple(adir((1, 0, -0.35))), 0.07, 6,
         {1: (38, 300), -1: (38, 300)}, 0.3),
        ("forearm", lambda r: both(tuple(A((r.uniform(0.56, 0.74), 0.13, r.uniform(1.43, 1.48))))), tuple(adir((-0.5, 0.6, -0.45))), 0.06, 5,
         {1: (40, 640), -1: (40, 640)}, 0.35),
        ("chest", lambda r: [(r.uniform(-0.075, 0.075), -0.2, r.uniform(1.43, 1.56))], (0, -0.3, -1), 0.06, 8,
         {1: (322, 60), -1: (322, 60)}, 0.3),
        ("calf", lambda r: both((X + r.uniform(-0.03, 0.03), 0.16, r.uniform(0.17, 0.45))), (0, 0.45, -1), 0.05, 5,
         {1: (995, 900), -1: (372, 900)}, 0.3),
        ("groin", lambda r: [(r.uniform(-0.07, 0.07), -0.16, r.uniform(0.87, 0.93))], (0, -0.12, -1), 0.05, 8,
         {1: (330, 505), -1: (330, 505)}, 0.25),
    ]


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
    for name, seeds, flow, L, count, col, wn in (_fur_regions_wolf() if sdf.WOLF else _fur_regions()):
        bm = bmesh.new()
        n = 0
        # grouped: each seed is a clump of three strands of different lengths
        Q = np.array([np.asarray(q) + rng.normal(0, 0.009, 3) for _ in range(count) for q in seeds(rng) for _k in range(3)], float)
        BS = _snap(Q)                                  # all of a region's roots at once (the SDF is slow per point)
        NS = sdf.grad(BS)
        for b, nrm in zip(BS, NS):
            if True:
                fl = np.array(flow, float) * (np.sign(b[0]) or 1, 1, 1) if name in ("cheek", "forearm", "shoulder") else np.array(flow, float)
                d = nrm * wn + fl / np.linalg.norm(fl)
                if name == "beard":                     # drawn together to a point below the chin
                    d = d + 1.6 * (sdf.HD((0, -0.13, 1.43)) - b) / np.linalg.norm(sdf.HD((0, -0.13, 1.43)) - b)
                d /= np.linalg.norm(d)
                thick = {"fetlock": 1.35, "beard": 1.1, "mane": 1.3, "cheek": 1.15}.get(name, 1.0) * rng.uniform(0.7, 1.3)
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
    if species == "wolf":                       # (its ruff's bulk is sculpted into the hide: sdf.TUFTS)
        return ([make_wolf_ear(s, finish, tube, log) for s in (1, -1)] + [make_wolf_tail(finish, tube, log),
                make_wolf_teeth(finish, tube, log)] + make_wolf_locks(finish, tube, log))
    assert species == "goat", species
    return ([make_horn(s, finish, tube, log) for s in (1, -1)] + [make_ear(s, finish, tube, log) for s in (1, -1)]
            + [make_tail(finish, tube, log)] + make_fur(finish, tube, log))     # the beard is a hank of fur clumps
