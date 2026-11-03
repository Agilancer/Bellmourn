"""Each beast man's own clips, authored onto the merged UAL rig before it is re-bound to the A-pose.

A clip is cut from existing UAL clips (re-timed, chained, cross-faded), then reshaped in
armature space: bones turned about their own heads on world axes (+X bends forward: the
creature faces -Y), one arm mirrored onto the other, poses of other clips blended in by weight
envelopes, claws opened. Every bone is keyed on every frame. UAL clips are in place; so are these
(the game moves the body).

Wolf (the werewolf): Wolf_Rake (right claw then left, each raked down and across), Wolf_Lunge_Bite
(springs in, claws flung wide then clapped shut on the prey, jaws driven in, a shake), Wolf_Pounce
(a low coil, claws-first flight, lands on all fours), Wolf_Howl, Wolf_Idle_Loop.

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
        if q.dot(qm) < 0:                                # (the short way: past 90 degrees of twist the long way turns it round)
            qm.negate()
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


# ---------------------------------------------------------------------------------------- wolf

UPPER = ("spine_01", "spine_02", "spine_03", "neck_01", "Head", "jaw") + ARMB + CLAW
JAW_SHUT = -5.0          # the jaw at rest in a snarl, lips off the teeth; the sculpt itself is open (0)


def jaw(ARM, deg):
    """The jaw turned about its hinge: + opens past the sculpt's gape, - closes toward a snarl."""
    if "jaw" in ARM.pose.bones:
        turn(ARM, "jaw", "X", deg)


def _partner(n):
    return n[:-2] + ("_r" if n.endswith("_l") else "_l") if n.endswith(("_l", "_r")) else n


def mirror_upper(ARM):
    """The upper body (spine, head, arms, claws) mirrored across the mid-plane, left for right; the
    hips and legs keep their pose."""
    S = Matrix.Scale(-1, 4, (1, 0, 0))
    bpy.context.view_layer.update()
    M = {pb.name: pb.matrix.copy() for pb in ARM.pose.bones}
    for pb in sorted(ARM.pose.bones, key=lambda b: len(b.bone.parent_recursive)):
        if pb.name.startswith(UPPER) and _partner(pb.name) in M:
            pb.matrix = S @ M[_partner(pb.name)] @ S
            bpy.context.view_layer.update()


def symmetrize(ARM, w=1.0):
    """The pose averaged with its own mirror image (armature space, so any bone's axes): no twist,
    no lean to a side, both limbs alike. w=1 fully symmetric."""
    S = Matrix.Scale(-1, 4, (1, 0, 0))
    bpy.context.view_layer.update()
    M = {pb.name: pb.matrix.copy() for pb in ARM.pose.bones}
    for pb in sorted(ARM.pose.bones, key=lambda b: len(b.bone.parent_recursive)):
        src = _partner(pb.name)
        if src not in M:
            continue
        A_, B_ = M[pb.name], S @ M[src] @ S
        qa, qb = A_.to_quaternion(), B_.to_quaternion()
        if qa.dot(qb) < 0:
            qb.negate()
        q = qa.slerp(qb, 0.5 * w)
        t = A_.translation.lerp(B_.translation, 0.5 * w)
        pb.matrix = Matrix.Translation(t) @ q.to_matrix().to_4x4()
        bpy.context.view_layer.update()


def hands_to(ARM, want, w, pole, keep=None):
    """Both hands slid toward armature-space points by w (two-bone IK), elbows toward pole(sx)."""
    if w <= 1e-3:
        return
    bpy.context.view_layer.update()
    for s_, sx in (("l", 1), ("r", -1)):
        Mh = ARM.pose.bones["hand_" + s_].matrix.copy()
        M = Mh.copy(); M.translation = Mh.translation.lerp(want(s_, sx), w)
        two_bone(ARM, s_, M, pole(sx))


def wolf_idle(ARM, sc, log):
    """Its own idle: Idle_Loop dropped into a wide, staggered crouch, the chest pitched over the
    knees, arms hung forward and out with the claws spread, the head low but up on the prey."""
    act = bpy.data.actions["Idle_Loop"]
    f0, f1 = (int(round(x)) for x in act.frame_range)
    frames = []
    for f in range(f0, f1 + 1):
        put(ARM, sample(ARM, sc, "Idle_Loop", f))
        feet = feet_of(ARM)
        feet["l"] = Matrix.Translation((0.05, -0.13, 0)) @ feet["l"]
        feet["r"] = Matrix.Translation((-0.06, 0.09, 0)) @ feet["r"]
        bpy.context.view_layer.update()
        pv = ARM.pose.bones["pelvis"]
        pv.matrix = Matrix.Translation((0, 0.03, -0.14)) @ pv.matrix
        plant(ARM, feet)
        turn(ARM, "spine_01", "X", 23)
        turn(ARM, "spine_02", "X", 8)
        turn(ARM, "spine_03", "X", 10)
        turn(ARM, "neck_01", "X", 10)
        turn(ARM, "Head", "X", -24)
        jaw(ARM, JAW_SHUT + 1.8 * (0.5 + 0.5 * math.sin((f - f0) / max(f1 - f0, 1) * 4 * math.pi)))
        for s_, sg in (("l", 1), ("r", -1)):
            turn(ARM, "upperarm_" + s_, "Y", -sg * 15)                # arms off the body, ready
            turn(ARM, "upperarm_" + s_, "X", -14)                     # and forward
            turn(ARM, "lowerarm_" + s_, "X", -26)
        claws(ARM, 0.95)
        frames.append(readback(ARM))
    return bake(ARM, "Wolf_Idle_Loop", frames, log)


def wolf_rake(ARM, sc, log):
    """Two raking blows, right claw then left: each arm up and back over its shoulder, then down
    and across through the target with the torso wrung round behind it and the head driving in
    (Zombie_Scratch's rake, the second one its mirror, cross-faded)."""
    T1 = [(0, 0), (7, 9), (11, 11), (14, 21), (18, 27)]       # the wind-up held, claw high (the tell)
    T2 = [(18, 6), (24, 11), (27, 21), (31, 27), (48, 43)]
    end1 = None
    frames = []
    for f in range(49):
        if f <= 18:
            put(ARM, sample(ARM, sc, "Zombie_Scratch", timemap(f, T1)))
        else:
            put(ARM, sample(ARM, sc, "Zombie_Scratch", timemap(f, T2)))
            mirror_upper(ARM)
            x = env(f, [(18, 0), (22, 1)])
            if x < 1:
                put(ARM, blend(end1, readback(ARM), x, only=UPPER))
        r1 = env(f, [(0, 0), (7, 1), (11, 1), (14, -1), (19, -0.4), (22, 0)])     # wring: wound right, thrown left
        r2 = env(f, [(19, 0), (24, 1), (25, 1), (28, -1), (33, -0.4), (44, 0)])
        wind = max(env(f, [(0, 0), (7, 1), (11, 1), (13, 0)]), env(f, [(19, 0), (23, 1), (25, 1), (27, 0)]))
        lean = env(f, [(0, 0), (12, 1), (29, 1), (44, 0)])
        turn(ARM, "spine_02", "Z", 14 * r1 - 14 * r2)
        turn(ARM, "spine_02", "X", -9 * wind)                           # chest opened on the wind-up
        turn(ARM, "spine_01", "X", 10 * lean)
        turn(ARM, "neck_01", "X", -20 * lean)                            # head thrust in after the claws
        turn(ARM, "Head", "X", -4 * lean - 12 * wind)                   # and up at the prey
        jaw(ARM, JAW_SHUT + 15 * max(env(f, [(6, 0), (12, 1), (16, 0.2)]), env(f, [(22, 0), (26, 1), (31, 0.2)])))
        claws(ARM, 1.0)
        cur = readback(ARM)
        if f == 18:
            end1 = cur
        frames.append(cur)
    return bake(ARM, "Wolf_Rake", frames, log)


def reach_hand(ARM, s_, tgt, fwd, w, pole):
    """One hand slid to armature-space point tgt by w (two-bone IK), its length turned toward fwd, so
    the open claws point where it reaches."""
    if w <= 1e-3:
        return
    bpy.context.view_layer.update()
    Mh = ARM.pose.bones["hand_" + s_].matrix.copy()
    q0 = Mh.to_quaternion()
    q1 = Mh.col[1].xyz.normalized().rotation_difference(fwd.normalized()) @ q0
    M = q0.slerp(q1, w).to_matrix().to_4x4()
    M.translation = Mh.translation.lerp(tgt, w)
    two_bone(ARM, s_, M, pole)


def wolf_bite(ARM, sc, log):
    """Out of its own crouch (Wolf_Idle_Loop: it starts and ends there). The tell: it sinks back into
    a coil, the claws bloom wide, the chin comes up so the gaping maw faces the prey, held trembling;
    a shudder back, then the lunge: the hips drop and shoot forward, the whole torso pitched from the
    hips with the back straight, the front foot stepping in and stamping; the claws swept up high
    (the head kept up) and slammed in at the prey's cheeks ahead of the face, elbows out; the jaws open
    to the last frame, then snapped with the head thrown past the mark (f22, the hit) and recoiling;
    a savage shake, the shoulders whipping against it; a tear free, chin yanked up and a claw flung
    out; a crouched, heaving pant with the claws on the floor (the punish window), eased back into
    the crouch. In place: the game carries the body forward."""
    from mathutils import Vector
    idle = bpy.data.actions["Wolf_Idle_Loop"]
    i0, i1 = (int(round(x)) for x in idle.frame_range)
    n = max(i1 - i0, 1)
    P6 = 2 * math.pi / 6                                                     # the shake: 4 a second
    frames = []
    for f in range(65):
        put(ARM, sample(ARM, sc, "Wolf_Idle_Loop", i0 + f % n))
        feet = feet_of(ARM)
        coil = env(f, [(0, 0), (10, 1), (13, 1), (16, 0)])
        back = env(f, [(11, 0), (14, 1), (16, 0)])
        tell = env(f, [(6, 0), (8, 1), (13, 1), (15, 0)]) * math.sin(f * 2.6)
        low = env(f, [(13, 0), (16, 1), (24, 1), (41, 0.6), (47, 0)])
        drive = env(f, [(15, 0), (19, 1), (41, 1), (47, 0)])
        over = env(f, [(21, 0), (22, 1), (23, 0.55), (25, 0)])              # the snap thrown past the mark, then the recoil
        comp = env(f, [(21, 0), (22, 1), (24, 0)])
        step = env(f, [(15, 0), (20, 1), (41, 1), (47, 0)])
        lift = env(f, [(15, 0), (18, 1), (21, 0)])
        shuffle = env(f, [(28, 0), (31, 1), (41, 1), (47, 0)])               # the rear foot drags in during the shake
        slift = env(f, [(28, 0), (29.5, 1), (31, 0)])
        pin = env(f, [(22, 0), (25, 1), (41, 1), (45, 0)])                  # the claws drop to pin it, clear of the face
        sweep = env(f, [(14, 0), (17, 1), (19, 1), (21, 0)])
        shut = env(f, [(18, 0), (21, 1), (41, 1), (45, 0)])
        grip = env(f, [(22, 0), (24, 1), (41, 1), (45, 0)])                 # the claws close only once they are in
        thrust = env(f, [(18, 0), (21, 0.75), (22, 1), (41, 1), (46, 0)])
        shake = env(f, [(24, 0), (25, 1), (36, 1), (41, 0)])
        sw = shake * math.sin((f - 24) * P6 - 0.5)                           # extremes at f26 / f29
        sw3 = shake * math.sin((f - 27) * P6 - 0.5)                          # the claws and shoulders trail
        tear = env(f, [(40, 0), (42, 1), (44, 1), (48, 0)])
        pant = env(f, [(45, 0), (49, 1), (55, 1), (64, 0)])
        heave = pant * math.sin(f * 0.55)
        reach = env(f, [(0, 0), (9, 1), (41, 1), (46, 0)])
        gape = env(f, [(0, 0), (6, 1), (21, 1), (22, 0), (40, 0), (42, 0.7), (45, 0.3), (49, 0.5), (55, 0.5), (64, 0)])
        feet["l"] = Matrix.Translation((0, -0.3 * step, 0.08 * lift)) @ feet["l"]
        feet["r"] = Matrix.Translation((0.03 * shuffle, -0.07 * shuffle, 0.04 * slift)) @ feet["r"]
        bpy.context.view_layer.update()
        pv = ARM.pose.bones["pelvis"]
        pv.matrix = Matrix.Translation((0.05 * sw3, 0.08 * coil + 0.04 * back - 0.3 * drive - 0.08 * over,
                                        -0.13 * coil - 0.12 * low - 0.07 * comp - 0.15 * pant + 0.02 * heave)) @ pv.matrix
        turn(ARM, "pelvis", "X", 18 * drive)                                 # (about 40 degrees with the hunch)
        turn(ARM, "pelvis", "Z", 10 * sw3)                                   # the tail whips against the shake
        plant(ARM, feet)
        turn(ARM, "spine_01", "X", 14 * coil - 8 * back + 3 * drive + 6 * comp + 8 * pant)
        turn(ARM, "spine_02", "X", 6 * coil - 6 * back + 2 * drive + 6 * heave)
        turn(ARM, "spine_03", "X", -8 * back - 14 * tear + 4 * heave)
        turn(ARM, "spine_02", "Z", -7 * sw3)
        turn(ARM, "spine_03", "Z", -12 * sw3)                                # the shoulders whip against it
        turn(ARM, "spine_03", "Y", 8 * sw3)                                  # and the torso rolls
        chin = env(f, [(14, 0), (16, 1), (21, 1), (23, 0)])                   # the muzzle held up on the prey to the last
        turn(ARM, "neck_01", "X", -8 * coil - 38 * thrust - 22 * over - 8 * tear - 4 * pant)
        turn(ARM, "Head", "X", -42 * coil + 1.2 * tell - 28 * chin - 20 * thrust - 6 * over - 45 * tear - 10 * pant + 6 * abs(sw))
        turn(ARM, "neck_01", "Z", 16 * sw3)                                  # the neck carries the head across
        turn(ARM, "Head", "Z", 45 * sw)
        turn(ARM, "Head", "Y", 12 * sw)
        jaw(ARM, JAW_SHUT + 27 * gape + 0.8 * tell)
        bpy.context.view_layer.update()
        hd = ARM.pose.bones["Head"].head.copy()
        for s_, sx in (("l", 1), ("r", -1)):
            sh = ARM.pose.bones["upperarm_" + s_].head
            wide = Vector((sx * (0.62 + 0.01 * tell), sh.y - 0.25, sh.z + 0.12))
            high = Vector((sx * 0.5, sh.y - 0.22, sh.z + 0.38))
            cheek = Vector((sx * 0.18, hd.y - 0.12, hd.z + 0.16))               # the pincer framing the face, at its eyes (aimed high: the reach falls short)
            pinp = Vector((sx * 0.32 + 0.2 * sw3, hd.y - 0.24, hd.z - 0.26 + 0.06 * sx * sw3))   # pinning it low, swung off-beat
            fling = Vector((sx * 0.75, sh.y - 0.05, sh.z + 0.1))
            drag = Vector((sx * 0.34, sh.y - 0.42, 0.06))                      # claws on the floor while it pants
            t = wide.lerp(high, sweep).lerp(cheek, shut).lerp(pinp, pin)
            if s_ == "r":
                t = t.lerp(fling, tear)
            w = max(reach, tear if s_ == "r" else 0.0)
            fwd = Vector((sx * 0.1, -1.0, 0.05 + 0.6 * sweep * (1 - shut)))
            reach_hand(ARM, s_, t, fwd, w * (1 - pant), (sx * 1.0, 0.15, 0.25))   # elbows out
            reach_hand(ARM, s_, drag, Vector((sx * 0.2, -1.0, -0.6)), 0.9 * pant, (sx * 1.0, 0.3, 0.0))
        claws(ARM, 1.0 - 0.45 * grip)
        frames.append(readback(ARM))
    return bake(ARM, "Wolf_Lunge_Bite", frames, log)


def wolf_pounce(ARM, sc, log):
    """Drops into a coil with the claws almost on the ground, launches, flies claws-first with the
    body stretched out and the legs tucked under, lands on all fours (claws planted ahead of the
    feet) and rises. Jump_Start, NinjaJump's tuck and Jump_Land, reshaped."""
    tuck = sample(ARM, sc, "NinjaJump_Idle_Loop", 20)
    keys = [(0, sample(ARM, sc, "Jump_Start", 0)), (15, sample(ARM, sc, "Jump_Start", 0)),
            (19, sample(ARM, sc, "Jump_Start", 4)), (24, blend(sample(ARM, sc, "Jump_Land", 0), tuck, 0.45)),
            (31, blend(sample(ARM, sc, "Jump_Land", 0), tuck, 0.25)), (35, sample(ARM, sc, "Jump_Land", 3))]
    frames = []
    for f in range(64):
        if f >= 35:
            pose = sample(ARM, sc, "Jump_Land", timemap(f, [(35, 3), (42, 6), (63, 30)]))
        else:
            for (a0, p0), (a1, p1) in zip(keys, keys[1:]):
                if f <= a1:
                    s_ = (f - a0) / (a1 - a0)
                    pose = blend(p0, p1, s_ * s_ * (3 - 2 * s_))
                    break
        put(ARM, pose)
        coil = env(f, [(0, 0.3), (8, 1), (16, 1), (18, 0)])               # held low: the tell
        launch = env(f, [(15, 0), (19, 1), (22, 0.4), (25, 0)])
        air = env(f, [(19, 0), (23, 1), (31, 1), (35, 0)])
        land = env(f, [(32, 0), (36, 1), (44, 0.7), (58, 0)])
        jaw(ARM, JAW_SHUT + 14 * max(air, 0.5 * launch) + 6 * coil)
        if coil > 1e-3:                                                 # crouched over the claws, low
            feet = feet_of(ARM)
            bpy.context.view_layer.update()
            pv = ARM.pose.bones["pelvis"]
            pv.matrix = Matrix.Translation((0, 0.03, -0.1 * coil)) @ pv.matrix
            plant(ARM, feet)
        turn(ARM, "pelvis", "X", 38 * air)                              # the whole body laid out flat in the air
        for s_ in ("l", "r"):
            turn(ARM, "thigh_" + s_, "X", -48 * air)                     # knees tucked up under it
            turn(ARM, "calf_" + s_, "X", 70 * air)                       # shins folded back
        turn(ARM, "spine_01", "X", 22 * coil + 10 * air + 26 * land)
        turn(ARM, "spine_02", "X", 8 * coil - 10 * launch + 8 * air + 10 * land)
        turn(ARM, "neck_01", "X", -18 * coil - 16 * air - 20 * land)   # eyes on the prey throughout
        turn(ARM, "Head", "X", -10 * coil - 24 * air - 14 * land)
        for s_, sg in (("l", 1), ("r", -1)):
            turn(ARM, "upperarm_" + s_, "X", 30 * launch - 70 * air)                 # flung forward, claws first
            turn(ARM, "upperarm_" + s_, "Y", -sg * 16 * air)
            turn(ARM, "lowerarm_" + s_, "X", -10 * air)
        hands_to(ARM, lambda s_, sx: ARM.pose.bones["upperarm_" + s_].head.__class__((sx * 0.3, -0.36, 0.1)),
                 coil * 0.85, lambda sx: (sx * 1.0, 0.3, 0.0))
        hands_to(ARM, lambda s_, sx: ARM.pose.bones["upperarm_" + s_].head.__class__((sx * 0.3, -0.5, 0.03)),
                 land, lambda sx: (sx * 1.0, 0.3, 0.0))                       # planted ahead of the feet
        reach_f = max(air, 0.6 * launch)
        if reach_f > 1e-3:                                             # in the air: arms straight at the prey, claws pointing ahead
            from mathutils import Vector
            bpy.context.view_layer.update()
            fwd = Vector((0, -1, 0.04)).normalized()                # level: the claws straight at the prey
            for s_, sx in (("l", 1), ("r", -1)):
                sh = ARM.pose.bones["upperarm_" + s_].head.copy()
                Mh = ARM.pose.bones["hand_" + s_].matrix.copy()
                tgt = Vector((sx * 0.2, sh.y - 0.64, sh.z - 0.02))
                q0 = Mh.to_quaternion()
                q1 = Mh.col[1].xyz.normalized().rotation_difference(fwd) @ q0   # the hand's length laid along the reach
                M = q0.slerp(q1, reach_f).to_matrix().to_4x4()
                M.translation = Mh.translation.lerp(tgt, reach_f)
                two_bone(ARM, s_, M, (sx * 1.0, 0.3, -0.6))
        claws(ARM, 1.0)
        frames.append(readback(ARM))
    return bake(ARM, "Wolf_Pounce", frames, log)


def wolf_howl(ARM, sc, log):
    """Rears up, the arms thrown wide and back, the chest open and the muzzle to the sky; holds it,
    trembling, then drops back to the crouch."""
    act = bpy.data.actions["Idle_Loop"]
    f0, f1 = act.frame_range
    frames = []
    for f in range(76):
        put(ARM, sample(ARM, sc, "Idle_Loop", f0 + f % (f1 - f0)))
        up = env(f, [(0, 0), (16, 1), (60, 1), (75, 0)])
        tr = up * math.sin(f * 2.1) * env(f, [(16, 0), (22, 1), (56, 1), (60, 0)])
        turn(ARM, "spine_01", "X", -10 * up)
        turn(ARM, "spine_02", "X", -11 * up)
        turn(ARM, "spine_03", "X", -10 * up)
        turn(ARM, "neck_01", "X", -22 * up)                                    # the throat stretched
        turn(ARM, "Head", "X", -42 * up + 1.5 * tr)                            # the head thrown right back, muzzle to the moon
        jaw(ARM, JAW_SHUT + 24 * up * env(f, [(8, 0), (18, 1), (56, 1), (66, 0)]))
        for s_, sg in (("l", 1), ("r", -1)):
            turn(ARM, "upperarm_" + s_, "Y", -sg * (46 * up + 3 * tr))         # flung wide, trembling
            turn(ARM, "upperarm_" + s_, "X", 10 * up)
            turn(ARM, "lowerarm_" + s_, "Y", -sg * 40 * up)                   # forearms raised, claws to the sky
            turn(ARM, "hand_" + s_, "Y", -sg * 15 * up)
        claws(ARM, 1.0)
        frames.append(readback(ARM))
    return bake(ARM, "Wolf_Howl", frames, log)


HUNCH_WOLF = {"spine_02": 9.0, "spine_03": 13.0, "neck_01": 13.0, "Head": -23.0}


def wolf_run(ARM, sc, log):
    """Its run: Sprint_Loop pitched far forward over the knees, the arms swinging long and low with
    the claws reaching, the head up on the prey, panting."""
    act = bpy.data.actions["Sprint_Loop"]
    f0, f1 = (int(round(x)) for x in act.frame_range)
    frames = []
    for f in range(f0, f1 + 1):
        put(ARM, sample(ARM, sc, "Sprint_Loop", f))
        turn(ARM, "pelvis", "X", 10)
        turn(ARM, "spine_01", "X", 18)
        turn(ARM, "spine_02", "X", 8)
        turn(ARM, "neck_01", "X", -10)
        turn(ARM, "Head", "X", -20)
        for s_ in ("l", "r"):
            turn(ARM, "upperarm_" + s_, "X", -22)                     # the swing carried low and forward
            turn(ARM, "lowerarm_" + s_, "X", -10)
        jaw(ARM, JAW_SHUT + 6 + 2 * math.sin((f - f0) / max(f1 - f0, 1) * 4 * math.pi))
        claws(ARM, 1.0)
        frames.append(readback(ARM))
    return bake(ARM, "Wolf_Run_Loop", frames, log)


def wolf_prowl(ARM, sc, log):
    """Its stalk: Crouch_Fwd_Loop, head low and level, claws spread, the snarl."""
    act = bpy.data.actions["Crouch_Fwd_Loop"]
    f0, f1 = (int(round(x)) for x in act.frame_range)
    frames = []
    for f in range(f0, f1 + 1):
        put(ARM, sample(ARM, sc, "Crouch_Fwd_Loop", f))
        turn(ARM, "spine_01", "X", 6)
        turn(ARM, "Head", "X", -16)
        for s_, sg in (("l", 1), ("r", -1)):
            turn(ARM, "upperarm_" + s_, "Y", -sg * 10)
        jaw(ARM, JAW_SHUT)
        claws(ARM, 0.95)
        frames.append(readback(ARM))
    return bake(ARM, "Wolf_Prowl_Loop", frames, log)


def jaw_all(ARM, sc, log, skip=("Wolf_",)):
    """Every library clip holds the jaw in the snarl (the sculpt rests open)."""
    if "jaw" not in ARM.pose.bones:
        return
    _reset(ARM)
    jaw(ARM, JAW_SHUT)
    q = readback(ARM)["jaw"][1]
    pb = ARM.pose.bones["jaw"]
    n = 0
    for act in list(bpy.data.actions):
        if act.name.startswith(skip):
            continue
        _assign(ARM, act)
        for f in (int(act.frame_range[0]), int(act.frame_range[1])):
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f, group="jaw")
        n += 1
    _assign(ARM, None)
    _reset(ARM)
    log("jaw: snarl held in", n, "clips")


def claws_all(ARM, log, w=0.7, skip=("Wolf_",)):
    """Every library clip's hands opened toward the claw (a fist would drive the long claws out
    through the back of the hand): each finger key turned toward its rest by w."""
    from mathutils import Quaternion
    n = 0
    for act in bpy.data.actions:
        if act.name.startswith(skip):
            continue
        fcs = _fcurves(act)
        bones = {f.data_path.split('"')[1] for f in fcs if f.data_path.startswith('pose.bones["') and f.data_path.endswith("rotation_quaternion")}
        for b in bones:
            if not b.startswith(CLAW):
                continue
            qc = sorted([f for f in fcs if f.data_path == 'pose.bones["%s"].rotation_quaternion' % b], key=lambda f: f.array_index)
            if len(qc) != 4 or len({len(f.keyframe_points) for f in qc}) != 1:
                continue
            for k in range(len(qc[0].keyframe_points)):
                q = Quaternion([f.keyframe_points[k].co[1] for f in qc]).slerp(Quaternion((1, 0, 0, 0)), w)
                for i, f in enumerate(qc):
                    kp = f.keyframe_points[k]
                    dv = q[i] - kp.co[1]
                    kp.co[1] = q[i]; kp.handle_left[1] += dv; kp.handle_right[1] += dv
                n += 1
            for f in qc:
                f.update()
    log("claws: opened", n, "finger keys")


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


def hunch_all(ARM, log, HUNCH=HUNCH):
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
    if species == "wolf":
        for fn in (wolf_idle, wolf_rake, wolf_bite, wolf_pounce, wolf_howl, wolf_run, wolf_prowl):
            fn(ARM, sc, log)
        claws_all(ARM, log)
        jaw_all(ARM, sc, log)
    _assign(ARM, None)
    _reset(ARM)
    hunch_all(ARM, log, HUNCH_WOLF if species == "wolf" else HUNCH)
    sc.frame_set(keep)
