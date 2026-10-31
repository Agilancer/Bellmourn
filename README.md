# Bellmourn

A first-person retro RPG in the spirit of Heretic, Hexen and Daggerfall, in three.js. This build
is the first walkable piece of the world: the village of Bellmourn in its forest clearing, ten
buildings you can walk into, the Cathedral of the Mourning Bell, the walled graveyard behind it,
and the Undercroft under it: go through the door behind the pulpit into the office, then through
the stair-house door and down to its 24 rooms, and on down the stairwell in its stair hall to the
15 rooms of the Deep Undercroft. East of the village a trail runs through the forest to the Green
Downs: open grass hills with rock outcrops, a river over the plateau that falls into a pool, a stream with a bridge,
Millhaven farm, a windmill, and a hamlet of homes to explore. West of the village the Vigil Road
runs through the Darkwood to Blackvigil Keep, held by Lord Velscour's Sworn: a curtain wall with
corner towers and a gatehouse, a courtyard, and the keep's hall, barracks, armoury, chapel and
reliquary, with the Red Throne at the far end.

Under the ground besides (`delves.js`): in the Darkwood two stone stair-houses stand over
dungeons of their own, the Barrow of Saint Ivo to the north-west and the Old Watch Cellars to the
south-east; and three caves open in the downs' eastern cliff, the Gloamhollow just north of
Brightwater Falls, the Drowned Grotto beside them, and the Trollhole far to the north. All of them
are marked on the map. `node tools/world/walkthrough.cjs <port>` walks the player down every
stair and into and back out of every cave, has the dead of each place come for him, checks the
headroom over every walkable metre below ground (nothing under 3 m), and how smoothly the eye rides
the stairs (it glides: the feet's steps are eased out, so a flight reads as a slope). The dungeons' rooms are halls, crypts, libraries, shrines, storerooms,
vaults and ossuaries, and now flooded crypts, great halls of tall columns, barracks, collapsed
halls, well chambers, forges and halls round a throne of bones.

The dead are the ten grotesques (`templates/models/creatures/grotesques/`, built by
`tools/creatures/grotesques`): the rotting zombie, the bloated drowner, the plague-bearer, the tomb
mummy, the ember husk, the pale ghoul, the chitin fiend, the deep maw, the fungal husk and the bog
troll. Each place draws its own (`HAUNTS` in `zombies.js`): plague-bearers, ghouls and mummies
claw out of the graveyard; mummies and ghouls keep the Barrow; drowners and deep maws the grotto,
the falls' pool and the stream; trolls the Trollhole and the bridge; ember husks and chitin fiends
the Deep Undercroft. The old zombies and monsters stay in the repo, unloaded.

## Run

```
python tools/serve.py 8124
```

Then open http://127.0.0.1:8124/ (the old Castle Velscour platformer test is at
`/velscour.html`). `/knight.html` shows every move the keep's Sworn make: they move on Quaternius'
Universal Animation Libraries 1 and 2 (`src/fps/ual.js`, `tools/creatures/sworn_ual/`), and the page
can set each move beside their old clips and the library's mannequin it came from. Every other
person in the game moves on the same clips (made as they load, once for each skeleton: the
villagers' men and women, the open country's knights and sorcerers), and the page's Body list has
them all. On Windows,
double-click `knight-player.bat` to serve the folder and open it (`tools/knight_player.py`).

| Key | Action |
|---|---|
| W A S D, mouse | move, look (Shift runs, Space jumps) |
| Left click | right hand: swing, or shoot with a staff |
| Right click | left hand: hold a shield up, or swing |
| F, R | cast the spells set to F and R (Firebolt gathers for two seconds first) |
| E | speak with someone (and take or hand in their work); open and close doors, search chests, crates, barrels, sacks and pots |
| Tab or I | inventory and character (after Velscour's: the paper doll, a 40-place bag, the item card, your level, attributes and numbers) and the spellbook |
| 1 to 5 | quick-equip the first one-hander, two-hander, staff, round shield or kite shield in the bag |
| Q, Z | drink a healing draught, a mana draught |
| M | the map (the corner map is always up; below ground it charts what you've walked) |
| L, T | the quest log; show or hide the quest tracker |
| Esc | pause (save, load, the quest log, a new game; pixel size, look speed, graphics, time of day) |

### The coming of Tessariel

The title offers **New Game**, **Continue** (the game you were playing, as it was kept as you
played: `bm.char` and `bm.progress`) and **Load Game**. A new game opens with a cinematic played in
the engine (`intro.js`): in the deep sky (`comet.js`'s `Space`: stars, a nebula band, the world
below with its rim of air, the sun) a green star crosses over the world, and close alongside it a
man in black smallclothes, curled up in a ball, spins inside the fire (`hero.js`: villager_m09
stripped at load, his clothes turned to skin and the briefs drawn on in the bind pose, posed by
turning each bone so its child lies along the curl). It streaks across the sunset over the
Darkwood; one of Velscour's Sworn walks out of the wood behind the town on his round (on the
animation library's clips, `ual.js`), stops as the green light grows behind him, turns, looks up,
flinches with a yell and cowers under his shield; the camera dives behind the star as he turns and
runs for the town, falls back behind him, and the star goes past it into him; white. Out of the
white: a smoking crater with nothing left
of him but his armour, scorched and thrown about (the Fiend's Panoply cut into its pieces by the
bones that carry each triangle, baked as worn; it can't be taken up), and his sword, shield and
staff, which can. The whole village screams at once (a synthesized crowd: `audio.js` `scream`).
Black; then your own eyes, standing in the crater with nothing in your hands or your bag. The
Canticle's verses run under it as captions. Esc (or the skip button) skips it.

Nothing is fetched, built or compiled while it plays (`Intro.prepare`, behind the loading screen):
it waits for the Sworn (retargeted onto their clips), the whole village, the knight's armour, his
sword, shield and staff and the gauntlets you're given; compiles every shader both scenes draw
(as the game draws them, into its own picture) and puts the textures on the GPU; draws a frame of
every shot, and the village gathered as you'll find it; then times its heaviest shot and, if the
GPU is what holds it up, draws it smaller. The frame-time easing is held while it plays.

The crater (`crater.js`) is one height function added to the village's flat ground (so the
physics, the map and everything else find the bowl), its own smooth mesh in the ground's material,
whose shader chars it out past the lip and fuses its floor to green glass with glowing cracks
(`lib.ground`'s `crater`). It lies flat until the star strikes (`formCrater`). Green shards,
flames, embers and smoke stay in it, and the village has left candles, wreaths and flowers just past
its char (`polish.js`).

The village has gathered on the meadow at the edge of town, well back from the hole: Sister Odile
(the keeper of the holy texts, new to the roster), the Reeve, Mother Hesk, Garrow, Tobias, Wren and
Elsie, talking among themselves about the man who fell out of the sky, and calling out when you
climb over the rim (`villagers.gather`). Walk over and they tell you who you are: **Tessariel, the
Sacred Flame**, whose coming their texts describe to the smallclothes, sent to kill the Demon Lord
Velscour; and that his sycophants kill anyone who speaks the name. They give you armour, gauntlets,
gold and draughts (whatever's free goes straight on), and Odile has a task for you first: the dead
beneath the cathedral. (Leave mid-talk and Continue gives you whatever they hadn't yet.)
Since then the village talks of little else: `tessariel.js` holds 187 conversations between
townsfolk (and 18 for Velscour's garrison, who never say the name; nobody says it with the garrison
in earshot, and someone who does gets hushed), plus greetings, muttering, and what each calling
says when you speak to them (E).

### Quests

After World of Warcraft (`quests.js`). A yellow **!** over someone's head means work for you:
speak with them and they tell you about it. Take it and it turns to a grey **?**; finish it and
the **?** turns yellow; hand it in and it's gone, unless they've more. Whoever has work for you
waits at their post (by day and by night). Every quest is marked on the map and the corner map
(a gold ring or star where it's done, an arrow on the corner map's rim when it's off it), the
tracker under the corner map follows what you choose in the log (L), and T hides it.

| From | Quest | What |
|---|---|---|
| Sister Odile | The Dead Beneath the Bell | destroy every one of the dead in the Undercroft (counted when you take it) |
| Mother Hesk | Gravebloom | gather 6 gravebloom from the graves behind the cathedral |
| Garrow | Sworn Steel | take 4 shards of Sworn steel from Velscour's knights |
| Sergeant Brand | Dread on the Downs | kill 8 of the dread knights and sorcerers on the Green Downs |
| Hild | The Old Watch's Standard | bring back the old watch's standard from the Old Watch Cellars, and destroy 8 of the dead there |
| Idris | Lights of the Gloamhollow | gather 6 glowcaps in the Gloamhollow |
| Tobias | The Drowned Mother | slay the Drowned Mother in the Drowned Grotto (boss) |
| Reeve Osric | Saint Ivo's Reliquary | slay the Wight of Saint Ivo and bring back his reliquary from the Barrow (boss) |
| Sister Odile | The Ember Abbot | slay Abbot Cindermaw and 12 of the dead in the Deep Undercroft (boss) |
| Wren | The Trollhole King | slay Old Gnarlgut in the Trollhole (boss) |
| Sister Odile | The Red Hand of Velscour | slay Ser Malgrave on the Red Throne of Blackvigil Keep (boss) |

The bosses are champions: one of the dead grown huge, many times as hard to kill, hitting harder,
with a bar of their own (`Zombie.champion`). Each quest pays experience, gold and one of the
village's treasures (`uniques.js`): Bellwarden, the Censer of the Ninth Bell, Mother Hesk's
Thornring, the Wall of the Watch, Hammerfall Grips, the Gloamstaff, Trollbane, the Drowned Mother's
Pearl, the Halo of Saint Ivo, the Watchman's Striders and Tessariel's Brand, each with its own story
and some with powers nothing else rolls (blows that set the dead burning, or chill them).

### Levels and saves

Bellmourn has no classes (`level.js`): everything you kill and every quest earns experience; each
level adds life, mana, damage and armour, and gives three points to put into Might, Vigour, Arcana
or Finesse (Tab, under your character; they can be taken back). Every spell is open from the
start. **Save Game** and **Load Game** (on the pause screen, and Load on the title) keep ten slots,
each with its date and time, level, place and gold (`saves.js`: `bm.save.1` to `bm.save.10`).

A character saved before this is given the plain sword, shield and staff once, if it doesn't have
them, and keeps them on Continue; the quests are open to it as they are to a new one.

Holding a shield up (right click) spends its **Guard** (the bar under life and mana) on whatever
it stops: most of a blow from the front. When the Guard runs out it breaks, and the shield stops
nothing until it has come back; it refills quickly, but only while the shield is down. Better
shields hold more Guard and stop more, and from Rare up they're enchanted (thorns, frost, fire,
holy light, a ward against spells, a shove). Gear rolls from Common to Mythic with affixes; what
you find depends on where you are (the undercroft and the downs hold better). Dread knights and
sorcerers march between the downs' places and hold its houses.

**Blackvigil Keep** (`keep.js`) is garrisoned by Velscour's Sworn: villagers in the Fiend's
Panoply, put together at load by `sworn.js` (the villager's skeleton under the zombie body's bone
names, the armour, helm and head merged into one skinned mesh, and knight_a's clips carried over
bone by bone), so they come apart like the dark knights, but fight harder and faster. They come in
five fittings of the set (gilt, bone, blackened or blood-red ram's horns on the helm, or none, and
crimson, black, violet or ash-grey cloaks). They take
you two at a time while the rest circle a few strides off with their shields ready, waiting their
turn. Up close they cut in combinations of two and three; from further off they lunge, or charge
behind the shield and bash you off your feet. They raise the shield when they see you swing, bash
through yours when you hide behind it, and answer any blow that rings off theirs. Their adepts
go bareheaded with burning eyes, a blade in one hand and a staff in the other (the sorcerers'
casting clips carried over too): they keep their distance, cast blood, call Velscour's fire up
under you, mend their wounded brothers, and blink away when cornered. Their kite shields ride as
far out from the forearm as each one's dish needs to clear the plate (`shieldLift`), and the
shield arm is posed for the carry, the guard (the forearm across before the chest, the shield's
face to the front, as it's held when blocking, bashing and charging) and the wide third cut, with
the sword arm drawn back behind the shoulder in a bash, so no hand or body goes through a shield
in any clip or in the blends between them. They step in behind a raised shield and walk round
you when they circle (they don't slide). They follow you through the keep's doorways
by a flow field. In the Red Throne their lord, Ser Malgrave, half as big again and burning red,
waits with two guards before a chest sealed by his oath: he calls Velscour's fire up under you,
grows faster at half his life, and the chest (the Vigil's hoard: legendary and epic gear, gold and
draughts) opens only once he's dead. The Sworn load in the background after the world is up (a
phone takes one body and half the garrison, without the adepts).

On a phone, turn it sideways: left thumb moves (push it right out to run), right thumb looks,
and the buttons attack, use the left hand, cast F and R, use (E), jump, drink, open the map and
the bag, and pause. The picture's resolution follows the frame rate (it drops a little when
frames run long and comes back when there's time), and at high a phone gets a smaller sun shadow
map redrawn every other frame, fewer torch lights, half-size bloom and a shorter view. A phone
loads phone copies of the grotesques, foes and villagers (`phone/` in each of their folders under
`templates/models/creatures/`: their images at most 512, 512 and 256 square), the grotesques one
at a time and the villagers one at a time once the village is up, half as many of the dead, and
the stained glass at half size;
re-run `python tools/creatures/phone_copies.py` whenever one of their `.glb`s changes. If a run
dies (Safari's "A problem repeatedly occurred"), the next shows under the title how far it got.

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
texture in `assets/textures/library.json` is used somewhere in the world, but for the masonry kit:
90 seamless stone tiles in nine stones (`masonry_<stone>_<nn>`: grey ashlar, blackstone, fieldstone,
honey and white limestone, slate, red and ochre sandstone, mossy ashlar) for building castles and
towers with; the keep is laid in the blackstone and slate. The banners (`assets/textures/banners/`,
sprites of category `banner`) each have an allegiance: `velscour` (his V) hang only where his people
are, `holy` (the T) in the cathedral and holy places, `town` in the village and among good folk.
Both come in with `python tools/world/import_banners_stone.py` (see its docstring). Scatter art that isn't a
plant is built as 3D models (`scatter3d.js`); plants stay 2D billboards. `trees3d.js` makes 3D
trees from VectorClad's bark and leaves, and `terrain.js` / `region.js` build the downs.
`water.js` is Brightwater's water: the river across the plateau, the falls (three sheets whose
streaks speed up as they drop), spray, mist and foam at their foot, and the pool and stream,
their ripples carried along by the current, tinted by depth, soft at the shore and mirroring
the sky, with flecks of foam riding them. The
Quaternius-kit world (`realm.js`, `wilds.js`, `land.js`, `houses.js`, `crypt.js`, `cave.js`,
`kitdoors.js`) is kept but not built; `kit.js` loads only its props bundle, for what lies on the
ground and the villagers' tools.

VectorClad's bark, leaf and plank textures come in with
`python tools/world/import_vectorclad.py` (it reads the sibling `vectorclad` repo's
`origin/main`, so re-run it when that repo gets new textures).

The ground sheets in `art/ground/` (snow, flagstones, forest floor, sand, concrete, cobbles,
gravel, dirt and grass: ten seamless tiles on each, 5 across by 2 down) are cut apart by
`python tools/world/import_ground.py` into `assets/textures/ground/`, made to wrap exactly, and
listed in `assets/textures/ground.json` as `ground_<set>_NN` (01 to 10, in reading order); drop
a new sheet in with the next number and re-run it. They're only ever used by name, toned down
with a tint to sit with the Velscour floors: the village's meadow and forest floor, the downs'
grass, paths, gravel and sand by the water and old snow on the plateau above the falls, the
Vigil Road, and the keep's courtyard.

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
