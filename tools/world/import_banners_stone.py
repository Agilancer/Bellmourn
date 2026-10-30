"""Cut the banner and stone sheets into the texture library.

Banners: four sheets of five hanging banners on transparent ground. Each is cut out (between the
banners, where no ink is), trimmed and brought down to 256 px tall into assets/textures/banners/,
and listed in library.json as a sprite of category 'banner' with its allegiance:
  velscour  the ones bearing Lord Velscour's V: only where his people are (the keep, his enemies)
  holy      the ones bearing the T: the cathedral and holy places
  town      the rest (stag, ship, tower and keys, ram, eagle, bridge): the village and good folk
(They aren't 'hanging' sprites, so the undercroft never hangs one of them by itself.)

Stone: nine sheets of ten seamless masonry tiles each (five across, two down). Each tile is cut
from its cell exactly where it repeats: outside the grid lines some sheets draw between cells, at
the bounds where its left edge runs on into its right and its top into its bottom. Some of the
sheets' tiles don't quite meet themselves at any cut, and what's left of their seams is closed
(heal). Each is brought down to 256 px with itself wrapped round it (so it stays seamless) into
assets/textures/surfaces/ as masonry_<stone>_<nn>.png, and listed as a 'wall' surface tiling both
ways. The run ends by printing the worst wrap seams (1 is seamless).

  python tools/world/import_banners_stone.py --banners b1.png b2.png b3.png b4.png \\
      --stone ashlar.png blackstone.png fieldstone.png honey.png slate.png red.png white.png mossy.png ochre.png
(the sheets in the order of BANNERS and STONE below)
"""
import argparse, json, os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'textures')
LIB = os.path.join(ROOT, 'library.json')
# each banner sheet, left to right: (id, allegiance)
BANNERS = [
    [('velscour_crimson_thorn', 'velscour'), ('velscour_bloodstripe', 'velscour'), ('velscour_violet_tatters', 'velscour'),
     ('velscour_gilded_sunburst', 'velscour'), ('holy_azure_sunburst', 'holy')],
    [('holy_verdant_cross', 'holy'), ('holy_winged_star', 'holy'), ('town_stag', 'town'), ('town_ship', 'town'), ('town_tower_and_keys', 'town')],
    [('velscour_midnight_moons', 'velscour'), ('velscour_ember_rag', 'velscour'), ('velscour_ash_and_blood', 'velscour'),
     ('velscour_twin_serpents', 'velscour'), ('holy_harvest', 'holy')],
    [('holy_lilies', 'holy'), ('holy_open_hands', 'holy'), ('town_ram', 'town'), ('town_eagle', 'town'), ('town_bridge', 'town')],
]
STONE = ['grey_ashlar', 'blackstone', 'fieldstone', 'honey_limestone', 'slate', 'red_sandstone', 'white_limestone', 'mossy_ashlar', 'ochre_sandstone']
BANNER_H = 256
TILE = 256


def cut_banners(path, names):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im)[..., 3]
    ink = (a > 24).sum(0)
    W = a.shape[1]
    cuts = [0]
    for k in range(1, len(names)):                  # the emptiest column near each fifth
        c, r = int(k * W / len(names)), W // 12
        cuts.append(c - r + int(np.argmin(ink[c - r:c + r])))
    cuts.append(W)
    out = []
    for (name, side), x0, x1 in zip(names, cuts[:-1], cuts[1:]):
        piece = im.crop((x0, 0, x1, im.height))
        piece = piece.crop(piece.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox())
        w = max(1, round(piece.width * BANNER_H / piece.height))
        piece = piece.resize((w, BANNER_H), Image.LANCZOS)
        rel = f'banners/{name}.png'
        os.makedirs(os.path.join(ROOT, 'banners'), exist_ok=True)
        piece.save(os.path.join(ROOT, rel), optimize=True)
        out.append({'id': name, 'file': rel, 'category': 'banner', 'allegiance': side, 'source': os.path.basename(path),
                    'size': [w, BANNER_H], 'height_m': 3.4})
    return out


def cut_stone(path, stone):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    out = []
    grey = np.asarray(im.convert('L')).astype(float)
    xs, ys = cells(grey, 5, 1), cells(grey, 2, 0)
    for j in range(2):
        for i in range(5):
            x0, x1 = period(grey, xs[i], (ys[j][1], ys[j][2]), 1)
            y0, y1 = period(grey, ys[j], (x0, x1), 0)
            # brought down with the tile wrapped round it (a 3 x 3 of it, the middle kept), so the
            # resampling at its edges reads the other side, as the game's repeat will
            cell = heal(np.asarray(im.crop((x0, y0, x1, y1))))
            big = Image.fromarray(np.tile(cell, (3, 3, 1))).resize((3 * TILE, 3 * TILE), Image.LANCZOS)
            tile = big.crop((TILE, TILE, 2 * TILE, 2 * TILE))
            sid = f'masonry_{stone}_{j * 5 + i + 1:02d}'
            rel = f'surfaces/{sid}.png'
            tile.save(os.path.join(ROOT, rel), optimize=True)
            r, g, b = np.asarray(tile).reshape(-1, 3).mean(0)
            out.append({'id': sid, 'file': rel, 'kind': 'wall', 'source': os.path.basename(path), 'size': [TILE, TILE],
                        'tile_x': True, 'tile_y': True, 'color': '#%02x%02x%02x' % (round(r), round(g), round(b))})
    return out


def cells(grey, n, axis, r=8):
    """The n cells along `axis` (1: across, 0: down) as (start lo, start hi, end lo, end hi): the
    ranges each cell's true bounds may lie in. Where the sheet draws a grid line between two cells
    (a run of lines each far from the next: over 2.5 times the sheet's usual step) the bounds lie
    just outside it; where the cells simply meet, within r px of the nominal bound."""
    g = grey if axis == 1 else grey.T
    L = g.shape[1]
    jump = np.abs(np.diff(g, axis=1)).mean(0)          # jump[k]: from line k to line k + 1
    base = np.median(jump)
    cuts = []                                           # (last line of the cell before, first of the cell after)
    for k in range(1, n):
        c = round(k * L / n)
        hit = [q for q in range(c - r, c + r) if jump[q] > 2.5 * base]
        cuts.append((min(hit), max(hit) + 1, 3) if hit else (c - 1, c, r))
    out = []
    for k in range(n):
        if k == 0: s0, s1 = 0, 3
        else: e, s, slack = cuts[k - 1]; s0, s1 = (s, s + slack) if slack == 3 else (s - r, s + r)
        if k == n - 1: e0, e1 = L - 3, L
        else: e, s, slack = cuts[k]; e0, e1 = (e + 1 - slack, e + 1) if slack == 3 else (e + 1 - r, e + 1 + r)
        out.append((s0, s1, e0, e1))
    return out


def period(grey, cell, across, axis):
    """Where a cell's tile truly starts and ends along `axis`: of the bounds `cell` allows, the pair
    whose first and last lines meet as smoothly as neighbouring lines inside it do. `across`: the
    cell's span the other way (the middle of it is what's compared)."""
    s0, s1, e0, e1 = cell
    m = (across[1] - across[0]) // 8
    lo, hi = across[0] + m, across[1] - m
    g = grey[lo:hi, :] if axis == 1 else grey[:, lo:hi].T
    inner = np.abs(np.diff(g[:, s1:e0], axis=1)).mean()
    best = min((np.abs(g[:, s] - g[:, e - 1]).mean() / inner, s, e) for s in range(s0, s1 + 1) for e in range(e0, e1 + 1))
    return best[1], best[2]


def heal(cell, w=24):
    """Close what's left of a tile's seams: some of the sheets' tiles don't quite meet themselves at
    any cut. Across each wrap the mismatch (smoothed along the edge, so it brings no streaks) is
    split between the two sides and faded out over w px in from each, so the tile's edges meet and
    its inside is left as it was."""
    a = cell.astype(float)
    ramp = (1 - np.arange(w) / w)[None, :, None]
    k = np.ones(9) / 9
    for axis in (1, 0):
        b = a if axis == 1 else a.transpose(1, 0, 2)
        d = (b[:, -1] - b[:, 0]) / 2
        d = np.stack([np.convolve(np.pad(d[:, c], 4, mode='wrap'), k, 'valid') for c in range(d.shape[1])], 1)
        b[:, :w] += d[:, None, :] * ramp
        b[:, -w:] -= d[:, None, :] * ramp[:, ::-1]
    return np.clip(a, 0, 255).round().astype(np.uint8)


def seam(path):
    """How the tile meets itself across its wrap, against a step inside it (1: seamless)."""
    a = np.asarray(Image.open(path).convert('L')).astype(float)
    return max(np.abs(a[:, 0] - a[:, -1]).mean() / np.abs(np.diff(a, axis=1)).mean(),
               np.abs(a[0] - a[-1]).mean() / np.abs(np.diff(a, axis=0)).mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--banners', nargs=len(BANNERS), required=True)
    ap.add_argument('--stone', nargs=len(STONE), required=True)
    args = ap.parse_args()
    lib = json.load(open(LIB))
    sprites = [b for path, names in zip(args.banners, BANNERS) for b in cut_banners(path, names)]
    surfaces = [s for path, stone in zip(args.stone, STONE) for s in cut_stone(path, stone)]
    ids = {s['id'] for s in sprites + surfaces}
    lib['sprites'] = [s for s in lib['sprites'] if s['id'] not in ids] + sprites
    lib['surfaces'] = [s for s in lib['surfaces'] if s['id'] not in ids] + surfaces
    with open(LIB, 'w') as f:
        json.dump(lib, f, indent=1)
    print(f'{len(sprites)} banners, {len(surfaces)} stone tiles')
    worst = sorted((seam(os.path.join(ROOT, s['file'])), s['id']) for s in surfaces)[-3:]
    print('worst wrap seams (1 is seamless):', ', '.join(f'{sid} {v:.2f}' for v, sid in worst))


if __name__ == '__main__':
    main()
