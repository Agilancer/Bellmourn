"""The material swatches models are dressed in (weapons, gauntlets): the user's painted
material sheets in art/materials/, cut into tileable swatches.

Each sheet is 312 x 312 pixel art blown up about 4x, laid out as 3 columns (three tones or
metals of one material) by 2 rows (two materials). Every cell is shrunk back to its own
pixels (104 x 156) and made to repeat without a seam:
  - a regular pattern (studs, rings, scales, bands) is cropped to a whole number of repeats;
  - anything else is rolled half a tile so the seam lands in the middle, then covered with a
    patch from elsewhere in the cell, cut along the path where the two agree best (image
    quilting), so the pixels stay crisp instead of cross-fading into a blur.

    python tools/models/materials.py

writes assets/textures/materials/<id>.png and materials.json (id = <material>_<tone>, e.g.
brushed_steel_mid, riveted_bands_bronze).
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "art", "materials")
OUT = os.path.join(ROOT, "assets", "textures", "materials")
GRID = 312  # the sheets' own pixel grid
TONES = ("dark", "mid", "light")

# sheet file, (top-row material, bottom-row material), the three columns
SHEETS = [
    ("01_steel.webp", ("hammered_steel", "brushed_steel"), TONES),
    ("02_gold.webp", ("tarnished_gold", "polished_gold"), TONES),
    ("03_bright_steel.webp", ("scratched_steel", "burnished_steel"), TONES),
    ("04_leather.webp", ("pebbled_leather", "creased_leather"), TONES),
    ("05_studded_leather.webp", ("studded_leather", "pyramid_studded_leather"), TONES),
    ("06_fine_mail.webp", ("fine_mail", "bright_fine_mail"), TONES),
    ("07_heavy_mail.webp", ("iron_heavy_mail", "brass_heavy_mail"), TONES),
    ("08_scale.webp", ("rusted_scale", "polished_scale"), TONES),
    ("09_bands.webp", ("riveted_bands", "studded_bands"), ("iron", "bronze", "steel")),
    ("10_bronze_copper.webp", ("verdigris_bronze", "polished_copper"), TONES),
]


def wrap_error(t, axis):
    """How much worse the wrap-around edge is than an average edge inside the tile (1.0 =
    seamless), along `axis` (1 = left/right, 0 = top/bottom)."""
    a = np.moveaxis(t, axis, 0)
    inner = np.abs(np.diff(a, axis=0)).mean()
    return float(np.abs(a[-1] - a[0]).mean() / max(inner, 1e-6))


def period_crop(t, axis, keep=0.6):
    """The longest crop (offset, length) along `axis` whose wrap matches the cell itself:
    the pixels just past each end of the crop agree with the crop's other end, so a regular
    pattern lands on a whole number of repeats. None if nothing fits well."""
    a = np.moveaxis(t, axis, 0)
    n = len(a)
    inner = np.abs(np.diff(a, axis=0)).mean()
    best = None
    for length in range(n, int(n * keep) - 1, -1):
        for o in range(0, n - length + 1):
            errs = [np.abs(a[o + length - 1] - a[o]).mean() / inner]
            if o >= 1:  # the pixel before the crop should equal the crop's last pixel
                errs.append(np.abs(a[o - 1] - a[o + length - 1]).mean() / inner)
            if o + length < n:  # and the pixel after it the crop's first
                errs.append(np.abs(a[o + length] - a[o]).mean() / inner)
            e = float(np.mean(errs))
            if e <= 1.1 and (best is None or e < best[2] - 0.05):
                best = (o, length, e)
        if best:
            return best[:2]
    return None


def cut_path(cost, cyclic=True):
    """The cheapest top-to-bottom path through `cost` (rows x cols), moving at most one
    column per row; with `cyclic` it ends next to where it starts, so the tile still wraps.
    Returns the column per row."""
    h, w = cost.shape
    starts = range(w) if cyclic else [None]
    best = None
    for s in starts:
        acc = np.full((h, w), np.inf)
        if s is None:
            acc[0] = cost[0]
        else:
            acc[0, s] = cost[0, s]
        back = np.zeros((h, w), int)
        for y in range(1, h):
            for x in range(w):
                lo, hi = max(0, x - 1), min(w, x + 2)
                k = int(np.argmin(acc[y - 1, lo:hi])) + lo
                acc[y, x] = acc[y - 1, k] + cost[y, x]
                back[y, x] = k
        ends = [x for x in range(w) if s is None or abs(x - s) <= 1]
        x = min(ends, key=lambda e: acc[-1, e])
        if best is None or acc[-1, x] < best[0]:
            path = [x]
            for y in range(h - 1, 0, -1):
                x = back[y, x]
                path.append(x)
            best = (acc[-1, path[0]], path[::-1])
    return np.array(best[1])


def heal(t, axis):
    """Make `t` wrap along `axis` by quilting: roll the seam into the middle and cover it
    with the best-matching patch of the tile, cut in along the cheapest paths."""
    a = np.moveaxis(t, axis, 1)  # work left/right
    h, w = a.shape[:2]
    c = w // 2
    rolled = np.roll(a, c, axis=1)  # the bad edge is now between columns c-1 and c
    half, ov = max(4, w // 8), max(3, w // 12)
    pw = 2 * half + 2 * ov
    x0 = c - half - ov
    left, right = rolled[:, x0:x0 + ov], rolled[:, x0 + pw - ov:x0 + pw]
    ramp = np.linspace(0.0, 1.0, pw)[None, :, None]
    best = None
    for s in range(0, w - pw + 1):  # any strip of the unrolled tile is seam-free inside
        p = a[:, s:s + pw]
        # shift the strip's broad light/dark to meet both sides (a glint band in the strip
        # must not end in a hard edge), then score what is left
        dl = smooth_rows((left - p[:, :ov]).mean(1))
        dr = smooth_rows((right - p[:, -ov:]).mean(1))
        p = p + dl[:, None] + (dr - dl)[:, None] * ramp
        e = ((p[:, :ov] - left) ** 2).sum() + ((p[:, -ov:] - right) ** 2).sum()
        if best is None or e < best[0]:
            best = (e, p)
    p = best[1]
    pl = cut_path(((p[:, :ov] - left) ** 2).sum(-1))
    pr = cut_path(((p[:, -ov:] - right) ** 2).sum(-1))
    out = rolled.copy()
    for y in range(h):
        x1, x2 = pl[y], pw - ov + pr[y]
        out[y, x0 + x1:x0 + x2 + 1] = p[y, x1:x2 + 1]
    return np.moveaxis(out, 1, axis)


def smooth_rows(d, sigma=4.0):
    """Blur a (rows x channels) profile down the rows, wrapping round."""
    k = np.exp(-0.5 * (np.arange(-12, 13) / sigma) ** 2)
    k /= k.sum()
    return np.stack([np.convolve(np.pad(d[:, c], 12, mode="wrap"), k, "valid")
                     for c in range(d.shape[1])], axis=1)


def level(t, axis):
    """Even out the broad light/dark difference between the two ends along `axis` (a soft
    ramp across the whole tile), leaving the fine detail for `heal`."""
    a = np.moveaxis(t, axis, 1)
    d = smooth_rows(a[:, 0] - a[:, -1])
    ramp = np.linspace(-0.5, 0.5, a.shape[1])[None, :, None]
    return np.moveaxis(a + d[:, None, :] * ramp, 1, axis)


def trim_lines(t):
    """Drop the dark divider lines some sheets draw between their cells (an edge row or
    column clearly darker than the ones just inside it), where the cell doesn't already wrap
    (a row of ring shadows in a mail pattern is not a divider)."""
    for axis in (0, 1):
        for _ in range(2 if wrap_error(t, axis) > 1.05 else 0):
            a = np.moveaxis(t, axis, 0).mean(-1)
            if a[0].mean() < 0.9 * a[1:4].mean():
                t = np.take(t, range(1, t.shape[axis]), axis=axis)
            elif a[-1].mean() < 0.9 * a[-4:-1].mean():
                t = np.take(t, range(0, t.shape[axis] - 1), axis=axis)
    return t


def tileable(cells):
    """Seamless swatches from sheet cells that share one pattern (the tones of a material):
    they are cropped and patched together, so every tone keeps the same pattern in the same
    place and swapping tones on a model only changes its colour."""
    t = trim_lines(np.concatenate(cells, axis=-1))
    for axis in (1, 0):
        crop = period_crop(t, axis)
        if crop:
            o, n = crop
            t = np.take(t, range(o, o + n), axis=axis)
        t = level(t, axis)  # a faint light/dark step reads as a line even in busy detail
        if wrap_error(t, axis) > 1.0:
            t = heal(t, axis)
    return np.split(t, len(cells), axis=-1)


def aligned(cells):
    """Do the cells hold one pattern in different colours (rather than different patterns)?"""
    z = [(c.mean(-1) - c.mean()) / (c.mean(-1).std() + 1e-6) for c in cells]
    return all((z[0] * q).mean() > 0.5 for q in z[1:])


def build():
    os.makedirs(OUT, exist_ok=True)
    entries = []
    for fname, mats, tones in SHEETS:
        img = Image.open(os.path.join(SRC, fname)).convert("RGB").resize((GRID, GRID), Image.BOX)
        a = np.asarray(img, float)
        ch, cw = GRID // 2, GRID // 3
        for r, mat in enumerate(mats):
            cells = [a[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] for c in range(3)]
            swatches = tileable(cells) if aligned(cells) else [tileable([c])[0] for c in cells]
            for c, (tone, t) in enumerate(zip(tones, swatches)):
                t = np.clip(t, 0, 255).astype(np.uint8)
                mid = f"{mat}_{tone}"
                Image.fromarray(t).save(os.path.join(OUT, f"{mid}.png"))
                rgb = t.reshape(-1, 3).mean(0)
                entries.append(dict(id=mid, file=f"materials/{mid}.png", material=mat, tone=tone,
                                    sheet=f"art/materials/{fname}", cell=[r, c],
                                    size=[t.shape[1], t.shape[0]],
                                    seam=[round(wrap_error(t.astype(float), 1), 2),
                                          round(wrap_error(t.astype(float), 0), 2)],
                                    color="#%02x%02x%02x" % tuple(int(v) for v in rgb)))
                print(f"{mid:<34} {t.shape[1]:>3} x {t.shape[0]:<3} seam {entries[-1]['seam']}")
    with open(os.path.join(os.path.dirname(OUT), "materials.json"), "w") as f:
        json.dump(dict(materials=entries), f, indent=1)
    return entries


_cache = {}


def load(mid):
    """A swatch by id, as a float RGB array."""
    if mid not in _cache:
        _cache[mid] = np.asarray(Image.open(os.path.join(OUT, f"{mid}.png")).convert("RGB"), float)
    return _cache[mid]


if __name__ == "__main__":
    build()
