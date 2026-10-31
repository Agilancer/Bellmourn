# UAL zombie

A gaunt 3D zombie on Quaternius' Universal Animation Library 2 rig (CC0), with all 43 of its
clips, painted with the user's zombie skin sheet (`art/creatures/zombie_skin.webp`).

Output: `templates/models/creatures/zombie_ual/zombie_ual.glb` (one skinned mesh, skin + rag
materials, WebP textures) and `viewer.html` beside it (orbit, every clip, scrub, speed, lights).

## Build

```bash
python -I tools/creatures/zombie_ual/prep_tex.py art/creatures/zombie_skin.webp <work>/tex
blender -b --factory-startup --python tools/creatures/zombie_ual/build.py -- "<UAL2_Standard.glb>" <work>/tex <work>/out
blender -b <work>/out/zombie_ual.blend --python tools/creatures/zombie_ual/review.py -- <work>/sheet.png [shot,shot,...]
```

`<UAL2_Standard.glb>` is `Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb`
(the non-root-motion file). A build takes about 40 s. Copy `<work>/out/zombie_ual.glb` into
`templates/models/creatures/zombie_ual/`.

A reskin painted on the same sheet layout drops straight in: point `prep_tex.py` at it and rebuild.

## How it works

The mannequin is 102 rigid pieces, so the body is new, built round the same bones:

1. **cage** (`build.py`): a skin-modifier tube body along the bones (fingers, toes, a thenar
   branch for the thumb), subdivided, denser on the head and torso.
2. **sculpt** (`sdf.py`): the zombie is a signed distance field (ribcage with ribs, sunk gut,
   vertebrae, collarbones, gaunt skull, open mouth cavity, torn cheek, caved-in crown, bony
   hands). The head's cage is projected outward along rays first (so the chin and lips don't fall
   into the mouth), then every vertex is snapped onto the field, relaxed and re-snapped.
3. **paint** (`uvmap.py`): each part is projected onto its own painted island. The face uses
   landmarks from the sheet (eyes, nose, mouth, ears), each finger is mapped from painted knuckle
   to painted nail, and the teeth get the strips' crown rows. Real displacement is then read from
   the painting's shading, so painted ribs and creases are in the mesh too.
4. **ears, teeth, rags**: modelled separately. The rags' hem and torn strips are alpha in
   their own texture.
5. **skin**: bone-heat weights, then fixes. The modelled thumb rides the hand bone (the rig's
   thumb is 18 cm long), the sternum and collar keep off the neck, and neck and shoulder weights
   are smoothed.
6. **bake** (`bake_tex.py`): the sheet is baked onto the model's own 2048 atlas. Where the sheet
   stretches or seams, chunks of clean skin cut from the sheet are cloned in by 3D position and
   colour-matched to the skin round them. Then the grade: soot in creases, rot up the hands and
   feet, a black throat, a raw wound rim, a bone patch, ivory teeth. The normal and roughness
   maps are derived from the result.
7. **export**: GLB with tangents, vertex-colour AO and every clip.

`facecheck.py` renders the head wearing the raw sheet (no bake), for checking face alignment.

Known limit: the rig has no shoulder helper bones, so the shoulder top folds a little when the
arms drop out of the T-pose (linear blend skinning).
