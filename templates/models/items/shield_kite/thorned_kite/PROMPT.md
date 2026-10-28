# Texture prompt: Thorned Kite

Attach to ChatGPT: STYLE_GUIDE.md, bellmourn_palette.png and `thorned_kite_sheet.png`. Then paste:

---
You are painting the texture for a low-poly 3D kite shield in Bellmourn, a 1990s-style dark fantasy
first-person game (think Heretic, Hexen, Daggerfall, and late-90s PlayStation and N64 models).
Follow the attached STYLE_GUIDE.md; it is locked. Use only colours from bellmourn_palette.png.

**The item:** Thorned Kite. A black obsidian kite shield with iron thorns along the edge and a central spike.

The attached sheet is the model's texture layout. The LEFT square is a 128x128 texture
blown up to 1024x1024 (each 8x8 block of sheet pixels becomes one texel), with every
piece of the model outlined in black and numbered. The RIGHT side shows the model from several
angles with each numbered piece in its own colour, and a key. White arrows inside a piece show
which way it runs (for example "toward tip": paint the end of that piece nearest the arrowhead
as the tip end).

Paint the texture into the left square:
- The numbered pieces are:
   1. board
   2. edging
   3. grip strap
   4. strap post top
   5. strap post bottom
   6. arm pad
   7. thorn left 1
   8. thorn right 1
   9. thorn left 2
  10. thorn right 2
  11. thorn left 3
  12. thorn right 3
  13. thorn left 4
  14. thorn right 4
  15. thorn left 5
  16. thorn right 5
  17. thorn left 6
  18. thorn right 6
  19. centre spike
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

    python apply_texture.py <painted sheet.png> thorned_kite
