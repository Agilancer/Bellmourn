# Texture prompt: Runebound Glove

Attach to ChatGPT: STYLE_GUIDE.md, bellmourn_palette.png and `runebound_sheet.png`. Then paste:

---
You are painting the texture for a low-poly 3D gauntlet (a first-person arm: sleeve, elbow, bracer and gloved hand) in Bellmourn, a 1990s-style dark fantasy
first-person game (think Heretic, Hexen, Daggerfall, and late-90s PlayStation and N64 models).
Follow the attached STYLE_GUIDE.md; it is locked. Use only colours from bellmourn_palette.png.

**The item:** Runebound Glove. A mage's fingerless violet glove and robe sleeve, silver bands carved with runes around the forearm, and a pale blue focus crystal set in a silver mount on the back of the hand.

The attached sheet is the model's texture layout. The LEFT square is a 256x256 texture
blown up to 1024x1024 (each 4x4 block of sheet pixels becomes one texel), with every
piece of the model outlined in black and numbered. The RIGHT side shows the model from several
angles with each numbered piece in its own colour, and a key. White arrows inside a piece show
which way it runs (for example "toward tip": paint the end of that piece nearest the arrowhead
as the tip end).

Paint the texture into the left square:
- The numbered pieces are:
   1. robe sleeve
   2. elbow
   3. elbow point
   4. elbow knob 1
   5. elbow knob -1
   6. sleeve cuff
   7. cloth bracer
   8. silver band 1
   9. silver band 2
  10. glove wrist
  11. glove: palm and back
  12. index 1
  13. index 2
  14. index 3
  15. middle 1
  16. middle 2
  17. middle 3
  18. ring 1
  19. ring 2
  20. ring 3
  21. pinky 1
  22. pinky 2
  23. pinky 3
  24. thumb 1
  25. thumb 2
  26. thumb 3
  27. silver mount
  28. focus crystal
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

    python apply_texture.py <painted sheet.png> runebound
