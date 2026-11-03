# World detail: the map's set pieces and small things

What was added across the map in the 2026-11 passes, where it lives in the code, and how to extend it.
Read [DUNGEON_BUILDING.md](DUNGEON_BUILDING.md) first for the rules every space follows (intent, case use, two critics).

## The detail kit (`src/fps/details.js`)
Reusable pieces, laid with intent over the whole map by `layDetails(ctx, M)` (main.js, after `buildWorld`, before `b.finish`):

| Piece | What it is | Where it goes |
| --- | --- | --- |
| `kerb` | Worn fieldstones lining one or both sides of a road | Stretches of the roads near something (a gate, a bend, an approach). Never the whole length. |
| `outcrop` | Two to four great bedded slabs, tilted, with broken blocks at their foot (granite, basalt or limestone) | Darkwood clearings (9), the downs (12), the Sorrowhorn's foothills (12) |
| `grove` | A knot of broadleaf trees (oak, beech, elm, maple, laurel) with mossy stones and undergrowth | The mountain's lowest, gentlest ground, where the conifers give out (18) |
| `ruin` / `pillar` | Broken fluted pillars of the Flame's old chapels, in a ring or a row, at different heights; fallen drums; an upturned capital; the floor's last slabs | Darkwood clearings, the downs, one in the foothills |
| statue spots | Places beside the roads where `statues.js` stands a statue, facing the road | Every long road and path, every 60 to 110 points |

`detailClear(ctx)` makes `ctx.details.keepsClear(x, z)`, which keeps trees off every clear place. Register clear zones (`ctx.details.zones.push([x, z, r])`) **before** `buildWorld` plants the forest. `world.js forestRing` reads it.

## Statues (`src/fps/statues.js`)
Statues are the game's own bodies turned to stone:
- **Bodies:** the Sworn knight, the Sworn dame and the adept, plus a bandit body for the Flame's saints.
- **Pose:** each is caught in a pose from its own clips (a guard, a blade raised overhead, a kneel, a staff lifted).
- **Gear:** the weapon and shield are taken from the foes' sockets.
- **Baking:** the skinning is worked once on the CPU into one still mesh per kind and pose. That mesh is shared by every statue in that pose and dressed in triplanar marble on a basalt plinth.
- **When:** `raiseStatues` runs once `foes.reaversReady` resolves, since every body must be made first.

To add a kind, add a row to `KINDS`: `[body, weapon, shield, [[clip, fraction]]]`.

## The Temple of Velscour (`src/fps/temple.js`)
It stands at the south road's end, in the Darkwood (centred about (0, 240)), facing the village. Its intent (the five questions) is written above the builder.
- **The approach:** a cobbled processional road from the village with knight statues along it, then a grand stair 6 m up the podium with braziers at its head.
- **The building:** octagonal towers with black roofs at the front corners; the façade with the gilded V over the door; red banners.
- **The nave:** lancets and buttresses, two rows of columns, statues of his knights in the aisles, a three-step dais in an octagonal apse, the altar under the great gilded V.
- **The knights:** Sworn knights and adepts, and their warden at the altar: **Ser Oswin Vey** (`sworn_warden`, slay key `oswin`, the Sworn's own body at 1.3 times size).
- **The crypt** (in the podium, `The Crypt of the Oath`):
  - a lit stair goes down from a well in the nave floor, its parapet open toward the door;
  - a ring of galleries runs round the stair shaft and a solid core, with ribs overhead, three tiers of loculi with bones, and sarcophagi;
  - the tomb hall at the back has chamfered corners and the first commander's tomb on a dais, with his V on its lid;
  - the reliquary chest is at the front;
  - 12 dead are down there, some lying still till you come near (`playdead`);
  - torches line the way round.
- **Rooms:** both register in `ctx.zones` (the crypt first), so they light as indoors.

## The wayside camps (`src/fps/pastimes.js`)
There are four travellers' fires:
- the Tinkers' Fire (Darkwood);
- the Pilgrims' Rest (the downs);
- the Hunters' Camp (Darkwood);
- the Drovers' Camp (at the Pilgrims' Road's foot).

Each has a lean-to, logs, packs, a fire with embers, and two folk posted by it (villagers.js keepers `campPell` and so on). Some of them ask you to join a game:
- **Knucklebones** (Pell, Rook, Merra): stake 10 crowns, two dice each, doubles beat any pair, ties thrown again.
- **The dash** (Cade, Sef, Hob): touch their cairn (red rag) and get back to the fire before the candle mark. Winning pays 25 crowns, and the mark drops each win.

The flow is E to be asked, E again to play. main.js asks `ctx.pastimes.offer(who)` for the prompt and `ctx.pastimes.talk(who)` on E. To add a game, add a branch in `talk` and its lines in `LINES`.

## The war on the Sorrowhorn (merged #109)
See `mountain.js planHolds`, `holds.js` and `reavers.js`:
- Red Scythe reavers, axemen and fire-callers in the `scythe` armour set (tools/armor/sets.py, built in Blender);
- crag bandits in palette-swapped clothes;
- Greywatch Keep, Scythe Hold, Crowstep Tower, the Red Fold, the Hollow Tower and Cairnwatch;
- seven side-path ledges, five ambushes and sheer drops;
- the Wardens' seven quests.

## The Frostmere, and the mountain's sky and wind (`mountain.js`)
A tarn on the horn's north-west shoulder, about 50 m under the summit. Its intent is written above `buildMere`.
- **Where:** `MERE` holds its surveyed centre: the flattest hollow near the Shepherd's Stair. `planMere` cuts its shelf and plans the way in before the ground is carved. The way leaves the Stair at the point level with the shelf. It bows 12 m west, round the Stair's upper legs, and through a cutting up to 7 m deep in the shoulder: you come out of the cutting onto the reveal.
- **The ice:** one disc with a drawn canvas face (`iceTexture`): dark and clear where it broke, frosted toward the shore, cracks running out from the break. It lies flush on the level shelf, so everything walks on the ground: no box underfoot, and the dead don't wade in it. `S.onIce(p)` makes footsteps ring like stone and makes Shield Boarding as slick as snow (main.js).
- **The knight:** a statue spot (`mere.statues`, raised by `statues.js`): the Sworn knight in the pose `KNIGHT_POSE` names (`attack1_rec` at 0.2: upright, both hands on the greatsword, raised high), sunk thigh-deep in the ice, with no plinth. He wears rime of his own: grey-blue Phong, flat shaded so his shape shows in facets. A smooth pale gloss blew out white in the snow's glare. The slabs he broke wear the ice's own drawn face, dark at the core and frosted at the edges. Statue spots can now name their `pose`, their own `material` and `plinth: false`, and `always` keeps one on a phone.
- **The far shore:** the Pilgrims' Reliquary (`chest_domed_gothic`, a mountain hoard), the T of the Flame planted behind it, their staves and packs, and a warm light in it that shows across the ice at night. Four dead pilgrims (pale ghouls, or a `water` haunt if the pool has none) lie round it (`playdead`, `reavers.js populateMountainDead`). The first to see you, about 8 to 10 m off, calls the rest, so they get up as you cross the ice to the knight.
- **The way in:** two poles with a line of prayer flags across the cutting's mouth frame the first view. A toast tells what's in the ice, once.

**Birds** (`flyBirds`): ravens wheel over where the dead are (Scythe Hold, the Hollow Tower, the Pilgrims' Barrow, Gorehoof's Shelf), and a pair of eagles ride the air over the Eyrie. They use the belltower crows' shape, in two instanced meshes. Only flocks within 450 m of you move.

**Wind:** `ambience.update` takes `high` (0 at the Sorrowhorn's foot, 1 near the top). The wind rises with it, and the songbirds and the forest's trees fall away.

**The map** (`map.js`) now shows the mountain:
- its trails and side paths, dashed, and the Pilgrims' Track;
- the keeps and towers, coloured by who holds them, and the Red Fold;
- the goat men's camps (a ring of stakes) and the lookouts;
- Sorrowfall and the Frostmere;
- Hornhollow, the Horn, the Broken Stair, and the Sorrowhorn's own name.

**Two things in the way, found by the path check and fixed:**
- Crowstep Tower's palisade (`holds.js`) opened toward its frame's front, which is squared to the world, so its side path ran into the stakes. It now opens where the path crosses it.
- The Drovers' Camp (`pastimes.js`) was set 13 m "outward" from the mountain. Where the road starts, it runs straight at the mountain, so outward was back down the road, and the camp's crates and barrels stood on it. The camp and its dash's cairn now go square to the road, on the side further from the rest of it.

## Testing
Use the headless harness (scratchpad `harness.mjs`). It serves the sibling Bellmourn2 checkout at `/Bellmourn2/`:
- `test_detail.mjs`: the temple peopled, the statues, the camps' folk, knucklebones and the dash, and the critics' views;
- `test_war.mjs`: the mountain;
- `test_mere.mjs`: the Frostmere (built, peopled, the dead waking), the birds, the wind, the map, the path check, and its views.

Run both renderers (`--q=?renderer=webgl`). Syntax-check changed modules as `.mjs` copies (`node --check x.mjs`): a `.js` check misses ES-module redeclarations.

## Critics (DUNGEON_BUILDING.md section 15)
Two critics reviewed every iteration: a level designer with 20 years in dungeons, and a younger critic with sharp taste for the genre.
- **Round 1:** both said revise. Their notes were dark interiors, no leading line in the nave, black statues, and thin camps and ruins.
- **Round 2:** the veteran approved. The other still saw black statues, a dark crypt and black pillars.
- **Round 3:** both approved.

What the rounds changed:
- the temple and crypt light as indoor (cathedral) spaces;
- a pale runner down the nave, a deep portal, flame pylons, the apse ceiling;
- the crypt floor lifted, the tomb lit, embers at the gallery bends, torches down the stair;
- the doors half open with a fire inside;
- lantern posts, dice boards and candles at the camps;
- rubble at the ruins.

## Traps found on the way
- `castle_keep_ivory_chapel_marble` laid **triplanar** (`tri: true`) draws black. Use `castle_keep_pale_keep_limestone` for pale stone that is laid triplanar.
- A builder cone is drawn for its outside only. Put a ceiling under any cone roof you can stand under.
- `buildWorld` resets `ctx.zones`. Build anything with rooms after it, but register its clear zone (so no trees grow there) before it.
