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


def main(src, out):
    os.makedirs(out, exist_ok=True)
    im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255.0
    lum = im @ np.array([0.299, 0.587, 0.114], np.float32)
    mask = ndimage.binary_opening(lum > 0.055, iterations=2)
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
    col *= (1 - 0.45 * grime)[..., None]
    stain = np.clip(fbm((size, size), rng, 2.4) * 0.8 - 0.9, 0, 1)[..., None]
    col = col * (1 - stain) + np.array([0.20, 0.07, 0.05]) * stain       # old blood
    holes = fbm((size, size), rng, 2.8) + grime * 1.2 - 2.0
    n1 = fbm((size, size), rng, 1.8)[0]                               # periodic 1-D noise along u
    n2 = fbm((size, size), rng, 1.2)[0]
    # u = 0 is the front and back centre, 0.5 the hips: long tails, short at the sides
    hem = 0.05 + 0.6 * np.sin(np.pi * u) ** 2 + 0.035 * n1 + 0.02 * n2
    phase = (u * 9 + 0.25 * n1) % 1.0
    slit = (np.abs(phase - 0.5) < 0.045 + 0.02 * n2) & (v < 0.6 + 0.06 * n1)   # torn into strips
    split = (np.minimum(u, 1 - u) < 0.035 + 0.01 * n2) & (v < 0.72)    # a solid apron, torn into two flaps below
    alpha = ((v > hem) & ~slit & ~split & (holes < 0)).astype(np.float32)
    alpha = ndimage.binary_opening(alpha > 0.5, iterations=1).astype(np.float32)
    alpha = np.where(v > 0.985, 0.0, alpha)
    col *= (1 - 0.45 * np.clip((v - 0.9) / 0.04, 0, 1))[..., None]      # rolled, filthy top edge
    rgba = np.dstack([np.clip(col, 0, 1), alpha])
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(out, "zombie_rags.png"))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
