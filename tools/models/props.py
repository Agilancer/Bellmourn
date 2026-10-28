"""World props: containers, pillars, furnishings and graveyard pieces.

Built in metres with the origin on the floor at the prop's centre, +y up and +z the prop's
front (the side a player usually faces), using the same kit as the held items.
"""
import math

import numpy as np

from autotexture import CLOTHRED, DARKSTONE, FLAME, MARBLE, MOSSSTONE, STONE, WAX
from geom import Model, box, circle, extrude, loft, rounded_rect
from kit import (BLUE, BRASS, DARKIRON, DARKLEATHER, DARKWOOD, GOLD, GREEN, IRON, LEATHER,
                 PALEWOOD, RED, WOOD, WRAP, X, Y, Z, ball, bar_between, part, ring, shaft,
                 turned)


def block(name, color, c, half, **kw):
    """An axis-aligned box from its centre and half sizes."""
    return part(name, color, box(name, c, (X, Y, Z), half), **kw)


def column(name, color, y0, y1, r0, r1=None, n=12, x=0.0, z=0.0, **kw):
    return shaft(name, color, y0, y1, r0, r1, n=n, x=x, z=z, **kw)


# ---------------------------------------------------------------- containers


def treasure_chest():
    w, d, h = 0.45, 0.28, 0.30  # half width/depth, body height
    lid = [(0.0, h)] + [(d * math.cos(a), h + 0.17 * math.sin(a))
                        for a in np.linspace(0, math.pi, 9)] + [(0.0, h)]
    lid_sec = [(z, y) for z, y in lid[1:-1]] + [(-d, h), (d, h)]
    parts = [block("body", WOOD, (0, h / 2, 0), (w, h / 2, d)),
             part("lid", WOOD, loft("lid", [(-w, 0, 0), (w, 0, 0)],
                                    [[(-z, y - h) for z, y in lid_sec]] * 2, up=Y,
                                    caps=(True, True)), v_label=None)]
    parts[1].islands = [i.transformed(_translate((0, h, 0))) for i in parts[1].islands]
    for k, x in enumerate((-0.32, 0.0, 0.32)):
        parts.append(block(f"iron band {k + 1}", DARKIRON, (x, h / 2, 0), (0.025, h / 2 + 0.005, d + 0.006)))
        band = [(d + 0.008) * math.cos(a) for a in np.linspace(0, math.pi, 9)]
        parts.append(part(f"lid band {k + 1}", DARKIRON, loft(
            f"lid band {k + 1}", [(x - 0.025, h, 0), (x + 0.025, h, 0)],
            [[((d + 0.008) * math.cos(a), 0.178 * math.sin(a)) for a in np.linspace(0, math.pi, 9)]
             + [(-(d + 0.008), -0.004), ((d + 0.008), -0.004)]] * 2, up=Y, caps=(True, True))))
    parts.append(block("lock plate", GOLD, (0, h - 0.02, d + 0.012), (0.06, 0.07, 0.012)))
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(block(f"corner {'L' if sx < 0 else 'R'}{'B' if sz < 0 else 'F'}", BRASS,
                               (sx * (w - 0.02), 0.03, sz * (d - 0.02)), (0.035, 0.035, 0.035)))
    return parts


def _translate(o):
    m = np.eye(4)
    m[:3, 3] = o
    return m


def crate():
    s = 0.4
    parts = [block("crate box", PALEWOOD, (0, s, 0), (s, s, s))]
    for k, (ax, c, half) in enumerate([
            (0, (0, s, s + 0.012), (s, 0.05, 0.012)), (0, (0, s, -s - 0.012), (s, 0.05, 0.012)),
            (1, (s + 0.012, s, 0), (0.012, 0.05, s)), (1, (-s - 0.012, s, 0), (0.012, 0.05, s))]):
        parts.append(block(f"brace {k + 1}", WOOD, c, half))
    for k, (x, z) in enumerate(((s, s), (-s, s), (s, -s), (-s, -s))):
        parts.append(block(f"corner post {k + 1}", WOOD, (x * 0.97, s, z * 0.97), (0.045, s + 0.01, 0.045)))
    return parts


def barrel():
    prof = [(0.27, 0.0), (0.31, 0.12), (0.34, 0.45), (0.31, 0.78), (0.27, 0.9)]
    parts = [turned("staves", WOOD, 0.0, prof, n=14, v_label="toward top"),
             part("lid", DARKWOOD, extrude("lid", circle(0.255, 14), (0, 0.905, 0), X, Z, 0.02))]
    for k, (y, r) in enumerate(((0.1, 0.305), (0.32, 0.34), (0.58, 0.34), (0.8, 0.305))):
        parts.append(ring(f"hoop {k + 1}", DARKIRON, (0, y, 0), Y, r + 0.004, 0.012, n=16, m=4))
    return parts


# ---------------------------------------------------------------- pillars (4 m)

H = 4.0


def _plinth(color, w=0.42, h=0.3):
    return [block("plinth", color, (0, h / 2, 0), (w, h / 2, w))]


def pillar_round():
    return _plinth(STONE) + [
        turned("base moulding", STONE, 0.3, [(0.36, 0), (0.37, 0.06), (0.32, 0.12), (0.3, 0.18)], n=16),
        turned("shaft", STONE, 0.48, [(0.28, 0), (0.29, 1.0), (0.27, 2.4), (0.25, 3.06)], n=16,
               v_label="toward top"),
        turned("capital", STONE, 3.54, [(0.26, 0), (0.3, 0.1), (0.36, 0.2), (0.38, 0.26)], n=16),
        block("abacus", STONE, (0, 3.89, 0), (0.42, 0.09, 0.42))]


def pillar_square():
    return _plinth(DARKSTONE, 0.45, 0.35) + [
        block("pier", DARKSTONE, (0, 2.0, 0), (0.34, 1.65, 0.34), v_label="toward top"),
        block("impost", DARKSTONE, (0, 3.75, 0), (0.42, 0.1, 0.42)),
        block("base course", DARKSTONE, (0, 0.42, 0), (0.39, 0.07, 0.39)),
        block("cap block", DARKSTONE, (0, 3.93, 0), (0.46, 0.07, 0.46))]


def pillar_gothic():
    oct_ = circle(0.42, 8, start=math.pi / 8)
    parts = [part("octagonal base", MARBLE, loft("octagonal base", [(0, 0, 0), (0, 0.45, 0)], [oct_, [(x * 0.9, y * 0.9) for x, y in oct_]], up=Z, caps=(True, True))),
             column("core", MARBLE, 0.45, 3.55, 0.22, n=8, v_label="toward top")]
    for k in range(4):
        a = math.radians(45 + 90 * k)
        parts.append(column(f"shaft {k + 1}", MARBLE, 0.45, 3.55, 0.1, x=0.22 * math.cos(a),
                            z=0.22 * math.sin(a), n=8, v_label="toward top"))
    parts.append(part("octagonal capital", MARBLE, loft("octagonal capital", [(0, 3.55, 0), (0, 4.0, 0)],
                                                       [[(x * 0.9, y * 0.9) for x, y in oct_], [(x * 1.15, y * 1.15) for x, y in oct_]],
                                                       up=Z, caps=(True, True))))
    return parts


def pillar_twisted():
    ys = np.linspace(0.4, 3.6, 17)
    secs = []
    for y in ys:
        a = (y - 0.4) * 1.6
        sq = [(0.2, 0.0), (0.0, 0.2), (-0.2, 0.0), (0.0, -0.2)]
        rr = []
        for k in range(8):  # an eight-lobed section turning up the shaft: a solomonic twist
            t = 2 * math.pi * k / 8 + a
            r = 0.2 if k % 2 == 0 else 0.15
            rr.append((r * math.cos(t), r * math.sin(t)))
        secs.append(rr)
    return _plinth(MARBLE, 0.36, 0.4) + [
        part("twisted shaft", MARBLE, loft("twisted shaft", [(0, y, 0) for y in ys], secs, up=Z,
                                           caps=(False, False)), v_label="toward top"),
        turned("capital", GOLD, 3.6, [(0.18, 0), (0.3, 0.2), (0.34, 0.4)], n=12),
        block("abacus", MARBLE, (0, 4.05, 0), (0.38, 0.05, 0.38))]


def pillar_fluted():
    secs = []
    for _ in range(2):
        pts = []
        for k in range(24):  # twelve flutes
            t = 2 * math.pi * k / 24
            r = 0.27 if k % 2 == 0 else 0.245
            pts.append((r * math.cos(t), r * math.sin(t)))
        secs.append(pts)
    return _plinth(STONE, 0.4, 0.25) + [
        turned("torus", STONE, 0.25, [(0.33, 0), (0.35, 0.07), (0.3, 0.14)], n=16),
        part("fluted shaft", STONE, loft("fluted shaft", [(0, 0.39, 0), (0, 3.5, 0)], secs, up=Z,
                                         caps=(False, False)), v_label="toward top"),
        turned("echinus", STONE, 3.5, [(0.28, 0), (0.36, 0.18), (0.4, 0.26)], n=16),
        block("abacus", STONE, (0, 3.86, 0), (0.44, 0.1, 0.44))]


def pillar_broken():
    jag = []
    for k in range(12):
        t = 2 * math.pi * k / 12
        jag.append((0.27 * math.cos(t), 0.27 * math.sin(t)))
    top = [(x, z) for x, z in jag]
    parts = _plinth(MOSSSTONE) + [
        turned("stump", MOSSSTONE, 0.3, [(0.28, 0), (0.28, 1.1), (0.27, 1.5)], n=12, v_label="toward top")]
    # a jagged break: little spikes standing on the stump's rim
    for k in range(0, 12, 2):
        t = 2 * math.pi * k / 12
        parts.append(part(f"break shard {k // 2 + 1}", MOSSSTONE, loft(
            f"break shard {k // 2 + 1}", [(0.2 * math.cos(t), 1.75, 0.2 * math.sin(t)),
                                          (0.2 * math.cos(t), 1.75 + 0.12 + 0.1 * (k % 4), 0.2 * math.sin(t))],
            [circle(0.09, 5), circle(0.01, 5)], up=Z, caps=(True, False))))
    fallen = turned("fallen drum", MOSSSTONE, 0.0, [(0.26, 0), (0.27, 0.9)], n=12, axis=X)
    fallen.islands = [i.transformed(_translate((0.55, 0.27, 0.45))) for i in fallen.islands]
    return parts + [fallen]


# ---------------------------------------------------------------- furnishings


def table():
    parts = [block("table top", WOOD, (0, 0.76, 0), (0.8, 0.04, 0.45))]
    for k, (x, z) in enumerate(((0.7, 0.36), (-0.7, 0.36), (0.7, -0.36), (-0.7, -0.36))):
        parts.append(block(f"leg {k + 1}", DARKWOOD, (x, 0.36, z), (0.05, 0.36, 0.05)))
    parts.append(block("stretcher", DARKWOOD, (0, 0.18, 0), (0.66, 0.03, 0.03)))
    return parts


def stool():
    parts = [part("seat", WOOD, extrude("seat", circle(0.2, 10), (0, 0.45, 0), X, Z, 0.05))]
    for k in range(3):
        a = 2 * math.pi * k / 3
        parts.append(bar_between(f"leg {k + 1}", DARKWOOD, (0.15 * math.cos(a), 0.43, 0.15 * math.sin(a)),
                                 (0.2 * math.cos(a), 0.0, 0.2 * math.sin(a)), 0.025, n=5))
    return parts


def pew():
    L = 1.5
    parts = [block("seat", DARKWOOD, (0, 0.45, 0), (L, 0.035, 0.22)),
             block("backrest", DARKWOOD, (0, 0.78, -0.2), (L, 0.28, 0.025)),
             block("kneeler", DARKWOOD, (0, 0.12, 0.3), (L - 0.05, 0.03, 0.06))]
    end = [(-0.25, 0.0), (0.25, 0.0), (0.25, 0.55), (-0.18, 0.55), (-0.18, 1.05), (-0.26, 1.12)]
    for k, x in enumerate((-L, L)):
        parts.append(part(f"pew end {k + 1}", DARKWOOD, extrude(f"pew end {k + 1}", end, (x, 0, 0), Z, Y, 0.06)))
    return parts


def bookshelf():
    w, d, h = 0.6, 0.18, 1.0
    parts = [block("back", DARKWOOD, (0, h, -d + 0.01), (w, h, 0.012)),
             block("side L", DARKWOOD, (-w, h, 0), (0.025, h, d)),
             block("side R", DARKWOOD, (w, h, 0), (0.025, h, d))]
    rng = np.random.default_rng(5)
    for k, y in enumerate(np.linspace(0.02, 2.0, 5)):
        parts.append(block(f"shelf {k + 1}", WOOD, (0, y, 0), (w, 0.02, d)))
        if k == 4:
            break
        x = -w + 0.05
        cols = (RED, BLUE, GREEN, LEATHER, DARKLEATHER, CLOTHRED)
        n = 0
        while x < w - 0.08 and n < 11:
            bw = float(rng.uniform(0.03, 0.06))
            bh = float(rng.uniform(0.25, 0.4))
            parts.append(block(f"book {k + 1}.{n + 1}", cols[int(rng.integers(len(cols)))],
                               (x + bw / 2, y + 0.02 + bh / 2, 0.01), (bw / 2 - 0.003, bh / 2, d * 0.8)))
            x += bw
            n += 1
    return parts


def bed():
    return [block("frame", DARKWOOD, (0, 0.2, 0), (0.5, 0.1, 1.0)),
            block("mattress", WRAP, (0, 0.38, 0), (0.46, 0.08, 0.96)),
            block("blanket", RED, (0, 0.47, 0.22), (0.48, 0.03, 0.72)),
            block("pillow", WRAP, (0, 0.5, -0.78), (0.32, 0.05, 0.14)),
            block("headboard", DARKWOOD, (0, 0.55, -1.0), (0.52, 0.45, 0.04)),
            block("footboard", DARKWOOD, (0, 0.35, 1.0), (0.52, 0.25, 0.04))]


def altar():
    parts = [block("altar block", MARBLE, (0, 0.5, 0), (1.0, 0.5, 0.45)),
             block("altar step", MARBLE, (0, 0.06, 0.1), (1.15, 0.06, 0.62)),
             block("altar cloth", CLOTHRED, (0, 1.005, 0), (1.02, 0.008, 0.47)),
             block("cloth front", CLOTHRED, (0, 0.75, 0.462), (0.35, 0.25, 0.008))]
    for k, x in enumerate((-0.7, 0.7)):
        parts += [turned(f"candlestick {k + 1}", GOLD, 1.01, [(0.07, 0), (0.03, 0.04), (0.02, 0.28), (0.04, 0.32)], n=8, x=x),
                  column(f"candle {k + 1}", WAX, 1.33, 1.5, 0.022, n=6, x=x),
                  turned(f"flame {k + 1}", FLAME, 1.5, [(0.012, 0), (0.016, 0.03), (0.001, 0.07)], n=5, x=x)]
    parts.append(block("gold cross", GOLD, (0, 1.4, -0.3), (0.02, 0.38, 0.02)))
    parts.append(block("gold cross arm", GOLD, (0, 1.55, -0.3), (0.15, 0.02, 0.02)))
    return parts


def pulpit():
    hexa = circle(0.6, 6, start=math.pi / 6)
    return [part("pulpit base", DARKWOOD, loft("pulpit base", [(0, 0, 0), (0, 0.9, 0)], [hexa, [(x * 0.8, y * 0.8) for x, y in hexa]], up=Z, caps=(True, True))),
            part("pulpit drum", DARKWOOD, loft("pulpit drum", [(0, 0.9, 0), (0, 1.0, 0), (0, 1.9, 0)], [[(x * 0.8, y * 0.8) for x, y in hexa], hexa, hexa], up=Z, caps=(True, True))),
            block("lectern board", WOOD, (0, 2.0, 0.3), (0.35, 0.02, 0.25)),
            block("bible", CLOTHRED, (0, 2.04, 0.3), (0.18, 0.025, 0.13)),
            block("step 1", DARKWOOD, (0, 0.15, -0.85), (0.4, 0.15, 0.2)),
            block("step 2", DARKWOOD, (0, 0.45, -0.7), (0.4, 0.15, 0.15))]


def candelabrum():
    parts = [turned("candelabrum stand", DARKIRON, 0.0, [(0.22, 0), (0.12, 0.05), (0.03, 0.12), (0.025, 1.35), (0.05, 1.4)], n=8),
             bar_between("candle arm", DARKIRON, (-0.3, 1.4, 0), (0.3, 1.4, 0), 0.015, n=5)]
    for k, x in enumerate((-0.3, 0.0, 0.3)):
        y = 1.42 + (0.08 if x == 0 else 0.0)
        parts += [turned(f"cup {k + 1}", DARKIRON, y - 0.02, [(0.05, 0), (0.05, 0.04)], n=6, x=x),
                  column(f"candle {k + 1}", WAX, y + 0.02, y + 0.2, 0.02, n=6, x=x),
                  turned(f"flame {k + 1}", FLAME, y + 0.2, [(0.012, 0), (0.016, 0.03), (0.001, 0.07)], n=5, x=x)]
    return parts


def wall_torch():
    """Mounted on a wall: the wall is at z = 0, the torch leans out toward +z."""
    return [block("wall plate", DARKIRON, (0, 1.7, 0.01), (0.07, 0.11, 0.01)),
            bar_between("bracket", DARKIRON, (0, 1.65, 0.02), (0, 1.75, 0.16), 0.012, n=5),
            ring("bracket ring", DARKIRON, (0, 1.75, 0.18), Y, 0.04, 0.008, n=8, m=4),
            bar_between("torch handle", WOOD, (0, 1.6, 0.14), (0, 1.95, 0.2), 0.022, n=6),
            turned("torch head", DARKLEATHER, 1.92, [(0.03, 0), (0.042, 0.04), (0.04, 0.1)], n=6, z=0.2),
            turned("torch flame", FLAME, 2.02, [(0.04, 0), (0.05, 0.06), (0.001, 0.22)], n=6, z=0.2)]


def well():
    parts = [turned("well wall", STONE, 0.0, [(0.95, 0), (0.95, 0.75), (0.8, 0.75), (0.8, 0.1)], n=16),
             part("water", BLUE, extrude("water", circle(0.8, 16), (0, 0.25, 0), X, Z, 0.02))]
    for k, x in enumerate((-0.85, 0.85)):
        parts.append(block(f"post {k + 1}", WOOD, (x, 1.35, 0), (0.06, 0.62, 0.06)))
    parts.append(bar_between("windlass", WOOD, (-0.9, 1.75, 0), (0.9, 1.75, 0), 0.045, n=8))
    parts.append(bar_between("crank", DARKIRON, (0.92, 1.75, 0), (1.05, 1.6, 0), 0.015, n=5))
    for k, s in enumerate((-1, 1)):  # a little pitched roof
        roof = block(f"roof {k + 1}", WOOD, (0, 0, 0), (0.6, 0.02, 1.05))
        m = np.eye(4)
        a = math.radians(32 * s)
        m[:3, :3] = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])
        m[:3, 3] = (s * -0.48, 2.25, 0)
        roof.islands = [i.transformed(m) for i in roof.islands]
        parts.append(roof)
    parts.append(turned("bucket", WOOD, 1.0, [(0.12, 0), (0.15, 0.22)], n=8))
    parts.append(bar_between("rope", WRAP, (0, 1.22, 0), (0, 1.72, 0), 0.008, n=4))
    return parts


# ---------------------------------------------------------------- graveyard and town


def gravestone_round():
    pts = [(-0.3, 0.0), (0.3, 0.0), (0.3, 0.7)] + [(0.3 * math.cos(a), 0.7 + 0.3 * math.sin(a)) for a in np.linspace(0, math.pi, 9)[1:-1]] + [(-0.3, 0.7)]
    return [part("headstone", STONE, extrude("headstone", pts, (0, 0, 0), X, Y, 0.12)),
            block("grave mound", DARKSTONE, (0, 0.05, 0.8), (0.4, 0.05, 0.75))]


def gravestone_cross():
    return [block("cross upright", MOSSSTONE, (0, 0.65, 0), (0.07, 0.65, 0.07)),
            block("cross arm", MOSSSTONE, (0, 0.95, 0), (0.3, 0.07, 0.07)),
            block("cross base", MOSSSTONE, (0, 0.1, 0), (0.2, 0.1, 0.15))]


def gravestone_obelisk():
    return [block("obelisk base", MARBLE, (0, 0.2, 0), (0.35, 0.2, 0.35)),
            part("obelisk", MARBLE, loft("obelisk", [(0, 0.4, 0), (0, 2.1, 0), (0, 2.35, 0)],
                                         [rounded_rect(0.4, 0.4, 1), rounded_rect(0.26, 0.26, 1), rounded_rect(0.02, 0.02, 1)],
                                         up=Z, caps=(True, False)), v_label="toward top")]


def sarcophagus():
    return [block("sarcophagus body", STONE, (0, 0.4, 0), (0.45, 0.4, 1.05)),
            block("sarcophagus lid", MARBLE, (0, 0.86, 0), (0.5, 0.06, 1.1)),
            block("effigy body", MARBLE, (0, 1.0, 0.05), (0.2, 0.08, 0.7)),
            ball("effigy head", MARBLE, (0, 1.02, -0.78), 0.12, n=8, rings=4)]


def anvil():
    horn = turned("horn", DARKIRON, 0.0, [(0.09, 0), (0.06, 0.18), (0.005, 0.3)], n=8, axis=X)
    horn.islands = [i.transformed(_translate((0.28, 0.62, 0))) for i in horn.islands]
    return [block("anvil face", DARKIRON, (0, 0.6, 0), (0.28, 0.08, 0.12)),
            block("anvil waist", DARKIRON, (0, 0.42, 0), (0.12, 0.12, 0.08)),
            block("anvil foot", DARKIRON, (0, 0.27, 0), (0.24, 0.05, 0.15)),
            block("stump", WOOD, (0, 0.12, 0), (0.3, 0.12, 0.3)), horn]


def spec(i, name, desc, fn, tex=128):
    return dict(id=i, name=name, desc=desc, build=lambda fn=fn, i=i, tex=tex: Model(i, fn(), tex=tex))


PROPS = [
    spec("treasure_chest", "Treasure Chest", "A wooden chest with a rounded lid, three iron bands, brass corners and a gold lock plate.", treasure_chest),
    spec("crate", "Wooden Crate", "A pale plank crate with darker braces and corner posts.", crate),
    spec("barrel", "Barrel", "An oak barrel of bent staves bound with four iron hoops.", barrel),
    spec("pillar_round", "Round Column", "A plain round stone column on a square plinth with a moulded base, capital and abacus. 4 m tall.", pillar_round),
    spec("pillar_square", "Square Pier", "A heavy square pier of dark stone with an impost block. 4 m tall.", pillar_square),
    spec("pillar_gothic", "Gothic Clustered Pillar", "A marble core ringed by four slender shafts on an octagonal base and capital. 4 m tall.", pillar_gothic),
    spec("pillar_twisted", "Twisted Column", "A solomonic marble column twisting up to a gilded capital. 4 m tall.", pillar_twisted),
    spec("pillar_fluted", "Fluted Column", "A classical fluted stone column with a torus base and echinus capital. 4 m tall.", pillar_fluted),
    spec("pillar_broken", "Broken Column", "A mossy column snapped off at a jagged break, its fallen drum lying beside it.", pillar_broken),
    spec("table", "Table", "A heavy plank table on four legs with a stretcher.", table),
    spec("stool", "Stool", "A round three-legged stool.", stool),
    spec("pew", "Church Pew", "A dark wooden pew with a backrest, kneeler and carved ends. 3 m long.", pew),
    spec("bookshelf", "Bookshelf", "A tall dark bookcase with four shelves of coloured books.", bookshelf),
    spec("bed", "Bed", "A wooden bed with a linen mattress, red blanket and pillow.", bed),
    spec("altar", "Altar", "A marble altar with a red cloth, gold candlesticks and a gold cross.", altar),
    spec("pulpit", "Pulpit", "A hexagonal wooden pulpit with steps, a lectern and a red book.", pulpit),
    spec("candelabrum", "Candelabrum", "A tall iron candle stand holding three candles.", candelabrum),
    spec("wall_torch", "Wall Torch", "An iron wall bracket holding a burning torch.", wall_torch),
    spec("well", "Well", "A round stone well with a windlass, rope, bucket and a little wooden roof.", well),
    spec("gravestone_round", "Round Headstone", "A round-topped stone headstone over a low grave mound.", gravestone_round),
    spec("gravestone_cross", "Cross Grave Marker", "A mossy stone cross on a block base.", gravestone_cross),
    spec("gravestone_obelisk", "Obelisk Monument", "A marble obelisk on a square base.", gravestone_obelisk),
    spec("sarcophagus", "Sarcophagus", "A stone sarcophagus with a marble lid and a carved effigy.", sarcophagus),
    spec("anvil", "Anvil", "A blacksmith's iron anvil on a wooden stump.", anvil),
]
