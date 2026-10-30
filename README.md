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
| E | open and close doors, search chests, crates, barrels, sacks and pots |
| Tab or I | inventory and character (after Velscour's: the paper doll, a 40-place bag, the item card, your numbers) and the spellbook |
| 1 to 6 | quick-equip the first one-hander, two-hander, wand, staff, round shield or kite shield in the bag |
| Q, Z | drink a healing draught, a mana draught |
| M | the map (the corner map is always up; below ground it charts what you've walked) |
| Esc | pause (pixel size, look speed, graphics, time of day) |

You set out with a plain sword and round shield in hand and a staff in the bag (with a
greatsword, a wand, a kite shield and some draughts); a character saved before this is given the
sword, shield and staff once, if it doesn't have them.

Holding a shield up (right click) spends its **Guard** (the bar under life and mana) on whatever
it stops: most of a blow from the front. When the Guard runs out it breaks, and the shield stops
nothing until it has come back; it refills quickly, but only while the shield is down. Better
shields hold more Guard and stop more, and from Rare up they're enchanted (thorns, frost, fire,
holy light, a ward against spells, a shove). Gear rolls from Common to Mythic with affixes; what
you find depends on where you are (the undercroft and the downs hold better). Dread knights and
sorcerers march between the downs' places and hold its houses.

On a phone, turn it sideways: left thumb moves (push it right out to run), right thumb looks,
and the buttons attack, use the left hand, cast F and R, use (E), jump, drink, open the map and
the bag, and pause. The picture's resolution follows the frame rate (it drops a little when
frames run long and comes back when there's time), and at high a phone gets a smaller sun shadow
map redrawn every other frame, fewer torch lights, half-size bloom and a shorter view. A phone
loads the monsters' phone copies (`templates/models/creatures/monsters/phone/`, their skins at
1024), one at a time; re-run `python tools/creatures/monsters_phone.py` whenever a monster's
`.glb` changes.

Bellmourn's twenty-two people (`villagers.js`: the men and women of
`templates/models/creatures/villagers/`, built by `tools/villagers`) each have a name, a calling and
a house, and live like Velscour's townsfolk: by day they wander to the well, the market stalls and
the cathedral steps, keep a stall, buy at one, work at their door, pray, go home for a while, and
walk over to each other to talk; the watch patrols. They go home at dusk, come out in the morning,
run for their doors when the dead come near, and turn and greet you as you come up to them. What
they say (`townscripts.js`: 261 conversations of two to five lines, chosen by who's talking, plus
remarks, haggling and greetings) shows in Velscour's parchment bubbles over their heads, anchored in
3D, rationed so the square never fills with text. `gear.js` and
`bag.js` are the items and the inventory, `loot.js` what lies on the ground and in containers,
`map.js` the map.

The engine is in `src/fps/`: `world.js`, `buildings.js` and `dungeon.js` build the places,
`lib.js` turns the Velscour texture library into normal-mapped materials, `main.js` runs the
lights (sun and moon shadows, torch shadows, day and night), `spells.js` and `effects.js` the
magic and the sky, and `viewmodel.js` the approved first-person arms. Every surface texture and
texture in `assets/textures/library.json` is used somewhere in the world. Scatter art that isn't a
plant is built as 3D models (`scatter3d.js`); plants stay 2D billboards. `trees3d.js` makes 3D
trees from VectorClad's bark and leaves, and `terrain.js` / `region.js` build the downs. The
Quaternius-kit world (`realm.js`, `wilds.js`, `land.js`, `houses.js`, `crypt.js`, `cave.js`,
`kitdoors.js`) is kept but not built; `kit.js` loads only its props bundle, for what lies on the
ground and the villagers' tools.

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
