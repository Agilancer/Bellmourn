"""Weapons remodelled from three free packs (see imported.py for the machinery):

- KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg, CC0): rapier, messer, butcher's axe, halberd
- Quaternius Medieval Weapons Pack (CC0): reliquary blade, bloodletter, dane axe, coffin
  hammer
- Oubliette free weapons (Timberwolf Games, public domain), 2D sprites lifted into 3D:
  penitent's greatsword, gaoler's hook, tombstone, wolf-jaw sickle

Each builder takes the source, turns it into the socket frame, re-proportions it to the rig
(one-handers end near y=0.62, two-handers near 1.0-1.08 with the butt at -0.28..-0.30), cuts
or replaces what doesn't suit Bellmourn and adds new pieces, then names its parts for the
dressing (dress.py) and the texture sheet. items.py adds them to ITEMS after the hand-built
ones, so every tool that walks ITEMS (catalogs, manifest) sees them.

The source files live in art/raw/weapons/<kaykit|quaternius|oubliette>/ (the packs' own
files, unchanged; art/raw is not in git). To build just these into templates/models/items:

    python tools/models/remodels.py [id ...]
"""
import os

import numpy as np

import imported as M
from autotexture import MOSSSTONE, WAX
from geom import Model
from kit import (BONE, BRASS, DARKIRON, DARKLEATHER, DARKWOOD, GEM_RED, GOLD, HORN, IRON,
                 LEATHER, RED, STEEL, WOOD, X, Y, ball, blade, gem, part, plate, ring, shaft,
                 spike, turned)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PACKS = os.environ.get("BELLMOURN_WEAPON_PACKS") or os.path.join(ROOT, "art", "raw", "weapons")
KAYKIT = os.path.join(PACKS, "kaykit")
QUAT = os.path.join(PACKS, "quaternius")
OUB = os.path.join(PACKS, "oubliette")


# items.py imports this module, so its helpers are fetched when first called
def grip(*a, **kw):
    import items
    return items.grip(*a, **kw)


def tube(*a, **kw):
    import items
    return items.tube(*a, **kw)


def kaykit(name):
    return M.load(os.path.join(KAYKIT, f"{name}.obj"), atlas_cells=(8, 4))


def pieces(m):
    """KayKit pieces from the butt up."""
    return [k for k, *_ in m.comps_by_y()]


def wire_rings(y0, y1, r, n, color=BRASS, name="grip wire"):
    return [ring(f"{name} {i + 1}", color, (0, y0 + (y1 - y0) * (i + 0.5) / n, 0), Y, r, 0.0018,
                 n=10, m=3) for i in range(n)]


# ================================================================ KayKit


def mourners_rapier():
    """sword_D: the cup hilt kept (cup made shallower and wider, quillons lengthened, the
    back quillon swept toward the blade), the stubby blade replaced by a long slender
    one with a ricasso, the blue grip by black leather bound in brass wire."""
    m = kaykit("sword_D")
    grip_k, bow_k, guard_k, cup_k, blade_k = pieces(m)
    m.drop(m.where(comps=[blade_k]) | m.where(comps=[grip_k], mats=["c0r3"]))
    m.turn(-90).scale(0.32)
    cup = m.verts_of(m.where(comps=[cup_k]))
    c0, c1 = m.bounds(m.where(comps=[cup_k]))
    m.scale((1.12, 0.72, 1.12), about=(0, c0[1], 0), verts=cup)
    gv = m.verts_of(m.where(comps=[guard_k]))
    m.scale((1, 1, 1.3), verts=gv)
    m.warp(lambda p: p + np.c_[0 * p[:, 0], 2.2 * np.minimum(p[:, 2], 0) ** 2, 0 * p[:, 0]],
           verts=gv)
    _, cup_top = (b[1] for b in m.bounds(m.where(comps=[cup_k])))
    cp = m.v[cup]
    rad = np.hypot(cp[:, 0], cp[:, 2])
    rim_y, rim_r = cp[np.argmax(rad), 1], rad.max()
    pom = m.where(comps=[grip_k])
    p0, p1 = m.bounds(pom)
    g0, _ = m.bounds(m.where(comps=[guard_k]))
    return [blade("blade", STEEL, cup_top - 0.012, 0.612,
                  [(0, 0.0085), (0.10, 0.0085), (0.13, 0.0115), (0.8, 0.008), (1, 0.0008)],
                  [(0, 0.0045), (1, 0.0028)], "hex", n=10),
            m.part("cup", IRON, m.where(comps=[cup_k]), v_label=None),
            ring("cup rim", BRASS, (0, rim_y, 0), Y, rim_r * 0.99, 0.0032, n=16, m=4),
            m.part("quillons", DARKIRON, m.where(comps=[guard_k]), v_label=None),
            m.part("knuckle bow", DARKIRON, m.where(comps=[bow_k]), v_label=None),
            m.part("pommel", BRASS, m.where(comps=[grip_k]), v_label=None),
            grip(p1[1] - 0.004, g0[1] + 0.003, 0.0145, DARKLEATHER),
            *wire_rings(p1[1], g0[1], 0.0153, 6)]


def grave_messer():
    """sword_C: the slim curved blade broadened into a heavy single-edged messer with a
    clipped point, the guard widened into a straight cross with a nagel (the side spike
    that guards the knuckles), the tan wrap turned to hide and an iron pommel cap."""
    m = kaykit("sword_C")
    grip_k, guard_k, blade_k = pieces(m)
    m.turn(90)  # the tip bends toward -z: the edge (+z) is the convex side
    m.move((0, 0.08, 0)).scale(0.31)
    bf = m.where(comps=[blade_k])
    bv = m.verts_of(bf)
    b0, b1 = m.bounds(bf)
    y0, y1 = b0[1], b1[1]

    def broaden(p):
        # the blade's centre line (a smooth fit through each height's middle), how far its
        # edge and spine sides reach at each height, then every vertex re-placed on a messer
        # profile by the fraction of that reach it sat at (so the source's little wobbles
        # don't grow with it)
        ys = np.linspace(y0, y1, 20)
        band = (y1 - y0) / 14
        mids, keep = [], []
        for y in ys:
            q = p[np.abs(p[:, 1] - y) < band, 2]
            if len(q):
                mids.append((q.min() + q.max()) / 2)
                keep.append(y)
        c = np.polyval(np.polyfit(keep, mids, 2), p[:, 1])
        d = p[:, 2] - c
        reach_e = np.array([max(d[(np.abs(p[:, 1] - y) < band) & (d > 0)].max(initial=1e-4), 1e-4)
                            for y in ys])
        reach_s = np.array([max((-d[(np.abs(p[:, 1] - y) < band) & (d < 0)]).max(initial=1e-4), 1e-4)
                            for y in ys])
        f_e = d / np.interp(p[:, 1], ys, reach_e)
        f_s = -d / np.interp(p[:, 1], ys, reach_s)
        s = np.clip((p[:, 1] - y0) / (y1 - y0), 0, 1)
        belly = np.where(s < 0.7, 0.027 + 0.010 * s / 0.7,
                         0.037 * np.sqrt(np.clip(1 - ((s - 0.7) / 0.3) ** 2, 0, 1)))
        spine = np.where(s < 0.78, 0.008, 0.008 * np.clip((1 - s) / 0.22, 0, 1))
        p[:, 2] = c + np.where(d > 0, np.clip(f_e, 0, 1) * belly, -np.clip(f_s, 0, 1) * spine)
        p[:, 0] *= 1.8  # a thicker spine
        return p
    m.warp(broaden, verts=bv)
    m.remap_y([(y0, y0), (y1, 0.60)], verts=bv)
    gv = m.verts_of(m.where(comps=[guard_k]))
    g0, g1 = m.bounds(m.where(comps=[guard_k]))
    m.scale((0.5, 1.0, 2.4), about=((g0 + g1) / 2), verts=gv)
    h0, h1 = m.bounds(m.where(comps=[grip_k]))
    gy = (g0[1] + g1[1]) / 2
    return [m.part("blade", STEEL, bf),
            m.part("crossguard", IRON, m.where(comps=[guard_k]), v_label=None),
            spike("nagel", IRON, (0.006, gy, 0.004), (1, 0.25, 0), 0.03, 0.0055, n=4),
            m.part("grip", LEATHER, m.where(comps=[grip_k])),
            turned("pommel cap", IRON, h0[1] - 0.012, [(0.004, 0), (0.019, 0.004), (0.021, 0.012),
                                                      (0.017, 0.02)], n=8)]


def butchers_axe():
    """axe_C: the cleaver blade raked forward and thinned, the haft re-proportioned for one
    hand (fist below the blade), the bands kept as blackened iron, a top spike and a hook
    for hanging it in the shambles added."""
    m = kaykit("axe_C")
    haft_k, cap_k, blade_k, band1_k, plate1_k, band2_k, plate2_k = pieces(m)
    m.turn(90)  # the blade (-x in the source) to +z
    m.remap_y([(-0.418, -0.14), (-0.12, 0.0), (0.045, 0.16), (0.934, 0.56)])
    m.scale((0.25, 1, 0.25))
    bf = m.where(comps=[blade_k])
    bv = m.verts_of(bf)
    b0, b1 = m.bounds(bf)
    m.scale((0.55, 1, 0.78), about=(0, 0, 0), verts=bv)
    m.warp(lambda p: p + np.c_[0 * p[:, 0], 0 * p[:, 0],
                               0.16 * np.clip(p[:, 1] - b0[1], 0, None) * (p[:, 2] / b1[2])],
           verts=bv)
    top = m.bounds(m.where(comps=[haft_k]))[1][1]
    bands = [band1_k, band2_k, plate1_k, plate2_k]
    return [m.part("cleaver blade", STEEL, bf, v_label=None),
            m.part("haft", WOOD, m.where(comps=[haft_k], mats=["c4r2"])),
            m.part("grip wrap", LEATHER, m.where(comps=[haft_k], mats=["c6r2"])),
            m.part("bands", DARKIRON, m.where(comps=bands), v_label=None),
            m.part("butt cap", DARKIRON, m.where(comps=[cap_k]), v_label=None),
            spike("top spike", IRON, (0, top - 0.004, 0), Y, 0.06, 0.012, n=4),
            M.Part("hook", "item", IRON,
                   M.box_islands("hook", *_tube_mesh(
                       [(0, top - 0.02, -0.012), (0, top - 0.01, -0.03), (0, top - 0.03, -0.045),
                        (0, top - 0.055, -0.04), (0, top - 0.06, -0.028)], 0.0035)))]


def _tube_mesh(pts, r, n=5):
    """(verts, tris) of a round tube along points (for box-projected parts)."""
    isl = tube("t", IRON, pts, r, n=n, caps=(True, True)).islands
    v, t, off = [], [], 0
    for i in isl:
        v.append(i.v)
        t.append(i.t + off)
        off += len(i.v)
    return np.concatenate(v), np.concatenate(t)


def gravewarden_halberd():
    """halberd: the stubby haft drawn out to a real pole (the wrap where both hands go),
    the head kept but its axe blade given a hooked lower horn, the blue gem petals cut and
    replaced by iron collars, langets riveted down the haft, the top spike lengthened."""
    m = kaykit("halberd")
    ks = pieces(m)
    butt_k = ks[0]
    petals = [k for k in ks if (m.mat[m.comp == k] == "c0r3").all()]
    ring_k = next(k for k, y0, *_ in m.comps_by_y() if -0.65 < y0 < -0.6)
    haft_k = next(k for k, y0, y1, n in m.comps_by_y() if n == 280)
    head_k = next(k for k, y0, y1, n in m.comps_by_y() if n == 248)
    sock_k = next(k for k, y0, y1, n in m.comps_by_y() if n == 208)
    top_k = ks[-1]
    m.drop(m.where(comps=petals))
    m.turn(90)  # axe blade (-x in the source) to +z
    m.remap_y([(-0.932, -0.30), (-0.625, -0.235), (-0.23, -0.16), (0.22, 0.05), (0.42, 0.60),
               (1.362, 0.865), (1.815, 1.085)])
    m.scale((0.22, 1, 0.22))
    hf = m.where(comps=[head_k])
    hv = m.verts_of(hf)
    h0, h1 = m.bounds(hf)
    mid = (h0[1] + h1[1]) / 2

    def horn(p):  # drag the blade's lower corner down into a hooked horn
        far = np.clip((p[:, 2] - 0.05) / max(h1[2] - 0.05, 1e-6), 0, 1)
        low = np.clip((mid - p[:, 1]) / (mid - h0[1]), 0, 1)
        p[:, 1] -= 0.07 * far ** 1.5 * low
        p[:, 2] += 0.025 * far * low
        p[:, 0] *= 0.75
        return p
    m.warp(horn, verts=hv)
    sv = m.verts_of(m.where(comps=[top_k]))
    t0, t1 = m.bounds(m.where(comps=[top_k]))
    s0, s1 = m.bounds(m.where(comps=[sock_k]))
    langets = [plate(f"langet {i + 1}", IRON, [(-0.007, 0.40), (0.007, 0.40), (0.009, s0[1] + 0.01),
                                               (-0.009, s0[1] + 0.01)], 0.002, x=sx)
               for i, sx in enumerate((0.0185, -0.0185))]
    return [m.part("axe head", STEEL, hf, v_label=None),
            m.part("socket", DARKIRON, m.where(comps=[sock_k]), v_label=None),
            m.part("top spike", STEEL, m.where(comps=[top_k])),
            m.part("haft", DARKWOOD, m.where(comps=[haft_k], mats=["c4r2"])),
            m.part("grip wrap", LEATHER, m.where(comps=[haft_k], mats=["c6r2"])),
            m.part("butt ring", DARKIRON, m.where(comps=[ring_k]), v_label=None),
            m.part("butt spike", IRON, m.where(comps=[butt_k])),
            ring("collar", DARKIRON, (0, s0[1] - 0.004, 0), Y, 0.019, 0.005, n=10, m=4),
            ring("lower collar", DARKIRON, (0, -0.205, 0), Y, 0.0185, 0.005, n=10, m=4),
            *langets]


# ================================================================ Quaternius


def quat(name):
    return M.load(os.path.join(QUAT, f"{name}.obj"))


def reliquary_blade():
    """Sword_Golden: the gilded flame blade turned to dark etched steel with a bright
    honed edge and narrowed, its length drawn in to one-handed reach; the guard gilded, a
    relic garnet set in each face of it, the wooden grip become oxblood leather bound in
    gold wire."""
    m = quat("Sword_Golden")
    blade_f = m.where(mats=["Gold"])
    edge_f = m.where(mats=["LightGold"])
    guard_f = m.where(mats=["DarkSteel"], y=(0.3, 2.0))
    pommel_f = m.where(mats=["DarkSteel"], y=(-2.0, 0.3))
    grip_f = m.where(mats=["LightWood"])
    wire_f = m.where(mats=["DarkWood"])
    bv = m.verts_of(blade_f | edge_f)
    m.turn(-90)
    m.move((0, -0.06, 0)).scale(0.15)
    m.remap_y([(0.82 * 0.15 - 0.009, 0.82 * 0.15 - 0.009), (5.29 * 0.15, 0.625)], verts=bv)
    m.scale((1.0, 1.0, 0.68), verts=bv)
    g0, g1 = m.bounds(guard_f)
    gy = (g0[1] + g1[1]) / 2
    return [m.part("blade", STEEL, blade_f), m.part("honed edge", STEEL, edge_f),
            m.part("guard", GOLD, guard_f, v_label=None), m.part("pommel", GOLD, pommel_f),
            m.part("grip", LEATHER, grip_f), m.part("grip wire", GOLD, wire_f, v_label=None),
            gem("relic", GEM_RED, (g1[0] + 0.001, gy - 0.004, 0), X, 0.0085, 0.009),
            gem("relic back", GEM_RED, (g0[0] - 0.001, gy - 0.004, 0), -X, 0.0085, 0.009)]


def bloodletter():
    """Claymore (the red one): the blade lengthened and narrowed into a two-hander, made
    blackened steel with bright edges, barbs added at the base of the blade to catch and
    tear; the guard and pommel dark iron, the grip blood-red leather between iron rings."""
    m = quat("Claymore")
    blade_f = m.where(mats=["Red"])
    edge_f = m.where(mats=["LightRed"])
    guard_f = m.where(mats=["DarkSteel"], y=(1.4, 3.0))
    pommel_f = m.where(mats=["DarkSteel"], y=(-1.0, 1.4))
    grip_f = m.where(mats=["DarkBrown"])
    bands_f = m.where(mats=["Black"])
    bv = m.verts_of(blade_f | edge_f)
    m.turn(-90)
    m.remap_y([(-0.32, -0.33), (0.27, -0.20), (1.43, 0.07), (2.03, 0.198), (6.27, 1.0)])
    m.scale((0.233, 1, 0.233))
    m.scale((1.0, 1.0, 0.74), verts=bv)
    b0, b1 = m.bounds(blade_f | edge_f)
    barbs = []
    for i, y in enumerate((0.25, 0.30, 0.35)):
        hw = 0.040 - i * 0.002
        for sgn in (1, -1):
            barbs.append(spike(f"barb {len(barbs) + 1}", STEEL, (0, y, sgn * hw * 0.75),
                               (0, -0.6, sgn), 0.042, 0.0065, n=4))
    return [m.part("blade", STEEL, blade_f), m.part("honed edge", STEEL, edge_f),
            m.part("guard", DARKIRON, guard_f, v_label=None),
            m.part("pommel", DARKIRON, pommel_f, v_label=None),
            m.part("grip", RED, grip_f), m.part("grip rings", IRON, bands_f, v_label=None),
            *barbs]


def dane_axe():
    """Axe: the crooked haft drawn out to a two-handed pole with leather where the hands
    go, the huge crescent head brought down to Dane-axe size and bearded lower, the rope
    lashing replaced by riveted iron straps, an iron shoe on the crooked butt."""
    m = quat("Axe")
    ks = sorted(np.unique(m.comp), key=lambda k: -(m.comp == k).sum())
    haft_k, head_k, lash_k = ks[0], ks[1], ks[2]
    head_f = m.where(comps=[head_k], mats=["Steel"])
    edge_f = m.where(comps=[head_k], mats=["LightSteel"])
    socket_f = m.where(comps=[haft_k], mats=["Steel"])
    wrap_f = m.where(comps=[haft_k], mats=["LightWood"])
    bands_f = m.where(comps=[haft_k], mats=["DarkWood"])
    lash_f = m.where(comps=[lash_k])
    hv = m.verts_of(head_f | edge_f | socket_f | lash_f)
    m.turn(-90)
    m.remap_y([(-1.72, -0.30), (-0.79, -0.175), (0.22, 0.06), (1.1, 0.72), (3.54, 1.08)])
    m.scale((0.15, 1, 0.15))
    m.scale((1.25, 1, 1.3), verts=hv)
    h0, h1 = m.bounds(head_f)
    mid = (h0[1] + h1[1]) / 2

    def beard(p):
        far = np.clip((p[:, 2] - 0.04) / max(h1[2] - 0.04, 1e-6), 0, 1)
        low = np.clip((mid - p[:, 1]) / (mid - h0[1]), 0, 1)
        p[:, 1] -= 0.06 * far ** 1.4 * low
        return p
    m.warp(beard, verts=m.verts_of(head_f | edge_f))
    lo = m.bounds(m.where(comps=[haft_k]))[0]
    return [m.part("axe head", STEEL, head_f, v_label=None),
            m.part("honed edge", STEEL, edge_f, v_label=None),
            m.part("socket", DARKIRON, socket_f, v_label=None),
            m.part("head straps", DARKIRON, lash_f, v_label=None),
            m.part("haft", DARKWOOD, bands_f), m.part("grip wrap", LEATHER, wrap_f),
            spike("butt shoe", DARKIRON, (lo[0] * 0.3, lo[1] + 0.012, lo[2] * 0.3), -Y, 0.03,
                  0.014, n=5)]


def coffin_hammer():
    """Hammer_Small: the head kept (the big striking block, cheek plates and bolts) but
    its little back face replaced by a forked nail-claw, the haft lengthened, the lashing
    turned to black leather, the grip to oiled hide: a coffin-maker's hammer."""
    m = quat("Hammer_Small")
    main_k = max(np.unique(m.comp), key=lambda k: (m.comp == k).sum())
    big_k = next(k for k in np.unique(m.comp) if (m.comp == k).sum() == 76)
    neck_k = next(k for k in np.unique(m.comp) if (m.comp == k).sum() == 112)
    lash_k = next(k for k in np.unique(m.comp) if (m.comp == k).sum() == 240)
    cheeks = [k for k in np.unique(m.comp) if (m.comp == k).sum() == 56]
    bolts = [k for k in np.unique(m.comp) if (m.comp == k).sum() == 32]
    core_f = m.where(comps=[main_k], mats=["Steel"], y=(1.0, 4.0))
    cap_f = m.where(comps=[main_k], mats=["Steel"], y=(-2.0, 1.0))
    haft_f = m.where(comps=[main_k], mats=["LightWood"])
    wraps_f = m.where(comps=[main_k], mats=["DarkWood"])
    m.turn(-90)  # the big block (+x in the source) to +z
    m.remap_y([(-1.18, -0.165), (0.1, 0.0), (1.56, 0.33), (3.15, 0.56)])
    m.scale((0.15, 1, 0.15))
    head = m.verts_of(core_f | m.where(comps=[big_k, neck_k, lash_k] + cheeks + bolts))
    hc = (m.bounds(core_f)[0] + m.bounds(core_f)[1]) / 2
    m.scale((0.85, 0.72, 0.72), about=(0, m.bounds(core_f)[0][1], hc[2]), verts=head)
    c0, c1 = m.bounds(core_f)
    cy = (c0[1] + c1[1]) / 2
    claws = []
    for i, sx in enumerate((0.0075, -0.0075)):
        pts = [(sx, cy + 0.01, c0[2] + 0.01), (sx * 1.2, cy + 0.012, c0[2] - 0.03),
               (sx * 1.5, cy - 0.005, c0[2] - 0.065), (sx * 1.7, cy - 0.035, c0[2] - 0.085),
               (sx * 1.8, cy - 0.06, c0[2] - 0.088)]
        claws.append(tube(f"claw {i + 1}", IRON, pts, [0.0095, 0.009, 0.0075, 0.005, 0.0015],
                          n=5))
    return [m.part("striking block", DARKIRON, m.where(comps=[big_k]), v_label=None),
            m.part("head", DARKIRON, core_f | m.where(comps=[neck_k]), v_label=None),
            m.part("cheek plates", IRON, m.where(comps=cheeks), v_label=None),
            m.part("bolts", BRASS, m.where(comps=bolts), v_label=None),
            m.part("lashing", DARKLEATHER, m.where(comps=[lash_k]), v_label=None),
            m.part("haft", WOOD, haft_f), m.part("grip wraps", LEATHER, wraps_f),
            m.part("butt cap", DARKIRON, cap_f, v_label=None), *claws]


# ================================================================ Oubliette (sprites)


def oub(name):
    return os.path.join(OUB, f"spr_wep_{name}.png")


def block(name, color, z0, z1, y0, y1, thick, bevel=0.005, x=0.0, **kw):
    """A bevelled block in the y/z plane (guards, pommels, collars)."""
    return M.slab(name, color, [[(z0, y0), (z1, y0), (z1, y1), (z0, y1)]], thick, bevel, x=x,
                  blunt=max(thick - 2 * bevel, 0.0), **kw)


def latin_cross(zc, yc, w=0.006, arm=0.021, up=0.03, down=0.044, bar=0.008):
    """A cross-shaped hole [(z, y)] (clockwise: the material outside it), long arm toward
    the hilt."""
    yb, yt, ya = yc - down, yc + up, yc + bar
    pts = [(-w, yb), (w, yb), (w, ya - w), (arm, ya - w), (arm, ya + w), (w, ya + w), (w, yt),
           (-w, yt), (-w, ya + w), (-arm, ya + w), (-arm, ya - w), (-w, ya - w)]
    return [(zc + z, y) for z, y in pts][::-1]


def penitents_greatsword():
    """steel_huge_2: the huge sprite blade drawn out to a two-hander's reach but slimmed to
    half its width, bevelled, and its three little piercings opened into Latin crosses
    through the steel; the tall guard and the square pommel as heavy bevelled blocks, a
    long red grip."""
    sp = M.Sprite(oub("steel_huge_2"), py=0.031, pz=0.019, col0=13 - 0.10 / 0.031, row0=4.5,
                  flip=-1)
    bm = sp.mask(cols=(13, 43), rows=(1, 8))  # (rows 0 and 8 of column 13 are guard)
    outer = sp.outline(bm, tol=0.35, fill_holes=True, smooth=2)[0]
    holes = [latin_cross(0.0, sp.at(c + 0.5, 4.5)[0]) for c in (25, 30, 35)]
    return [M.slab("blade", STEEL, [outer] + holes, 0.010, 0.014, hole_bevel=0.0035,
                   limit=sp.limiter(M._filled(bm)), v_label="toward tip"),
            block("guard", DARKIRON, -0.085, 0.085, 0.066, 0.104, 0.042, 0.007),
            grip(-0.262, 0.068, 0.0165, RED),
            ring("grip ring", DARKIRON, (0, -0.10, 0), Y, 0.0175, 0.004, n=10, m=4),
            ring("grip ring 2", DARKIRON, (0, 0.06, 0), Y, 0.0175, 0.004, n=10, m=4),
            block("pommel", DARKIRON, -0.03, 0.03, -0.318, -0.262, 0.038, 0.007)]


def gaolers_hook():
    """iron_hook_0: the sprite's iron blade, with its dropped hooking belly, as a bevelled
    blade with the belly as the leading edge; a dark wooden handle, an off-centre iron
    guard as the sprite has it, an iron knob and a ring of the gaoler's keys' kind hanging
    from it."""
    py = 0.55 / 26
    sp = M.Sprite(oub("iron_hook_0"), py=py, pz=0.0145, col0=5 - 0.065 / py, row0=6.5, flip=-1)
    grey = lambda rgb: (np.abs(rgb[..., 0] - rgb[..., 2]) < 12) & (rgb[..., 0] > 70)  # noqa: E731
    bm = sp.mask(cols=(5, 31), test=grey)
    outer = sp.outline(bm, tol=0.3, fill_holes=True, smooth=2)[0]
    z_top, z_bot = sp.at(0, 3)[1], sp.at(0, 9)[1]
    return [M.slab("blade", IRON, [outer], 0.007, 0.010, limit=sp.limiter(M._filled(bm)),
                   v_label="toward tip"),
            block("guard", DARKIRON, z_top - 0.004, z_bot + 0.004, 0.048, 0.068, 0.026, 0.005),
            shaft("handle", DARKWOOD, -0.086, 0.05, 0.0155, 0.0148, n=8),
            ring("collar", DARKIRON, (0, 0.042, 0), Y, 0.0165, 0.004, n=10, m=4),
            ball("knob", DARKIRON, (0, -0.094, 0), 0.019, n=8, rings=5, squash=0.8),
            ring("key ring", IRON, (0, -0.128, 0), X, 0.021, 0.0032, n=12, m=4)]


def tombstone():
    """stone_sword_0: the stone slab blade as a thick chipped grave-slab with bevelled
    edges (the sprite's chips kept), clamped into an iron collar and bound with two iron
    bands; a long leather grip and a grave-ring pommel."""
    py = 0.03
    sp = M.Sprite(oub("stone_sword_0"), py=py, pz=0.02, col0=8 - 0.10 / py, row0=3.5, flip=-1)
    bm = sp.mask(cols=(8, 38))
    outer = sp.outline(bm, tol=0.6, fill_holes=True)[0]
    th = 0.036
    bands = []
    for y in (0.43, 0.74):
        hw = 0.074 if y < 0.6 else 0.07
        bands += [part(f"iron band {len(bands) // 4 + 1}", DARKIRON, isl) for isl in (
            M.box_islands("b", *_box_mesh((th / 2 + 0.0016, y, 0), (0.0016, 0.016, hw))),
            M.box_islands("b", *_box_mesh((-th / 2 - 0.0016, y, 0), (0.0016, 0.016, hw))),
            M.box_islands("b", *_box_mesh((0, y, hw), (th / 2 + 0.0032, 0.016, 0.003))),
            M.box_islands("b", *_box_mesh((0, y, -hw), (th / 2 + 0.0032, 0.016, 0.003))))]
    return [M.slab("grave slab", MOSSSTONE, [outer], th, 0.009, blunt=0.02,
                   limit=sp.limiter(M._filled(bm)), v_label="toward tip"),
            block("collar", DARKIRON, -0.08, 0.08, 0.058, 0.112, 0.05, 0.008),
            *bands,
            grip(-0.265, 0.06, 0.0165, DARKLEATHER),
            turned("butt cap", DARKIRON, -0.285, [(0.006, 0), (0.019, 0.006), (0.019, 0.02)], n=8),
            ring("grave ring", DARKIRON, (0, -0.31, 0), X, 0.024, 0.005, n=12, m=4)]


def _box_mesh(c, half):
    """(verts, tris) of an axis-aligned box, outward-wound."""
    c, h = np.asarray(c, float), np.asarray(half, float)
    v = np.array([[x, y, z] for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)], float) * h + c
    q = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    t = [(a, b, c_) for a, b, c_, d in q] + [(a, c_, d) for a, b, c_, d in q]
    return v, np.array(t)


def wolfjaw_sickle():
    """wolf_3_0: the bent wooden handle followed from the sprite as a curved haft, the
    hanging jawbone blade as a bevelled bone plate with fangs set along its inner (cutting)
    edge, the red sinew cord run down its back and wound round the joint."""
    path = os.path.join(OUB, "spr_wep_wolf_3_0.png")
    hs = M.Sprite(path, py=0.031, pz=0.02, col0=3.0, row0=3.5, flip=-1)
    bs = M.Sprite(path, py=0.024, pz=0.02, col0=17 - (14 * 0.031) / 0.024, row0=3.5, flip=-1)
    rgb = hs.rgba[..., :3]
    red = (rgb[..., 0] - rgb[..., 1]) > 50
    # the handle's centre line, column by column
    pts = []
    for c in range(0, 18):
        rows = np.where(hs.alpha[:, c] & (np.arange(hs.alpha.shape[0]) < 6))[0]
        if len(rows):
            y, z = hs.at(c + 0.5, rows.mean() + 0.5)
            pts.append((0.0, y, z))
    pts = np.array(pts)
    # smooth it (the sprite steps a pixel at a time)
    k = np.array([0.25, 0.5, 0.25])
    for _ in range(3):
        pts[1:-1, 2] = np.convolve(pts[:, 2], k, "valid")
    pts[:, 2] -= np.interp(0.0, pts[:, 1], pts[:, 2])  # the fist on the line: z = 0 at y = 0
    end = pts[-1]
    bm = bs.mask(cols=(17, 25), rows=(3, 13), test=lambda c: (c[..., 0] - c[..., 1]) < 50)
    outer = bs.outline(bm, tol=0.3, smooth=2)[0]
    # move the blade so its top meets the handle's end, then bend it down into a hook
    oy, oz = bs.at(17, 3.5)
    dz = end[2] - oz

    def hook(z, y):
        d = max(z - end[2], 0.0)
        return (z - 0.25 * d * d, y - 2.6 * d * d)
    outer = [hook(z + dz, y) for z, y in outer]
    blade_part = M.slab("jawbone", BONE, [outer], 0.011, 0.008, blunt=0.002,
                        limit=lambda p, d: 0.006)
    # fangs along the inner edge (its outward side faces the hand: -y)
    ring_pts = np.array(outer)
    fangs, cand = [], []
    for i in range(len(ring_pts)):
        a, b = ring_pts[i], ring_pts[(i + 1) % len(ring_pts)]
        d = b - a
        L = np.linalg.norm(d)
        if L < 1e-6:
            continue
        nrm = np.array([d[1], -d[0]]) / L  # right-hand normal: out of the material
        if nrm[1] < -0.55:
            for t in np.linspace(0.15, 0.85, max(1, int(L / 0.022))):
                cand.append((a + d * t, nrm))
    cand.sort(key=lambda q: q[0][0])
    for i, (p, nrm) in enumerate(cand[1:-1:max(1, len(cand) // 6)][:6]):
        fangs.append(spike(f"fang {i + 1}", WAX, (0, p[1] + 0.003, p[0]),
                           (0, nrm[1], nrm[0] - 0.35), 0.022 - 0.002 * (i % 2), 0.0055, n=4))
    # the red sinew down the blade's back: along the outline's far (+y) side
    back = sorted([(z, y) for z, y in outer if y > end[1] - 0.01 and z > end[2] + 0.01])
    cord = []
    for zz in np.linspace(end[2] + 0.01, max(z for z, _ in back) * 0.8 + end[2] * 0.2, 6):
        near = [y for z, y in outer if abs(z - zz) < 0.02]
        if near:
            cord.append((0.0, max(near) + 0.002, zz))
    parts = [tube("haft", DARKWOOD, [tuple(p) for p in pts], 0.0152, n=7),
             blade_part, *fangs,
             ball("butt knob", HORN, (0, pts[0][1] - 0.01, pts[0][2]), 0.018, n=7, rings=4)]
    if len(cord) > 2:
        parts.append(tube("sinew cord", RED, cord, 0.0045, n=5))
    for i, s in enumerate(np.linspace(0.62, 0.95, 5)):
        idx = int(s * (len(pts) - 1))
        tan = M.norm(pts[min(idx + 1, len(pts) - 1)] - pts[max(idx - 1, 0)])
        parts.append(ring(f"cord wrap {i + 1}", RED, pts[idx], tan, 0.0168, 0.0035, n=9, m=4))
    return parts


# ================================================================ specs

def spec(i, kind, name, desc, pack, src, fn):
    return dict(id=i, kind=kind, name=name, desc=desc, pack=pack, source=src,
                build=lambda fn=fn, i=i: Model(i, fn(), tex=128))


REMODELS = [
    spec("mourners_rapier", "onehand", "Mourner's Rapier", "A long slender rapier: a wide "
         "dark-iron cup hilt rimmed in brass, a knuckle bow and swept quillons, black leather "
         "grip bound in brass wire, brass pommel.", "kaykit", "sword_D", mourners_rapier),
    spec("grave_messer", "onehand", "Grave Messer", "A heavy single-edged knife-sword with a "
         "clipped point: iron cross with a nagel spike, hide grip, iron pommel cap.", "kaykit",
         "sword_C", grave_messer),
    spec("butchers_axe", "onehand", "Butcher's Axe", "A long forward-raked cleaver blade on a "
         "short haft bound with blackened iron bands, a top spike and a hanging hook.",
         "kaykit", "axe_C", butchers_axe),
    spec("gravewarden_halberd", "twohand", "Gravewarden's Halberd", "A halberd: a horned axe "
         "blade and back spike on an iron socket, a long top spike, iron langets and collars "
         "on a dark pole with a leather grip.", "kaykit", "halberd", gravewarden_halberd),
    spec("reliquary_blade", "onehand", "Reliquary Blade", "A flame-edged sword of dark etched "
         "steel with a bright honed edge, a gilded spiked guard set with relic garnets, "
         "oxblood grip bound in gold wire.", "quaternius", "Sword_Golden", reliquary_blade),
    spec("bloodletter", "twohand", "Bloodletter", "A long notched two-hander of blackened "
         "steel with bright edges and tearing barbs at its base, dark-iron spiked guard, "
         "blood-red grip between iron rings.", "quaternius", "Claymore", bloodletter),
    spec("dane_axe", "twohand", "Dane Axe", "A broad bearded crescent axe head strapped with "
         "riveted iron to a long crooked haft, leather where the hands go, an iron butt shoe.",
         "quaternius", "Axe", dane_axe),
    spec("coffin_hammer", "onehand", "Coffin Hammer", "A heavy iron striking block with "
         "riveted cheek plates and a forked nail-claw behind, lashed in black leather to an "
         "ash haft.", "quaternius", "Hammer_Small", coffin_hammer),
    spec("penitents_greatsword", "twohand", "Penitent's Greatsword", "A broad two-handed "
         "blade pierced through with three Latin crosses, a heavy square dark-iron guard and "
         "pommel, long red leather grip.", "oubliette", "steel_huge_2", penitents_greatsword),
    spec("gaolers_hook", "onehand", "Gaoler's Hook", "An iron blade whose edge drops into a "
         "hooking belly, an off-centre iron guard, dark wooden handle, iron knob with a key "
         "ring.", "oubliette", "iron_hook_0", gaolers_hook),
    spec("tombstone", "twohand", "Tombstone", "A chipped, moss-stained grave slab worn as a "
         "blade, clamped in an iron collar and bound with iron bands, on a leather grip with "
         "a grave-ring pommel.", "oubliette", "stone_sword_0", tombstone),
    spec("wolfjaw_sickle", "onehand", "Wolf-Jaw Sickle", "A hooked jawbone blade set with "
         "fangs along its inner edge, lashed with red sinew to a bent wooden haft.",
         "oubliette", "wolf_3_0", wolfjaw_sickle),
]


if __name__ == "__main__":
    import sys

    import build_items
    import remodels  # the module items.py put in ITEMS (this file is running as __main__)
    want = set(sys.argv[1:])
    for r in remodels.REMODELS:
        if not want or r["id"] in want:
            info = build_items.build_one(r["kind"], r)
            print(f"{r['kind']:<8} {r['id']:<22} {info['triangles']:>5} tris  {len(info['parts'])} parts")
