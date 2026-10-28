"""The locked Bellmourn palette: 16 ramps of 16 shades, index 255 is the transparency key.

Ramps run dark to light and shift hue as they go (cool shadows, warm lights), the way the
Raven palettes did. Run this file to write palette.png / .gpl / .json into templates/style.
"""
import json
import os

from PIL import Image, ImageDraw

KEY = (255, 0, 255)

# name, darkest, middle, lightest
RAMPS = [
    ("stone",      "#0b0b10", "#5a5a62", "#d0cec6"),
    ("slate",      "#090d16", "#3f4b5e", "#aebbcc"),
    ("earth",      "#120a06", "#6b4628", "#dcb88c"),
    ("wood",       "#140904", "#7a4a22", "#e6ac6a"),
    ("flesh",      "#1a0a08", "#9a5a40", "#f4cca8"),
    ("blood",      "#140204", "#8e1010", "#ff9078"),
    ("fire",       "#200400", "#d05a08", "#fff4a8"),
    ("gold",       "#160c00", "#a47818", "#fff2a4"),
    ("iron",       "#08090c", "#5d6672", "#eaf0f4"),
    ("moss",       "#060c04", "#3e6a24", "#c8e48c"),
    ("venom",      "#04100a", "#2c8a3a", "#b4ff9e"),
    ("mana",       "#02041a", "#2850c8", "#c4e6ff"),
    ("arcane",     "#0c0418", "#6a2a9a", "#ecbcff"),
    ("bone",       "#18140c", "#a89a74", "#fffbea"),
    ("sky",        "#0a1424", "#5888b8", "#e6f4ff"),
    ("leather",    "#100606", "#5e2a20", "#c48c74"),
]


def _hex(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def _lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def colors():
    out = []
    for _, lo, mid, hi in RAMPS:
        lo, mid, hi = _hex(lo), _hex(mid), _hex(hi)
        for i in range(16):
            t = i / 15
            out.append(_lerp(lo, mid, t * 2) if t < 0.5 else _lerp(mid, hi, (t - 0.5) * 2))
    out[255] = KEY
    return out


def swatch(cell=24):
    pal = colors()
    img = Image.new("RGB", (16 * cell, 16 * cell))
    d = ImageDraw.Draw(img)
    for i, c in enumerate(pal):
        x, y = (i % 16) * cell, (i // 16) * cell
        d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=c)
    return img


def write(outdir):
    os.makedirs(outdir, exist_ok=True)
    pal = colors()
    swatch().save(os.path.join(outdir, "bellmourn_palette.png"))
    with open(os.path.join(outdir, "bellmourn_palette.gpl"), "w") as f:
        f.write("GIMP Palette\nName: Bellmourn\nColumns: 16\n#\n")
        for i, (r, g, b) in enumerate(pal):
            name = "KEY" if i == 255 else f"{RAMPS[i // 16][0]}_{i % 16:02d}"
            f.write(f"{r:3d} {g:3d} {b:3d}\t{name}\n")
    with open(os.path.join(outdir, "bellmourn_palette.json"), "w") as f:
        json.dump({"key_index": 255, "ramps": [r[0] for r in RAMPS],
                   "colors": ["#%02x%02x%02x" % c for c in pal]}, f, indent=1)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    write(os.path.join(root, "templates", "style"))
