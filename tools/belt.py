"""Locate the belt (hip anchor) in each frame by its leather-brown colour in the mid band."""
import json, numpy as np
from PIL import Image
from scipy import ndimage
fr = json.load(open('art/view/frames.json'))
res = {}
for name, frames in fr.items():
    im = np.array(Image.open(f'art/raw/player/{name}.png').convert('RGBA')).astype(int)
    out = []
    for d in frames:
        x0, y0, x1, y1 = d['bbox']
        c = im[y0:y1, x0:x1]
        r, g, b, a = c[..., 0], c[..., 1], c[..., 2], c[..., 3]
        hgt = y1 - y0
        band = np.zeros_like(a, bool); band[int(hgt * .25):int(hgt * .75)] = True
        brown = (a > 200) & band & (r > 90) & (r < 200) & (r - b > 45) & (g - b > 15) & (r - g > 20) & (r - g < 75)
        lab, n = ndimage.label(ndimage.binary_dilation(brown, iterations=3))
        if n == 0: out.append(None); continue
        sizes = ndimage.sum(brown, lab, range(1, n + 1))
        k = int(np.argmax(sizes)) + 1
        ys, xs = np.nonzero((lab == k) & brown)
        out.append([int(xs.mean()) + x0, int(ys.mean()) + y0, int(xs.min()) + x0, int(xs.max()) + x0])
    res[name] = out
    print(f'{name:18s}', out)
json.dump(res, open('art/view/belts.json', 'w'))
