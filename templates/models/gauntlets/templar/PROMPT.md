# Texture prompt: Gilded Templar

Attach to ChatGPT: STYLE_GUIDE.md, bellmourn_palette.png and `templar_sheet.png`. Then paste:

---
You are painting the texture for a low-poly 3D gauntlet (a first-person arm: sleeve, elbow, bracer and gloved hand) in Bellmourn, a 1990s-style dark fantasy
first-person game (think Heretic, Hexen, Daggerfall, and late-90s PlayStation and N64 models).
Follow the attached STYLE_GUIDE.md; it is locked. Use only colours from bellmourn_palette.png.

**The item:** Gilded Templar. Holy plate: polished steel with gold trim, a fluted bell cuff, a gilded knuckle bar, a gold sun medallion on the back of the hand, a royal blue tabard sleeve over mail.

The attached sheet is the model's texture layout. The LEFT square is a 256x256 texture
blown up to 1024x1024 (each 4x4 block of sheet pixels becomes one texel), with every
piece of the model outlined in black and numbered. The RIGHT side shows the model from several
angles with each numbered piece in its own colour, and a key. White arrows inside a piece show
which way it runs (for example "toward tip": paint the end of that piece nearest the arrowhead
as the tip end).

Paint the texture into the left square:
- The numbered pieces are:
   1. tabard sleeve
   2. elbow
   3. elbow point
   4. couter
   5. couter wing
   6. vambrace
   7. gold trim
   8. glove wrist
   9. glove: palm and back
  10. index 1
  11. index 2
  12. index 3
  13. middle 1
  14. middle 2
  15. middle 3
  16. ring 1
  17. ring 2
  18. ring 3
  19. pinky 1
  20. pinky 2
  21. pinky 3
  22. thumb 1
  23. thumb 2
  24. thumb 3
  25. index plate 1
  26. index plate 2
  27. index plate 3
  28. middle plate 1
  29. middle plate 2
  30. middle plate 3
  31. ring plate 1
  32. ring plate 2
  33. ring plate 3
  34. pinky plate 1
  35. pinky plate 2
  36. pinky plate 3
  37. thumb plate 1
  38. thumb plate 2
  39. thumb plate 3
  40. gilded knuckle bar
  41. hand plate
  42. sun medallion
  43. fluted cuff
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

    python apply_texture.py <painted sheet.png> templar
