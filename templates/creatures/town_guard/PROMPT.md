# Town Guard (`town_guard`)

- Tier: NPCs  ·  size class M (medium, 1 m = 64 px)  ·  height 1.85 m
- Directions: all 8 (holds something in one hand)
- Look: A town watchman in a padded gambeson dyed wine red, a dented iron kettle hat and mail coif, a halberd held in the RIGHT hand, a lantern on the belt at his left hip. Thick moustache, broad build.
- Palette ramps (locked for this creature): blood 2-7 (gambeson), iron 2-11, wood 3-9 (haft), flesh 4-11, fire 9-14 (lamp)

## Sheets, in painting order

| # | File | What |
|---|---|---|
| 1 | `town_guard_model_p1.png` | MODEL SHEET: standing at rest, every direction. Paint first. |
| 2 | `town_guard_idle_p1.png` | `idle` (idle): Standing at rest, slow breathing and a small weight shift; F6 flows back into F1. (page 1/2) |
| 3 | `town_guard_idle_p2.png` | `idle` (idle): Standing at rest, slow breathing and a small weight shift; F6 flows back into F1. (page 2/2) |
| 4 | `town_guard_walk_p1.png` | `walk` (walk): Walking loop in place (the game moves the sprite); F6 flows into F1. (page 1/2) |
| 5 | `town_guard_walk_p2.png` | `walk` (walk): Walking loop in place (the game moves the sprite); F6 flows into F1. (page 2/2) |
| 6 | `town_guard_run_p1.png` | `run` (run): Running loop in place, leaning into the run; F6 flows into F1. (page 1/2) |
| 7 | `town_guard_run_p2.png` | `run` (run): Running loop in place, leaning into the run; F6 flows into F1. (page 2/2) |
| 8 | `town_guard_jump_p1.png` | `jump` (jump): Jump. Keep the body near the ground line: the game lifts the sprite, the frames only change the pose. (page 1/2) |
| 9 | `town_guard_jump_p2.png` | `jump` (jump): Jump. Keep the body near the ground line: the game lifts the sprite, the frames only change the pose. (page 2/2) |
| 10 | `town_guard_talk_p1.png` | `talk` (talk): Talking loop: head and hand gestures, feet planted. (page 1/2) |
| 11 | `town_guard_talk_p2.png` | `talk` (talk): Talking loop: head and hand gestures, feet planted. (page 2/2) |
| 12 | `town_guard_thrust_p1.png` | `thrust` (melee): Halberd thrust straight ahead from the hip. Melee attack; damage lands on F4. (page 1/2) |
| 13 | `town_guard_thrust_p2.png` | `thrust` (melee): Halberd thrust straight ahead from the hip. Melee attack; damage lands on F4. (page 2/2) |
| 14 | `town_guard_chop_p1.png` | `chop` (heavy): Two-handed overhead chop with the halberd blade. Slow heavy attack with a long, readable wind-up; damage lands on F5. (page 1/2) |
| 15 | `town_guard_chop_p2.png` | `chop` (heavy): Two-handed overhead chop with the halberd blade. Slow heavy attack with a long, readable wind-up; damage lands on F5. (page 2/2) |
| 16 | `town_guard_hurt_p1.png` | `hurt` (hurt): Pain flinch: knocked back on F1-F2, recovers to the idle pose by F6. (page 1/2) |
| 17 | `town_guard_hurt_p2.png` | `hurt` (hurt): Pain flinch: knocked back on F1-F2, recovers to the idle pose by F6. (page 2/2) |
| 18 | `town_guard_death_p1.png` | `death` (death): Death: collapses onto the ground line. F6 is held, then swapped for the corpse, so F6 must match the corpse sheet in the same direction. (page 1/2) |
| 19 | `town_guard_death_p2.png` | `death` (death): Death: collapses onto the ground line. F6 is held, then swapped for the corpse, so F6 must match the corpse sheet in the same direction. (page 2/2) |
| 20 | `town_guard_corpse_p1.png` | Corpse on the ground, every direction (matches death F6). |

## Step 1: the model sheet

Start a new ChatGPT chat for this creature. Attach `STYLE_GUIDE.md`, `CREATURE_GUIDE.md`, `bellmourn_palette.png` and `town_guard_model_p1.png`, then paste:

```
You are painting enemy/NPC billboard sprites for Bellmourn, a 1990s first-person dark
fantasy RPG (Heretic / Hexen / Daggerfall era). Follow the attached STYLE_GUIDE.md and
CREATURE_GUIDE.md exactly; they are locked. Use only colours from bellmourn_palette.png.

Creature: Town Guard. A town watchman in a padded gambeson dyed wine red, a dented iron kettle hat and mail coif, a halberd held in the RIGHT hand, a lantern on the belt at his left hip. Thick moustache, broad build.
Paint it only from these palette ramps: blood 2-7 (gambeson), iron 2-11, wood 3-9 (haft), flesh 4-11, fire 9-14 (lamp).
Height: 1.85 m, which is the dotted cyan line above the ground line.

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
Next sheet for the Town Guard: <FILE>. <WHAT, from the table>
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
Put every painted sheet in one zip named town_guard_painted.zip, each PNG named exactly
like the template it was painted on (e.g. town_guard_idle_p1.png), at
1536x1024, RGB, with the background pure #FF00FF. No other files.
```

Then import it into the game:

```
python tools/templates/import_creatures.py path/to/town_guard_painted.zip
```
