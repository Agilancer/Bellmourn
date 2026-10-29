"""The zombie's animations, keyed onto the T-pose rig as Blender actions (30 fps).

A pose is a dict of bone -> (rx, ry, rz): degrees about the armature's own axes (X = the
zombie's left, -Y = forward, Z = up), applied at the bone's head in its rest frame and then
carried by its parents (forward kinematics). So for every bone, whatever its parents do:
  spine/chest/neck/head  +rx bends forward, +ry leans to its left, +rz turns its face left
  thigh  -rx swings forward; shin +rx bends the knee; foot +rx points the toes down
  arms are given for the LEFT side (pointing +X at rest): +ry lowers, -ry raises, -rz swings
  forward, +rz back, +rx rolls; elbows bend forward with -rz. `.R` keys mirror automatically.
`hips` may also carry an offset (metres, armature axes) under the key "move".

Clips (in place; the game moves the zombie): idle, walk, run, jump, attack1 (right-hand
overhead rake), attack2 (left backhand), attack3 (two-handed grab and bite), fall, death,
dead. HITS gives the frame of each attack where the blow lands.
"""
import math

import bpy
from mathutils import Euler, Matrix, Vector

FPS = 30
HITS = {"attack1": 14, "attack2": 14, "attack3": 21}
SIDES = ("upper_arm", "forearm", "hand", "shoulder", "thigh", "shin", "foot")


def mirror(r):
    return (r[0], -r[1], -r[2])


def pose(**kw):
    """pose(spine=(..), arm_L=..., arm_R=..., ...): names with _L/_R/_B (both) suffixes."""
    out = {}
    for k, v in kw.items():
        if k == "move":
            out["move"] = v
            continue
        base, _, side = k.rpartition("_")
        if side in ("L", "R", "B") and base in SIDES:
            if side in ("L", "B"):
                out[f"{base}.L"] = v
            if side in ("R", "B"):
                out[f"{base}.R"] = mirror(v)
        else:
            out[k] = v
    return out


def blend(a, b, k):
    out = {}
    for key in set(a) | set(b):
        va = a.get(key, (0, 0, 0))
        vb = b.get(key, (0, 0, 0))
        out[key] = tuple(x + (y - x) * k for x, y in zip(va, vb))
    return out


def over(base, **kw):
    """`base` with some bones replaced."""
    out = dict(base)
    out.update(pose(**kw))
    return out


# ------------------------------------------------------------------ the zombie's stance
STANCE = pose(
    move=(0, 0, -0.03),
    spine=(12, 0, 0), chest=(10, 0, 0), neck=(14, 0, 0), head=(-18, 4, 8),
    shoulder_B=(0, 6, -4),
    upper_arm_L=(0, 70, -14), forearm_L=(0, 0, -22), hand_L=(0, 0, -12),
    upper_arm_R=(0, 64, -20), forearm_R=(0, 0, -30), hand_R=(0, 0, -16),
    thigh_B=(-10, 0, 0), shin_B=(16, 0, 0), foot_B=(-6, 0, 0),
)


def idle():
    a = STANCE
    b = over(a, move=(0.01, 0, -0.04), spine=(14, -2, 0), chest=(12, 0, 2), head=(-14, -3, -4),
             upper_arm_L=(4, 74, -10), upper_arm_R=(-4, 60, -24), forearm_R=(0, 0, -34))
    c = over(a, move=(-0.01, 0, -0.035), spine=(13, 2, 0), head=(-20, 8, 14))
    return [(0, a), (20, b), (40, c), (60, a)]


def walk():
    # a shamble: the left leg strides, the right drags; arms reach out unevenly
    arms = dict(upper_arm_L=(0, 4, -82), forearm_L=(0, 0, -12), hand_L=(10, 0, -8),
                upper_arm_R=(0, 18, -72), forearm_R=(0, 0, -22), hand_R=(10, 0, -10))
    torso = dict(spine=(16, 0, 0), chest=(8, 0, 0), neck=(10, 0, 0), head=(-14, 0, 0))
    k0 = pose(move=(0.02, 0, -0.06), thigh_L=(-26, 0, 0), shin_L=(6, 0, 0), foot_L=(-14, 0, 0),
              thigh_R=(14, 0, 0), shin_R=(18, 0, 0), foot_R=(8, 0, 0), **torso, **arms)
    k0.update(pose(spine=(16, 4, 6), chest=(8, 0, -6), head=(-14, -6, 6)))
    k1 = pose(move=(0.035, 0, -0.01), thigh_L=(-2, 0, 0), shin_L=(10, 0, 0), foot_L=(-8, 0, 0),
              thigh_R=(-10, 0, 0), shin_R=(34, 0, 0), foot_R=(18, 0, 0), **torso, **arms)
    k1.update(pose(spine=(16, 6, 4), upper_arm_L=(0, 0, -86), upper_arm_R=(0, 22, -66)))
    k2 = pose(move=(-0.02, 0, -0.07), thigh_L=(10, 0, 0), shin_L=(20, 0, 0), foot_L=(4, 0, 0),
              thigh_R=(-16, 0, 0), shin_R=(4, 0, 0), foot_R=(-10, 0, 0), **torso, **arms)
    k2.update(pose(spine=(18, -5, -6), chest=(8, 0, 6), head=(-12, 8, -6), hand_R=(30, 0, -4)))
    k3 = pose(move=(-0.035, 0, -0.03), thigh_L=(-14, 0, 0), shin_L=(44, 0, 0), foot_L=(10, 0, 0),
              thigh_R=(4, 0, 0), shin_R=(14, 0, 0), foot_R=(-4, 0, 0), **torso, **arms)
    k3.update(pose(spine=(17, -6, -4), upper_arm_L=(0, 8, -78), upper_arm_R=(0, 14, -76)))
    return [(0, k0), (10, k1), (18, k2), (28, k3), (36, k0)]


def run():
    # a lurching sprint, bent low, arms flailing out in front
    torso = dict(spine=(26, 0, 0), chest=(12, 0, 0), neck=(4, 0, 0), head=(-22, 0, 0))
    c = pose(move=(0, 0, -0.1), thigh_L=(-42, 0, 0), shin_L=(10, 0, 0), foot_L=(-18, 0, 0),
             thigh_R=(28, 0, 0), shin_R=(40, 0, 0), foot_R=(20, 0, 0),
             upper_arm_L=(0, 34, -30), forearm_L=(0, 0, -40), upper_arm_R=(0, 20, -88), forearm_R=(0, 0, -20),
             **torso)
    c.update(pose(spine=(26, 0, 8), chest=(12, 0, -8)))
    f = pose(move=(0, 0, 0.02), thigh_L=(-10, 0, 0), shin_L=(30, 0, 0), foot_L=(0, 0, 0),
             thigh_R=(-30, 0, 0), shin_R=(95, 0, 0), foot_R=(20, 0, 0),
             upper_arm_L=(0, 26, -60), forearm_L=(0, 0, -30), upper_arm_R=(0, 26, -60), forearm_R=(0, 0, -30),
             **torso)
    c2 = pose(move=(0, 0, -0.1), thigh_R=(-42, 0, 0), shin_R=(10, 0, 0), foot_R=(-18, 0, 0),
              thigh_L=(28, 0, 0), shin_L=(40, 0, 0), foot_L=(20, 0, 0),
              upper_arm_R=(0, 34, -30), forearm_R=(0, 0, -40), upper_arm_L=(0, 20, -88), forearm_L=(0, 0, -20),
              **torso)
    c2.update(pose(spine=(26, 0, -8), chest=(12, 0, 8)))
    f2 = pose(move=(0, 0, 0.02), thigh_R=(-10, 0, 0), shin_R=(30, 0, 0), foot_R=(0, 0, 0),
              thigh_L=(-30, 0, 0), shin_L=(95, 0, 0), foot_L=(20, 0, 0),
              upper_arm_L=(0, 26, -60), forearm_L=(0, 0, -30), upper_arm_R=(0, 26, -60), forearm_R=(0, 0, -30),
              **torso)
    return [(0, c), (5, f), (10, c2), (15, f2), (20, c)]


def jump():
    crouch = over(STANCE, move=(0, 0, -0.26), spine=(32, 0, 0), chest=(12, 0, 0), head=(-26, 0, 0),
                  thigh_B=(-64, 0, 0), shin_B=(104, 0, 0), foot_B=(-36, 0, 0),
                  upper_arm_B=(0, 58, 34), forearm_B=(0, 0, -20))
    push = over(STANCE, move=(0, -0.05, 0.12), spine=(14, 0, 0), chest=(4, 0, 0), head=(-12, 0, 0),
                thigh_B=(8, 0, 0), shin_B=(6, 0, 0), foot_B=(34, 0, 0),
                upper_arm_B=(0, -24, -64), forearm_B=(0, 0, -16))
    apex = over(STANCE, move=(0, -0.1, 0.55), spine=(18, 0, 0), chest=(6, 0, 0), head=(-16, 0, 0),
                thigh_L=(-56, 0, 0), shin_L=(96, 0, 0), thigh_R=(-30, 0, 0), shin_R=(70, 0, 0), foot_B=(10, 0, 0),
                upper_arm_B=(0, -10, -78), forearm_B=(0, 0, -24))
    land = over(STANCE, move=(0, 0, -0.22), spine=(30, 0, 0), chest=(10, 0, 0), head=(-24, 0, 0),
                thigh_B=(-56, 0, 0), shin_B=(92, 0, 0), foot_B=(-34, 0, 0),
                upper_arm_B=(0, 40, -40), forearm_B=(0, 0, -20))
    return [(0, STANCE), (7, crouch), (11, push), (18, apex), (24, land), (34, STANCE)]


def attack1():
    # right hand: raised high behind the head, then raked down and across
    wind = over(STANCE, move=(0, 0.04, -0.02), spine=(4, 0, -10), chest=(-4, 0, -18), head=(-12, 0, 6),
                upper_arm_R=(20, -68, 10), forearm_R=(0, 0, -50), hand_R=(0, 0, -20),
                upper_arm_L=(0, 50, -40), forearm_L=(0, 0, -30), thigh_R=(4, 0, 0), thigh_L=(-22, 0, 0))
    strike = over(STANCE, move=(0, -0.12, -0.08), spine=(28, 0, 14), chest=(16, 0, 20), head=(-24, 0, -6),
                  upper_arm_R=(0, 30, -84), forearm_R=(0, 0, -8), hand_R=(0, 0, 10),
                  upper_arm_L=(0, 62, -10), thigh_L=(-36, 0, 0), shin_L=(30, 0, 0), thigh_R=(16, 0, 0))
    follow = over(strike, upper_arm_R=(0, 66, -110), forearm_R=(0, 0, -30), chest=(16, 0, 28), spine=(30, 0, 18))
    return [(0, STANCE), (8, wind), (14, strike), (18, follow), (27, STANCE)]


def attack2():
    # left backhand: the arm wound across the chest, then flung out to the side
    wind = over(STANCE, move=(0, 0.02, -0.03), spine=(10, 0, 12), chest=(6, 0, 20), head=(-14, 0, -12),
                upper_arm_L=(30, 16, -128), forearm_L=(0, 0, -60), hand_L=(0, 0, -30),
                thigh_L=(-4, 0, 0), thigh_R=(-18, 0, 0))
    strike = over(STANCE, move=(0, -0.08, -0.06), spine=(22, 0, -14), chest=(12, 0, -26), head=(-18, 0, 14),
                  upper_arm_L=(0, 6, -34), forearm_L=(0, 0, -6), hand_L=(0, 0, 14),
                  upper_arm_R=(0, 66, -10), thigh_L=(-30, 0, 0), shin_L=(26, 0, 0), thigh_R=(12, 0, 0))
    follow = over(strike, upper_arm_L=(0, 24, 4), chest=(12, 0, -32))
    return [(0, STANCE), (8, wind), (14, strike), (18, follow), (27, STANCE)]


def attack3():
    # both hands reach up and out, seize, drag the prey in and bite
    reach = over(STANCE, move=(0, 0.03, 0.0), spine=(0, 0, 0), chest=(-6, 0, 0), neck=(4, 0, 0), head=(-20, 0, 0),
                 upper_arm_B=(0, -14, -70), forearm_B=(0, 0, -6), hand_B=(-20, 0, 0),
                 thigh_B=(-6, 0, 0), shin_B=(8, 0, 0))
    grab = over(STANCE, move=(0, -0.16, -0.08), spine=(30, 0, 0), chest=(14, 0, 0), neck=(18, 0, 0), head=(-26, 0, 0),
                upper_arm_B=(0, 10, -96), forearm_B=(0, 0, -42), hand_B=(-10, 0, -20),
                thigh_L=(-40, 0, 0), shin_L=(36, 0, 0), thigh_R=(14, 0, 0), shin_R=(20, 0, 0))
    bite = over(grab, neck=(36, 0, 0), head=(-6, 0, 0), forearm_B=(0, 0, -70), upper_arm_B=(0, 18, -104))
    pull = over(grab, move=(0, -0.08, -0.06), neck=(20, 0, 0), head=(-30, 0, 6), forearm_B=(0, 0, -86))
    return [(0, STANCE), (10, reach), (17, grab), (21, bite), (27, pull), (38, STANCE)]


def fall():
    a = pose(move=(0, 0, 0), spine=(-8, 0, 0), chest=(-6, 0, 0), neck=(0, 0, 0), head=(-20, 0, 0),
             upper_arm_L=(0, -40, -20), forearm_L=(0, 0, -30), upper_arm_R=(0, -20, -40), forearm_R=(0, 0, -20),
             thigh_L=(-40, 0, 0), shin_L=(60, 0, 0), thigh_R=(-14, 0, 0), shin_R=(40, 0, 0), foot_B=(20, 0, 0))
    b = pose(move=(0, 0, 0), spine=(-10, 0, 0), chest=(-8, 0, 0), head=(-26, 0, 0),
             upper_arm_L=(0, -18, -44), forearm_L=(0, 0, -20), upper_arm_R=(0, -44, -16), forearm_R=(0, 0, -34),
             thigh_L=(-16, 0, 0), shin_L=(36, 0, 0), thigh_R=(-44, 0, 0), shin_R=(70, 0, 0), foot_B=(20, 0, 0))
    return [(0, a), (9, b), (18, a)]


LYING = pose(move=(0, 0.42, -0.8), hips=(-88, 0, 0), spine=(-4, 0, 0), chest=(-2, 0, 0), neck=(-6, 0, 0),
             head=(-8, 0, 34), shoulder_B=(0, 0, 0),
             upper_arm_L=(-50, 40, 30), forearm_L=(0, 0, -30), hand_L=(-20, 0, 0),
             upper_arm_R=(-60, 14, 10), forearm_R=(0, 0, -50), hand_R=(-20, 0, 0),
             thigh_L=(-14, 0, 6), shin_L=(24, 0, 0), foot_L=(30, 0, 0),
             thigh_R=(-4, 0, -4), shin_R=(8, 0, 0), foot_R=(40, 0, 0))


def death():
    recoil = over(STANCE, move=(0, 0.08, 0.0), spine=(-14, 0, 6), chest=(-10, 0, 0), neck=(-10, 0, 0), head=(-30, 0, 10),
                  upper_arm_L=(0, -10, 10), forearm_L=(0, 0, -40), upper_arm_R=(0, 10, 20), forearm_R=(0, 0, -30),
                  thigh_R=(10, 0, 0))
    buckle = over(STANCE, move=(0, 0.12, -0.4), spine=(18, 0, -6), chest=(8, 0, 0), neck=(20, 0, 0), head=(-10, 0, 20),
                  upper_arm_B=(0, 76, 0), forearm_B=(0, 0, -10),
                  thigh_B=(-74, 0, 0), shin_B=(118, 0, 0), foot_B=(-30, 0, 0))
    tip = over(buckle, move=(0, 0.3, -0.62), hips=(-48, 0, 0), spine=(-6, 0, 0), chest=(-4, 0, 0), neck=(-4, 0, 0),
               upper_arm_L=(-30, 30, 20), upper_arm_R=(-30, 20, 10),
               thigh_B=(-46, 0, 0), shin_B=(76, 0, 0))
    bounce = over(LYING, move=(0, 0.42, -0.76), head=(-14, 0, 26))
    return [(0, STANCE), (6, recoil), (18, buckle), (28, tip), (37, LYING), (41, bounce), (48, LYING)]


def dead():
    return [(0, LYING), (30, LYING)]


# ------------------------------------------------------------------ on the ground (a leg gone)
PRONE = pose(move=(0, -0.42, -0.77), hips=(84, 0, 0), spine=(-6, 0, 0), chest=(-10, 0, 0), neck=(-34, 0, 0),
             head=(-26, 0, 0), shoulder_B=(0, 0, 0),
             upper_arm_L=(0, -60, -30), forearm_L=(0, 0, -50), hand_L=(0, 0, -20),
             upper_arm_R=(0, 30, -50), forearm_R=(0, 0, -60), hand_R=(0, 0, -20),
             thigh_L=(6, 0, 4), shin_L=(10, 0, 0), foot_L=(40, 0, 0),
             thigh_R=(2, 0, -4), shin_R=(20, 0, 0), foot_R=(40, 0, 0))


def collapse():
    knees = over(STANCE, move=(0, -0.08, -0.42), spine=(34, 0, 0), chest=(14, 0, 0), head=(-20, 0, 0),
                 thigh_B=(-70, 0, 0), shin_B=(112, 0, 0), foot_B=(-30, 0, 0),
                 upper_arm_B=(0, 40, -60), forearm_B=(0, 0, -20))
    pitch = over(knees, move=(0, -0.3, -0.62), hips=(50, 0, 0), spine=(10, 0, 0),
                 upper_arm_B=(0, 10, -70), forearm_B=(0, 0, -10), thigh_B=(-30, 0, 0), shin_B=(60, 0, 0))
    slam = over(PRONE, move=(0, -0.42, -0.79), neck=(-14, 0, 0), head=(-10, 0, 0))
    return [(0, STANCE), (8, knees), (16, pitch), (22, slam), (30, PRONE)]


def crawl():
    # face down, dragging itself on alternate arms, head craned up at you
    a = over(PRONE, upper_arm_L=(0, -72, -26), forearm_L=(0, 0, -20), hand_L=(0, 0, -30),
             upper_arm_R=(0, 34, -48), forearm_R=(0, 0, -70), chest=(-10, 0, 8), head=(-26, 0, -8))
    a2 = over(a, move=(0, -0.42, -0.74), upper_arm_L=(0, -30, -46), forearm_L=(0, 0, -60),
              upper_arm_R=(0, -20, -40), forearm_R=(0, 0, -40), chest=(-14, 0, 0))
    b = over(PRONE, upper_arm_R=(0, -72, -26), forearm_R=(0, 0, -20), hand_R=(0, 0, -30),
             upper_arm_L=(0, 34, -48), forearm_L=(0, 0, -70), chest=(-10, 0, -8), head=(-26, 0, 8),
             thigh_L=(2, 0, 0), thigh_R=(8, 0, 0))
    b2 = over(b, move=(0, -0.42, -0.74), upper_arm_R=(0, -30, -46), forearm_R=(0, 0, -60),
              upper_arm_L=(0, -20, -40), forearm_L=(0, 0, -40), chest=(-14, 0, 0))
    return [(0, a), (12, a2), (24, b), (36, b2), (48, a)]


def crawl_attack():
    rear = over(PRONE, move=(0, -0.36, -0.66), spine=(-24, 0, 0), chest=(-16, 0, 0), neck=(-20, 0, 0),
                upper_arm_L=(0, 50, -70), forearm_L=(0, 0, -30), upper_arm_R=(0, -70, -10), forearm_R=(0, 0, -40))
    lunge = over(PRONE, move=(0, -0.52, -0.7), spine=(-14, 0, 0), chest=(-8, 0, 0), neck=(-40, 0, 0), head=(-10, 0, 0),
                 upper_arm_R=(0, -84, -40), forearm_R=(0, 0, -6), hand_R=(0, 0, 20),
                 upper_arm_L=(0, 40, -50))
    return [(0, PRONE), (9, rear), (13, lunge), (18, lunge), (28, PRONE)]


PRONE_DEAD = over(PRONE, move=(0, -0.42, -0.8), neck=(-4, 0, 0), head=(4, 0, 30), chest=(-2, 0, 0),
                  upper_arm_L=(0, -20, -16), forearm_L=(0, 0, -10), upper_arm_R=(0, 50, -20), forearm_R=(0, 0, -10))


def crawl_death():
    spasm = over(PRONE, spine=(-22, 0, 6), chest=(-14, 0, 0), neck=(-40, 0, 0), head=(-30, 0, -10),
                 upper_arm_B=(0, -40, -50))
    twitch = over(PRONE_DEAD, upper_arm_R=(0, 40, -30), head=(0, 0, 20))
    return [(0, PRONE), (6, spasm), (16, PRONE_DEAD), (22, twitch), (30, PRONE_DEAD)]


def crawl_dead():
    return [(0, PRONE_DEAD), (30, PRONE_DEAD)]


HITS["crawl_attack"] = 13
CLIPS = {"idle": idle, "walk": walk, "run": run, "jump": jump, "attack1": attack1, "attack2": attack2,
         "attack3": attack3, "fall": fall, "death": death, "dead": dead, "collapse": collapse,
         "crawl": crawl, "crawl_attack": crawl_attack, "crawl_death": crawl_death, "crawl_dead": crawl_dead}


def bake(ao):
    """Key every clip onto the armature `ao` (rest pose = the T-pose) as its own action."""
    rest = {b.name: b.matrix_local.copy() for b in ao.data.bones}
    order = [b.name for b in ao.data.bones]                     # parents come first
    for pb in ao.pose.bones:
        pb.rotation_mode = "QUATERNION"
    ao.animation_data_create()
    made = []
    for name, fn in CLIPS.items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        ao.animation_data.action = act
        for frame, p in fn():
            delta = {}
            for bn in order:
                b = ao.data.bones[bn]
                r = p.get(bn, (0, 0, 0))
                R = Euler([math.radians(a) for a in r], "XYZ").to_matrix().to_4x4()
                h = rest[bn].translation
                local = Matrix.Translation(h) @ R @ Matrix.Translation(-h)
                if bn == "hips" and "move" in p:
                    local = Matrix.Translation(Vector(p["move"])) @ local
                delta[bn] = (delta[b.parent.name] if b.parent else Matrix.Identity(4)) @ local
                basis = rest[bn].inverted() @ local @ rest[bn]
                loc, rot, _ = basis.decompose()
                pb = ao.pose.bones[bn]
                pb.location = loc
                pb.rotation_quaternion = rot
                pb.keyframe_insert("location", frame=frame + 1, group=bn)
                pb.keyframe_insert("rotation_quaternion", frame=frame + 1, group=bn)
        made.append(act)
    ao.animation_data.action = None
    for pb in ao.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
    return made
