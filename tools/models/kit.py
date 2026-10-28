"""Shape builders for Bellmourn's held items and gauntlet pieces.

Held items are modelled in the item socket's frame (see arm.pose): the origin is the grip
point at the centre of the fist, +y runs along the handle toward the tip/head, the edges of a
blade face +/-z (toward the knuckles and back) and its flats face +/-x, which is the side the
first-person camera sees. Shields: +z is the way the face points (away from the player), the
board's inner side faces -z, toward the player.
"""
import math

import numpy as np

from geom import Island, Part, circle, extrude, loft, norm, rounded_rect

X, Y, Z = np.eye(3)

# material colours (also the part colours on the texture sheets)
IRON, STEEL, DARKIRON = (92, 98, 110), (158, 166, 178), (58, 60, 70)
BRASS, GOLD, BRONZE, SILVER = (176, 140, 60), (214, 172, 58), (168, 108, 50), (196, 200, 212)
LEATHER, DARKLEATHER, WRAP = (112, 72, 46), (72, 46, 32), (150, 120, 84)
WOOD, DARKWOOD, PALEWOOD = (132, 88, 50), (82, 52, 32), (176, 140, 96)
BONE, HORN, FUR = (216, 206, 172), (168, 148, 108), (120, 98, 76)
RED, BLUE, PURPLE, GREEN = (128, 30, 36), (52, 62, 124), (108, 48, 148), (52, 112, 52)
GEM_RED, GEM_BLUE, GEM_GREEN = (200, 32, 44), (60, 112, 226), (60, 176, 84)
CRYSTAL, OBSIDIAN, EMBER = (150, 206, 255), (42, 32, 54), (232, 112, 30)
SKIN, CHAIN = (206, 154, 122), (124, 128, 136)


def part(name, color, islands, bone="item", **kw):
    return Part(name, bone, color, islands, **kw)


def _lerp_profile(prof, s):
    """Piecewise-linear [(s, value)] lookup."""
    for (s0, v0), (s1, v1) in zip(prof, prof[1:]):
        if s0 <= s <= s1:
            return v0 + (v1 - v0) * ((s - s0) / (s1 - s0) if s1 > s0 else 0)
    return prof[-1][1] if s > prof[-1][0] else prof[0][1]


def section(kind, w, t, n=8):
    """Blade/shaft cross-sections as (a, b) points: a = thickness (across x), b = width
    (along z, the edges). All sections of one kind have the same point count."""
    t = max(t, 1e-4)
    w = max(w, 1e-4)
    if kind == "diamond":
        return [(0, w), (t, 0), (0, -w), (-t, 0)]
    if kind == "hex":  # flat-faced blade with bevelled edges (reads as a fuller when painted)
        return [(0, w), (t, w * 0.45), (t, -w * 0.45), (0, -w), (-t, -w * 0.45), (-t, w * 0.45)]
    if kind == "single":  # one sharp edge at +z, a flat spine at -z
        return [(0, w), (t, w * 0.15), (t, -w), (-t, -w), (-t, w * 0.15)]
    if kind == "round":
        return circle(w, n, t)
    if kind == "square":
        return [(t, w), (t, -w), (-t, -w), (-t, w)]
    raise ValueError(kind)


def blade(name, color, y0, y1, widths, thick, kind="hex", curve=0.0, n=8, wave=0.0,
          waves=0, label=None, cap_start=True, **kw):
    """A blade (or any tapered shaft) from y0 to y1. `widths`/`thick` are [(s, half-width)]
    profiles over s = 0..1 (or a constant). `curve` bends it toward +z (a sabre's edge side);
    `wave` x `waves` makes a flamberge."""
    thick = thick if isinstance(thick, (list, tuple)) else [(0, thick), (1, thick)]
    path, secs = [], []
    for i in range(n + 1):
        s = i / n
        z = curve * s * s + (wave * math.sin(s * waves * math.pi) if waves else 0.0)
        path.append((0.0, y0 + (y1 - y0) * s, z))
        secs.append(section(kind, _lerp_profile(widths, s), _lerp_profile(thick, s)))
    return part(name, color, loft(name, path, secs, up=Z, caps=(cap_start, True), sharp=True),
                label=label, v_label=kw.pop("v_label", "toward tip"), **kw)


def shaft(name, color, y0, y1, r0, r1=None, n=8, x=0.0, z=0.0, label=None, caps=(True, True),
          **kw):
    """A round shaft/grip/pole along y."""
    r1 = r0 if r1 is None else r1
    return part(name, color, loft(name, [(x, y0, z), (x, y1, z)],
                                  [circle(r0, n), circle(r1, n)], up=Z, caps=caps),
                label=label, v_label=kw.pop("v_label", "toward tip"), **kw)


def turned(name, color, y0, profile, n=8, x=0.0, z=0.0, label=None, axis=Y, **kw):
    """A lathe-turned piece along an axis from `y0` (pommels, knobs, maces, gems):
    profile = [(radius, distance along the axis)]."""
    axis = norm(axis)
    base = np.array([x, 0.0, z]) + axis * y0 if np.allclose(axis, Y) else np.array([x, y0, z])
    up = Z if abs(np.dot(axis, Z)) < 0.9 else Y
    path = [base + axis * h for r, h in profile]
    secs = [circle(max(r, 1e-4), n) for r, h in profile]
    return part(name, color, loft(name, path, secs, up=up, caps=(True, True)), label=label,
                v_label=kw.pop("v_label", None), **kw)


def ball(name, color, c, r, n=8, rings=5, squash=1.0, axis=Y, **kw):
    """A low-poly sphere (squash < 1 flattens it along `axis`)."""
    axis = norm(axis)
    up = Z if abs(np.dot(axis, Z)) < 0.9 else Y
    c = np.asarray(c, float)
    path = [c + axis * (-r * squash * math.cos(math.pi * k / rings)) for k in range(rings + 1)]
    secs = [circle(max(r * math.sin(math.pi * k / rings), 1e-4), n) for k in range(rings + 1)]
    return part(name, color, loft(name, path, secs, up=up), **kw)


def spike(name, color, base, direction, length, r, n=5, **kw):
    d = norm(direction)
    base = np.asarray(base, float)
    up = Y if abs(np.dot(d, Y)) < 0.9 else Z
    return part(name, color, loft(name, [base, base + d * length],
                                  [circle(r, n), circle(r * 0.06, n)], up=up,
                                  caps=(True, False)), **kw)


def gem(name, color, c, axis, r, h, n=6, **kw):
    axis = norm(axis)
    c = np.asarray(c, float)
    up = Z if abs(np.dot(axis, Z)) < 0.9 else Y
    path = [c - axis * h * 0.4, c, c + axis * h * 0.6]
    secs = [circle(r * 0.05, n), circle(r, n), circle(r * 0.05, n)]
    return part(name, color, loft(name, path, secs, up=up, sharp=True), **kw)


def ring(name, color, c, axis, R, r, n=12, m=5, **kw):
    """A torus (band, ring, rim) around `axis`."""
    axis = norm(axis)
    c = np.asarray(c, float)
    e1 = norm(np.cross(axis, X if abs(np.dot(axis, X)) < 0.9 else Y))
    e2 = np.cross(axis, e1)
    path = [c + (e1 * math.cos(2 * math.pi * k / n) + e2 * math.sin(2 * math.pi * k / n)) * R
            for k in range(n + 1)]
    secs = [circle(r, m)] * (n + 1)
    return part(name, color, loft(name, path, secs, up=axis), **kw)


def plate(name, color, outline, thick, x=0.0, back_scale=1.0, **kw):
    """A flat piece in the y/z plane (axe heads, cleavers, guards, flanges) `thick` across x.
    `outline` is [(z, y)]."""
    return part(name, color, extrude(name, outline, (x, 0, 0), Z, Y, thick,
                                     back_scale=back_scale), **kw)


def bar_between(name, color, p0, p1, r, n=6, caps=True, **kw):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    d = norm(p1 - p0)
    up = Y if abs(np.dot(d, Y)) < 0.9 else Z
    return part(name, color, loft(name, [p0, p1], [circle(r, n), circle(r, n)], up=up,
                                  caps=(caps, caps)), **kw)


def guard_bar(name, color, y, half, thick, depth=None, droop=0.0, n=4, ends=0.0, **kw):
    """A crossguard along z (the edge direction) at height y: `half` long each side,
    `droop` bends the quillons toward the blade (+y) or down (-y), `ends` swells the tips."""
    depth = depth or thick
    path, secs = [], []
    for k in range(-n, n + 1):
        s = k / n
        path.append((0.0, y + droop * s * s, half * s))
        sw = 1 + ends * (abs(s) ** 4)
        secs.append([(depth * sw, thick * sw), (-depth * sw, thick * sw),
                     (-depth * sw, -thick * sw), (depth * sw, -thick * sw)])
    return part(name, color, loft(name, path, secs, up=X, caps=(True, True), sharp=True),
                v_label=kw.pop("v_label", None), **kw)


def panel(name, color, rows, thick, bend=0.0, z0=0.0, cols=6, **kw):
    """A curved board (shields): `rows` = [(y, x_left, x_right)] from top to bottom; the face
    bows forward by `bend` * x^2. Front faces +z, the inner side -z (toward the player)."""
    def zf(x):
        return z0 + bend * x * x
    grid_f, grid_b, uv = [], [], []
    for y, xl, xr in rows:
        for c in range(cols + 1):
            x = xl + (xr - xl) * c / cols
            grid_f.append((x, y, zf(x) + thick / 2))
            grid_b.append((x, y, zf(x) - thick / 2))
            uv.append((x, -y))
    nr = len(rows)
    tris = []
    for r in range(nr - 1):
        for c in range(cols):
            a, b = r * (cols + 1) + c, r * (cols + 1) + c + 1
            d, e = a + cols + 1, b + cols + 1
            tris += [(a, d, b), (b, d, e)]
    front = Island(f"{name} front", grid_f, uv, tris)
    back = Island(f"{name} back", grid_b, [(-u, v) for u, v in uv], [(a, c, b) for a, b, c in tris])
    # rim: walk the outline (left side down, right side up)
    loop = [r * (cols + 1) for r in range(nr)] + [r * (cols + 1) + cols for r in range(nr)][::-1]
    verts, uvs, rt = [], [], []
    dist = 0.0
    for i in range(len(loop)):
        i0, i1 = loop[i], loop[(i + 1) % len(loop)]
        seg = np.linalg.norm(np.subtract(grid_f[i1], grid_f[i0]))
        if seg < 1e-6:
            continue
        base = len(verts)
        verts += [grid_b[i0], grid_b[i1], grid_f[i1], grid_f[i0]]
        uvs += [(dist, 0), (dist + seg, 0), (dist + seg, thick), (dist, thick)]
        rt += [(base, base + 2, base + 1), (base, base + 3, base + 2)]
        dist += seg
    rim = Island(f"{name} rim", verts, uvs, rt)
    return part(name, color, [front, back, rim], **kw)


def moved(p, offset):
    """A copy of a part shifted by `offset`."""
    m = np.eye(4)
    m[:3, 3] = offset
    p.islands = [i.transformed(m) for i in p.islands]
    return p


def rotated(p, axis, degrees, about=(0, 0, 0)):
    """Rotate a part about an axis through a point (in place); returns it."""
    a = norm(axis)
    t = math.radians(degrees)
    k = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    rot = np.eye(3) + math.sin(t) * k + (1 - math.cos(t)) * k @ k
    m = np.eye(4)
    m[:3, :3] = rot
    about = np.asarray(about, float)
    m[:3, 3] = about - rot @ about
    p.islands = [i.transformed(m) for i in p.islands]
    return p

