# UAL beast men

Beast men (about 2.1 m, a head taller than a man) on Quaternius' Universal Animation Library rigs
(CC0): UAL2's skeleton with every clip of UAL1 and UAL2 merged onto it (all but the pistol,
driving and phone clips: 76), lightly widened, hands grown 1.3x, re-bound to an A-pose and exported
at 1.15 scale. Every clip carries a beast's hunch. Each species is a sculpted body on the shared
base, painted with one of the user's sheets (`F:\!  BELLMOURN\Monster Skins\beast-man-texture-sheets.zip`),
with its own modelled parts and its own clips (two attacks, a leap, an idle).

Forked from `tools/creatures/brute_ual` (same cage, sculpt, weights, clone-patch bake, export).

Output: `templates/models/creatures/beast_ual/beast_<species>.glb` and `viewer.html` beside it
(orbit, every clip with the species' own first, a 1.8 m man for scale, a ground ring at each
attack's contact frame).

## Build

```bash
BEAST=goat python -I tools/creatures/beast_ual/prep_beast.py <sheets>/goat.png <work>/tex_goat
BEAST=goat blender -b --factory-startup --python tools/creatures/beast_ual/build.py -- "<UAL2_Standard.glb>" "<UAL1_Standard.glb>" <work>/tex_goat <work>/out
blender -b <work>/out/beast_goat.blend --python tools/creatures/beast_ual/review.py -- <work>/sheet.png [shot,shot,...]
```

A build takes about 2 minutes and ends by slimming the GLB (`slim.py`). Copy
`<work>/out/beast_<species>.glb` into Bellmourn2's `templates/models/creatures/beast_ual/` (the
model store, docs/ASSETS.md) and merge that before the tools change here.

It also runs inside a live Blender (driven over MCP, as the werewolf was): exec build.py from a
`bpy.app.timers` callback with `bpy.ops.wm.read_factory_settings(use_empty=True)` swapped for a
data clear (reading factory settings unloads the add-ons), the cached modules (`sdf`, `uvmap`,
`beastclips`, `beastparts`) dropped from `sys.modules` and `os.environ["BEAST"]` set first; then
review.py in the same session.

## Files

- `sdf.py`: the body as a signed distance field: the shared beast-man torso, arms and legs; the
  species' head, hands and hooves (the head is sculpted at the painted face's scale and grown
  `HEAD_S`, the hand at the rig's and grown `HAND_S`).
- `uvmap.py`: the species' sheet layout. Limbs, horns and the tail are mapped along each painted
  strip's own centre line and width (`prep_beast.py` measures them); the face and the back of the
  head are projected.
- `prep_beast.py` (+ `prep_tex.py`): the sheet's maps and the strip profiles.
- `beastparts.py`: horns (a ram's coil round the ear), ears, tail, and fur clumps (groin, fetlocks,
  mane) coloured from the painted fur.
- `beastclips.py`: the species' clips, cut from UAL clips, reshaped in armature space, with
  two-bone IK for planted hooves and fists; and the hunch applied to every clip.
  Goat: `Goat_Idle_Loop`, `Goat_Ram_Charge`, `Goat_Hammer`, `Goat_Leap`.
  Wolf: `Wolf_Idle_Loop`, `Wolf_Prowl_Loop`, `Wolf_Run_Loop`, `Wolf_Rake` (contacts f13, f27),
  `Wolf_Lunge_Bite` (built from its own idle: tell f5-13, hit f22, punish window f46-58),
  `Wolf_Pounce` (lands f36), `Wolf_Howl`; every library clip gets the hands opened (`claws_all`:
  long claws would pierce a fist) and the jaw held in a snarl (`jaw_all`). All in place, like UAL.
- `bake_tex.py`: the sheet baked onto the model's atlas, clone-patched where it stretches,
  countershaded (darker back and flanks) for a two-tone read in the dark.
- `slim.py`: drops the animation channels that never leave the rest pose and stores the skin
  weights as bytes (the goat: 9.6 MB to 6.5 MB, every clip plays exactly as before).
- The wolf (`BEAST=wolf`): a jaw bone added to the rig (`build.add_jaw`, weights by hand in
  `jaw_weights`); fur as geometry locks (`beastparts._lock`: flattened, drooping, frosted at the
  tips through the `lockT` attribute) over sculpted ruff bulk (`sdf.TUFTS`); dark-fur islands found
  by grain, not brightness (`prep_tex.fur_islands`); the bridge of the muzzle mapped by distance
  along the snout; frost kept off the face; `symmetrize` (a pose averaged with its mirror in
  armature space) where a base clip spins. Its emissive map came out black (`EYEW` finds no vertex
  at the wolf's eye, so a new species should check it): the game gives it glints at
  `BEASTS.beast_wolf.eyes` instead.
- Fine fur isn't built here: the game grows it (`src/fps/fur.js`) from the roughness map's coat, on
  the same bones. A new species needs a `fur` and `eyes` entry in `BEASTS` (foes.js).
- `review.py`: lit contact sheets (`LIGHT=studio` by default, `LIGHT=crypt` for the dim one),
  `clip:<Action>@<fraction>:-:<view>` shots and `b_*` beast close-ups.
