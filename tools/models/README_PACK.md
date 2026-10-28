# Bellmourn 3D first-person models: {title}

Low-poly three.js models (binary glTF, `.glb`) for Bellmourn's first-person view, built to the
same rig as the 2D weapon templates, with texture sheets for ChatGPT to paint.

## What's in here

- `STYLE_GUIDE.md`, `bellmourn_palette.png/.json/.gpl`: the locked art style and palette.
- `apply_texture.py`: puts a painted sheet back on a model (Python 3 + Pillow + numpy).
- `viewer.html` + `manifest.json`: open the folder through any local web server
  (`python -m http.server`, then `/viewer.html`) to see the models play every rig animation.
- One folder per model:
  - `<id>.glb` (items) or `<id>_R.glb` + `<id>_L.glb` (gauntlets: right and left arm).
  - `<id>_sheet.png`: the texture sheet for ChatGPT (1536 x 1024).
  - `PROMPT.md`: the exact prompt to paste, with this model's description and part list.
  - `<id>_mask.png`, `<id>_texture.png` (flat placeholder colours), `info.json`.

## Texturing a model

1. Open the model's `PROMPT.md`. Attach `STYLE_GUIDE.md`, `bellmourn_palette.png` and
   `<id>_sheet.png` to ChatGPT and paste the prompt.
2. Save ChatGPT's painted sheet, then run:

       python apply_texture.py painted_sheet.png <model folder>

   This crops the texture square, shrinks it to the model's texture size (128 x 128 for
   items, 256 x 256 for gauntlets) using only the painted pieces (so the magenta never leaks
   in), bleeds colour past every edge so seams don't show, snaps it to the locked palette,
   saves `<id>_texture.png` and embeds it in the `.glb` file(s).
3. Reload the viewer to check it.

If ChatGPT moves or redraws the outlines, ask it to redo it keeping every piece exactly in
place: the texture only lines up with the model if the pieces stay where they are.

## Using them in the game (three.js)

- Arms/gauntlets are skinned meshes with one skeleton (`upper`, `elbow`, `fore`, `hand`,
  three bones per finger and thumb) and an `item` node. Every first-person rig animation is
  included by name (`r1h_swing`, `lks_block`, `r1s_cast`, ...), stepped at 1/35 s like the
  sprites; play them with `THREE.AnimationMixer`.
- Held items attach to the arm's `item` node: `arm.getObjectByName('item').add(item)`. The
  item's origin is the grip in the centre of the fist; nothing needs offsetting.
  Two-handed weapons go on the right arm; the left arm's own animation puts its fist on the
  grip. `r2h_walk_3d` / `r2h_swing_3d` are the 3D-only upright (Conan-style) two-hander carry.
- The first-person camera that matches the sprite rigs is a pinhole camera with a 90-degree
  horizontal field of view on a 384 x 240 screen, scaled by 0.58 toward the bottom centre;
  `viewer.html` sets this projection up (search for `fpCam`).
- Use `NearestFilter` on the textures and an unlit or Lambert material for the retro look.
- Coordinates are metres, +y up, the camera at the origin looking down -z (three.js
  convention).

{listing}
