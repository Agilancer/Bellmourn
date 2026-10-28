# Texture prompt: Drakescale

Attach to ChatGPT: STYLE_GUIDE.md, bellmourn_palette.png and `drake_sheet.png`. Then paste:

---
You are painting the texture for a low-poly 3D gauntlet (a first-person arm: sleeve, elbow, bracer and gloved hand) in Bellmourn, a 1990s-style dark fantasy
first-person game (think Heretic, Hexen, Daggerfall, and late-90s PlayStation and N64 models).
Follow the attached STYLE_GUIDE.md; it is locked. Use only colours from bellmourn_palette.png.

**The item:** Drakescale. Overlapping rows of green drake scales down the forearm and over the fingers, bronze hand plate and elbow cap, horn studs on the knuckles, a dark red sleeve.

The attached sheet is the model's texture layout. The LEFT square is a 256x256 texture
blown up to 1024x1024 (each 4x4 block of sheet pixels becomes one texel), with every
piece of the model outlined in black and numbered. The RIGHT side shows the model from several
angles with each numbered piece in its own colour, and a key. White arrows inside a piece show
which way it runs (for example "toward tip": paint the end of that piece nearest the arrowhead
as the tip end).

Paint the texture into the left square:
- The numbered pieces are:
   1. sleeve
   2. elbow
   3. elbow point
   4. scale couter
   5. under-bracer
   6. scales row 1
   7. scales row 2
   8. scales row 3
   9. scales row 4
  10. scales row 5
  11. scales row 6
  12. glove wrist
  13. glove: palm and back
  14. index 1
  15. index 2
  16. index 3
  17. middle 1
  18. middle 2
  19. middle 3
  20. ring 1
  21. ring 2
  22. ring 3
  23. pinky 1
  24. pinky 2
  25. pinky 3
  26. thumb 1
  27. thumb 2
  28. thumb 3
  29. index scale 1
  30. index scale 2
  31. index scale 3
  32. middle scale 1
  33. middle scale 2
  34. middle scale 3
  35. ring scale 1
  36. ring scale 2
  37. ring scale 3
  38. pinky scale 1
  39. pinky scale 2
  40. pinky scale 3
  41. thumb scale 1
  42. thumb scale 2
  43. thumb scale 3
  44. drake plate
  45. index knuckle spike
  46. middle knuckle spike
  47. ring knuckle spike
  48. pinky knuckle spike
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

    python apply_texture.py <painted sheet.png> drake
