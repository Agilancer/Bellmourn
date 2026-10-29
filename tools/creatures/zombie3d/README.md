# The 3D zombies (three.js)

Seven rigged, animated zombies built from the Poly Pizza low-poly characters: `a`-`c` from the
warrior (helmet and crest cut off), `d`-`e` from the female fighter, `f`-`g` from the male
fighter. Each gets a new bald skull-head and a starved body, painted in the Bellmourn palette
after the grotesque-zombie bundle and the clay zombie. They play in the game through
`src/fps/zombies.js` (a respawning graveyard horde and the dungeon's dead).

- `build.py`: the whole build in headless Blender: geometry, the 20-bone rig (automatic
  weights, the head rigid), a 512 px palette-snapped texture, the T-pose rest pose, the clips,
  the `.glb`. `SOURCES` holds each body's joints, neck cut, head placement and landmark
  heights (`marks`, read onto the warrior's so every region rule fits every body);
  `VARIANTS` maps a-g onto them.
- `paint.py`: the texture, painted per texel from where it sits on the A-pose body. Variants:
  `a` grave-fresh (bone flesh, bare ribs, brown rags), `b` shrouded (grey-green rot, burial
  linen, hair), `c` fallen soldier (livid flesh, rotted wine tunic, rusted plates, leather),
  `d` grave-fresh woman (torn crop top and shorts), `e` shrouded woman, `f` bloated peasant
  (livid, rotted shirt split over the belly), `g` burnt corpse (charred, raw red cracks).
- `anims.py`: the clips as poses in armature axes, keyed at 30 fps: idle, walk, run, jump,
  attack1 (right rake), attack2 (left backhand), attack3 (grab and bite), fall, death, dead,
  rise (out of a grave), getup (from lying on its back), and for a zombie that has lost a leg
  or been cut in half: collapse, crawl, crawl_attack, crawl_death, crawl_dead.
- `render.py`: review renders of built `.glb`s side by side; `anim_sheet.py`: frames of every
  clip from a built `.blend`.

```
blender -b --factory-startup --python build.py -- "<Low Poly Characters Bundle dir>" <out_dir> a
blender -b --factory-startup --python render.py -- <out_dir>/rev <out_dir>/zombie_a.glb
blender -b <out_dir>/zombie_a.blend --python anim_sheet.py -- <out_dir>/frames
```
Copy `zombie_<v>.glb` (and its `.png`) to `templates/models/creatures/zombie/`.
