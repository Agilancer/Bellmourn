"""Pixel-art longsword pre-rendered at 72 angles (every 5 degrees).

Drawn once at 8x as clean vector shapes, rotated about the grip at 8x, box-downscaled to game
pixels, alpha hardened, snapped to a small palette and given a 1px dark outline, so every angle
is a crisp sprite instead of a blurry or jaggy runtime rotation.
Output: assets/player/sword.png (strip) + sword.json [{x,y,w,h,px,py}] where (px,py) is the grip.
"""
import json, math
import numpy as np
from PIL import Image, ImageDraw

S = 8                 # supersample
BLADE = 34            # blade length in game px
STEP = 5

PAL = [(14, 12, 20), (54, 56, 78), (96, 102, 130), (150, 158, 186), (206, 212, 232), (246, 248, 255),
       (58, 34, 18), (122, 86, 34), (196, 152, 70), (236, 204, 122), (34, 22, 34), (92, 26, 40), (160, 34, 52)]


def draw_master():
    L = (6 + BLADE + 4) * S
    H = 11 * S
    im = Image.new('RGBA', (L, H))
    d = ImageDraw.Draw(im)
    cy = H / 2
    gx = 5 * S                       # grip centre = pivot
    # pommel + grip
    d.ellipse([0.5 * S, cy - 1.6 * S, 3.4 * S, cy + 1.6 * S], fill=PAL[8])
    d.rectangle([2.6 * S, cy - 1.0 * S, 7.6 * S, cy + 1.0 * S], fill=PAL[10])
    for k in range(3):
        x = 3.4 * S + k * 1.4 * S
        d.line([x, cy - 1.0 * S, x + 0.8 * S, cy + 1.0 * S], fill=PAL[11], width=int(0.5 * S))
    # cross-guard with swept quillons
    d.polygon([(7.4 * S, cy - 4.6 * S), (9.2 * S, cy - 3.4 * S), (9.2 * S, cy + 3.4 * S), (7.4 * S, cy + 4.6 * S),
               (8.0 * S, cy), ], fill=PAL[7])
    d.polygon([(7.9 * S, cy - 3.8 * S), (8.9 * S, cy - 3.0 * S), (8.9 * S, cy + 3.0 * S), (7.9 * S, cy + 3.8 * S)], fill=PAL[9])
    d.ellipse([7.6 * S, cy - 1.0 * S, 9.6 * S, cy + 1.0 * S], fill=PAL[12])        # garnet
    # blade: tapered, ricasso, fuller, bright edge
    b0, b1 = 9.2 * S, (9.2 + BLADE) * S
    hw = 1.9 * S
    d.polygon([(b0, cy - hw), (b1 - 5 * S, cy - hw * 0.8), (b1, cy), (b1 - 5 * S, cy + hw * 0.8), (b0, cy + hw)], fill=PAL[3])
    d.polygon([(b0, cy - hw), (b1 - 5 * S, cy - hw * 0.8), (b1, cy), (b0, cy - 0.2 * S)], fill=PAL[4])
    d.line([(b0 + 1 * S, cy - hw + 0.4 * S), (b1 - 4 * S, cy - hw * 0.8 + 0.3 * S)], fill=PAL[5], width=int(0.7 * S))
    d.line([(b0 + 2 * S, cy + 0.3 * S), (b1 - 9 * S, cy + 0.2 * S)], fill=PAL[2], width=int(0.9 * S))
    d.polygon([(b0, cy + 0.2 * S), (b0 + 2.5 * S, cy + 0.2 * S), (b0 + 2.5 * S, cy + hw), (b0, cy + hw)], fill=PAL[2])
    return im, (gx, cy)


def outline(a):
    """1px dark outline around opaque pixels (8-neighbourhood)."""
    al = a[..., 3] > 0
    grow = np.zeros_like(al)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            grow |= np.roll(np.roll(al, dy, 0), dx, 1)
    ring = grow & ~al
    a[ring] = PAL[0] + (255,)
    return a


def snap(a):
    pal = np.array(PAL)
    rgb = a[..., :3].reshape(-1, 3).astype(int)
    idx = ((rgb[:, None, :] - pal[None]) ** 2).sum(-1).argmin(1)
    a[..., :3] = pal[idx].reshape(a.shape[0], a.shape[1], 3)
    return a


def render(master, pivot, deg):
    # rotate about the pivot on a canvas big enough for any angle
    R = int(math.hypot(master.size[0], master.size[1])) + 4 * S
    c = Image.new('RGBA', (2 * R, 2 * R))
    c.alpha_composite(master, (int(R - pivot[0]), int(R - pivot[1])))
    c = c.rotate(-deg, resample=Image.BICUBIC, center=(R, R))
    small = c.convert('RGBa').resize((2 * R // S, 2 * R // S), Image.BOX).convert('RGBA')
    a = np.array(small)
    a[..., 3] = np.where(a[..., 3] >= 100, 255, 0)
    a[a[..., 3] == 0] = 0
    a = outline(snap(a))
    im = Image.fromarray(a)
    bb = im.getbbox()
    im = im.crop(bb)
    return im, (R / S - bb[0], R / S - bb[1])


if __name__ == '__main__':
    master, pivot = draw_master()
    frames = [render(master, pivot, d) for d in range(0, 360, STEP)]
    W = sum(f[0].size[0] + 1 for f in frames)
    H = max(f[0].size[1] for f in frames)
    strip = Image.new('RGBA', (W, H))
    meta, x = [], 0
    for im, (px, py) in frames:
        strip.alpha_composite(im, (x, 0))
        meta.append(dict(x=x, y=0, w=im.size[0], h=im.size[1], px=round(px, 1), py=round(py, 1)))
        x += im.size[0] + 1
    strip.save('assets/player/sword.png')
    json.dump(dict(step=STEP, blade=BLADE, frames=meta), open('assets/player/sword.json', 'w'))
    print(strip.size, len(meta))
