"""The grotesque zombie sculpted in coloured clay (idle, facing the viewer).

Like a stop-motion or Daggerfall model: the body is pale skin clay, and other colours of clay
are added or carved out where the design needs them:
  add    - lumps and strips pressed on (muscle, ribs, tendons, rot, cloth, rope)
  carve  - clay scooped out (eye sockets, nose, mouth, wound pits, hollows)
  inlay  - a different colour pressed into a carved pit (blood in wounds, eyes, teeth)
There is no painting at this stage: every colour on the render is a piece of clay.
"""
import numpy as np

from clay import sd_cone, sd_ellipsoid, sd_sphere, smin, noise3

(SKIN, TROUSER, CLOTH, ROPE, HAIR, TEETH, EYE, MOUTH, NAIL,
 BLOOD, ROT, RIB, GRIME, GORE) = range(14)


def v(*a):
    return np.array(a, float)


class Sculpt:
    def __init__(self):
        self.pieces, self.cuts, self.inlays = [], [], []

    def add(self, fn, mat=SKIN, bias=0.0):
        self.pieces.append((fn, mat, bias))

    def carve(self, fn):
        self.cuts.append(fn)

    def inlay(self, fn, mat, uses_body=False):
        self.inlays.append((fn, mat, uses_body))

    def wound(self, c, r, mat=BLOOD, depth=0.008):
        """Scoop a pit out of the body, press dark clotted clay into its floor `depth` below
        the old skin, and smear a thin crust of fresh red clay around its lip."""
        self.carve(lambda p, c=c, r=r: sd_ellipsoid(p, c, r))
        self.inlay(lambda p, du, c=c, r=r: np.maximum(sd_ellipsoid(p, c, r * 1.15),
                                                       np.abs(du) - 0.0025 -
                                                       0.003 * noise3(p, 140, 5)),
                   GORE, uses_body=True)
        self.inlay(lambda p, du, c=c, r=r: np.maximum(sd_ellipsoid(p, c, r), du + depth),
                   mat, uses_body=True)

    def field(self):
        pieces, cuts, inlays = self.pieces, self.cuts, self.inlays

        def f(p):
            ds = np.stack([fn(p) for fn, _, _ in pieces])
            bias = np.array([b for _, _, b in pieces])[:, None]
            mats = np.array([m for _, m, _ in pieces])
            d = ds[0]
            for k in range(1, len(ds)):
                d = smin(d, ds[k], 0.012)
            mat = mats[np.argmin(ds + bias, axis=0)]
            du = d
            for cut in cuts:
                d = -smin(-d, cut(p), 0.006)
            for fn, m, body in inlays:
                e = fn(p, du) if body else fn(p)
                mat = np.where(e < d + 0.0005, m, mat)
                d = np.minimum(d, e)
            return d, mat
        return f


def strip(points, r0, r1=None):
    """A clay strip along a polyline (ribs, tendons)."""
    r1 = r0 if r1 is None else r1
    segs = list(zip(points[:-1], points[1:]))
    n = len(segs)

    def fn(p):
        d = None
        for i, (a, b) in enumerate(segs):
            ra = r0 + (r1 - r0) * i / n
            rb = r0 + (r1 - r0) * (i + 1) / n
            e = sd_cone(p, a, b, ra, rb)
            d = e if d is None else np.minimum(d, e)
        return d
    return fn


def pose_idle():
    """Joint positions, metres. s = -1 is the zombie's right (screen-left)."""
    J = dict(pelvis=v(0, 0.93, 0.0), chest=v(0, 1.24, 0.0), head=v(0, 1.635, 0.075))
    for s, n in ((-1, "R"), (1, "L")):
        J["hip" + n] = v(0.105 * s, 0.86, 0.0)
        J["knee" + n] = v(0.165 * s, 0.50, 0.05)
        J["ankle" + n] = v(0.232 * s, 0.115, 0.0)
        J["toe" + n] = v(0.275 * s, 0.03, 0.15)
        J["shoulder" + n] = v(0.235 * s, 1.395, 0.0)
        J["elbow" + n] = v(0.345 * s, 1.135, -0.03)
        J["wrist" + n] = v(0.36 * s, 0.91, 0.07)
    return J


RIBCAGE = (v(0, 1.24, -0.005), v(0.168, 0.185, 0.104))


def on_ribcage(x, y, lift=0.0):
    c, r = RIBCAGE
    q = 1 - (x / r[0]) ** 2 - ((y - c[1]) / r[1]) ** 2
    return v(x, y, c[2] + r[2] * np.sqrt(max(q, 0.0)) + lift)


def build(J):
    S = Sculpt()
    hx, hy, hz = J["head"]
    # ------------------------------------------------ torso
    S.add(lambda p: sd_ellipsoid(p, *RIBCAGE))
    S.add(lambda p: sd_ellipsoid(p, v(0, 1.075, -0.02), v(0.13, 0.10, 0.072)))       # belly
    S.carve(lambda p: sd_ellipsoid(p, v(0, 1.07, 0.085), v(0.075, 0.05, 0.03)))      # sunken gut
    S.add(lambda p: sd_ellipsoid(p, v(0, 1.465, -0.02), v(0.20, 0.09, 0.095)))      # trapezius
    S.add(lambda p: sd_cone(p, v(0, 1.36, -0.01), v(hx, hy - 0.10, hz - 0.03), 0.065, 0.06))
    for k in range(4):  # ribs: pale clay strips laid across the chest
        y0 = 1.33 - 0.046 * k
        for s in (-1, 1):
            pts = [on_ribcage(s * x, y0 - 1.0 * (x - 0.03) ** 2 - 0.08 * (x - 0.03), 0.002)
                   for x in np.linspace(0.03, 0.155 - 0.008 * k, 5)]
            S.add(strip(pts, 0.016, 0.011), RIB)
            gro = [on_ribcage(s * x, y0 - 0.023 - 1.0 * (x - 0.03) ** 2 - 0.08 * (x - 0.03), 0.0)
                   for x in np.linspace(0.04, 0.15 - 0.008 * k, 4)]
            S.carve(strip(gro, 0.011, 0.008))
    for s, n in ((-1, "R"), (1, "L")):
        sh, el, wr = J["shoulder" + n], J["elbow" + n], J["wrist" + n]
        hp, kn, an, to = J["hip" + n], J["knee" + n], J["ankle" + n], J["toe" + n]
        S.add(lambda p, a=v(0.03 * s, 1.40, 0.06), b=sh + v(-0.03 * s, 0.03, 0.03):
              sd_cone(p, a, b, 0.024, 0.03), RIB)                                   # collarbone
        S.add(lambda p, c=sh + v(0.014 * s, -0.012, 0.0): sd_sphere(p, c, 0.078))  # deltoid
        S.add(lambda p, a=sh, b=el: sd_cone(p, a, b, 0.058, 0.043))                # upper arm
        S.add(lambda p, c=sh + (el - sh) * 0.45 + v(0.0, 0, 0.03):
              sd_ellipsoid(p, c, v(0.042, 0.08, 0.035)))                            # biceps
        S.add(lambda p, c=sh + (el - sh) * 0.4 + v(0.012 * s, 0, -0.025):
              sd_ellipsoid(p, c, v(0.042, 0.09, 0.04)))                             # triceps
        S.add(lambda p, c=el: sd_sphere(p, c, 0.057))                              # elbow
        S.add(lambda p, a=el, b=wr: sd_cone(p, a, b, 0.05, 0.036))                 # forearm
        S.add(lambda p, c=el + (wr - el) * 0.3 + v(0.01 * s, 0, 0.015):
              sd_ellipsoid(p, c, v(0.045, 0.075, 0.042)))
        S.add(lambda p, a=v(0.105 * s, 1.30, 0.075), b=v(0.03 * s, 1.27, 0.1):
              sd_cone(p, a, b, 0.05, 0.035))                                        # pectoral
        S.add(strip([v(0.05 * s, 1.60, -0.01), v(0.04 * s, 1.50, 0.04), v(0.025 * s, 1.40, 0.075)],
                    0.017, 0.014))                                                  # neck tendon
        hand(S, wr, s)
        S.add(lambda p, a=hp, b=kn: sd_cone(p, a, b, 0.085, 0.06))                 # thigh
        S.add(lambda p, c=kn + v(0, 0, 0.02): sd_sphere(p, c, 0.058))              # knee
        S.add(lambda p, a=kn, b=an: sd_cone(p, a, b, 0.06, 0.045))                 # shin
        S.add(lambda p, c=kn + (an - kn) * 0.3 + v(0.012 * s, 0, -0.02):
              sd_ellipsoid(p, c, v(0.045, 0.09, 0.045)))                            # calf
        S.add(lambda p, c=an: sd_sphere(p, c, 0.04))                               # ankle
        foot(S, an, to, s)
        S.add(lambda p, a=hp + v(0.015 * s, 0.04, 0), b=kn, c=an, side=s:
              trouser_leg(p, a, b, c, side), TROUSER, -0.004)
    # ------------------------------------------------ head
    S.add(lambda p: sd_ellipsoid(p, v(hx, hy + 0.01, hz - 0.035), v(0.108, 0.118, 0.112)))  # dome
    S.add(lambda p: sd_ellipsoid(p, v(hx, hy - 0.06, hz + 0.02), v(0.098, 0.09, 0.085)))     # face
    S.add(lambda p: sd_ellipsoid(p, v(hx, hy - 0.135, hz + 0.02), v(0.082, 0.05, 0.075)))    # jaw
    for s in (-1, 1):                                                            # brow bumps
        S.add(lambda p, s=s: sd_ellipsoid(p, v(hx + 0.042 * s, hy - 0.002, hz + 0.075),
                                          v(0.04, 0.018, 0.025)))
    for s in (-1, 1):
        S.add(lambda p, c=v(hx + 0.062 * s, hy - 0.07, hz + 0.045): sd_sphere(p, c, 0.036))
        S.add(lambda p, c=v(hx + 0.113 * s, hy - 0.03, hz - 0.03):
              sd_ellipsoid(p, c, v(0.016, 0.032, 0.022)))                           # ear
    for s in (-1, 1):
        S.carve(lambda p, s=s: sd_ellipsoid(p, v(hx + 0.044 * s, hy - 0.035, hz + 0.1),
                                            v(0.032, 0.026, 0.035)))             # sockets
        S.inlay(lambda p, s=s: sd_sphere(p, v(hx + 0.043 * s, hy - 0.04, hz + 0.066), 0.016), EYE)
        S.carve(lambda p, s=s: sd_sphere(p, v(hx + 0.13 * s, hy - 0.01, hz + 0.03), 0.04))
        S.carve(lambda p, s=s: sd_sphere(p, v(hx + 0.085 * s, hy - 0.115, hz + 0.075), 0.03))
    S.carve(lambda p: sd_ellipsoid(p, v(hx, hy - 0.083, hz + 0.1), v(0.02, 0.024, 0.035)))
    S.carve(lambda p: sd_ellipsoid(p, v(hx, hy - 0.132, hz + 0.085), v(0.056, 0.032, 0.06)))
    S.inlay(lambda p: sd_sphere(p, v(hx, hy - 0.132, hz + 0.03), 0.045), MOUTH)
    for k in range(7):
        x = hx - 0.042 + k * 0.014
        S.inlay(lambda p, c=v(x, hy - 0.112 - 0.004 * (k % 2), hz + 0.072 - 0.004 * abs(k - 3)):
                sd_sphere(p, c, 0.0095 - 0.001 * (k % 3)), TEETH)
        S.inlay(lambda p, c=v(x + 0.006, hy - 0.152 + 0.005 * (k % 2), hz + 0.068 - 0.004 * abs(k - 3)):
                sd_sphere(p, c, 0.0088 - 0.001 * (k % 2)), TEETH)
    for s in (-1, 1):  # stringy hair
        for k in range(2):
            top = v(hx + (0.09 + 0.012 * k) * s, hy + 0.07 - 0.03 * k, hz - 0.01 - 0.05 * k)
            bot = v(hx + (0.124 + 0.01 * k) * s, hy - 0.10 - 0.04 * k, hz - 0.02 - 0.05 * k)
            S.inlay(lambda p, a=top, b=bot: sd_cone(p, a, b, 0.009, 0.006), HAIR)
    # ------------------------------------------------ clothing
    S.add(shoulder_cloth, CLOTH, -0.005)
    S.add(lambda p: sd_ellipsoid(p, v(0, 0.93, 0.0), v(0.205, 0.13, 0.13)), TROUSER, -0.002)
    S.add(rope_belt, ROPE, -0.008)
    S.add(front_flap, CLOTH, -0.008)
    # ------------------------------------------------ wounds and rot (coloured clay)
    S.wound(v(hx - 0.045, hy + 0.115, hz + 0.02), v(0.016, 0.045, 0.035))        # scalp gash
    S.wound(v(-0.085, 1.12, 0.10), v(0.032, 0.045, 0.04))                          # flank
    S.wound(v(-0.03, 1.02, 0.095), v(0.03, 0.03, 0.03))
    S.wound(v(-0.375, 1.04, 0.08), v(0.02, 0.04, 0.035))                           # forearms
    S.wound(v(0.355, 1.10, 0.07), v(0.02, 0.035, 0.035))
    S.wound(v(-0.33, 1.25, 0.06), v(0.022, 0.03, 0.03))                            # upper arm
    S.wound(v(-0.205, 0.30, 0.065), v(0.02, 0.04, 0.035))                          # shins
    S.wound(v(0.19, 0.42, 0.10), v(0.022, 0.032, 0.035))
    S.wound(v(0.10, 1.30, 0.12), v(0.014, 0.035, 0.025))                           # chest cut
    S.wound(v(0.21, 0.24, 0.05), v(0.02, 0.03, 0.03))
    for c, r in ((v(-0.265, 1.41, 0.05), 0.03), (v(-0.295, 1.37, 0.04), 0.026),
                 (v(-0.25, 1.355, 0.065), 0.022), (v(-0.31, 1.42, 0.0), 0.022),
                 (v(0.355, 1.0, 0.065), 0.022), (v(0.33, 0.97, 0.07), 0.016),
                 (v(-0.05, 1.07, 0.105), 0.02), (v(0.15, 1.15, 0.09), 0.016)):
        S.add(lambda p, c=c, r=r: sd_sphere(p, c, r), ROT, -0.004)                 # rot lumps
    return S


def hand(S, wr, s):
    """A big bony claw: palm, four curled fingers, a thumb."""
    palm = wr + v(0.008 * s, -0.07, 0.016)
    S.add(lambda p, c=palm: sd_ellipsoid(p, c, v(0.066, 0.07, 0.04)))
    for k in range(4):
        z = 0.06 - 0.04 * k
        k1 = palm + v((0.035 - 0.016 * k) * s, -0.05, z)
        k2 = k1 + v((0.02 - 0.012 * k) * s, -0.075, 0.035)
        k3 = k2 + v(-0.006 * s, -0.05, -0.035)
        S.add(lambda p, a=k1, b=k2: sd_cone(p, a, b, 0.018, 0.015))
        S.add(lambda p, a=k2, b=k3: sd_cone(p, a, b, 0.015, 0.008), NAIL)
        if k < 3:   # carve the gap between this finger and the next
            g = palm + v((0.028 - 0.016 * k) * s, -0.085, z - 0.02)
            S.carve(lambda p, a=g, b=g + v(0.012 * s, -0.07, 0.035): sd_cone(p, a, b, 0.011, 0.01))
    t1 = palm + v(-0.036 * s, -0.01, 0.04)
    S.add(lambda p, a=t1, b=t1 + v(-0.01 * s, -0.07, 0.025): sd_cone(p, a, b, 0.018, 0.011))


def foot(S, an, to, s):
    sole = an + v(0.022 * s, -0.07, 0.075)
    S.add(lambda p, c=sole: sd_ellipsoid(p, c, v(0.085, 0.042, 0.125)))
    for k in range(5):
        tp = to + v(0.028 * (k - 1.4) * s, 0.002, 0.012 - 0.008 * abs(k - 1))
        S.add(lambda p, c=tp, r=0.027 - 0.0025 * k: sd_ellipsoid(p, c, v(r, r * 0.9, r * 1.3)))
        if k < 4:
            g = to + v(0.028 * (k - 0.9) * s, 0.0, 0.03)
            S.carve(lambda p, a=g, b=g + v(0, 0.025, -0.05): sd_cone(p, a, b, 0.009, 0.008))


def trouser_leg(p, a, b, c, side):
    hem_y = 0.36 + 0.06 * np.abs(np.sin((p[:, 0] * 30 + p[:, 2] * 28) * side)) + \
        0.04 * noise3(p, 25, 7)
    d = sd_cone(p, a, b, 0.112, 0.094)
    d = smin(d, sd_cone(p, b, b + (c - b) * 0.42, 0.094, 0.082), 0.012)
    ang = np.arctan2(p[:, 2] - b[2], (p[:, 0] - b[0]) * side)
    d = d - 0.009 * np.sin(ang * 5 + p[:, 1] * 9 + 2.5 * noise3(p, 9, 2)) ** 2   # folds
    return np.maximum(d, hem_y - p[:, 1])


def shoulder_cloth(p):
    """Torn tan cloth slung over the right shoulder, down the right side of the chest."""
    d = sd_ellipsoid(p, v(-0.005, 1.24, -0.007), v(0.19, 0.205, 0.128))
    d = smin(d, sd_sphere(p, v(-0.215, 1.40, -0.02), 0.08), 0.04)
    d = d - 0.008 * np.sin(p[:, 0] * 70 + p[:, 1] * 18) ** 2       # hanging folds
    x, y = p[:, 0], p[:, 1]
    inner = -0.055 - 0.07 * (1.45 - y)
    tear = 0.015 * np.sin(y * 80) + 0.02 * noise3(p, 30, 3)
    d = np.maximum(d, x - inner - tear)
    lateral = -0.25 - 0.04 * (1.42 - y)
    d = np.maximum(d, np.where(y > 1.30, lateral - x, -1))
    bottom = 0.96 + 0.12 * np.abs(np.sin(x * 70)) ** 3 + 0.03 * noise3(p, 22, 4)  # torn strips
    return np.maximum(d, bottom - y)


def rope_belt(p):
    y = p[:, 1] - 1.0
    ang = np.arctan2(p[:, 2] / 0.13, p[:, 0] / 0.205)
    rx, rz = 0.207 * np.cos(ang), 0.132 * np.sin(ang)
    r = np.sqrt((p[:, 0] - rx) ** 2 + (p[:, 2] - rz) ** 2 + y ** 2)
    return r - 0.022 - 0.005 * np.sin(ang * 18 + y * 150)


def front_flap(p):
    d = sd_ellipsoid(p, v(-0.04, 0.89, 0.105), v(0.17, 0.13, 0.045))
    d = np.maximum(d, -sd_ellipsoid(p, v(0, 0.92, 0.0), v(0.21, 0.14, 0.13)) - 0.005)
    bottom = 0.79 + 0.07 * np.abs(np.sin(p[:, 0] * 45 + 1.2)) + 0.025 * noise3(p, 25, 9)
    return np.maximum(d, np.maximum(bottom - p[:, 1], p[:, 1] - 1.0))


RAMPS = {  # clay colours: (ramp, shade) dark -> light, every other shade like the approved zombie
    SKIN: [("earth", 1), ("earth", 3), ("earth", 5), ("earth", 7), ("bone", 7), ("bone", 9),
           ("bone", 11), ("bone", 13)],
    RIB: [("earth", 3), ("earth", 7), ("bone", 7), ("bone", 9), ("bone", 11), ("bone", 13)],
    GRIME: [("earth", 1), ("earth", 3), ("earth", 5), ("earth", 7), ("bone", 5), ("bone", 7),
            ("bone", 9)],
    TROUSER: [("earth", 1), ("earth", 3), ("earth", 5), ("earth", 7), ("earth", 9),
              ("earth", 11)],
    CLOTH: [("earth", 3), ("earth", 7), ("earth", 9), ("earth", 11), ("earth", 13),
            ("earth", 14)],
    ROPE: [("earth", 1), ("wood", 5), ("wood", 7), ("wood", 9), ("earth", 11)],
    HAIR: [("stone", 3), ("stone", 5), ("stone", 7), ("stone", 9)],
    TEETH: [("bone", 5), ("bone", 9), ("bone", 11), ("bone", 13)],
    EYE: [("blood", 5), ("blood", 7), ("blood", 9), ("blood", 11)],
    MOUTH: [("blood", 1), ("blood", 1), ("blood", 3), ("blood", 3)],
    NAIL: [("earth", 3), ("earth", 5), ("bone", 5), ("bone", 7)],
    BLOOD: [("blood", 1), ("blood", 1), ("blood", 3), ("blood", 5)],
    GORE: [("blood", 1), ("blood", 3), ("blood", 5), ("blood", 7)],
    ROT: [("moss", 1), ("moss", 3), ("moss", 5), ("moss", 7), ("moss", 9)],
}
CENTRE = {SKIN: 0.38, TROUSER: 0.5, CLOTH: 0.5, RIB: 0.55, GRIME: 0.45}   # where each colour's mid tone sits
