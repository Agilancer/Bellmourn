"""Review sheets for the first-person hands: art/view/shots/hands_<tag>_sheet.png (the five poses as
the game shows them) and hands_<tag>_close.png (each pose against the plain backdrop, its hands
found by their skin colour, cropped and enlarged 2.5x).
    python tools/models/hands/review_sheet.py r1
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SHOTS = os.path.join(ROOT, 'art', 'view', 'shots')
POSES = ['idle', 'palm', 'fist', 'sword', 'great']


def main(tag):
    ims = [Image.open(os.path.join(SHOTS, f'hands_{tag}_{n}.png')).convert('RGB') for n in POSES]
    W, H = ims[0].size
    sheet = Image.new('RGB', (W * 3, H * 2), (20, 20, 20))
    for i, im in enumerate(ims):
        sheet.paste(im, ((i % 3) * W, (i // 3) * H))
    sheet.save(os.path.join(SHOTS, f'hands_{tag}_sheet.png'))
    crops = []
    for n in POSES:
        bd = os.path.join(SHOTS, f'hands_{tag}_{n}_bd.png')
        im = Image.open(bd if os.path.exists(bd) else os.path.join(SHOTS, f'hands_{tag}_{n}.png')).convert('RGB')
        a = np.asarray(im, np.int32)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        skin = (r > 70) & (r > g * 1.12) & (g > b * 1.05) & (r - b > 30)
        skin[: H // 3] = False                       # (the hands are in the lower part of the view)
        ys, xs = np.nonzero(skin)
        if len(xs) < 50:
            crops.append(im.crop((W // 2, H // 2, W, H)))
            continue
        x0, x1 = np.percentile(xs, [1, 99]).astype(int); y0, y1 = np.percentile(ys, [1, 99]).astype(int)
        pad = 18
        crops.append(im.crop((max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad))))
    k = 2.5
    big = [c.resize((int(c.width * k), int(c.height * k)), Image.LANCZOS) for c in crops]
    cw = max(c.width for c in big)
    out = Image.new('RGB', (cw * 2 + 10, sum(c.height for c in big[0::2]) + 10 * 3), (20, 20, 20))
    y = [0, 0]
    for i, c in enumerate(big):
        col = i % 2
        out.paste(c, (col * (cw + 10), y[col]))
        y[col] += c.height + 10
    out = out.crop((0, 0, out.width, max(y)))
    out.save(os.path.join(SHOTS, f'hands_{tag}_close.png'))
    print('sheets', tag, sheet.size, out.size)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'r1')
