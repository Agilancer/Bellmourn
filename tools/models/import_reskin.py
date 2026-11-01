"""Import ChatGPT's painted re-skin (the zip reskin_tool.py packs) onto the game's weapons,
staffs and shields.

    python tools/models/import_reskin.py bellmourn_reskin__velscour.zip [more zips/folders]
        --dry-run         only write the skins and review sheets (templates/reskin/imports/)
        --only a,b        just these model ids
        --skin 512        skin size (default 512 for every model)
        --no-palette      don't snap to the locked palette

Several zips (checkpoints, a pilot, the final) can be given at once: later ones win. Loose
images work too (a folder or zip of ChatGPT's downloads, any names): each is matched to its
model by the shape of its pieces.

Per model: the painting is lined up with its template (reskin_tool.register/refine: ChatGPT
shifts, scales and drifts pieces), every UV island is carried back from the canvas through
its own affine (templates/reskin/pack/manifest.json), colour is averaged over each texel
from the piece's inside only (no magenta fringe), bled past the island edges, snapped to the
palette, written as <id>_texture.png and embedded in the .glb. The six rarity finishes the
game shows (worn, bright, gilded, ancient, bloodforged, frostbound: see src/fps/gear.js) are
remade from the new skin by material (manifest parts[].family), and manifest.json rewritten.
A review sheet per model goes to templates/reskin/imports/<set>/.

Round shields: the models unroll a dished board or boss ring by ring into a strip a few
texels tall, which breaks planks, stripes and hammering into a mosaic. The importer gives
each one a flat disc in the atlas's free space instead (planar_dishes) and moves the .glb's
UVs onto it, so the painted disc is copied across as it was painted. It works from the pack's
data, so it lands in the same place every time and a second import finds its own discs.
"""
import argparse
import copy
import io
import json
import os
import re
import struct
import sys
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(os.path.dirname(HERE))
PACKDATA = os.path.join(ROOT, "templates", "reskin", "pack")
ITEMS = os.path.join(ROOT, "templates", "models", "items")
IMPORTS = os.path.join(ROOT, "templates", "reskin", "imports")

import reskin_tool as T  # noqa: E402

T.HERE = PACKDATA  # the pack's data as committed (manifest, templates, island maps)
LAYOUT_RES = T.LRES
FINISH_ORDER = ("worn", "bright", "gilded", "ancient", "bloodforged", "frostbound")
FINISH_NAMES = dict(worn="Worn", bright="Bright", gilded="Gilded", ancient="Ancient Bronze",
                    bloodforged="Bloodforged", frostbound="Frostbound")


# ------------------------------------------------------------------ reading the return

def gather(paths):
    """{job id: (image bytes, where from)} from zips, nested zips, folders and loose files;
    later paths win. Images that don't name their model are matched by layout."""
    found, loose, info = {}, [], {}

    def take(name, data, where):
        base = os.path.basename(name)
        low = name.replace("\\", "/").lower()
        if "__macosx" in low or base.startswith("."):
            return
        if base == "RESKIN.json":
            info.update(json.loads(data))
            return
        if not base.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            return
        if "/checks/" in "/" + low or "__check" in low or "__card" in low or "material_board" in low:
            return
        try:
            j = T.job(base)
            found[j["id"]] = (data, where)
        except KeyError:
            loose.append((data, where))

    def walk_zip(zf, where):
        for zi in zf.infolist():
            if zi.is_dir():
                continue
            data = zf.read(zi)
            if zi.filename.lower().endswith(".zip"):
                walk_zip(zipfile.ZipFile(io.BytesIO(data)), f"{where}/{zi.filename}")
            else:
                take(zi.filename, data, f"{where}/{zi.filename}")

    for p in paths:
        if os.path.isdir(p):
            for d, _, fs in os.walk(p):
                for f in sorted(fs):
                    with open(os.path.join(d, f), "rb") as fh:
                        take(os.path.join(d, f), fh.read(), os.path.join(d, f))
        elif p.lower().endswith(".zip"):
            walk_zip(zipfile.ZipFile(p), os.path.basename(p))
        else:
            with open(p, "rb") as fh:
                take(p, fh.read(), p)
    for data, where in loose:
        j, sc, second = T.identify(data)
        if sc < 0.45 or sc - second < 0.04:
            print(f"  ? {where}: can't tell which model this is (best {j['id']} {sc:.2f}, "
                  f"next {second:.2f}); skipped. Rename it <id>.png and run again.")
            continue
        print(f"  {where}: matched to {j['id']} by its layout ({sc:.2f})")
        found[j["id"]] = (data, where)
    return found, info


# ------------------------------------------------------------------ painting -> skin

def canvas_coords(meta, lx, ly):
    """Where layout points (texels) of an island sit on the canvas. -> (cx, cy, canvas px per
    layout texel). Most islands move by one affine (`M`); a projected dish (`warp`) moves
    triangle by triangle (points between triangles take the nearest one)."""
    if meta["M"] is not None:
        M = np.asarray(meta["M"])
        return (M[0, 0] * lx + M[0, 1] * ly + M[0, 2], M[1, 0] * lx + M[1, 1] * ly + M[1, 2],
                float(np.sqrt(abs(np.linalg.det(M[:, :2])))))
    w = meta["warp"]
    t, px, cv = np.asarray(w["t"]), np.asarray(w["px"]), np.asarray(w["cv"])
    cx, cy = np.zeros(len(lx)), np.zeros(len(lx))
    best = np.full(len(lx), -np.inf)
    area_l = area_c = 0.0
    for a, b, c in t:
        A, B, C = px[a], px[b], px[c]
        det = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1])
        if abs(det) < 1e-12:
            continue
        area_l += abs(det) / 2
        P, Q, R = cv[a], cv[b], cv[c]
        area_c += abs((Q[0] - P[0]) * (R[1] - P[1]) - (Q[1] - P[1]) * (R[0] - P[0])) / 2
        lo = np.minimum(np.minimum(A, B), C) - 0.6
        hi = np.maximum(np.maximum(A, B), C) + 0.6
        sel = np.nonzero((lx >= lo[0]) & (lx <= hi[0]) & (ly >= lo[1]) & (ly <= hi[1]))[0]
        if not len(sel):
            continue
        x, y = lx[sel], ly[sel]
        l1 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / det
        l2 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / det
        l3 = 1 - l1 - l2
        m = np.minimum(np.minimum(l1, l2), l3)
        win = m > best[sel]
        s = sel[win]
        best[s] = m[win]
        cx[s] = l1[win] * P[0] + l2[win] * Q[0] + l3[win] * R[0]
        cy[s] = l1[win] * P[1] + l2[win] * Q[1] + l3[win] * R[1]
    return cx, cy, float(np.sqrt(area_c / max(area_l, 1e-9)))


DISH_MARGIN = 1  # layout texels kept clear around a disc (the skin bleeds 2 past each island)


def _largest_square(free):
    """The largest all-True square in a boolean grid. -> (side, top row, left column)."""
    h, w = free.shape
    dp = np.zeros((h + 1, w + 1), int)
    best = (0, 0, 0)
    for y in range(h):
        for x in range(w):
            if free[y, x]:
                dp[y + 1, x + 1] = 1 + min(dp[y, x], dp[y, x + 1], dp[y + 1, x])
                if dp[y + 1, x + 1] > best[0]:
                    best = (dp[y + 1, x + 1], y, x)
    side, y, x = best
    return side, y - side + 1, x - side + 1


def planar_dishes(j):
    """Round shields: each dished board and boss (the islands the pack carries by `warp`) moved
    onto a flat disc in the atlas's free space, as the canvas shows it (seen from the front),
    the board as large as it fits and the bosses at the same texel density where there's room.
    -> (job with those islands carried by an affine, the island map to use, {island index:
    (triangles, layout texels before, layout texels after)})."""
    uv = np.array(Image.open(os.path.join(PACKDATA, "layouts", f"{j['id']}__uv.png")))
    movers = [k for k, m in enumerate(j["islands"]) if m["warp"] and not m["skip"]]
    if j["kind"] != "shield_round" or not movers:
        return j, uv, {}
    tex = j["layout_tex"]
    n8 = LAYOUT_RES // tex
    # the old strips stay taken, so a disc never lands where a strip's texels were
    occ = uv.reshape(tex, n8, tex, n8).max((1, 3)) > 0
    j = copy.deepcopy(j)
    moves, density = {}, None

    def extent(k):
        cv = np.asarray(j["islands"][k]["warp"]["cv"])
        return float((cv.max(0) - cv.min(0)).max())
    for k in sorted(movers, key=lambda k: -extent(k)):
        w = j["islands"][k]["warp"]
        t = np.asarray(w["t"], int)
        px, cv = np.asarray(w["px"], float), np.asarray(w["cv"], float)
        side, y0, x0 = _largest_square(~occ)
        room = side - 2 * DISH_MARGIN
        if room < 4:
            continue  # no room: it keeps its strip
        s = room / extent(k) if density is None else min(density, room / extent(k))
        density = density or s
        lo = cv.min(0)
        corner = np.array([x0, y0], float) + DISH_MARGIN
        new = (cv - lo) * s + corner
        # canvas = (layout - corner) / s + lo
        j["islands"][k].update(warp=None, M=[[1 / s, 0.0, lo[0] - corner[0] / s],
                                             [0.0, 1 / s, lo[1] - corner[1] / s]])
        moves[k] = (t, px, new)
        uv[uv == k + 1] = 0
        im = Image.fromarray(uv)
        d = ImageDraw.Draw(im)
        for tri in t:
            d.polygon([tuple(p) for p in new[tri] * n8], fill=k + 1)
        uv = np.asarray(im).copy()
        a = np.floor(new.min(0)).astype(int) - DISH_MARGIN
        b = np.ceil(new.max(0)).astype(int) + DISH_MARGIN
        occ[max(a[1], 0):b[1] + 1, max(a[0], 0):b[0] + 1] = True
    return j, uv, moves


def remap_uv(uv, moves, tex):
    """A mesh's UVs (n x 2, 0..1) with the moved dishes' vertices on their discs; vertices are
    found at their old place or (an earlier import) their new one. -> (uv, vertices moved)."""
    uv = np.array(uv, float)
    done = np.zeros(len(uv), bool)
    for t, old, new in moves.values():
        for src in (old / tex, new / tex):
            d = ((uv[:, None, :] - src[None]) ** 2).sum(-1)
            near = d.argmin(1)
            hit = (d[np.arange(len(uv)), near] < 1e-8) & ~done
            uv[hit] = new[near[hit]] / tex
            done |= hit
    return uv, int(done.sum())


def retexcoord(path, moves, tex):
    """Move a .glb's dish vertices onto their discs (TEXCOORD_0 rewritten in place)."""
    js, binary = read_glb(path)
    binary = bytearray(binary)
    p = js["meshes"][0]["primitives"][0]
    a = js["accessors"][p["attributes"]["TEXCOORD_0"]]
    v = js["bufferViews"][a["bufferView"]]
    if a["componentType"] != 5126 or a["type"] != "VEC2" or v.get("byteStride", 8) != 8:
        raise ValueError(f"{path}: TEXCOORD_0 is not packed float pairs")
    o = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    n = a["count"]
    uv = np.frombuffer(bytes(binary[o:o + 8 * n]), np.float32).reshape(n, 2)
    uv, moved = remap_uv(uv, moves, tex)
    want = sum(len(old) for _, old, _ in moves.values())
    if moved != want:
        raise ValueError(f"{path}: found {moved} of the {want} dish vertices to move")
    binary[o:o + 8 * n] = uv.astype(np.float32).tobytes()
    if "min" in a:
        a["min"], a["max"] = uv.min(0).tolist(), uv.max(0).tolist()
    write_glb(path, js, binary)


def _interior(uv, e):
    """Pixels whose whole (2e+1)^2 neighbourhood is the same island."""
    im = Image.fromarray(uv)
    lo = np.asarray(im.filter(ImageFilter.MinFilter(2 * e + 1)))
    hi = np.asarray(im.filter(ImageFilter.MaxFilter(2 * e + 1)))
    return (lo == uv) & (hi == uv) & (uv > 0)


def skin_from_painting(j, painted, G, nudges, size=512, palette=None):
    """The model's texture (size x size) from a painting lined up by (G, nudges)."""
    rgb = np.asarray(T.load_rgb(painted), float)
    uv = island_map(j)
    isl = j["islands"]
    n8 = LAYOUT_RES / j["layout_tex"]
    sx, sy, dx, dy = G
    col = np.zeros(uv.shape + (3,))
    wgt = np.zeros(uv.shape)
    inner = {e: _interior(uv, e) for e in (1, 2, 3, 4)}
    for k, meta in enumerate(isl):
        if meta["skip"]:
            continue
        ys, xs = np.nonzero(uv == k + 1)
        if not len(xs):
            continue
        cx, cy, scale = canvas_coords(meta, (xs + 0.5) / n8, (ys + 0.5) / n8)
        ox, oy = nudges.get(k + 1, (0, 0))
        c = T.bilinear(rgb, sx * cx + dx + ox, sy * cy + dy + oy)
        # sample only the piece's inside: its edge pixels carry magenta blended in (ChatGPT's
        # soft edges); the texels there are filled outward from the inside instead. About
        # 2.5 canvas px of margin, less for thin pieces so they keep a third of their pixels.
        e = int(np.clip(np.ceil(2.5 * n8 / max(scale, 1e-6)), 1, 4))
        while e > 0 and inner[e][ys, xs].mean() < 0.3:
            e -= 1
        if e:
            w = inner[e][ys, xs].astype(float)
        else:  # too thin to keep an inside: drop anything purple-pink (magenta blended in)
            r, g, b = c[:, 0], c[:, 1], c[:, 2]
            w = np.where((np.minimum(r, b) - g > 40) & (np.abs(r - b) < 80), 0.0, 1.0)
        w[T.key_mask(c)] = 0.0  # magenta
        col[ys, xs] = c
        wgt[ys, xs] = w
    k = LAYOUT_RES // size
    wsum = wgt.reshape(size, k, size, k).sum((1, 3))
    csum = (col * wgt[..., None]).reshape(size, k, size, k, 3).sum((1, 3))
    out = np.zeros((size, size, 3))
    have = wsum > 1e-6
    out[have] = csum[have] / wsum[have][:, None]
    parts = part_map(j, size)
    owned = block_islands(uv, size)
    # purple-pink texels are magenta that got through (thin pieces, soft edges) unless the
    # part can be purple: drop them, the neighbours fill in
    fam = {p["number"]: p["family"] for p in j["parts"]}
    may = np.vectorize(lambda n: fam.get(int(n), "") in ("gem", "glow", "cloth", "stone"))(parts)
    r, g, b = out[..., 0], out[..., 1], out[..., 2]
    pink = (np.minimum(r, b) - g > 35) & (np.abs(r - b) < 90) & (np.maximum(r, b) > 80)
    have &= ~(pink & ~may)
    # tiny pieces (not on the canvas) and pieces that came back unpainted: their part's colour
    for p in j["parts"]:
        pm = parts == p["number"]
        got = pm & have
        if got.sum() >= 4:
            mean = out[got].mean(0)
        else:
            mean = np.array([int(p["colour"][i:i + 2], 16) for i in (1, 3, 5)], float)
        fill = pm & ~have & (owned > 0)
        out[fill] = mean
        have |= fill
    out = bleed(out, have, 8)
    if palette is not None:
        out = T.snap(out, palette)
    return out


def block_islands(uv, size):
    """Island index per texel at `size` (the most common one in its block)."""
    k = uv.shape[0] // size
    return uv[k // 2::k, k // 2::k]


def island_map(j):
    """The layout's island index map (LAYOUT_RES square): planar_dishes' when it ran."""
    if "_uv" in j:
        return j["_uv"]
    return np.asarray(Image.open(os.path.join(PACKDATA, "layouts", f"{j['id']}__uv.png")))


def part_map(j, size):
    isl = block_islands(island_map(j), size)
    lut = np.zeros(256, int)
    for k, meta in enumerate(j["islands"]):
        lut[k + 1] = meta["part"]
    return lut[isl]


def bleed(out, have, rings):
    """Empty texels take the mean of their filled neighbours, a ring at a time (no seams when
    the texture is sampled across an island edge)."""
    out, have = out.copy(), have.copy()
    for _ in range(rings):
        grow = np.zeros_like(out)
        cnt = np.zeros(have.shape)
        for oy in (-1, 0, 1):
            for ox in (-1, 0, 1):
                if ox or oy:
                    grow += np.roll(np.roll(out * have[..., None], oy, 0), ox, 1)
                    cnt += np.roll(np.roll(have, oy, 0), ox, 1)
        new = ~have & (cnt > 0)
        out[new] = grow[new] / cnt[new][:, None]
        have |= new
    return out


# ------------------------------------------------------------------ finishes

def _lum(c):
    return c[..., 0] * 0.299 + c[..., 1] * 0.587 + c[..., 2] * 0.114


def grade(c, sat=1.0, gain=1.0, contrast=1.0, tint=None, mix=0.0, pivot=110.0):
    l = _lum(c)[..., None]
    o = l + (c - l) * sat
    o = (o - pivot) * contrast + pivot
    o = o * gain
    if tint is not None:
        o = o * (1 - mix) + np.asarray(tint, float) * (l / 128.0) * mix
    return np.clip(o, 0, 255)


def gmap(c, stops):
    """Recolour by brightness through a ramp of colour stops (dark -> light), keeping the
    painted light and shade: a palette swap that follows the painting."""
    l = _lum(c)
    lo, hi = np.percentile(l, 3), np.percentile(l, 97)
    t = np.clip((l - lo) / max(hi - lo, 40.0), 0, 1)
    stops = np.asarray(stops, float)
    x = t * (len(stops) - 1)
    i = np.clip(np.floor(x).astype(int), 0, len(stops) - 2)
    f = (x - i)[..., None]
    return stops[i] * (1 - f) + stops[i + 1] * f


def _ramp(name, a, b):
    with open(os.path.join(ROOT, "templates", "style", "bellmourn_palette.json")) as f:
        data = json.load(f)
    row = data["ramps"].index(name)
    cols = data["colors"][row * 16 + a: row * 16 + b + 1]
    return [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in cols]


METAL, NOBLE = ("steel", "iron", "silver"), ("gold", "brass", "bronze")
VERDIGRIS = [(22, 30, 26), (44, 72, 60), (96, 80, 46), (150, 106, 58), (204, 160, 104)]
COPPER = [(36, 18, 12), (98, 50, 30), (168, 94, 58), (222, 152, 108)]


def finish_rule(fid, fam, edge):
    """How finish `fid` treats a part of material family `fam`: a function rgb -> rgb."""
    worn_metal = lambda c: grade(c, sat=0.55, gain=0.8, contrast=0.9, tint=(90, 70, 50), mix=0.12)  # noqa: E731
    worn_noble = lambda c: grade(c, sat=0.6, gain=0.74, contrast=0.9, tint=(80, 90, 50), mix=0.15)  # noqa: E731
    bright_metal = lambda c: grade(c, sat=0.8, gain=1.1, contrast=1.25, tint=(200, 215, 235), mix=0.06)  # noqa: E731
    keep = lambda c: c  # noqa: E731
    if fam in ("gem", "glow"):
        return (lambda c: grade(c, sat=1.1)) if fid == "bright" else keep
    if fid == "worn":
        return {**{f: worn_metal for f in METAL}, **{f: worn_noble for f in NOBLE},
                "leather": lambda c: grade(c, sat=0.75, gain=0.82),
                "cloth": lambda c: grade(c, sat=0.75, gain=0.82),
                "wood": lambda c: grade(c, sat=0.8, gain=0.85),
                "bone": lambda c: grade(c, sat=0.8, gain=0.88, tint=(150, 120, 80), mix=0.1),
                }.get(fam, lambda c: grade(c, sat=0.8, gain=0.85))
    if fid == "bright":
        if fam in METAL:
            return bright_metal
        if fam in NOBLE:
            return lambda c: grade(c, sat=1.1, gain=1.1, contrast=1.15)
        return lambda c: grade(c, gain=1.04, contrast=1.08)
    if fid == "gilded":
        if fam in METAL:
            return bright_metal if edge else (lambda c: gmap(c, _ramp("gold", 2, 14)))
        if fam in NOBLE:
            return lambda c: gmap(c, _ramp("gold", 3, 15))
        return {"leather": lambda c: grade(c, gain=0.8), "cloth": lambda c: grade(c, gain=0.9),
                "wood": lambda c: grade(c, gain=0.9)}.get(fam, keep)
    if fid == "ancient":
        if fam in METAL:
            return (lambda c: gmap(c, COPPER)) if edge else (lambda c: gmap(c, VERDIGRIS))
        if fam in NOBLE:
            return worn_noble
        return {"leather": lambda c: grade(c, sat=0.8, gain=0.78),
                "cloth": lambda c: grade(c, sat=0.8, gain=0.8),
                "wood": lambda c: grade(c, gain=0.82),
                "bone": lambda c: grade(c, sat=0.8, gain=0.88, tint=(150, 120, 80), mix=0.1),
                }.get(fam, keep)
    if fid == "bloodforged":
        if fam in METAL:
            return lambda c: gmap(c, _ramp("blood", 1, 12))
        if fam in NOBLE:
            return keep  # gold trim stays gold: the accent on a recoloured piece
        return {"leather": lambda c: gmap(c, [(16, 8, 8), (54, 26, 24), (120, 64, 52)]),
                "wood": lambda c: grade(c, gain=0.8, tint=(110, 30, 26), mix=0.2),
                "cloth": lambda c: grade(c, tint=(130, 30, 30), mix=0.35),
                "bone": lambda c: grade(c, tint=(150, 60, 50), mix=0.12),
                }.get(fam, lambda c: grade(c, gain=0.85, tint=(110, 30, 26), mix=0.15))
    if fid == "frostbound":
        if fam in METAL:
            return lambda c: gmap(c, _ramp("sky", 2, 15))
        if fam in NOBLE:
            return keep
        return {"leather": lambda c: gmap(c, [(14, 16, 24), (52, 62, 84), (110, 124, 150)]),
                "wood": lambda c: grade(c, sat=0.5, gain=0.9, tint=(150, 170, 200), mix=0.2),
                "cloth": lambda c: grade(c, sat=0.6, tint=(150, 186, 220), mix=0.25),
                }.get(fam, lambda c: grade(c, sat=0.7, tint=(190, 210, 235), mix=0.2))
    raise KeyError(fid)


def finishes(j, base, palette=None):
    """{finish id: rgb array} remade from the new skin, part by part."""
    parts = part_map(j, base.shape[0])
    # texels between islands follow their nearest part (they show at island edges)
    filled = bleed(np.where(parts[..., None] > 0, parts[..., None], 0).astype(float),
                   parts > 0, 12)[..., 0].round().astype(int)
    # bloodforged and frostbound keep gold, brass and bronze as the accent on recoloured parts;
    # a model that is mostly one noble part (the sun shield's bronze board, the crosier's gold
    # shaft) would come out unchanged, so that part takes the colour instead
    area = {p["number"]: int((filled == p["number"]).sum()) for p in j["parts"]}
    rest = sum(area[p["number"]] for p in j["parts"] if p["family"] not in NOBLE + ("gem", "glow"))
    noble = [p for p in j["parts"] if p["family"] in NOBLE and area[p["number"]]]
    top = max(noble, key=lambda p: area[p["number"]]) if noble else None
    lead = top["number"] if top and area[top["number"]] > rest else None
    out = {}
    for fid in FINISH_ORDER:
        o = base.copy()
        for p in j["parts"]:
            m = filled == p["number"]
            if m.any():
                fam = p["family"]
                if p["number"] == lead and fid in ("bloodforged", "frostbound"):
                    fam = "steel"
                o[m] = finish_rule(fid, fam, p["edge"])(base[m])
        out[fid] = T.snap(o, palette) if palette is not None else o
    return out


# ------------------------------------------------------------------ the model files

def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    jlen = struct.unpack_from("<I", data, 12)[0]
    js = json.loads(data[20:20 + jlen])
    blen = struct.unpack_from("<I", data, 20 + jlen)[0]
    return js, data[28 + jlen:28 + jlen + blen]


def write_glb(path, js, binary):
    jb = json.dumps(js, separators=(",", ":")).encode()
    jb += b" " * ((4 - len(jb) % 4) % 4)
    binary = bytes(binary) + b"\0" * ((4 - len(binary) % 4) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(binary)))
        f.write(struct.pack("<II", len(jb), 0x4E4F534A) + jb)
        f.write(struct.pack("<II", len(binary), 0x004E4942) + binary)


def embed_png(path, png):
    """Swap the .glb's texture for new PNG bytes, re-laying the binary chunk so the old
    image's bytes go (the file doesn't grow with every import)."""
    js, binary = read_glb(path)
    target = js["images"][0]["bufferView"]
    views = js["bufferViews"]
    out = bytearray()
    for k in sorted(range(len(views)), key=lambda k: views[k].get("byteOffset", 0)):
        v = views[k]
        chunk = png if k == target else binary[v.get("byteOffset", 0):
                                               v.get("byteOffset", 0) + v["byteLength"]]
        while len(out) % 4:
            out.append(0)
        v["byteOffset"] = len(out)
        v["byteLength"] = len(chunk)
        out += chunk
    js["images"][0]["mimeType"] = "image/png"
    js["buffers"][0]["byteLength"] = len(out) + (4 - len(out) % 4) % 4
    write_glb(path, js, out)


def glb_mesh(path):
    """(positions, normals, uvs, triangles) of a .glb's first mesh."""
    js, b = read_glb(path)

    def acc(i):
        a = js["accessors"][i]
        v = js["bufferViews"][a["bufferView"]]
        o = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[a["type"]]
        dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32}[a["componentType"]]
        return np.frombuffer(b, dt, a["count"] * n, o).reshape(a["count"], n).astype(float)
    p = js["meshes"][0]["primitives"][0]
    at = p["attributes"]
    return (acc(at["POSITION"]), acc(at["NORMAL"]), acc(at["TEXCOORD_0"]),
            acc(p["indices"]).astype(int).reshape(-1, 3))


def render(mesh, tex, kind, w, h, yaw=-60, pitch=15, lie=True):
    """The model in a skin, lit like the game (nearest texels): weapons lying tip-right
    (`lie`) or standing."""
    import raster
    from geom import norm
    pos, nrm, uv, tri = mesh
    flip = np.array([1.0, 1.0, -1.0])  # glTF space back to the rig's (z forward), as the
    pos, nrm = pos * flip, nrm * flip  # builders' previews draw it: yaw 180 = a shield's front
    a, b = np.radians(yaw), np.radians(pitch)
    ry = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
    rx = np.array([[1, 0, 0], [0, np.cos(b), -np.sin(b)], [0, np.sin(b), np.cos(b)]])
    rot = rx @ ry
    if lie and not kind.startswith("shield"):
        rot = np.array([[0, 1, 0], [-1, 0, 0], [0, 0, 1.0]]) @ rot  # tip to the right
    c = (pos.max(0) + pos.min(0)) / 2
    p = (pos - c) @ rot.T
    n = nrm @ rot.T
    ext = np.abs(p[:, :2]).max(0) + 1e-6
    f = min(w * 0.46 / ext[0], h * 0.46 / ext[1])
    dist = 10 * np.linalg.norm(ext)
    cam = p + np.array([0, 0, dist])
    ff = f * dist

    def proj(q):
        return (w / 2 + q[0] / q[2] * ff, h / 2 - q[1] / q[2] * ff)
    return raster.zbuffer_textured([cam[t] for t in tri], [uv[t] for t in tri],
                                   [n[t] for t in tri], tex, proj, w, h,
                                   light=norm([-0.45, 0.55, -0.7]), bg=(44, 40, 50), spec=0.25,
                                   shininess=24)


def review(j, painted_canvas, base, fins, mesh, res, out):
    """One sheet per model: the lined-up painting, the new skin, the model in its skin and
    in each finish."""
    import texkit
    shield = j["kind"].startswith("shield")
    W = 1536
    img = Image.new("RGB", (W, 900), (24, 22, 26))
    d = ImageDraw.Draw(img)
    d.text((12, 8), f"{j['job']:02d} {j['name']}  ({j['id']})   check {res['verdict']}  "
           f"painted {res['coverage']:.0%}  fit {res['iou']:.2f}", fill=(240, 220, 170),
           font=texkit.font(18, True))
    for k, r in enumerate(res.get("reasons", [])[:3]):
        d.text((12, 34 + k * 16), "- " + r, fill=(220, 180, 120), font=texkit.font(12))
    can = Image.fromarray(np.clip(painted_canvas, 0, 255).astype(np.uint8)).resize((672, 448))
    img.paste(can, (12, 90))
    sk = Image.fromarray(base.astype(np.uint8)).resize((448, 448), Image.NEAREST)
    img.paste(sk, (700, 90))
    d.text((700, 70), "new skin", fill=(200, 200, 200), font=texkit.font(12))
    d.text((12, 70), "painting, lined up", fill=(200, 200, 200), font=texkit.font(12))
    skins = [("base", base)] + [(f, fins[f]) for f in FINISH_ORDER]
    if shield:
        for k, (name, s) in enumerate(skins):
            t = Image.fromarray(s.astype(np.uint8))
            x = 12 + k * 216
            img.paste(render(mesh, t, j["kind"], 208, 208, yaw=180, pitch=10), (x, 560))
            img.paste(render(mesh, t, j["kind"], 100, 100, yaw=0, pitch=10), (x + 108, 770))
            d.text((x + 4, 562), name, fill=(230, 230, 230), font=texkit.font(12, True))
        d.text((12, 772), "front (big), inside (small)", fill=(160, 160, 160),
               font=texkit.font(12))
        img.paste(render(mesh, Image.fromarray(base.astype(np.uint8)), j["kind"], 360, 448,
                         yaw=200, pitch=15), (1164, 90))
    else:
        tw, th = 372, 108
        for k, (name, s) in enumerate(skins):
            t = Image.fromarray(s.astype(np.uint8))
            x, y = 12 + (k % 4) * (tw + 8), 556 + (k // 4) * (th + 60)
            img.paste(render(mesh, t, j["kind"], tw, th), (x, y))
            d.text((x + 4, y + 2), name, fill=(230, 230, 230), font=texkit.font(12, True))
        img.paste(render(mesh, Image.fromarray(base.astype(np.uint8)), j["kind"], 360, 448,
                         yaw=-30, pitch=10, lie=False), (1164, 90))
    img.save(out)


# ------------------------------------------------------------------ main

def import_one(j, data, args, palette, outdir):
    folder = os.path.join(ITEMS, j["kind"], j["id"])
    img, _ = T.normalize(data)
    res = T.check_image(img, j)
    G, nudges = res.pop("_G"), res.pop("_nudges")
    canvas = res.pop("_canvas")
    j, uvmap, moves = planar_dishes(j)  # (the check above works on the pack's own layout)
    j = dict(j, _uv=uvmap)
    base = skin_from_painting(j, img, G, nudges, args.skin, palette)
    fins = finishes(j, base, palette)
    tag = "" if args.dry_run else "  -> game"
    os.makedirs(outdir, exist_ok=True)
    if args.dry_run:
        Image.fromarray(base.astype(np.uint8)).save(os.path.join(outdir, f"{j['id']}_texture.png"))
        for f, s in fins.items():
            Image.fromarray(s.astype(np.uint8)).save(os.path.join(outdir, f"{j['id']}_{f}.png"))
    else:
        tex = Image.fromarray(base.astype(np.uint8))
        tex.save(os.path.join(folder, f"{j['id']}_texture.png"))
        buf = io.BytesIO()
        tex.save(buf, "PNG", optimize=True)
        with open(os.path.join(folder, "info.json")) as f:
            info = json.load(f)
        for glb in info["files"]:
            if moves:
                retexcoord(os.path.join(folder, glb), moves, j["layout_tex"])
            embed_png(os.path.join(folder, glb), buf.getvalue())
        os.makedirs(os.path.join(folder, "variants"), exist_ok=True)
        info["variants"] = []
        for fid, s in fins.items():
            fn = f"variants/{j['id']}_{fid}.png"
            Image.fromarray(s.astype(np.uint8)).save(os.path.join(folder, fn), optimize=True)
            info["variants"].append(dict(id=fid, name=FINISH_NAMES[fid], file=fn))
        info["skin_size"] = args.skin
        info["reskin"] = dict(set=args.set, verdict=res["verdict"], coverage=res["coverage"])
        with open(os.path.join(folder, "info.json"), "w") as f:
            json.dump(info, f, indent=1)
    mesh = glb_mesh(os.path.join(folder, f"{j['id']}.glb"))
    if moves and args.dry_run:  # the .glb wasn't touched: show it as it would be
        mesh = (mesh[0], mesh[1], remap_uv(mesh[2], moves, j["layout_tex"])[0], mesh[3])
    review(j, canvas, base, fins, mesh, res, os.path.join(outdir, f"{j['job']:02d}__{j['id']}.png"))
    print(f"  {j['job']:02d} {j['id']:<22} {res['verdict']:<5} painted {res['coverage']:.0%}  "
          f"fit {res['iou']:.2f}{tag}" + (f"  ({'; '.join(res['reasons'])})" if res['reasons'] else ""))
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--skin", type=int, default=512, choices=(256, 512, 1024))
    ap.add_argument("--no-palette", action="store_true")
    ap.add_argument("--set", default="")
    args = ap.parse_args()
    found, info = gather(args.paths)
    args.set = args.set or info.get("set") or re.sub(
        r"\W+", "_", os.path.splitext(os.path.basename(args.paths[0]))[0])
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    palette = None if args.no_palette else T.load_palette(
        os.path.join(ROOT, "templates", "style", "bellmourn_palette.json"))
    jobs = [T.job(i) for i in found if not only or i in only]
    jobs.sort(key=lambda j: j["job"])
    outdir = os.path.join(IMPORTS, args.set + ("_dry" if args.dry_run else ""))
    print(f"re-skin set '{args.set}': {len(jobs)} models{' (dry run)' if args.dry_run else ''}")
    results = {}
    for j in jobs:
        data, where = found[j["id"]]
        results[j["id"]] = import_one(j, data, args, palette, outdir)
    if not args.dry_run and jobs:
        import manifest
        manifest.write()
    m = T.load_manifest()
    missing = [x["id"] for x in m["jobs"] if x["id"] not in found]
    fails = [i for i, r in results.items() if r["verdict"] == "FAIL"]
    with open(os.path.join(outdir, "import.json"), "w") as f:
        json.dump(dict(set=args.set, dry_run=args.dry_run, results=results, missing=missing),
                  f, indent=1)
    print(f"done: {len(results)} imported, {len(fails)} failed their check"
          f"{' (' + ', '.join(fails) + ')' if fails else ''}, {len(missing)} not in the return."
          f"\nreview sheets: {os.path.relpath(outdir, ROOT)}")


if __name__ == "__main__":
    main()
