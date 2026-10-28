"""Hand repairs for creature frames ChatGPT got wrong, used by a creature's fix file
(tools/creatures/<id>.py, run by import_bundle.py).

Frames are held as `frames[anim][(dir, frame)] = Frame(rgba, ax, ay)`: rgba a trimmed HxWx4
uint8 array, (ax, ay) the foot anchor inside it in pixels.
"""
import json
import os
from dataclasses import dataclass

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
with open(os.path.join(ROOT, "templates", "style", "bellmourn_palette.json")) as _f:
    _pal = json.load(_f)
PALETTE = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)]
                    for h in _pal["colors"][:_pal["key_index"]]], np.int32)


@dataclass
class Frame:
    rgba: np.ndarray
    ax: float
    ay: float


def snap(rgb):
    """Nearest palette colour for every pixel."""
    flat = rgb.reshape(-1, 3).astype(np.int32)
    idx = np.empty(len(flat), np.int32)
    for s in range(0, len(flat), 65536):
        d = ((flat[s:s + 65536, None, :] - PALETTE[None]) ** 2).sum(axis=2)
        idx[s:s + 65536] = d.argmin(axis=1)
    return PALETTE[idx].reshape(rgb.shape).astype(np.uint8)


def trim(fr):
    """Crop to the opaque pixels, keeping the anchor where it was."""
    ys, xs = np.nonzero(fr.rgba[..., 3])
    y0, x0 = ys.min(), xs.min()
    return Frame(fr.rgba[y0:ys.max() + 1, x0:xs.max() + 1].copy(), fr.ax - x0, fr.ay - y0)


def mirror_legs(fr, cut):
    """Swap which leg is lifted in a front or back view: mirror everything below row `cut`
    about the middle of the legs on that row, so the silhouette meets the body exactly.
    Pick `cut` just below the hands, where only the legs are left."""
    a = fr.rgba
    xs = np.nonzero(a[cut, :, 3])[0]
    axis2 = int(xs.min() + xs.max())  # x' = axis2 - x
    pad = max(0, axis2 - (a.shape[1] - 1))
    w = a.shape[1] + pad
    out = np.zeros((a.shape[0], w, 4), np.uint8)
    out[:cut, :a.shape[1]] = a[:cut]
    for x in range(a.shape[1]):
        nx = axis2 - x
        if 0 <= nx < w:
            out[cut:, nx] = a[cut:, x]
    return trim(Frame(out, fr.ax, fr.ay))


def rescale(fr, s):
    """Uniform rescale with the feet kept on the ground: filtered, then back on the palette
    with hard alpha."""
    a = fr.rgba.astype(np.float32) / 255
    w, h = max(1, round(a.shape[1] * s)), max(1, round(a.shape[0] * s))
    prem = a.copy()
    prem[..., :3] *= prem[..., 3:4]
    im = Image.fromarray((prem * 255).astype(np.uint8), "RGBA").resize((w, h), Image.LANCZOS)
    r = np.asarray(im).astype(np.float32) / 255
    alpha = r[..., 3:4]
    rgb = np.where(alpha > 0, r[..., :3] / np.maximum(alpha, 1e-3), 0)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = snap(np.clip(rgb * 255, 0, 255))
    out[..., 3] = (alpha[..., 0] > 0.5) * 255
    out[out[..., 3] == 0, :3] = 0
    return trim(Frame(out, fr.ax * s, fr.ay * s))


def drop_specks(fr, max_area=80, gap=2):
    """Remove small islands that do not touch the main body (stray paint). Returns the frame
    and how many pixels went."""
    m = fr.rgba[..., 3] > 0
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    if n < 2:
        return fr, 0
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    near = ndimage.binary_dilation(lab == int(np.argmax(sizes)) + 1, iterations=gap)
    a, killed = fr.rgba.copy(), 0
    for i in range(n):
        comp = lab == i + 1
        if sizes[i] <= max_area and not (comp & near).any():
            a[comp] = 0
            killed += int(sizes[i])
    return (trim(Frame(a, fr.ax, fr.ay)) if killed else fr), killed


def reorder(frames, anim, d, order):
    """order[i] = the current frame that plays i-th, for one direction."""
    cur = {f: frames[anim][(d, f)] for f in range(len(order))}
    for i, src in enumerate(order):
        frames[anim][(d, i)] = cur[src]
