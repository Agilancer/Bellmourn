"""The first-person move set for the 3D arms: carries, attacks, shield work and spellcasting.

The hands ride at the sides of the screen (the middle stays open to see what's ahead), and
the attacks, blocks and casts are keyed from Quaternius' Universal Animation Library mannequin
(UAL1 + UAL2, CC0): `ref="Clip@frame"` names the library frame each key was taken from (at 30
fps; tools/templates/ual_ref.py writes what the mannequin's own eyes see at every frame, into
ual_ref.json). A third-person swing turns the whole body and lifts the arm above the head;
seen from the eyes most of that is off screen, so each key keeps the reference's direction of
travel, blade angle and timing but is placed where a first-person view can show it: nothing
leaves the top of the screen, cuts slash across it (never a stab), and every strike crosses
the crosshair on its hit frame. The two chops keep the timing of the user's own swing video
(`ref=<video frame>`) but drop straight down through the target, and land harder (`power`).
`flat` turns a blade in the fist toward showing its flat (the models are thin along the item
socket's x), so no cut frame reads as an edge-on stick.

Keys use the same fields as anims.py, but positions are given where they are DRAWN (the
whole rig is shrunk 0.58 toward the bottom centre): `at(x, y, z)` takes fractions of the
screen as you see it, plus depth in metres. The hands are pushed out to the sides by STRETCH:
each arm is slid sideways on screen (never bent or scaled) by (STRETCH - 1) times how far its
grip is from the centre, so the poses stay within the arm's reach while the hands sit wide,
and anything that crosses the centre still crosses it. The game does the sliding
(viewmodel.js), widening it on screens wider than 16:10. `twist` turns the chest (degrees,
positive to the left), so a cut can follow through across the body and two hands can share a
grip at the side; `shrug` lifts the shoulder (metres) while the arm is raised.

    python tools/models/build_moves.py      # bakes these into templates/models/arms/fp_moves_*.glb
"""
import math

import anims
from anims import W, H, mirror, walk_cycle, lerp_key, lerp_hand
import fp_rig as R

VIEW = R.REST_SCALE
STRETCH = 1.3                  # how much wider the hands are drawn than they are posed
RAISED = anims.RAISED          # elbow lifted out to the side while the arm is up
META = ("name", "tics", "hit", "fire", "smear", "view", "ref", "enter", "link", "hold", "aside")


def at(xf, yf, z):
    """Where the fist is DRAWN (fractions of the screen, after the sideways stretch) and its
    depth -> rig key position."""
    xf = 0.5 + (xf - 0.5) / STRETCH
    return (W / 2 + (xf * W - W / 2) / VIEW, H - (H - yf * H) / VIEW, z)


def slide(arms):
    """How far (drawn px) each arm is slid sideways: {side: px}. Two hands on one grip slide
    together, by the right hand's amount."""
    g = {a["side"]: R.project(a["G"])[0] - W / 2 for a in arms if a["G"][2] > R.NEAR}
    out = {s: x * (STRETCH - 1) for s, x in g.items()}
    if any(a.get("support") for a in arms) and "R" in out:
        out["L"] = out["R"]
    return out


def k(name, tics, xf, yf, z, ang, dz, **extra):
    """A weapon key (fist drawn at xf, yf)."""
    return dict(name=name, tics=tics, S=at(xf, yf, z), ang=ang, dz=dz, **extra)


def pose(base, name, tics, **extra):
    return dict(base, name=name, tics=tics, **extra)


def palm(name, tics, xf, yf, z, fing, palm_dir, curl, spread=1.0, **extra):
    """An open-hand key (the palm's centre drawn at xf, yf)."""
    return dict(name=name, tics=tics, S=at(xf, yf, z), fing=fing, palm=palm_dir, curl=curl,
                spread=spread, ang=90, cast=True, **extra)


def lerp_twist(a, b, s):
    return a.get("twist", 0) + (b.get("twist", 0) - a.get("twist", 0)) * s


def towards(a, b, s, name, tics, **extra):
    """A key part-way from a to b (weapon or shield keys), twist included."""
    out = lerp_key(dict(a), dict(b), s, name=name, tics=tics, **extra)
    for m in ("ref", "hit", "smear", "fire", "enter", "link", "hold"):
        if m not in extra:
            out.pop(m, None)
    tw = lerp_twist(a, b, s)
    if tw:
        out["twist"] = tw
    else:
        out.pop("twist", None)
    return out


# ---------------------------------------------------------------- carries (where hands rest)
# drawn positions: weapon fists in the lower right fifth, shields low in the left corner,
# empty hands just inside the corners; the middle 60% of the screen stays clear
SWORD = dict(S=at(0.80, 0.90, 0.40), ang=86, dz=0.05)
GREAT = dict(S=at(0.76, 0.90, 0.42), ang=62, dz=0.15, twist=-22)  # (torso turned right)
STAFF = dict(S=at(0.83, 0.95, 0.36), ang=90, dz=0.05)
ROUND = dict(S=at(0.86, 0.93, 0.42), ang=165, dz=0.10, face=(0.62, 0.14, 0.77))
KITE = dict(S=at(0.85, 1.05, 0.46), ang=100, dz=0.10, face=(0.62, 0.10, 0.78))
HAND = palm("READY", 2, 0.82, 0.89, 0.33, (-0.10, 0.30, 0.95), (-0.40, -0.90, 0.15), 0.55)
BOTH = palm("READY", 2, 0.75, 0.90, 0.32, (-0.15, 0.30, 0.94), (-0.45, -0.85, 0.25), 0.55)
GRIP_2H = anims.GRIP_2H



# ---------------------------------------------------------------- one-handed (right; left mirrors)
# Overhand chop: the user's swing video (frames 78-115), now from and back to the side carry.
SWORD_CHOP = [
    pose(SWORD, "CARRY", 2, ref=78),
    k("LIFT", 2, 0.78, 0.78, 0.42, 62, -0.05, ref=82),
    k("RAISE", 2, 0.72, 0.70, 0.41, 45, -0.15, pole=RAISED, shrug=0.03, ref=84),
    k("COCK BACK", 2, 0.66, 0.64, 0.40, 32, -0.20, pole=RAISED, shrug=0.05, flat=0.3, ref=87,
      enter=True),
    k("OVERHEAD", 1, 0.64, 0.63, 0.40, 30, -0.22, pole=RAISED, shrug=0.06, flat=0.3, ref=95),
    k("COME OVER", 2, 0.61, 0.62, 0.46, 100, 0.75, pole=RAISED, shrug=0.05, smear=True, flat=0.5,
      ref=104),
    k("CHOP 1", 1, 0.56, 0.58, 0.46, 118, 0.50, smear=True, flat=0.6, ref=105),
    k("HIT", 1, 0.56, 0.76, 0.48, 118, 0.50, smear=True, hit=True, flat=0.6, ref=107),
    k("DRIVE", 1, 0.56, 0.93, 0.47, 118, 0.50, smear=True, flat=0.6, ref=108),
    k("PITCH", 1, 0.55, 0.91, 0.46, 150, 0.50, flat=0.5, ref=109),
    k("DIP", 1, 0.55, 0.93, 0.46, 190, 0.45, flat=0.4, ref=110),
    k("GUARD", 2, 0.56, 0.94, 0.45, 240, 0.40, ref=115, link=True),
    k("UNDER", 2, 0.64, 0.96, 0.43, 300, 0.25),
    k("COME UP", 2, 0.74, 0.93, 0.41, 370, 0.15),
    pose(SWORD, "SETTLE", 2),
]

# Diagonal cut (UAL1 Sword_Attack): lift and lay the blade back over the right shoulder, then
# cut down across the view from upper right to lower left, the chest turning into it.
SWORD_DIAG = [
    pose(SWORD, "CARRY", 2, ref="Sword_Attack@0"),
    k("LIFT", 2, 0.82, 0.78, 0.44, 60, 0.00, ref="Sword_Attack@3"),
    k("COCK", 2, 0.82, 0.70, 0.42, 38, -0.15, twist=-8, pole=(1.0, -0.1, -0.4),
      ref="Sword_Attack@6", enter=True),
    k("COCKED", 3, 0.82, 0.68, 0.40, 30, -0.18, twist=-12, pole=(1.0, -0.1, -0.4),
      ref="Sword_Attack@9"),
    k("OVER", 1, 0.75, 0.65, 0.40, 70, 0.25, twist=-6, pole=(1.0, 0.0, -0.3), smear=True,
      flat=0.4, ref="Sword_Attack@11"),
    k("CUT", 1, 0.68, 0.66, 0.48, 110, 0.25, twist=2, pole=(1.0, -0.2, -0.3), smear=True, flat=0.5,
      ref="Sword_Attack@12"),
    k("HIT", 2, 0.58, 0.70, 0.48, 140, 0.35, twist=8, smear=True, hit=True, flat=0.5,
      ref="Sword_Attack@13"),
    k("THROUGH", 1, 0.47, 0.79, 0.48, 175, 0.35, twist=14, smear=True, flat=0.4,
      ref="Sword_Attack@14"),
    k("FOLLOW", 2, 0.40, 0.88, 0.46, 205, 0.30, twist=18, ref="Sword_Attack@15"),
    k("HANG", 1, 0.40, 0.90, 0.45, 215, 0.30, twist=18, ref="Sword_Attack@21", link=True),
    k("UNDER", 2, 0.52, 0.94, 0.43, 245, 0.30, twist=10, ref="Sword_Attack@27"),
    k("ROUND", 2, 0.66, 0.95, 0.42, 300, 0.25, twist=4, ref="Sword_Attack@30"),
    k("COME UP", 2, 0.76, 0.93, 0.41, 370, 0.15, ref="Sword_Attack@33"),
    pose(SWORD, "SETTLE", 2, ref="Sword_Attack@46"),
]

# Backhand (UAL2 Sword_Regular_B): cross the blade back over the left shoulder, then sweep it
# flat across the view to the right; the arm ends out at the right side.
SWORD_BACK = [
    pose(SWORD, "CARRY", 2, ref="Sword_Regular_B@0"),
    k("CROSS", 2, 0.64, 0.82, 0.42, 160, 0.40, twist=10, flat=0.6, ref="Sword_Regular_A@13"),
    k("CHAMBER", 2, 0.44, 0.72, 0.42, 186, -0.35, twist=20, flat=0.3, ref="Sword_Regular_B@3",
      enter=True),
    k("COILED", 2, 0.43, 0.71, 0.42, 188, -0.40, twist=22, flat=0.3, ref="Sword_Regular_B@5"),
    k("WHIP", 1, 0.50, 0.65, 0.44, 182, -0.05, twist=14, shrug=0.02, smear=True, flat=0.5,
      ref="Sword_Regular_B@7"),
    k("HIT", 2, 0.60, 0.60, 0.44, 188, 0.20, twist=10, shrug=0.03, smear=True, hit=True, flat=0.6,
      ref="Sword_Regular_B@8"),
    k("SWEEP", 1, 0.71, 0.62, 0.46, 205, 0.20, twist=-6, smear=True, flat=0.5,
      ref="Sword_Regular_B@9"),
    k("ROLL", 1, 0.77, 0.65, 0.46, 270, 0.15, twist=-12, flat=0.4, ref="Sword_Regular_B@10"),
    k("EXTEND", 1, 0.80, 0.66, 0.46, 320, 0.10, twist=-16, flat=0.4, ref="Sword_Regular_B@10"),
    k("HOLD", 2, 0.81, 0.67, 0.46, 335, 0.05, twist=-16, flat=0.4, ref="Sword_Regular_B@16", link=True),
    k("RETURN 1", 2, 0.84, 0.78, 0.44, 400, 0.00, twist=-8, ref="Sword_Regular_B_Rec@10"),
    k("RETURN 2", 2, 0.82, 0.86, 0.42, 438, 0.00, twist=-3, ref="Sword_Regular_B_Rec@20"),
    pose(SWORD, "SETTLE", 2, ref="Sword_Regular_B_Rec@31"),
]

# Rising slash (UAL2 Sword_Regular_A): drop the blade back and low on the right, then cut up
# across the view to high on the left.
SWORD_RISE = [
    pose(SWORD, "CARRY", 2, ref="Sword_Regular_A@0"),
    k("DROP", 2, 0.84, 0.92, 0.40, 30, -0.15, ref="Sword_Regular_A@3", enter=True),
    k("WOUND", 2, 0.80, 0.91, 0.40, 15, -0.10, flat=0.3, ref="Sword_Regular_A@5"),
    k("SWEEP", 1, 0.68, 0.90, 0.46, -25, 0.20, twist=4, smear=True, flat=0.4,
      ref="Sword_Regular_A@7"),
    k("HIT", 2, 0.53, 0.82, 0.48, 100, 0.30, twist=10, smear=True, hit=True, flat=0.5,
      ref="Sword_Regular_A@8"),
    k("RISE", 1, 0.49, 0.82, 0.46, 118, 0.30, twist=14, smear=True, flat=0.5,
      ref="Sword_Regular_A@9"),
    k("TOP", 1, 0.46, 0.84, 0.44, 140, 0.30, twist=18, flat=0.5, ref="Sword_Regular_A@10"),
    k("HOLD", 1, 0.46, 0.84, 0.44, 142, 0.30, twist=18, flat=0.5, ref="Sword_Regular_A@13",
      link=True),
    k("DOWN", 2, 0.44, 0.88, 0.43, 200, 0.30, twist=16, ref="Sword_Regular_A_Rec@8"),
    k("UNDER", 2, 0.52, 0.94, 0.43, 250, 0.30, twist=10, ref="Sword_Regular_A_Rec@14"),
    k("ROUND", 2, 0.66, 0.95, 0.42, 310, 0.25, twist=4, ref="Sword_Regular_A_Rec@20"),
    k("COME UP", 2, 0.76, 0.93, 0.41, 380, 0.15),
    pose(SWORD, "SETTLE", 2, ref="Sword_Regular_A_Rec@29"),
]

# While a shield is up, the sword hand draws back down and out of its way (8 frames, frame
# for frame with the block).
SWORD_BACK_POSE = dict(S=at(0.86, 0.98, 0.34), ang=60, dz=0.30)
GUARD_PULL = (0.0, 0.45, 0.85, 1.0, 1.0, 0.70, 0.35, 0.06)


# ---------------------------------------------------------------- two-handed (right + left support)
GREAT_CHOP = [
    pose(GREAT, "CARRY", 2, ref=126),
    k("LIFT", 3, 0.78, 0.86, 0.43, 45, 0.10, twist=-20, ref=128),
    k("COCK", 3, 0.76, 0.80, 0.43, 22, -0.08, pole=RAISED, twist=-16, ref=132),
    k("COCK BACK", 3, 0.72, 0.77, 0.43, 18, -0.10, pole=RAISED, twist=-14, ref=136, enter=True),
    k("OVERHEAD", 1, 0.70, 0.74, 0.43, 16, -0.12, pole=RAISED, twist=-12, ref=142),
    k("COME OVER", 3, 0.63, 0.70, 0.45, 105, 0.60, pole=RAISED, twist=-6, smear=True, flat=0.5,
      ref=150),
    k("CHOP 1", 1, 0.57, 0.64, 0.46, 124, 0.55, twist=0, smear=True, flat=0.6, ref=152),
    k("HIT", 2, 0.57, 0.82, 0.47, 124, 0.55, twist=2, smear=True, hit=True, flat=0.6, ref=155),
    k("DRIVE", 1, 0.57, 0.95, 0.46, 124, 0.55, twist=4, smear=True, flat=0.6, ref=156),
    k("DIP", 3, 0.57, 0.95, 0.45, 180, 0.40, twist=6, ref=158, link=True),
    k("SLIDE", 2, 0.67, 0.96, 0.45, 200, 0.40, twist=-4),
    k("TURN", 2, 0.75, 0.94, 0.44, 290, 0.40, twist=-14),
    k("RAISE", 2, 0.77, 0.91, 0.43, 380, 0.40, twist=-20),
    pose(GREAT, "SETTLE", 2, ref=165),
]

# Cleave (UAL1 Sword_Attack, two hands): the diagonal cut, heavier and lower.
GREAT_CLEAVE = [
    pose(GREAT, "CARRY", 2, ref="Sword_Attack@0"),
    k("LIFT", 3, 0.77, 0.82, 0.46, 40, 0.10, twist=-22, ref="Sword_Attack@3"),
    k("COCK", 3, 0.78, 0.74, 0.48, 20, -0.05, twist=-24, ref="Sword_Attack@6", enter=True),
    k("COCKED", 3, 0.78, 0.73, 0.48, 16, -0.06, twist=-24, ref="Sword_Attack@9"),
    k("OVER", 2, 0.71, 0.71, 0.50, 55, 0.15, twist=-12, smear=True, flat=0.3, ref="Sword_Attack@11"),
    k("CUT", 1, 0.62, 0.72, 0.50, 100, 0.30, twist=-2, smear=True, flat=0.4, ref="Sword_Attack@12"),
    k("HIT", 2, 0.55, 0.77, 0.50, 140, 0.35, twist=6, smear=True, hit=True, flat=0.5,
      ref="Sword_Attack@13"),
    k("THROUGH", 1, 0.50, 0.86, 0.48, 180, 0.35, twist=14, smear=True, flat=0.4, ref="Sword_Attack@14"),
    k("FOLLOW", 4, 0.47, 0.93, 0.46, 195, 0.30, twist=18, ref="Sword_Attack@18", link=True),
    k("UNDER", 2, 0.54, 0.94, 0.44, 250, 0.30, twist=6, ref="Sword_Attack@27"),
    k("ROUND", 2, 0.66, 0.95, 0.43, 310, 0.25, twist=-8, ref="Sword_Attack@30"),
    k("COME UP", 2, 0.74, 0.93, 0.43, 380, 0.20, twist=-18, ref="Sword_Attack@33"),
    pose(GREAT, "SETTLE", 2, ref="Sword_Attack@46"),
]

# Backsweep (UAL2 Sword_Dash / Sword_Regular_B, two hands): carry it across to the left, then
# sweep flat to the right.
GREAT_BACK = [
    pose(GREAT, "CARRY", 2, ref="Sword_Dash@0"),
    k("TIP", 2, 0.70, 0.88, 0.44, 80, 1.20, twist=-10, ref="Sword_Dash@1"),
    k("CROSS", 2, 0.58, 0.86, 0.44, 150, 1.00, twist=4, ref="Sword_Dash@2"),
    k("CHAMBER", 3, 0.38, 0.74, 0.42, 184, -0.30, twist=24, flat=0.3, ref="Sword_Dash@4", enter=True),
    k("COILED", 2, 0.37, 0.73, 0.42, 186, -0.32, twist=26, flat=0.3, ref="Sword_Dash@7"),
    k("WHIP", 1, 0.45, 0.71, 0.44, 180, -0.05, twist=16, smear=True, flat=0.4, ref="Sword_Dash@9"),
    k("DRAW", 1, 0.53, 0.70, 0.44, 175, 0.15, twist=4, smear=True, flat=0.5, ref="Sword_Dash@9"),
    k("HIT", 2, 0.60, 0.70, 0.44, 172, 0.25, twist=-4, smear=True, hit=True, flat=0.6,
      ref="Sword_Dash@10"),
    k("DRAG", 1, 0.67, 0.72, 0.44, 185, 0.20, twist=-16, smear=True, flat=0.6, ref="Sword_Dash@11"),
    k("ROLL", 1, 0.72, 0.74, 0.44, 260, 0.25, twist=-24, smear=True, flat=0.5, ref="Sword_Dash@11"),
    k("FOLLOW", 1, 0.76, 0.76, 0.44, 335, 0.30, twist=-28, flat=0.5, ref="Sword_Dash@12"),
    k("EXTEND", 2, 0.78, 0.77, 0.44, 380, 0.40, twist=-28, ref="Sword_Dash@12", link=True),
    k("RETURN 1", 2, 0.80, 0.82, 0.44, 400, 0.15, twist=-22, ref="Sword_Dash@30"),
    k("RETURN 2", 2, 0.78, 0.88, 0.43, 412, 0.10, twist=-22, ref="Sword_Dash@40"),
    pose(GREAT, "SETTLE", 2, ref="Sword_Dash@47"),
]


# ---------------------------------------------------------------- shields (keyed right, worn left)
# Block (UAL2 Idle_Shield_Loop / Shield_OneShot / Idle_Shield_Break): the shield comes up across
# the chest, face to the enemy, its rim just under the crosshair so you look over it; a blow
# knocks it back and out (BRACE), then it lowers to the corner. Frame 3 holds while blocking.
ROUND_UP = dict(S=at(0.64, 0.84, 0.42), ang=178, dz=0.0, face=(-0.30, 0.17, 0.94))
ROUND_BLOCK = [
    pose(ROUND, "CARRY", 2, ref="Shield_OneShot@0"),
    k("RAISE 1", 1, 0.76, 0.86, 0.41, 170, 0.10, face=(0.45, 0.10, 0.88), ref="Shield_OneShot@2"),
    k("RAISE 2", 1, 0.68, 0.86, 0.41, 175, 0.05, face=(0.00, 0.10, 0.99), ref="Shield_OneShot@4"),
    pose(ROUND_UP, "BLOCK", 4, ref="Idle_Shield_Loop@0", hold=True),
    k("BRACE", 2, 0.67, 0.89, 0.38, 176, 0.0, face=(-0.10, 0.22, 0.97), ref="Idle_Shield_Break@4"),
    k("LOWER 1", 2, 0.70, 0.86, 0.39, 172, 0.05, face=(0.30, 0.10, 0.95), ref="Shield_OneShot@18"),
    k("LOWER 2", 2, 0.80, 0.91, 0.41, 168, 0.08, face=(0.50, 0.13, 0.86), ref="Shield_OneShot@22"),
    pose(ROUND, "SETTLE", 2, ref="Shield_OneShot@25"),
]
KITE_UP = dict(S=at(0.62, 0.90, 0.50), ang=96, dz=0.0, face=(-0.28, 0.12, 0.95))
KITE_BLOCK = [
    pose(KITE, "CARRY", 2, ref="Shield_OneShot@0"),
    towards(KITE, KITE_UP, 0.45, "RAISE 1", 1, ref="Shield_OneShot@2"),
    towards(KITE, KITE_UP, 0.85, "RAISE 2", 1, ref="Shield_OneShot@4"),
    pose(KITE_UP, "BLOCK", 4, ref="Idle_Shield_Loop@0", hold=True),
    dict(KITE_UP, name="BRACE", tics=2, S=at(0.65, 0.94, 0.46), face=(0.12, 0.05, 0.99),
         ref="Idle_Shield_Break@4"),
    towards(KITE, KITE_UP, 0.65, "LOWER 1", 2),
    towards(KITE, KITE_UP, 0.30, "LOWER 2", 2),
    towards(KITE, KITE_UP, 0.0, "SETTLE", 2),
]
# a second sword makes room the same way when the other hand swings: out and down a little
SWORD_ROOM = dict(S=at(0.87, 0.96, 0.40), ang=78, dz=0.10)
# out of the way of the sword: lower and further out into the corner, face turned outward
ROUND_ASIDE = dict(S=at(0.97, 1.06, 0.38), ang=150, dz=0.16, face=(0.90, 0.22, 0.38))
KITE_ASIDE = dict(S=at(0.95, 1.16, 0.46), ang=110, dz=0.12, face=(0.90, 0.12, 0.42))


def aside_weights(keys):
    """How far the shield is out of the way on each frame of a sword attack: easing out over
    the wind-up, fully aside from the cut to the end of the follow-through, back over the
    recovery."""
    hit = next(i for i, f in enumerate(keys) if f.get("hit"))
    link = next((i for i, f in enumerate(keys) if f.get("link")), len(keys) - 4)
    out = []
    for i in range(len(keys)):
        if i == 0 or i == len(keys) - 1:
            w = 0.0
        elif i < hit - 1:
            w = min(1.0, 0.35 * i)
        elif i <= link:
            w = 1.0
        else:
            w = max(0.0, 1.0 - (i - link) / (len(keys) - 1 - link))
        out.append(w)
    return out


def shield_aside(carry, aside, attack):
    return [towards(carry, aside, w, f["name"], f["tics"])
            for w, f in zip(aside_weights(attack), attack)]


# ---------------------------------------------------------------- spells (empty hands)
# Thrust (the approved cast): draw back beside the head palm up, thrust and open at the target.
HAND_FIRE = palm("RELEASE", 2, 0.58, 0.64, 0.38, (0.00, 0.75, 0.66), (-0.05, -0.20, 1.00), 0.0,
                 1.35, fire=True)
HAND_THRUST = [
    HAND,
    palm("DRAW", 2, 0.84, 0.76, 0.28, (-0.25, 0.25, 0.93), (-0.20, 0.95, -0.10), 0.45),
    palm("GATHER", 2, 0.84, 0.71, 0.27, (-0.30, 0.20, 0.93), (-0.15, 1.00, -0.15), 0.38),
    palm("CHARGE", 3, 0.84, 0.70, 0.27, (-0.30, 0.20, 0.93), (-0.15, 1.00, -0.15), 0.35,
         hold=True),
    palm("THRUST", 1, 0.66, 0.66, 0.33, (-0.05, 0.60, 0.80), (-0.20, 0.20, 1.00), 0.12,
         smear=True),
    HAND_FIRE,
    palm("FOLLOW", 2, 0.59, 0.66, 0.37, (0.00, 0.74, 0.67), (-0.08, -0.25, 1.00), 0.08, 1.25),
    lerp_hand(HAND_FIRE, HAND, 0.35, name="RETURN 1", tics=2, fire=False),
    lerp_hand(HAND_FIRE, HAND, 0.65, name="RETURN 2", tics=2, fire=False),
    lerp_hand(HAND_FIRE, HAND, 0.90, name="RETURN 3", tics=2, fire=False),
    dict(HAND, name="SETTLE"),
]

# Raise and push (UAL1 Spell_Simple_Enter / _Idle / _Shoot / _Exit): the hand comes up in front
# of the face, fingers up and palm toward you, the spell gathering in it; then the palm turns
# out and pushes at the target.
PUSH_FIRE = palm("PUSH", 2, 0.62, 0.62, 0.40, (0.02, 0.75, 0.66), (-0.08, -0.10, 1.00), 0.02,
                 1.4, fire=True, ref="Spell_Simple_Shoot@6")
HAND_PUSH = [
    dict(HAND, ref="Spell_Simple_Enter@0"),
    palm("RISE", 2, 0.72, 0.82, 0.32, (-0.10, 0.70, 0.70), (-0.70, 0.20, -0.60), 0.45,
         ref="Spell_Simple_Enter@8"),
    palm("BEFORE FACE", 2, 0.70, 0.72, 0.29, (-0.05, 0.95, 0.30), (-0.55, 0.05, -0.83), 0.40,
         ref="Spell_Simple_Enter@16"),
    palm("CHARGE", 3, 0.70, 0.71, 0.28, (-0.05, 0.96, 0.28), (-0.55, 0.05, -0.83), 0.36,
         ref="Spell_Simple_Idle_Loop@30", hold=True),
    palm("TURN", 1, 0.63, 0.66, 0.34, (0.00, 0.95, 0.30), (-0.30, -0.05, 0.95), 0.15,
         smear=True, ref="Spell_Simple_Shoot@4"),
    PUSH_FIRE,
    palm("HOLD", 2, 0.62, 0.63, 0.39, (0.02, 0.75, 0.66), (-0.10, -0.12, 1.00), 0.06, 1.3,
         ref="Spell_Simple_Shoot@12"),
    lerp_hand(PUSH_FIRE, HAND, 0.35, name="RETURN 1", tics=2, fire=False,
              ref="Spell_Simple_Exit@4"),
    lerp_hand(PUSH_FIRE, HAND, 0.70, name="RETURN 2", tics=2, fire=False,
              ref="Spell_Simple_Exit@8"),
    lerp_hand(PUSH_FIRE, HAND, 0.92, name="RETURN 3", tics=2, fire=False),
    dict(HAND, name="SETTLE", ref="Spell_Simple_Exit@13"),
]

# Hurl (UAL2 OverhandThrow): wind the spell back high over the right shoulder, palm up, and
# throw it over the top at the target; the hand follows through low across the body.
HURL_FIRE = palm("RELEASE", 1, 0.64, 0.62, 0.34, (0.05, 0.35, 0.94), (-0.10, -0.70, 0.71), 0.05,
                 1.35, fire=True, pole=(1.0, -0.9, 0.1), ref="OverhandThrow@11")
HAND_HURL = [
    dict(HAND, ref="OverhandThrow@0"),
    palm("WIND", 2, 0.86, 0.80, 0.34, (-0.40, 0.55, 0.73), (-0.35, 0.85, -0.40), 0.50,
         ref="OverhandThrow@6"),
    palm("COCK", 2, 0.88, 0.70, 0.34, (-0.30, 0.85, -0.42), (-0.30, 0.30, 0.90), 0.45,
         ref="OverhandThrow@9"),
    palm("CHARGE", 3, 0.88, 0.69, 0.33, (-0.30, 0.86, -0.40), (-0.30, 0.30, 0.90), 0.42,
         ref="OverhandThrow@10", hold=True),
    palm("THROW", 1, 0.76, 0.63, 0.40, (-0.10, 0.85, 0.52), (-0.15, -0.10, 0.98), 0.20,
         smear=True, ref="OverhandThrow@11"),
    HURL_FIRE,
    palm("FOLLOW", 2, 0.50, 0.80, 0.40, (0.30, -0.10, 0.95), (0.10, -0.95, 0.30), 0.25,
         ref="OverhandThrow@14"),
    palm("DROP", 2, 0.46, 0.90, 0.36, (0.35, -0.30, 0.89), (0.05, -0.95, -0.30), 0.40,
         ref="OverhandThrow@18"),
    lerp_hand(palm("x", 2, 0.46, 0.90, 0.36, (0.35, -0.30, 0.89), (0.05, -0.95, -0.30), 0.40),
              HAND, 0.55, name="RETURN 1", tics=2, ref="OverhandThrow@26"),
    lerp_hand(palm("x", 2, 0.46, 0.90, 0.36, (0.35, -0.30, 0.89), (0.05, -0.95, -0.30), 0.40),
              HAND, 0.88, name="RETURN 2", tics=2),
    dict(HAND, name="SETTLE", ref="OverhandThrow@40"),
]

# Both hands (the approved two-hand cast), from the wider rest.
BOTH_FIRE = palm("RELEASE", 2, 0.555, 0.67, 0.38, (0.10, 0.75, 0.66), (-0.35, -0.15, 1.00), 0.0,
                 1.35, fire=True, ref="Spell_Simple_Shoot@6")
BOTH_CAST = [
    dict(BOTH, ref="Spell_Simple_Enter@0"),
    palm("BRING IN", 2, 0.60, 0.89, 0.29, (-0.10, 0.55, 0.83), (-1.00, 0.10, 0.10), 0.45,
         ref="Spell_Simple_Enter@8"),
    palm("GATHER", 2, 0.565, 0.87, 0.29, (-0.10, 0.55, 0.83), (-1.00, 0.10, 0.10), 0.38,
         ref="Spell_Simple_Enter@16"),
    palm("CHARGE", 4, 0.565, 0.865, 0.29, (-0.10, 0.55, 0.83), (-1.00, 0.10, 0.10), 0.35,
         ref="Spell_Simple_Idle_Loop@30", hold=True),
    palm("PUSH", 1, 0.555, 0.73, 0.34, (0.05, 0.75, 0.66), (-0.70, -0.05, 0.70), 0.15,
         smear=True, ref="Spell_Simple_Shoot@4"),
    BOTH_FIRE,
    palm("FOLLOW", 2, 0.555, 0.69, 0.37, (0.10, 0.76, 0.64), (-0.45, -0.20, 1.00), 0.08, 1.25),
    lerp_hand(BOTH_FIRE, BOTH, 0.35, name="RETURN 1", tics=2, fire=False),
    lerp_hand(BOTH_FIRE, BOTH, 0.65, name="RETURN 2", tics=2, fire=False),
    lerp_hand(BOTH_FIRE, BOTH, 0.90, name="RETURN 3", tics=2, fire=False),
    dict(BOTH, name="SETTLE", ref="Spell_Simple_Exit@13"),
]

# Staff, raise and point (the approved staff cast), from the wider carry.
STAFF_FIRE = k("FIRE", 2, 0.62, 0.74, 0.42, 108, 1.50, fire=True)
STAFF_POINT = [
    pose(STAFF, "CARRY", 2),
    k("RAISE 1", 2, 0.82, 0.88, 0.34, 91, 0.30),
    k("RAISE 2", 2, 0.78, 0.80, 0.34, 90, 0.38),
    k("CHARGE", 3, 0.75, 0.76, 0.33, 90, 0.40, hold=True),
    k("TIP", 1, 0.68, 0.76, 0.38, 100, 0.90, smear=True),
    STAFF_FIRE,
    k("FOLLOW", 2, 0.63, 0.77, 0.41, 104, 1.30),
] + [towards(STAFF_FIRE, STAFF, s, n, 2)
     for n, s in (("RETURN 1", 0.35), ("RETURN 2", 0.6), ("RETURN 3", 0.8), ("RETURN 4", 0.93))] + [
    pose(STAFF, "SETTLE", 2)]

# Staff, overhand (UAL2 OverhandThrow): heave the head back over the right shoulder, then bring
# it over the top so it points at the target as the bolt leaves it.
STAFF_OVER_FIRE = k("FIRE", 2, 0.63, 0.70, 0.44, 106, 1.60, fire=True, ref="OverhandThrow@12")
STAFF_OVER = [
    pose(STAFF, "CARRY", 2, ref="OverhandThrow@0"),
    k("HEAVE", 2, 0.85, 0.90, 0.34, 70, 0.10, ref="OverhandThrow@6"),
    k("BACK", 2, 0.87, 0.86, 0.32, 40, -0.05, pole=RAISED, ref="OverhandThrow@9"),
    k("CHARGE", 3, 0.87, 0.85, 0.32, 36, -0.06, pole=RAISED, ref="OverhandThrow@10", hold=True),
    k("OVER", 1, 0.77, 0.74, 0.38, 80, 0.40, pole=RAISED, smear=True, ref="OverhandThrow@11"),
    STAFF_OVER_FIRE,
    k("FOLLOW", 2, 0.62, 0.76, 0.42, 112, 1.40, ref="OverhandThrow@14"),
] + [towards(STAFF_OVER_FIRE, STAFF, s, n, 2)
     for n, s in (("RETURN 1", 0.35), ("RETURN 2", 0.65), ("RETURN 3", 0.9))] + [
    pose(STAFF, "SETTLE", 2, ref="OverhandThrow@40")]


# ---------------------------------------------------------------- frames for the exporter
def frames(keys, side, weapon):
    """Keys -> rig frames for one arm (left: mirrored), as anims._frames, with this module's
    meta (ref, chain points, hold) kept on the frame, not the arm."""
    out = []
    for key in keys:
        key = dict(key)
        meta = {m: key.pop(m) for m in META if m in key}
        arm = mirror(key) if side == "L" else key
        meta[side] = (dict(arm, shield=weapon) if weapon in anims.SHIELDS
                      else dict(arm, weapon=weapon))
        out.append(meta)
    return out


def two_handed(keys):
    out = frames(keys, "R", "sword2h")
    for f, key in zip(out, keys):
        f["L"] = dict(support=GRIP_2H, **({"twist": key["twist"]} if "twist" in key else {}))
    return out


def both_hands(keys):
    out = []
    for key in keys:
        key = dict(key)
        meta = {m: key.pop(m) for m in META if m in key}
        meta["R"] = dict(key, weapon=None)
        meta["L"] = dict(mirror(key), weapon=None)
        out.append(meta)
    return out


def walk(base, sway=22, rock=4.0):
    return walk_cycle(base, sway=sway, rock=rock)


# id -> clip. `slot`/`move` say what it is for; the left-handed copies of one-handed clips
# share the right's id (each side's file holds its own arm).
MOVES = {}


def add(cid, frames_by_side, **info):
    MOVES[cid] = dict(id=cid, frames=frames_by_side, **info)


SWORD_ATTACKS = dict(chop=SWORD_CHOP, diag=SWORD_DIAG, back=SWORD_BACK, rise=SWORD_RISE)
GREAT_ATTACKS = dict(chop=GREAT_CHOP, cleave=GREAT_CLEAVE, back=GREAT_BACK)
HAND_CASTS = dict(thrust=HAND_THRUST, push=HAND_PUSH, hurl=HAND_HURL)
STAFF_CASTS = dict(point=STAFF_POINT, over=STAFF_OVER)

add("sword_walk", {s: frames(walk(SWORD, 22 if s == "R" else -22), s, "sword1h") for s in "RL"},
    kind="walk")
add("great_walk", {"RL": two_handed(walk(GREAT, rock=1.5))}, kind="walk")
add("staff_walk", {"R": frames(walk(STAFF, rock=1.5), "R", "staff")}, kind="walk")
add("round_walk", {"L": frames(walk(ROUND, sway=-22), "L", "round")}, kind="walk")
add("kite_walk", {"L": frames(walk(KITE, sway=-22), "L", "kite")}, kind="walk")
add("hand_walk", {s: frames(walk(HAND, 22 if s == "R" else -22, rock=0), s, None) for s in "RL"},
    kind="walk")
add("both_walk", {"RL": both_hands(walk(BOTH, rock=0))}, kind="walk")
for name, keys in SWORD_ATTACKS.items():
    add(f"sword_{name}", {s: frames(keys, s, "sword1h") for s in "RL"}, kind="attack",
        power=1.15 if name == "chop" else 1.0)
    add(f"round_aside_{name}", {"L": frames(shield_aside(ROUND, ROUND_ASIDE, keys), "L", "round")},
        kind="aside")
    add(f"kite_aside_{name}", {"L": frames(shield_aside(KITE, KITE_ASIDE, keys), "L", "kite")},
        kind="aside")
    add(f"sword_aside_{name}", {s: frames(shield_aside(SWORD, SWORD_ROOM, keys), s, "sword1h")
                                for s in "RL"}, kind="aside")
for name, keys in GREAT_ATTACKS.items():   # (blades show their flat by key now: no quarter-turn roll)
    add(f"great_{name}", {"RL": two_handed(keys)}, kind="attack", heavy=True, roll=False,
        power=1.2 if name == "chop" else 1.0)
add("round_block", {"L": frames(ROUND_BLOCK, "L", "round")}, kind="block")
add("kite_block", {"L": frames(KITE_BLOCK, "L", "kite")}, kind="block")
add("sword_guard", {"R": frames([towards(SWORD, SWORD_BACK_POSE, s, f["name"], f["tics"])
                                 for s, f in zip(GUARD_PULL, ROUND_BLOCK)], "R", "sword1h")},
    kind="block")
for name, keys in HAND_CASTS.items():
    add(f"hand_{name}", {s: frames(keys, s, None) for s in "RL"}, kind="cast")
add("both_cast", {"RL": both_hands(BOTH_CAST)}, kind="cast")
for name, keys in STAFF_CASTS.items():
    add(f"staff_{name}", {"R": frames(keys, "R", "staff")}, kind="cast")

# What the player can choose between (the move viewer, moves.html), and the defaults.
SLOTS = {
    "onehand": dict(title="One-handed weapon", options=[
        dict(id="combo", name="Combo: cut, backhand, rising", chain=["sword_diag", "sword_back", "sword_rise"],
             ref="UAL2 Sword_Regular_Combo"),
        dict(id="diag", name="Diagonal cut", chain=["sword_diag"], ref="UAL1 Sword_Attack"),
        dict(id="back", name="Backhand sweep", chain=["sword_back"], ref="UAL2 Sword_Regular_B"),
        dict(id="rise", name="Rising slash", chain=["sword_rise"], ref="UAL2 Sword_Regular_A"),
        dict(id="chop", name="Overhead chop", chain=["sword_chop"], ref="your swing video's timing",
             note="straight down; slower, lands harder"),
    ], default="combo"),
    "twohand": dict(title="Two-handed weapon", options=[
        dict(id="combo", name="Combo: cleave, backsweep", chain=["great_cleave", "great_back"],
             ref="UAL1 Sword_Attack + UAL2 Sword_Dash"),
        dict(id="cleave", name="Cleave", chain=["great_cleave"], ref="UAL1 Sword_Attack"),
        dict(id="back", name="Backsweep", chain=["great_back"], ref="UAL2 Sword_Dash"),
        dict(id="chop", name="Overhead chop", chain=["great_chop"], ref="your swing video's timing",
             note="straight down; slower, lands harder"),
    ], default="combo"),
    "spell": dict(title="One-hand spell", options=[
        dict(id="push", name="Raise and push", chain=["hand_push"], ref="UAL1 Spell_Simple"),
        dict(id="hurl", name="Overhand hurl", chain=["hand_hurl"], ref="UAL2 OverhandThrow"),
        dict(id="thrust", name="Draw and thrust", chain=["hand_thrust"], ref="(the first rig)"),
    ], default="push"),
    "staff": dict(title="Staff", options=[
        dict(id="point", name="Raise and point", chain=["staff_point"], ref="(the first rig)"),
        dict(id="over", name="Overhand", chain=["staff_over"], ref="UAL2 OverhandThrow"),
    ], default="point"),
}
