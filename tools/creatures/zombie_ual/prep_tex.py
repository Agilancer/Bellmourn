"""Texture prep for the UAL zombie (system Python: numpy, scipy, PIL).

  python prep_tex.py <skin.webp> <out_dir>

Writes, all in the painted sheet's own layout so any reskin painted on the same sheet drops in:
  zombie_basecolor.png  the sheet with every island bled 24 px into the black gutters (no dark
                        seams or mip bleed where UVs touch an island edge)
  zombie_normal.png     tangent-space normals (OpenGL / glTF) read from the painting's shading
  zombie_orm.png        R occlusion 1, G roughness (wet wounds and mouth glisten), B metal 0
  zombie_height.npy     float16 mid-frequency height (0 mean) the build uses for real displacement
  zombie_mask.npy       island mask
  zombie_low.npy        the sheet's colour blurred (5 px), for colour-matching patches
  zombie_rags.png       512 px rotted grave-cloth for the loincloth (tiles across, holes in alpha)
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def bleed(rgb, mask, px=24):
    """Fill the gutters smoothly outward from the islands (masked blurs at growing radii, so no
    stair-stepped nearest-pixel blocks), then nearest-pixel for whatever is still empty."""
    out = rgb.copy()
    m = mask.astype(np.float32)
    filled = mask.copy()
    for s in (1.0, 2.0, 4.0, 8.0):
        w = ndimage.gaussian_filter(m, s)
        est = np.stack([ndimage.gaussian_filter(rgb[..., i] * m, s) for i in range(rgb.shape[2])], -1) / (w[..., None] + 1e-6)
        take = ~filled & (w > 2e-3)
        out[take] = est[take]
        filled |= take
    dist, (iy, ix) = ndimage.distance_transform_edt(~filled, return_indices=True)
    rest = ~filled
    out[rest] = out[iy[rest], ix[rest]]
    return out


def wraps(out, cols, size=512):
    """zombie_wraps.png, three columns: twisted rope | grimy linen with frayed edges | hair strands.
    Each column is tinted for its monster (cols: rope / linen / strand RGB)."""
    rng = np.random.default_rng(17)
    w3 = size // 3
    yy, xx = np.mgrid[0:size, 0:w3].astype(np.float32)
    img = np.zeros((size, size, 4), np.float32)
    # rope: three twisted plies, fibres along each, dark between
    ply = 0.5 + 0.5 * np.sin((xx / w3 * 3 + yy / size * 6) * 2 * np.pi)
    fib = 0.85 + 0.15 * np.sin((xx * 0.9 + yy * 0.35) * 1.7)
    rope = np.array(cols.get("rope", (0.36, 0.32, 0.25)))[None, None] * (0.45 + 0.55 * ply ** 0.6)[..., None] * fib[..., None]
    fray = np.clip(fbm((size, w3), rng, 1.2) - 0.4, 0, 1)[..., None]       # pale frayed fibre whiskers
    rope = rope * (1 - 0.5 * fray) + np.array([0.55, 0.5, 0.42]) * 0.5 * fray
    rope *= (1 - 0.35 * fbm((size, w3), rng, 2.0))[..., None]
    img[:, :w3, :3] = rope; img[:, :w3, 3] = 1
    # linen: weave, grime, old blood and rot; frayed, holed edges in alpha
    weave = 0.82 + 0.18 * np.sin(xx * 2.1) * np.sin(yy * 2.1)
    lin = np.array(cols.get("linen", (0.72, 0.66, 0.52)))[None, None] * weave[..., None]
    grime = fbm((size, w3), rng, 2.2)
    lin *= (1 - 0.22 * np.clip(grime, 0, 1))[..., None]
    blood = np.clip(fbm((size, w3), rng, 2.6) * 0.9 - 1.0, 0, 1)[..., None]
    lin = lin * (1 - blood) + np.array([0.28, 0.08, 0.05]) * blood
    edge = np.minimum(xx, w3 - 1 - xx) / w3
    n1 = fbm((size, w3), rng, 1.4)
    lin *= (1 - 0.15 * np.clip((0.22 - edge) / 0.22, 0, 1))[..., None]         # tea-stained, a little darker at the edges
    la = ((edge > 0.07 + 0.1 * np.clip(n1, 0, 1)) & (fbm((size, w3), rng, 2.8) < 1.5)).astype(np.float32)
    img[:, w3:2 * w3, :3] = lin; img[:, w3:2 * w3, 3] = la
    # strands: fine wavy hairs, thinning to the tips (v = 0 root .. 1 tip, the image top is v = 1)
    ws = size - 2 * w3
    sy, sx = np.mgrid[0:size, 0:ws].astype(np.float32)
    v = 1 - sy / size
    cov = np.zeros((size, ws), np.float32)
    for _ in range(40):                               # sparse clumps: scalp shows between them
        x0 = rng.uniform(0, ws); amp = rng.uniform(0.5, 3.0); ph = rng.uniform(0, 6.3); end = rng.uniform(0.55, 1.0)
        xc = x0 + amp * np.sin(v * rng.uniform(4, 11) + ph)
        cov = np.maximum(cov, np.clip(1 - np.abs(sx - xc) / rng.uniform(1.8, 3.0), 0, 1) * np.clip((end - v) / 0.18, 0, 1))
    hair = np.array(cols.get("strand", (0.62, 0.6, 0.56)))[None, None] * (0.7 + 0.3 * fbm((size, ws), rng, 1.8)[..., None])
    img[:, 2 * w3:, :3] = hair; img[:, 2 * w3:, 3] = (cov > 0.5).astype(np.float32)
    Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(out, "zombie_wraps.png"))


def main(src, out, name=None):
    os.makedirs(out, exist_ok=True)
    im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255.0
    lum = im @ np.array([0.299, 0.587, 0.114], np.float32)
    # islands vs the sheet's background (black on most sheets, tan / olive / grey on some)
    border = np.concatenate([im[:3].reshape(-1, 3), im[-3:].reshape(-1, 3), im[:, :3].reshape(-1, 3), im[:, -3:].reshape(-1, 3)])
    bg = np.median(border, 0)
    mask = ndimage.binary_opening(np.linalg.norm(im - bg, axis=2) > 0.07, iterations=2)
    mask = ndimage.binary_fill_holes(mask)
    mask = ndimage.binary_erosion(mask, iterations=1)  # drop the dark anti-aliased rim

    base = bleed(im, mask)
    Image.fromarray((base * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, "zombie_basecolor.png"))

    # height from shading: bright = raised, dark = sunk (wounds, creases, sockets)
    lf = np.where(mask, lum, 0.0)
    w = ndimage.gaussian_filter(mask.astype(np.float32), 6) + 1e-4
    local = ndimage.gaussian_filter(lf, 6) / w            # local mean inside islands only
    fine = ndimage.gaussian_filter(lf, 0.8) / (ndimage.gaussian_filter(mask.astype(np.float32), 0.8) + 1e-4)
    detail = np.where(mask, fine - local, 0.0)
    detail = bleed(detail[..., None].repeat(3, 2), mask)[..., 0]
    gy, gx = np.gradient(ndimage.gaussian_filter(detail, 0.7))
    s = 9.0
    n = np.dstack([-gx * s, gy * s, np.ones_like(gx)])     # +V is up the image in glTF
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, "zombie_normal.png"))

    mid = ndimage.gaussian_filter(lf, 2.5) / (ndimage.gaussian_filter(mask.astype(np.float32), 2.5) + 1e-4)
    broad = ndimage.gaussian_filter(lf, 14) / (ndimage.gaussian_filter(mask.astype(np.float32), 14) + 1e-4)
    height = np.where(mask, mid - broad, 0.0)
    height = bleed(height[..., None].repeat(3, 2), mask)[..., 0]
    np.save(os.path.join(out, "zombie_height.npy"), height.astype(np.float16))
    np.save(os.path.join(out, "zombie_mask.npy"), mask)

    # wet where it is red and dark (wounds, gums, tongue); dry chalky skin elsewhere
    r, g, b = base[..., 0], base[..., 1], base[..., 2]
    red = np.clip((r - (g + b) * 0.5) * 4.0, 0, 1)
    rough = np.clip(0.86 - 0.5 * red - 0.15 * np.clip(0.35 - lum, 0, 1), 0.3, 0.92)
    rough = ndimage.gaussian_filter(rough, 1.0)
    orm = np.dstack([np.ones_like(rough), rough, np.zeros_like(rough)])
    Image.fromarray((orm * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, "zombie_orm.png"))
    low = np.stack([ndimage.gaussian_filter(np.where(mask, im[..., i], 0), 5) for i in range(3)], -1)
    low /= ndimage.gaussian_filter(mask.astype(np.float32), 5)[..., None] + 1e-4
    np.save(os.path.join(out, "zombie_low.npy"), bleed(low, mask).astype(np.float16))
    rags(out)
    cols = {}
    if name:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import monsters
        cols = monsters.MONSTERS[name].get("extras", {}).get("cols", {})
    wraps(out, cols)
    print("islands px", int(mask.sum()), "height std", float(height[mask].std()))


def fbm(shape, rng, power=2.2):
    """Periodic fractal noise (FFT-filtered), so the cloth tiles round the hips."""
    f = np.fft.fft2(rng.normal(size=shape))
    ky = np.fft.fftfreq(shape[0])[:, None]; kx = np.fft.fftfreq(shape[1])[None, :]
    k = np.hypot(kx, ky); k[0, 0] = 1
    n = np.real(np.fft.ifft2(f / k ** (power / 2)))
    return (n - n.mean()) / n.std()


def rags(out, size=512):
    rng = np.random.default_rng(11)
    yy, xx = np.mgrid[0:size, 0:size] / size
    u, v = xx, 1 - yy                                                  # v = 0 at the hem line
    weave = 0.5 + 0.5 * np.sin(xx * size * np.pi / 3.5) * np.sin(yy * size * np.pi / 3.5)  # ~7 px threads
    streak = fbm((size, size // 16), rng, 1.6).repeat(16, 1)          # vertical rot streaks
    blot = fbm((size, size), rng, 2.6)
    grime = np.clip((0.75 - v) * 1.4, 0, 1)                           # filthier toward the hem
    base = np.array([0.30, 0.26, 0.20])
    col = base[None, None] * (0.78 + 0.12 * weave[..., None] + 0.08 * streak[..., None] - 0.12 * blot[..., None])
    col *= (1 - 0.3 * grime)[..., None]
    stain = np.clip(fbm((size, size), rng, 2.4) * 0.8 - 0.9, 0, 1)[..., None]
    col = col * (1 - stain) + np.array([0.20, 0.07, 0.05]) * stain       # old blood
    holes = fbm((size, size), rng, 2.8) + grime * 1.2 - 2.0
    n1 = fbm((size, size), rng, 1.8)[0]                               # periodic 1-D noise along u
    n2 = fbm((size, size), rng, 1.2)[0]
    # u = 0 is the front and back centre, 0.5 the hips: long tails, short at the sides
    hem = 0.05 + 0.6 * np.sin(np.pi * u) ** 2 + 0.035 * n1 + 0.02 * n2
    phase = (u * 9 + 0.25 * n1) % 1.0
    slit = (np.abs(phase - 0.5) < 0.045 + 0.02 * n2) & (v < 0.6 + 0.06 * n1)   # torn into strips
    split = np.zeros_like(u, dtype=bool)    # a solid apron, torn into two flaps below
    alpha = ((v > hem) & ~slit & ~split & (holes < 0)).astype(np.float32)
    alpha = ndimage.binary_opening(alpha > 0.5, iterations=2).astype(np.float32)
    alpha = np.where(v > 0.985, 0.0, alpha)
    lab, nl = ndimage.label(alpha > 0.5)                               # no floating specks below the hem
    if nl > 1:
        sizes = ndimage.sum(np.ones_like(alpha), lab, range(1, nl + 1))
        alpha = np.where(np.isin(lab, 1 + np.flatnonzero(sizes >= 400)), alpha, 0.0)
    col *= (1 - 0.45 * np.clip((v - 0.9) / 0.04, 0, 1))[..., None]      # rolled, filthy top edge
    rgba = np.dstack([np.clip(col, 0, 1), alpha])
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(out, "zombie_rags.png"))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
