"""Low-poly mesh building for Bellmourn's first-person assets.

A Model is a list of Parts; each Part is bound rigidly to one bone (PS1-style segmented
models: no blended weights, so pieces never stretch) and is made of UV Islands. Every island
carries its own flat UV layout in metres, so islands can be packed into a small retro texture
atlas at one even texel density.

Coordinates are the rig's camera space: x right, y up, z forward (metres). For the hand,
"bind space" is the hand bone's frame: wrist at the origin, +z toward the fingers (A),
+y along the handle (D), +x the back of the hand (K).
"""
import math

import numpy as np


def norm(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


class Island:
    """One connected piece of surface with its own UV layout (in metres)."""

    def __init__(self, name, verts, uvs, tris, normals=None):
        self.name = name
        self.v = np.asarray(verts, float).reshape(-1, 3)
        self.uv = np.asarray(uvs, float).reshape(-1, 2)
        self.uv = self.uv - self.uv.min(axis=0)
        self.t = np.asarray(tris, int).reshape(-1, 3)
        self.n = normals if normals is not None else vertex_normals(self.v, self.t)
        self.size = self.uv.max(axis=0)
        self.px = None  # packed pixel uvs, filled in by Model.pack

    def transformed(self, m):
        """A copy moved by a 4x4 matrix."""
        v = self.v @ m[:3, :3].T + m[:3, 3]
        n = np.array([norm(x) for x in self.n @ m[:3, :3].T])
        isl = Island(self.name, v, self.uv, self.t, n)
        return isl


class Part:
    """`weight` scales the part's share of the texture: 2 = twice the texels per metre (for
    the hand, always in view), 0.3 for the upper arm that is almost never on screen."""

    def __init__(self, name, bone, color, islands, label=None, weight=1.0, v_label=None,
                 blend=None):
        self.name, self.bone, self.color = name, bone, color
        self.islands = islands
        self.label = label or name
        self.weight = weight
        self.v_label = v_label  # what the islands' +v direction means, drawn as an arrow
        # (bone, z0, z1): skin smoothly from `bone` (at bind z <= z0) to that second bone
        # (z >= z1), so the piece bends like skin across a joint instead of hinging rigidly
        self.blend = blend

    def skin(self, isl):
        """(first bone, second bone, weight of the second bone per vertex)."""
        if not self.blend:
            return self.bone, self.bone, np.zeros(len(isl.v))
        other, z0, z1 = self.blend
        t = np.clip((isl.v[:, 2] - z0) / (z1 - z0), 0.0, 1.0)
        return self.bone, other, t * t * (3 - 2 * t)


class Model:
    def __init__(self, name, parts, tex=128):
        self.name, self.parts, self.tex = name, parts, tex

    def islands(self):
        return [(p, i) for p in self.parts for i in p.islands]

    def tri_count(self):
        return sum(len(i.t) for _, i in self.islands())

    def pack(self, pad=2):
        """Pack every island into a tex x tex atlas at the largest even texel density that
        fits. Tall islands are turned sideways to pack tighter."""
        isl = [i for _, i in self.islands()]
        wts = [p.weight for p, _ in self.islands()]
        lo, hi = 1.0, 20000.0
        best = None
        for _ in range(40):
            mid = (lo + hi) / 2
            placed = _shelf(isl, mid, self.tex, pad, wts)
            if placed:
                best, lo = (mid, placed), mid
            else:
                hi = mid
        dens, placed = best
        for island, wt, (x, y, rot) in zip(isl, wts, placed):
            uv = island.uv * dens * wt
            if rot:
                uv = np.stack([uv[:, 1], island.size[0] * dens * wt - uv[:, 0]], axis=1)
            island.px = uv + np.array([x + pad / 2, y + pad / 2])
            island.rot = rot
        self.density = dens
        return dens


def _shelf(islands, dens, size, pad, weights):
    """Shelf-pack island rectangles; return [(x, y, rotated)] or None if they don't fit."""
    rects = []
    for i, isl in enumerate(islands):
        w, h = isl.size * dens * weights[i] + pad
        rot = h > w * 1.25
        if rot:
            w, h = h, w
        if w > size or h > size:
            return None
        rects.append((h, w, i, rot))
    order = sorted(rects, key=lambda r: -r[0])
    out = [None] * len(islands)
    x = y = shelf_h = 0.0
    for h, w, i, rot in order:
        if x + w > size:
            x, y, shelf_h = 0.0, y + shelf_h, 0.0
        if y + h > size:
            return None
        out[i] = (math.floor(x), math.floor(y), rot)
        x += math.ceil(w)
        shelf_h = max(shelf_h, math.ceil(h))
    return out


def vertex_normals(v, t):
    n = np.zeros_like(v)
    for a, b, c in t:
        f = np.cross(v[b] - v[a], v[c] - v[a])
        n[a] += f
        n[b] += f
        n[c] += f
    return np.array([norm(x) if np.linalg.norm(x) > 1e-12 else np.array([0, 1.0, 0]) for x in n])


# ----------------------------------------------------------------- 2D helpers


def circle(r, n, rx=None, start=0.0):
    rx = r if rx is None else rx
    return [(rx * math.cos(start + 2 * math.pi * k / n), r * math.sin(start + 2 * math.pi * k / n))
            for k in range(n)]


def rounded_rect(w, h, n_corner=2):
    """Closed outline of a w x h rectangle with rounded corners (radius = min/2 * 0.6)."""
    r = min(w, h) * 0.3
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90),
                       (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for k in range(n_corner + 1):
            a = math.radians(a0 + 90 * k / n_corner)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def _area(poly):
    return 0.5 * sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]))


def triangulate(poly):
    """Ear-clip a simple polygon (any winding). Returns index triples, counter-clockwise."""
    idx = list(range(len(poly)))
    if _area(poly) < 0:
        idx.reverse()
    out = []

    def inside(p, a, b, c):
        def s(p1, p2, p3):
            return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
        d1, d2, d3 = s(p, a, b), s(p, b, c), s(p, c, a)
        return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))

    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = poly[i0], poly[i1], poly[i2]
            if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-12:
                continue  # reflex
            if any(inside(poly[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            out.append((i0, i1, i2))
            idx.pop(k)
            break
        else:
            break
    if len(idx) == 3:
        out.append(tuple(idx))
    return out


# ----------------------------------------------------------------- primitives


def _frames(path, up):
    """Ring frames along a path: (tangent, side, up) by parallel transport from `up`."""
    path = [np.asarray(p, float) for p in path]
    n = len(path)
    tans = [norm(path[min(i + 1, n - 1)] - path[max(i - 1, 0)]) for i in range(n)]
    out = []
    u = norm(np.asarray(up, float))
    for t in tans:
        u = norm(u - t * np.dot(u, t))
        if np.linalg.norm(u) < 1e-6:
            u = norm(np.cross(t, [1, 0, 0]))
        out.append((t, norm(np.cross(u, t)), u))
    return path, out


def loft(name, path, sections, up=(0, 1, 0), caps=(False, False), sharp=False):
    """Sweep closed 2D sections (lists of (side, up) points, one per path point, all with the
    same point count) along a 3D path. Returns the side island plus any cap islands.
    UVs: u runs around the section, v along the path."""
    path, frames = _frames(path, up)
    m = len(sections[0])
    rings = []
    for p, (t, s, u), sec in zip(path, frames, sections):
        rings.append([p + s * a + u * b for a, b in sec])
    perims = []
    for sec in sections:
        d = [0.0]
        for k in range(m):
            d.append(d[-1] + math.dist(sec[k], sec[(k + 1) % m]))
        perims.append(d)
    width = max(d[-1] for d in perims)
    vs = [0.0]
    for i in range(1, len(path)):
        vs.append(vs[-1] + np.linalg.norm(path[i] - path[i - 1]))
    verts, uvs, tris = [], [], []
    if sharp:
        for i in range(len(path) - 1):
            for k in range(m):
                k1 = (k + 1) % m
                base = len(verts)
                verts += [rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]]
                u0 = perims[i][k] / perims[i][-1] * width
                u1 = perims[i][k + 1] / perims[i][-1] * width
                uvs += [(u0, vs[i]), (u1, vs[i]), (u1, vs[i + 1]), (u0, vs[i + 1])]
                tris += [(base, base + 1, base + 2), (base, base + 2, base + 3)]
    else:
        for i, ring in enumerate(rings):
            for k in range(m + 1):
                verts.append(ring[k % m])
                uvs.append((perims[i][k] / perims[i][-1] * width, vs[i]))
        for i in range(len(path) - 1):
            for k in range(m):
                a, b = i * (m + 1) + k, i * (m + 1) + k + 1
                c, d = a + m + 1, b + m + 1
                tris += [(a, b, d), (a, d, c)]
    out = [Island(name, verts, uvs, tris)]
    for end, want in ((0, caps[0]), (-1, caps[1])):
        if not want:
            continue
        sec = sections[end]
        tr = triangulate(list(sec))
        if end == 0:
            tr = [(a, c, b) for a, b, c in tr]
        out.append(Island(f"{name} {'start' if end == 0 else 'end'}", rings[end],
                          [(a, b) for a, b in sec], tr))
    return out


def lathe(name, base, axis, profile, n=8, up=None, caps=(True, True), sharp=False):
    """Turn a profile [(radius, height)] around an axis starting at `base`."""
    axis = norm(axis)
    up = up if up is not None else (norm(np.cross(axis, [1, 0, 0])) if abs(axis[0]) < 0.9
                                    else norm(np.cross(axis, [0, 1, 0])))
    path = [np.asarray(base, float) + axis * h for r, h in profile]
    secs = [circle(max(r, 1e-4), n) for r, h in profile]
    return loft(name, path, secs, up=up, caps=caps, sharp=sharp)


def extrude(name, poly, origin, ax_u, ax_v, depth, back_scale=1.0, rim=True, sharp_rim=True):
    """A flat slab: the 2D outline `poly` (in the u/v plane at origin) pushed `depth` along
    u x v. Front, back and rim become separate islands."""
    o, u, v = np.asarray(origin, float), norm(ax_u), norm(ax_v)
    nrm = norm(np.cross(u, v))
    poly = list(poly)
    front = [o + u * a + v * b + nrm * depth / 2 for a, b in poly]
    cx = sum(a for a, b in poly) / len(poly)
    cy = sum(b for a, b in poly) / len(poly)
    back_poly = [(cx + (a - cx) * back_scale, cy + (b - cy) * back_scale) for a, b in poly]
    back = [o + u * a + v * b - nrm * depth / 2 for a, b in back_poly]
    tr = triangulate(poly)
    out = [Island(f"{name} front", front, poly, tr, np.tile(nrm, (len(poly), 1))),
           Island(f"{name} back", back, [(-a, b) for a, b in back_poly],
                  [(a, c, b) for a, b, c in tr], np.tile(-nrm, (len(poly), 1)))]
    if rim:
        if _area(poly) < 0:
            poly, front, back = poly[::-1], front[::-1], back[::-1]
        verts, uvs, tris = [], [], []
        d = 0.0
        m = len(poly)
        for k in range(m):
            k1 = (k + 1) % m
            seg = math.dist(poly[k], poly[k1])
            base = len(verts)
            verts += [back[k], back[k1], front[k1], front[k]]
            uvs += [(d, 0), (d + seg, 0), (d + seg, depth), (d, depth)]
            tris += [(base, base + 1, base + 2), (base, base + 2, base + 3)]
            d += seg
        out.append(Island(f"{name} rim", verts, uvs, tris))
    return out


def box(name, center, axes, half):
    """An oriented box: the x/y face is the outline, extruded along z."""
    ax, ay, az = (norm(a) for a in axes)
    hx, hy, hz = half
    poly = [(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)]
    return extrude(name, poly, center, ax, ay, 2 * hz)
