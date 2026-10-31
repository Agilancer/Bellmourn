# BELLMOURN: WEAPON & SHIELD TEXTURE STYLE LOCK (v1)

Locked. Read all of it before painting anything, and again whenever a painting drifts.
`STYLE_GUIDE.md` (the game's general style guide) still holds for everything it says about the
palette, the magenta key and the never-list; this file adds the rules for these textures. If a
prompt conflicts with this file, follow this file and say what you changed.

---

## 1. What you are painting

Skins for low-poly 3D models: every one-handed weapon, two-handed weapon, staff and shield in
Bellmourn, a first-person dark-fantasy RPG drawn the way PC games looked in 1994–1997
(Heretic, Hexen, Daggerfall; Quake-era model skins; late-90s PlayStation and N64 weapons).

- The player's own weapon sits close to the camera, lower right of the screen; enemies (dread
  knights, the Sworn of the Vigil) carry the same models. The game shows them with
  nearest-neighbour texels, a warm torch key light, specular glints on metal and a bump map
  made from your painting's light and dark.
- So paint **form and material**, not a scene: the engine lights the model; you give it
  surfaces that read as steel, iron, gold, leather, wood, bone.
- Your painting is shrunk 2–3x on import and snapped to the palette. Detail finer than 3 px
  disappears; detail 4–12 px across reads well.

## 2. Technique (locked)

- **Hand-painted 1990s game texture.** Clear shapes, crisp borders between materials, chunky
  readable detail: rivets, nicks, scratches, grain, wraps, hammer marks, engraving lines.
- **Baked light, kept local.** Each piece gets a lighter rim along its raised edges and folds,
  and darker values in crevices and where pieces meet (under a guard, inside a socket, between
  wraps). Do NOT paint one light direction across the whole canvas: the pieces are unfolded,
  and a light painted across them lands on the wrong sides once folded back.
- **Value range:** metals 5–7 shades of one ramp plus a 1–2 px glint; leather, wood and cloth
  4–5 shades. No pure black, no pure white except single glint pixels.
- **Wear:** used but serviceable gear. Edges nicked; scratches run ALONG a blade, never
  across; grime in recesses; polish where hands rub. Not rusted-through junk (the game makes
  its own "worn" version of your painting).
- **Never:** photographic noise, airbrushed gradients, blur, bloom, glow outside a shape,
  painterly smudging, perspective, cast shadows, anything 3D-looking drawn inside a piece.

## 3. Palette

Only colours from `bellmourn_palette.png` (16 ramps x 16 shades, 0 = darkest, 15 = lightest;
ramp names in `bellmourn_palette.json`). Every pixel is snapped to it on import, so off-palette
colours shift. The ramps to use:

| Material | Ramps and shades |
|---|---|
| Blade steel | iron 6–14, sky 12–15 for glints and the honed edge |
| Iron fittings | iron 3–11 |
| Blackened iron | slate 1–7, iron 1–6 |
| Silver | iron 9–15, sky 12–15 for glints |
| Gold | gold 4–15, fire 5–8 in recesses |
| Brass | gold 3–12, moss 4–7 in the tarnish |
| Bronze | fire 3–10, earth 4–9, moss 5–7 specks |
| Brown leather | leather 3–10, earth 3–8 |
| Dark leather | leather 1–6 |
| Red cloth & cord | blood 2–9 |
| Wood | wood 3–11 |
| Dark wood | earth 1–5, wood 1–4 |
| Pale wood | bone 5–11, stone 6–10 |
| Painted shield boards | blood 3–8, gold 4–7 (ochre), wood 4–8 where chipped |
| Bone / horn | bone 6–14 / earth 4–10, bone 6–10 |
| Drake scales | moss 2–10, venom 6–9 for rims |
| Obsidian | arcane 0–4, slate 0–3, arcane 8–10 glints |
| Grave stone | stone 4–11, moss 3–6 in cracks |
| Gems | blood 8–13 (ruby), mana 7–13 (sapphire), venom 6–11 (emerald) |
| Glow | mana 10–15 (crystal), fire 8–15 (ember) |

Never magenta, pink or pinkish purple inside the art: they read as the background key.

## 4. Materials

`style/material_board__paint.png` has one slot per material key; you paint it first and it
becomes the visual lock for every model (`manifest.json`: `board`). Each model's prompt names
its pieces' materials by these keys:

| Key | Look |
|---|---|
| `steel` | Cool blue-grey polished steel. Long bright streaks running the length, a thin brighter honed edge along cutting edges, fine lengthwise scratches, a darker fuller groove where there is one. |
| `iron` | Mid-dark grey iron for guards, pommels, bands, bosses, rims. Hammer dimples, raised edges rubbed brighter, a few rust-brown pits. |
| `black_iron` | Near-black blue-grey iron. Cold faint highlights on raised edges, flaky dark rust in recesses. |
| `silver` | Pale cool silver with a soft sheen, grey-violet tarnish in recesses. |
| `gold` | Rich warm gold, pale yellow on raised edges, deep orange-brown in recesses, worn smooth. Trim, not slabs. |
| `brass` | Duller olive-yellow, greenish tarnish in crevices. |
| `bronze` | Warm orange-brown, darker hammer marks, specks of green verdigris. |
| `leather` | Brown leather strips wound diagonally around a grip, dark gaps between turns, worn lighter where held. Flat leather (pads, straps): creased, stitched edges. |
| `dark_leather` | Near-black brown, creased, a stitched seam, dull sheen. |
| `red_cloth` | Deep wine-red woven cord or cloth wound tight, visible weave, darker between turns. (Blue or purple cloth: the same in mana or arcane.) |
| `wood` | Warm brown ash or oak, straight grain running along the length, a few knots and nicks. |
| `dark_wood` | Tar-black oak, faint long grain, dull worn sheen. |
| `pale_wood` | Bleached grey-tan wood, dry cracks along the grain. |
| `painted_wood` | Shield boards: planks painted deep red and dark ochre, chipped to bare wood at edges, iron nail heads. |
| `bone` | Aged ivory bone, yellowed, hairline cracks, darker pits. |
| `horn` | Grey-brown horn and antler, long striations, paler tips. |
| `green_scales` | Rows of overlapping dark green scales, each with a lighter rim and darker base. |
| `obsidian` | Black volcanic glass, sharp angular facets, faint purple-blue glints. |
| `stone` | Grey weathered grave stone, moss green in cracks, chipped corners. |
| `gems` | Faceted ruby, sapphire or emerald, deep colour, one hard white highlight. |
| `glow` | Pale blue crystal with a bright core, or orange embers with yellow cores. Solid colour, hard edges, no blur. |

## 5. Bellmourn's look

- Dark, heavy, medieval. Iron and steel dominate; gold is trim on noble pieces, never a whole
  weapon unless the model is described as golden. Colour accents are deep (wine red, drake
  green, tarnished gold), never bright candy colours.
- Ornament is allowed where it fits the piece: engraved lines along a fuller, a scrolled
  guard, punched dots on a pommel, rivets on a boss. Keep it chunky (4+ px lines).
- Lord Velscour's sigil (`style/velscour_sigil.png`: a tall V in a ring) goes only where a
  model's notes ask for it. No other text, letters, runes or logos.
- All the weapons in a set must look like they come from one world: same steel, same leather,
  same light, same wear. The material board is how you keep them the same.

## 6. Reading the templates

- `NN__<id>__paint.png` (1536 x 1024) is the image you edit. Each coloured shape on the
  magenta background is one piece of the model's surface, unfolded flat. Its flat colour is a
  hint of the material, not the final colour. Paint inside every shape, edge to edge.
- `NN__<id>__card.png` shows the same layout with each piece numbered, the model from four
  sides in matching colours, and a key (number, part, material). Read it; don't paint it.
- **Orientation.** Weapons and staffs: every long piece lies on its side with its TIP or HEAD
  end at the RIGHT (a blade's point, a haft's top). Shields: every piece stands upright, top of
  the shield at the top.
- **Wrapped pieces.** A grip, a haft or a ring is unrolled: along the shape is along the piece,
  and the shape's top edge meets its bottom edge around the back. Paint wraps and grain so they
  meet.
- **Folds.** Thin lines inside a shape are folds of the 3D surface (a blade's cutting edge,
  the corner of a block). Paint them as edges: a light line on the fold, slightly darker just
  beyond.
- **Blades.** A blade piece crossed by fold lines is the blade's whole surface unrolled around
  its edges: the folds are its cutting edges and ridges, the bands between them its flat
  faces. A fuller runs down the middle of a wide band, never along a fold; the honed edge is a
  bright line on the folds and along the piece's top and bottom borders.
- **Face tags on the card.** F / B: the two faces of a flat piece; R: its rim; S / E: end caps.
  Shields: FRONT = the face enemies see (heraldry goes only here), INSIDE = the face the player
  sees (plain planks, leather or metal). A round shield's FRONT is drawn as a disc exactly as
  an enemy sees it, boss in the middle: paint a device on it upright, as you would on paper.
- Small pieces are enlarged on the canvas so you can paint them; paint them at the same detail
  as the rest.

## 7. Never (on top of STYLE_GUIDE.md §8)

- Moving, resizing, rotating, merging, splitting or adding shapes; changing the canvas size.
- Paint on the magenta; a new background; borders, frames, vignettes, drop shadows.
- Leaving a shape in its flat template colour.
- Text, numbers, labels, signatures, watermarks.
- Drawing a picture of the whole weapon inside a piece. A piece is a surface (steel, leather,
  wood), not an illustration of the item.
