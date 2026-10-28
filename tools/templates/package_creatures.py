"""Bundle the creature template pack into a zip to hand to ChatGPT.

    python tools/templates/creature_sheets.py      # (re)draw the templates first
    python tools/templates/package_creatures.py    # writes templates/packs/bellmourn_creatures.zip

The zip holds the locked style guide, the creature guide, the palette, a ready-to-paste prompt,
a blank creature card and every size class's template set.
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TPL = os.path.join(ROOT, "templates")

PROMPT = """# How to use the creature pack with ChatGPT

Every NPC, enemy and boss is painted on the same blank templates. Nothing in the pack is a
creature design: you bring the creature, the templates bring the size, the directions and the
timing, and STYLE_GUIDE.md + CREATURE_GUIDE.md bring the look.

## 1. Fill in a creature card

Copy `CREATURE_CARD.md` and fill it in. Choose:

- the **size class** (see `TEMPLATES.md`): S small, M medium, L large, H huge, E epic;
- the **direction set**: `5` if the creature is the same on both sides (the game mirrors
  D6-D8), `8` if it holds something in one hand. Together these name the template folder,
  e.g. `templates/M8/`;
- the **animations** it has, each one a name plus the template it uses, e.g.
  `walk = walk`, `bite = melee`, `pounce = leap`, `spit = cast`, `death = death`.
  Every creature needs `model` (painted first) and should have `idle`, `hurt`, `death` and
  `corpse`.

## 2. Paint the model sheet

New ChatGPT chat per creature. Attach `STYLE_GUIDE.md`, `CREATURE_GUIDE.md`,
`bellmourn_palette.png` and the model template (e.g. `templates/M8/M8_model_p1.png`), then
paste:

---
You are painting billboard sprites for Bellmourn, a 1990s first-person dark fantasy RPG
(Heretic / Hexen / Daggerfall era). Follow the attached STYLE_GUIDE.md and CREATURE_GUIDE.md
exactly; they are locked. Use only colours from bellmourn_palette.png.

Creature: <NAME>. <DESCRIPTION FROM THE CARD>
Paint it only from these palette ramps: <RAMPS FROM THE CARD>.
It is <HEIGHT> m tall: use the cyan metre ticks up the left of each cell.

The attached sheet is its MODEL SHEET: one cell per direction (the label says which), the
creature standing at rest.
- Feet (or lowest point) on the cyan ground line, centred on the cyan tick.
- Then paint every cyan line, tick and label inside the cells over with flat #FF00FF.
- Keep the sheet exactly 1536x1024 and every black cell border where it is.
- Hard pixel edges against the magenta, no outline all the way round, no text.
---

Redo it until it is right from every side: every other sheet copies it.

## 3. Paint each animation, one sheet per message

In the same chat, attach the next template (and the painted model sheet again every few
sheets), then paste:

---
Next sheet for the <NAME>: the <ANIMATION NAME> animation, painted on this <TEMPLATE>
template. What it does: <ONE LINE, e.g. "a lunging bite with a head shake">.
Paint exactly the creature on the painted model sheet: same design, colours, size, light and
pixel scale in every cell. Each row is one direction (the label says which), 4 frames left to
right; each label names the pose of that frame. HIT marks the frame a blow lands, FIRE where a
projectile leaves, SMEAR where a motion smear is allowed. Keep the feet on the ground line and
the creature centred on the tick (the game moves it). Then paint all cyan guides and labels
inside the cells over with flat #FF00FF. Keep the sheet 1536x1024 with every black border
where it is.
---

Bigger classes split an animation over several pages (`_p1`, `_p2`, ...): paint every page.

## 4. Get one zip back

When every sheet is painted, paste (with the card's JSON block filled in):

---
Put every painted sheet in one zip named <creature_id>_painted.zip. Name each PNG
<creature_id>__<animation name>__<template file name>, e.g.
bog_hound__bite__S5_melee_p1.png and bog_hound__model__S5_model_p1.png, keeping it 1536x1024,
RGB, with the background pure #FF00FF. Also add a file <creature_id>.json containing:
{"name": "<NAME>", "tier": "<TIER>", "height_m": <HEIGHT>}. No other files.
---

## 5. Put it in the game

    python tools/templates/import_creatures.py path/to/<creature_id>_painted.zip

This lines the sheets up, keys out the magenta and guides, snaps to the palette, trims, mirrors
D6-D8 where needed and writes `assets/creatures/<creature_id>/` (atlas pages, `creature.json`,
preview GIFs) plus `assets/creatures/index.json`. It reports missing pages, empty frames and
art touching a cell edge. `src/creature_sprites.js` loads `creature.json`, picks the direction
from the camera, runs the frame timing and fires the events (hit, fire, step, ...).
"""

CARD = """# Creature card

Fill this in for each creature before painting.

- **id** (lower_case, no spaces):
- **Name**:
- **Tier**: npc / enemy / mid_boss / big_boss / epic_boss
- **Size class** (S / M / L / H / E, see TEMPLATES.md):
- **Direction set**: 5 (same on both sides) / 8 (holds something in one hand; say which hand)
- **Height at rest** (metres):
- **Description** (silhouette, body, clothing or hide, what it carries, face, glow):
- **Palette ramps** (3-5 of: stone slate earth wood flesh blood fire gold iron moss venom mana
  arcane bone sky leather, with shade ranges, e.g. "iron 2-9, blood 2-6"):
- **Animations** (name = template, plus one line on what it does):
  - model = model
  - idle = idle
  - walk = walk
  - run = run
  - jump = jump          (or fly, fly_fast, float, float_fast, slither, slither_fast, takeoff, land)
  - <attack> = melee     (or heavy, leap, cast, shoot, throw, breath, roar, summon, blink, block)
  - hurt = hurt
  - death = death
  - corpse = corpse

`<id>.json`, zipped with the painted sheets:

```json
{"name": "", "tier": "enemy", "height_m": 1.8}
```
"""


def pack_creatures():
    out_dir = os.path.join(TPL, "packs")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "bellmourn_creatures.zip")
    src = os.path.join(TPL, "creatures")
    sets = sorted(d for d in os.listdir(src) if os.path.isdir(os.path.join(src, d)))
    n = 0
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("HOW_TO_USE.md", PROMPT)
        z.writestr("CREATURE_CARD.md", CARD)
        for name in ("STYLE_GUIDE.md", "CREATURE_GUIDE.md", "bellmourn_palette.png",
                     "bellmourn_palette.gpl", "bellmourn_palette.json"):
            z.write(os.path.join(TPL, "style", name), name)
        z.write(os.path.join(src, "TEMPLATES.md"), "TEMPLATES.md")
        for s in sets:
            for f in sorted(os.listdir(os.path.join(src, s))):
                z.write(os.path.join(src, s, f), f"templates/{s}/{f}")
                n += f.endswith(".png")
    return path, n


if __name__ == "__main__":
    path, n = pack_creatures()
    print(f"wrote {path} ({n} sheets, {os.path.getsize(path) // 1024} KB)")
