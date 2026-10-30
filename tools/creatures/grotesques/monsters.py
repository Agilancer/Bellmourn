"""The ten grotesques: how each one's clay is sculpted, its body reshaped, and which skin it wears.

Each entry gives:
  skin     the atlas (skins.py) it wears
  H        head landmarks (see skins.py) the sculpt and the skin are both placed by
  hands    the hand spec (base.hands)
  sculpt   f(field, H): features cut into or added to the clay before it is meshed
  reshape  f(V, J, H) -> V: the body moved vertex by vertex once meshed (thinner limbs...)
  warp     f(P) -> P (optional): a change of proportion applied to the mesh AND the rig's joints
           (longer arms, a bigger body), so the bones still sit in the limbs
  relief   metres of displacement per unit of the skin's high-passed brightness
  tris     the triangle budget

The bare man's head (measured): the face's front is at y -0.163 from z 1.62 to 1.76, the chin at
1.577 (y -0.148), the head is 0.185 wide (x +-0.092) and its axis at y -0.05; the neck is 1.50-1.58.
"""
import numpy as np

from wrap import seg_dist

BASE_H = dict(cy=-0.05, eye=1.690, eye_t=19.0, brow=1.712, nose=1.648, mouth=1.612, chin=1.577,
              ear=1.668, top=1.823, neck=1.50)


def H_(**kw):
    h = dict(BASE_H)
    h.update(kw)
    return h


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def rot(axis, deg):
    a = np.radians(deg)
    c, s = np.cos(a), np.sin(a)
    return {"x": np.array([[1, 0, 0], [0, c, -s], [0, s, c]]),
            "y": np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]),
            "z": np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])}[axis]


def both(fn):
    for sx in (1, -1):
        fn(sx)


# ------------------------------------------------------------------ head sculpting helpers

def eyes(f, H, x=0.036, socket=(0.026, 0.022, 0.019), sy=-0.163, r=0.0135, ey=-0.143, cut=1.0):
    def side(sx):
        f.ellipsoid((sx * x, sy, H["eye"]), socket, mode="cut", soft=0.004, amount=cut)
        if r:
            f.ellipsoid((sx * x, ey, H["eye"]), (r, r, r), mode="max", soft=0.0015)
    both(side)


def ears(f, H, size=1.0, point=0.0, tilt=-12, out=0.0, y=0.004):
    def side(sx):
        R = rot("x", tilt)
        c = np.array((sx * (0.094 + out), H["cy"] + y, H["ear"]))
        f.ellipsoid(c, (0.010 * size ** 0.5, 0.024 * size, 0.034 * size), R, soft=0.002)
        f.ellipsoid(c + (sx * 0.0075, -0.004, -0.002), (0.0055, 0.014 * size, 0.021 * size), R, mode="cut", soft=0.002)
        if point:
            # a pointed tip, up and back
            tip = c + np.array((sx * 0.012 * point, 0.022 * point, 0.05 * point)) * size
            f.capsule(c + (0, 0.006, 0.02 * size), tip, 0.009 * size, 0.0015, soft=0.002)
    both(side)


def cheeks(f, H, bone=1.0, hollow=0.6, temple=0.45):
    def side(sx):
        if bone:
            f.ellipsoid((sx * 0.058, -0.137, H["eye"] - 0.022), np.array((0.017, 0.012, 0.009)) * bone, soft=0.003)
        if hollow:
            f.ellipsoid((sx * 0.063, -0.132, H["mouth"] + 0.012), (0.03, 0.022, 0.026), mode="cut", soft=0.008,
                        amount=hollow)
        if temple:
            f.ellipsoid((sx * 0.086, -0.108, H["eye"] + 0.025), (0.02, 0.026, 0.026), mode="cut", soft=0.008,
                        amount=temple)
    both(side)


def brow(f, H, r=0.0075, y=-0.160, w=0.048):
    f.capsule((-w, y, H["brow"]), (w, y, H["brow"]), r, r, soft=0.003)


def nose(f, H, kind="skull"):
    n = H["nose"]
    if kind == "skull":          # the bridge, and a rotted-out hole
        f.capsule((0, -0.163, H["brow"] - 0.006), (0, -0.171, n + 0.012), 0.006, 0.008, soft=0.003)
        f.ellipsoid((0, -0.17, n), (0.012, 0.014, 0.011), mode="cut", soft=0.003)
    elif kind == "bump":         # a fleshy nose
        f.capsule((0, -0.163, H["brow"] - 0.008), (0, -0.178, n + 0.004), 0.007, 0.011, soft=0.003)
        f.ellipsoid((0, -0.176, n + 0.002), (0.016, 0.012, 0.010), soft=0.003)
    elif kind == "wide":         # a troll's: broad and flat, wide nostrils
        f.capsule((0, -0.165, H["brow"] - 0.01), (0, -0.182, n + 0.006), 0.009, 0.014, soft=0.003)
        f.ellipsoid((0, -0.180, n + 0.002), (0.026, 0.016, 0.013), soft=0.003)
        both(lambda sx: f.ellipsoid((sx * 0.012, -0.19, n - 0.004), (0.006, 0.006, 0.004), mode="cut", soft=0.002))
    elif kind == "snout":        # flat, two slits (a ghoul's)
        f.ellipsoid((0, -0.172, n + 0.006), (0.017, 0.012, 0.014), soft=0.003)
        both(lambda sx: f.ellipsoid((sx * 0.007, -0.183, n), (0.004, 0.006, 0.007), mode="cut", soft=0.0015))


def mouth(f, H, w=0.027, h=0.0095, depth=0.014, gums=True, y=-0.159):
    m = H["mouth"]
    f.ellipsoid((0, y, m), (w, depth, h), mode="cut", soft=0.003)
    if gums:
        f.ellipsoid((0, y + 0.010, m + h * 0.58), (w * 0.9, 0.008, 0.0045), soft=0.0015)
        f.ellipsoid((0, y + 0.010, m - h * 0.68), (w * 0.82, 0.008, 0.004), soft=0.0015)


def jaw(f, H, w=1.0, fwd=0.0, drop=0.0):
    """A heavier (w > 1) jaw and chin."""
    both(lambda sx: f.ellipsoid((sx * 0.05 * w, -0.112 - fwd, H["chin"] + 0.022 - drop), (0.03 * w, 0.04, 0.022), soft=0.006))
    f.ellipsoid((0, -0.142 - fwd, H["chin"] + 0.006 - drop), (0.034 * w, 0.02, 0.016), soft=0.005)


# ------------------------------------------------------------------ body reshaping helpers

def radial(V, a, b, k, w):
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = b - a
    t = np.clip(((V - a) @ d) / (d @ d), 0, 1)
    c = a + t[:, None] * d
    kk = 1 - (1 - k) * w
    return c + (V - c) * kk[:, None]


def limbs(P, J, up=0.8, fore=0.78, thigh=0.84, shin=0.84, knob=0.95):
    """Limbs thinned (k < 1) or thickened (k > 1) toward their bones; elbows and knees keep a knob."""
    g = lambda n: np.array(J[n][0], float)
    for s in "LR":
        sx = 1 if s == "L" else -1
        sh, el, wr = g(f"upper_arm.{s}"), g(f"forearm.{s}"), g(f"hand.{s}")
        w = smoothstep(sh[0] * sx + 0.02, sh[0] * sx + 0.09, sx * P[:, 0])
        d_up, d_fo = seg_dist(P, sh, el), seg_dist(P, el, wr)
        rad = 0.08 * max(1, up, fore)
        upm = (d_up <= d_fo) & (d_up < rad)
        fom = (d_fo < d_up) & (d_fo < rad * 0.9)
        t = np.clip(((P - sh) @ (el - sh)) / ((el - sh) @ (el - sh)), 0, 1)
        P = np.where(upm[:, None], radial(P, sh, el, up + (knob - up) * smoothstep(0.75, 1.0, t), w * upm), P)
        tt = np.clip(((P - el) @ (wr - el)) / ((wr - el) @ (wr - el)), 0, 1)
        k = fore + (knob - fore) * (1 - smoothstep(0.0, 0.25, tt)) + (0.04 if fore < 1 else 0) * smoothstep(0.85, 1, tt)
        P = np.where(fom[:, None], radial(P, el, wr, k, w * fom), P)
        hip, kn, an = g(f"thigh.{s}"), g(f"shin.{s}"), g(f"foot.{s}")
        legw = smoothstep(0.02, 0.06, sx * P[:, 0]) * smoothstep(hip[2] - 0.0, hip[2] - 0.11, P[:, 2]) \
            * smoothstep(an[2] + 0.01, an[2] + 0.06, P[:, 2])
        rad = 0.11 * max(1, thigh, shin)
        d_th, d_sh = seg_dist(P, hip, kn), seg_dist(P, kn, an)
        th = (d_th <= d_sh) & (d_th < rad)
        shm = (d_sh < d_th) & (d_sh < rad * 0.85)
        tz = (P[:, 2] - kn[2]) / (hip[2] - kn[2])
        P = np.where(th[:, None], radial(P, hip, kn, thigh + (knob - thigh) * (1 - smoothstep(0, 0.3, tz)), legw * th), P)
        tz = (kn[2] - P[:, 2]) / (kn[2] - an[2])
        k = shin + (knob - shin) * (1 - smoothstep(0, 0.25, tz)) + (0.06 if shin < 1 else 0) * smoothstep(0.8, 1, tz)
        P = np.where(shm[:, None], radial(P, kn, an, k, legw * shm), P)
    return P


def neck(P, k):
    nk = (np.abs(P[:, 0]) < 0.09)
    w = smoothstep(1.48, 1.53, P[:, 2]) * smoothstep(1.595, 1.565, P[:, 2]) * nk
    return radial(P, (0, -0.045, 1.45), (0, -0.045, 1.62), k, w)


def belly(P, sink=0.0, waist=1.0):
    """Sink (> 0) or push out (< 0) the belly under the ribs; pinch (< 1) or widen the waist."""
    P = P.copy()
    torso = (np.abs(P[:, 0]) < 0.19) & (P[:, 2] > 0.92) & (P[:, 2] < 1.32)
    zb = smoothstep(0.98, 1.06, P[:, 2]) * smoothstep(1.2, 1.12, P[:, 2]) * torso
    P[:, 1] += sink * zb * smoothstep(-0.09, -0.13, P[:, 1])
    zw = smoothstep(0.94, 1.04, P[:, 2]) * smoothstep(1.24, 1.1, P[:, 2]) * torso
    P[:, 0] *= 1 + (waist - 1) * zw
    return P


def chest(P, kx=1.0, ky=1.0, z0=1.15, z1=1.48):
    """Widen or narrow the ribcage (about the spine) between z0 and z1."""
    P = P.copy()
    w = smoothstep(z0 - 0.06, z0 + 0.04, P[:, 2]) * smoothstep(z1 + 0.06, z1 - 0.04, P[:, 2]) * (np.abs(P[:, 0]) < 0.3)
    P[:, 0] *= 1 + (kx - 1) * w
    P[:, 1] = -0.055 + (P[:, 1] + 0.055) * (1 + (ky - 1) * w)
    return P


def stretch_arms(k, x0=0.17):
    """A warp: everything past |x| = x0 (the arms, in the T-pose) pushed out by k."""
    def warp(P):
        P = np.array(P, float).copy()
        ax = np.abs(P[..., 0])
        out = np.where(ax > x0, x0 + (ax - x0) * k, ax)
        P[..., 0] = np.sign(P[..., 0]) * out
        return P
    return warp


def grow(k, about=(0, 0, 0)):
    def warp(P):
        return np.asarray(about) + (np.array(P, float) - np.asarray(about)) * k
    return warp


# ------------------------------------------------------------------ 01 the rotting zombie
def zombie_sculpt(f, H):
    eyes(f, H)
    cheeks(f, H)
    ears(f, H)
    brow(f, H)
    nose(f, H, "skull")
    mouth(f, H)


def zombie_reshape(V, J, H):
    P = limbs(V, J, 0.8, 0.78, 0.84, 0.84)
    P = neck(P, 0.84)
    return belly(P, sink=0.022, waist=0.92)


# ------------------------------------------------------------------ 02 the bloated drowner
def drowner_sculpt(f, H):
    # a swollen face: puffed lids round half-sunk eyes, fat cheeks and jowls, a slack mouth
    eyes(f, H, socket=(0.022, 0.016, 0.015), r=0.0145, ey=-0.147, cut=0.8)
    both(lambda sx: f.ellipsoid((sx * 0.037, -0.152, H["eye"] - 0.016), (0.02, 0.012, 0.009), soft=0.004))
    both(lambda sx: f.ellipsoid((sx * 0.055, -0.135, H["mouth"] + 0.014), (0.03, 0.026, 0.026), soft=0.008))
    both(lambda sx: f.ellipsoid((sx * 0.056, -0.11, H["chin"] + 0.012), (0.03, 0.035, 0.026), soft=0.008))
    f.ellipsoid((0, -0.118, H["chin"] - 0.012), (0.045, 0.04, 0.02), soft=0.008)       # the double chin
    ears(f, H, size=1.05)
    brow(f, H, 0.009, -0.158)
    nose(f, H, "bump")
    mouth(f, H, w=0.025, h=0.011, depth=0.012)
    # the body swells: a drum of a belly, fat flanks, puffy shoulders
    f.ellipsoid((0, -0.105, 1.10), (0.17, 0.14, 0.19), soft=0.03)
    both(lambda sx: f.ellipsoid((sx * 0.12, -0.04, 1.03), (0.07, 0.1, 0.1), soft=0.03))
    f.ellipsoid((0, -0.09, 1.33), (0.15, 0.09, 0.12), soft=0.03)
    # barnacle crusts: on a shoulder, the back, the scalp
    rng = np.random.default_rng(2)
    for c, n in (((0.14, -0.02, 1.47), 7), ((-0.06, 0.07, 1.30), 6), ((0.05, 0.03, 1.80), 4), ((-0.13, -0.08, 1.12), 5)):
        for _ in range(n):
            p = np.array(c) + rng.normal(0, 0.022, 3)
            r = rng.uniform(0.006, 0.011)
            f.capsule(p, p * 1.0 + (p - (0, -0.03, p[2])) / max(np.linalg.norm(p[:2] - (0, -0.03)), 1e-3) * 0.012,
                      r, r * 0.6, soft=0.0015)


def drowner_reshape(V, J, H):
    P = limbs(V, J, 1.22, 1.18, 1.22, 1.2, knob=1.05)
    P = neck(P, 1.25)
    return chest(P, 1.08, 1.12)


# ------------------------------------------------------------------ 03 the plague-bearer
def plague_sculpt(f, H):
    eyes(f, H, r=0.013)
    # his left eye swollen half shut under a fat lid
    f.ellipsoid((0.036, -0.152, H["eye"] + 0.006), (0.022, 0.014, 0.012), soft=0.003)
    cheeks(f, H, hollow=0.7)
    ears(f, H)
    brow(f, H)
    nose(f, H, "skull")
    mouth(f, H, w=0.028, h=0.01)
    # buboes: swollen glands at the neck and the armpits, a hump between the shoulders
    both(lambda sx: f.ellipsoid((sx * 0.045, -0.07, 1.545), (0.022, 0.02, 0.022), soft=0.005))
    both(lambda sx: f.ellipsoid((sx * 0.16, -0.05, 1.355), (0.03, 0.035, 0.03), soft=0.006))
    f.ellipsoid((0, 0.045, 1.40), (0.11, 0.06, 0.1), soft=0.02)
    rng = np.random.default_rng(3)
    for _ in range(26):          # boils, raised where the skin is mottled with them
        p = np.array((rng.uniform(-0.12, 0.12), rng.choice([-0.16, 0.05]), rng.uniform(1.0, 1.45)))
        p[1] += 0.005 if p[1] > 0 else -0.004
        r = rng.uniform(0.006, 0.012)
        f.ellipsoid(p, (r, r * 0.7, r), soft=0.002)


def plague_reshape(V, J, H):
    P = limbs(V, J, 0.82, 0.8, 0.86, 0.85)
    P = neck(P, 0.86)
    return belly(P, sink=0.018, waist=0.93)


# ------------------------------------------------------------------ 04 the tomb mummy
def mummy_sculpt(f, H):
    eyes(f, H, socket=(0.026, 0.024, 0.021), r=0.011, ey=-0.138)
    cheeks(f, H, bone=1.2, hollow=0.85, temple=0.6)
    ears(f, H, size=0.9)
    brow(f, H, 0.008)
    nose(f, H, "skull")
    mouth(f, H, w=0.026, h=0.009)
    # loose wrappings hanging: off a forearm, the waist, a shoulder
    def strip(a, b, w):
        d = np.array(b, float) - np.array(a, float)
        n = int(np.linalg.norm(d) / 0.012) + 1
        for i in range(n + 1):
            p = np.array(a, float) + d * i / n
            f.ellipsoid(p, (w, 0.004, 0.014), soft=0.0015)
    strip((0.40, -0.03, 1.40), (0.41, -0.035, 1.22), 0.014)
    strip((-0.30, 0.02, 1.405), (-0.31, 0.03, 1.27), 0.012)
    strip((0.08, -0.15, 0.99), (0.09, -0.16, 0.80), 0.016)
    strip((-0.11, 0.10, 0.98), (-0.12, 0.11, 0.84), 0.014)


def mummy_reshape(V, J, H):
    P = limbs(V, J, 0.76, 0.74, 0.8, 0.8, knob=0.93)
    P = neck(P, 0.8)
    P = chest(P, 0.95, 0.94)
    return belly(P, sink=0.028, waist=0.88)


# ------------------------------------------------------------------ 05 the ember husk
def ember_sculpt(f, H):
    eyes(f, H, socket=(0.025, 0.02, 0.018), r=0.0125, ey=-0.146)
    cheeks(f, H, bone=1.3, hollow=0.5)
    ears(f, H, size=0.85)
    brow(f, H, 0.0095, -0.159, 0.05)
    nose(f, H, "skull")
    mouth(f, H, w=0.03, h=0.011)
    # cracked slabs of char standing proud on the shoulders and forearms
    rng = np.random.default_rng(5)
    for c, n in (((0.2, -0.03, 1.46), 5), ((-0.2, -0.03, 1.46), 5), ((0.42, -0.06, 1.46), 4), ((-0.42, -0.06, 1.46), 4)):
        for _ in range(n):
            p = np.array(c) + rng.normal(0, (0.03, 0.015, 0.008), 3)
            f.ellipsoid(p, (0.02, 0.016, 0.009), rot("y", rng.uniform(-20, 20)), soft=0.002)


def ember_reshape(V, J, H):
    P = limbs(V, J, 1.08, 1.05, 1.02, 1.0, knob=1.0)
    return chest(P, 1.08, 1.06)


# ------------------------------------------------------------------ 06 the pale ghoul
def ghoul_sculpt(f, H):
    eyes(f, H, x=0.032, socket=(0.022, 0.02, 0.017), r=0.0115, ey=-0.142)
    cheeks(f, H, bone=1.35, hollow=0.8, temple=0.6)
    ears(f, H, size=1.25, point=1.0, tilt=-25, out=0.004)
    brow(f, H, 0.009, -0.16, 0.044)
    nose(f, H, "snout")
    # the maw: wide open, fangs above and below
    m = H["mouth"]
    f.ellipsoid((0, -0.16, m), (0.032, 0.02, 0.022), mode="cut", soft=0.003)
    f.ellipsoid((0, -0.15, m + 0.017), (0.03, 0.01, 0.006), soft=0.0015)
    f.ellipsoid((0, -0.15, m - 0.019), (0.028, 0.01, 0.006), soft=0.0015)
    for i, x in enumerate((-0.022, -0.012, 0.012, 0.022)):
        L = 0.024 if abs(x) > 0.015 else 0.016
        f.capsule((x, -0.158, m + 0.016), (x * 0.92, -0.162, m + 0.016 - L), 0.0042, 0.0006, mode="max", soft=0.001)
        f.capsule((x * 0.9, -0.156, m - 0.018), (x * 0.85, -0.16, m - 0.018 + L * 0.7), 0.0036, 0.0006, mode="max",
                  soft=0.001)
    # a ridge of vertebrae down the back
    for z in np.arange(1.0, 1.52, 0.035):
        f.ellipsoid((0, 0.045 - 0.02 * smoothstep(1.3, 1.52, z), z), (0.012, 0.012, 0.012), soft=0.004)


def ghoul_reshape(V, J, H):
    P = limbs(V, J, 0.78, 0.76, 0.82, 0.82, knob=0.95)
    P = neck(P, 0.82)
    P = chest(P, 0.94, 0.95)
    return belly(P, sink=0.03, waist=0.86)


# ------------------------------------------------------------------ 07 the chitin fiend
def fiend_sculpt(f, H):
    e = H["eye"]
    # great compound eyes bulging from the face, a plated brow, mandibles curving in
    both(lambda sx: f.ellipsoid((sx * 0.040, -0.164, e), (0.026, 0.022, 0.02), mode="cut", soft=0.003))
    both(lambda sx: f.ellipsoid((sx * 0.041, -0.150, e), (0.024, 0.02, 0.021), mode="max", soft=0.002))
    f.capsule((-0.06, -0.162, e + 0.03), (0.0, -0.17, e + 0.02), 0.009, 0.007, soft=0.003)
    f.capsule((0.06, -0.162, e + 0.03), (0.0, -0.17, e + 0.02), 0.009, 0.007, soft=0.003)
    f.capsule((0, -0.15, e + 0.06), (0, 0.07, H["top"] - 0.01), 0.012, 0.012, soft=0.004)   # a crest
    nose(f, H, "skull")
    mouth(f, H, w=0.022, h=0.012, depth=0.016)

    def mandible(sx):
        pts = [(sx * 0.052, -0.13, H["mouth"] + 0.005), (sx * 0.06, -0.17, H["mouth"] - 0.012),
               (sx * 0.042, -0.198, H["chin"] - 0.012), (sx * 0.016, -0.2, H["chin"] - 0.026)]
        rr = (0.010, 0.008, 0.0055, 0.0012)
        for i in range(3):
            f.capsule(pts[i], pts[i + 1], rr[i], rr[i + 1], mode="max", soft=0.0012)
        # little curved spines at the temples, where its ears would be
        f.capsule((sx * 0.088, -0.07, H["ear"] + 0.02), (sx * 0.118, -0.04, H["ear"] + 0.065), 0.009, 0.0015, soft=0.0015)
    both(mandible)
    # plate armour: pauldrons, a keel down the chest, plates down the spine and forearms
    both(lambda sx: f.ellipsoid((sx * 0.2, -0.045, 1.465), (0.075, 0.07, 0.045), rot("y", sx * 18), soft=0.004))
    for z in np.arange(1.04, 1.46, 0.045):
        f.ellipsoid((0, 0.05 + 0.01 * np.sin(z * 9), z), (0.045, 0.02, 0.02), soft=0.003)
    both(lambda sx: [f.ellipsoid((sx * x, -0.06, 1.455), (0.045, 0.034, 0.035), soft=0.003) for x in (0.40, 0.48)])
    both(lambda sx: f.ellipsoid((sx * 0.12, -0.1, 0.62), (0.05, 0.05, 0.08), soft=0.004))


def fiend_reshape(V, J, H):
    P = limbs(V, J, 1.0, 0.92, 0.95, 0.85, knob=1.02)
    P = chest(P, 1.12, 1.1)
    return belly(P, sink=0.02, waist=0.84)


# ------------------------------------------------------------------ 08 the deep maw
def maw_sculpt(f, H):
    m = H["mouth"]
    # a fish's face: the muzzle pushed out round a round mouth ringed with a lip, small far-set eyes
    f.ellipsoid((0, -0.15, m + 0.004), (0.05, 0.04, 0.042), soft=0.01)
    f.ellipsoid((0, -0.188, m), (0.026, 0.035, 0.026), mode="cut", soft=0.003)
    for a in np.linspace(0, 2 * np.pi, 18, endpoint=False):
        f.ellipsoid((0.029 * np.cos(a), -0.186, m + 0.029 * np.sin(a)), (0.007, 0.006, 0.007), soft=0.002)
    eyes(f, H, x=0.058, socket=(0.016, 0.016, 0.014), sy=-0.14, r=0.0115, ey=-0.124)
    brow(f, H, 0.008, -0.14, 0.065)
    # gill slits down the neck, a fin ridge from crown to spine
    both(lambda sx: [f.ellipsoid((sx * 0.05, -0.04 + i * 0.012, 1.55), (0.006, 0.003, 0.02), mode="cut", soft=0.002)
                     for i in range(3)])
    for z in np.arange(1.1, 1.82, 0.03):
        y = 0.05 if z < 1.5 else 0.05 + 0.04 * smoothstep(1.5, 1.75, z) - 0.06 * smoothstep(1.75, 1.82, z)
        f.ellipsoid((0, y + 0.004, z), (0.005, 0.016 + 0.01 * np.sin(z * 30) ** 2, 0.016), soft=0.002)


def maw_reshape(V, J, H):
    P = limbs(V, J, 1.05, 1.0, 1.06, 1.0, knob=1.0)
    P = neck(P, 1.12)
    return chest(P, 1.08, 1.08)


# ------------------------------------------------------------------ 09 the fungal husk
def fungal_sculpt(f, H):
    m = H["mouth"]
    eyes(f, H, socket=(0.022, 0.02, 0.017), r=0.012)
    cheeks(f, H, hollow=0.7)
    ears(f, H)
    brow(f, H)
    # a gaping vertical maw where the nose and mouth were, ridged with teeth either side
    f.ellipsoid((0, -0.162, m + 0.012), (0.018, 0.02, 0.04), mode="cut", soft=0.003)
    both(lambda sx: [f.capsule((sx * 0.012, -0.155, m + 0.012 + dz), (sx * 0.004, -0.157, m + 0.012 + dz), 0.003, 0.0008,
                               mode="max", soft=0.001) for dz in np.linspace(-0.03, 0.03, 7)])
    # bracket fungi: shelves in tiers on the shoulders, the back, a temple and an arm
    rng = np.random.default_rng(9)
    for c, n, out in (((0.17, -0.07, 1.42), 4, (0.3, -0.6, 0.2)), ((-0.17, -0.09, 1.40), 3, (-0.3, -0.6, 0.2)),
                      ((0.11, 0.07, 1.40), 4, (0.2, 0.7, 0.1)), ((-0.12, 0.08, 1.30), 3, (-0.2, 0.7, 0.0)),
                      ((0.085, -0.06, 1.74), 2, (0.6, -0.3, 0.2)), ((0.30, 0.02, 1.455), 3, (0.0, 0.5, 0.6)),
                      ((-0.14, -0.13, 1.06), 3, (-0.3, -0.7, 0.0)), ((0.13, 0.08, 1.12), 2, (0.3, 0.7, 0.0))):
        out = np.array(out, float) / np.linalg.norm(out)
        for i in range(n):
            p = np.array(c) + rng.normal(0, 0.012, 3) + np.array((0, 0, -0.022 * i))
            R = np.stack([out, np.cross((0, 0, 1), out) / max(np.linalg.norm(np.cross((0, 0, 1), out)), 1e-6),
                          (0, 0, 1)], 1)
            R[:, 2] = np.cross(R[:, 0], R[:, 1])
            r = rng.uniform(0.026, 0.04)
            f.ellipsoid(p + out * r * 0.45, (r, r * 1.1, 0.006), R, soft=0.002)


def fungal_reshape(V, J, H):
    P = limbs(V, J, 0.84, 0.82, 0.86, 0.86)
    P = neck(P, 0.88)
    return belly(P, sink=0.015, waist=0.94)


# ------------------------------------------------------------------ 10 the bog troll
def troll_sculpt(f, H):
    e = H["eye"]
    eyes(f, H, x=0.034, socket=(0.02, 0.016, 0.014), r=0.0105, ey=-0.146)
    brow(f, H, 0.015, -0.158, 0.06)
    f.ellipsoid((0, -0.14, H["brow"] + 0.012), (0.07, 0.03, 0.02), soft=0.006)
    nose(f, H, "wide")
    jaw(f, H, w=1.35, fwd=0.012, drop=0.008)
    mouth(f, H, w=0.036, h=0.009, depth=0.012, y=-0.166)
    # tusks from the underbite, up and out
    both(lambda sx: f.capsule((sx * 0.026, -0.166, H["mouth"] - 0.012), (sx * 0.034, -0.18, H["mouth"] + 0.026),
                              0.0058, 0.0012, mode="max", soft=0.001))
    both(lambda sx: f.ellipsoid((sx * 0.06, -0.14, e - 0.02), (0.025, 0.02, 0.016), soft=0.005))
    ears(f, H, size=0.95, out=0.004)
    # a back like a hill: trapezius into the neck, great shoulders, a gut
    f.ellipsoid((0, -0.01, 1.47), (0.17, 0.09, 0.08), soft=0.03)
    both(lambda sx: f.ellipsoid((sx * 0.19, -0.04, 1.43), (0.08, 0.08, 0.075), soft=0.02))
    f.ellipsoid((0, -0.11, 1.08), (0.17, 0.13, 0.17), soft=0.03)
    rng = np.random.default_rng(10)
    for _ in range(40):          # warts and lumps
        p = np.array((rng.uniform(-0.15, 0.15), rng.choice([-0.2, 0.07]), rng.uniform(0.95, 1.5)))
        r = rng.uniform(0.007, 0.014)
        f.ellipsoid(p, (r, r, r), soft=0.003)


def troll_reshape(V, J, H):
    P = limbs(V, J, 1.45, 1.5, 1.35, 1.32, knob=1.3)
    P = neck(P, 1.4)
    return chest(P, 1.18, 1.16)


MONSTERS = {
    "rotting_zombie": dict(
        skin="01", H=H_(),
        hands=dict(finger=(1.1, 0.0085, 0.0062), knuckle=0.0072, palm=(0.026, 0.94), spread=7),
        sculpt=zombie_sculpt, reshape=zombie_reshape, relief=0.016, tris=18000),
    "bloated_drowner": dict(
        skin="02", H=H_(),
        hands=dict(finger=(0.95, 0.0115, 0.0095), palm=(0.038, 1.1), spread=4),
        sculpt=drowner_sculpt, reshape=drowner_reshape, relief=0.012, tris=18000),
    "plague_bearer": dict(
        skin="03", H=H_(),
        hands=dict(finger=(1.08, 0.0085, 0.0065), knuckle=0.0075, palm=(0.027, 0.95), spread=9),
        sculpt=plague_sculpt, reshape=plague_reshape, relief=0.02, tris=18000),
    "tomb_mummy": dict(
        skin="04", H=H_(),
        hands=dict(finger=(1.1, 0.0078, 0.006), knuckle=0.0072, palm=(0.024, 0.9), spread=5),
        sculpt=mummy_sculpt, reshape=mummy_reshape, relief=0.016, tris=18000),
    "ember_husk": dict(
        skin="05", H=H_(),
        hands=dict(finger=(1.0, 0.01, 0.0078), knuckle=0.008, claw=0.012, palm=(0.032, 1.0), spread=10),
        sculpt=ember_sculpt, reshape=ember_reshape, relief=0.02, tris=18000),
    "pale_ghoul": dict(
        skin="06", H=H_(),
        hands=dict(finger=(1.4, 0.0078, 0.0055), knuckle=0.0075, claw=0.03, palm=(0.024, 0.9), spread=12),
        sculpt=ghoul_sculpt, reshape=ghoul_reshape, warp=stretch_arms(1.12), relief=0.014, tris=18000),
    "chitin_fiend": dict(
        skin="07", H=H_(eye_t=24.0),
        hands=dict(finger=(1.2, 0.0105, 0.008), knuckle=0.009, claw=0.045, palm=(0.03, 1.0), spread=14),
        sculpt=fiend_sculpt, reshape=fiend_reshape, relief=0.018, tris=19000),
    "deep_maw": dict(
        skin="08", H=H_(eye_t=32.0, mouth=1.630, nose=1.66),
        hands=dict(finger=(1.2, 0.009, 0.007), claw=0.014, palm=(0.028, 1.05), spread=16, web=True),
        sculpt=maw_sculpt, reshape=maw_reshape, relief=0.014, tris=18000),
    "fungal_husk": dict(
        skin="09", H=H_(),
        hands=dict(finger=(1.15, 0.0085, 0.0062), knuckle=0.008, claw=0.006, palm=(0.026, 0.95), spread=8),
        sculpt=fungal_sculpt, reshape=fungal_reshape, relief=0.016, tris=19000),
    "bog_troll": dict(
        skin="10", H=H_(),
        hands=dict(finger=(1.0, 0.0135, 0.0112), knuckle=0.0115, claw=0.008, palm=(0.042, 1.25), spread=6),
        sculpt=troll_sculpt, reshape=troll_reshape, warp=grow(1.12), relief=0.016, tris=19000),
}
