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


def make_swatch(sheet, mask, sources=None, size=512, chunk=120, n=220, seed=5):
    sources = SOURCES if sources is None else [tuple(int(q) for q in r) for r in sources]
    rng = np.random.default_rng(seed)
    mean = sheet[mask].mean(0)
    canvas = np.tile(mean, (size, size, 1)).astype(np.float32)
    yy, xx = np.mgrid[0:chunk, 0:chunk] - (chunk - 1) / 2
    rr = np.hypot(xx, yy) / (chunk / 2)
    alpha = np.clip(1 - rr, 0, 1) ** 0.6
    alpha = np.clip(alpha * 1.6, 0, 1)[..., None]
    red = sheet[..., 0] - 0.5 * (sheet[..., 1] + sheet[..., 2])
    placed = 0
    red_lim = max(0.03, float(np.median(red[mask])) + 0.03)     # relative only where a monster is red all over
    tries = 0
    while placed < n:
        tries += 1
        x0, y0, x1, y1 = sources[rng.integers(len(sources))]
        if x1 - x0 <= chunk or y1 - y0 <= chunk:
            sx = rng.integers(x0, max(x0 + 1, x1 - chunk)); sy = rng.integers(y0, max(y0 + 1, y1 - chunk))
        else:
            sx = rng.integers(x0, x1 - chunk); sy = rng.integers(y0, y1 - chunk)
        if tries < 20000 and (not mask[sy:sy + chunk, sx:sx + chunk].all() or red[sy:sy + chunk, sx:sx + chunk].mean() > red_lim):
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


def normals_from(rgb, mask, strength, vein=0.0):
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    if vein:   # red veins and lesions stand proud of the skin
        rr = rgb[..., 0] - 0.5 * (rgb[..., 1] + rgb[..., 2])
        lum = lum + vein * np.clip(rr - np.median(rr[mask]), 0, 0.5)
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
    os.makedirs(out, exist_ok=True)
    A, S, tri = d["atlas"], d["sheet"], d["tri"]
    P, N, W, LOW, CAV, ROT = d["P"], d["N"], d["W"], d["LOW"], d["CAV"], d["ROT"]
    DARK, WOUND, BONE, TOOTH = d["DARK"], d["WOUND"], d["BONE"], d["TOOTH"]
    NAIL, BED, EYEW = d["NAIL"], d["BED"], d["EYEW"]
    CLAW = d["CLAW"] if "CLAW" in d else np.zeros(len(P))
    IVORY = d["IVORY"] if "IVORY" in d else np.zeros(len(P))
    MOUTH = d["MOUTH"] if "MOUTH" in d else np.zeros(len(P))
    BUMPS = d["bumps"] if "bumps" in d else np.zeros((0, 5))
    g2 = list(d["grade2"]) if "grade2" in d else []
    g2 += [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.65, 0.0][len(g2):]
    sat, green, eyehot, gullet, cmatch, ivory_k, rmin, mould, sores, bedk, meatk = g2
    SPUR = d["SPUR"] if "SPUR" in d else np.zeros(len(P))
    ROPES = d["ropes"] if "ropes" in d else np.zeros((0, 4))
    EYEC = d["eyes"] if "eyes" in d else None
    trickle_on, crown_on, glow, rough_mul, *tint = d["feat"] if "feat" in d else (1, 1, 0, 1, 1, 1, 1)
    dark, rot_k, soot, vein, eyeglow, *eyecol = d["grade"] if "grade" in d else (0.8, 0.6, 0.5, 0.0, 0.0, 1, 0.85, 0.4)
    sheet = np.asarray(Image.open(os.path.join(tex, "zombie_basecolor.png")).convert("RGB"), np.float32) / 255
    smask = np.load(os.path.join(tex, "zombie_mask.npy"))
    sw = make_swatch(sheet, smask, d["clone"] if "clone" in d else None)

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
    KB = None
    mixh, blk = d["mix"] if "mix" in d else (0.0, 0.0)     # (never bw: that is the barycentric weights)
    if mixh > 0:   # a stitched variant: each piece keeps its own look but sits in the main sheet's range
        blk = int(blk); nb = sheet.shape[1] // blk
        means = [sheet[:, i * blk:(i + 1) * blk][smask[:, i * blk:(i + 1) * blk] > 0.5].mean(0) for i in range(nb)]
        gains = np.clip(np.array([(means[0] / np.maximum(m, 1e-3)) ** mixh for m in means]), 0.6, 1.7)
        kb = np.clip((s[:, 0] // blk).astype(int), 0, nb - 1)
        base = base * gains[kb]; low = low * gains[kb]
        KB = kb
        print("[bake] piece gains", np.round(gains, 2).tolist())

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
    col = col * (1 - soot * np.clip(cav, 0, 1))[:, None] * (1 + 0.14 * np.clip(-cav, 0, 1))[:, None]
    col = col * (1 - rot_k * rot[:, None]) + col * np.array([0.42, 0.44, 0.52]) * rot_k * rot[:, None]
    lum = col @ np.array([0.299, 0.587, 0.114])
    rr = col[:, 0] - 0.5 * (col[:, 1] + col[:, 2])
    red = np.clip((rr - max(0.0, float(np.median(rr)))) * 6, 0, 1)   # wounds: redder than this skin's norm (if it is red at all)
    col = col + (col - lum[:, None]) * 0.9 * red[:, None]
    col = col * dark * np.array([1.0, 1.025, 1.04])
    # torn cheek: raw wet meat round the rip; the mouth falls away to black down the throat
    wnd = lerp(WOUND[:, None])[:, 0]
    meat = np.array([0.2, 0.035, 0.03]) * (0.75 + 2.5 * det.mean(1, keepdims=True))   # dark blood
    meat = meat * (1 - meatk) + np.array([0.6, 0.16, 0.13]) * (0.8 + 2.5 * det.mean(1, keepdims=True)) * meatk   # or wet red-pink
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
    if not crown_on:   # a rib window: pale broken bars of rib across dark red meat
        zr = p[:, 2] + 0.012 * np.sin(p[:, 0] * 40) + 0.004 * np.sin(p[:, 1] * 90)          # curved, uneven ribs
        plate = np.clip((np.sin(zr * 2 * np.pi / 0.021 + 0.6 * np.sin(p[:, 0] * 25)) - 0.15) * 3, 0, 1)
        plate *= (np.sin(p[:, 0] * 61 + p[:, 2] * 33) > -0.55) * np.clip(0.7 + 3 * det.mean(1), 0, 1)   # snapped through
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
    for dx, a0, a1 in () if not trickle_on else ((0.0, 0.0, 1.0), (0.0065, 0.12, 0.62), (-0.006, 0.05, 0.4)):   # three broken runs
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
    hc = np.array([0.0, 0.022, 1.708]); wc = np.array(d["crown_c"] if "crown_c" in d else CROWN_C) - hc; wc /= np.linalg.norm(wc)
    rel = p - hc; rn = rel / (np.linalg.norm(rel, axis=1, keepdims=True) + 1e-9)
    for tx, ln in () if not crown_on else (((0, 1, 0.2), 0.95), ((0.2, -1, 0.3), 0.42), ((-1, 0.2, 0.6), 0.7), ((0.3, 0.5, -1), 0.3)):
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
    nail = np.array(d["nailcol"] if "nailcol" in d else (0.72, 0.67, 0.52)) * (0.75 + 2.5 * det.mean(1, keepdims=True)) * (0.55 + 0.45 * np.clip(np.abs(np.sin(p[:, 1] * 2200 + 3 * np.sin(p[:, 0] * 1500))) * 3, 0, 1))[:, None]
    col = col * (1 - bedk * min(1.0, rot_k / 0.6) * bd[:, None])
    col = col * (1 - nl[:, None]) + nail * nl[:, None]

    mo = lerp(MOUTH[:, None])[:, 0]
    # match the skin's overall colour to the sheet's paint (the grade must not drift it to slate or varnish)
    skinw = np.clip(1 - 3 * (lerp(TOOTH[:, None])[:, 0] + nl + lerp(CLAW[:, None])[:, 0] + lerp(EYEW[:, None])[:, 0] + mo), 0, 1)
    if cmatch > 0 and glow <= 0:
        ref = sheet[smask > 0.5].mean(0)
        cur = (col * skinw[:, None]).sum(0) / max(skinw.sum(), 1.0)
        gain = np.clip((ref / np.maximum(cur, 1e-3)) ** cmatch, 0.6, 1.9)
        col = col * (1 + (gain - 1)[None] * skinw[:, None])
        print("[bake] colour match gain", np.round(gain, 2).tolist())
    lum_ = col @ np.array([0.299, 0.587, 0.114])
    if sat != 1.0:
        col = lum_[:, None] + (col - lum_[:, None]) * sat
    if green > 0:   # the mould: green-dominant paint pushed further
        gm = np.clip((col[:, 1] - np.maximum(col[:, 0], col[:, 2]) * 0.92) * 9, 0, 1)
        col = col + (col - lum_[:, None]) * (green * gm)[:, None] + np.array([-0.02, 0.03, -0.01]) * (green * gm)[:, None]
    if gullet > 0:  # a wet red throat behind the teeth, falling away into the dark
        dep = np.maximum(np.clip((p[:, 1] + 0.074) / 0.02, 0, 1), np.clip((1.612 - p[:, 2]) / 0.018, 0, 1))[:, None]   # deep and low go dark
        throat = np.array([0.4, 0.06, 0.045]) * (0.75 + 2 * det.mean(1, keepdims=True)) * (1 - dep) + np.array([0.05, 0.008, 0.008]) * dep
        col = col * (1 - gullet * mo[:, None]) + throat * (gullet * mo)[:, None]
    if ivory_k > 0:   # teeth bleached ivory
        tw = np.clip(lerp(TOOTH[:, None])[:, 0] * 3, 0, 1)
        col = col * (1 - ivory_k * tw[:, None]) + np.array([0.82, 0.76, 0.6]) * (0.9 + 1.5 * det.mean(1, keepdims=True)) * (ivory_k * tw)[:, None]
    if mould > 0:   # fuzzy, speckled colonies crowding round the boils and down in the folds
        sp = (np.sin(p[:, 0] * 610 + np.sin(p[:, 2] * 270) * 2) * np.sin(p[:, 1] * 530 + 1.1) * np.sin(p[:, 2] * 470 + np.sin(p[:, 0] * 230) * 2))
        sp = np.clip((sp + 0.15) * 1.6, 0, 1) * np.clip(0.6 + 4 * det.mean(1), 0, 1)
        near = np.zeros(len(p))
        if len(BUMPS):
            from scipy.spatial import cKDTree
            dd, _ = cKDTree(BUMPS[:, :3]).query(p, k=1)
            near = np.clip(1 - (dd - 0.008) / 0.03, 0, 1)
        fold = np.clip((lerp(CAV[:, None])[:, 0] - 0.55) * 3, 0, 1)
        mm = np.clip(near * 0.8 + fold * 0.6, 0, 1) * sp * mould * skinw
        col = col * (1 - 0.6 * mm[:, None]) + np.array([0.17, 0.22, 0.09]) * (0.6 * mm)[:, None]
        spore = np.clip((sp - 0.85) * 6, 0, 1) * mm
        col = col * (1 - 0.5 * spore[:, None]) + np.array([0.55, 0.58, 0.42]) * (0.5 * spore)[:, None]
    SORE = np.zeros(len(p))
    if sores > 0:   # the painted rot: wet, darker, redder, a yellow head at the worst
        rr = col[:, 0] - 0.5 * (col[:, 1] + col[:, 2])
        SORE = np.clip((rr - np.median(rr) - 0.035) * 9, 0, 1) * skinw * sores
        col = col * (1 - 0.55 * SORE[:, None]) + np.array([0.36, 0.06, 0.045]) * (0.55 * SORE)[:, None]
        hd = np.clip((SORE - 0.85) * 6, 0, 1)
        col = col * (1 - 0.4 * hd[:, None]) + np.array([0.62, 0.52, 0.2]) * (0.4 * hd)[:, None]
    if len(ROPES):  # bruised, raw skin bulging either side of every rope
        from scipy.spatial import cKDTree
        dr, ri = cKDTree(ROPES[:, :3]).query(p, k=1)
        bz = np.clip(1 - (dr - ROPES[ri, 3]) / 0.014, 0, 1) * skinw
        col = col * (1 - 0.6 * bz[:, None]) + np.array([0.34, 0.1, 0.13]) * (0.6 * bz)[:, None]
    BH = np.zeros(len(p))   # boil / barnacle domes: colour here, relief in the normal map
    if len(BUMPS):
        from scipy.spatial import cKDTree
        dist, bi = cKDTree(BUMPS[:, :3]).query(p, k=1)
        br = BUMPS[bi, 3]; q = dist / br
        BH = np.sqrt(np.clip(1 - q * q, 0, 1))
        kind = int(BUMPS[0, 4])
        burst = (bi % 3 == 0)
        if kind == 0:   # boils: inflamed rim, yellow pus dome, some burst into wet red craters
            rim = np.clip(1 - np.abs(q - 1.05) / 0.6, 0, 1)
            col = col * (1 - 0.6 * rim[:, None]) + np.array([0.52, 0.11, 0.07]) * (0.6 * rim)[:, None]
            cz = BUMPS[bi, 2]
            below = np.clip((cz - p[:, 2]) / 0.05, 0, 1)
            lat = np.hypot(p[:, 0] - BUMPS[bi, 0], p[:, 1] - BUMPS[bi, 1])
            drip = np.where(burst & (p[:, 2] < cz), np.clip(1 - lat / (0.3 * br * (1 - 0.6 * below) + 1e-4), 0, 1) * (1 - below), 0.0)
            col = col * (1 - 0.7 * drip[:, None]) + np.array([0.5, 0.36, 0.1]) * (0.7 * drip)[:, None]
            BH = np.maximum(BH, drip * 0.25)
            pus = np.where(burst, 0.0, BH ** 1.5)
            col = col * (1 - 0.85 * pus[:, None]) + np.array([0.78, 0.66, 0.28]) * (0.85 * pus)[:, None]
            crater = np.where(burst, np.clip(1 - q / 0.7, 0, 1), 0.0)
            col = col * (1 - crater[:, None]) + np.array([0.22, 0.03, 0.02]) * crater[:, None]
            BH = np.where(burst, BH * 0.6 - crater * 0.8, BH)
        else:           # barnacles: crusted grey-white cones, a dark mouth in each
            ring = np.clip(BH * 1.4, 0, 1)
            crust = np.array([0.6, 0.6, 0.55]) * (0.7 + 3 * det.mean(1, keepdims=True))
            col = col * (1 - 0.9 * ring[:, None]) + crust * (0.9 * ring)[:, None]
            hole = np.clip(1 - q / 0.32, 0, 1)
            col = col * (1 - hole[:, None]) + np.array([0.05, 0.05, 0.05]) * hole[:, None]
            BH = BH - hole * 1.2
    su = lerp(SPUR[:, None])[:, 0]
    isS = su > 0.02
    boneS = np.array([0.8, 0.74, 0.6]) * (0.85 + 1.5 * det.mean(1, keepdims=True)) * (0.75 + 0.25 * su[:, None])
    rawS = np.array([0.42, 0.07, 0.05])
    col = np.where(isS[:, None], rawS * np.clip(1 - su[:, None] / 0.15, 0, 1) + boneS * np.clip(su[:, None] / 0.15, 0, 1), col)
    if "SEAM" in d and d["SEAM"].any():   # stitched together: puckered skin, a dark gash, thread crossing it
        sm = lerp(d["SEAM"][:, None])[:, 0]
        col = col * (1 - 0.3 * np.clip(sm * 1.6, 0, 1))[:, None] + np.array([0.3, 0.06, 0.05]) * (0.3 * np.clip(sm * 1.6, 0, 1))[:, None]
        gash = np.clip((sm - 0.72) * 7, 0, 1)
        col = col * (1 - 0.85 * gash[:, None]) + np.array([0.08, 0.02, 0.02]) * (0.85 * gash)[:, None]
        pat = 0.5 + 0.5 * np.sin((p @ np.array([83.0, 61.0, 97.0])) * 2 * np.pi / 0.9)
        thread = np.clip((pat - 0.7) * 6, 0, 1) * np.clip((sm - 0.3) * 4, 0, 1)
        col = col * (1 - 0.9 * thread[:, None]) + np.array([0.16, 0.12, 0.09]) * (0.9 * thread)[:, None]
    if "headtint" in d:   # a darker, congested face (strangled) or a jaundice spreading down the chest
        z0, zw, fo = d["headtint_zw"] if "headtint_zw" in d else (1.56, 0.05, 0.0)
        hm = np.clip((p[:, 2] - z0) / zw, 0, 1) * (np.clip((0.02 - p[:, 1]) / 0.03, 0, 1) if fo else 1.0)
        hm = hm[:, None] * skinw[:, None]
        col = col * (1 - hm + hm * np.array(d["headtint"]))
    if "welts" in d and float(d["welts"][0]) > 0 and len(ROPES):
        from scipy.spatial import cKDTree
        dr2, ri2 = cKDTree(ROPES[:, :3]).query(p, k=1)
        wz = np.clip(1 - (dr2 - ROPES[ri2, 3]) / 0.035, 0, 1) * skinw * float(d["welts"][0])
        col = col * (1 - 0.55 * wz[:, None]) + np.array([0.42, 0.08, 0.16]) * (0.55 * wz)[:, None]
    WET = np.zeros(len(p))
    if "flay" in d and KB is not None and int(d["flay"][0]) >= 0:
        fb, fs = int(d["flay"][0]), float(d["flay"][1])
        fib = 0.72 + 0.28 * np.sin(p[:, 2] * 900 + 3 * np.sin(p[:, 0] * 260) + 2 * np.sin(p[:, 1] * 310))
        raw = np.array([0.48, 0.08, 0.065]) * fib[:, None] * (0.85 + 2 * det.mean(1, keepdims=True))
        fl = (KB == fb) * fs * skinw
        col = col * (1 - fl[:, None]) + raw * fl[:, None]
        WET = np.maximum(WET, 0.5 * fl)
    for x_, y_, z_, r_, k_ in (d["decals"] if "decals" in d else []):   # marks of its own
        m_ = np.clip(1 - np.linalg.norm(p - [x_, y_, z_], axis=1) / r_, 0, 1)
        if not m_.any():
            continue
        blot = np.clip(0.5 + 0.5 * np.sin(p @ np.array([211.0, 173.0, 97.0])) * np.sin(p @ np.array([-131.0, 251.0, 63.0])) + 0.25, 0, 1)
        w_ = np.clip(m_ * 1.7, 0, 1) ** 0.8 * blot * skinw
        k_ = int(k_)
        if k_ == 0:      # pooled blood under the skin, healing yellow-green at the edges
            core = np.clip((m_ - 0.4) * 3, 0, 1) * blot * skinw
            edge = np.clip(1 - np.abs(m_ - 0.25) / 0.2, 0, 1) * blot * skinw
            col = col * (1 - 0.4 * edge[:, None]) + np.array([0.45, 0.47, 0.2]) * (0.4 * edge)[:, None]
            col = col * (1 - 0.75 * core[:, None]) + np.array([0.18, 0.05, 0.15]) * (0.75 * core)[:, None]
        elif k_ == 1:    # wet, peeling rot
            col = col * (1 - 0.75 * w_[:, None]) + np.array([0.15, 0.14, 0.06]) * (0.8 + 2.5 * det.mean(1, keepdims=True)) * (0.75 * w_)[:, None]
            WET = np.maximum(WET, w_)
        elif k_ == 2:    # old blood
            col = col * (1 - 0.8 * w_[:, None]) + np.array([0.28, 0.04, 0.03]) * (0.8 * w_)[:, None]
            WET = np.maximum(WET, 0.6 * w_)
        elif k_ == 3:    # sunken shadow
            col = col * (1 - 0.6 * np.clip(m_ * 1.4, 0, 1))[:, None]
        else:            # bloodless pallor
            col = col + (np.array([0.82, 0.82, 0.8]) - col) * (0.5 * w_)[:, None]
    iv = lerp(IVORY[:, None])[:, 0]          # the bone rim round a rotted-off nose
    col = col * (1 - iv[:, None]) + np.clip(np.array([0.6, 0.55, 0.44]) * (0.85 + 2.0 * det.mean(1, keepdims=True)), 0, 1) * iv[:, None]
    col = col * np.array(tint)
    cl = lerp(CLAW[:, None])[:, 0]          # claws: dark keratin, streaked, paling to a horn point
    isC = cl > 0.02
    streak = 0.75 + 0.25 * np.sin(p[:, 0] * 2600 + p[:, 1] * 1900)
    c0, c1, c2 = np.array([0.12, 0.04, 0.025]), np.array([0.32, 0.24, 0.11]), np.array([0.5, 0.42, 0.24])
    a1 = np.clip((cl - 0.08) / 0.3, 0, 1)[:, None]; a2 = np.clip((cl - 0.45) / 0.55, 0, 1)[:, None]
    keratin = (c0 * (1 - a1) + c1 * a1) * (1 - a2) + c2 * a2
    col = np.where(isC[:, None], keratin * streak[:, None], col)
    ew = lerp(EYEW[:, None])[:, 0]
    col = col * (1 - ew[:, None]) + np.clip(col * 1.45 + 0.04, 0, 1) * ew[:, None]
    col = col * (1 - 0.85 * eyehot * ew[:, None])

    img = np.zeros((size, size, 3), np.float32)
    img[mask] = np.clip(col, 0, 1)
    eyes = np.zeros((size, size), np.float32)
    eyes[mask] = ew
    if glow > 0 or eyeglow > 0:   # embers: hot cracks light themselves; eyes catch the torch
        hot = np.clip((col[:, 0] - 0.22) * 4, 0, 1) * np.clip((col[:, 0] - 1.25 * col[:, 1]) * 4, 0, 1) * np.clip((col[:, 0] - 1.8 * col[:, 2]) * 4, 0, 1)
        if glow > 0:   # keep the thin cracks, drop the blobs' insides
            himg = np.zeros((size, size), np.float32); himg[mask] = hot
            mk = ndimage.gaussian_filter(mask.astype(np.float32), 5) + 1e-4
            dens = ndimage.gaussian_filter(himg, 5) / mk
            ridge = np.clip((himg - ndimage.gaussian_filter(himg, 2.5) / (ndimage.gaussian_filter(mask.astype(np.float32), 2.5) + 1e-4)) * 3.0, 0, 1)
            hot = np.clip(ridge[mask] * np.clip(1.15 - 1.6 * dens[mask], 0, 1) * 1.8, 0, 1)   # thin lines and seams only
            hot = hot * np.clip(1 - 1.6 * w, 0, 1)                    # nothing on the clone-patched skin (it striped)
            hot = hot * ~((p[:, 2] > 1.46) & (p[:, 2] < 1.6) & (np.hypot(p[:, 0], p[:, 1] - 0.02) < 0.075))   # nor the neck band
            himg = np.zeros((size, size), np.float32); himg[mask] = hot
            lab, nlab = ndimage.label(himg > 0.2)
            if nlab:
                sizes = ndimage.sum(np.ones_like(himg), lab, range(1, nlab + 1))
                keep = np.isin(lab, 1 + np.flatnonzero(sizes >= 90))
                hot = hot * keep[mask]
        em = np.zeros((size, size, 3), np.float32)
        strength = max(glow, 1.0)
        emc = np.clip(col * 1.3 + 0.15, 0, 1) * hot[:, None] * np.array([1.6, 0.48, 0.15]) * (1.0 if glow > 0 else 0.0)
        if glow > 0:
            emc = emc + np.array([1.0, 0.42, 0.1]) * (mo * 0.9)[:, None]          # a furnace behind the teeth
        eyelit = np.clip(col * 1.6, 0, 1) * np.array(eyecol)[None]          # the painted eye itself, pupils stay dark
        if eyehot > 0 and EYEC is not None:   # or molten: a white-hot core fading to an orange rim
            dxz = np.hypot(np.abs(p[:, 0]) - EYEC[0], p[:, 2] - EYEC[2])
            core = np.clip(1 - dxz / (0.9 * EYEC[3]), 0, 1)[:, None] ** 0.7
            hotc = np.array([1.0, 0.92, 0.72]) * core + np.array([1.0, 0.42, 0.1]) * (1 - core) * 0.8
            eyelit = eyelit * (1 - eyehot) + hotc * eyehot
        emc = emc + eyelit * (np.clip((ew - 0.5) * 2, 0, 1) * eyeglow / strength)[:, None]
        em[mask] = np.clip(emc, 0, 1)
        Image.fromarray((bleed(em, mask) * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, "zombie_atlas_emissive.png"))
    img = bleed(img, mask)
    os.makedirs(out, exist_ok=True)
    Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, "zombie_atlas_basecolor.png"))

    if len(BUMPS):
        bimg = np.zeros((size, size, 3), np.float32); bimg[mask] = BH[:, None] * 0.45
        img_n = np.clip(img + bimg, 0, 2)
    else:
        img_n = img
    n = normals_from(img_n, mask, 6.0, vein)
    Image.fromarray(((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, "zombie_atlas_normal.png"))

    lum = img @ np.array([0.299, 0.587, 0.114], np.float32)
    red = np.clip((img[..., 0] - (img[..., 1] + img[..., 2]) * 0.5) * 4.0, 0, 1)
    rough = ndimage.gaussian_filter(np.clip(0.86 - 0.5 * red - 0.15 * np.clip(0.35 - lum, 0, 1), 0.3, 0.92), 1.0)
    rough = np.clip(rough * rough_mul, 0.12, 1)
    rough = rough * (1 - eyes) + 0.2 * eyes            # wet eyes catch the torchlight
    if rmin > 0:
        rough = np.maximum(rough, rmin)
    if WET.any():
        we = np.zeros((size, size), np.float32); we[mask] = WET
        rough = rough * (1 - we) + 0.25 * we
    if sores > 0:
        sw_ = np.zeros((size, size), np.float32); sw_[mask] = SORE
        rough = rough * (1 - sw_) + 0.22 * sw_
    if len(BUMPS) and int(BUMPS[0, 4]) == 0:
        bw = np.zeros((size, size), np.float32); bw[mask] = np.clip(BH * 1.5, 0, 1)
        rough = rough * (1 - bw) + 0.18 * bw            # glossy, tight boils
    orm = np.dstack([np.ones_like(rough), rough, np.zeros_like(rough)])
    Image.fromarray((orm * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, "zombie_atlas_orm.png"))
    print("[bake] atlas coverage %.0f%%, patched px %.1f%%" % (100 * mask.mean(), 100 * (w > 0.5).mean()))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 2048)
