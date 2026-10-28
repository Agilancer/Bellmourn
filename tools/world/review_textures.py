"""Review sheets for the texture library: each surface tiled 2x2 (seams show), labelled.

    python tools/world/review_textures.py [kind ...]     # -> assets/textures/review_<kind>.png
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LIB = os.path.join(ROOT, "assets", "textures")


def font(size):
    for n in ("consola.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            pass
    return ImageFont.load_default()


def sheet(entries, out, cell=192, cols=10):
    rows = (len(entries) + cols - 1) // cols
    img = Image.new("RGB", (cols * cell, rows * (cell + 16)), (24, 22, 26))
    d = ImageDraw.Draw(img)
    for k, e in enumerate(entries):
        t = Image.open(os.path.join(LIB, e["file"])).convert("RGB")
        s = cell / 2 / max(t.size)
        t = t.resize((max(1, int(t.width * s)), max(1, int(t.height * s))), Image.NEAREST)
        tile = Image.new("RGB", (t.width * 2, t.height * 2))
        for i in range(2):
            for j in range(2):
                tile.paste(t, (i * t.width, j * t.height))
        x, y = (k % cols) * cell, (k // cols) * (cell + 16)
        img.paste(tile, (x, y + 16))
        flag = "" if (e["tile_x"] and e["tile_y"]) else (" [x]" if e["tile_x"] else " [!]")
        d.text((x + 2, y + 1), (e["id"][:26] + flag), fill=(230, 220, 180), font=font(11))
    img.save(out)
    return out


if __name__ == "__main__":
    lib = json.load(open(os.path.join(LIB, "library.json")))
    kinds = sys.argv[1:] or sorted({s["kind"] for s in lib["surfaces"]})
    for kind in kinds:
        ents = [s for s in lib["surfaces"] if s["kind"] == kind or s["kind"].startswith(kind)]
        print(sheet(ents, os.path.join(LIB, f"review_{kind}.png")), len(ents))
