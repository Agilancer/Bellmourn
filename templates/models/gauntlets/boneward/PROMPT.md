# Texture prompt: Bone-Ward

Attach to ChatGPT: STYLE_GUIDE.md, bellmourn_palette.png and `boneward_sheet.png`. Then paste:

---
You are painting the texture for a low-poly 3D gauntlet (a first-person arm: sleeve, elbow, bracer and gloved hand) in Bellmourn, a 1990s-style dark fantasy
first-person game (think Heretic, Hexen, Daggerfall, and late-90s PlayStation and N64 models).
Follow the attached STYLE_GUIDE.md; it is locked. Use only colours from bellmourn_palette.png.

**The item:** Bone-Ward. Tribal: bleached bone plates bound to a dark hide glove with sinew, bone ribs lashed around a hide bracer, a bone elbow cap, and a shaggy brown fur sleeve.

The attached sheet is the model's texture layout. The LEFT square is a 256x256 texture
blown up to 1024x1024 (each 4x4 block of sheet pixels becomes one texel), with every
piece of the model outlined in black and numbered. The RIGHT side shows the model from several
angles with each numbered piece in its own colour, and a key. White arrows inside a piece show
which way it runs (for example "toward tip": paint the end of that piece nearest the arrowhead
as the tip end).

Paint the texture into the left square:
- The numbered pieces are:
   1. fur sleeve
   2. elbow
   3. elbow point
   4. bone couter
   5. hide bracer
   6. rib 1
   7. rib 2
   8. rib 3
   9. rib 4
  10. rib 5
  11. glove wrist
  12. glove: palm and back
  13. index 1
  14. index 2
  15. index 3
  16. middle 1
  17. middle 2
  18. middle 3
  19. ring 1
  20. ring 2
  21. ring 3
  22. pinky 1
  23. pinky 2
  24. pinky 3
  25. thumb 1
  26. thumb 2
  27. thumb 3
  28. index bone plate 1
  29. index bone plate 2
  30. middle bone plate 1
  31. middle bone plate 2
  32. ring bone plate 1
  33. ring bone plate 2
  34. pinky bone plate 1
  35. pinky bone plate 2
  36. thumb bone plate 1
  37. thumb bone plate 2
  38. bone hand plate
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

    python apply_texture.py <painted sheet.png> boneward
