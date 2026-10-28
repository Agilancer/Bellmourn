"""Creature sprite sheets: blank, labelled magenta grids for ChatGPT to paint.

No rig, no mannequin: each cell holds only a label strip, a cyan ground line, a dotted cyan
height line and a centre tick. Style comes from STYLE_GUIDE.md + CREATURE_GUIDE.md; the look
of the creature is locked by its model sheet, painted first and attached to every other sheet.

    python tools/templates/creature_sheets.py                 # every creature
    python tools/templates/creature_sheets.py bell_ogre       # some

Writes templates/creatures/<id>/:
  <id>_model_p1.png ...        model sheet (standing at rest, every drawn direction)
  <id>_<anim>_p1.png ...       one sheet set per animation (6 frames across, a row per direction)
  <id>_corpse_p1.png           the corpse, one cell per direction
  <id>_sheets.json             every cell of every sheet: direction, frame, art box, anchor
  PROMPT.md                    what to paste into ChatGPT for this creature
and templates/creatures/ROSTER.md.
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import creatures as C  # noqa: E402

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


# ----------------------------------------------------------------- layout


def anim_pages(c):
    """Split a 6-frame animation over sheets: each direction takes ceil(6 / cols) grid rows."""
    size = C.SIZES[c["size"]]
    per_dir = math.ceil(6 / size["cols"])
    dirs_per_page = size["rows"] // per_dir
    dirs = C.drawn_dirs(c)
    pages = []
    for p in range(0, len(dirs), dirs_per_page):
        cells = []
        for r, d in enumerate(dirs[p:p + dirs_per_page]):
            for f in range(6):
                row = r * per_dir + f // size["cols"]
                cells.append((d, f, (f % size["cols"], row)))
        pages.append(cells)
    return pages


def flow_pages(c):
    """One cell per direction, left to right (model and corpse sheets)."""
    size = C.SIZES[c["size"]]
    n = size["cols"] * size["rows"]
    dirs = C.drawn_dirs(c)
    return [[(d, None, (i % size["cols"], i // size["cols"])) for i, d in enumerate(dirs[p:p + n])]
            for p in range(0, len(dirs), n)]


# ----------------------------------------------------------------- drawing


def draw_cell(d, cell, c, label, tags, height_line=True):
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
    # scale guides: ground line, centre tick, dotted head-height line
    fx, fy = anchor(cell)
    d.line([(ax, fy), (ax + aw - 1, fy)], fill=GUIDE)
    d.line([(fx, fy + 1), (fx, fy + FOOT - 1)], fill=GUIDE)
    if height_line:
        hy = fy - round(c["height_m"] * C.SIZES[c["size"]]["px_per_m"])
        if hy > ay:
            for gx in range(ax, ax + aw, 6):
                d.line([(gx, hy), (gx + 2, hy)], fill=GUIDE)


def new_sheet(c, title, sub, note):
    sheet = Image.new("RGB", (SHEET_W, SHEET_H), (24, 22, 26))
    d = ImageDraw.Draw(sheet)
    size = C.SIZES[c["size"]]
    d.rectangle([0, HEADER, SHEET_W - 1, HEADER + size["rows"] * size["cell"][1] - 1],
                fill=(0, 0, 0))  # cell borders
    d.text((14, 4), f"BELLMOURN  ·  CREATURE SHEET  ·  {c['name'].upper()}  ·  {title}",
           fill=(240, 220, 170), font=F_TITLE)
    d.text((14, 26), sub, fill=(200, 200, 200), font=F_SUB)
    while d.textlength(note, font=F_SUB) > SHEET_W - 28:  # the full note is in PROMPT.md
        note = note[:note.rstrip(" .…").rfind(" ")] + " …"
    d.text((14, 40), note, fill=(170, 200, 170), font=F_SUB)
    return sheet, d


def finish_sheet(d, c, used):
    """Black grid borders; cells the layout leaves empty are greyed out."""
    size = C.SIZES[c["size"]]
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


def cell_rect(c, col, row):
    cw, ch = C.SIZES[c["size"]]["cell"]
    return [col * cw, HEADER + row * ch, cw, ch]


def sub_line(c, what):
    size = C.SIZES[c["size"]]
    ax, ay, aw, ah = art_box(cell_rect(c, 0, 0))
    mirror = "D1-D5 painted, game mirrors D6-D8" if c["symmetric"] else "all 8 directions painted"
    return (f"{what}  ·  {mirror}  ·  art box {aw}×{ah}  ·  1 m = {size['px_per_m']} px  ·  "
            f"height {c['height_m']:g} m  ·  cyan guides → #FF00FF")



def build(c):
    folder = os.path.join(OUT, c["id"])
    os.makedirs(folder, exist_ok=True)
    for f in os.listdir(folder):  # stale sheets from a renamed or removed animation
        if f.endswith(".png"):
            os.remove(os.path.join(folder, f))
    sheets = []

    def save(sheet, d, name, kind, anim, page, npages, cells, used):
        finish_sheet(d, c, used)
        fname = f"{c['id']}_{name}_p{page}.png"
        sheet.save(os.path.join(folder, fname))
        sheets.append(dict(file=fname, kind=kind, anim=anim, page=page, pages=npages,
                           cells=cells))

    # model sheet
    pages = flow_pages(c)
    for p, cells in enumerate(pages, 1):
        sheet, d = new_sheet(c, f"MODEL SHEET  [page {p}/{len(pages)}]",
                             sub_line(c, f"id {c['id']}_model"),
                             "Standing at rest from every direction. Paint this "
                                          "FIRST; attach it to every other sheet.")
        meta, used = [], set()
        for dd, _, (col, row) in cells:
            cell = cell_rect(c, col, row)
            draw_cell(d, cell, c, f"D{dd[0]} {dd[1]}  MODEL", [])
            meta.append(dict(dir=dd[0], frame=None, cell=cell, art=art_box(cell),
                             anchor=anchor(cell)))
            used.add((col, row))
        save(sheet, d, "model", "model", None, p, len(pages), meta, used)

    # animations
    anim_meta = {}
    for aid, kind, note in c["anims"]:
        k = C.KINDS[kind]
        note = (note + " " if note else "") + k["note"]
        anim_meta[aid] = dict(kind=kind, loop=k["loop"], note=note,
                              frames=[dict(name=n, tics=t, events=e) for n, t, e in k["frames"]])
        pages = anim_pages(c)
        for p, cells in enumerate(pages, 1):
            sheet, d = new_sheet(c, f"{aid.upper().replace('_', ' ')}  ({kind})  "
                                    f"[page {p}/{len(pages)}]",
                                 sub_line(c, f"id {c['id']}_{aid}  ·  6 frames →, a row per direction"),
                                 note)
            meta, used = [], set()
            for dd, f, (col, row) in cells:
                name, tics, events = k["frames"][f]
                tags = [(e.upper(), TAG_COL[e]) for e in events if e in TAG_COL]
                tags.append(("HOLD" if tics < 0 else f"{tics}t", (60, 60, 70)))
                cell = cell_rect(c, col, row)
                draw_cell(d, cell, c, f"D{dd[0]} {dd[1]}  F{f + 1} {name}", tags)
                meta.append(dict(dir=dd[0], frame=f, cell=cell, art=art_box(cell),
                                 anchor=anchor(cell)))
                used.add((col, row))
            save(sheet, d, aid, "anim", aid, p, len(pages), meta, used)

    # corpse
    pages = flow_pages(c)
    for p, cells in enumerate(pages, 1):
        sheet, d = new_sheet(c, f"CORPSE  [page {p}/{len(pages)}]",
                             sub_line(c, f"id {c['id']}_corpse"),
                             "Dead on the ground, one cell per direction: the same "
                                          "pose as the last frame (F6) of its death animation.")
        meta, used = [], set()
        for dd, _, (col, row) in cells:
            cell = cell_rect(c, col, row)
            draw_cell(d, cell, c, f"D{dd[0]} {dd[1]}  CORPSE", [], height_line=False)
            meta.append(dict(dir=dd[0], frame=None, cell=cell, art=art_box(cell),
                             anchor=anchor(cell)))
            used.add((col, row))
        save(sheet, d, "corpse", "corpse", None, p, len(pages), meta, used)

    size = C.SIZES[c["size"]]
    spec = dict(id=c["id"], name=c["name"], tier=c["tier"], size_class=c["size"],
                px_per_m=size["px_per_m"], height_m=c["height_m"], symmetric=c["symmetric"],
                drawn_dirs=[d[0] for d in C.drawn_dirs(c)],
                mirror={str(k): v for k, v in C.MIRROR.items()} if c["symmetric"] else {},
                sheet=[SHEET_W, SHEET_H], key="#FF00FF", guide="#00FFFF", tic_rate=35,
                look=c["look"], ramps=c["ramps"], anims=anim_meta, sheets=sheets)
    with open(os.path.join(folder, f"{c['id']}_sheets.json"), "w") as f:
        json.dump(spec, f, indent=1)
    with open(os.path.join(folder, "PROMPT.md"), "w", encoding="utf-8") as f:
        f.write(prompt_md(c, spec))
    return folder, len(sheets)


# ----------------------------------------------------------------- prompts


def prompt_md(c, spec):
    size = C.SIZES[c["size"]]
    dirs = ", ".join(f"D{d[0]} = {d[2]}" for d in C.drawn_dirs(c))
    model = [s for s in spec["sheets"] if s["kind"] == "model"]
    lines = [
        f"# {c['name']} (`{c['id']}`)",
        "",
        f"- Tier: {dict(C.TIERS)[c['tier']]}  ·  size class {c['size']} ({size['name']}, "
        f"1 m = {size['px_per_m']} px)  ·  height {c['height_m']:g} m",
        f"- Directions: {'D1-D5 (symmetric; the game mirrors D6-D8)' if c['symmetric'] else 'all 8 (holds something in one hand)'}",
        f"- Look: {c['look']}",
        f"- Palette ramps (locked for this creature): {c['ramps']}",
        "",
        "## Sheets, in painting order",
        "",
        "| # | File | What |",
        "|---|---|---|",
    ]
    for i, s in enumerate(spec["sheets"], 1):
        if s["kind"] == "model":
            what = "MODEL SHEET: standing at rest, every direction. Paint first."
        elif s["kind"] == "corpse":
            what = "Corpse on the ground, every direction (matches death F6)."
        else:
            a = spec["anims"][s["anim"]]
            what = f"`{s['anim']}` ({a['kind']}): {a['note']}"
        pg = f" (page {s['page']}/{s['pages']})" if s["pages"] > 1 else ""
        lines.append(f"| {i} | `{s['file']}` | {what}{pg} |")
    lines += [
        "",
        "## Step 1: the model sheet",
        "",
        "Start a new ChatGPT chat for this creature. Attach `STYLE_GUIDE.md`, `CREATURE_GUIDE.md`, "
        "`bellmourn_palette.png` and " + " + ".join(f"`{s['file']}`" for s in model) +
        ", then paste:",
        "",
        "```",
        "You are painting enemy/NPC billboard sprites for Bellmourn, a 1990s first-person dark",
        "fantasy RPG (Heretic / Hexen / Daggerfall era). Follow the attached STYLE_GUIDE.md and",
        "CREATURE_GUIDE.md exactly; they are locked. Use only colours from bellmourn_palette.png.",
        "",
        f"Creature: {c['name']}. {c['look']}",
        f"Paint it only from these palette ramps: {c['ramps']}.",
        f"Height: {c['height_m']:g} m, which is the dotted cyan line above the ground line.",
        "",
        "The attached sheet is the MODEL SHEET: one cell per direction, the creature standing",
        f"at rest. {dirs}.",
        "- Feet (or lowest point) on the cyan ground line, centred on the cyan tick.",
        "- Top of the head at the dotted cyan line.",
        "- Then paint every cyan line, label and tick inside the cells over with flat #FF00FF.",
        "- Keep the sheet exactly 1536x1024 and every black cell border where it is.",
        "- Hard pixel edges against the magenta, no outline all the way round, no text.",
        "```",
        "",
        "Check the result: same design from every side, right height, nothing outside the cells. "
        "Redo it until it is right: every other sheet copies it.",
        "",
        "## Step 2: every other sheet, one per message, in the order above",
        "",
        "In the same chat, attach the next sheet (and the painted model sheet again every few "
        "sheets so it stays in view), then paste with the sheet's line from the table filled in:",
        "",
        "```",
        f"Next sheet for the {c['name']}: <FILE>. <WHAT, from the table>",
        "Paint exactly the creature on the painted model sheet: same design, colours, size,",
        "light and pixel scale in every cell. Each row is one direction (the label says which),",
        "6 frames left to right; each label names the frame's pose. HIT marks the frame a blow",
        "lands, FIRE where a projectile leaves, SMEAR where a motion smear is allowed.",
        "Keep the feet on the ground line and the creature centred on the tick unless the",
        "animation moves it. Then paint all cyan guides and labels inside the cells over with",
        "flat #FF00FF. Keep the sheet 1536x1024 with every black border where it is.",
        "```",
        "",
        "## Step 3: return everything as one zip",
        "",
        "When every sheet is painted, paste:",
        "",
        "```",
        f"Put every painted sheet in one zip named {c['id']}_painted.zip, each PNG named exactly",
        "like the template it was painted on (e.g. " + spec["sheets"][1]["file"] + "), at",
        "1536x1024, RGB, with the background pure #FF00FF. No other files.",
        "```",
        "",
        "Then import it into the game:",
        "",
        "```",
        f"python tools/templates/import_creatures.py path/to/{c['id']}_painted.zip",
        "```",
        "",
    ]
    return "\n".join(lines)


def roster_md(results):
    out = ["# Bellmourn creature roster", "",
           "One folder per creature; open its `PROMPT.md` for the full painting order.", ""]
    for tier, title in C.TIERS:
        out += [f"## {title}", "", "| id | Name | Size | Height | Dirs | Animations | Sheets |",
                "|---|---|---|---|---|---|---|"]
        for c in C.CREATURES:
            if c["tier"] != tier:
                continue
            out.append(f"| `{c['id']}` | {c['name']} | {c['size']} | {c['height_m']:g} m | "
                       f"{'5 + mirror' if c['symmetric'] else '8'} | "
                       f"{', '.join(a[0] for a in c['anims'])}, corpse | {results[c['id']]} |")
        out.append("")
    out.append(f"**Total: {len(C.CREATURES)} creatures, {sum(results.values())} sheets.**")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    want = sys.argv[1:]
    roster = C.by_id()
    for n in want:
        if n not in roster:
            sys.exit(f"unknown creature {n!r}; known: {', '.join(roster)}")
    results = {}
    for c in C.CREATURES:
        if want and c["id"] not in want:
            continue
        folder, n = build(c)
        results[c["id"]] = n
        print(f"wrote {folder} ({n} sheets)")
    if not want:
        with open(os.path.join(OUT, "ROSTER.md"), "w", encoding="utf-8") as f:
            f.write(roster_md(results))
