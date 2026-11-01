"""Lays a beast man's surface onto its painted sheet (1254 px square, pixel coords, y down).

Each sheet has its own LAYOUT. Limbs, horns, ears and the tail are painted as curved strips, so
they are mapped along each strip's own measured centre line and width (prep_beast.py writes
those profiles): height (or length along the part) picks the row, the angle round the part picks
how far across. Positions come in T-space (arms laid out straight, sdf.unbend) on the widened rig.
  head   face panel (a picture, projected from in front) / back-of-head panel
  torso  chest panel in front, back panel behind (each wraps to the flanks)
  arms   one full-circumference strip each, shoulder to fingertips; the palm at its foot
  hands  back of the hand and the fingers on the separate hand panels
  legs   fronts down the front strips, backs down the back strips, thigh to hoof; hoof soles
  mouth  the painted mouth
"""
import os

import numpy as np

import sdf

SIZE = 1254
HEAD, TORSO, ARM, PALM, FINGER, THIGH, SHIN, FOOT, MOUTH = range(9)
FNAMES = ("index", "middle", "ring", "pinky", "thumb")
XL = sdf.HIP_X
W = sdf.WIDEN_ARM


def _hx(x):
    return sdf.WRIST_X + (x - sdf.WRIST_X) * sdf.HAND_S
FINGER_S = {"index": -0.72, "middle": -0.24, "ring": 0.24, "pinky": 0.7, "thumb": -1.0}   # where each painted finger lies across its hand
FINGER_W = 0.2

GOAT_L = dict(
    face=dict(cx=276, K=150, yoff=0.06 * sdf.HEAD_S, half=185, v_eye=157, z_eye=sdf.EYE[2], kv=720 / sdf.HEAD_S, k_up=125, v_min=46, v_max=286, back_deg=80),
    back=dict(cx=757, k=100, half=150, v_ref=118, z_ref=sdf.EYE[2], kv=950 / sdf.HEAD_S, k_up=57, v_min=24, v_max=266),
    chest=dict(seed=(541, 500), z=[0.82, 0.92, 1.08, 1.33, 1.47, 1.56], v=[770, 690, 571, 440, 290, 250]),
    backp=dict(seed=(898, 500), z=[0.8, 0.92, 1.08, 1.36, 1.47, 1.58], v=[770, 690, 560, 380, 300, 244]),
    arm={-1: (70, 450), 1: (1110, 450)},
    arm_a=[sdf.SHOULDER[0], sdf.ELBOW_X, sdf.WRIST_X, _hx(1.0 + W)], arm_v=[284, 530, 695, 842],
    hand={1: (145, 690), -1: (240, 690)},            # back of hand panels (thumb at the outer edge)
    hand_a=[sdf.WRIST_X, _hx(0.835 + W), _hx(1.0 + W)], hand_v=[606, 690, 774],
    leg_f={-1: (415, 900), 1: (645, 900)}, leg_b={1: (790, 900), -1: (1000, 900)},
    leg_z=[0.0, 0.088, 0.16, 0.535, 0.88], leg_vf=[1242, 1178, 1130, 930, 706], leg_vb=[1242, 1178, 1130, 930, 718],
    sole={-1: (1117, 1163), 1: (1209, 1175)},
    mouth=dict(cx=568, cy=200, k=1500),
    ear={-1: dict(seed=(80, 190), base=(134, 222), tip=(10, 132), hw=40),
         1: dict(seed=(470, 185), base=(414, 208), tip=(518, 160), hw=36)},
    horn=dict(seed=(1095, 60)),
    tail=dict(seed=(724, 560)),
    beard=dict(cx=276, v0=266, v1=322, hw_v=[266, 300, 322], hw=[44, 21, 7]),
)
L = {"goat": GOAT_L}[sdf.SPECIES]

# strip profiles: name -> (first row, centre per row, half width per row); prep_beast.py
PROF = {}


def strips():
    """(name, seed, axis) for every strip-mapped island; axis 0 = rows (top to bottom), 1 = columns."""
    out = [("face", (L["face"]["cx"], L["face"]["v_eye"]), 0), ("hback", (L["back"]["cx"], L["back"]["v_ref"]), 0),
           ("chest", L["chest"]["seed"], 0), ("backp", L["backp"]["seed"], 0), ("horn", L["horn"]["seed"], 0),
           ("tail", L["tail"]["seed"], 0)]
    for s in (-1, 1):
        out += [("arm%+d" % s, L["arm"][s], 0), ("hand%+d" % s, L["hand"][s], 0),
                ("legf%+d" % s, L["leg_f"][s], 0), ("legb%+d" % s, L["leg_b"][s], 0)]
    return out


def load(tex):
    z = np.load(os.path.join(tex, "beast_profiles.npz"))
    for k in z.files:
        if k.endswith("_c"):
            n = k[:-2]
            PROF[n] = (int(z[n + "_r0"]), z[n + "_c"].astype(float), z[n + "_h"].astype(float))


def strip_u(name, v, s, inset=0.94):
    r0, c, h = PROF[name]
    i = np.clip(np.round(v).astype(int) - r0, 0, len(c) - 1)
    return c[i] + np.clip(s, -1.0, 1.0) * h[i] * inset


def _half(name, v):
    r0, c, h = PROF[name]
    return np.maximum(h[np.clip(np.round(v).astype(int) - r0, 0, len(h) - 1)], 8.0)


def _seg_dist(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1), t


def finger_param(m, name):
    """Distance to a finger's bone polyline (claw included) and the arc parameter (0 knuckle .. 1 tip)."""
    pts = np.array(list(sdf.finger_pts(name)) + [sdf.claw(name)[1]])
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    best = np.full(len(m), 1e9); s = np.zeros(len(m)); axis = np.zeros_like(m)
    for j in range(len(pts) - 1):
        d, t = _seg_dist(m, pts[j], pts[j + 1])
        ab = pts[j + 1] - pts[j]
        traw = ((m - pts[j]) @ ab) / (ab @ ab)
        if j == 0:
            t = np.minimum(traw, 1.0)
        better = d < best
        best = np.where(better, d, best)
        s = np.where(better, cum[j] + t * seg[j], s)
        axis = np.where(better[:, None], pts[j] + np.clip(t, 0, 1)[:, None] * ab, axis)
    return best, s / cum[-1], axis


def _head_back(p):
    dx = p[:, 0]; dy = p[:, 1] - 0.0; dz = p[:, 2] - L["face"]["z_eye"]
    psi = np.arctan2(np.hypot(dx, np.maximum(dz, 0)), -dy)
    return psi > np.radians(L["face"].get("back_deg", 97))   # the crown goes to the back-of-head panel


def leg_axis_y(z):
    return np.interp(z, [0.0, 0.09, 0.16, 0.535, 1.0], [sdf.HOOF_Y, sdf.HOOF_Y + 0.01, 0.03, 0.0, 0.0])


def classify(c):
    x, y, z = c[:, 0], c[:, 1], c[:, 2]
    a = np.abs(x)
    m = c.copy(); m[:, 0] = a
    reg = np.full(len(c), TORSO); sub = np.zeros(len(c), int)
    leg = (z < 0.86) & (a > 0.015)
    reg[leg] = np.where(z[leg] >= 0.535, THIGH, SHIN)
    reg[(z < 0.092) & (a > 0.02)] = FOOT
    head = ((z > 1.52) & (y < 0.0)) | (z > 1.6) | ((z > 1.56) & (y < 0.05) & (a < 0.07))
    reg[head] = HEAD
    arm = (a > 0.205) & (z > 1.28)
    reg[arm] = ARM
    hand = (a > sdf.WRIST_X + 0.005) & (z > 1.28)
    reg[hand] = PALM
    hi = np.where(hand)[0]
    if len(hi):
        mh = m[hi]
        bestd = np.full(len(hi), 1e9); bestf = np.full(len(hi), -1)
        for k, name in enumerate(FNAMES):
            d, t, _ = finger_param(mh, name)
            ok = (d < sdf.FINGER_R[name] * 1.7) & (t > (0.02 if name != "thumb" else 0.25)) & (d < bestd)
            bestd = np.where(ok, d, bestd); bestf = np.where(ok, k, bestf)
        f = bestf >= 0
        reg[hi[f]] = FINGER
        sub[hi[f]] = bestf[f] * 2
    q = (c - np.array(sdf.MOUTH_C)) / (np.array(sdf.MOUTH_R) * [1.2, 1.0, 1.7])
    reg[(np.linalg.norm(q, axis=1) < 1) & (y > sdf.MOUTH_IN)] = MOUTH
    hd = reg == HEAD
    sub[hd] = _head_back(c[hd]).astype(int)
    k = reg == TORSO
    split = np.where(z > 1.35, 0.075, 0.02)                           # shoulder ridge belongs to the chest panel
    sub[k] = (y[k] - split[k] > 0).astype(int)                        # 0 chest, 1 back
    for r in (THIGH, SHIN, FOOT):
        k = reg == r
        sub[k] = (y[k] - leg_axis_y(z[k]) > 0).astype(int)
    k = reg == FOOT
    sub[k & (z < 0.0035)] = 2                                         # hoof sole
    k = reg == PALM
    sub[k] = (z[k] < 1.441).astype(int)
    return reg, sub


def head_uv(p, back):
    F, B = L["face"], L["back"]
    u = np.zeros(len(p)); v = np.zeros(len(p))
    f = ~back
    x = p[f, 0]; dy = -p[f, 1] + F["yoff"]; dz = p[f, 2] - F["z_eye"]
    psi = np.arctan2(np.hypot(x, dz), dy); hz = np.hypot(x, dz) + 1e-9
    up = dz > 0
    du = np.where(up, F["K"] * psi * x / hz, F["K"] * np.arctan2(x, dy))
    vf = np.clip(np.where(up, F["v_eye"] - F["k_up"] * psi * dz / hz, F["v_eye"] - dz * F["kv"]), F["v_min"], F["v_max"])
    H = np.minimum(F["half"], 0.93 * _half("face", vf))
    u[f] = F["cx"] + H * np.tanh(du / H)                               # the sides crowd into the painted face's edge
    v[f] = np.clip(np.where(up, F["v_eye"] - F["k_up"] * psi * dz / hz, F["v_eye"] - dz * F["kv"]), F["v_min"], F["v_max"])
    b = back
    x = p[b, 0]; dy = p[b, 1]; dz = p[b, 2] - B["z_ref"]
    psi = np.arctan2(np.hypot(x, dz), dy); hz = np.hypot(x, dz) + 1e-9
    up = dz > 0
    du = np.where(up, -B["k"] * psi * x / hz, -B["k"] * np.arctan2(x, dy))
    vb = np.clip(np.where(up, B["v_ref"] - B["k_up"] * psi * dz / hz, B["v_ref"] - dz * B["kv"]), B["v_min"], B["v_max"])
    H = np.minimum(B["half"], 0.93 * _half("hback", vb))
    u[b] = B["cx"] + H * np.tanh(du / H)
    v[b] = np.clip(np.where(up, B["v_ref"] - B["k_up"] * psi * dz / hz, B["v_ref"] - dz * B["kv"]), B["v_min"], B["v_max"])
    return u, v


def corner_uv(P, reg, sub, nrm):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    a = np.abs(x); side = np.where(x < 0, -1, 1)
    u = np.zeros(len(P)); v = np.zeros(len(P))

    k = reg == HEAD
    u[k], v[k] = head_uv(P[k], sub[k] == 1)

    # torso: chest panel in front, back panel behind, across by the angle round the body
    k = reg == TORSO
    sel = k & (sub == 0)
    C = L["chest"]
    v[sel] = np.interp(z[sel], C["z"], C["v"])
    u[sel] = strip_u("chest", v[sel], np.arctan2(x, -(y - 0.02))[sel] / (np.pi / 2), 0.97)
    sel = k & (sub == 1)
    C = L["backp"]
    v[sel] = np.interp(z[sel], C["z"], C["v"])
    u[sel] = strip_u("backp", v[sel], -np.arctan2(x, (y - 0.02))[sel] / (np.pi / 2), 0.97)

    # arms: full-circumference strips; the strip's middle is the front of the arm, turning to
    # the palm side down the forearm
    k = reg == ARM
    ang = np.arctan2(-(z - 1.441), -(y - 0.066))
    cen = np.interp(a, [sdf.ELBOW_X, sdf.WRIST_X], [0.0, np.pi / 2])
    th = np.angle(np.exp(1j * (ang - cen)))
    for sd in (-1, 1):
        sel = k & (side == sd)
        v[sel] = np.interp(a[sel], L["arm_a"], L["arm_v"])
        u[sel] = strip_u("arm%+d" % sd, v[sel], sd * th[sel] / np.pi, 0.96)

    # hands: the back of the hand and the tops of the fingers from the hand panels, the palm and
    # the undersides from the foot of the arm strips; each finger unrolled round its own bone
    # (top in the middle of its painted finger, the sides at its edges)
    across = np.zeros(len(P)); top = np.ones(len(P), bool)
    k = reg == PALM
    across[k] = (y[k] - (0.065 + 0.005 * sdf.HAND_S)) / (0.05 * sdf.HAND_S)
    top[k] = sub[k] == 0
    m = P.copy(); m[:, 0] = a
    for fi, name in enumerate(FNAMES):
        sel = (reg == FINGER) & (sub // 2 == fi)
        if not sel.any():
            continue
        _, _, ax = finger_param(m[sel], name)
        rel = m[sel] - ax
        ang = np.arctan2(rel[:, 1], rel[:, 2])                 # 0 on top, +pi/2 toward the little finger
        up = np.abs(ang) <= np.pi / 2
        unroll = np.where(up, ang, np.sign(ang) * (np.pi - np.abs(ang))) / (np.pi / 2)
        across[sel] = FINGER_S[name] + FINGER_W * unroll
        top[sel] = up
    hands = (reg == PALM) | (reg == FINGER)
    for sd in (-1, 1):
        sel = hands & (side == sd) & ~top
        v[sel] = np.interp(a[sel], [sdf.WRIST_X, _hx(1.0 + W)], [695, 842])
        u[sel] = strip_u("arm%+d" % sd, v[sel], -sd * across[sel], 0.9)
        sel = hands & (side == sd) & top
        v[sel] = np.interp(a[sel], L["hand_a"], L["hand_v"])
        u[sel] = strip_u("hand%+d" % sd, v[sel], sd * across[sel], 0.92)

    # legs, thigh to hoof: fronts down the front strips, backs down the back strips
    ya = leg_axis_y(z)
    for sd in (-1, 1):
        xl = x - sd * XL; dy = y - ya
        sel = ((reg == THIGH) | (reg == SHIN) | (reg == FOOT)) & (side == sd)
        fr = sel & (sub == 0); bk = sel & (sub == 1)
        v[fr] = np.interp(z[fr], L["leg_z"], L["leg_vf"])
        u[fr] = strip_u("legf%+d" % sd, v[fr], np.arctan2(xl, -dy)[fr] / (np.pi / 2), 0.96)
        v[bk] = np.interp(z[bk], L["leg_z"], L["leg_vb"])
        u[bk] = strip_u("legb%+d" % sd, v[bk], -np.arctan2(xl, dy)[bk] / (np.pi / 2), 0.96)
        so = sel & (sub == 2)
        cx, cy = L["sole"][sd]
        u[so] = cx + xl[so] * 800
        v[so] = cy + (y[so] - (sdf.HOOF_Y - 0.004)) * 1300

    k = reg == MOUTH
    G = L["mouth"]
    u[k] = G["cx"] + x[k] * G["k"]
    v[k] = G["cy"] - (z[k] - sdf.MOUTH_C[2]) * G["k"] * 6
    return u, v


def ear_uv(t, w, side):
    """Ear surface by length (0 root .. 1 tip) and across (-1 .. 1) onto the painted ear."""
    E = L["ear"][side]
    b = np.array(E["base"], float); tp = np.array(E["tip"], float)
    d = tp - b; n = np.array([-d[1], d[0]]) / np.linalg.norm(d)
    if n[1] > 0:                                   # +w (up the ear) goes up the picture
        n = -n
    hw = E["hw"] * (1 - t) ** 0.8 + 4
    q = b + t[:, None] * d + (w * hw)[:, None] * n
    return q[:, 0], q[:, 1]
