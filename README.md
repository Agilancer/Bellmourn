# Bellmourn

A first-person retro RPG in the spirit of Heretic, Hexen and Daggerfall, in three.js. This build
is the first walkable piece of the world: the village of Bellmourn in its forest clearing, ten
buildings you can walk into, the Cathedral of the Mourning Bell, the walled graveyard behind it,
and the Undercroft, a 30-room dungeon: go through the door behind the pulpit into the office,
then through the stair-house door and down. East of the village a trail runs through the forest
to the Green Downs: open grass hills with rock outcrops, a waterfall into a pool, a stream with
a bridge, Millhaven farm, a windmill, and a hamlet of homes to explore.

## Run

```
python tools/serve.py 8124
```

Then open http://127.0.0.1:8124/ (the old Castle Velscour platformer test is at
`/velscour.html`).

| Key | Action |
|---|---|
| W A S D, mouse | move, look (Shift runs, Space jumps) |
| Left click | right hand: swing, or shoot with a wand or staff |
| Right click | left hand: hold a shield up, swing, or shoot a wand |
| F, R | cast the spells set to F and R (Firebolt gathers for two seconds first) |
| E | open and close doors (the interact key) |
| Tab or I | inventory: one of each weapon type, the gauntlets, the spellbook |
| 1 to 6 | quick-equip sword, greatsword, wand, staff, round shield, kite shield |
| Esc | pause (pixel size, look speed, graphics, time of day) |

On a phone, turn it sideways: left thumb moves (push it right out to run), right thumb looks,
and the buttons attack, use the left hand, cast F and R, use (E), jump, open the bag and pause.

The engine is in `src/fps/`: `world.js`, `buildings.js` and `dungeon.js` build the places,
`lib.js` turns the Velscour texture library into normal-mapped materials, `main.js` runs the
lights (sun and moon shadows, torch shadows, day and night), `spells.js` and `effects.js` the
magic and the sky, and `viewmodel.js` the approved first-person arms. Every surface texture and
texture in `assets/textures/library.json` is used somewhere in the world. Scatter art that isn't a
plant is built as 3D models (`scatter3d.js`); plants stay 2D billboards. `trees3d.js` makes 3D
trees from VectorClad's bark and leaves, and `terrain.js` / `region.js` build the downs.

VectorClad's bark, leaf and plank textures come in with
`python tools/world/import_vectorclad.py` (it reads the sibling `vectorclad` repo's
`origin/main`, so re-run it when that repo gets new textures).

---

## Castle Velscour (the earlier 2D test)

A love letter to *Castlevania: Symphony of the Night*. This is the first playable test: the
Agilancer in three rooms of Castle Velscour, so you can feel the movement and physics.

## Run

```
python tools/serve.py 8124
```

Then open http://127.0.0.1:8124/velscour.html. (Any static server works, but this one turns off caching so
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
