"""Paint a model's texture from the texture library (assets/textures), so every model is
textured before anyone paints it by hand.

Each part's colour (the material colours in kit.py) picks a library texture; every texel of
every UV island samples that texture at the island's own UV position in metres, so detail is
continuous across a piece and the same size on every model. The part colour tints it, a soft
light from above is baked in, and island outlines get a one-texel dark rim, the crisp edge a
1990s texture artist would paint.
"""
import json
import os

import numpy as np
from PIL import Image

import kit

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LIB = os.path.join(ROOT, "assets", "textures")

# extra prop materials (stone and plaster); kit.py holds the rest
STONE, DARKSTONE, MARBLE, MOSSSTONE = (150, 146, 138), (78, 76, 80), (206, 202, 192), (104, 112, 84)
PLASTER, WAX, FLAME, CLOTHRED = (196, 182, 150), (226, 216, 186), (250, 170, 60), (140, 36, 40)

# colour -> (library texture, library pixels per model texel (1 = the library's pixels land
# one-to-one on the model's texels), how much the part's own colour replaces the texture's)
MATERIALS = {
    kit.IRON: ("met_01_hammered_gunmetal", 1.0, 0.55),
    kit.DARKIRON: ("met_03_flaked_iron", 1.0, 0.55),
    kit.STEEL: ("met_08_scratched_blue_steel", 1.0, 0.5),
    kit.SILVER: ("met_06_tarnished_silver", 1.0, 0.45),
    kit.BRASS: ("met_09_oxide_stained_brass", 1.0, 0.45),
    kit.GOLD: ("gold_01_beaten_antique_gold", 1.0, 0.35),
    kit.BRONZE: ("met_04_tarnished_bronze", 1.0, 0.45),
    kit.CHAIN: ("met_07_black_chainmail", 1.0, 0.55),
    kit.LEATHER: ("cloth_02_stitched_charcoal", 1.0, 1.0),
    kit.DARKLEATHER: ("cloth_02_stitched_charcoal", 1.0, 1.0),
    kit.WRAP: ("cloth_04_aged_cream_linen", 1.0, 0.8),
    kit.WOOD: ("wood_04_weathered_cedar", 1.3, 0.55),
    kit.DARKWOOD: ("ship_01_tarblack_oak", 1.3, 0.55),
    kit.PALEWOOD: ("ship_06_salt_bleached_greyboards", 1.3, 0.55),
    kit.BONE: ("castle_ashlar", 1.0, 0.85),
    kit.HORN: ("wood_03_rootwood_grain", 1.0, 0.85),
    kit.FUR: ("cloth_03_patched_dark_canvas", 1.0, 1.0),
    kit.RED: ("cloth_01_coarse_sail_canvas", 1.0, 1.0),
    kit.BLUE: ("cloth_01_coarse_sail_canvas", 1.0, 1.0),
    kit.PURPLE: ("cloth_05_deep_plum_woven_sail", 1.0, 0.9),
    kit.GREEN: ("cloth_01_coarse_sail_canvas", 1.0, 1.0),
    CLOTHRED: ("cloth_05_deep_plum_woven_sail", 1.0, 0.9),
    STONE: ("castle_ashlar", 1.6, 0.35),
    DARKSTONE: ("castle_basalt", 1.6, 0.35),
    MARBLE: ("castle_keep_ivory_chapel_marble", 1.6, 0.3),
    MOSSSTONE: ("castle_mossy", 1.6, 0.25),
    PLASTER: ("cathedral_graveyard_limestone_squares", 1.6, 0.7),
}
# how much of a texture's light/dark detail survives, by texture family: bold eight-colour
# patterns are too loud on small pieces, so cloth and leather keep only a soft grain
CONTRAST = dict(cloth=0.3, met=0.55, gold=0.5, wood=0.55, ship=0.55, castle=0.5)
_cache = {}


def _lib_tex(tid):
    if tid not in _cache:
        lib = json.load(open(os.path.join(LIB, "library.json")))
        entry = next(s for s in lib["surfaces"] if s["id"] == tid)
        a = np.asarray(Image.open(os.path.join(LIB, entry["file"])).convert("RGB"), float)
        _cache[tid] = (a, a.reshape(-1, 3).mean(0))
    return _cache[tid]


def paint(model, light=(-0.35, 0.85, -0.35)):
    """The model's texture (model.tex square) painted from the library. The model must be
    packed (model.pack())."""
    n = model.tex
    out = np.zeros((n, n, 3))
    have = np.zeros((n, n), bool)
    edge = np.zeros((n, n), bool)
    L = np.asarray(light, float) / np.linalg.norm(light)
    rng = np.random.default_rng(3)
    noise = rng.random((n, n))
    for part, isl in model.islands():
        col = np.array(part.color[:3], float)
        mat = MATERIALS.get(tuple(part.color[:3]))
        for t in isl.t:
            p = isl.px[t]
            x0, y0 = np.floor(p.min(axis=0)).astype(int)
            x1, y1 = np.ceil(p.max(axis=0)).astype(int)
            xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1 + 1, n)) + 0.5,
                                 np.arange(max(y0, 0), min(y1 + 1, n)) + 0.5)
            a, b, c = p
            det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(det) < 1e-9 or xs.size == 0:
                continue
            l1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / det
            l2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / det
            l3 = 1 - l1 - l2
            inside = (l1 >= -0.03) & (l2 >= -0.03) & (l3 >= -0.03)
            if not inside.any():
                continue
            uv = (l1[..., None] * isl.uv[t[0]] + l2[..., None] * isl.uv[t[1]]
                  + l3[..., None] * isl.uv[t[2]])
            nrm = (l1[..., None] * isl.n[t[0]] + l2[..., None] * isl.n[t[1]]
                   + l3[..., None] * isl.n[t[2]])
            nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True) + 1e-9
            ix, iy = xs.astype(int), ys.astype(int)
            if mat:
                tex, mean = _lib_tex(mat[0])
                h, w = tex.shape[:2]
                # this island's texels per metre -> library pixels per metre
                ppm = model.density * part.weight / mat[1]
                tu = (uv[..., 0] * ppm).astype(int) % w
                tv = (uv[..., 1] * ppm).astype(int) % h
                base = tex[tv, tu]
                # the texture's light/dark detail, held to a sensible contrast, on the part's
                # own colour; blended with the texture's own colour by mat[2]
                lum = base @ np.array([0.3, 0.59, 0.11]) / max(float(mean @ np.array([0.3, 0.59, 0.11])), 1.0)
                k = CONTRAST.get(mat[0].split("_")[0], 0.55)
                detail = np.clip(1.0 + (lum - 1.0) * k, 1.0 - k * 0.6, 1.0 + k * 0.6)
                tinted = col[None, None, :] * detail[..., None]
                rgb = base * (1 - mat[2]) + tinted * mat[2]
            else:  # gems, crystal, skin, embers: the colour with a little grain
                rgb = col[None, None, :] * (0.9 + 0.2 * noise[iy % n, ix % n])[..., None]
            lit = 0.72 + 0.4 * np.clip(nrm @ L, -0.4, 1.0)
            rgb = np.clip(rgb * lit[..., None], 0, 255)
            out[iy[inside], ix[inside]] = rgb[inside]
            have[iy[inside], ix[inside]] = True
    # a one-texel darker rim around every island: crisp painted edges
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        edge |= have & ~np.roll(np.roll(have, dy, 0), dx, 1)
    out[edge] *= 0.72
    # bleed past the islands so filtering never pulls in the background
    for _ in range(3):
        grow = np.zeros_like(out)
        cnt = np.zeros((n, n))
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            grow += np.roll(np.roll(out * have[..., None], dy, 0), dx, 1)
            cnt += np.roll(np.roll(have, dy, 0), dx, 1)
        new = ~have & (cnt > 0)
        out[new] = grow[new] / cnt[new][:, None]
        have |= new
    return Image.fromarray(out.astype(np.uint8))
