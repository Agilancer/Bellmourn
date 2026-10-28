# Texture prompt: Spiked Brawler

Attach to ChatGPT: STYLE_GUIDE.md, bellmourn_palette.png and `brawler_sheet.png`. Then paste:

---
You are painting the texture for a low-poly 3D gauntlet (a first-person arm: sleeve, elbow, bracer and gloved hand) in Bellmourn, a 1990s-style dark fantasy
first-person game (think Heretic, Hexen, Daggerfall, and late-90s PlayStation and N64 models).
Follow the attached STYLE_GUIDE.md; it is locked. Use only colours from bellmourn_palette.png.

**The item:** Spiked Brawler. Studded brown leather with iron spikes on every knuckle and down the bracer, a thick leather knuckle pad, a dark leather sleeve. A pit fighter's gear.

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
   4. elbow knob 1
   5. elbow knob -1
   6. sleeve cuff
   7. studded bracer
   8. bracer spike back 1
   9. bracer spike outer 1
  10. bracer spike back 2
  11. bracer spike outer 2
  12. bracer spike back 3
  13. bracer spike outer 3
  14. glove wrist
  15. glove: palm and back
  16. index 1
  17. index 2
  18. index 3
  19. middle 1
  20. middle 2
  21. middle 3
  22. ring 1
  23. ring 2
  24. ring 3
  25. pinky 1
  26. pinky 2
  27. pinky 3
  28. thumb 1
  29. thumb 2
  30. thumb 3
  31. index knuckle spike
  32. middle knuckle spike
  33. ring knuckle spike
  34. pinky knuckle spike
  35. knuckle pad
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

    python apply_texture.py <painted sheet.png> brawler
