"""Human first-person arms: templates/models/arms/arm_bare_{R,L}.glb rebuilt as one smooth skinned
body (forearm, wrist and palm lofted as one, each finger and the thumb a tube of their own with
knuckles, pads and a nail, a rolled sleeve over the elbow) on the same skeleton, nodes and socket
as before, so every first-person move drives it unchanged. The fingers are built straight and a
little spread (their bind pose; the rest pose is a fist) so they never fuse into a mitten.

The skin is painted into the UV layout: pore and wrinkle detail taken from the villagers' scanned
head skin (templates/models/creatures/villagers, head_02_Tan_Skin), a lighter, pinker palm, the
back of the hand a shade darker with faint veins, creases across the knuckles, pink fingertips,
nails with a moon and a pale free edge, a linen sleeve.

    python tools/models/hands/make_hands.py            # both sides
    python tools/models/hands/make_hands.py --look     # also preview sheets in art/view/hands/
"""
import io
import json
import math
import os
import struct
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ARMS = os.path.join(ROOT, 'templates', 'models', 'arms')
VILL = os.path.join(ROOT, 'templates', 'models', 'creatures', 'villagers', 'villager_m01.glb')
TEX = 1024


# ------------------------------------------------------------------ glb in and out
def read_glb(path):
    b = open(path, 'rb').read()
    n = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + n])
    off = 20 + n
    bl = struct.unpack_from('<I', b, off)[0]
    return j, b[off + 8:off + 8 + bl]


def accessor(j, bin_, i):
    a = j['accessors'][i]
    bv = j['bufferViews'][a['bufferView']]
    comp = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', 0)
    if stride and stride != n * np.dtype(comp).itemsize:
        rows = [np.frombuffer(bin_, comp, n, o + k * stride) for k in range(a['count'])]
        return np.array(rows)
    return np.frombuffer(bin_, comp, a['count'] * n, o).reshape(a['count'], n)


def trs(n):
    t = np.array(n.get('translation', [0, 0, 0]), float)
    x, y, z, w = n.get('rotation', [0, 0, 0, 1])
    s = np.array(n.get('scale', [1, 1, 1]), float)
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4)
    M[:3, :3] = R * s
    M[:3, 3] = t
    return M


def world(j):
    W = {}

    def walk(i, P):
        M = P @ trs(j['nodes'][i])
        W[j['nodes'][i]['name']] = M
        for c in j['nodes'][i].get('children', []):
            walk(c, M)
    walk(j['scenes'][0]['nodes'][0], np.eye(4))
    return W


def rot_between(a, b):
    """The least rotation (3x3) taking unit a onto unit b."""
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = float(np.dot(a, b))
    if c < -0.9999:
        p = np.cross(a, [1, 0, 0] if abs(a[0]) < 0.9 else [0, 1, 0]); p /= np.linalg.norm(p)
        return 2 * np.outer(p, p) - np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K / (1 + c)


# ------------------------------------------------------------------ the shapes
def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


class Part:
    """A lofted tube: rings of points round a centre line, each ring a superellipse in the line's
    frame (dorsal, radial). uv: u round it (0 at the back of the hand), v along it."""

    def __init__(self, name, around, rect):
        self.name, self.around, self.rect = name, around, rect
        self.rings = []      # (centre, t, dor, rad, shape(theta)->r, weights{joint: w}, s)

    def ring(self, c, t, dor, rad, shape, weights, s):
        self.rings.append((np.array(c, float), t, dor, rad, shape, weights, s))

    def build(self):
        N = self.around
        P, UV, W, F = [], [], [], []
        L = max(1e-6, self.rings[-1][6] - self.rings[0][6])
        for k, (c, t, dor, rad, shape, wts, s) in enumerate(self.rings):
            for i in range(N + 1):           # (the seam doubled: u 0 and 1)
                th = 2 * math.pi * i / N
                r = shape(th)
                P.append(c + dor * math.cos(th) * r[0] + rad * math.sin(th) * r[1])
                u = i / N
                v = (s - self.rings[0][6]) / L
                x0, y0, x1, y1 = self.rect
                UV.append((x0 + (x1 - x0) * u, y0 + (y1 - y0) * v))
                W.append(wts)
        R = len(self.rings)
        for k in range(R - 1):
            for i in range(N):
                a = k * (N + 1) + i; b = a + 1; c2 = a + N + 1; d = c2 + 1
                F.append((a, c2, b)); F.append((b, c2, d))
        return np.array(P), np.array(UV), W, np.array(F)


def superellipse(a_dor, a_pal, a_rad, a_uln, p=2.0, bumps=None):
    """Half-extents toward the back of the hand, the palm, the thumb side and the little-finger
    side; p: 2 an ellipse, higher a rounded rectangle. bumps(theta) adds outward (knuckles)."""
    def f(th):
        c, s = math.cos(th), math.sin(th)
        ax = a_dor if c >= 0 else a_pal
        ay = a_rad if s >= 0 else a_uln
        # superellipse radius along (c, s), as separate scales on the two axes
        k = (abs(c) ** p + abs(s) ** p) ** (-1.0 / p)
        b = bumps(th) if bumps else 0.0
        return (ax * k + b, ay * k + b)
    return f


# ------------------------------------------------------------------ the arm
def make_side(side):
    src = os.path.join(ARMS, f'arm_bare_{side}.glb')
    j, bin_ = read_glb(src)
    W = world(j)
    skin = j['skins'][0]
    joints = [j['nodes'][i]['name'] for i in skin['joints']]
    jidx = {n: k for k, n in enumerate(joints)}
    pos = {n: W[n][:3, 3].copy() for n in W}
    # the old mesh: where each fingertip and the thumb's end were (the distal pieces' far ends)
    prim = j['meshes'][0]['primitives'][0]
    V = accessor(j, bin_, prim['attributes']['POSITION']).astype(float)
    J = accessor(j, bin_, prim['attributes']['JOINTS_0']).astype(int)
    Wt = accessor(j, bin_, prim['attributes']['WEIGHTS_0']).astype(float)
    dom = J[np.arange(len(J)), Wt.argmax(1)]
    def far_end(name):
        sel = V[dom == jidx[name]]
        d = np.linalg.norm(sel - pos[name], axis=1)
        return sel[d.argmax()]
    # the arm's frame: along (toward the fingers), radial (thumb side), dorsal (back of the hand)
    along = pos['hand'] - pos['fore']; along /= np.linalg.norm(along)
    if np.linalg.norm(along) < 0.5 or not np.isfinite(along).all():
        along = np.array([0, 0, -1.0])
    rad = pos['index1'] - pos['pinky1']; rad -= along * np.dot(rad, along); rad /= np.linalg.norm(rad)
    pal = pos['index2'] - pos['index1']; pal -= along * np.dot(pal, along); pal -= rad * np.dot(pal, rad); pal /= np.linalg.norm(pal)
    dor = -pal
    wrist = pos['hand']
    knuck = np.mean([pos[f + '1'] for f in ('index', 'middle', 'ring', 'pinky')], axis=0)
    hand_len = float(np.dot(knuck - wrist, along))     # wrist to the knuckles
    elbow = pos['fore']
    fore_len = float(np.dot(wrist - elbow, along))

    parts, bind = [], {}
    for n in joints:
        bind[n] = W[n].copy()

    # --- the forearm, wrist and palm: one loft from inside the sleeve to past the knuckles
    arm = Part('arm', 28, (0.0, 0.0, 0.5, 1.0))
    yk = {f: float(np.dot(pos[f + '1'] - wrist, rad)) for f in ('index', 'middle', 'ring', 'pinky')}
    def knuckle_bumps(th, amt):
        # bumps on the back of the hand over each knuckle (at their radial positions)
        b = 0.0
        if math.cos(th) > 0:
            for f, y in yk.items():
                ang = math.atan2(y, 0.012)      # where along the back of the hand that knuckle sits
                b += amt * math.exp(-((th - ang) / 0.22) ** 2)
        return b
    steps = 46
    z0, z1 = -fore_len - 0.03, hand_len + 0.010           # (from the elbow, inside the sleeve, to past the knuckles)
    for k in range(steps + 1):
        s = z0 + (z1 - z0) * (k / steps) ** 0.92
        c = wrist + along * s
        if s < 0:                                          # the forearm: wider toward the elbow
            f = min(1, -s / fore_len)
            shape = superellipse(0.0175 + 0.019 * f ** 0.8, 0.0175 + 0.018 * f ** 0.8, 0.0265 + 0.014 * f ** 0.7, 0.0255 + 0.013 * f ** 0.7, 2.0)
        else:                                              # the wrist into the palm: wider, flatter
            f = min(1, s / hand_len)
            g = smooth(0.0, 0.35, f)
            a_dor = 0.0165 - 0.0045 * g + 0.002 * smooth(0.8, 1.0, f)
            a_pal = 0.0175 - 0.0035 * g + 0.001 * math.sin(math.pi * min(1, f * 1.4))   # (the palm's pads)
            a_rad = 0.0265 + 0.010 * g - 0.003 * smooth(0.85, 1.02, f) + 0.004 * math.exp(-((f - 0.35) / 0.22) ** 2)   # (the thenar)
            a_uln = 0.0255 + 0.0095 * g - 0.003 * smooth(0.85, 1.02, f)
            amt = 0.0035 * smooth(0.7, 0.95, f) * (1 - smooth(1.0, 1.12, f))
            shape = superellipse(a_dor, a_pal, a_rad, a_uln, 2.0 + 1.6 * g, (lambda th, amt=amt: knuckle_bumps(th, amt)))
        if s > hand_len:                                   # closing over past the knuckles
            k2 = (s - hand_len) / 0.010
            base = shape
            shape = (lambda th, base=base, k2=k2: tuple(x * math.sqrt(max(0.05, 1 - k2 ** 2)) for x in base(th)))
        # weights: the elbow into the sleeve, the wrist between forearm and hand
        if s < -fore_len + 0.03:
            w = {'upper': 1 - smooth(-fore_len - 0.03, -fore_len + 0.03, s), 'fore': smooth(-fore_len - 0.03, -fore_len + 0.03, s)}
        else:
            h = smooth(-0.014, 0.014, s)
            w = {'fore': 1 - h, 'hand': h}
        arm.ring(c, along, dor, rad, shape, w, s)
    parts.append(arm)

    # --- the sleeve: a rolled linen sleeve from the shoulder down over the elbow
    sleeve = Part('sleeve', 24, (0.5, 0.0, 0.75, 0.5))
    for k in range(18):
        s = -fore_len - 0.31 + 0.36 * k / 17
        c = wrist + along * s
        roll = 0.006 * smooth(0.82, 1.0, k / 17) * (1 - smooth(0.97, 1.0, k / 17))     # (the rolled cuff)
        rr = 0.045 + roll - 0.004 * smooth(0.9, 1.0, k / 17)
        folds = (lambda th, s=s: 0.0018 * math.sin(th * 5 + s * 40) + 0.0012 * math.sin(th * 9 - s * 70))
        shape = superellipse(rr, rr, rr * 1.02, rr * 1.02, 2.0, folds)
        e = -fore_len
        w = {'upper': smooth(e - 0.02, e + 0.04, -s) if False else 1 - smooth(e - 0.03, e + 0.03, s), 'fore': smooth(e - 0.03, e + 0.03, s)}
        sleeve.ring(c, along, dor, rad, shape, w, s)
    parts.append(sleeve)

    # --- the fingers: straight, a little spread; knuckled, padded, nailed
    FING = [('index', 0.0096, 0.07), ('middle', 0.0100, 0.0), ('ring', 0.0094, -0.06), ('pinky', 0.0082, -0.15)]
    col = 0
    nails = []
    for name, r0, splay in FING:
        p1, p2, p3 = pos[name + '1'], pos[name + '2'], pos[name + '3']
        tip_old = far_end(name + '3')
        L1, L2 = np.linalg.norm(p2 - p1), np.linalg.norm(p3 - p2)
        L3 = max(0.75 * L2, np.linalg.norm(tip_old - p3) - 0.004)
        d = along + rad * splay; d /= np.linalg.norm(d)
        q1 = p1.copy(); q2 = q1 + d * L1; q3 = q2 + d * L2; tip = q3 + d * L3
        # bind matrices: each piece turned from its place in the fist to the straight finger
        for jn, a, q in ((name + '1', p2 - p1, q1), (name + '2', p3 - p2, q2), (name + '3', tip_old - p3, q3)):
            R = rot_between(a, d)
            M = np.eye(4); M[:3, :3] = R; M[:3, 3] = q
            bind[jn] = M
        fdor = dor - d * np.dot(dor, d); fdor /= np.linalg.norm(fdor)
        frad = np.cross(d, fdor) * (1 if np.dot(np.cross(d, fdor), rad) > 0 else -1)
        part = Part(name, 14, (0.5 + 0.1 * col, 0.5, 0.5 + 0.1 * (col + 1), 1.0))
        col += 1
        total = L1 + L2 + L3
        start = -0.006
        n = 34
        for k in range(n + 1):
            s = start + (total - start) * k / n
            c = q1 + d * s
            # thickness along it: knuckle bulges at the joints, slimmer between, the pad, the tip round
            j1, j2 = L1, L1 + L2
            r = r0 * (1.0 - 0.10 * smooth(0, total, s) - 0.05 * smooth(j2, total, s))
            r *= 1 + 0.07 * math.exp(-((s - j1) / 0.004) ** 2) + 0.05 * math.exp(-((s - j2) / 0.0035) ** 2) - 0.04 * math.exp(-((s - (j1 + j2) / 2) / 0.006) ** 2)
            if s > total - r0:                         # the round of the tip
                e = (s - (total - r0)) / r0
                r *= math.sqrt(max(0.0, 1 - min(1, e) ** 2)) if e < 1 else 0.0
            if s < 0:
                r *= 1.0
            pad = 0.0012 * math.exp(-((s - (j2 + 0.55 * L3)) / 0.006) ** 2)
            shape = superellipse(r * 0.86, r * 0.92 + pad, r * 1.02, r * 1.02, 2.15)
            # weights: the hand at the base, each phalanx, blended across its joints
            def ramp(x, at, h=0.0045):
                return smooth(at - h, at + h, x)
            a = ramp(s, 0.0, 0.006); b = ramp(s, j1); cc = ramp(s, j2)
            w = {'hand': 1 - a, name + '1': a * (1 - b), name + '2': b * (1 - cc), name + '3': cc}
            part.ring(c, d, fdor, frad, shape, w, s)
        parts.append(part)
        nails.append((name, q3, d, fdor, L3, r0))
    # --- the thumb: along its own chain (as it lies), metacarpal to tip
    t1, t2, t3 = pos['thumb1'], pos['thumb2'], pos['thumb3']
    ttip = far_end('thumb3')
    chain = [t1 - (t2 - t1) * 0.25, t1, t2, t3, ttip]
    lens = np.cumsum([0] + [np.linalg.norm(chain[i + 1] - chain[i]) for i in range(4)])
    thumb = Part('thumb', 14, (0.5 + 0.1 * col, 0.5, 0.5 + 0.1 * (col + 1), 1.0))
    total = lens[-1]
    n = 34
    for k in range(n + 1):
        s = total * k / n
        i = min(3, int(np.searchsorted(lens, s, side='right') - 1))
        f = (s - lens[i]) / max(1e-6, lens[i + 1] - lens[i])
        c = chain[i] + (chain[i + 1] - chain[i]) * f
        t = chain[i + 1] - chain[i]; t /= np.linalg.norm(t)
        tdor = dor - t * np.dot(dor, t); tdor /= np.linalg.norm(tdor)
        trad = np.cross(t, tdor)
        jm, jp, ji = lens[1], lens[2], lens[3]
        r = 0.0128 - 0.0030 * smooth(jm, total, s)
        r *= 1 + 0.06 * math.exp(-((s - jp) / 0.005) ** 2) + 0.05 * math.exp(-((s - ji) / 0.004) ** 2)
        if s < 0.006:
            r *= 0.85 + 0.15 * s / 0.006
        if s > total - 0.0095:
            e = (s - (total - 0.0095)) / 0.0095
            r *= math.sqrt(max(0.0, 1 - min(1, e) ** 2))
        shape = superellipse(r * 0.86, r * 0.95, r, r, 2.15)
        a = smooth(jm - 0.008, jm + 0.002, s); b = smooth(jp - 0.004, jp + 0.004, s); cc = smooth(ji - 0.004, ji + 0.004, s)
        h0 = 1 - smooth(lens[1] * 0.4, lens[1] + 0.004, s)
        w = {'hand': h0, 'thumb1': (1 - h0) * (1 - b), 'thumb2': b * (1 - cc), 'thumb3': cc}
        thumb.ring(c, t, tdor, trad, shape, w, s)
    parts.append(thumb)
    nails.append(('thumb', t3, (ttip - t3) / np.linalg.norm(ttip - t3), None, np.linalg.norm(ttip - t3), 0.0105))

    # ------------------------------------------------------------------ assemble
    Ps, UVs, Ws, Fs, base = [], [], [], [], 0
    for p in parts:
        P, UV, Wl, F = p.build()
        Ps.append(P); UVs.append(UV); Ws.extend(Wl); Fs.append(F + base); base += len(P)
    P = np.vstack(Ps); UV = np.vstack(UVs); F = np.vstack(Fs)
    # normals (welded across the seams for the shading)
    fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    N = np.zeros_like(P)
    for k in range(3):
        np.add.at(N, F[:, k], fn)
    key = np.round(P / 1e-5).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    Nw = np.zeros((inv.max() + 1, 3)); np.add.at(Nw, inv, N); N = Nw[inv]
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    # (degenerate tip rings: drop their zero-area faces)
    good = np.linalg.norm(fn, axis=1) > 1e-14
    F = F[good]
    # weights: the four strongest, normalised
    JI = np.zeros((len(P), 4), np.uint8); WW = np.zeros((len(P), 4), np.float32)
    for v, wd in enumerate(Ws):
        items = sorted(((jidx[k], x) for k, x in wd.items() if x > 1e-4 and k in jidx), key=lambda t: -t[1])[:4]
        tot = sum(x for _, x in items) or 1
        for m, (ji, x) in enumerate(items):
            JI[v, m] = ji; WW[v, m] = x / tot
    ibm = np.array([np.linalg.inv(bind[n]).T.reshape(-1) for n in joints], np.float32)   # (column-major)
    return dict(j=j, P=P.astype(np.float32), N=N.astype(np.float32), UV=UV.astype(np.float32), F=F.astype(np.uint32),
                J=JI, W=WW, ibm=ibm, parts=parts, nails=nails, frame=(along, rad, dor), wrist=wrist, hand_len=hand_len, fore_len=fore_len)


# ------------------------------------------------------------------ the skin
def scan_detail():
    """A tileable patch of real skin detail (pores, fine lines) from the villagers' scanned head."""
    j, bin_ = read_glb(VILL)
    img = None
    for im in j['images']:
        if im.get('name', '').startswith('head_'):
            bv = j['bufferViews'][im['bufferView']]
            img = Image.open(io.BytesIO(bin_[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGB')
            break
    S = img.size[0] / 2048
    # (the forehead and cheek of the scan: bare skin, no brows, no beard)
    box = tuple(int(v * S) for v in (650, 760, 850, 1250))
    patch = img.crop(box).rotate(90, expand=True).resize((512, 256), Image.BICUBIC)
    a = np.asarray(patch, np.float32) / 255
    lum = a.mean(2)
    blur = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10)), np.float32) / 255
    det = lum - blur                                          # the detail alone
    det = np.concatenate([det, det[:, ::-1]], 1); det = np.concatenate([det, det[::-1]], 0)   # (mirrored: it tiles)
    tone = a.reshape(-1, 3)[lum.reshape(-1) > np.percentile(lum, 40)].mean(0)
    return det, tone


def paint(side, M, look=False):
    det, tone = scan_detail()
    H, Wd = det.shape
    img = np.zeros((TEX, TEX, 3), np.float32)
    yy, xx = np.mgrid[0:TEX, 0:TEX]
    U = (xx + 0.5) / TEX; Vv = (yy + 0.5) / TEX
    base = np.array(tone, np.float32) * np.array([1.02, 0.97, 0.95])
    def detail(su, sv, scale=1.0):
        i = ((sv * 900 * scale) % H).astype(int); k = ((su * 900 * scale) % Wd).astype(int)
        return det[i, k]
    for p in M['parts']:
        x0, y0, x1, y1 = p.rect
        m = (U >= x0) & (U < x1) & (Vv >= y0) & (Vv < y1)
        if not m.any():
            continue
        u = (U[m] - x0) / (x1 - x0); v = (Vv[m] - y0) / (y1 - y0)
        th = u * 2 * np.pi
        dorsal = np.cos(th)                    # 1 the back of the hand, -1 the palm
        rings = p.rings
        s0, s1 = rings[0][6], rings[-1][6]
        s = s0 + v * (s1 - s0)
        # metres round and along, for the detail's scale
        circ = 2 * np.pi * 0.02 if p.name in ('arm', 'sleeve') else 2 * np.pi * 0.0095
        su, sv = u * circ, s
        if p.name == 'sleeve':
            weave = 0.04 * np.sin(su * 2400) * np.sin(sv * 2400) + 0.03 * np.sin(sv * 260 + np.sin(su * 90) * 2)
            c = np.array([0.43, 0.36, 0.27]) * (1 + weave[:, None]) * (0.85 + 0.15 * (1 - smooth(-0.3, 0.3, -dorsal))[:, None])
            img[m] = c
            continue
        col = np.tile(base, (len(u), 1))
        palm = smooth(0.1, -0.7, dorsal)[:, None]
        col = col * (1 - palm) + (col * np.array([1.12, 1.02, 0.98]) + np.array([0.04, 0.0, 0.0])) * palm   # palm lighter, pinker
        col *= (1 - 0.07 * smooth(0.2, 0.9, dorsal))[:, None]                 # the back a shade darker
        d = detail(su, sv) * (0.9 + 0.6 * palm[:, 0])
        col *= (1 + 2.4 * d)[:, None]
        if p.name == 'arm':
            # faint veins up the back of the hand and wrist, the knuckles ruddy, the palm's creases
            hl = M['hand_len']
            vein = np.exp(-((np.sin(su * 60 + np.sin(sv * 30) * 1.5)) / 0.08) ** 2) * smooth(0.3, 0.9, dorsal) * smooth(-0.08, 0.0, s) * (1 - smooth(hl * 0.7, hl * 0.9, s))
            col = col * (1 - 0.10 * vein[:, None]) + np.array([0.0, 0.01, 0.04]) * vein[:, None]
            kn = smooth(hl * 0.82, hl * 0.95, s) * smooth(0.4, 0.9, dorsal)
            col = col * (1 - 0.06 * kn[:, None]) + np.array([0.05, 0.0, 0.0]) * kn[:, None]
            crease = palm[:, 0] * (np.exp(-((s - hl * 0.55 - 0.004 * np.sin(su * 80)) / 0.0012) ** 2) + np.exp(-((s - hl * 0.75 + 0.003 * np.sin(su * 60)) / 0.0011) ** 2)) * smooth(0, hl * 0.3, s)
            col *= (1 - 0.22 * crease)[:, None]
            wristc = np.exp(-((s - 0.006) / 0.0012) ** 2) * palm[:, 0]
            col *= (1 - 0.18 * wristc)[:, None]
            hair = (detail(su * 7, sv * 0.4, 1) > 0.035) * smooth(0.0, 0.6, dorsal) * smooth(-M['fore_len'] * 0.9, -0.03, -s * 0 + s) * (s < -0.02)
            col *= (1 - 0.10 * hair)[:, None]
        else:
            # a finger: creases across its joints, its pad pinker, the nail
            L = [r[6] for r in rings]
            name = p.name
            if name != 'thumb':
                q = M['nails'][[n[0] for n in M['nails']].index(name)]
                L3 = q[4]
                total = s1
                j2 = total - L3
                j1 = j2 - np.linalg.norm(M['parts'][0].rings[0][0] * 0 + 1) * 0  # (placeholder)
            else:
                total = s1
                L3 = M['nails'][-1][4]
                j2 = total - L3
            for at in (j2, j2 - (total - L3) * 0.48):
                cr = np.exp(-((s - at) / 0.0011) ** 2) + 0.6 * np.exp(-((s - at - 0.0022) / 0.0009) ** 2) + 0.6 * np.exp(-((s - at + 0.0022) / 0.0009) ** 2)
                col *= (1 - 0.20 * cr * (0.4 + 0.6 * np.abs(dorsal)))[:, None]
            tipred = smooth(total - L3 * 0.7, total, s)
            col = col * (1 - 0.10 * tipred[:, None]) + np.array([0.08, 0.01, 0.01]) * tipred[:, None]
            # the nail: on the back of the last joint, from a third of the way along nearly to the tip
            nu = np.abs(np.angle(np.exp(1j * th))) / 0.85            # 0 at its middle, 1 at its sides
            nv = (s - (j2 + L3 * 0.30)) / (L3 * 0.62)
            nail = (nu < 1) & (nv > 0) & (nv < 1)
            if nail.any():
                edge = smooth(0.82, 0.95, nv) * nail
                moon = (np.hypot(nu * 0.9, (nv - 0.0) / 0.35) < 1) * nail
                ncol = np.array([0.86, 0.66, 0.60]) * (1 + 0.6 * detail(su * 3, sv * 3)[:, None])
                ncol = ncol * (1 - edge[:, None]) + np.array([0.93, 0.88, 0.80]) * edge[:, None]
                ncol = ncol * (1 - 0.6 * moon[:, None]) + np.array([0.92, 0.80, 0.76]) * 0.6 * moon[:, None]
                rim = nail & ((nu > 0.86) | (nv < 0.06))
                ncol[rim] *= 0.78
                col[nail] = ncol[nail]
        img[m] = col
    img = np.clip(img, 0, 1)
    # (bleed the colours out past each part's edge, so mipmaps don't pick up the black between)
    out = Image.fromarray((img * 255).astype(np.uint8))
    return out


def write_glb(side, M, tex):
    j = json.loads(json.dumps(M['j']))
    bufs = bytearray()
    views, accs = [], []
    def add(arr, target, comp, typ, minmax=False):
        nonlocal bufs
        while len(bufs) % 4: bufs.append(0)
        off = len(bufs); data = arr.tobytes(); bufs += data
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), **({'target': target} if target else {})})
        a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
        if minmax:
            a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a)
        return len(accs) - 1
    ip = add(M['P'], 34962, 5126, 'VEC3', True)
    inn = add(M['N'], 34962, 5126, 'VEC3')
    iuv = add(M['UV'], 34962, 5126, 'VEC2')
    ij = add(M['J'], 34962, 5121, 'VEC4')
    iw = add(M['W'], 34962, 5126, 'VEC4')
    idx = M['F'].reshape(-1).astype(np.uint32 if len(M['P']) > 65535 else np.uint16)
    ii = add(idx, 34963, 5125 if idx.dtype == np.uint32 else 5123, 'SCALAR')
    iib = add(M['ibm'], None, 5126, 'MAT4')
    b = io.BytesIO(); tex.save(b, 'PNG'); png = b.getvalue()
    while len(bufs) % 4: bufs.append(0)
    views.append({'buffer': 0, 'byteOffset': len(bufs), 'byteLength': len(png)}); bufs += png
    j['bufferViews'] = views; j['accessors'] = accs
    j['buffers'] = [{'byteLength': len(bufs)}]
    j['images'] = [{'bufferView': len(views) - 1, 'mimeType': 'image/png', 'name': f'arm_skin_{side}'}]
    j['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]
    j['textures'] = [{'sampler': 0, 'source': 0}]
    j['materials'] = [{'name': 'skin', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 0.7}, 'doubleSided': True}]
    j['meshes'] = [{'name': f'arm_bare_{side} mesh', 'primitives': [{'attributes': {'POSITION': ip, 'NORMAL': inn, 'TEXCOORD_0': iuv, 'JOINTS_0': ij, 'WEIGHTS_0': iw}, 'indices': ii, 'material': 0}]}]
    j['skins'][0]['inverseBindMatrices'] = iib
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    while len(bufs) % 4: bufs.append(0)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bufs)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bufs), 0x004E4942) + bytes(bufs)
    path = os.path.join(ARMS, f'arm_bare_{side}.glb')
    open(path, 'wb').write(out)
    return path, len(M['F'])


if __name__ == '__main__':
    look = '--look' in sys.argv
    for side in ('R', 'L'):
        M = make_side(side)
        tex = paint(side, M, look)
        tex.save(os.path.join(ARMS, f'arm_bare_{side}_texture.png'))
        path, tris = write_glb(side, M, tex)
        print(side, path, tris, 'triangles,', len(M['P']), 'vertices')
