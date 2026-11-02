"""Two-handed sword moves motion-captured from the user's own swing video
(F:\\!  BELLMOURN\\! @ MOCAP\\2 HAND SWORD SWINGING.mp4, filmed over the shoulder, 30 fps).

mocap2h_keys.json holds the approved first-person keys (critics r3), authored for the game's
world camera: 90 degrees across at 16:10, crosshair centred, the eye 0.30 m higher above the
shoulders than the rest of the rigs (shoulders 0.50 m under the eye). Per key: G = grip as
[screen x, screen y, depth] (y > 1 is under the screen) or Gw = [right, forward, up] metres
from the shoulders' centre; the blade as "tip" (aim point [screen x, screen y, depth]) or
"dir" ([yaw, pitch] degrees, yaw 0 ahead, + right); twist (torso, + left); lean (shoulders
forward, m); dt (video frames from the key before; default the video's own spacing, 2-9).

clips() turns them into rig keys, one per tic (1/35 s): the grip and blade are interpolated
between keys (Catmull-Rom for the grip, a slerp for the blade) and handed to the rig as
S / ang / dz with view 1.0 (drawn unshrunk, see viewmodel.js) and the shoulders dropped by
`shrug` (and brought forward by `lean`), so the game's own IK and exporter pose the arms.
"""
import json
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
KEYS = json.load(open(os.path.join(HERE, "mocap2h_keys.json")))

FOCAL, CX, CY = 192.0, 192.0, 120.0     # fp_rig: 384 x 240, 90 degrees across
SHRUG = -0.20                           # rig shoulders 0.30 under the eye -> 0.50
VIEW = 1.0
FLAT = 0.5                              # the blade turned halfway to show its flat (never an edge-on stick)
FPS, TIC_HZ = 30.0, 35.0
# capture body (eye at 0; x right, y forward, z up) used while the keys were approved
SHO = np.array([0.17, -0.03, -0.50])
NECK = np.array([0.0, -0.08, -0.50])
UP, FO, HAND, HALF = 0.29, 0.27, 0.07, 0.05
GRIP_R = 0.055                          # rig grip (right fist) from the middle of the two fists

un = lambda v: v / np.linalg.norm(v)


def world(sx, sy, y):
    return np.array([(2 * sx - 1) * y, y, (1 - 2 * sy) * y / 1.6])


def blade_dir(k, g):
    if "dir" in k:
        yw, pt = map(math.radians, k["dir"])
        return np.array([math.sin(yw) * math.cos(pt), math.cos(yw) * math.cos(pt), math.sin(pt)])
    return un(world(*k["tip"]) - g)


def grip(k):
    if "G" in k:
        return world(*k["G"])
    w = k["Gw"]
    return np.array([w[0], SHO[1] + k.get("lean", 0) + w[1], SHO[2] + w[2]])


def _rotz(v, deg, c):
    a = math.radians(deg)
    x, y = v[0] - c[0], v[1] - c[1]
    return np.array([c[0] + x * math.cos(a) - y * math.sin(a), c[1] + x * math.sin(a) + y * math.cos(a), v[2]])


def _reach(g, d, tw, lean):
    """Pull a grip the capture body could not reach back to its hands (as approved)."""
    for _ in range(3):
        hs = []
        for sg in (1, -1):
            s = _rotz(np.array([sg * SHO[0], SHO[1] + lean, SHO[2]]), tw, NECK)
            h = g + d * HALF * sg
            hv = h - s
            hv = un(hv - hv.dot(d) * d)
            w = h - hv * HAND
            if np.linalg.norm(w - s) > UP + FO - 0.004:
                w = s + un(w - s) * (UP + FO - 0.004)
            hs.append(w + hv * HAND)
        g2 = (hs[0] + hs[1]) / 2
        if np.linalg.norm(g2 - g) < 0.005:
            break
        g = g2
    return g


def _slerp(a, b, t):
    w = math.acos(float(np.clip(a.dot(b), -1, 1)))
    return a if w < 1e-4 else (math.sin((1 - t) * w) * a + math.sin(t * w) * b) / math.sin(w)


def rig_key(g, d, tw, lean):
    """Capture space (grip middle, blade) -> fp_rig key: right fist on screen + depth, blade
    angle on screen and its lean into the scene."""
    gr = g + d * GRIP_R
    x, y, z = gr[0], gr[2], gr[1]            # (rig: x right, y up, z ahead)
    dx, dy, dzz = d[0], d[2], d[1]
    flat = math.hypot(dx, dy) or 1e-6
    return dict(S=(CX + FOCAL * x / z, CY - FOCAL * y / z, z), ang=math.degrees(math.atan2(dy, dx)),
                dz=dzz / flat, twist=tw, shrug=SHRUG, lean=lean, flat=FLAT)


def keys_of(seq):
    """seq: [(move, key name, nth, flags), ...] -> one rig key per tic."""
    ks = []
    for move, name, nth, flags in seq:
        k = [x for x in KEYS[move] if x["name"] == name][nth]
        ks.append((k, flags))
    G, D = [], []
    for k, _ in ks:
        g = grip(k)
        d = blade_dir(k, g)
        g = _reach(g, d, k.get("twist", 0), k.get("lean", 0))
        if "tip" in k:
            d = un(world(*k["tip"]) - g)
        G.append(g)
        D.append(d)
    out = []
    for i, (k, flags) in enumerate(ks):
        if i == len(ks) - 1:
            n = 1
        else:
            nk = ks[i + 1][0]
            dt = flags.get("dt", nk.get("dt", min(9, max(2, abs(nk["ref"] - k["ref"])))))
            n = max(1, round(dt * TIC_HZ / FPS))
        for j in range(n):
            u = j / n
            if i < len(ks) - 1:
                g4 = [G[max(i - 1, 0)], G[i], G[i + 1], G[min(i + 2, len(ks) - 1)]]
                g = 0.5 * (2 * g4[1] + (-g4[0] + g4[2]) * u + (2 * g4[0] - 5 * g4[1] + 4 * g4[2] - g4[3]) * u * u
                           + (-g4[0] + 3 * g4[1] - 3 * g4[2] + g4[3]) * u ** 3)
                d = un(_slerp(D[i], D[i + 1], u))
                k2 = ks[i + 1][0]
                tw = k.get("twist", 0) * (1 - u) + k2.get("twist", 0) * u
                ln = k.get("lean", 0) * (1 - u) + k2.get("lean", 0) * u
            else:
                g, d, tw, ln = G[i], D[i], k.get("twist", 0), k.get("lean", 0)
            key = dict(rig_key(g, d, tw, ln), tics=1, view=VIEW,
                       name=k["name"] if j == 0 else f"{k['name']} >", ref=f"swing2h@{k['ref']}")
            if j == 0:
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
    k = KEYS["combo"][0]
    g = grip(k)
    d = blade_dir(k, g)
    return dict(rig_key(_reach(g, d, k["twist"], 0), d, k["twist"], 0), view=VIEW)


E, H, L = dict(enter=True), dict(hit=True), dict(link=True)
BACK = dict(dt=9)   # the walk back to the guard
CLIPS = {
    # the combo: three blows chained click by click (cut, cut, overhead); dt = video frames to the
    # next entry (critics: quick wind-ups, a 0.1 s fall into the hit, a short hit-stop after it)
    "cut1": [("combo", "GUARD", 0, {}), ("combo", "WIND R", 0, E), ("combo", "CUT 1 HIT", 0, H),
             ("combo", "FOLLOW", 0, dict(link=True, **BACK)), ("combo", "GUARD", 0, {})],
    "cut2": [("combo", "GUARD", 0, dict(dt=6)), ("combo", "WIND L", 0, E), ("combo", "CUT 2 HIT", 0, H),
             ("combo", "FOLLOW", 1, dict(link=True, **BACK)), ("combo", "GUARD", 0, {})],
    "over": [("combo", "GUARD", 0, dict(dt=3)), ("combo", "RE-LIFT", 0, dict(dt=6)), ("combo", "OVERHEAD", 0, dict(enter=True, dt=3)),
             ("combo", "FALL", 0, dict(dt=3)), ("combo", "CHOP HIT", 0, dict(hit=True, dt=2)), ("combo", "CHOP HIT", 0, dict(dt=4)),
             ("combo", "DRIVE", 0, dict(link=True, dt=8)), ("combo", "GUARD", 0, {})],
    "chop": [("chop", "GUARD", 0, dict(dt=3)), ("chop", "LIFT", 0, dict(dt=3)), ("chop", "COCK", 0, dict(enter=True, dt=5)),
             ("chop", "COME OVER", 0, dict(dt=2)), ("chop", "FALL", 0, dict(dt=3)), ("chop", "HIT", 0, dict(hit=True, dt=2)),
             ("chop", "HIT", 0, dict(dt=3)), ("chop", "DRIVE", 0, dict(dt=3)), ("chop", "DIP", 0, dict(link=True, dt=4)),
             ("chop", "RECOVER", 0, dict(dt=7)), ("combo", "GUARD", 0, {})],
    "stab": [("stab", "GUARD", 0, dict(dt=4)), ("stab", "CHAMBER", 0, dict(enter=True, dt=3)), ("stab", "THRUST", 0, dict(dt=4)),
             ("stab", "HIT", 0, dict(hit=True, dt=6)), ("stab", "RECOVER", 0, dict(link=True, dt=6)), ("stab", "GUARD", 1, {})],
    "sweep": [("combo", "GUARD", 0, dict(dt=8)), ("sweep", "WIND L", 0, E), ("sweep", "SWING", 0, {}),
              ("sweep", "HIT", 0, H), ("sweep", "THROUGH", 0, {}), ("sweep", "FOLLOW", 0, dict(dt=2)),
              ("sweep", "FINISH", 0, dict(link=True, dt=4)), ("sweep", "RECOVER", 0, {}), ("sweep", "GUARD", 0, {})],
    "rise": [("back", "GUARD", 0, {}), ("back", "DROP", 0, dict(dt=3)), ("back", "LOW R", 0, dict(enter=True, dt=3)),
             ("back", "RISE", 0, {}), ("back", "HIT", 0, H), ("back", "THROUGH", 0, {}),
             ("back", "HIGH", 0, L), ("back", "RECOVER", 0, BACK), ("combo", "GUARD", 0, {})],
}


def clips():
    return {name: keys_of(seq) for name, seq in CLIPS.items()}
