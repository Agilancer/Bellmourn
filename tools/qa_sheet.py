"""QA contact sheet: every frame anchored on a common baseline, zoomed, with guide lines.
usage: qa_sheet.py out.png zoom anim [anim ...]   (reads assets/player/<anim>.png + frames.json or frames.json)"""
import sys, json, os
from PIL import Image, ImageDraw
out, Z = sys.argv[1], int(sys.argv[2])
names = sys.argv[3:]
mf = 'assets/player/frames.json' if os.path.exists('assets/player/frames.json') else 'assets/player/frames.json'
meta = json.load(open(mf))
CELL_W, ABOVE, BELOW = 90, 100, 20
rows = []
W = CELL_W * 8 * Z + 120
H = (ABOVE + BELOW) * Z * len(names)
img = Image.new('RGB', (W, H), (34, 30, 44)); d = ImageDraw.Draw(img)
for r, n in enumerate(names):
    atlas = Image.open(f'assets/player/{n}.png')
    oy = r * (ABOVE + BELOW) * Z
    base = oy + ABOVE * Z
    for yy, col in ((0, (200, 200, 200)), (-80, (230, 90, 90)), (-40, (90, 140, 230))):
        d.line([(0, base + yy * Z), (W, base + yy * Z)], fill=col)
    d.text((4, oy + 4), n, fill='white')
    for i, f in enumerate(meta[n]):
        fr = atlas.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])).resize((f['w'] * Z, f['h'] * Z), Image.NEAREST)
        cx = 120 + i * CELL_W * Z + CELL_W * Z // 2
        img.paste(fr, (int(cx - f['ax'] * Z), int(base - f['ay'] * Z)), fr)
        d.line([(cx, oy + 10), (cx, base + 10 * Z)], fill=(80, 200, 120))
        d.text((cx - 20, oy + 4), f'{i}', fill='yellow')
img.save(out)
