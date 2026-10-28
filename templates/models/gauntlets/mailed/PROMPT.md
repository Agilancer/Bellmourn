# Texture prompt: Mailed Glove

Attach to ChatGPT: STYLE_GUIDE.md, bellmourn_palette.png and `mailed_sheet.png`. Then paste:

---
You are painting the texture for a low-poly 3D gauntlet (a first-person arm: sleeve, elbow, bracer and gloved hand) in Bellmourn, a 1990s-style dark fantasy
first-person game (think Heretic, Hexen, Daggerfall, and late-90s PlayStation and N64 models).
Follow the attached STYLE_GUIDE.md; it is locked. Use only colours from bellmourn_palette.png.

**The item:** Mailed Glove. A riveted chain-mail glove and mail sleeve, a polished steel plate cuff, a steel knuckle bar and a plain steel elbow cop. Grey, cold, functional.

The attached sheet is the model's texture layout. The LEFT square is a 256x256 texture
blown up to 1024x1024 (each 4x4 block of sheet pixels becomes one texel), with every
piece of the model outlined in black and numbered. The RIGHT side shows the model from several
angles with each numbered piece in its own colour, and a key. White arrows inside a piece show
which way it runs (for example "toward tip": paint the end of that piece nearest the arrowhead
as the tip end).

Paint the texture into the left square:
- The numbered pieces are:
   1. mail sleeve
   2. elbow
   3. elbow point
   4. couter
   5. mail sleeve (forearm)
   6. glove wrist
   7. glove: palm and back
   8. index 1
   9. index 2
  10. index 3
  11. middle 1
  12. middle 2
  13. middle 3
  14. ring 1
  15. ring 2
  16. ring 3
  17. pinky 1
  18. pinky 2
  19. pinky 3
  20. thumb 1
  21. thumb 2
  22. thumb 3
  23. plate cuff
  24. knuckle guard
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

    python apply_texture.py <painted sheet.png> mailed
