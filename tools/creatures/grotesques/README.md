# The grotesques (three.js)

Ten monsters made from the bare man of the Humans FBX and ten painted skin atlases, one each:
`rotting_zombie`, `bloated_drowner`, `plague_bearer`, `tomb_mummy`, `ember_husk` (its lava cracks
glow), `pale_ghoul`, `chitin_fiend` (its compound eyes glow), `deep_maw`, `fungal_husk` and
`bog_troll`. They are built on the 3D zombies' 20-bone rig with the zombies' own clips
(`../zombie3d/anims.py`), so `src/fps/zombies.js` hunts with them, cuts them apart and raises them
from the graves exactly as it does the zombies. The built models are
`templates/models/creatures/grotesques/<name>.glb`, with phone copies in `phone/`.

- `base.py`: the bare man. The FBX dresses every man, so his skin is put together from the barest
  parts (the Beach head without its hair, the Beach body, the Suit trousers above the knee for
  slim thighs, the bare Beach shins and feet), filled into a voxel field and blurred until the
  facets and hems melt. The torso is the Beach vest's, so it is cut away from crotch to neck and
  modelled bare in its place (ribcage, belly, pelvis, pecs, collarbones, deltoids, trapezius,
  shoulder blades, lats, buttocks, the groove of the spine), with no hem at the waist or the
  armholes. The FBX's mitten hands are rebuilt after the blur as a palm and
  capsule-chain fingers along its own finger bones (length, thickness, knuckles, claws, spread,
  webbing per monster).
- `field.py`: the clay: a soft occupancy field (3 mm) that meshes are filled into by ray parity
  and that capsules and ellipsoids are added to or cut from, meshed by marching cubes.
- `monsters.py`: the ten. Each sculpts its features into the clay (eye sockets and eyeballs, ears,
  noses, mouths, teeth, tusks, mandibles, fins, fungus shelves, armour plates, barnacles, boils),
  reshapes its body vertex by vertex (limb thickness with knobbly joints, belly, waist, chest,
  neck), may warp its proportions (longer arms, a bigger body: the rig's joints move with it), and
  says how much of its skin's painted relief becomes geometry.
- `skins.py`: where each atlas paints what. The atlases were painted for some other model's UVs, so
  each island (the face sheet unwrapped round the head with the ears at its sides, the back of the
  head, the chest and back, a strip per side of each limb, the backs of the hands, the feet) is
  described by its box, its landmarks (eyes, nose, mouth, chin, ears, elbows, knees) and the way
  it runs, and projected onto the body the way it was painted.
- `wrap.py`: the projections (cylindrical round the head, torso and limbs, planar for hands, feet,
  crown and ears), gated by soft body-region weights, each island's own mask (the sheet's flat
  background left out) and its box; blended, baked texel by texel into the model's own UVs, and
  the gaps bled outward for the mipmaps. Each island's tone is balanced toward the rest, so no
  part of the body (the back, the hips) reads as a garment of another colour. Also the glow map (paint in a hue range, bright enough).
- `build.py`: one monster end to end: clay, sculpt, mesh, reshape, warp; the skin's brightness
  high-passed and raised as relief along the normals; decimated to ~18k triangles; cut along
  seams between body regions and down each part's hidden side, unwrapped (the face given the most
  texels); the skin baked at 2048 and saved at 1024; rigged (weights by nearest bone, diffused over
  the surface so joints blend and the legs never share), keyed, exported.
- `rig.py`: the 20 bones placed on the FBX's own joints, the skinning, the clips.
- `review.py`: Cycles renders of a built `.blend` (turnaround, clay, close-ups, clip frames).
- `preview/index.html`: a built `.glb` as the game draws it (zombies.js's gore material, the
  game's tone mapping and pixel size; `?m=<glb>&view=34|front|side|back|face|near|far&clip=walk&
  t=0.3&light=day|dusk|night&cmp=<another glb>`); `shots.cjs` takes its pictures headless, and
  `sheet.py` puts them together into one review sheet per monster.

## Sources (not in the repo: `art/raw/` is ignored)

- `art/raw/grotesques/Humans_Master.fbx`: the Humans FBX (the same one as the villagers').
- `art/raw/grotesques/skins/01.png` ... `10.png`: the ten skin atlases (1254 px), in the order
  above.

## Build

```
pip install bpy pillow scipy scikit-image      # Blender 5.2 as a Python module (Python 3.13)
python tools/creatures/grotesques/build.py -- art/raw/grotesques/Humans_Master.fbx art/raw/grotesques/skins out/ rotting_zombie,bog_troll
python tools/serve.py 8135 &
python tools/creatures/grotesques/sheet.py 8135 <out dir under the repo> out/sheets rotting_zombie,bog_troll
```
A monster takes about a minute and a half. Copy `out/<name>.glb` to
`templates/models/creatures/grotesques/` and run `python tools/creatures/phone_copies.py grotesques`.
