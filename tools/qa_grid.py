"""Zoomed frames with a labelled pixel grid, for authoring leg masks in frame coordinates.
usage: qa_grid.py out.png zoom y_from anim:idx [anim:idx ...]"""
import sys, json
from PIL import Image, ImageDraw
out, Z, Y0 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
meta = json.load(open('assets/player/frames.json'))
tiles = []
for spec in sys.argv[4:]:
    n, i = spec.split(':'); f = meta[n][int(i)]
    fr = Image.open(f'assets/player/{n}.png').crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
    fr = fr.crop((0, Y0, fr.size[0], fr.size[1]))
    tiles.append((spec, fr))
W = sum(t.size[0] * Z + 40 for _, t in tiles); H = max(t.size[1] for _, t in tiles) * Z + 30
img = Image.new('RGB', (W, H), (30, 60, 45)); d = ImageDraw.Draw(img)
x = 0
for spec, t in tiles:
    big = t.resize((t.size[0] * Z, t.size[1] * Z), Image.NEAREST)
    img.paste(big, (x + 30, 20), big)
    for gx in range(0, t.size[0] + 1, 2):
        c = (255, 255, 0) if gx % 10 == 0 else (70, 90, 80)
        d.line([(x + 30 + gx * Z, 20), (x + 30 + gx * Z, 20 + t.size[1] * Z)], fill=c, width=1)
        if gx % 10 == 0: d.text((x + 30 + gx * Z + 1, 6), str(gx), fill='yellow')
    for gy in range(0, t.size[1] + 1, 2):
        yy = gy + Y0
        c = (255, 255, 0) if yy % 10 == 0 else (70, 90, 80)
        d.line([(x + 30, 20 + gy * Z), (x + 30 + t.size[0] * Z, 20 + gy * Z)], fill=c, width=1)
        if yy % 10 == 0: d.text((x + 2, 20 + gy * Z - 5), str(yy), fill='yellow')
    d.text((x + 30, H - 12), spec, fill='white')
    x += t.size[0] * Z + 40
img.save(out)
