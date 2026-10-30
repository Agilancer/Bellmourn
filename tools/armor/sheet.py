"""A review sheet of a built set's preview frames (system Python, PIL).

    python tools/armor/sheet.py <out_dir> <set> <sheet.jpg>
Rows: the men's frames, the women's, then each lineup.
"""
import os
import sys

from PIL import Image, ImageDraw

FRAMES = ("front", "back", "walk", "face", "nohelm", "hand")


def main():
    out, sid, dst = sys.argv[1:4]
    th = 420
    rows = []
    for tag, label in (("m", "men (reference m10)"), ("f", "women (reference f06)")):
        ims = [Image.open(os.path.join(out, f"{sid}_{tag}_{n}.png")).convert("RGB") for n in FRAMES
               if os.path.exists(os.path.join(out, f"{sid}_{tag}_{n}.png"))]
        ims = [im.resize((int(im.width * th / im.height), th), Image.LANCZOS) for im in ims]
        row = Image.new("RGB", (sum(i.width for i in ims), th))
        x = 0
        for im in ims:
            row.paste(im, (x, 0))
            x += im.width
        rows.append((label + ": front, back, walk, face, helm off, gauntlet", row))
    for tag, label in (("m", "the exported set bound to m01, m04, m07, m08, m11"),
                       ("f", "the exported set bound to f01, f03, f05, f07, f08")):
        p = os.path.join(out, f"lineup_{sid}_{tag}.png")
        if not os.path.exists(p):
            p = os.path.join(out, f"lineup_{tag}.png")
        if os.path.exists(p):
            im = Image.open(p).convert("RGB")
            rows.append((label, im.resize((rows[0][1].width, int(im.height * rows[0][1].width / im.width)), Image.LANCZOS)))
    W = max(r.width for _, r in rows)
    H = sum(r.height + 30 for _, r in rows)
    sheet = Image.new("RGB", (W, H), (24, 22, 26))
    d = ImageDraw.Draw(sheet)
    y = 0
    for label, r in rows:
        d.text((10, y + 8), label, fill=(226, 206, 160))
        sheet.paste(r, (0, y + 30))
        y += r.height + 30
    sheet.save(dst, quality=86)
    print("wrote", dst)


if __name__ == "__main__":
    main()
