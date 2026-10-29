"""Import the biome packs' flat source art (each pack's source_art/) as Bellmourn textures.

    python tools/world/import_biome_art.py "F:/!  VELSCOUR/AI ASSETS/Biome Packs"

The packs (Catacombs, Cathedral & Graveyard, Overworld Town) were made by projecting flat,
straight-on source paintings into isometric sprites. A first-person game wants the flat
paintings themselves, so this reads them, not the sprites:

- floors: the 160 px square floor textures (floor_uv_NN / normalized/floor_NN). The packs'
  certified self-seamless ones replace the library's earlier un-projected copies (same ids);
  the rest are one-off feature tiles (grates, crosses, memorial brasses, carpets...) kept as
  decals to lay into floors here and there
- walls: the wall material sheets (5 or 6 columns x 2 rows of full-height wall elevations:
  front, and back or reverse), cut apart, halved and made to repeat across. The cathedral's
  stained glass chapel wall is left out (its glass is the windows' job, glass.js)
- roofs: the town's four roof materials
- doors: every door leaf, front and back (with real holes in the grilles and gates)
- arches and gateways: front and back elevations, to be extruded into 3D (cutout.js)
- signs: the twelve shop signboards

Names come from each pack's manifest.json (its sprites record which source each came from).
Writes assets/textures/biome/** and assets/textures/biome.json (merged over library.json by
src/fps/lib.js).
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "assets", "textures")
BIOME = "biome"
WALL_H = 240  # wall panels: px tall after halving (the source cells are ~480)

PACKS = {
    "catacombs": "Catacombs_Biome_Pack",
    "cathedral_graveyard": "Cathedral_Graveyard_Biome_Pack",
    "town": "Overworld_Town_Biome_Pack",
}
# the wall sheets' columns, in each pack's generation-prompt order (row 0 front, row 1 back)
WALL_SHEETS = {
    "catacombs": ("wall_materials.png", ["crypt_ashlar", "ossuary_niches", "funerary_chapel", "sealed_cells", "drowned_crypt"],
                  ["front", "back"]),
    "cathedral_graveyard": ("wall_materials.png", ["nave_ashlar", None, "buttressed_masonry", "cemetery_limestone", "cemetery_iron"],
                            ["front", "back"]),
    "town": ("building_walls.png", ["oak_plaster", "pine_siding", "fieldstone", "dressed_limestone", "town_brick", "wattle_daub"],
             ["front", "inner"]),
}
ROOFS = ["oak_shingles", "blue_slate", "terracotta", "straw_thatch"]  # roof_materials reading order


def tiling(img):
    """(tiles left-right, tiles top-bottom): does wrapping add an edge bigger than the normal
    pixel-to-pixel change inside the texture? (as tools/world/build_textures.py)"""
    a = np.asarray(img.convert("RGB"), float)
    inner_x = np.abs(np.diff(a, axis=1)).mean()
    inner_y = np.abs(np.diff(a, axis=0)).mean()
    seam_x = np.abs(a[:, 0] - a[:, -1]).mean()
    seam_y = np.abs(a[0] - a[-1]).mean()
    return bool(seam_x <= inner_x * 1.35 + 1), bool(seam_y <= inner_y * 1.35 + 1)


def mean_color(img):
    a = np.asarray(img.convert("RGBA"), float)
    m = a[..., 3] > 127
    c = a[m][:, :3].mean(0) if m.any() else np.zeros(3)
    return "#%02x%02x%02x" % tuple(int(v) for v in c)


def gutters(profile, n, length):
    """The n-1 dark gutters between n equal cells along a brightness profile: (start, end)."""
    out, med = [], float(np.median(profile))
    for k in range(1, n):
        c = round(k * length / n)
        lo, hi = max(0, c - 30), min(length, c + 30)
        i = int(np.argmin(profile[lo:hi])) + lo
        thr = profile[i] + 0.35 * (med - profile[i])
        l = r = i
        while l > 0 and profile[l - 1] < thr:
            l -= 1
        while r < length - 1 and profile[r + 1] < thr:
            r += 1
        out.append((l, r))
    return out


def cells(img, cols, rows):
    """Cut a sheet of cols x rows panels apart along its gutters; each cell trimmed of any dark
    border left at the sheet's edges."""
    a = np.asarray(img.convert("RGB")).astype(float)
    h, w = a.shape[:2]
    lum = a.mean(2)
    gx, gy = gutters(lum.mean(0), cols, w), gutters(lum.mean(1), rows, h)
    xs = [0] + [g[1] + 2 for g in gx], [g[0] - 1 for g in gx] + [w]
    ys = [0] + [g[1] + 2 for g in gy], [g[0] - 1 for g in gy] + [h]
    out = {}
    for j in range(rows):
        for i in range(cols):
            x0, x1, y0, y1 = xs[0][i], xs[1][i], ys[0][j], ys[1][j]
            c = lum[y0:y1, x0:x1]
            med = np.median(c)
            while x1 - x0 > 8 and c[:, 0].mean() < med * 0.3:
                x0 += 1; c = lum[y0:y1, x0:x1]
            while x1 - x0 > 8 and c[:, -1].mean() < med * 0.3:
                x1 -= 1; c = lum[y0:y1, x0:x1]
            while y1 - y0 > 8 and c[0].mean() < med * 0.3:
                y0 += 1; c = lum[y0:y1, x0:x1]
            while y1 - y0 > 8 and c[-1].mean() < med * 0.3:
                y1 -= 1; c = lum[y0:y1, x0:x1]
            out[(i, j)] = img.crop((x0 + 2, y0 + 2, x1 - 2, y1 - 2))
    return out


def wrap_across(img):
    """Make a wall panel repeat across without a seam: if its pattern has a period (arcades,
    pilasters, bars), crop it to whole periods; then cross-fade the last few columns over the
    first so whatever seam is left melts away."""
    a = np.asarray(img.convert("RGBA")).astype(float)
    h, w = a.shape[:2]
    g = a[..., :3].mean(2)
    best, period = None, None
    for s in range(w // 5, w * 4 // 5):
        d = np.abs(g[:, :w - s] - g[:, s:]).mean()
        if best is None or d < best:
            best, period = d, s
    typical = np.abs(g[:, :w // 2] - g[:, w // 2:w // 2 * 2]).mean()
    if best < typical * 0.55:  # a strong repeat: keep whole periods of it
        k = max(1, w // period)
        a = a[:, :k * period]
        w = a.shape[1]
        o = max(4, w // 24)
    else:
        o = max(8, w // 7)
    t = (np.arange(o) / o)[None, :, None]
    head = a[:, :o] * t + a[:, w - o:] * (1 - t)
    a = np.concatenate([head, a[:, o:w - o]], axis=1)
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")


class Out:
    def __init__(self):
        self.data = {"surfaces": [], "doors": [], "arches": [], "signs": []}

    def save_img(self, img, rel):
        path = os.path.join(OUT, BIOME, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        img.save(path, optimize=True)
        return f"{BIOME}/{rel}".replace("\\", "/")

    def surface(self, sid, img, kind, source, **extra):
        rgb = img.convert("RGB") if kind != "decal" and "iron" not in sid else img.convert("RGBA")
        tx, ty = tiling(rgb)
        self.data["surfaces"].append(dict(id=sid, file=self.save_img(rgb, f"{kind}s/{sid}.png"), kind=kind, source=source,
                                          size=list(rgb.size), tile_x=tx, tile_y=ty, color=mean_color(rgb), **extra))

    def save(self):
        with open(os.path.join(OUT, "biome.json"), "w") as f:
            json.dump(self.data, f, indent=1)


def numbered(manifest, category, key):
    """{number: name} from a manifest's sprite ids (e.g. door_02_iron_grille_SE_closed)."""
    out = {}
    for a in manifest["assets"]:
        if a["category"] != category:
            continue
        n = int(a["id"].split("_")[1])
        out.setdefault(n, a.get(key) or a.get("design") or a["name"])
    return out


def main(base):
    out = Out()
    for pack, folder in PACKS.items():
        src = os.path.join(base, folder, "source_art")
        man = json.load(open(os.path.join(base, folder, "manifest.json")))
        rel = lambda p: f"{folder}/source_art/{p}"  # noqa: E731
        # floors
        for a in man["assets"]:
            if a["category"] != "floors":
                continue
            n = int(a["id"].split("_")[1])
            name = a["name"]
            fn = f"normalized/floor_{n:02d}.png" if pack == "town" else f"floor_uv_{n:02d}.png"
            img = Image.open(os.path.join(src, fn))
            if a.get("seamless_self_repeat"):
                out.surface(f"{pack}_{name}", img, "floor", rel(fn))
            else:
                out.surface(f"{pack}_decal_{name}", img, "decal", rel(fn))
        # walls
        sheet, sets, sides = WALL_SHEETS[pack]
        cut = cells(Image.open(os.path.join(src, sheet)), len(sets), 2)
        for (i, j), img in cut.items():
            if not sets[i]:
                continue
            s = WALL_H / img.height
            img = img.resize((round(img.width * s), WALL_H), Image.BOX)
            img = wrap_across(img)
            prefix = "cathedral" if pack == "cathedral_graveyard" else pack
            sid = f"{prefix}_wall_{sets[i]}" + ("" if sides[j] == "front" else f"_{sides[j]}")
            if pack == "town" and j == 0:
                sid = f"town_wall_{sets[i]}"  # the flat painting replaces the un-projected one
            if sets[i] == "cemetery_iron":  # the railing stands against nothing: cut it out
                img = railing_alpha(img)
            out.surface(sid, img, "wall", rel(sheet), wall_set=sets[i], side=sides[j], pack=pack)
        # roofs
        if pack == "town":
            for k, name in enumerate(ROOFS):
                fn = f"normalized/roof_{k + 1:02d}.png"
                out.surface(f"town_roof_{name}", Image.open(os.path.join(src, fn)), "roof", rel(fn))
        # doors
        designs = numbered(man, "doors", "door_design")
        for n, design in sorted(designs.items()):
            d = "normalized/" if pack == "town" else ""
            files = {}
            for face in ("front", "back"):
                fn = f"{d}door_{n}_{face}.png"
                img = Image.open(os.path.join(src, fn)).convert("RGBA")
                files[face] = out.save_img(img, f"doors/{pack}_{design}_{face}.png")
            out.data["doors"].append(dict(id=f"{pack}_{design}", design=design, pack=pack, size=list(img.size),
                                          holes=bool((np.asarray(img)[..., 3] < 128).mean() > 0.04), **files))
        # arches (and the town's gateways)
        if pack == "town":
            arches = {n: (d, f"normalized/gateway_{n}") for n, d in numbered(man, "gateways", "design").items()}
        else:
            arches = {}
            for a in man["assets"]:
                if a["category"] == "arches" and a.get("source_front"):
                    n = int(os.path.basename(a["source_front"]).split("_")[1])
                    arches[n] = (a["arch_design"], f"arch_{n}")
        for n, (design, stem) in sorted(arches.items()):
            files = {}
            for face in ("front", "back"):
                img = Image.open(os.path.join(src, f"{stem}_{face}.png")).convert("RGBA")
                files[face] = out.save_img(img, f"arches/{pack}_{design}_{face}.png")
            meta = next(a for a in man["assets"] if a["category"] in ("arches", "gateways") and (a.get("arch_design") or a.get("design")) == design)
            out.data["arches"].append(dict(id=f"{pack}_{design}", design=design, pack=pack, size=list(img.size),
                                           span_tiles=meta.get("outer_span_tiles", meta.get("span_tiles", 3)),
                                           **opening(img), **files))
        # shop signs
        if pack == "town":
            for n, shop in sorted(numbered(man, "signs", "shop").items()):
                fn = f"normalized/sign_{n:02d}.png"
                img = Image.open(os.path.join(src, fn)).convert("RGBA")
                out.data["signs"].append(dict(id=f"sign_{shop}", shop=shop, size=list(img.size),
                                              file=out.save_img(img, f"signs/sign_{shop}.png")))
    out.save()
    d = out.data
    kinds = {}
    for s in d["surfaces"]:
        kinds[s["kind"]] = kinds.get(s["kind"], 0) + 1
    print("surfaces", kinds, "| doors", len(d["doors"]), "| arches", len(d["arches"]), "| signs", len(d["signs"]))


def opening(img):
    """An arch's opening, in px: the clear gap along its foot (the widest see-through run in
    the bottom rows, between the piers) and how high it reaches at its middle; and where the
    masonry stands on the ground (its bottom-most opaque row)."""
    a = np.asarray(img)[..., 3] > 127
    rows = np.nonzero(a.any(1))[0]
    foot = int(rows.max())
    y = foot - 2
    best = (0, 0)
    x = 0
    w = a.shape[1]
    cols = np.nonzero(a[y])[0]
    lo, hi = int(cols.min()), int(cols.max())
    x = lo
    while x <= hi:
        if not a[y, x]:
            e = x
            while e + 1 <= hi and not a[y, e + 1]:
                e += 1
            if e - x > best[1] - best[0]:
                best = (x, e + 1)
            x = e + 1
        else:
            x += 1
    mid = (best[0] + best[1]) // 2 if best[1] > best[0] else w // 2
    top = y
    while top > 0 and not a[top - 1, mid]:
        top -= 1
    return dict(opening_px=[best[0], best[1], foot + 1 - top], foot_px=foot + 1, bounds_px=[lo, int(rows.min()), hi + 1, foot + 1])


def railing_alpha(img):
    """The cemetery railing is painted against near-black: that black is the gaps between the
    bars (above the low stone plinth, which stays solid)."""
    a = np.asarray(img.convert("RGBA")).copy()
    h = a.shape[0]
    lum = a[..., :3].astype(float).mean(2)
    plinth = h  # the first row from the bottom up that is mostly dark: the railing starts there
    for y in range(h - 1, 0, -1):
        if (lum[y] < 28).mean() > 0.35:
            plinth = y + 1
            break
    gap = (lum < 30)
    gap[plinth:] = False
    a[..., 3] = np.where(gap, 0, 255)
    return Image.fromarray(a, "RGBA")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "F:/!  VELSCOUR/AI ASSETS/Biome Packs")
