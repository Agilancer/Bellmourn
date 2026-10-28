"""Creature template sizes, directions and animation kinds.

No rigs or mannequins, and no creature designs: a template is a plain magenta grid (4 frames
across, one row per direction) with a label on each cell, a ground line and a metre scale.
Any creature can be painted on the templates of its size class; consistency comes from the
locked style guide plus the creature's own model sheet, painted first and attached to every
other sheet of that creature.
"""

# ----------------------------------------------------------------- size classes
# One sheet is always 1536x1024 (ChatGPT's landscape size). `cell` includes a 12 px label strip
# and a 2 px border; the art box is the rest. `rows` = grid rows per sheet. Pixel density drops
# as creatures grow so the biggest still fit; the game sizes each billboard from px_per_m.
SIZES = {
    "S": dict(name="small",  px_per_m=64, cell=(384, 121), cols=4, rows=8,
              use="small creatures and vermin, up to 1.5 m tall"),
    "M": dict(name="medium", px_per_m=64, cell=(384, 193), cols=4, rows=5,
              use="people, NPCs and man-sized enemies, up to 2.7 m tall"),
    "L": dict(name="large",  px_per_m=48, cell=(384, 242), cols=4, rows=4,
              use="large enemies and medium bosses, up to 4.6 m tall"),
    "H": dict(name="huge",   px_per_m=32, cell=(384, 322), cols=4, rows=3,
              use="big bosses, up to 9.4 m tall"),
    "E": dict(name="epic",   px_per_m=16, cell=(768, 484), cols=2, rows=2,
              use="epic bosses such as huge dragons, up to 29 m tall / 47 m long"),
}

# ----------------------------------------------------------------- directions
# Doom-style numbering. "faces L" = the creature faces toward the left of the screen.
DIRS = [
    (1, "FRONT", "faces the viewer"),
    (2, "FRONT 3/4 L", "three-quarter front view, turned to face screen-left"),
    (3, "SIDE L", "profile, facing screen-left"),
    (4, "BACK 3/4 L", "three-quarter back view, walking away toward screen-left"),
    (5, "BACK", "seen from behind"),
    (6, "BACK 3/4 R", "three-quarter back view, walking away toward screen-right"),
    (7, "SIDE R", "profile, facing screen-right"),
    (8, "FRONT 3/4 R", "three-quarter front view, turned to face screen-right"),
]
# a symmetric creature paints D1-D5; the game mirrors D4, D3, D2 into D6, D7, D8
MIRROR = {6: 4, 7: 3, 8: 2}

# ----------------------------------------------------------------- animation kinds
# Every animation is FRAMES frames. Frame = (name, tics at 35/s, events). tics -1 = hold
# forever. Events: step (footfall sound), hit (melee damage lands), fire (projectile / breath
# spawns), smear (motion smear allowed), takeoff, land, roar, summon, teleport, block, thud.
FRAMES = 4
KINDS = {
    "idle": dict(loop=True, frames=[("REST", 10, []), ("BREATHE IN", 10, []), ("HOLD", 10, []),
                                    ("BREATHE OUT", 10, [])],
                 note="Standing at rest, slow breathing and a small weight shift; F4 flows back "
                      "into F1."),
    "walk": dict(loop=True, frames=[("CONTACT A", 6, ["step"]), ("PASS A", 6, []),
                                    ("CONTACT B", 6, ["step"]), ("PASS B", 6, [])],
                 note="Walking loop in place (the game moves the sprite): F1 and F3 are the "
                      "two foot contacts, F2 and F4 the passing poses; F4 flows into F1."),
    "run": dict(loop=True, frames=[("PUSH A", 4, ["step"]), ("FLIGHT A", 4, []),
                                   ("PUSH B", 4, ["step"]), ("FLIGHT B", 4, [])],
                note="Running loop in place, leaning into the run: F1 and F3 push off, F2 and "
                     "F4 are in the air; F4 flows into F1."),
    "jump": dict(loop=False, frames=[("CROUCH", 5, []), ("LAUNCH", 4, ["takeoff"]),
                                     ("AIRBORNE", 8, []), ("LAND", 6, ["land"])],
                 note="Jump. Keep the body near the ground line: the game lifts the sprite, "
                      "the frames only change the pose."),
    "fly": dict(loop=True, frames=[("WINGS UP", 5, []), ("DOWNBEAT", 4, []),
                                   ("WINGS DOWN", 5, []), ("UPSTROKE", 5, [])],
                note="Flying loop, one full wingbeat. The game sets the altitude; draw the "
                     "lowest point (feet or tail) just above the ground line."),
    "fly_fast": dict(loop=True, frames=[("WINGS UP", 3, []), ("DOWNBEAT", 3, []),
                                        ("TUCK", 3, []), ("UPSTROKE", 3, [])],
                     note="Fast flight: body stretched out flat, hard short wingbeats."),
    "float": dict(loop=True, frames=[("DRIFT 1", 8, []), ("DRIFT 2", 8, []), ("DRIFT 3", 8, []),
                                     ("DRIFT 4", 8, [])],
                  note="Gliding above the ground line without walking; trailing cloth and hair "
                       "ripple through one loop."),
    "float_fast": dict(loop=True, frames=[("SURGE 1", 4, []), ("SURGE 2", 4, []),
                                          ("SURGE 3", 4, []), ("SURGE 4", 4, [])],
                       note="Fast glide: leaning hard forward, everything streaming behind."),
    "slither": dict(loop=True, frames=[("CURVE 1", 6, []), ("CURVE 2", 6, []), ("CURVE 3", 6, []),
                                       ("CURVE 4", 6, [])],
                    note="Serpent locomotion: an S-curve wave travels down the body each loop."),
    "slither_fast": dict(loop=True, frames=[("SURGE 1", 4, []), ("SURGE 2", 4, []),
                                            ("SURGE 3", 4, []), ("SURGE 4", 4, [])],
                         note="Fast serpent surge: tighter, quicker waves, head held low."),
    "talk": dict(loop=True, frames=[("LISTEN", 9, []), ("GESTURE 1", 9, []), ("NOD", 9, []),
                                    ("GESTURE 2", 9, [])],
                 note="Talking loop: head and hand gestures, feet planted."),
    "melee": dict(loop=False, frames=[("WIND-UP", 6, []), ("STRIKE", 3, ["smear"]),
                                      ("IMPACT", 5, ["hit"]), ("RECOVER", 7, [])],
                  note="Melee attack; damage lands on F3."),
    "heavy": dict(loop=False, frames=[("WIND-UP", 10, []), ("PEAK", 7, []),
                                      ("IMPACT", 7, ["smear", "hit"]), ("RECOVER", 12, [])],
                  note="Slow heavy attack with a long, readable wind-up; damage lands on F3."),
    "leap": dict(loop=False, frames=[("CROUCH", 7, []), ("SPRING", 4, ["takeoff"]),
                                     ("STRIKE", 6, ["smear", "hit", "land"]),
                                     ("RECOVER", 8, [])],
                  note="Leaping attack: the game moves the creature forward and up; damage "
                       "lands on F3 as it comes down."),
    "cast": dict(loop=False, frames=[("GATHER", 7, []), ("CHARGE", 6, []),
                                     ("RELEASE", 5, ["fire"]), ("RECOVER", 7, [])],
                 note="Spell: magic gathers in F1-F2 and the projectile leaves on F3. Magic is "
                      "solid pixels with a hard edge (STYLE_GUIDE §4)."),
    "shoot": dict(loop=False, frames=[("DRAW", 7, []), ("FULL DRAW", 5, []),
                                      ("LOOSE", 4, ["fire"]), ("LOWER", 7, [])],
                  note="Bow shot: the arrow leaves on F3 (the game spawns the arrow sprite)."),
    "throw": dict(loop=False, frames=[("WIND-UP", 7, []), ("COCK", 4, []),
                                      ("RELEASE", 4, ["fire"]), ("RECOVER", 7, [])],
                  note="Throw: the thrown object leaves the hand on F3 (the game spawns it)."),
    "breath": dict(loop=False, frames=[("INHALE", 10, []), ("OPEN", 5, []),
                                       ("BREATH", 6, ["fire"]), ("CLOSE", 8, [])],
                   note="Breath attack: the game holds F3 while it breathes. Paint only the "
                        "glow in the mouth; the game draws the breath stream."),
    "roar": dict(loop=False, frames=[("LIFT", 6, []), ("ROAR 1", 8, ["roar"]), ("ROAR 2", 8, []),
                                     ("SETTLE", 7, [])],
                 note="Roar / taunt: head up, jaws wide on F2-F3."),
    "summon": dict(loop=False, frames=[("RAISE", 7, []), ("CHARGE", 6, []),
                                       ("SUMMON", 6, ["summon"]), ("LOWER", 7, [])],
                   note="Summoning: the minions appear on F3 (the game spawns them)."),
    "blink": dict(loop=False, frames=[("FADE", 5, []), ("GONE", 7, ["teleport"]),
                                      ("RETURN", 5, []), ("SOLID", 5, [])],
                  note="Teleport: the body breaks into hard-edged ordered-dither and magic in "
                       "F1, F2 is only a few sparks, F3-F4 reform. No soft transparency."),
    "block": dict(loop=False, frames=[("RAISE", 4, []), ("BRACE", 7, ["block"]),
                                      ("HOLD", 7, []), ("LOWER", 5, [])],
                  note="Block: guard raised, braced on F2-F3."),
    "takeoff": dict(loop=False, frames=[("CROUCH", 7, []), ("WINGS UP", 6, []),
                                        ("SPRING", 5, ["takeoff"]), ("CLIMB", 5, [])],
                    note="Take-off (its jump): crouch, wings up, spring on F3; the game lifts it."),
    "land": dict(loop=False, frames=[("FLARE", 5, []), ("DESCEND", 5, []),
                                     ("TOUCH", 5, ["land"]), ("SETTLE", 7, [])],
                 note="Landing: wings flare, feet touch on F3."),
    "hurt": dict(loop=False, frames=[("STRUCK", 4, []), ("RECOIL", 5, []), ("STAGGER", 5, []),
                                     ("READY", 5, [])],
                 note="Pain flinch: knocked back on F1-F2, back to the idle pose by F4."),
    "death": dict(loop=False, frames=[("STRUCK", 5, []), ("BUCKLE", 6, []), ("FALL", 6, []),
                                      ("STILL", -1, ["thud"])],
                  note="Death: collapses onto the ground line. F4 is held, then swapped for the "
                       "corpse, so F4 must match the corpse sheet in the same direction."),
}
assert all(len(k["frames"]) == FRAMES for k in KINDS.values())

# Each size class comes in two direction sets: 5 (symmetric: D1-D5, the game mirrors the rest)
# and 8 (holds something in one hand: every direction painted).
DIRSETS = {5: [d for d in DIRS if d[0] <= 5], 8: DIRS}
