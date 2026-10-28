"""Bundle a template pack into a zip to hand to ChatGPT.

    python tools/templates/package.py            # writes templates/packs/bellmourn_fp_weapons.zip

Each zip holds the locked style guide and palette, a ready-to-paste prompt, and per rig its
template sheet, frames file and preview.
"""
import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TPL = os.path.join(ROOT, "templates")

PROMPT = """# How to use this pack with ChatGPT

Attach STYLE_GUIDE.md, bellmourn_palette.png and ONE rig's `<rig>_template.png`, then paste:

---
You are painting first-person weapon sprites for Bellmourn, a 1990s-style dark fantasy game.
Follow the attached STYLE_GUIDE.md exactly; it is locked. Use only colours from
bellmourn_palette.png.

The attached sheet is a rig: every cell is one full game screen (384x240) showing one animation
frame. Paint the locked Bellmourn gauntlet arm(s) holding: <DESCRIBE THE WEAPON HERE>.

- Match the rig in every cell: fist on the green G dot, knuckles toward the cyan arrow, the
  weapon along the yellow proxy (shorter or longer weapons keep the same grip and angle).
- Where a cell is marked SMEAR, paint a motion smear; where it is marked FIRE, paint a muzzle
  flash at the orange burst.
- Then replace every guide mark, label, dot, line and the grey mannequin with flat #FF00FF.
- Keep the sheet size and every black cell border exactly where they are.
- Same weapon, same arm, same lighting in every frame. Hard pixel edges, no outlines, no text.
---

Each rig's notes (on the sheet and in `<rig>_frames.json`) say what the animation does.
`<rig>_frames.json` also gives each frame's cell, timing in tics (1/35 s), events
(hit / fire / smear) and the full 3D arm pose, so the game can slice and time the sheet.
"""


def pack_fp_weapons():
    out_dir = os.path.join(TPL, "packs")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "bellmourn_fp_weapons.zip")
    rigs_dir = os.path.join(TPL, "fp_weapons")
    rigs = sorted(d for d in os.listdir(rigs_dir) if os.path.isdir(os.path.join(rigs_dir, d)))
    index = []
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("HOW_TO_USE.md", PROMPT)
        for name in ("STYLE_GUIDE.md", "bellmourn_palette.png", "bellmourn_palette.gpl",
                     "bellmourn_palette.json"):
            z.write(os.path.join(TPL, "style", name), name)
        for rig in rigs:
            with open(os.path.join(rigs_dir, rig, f"{rig}_frames.json")) as f:
                meta = json.load(f)
            index.append(f"- `{rig}`: {meta['title'].title()} ({len(meta['frames'])} frames)")
            for suffix in ("_template.png", "_frames.json", "_preview.gif"):
                z.write(os.path.join(rigs_dir, rig, rig + suffix), f"rigs/{rig}/{rig}{suffix}")
        z.writestr("RIGS.md", "# Rigs in this pack\n\n" + "\n".join(index) + "\n")
    return path, len(rigs)


if __name__ == "__main__":
    path, n = pack_fp_weapons()
    print(f"wrote {path} ({n} rigs, {os.path.getsize(path) // 1024} KB)")
