"""The zombie's sculpt as a signed distance field (numpy, metres, Blender axes: +X = its left,
-Y = forward, +Z = up). Bones sit exactly where the UAL2 mannequin's do, so every clip fits.

Paired parts are written once for the left side and mirrored by evaluating at |x|.
Face features sit where the painted sheet puts them (see uvmap.HEAD): eyes, nose, mouth, chin.
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


# ---- rig landmarks (left side, from UAL2_Standard) ------------------------------------------
FINGERS = {  # 01 head, 02 head, 03 head, 04 head, 04 tail
    "index": [(0.859, 0.035, 1.439), (0.899, 0.035, 1.439), (0.934, 0.035, 1.439), (0.964, 0.035, 1.439), (0.995, 0.035, 1.439)],
    "middle": [(0.860, 0.060, 1.441), (0.903, 0.062, 1.441), (0.937, 0.064, 1.441), (0.971, 0.065, 1.441), (1.005, 0.067, 1.441)],
    "ring": [(0.858, 0.083, 1.441), (0.897, 0.084, 1.441), (0.928, 0.085, 1.441), (0.960, 0.086, 1.441), (0.992, 0.087, 1.441)],
    "pinky": [(0.847, 0.106, 1.439), (0.887, 0.109, 1.439), (0.914, 0.111, 1.439), (0.942, 0.113, 1.439), (0.971, 0.115, 1.439)],
    # the rig's thumb runs 18 cm from the wrist and gets flung about by the clips: this one is
    # modelled short and curled against the palm, and rides the hand bone alone
    "thumb": [(0.772, 0.046, 1.432), (0.812, 0.022, 1.426), (0.842, 0.008, 1.421), (0.866, 0.0, 1.418), (0.886, -0.005, 1.416)],
}
FINGER_R = {"index": 0.009, "middle": 0.0094, "ring": 0.0088, "pinky": 0.0077, "thumb": 0.0115}
TIP_FRAC = {"thumb": 0.0}  # fingertips end part-way along the leaf bone (the rig's fingers run long)
TOES = [(0.064, 0.0125, 0.075), (0.08, 0.009, 0.068), (0.093, 0.0085, 0.06), (0.105, 0.008, 0.052), (0.116, 0.0075, 0.045)]

# face landmarks (from the painted sheet through uvmap's head projection)
EYE = (0.0335, -0.0585, 1.689)
EYE_R = 0.0125
MOUTH_C = (0.0, -0.058, 1.606)   # the slack jaw hangs open over a deep cavity
MOUTH_R = (0.021, 0.042, 0.011)
# variant switches, set per monster (monsters.py); the defaults are the first zombie
V = dict(mouth="zombie", lids="heavy", nose="rotted", crown=True, tear=True, bloat=0.0, bulk=0.0, claws=1.0,
         brow=1.0, cheeks=False, holes=[], teeth=1.0, gape=1.0, dome=1.0, shoulder=0.0, ropes=False, bony=0.0, lips=1.0, teeth_fwd=0.0,
         bumps=[], ridges=[], ears=1.0, canine=1.0, slitw=1.0, hollow=0.0, inner=[], taper=0.0, sunk=0.0)
SLIT_C = np.array([0.0, -0.068, 1.625])  # the maw: a slit splitting the face from the eyes to the chin
SLIT_R = np.array([0.0115, 0.042, 0.068])


def cavity_c():
    return SLIT_C if V["mouth"] == "slit" else np.array(MOUTH_C)


ROPES = [  # (polyline on the left side, radius); arms in T-space
    ([(0.028, -0.044, 1.47), (0.034, -0.036, 1.505), (0.031, -0.03, 1.54), (0.037, -0.022, 1.575)], 0.0024),
    ([(0.05, -0.006, 1.47), (0.047, 0.004, 1.52), (0.043, 0.012, 1.57)], 0.002),
    ([(0.48, 0.05, 1.462), (0.55, 0.043, 1.466), (0.62, 0.049, 1.463), (0.7, 0.044, 1.458)], 0.0024),
    ([(0.5, 0.08, 1.462), (0.6, 0.086, 1.458), (0.69, 0.08, 1.455)], 0.002),
    ([(0.072, -0.034, 0.46), (0.077, -0.025, 0.36), (0.074, -0.02, 0.26), (0.079, -0.012, 0.16)], 0.0024),
    ([(0.11, 0.0, 0.8), (0.118, -0.01, 0.7), (0.112, -0.018, 0.6)], 0.0022),
]


def mouth_r():
    g = V["gape"]
    return np.array(MOUTH_R) * ((1.25, 1.0, 1.45) if V["mouth"] == "fangs" else (1, 1, 1)) * (1 + 0.15 * (g - 1), 1, g)


def cavity_q(P, scale=(1.0, 1.0, 1.0)):
    """Normalised distance into the open mouth (or the maw's slit): < 1 is inside."""
    if V["mouth"] == "slit":
        return np.linalg.norm((P - SLIT_C) / (SLIT_R * scale), axis=1)
    return np.linalg.norm((P - np.array(MOUTH_C)) / (mouth_r() * scale), axis=1)


def in_mouth(c):
    if V["mouth"] == "slit":
        return (cavity_q(c, (1.35, 1.0, 1.08)) < 1) & (c[:, 1] > -0.086)
    out = (cavity_q(c, (1.3, 1.0, 1.7)) < 1) & (c[:, 1] > -0.083)
    if V["tear"]:
        out |= (ellipsoid(c, TEAR_C, TEAR_R, TEAR_ROT) < 0.003) & (c[:, 0] > 0)
    return out
TEAR_C = (0.04, -0.047, 1.603)   # the left cheek torn open to the molars: a slot along the cheek
TEAR_R = (0.017, 0.04, 0.0135)   # (depth into the face, length along the cheek, height)
TEAR_ROT = np.array([[0.8, -0.6, 0.0], [0.6, 0.8, 0.0], [0.0, 0.0, 1.0]]).T
HEAD_C = np.array([0.0, 0.022, 1.708])   # cranium centre and radii (see head())
HEAD_R = np.array([0.071, 0.099, 0.087])


def _on_skull(s, inset):
    """Point on the cranium ellipsoid in the direction of s, and its outward direction."""
    u = np.asarray(s, float) - HEAD_C
    u /= np.linalg.norm(u)
    t = 1.0 / np.linalg.norm(u / HEAD_R)
    return HEAD_C + u * (t - inset), u


# the skull caved in over the left temple: overlapping craters, stepped, ragged
CROWN = []
for _s, _r, _d in (((0.05, 0.0, 1.765), 0.0165, 0.0085), ((0.064, 0.024, 1.744), 0.0075, 0.004),
                   ((0.034, -0.024, 1.774), 0.0055, 0.003)):
    _p, _u = _on_skull(_s, 0.0)
    CROWN.append((_p + _u * (_r - _d), _r))
CROWN_C = tuple(CROWN[0][0])
APOSE = np.radians(45)                   # the mesh is bound with the arms hanging 45 deg (A-pose)
SHOULDER = np.array([0.192, 0.065, 1.441])  # upperarm head (left side; mirrored for the right)
_CA, _SA = np.cos(APOSE), np.sin(APOSE)


def to_A(m):
    """T-pose point (mirrored, x >= 0) -> where it sits with the arm hanging in the A-pose."""
    v = np.atleast_2d(m) - SHOULDER
    return SHOULDER + np.stack([_CA * v[:, 0] + _SA * v[:, 2], v[:, 1], -_SA * v[:, 0] + _CA * v[:, 2]], -1)


def to_T(m):
    """A-pose point (mirrored) -> T-pose, rigidly about the shoulder."""
    v = np.atleast_2d(m) - SHOULDER
    return SHOULDER + np.stack([_CA * v[:, 0] - _SA * v[:, 2], v[:, 1], _SA * v[:, 0] + _CA * v[:, 2]], -1)
JAW_PIV = np.array([0.0, -0.03, 1.60])  # the jaw hangs crooked: shifted and tilted to its left
JAW_OFF = np.array([0.0045, 0.0, 0.001])


def finger_pts(name):
    pts = [np.array(q, float) for q in FINGERS[name]]
    frac = TIP_FRAC.get(name, 0.45)
    if frac <= 0:
        return pts[:-1]
    pts[-1] = pts[-2] + (pts[-1] - pts[-2]) * frac
    return pts


def nail_c(name):
    pts = finger_pts(name)
    tip, prev = np.array(pts[-1]), np.array(pts[-2])
    dirv = (tip - prev) / np.linalg.norm(tip - prev)
    nb = V["taper"]   # tapered fingers: the nail sits back on the top of the tip, the tip's skin shows past it
    return tip + dirv * (0.0018 - 0.0062 * nb + 0.0075 * (V["claws"] - 1)) + np.array([0, 0, FINGER_R[name] * (0.42 + 0.1 * nb)])


def unbend(P):
    """A-pose positions (either side) -> T-pose, easing in across the shoulder (for the UVs)."""
    P = np.atleast_2d(P)
    sgn = np.where(P[:, 0] < 0, -1.0, 1.0)
    m = P.copy(); m[:, 0] = np.abs(m[:, 0])
    da = np.array([_CA, 0, -_SA])
    v = m - SHOULDER
    proj = v @ da
    perp = np.linalg.norm(v - proj[:, None] * da, axis=1)
    a = APOSE * _ss(-0.03, 0.02, proj) * (1 - _ss(0.075, 0.11, perp))
    c, s = np.cos(a), np.sin(a)
    out = SHOULDER + np.stack([c * v[:, 0] - s * v[:, 2], v[:, 1], s * v[:, 0] + c * v[:, 2]], -1)
    out[:, 0] *= sgn
    return out


def _ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ---- the body -------------------------------------------------------------------------------

def head(p):
    m = p.copy(); m[:, 0] = np.abs(m[:, 0])
    d = ellipsoid(p, (0, 0.022, 1.708 - 0.03 * (1 - V["dome"])), (0.071, 0.099, 0.087 * V["dome"]))   # cranium: a long egg
    d = smin(d, ellipsoid(p, (0, 0.098, 1.68), (0.042, 0.022, 0.024)), 0.025)      # occipital knob
    for c, r in (CROWN if V["crown"] else []):                                       # caved-in skull
        jag = 0.0013 * np.sin(p[:, 0] * 1700 + 2 * np.sin(p[:, 1] * 1300)) * np.sin(p[:, 2] * 1500)
        d = smax(d, -(sphere(p, c, r) + jag), 0.0015)
    d = smin(d, ellipsoid(p, (0, -0.03, 1.645), (0.05, 0.055, 0.062)), 0.04)       # midface
    q = jaw_space(p); qm = q.copy(); qm[:, 0] = np.abs(qm[:, 0])
    d = smin(d, round_cone(qm, (0.0, -0.066, 1.577), (0.05, -0.012, 1.594), 0.017, 0.013), 0.02)  # crooked jaw
    d = smin(d, round_cone(qm, (0.05, -0.012, 1.594), (0.056, 0.01, 1.645), 0.012, 0.0105), 0.015)
    d = smin(d, sphere(q, (0, -0.068, 1.576), 0.019), 0.012)                        # chin
    d = smin(d, ellipsoid(m, (0.044, -0.047, 1.667), (0.017, 0.016, 0.011)), 0.014)  # cheekbones, tucked in
    for a, b in (((0.005, -0.083, 1.705), (0.027, -0.081, 1.713)), ((0.027, -0.081, 1.713), (0.051, -0.068, 1.706))):
        bs = V["brow"]                                                               # brows arched over each socket
        d = smin(d, round_cone(m, (a[0], a[1] + (1 - bs) * 0.012, a[2]), (b[0], b[1] + (1 - bs) * 0.012, b[2]), 0.0108 * bs, 0.0108 * bs), 0.01)
    d = smin(d, sphere(m, (0.062, 0.03, 1.628), 0.012), 0.012)                       # mastoids
    sk = 1 + 0.3 * V["sunk"]                                                         # starved: deeper temples and cheeks
    d = smax(d, -ellipsoid(m, (0.074, -0.028, 1.716), (0.011 * sk, 0.026, 0.02 * sk)), 0.016)  # temples
    d = smax(d, -ellipsoid(m, (0.047, -0.056, 1.635), (0.016 * sk, 0.021 * sk, 0.024)), 0.02)  # cheek hollows, right under the sockets
    d = smax(d, -ellipsoid(m, (EYE[0], EYE[1] - 0.004, EYE[2]), (0.021, 0.02, 0.016)), 0.008)  # sockets
    d = smin(d, sphere(m, EYE, EYE_R), 0.003)                                        # eyeballs
    heavy = V["lids"] == "heavy"
    for sx, lift in ((1, 0.0028), (-1, 0.0)):   # upper lids: heavy and half shut, or drawn back off staring eyes
        if not heavy:
            lift = 0.0052
        lid = round_cone(p * [sx, 1, 1], (EYE[0] - 0.012, EYE[1] - 0.0075, EYE[2] + 0.0045 + lift), (EYE[0] + 0.013, EYE[1] - 0.005, EYE[2] + 0.0035 + lift), 0.0058 if heavy else 0.0042, 0.005 if heavy else 0.0036)
        d = smin(d, np.where(p[:, 0] * sx > 0, lid, 1.0), 0.004)
    d = smin(d, round_cone(m, (EYE[0] - 0.011, EYE[1] - 0.009, EYE[2] - 0.0095), (EYE[0] + 0.007, EYE[1] - 0.008, EYE[2] - 0.0085), 0.0036, 0.003), 0.004)  # baggy lower lids, broken at the outer orbit
    # nose: rotted down, the bridge sunk, two dark slits
    if V["nose"] == "skull":   # the nose rotted clean away: a pear-shaped skull aperture
        d = smax(d, -ellipsoid(p, (0, -0.074, 1.659), (0.0082, 0.0172, 0.0118)), 0.004)
    if V["nose"] == "rotted":
        d = smin(d, round_cone(p, (0, -0.079, 1.702), (0, -0.086, 1.665), 0.0072, 0.0075), 0.009)  # cartilage rotted off
        d = smin(d, sphere(m, (0.0105, -0.08, 1.657), 0.0075), 0.007)
        d = smax(d, -ellipsoid(m, (0.0062, -0.087, 1.655), (0.0045, 0.011, 0.0075)), 0.002)  # skull-dark nasal holes
    if V["mouth"] == "slit":
        # the maw: the face splits from brow to chin, raw rims rolled back off rows of needles
        for sx in (1, -1):
            sw = V["slitw"]
            rim = round_cone(p * [sx, 1, 1], (0.0125 * sw, -0.08 - 0.004 * (sw - 1), 1.70), (0.0135 * sw, -0.083 + 0.005 * (sw - 1), 1.585 + 0.011 * (sw - 1)),
                             0.0045 * (1 + 0.3 * (sw - 1)), 0.0045 * (1 + 0.3 * (sw - 1)))
            d = smin(d, np.where(p[:, 0] * sx > 0, rim, 1.0), 0.006)
        d = smax(d, -ellipsoid(p, SLIT_C, SLIT_R), 0.004)
        return d
    # mouth: thin lips peeled back off the teeth, jaw dropped, a real cavity behind
    lp = V["lips"]
    d = smin(d, round_cone(m, (0.0, -0.0815, 1.6215), (0.025, -0.07, 1.614), 0.0048 * lp, 0.0036 * lp), 0.006)
    d = smin(d, round_cone(qm, (0.0, -0.079 + 0.004 * (1 - lp), 1.590), (0.023, -0.069, 1.598), 0.0054 * lp, 0.0038 * lp), 0.006)  # lower lip hangs
    d = smax(d, -ellipsoid(p, MOUTH_C, mouth_r()), 0.004)
    if V["tear"]:
        tear = ellipsoid(p, TEAR_C, TEAR_R, TEAR_ROT)
        tear -= 0.0016 * np.sin(p[:, 1] * 900) * np.sin(p[:, 2] * 700)             # ragged edges
        d = smax(d, -tear, 0.003)
    return d


def jaw_space(p):
    """Points in the crooked jaw's own frame (it is designed straight, then hung askew)."""
    return (p - JAW_PIV) @ rot_y(7) + JAW_PIV - JAW_OFF


def jaw_world(q):
    return (q + JAW_OFF - JAW_PIV) @ rot_y(7).T + JAW_PIV


def neck(p, m):
    d = round_cone(p, (0, 0.022, 1.445), (0, 0.016, 1.625), 0.055, 0.043)
    d = smin(d, round_cone(m, (0.042, 0.014, 1.615), (0.02, -0.048, 1.475), 0.0085, 0.0072), 0.024)  # SCM cords
    d = smin(d, round_cone(p, (0, -0.042, 1.575), (0, -0.047, 1.535), 0.0105 - 0.004 * V["bony"], 0.0085 - 0.003 * V["bony"]), 0.02)  # larynx
    if V["bony"] and V["hollow"]:   # the skin drawn tight under the jaw: bone and tendon show
        d = smax(d, -ellipsoid(m, (0.03, -0.035, 1.565), (0.022, 0.03, 0.012)), 0.012)
    return d


def ribcage(p, m):
    c = np.array([0, 0.015, 1.29])
    d = ellipsoid(p, c, (0.124, 0.09, 0.18))
    q = m - c
    ang = np.arctan2(q[:, 0], -q[:, 1])                     # 0 front .. pi back
    s = p[:, 2] - 0.055 * (1 - np.cos(ang))                  # ribs climb toward the spine
    ridge = np.maximum(np.cos(2 * np.pi * (s - 1.16) / 0.027), 0) ** 3
    zone = _ss(1.12, 1.17, s) * (1 - _ss(1.36, 1.41, s)) * _ss(0.45, 0.8, ang) * (1 - _ss(2.3, 2.7, ang))
    return d - 0.0034 * ridge * zone


def torso(p, m):
    d = ribcage(p, m)
    sh = V["shoulder"]
    d = smin(d, round_cone(m, (0.0, 0.03, 1.40), (0.145, 0.05, 1.415), 0.052, 0.032 + 0.008 * sh), 0.04 + 0.015 * sh)  # shoulder girdle
    d = smin(d, round_cone(m, (0.028, 0.04, 1.55), (0.14, 0.045, 1.446), 0.02, 0.017 + 0.004 * sh), 0.04 + 0.01 * sh)  # trapezius sloping off the neck
    bl = V["bloat"]
    d = smin(d, ellipsoid(p, (0, 0.045 - 0.075 * bl, 1.10 + 0.012 * bl), (0.098 + 0.03 * bl, 0.06 + 0.075 * bl, 0.115 + 0.018 * bl)), 0.05 + 0.06 * bl)  # gut: sunk, or one smooth bloated belly
    if bl > 0.5:   # bloated: the lower chest swells into the gut, one soft overhang, no shelf
        d = smin(d, ellipsoid(p, (0, 0.02 - 0.04 * bl, 1.2), (0.105 + 0.02 * bl, 0.085 + 0.025 * bl, 0.11)), 0.05 + 0.03 * bl)
    d = smin(d, ellipsoid(p, (0, 0.03, 0.958), (0.13, 0.085, 0.085)), 0.05)          # pelvis
    d = smin(d, sphere(m, (0.112, -0.006, 1.0), 0.028), 0.02)                        # iliac crests
    d = smin(d, ellipsoid(m, (0.058, 0.075, 0.905), (0.062, 0.045, 0.068)), 0.03)    # flat buttocks
    d = smin(d, ellipsoid(m, (0.085, 0.088, 1.37), (0.055, 0.02, 0.07), rot_y(12)), 0.025)  # scapulae
    d = smin(d, round_cone(m, (0.026, -0.07, 1.462), (0.075, -0.064, 1.468), 0.0095, 0.0085), 0.01)  # clavicles, S-curved
    d = smin(d, sphere(p, (0.0, -0.058, 1.466), 0.017), 0.012)                                    # fill the notch between them
    d = smin(d, round_cone(m, (0.075, -0.064, 1.468), (0.135, -0.02, 1.466), 0.0085, 0.008), 0.016)
    d = smax(d, -sphere(p, (0, -0.08, 1.476), 0.013), 0.016)                         # sternal notch
    d = smin(d, ellipsoid(m, (0.06, -0.07, 1.36), (0.06, 0.018, 0.045)), 0.03)       # wasted pecs
    d = smin(d, round_cone(p, (0, -0.088, 1.43), (0, -0.088, 1.22), 0.008, 0.008), 0.03)  # sternum
    d = smax(d, -ellipsoid(m, (0.072, -0.02, 1.486), (0.026, 0.013, 0.011)), 0.02)  # hollows over the collarbones
    for z in np.linspace(1.03, 1.52, 15):                                            # vertebrae
        yb = 0.092 + 0.01 * np.sin((z - 1.0) * 3.0)
        if z > 1.45:
            yb = 0.089 - (z - 1.45) * 0.6
        d = smin(d, sphere(p, (0, yb, z), 0.013), 0.01)
    return d


def arm(m):
    d = ellipsoid(m, (0.207, 0.062, 1.436), (0.04, 0.038, 0.035))                    # wasted deltoid, low on the arm
    d = smin(d, round_cone(m, (0.2, 0.065, 1.441), (0.45, 0.07, 1.441), 0.034, 0.026), 0.03)
    d = smin(d, sphere(m, (0.468, 0.088, 1.441), 0.021), 0.015)                      # olecranon
    d = smin(d, ellipsoid(m, (0.466, 0.07, 1.441), (0.024, 0.031, 0.031)), 0.01)     # epicondyles
    d = smin(d, round_cone(m, (0.48, 0.068, 1.441), (0.735, 0.065, 1.441), 0.029, 0.019), 0.02)
    d = smin(d, ellipsoid(m, (0.56, 0.06, 1.446), (0.07, 0.03, 0.028)), 0.02)        # stringy forearm
    d = smin(d, round_cone(m, (0.48, 0.09, 1.443), (0.735, 0.081, 1.447), 0.0075, 0.0062), 0.008)  # ulna ridge
    d = smin(d, round_cone(m, (0.52, 0.05, 1.43), (0.73, 0.047, 1.432), 0.0065, 0.0075), 0.008)    # radius
    d = smin(d, sphere(m, (0.737, 0.083, 1.447), 0.0085), 0.006)                     # ulna knob
    return d


def hand(m):
    d = ellipsoid(m, (0.802, 0.072, 1.441), (0.058, 0.047, 0.0125))                  # palm
    d = smax(d, -ellipsoid(m, (0.805, 0.075, 1.431), (0.03, 0.026, 0.0055)), 0.006)  # cupped
    wk = 1 + 0.12 * min(V["bulk"], 0.0)                                              # (a thinned arm: a thinner wrist, no knob)
    d = smin(d, round_cone(m, (0.70, 0.066, 1.441), (0.772, 0.07, 1.441), 0.02 * wk, 0.017 * wk), 0.012)  # wrist
    t = finger_pts("thumb")
    d = smin(d, round_cone(m, (0.778, 0.052, 1.436), t[1], 0.018, 0.0128), 0.016)    # thenar web
    for name in ("index", "middle", "ring", "pinky"):
        pts = finger_pts(name)
        base = np.array(pts[0])
        d = smin(d, round_cone(m, (0.755, base[1] * 0.85 + 0.01, 1.4495), base + (0, 0, 0.0065), 0.0048, 0.0052), 0.005)  # tendons
        d = smin(d, sphere(m, base + (0.0, 0, 0.004), FINGER_R[name] * 1.25), 0.006)  # knuckles
    for name in FINGERS:
        pts = finger_pts(name)
        r = FINGER_R[name]
        f = None
        for j in range(len(pts) - 1):
            last = j == len(pts) - 2
            tipr = min(max(0.45, 0.62 - 0.12 * (V["claws"] - 1)), 0.62 - 0.22 * V["taper"])   # claws / taper: the last joint narrows
            seg = round_cone(m, pts[j], pts[j + 1], r * (0.86 - 0.08 * j), r * (tipr if last else 0.78 - 0.08 * j))
            f = seg if f is None else smin(f, seg, 0.003)
            if 0 < j:   # bony knuckles; on a tapered hand the last one stays small, or the tip reads as a ball
                f = smin(f, sphere(m, pts[j] + (0, 0, 0.0012), r * (1.12 - 0.07 * j) * (1 - 0.28 * V["taper"] * last)), 0.003)
        tip, prev = np.array(pts[-1]), np.array(pts[-2])
        dirv = (tip - prev) / np.linalg.norm(tip - prev)
        f = smin(f, ellipsoid(m, nail_c(name), (0.0098 * V["claws"] * (1 - 0.35 * V["taper"]), r * 0.6 * (1 - 0.15 * V["taper"]),
                                                0.0016 * min(V["claws"], 1.6))), 0.0015)  # nails, overhanging to a point
        d = smin(d, f, 0.007 if name != "thumb" else 0.012)
    return d


def leg(m):
    d = round_cone(m, (0.089, 0.005, 0.93), (0.089, 0.0, 0.57), 0.066, 0.041)
    d = smin(d, ellipsoid(m, (0.075, -0.015, 0.8), (0.05, 0.05, 0.1)), 0.03)          # wasted quads
    d = smax(d, -ellipsoid(m, (0.033, 0.0, 0.75), (0.014, 0.035, 0.11)), 0.02)        # sunken inner thigh
    d = smin(d, ellipsoid(m, (0.089, 0.002, 0.533), (0.046, 0.04, 0.038)), 0.02)      # condyles
    d = smin(d, sphere(m, (0.089, -0.036, 0.536), 0.022), 0.012)                      # kneecap
    d = smin(d, round_cone(m, (0.089, 0.004, 0.52), (0.089, 0.032, 0.115), 0.036, 0.022), 0.02)
    d = smin(d, ellipsoid(m, (0.091, 0.03, 0.4), (0.034, 0.033, 0.085)), 0.02)        # calf
    d = smin(d, round_cone(m, (0.087, -0.028, 0.49), (0.087, 0.007, 0.14), 0.012, 0.009), 0.01)  # shin bone
    d = smin(d, sphere(m, (0.113, 0.035, 0.098), 0.012), 0.01)                        # ankle knobs
    d = smin(d, sphere(m, (0.066, 0.03, 0.105), 0.012), 0.01)
    # foot: heel, bony arch, splayed toes, flat sole
    f = sphere(m, (0.089, 0.05, 0.042), 0.034)
    f = smin(f, round_cone(m, (0.089, 0.03, 0.06), (0.086, -0.115, 0.028), 0.032, 0.028), 0.03)
    f = smin(f, ellipsoid(m, (0.087, -0.1, 0.028), (0.043, 0.04, 0.026)), 0.02)
    for x, r, ln in TOES:
        f = smin(f, round_cone(m, (x, -0.12, 0.027), (x + (x - 0.089) * 0.15, -0.12 - ln, 0.017), r, r * 0.85), 0.004)
    f = smax(f, -(m[:, 2] - 0.002), 0.01)                                             # sole
    d = smin(d, f, 0.025)
    return d


def body(p):
    p = np.atleast_2d(p).astype(float)
    m = p.copy(); m[:, 0] = np.abs(m[:, 0])
    bu, bl = V["bulk"], V["bloat"]
    d = torso(p, m) - 0.009 * bu - 0.008 * bl
    d = smin(d, neck(p, m) - 0.0025 * bu - 0.003 * bl, 0.035 + 0.006 * (bu + bl))   # no ring where neck meets chest
    d = smin(d, head(p), 0.03)
    mt = to_T(m)                       # arms and hands are sculpted straight, then hung in the A-pose
    # a thinned arm stays full over its last 10 cm, so the forearm still runs into the palm (else the
    # wrist pinches to a neck and the hand floats off it)
    wr = np.clip((0.71 - mt[:, 0]) / 0.14, 0.0, 1.0) if bu < 0 else 1.0
    d = smin(d, arm(mt) - 0.007 * bu * wr - 0.005 * bl, 0.035)
    d = smin(d, hand(mt) - 0.0006 * bu, 0.015)                     # bloat never balloons the fingers
    d = smin(d, leg(m) - 0.008 * bu - 0.004 * bl, 0.03)
    for pts, r0, r1 in V["ridges"]:              # ribs, sternum, sagging folds, bone spurs (A-space polylines)
        k = len(pts) - 1
        for i in range(k):
            d = smin(d, round_cone(p, pts[i], pts[i + 1], r0 + (r1 - r0) * i / k, r0 + (r1 - r0) * (i + 1) / k), 0.004)
    for c, r in V["bumps"]:                       # boils and barnacles big enough to break the silhouette
        d = smin(d, sphere(p, c, r), 0.003)
    if V["ropes"]:                               # swollen veins roped over the neck, forearms and shins
        for path, r in ROPES:
            ms = m if path[0][2] < 1.3 or path[0][0] < 0.3 else mt
            rs = r * float(V["ropes"])
            for a, b in zip(path[:-1], path[1:]):
                d = smin(d, round_cone(ms, a, b, rs, rs * 0.9), 0.003)
    if V["bony"]:                                # bonier knees, elbows and spine on the starved ones
        bo = V["bony"]
        d = smin(d, sphere(m, (0.089, -0.04, 0.536), 0.016 * bo), 0.008)                          # kneecaps
        d = smin(d, sphere(to_T(m), (0.468, 0.094, 1.441), 0.013 * bo), 0.008)                    # elbow points
        for z in np.linspace(1.05, 1.47, 12):                                                      # spine ridge
            d = smin(d, sphere(p, (0, 0.1 + 0.008 * np.sin((z - 1.0) * 3.0), z), 0.009 * bo), 0.006)
    for c, r in V["holes"]:                      # painted wounds carved open
        d = smax(d, -sphere(p, c, r), 0.002)
    for pts, r0, r1 in V["inner"]:               # what shows inside a wound: broken ribs
        k = len(pts) - 1
        for i in range(k):
            d = smin(d, round_cone(p, pts[i], pts[i + 1], r0 + (r1 - r0) * i / k, r0 + (r1 - r0) * (i + 1) / k), 0.002)
    return d


def grad(p, h=4e-4):
    e = np.eye(3) * h
    g = np.stack([body(p + e[i]) - body(p - e[i]) for i in range(3)], -1)
    return g / np.maximum(np.linalg.norm(g, axis=-1, keepdims=True), 1e-9)
