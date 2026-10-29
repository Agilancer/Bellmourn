# Grotesque zombie, sculpted in clay

The zombie sprite set made the Daggerfall way: a model built from coloured clay pieces,
rendered from every direction under the locked light, reduced to the locked palette.

- `clay.py`: the ray-marched clay renderer. One warm key light from the upper left in front
  (hard, short-reach shadows), a weak cool fill, ambient occlusion; a 12° downward camera like
  a player at eye height; 4x supersampling box-filtered to 64 px per metre.
- `zclay.py`: the approved clay-5 sculpt (idle facing the viewer). Pale skin clay with other
  colours added or carved: ribs and collarbones as bone-clay strips, wound pits filled with
  clotted clay under a fresh-blood rim, green rot lumps, eyes and teeth set in, cloth, rope.
  `RAMPS` maps each clay colour onto the palette (every other shade, warm earth shadows).
- `zrig.py`: the same sculpt on a skeleton. Each piece belongs to a bone and is evaluated in
  that bone's rest space; legs and arms use two-bone IK (knees bend forward, elbows back and
  out). Shoulders, elbows, knees and ankles are re-sculpted so they read when posed.
- `anims.py`: idle, walk, run, jump, melee, hurt, death as four poses each, following
  `LEG_PLACEMENT_LOCK` (contact / passing, opposite legs and counter-swinging arms).
- `render_rig.py`: renders one pose from D1–D5 (`fit` freezes the shade thresholds on the idle
  so every frame shades the same).
- `animate.py`: renders every frame in parallel and writes review sheets.
- `pack.py`: packs the frames into `assets/creatures/grotesque_zombie_clay/` (corpse = the held
  last death frame; D6–D8 mirror D4–D2).

From inside `tools/creatures/zombie_clay/` (the modules import each other; the first argument
is the repo root, for the palette):
```
python render_rig.py ../../.. fit
python animate.py ../../.. ../../../art/view/zombie_frames
python pack.py ../../.. ../../../art/view/zombie_frames
```
`SS=2` before `animate.py` renders a quick review pass at a quarter of the cost.
