"""Bellmourn re-skin tool: files, checks and zips the painted weapon and shield textures.

Runs in ChatGPT's Python sandbox (or anywhere with Python 3, Pillow and numpy). Unzip the
pack, then in Python:

    import sys; sys.path.insert(0, "/mnt/data/bellmourn_reskin")
    import reskin_tool as rt
    rt.setup("velscour")          # once: the set's name; work folder + job list
    rt.next_job()                 # what to paint next, with its exact image prompt
    rt.show("arming_sword")       # display the paint template and the card
    rt.file("/mnt/data/x.png", "arming_sword")   # save a painting under its exact name + check
    rt.status()                   # every job and its check
    rt.pack("pilot" | "checkpoint" | "final")    # the zip to hand back, exact names inside

From a shell: `python reskin_tool.py setup velscour`, `python reskin_tool.py file x.png`, ...

Never rename, crop or resize files by hand: `file()` does it, and `pack()` writes the zip in
the exact layout import_reskin.py reads. The same alignment code runs in the importer.
"""
import datetime
import json
import os
import re
import shutil
import sys
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

FORMAT = "bellmourn-reskin/1"
CANVAS = (1536, 1024)
LRES = 1024  # the importer's layout maps: 8 px per texel of the 128-texel UV layout
KEY = (255, 0, 255)
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")

# the material board: (key, label, what to paint in that slot). Every part of every model
# is one of these materials (manifest.json: jobs[].parts[].material).
BOARD = [
    ("steel", "Blade steel", "cool blue-grey polished steel; long bright streaks running along "
     "the length; a thin brighter honed edge; fine scratches; a darker fuller groove"),
    ("iron", "Iron fittings", "mid-dark grey iron, hammer-dimpled, raised edges rubbed brighter, "
     "a few rust-brown pits"),
    ("black_iron", "Blackened iron", "near-black blue-grey iron, cold faint highlights on raised "
     "edges, flaky dark rust in the recesses"),
    ("silver", "Silver", "pale cool silver with a soft sheen, grey-violet tarnish in recesses"),
    ("gold", "Gold", "rich warm gold, pale yellow highlights on raised edges, deep orange-brown "
     "in recesses, worn smooth"),
    ("brass", "Brass", "duller olive-yellow brass with greenish tarnish in the crevices"),
    ("bronze", "Bronze", "warm orange-brown bronze, darker hammer marks, specks of green "
     "verdigris"),
    ("leather", "Brown leather", "brown leather strips wound diagonally, dark gaps between the "
     "turns, worn lighter where gripped"),
    ("dark_leather", "Dark leather", "near-black brown leather, creased, a stitched seam, dull "
     "sheen"),
    ("red_cloth", "Red cloth & cord", "deep wine-red woven cord wound tight, visible weave, "
     "darker between the turns"),
    ("wood", "Wood", "warm brown ash or oak, straight grain running along the length, a few "
     "knots and nicks"),
    ("dark_wood", "Dark wood", "tar-black oak with a faint long grain and a dull worn sheen"),
    ("pale_wood", "Pale wood", "bleached grey-tan wood with dry cracks along the grain"),
    ("painted_wood", "Painted shield boards", "planks painted deep red and dark ochre, chipped "
     "to bare wood at the edges, iron nail heads"),
    ("bone", "Bone", "aged ivory bone, yellowed, fine hairline cracks, darker pits"),
    ("horn", "Horn & antler", "grey-brown horn with long striations and paler tips"),
    ("green_scales", "Drake scales", "rows of overlapping dark green scales, each with a lighter "
     "rim and a darker base"),
    ("obsidian", "Obsidian", "black volcanic glass, sharp angular facets, faint purple-blue "
     "glints"),
    ("stone", "Grave stone", "grey weathered stone, moss green in the cracks, chipped corners"),
    ("gems", "Gems", "a ruby, a sapphire and an emerald, faceted, deep colour, one hard white "
     "highlight each"),
    ("glow", "Glow: crystal, ember", "pale blue crystal with a bright core, and orange embers "
     "with yellow cores; solid colour, hard edges, no blur"),
]
# what each material is, for the finishes the importer makes (worn, gilded, frostbound...)
FAMILY = dict(steel="steel", iron="iron", black_iron="iron", silver="silver", gold="gold",
              brass="brass", bronze="bronze", leather="leather", dark_leather="leather",
              red_cloth="cloth", wood="wood", dark_wood="wood", pale_wood="wood",
              painted_wood="wood", bone="bone", horn="bone", green_scales="scale",
              obsidian="stone", stone="stone", gems="gem", glow="glow")
BOARD_LABEL = {k: l for k, l, _ in BOARD}


# ================================================================== image helpers

def load_rgb(src):
    """Any image (path, bytes or PIL image; png/webp/jpg) as an RGB PIL image."""
    if isinstance(src, Image.Image):
        img = src
    elif isinstance(src, (bytes, bytearray)):
        import io
        img = Image.open(io.BytesIO(src))
    else:
        img = Image.open(src)
    if img.mode in ("RGBA", "LA", "P"):  # transparent areas count as background
        img = img.convert("RGBA")
        bg = Image.new("RGBA", img.size, KEY + (255,))
        img = Image.alpha_composite(bg, img)
    return img.convert("RGB")


def normalize(img, size=CANVAS):
    """The painting at the canvas size. -> (image, note or "")."""
    img = load_rgb(img)
    if img.size == tuple(size):
        return img, ""
    note = f"came back {img.size[0]}x{img.size[1]}, resized to {size[0]}x{size[1]}"
    if abs(img.size[0] / img.size[1] - size[0] / size[1]) > 0.03:
        note += " (different shape: probably cropped or squared; check the result)"
    return img.resize(size, Image.LANCZOS), note


def key_mask(rgb):
    """Background pixels: the magenta key, or close to it (ChatGPT's soft edges and shades)."""
    rgb = np.asarray(rgb, float)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    near = np.abs(rgb - np.array(KEY, float)).sum(-1) < 150
    pinkish = (np.minimum(r, b) - g > 95) & (r > 150) & (b > 140)
    return near | pinkish


def bilinear(img, x, y):
    """Sample an (H, W, C) float array at float pixel coordinates (pixel centres at +0.5)."""
    h, w = img.shape[:2]
    x = np.clip(np.asarray(x, float) - 0.5, 0, w - 1.001)
    y = np.clip(np.asarray(y, float) - 0.5, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    a, b = img[y0, x0], img[y0, x0 + 1]
    c, d = img[y0 + 1, x0], img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def load_palette(path=None):
    """The locked palette's 255 colours (the key colour left out), as a float array."""
    for p in (path, os.path.join(HERE, "bellmourn_palette.json"),
              os.path.join(HERE, "..", "..", "templates", "style", "bellmourn_palette.json")):
        if p and os.path.exists(p):
            with open(p) as f:
                data = json.load(f)
            cols = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in data["colors"]]
            return np.array([c for i, c in enumerate(cols) if i != data.get("key_index", 255)],
                            float)
    return None


_LUT = {}


def palette_lut(pal):
    """Nearest palette colour for every 6-bit RGB cube cell (64^3 entries)."""
    k = id(pal)
    if k not in _LUT:
        g = (np.arange(64) * 4 + 2).astype(float)
        cube = np.stack(np.meshgrid(g, g, g, indexing="ij"), -1).reshape(-1, 3)
        out = np.empty(len(cube), np.int32)
        for s in range(0, len(cube), 16384):
            d = ((cube[s:s + 16384, None, :] - pal[None]) ** 2).sum(-1)
            out[s:s + 16384] = d.argmin(1)
        _LUT[k] = out.reshape(64, 64, 64)
    return _LUT[k]


def snap(rgb, pal):
    """Every pixel to its nearest palette colour."""
    q = np.clip(np.asarray(rgb, float), 0, 255).astype(int) >> 2
    return pal[palette_lut(pal)[q[..., 0], q[..., 1], q[..., 2]]]


# ================================================================== alignment

def _fft_shift(T, Q, reach):
    """Best integer shift e (|e| <= reach) maximising sum T(x) Q(x + e), and its score."""
    H = 1 << int(np.ceil(np.log2(max(T.shape[0], Q.shape[0]) + reach + 1)))
    W = 1 << int(np.ceil(np.log2(max(T.shape[1], Q.shape[1]) + reach + 1)))
    ft = np.fft.rfft2(T, (H, W))
    fq = np.fft.rfft2(Q, (H, W))
    c = np.fft.irfft2(np.conj(ft) * fq, (H, W))
    ys = np.r_[0:reach + 1, H - reach:H]
    xs = np.r_[0:reach + 1, W - reach:W]
    sub = c[np.ix_(ys, xs)]
    iy, ix = np.unravel_index(sub.argmax(), sub.shape)
    ey = ys[iy] if ys[iy] <= reach else ys[iy] - H
    ex = xs[ix] if xs[ix] <= reach else xs[ix] - W
    return (ex, ey), sub.max()


def _iou_warp(P, T, sx, sy, dx, dy, grid):
    """IoU of the target mask and the painted mask pulled back through p = s*x + d."""
    X, Y = grid
    xs = np.round(sx * X + dx).astype(int)
    ys = np.round(sy * Y + dy).astype(int)
    ok = (xs >= 0) & (ys >= 0) & (xs < P.shape[1]) & (ys < P.shape[0])
    W = np.zeros_like(T)
    W[ok] = P[ys[ok], xs[ok]]
    return (W & T).sum() / max((W | T).sum(), 1)


def register(painted, islands):
    """How the painting sits over the template: (sx, sy, dx, dy) with painted = s * canvas + d
    (canvas pixels), and how well the shapes agree (IoU, 1.0 = perfectly). ChatGPT often hands
    the picture back a little shifted, scaled or squashed; this finds it."""
    P = ~key_mask(painted)
    T = np.asarray(islands) > 0
    H, W = T.shape
    # coarse: every scale 0.88..1.12 at quarter size, shift found by FFT correlation
    P4 = np.asarray(Image.fromarray(P.astype(np.uint8) * 255).resize((W // 4, H // 4),
                                                                     Image.BOX), float) / 255
    T4 = np.asarray(Image.fromarray(T.astype(np.uint8) * 255).resize((W // 4, H // 4),
                                                                     Image.BOX), float) / 255
    T4z = T4 - T4.mean()
    best = (-1e18, 1.0, 0.0, 0.0)
    for s in np.arange(0.88, 1.1201, 0.015):
        qw, qh = max(8, round(P4.shape[1] / s)), max(8, round(P4.shape[0] / s))
        Q = np.asarray(Image.fromarray((P4 * 255).astype(np.uint8)).resize((qw, qh),
                                                                          Image.BILINEAR),
                       float) / 255
        Qz = Q - Q.mean()
        (ex, ey), sc = _fft_shift(T4z, Qz, 40)
        sc /= (np.linalg.norm(Qz) + 1e-9)
        if sc > best[0]:
            best = (sc, s, ex * s * 4.0, ey * s * 4.0)
    _, s, dx, dy = best
    # fine: coordinate descent on (sx, sy, dx, dy) at half size, exact IoU
    Ph, Th = P[::2, ::2], T[::2, ::2]
    grid = np.meshgrid(np.arange(Th.shape[1]) + 0.25, np.arange(Th.shape[0]) + 0.25)
    p = [s, s, dx / 2, dy / 2]
    cur = _iou_warp(Ph, Th, *p, grid)
    for step in ((0.008, 0.008, 4, 4), (0.004, 0.004, 2, 2), (0.002, 0.002, 1, 1),
                 (0.001, 0.001, 0.5, 0.5)):
        moved = True
        while moved:
            moved = False
            for k in range(4):
                for sgn in (-1, 1):
                    q = list(p)
                    q[k] += sgn * step[k]
                    v = _iou_warp(Ph, Th, *q, grid)
                    if v > cur + 1e-5:
                        p, cur, moved = q, v, True
    return (p[0], p[1], p[2] * 2, p[3] * 2), float(cur)


def refine(painted, islands, G, reach=12, pad=14):
    """Per-piece nudges {island value: (dx, dy)} on top of the overall fit G: ChatGPT drifts
    pieces a little on their own. Only large pieces, only clear improvements."""
    P = ~key_mask(painted)
    isl = np.asarray(islands)
    sx, sy, dx, dy = G
    out = {}
    H, W = isl.shape
    for v in np.unique(isl):
        if v == 0:
            continue
        ys, xs = np.nonzero(isl == v)
        if len(xs) < 300:
            continue
        x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, W)
        y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, H)
        T = isl[y0:y1, x0:x1] == v
        X, Y = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)

        def score(ox, oy):
            px = np.round(sx * X + dx + ox - 0.5).astype(int)
            py = np.round(sy * Y + dy + oy - 0.5).astype(int)
            ok = (px >= 0) & (py >= 0) & (px < P.shape[1]) & (py < P.shape[0])
            Wm = np.zeros_like(T)
            Wm[ok] = P[py[ok], px[ok]]
            return (Wm & T).sum() / max((Wm | T).sum(), 1)
        base = score(0, 0)
        best = (base, 0, 0)
        for oy in range(-reach, reach + 1, 3):
            for ox in range(-reach, reach + 1, 3):
                sc = score(ox, oy)
                if sc > best[0]:
                    best = (sc, ox, oy)
        for oy in range(best[2] - 2, best[2] + 3):
            for ox in range(best[1] - 2, best[1] + 3):
                sc = score(ox, oy)
                if sc > best[0]:
                    best = (sc, ox, oy)
        if best[0] > base + 0.02:
            out[int(v)] = (best[1], best[2])
    return out


def to_canvas(painted, islands, G, nudges):
    """The painting pulled back onto the template's canvas (each piece with its own nudge)."""
    rgb = np.asarray(load_rgb(painted), float)
    isl = np.asarray(islands)
    H, W = isl.shape
    X, Y = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    ox = np.zeros((H, W))
    oy = np.zeros((H, W))
    for v, (a, b) in nudges.items():
        m = isl == v
        ox[m], oy[m] = a, b
    sx, sy, dx, dy = G
    return bilinear(rgb, sx * X + dx + ox, sy * Y + dy + oy)


# ================================================================== the pack's jobs

def load_manifest():
    with open(os.path.join(HERE, "manifest.json")) as f:
        return json.load(f)


def job(ref):
    """A job by id, job number or file name."""
    m = load_manifest()
    s = str(ref)
    for j in m["jobs"]:
        if s in (j["id"], str(j["job"]), f"{j['job']:02d}"):
            return j
    mt = re.search(r"(?:^|[/\\])(?:\d+__)?([a-z0-9_]+?)(?:__paint|__card)?\.\w+$", s)
    if mt:
        for j in m["jobs"]:
            if j["id"] == mt.group(1):
                return j
    raise KeyError(f"no job called {ref!r}")


def islands_map(j):
    return np.asarray(Image.open(os.path.join(HERE, j["files"]["islands"])))


def template(j):
    return Image.open(os.path.join(HERE, j["files"]["paint"])).convert("RGB")


def identify(img, jobs=None):
    """Which model a painting is (by its pieces' layout). -> (job, score, runner-up score)."""
    img, _ = normalize(img)
    P = (~key_mask(img)).astype(np.uint8) * 255
    P8 = np.asarray(Image.fromarray(P).resize((CANVAS[0] // 8, CANVAS[1] // 8), Image.BOX),
                    float) / 255
    scores = []
    for j in jobs or load_manifest()["jobs"]:
        T = (islands_map(j) > 0).astype(np.uint8) * 255
        T8 = np.asarray(Image.fromarray(T).resize(P8.shape[::-1], Image.BOX), float) / 255
        (ex, ey), _ = _fft_shift(T8 - T8.mean(), P8 - P8.mean(), 8)
        Ps = np.roll(np.roll(P8, -ey, 0), -ex, 1)
        iou = np.minimum(Ps, T8).sum() / max(np.maximum(Ps, T8).sum(), 1e-9)
        scores.append((iou, j))
    scores.sort(key=lambda t: -t[0])
    return scores[0][1], scores[0][0], scores[1][0] if len(scores) > 1 else 0.0


# ================================================================== checks

def check_image(painted, j, save=None):
    """How well a painting fits its template. -> dict with verdict PASS / WARN / FAIL and
    the reasons. `save`: write a review picture (pieces outlined green / yellow / red)."""
    img, note = normalize(painted)
    isl = islands_map(j)
    G, iou = register(img, isl)
    nudges = refine(img, isl, G)
    canvas = to_canvas(img, isl, G, nudges)
    bg = key_mask(canvas)
    inside = isl > 0
    cover = 1 - bg[inside].mean()
    per = {}
    for v in np.unique(isl):
        if v:
            m = isl == v
            per[int(v)] = (float(1 - bg[m].mean()), int(m.sum()))
    small = [v for v, (c, n) in per.items() if c < 0.7]
    small_area = sum(per[v][1] for v in small) / max(inside.sum(), 1)
    ring = np.asarray(Image.fromarray(inside.astype(np.uint8) * 255).filter(
        ImageFilter.MaxFilter(13))) > 0
    outside = ~ring
    bg_clean = bg[outside].mean() if outside.any() else 1.0
    tpl = np.asarray(template(j), float)
    unpainted = np.abs(canvas - tpl)[inside].mean() < 10
    pal = load_palette()
    drift = None
    if pal is not None:
        px = canvas[inside & ~bg]
        if len(px):
            px = px[:: max(1, len(px) // 20000)]
            drift = float(np.sqrt(((px[:, None] - pal[None]) ** 2).sum(-1).min(1)).mean())
    sx, sy, dx, dy = G
    moved = max(abs(sx - 1), abs(sy - 1)) > 0.06 or max(abs(dx), abs(dy)) > 60
    fail, warn = [], []
    if unpainted:
        fail.append("the pieces look unpainted (still the flat template colours)")
    if iou < 0.6:
        fail.append(f"the painted shapes don't match the template (IoU {iou:.2f}): pieces moved, "
                    "redrawn or the background painted over")
    if cover < 0.85:
        fail.append(f"only {cover:.0%} of the pieces' area is painted")
    if small_area > 0.15:
        fail.append(f"{len(small)} pieces are mostly missing")
    if bg_clean < 0.5:
        fail.append("the background is not flat magenta any more")
    if not fail:
        if cover < 0.95:
            warn.append(f"{cover:.0%} of the pieces' area painted")
        if small:
            warn.append(f"{len(small)} small pieces mostly unpainted")
        if bg_clean < 0.85:
            warn.append("stray paint on the magenta background")
        if moved:
            warn.append(f"the picture came back shifted/scaled (scale {sx:.3f} x {sy:.3f}, "
                        f"shift {dx:+.0f}, {dy:+.0f} px); corrected")
        if drift is not None and drift > 30:
            warn.append(f"colours drift off the palette (mean distance {drift:.0f}); they will "
                        "be snapped to it")
    if note:
        (warn if not fail else fail).append(note)
    verdict = "FAIL" if fail else "WARN" if warn else "PASS"
    res = dict(verdict=verdict, reasons=fail + warn, coverage=round(float(cover), 3),
               iou=round(iou, 3), background=round(float(bg_clean), 3),
               fit=[round(float(v), 4) for v in G], nudged=len(nudges),
               palette_drift=None if drift is None else round(drift, 1),
               _G=G, _nudges=nudges, _canvas=canvas)  # (for the importer; not saved)
    if save:
        out = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
        d = ImageDraw.Draw(out)
        for v, (c, _) in per.items():
            ys, xs = np.nonzero(isl == v)
            col = (60, 230, 90) if c >= 0.9 else (250, 210, 40) if c >= 0.7 else (255, 40, 40)
            d.rectangle([xs.min() - 3, ys.min() - 3, xs.max() + 3, ys.max() + 3], outline=col,
                        width=2)
        d.rectangle([0, 0, 760, 26], fill=(0, 0, 0))
        d.text((6, 6), f"{j['job']:02d} {j['id']}: {verdict}  cover {cover:.0%}  fit {iou:.2f}",
               fill=(255, 255, 255))
        out.resize((CANVAS[0] // 2, CANVAS[1] // 2), Image.LANCZOS).save(save)
    return res


# ================================================================== the workflow

def _progress():
    p = os.path.join(WORK, "progress.json")
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return None


def _save_progress(pr):
    os.makedirs(WORK, exist_ok=True)
    with open(os.path.join(WORK, "progress.json"), "w") as f:
        json.dump(pr, f, indent=1)


def setup(set_name="velscour", resume=None):
    """Make the work folder. `resume`: a checkpoint zip (or list) made earlier by pack(), to
    carry on after the sandbox was reset."""
    slug = re.sub(r"[^a-z0-9]+", "_", set_name.lower()).strip("_") or "velscour"
    for d in ("painted", "checks", "style"):
        os.makedirs(os.path.join(WORK, d), exist_ok=True)
    pr = _progress() or dict(set=slug, created=_now(), jobs={})
    pr["set"] = slug
    _save_progress(pr)
    for z in ([resume] if isinstance(resume, str) else resume or []):
        with zipfile.ZipFile(z) as zf:
            for n in zf.namelist():
                if n.startswith("painted/") and n.endswith(".png"):
                    file(zf.read(n), job(n)["id"], quiet=True)
                elif n == "style/material_board.png":
                    file(zf.read(n), "material_board", quiet=True)
    m = load_manifest()
    print(f"Bellmourn re-skin set '{slug}': {len(m['jobs'])} models, work folder {WORK}")
    status()
    return slug


def _now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def status():
    """Every job: painted or not, and its check."""
    pr = _progress() or dict(jobs={})
    m = load_manifest()
    board = os.path.exists(os.path.join(WORK, "style", "material_board.png"))
    print(f"  material board: {'done' if board else 'TO DO (paint this first)'}")
    counts = dict(PASS=0, WARN=0, FAIL=0, todo=0)
    for j in m["jobs"]:
        r = pr["jobs"].get(j["id"])
        v = r["verdict"] if r else "todo"
        counts[v] += 1
        pilot = " (pilot)" if j["id"] in m["pilot"] else ""
        extra = f"  {'; '.join(r['reasons'])}" if r and r["reasons"] else ""
        print(f"  {j['job']:02d} {j['id']:<22} {v:<5}{pilot}{extra}")
    print(f"  -> {counts['PASS']} pass, {counts['WARN']} warn, {counts['FAIL']} fail, "
          f"{counts['todo']} to do")
    return counts


def next_job():
    """The next thing to paint (board, then the pilot, then in order) and its prompt."""
    pr = _progress() or dict(jobs={})
    m = load_manifest()
    if not os.path.exists(os.path.join(WORK, "style", "material_board.png")):
        print(prompt("material_board"))
        return "material_board"
    order = [job(i) for i in m["pilot"]] + m["jobs"]
    for j in order:
        r = pr["jobs"].get(j["id"])
        if not r or (r["verdict"] == "FAIL" and r.get("attempts", 1) < 3):
            if r:
                print(f"(try {r.get('attempts', 1) + 1} of 3: last time {'; '.join(r['reasons'])})\n")
            print(prompt(j["id"]))
            return j["id"]
    print("Every model is painted. Run rt.pack('final').")
    return None


def prompt(ref):
    """The exact image prompt for one job (or 'material_board')."""
    if ref == "material_board":
        lines = "\n".join(f"  {k + 1:>2}. {l}: {p}" for k, (_, l, p) in enumerate(BOARD))
        return (
            "EDIT the attached image `style/material_board__paint.png` and keep its exact size "
            "(1536 x 1024), its dark frame and its labels.\n\n"
            "It is the material board for Bellmourn, a 1994-1996-style first-person dark-fantasy "
            "game (Heretic, Hexen, Daggerfall era). Fill each grey slot edge to edge with a flat, "
            "square-on swatch of the labelled material, as a hand-painted 1990s game texture: "
            "crisp, chunky, readable detail; soft light baked in (raised detail lighter, crevices "
            "darker); honest wear; no photographic noise, no airbrushed gradients, no "
            "perspective, no objects, no text inside the slots. Use only colours from "
            "bellmourn_palette.png, following STYLE_LOCK.md.\n\nThe slots:\n" + lines +
            "\n\nReturn ONE image, 1536 x 1024.")
    j = job(ref)
    parts = "\n".join(f"  {p['number']:>2}. {p['label']}: {p['material_label']}"
                      f"{' (cutting/striking edge)' if p['edge'] else ''} "
                      f"-> board slot \"{BOARD_LABEL[p['material']]}\""
                      f"{'; ' + p['faces'] if p.get('faces') else ''}" for p in j["parts"])
    orient = ("Every piece stands UPRIGHT: the top of the shield is at the top of each piece."
              if j["orientation"] == "up" else
              "Every long piece lies on its side with its TIP / HEAD end at the RIGHT.")
    notes = "".join(f"\n{n}" for n in j["notes"])
    if any("blade" in p["label"] for p in j["parts"]):
        notes += ("\nA blade piece crossed by fold lines is the blade's surface unrolled around "
                  "its edges: the folds are cutting edges and ridges, the bands between them its "
                  "flat faces. A fuller runs down the middle of a wide band, never along a fold.")
    return (
        f"EDIT the attached image `{os.path.basename(j['files']['paint'])}` and keep its exact "
        f"size (1536 x 1024) with every coloured shape exactly where it is.\n\n"
        f"It is the unfolded texture of a low-poly 3D {j['kind_text']} for Bellmourn, a "
        f"1994-1996-style first-person dark-fantasy game: {j['name']}. {j['description']}\n\n"
        f"Each coloured shape on the magenta background is one piece of the model's surface laid "
        f"flat. Paint INSIDE every shape, edge to edge, as the material below. The attached card "
        f"`{os.path.basename(j['files']['card'])}` numbers the pieces and shows the model from "
        f"four sides.\n\nPieces:\n{parts}\n\n{orient} Thin lines inside a shape are folds of "
        f"the 3D surface (a blade's edge, the corner of a block): paint them as edges, a light "
        f"line on the fold.{notes}\n\n"
        f"Style: match the attached material board exactly (same palette and the same "
        f"hand-painted 1990s technique: crisp chunky detail, light baked in piece by piece "
        f"(raised edges and folds lighter, crevices darker; no one light across the whole "
        f"picture), honest wear, no photo noise, no airbrush). Follow STYLE_LOCK.md.\n"
        f"Keep: the background flat pure magenta #FF00FF; every shape's outline, size and "
        f"position.\nNever: text, numbers, labels, logos, borders, drop shadows, new shapes, "
        f"glow or paint outside the shapes.\nReturn ONE image, 1536 x 1024.")


def show(ref):
    """Display a job's paint template and card (and the material board, once painted), so
    they are in front of you when you paint."""
    paths = []
    if ref == "material_board":
        paths.append(os.path.join(HERE, "style", "material_board__paint.png"))
    else:
        j = job(ref)
        paths += [os.path.join(HERE, j["files"]["paint"]), os.path.join(HERE, j["files"]["card"])]
        board = os.path.join(WORK, "style", "material_board.png")
        if os.path.exists(board):
            paths.append(board)
    try:
        from IPython.display import display
        for p in paths:
            print(os.path.relpath(p, HERE))
            display(Image.open(p))
    except ImportError:
        print("\n".join(paths))
    return paths


def newest_image(root="/mnt/data", after=None):
    """The most recent image file under `root` that isn't part of this pack or its work
    (where the image tool or an upload may have put a painting), or None."""
    best = None
    skip = (os.path.abspath(HERE),)
    for d, _, fs in os.walk(root):
        if os.path.abspath(d).startswith(skip):
            continue
        for f in fs:
            if f.lower().endswith((".png", ".webp", ".jpg", ".jpeg")):
                p = os.path.join(d, f)
                t = os.path.getmtime(p)
                if (after is None or t > after) and (best is None or t > best[0]):
                    best = (t, p)
    return best[1] if best else None


def file(src=None, ref=None, quiet=False):
    """Save a painting under its exact name (any size or format; `ref` = job id, number or
    'material_board'; left out: worked out from the layout) and check it. `src` left out:
    the newest image in /mnt/data."""
    if src is None:
        src = newest_image()
        if src is None:
            raise FileNotFoundError("no image found in /mnt/data: ask the user to upload the "
                                    "painting, then call rt.file(path)")
        if not quiet:
            print(f"using {src}")
    pr = _progress() or setup()
    if ref == "material_board":
        img, note = normalize(src)
        os.makedirs(os.path.join(WORK, "style"), exist_ok=True)
        img.save(os.path.join(WORK, "style", "material_board.png"))
        if not quiet:
            print("saved the material board" + (f" ({note})" if note else ""))
        return dict(verdict="PASS", reasons=[note] if note else [])
    if ref is None:
        j, sc, second = identify(src)
        if sc < 0.45 or sc - second < 0.04:
            raise ValueError(f"can't tell which model this is (best {j['id']} at {sc:.2f}, "
                             f"next {second:.2f}): pass its id")
        if not quiet:
            print(f"this is {j['job']:02d} {j['id']} (layout match {sc:.2f})")
    else:
        j = job(ref)
    img, note = normalize(src)
    dst = os.path.join(WORK, j["files"]["painted"])
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    img.save(dst)
    chk = os.path.join(WORK, "checks", f"{j['job']:02d}__{j['id']}__check.png")
    res = {k: v for k, v in check_image(img, j, save=chk).items() if not k.startswith("_")}
    if note and note not in res["reasons"]:
        res["reasons"].append(note)
        if res["verdict"] == "PASS":
            res["verdict"] = "WARN"
    res["file"] = j["files"]["painted"]
    res["checked"] = _now()
    pr = _progress()
    res["attempts"] = pr["jobs"].get(j["id"], {}).get("attempts", 0) + 1
    pr["jobs"][j["id"]] = res
    _save_progress(pr)
    if not quiet:
        print(f"{j['job']:02d} {j['id']}: {res['verdict']}  (pieces painted {res['coverage']:.0%}, "
              f"shape match {res['iou']:.2f})")
        for r in res["reasons"]:
            print("   -", r)
        print(f"   review picture: {chk}")
    return res


def check(ref):
    """Re-check a filed painting."""
    j = job(ref)
    return file(os.path.join(WORK, j["files"]["painted"]), j["id"])


def pack(kind="final"):
    """Zip the work for Claude to import: 'pilot' (the pilot models), 'checkpoint' (whatever
    is done so far: keep it, in case the sandbox is reset) or 'final' (everything)."""
    pr = _progress()
    if not pr:
        raise RuntimeError("run setup() first")
    m = load_manifest()
    jobs = [job(i) for i in m["pilot"]] if kind == "pilot" else m["jobs"]
    done = [j for j in jobs if pr["jobs"].get(j["id"]) and
            os.path.exists(os.path.join(WORK, j["files"]["painted"]))]
    missing = [j["id"] for j in jobs if j not in done]
    failed = [j["id"] for j in done if pr["jobs"][j["id"]]["verdict"] == "FAIL"]
    name = f"bellmourn_reskin__{pr['set']}"
    if kind == "pilot":
        name += "__pilot"
    elif kind == "checkpoint":
        name += f"__part{len(done):02d}"
    path = os.path.join(os.path.dirname(HERE), name + ".zip")  # next to the unzipped pack
    record = dict(format=FORMAT, set=pr["set"], kind=kind, created=_now(), canvas=list(CANVAS),
                  models={j["id"]: dict(job=j["job"], kind=j["kind"], file=j["files"]["painted"],
                                        **{k: v for k, v in pr["jobs"][j["id"]].items()
                                           if k != "file"})
                          for j in done},
                  missing=missing, failed=failed,
                  material_board=os.path.exists(os.path.join(WORK, "style",
                                                             "material_board.png")))
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("RESKIN.json", json.dumps(record, indent=1))
        if record["material_board"]:
            z.write(os.path.join(WORK, "style", "material_board.png"), "style/material_board.png")
        for j in done:
            z.write(os.path.join(WORK, j["files"]["painted"]), j["files"]["painted"])
    print(f"wrote {path}: {len(done)} models"
          + (f", {len(missing)} not painted yet" if missing else "")
          + (f", {len(failed)} FAILED their check: {', '.join(failed)}" if failed else ""))
    return path


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    cmd, rest = a[0], a[1:]
    if cmd == "setup":
        setup(*rest[:1])
    elif cmd == "status":
        status()
    elif cmd == "next":
        next_job()
    elif cmd == "prompt":
        print(prompt(rest[0]))
    elif cmd == "file":
        file(rest[0], rest[1] if len(rest) > 1 else None)
    elif cmd == "check":
        check(rest[0])
    elif cmd == "pack":
        pack(*rest[:1])
    else:
        sys.exit(__doc__)
