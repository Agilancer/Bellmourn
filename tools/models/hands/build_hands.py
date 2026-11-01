"""Human first-person arms: templates/models/arms/arm_bare_{R,L}.glb, rebuilt on the game's own arm
skeleton (the old files in tools/models/hands/base: their nodes, joints and the 'item' socket are
kept, so every first-person move drives them unchanged).

1. The anatomy, in the bind pose: the fingers straight and a little spread, the thumb turned out
   from the palm (its metacarpal as it lies). The rig's rest pose is a fist; the bind matrices
   carry each bone from one to the other.
2. The shape, as one distance field: a forearm tapering from the muscle below the elbow to an oval
   wrist (and the knob of the ulna); the palm, a rounded slab thick at the wrist and thin at the
   knuckles, with the ball of the thumb, the heel of the hand, the pads under the knuckles and the
   knuckles' heads; the thumb and fingers oval, tapering, swelling at their joints. All of it is
   blended with smooth minimums: the webbing between the fingers, the thumb's web, the wrist.
3. Its surface (surface nets on a 1.5 mm grid), smoothed; Blender (headless, blender_uv.py) brings
   it down to about 9,000 triangles and unwraps it, with a rolled linen sleeve joined on. The
   islands then get their share of the texture (the hand most, the sleeve least) and are packed.
4. Skin weights from the anatomy: each digit's bones by where along it a point lies, blended over
   a few millimetres at each joint; the wrist and the elbow wider.
5. The skin, painted texel by texel from where each texel is on the arm: a lighter palm and a
   darker back, mottling, warm shadow in every hollow (the field's own occlusion), creases on the
   palm side of each joint and the palm's three lines, wrinkles over the knuckles, tendons and
   veins on the back of the hand, nails (pink, a pale moon, a thin free edge), fine hair on the
   forearm. A height map goes with it (pore detail from the villagers' scanned skin, the creases,
   tendons, veins and nails); the game makes the bumps from that, never from the colour.
6. GLB: the old file's nodes and skin, the new mesh, its texture, and the height map in the
   occlusion slot (viewmodel.js turns it into the normal map). The left arm is the right mirrored.

    python tools/models/hands/build_hands.py
"""
import io
import json
import math
import os
import struct
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage, sparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
ARMS = os.path.join(ROOT, 'templates', 'models', 'arms')
BASE = os.path.join(HERE, 'base')
VILL = os.path.join(ROOT, 'templates', 'models', 'creatures', 'villagers', 'villager_m01.glb')
BLENDER = os.environ.get('BLENDER', r'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe')
WORK = os.path.join(tempfile.gettempdir(), 'bellmourn_hands')
TEX = 1024
GRID = 0.0015
TRIS = 9000

DOR, RAD, ALONG = np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, -1.0])   # (the right arm)


# ------------------------------------------------------------------ small helpers
def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def smooth(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def gauss(x, w):
    return np.exp(-(np.asarray(x) / w) ** 2)


def rot_between(a, b):
    a, b = unit(a), unit(b)
    v, c = np.cross(a, b), float(np.dot(a, b))
    if c < -0.9999:
        p = unit(np.cross(a, [1, 0, 0] if abs(a[0]) < 0.9 else [0, 1, 0]))
        return 2 * np.outer(p, p) - np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K / (1 + c)


def read_glb(path):
    b = open(path, 'rb').read()
    n = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + n])
    off = 20 + n
    return j, b[off + 8:off + 8 + struct.unpack_from('<I', b, off)[0]]


def accessor(j, bin_, i):
    a = j['accessors'][i]
    bv = j['bufferViews'][a['bufferView']]
    comp = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.frombuffer(bin_, comp, a['count'] * n, o).reshape(a['count'], n)


def world(j):
    W = {}

    def trs(nd):
        x, y, z, w = nd.get('rotation', [0, 0, 0, 1])
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        M = np.eye(4)
        M[:3, :3] = R * np.array(nd.get('scale', [1, 1, 1]))
        M[:3, 3] = nd.get('translation', [0, 0, 0])
        return M

    def walk(i, P):
        M = P @ trs(j['nodes'][i])
        W[j['nodes'][i]['name']] = M
        for c in j['nodes'][i].get('children', []):
            walk(c, M)
    walk(j['scenes'][0]['nodes'][0], np.eye(4))
    return W


# ------------------------------------------------------------------ 1. the anatomy
# per finger: half-width at the root, splay (toward the thumb, radians), length of its last bone
FINGERS = {'index': (0.0089, 0.12, 0.0220), 'middle': (0.0092, 0.03, 0.0265),
           'ring': (0.0087, -0.07, 0.0240), 'pinky': (0.0076, -0.19, 0.0165)}
THUMB_UP = unit(0.45 * DOR + 0.9 * RAD)     # (where the thumbnail faces, out from the palm)


def anatomy():
    j, bin_ = read_glb(os.path.join(BASE, 'arm_bare_R.glb'))
    W = world(j)
    pos = {n: W[n][:3, 3].copy() for n in W}
    joints = [j['nodes'][i]['name'] for i in j['skins'][0]['joints']]
    prim = j['meshes'][0]['primitives'][0]
    V = accessor(j, bin_, prim['attributes']['POSITION']).astype(float)
    Jn = accessor(j, bin_, prim['attributes']['JOINTS_0']).astype(int)
    Wt = accessor(j, bin_, prim['attributes']['WEIGHTS_0']).astype(float)
    dom = Jn[np.arange(len(Jn)), Wt.argmax(1)]

    def tip_old(name):          # how far the old mesh's last bone of a digit reached
        sel = V[dom == joints.index(name)]
        return sel[np.linalg.norm(sel - pos[name], axis=1).argmax()]

    bind = {n: W[n].copy() for n in joints}

    def put(name, a, d, q):
        M = np.eye(4)
        M[:3, :3] = rot_between(a, d)
        M[:3, 3] = q
        bind[name] = M

    digits = {}
    for name, (r0, splay, L3) in FINGERS.items():
        p1, p2, p3 = pos[name + '1'], pos[name + '2'], pos[name + '3']
        L1, L2 = np.linalg.norm(p2 - p1), np.linalg.norm(p3 - p2)
        d = unit(ALONG * math.cos(splay) + RAD * math.sin(splay))
        q1, q2 = p1, p1 + d * L1
        q3 = q2 + d * L2
        put(name + '1', p2 - p1, d, q1); put(name + '2', p3 - p2, d, q2); put(name + '3', tip_old(name + '3') - p3, d, q3)
        base = q1 - d * 0.010                 # (the tube starts inside the palm)
        digits[name] = dict(pts=[base, q2, q3, q3 + d * L3], at=[0.010, 0.010 + L1, 0.010 + L1 + L2], r0=r0,
                            ups=[DOR, DOR, DOR], joints=[name + '1', name + '2', name + '3'], thumb=False)
    t1, t2, t3 = pos['thumb1'], pos['thumb2'], pos['thumb3']
    d1, d2, d3 = unit(t2 - t1), unit([-0.30, 0.45, -0.84]), unit([-0.40, 0.30, -0.87])
    L1, L2, L3 = np.linalg.norm(t2 - t1), np.linalg.norm(t3 - t2), 0.0235
    q2 = t1 + d1 * L1
    q3 = q2 + d2 * L2
    put('thumb1', t2 - t1, d1, t1); put('thumb2', t3 - t2, d2, q2); put('thumb3', tip_old('thumb3') - t3, d3, q3)
    digits['thumb'] = dict(pts=[t1 - d1 * 0.006, q2, q3, q3 + d3 * L3], at=[0.006, 0.006 + L1, 0.006 + L1 + L2], r0=0.0118,
                           ups=[unit(0.5 * DOR + 0.5 * RAD), THUMB_UP, THUMB_UP], joints=['thumb1', 'thumb2', 'thumb3'], thumb=True)
    for D in digits.values():
        D['lens'] = np.cumsum([0] + [np.linalg.norm(D['pts'][i + 1] - D['pts'][i]) for i in range(3)])
    return dict(j=j, pos=pos, joints=joints, bind=bind, digits=digits)


def radius(D, S):
    """A digit's half-width at S along it: tapering to the tip, swelling at its joints."""
    total, at, r0 = D['lens'][-1], D['at'], D['r0']
    S = np.asarray(S, float)
    taper = 0.22 if D['thumb'] else 0.13
    r = r0 * (1 - taper * smooth(at[0], total, S))
    if D['thumb']:
        r = r * (1 + 0.05 * gauss(S - at[1], 0.005) + 0.045 * gauss(S - at[2], 0.004))
    else:
        r = r * (1 + 0.06 * gauss(S - at[1], 0.0038) + 0.045 * gauss(S - at[2], 0.0032)
                 - 0.055 * gauss(S - (at[0] + at[1]) / 2, 0.007) - 0.045 * gauss(S - (at[1] + at[2]) / 2, 0.0055))
    return r


# ------------------------------------------------------------------ 2. the shape
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def ell2(x, y, ax, ay):
    k0 = np.sqrt((x / ax) ** 2 + (y / ay) ** 2)
    k1 = np.sqrt((x / ax ** 2) ** 2 + (y / ay ** 2) ** 2)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-12)


def ellipsoid(P, c, axes, R=None):
    q = P - c
    if R is not None:
        q = q @ R
    axes = np.asarray(axes, float)
    k0 = np.linalg.norm(q / axes, axis=1)
    k1 = np.linalg.norm(q / axes ** 2, axis=1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-12)


def rbox2(x, y, hx, hy, rc):
    qx, qy = np.abs(x) - (hx - rc), np.abs(y) - (hy - rc)
    return np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - rc


# the forearm: z, half-width, half-depth, centre (dorsal) — from inside the palm to inside the sleeve
FORE = np.array([[-0.030, 0.0280, 0.0180, 0.000], [0.000, 0.0285, 0.0185, 0.000], [0.030, 0.0300, 0.0200, 0.000],
                 [0.080, 0.0335, 0.0245, 0.001], [0.140, 0.0385, 0.0300, 0.002], [0.200, 0.0420, 0.0340, 0.002],
                 [0.250, 0.0430, 0.0355, 0.0015], [0.300, 0.0410, 0.0350, 0.000], [0.370, 0.0400, 0.0350, 0.000]])
# the palm: z, ulnar edge, radial edge, palm surface, back surface
PALM = np.array([[-0.092, -0.0300, 0.0310, 0.0020, 0.0185], [-0.082, -0.0340, 0.0350, -0.0010, 0.0210],
                 [-0.068, -0.0355, 0.0360, -0.0060, 0.0190], [-0.045, -0.0345, 0.0345, -0.0120, 0.0170],
                 [-0.020, -0.0315, 0.0320, -0.0160, 0.0172], [0.012, -0.0280, 0.0290, -0.0185, 0.0185]])


def digit_sdf(P, D):
    best = np.full(len(P), np.inf)
    for i in range(3):
        a, b = D['pts'][i], D['pts'][i + 1]
        d = unit(b - a)
        L = np.linalg.norm(b - a)
        up = D['ups'][i] - d * np.dot(D['ups'][i], d)
        fdor = unit(up)
        frad = np.cross(d, fdor)
        v = P - a
        s = v @ d
        end = L - (radius(D, D['lens'][-1]) * 1.0 if i == 2 else 0)
        sc = np.clip(s, 0, end)
        c = v - np.outer(sc, d)
        x, y, ax = c @ fdor, c @ frad, s - sc
        S = D['lens'][i] + sc
        r = radius(D, S)
        at, total = D['at'], D['lens'][-1]
        knob = 0.13 * gauss(S - at[1], 0.0036) + 0.09 * gauss(S - at[2], 0.003) if not D['thumb'] else 0.08 * gauss(S - at[2], 0.0035)
        pad = 0.09 * smooth(at[2] + 0.2 * (total - at[2]), total, S)
        kx = np.where(x > 0, 0.80 + knob, 1.0 + pad + (0.1 if (i < 2 and not D['thumb']) else 0.0))
        ky = 1.08 if (i < 2 and not D['thumb']) else 1.0
        p_ = 2.5 if (i < 2 and not D['thumb']) else 2.0
        q = np.sqrt((np.abs(x / kx) ** p_ + np.abs(y / ky) ** p_) ** (2 / p_) + ax ** 2)
        best = np.minimum(best, (q - r) * 0.8)
    return best


def field(P, A):
    """The arm's signed distance (metres, negative inside) at points P (n, 3), in the bind pose."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    zf = np.clip(z, FORE[0, 0], FORE[-1, 0])
    ay, ax, xc = (np.interp(zf, FORE[:, 0], FORE[:, k]) for k in (1, 2, 3))
    fore = ell2(x - xc, y, ax, ay)
    fore = smax(fore, -0.030 - z, 0.012)
    fore = np.maximum(fore, z - 0.37)
    fore = smin(fore, ellipsoid(P, [0.0085, -0.0195, 0.015], [0.0068, 0.0068, 0.0085]), 0.012)       # the ulna's knob
    fore = smin(fore, ellipsoid(P, [0.004, 0.026, 0.215], [0.026, 0.022, 0.075]), 0.02)             # the muscle below the elbow
    fore = smin(fore, ellipsoid(P, [-0.012, -0.004, 0.22], [0.028, 0.034, 0.08]), 0.02)
    zp = np.clip(z, PALM[0, 0], PALM[-1, 0])
    ylo, yhi, xb, xt = (np.interp(zp, PALM[:, 0], PALM[:, k]) for k in (1, 2, 3, 4))
    hx, hy = (xt - xb) / 2, (yhi - ylo) / 2
    hand = rbox2(x - (xt + xb) / 2, y - (yhi + ylo) / 2, hx, hy, 0.85 * np.minimum(hx, hy))
    hand = smax(hand, -0.091 - z, 0.006)
    hand = smax(hand, z - 0.02, 0.01)
    pos = A['pos']
    for name in FINGERS:
        j1 = pos[name + '1']
        hand = smin(hand, ellipsoid(P, j1 + [0.0011, 0, -0.0003], [0.0086, 0.0088, 0.0092] if name != 'pinky' else [0.0076, 0.0078, 0.0082]), 0.004)   # the knuckle
        hand = smin(hand, ellipsoid(P, [0.0035, j1[1], j1[2] + 0.0002], [0.0075, 0.0085, 0.0095]), 0.006)       # the pad under it
    T = A['digits']['thumb']
    e1 = unit(T['pts'][1] - T['pts'][0])
    e2 = unit(np.cross(e1, DOR))
    R = np.stack([e1, e2, np.cross(e1, e2)], 1)
    hand = smin(hand, ellipsoid(P, pos['thumb1'] + (pos['thumb2'] - pos['thumb1']) * 0.45 + [-0.003, -0.007, -0.002], [0.023, 0.0145, 0.0125], R), 0.012)
    hand = smin(hand, ellipsoid(P, [-0.007, -0.025, -0.047], [0.0105, 0.0115, 0.034]), 0.012)       # the heel of the hand
    hand = smin(hand, digit_sdf(P, T), 0.011)
    fingers = None
    for name in FINGERS:
        f = digit_sdf(P, A['digits'][name])
        fingers = f if fingers is None else smin(fingers, f, 0.0022)
    hand = smin(hand, fingers, 0.0068)
    return smin(fore, hand, 0.013)


def field_chunked(P, A, n=300000):
    return np.concatenate([field(P[i:i + n], A) for i in range(0, len(P), n)])


# ------------------------------------------------------------------ 3. the surface
def surface_nets(F, origin, h):
    nx, ny, nz = F.shape
    inside = F < 0
    C = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0), (0, 0, 1), (1, 0, 1), (0, 1, 1), (1, 1, 1)]
    code = np.zeros((nx - 1, ny - 1, nz - 1), np.uint8)
    for k, (a, b, c) in enumerate(C):
        code |= (inside[a:nx - 1 + a, b:ny - 1 + b, c:nz - 1 + c].astype(np.uint8) << k)
    cells = np.argwhere((code != 0) & (code != 255))
    E = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]
    acc, cnt = np.zeros((len(cells), 3)), np.zeros(len(cells))
    for a, b in E:
        oa, ob = np.array(C[a]), np.array(C[b])
        fa = F[tuple((cells + oa).T)]
        fb = F[tuple((cells + ob).T)]
        m = (fa < 0) != (fb < 0)
        t = fa[m] / (fa[m] - fb[m])
        acc[m] += cells[m] + oa + t[:, None] * (ob - oa)
        cnt[m] += 1
    verts = origin + acc / cnt[:, None] * h
    vid = -np.ones(code.shape, np.int64)
    vid[tuple(cells.T)] = np.arange(len(cells))
    quads = []
    for ax in range(3):
        b, c = (ax + 1) % 3, (ax + 2) % 3
        eb, ec = np.eye(3, dtype=int)[b], np.eye(3, dtype=int)[c]
        lo_end = tuple(slice(0, F.shape[k] - 1) if k == ax else slice(None) for k in range(3))
        hi_end = tuple(slice(1, None) if k == ax else slice(None) for k in range(3))
        g = np.argwhere(inside[lo_end] != inside[hi_end])          # (grid edges the surface crosses)
        g = g[(g[:, b] >= 1) & (g[:, c] >= 1) & (g[:, b] < F.shape[b] - 1) & (g[:, c] < F.shape[c] - 1)]
        ins = inside[tuple(g.T)]
        q = np.stack([vid[tuple((g - eb - ec).T)], vid[tuple((g - ec).T)], vid[tuple(g.T)], vid[tuple((g - eb).T)]], 1)
        q[~ins] = q[~ins][:, ::-1]                      # (facing out of the solid)
        quads.append(q)
    q = np.concatenate(quads)
    q = q[(q >= 0).all(1)]
    # each quad in two, along its shorter diagonal
    d02 = np.linalg.norm(verts[q[:, 0]] - verts[q[:, 2]], axis=1)
    d13 = np.linalg.norm(verts[q[:, 1]] - verts[q[:, 3]], axis=1)
    a = d02 <= d13
    tri = np.concatenate([np.stack([q[a, 0], q[a, 1], q[a, 2]], 1), np.stack([q[a, 0], q[a, 2], q[a, 3]], 1),
                          np.stack([q[~a, 0], q[~a, 1], q[~a, 3]], 1), np.stack([q[~a, 1], q[~a, 2], q[~a, 3]], 1)])
    return verts, tri


def taubin(V, F, n=6, lam=0.5, mu=-0.53):
    rows = np.concatenate([F[:, 0], F[:, 1], F[:, 2], F[:, 1], F[:, 2], F[:, 0]])
    cols = np.concatenate([F[:, 1], F[:, 2], F[:, 0], F[:, 0], F[:, 1], F[:, 2]])
    Adj = sparse.csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(len(V), len(V)))
    Adj.data[:] = 1
    deg = np.asarray(Adj.sum(1)).ravel()
    deg[deg == 0] = 1
    for _ in range(n):
        for k in (lam, mu):
            V = V + k * (Adj @ V / deg[:, None] - V)
    return V


def sleeve_mesh():
    """A rolled linen sleeve over the elbow: rings round the arm, folds in it, a roll at its cuff that
    turns in toward the forearm."""
    N, M = 28, 34
    rings = []
    for k in range(M):
        t = k / (M - 1)
        z = 0.255 + 0.37 * t
        roll = 0.0055 * smooth(0.0, 0.05, t) * (1 - smooth(0.06, 0.12, t))
        lip = 1 - 0.13 * (1 - smooth(0.0, 0.035, t))          # (the cuff's edge tucked in)
        ry, rx = (0.0485 + roll + 0.004 * t) * lip, (0.0425 + roll + 0.004 * t) * lip
        ring = []
        for i in range(N):
            a = 2 * math.pi * i / N
            f = 1 + 0.035 * math.sin(a * 5 + z * 55) * smooth(0.12, 0.3, t) + 0.02 * math.sin(a * 9 - z * 90)
            ring.append([rx * math.cos(a) * f, ry * math.sin(a) * f, z])
        rings.append(ring)
    V = np.array(rings).reshape(-1, 3)
    F = []
    for k in range(M - 1):
        for i in range(N):
            a, b = k * N + i, k * N + (i + 1) % N
            c, d = a + N, b + N
            F += [(a, b, d), (a, d, c)]
    return V, np.array(F)


def write_obj(path, V, F):
    with open(path, 'w') as f:
        f.write(''.join(f'v {x:.6f} {y:.6f} {z:.6f}\n' for x, y, z in V))
        f.write(''.join(f'f {a + 1} {b + 1} {c + 1}\n' for a, b, c in F))


def read_obj(path):
    V, T, faces, mat, cur = [], [], [], [], 0
    for line in open(path):
        if line.startswith('v '):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            T.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('usemtl'):
            cur = 1 if 'sleeve' in line else 0
        elif line.startswith('f '):
            faces.append([[int(x) - 1 for x in c.split('/')[:2]] for c in line.split()[1:4]])
            mat.append(cur)
    faces = np.array(faces)
    return np.array(V), np.array(T), faces[:, :, 0], faces[:, :, 1], np.array(mat)


def islands(FT, nT):
    rows = np.concatenate([FT[:, 0], FT[:, 1], FT[:, 2]])
    cols = np.concatenate([FT[:, 1], FT[:, 2], FT[:, 0]])
    G = sparse.csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(nT, nT))
    return sparse.csgraph.connected_components(G, directed=False)[1]


def pack(V, FV, T, FT, mat, margin=10 / TEX):
    """Each island its share of the texture (by where it is on the arm: the islands are first cut at the
    wrist and halfway up the forearm, so the hand's share is its own), then packed. Returns the new
    UVs and the faces' UV indices (the cuts make new ones)."""
    cz = V[FV].mean(1)[:, 2]
    reg = np.where(mat == 1, 3, np.where(cz < 0.006, 0, np.where(cz < 0.12, 1, 2)))
    uniq, inv = np.unique((FT * 4 + reg[:, None]).ravel(), return_inverse=True)
    T, FT = T[uniq // 4], inv.reshape(-1, 3)
    lab = islands(FT, len(T))
    face_isl = lab[FT[:, 0]]
    T = T.copy()
    boxes = []
    for i in np.unique(face_isl):
        fs = np.nonzero(face_isl == i)[0]
        P = V[FV[fs]]
        a3 = 0.5 * np.linalg.norm(np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]), axis=1).sum()
        U = T[FT[fs]]
        e1, e2 = U[:, 1] - U[:, 0], U[:, 2] - U[:, 0]
        a2 = 0.5 * np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]).sum()
        z = P[:, :, 2].mean()
        density = 0.22 if mat[fs].mean() > 0.5 else 1.0 if z < 0.006 else 0.62 if z < 0.12 else 0.42
        s = math.sqrt(a3 / max(a2, 1e-12)) * density
        ids = np.unique(FT[fs])
        uv = T[ids] * s
        uv -= uv.min(0)
        w, h = uv.max(0)
        boxes.append((ids, uv, w, h))
    boxes.sort(key=lambda b: -b[3] * b[2])

    def place(K):
        """A skyline, bottom-left: each box where it sits lowest."""
        sky = [(0.0, 1.0, 0.0)]            # (x, width, height) runs across the top
        out, top = [], 0.0
        for ids, uv, w0, h0 in boxes:
            best = None
            for turned, (w, h) in ((False, (w0, h0)), (True, (h0, w0))):     # (each island either way round)
                w, h = w * K + margin, h * K + margin
                for i in range(len(sky)):
                    x0, need, y0, j = sky[i][0], w, 0.0, i
                    while need > 1e-12 and j < len(sky):
                        y0 = max(y0, sky[j][2]); need -= sky[j][1]; j += 1
                    if need > 1e-12 or x0 + w > 1 + 1e-9:
                        continue
                    if best is None or y0 + h < best[1] + best[3] - 1e-12:
                        best = (x0, y0, w, h, turned)
            if best is None:
                return out, 9.0
            x0, y0, w, h, turned = best
            out.append((x0, y0, turned))
            top = max(top, y0 + h)
            new = []
            for (sx, sw, sh) in sky:
                a, b = sx, sx + sw
                if b <= x0 + 1e-12 or a >= x0 + w - 1e-12:
                    new.append((sx, sw, sh)); continue
                if a < x0:
                    new.append((a, x0 - a, sh))
                if b > x0 + w:
                    new.append((x0 + w, b - x0 - w, sh))
            new.append((x0, w, y0 + h))
            sky = sorted(new)
        return out, top
    lo, hi = 1.0, 400.0
    for _ in range(40):
        K = (lo + hi) / 2
        if place(K)[1] <= 1:
            lo = K
        else:
            hi = K
    spots, _ = place(lo)
    for (ids, uv, w, h), (x, y, turned) in zip(boxes, spots):
        if turned:                                    # (a quarter turn)
            uv = np.stack([uv[:, 1], w - uv[:, 0]], 1)
        T[ids] = uv * lo + [x + margin / 2, y + margin / 2]
    return T, FT, lo


# ------------------------------------------------------------------ 4. the weights
def weights(P, A, mat):
    J = A['joints']
    col = {n: k for k, n in enumerate(J)}
    W = np.zeros((len(P), len(J)))
    z = P[:, 2]
    hand = smooth(0.016, -0.014, z)
    upper = smooth(0.27, 0.33, z)
    W[:, col['hand']] = hand
    W[:, col['fore']] = (1 - hand) * (1 - upper)
    W[:, col['upper']] = (1 - hand) * upper
    best, who, Sbest = np.full(len(P), np.inf), np.full(len(P), -1), np.zeros(len(P))
    names = list(A['digits'])
    for k, name in enumerate(names):
        S, rho = along(P, A['digits'][name])
        ratio = rho / radius(A['digits'][name], S)
        ok = (ratio < 1.35) & (S > 0.0) & (mat == 0)
        m = ok & (ratio < best)
        best[m], who[m], Sbest[m] = ratio[m], k, S[m]
    for k, name in enumerate(names):
        D = A['digits'][name]
        m = who == k
        S = Sbest[m]
        at = D['at']
        if D['thumb']:
            a = smooth(0.002, 0.018, S)
        else:
            a = smooth(at[0] - 0.0045, at[0] + 0.0045, S)
        b = smooth(at[1] - 0.0024, at[1] + 0.0024, S)
        c = smooth(at[2] - 0.0021, at[2] + 0.0021, S)
        rest = 1 - a
        W[m] *= rest[:, None]
        j1, j2, j3 = (col[n] for n in D['joints'])
        W[m, j1] += a * (1 - b)
        W[m, j2] += a * b * (1 - c)
        W[m, j3] += a * b * c
    W /= W.sum(1, keepdims=True)
    order = np.argsort(-W, axis=1)[:, :4]
    JI = order.astype(np.uint8)
    WW = np.take_along_axis(W, order, 1)
    WW /= WW.sum(1, keepdims=True)
    return JI, WW.astype(np.float32)


def along(P, D):
    """Where points lie along a digit: S (metres from its start) and how far off its axis."""
    bestd, bestS = np.full(len(P), np.inf), np.zeros(len(P))
    for i in range(3):
        a, b = D['pts'][i], D['pts'][i + 1]
        d = unit(b - a)
        L = np.linalg.norm(b - a)
        s = np.clip((P - a) @ d, -0.004 if i == 0 else 0, L + (0.004 if i == 2 else 0))
        dist = np.linalg.norm(P - a - np.outer(s, d), axis=1)
        m = dist < bestd
        bestd[m], bestS[m] = dist[m], D['lens'][i] + s[m]
    return bestS, bestd


def frame_at(P, D):
    """A digit's local frame at points: S, the angle round it from its back (0 the nail side), ρ."""
    S, rho = along(P, D)
    i = np.clip(np.searchsorted(D['lens'], S, side='right') - 1, 0, 2)
    phi = np.zeros(len(P))
    for k in range(3):
        m = i == k
        if not m.any():
            continue
        a, b = D['pts'][k], D['pts'][k + 1]
        d = unit(b - a)
        fdor = unit(D['ups'][k] - d * np.dot(D['ups'][k], d))
        frad = np.cross(d, fdor)
        c = P[m] - a - np.outer((P[m] - a) @ d, d)
        phi[m] = np.arctan2(c @ frad, c @ fdor)
    return S, phi, rho


# ------------------------------------------------------------------ 5. the skin
def scan_detail():
    """Pore and fine-line detail (a high pass of the luminance) from the villagers' scanned head skin."""
    j, bin_ = read_glb(VILL)
    img = None
    for im in j['images']:
        if im.get('name', '').startswith('head_'):
            bv = j['bufferViews'][im['bufferView']]
            img = Image.open(io.BytesIO(bin_[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])).convert('L')
            break
    S = img.size[0] / 2048
    a = np.asarray(img.crop(tuple(int(v * S) for v in (650, 760, 850, 1250))), np.float32) / 255     # (forehead and cheek: bare skin)
    det = ndimage.gaussian_filter(a, 0.8) - ndimage.gaussian_filter(a, 6)
    det = np.concatenate([det, det[:, ::-1]], 1)
    det = np.concatenate([det, det[::-1]], 0)
    return det / (det.std() + 1e-6)


def noise3(P, f, seed=0):
    """Smooth-ish value noise from sums of sines (cheap, no lattice)."""
    rng = np.random.default_rng(seed)
    out = np.zeros(len(P))
    for _ in range(5):
        d = unit(rng.normal(size=3))
        out += np.sin(P @ d * f * rng.uniform(0.7, 1.4) + rng.uniform(0, 6.3))
    return out / 5 ** 0.5


def poly_dist(Y, Z, pts):
    """Distance in the (y, z) plane to a polyline."""
    best = np.full(len(Y), np.inf)
    for (y0, z0), (y1, z1) in zip(pts[:-1], pts[1:]):
        dy, dz = y1 - y0, z1 - z0
        t = np.clip(((Y - y0) * dy + (Z - z0) * dz) / (dy * dy + dz * dz), 0, 1)
        best = np.minimum(best, np.hypot(Y - y0 - t * dy, Z - z0 - t * dz))
    return best


C = lambda *c: np.array(c, float) / 255     # noqa: E731
BACK, PALM_C, FORE_D, FORE_V = C(174, 138, 126), C(208, 172, 160), C(178, 142, 128), C(200, 166, 152)
NAIL, MOON, EDGE = C(200, 160, 152), C(212, 180, 172), C(222, 205, 195)


def paint(P, N, part, A):
    """Colour and height for texels at points P with normals N (part 1: the sleeve)."""
    n = len(P)
    col = np.zeros((n, 3))
    hgt = np.zeros(n)
    spec = np.full(n, 0.45)            # (how much it shines: the palm less, knuckles, tips and nails more)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    nd = N @ DOR
    skin = part == 0
    # --- base: palm lighter and pinker, back darker; the forearm's inside lighter than its outside
    wd = smooth(-0.35, 0.55, nd)[:, None]
    hand_c = PALM_C * (1 - wd) + BACK * wd
    fore_c = FORE_V * (1 - wd) + FORE_D * wd
    hz = smooth(-0.012, 0.03, z)[:, None]
    col[:] = hand_c * (1 - hz) + fore_c * hz
    # --- the digits: their own back and front by their own frame; tips and pads
    det = scan_detail()
    digitness = np.zeros(n)
    for name, D in A['digits'].items():
        S, phi, rho = frame_at(P, D)
        own = skin & (rho < radius(D, S) * 1.45) & (S > D['at'][0] - 0.002) & (S < D['lens'][-1] + 0.003)
        if not own.any():
            continue
        Sm, ph = S[own], phi[own]
        back = (smooth(1.9, 0.6, np.abs(ph)) if D['thumb'] else smooth(-0.35, 0.55, nd[own]))[:, None]
        dc = PALM_C * (1 - back) + BACK * back
        # each bone's pad on the palm side: fuller in its middle, a little shadowed toward the joints
        segs = [(D['at'][0], D['at'][1]), (D['at'][1], D['at'][2]), (D['at'][2], D['lens'][-1])]
        padl = sum(gauss(Sm - (a0 + b0) / 2, (b0 - a0) * 0.28) for a0, b0 in segs) * (1 - back[:, 0])
        dc = dc * (1 + 0.035 * padl - 0.05 * (1 - back[:, 0]))[:, None]
        if not D['thumb']:
            first_bone = gauss(Sm - (D['at'][0] + D['at'][1]) / 2, (D['at'][1] - D['at'][0]) * 0.45)
            outer = smooth(D['at'][1] - 0.003, D['at'][1] + 0.004, Sm)
            dc = dc * (1 + 0.05 * back[:, 0] * first_bone - 0.15 * (1 - back[:, 0]) * outer)[:, None]
        dc = dc * (1 + 0.04 * back * gauss(Sm - D['at'][1], 0.004)[:, None] * np.array([1.0, -0.6, -0.8]))   # (ruddy over the middle joint)
        total, L3 = D['lens'][-1], D['lens'][-1] - D['at'][2]
        tip = smooth(D['at'][2] + 0.4 * L3, total, Sm)[:, None] * (1 - 0.5 * back)
        dc = dc * (1 - tip * 0.5) + dc * np.array([1.04, 0.94, 0.94]) * tip * 0.5
        blend = smooth(D['at'][0] - 0.002, D['at'][0] + 0.006, Sm)[:, None]
        col[own] = col[own] * (1 - blend) + dc * blend
        digitness[own] = np.maximum(digitness[own], blend[:, 0])
        # creases on the palm side: one at the root, two at the middle joint, one at the last
        front = smooth(1.3, 2.2, np.abs(ph))
        g = lip = 0
        for at, w in ((D['at'][0] + 0.013 if not D['thumb'] else D['at'][1], 1.0), (D['at'][1] - 0.0013, 1.0), (D['at'][1] + 0.0013, 0.8), (D['at'][2], 1.0)):
            o = Sm - at - 0.0006 * np.cos(ph * 2)
            g = g + w * gauss(o, 0.0007)
            lip = lip + w * (gauss(o - 0.0015, 0.0006) + gauss(o + 0.0015, 0.0006))
        g, lip = g * front, lip * front
        hgt[own] += -0.13 * g + 0.04 * lip
        col[own] *= (1 - 0.1 * g[:, None] * np.array([1.0, 1.25, 1.3])) * (1 + 0.025 * lip)[:, None]
        spec[own] -= 0.15 * front * blend[:, 0]
        # wrinkles over the middle and last joints, on the back
        top = smooth(0.95, 0.35, np.abs(ph))
        wr = 0
        for k in range(4):
            wr = wr + gauss(Sm - (D['at'][1] - 0.0022 + 0.0014 * k) - 0.0016 * (ph / 0.8) ** 2, 0.00028) * (1 - 0.2 * k)
        for k in range(2):
            wr = wr + 0.6 * gauss(Sm - (D['at'][2] - 0.0008 + 0.0013 * k) - 0.0011 * (ph / 0.7) ** 2, 0.00025)
        wr = wr * top
        hgt[own] -= 0.08 * wr
        col[own] *= (1 - 0.15 * wr)[:, None]
        spec[own] += 0.2 * top * gauss(Sm - D['at'][1], 0.004) * blend[:, 0]
        spec[own] += 0.07 * smooth(D['at'][2] + 0.5 * L3, total, Sm)
        # the nail: on the back of the last bone, from a little short of halfway to the tip
        start = D['at'][2] + 0.42 * L3 + 0.0018 * (ph / 0.85) ** 2
        nail = (np.abs(ph) < 0.88) & (Sm > start) & (Sm < total - 0.0006)
        if nail.any():
            k = np.nonzero(nail)[0]
            u = (Sm[k] - start[k]) / max(1e-6, total - 0.0006 - start[k].min())
            nc = NAIL * (1 + 0.05 * noise3(P[own][k], 900, 3))[:, None]
            moon = (u < 0.22) & (np.abs(ph[k]) < 0.5)
            nc[moon] = nc[moon] * 0.7 + MOON * 0.3
            edge = Sm[k] > total - (0.0011 if D['thumb'] else 0.0015)
            nc[edge] = EDGE
            side = np.abs(ph[k]) > 0.74
            nc[side] *= 0.9
            cut = (Sm[k] - start[k]) < 0.0005
            nc[cut] *= 0.84
            idx = np.nonzero(own)[0][k]
            col[idx] = nc
            rise = smooth(0.0, 0.0009, Sm[k] - start[k]) * smooth(0.88, 0.7, np.abs(ph[k]))
            hgt[idx] += 0.1 * rise
            spec[idx] = 0.66
            if name in ('ring', 'pinky'):
                col[idx] *= 0.95
    # --- the palm: its three lines, the creases at the wrist (palm side only)
    front = skin & (nd < -0.25) & (z < 0.02) & (z > -0.095)
    if front.any():
        Y, Z = y[front], z[front]
        dist = np.minimum.reduce([
            poly_dist(Y, Z, [(-0.035, -0.064), (-0.02, -0.066), (-0.005, -0.069), (0.006, -0.072), (0.013, -0.075)]),     # the heart line
            poly_dist(Y, Z, [(0.033, -0.058), (0.018, -0.056), (0.0, -0.053), (-0.022, -0.050)]),                       # the head line
            poly_dist(Y, Z, [(0.033, -0.058), (0.022, -0.046), (0.015, -0.032), (0.009, -0.018), (0.006, -0.004)]),      # the life line
        ])
        side = smooth(-0.25, -0.6, nd[front])
        g = gauss(dist, 0.0009) * side
        lip = gauss(dist - 0.0019, 0.0008) * side
        wrist = (gauss(Z - 0.005, 0.0008) + 0.7 * gauss(Z - 0.0115, 0.0008)) * smooth(0.026, 0.018, np.abs(Y))
        g = g + 0.5 * wrist
        hgt[front] += -0.14 * g + 0.04 * lip
        col[front] *= (1 - 0.1 * g[:, None] * np.array([1.0, 1.25, 1.3])) * (1 + 0.02 * lip)[:, None]
        spec[front] -= 0.15 * side
    palm = skin & (nd < -0.2) & (z < 0.005) & (z > -0.095)
    if palm.any():
        Y, Z = y[palm], z[palm]
        side = smooth(-0.2, -0.6, nd[palm])
        hollow = gauss(np.hypot(Y - 0.002, Z + 0.047), 0.016)
        pads = gauss(np.hypot(Y - 0.022, Z + 0.03), 0.013) + gauss(np.hypot(Y + 0.024, Z + 0.045), 0.014) + sum(gauss(np.hypot(Y - A['pos'][f + '1'][1], Z - A['pos'][f + '1'][2]), 0.008) for f in FINGERS)
        col[palm] *= (1 - 0.06 * hollow * side + 0.035 * np.minimum(pads, 1) * side + 0.03 * noise3(P[palm], 700, 7) * side)[:, None]
        spec[palm] += 0.1 * np.minimum(pads, 1) * side - 0.1 * hollow * side
    # --- the back of the hand: tendons out to the knuckles, veins, the knuckles ruddy
    backh = skin & (nd > 0.3) & (z < 0.03)
    if backh.any():
        Y, Z = y[backh], z[backh]
        ten = 0
        for name in FINGERS:
            j1 = A['pos'][name + '1']
            ten = ten + gauss(poly_dist(Y, Z, [(j1[1] * 0.35, -0.004), (j1[1], j1[2] + 0.006)]), 0.0016) * smooth(-0.004, -0.02, Z) * smooth(j1[2] + 0.002, j1[2] + 0.012, Z)
            kn = gauss(np.hypot(Y - j1[1], Z - j1[2]), 0.0065)
            col[backh] = col[backh] * (1 - 0.06 * kn[:, None]) + col[backh] * np.array([1.05, 0.95, 0.93]) * 0.06 * kn[:, None]
            hgt[backh] += 0.06 * kn
            spec[backh] += 0.25 * kn
        hgt[backh] += 0.22 * ten
        col[backh] *= (1 + 0.03 * ten)[:, None]
    dors = skin & (nd > 0.2) & (z < 0.26)
    if dors.any():
        Y, Z = y[dors], z[dors]
        vd = np.minimum.reduce([
            poly_dist(Y, Z, [(0.030, 0.20), (0.028, 0.12), (0.024, 0.05), (0.020, 0.0), (0.016, -0.03), (0.012, -0.055)]),
            poly_dist(Y, Z, [(-0.026, 0.18), (-0.022, 0.10), (-0.018, 0.04), (-0.014, 0.0), (-0.010, -0.035), (-0.004, -0.058)]),
            poly_dist(Y, Z, [(-0.010, -0.035), (0.0, -0.045), (0.012, -0.055)]),
            poly_dist(Y, Z, [(0.0, -0.045), (0.004, -0.070)]),
        ])
        vein = gauss(vd, 0.0024) * (0.6 + 0.4 * noise3(P[dors], 120, 5)) * smooth(0.2, 0.55, nd[dors])    # (soft and wide: a vein is a swelling, not a line)
        hgt[dors] += 0.13 * vein
        col[dors] = col[dors] * (1 - 0.03 * vein[:, None]) + np.array([-0.008, 0.0, 0.018]) * vein[:, None]
        # fine hair on the forearm (and a little on the back of the hand), lying toward the wrist
        cell = 0.0026
        gy, gz = np.floor(Y / cell), np.floor(Z / cell)
        hsh = np.sin(gy * 127.1 + gz * 311.7) * 43758.5453
        r1, r2, r3 = hsh - np.floor(hsh), (hsh * 1.7) - np.floor(hsh * 1.7), (hsh * 2.3) - np.floor(hsh * 2.3)
        cy, cz = (gy + r1) * cell, (gz + r2) * cell
        ang = (r3 - 0.5) * 0.7
        ly = (Y - cy) * np.cos(ang) - (Z - cz) * np.sin(ang)
        lz = (Y - cy) * np.sin(ang) + (Z - cz) * np.cos(ang)
        hair = gauss(ly, 0.00012) * gauss(lz, 0.0007) * (r3 > 0.45)
        hair = hair * (smooth(0.0, 0.03, Z) * smooth(0.6, 0.2, r1) + 0.35 * (Z < 0) * (r1 < 0.35))
        col[dors] *= (1 - 0.09 * hair)[:, None]
    # --- mottling, a little everywhere
    mot = noise3(P, 380, 1) * 0.016 + noise3(P, 1240, 2) * 0.009
    col[skin] *= (1 + mot[skin])[:, None] * np.array([1.0, 0.99, 0.985])
    # --- warm shadow in every hollow: the field's own occlusion
    occ = np.zeros(n)
    for i in range(1, 6):
        hh = 0.0024 * i
        occ += (hh - field_chunked(P + N * hh, A)) * 0.6 ** i
    ao = np.clip(1 - 11 * occ, 0, 1)
    ao = 1 - (1 - ao) * (1 - 0.55 * digitness) * (1 - 0.75 * smooth(0.15, 0.6, nd) * smooth(0.0, -0.03, z))
    shade = np.array([0.72, 0.60, 0.56]) * (1 - ao[:, None]) + ao[:, None]
    col[skin] *= shade[skin]
    # --- pores and fine lines from the scan (height only), sampled from three sides by position
    K = 2800 * (1 + 0.3 * noise3(P, 90, 9))          # (detail pixels per metre: the same size all over, give or take)
    tri = np.abs(N) ** 4
    tri /= tri.sum(1, keepdims=True)
    H, Wd = det.shape
    pore = 0
    for (a, b, c), (o1, o2, t) in zip(((0, 1, 2), (1, 2, 0), (2, 0, 1)), ((137, 59, 0.6), (311, 211, 2.1), (83, 401, 4.0))):
        u1 = P[:, b] * math.cos(t) - P[:, c] * math.sin(t)
        u2 = P[:, b] * math.sin(t) + P[:, c] * math.cos(t)
        pore = pore + tri[:, a] * det[((u1 * K + o1) % H).astype(int), ((u2 * K + o2) % Wd).astype(int)]
    hgt[skin] += (0.016 * (1 - 0.7 * smooth(0.0, 0.04, z)) * pore)[skin]
    # --- the sleeve: undyed linen, its weave and its folds
    sl = part == 1
    if sl.any():
        a = np.arctan2(y[sl], x[sl])
        weave = 0.04 * np.sin(a * 260) * np.sin(z[sl] * 4200) + 0.03 * np.sin(z[sl] * 1700 + np.sin(a * 40) * 2)
        fold = 0.1 * np.sin(a * 5 + z[sl] * 55)
        cuff = 1 - 0.35 * smooth(0.275, 0.256, z[sl])
        col[sl] = C(128, 112, 90) * (1 + weave + fold)[:, None] * ((0.75 + 0.25 * ao[sl]) * cuff)[:, None]
        hgt[sl] = 0.5 * weave + 0.4 * fold
        spec[sl] = 0.1
    return np.clip(col, 0, 1), np.clip(0.5 + hgt, 0, 1), np.clip(spec, 0, 1)


def bake(Vb, Nb, UV, F, part_f, A):
    """Paint every texel the triangles cover (positions and normals by barycentrics), then let the
    colours bleed out into the gaps between the islands (so mipmaps don't pull in black)."""
    P = np.zeros((TEX, TEX, 3)); Nm = np.zeros((TEX, TEX, 3)); part = -np.ones((TEX, TEX), int)
    px = UV * TEX - 0.5
    for t in range(len(F)):
        a, b, c = F[t]
        p0, p1, p2 = px[a], px[b], px[c]
        x0, y0 = np.floor(np.minimum.reduce([p0, p1, p2])).astype(int)
        x1, y1 = np.ceil(np.maximum.reduce([p0, p1, p2])).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, TEX - 1), min(y1, TEX - 1)
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        den = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1])
        if abs(den) < 1e-12:
            continue
        l0 = ((p1[1] - p2[1]) * (gx - p2[0]) + (p2[0] - p1[0]) * (gy - p2[1])) / den
        l1 = ((p2[1] - p0[1]) * (gx - p2[0]) + (p0[0] - p2[0]) * (gy - p2[1])) / den
        l2 = 1 - l0 - l1
        eps = 0.6 / max(1.0, math.sqrt(abs(den)))
        m = (l0 >= -eps) & (l1 >= -eps) & (l2 >= -eps)
        if not m.any():
            continue
        L = np.stack([l0[m], l1[m], l2[m]], 1).clip(0, 1)
        L /= L.sum(1, keepdims=True)
        yy, xx = gy[m], gx[m]
        P[yy, xx] = L @ Vb[[a, b, c]]
        Nm[yy, xx] = L @ Nb[[a, b, c]]
        part[yy, xx] = part_f[t]
    cov = part >= 0
    Nm[cov] /= np.linalg.norm(Nm[cov], axis=1, keepdims=True) + 1e-9
    # each skin texel moved onto the field's own surface and given its normal (the triangles are flat:
    # painted from them, occlusion and detail came out in facets)
    Pc, Nc, pc = P[cov], Nm[cov], part[cov]
    sk = pc == 0
    Q = Pc[sk]
    e = 0.0004
    for _ in range(2):
        d = field_chunked(Q, A)
        g = np.stack([field_chunked(Q + e * np.eye(3)[k], A) - field_chunked(Q - e * np.eye(3)[k], A) for k in range(3)], 1)
        g /= np.linalg.norm(g, axis=1, keepdims=True) + 1e-12
        Q = Q - g * d[:, None]
    Pc[sk], Nc[sk] = Q, g
    col = np.zeros((TEX, TEX, 3)); hgt = np.full((TEX, TEX), 0.5); spc = np.zeros((TEX, TEX))
    c, h, sp = paint(Pc, Nc, pc, A)
    col[cov], hgt[cov], spc[cov] = c, h, sp
    _, (iy, ix) = ndimage.distance_transform_edt(~cov, return_indices=True)
    col, hgt, spc = col[iy, ix], hgt[iy, ix], spc[iy, ix]
    # (a texel's softening: no single texel stands out as a bump)
    col = ndimage.gaussian_filter(col, (0.55, 0.55, 0))
    hgt = ndimage.gaussian_filter(hgt, 0.6)
    spc = ndimage.gaussian_filter(spc, 1.0)
    img = lambda a, mode=None: Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), mode)   # noqa: E731
    return img(col), img(hgt, 'L'), img(np.repeat(spc[..., None], 3, 2)), cov.mean()


# ------------------------------------------------------------------ 6. the GLB
def vertex_normals(V, F):
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    Nn = np.zeros_like(V)
    for k in range(3):
        np.add.at(Nn, F[:, k], fn)
    key = np.round(V / 1e-6).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    Nw = np.zeros((inv.max() + 1, 3))
    np.add.at(Nw, inv.ravel(), Nn)
    Nn = Nw[inv.ravel()]
    return Nn / (np.linalg.norm(Nn, axis=1, keepdims=True) + 1e-12)


def write_glb(side, j, V, N, UV, JI, WW, F, ibm, tex, hmap, smap):
    j = json.loads(json.dumps(j))
    j.pop('animations', None)                    # (the moves come from fp_moves_*.glb)
    bufs = bytearray()
    views, accs = [], []

    def add(arr, target, comp, typ, minmax=False):
        while len(bufs) % 4:
            bufs.append(0)
        off = len(bufs)
        data = arr.tobytes()
        bufs.extend(data)
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), **({'target': target} if target else {})})
        a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
        if minmax:
            a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a)
        return len(accs) - 1

    def image(img):
        b = io.BytesIO(); img.save(b, 'PNG')
        while len(bufs) % 4:
            bufs.append(0)
        views.append({'buffer': 0, 'byteOffset': len(bufs), 'byteLength': len(b.getvalue())})
        bufs.extend(b.getvalue())
        return len(views) - 1
    ip = add(V.astype(np.float32), 34962, 5126, 'VEC3', True)
    inn = add(N.astype(np.float32), 34962, 5126, 'VEC3')
    iuv = add(UV.astype(np.float32), 34962, 5126, 'VEC2')
    ij = add(JI, 34962, 5121, 'VEC4')
    iw = add(WW, 34962, 5126, 'VEC4')
    idx = F.reshape(-1).astype(np.uint16 if len(V) < 65536 else np.uint32)
    ii = add(idx, 34963, 5123 if idx.dtype == np.uint16 else 5125, 'SCALAR')
    iib = add(ibm.astype(np.float32), None, 5126, 'MAT4')
    j['bufferViews'] = views
    j['accessors'] = accs
    j['images'] = [{'bufferView': image(tex), 'mimeType': 'image/png', 'name': f'arm_skin_{side}'},
                   {'bufferView': image(hmap), 'mimeType': 'image/png', 'name': f'arm_height_{side}'},
                   {'bufferView': image(smap), 'mimeType': 'image/png', 'name': f'arm_shine_{side}'}]
    j['buffers'] = [{'byteLength': len(bufs)}]
    j['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]
    j['textures'] = [{'sampler': 0, 'source': 0}, {'sampler': 0, 'source': 1}, {'sampler': 0, 'source': 2}]
    # (the height map rides in the occlusion slot: viewmodel.js makes the normal map from it)
    # (and how much it shines, in the metal/rough slot: viewmodel.js takes it for the specular map)
    j['materials'] = [{'name': 'skin', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 0.7,
                                                                'metallicRoughnessTexture': {'index': 2}},
                       'occlusionTexture': {'index': 1}, 'doubleSided': True, 'extras': {'height': 'occlusionTexture', 'shine': 'metallicRoughnessTexture'}}]
    j['meshes'] = [{'name': f'arm_bare_{side} mesh', 'primitives': [{'attributes': {'POSITION': ip, 'NORMAL': inn, 'TEXCOORD_0': iuv, 'JOINTS_0': ij, 'WEIGHTS_0': iw},
                                                                     'indices': ii, 'material': 0}]}]
    j['skins'][0]['inverseBindMatrices'] = iib
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    while len(bufs) % 4:
        bufs.append(0)
    out = (struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bufs)) + struct.pack('<II', len(js), 0x4E4F534A) + js
           + struct.pack('<II', len(bufs), 0x004E4942) + bytes(bufs))
    path = os.path.join(ARMS, f'arm_bare_{side}.glb')
    open(path, 'wb').write(out)
    return path


# ------------------------------------------------------------------ all of it
def build():
    os.makedirs(WORK, exist_ok=True)
    A = anatomy()
    lo, hi = np.array([-0.064, -0.062, -0.188]), np.array([0.047, 0.077, 0.372])
    nx, ny, nz = np.ceil((hi - lo) / GRID).astype(int) + 1
    gx, gy, gz = (lo[k] + np.arange(n) * GRID for k, n in enumerate((nx, ny, nz)))
    G = np.stack(np.meshgrid(gx, gy, gz, indexing='ij'), -1).reshape(-1, 3)
    F = field_chunked(G, A).reshape(nx, ny, nz)
    F[0], F[-1], F[:, 0], F[:, -1], F[:, :, 0], F[:, :, -1] = 1, 1, 1, 1, 1, 1      # (outside at the grid's edges: a closed surface)
    V, T = surface_nets(F, lo, GRID)
    V = taubin(V, T, 8)
    print('surface', len(V), 'vertices', len(T), 'triangles')
    body, cuff, out = (os.path.join(WORK, n) for n in ('body.obj', 'sleeve.obj', 'arm.obj'))
    write_obj(body, V, T)
    write_obj(cuff, *sleeve_mesh())
    r = subprocess.run([BLENDER, '-b', '--factory-startup', '-P', os.path.join(HERE, 'blender_uv.py'), '--', body, cuff, out, str(TRIS)],
                       capture_output=True, text=True)
    if not os.path.exists(out) or r.returncode:
        print(r.stdout[-3000:], r.stderr[-3000:])
        raise SystemExit('blender failed')
    Vo, To, FV, FT, mat = read_obj(out)
    To, FT, K = pack(Vo, FV, To, FT, mat)
    # one vertex for each place-and-UV pair
    pairs, inv = np.unique(np.stack([FV.ravel(), FT.ravel()], 1), axis=0, return_inverse=True)
    Fg = inv.reshape(-1, 3)
    Vb, UV = Vo[pairs[:, 0]], To[pairs[:, 1]]
    Nb = vertex_normals(Vb, Fg)
    vmat = np.zeros(len(Vb), int)
    vmat[Fg[mat == 1].ravel()] = 1
    JI, WW = weights(Vb, A, vmat)
    tex, hmap, smap, cov = bake(Vb, Nb, UV, Fg, mat, A)
    print('hand texels per mm', round(K * TEX / 1000, 2))
    print('mesh', len(Vb), 'vertices', len(Fg), 'triangles; texture used', f'{cov:.0%}')
    tex.save(os.path.join(ARMS, 'arm_bare_texture.png'))
    hmap.save(os.path.join(ARMS, 'arm_bare_height.png'))
    smap.save(os.path.join(ARMS, 'arm_bare_shine.png'))
    for side in ('R', 'L'):
        j, _ = read_glb(os.path.join(BASE, f'arm_bare_{side}.glb'))
        S = np.diag([-1.0, 1, 1, 1]) if side == 'L' else np.eye(4)
        Vs = Vb * S[:3, :3].diagonal()
        Ns = Nb * S[:3, :3].diagonal()
        Fs = Fg[:, ::-1] if side == 'L' else Fg
        names = [j['nodes'][i]['name'] for i in j['skins'][0]['joints']]
        ibm = np.array([np.linalg.inv(S @ A['bind'][n] @ S).T.reshape(-1) for n in names])
        assert names == A['joints']
        print(side, write_glb(side, j, Vs, Ns, UV, JI, WW, Fs, ibm, tex, hmap, smap))
    for old in ('arm_bare_R_texture.png', 'arm_bare_L_texture.png'):
        p = os.path.join(ARMS, old)
        if os.path.exists(p):
            os.remove(p)


if __name__ == '__main__':
    build()
