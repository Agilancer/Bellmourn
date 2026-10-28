"""Keyframes for the first-person weapon rigs (see fp_rig.py for the conventions).

S = where the fist sits: (screen x, screen y, depth in metres) on the 384x240 screen; it may
be off-screen. ang = the weapon's angle on screen (0 = pointing right, 90 = straight up,
180 = pointing left). dz = how far the weapon leans away from the viewer (large = pointing
into the scene). The elbow and the forearm follow by IK. Tics are 1/35 s.

The one-handed rigs are keyed from the reference video "First Personal Swinging.mp4"
(30 fps, filmed first-person). The `ref` on each key is the video frame it was taken from.
"""
import math

W, H = 384, 240


def at(fx, fy):
    """Video position as a fraction of the frame -> screen pixels."""
    return round(fx * W), round(fy * H)


def mirror(key):
    """Right-arm keyframe -> left-arm keyframe."""
    out = dict(key)
    sx, sy, z = key["S"]
    out["S"] = (W - sx, sy, z)
    out["ang"] = 180 - key["ang"]
    for k in ("bend", "pole", "face"):
        if k in key:
            x, y, z = key[k]
            out[k] = (-x, y, z)
    return out


RAISED = (1.0, 0.4, -0.3)  # elbow lifted out to the side while the arm is up
CARRY = dict(S=(*at(0.62, 0.72), 0.28), ang=70, dz=0.15)


def walk_cycle(base=CARRY, n=8, sway=22):
    """Video 0-80: the carried weapon sways side to side and dips on each footfall (a Doom-style
    figure-of-eight bob), rocking a few degrees with it. Every carried item uses the same bob in
    the same phase, so a sword and a shield walk in step. Keys for the left arm get mirrored,
    so they pass sway=-22 to keep both hands swaying the same way across the screen."""
    out = []
    sx, sy, z = base["S"]
    for i in range(n):
        t = 2 * math.pi * i / n
        out.append(dict(base, name=f"WALK {i + 1}", tics=4,
                        S=(sx + sway * math.cos(t), sy + 10 * abs(math.sin(t)), z),
                        ang=base["ang"] + 4 * math.cos(t) * (1 if sway > 0 else -1)))
    return out


R1H_SWING = [
    dict(name="CARRY", tics=2, ref=78, **CARRY),
    dict(name="LIFT", tics=2, ref=82, S=(*at(0.78, 0.55), 0.40), ang=58, dz=-0.05),
    dict(name="LIFT 2", tics=2, ref=84, S=(*at(0.86, 0.38), 0.42), ang=46, dz=-0.10,
         pole=RAISED),
    dict(name="COCK BACK", tics=2, ref=87, S=(*at(0.90, 0.26), 0.44), ang=38, dz=-0.15,
         pole=RAISED),
    dict(name="OVERHEAD", tics=3, ref=95, S=(*at(0.90, 0.12), 0.46), ang=30, dz=-0.15,
         pole=RAISED),
    dict(name="RE-ENTER", tics=1, ref=103, S=(*at(0.86, 0.16), 0.46), ang=28, dz=-0.10,
         pole=RAISED),
    dict(name="COME OVER", tics=1, ref=104, S=(*at(0.78, 0.22), 0.44), ang=30, dz=-0.10,
         pole=RAISED),
    dict(name="CHOP 1", tics=1, smear=True, ref=105, S=(*at(0.72, 0.30), 0.44), ang=40,
         dz=-0.05, pole=RAISED),
    dict(name="CHOP 2", tics=1, smear=True, ref=106, S=(*at(0.62, 0.42), 0.44), ang=55,
         dz=-0.05),
    dict(name="CHOP 3", tics=2, smear=True, hit=True, ref=107, S=(*at(0.56, 0.50), 0.46),
         ang=72, dz=0.40),
    dict(name="DRIVE", tics=2, ref=108, S=(*at(0.49, 0.58), 0.48), ang=88, dz=1.20),
    dict(name="DIP", tics=2, ref=110, S=(*at(0.46, 0.66), 0.50), ang=96, dz=2.00),
    dict(name="GUARD", tics=3, ref=115, S=(*at(0.43, 0.66), 0.50), ang=95, dz=2.00),
    dict(name="RECOVER 1", tics=2, S=(*at(0.50, 0.68), 0.44), ang=84, dz=1.10),
    dict(name="RECOVER 2", tics=2, S=(*at(0.57, 0.70), 0.36), ang=75, dz=0.50),
    dict(name="RECOVER 3", tics=2, S=(*at(0.61, 0.72), 0.30), ang=71, dz=0.20),
]


# Shield, keyed as if on the right arm and mirrored onto the left. A round centre-grip shield:
# the fist holds a bar behind the boss and `face` is the way the shield's front points, so the
# viewer sees its inner side. Carried low at the side, angled outward; raised to cover the
# left-centre of the view when blocking. (The reference video has no shield; only its walking
# bob applies.)
SHIELD_CARRY = dict(S=(*at(0.77, 0.86), 0.36), ang=165, dz=0.10, face=(0.45, 0.15, 0.88))
SHIELD_BLOCK = [
    dict(name="CARRY", tics=2, **SHIELD_CARRY),
    dict(name="RAISE 1", tics=1, S=(*at(0.66, 0.76), 0.38), ang=170, dz=0.10,
         face=(0.30, 0.10, 0.95)),
    dict(name="RAISE 2", tics=1, S=(*at(0.60, 0.66), 0.40), ang=175, dz=0.05,
         face=(0.10, 0.05, 1.0)),
    dict(name="BLOCK", tics=4, S=(*at(0.56, 0.60), 0.40), ang=178, dz=0.0,
         face=(-0.05, 0.0, 1.0)),
    dict(name="BRACE", tics=2, hit=True, S=(*at(0.57, 0.64), 0.36), ang=178, dz=0.0,
         face=(-0.02, 0.05, 1.0)),
    dict(name="LOWER 1", tics=2, S=(*at(0.62, 0.70), 0.39), ang=172, dz=0.05,
         face=(0.20, 0.08, 0.97)),
    dict(name="LOWER 2", tics=2, S=(*at(0.68, 0.80), 0.37), ang=168, dz=0.08,
         face=(0.35, 0.12, 0.92)),
    dict(name="SETTLE", tics=2, S=(*at(0.71, 0.85), 0.36), ang=166, dz=0.10,
         face=(0.43, 0.14, 0.89)),
]


def lerp_key(a, b, s, **extra):
    """A pose part-way (s = 0..1) from key a to key b."""
    out = dict(a, **extra)
    out["S"] = tuple(p + (q - p) * s for p, q in zip(a["S"], b["S"]))
    for k in ("ang", "dz"):
        out[k] = a[k] + (b[k] - a[k]) * s
    if "face" in a:
        out["face"] = tuple(p + (q - p) * s for p, q in zip(a["face"], b["face"]))
    return out


# Kite shield: taller, strapped along the forearm with the fist on the upper strap, so most of
# it hangs below the hand. Carried low with only its upper half in view; raised it covers the
# lower-left of the screen from the crosshair down. Same timing as the round shield's block.
KITE_CARRY = dict(S=(*at(0.80, 0.98), 0.42), ang=100, dz=0.10, face=(0.50, 0.10, 0.86))
KITE_UP = dict(S=(*at(0.60, 0.55), 0.52), ang=96, dz=0.0, face=(-0.05, 0.0, 1.0))
KITE_BLOCK = [
    dict(name="CARRY", tics=2, **KITE_CARRY),
    lerp_key(KITE_CARRY, KITE_UP, 0.45, name="RAISE 1", tics=1),
    lerp_key(KITE_CARRY, KITE_UP, 0.85, name="RAISE 2", tics=1),
    dict(KITE_UP, name="BLOCK", tics=4),
    dict(KITE_UP, name="BRACE", tics=2, hit=True,
         S=(KITE_UP["S"][0], KITE_UP["S"][1] + 6, 0.47)),
    lerp_key(KITE_CARRY, KITE_UP, 0.65, name="LOWER 1", tics=2),
    lerp_key(KITE_CARRY, KITE_UP, 0.30, name="LOWER 2", tics=2),
    lerp_key(KITE_CARRY, KITE_UP, 0.06, name="SETTLE", tics=2),
]

# While a shield is up, the weapon hand draws back out of the way: down, toward the right edge
# and in toward the body, blade tipped back, ready to strike again. Frame for frame with the
# shield's block, so the two layers play together.
SWORD_BACK = dict(S=(*at(0.82, 1.00), 0.24), ang=54, dz=0.35)
PULL = (0.0, 0.45, 0.85, 1.0, 1.0, 0.70, 0.35, 0.06)
R1H_SHIELD_BACK = [
    lerp_key(CARRY, SWORD_BACK, s, name=n, tics=k["tics"], **({"hit": True} if k.get("hit") else {}))
    for s, k, n in zip(PULL, SHIELD_BLOCK,
                       ("CARRY", "DRAW BACK 1", "DRAW BACK 2", "HELD BACK", "BRACE",
                        "RETURN 1", "RETURN 2", "SETTLE"))
]
R1H_SHIELD_BACK[4]["S"] = (SWORD_BACK["S"][0] + 4, SWORD_BACK["S"][1] + 5, 0.25)

SHIELDS = ("round", "kite")


def _frames(keys, side, weapon):
    out = []
    for k in keys:
        k = dict(k)
        k.pop("ref", None)
        meta = {m: k.pop(m) for m in ("name", "tics", "hit", "fire", "smear", "view") if m in k}
        if side == "L":
            k = mirror(k)
        meta[side] = dict(k, shield=weapon) if weapon in SHIELDS else dict(k, weapon=weapon)
        out.append(meta)
    return out


ANIMS = {
    "r1h_walk": dict(
        id="r1h_walk", title="ONE-HANDED CARRY / WALK — RIGHT HAND",
        frames=_frames(walk_cycle(), "R", "sword1h"),
        notes=[
            "Right hand only. The weapon is carried upright, leaning right, while walking.",
            "8-frame loop: sway side to side, dipping slightly on each step.",
            "Frame 00 is also the idle pose and the first frame of the swing.",
        ]),
    "r1h_swing": dict(
        id="r1h_swing", title="ONE-HANDED OVERHAND SWING — RIGHT HAND",
        frames=_frames(R1H_SWING, "R", "sword1h"),
        notes=[
            "Starts and ends on the walking carry pose.",
            "Lift up and right, cock the blade back over the shoulder, arm goes overhead.",
            "Then chop over the top, driving the fist down to screen centre (07-09 smear).",
            "Frame 09 is the hit. 10-12 settle on guard pointing at the target; 13-15 recover.",
        ]),
    # the left hand is the right hand's mirror image
    "l1h_walk": dict(
        id="l1h_walk", title="ONE-HANDED CARRY / WALK — LEFT HAND",
        frames=_frames(walk_cycle(), "L", "sword1h"),
        notes=[
            "Left hand only: the mirror image of r1h_walk.",
            "8-frame loop: sway side to side, dipping slightly on each step.",
            "Frame 00 is also the idle pose and the first frame of the swing.",
        ]),
    "l1h_swing": dict(
        id="l1h_swing", title="ONE-HANDED OVERHAND SWING — LEFT HAND",
        frames=_frames(R1H_SWING, "L", "sword1h"),
        notes=[
            "Left hand only: the mirror image of r1h_swing. Starts and ends on the carry pose.",
            "Lift up and left, cock the blade back over the left shoulder, arm goes overhead.",
            "Then chop over the top, driving the fist down to screen centre (07-09 smear).",
            "Frame 09 is the hit. 10-12 settle on guard pointing at the target; 13-15 recover.",
        ]),
    "lsh_walk": dict(
        id="lsh_walk", title="SHIELD CARRY / WALK — LEFT HAND",
        frames=_frames(walk_cycle(SHIELD_CARRY, sway=-22), "L", "round"),
        notes=[
            "Left arm only: a round shield held by its centre grip, carried low at the side.",
            "We see the INSIDE of the shield (straps/lining), the gauntlet fist on the grip bar.",
            "8-frame loop in step with r1h_walk; frame 00 is also the idle pose.",
        ]),
    "lsh_block": dict(
        id="lsh_block", title="SHIELD RAISE / BLOCK — LEFT HAND",
        frames=_frames(SHIELD_BLOCK, "L", "round"),
        notes=[
            "Raise the shield across the left-centre of the view, then lower it again.",
            "Frame 03 BLOCK holds for as long as block is held. 04 BRACE plays when a hit lands.",
            "The shield face points away from us: paint its inner side (wood planks, straps).",
            "Frames 05-07 lower back to the carry pose.",
        ]),
    "lks_walk": dict(
        id="lks_walk", title="KITE SHIELD CARRY / WALK — LEFT HAND",
        frames=_frames(walk_cycle(KITE_CARRY, sway=-22), "L", "kite"),
        notes=[
            "Left arm only: a tall kite shield strapped along the forearm, carried low.",
            "Only its upper part shows; we see the INSIDE (planks, straps), fist on the strap.",
            "8-frame loop in step with r1h_walk; frame 00 is also the idle pose.",
        ]),
    "lks_block": dict(
        id="lks_block", title="KITE SHIELD RAISE / BLOCK — LEFT HAND",
        frames=_frames(KITE_BLOCK, "L", "kite"),
        notes=[
            "Raise the kite shield to cover the lower-left of the view, then lower it.",
            "Frame 03 BLOCK holds while block is held. 04 BRACE plays when a hit lands.",
            "Same timing as lsh_block, so r1h_shield_back pairs with either shield.",
        ]),
    "r1h_shield_back": dict(
        id="r1h_shield_back", title="WEAPON DRAWN BACK WHILE BLOCKING — RIGHT HAND",
        frames=_frames(R1H_SHIELD_BACK, "R", "sword1h"),
        notes=[
            "Plays with lsh_block / lks_block, frame for frame.",
            "The weapon hand draws back down and right, out of the shield's way, then returns.",
            "03 holds while block is held; 04 jolts with the shield when a hit lands.",
        ]),
}
