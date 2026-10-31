"""Lays the body's surface onto a painted sheet, driven by a layout spec (sheets.py).

Pixel coordinates, y down. Every part is projected onto its painted island with landmarks pinned:
  head   front panel (face, ears at the sides) / back panel (skull, nape). Below eye level a
         cylinder + height; above it an azimuthal projection that wraps forehead and crown.
  torso  front / back panels, split at the flanks; shoulder tops take the panels' top band.
  arms   strips along the arm: two halves (back / front) or one full wrap, pinned at the
         shoulder, elbow and wrist.
  legs   strips by height: thigh + shin pieces or whole-leg strips, halves or full wraps.
  hands  back of hand / palm images, each finger mapped from its painted knuckle to its nail.
  feet   top-down onto the painted feet; soles onto painted soles when the sheet has them.
  mouth / teeth / ears  onto their own pieces.

A strip is {"c": [centre pixel at each landmark], "a": half-width vector}; a point at
parameter s in [-1, 1] across it lands at c(t) + a * s.
"""
import numpy as np

import sdf

HEAD, TORSO, ARM, PALM, FINGER, THIGH, SHIN, FOOT, MOUTH = range(9)
FNAMES = ("index", "middle", "ring", "pinky", "thumb")
ARM_T = [0.172, 0.466, 0.742]          # shoulder, elbow, wrist (distance out along the arm)
S = {}                                 # the active sheet's spec


def use(spec):
    S.clear()
    S.update(spec)


def _pw(x, xs, us):
    """Piecewise-linear map with linear extrapolation at both ends (us may be vectors)."""
    xs = np.asarray(xs, float); us = np.asarray(us, float)
    if us.ndim == 1:
        us = us[:, None]
    order = np.argsort(xs)
    xs, us = xs[order], us[order]
    out = np.stack([np.interp(x, xs, us[:, i]) for i in range(us.shape[1])], -1)
    for sel, i0, i1 in ((x < xs[0], 0, 1), (x > xs[-1], -2, -1)):
        if sel.any():
            j = 0 if i0 == 0 else -1
            out[sel] = us[j] + (x[sel] - xs[j])[:, None] * (us[i1] - us[i0]) / (xs[i1] - xs[i0])
    return out


def _strip(t, ts, s, st):
    c = _pw(t, ts, st["c"])
    return c + s[:, None] * np.asarray(st["a"], float)


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


def _leg_axis_y(z):
    return np.where(z >= 0.532, 0.0, 0.001 + (0.532 - z) / 0.428 * 0.035)


def _head_back(p):
    dx = p[:, 0]; dy = p[:, 1] - 0.01; dz = p[:, 2] - 1.69
    psi = np.arctan2(np.hypot(dx, np.maximum(dz, 0)), -dy)
    return psi > np.radians(97)


def classify(c):
    """Region and sub-region of each face from its centre (T-space)."""
    x, y, z = c[:, 0], c[:, 1], c[:, 2]
    a = np.abs(x)
    m = c.copy(); m[:, 0] = a
    reg = np.full(len(c), TORSO); sub = np.zeros(len(c), int)
    leg = z < 0.885
    reg[leg] = np.where(z[leg] >= S["legs"]["split_z"], THIGH, SHIN)
    foot = (z < 0.07) | ((z < 0.118) & (y < -0.005))
    reg[foot] = FOOT
    head = (z > 1.56) | ((z > 1.495) & (np.hypot(x / 0.07, (y - 0.015) / 0.09) < 1))
    reg[head] = HEAD
    reg[(a > 0.172) & (z > 1.25)] = ARM
    hand = (a > 0.742) & (z > 1.25)
    reg[hand] = PALM
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
    reg[sdf.in_mouth(c)] = MOUTH
    hd = reg == HEAD
    sub[hd] = _head_back(c[hd]).astype(int)
    k = reg == TORSO
    sub[k] = (y[k] - 0.02 > 0).astype(int)
    k = reg == ARM
    sub[k] = (y[k] - 0.066 < 0).astype(int)          # 0 back half, 1 front half
    for r in (THIGH, SHIN):
        k = reg == r
        sub[k] = (y[k] - _leg_axis_y(z[k]) > 0).astype(int)   # 0 front, 1 back
    k = reg == PALM
    sub[k] = (z[k] < 1.441).astype(int)
    k = reg == FINGER
    ax = np.zeros(len(c))
    for fi, name in enumerate(FNAMES):
        s = k & (sub // 2 == fi)
        if s.any():
            ax[s] = finger_param(m[s], name)[2][:, 2]
    sub[k] += (z[k] < ax[k]).astype(int)
    k = reg == FOOT
    sub[k] = 0
    return reg, sub


def head_uv(p, back):
    h = S["head"]
    dx = p[:, 0]
    u = np.zeros(len(p)); v = np.zeros(len(p))
    f, b = ~back, back
    F = h["front"]
    dy = -(p[f, 1] - 0.01); dz = p[f, 2] - 1.69; x = dx[f]
    psi = np.arctan2(np.hypot(x, dz), dy)
    hz = np.hypot(x, dz) + 1e-9
    up = dz > 0
    az = lambda a_: F["ku"] * a_ + F.get("kc", 0.0) * a_ ** 3   # cubic: narrow-set painted eyes, wide ears
    u[f] = np.where(up, F["cu"] + az(psi) * x / hz, F["cu"] + az(np.arctan2(x, dy)))
    zf = p[f, 2]
    chin_v = F["eye_v"] + 0.115 * F["kz"]
    kn = (F["neck_v"] - chin_v) / 0.085
    v[f] = np.where(up, F["eye_v"] - F["k_up"] * psi * dz / hz,
                    np.where(zf > 1.575, F["eye_v"] - dz * F["kz"], chin_v + (1.575 - zf) * kn))
    B = h["back"]
    dy = p[b, 1] - 0.01; dz = p[b, 2] - 1.669; x = dx[b]
    psi = np.arctan2(np.hypot(x, dz), dy)
    hz = np.hypot(x, dz) + 1e-9
    up = dz > 0
    azb = lambda a_: B["ku"] * a_ + B.get("kc", 0.0) * a_ ** 3
    u[b] = np.where(up, B["cu"] - azb(psi) * x / hz, B["cu"] - azb(np.arctan2(x, dy)))
    zb = p[b, 2]
    nape_v = B["ear_v"] + 0.069 * B["kz"]
    kn = (B["neck_v"] - nape_v) / 0.11
    v[b] = np.where(up, B["ear_v"] - B["k_up"] * psi * dz / hz,
                    np.where(zb > 1.6, B["ear_v"] - dz * B["kz"], nape_v + (1.6 - zb) * kn))
    return u, v


def _hand_map(img, a, b):
    """Planar hand: a = distance out along the hand (0.739 wrist .. 0.859 knuckles), b = across (y)."""
    W, K, D = (np.asarray(img[k], float) for k in ("W", "K", "D"))
    return W + ((a - 0.739) / 0.12)[:, None] * (K - W) + ((b - 0.072) / 0.076)[:, None] * D


def corner_uv(P, C, reg, sub):
    """Pixel UVs for face corners P; C is each corner's face centre (both T-space)."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    a = np.abs(x); side = np.where(x < 0, -1, 1)
    m = P.copy(); m[:, 0] = a
    out = np.zeros((len(P), 2))

    def unwrap(alpha, alpha_c):
        return alpha_c + (alpha - alpha_c + np.pi) % (2 * np.pi) - np.pi

    k = reg == HEAD
    out[k, 0], out[k, 1] = head_uv(P[k], sub[k] == 1)

    T = S["torso"]
    k = reg == TORSO
    for half, sel in (("front", k & (sub == 0)), ("back", k & (sub == 1))):
        if not sel.any():
            continue
        cu, hw, top_v, bot_v = T[half]
        sg = 1 if half == "front" else -1
        phi = np.arctan2(x[sel], -sg * (y[sel] - 0.02))
        out[sel, 0] = cu + sg * hw * phi / (np.pi / 2)
        kz = (bot_v - top_v) / 0.58
        vz = top_v + (1.50 - z[sel]) * kz
        al = np.arctan2(z[sel] - 1.40, -sg * (y[sel] - 0.02))
        v140 = top_v + 0.1 * kz
        vs = v140 - al / (np.pi / 2) * (v140 - top_v + 4)
        out[sel, 1] = np.clip(np.where(z[sel] > 1.40, vs, vz), top_v - 7, bot_v)

    # arms: theta 0 on top of the (T-pose) arm, +pi/2 at its back, -pi/2 at its front
    k = reg == ARM
    th = np.arctan2(y - 0.066, z - 1.441); thc = np.arctan2(C[:, 1] - 0.066, C[:, 2] - 1.441)
    for sd, key in ((-1, "r"), (1, "l")):
        strips = S["arms"][key]
        sel = k & (side == sd)
        if len(strips) == 2:
            for half, ss in ((0, sel & (sub == 0)), (1, sel & (sub == 1))):
                if ss.any():
                    t_ = th[ss] if half == 0 else -th[ss]
                    t_ = np.where(t_ < -np.pi / 2, t_ + 2 * np.pi, t_)
                    out[ss] = _strip(a[ss], ARM_T, 2 * t_ / np.pi - 1, strips[half])
        elif sel.any():
            t_ = unwrap(th[sel], thc[sel])       # full wrap, seam along the underside
            out[sel] = _strip(a[sel], ARM_T, t_ / np.pi, strips[0])

    # hands and fingers
    H = S["hands"]
    k = reg == PALM
    for key, sel in (("dr", k & (sub == 0) & (side < 0)), ("dl", k & (sub == 0) & (side > 0)),
                     ("pr", k & (sub == 1) & (side < 0)), ("pl", k & (sub == 1) & (side > 0))):
        if sel.any():
            out[sel] = _hand_map(H[key], a[sel], y[sel])
    k = reg == FINGER
    for fi, name in enumerate(FNAMES):
        pts = np.array(sdf.finger_pts(name))
        d = pts[-1] - pts[0]
        lat = np.cross(d, (0, 0, 1.0)); lat /= np.linalg.norm(lat)
        if lat[1] < 0:
            lat = -lat
        for dorsal in (True, False):
            for sd in (-1, 1):
                sel = k & (sub // 2 == fi) & ((sub % 2 == 0) == dorsal) & (side == sd)
                if not sel.any():
                    continue
                img = H[("d" if dorsal else "p") + ("l" if sd > 0 else "r")]
                _, t, axp = finger_param(m[sel], name)
                if name == "thumb":
                    base, tip = (np.asarray(q, float) for q in img["thumb"])
                else:
                    base = _hand_map(img, np.array([pts[0][0]]), np.array([pts[0][1]]))[0]
                    tip = np.asarray(img["tips"][fi], float)
                D = np.asarray(img["D"], float)
                off = (m[sel] - axp) @ lat
                out[sel] = base + t[:, None] * (tip - base) + (off * np.linalg.norm(D) / 0.076)[:, None] * (D / np.linalg.norm(D))

    # legs: alpha 0 at the front, +pi/2 on the outside (lateral)
    L = S["legs"]
    ya = _leg_axis_y(z); xl = a - 0.089
    for r, key in ((THIGH, "thigh"), (SHIN, "shin")):
        k = reg == r
        for sd, lr in ((-1, "r"), (1, "l")):
            strips = L[key][lr]
            sel = k & (side == sd)
            if not sel.any():
                continue
            ts = L[key]["z"]
            if len(strips) == 2:
                for half, ss in ((0, sel & (sub == 0)), (1, sel & (sub == 1))):
                    if ss.any():
                        al = np.arctan2(xl[ss], -(y[ss] - ya[ss])) if half == 0 else np.arctan2(xl[ss], y[ss] - ya[ss])
                        out[ss] = _strip(z[ss], ts, 2 * al / np.pi, strips[half])
            else:
                al = np.arctan2(xl[sel], -(y[sel] - ya[sel]))
                alc = np.arctan2(np.abs(C[sel, 0]) - 0.089, -(C[sel, 1] - _leg_axis_y(C[sel, 2])))
                al = unwrap(al, alc)
                out[sel] = _strip(z[sel], ts, al / np.pi, strips[0])

    M = S["mouth"]
    k = reg == MOUTH
    out[k, 0] = M["c"][0] + x[k] * M.get("kx", M["k"])
    out[k, 1] = M["c"][1] - (z[k] - sdf.cavity_c()[2]) * M.get("kz", M["k"])

    k = reg == FOOT
    for sd, lr in ((-1, "r"), (1, "l")):
        sel = k & (side == sd)
        if not sel.any():
            continue
        ft = S["feet"][lr]
        A_, T_, Lv = (np.asarray(ft[q], float) for q in ("A", "T", "L"))
        t = np.clip((0.03 - y[sel]) / 0.235, ft.get("t0", -0.01), 1.03)
        out[sel] = A_ + t[:, None] * (T_ - A_) + ((a[sel] - 0.089) * ft["kw"])[:, None] * Lv
    return out[:, 0], out[:, 1]


def ear_uv(P, side):
    """Ears: side-on planar into the painted ears."""
    E = S["ears"]
    yy = P[:, 1] - 0.012; zz = P[:, 2] - 1.668
    cl, cr = np.asarray(E["l"], float), np.asarray(E["r"], float)
    fl, fr = E.get("dir_l", 1), E.get("dir_r", -1)
    u = np.where(side > 0, cl[0] + fl * yy * E["k"], cr[0] + fr * yy * E["k"])
    v = np.where(side > 0, cl[1], cr[1]) - zz * E["k"]
    return u, v


def teeth_uv(q, upper_gum_z, lower_gum_z, cx=0.0, cy=-0.056):
    """Teeth onto the painted strips: across by angle round the arch, gum line to crown tip."""
    Tt = S["teeth"]
    ang = np.degrees(np.arctan2(q[:, 0] - cx, -(q[:, 1] - cy)))
    up = q[:, 2] > sdf.MOUTH_C[2]
    fr = np.clip((ang + 85) / 170, 0, 1)
    hu = np.clip((upper_gum_z - q[:, 2]) / 0.014, 0, 1)
    hl = np.clip((q[:, 2] - lower_gum_z) / 0.014, 0, 1)
    U, L = Tt["up"], Tt["lo"]
    u = np.where(up, U["u0"] + fr * (U["u1"] - U["u0"]), L["u0"] + fr * (L["u1"] - L["u0"]))
    v = np.where(up, U["gum"] + hu * (U["tip"] - U["gum"]), L["gum"] + hl * (L["tip"] - L["gum"]))
    return u, v


def teeth_uv_slit(q):
    """The maw's needles: along the slit -> across the fang strip, base -> point down it."""
    Tt = S["teeth"]
    fr = np.clip((q[:, 2] - (sdf.SLIT_C[2] - sdf.SLIT_R[2])) / (2 * sdf.SLIT_R[2]), 0, 1)
    h = np.clip((0.011 - np.abs(q[:, 0])) / 0.011, 0, 1)
    U, L = Tt["up"], Tt["lo"]
    left = q[:, 0] > 0
    u = np.where(left, U["u0"] + fr * (U["u1"] - U["u0"]), L["u0"] + fr * (L["u1"] - L["u0"]))
    v = np.where(left, U["gum"] + h * (U["tip"] - U["gum"]), L["gum"] + h * (L["tip"] - L["gum"]))
    return u, v
