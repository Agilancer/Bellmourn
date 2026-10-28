"""Fifty held items for the first-person rigs: ten each of one-handed weapons, two-handed
weapons, wands and staffs, and five each of round and kite shields.

All are modelled in the item socket's frame (see kit.py): origin = the grip point in the
centre of the fist, +y along the handle toward the head/tip, blade edges toward +/-z and flats
toward +/-x (the side the camera sees). Lengths follow the rig proxies (tools/templates/
fp_rig.py PROXY), so a model lines up with its sprite template: one-handed blades end near
y=0.60, two-handers near 1.0, wands near 0.34, staff heads from 0.45 up; the right fist covers
y = -0.038..0.038 and a two-hander's left fist sits 0.11 lower.
"""
import math

import numpy as np

import arm  # noqa: F401  (puts tools/templates on the path)
import fp_rig as R
from geom import Model, circle, loft, norm
from kit import (BLUE, BONE, BRASS, BRONZE, CRYSTAL, DARKIRON, DARKLEATHER, DARKWOOD, EMBER,
                 GEM_BLUE, GEM_GREEN, GEM_RED, GOLD, GREEN, HORN, IRON, LEATHER, OBSIDIAN,
                 PALEWOOD, PURPLE, RED, SILVER, STEEL, WOOD, WRAP, X, Y, Z, ball, bar_between,
                 blade, gem, guard_bar, panel, part, plate, ring, rotated, shaft, spike, turned)

GRIP = 0.015  # handle radius that fills the fist


def tube(name, color, pts, radii, n=6, caps=(True, True), **kw):
    """A round tube along any 3D path (hooks, prongs, antlers, cage bars, coils)."""
    radii = radii if isinstance(radii, (list, tuple)) else [radii] * len(pts)
    pts = [np.asarray(p, float) for p in pts]
    t = norm(pts[-1] - pts[0])
    up = Z if abs(np.dot(t, Z)) < 0.8 else X
    return part(name, color, loft(name, pts, [circle(r, n) for r in radii], up=up, caps=caps),
                v_label=kw.pop("v_label", None), **kw)


def arc_pts(c, r, a0, a1, n, plane=("z", "y")):
    """Points on an arc in the z/y plane (angles in degrees from +z toward +y)."""
    c = np.asarray(c, float)
    out = []
    for k in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * k / n)
        out.append(c + Z * r * math.cos(a) + Y * r * math.sin(a))
    return out


def grip(y0=-0.075, y1=0.06, r=GRIP, color=LEATHER, name="grip"):
    return shaft(name, color, y0, y1, r, r * 0.96, n=8, label=f"{name} (leather wrap)"
                 if color in (LEATHER, DARKLEATHER, WRAP) else name)


def wheel_pommel(y, r=0.022, color=IRON, name="pommel"):
    return turned(name, color, y - 0.022, [(0.004, 0), (r * 0.9, 0.004), (r, 0.011),
                                           (r * 0.9, 0.018), (0.006, 0.022)], n=10)


def ball_pommel(y, r=0.02, color=IRON, name="pommel"):
    return ball(name, color, (0, y - r * 0.8, 0), r, n=8)


def spikes_around(name, color, c, r, length, dirs, rad=0.006):
    return [spike(f"{name} {i + 1}", color, np.asarray(c) + norm(d) * r * 0.85, d, length, rad)
            for i, d in enumerate(dirs)]


SPHERE_DIRS = [(1, 0, 0), (-1, 0, 0), (0, 0, 1), (0, 0, -1), (0, 1, 0), (0.7, 0.5, 0.7),
               (-0.7, 0.5, 0.7), (0.7, 0.5, -0.7), (-0.7, 0.5, -0.7), (0.7, -0.5, 0.7),
               (-0.7, -0.5, 0.7), (0.7, -0.5, -0.7), (-0.7, -0.5, -0.7)]


# ================================================================ one-handed (sword1h proxy)


def arming_sword():
    return [blade("blade", STEEL, 0.065, 0.60, [(0, 0.022), (0.75, 0.017), (1, 0.001)], 0.0035,
                  "hex"), guard_bar("crossguard", IRON, 0.062, 0.075, 0.006, 0.009, ends=0.6),
            grip(), wheel_pommel(-0.076)]


def falchion():
    return [blade("blade", STEEL, 0.06, 0.60, [(0, 0.018), (0.65, 0.030), (0.9, 0.030),
                                               (1, 0.002)], 0.004, "single", curve=0.012),
            guard_bar("crossguard", BRASS, 0.058, 0.055, 0.006, 0.008, droop=0.012),
            grip(color=DARKLEATHER), ball_pommel(-0.075, 0.017, BRASS)]


def flanged_mace():
    parts = [shaft("haft", IRON, -0.10, 0.44, 0.013, n=8), grip(-0.09, 0.06, 0.015, DARKLEATHER),
             turned("head core", IRON, 0.40, [(0.012, 0), (0.024, 0.02), (0.024, 0.13),
                                              (0.012, 0.15), (0.004, 0.17)], n=8)]
    for k in range(6):
        fl = plate(f"flange {k + 1}", STEEL, [(0.018, 0.41), (0.056, 0.45), (0.058, 0.52),
                                              (0.018, 0.565)], 0.006)
        parts.append(rotated(fl, Y, k * 60))
    return parts + [ball_pommel(-0.10, 0.016)]


def bearded_axe():
    head = [(-0.024, 0.505), (0.030, 0.505), (0.088, 0.555), (0.112, 0.535), (0.118, 0.47),
            (0.108, 0.385), (0.080, 0.37), (0.052, 0.415), (0.030, 0.445), (-0.024, 0.445)]
    return [shaft("haft", WOOD, -0.11, 0.53, 0.015, n=8),
            plate("axe head", STEEL, head, 0.012, back_scale=0.96),
            turned("eye socket", IRON, 0.44, [(0.019, 0), (0.021, 0.01), (0.021, 0.055),
                                              (0.019, 0.066)], n=8),
            ring("haft band", IRON, (0, -0.06, 0), Y, 0.0165, 0.004, n=10, m=4)]


def morning_star():
    c = (0, 0.50, 0)
    return [shaft("haft", DARKWOOD, -0.11, 0.47, 0.016, 0.018, n=8),
            ring("collar", IRON, (0, 0.455, 0), Y, 0.02, 0.006, n=10, m=4),
            ball("ball", IRON, c, 0.045, n=10, rings=6)] + spikes_around(
        "spike", STEEL, c, 0.045, 0.035, SPHERE_DIRS) + [ball_pommel(-0.11, 0.018)]


def war_hammer():
    return [shaft("haft", IRON, -0.10, 0.50, 0.013, n=8), grip(-0.09, 0.06, 0.015),
            part("hammer head", STEEL, loft("hammer head", [(0, 0.49, -0.012), (0, 0.49, 0.06),
                                                             (0, 0.49, 0.075)],
                                            [circle(0.022, 4, 0.022)] * 2 + [circle(0.026, 4)],
                                            up=Y, caps=(True, True), sharp=True)),
            spike("back spike", STEEL, (0, 0.49, -0.01), -Z, 0.075, 0.014, n=4),
            spike("top spike", STEEL, (0, 0.51, 0), Y, 0.05, 0.011, n=4), ball_pommel(-0.10, 0.015)]


def scimitar():
    return [blade("blade", STEEL, 0.06, 0.62, [(0, 0.016), (0.6, 0.022), (0.88, 0.021),
                                               (1, 0.001)], 0.0035, "single", curve=0.075),
            guard_bar("guard", GOLD, 0.058, 0.045, 0.006, 0.008, droop=-0.014, ends=1.0),
            grip(color=RED), turned("pommel cap", GOLD, -0.098, [(0.004, 0), (0.016, 0.006),
                                                                  (0.019, 0.018), (0.015, 0.024)])]


def bone_cleaver():
    out = [(-0.018, 0.07), (0.035, 0.07), (0.078, 0.13), (0.082, 0.47), (0.048, 0.52),
           (-0.018, 0.50)]
    return [plate("cleaver blade", STEEL, out, 0.006), grip(-0.08, 0.07, 0.015, DARKWOOD),
            ring("pommel ring", IRON, (0, -0.10, 0), X, 0.018, 0.005, n=10, m=4),
            ring("collar", BRASS, (0, 0.06, 0), Y, 0.017, 0.004, n=10, m=4)]


def fang_blade():
    pts = [(-0.012, 0.065)]
    ys = np.linspace(0.08, 0.50, 9)
    for i, y in enumerate(ys):
        pts.append((0.030 if i % 2 == 0 else 0.020, y))
    pts += [(0.004, 0.61), (-0.014, 0.50), (-0.016, 0.065)]
    pts = pts[:1] + [(z, y) for z, y in pts[1:]]
    return [plate("serrated blade", STEEL, pts, 0.005),
            guard_bar("fang guard", BONE, 0.06, 0.06, 0.007, 0.009, droop=0.035, ends=0.9),
            grip(color=DARKLEATHER), ball_pommel(-0.075, 0.018, BONE)]


def nail_club():
    prof = [(0.016, 0.0), (0.017, 0.15), (0.026, 0.32), (0.038, 0.52), (0.040, 0.62),
            (0.022, 0.66)]
    parts = [turned("club", WOOD, -0.10, prof, n=8, v_label="toward tip")]
    for i, (a, y) in enumerate([(0, 0.40), (90, 0.43), (180, 0.46), (270, 0.49), (45, 0.36),
                                (135, 0.39), (225, 0.42), (315, 0.45)]):
        d = np.array([math.sin(math.radians(a)), 0, math.cos(math.radians(a))])
        r = 0.028 + (y - 0.36) * 0.09
        parts.append(spike(f"nail {i + 1}", IRON, d * r + Y * y, d, 0.028, 0.004, n=4))
    return parts + [ring("hand strap", DARKLEATHER, (0, -0.09, 0), Y, 0.018, 0.004, n=10, m=4)]


# ================================================================ two-handed (sword2h proxy)


def greatsword():
    return [blade("blade", STEEL, 0.08, 1.00, [(0, 0.028), (0.14, 0.028), (0.16, 0.032),
                                               (0.8, 0.025), (1, 0.002)], 0.005, "hex"),
            guard_bar("crossguard", IRON, 0.078, 0.13, 0.008, 0.011, ends=0.5),
            guard_bar("parrying lugs", IRON, 0.20, 0.042, 0.006, 0.008, droop=-0.012),
            grip(-0.26, 0.075, 0.016, DARKLEATHER), ball_pommel(-0.27, 0.028)]


def claymore():
    return [blade("blade", STEEL, 0.08, 0.98, [(0, 0.030), (0.85, 0.022), (1, 0.002)], 0.005,
                  "diamond"),
            guard_bar("quillons", IRON, 0.075, 0.13, 0.008, 0.010, droop=0.06, ends=1.6),
            ring("guard ring", IRON, (0, 0.085, 0), Z, 0.022, 0.004, n=10, m=4),
            grip(-0.26, 0.07, 0.016, LEATHER), wheel_pommel(-0.265, 0.028)]


def great_axe():
    bit = [(0.02, 0.62), (0.07, 0.60), (0.16, 0.55), (0.20, 0.70), (0.16, 0.86), (0.07, 0.80),
           (0.02, 0.78)]
    return [shaft("haft", DARKWOOD, -0.28, 0.90, 0.016, n=8),
            plate("bit (front)", STEEL, bit, 0.012, back_scale=0.95),
            plate("bit (back)", STEEL, [(-z, y) for z, y in bit][::-1], 0.012, back_scale=0.95),
            turned("socket", IRON, 0.61, [(0.022, 0), (0.024, 0.02), (0.024, 0.16),
                                          (0.022, 0.18)], n=8),
            spike("top spike", STEEL, (0, 0.89, 0), Y, 0.08, 0.016, n=4),
            ring("grip band", IRON, (0, -0.05, 0), Y, 0.0175, 0.004, n=10, m=4)]


def warmaul():
    return [shaft("haft", WOOD, -0.28, 0.72, 0.017, n=8),
            part("maul head", DARKIRON, loft("maul head", [(0, 0.78, -0.10), (0, 0.78, -0.08),
                                                          (0, 0.78, 0.10), (0, 0.78, 0.12)],
                                             [circle(0.045, 8), circle(0.05, 8), circle(0.05, 8),
                                              circle(0.045, 8)], up=Y, caps=(True, True))),
            ring("head band 1", IRON, (0, 0.78, 0.05), Z, 0.053, 0.007, n=10, m=4),
            ring("head band 2", IRON, (0, 0.78, -0.05), Z, 0.053, 0.007, n=10, m=4),
            ring("grip band", IRON, (0, -0.05, 0), Y, 0.0185, 0.004, n=10, m=4)]


def poleaxe():
    bit = [(0.015, 0.76), (0.06, 0.74), (0.11, 0.72), (0.12, 0.83), (0.10, 0.90), (0.015, 0.86)]
    return [shaft("haft", WOOD, -0.28, 0.98, 0.016, n=8),
            plate("axe blade", STEEL, bit, 0.010),
            part("hammer back", STEEL, loft("hammer back", [(0, 0.82, -0.012), (0, 0.82, -0.06)],
                                            [circle(0.02, 4)] * 2, up=Y, caps=(True, True),
                                            sharp=True)),
            spike("top spike", STEEL, (0, 0.96, 0), Y, 0.13, 0.014, n=4),
            plate("langet", IRON, [(-0.017, 0.62), (0.017, 0.62), (0.017, 0.74), (-0.017, 0.74)],
                  0.002, x=0.0165),
            ring("rondel", IRON, (0, -0.03, 0), Y, 0.026, 0.006, n=10, m=4)]


def headsman():
    return [blade("blade", STEEL, 0.08, 0.95, [(0, 0.038), (0.96, 0.045), (1, 0.042)], 0.005,
                  "hex"),
            guard_bar("crossguard", DARKIRON, 0.078, 0.11, 0.009, 0.011),
            grip(-0.26, 0.075, 0.016, DARKLEATHER), wheel_pommel(-0.265, 0.03, DARKIRON)]


def flamberge():
    return [blade("blade", STEEL, 0.08, 1.00, [(0, 0.026), (0.85, 0.020), (1, 0.002)], 0.0045,
                  "diamond", wave=0.010, waves=9, n=24),
            guard_bar("crossguard", GOLD, 0.078, 0.12, 0.007, 0.009, droop=-0.02, ends=1.0),
            grip(-0.26, 0.075, 0.016, RED), ball_pommel(-0.27, 0.026, GOLD)]


def scythe():
    pts = []
    for k in range(9):
        s = k / 8
        z = -0.03 - 0.55 * s
        y = 0.90 + 0.06 * math.sin(math.pi * s * 0.8) - 0.18 * s * s
        w = 0.055 * (1 - s) + 0.004
        pts.append((z, y, w))
    outline = [(z, y + w / 2) for z, y, w in pts] + [(z, y - w / 2) for z, y, w in pts][::-1]
    return [shaft("snath", DARKWOOD, -0.28, 0.95, 0.016, n=8),
            plate("blade", STEEL, outline, 0.005),
            ring("blade collar", IRON, (0, 0.90, 0), Y, 0.02, 0.006, n=10, m=4),
            spike("hand peg", DARKWOOD, (0, 0.32, 0.012), Z, 0.08, 0.01, n=5)]


def ogre_club():
    prof = [(0.018, 0.0), (0.019, 0.30), (0.035, 0.6), (0.062, 0.95), (0.066, 1.08),
            (0.040, 1.14)]
    parts = [turned("club", DARKWOOD, -0.28, prof, n=10, v_label="toward tip"),
             ring("iron band 1", IRON, (0, 0.55, 0), Y, 0.058, 0.008, n=12, m=4),
             ring("iron band 2", IRON, (0, 0.72, 0), Y, 0.068, 0.008, n=12, m=4)]
    for i in range(8):
        a = math.radians(i * 45 + (22 if i % 2 else 0))
        d = np.array([math.sin(a), 0.15, math.cos(a)])
        y = 0.60 + (i % 3) * 0.06
        r = 0.035 + (y - 0.30) * 0.075
        parts.append(spike(f"spike {i + 1}", IRON, Y * y + norm(d) * r, d, 0.05, 0.007, n=4))
    return parts


def glaive():
    out = [(-0.016, 0.72), (0.02, 0.72), (0.045, 0.80), (0.05, 0.95), (0.02, 1.08),
           (-0.012, 0.96), (-0.018, 0.82)]
    return [shaft("haft", WOOD, -0.28, 0.76, 0.016, n=8),
            plate("glaive blade", STEEL, out, 0.007),
            spike("back hook", STEEL, (0, 0.84, -0.015), (0, 0.4, -1), 0.06, 0.008, n=4),
            ring("socket band", IRON, (0, 0.72, 0), Y, 0.02, 0.006, n=10, m=4),
            ring("grip band", IRON, (0, -0.05, 0), Y, 0.0175, 0.004, n=10, m=4)]


# ================================================================ shields


def round_board(r, color, bulge=0.025):
    """Board seen from inside: flat back facing the player (-z), gently domed front."""
    return turned("board", color, 0, [(r, 0.050), (r, 0.064), (r * 0.9, 0.070),
                                      (r * 0.45, 0.078 + bulge * 0.5), (0.002, 0.08 + bulge)],
                  n=20, axis=Z)


def grip_bar(color=WOOD):
    return [shaft("grip bar", color, -0.075, 0.075, 0.012, n=6),
            bar_between("grip post top", IRON, (0, 0.068, 0.0), (0, 0.068, 0.052), 0.006),
            bar_between("grip post bottom", IRON, (0, -0.068, 0.0), (0, -0.068, 0.052), 0.006)]


def ironbound():
    return [round_board(0.26, WOOD), ring("rim", IRON, (0, 0, 0.058), Z, 0.262, 0.009, n=24),
            ball("boss", IRON, (0, 0, 0.09), 0.06, n=12, rings=4, squash=0.6, axis=Z)] + grip_bar()


def spiked_buckler():
    return [round_board(0.17, STEEL, bulge=0.03),
            ring("rim", DARKIRON, (0, 0, 0.058), Z, 0.172, 0.008, n=20),
            ball("boss", DARKIRON, (0, 0, 0.09), 0.045, n=10, rings=4, squash=0.6, axis=Z),
            spike("boss spike", STEEL, (0, 0, 0.11), Z, 0.09, 0.016, n=6)] + grip_bar(LEATHER)


def hide_targe():
    studs = [ball(f"stud {k + 1}", BRASS, (0.19 * math.cos(math.radians(k * 45)),
                                         0.19 * math.sin(math.radians(k * 45)), 0.073), 0.012,
                  n=6, rings=3, squash=0.6, axis=Z) for k in range(8)]
    return [round_board(0.25, LEATHER), ring("rim", DARKLEATHER, (0, 0, 0.058), Z, 0.252, 0.008,
                                             n=24),
            ball("boss", BRASS, (0, 0, 0.088), 0.05, n=10, rings=4, squash=0.55, axis=Z)
            ] + studs + grip_bar()


def sun_bronze():
    rays = []
    for k in range(8):
        a = k * 45
        p = plate(f"sun ray {k + 1}", GOLD, [(-0.03, 0.08), (0.03, 0.08), (0.0, 0.23)], 0.006)
        p = rotated(p, Y, 90)  # lay the ray flat on the face (plate lies in y/z -> x/y)
        p = rotated(p, Z, a)
        rays.append(_moved(p, (0, 0, 0.078)))
    return [round_board(0.26, BRONZE), ring("rim", GOLD, (0, 0, 0.058), Z, 0.262, 0.009, n=24),
            ball("sun boss", GOLD, (0, 0, 0.088), 0.065, n=12, rings=4, squash=0.55, axis=Z)
            ] + rays + grip_bar()


def skull_boss():
    return [round_board(0.25, DARKWOOD), ring("rim", BONE, (0, 0, 0.058), Z, 0.252, 0.010, n=24),
            ball("skull", BONE, (0, 0.012, 0.10), 0.055, n=10, rings=5, squash=0.8, axis=Z),
            ball("jaw", BONE, (0, -0.045, 0.092), 0.032, n=8, rings=3, squash=0.6, axis=Z),
            spike("horn left", HORN, (-0.04, 0.05, 0.10), (-1, 0.8, 0.3), 0.07, 0.012),
            spike("horn right", HORN, (0.04, 0.05, 0.10), (1, 0.8, 0.3), 0.07, 0.012)] + grip_bar()


def _moved(p, off):
    m = np.eye(4)
    m[:3, 3] = off
    p.islands = [i.transformed(m) for i in p.islands]
    return p


def kite_rows(n=13):
    """[(y, x_left, x_right)] down the kite outline used by the rig (fp_rig.KITE)."""
    hw, top, sh, pt = R.KITE_HW, R.KITE_TOP, R.KITE_SHOULDER, R.KITE_POINT
    rows = []
    for y in np.linspace(top - 0.004, pt + 0.002, n):
        if y >= sh:
            half = hw * math.sqrt(max(1 - ((y - sh) / (top - sh)) ** 2, 0.0))
        else:
            # quadratic bezier side (hw, sh) -> control (hw, -0.18) -> (0, pt): solve y(s)
            s = 0.5
            for _ in range(40):
                yy = (1 - s) ** 2 * sh + 2 * (1 - s) * s * (-0.18) + s * s * pt
                s += (yy - y) * 0.8
                s = min(max(s, 0.0), 1.0)
            half = (1 - s) ** 2 * hw + 2 * (1 - s) * s * hw
        rows.append((y, -max(half, 0.003), max(half, 0.003)))
    return rows


def kite_edge(color, rows, z0=0.05, bend=-0.55, name="edging"):
    pts = [(xl, y) for y, xl, xr in rows] + [(xr, y) for y, xl, xr in rows][::-1]
    pts.append(pts[0])
    path = [(x, y, z0 + bend * x * x + 0.004) for x, y in pts]
    return part(name, color, loft(name, path, [circle(0.007, 4)] * len(path), up=Z,
                                  caps=(False, False)))


def kite_base(color, edge_color):
    rows = kite_rows()
    return rows, [panel("board", color, rows, 0.016, bend=-0.55, z0=0.058),
                  kite_edge(edge_color, rows),
                  shaft("grip strap", DARKLEATHER, -0.06, 0.06, 0.011, n=6),
                  bar_between("strap post top", IRON, (0, 0.055, 0), (0, 0.055, 0.05), 0.006),
                  bar_between("strap post bottom", IRON, (0, -0.055, 0), (0, -0.055, 0.05), 0.006),
                  part("arm pad", DARKLEATHER, loft("arm pad", [(0, -0.20, 0.035), (0, -0.12, 0.035)],
                                                    [circle(0.012, 4, 0.03)] * 2, up=Z,
                                                    caps=(True, True), sharp=True))]


def knights_kite():
    rows, base = kite_base(WOOD, IRON)
    return base + [ball("boss", IRON, (0, 0.05, 0.075), 0.035, n=10, rings=3, squash=0.5,
                        axis=Z)]


def banded_kite():
    rows, base = kite_base(DARKWOOD, IRON)
    bands = [part(f"band {i + 1}", IRON, loft(
        f"band {i + 1}", [(x, 0.40 if x == 0 else 0.33, 0.069 - 0.55 * x * x),
                          (x, -0.40 if x == 0 else -0.10, 0.069 - 0.55 * x * x)],
        [circle(0.003, 4, 0.012)] * 2, up=Z, caps=(True, True), sharp=True))
        for i, x in enumerate((-0.12, 0.0, 0.12))]
    return base + bands


def scale_kite():
    rows, base = kite_base(GREEN, BRONZE)
    scales = []
    for i, y in enumerate(np.linspace(0.30, -0.20, 6)):
        half = next(r[2] for r in rows if r[0] <= y) * 0.85
        pts = [(x, y, 0.069 - 0.55 * x * x) for x in np.linspace(-half, half, 7)]
        scales.append(part(f"scale row {i + 1}", GREEN, loft(
            f"scale row {i + 1}", pts, [[(0.0, 0.0), (0.002, 0.004), (0.0, 0.045),
                                         (-0.002, 0.004)]] * len(pts), up=Y, caps=(False, False))))
    return base + scales


def templar_kite():
    rows, base = kite_base(SILVER, GOLD)
    cross = [part("cross upright", RED, loft("cross upright", [(0, 0.36, 0.068), (0, -0.30, 0.068)],
                                             [circle(0.004, 4, 0.028)] * 2, up=Z,
                                             caps=(True, True), sharp=True)),
             part("cross bar", RED, loft("cross bar", [(-0.18, 0.16, 0.050), (0, 0.16, 0.070),
                                                     (0.18, 0.16, 0.050)],
                                         [circle(0.028, 4, 0.004)] * 3, up=Y, caps=(True, True),
                                         sharp=True))]
    return base + cross


def thorned_kite():
    rows, base = kite_base(OBSIDIAN, DARKIRON)
    thorns = []
    for i, (y, xl, xr) in enumerate(rows[1:-1:2]):
        for side, x in (("left", xl), ("right", xr)):
            thorns.append(spike(f"thorn {side} {i + 1}", DARKIRON,
                                (x * 0.97, y, 0.062 - 0.55 * x * x), (np.sign(x), 0.35, 0.45),
                                0.065, 0.011, n=4))
    return base + thorns + [spike("centre spike", DARKIRON, (0, 0.08, 0.07), Z, 0.08, 0.02, n=5)]


# ================================================================ wands (pointer grip)


def crystal_wand():
    return [shaft("shaft", SILVER, -0.02, 0.27, 0.010, 0.007, n=6),
            ring("grip ring", SILVER, (0, 0.05, 0), Y, 0.011, 0.003, n=8, m=4)] + [
        tube(f"prong {k + 1}", SILVER, [(0, 0.265, 0), (0.012 * math.cos(math.radians(a)), 0.30,
                                                         0.012 * math.sin(math.radians(a))),
                                        (0.006 * math.cos(math.radians(a)), 0.325,
                                         0.006 * math.sin(math.radians(a)))], [0.003, 0.0025, 0.001],
             n=4, caps=(True, False)) for k, a in enumerate((90, 210, 330))] + [
        gem("crystal", CRYSTAL, (0, 0.305, 0), Y, 0.012, 0.06)]


def bone_wand():
    prof = [(0.009, 0), (0.011, 0.02), (0.008, 0.06), (0.010, 0.09), (0.007, 0.14),
            (0.009, 0.17), (0.006, 0.23), (0.008, 0.26), (0.005, 0.28)]
    return [turned("bone shaft", BONE, -0.02, prof, n=6, v_label="toward tip"),
            ball("knucklebone tip", BONE, (0, 0.285, 0), 0.016, n=8, rings=4),
            ring("sinew wrap", DARKLEATHER, (0, 0.0, 0), Y, 0.011, 0.003, n=8, m=4)]


def rootwood_wand():
    return [blade("twisted shaft", WOOD, -0.02, 0.32, [(0, 0.011), (1, 0.005)],
                  [(0, 0.010), (1, 0.005)], "round", wave=0.006, waves=5, n=16),
            ball("knot", DARKWOOD, (0, 0.02, 0), 0.013, n=6, rings=3),
            gem("seed gem", GEM_GREEN, (0, 0.33, 0.0), Y, 0.008, 0.03)]


def ember_rod():
    return [shaft("rod", DARKIRON, -0.02, 0.28, 0.009, 0.008, n=6),
            ring("rod band", BRASS, (0, 0.26, 0), Y, 0.011, 0.003, n=8, m=4),
            ball("ember orb", EMBER, (0, 0.30, 0), 0.02, n=8, rings=5),
            ring("orb cage", BRASS, (0, 0.30, 0), X, 0.021, 0.002, n=10, m=3)]


def serpent_wand():
    return [blade("serpent body", BRONZE, -0.02, 0.29, [(0, 0.010), (1, 0.007)],
                  [(0, 0.009), (1, 0.007)], "round", wave=0.008, waves=4, n=16),
            turned("serpent head", BRONZE, 0.285, [(0.008, 0), (0.012, 0.012), (0.010, 0.03),
                                                   (0.003, 0.045)], n=6),
            gem("eye left", GEM_RED, (0.008, 0.305, 0.004), X, 0.003, 0.004, n=4),
            gem("eye right", GEM_RED, (-0.008, 0.305, 0.004), -X, 0.003, 0.004, n=4)]


def starfall_wand():
    star = []
    for k in range(10):
        a = math.radians(90 + k * 36)
        r = 0.03 if k % 2 == 0 else 0.013
        star.append((r * math.cos(a), 0.31 + r * math.sin(a)))
    return [shaft("shaft", DARKWOOD, -0.02, 0.28, 0.009, 0.007, n=6),
            plate("star", GOLD, star, 0.006), ring("band", GOLD, (0, 0.06, 0), Y, 0.0105, 0.003,
                                                   n=8, m=4)]


def antler_wand():
    main = [(0, -0.02, 0), (0.002, 0.10, 0.004), (-0.003, 0.20, 0.0), (0.004, 0.30, -0.006)]
    return [tube("antler", HORN, main, [0.010, 0.009, 0.007, 0.003], n=6, v_label="toward tip"),
            tube("tine 1", HORN, [(0.002, 0.12, 0.004), (0.018, 0.17, 0.02)], [0.005, 0.001], n=5,
                 caps=(True, False)),
            tube("tine 2", HORN, [(-0.003, 0.20, 0.0), (-0.02, 0.25, 0.015)], [0.005, 0.001], n=5,
                 caps=(True, False)),
            ring("binding", LEATHER, (0, 0.0, 0), Y, 0.011, 0.003, n=8, m=4)]


def ebony_wand():
    return [shaft("ebony shaft", OBSIDIAN, -0.02, 0.31, 0.010, 0.005, n=8),
            ring("silver band 1", SILVER, (0, 0.06, 0), Y, 0.0105, 0.0025, n=8, m=4),
            ring("silver band 2", SILVER, (0, 0.16, 0), Y, 0.009, 0.0025, n=8, m=4),
            ring("silver band 3", SILVER, (0, 0.25, 0), Y, 0.0075, 0.0025, n=8, m=4),
            ball("silver tip", SILVER, (0, 0.315, 0), 0.007, n=6, rings=3)]


def obsidian_shard():
    return [blade("shard", OBSIDIAN, 0.02, 0.34, [(0, 0.012), (0.2, 0.018), (0.45, 0.012),
                                                 (0.7, 0.016), (1, 0.001)], 0.006, "diamond"),
            shaft("wrapped hilt", WRAP, -0.02, 0.03, 0.010, n=6)]


def feathered_wand():
    feathers = []
    for k, a in enumerate((-35, 0, 35)):
        p = plate(f"feather {k + 1}", PALEWOOD if k == 1 else RED,
                  [(-0.006, 0.0), (0.006, 0.0), (0.012, 0.05), (0.0, 0.075), (-0.012, 0.05)],
                  0.002)
        p = _moved(rotated(p, X, a), (0, 0.27, 0))
        feathers.append(p)
    return [shaft("shaft", PALEWOOD, -0.02, 0.27, 0.009, 0.007, n=6),
            ball("bead", GEM_BLUE, (0, 0.27, 0), 0.010, n=6, rings=3)] + feathers


# ================================================================ staffs (staff proxy)


def staff_shaft(color=WOOD, top=0.47, r=0.016, wavy=0.0):
    if wavy:
        return blade("shaft", color, -0.60, top, [(0, r), (1, r * 0.9)], [(0, r), (1, r * 0.9)],
                     "round", wave=wavy, waves=5, n=20, cap_start=True)
    return shaft("shaft", color, -0.60, top, r, r * 0.92, n=8)


def gnarled_staff():
    prongs = [tube(f"root claw {k + 1}", DARKWOOD,
                   [(0.012 * math.cos(math.radians(a)), 0.46, 0.012 * math.sin(math.radians(a))),
                    (0.038 * math.cos(math.radians(a)), 0.53, 0.038 * math.sin(math.radians(a))),
                    (0.012 * math.cos(math.radians(a)), 0.61, 0.012 * math.sin(math.radians(a)))],
                   [0.008, 0.006, 0.002], n=5, caps=(True, False)) for k, a in enumerate((0, 90, 180, 270))]
    return [staff_shaft(WOOD, wavy=0.006)] + prongs + [gem("crystal", CRYSTAL, (0, 0.545, 0), Y,
                                                            0.024, 0.11)]


def iron_crook():
    hook = arc_pts((0, 0.53, -0.06), 0.06, 0, 200, 10)
    return [staff_shaft(DARKIRON, top=0.53, r=0.014),
            tube("crook", DARKIRON, hook, [0.014] * 9 + [0.011, 0.008], n=6),
            ring("grip band", IRON, (0, 0.0, 0), Y, 0.017, 0.004, n=10, m=4)]


def skull_staff():
    return [staff_shaft(PALEWOOD),
            ball("skull", BONE, (0, 0.55, 0.004), 0.05, n=10, rings=5, squash=1.1),
            ball("jaw", BONE, (0, 0.505, 0.022), 0.032, n=8, rings=3, squash=0.6),
            gem("eye left", GEM_RED, (0.018, 0.56, 0.042), Z, 0.008, 0.01, n=5),
            gem("eye right", GEM_RED, (-0.018, 0.56, 0.042), Z, 0.008, 0.01, n=5),
            ring("binding", DARKLEATHER, (0, 0.47, 0), Y, 0.019, 0.005, n=10, m=4)]


def crescent_staff():
    outer = arc_pts((0, 0.55, 0), 0.09, -20, 200, 14)
    inner = arc_pts((0, 0.58, 0), 0.065, 200, -20, 14)
    poly = [(p[2], p[1]) for p in outer + inner]
    return [staff_shaft(DARKWOOD), plate("crescent", SILVER, poly, 0.008),
            ball("moonstone", CRYSTAL, (0, 0.50, 0), 0.018, n=8, rings=4)]


def serpent_staff():
    coil = []
    for k in range(25):
        a = k * 0.55
        coil.append((0.024 * math.cos(a), 0.30 + k * 0.012, 0.024 * math.sin(a)))
    return [staff_shaft(DARKWOOD, top=0.58),
            tube("serpent coil", GREEN, coil, [0.009] * 24 + [0.007], n=6, v_label="toward head"),
            turned("serpent head", GREEN, 0.58, [(0.012, 0), (0.018, 0.02), (0.014, 0.05),
                                                 (0.004, 0.07)], n=6),
            gem("serpent eye", GEM_RED, (0.0, 0.615, 0.016), Z, 0.005, 0.006, n=4)]


def caged_orb():
    bars = [tube(f"cage bar {k + 1}", BRASS,
                 [(0.012 * math.cos(math.radians(a)), 0.47, 0.012 * math.sin(math.radians(a))),
                  (0.05 * math.cos(math.radians(a)), 0.54, 0.05 * math.sin(math.radians(a))),
                  (0.004 * math.cos(math.radians(a)), 0.62, 0.004 * math.sin(math.radians(a)))],
                 0.004, n=4) for k, a in enumerate(range(0, 360, 72))]
    return [staff_shaft(WOOD), ball("orb", GEM_BLUE, (0, 0.54, 0), 0.036, n=10, rings=6)] + bars


def antler_staff():
    return [staff_shaft(PALEWOOD, wavy=0.004),
            tube("antler left", HORN, [(0, 0.47, 0), (0.04, 0.55, 0.01), (0.07, 0.66, 0.0)],
                 [0.012, 0.008, 0.002], n=5, caps=(True, False)),
            tube("antler right", HORN, [(0, 0.47, 0), (-0.04, 0.56, -0.01), (-0.06, 0.67, 0.0)],
                 [0.012, 0.008, 0.002], n=5, caps=(True, False)),
            tube("tine", HORN, [(0.04, 0.55, 0.01), (0.03, 0.62, 0.04)], [0.006, 0.001], n=5,
                 caps=(True, False)),
            ring("fetish cord", RED, (0, 0.45, 0), Y, 0.018, 0.004, n=10, m=4)]


def crosier():
    hook = arc_pts((0, 0.58, -0.045), 0.045, 0, 250, 12)
    return [staff_shaft(GOLD, top=0.58, r=0.014),
            ball("knop", GOLD, (0, 0.50, 0), 0.026, n=10, rings=5),
            tube("crook", GOLD, hook, [0.012] * 11 + [0.010, 0.007], n=6),
            gem("crook gem", GEM_RED, (0, 0.58, -0.045), X, 0.012, 0.016, n=6)]


def brazier_staff():
    flames = [spike(f"flame {k + 1}", EMBER, (0.015 * math.cos(math.radians(a)), 0.56,
                                             0.015 * math.sin(math.radians(a))),
                    (0.3 * math.cos(math.radians(a)), 1, 0.3 * math.sin(math.radians(a))),
                    0.06 + 0.02 * (k % 2), 0.014, n=5) for k, a in enumerate(range(0, 360, 72))]
    return [staff_shaft(DARKIRON, r=0.015),
            turned("brazier bowl", DARKIRON, 0.47, [(0.016, 0), (0.03, 0.03), (0.045, 0.07),
                                                    (0.046, 0.09), (0.038, 0.095)], n=10),
            ball("coals", EMBER, (0, 0.56, 0), 0.03, n=8, rings=3, squash=0.5)] + flames


def monk_staff():
    loop = arc_pts((0, 0.56, 0), 0.06, -70, 250, 16)
    rings = [ring(f"jingle ring {k + 1}", BRASS, (0.0, 0.52, 0.06 * math.cos(math.radians(a))),
                  X, 0.018, 0.003, n=8, m=3) for k, a in enumerate((20, 160))]
    return [staff_shaft(PALEWOOD, top=0.50),
            tube("top loop", BRASS, loop, 0.006, n=5)] + rings + [
        ring("grip wrap", RED, (0, 0.0, 0), Y, 0.018, 0.005, n=10, m=4)]


def spec(i, name, desc, fn):
    return dict(id=i, name=name, desc=desc, build=lambda fn=fn, i=i: Model(i, fn(), tex=128))


ITEMS = {
    "onehand": [
        spec("arming_sword", "Arming Sword", "A plain knightly sword: steel blade with a fuller, "
             "iron crossguard, brown leather grip, wheel pommel.", arming_sword),
        spec("falchion", "Falchion", "A heavy single-edged blade that widens toward the tip; "
             "brass guard and pommel, dark leather grip.", falchion),
        spec("flanged_mace", "Flanged Mace", "An all-iron mace with six steel flanges and a "
             "leather-wrapped grip.", flanged_mace),
        spec("bearded_axe", "Bearded Axe", "A Norse-style axe: steel head with a long beard on "
             "an ash haft, iron socket and band.", bearded_axe),
        spec("morning_star", "Morning Star", "A dark wooden haft topped with a spiked iron "
             "ball.", morning_star),
        spec("war_hammer", "War Hammer", "A steel hammer face with a back spike and top spike "
             "on an iron haft.", war_hammer),
        spec("scimitar", "Scimitar", "A curved desert sabre with a gilded guard and cap, red "
             "cloth grip.", scimitar),
        spec("bone_cleaver", "Bone Cleaver", "A brutal butcher's cleaver with a dark wood "
             "handle, brass collar and iron ring.", bone_cleaver),
        spec("fang_blade", "Serrated Fang", "A saw-toothed blade with a bone guard shaped like "
             "fangs and a bone pommel.", fang_blade),
        spec("nail_club", "Nail Club", "A crude wooden club studded with iron nails, with a "
             "leather hand strap.", nail_club),
    ],
    "twohand": [
        spec("greatsword", "Greatsword", "A long two-handed sword with a ricasso and parrying "
             "lugs, iron crossguard, dark leather grip, iron ball pommel.", greatsword),
        spec("claymore", "Claymore", "A highland sword with forward-swept quillons ending in "
             "trefoils, a guard ring and a wheel pommel.", claymore),
        spec("great_axe", "Double Great Axe", "Twin crescent steel bits on a long dark haft "
             "with an iron socket and top spike.", great_axe),
        spec("warmaul", "Warmaul", "A huge dark-iron hammer head bound with iron bands on a "
             "long wooden haft.", warmaul),
        spec("poleaxe", "Poleaxe", "An axe blade, hammer back and long top spike on a wooden "
             "pole with iron langets and a rondel.", poleaxe),
        spec("headsman", "Headsman's Sword", "A broad square-tipped executioner's blade with a "
             "plain dark-iron guard and pommel.", headsman),
        spec("flamberge", "Flamberge", "A wavy-bladed great sword with a gilded guard and "
             "pommel and a red grip.", flamberge),
        spec("scythe", "Reaper's Scythe", "A long curved scythe blade on a dark wooden snath "
             "with a hand peg.", scythe),
        spec("ogre_club", "Ogre Greatclub", "A massive tree-limb club bound with iron bands "
             "and spiked.", ogre_club),
        spec("glaive", "Glaive", "A long single-edged blade with a back hook on a wooden pole.",
             glaive),
    ],
    "shield_round": [
        spec("ironbound", "Iron-Bound Roundshield", "A painted wooden round shield with an iron "
             "rim and domed iron boss. The player sees the inside: planks and the grip bar.",
             ironbound),
        spec("spiked_buckler", "Spiked Buckler", "A small steel buckler with a spiked boss and "
             "dark iron rim.", spiked_buckler),
        spec("hide_targe", "Hide Targe", "A leather-covered targe with brass studs and a brass "
             "boss.", hide_targe),
        spec("sun_bronze", "Sun Shield", "A bronze shield with golden sun rays radiating from a "
             "gold boss.", sun_bronze),
        spec("skull_boss", "Skull-Boss Shield", "A dark wooden shield with a horned bone skull "
             "boss and a bone rim.", skull_boss),
    ],
    "shield_kite": [
        spec("knights_kite", "Knight's Kite", "A painted wooden kite shield with iron edging and "
             "a small boss.", knights_kite),
        spec("banded_kite", "Banded Kite", "A dark wooden kite shield reinforced with three iron "
             "bands.", banded_kite),
        spec("scale_kite", "Drakescale Kite", "A green kite shield covered in rows of overlapping "
             "drake scales, bronze edging.", scale_kite),
        spec("templar_kite", "Templar Kite", "A silver kite shield with a raised red cross and "
             "gold edging.", templar_kite),
        spec("thorned_kite", "Thorned Kite", "A black obsidian kite shield with iron thorns along "
             "the edge and a central spike.", thorned_kite),
    ],
    "wand": [
        spec("crystal_wand", "Crystal Wand", "A silver wand whose three prongs grip a pale blue "
             "crystal.", crystal_wand),
        spec("bone_wand", "Bone Wand", "A knobbly bone wand tipped with a knucklebone, bound in "
             "sinew.", bone_wand),
        spec("rootwood_wand", "Rootwood Wand", "A twisted root wand with a knot at the grip and "
             "a green seed gem at the tip.", rootwood_wand),
        spec("ember_rod", "Ember Rod", "A dark iron rod with a brass-caged glowing ember orb.",
             ember_rod),
        spec("serpent_wand", "Serpent Wand", "A bronze snake twisting to a head with ruby eyes.",
             serpent_wand),
        spec("starfall_wand", "Starfall Wand", "A dark wooden wand topped with a golden star.",
             starfall_wand),
        spec("antler_wand", "Antler Wand", "A branch of antler with two tines, leather "
             "binding.", antler_wand),
        spec("ebony_wand", "Ebony Wand", "A tapered ebony wand with three silver bands and a "
             "silver tip.", ebony_wand),
        spec("obsidian_shard", "Obsidian Shard", "A jagged shard of volcanic glass with a "
             "wrapped hilt.", obsidian_shard),
        spec("feathered_wand", "Feathered Charm", "A pale wooden wand with a blue bead and a fan "
             "of feathers.", feathered_wand),
    ],
    "staff": [
        spec("gnarled_staff", "Gnarled Crystal Staff", "A twisted wooden staff whose root claws "
             "clutch a pale crystal.", gnarled_staff),
        spec("iron_crook", "Iron Crook", "A dark iron staff ending in a shepherd's crook.",
             iron_crook),
        spec("skull_staff", "Skull Staff", "A pale wooden staff crowned with a skull with ruby "
             "eyes.", skull_staff),
        spec("crescent_staff", "Crescent Staff", "A dark staff with a silver crescent moon and a "
             "moonstone.", crescent_staff),
        spec("serpent_staff", "Serpent Staff", "A green serpent coiling up a dark staff.",
             serpent_staff),
        spec("caged_orb", "Caged Orb Staff", "A brass cage holding a blue orb atop a wooden "
             "staff.", caged_orb),
        spec("antler_staff", "Antler Staff", "A pale wooden staff forking into antlers, tied "
             "with a red cord.", antler_staff),
        spec("crosier", "Bishop's Crosier", "A golden crosier with an ornate crook, a knop and "
             "a ruby.", crosier),
        spec("brazier_staff", "Brazier Staff", "A dark iron staff topped with a burning "
             "brazier.", brazier_staff),
        spec("monk_staff", "Ringed Monk Staff", "A pale wooden staff with a brass loop and "
             "jingle rings.", monk_staff),
    ],
}
