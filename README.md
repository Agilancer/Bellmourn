# Bellmourn : Castle Velscour

A love letter to *Castlevania: Symphony of the Night*. This is the first playable test: the
Agilancer in three rooms of Castle Velscour, so you can feel the movement and physics.

## Run

```
python tools/serve.py 8124
```

Then open http://127.0.0.1:8124/. (Any static server works, but this one turns off caching so
edits show up on reload.)

| Key | Action |
|---|---|
| ← → | walk (double-tap to run) |
| ↓ | crouch |
| C | jump; press again in the air to double jump. ↓+C slides, or drops through a thin platform |
| V | sword attack (standing, walking, running, crouching, airborne) |
| X | fireball (8 MP) |
| ` | debug overlay (hitboxes, platforms, state) |
| B | blood spray test for the particle and decal system |

## Movement

The physics constants come from the SOTN decompilation (`src/dra/*.c` in sotn-decomp). They
are scaled by 1.6 because the hero is about 80px tall and Alucard is about 50px:

- walk and air speed 1.5 px/frame
- jump −4.875, double jump −4.25, gravity 22/128, terminal velocity 7
- releasing jump while rising faster than 1 px/frame clamps the rise to 1 (variable height)
- gravity drops to 1/5 near the apex while jump is held, which is SOTN's floaty hang
- walking off a ledge leaves only 0.75 px/frame of drift
- ground attacks root you in place; air attacks keep your momentum and facing

## Layout

- `src/` contains the engine: `player.js` (states, physics, sword), `world.js` (rooms,
  collision, layers, lights, decals), `rooms.js` (the three rooms), `fx.js` (particles,
  fireball, slash arc, blood) and `main.js` (loop, camera, lighting, HUD).
- `assets/` holds the generated game art. Rebuild it with the tools below.
- `tools/` is the art pipeline. It reads the original sheets from `art/raw/`, which is
  gitignored; to repopulate it, unzip the two asset zips into `art/raw/player` and `art/raw/castle`.
  - `frames.py`, `headscale.py`: find the frames on each sheet and measure scale.
  - `lasso.py`: per-pixel sprite masks, so neighbouring frames never bleed into each other.
  - `build_player.py`: normalises scale across sheets, downscales, applies a shared palette,
    shades the far leg (`leg_fixes.json`) so the walk and run alternate legs like the reference
    sheet, grafts attack upper bodies onto the fixed run and walk legs, and tracks the fist.
  - `build_sword.py`: renders the longsword at 72 angles. Swing angles are in
    `assets/player/weapon.json`.
  - `build_castle.py`: crops, downscales and packs the castle kit, and registers the torch
    flame frames to their bracket.
  - `qa_*.py`: contact sheets for checking the art.
