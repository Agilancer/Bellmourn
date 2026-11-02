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


def keys_of(seq, edge=True):
    """seq: [(move, key name, nth, flags), ...] -> one rig key per tic."""
    ks = []
    for move, name, nth, flags in seq:
        ks.append(([x for x in KEYS[move] if x["name"] == name][nth], flags))
    G, D = [], []
    for k, _ in ks:
        g = grip(k)
        d = blade_dir(k, g)
        g = _reach(g, d)
        if "tip" in k:              # aimed blades stay aimed from where the fists really are
            d = un(world(*k["tip"]) - g)
        G.append(g)
        D.append(d)
    samples = []                    # (g, d, key, flags, first tic of its key?)
    for i, (k, flags) in enumerate(ks):
        if i == len(ks) - 1:
            samples.append((G[i], D[i], k, flags, True))
            break
        nk = ks[i + 1][0]
        dt = flags.get("dt", nk.get("dt", min(9, max(2, abs(nk["ref"] - k["ref"])))))
        n = max(1, round(dt * TIC_HZ / FPS))
        for j in range(n):
            u = j / n
            g4 = [G[max(i - 1, 0)], G[i], G[i + 1], G[min(i + 2, len(ks) - 1)]]
            g = 0.5 * (2 * g4[1] + (-g4[0] + g4[2]) * u + (2 * g4[0] - 5 * g4[1] + 4 * g4[2] - g4[3]) * u * u
                       + (-g4[0] + 3 * g4[1] - 3 * g4[2] + g4[3]) * u ** 3)
            samples.append((g, un(_slerp(D[i], D[i + 1], u)), k, flags, j == 0))
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
        if edge:   # the edge leads: the blade's way of travel, as fast as it goes
            v = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
            speed = np.linalg.norm(v) / 2
            if speed > 1e-6:
                key["edge"] = tuple(rig(v / (2 * speed)))
                key["edge_w"] = float(np.clip((speed - EDGE_V0) / (EDGE_V1 - EDGE_V0), 0, 1))
        if first:
            key.update({f: True for f in ("hit", "enter", "link") if flags.get(f)})
        out.append(key)
    # the blade smears from just after the wind-up to just past the hit
    e = next((i for i, f in enumerate(out) if f.get("enter")), 0)
    h = next((i for i, f in enumerate(out) if f.get("hit")), None)
    if h is not None:
        for f in out[e + 1:h + 2]:
            f["smear"] = True
    return out


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
    "stab": [("stab", "GUARD", 0, dict(dt=4)), ("stab", "CHAMBER", 0, dict(enter=True, dt=2)), ("stab", "THRUST", 0, dict(dt=3)),
             ("stab", "HIT", 0, dict(hit=True, dt=3)), ("stab", "RECOVER", 0, dict(link=True, dt=4)), ("stab", "GUARD", 0, {})],
    "sweep": [("combo", "GUARD", 0, dict(dt=6)), ("sweep", "WIND L", 0, dict(enter=True, dt=4)), ("sweep", "SWING", 0, dict(dt=3)),
              ("sweep", "HIT", 0, dict(hit=True, dt=3)), ("sweep", "THROUGH", 0, dict(dt=3)),
              ("sweep", "FINISH", 0, dict(link=True, dt=5)), ("sweep", "RECOVER", 0, dict(dt=5)), ("combo", "GUARD", 0, {})],
    "rise": [("combo", "GUARD", 0, dict(dt=4)), ("back", "LOW R", 0, dict(enter=True, dt=4)), ("back", "RISE", 0, dict(dt=3)),
             ("back", "HIT", 0, dict(hit=True, dt=3)), ("back", "THROUGH", 0, dict(dt=3)),
             ("back", "HIGH", 0, dict(link=True, dt=8)), ("combo", "GUARD", 0, {})],
}


def clips():
    return {name: keys_of(seq, edge=name != "stab") for name, seq in CLIPS.items()}
