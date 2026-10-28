"""Creature sprite templates: blank, labelled magenta grids for ChatGPT to paint any creature on.

No rig, no mannequin, no creature design: each cell holds only a label strip, a cyan ground
line, a centre tick and a metre scale. Style comes from STYLE_GUIDE.md + CREATURE_GUIDE.md;
the look of each creature is locked by its own model sheet, painted first.

One template set per size class (S M L H E) and direction set (5 = symmetric, the game mirrors
D6-D8; 8 = every direction):

    python tools/templates/creature_sheets.py            # all ten sets

Writes templates/creatures/<set>/ (e.g. M8/):
  <set>_model_p1.png ...     model sheet: standing at rest, one cell per direction
  <set>_<kind>_p1.png ...    one template per animation kind (4 frames across, a row per
                             direction; big sizes span several pages)
  <set>_corpse_p1.png ...    the corpse, one cell per direction
  <set>_layout.json          every cell of every sheet: direction, frame, art box, anchor
and templates/creatures/TEMPLATES.md.
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import creature_spec as C  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "templates", "creatures")

SHEET_W, SHEET_H = 1536, 1024
HEADER = 56
KEY = (255, 0, 255)
GUIDE = (0, 255, 255)  # cyan guides; the importer strips anything this colour
LABEL_H = 12
BORDER = 2
FOOT = 5  # ground line sits this far above the bottom of the art box

TAG_COL = {"hit": (200, 20, 20), "fire": (200, 90, 0), "smear": (90, 40, 150),
           "summon": (40, 120, 60), "teleport": (40, 90, 160), "roar": (150, 110, 0)}


def _font(size, bold=False):
    for name in (("consolab.ttf", "arialbd.ttf") if bold else ("consola.ttf", "arial.ttf")):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


F_TITLE, F_SUB, F_LABEL, F_UNUSED = _font(20, True), _font(13), _font(9, True), _font(14, True)


def art_box(cell):
    x, y, w, h = cell
    return [x + BORDER, y + BORDER + LABEL_H, w - 2 * BORDER, h - 2 * BORDER - LABEL_H]


def anchor(cell):
    """Bottom centre of the creature: where its feet meet the ground, in sheet pixels."""
    ax, ay, aw, ah = art_box(cell)
    return [ax + aw // 2, ay + ah - FOOT]


def cell_rect(size, col, row):
    cw, ch = size["cell"]
    return [col * cw, HEADER + row * ch, cw, ch]


# ----------------------------------------------------------------- layout


def anim_pages(size, dirs):
    """Split an animation over sheets: each direction takes ceil(FRAMES / cols) grid rows."""
    per_dir = math.ceil(C.FRAMES / size["cols"])
    dirs_per_page = size["rows"] // per_dir
    pages = []
    for p in range(0, len(dirs), dirs_per_page):
        cells = []
        for r, d in enumerate(dirs[p:p + dirs_per_page]):
            for f in range(C.FRAMES):
                cells.append((d, f, (f % size["cols"], r * per_dir + f // size["cols"])))
        pages.append(cells)
    return pages


def flow_pages(size, dirs):
    """One cell per direction, left to right (model and corpse sheets)."""
    n = size["cols"] * size["rows"]
    return [[(d, None, (i % size["cols"], i // size["cols"])) for i, d in enumerate(dirs[p:p + n])]
            for p in range(0, len(dirs), n)]


# ----------------------------------------------------------------- drawing


def draw_cell(d, cell, size, label, tags):
    x, y, w, h = cell
    d.rectangle([x + BORDER, y + BORDER, x + w - BORDER - 1, y + BORDER + LABEL_H - 1],
                fill=(16, 16, 20))
    ax, ay, aw, ah = art_box(cell)
    d.rectangle([ax, ay, ax + aw - 1, ay + ah - 1], fill=KEY)
    d.text((x + BORDER + 3, y + BORDER), label, fill=(235, 235, 235), font=F_LABEL)
    tx = x + w - BORDER - 2
    for tag, col in reversed(tags):
        tw = d.textlength(tag, font=F_LABEL) + 6
        tx -= tw
        d.rectangle([tx, y + BORDER + 1, tx + tw - 2, y + BORDER + LABEL_H - 2], fill=col)
        d.text((tx + 3, y + BORDER), tag, fill=(255, 255, 255), font=F_LABEL)
        tx -= 2
    # scale guides: ground line, centre tick, a tick every metre up the left edge (long every 5)
    fx, fy = anchor(cell)
    d.line([(ax, fy), (ax + aw - 1, fy)], fill=GUIDE)
    d.line([(fx, fy + 1), (fx, fy + FOOT - 1)], fill=GUIDE)
    m = 1
    while fy - m * size["px_per_m"] > ay:
        ty = fy - m * size["px_per_m"]
        d.line([(ax, ty), (ax + (6 if m % 5 == 0 else 2), ty)], fill=GUIDE)
        m += 1


def new_sheet(size, title, sub, note):
    sheet = Image.new("RGB", (SHEET_W, SHEET_H), (24, 22, 26))
    d = ImageDraw.Draw(sheet)
    d.rectangle([0, HEADER, SHEET_W - 1, HEADER + size["rows"] * size["cell"][1] - 1],
                fill=(0, 0, 0))  # cell borders
    d.text((14, 4), f"BELLMOURN  ·  CREATURE TEMPLATE  ·  {title}", fill=(240, 220, 170),
           font=F_TITLE)
    d.text((14, 26), sub, fill=(200, 200, 200), font=F_SUB)
    while d.textlength(note, font=F_SUB) > SHEET_W - 28:  # the full note is in TEMPLATES.md
        note = note[:note.rstrip(" .…").rfind(" ")] + " …"
    d.text((14, 40), note, fill=(170, 200, 170), font=F_SUB)
    return sheet, d


def grey_unused(d, size, used):
    cw, ch = size["cell"]
    for r in range(size["rows"]):
        for col in range(size["cols"]):
            if (col, r) in used:
                continue
            x, y = col * cw, HEADER + r * ch
            d.rectangle([x + BORDER, y + BORDER, x + cw - BORDER - 1, y + ch - BORDER - 1],
                        fill=(40, 38, 44))
            d.text((x + cw // 2 - 24, y + ch // 2 - 8), "UNUSED", fill=(90, 90, 96),
                   font=F_UNUSED)


def build(sk, ndirs):
    size = C.SIZES[sk]
    dirs = C.DIRSETS[ndirs]
    sid = f"{sk}{ndirs}"
    folder = os.path.join(OUT, sid)
    os.makedirs(folder, exist_ok=True)
    for f in os.listdir(folder):  # stale sheets
        if f.endswith(".png"):
            os.remove(os.path.join(folder, f))
    _, _, aw, ah = art_box(cell_rect(size, 0, 0))
    mirror = "D1-D5 painted, game mirrors D6-D8" if ndirs == 5 else "all 8 directions painted"
    sheets = []

    def sub(what):
        return (f"{what}  ·  {mirror}  ·  art box {aw}×{ah}  ·  1 m = {size['px_per_m']} px "
                f"(cyan ticks, left)  ·  cyan guides → #FF00FF")

    def make(name, kind, title, what, note, layout):
        for p, cells in enumerate(layout, 1):
            sheet, d = new_sheet(size, f"SIZE {sk} ({size['name']})  ·  {ndirs} DIRS  ·  {title}"
                                       f"  [page {p}/{len(layout)}]", sub(what), note)
            meta, used = [], set()
            for dd, f, (col, row) in cells:
                cell = cell_rect(size, col, row)
                if f is None:
                    label, tags = f"D{dd[0]} {dd[1]}  {title}", []
                else:
                    fname, tics, events = C.KINDS[kind]["frames"][f]
                    label = f"D{dd[0]} {dd[1]}  F{f + 1} {fname}"
                    tags = [(e.upper(), TAG_COL[e]) for e in events if e in TAG_COL]
                    tags.append(("HOLD" if tics < 0 else f"{tics}t", (60, 60, 70)))
                draw_cell(d, cell, size, label, tags)
                meta.append(dict(dir=dd[0], frame=f, cell=cell, art=art_box(cell),
                                 anchor=anchor(cell)))
                used.add((col, row))
            grey_unused(d, size, used)
            fname = f"{sid}_{name}_p{p}.png"
            sheet.save(os.path.join(folder, fname))
            sheets.append(dict(file=fname, kind=kind, page=p, pages=len(layout), cells=meta))

    make("model", "model", "MODEL SHEET", f"template {sid}_model",
         "Standing at rest from every direction. Paint this FIRST for each creature and attach "
         "it to every other sheet of that creature.", flow_pages(size, dirs))
    for kind, k in C.KINDS.items():
        make(kind, kind, kind.upper().replace("_", " "),
             f"template {sid}_{kind}  ·  {C.FRAMES} frames →, a row per direction", k["note"],
             anim_pages(size, dirs))
    make("corpse", "corpse", "CORPSE", f"template {sid}_corpse",
         "Dead on the ground, one cell per direction: the same pose as the last frame (F4) of "
         "its death animation.", flow_pages(size, dirs))

    layout = dict(set=sid, size_class=sk, size_name=size["name"], use=size["use"],
                  px_per_m=size["px_per_m"], dirs=[d[0] for d in dirs],
                  mirror={str(k): v for k, v in C.MIRROR.items()} if ndirs == 5 else {},
                  sheet=[SHEET_W, SHEET_H], key="#FF00FF", guide="#00FFFF", tic_rate=35,
                  art_box=[aw, ah],
                  kinds={kind: dict(loop=k["loop"], note=k["note"],
                                    frames=[dict(name=n, tics=t, events=e)
                                            for n, t, e in k["frames"]])
                         for kind, k in C.KINDS.items()},
                  sheets=sheets)
    with open(os.path.join(folder, f"{sid}_layout.json"), "w") as f:
        json.dump(layout, f, indent=1)
    return sid, len(sheets)


def templates_md(counts):
    out = ["# Creature templates", "",
           "Pick the folder for the creature's size class and direction set, then paint its "
           "model sheet, the animation templates it needs, and its corpse. See HOW_TO_USE.md.",
           "", "## Size classes", "",
           "| Class | 1 m = | Art box per frame | For | Folders (sheets) |", "|---|---|---|---|---|"]
    for sk, size in C.SIZES.items():
        _, _, aw, ah = art_box(cell_rect(size, 0, 0))
        out.append(f"| **{sk}** {size['name']} | {size['px_per_m']} px | {aw}×{ah} | "
                   f"{size['use']} | `{sk}5` ({counts[sk + '5']}), `{sk}8` ({counts[sk + '8']}) |")
    out += ["", "- `…5` = symmetric creature: paint D1-D5, the game mirrors D6-D8.",
            "- `…8` = holds something in one hand (weapon, shield, bow, staff): paint all 8.",
            "", f"## Animation templates (every one is {C.FRAMES} frames)", "",
            "| Template | Loops | Frames (tics at 35/s; events) | What |", "|---|---|---|---|"]
    for kind, k in C.KINDS.items():
        frames = ", ".join(f"{n} {'hold' if t < 0 else t}" + (f" **{'/'.join(e)}**" if e else "")
                           for n, t, e in k["frames"])
        out.append(f"| `{kind}` | {'yes' if k['loop'] else 'no'} | {frames} | {k['note']} |")
    out += ["", "Plus `model` (paint first) and `corpse` (one frame per direction) in every "
                "folder.", "",
            "Use a template under any animation name: a creature with two melee attacks paints "
            "`melee` twice and names them, e.g. `slash` and `bash` (see HOW_TO_USE.md).", ""]
    return "\n".join(out)


if __name__ == "__main__":
    counts = {}
    for sk in C.SIZES:
        for n in (5, 8):
            sid, c = build(sk, n)
            counts[sid] = c
            print(f"wrote templates/creatures/{sid} ({c} sheets)")
    with open(os.path.join(OUT, "TEMPLATES.md"), "w", encoding="utf-8") as f:
        f.write(templates_md(counts))
    print("total", sum(counts.values()), "sheets")
