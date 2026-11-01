"""The armoured brute, with armour built FOR him: the armour tool (tools/armor) fits its plates
round the brute's own body instead of a villager's, then they ride his bones.

    blender -b <out>/brute_red_demon.blend --python armor_fit.py -- <out.glb>

- the brute loses his loincloth, its trophy, and every spike on his body (horns and heel
  claws stay)
- tools/armor's Body is built from his skin: his UAL bones go by the villager names the
  plate builders expect
- the Fiend's Panoply, chest and legs only: cuirass standing well proud with Lord Velscour's
  raised gold V front and back, a saw-toothed spine fin, gorget, belt, fauld, a dark mail
  skirt, tassets, cuisses, winged knee cops with a gold boss, greaves with Vs; bare feet
- dark mail over his hips and legs under the plates, so a gap at a bending knee shows mail
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path[:0] = [os.path.join(ROOT, "tools", "armor"), HERE]
import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location("armor_build", os.path.join(ROOT, "tools", "armor", "build.py"))
AB = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(AB)   # tools/armor/build.py (not ours)
import garb as G  # noqa: E402
import ornament as O  # noqa: E402
import pieces as PC  # noqa: E402
import plates as K  # noqa: E402
from sets import FIEND  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
OUT_GLB = argv[0]
log = lambda *a: print("[armorfit]", *a, flush=True)
AB.TEXDIR = os.path.join(os.path.dirname(OUT_GLB), "armor_tex")
os.makedirs(AB.TEXDIR, exist_ok=True)

ARM = next(o for o in bpy.data.objects if o.type == "ARMATURE")
BR = bpy.data.objects["Brute"]
SCALE = ARM.scale.x
ARM.scale = (1, 1, 1)                 # the armour tool works in world space: build at 1, restore for export
bpy.context.view_layer.update()

# villager bone names (what tools/armor expects) -> the brute's UAL bones
VB = {"Body": "pelvis", "Hips": "pelvis", "Abdomen": "spine_01", "Torso": "spine_02", "Chest": "spine_03",
      "Neck": "neck_01", "Head": "Head"}
for s, t in (("L", "l"), ("R", "r")):
    VB.update({f"Shoulder.{s}": f"clavicle_{t}", f"UpperArm.{s}": f"upperarm_{t}", f"LowerArm.{s}": f"lowerarm_{t}",
               f"Wrist.{s}": f"hand_{t}", f"UpperLeg.{s}": f"thigh_{t}", f"LowerLeg.{s}": f"calf_{t}",
               f"Foot.{s}": f"foot_{t}"})
UV = {}
for k, v in VB.items():
    UV.setdefault(v, k)
UV["pelvis"] = "Hips"

# ------------------------------------------------------------------ 1. the brute stripped for it
me = BR.data
part = np.zeros(len(me.vertices), np.int32); me.attributes["part"].data.foreach_get("value", part)
co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
rag_mat = [i for i, m in enumerate(me.materials) if m and "rag" in m.name.lower()]
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
kill = {v.index for f in bm.faces if f.material_index in rag_mat for v in f.verts}
spikes = (part == 3) & ((((co[:, 2] > 0.25) & (co[:, 2] < 1.82) & (co[:, 1] > 0.05) & (np.abs(co[:, 0]) < 0.08)))
                        | ((np.abs(co[:, 0]) > 0.2) & (co[:, 2] > 0.25) & (co[:, 2] < 1.6)))
trophy = (part == 5) | ((part == 3) & (co[:, 2] > 0.6) & (co[:, 2] < 1.0) & (co[:, 1] < 0.05))
kill.update(np.where(spikes | trophy)[0].tolist())
bmesh.ops.delete(bm, geom=[bm.verts[i] for i in sorted(kill)], context="VERTS")
bm.to_mesh(me); bm.free()
log("brute: loincloth, trophy and %d spike verts removed" % int(spikes.sum()))

# ------------------------------------------------------------------ 2. his body, measured as tools/armor's Body
under = bpy.data.objects.new("under", me.copy())
bpy.context.collection.objects.link(under)
um = under.data
up = np.zeros(len(um.vertices), np.int32); um.attributes["part"].data.foreach_get("value", up)
bm = bmesh.new(); bm.from_mesh(um); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.where(up != 0)[0]], context="VERTS")   # skin only
bm.to_mesh(um); bm.free()
for g in under.vertex_groups:
    if g.name in UV:
        g.name = UV[g.name]
V = AB.world_verts(under)
lab = AB.heaviest(AB.weights(under))
bones = {}
for k, v in VB.items():
    b = ARM.data.bones.get(v)
    if b:
        bones[k] = (np.array(b.head_local), np.array(b.tail_local))
# the plates measure his torso and legs only (his hanging arms would widen every hoop round the waist)
TORSO_LEGS = ("Hips", "Body", "Abdomen", "Torso", "Chest", "Neck", "UpperLeg", "LowerLeg", "Foot")
km = np.array([l.startswith(TORSO_LEGS) for l in lab])
body = PC.Body(V[km], np.array(lab)[km], bones, np.zeros((1, 3)), np.array([0, -0.1, 1.67]))
skin = AB.Skin(under)
log("body: %d verts, waist %.2f neck %.2f armpit %.2f" % (len(V), body.waist, body.neck, body.armpit))


# shoulders and upper arms too, for the pauldrons (his forearms hang below their reach)
ka = np.array([l.startswith(("Chest", "Neck", "Torso", "Shoulder", "UpperArm")) for l in lab])
abody = PC.Body(V[ka], np.array(lab)[ka], bones, np.zeros((1, 3)), np.array([0, -0.1, 1.67]))
log("shoulder L %s elbow L %s" % (np.round(body.head("UpperArm.L"), 3), np.round(body.head("LowerArm.L"), 3)))

# ------------------------------------------------------------------ 3. the Fiend's Panoply, chest and legs, cut for him
wrap = K.wrap
smooth = PC.smooth
TAU = PC.TAU


def bump(x, c, w):
    return math.exp(-((x - c) / w) ** 2)


def tent(x, w):
    return max(0.0, 1.0 - abs(x) / w)


class HullField:
    """fit's radius plus a shaping offset, each ring pushed out to its convex hull: one convex
    form all round (no lobes, no valleys), for details to be cut into or raised on after."""

    def __init__(self, fit, offc, t0, t1, nt=64, na=96):
        self.fit, self.t0, self.t1, self.nt, self.na = fit, t0, t1, nt, na
        ts = np.linspace(t0, t1, nt)
        angs = (np.arange(na) + 0.5) / na * TAU
        R = np.array([[fit.radius(t, a) + offc(t, a) for a in angs] for t in ts])
        R = np.array([PC.ring_hull(r) for r in R])
        for _ in range(2):
            R[1:-1] = 0.5 * R[1:-1] + 0.25 * (R[:-2] + R[2:])
        self.R = R

    def r(self, t, a):
        ft = np.clip((t - self.t0) / (self.t1 - self.t0) * (self.nt - 1), 0, self.nt - 1.0001)
        fa = np.mod(a / TAU * self.na - 0.5, self.na)
        i0, k0 = int(ft), int(fa)
        s, q = ft - i0, fa - k0
        k1 = (k0 + 1) % self.na
        return ((1 - s) * ((1 - q) * self.R[i0, k0] + q * self.R[i0, k1]) +
                s * ((1 - q) * self.R[i0 + 1, k0] + q * self.R[i0 + 1, k1]))


def field_shell(hf, lo, hi, offd, rows, cols, arc=None):
    """PC.shell over a HullField: the hulled radius plus a detail offset."""
    angs = [TAU * k / cols for k in range(cols)] if arc is None else list(np.linspace(arc[0], arc[1], cols))
    V = []
    for i in range(rows):
        for a in angs:
            t = lo(a) + (hi(a) - lo(a)) * i / (rows - 1)
            V.append(hf.fit.point(t, a, hf.r(t, a) + offd(t, a)))
    return np.array(V), PC.grid(rows, len(angs), arc is None), len(angs)


def sculpted_cuirass(b, mat, rim, vees, gap=0.042):
    """A breastplate shaped for him, not hulled round his muscles: one convex barrel pushing
    forward under the gorget and flaring to his armpits so his waist reads narrow, peaking in
    one keel from the waist point to the neck; a backplate swelling over his shoulder blades
    either side of a deep spine channel; over the lower breast a pointed plackart rising to an
    arch, with a sharp keel, deep flutes and a gold boss."""
    base = b.waist - 0.015
    front, back, pit = b.neck + 0.012, b.neck - 0.03, b.armpit      # high in front: under the gorget
    H = front - base
    tc = base + 0.6 * H                         # the line of his pectorals
    point = 0.13
    fit = K.torso_fit(b, base - point - 0.03, b.neck + 0.05, K.TORSO, hard=0.07)

    def offc(t, a):                             # the convex form
        A = wrap(a)
        cf, sa = max(math.cos(A), 0.0), abs(math.sin(A))
        Ab = wrap(A - math.pi)
        o = gap
        o += 0.055 * bump(t, tc, 0.26 * H) * cf ** 1.2                                 # barrel chest
        o += 0.02 * smooth(t, base + 0.3 * H, pit) * sa ** 2                            # flaring to the pits
        o += 0.04 * (bump(Ab, 0.6, 0.45) + bump(Ab, -0.6, 0.45)) * bump(t, base + 0.72 * H, 0.22 * H)
        o -= 0.034 * max(-math.cos(A), 0.0) * (1 - smooth(t, base + 0.1, base + 0.5 * H))      # the back tapers in
        o += 0.012 * (1 - smooth(t, base, base + 0.07)) + 0.02 * (1 - smooth(t, base - point, base))
        return o

    hf = HullField(fit, offc, base - point - 0.03, b.neck + 0.05)

    def offd(t, a):                             # cut and raised into it
        A = wrap(a)
        Ab = wrap(A - math.pi)
        o = 0.036 * tent(A, 0.22) * smooth(t, base - 0.05, base + 0.05) * (1 - smooth(t, front - 0.08, front))
        o -= 0.034 * bump(Ab, 0.0, 0.12) * smooth(t, base - 0.02, base + 0.1) * (1 - smooth(t, back - 0.06, back))
        o += 0.012 * (bump(Ab, 0.21, 0.05) + bump(Ab, -0.21, 0.05)) * smooth(t, base, base + 0.1) * (
            1 - smooth(t, back - 0.06, back))                                          # the channel's lips
        return o

    def hi(a):
        h = front + (back - front) * (1 - math.cos(a)) / 2
        g = smooth(abs(math.sin(a)), 0.45, 0.85)
        return h * (1 - g) + pit * g

    lo = lambda a: base - point * max(0.0, 1 - abs(wrap(a)) / 0.55) ** 1.4
    v, f, cols = field_shell(hf, lo, hi, offd, rows=32, cols=128)
    out = [PC.piece("cuirass", v, f, mat, PC.cyl(fit, math.pi), w=K.CUIRASS, solid=0.005, sharp=28)]
    out[0]["fit"] = fit
    ring = v[-cols:]
    rv, rf = PC.edge_tube(ring + PC.norm(ring - [0, fit.o[1], ring[0][2]]) * 0.003, 0.01)
    out.append(PC.piece("cuirass rim", rv, rf, rim, PC.cyl(fit, math.pi), w=K.CUIRASS))
    out.append(K.rim_along("cuirass waist rim", v, cols, 0, rim, fit, r=0.009, w=K.CUIRASS))

    # the plackart: a pointed arch over the lower breastplate
    tp = base + 0.52 * H
    am = 1.45
    plo = lambda a: lo(a) - 0.014
    phi = lambda a: tp - (tp - base - 0.05) * (abs(a) / am) ** 1.25

    def poff(t, a):
        kl = 0.05 * tent(a, 0.2) * (1 - smooth(t, tp - 0.1, tp))
        fl = 0.022 * (0.5 + 0.5 * math.cos(10 * a)) ** 5 * (1 - abs(a) / am) * smooth(abs(a), 0.2, 0.3) * (
            1 - smooth(t, tp - 0.12, tp - 0.03))
        return 0.018 + kl + fl
    pv, pf, pc_ = field_shell(hf, plo, phi, poff, rows=18, cols=81, arc=(-am, am))
    out.append(PC.piece("plackart", pv, pf, mat, PC.cyl(fit, math.pi), w=K.CUIRASS, solid=0.005, sharp=28))
    out.append(K.rim_along("plackart rim", pv, pc_, 17, rim, fit, r=0.009, closed=False, w=K.CUIRASS))
    out.append(K.rim_along("plackart foot", pv, pc_, 0, rim, fit, r=0.009, closed=False, w=K.CUIRASS))

    if vees:
        t = tp + 0.62 * (front - tp)
        out.append(K.vee("cuirass", fit.point(t, 0, hf.r(t, 0) + 0.03), fit.dir(0), (0, 0, 1), 0.17, *vees,
                         name="V on the breast"))
        t = base + 0.62 * (back - base)
        out.append(K.vee("cuirass", fit.point(t, math.pi, hf.r(t, math.pi) + 0.03), fit.dir(math.pi), (0, 0, 1),
                         0.16, *vees, name="V on the back"))
        t = base + 0.09
        out.append(K.rondel("plackart", fit.point(t, 0, hf.r(t, 0) + 0.06), fit.dir(0), (0, 0, 1), 0.085, vees[0],
                            mat, v=vees[1], name="plackart boss"))
    return out


def brute_tassets(b, mat, rim, vees, top, lames=3, h=0.085, gap=0.105, width=0.6):
    """Plates hanging over the front of each thigh from the fauld, heavy gold-rimmed edges and a
    V on the lowest."""
    fit = K.torso_fit(b, top - lames * h - 0.1, top + 0.05, hard=0.06)
    out = []
    for side in "LR":
        ac = 0.5 * PC.sgn(side)
        for k in range(lames):
            lo, hi = top - (k + 1) * h, top - k * h + 0.02
            off = lambda t, a, k=k, lo=lo, hi=hi: gap + 0.012 * k + 0.022 * (hi - t) / (hi - lo)
            lo_ = (lambda a, lo=lo, ac=ac: lo - 0.06 * tent(a - ac, width)) if k == lames - 1 else lo
            v, f, tc = PC.shell(fit, lo_, hi, off, rows=5, cols=17, arc=(ac - width, ac + width))
            out.append(K.rim_along(f"tasset rim {side} {k + 1}", v, tc, 0, rim, fit, r=0.0075, closed=False,
                                   w=K.CUIRASS))
            out.append(PC.piece(f"tasset {side} {k + 1}", v, f, mat, PC.cyl(fit, math.pi), w=K.CUIRASS,
                                solid=0.0045, sharp=28))
            if k == lames - 1:
                t = lo + 0.045
                out.append(raised(K.vee(f"tasset {side} {k + 1}", fit.point(t, ac, fit.radius(t, ac) + off(t, ac) + 0.03),
                                        fit.dir(ac), (0, 0, 1), 0.09, *vees)))
    return out


def raised(spec, k=2.5):
    """An emblem standing k times prouder of its plate."""
    spec["layers"] = [(l[0], l[1], l[2] * k, l[3] * k) + tuple(l[4:]) for l in spec["layers"]]
    return spec


def brute_gorget(b, mat, rim, n=5, lo0=-0.17, gap=0.02, xr=0.31):
    """A tall collar: n lames square to his forward-leaning neck, from over the top of the
    breastplate up to where his head begins at every angle (under the jaw in front, the skull
    behind), so only his head shows. The lowest lames spread over his trapezius (measured this
    time: it is weighted to his clavicles) and tuck under the pauldrons, their outer edges riding
    his collarbones; each lame overlaps the next by a third, gold-rolled at the top."""
    nk, hd = b.head("Neck"), b.head("Head")
    ax = PC.norm(hd - nk)
    m = b.mask("Neck") | (b.mask("Chest", "Torso", "Shoulder") & (b.V[:, 2] > b.neck - 0.2) &
                          (np.abs(b.V[:, 0]) < xr))
    fit = PC.Fit(b.V[m], nk, ax, (0, -1, 0), lo0 - 0.03, 0.3, nt=50, na=48, hard=0.02)
    # where his head begins round the collar: the lowest head-weighted skin per angle
    hm = np.array([l.startswith("Head") for l in lab])
    d = V[hm] - nk
    th = d @ fit.ax
    ah = np.mod(np.arctan2(d @ fit.w, d @ fit.u), TAU)
    na = 48
    bins = (ah / TAU * na).astype(int) % na
    tmin = np.full(na, 0.3)
    np.minimum.at(tmin, bins, th)
    for _ in range(3):
        tmin = np.minimum(tmin, 0.5 * tmin + 0.25 * (np.roll(tmin, 1) + np.roll(tmin, -1)))
    tmin -= 0.012
    log("collar top (front, side, back): %.3f %.3f %.3f, base %.3f, head %.3f" % (
        tmin[0], tmin[na // 4], tmin[na // 2], lo0, float(np.linalg.norm(hd - nk))))

    def ttop(a):
        fa = np.mod(a / TAU * na - 0.5, na)
        k0 = int(fa)
        q = fa - k0
        return (1 - q) * tmin[k0] + q * tmin[(k0 + 1) % na]

    ov = 1.45                                   # each lame 1.45 steps tall: a third overlapped
    step = lambda a: (ttop(a) - lo0) / (n - 1 + ov)

    def wt(k):
        s_ = k / (n - 1)
        def w(p):
            sh = 0.6 * smooth(abs(p[0]), 0.12, 0.27) * (1 - s_)
            side = "L" if p[0] > 0 else "R"
            out_ = {"Chest": (0.85 - 0.55 * s_) * (1 - sh), "Neck": (0.15 + 0.55 * s_) * (1 - sh)}
            if sh > 0:
                out_["Shoulder." + side] = sh
            return out_
        return w

    def side_x(t, a):
        return abs(fit.point(t, a, fit.radius(t, a))[0])

    out = []
    for k in range(n):
        lo = lambda a, k=k: lo0 + step(a) * k
        hi = lambda a, k=k: lo0 + step(a) * (k + ov)

        def off(t, a, k=k, lo=lo, hi=hi):
            q = (t - lo(a)) / max(hi(a) - lo(a), 1e-4)
            return (gap + 0.011 * (n - 1 - k) + 0.01 * (1 - q)
                    - 0.04 * smooth(side_x(t, a), 0.2, 0.29))          # under the pauldrons
        v, f, cols = PC.shell(fit, lo, hi, off, rows=4, cols=48)
        w = wt(k)
        out.append(PC.piece(f"gorget {k + 1}", v, f, mat, PC.cyl(fit, math.pi), w=w, solid=0.005, sharp=28))
        out.append(K.rim_along(f"gorget rim {k + 1}", v, cols, 3, rim, fit, r=0.0065, w=w))
        if k == 0:
            out.append(K.rim_along("gorget foot rim", v, cols, 0, rim, fit, r=0.0065, w=w))
    return out


def brute_skirt(b, mat, top, length=0.26, gap=0.045):
    """Mail hung from the belt: from the widest it passes down it falls straight, an A-line
    drape, not a skin over his rear."""
    fit = K.torso_fit(b, top - length - 0.08, top + 0.06, hard=0.04)
    ts = np.linspace(top + 0.02, top - length, 24)
    memo = {}

    def hang(t, a):
        key = round(a, 6)
        if key not in memo:
            memo[key] = np.maximum.accumulate([fit.radius(x, a) for x in ts])
        return float(np.interp(-t, -ts, memo[key]))
    off = lambda t, a: gap + hang(t, a) - fit.radius(t, a) + 0.015 * max((top - t) / length, 0.0) ** 1.5
    v, f, _ = PC.shell(fit, top - length, top + 0.02, off, rows=7, cols=48)
    return [PC.piece("mail skirt", v, f, mat, PC.cyl(fit, math.pi), w=K.CUIRASS)]


def brute_pauldron(b, side, mat, rim, vees, S=1.6, lames=4, gap=0.05, haute=0.09):
    """The Fiend's pauldron at his scale: a domed cop with a sharp crest over the point of the
    shoulder, reaching in over his trapezius and round to chest and blade, its lip flaring off
    the deltoid; a thick upright haute-piece leaning in to guard his neck; then lames stepping
    down his arm, each narrower and shorter, flared at its foot over the next."""
    s = PC.sgn(side)
    sh, el = b.head("UpperArm." + side), b.head("LowerArm." + side)
    m = (b.V[:, 0] * s > 0.03) & (b.V[:, 2] > b.armpit + 0.02)
    fit = PC.Fit(b.V[m], sh, el - sh, (0, 0, 1), -0.17 * S, 0.24 * S, nt=40, na=40, mirror=(side == "R"),
                 hard=0.05)
    cop = {"Shoulder." + side: 0.45, "UpperArm." + side: 0.55}
    reach = 0.075 * S
    lo = lambda a: -reach + 0.04 * S * (1 - math.cos(a))
    hi = lambda a: 0.036 * S + 0.03 * S * math.cos(a)

    def off(t, a):
        q = min(max((t - lo(a)) / (hi(a) - lo(a)), 0), 1)
        return (gap + 0.024 * S * math.sin(math.pi * q) * math.cos(a / 2.2)
                + 0.034 * tent(a, 0.16) * math.sin(math.pi * min(q * 1.15, 1)) ** 0.5   # the crest
                + 0.03 * smooth(q, 0.7, 1.0))                                            # the lip flares out
    rows = 18
    v, f, cols = PC.shell(fit, lo, hi, off, rows=rows, cols=49, arc=(-1.8, 1.8))
    out = [PC.piece(f"pauldron {side}", v, f, mat, PC.cyl(fit, math.pi), w=cop, solid=0.006, sharp=28)]
    out.append(K.rim_along(f"pauldron rim {side}", v, cols, rows - 1, rim, fit, r=0.01, closed=False, w=cop))
    out.append(K.rim_along(f"pauldron neck rim {side}", v, cols, 0, rim, fit, r=0.007, closed=False, w=cop))
    if haute:
        angs = np.linspace(-1.2, 1.2, 15)
        base_ = [fit.point(lo(a) + 0.022, a, fit.radius(lo(a) + 0.022, a) + off(lo(a) + 0.022, a) - 0.004) for a in angs]
        lean = PC.norm(np.array([-0.32 * s, 0.0, 1.0]))
        prof = lambda q: haute * math.sin(math.pi * q) ** 0.45
        out.append(O.fin(f"haute-piece {side}", base_, lean, prof, 0.016, mat, cop))
        top = [p + lean * prof(i / 14) for i, p in enumerate(base_)]
        rv, rf = PC.edge_tube(np.array(top), 0.009, closed=False)
        out.append(PC.piece(f"haute-piece rim {side}", rv, rf, rim, ("box",), w=cop))
    if vees:
        a, t = 0.8, 0.004
        out.append(K.vee(f"pauldron {side}", fit.point(t, a, fit.radius(t, a) + off(t, a) + 0.02), fit.dir(a), -fit.ax,
                         0.11, *vees))
    t_k = 0.036 * S + 0.012
    for k in range(1, lames):
        h = 0.044 * S * (1 - 0.13 * (k - 1))
        half = 1.62 - 0.12 * (k - 1)
        lo_k = lambda a, t_k=t_k: t_k + 0.022 * S * math.cos(a)
        hi_k = lambda a, t_k=t_k, h=h: t_k + h + 0.022 * S * math.cos(a)
        fl = 0.012 + 0.012 * (k == lames - 1)
        offk = lambda t, a, k=k, h=h, fl=fl, lo_k=lo_k: (gap + 0.012 - 0.007 * k
                                                        + fl * smooth((t - lo_k(a)) / h, 0.45, 1.0))
        lv, lf, lc = PC.shell(fit, lo_k, hi_k, offk, rows=5, cols=31, arc=(-half, half))
        lw = {"Shoulder." + side: 0.3 - 0.08 * k, "UpperArm." + side: 0.7 + 0.08 * k}
        out.append(PC.piece(f"pauldron {side} lame {k}", lv, lf, mat, PC.cyl(fit, math.pi), w=lw, solid=0.005,
                            sharp=28))
        out.append(K.rim_along(f"pauldron {side} lame rim {k}", lv, lc, 4, rim, fit, r=0.0075, closed=False, w=lw))
        t_k += h * 0.72                         # each overlaps the next by a quarter
    return out


def brute_poleyn(b, side, mat, rim, vees, S=1.35, gap=0.035):
    """tools/armor's knee cop at his scale: a deep dome, a broad fan on the outside of the knee,
    gold rims and a V."""
    k = b.head("LowerLeg." + side)
    d = PC.norm(PC.norm(b.tail("UpperLeg." + side) - b.head("UpperLeg." + side)) +
                PC.norm(b.tail("LowerLeg." + side) - k))
    m = b.mask("UpperLeg." + side, "LowerLeg." + side)
    fit = PC.Fit(b.V[m], k, d, (0, -1, 0), -0.14 * S, 0.14 * S, nt=28, na=36, mirror=(side == "R"), hard=0.04)
    knee = {"UpperLeg." + side: 0.5, "LowerLeg." + side: 0.5}
    e = lambda a: math.sqrt(max(1 - (a / 1.62) ** 2, 0.08))
    lo, hi = (lambda a: -0.065 * S * e(a)), (lambda a: 0.06 * S * e(a))

    def off(t, a):
        q = (t - lo(a)) / (hi(a) - lo(a))
        return gap + 0.026 * math.sin(math.pi * q) * e(a) + 0.05 * tent(a, 0.13) * math.sin(math.pi * q) ** 0.6
    v, f, _ = PC.shell(fit, lo, hi, off, rows=10, cols=21, arc=(-1.55, 1.55))
    out = [PC.piece(f"poleyn {side}", v, f, mat, PC.cyl(fit, math.pi), w=knee, solid=0.005, sharp=28)]
    out.append(K.rim_along(f"poleyn rim {side}", v, 21, 0, rim, fit, r=0.007, closed=False, w=knee))
    out.append(K.rim_along(f"poleyn rim top {side}", v, 21, 9, rim, fit, r=0.007, closed=False, w=knee))
    out.append(K.vee(f"poleyn {side}", fit.point(0.0, 0.3, fit.radius(0.0, 0.3) + 0.08), fit.dir(0.3), -fit.ax,
                     0.06, *vees))
    a0, a1 = -1.2, -2.3
    hh = lambda a: 0.012 + 0.09 * (1 - (a - a0) / (a1 - a0)) ** 0.8
    wv, wf, wc = PC.shell(fit, lambda a: -hh(a), hh, lambda t, a: gap + 0.02 + 0.03 * (a0 - a), rows=6, cols=11,
                          arc=(a1, a0))
    out.append(PC.piece(f"poleyn wing {side}", wv, wf, mat, PC.cyl(fit, 0.0), w=knee, solid=0.004, sharp=28))
    rv, rf = PC.edge_tube(np.array([wv[i * wc] for i in range(6)]), 0.006, closed=False)
    out.append(PC.piece(f"poleyn wing rim {side}", rv, rf, rim, ("box",), w=knee))
    return out


def brute_fiend(b, ab):
    from sets import tint
    M = dict(FIEND, iron=tint("scratched_steel_dark", (42, 42, 49)), mail="iron_heavy_mail_dark",
             gold="polished_gold_dark")
    vees = (M["gold"], M["ember"])
    out = sculpted_cuirass(b, M["iron"], M["gold"], vees)
    faulds, bottom = K.fauld(b, M["iron"], lames=2, h=0.05, gap=0.04, box=0.0, rim=M["gold"])
    out += faulds + brute_skirt(b, M["mail"], bottom + 0.01)
    out += brute_tassets(b, M["iron"], M["gold"], vees, bottom + 0.012)
    out += G.belt(b, M["iron"], gap=0.06, h=0.06,
                  buckle=lambda nm, p, d, u: K.rondel(nm, p, d, u, 0.08, M["gold"], M["iron"], v=M["ember"]))
    out += brute_gorget(ab, M["iron"], M["gold"])
    for s in "LR":
        out += brute_pauldron(ab, s, M["iron"], M["gold"], vees)
        out += K.cuisse(b, s, M["iron"], gap=0.03, t0=0.1, box=0.0, rim=M["gold"])
        out += brute_poleyn(b, s, M["iron"], M["gold"], vees)
        gr = K.greave(b, s, M["iron"], gap=0.028, flare=-0.012, rim=M["gold"], ridge=0.03, vees=None, box=0.0)
        gf, L = gr[0]["fit"], float(np.linalg.norm(b.tail("LowerLeg." + s) - b.head("LowerLeg." + s)))
        t = 0.11 * L + 0.08
        out.append(raised(K.vee(f"greave {s}", gf.point(t, 0, gf.radius(t, 0) + 0.07), gf.dir(0), -gf.ax, 0.085, *vees)))
        out += gr + [K.rim_along(f"greave foot rim {s}", gr[0]["v"], 28, 9, M["gold"], gr[0]["fit"],
                                 w={"LowerLeg." + s: 1.0})]
    return out


pcs = brute_fiend(body, abody)
made, objs = {}, []
for pc in pcs:
    if pc.get("kind") == "emblem":
        continue
    o = AB.make_piece(pc, ARM, skin)
    made[pc["name"]] = o
    objs.append(o)
for pc in pcs:
    if pc.get("kind") == "emblem" and pc["target"] in made:
        objs.append(AB.make_emblem(pc, made[pc["target"]], ARM))
log("pieces", len(objs))

# ------------------------------------------------------------------ 4. dark mail under the leg plates
mm = um.copy()
mo = bpy.data.objects.new("mail", mm)
bpy.context.collection.objects.link(mo)
for g in under.vertex_groups:
    mo.vertex_groups.new(name=g.name)
bm = bmesh.new(); bm.from_mesh(mm); bm.verts.ensure_lookup_table()
ank = min(bones["Foot.L"][0][2], bones["Foot.R"][0][2]) + 0.1
keep = set()
for f in bm.faces:
    c = f.calc_center_median()
    lb = lab[f.verts[0].index]
    kzs = [bones["LowerLeg.L"][0][2], bones["LowerLeg.R"][0][2]]
    if (lb.startswith("UpperLeg") or (abs(c.z - kzs[0]) < 0.17 and lb.startswith("LowerLeg"))):   # thighs and knees
        keep.add(f)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in keep], context="FACES")
for v in bm.verts:
    v.co += v.normal * 0.009
bm.to_mesh(mm); bm.free()
mm.materials.clear()
mm.materials.append(AB.material(FIEND["mail"]))
for p in mm.polygons:
    p.material_index = 0
    p.use_smooth = True
uvl = mm.uv_layers.active or mm.uv_layers.new(name="UVMap")
tw, th = AB.tile(FIEND["mail"])
for p in mm.polygons:                                  # box-projected rings, tile-sized
    ax = max(range(3), key=lambda i: abs(p.normal[i]))
    for li in p.loop_indices:
        c = mm.vertices[mm.loops[li].vertex_index].co
        a_, b_ = [(c.y, c.z), (c.x, c.z), (c.x, c.y)][ax]
        uvl.data[li].uv = (a_ / tw, b_ / th)
AB.rig(mo, ARM)
objs.append(mo)
bpy.data.objects.remove(under, do_unlink=True)

# ------------------------------------------------------------------ 5. one mesh on his bones
A = AB.join(objs, "Armor")
for g in A.vertex_groups:
    if g.name in VB:
        tgt = VB[g.name]
        if tgt in A.vertex_groups and A.vertex_groups[tgt] is not g:
            src = g
            dst = A.vertex_groups[tgt]
            for v in A.data.vertices:
                for gg in v.groups:
                    if gg.group == src.index:
                        dst.add([v.index], gg.weight, "ADD")
            A.vertex_groups.remove(src)
        else:
            g.name = tgt
# every group (villager name, UAL name, or a ".001" twin from the join) folded onto his bones
names = {g.index: g.name for g in A.vertex_groups}
acc = []
for v in A.data.vertices:
    w = {}
    for gg in v.groups:
        base = names[gg.group].split(".0")[0]
        b = VB.get(base, base)
        if b in ARM.data.bones and gg.weight > 1e-4:
            w[b] = w.get(b, 0.0) + gg.weight
    t = sum(w.values())
    acc.append({k: x / t for k, x in w.items()} if t > 0 else {"spine_02": 1.0})
AB.set_weights(A, acc)
AB.rig(A, ARM)
# steel that reads as steel, gold as gold: harder, glossier metal than the swatch defaults
for m in A.data.materials:
    bs = m and m.node_tree and next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bs is None:
        continue
    if "gold" in m.name or "copper" in m.name:
        bs.inputs["Metallic"].default_value, bs.inputs["Roughness"].default_value = 1.0, 0.27
    elif "steel" in m.name:
        bs.inputs["Metallic"].default_value, bs.inputs["Roughness"].default_value = 0.75, 0.36
log("armour verts", len(A.data.vertices), "groups", sorted(g.name for g in A.vertex_groups))

ARM.scale = (SCALE, SCALE, SCALE)
bpy.context.view_layer.update()

# ------------------------------------------------------------------ 6. export like build.py
me = BR.data
if "Atlas" in me.uv_layers:
    me.uv_layers.remove(me.uv_layers["UVMap"])
    me.uv_layers["Atlas"].name = "UVMap"
for m in me.materials:
    if m and m.node_tree:
        for nd in m.node_tree.nodes:
            if nd.type in ("UVMAP", "NORMAL_MAP"):
                nd.uv_map = "UVMap"
me.uv_layers.active = me.uv_layers["UVMap"]
bpy.ops.wm.save_as_mainfile(filepath=OUT_GLB[:-4] + ".blend")
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
kw = dict(filepath=OUT_GLB, export_format="GLB", export_animations=True, export_tangents=True,
          export_skins=True, export_apply=False)
for k, v in (("export_animation_mode", "ACTIONS"), ("export_image_format", "WEBP"), ("export_image_quality", 90),
             ("export_vertex_color", "ACTIVE"), ("export_all_vertex_colors", False), ("export_def_bones", False)):
    if k in props:
        kw[k] = v
bpy.ops.export_scene.gltf(**kw)
log("exported", OUT_GLB, os.path.getsize(OUT_GLB) // 1024, "KB")
