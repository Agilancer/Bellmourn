"""Import painted creature sheets from ChatGPT straight into the game.

    python tools/templates/import_creatures.py bell_ogre_painted.zip [more.zip | folder ...]

Takes zips (zips inside zips too) or folders of painted sheets, named like the templates
(`<id>_<anim>_p<n>.png`). For every creature found it:

  1. lines each sheet up with its template grid (resizes and nudges it if ChatGPT moved it),
  2. cuts out every cell's art box, turns #FF00FF (and leftover cyan guides) transparent,
     drops the pink fringe along the key and snaps every pixel to the locked palette,
  3. trims each frame, keeping its foot anchor, and fills in the mirrored directions,
  4. packs the frames into 2048x2048 atlas pages and writes

       assets/creatures/<id>/atlas_<n>.png
       assets/creatures/<id>/creature.json     (read by src/creature_sprites.js)
       assets/creatures/<id>/preview/<anim>.gif  every direction side by side, real timing
       assets/creatures/index.json             every imported creature

and prints a report: missing sheets, empty frames, art touching the cell edge.

creature.json:
  { id, name, tier, size_class, px_per_m, height_m, tic_rate, pages: ["atlas_0.png", ...],
    anims: { <anim>: { kind, loop, frames: [ { name, tics, events,
             dirs: [ D1..D8: {page, x, y, w, h, ax, ay, flip} ] } ] } },
    corpse: { dirs: [ D1..D8 ] } }
  (x, y, w, h) is the frame in its atlas page; (ax, ay) the foot anchor inside it, already
  mirrored when flip is true. dirs entries are null where a frame was missing.
"""
import io
import json
import os
import re
import sys
import zipfile

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TPL = os.path.join(ROOT, "templates", "creatures")
OUT = os.path.join(ROOT, "assets", "creatures")
PAGE = 2048
PAD = 1

with open(os.path.join(ROOT, "templates", "style", "bellmourn_palette.json")) as _f:
    _pal = json.load(_f)
PALETTE = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)]
                    for h in _pal["colors"][:_pal["key_index"]]], np.int32)


# ----------------------------------------------------------------- input


def collect(paths):
    """Every PNG in the given zips / folders, by lower-case file stem."""
    found = {}

    def add(name, data):
        stem = os.path.splitext(os.path.basename(name))[0].lower()
        stem = re.sub(r"_(template|painted|final)$", "", stem)
        found[stem] = data

    def walk_zip(z):
        for info in z.infolist():
            low = info.filename.lower()
            if low.endswith(".png") and "__macosx" not in low:
                add(info.filename, z.read(info))
            elif low.endswith(".zip"):
                walk_zip(zipfile.ZipFile(io.BytesIO(z.read(info))))

    for p in paths:
        if os.path.isdir(p):
            for dirpath, _, files in os.walk(p):
                for f in files:
                    full = os.path.join(dirpath, f)
                    if f.lower().endswith(".png"):
                        with open(full, "rb") as fh:
                            add(f, fh.read())
                    elif f.lower().endswith(".zip"):
                        walk_zip(zipfile.ZipFile(full))
        elif p.lower().endswith(".zip"):
            walk_zip(zipfile.ZipFile(p))
        elif p.lower().endswith(".png"):
            with open(p, "rb") as fh:
                add(p, fh.read())
        else:
            sys.exit(f"not a zip, png or folder: {p}")
    return found


def load_specs():
    specs = {}
    for cid in sorted(os.listdir(TPL)):
        path = os.path.join(TPL, cid, f"{cid}_sheets.json")
        if os.path.isfile(path):
            with open(path) as f:
                specs[cid] = json.load(f)
    return specs


# ----------------------------------------------------------------- cleaning


def align(img, spec, sheet):
    """Find how far ChatGPT shifted the grid: slide the template's black borders over the
    painted sheet's dark pixels and keep the best offset."""
    a = np.asarray(img, np.int32)
    dark = (a.max(axis=2) < 22).astype(np.int32)  # the borders are pure black
    xs = sorted({c["cell"][0] for c in sheet["cells"]} | {c["cell"][0] + c["cell"][2]
                                                         for c in sheet["cells"]})
    ys = sorted({c["cell"][1] for c in sheet["cells"]} | {c["cell"][1] + c["cell"][3]
                                                         for c in sheet["cells"]})
    cols, rows = dark.sum(axis=0), dark.sum(axis=1)
    h, w = dark.shape

    def best(lines, prof, n):
        def score(o):
            return sum(prof[x + o] for x in lines if 0 <= x + o < n)
        return max(range(-12, 13), key=lambda o: (score(o), -abs(o)))
    # each cell has a 2 px black border inside its rect: test its outermost pixels
    return (best([x for x in xs] + [x - 1 for x in xs], cols, w),
            best([y for y in ys] + [y - 1 for y in ys], rows, h))


def clean(rgb):
    """RGB art box -> RGBA, key and guides transparent, everything else on the palette."""
    a = rgb.astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    key = (r > 150) & (b > 150) & (g < 110) & (abs(r - b) < 100)
    guide = (g > 190) & (b > 190) & (r < 100)
    clear = key | guide
    # leftover black cell border along the box edge (the palette has no black)
    border = a.max(axis=2) < 22
    rim = np.zeros_like(border)
    rim[:3], rim[-3:], rim[:, :3], rim[:, -3:] = True, True, True, True
    clear |= border & rim
    # pink fringe: magenta-ish blends touching the key
    near = np.zeros_like(clear)
    near[1:] |= clear[:-1]
    near[:-1] |= clear[1:]
    near[:, 1:] |= clear[:, :-1]
    near[:, :-1] |= clear[:, 1:]
    pinkish = (r > 110) & (b > 110) & (g < np.minimum(r, b) * 0.62)
    clear |= near & pinkish
    flat = a.reshape(-1, 3)
    idx = np.empty(len(flat), np.int32)
    for s in range(0, len(flat), 65536):  # chunked nearest-colour search
        d = ((flat[s:s + 65536, None, :] - PALETTE[None]) ** 2).sum(axis=2)
        idx[s:s + 65536] = d.argmin(axis=1)
    out = np.zeros(a.shape[:2] + (4,), np.uint8)
    out[..., :3] = PALETTE[idx].reshape(a.shape).astype(np.uint8)
    out[..., 3] = np.where(clear, 0, 255)
    out[clear, :3] = 0
    return out


def cut(img, cell, dx, dy):
    """One cell -> (trimmed RGBA, anchor x, anchor y, touches edge) or None if empty."""
    x, y, w, h = cell["art"]
    box = np.asarray(img.crop((x + dx + 1, y + dy + 1, x + dx + w - 1, y + dy + h - 1)))
    rgba = clean(box)
    alpha = rgba[..., 3] > 0
    if alpha.sum() < 12:  # a few stray pixels are not a frame
        return None
    ys, xs = np.nonzero(alpha)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    edge = x0 == 0 or y0 == 0 or x1 == alpha.shape[1] or y1 == alpha.shape[0]
    ax = cell["anchor"][0] - (x + 1) - x0 + 0.5  # anchor at the centre of its pixel column
    ay = cell["anchor"][1] - (y + 1) - y0 + 1.0  # anchor on the ground line's lower edge
    return Image.fromarray(rgba[y0:y1, x0:x1], "RGBA"), ax, ay, edge


# ----------------------------------------------------------------- packing


def pack(images):
    """Shelf-pack images onto PAGE x PAGE pages. Returns placements and the pages."""
    order = sorted(range(len(images)), key=lambda i: -images[i].height)
    pages, place = [], [None] * len(images)
    x = y = shelf = 0
    for i in order:
        im = images[i]
        w, h = im.width + PAD, im.height + PAD
        if not pages or x + w > PAGE:
            x, y, shelf = 0, y + shelf, 0
        if not pages or y + h > PAGE:
            pages.append(Image.new("RGBA", (PAGE, PAGE), (0, 0, 0, 0)))
            x = y = shelf = 0
        pages[-1].paste(im, (x, y))
        place[i] = (len(pages) - 1, x, y)
        x, shelf = x + w, max(shelf, h)
    # crop the last page to what it uses
    if pages:
        used = pages[-1].getbbox()
        if used:
            pages[-1] = pages[-1].crop((0, 0, _pow2(used[2]), _pow2(used[3])))
    return place, pages


def _pow2(n):
    p = 64
    while p < n:
        p *= 2
    return p


# ----------------------------------------------------------------- import


def import_creature(spec, found, report):
    cid = spec["id"]
    frames = {}  # (anim or "corpse", frame, dir) -> (img, ax, ay)
    resized = []
    for sheet in spec["sheets"]:
        stem = sheet["file"][:-4].lower()
        if sheet["kind"] == "model":
            continue  # reference only
        if stem not in found:
            report.append(f"  MISSING sheet {sheet['file']}")
            continue
        img = Image.open(io.BytesIO(found[stem])).convert("RGB")
        if img.size != tuple(spec["sheet"]):
            resized.append(f"{sheet['file']} {img.size[0]}x{img.size[1]}")
            img = img.resize(tuple(spec["sheet"]), Image.NEAREST)
        dx, dy = align(img, spec, sheet)
        if dx or dy:
            report.append(f"  shifted {sheet['file']} by ({dx}, {dy}) to fit the grid")
        for cell in sheet["cells"]:
            got = cut(img, cell, dx, dy)
            name = sheet["anim"] or "corpse"
            where = f"{name} D{cell['dir']}" + ("" if cell["frame"] is None
                                                 else f" F{cell['frame'] + 1}")
            if got is None:
                report.append(f"  EMPTY {where}")
                continue
            im, ax, ay, edge = got
            if edge:
                report.append(f"  edge  {where}: art touches the cell border (may be cut off)")
            frames[(name, cell["frame"] or 0, cell["dir"])] = (im, ax, ay)
    if resized:
        report.append(f"  resized to 1536x1024: {', '.join(resized)}")
    if not frames:
        return None

    keys = list(frames)
    place, pages = pack([frames[k][0] for k in keys])
    where = {k: place[i] for i, k in enumerate(keys)}
    mirror = {int(k): v for k, v in spec["mirror"].items()}

    def entry(name, f, d):
        flip = False
        if (name, f, d) not in frames and d in mirror:
            d, flip = mirror[d], True
        if (name, f, d) not in frames:
            return None
        im, ax, ay = frames[(name, f, d)]
        page, x, y = where[(name, f, d)]
        return dict(page=page, x=x, y=y, w=im.width, h=im.height,
                    ax=round(im.width - ax if flip else ax, 1), ay=round(ay, 1), flip=flip)

    anims = {}
    for aid, a in spec["anims"].items():
        anims[aid] = dict(kind=a["kind"], loop=a["loop"], frames=[
            dict(name=fr["name"], tics=fr["tics"], events=fr["events"],
                 dirs=[entry(aid, i, d) for d in range(1, 9)])
            for i, fr in enumerate(a["frames"])])
    out = dict(id=cid, name=spec["name"], tier=spec["tier"], size_class=spec["size_class"],
               px_per_m=spec["px_per_m"], height_m=spec["height_m"], tic_rate=spec["tic_rate"],
               pages=[f"atlas_{i}.png" for i in range(len(pages))], anims=anims,
               corpse=dict(dirs=[entry("corpse", 0, d) for d in range(1, 9)]))

    folder = os.path.join(OUT, cid)
    os.makedirs(os.path.join(folder, "preview"), exist_ok=True)
    for f in os.listdir(folder):
        if f.startswith("atlas_") and f.endswith(".png"):
            os.remove(os.path.join(folder, f))
    for i, pg in enumerate(pages):
        pg.save(os.path.join(folder, f"atlas_{i}.png"), optimize=True)
    with open(os.path.join(folder, "creature.json"), "w") as f:
        json.dump(out, f, indent=1)
    write_previews(folder, out, pages)
    return out


def sprite(pages, e):
    im = pages[e["page"]].crop((e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]))
    return im.transpose(Image.FLIP_LEFT_RIGHT) if e["flip"] else im


def write_previews(folder, out, pages):
    """Every direction side by side, feet on one line, at 2x, with real tic timing."""
    scale = 2
    for aid, a in list(out["anims"].items()) + [("corpse", dict(frames=[
            dict(tics=35, dirs=out["corpse"]["dirs"])]))]:
        ents = [e for fr in a["frames"] for e in fr["dirs"] if e]
        if not ents:
            continue
        left = max(e["ax"] for e in ents)
        right = max(e["w"] - e["ax"] for e in ents)
        up = max(e["ay"] for e in ents)
        down = max(e["h"] - e["ay"] for e in ents)
        cw, ch = int(left + right) + 8, int(up + down) + 8
        imgs, times = [], []
        for fr in a["frames"]:
            canvas = Image.new("RGBA", (cw * 8, ch), (28, 26, 30, 255))
            for d, e in enumerate(fr["dirs"]):
                if e:
                    canvas.alpha_composite(sprite(pages, e), (int(d * cw + 4 + left - e["ax"]),
                                                              int(4 + up - e["ay"])))
            imgs.append(canvas.convert("RGB").resize((cw * 8 * scale, ch * scale),
                                                     Image.NEAREST))
            t = fr["tics"] if fr["tics"] > 0 else 35
            times.append(max(20, round(t * 1000 / 35)))
        imgs[0].save(os.path.join(folder, "preview", f"{aid}.gif"), save_all=True,
                     append_images=imgs[1:], loop=0, duration=times)


def main(paths):
    found = collect(paths)
    if not found:
        sys.exit("no PNG sheets found")
    specs = load_specs()
    claimed = set()
    index_path = os.path.join(OUT, "index.json")
    index = {}
    if os.path.isfile(index_path):
        with open(index_path) as f:
            index = json.load(f)
    for cid, spec in specs.items():
        stems = {s["file"][:-4].lower() for s in spec["sheets"]}
        if not stems & set(found):
            continue
        claimed |= stems & set(found)
        report = []
        out = import_creature(spec, found, report)
        n = sum(1 for a in out["anims"].values() for fr in a["frames"]
                for e in fr["dirs"] if e) if out else 0
        print(f"{cid}: " + (f"imported, {n} frame views (mirrors included) on {len(out['pages'])} "
                            f"atlas page(s)" if out else "NOTHING imported"))
        for line in report:
            print(line)
        if out:
            index[cid] = dict(name=out["name"], tier=out["tier"],
                              path=f"assets/creatures/{cid}/creature.json")
    for stem in sorted(set(found) - claimed):
        print(f"ignored {stem}.png (matches no template)")
    os.makedirs(OUT, exist_ok=True)
    with open(index_path, "w") as f:
        json.dump(dict(sorted(index.items())), f, indent=1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
