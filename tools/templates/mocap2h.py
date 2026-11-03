"""Two-handed sword moves from the user's own swing video
(F:\\!  BELLMOURN\\! @ MOCAP\\2 HAND SWORD SWINGING.mp4, filmed over the shoulder, 30 fps),
swung the Dark Messiah of Might and Magic way: no body, the arms hang from shoulders fixed to the
camera (left and right, just behind and under the eye), so a windup goes up beside or over the
head, the forearms sweep across close in front of the eye, every blow goes through the crosshair
(where the mouse points), and the edge leads every cut (not the stab).

mocap2h_keys.json, per key: the grip (middle of the two fists) as G = [screen x, screen y,
depth m] in the game camera (90 degrees across at 16:10, crosshair centred; y > 1 is under the
screen) or Gc = [right, ahead, up] metres from the eye (for grips over or behind the head); the
blade as "tip" = an aim point [screen x, screen y, depth] or "dir" = [yaw, pitch] degrees (yaw 0
ahead, + right; pitch + up); dt = video frames to the next key (default the video's own spacing,
2-9).

clips() turns them into one rig key per tic (1/35 s): the grip is a Catmull-Rom through the keys,
the blade a slerp, both handed to the rig in 3D (G3 / D3) with the shoulders moved to the camera
(shrug / lean) so the game's own IK and exporter pose the arms; `edge` turns the blade so it cuts
edge first, by how fast it is travelling.
"""
import json
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
KEYS = json.load(open(os.path.join(HERE, "mocap2h_keys.json")))

FOCAL, CX, CY = 192.0, 192.0, 120.0     # fp_rig: 384 x 240, 90 degrees across
VIEW = 1.0                              # drawn unshrunk: the world camera's own view
ZOOM = 1.0                              # ...then zoomed out about the centre (viewmodel FOV), so arms
                                        # swinging past the eye read smaller (viewmodel.js)
FPS, TIC_HZ = 30.0, 35.0
# the camera-fixed body (eye at 0; x right, y ahead, z up): shoulders 0.20 out, 0.15 behind and
# 0.15 under the eye. fp_rig's shoulder is (0.20, -0.30 up, -0.04 ahead): shrug and lean move it.
SHO = np.array([0.20, -0.15, -0.15])
SHRUG, LEAN = 0.15, -0.11
UP, FO, HAND = 0.30, 0.30, 0.06         # fp_rig's arm (a little larger than life)
HALF = 0.055                            # each fist from the middle of the grip (GRIP_2H 0.11)
SWEET = 0.7                             # where on the blade (m from the grip) the cut is measured
EDGE_V0, EDGE_V1 = 0.008, 0.035         # blade speed (m per tic) where the edge starts / fully leads

un = lambda v: v / np.linalg.norm(v)


def world(sx, sy, y):
    """A point on the game camera's screen at depth y -> eye space."""
    return np.array([(2 * sx - 1) * y, y, (1 - 2 * sy) * y / 1.6])


def blade_dir(k, g):
    if "dir" in k:
        yw, pt = map(math.radians, k["dir"])
        return np.array([math.sin(yw) * math.cos(pt), math.cos(yw) * math.cos(pt), math.sin(pt)])
    return un(world(*k["tip"]) - g)


def grip(k):
    return world(*k["G"]) if "G" in k else np.array(k["Gc"], float)


def _reach(g, d):
    """Pull a grip the fixed shoulders cannot reach back to where both fists can hold it."""
    for _ in range(4):
        hs = []
        for sg in (1, -1):
            s = SHO * np.array([sg, 1, 1])
            h = g + d * HALF * sg
            hv = h - s
            hv = un(hv - hv.dot(d) * d)
            w = h - hv * HAND
            if np.linalg.norm(w - s) > UP + FO - 0.004:
                w = s + un(w - s) * (UP + FO - 0.004)
            hs.append(w + hv * HAND)
        g2 = (hs[0] + hs[1]) / 2
        if np.linalg.norm(g2 - g) < 0.003:
            break
        g = g2
    return g


def _slerp(a, b, t):
    w = math.acos(float(np.clip(a.dot(b), -1, 1)))
    return a if w < 1e-4 else (math.sin((1 - t) * w) * a + math.sin(t * w) * b) / math.sin(w)


rig = lambda v: np.array([v[0], v[2], v[1]])     # eye space (x, ahead, up) -> rig (x, up, ahead)


def rig_key(g, d):
    """Grip middle + blade (eye space) -> fp_rig key: the right fist (by the guard) and the
    blade in 3D, from the camera-fixed shoulders."""
    return dict(G3=tuple(rig(g + d * HALF)), D3=tuple(rig(d)), shrug=SHRUG, lean=LEAN)


def _tip_on_crosshair(g):
    """The blade from grip middle g whose tip lies on the crosshair's line (eye-space y axis)."""
    L = HALF + TIP_AT
    y = g[1] + math.sqrt(max(L * L - g[0] ** 2 - g[2] ** 2, 0.01))
    return un(np.array([0.0, y, 0.0]) - g)


def keys_of(seq, edge=True, cross=False, line=None):
    """seq: [(move, key name, nth, flags), ...] -> one rig key per tic. cross: the slash rule:
    on the hit the blade's tip is on the crosshair, and through the swing the fist rolls so the
    blade's edges face the crosshair."""
    ks = []
    for move, name, nth, flags in seq:
        ks.append(([x for x in KEYS[move] if x["name"] == name][nth], flags))
    G, D = [], []
    for k, fl in ks:
        g = grip(k)
        d = blade_dir(k, g)
        g = _reach(g, d)
        if "tip" in k:              # aimed blades stay aimed from where the fists really are
            d = un(world(*k["tip"]) - g)
        if cross and fl.get("hit"):
            for _ in range(3):      # the tip goes through the crosshair from where the fists are
                d = _tip_on_crosshair(g)
                g = _reach(grip(k), d)
            d = _tip_on_crosshair(g)
        G.append(g)
        D.append(d)
    samples = []                    # (g, d, key, flags, first tic of its key?)
    TW = []                         # the torso's twist per tic (a key's "twist", degrees, eased between keys)
    for i, (k, flags) in enumerate(ks):
        if i == len(ks) - 1:
            samples.append((G[i], D[i], k, flags, True))
            TW.append(float(k.get("twist", 0.0)))
            break
        nk = ks[i + 1][0]
        dt = flags.get("dt", nk.get("dt", min(9, max(2, abs(nk["ref"] - k["ref"])))))
        n = max(1, round(dt * TIC_HZ / FPS))
        for j in range(n):
            u = j / n
            TW.append(k.get("twist", 0.0) * (1 - _ease(u)) + nk.get("twist", 0.0) * _ease(u))
            g4 = [G[max(i - 1, 0)], G[i], G[i + 1], G[min(i + 2, len(ks) - 1)]]
            g = 0.5 * (2 * g4[1] + (-g4[0] + g4[2]) * u + (2 * g4[0] - 5 * g4[1] + 4 * g4[2] - g4[3]) * u * u
                       + (-g4[0] + 3 * g4[1] - 3 * g4[2] + g4[3]) * u ** 3)
            samples.append((_off_lens(g, radial=line is not None), un(_slerp(D[i], D[i + 1], u)), k, flags, j == 0))
    # the right elbow's pole (rig space): a key's "pole" (cross-body windups drop the elbow so
    # the upper arm passes under the eye), eased to the rig's default between keys
    P0 = np.array([1.0, -0.6, -0.1])
    kp = [np.array(k["pole"], float) if "pole" in k else P0 for k, _ in ks]
    poles, ki = [], -1
    for g, d, k, flags, first in samples:
        ki += first
        u = 0.0
        if not first:
            n_seg = sum(1 for s in samples if s[2] is k)
            u = (sum(1 for s in samples[:len(poles) + 1] if s[2] is k) - 1) / max(1, n_seg)
        a, b = kp[ki], kp[min(ki + 1, len(kp) - 1)]
        p = a * (1 - u) + b * u
        poles.append(None if np.allclose(p, P0) else p / np.linalg.norm(p))
    out = []
    pts = [g + d * SWEET for g, d, *_ in samples]
    for i, (g, d, k, flags, first) in enumerate(samples):
        key = dict(rig_key(g, d), tics=1, view=VIEW, name=k["name"] if first else f"{k['name']} >",
                   ref=f"swing2h@{k['ref']}")
        if poles[i] is not None:
            key["pole"] = tuple(poles[i])
        if abs(TW[i]) > 1e-3:      # the shoulders turn with the torso (fp_rig.shoulder)
            key["twist"] = float(TW[i])
        if edge:   # the edge leads: the blade's way of travel, as fast as it goes
            v = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
            speed = np.linalg.norm(v) / 2
            if speed > 1e-6:
                key["edge"] = tuple(rig(v / (2 * speed)))
                key["edge_w"] = float(np.clip((speed - EDGE_V0) / (EDGE_V1 - EDGE_V0), 0, 1))
        if first:
            key.update({f: True for f in ("hit", "enter", "link") if flags.get(f)})
            if cross and flags.get("hit"):
                key["tip_axis"] = True   # (the rig puts the tip on the crosshair after any slide)
        out.append(key)
    if cross:
        _edges_to_crosshair(samples, out, line)
    # the blade smears from just after the wind-up to just past the hit
    e = next((i for i, f in enumerate(out) if f.get("enter")), 0)
    h = next((i for i, f in enumerate(out) if f.get("hit")), None)
    if h is not None:
        for f in out[e + 1:h + 2]:
            f["smear"] = True
    return out


FLAT_ROLL = 20.0   # degrees the edges sit off the crosshair, so the blade isn't a hairline edge-on


def _edges_to_crosshair(samples, out, line=None):
    """Each tic's `knuckle`: from the blade (at the sweet spot) straight toward the crosshair's
    line, square to the blade, so the edges face the crosshair (the rig turns the fist the
    shorter way: either edge will do). Full through the swing itself, from the key after the
    windup to the link; eased in over the windup and back out to the guard."""
    n = len(out)
    firsts = [i for i, f in enumerate(out) if " >" not in f["name"]]
    en = next((i for i, f in enumerate(out) if f.get("enter")), 0)
    e0 = next((i for i in firsts if i > en), en)
    l0 = next((i for i, f in enumerate(out) if f.get("link")), n - 1)
    prev = None
    for i, (g, d, *_r) in enumerate(samples):
        if line is not None:                    # the swing's own plane (eye + its line)
            v = np.cross(np.asarray(line, float) if np.ndim(line) else _line_normal(line), d)
        else:
            p = g + d * SWEET
            v = np.array([0.0, p[1], 0.0]) - p
        v = v - d * np.dot(v, d)
        if np.linalg.norm(v) < 0.03:            # (right on the line: keep the last way)
            v = prev if prev is not None else v
        if np.linalg.norm(v) < 1e-6:
            continue
        v = un(v)
        if FLAT_ROLL:                           # (turn it a little so a sliver of the flat shows)
            r = math.radians(FLAT_ROLL)
            v = un(v * math.cos(r) + np.cross(d, v) * math.sin(r))
        if prev is not None and np.dot(v, prev) < 0:
            v = -v                              # (same edge plane; the rig picks the side)
        prev = v
        if e0 <= i <= l0:
            w = 1.0
        elif i < e0:
            w = _ease((i - en) / max(1, e0 - en)) if i > en else 0.0
        else:
            w = _ease((n - 1 - i) / max(1, n - 1 - l0))
        out[i]["knuckle"] = tuple(rig(v))
        out[i]["knuckle_w"] = float(w)


def guard_pose():
    """The guard as a screen-placed rig key (the walk cycle sways it on screen)."""
    k = KEYS["combo"][0]
    g = grip(k)
    d = blade_dir(k, g)
    g = _reach(g, d)
    if "tip" in k:
        d = un(world(*k["tip"]) - g)
    x, y, z = rig(g + d * HALF)
    dx, dy, dzz = rig(d)
    flat = math.hypot(dx, dy) or 1e-6
    return dict(S=(CX + FOCAL * x / z, CY - FOCAL * y / z, z), ang=math.degrees(math.atan2(dy, dx)),
                dz=dzz / flat, shrug=SHRUG, lean=LEAN, view=VIEW)


E, H, L = dict(enter=True), dict(hit=True), dict(link=True)
CLIPS = {
    # the combo: three blows chained click by click (diagonal down-left, diagonal down-right,
    # overhead); dt = video frames to the next entry; a 2-frame hit-stop after the heavy hits
    "cut1": [("combo", "GUARD", 0, dict(dt=4)), ("combo", "WIND R", 0, dict(enter=True, dt=5)),
             ("combo", "CUT 1 HIT", 0, dict(hit=True, dt=3)), ("combo", "FOLLOW", 0, dict(link=True, dt=9)),
             ("combo", "GUARD", 0, {})],
    "cut2": [("combo", "GUARD", 0, dict(dt=5)), ("combo", "WIND L", 0, dict(enter=True, dt=5)),
             ("combo", "CUT 2 HIT", 0, dict(hit=True, dt=4)), ("combo", "FOLLOW", 1, dict(link=True, dt=9)),
             ("combo", "GUARD", 0, {})],
    "over": [("combo", "GUARD", 0, dict(dt=4)), ("combo", "OVERHEAD", 0, dict(enter=True, dt=4)),
             ("combo", "FALL", 0, dict(dt=3)), ("combo", "FALL 2", 0, dict(dt=2)),
             ("combo", "CHOP HIT", 0, dict(hit=True, dt=2)), ("combo", "CHOP HIT", 0, dict(dt=3)),
             ("combo", "DRIVE", 0, dict(link=True, dt=9)), ("combo", "GUARD", 0, {})],
    "chop": [("chop", "GUARD", 0, dict(dt=3)), ("chop", "LIFT", 0, dict(dt=4)), ("chop", "COCK", 0, dict(enter=True, dt=4)),
             ("chop", "COME OVER", 0, dict(dt=3)), ("chop", "FALL", 0, dict(dt=3)), ("chop", "HIT", 0, dict(hit=True, dt=2)),
             ("chop", "HIT", 0, dict(dt=3)), ("chop", "DRIVE", 0, dict(dt=3)), ("chop", "DIP", 0, dict(link=True, dt=4)),
             ("chop", "RECOVER", 0, dict(dt=6)), ("combo", "GUARD", 0, {})],
    "stab": [("stab", "GUARD", 0, dict(dt=4)), ("stab", "CHAMBER", 0, dict(enter=True, dt=1)), ("stab", "THRUST", 0, dict(dt=2)),
             ("stab", "HIT", 0, dict(hit=True, dt=2)), ("stab", "HIT", 0, dict(dt=3)), ("stab", "RECOVER", 0, dict(link=True, dt=3)), ("stab", "GUARD", 0, {})],
    "sweep": [("combo", "GUARD", 0, dict(dt=6)), ("sweep", "WIND L", 0, dict(enter=True, dt=4)), ("sweep", "SWING", 0, dict(dt=3)),
              ("sweep", "HIT", 0, dict(hit=True, dt=3)), ("sweep", "THROUGH", 0, dict(dt=3)),
              ("sweep", "FINISH", 0, dict(link=True, dt=5)), ("sweep", "RECOVER", 0, dict(dt=5)), ("combo", "GUARD", 0, {})],
    "rise": [("combo", "GUARD", 0, dict(dt=4)), ("back", "LOW R", 0, dict(enter=True, dt=4)), ("back", "RISE", 0, dict(dt=3)),
             ("back", "HIT", 0, dict(hit=True, dt=3)), ("back", "THROUGH", 0, dict(dt=3)),
             ("back", "HIGH", 0, dict(link=True, dt=8)), ("combo", "GUARD", 0, {})],
}


# ------------------------------------------------------------------ slashes that cut THROUGH
# Each slash swings in one cut plane that runs through a swing centre just under and behind the
# eye and through the crosshair 1.6 m out, tilted to the slash's direction on screen. Seen from
# the eye (a few cm off that plane) the blade lies along its own path: it comes in from one
# corner, cuts through the crosshair at full speed and carries on off the far side, the edge
# first. The fists ride a circle about the swing centre (angle phi); the blade is the fists'
# angle plus the wrists' (delta): cocked back on the windup, snapped through past the hit, so
# the blade overtakes the fists right at the target.
PIVOT = np.array([0.0, 0.0, -0.38])     # swing centre (eye space): the chest, so the fists ride the
                                        # bottom edge and the long blade reaches up across the view
TARGET = 0.95                           # where the cut plane meets the crosshair (m ahead): about the
                                        # middle of the blade, so the rest runs on past the target
R_HANDS = 0.42                          # fists from the swing centre

ARCS = {
    # theta: the way the blade travels on screen (0 right, 90 up, 180 left, 270 down).
    # wind (phi, delta): fists' angle about the swing centre (0 = at the crosshair, - = the side
    # the cut comes from) and the wrists' angle of the blade past the fists (- = cocked back);
    # lead: the wrists through the cut (the blade ahead of the fists, tip first, lying along its
    # path); end (phi, delta): carried through, off the far side of the screen.
    # tics: guard->wind, held cocked, the swing, held through, back to the guard (1/35 s each)
    # every slash is a lever about the swing centre: the blade points straight out from it (lead 0),
    # so it sweeps edge first and never moves point first (no stabbing). wind delta: the wrists cocked
    # back a little, straightening by a third of the way into the cut
    "cut1":   dict(theta=225, wind=(-95, -15), lead=0, end=(95, 0), tics=(5, 2, 10, 2, 9), pivot=(0.0, 0.0, -0.38), r=0.42, target=0.95),
    "cut2":   dict(theta=315, wind=(-95, -15), lead=0, end=(95, 0), tics=(5, 2, 10, 2, 9), pivot=(0.0, 0.0, -0.38), r=0.42, target=0.95),
    "slam":   dict(theta=270, wind=(-140, -15), lead=0, end=(45, 0), tics=(6, 2, 11, 4, 10), pivot=(0.04, -0.15, -0.35), r=0.5, target=1.0),
    "chop":   dict(theta=275, wind=(-135, -15), lead=0, end=(45, 0), tics=(6, 2, 12, 4, 10), pivot=(-0.04, -0.15, -0.35), r=0.5, target=1.0),
    "rise":   dict(theta=120, wind=(-95, -15), lead=0, end=(95, 0), tics=(5, 2, 10, 2, 9), pivot=(0.0, 0.0, -0.38), r=0.42, target=0.95),
    "wide_r": dict(theta=180, wind=(-100, -15), lead=0, end=(100, 0), tics=(5, 2, 13, 2, 8), pivot=(0.0, 0.0, -0.26), r=0.44, target=1.0),
    "wide_l": dict(theta=0,   wind=(-100, -15), lead=0, end=(100, 0), tics=(5, 2, 13, 2, 8), pivot=(0.0, 0.0, -0.26), r=0.44, target=1.0),
}


import fp_rig as _R
GUARD_AT, TIP_AT = _R.PROXY["sword2h"]["guard"], _R.PROXY["sword2h"]["tip"]


def _miss(g, d):
    """How far (screen fractions) the drawn blade passes from the crosshair."""
    a, b = g + d * GUARD_AT, g + d * TIP_AT
    if a[1] < 0.05 and b[1] < 0.05:
        return 9.0
    if a[1] < 0.05:
        a = a + (b - a) * ((0.05 - a[1]) / (b[1] - a[1]))
    elif b[1] < 0.05:
        b = b + (a - b) * ((0.05 - b[1]) / (a[1] - b[1]))
    pa, pb = np.array([a[0] / a[1], 1.6 * a[2] / a[1]]), np.array([b[0] / b[1], 1.6 * b[2] / b[1]])
    v = pb - pa
    t = float(np.clip(-pa.dot(v) / (v.dot(v) or 1e-9), 0, 1))
    across = 0.0 if min(pa[0], pb[0]) <= 0 <= max(pa[0], pb[0]) else min(abs(pa[0]), abs(pb[0]))
    return across * 10 + float(np.linalg.norm(pa + v * t)) / 2   # (across the crosshair's column first)


def _rig_miss(g, d):
    """_miss for the blade where the game's own arm solve puts it."""
    arm = _R.pose_arm("R", dict(rig_key(g, d), weapon="sword2h"))
    G3, D3 = np.asarray(arm["G"]), np.asarray(arm["D"])
    eye = lambda v: np.array([v[0], v[2], v[1]])   # rig (x, up, ahead) -> eye (x, ahead, up)
    return _miss(eye(G3), eye(D3))


def _rig_dist(g, d, T):
    """How far the blade (where the game's arm solve puts it) passes from the point T (m)."""
    arm = _R.pose_arm("R", dict(rig_key(g, d), weapon="sword2h"))
    eye = lambda v: np.array([v[0], v[2], v[1]])   # rig (x, up, ahead) -> eye (x, ahead, up)
    G3, D3 = eye(np.asarray(arm["G"])), eye(np.asarray(arm["D"]))
    a, b = G3 + D3 * GUARD_AT, G3 + D3 * TIP_AT
    v = b - a
    t = float(np.clip((T - a).dot(v) / v.dot(v), 0, 1))
    return float(np.linalg.norm(a + v * t - T))


def _off_lens(g, rmin=0.38, radial=False):
    """Keep the fists at least rmin from the eye (pushed out and a little down), so a fist never
    sails through the lens on its way to or from a windup."""
    n = np.linalg.norm(g)
    if n >= rmin or g[2] > 0.6 * n:     # (fists up over the head are nowhere near the lens)
        return g
    v = g / (n or 1e-6) + (0.0 if radial else np.array([0.0, 0.0, -0.35]))   # (radial: same spot on screen)
    return v / np.linalg.norm(v) * rmin


def _ease(t):
    return 0.5 - 0.5 * math.cos(math.pi * min(1.0, max(0.0, t)))


def arc_keys(spec, edge=True):
    th = math.radians(spec["theta"])
    PIVOT = np.array(spec.get("pivot", globals()["PIVOT"]), float)   # (an overhead swings beside the crosshair)
    a = un(np.array([0.0, spec.get("target", TARGET), 0.0]) - PIVOT)
    R_HANDS = spec.get("r", globals()["R_HANDS"])
    u0 = np.array([math.cos(th), 0.0, math.sin(th)])
    u = un(u0 - a * a.dot(u0))

    def on_arc(phi, psi):
        p, q = math.radians(phi), math.radians(psi)
        return PIVOT + R_HANDS * (math.cos(p) * a + math.sin(p) * u), un(math.cos(q) * a + math.sin(q) * u)

    gk = KEYS["combo"][0]                      # the guard (the carry)
    g0 = grip(gk)
    d0 = blade_dir(gk, g0)
    g0 = _reach(g0, d0)
    d0 = un(world(*gk["tip"]) - g0)
    (pw, dw), lead, (pe, de) = spec["wind"], spec["lead"], spec["end"]
    n_in, n_hold, n_swing, n_end, n_back = spec["tics"]
    gw, Dw = on_arc(pw, pw + dw)
    ge, De = on_arc(pe, pe + de)
    frames = []                                # (grip, blade, name, flags)
    for i in range(n_in):                      # guard -> cocked
        t = _ease(i / n_in)
        frames.append((_off_lens(g0 * (1 - t) + gw * t), un(_slerp(d0, Dw, t)), "GUARD" if i == 0 else "WIND >", {}))
    for i in range(n_hold):
        frames.append((gw, Dw, "COCKED", dict(enter=True) if i == 0 else {}))
    swing = []
    for i in range(n_swing):                   # the cut: fastest through the middle, wrists snapping
        t = (i + 1) / n_swing                  # the blade ahead early, so it lies along its path
        phi = pw + (pe - pw) * _ease(t)
        dl = dw + (lead - dw) * _ease(t / 0.35) if t < 0.7 else lead + (de - lead) * _ease((t - 0.7) / 0.3)
        swing.append(on_arc(phi, phi + dl))
    s0 = len(frames)
    for g, d in swing:
        frames.append((g, d, "SWING >", {}))
    for i in range(n_end):
        frames.append((ge, De, "THROUGH", dict(link=True) if i == 0 else {}))
    low = np.array([0.0, 0.0, -0.15]) if spec.get("back_low") else np.zeros(3)
    for i in range(1, n_back + 1):             # back to the guard (along the bottom edge if asked)
        t = _ease(i / n_back)
        g = ge * (1 - t) + g0 * t + low * math.sin(math.pi * t)
        frames.append((_off_lens(g), un(_slerp(De, d0, t)), "RECOVER >" if i < n_back else "GUARD", {}))
    G = [_reach(g, d) for g, d, *_ in frames]
    # the hit: the swing frame where the blade, as drawn from where the fists really are, passes
    # nearest the crosshair
    T = np.array([0.0, spec.get("target", TARGET), 0.0])   # (the crosshair, where the cut plane meets it)
    if spec.get("hit_screen"):   # (an overhead: where the drawn blade crosses the crosshair, fists low)
        h = min(range(s0, s0 + n_swing), key=lambda i: _rig_miss(G[i], frames[i][1]))
    else:
        h = min(range(s0, s0 + n_swing), key=lambda i: _rig_dist(G[i], frames[i][1], T))
    frames[h] = (frames[h][0], frames[h][1], "CUT", dict(hit=True))
    out = []
    pts = [g + d * SWEET for g, (_, d, *__) in zip(G, frames)]
    for i, (g, (_, d, name, flags)) in enumerate(zip(G, frames)):
        key = dict(rig_key(g, d), tics=1, view=VIEW, name=name, ref="swing2h@arc")
        if edge:
            v = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
            speed = np.linalg.norm(v) / 2
            if speed > 1e-6:
                key["edge"] = tuple(rig(v / (2 * speed)))
                key["edge_w"] = float(np.clip((speed - EDGE_V0) / (EDGE_V1 - EDGE_V0), 0, 1))
        key.update({k: True for k in ("hit", "enter", "link") if flags.get(k)})
        out.append(key)
    e = next(i for i, f in enumerate(out) if f.get("enter"))
    h = next(i for i, f in enumerate(out) if f.get("hit"))
    for f in out[e + 1:h + 3]:
        f["smear"] = True
    return out


# The slashes keyed in 3D (mocap2h_keys.json): the fists come down the side of the view and land at
# a bottom corner, so at the hit the whole blade lies across the view with the crosshair at its middle
# and the arms out of the way; then it sweeps on, off the far side. dt: video frames to the next key.
def _seq(move, names, hold_hit=0):
    out = []
    for i, n in enumerate(names):
        nm, dt = n if isinstance(n, tuple) else (n, None)
        f = dict(dt=dt) if dt else {}
        if nm == "WIND" or nm == "LOW":
            f["enter"] = True
        if nm == "HIT":
            f["hit"] = True
        if nm in ("FINISH", "SLAM", "HIGH"):
            f["link"] = True
        out.append((move, nm, 0, f))
        if nm == "HIT" and hold_hit:
            out.append((move, "HIT", 0, dict(dt=hold_hit)))
    return out


def _seq2(move, plan):
    """plan: [(key name, dt to the next, flag)...]; the last entry ends the clip."""
    out = []
    for nm, dt, fl in plan:
        f = dict(dt=dt) if dt else {}
        if fl:
            f[fl] = True
        out.append((move, nm, 0, f))
    return out


SLASHES = {   # (dt: video frames to the next key; enter = the cocked windup, link = where the next may cut in)
    "cut1": _seq2("cut1", [("GUARD", 3, None), ("WIND", 2, "enter"), ("LAG", 3, None), ("HIT", 2, "hit"), ("FOLLOW", 3, None), ("OFF", 3, "link"), ("GUARD", 0, None)]),
    "cut2": _seq2("cut2", [("GUARD", 3, None), ("WIND", 2, "enter"), ("LAG", 3, None), ("HIT", 2, "hit"), ("FOLLOW", 3, None), ("OFF", 3, "link"), ("GUARD", 0, None)]),
    "slam": _seq2("slam", [("GUARD", 3, None), ("RAISE", 2, None), ("WIND", 3, "enter"), ("LAG", 3, None), ("HIT", 2, "hit"), ("FOLLOW", 2, None), ("OFF", 2, "link"), ("GUARD", 0, None)]),
    "chop": _seq2("chop", [("GUARD", 4, None), ("WIND", 2, "enter"), ("LAG", 3, None), ("HIT", 2, "hit"), ("FOLLOW", 2, None), ("OFF", 2, "link"), ("GUARD", 0, None)]),
    "rise": _seq2("rise", [("GUARD", 4, None), ("WIND", 2, "enter"), ("LAG", 3, None), ("HIT", 2, "hit"), ("FOLLOW", 3, None), ("OFF", 4, "link"), ("GUARD", 0, None)]),
    "wide_r": _seq2("wide_r", [("GUARD", 4, None), ("WIND", 2, "enter"), ("LAG", 1, None), ("HIT", 2, "hit"), ("FOLLOW", 3, None), ("OFF", 4, "link"), ("GUARD", 0, None)]),
    "wide_l": _seq2("wide_l", [("GUARD", 2, None), ("WIND", 2, "enter"), ("LAG", 1, None), ("HIT", 2, "hit"), ("FOLLOW", 3, None), ("OFF", 4, "link"), ("BACK", 0, None)]),
    "stab": _seq2("stab", [("GUARD", 2, None), ("DRAW", 2, None), ("CHAMBER", 3, "enter"), ("THRUST", 2, None), ("HIT", 2, "hit"), ("HIT", 2, None), ("RECOVER", 4, "link"), ("GUARD", 0, None)]),
}
for _k in SLASHES.values():   # (a clip that ends on GUARD ends on the combo's own guard)
    for j, (m, n, i, f) in enumerate(_k):
        if n == "GUARD" and j == len(_k) - 1:
            _k[j] = ("combo", "GUARD", 0, f)
for _k in SLASHES.values():   # (the guard rows are the combo's own guard)
    for j, (m, n, i, f) in enumerate(_k):
        if n == "GUARD" and j == len(_k) - 1:
            _k[j] = ("combo", "GUARD", 0, f)


# ------------------------------------------------------------------ the slash as you see it
# A slash seen from your own eye: the blade sweeps ACROSS in front of you, broadside, edge first,
# like a clock hand about your fists, which sit near a bottom corner or edge of the view. It lies in
# a plane facing you (DEPTH ahead, tilted by tilt), so its flat shows while its edge cuts; it slices
# through the crosshair at full speed and carries on off the far side of the screen. The fists drift
# the same way the blade sweeps (drift, m), so nothing ever swings in reverse.
#   pivot: the fists on screen (x 0-1, y 0-1 top to bottom; > 1 is under the screen)
#   sense: +1 the blade turns anticlockwise on screen, -1 clockwise
#   sweep: (before, after) degrees of turn either side of the crosshair
#   tilt: (at the windup, through the cut) the blade's lean away from you, degrees (- leans back
#         over the head)
#   tics: guard->wind, held cocked, the swing, held through, back to the guard
DEPTH = 0.45
WIPERS = {
    "cut1":   dict(pivot=(0.80, 1.00), sense=1,  sweep=(80, 80), tilt=(-10, 12), drift=0.14, tics=(5, 2, 9, 2, 9)),
    "cut2":   dict(pivot=(0.20, 1.00), sense=-1, sweep=(80, 80), tilt=(-10, 12), drift=0.14, tics=(5, 2, 9, 2, 9)),
    "slam":   dict(pivot=(0.88, 0.88), sense=1,  sweep=(95, 70), tilt=(-55, 15), drift=0.10, tics=(6, 3, 10, 4, 10)),
    "chop":   dict(pivot=(0.12, 0.88), sense=-1, sweep=(95, 70), tilt=(-55, 15), drift=0.10, tics=(6, 2, 11, 4, 10)),
    "rise":   dict(pivot=(0.30, 1.02), sense=1,  sweep=(75, 75), tilt=(5, 12), drift=0.12, tics=(5, 2, 9, 2, 9)),
    "wide_r": dict(pivot=(0.50, 1.18), sense=1,  sweep=(80, 80), tilt=(5, 10), drift=0.20, tics=(5, 2, 12, 2, 8)),
    "wide_l": dict(pivot=(0.50, 1.18), sense=-1, sweep=(80, 80), tilt=(5, 10), drift=0.20, tics=(5, 2, 12, 2, 8)),
}


def wiper_keys(spec, edge=True):
    D = spec.get("depth", DEPTH)
    sx, sy = spec["pivot"]
    Q = np.array([(2 * sx - 1) * D, D, (1 - 2 * sy) * D / 1.6])          # the fists at the crossing
    bc = math.atan2(-Q[2], -Q[0])                                         # pivot -> crosshair, in the plane
    sg = spec["sense"]
    b0, b1 = spec["sweep"]
    t0, t1 = spec["tilt"]
    # which way the crosshair point travels (in the plane): the blade turning by +sense
    trav = np.array([-math.sin(bc) * sg, 0.0, math.cos(bc) * sg])

    def pose(p, tilt, drift):
        beta, tau = bc + math.radians(sg * p), math.radians(tilt)
        d = un(np.array([math.cos(beta) * math.cos(tau), math.sin(tau), math.sin(beta) * math.cos(tau)]))
        return Q + trav * drift, d

    gk = KEYS["combo"][0]                      # the guard (the carry)
    g0 = grip(gk)
    d0 = blade_dir(gk, g0)
    g0 = _reach(g0, d0)
    d0 = un(world(*gk["tip"]) - g0)
    n_in, n_hold, n_swing, n_end, n_back = spec["tics"]
    dr = spec["drift"]
    gw, Dw = pose(-b0, t0, -dr / 2)
    ge, De = pose(b1, t1, dr / 2)
    frames = []
    for i in range(n_in):                      # guard -> cocked
        t = _ease(i / n_in)
        frames.append((_off_lens(g0 * (1 - t) + gw * t), un(_slerp(d0, Dw, t)), "GUARD" if i == 0 else "WIND >", {}))
    for i in range(n_hold):
        frames.append((gw, Dw, "COCKED", dict(enter=True) if i == 0 else {}))
    s0 = len(frames)
    for i in range(n_swing):                   # the cut: fastest through the crosshair
        t = _ease((i + 1) / n_swing)
        p = -b0 + (b0 + b1) * t
        g, d = pose(p, t0 + (t1 - t0) * min(1.0, t / 0.5), dr * (t - 0.5))
        frames.append((g, d, "SWING >", {}))
    for i in range(n_end):
        frames.append((ge, De, "THROUGH", dict(link=True) if i == 0 else {}))
    for i in range(1, n_back + 1):
        t = _ease(i / n_back)
        frames.append((_off_lens(ge * (1 - t) + g0 * t), un(_slerp(De, d0, t)), "RECOVER >" if i < n_back else "GUARD", {}))
    G = [_reach(g, d) for g, d, *_ in frames]
    h = min(range(s0, s0 + n_swing), key=lambda i: _rig_miss(G[i], frames[i][1]))
    frames[h] = (frames[h][0], frames[h][1], "CUT", dict(hit=True))
    out = []
    pts = [g + d * SWEET for g, (_, d, *__) in zip(G, frames)]
    for i, (g, (_, d, name, flags)) in enumerate(zip(G, frames)):
        key = dict(rig_key(g, d), tics=1, view=VIEW, name=name, ref="swing2h@wiper")
        if edge:
            v = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
            speed = np.linalg.norm(v) / 2
            if speed > 1e-6:
                key["edge"] = tuple(rig(v / (2 * speed)))
                key["edge_w"] = float(np.clip((speed - EDGE_V0) / (EDGE_V1 - EDGE_V0), 0, 1))
        key.update({k: True for k in ("hit", "enter", "link") if flags.get(k)})
        out.append(key)
    e = next(i for i, f in enumerate(out) if f.get("enter"))
    for f in out[e + 1:h + 3]:
        f["smear"] = True
    return out


def clips():
    # the sword never turns in the hands: no edge roll; it sits in the fists the way the grip holds it
    planes = KEYS.get("planes", {})   # (a swing's own plane normal, when its keys bring one)
    return {name: keys_of(seq, edge=False, cross=name in LINES, line=planes.get(name, LINES.get(name)))
            for name, seq in SLASHES.items()}


# the slash rule (tip through the crosshair, edges facing it): on slash 1 for the user's approval
# the user's drawn lines through the crosshair (degrees on screen, 0 = right, 90 = up; each swing
# runs from the line's + end to its - end). The left-click swings as he drew them: slash 1 from the upper right to the lower left, slash 2 from the upper left to
# the lower right, the SLAM straight down. Each swing keeps to the plane through the eye and its
# line, so its fists, blade and edges lie along the line on screen; the tip crosses the crosshair.
# The rest follow suit: the wides along the horizon (right to left, then back), the chop steep from
# the upper right, the rising backhand from the lower right up to the upper left.
LINES = {"cut1": 37.0, "cut2": 143.0, "slam": 90.0,
         "wide_r": 15.0, "wide_l": 165.0, "chop": 70.0, "rise": -55.0}


def _line_normal(alpha):
    a = math.radians(alpha)
    return un(np.cross(np.array([math.cos(a), 0.0, math.sin(a)]), np.array([0.0, 1.0, 0.0])))
