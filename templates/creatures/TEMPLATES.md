# Creature templates

Pick the folder for the creature's size class and direction set, then paint its model sheet, the animation templates it needs, and its corpse. See HOW_TO_USE.md.

## Size classes

| Class | 1 m = | Art box per frame | For | Folders (sheets) |
|---|---|---|---|---|
| **S** small | 64 px | 380×105 | small creatures and vermin, up to 1.5 m tall | `S5` (28), `S8` (28) |
| **M** medium | 64 px | 380×177 | people, NPCs and man-sized enemies, up to 2.7 m tall | `M5` (28), `M8` (54) |
| **L** large | 48 px | 380×226 | large enemies and medium bosses, up to 4.6 m tall | `L5` (54), `L8` (54) |
| **H** huge | 32 px | 380×306 | big bosses, up to 9.4 m tall | `H5` (54), `H8` (80) |
| **E** epic | 16 px | 764×468 | epic bosses such as huge dragons, up to 29 m tall / 47 m long | `E5` (134), `E8` (212) |

- `…5` = symmetric creature: paint D1-D5, the game mirrors D6-D8.
- `…8` = holds something in one hand (weapon, shield, bow, staff): paint all 8.

## Animation templates (every one is 4 frames)

| Template | Loops | Frames (tics at 35/s; events) | What |
|---|---|---|---|
| `idle` | yes | REST 10, BREATHE IN 10, HOLD 10, BREATHE OUT 10 | Standing at rest, slow breathing and a small weight shift; F4 flows back into F1. |
| `walk` | yes | CONTACT A 6 **step**, PASS A 6, CONTACT B 6 **step**, PASS B 6 | Walking loop in place (the game moves the sprite): F1 and F3 are the two foot contacts, F2 and F4 the passing poses; F4 flows into F1. |
| `run` | yes | PUSH A 4 **step**, FLIGHT A 4, PUSH B 4 **step**, FLIGHT B 4 | Running loop in place, leaning into the run: F1 and F3 push off, F2 and F4 are in the air; F4 flows into F1. |
| `jump` | no | CROUCH 5, LAUNCH 4 **takeoff**, TUCK 8, LAND 6 **land** | Jump. Keep the body near the ground line: the game lifts the sprite, the frames only change the pose. |
| `fly` | yes | WINGS UP 5, DOWNBEAT 4, WINGS DOWN 5, UPSTROKE 5 | Flying loop, one full wingbeat. The game sets the altitude; draw the lowest point (feet or tail) just above the ground line. |
| `fly_fast` | yes | WINGS UP 3, DOWNBEAT 3, TUCK 3, UPSTROKE 3 | Fast flight: body stretched out flat, hard short wingbeats. |
| `float` | yes | DRIFT 1 8, DRIFT 2 8, DRIFT 3 8, DRIFT 4 8 | Gliding above the ground line without walking; trailing cloth and hair ripple through one loop. |
| `float_fast` | yes | SURGE 1 4, SURGE 2 4, SURGE 3 4, SURGE 4 4 | Fast glide: leaning hard forward, everything streaming behind. |
| `slither` | yes | CURVE 1 6, CURVE 2 6, CURVE 3 6, CURVE 4 6 | Serpent locomotion: an S-curve wave travels down the body each loop. |
| `slither_fast` | yes | SURGE 1 4, SURGE 2 4, SURGE 3 4, SURGE 4 4 | Fast serpent surge: tighter, quicker waves, head held low. |
| `talk` | yes | LISTEN 9, GESTURE 1 9, NOD 9, GESTURE 2 9 | Talking loop: head and hand gestures, feet planted. |
| `melee` | no | READY 4, WIND-UP 6, IMPACT 5 **smear/hit**, RECOVER 7 | Melee attack; damage lands on F3. |
| `heavy` | no | WIND-UP 10, PEAK 7, IMPACT 7 **smear/hit**, RECOVER 12 | Slow heavy attack with a long, readable wind-up; damage lands on F3. |
| `leap` | no | CROUCH 7, SPRING 4 **takeoff**, STRIKE 6 **smear/hit/land**, RECOVER 8 | Leaping attack: the game moves the creature forward and up; damage lands on F3 as it comes down. |
| `cast` | no | GATHER 7, CHARGE 6, RELEASE 5 **fire**, RECOVER 7 | Spell: magic gathers in F1-F2 and the projectile leaves on F3. Magic is solid pixels with a hard edge (STYLE_GUIDE §4). |
| `shoot` | no | DRAW 7, FULL DRAW 5, LOOSE 4 **fire**, LOWER 7 | Bow shot: the arrow leaves on F3 (the game spawns the arrow sprite). |
| `throw` | no | WIND-UP 7, COCK 4, RELEASE 4 **fire**, RECOVER 7 | Throw: the thrown object leaves the hand on F3 (the game spawns it). |
| `breath` | no | INHALE 10, OPEN 5, BREATH 6 **fire**, CLOSE 8 | Breath attack: the game holds F3 while it breathes. Paint only the glow in the mouth; the game draws the breath stream. |
| `roar` | no | LIFT 6, ROAR 1 8 **roar**, ROAR 2 8, SETTLE 7 | Roar / taunt: head up, jaws wide on F2-F3. |
| `summon` | no | RAISE 7, CHARGE 6, SUMMON 6 **summon**, LOWER 7 | Summoning: the minions appear on F3 (the game spawns them). |
| `blink` | no | FADE 5, GONE 7 **teleport**, RETURN 5, SOLID 5 | Teleport: the body breaks into hard-edged ordered-dither and magic in F1, F2 is only a few sparks, F3-F4 reform. No soft transparency. |
| `block` | no | RAISE 4, BRACE 7 **block**, HOLD 7, LOWER 5 | Block: guard raised, braced on F2-F3. |
| `takeoff` | no | CROUCH 7, WINGS UP 6, SPRING 5 **takeoff**, CLIMB 5 | Take-off (its jump): crouch, wings up, spring on F3; the game lifts it. |
| `land` | no | FLARE 5, DESCEND 5, TOUCH 5 **land**, SETTLE 7 | Landing: wings flare, feet touch on F3. |
| `hurt` | no | STRUCK 4, RECOIL 5, STAGGER 5, READY 5 | Pain flinch: knocked back on F1-F2, back to the idle pose by F4. |
| `death` | no | STRUCK 5, BUCKLE 6, FALL 6, STILL hold **thud** | Death: collapses onto the ground line. F4 is held, then swapped for the corpse, so F4 must match the corpse sheet in the same direction. |

Plus `model` (paint first) and `corpse` (one frame per direction) in every folder.

Use a template under any animation name: a creature with two melee attacks paints `melee` twice and names them, e.g. `slash` and `bash` (see HOW_TO_USE.md).
