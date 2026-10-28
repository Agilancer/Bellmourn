"""Creature template sizes, directions and animation kinds.

No rigs or mannequins, and no creature designs: a template is a plain magenta grid (6 frames
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
    "S": dict(name="small",  px_per_m=64, cell=(256, 121), cols=6, rows=8,
              use="small creatures and vermin, up to 1.5 m tall"),
    "M": dict(name="medium", px_per_m=64, cell=(256, 193), cols=6, rows=5,
              use="people, NPCs and man-sized enemies, up to 2.7 m tall"),
    "L": dict(name="large",  px_per_m=48, cell=(256, 242), cols=6, rows=4,
              use="large enemies and medium bosses, up to 4.6 m tall"),
    "H": dict(name="huge",   px_per_m=32, cell=(256, 322), cols=6, rows=3,
              use="big bosses, up to 9.4 m tall"),
    "E": dict(name="epic",   px_per_m=16, cell=(512, 484), cols=3, rows=2,
              use="epic bosses such as huge dragons, up to 29 m tall / 31 m long"),
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
# Every animation is 6 frames. Frame = (name, tics at 35/s, events). tics -1 = hold forever.
# Events: step (footfall sound), hit (melee damage lands), fire (projectile / breath spawns),
# smear (motion smear allowed), takeoff, land, roar, summon, teleport, block, thud.
KINDS = {
    "idle": dict(loop=True, frames=[("REST", 8, []), ("BREATHE IN", 8, []), ("HOLD", 8, []),
                                    ("BREATHE OUT", 8, []), ("SHIFT", 8, []), ("SETTLE", 8, [])],
                 note="Standing at rest, slow breathing and a small weight shift; F6 flows back "
                      "into F1."),
    "walk": dict(loop=True, frames=[("CONTACT A", 5, ["step"]), ("DOWN A", 5, []),
                                    ("PASS A", 5, []), ("CONTACT B", 5, ["step"]),
                                    ("DOWN B", 5, []), ("PASS B", 5, [])],
                 note="Walking loop in place (the game moves the sprite); F6 flows into F1."),
    "run": dict(loop=True, frames=[("PUSH A", 3, ["step"]), ("FLIGHT A", 3, []),
                                   ("REACH A", 3, []), ("PUSH B", 3, ["step"]),
                                   ("FLIGHT B", 3, []), ("REACH B", 3, [])],
                note="Running loop in place, leaning into the run; F6 flows into F1."),
    "jump": dict(loop=False, frames=[("CROUCH", 4, []), ("LAUNCH", 3, ["takeoff"]),
                                     ("RISE", 4, []), ("APEX", 5, []), ("FALL", 4, []),
                                     ("LAND", 5, ["land"])],
                 note="Jump. Keep the body near the ground line: the game lifts the sprite, "
                      "the frames only change the pose."),
    "fly": dict(loop=True, frames=[("WINGS UP", 4, []), ("DOWNBEAT", 3, []),
                                   ("WINGS DOWN", 4, []), ("UPSTROKE", 4, []),
                                   ("GLIDE", 4, []), ("RISE", 4, [])],
                note="Flying loop, one full wingbeat. The game sets the altitude; draw the "
                     "lowest point (feet or tail) just above the ground line."),
    "fly_fast": dict(loop=True, frames=[("WINGS UP", 2, []), ("DOWNBEAT", 2, []),
                                        ("WINGS DOWN", 3, []), ("TUCK", 3, []),
                                        ("UPSTROKE", 2, []), ("RISE", 2, [])],
                     note="Fast flight: body stretched out flat, hard short wingbeats."),
    "float": dict(loop=True, frames=[("DRIFT 1", 6, []), ("DRIFT 2", 6, []), ("DRIFT 3", 6, []),
                                     ("DRIFT 4", 6, []), ("DRIFT 5", 6, []),
                                     ("DRIFT 6", 6, [])],
                  note="Gliding above the ground line without walking; trailing cloth and hair "
                       "ripple through one loop."),
    "float_fast": dict(loop=True, frames=[("SURGE 1", 3, []), ("SURGE 2", 3, []),
                                          ("SURGE 3", 3, []), ("SURGE 4", 3, []),
                                          ("SURGE 5", 3, []), ("SURGE 6", 3, [])],
                       note="Fast glide: leaning hard forward, everything streaming behind."),
    "slither": dict(loop=True, frames=[("CURVE 1", 5, []), ("CURVE 2", 5, []), ("CURVE 3", 5, []),
                                       ("CURVE 4", 5, []), ("CURVE 5", 5, []),
                                       ("CURVE 6", 5, [])],
                    note="Serpent locomotion: an S-curve wave travels down the body each loop."),
    "slither_fast": dict(loop=True, frames=[("SURGE 1", 3, []), ("SURGE 2", 3, []),
                                            ("SURGE 3", 3, []), ("SURGE 4", 3, []),
                                            ("SURGE 5", 3, []), ("SURGE 6", 3, [])],
                         note="Fast serpent surge: tighter, quicker waves, head held low."),
    "talk": dict(loop=True, frames=[("LISTEN", 7, []), ("GESTURE 1", 7, []),
                                    ("GESTURE 2", 7, []), ("NOD", 7, []), ("GESTURE 3", 7, []),
                                    ("SHRUG", 7, [])],
                 note="Talking loop: head and hand gestures, feet planted."),
    "melee": dict(loop=False, frames=[("READY", 4, []), ("WIND-UP", 5, []),
                                      ("STRIKE", 3, ["smear"]), ("IMPACT", 4, ["hit"]),
                                      ("FOLLOW-THROUGH", 5, []), ("RECOVER", 6, [])],
                  note="Melee attack; damage lands on F4."),
    "heavy": dict(loop=False, frames=[("READY", 6, []), ("WIND-UP", 8, []), ("PEAK", 6, []),
                                      ("STRIKE", 3, ["smear"]), ("IMPACT", 6, ["hit"]),
                                      ("RECOVER", 10, [])],
                  note="Slow heavy attack with a long, readable wind-up; damage lands on F5."),
    "leap": dict(loop=False, frames=[("CROUCH", 6, []), ("SPRING", 3, ["takeoff"]),
                                     ("AIRBORNE", 4, ["smear"]), ("STRIKE", 4, ["hit", "land"]),
                                     ("RECOVER", 6, []), ("RISE", 6, [])],
                  note="Leaping attack: the game moves the creature forward and up; damage "
                       "lands on F4 as it comes down."),
    "cast": dict(loop=False, frames=[("GATHER", 5, []), ("GATHER 2", 5, []), ("CHARGE", 4, []),
                                     ("RELEASE", 4, ["fire"]), ("AFTER", 5, []),
                                     ("RECOVER", 6, [])],
                 note="Spell: magic gathers in F1-F3 and the projectile leaves on F4. Magic is "
                      "solid pixels with a hard edge (STYLE_GUIDE §4)."),
    "shoot": dict(loop=False, frames=[("NOCK", 5, []), ("DRAW", 6, []), ("FULL DRAW", 4, []),
                                      ("LOOSE", 3, ["fire"]), ("FOLLOW", 5, []),
                                      ("LOWER", 6, [])],
                  note="Bow shot: the arrow leaves on F4 (the game spawns the arrow sprite)."),
    "throw": dict(loop=False, frames=[("READY", 4, []), ("WIND-UP", 5, []), ("COCK", 4, []),
                                      ("RELEASE", 3, ["fire"]), ("FOLLOW", 5, []),
                                      ("RECOVER", 6, [])],
                  note="Throw: the thrown object leaves the hand on F4 (the game spawns it)."),
    "breath": dict(loop=False, frames=[("REAR", 6, []), ("INHALE", 8, []), ("OPEN", 4, []),
                                       ("BREATH 1", 5, ["fire"]), ("BREATH 2", 5, ["fire"]),
                                       ("CLOSE", 8, [])],
                   note="Breath attack: the game plays F4-F5 in a loop while it breathes. Paint "
                        "only the glow in the mouth; the game draws the breath stream."),
    "roar": dict(loop=False, frames=[("LIFT", 5, []), ("OPEN", 5, []), ("ROAR 1", 6, ["roar"]),
                                     ("ROAR 2", 6, []), ("CLOSE", 5, []), ("SETTLE", 6, [])],
                 note="Roar / taunt: head up, jaws wide on F3-F4."),
    "summon": dict(loop=False, frames=[("RAISE", 5, []), ("CALL", 6, []), ("CHARGE", 5, []),
                                       ("SUMMON", 5, ["summon"]), ("HOLD", 6, []),
                                       ("LOWER", 6, [])],
                   note="Summoning: the minions appear on F4 (the game spawns them)."),
    "blink": dict(loop=False, frames=[("FADE 1", 4, []), ("FADE 2", 4, []),
                                      ("GONE", 6, ["teleport"]), ("RETURN 1", 4, []),
                                      ("RETURN 2", 4, []), ("SOLID", 4, [])],
                  note="Teleport: the body breaks into hard-edged ordered-dither and magic in "
                       "F1-F2, F3 is only a few sparks, F4-F6 reform. No soft transparency."),
    "block": dict(loop=False, frames=[("RAISE", 3, []), ("GUARD", 4, []),
                                      ("BRACE", 6, ["block"]), ("HOLD", 6, []), ("LOWER", 4, []),
                                      ("READY", 4, [])],
                  note="Block: guard raised, braced on F3-F4."),
    "takeoff": dict(loop=False, frames=[("CROUCH", 6, []), ("WINGS UP", 5, []),
                                        ("SPRING", 4, ["takeoff"]), ("FIRST BEAT", 4, []),
                                        ("CLIMB", 4, []), ("AIRBORNE", 4, [])],
                    note="Take-off (its jump): crouch, wings up, spring on F3; the game lifts it."),
    "land": dict(loop=False, frames=[("FLARE", 4, []), ("BACKBEAT", 4, []), ("DESCEND", 4, []),
                                     ("TOUCH", 4, ["land"]), ("ABSORB", 5, []),
                                     ("SETTLE", 6, [])],
                 note="Landing: wings flare, feet touch on F4."),
    "hurt": dict(loop=False, frames=[("STRUCK", 3, []), ("RECOIL", 4, []), ("STAGGER", 4, []),
                                     ("CATCH", 4, []), ("STEADY", 4, []), ("READY", 4, [])],
                 note="Pain flinch: knocked back on F1-F2, recovers to the idle pose by F6."),
    "death": dict(loop=False, frames=[("STRUCK", 4, []), ("STAGGER", 5, []), ("BUCKLE", 5, []),
                                      ("FALL", 5, []), ("IMPACT", 6, ["thud"]),
                                      ("STILL", -1, [])],
                  note="Death: collapses onto the ground line. F6 is held, then swapped for the "
                       "corpse, so F6 must match the corpse sheet in the same direction."),
}

# Each size class comes in two direction sets: 5 (symmetric: D1-D5, the game mirrors the rest)
# and 8 (holds something in one hand: every direction painted).
DIRSETS = {5: [d for d in DIRS if d[0] <= 5], 8: DIRS}
