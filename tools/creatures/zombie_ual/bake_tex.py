"""Bake the painted sheet onto the zombie's own atlas and patch what the sheet cannot cover
(system Python: numpy, scipy, PIL).

  python bake_tex.py <bake.npz> <tex_dir> <out_dir> [size]

The build hands over, per face corner: atlas UV, sheet UV, rest position, normal, and two
per-vertex fields it measured on the mesh: W, how badly the sheet is stretched or seamed there,
and LOW, the local skin colour smoothed across the surface.

Where W is high the sheet is replaced by a clone-stamp patch: chunks of clean skin cut out of
the sheet, pasted over each other with feathered edges into a tileable swatch, laid on by 3D
position (triplanar, so it runs straight across seams) and colour-matched to LOW so it melts
into the painted skin round it. Normal and roughness maps are then read from the result.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

# clean skin to clone from: the four torso side strips (unused by the mapping), back, thighs
SOURCES = [(14, 330, 128, 600), (506, 330, 618, 600), (641, 330, 750, 600), (1129, 330, 1238, 600),
           (770, 430, 1110, 650), (60, 910, 580, 985), (60, 1015, 580, 1095)]


def make_swatch(sheet, mask, size=512, chunk=120, n=220, seed=5):
    rng = np.random.default_rng(seed)
    mean = sheet[mask].mean(0)
    canvas = np.tile(mean, (size, size, 1)).astype(np.float32)
    yy, xx = np.mgrid[0:chunk, 0:chunk] - (chunk - 1) / 2
    rr = np.hypot(xx, yy) / (chunk / 2)
    alpha = np.clip(1 - rr, 0, 1) ** 0.6
    alpha = np.clip(alpha * 1.6, 0, 1)[..., None]
    red = sheet[..., 0] - 0.5 * (sheet[..., 1] + sheet[..., 2])
    placed = 0
    while placed < n:
        x0, y0, x1, y1 = SOURCES[rng.integers(len(SOURCES))]
        if x1 - x0 < chunk or y1 - y0 < chunk:
            sx = rng.integers(x0, max(x0 + 1, x1 - chunk)); sy = rng.integers(y0, max(y0 + 1, y1 - chunk))
        else:
            sx = rng.integers(x0, x1 - chunk); sy = rng.integers(y0, y1 - chunk)
        if not mask[sy:sy + chunk, sx:sx + chunk].all() or red[sy:sy + chunk, sx:sx + chunk].mean() > 0.03:
            continue
        c = sheet[sy:sy + chunk, sx:sx + chunk]
        c = np.rot90(c, rng.integers(4))
        if rng.random() < 0.5:
            c = c[:, ::-1]
        c = c - c.reshape(-1, 3).mean(0) + mean                 # massage: same tone as the rest
        px, py = rng.integers(size), rng.integers(size)
        iy = (np.arange(chunk) + py) % size; ix = (np.arange(chunk) + px) % size
        canvas[np.ix_(iy, ix)] = canvas[np.ix_(iy, ix)] * (1 - alpha) + c * alpha
        placed += 1
    low = np.stack([ndimage.gaussian_filter(canvas[..., i], 7, mode="wrap") for i in range(3)], -1)
    return canvas - low                                          # detail only


def sample(img, x, y, wrap=False):
    mode = "wrap" if wrap else "nearest"
    return np.stack([ndimage.map_coordinates(img[..., i], [y, x], order=1, mode=mode) for i in range(img.shape[2])], -1)


def rasterize(xy, tri, size):
    """Triangle id + barycentrics per atlas pixel; a conservative second pass fills edge gaps."""
    tid = np.full((size, size), -1, np.int32)
    bary = np.zeros((size, size, 3), np.float32)
    for strict in (True, False):
        for t, (a, b, c) in enumerate(xy[tri]):
            x0 = max(int(np.floor(min(a[0], b[0], c[0]) - 1)), 0); x1 = min(int(np.ceil(max(a[0], b[0], c[0]) + 1)), size - 1)
            y0 = max(int(np.floor(min(a[1], b[1], c[1]) - 1)), 0); y1 = min(int(np.ceil(max(a[1], b[1], c[1]) + 1)), size - 1)
            if x1 < x0 or y1 < y0:
                continue
            gy, gx = np.mgrid[y0:y1 + 1, x0:x1 + 1] + 0.5
            den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(den) < 1e-12:
                continue
            l0 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / den
            l1 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / den
            l2 = 1 - l0 - l1
            sub = tid[y0:y1 + 1, x0:x1 + 1]
            if strict:
                ins = (l0 >= 0) & (l1 >= 0) & (l2 >= 0)
            else:
                e = 1.2 / max(np.sqrt(abs(den)), 1e-6)
                ins = (l0 >= -e) & (l1 >= -e) & (l2 >= -e) & (sub < 0)
            if not ins.any():
                continue
            sub[ins] = t
            bb = np.clip(np.stack([l0, l1, l2], -1), 0, None)
            bb /= bb.sum(-1, keepdims=True)
            bary[y0:y1 + 1, x0:x1 + 1][ins] = bb[ins]
    return tid, bary


def bleed(img, mask, px=16):
    """Smooth outward fill (masked blurs), nearest-pixel beyond."""
    out = img.copy()
    m = mask.astype(np.float32)
    filled = mask.copy()
    for s in (1.0, 2.0, 4.0):
        w = ndimage.gaussian_filter(m, s)
        est = np.stack([ndimage.gaussian_filter(img[..., i] * m, s) for i in range(img.shape[2])], -1) / (w[..., None] + 1e-6)
        take = ~filled & (w > 2e-3)
        out[take] = est[take]
        filled |= take
    dist, (iy, ix) = ndimage.distance_transform_edt(~filled, return_indices=True)
    rest = ~filled
    out[rest] = out[iy[rest], ix[rest]]
    return out


def normals_from(rgb, mask, strength):
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    m = mask.astype(np.float32)
    lf = np.where(mask, lum, 0)
    fine = ndimage.gaussian_filter(lf, 0.8) / (ndimage.gaussian_filter(m, 0.8) + 1e-4)
    local = ndimage.gaussian_filter(lf, 7) / (ndimage.gaussian_filter(m, 7) + 1e-4)
    det = np.where(mask, fine - local, 0)
    det = bleed(det[..., None], mask, 8)[..., 0]
    gy, gx = np.gradient(ndimage.gaussian_filter(det, 0.7))
    n = np.dstack([-gx * strength, gy * strength, np.ones_like(gx)])
    return n / np.linalg.norm(n, axis=2, keepdims=True)


CROWN_C = (0.0557, -0.0025, 1.7715)  # keep in step with sdf.CROWN[0]


def main(npz, tex, out, size=2048):
    d = np.load(npz)
    A, S, tri = d["atlas"], d["sheet"], d["tri"]
    P, N, W, LOW, CAV, ROT = d["P"], d["N"], d["W"], d["LOW"], d["CAV"], d["ROT"]
    DARK, WOUND, BONE, TOOTH = d["DARK"], d["WOUND"], d["BONE"], d["TOOTH"]
    NAIL, BED, EYEW = d["NAIL"], d["BED"], d["EYEW"]
    sheet = np.asarray(Image.open(os.path.join(tex, "zombie_basecolor.png")).convert("RGB"), np.float32) / 255
    smask = np.load(os.path.join(tex, "zombie_mask.npy"))
    sw = make_swatch(sheet, smask)

    xy = np.stack([A[:, 0] * size, (1 - A[:, 1]) * size], 1)
    tid, bary = rasterize(xy, tri, size)
    mask = tid >= 0
    L = tri[tid[mask]]                      # (k, 3) loop ids
    bw = bary[mask][..., None]

    def lerp(attr):
        return (attr[L] * bw).sum(1)

    s = lerp(S); w = lerp(W[:, None])[:, 0]; low = lerp(LOW); p = lerp(P); nrm = lerp(N)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
    base = sample(sheet, s[:, 0] - 0.5, s[:, 1] - 0.5)

    # triplanar clone-stamp detail, ~1000 px per metre like the sheet
    tw = np.abs(nrm) ** 4; tw /= tw.sum(1, keepdims=True)
    k = 1000.0
    det = (sample(sw, p[:, 1] * k + 37, -p[:, 2] * k, True) * tw[:, :1]
           + sample(sw, p[:, 0] * k + 191, -p[:, 2] * k + 83, True) * tw[:, 1:2]
           + sample(sw, p[:, 0] * k + 311, p[:, 1] * k + 157, True) * tw[:, 2:3])
    patch = low + det * 1.1
    col = base * (1 - w[:, None]) + patch * w[:, None]

    # grade: soot in the creases, worn highlights on bony ridges, rot creeping up from the
    # hands and feet, wounds pushed wetter and redder, the whole corpse a stop darker
    cav = lerp(CAV[:, None])[:, 0]; rot = lerp(ROT[:, None])[:, 0]
    col = col * (1 - 0.5 * np.clip(cav, 0, 1))[:, None] * (1 + 0.14 * np.clip(-cav, 0, 1))[:, None]
    col = col * (1 - 0.6 * rot[:, None]) + col * np.array([0.42, 0.44, 0.52]) * 0.6 * rot[:, None]
    lum = col @ np.array([0.299, 0.587, 0.114])
    red = np.clip((col[:, 0] - 0.5 * (col[:, 1] + col[:, 2])) * 6, 0, 1)
    col = col + (col - lum[:, None]) * 0.9 * red[:, None]
    col = col * np.array([0.8, 0.82, 0.83])
    # torn cheek: raw wet meat round the rip; the mouth falls away to black down the throat
    wnd = lerp(WOUND[:, None])[:, 0]
    meat = np.array([0.2, 0.035, 0.03]) * (0.75 + 2.5 * det.mean(1, keepdims=True))   # dark blood
    col = col * (1 - 0.85 * wnd[:, None]) + meat * 0.85 * wnd[:, None]
    dk = lerp(DARK[:, None])[:, 0]
    col = col * (1 - dk[:, None])
    # crown: grimed and bruised, with a caved-in patch of cracked bone
    crown = np.clip((p[:, 2] - 1.735) / 0.05, 0, 1)
    col = col * (1 - 0.32 * crown[:, None]) * (1 + np.array([-0.02, -0.06, 0.03]) * crown[:, None])
    bn = lerp(BONE[:, None])[:, 0]
    # inside the craters: maroon-black clot with stepped fragments of grey-ivory bone
    frag = np.sin(p[:, 0] * 1300 + 2.5 * np.sin(p[:, 1] * 900)) * np.sin(p[:, 1] * 1100 + 2 * np.sin(p[:, 2] * 1200))
    plate = np.clip((frag - 0.15) * 4, 0, 1)
    bone = np.array([0.5, 0.48, 0.42]) * (0.75 + 2.5 * det.mean(1, keepdims=True))
    clot = np.array([0.09, 0.025, 0.025])
    inner = bone * plate[:, None] + clot * (1 - plate[:, None])
    col = col * (1 - bn[:, None]) + inner * bn[:, None]
    rim = np.clip(bn * (1 - bn) * 4, 0, 1) * (0.55 + 0.45 * plate)
    col = col * (1 - 0.7 * rim[:, None]) + np.array([0.62, 0.58, 0.5]) * (0.8 + 2 * det.mean(1, keepdims=True)) * 0.7 * rim[:, None]
    # one trickle of old blood from the crater down the forehead to the brow
    trail = np.array([(0.05, -0.014, 1.762), (0.046, -0.034, 1.753), (0.041, -0.051, 1.739), (0.038, -0.061, 1.726), (0.035, -0.068, 1.715)])
    best = np.full(len(p), 1e9); along = np.zeros(len(p))
    for j in range(len(trail) - 1):
        a_, b_ = trail[j], trail[j + 1]; ab_ = b_ - a_
        t_ = np.clip(((p - a_) @ ab_) / (ab_ @ ab_), 0, 1)
        dd = np.linalg.norm(p - (a_ + t_[:, None] * ab_), axis=1) + 0.0009 * np.sin(p[:, 2] * 420 + 1.3)
        sel = dd < best; best = np.where(sel, dd, best); along = np.where(sel, (j + t_) / (len(trail) - 1), along)
    trick = np.zeros(len(p))
    for dx, a0, a1 in ((0.0, 0.0, 1.0), (0.0065, 0.12, 0.62), (-0.006, 0.05, 0.4)):   # three broken runs
        bst = np.full(len(p), 1e9); alg = np.zeros(len(p))
        for j in range(len(trail) - 1):
            a_, b_ = trail[j] + (dx, 0, 0), trail[j + 1] + (dx, 0, 0); ab_ = b_ - a_
            t_ = np.clip(((p - a_) @ ab_) / (ab_ @ ab_), 0, 1)
            dd = np.linalg.norm(p - (a_ + t_[:, None] * ab_), axis=1) + 0.0007 * np.sin(p[:, 2] * 420 + 1.3 + dx * 900)
            sel = dd < bst; bst = np.where(sel, dd, bst); alg = np.where(sel, (j + t_) / (len(trail) - 1), alg)
        rel_a = np.clip((alg - a0) / max(a1 - a0, 1e-3), 0, 1)
        width = (0.0036 - 0.0024 * rel_a) * (1 + 1.2 * np.clip((rel_a - 0.85) / 0.15, 0, 1) * (dx == 0))   # tapers, pools at the brow
        gap = (np.sin(alg * 19 + dx * 400) > 0.82) & (rel_a > 0.7) if dx == 0 else (np.sin(alg * 23 + dx * 400) > 0.6)   # one continuous run, breaking to flecks at its end
        on = (alg >= a0) & (alg <= a1) & ~gap
        trick = np.maximum(trick, np.clip((width - bst) / 0.001, 0, 1) * on)
    col = col * (1 - 0.88 * trick[:, None]) + np.array([0.17, 0.035, 0.028]) * 0.88 * trick[:, None]   # old blood, dark red-brown
    # hairline cracks running out across the scalp from the wound
    hc = np.array([0.0, 0.022, 1.708]); wc = np.array(CROWN_C) - hc; wc /= np.linalg.norm(wc)
    rel = p - hc; rn = rel / (np.linalg.norm(rel, axis=1, keepdims=True) + 1e-9)
    for tx, ln in (((0, 1, 0.2), 0.95), ((0.2, -1, 0.3), 0.42), ((-1, 0.2, 0.6), 0.7), ((0.3, 0.5, -1), 0.3)):
        nrm_k = np.cross(wc, np.array(tx, float)); nrm_k /= np.linalg.norm(nrm_k)
        off = rn @ nrm_k + 0.004 * np.sin(rel[:, 0] * 900 + rel[:, 1] * 700)
        reach = np.arccos(np.clip(rn @ wc, -1, 1))
        line = (np.abs(off) < 0.012 * (1 - reach / ln)) & (reach < ln) & (p[:, 2] > 1.62)
        col[line] *= 0.38
    # teeth: dirty ivory, never as grey as the skin
    th = lerp(TOOTH[:, None])[:, 0]
    isT = th > 0.05
    tip = np.clip((th - 0.3) / 0.7, 0, 1)[:, None]
    ivory = np.clip(col * 2.0 * np.array([1.05, 1.0, 0.78]), 0, 1)
    rot_t = col * np.array([0.42, 0.3, 0.2])
    col = np.where(isT[:, None], rot_t * (1 - tip) + ivory * tip, col)
    # nails: cracked yellow-grey plates; the beds behind them gone black
    nl = lerp(NAIL[:, None])[:, 0]; bd = lerp(BED[:, None])[:, 0]
    nail = np.array([0.72, 0.67, 0.52]) * (0.75 + 2.5 * det.mean(1, keepdims=True)) * (0.55 + 0.45 * np.clip(np.abs(np.sin(p[:, 1] * 2200 + 3 * np.sin(p[:, 0] * 1500))) * 3, 0, 1))[:, None]
    col = col * (1 - 0.65 * bd[:, None])
    col = col * (1 - nl[:, None]) + nail * nl[:, None]

    ew = lerp(EYEW[:, None])[:, 0]
    col = col * (1 - ew[:, None]) + np.clip(col * 1.45 + 0.04, 0, 1) * ew[:, None]
    img = np.zeros((size, size, 3), np.float32)
    img[mask] = np.clip(col, 0, 1)
    eyes = np.zeros((size, size), np.float32)
    eyes[mask] = ew
    img = bleed(img, mask)
    os.makedirs(out, exist_ok=True)
    Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, "zombie_atlas_basecolor.png"))

    n = normals_from(img, mask, 6.0)
    Image.fromarray(((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, "zombie_atlas_normal.png"))

    lum = img @ np.array([0.299, 0.587, 0.114], np.float32)
    red = np.clip((img[..., 0] - (img[..., 1] + img[..., 2]) * 0.5) * 4.0, 0, 1)
    rough = ndimage.gaussian_filter(np.clip(0.86 - 0.5 * red - 0.15 * np.clip(0.35 - lum, 0, 1), 0.3, 0.92), 1.0)
    rough = rough * (1 - eyes) + 0.2 * eyes            # wet eyes catch the torchlight
    orm = np.dstack([np.ones_like(rough), rough, np.zeros_like(rough)])
    Image.fromarray((orm * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, "zombie_atlas_orm.png"))
    print("[bake] atlas coverage %.0f%%, patched px %.1f%%" % (100 * mask.mean(), 100 * (w > 0.5).mean()))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 2048)
