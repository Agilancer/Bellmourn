"""Geometry rework operations on bmesh: age, warp, sag, lean, twist, droop, break and add.

Every function takes a bmesh in Blender's Z-up metres (the model's footprint round the origin,
its foot at z = 0) and a seeded random.Random, and changes it in place. Added parts get material
index `SW` (the palette swatch atlas) and swatch UVs from `paint`.
"""
import math
import random

import bmesh
from mathutils import Matrix, Vector, noise

RAMPS = ['stone', 'slate', 'earth', 'wood', 'flesh', 'blood', 'fire', 'gold', 'iron', 'moss', 'venom', 'mana', 'arcane', 'bone', 'sky', 'leather']


def bounds(bm):
    xs = [v.co for v in bm.verts]
    if not xs:
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    lo = Vector((min(c.x for c in xs), min(c.y for c in xs), min(c.z for c in xs)))
    hi = Vector((max(c.x for c in xs), max(c.y for c in xs), max(c.z for c in xs)))
    return lo, hi


def swatch_uv(ramp, shade, rnd, jitter=0.3):
    """UV of a point inside the swatch cell of (ramp, shade)."""
    r = RAMPS.index(ramp) if isinstance(ramp, str) else ramp
    s = max(0, min(15, shade))
    u = (s + 0.5 + (rnd.random() - 0.5) * 2 * jitter) / 16
    v = 1 - (r + 0.5 + (rnd.random() - 0.5) * 2 * jitter) / 16
    return u, v


def paint(bm, faces, ramp, shade, rnd, vary=1):
    """Give faces swatch UVs of one ramp, each face a shade either side of `shade`."""
    uv = bm.loops.layers.uv.verify()
    for f in faces:
        s = shade + rnd.choice([0, 0, 0, -vary, vary]) if vary else shade
        if f.normal.z < -0.5:
            s -= 1
        u, v = swatch_uv(ramp, s, rnd)
        for lp in f.loops:
            lp[uv].uv = (u, v)


# ------------------------------------------------------------------ deformations
def edge_weight(co, lo, hi, keep):
    """1 inside the piece, falling to 0 at the faces a modular piece meets its neighbours on."""
    w = 1.0
    for ax in keep:
        a, b = lo[ax], hi[ax]
        if b - a < 1e-4:
            continue
        d = min(co[ax] - a, b - co[ax]) / max(0.15, (b - a) * 0.12)
        w *= max(0.0, min(1.0, d))
    return w


def warp(bm, amp, freq, seed, keep=(), axes=(1, 1, 1)):
    """Bend everything off true: a smooth 3D noise displacement (a pinch of it per vertex)."""
    lo, hi = bounds(bm)
    off = Vector((seed * 7.31, seed * 3.17, seed * 1.93))
    for v in bm.verts:
        w = edge_weight(v.co, lo, hi, keep) if keep else 1.0
        if w <= 0:
            continue
        n = noise.noise_vector(v.co * freq + off)
        v.co.x += n.x * amp * w * axes[0]
        v.co.y += n.y * amp * w * axes[1]
        v.co.z += n.z * amp * w * axes[2]


def sag(bm, axis, amount, top_only=0.0):
    """The middle of a span gives way: z drops by `amount` at the centre of `axis`."""
    lo, hi = bounds(bm)
    a, b = lo[axis], hi[axis]
    if b - a < 1e-4:
        return
    hz = hi.z - lo.z
    for v in bm.verts:
        u = (v.co[axis] - a) / (b - a)
        k = 1 - (2 * u - 1) ** 2
        if top_only and hz > 1e-4:
            k *= max(0.0, (v.co.z - lo.z) / hz - top_only) / (1 - top_only)
        v.co.z -= amount * k


def lean(bm, ax, ay):
    """Shear over: x += ax * z, y += ay * z (radians, small)."""
    for v in bm.verts:
        v.co.x += math.tan(ax) * v.co.z
        v.co.y += math.tan(ay) * v.co.z


def twist(bm, angle):
    """Wring round the vertical: `angle` radians at the top, none at the foot."""
    lo, hi = bounds(bm)
    h = max(1e-4, hi.z - lo.z)
    for v in bm.verts:
        t = (v.co.z - lo.z) / h
        m = Matrix.Rotation(angle * t * t, 2)
        x, y = m @ Vector((v.co.x, v.co.y))
        v.co.x, v.co.y = x, y


def droop(bm, k, start=0.3):
    """Branches and leaves hang: points fall with the square of their distance from the trunk."""
    lo, hi = bounds(bm)
    h = max(1e-4, hi.z - lo.z)
    for v in bm.verts:
        t = (v.co.z - lo.z) / h
        if t < start:
            continue
        r2 = v.co.x ** 2 + v.co.y ** 2
        v.co.z -= k * r2 * min(1.0, (t - start) / (1 - start) * 2)


def bulge(bm, k):
    """Swell at the middle (barrels, sacks): radial scale by 1 + k sin(pi t)."""
    lo, hi = bounds(bm)
    h = max(1e-4, hi.z - lo.z)
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    for v in bm.verts:
        s = 1 + k * math.sin(math.pi * (v.co.z - lo.z) / h)
        v.co.x = cx + (v.co.x - cx) * s
        v.co.y = cy + (v.co.y - cy) * s


def gnarl(bm, amp, seed):
    """Knot a trunk and its limbs: noise that grows with height, so roots stay put."""
    lo, hi = bounds(bm)
    h = max(1e-4, hi.z - lo.z)
    off = Vector((seed * 1.7, seed * 2.9, seed * 0.3))
    for v in bm.verts:
        t = (v.co.z - lo.z) / h
        n = noise.noise_vector(v.co * (1.6 / max(1, h / 4)) + off)
        v.co.x += n.x * amp * t
        v.co.y += n.y * amp * t
        v.co.z += n.z * amp * 0.3 * t


def thin(bm, faces, frac, rnd, cluster=0.0):
    """Strip a fraction of faces away (a dying canopy, missing tiles, torn cloth). With
    `cluster` the holes come in patches round a few seeds."""
    faces = [f for f in faces if f.is_valid]
    if not faces:
        return
    if cluster:
        seeds = [rnd.choice(faces).calc_center_median() for _ in range(max(1, int(len(faces) * frac / 12)))]
        doomed = [f for f in faces if min((f.calc_center_median() - s).length for s in seeds) < cluster]
    else:
        doomed = [f for f in faces if rnd.random() < frac]
    bmesh.ops.delete(bm, geom=doomed, context='FACES')


def chop(bm, rnd, co, no, fill=True):
    """Break a piece off along a plane through `co` with normal `no` (the side `no` points to
    goes), and close the wound."""
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=co, plane_no=no, clear_outer=True)
    if fill:
        cut = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        if cut:
            try:
                out = bmesh.ops.holes_fill(bm, edges=cut, sides=0)
                return out.get('faces', [])
            except Exception:  # noqa: BLE001
                pass
    return []


def jagged_top(bm, rnd, z, amp, axis=0, n=5, fill=True):
    """A ruined top: a run of tilted cuts across `axis` near height z."""
    lo, hi = bounds(bm)
    a, b = lo[axis], hi[axis]
    new = []
    for k in range(n):
        u = a + (b - a) * (k + rnd.random()) / n
        co = Vector((0, 0, 0))
        co[axis] = u
        co.z = z + (rnd.random() - 0.5) * 2 * amp
        no = Vector((0, 0, 1))
        no[axis] = (rnd.random() - 0.5) * 2.2
        new += chop(bm, rnd, co, no.normalized(), fill)
    return new


def chip_corner(bm, rnd, size=0.12):
    """Knock a corner off: a cut across one of the top corners."""
    lo, hi = bounds(bm)
    cx = hi.x if rnd.random() < 0.5 else lo.x
    cy = hi.y if rnd.random() < 0.5 else lo.y
    corner = Vector((cx, cy, hi.z))
    d = Vector((cx - (lo.x + hi.x) / 2, cy - (lo.y + hi.y) / 2, (hi.z - lo.z) / 2)).normalized()
    ext = (hi - lo).length
    co = corner - d * min(size, ext * 0.18)
    return chop(bm, rnd, co, d)


# ------------------------------------------------------------------ additions
def _add(bm, geom_verts, mat, ramp, shade, rnd):
    faces = list({f for v in geom_verts for f in v.link_faces})
    for f in faces:
        f.material_index = mat
    paint(bm, faces, ramp, shade, rnd)
    return faces


def spike(bm, base, h, r, mat, rnd, ramp='iron', shade=4, tilt=(0, 0), segs=5, dir=None):
    """A cone standing on `base`, pointing up, or tilted, or along `dir`."""
    if dir is not None:
        rot = Vector((0, 0, 1)).rotation_difference(Vector(dir).normalized()).to_matrix().to_4x4()
    else:
        rot = Matrix.Rotation(tilt[0], 4, 'X') @ Matrix.Rotation(tilt[1], 4, 'Y')
    res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=segs, radius1=r, radius2=0.0, depth=h,
                                matrix=Matrix.Translation(Vector(base)) @ rot @ Matrix.Translation((0, 0, h / 2)))
    return _add(bm, res['verts'], mat, ramp, shade, rnd)


def band(bm, center, r, z, h, mat, rnd, ramp='iron', shade=3, segs=10, sx=1.0, sy=1.0):
    res = bmesh.ops.create_cone(bm, cap_ends=False, segments=segs, radius1=r, radius2=r, depth=h,
                                matrix=Matrix.Translation(Vector((center[0], center[1], z))) @ Matrix.Diagonal((sx, sy, 1, 1)))
    return _add(bm, res['verts'], mat, ramp, shade, rnd)


def block(bm, lo, hi, mat, rnd, ramp='iron', shade=3):
    c = (Vector(lo) + Vector(hi)) / 2
    s = Vector(hi) - Vector(lo)
    res = bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(c) @ Matrix.Diagonal((s.x, s.y, s.z, 1)))
    return _add(bm, res['verts'], mat, ramp, shade, rnd)


def lump(bm, c, size, mat, rnd, ramp='moss', shade=3, flat=0.45, sub=1):
    """A clump (moss, wax, rubble, fungus): a squashed, jittered icosphere."""
    res = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0,
                                     matrix=Matrix.Translation(Vector(c)) @ Matrix.Diagonal((size, size * (0.7 + rnd.random() * 0.6), size * flat, 1)))
    for v in res['verts']:
        v.co += Vector((rnd.random() - 0.5, rnd.random() - 0.5, rnd.random() - 0.5)) * size * 0.35
    return _add(bm, res['verts'], mat, ramp, shade, rnd)


def drips(bm, c, r, top, n, mat, rnd, ramp='bone', shade=11):
    """Wax run down a candle's sides from its rim."""
    out = []
    for k in range(n):
        a = rnd.random() * math.tau
        ln = 0.02 + rnd.random() * 0.07
        p = (c[0] + math.cos(a) * r, c[1] + math.sin(a) * r, top - ln / 2)
        out += block(bm, (p[0] - 0.006, p[1] - 0.006, p[2] - ln / 2), (p[0] + 0.006, p[1] + 0.006, p[2] + ln / 2), mat, rnd, ramp, shade)
    return out


def top_points(bm, frac=0.9, cell=0.12):
    """Clusters of the highest vertices (candle tops, post tops), as xy centres with their z."""
    lo, hi = bounds(bm)
    zc = lo.z + (hi.z - lo.z) * frac
    pts = {}
    for v in bm.verts:
        if v.co.z < zc:
            continue
        k = (round(v.co.x / cell), round(v.co.y / cell))
        p = pts.setdefault(k, [0, 0, -1e9, 0])
        p[0] += v.co.x; p[1] += v.co.y; p[2] = max(p[2], v.co.z); p[3] += 1
    return [(p[0] / p[3], p[1] / p[3], p[2]) for p in pts.values()]


def faces_of(bm, mats):
    return [f for f in bm.faces if f.material_index in mats]
