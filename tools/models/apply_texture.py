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


def texture_from_sheet(sheet, mask_img, tex=128, palette=None, bleed=4):
    sheet = sheet.convert("RGB")
    if sheet.size != (SHEET_W, SHEET_H):
        sheet = sheet.resize((SHEET_W, SHEET_H), Image.LANCZOS)
    rgb = np.asarray(sheet.crop((0, 0, UV_PX, UV_PX)), float)
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
    tex = texture_from_sheet(Image.open(sheet_path), Image.open(os.path.join(
        folder, f"{mid}_mask.png")), info.get("texture_size", 128))
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
