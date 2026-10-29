"""The zombie's animations as rig poses: four frames each, phases from LEG_PLACEMENT_LOCK.

The creature faces +z; R = its right (x < 0), L = its left. In D3 (profile facing screen-left)
the near leg is L. Ankle targets are world points (rest ankle height 0.115 = foot flat on the
ground); wrist offsets are in chest space from the rest wrist.
"""
GROUND = 0.115     # ankle height with the foot flat
AX = 0.2           # feet apart while moving


def base(**kw):
    """The hunched idle: knees bent (pelvis down), back rounded, head held up to look ahead."""
    p = dict(root=(0, -0.06, 0), spine=(11, 0, 0), head=(-9, 0, 0),
             wristR=(0.01, 0.04, 0.06), wristL=(-0.01, 0.04, 0.06))   # elbows a little bent
    p.update(kw)
    return p


def mirror(p):
    """Swap left and right in a pose."""
    out = {}
    for k, val in p.items():
        if k.endswith("R") or k.endswith("L") or k.endswith("R_abs") or k.endswith("L_abs"):
            sw = k.replace("R", "#").replace("L", "R").replace("#", "L") if k[-1] in "RL" else \
                k.replace("R_abs", "#").replace("L_abs", "R_abs").replace("#", "L_abs")
            if k.startswith(("ankle", "wrist", "knee", "elbow")):
                val = (-val[0],) + tuple(val[1:])
            elif k.startswith("foot"):
                val = (val[0], -val[1])
            out[sw] = val
        elif k in ("spine", "hips", "head"):
            out[k] = (val[0], -val[1], -val[2])
        elif k == "root":
            out[k] = (-val[0], val[1], val[2])
        else:
            out[k] = val
    return out


# ------------------------------------------------------------------ idle: rest, inhale, exhale, settle
IDLE = [
    base(),
    base(root=(0, -0.052, 0), spine=(8, 0, 1), head=(-7, 2, 0), wristR=(0.01, 0.052, 0.06), wristL=(-0.01, 0.052, 0.06)),
    base(root=(0, -0.066, 0), spine=(13, 0, 0), head=(-10, 0, -2), wristR=(0.01, 0.032, 0.07), wristL=(-0.01, 0.032, 0.07)),
    base(root=(0.006, -0.06, 0), spine=(11, 3, -2), head=(-8, -4, 2)),
]

# ------------------------------------------------------------------ walk: contact A, pass A, contact B, pass B
# A = the near (left) leg leads.
WALK_A = base(root=(0, -0.07, 0), hips=(0, -7, 0), spine=(13, 9, 2), head=(-10, -6, -3),
              ankleL=(AX, GROUND, 0.19), footL=(-18, 0),           # heel strikes
              ankleR=(-AX, GROUND + 0.05, -0.17), footR=(32, 0),   # toe pushes off
              wristL=(0, 0.03, -0.1), wristR=(0, 0.06, 0.15))
PASS_A = base(root=(0.012, -0.035, 0), hips=(0, -2, 2), spine=(11, 2, -2), head=(-8, -2, 2),
              ankleL=(AX, GROUND, 0.0), footL=(0, 0),               # planted under the hip
              ankleR=(-AX, GROUND + 0.13, -0.05), footR=(22, 0),    # swinging through, knee bent
              wristL=(0, 0.01, -0.02), wristR=(0, 0.01, 0.03))
WALK = [WALK_A, PASS_A, mirror(WALK_A), mirror(PASS_A)]

# ------------------------------------------------------------------ run: push A, recover A, push B, recover B
RUN_A = base(root=(0, -0.09, 0.02), hips=(8, 9, 0), spine=(26, -11, 0), head=(-24, 8, 0),
             ankleL=(0.17, GROUND + 0.03, -0.16), footL=(34, 0),             # near leg pushes off
             ankleR=(-0.17, GROUND + 0.22, 0.13), footR=(5, 0),               # far knee drives up
             wristL=(0.04, 0.2, 0.24), elbowL=(0.6, -0.3, -1),                  # arms pump, bent
             wristR=(-0.02, 0.16, -0.14), elbowR=(-0.6, -0.3, -1))
REC_A = base(root=(0, -0.03, 0.02), hips=(8, 4, 0), spine=(24, -5, 0), head=(-22, 4, 0),
             ankleL=(0.17, GROUND + 0.30, -0.24), footL=(45, 0),             # heel kicks up behind
             ankleR=(-0.17, GROUND + 0.04, 0.2), footR=(-12, 0),              # reaching to land
             wristL=(0.03, 0.14, 0.14), elbowL=(0.6, -0.3, -1),
             wristR=(-0.02, 0.14, -0.06), elbowR=(-0.6, -0.3, -1))
RUN = [RUN_A, REC_A, mirror(RUN_A), mirror(REC_A)]

# ------------------------------------------------------------------ jump: crouch, launch, tuck, land
JUMP = [
    base(root=(0, -0.21, 0.0), hips=(14, 0, 0), spine=(24, 0, 0), head=(-26, 0, 0),
         wristR=(0, 0.06, -0.2), wristL=(0, 0.06, -0.2)),
    base(root=(0, 0.04, 0), hips=(-4, 0, 0), spine=(-4, 0, 0), head=(-6, 0, 0),
         ankleR=(-0.2, GROUND + 0.07, -0.05), footR=(48, 0),
         ankleL=(0.2, GROUND + 0.07, -0.05), footL=(48, 0),
         wristR=(0.04, 0.34, 0.3), wristL=(-0.04, 0.34, 0.3)),
    base(root=(0, 0.1, 0), hips=(6, 0, 0), spine=(18, 0, 0), head=(-14, 0, 0),
         ankleR=(-0.2, 0.43, 0.02), footR=(25, 0), ankleL=(0.2, 0.43, 0.02), footL=(25, 0),
         wristR=(-0.04, 0.2, 0.2), wristL=(0.04, 0.2, 0.2)),
    base(root=(0, -0.19, 0.0), hips=(12, 0, 0), spine=(22, 0, 0), head=(-22, 0, 0),
         ankleR=(-0.25, GROUND, 0.02), ankleL=(0.25, GROUND, 0.02),
         wristR=(-0.12, 0.1, 0.1), wristL=(0.12, 0.1, 0.1)),
]

# ------------------------------------------------------------------ melee: ready, wind-up, impact, recover
MELEE = [
    base(spine=(14, 0, 0), wristR=(0, 0.05, 0.09), wristL=(0, 0.05, 0.09)),
    base(root=(0, -0.05, -0.03), spine=(4, -24, 0), head=(-6, 18, 0),
         wristR=(-0.06, 0.56, -0.04), elbowR=(-1, 0.2, -0.4),               # claw raised by the head
         wristL=(0.02, 0.16, 0.2)),
    base(root=(0, -0.09, 0.08), hips=(6, 8, 0), spine=(26, 14, 0), head=(-26, -8, 0),
         ankleL=(AX + 0.02, GROUND, 0.24), footL=(-8, 0), ankleR=(-AX, GROUND + 0.02, -0.12), footR=(18, 0),
         wristR=(0.14, 0.44, 0.46), wristL=(-0.06, 0.42, 0.42)),            # both claws rake forward
    base(spine=(16, 4, 0), head=(-12, -2, 0), wristR=(0.03, 0.06, 0.12), wristL=(0, 0.05, 0.1)),
]

# ------------------------------------------------------------------ hurt: struck, stagger, catch, ready
STRUCK = base(root=(0, -0.03, -0.05), spine=(-18, 4, 6), head=(-30, 6, 4),
              wristR=(-0.16, 0.26, -0.1), wristL=(0.16, 0.22, -0.06))
HURT = [
    STRUCK,
    base(root=(0, -0.05, -0.06), spine=(-4, 0, -6), head=(-12, 0, -4),
         ankleR=(-AX, GROUND, -0.2), wristR=(-0.13, 0.12, 0.0), wristL=(0.13, 0.12, 0.0)),
    base(root=(0, -0.08, 0), spine=(26, 10, 0), head=(-6, 0, 0),
         wristR=(0.28, 0.25, 0.06), elbowR=(-0.6, -0.4, -1), wristL=(0, -0.02, 0.06)),
    base(),
]

# ------------------------------------------------------------------ death: struck, buckle, fall, still
DEATH = [
    base(root=(0, -0.03, -0.06), spine=(-22, 6, 8), head=(-34, 8, 6),
         wristR=(-0.2, 0.3, -0.12), wristL=(0.2, 0.26, -0.08)),
    base(root=(0, -0.43, 0.06), hips=(12, 0, 0), spine=(30, 0, 4), head=(8, 0, 6),   # knees hit the ground
         ankleR=(-0.2, 0.08, -0.36), footR=(72, 0), ankleL=(0.2, 0.08, -0.36), footL=(72, 0),
         wristR=(0.02, -0.12, 0.26), wristL=(-0.02, -0.12, 0.26)),
    base(root=(0, -0.6, 0.16), hips=(52, 0, 0), spine=(26, 0, 0), head=(-24, 0, 0),  # falling onto the hands
         ankleR=(-0.2, 0.07, -0.55), footR=(82, 0), ankleL=(0.2, 0.07, -0.55), footL=(82, 0),
         wristR_abs=(-0.26, 0.06, 0.76), wristL_abs=(0.26, 0.06, 0.74),
         elbowR=(-1, 0, 0.3), elbowL=(1, 0, 0.3)),
    base(root=(0, -0.8, 0.30), hips=(88, 0, 0), spine=(2, 0, 0), head=(0, 68, 0),   # face down, still
         ankleR=(-0.17, 0.07, -0.47), footR=(92, 0), ankleL=(0.21, 0.07, -0.44), footL=(92, 0),
         wristR_abs=(-0.36, 0.05, 0.86), wristL_abs=(0.32, 0.05, 0.56),
         elbowR=(-1, 0, 0.3), elbowL=(1, 0, 0.3)),
]

ANIMS = {   # name: (poses, tics, events (0-based frame -> list), loop)
    "idle": (IDLE, [12, 12, 12, 12], {}, True),
    "walk": (WALK, [7, 8, 7, 8], {"0": ["step"], "2": ["step"]}, True),
    "run": (RUN, [4, 5, 4, 5], {"0": ["step"], "2": ["step"]}, True),
    "jump": (JUMP, [4, 3, 7, 5], {"1": ["takeoff"], "3": ["land"]}, False),
    "melee": (MELEE, [4, 5, 4, 6], {"2": ["hit"]}, False),
    "hurt": (HURT, [3, 4, 4, 4], {}, False),
    "death": (DEATH, [4, 5, 6, 0], {"2": ["thud"], "3": ["hold"]}, False),
}
WIDE = {"death"}   # needs the big canvas
