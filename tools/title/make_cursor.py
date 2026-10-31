"""The mouse pointer: a little gilded sword, point up and to the left (the point is the hotspot),
silver blade, gold guard and pommel, the green of the fallen star in its gems. The hover pointer
is the same sword with a glint on the blade.

Drawn at 32x the size and box-filtered down, so the edges are smooth:
  assets/title/cursor.png, cursor@2x.png, cursor_hover.png, cursor_hover@2x.png

    python tools/title/make_cursor.py
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

K = 32                      # pixels per unit at the drawing size (the 1x cursor is 32 units across)
N = 32 * K
TIP = (1.15, 1.15)          # the sword's point, in units: the hotspot
D = (1 / math.sqrt(2), 1 / math.sqrt(2))     # along the blade, point to pommel
T = (1 / math.sqrt(2), -1 / math.sqrt(2))    # across it (+: the upper, lit side)
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'title')


def P(s, t):
    """A point s along the sword from its point and t across it, in drawing pixels."""
    return ((TIP[0] + s * D[0] + t * T[0]) * K, (TIP[1] + s * D[1] + t * T[1]) * K)


def mask(draw_fn):
    m = Image.new('L', (N, N), 0)
    draw_fn(ImageDraw.Draw(m))
    return np.asarray(m, dtype=np.float32) / 255


def poly(pts):
    return mask(lambda d: d.polygon([P(*p) for p in pts], fill=255))


def disc(s, t, r):
    def f(d):
        x, y = P(s, t)
        d.ellipse([x - r * K, y - r * K, x + r * K, y + r * K], fill=255)
    return mask(f)


def grow(m, units):
    """The mask dilated by `units` (for the outline)."""
    img = Image.fromarray((m * 255).astype(np.uint8))
    size = int(units * K) * 2 + 1
    return np.asarray(img.filter(ImageFilter.MaxFilter(size if size % 2 else size + 1)), dtype=np.float32) / 255


def blur(m, units):
    img = Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(units * K)), dtype=np.float32) / 255


# where every pixel lies along (s) and across (t) the sword, for shading
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / K
S = (xx - TIP[0]) * D[0] + (yy - TIP[1]) * D[1]
Tc = (xx - TIP[0]) * T[0] + (yy - TIP[1]) * T[1]


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255


def ramp(v, stops):
    """Colour ramp: v (array, 0..1) through [(at, '#rrggbb'), ...]."""
    v = np.clip(v, 0, 1)
    out = np.zeros(v.shape + (3,), np.float32)
    for (a0, c0), (a1, c1) in zip(stops, stops[1:]):
        k = np.clip((v - a0) / max(1e-6, a1 - a0), 0, 1)[..., None]
        seg = (v >= a0) & (v <= a1)
        out[seg] = (hexc(c0) * (1 - k) + hexc(c1) * k)[seg]
    return out


GOLD = [(0, '#fff3c8'), (0.3, '#f6cf78'), (0.62, '#d9a04a'), (1, '#8a5a1c')]


def build(glint=False):
    blade = poly([(0, 0), (4.0, 2.3), (16.4, 1.95), (16.4, -1.95), (4.0, -2.3)])
    lit = blade * (Tc > 0)
    guard = np.maximum.reduce([
        poly([(15.9, -5.5), (18.3, -5.5), (18.3, 5.5), (15.9, 5.5)]),
        disc(16.5, 6.0, 1.3), disc(16.5, -6.0, 1.3),
        poly([(15.0, 0), (17.1, 2.2), (19.2, 0), (17.1, -2.2)]),
    ])
    grip = poly([(18.3, -1.3), (24.3, -1.3), (24.3, 1.3), (18.3, 1.3)])
    pommel = disc(26.0, 0, 2.2)
    gems = np.maximum(disc(17.1, 0, 0.95), disc(26.0, 0, 0.8))
    every = np.maximum.reduce([blade, guard, grip, pommel])
    rim = grow(every, 0.95)

    rgb = np.zeros((N, N, 3), np.float32)
    a = np.zeros((N, N), np.float32)

    def lay(m, col):
        nonlocal rgb, a
        m = m[..., None]
        rgb = rgb * (1 - m) + col * m
        a = np.maximum(a, m[..., 0])

    # a soft shadow under it all (so it reads on a bright sky as on the dark), then the dark rim
    sh = blur(np.roll(np.roll(rim, int(0.9 * K), 0), int(0.6 * K), 1), 0.7) * 0.55
    rgb[:] = 0
    a = sh.copy()
    lay(rim, hexc('#1a1006'))
    # the blade: the lit half pale, the other half steel-grey, a bright ridge and a bright edge
    sv = S / 16.4
    lay(blade, ramp(sv, [(0, '#9aa6b6'), (1, '#6b7584')]))
    lay(lit, ramp(sv, [(0, '#ffffff'), (0.35, '#e9eff6'), (1, '#b9c5d3')]))
    ridge = blade * (np.abs(Tc) < 0.22) * (S > 0.8)
    lay(ridge, np.full((N, N, 3), hexc('#ffffff')))
    edge = blade * (Tc > 0) * (np.abs(Tc - (np.clip(S / 4, 0, 1) * 2.15)) < 0.25)
    lay(edge * 0.7, np.full((N, N, 3), hexc('#ffffff')))
    # the gold: lighter toward the top of the screen and on the lit side
    gv = np.clip((yy - 14) / 18 * 0.75 - Tc * 0.06 + 0.15, 0, 1)
    lay(guard, ramp(gv, GOLD))
    lay(pommel, ramp(np.clip((yy - 17) / 12, 0, 1) * 0.9, GOLD))
    # the grip: dark leather with a gold wire wound round it
    lay(grip, ramp(np.clip(-Tc / 2.6 + 0.5, 0, 1), [(0, '#7a4a22'), (1, '#2e1a0b')]))
    wire = grip * ((np.mod(S - Tc * 0.7, 1.5) < 0.42))
    lay(wire, ramp(np.clip(-Tc / 2.6 + 0.4, 0, 1), [(0, '#ffe6a0'), (1, '#a8742a')]))
    # the gems: the fallen star's green, a white catch of light in each
    lay(gems, ramp(np.clip((yy - 15) / 14, 0, 1), [(0, '#b8ffcc'), (0.5, '#3ee07a'), (1, '#0b6b34')]))
    for s, r in ((17.1, 0.95), (26.0, 0.8)):
        lay(disc(s - r * 0.35, r * 0.25, r * 0.32), np.full((N, N, 3), hexc('#ffffff')))
    if glint:
        # a star of light just off the blade's lit edge, the blade a touch brighter
        lay(lit * 0.25, np.full((N, N, 3), hexc('#ffffff')))
        cx, cy = P(7.4, 3.9)
        cx, cy = cx / K, cy / K
        dx, dy = xx - cx, yy - cy

        def star_of(w, L, r):
            arms = np.maximum(
                np.clip(1 - np.abs(dx) / L, 0, 1) ** 1.4 * np.clip(1 - np.abs(dy) / w, 0, 1),
                np.clip(1 - np.abs(dy) / (L * 1.1), 0, 1) ** 1.4 * np.clip(1 - np.abs(dx) / w, 0, 1))
            core = np.clip(1 - np.hypot(dx, dy) / r, 0, 1) ** 1.2
            return np.clip(np.maximum(arms, core), 0, 1), core
        dark, _ = star_of(1.0, 5.2, 2.1)                  # a dim rim, so it shows on a bright sky too
        a = np.maximum(a, dark * 0.55)
        rgb = rgb * (1 - dark[..., None] * 0.55) + hexc('#2a1a06') * dark[..., None] * 0.55
        star, core = star_of(0.5, 4.6, 1.5)
        warm = hexc('#ffd978') * (1 - core[..., None]) + hexc('#ffffff') * core[..., None]
        rgb = rgb * (1 - star[..., None]) + warm * star[..., None]
        a = np.maximum(a, star)
    return rgb, a


def save(rgb, a, name):
    img = np.dstack([rgb * a[..., None], a])   # premultiplied, so the box filter doesn't bleed dark
    big = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), 'RGBA')
    for size, suffix in ((32, ''), (64, '@2x')):
        small = np.asarray(big.reduce(N // size), dtype=np.float32) / 255
        al = small[..., 3:]
        col = np.where(al > 0, small[..., :3] / np.maximum(al, 1e-6), 0)
        out = np.dstack([col, al])
        Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(OUT, f'{name}{suffix}.png'), optimize=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    save(*build(False), 'cursor')
    save(*build(True), 'cursor_hover')
    print('cursors written to', os.path.abspath(OUT))
