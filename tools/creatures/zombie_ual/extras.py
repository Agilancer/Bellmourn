"""Built-on extras for the monsters, made in the A-pose rest (armature) space:

  wraps    rope coils or linen bandages spiralled round a bone, with tails hanging off the end
  rings    a band round any axis (a bandolier across the chest, a rope belt)
  strands  hair or weed cards rooted on the scalp or shoulders, hugging the skull, then hanging
  bumps    boils or barnacles placed on the sculpt (big ones become geometry, all of them are
           also baked as raised, coloured domes)

Every vertex carries an anchor point; the build copies the body weights found there, so a tail
swings with the wrist it hangs from and a lock of hair with the head. Texture columns of
zombie_wraps.png: rope | linen | strands (see prep_tex.wraps).
"""
import math

import bpy
import numpy as np

import sdf

COLS = {"rope": (0.0, 1 / 3), "linen": (1 / 3, 2 / 3), "strand": (2 / 3, 1.0)}
DOWN = np.array([0.0, 0.0, -1.0])


def surface(C, D, rmax=0.22, it=26):
    """Where rays C + r*D, starting inside the body, cross out of the sculpt (bisection)."""
    C, D = np.atleast_2d(C).astype(float), np.atleast_2d(D).astype(float)
    lo, hi = np.zeros(len(C)), np.full(len(C), rmax)
    for _ in range(it):
        mid = (lo + hi) / 2
        inside = sdf.body(C + D * mid[:, None]) < 0
        lo, hi = np.where(inside, mid, lo), np.where(inside, hi, mid)
    return C + D * lo[:, None]


def _unit(v):
    v = np.asarray(v, float)
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-12)


def _frame(ax):
    ax = _unit(ax)
    ref = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.array([1.0, 0, 0])
    e1 = _unit(np.cross(ax, ref))
    return ax, e1, np.cross(ax, e1)


def _arc(S):
    return np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(S, axis=0), axis=1))])


class Builder:
    """Collects quad grids with per-corner UVs and a weight anchor per vertex."""

    def __init__(self):
        self.V, self.F, self.UV, self.A = [], [], [], []
        self.K = []              # 2 for strand cards (shaded with their root's normal)
        self.ropes = []          # rope centreline points (x, y, z, radius): the bake bruises the skin under them

    def grid(self, P, UV, anchors, kind=0):
        n, m = P.shape[:2]
        base = len(self.V)
        self.K += [kind] * (n * m)
        self.V += list(P.reshape(-1, 3)); self.A += list(np.broadcast_to(anchors, P.shape).reshape(-1, 3))
        uv = UV.reshape(-1, 2)
        for i in range(n - 1):
            for j in range(m - 1):
                a = i * m + j
                self.F.append((base + a, base + a + m, base + a + m + 1, base + a + 1))
                self.UV.append([uv[a], uv[a + m], uv[a + m + 1], uv[a + 1]])

    def tube(self, S, Dref, radius, u0, u1, vscale, anchors, m=7):
        T = _unit(np.gradient(S, axis=0))
        Nn = _unit(Dref - (Dref * T).sum(1, keepdims=True) * T)
        Bn = np.cross(T, Nn)
        ring = np.linspace(0, 2 * math.pi, m)
        rad = np.broadcast_to(np.asarray(radius, float), (len(S),))[:, None, None]
        P = S[:, None] + (np.cos(ring)[None, :, None] * Nn[:, None] + np.sin(ring)[None, :, None] * Bn[:, None]) * rad
        U = np.broadcast_to((u0 + (u1 - u0) * ring / (2 * math.pi))[None, :], P.shape[:2])
        Vv = np.broadcast_to((_arc(S) / vscale)[:, None], P.shape[:2])
        self.grid(P, np.stack([U, Vv], -1), anchors[:, None])

    def ribbon(self, S, side, width, u0, u1, vscale, anchors, kind=0):
        w = np.broadcast_to(np.asarray(width, float), (len(S),))[:, None, None]
        P = S[:, None] + side[:, None] * w * np.array([-0.5, 0.5])[None, :, None]
        U = np.broadcast_to(np.array([u0 + 0.03 * (u1 - u0), u1 - 0.03 * (u1 - u0)])[None, :], P.shape[:2])
        Vv = np.broadcast_to((_arc(S) / vscale)[:, None], P.shape[:2])
        self.grid(P, np.stack([U, Vv], -1), anchors[:, None], kind)

    def object(self, name, coll):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in self.V], [], self.F)
        ul = me.uv_layers.new(name="UVMap")
        ul.data.foreach_set("uv", np.array(self.UV, float).ravel())
        K = np.array(self.K)
        if (K == 2).any():
            me.update()
            nrm = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get("normal", nrm); nrm = nrm.reshape(-1, 3)
            A = np.array(self.A)
            nrm[K == 2] = sdf.grad(A[K == 2])
            for poly in me.polygons:
                poly.use_smooth = True
            me.normals_split_custom_set_from_vertices([tuple(v) for v in nrm])
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        return ob, np.array(self.A)


def _tail(B, root, outward, length, width, kind, rng):
    n = 9
    out = _unit(outward - DOWN * float(np.dot(outward, DOWN)))
    S = [root + out * 0.003]
    for i in range(1, n):
        d = _unit(DOWN * 0.9 + out * 0.22 + rng.normal(0, 0.12, 3))
        S.append(S[-1] + d * length / (n - 1))
    S = np.array(S)
    s = np.linspace(0, 1, n)
    anchors = np.repeat(root[None], n, 0)
    u0, u1 = COLS[kind]
    if kind == "rope":
        B.tube(S, np.repeat(out[None], n, 0), width * 0.5 * (1 - 0.3 * s), u0, u1, width * 3, anchors)
    else:
        side = _unit(np.cross(DOWN, out))
        ang = s * rng.uniform(1.0, 2.2)
        sides = np.cos(ang)[:, None] * side + np.sin(ang)[:, None] * out
        B.ribbon(S, sides, width * (1 - 0.45 * s), u0, u1, width * 1.6, anchors)


def band(B, c0, ax, length, t0, t1, turns, width, thick, kind, rng, tails=0, tail_len=(0.15, 0.26), phase=0.0, arc=None):
    """A spiral of rope (a tube of diameter thick) or linen (a strip width wide) hugging the body."""
    ax, e1, e2 = _frame(ax)
    n = max(18, int(abs(turns) * 44))
    s = np.linspace(0, 1, n)
    th = 2 * math.pi * turns * s + phase
    if arc is not None:                                   # a band over part of the way round only
        th = np.radians(arc[0] + (arc[1] - arc[0]) * s)
    elif kind == "linen":                                 # wrapped by hand: the spiral drifts, overlaps and gapes
        th = th + 0.45 * np.sin(2 * math.pi * s * 1.7 + rng.uniform(0, 6.3))
        width = width * rng.uniform(0.9, 1.3)
    C = np.asarray(c0, float) + ((t0 + (t1 - t0) * s) * length)[:, None] * ax
    D = np.cos(th)[:, None] * e1 + np.sin(th)[:, None] * e2
    u0, u1 = COLS[kind]
    lift = (0.0012 * abs(turns) * s)[:, None]             # each turn rides over the last: no z-fighting
    if kind == "rope":
        S = surface(C, D) + D * (thick * 0.22 + lift)                  # bitten half into the flesh
        rad = thick * 0.5 * (1 + 0.18 * np.sin(_arc(S) / thick * 1.3 + rng.uniform(0, 6.3)))
        B.tube(S, D, rad, u0, u1, thick * 3, S)
        B.ropes += [[*q, thick * 0.5] for q in S[::2]]
        end, endD = S[-1], D[-1]
    else:
        Pa = surface(C - ax * width / 2, D) + D * (thick * 1.6 + 0.0015 + lift)   # loose, not painted on
        Pb = surface(C + ax * width / 2, D) + D * (thick * 1.6 + 0.0015 + lift)
        P = np.stack([Pa, Pb], 1)
        S = (Pa + Pb) / 2
        U = np.broadcast_to(np.array([u0 + 0.03 * (u1 - u0), u1 - 0.03 * (u1 - u0)])[None, :], (n, 2))
        Vv = np.broadcast_to((_arc(S) / (width * 1.6))[:, None], (n, 2))
        B.grid(P, np.stack([U, Vv], -1), S[:, None])
        end, endD = S[-1], D[-1]
    for _ in range(tails):
        _tail(B, end + rng.normal(0, 0.003, 3), endD, rng.uniform(*tail_len),
              thick if kind == "rope" else width * 0.7, kind, rng)


def strands(B, centre, n, rng, az=(60, 300), el=(-10, 50), length=(0.06, 0.2), width=(0.005, 0.009), hug=0.35,
            lift=0.0015, push=0.12):
    """Cards rooted on the surface round centre (azimuth from the front, degrees), hugging, then hanging."""
    u0, u1 = COLS["strand"]
    for _ in range(n):
        a, e = math.radians(rng.uniform(*az)), math.radians(rng.uniform(*el))
        D = np.array([math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)])
        root = surface(centre, D)[0]
        nrm = sdf.grad(root[None])[0]
        L, w = rng.uniform(*length), rng.uniform(*width)
        m = 10
        tang = _unit(DOWN - nrm * float(np.dot(DOWN, nrm)))
        S = [root + nrm * lift]
        curl = rng.normal(0, 0.1, 3)
        for i in range(1, m):
            s = i / (m - 1)
            hang = min(1.0, s / max(hug, 1e-3))
            d = _unit(tang * (1 - hang) + DOWN * hang + nrm * push * (1 - 0.5 * s) + curl * s)
            p = S[-1] + d * L / (m - 1)
            dd = sdf.body(p[None])[0]
            if dd < 0.003:                                  # never through the skull or shoulders
                p = p + sdf.grad(p[None])[0] * (0.003 - dd)
            S.append(p)
        S = np.array(S)
        tw = rng.uniform(-0.8, 0.8)
        s0 = _unit(np.cross(DOWN, nrm))
        side = np.repeat(_unit(s0 * math.cos(tw) + nrm * math.sin(tw))[None], m, 0)
        col = rng.integers(0, 4)                          # four strand clumps across the column
        cu0 = u0 + (u1 - u0) * col / 4
        B.ribbon(S, side, w * (1 - 0.8 * np.linspace(0, 1, m)), cu0, cu0 + (u1 - u0) / 4, L, np.repeat(root[None], m, 0), kind=2)
    return B


def place_bumps(regions, rng):
    """[(lo, hi, count, (rmin, rmax), mirror)] boxes -> [(point, normal, radius)] on the sculpt."""
    out = []
    for reg in regions:
        lo, hi, cnt, (r0, r1), mir = reg[:5]
        cl = reg[5] if len(reg) > 5 else 1
        P = rng.uniform(lo, hi, size=(cnt * 4, 3))
        if cl > 1:                                       # clusters: a few centres, each crowded with bumps
            Cc = rng.uniform(lo, hi, size=(max(1, cnt // cl) * 3, 3))
            P = np.repeat(Cc, cl * 3, 0) + rng.normal(0, 0.012, size=(len(Cc) * cl * 3, 3))
        for _ in range(12):
            P = P - sdf.body(P)[:, None] * sdf.grad(P)
        P = P[np.abs(sdf.body(P)) < 0.0015]
        keep = []
        for p in P:                                          # spaced out, a little clumped
            if all(np.linalg.norm(p - q) > (0.009 if cl > 1 else 0.012) for q in keep):
                keep.append(p)
            if len(keep) >= cnt:
                break
        for p in keep:
            nrm = sdf.grad(p[None])[0]
            r = rng.uniform(r0, r1)
            out.append((p, nrm, r))
            if mir:
                out.append((p * [-1, 1, 1], nrm * [-1, 1, 1], r * rng.uniform(0.8, 1.15)))
    return out


def build(cfg, arm, coll, rng):
    """All the cfg extras as one object (or None) plus each vertex's weight anchor."""
    B = Builder()
    sides = lambda b: [b + "_l", b + "_r"] if b + "_l" in arm.data.bones else [b]
    for w in cfg.get("wraps", []):
        bone, t0, t1, turns, width, thick, kind, tails = w[:8]
        end = w[8] if len(w) > 8 else None   # (optional) where round the bone the wrap ends, degrees: its tails hang there
        for k, name in enumerate(sides(bone)):
            bb = arm.data.bones[name]
            h, t = np.array(bb.head_local), np.array(bb.tail_local)
            tn = turns * (1 if k == 0 else -1)
            ph = rng.uniform(0, 6.28)
            if end is not None:
                ph = math.radians(end) - 2 * math.pi * tn
            band(B, h, t - h, np.linalg.norm(t - h), t0, t1, tn, width, thick, kind, rng,
                 tails=tails if (k == 0 or tails > 1) else 0, phase=ph)
    for ring in cfg.get("rings", []):
        c, ax, width, thick, kind, tails = ring[:6]
        band(B, c, ax, 1.0, 0, 0, 1.0, width, thick, kind, rng, tails=tails, arc=ring[6] if len(ring) > 6 else None)
    for sp in cfg.get("strands", []):
        strands(B, np.asarray(sp["centre"], float), sp["n"], rng, sp.get("az", (60, 300)), sp.get("el", (-10, 50)),
                sp.get("length", (0.06, 0.2)), sp.get("width", (0.005, 0.009)), sp.get("hug", 0.35),
                sp.get("lift", 0.0015), sp.get("push", 0.12))
    if not B.F:
        return None, None, np.zeros((0, 4))
    ob, anchors = B.object("extras", coll)
    return ob, anchors, np.array(B.ropes, float).reshape(-1, 4)
