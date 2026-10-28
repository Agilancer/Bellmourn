# BELLMOURN — LOCKED ART STYLE GUIDE (v1)

Read all of this before you draw anything. These rules are locked. If a request conflicts with
this guide, follow the guide and say what you changed.

Bellmourn is a first-person, open-world dark-fantasy RPG drawn the way PC games were drawn in
1994–1996. The look sits between **Heretic** (1994), **Hexen: Beyond Heretic** (1995) and
**The Elder Scrolls II: Daggerfall** (1996). The world is 3D; every creature, item, pickup and
the player's own hands and weapons are flat 2D sprites.

---

## 1. What we take from each reference

| From | Take this | Do not take this |
|---|---|---|
| **Heretic** | Big, close, hand-painted weapon sprites rising from the bottom of the screen. Bare or gauntleted hands. Grey block masonry, brown timber, gold and orange torchlight, green and gold magic. Treasure-and-artifact pickups that glint. | The status bar, Heretic's exact weapons or monsters. |
| **Hexen** | Heavier, darker, more medieval. Arms in armour. Weapons with weight: the swing starts behind the shoulder and ends off-screen. Enchanted weapons outlined in a crackle of solid blue light. Enemies in 8 rotations. Muddy greens, slate, rust, deep red. | Hexen's characters, weapons or monster designs. |
| **Daggerfall** | Open country under a real sky, half-timbered towns, cobblestone, wilderness billboards (trees, rocks, signs). A mix of painted and pre-rendered-looking sprites. The weapon held diagonally from the lower right. | Daggerfall's UI, its own characters or textures. |

Everything we make is **original**. These games set the era, the technique and the mood, never
the designs.

## 2. Technical lock

- **Virtual screen:** 384 × 240 pixels (16:10). One template cell = one full game screen at 1:1.
  The game scales this up with nearest-neighbour; there is no higher-resolution version.
- **Pixel art, but painted.** Draw like a 90s artist painting over a digitised clay model or a
  photograph of a real prop: soft, rounded form shading inside the shape, crisp hard edge on the
  outside. No vector look, no cel shading, no smooth modern gradients.
- **Palette:** use only `bellmourn_palette.png` (16 ramps × 16 shades). The pipeline will snap
  every pixel to it, so colours outside it will shift. Pick colours from the ramps.
- **Transparency key:** pure magenta **#FF00FF**. Every background pixel is exactly #FF00FF.
  Never use magenta, pink or purple-pink inside the art next to the key; use the `arcane` ramp
  for purples.
- **Edges:** hard. No anti-aliasing into the key colour, no soft glow fading into the key, no
  drop shadow. A 1-pixel darker contour of the object's own darkest ramp shade is allowed on the
  lit side's opposite edge; no black outline all the way round.
- **Dithering:** light ordered dither is allowed on large flat surfaces and on magic. No noise.
- **Lighting:** one warm key light from **above and slightly left, in front of the viewer**
  (torchlight). Shadows lean cool (toward the `slate` and `arcane` darks). The engine darkens
  sprites with distance, so draw everything at full brightness — no baked darkness.
- **Value range:** each material uses 4–6 shades from one ramp, plus up to 2 accent shades.
  Darkest shadows sit around shade 1–3 of a ramp, never pure black (#000000 is not in the palette).
- **No text, logos, UI, borders or signatures inside the art.**

## 3. The player's arms (locked design)

Every first-person weapon uses these same arms. Right and left arms are mirror images.

- **Hand:** blackened-iron articulated gauntlet, four finger plates per finger, brass rivets on
  the knuckles. Palm and finger insides are dark oiled leather. Use `iron` shades 2–9 for the
  plates, `gold` 6–11 for rivets, `leather` 3–7 for leather.
- **Wrist/forearm:** a brown leather bracer laced with pale rawhide (`earth` 3–8, `bone` 8–11
  for the laces), with one iron band near the wrist.
- **Sleeve:** deep wine-red wool, visible only where the arm meets the bottom or side of the
  screen (`blood` 2–6).
- The arm is always cut off by the screen edge. Never draw a shoulder, elbow joint armour or body.

## 4. First-person weapon sprites

- The cell is the whole screen. The weapon and arm **enter from the bottom or side edges** of the
  cell. Anything the rig puts outside the cell is simply cut off.
- **Follow the rig exactly** (see §6). Hand position, wrist angle and weapon direction are fixed
  by the rig so every weapon in the game shares the same motion. Only the weapon's own shape
  changes: a dagger ends before the yellow proxy does, a greatsword runs past it, a mace has its
  head at the tip.
- **Scale:** in the ready pose the weapon fills roughly the lower-right third of the screen,
  as in Heretic and Hexen. Weapons are big and close; they are the hero of the screen.
- **Fast frames:** frames marked SMEAR may stretch the weapon into a motion smear (3–5 ghosted
  copies or a single swept shape in the weapon's own light shades). Never add a white arc or a
  modern "slash" VFX.
- **Magic** (wands, enchantments): solid pixels from the `mana`, `arcane`, `venom` or `fire`
  ramps, bright core, hard edge, crackling outline of 1–2 px. No soft bloom.
- Weapons do not cast shadows on the screen.

## 5. Enemies (summary — full rules in the enemy template)

- Billboards drawn at **8 rotations** using the Doom numbering: 1 = facing the viewer,
  2 = front-left (the creature's right side turns toward us), 3 = left profile, 4 = back-left,
  5 = back, 6–8 the mirror of 4–2. Symmetric creatures draw 1–5 and the engine mirrors 6–8.
  Creatures holding a weapon or shield in one hand draw all 8.
- Feet sit on the bottom guide line of the cell; height is set by the size class on the sheet.
- Same light direction, palette and edge rules as above.

## 6. Reading the rig overlay

The template cells contain a **guide** drawn over a magenta screen. None of it may appear in the
finished art.

| Mark | Meaning |
|---|---|
| Grey translucent mannequin | Volume and position of the forearm and hand. Paint the gauntlet/bracer over it. |
| Red bones (right arm) / blue bones (left arm) | Upper arm → elbow → wrist → grip. Your arm must bend at these points. |
| Green dot **G** | Centre of the fist on the handle. The weapon's grip must be here. |
| Cyan arrow | Back of the hand (knuckles) faces this way. |
| Yellow translucent blade | Weapon proxy: direction and length of the default 1-handed weapon. Brown line = handle and pommel; the short bar = crossguard / head orientation. |
| Yellow dot **T** and dotted path | Weapon tip this frame, and the tip's path across the whole animation. |
| Grey cross in the middle | Screen centre / aim point. |
| Label strip at the top of each cell | Frame id, name, duration in tics (1 tic = 1/35 s). **HIT** = the frame the attack lands. **SMEAR** = smear allowed. |

## 7. Returning a sheet

1. Keep the sheet the same size and keep every black cell border where it is.
2. Inside each cell: paint the frame, then replace **everything else** (mannequin, bones, dots,
   labels, crosshair, dotted path) with flat #FF00FF.
3. Leave unused cells and the legend area alone.
4. Same weapon, same arm, same lighting in every frame. Count rivets: they must match.

## 8. Never

- Modern rendering: bloom, lens flare, depth of field, soft shadows, photoreal textures,
  ray-traced reflections, 3D-render plastic sheen.
- Anime, chibi, cartoon outlines, cel shading, vector-flat colours.
- Black outlines around the whole sprite.
- Any colour that isn't in the palette, and any magenta inside the art.
- Text, watermarks, signatures.
- Recreating a weapon, monster or character from Heretic, Hexen, Daggerfall or any other game.
