# tools/kit: the Quaternius packs, reworked into Bellmourn's world kit

The world (village, cathedral, graveyard, forest, Green Downs, undercroft and the seven new
countries) is built from six Quaternius packs, every model reshaped and repainted for Bellmourn:

| pack folder | source zip |
|---|---|
| `props` | Fantasy Props MegaKit[Standard] |
| `village` | Medieval Village MegaKit[Standard] |
| `nature` | Stylized Nature MegaKit[Standard] |
| `trees` | Textured Stylized Trees - May 2020 |
| `ultimate` | Ultimate Nature Pack by Quaternius |
| `dungeon` | Updated Modular Dungeon - May 2019 |

**Licensing:** the repo is public and the Quaternius licence forbids redistributing the packs as
assets. Unzip the raw packs only into `art/raw/quaternius/<pack folder>` (gitignored). Commit only
what these tools write to `templates/models/kit/`.

## Build

```
# 1. unzip each pack into art/raw/quaternius/<props|village|nature|trees|ultimate|dungeon>
# 2. repaint every atlas into the palette (plain Python: PIL + numpy)
python -I tools/kit/repaint.py art/raw/quaternius templates/models/kit/tex
# 3. rework every model and bundle each pack (headless Blender 5.2, ~30 s for all)
blender -b --factory-startup --python tools/kit/rework.py -- art/raw/quaternius templates/models/kit
# 4. (optional) contact sheets of a bundle
blender -b --factory-startup --python tools/kit/preview.py -- templates/models/kit village templates/models/kit/catalog/village.png
```

`inventory.py` lists every model's size, materials and textures (it was used to plan the recipes).

## What happens to every model

- **Textures** (`repaint.py`): there is one repainted atlas per source atlas, not one per model.
  Each atlas is box-filtered down to game resolution (a 2048 trim sheet becomes 512, a tiling
  wall 128).
  - Ramps: every pixel picks one of the 16 ramps in `templates/style/bellmourn_palette.json`, by
    hue through that atlas's own ramp table. Terracotta becomes slate or rust, leaf green
    becomes moss, blight or rust, and teal becomes slate. Brightness maps onto a darker shade range.
  - Grime: cavity comes from the pack's own normal maps, plus noise blotches, drip streaks,
    moss in the crevices and rust in metal pits.
  - Finish: a Bayer dither between shades, every pixel snapped to the palette, and alpha cut
    hard at 50%.
  - Colour variants per atlas: ochre, ash and lime plaster; rust, moss and lead tiles; soot and
    moss brick; rust, ember and blight leaves; gilt and rust metal; crimson and shroud cloth;
    and more.
  - The two flat-coloured packs (Ultimate Nature, Modular Dungeon) get the palette swatch atlas.
    It has 16 ramps × 16 shades in 8 px mottled cells, and each face is painted a shade either
    side of its ramp.
  - The same script makes the runtime's grime and wear maps and the 14 terrain tiles from the
    packs' own noise, rock and leaf textures.
- **Geometry** (`rework.py` + `recipes.py` + `deform.py`): every model gets its category's recipe
  plus per-model touches, seeded by name. Modular pieces keep their 2 m grid edges true. The
  notes for each model are in `kit.json` → `rework`.
  - Walls bow and their top course sags; roofs sag at the ridge and get a "holed" variant.
  - Doors get iron straps and nails; shutters hang crooked.
  - Trees are knotted, twisted and leaning, with a thinned, drooping crown and a "bare" variant.
  - Rocks are reshaped into jagged crags with moss crowns. Plants wilt. Logs rot and grow
    fungus. Cacti are twisted and given thorns.
  - Furniture sags and chips. Barrels bulge. Chests get a hasp and lock. Candles melt with wax
    runs. Banners tear.
  - Weapons get notches, back-spikes or a boss spike. Spike traps are crusted with blood. The
    statue's rider has been broken off.
  - Ruined variants of walls and broken variants of columns.
- **Recombined pieces** (the `bellmourn` bundle) are built from parts of several packs:
  headstones, grave crosses, obelisks, tombs, gallows, gibbet, skull pike, bone heap, shrine,
  ossuary chest, well, woodpile, haystack, scarecrow, brazier, lamp post and rubble.
- **LOD:** trees, big rocks and any piece over about 1100 triangles get a decimated `~lod` copy.
- **Flames:** candle, torch, lantern and fire points are found in each model and stored as
  `flames`, so the torch-light pool can light them.

## Runtime

`src/fps/kit.js` loads the bundles and makes one shared material per atlas and variant. On the
GPU each material is weathered with triplanar grime, damp at the foot, moss on top, and snow from
the land's biome map. Its colour is then snapped back onto the palette through a 32³ lookup
table.

Draws are grouped by kind:

| What | How it's drawn |
|---|---|
| Vegetation | One `BatchedMesh` per 96 m cell and atlas, with a near copy and a low-detail far copy |
| One-off pieces | Merged per cell and atlas |
| Repeated pieces | Instanced |
| The undercroft | Drawn only from below ground |
