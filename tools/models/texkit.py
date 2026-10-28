"""Texture sheets for ChatGPT, placeholder textures, and importing painted textures back.

Sheet layout (1536 x 1024, the size ChatGPT returns): the left 1024 x 1024 square is the
model's texture at 8x (a 128 x 128 texture), every UV island outlined and numbered; the right
column shows the model from several sides with each part in its own colour and a numbered key.
ChatGPT paints the left square; `import_texture` crops it back to 128 x 128 on the locked
palette.
"""
import io
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "templates"))

import raster  # noqa: E402
from geom import norm  # noqa: E402

SHEET_W, SHEET_H, UV_PX = 1536, 1024, 1024
KEY = (255, 0, 255)


def font(size, bold=False):
    for name in (("consolab.ttf", "arialbd.ttf") if bold else ("consola.ttf", "arial.ttf")):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def _boundary(isl):
    count = {}
    for t in isl.t:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            e = (min(a, b), max(a, b))
            count[e] = count.get(e, 0) + 1
    return [e for e, c in count.items() if c == 1]


def lighten(c, k=0.55):
    return tuple(int(v + (255 - v) * k) for v in c[:3])


def placeholder_texture(model):
    """A flat-coloured texture (each part its own colour, island edges darker) so an untextured
    model still reads in the viewer."""
    n = model.tex
    img = Image.new("RGB", (n, n), (40, 36, 44))
    d = ImageDraw.Draw(img)
    for part, isl in model.islands():
        for t in isl.t:
            d.polygon([tuple(isl.px[i]) for i in t], fill=tuple(part.color[:3]))
        dark = tuple(int(v * 0.6) for v in part.color[:3])
        for a, b in _boundary(isl):
            d.line([tuple(isl.px[a]), tuple(isl.px[b])], fill=dark)
    return img


def png_bytes(img):
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _views(model, size, angles):
    """Orthographic part-coloured renders of a model from several yaw/pitch angles. A view's
    optional 4th item is a bone name to frame (e.g. "hand" for a close-up)."""
    tris, cols = [], []
    for part, isl in model.islands():
        for t in isl.t:
            tris.append(isl.v[t])
            cols.append(part.color)
    out = []
    for view in angles:
        yaw, pitch, title = view[:3]
        focus = view[3] if len(view) > 3 else None
        pts = np.concatenate([isl.v for p, isl in model.islands()
                              if focus is None or p.bone == focus or p.bone[:-1] in
                              ("index", "middle", "ring", "pinky", "thumb")])
        centre = (pts.max(0) + pts.min(0)) / 2
        radius = np.linalg.norm(pts - centre, axis=1).max()
        cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
        cp, sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
        ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
        rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
        rot = rx @ ry
        scale = size * 0.45 / radius

        def project(p, rot=rot, scale=scale):
            return (size / 2 + p[0] * scale, size / 2 - p[1] * scale)
        cam = [(t - centre) @ rot.T + np.array([0, 0, 10 * radius]) for t in tris]
        img = raster.zbuffer(cam, cols, project, size, near=0.0,
                             light=norm([-0.4, 0.7, -0.6]), cull=False)
        ImageDraw.Draw(img).text((6, 4), title, fill=(220, 220, 220), font=font(13, True))
        out.append(img)
    return out


def sheet(model, title, notes, angles=((30, 20, "3/4 FRONT"), (210, 20, "3/4 BACK"),
                                       (90, 0, "SIDE"), (0, 90, "TOP"))):
    """The labelled texture sheet ChatGPT paints on."""
    img = Image.new("RGB", (SHEET_W, SHEET_H), (24, 22, 26))
    d = ImageDraw.Draw(img)
    k = UV_PX / model.tex
    d.rectangle([0, 0, UV_PX - 1, UV_PX - 1], fill=KEY)
    # faint texel grid every 8 texels
    for g in range(0, model.tex + 1, 8):
        d.line([(g * k, 0), (g * k, UV_PX)], fill=(255, 120, 255))
        d.line([(0, g * k), (UV_PX, g * k)], fill=(255, 120, 255))
    numbers = {}
    for part, isl in model.islands():
        numbers.setdefault(part.name, len(numbers) + 1)
        fill = lighten(part.color, 0.35)
        for t in isl.t:
            d.polygon([tuple(isl.px[i] * k) for i in t], fill=fill)
        for t in isl.t:
            d.polygon([tuple(isl.px[i] * k) for i in t], outline=lighten(part.color, 0.6))
        for a, b in _boundary(isl):
            d.line([tuple(isl.px[a] * k), tuple(isl.px[b] * k)], fill=(0, 0, 0), width=3)
        c = isl.px.mean(axis=0) * k
        span = (isl.px.max(axis=0) - isl.px.min(axis=0)) * k  # on-sheet size of the piece
        if min(span) < 16:
            continue  # too small to label without covering its neighbours (see the key)
        label = str(numbers[part.name])
        side = isl.name.split()[-1] if isl.name.split()[-1] in ("front", "back", "rim", "start",
                                                               "end") else ""
        if side:
            label += side[0].upper()
        f = font(15 if min(isl.size) * model.density * k > 40 else 11, True)
        w = d.textlength(label, font=f)
        hint = getattr(isl, "v_label", None) or part.v_label
        if hint and min(span) > 70:
            _arrow(d, c, getattr(isl, "rot", False), hint, isl, k)
        d.rectangle([c[0] - w / 2 - 3, c[1] - 9, c[0] + w / 2 + 3, c[1] + 9], fill=(0, 0, 0))
        d.text((c[0] - w / 2, c[1] - 8), label, fill=(255, 255, 255), font=f)
    # right column: views + key
    x0 = UV_PX + 16
    d.text((x0, 10), title, fill=(240, 220, 170), font=font(20, True))
    views = _views(model, 236, angles)
    for i, v in enumerate(views):
        img.paste(v, (x0 + (i % 2) * 248, 40 + (i // 2) * 248))
    y0 = 40 + 2 * 248 + 6
    rows = max(1, (SHEET_H - 100 - y0) // 16)
    f = font(12)
    for idx, (name, n) in enumerate(numbers.items()):
        part = next(p for p in model.parts if p.name == name)
        x, y = x0 + (idx // rows) * 248, y0 + (idx % rows) * 16
        d.rectangle([x, y + 2, x + 11, y + 13], fill=part.color[:3])
        d.text((x + 16, y), f"{n:>2} {part.label}"[:30], fill=(215, 215, 215), font=f)
    y = SHEET_H - 96
    for line in notes:
        d.text((x0, y), line, fill=(190, 190, 190), font=font(12))
        y += 15
    return img


def _arrow(d, c, rot, label, isl, k):
    """A small arrow from the island's number toward its +v direction (the way the piece runs:
    toward the tip, toward the fingers, up in the game...), labelled with what that means."""
    vec = np.array([1.0, 0.0]) if rot else np.array([0.0, 1.0])
    a = np.asarray(c, float) + vec * 13
    b = a + vec * 30
    d.line([tuple(a), tuple(b)], fill=(255, 255, 255), width=3)
    side = np.array([-vec[1], vec[0]])
    d.polygon([tuple(b + vec * 8), tuple(b + side * 6), tuple(b - side * 6)], fill=(255, 255, 255))
    f = font(11, True)
    w = d.textlength(label, font=f)
    t = (b + np.array([12, -6])) if rot else (b + np.array([-w / 2, 10]))
    d.rectangle([t[0] - 2, t[1] - 1, t[0] + w + 2, t[1] + 13], fill=(30, 30, 30))
    d.text(tuple(t), label, fill=(255, 235, 140), font=f)


def mask(model, scale=UV_PX // 128):
    """The UV islands as a white-on-black mask at sheet resolution (UV_PX square): which pixels
    of a painted sheet are real texture."""
    k = UV_PX / model.tex
    img = Image.new("L", (UV_PX, UV_PX), 0)
    d = ImageDraw.Draw(img)
    for _, isl in model.islands():
        for t in isl.t:
            d.polygon([tuple(isl.px[i] * k) for i in t], fill=255)
    return img


def import_texture(sheet_path, mask_img, model_tex=128):
    """ChatGPT's painted sheet -> the model's texture (see apply_texture.py)."""
    import apply_texture
    return apply_texture.texture_from_sheet(Image.open(sheet_path), mask_img, model_tex)
