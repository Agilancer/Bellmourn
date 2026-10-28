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


MODELS = os.path.join(TPL, "models")
TOOLS = os.path.join(ROOT, "tools", "models")


def _model_folders(sub):
    base = os.path.join(MODELS, sub)
    out = []
    for dirpath, dirs, files in os.walk(base):
        if "info.json" in files:
            out.append(dirpath)
    return sorted(out)


def pack_models(name, title, subs):
    """A 3D model pack: models + sheets + prompts + apply script + viewer + style guide."""
    out_dir = os.path.join(TPL, "packs")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.zip")
    folders = [f for sub in subs for f in _model_folders(sub)]
    listing = ["## Models", ""]
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for fn in ("STYLE_GUIDE.md", "bellmourn_palette.png", "bellmourn_palette.gpl",
                   "bellmourn_palette.json"):
            z.write(os.path.join(TPL, "style", fn), fn)
        z.write(os.path.join(TOOLS, "apply_texture.py"), "apply_texture.py")
        # the viewer, rewritten to read the models from this folder
        with open(os.path.join(TOOLS, "viewer.html"), encoding="utf8") as f:
            viewer = f.read().replace("|| '../../templates/models/';", "|| './';")
            assert "|| './';" in viewer, "viewer ROOT line changed; update this rewrite"
            z.writestr("viewer.html", viewer)
        z.write(os.path.join(MODELS, "manifest.json"), "manifest.json")
        # the bare arms always come along (the viewer and the game fall back to them)
        for fn in os.listdir(os.path.join(MODELS, "arms")):
            if fn.endswith((".glb", ".png")):
                z.write(os.path.join(MODELS, "arms", fn), f"arms/{fn}")
        for folder in folders:
            rel = os.path.relpath(folder, MODELS).replace("\\", "/")
            with open(os.path.join(folder, "info.json")) as f:
                info = json.load(f)
            listing.append(f"- `{rel}`: **{info['name']}** ({info['triangles']} triangles, "
                           f"{info['texture_size']}px texture). {info['description']}")
            for fn in sorted(os.listdir(folder)):
                z.write(os.path.join(folder, fn), f"{rel}/{fn}")
        cat = os.path.join(MODELS, "catalog")
        for fn in sorted(os.listdir(cat)) if os.path.isdir(cat) else []:
            if (fn == "gauntlets.png") == ("gauntlets" in subs):  # each pack its own previews
                z.write(os.path.join(cat, fn), f"catalog/{fn}")
        with open(os.path.join(TOOLS, "README_PACK.md"), encoding="utf8") as f:
            z.writestr("README.md", f.read().replace("{title}", title).replace(
                "{listing}", "\n".join(listing)))
    return path, len(folders)


if __name__ == "__main__":
    path, n = pack_fp_weapons()
    print(f"wrote {path} ({n} rigs, {os.path.getsize(path) // 1024} KB)")
    if os.path.isdir(MODELS):
        for name, title, subs in (("bellmourn_3d_gauntlets", "gauntlets", ["gauntlets"]),
                                  ("bellmourn_3d_weapons", "weapons, shields, wands and staffs",
                                   ["items"])):
            p, n = pack_models(name, title, subs)
            print(f"wrote {p} ({n} models, {os.path.getsize(p) // 1024} KB)")
