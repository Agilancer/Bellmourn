"""Lays the brute's surface onto a painted brute sheet (1254 px square, pixel coords, y down).

The layout below is the red demon sheet's (art/creatures/brutes/red_demon.webp); another sheet
needs its own LAYOUT (island boxes and a few landmarks). Positions come in T-space (arms laid
out straight, sdf.unbend) on the widened rig.
  head   front panel (face) / back panel, cylinder below the eyes, azimuthal above
  torso  front panel (chest, abs) above the waist, the hip band below it in front; back panel
  arms   one full-circumference column each, shoulder at the top
  hands  back-of-hand / palm panels; each finger from its painted knuckle to its painted claw
  legs   thigh fronts on the big leg panels, thigh backs and buttocks on the buttock panels,
         shins and calves on the side columns, foot tops at the bottom of the leg panels, soles
  mouth  the tongue island
"""
import numpy as np

import sdf

SIZE = 1254
HEAD, TORSO, ARM, PALM, FINGER, THIGH, SHIN, FOOT, MOUTH = range(9)
FNAMES = ("index", "middle", "ring", "pinky", "thumb")
XL = sdf.HIP_X

L = dict(  # the red demon sheet
    face=dict(cx=216, k=92, v_eye=92, z_eye=1.67, kv=845, k_up=46, v_max=200),
    back=dict(cx=556, k=92, v_ref=60, z_ref=1.67, kv=845, k_up=38, v_max=194),
    torso_f=dict(cx=424, hw=220, v0=190, z0=1.55, kv=763, v_min=186, v_max=630),
    torso_b=dict(cx=878, hw=225, v0=200, z0=1.55, kv=740, v_min=198, v_max=622,
                 zt=1.66, vt=190, kvo=632, ku0=600, ku1=300),        # the back: painted as seen from behind
    hip=dict(cx=645, hw=235, v0=625, z0=0.98, kv=1194, v_max=842),
    arm={-1: dict(cx=110, w=212, v0=200, kv=782), 1: dict(cx=1175, w=146, v0=221, kv=775)},
    thigh_f={-1: dict(cx=306, hw=128, v0=725, kv=703), 1: dict(cx=967, hw=122, v0=720, kv=703)},
    thigh_b={-1: dict(cx=542, hw=90, v0=815, kv=500), 1: dict(cx=737, hw=93, v0=819, kv=495)},
    shin={-1: dict(cx=84, w=158, v0=940, kv=732), 1: dict(cx=1173, w=150, v0=945, kv=732)},
    foot={-1: dict(cx=265, ku=1333, v0=1100, kv=570), 1: dict(cx=985, ku=1300, v0=1098, kv=570)},
    sole={-1: dict(cx=564, ku=1100, v0=1250, kv=555), 1: dict(cx=713, ku=1100, v0=1250, kv=555)},
    # back of the hand, fingers pointing down the panel: index nearest the thumb
    hand={1: dict(wrist=635, knuckle=712, u_index=112, du=-1366,
                  tips=[(112, 782), (70, 786), (42, 780), (15, 766)], thumb=((158, 668), (182, 704))),
          -1: dict(wrist=648, knuckle=725, u_index=1148, du=1366,
                   tips=[(1148, 795), (1190, 799), (1218, 793), (1245, 779)], thumb=((1102, 681), (1086, 717)))},
    palm={1: dict(v0=790, kv=900, u_index=112, du=-1366), -1: dict(v0=802, kv=900, u_index=1148, du=1366)},
    tongue=dict(cx=1176, cy=123, k=1500),
)


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
    return psi > np.radians(97)


def classify(c):
    x, y, z = c[:, 0], c[:, 1], c[:, 2]
    a = np.abs(x)
    m = c.copy(); m[:, 0] = a
    reg = np.full(len(c), TORSO); sub = np.zeros(len(c), int)
    leg = (z < 0.86) & (a > 0.015)
    reg[leg] = np.where(z[leg] >= 0.53, THIGH, SHIN)
    foot = (z < 0.085) | ((z < 0.13) & (y < -0.02))
    reg[foot] = FOOT
    head = ((z > 1.55) & (y < 0.045)) | (z > 1.66) | ((z > 1.6) & (y < 0.1) & (a < 0.07))   # the hump is torso
    reg[head] = HEAD
    arm = (a > 0.215) & (z > 1.28)
    reg[arm] = ARM
    hand = (a > 0.80) & (z > 1.28)
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
    reg[(np.linalg.norm(q, axis=1) < 1) & (y > -0.105)] = MOUTH
    hd = reg == HEAD
    sub[hd] = _head_back(c[hd]).astype(int)
    k = reg == TORSO
    split = np.where(z > 1.35, 0.075, 0.02)                           # shoulder ridge belongs to the chest panel
    sub[k] = (y[k] - split[k] > 0).astype(int) + 2 * (z[k] < 0.98)   # 0 chest, 1 back, 2 hips front, 3 hips back
    k = reg == ARM
    sub[k] = 0
    for r in (THIGH, SHIN):
        k = reg == r
        sub[k] = (y[k] - _leg_axis_y(z[k]) > 0).astype(int)
    k = reg == PALM
    sub[k] = (z[k] < 1.441).astype(int)
    k = reg == FINGER
    sub[k] += (z[k] < _finger_axis_z(m[k], sub[k] // 2)).astype(int)
    k = reg == FOOT
    sub[k] = (z[k] < 0.02).astype(int)                                   # 1 = sole
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


def head_uv(p, back):
    F, B = L["face"], L["back"]
    u = np.zeros(len(p)); v = np.zeros(len(p))
    f = ~back
    x = p[f, 0]; dy = -p[f, 1]; dz = p[f, 2] - F["z_eye"]
    psi = np.arctan2(np.hypot(x, dz), dy); hz = np.hypot(x, dz) + 1e-9
    up = dz > 0
    u[f] = np.where(up, F["cx"] + F["k"] * psi * x / hz, F["cx"] + F["k"] * np.arctan2(x, dy))
    v[f] = np.minimum(np.where(up, F["v_eye"] - F["k_up"] * psi * dz / hz, F["v_eye"] - dz * F["kv"]), F["v_max"])
    b = back
    x = p[b, 0]; dy = p[b, 1]; dz = p[b, 2] - B["z_ref"]
    psi = np.arctan2(np.hypot(x, dz), dy); hz = np.hypot(x, dz) + 1e-9
    up = dz > 0
    u[b] = np.where(up, B["cx"] - B["k"] * psi * x / hz, B["cx"] - B["k"] * np.arctan2(x, dy))
    v[b] = np.minimum(np.where(up, B["v_ref"] - B["k_up"] * psi * dz / hz, B["v_ref"] - dz * B["kv"]), B["v_max"])
    return u, v


def corner_uv(P, reg, sub, nrm):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    a = np.abs(x); side = np.where(x < 0, -1, 1)
    m = P.copy(); m[:, 0] = a
    u = np.zeros(len(P)); v = np.zeros(len(P))

    k = reg == HEAD
    u[k], v[k] = head_uv(P[k], sub[k] == 1)

    # torso: chest / back panels above the waist, hip band in front below it
    T, Bk, Hp = L["torso_f"], L["torso_b"], L["hip"]
    k = reg == TORSO
    phf = np.arctan2(x, -(y - 0.02)); phb = np.arctan2(x, (y - 0.02))
    for s_, pan, ph, sg in ((0, T, phf, 1), (1, Bk, phb, -1)):
        sel = k & (sub == s_)
        vz = pan["v0"] + (pan["z0"] - z) * pan["kv"]
        al = np.arctan2(z - 1.45, np.where(s_ == 0, -(y - 0.02), (y - 0.02)))
        v45 = pan["v0"] + (pan["z0"] - 1.45) * pan["kv"]
        vs = v45 - al / (np.pi / 2) * (v45 - pan["v_min"])
        if s_ == 1:
            # the back: across by distance round the body from the spine (wider up the
            # shoulders, onto the painted shoulder mounds), down straight with height
            ku = 790 + 110 * np.clip((z - 1.1) / 0.4, 0, 1)
            u[sel] = pan["cx"] - (ku * x)[sel]
            v[sel] = np.clip(pan["vt"] + (pan["zt"] - z[sel]) * pan["kvo"], pan["vt"] - 4, pan["v_max"])
            continue
        u[sel] = pan["cx"] + sg * pan["hw"] * ph[sel] / (np.pi / 2)
        v[sel] = np.clip(np.where(z[sel] > 1.45, vs[sel], vz[sel]), pan["v_min"], pan["v_max"])
    sel = k & (sub == 2)
    u[sel] = Hp["cx"] + Hp["hw"] * phf[sel] / (np.pi / 2)
    v[sel] = np.clip(Hp["v0"] + (Hp["z0"] - z[sel]) * Hp["kv"], Hp["v0"], Hp["v_max"])
    sel = k & (sub == 3)  # waist and seat behind: top of the buttock panels
    for sd in (-1, 1):
        ss = sel & (side == sd); pan = L["thigh_b"][sd]
        phb2 = np.arctan2(x - sd * XL, y)
        u[ss] = pan["cx"] - pan["hw"] * phb2[ss] / (np.pi / 2)
        v[ss] = pan["v0"] + (0.98 - z[ss]) * pan["kv"]

    # arms: full-circumference columns, front of the arm down the middle
    k = reg == ARM
    for sd in (-1, 1):
        sel = k & (side == sd); pan = L["arm"][sd]
        th = np.arctan2(z - 1.441, -(y - 0.066))
        u[sel] = pan["cx"] + th[sel] / np.pi * pan["w"] / 2
        v[sel] = np.clip(pan["v0"] + (a[sel] - sdf.SHOULDER[0]) * pan["kv"], pan["v0"] - 3, 640)

    # back of the hand / palm: planar
    k = reg == PALM
    for sd in (-1, 1):
        H = L["hand"][sd]; Pm = L["palm"][sd]
        sc = (H["knuckle"] - H["wrist"]) / 0.12
        sel = k & (side == sd) & (sub == 0)
        u[sel] = H["u_index"] + H["du"] * (y[sel] - 0.035)
        v[sel] = H["wrist"] + sc * (a[sel] - (0.739 + sdf.WIDEN_ARM))
        sel = k & (side == sd) & (sub == 1)
        u[sel] = Pm["u_index"] + Pm["du"] * (y[sel] - 0.035)
        v[sel] = Pm["v0"] + Pm["kv"] * (a[sel] - (0.739 + sdf.WIDEN_ARM)) * 0.6

    # fingers, knuckle to claw, both faces from the back-of-hand paint
    k = reg == FINGER
    for fi, name in enumerate(FNAMES):
        for sd in (-1, 1):
            sel = k & (sub // 2 == fi) & (side == sd)
            if not sel.any():
                continue
            H = L["hand"][sd]
            _, t, ax = finger_param(m[sel], name)
            pts = np.array(sdf.finger_pts(name))
            if name == "thumb":
                (bu, bv), (tu, tv) = H["thumb"]
            else:
                sc = (H["knuckle"] - H["wrist"]) / 0.12
                bu = H["u_index"] + H["du"] * (pts[0][1] - 0.035)
                bv = H["wrist"] + sc * (pts[0][0] - (0.739 + sdf.WIDEN_ARM))
                tu, tv = H["tips"][fi]
            d = pts[-1] - pts[0]
            lat = np.cross(d, (0, 0, 1.0)); lat /= np.linalg.norm(lat)
            if lat[1] < 0:
                lat = -lat
            off = (m[sel] - ax) @ lat
            u[sel] = bu + (tu - bu) * t + off * H["du"] * 0.75
            v[sel] = np.minimum(bv + (tv - bv) * t, max(tv, bv) + 6)

    # legs
    ya = _leg_axis_y(z)
    for sd in (-1, 1):
        xl = x - sd * XL; dy = y - ya
        sel = (reg == THIGH) & (side == sd)
        F_, Bp = L["thigh_f"][sd], L["thigh_b"][sd]
        fr = sel & (sub == 0); bk = sel & (sub == 1)
        u[fr] = F_["cx"] + F_["hw"] * np.arctan2(xl, -dy)[fr] / (np.pi / 2)
        v[fr] = F_["v0"] + (0.90 - z[fr]) * F_["kv"]
        u[bk] = Bp["cx"] - Bp["hw"] * np.arctan2(xl, dy)[bk] / (np.pi / 2)
        v[bk] = Bp["v0"] + (0.98 - z[bk]) * Bp["kv"]
        sel = (reg == SHIN) & (side == sd)
        S_ = L["shin"][sd]
        th = np.arctan2(xl, -dy)
        th = np.where(th < -np.pi * 0.95, th + 2 * np.pi, th)
        u[sel] = S_["cx"] + th[sel] / np.pi * S_["w"] / 2
        v[sel] = S_["v0"] + (0.53 - z[sel]) * S_["kv"]
        sel = (reg == FOOT) & (side == sd)
        Ft, Sl = L["foot"][sd], L["sole"][sd]
        top = sel & (sub == 0); bot = sel & (sub == 1)
        u[top] = Ft["cx"] + xl[top] * Ft["ku"]
        v[top] = np.clip(Ft["v0"] + (0.0 - y[top]) * Ft["kv"], Ft["v0"] - 6, 1246)
        u[bot] = Sl["cx"] + xl[bot] * Sl["ku"]
        v[bot] = np.clip(Sl["v0"] - (0.11 - y[bot]) * Sl["kv"], 1048, 1248)

    k = reg == MOUTH
    G = L["tongue"]
    u[k] = G["cx"] + x[k] * G["k"]
    v[k] = G["cy"] - (z[k] - sdf.MOUTH_C[2]) * G["k"]
    return u, v


def ear_uv(P, side):
    """Pointed ears: side-on planar into the painted ears at the face panel's upper corners."""
    yy = P[:, 1] + 0.035; zz = P[:, 2] - 1.722
    u = np.where(side > 0, 322 + yy * 900, 118 - yy * 900)
    v = 48 - zz * 900
    return u, v
