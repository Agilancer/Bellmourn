"""Lays the zombie's surface onto the painted sheet (1254 px square, pixel coordinates, y down).

Every body part is projected onto the island painted for it, landmarks pinned to the paint:
  head  front panel (face, ears at the sides) / back panel (skull, nape); seam just behind the ears
        and over the crown. Below eye level: cylinder + height. Above: an azimuthal projection
        that wraps the forehead and crown without a pole.
  torso front / back panels, split at the flanks.
  arms  back half -> upper strip, front half -> lower strip; elbow pinned to the painted elbow.
  hands back of hand / palm sheets; each finger mapped on its own from painted knuckle to painted
        nail, because the painted fingers are far stubbier than the rig's.
  legs  thighs on the long strips (knee pinned to the painted kneecap), shins on the short pieces.
  feet  top-down onto the painted feet, toes pinned.
"""
import numpy as np

import sdf

SIZE = 1254
HEAD, TORSO, ARM, PALM, FINGER, THIGH, SHIN, FOOT, MOUTH = range(9)
FNAMES = ("index", "middle", "ring", "pinky", "thumb")

# painted landmarks: (knuckle line u, wrist u), finger tips (u, v), thumb (base, tip)
HAND_IMG = {
    "A": dict(wrist=797, knuckle=712, v0=918, vs=1013,  # right hand, back
              tips=[(640, 918), (637, 945), (643, 972), (667, 995)], thumb=((773, 908), (730, 885))),
    "C": dict(wrist=1057, knuckle=1143, v0=922, vs=960,  # left hand, back
              tips=[(1210, 922), (1217, 945), (1203, 972), (1183, 995)], thumb=((1083, 908), (1117, 885))),
    "B": dict(wrist=847, knuckle=937, v0=925, vs=885,  # palm (both)
              tips=[(1000, 925), (1007, 945), (1000, 968), (983, 992)], thumb=((877, 912), (910, 888))),
}


def _pw(x, xs, us):
    """Piecewise-linear map with linear extrapolation at both ends."""
    xs = np.asarray(xs, float); us = np.asarray(us, float)
    order = np.argsort(xs)
    xs, us = xs[order], us[order]
    out = np.interp(x, xs, us)
    lo = x < xs[0]; hi = x > xs[-1]
    out[lo] = us[0] + (x[lo] - xs[0]) * (us[1] - us[0]) / (xs[1] - xs[0])
    out[hi] = us[-1] + (x[hi] - xs[-1]) * (us[-1] - us[-2]) / (xs[-1] - xs[-2])
    return out


def _seg_dist(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1), t


def finger_param(m, name):
    """Distance to a finger's bone polyline and the arc parameter (0 knuckle .. 1 tip, extrapolated)."""
    pts = np.array(sdf.finger_pts(name))
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    best = np.full(len(m), 1e9); s = np.zeros(len(m)); axis = np.zeros_like(m)
    for j in range(len(pts) - 1):
        d, t = _seg_dist(m, pts[j], pts[j + 1])
        ab = pts[j + 1] - pts[j]
        traw = ((m - pts[j]) @ ab) / (ab @ ab)
        if j == 0:
            t = np.minimum(traw, 1.0)
        if j == len(pts) - 2:
            t = np.maximum(traw, 0.0) if j else traw
        better = d < best
        best = np.where(better, d, best)
        s = np.where(better, cum[j] + t * seg[j], s)
        axis = np.where(better[:, None], pts[j] + np.clip(t, 0, 1)[:, None] * ab, axis)
    return best, s / cum[-1], axis


def classify(c):
    """Region and sub-region of each face from its centre (rest pose)."""
    x, y, z = c[:, 0], c[:, 1], c[:, 2]
    a = np.abs(x)
    m = c.copy(); m[:, 0] = a
    reg = np.full(len(c), TORSO); sub = np.zeros(len(c), int)
    leg = z < 0.885
    reg[leg] = np.where(z[leg] >= 0.36, THIGH, SHIN)
    foot = (z < 0.07) | ((z < 0.118) & (y < -0.005))
    reg[foot] = FOOT
    head = (z > 1.56) | ((z > 1.495) & (np.hypot(x / 0.07, (y - 0.015) / 0.09) < 1))
    reg[head] = HEAD
    arm = (a > 0.172) & (z > 1.25)
    reg[arm] = ARM
    hand = (a > 0.742) & (z > 1.25)
    reg[hand] = PALM
    # fingers
    hi = np.where(hand)[0]
    if len(hi):
        mh = m[hi]
        bestd = np.full(len(hi), 1e9); bestf = np.full(len(hi), -1)
        for k, name in enumerate(FNAMES):
            d, t, _ = finger_param(mh, name)
            ok = (d < sdf.FINGER_R[name] * 2.2) & (t > (0.02 if name != "thumb" else 0.25)) & (d < bestd)
            bestd = np.where(ok, d, bestd); bestf = np.where(ok, k, bestf)
        f = bestf >= 0
        reg[hi[f]] = FINGER
        sub[hi[f]] = bestf[f] * 2
    # inside the open mouth
    q = (c - np.array(sdf.MOUTH_C)) / (np.array(sdf.MOUTH_R) * [1.3, 1.0, 1.7])
    reg[(np.linalg.norm(q, axis=1) < 1) & (y > -0.083)] = MOUTH
    reg[(sdf.ellipsoid(c, sdf.TEAR_C, sdf.TEAR_R, sdf.TEAR_ROT) < 0.003) & (x > 0)] = MOUTH
    # halves
    hd = reg == HEAD
    sub[hd] = _head_back(c[hd]).astype(int)
    for r, yc in ((TORSO, 0.02),):
        k = reg == r
        sub[k] = (y[k] - yc > 0).astype(int)
    k = reg == ARM
    sub[k] = (y[k] - 0.066 < 0).astype(int)  # 0 = back half (upper strip), 1 = front half
    for r in (THIGH, SHIN):
        k = reg == r
        sub[k] = (y[k] - _leg_axis_y(z[k]) > 0).astype(int)  # 0 front, 1 back
    k = reg == PALM
    sub[k] = (z[k] < 1.441).astype(int)
    k = reg == FINGER
    sub[k] += (z[k] < _finger_axis_z(m[k], sub[k] // 2)).astype(int)
    return reg, sub


def _finger_axis_z(m, fid):
    out = np.zeros(len(m))
    for k, name in enumerate(FNAMES):
        s = fid == k
        if s.any():
            _, _, ax = finger_param(m[s], name)
            out[s] = ax[:, 2]
    return out


def _leg_axis_y(z):
    return np.where(z >= 0.532, 0.0, 0.001 + (0.532 - z) / 0.428 * 0.035)


def _head_back(p):
    dx = p[:, 0]; dy = p[:, 1] - 0.01; dz = p[:, 2] - 1.69
    psi = np.arctan2(np.hypot(dx, np.maximum(dz, 0)), -dy)
    return psi > np.radians(97)


def head_uv(p, back):
    dx = p[:, 0]
    u = np.zeros(len(p)); v = np.zeros(len(p))
    # front
    f = ~back
    dy = -(p[f, 1] - 0.01); dz = p[f, 2] - 1.69; x = dx[f]
    psi = np.arctan2(np.hypot(x, dz), dy)
    hz = np.hypot(x, dz) + 1e-9
    up = dz > 0
    u[f] = np.where(up, 318 + 116 * psi * x / hz, 318 + 116 * np.arctan2(x, dy))
    zf = p[f, 2]
    v[f] = np.where(up, 116 - 63 * psi * dz / hz, np.where(zf > 1.575, 116 - dz * 1165, 250 + (1.575 - zf) * 640))
    # back
    b = back
    dy = p[b, 1] - 0.01; dz = p[b, 2] - 1.669; x = dx[b]
    psi = np.arctan2(np.hypot(x, dz), dy)
    hz = np.hypot(x, dz) + 1e-9
    up = dz > 0
    u[b] = np.where(up, 935 - 116 * psi * x / hz, 935 - 116 * np.arctan2(x, dy))
    zb = p[b, 2]
    v[b] = np.where(up, 131 - 83 * psi * dz / hz, np.where(zb > 1.6, 131 - dz * 1165, 211 + (1.6 - zb) * 820))
    return u, v


def corner_uv(P, reg, sub, nrm):
    """Pixel UVs for face corners P (each corner carries its face's region/sub and normal)."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    a = np.abs(x); side = np.sign(x)
    m = P.copy(); m[:, 0] = a
    u = np.zeros(len(P)); v = np.zeros(len(P))

    k = reg == HEAD
    u[k], v[k] = head_uv(P[k], sub[k] == 1)

    k = reg == TORSO
    fr = k & (sub == 0); bk = k & (sub == 1)
    u[fr] = 317 + 186 * np.arctan2(x[fr], -(y[fr] - 0.02)) / (np.pi / 2)
    u[bk] = 940 - 190 * np.arctan2(x[bk], (y[bk] - 0.02)) / (np.pi / 2)
    # below the collarbones by height; over the shoulders by angle round a crosswise axis, so the
    # shoulder tops take the panel's top band instead of one smeared row
    vz = 330 + (1.50 - z) * 620
    af = np.arctan2(z - 1.40, -(y - 0.02)); ab = np.arctan2(z - 1.40, y - 0.02)
    vs = 392 - np.where(sub == 0, af, ab) / (np.pi / 2) * 66
    v[k] = np.clip(np.where(z[k] > 1.40, vs[k], vz[k]), 323, 689)

    k = reg == ARM
    r = k & (side < 0); l = k & (side >= 0)
    u[r] = _pw(a[r], [0.172, 0.466, 0.742], [612, 338, 165])
    u[l] = _pw(a[l], [0.172, 0.466, 0.742], [642, 905, 1100])
    dy = y - 0.066; dz = z - 1.441
    bk = k & (sub == 0); fr = k & (sub == 1)
    # angle from the top of the arm round to its underside; unwrapped so a face straddling the
    # underside seam does not jump a full turn
    ab = np.arctan2(dy, dz); ab = np.where(ab < -np.pi / 2, ab + 2 * np.pi, ab)
    af = np.arctan2(-dy, dz); af = np.where(af < -np.pi / 2, af + 2 * np.pi, af)
    v[bk] = 688 + ab[bk] / np.pi * 97
    v[fr] = 791 + af[fr] / np.pi * 105

    # palm / back of hand: planar
    k = reg == PALM
    for img, sel in (("A", k & (sub == 0) & (side < 0)), ("C", k & (sub == 0) & (side >= 0)), ("B", k & (sub == 1))):
        h = HAND_IMG[img]
        sc = (h["knuckle"] - h["wrist"]) / 0.12
        u[sel] = h["wrist"] + sc * (a[sel] - 0.739)
        v[sel] = h["v0"] + h["vs"] * (y[sel] - 0.034)

    # fingers, one by one
    k = reg == FINGER
    for fi, name in enumerate(FNAMES):
        for dorsal in (True, False):
            for left in (True, False):
                sel = k & (sub // 2 == fi) & ((sub % 2 == 0) == dorsal) & ((side >= 0) == left)
                if not sel.any():
                    continue
                img = ("C" if left else "A") if dorsal else "B"
                h = HAND_IMG[img]
                _, t, ax = finger_param(m[sel], name)
                pts = np.array(sdf.finger_pts(name))
                if name == "thumb":
                    (bu, bv), (tu, tv) = h["thumb"]
                else:
                    sc = (h["knuckle"] - h["wrist"]) / 0.12
                    bu = h["wrist"] + sc * (pts[0][0] - 0.739)
                    bv = h["v0"] + h["vs"] * (pts[0][1] - 0.034)
                    tu, tv = h["tips"][fi]
                d = pts[-1] - pts[0]
                lat = np.cross(d, (0, 0, 1.0)); lat /= np.linalg.norm(lat)
                if lat[1] < 0:
                    lat = -lat
                off = (m[sel] - ax) @ lat
                u[sel] = bu + (tu - bu) * t
                v[sel] = bv + (tv - bv) * t + off * 1000

    # legs
    ya = _leg_axis_y(z); xl = a - 0.089; dy = y - ya
    k = reg == THIGH
    fr = k & (sub == 0); bk = k & (sub == 1)
    uu = _pw(z, [0.885, 0.535, 0.36], [610, 205, 18])
    u[k] = uu[k]
    v[fr] = 897 + (np.arctan2(xl[fr], -dy[fr]) / np.pi + 0.5) * 98
    v[bk] = 1007 + (np.arctan2(xl[bk], dy[bk]) / np.pi + 0.5) * 95
    k = reg == SHIN
    fr = k & (sub == 0); bk = k & (sub == 1)
    u[fr] = 17 + (0.36 - z[fr]) / 0.28 * 272
    v[fr] = 1109 + (np.arctan2(xl[fr], -dy[fr]) / np.pi + 0.5) * 129
    u[bk] = 618 - (0.36 - z[bk]) / 0.28 * 299
    v[bk] = 1107 + (np.arctan2(xl[bk], dy[bk]) / np.pi + 0.5) * 131

    k = reg == MOUTH  # front-on into the painted open mouth: tongue at the back, gums round it
    u[k] = 1047 + x[k] * 2600
    v[k] = 1118 - (z[k] - sdf.MOUTH_C[2]) * 2600
    k = reg == FOOT
    u[k] = np.where(side[k] < 0, 728 + (x[k] + 0.089) * 1400, 855 + (x[k] - 0.089) * 1400)
    v[k] = np.clip(1025 + (0.03 - y[k]) * 884, 1022, 1236)
    return u, v


def ear_uv(P, side):
    """Ears: side-on planar into the painted ears on the face panel."""
    yy = P[:, 1] - 0.012; zz = P[:, 2] - 1.668
    u = np.where(side > 0, 500 + yy * 1250, 137 - yy * 1250)
    v = 140 - zz * 1250
    return u, v
