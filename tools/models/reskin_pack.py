"""The re-skin pack: every weapon, staff and shield the game uses, laid out flat for ChatGPT
to paint, plus the data import_reskin.py needs to carry the paintings back onto the models.

    python tools/models/reskin_pack.py            # templates/reskin/layouts + the zip
    python tools/models/reskin_pack.py --preview arming_sword ironbound   # just those, to look at

The models keep their UV layouts (a 128 x 128 atlas, geom.py). For painting, each UV island is
moved onto a 1536 x 1024 canvas (the largest size ChatGPT paints) on its own:

- turned so every weapon and staff lies the same way (tip or head to the RIGHT) and every
  shield stands upright, and shown the right way round as seen from outside (so a cross or a
  sigil painted on a shield's face comes out upright and unmirrored on the model);
- as large as the canvas allows, with tiny pieces (end caps, rivets) enlarged so they get
  painted at all;
- with a gutter of magenta around it, so a painting that comes back slightly shifted still
  lands on the right piece.

Each island's move is a 2 x 3 affine (layout texels -> canvas pixels). It is saved, with an
island-index map of the layout, in templates/reskin/layouts/<id>.json + <id>__uv.png, so the
importer never needs to rebuild a model (the remodels' sources are not in git).

Per model the pack holds `NN__<id>__paint.png` (the canvas ChatGPT paints over: every piece
filled flat with its material's colour, folds drawn in), `NN__<id>__card.png` (the same layout
with every piece numbered, the model from four sides and a key) and `NN__<id>__islands.png`
(the canvas island map, for reskin_tool.py's checks).
"""
import io
import json
import math
import os
import shutil
import sys
import zipfile

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(os.path.dirname(HERE))
if not os.environ.get("BELLMOURN_WEAPON_PACKS") and not os.path.isdir(
        os.path.join(ROOT, "art", "raw", "weapons")):
    # a worktree has no art/raw (gitignored): use the main checkout's
    main = os.path.join(ROOT, "..", "..", "..", "art", "raw", "weapons")
    if os.path.isdir(main):
        os.environ["BELLMOURN_WEAPON_PACKS"] = os.path.abspath(main)

import autotexture  # noqa: E402
import dress  # noqa: E402
import items as I  # noqa: E402
import kit  # noqa: E402
import texkit  # noqa: E402
import reskin_tool as T  # noqa: E402

OUT = os.path.join(ROOT, "templates", "reskin")
PACKDATA = os.path.join(OUT, "pack")
PACKS = os.path.join(ROOT, "templates", "packs")
PACK_NAME = "bellmourn_reskin_weapons.zip"

# the kinds the game uses (wands were taken out of the game: see src/fps/gear.js)
KINDS = ("onehand", "shield_round", "shield_kite", "twohand", "staff")
KIND_TEXT = dict(onehand="one-handed weapon", twohand="two-handed weapon", staff="magic staff",
                 shield_round="round shield", shield_kite="kite shield")
CW, CH = T.CANVAS
LRES = T.LRES  # layout maps: 8 px per layout texel
MARGIN, GUTTER = 26, 22  # canvas edge and gap between pieces (px)
MIN_SIDE, MAX_GROW, SLIVER = 26.0, 3.0, 220.0  # small pieces grow to 26 px across (at most 3x)
SKIP = 1.5  # islands under 1.5 texels both ways are too small to paint: filled by their part
PILOT = ("arming_sword", "ironbound", "knights_kite", "gnarled_staff")

# kit colour -> (material key on the material board, how the prompt names it)
MATERIAL = {
    kit.STEEL: ("steel", "bright steel"), kit.IRON: ("iron", "iron"),
    kit.DARKIRON: ("black_iron", "blackened iron"), kit.SILVER: ("silver", "silver"),
    kit.CHAIN: ("iron", "iron mail"), kit.GOLD: ("gold", "gold"), kit.BRASS: ("brass", "brass"),
    kit.BRONZE: ("bronze", "bronze"), kit.LEATHER: ("leather", "brown leather"),
    kit.DARKLEATHER: ("dark_leather", "dark leather"), kit.WRAP: ("leather", "linen wrap"),
    kit.FUR: ("leather", "fur"), kit.RED: ("red_cloth", "red cloth"),
    kit.BLUE: ("red_cloth", "blue cloth"), kit.PURPLE: ("red_cloth", "purple cloth"),
    autotexture.CLOTHRED: ("red_cloth", "red cloth"), kit.WOOD: ("wood", "wood"),
    kit.DARKWOOD: ("dark_wood", "dark wood"), kit.PALEWOOD: ("pale_wood", "pale wood"),
    kit.BONE: ("bone", "bone"), autotexture.WAX: ("bone", "old bone"),
    kit.HORN: ("horn", "horn"), kit.GREEN: ("green_scales", "green scales"),
    kit.OBSIDIAN: ("obsidian", "obsidian"), autotexture.MOSSSTONE: ("stone", "mossy stone"),
    autotexture.STONE: ("stone", "stone"), autotexture.DARKSTONE: ("stone", "dark stone"),
    kit.GEM_RED: ("gems", "ruby"), kit.GEM_BLUE: ("gems", "sapphire"),
    kit.GEM_GREEN: ("gems", "emerald"), kit.CRYSTAL: ("glow", "pale glowing crystal"),
    kit.EMBER: ("glow", "glowing embers"),
}

# extra design notes per model (edit freely: they go into that model's prompt)
NOTES = {
    "knights_kite": "Paint Lord Velscour's sigil on the FRONT face: a tall gold-edged V inside "
                    "a dark iron ring, on a deep blood-red field (see style/velscour_sigil.png). "
                    "The back face (the player's side) is bare dark planks.",
    "templar_kite": "The raised cross pieces are deep red enamel with gold edges; the board "
                    "around them is polished silver plate.",
    "scale_kite": "The FRONT face is covered in rows of overlapping green drake scales, each "
                  "scale with a lighter rim; the back face is dark planks.",
    "thorned_kite": "The board is black volcanic glass with faint purple glints; the thorns "
                    "are dark iron.",
    "sun_bronze": "The rays are raised gold; the board between them is hammered bronze.",
    "hide_targe": "The face is stretched hide leather with brass studs.",
    "skull_boss": "The boss is a horned bone skull; the board is dark planks; the rim is bone.",
}
SHIELD_NOTE = ("The big disc marked FRONT is the shield's face exactly as an enemy sees it "
               "(the boss sits on its centre): paint any device or pattern upright on it. The "
               "disc marked INSIDE is the player's side: plain boards, leather or metal.")
KITE_NOTE = ("The kite's FRONT face (the one enemies see) and BACK face (the player's side) are "
             "separate pieces: heraldry only on the front.")


# a model's own word for a part's material, where its description says more than its colour
MATERIAL_OVERRIDE = {("ironbound", "board"): ("painted_wood", "painted wood"),
                     ("knights_kite", "board"): ("painted_wood", "painted wood")}


def material(part, model_id=None):
    return MATERIAL_OVERRIDE.get((model_id, part.name)) or MATERIAL.get(
        tuple(part.color[:3]), ("iron", "iron"))


def is_edge(name):
    return any(k in name for k in dress.EDGES + ("edge",))


# ------------------------------------------------------------------ layout

def _rot(k):
    """2 x 2 rotation by k quarter turns in image coordinates (y down)."""
    c, s = [(1, 0), (0, 1), (-1, 0), (0, -1)][k % 4]
    return np.array([[c, -s], [s, c]], float)


def _jacobians(isl):
    """Per triangle: the 3 x 2 map from layout px to 3D, its layout area and face normal."""
    P = isl.px[isl.t]
    V = isl.v[isl.t]
    e1, e2 = P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]
    det = e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]
    ok = np.abs(det) > 1e-9
    inv = np.zeros((len(P), 2, 2))
    inv[ok] = np.stack([np.stack([e2[ok, 1], -e2[ok, 0]], -1),
                        np.stack([-e1[ok, 1], e1[ok, 0]], -1)], 1) / det[ok, None, None]
    E = np.stack([V[:, 1] - V[:, 0], V[:, 2] - V[:, 0]], -1)  # 3 x 2 per triangle
    J = E @ inv  # 3 x 2: d(3D) / d(layout x, y)
    n = np.cross(V[:, 1] - V[:, 0], V[:, 2] - V[:, 0])
    return J[ok], np.abs(det[ok]) / 2, n[ok]


def orient(isl, mode):
    """(rotation, flip) for an island: the 3D +y (a weapon's tip, a shield's top) toward the
    canvas right (mode "x") or up (mode "up"), voted by every triangle so rings and caps
    (no single direction) count as undecided and lie with their long side across; flipped if
    it would read mirrored seen from outside."""
    J, wt, n = _jacobians(isl)
    w, h = isl.px.max(0) - isl.px.min(0)
    if not len(J):
        return _rot(0 if w >= h else 1), np.eye(2)
    best, bk = -2.0, 0
    for k in range(4):
        Rt = _rot(k).T
        e = Rt[:, 0] if mode == "x" else -Rt[:, 1]
        d = J @ e
        sc = (wt * d[:, 1] / (np.linalg.norm(d, axis=1) + 1e-12)).sum() / wt.sum()
        if sc > best + 1e-6:
            best, bk = sc, k
    if best < 0.5:  # no clear direction: lie long side across
        bk = 0 if w >= h else 1
    Rt = _rot(bk).T
    X3, U3 = J @ Rt[:, 0], -(J @ Rt[:, 1])
    side = np.sign((np.cross(X3, U3) * n).sum(1))
    vote = (wt * side).sum() / wt.sum()
    flip = np.eye(2)
    # the rig's space is left-handed (x right, y up, z forward: the .glb flips z), so a face
    # reads the right way round from outside when right x up points INTO it
    if vote > 0.5:
        flip = np.diag([1.0, -1.0]) if mode == "x" else np.diag([-1.0, 1.0])
    return _rot(bk), flip


def projected(isl, density):
    """A shield's dished board or domed boss is unrolled ring by ring in its UVs (no one can
    paint a sigil on that), so it goes on the canvas as it is seen: projected along z, from the
    front (enemy side, +z) or from behind (the player's side). -> (n, 2) in layout texels."""
    v, t = isl.v, isl.t
    nz = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])[:, 2].sum()
    sx = -1.0 if nz > 0 else 1.0  # seen from +z, the rig's +x is on the viewer's left
    return np.c_[sx * v[:, 0], -v[:, 1]] * density


def _is_dish(kind, part, island):
    if not kind.startswith("shield"):
        return False
    word = island.name.split()[-1]
    lathe = word not in ("front", "back", "rim", "start", "end")
    return lathe and (part.name == "board" or "boss" in part.name)


def tag_faces(model, kind, isl):
    """Short face tags for the card and the prompt. A shield's board faces are named for who
    sees them (worked out from which side the grip is on): FRONT (enemies) and INSIDE (the
    player). Otherwise F/B = the two faces of a flat piece, R = its rim, S/E = end caps."""
    grip = [i["island"].v for i in isl if any(k in i["part"].name for k in ("grip", "strap"))]
    g = np.concatenate(grip).mean(0) if grip else None
    for i in isl:
        word = i["island"].name.split()[-1]
        tag = dict(front="F", back="B", rim="R", start="S", end="E").get(word, "")
        if (kind.startswith("shield") and i["part"].name == "board" and g is not None
                and word in ("front", "back", "board", "start")):
            v, t = i["island"].v, i["island"].t
            n = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]]).sum(0)
            tag = "INSIDE" if np.dot(n, g - v.mean(0)) > 0 else "FRONT"
        i["tag"] = tag


def _grow(w, h, s):
    """A piece's own scale: the model's, enlarged for tiny pieces (not long slivers)."""
    mn, mx = max(min(w, h), 1e-6), max(w, h)
    si = s
    if mn * s < MIN_SIDE:
        si = min(MIN_SIDE / mn, MAX_GROW * s)
        si = max(s, min(si, max(mx * s, SLIVER) / mx))
    return si


def _shelf(rects, s, W, H):
    """Shelf-pack (w, h) rectangles (layout units, scaled by their own grow) into W x H."""
    out, x, y, shelf = [], 0.0, 0.0, 0.0
    for w, h in rects:
        si = _grow(w, h, s)
        rw, rh = w * si + GUTTER, h * si + GUTTER
        if rw > W:
            return None
        if x + rw > W:
            x, y, shelf = 0.0, y + shelf, 0.0
        if y + rh > H:
            return None
        out.append((x, y, rw, rh, si))
        x += rw
        shelf = max(shelf, rh)
    return out


def layout(model, kind):
    """Every island's canvas affine. -> list of dicts (one per island, in model order)."""
    mode = "up" if kind.startswith("shield") else "x"
    isl = []
    numbers = {}
    for part, island in model.islands():
        numbers.setdefault(part.name, len(numbers) + 1)
        if _is_dish(kind, part, island):
            A, q = None, projected(island, model.density * part.weight)
        else:
            R, F = orient(island, mode)
            A = F @ R
            q = island.px @ A.T
        lo, hi = q.min(0), q.max(0)
        w, h = hi - lo
        ow, oh = island.px.max(0) - island.px.min(0)
        isl.append(dict(part=part, island=island, number=numbers[part.name], A=A, q=q, lo=lo,
                        w=w, h=h, skip=bool(max(ow, oh) < SKIP)))
    live = [i for i in isl if not i["skip"]]
    # pieces of one part stay together, parts in order of their tallest piece
    tallest = {}
    for i in live:
        tallest[i["number"]] = max(tallest.get(i["number"], 0), i["h"])
    orders = [sorted(live, key=lambda i: (-tallest[i["number"]], i["number"], -i["h"])),
              sorted(live, key=lambda i: -i["h"])]
    W, H = CW - 2 * MARGIN + GUTTER, CH - 2 * MARGIN + GUTTER
    results = []
    for order in orders:
        lo, hi, best = 0.5, 60.0, None
        for _ in range(36):
            mid = (lo + hi) / 2
            placed = _shelf([(i["w"], i["h"]) for i in order], mid, W, H)
            if placed:
                best, lo = (mid, placed), mid
            else:
                hi = mid
        results.append((best[0], order, best[1]))
    grouped, flat = results
    s, order, placed = grouped if grouped[0] >= 0.9 * flat[0] else flat
    # centre the packed pieces on the canvas
    x1 = max(p[0] + p[2] for p in placed) - GUTTER
    y1 = max(p[1] + p[3] for p in placed) - GUTTER
    ox, oy = (CW - x1) / 2, (CH - y1) / 2
    for i, (x, y, rw, rh, si) in zip(order, placed):
        # canvas = si * (q - lo) + the piece's corner; for most pieces q = A @ px, an affine
        corner = np.array([ox + x, oy + y])
        i.update(cv=si * (i["q"] - i["lo"]) + corner, scale=si,
                 M=None if i["A"] is None else np.c_[i["A"] * si, corner - i["lo"] * si])
    for i in isl:
        if i["skip"]:
            i.update(M=None, cv=None, scale=0.0)
    return isl, s


def _edges(i):
    """An island's outline and fold edges; a projected dish has no seam (its UV seam closes
    up on the canvas)."""
    outline, folds = _boundary_and_folds(i["island"])
    if i["A"] is None:
        cv = i["cv"]
        key = lambda a, b: tuple(sorted((tuple(np.round(cv[a] * 2)), tuple(np.round(cv[b] * 2)))))  # noqa: E731
        count = {}
        for a, b in outline:
            count[key(a, b)] = count.get(key(a, b), 0) + 1
        outline = [(a, b) for a, b in outline if count[key(a, b)] == 1]
    return outline, folds


def _boundary_and_folds(island, fold_deg=24.0):
    """Island outline edges and fold edges (shared edges whose faces meet at an angle). Faces
    are often split (flat shading), so edges are matched by 3D and layout position."""
    v, px, t = island.v, island.px, island.t
    fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12
    edges = {}
    for fi, tri in enumerate(t):
        for a, b in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])):
            ka, kb = tuple(np.round(v[a], 4)), tuple(np.round(v[b], 4))
            if kb < ka:
                a, b, ka, kb = b, a, kb, ka
            edges.setdefault((ka, kb), []).append((fi, a, b))
    outline, folds = [], []
    cos = math.cos(math.radians(fold_deg))
    for use in edges.values():
        # faces meeting at an edge are one surface if their layout corners agree (segments of
        # a tapering blade differ by a few thousandths of a texel)
        shared = [(f, a, b) for f, a, b in use[1:]
                  if np.abs(px[a] - px[use[0][1]]).max() < 0.25
                  and np.abs(px[b] - px[use[0][2]]).max() < 0.25]
        a, b = use[0][1], use[0][2]
        if not shared:
            for f, a2, b2 in use:
                outline.append((a2, b2))
        elif abs(np.dot(fn[use[0][0]], fn[shared[0][0]])) < cos:
            folds.append((a, b))
    return outline, folds


# ------------------------------------------------------------------ drawing

def _hue_colours(n):
    """n clearly different part colours for the card (and its views)."""
    import colorsys
    out = []
    for k in range(n):
        h = (k * 0.6180339887) % 1.0
        l = (0.55, 0.42, 0.66)[k % 3]
        r, g, b = colorsys.hls_to_rgb(h, l, 0.62)
        out.append((int(r * 255), int(g * 255), int(b * 255)))
    return out


def _cv(i, idx):
    """Canvas points of an island's vertices `idx`."""
    return [tuple(p) for p in i["cv"][list(idx)]]


def draw_paint(isl):
    """The canvas ChatGPT paints over: each piece flat in its material colour, folds drawn."""
    img = Image.new("RGB", (CW, CH), T.KEY)
    d = ImageDraw.Draw(img)
    for i in isl:
        if i["skip"]:
            continue
        isl_, col = i["island"], tuple(i["part"].color[:3])
        for t in isl_.t:
            d.polygon(_cv(i, t), fill=col)
    for i in isl:
        if i["skip"]:
            continue
        isl_, col = i["island"], np.array(i["part"].color[:3], float)
        outline, folds = _edges(i)
        dark = tuple(int(c) for c in col * 0.62)
        fold = tuple(int(c) for c in np.clip(col * 0.78 + 18, 0, 255))
        for a, b in folds:
            d.line(_cv(i, (a, b)), fill=fold, width=1)
        for a, b in outline:
            d.line(_cv(i, (a, b)), fill=dark, width=2)
    return img


def draw_islands(isl):
    """Canvas island map: pixel value = island index + 1 (0 = background)."""
    img = Image.new("L", (CW, CH), 0)
    d = ImageDraw.Draw(img)
    for k, i in enumerate(isl):
        if i["skip"]:
            continue
        for t in i["island"].t:
            d.polygon(_cv(i, t), fill=k + 1)
    return img


def draw_uv(isl, tex=128):
    """Layout island map at LRES (8 px per texel): pixel value = island index + 1."""
    img = Image.new("L", (LRES, LRES), 0)
    d = ImageDraw.Draw(img)
    k8 = LRES / tex
    for k, i in enumerate(isl):
        for t in i["island"].t:
            d.polygon([tuple(p * k8) for p in i["island"].px[t]], fill=k + 1)
    return img


def _views(model, kind, colours, size):
    """The model from four sides, each part in its card colour; weapons and staffs turned to
    lie tip-right like the layout."""
    shield = kind.startswith("shield")
    keep = [p.color for p in model.parts]
    num = {}
    for p, _ in model.islands():
        num.setdefault(p.name, len(num) + 1)
    for p in model.parts:
        p.color = colours[num[p.name] - 1] + (255,)
    if shield:
        angles = ((180, 10, ""), (0, 10, ""), (90, 0, ""), (0, 80, ""))
        titles = ("FRONT (what enemies see)", "INSIDE (the player's side)", "SIDE", "TOP")
    else:
        angles = ((-60, 15, ""), (120, 15, ""), (0, 0, ""), (-60, 70, ""))
        titles = ("CAMERA SIDE", "OTHER SIDE", "EDGE ON", "FROM ABOVE")
    try:
        views = texkit._views(model, size, angles)
    finally:
        for p, c in zip(model.parts, keep):
            p.color = c
    if not shield:
        views = [v.rotate(-90) for v in views]
    return list(zip(views, titles))


def draw_card(model, kind, isl, spec, job, parts):
    """The labelled layout + four views + key, for ChatGPT to read (not to paint)."""
    PH = 512
    img = Image.new("RGB", (CW, CH + PH), (24, 22, 26))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, CW - 1, CH - 1], fill=(64, 60, 70))
    colours = _hue_colours(len(parts))
    for i in isl:
        if i["skip"]:
            continue
        c = colours[i["number"] - 1]
        for t in i["island"].t:
            d.polygon(_cv(i, t), fill=c)
    for i in isl:
        if i["skip"]:
            continue
        outline, folds = _edges(i)
        for a, b in folds:
            d.line(_cv(i, (a, b)), fill=(255, 255, 255), width=1)
        for a, b in outline:
            d.line(_cv(i, (a, b)), fill=(0, 0, 0), width=2)
    f15, f12 = texkit.font(15, True), texkit.font(12, True)
    for i in isl:
        if i["skip"]:
            continue
        pts = i["cv"]
        lo, hi = pts.min(0), pts.max(0)
        if min(hi - lo) < 16:
            continue
        c = (lo + hi) / 2
        tag = i.get("tag", "")
        label = str(i["number"]) + (f" {tag}" if len(tag) > 1 and hi[0] - lo[0] > 90 else tag)
        f = f15 if min(hi - lo) >= 24 else f12
        w = d.textlength(label, font=f)
        d.rectangle([c[0] - w / 2 - 3, c[1] - 9, c[0] + w / 2 + 3, c[1] + 9], fill=(0, 0, 0))
        d.text((c[0] - w / 2, c[1] - 8), label, fill=(255, 255, 255), font=f)
    # info panel
    y0 = CH + 10
    shield = kind.startswith("shield")
    d.text((16, y0), f"{job:02d}  {spec['name'].upper()}", fill=(240, 220, 170),
           font=texkit.font(22, True))
    d.text((16, y0 + 30), f"{KIND_TEXT[kind]}  -  id: {spec['id']}", fill=(170, 170, 170),
           font=texkit.font(13))
    note = ("Every piece stands UPRIGHT: the top of the shield is at the top."
            if shield else "Every long piece lies on its side with its TIP / HEAD at the RIGHT  >>>")
    d.text((16, y0 + 50), note, fill=(255, 235, 140), font=texkit.font(14, True))
    faces = ("FRONT = the face enemies see (round shields: drawn as they see it), INSIDE = the "
             "player's side." if shield else "")
    faces += " F/B = the two faces of a flat piece, R = its rim, S/E = end caps."
    y = y0 + 70
    for line in _wrap(faces.strip(), 128):
        d.text((16, y), line, fill=(190, 190, 190), font=texkit.font(12))
        y += 15
    y += 4
    for line in _wrap(spec["desc"], 118):
        d.text((16, y), line, fill=(215, 215, 215), font=texkit.font(13))
        y += 16
    views = _views(model, kind, colours, 250 if shield else 440)
    vy = y + 6
    if shield:
        for k, (v, title) in enumerate(views):
            x = 16 + k * 250
            img.paste(v, (x, vy))
            d.text((x + 6, vy + 4), title, fill=(230, 230, 230), font=f12)
    else:
        vh = (CH + PH - vy - 8) // 2
        for k, (v, title) in enumerate(views):
            crop = v.crop((0, (v.height - vh) // 2, v.width, (v.height - vh) // 2 + vh))
            x, yy = 16 + (k % 2) * 496, vy + (k // 2) * (vh + 4)
            img.paste(crop, (x, yy))
            d.text((x + 6, yy + 4), title, fill=(230, 230, 230), font=f12)
    # key
    kx, ky = 1030, y0 + 6
    d.text((kx, ky), "PIECES  (number - part - material)", fill=(240, 220, 170), font=f12)
    ky += 20
    rows = max(1, (CH + PH - ky - 10) // 18)
    for k, p in enumerate(parts):
        x, yy = kx + (k // rows) * 250, ky + (k % rows) * 18
        d.rectangle([x, yy + 2, x + 12, yy + 14], fill=colours[k])
        d.text((x + 18, yy), f"{p['number']:>2} {p['label']} - {p['material_label']}"[:44],
               fill=(220, 220, 220), font=texkit.font(12))
    return img


def _wrap(text, n):
    words, out, line = text.split(), [], ""
    for w in words:
        if len(line) + len(w) + 1 > n:
            out.append(line)
            line = w
        else:
            line = (line + " " + w).strip()
    return out + ([line] if line else [])


# ------------------------------------------------------------------ the pack

def _island_json(i):
    """An island for the importer: `M` (layout texels -> canvas px, 2 x 3) for most; a
    `warp` (its triangles with layout and canvas corners) for the projected dishes."""
    out = dict(part=i["number"], name=i["island"].name, tag=i["tag"], skip=i["skip"],
               M=None, warp=None)
    if i["skip"]:
        return out
    if i["M"] is not None:
        out["M"] = [[round(float(v), 5) for v in row] for row in i["M"]]
    else:
        isl = i["island"]
        out["warp"] = dict(t=isl.t.tolist(), px=np.round(isl.px, 4).tolist(),
                           cv=np.round(i["cv"], 3).tolist())
    return out


def jobs():
    """[(job number, kind, spec)] in painting order."""
    out = []
    for kind in KINDS:
        for spec in I.ITEMS[kind]:
            out.append((len(out) + 1, kind, spec))
    return out


def build_model(job, kind, spec):
    model = spec["build"]()
    model.pack()
    isl, s = layout(model, kind)
    tag_faces(model, kind, isl)
    parts, seen = [], set()
    for i in isl:
        p = i["part"]
        if p.name in seen:
            continue
        seen.add(p.name)
        key, label = material(p, spec["id"])
        tags = {j["tag"] for j in isl if j["part"] is p}
        faces = ""
        if "FRONT" in tags:
            faces = ("two faces: FRONT (what enemies see: any heraldry goes here) and INSIDE "
                     "(the player's side)")
        parts.append(dict(number=i["number"], name=p.name, label=p.label, material=key,
                          material_label=label, family=T.FAMILY[key], edge=is_edge(p.name),
                          faces=faces, colour="#%02x%02x%02x" % tuple(p.color[:3])))
    notes = [NOTES[spec["id"]]] if spec["id"] in NOTES else []
    if kind == "shield_round":
        notes.append(SHIELD_NOTE)
    if kind == "shield_kite":
        notes.append(KITE_NOTE)
    stem = f"{job:02d}__{spec['id']}"
    meta = dict(job=job, id=spec["id"], name=spec["name"], kind=kind,
                kind_text=KIND_TEXT[kind], description=spec["desc"], notes=notes,
                orientation="up" if kind.startswith("shield") else "tip-right",
                canvas=[CW, CH], layout_tex=model.tex, scale=round(s, 3),
                files=dict(paint=f"templates/{stem}__paint.png",
                           card=f"templates/{stem}__card.png",
                           islands=f"templates/{stem}__islands.png",
                           painted=f"painted/{stem}.png"),
                parts=parts,
                islands=[_island_json(i) for i in isl])
    images = dict(paint=draw_paint(isl), card=draw_card(model, kind, isl, spec, job, parts),
                  islands=draw_islands(isl), uv=draw_uv(isl, model.tex))
    return meta, images


def material_board():
    """The material board template: one labelled slot per material key (STYLE_LOCK.md)."""
    img = Image.new("RGB", (CW, CH), (36, 34, 40))
    d = ImageDraw.Draw(img)
    cols, rows, m, gap, lab = 7, 3, 20, 14, 26
    sw = (CW - 2 * m - (cols - 1) * gap) // cols
    sh = (CH - 2 * m - (rows - 1) * gap) // rows - lab
    slots = []
    for k, (key, label, _) in enumerate(T.BOARD):
        c, r = k % cols, k // cols
        x, y = m + c * (sw + gap), m + r * (sh + lab + gap)
        d.rectangle([x, y, x + sw - 1, y + lab - 3], fill=(16, 15, 18))
        d.text((x + 6, y + 4), f"{k + 1:>2} {label}"[:30], fill=(240, 220, 170),
               font=texkit.font(13, True))
        d.rectangle([x, y + lab, x + sw - 1, y + lab + sh - 1], fill=(128, 128, 128))
        slots.append(dict(key=key, box=[x, y + lab, x + sw, y + lab + sh]))
    return img, slots


def _png(img, mode=None):
    buf = io.BytesIO()
    if mode == "P":
        img = img.convert("P", palette=Image.ADAPTIVE, colors=256)
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def write(only=None, preview_dir=None):
    """Stage the pack's data in templates/reskin/pack/ (what import_reskin.py reads: the
    manifest, paint templates, island maps and layout maps) and write the zip for ChatGPT
    (the same plus cards, docs, palette, the tool and the material board)."""
    manifest = dict(format=T.FORMAT, canvas=[CW, CH], layout_res=LRES,
                    pilot=list(PILOT), board=[dict(key=k, label=l, paint=p)
                                              for k, l, p in T.BOARD], jobs=[])
    files, staged = {}, {}
    for job, kind, spec in jobs():
        if only and spec["id"] not in only:
            continue
        meta, im = build_model(job, kind, spec)
        manifest["jobs"].append(meta)
        for k in ("paint", "islands"):
            staged[meta["files"][k]] = files[meta["files"][k]] = _png(im[k])
        files[meta["files"]["card"]] = _png(im["card"], "P")
        staged[f"layouts/{spec['id']}__uv.png"] = _png(im["uv"])
        if preview_dir:
            for k in ("paint", "card"):
                im[k].save(os.path.join(preview_dir, f"{job:02d}__{spec['id']}__{k}.png"))
        print(f"{job:02d} {kind:<13} {spec['id']:<22} scale {meta['scale']:6.2f}  "
              f"{sum(not i['skip'] for i in meta['islands']):>3} pieces  {len(meta['parts'])} parts")
    if only:
        return manifest
    board, slots = material_board()
    manifest["board_slots"] = slots
    files["style/material_board__paint.png"] = _png(board)
    if os.path.isdir(PACKDATA):
        shutil.rmtree(PACKDATA)
    for name, data in staged.items():
        os.makedirs(os.path.dirname(os.path.join(PACKDATA, name)), exist_ok=True)
        with open(os.path.join(PACKDATA, name), "wb") as f:
            f.write(data)
    with open(os.path.join(PACKDATA, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    # the zip for ChatGPT
    os.makedirs(PACKS, exist_ok=True)
    path = os.path.join(PACKS, PACK_NAME)
    style = os.path.join(ROOT, "templates", "style")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for fn in ("START_HERE.md", "STYLE_LOCK.md"):
            z.write(os.path.join(OUT, fn), fn)
        z.write(os.path.join(style, "STYLE_GUIDE.md"), "STYLE_GUIDE.md")
        for fn in ("bellmourn_palette.png", "bellmourn_palette.json", "bellmourn_palette.gpl"):
            z.write(os.path.join(style, fn), fn)
        z.write(os.path.join(HERE, "reskin_tool.py"), "reskin_tool.py")
        z.writestr("manifest.json", json.dumps(manifest, indent=1))
        sig = Image.open(os.path.join(ROOT, "art", "velscour", "sigil_cut.png"))
        sig.thumbnail((384, 384))
        z.writestr("style/velscour_sigil.png", _png(sig))
        for name in sorted(files):
            z.writestr(name, files[name])
    return manifest, path


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--preview":
        out = os.path.join(OUT, "_preview")
        os.makedirs(out, exist_ok=True)
        write(only=set(args[1:]), preview_dir=out)
        print(f"previews in {out}")
    else:
        m, p = write()
        print(f"{len(m['jobs'])} models; wrote {os.path.relpath(p, ROOT)} "
              f"({os.path.getsize(p) // 1024} KB)")
