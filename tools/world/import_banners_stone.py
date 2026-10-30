"""Cut the banner and stone sheets into the texture library.

Banners: four sheets of five hanging banners on transparent ground. Each is cut out (between the
banners, where no ink is), trimmed and brought down to 256 px tall into assets/textures/banners/,
and listed in library.json as a sprite of category 'banner' with its allegiance:
  velscour  the ones bearing Lord Velscour's V: only where his people are (the keep, his enemies)
  holy      the ones bearing the T: the cathedral and holy places
  town      the rest (stag, ship, tower and keys, ram, eagle, bridge): the village and good folk
(They aren't 'hanging' sprites, so the undercroft never hangs one of them by itself.)

Stone: nine sheets of ten seamless masonry tiles each (five across, two down). Each tile is cut
from its cell (a pixel or two in from the cell's edge, where the sheet draws its grid), brought
down to 256 px into assets/textures/surfaces/ as masonry_<stone>_<nn>.png and listed as a 'wall'
surface tiling both ways.

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
    for j in range(2):
        for i in range(5):
            x0, x1 = round(i * W / 5) + 2, round((i + 1) * W / 5) - 2
            y0, y1 = round(j * H / 2) + 2, round((j + 1) * H / 2) - 2
            tile = im.crop((x0, y0, x1, y1)).resize((TILE, TILE), Image.LANCZOS)
            sid = f'masonry_{stone}_{j * 5 + i + 1:02d}'
            rel = f'surfaces/{sid}.png'
            tile.save(os.path.join(ROOT, rel), optimize=True)
            r, g, b = np.asarray(tile).reshape(-1, 3).mean(0)
            out.append({'id': sid, 'file': rel, 'kind': 'wall', 'source': os.path.basename(path), 'size': [TILE, TILE],
                        'tile_x': True, 'tile_y': True, 'color': '#%02x%02x%02x' % (round(r), round(g), round(b))})
    return out


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


if __name__ == '__main__':
    main()
