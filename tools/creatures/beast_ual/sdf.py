"""A beast man's sculpt as a signed distance field (numpy, metres, Blender axes: +X = its left,
-Y = forward, +Z = up), in the UAL mannequin's own 1.83 m space on a lightly widened rig (see
build.py). Arms and hands are sculpted straight out (T-pose) and hung in the A-pose the mesh is
bound in. Paired parts are written once for the left side and mirrored by evaluating at |x|.

The base beast man (lean, long-limbed, a little broader than a man) is shared; BEAST (environment)
picks the species, which brings its own head, hands and feet. The goat is the first.
"""
import os

import numpy as np

SPECIES = os.environ.get("BEAST", "goat")
RED = BLUE = False          # (brute build switches, kept off)
GOAT = SPECIES == "goat"
WOLF = SPECIES == "wolf"

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



# ---- the beast man's frame ------------------------------------------------------------------
# The UAL rig, lightly widened (build.widen): arms 3 cm and hips 1.2 cm further out, all in the
# mannequin's 1.83 m space; the creature is scaled up at export (build.SCALE).
WIDEN_ARM = 0.042
WIDEN_LEG = 0.012
HIP_X = 0.089 + WIDEN_LEG
DW = WIDEN_ARM - 0.058        # the arm constants below were measured on the brute's 5.8 cm widening

_F = {  # 01 head, 02 head, 03 head, 04 head, 04 tail (UAL2 left hand, before widening)
    "index": [(0.859, 0.035, 1.439), (0.899, 0.035, 1.439), (0.934, 0.035, 1.439), (0.964, 0.035, 1.439), (0.995, 0.035, 1.439)],
    "middle": [(0.860, 0.060, 1.441), (0.903, 0.062, 1.441), (0.937, 0.064, 1.441), (0.971, 0.065, 1.441), (1.005, 0.067, 1.441)],
    "ring": [(0.858, 0.083, 1.441), (0.897, 0.084, 1.441), (0.928, 0.085, 1.441), (0.960, 0.086, 1.441), (0.992, 0.087, 1.441)],
    "pinky": [(0.847, 0.106, 1.439), (0.887, 0.109, 1.439), (0.914, 0.111, 1.439), (0.942, 0.113, 1.439), (0.971, 0.115, 1.439)],
    "thumb": [(0.776, 0.042, 1.430), (0.814, 0.016, 1.424), (0.846, 0.002, 1.419), (0.872, -0.006, 1.416), (0.890, -0.01, 1.414)],
}
FINGERS0 = {k: [(x + WIDEN_ARM, y, z) for x, y, z in v] for k, v in _F.items()}
FINGER_R0 = {"index": 0.0124, "middle": 0.0132, "ring": 0.0124, "pinky": 0.011, "thumb": 0.016}   # grooves between them
HAND_S = 1.48 if WOLF else 1.3   # big clawed hands: the hand bones grow with them (build.widen)
WRIST = np.array([0.739 + WIDEN_ARM, 0.065, 1.441])          # hand_l's head on the widened rig
HEAD_S = 1.26 if WOLF else 1.1   # a heavier skull; horns, ears and beard grow with it
HEAD_PIV = np.array([0.0, 0.0, 1.6])


def HX(p):
    """A point on the rig-sized hand -> the same point on the big hand."""
    return WRIST + (np.asarray(p, float) - WRIST) * HAND_S


def HD(p):
    """A point on the painted-scale head -> the same point on the heavier head."""
    return HEAD_PIV + (np.asarray(p, float) - HEAD_PIV) * HEAD_S


FINGERS = {k: [tuple(HX(q)) for q in v] for k, v in FINGERS0.items()}
FINGER_R = {k: r * HAND_S for k, r in FINGER_R0.items()}
TIP_FRAC = {"index": 0.6, "middle": 0.6, "ring": 0.6, "pinky": 0.6}   # long bony fingers, then a black nail-claw
TOES = []                     # hooves, no toes

EYE0 = (0.043, -0.084, 1.69)  # the head is sculpted at the painted face's scale ...
EYE_R0 = 0.0118
MOUTH_C0 = (0.0, -0.14, 1.562)   # the mouth: a closed slit along the muzzle
MOUTH_R0 = (0.036, 0.036, 0.0042)
HORN_BOSS0 = (0.04, -0.012, 1.762)
MOUTH_IN0 = -0.152
HEAD_C0 = (0.0, -0.025, 1.665)
CLAW_L, CLAW_DROP, CLAW_THUMB = 0.026, -0.017, 0.011        # nail-claws: length past the tip, hook down
if WOLF:                      # the wolf: amber eyes under a scowling brow, a long deep muzzle, the jaw dropped in a snarl
    EYE0 = (0.043, -0.066, 1.703)
    EYE_R0 = 0.013
    MOUTH_C0 = (0.0, -0.153, 1.618)                        # the gape: open about 3.4 cm at the front
    MOUTH_R0 = (0.03, 0.076, 0.0195)
    MOUTH_IN0 = -0.184                                     # behind the lips is the mouth
    HEAD_C0 = (0.0, -0.04, 1.672)
    FINGER_R0 = {"index": 0.0118, "middle": 0.0124, "ring": 0.0118, "pinky": 0.0106, "thumb": 0.0148}
    TIP_FRAC = {"index": 0.78, "middle": 0.78, "ring": 0.78, "pinky": 0.78}   # long fingers
    CLAW_L, CLAW_DROP, CLAW_THUMB = 0.062, -0.03, 0.036     # long hooked claws
    TOES = [(-0.041, 0.0185), (-0.0135, 0.0205), (0.0135, 0.0205), (0.041, 0.018)]   # four clawed toes on a paw
    FINGER_R = {k: r * HAND_S for k, r in FINGER_R0.items()}
EYE = tuple(HD(EYE0))         # ... and these are where it all lands on the grown head
EYE_R = EYE_R0 * HEAD_S
MOUTH_C = tuple(HD(MOUTH_C0))
MOUTH_R = tuple(np.array(MOUTH_R0) * HEAD_S)
HORN_BOSS = tuple(HD(HORN_BOSS0))
MOUTH_IN = float(HD((0, MOUTH_IN0, 1.6))[1])               # inside the slit (y >) maps to the painted mouth
HEAD_C = tuple(HD(HEAD_C0))                # rays out from here put the head's cage on the sculpt
TEAR_C = (0.0, 0.0, 9.0)
TEAR_R = (0.001, 0.001, 0.001)
TEAR_ROT = np.eye(3)
CROWN = []
CROWN_C = (0.0, 0.0, 9.0)
HOOF_Y = -0.056               # the hoof's centre, ahead of the ankle (it stands on the ball of the foot)

APOSE = np.radians(45)
SHOULDER = np.array([0.192 + WIDEN_ARM, 0.065, 1.441])
_CA, _SA = np.cos(APOSE), np.sin(APOSE)
ELBOW_X = 0.468 + WIDEN_ARM
WRIST_X = 0.739 + WIDEN_ARM


def to_A(m):
    v = np.atleast_2d(m) - SHOULDER
    return SHOULDER + np.stack([_CA * v[:, 0] + _SA * v[:, 2], v[:, 1], -_SA * v[:, 0] + _CA * v[:, 2]], -1)


def to_T(m):
    v = np.atleast_2d(m) - SHOULDER
    return SHOULDER + np.stack([_CA * v[:, 0] - _SA * v[:, 2], v[:, 1], _SA * v[:, 0] + _CA * v[:, 2]], -1)


def _fp0(name):
    pts = [np.array(q, float) for q in FINGERS0[name]]
    frac = TIP_FRAC.get(name, 0.0)
    if frac <= 0:
        return pts[:-1]
    pts[-1] = pts[-2] + (pts[-1] - pts[-2]) * frac
    return pts


def _claw0(name):
    """Nail-claw base and point: a narrow black nail hooked down off the fingertip."""
    pts = _fp0(name)
    tip, prev = np.array(pts[-1]), np.array(pts[-2])
    d = (tip - prev) / np.linalg.norm(tip - prev)
    r = FINGER_R0[name]
    base = tip + d * r * 0.35 + np.array([0, 0, r * 0.3])
    point = base + d * (CLAW_THUMB if name == "thumb" else CLAW_L) + np.array([0, 0, -0.012 if name == "thumb" else CLAW_DROP])   # hooked nails
    return base, point


def claw_mid(base, point):
    """A curved claw's middle: out along the finger first, then hooked down to the point."""
    return base + (point - base) * 0.5 + np.array([0, 0, 0.3 * abs(point[2] - base[2])])


def finger_pts(name):
    return [HX(q) for q in _fp0(name)]


def claw(name):
    b, p = _claw0(name)
    return HX(b), HX(p)


def nail_c(name):
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
    a = APOSE * _ss(-0.05, 0.03, proj) * (1 - _ss(0.1, 0.15, perp))
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


# ---- the goat's head --------------------------------------------------------------------------

def _head0(p):
    """A long goat's face as painted: narrow skull, a muzzle sloping down to a broad nose pad,
    a narrow jaw and chin (the beard is a modelled piece), heavy brows over forward-set eyes,
    bony bosses for the ram's horns."""
    m = p.copy(); m[:, 0] = np.abs(m[:, 0])
    d = ellipsoid(p, (0, 0.016, 1.712), (0.071, 0.086, 0.07))                          # narrow skull
    d = smin(d, ellipsoid(p, (0, 0.035, 1.664), (0.063, 0.072, 0.058)), 0.03)          # skull base
    d = smin(d, round_cone(p, (0, -0.045, 1.703), (0, -0.14, 1.6), 0.047, 0.027), 0.028)   # long narrow muzzle, the bridge sloping to the nose
    d = smin(d, round_cone(p, (0, -0.07, 1.69), (0, -0.15, 1.6), 0.012, 0.01), 0.02)    # a bony ridge down the bridge
    d = smin(d, ellipsoid(p, (0, -0.16, 1.589), (0.026, 0.02, 0.021)), 0.01)           # nose pad
    d = smax(d, -ellipsoid(m, (0.0125, -0.18, 1.587), (0.0058, 0.011, 0.0042), rot_y(-28)), 0.0022)  # comma nostrils
    d = smax(d, -ellipsoid(p, (0, -0.178, 1.574), (0.0028, 0.012, 0.012)), 0.002)      # the split upper lip
    d = smin(d, ellipsoid(m, (0.011, -0.158, 1.571), (0.016, 0.014, 0.0095)), 0.006)   # its two lobes
    d = smin(d, round_cone(m, (0.0, -0.13, 1.552), (0.046, -0.024, 1.598), 0.019, 0.027), 0.024)    # narrow lower jaw
    d = smin(d, ellipsoid(p, (0, -0.134, 1.543), (0.019, 0.019, 0.015)), 0.012)        # chin
    d = smin(d, ellipsoid(m, (0.044, -0.05, 1.646), (0.027, 0.04, 0.034)), 0.02)       # cheeks
    d = smin(d, round_cone(m, (0.014, -0.097, 1.707), (0.057, -0.074, 1.714), 0.012, 0.011), 0.02)   # heavy brows
    d = smin(d, sphere(m, HORN_BOSS0, 0.03), 0.016)                                     # horn bosses
    d = smax(d, -ellipsoid(m, (EYE0[0], EYE0[1] - 0.002, EYE0[2]), (0.02, 0.019, 0.0145)), 0.005)   # sockets
    d = smin(d, sphere(m, EYE0, EYE_R0), 0.003)
    # lids: the upper one heavy and slanting down to the nose (a glare), the lower thin
    d = smin(d, round_cone(m, (EYE0[0] - 0.013, EYE0[1] - 0.009, EYE0[2] + 0.004), (EYE0[0] + 0.014, EYE0[1] - 0.004, EYE0[2] + 0.010), 0.0048, 0.0038), 0.004)
    d = smin(d, round_cone(m, (EYE0[0] - 0.011, EYE0[1] - 0.007, EYE0[2] - 0.009), (EYE0[0] + 0.011, EYE0[1] - 0.004, EYE0[2] - 0.008), 0.0038, 0.0032), 0.004)
    d = smax(d, -ellipsoid(p, MOUTH_C0, MOUTH_R0), 0.002)                                # mouth slit
    d = smin(d, ellipsoid(p, (0, 0.095, 1.69), (0.06, 0.04, 0.04)), 0.016)           # occiput
    return d


def head_goat(p):
    """The head sculpted at the painted face's scale, then grown HEAD_S about the jaw hinge."""
    return HEAD_S * _head0(HEAD_PIV + (p - HEAD_PIV) / HEAD_S)


def neck(p, m):
    d = round_cone(p, (0, 0.032, 1.44), (0, 0.022, 1.62), 0.086, 0.062)              # long neck
    d = smin(d, round_cone(m, (0.04, 0.058, 1.55), (0.2, 0.06, 1.47), 0.056, 0.05), 0.05)   # heavy trapezius, sloping into a hunch
    d = smin(d, round_cone(m, (0.048, -0.012, 1.59), (0.03, -0.072, 1.452), 0.024, 0.022), 0.03)    # neck columns
    d = smin(d, ellipsoid(p, (0, 0.066, 1.55), (0.06, 0.036, 0.07)), 0.035)           # ruff of the mane, behind
    return d


def torso(p, m):
    d = ellipsoid(p, (0, 0.018, 1.315), (0.2, 0.14, 0.205))                           # ribcage, deep and narrow-waisted
    # pecs: flat male slabs fanning from the sternum up to the armpit, close on the ribs
    # (round mounds read as breasts)
    d = smin(d, ellipsoid(m, (0.088, -0.088, 1.382), (0.096, 0.028, 0.056), rot_z(20) @ rot_y(-18)), 0.035)
    d = smin(d, ellipsoid(p, (0, 0.002, 1.11), (0.142, 0.108, 0.15)), 0.06)           # lean belly
    d = smin(d, ellipsoid(m, (0.128, 0.016, 1.13), (0.058, 0.088, 0.13)), 0.05)       # obliques
    d = smin(d, ellipsoid(p, (0, 0.022, 0.958), (0.172, 0.118, 0.11)), 0.06)          # pelvis
    d = smin(d, ellipsoid(m, (0.074, 0.09, 0.9), (0.084, 0.064, 0.088)), 0.04)        # glutes
    d = smin(d, ellipsoid(m, (0.15, 0.062, 1.3), (0.074, 0.078, 0.14)), 0.05)         # lats
    d = smin(d, ellipsoid(m, (0.122, 0.13, 1.37), (0.075, 0.045, 0.095), rot_y(-14)), 0.016)  # shoulder blades
    d = smax(d, -ellipsoid(m, (0.06, 0.155, 1.37), (0.009, 0.022, 0.08), rot_y(-10)), 0.01)  #  their inner edges
    d = smin(d, round_cone(m, (0.04, 0.112, 0.99), (0.045, 0.142, 1.4), 0.035, 0.03), 0.025)  # erector columns
    d = smin(d, ellipsoid(m, (0.196, 0.06, 1.33), (0.064, 0.07, 0.11)), 0.06)         # lats under the armpit
    d = smin(d, ellipsoid(m, (0.15, 0.06, 1.05), (0.06, 0.075, 0.1)), 0.06)           # flank fill over the hip
    d = smax(d, -ellipsoid(p, (0, -0.124, 1.36), (0.009, 0.01, 0.06)), 0.012)          # a shallow groove between the pecs
    return d


def arm(m):
    x = DW
    d = ellipsoid(m, (0.315 + x, 0.062, 1.444), (0.084, 0.082, 0.076))                   # big deltoid
    d = smin(d, round_cone(m, (0.27 + x, 0.065, 1.441), (0.5 + x, 0.07, 1.441), 0.068, 0.054), 0.035)
    d = smin(d, ellipsoid(m, (0.39 + x, 0.018, 1.446), (0.105, 0.056, 0.06)), 0.03)     # biceps
    d = smin(d, ellipsoid(m, (0.39 + x, 0.114, 1.445), (0.105, 0.054, 0.059)), 0.03)    # triceps
    d = smin(d, sphere(m, (0.526 + x, 0.1, 1.441), 0.04), 0.025)                       # elbow
    d = smin(d, round_cone(m, (0.53 + x, 0.068, 1.441), (0.795 + x, 0.065, 1.441), 0.057, 0.038), 0.03)
    d = smin(d, ellipsoid(m, (0.615 + x, 0.06, 1.448), (0.115, 0.068, 0.063)), 0.03)    # ropy forearm
    return d


def _hand0(m):
    x = DW
    d = ellipsoid(m, (0.862 + x, 0.07, 1.441), (0.07, 0.062, 0.027))                 # long palm
    d = smin(d, round_cone(m, (0.765 + x, 0.066, 1.441), (0.83 + x, 0.07, 1.441), 0.036, 0.032), 0.012)   # a narrow wrist under the forearm's flare
    t = _fp0("thumb")
    d = smin(d, round_cone(m, (0.835 + x, 0.05, 1.434), t[1], 0.025, 0.018), 0.016)  # thenar
    for name in ("index", "middle", "ring", "pinky"):
        base = np.array(_fp0(name)[0])
        if WOLF:                                    # knuckles eased into the back of the hand (a hard crease folds the skin)
            d = smin(d, sphere(m, base + (0, 0, 0.009), FINGER_R0[name] * 1.25), 0.014)
        else:
            d = smin(d, sphere(m, base + (0, 0, 0.011), FINGER_R0[name] * 1.45), 0.004)   # big bony knuckles, one bump each
    for name in FINGERS0:
        pts = _fp0(name)
        r = FINGER_R0[name]
        f = None
        for j in range(len(pts) - 1):
            seg = round_cone(m, pts[j], pts[j + 1], r * (0.95 - 0.07 * j), r * (0.86 - 0.08 * j))
            f = seg if f is None else smin(f, seg, 0.004)
            if j:
                f = smin(f, sphere(m, pts[j] + (0, 0, 0.002), r * (1.05 - 0.07 * j)), 0.004)   # knobbly joints
        base, point = _claw0(name)
        if WOLF:                                     # a thick curved claw: up off the tip, then hooked down
            mid = claw_mid(base, point)
            f = smin(f, round_cone(m, base, mid, r * 0.8, r * 0.48), 0.004)
            f = smin(f, round_cone(m, mid, point, r * 0.48, 0.0018), 0.002)
        else:
            f = smin(f, round_cone(m, base, point, r * 0.86, 0.002), 0.004)
        d = smin(d, f, 0.005 if name != "thumb" else 0.012)
    return d


def hand(m):
    """The hand sculpted at the rig's size, then grown HAND_S about the wrist (the hand bones are
    scaled to match in build.widen)."""
    return HAND_S * _hand0(WRIST + (m - WRIST) / HAND_S)


def leg(m):
    x = HIP_X
    d = round_cone(m, (x + 0.016, 0.008, 0.92), (x + 0.004, 0.0, 0.57), 0.12, 0.074)    # heavy goat haunches
    d = smin(d, ellipsoid(m, (x + 0.01, -0.05, 0.75), (0.095, 0.078, 0.155)), 0.04)      # quads
    d = smin(d, ellipsoid(m, (x + 0.004, 0.062, 0.78), (0.09, 0.076, 0.145)), 0.04)      # hamstrings
    d = smin(d, ellipsoid(m, (x, 0.0, 0.535), (0.064, 0.058, 0.05)), 0.03)              # knee
    d = smin(d, sphere(m, (x, -0.054, 0.538), 0.032), 0.02)                              # kneecap
    d = smin(d, round_cone(m, (x, 0.004, 0.52), (x, 0.024, 0.17), 0.072, 0.045), 0.03)  # shin
    d = smin(d, ellipsoid(m, (x + 0.003, 0.054, 0.415), (0.075, 0.073, 0.112)), 0.03)   # calf, high and hard
    d = smin(d, round_cone(m, (x, 0.058, 0.31), (x, 0.072, 0.2), 0.027, 0.02), 0.03)   # tendon, to
    d = smin(d, ellipsoid(m, (x, 0.084, 0.2), (0.03, 0.036, 0.046), rot_x(-25)), 0.016)  #  a pointed hock
    d = smin(d, ellipsoid(m, (x, 0.038, 0.135), (0.042, 0.044, 0.05)), 0.028)           # shaggy fetlock behind the ankle
    d = smin(d, round_cone(m, (x, 0.024, 0.16), (x, HOOF_Y + 0.016, 0.088), 0.043, 0.045), 0.03)   # pastern, angled forward
    h = round_cone(m, (x, HOOF_Y + 0.006, 0.08), (x, HOOF_Y - 0.01, 0.01), 0.043, 0.053)   # the hoof wall, flared
    for sx in (1, -1):                                                                   # two hard pointed toes
        h = smin(h, round_cone(m, (x + sx * 0.02, HOOF_Y - 0.01, 0.022), (x + sx * 0.017, HOOF_Y - 0.07, 0.012), 0.022, 0.011), 0.012)
    h = smax(h, -(m[:, 2] - 0.001), 0.006)                                               # flat sole, a hard edge
    h = smax(h, -ellipsoid(m, (x, HOOF_Y - 0.085, 0.045), (0.0075, 0.085, 0.08)), 0.002)  # the deep cleft between them
    h = smax(h, -ellipsoid(m, (x, HOOF_Y + 0.07, 0.04), (0.0035, 0.03, 0.05)), 0.003)    #  and behind
    for sx in (1, -1):                                                                   # dewclaws
        h = smin(h, ellipsoid(m, (x + sx * 0.022, HOOF_Y + 0.072, 0.07), (0.011, 0.012, 0.015)), 0.006)
    return smin(d, h, 0.022)


# ---- the wolf ----------------------------------------------------------------------------------

def _head_wolf0(p):
    """A werewolf's head at the painted face's scale: a broad skull and wide cheekbones, a heavy
    scowling brow, a long deep muzzle with a level bridge and a blunt nose, the jaw dropped open in
    a snarl under hanging flews."""
    m = p.copy(); m[:, 0] = np.abs(m[:, 0])
    d = ellipsoid(p, (0, 0.02, 1.718), (0.076, 0.086, 0.068))                          # broad skull
    d = smin(d, ellipsoid(p, (0, 0.058, 1.672), (0.062, 0.062, 0.056)), 0.03)          # skull base
    d = smin(d, ellipsoid(m, (0.055, -0.024, 1.67), (0.027, 0.05, 0.028)), 0.025)      # wide cheekbones
    d = smin(d, ellipsoid(m, (0.04, -0.052, 1.704), (0.03, 0.03, 0.026)), 0.02)        # the eyes' housing
    d = smin(d, round_cone(p, (0, -0.045, 1.684), (0, -0.184, 1.66), 0.043, 0.024), 0.03)   # long deep muzzle, tapering
    d = smin(d, round_cone(m, (0.025, -0.058, 1.652), (0.017, -0.177, 1.646), 0.027, 0.016), 0.02)   # flews over the jaw
    d = smin(d, ellipsoid(p, (0, -0.192, 1.663), (0.0175, 0.015, 0.0135)), 0.01)       # the nose
    d = smax(d, -ellipsoid(m, (0.0092, -0.208, 1.656), (0.0055, 0.006, 0.0042), rot_y(-30)), 0.002)   # nostrils
    d = smax(d, -ellipsoid(p, (0, -0.206, 1.64), (0.0022, 0.01, 0.011)), 0.002)        # the split under the nose
    d = smin(d, round_cone(m, (0.05, -0.008, 1.622), (0.015, -0.158, 1.592), 0.027, 0.018), 0.02)   # the heavy jaw
    d = smin(d, ellipsoid(p, (0, -0.156, 1.589), (0.021, 0.019, 0.014)), 0.01)         # chin
    d = smin(d, round_cone(m, (0.012, -0.071, 1.718), (0.062, -0.047, 1.736), 0.016, 0.013), 0.02)   # heavy scowling brow, low at the nose
    d = smax(d, -ellipsoid(p, (0, -0.078, 1.712), (0.005, 0.012, 0.016)), 0.006)       # the furrow between the brows
    for k, (y_, z_) in enumerate(((-0.1, 1.71), (-0.116, 1.706), (-0.132, 1.701))):     # snarl wrinkles across the bridge
        d = smax(d, -ellipsoid(p, (0, y_, z_), (0.024 - 0.002 * k, 0.0025, 0.0035)), 0.003)
    d = smax(d, -ellipsoid(m, (0.026, -0.168, 1.628), (0.016, 0.03, 0.014)), 0.009)   # the lip drawn up off the fangs
    d = smax(d, -ellipsoid(p, (0, -0.196, 1.633), (0.017, 0.012, 0.0075)), 0.007)      # and off the front teeth, under the nose
    d = smax(d, -ellipsoid(m, (EYE0[0], EYE0[1] - 0.002, EYE0[2]), (0.019, 0.018, 0.0135)), 0.005)   # sockets
    d = smin(d, sphere(m, EYE0, EYE_R0), 0.003)
    d = smin(d, round_cone(m, (EYE0[0] - 0.013, EYE0[1] - 0.009, EYE0[2] + 0.002), (EYE0[0] + 0.014, EYE0[1] - 0.003, EYE0[2] + 0.011), 0.005, 0.004), 0.004)   # upper lid, slanting
    d = smin(d, round_cone(m, (EYE0[0] - 0.011, EYE0[1] - 0.007, EYE0[2] - 0.009), (EYE0[0] + 0.012, EYE0[1] - 0.003, EYE0[2] - 0.006), 0.0036, 0.003), 0.004)
    d = smax(d, -ellipsoid(p, MOUTH_C0, MOUTH_R0), 0.003)                               # the gape
    d = smin(d, ellipsoid(p, (0, 0.094, 1.69), (0.06, 0.04, 0.042)), 0.016)            # occiput
    return d


def head(p):
    if WOLF:
        return HEAD_S * _head_wolf0(HEAD_PIV + (p - HEAD_PIV) / HEAD_S)
    return head_goat(p)


def wolf_bulk(p, m):
    """The werewolf's build over the shared base: a deep barrel chest on a narrow waist, massive
    trapezius rising to the skull, a hump between the shoulder blades, lats flaring into a V."""
    d = ellipsoid(p, (0, 0.025, 1.33), (0.214, 0.145, 0.2))                           # barrel chest
    d = smin(d, round_cone(m, (0.05, 0.075, 1.52), (0.22, 0.075, 1.48), 0.07, 0.062), 0.05)     # massive trapezius, below the skull
    d = smin(d, ellipsoid(p, (0, 0.108, 1.45), (0.15, 0.07, 0.1)), 0.05)               # the hump
    d = smin(d, ellipsoid(m, (0.168, 0.062, 1.29), (0.09, 0.09, 0.16)), 0.05)          # lats: the V
    d = smin(d, ellipsoid(m, (0.098, -0.1, 1.388), (0.108, 0.034, 0.062), rot_z(20) @ rot_y(-18)), 0.03)   # slab pecs
    d = smin(d, round_cone(p, (0, 0.03, 1.44), (0, 0.02, 1.6), 0.098, 0.07), 0.05)    # thick neck
    return d


def wolf_arm(m):
    x = DW
    d = ellipsoid(m, (0.326 + x, 0.062, 1.455), (0.104, 0.1, 0.095))                    # boulder deltoid
    d = smin(d, ellipsoid(m, (0.4 + x, 0.016, 1.446), (0.11, 0.062, 0.066)), 0.03)     # biceps
    d = smin(d, ellipsoid(m, (0.4 + x, 0.118, 1.446), (0.11, 0.06, 0.064)), 0.03)      # triceps
    d = smin(d, ellipsoid(m, (0.6 + x, 0.06, 1.449), (0.13, 0.078, 0.072)), 0.03)      # heavy forearm
    return d


def toe_claw(dx):
    """A toe's claw (left foot, mirrored by |x|): base off the toe's tip, a curved hook into the ground."""
    tx = HIP_X + dx
    base = np.array([tx + dx * 0.22, -0.16, 0.03])
    point = np.array([tx + dx * 0.31, -0.222, 0.004])
    return base, claw_mid(base, point), point


def _leg_wolf(m):
    x = HIP_X
    d = round_cone(m, (x + 0.028, 0.01, 0.93), (x + 0.004, 0.0, 0.57), 0.128, 0.078)    # heavy thighs, apart at the crotch
    d = smin(d, ellipsoid(m, (x + 0.024, -0.055, 0.75), (0.108, 0.088, 0.168)), 0.04)   # quads
    d = smin(d, ellipsoid(m, (x + 0.016, 0.068, 0.78), (0.1, 0.088, 0.158)), 0.04)      # hamstrings
    d = smin(d, ellipsoid(m, (x, 0.0, 0.535), (0.066, 0.06, 0.05)), 0.03)               # knee
    d = smin(d, sphere(m, (x, -0.055, 0.54), 0.032), 0.02)                               # kneecap
    d = smin(d, round_cone(m, (x, 0.004, 0.52), (x, 0.03, 0.23), 0.068, 0.04), 0.03)    # shin
    d = smin(d, ellipsoid(m, (x + 0.004, 0.062, 0.43), (0.088, 0.086, 0.13)), 0.03)     # calf, high and heavy
    d = smin(d, round_cone(m, (x, 0.066, 0.32), (x, 0.092, 0.2), 0.03, 0.022), 0.03)    # the tendon to the hock
    # the paw, digitigrade: the hock high behind the ankle with air under it, a long steep instep
    # down to a broad pad, four short arched clawed toes
    f = ellipsoid(m, (x, 0.095, 0.2), (0.027, 0.03, 0.032))                             # the hock
    f = smin(f, round_cone(m, (x, 0.085, 0.25), (x, 0.128, 0.188), 0.022, 0.011), 0.012)  # its hard spur, pointing back
    f = smin(f, round_cone(m, (x, 0.075, 0.195), (x, -0.062, 0.042), 0.031, 0.036), 0.025)   # long steep instep, air under it
    f = smin(f, ellipsoid(m, (x, -0.09, 0.03), (0.06, 0.046, 0.03)), 0.022)             # the broad pad, under the ball only
    for dx, r in TOES:
        tx = x + dx
        f = smin(f, round_cone(m, (tx, -0.103, 0.034), (tx + dx * 0.12, -0.135, 0.043), r * 1.18, r * 1.06), 0.012)   # arched knuckle
        f = smin(f, round_cone(m, (tx + dx * 0.12, -0.135, 0.043), (tx + dx * 0.2, -0.157, 0.025), r * 1.06, r * 0.88), 0.008)
        b, c, pt = toe_claw(dx)
        f = smin(f, round_cone(m, b, c, r * 0.72, r * 0.42), 0.004)
        f = smin(f, round_cone(m, c, pt, r * 0.42, 0.0016), 0.002)
    f = smax(f, -(m[:, 2] - 0.002), 0.02)                                                # flat sole
    return smin(d, f, 0.04)


def body(p, tufts=True):
    p = np.atleast_2d(p).astype(float)
    m = p.copy(); m[:, 0] = np.abs(m[:, 0])
    d = torso(p, m)
    d = smin(d, neck(p, m), 0.05)
    if WOLF:
        d = smin(d, wolf_bulk(p, m), 0.04)
    d = smin(d, head(p), 0.035)
    mt = to_T(m)
    d = smin(d, arm(mt), 0.06)
    if WOLF:
        d = smin(d, wolf_arm(mt), 0.04)
    d = smin(d, hand(mt), 0.022)
    d = smin(d, _leg_wolf(m) if WOLF else leg(m), 0.045)
    if WOLF and tufts and TUFTS:
        d = _tufts(p, m, mt, d)
    return d


# ---- the wolf's fur: clumps sculpted into the hide (no strands), each a tapering wedge laid along
# the hair's fall with its tip standing a little proud, so the silhouette goes shaggy; set on the
# bare body by casting rays at it. Groups: (space: p body / m mirrored / t the arm laid straight)
TUFTS = []


def _ray_surf(o, dvec, field, tmax=0.5, n=100):
    o = np.atleast_2d(np.asarray(o, float)); dv = np.atleast_2d(np.asarray(dvec, float))
    dv = dv / np.linalg.norm(dv, axis=1, keepdims=True)
    hit = np.full(len(o), np.nan)
    for k in range(n + 1):
        tk = tmax * k / n
        new = np.isnan(hit) & (field(o + dv * tk) < 0)
        hit[new] = tk
    ok = ~np.isnan(hit)
    lo = np.where(ok, hit - tmax / n, 0); hi = np.where(ok, hit, 0)
    for _ in range(14):
        mid = (lo + hi) / 2
        ins = field(o + dv * mid[:, None]) < 0
        hi = np.where(ins, mid, hi); lo = np.where(ins, lo, mid)
    return o + dv * hi[:, None], ok


def _fgrad(field, q, h=5e-4):
    e = np.eye(3) * h
    g = np.stack([field(q + e[i]) - field(q - e[i]) for i in range(3)], -1)
    return g / np.maximum(np.linalg.norm(g, axis=-1, keepdims=True), 1e-9)


def _make_tufts():
    rng = np.random.default_rng(23)
    base = lambda q: body(q, tufts=False)
    baseT = lambda q: body(to_A(q), tufts=False)          # the arm, laid out straight
    groups = []

    def group(space, field, origins, dirs, flow, L, r1, lift=0.009):
        S, ok = _ray_surf(origins, dirs, field)
        S = S[ok]
        if not len(S):
            return
        N = _fgrad(field, S)
        items = []
        for s_, n_ in zip(S, N):
            fl = np.asarray(flow, float) + rng.normal(0, 0.12, 3)
            fl -= (fl @ n_) * n_; fl /= np.linalg.norm(fl)             # along the hide
            ln = L * rng.uniform(0.8, 1.2); r = r1 * rng.uniform(0.85, 1.15)
            a = s_ - n_ * r * 0.55 - fl * r * 0.4
            b = s_ + fl * ln + n_ * lift
            items.append((a, b, r, 0.0035))
        P_ = np.array([q for it in items for q in it[:2]])
        pad = r1 * 1.3 + 0.03
        groups.append((space, P_.min(0) - pad, P_.max(0) + pad, items))

    # the mane: down the back of the neck and over the hump between the shoulders
    o, dd = [], []
    for z, w, n_ in ((1.58, 0.11, 5), (1.54, 0.15, 6), (1.5, 0.19, 7),
                     (1.46, 0.2, 7), (1.42, 0.17, 6), (1.38, 0.12, 4)):
        for x in np.linspace(-w, w, n_) + rng.normal(0, 0.012, n_):
            o.append((x, 0.5, z + rng.normal(0, 0.008))); dd.append((0, -1, 0))
    group("p", base, o, dd, (0, 0.32, -1), 0.095, 0.03, 0.02)
    # the throat ruff, under the jaw
    o = [(x, -0.4, z) for z in (1.565, 1.53, 1.495) for x in np.linspace(-0.055, 0.055, 4) + rng.normal(0, 0.008, 4)]
    group("p", base, o, [(0, 1, 0)] * len(o), (0, -0.2, -1), 0.07, 0.024, 0.014)
    # cheek ruffs: behind the jaw, swept back and down
    o = [(0.35, y, z) for y in (-0.03, 0.0, 0.03, 0.06) for z in (1.59, 1.625, 1.66, 1.695)]
    o = [(x, y + rng.normal(0, 0.006), z + rng.normal(0, 0.006)) for x, y, z in o]
    group("m", base, o, [(-1, 0, 0)] * len(o), (0.35, 0.75, -0.6), 0.075, 0.025, 0.018)
    # the hips' outer fur
    o = [(0.5, y, z) for y in (-0.02, 0.05) for z in (0.9, 0.82)]
    group("m", base, o, [(-1, 0, 0)] * len(o), (0.2, 0.3, -1), 0.06, 0.02)
    # the backs of the calves
    o = [(HIP_X + rng.normal(0, 0.01), 0.45, z) for z in (0.44, 0.38, 0.32, 0.26)]
    group("m", base, o, [(0, -1, 0)] * len(o), (0, 0.35, -1), 0.06, 0.02, 0.013)
    # shoulders (the arm laid straight): over the deltoid, falling down the arm
    o = [(x + DW + rng.normal(0, 0.006), y, 1.8) for x in (0.25, 0.3, 0.35, 0.4) for y in (0.0, 0.06, 0.12)]
    group("t", baseT, o, [(0, 0, -1)] * len(o), (1, 0.2, -0.35), 0.08, 0.026, 0.017)
    # forearms: tufts off the back, swept toward the elbow
    o = [(x + DW + rng.normal(0, 0.006), 0.4, z + rng.normal(0, 0.006)) for x in (0.53, 0.59, 0.65, 0.71) for z in (1.43, 1.465)]
    group("t", baseT, o, [(0, -1, 0)] * len(o), (-0.7, 0.7, -0.1), 0.07, 0.022, 0.016)
    return groups


def _tufts(p, m, mt, d):
    d = d.copy()
    for space, lo, hi, items in TUFTS:
        q = {"p": p, "m": m, "t": mt}[space]
        k = np.all((q >= lo) & (q <= hi), axis=1)
        if not k.any():
            continue
        qk = q[k]; sub = d[k]
        for a, b, r1, r2 in items:
            sub = smin(sub, round_cone(qk, a, b, r1, r2), 0.012)
        d[k] = sub
    return d


if WOLF:
    TUFTS = _make_tufts()


def grad(p, h=4e-4):
    e = np.eye(3) * h
    g = np.stack([body(p + e[i]) - body(p - e[i]) for i in range(3)], -1)
    return g / np.maximum(np.linalg.norm(g, axis=-1, keepdims=True), 1e-9)
