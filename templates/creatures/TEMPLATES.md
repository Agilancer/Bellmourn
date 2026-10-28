# Creature templates

Pick the folder for the creature's size class and direction set, then paint its model sheet, the animation templates it needs, and its corpse. See HOW_TO_USE.md.

## Size classes

| Class | 1 m = | Art box per frame | For | Folders (sheets) |
|---|---|---|---|---|
| **S** small | 64 px | 252×105 | small creatures and vermin, up to 1.5 m tall | `S5` (28), `S8` (28) |
| **M** medium | 64 px | 252×177 | people, NPCs and man-sized enemies, up to 2.7 m tall | `M5` (28), `M8` (54) |
| **L** large | 48 px | 252×226 | large enemies and medium bosses, up to 4.6 m tall | `L5` (54), `L8` (54) |
| **H** huge | 32 px | 252×306 | big bosses, up to 9.4 m tall | `H5` (54), `H8` (80) |
| **E** epic | 16 px | 508×468 | epic bosses such as huge dragons, up to 29 m tall / 31 m long | `E5` (132), `E8` (212) |

- `…5` = symmetric creature: paint D1-D5, the game mirrors D6-D8.
- `…8` = holds something in one hand (weapon, shield, bow, staff): paint all 8.

## Animation templates (every one is 6 frames)

| Template | Loops | Frames (tics at 35/s; events) | What |
|---|---|---|---|
| `idle` | yes | REST 8, BREATHE IN 8, HOLD 8, BREATHE OUT 8, SHIFT 8, SETTLE 8 | Standing at rest, slow breathing and a small weight shift; F6 flows back into F1. |
| `walk` | yes | CONTACT A 5 **step**, DOWN A 5, PASS A 5, CONTACT B 5 **step**, DOWN B 5, PASS B 5 | Walking loop in place (the game moves the sprite); F6 flows into F1. |
| `run` | yes | PUSH A 3 **step**, FLIGHT A 3, REACH A 3, PUSH B 3 **step**, FLIGHT B 3, REACH B 3 | Running loop in place, leaning into the run; F6 flows into F1. |
| `jump` | no | CROUCH 4, LAUNCH 3 **takeoff**, RISE 4, APEX 5, FALL 4, LAND 5 **land** | Jump. Keep the body near the ground line: the game lifts the sprite, the frames only change the pose. |
| `fly` | yes | WINGS UP 4, DOWNBEAT 3, WINGS DOWN 4, UPSTROKE 4, GLIDE 4, RISE 4 | Flying loop, one full wingbeat. The game sets the altitude; draw the lowest point (feet or tail) just above the ground line. |
| `fly_fast` | yes | WINGS UP 2, DOWNBEAT 2, WINGS DOWN 3, TUCK 3, UPSTROKE 2, RISE 2 | Fast flight: body stretched out flat, hard short wingbeats. |
| `float` | yes | DRIFT 1 6, DRIFT 2 6, DRIFT 3 6, DRIFT 4 6, DRIFT 5 6, DRIFT 6 6 | Gliding above the ground line without walking; trailing cloth and hair ripple through one loop. |
| `float_fast` | yes | SURGE 1 3, SURGE 2 3, SURGE 3 3, SURGE 4 3, SURGE 5 3, SURGE 6 3 | Fast glide: leaning hard forward, everything streaming behind. |
| `slither` | yes | CURVE 1 5, CURVE 2 5, CURVE 3 5, CURVE 4 5, CURVE 5 5, CURVE 6 5 | Serpent locomotion: an S-curve wave travels down the body each loop. |
| `slither_fast` | yes | SURGE 1 3, SURGE 2 3, SURGE 3 3, SURGE 4 3, SURGE 5 3, SURGE 6 3 | Fast serpent surge: tighter, quicker waves, head held low. |
| `talk` | yes | LISTEN 7, GESTURE 1 7, GESTURE 2 7, NOD 7, GESTURE 3 7, SHRUG 7 | Talking loop: head and hand gestures, feet planted. |
| `melee` | no | READY 4, WIND-UP 5, STRIKE 3 **smear**, IMPACT 4 **hit**, FOLLOW-THROUGH 5, RECOVER 6 | Melee attack; damage lands on F4. |
| `heavy` | no | READY 6, WIND-UP 8, PEAK 6, STRIKE 3 **smear**, IMPACT 6 **hit**, RECOVER 10 | Slow heavy attack with a long, readable wind-up; damage lands on F5. |
| `leap` | no | CROUCH 6, SPRING 3 **takeoff**, AIRBORNE 4 **smear**, STRIKE 4 **hit/land**, RECOVER 6, RISE 6 | Leaping attack: the game moves the creature forward and up; damage lands on F4 as it comes down. |
| `cast` | no | GATHER 5, GATHER 2 5, CHARGE 4, RELEASE 4 **fire**, AFTER 5, RECOVER 6 | Spell: magic gathers in F1-F3 and the projectile leaves on F4. Magic is solid pixels with a hard edge (STYLE_GUIDE §4). |
| `shoot` | no | NOCK 5, DRAW 6, FULL DRAW 4, LOOSE 3 **fire**, FOLLOW 5, LOWER 6 | Bow shot: the arrow leaves on F4 (the game spawns the arrow sprite). |
| `throw` | no | READY 4, WIND-UP 5, COCK 4, RELEASE 3 **fire**, FOLLOW 5, RECOVER 6 | Throw: the thrown object leaves the hand on F4 (the game spawns it). |
| `breath` | no | REAR 6, INHALE 8, OPEN 4, BREATH 1 5 **fire**, BREATH 2 5 **fire**, CLOSE 8 | Breath attack: the game plays F4-F5 in a loop while it breathes. Paint only the glow in the mouth; the game draws the breath stream. |
| `roar` | no | LIFT 5, OPEN 5, ROAR 1 6 **roar**, ROAR 2 6, CLOSE 5, SETTLE 6 | Roar / taunt: head up, jaws wide on F3-F4. |
| `summon` | no | RAISE 5, CALL 6, CHARGE 5, SUMMON 5 **summon**, HOLD 6, LOWER 6 | Summoning: the minions appear on F4 (the game spawns them). |
| `blink` | no | FADE 1 4, FADE 2 4, GONE 6 **teleport**, RETURN 1 4, RETURN 2 4, SOLID 4 | Teleport: the body breaks into hard-edged ordered-dither and magic in F1-F2, F3 is only a few sparks, F4-F6 reform. No soft transparency. |
| `block` | no | RAISE 3, GUARD 4, BRACE 6 **block**, HOLD 6, LOWER 4, READY 4 | Block: guard raised, braced on F3-F4. |
| `takeoff` | no | CROUCH 6, WINGS UP 5, SPRING 4 **takeoff**, FIRST BEAT 4, CLIMB 4, AIRBORNE 4 | Take-off (its jump): crouch, wings up, spring on F3; the game lifts it. |
| `land` | no | FLARE 4, BACKBEAT 4, DESCEND 4, TOUCH 4 **land**, ABSORB 5, SETTLE 6 | Landing: wings flare, feet touch on F4. |
| `hurt` | no | STRUCK 3, RECOIL 4, STAGGER 4, CATCH 4, STEADY 4, READY 4 | Pain flinch: knocked back on F1-F2, recovers to the idle pose by F6. |
| `death` | no | STRUCK 4, STAGGER 5, BUCKLE 5, FALL 5, IMPACT 6 **thud**, STILL hold | Death: collapses onto the ground line. F6 is held, then swapped for the corpse, so F6 must match the corpse sheet in the same direction. |

Plus `model` (paint first) and `corpse` (one frame per direction) in every folder.

Use a template under any animation name: a creature with two melee attacks paints `melee` twice and names them, e.g. `slash` and `bash` (see HOW_TO_USE.md).
