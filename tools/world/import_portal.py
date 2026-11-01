"""The portal platform's two textures, from the user's teleport-portal-textures.zip (portal-top.png,
portal-edge.png), cut for the game into assets/textures/portal/:

  portal_top.webp   the seal seen from above, centred so the stone disc fills the square exactly
                    (a CircleGeometry's own UVs then land on it), the transparent corners filled
                    with the rim's own stone so mipmaps don't draw a dark ring round it.
  portal_edge.webp  the side wall, one repeat that wraps a drum with no seam.

The edge strip was painted as one long band, not checked for a wrap, and its gems are unevenly
spaced. It is three courses: a row of bricks, the gem frieze, a row of bricks. Each is cut on its
own repeat and the three put back together, so the wrap always lands on a joint, never through a
stone:
  - the frieze from the middle of one gem to the middle of the gem two along, with a short blend
    into the first gem's left half at the end (the two gems are drawn alike, so it doesn't show);
  - each brick row from one mortar joint to the joint nearest one frieze-length on, squeezed or
    stretched (a few per cent) to the frieze's length.
The courses meet in dark mortar lines, where a change of phase can't be seen.

  python -I tools/world/import_portal.py "F:/!  BELLMOURN/Textures/teleport-portal-textures.zip"
  python -I tools/world/import_portal.py art/raw/portal          (an unpacked folder)
"""
import io
import os
import sys
import zipfile

import numpy as np
from PIL import Image

OUT = os.path.join('assets', 'textures', 'portal')
TOP_SIZE = 1024
EDGE_H = 384

# the edge strip (2172 x 724): its courses' rows, and where to cut each (found by eye and by the
# gems' blue and the joints' dark columns: see the notes above)
COURSES = [
    # rows,       cut from, cut to (x in the strip)
    ((0, 132), 866, 1974),     # the top bricks: joint to joint
    ((132, 562), 255, 1337),   # the frieze: gem middle to gem middle (two repeats)
    ((562, 724), 813, 1981),   # the bottom bricks: joint to joint
]
FRIEZE = 1                     # which course sets the repeat's length
BLEND = 70                     # px of blend at the frieze's seam


def read(src, name):
    if os.path.isdir(src):
        return Image.open(os.path.join(src, name))
    with zipfile.ZipFile(src) as z:
        return Image.open(io.BytesIO(z.read(name)))


def top(img):
    """Centre the disc, fill outside it with the rim's stone, crop to the disc's square."""
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    alpha = a[..., 3] > 127
    ys, xs = np.nonzero(alpha)
    cx, cy = xs.mean(), ys.mean()
    # the disc's radius, from its solid extent (a faint drop shadow lies outside it, below 127)
    r = (xs.max() - xs.min() + ys.max() - ys.min() + 2) / 4
    h, w = alpha.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = xx - cx, yy - cy
    d = np.hypot(dx, dy) + 1e-6
    # outside 0.985 r: the colour at 0.985 r on the same bearing (the rim's stone, carried out)
    rin = r * 0.985
    sx = np.clip(np.round(cx + dx / d * rin), 0, w - 1).astype(int)
    sy = np.clip(np.round(cy + dy / d * rin), 0, h - 1).astype(int)
    rgb = a[..., :3].copy()
    out = d > rin
    rgb[out] = a[sy[out], sx[out], :3]
    # crop the disc's square (padding with the filled stone where it runs past the picture)
    x0, y0 = int(round(cx - r)), int(round(cy - r))
    side = int(round(2 * r))
    pad = max(0, -x0, -y0, x0 + side - w, y0 + side - h)
    if pad:
        rgb = np.pad(rgb, ((pad, pad), (pad, pad), (0, 0)), mode='edge')
        x0 += pad; y0 += pad
    sq = rgb[y0:y0 + side, x0:x0 + side]
    print(f'top: disc centre ({cx:.1f}, {cy:.1f}), radius {r:.1f} px; square {side} px')
    return Image.fromarray(np.clip(sq, 0, 255).astype(np.uint8)).resize((TOP_SIZE, TOP_SIZE), Image.LANCZOS)


def edge(img):
    s = np.asarray(img.convert('RGB')).astype(np.float32)
    L = COURSES[FRIEZE][2] - COURSES[FRIEZE][1]
    rows = []
    for k, ((r0, r1), a, b) in enumerate(COURSES):
        band = s[r0:r1]
        if k == FRIEZE:
            t = band[:, a:b].copy()
            # the last BLEND px fade into what lies just left of the first gem's middle
            w = np.linspace(0, 1, BLEND, dtype=np.float32)
            w = (w * w * (3 - 2 * w))[None, :, None]
            t[:, L - BLEND:] = t[:, L - BLEND:] * (1 - w) + band[:, a - BLEND:a] * w
        else:
            seg = Image.fromarray(band[:, a:b].astype(np.uint8)).resize((L, r1 - r0), Image.LANCZOS)
            t = np.asarray(seg).astype(np.float32)
            print(f'edge: course rows {r0}-{r1}: joint {a} to {b} ({b - a} px) fitted to {L} px ({L / (b - a) * 100:.1f}%)')
        rows.append(t)
    tile = np.concatenate(rows, 0)
    # (the courses meet in dark mortar: soften the two rows either side of each meeting)
    for (r0, _), _a, _b in COURSES[1:]:
        tile[r0 - 2:r0 + 2] = tile[r0 - 2:r0 + 2].mean(0, keepdims=True) * 0.5 + tile[r0 - 2:r0 + 2] * 0.5
    H = EDGE_H
    W = int(round(L / s.shape[0] * H))
    print(f'edge: repeat {L} x {s.shape[0]} px -> {W} x {H}')
    return Image.fromarray(np.clip(tile, 0, 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join('art', 'raw', 'portal')
    os.makedirs(OUT, exist_ok=True)
    t = top(read(src, 'portal-top.png'))
    t.save(os.path.join(OUT, 'portal_top.webp'), quality=90, method=6)
    e = edge(read(src, 'portal-edge.png'))
    e.save(os.path.join(OUT, 'portal_edge.webp'), quality=90, method=6)
    # a check of the wrap: the repeat three times over
    check = Image.new('RGB', (e.width * 3, e.height))
    for i in range(3):
        check.paste(e, (i * e.width, 0))
    os.makedirs(os.path.join('art', 'view'), exist_ok=True)
    check.save(os.path.join('art', 'view', 'portal_edge_wrap.png'))
    for f in ('portal_top.webp', 'portal_edge.webp'):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')


if __name__ == '__main__':
    main()
