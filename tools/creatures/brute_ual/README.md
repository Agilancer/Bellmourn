# UAL brutes

Big brutes (about 2.65 m) on Quaternius' Universal Animation Library rigs (CC0): UAL2's
skeleton with every clip of UAL1 and UAL2 merged onto it, widened, re-bound to an A-pose and
exported at 1.45 scale. Each brute is a new sculpted body painted with one of the sheets in
`art/creatures/brutes/`.

Output: `templates/models/creatures/brute_ual/<name>.glb` and `viewer.html` beside it (orbit,
every clip, skin and weapon menus).

## Build

```bash
python -I tools/creatures/brute_ual/prep_tex.py art/creatures/brutes/red_demon.webp <work>/tex
blender -b --factory-startup --python tools/creatures/brute_ual/build.py -- "<UAL2_Standard.glb>" "<UAL1_Standard.glb>" <work>/tex <work>/out [name]
blender -b <work>/out/brute_red_demon.blend --python tools/creatures/brute_ual/review.py -- <work>/sheet.png [shot,shot,...]
```

The UAL files are `Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb` and
`Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb`. A build takes 2 to 4
minutes. Copy `<work>/out/<name>.glb` into `templates/models/creatures/brute_ual/`.

The armoured red demon is built on the finished `.blend`:

```bash
blender -b <work>/out/brute_red_demon.blend --python tools/creatures/brute_ual/armor_fit.py -- <work>/out/brute_red_demon_armored.glb
```

## Files

- `build.py`: cage, sculpt, paint, weights, clips, weapons, export.
- `sdf.py`: the body as a signed distance field (skull, horns, fangs, traps, hump, back, legs,
  heels).
- `uvmap.py`: per-region projection onto the painted sheet (each sheet needs its own layout).
- `prep_tex.py`, `bake_tex.py`: the sheet's maps, then the bake onto the model's own atlas.
- `clips2h.py`: two-handed maul and axe clips by IK. `maul1h.py`: every `Sword_*` clip remade
  as `Maul_*` for the choked one-handed maul. `weapons.py`: the maul, the axe and the one-handed
  maul.
- `armor_fit.py`: the black Velscour armour built for his body with `tools/armor`'s plate
  builders: a sculpted cuirass and plackart, pauldrons, a tall collar, fauld, tassets, an A-line
  mail skirt, cuisses, knee cops and greaves. Feet stay bare.
- `review.py`: lit review contact sheets, including `clip:<Action>@<frac|impact>:<weapon>:<view>`
  shots. `HIDE=Brute` renders the armour alone.
