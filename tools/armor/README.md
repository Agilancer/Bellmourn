# Armour sets for the villagers

Ten full sets, one per gauntlet (`templates/models/gauntlets/`), worn by the villagers
(`templates/models/creatures/villagers/`), every one sworn to Lord Velscour: his V in several
places, and on the dark sets his whole sigil (`art/velscour/sigil_cut.png`, cut from its square
by `tools/velscour/cut_sigil.py`). Each set is built twice, for the men's and the women's
`CharacterArmature` (their bones differ), and binds to any villager of that sex by bone name.
Outputs: `templates/models/armor/<set>/<set>_m.glb` and `<set>_f.glb`, each with an `Armor` mesh
and an optional `Helm`, plus `info.json` and `preview/`; `templates/models/armor/overview.jpg`
shows them all.

An armoured villager keeps only its head (the `V_*` meshes). The set brings its own under-layer,
a slim reference body (m10 for the men, f06 for the women) re-dressed in the set's mail or cloth
and leather, so no outfit's coat, skirt, shoulder pads or bedroll pokes through. Hide the
villager's other meshes when the set is worn, and its `V_Hair*` while the helm shows.

Plates are hard shells, not skins: each is fitted round the convex hull of the body under it
(optionally squared off, `box`), stands 2 to 4 cm proud, and rides its bones rigidly, so it never
bends or twists with the flesh; faulds, tassets and skirts hang from the breastplate and move
with it. Cloth below the waist follows the legs at its hem. Every plate edge can carry a rolled
rim in the set's trim metal.

- `build.py`: the build, in headless Blender. Measures the under-layer, builds the set's pieces,
  re-dresses its gauntlets in the set's own swatches, joins and exports. Stages: `glb`, `render`
  (the preview frames) or `quick` (three small frames: for iterating cheaply).
- `sets.py`: what each set is made of, and how its gauntlet is dressed.
- `plates.py`: plate pieces (cuirass with fluting, fauld, tassets, gorget, pauldrons with
  haute-pieces, rerebraces, cuisses, poleyns, greaves, sabatons), the V, plaques and rondels.
- `greathelm.py`: the great helms, copied from the user's reference sheet: a riveted barrel with
  a flat top, a cross of bands, eye slits cut through (the wearer sees out), round, slot or
  keyhole breaths, and its fittings (fleury ends, ram's horns, crest boards, antlers, bat wings,
  the ribbed ring).
- `helms.py`, `ornament.py`, `garb.py`: other helm parts; spikes, fins, horns, bands, scales,
  gems, the sigil; coats, capes, tabards, mantles, hoods and belts.
- `retarget.py`, `gauntlet_bind.py`: a gauntlet carried onto a villager's arm, and the gauntlets'
  bind joints and part maps (`gauntlet_bind.json`, `gauntlet_parts/`; system Python).
- `helmlab.py`: several helms side by side on a head, for iterating on helms alone.
- `lineup.py`, `sheet.py`, `catalog.py`: proof renders on real villagers, a set's review sheet,
  every `info.json` and the overview.

```
python tools/armor/gauntlet_bind.py
blender -b --factory-startup --python tools/armor/build.py -- fiend male out/ quick
blender -b --factory-startup --python tools/armor/build.py -- fiend male out/ glb render
blender -b --factory-startup --python tools/armor/build.py -- fiend female out/ glb render
blender -b --factory-startup --python tools/armor/lineup.py -- out/fiend_m.glb out/lineup_fiend_m.png villager_m01 villager_m08
python tools/armor/sheet.py out/ fiend templates/models/armor/fiend/preview/fiend_sheet.jpg
python tools/armor/catalog.py out/
```
Copy `<set>_m.glb` and `<set>_f.glb` to `templates/models/armor/<set>/`.
