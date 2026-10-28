"""Import a creature bundle from ChatGPT (painted sheets + animation_layout.json) into the game.

    python tools/templates/import_bundle.py path/to/<creature>_bundle.zip

The bundle's `animation_layout.json` says, per animation, which sheet it is on and, per frame,
its cell, art box and foot anchor. Frames are cut with a lasso, not a grid crop: every painted
blob on the sheet is found, the big ones go to the frame whose cell they sit in (by the centre
of their pixels), small loose bits (fingers, drips) join the nearest big blob within a few
pixels. A pose that reaches over a cell border therefore stays whole and never picks up a
neighbour's foot.

After cutting, `tools/creatures/<creature>.py` runs if it exists: hand repairs for what
ChatGPT got wrong (see frame_ops.py). Then everything is packed exactly like
import_creatures.py does: assets/creatures/<creature>/atlas_<n>.png, creature.json (read by
src/creature_sprites.js), preview/<anim>.gif and the index.
"""
import importlib.util
import io
import json
import os
import sys
import zipfile

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import creature_spec as C  # noqa: E402
import frame_ops as F  # noqa: E402
import import_creatures as IC  # noqa: E402

ROOT = IC.ROOT
FIXES = os.path.join(ROOT, "tools", "creatures")
BIG = 150  # px: a blob this size is a body, smaller ones are loose bits
REACH = 6  # px: how far a loose bit may sit from its body


def read_bundle(path):
    """-> (layout dict, {file name: PIL image})."""
    files = {}

    def walk(z):
        for info in z.infolist():
            name = info.filename.replace("\\", "/")
            if "__macosx" in name.lower() or info.is_dir():
                continue
            if name.lower().endswith(".zip"):
                walk(zipfile.ZipFile(io.BytesIO(z.read(info))))
            else:
                files.setdefault(os.path.basename(name), z.read(info))

    if os.path.isdir(path):
        for d, _, fs in os.walk(path):
            for f in fs:
                with open(os.path.join(d, f), "rb") as fh:
                    files.setdefault(f, fh.read())
    else:
        walk(zipfile.ZipFile(path))
    if "animation_layout.json" not in files:
        sys.exit("no animation_layout.json in the bundle")
    layout = json.loads(files["animation_layout.json"])
    return layout, files


def lasso(img, cells):
    """Cut every frame of one sheet. Returns {cell index: Frame}."""
    a = np.asarray(img.convert("RGB")).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    key = (r > 200) & (b > 200) & (g < 60)
    guide = (g > 190) & (b > 190) & (r < 100)
    fg = np.zeros(key.shape, bool)
    for c in cells:  # only the active cells, minus their label strip and black border
        x, y, w, h = c["cell"]
        ax, ay, aw, ah = c["art"]
        fg[ay:ay + ah, ax:ax + aw] = True
    fg &= ~key & ~guide
    lab, n = ndimage.label(fg, structure=np.ones((3, 3)))
    if not n:
        return {}
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    coms = ndimage.center_of_mass(fg, lab, range(1, n + 1))
    centres = np.array([[c["art"][1] + c["art"][3] / 2, c["art"][0] + c["art"][2] / 2]
                        for c in cells])
    owner = np.full(n + 1, -1)
    for i in range(n):
        if sizes[i] >= BIG:
            # the cell whose art box holds the blob's centre; nearest centre otherwise
            cy, cx = coms[i]
            inside = [k for k, c in enumerate(cells)
                      if c["art"][0] <= cx < c["art"][0] + c["art"][2]
                      and c["art"][1] <= cy < c["art"][1] + c["art"][3]]
            owner[i + 1] = inside[0] if inside else int(np.argmin(((centres - coms[i]) ** 2).sum(1)))
    bodies = {k: np.isin(lab, np.nonzero(owner == k)[0]) for k in set(owner[owner >= 0])}
    dist = {k: ndimage.distance_transform_edt(~m) for k, m in bodies.items()}
    for i in range(n):
        if owner[i + 1] >= 0 or not dist:
            continue
        ys, xs = np.nonzero(lab == i + 1)
        best = min(dist, key=lambda k: dist[k][ys, xs].min())
        if dist[best][ys, xs].min() <= REACH:
            owner[i + 1] = best
    out = {}
    rgb = a.astype(np.uint8)
    for k, c in enumerate(cells):
        m = np.isin(lab, np.nonzero(owner == k)[0])
        if not m.any():
            continue
        ys, xs = np.nonzero(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
        rgba[..., :3] = rgb[y0:y1, x0:x1]
        rgba[..., 3] = m[y0:y1, x0:x1] * 255
        rgba[..., :3] = F.snap(rgba[..., :3])
        rgba[rgba[..., 3] == 0, :3] = 0
        out[k] = F.Frame(rgba, c["anchor"][0] - x0 + 0.5, c["anchor"][1] - y0 + 1.0)
    return out


def cut_all(layout, files, report):
    """-> frames[anim][(dir, frame)] = Frame, plus per-animation timing."""
    frames, timing = {}, {}
    for anim, a in layout["animations"].items():
        if anim == "model":
            continue  # reference only
        if a["file"] not in files:
            report.append(f"  MISSING sheet {a['file']}")
            continue
        img = Image.open(io.BytesIO(files[a["file"]]))
        got = lasso(img, a["cells"])
        frames[anim] = {}
        for k, c in enumerate(a["cells"]):
            fr = got.get(k)
            if fr is None:
                report.append(f"  EMPTY {anim} D{c['direction']} F{c['frame'] + 1}")
                continue
            frames[anim][(c["direction"], c["frame"])] = fr
        timing[anim] = a
    return frames, timing


def run_fixes(cid, frames, report):
    path = os.path.join(FIXES, f"{cid}.py")
    if not os.path.isfile(path):
        return
    spec = importlib.util.spec_from_file_location(f"fixes_{cid}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.fix(frames, report)


def build(layout, frames, timing):
    cid = layout["id"]
    keys = [(anim, k) for anim in frames for k in frames[anim]]
    imgs = [Image.fromarray(frames[anim][k].rgba, "RGBA") for anim, k in keys]
    place, pages = IC.pack(imgs)
    where = {key: place[i] for i, key in enumerate(keys)}
    mirror = {int(k): v for k, v in layout.get("mirror", {}).items()}

    def entry(anim, f, d):
        flip = False
        if (d, f) not in frames[anim] and d in mirror:
            d, flip = mirror[d], True
        if (d, f) not in frames[anim]:
            return None
        fr = frames[anim][(d, f)]
        page, x, y = where[(anim, (d, f))]
        h, w = fr.rgba.shape[:2]
        return dict(page=page, x=x, y=y, w=w, h=h, ax=round(w - fr.ax if flip else fr.ax, 1),
                    ay=round(fr.ay, 1), flip=flip)

    anims = {}
    for anim, a in timing.items():
        if anim == "corpse":
            continue
        n = a.get("frames_per_direction", 4)
        kind = a.get("kind", anim)
        names = ([fr[0] for fr in C.KINDS[kind]["frames"]]
                 if kind in C.KINDS and len(C.KINDS[kind]["frames"]) == n
                 else [f"F{i + 1}" for i in range(n)])
        evs = a.get("events") or {}
        out = []
        for i in range(n):
            e = [x for x in evs.get(str(i), []) if x != "hold"]
            tics = a["tics"][i]
            if "hold" in evs.get(str(i), []) or (tics <= 0 and not a.get("loop")):
                tics = -1
            out.append(dict(name=names[i], tics=tics, events=e,
                            dirs=[entry(anim, i, d) for d in range(1, 9)]))
        anims[anim] = dict(kind=kind, loop=bool(a.get("loop")), frames=out)
    size = layout.get("size_class", "M")
    data = dict(id=cid, name=layout.get("name", cid), tier=layout.get("tier"), size_class=size,
                px_per_m=C.SIZES[size]["px_per_m"], height_m=layout.get("height_m"),
                tic_rate=layout.get("tic_rate", 35),
                pages=[f"atlas_{i}.png" for i in range(len(pages))], anims=anims,
                corpse=dict(dirs=[entry("corpse", 0, d) if "corpse" in frames else None
                                  for d in range(1, 9)]))
    folder = os.path.join(IC.OUT, cid)
    os.makedirs(os.path.join(folder, "preview"), exist_ok=True)
    for f in os.listdir(folder):
        if f.startswith("atlas_") and f.endswith(".png"):
            os.remove(os.path.join(folder, f))
    for i, pg in enumerate(pages):
        pg.save(os.path.join(folder, f"atlas_{i}.png"), optimize=True)
    with open(os.path.join(folder, "creature.json"), "w") as f:
        json.dump(data, f, indent=1)
    IC.write_previews(folder, data, pages)
    index_path = os.path.join(IC.OUT, "index.json")
    index = {}
    if os.path.isfile(index_path):
        with open(index_path) as f:
            index = json.load(f)
    index[cid] = dict(name=data["name"], tier=data["tier"],
                      path=f"assets/creatures/{cid}/creature.json")
    with open(index_path, "w") as f:
        json.dump(dict(sorted(index.items())), f, indent=1)
    return folder, data


def main(path):
    layout, files = read_bundle(path)
    report = []
    frames, timing = cut_all(layout, files, report)
    run_fixes(layout["id"], frames, report)
    folder, data = build(layout, frames, timing)
    n = sum(1 for a in data["anims"].values() for fr in a["frames"] for e in fr["dirs"] if e)
    print(f"{layout['id']}: {len(data['anims'])} animations, {n} frame views (mirrors "
          f"included) -> {os.path.relpath(folder, ROOT)}")
    for line in report:
        print(line)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
