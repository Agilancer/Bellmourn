# BELLMOURN — CREATURE SPRITE GUIDE (v1, locked)

This adds to `STYLE_GUIDE.md`, the locked art style. Everything in it still applies: the
palette, the #FF00FF key, hard edges, painted pixel shading, the warm light from above-left and
in front, no black outline all the way round, no text. Where the two disagree, this guide wins
for creatures.

Every NPC, enemy and boss in Bellmourn is a flat billboard sprite standing in a 3D world, seen
by a player at eye height, like the monsters in Heretic, Hexen and Daggerfall. Everything is
**original**: never copy a creature from those or any other game.

---

## 1. The model sheet comes first

Each creature gets its own **model sheet** (the `model` template of its size): the creature
standing at rest from every direction. Paint it first and get it right. It is the creature's design lock:

- Every later sheet copies it exactly: the same silhouette, proportions, costume, colours,
  ramps, rivets and scars, pixel size and light.
- Attach it again with every few sheets so it stays in view.
- Pick 3–5 palette ramps for the creature on its card and use only those. Count details that
  repeat (horns, buckles, spikes, fingers, toes, eyes) and keep the count the same.

## 2. The sheets

- A sheet is always **1536 × 1024**. Keep that size and every black cell border where it is.
- Templates come in five size classes (S, M, L, H, E), each in a 5-direction and an
  8-direction set (§3).
- **Animation sheets:** 6 frames from left to right, **one row per direction**. Big creatures
  need more than one sheet (page) per animation; the epic class uses 3 frames per row, so one
  direction takes two rows.
- **Corpse sheet:** one cell per direction, the creature dead on the ground.
- Inside each cell, the dark **label strip** says the direction (D1–D8), the frame (F1–F6),
  its pose name and its length in tics (1 tic = 1/35 s). Coloured tags mark events:
  **HIT** = the blow lands, **FIRE** = a projectile or breath leaves, **SMEAR** = a motion smear
  is allowed, **SUMMON**, **TELEPORT**, **ROAR**, **HOLD** = the frame is held.
- **Cyan guides** (#00FFFF): the solid line near the bottom is the **ground line**, the short
  tick under it is the **centre**, and the short ticks up the left edge are **metres** (a long
  tick every 5 m). Paint over every guide and every label with flat **#FF00FF** when the cell
  is done.
- Leave UNUSED cells alone.

## 3. Directions

The numbering is Doom-style. "Faces L" means the creature faces toward the left of the screen.

| | View |
|---|---|
| **D1** | front: facing the viewer |
| **D2** | front three-quarter, turned to face screen-left |
| **D3** | profile, facing screen-left |
| **D4** | back three-quarter, walking away toward screen-left |
| **D5** | back: seen from behind |
| **D6** | back three-quarter, walking away toward screen-right |
| **D7** | profile, facing screen-right |
| **D8** | front three-quarter, turned to face screen-right |

- **Symmetric creatures** (nothing different in one hand) are painted **D1–D5 only**; the game
  mirrors D4, D3, D2 into D6, D7, D8.
- **Asymmetric creatures** (a weapon, shield, bow, lantern or staff in one hand) are painted in
  **all 8**. The item stays in the **same hand** in every direction: a right-handed sword is on
  the creature's right in D1 (our left), held away from us in D3, toward us in D7.
- Turn the whole creature for each direction; do not just flip it.

## 4. Size and placement

- The feet (or the lowest point: belly, coils, rags) sit on the **ground line**, centred on the
  **tick**. Use the metre ticks to paint the creature at the height on its card, and keep the
  same scale in every frame of every sheet.
- Size classes set the pixel scale: **S** and **M** 64 px per metre, **L** 48, **H** 32,
  **E** 16. A bigger creature has fewer pixels per metre, so paint it with broader strokes, not
  more detail.
- **Nothing may cross the cell edge.** If a pose is too big, lower or pull it back so it fits.
- **The game moves the sprite.** Walking, running, jumping, leaping and flying are animated in
  place: the feet stay near the ground line and the creature stays centred. A jump only
  crouches, stretches, tucks and lands; the game lifts it. A flyer is drawn with its lowest
  point just above the ground line; the game sets the altitude.

## 5. Animation

- **6 frames, every animation.** Loops (idle, walk, run, fly, float, slither, talk) must flow
  from F6 back into F1.
- Walk and run: F1 and F4 are the foot contacts, the body dips on F2 and F5.
- Attacks have a readable **wind-up**, a fast strike, then a recovery. The HIT frame shows the
  blow fully landed. SMEAR frames may stretch the weapon or limb into a smear of 3–5 ghosted
  copies, or one swept shape, in the creature's own light shades: never a white arc or a modern
  slash effect.
- Spells: the magic grows in F1–F3 in the hand, mouth or staff, and leaves on the FIRE frame.
  Magic is solid pixels from `mana`, `arcane`, `venom` or `fire` with a bright core and a hard,
  crackling 1–2 px edge. No soft glow, no bloom. The game draws the projectile itself.
- Breath (dragons): paint only the light in the mouth and throat; the game draws the stream.
- Hurt: knocked back on F1–F2, back to the idle pose by F6.
- Death: the creature collapses onto the ground line; **F6 is held** and then replaced by the
  corpse, so the corpse sheet must match death F6 for the same direction.
- Corpse: lying flat on the ground line, in the same pose as death F6. Blood stays on the
  body — no pool spreading out on the ground (the game adds decals).

## 6. Light and finish

- Draw everything at full brightness; the game darkens with distance.
- One warm key light from above-left and in front of the viewer, for every direction: the light
  does not turn with the creature. In D5 (back) the creature is lit on its back.
- Shadows lean cool (`slate`, `arcane` darks). The darkest shades are shade 1–3 of a ramp,
  never black.
- No cast shadow on the ground. The game adds a blob shadow.
- Glowing eyes and magic may use the brightest shades of their ramp, still with hard edges.

## 7. Never

- A rig, skeleton, mannequin, construction line or guide colour in the finished art.
- Anything crossing the cell border, or a background other than flat #FF00FF.
- Magenta, pink or purple-pink inside the art (use `arcane` for purples).
- A different design, colour scheme or size from one frame or sheet to the next.
- A black outline all the way round, cel shading, anime, chibi, vector-flat colours, bloom,
  soft glows, gradients, photo textures.
- Text, labels, numbers, signatures, watermarks.
