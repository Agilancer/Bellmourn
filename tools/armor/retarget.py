"""A first-person gauntlet carried onto a villager's arm (numpy only).

The gauntlet is skinned to the arm rig's 19 bones (upper, elbow, fore, hand, three per finger
and thumb) in its own bind space (gauntlet_bind.py says which way is which). Each bone gets a
map from its frame onto the villager bone it becomes: along the bone it stretches to the
villager bone's length, across it to the villager limb's measured girth. A vertex moves by the
blend of its bones' maps, so pieces that bend at a joint (the cuff, the glove's wrist, the
knuckles) stay joined. The palm is an affine fit (wrist, the four knuckles, the thumb's root
and the back of the hand), so the fingers' maps start where the palm's ends.

Gauntlet R goes on the villager's right arm and L on the left: both keep their handedness.
"""
import numpy as np

FINGERS = ("index", "middle", "ring", "pinky")
VNAME = dict(index="Index", middle="Middle", ring="Ring", pinky="Pinky", thumb="Thumb")


def norm(v):
    v = np.asarray(v, float)
    return v / max(np.linalg.norm(v), 1e-12)


def orth(v, axis):
    return norm(v - axis * np.dot(v, axis))


def slerp_axis(b0, b1, axis, s):
    """b0 turned toward b1 about axis, by fraction s (both perpendicular to axis)."""
    c = np.cross(b0, b1)
    ang = np.arctan2(np.dot(c, axis), np.dot(b0, b1)) * s
    return b0 * np.cos(ang) + np.cross(axis, b0) * np.sin(ang)


class FrameMap:
    """Bone frame (origin, axis a, back b) onto another, stretching `along` the axis and
    `across` it; `across` and the target back may vary with the fraction t along the bone."""

    def __init__(self, so, sa, sb, to, ta, tb, along, across, length=1.0):
        self.so, self.sa = np.asarray(so, float), norm(sa)
        self.sb = orth(sb, self.sa)
        self.sc = np.cross(self.sa, self.sb)
        self.to, self.ta = np.asarray(to, float), norm(ta)
        self.tb = tb if callable(tb) else (lambda t, b=orth(tb, self.ta): b)
        self.along, self.across, self.length = along, across, length

    def __call__(self, P):
        d = P - self.so
        x, y, z = d @ self.sa, d @ self.sb, d @ self.sc
        t = np.clip(x / self.length, 0, 1)
        k = np.array([self.across(tt) if callable(self.across) else self.across for tt in t])
        tb = np.array([self.tb(tt) for tt in t])
        tc = np.cross(self.ta, tb)
        return (self.to + (x * self.along)[:, None] * self.ta + (y * k)[:, None] * tb +
                (z * k)[:, None] * tc)


class AffineMap:
    def __init__(self, src, dst):
        A = np.hstack([np.asarray(src, float), np.ones((len(src), 1))])
        self.M, *_ = np.linalg.lstsq(A, np.asarray(dst, float), rcond=None)

    def __call__(self, P):
        return np.hstack([P, np.ones((len(P), 1))]) @ self.M

    def linear(self, v):
        return np.asarray(v, float) @ self.M[:3]


def retarget(P, W, bind, side, vb, girth, gap=0.004):
    """P (n, 3) gauntlet vertices, W {gauntlet bone: (n,) weights}; bind: gauntlet_bind.json;
    side 'L'/'R'; vb: villager bone heads/tails {name: (head, tail)} plus 'tip:<Finger>' points
    and 'r:<finger>' radii; girth(bone, t) -> the villager limb's mean radius there.
    Returns (new positions, {villager bone: (n,) weights})."""
    g = bind[side]
    S = "." + side
    h = lambda n: np.asarray(vb[n + S][0], float)
    sback = np.asarray(g["back"], float)
    up = np.array([0.0, 0.0, 1.0])
    elbow_out = np.array([0.0, 1.0, 0.0])  # the point of the elbow, T-pose palm down

    shoulder, elbow, wrist = h("UpperArm"), h("LowerArm"), h("Wrist")
    ua, fa = norm(elbow - shoulder), norm(wrist - elbow)
    fr = {round(z, 4): (a + b) / 2 for z, a, b in bind["fore_radius"]}
    # how much fuller than the gauntlet's bare arm the villager's is, within reason (a sleeve's
    # cuff is not the arm)
    fuller = lambda r, g0: float(np.clip(r / g0, 0.85, 1.3))
    zs = np.array(sorted(fr))
    g_fore = lambda t: np.interp(-0.30 + 0.30 * t, zs, [fr[z] for z in zs])

    maps = {}
    maps["upper"] = FrameMap([0, -0.6, 0], [0, 1, 0], sback, shoulder, ua, orth(elbow_out, ua),
                             np.linalg.norm(elbow - shoulder) / 0.30,
                             lambda t: fuller(girth("UpperArm" + S, t) + gap, 0.045), 0.30)
    b_elbow, b_wrist = orth(elbow_out, fa), orth(up, fa)
    fore_twist = lambda t: slerp_axis(b_elbow, b_wrist, fa, t)
    maps["fore"] = FrameMap([0, -0.3, 0], [0, 1, 0], sback, elbow, fa, fore_twist,
                            np.linalg.norm(wrist - elbow) / 0.30,
                            lambda t: fuller(girth("LowerArm" + S, t) + gap, g_fore(t)), 0.30)
    mid = norm(ua + fa)
    maps["elbow"] = FrameMap([0, -0.3, 0], [0, 1, 0], sback, elbow, mid, orth(elbow_out, mid),
                             np.linalg.norm(wrist - elbow) / 0.30,
                             fuller(girth("LowerArm" + S, 0.0) + gap, g_fore(0.0)), 0.30)

    # the palm: wrist, the knuckles and the thumb's root, and a point off the back of the hand
    knuck = {f: h(VNAME[f] + "2") for f in FINGERS}
    src = [np.zeros(3)] + [g["fingers"][f]["joints"][0] for f in FINGERS] + [
        g["fingers"]["thumb"]["joints"][0]]
    dst = [wrist] + [knuck[f] for f in FINGERS] + [h("Thumb2")]
    hand_ax = norm(knuck["middle"] - wrist)
    # the back of the hand keeps the glove's own depth: the villager's hand is no thicker
    src.append(sback * 0.03)
    dst.append(wrist + orth(up, hand_ax) * 0.03)
    maps["hand"] = AffineMap(src, dst)

    for f in FINGERS + ("thumb",):
        gf = g["fingers"][f]
        J = [np.asarray(p, float) for p in gf["joints"]]
        V = VNAME[f]
        third = h(V + "4") if f != "thumb" else np.asarray(vb["Thumb3" + S + "_end"][0], float)
        Q = [h(V + "2"), h(V + "3"), third, np.asarray(vb["tip:" + V + S], float)]
        r_g = gf["width"] / 2
        k = vb["r:" + V + S] / r_g
        for s in range(3):
            ta = norm(Q[s + 1] - Q[s])
            if f == "thumb":
                tb = orth(maps["hand"].linear(gf["back"][0]), ta)
            else:
                tb = orth(up, ta)
            maps[f"{f}{s + 1}"] = FrameMap(
                J[s], J[s + 1] - J[s], gf["back"][s], Q[s], ta, tb,
                np.linalg.norm(Q[s + 1] - Q[s]) / np.linalg.norm(J[s + 1] - J[s]), k,
                np.linalg.norm(J[s + 1] - J[s]))

    out = np.zeros_like(P)
    tot = np.zeros(len(P))
    for b, w in W.items():
        sel = w > 1e-5
        if not sel.any():
            continue
        out[sel] += maps[b](P[sel]) * w[sel, None]
        tot[sel] += w[sel]
    out /= np.maximum(tot, 1e-9)[:, None]

    # the villager's bones: fingers k -> the villager's k+1 (its first is the palm's), the
    # couter's helper splits between upper and forearm, the thumb's tip rides its last bone
    VW = {}

    def put(name, w):
        VW[name] = VW.get(name, 0) + w
    for b, w in W.items():
        if b == "upper":
            put("UpperArm" + S, w)
        elif b == "elbow":
            put("UpperArm" + S, w * 0.5)
            put("LowerArm" + S, w * 0.5)
        elif b == "fore":
            put("LowerArm" + S, w)
        elif b == "hand":
            put("Wrist" + S, w)
        else:
            f, s = b[:-1], int(b[-1])
            n = min(s + 1, 3) if f == "thumb" else s + 1
            put(f"{VNAME[f]}{n}{S}", w)
    return out, VW
