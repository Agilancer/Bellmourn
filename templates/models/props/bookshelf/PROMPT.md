# Texture prompt: Bookshelf

Attach to ChatGPT: STYLE_GUIDE.md, bellmourn_palette.png and `bookshelf_sheet.png`. Then paste:

---
You are painting the texture for a low-poly 3D world prop in Bellmourn, a 1990s-style dark fantasy
first-person game (think Heretic, Hexen, Daggerfall, and late-90s PlayStation and N64 models).
Follow the attached STYLE_GUIDE.md; it is locked. Use only colours from bellmourn_palette.png.

**The item:** Bookshelf. A tall dark bookcase with four shelves of coloured books.

The attached sheet is the model's texture layout. The LEFT square is a 128x128 texture
blown up to 1024x1024 (each 8x8 block of sheet pixels becomes one texel), with every
piece of the model outlined in black and numbered. The RIGHT side shows the model from several
angles with each numbered piece in its own colour, and a key. White arrows inside a piece show
which way it runs (for example "toward tip": paint the end of that piece nearest the arrowhead
as the tip end).

Paint the texture into the left square:
- The numbered pieces are:
   1. back
   2. side L
   3. side R
   4. shelf 1
   5. book 1.1
   6. book 1.2
   7. book 1.3
   8. book 1.4
   9. book 1.5
  10. book 1.6
  11. book 1.7
  12. book 1.8
  13. book 1.9
  14. book 1.10
  15. book 1.11
  16. shelf 2
  17. book 2.1
  18. book 2.2
  19. book 2.3
  20. book 2.4
  21. book 2.5
  22. book 2.6
  23. book 2.7
  24. book 2.8
  25. book 2.9
  26. book 2.10
  27. book 2.11
  28. shelf 3
  29. book 3.1
  30. book 3.2
  31. book 3.3
  32. book 3.4
  33. book 3.5
  34. book 3.6
  35. book 3.7
  36. book 3.8
  37. book 3.9
  38. book 3.10
  39. book 3.11
  40. shelf 4
  41. book 4.1
  42. book 4.2
  43. book 4.3
  44. book 4.4
  45. book 4.5
  46. book 4.6
  47. book 4.7
  48. book 4.8
  49. book 4.9
  50. book 4.10
  51. book 4.11
  52. shelf 5
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

    python apply_texture.py <painted sheet.png> bookshelf
