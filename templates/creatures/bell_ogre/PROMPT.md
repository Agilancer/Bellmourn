# Bell Ogre (`bell_ogre`)

- Tier: Medium bosses  ·  size class L (large, 1 m = 48 px)  ·  height 3.6 m
- Directions: all 8 (holds something in one hand)
- Look: A towering grey-skinned ogre with a pot belly and huge arms, a tarnished bronze church bell on a beam as a maul in the RIGHT hand, iron chains wrapped round its waist and wrists, a tiny head with a jutting underbite and tusks.
- Palette ramps (locked for this creature): stone 4-12 (skin), gold 4-12 (bell), wood 3-8 (beam), iron 2-9 (chains), bone 8-12 (tusks)

## Sheets, in painting order

| # | File | What |
|---|---|---|
| 1 | `bell_ogre_model_p1.png` | MODEL SHEET: standing at rest, every direction. Paint first. |
| 2 | `bell_ogre_idle_p1.png` | `idle` (idle): Standing at rest, slow breathing and a small weight shift; F6 flows back into F1. (page 1/2) |
| 3 | `bell_ogre_idle_p2.png` | `idle` (idle): Standing at rest, slow breathing and a small weight shift; F6 flows back into F1. (page 2/2) |
| 4 | `bell_ogre_walk_p1.png` | `walk` (walk): Walking loop in place (the game moves the sprite); F6 flows into F1. (page 1/2) |
| 5 | `bell_ogre_walk_p2.png` | `walk` (walk): Walking loop in place (the game moves the sprite); F6 flows into F1. (page 2/2) |
| 6 | `bell_ogre_run_p1.png` | `run` (run): Running loop in place, leaning into the run; F6 flows into F1. (page 1/2) |
| 7 | `bell_ogre_run_p2.png` | `run` (run): Running loop in place, leaning into the run; F6 flows into F1. (page 2/2) |
| 8 | `bell_ogre_jump_p1.png` | `jump` (jump): Jump. Keep the body near the ground line: the game lifts the sprite, the frames only change the pose. (page 1/2) |
| 9 | `bell_ogre_jump_p2.png` | `jump` (jump): Jump. Keep the body near the ground line: the game lifts the sprite, the frames only change the pose. (page 2/2) |
| 10 | `bell_ogre_smash_p1.png` | `smash` (heavy): Overhead bell-maul smash; the bell tolls on impact. Slow heavy attack with a long, readable wind-up; damage lands on F5. (page 1/2) |
| 11 | `bell_ogre_smash_p2.png` | `smash` (heavy): Overhead bell-maul smash; the bell tolls on impact. Slow heavy attack with a long, readable wind-up; damage lands on F5. (page 2/2) |
| 12 | `bell_ogre_sweep_p1.png` | `sweep` (melee): Wide sideways sweep of the maul. Melee attack; damage lands on F4. (page 1/2) |
| 13 | `bell_ogre_sweep_p2.png` | `sweep` (melee): Wide sideways sweep of the maul. Melee attack; damage lands on F4. (page 2/2) |
| 14 | `bell_ogre_ground_pound_p1.png` | `ground_pound` (leap): Jumps and lands with both feet, shaking the ground (the game spawns a shockwave on F4). Leaping attack: the game moves the creature forward and up; damage lands on F4 as it comes down. (page 1/2) |
| 15 | `bell_ogre_ground_pound_p2.png` | `ground_pound` (leap): Jumps and lands with both feet, shaking the ground (the game spawns a shockwave on F4). Leaping attack: the game moves the creature forward and up; damage lands on F4 as it comes down. (page 2/2) |
| 16 | `bell_ogre_roar_p1.png` | `roar` (roar): Roar / taunt: head up, jaws wide on F3-F4. (page 1/2) |
| 17 | `bell_ogre_roar_p2.png` | `roar` (roar): Roar / taunt: head up, jaws wide on F3-F4. (page 2/2) |
| 18 | `bell_ogre_hurt_p1.png` | `hurt` (hurt): Pain flinch: knocked back on F1-F2, recovers to the idle pose by F6. (page 1/2) |
| 19 | `bell_ogre_hurt_p2.png` | `hurt` (hurt): Pain flinch: knocked back on F1-F2, recovers to the idle pose by F6. (page 2/2) |
| 20 | `bell_ogre_death_p1.png` | `death` (death): Death: collapses onto the ground line. F6 is held, then swapped for the corpse, so F6 must match the corpse sheet in the same direction. (page 1/2) |
| 21 | `bell_ogre_death_p2.png` | `death` (death): Death: collapses onto the ground line. F6 is held, then swapped for the corpse, so F6 must match the corpse sheet in the same direction. (page 2/2) |
| 22 | `bell_ogre_corpse_p1.png` | Corpse on the ground, every direction (matches death F6). |

## Step 1: the model sheet

Start a new ChatGPT chat for this creature. Attach `STYLE_GUIDE.md`, `CREATURE_GUIDE.md`, `bellmourn_palette.png` and `bell_ogre_model_p1.png`, then paste:

```
You are painting enemy/NPC billboard sprites for Bellmourn, a 1990s first-person dark
fantasy RPG (Heretic / Hexen / Daggerfall era). Follow the attached STYLE_GUIDE.md and
CREATURE_GUIDE.md exactly; they are locked. Use only colours from bellmourn_palette.png.

Creature: Bell Ogre. A towering grey-skinned ogre with a pot belly and huge arms, a tarnished bronze church bell on a beam as a maul in the RIGHT hand, iron chains wrapped round its waist and wrists, a tiny head with a jutting underbite and tusks.
Paint it only from these palette ramps: stone 4-12 (skin), gold 4-12 (bell), wood 3-8 (beam), iron 2-9 (chains), bone 8-12 (tusks).
Height: 3.6 m, which is the dotted cyan line above the ground line.

The attached sheet is the MODEL SHEET: one cell per direction, the creature standing
at rest. D1 = faces the viewer, D2 = three-quarter front view, turned to face screen-left, D3 = profile, facing screen-left, D4 = three-quarter back view, walking away toward screen-left, D5 = seen from behind, D6 = three-quarter back view, walking away toward screen-right, D7 = profile, facing screen-right, D8 = three-quarter front view, turned to face screen-right.
- Feet (or lowest point) on the cyan ground line, centred on the cyan tick.
- Top of the head at the dotted cyan line.
- Then paint every cyan line, label and tick inside the cells over with flat #FF00FF.
- Keep the sheet exactly 1536x1024 and every black cell border where it is.
- Hard pixel edges against the magenta, no outline all the way round, no text.
```

Check the result: same design from every side, right height, nothing outside the cells. Redo it until it is right: every other sheet copies it.

## Step 2: every other sheet, one per message, in the order above

In the same chat, attach the next sheet (and the painted model sheet again every few sheets so it stays in view), then paste with the sheet's line from the table filled in:

```
Next sheet for the Bell Ogre: <FILE>. <WHAT, from the table>
Paint exactly the creature on the painted model sheet: same design, colours, size,
light and pixel scale in every cell. Each row is one direction (the label says which),
6 frames left to right; each label names the frame's pose. HIT marks the frame a blow
lands, FIRE where a projectile leaves, SMEAR where a motion smear is allowed.
Keep the feet on the ground line and the creature centred on the tick unless the
animation moves it. Then paint all cyan guides and labels inside the cells over with
flat #FF00FF. Keep the sheet 1536x1024 with every black border where it is.
```

## Step 3: return everything as one zip

When every sheet is painted, paste:

```
Put every painted sheet in one zip named bell_ogre_painted.zip, each PNG named exactly
like the template it was painted on (e.g. bell_ogre_idle_p1.png), at
1536x1024, RGB, with the background pure #FF00FF. No other files.
```

Then import it into the game:

```
python tools/templates/import_creatures.py path/to/bell_ogre_painted.zip
```
