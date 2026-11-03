"""One-handed sword moves from the user's video (F:\\!  BELLMOURN\\! @ MOCAP\\1 HANDED SWORD IN RIGHT
HAND AND INVISIBLE OR PRETEND SHIELD ON LEFT HAND+ARM.mp4, over the right shoulder, 30 fps), swung by
the rules settled for the two-handers (mocap2h.py):

- each cut runs along a line through the crosshair, in the plane through the eye and that line, so
  the fist, the blade and its edges lie on the line on screen (the user's "option A");
- the fist leads and the blade trails, and the tip lands on the crosshair at the hit;
- fist and sword roll together (never the sword in the grip), the edges facing along the line, a
  little off edge-on so the flat shows;
- a thrust draws back to the right hip and drives straight down the crosshair's ray.

One-handers are drawn shrunk (view 0.58, anchored at the bottom middle), so the ray that lands on
the crosshair is lifted (fp_rig.crosshair_ray): every key here is laid out in that lifted frame.
The clips are never slid sideways (`noslide`): the slide would push the tip off the crosshair.

Keys per move: (name, video frame, u along the line from the crosshair (+ toward where the swing
starts), depth along the crosshair's ray, blade angle phi in the swing's plane: 0 = at the target,
+ = back up the line, 180 = behind). A thrust gives the fist in the lifted frame (right, ahead, up).
"""
import math

import numpy as np

import fp_rig as _R
import mocap2h as M2

un = M2.un
VIEW = _R.REST_SCALE
TIP = _R.PROXY["sword1h"]["tip"]
_R.set_view(VIEW)
F = _R.crosshair_ray()                         # rig space (x, up, ahead)
FWD = np.array([F[0], F[2], F[1]])            # eye space (x right, ahead, up)
UP = un(np.cross(np.array([1.0, 0.0, 0.0]), FWD))
RIGHT = np.array([1.0, 0.0, 0.0])
_R.set_view(_R.REST_SCALE)


def line_dir(alpha):
    a = math.radians(alpha)
    return math.cos(a) * RIGHT + math.sin(a) * UP


def plane_normal(alpha):
    return un(np.cross(line_dir(alpha), FWD))


def _dir_key(name, ref, g, d, **kw):
    d = un(d)
    yaw, pitch = math.degrees(math.atan2(d[0], d[1])), math.degrees(math.asin(max(-1.0, min(1.0, d[2]))))
    return dict(name=name, ref=ref, Gc=[round(float(v), 4) for v in g], dir=[round(yaw, 2), round(pitch, 2)], **kw)


def pk(name, ref, alpha, u, depth, phi, **kw):
    L = line_dir(alpha)
    p = math.radians(phi)
    return _dir_key(name, ref, u * L + depth * FWD, math.cos(p) * FWD + math.sin(p) * L, **kw)


def fk(name, ref, right, ahead, up, aim=1.5, **kw):
    """A fist in the lifted frame, the blade aimed at the target on the crosshair's ray."""
    g = right * RIGHT + ahead * FWD + up * UP
    return _dir_key(name, ref, g, FWD * aim - g, **kw)


def _guard():
    """The one-hander's carry (moves.SWORD: S=at(0.80, 0.90, 0.40), ang 86, dz 0.05, as the rig poses
    it) in eye space. (moves.at, copied: moves imports this module.)"""
    W, H, stretch = _R.SCREEN_W, _R.SCREEN_H, 1.3
    xf = 0.5 + (0.80 - 0.5) / stretch
    sword = dict(S=(W / 2 + (xf * W - W / 2) / _R.REST_SCALE, H - (H - 0.90 * H) / _R.REST_SCALE, 0.40), ang=86, dz=0.05)
    _R.set_view(_R.REST_SCALE)
    a = next(x for x in _R.pose_frame(dict(R=dict(sword, weapon="sword1h"))) if x["side"] == "R")
    g, d = a["G"], a["D"]
    return _dir_key("GUARD", 0, np.array([g[0], g[2], g[1]]), np.array([d[0], d[2], d[1]]))


# the cuts: (line, video frames for wind / lag / hit / follow / off), all through the crosshair
# the shoulder the other one-handed and shield moves hang from (fp_rig.SHOULDER, unshrugged): lower
# than the two-hander's, so a one-handed arm sweeps past further from the lens
SHO = (0.20, -0.04, -0.30)
CUT = dict(wind=(0.30, 0.32, 100), lag=(0.12, 0.42, 60), hit=(-0.30, 0.38, 6),     # (the fist well down the line at
           follow=(-0.36, 0.36, -10), off=(-0.40, 0.35, -20))                        # the hit: the blade trails back up it)
SWINGS = {
    "d1": (37.0, (238, 242, 246, 249, 252), {}),          # high right to low left
    "d2": (143.0, (809, 812, 815, 818, 822),              # high left to low right (a shorter windup:
           dict(wind=(0.20, 0.42, 100), lag=(0.08, 0.46, 60))),   # the right arm reaches across the face)
    "over": (90.0, (587, 593, 598, 601, 604),             # straight down, from over the head
             dict(wind=(0.30, 0.30, 150), hit=(-0.26, 0.40, 6), follow=(-0.30, 0.38, -10), off=(-0.33, 0.38, -16))),
    "rise1": (-25.0, (492, 497, 500, 503, 506),           # low right, up to high left (shallow: the arm
              dict(wind=(0.30, 0.40, 100), lag=(0.12, 0.44, 60), hit=(-0.18, 0.42, 6),   # stays out of the face)
                   follow=(-0.22, 0.42, -10), off=(-0.24, 0.41, -20))),
    "rise2": (-155.0, (836, 841, 844, 847, 850),          # low left, up to high right
              dict(wind=(0.30, 0.40, 100), lag=(0.12, 0.44, 60), hit=(-0.18, 0.42, 6),
                   follow=(-0.22, 0.42, -10), off=(-0.24, 0.41, -20))),
    "flat1": (10.0, (439, 444, 447, 450, 453),            # right to left across
              dict(wind=(0.30, 0.38, 80), lag=(0.12, 0.44, 45), hit=(-0.30, 0.40, 6), follow=(-0.36, 0.38, -25), off=(-0.40, 0.37, -38))),
    "flat2": (170.0, (1105, 1110, 1113, 1116, 1119),      # left to right, back again
              dict(wind=(0.22, 0.42, 80), lag=(0.08, 0.46, 45), hit=(-0.30, 0.40, 6), follow=(-0.36, 0.38, -25), off=(-0.40, 0.37, -38))),
}


def _keys():
    K = {"guard": [_guard()]}
    for name, (alpha, refs, over) in SWINGS.items():
        p = dict(CUT, **over)
        r = iter(refs)
        K[name] = [dict(K["guard"][0], ref=refs[0] - 4)] + [
            pk(n, next(r), alpha, *p[n.lower()], **({"hit": True} if n == "HIT" else {}))
            for n in ("WIND", "LAG", "HIT", "FOLLOW", "OFF")]
    # the thrust: draw back to the right hip, blade lined up on the crosshair, drive straight in
    K["stab"] = [dict(K["guard"][0], ref=257),
                 fk("DRAW", 265, 0.20, 0.20, -0.20),
                 fk("CHAMBER", 273, 0.17, 0.22, -0.12),
                 fk("THRUST", 281, 0.09, 0.40, -0.16),          # (the fist stays low and right of the
                 fk("HIT", 286, 0.06, 0.50, -0.17, hit=True),   # crosshair, so the blade shows driving in)
                 fk("RECOVER", 292, 0.12, 0.34, -0.14)]
    return K


KEYS = _keys()


def _seq(move, plan):
    out = []
    for nm, dt, fl in plan:
        f = dict(dt=dt) if dt else {}
        if fl:
            f[fl] = True
        out.append(("guard" if (nm == "GUARD" and out) else move, nm, 0, f))
    return out


_CUT_PLAN = [("GUARD", 2, None), ("WIND", 2, "enter"), ("LAG", 2, None), ("HIT", 2, "hit"),
             ("FOLLOW", 2, None), ("OFF", 3, "link"), ("GUARD", 0, None)]
PLANS = {name: _seq(name, _CUT_PLAN) for name in SWINGS}
PLANS["over"] = _seq("over", [("GUARD", 2, None), ("WIND", 3, "enter"), ("LAG", 2, None), ("HIT", 2, "hit"),
                              ("FOLLOW", 2, None), ("OFF", 3, "link"), ("GUARD", 0, None)])
PLANS["stab"] = _seq("stab", [("GUARD", 2, None), ("DRAW", 2, None), ("CHAMBER", 2, "enter"), ("THRUST", 2, None),
                              ("HIT", 2, "hit"), ("HIT", 2, None), ("RECOVER", 3, "link"), ("GUARD", 0, None)])


def clips():
    out = {}
    for name, seq in PLANS.items():
        P = dict(keys=KEYS, half=0.0, one=True, tip=TIP, axis=FWD, view=VIEW, video="swing1h",
                 sho=SHO, shrug=0.0, lean=0.0)
        if name in SWINGS:
            out[name] = M2.keys_of(seq, edge=False, cross=True, line=plane_normal(SWINGS[name][0]), P=P)
        else:   # the thrust: tip on the crosshair at the hit, no edge roll
            out[name] = M2.keys_of(seq, edge=False, cross=True, P=dict(P, knuckle=False))
        for k in out[name]:
            k["noslide"] = True
    return out


# the combos on keys 1-6 (left click plays 1); blunt weapons (maces, hammers, clubs) bonk
# instead of stabbing
COMBOS = {
    1: ["d1", "d2", "over"],
    2: ["rise1", "rise2", "stab"],
    3: ["flat1", "flat2", "over"],
    4: ["stab", "d1", "d2"],
    5: ["over", "rise1", "flat1"],
    6: ["d2", "flat2", "stab", "over"],
}
BLUNT = {n: [("over" if c == "stab" else c) for c in chain] for n, chain in COMBOS.items()}
