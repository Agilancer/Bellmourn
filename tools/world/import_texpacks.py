"""Cut the Bellmourn texture packs (the October 2026 zips) into a library of tiles.

    python tools/world/import_texpacks.py cut <zip or folder> [<zip or folder> ...]
    python tools/world/import_texpacks.py publish

`cut` reads each pack (a zip, or the folder it was unzipped to) and writes every tile into
art/_texlib/<pack>/<set>/<id>.jpg, with art/_texlib/texlib.json listing them all and a contact
sheet per set (art/_texlib/<pack>/<set>.contact.jpg) for browsing. art/_texlib is in the repo
but, as its name starts with an underscore, GitHub Pages (Jekyll) leaves it out of the
published site: the site is near Pages' 1 GB limit, and the game only needs the tiles it uses.

`publish` copies the tiles the game uses (tools/world/texpicks.json: ids, optionally a size)
to assets/textures/packs/ and writes assets/textures/packs.json, which src/fps/lib.js merges
into the texture library (as surfaces only ever asked for by name: take() passes them by).

The packs:
- castle-stone-30-sheets, castle-texture-sheet-previews, interior-textures-45-sheets,
  mythical-textures-30-sheets, natural-rock-30-sheets: sheets of ten tiles, 5 across by 2
  down, between magenta gutters.
- matched-rock-faces-40-sheets: two big rock faces a sheet, each matched in colour to one of
  the outdoor ground sheets (gravels, dirts, sands).
- bellmourn-object-texture-maps: ten atlases of flat patches (crate faces, chest fronts, lids
  and ends, pottery wraps, lids, hinges, trims) of every size between magenta gutters, for
  the prop models (tools/models/texprops.py). Patches are cut as they are: they don't tile.

The tiles were painted seamless: each repeats with the period of the sheet's grid, and the
magenta lines were drawn over the joins. So each tile is cut on its repeat, from the middle of
one line to the middle of the next, and only what the line covered is painted back: the few
pixels hidden along each join are filled across from the pixels either side of it (the join
lies in the middle of the tile once it's rolled by half, so the two sides are those that meet
when it repeats). Nothing else is done to the painting: no trimming, no re-wrapping, no
flattening of its light or colour. A stray speck of gutter pink inside a tile is painted out.
Each tile records its seam score (1.0 = the join is no more of an edge than any other pair of
neighbouring pixels); the object patches, which don't repeat, are cut inside their gutters.
"""
import io
import json
import os
import re
import sys
import zipfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
LIB = os.path.join(ROOT, "art", "_texlib")
PUB = os.path.join(ROOT, "assets", "textures", "packs")
PICKS = os.path.join(HERE, "texpicks.json")

# pack folder/zip name -> (id prefix, kind, layout, nominal tile size: they're kept as painted)
PACKS = {
    "castle-stone-30-sheets": ("stone", "masonry", "grid", 384),
    "castle-texture-sheet-previews": ("keep", "masonry", "grid", 384),
    "interior-textures-45-sheets": ("int", "interior", "grid", 384),
    "mythical-textures-30-sheets": ("myth", "mythic", "grid", 384),
    "natural-rock-30-sheets": ("rock", "rock", "grid", 384),
    "matched-rock-faces-40-sheets": ("cliff", "cliff", "grid", 768),
    "bellmourn-object-texture-maps": ("obj", "patch", "atlas", 0),
}


# --- reading the packs -------------------------------------------------------------------

def sheets_in(src):
    """(name, PIL image) for every PNG sheet in a pack zip or folder, sorted by name."""
    out = []
    if os.path.isdir(src):
        for dp, _, fs in os.walk(src):
            for f in fs:
                if f.lower().endswith(".png") and "contact" not in f.lower():
                    out.append((f, Image.open(os.path.join(dp, f)).convert("RGB")))
    else:
        with zipfile.ZipFile(src) as z:
            for n in z.namelist():
                f = os.path.basename(n)
                if f.lower().endswith(".png") and "contact" not in f.lower():
                    out.append((f, Image.open(io.BytesIO(z.read(n))).convert("RGB")))
    return sorted(out, key=lambda t: t[0])


def pack_of(src):
    base = os.path.basename(os.path.normpath(src))
    base = re.sub(r"\.zip$", "", base, flags=re.I)
    if base not in PACKS:
        raise SystemExit(f"unknown pack {base!r} (expected one of {', '.join(PACKS)})")
    return base


# --- gutters -----------------------------------------------------------------------------

def pinkness(a):
    """How magenta each pixel is: 0 for anything not pink, up to ~1 for #FF00FF."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lo = np.minimum(r, b)
    return np.clip((lo - g - 40) / 160.0, 0, 1) * np.clip((lo - 90) / 100.0, 0, 1) * (np.abs(r - b) < 110)


def runs(mask, min_len):
    """[start, end) runs of False in a 1D bool array at least min_len long."""
    out, i, n = [], 0, len(mask)
    while i < n:
        if mask[i]:
            i += 1
            continue
        j = i
        while j < n and not mask[j]:
            j += 1
        if j - i >= min_len:
            out.append((i, j))
        i = j
    return out


def gutter_lines(mask_1d, min_gap=60):
    """The middle of each gutter line along one axis (runs of mostly-pink rows or columns)."""
    idx = np.flatnonzero(mask_1d)
    if not len(idx):
        return []
    out, s0, prev = [], idx[0], idx[0]
    for i in idx[1:]:
        if i != prev + 1:
            out.append((s0, prev))
            s0 = i
        prev = i
    out.append((s0, prev))
    mids = [(a + b) / 2 for a, b in out]
    # (the sheet's own edge cuts its outer lines in half: put those a period out from the next)
    keep = [m for i, m in enumerate(mids) if i == 0 or m - mids[i - 1] > min_gap]
    return keep


def grid_cells(a):
    """Cell rectangles (x0, y0, x1, y1) of a sheet laid out in rows and columns between magenta
    lines, each from the middle of one line to the middle of the next: the tile's whole repeat.
    (The lines are found on whole rows and columns, so pink-violet crystal can't make one.)"""
    p = pinkness(a) > 0.35
    H, W = p.shape
    xs = gutter_lines(p.mean(0) > 0.3)
    ys = gutter_lines(p.mean(1) > 0.3)

    def spans(ms, n):
        # every gap between lines; the outer lines (half cut off by the sheet's edge) are moved
        # to sit one period out from their neighbour, the period taken from the inner gaps
        if len(ms) < 2:
            return [(0, n)]
        gaps = np.diff(ms)
        inner = gaps[1:-1] if len(gaps) > 2 else gaps
        per = float(np.median(inner))
        ms = list(ms)
        if abs(gaps[0] - per) > 2:
            ms[0] = ms[1] - per
        if abs(gaps[-1] - per) > 2:
            ms[-1] = ms[-2] + per
        return [(int(round(ms[i])), int(round(ms[i + 1]))) for i in range(len(ms) - 1)]

    return [(x0, y0, x1, y1) for (y0, y1) in spans(ys, H) for (x0, x1) in spans(xs, W)]


def atlas_cells(a):
    """Patch rectangles of an atlas whose patches are of every size: the connected regions
    that aren't gutter, each taken as the rectangle it fills."""
    p = pinkness(a) > 0.3
    p = ndimage.binary_dilation(p, iterations=1)
    lab, n = ndimage.label(~p)
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None:
            continue
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        w, h = x1 - x0, y1 - y0
        if w < 14 or h < 14:
            continue
        fill = (lab[sl] == i).mean()
        if fill < 0.8:   # (not a rectangle: a scrap of halo between gutters)
            continue
        out.append((x0, y0, x1, y1))
    # reading order: rows of patches top to bottom (patches whose tops are within a few pixels
    # count as one row), left to right within a row
    out.sort(key=lambda r: (r[1] // 12, r[0]))
    return out


def inset(a, rect, most=20, extra=2):
    """Shrink a cell until none of its four edges still carries the pink halo: an edge line
    counts as clean when it is no pinker than the cell's middle, and its colour leans no further
    toward magenta than the middle's does, give or take the cell's own variation (the halo's
    outer rows tint blue-grey rock purple and white plaster rose without ever looking pink, and
    on the sheets' outer edges the tint runs a good 15 px in). (Not by darkness: timber-framed
    plaster and panelling run dark beams along their edges on purpose.) Then `extra` more."""
    x0, y0, x1, y1 = rect
    pk = pinkness(a)
    mg = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]     # how far toward magenta a colour leans
    mid = (slice(y0 + (y1 - y0) // 4, y1 - (y1 - y0) // 4), slice(x0 + (x1 - x0) // 4, x1 - (x1 - x0) // 4))
    p0 = pk[mid].mean() + 0.01
    m0 = mg[mid].mean()
    tol = 2.5 + 2.0 * max(mg[mid].mean(1).std(), mg[mid].mean(0).std())

    def bad(p_line, m_line):
        return p_line.mean() > p0 * 2 + 0.01 or (p_line > 0.5).mean() > 0.02 or m_line.mean() - m0 > tol

    for _ in range(most):
        moved = False
        if bad(pk[y0:y1, x0], mg[y0:y1, x0]): x0 += 1; moved = True
        if bad(pk[y0:y1, x1 - 1], mg[y0:y1, x1 - 1]): x1 -= 1; moved = True
        if bad(pk[y0, x0:x1], mg[y0, x0:x1]): y0 += 1; moved = True
        if bad(pk[y1 - 1, x0:x1], mg[y1 - 1, x0:x1]): y1 -= 1; moved = True
        if not moved:
            break
    return (x0 + extra, y0 + extra, x1 - extra, y1 - extra)


# --- tiles ---------------------------------------------------------------------------

def crop_wrap(a, rect):
    """A rectangle of the sheet; where it runs past the sheet's edge (an outer cell, its line
    half off the sheet), the pixels are taken across the tile's repeat instead."""
    x0, y0, x1, y1 = rect
    H, W = a.shape[:2]
    w, h = x1 - x0, y1 - y0
    xs = np.arange(x0, x1)
    ys = np.arange(y0, y1)
    xs = np.where(xs < 0, xs + w, np.where(xs >= W, xs - w, xs))
    ys = np.where(ys < 0, ys + h, np.where(ys >= H, ys - h, ys))
    return a[np.ix_(np.clip(ys, 0, H - 1), np.clip(xs, 0, W - 1))]


def fill_join(u, band=9):
    """Paint back what the magenta line covered along the tile's edges. The tile is rolled by
    half so its joins cross its middle; there, every pixel the line touched (pink, or within a
    couple of pixels of pink: the sheet's compression left a dark green ringing along the
    line's edges, and within `band` of the join) is filled with the clean texture either side
    of the gap mirrored in across it, so the gap keeps the grain round it rather than a smear:
    rows first across the upright join, then columns across the level one."""
    H, W = u.shape[:2]
    r = np.roll(u, (H // 2, W // 2), axis=(0, 1)).copy()
    pk = pinkness(r) > 0.04
    near_v = np.zeros((H, W), bool)
    near_v[:, W // 2 - band:W // 2 + band] = True
    near_h = np.zeros((H, W), bool)
    near_h[H // 2 - band:H // 2 + band, :] = True
    bad = ndimage.binary_dilation(pk, iterations=2) & (near_v | near_h)

    def mend(line, gap, lo, hi):
        """Fill line[gap] (one run between clean ends a and b) with the texture beside it
        mirrored in across it from both sides and blended across the gap (each side's copy
        weighted by how near it is). (A sharp switch in the middle, or a straight copy, shows as
        a fold or a doubled mortar line; the blend joins cleanly, at the cost of a little of the
        grain in the middle of the strip.)"""
        idx = np.flatnonzero(gap[lo:hi]) + lo
        if not len(idx):
            return False
        a, b = idx.min() - 1, idx.max() + 1
        n = len(line)
        src = line.copy()
        for y in range(a + 1, b):
            near = src[min(n - 1, max(0, 2 * a - y + 1))]
            far = src[min(n - 1, max(0, 2 * b - y - 1))]
            w = (y - a) / (b - a)
            line[y] = near * (1 - w) + far * w
        gap[a + 1:b] = False
        return True

    for y in range(H):     # across the upright join, along each row (not the level band's rows)
        if (bad[y] & near_h[y]).sum() > 2 * band + 6:
            continue
        mend(r[y], bad[y], W // 2 - band - 2, W // 2 + band + 2)
    for x in range(W):     # across the level join, along each column (and the crossing)
        mend(r[:, x], bad[:, x], H // 2 - band - 2, H // 2 + band + 2)
    return np.roll(r, (-(H // 2), -(W // 2)), axis=(0, 1))


def seam_score(a):
    """How much of an edge the wrap makes, against the texture's own changes (1.0 = none to
    speak of; the ground importer's limit was 1.35). The worse of two measures on either axis:
    the fine detail (does a mortar line or a grain break off at the wrap?), and bands a few
    pixels wide (is one side of the wrap lighter or darker than the other, which repeats into
    a stripe across a wall?), each against the same measure between neighbours inside."""
    g = a.mean(2)
    hp = g - ndimage.gaussian_filter(g, 2.0, mode="wrap")
    out = 0.0
    for gg, hh in ((g, hp), (g.T, hp.T)):
        fine = np.abs(hh[:, 0] - hh[:, -1]).mean() / max(np.abs(np.diff(hh, axis=1)).mean(), 1e-6)
        strip = lambda k: ndimage.gaussian_filter1d(gg[:, k:k + 3].mean(1), 3.0, mode="wrap")
        W = gg.shape[1]
        seam = np.abs(strip(0) - strip(W - 3)).mean()
        base = np.mean([np.abs(strip(k) - strip(k + 3)).mean() for k in range(8, W - 14, 9)])
        out = max(out, fine, seam / max(base, 1e-6))
    return float(out)


def despeckle(u):
    """Paint out the generator's stray specks of gutter pink inside a tile (small spots only:
    the crystal cavern's violet veins and the astral sanctum's stars are left alone), each
    from the colours round it."""
    spot = pinkness(u) > 0.15
    lab, n = ndimage.label(ndimage.binary_dilation(spot, iterations=1))
    if not n:
        return u
    sizes = ndimage.sum(spot, lab, range(1, n + 1))
    small = np.isin(lab, 1 + np.flatnonzero(sizes < 40))
    if not small.any():
        return u
    keep = ~small
    out = u.copy()
    for c in range(3):
        num = ndimage.gaussian_filter(u[..., c] * keep, 3.0)
        den = ndimage.gaussian_filter(keep.astype(float), 3.0)
        out[..., c] = np.where(small, num / np.maximum(den, 1e-3), u[..., c])
    return out


def make_tile(a, rect, pinkish=False):
    """Cell of the sheet (float array) -> (seamless tile, seam score)."""
    u = fill_join(crop_wrap(a, rect))
    if not pinkish:
        u = despeckle(u)
    u = np.clip(u, 0, 255)
    return u, seam_score(u)


# --- the library -------------------------------------------------------------------------

def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def set_and_sheet(pack, fname):
    """(set name, sheet tag) from a sheet's file name."""
    stem = re.sub(r"\.png$", "", fname, flags=re.I)
    if pack == "castle-texture-sheet-previews":
        m = re.match(r"(\d\d)-(.*?)(-preview)?$", stem)
        return f"{m.group(1)}_{slug(m.group(2))}", ""
    if pack == "matched-rock-faces-40-sheets":
        m = re.match(r"(\d\d)-(.*)-(\d\d)-rock-(\d\d)$", stem)
        return f"{m.group(1)}_{slug(m.group(2))}", f"{int(m.group(3))}{int(m.group(4))}"
    if pack == "bellmourn-object-texture-maps":
        m = re.match(r"(\d\d)-(.*)$", stem)
        return f"{m.group(1)}_{slug(m.group(2))}", ""
    m = re.match(r"(\d\d)-(.*)-(\d\d)$", stem)
    return f"{m.group(1)}_{slug(m.group(2))}", str(int(m.group(3)))


def contact(files, out, cols=10, th=128):
    ims = [Image.open(f).convert("RGB") for f in files]
    rows = (len(ims) + cols - 1) // cols
    M = Image.new("RGB", (cols * (th + 4), rows * (th + 16)), (24, 22, 26))
    d = ImageDraw.Draw(M)
    for k, (im, f) in enumerate(zip(ims, files)):
        x, y = (k % cols) * (th + 4), (k // cols) * (th + 16)
        im.thumbnail((th, th))
        M.paste(im, (x, y + 14))
        d.text((x + 2, y + 1), os.path.basename(f)[:-4][-16:], fill=(230, 220, 120))
    M.save(out, quality=82)


def cut(srcs):
    os.makedirs(LIB, exist_ok=True)
    path = os.path.join(LIB, "texlib.json")
    lib = json.load(open(path)) if os.path.exists(path) else {"packs": {}, "tiles": []}
    for src in srcs:
        pack = pack_of(src)
        prefix, kind, layout, size = PACKS[pack]
        lib["tiles"] = [t for t in lib["tiles"] if t["pack"] != pack]
        sheets = sheets_in(src)
        made, bysets = [], {}
        for fname, img in sheets:
            a = np.asarray(img, np.float64)
            setname, tag = set_and_sheet(pack, fname)
            cells = grid_cells(a) if layout == "grid" else atlas_cells(a)
            od = os.path.join(LIB, pack, setname)
            os.makedirs(od, exist_ok=True)
            for n, rect in enumerate(cells, 1):
                cid = f"{prefix}_{setname}" + (f"_{tag}" if tag else "") + f"_{n:02d}"
                rel = f"{pack}/{setname}/{cid}.jpg"
                if layout == "grid":
                    r = rect
                    t, sc = make_tile(a, rect, pinkish=bool(re.search(r"crystal|astral|fae", setname)))
                    im = Image.fromarray(t.astype(np.uint8))
                    tx = ty = sc < 1.6
                else:
                    r = inset(a, rect)
                    im, sc, tx, ty = img.crop(r), None, False, False
                im.save(os.path.join(LIB, rel), quality=90, optimize=True)
                rec = dict(id=cid, file=rel, pack=pack, set=setname, kind=kind, sheet=fname,
                           rect=[int(v) for v in r], size=list(im.size), tile_x=bool(tx), tile_y=bool(ty),
                           color="#%02x%02x%02x" % tuple(int(v) for v in np.asarray(im, float).reshape(-1, 3).mean(0)))
                if sc is not None:
                    rec["seam"] = round(sc, 2)
                made.append(rec)
                bysets.setdefault(setname, []).append(os.path.join(LIB, rel))
            print(f"  {fname}: {len(cells)} {'tiles' if layout == 'grid' else 'patches'}")
        for s, fs in bysets.items():
            contact(fs, os.path.join(LIB, pack, f"{s}.contact.jpg"), cols=10 if layout == "grid" else 12)
        lib["tiles"] += made
        lib["packs"][pack] = dict(prefix=prefix, kind=kind, layout=layout, size=size, sheets=len(sheets), tiles=len(made))
        seams = [t["seam"] for t in made if "seam" in t]
        if seams:
            ok = sum(s < 1.6 for s in seams)
            print(f"{pack}: {len(made)} tiles from {len(sheets)} sheets, {ok} seamless (median seam {np.median(seams):.2f})")
        else:
            print(f"{pack}: {len(made)} patches from {len(sheets)} sheets")
    lib["tiles"].sort(key=lambda t: (t["pack"], t["id"]))
    with open(path, "w") as f:
        json.dump(lib, f, indent=1)


def publish():
    """Copy the tiles the game uses into assets/textures/packs/ and list them in packs.json."""
    picks = json.load(open(PICKS))
    lib = {t["id"]: t for t in json.load(open(os.path.join(LIB, "texlib.json")))["tiles"]}
    os.makedirs(PUB, exist_ok=True)
    keep, surfaces = set(), []
    for p in picks["surfaces"]:
        p = {"id": p} if isinstance(p, str) else p
        t = lib[p["id"]]
        im = Image.open(os.path.join(LIB, t["file"])).convert("RGB")
        if p.get("size") and p["size"] != im.size[0]:
            im = im.resize((p["size"], p["size"]), Image.LANCZOS)
        rel = f"packs/{t['id']}.jpg"
        im.save(os.path.join(PUB, f"{t['id']}.jpg"), quality=90, optimize=True)
        keep.add(f"{t['id']}.jpg")
        surfaces.append(dict(id=t["id"], file=rel, kind="pack_" + t["kind"], pack=t["pack"], set=t["set"],
                             size=list(im.size), tile_x=t["tile_x"], tile_y=t["tile_y"], color=t["color"]))
    for f in os.listdir(PUB):
        if f.endswith(".jpg") and f not in keep:
            os.remove(os.path.join(PUB, f))
    with open(os.path.join(ROOT, "assets", "textures", "packs.json"), "w") as f:
        json.dump(dict(surfaces=surfaces), f, indent=1)
    print(f"{len(surfaces)} pack surfaces published")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "cut":
        cut(sys.argv[2:])
    elif len(sys.argv) == 2 and sys.argv[1] == "publish":
        publish()
    else:
        print(__doc__)
