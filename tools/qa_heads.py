"""Head-size consistency check: top 26px of a representative frame per anim, zoomed."""
import json, sys
from PIL import Image, ImageDraw
meta = json.load(open('assets/player/frames.json'))
picks = [a.split(':') for a in sys.argv[2:]]
Z = 6
out = Image.new('RGB', (len(picks) * 34 * Z, 30 * Z + 14), (34, 30, 44)); d = ImageDraw.Draw(out)
for k, (n, i) in enumerate(picks):
    f = meta[n][int(i)]
    at = Image.open(f'assets/player/{n}.png')
    # crop a box around the head centre (anchor x, head is near top)
    fr = at.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
    bb = fr.getbbox()
    cx = int(f['ax'])
    head = fr.crop((cx - 16, bb[1], cx + 16, bb[1] + 28)).resize((32 * Z, 28 * Z), Image.NEAREST)
    out.paste(head, (k * 34 * Z, 14), head)
    d.text((k * 34 * Z + 2, 1), f'{n[:10]}:{i}', fill='white')
    for y in (0, 10, 20):
        d.line([(k * 34 * Z, 14 + y * Z), (k * 34 * Z + 32 * Z, 14 + y * Z)], fill=(90, 90, 120))
out.save(sys.argv[1])
