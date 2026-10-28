"""Find the 8 frames in each player sheet (2 rows x 4 cols) and report bounding boxes."""
import sys, json, glob, os
import numpy as np
from PIL import Image
from scipy import ndimage

def frames(path, thresh=128):
    im = np.array(Image.open(path).convert('RGBA'))
    a = im[..., 3] > thresh
    lab, n = ndimage.label(a)
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    H, W = a.shape
    cells = [[] for _ in range(8)]
    for i, sl in enumerate(objs):
        if sizes[i] < 30:
            continue
        cy = (sl[0].start + sl[0].stop) / 2
        cx = (sl[1].start + sl[1].stop) / 2
        r = 0 if cy < H / 2 else 1
        c = min(3, int(cx / (W / 4)))
        cells[r * 4 + c].append((sl, i + 1))
    out = []
    for k, lst in enumerate(cells):
        y0 = min(s[0].start for s, _ in lst); y1 = max(s[0].stop for s, _ in lst)
        x0 = min(s[1].start for s, _ in lst); x1 = max(s[1].stop for s, _ in lst)
        out.append(dict(bbox=[x0, y0, x1, y1], h=y1 - y0, w=x1 - x0, parts=len(lst)))
    return out

if __name__ == '__main__':
    res = {}
    for f in sorted(glob.glob('art/raw/player/*.png')):
        name = os.path.basename(f)[:-4]
        fr = frames(f)
        res[name] = fr
        print(name, [(d['bbox'], d['parts']) for d in fr])
    json.dump(res, open('art/view/frames.json', 'w'), indent=1)
