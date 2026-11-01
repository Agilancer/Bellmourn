"""Each beast man's own clips, authored onto the merged UAL rig before it is re-bound to the A-pose.

A clip is cut from existing UAL clips (re-timed, chained, cross-faded), then reshaped in
armature space: bones turned about their own heads on world axes (+X bends forward: the
creature faces -Y), one arm mirrored onto the other, poses of other clips blended in by weight
envelopes, claws opened. Every bone is keyed on every frame. UAL clips are in place; so are these
(the game moves the body).

Goat (the ram): Goat_Ram_Charge (head down, horns first, a toss up through the target at the
end), Goat_Hammer (rears back with both fists over the horns, then slams fists and horns down
together), Goat_Leap (deep crouch, launch, hooves tucked, horns first in the air, landing low).
"""
import math

import bpy
from mathutils import Matrix

CLAW = ("thumb_", "index_", "middle_", "ring_", "pinky_")
SPINE = ("pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head")
ARMB = ("clavicle_", "upperarm_", "lowerarm_", "hand_")


def _assign(ARM, act):
    ad = ARM.animation_data or ARM.animation_data_create()
    ad.action = act
    if act is not None and hasattr(ad, "action_slot") and ad.action_slot is None and len(act.slots):
        ad.action_slot = act.slots[0]


def _reset(ARM):
    for pb in ARM.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)


def sample(ARM, scene, name, f):
    """Local pose {bone: (location, quaternion)} of clip `name` at (fractional) frame f."""
    _reset(ARM)
    _assign(ARM, bpy.data.actions[name])
    fi = int(math.floor(f))
    scene.frame_set(fi, subframe=f - fi)
    out = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in ARM.pose.bones}
    _assign(ARM, None)
    return out


def blend(A, B, w, only=None):
    out = dict(A)
    for k in B:
        if only is None or k.startswith(only):
            out[k] = (A[k][0].lerp(B[k][0], w), A[k][1].slerp(B[k][1], w))
    return out


def put(ARM, pose):
    for pb in ARM.pose.bones:
        loc, q = pose[pb.name]
        pb.rotation_mode = "QUATERNION"
        pb.location = loc
        pb.rotation_quaternion = q


def turn(ARM, bone, axis, deg):
    """Turn a bone (and so its children) about its head on an armature-space axis."""
    if abs(deg) < 1e-3:
        return
    bpy.context.view_layer.update()
    pb = ARM.pose.bones[bone]
    M = pb.matrix.copy(); h = M.translation.copy()
    ax = {"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}.get(axis, axis)
    pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, ax) @ Matrix.Translation(-h) @ M


def mirror_arm(ARM, src="r", dst="l"):
    """The dst arm becomes the mirror image (across the body's mid-plane) of the src arm."""
    S = Matrix.Scale(-1, 4, (1, 0, 0))
    chain = [b.name[:-1] for b in ARM.data.bones if b.name.endswith("_" + src) and
             any(b.name.startswith(p) for p in ARMB + CLAW)]
    order = sorted(chain, key=lambda n: len(ARM.data.bones[n + src].parent_recursive))
    for n in order:
        bpy.context.view_layer.update()
        ARM.pose.bones[n + dst].matrix = S @ ARM.pose.bones[n + src].matrix @ S


def symmetric_spine(ARM, w=1.0):
    """Take the twist and lean out of the spine (a blend toward the mirror of itself)."""
    for b in SPINE:
        pb = ARM.pose.bones[b]
        q = pb.rotation_quaternion.copy()
        qm = q.copy(); qm.y, qm.z = -q.y, -q.z           # bones along the mid-plane: mirror flips y, z
        qs = q.slerp(qm, 0.5)
        pb.rotation_quaternion = q.slerp(qs, w)


def claws(ARM, w):
    """Open the hands into claws: fingers straightened out of the fist by w."""
    for pb in ARM.pose.bones:
        if pb.name.startswith(CLAW):
            q = pb.rotation_quaternion.copy()
            pb.rotation_quaternion = q.slerp(q.__class__((1, 0, 0, 0)), w * 0.8)


def env(t, pts):
    """Piecewise smooth envelope through (t, value) points."""
    if t <= pts[0][0]:
        return pts[0][1]
    for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
        if t <= t1:
            s = (t - t0) / max(t1 - t0, 1e-6)
            s = s * s * (3 - 2 * s)
            return v0 + (v1 - v0) * s
    return pts[-1][1]


def timemap(f, pts):
    """New frame -> source frame, piecewise linear through (new, source) points."""
    for (a0, b0), (a1, b1) in zip(pts, pts[1:]):
        if f <= a1:
            return b0 + (b1 - b0) * (f - a0) / max(a1 - a0, 1e-6)
    return pts[-1][1]


def bake(ARM, name, frames, log):
    """frames: list of local poses, one per frame from 0. Keys every bone on every frame."""
    act = bpy.data.actions.get(name) or bpy.data.actions.new(name)
    act.use_fake_user = True
    _reset(ARM)
    _assign(ARM, act)
    prev = {}
    for f, pose in enumerate(frames):
        for pb in ARM.pose.bones:
            loc, q = pose[pb.name]
            q = q.copy()
            if pb.name in prev and prev[pb.name].dot(q) < 0:
                q.negate()
            prev[pb.name] = q
            pb.location = loc
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f, group=pb.name)
            pb.keyframe_insert("location", frame=f, group=pb.name)
    _assign(ARM, None)
    _reset(ARM)
    log("clip", name, len(frames), "frames")
    return act


def readback(ARM):
    bpy.context.view_layer.update()
    return {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in ARM.pose.bones}



def two_bone(ARM, s, Mh, pole, chain=("upperarm_", "lowerarm_", "hand_")):
    """Analytic two-bone IK (as tools/creatures/brute_ual/clips2h.py): the upper and lower limb
    swung, no twist, so the end bone lands on armature-space matrix Mh; the knee/elbow toward pole."""
    from mathutils import Vector
    pb = ARM.pose.bones
    u, l, h = pb[chain[0] + s], pb[chain[1] + s], pb[chain[2] + s]
    for b in (u, l, h):
        b.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
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
        bpy.context.view_layer.update()

    swing(u, S, E)
    swing(l, l.head.copy(), Tn)
    M = Mh.copy(); M.translation = Tn
    h.matrix = M
    bpy.context.view_layer.update()


def feet_of(ARM):
    bpy.context.view_layer.update()
    return {s: ARM.pose.bones["foot_" + s].matrix.copy() for s in ("l", "r")}


def plant(ARM, feet):
    """Legs re-solved so the hooves stay where they were (after the hips moved)."""
    for s, sx in (("l", 1), ("r", -1)):
        two_bone(ARM, s, feet[s], (sx * 0.15, -1.0, 0.1), ("thigh_", "calf_", "foot_"))


LEGS = ("pelvis", "thigh_", "calf_", "foot_", "ball_", "spine_01", "spine_02")


# ---------------------------------------------------------------------------------------- goat

def goat_ram(ARM, sc, log):
    """Head down, horns first, a long low charge (Sword_Dash's lunge, held), then the toss: neck
    and head snap up through whatever the horns hit. Arms trail back along the body."""
    T = [(0, 0), (8, 3), (12, 6), (15, 9), (31, 24), (35, 27), (48, 37)]
    hang = sample(ARM, sc, "Idle_Loop", 10)
    frames = []
    for f in range(49):
        g = timemap(f, T)
        pose = sample(ARM, sc, "Sword_Dash", g)
        w = env(f, [(0, 0), (12, 1), (33, 1), (44, 0)])
        pose = blend(pose, hang, w, only=ARMB + CLAW)
        put(ARM, pose)
        for s, sg in (("l", 1), ("r", -1)):
            # hanging off a torso pitched into the charge, the arms already trail back along it
            # (any swing back on top lifts them over the shoulders)
            turn(ARM, "upperarm_" + s, "X", -10 * w)
            turn(ARM, "upperarm_" + s, "Y", -sg * 18 * w)           # flared out
            turn(ARM, "lowerarm_" + s, "X", -30 * w)                # elbows bent, claws forward
        bend = env(f, [(0, 0), (12, 1), (31, 1), (36, 0.2), (48, 0)])
        toss = env(f, [(30, 0), (33, 1), (38, 0.7), (47, 0)])
        turn(ARM, "spine_02", "X", 8 * bend)
        turn(ARM, "spine_03", "X", -11 * bend - 14 * toss)           # shoulders dropped below the head line
        turn(ARM, "neck_01", "X", -28 * bend - 30 * toss)            # neck thrust far out ahead of the shoulders
        turn(ARM, "Head", "X", 36 * bend - 45 * toss)               # brow and horns square to the target, then hooked up
        claws(ARM, w)
        frames.append(readback(ARM))
    return bake(ARM, "Goat_Ram_Charge", frames, log)


def goat_hammer(ARM, sc, log):
    """Rears up with both fists high behind the horns (held: the tell), then drops into a squat
    and drives both clenched fists together into the ground in front of its hooves, horns up and
    forward over them, and holds the follow-through (OverhandThrow, the throwing arm mirrored onto
    the other, the twist taken out; hips from Jump_Land's squat with the hooves kept planted;
    fists placed by IK)."""
    T = [(0, 0), (12, 6), (24, 6.6), (28, 12), (37, 15), (52, 32)]
    squat = sample(ARM, sc, "Jump_Land", 6)
    fist = {k: v for k, v in sample(ARM, sc, "Punch_Jab", 0).items() if k.startswith(CLAW)}
    frames = []
    for f in range(53):
        g = timemap(f, T)
        pose = sample(ARM, sc, "OverhandThrow", g)
        put(ARM, pose)
        symmetric_spine(ARM, 1.0)
        bpy.context.view_layer.update()
        mirror_arm(ARM, "r", "l")
        rear = env(f, [(0, 0), (11, 1), (24, 1), (27, 0), (52, 0)])      # the tell: held half a second
        slam = env(f, [(23, 0), (27, 1), (37, 1), (49, 0)])
        sink = env(f, [(27, 0), (31, 1), (37, 1), (49, 0)])              # the follow-through sinks a little more
        feet = feet_of(ARM)
        cur = readback(ARM)
        put(ARM, blend(cur, squat, 0.9 * slam, only=LEGS))
        plant(ARM, feet)
        dip = env(f, [(28, 0), (29, 1), (31, 0.3), (34, 0)])            # the horns join the blow
        turn(ARM, "spine_01", "X", -12 * rear + 18 * slam + 5 * sink)    # chest thrown down over the fists
        turn(ARM, "spine_02", "X", 4 * slam)
        turn(ARM, "spine_03", "X", -8 * rear)
        turn(ARM, "neck_01", "X", -14 * rear - 28 * slam)              # head up over the fists, horns forward
        turn(ARM, "Head", "X", -18 * rear - 4 * slam + 18 * dip)
        if slam > 1e-3:
            bpy.context.view_layer.update()
            for s_, sx in (("l", 1), ("r", -1)):
                Mh = ARM.pose.bones["hand_" + s_].matrix.copy()
                sh = ARM.pose.bones["upperarm_" + s_].head
                # fists together ahead of the horns, on the ground line, within reach of the shoulder
                want = sh.__class__((sx * 0.07, sh.y - 0.36, max(0.14, sh.z - 0.4) - 0.03 * sink))
                tgt = Mh.translation.lerp(want, slam)
                M = Mh.copy(); M.translation = tgt
                two_bone(ARM, s_, M, (sx * 1.0, 0.6, 0.0))
        cur = readback(ARM)
        cur = blend(cur, {**cur, **fist}, max(slam, 0.4 * rear), only=CLAW)    # fists clenched for the blow
        put(ARM, cur)
        frames.append(readback(ARM))
    return bake(ARM, "Goat_Hammer", frames, log)


def goat_leap(ARM, sc, log):
    """Anticipation crouch with the arms swung back, a stretched launch, a horns-first pounce in
    the air with the claws reaching, a landing on spread arms, the recovery. Built from
    Jump_Start, NinjaJump's tuck and Jump_Land."""
    tuck = sample(ARM, sc, "NinjaJump_Idle_Loop", 20)
    keys = [(0, sample(ARM, sc, "Jump_Start", 0)), (10, sample(ARM, sc, "Jump_Start", 0)),
            (14, sample(ARM, sc, "Jump_Start", 4)), (19, blend(sample(ARM, sc, "Jump_Land", 0), tuck, 0.35)),
            (26, blend(sample(ARM, sc, "Jump_Land", 0), tuck, 0.2)), (30, sample(ARM, sc, "Jump_Land", 3))]
    frames = []
    for f in range(56):
        if f >= 30:
            pose = sample(ARM, sc, "Jump_Land", timemap(f, [(30, 3), (36, 6), (55, 30)]))
        else:
            for (a0, p0), (a1, p1) in zip(keys, keys[1:]):
                if f <= a1:
                    s = (f - a0) / (a1 - a0)
                    pose = blend(p0, p1, s * s * (3 - 2 * s))
                    break
        put(ARM, pose)
        coil = env(f, [(0, 0.3), (8, 1), (11, 1), (13, 0)])
        launch = env(f, [(10, 0), (14, 1), (17, 0.4), (20, 0)])
        air = env(f, [(14, 0), (18, 1), (26, 1), (30, 0)])
        land = env(f, [(27, 0), (31, 1), (38, 0.6), (52, 0)])
        for s_, sg in (("l", 1), ("r", -1)):
            turn(ARM, "upperarm_" + s_, "X", 40 * coil - 35 * launch - 48 * air)               # back, then flung at the prey
            turn(ARM, "upperarm_" + s_, "Y", -sg * (12 * air + 62 * land))                     # spread wide for balance on landing
            turn(ARM, "lowerarm_" + s_, "X", 12 * air)                  # arms long, claws out
        turn(ARM, "spine_01", "X", 18 * air)                       # pitched into a pounce
        turn(ARM, "spine_02", "X", 10 * coil - 8 * launch + 12 * air + 8 * land)
        turn(ARM, "neck_01", "X", -14 * air - 8 * launch)         # neck out, eyes on the prey
        turn(ARM, "Head", "X", -4 * air - 6 * land)                 # head up: it sees where it lands
        claws(ARM, max(air, land * 0.7))
        frames.append(readback(ARM))
    return bake(ARM, "Goat_Leap", frames, log)


HUNCH = {"spine_02": 4.0, "spine_03": 7.0, "neck_01": 9.0, "Head": -14.0}     # degrees forward (+) about the body's own side axis


def _fcurves(act):
    try:
        out = list(act.fcurves)
    except Exception:
        out = []
    if out:
        return out
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for cb in getattr(strip, "channelbags", []):
                out.extend(cb.fcurves)
    return out


def hunch_all(ARM, log):
    """A beast's carriage in every clip: shoulders rolled forward, neck thrust out, head brought
    level again. A constant turn in each bone's own frame (so it bends with the body)."""
    from mathutils import Quaternion
    rot = {}
    for b, deg in HUNCH.items():
        B = ARM.data.bones[b].matrix_local.to_3x3()
        rot[b] = (B.inverted() @ Matrix.Rotation(math.radians(deg), 3, "X") @ B).to_quaternion()
    n = 0
    for act in bpy.data.actions:
        fcs = _fcurves(act)
        for b, q0 in rot.items():
            qc = sorted([f for f in fcs if f.data_path == 'pose.bones["%s"].rotation_quaternion' % b], key=lambda f: f.array_index)
            if len(qc) != 4:
                continue
            counts = {len(f.keyframe_points) for f in qc}
            if len(counts) != 1:
                continue
            for k in range(counts.pop()):
                q = Quaternion([f.keyframe_points[k].co[1] for f in qc]) @ q0
                for i, f in enumerate(qc):
                    kp = f.keyframe_points[k]
                    dv = q[i] - kp.co[1]
                    kp.co[1] = q[i]; kp.handle_left[1] += dv; kp.handle_right[1] += dv
                n += 1
            for f in qc:
                f.update()
    log("hunch: re-keyed", n, "spine/neck/head keys")


def goat_idle(ARM, sc, log):
    """Its own idle: Idle_Loop crouched a little on bent knees, one hoof forward, the chest over
    them and the head low and forward, claws half open: waiting to charge. Loops as Idle_Loop does."""
    act = bpy.data.actions["Idle_Loop"]
    f0, f1 = (int(round(x)) for x in act.frame_range)
    frames = []
    for f in range(f0, f1 + 1):
        put(ARM, sample(ARM, sc, "Idle_Loop", f))
        feet = feet_of(ARM)
        feet["l"] = Matrix.Translation((0.02, -0.15, 0)) @ feet["l"]
        feet["r"] = Matrix.Translation((-0.03, 0.05, 0)) @ feet["r"]
        bpy.context.view_layer.update()
        pv = ARM.pose.bones["pelvis"]
        pv.matrix = Matrix.Translation((0, 0.01, -0.075)) @ pv.matrix
        plant(ARM, feet)
        turn(ARM, "spine_01", "X", 9)
        turn(ARM, "spine_03", "X", 5)
        turn(ARM, "neck_01", "X", 2)
        turn(ARM, "Head", "X", -10)
        for s_, sg in (("l", 1), ("r", -1)):
            turn(ARM, "upperarm_" + s_, "Y", -sg * 9)                 # arms off the body, ready
            turn(ARM, "lowerarm_" + s_, "X", -14)
        claws(ARM, 0.45)
        frames.append(readback(ARM))
    return bake(ARM, "Goat_Idle_Loop", frames, log)


def author(ARM, scene, species, log):
    sc = scene
    keep = sc.frame_current
    if species == "goat":
        for fn in (goat_idle, goat_ram, goat_hammer, goat_leap):
            fn(ARM, sc, log)
    _assign(ARM, None)
    _reset(ARM)
    hunch_all(ARM, log)
    sc.frame_set(keep)
