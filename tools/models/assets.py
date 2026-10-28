"""Write one model's asset folder: .glb file(s), texture sheet for ChatGPT, UV mask,
placeholder texture, info.json and a ready-to-paste PROMPT.md."""
import json
import os

import texkit

PROMPT = """# Texture prompt: {name}

Attach to ChatGPT: STYLE_GUIDE.md, bellmourn_palette.png and `{id}_sheet.png`. Then paste:

---
You are painting the texture for a low-poly 3D {kind} in Bellmourn, a 1990s-style dark fantasy
first-person game (think Heretic, Hexen, Daggerfall, and late-90s PlayStation and N64 models).
Follow the attached STYLE_GUIDE.md; it is locked. Use only colours from bellmourn_palette.png.

**The item:** {name}. {desc}

The attached sheet is the model's texture layout. The LEFT square is a {tex}x{tex} texture
blown up to 1024x1024 (each {px}x{px} block of sheet pixels becomes one texel), with every
piece of the model outlined in black and numbered. The RIGHT side shows the model from several
angles with each numbered piece in its own colour, and a key. White arrows inside a piece show
which way it runs (for example "toward tip": paint the end of that piece nearest the arrowhead
as the tip end).

Paint the texture into the left square:
{parts}
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

    python apply_texture.py <painted sheet.png> {folder}
"""


def write(folder, model_id, name, kind, desc, models_and_files, sheet_model, notes=(),
          angles=None, part_notes=None):
    """`models_and_files` = [(model, glb filename, exporter callable)]. The sheet, mask and
    placeholder come from `sheet_model` (all models in a folder share one UV layout)."""
    os.makedirs(folder, exist_ok=True)
    tris = 0
    for model, fname, export in models_and_files:
        tris = export(model, os.path.join(folder, fname))
    tex = texkit.placeholder_texture(sheet_model)
    tex.save(os.path.join(folder, f"{model_id}_texture.png"))
    texkit.mask(sheet_model).convert("1").save(os.path.join(folder, f"{model_id}_mask.png"))
    kw = dict(angles=angles) if angles else {}
    texkit.sheet(sheet_model, name.upper(), list(notes) + [
        "Paint the LEFT square only; leave the rest magenta.",
        f"Texture {sheet_model.tex}x{sheet_model.tex}: 1 texel = {1024 // sheet_model.tex} px."],
        **kw).save(os.path.join(folder, f"{model_id}_sheet.png"))
    numbers, lines = {}, []
    for part, _ in sheet_model.islands():
        if part.name not in numbers:
            numbers[part.name] = len(numbers) + 1
            extra = (part_notes or {}).get(part.name, "")
            lines.append(f"  {numbers[part.name]:>2}. {part.label}{(' - ' + extra) if extra else ''}")
    info = dict(id=model_id, name=name, kind=kind, description=desc,
                texture_size=sheet_model.tex, triangles=tris,
                files=[f for _, f, _ in models_and_files],
                parts=[dict(number=n, name=k) for k, n in numbers.items()])
    with open(os.path.join(folder, "info.json"), "w") as f:
        json.dump(info, f, indent=1)
    with open(os.path.join(folder, "PROMPT.md"), "w", encoding="utf8") as f:
        f.write(PROMPT.format(
            name=name, id=model_id, kind=kind, desc=desc, tex=sheet_model.tex,
            px=1024 // sheet_model.tex, folder=os.path.basename(folder),
            parts="- The numbered pieces are:\n" + "\n".join(lines)))
    return info
