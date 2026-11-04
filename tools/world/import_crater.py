"""The crater's skin, from the painting of it (art/crater/crater_blast.webp), for src/fps/crater.js:

  assets/textures/crater/skin.webp    the painting, its colour bled out under the alpha (so no dark fringe)
  assets/textures/crater/normal.webp  its relief, read off its brightness
  assets/textures/crater/glow.webp    its cracks about the middle, to burn green
  assets/textures/crater/rock.webp    a seamless tile of cracked plates and scales, in its colours: the 3D rocks' skin
  assets/textures/crater/rock_n.webp  that tile's relief
  assets/textures/crater/grain.webp   fine grey grain, for the ground up close
  assets/textures/crater/crystal.webp, crystal_glow.webp   the crystals' glass (art/crater/crystal_green.webp) and its veins

and prints what crater.js needs to lie the bowl under it: the painting's middle, and how far out the
rim runs at each angle (RIM_PX).   python tools/world/import_crater.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter
from scipy.spatial import cKDTree

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'art', 'crater', 'crater_blast.webp')
OUT = os.path.join(ROOT, 'assets', 'textures', 'crater')
os.makedirs(OUT, exist_ok=True)


def blur(a, r):
    """A float array gaussian-blurred, each channel on its own."""
    return gaussian_filter(a, (r, r, 0) if a.ndim == 3 else r)


def normals(h, strength, wrap=False):
    """A tangent-space normal map (RGB bytes) from a height field."""
    mode = 'wrap' if wrap else 'edge'
    p = np.pad(h, 1, mode=mode)
    dx = (p[1:-1, 2:] - p[1:-1, :-2]) * strength
    dy = (p[2:, 1:-1] - p[:-2, 1:-1]) * strength
    l = np.sqrt(dx * dx + dy * dy + 1)
    return np.uint8(np.clip(np.stack([-dx / l, dy / l, 1 / l], -1) * 0.5 + 0.5, 0, 1) * 255 + 0.5)


im = np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32) / 255
rgb, alpha = im[..., :3], im[..., 3]
S = im.shape[0]

# ---- colour bled out under the alpha, widest blur first, so mips and alpha-test show no fringe
solid = (alpha > 0.5).astype(np.float32)
bled = rgb * solid[..., None]
w = solid.copy()
for r in (2, 5, 12, 30):
    c, k = blur(rgb * solid[..., None], r), blur(solid, r)
    fill = c / np.maximum(k, 1e-4)[..., None]
    bled = np.where((w < 0.5)[..., None] & (k > 0.002)[..., None], fill, bled)
    w = np.maximum(w, (k > 0.002).astype(np.float32))
bled = np.where((w < 0.5)[..., None], rgb[solid > 0.5].mean(0), bled)
Image.fromarray(np.uint8(np.clip(np.dstack([bled, alpha]), 0, 1) * 255 + 0.5), 'RGBA').save(os.path.join(OUT, 'skin.webp'), quality=92, exact=True, method=5)

# ---- relief
L = bled @ np.array([0.3, 0.55, 0.15])
fine = L - blur(L, 26)   # (the painted light's broad sweep isn't relief)
Image.fromarray(normals(blur(fine, 0.7), 3.2)).save(os.path.join(OUT, 'normal.webp'), quality=85, method=5)

# ---- the middle and the rim: the bright orange lip, at each angle, about a fitted middle
orange = blur((bled[..., 0] - bled[..., 2]) * solid, 7)
cx, cy = S / 2, S / 2
RIM_N = 48
yy, xx = np.indices((S, S))
for _ in range(4):
    radii, px = [], []
    for i in range(RIM_N):
        a = i / RIM_N * 2 * np.pi
        rs = np.arange(370, 545)
        s = [np.mean([orange[int(cy + np.sin(a + d) * r), int(cx + np.cos(a + d) * r)] for d in (-0.05, 0, 0.05)]) for r in rs]
        r = rs[int(np.argmax(s))]
        radii.append(r)
        px.append((cx + np.cos(a) * r, cy + np.sin(a) * r))
    px = np.array(px)
    cx, cy = px.mean(0)
radii = np.array(radii, dtype=np.float32)
# (a lone wild pick at one angle is a crack or a fallen plate: take the middle of its neighbours')
med = np.array([np.median(np.take(radii, range(i - 2, i + 3), mode='wrap')) for i in range(RIM_N)])
rim = (np.roll(med, 1) + 2 * med + np.roll(med, -1)) / 4
print(f'middle: ({cx:.1f}, {cy:.1f}) of {S}; rim mean {rim.mean():.0f} px, {rim.min():.0f} to {rim.max():.0f}')
print('RIM_PX = [' + ', '.join(f'{v:.0f}' for v in rim) + ']')
yy, xx = np.indices((S, S))
d = np.hypot(xx - cx, yy - cy)
print(f'alpha: half gone at r = {next(R for R in range(300, 700, 5) if alpha[(d >= R) & (d < R + 5)].mean() < 0.5)} px')

# ---- the cracks about the middle, to burn (the thin dark lines only, not the shade round a stone)
crack = np.clip((blur(L, 3.5) - L) / 0.2 - 0.25, 0, 1) ** 1.5 * np.clip((0.3 - blur(L, 3.5)) / 0.12 + 1, 0, 1)
core = np.clip((300 - d) / 150, 0, 1)
glow = blur(crack * core * core * solid, 0.6)
Image.fromarray(np.uint8(np.clip(glow * 1.8, 0, 1) * 255 + 0.5), 'L').save(os.path.join(OUT, 'glow.webp'), quality=80, method=5)


# ---- the rocks' skin, in the painting's colours: cracked plates over fine scales. The painting has a
# couple of dozen pixels a metre, too soft to wrap a stone in, so it's grown the same way, seamless
def worley(n, cells, seed):
    """F1 and F2 (distance to the nearest two of `cells` seeds, in cell widths) on a repeating n x n."""
    rng = np.random.default_rng(seed)
    pts = rng.random((cells * cells, 2)) * n
    t = cKDTree(pts, boxsize=n)
    yy, xx = np.indices((n, n), dtype=np.float32)
    dist, _ = t.query(np.stack([xx.ravel(), yy.ravel()], -1), k=2, workers=2)
    return (dist[:, 0].reshape(n, n) * cells / n, dist[:, 1].reshape(n, n) * cells / n)


def wrapnoise(n, r, seed):
    """Smooth noise, -1..1 about nothing much, repeating."""
    a = gaussian_filter(np.random.default_rng(seed).random((n, n)), r, mode='wrap')
    return (a - a.mean()) / (a.std() * 2.5)


N = 512
plates = worley(N, 4, 11)
wx, wy = wrapnoise(N, 14, 1) * 0.3, wrapnoise(N, 14, 2) * 0.3
crackline = np.clip(1 - (plates[1] - plates[0]) / 0.022, 0, 1) ** 1.5
scales = worley(N, 15, 12)
scale = np.clip((scales[1] - scales[0]) / 0.32, 0, 1) ** 0.7   # (0 at a scale's edge)
grit = wrapnoise(N, 0.8, 3)
dust = wrapnoise(N, 22, 4) * 0.5 + 0.5                  # (paler dust here, rust there)
TAN, PALE, RUST, DARK = (np.array(c, np.float32) / 255 for c in ((120, 104, 95), (168, 152, 142), (150, 108, 84), (34, 27, 25)))
col = TAN + (PALE - TAN) * np.clip(dust, 0, 1)[..., None] * 0.7 + (RUST - TAN) * np.clip(wrapnoise(N, 40, 5) * 0.8 + 0.1, 0, 1)[..., None]
col = col * (0.84 + 0.2 * gaussian_filter(scale, 1.5, mode='wrap') + 0.14 * grit)[..., None]
col = col + (DARK - col) * crackline[..., None] * 0.8
Image.fromarray(np.uint8(np.clip(col, 0, 1) * 255 + 0.5)).save(os.path.join(OUT, 'rock.webp'), quality=88, method=5)
height = scale * 1.1 + grit * 0.14 - crackline * 1.6
Image.fromarray(normals(gaussian_filter(height, 0.7, mode='wrap'), 1.7, wrap=True)).save(os.path.join(OUT, 'rock_n.webp'), quality=85, method=5)

# ---- fine grain for the ground underfoot, where the painting alone would blur (grey, 0.5 = no change)
fine1 = worley(N, 26, 13)
grain = 0.5 + 0.2 * (np.clip((fine1[1] - fine1[0]) / 0.5, 0, 1) - 0.65) + 0.14 * wrapnoise(N, 1.1, 6) + 0.08 * wrapnoise(N, 5, 7)
Image.fromarray(np.uint8(np.clip(grain, 0, 1) * 255 + 0.5), 'L').save(os.path.join(OUT, 'grain.webp'), quality=82, method=5)

# ---- the crystals' glass (art/crater/crystal_green.webp), and the bright veins in it, to burn
cr = Image.open(os.path.join(ROOT, 'art', 'crater', 'crystal_green.webp')).convert('RGB').resize((1024, 683), Image.LANCZOS)
cr.save(os.path.join(OUT, 'crystal.webp'), quality=86, method=5)
g = np.asarray(cr).astype(np.float32) / 255
lit = g[..., 1] * 0.75 + g[..., 0] * 0.25
veins = np.clip((lit - 0.5) / 0.42, 0, 1) ** 1.8
Image.fromarray(np.uint8(veins * 255 + 0.5), 'L').save(os.path.join(OUT, 'crystal_glow.webp'), quality=82, method=5)

for f in sorted(os.listdir(OUT)):
    print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KiB')
