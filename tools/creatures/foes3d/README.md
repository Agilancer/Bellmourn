# The 3D foes (three.js)

Twelve rigged, animated foes built from the Quaternius character packs and reworked well past
their originals. They play in the game through `src/fps/foes.js`, and their cave through
`src/fps/cave.js`:
- **knights:** `knight_a` Dread Knight, `knight_b` Ashen Templar, `knight_c` Gravewarden. The
  ranger outfits sit under fitted black, ash or rust plate (helm, gorget, cuirass and lames,
  spiked pauldrons, greaves) with a cape and/or tabard.
- **sorcerers:** `sorcerer_a` Hollow Magister, `sorcerer_b` Blood Witch, `sorcerer_c` Rot
  Hierophant. The peasant outfits become floor-length robes with bell sleeves and rune hems. Faces
  are gaunt and grey, with glowing eyes, a tall cowl, a witch's hat or a bone mask.
- **ghasts:** `ghast_a` Ashen, `ghast_b` Pale, `ghast_c` Cinder. The Imp is remade as a starved
  stalker: arms 22% longer, long claws, a heavy jaw, pointed ears, swept horns, back spines, a tail
  and glowing cracks.
- **grubbers:** `grubber_a` Mire, `grubber_b` Rot, `grubber_c` Flayed. The Puglin is remade as a
  swollen hunchback, its ears torn back, with long curled tusks, warts, fungus caps, six eyes and a
  nail-studded club.

Every foe is on the zombies' 20-bone rig, so `zombies.js`'s gore works on it unchanged.

- `build.py`: the whole build in headless Blender. It imports and poses (fists), reshapes,
  folds the 65 source joints onto the 20 bones, fits the new pieces, unwraps, paints, keys the
  clips and exports the `.glb`. The scene's `foe` JSON extra carries the per-bone hit radii, the
  leaf-bone lengths, the held-item sockets (in three.js axes) and the hit frames. The `_SHELL`
  vertex attribute marks armour, capes, robes and hats, whose inner face is cloth or metal, not
  flesh.
- `specs.py`: what each variant is made of: its parts, reshaping, pieces, sockets and look.
- `shapes.py`: the piece builders. Tubes, lathes, cones and spheres, plus `Fit`, which measures
  the body round an axis so shells sit just proud of it.
- `paint.py`: the 1024 px atlas. Source texels are re-coloured by class (part and hue) onto
  Bellmourn ramps, and new pieces are painted from scratch. Everything is palette-snapped with an
  ordered dither, plus a glow map.
- `clips.py`: the clips per kind (see its docstring). Held arms are posed by direction (upper arm,
  forearm, blade) and solved through the chain. The jump, fall, deaths and crawling come from the
  zombie's `anims.py`, started from each kind's own stance.
- `review.py`: renders frames of a built `.blend`'s clips with the game's own weapons in its
  sockets.

The source packs are not in the repo (the Quaternius licence forbids passing the assets on). To
build, extract their glTF exports into four flat folders:
- `outfits/`: Modular Character Outfits - Fantasy, `Exports/glTF (Godot-Unreal)/Outfits` and
  `Modular Parts` together;
- `base/`: Universal Base Characters, `Base Characters/Godot - UE`;
- `hair/`: Universal Base Characters, `Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)`;
- `beasts/`: Bestiary - Dungeon Monsters Kit, the `GLB (Godot-Unreal)` files and `Textures`.

```
blender -b --factory-startup --python build.py -- <src_dir> <out_dir> knight_a
blender -b <out_dir>/knight_a.blend --python review.py -- shot.png idle:0 attack1:9,15 item:gripR=<sword.glb>
```
Copy `<variant>.glb` (and its `.png`) to `templates/models/creatures/foes/`.
