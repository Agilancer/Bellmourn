"""Side-by-side crops of frames at the sheet's native scale, bottoms aligned.
usage: compare.py out.png sheet:idx sheet:idx ..."""
import sys, json
from PIL import Image, ImageDraw
fr = json.load(open('art/view/frames.json'))
crops = []
for spec in sys.argv[2:]:
    n, i = spec.split(':'); i = int(i)
    x0, y0, x1, y1 = fr[n][i]['bbox']
    im = Image.open(f'art/raw/player/{n}.png').convert('RGBA').crop((x0, y0, x1, y1))
    crops.append((spec, im))
H = max(c.size[1] for _, c in crops) + 20
W = sum(c.size[0] for _, c in crops) + 10 * len(crops)
out = Image.new('RGBA', (W, H), (40, 120, 70, 255)); d = ImageDraw.Draw(out)
x = 0
for spec, c in crops:
    out.alpha_composite(c, (x, H - c.size[1] - 10)); d.text((x + 2, 2), spec, fill='white'); x += c.size[0] + 10
for y in range(0, H, 50): d.line([(0, H - 10 - y), (W, H - 10 - y)], fill=(255, 255, 255, 60))
out.convert('RGB').save(sys.argv[1])
