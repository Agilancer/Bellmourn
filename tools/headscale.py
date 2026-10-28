"""Estimate per-frame character scale from the warm (hair+skin) head blob (dilated so bun+face merge)."""
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
        warm = (a > 128) & (r - b > 40) & (r > g) & (r > 90)
        dil = ndimage.binary_dilation(warm, iterations=8)
        lab, n = ndimage.label(dil)
        sizes = ndimage.sum(warm, lab, range(1, n + 1))
        objs = ndimage.find_objects(lab)
        big = [i for i in range(n) if sizes[i] > 1500]
        top = min(big, key=lambda i: objs[i][0].start)
        m = (lab == top + 1) & warm
        ys, xs = np.nonzero(m)
        out.append([int(ys.max() - ys.min()), int(xs.max() - xs.min()), int(np.sqrt(m.sum()))])
    res[name] = out
    print(f'{name:18s}', ' '.join(f'{h}/{w}/{s}' for h, w, s in out), ' med h', np.median([o[0] for o in out]), 'med s', np.median([o[2] for o in out]))
json.dump(res, open('art/view/heads.json', 'w'))
