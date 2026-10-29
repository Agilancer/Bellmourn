"""Remodelling third-party weapons into Bellmourn items: meshes from 3D packs (OBJ) and
silhouettes from 2D sprite packs, brought into the item socket's frame (kit.py: grip at the
origin, +y toward the tip, edges +/-z, flats +/-x) and cut into Parts with flat UV islands
in metres, so they pack, dress (dress.py) and export exactly like the hand-built items.

Meshes: `load()` reads an OBJ (a per-material colour from the .mtl, or for an atlas-
textured pack the atlas cell each face samples). `Mesh` ops reshape it (turn, scale,
piecewise remap along the handle, bend), and `Mesh.part()` makes a Part from a face
selection, unwrapped by box projection: each face goes to the axis its normal points along
most, and connected faces on one axis become one island.

Sprites: `Sprite` reads a pixel weapon lying handle-left, tip-right; `outline()` traces a
pixel mask into polygons (outer outline and holes) in metres and `slab()` turns them into a
bevelled plate: sharp (or blunt) edge all round, flat faces inset by the bevel, real holes.
"""
import math
import os

import numpy as np
from PIL import Image

from geom import Island, Part, norm

X, Y, Z = np.eye(3)


# ----------------------------------------------------------------- reading meshes


def _mtl_colours(path):
    out, cur = {}, None
    if os.path.exists(path):
        for line in open(path, errors="ignore"):
            p = line.split()
            if p and p[0] == "newmtl":
                cur = p[1]
            elif p and p[0] == "Kd" and cur:
                lin = np.array([float(x) for x in p[1:4]])
                srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)
                out[cur] = tuple(int(round(c * 255)) for c in srgb)
    return out


def load(path, atlas_cells=None):
    """An OBJ as a Mesh. Faces are labelled by material name, or for an atlas pack
    (`atlas_cells` = (columns, rows) of the palette atlas) by the atlas cell "c<col>r<row>"
    their UVs sit in."""
    V, VT, tris, tuv, tmat = [], [], [], [], []
    cur = None
    for line in open(path, errors="ignore"):
        p = line.split()
        if not p:
            continue
        if p[0] == "v":
            V.append([float(x) for x in p[1:4]])
        elif p[0] == "vt":
            VT.append([float(x) for x in p[1:3]])
        elif p[0] == "usemtl":
            cur = p[1]
        elif p[0] == "f":
            idx = []
            for q in p[1:]:
                s = q.split("/")
                vi = int(s[0])
                ti = int(s[1]) if len(s) > 1 and s[1] else 0
                idx.append((vi - 1 if vi > 0 else len(V) + vi,
                            (ti - 1 if ti > 0 else len(VT) + ti) if ti else -1))
            for k in range(1, len(idx) - 1):
                f = (idx[0], idx[k], idx[k + 1])
                tris.append([a for a, _ in f])
                tuv.append([b for _, b in f])
                tmat.append(cur)
    V, tris = np.array(V, float), np.array(tris, int)
    if atlas_cells:
        VT = np.array(VT, float)
        c = VT[np.array(tuv)].mean(1)
        cols, rows = atlas_cells
        cu = np.clip((c[:, 0] % 1.0) * cols, 0, cols - 1).astype(int)
        cv = np.clip((1 - c[:, 1] % 1.0) * rows, 0, rows - 1).astype(int)
        tmat = [f"c{a}r{b}" for a, b in zip(cu, cv)]
    return Mesh(V, tris, tmat, _mtl_colours(os.path.splitext(path)[0] + ".mtl"))


def _weld(v):
    """Index of the first vertex at each vertex's position."""
    key = {}
    return np.array([key.setdefault(tuple(np.round(p, 5)), i) for i, p in enumerate(v)])


def _union(n, pairs):
    par = np.arange(n)

    def f(a):
        while par[a] != a:
            par[a] = par[par[a]]
            a = par[a]
        return a
    for a, b in pairs:
        ra, rb = f(a), f(b)
        if ra != rb:
            par[ra] = rb
    return np.array([f(i) for i in range(n)])


class Mesh:
    """A triangle soup with a label per face (material or atlas cell) and the connected
    piece (`comp`) each face belongs to."""

    def __init__(self, v, t, mat, colours=None):
        self.v, self.t = np.asarray(v, float), np.asarray(t, int)
        self.mat = np.asarray(mat)
        self.colours = colours or {}
        w = _weld(self.v)
        lab = _union(len(self.v), [(w[a], w[b]) for tri in self.t for a, b in
                                   ((tri[0], tri[1]), (tri[1], tri[2]))])
        _, self.comp = np.unique(lab[w[self.t[:, 0]]], return_inverse=True)

    def copy(self):
        m = Mesh.__new__(Mesh)
        m.v, m.t, m.mat, m.colours, m.comp = (self.v.copy(), self.t.copy(), self.mat.copy(),
                                              self.colours, self.comp.copy())
        return m

    # ---- selections (boolean masks over faces)
    def centres(self):
        return self.v[self.t].mean(1)

    def where(self, mats=None, comps=None, y=None, z=None, x=None, test=None):
        """Faces by label, piece, centre range along y/z/x, or any test(centres)."""
        c = self.centres()
        m = np.ones(len(self.t), bool)
        if mats is not None:
            m &= np.isin(self.mat, list(mats))
        if comps is not None:
            m &= np.isin(self.comp, list(comps))
        for ax, rng in ((1, y), (2, z), (0, x)):
            if rng is not None:
                m &= (c[:, ax] >= rng[0]) & (c[:, ax] <= rng[1])
        if test is not None:
            m &= test(c)
        return m

    def verts_of(self, faces):
        s = np.zeros(len(self.v), bool)
        s[self.t[faces].ravel()] = True
        return s

    def comps_by_y(self):
        """Pieces sorted from the butt up: [(comp, y0, y1, faces)]."""
        out = []
        for k in np.unique(self.comp):
            f = self.comp == k
            vy = self.v[self.t[f].ravel(), 1]
            out.append((k, vy.min(), vy.max(), f.sum()))
        return sorted(out, key=lambda r: r[1])

    # ---- edits (in place; return self for chaining)
    def drop(self, faces):
        keep = ~faces
        self.t, self.mat, self.comp = self.t[keep], self.mat[keep], self.comp[keep]
        return self

    def turn(self, deg, axis=Y):
        """Rotate about an axis through the origin."""
        a, t = norm(axis), math.radians(deg)
        k = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
        self.v = self.v @ (np.eye(3) + math.sin(t) * k + (1 - math.cos(t)) * k @ k).T
        return self

    def move(self, d, verts=None):
        s = slice(None) if verts is None else verts
        self.v[s] = self.v[s] + np.asarray(d, float)
        return self

    def scale(self, s, about=(0, 0, 0), verts=None):
        s = np.broadcast_to(np.asarray(s, float), (3,))
        about = np.asarray(about, float)
        sel = slice(None) if verts is None else verts
        self.v[sel] = about + (self.v[sel] - about) * s
        return self

    def remap_y(self, pairs, verts=None):
        """Piecewise-linear stretch along the handle: [(source y, new y), ...] in order;
        beyond the ends the end segments carry on."""
        ys, yd = np.array(pairs, float).T
        sel = np.ones(len(self.v), bool) if verts is None else verts
        y = self.v[sel, 1]
        out = np.interp(y, ys, yd)
        lo, hi = y < ys[0], y > ys[-1]
        out[lo] = yd[0] + (y[lo] - ys[0]) * (yd[1] - yd[0]) / (ys[1] - ys[0])
        out[hi] = yd[-1] + (y[hi] - ys[-1]) * (yd[-1] - yd[-2]) / (ys[-1] - ys[-2])
        self.v[sel, 1] = out
        return self

    def warp(self, fn, verts=None):
        """Any per-vertex change: fn(points) -> new points."""
        sel = np.ones(len(self.v), bool) if verts is None else verts
        self.v[sel] = fn(self.v[sel].copy())
        return self

    def bounds(self, faces=None):
        p = self.v if faces is None else self.v[self.t[faces].ravel()]
        return p.min(0), p.max(0)

    # ---- to Parts
    def part(self, name, color, faces, label=None, crease=50.0, **kw):
        """A Part from a face selection, box-projected into islands (see module doc)."""
        return Part(name, "item", color, box_islands(name, self.v, self.t[faces], crease),
                    label=label, v_label=kw.pop("v_label", "toward tip"), **kw)


def box_islands(name, v, t, crease=50.0):
    """UV islands for a triangle set by box projection, with normals smoothed across edges
    sharper than `crease` degrees kept hard."""
    if len(t) == 0:
        return []
    fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    area = np.linalg.norm(fn, axis=1)
    keep = area > 1e-12
    t, fn, area = t[keep], fn[keep], area[keep]
    fn = fn / area[:, None]
    w = _weld(v)
    wt = w[t]
    # corner normals: faces round the same welded vertex within the crease angle
    by_vert = {}
    for f, tri in enumerate(wt):
        for a in tri:
            by_vert.setdefault(a, []).append(f)
    cos_c = math.cos(math.radians(crease))
    cn = np.zeros((len(t), 3, 3))
    for f, tri in enumerate(wt):
        for k, a in enumerate(tri):
            acc = np.zeros(3)
            for g in by_vert[a]:
                if np.dot(fn[g], fn[f]) >= cos_c:
                    acc += fn[g] * area[g]
            cn[f, k] = norm(acc)
    # the projection axis per face (x slightly favoured: the flats the camera sees)
    ax = np.argmax(np.abs(fn) * np.array([1.04, 1.0, 1.0]), axis=1)
    sg = np.sign(fn[np.arange(len(fn)), ax])
    group = ax * 2 + (sg > 0)
    pairs = []
    for a, fs in by_vert.items():
        for i in range(1, len(fs)):
            if group[fs[i]] == group[fs[0]]:
                pairs.append((fs[0], fs[i]))
            for j in range(i):
                if group[fs[i]] == group[fs[j]]:
                    pairs.append((fs[j], fs[i]))
    chart = _union(len(t), pairs)
    out = []
    for c in np.unique(chart):
        fs = np.where(chart == c)[0]
        a, s = ax[fs[0]], sg[fs[0]]
        # (u, v) axes: v along y where it can be (a part's length runs down its swatch)
        uax, vax = {0: (2, 1), 1: (0, 2), 2: (0, 1)}[a]
        verts, uvs, nrm, tri_out = [], [], [], []
        index = {}
        for f in fs:
            tri = []
            for k in range(3):
                key = (wt[f, k], tuple(np.round(cn[f, k], 3)))
                if key not in index:
                    index[key] = len(verts)
                    p = v[t[f, k]]
                    verts.append(p)
                    uvs.append((p[uax] * (s if a != 1 else 1), p[vax]))
                    nrm.append(cn[f, k])
                tri.append(index[key])
            tri_out.append(tri)
        out.append(Island(name, verts, uvs, tri_out, np.array(nrm)))
    return out


# ----------------------------------------------------------------- sprites


class Sprite:
    """A pixel weapon sprite lying handle-left, tip-right (Oubliette style). Pixel corner
    (col, row) maps to the socket frame as y = (col - col0) * py and
    z = (row0 - row) * pz * flip: `py`/`pz` are metres per pixel along and across (a sprite
    can be stretched or slimmed), `flip` = -1 puts the sprite's bottom edge at +z (the
    cutting edge)."""

    def __init__(self, path, py, pz, col0, row0, flip=1):
        self.rgba = np.asarray(Image.open(path).convert("RGBA"), float)
        self.alpha = self.rgba[..., 3] > 0
        self.py, self.pz, self.col0, self.row0, self.flip = py, pz, col0, row0, flip

    def at(self, col, row):
        """Socket (y, z) of a pixel corner (or centre, at +0.5)."""
        return ((col - self.col0) * self.py, (self.row0 - row) * self.pz * self.flip)

    def mask(self, cols=None, rows=None, test=None):
        """Opaque pixels, optionally limited to column/row ranges [a, b) and a colour test
        test(rgb array) -> bool array."""
        m = self.alpha.copy()
        if cols is not None:
            c = np.arange(m.shape[1])
            m &= ((c >= cols[0]) & (c < cols[1]))[None, :]
        if rows is not None:
            r = np.arange(m.shape[0])
            m &= ((r >= rows[0]) & (r < rows[1]))[:, None]
        if test is not None:
            m &= test(self.rgba[..., :3])
        return m

    def outline(self, m, tol=0.6, fill_holes=False, smooth=0):
        """Polygons [(z, y)] in metres (outer outline first, then holes), material on the
        left of each; `smooth` rounds the pixel steps off first (corner-cutting passes),
        `tol` = how far (pixels) the simplified outline may then stray."""
        loops = trace(_filled(m) if fill_holes else m)
        out = []
        for lp in loops:
            for _ in range(smooth):
                lp = chaikin(lp)
            lp = simplify(lp, tol)
            pts = [self.at(c, -r)[::-1] for c, r in lp]  # trace works in (col, -row)
            if self.flip > 0:  # swapping the axes mirrors the loop; a flip mirrors it back
                pts = pts[::-1]
            out.append(pts)
        out.sort(key=lambda p: -abs(_area(p)))
        return out

    def limiter(self, m, frac=0.8):
        return halfwidth_limiter(m, self, frac)


def _cross2(a, b):
    """z of the cross product of 2D vectors (or rows of them)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    return a[..., 0] * b[..., 1] - a[..., 1] * b[..., 0]


def _filled(m):
    from scipy import ndimage
    return ndimage.binary_fill_holes(m)


def trace(mask):
    """Closed outlines of a pixel mask along the pixel edges, as lists of (x, y) corners
    with x = column and y = -row (y up), the filled pixels on the left of each loop: outer
    outlines run counter-clockwise, holes clockwise."""
    H, W = mask.shape
    m = np.pad(mask, 1)
    nxt = {}
    for r in range(H):
        for c in range(W):
            if not m[r + 1, c + 1]:
                continue
            x0, x1, yt, yb = c, c + 1, -r, -r - 1
            if not m[r + 2, c + 1]:
                nxt.setdefault((x0, yb), []).append((x1, yb))   # bottom, left to right
            if not m[r + 1, c + 2]:
                nxt.setdefault((x1, yb), []).append((x1, yt))   # right, upward
            if not m[r, c + 1]:
                nxt.setdefault((x1, yt), []).append((x0, yt))   # top, right to left
            if not m[r + 1, c]:
                nxt.setdefault((x0, yt), []).append((x0, yb))   # left, downward
    loops = []
    while nxt:
        start = next(iter(nxt))
        loop, p, prev = [start], start, None
        while True:
            outs = nxt[p]
            if len(outs) > 1 and prev is not None:  # a pixel corner touching diagonally:
                d_in = np.subtract(p, prev)          # turn left, keeping pixels apart
                outs.sort(key=lambda q: -_cross2(d_in, np.subtract(q, p)))
            q = outs.pop(0)
            if not outs:
                del nxt[p]
            prev, p = p, q
            if p == start:
                break
            loop.append(p)
        # drop the corners along straight runs
        pts = [loop[i] for i in range(len(loop))
               if _cross2(np.subtract(loop[i], loop[i - 1]),
                          np.subtract(loop[(i + 1) % len(loop)], loop[i])) != 0]
        loops.append(pts)
    return loops


def chaikin(loop):
    """One corner-cutting pass over a closed loop: a pixel staircase becomes a slope."""
    P = np.asarray(loop, float)
    Q = np.roll(P, -1, axis=0)
    out = np.empty((2 * len(P), 2))
    out[0::2] = 0.75 * P + 0.25 * Q
    out[1::2] = 0.25 * P + 0.75 * Q
    return [tuple(p) for p in out]


def simplify(loop, tol):
    """Douglas-Peucker on a closed loop (keeps its two farthest-apart corners)."""
    if tol <= 0 or len(loop) < 5:
        return loop
    P = np.array(loop, float)
    i0 = 0
    i1 = int(np.argmax(np.linalg.norm(P - P[0], axis=1)))

    def dp(a, b):  # indices a..b along the loop (b may wrap)
        idx = [(a + k) % len(P) for k in range((b - a) % len(P) + 1)]
        if len(idx) < 3:
            return [idx[0]]
        p, q = P[idx[0]], P[idx[-1]]
        d = q - p
        L = np.linalg.norm(d)
        pts = P[idx[1:-1]]
        dist = (np.abs(_cross2(d, pts - p)) / L) if L > 1e-9 else np.linalg.norm(pts - p, axis=1)
        k = int(np.argmax(dist))
        if dist[k] <= tol:
            return [idx[0]]
        mid = idx[k + 1]
        return dp(idx[0], mid) + dp(mid, idx[-1])
    keep = dp(i0, i1) + dp(i1, i0)
    return [loop[i] for i in keep]


def _area(poly):
    return 0.5 * sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]))


def _seg_cross(a, b, c, d):
    """Proper intersection of segments ab and cd (touching ends don't count)."""
    def o(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    d1, d2, d3, d4 = o(c, d, a), o(c, d, b), o(a, b, c), o(a, b, d)
    return d1 * d2 < -1e-14 and d3 * d4 < -1e-14


def triangulate_holes(outer, holes):
    """Ear-clip a polygon with holes (outer counter-clockwise, holes clockwise): each hole
    is bridged to a visible outer vertex first. Returns (points, triangles)."""
    pts = [tuple(p) for p in outer]
    ring = list(range(len(pts)))
    for h in sorted(holes, key=lambda h: -max(p[0] for p in h)):
        base = len(pts)
        pts += [tuple(p) for p in h]
        hi = max(range(len(h)), key=lambda i: h[i][0])
        M = pts[base + hi]
        edges = [(pts[ring[i]], pts[ring[(i + 1) % len(ring)]]) for i in range(len(ring))]
        edges += [(g[i], g[(i + 1) % len(g)]) for g in holes for i in range(len(g))]
        best = None
        for k in sorted(range(len(ring)), key=lambda k: math.dist(pts[ring[k]], M)):
            P = pts[ring[k]]
            if not any(_seg_cross(M, P, a, b) for a, b in edges):
                best = k
                break
        k = best if best is not None else 0
        hole_ring = [base + (hi + j) % len(h) for j in range(len(h) + 1)]
        ring = ring[:k + 1] + hole_ring + [ring[k]] + ring[k + 1:]
    tris = []
    idx = ring[:]

    def inside(p, a, b, c):
        def s(p1, p2, p3):
            return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
        d1, d2, d3 = s(p, a, b), s(p, b, c), s(p, c, a)
        return not ((d1 < -1e-14 or d2 < -1e-14 or d3 < -1e-14)
                    and (d1 > 1e-14 or d2 > 1e-14 or d3 > 1e-14))
    guard = 0
    while len(idx) > 3 and guard < 20000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = pts[i0], pts[i1], pts[i2]
            if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-14:
                continue
            if any(inside(pts[j], a, b, c) for j in idx
                   if pts[j] not in (a, b, c)):
                continue
            tris.append((i0, i1, i2))
            idx.pop(k)
            break
        else:
            break
    if len(idx) == 3:
        tris.append(tuple(idx))
    return pts, tris


def inset(ring, d, limit=None):
    """Move each corner of a ring (material on the left) into the material by about `d`
    (mitred, at most 2d); `limit(point, direction)` caps it by the local half-width."""
    P = np.array(ring, float)
    n = len(P)
    out = []
    for i in range(n):
        a, b, c = P[i - 1], P[i], P[(i + 1) % n]
        e0, e1 = norm(b - a), norm(c - b)
        n0, n1 = np.array([-e0[1], e0[0]]), np.array([-e1[1], e1[0]])  # left normals
        bis = norm(n0 + n1) if np.linalg.norm(n0 + n1) > 1e-6 else n0
        m = min(2.0, 1.0 / max(np.dot(bis, n0), 0.2))
        dd = d * m
        if limit is not None:
            dd = min(dd, limit(b, bis))
        out.append(b + bis * dd)
    return out


def _untangle(ring, inner, shrink=0.5, tries=6):
    """Pull back inset corners whose edges cross each other."""
    inner = [np.array(p) for p in inner]
    for _ in range(tries):
        n = len(inner)
        bad = set()
        for i in range(n):
            a, b = inner[i], inner[(i + 1) % n]
            for j in range(i + 2, n):
                if (j + 1) % n == i:
                    continue
                if _seg_cross(a, b, inner[j], inner[(j + 1) % n]):
                    bad |= {i, (i + 1) % n, j, (j + 1) % n}
        if not bad:
            break
        for i in bad:
            inner[i] = np.array(ring[i]) + (inner[i] - np.array(ring[i])) * shrink
    return [tuple(p) for p in inner]


def halfwidth_limiter(mask, sprite, frac=0.8):
    """A limit() for inset(): `frac` of the distance into the sprite mask to its medial
    line, measured along the inset direction, in metres."""
    from scipy import ndimage
    up = 8
    big = np.kron(mask.astype(np.uint8), np.ones((up, up), np.uint8)).astype(bool)
    dt = ndimage.distance_transform_edt(np.pad(big, 1)) / up  # in pixels

    def to_px(p):  # socket (z, y) -> fine-grid (row, col)
        col = p[1] / sprite.py + sprite.col0
        row = sprite.row0 - p[0] / (sprite.pz * sprite.flip)
        return row * up + 1, col * up + 1

    step = min(sprite.py, sprite.pz) * 0.05

    def limit(p, d):
        best, prev = 0.0, -1.0
        for k in range(1, 80):
            s = k * step
            r, c = to_px(np.asarray(p) + np.asarray(d) * s)
            ri, ci = int(r), int(c)
            if not (0 <= ri < dt.shape[0] and 0 <= ci < dt.shape[1]):
                break
            v = dt[ri, ci]
            if v < prev - 1e-6:
                break
            prev, best = v, s
        return max(best * frac, step)
    return limit


def slab(name, color, rings, thick, bevel, x=0.0, blunt=0.0, limit=None, chunk=0.5,
         label=None, hole_bevel=None, seg=0.06, **kw):
    """A bevelled plate in the y/z plane from outline polygons [(z, y)] (outer first, holes
    after; material on the left): the outline is the edge (`blunt` = its thickness, 0 for a
    sharp edge), the flat faces sit `thick` apart, inset `bevel` from the outline. Islands:
    front (+x, the camera side), back, and the bevel/edge strip in pieces of at most
    `chunk` metres; holes are bevelled by `hole_bevel` (default: `bevel`). Edges longer
    than `seg` are split, so the faces triangulate round holes in short, even pieces."""
    rings = [subdivide(r, seg) for r in rings]
    hb = bevel if hole_bevel is None else hole_bevel
    inner = [_untangle(r, inset(r, bevel if i == 0 else hb, limit if i == 0 else None))
             for i, r in enumerate(rings)]
    h = thick / 2
    pts, tris = triangulate_holes(inner[0], inner[1:])
    want = sum(len(r) for r in inner) + 2 * (len(inner) - 1) - 2
    if len(tris) < want:
        print(f"  ({name}: face triangulation incomplete, {len(tris)} of {want} triangles)")
    def P3(p, xx):
        return np.array([x + xx, p[1], p[0]])
    front = Island(f"{name} front", [P3(p, h) for p in pts], [(p[0], p[1]) for p in pts],
                   _orient([P3(p, h) for p in pts], tris, X), np.tile(X, (len(pts), 1)))
    back = Island(f"{name} back", [P3(p, -h) for p in pts], [(-p[0], p[1]) for p in pts],
                  _orient([P3(p, -h) for p in pts], tris, -X), np.tile(-X, (len(pts), 1)))
    out = [front, back]
    e = blunt / 2
    for ring, inn in zip(rings, inner):
        n = len(ring)
        # stations across the edge: inner back, outline back, (outline front), inner front
        prof = [(inn, -h), (ring, -e)] + ([(ring, e)] if e > 0 else []) + [(inn, h)]
        # cut the loop into pieces of at most `chunk` metres along the outline
        seg = [math.dist(ring[i], ring[(i + 1) % n]) for i in range(n)]
        starts, run = [0], 0.0
        for i in range(n):
            run += seg[i]
            if run > chunk and i + 1 < n:
                starts.append(i + 1)
                run = 0.0
        starts.append(n)
        for s0, s1 in zip(starts, starts[1:]):
            verts, uvs, tri = [], [], []
            u = 0.0
            for i in range(s0, s1 + 1):
                ii = i % n
                col = [P3(r[ii], xx) for r, xx in prof]
                vv = [0.0]
                for k in range(1, len(col)):
                    vv.append(vv[-1] + np.linalg.norm(col[k] - col[k - 1]))
                base = len(verts)
                verts += col
                uvs += [(u, v) for v in vv]
                if i > s0:
                    m = len(col)
                    for k in range(m - 1):
                        a, b = base - m + k, base - m + k + 1
                        tri += [(a, base + k, base + k + 1), (a, base + k + 1, b)]
                if i < s1:
                    u += seg[ii]
            tri = _orient_out(verts, tri, ring, x)
            out.append(Island(f"{name} edge", verts, uvs, tri))
    return Part(name, "item", color, out, label=label, v_label=kw.pop("v_label", None), **kw)


def subdivide(ring, seg):
    """A ring with no edge longer than `seg`."""
    out = []
    for i in range(len(ring)):
        a, b = np.asarray(ring[i], float), np.asarray(ring[(i + 1) % len(ring)], float)
        n = max(1, int(math.ceil(np.linalg.norm(b - a) / seg)))
        out += [tuple(a + (b - a) * k / n) for k in range(n)]
    return out


def _orient(verts, tris, want):
    V = np.asarray(verts)
    out = []
    for a, b, c in tris:
        nrm = np.cross(V[b] - V[a], V[c] - V[a])
        out.append((a, b, c) if np.dot(nrm, want) >= 0 else (a, c, b))
    return out


def _orient_out(verts, tris, ring, x):
    """Edge-strip triangles facing away from the plate's middle plane and outward from
    the material (the side of the outline with no material on it)."""
    V = np.asarray(verts)
    out = []
    for a, b, c in tris:
        nrm = np.cross(V[b] - V[a], V[c] - V[a])
        mid = (V[a] + V[b] + V[c]) / 3
        # the outline's outward direction near this triangle: the closest outline segment's
        # right-hand normal (material is on the left)
        p = np.array([mid[2], mid[1]])
        R = np.asarray(ring)
        best, bn = 1e9, None
        for i in range(len(R)):
            q0, q1 = R[i], R[(i + 1) % len(R)]
            d = q1 - q0
            L2 = float(d @ d)
            t = 0.0 if L2 < 1e-16 else float(np.clip((p - q0) @ d / L2, 0, 1))
            dist = np.linalg.norm(p - (q0 + d * t))
            if dist < best:
                best, bn = dist, np.array([d[1], -d[0]])
        want = np.array([np.sign(mid[0] - x) * 0.3, bn[1], bn[0]])
        out.append((a, b, c) if np.dot(nrm, want) >= 0 else (a, c, b))
    return out
