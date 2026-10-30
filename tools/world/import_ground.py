"""Cut the ground texture sheets in art/ground/ into seamless tiles for the texture library.

    python tools/world/import_ground.py

Each sheet (art/ground/NN_<set>.webp, e.g. 09_grass.webp) is 5 tiles across by 2 down, with a
thin dark divider between them. The tiles were painted to repeat, but the sheet was resampled
after they were laid out, so the divider bleeds a pixel or two into each and the edges no
longer meet exactly. Each tile is cut a few pixels inside its divider, scaled to SIZE, and
made to wrap by keeping only its periodic component (Moisan's periodic plus smooth
decomposition): the edge mismatch goes into a smooth correction field, which is
subtracted, so the stones, leaves and pebbles stay crisp and nothing is cross-faded or ghosted.

Writes assets/textures/ground/<set>/<set>_NN.jpg (NN in reading order, 01 to 10) and
assets/textures/ground.json (merged into the texture library by src/fps/lib.js, as surfaces
of kind "ground" with ids ground_<set>_NN). To add a sheet, drop it in art/ground/ with the
next number and re-run.
"""
import json
import os
import re

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, "art", "ground")
OUT = os.path.join(ROOT, "assets", "textures", "ground")
COLS, ROWS = 5, 2
INSET = 3   # px cut off each side of a cell (the divider and its halo)
SIZE = 256  # as VectorClad's tiles


def tiling(a):
    """(tiles left-right, tiles top-bottom), as tools/world/build_textures.py."""
    inner_x = np.abs(np.diff(a, axis=1)).mean()
    inner_y = np.abs(np.diff(a, axis=0)).mean()
    seam_x = np.abs(a[:, 0] - a[:, -1]).mean()
    seam_y = np.abs(a[0] - a[-1]).mean()
    return bool(seam_x <= inner_x * 1.35 + 1), bool(seam_y <= inner_y * 1.35 + 1)


def periodic(u):
    """The periodic component of an image (L. Moisan, "Periodic plus smooth image
    decomposition", 2011): the image minus the smooth field whose Laplacian is the jump
    across its wrapped edges."""
    M, N = u.shape[:2]
    v = np.zeros_like(u)
    v[0] += u[-1] - u[0]
    v[-1] += u[0] - u[-1]
    v[:, 0] += u[:, -1] - u[:, 0]
    v[:, -1] += u[:, 0] - u[:, -1]
    q, r = np.arange(M)[:, None], np.arange(N)[None, :]
    den = 2 * np.cos(2 * np.pi * q / M) + 2 * np.cos(2 * np.pi * r / N) - 4
    den[0, 0] = 1
    out = np.empty_like(u)
    for c in range(u.shape[2]):
        s = np.fft.fft2(v[..., c]) / den
        s[0, 0] = 0  # keep the mean colour
        out[..., c] = u[..., c] - np.real(np.fft.ifft2(s))
    return out


def cells(img):
    w, h = img.size
    for r in range(ROWS):
        for c in range(COLS):
            x0, x1 = round(c * w / COLS) + INSET, round((c + 1) * w / COLS) - INSET
            y0, y1 = round(r * h / ROWS) + INSET, round((r + 1) * h / ROWS) - INSET
            yield r, c, img.crop((x0, y0, x1, y1))


def main():
    sheets = sorted(f for f in os.listdir(SRC) if re.fullmatch(r"\d\d_[a-z_]+\.(webp|png|jpg)", f))
    surfaces, meta = [], []
    for fname in sheets:
        name = re.sub(r"^\d\d_|\.\w+$", "", fname)
        img = Image.open(os.path.join(SRC, fname)).convert("RGB")
        os.makedirs(os.path.join(OUT, name), exist_ok=True)
        n = 0
        for r, c, cell in cells(img):
            n += 1
            a = np.asarray(cell.resize((SIZE, SIZE), Image.LANCZOS), np.float64)
            a = np.clip(periodic(a), 0, 255).astype(np.uint8)
            rel = f"ground/{name}/{name}_{n:02d}.jpg"
            Image.fromarray(a, "RGB").save(os.path.join(OUT, "..", rel), quality=88, optimize=True)
            back = np.asarray(Image.open(os.path.join(OUT, "..", rel)).convert("RGB"), float)  # check what was saved
            tx, ty = tiling(back)
            surfaces.append(dict(id=f"ground_{name}_{n:02d}", file=rel, kind="ground", set=name,
                                 sheet=f"art/ground/{fname}", cell=[r, c], size=[SIZE, SIZE], tile_x=tx, tile_y=ty,
                                 color="#%02x%02x%02x" % tuple(int(v) for v in back.reshape(-1, 3).mean(0))))
        meta.append(dict(set=name, sheet=f"art/ground/{fname}", tiles=n))
        ok = sum(s["tile_x"] and s["tile_y"] for s in surfaces[-n:])
        print(f"{name:14} {n} tiles, {ok} seamless")
    with open(os.path.join(ROOT, "assets", "textures", "ground.json"), "w") as f:
        json.dump(dict(sets=meta, surfaces=surfaces), f, indent=1)
    print(f"{len(surfaces)} ground surfaces from {len(sheets)} sheets")


if __name__ == "__main__":
    main()
