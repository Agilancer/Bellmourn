"""Bake the first-person move set (tools/templates/moves.py) for the 3D arms.

    python tools/models/build_moves.py            # build + fit report
    python tools/models/build_moves.py --check    # fit report only

Every arm model (the bare arm and the ten gauntlets) shares one skeleton, so the moves live
in one clip file per side, not in each arm's .glb: templates/models/arms/fp_moves_R.glb and
fp_moves_L.glb hold the bones and the animations only. templates/models/fp_moves.json lists
every clip (duration, frame starts, hit / fire / whoosh times, where a combo may continue,
the shield's hold frame, which way the edge travels on screen at the hit) and the choices
the player has (SLOTS). The picks themselves live in templates/models/fp_picks.json, written
by the move viewer (moves.html), so rebuilding never undoes a choice.
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import arm as A  # noqa: E402  (also puts tools/templates on the path)
import export  # noqa: E402
import fit_check  # noqa: E402
import fp_rig as R  # noqa: E402
import moves  # noqa: E402
from gltf import GLB  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
MODELS = os.path.join(ROOT, "templates", "models")
TIC = export.TIC


def side_frames(clip, side):
    for sides, frames in clip["frames"].items():
        if side in sides:
            return frames
    return None


def export_side(side, path):
    g = GLB()
    root = g.node(f"fp_moves_{side}")
    origin = {n: o for n, _, o in A.bones(side)}
    nodes = {}
    for name, parent, o in A.bones(side):
        m = np.eye(4)
        m[:3, 3] = o if parent is None else o - origin[parent]
        nodes[name] = g.node(name, root if parent is None else nodes[parent], matrix=m)
    fingers = [n for n, parent, _ in A.bones(side) if parent == "hand"]
    count = 0
    for cid, clip in moves.MOVES.items():
        frames = side_frames(clip, side)
        if not frames:
            continue
        times, tracks = [], {nodes[b]: [] for b in export.ANIMATED + tuple(fingers)}
        t = 0.0
        for f in frames + [frames[-1]]:
            R.set_view(f.get("view", R.REST_SCALE))
            arm = next(a for a in R.pose_frame(f) if a["side"] == side)
            mats = A.pose(arm)
            for b in export.ANIMATED:
                tracks[nodes[b]].append(mats[b])
            for n, local in A.finger_mats(arm, side).items():
                tracks[nodes[n]].append(local)
            times.append(t)
            t += f["tics"] * TIC
        times[-1] = times[-2] + frames[-1]["tics"] * TIC
        g.animation(cid, times, tracks)
        count += 1
    g.save(path)
    return count


def tip(arm):
    if arm["weapon"]:
        return arm["G"] + arm["D"] * R.PROXY[arm["weapon"]]["tip"]
    return R.cast_point(arm) if arm.get("cast") else arm["G"]


def drawn_tip(frame, side="R"):
    """Where the right hand's blade tip is drawn (slid sideways like the game does)."""
    arms = R.pose_frame(frame)
    arm = next(x for x in arms if x["side"] == side)
    p = R.project(tip(arm))
    return np.array([p[0] + moves.slide(arms).get(side, 0.0), p[1]])


def catalog():
    clips = {}
    for cid, clip in moves.MOVES.items():
        frames = next(iter(clip["frames"].values()))
        starts, t = [], 0.0
        for f in frames:
            starts.append(round(t, 6))
            t += f["tics"] * TIC
        dur = round(t, 6)
        ev = dict(duration=dur)
        for e in ("hit", "fire"):
            ts = [starts[i] for i, f in enumerate(frames) if f.get(e)]
            if ts:
                ev[e] = ts
        smear = [i for i, f in enumerate(frames) if f.get("smear")]
        if smear and clip["kind"] == "attack":
            ev["whoosh"] = [starts[max(0, smear[0] - 1)]]
        for e in ("hold", "enter"):
            i = next((i for i, f in enumerate(frames) if f.get(e)), None)
            if i is not None:
                ev[e] = starts[i]
        i = next((i for i, f in enumerate(frames) if f.get("link")), None)
        if i is not None:   # the follow-through is done: a queued blow may go on from here
            ev["link"] = starts[i + 1] if i + 1 < len(frames) else dur
        hit = next((i for i, f in enumerate(frames) if f.get("hit")), None)
        if hit is not None and clip["kind"] == "attack":
            # which way the blade's tip travels across the screen at the hit (x right, y up)
            R.set_view(R.REST_SCALE)
            a, b = (drawn_tip(frames[j]) for j in (max(0, hit - 1), min(len(frames) - 1, hit + 1)))
            d = np.array([b[0] - a[0], a[1] - b[1]])
            d /= np.linalg.norm(d) or 1
            ev["edge"] = [round(float(d[0]), 3), round(float(d[1]), 3)]
        refs = [f.get("ref") for f in frames if isinstance(f.get("ref"), str)]
        # the library clip the blow (or cast, or block) is taken from, and where in it
        key = next((f for e in ("hit", "fire", "hold") for f in frames
                    if f.get(e) and isinstance(f.get("ref"), str)), None)
        if key:
            src, fr = key["ref"].split("@")
            ev["src"] = [src, round(int(fr) / 30, 3)]
        clips[cid] = dict(kind=clip["kind"], heavy=bool(clip.get("heavy")), roll=bool(clip.get("roll")),
                          power=clip.get("power", 1.0),
                          starts=starts,
                          events=ev, names=[f["name"] for f in frames],
                          sides="".join(sorted({s for k in clip["frames"] for s in k})),
                          ref=sorted({r.split("@")[0] for r in refs}))
    return dict(stretch=moves.STRETCH, clips=clips, slots=moves.SLOTS)


MARGIN = 0.07 * R.SCREEN_H   # clearance kept under the top of the screen (bob, recoil)


def halfway(f0, f1):
    """A frame halfway between two (weapon and shield keys; open hands are left as they are)."""
    out = dict(f1)
    for side in ("R", "L"):
        a, b = f0.get(side), f1.get(side)
        if not a or not b or "fing" in a or "fing" in b or "support" in a or "support" in b:
            continue
        m = moves.lerp_key(dict(a), dict(b), 0.5)
        if a.get("twist") or b.get("twist"):
            m["twist"] = moves.lerp_twist(a, b, 0.5)
        out[side] = m
    for side in ("R", "L"):  # a support hand turns with the torso it belongs to
        if out.get(side, {}).get("support") is not None and f0.get(side):
            out[side] = dict(out[side], twist=(f0[side].get("twist", 0) + f1[side].get("twist", 0)) / 2)
    return out


def _quat(m):
    """A rotation matrix's quaternion (w, x, y, z)."""
    t = np.trace(m)
    if t > 0:
        r = np.sqrt(1 + t) * 2
        return np.array([0.25 * r, (m[2, 1] - m[1, 2]) / r, (m[0, 2] - m[2, 0]) / r, (m[1, 0] - m[0, 1]) / r])
    i = int(np.argmax(np.diag(m)))
    j, k = (i + 1) % 3, (i + 2) % 3
    r = np.sqrt(1 + m[i, i] - m[j, j] - m[k, k]) * 2
    q = np.zeros(4)
    q[0] = (m[k, j] - m[j, k]) / r
    q[1 + i] = 0.25 * r
    q[1 + j] = (m[j, i] + m[i, j]) / r
    q[1 + k] = (m[k, i] + m[i, k]) / r
    return q


def _mat(q):
    w, x, y, z = q / np.linalg.norm(q)
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def blended_tips(f0, f1, steps=(0.25, 0.5, 0.75)):
    """Where each weapon's tip is drawn between two frames as the game blends them: the item
    bone's rotation and position interpolated (not the keys' angles), slid sideways."""
    out = []
    a0, a1 = R.pose_frame(f0), R.pose_frame(f1)
    for x0 in a0:
        x1 = next((x for x in a1 if x["side"] == x0["side"]), None)
        if not x1 or not x0["weapon"] or x0["weapon"] != x1["weapon"]:
            continue
        m0, m1 = A.pose(x0)["item"], A.pose(x1)["item"]
        q0, q1 = _quat(m0[:3, :3]), _quat(m1[:3, :3])
        if np.dot(q0, q1) < 0:
            q1 = -q1
        reach = R.PROXY[x0["weapon"]]["tip"]
        s0, s1 = moves.slide(a0).get(x0["side"], 0.0), moves.slide(a1).get(x0["side"], 0.0)
        for t in steps:
            rot = _mat(q0 * (1 - t) + q1 * t)
            p = m0[:3, 3] * (1 - t) + m1[:3, 3] * t + rot[:, 1] * reach
            if p[2] > R.NEAR:
                q = R.project(p)
                out.append((q[0] + s0 * (1 - t) + s1 * t, q[1]))
    return out


def blended_blades(keys, t0, t1, steps=4):
    """The right hand's blade between t0 and t1 as the game blends key to key (item bone
    rotation and position interpolated): (time, guard px, tip px, direction, midpoint)."""
    t = 0.0
    for f0, f1 in zip(keys, keys[1:]):
        ta, tb = t, t + f0["tics"] * TIC
        t = tb
        if tb < t0 or ta > t1:
            continue
        a0, a1 = R.pose_frame(f0), R.pose_frame(f1)
        x0 = next(x for x in a0 if x["side"] == "R")
        x1 = next(x for x in a1 if x["side"] == "R")
        if not x0["weapon"]:
            continue
        m0, m1 = A.pose(x0)["item"], A.pose(x1)["item"]
        q0, q1 = _quat(m0[:3, :3]), _quat(m1[:3, :3])
        if np.dot(q0, q1) < 0:
            q1 = -q1
        s0, s1 = moves.slide(a0).get("R", 0.0), moves.slide(a1).get("R", 0.0)
        p = R.PROXY[x0["weapon"]]
        for k in range(steps):
            u = k / steps
            tt = ta + (tb - ta) * u
            if tt < t0 or tt > t1:
                continue
            rot = _mat(q0 * (1 - u) + q1 * u)
            d = rot[:, 1]
            pos = m0[:3, 3] * (1 - u) + m1[:3, 3] * u
            g, tip = pos + d * p["guard"], pos + d * p["tip"]
            if g[2] <= R.NEAR or tip[2] <= R.NEAR:
                continue
            sl = np.array([s0 * (1 - u) + s1 * u, 0.0])
            yield tt, R.project(g) + sl, R.project(tip) + sl, d, (g + tip) / 2


def attack_checks(cid, keys):
    """A blow's own rules: on its hit frame the blade crosses the crosshair's column, and its
    sweep there runs the way its name says (a chop within 25 degrees of straight down, a
    diagonal 35-55 degrees off it)."""
    out = []
    hit = next(i for i, f in enumerate(keys) if f.get("hit"))
    R.set_view(R.REST_SCALE)
    arms = R.pose_frame(keys[hit])
    arm = next(x for x in arms if x["side"] == "R")
    sl = moves.slide(arms).get("R", 0.0)
    p = R.PROXY[arm["weapon"]]
    xs = [R.project(arm["G"] + arm["D"] * p[j])[0] + sl for j in ("guard", "tip")]
    if not min(xs) - 6 <= R.SCREEN_W / 2 <= max(xs) + 6:
        out.append(f"blade misses the crosshair column at HIT ({min(xs):.0f}-{max(xs):.0f}px)")
    # no blow may read as a stab: through the hit, as the game blends it, the blade stays long on
    # screen and off the line of sight (a blade pointed at the eye is a short stub however it
    # moves); and the tip is moving fast as the damage lands, not parked before it
    t_hit = sum(f["tics"] for f in keys[:hit]) * TIC
    samples = list(blended_blades(keys, t_hit - 0.12, t_hit + 0.10))
    bad = set()
    for t, gp, tp, d, mid in samples:
        if t < t_hit - 0.05:
            continue
        length = np.linalg.norm(tp - gp) / R.SCREEN_H
        off = np.degrees(np.arccos(min(1.0, abs(np.dot(d, mid / np.linalg.norm(mid))))))
        if length < 0.22 or (off < 30 and length < 0.35):
            bad.add(f"{t:.2f}s blade {length:.2f} tall, {off:.0f} deg off the eye")
    out += sorted(bad)[:3]
    # (measured where it can be seen: a tip swinging past near the eye, off the screen's edge,
    # isn't a fast blow on screen)
    seen = lambda q: np.clip(q, (0, 0), (R.SCREEN_W, R.SCREEN_H))
    speed = [(t1, np.linalg.norm(seen(q1) - seen(q0)) / R.SCREEN_H / (t1 - t0) * TIC)
             for (t0, _, q0, _, _), (t1, _, q1, _, _) in zip(samples, samples[1:]) if t1 > t0]
    near = [v for t, v in speed if t_hit - 0.06 <= t <= t_hit + 0.03]   # (arriving, then parked?)
    at = max([v for t, v in speed if abs(t - t_hit) <= TIC + 1e-6] or [0])
    if near and at < 0.5 * max(near):
        out.append(f"tip slow at the hit ({at:.2f}/tic against {max(near):.2f} just before)")
    a, b = (drawn_tip(keys[j]) for j in (max(0, hit - 1), min(len(keys) - 1, hit + 1)))
    off = abs(np.degrees(np.arctan2(b[0] - a[0], b[1] - a[1])))   # degrees off straight down
    off = min(off, 180 - off)
    move = cid.split("_")[1]
    if move == "chop" and off > 25:
        out.append(f"chop sweeps {off:.0f} deg off vertical")
    if move in ("diag", "cleave") and not 35 <= off <= 55:
        out.append(f"diagonal sweeps {off:.0f} deg off vertical")
    return out


def check():
    """Every frame and every halfway between frames: a margin under the top of the screen,
    nothing that smears from behind the camera, and how far a fist falls short of where it was
    keyed (out of reach)."""
    bad = 0
    for cid, clip in moves.MOVES.items():
        keys = next(iter(clip["frames"].values()))
        frames = [x for f0, f1 in zip(keys, keys[1:]) for x in (f0, halfway(f0, f1))] + keys[-1:]
        worst_top, worst_miss, behind = 1e9, 0.0, 0
        for f in frames:
            R.set_view(f.get("view", R.REST_SCALE))
            arms = R.pose_frame(f)
            sl = moves.slide(arms)
            pts = [R.project(q) + (sl.get(arm["side"], 0.0), 0.0) for arm in arms
                   for q in fit_check.points(arm) if q[2] > R.NEAR]
            worst_top = min(worst_top, min(p[1] for p in pts))
            worst_miss = max([worst_miss] + [a["reach_miss"] for a in arms])
        for f0, f1 in zip(keys, keys[1:]):   # (and the blade as the game blends between keys)
            for q in blended_tips(f0, f1):
                worst_top = min(worst_top, q[1])
            behind += sum(q[2] <= R.NEAR for arm in arms for q in fit_check.smearable(arm))
        flag = []
        if clip["kind"] == "attack":
            flag += attack_checks(cid, keys)
        if worst_top < MARGIN:
            flag.append(f"TOO NEAR THE TOP {worst_top:.0f}px (keep {MARGIN:.0f})")
        if worst_miss > 0.015:
            flag.append(f"short {worst_miss * 100:.1f} cm")
        if behind:
            flag.append(f"{behind} pts behind camera")
        bad += bool(flag)
        print(f"  {cid:<22} top {worst_top:6.1f}  {'  '.join(flag) or 'ok'}")
    return bad


if __name__ == "__main__":
    bad = check()
    if "--check" not in sys.argv:
        for side in ("R", "L"):
            n = export_side(side, os.path.join(MODELS, "arms", f"fp_moves_{side}.glb"))
            print(f"fp_moves_{side}.glb: {n} clips")
        with open(os.path.join(MODELS, "fp_moves.json"), "w") as f:
            json.dump(catalog(), f, indent=1)
        print("wrote fp_moves.json")
    sys.exit(1 if bad and "--strict" in sys.argv else 0)
