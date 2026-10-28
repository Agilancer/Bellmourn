"""Put a ChatGPT-painted texture sheet onto a Bellmourn model.

    python apply_texture.py <painted sheet.png> <model folder>

The model folder holds `info.json`, `<id>_mask.png` and the model's .glb file(s). This script:
  1. crops the painted UV square (left 1024 x 1024 of the 1536 x 1024 sheet),
  2. shrinks it to the model's texture size, averaging ONLY painted island pixels (so the
     magenta background never bleeds into edge texels),
  3. bleeds the colours a few texels outward past every island edge (no seams when the
     texture is filtered or mip-mapped),
  4. snaps every texel to the locked Bellmourn palette (never to the magenta key),
  5. writes `<id>_texture.png` and embeds it into every .glb listed in info.json.

Needs only Python 3 with Pillow and numpy. Self-contained so it can ship inside the packs.
"""
import json
import os
import struct
import sys

import numpy as np
from PIL import Image

SHEET_W, SHEET_H, UV_PX = 1536, 1024, 1024
HERE = os.path.dirname(os.path.abspath(__file__))


def load_palette(path=None):
    """The 255 usable palette colours (index 255 is the magenta key, never used)."""
    for p in (path, os.path.join(HERE, "bellmourn_palette.json"),
              os.path.join(HERE, "..", "..", "templates", "style", "bellmourn_palette.json")):
        if p and os.path.exists(p):
            with open(p) as f:
                data = json.load(f)
            cols = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in data["colors"]]
            return np.array([c for i, c in enumerate(cols) if i != data.get("key_index", 255)],
                            float)
    raise FileNotFoundError("bellmourn_palette.json not found")


def painted_mask(rgb):
    """Pixels that are not the magenta background."""
    d = np.abs(rgb - np.array([255.0, 0.0, 255.0])).sum(axis=-1)
    return d > 150  # (the faint pink grid lines count as background)


def register(sheet, mask, report=None):
    """ChatGPT often hands the image back slightly shifted or scaled. Find the scale and offset
    that best line the painted shapes up with the model's real outlines (`mask`), and return
    the UV square resampled into place, plus how well the shapes agree (1.0 = perfectly).

    The fit is two-sided: the model's pieces must land on paint, and the paint must land on
    the pieces, so thin shapes can't slide around inside a blurred stroke."""
    paint = painted_mask(np.asarray(sheet, float))  # full resolution
    paint[:, UV_PX + 8:] = False  # ignore the preview panel on the right
    want = np.asarray(mask.convert("L").resize((UV_PX, UV_PX), Image.NEAREST), float) > 127
    ys, xs = np.nonzero(want)
    pys, pxs = np.nonzero(paint)
    rng = np.random.default_rng(0)

    def scorer(n):
        pick = rng.choice(len(xs), min(n, len(xs)), replace=False)
        px0, py0 = xs[pick].astype(float), ys[pick].astype(float)
        pick = rng.choice(len(pxs), min(n, len(pxs)), replace=False) if len(pxs) else []
        qx0, qy0 = pxs[pick].astype(float), pys[pick].astype(float)

        def score(s, dx, dy):
            px = np.round(px0 * s + dx).astype(int)
            py = np.round(py0 * s + dy).astype(int)
            ok = (px >= 0) & (py >= 0) & (px < paint.shape[1]) & (py < paint.shape[0])
            cover = paint[py[ok], px[ok]].sum() / len(px0)
            qx = np.round((qx0 - dx) / s).astype(int)  # painted pixels back into UV space
            qy = np.round((qy0 - dy) / s).astype(int)
            ok = (qx >= 0) & (qy >= 0) & (qx < UV_PX) & (qy < UV_PX)
            inside = want[qy[ok], qx[ok]].sum() / max(len(qx0), 1)
            return cover + inside
        return score

    def search(score, scales, offsets, best):
        for s in scales:
            for dy in offsets(best[3]):
                for dx in offsets(best[2]):
                    sc = score(s, dx, dy)
                    if sc > best[0] + 1e-9:
                        best = (sc, s, dx, dy)
        return best

    pimg = Image.fromarray(paint.astype(np.uint8) * 255)

    def iou(res):
        """Exact overlap of the warped paint and the outlines, at `res` x `res`."""
        k = UV_PX / res
        w_small = np.asarray(mask.convert("L").resize((res, res), Image.BOX)) > 127
        p_small = pimg.resize((round(SHEET_W / k), round(SHEET_H / k)), Image.BOX)

        def score(s, dx, dy):
            w = np.asarray(p_small.transform((res, res), Image.AFFINE,
                                             (s, 0, dx / k, 0, s, dy / k),
                                             resample=Image.NEAREST)) > 127
            return (w & w_small).sum() / max((w | w_small).sum(), 1)
        return score

    # coarse to fine: +/-8% scale and +/-96 px on sampled points, then exact overlap at half
    # and at full resolution
    score = scorer(4000)
    best = search(score, np.arange(0.92, 1.0801, 0.01), lambda c: range(-96, 97, 8),
                  (score(1.0, 0, 0), 1.0, 0, 0))
    score = iou(512)
    best = (score(*best[1:]),) + best[1:]
    best = search(score, best[1] + np.arange(-0.012, 0.0121, 0.002),
                  lambda c: range(c - 10, c + 11, 2), best)
    score = iou(UV_PX)
    best = (score(*best[1:]),) + best[1:]
    best = search(score, best[1] + np.arange(-0.002, 0.00201, 0.0005),
                  lambda c: range(c - 2, c + 3), best)
    _, s, dx, dy = best
    sq = sheet.transform((UV_PX, UV_PX), Image.AFFINE, (s, 0, dx, 0, s, dy),
                         resample=Image.BICUBIC, fillcolor=(255, 0, 255))
    # how much painted area falls outside the outlines (shapes redrawn bigger or elsewhere)
    got = painted_mask(np.asarray(sq, float))
    cover = (got & want).sum() / max(want.sum(), 1)
    spill = got & ~want
    if report is not None:
        report.update(scale=round(float(s), 4), offset_px=(int(dx), int(dy)),
                      coverage=round(float(cover), 3),
                      spill=round(float(spill.sum() / max(len(xs), 1)), 3))
    return sq


def texture_from_sheet(sheet, mask_img, tex=128, palette=None, bleed=4, report=None):
    sheet = sheet.convert("RGB")
    if abs(sheet.size[0] / sheet.size[1] - SHEET_W / SHEET_H) > 0.02:
        print(f"warning: the sheet is {sheet.size[0]}x{sheet.size[1]}, not 3:2; it was "
              "probably cropped. Stretching it back, but check the result.")
    if sheet.size != (SHEET_W, SHEET_H):
        sheet = sheet.resize((SHEET_W, SHEET_H), Image.LANCZOS)
    rep = {} if report is None else report
    rgb = np.asarray(register(sheet, mask_img, rep), float)
    m = np.asarray(mask_img.convert("L").resize((UV_PX, UV_PX), Image.NEAREST), float) / 255
    k = UV_PX // tex
    # mask-weighted box filter: each texel averages only the painted pixels inside it
    wsum = m.reshape(tex, k, tex, k).sum(axis=(1, 3))
    csum = (rgb * m[..., None]).reshape(tex, k, tex, k, 3).sum(axis=(1, 3))
    out = np.zeros((tex, tex, 3))
    have = wsum > 0
    out[have] = csum[have] / wsum[have][:, None]
    # bleed outward: empty texels take the average of their painted neighbours, a ring at a time
    for _ in range(bleed):
        grow = np.zeros_like(out)
        cnt = np.zeros((tex, tex))
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx or dy:
                    sh = np.roll(np.roll(out * have[..., None], dy, 0), dx, 1)
                    sm = np.roll(np.roll(have, dy, 0), dx, 1)
                    grow += sh
                    cnt += sm
        new = (~have) & (cnt > 0)
        out[new] = grow[new] / cnt[new][:, None]
        have = have | new
    pal = load_palette() if palette is None else palette
    flat = out.reshape(-1, 3)
    idx = ((flat[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2).argmin(axis=1)
    return Image.fromarray(pal[idx].reshape(tex, tex, 3).astype(np.uint8))


def embed_png(glb_path, png_bytes):
    """Point the .glb's image at new PNG bytes (appended to its binary chunk)."""
    with open(glb_path, "rb") as f:
        data = f.read()
    jlen = struct.unpack_from("<I", data, 12)[0]
    js = json.loads(data[20:20 + jlen])
    blen = struct.unpack_from("<I", data, 20 + jlen)[0]
    binary = bytearray(data[28 + jlen:28 + jlen + blen])
    while len(binary) % 4:
        binary.append(0)
    off = len(binary)
    binary += png_bytes
    while len(binary) % 4:
        binary.append(0)
    js["bufferViews"].append(dict(buffer=0, byteOffset=off, byteLength=len(png_bytes)))
    js["images"][0] = dict(bufferView=len(js["bufferViews"]) - 1, mimeType="image/png")
    js["buffers"][0]["byteLength"] = len(binary)
    jb = json.dumps(js, separators=(",", ":")).encode()
    jb += b" " * ((4 - len(jb) % 4) % 4)
    with open(glb_path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(binary)))
        f.write(struct.pack("<II", len(jb), 0x4E4F534A) + jb)
        f.write(struct.pack("<II", len(binary), 0x004E4942) + bytes(binary))


def apply(sheet_path, folder):
    import io
    with open(os.path.join(folder, "info.json")) as f:
        info = json.load(f)
    mid = info["id"]
    rep = {}
    tex = texture_from_sheet(Image.open(sheet_path), Image.open(os.path.join(
        folder, f"{mid}_mask.png")), info.get("texture_size", 128), report=rep)
    moved = abs(rep["scale"] - 1.0) > 0.001 or rep["offset_px"] != (0, 0)
    print(f"lined up: scale {rep['scale']}, offset {rep['offset_px']} px"
          f"{' (ChatGPT moved the image; corrected)' if moved else ''}; "
          f"{rep['coverage'] * 100:.0f}% of the model's pieces painted")
    if rep["coverage"] < 0.9 or rep["spill"] > 0.15:
        print("warning: the painted shapes don't match the model's outlines well (pieces "
              "unpainted, moved or redrawn). The texture may look wrong in places: ask ChatGPT "
              "to repaint keeping every outline exactly where it is.")
    out = os.path.join(folder, f"{mid}_texture.png")
    tex.save(out)
    buf = io.BytesIO()
    tex.save(buf, "PNG")
    for glb in info["files"]:
        embed_png(os.path.join(folder, glb), buf.getvalue())
    return out, info["files"]


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    path, glbs = apply(sys.argv[1], sys.argv[2])
    print(f"wrote {path} and updated {', '.join(glbs)}")
