"""One-handed maul clips: every Sword_* clip remade as Maul_* for the one-handed maul
(Weapon_MaulOneHand: the same maul, gripped CHOKE up the haft).

Per source frame the arm is corrected, then the clip is resampled slower with a hold at
each floor impact:
  droop     slow, extended holds let the heavy head sag (wrist + elbow)
  clearance where the head (or the long tail below the fist) would sink into the floor or
            through his head, horns, torso or thighs, the arm lifts by the smallest rotation
            that clears it (shoulder, elbow, wrist), eased over neighbouring frames
  off-hand  a free arm flung up behind the hump or back like a fencer's comes in toward
            the relaxed idle arm; both fists clench
  timing    played at SPEED of the sword clip, each floor impact held HOLD frames
Maul_Idle is its own: the maul stood on its head by the right foot, hand on the haft.
Run in the original (T-pose) rest, before the A-pose re-keying, like clips2h.
"""
import math

import bpy
import numpy as np
from mathutils import Matrix, Vector

from clips2h import fcurves, grips, two_bone, use, upd
from weapons import CHOKE

SPEED, HOLD = 0.75, 4
Y0 = -CHOKE                      # weapon space of the one-handed maul: the fist at the origin
HEAD_PTS = [Vector((x, y + Y0, z)) for x in (-0.15, 0.29) for y in (0.79, 1.16) for z in (-0.135, 0.135)]
HEAD_PTS += [Vector(p) + Vector((0, Y0, 0)) for p in ((-0.3, 0.94, 0), (0.07, 0.94, 0), (0.29, 0.94, 0), (-0.15, 0.94, 0),
                                                   (0.07, 0.79, 0), (0.07, 1.16, 0), (0.07, 0.94, 0.135), (0.07, 0.94, -0.135))]
TAIL_END = -0.38                         # the one-handed maul's butt, below the fist (weapons: CHOKE - 0.3 - 0.08)
TAIL_PTS = [Vector((0, TAIL_END, 0)), Vector((0, -0.2, 0))]
HAFT_PTS = [Vector((0, 0.15, 0)), Vector((0, 0.3, 0))]                # between the fist and the head
DROOP_MIN = {"Sword_Regular_B": 35}                                    # always sags at least this far
ARM_DROP = {}                                                          # (a shoulder drop tore the deltoid skin)
SHOULDER_CAP = math.radians(18)                                        # most any correction turns the upper arm
CHEST_MAX = {"Sword_Regular_B": 24}                                    # more chest lift out of the crouch
CENTRE = Vector((0.07, 0.94 + Y0, 0.0))
# body volumes as rest-space spheres riding their bones (body-sized, not padded far out
# in front of the chest)
BODYR = [("Head", (0, -0.02, 1.67), 0.15), ("Head", (0, -0.1, 1.6), 0.08), ("spine_03", (0, 0.03, 1.38), 0.22),
         ("spine_03", (0, 0.0, 1.22), 0.2), ("spine_01", (0, 0.0, 1.08), 0.2), ("pelvis", (0, 0.02, 0.95), 0.2)]
LEGS = [("thigh_l", 0.13), ("thigh_r", 0.13)]
# horns, in rest (sculpt) space: centre-line points and radii; they ride the Head bone
HORN = [((0.1, 0.006, 1.772), 0.06), ((0.228, -0.062, 1.842), 0.042), ((0.255, -0.13, 1.888), 0.035), ((0.21, -0.262, 1.978), 0.02)]
HORN = [(Vector((s * x, y, z)), r) for (x, y, z), r in HORN for s in (1, -1)]
FLOOR, MARGIN = 0.005, 0.03
LIFT = [("upperarm_r", 0.35), ("lowerarm_r", 0.35), ("hand_r", 0.3)]
DROOP = [("lowerarm_r", 0.45), ("hand_r", 0.55)]
ARM_R = ["upperarm_r", "lowerarm_r", "hand_r"]
POSTURE = ["spine_02", "spine_03", "neck_01", "Head"]
HUMP = Vector((0, 0.13, 1.47))           # top of the hump, rest space (rides spine_03)
FACE = Vector((0, -0.34, 1.64))          # in front of the snout, rest space (rides Head): keep the maul out
TIPS = [Vector((s * 0.21, -0.262, 1.978)) for s in (1, -1)] + [Vector((s * 0.255, -0.13, 1.888)) for s in (1, -1)]
ARM_L = ["upperarm_l", "lowerarm_l", "hand_l"]


def _wframe(pb, Gr):
    return pb["hand_r"].matrix @ Gr


def _clearance(ARM, pb, Gr):
    """(worst penetration, push direction, lowest head point z)."""
    W = _wframe(pb, Gr)
    hp = [W @ p for p in HEAD_PTS]
    tp = [W @ p for p in TAIL_PTS]
    c = W @ CENTRE
    push, worst, why = Vector(), 0.0, ""
    low = min(p.z for p in hp)
    g = max(0.0, FLOOR - min(low, min(p.z for p in tp)))
    if g > 0:
        push += Vector((0, 0, 1)); worst, why = g, "floor"
    Hm = pb["Head"].matrix @ ARM.data.bones["Head"].matrix_local.inverted()
    spheres = [((pb[bn].matrix @ ARM.data.bones[bn].matrix_local.inverted()) @ Vector(c), r) for bn, c, r in BODYR]
    spheres += [(Hm @ p, r) for p, r in HORN]
    for q, r in spheres:
        pen = r + MARGIN - min((p - q).length for p in hp)
        if pen > 0:
            push += (c - q).normalized()
            if pen > worst:
                worst, why = pen, "body"
    for q, r in spheres[:2] + [(Hm @ p, r) for p, r in HORN]:   # the butt end past his head and horns:
        pt = min(tp, key=lambda p: (p - q).length)                # swing the head the other way
        pen = r + MARGIN - (pt - q).length
        if pen > 0:
            push -= (pt - q).normalized()
            if pen > worst:
                worst, why = pen, "tail-head"
    # the line of sight to his face: a capsule straight out in front of it; the maul goes
    # out to the side of it, never further along it
    F0 = Hm @ Vector((0, -0.12, 1.64))
    fwd = (Hm @ Vector((0, -1.0, 1.64))) - (Hm @ Vector((0, 0.0, 1.64))); fwd.z *= 0.3; fwd.normalize()
    F1 = F0 + fwd * 1.4
    def _seg(p):
        t = max(0.0, min(1.0, (p - F0).dot(F1 - F0) / (F1 - F0).length_squared))
        return F0 + (F1 - F0) * t
    pen = 0.3 - min((p - _seg(p)).length for p in hp + [W @ q for q in HAFT_PTS])
    if pen > 0:
        side = c - _seg(c); side -= fwd * side.dot(fwd)
        if side.length < 1e-3:
            side = Hm.to_3x3() @ Vector((-1, 0, 0))   # his right
        push += side.normalized()
        if pen > worst:
            worst, why = pen, "face"
    # the butt end across his face: swing the head the other way
    tail = [W @ Vector((0, y, 0)) for y in (-0.15, -0.28, TAIL_END)]
    pt = min(tail, key=lambda p: (p - _seg(p)).length)
    pen = 0.28 - (pt - _seg(pt)).length
    if pen > 0:
        side = pt - _seg(pt); side -= fwd * side.dot(fwd)
        if side.length < 1e-3:
            side = Hm.to_3x3() @ Vector((1, 0, 0))
        push -= side.normalized()
        if pen > worst:
            worst, why = pen, "tail-face"
    for bn, r in LEGS:
        q = (pb[bn].head + pb[bn].tail) / 2
        pen = r - min((p - q).length for p in tp)
        if pen > 0:
            push += (tp[0] - q).normalized()
            if pen > worst:
                worst, why = pen, "tail-thigh"
    _clearance.why = why
    return worst, push, low


def _lift(pb, bones, theta):
    """Pitch the chain up (chest or head) by theta, shared evenly."""
    for bn in bones:
        b = pb[bn]
        piv = b.head.copy()
        v = (b.tail - b.head) if bn != bones[-1] else (b.tail - b.head)
        ax = v.cross(Vector((0, 0, 1)))
        if ax.length < 1e-6:
            continue
        b.matrix = Matrix.Translation(piv) @ Matrix.Rotation(theta / len(bones), 4, ax.normalized()) @ Matrix.Translation(-piv) @ b.matrix
        upd()


def _curl(pb, cap=15):
    """How far past 45 deg the chest pitches forward (radians, capped)."""
    v = (pb["spine_03"].tail - pb["spine_02"].head).normalized()
    tilt = math.acos(max(-1, min(1, v.z)))
    return min(math.radians(cap), max(0.0, tilt - math.radians(45)))


def _drop(pb, deg):
    """The right arm swung down at the shoulder."""
    b = pb["upperarm_r"]
    piv = b.head.copy()
    v = b.tail - b.head
    ax = v.cross(Vector((0, 0, -1)))
    if ax.length > 1e-6 and deg:
        b.matrix = Matrix.Translation(piv) @ Matrix.Rotation(math.radians(deg), 4, ax.normalized()) @ Matrix.Translation(-piv) @ b.matrix
        upd()


def _below(ARM, pb, th):
    """With the head pitched up by th: how far the horn tips sit under the top of the hump."""
    keep = {bn: pb[bn].matrix_basis.copy() for bn in ("neck_01", "Head")}
    if th > 0:
        _lift(pb, ["neck_01", "Head"], th)
    Hm = pb["Head"].matrix @ ARM.data.bones["Head"].matrix_local.inverted()
    Sm = pb["spine_03"].matrix @ ARM.data.bones["spine_03"].matrix_local.inverted()
    out = (Sm @ HUMP).z + 0.06 - max((Hm @ t).z for t in TIPS)
    for bn, m in keep.items():
        pb[bn].matrix_basis = m
    upd()
    return out


def _rotate(pb, Gr, theta, push, shares):
    """Turn the arm by theta (radians) so the maul head moves toward push."""
    spill = 0.0
    for bn, share in shares:
        b = pb[bn]
        piv = b.head.copy()
        ang = theta * share + spill
        if bn == "upperarm_r" and ang > SHOULDER_CAP:      # past this the deltoid folds: elbow and wrist take the rest
            spill, ang = ang - SHOULDER_CAP, SHOULDER_CAP
        else:
            spill = 0.0
        v = (_wframe(pb, Gr) @ CENTRE) - piv
        ax = v.cross(push)
        if ax.length < 0.2 * v.length * max(push.length, 1e-6):
            ax = v.cross(Vector((0, -1, 0)))
        if ax.length < 1e-6:
            continue
        b.matrix = Matrix.Translation(piv) @ Matrix.Rotation(ang, 4, ax.normalized()) @ Matrix.Translation(-piv) @ b.matrix
        upd()


def _search(fn, worst0, step=6, top=17):
    """Smallest angle (radians) with fn(angle) <= 0, else the best found."""
    if worst0 <= 0:
        return 0.0
    lo, hi, best = 0.0, None, (worst0, 0.0)
    for k in range(1, top + 1):
        th = math.radians(step * k)
        v = fn(th)
        if v < best[0]:
            best = (v, th)
        if v <= 0:
            hi = th
            break
        lo = th
    if hi is None:
        return best[1]
    for _ in range(4):
        mid = (lo + hi) / 2
        if fn(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return hi


def _smooth(a, sigma=1.0, floor=None):
    k = np.exp(-0.5 * (np.arange(-3, 4) / sigma) ** 2); k /= k.sum()
    s = np.convolve(np.pad(a, 3, mode="edge"), k, mode="valid")
    return np.maximum(s, floor) if floor is not None else s


def _write(src, name, times, rec):
    """New action: every channel resampled at the source times, corrected bones from rec."""
    act = src.copy()
    act.name = name
    act.use_fake_user = True
    for fc in fcurves(act):
        path = fc.data_path
        vals = None
        if path.endswith("rotation_quaternion") and '"' in path:
            bn = path.split('"')[1]
            if bn in rec:
                vals = [q[fc.array_index] for q in rec[bn]]
        if vals is None:
            vals = [fc.evaluate(t) for t in times]       # (fc is a copy of the source curve)
        kp = fc.keyframe_points
        kp.clear()
        kp.add(len(times))
        co = np.empty(2 * len(times)); co[0::2] = np.arange(len(times)); co[1::2] = vals
        kp.foreach_set("co", co)
        fc.update()
    act.use_frame_range = False
    return act


def _record(pb, bones, rec):
    for bn in bones:
        q = pb[bn].rotation_quaternion.copy()
        prev = rec.setdefault(bn, [])
        if prev and prev[-1].dot(q) < 0:
            q.negate()
        prev.append(q)


def author(ARM, scene, log=print):
    ARM.data.pose_position = "POSE"
    ad = ARM.animation_data
    mutes = [(t, t.mute) for t in ad.nla_tracks]
    for t, _ in mutes:
        t.mute = True
    G, fist = grips(ARM, scene)
    Gr = G["r"]
    pb = ARM.pose.bones
    use(ARM, bpy.data.actions["Idle_Loop"]); scene.frame_set(10); upd()
    rest_l = {bn: pb[bn].rotation_quaternion.copy() for bn in ARM_L}
    fingers = list(fist)
    keep = ARM_R + ARM_L + fingers + POSTURE
    made = []

    def fists():
        for bn, q in fist.items():
            pb[bn].rotation_quaternion = q
        upd()

    for srcname in sorted(a.name for a in bpy.data.actions if a.name.startswith("Sword_") and a.name not in ("Sword_Idle", "Sword_Block")):
        src = bpy.data.actions[srcname]
        use(ARM, src)
        f0, f1 = (int(round(x)) for x in src.frame_range)
        n = f1 - f0 + 1
        # raw head path, for speed (a slow, extended hold should sag)
        heads = []
        for f in range(f0, f1 + 1):
            scene.frame_set(f); upd()
            heads.append((_wframe(pb, Gr) @ CENTRE).copy())
        spd = [((heads[min(i + 1, n - 1)] - heads[max(i - 1, 0)]).length / 2) for i in range(n)]
        chest = np.zeros(n); hd = np.zeros(n)
        for i, f in enumerate(range(f0, f1 + 1)):
            scene.frame_set(f); upd()
            chest[i] = _curl(pb, CHEST_MAX.get(srcname, 15))
            if chest[i] > 0:
                _lift(pb, ["spine_02", "spine_03"], chest[i])
            hd[i] = _search(lambda th: _below(ARM, pb, th), _below(ARM, pb, 0.0), step=5, top=8)
        chest = _smooth(chest, 1.5); hd = _smooth(hd, 1.2, hd)
        dro = np.zeros(n); cle = np.zeros(n); offw = np.zeros(n); low = np.zeros(n); tally = {}
        push = [Vector() for _ in range(n)]
        for i, f in enumerate(range(f0, f1 + 1)):
            scene.frame_set(f); upd(); fists()
            if chest[i] > 1e-4:
                _lift(pb, ["spine_02", "spine_03"], chest[i])
            if hd[i] > 1e-4:
                _lift(pb, ["neck_01", "Head"], hd[i])
            _drop(pb, ARM_DROP.get(srcname, 0))
            base = {bn: pb[bn].matrix_basis.copy() for bn in ARM_R}

            def reset():
                for bn in ARM_R:
                    pb[bn].matrix_basis = base[bn]
                upd()
            # droop
            W = _wframe(pb, Gr); d = W.col[1].xyz.normalized()
            reach = ((W @ CENTRE) - pb["spine_03"].head); reach.z = 0
            elev = math.asin(max(-1, min(1, d.z)))
            slow = min(1, max(0, (0.06 - spd[i]) / 0.03)); far = min(1, max(0, (reach.length - 0.32) / 0.15))
            dro[i] = min(math.radians(50), max(0, elev - math.radians(-35))) * slow * far
            if srcname in DROOP_MIN:
                dro[i] = max(dro[i], min(math.radians(50), max(0, elev + math.radians(DROOP_MIN[srcname]))))
            if dro[i] > 0:
                _rotate(pb, Gr, dro[i], Vector((0, 0, -1)), DROOP)
            base2 = {bn: pb[bn].matrix_basis.copy() for bn in ARM_R}
            worst, ps, low[i] = _clearance(ARM, pb, Gr)
            if worst > 0:
                tally[_clearance.why] = tally.get(_clearance.why, 0) + 1
                push[i] = ps.normalized()

                right = (pb["Head"].matrix.to_3x3() @ ARM.data.bones["Head"].matrix_local.to_3x3().inverted()) @ Vector((-1, 0, 0))
                right.z = 0
                cands = [push[i], (push[i] + right.normalized()).normalized(), Vector((0, 0, 1)), right.normalized()]
                best = None
                for cd in cands:
                    def viol(th, cd=cd):
                        for bn in ARM_R:
                            pb[bn].matrix_basis = base2[bn]
                        upd()
                        _rotate(pb, Gr, th, cd, LIFT)
                        return _clearance(ARM, pb, Gr)[0]
                    th = _search(viol, worst)
                    res = viol(th)
                    key = (res > 1e-3, res, th)
                    if best is None or key < best[0]:
                        best = (key, th, cd)
                cle[i], push[i] = best[1], best[2]
            reset()
            # off-hand flung up behind the hump or back: bring it in
            hl, sh, s3 = pb["hand_l"].head, pb["upperarm_l"].head, pb["spine_03"].head
            offw[i] = 0.85 * min(1, max(0, (hl.z - sh.z) / 0.15, (hl.y - s3.y - 0.08) / 0.15))
        dro = _smooth(dro); cle = _smooth(cle, 1.0, cle); offw = _smooth(offw, 1.5)
        idx = [i for i in range(n) if push[i].length > 0]
        for i in range(n):
            if push[i].length == 0 and idx:
                push[i] = push[min(idx, key=lambda j: abs(j - i))]
        # timing: slower, and every floor impact held
        hits = [f0 + i for i in range(1, n) if low[i] <= FLOOR + 0.03 < low[i - 1]]
        times, t = [], float(f0)
        while t <= f1 + 1e-6:
            times.append(t)
            for h in hits:
                if t < h <= t + SPEED:
                    times += [float(h)] * HOLD
            t += SPEED
        rec = {}
        resid = 0.0
        for t in times:
            fi = int(math.floor(t)); fr = t - fi
            scene.frame_set(fi, subframe=fr); upd(); fists()
            j = min(n - 1, max(0, int(round(t)) - f0))
            tc = float(np.interp(t - f0, np.arange(n), chest)); th_h = float(np.interp(t - f0, np.arange(n), hd))
            if tc > 1e-4:
                _lift(pb, ["spine_02", "spine_03"], tc)
            if th_h > 1e-4:
                _lift(pb, ["neck_01", "Head"], th_h)
            _drop(pb, ARM_DROP.get(srcname, 0))
            th_d = float(np.interp(t - f0, np.arange(n), dro)); th_c = float(np.interp(t - f0, np.arange(n), cle))
            if th_d > 1e-4:
                _rotate(pb, Gr, th_d, Vector((0, 0, -1)), DROOP)
            if th_c > 1e-4 and push[j].length > 0:
                _rotate(pb, Gr, th_c, push[j], LIFT)
            w = float(np.interp(t - f0, np.arange(n), offw))
            if w > 1e-3:
                for bn in ARM_L:
                    pb[bn].rotation_quaternion = pb[bn].rotation_quaternion.slerp(rest_l[bn], w)
                upd()
            resid = max(resid, _clearance(ARM, pb, Gr)[0])
            _record(pb, keep, rec)
        act = _write(src, "Maul_" + srcname[len("Sword_"):], times, rec)
        made.append(act)
        log("  maul clip %-20s %3d -> %3d frames, %d impacts held, chest %2.0f head %2.0f droop %2.0f lift %2.0f deg, off-hand %.2f, left over %.3f %s" % (
            act.name, n, len(times), len(hits), math.degrees(chest.max()), math.degrees(hd.max()), math.degrees(dro.max()), math.degrees(cle.max()), offw.max(), resid, tally))

    # idle: the maul stood on its head by the right foot, the hand resting on the haft
    src = bpy.data.actions["Idle_Loop"]
    act = src.copy(); act.name = "Maul_Idle"; act.use_fake_user = True
    use(ARM, act)
    d = Vector((-0.06, -0.33, -0.94)).normalized()
    X = Vector((0, 0, -1)); X = (X - d * X.dot(d)).normalized()
    Wl = Matrix((X, d, X.cross(d))).transposed().to_4x4()
    lowest = min((Wl @ p).z for p in HEAD_PTS)
    Wl.translation = Vector((-0.31, -0.2, FLOOR - lowest))
    f0, f1 = (int(round(x)) for x in src.frame_range)
    for f in range(f0, f1 + 1):
        scene.frame_set(f); upd()
        two_bone(ARM, "r", Wl @ Gr.inverted(), (-0.5, 0.5, -0.4))
        fists()
        for bn in ARM_R + fingers:
            pb[bn].keyframe_insert("rotation_quaternion", frame=f)
    made.append(act)
    log("  maul clip Maul_Idle            fist at %.2f m, head on the floor" % Wl.translation.z)

    # block: haft presented diagonally across the chest a forearm's length out, head up by the
    # left shoulder, the left hand behind the haft just under the head; rides the chest
    src = bpy.data.actions["Sword_Block"]
    act = src.copy(); act.name = "Maul_Block"; act.use_fake_user = True
    use(ARM, act)
    f0, f1 = (int(round(x)) for x in src.frame_range)
    scene.frame_set(f0); upd()
    d = Vector((0.76, -0.08, 0.6)).normalized()
    X = Vector((0, -1, 0)); X = (X - d * X.dot(d)).normalized()
    Wb = Matrix((X, d, X.cross(d))).transposed().to_4x4()
    Wb.translation = Vector((-0.25, -0.42, 0.95))
    rel = pb["spine_03"].matrix.inverted() @ Wb
    for f in range(f0, f1 + 1):
        scene.frame_set(f); upd()
        W = pb["spine_03"].matrix @ rel
        two_bone(ARM, "r", W @ Gr.inverted(), (-0.5, 0.5, -0.5))
        two_bone(ARM, "l", W @ Matrix.Translation((0, 0.36, 0)) @ G["l"].inverted(), (0.6, 0.3, -0.5))
        fists()
        for bn in ARM_R + ARM_L + fingers:
            pb[bn].keyframe_insert("rotation_quaternion", frame=f)
    made.append(act)
    log("  maul clip Maul_Block           two hands, haft across the chest")
    ad.action = None
    for t, m in mutes:
        t.mute = m
    for b in pb:
        b.matrix_basis = Matrix.Identity(4)
    return made
