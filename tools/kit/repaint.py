"""Repaint the Quaternius packs' texture atlases in Bellmourn's palette.

  python -I tools/kit/repaint.py art/raw/quaternius templates/models/kit/tex

Every atlas the packs ship (and the packs with no textures get one: the palette swatch atlas)
becomes one low-resolution, nearest-filtered Bellmourn texture, plus colour variants:

1. box-filtered down to its game size (a 2048 trim sheet to 512, a tiling wall to 128);
2. each pixel's source colour picks one of the 16 palette ramps by its hue and saturation, through
   that texture's own ramp table (so the packs' bright terracotta, teal and leaf green come out as
   soot, slate, rust, moss and bone), and its brightness picks a shade within the texture's range,
   on a darker, harder curve;
3. grime: cavity from the pack's own normal map (or the source's local contrast) darkens the
   mortar, cracks and grain; low blotches and drip streaks run down the walls; moss creeps into
   the stone's crevices; a speckle of wear;
4. an ordered (Bayer) dither between shades, and every pixel snapped to its ramp;
5. alpha (leaf and flower cards) cut hard at 50%.

Writes <out>/<id>.png and <out>/<id>@<variant>.png, and <out>/textures.json describing them.
Also writes the runtime's helper textures, made from the packs' own noise and wear masks:
grime.png (triplanar weathering), wear.png (damp rising from the ground), and the terrain
tiles (ground_*.png).
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PAL = json.load(open(os.path.join(ROOT, 'templates/style/bellmourn_palette.json')))
RAMPS = PAL['ramps']
COLS = np.array([[int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)] for c in PAL['colors'][:256]], np.uint8).reshape(16, 16, 3)
R = {n: i for i, n in enumerate(RAMPS)}
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16.0

# ------------------------------------------------------------------ the atlases
# (pack, source file, id, size, recipe). A recipe: `rules` [(hue lo, hue hi, min sat, ramp)],
# `grey` the ramp for unsaturated pixels, `shade` [lo, hi] the range brightness maps onto,
# `gamma` (>1 darker), and grime weights. `variants` {name: overrides}.
STONE = {'grey': 'stone', 'rules': [(0, 360, 0.18, 'earth')], 'shade': [2, 11], 'gamma': 1.25, 'cavity': 2.6, 'blotch': 1.6, 'streak': 1.4, 'moss': 0.5}
TEX = [
    # Fantasy Props MegaKit: four trim sheets and the page noise
    ('props', 'T_Trim_Furniture_BaseColor.png', 'props_furniture', 512, {
        'grey': 'iron', 'rules': [(0, 70, 0.15, 'wood'), (70, 200, 0.12, 'moss'), (200, 290, 0.15, 'slate'), (290, 360, 0.15, 'blood')],
        'shade': [1, 10], 'gamma': 1.3, 'cavity': 2.2, 'blotch': 1.2, 'normal': 'T_Trim_Furniture_Normal.png',
        'variants': {'ash': {'rules': [(0, 70, 0.15, 'slate')], 'shade': [1, 9]}, 'blood': {'rules': [(0, 70, 0.15, 'blood')], 'shade': [0, 8]}}}),
    ('props', 'T_Trim_Metal_BaseColor.png', 'props_metal', 512, {
        'grey': 'iron', 'rules': [(0, 55, 0.2, 'leather'), (55, 75, 0.2, 'gold'), (75, 360, 0.2, 'slate')],
        'shade': [1, 12], 'gamma': 1.15, 'cavity': 2.4, 'blotch': 1.0, 'rust': 0.6, 'normal': 'T_Trim_Metal_Normal.png',
        'variants': {'rust': {'grey': 'leather', 'rust': 1.6}, 'gilt': {'grey': 'gold', 'shade': [2, 13]}}}),
    ('props', 'T_Trim_Props_BaseColor.png', 'props_props', 512, {
        'grey': 'bone', 'rules': [(0, 40, 0.2, 'wood'), (40, 70, 0.2, 'gold'), (70, 170, 0.2, 'moss'), (170, 260, 0.2, 'arcane'), (260, 360, 0.2, 'blood')],
        'shade': [1, 12], 'gamma': 1.2, 'cavity': 2.0, 'blotch': 1.2, 'normal': 'T_Trim_Props_Normal.png',
        'variants': {'venom': {'rules': [(170, 260, 0.2, 'venom')]}}}),
    ('props', 'T_Trim_Cloth_BaseColor.png', 'props_cloth', 512, {
        'grey': 'bone', 'rules': [(0, 40, 0.15, 'blood'), (40, 75, 0.15, 'leather'), (75, 170, 0.15, 'moss'), (170, 260, 0.12, 'slate'), (260, 360, 0.15, 'arcane')],
        'shade': [1, 11], 'gamma': 1.25, 'cavity': 1.6, 'blotch': 1.8, 'streak': 0.8, 'normal': 'T_Trim_Cloth_Normal.png',
        'variants': {'shroud': {'rules': [(0, 360, 0.15, 'bone')], 'shade': [2, 10]}, 'crimson': {'rules': [(0, 360, 0.12, 'blood')], 'grey': 'blood', 'shade': [1, 10]}}}),
    ('props', 'T_Page_Noise.png', 'props_page', 128, {'grey': 'bone', 'rules': [], 'shade': [6, 13], 'gamma': 1.1, 'cavity': 0.8, 'blotch': 2.2}),
    # Medieval Village MegaKit: the tiling walls, roofs and trims
    ('village', 'T_Plaster_BaseColor.png', 'village_plaster', 128, {
        'grey': 'bone', 'rules': [(0, 360, 0.08, 'bone')], 'shade': [3, 11], 'gamma': 1.35, 'cavity': 1.6, 'blotch': 2.4, 'streak': 2.2, 'moss': 0.25,
        'normal': 'T_Plaster_Normal.png',
        'variants': {'ochre': {'rules': [(0, 360, 0.08, 'earth')], 'grey': 'earth', 'shade': [3, 11]}, 'ash': {'rules': [(0, 360, 0.08, 'stone')], 'grey': 'stone', 'shade': [2, 10]},
                     'lime': {'rules': [(0, 360, 0.08, 'sky')], 'grey': 'sky', 'shade': [4, 12]}}}),
    ('village', 'T_Brick_BaseColor.png', 'village_brick', 128, dict(STONE, normal='T_Brick_Normal.png', variants={'soot': {'shade': [0, 8]}, 'moss': {'moss': 1.8}})),
    ('village', 'T_RedBrick_BaseColor.png', 'village_redbrick', 128, {
        'grey': 'stone', 'rules': [(0, 50, 0.15, 'blood'), (50, 360, 0.15, 'earth')], 'shade': [1, 9], 'gamma': 1.3, 'cavity': 2.4, 'blotch': 1.8, 'streak': 1.6, 'moss': 0.4,
        'normal': 'T_Brick_Normal.png', 'variants': {'burnt': {'rules': [(0, 360, 0.15, 'leather')], 'shade': [0, 7]}}}),
    ('village', 'T_UnevenBrick_BaseColor.png', 'village_unevenbrick', 128, dict(STONE, grey='slate', rules=[(0, 360, 0.15, 'earth')], normal='T_UnevenBrick_Normal.png',
                                                                                  variants={'moss': {'moss': 2.0}, 'bone': {'grey': 'bone', 'rules': [(0, 360, 0.15, 'bone')], 'shade': [2, 10]}})),
    ('village', 'T_RockTrim_BaseColor.png', 'village_rocktrim', 256, dict(STONE, normal='T_RockTrim_Normal.png', variants={'slate': {'grey': 'slate'}})),
    ('village', 'T_RoundTiles_BaseColor.png', 'village_roundtiles', 128, {
        'grey': 'slate', 'rules': [(0, 55, 0.15, 'slate'), (55, 200, 0.15, 'moss')], 'shade': [1, 9], 'gamma': 1.3, 'cavity': 2.6, 'blotch': 1.6, 'moss': 0.9,
        'normal': 'T_RoundTiles_Normal.png',
        'variants': {'rust': {'rules': [(0, 55, 0.15, 'blood'), (55, 200, 0.15, 'moss')], 'shade': [0, 8]}, 'moss': {'moss': 2.4},
                     'lead': {'rules': [(0, 55, 0.15, 'iron'), (55, 200, 0.15, 'slate')], 'grey': 'iron', 'shade': [1, 8]}}}),
    ('village', 'T_WoodTrim_BaseColor.png', 'village_woodtrim', 256, {
        'grey': 'stone', 'rules': [(0, 70, 0.12, 'wood'), (70, 360, 0.12, 'earth')], 'shade': [0, 9], 'gamma': 1.35, 'cavity': 2.4, 'blotch': 1.2, 'streak': 0.8,
        'normal': 'T_WoodTrim_Normal.png',
        'variants': {'grey': {'rules': [(0, 360, 0.12, 'earth')], 'shade': [1, 9]}, 'char': {'rules': [(0, 360, 0.12, 'leather')], 'shade': [0, 6]}}}),
    ('village', 'T_MetalOrnaments_BaseColor.png', 'village_metal', 64, {'grey': 'iron', 'rules': [(0, 70, 0.2, 'leather')], 'shade': [1, 10], 'gamma': 1.2, 'cavity': 1.0, 'rust': 1.0}),
    ('village', 'T_VineLeaf.png', 'village_vine', 64, {'grey': 'moss', 'rules': [], 'shade': [2, 8], 'gamma': 1.2, 'cavity': 1.0,
                                                       'variants': {'dead': {'grey': 'earth', 'shade': [2, 7]}, 'blight': {'grey': 'arcane', 'shade': [1, 7]}}}),
    ('village', 'T_WindowGradient.png', 'village_glass', 32, {'grey': 'fire', 'rules': [], 'shade': [3, 13], 'gamma': 0.9, 'cavity': 0.0}),
    # Stylized Nature MegaKit
    ('nature', 'Bark_NormalTree.png', 'nature_bark', 128, {'grey': 'wood', 'rules': [(0, 360, 0.1, 'wood')], 'shade': [0, 8], 'gamma': 1.3, 'cavity': 2.6, 'moss': 0.6,
                                                         'normal': 'Bark_NormalTree_Normal.png', 'variants': {'ash': {'rules': [(0, 360, 0.1, 'stone')], 'grey': 'stone', 'shade': [1, 9]}}}),
    ('nature', 'Bark_DeadTree.png', 'nature_deadbark', 128, {'grey': 'stone', 'rules': [(0, 360, 0.08, 'bone')], 'shade': [1, 10], 'gamma': 1.25, 'cavity': 2.8,
                                                           'normal': 'Bark_DeadTree_Normal.png', 'variants': {'char': {'grey': 'leather', 'rules': [(0, 360, 0.08, 'leather')], 'shade': [0, 6]}}}),
    ('nature', 'Bark_TwistedTree.png', 'nature_twistbark', 128, {'grey': 'earth', 'rules': [(0, 360, 0.08, 'earth')], 'shade': [0, 8], 'gamma': 1.3, 'cavity': 2.8, 'moss': 0.9,
                                                               'normal': 'Bark_TwistedTree_Normal.png'}),
    ('nature', 'Leaves_NormalTree_C.png', 'nature_leaves', 128, {'grey': 'moss', 'rules': [(0, 360, 0.0, 'moss')], 'shade': [1, 8], 'gamma': 1.2, 'cavity': 1.2, 'blotch': 1.4,
                                                               'variants': {'rust': {'rules': [(0, 360, 0, 'blood')], 'grey': 'blood', 'shade': [2, 9]}, 'blight': {'rules': [(0, 360, 0, 'venom')], 'grey': 'venom', 'shade': [0, 6]},
                                                                            'ember': {'rules': [(0, 360, 0, 'fire')], 'grey': 'fire', 'shade': [1, 8]}}}),
    ('nature', 'Leaves_TwistedTree_C.png', 'nature_twistleaves', 128, {'grey': 'moss', 'rules': [(0, 360, 0.0, 'arcane')], 'shade': [1, 8], 'gamma': 1.2, 'cavity': 1.2, 'blotch': 1.4,
                                                                     'variants': {'moss': {'rules': [(0, 360, 0, 'moss')], 'shade': [0, 7]}, 'blood': {'rules': [(0, 360, 0, 'blood')], 'shade': [1, 8]}}}),
    ('nature', 'Leaf_Pine_C.png', 'nature_pine', 128, {'grey': 'moss', 'rules': [(0, 360, 0.0, 'venom')], 'shade': [0, 6], 'gamma': 1.2, 'cavity': 1.0, 'blotch': 1.2,
                                                     'variants': {'frost': {'rules': [(0, 360, 0, 'sky')], 'grey': 'sky', 'shade': [3, 11]}, 'rust': {'rules': [(0, 360, 0, 'leather')], 'shade': [2, 9]}}}),
    ('nature', 'Leaves.png', 'nature_foliage', 256, {'grey': 'moss', 'rules': [(0, 40, 0.15, 'blood'), (40, 70, 0.15, 'fire'), (70, 170, 0.12, 'moss'), (170, 260, 0.15, 'arcane'), (260, 360, 0.15, 'blood')],
                                                   'shade': [1, 9], 'gamma': 1.2, 'cavity': 1.4, 'variants': {'wither': {'rules': [(0, 360, 0.1, 'earth')], 'grey': 'earth'}}}),
    ('nature', 'Flowers.png', 'nature_flowers', 128, {'grey': 'bone', 'rules': [(0, 40, 0.2, 'blood'), (40, 75, 0.2, 'bone'), (75, 200, 0.2, 'venom'), (200, 290, 0.2, 'arcane'), (290, 360, 0.2, 'blood')],
                                                    'shade': [2, 11], 'gamma': 1.15, 'cavity': 1.2, 'variants': {'nightshade': {'rules': [(0, 360, 0.15, 'arcane')], 'grey': 'arcane'}}}),
    ('nature', 'Grass.png', 'nature_grass', 32, {'grey': 'moss', 'rules': [(0, 50, 0.2, 'earth'), (50, 360, 0.2, 'moss')], 'shade': [1, 9], 'gamma': 1.2, 'cavity': 0.0,
                                               'variants': {'dead': {'rules': [(0, 360, 0.2, 'earth')], 'grey': 'earth', 'shade': [3, 10]}, 'frost': {'rules': [(0, 360, 0.2, 'sky')], 'grey': 'sky', 'shade': [4, 12]}}}),
    ('nature', 'Mushrooms.png', 'nature_mushrooms', 128, {'grey': 'bone', 'rules': [(0, 45, 0.2, 'blood'), (45, 75, 0.2, 'fire'), (75, 200, 0.15, 'venom'), (200, 360, 0.15, 'arcane')],
                                                        'shade': [1, 11], 'gamma': 1.2, 'cavity': 1.8, 'blotch': 1.2}),
    ('nature', 'PathRocks_Diffuse.png', 'nature_pathrocks', 128, dict(STONE, rules=[(60, 200, 0.12, 'moss'), (0, 60, 0.15, 'earth')], moss=1.0)),
    ('nature', 'Rocks_Diffuse.png', 'nature_rocks', 128, dict(STONE, grey='slate', rules=[(60, 200, 0.12, 'moss'), (0, 60, 0.15, 'earth')], moss=0.8,
                                                              variants={'snow': {'grey': 'sky', 'rules': [(60, 200, 0.12, 'sky')], 'shade': [4, 14], 'moss': 0}})),
    ('nature', 'Rocks_Desert_Diffuse.png', 'nature_desertrocks', 128, dict(STONE, grey='bone', rules=[(0, 360, 0.12, 'earth')], moss=0, shade=[3, 12],
                                                                             variants={'ash': {'grey': 'stone', 'rules': [(0, 360, 0.12, 'stone')], 'shade': [1, 9]}})),
    # Textured Stylized Trees
    ('trees', 'Tree_Bark.jpg', 'trees_bark', 64, {'grey': 'wood', 'rules': [(0, 360, 0.08, 'wood')], 'shade': [0, 8], 'gamma': 1.3, 'cavity': 2.4, 'moss': 0.5}),
    ('trees', 'Birch_Bark.png', 'trees_birchbark', 64, {'grey': 'bone', 'rules': [], 'shade': [0, 11], 'gamma': 1.2, 'cavity': 2.0, 'blotch': 1.6,
                                                     'variants': {'dead': {'grey': 'stone', 'shade': [0, 9]}}}),
    ('trees', 'Color Variations/Bark_Dead.png', 'trees_deadbark', 64, {'grey': 'stone', 'rules': [(0, 360, 0.08, 'earth')], 'shade': [0, 9], 'gamma': 1.3, 'cavity': 2.6}),
    ('trees', 'Color Variations/Birch_Bark_Dead.png', 'trees_deadbirch', 64, {'grey': 'bone', 'rules': [], 'shade': [0, 10], 'gamma': 1.3, 'cavity': 2.2}),
    ('trees', 'Tree_Leaves.png', 'trees_leaves', 128, {'grey': 'moss', 'rules': [(0, 360, 0, 'moss')], 'shade': [1, 8], 'gamma': 1.25, 'cavity': 1.6,
                                                     'variants': {'rust': {'rules': [(0, 360, 0, 'blood')], 'grey': 'blood', 'shade': [2, 9]}, 'ember': {'rules': [(0, 360, 0, 'fire')], 'grey': 'fire', 'shade': [1, 7]},
                                                                  'blight': {'rules': [(0, 360, 0, 'venom')], 'grey': 'venom', 'shade': [0, 6]}}}),
    ('trees', 'Birch_Leaves_Green.png', 'trees_birchleaves', 128, {'grey': 'moss', 'rules': [(0, 360, 0, 'venom')], 'shade': [1, 7], 'gamma': 1.25, 'cavity': 1.6}),
    ('trees', 'Birch_Leaves_Yellow.png', 'trees_birchgold', 128, {'grey': 'gold', 'rules': [(0, 360, 0, 'gold')], 'shade': [2, 10], 'gamma': 1.25, 'cavity': 1.6}),
    ('trees', 'Pine_Leaves.png', 'trees_pine', 128, {'grey': 'moss', 'rules': [(0, 60, 0.15, 'wood'), (60, 360, 0, 'moss')], 'shade': [0, 7], 'gamma': 1.25, 'cavity': 1.2,
                                                   'variants': {'frost': {'rules': [(60, 360, 0, 'sky')], 'shade': [3, 11]}}}),
]
for extra in ('Blue', 'Cyan', 'DarkRed', 'Light', 'Orange', 'Pink', 'Purple', 'Red'):  # the trees' own colour variations
    ramp = {'Blue': 'slate', 'Cyan': 'venom', 'DarkRed': 'blood', 'Light': 'moss', 'Orange': 'fire', 'Pink': 'flesh', 'Purple': 'arcane', 'Red': 'blood'}[extra]
    TEX.append(('trees', f'Color Variations/Leaves_{extra}.png', f'trees_leaves_{extra.lower()}', 128,
                {'grey': ramp, 'rules': [(0, 360, 0, ramp)], 'shade': [1, 8] if extra != 'Light' else [2, 9], 'gamma': 1.25, 'cavity': 1.6}))
TEX.append(('trees', 'Color Variations/Pine_Leaves_Light.png', 'trees_pine_light', 128, {'grey': 'moss', 'rules': [(0, 360, 0, 'moss')], 'shade': [1, 8], 'gamma': 1.25, 'cavity': 1.2}))
TEX.append(('trees', 'Color Variations/Pine_Leaves_Red.png', 'trees_pine_red', 128, {'grey': 'blood', 'rules': [(0, 360, 0, 'blood')], 'shade': [1, 8], 'gamma': 1.25, 'cavity': 1.2}))


# ------------------------------------------------------------------ noise
def periodic_noise(n, cells, seed):
    """Tileable value noise, n x n, `cells` lattice cells across."""
    rng = np.random.default_rng(seed)
    g = rng.random((cells, cells)).astype(np.float32)
    t = np.arange(n, dtype=np.float32) * cells / n
    i0 = np.floor(t).astype(int)
    f = t - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % cells
    a = g[np.ix_(i0, i0)]; b = g[np.ix_(i0, i1)]; c = g[np.ix_(i1, i0)]; d = g[np.ix_(i1, i1)]
    fy, fx = f[:, None], f[None, :]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(n, seed, base=4, octaves=4):
    out, amp, tot = np.zeros((n, n), np.float32), 1.0, 0.0
    for o in range(octaves):
        cells = min(n, base * 2 ** o)
        out += periodic_noise(n, cells, seed + o * 17) * amp
        tot += amp
        amp *= 0.5
    return out / tot


def streaks(n, seed, count=None):
    """Drip streaks: dark runs down from random points, wrapping vertically."""
    rng = np.random.default_rng(seed)
    out = np.zeros((n, n), np.float32)
    for _ in range(count or n // 4):
        x = rng.integers(0, n); y0 = rng.integers(0, n); ln = rng.integers(n // 8, n // 2); w = rng.integers(1, 3)
        strength = rng.random() * 0.8 + 0.2
        for k in range(ln):
            out[(y0 + k) % n, x:x + w] += strength * (1 - k / ln)
        x += rng.integers(-1, 2)
    return np.clip(out, 0, 1)


def hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn + 1e-6
    h = np.where(mx == r, (g - b) / d % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 1e-4, (mx - mn) / (mx + 1e-6), 0)
    return h % 360, s, mx


# ------------------------------------------------------------------ repaint
def repaint(src, size, rc, normal=None, seed=0):
    img = Image.open(src).convert('RGBA')
    w, h = img.size
    tw, th = size, max(1, round(size * h / w))
    small = img.resize((tw, th), Image.BOX)
    a = np.asarray(small).astype(np.float32) / 255.0
    rgb, alpha = a[..., :3], a[..., 3]
    hue, sat, val = hsv(rgb)
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    # ramp per pixel
    ramp = np.full(lum.shape, R[rc['grey']], np.int32)
    for lo, hi, smin, name in rc['rules']:
        m = (hue >= lo) & (hue < hi) & (sat >= smin)
        if smin == 0:
            m = (hue >= lo) & (hue < hi) | (sat < 1e-3)
        ramp[m] = R[name]
    # shade: brightness, normalised over the texture's opaque pixels, through a darker curve
    op = alpha > 0.5
    ref = lum[op] if op.any() else lum.ravel()
    lo, hi = np.percentile(ref, 2), np.percentile(ref, 98)
    t = np.clip((lum - lo) / max(1e-3, hi - lo), 0, 1) ** rc.get('gamma', 1.2)
    s0, s1 = rc['shade']
    shade = s0 + t * (s1 - s0)
    n = max(tw, th)
    # grime
    if normal and os.path.exists(normal):
        nm = np.asarray(Image.open(normal).convert('RGB').resize((tw, th), Image.BOX)).astype(np.float32) / 255.0
        nz = nm[..., 2] * 2 - 1
        cav = np.clip((0.97 - nz) * 4, 0, 1)
    else:  # local contrast: darker than its neighbourhood = a crevice
        blur = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).resize((max(1, tw // 4), max(1, th // 4)), Image.BOX).resize((tw, th), Image.BILINEAR)).astype(np.float32) / 255
        cav = np.clip((blur - lum) * 5, 0, 1)
    shade -= cav * rc.get('cavity', 1.5)
    blot = fbm(n, seed + 1)[:th, :tw]
    shade -= np.clip(blot - 0.45, 0, 1) * 2 * rc.get('blotch', 1.0)
    if rc.get('streak'):
        shade -= streaks(n, seed + 2)[:th, :tw] * rc['streak']
    speck = np.random.default_rng(seed + 3).random((th, tw)).astype(np.float32)
    shade += (speck - 0.5) * 0.7
    if rc.get('rust'):  # rust blooms in the metal's pits
        rmask = (fbm(n, seed + 4, 8)[:th, :tw] * (0.6 + cav)) > (1.05 - 0.25 * rc['rust'])
        ramp[rmask & (ramp == R['iron'])] = R['leather']
        shade[rmask] -= 0.6
    if rc.get('moss'):
        mm = (fbm(n, seed + 5, 6)[:th, :tw] * 0.7 + cav * 0.6) > (1.15 - 0.22 * rc['moss'])
        ramp[mm] = R['moss']
        shade[mm] = np.minimum(shade[mm], 3 + 3 * blot[mm])
    # dither, snap
    yy, xx = np.mgrid[0:th, 0:tw]
    q = np.floor(shade + BAYER[yy % 4, xx % 4]).astype(np.int32)
    q = np.clip(q, 0, 15)
    out = np.zeros((th, tw, 4), np.uint8)
    out[..., :3] = COLS[ramp, q]
    out[..., 3] = np.where(alpha > 0.5, 255, 0)
    return Image.fromarray(out, 'RGBA'), bool((alpha < 0.5).any())


def swatch():
    """The palette swatch atlas for the packs with no textures (and every part added in the
    rework): 16 ramps x 16 shades, an 8 px cell each, mottled with the shades either side."""
    C = 8
    out = np.zeros((16 * C, 16 * C, 4), np.uint8)
    rng = np.random.default_rng(77)
    for r in range(16):
        for s in range(16):
            n = rng.random((C, C)) + periodic_noise(C, 2, r * 16 + s) * 0.6 - 0.3
            d = np.where(n < 0.22, -1, np.where(n > 0.86, 1, 0))
            q = np.clip(s + d, 0, 15)
            out[r * C:(r + 1) * C, s * C:(s + 1) * C, :3] = COLS[r, q]
    out[..., 3] = 255
    return Image.fromarray(out, 'RGBA')


def helpers(raw, out):
    """The runtime's weathering and ground textures, from the packs' own noise and wear masks."""
    def gray(path, size):
        return np.asarray(Image.open(path).convert('L').resize((size, size), Image.BOX)).astype(np.float32) / 255
    vtex = os.path.join(raw, 'village/Medieval Village MegaKit[Standard]/Textures')
    ptex = os.path.join(raw, 'props/Textures')
    ntex = os.path.join(raw, 'nature/Textures')
    # grime: the brushed noise and the page noise, posterised to 6 levels (R), terrain noise (G)
    g = gray(os.path.join(vtex, 'T_BrushedNoise.png'), 128) * 0.6 + gray(os.path.join(ptex, 'T_Page_Noise.png'), 128) * 0.4
    tn = gray(os.path.join(vtex, 'T_Noise_Terrain.png'), 128)
    gr = np.zeros((128, 128, 4), np.uint8)
    gr[..., 0] = (np.floor(g * 6) / 5 * 255).clip(0, 255)
    gr[..., 1] = (np.floor(tn * 8) / 7 * 255).clip(0, 255)
    gr[..., 2] = (fbm(128, 900, 8) * 255).astype(np.uint8)
    gr[..., 3] = 255
    Image.fromarray(gr, 'RGBA').save(os.path.join(out, 'grime.png'))
    # wear: the bottom and top wear masks (damp rising from the ground; weathered tops)
    bw = gray(os.path.join(vtex, 'T_BottomWear.png'), 128)
    tw = gray(os.path.join(vtex, 'T_TopWear.png'), 128)
    we = np.zeros((128, 128, 4), np.uint8)
    we[..., 0] = (np.floor(bw * 4) / 3 * 255).clip(0, 255)
    we[..., 1] = (np.floor(tw * 4) / 3 * 255).clip(0, 255)
    we[..., 3] = 255
    Image.fromarray(we, 'RGBA').save(os.path.join(out, 'wear.png'))
    # the ground tiles: (id, ramp, shade range, recipe), drawn from the packs' noise, rocks and
    # leaf cards, every one tiling and snapped to the palette
    N = 128
    leaves = np.asarray(Image.open(os.path.join(ntex, 'Leaves.png')).convert('RGBA').resize((N, N), Image.BOX))[..., 3] > 128
    rocks = gray(os.path.join(ntex, 'PathRocks_Diffuse.png'), N)
    desert = gray(os.path.join(ntex, 'Rocks_Desert_Diffuse.png'), N)
    cliff = gray(os.path.join(ntex, 'Rocks_Diffuse.png'), N)
    tiles = {
        'meadow': ('moss', (1, 6), lambda s: s - (fbm(N, 11, 16) > 0.62) * 1.5 + (np.random.default_rng(1).random((N, N)) > 0.93) * 2),
        'deadgrass': ('earth', (3, 10), lambda s: s - (fbm(N, 12, 16) > 0.6) * 2),
        'forest': ('wood', (0, 6), lambda s: s - np.roll(leaves, 37, 0) * 1.5 + np.roll(leaves.T, 11, 1) * 1.2),
        'mud': ('earth', (0, 4), lambda s: s - (fbm(N, 13, 8) > 0.55) * 1.5),
        'gravel': ('stone', (2, 10), lambda s: s * 0.4 + rocks * 7 + 1),
        'cliff': ('slate', (1, 10), lambda s: s * 0.3 + cliff * 8),
        'desert': ('bone', (2, 10), lambda s: s * 0.5 + desert * 5),
        'ash': ('stone', (0, 7), lambda s: s - (fbm(N, 14, 32) > 0.66) * 2),
        'snow': ('sky', (8, 15), lambda s: s - (fbm(N, 15, 8) > 0.6) * 1.2),
        'marsh': ('venom', (0, 5), lambda s: s - (fbm(N, 16, 8) > 0.5) * 1.5),
        'gravesoil': ('earth', (0, 5), lambda s: s - (fbm(N, 17, 16) > 0.58) * 1.2 + (np.random.default_rng(2).random((N, N)) > 0.97) * 3),
        'cobble': ('stone', (1, 9), lambda s: s * 0.3 + gray(os.path.join(vtex, 'T_UnevenBrick_BaseColor.png'), N) * 9),
        'heather': ('arcane', (0, 4), lambda s: s - (fbm(N, 18, 16) > 0.55) * 1.5),
        'rust': ('blood', (1, 7), lambda s: s - (fbm(N, 19, 16) > 0.6) * 1.5),
    }
    yy, xx = np.mgrid[0:N, 0:N]
    for name, (ramp, (s0, s1), f) in tiles.items():
        base = fbm(N, sum(map(ord, name)), 4) * (s1 - s0) + s0
        sh = f(base).astype(np.float32)
        sh = np.clip(sh, s0 - 1, s1)
        q = np.clip(np.floor(sh + BAYER[yy % 4, xx % 4]), 0, 15).astype(np.int32)
        im = np.zeros((N, N, 4), np.uint8)
        im[..., :3] = COLS[R[ramp], q]
        if name == 'meadow':  # tufts of dead grass and a few dark flowers in the turf
            m = fbm(N, 20, 16) > 0.7
            im[m, :3] = COLS[R['earth'], np.clip(q[m] + 2, 0, 15)]
        if name == 'snow':
            m = fbm(N, 21, 8) > 0.72
            im[m, :3] = COLS[R['slate'], np.clip(q[m] - 4, 0, 15)]
        im[..., 3] = 255
        Image.fromarray(im, 'RGBA').save(os.path.join(out, f'ground_{name}.png'))
    return list(tiles)


def main():
    raw, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    from packs import MODELS, texture_dir  # noqa: E402
    meta = {'atlases': {}, 'swatch': 'swatch.png', 'grime': 'grime.png', 'wear': 'wear.png'}
    for k, (pack, file, tid, size, rc) in enumerate(TEX):
        d = texture_dir(raw, pack)
        src = os.path.join(d, file)
        if not os.path.exists(src):  # a few ship only beside the glTF models
            src = os.path.join(raw, MODELS[pack][0], file)
        nrm = os.path.join(d, rc['normal']) if rc.get('normal') else None
        if nrm and not os.path.exists(nrm):
            nrm = os.path.join(d, 'Normals Godot-Unity', rc['normal'])
        img, cut = repaint(src, size, rc, nrm, seed=k * 101)
        img.save(os.path.join(out, tid + '.png'))
        entry = {'pack': pack, 'source': file, 'file': tid + '.png', 'size': list(img.size), 'cutout': cut, 'variants': {}}
        for vn, ov in rc.get('variants', {}).items():
            vimg, _ = repaint(src, size, {**rc, **ov}, nrm, seed=k * 101 + 7)
            vimg.save(os.path.join(out, f'{tid}@{vn}.png'))
            entry['variants'][vn] = f'{tid}@{vn}.png'
        meta['atlases'][tid] = entry
        print('repaint', tid, img.size, list(entry['variants']))
    swatch().save(os.path.join(out, 'swatch.png'))
    meta['ground'] = helpers(raw, out)
    json.dump(meta, open(os.path.join(out, 'textures.json'), 'w'), indent=1)


if __name__ == '__main__':
    sys.path.insert(0, HERE)
    main()
