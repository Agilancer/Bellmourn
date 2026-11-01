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
    """Clone-stamp swatch from any sheet: chunks wholly on paint below the head row, skipping
    ones far from the sheet's usual skin colour (mouths, wounds, horns, soles)."""
    rng = np.random.default_rng(seed)
    mean = sheet[mask].mean(0)
    canvas = np.tile(mean, (size, size, 1)).astype(np.float32)
    yy, xx = np.mgrid[0:chunk, 0:chunk] - (chunk - 1) / 2
    rr = np.hypot(xx, yy) / (chunk / 2)
    alpha = np.clip(np.clip(1 - rr, 0, 1) ** 0.6 * 1.6, 0, 1)[..., None]
    ok = ndimage.distance_transform_edt(mask) > chunk * 0.72
    ok[:200] = False
    ys, xs = np.nonzero(ok)
    med = np.median(sheet[mask], axis=0)
    placed = tries = 0
    while placed < n and tries < n * 60 and len(ys):
        tries += 1
        i = rng.integers(len(ys))
        sy, sx = ys[i] - chunk // 2, xs[i] - chunk // 2
        c = sheet[sy:sy + chunk, sx:sx + chunk]
        if c.shape[:2] != (chunk, chunk) or np.abs(c.reshape(-1, 3).mean(0) - med).max() > 0.09:
            continue
        c = np.rot90(c, rng.integers(4))
        if rng.random() < 0.5:
            c = c[:, ::-1]
        c = c - c.reshape(-1, 3).mean(0) + mean                 # massage: same tone as the rest
        px, py = rng.integers(size), rng.integers(size)
        iy = (np.arange(chunk) + py) % size; ix = (np.arange(chunk) + px) % size
        canvas[np.ix_(iy, ix)] = canvas[np.ix_(iy, ix)] * (1 - alpha) + c * alpha
        placed += 1
    print("[bake] swatch chunks", placed, "of", tries, "tries")
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
    LIMB, CLAW, HORNF = d["LIMB"], d["CLAW"], d["HORNF"]
    SPIKE, NOSEL = d["SPIKE"], d["NOSEL"]
    EYE = d["EYE"]
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
    onpaint = sample(smask.astype(np.float32)[..., None], s[:, 0] - 0.5, s[:, 1] - 0.5)[:, 0]
    bg = np.clip((0.9 - onpaint) / 0.3, 0, 1)
    if (bg > 0.5).any():
        print("[bake] %.2f%% px on blank sheet, centred at %s" % (100 * (bg > 0.5).mean(), np.round(p[bg > 0.5].mean(0), 3)))
    w = np.maximum(w, bg)
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
    col = col * np.array([0.9, 0.9, 0.9])
    # torn cheek: raw wet meat round the rip; the mouth falls away to black down the throat
    wnd = lerp(WOUND[:, None])[:, 0]
    meat = np.array([0.2, 0.035, 0.03]) * (0.75 + 2.5 * det.mean(1, keepdims=True))   # dark blood
    col = col * (1 - 0.85 * wnd[:, None]) + meat * 0.85 * wnd[:, None]
    nl_ = lerp(NOSEL[:, None])[:, 0]                      # nose pad lifted back to skin, nostrils stay black
    skin = np.array([0.36, 0.11, 0.07]) * (0.8 + 1.2 * det.mean(1, keepdims=True))
    col = col * (1 - 0.85 * nl_[:, None]) + skin * 0.85 * nl_[:, None]
    dk = lerp(DARK[:, None])[:, 0]
    col = col * (1 - dk[:, None])
    # teeth: dirty ivory, never as grey as the skin
    th = lerp(TOOTH[:, None])[:, 0]
    isT = th > 0.05
    tip = np.clip((th - 0.3) / 0.7, 0, 1)[:, None]
    lumt = col @ np.array([0.299, 0.587, 0.114])
    ivory = np.clip(0.42 + 0.9 * (lumt - lumt.mean()), 0.3, 0.85)[:, None] * np.array([1.0, 0.93, 0.78]) * (0.85 + 1.5 * det.mean(1, keepdims=True))
    rot_t = np.array([0.3, 0.2, 0.12]) * (0.8 + 2.0 * det.mean(1, keepdims=True))
    col = np.where(isT[:, None], rot_t * (1 - tip) + ivory * tip, col)
    # nails: cracked yellow-grey plates; the beds behind them gone black
    nl = lerp(NAIL[:, None])[:, 0]; bd = lerp(BED[:, None])[:, 0]
    nail = np.array([0.72, 0.67, 0.52]) * (0.75 + 2.5 * det.mean(1, keepdims=True)) * (0.55 + 0.45 * np.clip(np.abs(np.sin(p[:, 1] * 2200 + 3 * np.sin(p[:, 0] * 1500))) * 3, 0, 1))[:, None]
    col = col * (1 - 0.65 * bd[:, None])
    col = col * (1 - nl[:, None]) + nail * nl[:, None]

    # pale bands painted across the limbs read as bandages on a cylinder: tint them into the skin
    lb = lerp(LIMB[:, None])[:, 0]
    lum2 = col @ np.array([0.299, 0.587, 0.114])
    red2 = col[:, 0] - 0.5 * (col[:, 1] + col[:, 2])
    ratio = col[:, 1] / (col[:, 0] + 1e-3)
    tan = np.clip((ratio - 0.36) / 0.14, 0, 1) * lb
    redder = np.stack([col[:, 0] * 0.95, col[:, 0] * 0.3, col[:, 0] * 0.2], 1) * 0.9
    col = col * (1 - tan[:, None]) + redder * tan[:, None]
    # claws: black keratin
    cw = lerp(CLAW[:, None])[:, 0]
    col = col * (1 - 0.8 * cw[:, None]) + np.array([0.05, 0.04, 0.035]) * 0.8 * cw[:, None]
    # keratin: tan bony root, near-black shaft, worn tan tip; sharp growth rings, pale ridge
    # crests, splits along the grain (the derived normal map picks the rings up)
    hf = lerp(HORNF[:, None])[:, 0]; spk = lerp(SPIKE[:, None])[:, 0]
    kk = np.clip(hf + spk, 0, 1)
    t0 = (862 - s[:, 0]) / 170
    th_ = np.clip(np.where(spk > 0.5, (t0 - 0.3) / 0.7, t0), 0, 1)
    ss = lambda e0, e1, x: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))
    lumh = col @ np.array([0.299, 0.587, 0.114])
    dl = np.clip(lumh / (lumh[kk > 0.5].mean() + 1e-4 if (kk > 0.5).any() else 0.1), 0.65, 1.45)
    root, shaft, tipc, bonec = np.array([0.42, 0.33, 0.22]), np.array([0.07, 0.062, 0.056]), np.array([0.5, 0.41, 0.29]), np.array([0.5, 0.43, 0.33])
    a_ = ss(0.03, 0.3, th_)[:, None]; b_ = ss(0.62, 0.96, th_)[:, None]
    kc = (root * (1 - a_) + shaft * a_) * (1 - b_) + tipc * b_
    fr = np.where(spk > 0.5, th_ * 6, 17 * (th_ + 0.025 * np.sin(th_ * 13 + 1) + 0.018 * np.sin(th_ * 29 + 2) * (1 - th_))) % 1.0
    ra = (1 - ss(0.8, 0.95, th_))[:, None]
    groove = np.exp(-(fr / 0.1) ** 2)[:, None]                  # soft dark line where each ring steps down
    chip = (np.sin(s[:, 1] * 0.31 + th_ * 40) * np.sin(th_ * 57 + s[:, 1] * 0.11) > 0.55)[:, None]
    crest = ss(0.72, 0.98, fr)[:, None] * (1 - 0.8 * chip)      # the raised lip, worn pale, chipped here and there
    kc = kc * (1 - 0.32 * ra * groove) * (0.95 + 0.08 * fr[:, None])
    kc = kc + (bonec - kc) * (0.3 * ra * crest)
    crk = np.clip((np.sin(s[:, 1] * 0.55 + 3 * np.sin(th_ * 9)) - 0.975) * 40, 0, 1) * (1 - b_[:, 0])
    kc = kc * (1 - 0.7 * crk)[:, None]
    col = col * (1 - kk[:, None]) + kc * dl[:, None] * kk[:, None]
    hf = kk
    spc = np.clip(1 - np.abs(p[:, 0]) / 0.035, 0, 1) * (p[:, 1] > 0.08) * (p[:, 2] > 0.98) * (p[:, 2] < 1.6) * (1 - kk)
    col = low + (col - low) * (1 + 1.0 * spc)[:, None]          # the painted vertebrae, punched up
    ew = lerp(EYEW[:, None])[:, 0]
    # eyes: a white-hot slit pupil, orange round it, a dark rim
    ex = np.abs(np.abs(p[:, 0]) - EYE[0])
    slit = np.exp(-(ex / 0.0026) ** 2) * np.exp(-((p[:, 2] - EYE[2]) / 0.009) ** 2) * (ew > 0.05)
    ew = ew * (0.2 + 0.8 * np.exp(-((ex / 0.012) ** 2 + ((p[:, 2] - EYE[2]) / 0.0075) ** 2)))
    col = col * (1 - 0.5 * ew[:, None] * (1 - slit[:, None]))
    col = col * (1 - ew[:, None]) + np.clip(col * 1.45 + 0.04, 0, 1) * ew[:, None]
    # menace: the hide a shade darker and harder, and a dull ember in its deepest cracks
    lumc = col @ np.array([0.299, 0.587, 0.114]); luml = low @ np.array([0.299, 0.587, 0.114])
    body = ((p[:, 2] > 0.12) & (p[:, 2] < 1.6)).astype(np.float32) * (1 - kk) * (1 - cw) * (1 - np.clip(ew * 4, 0, 1))
    vein = np.clip((luml * 0.62 - lumc) / 0.05, 0, 1) * body
    col = col * 0.86
    col = col + (col - (col @ np.array([0.299, 0.587, 0.114]))[:, None]) * 0.25
    img = np.zeros((size, size, 3), np.float32)
    img[mask] = np.clip(col, 0, 1)
    veinimg = np.zeros((size, size), np.float32)
    veinimg[mask] = vein
    eyes = np.zeros((size, size), np.float32)
    eyes[mask] = ew
    slitimg = np.zeros((size, size), np.float32)
    slitimg[mask] = slit
    hornimg = np.zeros((size, size), np.float32)
    hornimg[mask] = hf
    img = bleed(img, mask)
    os.makedirs(out, exist_ok=True)
    Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, "zombie_atlas_basecolor.png"))

    n = normals_from(img, mask, 6.0)
    Image.fromarray(((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, "zombie_atlas_normal.png"))

    lum = img @ np.array([0.299, 0.587, 0.114], np.float32)
    red = np.clip((img[..., 0] - (img[..., 1] + img[..., 2]) * 0.5) * 4.0, 0, 1)
    rough = ndimage.gaussian_filter(np.clip(0.74 + 0.1 * (lum - lum[mask].mean()), 0.6, 0.85), 1.0)   # dry hide
    rough = rough * (1 - eyes) + 0.2 * eyes            # wet eyes catch the torchlight
    rough = rough * (1 - hornimg) + 0.94 * hornimg      # dull keratin
    em = np.zeros((size, size, 3), np.float32)        # amber eyes that read in the dark
    glow = np.clip((eyes - 0.15) * 3, 0, 1) ** 1.5
    hot = np.clip(slitimg * 1.4, 0, 1) * (eyes > 0.1)
    em[..., 0] = np.clip(glow * 0.85 + hot, 0, 1)
    em[..., 1] = np.clip(glow * 0.28 + hot * 0.85, 0, 1)
    em[..., 2] = np.clip(glow * 0.02 + hot * 0.45, 0, 1)
    vg = ndimage.gaussian_filter(veinimg, 0.7)
    em[..., 0] = np.clip(em[..., 0] + vg * 0.2, 0, 1)
    em[..., 1] = np.clip(em[..., 1] + vg * 0.045, 0, 1)
    Image.fromarray((em * 255).clip(0, 255).astype(np.uint8)).save(os.path.join(out, "zombie_atlas_emissive.png"))
    orm = np.dstack([np.ones_like(rough), rough, np.zeros_like(rough)])
    Image.fromarray((orm * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, "zombie_atlas_orm.png"))
    print("[bake] atlas coverage %.0f%%, patched px %.1f%%" % (100 * mask.mean(), 100 * (w > 0.5).mean()))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 2048)
