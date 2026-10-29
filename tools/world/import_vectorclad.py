"""Bring VectorClad's wood textures into Bellmourn: every bark and leaf tile from its
bark-and-foliage atlases, and the plank boards from its wooden rooftop-deck sheet.

    python tools/world/import_vectorclad.py [path/to/vectorclad]

Reads straight from the VectorClad repo's origin/main (it fetches first), so it never touches
that checkout's working tree, and can be re-run whenever VectorClad gets new textures. Each
atlas is a 4x4 grid of tiles with thin grid lines between them: tiles are cut with a small
inset, sorted into bark or foliage by colour, made seamless (blended with a half-offset copy
of themselves) and saved at 256 px. Every foliage tile also becomes a leaf card: the same
leaves cut out along the dark gaps between them, with a ragged edge, for the 3D trees.

Writes assets/textures/vectorclad/{bark,leaves,planks}/*.jpg, cards/*.png and
assets/textures/vectorclad.json (merged into the texture library by src/fps/lib.js).
"""
import io
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "assets", "textures", "vectorclad")
SIZE = 256

# atlas file -> species name used for the ids (and which tree it makes)
ATLASES = {
    "01_oak_bark_and_leaf_texture_atlas.png": "oak",
    "02_conifer_bark_and_pine_needle_texture_atlas.png": "pine",
    "03_redwood_bark_and_evergreen_texture_atlas.png": "redwood",
    "04_bark_and_maple_leaf_texture_atlas.png": "maple",
    "05_beech_bark_and_foliage_texture_atlas.png": "beech",
    "06_cedar_bark_and_evergreen_texture_atlas.png": "cedar",
    "07_photorealistic_bark_and_foliage_texture_atlas.png": "elm",
    "08_4x4_forest_bark_and_foliage_texture_atlas.png": "forest",
    "09_mossy_woodland_texture_atlas.png": "mossy",
    "10_nature_texture_atlas_mosaic.png": "laurel",
}
PLANKS = "assets/rooftop-textures/14-wood-rooftop-deck.png"
PLANK_ROWS = (0, 1, 2)  # the fourth row is metal vents and hatches, not wood


def git(repo, *args, binary=False):
    r = subprocess.run(["git", "-C", repo, *args], capture_output=True, check=True)
    return r.stdout if binary else r.stdout.decode("utf8")


def tiles(img, n=4, inset=6):
    w, h = img.size
    for r in range(n):
        for c in range(n):
            x0, y0 = round(c * w / n) + inset, round(r * h / n) + inset
            x1, y1 = round((c + 1) * w / n) - inset, round((r + 1) * h / n) - inset
            yield r, c, img.crop((x0, y0, x1, y1))


def seamless(a):
    """Blend a tile with its half-offset copy so its edges wrap (the copy's middle covers the
    original's edges)."""
    h, w = a.shape[:2]
    b = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    y, x = np.mgrid[0:h, 0:w]
    d = np.maximum(np.abs(x - w / 2) / (w / 2), np.abs(y - h / 2) / (h / 2))
    m = np.clip((d - 0.55) / 0.4, 0, 1)[..., None]
    m = m * m * (3 - 2 * m)
    return a * (1 - m) + b * m


def is_foliage(a):
    r, g, b = a[..., 0].mean(), a[..., 1].mean(), a[..., 2].mean()
    return g > r * 1.12 and g > b * 1.05


def leaf_card(a, seed):
    """Leaves cut out along the dark gaps between them, inside a ragged round edge."""
    rng = np.random.default_rng(seed)
    lum = a[..., :3].astype(np.float32) @ np.array([0.3, 0.59, 0.11], np.float32)
    lo, hi = np.percentile(lum, 30), np.percentile(lum, 48)
    keep = np.clip((lum - lo) / max(1.0, hi - lo), 0, 1)
    h, w = lum.shape
    y, x = np.mgrid[0:h, 0:w]
    ang = np.arctan2(y - h / 2, x - w / 2)
    lobes = sum(rng.uniform(0.04, 0.09) * np.sin(k * ang + rng.uniform(0, 6.3)) for k in (3, 5, 8))
    r = np.hypot(x - w / 2, y - h / 2) / (w / 2)
    edge = np.clip((0.92 + lobes - r) / 0.12, 0, 1)
    alpha = (keep * edge > 0.5).astype(np.uint8) * 255
    out = np.dstack([a[..., :3], alpha])
    return Image.fromarray(out, "RGBA")


def save(img, kind, name):
    """Opaque tiles as JPEG; leaf cards as palette PNG (they need their cut-out alpha)."""
    os.makedirs(os.path.join(OUT, kind), exist_ok=True)
    if img.mode == "RGBA":
        path = os.path.join(OUT, kind, name + ".png")
        img.quantize(colors=128, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)
        return f"vectorclad/{kind}/{name}.png"
    path = os.path.join(OUT, kind, name + ".jpg")
    img.save(path, quality=88, optimize=True)
    return f"vectorclad/{kind}/{name}.jpg"


def main():
    repo = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), "vectorclad")
    git(repo, "fetch", "-q", "origin")
    ref = "origin/main"
    surfaces, cards = [], []
    for fname, species in ATLASES.items():
        raw = git(repo, "show", f"{ref}:assets/bark-and-foliage/{fname}", binary=True)
        atlas = Image.open(io.BytesIO(raw)).convert("RGB")
        nb = nl = 0
        for r, c, t in tiles(atlas):
            a = np.asarray(t.resize((SIZE, SIZE), Image.LANCZOS), np.float32)
            leaf = is_foliage(a)
            a = np.clip(seamless(a), 0, 255).astype(np.uint8)
            img = Image.fromarray(a, "RGB")
            if leaf:
                nl += 1
                name = f"{species}_leaves_{nl:02d}"
                surfaces.append(dict(id=f"vc_{name}", file=save(img, "leaves", name), kind="leaves", species=species,
                                     size=[SIZE, SIZE], color="#%02x%02x%02x" % tuple(a.reshape(-1, 3).mean(0).astype(int))))
                cards.append(dict(id=f"vc_{species}_card_{nl:02d}", file=save(leaf_card(a, hash(name) & 0xffff), "cards", f"{species}_card_{nl:02d}"),
                                  kind="leafcard", species=species, size=[SIZE, SIZE]))
            else:
                nb += 1
                name = f"{species}_bark_{nb:02d}"
                surfaces.append(dict(id=f"vc_{name}", file=save(img, "bark", name), kind="bark", species=species,
                                     size=[SIZE, SIZE], color="#%02x%02x%02x" % tuple(a.reshape(-1, 3).mean(0).astype(int))))
        print(f"{species:8} {nb:2} bark  {nl:2} leaves")
    raw = git(repo, "show", f"{ref}:{PLANKS}", binary=True)
    deck = Image.open(io.BytesIO(raw)).convert("RGB")
    n = 0
    for r, c, t in tiles(deck):
        if r not in PLANK_ROWS:
            continue
        n += 1
        a = np.clip(seamless(np.asarray(t.resize((SIZE, SIZE), Image.LANCZOS), np.float32)), 0, 255).astype(np.uint8)
        name = f"planks_{n:02d}"
        surfaces.append(dict(id=f"vc_{name}", file=save(Image.fromarray(a, "RGB"), "planks", name), kind="plank",
                             size=[SIZE, SIZE], color="#%02x%02x%02x" % tuple(a.reshape(-1, 3).mean(0).astype(int))))
    print(f"planks   {n:2}")
    commit = git(repo, "rev-parse", "--short", ref).strip()
    with open(os.path.join(ROOT, "assets", "textures", "vectorclad.json"), "w") as f:
        json.dump(dict(source=f"Agilancer/vectorclad@{commit}", surfaces=surfaces, cards=cards), f, indent=1)
    print(f"{len(surfaces)} surfaces, {len(cards)} leaf cards from vectorclad {commit}")


if __name__ == "__main__":
    main()
