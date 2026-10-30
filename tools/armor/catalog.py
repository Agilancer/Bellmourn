"""Write every set's info.json and the overview of all the sets (system Python, PIL).

    python tools/armor/catalog.py <out_dir>
<out_dir> holds the builds' preview frames (<set>_<m|f>_front.png).
"""
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from sets import SETS  # noqa: E402

ARMOR = os.path.join(ROOT, "templates", "models", "armor")


def main():
    out = sys.argv[1]
    for sid, spec in SETS.items():
        folder = os.path.join(ARMOR, sid)
        os.makedirs(folder, exist_ok=True)
        info = {
            "id": sid, "name": spec["name"],
            "kind": "armour set for the villagers (skinned to their CharacterArmature)",
            "gauntlet": spec["gauntlet"], "description": spec["description"],
            "files": {"male": f"{sid}_m.glb", "female": f"{sid}_f.glb"},
            "meshes": {"Armor": "body, arms, legs and the set's gauntlets",
                       "Helm": "the helm and its crest (optional)"},
            "hide_when_worn": ["the villager's body meshes (every mesh not named V_*)",
                               "V_Hair* while the Helm shows"],
            "built_by": "tools/armor/build.py",
        }
        with open(os.path.join(folder, "info.json"), "w") as fh:
            json.dump(info, fh, indent=1)
    # the overview: every set's front frame, men above, women below
    th, tw = 480, 320
    ids = list(SETS)
    sheet = Image.new("RGB", (tw * len(ids), th * 2 + 60), (24, 22, 26))
    d = ImageDraw.Draw(sheet)
    for i, sid in enumerate(ids):
        d.text((i * tw + 8, 8), SETS[sid]["name"], fill=(226, 206, 160))
        for j, tag in enumerate("mf"):
            p = os.path.join(out, f"{sid}_{tag}_front.png")
            if os.path.exists(p):
                sheet.paste(Image.open(p).convert("RGB").resize((tw, th), Image.LANCZOS),
                            (i * tw, 30 + j * (th + 30)))
    dst = os.path.join(ARMOR, "overview.jpg")
    sheet.convert("RGB").save(dst, quality=88)
    print("wrote", dst)


if __name__ == "__main__":
    main()
