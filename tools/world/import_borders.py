"""The terrain-borders-scatter sheets (F:/!  BELLMOURN/Textures/terrain-borders-scatter-20-sheets.zip)
cut into their pieces and packed into two small atlases for the ground decals (src/fps/dressing.js).

Each sheet is RGBA on transparency: a piece is a connected blob of its alpha. The border sheets give
their long straight strips (turned to lie along u), the scatter sheets their rocks, pebbles, debris
and cracked patches. Only the sheets the world uses are taken, a piece at half the sheet's size, so
the two pages stay a megabyte or so between them.

  python -I tools/world/import_borders.py <the unzipped sheets folder>

Writes assets/textures/decals/borders_0.webp, borders_1.webp and borders.json:
  { pages: [...], groups: { name: [ {page, uv: [u0, v0, u1, v1], w, h (metres at 1 px = 1 cm... see
  'scale'), aspect} ] } }
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'textures', 'decals')
# sheet -> (group, kind, how many pieces to keep[, a strip's least length/width, least fill of its box])
SHEETS = {
    '09-rough-gravel-edging.png': ('edging', 'border', 12, 1.7, 0.28),
    '10-aged-path-remnants.png': ('flags', 'border', 12, 1.5, 0.25),
    '01-gray-cobblestone-borders.png': ('cobble', 'border', 8, 2.3, 0.45),
    '08-river-stone-borders.png': ('riverband', 'border', 6, 2.3, 0.45),
    '11-gray-loose-rocks.png': ('rock_gray', 'scatter', 16),
    '12-brown-loose-rocks.png': ('rock_brown', 'scatter', 14),
    '13-pale-limestone-rocks.png': ('rock_pale', 'scatter', 14),
    '16-dark-damp-rocks.png': ('rock_dark', 'scatter', 14),
    '17-river-pebble-scatter.png': ('pebbles', 'scatter', 16),
    '18-stone-clusters.png': ('clusters', 'scatter', 14),
    '19-road-damage-debris.png': ('debris', 'scatter', 14),
    '20-terrain-fillers.png': ('cracks', 'scatter', 12),
}
SCALE = 0.47         # (pieces at a little under half the sheet's size: one 2048 x 1024 page)
PAGE = 2048
PAD = 3


def pieces(path, kind, keep, minLong=2.3, minFill=0.45):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im)[:, :, 3]
    mask = ndimage.binary_dilation(a > 40, iterations=2)
    lab, n = ndimage.label(mask)
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if sl is None:
            continue
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        area = int((lab[sl] == i + 1).sum())
        if area < 900 or w < 24 or h < 24:
            continue
        crop = np.asarray(im)[sl].copy()
        crop[:, :, 3] = np.where(lab[sl] == i + 1, crop[:, :, 3], 0)   # (only this piece, not a neighbour's corner)
        long_ = max(w, h) / min(w, h)
        if kind == 'border':
            if long_ < minLong:                       # (a straight strip, not a corner or a junction)
                continue
            fill = area / (w * h)
            if fill < minFill:                       # (an L or a curve fills its box poorly)
                continue
            if h > w:
                crop = np.rot90(crop)
        out.append((area, Image.fromarray(crop)))
    out.sort(key=lambda t: -t[0])
    if kind == 'scatter':                         # (a spread of sizes: the biggest, then every other)
        out = out[:keep // 2] + out[keep // 2::2]
    return [p for _, p in out[:keep]]


def main():
    os.makedirs(OUT, exist_ok=True)
    items = []
    for sheet, (group, kind, keep, *lim) in SHEETS.items():
        for p in pieces(os.path.join(SRC, sheet), kind, keep, *lim):
            p = p.resize((max(8, round(p.width * SCALE)), max(8, round(p.height * SCALE))), Image.LANCZOS)
            items.append((group, kind, p))
    # pack: tallest first, in shelves across each page
    items.sort(key=lambda t: -t[2].height)
    pages, place = [Image.new('RGBA', (PAGE, PAGE), (0, 0, 0, 0))], []
    x = y = shelf = 0
    for group, kind, p in items:
        if x + p.width + PAD > PAGE:
            x, y, shelf = 0, y + shelf + PAD, 0
        if y + p.height + PAD > PAGE:
            pages.append(Image.new('RGBA', (PAGE, PAGE), (0, 0, 0, 0)))
            x = y = shelf = 0
        pg = pages[-1]
        # (bleed the piece's colour a pixel out under transparent alpha, so filtering never fetches black)
        bled = p.copy()
        rgb = Image.new('RGBA', p.size)
        rgb.paste(p.convert('RGB').filter(__import__('PIL.ImageFilter', fromlist=['MaxFilter']).MaxFilter(3)), (0, 0))
        rgb.putalpha(0)
        rgb.alpha_composite(bled)
        pg.paste(rgb, (x + 1, y + 1))
        place.append((group, kind, len(pages) - 1, x + 1, y + 1, p.width, p.height))
        x += p.width + PAD
        shelf = max(shelf, p.height + 2)
    # (each page cut down to the power of two its pieces need)
    hs = [1 << (max(py + h for _, _, pg, _, py, _, h in place if pg == i) + 1 - 1).bit_length() for i in range(len(pages))]
    pages = [pg.crop((0, 0, PAGE, hs[i])) for i, pg in enumerate(pages)]
    groups = {}
    for group, kind, page, px, py, w, h in place:
        H = hs[page]
        groups.setdefault(group, []).append({'page': page, 'kind': kind, 'uv': [round(px / PAGE, 5), round(py / H, 5), round((px + w) / PAGE, 5), round((py + h) / H, 5)],
                                             'px': [w, h]})
    names = []
    for i, pg in enumerate(pages):
        name = f'borders_{i}.webp'
        pg.save(os.path.join(OUT, name), 'WEBP', quality=86, method=6)
        names.append(name)
    json.dump({'pages': names, 'pxPerMetre': 64, 'groups': groups}, open(os.path.join(OUT, 'borders.json'), 'w'), indent=1)
    print(len(place), 'pieces on', len(pages), 'pages:', {g: len(v) for g, v in groups.items()},
          [os.path.getsize(os.path.join(OUT, n)) // 1024 for n in names], 'KiB')


main()
