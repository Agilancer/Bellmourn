"""Two-handed weapon clips for the brute, authored on the UAL rig (neither UAL pack has any).

Both hands are put on one weapon frame every frame by an analytic two-bone IK, so the haft
never slips out of either fist; the legs, hips and breathing come from existing clips. The
weapon frame W (armature space): origin at the right fist, +Y up the haft to the head, +X the
way the striking face (hammer) or edge (axe) points. The right fist sits at haft 0, the left at
haft `lo` (negative = nearer the pommel).

  TwoHand_Idle_Loop    weapon held across the body (Idle_Loop underneath)
  TwoHand_Walk_Loop    the same hold on Walk_Loop
  TwoHand_Attack_Slam  overhead wind-up, smash into the ground ahead
  TwoHand_Attack_Sweep wind-up over the right shoulder, sweep across to the left
"""
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

FINGERS = ("index", "middle", "ring", "pinky", "thumb")


def fcurves(act):
    out = []
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for cb in getattr(strip, "channelbags", []):
                out.extend(cb.fcurves)
    return out


def use(ARM, act):
    ad = ARM.animation_data or ARM.animation_data_create()
    ad.action = act
    if hasattr(ad, "action_slot") and ad.action_slot is None and len(act.slots):
        ad.action_slot = act.slots[0]


def upd():
    bpy.context.view_layer.update()


def frame(o, x, y):
    """4x4 with origin o, X along x, Y along y (re-orthogonalised)."""
    y = Vector(y).normalized()
    x = (Vector(x) - y * Vector(x).dot(y)).normalized()
    z = x.cross(y)
    M = Matrix((x, y, z)).transposed().to_4x4()
    M.translation = Vector(o)
    return M


def grips(ARM, scene):
    """Each fist's weapon frame in its hand bone's local space, and the fist's finger pose,
    read off Punch_Jab (both hands clenched)."""
    use(ARM, bpy.data.actions["Punch_Jab"])
    scene.frame_set(0); upd()
    pb = ARM.pose.bones
    G, fist = {}, {}
    for s in ("l", "r"):
        Mh = pb["hand_" + s].matrix
        k1 = sum((pb[f"{f}_01_{s}"].head for f in FINGERS[:4]), Vector()) / 4
        k2 = sum((pb[f"{f}_02_{s}"].tail for f in FINGERS[:4]), Vector()) / 4
        g = k1 * 0.4 + k2 * 0.6                                   # inside the curled fingers
        a = (pb[f"index_01_{s}"].head - pb[f"pinky_01_{s}"].head).normalized()  # haft, toward the thumb
        W = frame(g, Mh.col[1].xyz, a)
        G[s] = Mh.inverted() @ W
        for f in FINGERS:
            for j in ("01", "02", "03", "04_leaf"):
                b = pb.get(f"{f}_{j}_{s}")
                if b is not None:
                    fist[b.name] = b.rotation_quaternion.copy()
    return G, fist


def two_bone(ARM, s, Mh, pole, chain=("upperarm_", "lowerarm_", "hand_")):
    """Upper and lower limb swung (no twist) so the end bone lands on matrix Mh."""
    pb = ARM.pose.bones
    u, l, h = pb[chain[0] + s], pb[chain[1] + s], pb[chain[2] + s]
    for b in (u, l, h):
        b.matrix_basis = Matrix.Identity(4)
    upd()
    S = u.head.copy()
    L1, L2 = u.bone.length, l.bone.length
    T = Mh.translation
    dv = T - S
    dist = min(max(dv.length, abs(L1 - L2) + 1e-3), (L1 + L2) * 0.999)
    ud = dv.normalized()
    a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist)
    hgt = math.sqrt(max(L1 * L1 - a * a, 0.0))
    pv = Vector(pole) - ud * Vector(pole).dot(ud)
    pv = pv.normalized() if pv.length > 1e-6 else Vector((0, 0, -1))
    E = S + ud * a + pv * hgt
    Tn = S + ud * dist

    def swing(b, pivot, target):
        M0 = b.matrix.copy()
        R = M0.col[1].xyz.normalized().rotation_difference((target - pivot).normalized()).to_matrix().to_4x4()
        b.matrix = Matrix.Translation(pivot) @ R @ Matrix.Translation(-pivot) @ M0
        upd()

    swing(u, S, E)
    swing(l, l.head.copy(), Tn)
    M = Mh.copy(); M.translation = Tn
    h.matrix = M
    upd()


def bend(ARM, name, axis, deg):
    """Rotate a bone about its head by deg round an armature-space axis, on top of its pose."""
    b = ARM.pose.bones[name]
    p = b.head.copy()
    R = Matrix.Rotation(math.radians(deg), 4, axis)
    b.matrix = Matrix.Translation(p) @ R @ Matrix.Translation(-p) @ b.matrix
    upd()


def ease(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def keyed(t, keys):
    """Interpolate a list of (time, value) keys (eased); values are tuples of numbers."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            e = ease((t - t0) / (t1 - t0))
            return tuple(a + (b - a) * e for a, b in zip(v0, v1))
    return keys[-1][1]


SPINE_KEYS = ("spine_01", "spine_02", "spine_03", "neck_01", "Head", "pelvis")
LEG_BONES = [f"{p}_{s}" for s in ("l", "r") for p in ("thigh", "calf", "foot")]
ARM_BONES = [f"{p}_{s}" for s in ("l", "r") for p in ("upperarm", "lowerarm", "hand")]


def author(ARM, scene, G, fist, name, base, n, pose_at, hold_rel=None):
    act = bpy.data.actions[base].copy()
    act.name = name
    act.use_fake_user = True
    use(ARM, act)
    pb = ARM.pose.bones
    for f in range(n + 1):
        scene.frame_set(f); upd()
        W, lo, poles, bends = pose_at(f)[:4]
        crouch, twist = (pose_at(f)[4] if len(pose_at(f)) > 4 else (0.0, 0.0))
        if crouch or twist:                       # drop / turn the hips, feet stay planted (leg IK)
            feet = {s: pb["foot_" + s].matrix.copy() for s in ("l", "r")}
            pv = pb["pelvis"]; hp = pv.head.copy()
            pv.matrix = Matrix.Translation((0, 0, -crouch)) @ Matrix.Translation(hp) @ Matrix.Rotation(math.radians(twist), 4, "Z") @ Matrix.Translation(-hp) @ pv.matrix
            upd()
            for s, sx in (("l", 1), ("r", -1)):
                two_bone(ARM, s, feet[s], (sx * 0.15, -1.0, 0.1), ("thigh_", "calf_", "foot_"))
        for bone, axis, deg in bends:
            bend(ARM, bone, axis, deg)
        if hold_rel is not None:                                # the hold rides the chest
            W = pb["spine_03"].matrix @ hold_rel
        two_bone(ARM, "r", W @ G["r"].inverted(), poles[0])
        WL = W @ Matrix.Translation((0, lo, 0))
        two_bone(ARM, "l", WL @ G["l"].inverted(), poles[1])
        for bn, q in fist.items():
            pb[bn].rotation_quaternion = q
        for bn in list(SPINE_KEYS) + ARM_BONES + LEG_BONES + list(fist):
            pb[bn].keyframe_insert("rotation_quaternion", frame=f)
        pb["pelvis"].keyframe_insert("location", frame=f)
        if f % 10 == 0:
            print("  [2H]", name, f, flush=True)
    for fc in fcurves(act):                                     # drop the base clip's tail
        for kp in [k for k in fc.keyframe_points if k.co[0] > n + 0.5][::-1]:
            fc.keyframe_points.remove(kp)
    return act


def author_all(ARM, scene, log=print):
    ARM.data.pose_position = "POSE"
    ad = ARM.animation_data
    mutes = [(t, t.mute) for t in ad.nla_tracks]
    for t, _ in mutes:
        t.mute = True
    G, fist = grips(ARM, scene)
    pb = ARM.pose.bones
    POLE_R, POLE_L = (-0.45, 0.6, -0.65), (0.45, 0.6, -0.65)

    # the hold: right fist low at the right hip, haft up across the body, head by the left shoulder
    use(ARM, bpy.data.actions["Idle_Loop"]); scene.frame_set(0); upd()
    d_hold = Vector((-0.5, 0.36, 0.79)).normalized()          # haft leaning out over the right shoulder
    _W0 = frame((-0.24, -0.26, 1.18), Vector((-1, -0.35, 0.1)), d_hold)
    _x0, _z0 = _W0.col[0].xyz, _W0.col[2].xyz
    _rl = math.radians(62)                                     # rolled: the broad face shows, not the edge
    W_hold = frame((-0.24, -0.26, 1.18), _x0 * math.cos(_rl) + _z0 * math.sin(_rl), d_hold)
    hold_rel = pb["spine_03"].matrix.inverted() @ W_hold
    hold = lambda f: (None, -0.28, (POLE_R, POLE_L), [("neck_01", "X", -9.0), ("Head", "X", -7.0)])
    out = [author(ARM, scene, G, fist, "TwoHand_Idle_Loop", "Idle_Loop", 60, hold, hold_rel),
           author(ARM, scene, G, fist, "TwoHand_Walk_Loop", "Walk_Loop", 32, hold, hold_rel)]

    def swing_pose(keys, plane, f):
        (px, py, pz, dx, dy, dz, lo, b1, b2, tw, cr, ht) = keyed(f, keys)
        d = Vector((dx, dy, dz)).normalized()
        s = Vector(plane).cross(d)
        W = frame((px, py, pz), s, d)
        bends = [("spine_02", "X", b1), ("spine_03", "X", b2), ("spine_02", "Z", tw * 0.5), ("spine_03", "Z", tw * 0.5)]
        poles = (POLE_R, POLE_L) if pz < 1.5 else ((-0.6, -0.2, 0.4), (0.6, -0.2, 0.4))
        return W, lo, poles, bends, (cr, ht)

    h = (-0.24, -0.26, 1.18) + tuple(d_hold) + (-0.28, 0.0, 0.0, 0.0, 0.0, 0.0)
    slam = [(0, h),
            (13, (-0.3, 0.12, 1.66, -0.48, 0.62, 0.62, -0.42, -10.0, -10.0, -10.0, 0.0, -12.0)),  # wound up behind the right shoulder
            (19, (0.0, -0.37, 0.73, 0.0, -0.87, -0.5, -0.47, 44.0, 30.0, 0.0, 0.21, 0.0)),    # smash: hands spread, haft low, head at his feet
            (23, (0.0, -0.38, 0.72, 0.0, -0.87, -0.49, -0.47, 46.0, 31.0, 0.0, 0.22, 0.0)),    # held in the ground
            (40, h)]
    out.append(author(ARM, scene, G, fist, "TwoHand_Attack_Slam", "Idle_Loop", 40,
                      lambda f: swing_pose(slam, (1, 0, 0), f)))
    sweep = [(0, h),
             (12, (-0.42, 0.04, 1.32, -0.55, 0.76, 0.3, -0.36, -4.0, -4.0, -40.0, 0.03, -22.0)),  # wound up, hips turned away
             (19, (0.22, -0.42, 1.12, 0.72, -0.66, 0.05, -0.36, 10.0, 6.0, 30.0, 0.07, 14.0)),    # through the front, hips leading
             (24, (0.44, -0.06, 1.08, 0.82, 0.52, -0.1, -0.36, 12.0, 6.0, 46.0, 0.06, 26.0)),     # follow-through left
             (40, h)]
    out.append(author(ARM, scene, G, fist, "TwoHand_Attack_Sweep", "Idle_Loop", 40,
                      lambda f: swing_pose(sweep, (0, 0, 1), f)))
    ad.action = None
    for t, m in mutes:
        t.mute = m
    for b in pb:
        b.matrix_basis = Matrix.Identity(4)
    log("2H clips:", ", ".join(f"{a.name} ({int(a.frame_range[1])}f)" for a in out))
    return G
