"""The cloth tiles as the villagers wear them: 1024 px colour, plus a normal map and a roughness
map made from each tile's luminance. Writes art/raw/villagers/build/cloth/.

python prep_cloth.py   (the tiles in art/raw/villagers/cloth/<name>.png)"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from clothes import normal_map, rough_map
import mh

# tile: (roughness, its spread with the tile's light and dark, normal strength)
TILES = {'linen_teal': (0.9, 0.15, 2.0), 'linen_brown': (0.9, 0.15, 2.0), 'burlap_coarse': (0.95, 0.1, 3.0),
         'burlap_dark': (0.95, 0.1, 3.0), 'quilted_red': (0.85, 0.15, 3.5), 'quilted_blue': (0.85, 0.15, 3.5),
         'damask_red': (0.62, 0.25, 1.6), 'damask_purple': (0.62, 0.25, 1.6), 'leather_tooled': (0.5, -0.3, 3.0),
         'leather_strapwork': (0.55, -0.3, 3.0)}

src = os.path.join(os.environ.get('BM_VILLAGER_SRC', os.path.join(mh.REPO, 'art', 'raw', 'villagers')), 'cloth')
dst = os.path.join(os.path.dirname(src), 'build', 'cloth')
os.makedirs(dst, exist_ok=True)
for k, (r, sp, ns) in TILES.items():
    Image.open(f'{src}/{k}.png').convert('RGB').resize((1024, 1024), Image.LANCZOS).save(f'{dst}/{k}.png')
    normal_map(f'{src}/{k}.png', f'{dst}/{k}_n.png', strength=ns, size=512)
    rough_map(f'{src}/{k}.png', f'{dst}/{k}_r.png', r, sp, size=512)
    print(k)

# metal, from the game's own material sheets (3 x 2 finishes each): one finish, mirrored 2 x 2 so it tiles
METALS = {'metal_steel': ('01_steel', 1, 0, 2.5), 'metal_dark': ('03_bright_steel', 0, 0, 2.0),
          'metal_bronze': ('10_bronze_copper', 1, 1, 2.0), 'metal_bands': ('09_bands', 0, 0, 3.0)}
for k, (sheet, cx, cy, ns) in METALS.items():
    im = Image.open(os.path.join(mh.REPO, 'art', 'materials', sheet + '.webp')).convert('RGB')
    w, h = im.width // 3, im.height // 2
    cell = im.crop((cx * w + 8, cy * h + 8, cx * w + w - 8, cy * h + w - 8)).resize((512, 512), Image.LANCZOS)
    t = Image.new('RGB', (1024, 1024))
    t.paste(cell, (0, 0)); t.paste(cell.transpose(Image.FLIP_LEFT_RIGHT), (512, 0))
    t.paste(cell.transpose(Image.FLIP_TOP_BOTTOM), (0, 512)); t.paste(cell.transpose(Image.ROTATE_180), (512, 512))
    t.save(f'{dst}/{k}.png')
    normal_map(f'{dst}/{k}.png', f'{dst}/{k}_n.png', strength=ns, size=512)
    rough_map(f'{dst}/{k}.png', f'{dst}/{k}_r.png', 0.38, -0.25, size=512)
    print(k)
