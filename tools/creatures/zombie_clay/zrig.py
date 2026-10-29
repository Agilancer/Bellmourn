"""The approved clay-5 zombie on a skeleton, so it can be posed and turned.

Every clay piece is sculpted in the rest pose (the approved idle) and belongs to one bone. A
pose moves the bones; each piece is evaluated in its bone's rest space, so clay rides on its
bone rigidly and bone lengths never change. Legs and arms are solved with two-bone IK from a
foot / hand target and a pole (knees bend forward, elbows bend back and out).

Pose keys (all optional; angles in degrees):
  root      (dx, dy, dz) pelvis offset from rest      hips  (pitch, yaw, roll) pelvis turn
  spine     (pitch, yaw, roll) chest on the pelvis    head  (pitch, yaw, roll) on the chest
  ankleR/L  world target for the ankle               footR/L (pitch, yaw) toe down / turn
  kneeR/L   knee pole (world)                        wristR/L offset of the wrist target in
  elbowR/L  elbow pole (chest space)                    chest space, from its rest spot
  wristR_abs / wristL_abs: absolute wrist target in world space
pitch > 0 leans forward / looks down.
"""
import numpy as np

from clay import noise3, sd_cone, sd_ellipsoid, sd_sphere, smin
import zclay as Z5
from zclay import (BLOOD, CLOTH, EYE, GORE, GRIME, HAIR, MOUTH, NAIL, RIB, ROPE, ROT, SKIN,
                   TEETH, TROUSER, strip)


def v(*a):
    return np.array(a, float)


def norm(a):
    a = np.asarray(a, float)
    return a / max(np.linalg.norm(a), 1e-9)


def euler(pitch=0.0, yaw=0.0, roll=0.0):
    p, y, r = np.radians([pitch, yaw, roll])
    Rx = np.array([[1, 0, 0], [0, np.cos(p), -np.sin(p)], [0, np.sin(p), np.cos(p)]])
    Ry = np.array([[np.cos(y), 0, np.sin(y)], [0, 1, 0], [-np.sin(y), 0, np.cos(y)]])
    Rz = np.array([[np.cos(r), -np.sin(r), 0], [np.sin(r), np.cos(r), 0], [0, 0, 1]])
    return Ry @ Rx @ Rz


REST = Z5.pose_idle()
REST["waist"] = v(0, 1.0, -0.02)
REST["neck"] = v(0, 1.46, 0.0)
SIDES = (("R", -1), ("L", 1))
LEN = {}
for n, s in SIDES:
    LEN["thigh" + n] = np.linalg.norm(REST["knee" + n] - REST["hip" + n])
    LEN["shin" + n] = np.linalg.norm(REST["ankle" + n] - REST["knee" + n])
    LEN["uarm" + n] = np.linalg.norm(REST["elbow" + n] - REST["shoulder" + n])
    LEN["farm" + n] = np.linalg.norm(REST["wrist" + n] - REST["elbow" + n])


def limb_frame(a, b, pole):
    y = norm(b - a)
    z = norm(pole - y * np.dot(pole, y))
    x = np.cross(y, z)
    return np.stack([x, y, z], 1)


def two_bone(a, target, l1, l2, pole):
    d = target - a
    dist = np.clip(np.linalg.norm(d), 1e-4, l1 + l2 - 1e-4)
    dn = norm(d)
    ca = (l1 ** 2 + dist ** 2 - l2 ** 2) / (2 * l1 * dist)
    h = l1 * np.sqrt(max(0.0, 1 - ca ** 2))
    pp = norm(pole - dn * np.dot(pole, dn))
    return a + dn * l1 * ca + pp * h, a + dn * dist


def knee_pole(s, yaw=0.0):
    return euler(0, yaw, 0) @ norm(v(0.15 * s, 0.0, 1.0))


def elbow_pole(s):
    return norm(v(0.45 * s, -0.1, -1.0))


def foot_toe(ankle, s, pitch, yaw, rest_vec):
    d = euler(0, yaw, 0) @ rest_vec
    side = norm(np.cross(v(0, 1, 0), d))
    c, sn = np.cos(np.radians(pitch)), np.sin(np.radians(pitch))
    d = d * c + np.cross(side, d) * sn + side * np.dot(side, d) * (1 - c)
    return ankle + d


def solve(pose=None):
    """-> (frames {bone: (rest origin, rest F, posed origin, posed F)}, joints {name: point})."""
    P = dict(pose or {})
    F, J = {}, {}
    I = np.eye(3)
    # pelvis
    pr = REST["pelvis"]
    pp = pr + v(*P.get("root", (0, 0, 0)))
    Fp = euler(*P.get("hips", (0, 0, 0)))
    F["pelvis"] = (pr, I, pp, Fp)

    def pelvis_x(x):
        return pp + Fp @ (x - pr)
    # chest on the pelvis at the waist
    waist_r = REST["waist"]
    waist_p = pelvis_x(waist_r)
    Fc = Fp @ euler(*P.get("spine", (0, 0, 0)))
    F["chest"] = (waist_r, I, waist_p, Fc)

    def chest_x(x):
        return waist_p + Fc @ (x - waist_r)
    nr = REST["neck"]
    Fh = Fc @ euler(*P.get("head", (0, 0, 0)))
    F["head"] = (nr, I, chest_x(nr), Fh)
    J["head"] = chest_x(nr) + Fh @ (REST["head"] - nr)
    hip_yaw = P.get("hips", (0, 0, 0))[1]
    for n, s in SIDES:
        # leg
        hp_r, kn_r, an_r, to_r = (REST[k + n] for k in ("hip", "knee", "ankle", "toe"))
        hp = pelvis_x(hp_r)
        target = v(*P["ankle" + n]) if "ankle" + n in P else an_r + v(*P.get("root", (0, 0, 0))) * v(1, 0, 1)
        pole = v(*P["knee" + n]) if "knee" + n in P else knee_pole(s, hip_yaw)
        kn, an = two_bone(hp, target, LEN["thigh" + n], LEN["shin" + n], pole)
        rest_pole = knee_pole(s)
        F["thigh" + n] = (hp_r, limb_frame(hp_r, kn_r, rest_pole), hp, limb_frame(hp, kn, pole))
        F["shin" + n] = (kn_r, limb_frame(kn_r, an_r, rest_pole), kn, limb_frame(kn, an, pole))
        fp, fy = P.get("foot" + n, (0, 0))
        to = foot_toe(an, s, fp, hip_yaw + fy, to_r - an_r)
        up = v(0, 1, 0)
        F["foot" + n] = (an_r, limb_frame(an_r, to_r, up), an, limb_frame(an, to, up))
        J.update({"hip" + n: hp, "knee" + n: kn, "ankle" + n: an, "toe" + n: to})
        # arm
        sh_r, el_r, wr_r = (REST[k + n] for k in ("shoulder", "elbow", "wrist"))
        sh = chest_x(sh_r)
        if "wrist" + n + "_abs" in P:
            wt = v(*P["wrist" + n + "_abs"])
        else:
            wt = chest_x(wr_r + v(*P.get("wrist" + n, (0, 0, 0))))
        ep = Fc @ (v(*P["elbow" + n]) if "elbow" + n in P else elbow_pole(s))
        el, wr = two_bone(sh, wt, LEN["uarm" + n], LEN["farm" + n], ep)
        rp = elbow_pole(s)
        F["uarm" + n] = (sh_r, limb_frame(sh_r, el_r, rp), sh, limb_frame(sh, el, ep))
        F["farm" + n] = (el_r, limb_frame(el_r, wr_r, rp), el, limb_frame(el, wr, ep))
        J.update({"shoulder" + n: sh, "elbow" + n: el, "wrist" + n: wr})
    J["pelvis"] = pp
    return F, J


# ================================================================ the sculpt, on bones

class RigSculpt:
    def __init__(self):
        self.pieces, self.cuts, self.inlays = [], [], []

    def add(self, bone, fn, mat=SKIN, bias=0.0):
        self.pieces.append((bone, fn, mat, bias))

    def carve(self, bone, fn):
        self.cuts.append((bone, fn))

    def inlay(self, bone, fn, mat, uses_body=False):
        self.inlays.append((bone, fn, mat, uses_body))

    def wound(self, bone, c, r, mat=BLOOD, depth=0.008):
        self.carve(bone, lambda p, c=c, r=r: sd_ellipsoid(p, c, r))
        self.inlay(bone, lambda p, du, c=c, r=r: np.maximum(
            sd_ellipsoid(p, c, r * 1.15), np.abs(du) - 0.0025 - 0.003 * noise3(p, 140, 5)),
            GORE, uses_body=True)
        self.inlay(bone, lambda p, du, c=c, r=r: np.maximum(sd_ellipsoid(p, c, r), du + depth),
                   mat, uses_body=True)

    def field(self, frames):
        pieces, cuts, inlays = self.pieces, self.cuts, self.inlays
        M = {b: (orr, Fr, op, Fp @ Fr.T) for b, (orr, Fr, op, Fp) in frames.items()}

        def to_rest(p, b):
            orr, Fr, op, T = M[b]
            return (p - op) @ T + orr

        def f(p):
            q = {b: to_rest(p, b) for b in M}
            ds = np.stack([fn(q[b]) for b, fn, _, _ in pieces])
            bias = np.array([x for _, _, _, x in pieces])[:, None]
            mats = np.array([m for _, _, m, _ in pieces])
            d = ds[0]
            for k in range(1, len(ds)):
                d = smin(d, ds[k], 0.012)
            mat = mats[np.argmin(ds + bias, axis=0)]
            du = d
            for b, cut in cuts:
                d = -smin(-d, cut(q[b]), 0.006)
            for b, fn, m, body in inlays:
                e = fn(q[b], du) if body else fn(q[b])
                mat = np.where(e < d + 0.0005, m, mat)
                d = np.minimum(d, e)
            return d, mat
        return f


RIBCAGE = Z5.RIBCAGE
on_ribcage = Z5.on_ribcage


def build():
    """Clay 5, re-cut onto bones, with the shoulders, elbows, knees and ankles re-sculpted."""
    S = RigSculpt()
    R = REST
    hx, hy, hz = R["head"]
    # ------------------------------------------------ torso (chest bone)
    S.add("chest", lambda p: sd_ellipsoid(p, *RIBCAGE))
    S.add("chest", lambda p: sd_ellipsoid(p, v(0, 1.075, -0.02), v(0.13, 0.10, 0.072)))
    S.carve("chest", lambda p: sd_ellipsoid(p, v(0, 1.07, 0.085), v(0.075, 0.05, 0.03)))
    S.add("chest", lambda p: sd_ellipsoid(p, v(0, 1.465, -0.02), v(0.20, 0.09, 0.095)))
    S.add("chest", lambda p: sd_cone(p, v(0, 1.36, -0.01), v(0, 1.52, 0.03), 0.065, 0.06))
    for s in (-1, 1):   # shoulder blades under the back skin
        S.add("chest", lambda p, s=s: sd_ellipsoid(p, v(0.1 * s, 1.33, -0.075), v(0.075, 0.09, 0.03)))
    for k in range(4):
        y0 = 1.33 - 0.046 * k
        for s in (-1, 1):
            pts = [on_ribcage(s * x, y0 - 1.0 * (x - 0.03) ** 2 - 0.08 * (x - 0.03), 0.002)
                   for x in np.linspace(0.03, 0.155 - 0.008 * k, 5)]
            S.add("chest", strip(pts, 0.016, 0.011), RIB)
            gro = [on_ribcage(s * x, y0 - 0.023 - 1.0 * (x - 0.03) ** 2 - 0.08 * (x - 0.03), 0.0)
                   for x in np.linspace(0.04, 0.15 - 0.008 * k, 4)]
            S.carve("chest", strip(gro, 0.011, 0.008))
    for n, s in SIDES:
        sh, el, wr = R["shoulder" + n], R["elbow" + n], R["wrist" + n]
        hp, kn, an, to = R["hip" + n], R["knee" + n], R["ankle" + n], R["toe" + n]
        ua, fa = "uarm" + n, "farm" + n
        # collarbone runs out to the point of the shoulder (acromion) on the chest
        acro = sh + v(-0.025 * s, 0.045, 0.01)
        S.add("chest", lambda p, a=v(0.03 * s, 1.40, 0.06), b=acro: sd_cone(p, a, b, 0.022, 0.026), RIB)
        S.add("chest", lambda p, c=acro: sd_ellipsoid(p, c, v(0.035, 0.022, 0.035)))
        S.add("chest", lambda p, a=v(0.105 * s, 1.30, 0.075), b=v(0.03 * s, 1.27, 0.1):
              sd_cone(p, a, b, 0.05, 0.035))
        S.add("chest", strip([v(0.05 * s, 1.60, -0.01), v(0.04 * s, 1.50, 0.04),
                              v(0.025 * s, 1.40, 0.075)], 0.017, 0.014))
        # shoulder: a deltoid that caps the top of the arm bone and tapers down its side
        ax = norm(el - sh)
        fr = limb_frame(sh, el, v(0, 0, 1.0))
        S.add(ua, lambda p, c=sh + ax * 0.045 + v(0.008 * s, 0.0, 0.0), fr=fr:
              sd_ellipsoid(p, c, v(0.066, 0.085, 0.064), fr))
        S.add(ua, lambda p, a=sh + ax * 0.08, b=sh + ax * 0.16 + v(0.012 * s, 0, 0):
              sd_cone(p, a, b, 0.05, 0.03))                                  # deltoid tip
        S.add(ua, lambda p, a=sh, b=el: sd_cone(p, a, b, 0.052, 0.04))       # humerus + flesh
        S.add(ua, lambda p, c=sh + (el - sh) * 0.48 + v(0.0, 0, 0.03):
              sd_ellipsoid(p, c, v(0.04, 0.08, 0.034)))                       # biceps
        S.add(ua, lambda p, c=sh + (el - sh) * 0.42 + v(0.012 * s, 0, -0.025):
              sd_ellipsoid(p, c, v(0.04, 0.09, 0.038)))                       # triceps
        S.add(ua, lambda p, c=el + v(0.008 * s, 0.01, 0.0): sd_ellipsoid(p, c, v(0.047, 0.03, 0.035)))
        # elbow: the bony point (olecranon) behind, a crease in front
        fd = norm(wr - el)
        S.add(fa, lambda p, c=el + v(0.006 * s, -0.012, -0.036): sd_sphere(p, c, 0.034))
        S.add(fa, lambda p, a=el, b=wr: sd_cone(p, a, b, 0.045, 0.034))
        S.add(fa, lambda p, c=el + (wr - el) * 0.3 + v(0.01 * s, 0, 0.015):
              sd_ellipsoid(p, c, v(0.045, 0.075, 0.042)))                     # forearm muscle
        S.add(fa, lambda p, c=wr - fd * 0.005: sd_ellipsoid(p, c, v(0.035, 0.02, 0.026)))  # wrist knob
        hand(S, fa, wr, s)
        # leg: thigh, knee (kneecap + condyles), shin, ankle bones
        kd = norm(an - kn)
        S.add("thigh" + n, lambda p, a=hp, b=kn: sd_cone(p, a, b, 0.085, 0.055))
        S.add("thigh" + n, lambda p, c=kn + v(0, 0.012, 0.0): sd_ellipsoid(p, c, v(0.058, 0.04, 0.05)))
        S.add("shin" + n, lambda p, c=kn + v(0.004 * s, -0.004, 0.072): sd_ellipsoid(p, c, v(0.032, 0.038, 0.028)))
        S.add("shin" + n, lambda p, a=kn + kd * 0.02, b=an: sd_cone(p, a, b, 0.05, 0.034))
        S.add("shin" + n, lambda p, c=kn + (an - kn) * 0.3 + v(0.012 * s, 0, -0.022):
              sd_ellipsoid(p, c, v(0.045, 0.09, 0.045)))                      # calf
        S.add("shin" + n, lambda p, a=kn + kd * 0.1 + v(0, 0, 0.035), b=an + v(0, 0.06, 0.03):
              sd_cone(p, a, b, 0.016, 0.012))                                # shinbone ridge
        for side in (-1, 1):
            S.add("shin" + n, lambda p, c=an + v(0.03 * side, 0.004, 0.0): sd_sphere(p, c, 0.022))
        foot(S, "foot" + n, an, to, s)
        # trousers: a thigh part and a lower part that ends in the torn hem; the knee pokes
        # through a hole
        S.add("thigh" + n, lambda p, a=hp + v(0.015 * s, 0.04, 0), b=kn, s=s:
              sd_cone(p, a, b, 0.112, 0.094) - 0.009 * np.sin(np.arctan2(p[:, 2], p[:, 0] * s) * 5 +
                                                         p[:, 1] * 9 + 2.5 * noise3(p, 9, 2)) ** 2,
              TROUSER, -0.004)
        S.add("shin" + n, lambda p, a=kn, b=kn + (an - kn) * 0.42, side=s:
              np.maximum(sd_cone(p, a, b, 0.094, 0.082) - 0.008 * np.sin(p[:, 0] * 60 + p[:, 2] * 30) ** 2,
                         0.36 + 0.06 * np.abs(np.sin((p[:, 0] * 30 + p[:, 2] * 28) * side)) +
                         0.04 * noise3(p, 25, 7) - p[:, 1]), TROUSER, -0.004)
        S.carve("shin" + n, lambda p, c=kn + v(0.01 * s, -0.01, 0.1): sd_ellipsoid(p, c, v(0.035, 0.045, 0.05)))
    # ------------------------------------------------ head
    S.add("head", lambda p: sd_ellipsoid(p, v(hx, hy + 0.01, hz - 0.035), v(0.108, 0.118, 0.112)))
    S.add("head", lambda p: sd_ellipsoid(p, v(hx, hy - 0.06, hz + 0.02), v(0.098, 0.09, 0.085)))
    S.add("head", lambda p: sd_ellipsoid(p, v(hx, hy - 0.135, hz + 0.02), v(0.082, 0.05, 0.075)))
    for s in (-1, 1):
        S.add("head", lambda p, s=s: sd_ellipsoid(p, v(hx + 0.042 * s, hy - 0.002, hz + 0.075),
                                                  v(0.04, 0.018, 0.025)))
        S.add("head", lambda p, c=v(hx + 0.062 * s, hy - 0.07, hz + 0.045): sd_sphere(p, c, 0.036))
        S.add("head", lambda p, c=v(hx + 0.113 * s, hy - 0.03, hz - 0.03):
              sd_ellipsoid(p, c, v(0.016, 0.032, 0.022)))
        S.carve("head", lambda p, s=s: sd_ellipsoid(p, v(hx + 0.044 * s, hy - 0.035, hz + 0.1),
                                                     v(0.032, 0.026, 0.035)))
        S.inlay("head", lambda p, s=s: sd_sphere(p, v(hx + 0.043 * s, hy - 0.04, hz + 0.066), 0.016), EYE)
        S.carve("head", lambda p, s=s: sd_sphere(p, v(hx + 0.13 * s, hy - 0.01, hz + 0.03), 0.04))
        S.carve("head", lambda p, s=s: sd_sphere(p, v(hx + 0.085 * s, hy - 0.115, hz + 0.075), 0.03))
    S.carve("head", lambda p: sd_ellipsoid(p, v(hx, hy - 0.083, hz + 0.1), v(0.02, 0.024, 0.035)))
    S.carve("head", lambda p: sd_ellipsoid(p, v(hx, hy - 0.132, hz + 0.085), v(0.056, 0.032, 0.06)))
    S.inlay("head", lambda p: sd_sphere(p, v(hx, hy - 0.132, hz + 0.03), 0.045), MOUTH)
    for k in range(7):
        x = hx - 0.042 + k * 0.014
        S.inlay("head", lambda p, c=v(x, hy - 0.112 - 0.004 * (k % 2), hz + 0.072 - 0.004 * abs(k - 3)):
                sd_sphere(p, c, 0.0095 - 0.001 * (k % 3)), TEETH)
        S.inlay("head", lambda p, c=v(x + 0.006, hy - 0.152 + 0.005 * (k % 2), hz + 0.068 - 0.004 * abs(k - 3)):
                sd_sphere(p, c, 0.0088 - 0.001 * (k % 2)), TEETH)
    for s in (-1, 1):
        for k in range(2):
            top = v(hx + (0.09 + 0.012 * k) * s, hy + 0.07 - 0.03 * k, hz - 0.01 - 0.05 * k)
            bot = v(hx + (0.124 + 0.01 * k) * s, hy - 0.10 - 0.04 * k, hz - 0.02 - 0.05 * k)
            S.inlay("head", lambda p, a=top, b=bot: sd_cone(p, a, b, 0.009, 0.006), HAIR)
    S.wound("head", v(hx - 0.045, hy + 0.115, hz + 0.02), v(0.016, 0.045, 0.035))
    # ------------------------------------------------ clothing
    S.add("chest", Z5.shoulder_cloth, CLOTH, -0.005)
    S.add("pelvis", lambda p: sd_ellipsoid(p, v(0, 0.93, 0.0), v(0.205, 0.13, 0.13)), TROUSER, -0.002)
    S.add("pelvis", Z5.rope_belt, ROPE, -0.008)
    S.add("pelvis", Z5.front_flap, CLOTH, -0.008)
    # ------------------------------------------------ wounds and rot
    S.wound("chest", v(-0.085, 1.12, 0.10), v(0.032, 0.045, 0.04))
    S.wound("chest", v(-0.03, 1.02, 0.095), v(0.03, 0.03, 0.03))
    S.wound("farmR", v(-0.375, 1.04, 0.08), v(0.02, 0.04, 0.035))
    S.wound("farmL", v(0.355, 1.10, 0.07), v(0.02, 0.035, 0.035))
    S.wound("uarmR", v(-0.33, 1.25, 0.06), v(0.022, 0.03, 0.03))
    S.wound("shinR", v(-0.205, 0.30, 0.065), v(0.02, 0.04, 0.035))
    S.wound("shinL", v(0.19, 0.42, 0.10), v(0.022, 0.032, 0.035))
    S.wound("chest", v(0.10, 1.30, 0.12), v(0.014, 0.035, 0.025))
    S.wound("shinL", v(0.21, 0.24, 0.05), v(0.02, 0.03, 0.03))
    for bone, c, r in (("uarmR", v(-0.265, 1.41, 0.05), 0.03), ("uarmR", v(-0.295, 1.37, 0.04), 0.026),
                       ("uarmR", v(-0.25, 1.355, 0.065), 0.022), ("uarmR", v(-0.31, 1.42, 0.0), 0.022),
                       ("farmL", v(0.355, 1.0, 0.065), 0.022), ("farmL", v(0.33, 0.97, 0.07), 0.016),
                       ("chest", v(-0.05, 1.07, 0.105), 0.02), ("chest", v(0.15, 1.15, 0.09), 0.016)):
        S.add(bone, lambda p, c=c, r=r: sd_sphere(p, c, r), ROT, -0.004)
    return S


def hand(S, bone, wr, s):
    palm = wr + v(0.008 * s, -0.07, 0.016)
    S.add(bone, lambda p, c=palm: sd_ellipsoid(p, c, v(0.066, 0.07, 0.04)))
    for k in range(4):
        z = 0.06 - 0.04 * k
        k1 = palm + v((0.035 - 0.016 * k) * s, -0.05, z)
        k2 = k1 + v((0.02 - 0.012 * k) * s, -0.075, 0.035)
        k3 = k2 + v(-0.006 * s, -0.05, -0.035)
        S.add(bone, lambda p, c=k1: sd_sphere(p, c, 0.02))                   # knuckle
        S.add(bone, lambda p, a=k1, b=k2: sd_cone(p, a, b, 0.018, 0.015))
        S.add(bone, lambda p, a=k2, b=k3: sd_cone(p, a, b, 0.015, 0.008), NAIL)
        if k < 3:
            g = palm + v((0.028 - 0.016 * k) * s, -0.085, z - 0.02)
            S.carve(bone, lambda p, a=g, b=g + v(0.012 * s, -0.07, 0.035): sd_cone(p, a, b, 0.011, 0.01))
    t1 = palm + v(-0.036 * s, -0.01, 0.04)
    S.add(bone, lambda p, a=t1, b=t1 + v(-0.01 * s, -0.07, 0.025): sd_cone(p, a, b, 0.018, 0.011))


def foot(S, bone, an, to, s):
    sole = an + v(0.022 * s, -0.07, 0.075)
    S.add(bone, lambda p, c=sole: sd_ellipsoid(p, c, v(0.082, 0.04, 0.12)), GRIME)
    S.add(bone, lambda p, c=an + v(0.0, -0.07, -0.045): sd_ellipsoid(p, c, v(0.042, 0.04, 0.045)), GRIME)  # heel
    for k in range(5):
        tp = to + v(0.028 * (k - 1.4) * s, 0.002, 0.012 - 0.008 * abs(k - 1))
        S.add(bone, lambda p, c=tp, r=0.025 - 0.0025 * k: sd_ellipsoid(p, c, v(r, r * 0.9, r * 1.3)), GRIME)
        if k < 4:
            g = to + v(0.028 * (k - 0.9) * s, 0.0, 0.03)
            S.carve(bone, lambda p, a=g, b=g + v(0, 0.025, -0.05): sd_cone(p, a, b, 0.009, 0.008))


SCULPT = None


def field(pose=None):
    global SCULPT
    if SCULPT is None:
        SCULPT = build()
    frames, joints = solve(pose)
    return SCULPT.field(frames), joints
