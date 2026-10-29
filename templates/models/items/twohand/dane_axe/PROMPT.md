# Texture prompt: Dane Axe

Attach to ChatGPT: STYLE_GUIDE.md, bellmourn_palette.png and `dane_axe_sheet.png`. Then paste:

---
You are painting the texture for a low-poly 3D two-handed weapon in Bellmourn, a 1990s-style dark fantasy
first-person game (think Heretic, Hexen, Daggerfall, and late-90s PlayStation and N64 models).
Follow the attached STYLE_GUIDE.md; it is locked. Use only colours from bellmourn_palette.png.

**The item:** Dane Axe. A broad bearded crescent axe head strapped with riveted iron to a long crooked haft, leather where the hands go, an iron butt shoe.

The attached sheet is the model's texture layout. The LEFT square is a 128x128 texture
blown up to 1024x1024 (each 8x8 block of sheet pixels becomes one texel), with every
piece of the model outlined in black and numbered. The RIGHT side shows the model from several
angles with each numbered piece in its own colour, and a key. White arrows inside a piece show
which way it runs (for example "toward tip": paint the end of that piece nearest the arrowhead
as the tip end).

Paint the texture into the left square:
- The numbered pieces are:
   1. axe head
   2. honed edge
   3. socket
   4. head straps
   5. haft
   6. grip wrap
   7. butt shoe
- Paint every numbered piece edge to edge, filling its whole outline. Pieces marked F/B are the
  front/back faces of a flat part; R is its rim or edge; S/E are end caps.
- Paint like a 1990s game artist: chunky hand-painted pixel texture, crisp detail, strong
  readable shapes; light shading baked in from above (lighter top edges, darker undersides and
  crevices), no photographic noise, no smooth airbrushed gradients.
- Keep every piece where it is: do not move, rotate, resize or redraw the outlines' positions.
  Leave everything outside the pieces flat magenta (#FF00FF). Remove the numbers, arrows and
  grid. Keep the right-hand column as it is.
- Return the full sheet at the same size (1536x1024).
---

Then put the painted sheet back on the model:

    python apply_texture.py <painted sheet.png> dane_axe
