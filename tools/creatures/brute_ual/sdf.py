"""The brute's sculpt as a signed distance field (numpy, metres, Blender axes: +X = its left,
-Y = forward, +Z = up), in the UAL mannequin's own 1.83 m space on a widened rig (see build.py).
Arms and hands are sculpted straight out (T-pose) and hung in the A-pose the mesh is bound in.
Paired parts are written once for the left side and mirrored by evaluating at |x|.
"""
import numpy as np

# ---- primitives ------------------------------------------------------------------------------

def _dot(a, b):
    return (a * b).sum(-1)


def round_cone(p, a, b, r1, r2):
    """Inigo Quilez's exact round cone between points a, b (radii r1, r2)."""
    a = np.asarray(a, float); b = np.asarray(b, float)
    ba = b - a
    l2 = _dot(ba, ba)
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = p - a
    y = _dot(pa, ba)
    z = y - l2
    q = pa * l2 - y[:, None] * ba
    x2 = _dot(q, q)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d_end = np.sqrt(x2 + z2) * il2 - r2
    d_start = np.sqrt(x2 + y2) * il2 - r1
    d_mid = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
    return np.where(np.sign(z) * a2 * z2 > k, d_end, np.where(np.sign(y) * a2 * y2 < k, d_start, d_mid))


def capsule(p, a, b, r):
    return round_cone(p, a, b, r, r * 0.999)


def sphere(p, c, r):
    return np.linalg.norm(p - np.asarray(c, float), axis=-1) - r


def ellipsoid(p, c, r, rot=None):
    q = p - np.asarray(c, float)
    if rot is not None:
        q = q @ rot
    r = np.asarray(r, float)
    k0 = np.linalg.norm(q / r, axis=-1)
    k1 = np.linalg.norm(q / (r * r), axis=-1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


def rot_x(deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_z(deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


# ---- the brute's frame -----------------------------------------------------------------------
# The UAL rig, widened: arms 5.8 cm further out, hips 2.6 cm (build.widen), all in the mannequin's
# 1.83 m space; the whole creature is scaled up at export (build.SCALE).
WIDEN_ARM = 0.058
WIDEN_LEG = 0.026
HIP_X = 0.089 + WIDEN_LEG

_F = {  # 01 head, 02 head, 03 head, 04 head, 04 tail (UAL2 left hand, before widening)
    "index": [(0.859, 0.035, 1.439), (0.899, 0.035, 1.439), (0.934, 0.035, 1.439), (0.964, 0.035, 1.439), (0.995, 0.035, 1.439)],
    "middle": [(0.860, 0.060, 1.441), (0.903, 0.062, 1.441), (0.937, 0.064, 1.441), (0.971, 0.065, 1.441), (1.005, 0.067, 1.441)],
    "ring": [(0.858, 0.083, 1.441), (0.897, 0.084, 1.441), (0.928, 0.085, 1.441), (0.960, 0.086, 1.441), (0.992, 0.087, 1.441)],
    "pinky": [(0.847, 0.106, 1.439), (0.887, 0.109, 1.439), (0.914, 0.111, 1.439), (0.942, 0.113, 1.439), (0.971, 0.115, 1.439)],
    # thumb modelled short and curled against the palm, riding the hand bone (see the zombie)
    "thumb": [(0.776, 0.042, 1.430), (0.814, 0.016, 1.424), (0.846, 0.002, 1.419), (0.872, -0.006, 1.416), (0.890, -0.01, 1.414)],
}
FINGERS = {k: [(x + WIDEN_ARM, y, z) for x, y, z in v] for k, v in _F.items()}
FINGER_R = {"index": 0.019, "middle": 0.02, "ring": 0.019, "pinky": 0.0165, "thumb": 0.023}
TIP_FRAC = {"index": 0.55, "middle": 0.55, "ring": 0.55, "pinky": 0.55}   # long fingers, then a claw
TOES = [(-0.042, 0.028), (0.0, 0.03), (0.042, 0.027)]  # x offset from the leg, radius: three clawed toes

EYE = (0.040, -0.075, 1.670)          # from the painted face (uvmap.HEAD)
EYE_R = 0.0135
MOUTH_C = (0.0, -0.092, 1.585)        # a snarl, slightly open over fangs
MOUTH_R = (0.042, 0.04, 0.007)
HORN_BOSS = (0.075, 0.01, 1.754)
TEAR_C = (0.0, 0.0, 9.0)              # (zombie-only features, parked far away)
TEAR_R = (0.001, 0.001, 0.001)
TEAR_ROT = np.eye(3)
CROWN = []
CROWN_C = (0.0, 0.0, 9.0)

APOSE = np.radians(45)
SHOULDER = np.array([0.192 + WIDEN_ARM, 0.065, 1.441])
_CA, _SA = np.cos(APOSE), np.sin(APOSE)


def to_A(m):
    v = np.atleast_2d(m) - SHOULDER
    return SHOULDER + np.stack([_CA * v[:, 0] + _SA * v[:, 2], v[:, 1], -_SA * v[:, 0] + _CA * v[:, 2]], -1)


def to_T(m):
    v = np.atleast_2d(m) - SHOULDER
    return SHOULDER + np.stack([_CA * v[:, 0] - _SA * v[:, 2], v[:, 1], _SA * v[:, 0] + _CA * v[:, 2]], -1)


def finger_pts(name):
    pts = [np.array(q, float) for q in FINGERS[name]]
    frac = TIP_FRAC.get(name, 0.0)
    if frac <= 0:
        return pts[:-1]
    pts[-1] = pts[-2] + (pts[-1] - pts[-2]) * frac
    return pts


def claw(name):
    """Claw base and point: hooked forward and down off the fingertip."""
    pts = finger_pts(name)
    tip, prev = np.array(pts[-1]), np.array(pts[-2])
    d = (tip - prev) / np.linalg.norm(tip - prev)
    r = FINGER_R[name]
    base = tip + d * r * 0.4 + np.array([0, 0, r * 0.25])
    point = base + d * 0.05 + np.array([0, 0, -0.03])
    return base, point


def nail_c(name):  # (zombie API; the brute's nails are its claws)
    return claw(name)[0]


def unbend(P):
    """A-pose positions (either side) -> T-pose, easing in across the shoulder (for the UVs)."""
    P = np.atleast_2d(P)
    sgn = np.where(P[:, 0] < 0, -1.0, 1.0)
    m = P.copy(); m[:, 0] = np.abs(m[:, 0])
    da = np.array([_CA, 0, -_SA])
    v = m - SHOULDER
    proj = v @ da
    perp = np.linalg.norm(v - proj[:, None] * da, axis=1)
    a = APOSE * _ss(-0.05, 0.03, proj) * (1 - _ss(0.11, 0.16, perp))
    c, s = np.cos(a), np.sin(a)
    out = SHOULDER + np.stack([c * v[:, 0] - s * v[:, 2], v[:, 1], s * v[:, 0] + c * v[:, 2]], -1)
    out[:, 0] *= sgn
    return out


def _ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def jaw_space(p):
    return p


def jaw_world(q):
    return q


# ---- the body -------------------------------------------------------------------------------

def head(p):
    m = p.copy(); m[:, 0] = np.abs(m[:, 0])
    d = ellipsoid(p, (0, 0.02, 1.708), (0.09, 0.103, 0.0735))                       # low, flat-crowned brute skull
    d = smin(d, ellipsoid(p, (0, 0.035, 1.665), (0.09, 0.09, 0.07)), 0.035)         # skull base, set back
    d = smin(d, round_cone(m, (0.012, -0.108, 1.686), (0.072, -0.07, 1.71), 0.027, 0.02), 0.016)  # brow ridge, dropping to a scowl
    d = smax(d, -ellipsoid(p, (0, -0.118, 1.704), (0.009, 0.02, 0.02)), 0.01)        # furrow between them
    d = smin(d, sphere(m, HORN_BOSS, 0.05), 0.018)                                   # bony horn bosses
    d = smin(d, ellipsoid(p, (0, -0.07, 1.625), (0.06, 0.06, 0.05)), 0.03)          # muzzle base
    d = smin(d, ellipsoid(p, (0, -0.1, 1.62), (0.052, 0.032, 0.03)), 0.02)          # broad flat bull nose
    d = smin(d, ellipsoid(m, (0.026, -0.118, 1.618), (0.017, 0.012, 0.015)), 0.01)  # nostril pads
    d = smax(d, -ellipsoid(m, (0.027, -0.128, 1.613), (0.0085, 0.02, 0.0068)), 0.003)  # two deep flared nostrils
    d = smin(d, ellipsoid(p, (0, -0.13, 1.613), (0.0085, 0.013, 0.014)), 0.004)      # raised septum between them
    d = smin(d, round_cone(m, (0.0, -0.098, 1.558), (0.074, -0.004, 1.58), 0.032, 0.028), 0.022)  # underbite jaw
    d = smin(d, round_cone(m, (0.074, -0.004, 1.58), (0.078, 0.022, 1.645), 0.026, 0.021), 0.02)
    d = smin(d, ellipsoid(p, (0, -0.09, 1.553), (0.052, 0.03, 0.022)), 0.012)        # square chin
    d = smin(d, sphere(m, (0.068, -0.03, 1.564), 0.027), 0.014)                       # jaw corners
    d = smax(d, -ellipsoid(p, (0, -0.113, 1.564), (0.032, 0.012, 0.0035)), 0.003)    # lip line under the lower lip
    d = smin(d, ellipsoid(m, (0.062, -0.058, 1.652), (0.03, 0.025, 0.02)), 0.016)   # cheekbones
    d = smax(d, -ellipsoid(m, (EYE[0], EYE[1] - 0.003, EYE[2]), (0.023, 0.021, 0.016)), 0.006)  # deep sockets
    d = smin(d, sphere(m, EYE, EYE_R), 0.003)
    # heavy lids slanting down to the nose: a permanent glare
    d = smin(d, round_cone(m, (EYE[0] - 0.014, EYE[1] - 0.01, EYE[2] + 0.004), (EYE[0] + 0.015, EYE[1] - 0.006, EYE[2] + 0.011), 0.005, 0.004), 0.004)
    d = smin(d, round_cone(m, (EYE[0] - 0.012, EYE[1] - 0.008, EYE[2] - 0.010), (EYE[0] + 0.012, EYE[1] - 0.005, EYE[2] - 0.009), 0.0042, 0.0035), 0.004)
    # snarl: heavy lips peeled off the fangs, a dark slot behind
    d = smin(d, round_cone(m, (0.0, -0.112, 1.597), (0.045, -0.084, 1.59), 0.0075, 0.006), 0.008)
    d = smin(d, round_cone(m, (0.0, -0.111, 1.573), (0.043, -0.084, 1.58), 0.0085, 0.0065), 0.008)
    d = smax(d, -ellipsoid(p, MOUTH_C, MOUTH_R), 0.004)
    return d


def neck(p, m):
    d = round_cone(p, (0, 0.035, 1.44), (0, 0.022, 1.61), 0.125, 0.09)               # bull neck
    d = smin(d, round_cone(m, (0.04, 0.06, 1.545), (0.2, 0.058, 1.47), 0.066, 0.06), 0.05)  # trapezius, off the skull
    d = smin(d, ellipsoid(p, (0, 0.07, 1.42), (0.17, 0.07, 0.08)), 0.07)             # the hump, low and wide into the traps
    d = smin(d, round_cone(m, (0.066, -0.008, 1.562), (0.045, -0.088, 1.44), 0.038, 0.035), 0.04)   # neck columns, jaw to collarbone
    d = smin(d, ellipsoid(m, (0.14, -0.008, 1.495), (0.088, 0.072, 0.058)), 0.05)     # trap front sloping into the chest
    return d


def torso(p, m, mounds=True):
    d = ellipsoid(p, (0, 0.015, 1.3), (0.228, 0.158, 0.21))                          # barrel chest
    d = smin(d, ellipsoid(m, (0.1, -0.12, 1.372), (0.11, 0.055, 0.08)), 0.035)       # slab pecs
    d = smin(d, ellipsoid(p, (0, -0.01, 1.09), (0.185, 0.132, 0.15)), 0.06)          # gut
    d = smin(d, ellipsoid(m, (0.16, 0.01, 1.12), (0.08, 0.11, 0.15)), 0.05)          # thick obliques
    d = smin(d, ellipsoid(p, (0, 0.02, 0.955), (0.21, 0.14, 0.12)), 0.06)            # pelvis
    d = smin(d, ellipsoid(m, (0.09, 0.11, 0.9), (0.1, 0.07, 0.1)), 0.04)             # glutes
    d = smin(d, ellipsoid(m, (0.165, 0.075, 1.3), (0.1, 0.09, 0.18)), 0.05)          # lats, flared
    d = smin(d, ellipsoid(m, (0.135, 0.152, 1.37), (0.085, 0.056, 0.105), rot_y(-14)), 0.016)  # shoulder blades
    d = smin(d, round_cone(m, (0.118, 0.172, 1.31), (0.098, 0.165, 1.245), 0.03, 0.01), 0.014)  #  and their lower tips
    d = smax(d, -ellipsoid(m, (0.068, 0.178, 1.37), (0.01, 0.025, 0.085), rot_y(-10)), 0.01)  #  their inner edges
    d = smin(d, ellipsoid(m, (0.225, 0.065, 1.32), (0.078, 0.078, 0.13)), 0.065)      # lats flared under the armpit
    d = smin(d, round_cone(m, (0.046, 0.128, 0.99), (0.05, 0.158, 1.4), 0.04, 0.034), 0.025)  # erector columns
    d = smin(d, ellipsoid(m, (0.17, 0.065, 1.05), (0.075, 0.085, 0.12)), 0.06)       # flank fill: no shelf over the hip
    d = smin(d, ellipsoid(m, (0.075, 0.13, 1.4), (0.08, 0.05, 0.1), rot_y(12)), 0.04)  # back slabs
    d = smin(d, round_cone(p, (0, -0.15, 1.44), (0, -0.16, 1.24), 0.014, 0.012), 0.04)  # sternum keel
    if mounds:                                                                        # scaly mounds the spikes break through
        for xo, y0, z, sz, al in spike_bases():
            d = smin(d, ellipsoid(p, (xo, y0 - 0.008, z + 0.004), (0.03 * sz, 0.02, 0.036 * sz)), 0.018)
    return d


SPIKES = [(1.11, 0.7), (1.19, 1.0), (1.275, 0.78), (1.355, 1.28), (1.44, 0.92), (1.52, 1.12)]   # (height, size)
_SB = None


def spike_bases():
    """Where each spine spike leaves the back (x, y, z, size, side), without the mounds."""
    global _SB
    if _SB is None:
        ys = np.linspace(0.0, 0.4, 801)
        _SB = []
        for i, (z, sz) in enumerate(SPIKES):
            al = 1 if i % 2 == 0 else -1
            q = np.stack([np.full_like(ys, al * 0.016), ys, np.full_like(ys, z)], 1)
            mq = q.copy(); mq[:, 0] = np.abs(mq[:, 0])
            dd = smin(torso(q, mq, mounds=False), neck(q, mq), 0.05)
            _SB.append((al * 0.016, float(ys[np.argmax(dd > 0)]), z, sz, al))
    return _SB


def arm(m):
    d = ellipsoid(m, (0.315, 0.062, 1.438), (0.095, 0.092, 0.085))                    # deltoid, low on the arm
    d = smin(d, round_cone(m, (0.27, 0.065, 1.441), (0.5, 0.07, 1.441), 0.09, 0.072), 0.04)
    d = smin(d, ellipsoid(m, (0.39, 0.012, 1.447), (0.11, 0.07, 0.075)), 0.03)       # biceps
    d = smin(d, ellipsoid(m, (0.39, 0.12, 1.445), (0.11, 0.06, 0.07)), 0.03)         # triceps
    d = smin(d, sphere(m, (0.526, 0.105, 1.441), 0.055), 0.03)                       # elbow
    d = smin(d, round_cone(m, (0.53, 0.068, 1.441), (0.795, 0.065, 1.441), 0.08, 0.055), 0.03)
    d = smin(d, ellipsoid(m, (0.62, 0.06, 1.448), (0.12, 0.088, 0.082)), 0.03)       # forearm slabs
    return d


def hand(m):
    d = ellipsoid(m, (0.865, 0.072, 1.441), (0.074, 0.066, 0.03))                    # broad palm
    d = smin(d, round_cone(m, (0.76, 0.066, 1.441), (0.83, 0.07, 1.441), 0.05, 0.035), 0.02)  # wrist
    t = finger_pts("thumb")
    d = smin(d, round_cone(m, (0.838, 0.05, 1.434), t[1], 0.03, 0.021), 0.018)       # thenar
    for name in ("index", "middle", "ring", "pinky"):
        base = np.array(finger_pts(name)[0])
        d = smin(d, sphere(m, base + (0, 0, 0.008), FINGER_R[name] * 1.25), 0.008)  # knuckles
    for name in FINGERS:
        pts = finger_pts(name)
        r = FINGER_R[name]
        f = None
        for j in range(len(pts) - 1):
            seg = round_cone(m, pts[j], pts[j + 1], r * (0.95 - 0.06 * j), r * (0.88 - 0.08 * j))
            f = seg if f is None else smin(f, seg, 0.004)
            if j:
                f = smin(f, sphere(m, pts[j] + (0, 0, 0.002), r * (1.06 - 0.06 * j)), 0.004)
        base, point = claw(name)
        f = smin(f, round_cone(m, base, point, r * 0.7, 0.0018), 0.004)               # claws
        d = smin(d, f, 0.009 if name != "thumb" else 0.016)
    return d


def leg(m):
    x = HIP_X
    d = round_cone(m, (x + 0.016, 0.005, 0.92), (x + 0.004, 0.0, 0.57), 0.118, 0.088)  # tree-trunk thighs
    d = smin(d, ellipsoid(m, (x + 0.01, -0.055, 0.75), (0.095, 0.08, 0.15)), 0.04)     # quads
    d = smin(d, ellipsoid(m, (x, 0.0, 0.533), (0.08, 0.07, 0.058)), 0.03)              # knee
    d = smin(d, sphere(m, (x, -0.068, 0.538), 0.04), 0.02)                              # kneecap
    d = smin(d, round_cone(m, (x, 0.004, 0.52), (x, 0.03, 0.13), 0.09, 0.05), 0.03)
    d = smin(d, ellipsoid(m, (x + 0.004, 0.066, 0.415), (0.09, 0.088, 0.12)), 0.03)    # calf bulge, high on the shin
    d = smin(d, ellipsoid(m, (x - 0.03, 0.05, 0.43), (0.05, 0.06, 0.095)), 0.025)     # inner calf head
    d = smin(d, ellipsoid(m, (x + 0.038, 0.06, 0.44), (0.058, 0.064, 0.105)), 0.025)  # outer calf head
    d = smin(d, round_cone(m, (x, 0.075, 0.3), (x, 0.07, 0.11), 0.032, 0.024), 0.03)  # heel tendon
    d = smin(d, ellipsoid(m, (x + 0.043, 0.032, 0.098), (0.014, 0.02, 0.022)), 0.01)    # ankle bones: outer low,
    d = smin(d, ellipsoid(m, (x - 0.041, 0.028, 0.122), (0.013, 0.019, 0.02)), 0.01)     #  inner high
    d = smin(d, round_cone(m, (x + 0.032, 0.062, 0.4), (x + 0.006, 0.078, 0.26), 0.042, 0.024), 0.02)  # calf heads
    d = smin(d, round_cone(m, (x - 0.028, 0.058, 0.4), (x - 0.004, 0.078, 0.26), 0.04, 0.024), 0.02)   #  into the tendon
    for sx in (1, -1):                                                                 # hollows either side of it
        d = smax(d, -ellipsoid(m, (x + sx * 0.033, 0.072, 0.18), (0.012, 0.022, 0.06)), 0.012)
    f = ellipsoid(m, (x, 0.045, 0.055), (0.046, 0.06, 0.055))                          # heel bone, sloping forward to the sole
    f = smin(f, ellipsoid(m, (x, 0.05, 0.022), (0.052, 0.056, 0.026)), 0.02)           # broad heel pad
    f = smin(f, ellipsoid(m, (x, 0.098, 0.1), (0.03, 0.026, 0.028)), 0.012)            # skin sheath of the heel claw
    f = smin(f, ellipsoid(m, (x, -0.06, 0.045), (0.078, 0.12, 0.046)), 0.04)           # broad foot
    for dx, r in TOES:
        tx = x + dx
        f = smin(f, round_cone(m, (tx, -0.12, 0.042), (tx + dx * 0.2, -0.2, 0.034), r, r * 0.85), 0.012)
        f = smin(f, round_cone(m, (tx + dx * 0.2, -0.205, 0.04), (tx + dx * 0.3, -0.255, 0.006), r * 0.75, 0.003), 0.006)  # claws
    f = smax(f, -(m[:, 2] - 0.002), 0.04)                                             # sole, edges rolled
    return smin(d, f, 0.06)


def body(p):
    p = np.atleast_2d(p).astype(float)
    m = p.copy(); m[:, 0] = np.abs(m[:, 0])
    d = torso(p, m)
    d = smin(d, neck(p, m), 0.05)
    d = smin(d, head(p), 0.04)
    d = smin(d, ellipsoid(p, (0, 0.116, 1.69), (0.066, 0.045, 0.04)), 0.016)        # occipital shelf
    d = smax(d, -ellipsoid(p, (0, 0.148, 1.634), (0.08, 0.03, 0.016)), 0.012)        # the nape crease under it
    d = smin(d, ellipsoid(p, (0, 0.116, 1.612), (0.07, 0.016, 0.009)), 0.006)         # bull-neck folds below it
    d = smin(d, ellipsoid(p, (0, 0.132, 1.588), (0.076, 0.016, 0.009)), 0.006)
    d = smin(d, round_cone(p, (-0.07, 0.05, 1.745), (0.07, 0.05, 1.745), 0.028, 0.028), 0.015)  # the poll, horn to horn
    mt = to_T(m)
    d = smin(d, arm(mt), 0.07)
    d = smin(d, hand(mt), 0.025)
    d = smin(d, leg(m), 0.045)
    return d


def grad(p, h=4e-4):
    e = np.eye(3) * h
    g = np.stack([body(p + e[i]) - body(p - e[i]) for i in range(3)], -1)
    return g / np.maximum(np.linalg.norm(g, axis=-1, keepdims=True), 1e-9)
