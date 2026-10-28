"""Ten gauntlets for the first-person arm. Each is a complete arm model on the shared skeleton
(arm.bones): sleeve, elbow, bracer, cuff and a glove whose finger pieces ride the finger
bones, so it replaces the bare arm in every rig animation without clipping.

Built for the right arm in hand bind space (wrist at the origin, +z to the fingers, +y along
the grip, +x the back of the hand; the forearm runs back along -z to the elbow at z=-0.30);
the left arm is the mirror.
"""
import math

import numpy as np

import arm as A
from geom import Model, Part, circle, extrude, loft, norm, rounded_rect
from kit import (BLUE, BONE, BRASS, BRONZE, CHAIN, CRYSTAL, DARKIRON, DARKLEATHER, EMBER, FUR,
                 GOLD, GREEN, HORN, IRON, LEATHER, PURPLE, RED, SILVER, SKIN, STEEL, WRAP)

FINGERS = A.FINGERS
HANDLE = np.array([0.0, 0.0, A.HAND])  # the grip axis runs along y through here


def P(name, bone, color, islands, **kw):
    return Part(name, bone, color, islands, **kw)


def fore_radius(z):
    """(y radius, x radius) of the bare forearm at bind z, for wrapping things around it."""
    pts = [(-0.275, 0.042, 0.038), (-0.24, 0.045, 0.040), (-0.15, 0.039, 0.034),
           (-0.008, 0.030, 0.026)]
    for (z0, a0, b0), (z1, a1, b1) in zip(pts, pts[1:]):
        if z0 <= z <= z1:
            s = (z - z0) / (z1 - z0)
            return a0 + (a1 - a0) * s, b0 + (b1 - b0) * s
    return (pts[0][1], pts[0][2]) if z < pts[0][0] else (pts[-1][1], pts[-1][2])


def _out(f, k):
    """Unit vector from the grip axis out through the back of finger f's segment k."""
    j = A.finger_joints(f)
    mid = (j[k] + j[k + 1]) / 2
    v = mid - np.array([0.0, mid[1], HANDLE[2]])
    if f == "thumb":
        v = mid - np.array([0.0, mid[1], HANDLE[2]]) + np.array([0.0, 0.01, 0.0])
    return norm(v)


# ----------------------------------------------------------------- glove pieces


def glove(color, scale=1.12, fingerless=False, skin=SKIN, palm_color=None):
    """Palm, wrist and finger/thumb segments, a little fuller than the bare hand.
    Fingerless gloves leave the middle and end segments bare."""
    # the glove's wrist: skin from under the bracer into the palm, bending with the hand
    parts = [A.forearm_skin("glove wrist", color, z_start=-0.075, pad=0.0025, weight=1.6)]
    for p in A.hand_parts(color, scale):
        if p.name == "palm" and palm_color:
            p.color = palm_color
        base, _, k = p.name.partition(" ")
        if fingerless and base in FINGERS + ("thumb",) and k in ("2", "3"):
            seg = int(k) - 1
            j = A.finger_joints(base)
            w = A.finger_width(base)
            p = P(p.name, p.bone, skin, A.segment(p.name, j[seg], j[seg + 1], w, w * 0.88,
                                                    cap_end=(seg == 2)), weight=2.0)
        p.label = p.name.replace("palm", "glove: palm and back")
        p.weight = 2.0
        p.v_label = "toward tip" if base in FINGERS + ("thumb",) else None
        parts.append(p)
    return parts


def finger_plates(color, segs=(0, 1, 2), widen=1.05, thick=0.0045, thumb=True, fingers=FINGERS,
                  name="plate", lift=0.0):
    """Armour lames on the back of each finger segment."""
    parts = []
    for f in fingers + (("thumb",) if thumb else ()):
        j = A.finger_joints(f)
        w = A.finger_width(f) * 1.12 * (0.85 if f == "thumb" else 1.0)
        for k in segs:
            o = _out(f, k) * (w * 0.5 + thick * 0.5 + 0.001 + lift)
            a, b = j[k] + o, j[k + 1] + o
            d = norm(b - a)
            a, b = a - d * 0.002, b + d * (0.004 if k < 2 else 0.0)
            secs = [rounded_rect(thick, w * widen), rounded_rect(thick, w * widen * 0.92)]
            parts.append(P(f"{f} {name} {k + 1}", f"{f}{k + 1}", color,
                           loft(f"{f} {name} {k + 1}", [a, b], secs, up=(0, 1, 0),
                                caps=(True, True)), weight=1.6, v_label="toward tip"))
    return parts


def claws(color, length=0.035):
    """Curved claws off the fingertips."""
    parts = []
    for f in FINGERS + ("thumb",):
        j = A.finger_joints(f)
        d = norm(j[3] - j[2])
        o = _out(f, 2)
        base = j[3] - d * 0.004 + o * 0.004
        mid = base + d * length * 0.55 + o * length * 0.05
        tip = base + d * length - o * length * 0.35
        parts.append(P(f"{f} claw", f"{f}3", color, loft(
            f"{f} claw", [base, mid, tip], [circle(0.006, 5), circle(0.004, 5), circle(0.0006, 5)],
            up=(0, 1, 0), caps=(True, False)), weight=1.2, v_label="toward tip"))
    return parts


def _arc_section(width, bulge, thick, n=5):
    outer = [(width * s, thick + bulge * (1 - s * s)) for s in np.linspace(-1, 1, n)]
    inner = [(width * s, bulge * (1 - s * s)) for s in np.linspace(1, -1, n)]
    return outer + inner


def hand_plate(color, length=1.0, width=0.037, bulge=0.006, thick=0.005, name="hand plate"):
    """A domed plate over the back of the hand, wrist to knuckles."""
    path = [(0.026, 0, -0.004), (0.031, 0, 0.040 * length), (0.029, 0, 0.074 * length)]
    secs = [_arc_section(width * 0.9, bulge, thick), _arc_section(width, bulge, thick),
            _arc_section(width * 1.02, bulge * 0.8, thick)]
    return P(name, "hand", color, loft(name, path, secs, up=(1, 0, 0), caps=(True, True),
                                       sharp=True), weight=2.0, v_label="toward knuckles")


def knuckle_guard(color, r=0.008, name="knuckle guard"):
    """A rounded bar across the knuckles."""
    c = A.finger_joints("middle")[0]
    o = norm(np.array([c[0], 0, c[2] - HANDLE[2]]))
    p = np.array([c[0], 0, c[2]]) + o * 0.015
    path = [p + np.array([0, y, 0]) for y in np.linspace(-0.040, 0.040, 5)]
    secs = [rounded_rect(r * 1.6, r * 2.4)] * 5
    return P(name, "hand", color, loft(name, path, secs, up=o, caps=(True, True)), weight=1.8,
             v_label="toward index finger")


def knuckle_spikes(color, length=0.022):
    out = []
    for f in FINGERS:
        c = A.finger_joints(f)[0]
        o = norm(np.array([c[0], 0, c[2] - HANDLE[2]]))
        base = np.array([c[0], c[1], c[2]]) + o * 0.014
        out.append(P(f"{f} knuckle spike", "hand", color, loft(
            f"{f} knuckle spike", [base, base + o * length],
            [circle(0.0065, 5), circle(0.0005, 5)], up=(0, 1, 0), caps=(True, False)),
            weight=1.0))
    return out


def cuff(color, flare=1.45, length=0.075, name="cuff", bone="fore", ribs=0):
    """A flared cuff over the wrist, opening back over the forearm (hourglass gauntlets). It
    rides the forearm and its front edge is skinned toward the hand, so it bends with the
    wrist instead of swinging out of the bracer. `ribs` adds raised flutes."""
    zs = np.linspace(-0.004, -length, 5)
    secs = []
    for i, z in enumerate(zs):
        k = 1 + (flare - 1) * (i / (len(zs) - 1)) ** 1.6
        if ribs:
            pts = []
            for s in range(ribs * 2):
                ang = 2 * math.pi * s / (ribs * 2)
                rr = 1.0 + (0.08 if s % 2 == 0 and i > 0 else 0.0)
                pts.append((0.033 * k * rr * math.cos(ang), 0.039 * k * rr * math.sin(ang)))
            secs.append(pts)
        else:
            secs.append(circle(0.039 * k, 12, 0.033 * k))
    return P(name, bone, color, loft(name, [(0, 0, z) for z in zs], secs, caps=(False, False),
                                     sharp=bool(ribs)), weight=1.4, v_label="toward elbow",
             blend=("hand",) + A.WRIST_BLEND)


def bracer(color, z0=-0.262, z1=-0.02, pad=0.007, style="plain", n=10, name="bracer"):
    """A vambrace around the forearm. Styles: plain, bell (flares at the wrist), ridged."""
    zs = np.linspace(z0, z1, 6)
    secs = []
    for i, z in enumerate(zs):
        ry, rx = fore_radius(z)
        k = 1.0
        if style == "bell" and i >= 4:
            k = 1.0 + 0.18 * (i - 3)
        if style == "ridged":
            pts = []
            for s in range(n):
                ang = 2 * math.pi * s / n
                rr = 1.0 + (0.22 if s == 0 else 0.0)  # a raised ridge down the back (+x)
                pts.append(((rx + pad) * k * rr * math.cos(ang), (ry + pad) * k * math.sin(ang)))
            secs.append(pts)
        else:
            secs.append(circle((ry + pad) * k, n, (rx + pad) * k))
    return P(name, "fore", color, loft(name, [(0, 0, z) for z in zs], secs, caps=(True, True),
                                       sharp=(style == "ridged")), weight=1.0,
             v_label="toward hand")


def band(color, z, width=0.012, pad=0.011, name="band", bone="fore", n=10):
    ry, rx = fore_radius(z)
    zs = (z - width / 2, z, z + width / 2)
    secs = [circle(ry + pad * 0.85, n, rx + pad * 0.85), circle(ry + pad, n, rx + pad),
            circle(ry + pad * 0.85, n, rx + pad * 0.85)]
    return P(name, bone, color, loft(name, [(0, 0, q) for q in zs], secs, caps=(False, False)),
             weight=0.8)


def scale_rows(color, z0=-0.25, z1=-0.05, rows=6, pad=0.008, name="scales"):
    """Overlapping rings of scales down the forearm, each flaring toward the hand."""
    out = []
    for i, z in enumerate(np.linspace(z0, z1, rows)):
        ry, rx = fore_radius(z)
        zs = (z - 0.012, z + 0.03)
        secs = [circle(ry + pad * 0.6, 10, rx + pad * 0.6), circle(ry + pad * 1.5, 10, rx + pad * 1.5)]
        out.append(P(f"{name} row {i + 1}", "fore", color, loft(
            f"{name} row {i + 1}", [(0, 0, q) for q in zs], secs, caps=(False, False)),
            weight=0.8, v_label="toward hand"))
    return out


def fin(color, z0=-0.24, z1=-0.06, teeth=5, height=0.022, thick=0.005, name="spine fin"):
    """A saw-toothed fin standing up along the back (+x) of the bracer."""
    zs = np.linspace(z0, z1, teeth * 2 + 1)
    pts = []
    for i, z in enumerate(zs):
        ry, rx = fore_radius(z)
        pts.append((z, rx + 0.006 + (height if i % 2 else height * 0.3)))
    poly = [(zs[0], fore_radius(zs[0])[1])] + pts + [(zs[-1], fore_radius(zs[-1])[1])]
    return P(name, "fore", color, extrude(name, poly, (0, 0, 0), (0, 0, 1), (1, 0, 0), thick),
             weight=0.8)


def bracer_spikes(color, zs=(-0.20, -0.14, -0.08), length=0.024, name="bracer spike"):
    out = []
    for i, z in enumerate(zs):
        ry, rx = fore_radius(z)
        for side, d in (("back", np.array([1.0, 0, 0])), ("outer", np.array([0, 1.0, 0]))):
            base = np.array([0, 0, z]) + d * ((rx if side == "back" else ry) + 0.006)
            out.append(P(f"{name} {side} {i + 1}", "fore", color, loft(
                f"{name} {side} {i + 1}", [base, base + d * length],
                [circle(0.007, 5), circle(0.0006, 5)], up=(0, 0, 1), caps=(True, False)),
                weight=0.7))
    return out


def sleeve(color, mail=False, name=None):
    name = name or ("mail sleeve" if mail else "sleeve")
    return P(name, "upper", color, loft(
        name, [(0, 0, -0.60), (0, 0, -0.42), (0, 0, -0.30)],
        [circle(0.054, 10, 0.050), circle(0.050, 10, 0.046), circle(0.045, 10, 0.040)],
        caps=(False, True)), weight=0.35, v_label="toward elbow")


def couter(color, wing=True, spike=0.0, name="couter"):
    """Elbow armour on the elbow helper bone: a cup over the point of the elbow, with an
    optional fan-shaped wing on the outer side and an optional spike."""
    zc = -0.30
    hs = np.linspace(-0.045, 0.045, 7)
    secs = []
    for h in hs:
        k = math.sqrt(max(1 - (h / 0.05) ** 2, 0.15))
        secs.append(_arc_section(0.048 * k, 0.020 * k, 0.005, n=5))
    out = [P(name, "elbow", color, loft(name, [(0.034, 0, zc + h) for h in hs], secs,
                                        up=(1, 0, 0), caps=(True, True), sharp=True),
             weight=0.8, v_label="toward hand")]
    if wing:
        poly = [(-0.035, 0.0), (0.0, 0.05), (0.035, 0.0), (0.0, 0.012)]
        out.append(P(f"{name} wing", "elbow", color, extrude(
            f"{name} wing", [(zc + a, b + 0.046) for a, b in poly], (0.02, 0, 0), (0, 0, 1),
            (0, 1, 0), 0.004), weight=0.6))
    if spike:
        base = np.array([0.058, 0, zc])
        out.append(P(f"{name} spike", "elbow", color, loft(
            f"{name} spike", [base, base + np.array([spike, 0, -spike * 0.3])],
            [circle(0.008, 5), circle(0.0006, 5)], up=(0, 1, 0), caps=(True, False)),
            weight=0.6))
    return out


def medallion(color, r=0.016, name="medallion"):
    c = np.array([0.038, 0.0, 0.036])
    path = [c - np.array([0.003, 0, 0]), c + np.array([0.002, 0, 0]), c + np.array([0.005, 0, 0])]
    secs = [circle(r, 10), circle(r * 0.95, 10), circle(r * 0.55, 10)]
    return P(name, "hand", color, loft(name, path, secs, up=(0, 0, 1), caps=(True, True)),
             weight=1.6)


def gem(color, r=0.010, name="gem"):
    c = np.array([0.040, 0.0, 0.036])
    path = [c - np.array([0.002, 0, 0]), c + np.array([0.004, 0, 0]), c + np.array([0.013, 0, 0])]
    secs = [circle(r, 6), circle(r, 6), circle(0.0008, 6)]
    return P(name, "hand", color, loft(name, path, secs, up=(0, 0, 1), caps=(True, False),
                                       sharp=True), weight=1.4)


def cloth_elbow(sleeve_color, cuff_color=None):
    return A.elbow_parts(sleeve_color, cuff_color or sleeve_color, scale=1.04)


def joint_only(color):
    """Just the elbow joint mass (under a couter)."""
    return [p for p in A.elbow_parts(color, color, scale=1.02) if p.name in ("elbow",
                                                                            "elbow point")]


# ----------------------------------------------------------------- the ten designs


def wayfarer():
    return [sleeve(RED)] + cloth_elbow(RED) + [
        bracer(LEATHER, name="leather bracer"), band(IRON, -0.05, name="iron wrist band"),
        band(IRON, -0.235, name="iron elbow band")] + glove(DARKLEATHER) + finger_plates(
        DARKIRON) + [knuckle_guard(DARKIRON), hand_plate(DARKIRON)]


def hunter():
    return [sleeve(GREEN)] + cloth_elbow(GREEN) + [bracer(LEATHER, pad=0.004)] + [
        band(WRAP, z, width=0.016, pad=0.008, name=f"wrap {i + 1}")
        for i, z in enumerate((-0.22, -0.17, -0.12, -0.07))] + glove(LEATHER, 1.08) + [
        cuff(LEATHER, flare=1.15, length=0.045, name="glove cuff")]


def mailed():
    return [sleeve(CHAIN, mail=True)] + joint_only(CHAIN) + couter(STEEL, wing=False) + [
        bracer(CHAIN, pad=0.004, name="mail sleeve (forearm)")] + glove(CHAIN, 1.10) + [
        cuff(STEEL, flare=1.35, length=0.06, name="plate cuff"), knuckle_guard(STEEL)]


def knight():
    return [sleeve(CHAIN, mail=True)] + joint_only(CHAIN) + couter(STEEL) + [
        bracer(STEEL, name="vambrace"), cuff(STEEL, flare=1.4, length=0.08, name="hourglass cuff")
    ] + glove(DARKLEATHER, 1.08) + finger_plates(STEEL, widen=1.2) + [
        knuckle_guard(STEEL), hand_plate(STEEL, width=0.040)]


def brawler():
    return [sleeve(DARKLEATHER)] + cloth_elbow(DARKLEATHER) + [
        bracer(LEATHER, name="studded bracer")] + bracer_spikes(IRON) + glove(
        LEATHER, 1.14) + knuckle_spikes(IRON) + [knuckle_guard(DARKLEATHER, name="knuckle pad")]


def boneward():
    return [sleeve(FUR, name="fur sleeve")] + joint_only(FUR) + couter(
        BONE, wing=False, name="bone couter") + [bracer(DARKLEATHER, pad=0.004, name="hide bracer")
    ] + [band(BONE, z, width=0.010, pad=0.012, name=f"rib {i + 1}")
         for i, z in enumerate((-0.23, -0.19, -0.15, -0.11, -0.07))] + glove(
        DARKLEATHER, 1.08) + finger_plates(BONE, segs=(0, 1), widen=1.0, name="bone plate") + [
        hand_plate(BONE, name="bone hand plate")]


def fiend():
    return [sleeve(RED, name="sleeve")] + joint_only(DARKIRON) + couter(
        DARKIRON, wing=False, spike=0.035) + [bracer(DARKIRON, style="ridged", name="vambrace"),
                                              fin(DARKIRON)] + glove(
        DARKLEATHER, 1.10) + finger_plates(DARKIRON, widen=1.1) + claws(DARKIRON) + [
        hand_plate(DARKIRON), gem(EMBER, name="ember stone")]


def templar():
    return [sleeve(BLUE, name="tabard sleeve")] + joint_only(CHAIN) + couter(
        STEEL, name="couter") + [bracer(STEEL, style="bell", name="vambrace"),
                                 band(GOLD, -0.06, width=0.010, pad=0.016, name="gold trim")] + glove(
        DARKLEATHER, 1.08) + finger_plates(STEEL, widen=1.15) + [
        knuckle_guard(GOLD, name="gilded knuckle bar"), hand_plate(STEEL, width=0.040),
        medallion(GOLD, name="sun medallion"), cuff(STEEL, flare=1.45, ribs=8, name="fluted cuff")]


def drake():
    return [sleeve(RED)] + joint_only(DARKLEATHER) + couter(BRONZE, wing=False,
                                                           name="scale couter") + [
        bracer(DARKLEATHER, pad=0.003, name="under-bracer")] + scale_rows(GREEN) + glove(
        DARKLEATHER, 1.08) + finger_plates(GREEN, widen=1.1, name="scale") + [
        hand_plate(BRONZE, name="drake plate")] + knuckle_spikes(HORN, length=0.016)


def runebound():
    return [sleeve(PURPLE, name="robe sleeve")] + cloth_elbow(PURPLE) + [
        bracer(PURPLE, pad=0.005, name="cloth bracer"),
        band(SILVER, -0.07, width=0.010, pad=0.010, name="silver band 1"),
        band(SILVER, -0.20, width=0.010, pad=0.010, name="silver band 2")] + glove(
        PURPLE, 1.06, fingerless=True) + [hand_plate(SILVER, length=0.8, name="silver mount"),
                                          gem(CRYSTAL, r=0.012, name="focus crystal")]


GAUNTLETS = [
    ("wayfarer", "Wayfarer's Gauntlet", wayfarer,
     "The player's default arm: blackened-iron finger lames and knuckle bar over a dark leather "
     "glove, a domed iron hand plate with brass rivets, a brown leather bracer laced with pale "
     "rawhide between two iron bands, and a wine-red wool sleeve."),
    ("hunter", "Hunter's Wraps", hunter,
     "A soft brown leather glove with a short cuff, the forearm bound in pale linen wraps over "
     "a thin leather bracer, a mossy green wool sleeve. Worn, stitched, practical."),
    ("mailed", "Mailed Glove", mailed,
     "A riveted chain-mail glove and mail sleeve, a polished steel plate cuff, a steel knuckle "
     "bar and a plain steel elbow cop. Grey, cold, functional."),
    ("knight", "Knight's Hourglass", knight,
     "Full plate: an hourglass cuff that flares over the wrist, broad steel finger lames, knuckle "
     "bar and hand plate, a steel vambrace and a winged elbow couter over chain mail."),
    ("brawler", "Spiked Brawler", brawler,
     "Studded brown leather with iron spikes on every knuckle and down the bracer, a thick "
     "leather knuckle pad, a dark leather sleeve. A pit fighter's gear."),
    ("boneward", "Bone-Ward", boneward,
     "Tribal: bleached bone plates bound to a dark hide glove with sinew, bone ribs lashed "
     "around a hide bracer, a bone elbow cap, and a shaggy brown fur sleeve."),
    ("fiend", "Fiend's Claw", fiend,
     "Blackened, ridged demon-iron with a saw-toothed spine fin, hooked claws on every finger, "
     "a spiked elbow, and a glowing ember stone set in the back of the hand."),
    ("templar", "Gilded Templar", templar,
     "Holy plate: polished steel with gold trim, a fluted bell cuff, a gilded knuckle bar, a gold "
     "sun medallion on the back of the hand, a royal blue tabard sleeve over mail."),
    ("drake", "Drakescale", drake,
     "Overlapping rows of green drake scales down the forearm and over the fingers, bronze "
     "hand plate and elbow cap, horn studs on the knuckles, a dark red sleeve."),
    ("runebound", "Runebound Glove", runebound,
     "A mage's fingerless violet glove and robe sleeve, silver bands carved with runes around "
     "the forearm, and a pale blue focus crystal set in a silver mount on the back of the hand."),
]


def build(gid, side="R"):
    entry = next(g for g in GAUNTLETS if g[0] == gid)
    model = Model(f"{gid}_R", entry[2](), tex=256)
    return A.mirrored(model) if side == "L" else model
