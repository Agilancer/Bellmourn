# The 3D zombie (three.js)

Three rigged, animated zombies built from the Poly Pizza `warrior_03.fbx` (helmet and crest cut
off, a new bald skull-head modelled on, the body starved), painted in the Bellmourn palette
after the grotesque-zombie bundle and the clay zombie. They play in the game through
`src/fps/zombies.js`.

- `build.py`: the whole build in headless Blender: geometry, the 20-bone rig (automatic
  weights, the head rigid), a 512 px palette-snapped texture, the T-pose rest pose, the clips,
  the `.glb`.
- `paint.py`: the texture, painted per texel from where it sits on the A-pose body. Variants:
  `a` grave-fresh (bone flesh, bare ribs, brown rags), `b` shrouded (grey-green rot, burial
  linen, hair), `c` fallen soldier (livid flesh, rotted wine tunic, rusted plates, leather).
- `anims.py`: the clips as poses in armature axes, keyed at 30 fps: idle, walk, run, jump,
  attack1 (right rake), attack2 (left backhand), attack3 (grab and bite), fall, death, dead,
  and for a zombie that has lost a leg: collapse, crawl, crawl_attack, crawl_death, crawl_dead.
- `render.py`: review renders of built `.glb`s side by side; `anim_sheet.py`: frames of every
  clip from a built `.blend`.

```
blender -b --factory-startup --python build.py -- "<warrior_03.fbx>" <out_dir> a
blender -b --factory-startup --python render.py -- <out_dir>/rev <out_dir>/zombie_a.glb
blender -b <out_dir>/zombie_a.blend --python anim_sheet.py -- <out_dir>/frames
```
Copy `zombie_<v>.glb` (and its `.png`) to `templates/models/creatures/zombie/`.
