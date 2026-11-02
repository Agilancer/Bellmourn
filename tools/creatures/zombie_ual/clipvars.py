"""Four extra takes on each zombie clip (idle, walk, scratch), made from the originals.

Every take is the original motion with edits on chosen bones. Angles are degrees about the
armature axes X (side to side), Y (front to back), Z (up); the character faces -Y. On a limb
hanging down, -X swings it forward; on the spine, +X pitches forward and +Y leans to its left.
Per bone (all optional):
  turn   a constant offset rotation (the whole swing turns about the joint)
  amp    the bone's motion scaled about its average pose (wild flails, a dead limb)
  rest   drop the average pose: the bone starts from the A-pose rest (a limp, hanging arm)
  wave   ((x, y, z), cycles per clip, phase): a rolling sway, a loll, a stagger
  env    [(u, (x, y, z)), ...] over normalized clip time u: wind-ups, lurches, twitches
  shift  delay the bone's motion by this fraction of the clip (an arm out of phase)
  src    take another bone's motion, mirrored (the second arm of a double swipe)
  still  [(u, w), ...]: blend the bone back toward the clip's first pose (kill the original's hip pop)
  aim    [(u, (x, y, z, w)), ...]: swing the bone toward a world direction with weight w (a dead arm
         hanging plumb whatever the spine does, a claw raised above the skull)
Offsets act in the posed parent frame (forward kinematics from the curves), so "raise 70 degrees
forward" means forward in the world even under a hunched, twisting spine.
Per take: speed, mirror (left and right swapped), warp (a time remap [(u_in, u_out)], e.g. a slow
wind-up into a fast strike), loc ({bone: [(u, (dx, dy, dz) metres)]}, a lunge or a buckle) and
locstill ({bone: [(u, w)]}, the bone's location blended back toward its first key).
After the edits a floor pass shifts the pelvis per key so the lowest toe sits where the original's
did (feet stay planted through crouches, lunges and staggers); floor=False skips it.
"""
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

BASE = ("Zombie_Idle_Loop", "Zombie_Walk_Fwd_Loop", "Zombie_Scratch")
O = (0, 0, 0)


def twitch(spikes, rise=0.03, hold=0.05, fall=0.04):
    """Sharp snaps: each (u, offset) rises in ~1 frame, holds 2, falls back."""
    pts = [(0.0, O)]
    for u, v in spikes:
        pts += [(u - rise, O), (u, v), (u + hold, v), (u + hold + fall, O)]
    return pts + [(1.0, O)]


HIGH = [(0, O), (0.3, O), (0.42, (-16, 0, 0)), (0.62, (-16, 0, 0)), (0.85, O), (1, O)]   # keep the swipe at face height
HIGH2 = [(u, tuple(c * 0.6 for c in v)) for u, v in HIGH]
UPRIGHT = [(0, O), (0.28, O), (0.38, (-25, 0, 0)), (0.62, (-25, 0, 0)), (0.85, O), (1, O)]   # the original bows to the knees
STAND = {"spine_01": dict(amp=0.45, env=UPRIGHT), "spine_03": dict(amp=0.45)}   # damp the deep bow so the claw stays high


def path(keys, w=1.0, ramp=(0.06, 0.85)):
    """An aim path [(u, direction)] that eases in from the original at ramp[0] and back out by ramp[1]."""
    first, last = keys[0][1], keys[-1][1]
    out = [(0, (*first, 0)), (ramp[0], (*first, 0))] + [(u, (*d, w)) for u, d in keys]
    return out + [(ramp[1], (*last, 0)), (1, (*last, 0))]


def mirror_aim(pts, shift=0.0):
    """The same aim path for the other arm (x mirrored), optionally later."""
    return [(min(1.0, u + shift) if u > 0 else 0.0, (-v[0], v[1], v[2], v[3])) for u, v in pts]


def hang(d, w=1.0):
    return [(0, (*d, w)), (1, (*d, w))]


def crouch(depth, w):
    """Sink the hips by depth (metres) with both feet kept planted: thighs forward, shins back, feet flat.
    w is a [(u, weight)] envelope. Returns per-bone edits and the pelvis drop."""
    a = math.degrees(math.acos(1 - depth / 0.84))
    sc = lambda v: [(u, tuple(c * x for c in v)) for u, x in w]
    bones = {}
    for s in "lr":
        bones["thigh_" + s] = dict(env=sc((-a, 0, 0)))
        bones["calf_" + s] = dict(env=sc((2 * a, 0, 0)))
        bones["foot_" + s] = dict(env=sc((-a, 0, 0)))
    return bones, [(u, (0, 0, -depth * x)) for u, x in w]


def merge(*ds):
    out = {}
    for d in ds:
        for k, v in d.items():
            out.setdefault(k, {}).update(v)
    return out


# Scratch B: claw swung out wide, then cocked behind the head at skull height; over the top, down to the chest
CHOP_U = path([(0.14, (-0.95, -0.2, 0.0)), (0.25, (-0.85, 0.25, 0.3)), (0.31, (-0.2, -0.55, 0.8)), (0.36, (-0.05, -1, 0.35)),
               (0.45, (0.05, -0.95, -0.1)), (0.6, (0.05, -0.95, -0.1))])
CHOP_F = path([(0.14, (-0.9, -0.3, 0.2)), (0.25, (0.3, 0.85, 0.3)), (0.31, (-0.15, -0.3, 0.95)), (0.36, (-0.05, -1, 0.15)),
               (0.45, (0.05, -0.85, -0.45)), (0.6, (0.05, -0.85, -0.45))])
OFF_U = path([(0.15, (0.3, -1, -0.35)), (0.5, (0.3, -1, -0.35))], w=0.9, ramp=(0.04, 0.7))   # off hand forward, a claw at chest height
OFF_F = path([(0.15, (0.25, -1, 0.0)), (0.5, (0.25, -1, 0.0))], w=0.9, ramp=(0.04, 0.7))
B_HOLD = [(0, 0), (0.06, 0), (0.2, 1), (0.36, 1), (0.5, 0), (1, 0)]      # the wind-up: planted, sunk, no hip pop
B_LEGS, B_DROP = crouch(0.06, B_HOLD)
# Scratch C: coiled low with the claw open behind the hip, then a flat sweep across
SWEEP_U = path([(0.25, (-0.6, 0.65, -0.45)), (0.36, (-0.55, -0.8, -0.15)), (0.48, (0.5, -0.8, -0.05)), (0.62, (0.55, -0.75, -0.05))])
SWEEP_F = path([(0.25, (-0.4, 0.55, -0.7)), (0.36, (-0.45, -0.85, -0.1)), (0.48, (0.6, -0.75, -0.1)), (0.62, (0.6, -0.7, -0.15))])
C_LEGS, C_DROP = crouch(0.06, [(0, 0), (0.08, 0), (0.22, 1), (0.34, 1), (0.48, 0), (1, 0)])
# Scratch D: the other arm, cocked behind the shoulder, then a raking downward arc
RAKE_U = path([(0.22, (0.55, 0.6, 0.3)), (0.38, (-0.25, -0.95, 0.4)), (0.46, (-0.45, -0.85, 0.2)), (0.58, (-0.6, -0.75, -0.05))])
RAKE_F = path([(0.22, (0.1, 0.1, 1)), (0.38, (-0.3, -0.85, 0.1)), (0.46, (-0.5, -0.7, -0.2)), (0.58, (-0.6, -0.55, -0.45))])
# Scratch E: coiled with the elbows back and the claws in front, below the face; then both claws across you
SWIPE_U = path([(0.25, (-0.55, 0.7, -0.1)), (0.33, (-0.35, -1, 0.15)), (0.42, (0.25, -0.95, 0.1)), (0.55, (0.4, -0.9, 0.0))])
SWIPE_F = path([(0.25, (-0.25, -0.75, 0.45)), (0.33, (-0.25, -1, 0.1)), (0.42, (0.4, -0.85, 0.0)), (0.55, (0.5, -0.8, -0.15))])
LUNGE = [(0, O), (0.22, (0, 0.05, -0.03)), (0.36, (0, -0.5, -0.04)), (0.62, (0, -0.5, -0.04)), (0.9, O), (1, O)]


def hold(v):
    return [(0, O), (0.22, O), (0.36, v), (0.62, v), (0.9, O), (1, O)]


def reach(side, w=0.85):
    """Both arms out for you at chest height, the elbow bent ~25 degrees and the wrist drooping."""
    x = 0.28 if side == "l" else -0.28
    return dict(upper=hang((x, -1, -0.15), w), fore=hang((x * 0.8, -1, -0.6), w))


_RL, _RR = reach("l"), reach("r")

TAKES = {
    "Zombie_Idle_Loop": {
        "B": dict(loc={"pelvis": [(0, (0.045, 0, 0)), (1, (0.045, 0, 0))]}, bones={   # lop-sided on one leg, a lurch each loop
            "spine_01": dict(turn=(0, 8, 0)),
            "spine_02": dict(turn=(0, -18, 0), env=[(0, O), (0.42, O), (0.48, (22, 0, 8)), (0.56, (18, 0, 6)), (0.8, O), (1, O)]),
            "spine_03": dict(turn=(0, -8, 0)), "neck_01": dict(turn=(-10, 0, 0)),
            "Head": dict(turn=(-18, 16, 0), amp=1.4),
            "upperarm_r": dict(amp=2.0), "upperarm_l": dict(turn=(-26, 0, 0))}),
        "C": dict(bones={   # twitchy, head cocked hard, snapping
            "Head": dict(turn=(0, -30, 12), amp=1.6, env=twitch([(0.18, (10, -18, 16)), (0.5, (-16, 12, -10)), (0.8, (12, -14, 20))])),
            "neck_01": dict(turn=(0, -10, 0), amp=1.6),
            "clavicle_r": dict(env=twitch([(0.33, (0, 20, 0))])),
            "upperarm_l": dict(turn=(0, -22, 0), amp=0.6, env=twitch([(0.64, (-30, -10, 0))])),
            "upperarm_r": dict(turn=(0, 22, 0), amp=0.6),
            "spine_02": dict(turn=(0, 0, 14), env=twitch([(0.5, (10, 0, -8))]))}),
        "D": dict(speed=0.9, bones={   # both arms reaching for you, out of phase, drifting
            "upperarm_l": dict(aim=_RL["upper"], shift=0.3, wave=((6, 0, -5), 1, 0.3)),
            "upperarm_r": dict(aim=_RR["upper"], wave=((6, 0, 5), 1, 0.0)),
            "lowerarm_l": dict(aim=_RL["fore"], shift=0.3), "lowerarm_r": dict(aim=_RR["fore"]),
            "hand_l": dict(turn=(15, 0, 0)), "hand_r": dict(turn=(15, 0, 0)),
            "spine_03": dict(turn=(-10, 0, 0)), "Head": dict(turn=(-12, 0, 0))}),
        "E": dict(speed=0.8, bones={   # broken: slumped and leaning, one arm dead, the head rolled onto the shoulder
            "spine_02": dict(turn=(14, 10, 0)), "spine_03": dict(turn=(8, 6, 0)),
            "clavicle_l": dict(turn=(0, 14, 0)),
            "upperarm_l": dict(rest=True, amp=0.2, aim=hang((0.32, 0.12, -1))), "lowerarm_l": dict(rest=True, amp=0.15),
            "hand_l": dict(rest=True, amp=0.2),
            "Head": dict(turn=(-22, 35, 0), wave=((8, 8, 0), 1, 0.0)), "neck_01": dict(turn=(-14, 10, 0), wave=((0, 6, 0), 1, 0.85))}),
    },
    "Zombie_Walk_Fwd_Loop": {
        "B": dict(bones={   # the classic: both arms out, reaching, bobbing on each footfall
            "upperarm_l": dict(aim=_RL["upper"], shift=0.15, wave=((8, 0, 0), 2, 0.0)),
            "upperarm_r": dict(aim=_RR["upper"], wave=((8, 0, 0), 2, 0.0)),
            "lowerarm_l": dict(aim=_RL["fore"], shift=0.15), "lowerarm_r": dict(aim=_RR["fore"]),
            "hand_l": dict(turn=(15, 0, 0)), "hand_r": dict(turn=(15, 0, 0)),
            "Head": dict(turn=(-12, 0, 0))}),
        "C": dict(speed=0.85, bones={   # a dead arm hanging to the knee, the good arm swinging hard, a dragged foot
            "spine_01": dict(turn=(0, 6, 0)), "spine_02": dict(turn=(0, 20, 0)), "clavicle_l": dict(turn=(0, 34, 0)),
            "upperarm_l": dict(rest=True, amp=0.0, aim=hang((0.1, 0.18, -1)), wave=((12, 0, 0), 1, 0.25)),
            "lowerarm_l": dict(rest=True, amp=0.0, wave=((8, 0, 0), 1, 0.35)), "hand_l": dict(rest=True, amp=0.2),
            "thigh_l": dict(amp=0.55, turn=(-8, 0, 0)), "foot_l": dict(turn=(12, 0, 15), amp=0.3),
            "calf_l": dict(amp=0.45, turn=(24, 0, 0), env=[(0, (16, 0, 0)), (0.15, O), (0.85, O), (1, (16, 0, 0))]),
            "Head": dict(turn=(0, 22, 0), amp=1.3),
            "upperarm_r": dict(turn=(-20, -10, 0), amp=2.2), "lowerarm_r": dict(amp=1.6)}),
        "D": dict(speed=0.8, loc={"pelvis": [(0, O), (0.06, O), (0.14, (0, 0, -0.035)), (0.26, O), (1, O)]}, bones={   # stagger
            "pelvis": dict(wave=((0, 9, 0), 1, 0.1)),
            "thigh_l": dict(wave=((0, -9, 0), 1, 0.1), amp=0.9), "thigh_r": dict(wave=((0, -9, 0), 1, 0.1), amp=1.25),
            "calf_l": dict(env=[(0, O), (0.05, O), (0.14, (24, 0, 0)), (0.26, O), (1, O)]),
            "spine_01": dict(wave=((0, 9, 0), 1, 0.1)),
            "spine_02": dict(wave=((0, 9, 0), 1, 0.05), env=[(0, O), (0.55, O), (0.61, (18, 0, 0)), (0.8, O), (1, O)]),
            "upperarm_l": dict(amp=1.8, env=[(0, O), (0.55, O), (0.62, (-40, -20, 0)), (0.82, O), (1, O)]),
            "upperarm_r": dict(amp=1.8, env=[(0, O), (0.55, O), (0.62, (-40, 20, 0)), (0.82, O), (1, O)]),
            "Head": dict(wave=((0, -15, 0), 1, -0.05), amp=1.4)}),
        "E": dict(speed=1.3, bones={   # hunched low and fast
            "spine_02": dict(turn=(22, 0, 0)), "spine_03": dict(turn=(12, 0, 0)), "Head": dict(turn=(-22, 0, 0)),
            "upperarm_l": dict(turn=(0, -24, 0), amp=1.3), "upperarm_r": dict(turn=(0, 24, 0), amp=1.3)}),
    },
    "Zombie_Scratch": {
        "B": dict(warp=[(0, 0), (0.25, 0.36), (0.42, 0.44), (1, 1)], locstill={"pelvis": B_HOLD}, loc={"pelvis": B_DROP},
                  bones=merge({"pelvis": dict(still=B_HOLD)}, {b: dict(still=B_HOLD) for b in B_LEGS}, B_LEGS, STAND, {   # overhead chop
            "spine_02": dict(amp=0.45, env=[(0, O), (0.25, (4, 0, 0)), (0.33, (8, 0, 0)), (0.42, (-8, 0, 0)), (0.62, (-8, 0, 0)), (0.85, O), (1, O)]),
            "clavicle_r": dict(env=[(0, O), (0.25, (0, 14, 0)), (0.36, O), (1, O)]),
            "clavicle_l": dict(env=[(0, O), (0.25, (0, -10, 0)), (0.36, O), (1, O)]),
            "Head": dict(env=[(0, O), (0.18, (24, 0, 0)), (0.36, (12, 0, 0)), (0.5, O), (1, O)]),
            "upperarm_r": dict(aim=CHOP_U), "lowerarm_r": dict(aim=CHOP_F),
            "upperarm_l": dict(aim=OFF_U), "lowerarm_l": dict(aim=OFF_F)})),
        "C": dict(speed=1.1, warp=[(0, 0), (0.25, 0.22), (1, 1)], loc={"pelvis": C_DROP}, bones=merge(C_LEGS, {   # coiled low, a flat sweep
            "spine_01": dict(amp=0.6), "spine_03": dict(amp=0.6),
            "spine_02": dict(amp=0.6, env=[(0, O), (0.25, (14, 0, -40)), (0.36, (0, 0, -10)), (0.48, (-10, 0, 22)), (0.62, (-10, 0, 22)),
                                           (0.85, O), (1, O)]),
            "Head": dict(env=[(0, O), (0.25, (0, 0, 32)), (0.36, (0, 0, 8)), (0.48, (0, 0, -16)), (0.62, (0, 0, -16)), (0.85, O), (1, O)]),
            "upperarm_r": dict(aim=SWEEP_U), "lowerarm_r": dict(aim=SWEEP_F),
            "upperarm_l": dict(env=[(0, O), (0.1, (0, -35, 0)), (0.8, (0, -35, 0)), (0.95, O), (1, O)])})),
        "D": dict(mirror=True, warp=[(0, 0), (0.25, 0.3), (1, 1)], bones={   # the other arm, from a forward crouch
            **STAND, "spine_02": dict(amp=0.45, env=[(0, O), (0.2, (25, 0, 0)), (0.33, (8, 0, 0)), (0.45, O), (1, O)]),
            "upperarm_l": dict(aim=RAKE_U), "lowerarm_l": dict(aim=RAKE_F),
            "upperarm_r": dict(turn=(0, 10, 0), env=[(0, O), (0.15, (0, -24, 0)), (0.6, (0, -24, 0)), (0.85, O), (1, O)]),
            "Head": dict(amp=1.2)}),
        "E": dict(speed=1.35, loc={"pelvis": LUNGE}, bones={   # coil, then lunge: both claws across your face, one after the other
            **STAND, "spine_02": dict(amp=0.45, env=[(0, O), (0.12, (25, 0, 0)), (0.27, (25, 0, 0)), (0.36, (10, 0, 0)), (0.62, (10, 0, 0)),
                                                      (0.85, O), (1, O)]),
            "Head": dict(env=[(0, O), (0.15, (6, 0, 0)), (0.62, (6, 0, 0)), (0.85, O), (1, O)]),
            "upperarm_r": dict(aim=SWIPE_U), "lowerarm_r": dict(aim=SWIPE_F),
            "upperarm_l": dict(aim=mirror_aim(SWIPE_U, 0.11)), "lowerarm_l": dict(aim=mirror_aim(SWIPE_F, 0.11)),
            "thigh_r": dict(env=hold((30, 0, 0))), "calf_r": dict(env=hold((10, 0, 0))), "thigh_l": dict(env=hold((-8, 0, 0))),
            "calf_l": dict(env=hold((18, 0, 0))), "foot_l": dict(env=hold((-4, 0, 0)))}),
    },
}


# ---------------------------------------------------------------- the zombie variants' own walk and attack
# (the right arm hangs on the -x side: +x is in toward the body's middle; mirror_aim gives the left arm)
HAMMER_U = path([(0.25, (-0.18, 0.15, 1)), (0.33, (0.05, -0.55, 0.8)), (0.4, (0.16, -1, 0.05)), (0.55, (0.16, -1, 0.1)),
                 (0.66, (0.16, -1, 0.0))], ramp=(0.06, 0.88))   # the fists stay locked through the slam and the follow-through
HAMMER_F = path([(0.25, (0.7, 0.2, 0.7)), (0.33, (0.5, -0.3, 0.9)), (0.4, (0.5, -0.9, -0.1)), (0.55, (0.5, -0.9, -0.05)),
                 (0.66, (0.5, -0.9, -0.1))], ramp=(0.06, 0.88))
GRAB_U = path([(0.25, (-0.45, 0.6, -0.5)), (0.36, (-0.04, -1, 0.08)), (0.5, (-0.03, -1, 0.05)), (0.66, (-0.03, -1, 0.03))],
              ramp=(0.06, 0.88))   # both arms straight out in parallel at throat height
GRAB_F = path([(0.25, (-0.2, 0.3, -0.9)), (0.36, (0.06, -1, 0.0)), (0.5, (0.06, -1, -0.02)), (0.66, (0.06, -1, -0.03))], ramp=(0.06, 0.88))
BACK_U = path([(0.25, (-0.55, -0.55, 0.05)), (0.34, (0.0, -1, 0.35)), (0.45, (0.65, -0.75, 0.3)), (0.58, (0.85, -0.45, 0.15))])
BACK_F = path([(0.25, (0.35, 0.35, 0.55)), (0.34, (-0.1, -1, 0.3)), (0.45, (0.7, -0.7, 0.2)), (0.58, (0.9, -0.4, 0.0))])
_UP, _DN = (-0.45, 0.1, 0.9), (0.3, -0.7, -0.65)   # down: the fist ends at the belly, well below the other's arc


def lift(pts, dz, u0=0.3):
    """Raise an aim path's directions by dz (from u0 on): the swipe's first pose drops the left shoulder."""
    return [(u, (v[0], v[1], v[2] + (dz if u >= u0 and v[3] > 0 else 0.0), v[3])) for u, v in pts]


def mill(t0, n=4, per=0.2, slam=0.05, low=0.05):
    """Overhead blows: up, a fast slam, a beat held low, then the long rise to the next."""
    return [k for i in range(n) for k in ((t0 + i * per, _UP), (t0 + i * per + slam, _DN), (t0 + i * per + slam + low, _DN))]


MILL_U = path(mill(0.08), ramp=(0.02, 0.9))   # the other arm, half a cycle on, slams while this one is low or rising
MILL_F = [(u, (*v[:3], v[3] * 0.85)) for u, v in MILL_U]
LIMP = [(0, (0.1, 0.15, -1, 0.85)), (1, (0.1, 0.15, -1, 0.85))]
# a two-handed blow: hips, spine and shoulders held square (the swipe's lean and twist would pull the hands apart)
TORSO = ("pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "clavicle_l", "clavicle_r")
LEGS = tuple("%s_%s" % (b, s) for b in ("thigh", "calf", "foot") for s in "lr")
CALM = [(0, 0), (0.1, 0), (0.22, 1), (0.72, 1), (0.9, 0), (1, 0)]


def calm(bones, w=CALM):
    return {b: dict(still=w) for b in bones}

TAKES["Zombie_Walk_Fwd_Loop"].update({
    "stitchback": dict(speed=0.9, bones={   # a marionette: shoulders hitched on strings, wrists dangling, knees yanked high
        "clavicle_l": dict(env=twitch([(0.1, (0, -16, 0)), (0.6, (0, -16, 0))], hold=0.18)),
        "clavicle_r": dict(env=twitch([(0.35, (0, 16, 0)), (0.85, (0, 16, 0))], hold=0.18)),
        "upperarm_l": dict(aim=hang((0.75, -0.35, 0.05), 0.85), env=twitch([(0.1, (0, -20, 0)), (0.6, (0, -15, 0))], hold=0.15)),
        "upperarm_r": dict(aim=hang((-0.75, -0.35, 0.05), 0.85), env=twitch([(0.35, (0, 20, 0)), (0.85, (0, 15, 0))], hold=0.15)),
        "lowerarm_l": dict(aim=hang((0.05, -0.15, -1), 0.9)), "lowerarm_r": dict(aim=hang((-0.05, -0.15, -1), 0.9)),
        "hand_l": dict(rest=True, amp=0.0), "hand_r": dict(rest=True, amp=0.0),
        "thigh_l": dict(amp=1.9), "thigh_r": dict(amp=1.9), "calf_l": dict(amp=1.7), "calf_r": dict(amp=1.7),
        "Head": dict(turn=(-6, 0, 0), env=twitch([(0.12, (14, -16, 12)), (0.46, (-10, 18, -14)), (0.78, (16, 10, 8))], hold=0.12)),
        "spine_02": dict(env=twitch([(0.25, (6, 0, 10)), (0.65, (6, 0, -10))], hold=0.12))}),
    "boilface": dict(speed=0.6, loc={"pelvis": [(0, (0, 0, -0.02)), (0.25, (0.15, 0, -0.02)), (0.5, (0, 0, -0.02)), (0.75, (-0.15, 0, -0.02)),
                                                (1, (0, 0, -0.02))]}, bones={   # a wide, rolling waddle, arms hanging heavy
        "pelvis": dict(wave=((0, 11, 0), 1, 0.1)),
        "thigh_l": dict(wave=((0, -11, 0), 1, 0.1), turn=(0, -12, 0)), "thigh_r": dict(wave=((0, -11, 0), 1, 0.1), turn=(0, 12, 0)),
        "spine_01": dict(turn=(-6, 0, 0), wave=((0, 6, 0), 1, 0.2)), "spine_02": dict(turn=(-4, 0, 0)),
        "upperarm_l": dict(amp=0.4, turn=(0, 8, 0)), "upperarm_r": dict(amp=0.4, turn=(0, -8, 0)),
        "Head": dict(turn=(8, 0, 0), wave=((0, -14, 0), 1, 0.6))}),
    "hangman": dict(speed=0.9, bones={   # the broken neck: head rolled hard onto the shoulder, bobbing a beat late; arms dead
        "Head": dict(turn=(-10, 55, 0), wave=((12, 6, 0), 2, 0.25)), "neck_01": dict(turn=(0, 20, 0), wave=((6, 0, 0), 2, 0.15)),
        "upperarm_l": dict(rest=True, amp=0.0, aim=hang((0.1, 0.05, -1)), wave=((10, 0, 0), 1, 0.3)),
        "upperarm_r": dict(rest=True, amp=0.0, aim=hang((-0.1, 0.05, -1)), wave=((10, 0, 0), 1, 0.8)),
        "lowerarm_l": dict(rest=True, amp=0.0), "lowerarm_r": dict(rest=True, amp=0.0),
        "thigh_l": dict(amp=0.6), "thigh_r": dict(amp=0.6), "spine_02": dict(turn=(10, 6, 0))}),
    "rotjaw": dict(speed=1.2, bones={   # an aggressive lurch, pitched forward, clawing low and ahead
        "spine_01": dict(turn=(8, 0, 0)), "spine_02": dict(turn=(8, 0, 0)), "Head": dict(turn=(-20, 0, 0)),
        "thigh_l": dict(amp=1.3), "thigh_r": dict(amp=1.3),
        "upperarm_l": dict(aim=hang((0.5, -0.9, -0.6), 0.8), wave=((-16, 0, 0), 1, 0.0)),
        "upperarm_r": dict(aim=hang((-0.5, -0.9, -0.6), 0.8), wave=((-16, 0, 0), 1, 0.5)),
        "lowerarm_l": dict(turn=(-20, 0, 0)), "lowerarm_r": dict(turn=(-20, 0, 0))}),
    "charred": dict(speed=0.85, bones={   # burn-contracted: a boxer's crouch, fists at the chest, knees locked, short steps
        "spine_01": dict(amp=0.3, turn=(8, 0, 0)), "spine_02": dict(amp=0.3, turn=(6, 0, 0)), "spine_03": dict(amp=0.3),
        "upperarm_l": dict(aim=hang((0.2, -0.3, -1), 0.9), amp=0.3), "upperarm_r": dict(aim=hang((-0.2, -0.3, -1), 0.9), amp=0.3),
        "lowerarm_l": dict(aim=hang((-0.35, -0.85, 0.25), 0.9)), "lowerarm_r": dict(aim=hang((0.35, -0.85, 0.25), 0.9)),
        "hand_l": dict(turn=(-30, 0, 0)), "hand_r": dict(turn=(-30, 0, 0)),
        "thigh_l": dict(amp=0.45), "thigh_r": dict(amp=0.45), "calf_l": dict(amp=0.3), "calf_r": dict(amp=0.3),
        "Head": dict(amp=0.4, turn=(-20, 0, 0))}),
})

TAKES["Zombie_Scratch"].update({
    "stitchback": dict(warp=[(0, 0), (0.25, 0.38), (0.42, 0.46), (1, 1)], locstill={"pelvis": CALM}, loc={"pelvis": B_DROP},
                       bones=merge(calm(TORSO + LEGS), B_LEGS, {   # hands clasped overhead, slammed down, still clasped
        "spine_02": dict(env=[(0, O), (0.25, (-8, 0, 0)), (0.4, (14, 0, 0)), (0.6, (10, 0, 0)), (0.85, O), (1, O)]),
        "Head": dict(env=[(0, O), (0.25, (18, 0, 0)), (0.5, O), (1, O)]),
        "upperarm_r": dict(aim=HAMMER_U), "lowerarm_r": dict(aim=HAMMER_F),
        "upperarm_l": dict(aim=lift(mirror_aim(HAMMER_U), 0.14, 0.36)), "lowerarm_l": dict(aim=lift(mirror_aim(HAMMER_F), 0.3, 0.36))})),
    "boilface": dict(speed=0.9, loc={"pelvis": [(0, O), (0.24, (0, 0.06, -0.04)), (0.36, (0, -0.3, -0.05)), (0.62, (0, -0.3, -0.05)),
                                                 (0.9, O), (1, O)]}, bones=merge(calm(TORSO), {   # coiled low, then both hands at your throat
        "spine_02": dict(env=[(0, O), (0.18, (16, 0, 0)), (0.26, (12, 0, 0)), (0.36, (10, 0, 0)), (0.62, (8, 0, 0)), (0.85, O), (1, O)]),
        "upperarm_r": dict(aim=GRAB_U), "lowerarm_r": dict(aim=GRAB_F),
        "upperarm_l": dict(aim=lift(mirror_aim(GRAB_U, 0.02), 0.14)), "lowerarm_l": dict(aim=lift(mirror_aim(GRAB_F, 0.02), 0.25)),
        "Head": dict(env=[(0, O), (0.3, (-10, 0, 0)), (0.62, (-10, 0, 0)), (0.85, O), (1, O)]),   # the boil face up at you
        "thigh_r": dict(env=hold((22, 0, 0))), "thigh_l": dict(env=hold((-8, 0, 0))), "calf_l": dict(env=hold((16, 0, 0)))})),
    "hangman": dict(speed=1.1, warp=[(0, 0), (0.25, 0.3), (1, 1)],
                    loc={"pelvis": [(0, O), (0.25, (0, 0.05, 0)), (0.34, (0, -0.22, -0.02)), (0.6, (0, -0.22, -0.02)), (0.9, O), (1, O)]},
                    bones={   # a lunging bite: the jaw driven at your face, the arms trailing dead
        **STAND, "spine_02": dict(amp=0.45, env=[(0, O), (0.22, (-4, 0, 0)), (0.34, (4, 0, 0)), (0.6, (4, 0, 0)), (0.85, O), (1, O)]),
        "neck_01": dict(env=[(0, O), (0.25, (-8, 0, 0)), (0.34, (8, 0, 0)), (0.6, (6, 0, 0)), (0.85, O), (1, O)]),
        "Head": dict(env=[(0, (0, 30, 0)), (0.25, (-10, 30, 0)), (0.32, (-40, 0, 0)), (0.6, (-30, 0, 0)), (0.85, (0, 30, 0)), (1, (0, 30, 0))]),
        "upperarm_l": dict(rest=True, amp=0.1, aim=LIMP), "upperarm_r": dict(rest=True, amp=0.1, aim=mirror_aim(LIMP)),
        "lowerarm_l": dict(rest=True, amp=0.1), "lowerarm_r": dict(rest=True, amp=0.1),
        "thigh_r": dict(env=hold((18, 0, 0)))}),
    "rotjaw": dict(speed=1.15, warp=[(0, 0), (0.25, 0.2), (1, 1)], bones={   # the claw cocked across the chest, a high backhand rake
        **STAND, "spine_02": dict(amp=0.45, env=[(0, O), (0.22, (10, 0, -30)), (0.34, O), (0.5, (-6, 0, 26)), (0.62, (-6, 0, 26)), (0.85, O), (1, O)]),
        "upperarm_l": dict(aim=BACK_U), "lowerarm_l": dict(aim=BACK_F), "upperarm_r": dict(turn=(0, -12, 0)), "Head": dict(turn=(-8, 0, 0))}),
    "charred": dict(speed=1.0, bones={   # a frenzy: full overhead arcs, crossing in front of the face
        **STAND, "spine_02": dict(amp=0.45, wave=((4, 0, 6), 3, 0.0)),
        "upperarm_r": dict(aim=MILL_U), "lowerarm_r": dict(aim=MILL_F),
        "upperarm_l": dict(aim=mirror_aim(MILL_U, 0.1)), "lowerarm_l": dict(aim=mirror_aim(MILL_F, 0.1)),
        "Head": dict(wave=((0, 10, 6), 3, 0.2))}),
})

def _fcurves(act):
    try:
        out = list(act.fcurves)
    except Exception:
        out = []
    if out:
        return out
    return [fc for layer in getattr(act, "layers", []) for strip in layer.strips
            for cb in getattr(strip, "channelbags", []) for fc in cb.fcurves]


def _curves(fcs, bone, prop, n):
    path = 'pose.bones["%s"].%s' % (bone, prop)
    c = sorted([f for f in fcs if f.data_path == path], key=lambda f: f.array_index)
    return c if len(c) == n else None


def _scale_rot(q, k):
    if q.w < 0:
        q = -q
    ang = 2 * math.acos(max(-1.0, min(1.0, q.w)))
    if ang < 1e-6 or k == 1.0:
        return q.copy()
    return Quaternion(q.axis, ang * k)


def _rot(deg):
    x, y, z = (math.radians(a) for a in deg)
    return Matrix.Rotation(z, 3, "Z") @ Matrix.Rotation(y, 3, "Y") @ Matrix.Rotation(x, 3, "X")


def _env(pts, u):
    t3 = lambda a: a if isinstance(a, tuple) else (a,) * 3
    if u <= pts[0][0]:
        return t3(pts[0][1])
    for (u0, a), (u1, b) in zip(pts[:-1], pts[1:]):
        if u <= u1:
            s = (u - u0) / max(u1 - u0, 1e-9)
            s = s * s * (3 - 2 * s)
            a, b = (a if isinstance(a, tuple) else (a,) * 3), (b if isinstance(b, tuple) else (b,) * 3)
            return tuple(x * (1 - s) + y * s for x, y in zip(a, b))
    return t3(pts[-1][1])


def _mirror(fcs):
    """Swap _l / _r curves and mirror every rotation across the body's midplane."""
    by = {}
    for f in fcs:
        by.setdefault((f.data_path, f.array_index), f)
    done = set()
    for (path, idx), f in list(by.items()):
        if (path, idx) in done:
            continue
        other = path.replace('_l"]', '_TMP"]').replace('_r"]', '_l"]').replace('_TMP"]', '_r"]')
        g = by.get((other, idx)) if other != path else None
        sign = 1.0
        if path.endswith("rotation_quaternion") and idx in (2, 3):
            sign = -1.0
        if path.endswith("location") and idx == 0:
            sign = -1.0
        if g is not None and g is not f:
            a = [kp.co[1] for kp in f.keyframe_points]; b = [kp.co[1] for kp in g.keyframe_points]
            if len(a) == len(b):
                for kp, val in zip(f.keyframe_points, b):
                    kp.co[1] = sign * val; kp.handle_left[1] = kp.co[1]; kp.handle_right[1] = kp.co[1]
                for kp, val in zip(g.keyframe_points, a):
                    kp.co[1] = sign * val; kp.handle_left[1] = kp.co[1]; kp.handle_right[1] = kp.co[1]
            done.add((other, idx))
        else:
            for kp in f.keyframe_points:
                kp.co[1] *= sign; kp.handle_left[1] = kp.co[1]; kp.handle_right[1] = kp.co[1]
        done.add((path, idx))


def _key_q(fcs, bone, k, cache):
    qc = cache.get(bone)
    if qc is None:
        qc = cache[bone] = _curves(fcs, bone, "rotation_quaternion", 4) or False
    if not qc:
        return Quaternion()
    return Quaternion([qc[i].keyframe_points[k].co[1] for i in range(4)]).normalized()


def _posed(arm, fcs, bone, k):
    """The bone's armature-space deformation rotation at key k (forward kinematics, rotations only)."""
    D = Matrix.Identity(3)
    cache = {}
    chain = []
    b = arm.data.bones[bone]
    while b is not None:
        chain.append(b)
        b = b.parent
    for b in reversed(chain):
        B = b.matrix_local.to_3x3()
        D = D @ B @ _key_q(fcs, b.name, k, cache).to_matrix() @ B.inverted()
    return D


def _edit_bone(arm, fcs, bone, e, loop, f0, f1):
    qc = _curves(fcs, bone, "rotation_quaternion", 4)
    if qc is None or bone not in arm.data.bones:
        return
    sc = _curves(fcs, e["src"], "rotation_quaternion", 4) if e.get("src") else qc
    if sc is None:
        return
    n = len(qc[0].keyframe_points)
    src = [Quaternion([sc[i].keyframe_points[k].co[1] for i in range(4)]) for k in range(n)]
    if e.get("src"):                                    # the other side's motion, mirrored
        src = [Quaternion((q.w, q.x, -q.y, -q.z)) for q in src]
    T = [qc[0].keyframe_points[k].co[0] for k in range(n)]
    sh = int(round(e.get("shift", 0.0) * (n - 1)))
    if sh:
        src = [src[(k - sh) % (n - 1)] for k in range(n)] if loop else [src[max(0, k - sh)] for k in range(n)]
        if loop:
            src[-1] = src[0].copy()
    for k in range(1, n):
        if src[k].dot(src[k - 1]) < 0:
            src[k] = -src[k]
    if e.get("still"):
        q0 = src[0].copy()
        src = [q.slerp(q0, _env(e["still"], (T[k] - f0) / max(f1 - f0, 1e-6))[0]) for k, q in enumerate(src)]
    mean = Quaternion((sum(q.w for q in src), sum(q.x for q in src), sum(q.y for q in src), sum(q.z for q in src)))
    mean.normalize()
    amp = e.get("amp", 1.0)
    B = arm.data.bones[bone].matrix_local.to_3x3()
    par = arm.data.bones[bone].parent
    R0 = _rot(e.get("turn", O))
    wv = e.get("wave")
    out = []
    for k, q in enumerate(src):
        u = (T[k] - f0) / max(f1 - f0, 1e-6)
        dev = _scale_rot(mean.inverted() @ q, amp)
        base = dev if e.get("rest") else mean @ dev
        DB = (_posed(arm, fcs, par.name, k) if par else Matrix.Identity(3)) @ B
        R = R0
        if e.get("aim"):
            a = _env(e["aim"], u)
            if a[3] > 1e-3:
                d = DB @ base.to_matrix() @ Vector((0, 1, 0))
                ra = d.rotation_difference(Vector(a[:3]).normalized())
                R = R @ Quaternion().slerp(ra, min(1.0, a[3])).to_matrix()
        if wv:
            s = math.sin(2 * math.pi * (wv[1] * u + wv[2]))
            R = R @ _rot(tuple(a * s for a in wv[0]))
        if e.get("env"):
            R = R @ _rot(_env(e["env"], u))
        q2 = (DB.inverted() @ R @ DB).to_quaternion() @ base
        if out and q2.dot(out[-1]) < 0:
            q2 = -q2
        out.append(q2)
    for k, q2 in enumerate(out):
        for i in range(4):
            kp = qc[i].keyframe_points[k]
            kp.co[1] = q2[i]; kp.handle_left[1] = q2[i]; kp.handle_right[1] = q2[i]


def _still_loc(fcs, bone, pts, f0, f1):
    lc = _curves(fcs, bone, "location", 3)
    if lc is None:
        return
    for i in range(3):
        v0 = lc[i].keyframe_points[0].co[1]
        for kp in lc[i].keyframe_points:
            w = _env(pts, (kp.co[0] - f0) / max(f1 - f0, 1e-6))[0]
            kp.co[1] = kp.co[1] * (1 - w) + v0 * w; kp.handle_left[1] = kp.co[1]; kp.handle_right[1] = kp.co[1]


def _edit_loc(arm, fcs, bone, pts, f0, f1):
    lc = _curves(fcs, bone, "location", 3)
    if lc is None or bone not in arm.data.bones:
        return
    Bi = arm.data.bones[bone].matrix_local.to_3x3().inverted()
    for k in range(len(lc[0].keyframe_points)):
        u = (lc[0].keyframe_points[k].co[0] - f0) / max(f1 - f0, 1e-6)
        d = Bi @ Vector(_env(pts, u))
        for i in range(3):
            kp = lc[i].keyframe_points[k]
            kp.co[1] += d[i]; kp.handle_left[1] = kp.co[1]; kp.handle_right[1] = kp.co[1]


TOES = ("ball_l", "ball_r")


def _toe_min(arm, act, times):
    """Lowest toe tip (world z) at each time, evaluating the armature with this action alone."""
    ad = arm.animation_data or arm.animation_data_create()
    prev, mutes = ad.action, [t.mute for t in ad.nla_tracks]
    for t in ad.nla_tracks:
        t.mute = True
    ad.action = act
    if hasattr(ad, "action_slot") and len(act.slots):
        ad.action_slot = act.slots[0]
    sc = bpy.context.scene
    out = []
    for t in times:
        sc.frame_set(int(math.floor(t)), subframe=t - math.floor(t))
        out.append(min((arm.matrix_world @ arm.pose.bones[b].tail).z for b in TOES))
    ad.action = prev
    for t, m in zip(ad.nla_tracks, mutes):
        t.mute = m
    return out


def _floor(arm, fcs, act, target):
    lc = _curves(fcs, "pelvis", "location", 3)
    if lc is None:
        return 0.0
    times = [kp.co[0] for kp in lc[0].keyframe_points]
    now = _toe_min(arm, act, times)
    Bi = arm.data.bones["pelvis"].matrix_local.to_3x3().inverted()
    worst = 0.0
    for k, (a, b) in enumerate(zip(target, now)):
        d = Bi @ Vector((0, 0, a - b))
        worst = max(worst, abs(a - b))
        for i in range(3):
            kp = lc[i].keyframe_points[k]
            kp.co[1] += d[i]; kp.handle_left[1] = kp.co[1]; kp.handle_right[1] = kp.co[1]
    for f in lc:
        f.update()
    return worst


def _warp(pts, u):
    for (a0, b0), (a1, b1) in zip(pts[:-1], pts[1:]):
        if u <= a1:
            return b0 + (b1 - b0) * (u - a0) / max(a1 - a0, 1e-9)
    return pts[-1][1]


def make(arm, log=print):
    made = []
    for base, takes in TAKES.items():
        src = bpy.data.actions.get(base)
        if src is None:
            log("clipvars: missing", base)
            continue
        loop = base.endswith("_Loop")
        for suffix, tk in takes.items():
            name = "%s_%s" % (base, suffix)
            old = bpy.data.actions.get(name)
            if old is not None:
                bpy.data.actions.remove(old)
            act = src.copy()
            act.name = name
            act.use_fake_user = True
            fcs = _fcurves(act)
            f0, f1 = src.frame_range
            if tk.get("floor", True):
                lc0 = _curves(_fcurves(src), "pelvis", "location", 3)
                target = _toe_min(arm, src, [kp.co[0] for kp in lc0[0].keyframe_points]) if lc0 else None
            if tk.get("mirror"):
                _mirror(fcs)
            depth = lambda b: len(arm.data.bones[b].parent_recursive) if b in arm.data.bones else 0
            for bone, e in sorted(tk.get("bones", {}).items(), key=lambda it: depth(it[0])):
                _edit_bone(arm, fcs, bone, e, loop, f0, f1)
            for bone, pts in tk.get("locstill", {}).items():
                _still_loc(fcs, bone, pts, f0, f1)
            for bone, pts in tk.get("loc", {}).items():
                _edit_loc(arm, fcs, bone, pts, f0, f1)
            wp, speed = tk.get("warp"), tk.get("speed", 1.0)
            for f in fcs:
                for kp in f.keyframe_points:
                    for h in (kp.co, kp.handle_left, kp.handle_right):
                        t = h[0]
                        if wp:
                            t = f0 + (f1 - f0) * _warp(wp, (t - f0) / max(f1 - f0, 1e-6))
                        h[0] = f0 + (t - f0) / speed
                f.update()
            if tk.get("floor", True) and target:
                fix = _floor(arm, fcs, act, target)
                if fix > 0.03:
                    log("clipvars: %s floor fix up to %.2f m" % (act.name, fix))
            made.append(act.name)
    log("clipvars: made", len(made), "takes")
    return made
