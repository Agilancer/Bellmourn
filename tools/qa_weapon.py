"""Draw the real sword sprite on every attack frame (as the engine will) to check grip and angles."""
import json, sys
from PIL import Image, ImageDraw
meta = json.load(open('assets/player/frames.json'))
W_ = json.load(open('assets/player/weapon.json'))
sw = Image.open('assets/player/sword.png'); sm = json.load(open('assets/player/sword.json'))
Z = 3
names = sys.argv[2:]
CW, CH = 110, 110
img = Image.new('RGBA', (8 * CW * Z, len(names) * CH * Z), (34, 30, 44, 255)); d = ImageDraw.Draw(img)


def sword_at(canvas, hx, hy, deg):
    i = round(deg / sm['step']) % len(sm['frames'])
    f = sm['frames'][i]
    s = sw.crop((f['x'], 0, f['x'] + f['w'], f['h']))
    canvas.alpha_composite(s, (round(hx - f['px']), round(hy - f['py'])))


for r, n in enumerate(names):
    at = Image.open(f'assets/player/{n}.png')
    angs = W_['angles'].get(n.replace('_b', ''), W_['angles']['default'])
    for i, f in enumerate(meta[n]):
        cell = Image.new('RGBA', (CW, CH))
        fr = at.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
        ox, oy = 35, 22
        a = angs[i]
        if a is not None and i in W_['behind']: sword_at(cell, ox + f['hand'][0], oy + f['hand'][1], a)
        cell.alpha_composite(fr, (ox, oy))
        if a is not None and i not in W_['behind']: sword_at(cell, ox + f['hand'][0], oy + f['hand'][1], a)
        img.alpha_composite(cell.resize((CW * Z, CH * Z), Image.NEAREST), (i * CW * Z, r * CH * Z))
        d.text((i * CW * Z + 4, r * CH * Z + 4), f'{n} {i}', fill='white')
img.save(sys.argv[1])
