"""Build Bellmourn's texture library from every usable Velscour texture and sprite.

    python tools/world/build_textures.py [path to the velscour repo]

Writes assets/textures/surfaces/*.png (tiling textures for walls, floors, roofs, terrain),
assets/textures/sprites/*.png (billboards: trees and scenery) and assets/textures/library.json.

Sources (all from Velscour):
- the 35-texture material library (wood, planks, metal, gold, cloth) and the airship copies
- the cave textures (depths_edge/tex) and the 3D castle's wall and roof textures
- every biome pack's self-seamless isometric floors, un-projected to square tiling textures
- the town biome pack: 60 floors, the six wall materials and the four roof materials, all
  un-projected from their isometric sprites using the pack's documented projection
  (x = 80(u - v), y = 40(u + v) - z about the sprite pivot)
- trees and scenery sprites from every pack (for Daggerfall-style billboards)
Each surface is checked: `tile` records whether it repeats without a visible seam.
"""
import hashlib
import io
import json
import os
import sys
import zipfile

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "assets", "textures")
N = 160  # surface texture size (matches the material library)


def tiling(img):
    """(tiles left-right, tiles top-bottom): does wrapping add an edge bigger than the normal
    pixel-to-pixel change inside the texture?"""
    a = np.asarray(img.convert("RGB"), float)
    inner_x = np.abs(np.diff(a, axis=1)).mean()
    inner_y = np.abs(np.diff(a, axis=0)).mean()
    seam_x = np.abs(a[:, 0] - a[:, -1]).mean()
    seam_y = np.abs(a[0] - a[-1]).mean()
    return bool(seam_x <= inner_x * 1.35 + 1), bool(seam_y <= inner_y * 1.35 + 1)


def unproject(sprite, pivot, n, height_fn, v_fixed=None, size=(N, N)):
    """Sample an isometric sprite back into a flat texture. For texel (i, j), u and v run over
    one tile (-0.5..0.5); z comes from height_fn(u, v, j). Returns RGBA."""
    src = np.asarray(sprite.convert("RGBA"))
    h, w = src.shape[:2]
    W, H = size
    out = np.zeros((H, W, 4), np.uint8)
    for j in range(H):
        for i in range(W):
            u, v, z = height_fn((i + 0.5) / W, (j + 0.5) / H)
            x = int(np.floor(pivot[0] + 80 * (u - v)))
            y = int(np.floor(pivot[1] + 40 * (u + v) - z))
            if 0 <= x < w and 0 <= y < h:
                out[j, i] = src[y, x]
    return Image.fromarray(out)


def floor_square(tile, pivot=(80, 40)):
    """An isometric floor diamond -> a square texture (u across, v down)."""
    return unproject(tile, pivot, N, lambda s, t: (s - 0.5, t - 0.5, 0.0))


def roof_face(sprite, size=(N, N)):
    """A roof slope sprite seen face-on -> its flat texture: find the face parallelogram's
    corners (left = ridge start, top = ridge end, bottom = eave start) and sample across it,
    rows running from the ridge (top of the texture) down to the eave."""
    a = np.asarray(sprite.convert("RGBA"))
    ys, xs = np.nonzero(a[..., 3] > 0)
    pts = np.c_[xs, ys].astype(float)
    left = pts[np.argmin(pts[:, 0] - 0.01 * pts[:, 1])]
    top = pts[np.argmin(pts[:, 1])]
    bottom = pts[np.argmax(pts[:, 1])]
    along, down = top - left, bottom - left
    W, H = size
    out = np.zeros((H, W, 4), np.uint8)
    for j in range(H):
        for i in range(W):
            # pull samples a pixel in from the edges so the outline never lands in the texture
            p = left + along * (0.01 + 0.98 * (i + 0.5) / W) + down * (0.01 + 0.98 * (j + 0.5) / H)
            x, y = int(p[0]), int(p[1])
            if 0 <= x < a.shape[1] and 0 <= y < a.shape[0]:
                out[j, i] = a[y, x]
    return fill_holes(Image.fromarray(out))


def fill_holes(img):
    """Fill any transparent texels (diamond edge rows) from their neighbours."""
    a = np.asarray(img.convert("RGBA")).astype(float)
    have = a[..., 3] > 0
    for _ in range(4):
        if have.all():
            break
        acc = np.zeros(a.shape[:2] + (3,))
        cnt = np.zeros(a.shape[:2])
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sh = np.roll(np.roll(a[..., :3] * have[..., None], dy, 0), dx, 1)
            acc += sh
            cnt += np.roll(np.roll(have, dy, 0), dx, 1)
        new = ~have & (cnt > 0)
        a[new, :3] = acc[new] / cnt[new][:, None]
        a[new, 3] = 255
        have |= new
    return Image.fromarray(a.astype(np.uint8)).convert("RGB")


class Library:
    def __init__(self):
        self.surfaces, self.sprites, self.seen = [], [], set()
        os.makedirs(os.path.join(OUT, "surfaces"), exist_ok=True)
        os.makedirs(os.path.join(OUT, "sprites"), exist_ok=True)

    def surface(self, sid, img, kind, source, note=None):
        img = img.convert("RGB")
        digest = hashlib.sha1(img.tobytes()).hexdigest()
        if digest in self.seen:  # the airship pack repeats the material library
            return
        self.seen.add(digest)
        tx, ty = tiling(img)
        fn = f"surfaces/{sid}.png"
        img.save(os.path.join(OUT, fn))
        rgb = np.asarray(img, float).reshape(-1, 3).mean(0)
        self.surfaces.append(dict(id=sid, file=fn, kind=kind, source=source, size=list(img.size),
                                  tile_x=tx, tile_y=ty, color="#%02x%02x%02x" % tuple(int(c) for c in rgb),
                                  **({"note": note} if note else {})))

    def sprite(self, sid, img, category, source, anchor, height_m):
        """anchor: ground point in the image (px). height_m: how tall it stands in the world."""
        img = img.convert("RGBA")
        box = img.getbbox()
        if not box:
            return
        img = img.crop(box)
        ax, ay = anchor[0] - box[0], anchor[1] - box[1]
        fn = f"sprites/{sid}.png"
        img.save(os.path.join(OUT, fn))
        self.sprites.append(dict(id=sid, file=fn, category=category, source=source,
                                 size=list(img.size), anchor=[int(ax), int(ay)],
                                 height_m=round(float(height_m), 2)))

    def save(self):
        with open(os.path.join(OUT, "library.json"), "w") as f:
            json.dump(dict(surfaces=self.surfaces, sprites=self.sprites), f, indent=1)


def slug(s):
    return "".join(c if c.isalnum() else "_" for c in s.lower()).strip("_")


def build(vel):
    lib = Library()
    A = os.path.join(vel, "assets")
    # 1. material library (+ the airship pack's copies, de-duplicated)
    for base in ("source/materials/textures", "source/airship/textures"):
        for cat in sorted(os.listdir(os.path.join(A, base))):
            for fn in sorted(os.listdir(os.path.join(A, base, cat))):
                if fn.endswith(".png"):
                    lib.surface(slug(os.path.splitext(fn)[0]), Image.open(os.path.join(A, base, cat, fn)),
                                f"material_{cat}", f"{base}/{cat}/{fn}")
    # 2. caves
    for fn in sorted(os.listdir(os.path.join(A, "tiles/depths_edge/tex"))):
        lib.surface("cave_" + slug(os.path.splitext(fn)[0]), Image.open(os.path.join(A, "tiles/depths_edge/tex", fn)),
                    "cave", f"tiles/depths_edge/tex/{fn}")
    # 3. the 3D castle's walls and roofs
    for fn in sorted(os.listdir(os.path.join(A, "source/castle3d/tex"))):
        name = os.path.splitext(fn)[0]
        lib.surface("castle_" + slug(name), Image.open(os.path.join(A, "source/castle3d/tex", fn)),
                    "roof" if name.startswith("roof") else "wall", f"source/castle3d/tex/{fn}")
    # 4. biome packs: self-seamless iso floors and every scatter sprite
    for pack in ("castle_keep", "catacombs", "cathedral_graveyard", "dark_forest", "sewers"):
        meta = json.load(open(os.path.join(A, "tiles", pack, "pack.json")))
        sheet = Image.open(os.path.join(A, "tiles", pack, "floors.webp"))
        for f in meta["floors"]:
            if not f.get("seamless"):
                continue
            tile = sheet.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
            lib.surface(f"{pack}_{slug(f['name'])}", fill_holes(floor_square(tile)), "floor",
                        f"tiles/{pack}/floors.webp")
        sc = Image.open(os.path.join(A, "tiles", pack, "scatter.webp"))
        for s in meta.get("scatter", []):
            spr = sc.crop((s["x"], s["y"], s["x"] + s["w"], s["y"] + s["h"]))
            lib.sprite(f"{pack}_{slug(s['name'])}", spr, "scatter", f"tiles/{pack}/scatter.webp",
                       (-s["ox"], -s["oy"]), s["h"] / 64)
    trees = json.load(open(os.path.join(A, "tiles/dark_forest/trees.json")))
    tsheet = Image.open(os.path.join(A, "tiles/dark_forest/trees.webp"))
    for t in trees["trees"]:
        spr = tsheet.crop((t["x"], t["y"], t["x"] + t["w"], t["y"] + t["h"]))
        lib.sprite("dark_forest_" + slug(t["name"]), spr, "tree", "tiles/dark_forest/trees.webp",
                   (-t["ox"], -t["oy"]), t["h"] / 28)
    hang = os.path.join(A, "tiles/castle_keep/wall_hangings.json")
    if os.path.exists(hang):
        hm = json.load(open(hang))
        hs = Image.open(os.path.join(A, "tiles/castle_keep/wall_hangings.webp"))
        for h in hm.get("items", []):  # stained glass, banners, tapestries: the front view
            v = next((v for v in h.get("views", []) if v["name"].startswith("f_front")), None)
            if not v:
                continue
            spr = hs.crop((v["x"], v["y"], v["x"] + v["w"], v["y"] + v["h"]))
            kind = "window" if "glass" in h["name"] else "hanging"
            lib.sprite(f"{kind}_{slug(h['name'])}", spr, kind, "tiles/castle_keep/wall_hangings.webp",
                       (v["w"] // 2, v["h"]), 1.5)
    # 5. the desert
    sand = json.load(open(os.path.join(A, "tiles/sea_of_sand/pack.json")))["atlases"]
    for key, kind in (("floor", "floor"), ("tree", "tree"), ("scatter", "scatter")):
        sheet = Image.open(os.path.join(A, f"tiles/sea_of_sand/{key}.webp"))
        for f in sand[key]:
            crop = sheet.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
            if kind == "floor":
                lib.surface("sand_" + slug(f["name"]), fill_holes(floor_square(crop, tuple(f.get("pivot", (80, 40))))),
                            "floor", "tiles/sea_of_sand/floor.webp")
            else:
                pv = f.get("pivot") or [f["w"] // 2, f["h"]]
                lib.sprite("sand_" + slug(f["name"]), crop, kind, f"tiles/sea_of_sand/{key}.webp",
                           pv, f["h"] / (28 if kind == "tree" else 64))
    # 6. the town pack (zipped): floors, walls, roofs, trees, scatter
    z = zipfile.ZipFile(os.path.join(A, "source/biomes/town/Overworld_Town_Biome_Pack-1.zip"))
    man = json.loads(z.read("Overworld_Town_Biome_Pack/manifest.json"))["assets"]
    img = lambda a: Image.open(io.BytesIO(z.read("Overworld_Town_Biome_Pack/" + a["file"])))  # noqa: E731
    for a in man:
        if a["category"] == "floors":
            lib.surface("town_" + slug(a["name"]), fill_holes(floor_square(img(a), a["pivot_px"])),
                        "floor", a["file"])
        elif a["category"] == "walls" and a.get("topology") == "straight" and a["id"].endswith("SE_NW"):
            # rotation 0: the panel runs along u, its front face at v = +0.1 (half the 0.2 tile
            # thickness), 128 px tall
            face = unproject(img(a), a["pivot_px"], N,
                             lambda s, t: (s - 0.5, 0.1, (1 - t) * 128))
            lib.surface("town_wall_" + slug(a["wall_set"]), fill_holes(face), "wall", a["file"])
        elif a["category"] == "roofs" and a.get("roof_kind") == "slope" and a["orientation"] == "SW":
            # the SW slope faces the camera (SE is seen edge-on): its face is a parallelogram,
            # ridge along the top-left edge, eave along the bottom-right
            lib.surface("town_roof_" + slug(a["roof_material"]), roof_face(img(a)), "roof", a["file"],
                        note="un-projected from the camera-facing (SW) slope")
        elif a["category"] == "trees":
            lib.sprite("town_" + slug(a["id"]), img(a), "tree", a["file"], a["pivot_px"],
                       a.get("authored_height_px", a["size_px"][1]) / 26)
        elif a["category"] == "scatter":
            lib.sprite("town_" + slug(a["id"]), img(a), "scatter", a["file"], a["pivot_px"],
                       (a["alpha_bounds_px"][3] - a["alpha_bounds_px"][1]) / 64)
    lib.save()
    return lib


if __name__ == "__main__":
    vel = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), "velscour")
    lib = build(vel)
    from collections import Counter
    print(len(lib.surfaces), "surfaces:", dict(Counter(s["kind"] for s in lib.surfaces)))
    print("tile both ways:", sum(s["tile_x"] and s["tile_y"] for s in lib.surfaces),
          "| only across:", sum(s["tile_x"] and not s["tile_y"] for s in lib.surfaces))
    print(len(lib.sprites), "sprites:", dict(Counter(s["category"] for s in lib.sprites)))
