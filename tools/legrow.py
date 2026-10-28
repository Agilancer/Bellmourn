"""Row of the lower part of frames (legs), bottoms aligned, for leg inspection.
usage: legrow.py out.png frac sheet:idx ..."""
import sys, json
from PIL import Image, ImageDraw
fr = json.load(open('art/view/frames.json'))
frac = float(sys.argv[2])
crops = []
for spec in sys.argv[3:]:
    n, i = spec.split(':'); i = int(i)
    x0, y0, x1, y1 = fr[n][i]['bbox']
    top = int(y1 - (y1 - y0) * frac)
    im = Image.open(f'art/raw/player/{n}.png').convert('RGBA').crop((x0, top, x1, y1))
    crops.append((spec, im))
H = max(c.size[1] for _, c in crops) + 20
W = sum(c.size[0] for _, c in crops) + 12 * len(crops)
out = Image.new('RGBA', (W, H), (40, 120, 70, 255)); d = ImageDraw.Draw(out)
x = 0
for spec, c in crops:
    out.alpha_composite(c, (x, H - c.size[1] - 4)); d.text((x + 2, 2), spec, fill='white'); x += c.size[0] + 12
out.convert('RGB').save(sys.argv[1])
