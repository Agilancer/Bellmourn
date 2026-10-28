# Grave Rat (`grave_rat`)

- Tier: Enemies  ·  size class S (small, 1 m = 64 px)  ·  height 0.5 m
- Directions: D1-D5 (symmetric; the game mirrors D6-D8)
- Look: A dog-sized rat bloated on corpse-meat: patchy grey-brown fur, bald scabbed patches, long yellow incisors, a pink-grey naked tail, milky eyes.
- Palette ramps (locked for this creature): stone 3-10 (fur), earth 3-8, flesh 4-10 (tail, scabs), bone 9-13 (teeth)

## Sheets, in painting order

| # | File | What |
|---|---|---|
| 1 | `grave_rat_model_p1.png` | MODEL SHEET: standing at rest, every direction. Paint first. |
| 2 | `grave_rat_idle_p1.png` | `idle` (idle): Standing at rest, slow breathing and a small weight shift; F6 flows back into F1. |
| 3 | `grave_rat_walk_p1.png` | `walk` (walk): Walking loop in place (the game moves the sprite); F6 flows into F1. |
| 4 | `grave_rat_run_p1.png` | `run` (run): Running loop in place, leaning into the run; F6 flows into F1. |
| 5 | `grave_rat_jump_p1.png` | `jump` (jump): Jump. Keep the body near the ground line: the game lifts the sprite, the frames only change the pose. |
| 6 | `grave_rat_bite_p1.png` | `bite` (melee): Snapping lunge bite. Melee attack; damage lands on F4. |
| 7 | `grave_rat_leap_bite_p1.png` | `leap_bite` (leap): Leaps at the player's face, jaws open. Leaping attack: the game moves the creature forward and up; damage lands on F4 as it comes down. |
| 8 | `grave_rat_hurt_p1.png` | `hurt` (hurt): Pain flinch: knocked back on F1-F2, recovers to the idle pose by F6. |
| 9 | `grave_rat_death_p1.png` | `death` (death): Death: collapses onto the ground line. F6 is held, then swapped for the corpse, so F6 must match the corpse sheet in the same direction. |
| 10 | `grave_rat_corpse_p1.png` | Corpse on the ground, every direction (matches death F6). |

## Step 1: the model sheet

Start a new ChatGPT chat for this creature. Attach `STYLE_GUIDE.md`, `CREATURE_GUIDE.md`, `bellmourn_palette.png` and `grave_rat_model_p1.png`, then paste:

```
You are painting enemy/NPC billboard sprites for Bellmourn, a 1990s first-person dark
fantasy RPG (Heretic / Hexen / Daggerfall era). Follow the attached STYLE_GUIDE.md and
CREATURE_GUIDE.md exactly; they are locked. Use only colours from bellmourn_palette.png.

Creature: Grave Rat. A dog-sized rat bloated on corpse-meat: patchy grey-brown fur, bald scabbed patches, long yellow incisors, a pink-grey naked tail, milky eyes.
Paint it only from these palette ramps: stone 3-10 (fur), earth 3-8, flesh 4-10 (tail, scabs), bone 9-13 (teeth).
Height: 0.5 m, which is the dotted cyan line above the ground line.

The attached sheet is the MODEL SHEET: one cell per direction, the creature standing
at rest. D1 = faces the viewer, D2 = three-quarter front view, turned to face screen-left, D3 = profile, facing screen-left, D4 = three-quarter back view, walking away toward screen-left, D5 = seen from behind.
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
Next sheet for the Grave Rat: <FILE>. <WHAT, from the table>
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
Put every painted sheet in one zip named grave_rat_painted.zip, each PNG named exactly
like the template it was painted on (e.g. grave_rat_idle_p1.png), at
1536x1024, RGB, with the background pure #FF00FF. No other files.
```

Then import it into the game:

```
python tools/templates/import_creatures.py path/to/grave_rat_painted.zip
```
