# Bellmourn template packs

Sheets and rigs handed to ChatGPT together with the locked style guide, so every sprite comes back
in the same style and the same motion.

- `style/`: `STYLE_GUIDE.md` (locked art rules) and the 256-colour palette (`.png`, `.gpl`, `.json`).
- `fp_weapons/<rig>/`: first-person weapon rigs, one folder each:
  - `<rig>_template.png`: the 1536×1024 sheet for ChatGPT (one 384×240 cell = one game screen).
  - `<rig>_frames.json`: per frame: sheet cell, tics (1/35 s), events (`hit`, `fire`, `smear`),
    projected joints and weapon tip, and `pose3d`, the full 3D arm pose in camera space (metres),
    so a rig can be reused for something else, e.g. driving a 3D or sprite-wrapped arm.
  - `<rig>_strip.png` / `<rig>_preview.gif`: review images. `*_with_sword.*` layer two rigs.

| Rig | What |
|---|---|
| `r1h_walk`, `l1h_walk` | one-handed weapon carried while walking (8-frame bob) |
| `r1h_swing`, `l1h_swing` | 16-frame overhand swing, keyed from the reference video |
| `lsh_walk`, `lsh_block` | round shield, left arm: carry, raise/block/brace/lower |
| `lks_walk`, `lks_block` | kite shield, left arm: same timing as the round shield |
| `r1h_shield_back` | weapon hand drawn back while a shield blocks (plays with either block) |

The one-handed motion is keyed from the user's reference video, `First Personal Swinging.mp4`
(the `ref=` on each key in `anims.py` is the video frame it came from).

## Regenerate

```
python tools/templates/fp_rig.py            # every rig (or name some: r1h_swing lks_block)
python tools/templates/fit_check.py         # fails if any frame goes above the top of the screen
```

Poses live in `tools/templates/anims.py` (screen position of the fist, weapon angle, lean,
shield facing); the IK, projection and drawing in `tools/templates/fp_rig.py`.
