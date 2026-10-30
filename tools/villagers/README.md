# Villagers (the men of Bellmourn)

Male NPCs built from the Humans FBX: its body, its 79-bone `CharacterArmature` and its clips,
with a realistic head wearing a VELSCOUR face, and the clothes re-textured with the cloth tiles.
The built models are `templates/models/creatures/villagers/<name>.glb`, with previews in
`preview/`. Each GLB carries the clips `idle`, `walk`, `run`, `wave`, `interact`, `death` and
`hit`, so `src/fps/villagers.js` can play them by name.

- `villager.py`: the build, in Blender (the `bpy` module). The head is MakeHuman's base head
  (CC0), morphed to a man (race and age blend, plus nudges to nose, chin, mouth, ears, jaw), its
  neck lengthened and slimmed into the collar, and placed with its eyes at the FBX's eye height.
  It is skinned to the FBX's `Head` and `Neck` bones. Hands are drawn in to 86% in the bind
  pose, the arm skin becomes undershirt sleeves, and every outfit slot is dressed in a cloth tile.
  Stages: `face`, `body`, `hero` (presentation renders), `glb` (export), `blend`.
- `headbuild.py`: the head. The face atlas is cleaned first (each atlas paints every ear twice,
  unwrapped at the side and again front-on at the cheek's edge; both are filled with the
  atlas's own skin). The head is projected round a vertical axis, and a thin-plate spline carries
  its landmarks (eye corners and lids, brows, nose, lips, chin, ears) onto the atlas's. That
  warp is baked per texel into the head's own UVs, with the scalp painted (cropped hair, with a
  hairline and sideburns) wherever the atlas has none. Three alpha-masked shells give the hair
  its fuzz.
- Outfits: a config's `parts` picks the FBX meshes he wears, mixed across outfits (Farmer
  overalls, King armour, Worker vest, Suit coat, Casual jumper, Casual2 trousers, the
  Backpack...); `outfit` names the head whose weights the new head copies. `dress` maps each
  material slot to `[tile, value gain, metres per repeat]`, and `Part:Slot` keys dress one
  part's slot apart from the same slot elsewhere. `hat` can cut a hat from an FBX head and
  fit it by its crown's opening, but Bellmourn's men go bare-headed: no config uses it; `gloves` splits the hands off a
  slot as `Gloves`; `sleeves` (or `null` for bare arms) turns arm skin into a slot's cloth.
  The metal tiles (`metal_steel`, `metal_dark`, `metal_bronze`, `metal_bands`) come from
  `art/materials/`.
- `clothes.py`: cloth UVs. The FBX's clothes have no UVs, so each face is projected round the
  limb that carries it (cylinders for the torso, arms and legs, boxes for hands and feet), at
  the same metres per repeat everywhere.
- `prep_cloth.py`: each cloth tile at 1024 px, plus normal and roughness maps from its luminance.
- `roll.py <seed>`: a random villager's config. `configs/` holds the ones built.
- `mh.py`: MakeHuman's base mesh, targets and proxies (eyes, lashes), read as data.
- `preview/index.html`: a GLB in three.js with the game's tone mapping and afternoon light
  (`?m=villager_m02&view=34|front|back|face&pix=2`; serve the repo with `tools/serve.py`).

## Sources (not in the repo: `art/raw/` is ignored)

- `art/raw/villagers/Humans_Master.fbx`: the Humans FBX.
- `art/raw/villagers/faces/`: `VELSCOUR_Male_Face_and_Skin_Pack_01` (its `Face_And_Body_Atlases/`
  and `Seamless_Skin_Tiles/`).
- `art/raw/villagers/cloth/<name>.png`: the ten tiles, `linen_teal`, `linen_brown`,
  `burlap_coarse`, `burlap_dark`, `quilted_red`, `quilted_blue`, `damask_red`, `damask_purple`,
  `leather_tooled` and `leather_strapwork`.
- `art/raw/makehuman/`: the `makehuman-data` npm package (`npm pack makehuman-data`, unpacked).

## Build

```
pip install bpy pillow scipy          # Blender 5.2 as a Python module (Python 3.13)
python tools/villagers/prep_cloth.py
python tools/villagers/villager.py -- art/raw/villagers/Humans_Master.fbx out/ "$(cat tools/villagers/configs/villager_m01.json)" glb hero
```
Then copy `out/<name>.glb` to `templates/models/creatures/villagers/`. Rendering runs on Cycles
(CPU), since EEVEE needs a GPU. A body build and export takes about a minute and a half.
