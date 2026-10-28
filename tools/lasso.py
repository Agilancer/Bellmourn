"""Per-pixel lasso of every sprite on a player sheet.

Rectangular crops pick up pieces of neighbouring frames wherever a punch, foot or hair strand
reaches into the next cell. Instead:
  1. cores  = the solid body of each frame: the connected components at alpha >= 128, assigned to
              the frame (2x4 layout) whose cell holds most of their pixels; tiny ones are left out;
  2. every visible pixel (alpha >= 24) is given to the frame whose core is nearest
     (Euclidean distance transform), so detached bits (fists, glints, hair) join the right sprite
     and the soft edges of touching sprites are split down the middle.
Output: art/view/lasso/<sheet>.npy  (int8 label map, -1 = background) + a QA overlay image.
"""
import os, sys, glob
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

OUT = 'art/view/lasso'
COLORS = [(255, 70, 70), (255, 170, 40), (240, 240, 60), (80, 230, 90), (60, 200, 255), (90, 110, 255), (200, 90, 255), (255, 90, 190)]


def lasso(path):
    a = np.array(Image.open(path).convert('RGBA'))[..., 3]
    H, W = a.shape
    solid = a >= 128
    lab, n = ndimage.label(solid)
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    core = np.full(a.shape, -1, np.int8)
    cell_w, cell_h = W / 4, H / 2
    for k, sl in enumerate(ndimage.find_objects(lab)):
        if sizes[k] < 400:
            continue
        ys, xs = np.nonzero(lab[sl] == k + 1)
        ys = ys + sl[0].start; xs = xs + sl[1].start
        cells = (ys >= cell_h).astype(int) * 4 + np.minimum(3, (xs / cell_w).astype(int))
        cell = np.bincount(cells, minlength=8).argmax()
        core[ys, xs] = cell
    missing = [c for c in range(8) if not (core == c).any()]
    if missing:
        raise SystemExit(f'{path}: no body found for frames {missing}')
    # nearest core for every pixel
    _, (iy, ix) = ndimage.distance_transform_edt(core < 0, return_indices=True)
    nearest = core[iy, ix]
    labels = np.where(a >= 24, nearest, -1).astype(np.int8)
    return labels, a


def qa(path, labels, name):
    im = Image.open(path).convert('RGBA')
    bg = Image.new('RGBA', im.size, (24, 22, 30, 255))
    bg.alpha_composite(im)
    ov = np.array(bg)
    edge = np.zeros(labels.shape, bool)
    edge[1:, :] |= labels[1:, :] != labels[:-1, :]
    edge[:, 1:] |= labels[:, 1:] != labels[:, :-1]
    for k in range(8):
        m = edge & ((labels == k) | np.roll(labels == k, 1, 0) | np.roll(labels == k, 1, 1))
        m = ndimage.binary_dilation(m, iterations=1)
        ov[m] = COLORS[k] + (255,)
    Image.fromarray(ov).convert('RGB').resize((im.size[0] // 2, im.size[1] // 2), Image.LANCZOS).save(f'{OUT}/{name}_qa.jpg', quality=88)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    files = sys.argv[1:] or sorted(glob.glob('art/raw/player/*.png'))
    for f in files:
        name = os.path.basename(f)[:-4]
        labels, a = lasso(f)
        np.save(f'{OUT}/{name}.npy', labels)
        qa(f, labels, name)
        counts = [int((labels == k).sum()) for k in range(8)]
        print(f'{name:18s}', counts)
