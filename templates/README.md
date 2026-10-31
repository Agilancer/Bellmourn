# Bellmourn template packs

Sheets and rigs handed to ChatGPT together with the locked style guide, so every sprite comes back
in the same style and the same motion.

- `style/`: `STYLE_GUIDE.md` (locked art rules) and the 256-colour palette (`.png`, `.gpl`, `.json`).
- `fp_weapons/<rig>/`: first-person weapon rigs, one folder each:
  - `<rig>_template.png`: the 1536×1024 sheet for ChatGPT (one 384×240 cell = one game screen).
  - `<rig>_frames.json`: per frame: sheet cell, tics (1/35 s), events (`hit`, `fire`, `smear`),
    projected joints and weapon tip, and `pose3d`, the full 3D arm pose in camera space (metres),
    so a rig can be reused for something else, e.g. driving a 3D or sprite-wrapped arm.
  - `<rig>_strip.png` / `<rig>_preview.gif`: review images. `*_with_sword.*` layer two rigs.

| Rig | What |
|---|---|
| `r1h_walk`, `l1h_walk` | one-handed weapon carried while walking (8-frame bob) |
| `r1h_swing`, `l1h_swing` | 16-frame overhand swing, keyed from the reference video |
| `lsh_walk`, `lsh_block` | round shield, left arm: carry, raise/block/brace/lower |
| `lks_walk`, `lks_block` | kite shield, left arm: same timing as the round shield |
| `r1h_shield_back` | weapon hand drawn back while a shield blocks (plays with either block) |

The one-handed motion is keyed from the user's reference video, `First Personal Swinging.mp4`
(the `ref=` on each key in `anims.py` is the video frame it came from).

## Regenerate

```
python tools/templates/fp_rig.py            # every rig (or name some: r1h_swing lks_block)
python tools/templates/fit_check.py         # fails if any frame goes above the top of the screen
```

Poses live in `tools/templates/anims.py` (screen position of the fist, weapon angle, lean,
shield facing); the IK, projection and drawing in `tools/templates/fp_rig.py`.

## 3D first-person models (`templates/models/`)

Low-poly three.js models (`.glb`) on the same rig, with texture sheets for ChatGPT.

- `arms/`: the bare arm (both sides). Skeleton: `upper`, `elbow`, `fore`, `hand`, three bones
  per finger and thumb, and an `item` socket at the grip. The wrist is skinned across forearm
  and hand, so it bends like skin. Every rig animation is in the file, by rig id.
- `gauntlets/<id>/`: ten gauntlets on that skeleton (`<id>_R.glb`, `<id>_L.glb`).
- `items/<kind>/<id>/`: fifty held items (10 one-handed, 10 two-handed, 10 wands, 10 staffs,
  5 round and 5 kite shields), modelled around the item socket: add them to the arm's `item`
  node. `r2h_walk_3d` / `r2h_swing_3d` are the 3D-only upright two-hander carry.
- Each model folder: `<id>_sheet.png` (for ChatGPT), `PROMPT.md` (what to paste),
  `<id>_mask.png`, `<id>_texture.png` (placeholder), `info.json`.
- `catalog/`: preview sheets of every model.

Paint a model: give ChatGPT `STYLE_GUIDE.md`, the palette and the sheet with its `PROMPT.md`,
then `python tools/models/apply_texture.py painted.png templates/models/<...>/<id>`.
Watch them animate: `tools/models/viewer.html` (served by `tools/serve.py`).

Rebuild: `python tools/models/build_arms.py`, `build_gauntlets.py`, `build_items.py`,
`manifest.py`, then `python tools/templates/package.py` for the zips in `templates/packs/`.

## Creature templates (`creatures/`)

Blank sprite templates for every NPC, enemy and boss: no rigs and no creature designs, only the
art-style locks (`style/STYLE_GUIDE.md` + `style/CREATURE_GUIDE.md`). A creature is painted on
the set for its size class and direction set, e.g. `creatures/M8/`:

- Size classes S / M / L / H / E (64, 64, 48, 32, 16 px per metre; E is for huge dragons).
- `…5` = symmetric, paint D1-D5 (the game mirrors D6-D8); `…8` = every direction.
- `<set>_model_p1.png` (paint first: the creature's design lock), one template per animation
  kind (4 frames across, a row per direction: idle, walk, run, jump, fly, float, slither, talk,
  melee, heavy, leap, cast, shoot, throw, breath, roar, summon, blink, block, takeoff, land,
  hurt, death, …) and `<set>_corpse_p1.png`; `<set>_layout.json` maps every cell.
- `TEMPLATES.md` lists the classes and the frame timing and events of every kind.

```
python tools/templates/creature_sheets.py       # redraw every template set
python tools/templates/package_creatures.py     # templates/packs/bellmourn_creatures.zip
python tools/templates/import_creatures.py X_painted.zip   # painted zip -> assets/creatures/
```

Painted sheets come back named `<creature>__<anim>__<template>.png`; the importer keys,
palette-snaps, trims, mirrors and atlases them into `assets/creatures/<creature>/`, which
`src/creature_sprites.js` loads (direction picking, frame timing, events).

ChatGPT's own four-frame bundles (painted sheets + `animation_layout.json`, e.g. the zombie)
go in with `python tools/templates/import_bundle.py X_bundle.zip`: frames are cut with a lasso
(connected blobs, so poses that reach over a cell border stay whole), then
`tools/creatures/<id>.py` applies that creature's hand repairs (`frame_ops.py`: mirror the
legs, reorder, rescale, drop stray specks) before packing into `assets/creatures/<id>/`.

## Weapon & shield re-skin pack (`reskin/`)

Every weapon, staff and shield the game uses (52 models), laid out flat for ChatGPT to repaint
in one consistent style, with the importer that puts the paintings back on the models and
remakes the rarity finishes. See `reskin/README.md`.

```
python tools/models/reskin_pack.py                     # templates/packs/bellmourn_reskin_weapons.zip
python tools/models/import_reskin.py bellmourn_reskin__<set>.zip   # ChatGPT's return -> the game
```
