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


def profile(k_seg, k_knob, k_end, thick):
    """Thickness along a limb chain, u = 0 (shoulder or hip) .. 1 (elbow or knee) .. 2 (wrist or
    ankle). Thinned limbs keep knobbly joints; thickened ones swell smoothly across them (no step:
    a step at a joint reads as a sleeve hem, a cuff or a boot top) and ease back toward the hand
    and foot, which aren't scaled."""
    (k1, k2), knob = k_seg, k_knob
    if not thick:
        return [0, 0.75, 1, 1.25, 1.85, 2], [k1, k1, knob, k2, k2, k2 + k_end]
    knob = (k1 + k2) / 2 if knob is None else knob
    return [0, 0.35, 0.75, 1, 1.25, 1.7, 2], [1 + (k1 - 1) * 0.3, k1, k1, knob, k2, k2, 1 + (k2 - 1) * 0.45]


def chain(P, a, b, c, us, ks, w, reach):
    """Scale P toward the chain a-b-c by the profile (us, ks), where w (per vertex) is 1."""
    d1, d2 = seg_dist(P, a, b), seg_dist(P, b, c)
    t1 = np.clip(((P - a) @ (b - a)) / ((b - a) @ (b - a)), 0, 1)
    t2 = np.clip(((P - b) @ (c - b)) / ((c - b) @ (c - b)), 0, 1)
    first = d1 <= d2
    u = np.where(first, t1, 1 + t2)
    k = np.interp(u, us, ks)
    on = np.where(first, d1, d2) < reach
    # past the chain's root (the shoulder, the hip) scaling would push outward from a point and
    # raise a ridge where it stops: fade it out over 4 cm there
    over = np.maximum(0, -((P - a) @ (b - a)) / np.linalg.norm(b - a))
    w = w * np.clip(1 - over / 0.04, 0, 1)
    c1 = a + t1[:, None] * (b - a)
    c2 = b + t2[:, None] * (c - b)
    cen = np.where(first[:, None], c1, c2)
    kk = 1 - (1 - k) * w * on
    return cen + (P - cen) * kk[:, None]


def limbs(P, J, up=0.8, fore=0.78, thigh=0.84, shin=0.84, knob=0.95):
    """Limbs thinned (k < 1) or thickened (k > 1) toward their bones. Thinned ones keep a knob of
    `knob` at the elbows and knees; thickened ones (knob None: the mean of the two) swell through."""
    g = lambda n: np.array(J[n][0], float)
    for s in "LR":
        sx = 1 if s == "L" else -1
        sh, el, wr = g(f"upper_arm.{s}"), g(f"forearm.{s}"), g(f"hand.{s}")
        thick = up > 1 or fore > 1
        us, ks = profile((up, fore), knob if not thick else None, 0.04, thick)
        w = smoothstep(sh[0] * sx + (-0.04 if thick else 0.02), sh[0] * sx + (0.14 if thick else 0.09), sx * P[:, 0])
        P = chain(P, sh, el, wr, us, ks, w, 0.08 * max(1, up, fore))
        hip, kn, an = g(f"thigh.{s}"), g(f"shin.{s}"), g(f"foot.{s}")
        thick = thigh > 1 or shin > 1
        us, ks = profile((thigh, shin), knob if not thick else None, 0.06, thick)
        legw = smoothstep(0.02, 0.06, sx * P[:, 0]) * smoothstep(hip[2] - 0.0, hip[2] - 0.11, P[:, 2]) \
            * smoothstep(an[2] + 0.01, an[2] + 0.06, P[:, 2])
        P = chain(P, hip, kn, an, us, ks, legw, 0.11 * max(1, thigh, shin))
    return P


def head_move(P, fwd=0.0, down=0.0, scale=1.0, z0=1.50, z1=1.56):
    """The head (above the neck, blended in from z0 to z1) pushed forward, lowered and scaled."""
    w = smoothstep(z0, z1, P[:, 2])[:, None]
    c = np.array((0, -0.05, 1.62))
    Q = c + (P - c) * scale + np.array((0, -fwd, -down))
    return P + (Q - P) * w


def bumps(V, N, n, where, r=(0.008, 0.016), h=(0.005, 0.011), seed=0, flat=False):
    """n bumps raised on the surface (boils, blisters, warts, barnacles): each at a random vertex
    where `where(V)` is true, a dome of radius r and height h along the surface normals."""
    from scipy.spatial import cKDTree
    rng = np.random.default_rng(seed)
    idx = np.nonzero(where(V))[0]
    if not len(idx):
        return V
    tree = cKDTree(V)
    V = V.copy()
    for i in rng.choice(idx, size=min(n, len(idx)), replace=False):
        rr, hh = rng.uniform(*r), rng.uniform(*h)
        near = tree.query_ball_point(V[i], rr)
        d = np.linalg.norm(V[near] - V[i], axis=1) / rr
        prof = np.clip(1 - d * d, 0, 1) ** (0.5 if flat else 2)
        V[near] += N[near] * (hh * prof)[:, None]
    return V


def zone(x=None, y=None, z=None):
    """A test on vertices: each of x, y, z a (lo, hi) range (x as |x| if given as ('abs', lo, hi))."""
    def t(V):
        m = np.ones(len(V), bool)
        for k, rng in enumerate((x, y, z)):
            if rng is None:
                continue
            if rng[0] == "abs":
                m &= (np.abs(V[:, k]) >= rng[1]) & (np.abs(V[:, k]) <= rng[2])
            else:
                m &= (V[:, k] >= rng[0]) & (V[:, k] <= rng[1])
        return m
    return t


def either(*fs):
    return lambda V: np.logical_or.reduce([f(V) for f in fs])


def neck(P, k):
    nk = smoothstep(0.11, 0.08, np.abs(P[:, 0]))
    if k > 1:        # swelling: eased in over the shoulders and out under the jaw (no collar, no ruff)
        w = smoothstep(1.42, 1.52, P[:, 2]) * smoothstep(1.62, 1.56, P[:, 2]) * nk
    else:
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


def pecs(P, back=0.012):
    """The lower pecs pushed back (a painted chest's relief can raise them into breasts)."""
    P = P.copy()
    w = smoothstep(1.24, 1.30, P[:, 2]) * smoothstep(1.42, 1.36, P[:, 2]) * smoothstep(-0.09, -0.12, P[:, 1]) \
        * smoothstep(0.17, 0.12, np.abs(P[:, 0])) * smoothstep(0.0, 0.03, np.abs(P[:, 0]))
    P[:, 1] += back * w
    return P


def hips(P, waist=1.0, glutes=1.0, hip=1.0):
    """A man's back: waist widened, buttocks flattened toward the pelvis, hips narrowed."""
    P = P.copy()
    torso = smoothstep(0.24, 0.19, np.abs(P[:, 0]))
    zw = smoothstep(0.98, 1.06, P[:, 2]) * smoothstep(1.26, 1.14, P[:, 2]) * torso
    P[:, 0] *= 1 + (waist - 1) * zw
    zg = smoothstep(0.80, 0.88, P[:, 2]) * smoothstep(1.04, 0.96, P[:, 2]) * torso
    back = smoothstep(-0.03, 0.01, P[:, 1])
    P[:, 1] = np.where(back > 0, -0.03 + (P[:, 1] + 0.03) * (1 + (glutes - 1) * zg * back), P[:, 1])
    zh = smoothstep(0.86, 0.92, P[:, 2]) * smoothstep(1.04, 0.98, P[:, 2]) * torso
    P[:, 0] *= 1 + (hip - 1) * zh
    return P


def chest(P, kx=1.0, ky=1.0, z0=1.15, z1=1.48):
    """Widen or narrow the ribcage (about the spine) between z0 and z1."""
    P = P.copy()
    w = smoothstep(z0 - 0.06, z0 + 0.04, P[:, 2]) * smoothstep(z1 + 0.06, z1 - 0.04, P[:, 2]) * (np.abs(P[:, 0]) < 0.3)
    P[:, 0] *= 1 + (kx - 1) * w
    P[:, 1] = -0.055 + (P[:, 1] + 0.055) * (1 + (ky - 1) * w)
    return P


def head(fwd=0.0, down=0.0, scale=1.0, z0=1.50, z1=1.56, then=None):
    """A warp: the head pushed forward, lowered and scaled (head_move), then `then`."""
    def warp(P):
        P = np.array(P, float)
        Q = head_move(P.reshape(-1, 3), fwd, down, scale, z0, z1).reshape(P.shape)
        return then(Q) if then else Q
    return warp


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
    # a swollen face: puffed lids round half-sunk eyes (forward enough that their whites show),
    # fat cheeks and jowls, a slack mouth; no chin wad (it read as a goatee)
    eyes(f, H, socket=(0.022, 0.016, 0.015), r=0.015, ey=-0.157, cut=0.6)
    both(lambda sx: f.ellipsoid((sx * 0.037, -0.152, H["eye"] - 0.016), (0.02, 0.012, 0.009), soft=0.004))
    both(lambda sx: f.ellipsoid((sx * 0.055, -0.135, H["mouth"] + 0.014), (0.03, 0.026, 0.026), soft=0.008))
    both(lambda sx: f.ellipsoid((sx * 0.05, -0.12, H["chin"] + 0.016), (0.01, 0.011, 0.008), soft=0.008))
    ears(f, H, size=1.05)
    brow(f, H, 0.009, -0.158)
    nose(f, H, "bump")
    mouth(f, H, w=0.025, h=0.011, depth=0.012)
    # the body swells: a drum of a belly well forward, fat flanks, a thick waist, soft breasts of fat
    # (all soft-edged over 6 cm, so the swelling melts into the chest and the hips)
    f.ellipsoid((0, -0.112, 1.09), (0.185, 0.165, 0.24), soft=0.06)
    both(lambda sx: f.ellipsoid((sx * 0.13, -0.05, 1.05), (0.08, 0.12, 0.14), soft=0.085))
    f.ellipsoid((0, -0.08, 1.31), (0.15, 0.1, 0.12), soft=0.05)
    f.ellipsoid((0, 0.03, 1.10), (0.16, 0.08, 0.16), soft=0.06)


def drowner_reshape(V, J, H):
    P = limbs(V, J, 1.2, 1.32, 1.45, 1.4)
    P = neck(P, 1.3)
    return chest(P, 1.08, 1.12)


def drowner_post(V, N, J, H):
    # barnacle crusts in clusters: on the shoulder blades, one forearm, a flank (none at the neck)
    for c, n, sd in (((0.08, 0.06, 1.34), 9, 1), ((-0.07, 0.06, 1.30), 7, 2), ((0.45, -0.07, 1.43), 6, 3),
                     ((-0.15, -0.04, 1.08), 6, 4)):
        near = lambda V, c=c: np.linalg.norm(V - np.array(c), axis=1) < 0.05
        V = bumps(V, N, n, near, r=(0.007, 0.012), h=(0.006, 0.01), seed=sd, flat=True)
    return V


# ------------------------------------------------------------------ 03 the plague-bearer
def plague_sculpt(f, H):
    eyes(f, H, r=0.013)
    # his left eye swollen half shut under a fat lid
    f.ellipsoid((0.036, -0.152, H["eye"] + 0.006), (0.022, 0.014, 0.012), soft=0.003)
    cheeks(f, H, hollow=0.7)
    ears(f, H, size=0.7)
    brow(f, H)
    nose(f, H, "skull")
    mouth(f, H, w=0.028, h=0.01)
    # a goitre swelling the right of the neck, and a hump between the shoulders
    f.ellipsoid((0.05, -0.08, 1.53), (0.047, 0.046, 0.044), soft=0.016)       # a 9 cm goitre, his left
    # the hump between the shoulder blades in lumps (one smooth mass read as a hood)
    for c, r in (((0.05, 0.07, 1.36), (0.06, 0.05, 0.06)), ((-0.02, 0.066, 1.30), (0.05, 0.045, 0.05)),
                 ((0.075, 0.056, 1.25), (0.045, 0.04, 0.045))):
        f.ellipsoid(c, r, soft=0.02)
    # great buboes, 6-8 cm, heaped on his left shoulder so they break his outline
    for x, y, r in ((0.15, -0.03, 0.036), (0.21, -0.05, 0.032), (0.12, 0.02, 0.03), (0.2, 0.0, 0.028)):
        root = f.surface((x, y, 1.40), (0, 0, 1))
        f.ellipsoid(root + (0, 0, r * 0.35), (r, r, r * 0.9), soft=0.005)


def plague_reshape(V, J, H):
    P = limbs(V, J, 0.82, 0.8, 0.86, 0.85)
    P = hips(P, waist=1.06, glutes=0.9)
    P = neck(P, 0.86)
    return belly(P, sink=0.012, waist=1.0)


def plague_post(V, N, J, H):
    # great buboes clustered on his left shoulder and the back of the neck (they must read at 10 m),
    # smaller boils over the shoulders, upper back and forearms
    big = zone(x=("abs", 0.0, 0.07), y=(0.0, 0.2), z=(1.45, 1.6))
    V = bumps(V, N, 6, big, r=(0.016, 0.025), h=(0.01, 0.016), seed=33)
    where = either(zone(x=("abs", 0.0, 0.28), z=(1.36, 1.56)), zone(y=(0.02, 0.2), z=(1.15, 1.5)),
                   zone(x=("abs", 0.36, 0.56)))
    return bumps(V, N, 18, where, r=(0.008, 0.014), h=(0.005, 0.01), seed=31)


# ------------------------------------------------------------------ 04 the tomb mummy
def mummy_sculpt(f, H):
    eyes(f, H, socket=(0.026, 0.03, 0.021), r=0.012, ey=-0.142)
    cheeks(f, H, bone=1.2, hollow=0.85, temple=0.6)
    ears(f, H, size=0.9)
    brow(f, H, 0.008)
    nose(f, H, "skull")
    mouth(f, H, w=0.026, h=0.01)
    # a row of long dry teeth in the open mouth
    for x in np.linspace(-0.017, 0.017, 7):
        f.capsule((x, -0.16, H["mouth"] + 0.009), (x * 1.02, -0.167, H["mouth"] - 0.004), 0.003, 0.0022,
                  mode="max", soft=0.0008)
    # a band of wrapping round the brow and one slanting over the crown
    for a in np.linspace(0, 2 * np.pi, 40, endpoint=False):
        f.ellipsoid((0.097 * np.sin(a), H["cy"] - 0.118 * np.cos(a), H["brow"] + 0.022 + 0.012 * np.sin(a)),
                    (0.008, 0.008, 0.017), soft=0.002)
    for a in np.linspace(-1.2, 1.9, 30):
        f.ellipsoid((0.09 * np.sin(a), H["cy"] + 0.03, H["ear"] + 0.12 * np.cos(a) * 0.95), (0.008, 0.018, 0.008),
                    soft=0.002)
    # loose wrappings trailing: off both forearms, a hip, the back of the neck, a thigh
    def strip(pts, w0, w1, seed):
        rng = np.random.default_rng(seed)
        pts = np.array(pts, float)
        for k in range(len(pts) - 1):
            a, b = pts[k], pts[k + 1]
            n = int(np.linalg.norm(b - a) / 0.01) + 1
            for i in range(n):
                t = (k + i / n) / (len(pts) - 1)
                p = a + (b - a) * i / n
                w = w0 + (w1 - w0) * t
                f.ellipsoid(p, (w, 0.0035, 0.009), rot("z", rng.uniform(-25, 25)), soft=0.0012)
    # flat ribbons 3-4 cm wide and 20-30 cm long, hanging and swaying: off the hips, the back, the
    # neck and the forearms (painted linen in MUMMY_PAINT)
    for k, pts in enumerate(MUMMY_RIBBONS):
        strip(pts, 0.019, 0.008, k + 1)


MUMMY_RIBBONS = [
    [(0.1, -0.15, 0.99), (0.11, -0.17, 0.88), (0.13, -0.175, 0.76), (0.12, -0.17, 0.68)],
    [(-0.11, 0.085, 0.98), (-0.12, 0.1, 0.86), (-0.11, 0.105, 0.74)],
    [(0.12, 0.07, 1.0), (0.13, 0.09, 0.88), (0.12, 0.1, 0.8)],
    [(-0.02, 0.06, 1.52), (-0.03, 0.095, 1.42), (-0.05, 0.105, 1.3), (-0.04, 0.1, 1.22)],
    [(0.42, -0.03, 1.41), (0.43, -0.04, 1.30), (0.46, -0.02, 1.20)],
    [(0.48, -0.06, 1.41), (0.49, -0.07, 1.31), (0.5, -0.06, 1.24)],
    [(-0.36, 0.02, 1.405), (-0.37, 0.035, 1.30), (-0.35, 0.03, 1.2)],
    [(-0.46, -0.03, 1.41), (-0.47, -0.04, 1.31)],
]


def mummy_paint(H):
    out = [("seg", a, b, 0.024, (0.8, 0.74, 0.6)) for r in MUMMY_RIBBONS for a, b in zip(r, r[1:])]
    out += [("ell", (0, H["cy"], H["brow"] + 0.022), (0.13, 0.15, 0.03), (0.8, 0.74, 0.6)),
            ("seg", (0, H["cy"] - 0.162, H["mouth"] + 0.006), (0, H["cy"] - 0.162, H["mouth"] + 0.006), 0.022, (0.86, 0.8, 0.66))]
    return out


def mummy_reshape(V, J, H):
    P = limbs(V, J, 0.7, 0.68, 0.74, 0.74, knob=0.9)
    P = neck(P, 0.78)
    P = chest(P, 0.95, 0.94)
    return belly(P, sink=0.035, waist=1.0)


# ------------------------------------------------------------------ 05 the ember husk
def ember_sculpt(f, H):
    eyes(f, H, socket=(0.025, 0.02, 0.018), r=0.0125, ey=-0.149)
    cheeks(f, H, bone=1.3, hollow=0.5)
    ears(f, H, size=0.85)
    brow(f, H, 0.0068, -0.159, 0.05)
    nose(f, H, "skull")
    mouth(f, H, w=0.03, h=0.012)
    # charred cavities burned into the body, glowing inside: chest, flank, a forearm, a thigh
    for c, d, r in EMBER_HOLES:
        c, d = np.array(c), np.array(d) / np.linalg.norm(d)
        u = np.cross(d, (0, 0, 1)) if abs(d[2]) < 0.9 else np.array((1.0, 0, 0))
        u /= np.linalg.norm(u)
        v = np.cross(d, u)
        for a in np.linspace(0, 2 * np.pi, 10, endpoint=False):       # a charred rim, raised round it
            f.ellipsoid(c + (u * np.cos(a) * r[0] + v * np.sin(a) * r[2]) * 1.1 - d * 0.004, (0.009, 0.009, 0.009),
                        soft=0.003)
        f.ellipsoid(c + d * 0.004, r, mode="cut", soft=0.004)


# cavities: (on the surface, the way in, radii): the chest, a flank, the upper back
EMBER_HOLES = [((0.065, -0.162, 1.26), (0, 1, 0), (0.032, 0.026, 0.042)),
               ((-0.125, -0.07, 1.13), (1, 0.2, 0), (0.026, 0.035, 0.05)),
               ((0.075, 0.062, 1.36), (0, -1, 0), (0.03, 0.026, 0.04))]


def ember_reshape(V, J, H):
    return limbs(V, J, 0.95, 0.92, 0.95, 0.92)


def ember_glow(H):
    """Embers: a 1 cm pupil deep in each socket, the gap of the mouth, the bottom of each cavity."""
    out = [((sx * 0.036, -0.158, H["eye"]), 0.0095, (1.0, 0.42, 0.08)) for sx in (1, -1)]
    out.append(((0, -0.146, H["mouth"]), 0.009, (0.7, 0.22, 0.04)))
    for c, d, r in EMBER_HOLES:
        d = np.array(d) / np.linalg.norm(d)
        out.append((tuple(np.array(c) + d * (min(r) * 0.9)), 0.016, (0.8, 0.28, 0.05)))
    return out


# ------------------------------------------------------------------ 06 the pale ghoul
def ghoul_sculpt(f, H):
    eyes(f, H, x=0.032, socket=(0.022, 0.02, 0.017), r=0.0115, ey=-0.142)
    cheeks(f, H, bone=1.35, hollow=0.8, temple=0.6)
    def bat_ear(sx):
        R = rot("y", sx * 30) @ rot("x", -30)          # out 30 degrees, back 30
        c = np.array((sx * 0.1, H["cy"] + 0.012, H["ear"] + 0.03))
        f.ellipsoid(c + R @ np.array((0, 0, 0.012)), (0.009, 0.029, 0.056), R, soft=0.002)
        f.ellipsoid(c + R @ np.array((sx * 0.004, -0.008, 0.016)), (0.005, 0.021, 0.044), R, mode="cut", soft=0.002)
        f.capsule(c + R @ np.array((0, 0.006, 0.05)), c + R @ np.array((0, 0.014, 0.09)), 0.008, 0.0015, soft=0.0015)
    both(bat_ear)
    brow(f, H, 0.009, -0.16, 0.044)
    both(lambda sx: f.ellipsoid((sx * 0.006, -0.17, H["nose"]), (0.0035, 0.005, 0.006), mode="cut", soft=0.0015))
    # the maw: wide open, fangs well past the lips
    m = H["mouth"]
    f.ellipsoid((0, -0.162, m - 0.002), (0.042, 0.025, 0.03), mode="cut", soft=0.003)
    f.ellipsoid((0, -0.15, m + 0.024), (0.036, 0.01, 0.006), soft=0.0015)
    f.ellipsoid((0, -0.15, m - 0.028), (0.034, 0.01, 0.006), soft=0.0015)
    both(lambda sx: f.capsule(*GHOUL_FANGS[0](sx, m), 0.0052, 0.0008, mode="max", soft=0.0008))   # upper canines
    both(lambda sx: f.capsule((sx * 0.011, -0.16, m + 0.022), (sx * 0.010, -0.166, m + 0.006), 0.003, 0.0005,
                              mode="max", soft=0.0008))
    both(lambda sx: f.capsule((sx * 0.015, -0.166, m - 0.026), (sx * 0.014, -0.178, m - 0.004), 0.0045, 0.0008,
                              mode="max", soft=0.0008))     # lower fangs, 2.5 cm
    # a hunch: the upper back rounded up into the neck; the ridge of the spine over it
    f.ellipsoid((0, 0.05, 1.43), (0.11, 0.075, 0.11), soft=0.03)
    for z in np.arange(1.0, 1.52, 0.035):
        f.ellipsoid((0, 0.047 + 0.03 * smoothstep(1.3, 1.45, z) - 0.02 * smoothstep(1.47, 1.52, z), z),
                    (0.011, 0.011, 0.011), soft=0.004)


GHOUL_FANGS = [lambda sx, m: ((sx * 0.021, -0.168, m + 0.022), (sx * 0.019, -0.188, m - 0.018)),
               lambda sx, m: ((sx * 0.015, -0.166, m - 0.026), (sx * 0.014, -0.178, m - 0.004))]


def ghoul_paint(H):
    """The fangs bone-pale, tip to root (the mouth's dark paint landed on them)."""
    return [("seg", *GHOUL_FANGS[k](sx, H["mouth"]), 0.008, (0.86, 0.8, 0.66)) for k in (0, 1) for sx in (1, -1)]


def ghoul_reshape(V, J, H):
    P = limbs(V, J, 0.78, 0.76, 0.82, 0.82, knob=0.95)
    P = neck(P, 0.82)
    P = chest(P, 0.94, 0.95)
    P = belly(P, sink=0.025, waist=1.03)
    return hips(P, waist=1.05, glutes=0.88)


# ------------------------------------------------------------------ 07 the chitin fiend
def fiend_sculpt(f, H):
    e, m = H["eye"], H["mouth"]
    # great compound eyes bulging from the face, a plated brow, pincer mandibles
    both(lambda sx: f.ellipsoid((sx * 0.040, -0.164, e), (0.026, 0.022, 0.02), mode="cut", soft=0.003))
    both(lambda sx: f.ellipsoid((sx * 0.041, -0.150, e), (0.024, 0.02, 0.021), mode="max", soft=0.002))
    f.capsule((-0.06, -0.162, e + 0.03), (0.0, -0.17, e + 0.02), 0.009, 0.007, soft=0.003)
    f.capsule((0.06, -0.162, e + 0.03), (0.0, -0.17, e + 0.02), 0.009, 0.007, soft=0.003)
    for x in (-0.022, 0.0, 0.022):      # a low crest of three ridges over the crown
        f.capsule((x, -0.15, e + 0.055), (x * 0.6, 0.06, H["top"] - 0.03), 0.006, 0.005, soft=0.003)
    nose(f, H, "skull")
    mouth(f, H, w=0.022, h=0.012, depth=0.016)

    def mandible(sx):
        pts = [(sx * 0.062, -0.12, m - 0.008), (sx * 0.068, -0.165, m - 0.003), (sx * 0.052, -0.205, m + 0.006),
               (sx * 0.022, -0.226, m + 0.012), (sx * 0.006, -0.222, m + 0.014)]
        rr = (0.013, 0.011, 0.008, 0.0045, 0.0018)
        for i in range(4):
            f.capsule(pts[i], pts[i + 1], rr[i], rr[i + 1], mode="max", soft=0.0012)
        f.capsule((sx * 0.088, -0.07, H["ear"] + 0.02), (sx * 0.118, -0.04, H["ear"] + 0.065), 0.009, 0.0015,
                  soft=0.0015)
    both(mandible)

    # shoulder plates in three overlapping points, a keel down the back, spines along the spine
    def plates(sx):
        for k, (x, z, r) in enumerate(((0.16, 1.48, 0.05), (0.21, 1.465, 0.045), (0.255, 1.445, 0.038))):
            f.ellipsoid((sx * x, -0.05, z), (r, 0.055, 0.024), rot("y", sx * (14 + 8 * k)), soft=0.003)
            f.capsule((sx * (x + r * 0.6), -0.05, z + 0.01), (sx * (x + r * 1.15), -0.05, z + 0.035), 0.008, 0.001,
                      mode="max", soft=0.001)
    both(plates)
    for z in np.arange(1.04, 1.46, 0.045):
        f.ellipsoid((0, 0.05 + 0.01 * np.sin(z * 9), z), (0.045, 0.02, 0.02), soft=0.003)
    for z in (1.12, 1.2, 1.28, 1.36, 1.44):
        f.capsule((0, 0.05, z), (0, 0.088, z + 0.02), 0.008, 0.0012, mode="max", soft=0.001)
    both(lambda sx: [f.ellipsoid((sx * x, -0.06, 1.455), (0.045, 0.034, 0.035), soft=0.003) for x in (0.40, 0.48)])
    both(lambda sx: f.ellipsoid((sx * 0.12, -0.1, 0.62), (0.05, 0.05, 0.08), soft=0.004))


def fiend_reshape(V, J, H):
    P = limbs(V, J, 1.0, 0.92, 0.95, 0.85, knob=1.02)
    P = chest(P, 1.12, 1.1)
    P = belly(P, sink=0.02, waist=1.0)
    return hips(P, waist=1.08, glutes=0.88)


# ------------------------------------------------------------------ 08 the deep maw
def fin(f, base, height, r0=0.01, r1=0.005, step=0.0045, on_back=False):
    """A fin along the polyline `base` [(x, y, z)], rays standing out from it (away from the
    body's axis, in the y-z plane) `height` [m per point] tall: a membrane with ridged rays.
    on_back: each base point is first moved onto the clay's back surface at its height."""
    base = np.array(base, float)
    if on_back:
        for p in base:
            y = f.surface_y(p[2], p[0])
            if y is not None:
                p[1] = y - 0.004
    hs = np.array(height, float)
    L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(base, axis=0), axis=1))]
    for s in np.arange(0, L[-1], step):
        p = np.array([np.interp(s, L, base[:, k]) for k in range(3)])
        h = np.interp(s, L, hs)
        i = min(np.searchsorted(L, s), len(base) - 1)
        tan = base[i] - base[max(i - 1, 0)] if i else base[1] - base[0]
        tan /= np.linalg.norm(tan)
        out = np.cross(tan, (1, 0, 0))
        if out @ (p - (0, -0.05, p[2])) < 0:
            out = -out
        out /= np.linalg.norm(out)
        f.capsule(p - out * 0.006, p + out * h + tan * h * 0.25, r0, r1, mode="max", soft=0.0012)


def maw_sculpt(f, H):
    m = H["mouth"]
    # a fish's face: the muzzle pushed out round a round mouth ringed with a flaring lip, small far-set eyes
    f.ellipsoid((0, -0.142, m + 0.004), (0.05, 0.034, 0.042), soft=0.01)
    f.ellipsoid((0, -0.172, m), (0.027, 0.03, 0.027), mode="cut", soft=0.003)
    for a in np.linspace(0, 2 * np.pi, 26, endpoint=False):       # the rim flares wider than its base
        f.ellipsoid((0.038 * np.cos(a), -0.168, m + 0.038 * np.sin(a)), (0.0095, 0.005, 0.0095), soft=0.003)
    eyes(f, H, x=0.058, socket=(0.016, 0.016, 0.014), sy=-0.14, r=0.0115, ey=-0.126)
    brow(f, H, 0.008, -0.14, 0.065)
    both(lambda sx: [f.ellipsoid((sx * 0.055, -0.04 + i * 0.012, 1.55), (0.006, 0.003, 0.02), mode="cut", soft=0.002)
                     for i in range(3)])
    # the dorsal fin, crown to sacrum, tallest over the shoulders
    fin(f, [(0, -0.03, 1.80), (0, 0.03, 1.765), (0, 0.06, 1.70), (0, 0.045, 1.62), (0, 0.02, 1.55),
            (0, 0.045, 1.48), (0, 0.062, 1.38), (0, 0.058, 1.25), (0, 0.05, 1.12), (0, 0.055, 1.0)],
        [0.035, 0.048, 0.058, 0.062, 0.07, 0.085, 0.09, 0.075, 0.05, 0.018], on_back=True)
    # small fins down the backs of the forearms and calves
    for sx in (1, -1):
        fin(f, [(sx * 0.36, -0.03, 1.44), (sx * 0.52, -0.05, 1.445)], [0.022, 0.035], 0.004)
        fin(f, [(sx * 0.12, 0.0, 0.47), (sx * 0.122, 0.0, 0.18)], [0.035, 0.018], 0.004, on_back=True)


def maw_reshape(V, J, H):
    P = limbs(V, J, 1.05, 1.0, 1.06, 1.0)
    P = neck(P, 1.25)
    return chest(P, 1.08, 1.08)


# ------------------------------------------------------------------ 09 the fungal husk
def fungal_sculpt(f, H):
    m = H["mouth"]
    eyes(f, H, socket=(0.022, 0.02, 0.017), r=0.012)
    cheeks(f, H, hollow=0.7)
    ears(f, H)
    brow(f, H)
    # a gaping vertical maw where the nose and mouth were, ridged with long teeth either side
    f.ellipsoid((0, -0.162, m + 0.014), (0.02, 0.03, 0.045), mode="cut", soft=0.003)
    both(lambda sx: [f.capsule((sx * 0.018, -0.158, m + 0.014 + dz), (sx * 0.003, -0.16, m + 0.014 + dz), 0.0034,
                               0.0007, mode="max", soft=0.001) for dz in np.linspace(-0.034, 0.034, 9)])
    # bracket fungi, 7-12 cm across, single shelves tilted up 15 degrees, in tiers of two or three;
    # each rooted where a ray from inside the body meets its skin, painted fungus-pale (FUNGAL_PAINT)
    for c, ang, r, tiers in FUNGAL_SHELVES:
        a = np.radians(ang)
        out = np.array((np.cos(a), np.sin(a), 0))
        for t in range(tiers):
            rr = r * (1 - 0.2 * t)
            root = f.surface(np.array(c) + (0, 0, -0.036 * t), out)
            f.ellipsoid(root + out * rr * 0.55, (rr, rr * 1.2, 0.01), rot("z", ang) @ rot("y", -15), soft=0.0025)


# (inside the body, out direction in degrees from +x his left toward +y his back, radius, tiers):
# up the left of the head, the left shoulder and collarbone, the right shoulder, down the back,
# the ribs and the right thigh
FUNGAL_SHELVES = [((0.0, -0.05, 1.72), 0, 0.06, 2), ((0.12, -0.05, 1.44), 0, 0.06, 3),
                  ((0.07, -0.08, 1.42), 300, 0.045, 2), ((-0.12, -0.05, 1.45), 180, 0.06, 3),
                  ((0.05, -0.0, 1.40), 70, 0.06, 3), ((-0.04, 0.0, 1.24), 105, 0.055, 2),
                  ((0.05, -0.06, 1.18), 20, 0.05, 2), ((-0.10, -0.07, 0.72), 235, 0.045, 2),
                  ((0.06, -0.02, 1.05), 55, 0.045, 2)]


def fungal_paint(H):
    out = []
    for c, ang, r, tiers in FUNGAL_SHELVES:
        a = np.radians(ang)
        d = np.array((np.cos(a), np.sin(a), 0))
        for t in range(tiers):
            p = np.array(c) + (0, 0, -0.036 * t) + d * (0.09 + r * 0.5)
            out.append(("ell", tuple(p), (r * 1.15, r * 1.15, 0.02), (0.74, 0.64, 0.42)))
    return out


def fungal_reshape(V, J, H):
    P = limbs(V, J, 0.84, 0.82, 0.86, 0.86)
    P = neck(P, 0.88)
    P = belly(P, sink=0.012, waist=1.0)
    P = pecs(P, 0.015)
    return hips(P, waist=1.12, glutes=0.85)


def fungal_post(V, N, J, H):
    # orange spore blisters, clustered on the chest, shoulders and back
    where = either(zone(x=("abs", 0.0, 0.2), z=(1.1, 1.5)), zone(x=("abs", 0.15, 0.3), z=(1.38, 1.5)))
    return bumps(V, N, 22, where, r=(0.01, 0.016), h=(0.008, 0.014), seed=91)


# ------------------------------------------------------------------ 10 the bog troll
def troll_sculpt(f, H):
    e, m = H["eye"], H["mouth"]
    eyes(f, H, x=0.034, socket=(0.02, 0.016, 0.014), r=0.0105, ey=-0.148)
    brow(f, H, 0.0072, -0.158, 0.054)
    nose(f, H, "wide")
    jaw(f, H, w=1.05, fwd=0.01, drop=0.004)
    mouth(f, H, w=0.036, h=0.009, depth=0.012, y=-0.166)
    # tusks from the lower jaw, up and out past the lip, splayed
    # tusks from the corners of the lower jaw: 7 cm, 60 degrees up, splayed out 15
    d = np.array((np.sin(np.radians(15)) * 0.5, -0.5, np.sin(np.radians(60))))
    d /= np.linalg.norm(d)
    both(lambda sx: f.capsule((sx * 0.03, -0.158, m - 0.02), (sx * (0.03 + d[0] * 0.07), -0.158 + d[1] * 0.07,
                              m - 0.02 + d[2] * 0.07), 0.0085, 0.0018, mode="max", soft=0.001))
    both(lambda sx: f.ellipsoid((sx * 0.058, -0.14, e - 0.02), (0.016, 0.013, 0.01), soft=0.005))
    ears(f, H, size=0.95, out=0.004)
    # one great hump: the trapezius sloping from the back of the skull to the shoulders
    f.ellipsoid((0, 0.0, 1.47), (0.17, 0.11, 0.12), soft=0.045)
    f.ellipsoid((0, 0.05, 1.36), (0.16, 0.08, 0.14), soft=0.045)
    both(lambda sx: f.ellipsoid((sx * 0.2, -0.05, 1.43), (0.072, 0.07, 0.07), soft=0.03))   # shoulders
    f.ellipsoid((0, -0.1, 1.08), (0.12, 0.075, 0.12), soft=0.035)          # the gut, smaller
    # thick round limbs (capsules: the base's forearms are flat paddles)
    for sx in (1, -1):
        f.capsule((sx * 0.16, -0.06, 1.432), (sx * 0.334, -0.058, 1.432), 0.052, 0.046, soft=0.012)
        f.capsule((sx * 0.334, -0.058, 1.432), (sx * 0.55, -0.08, 1.432), 0.058, 0.042, soft=0.012)
        f.capsule((sx * 0.112, -0.05, 0.9), (sx * 0.121, -0.07, 0.533), 0.092, 0.07, soft=0.015)
        f.capsule((sx * 0.121, -0.07, 0.533), (sx * 0.121, -0.06, 0.12), 0.07, 0.05, soft=0.015)


def troll_reshape(V, J, H):
    P = limbs(V, J, 1.05, 1.08, 1.12, 1.15)
    P = chest(P, 1.12, 1.12)
    P = pecs(P, 0.01)
    return hips(P, waist=1.2, glutes=0.8, hip=0.92)


def troll_post(V, N, J, H):
    where = either(zone(z=(0.95, 1.55), y=(-0.3, -0.12)), zone(z=(1.0, 1.6), y=(0.04, 0.3)),
                   zone(x=("abs", 0.2, 0.6), z=(1.38, 1.5)))
    return bumps(V, N, 40, where, r=(0.008, 0.018), h=(0.005, 0.011), seed=101)


MONSTERS = {
    "rotting_zombie": dict(
        skin="01", H=H_(),
        hands=dict(finger=(1.1, 0.0085, 0.0062), knuckle=0.0072, palm=(0.026, 0.94), spread=7),
        sculpt=zombie_sculpt, reshape=zombie_reshape, relief=0.016, tris=18000),
    "bloated_drowner": dict(
        skin="02", H=H_(),
        hands=dict(finger=(0.98, 0.014, 0.0115), palm=(0.042, 1.18), spread=5),
        sculpt=drowner_sculpt, reshape=drowner_reshape, post=drowner_post, relief=0.006, tris=18000),
    "plague_bearer": dict(
        skin="03", H=H_(),
        hands=dict(finger=(1.08, 0.0085, 0.0065), knuckle=0.0075, palm=(0.027, 0.95), spread=9),
        sculpt=plague_sculpt, reshape=plague_reshape, post=plague_post, warp=head(0.03, 0.012),
        relief=0.024, tris=19000),
    "tomb_mummy": dict(
        skin="04", H=H_(),
        hands=dict(finger=(1.1, 0.0078, 0.006), knuckle=0.0072, palm=(0.024, 0.9), spread=5),
        sculpt=mummy_sculpt, reshape=mummy_reshape, relief=0.025, tris=19500, paint=mummy_paint(H_())),
    "ember_husk": dict(
        skin="05", H=H_(),
        hands=dict(finger=(1.0, 0.0095, 0.0074), knuckle=0.0078, claw=0.012, palm=(0.03, 0.98), spread=10),
        sculpt=ember_sculpt, reshape=ember_reshape, relief=0.012, tris=18000, glow_spots=ember_glow(H_())),
    "pale_ghoul": dict(
        skin="06", H=H_(ear_r=0.09, ear_dz=0.04, ear_dy=0.012),
        hands=dict(finger=(1.45, 0.0078, 0.0055), knuckle=0.0075, claw=0.032, palm=(0.024, 0.9), spread=12),
        sculpt=ghoul_sculpt, reshape=ghoul_reshape, warp=head(0.035, 0.02, then=stretch_arms(1.22)),
        relief=0.01, tris=18000, paint=ghoul_paint(H_())),
    "chitin_fiend": dict(
        skin="07", H=H_(eye_t=24.0),
        hands=dict(finger=(1.2, 0.0105, 0.008), knuckle=0.009, claw=0.045, palm=(0.03, 1.0), spread=14),
        sculpt=fiend_sculpt, reshape=fiend_reshape, relief=0.018, tris=19500),
    "deep_maw": dict(
        skin="08", H=H_(eye_t=32.0, mouth=1.630, nose=1.66),
        hands=dict(finger=(1.2, 0.009, 0.007), claw=0.014, palm=(0.028, 1.05), spread=22, web=True),
        sculpt=maw_sculpt, reshape=maw_reshape, relief=0.007, tris=19500,
        relief_mask=lambda V: 1 - 0.5 * smoothstep(1.6, 1.66, V[:, 2])),
    "fungal_husk": dict(
        skin="09", H=H_(),
        hands=dict(finger=(1.15, 0.0085, 0.0062), knuckle=0.008, claw=0.006, palm=(0.026, 0.95), spread=8),
        sculpt=fungal_sculpt, reshape=fungal_reshape, post=fungal_post, relief=0.013, tris=19500,
        paint=fungal_paint(H_()), relief_mask=lambda V: 1 - 0.45 * smoothstep(-0.08, -0.12, V[:, 1])
        * smoothstep(1.22, 1.28, V[:, 2]) * smoothstep(1.46, 1.4, V[:, 2])),
    "bog_troll": dict(
        skin="10", H=H_(),
        hands=dict(finger=(1.08, 0.019, 0.0155), knuckle=0.015, claw=0.008, palm=(0.056, 1.35), spread=6),
        sculpt=troll_sculpt, reshape=troll_reshape, post=troll_post,
        warp=head(0.03, 0.012, 1.0, 1.47, 1.56, then=grow(1.2)), relief=0.011, tris=19500,
        relief_mask=lambda V: 1 - 0.4 * smoothstep(-0.1, -0.15, V[:, 1]) * smoothstep(1.45, 1.55, V[:, 2])
        * smoothstep(1.85, 1.75, V[:, 2])),
}
