"""Catalog sheets: every model of a kind rendered side by side (part colours, flat shaded),
for review.

    python tools/models/catalog.py gauntlets|items|props
    python tools/models/catalog.py textured onehand|gauntlets   (painted skins, lit like the game)
    python tools/models/catalog.py fp   (the gauntlets as the player sees them, sword in hand)
    python tools/models/catalog.py variants onehand|gauntlets   (every finish, one row each)
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import arm as A  # noqa: E402
import anims  # noqa: E402
import fp_rig as R  # noqa: E402
import raster  # noqa: E402
import texkit  # noqa: E402
from geom import norm  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))


def look(eye, target):
    f = norm(np.subtract(target, eye))
    r = norm(np.cross([0, 1, 0], f))
    return np.stack([r, np.cross(f, r), f])


def render(tris, cols, eye, target, size=360, fov=1.0):
    rot = look(eye, target)
    cam = [(t - eye) @ rot.T for t in tris]
    f = size / 2 / math.tan(fov / 2)
    proj = lambda p: (size / 2 + p[0] / p[2] * f, size / 2 - p[1] / p[2] * f)  # noqa: E731
    return raster.zbuffer(cam, cols, proj, size, near=0.01, light=norm([-0.3, 0.8, -0.5]),
                          bg=(44, 40, 50), cull=False)


def gauntlet_sheet(out):
    import gauntlets as G
    frame = anims.ANIMS["r1h_walk"]["frames"][0]
    arm = next(a for a in R.pose_frame(frame) if a["side"] == "R")
    mats = A.world_mats(arm, "R")
    tiles = []
    for gid, name, _, _ in G.GAUNTLETS:
        model = G.build(gid, "R")
        tris, cols = A.posed_triangles(model, mats, "R")
        target = arm["W"] * 0.8 + arm["E"] * 0.2
        eye = target + np.array([0.26, 0.13, -0.14])
        img = render(tris, cols, eye, target, fov=0.9)
        ImageDraw.Draw(img).text((8, 6), name, fill=(240, 220, 170), font=texkit.font(16, True))
        hand = arm["W"] + arm["A"] * 0.045
        close = render(tris, cols, hand + np.array([0.13, 0.09, -0.07]), hand, fov=0.9)
        tiles.append((img, close))
    sheet = Image.new("RGB", (360 * 5, 360 * 4))
    for i, (t, c) in enumerate(tiles):
        sheet.paste(t, ((i % 5) * 360, (i // 5) * 720))
        sheet.paste(c, ((i % 5) * 360, (i // 5) * 720 + 360))
    sheet.save(out)
    return out


def item_sheet(kind, out):
    import items as I
    import props as P
    tiles = []
    for spec in (P.PROPS if kind == "props" else I.ITEMS[kind]):
        model = spec["build"]()
        tris, cols = [], []
        for part, isl in model.islands():
            for t in isl.t:
                tris.append(isl.v[t])
                cols.append(part.color)
        pts = np.concatenate([i.v for _, i in model.islands()])
        c = (pts.max(0) + pts.min(0)) / 2
        r = np.linalg.norm(pts - c, axis=1).max()
        eye = (c + np.array([r * 1.3, r * 0.9, r * 2.0]) if kind == "props"  # props: 3/4 front
               else c + np.array([-r * 2.2, r * 0.5, -r * 1.1]))  # held: the camera's side
        img = render(tris, cols, eye, c, size=300)
        ImageDraw.Draw(img).text((8, 6), spec["name"], fill=(240, 220, 170),
                                 font=texkit.font(14, True))
        tiles.append(img)
        if kind.startswith("shield"):  # the face the enemy sees
            front = render(tris, cols, c + np.array([r * 1.4, r * 0.4, r * 2.2]), c, size=300)
            ImageDraw.Draw(front).text((8, 6), "front", fill=(200, 200, 200),
                                       font=texkit.font(12))
            tiles.append(front)
    cols_n = 5 if not kind.startswith("shield") else 6
    sheet = Image.new("RGB", (300 * cols_n, 300 * ((len(tiles) + cols_n - 1) // cols_n)))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols_n) * 300, (i // cols_n) * 300))
    sheet.save(out)
    return out


def textured_view(model, tex, target, radius, w, h, side=(-1.0, 0.18, -0.55)):
    """One textured, game-lit render of a packed model looking at `target`, framed so a
    sphere of `radius` fills the height."""
    eye = target + norm(np.array(side)) * radius * 2.6
    rot = look(eye, target)
    f = h * 0.5 / (radius * 1.06) * np.linalg.norm(eye - target)
    proj = lambda p: (w / 2 + p[0] / p[2] * f, h / 2 - p[1] / p[2] * f)  # noqa: E731
    tris, uvs, nrms = [], [], []
    for _, isl in model.islands():
        for t in isl.t:
            tris.append((isl.v[t] - eye) @ rot.T)
            uvs.append(isl.px[t] / model.tex)
            nrms.append(isl.n[t] @ rot.T)
    # key light from over the viewer's left shoulder, as the first-person view has it
    return raster.zbuffer_textured(tris, uvs, nrms, tex, proj, w, h,
                                   light=norm([-0.45, 0.55, -0.7]), bg=(44, 40, 50))


def textured_sheet(kind, out, tile=(300, 640), close=300):
    """Every model of a kind in its painted texture (the .glb's own skin), lit like the game
    (smooth Phong, nearest texels): whole, long side up (`out`), and close-ups of the head
    and the hilt (`out` with _close)."""
    import items as I
    w, h = tile
    tiles, closes = [], []
    for spec in I.ITEMS[kind]:
        model = spec["build"]()
        model.pack()
        tex = Image.open(os.path.join(ROOT, "templates", "models", "items", kind, spec["id"],
                                      f"{spec['id']}_texture.png"))
        pts = np.concatenate([i.v for _, i in model.islands()])
        c = (pts.max(0) + pts.min(0)) / 2
        r = np.linalg.norm(pts - c, axis=1).max()
        img = textured_view(model, tex, c, r, w, h)
        ImageDraw.Draw(img).text((8, 6), spec["name"], fill=(240, 220, 170),
                                 font=texkit.font(14, True))
        tiles.append(img)
        top = pts[:, 1].max()
        for label, at, rad in (("head", np.array([0, top - 0.11, 0]), 0.13),
                               ("hilt", np.array([0, 0.0, 0]), 0.11)):
            v = textured_view(model, tex, at, rad, close, close)
            ImageDraw.Draw(v).text((8, 6), f"{spec['name']}: {label}", fill=(240, 220, 170),
                                   font=texkit.font(13, True))
            closes.append(v)
    n = 5
    sheet = Image.new("RGB", (w * n, h * ((len(tiles) + n - 1) // n)))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % n) * w, (i // n) * h))
    sheet.save(out)
    # close-ups: each model's head above its hilt
    rows = (len(tiles) + n - 1) // n
    cs = Image.new("RGB", (close * n, close * 2 * rows))
    for i in range(len(tiles)):
        x, y = (i % n) * close, (i // n) * close * 2
        cs.paste(closes[2 * i], (x, y))
        cs.paste(closes[2 * i + 1], (x, y + close))
    cs.save(out.replace(".png", "_close.png"))
    return out

def textured_mesh_view(tris, uvs, nrms, tex, eye, target, w, h, fov=0.9, spec=0.1):
    """A textured, game-lit render of world-space triangles seen from `eye` (the arms are
    nearly matte in the game: low `spec`)."""
    rot = look(eye, target)
    f = h / 2 / math.tan(fov / 2)
    proj = lambda p: (w / 2 + p[0] / p[2] * f, h / 2 - p[1] / p[2] * f)  # noqa: E731
    cam = [(t - eye) @ rot.T for t in tris]
    cn = [n @ rot.T for n in nrms]
    return raster.zbuffer_textured(cam, uvs, cn, tex, proj, w, h, spec=spec, shininess=16,
                                   light=norm([-0.45, 0.55, -0.7]), bg=(44, 40, 50))


def textured_gauntlet_sheet(out, size=360):
    """The gauntlets in their painted skins, posed in the walk carry: the arm from the side
    and the back of the hand close up (same views as gauntlet_sheet)."""
    import gauntlets as G
    frame = anims.ANIMS["r1h_walk"]["frames"][0]
    arm = next(a for a in R.pose_frame(frame) if a["side"] == "R")
    mats = A.world_mats(arm, "R")
    tiles = []
    for gid, name, _, _ in G.GAUNTLETS:
        model = G.build(gid, "R")
        model.pack()
        tex = Image.open(os.path.join(ROOT, "templates", "models", "gauntlets", gid,
                                      f"{gid}_texture.png"))
        mesh = A.posed_mesh(model, mats, "R")
        target = arm["W"] * 0.8 + arm["E"] * 0.2
        img = textured_mesh_view(*mesh, tex, target + np.array([0.26, 0.13, -0.14]), target,
                                 size, size)
        ImageDraw.Draw(img).text((8, 6), name, fill=(240, 220, 170), font=texkit.font(16, True))
        hand = arm["W"] + arm["A"] * 0.045
        close = textured_mesh_view(*mesh, tex, hand + np.array([0.13, 0.09, -0.07]), hand,
                                   size, size)
        tiles.append((img, close))
    sheet = Image.new("RGB", (size * 5, size * 4))
    for i, (t, c) in enumerate(tiles):
        sheet.paste(t, ((i % 5) * size, (i // 5) * size * 2))
        sheet.paste(c, ((i % 5) * size, (i // 5) * size * 2 + size))
    sheet.save(out)
    return out


def fp_gauntlet_sheet(out, item=("onehand", "arming_sword"), k=3):
    """Each gauntlet as the player sees it: the 3D walk carry (r1h_walk_3d) with the item in
    hand, through the rigs' first-person camera (384 x 240 screen, 90 degree FOV, shrunk 0.58
    toward the bottom centre), drawn k times larger and cropped to the right hand's side."""
    import gauntlets as G
    import items as I
    frame = anims.ANIMS["r1h_walk_3d"]["frames"][0]
    R.set_view(frame.get("view", R.REST_SCALE))
    arm = next(a for a in R.pose_frame(frame) if a["side"] == "R")
    mats = A.world_mats(arm, "R")
    sw, sh, S = R.SCREEN_W * k, R.SCREEN_H * k, R.VIEW_SCALE
    F = R.FOCAL * k
    proj = lambda p: (sw / 2 + F * S * p[0] / p[2], sh - sh / 2 * S - F * S * p[1] / p[2])  # noqa: E731
    spec = next(x for x in I.ITEMS[item[0]] if x["id"] == item[1])
    im = spec["build"]()
    im.pack()
    itex = Image.open(os.path.join(ROOT, "templates", "models", "items", item[0], item[1],
                                   f"{item[1]}_texture.png"))
    m = mats["item"]
    itris, iuvs, inrms = [], [], []
    for _, isl in im.islands():
        v = isl.v @ m[:3, :3].T + m[:3, 3]
        n = isl.n @ m[:3, :3].T
        for t in isl.t:
            itris.append(v[t])
            iuvs.append(isl.px[t] / im.tex)
            inrms.append(n[t])
    light = norm([-0.5, 0.8, -0.4])
    tiles = []
    for gid, name, _, _ in G.GAUNTLETS:
        model = G.build(gid, "R")
        model.pack()
        tex = Image.open(os.path.join(ROOT, "templates", "models", "gauntlets", gid,
                                      f"{gid}_texture.png"))
        # one atlas for both models: the arm's texture left, the item's right
        aw, iw = tex.width, itex.width
        both = Image.new("RGB", (aw + iw, max(tex.height, itex.height)))
        both.paste(tex.convert("RGB"), (0, 0))
        both.paste(itex.convert("RGB"), (aw, 0))
        su, sv = aw / both.width, tex.height / both.height
        tris, uvs, nrms = A.posed_mesh(model, mats, "R")
        uvs = [u * [su, sv] for u in uvs]
        ivs = [u * [iw / both.width, itex.height / both.height] + [su, 0] for u in iuvs]
        img = raster.zbuffer_textured(tris + itris, uvs + ivs, nrms + inrms, both, proj, sw, sh,
                                      light=light, spec=0.1, shininess=16, bg=(58, 54, 64))
        img = img.crop((sw * 45 // 100, sh * 2 // 10, sw, sh))
        ImageDraw.Draw(img).text((8, 6), name, fill=(240, 220, 170), font=texkit.font(16, True))
        tiles.append(img)
    R.set_view(R.REST_SCALE)
    tw, th = tiles[0].size
    sheet = Image.new("RGB", (tw * 5, th * 2))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % 5) * tw, (i // 5) * th))
    sheet.save(out)
    return out


def variant_sheet(kind, out):
    """Every dressed model of a kind in its own skin and in each finish (dress.FINISHES):
    one row per finish. Weapons stand whole; gauntlets are posed in the walk carry."""
    import dress
    rows = [("base", "As dressed")] + [(k, v[0]) for k, v in dress.FINISHES.items()]
    if kind == "gauntlets":
        import gauntlets as G
        w = h = 220
        frame = anims.ANIMS["r1h_walk"]["frames"][0]
        arm = next(a for a in R.pose_frame(frame) if a["side"] == "R")
        mats = A.world_mats(arm, "R")
        target = arm["W"] * 0.75 + arm["E"] * 0.25
        models = []
        for gid, name, _, _ in G.GAUNTLETS:
            m = G.build(gid, "R")
            m.pack()
            mesh = A.posed_mesh(m, mats, "R")
            models.append((gid, name, os.path.join(ROOT, "templates", "models", "gauntlets", gid),
                           lambda tex, mesh=mesh: textured_mesh_view(
                               *mesh, tex, target + np.array([0.30, 0.15, -0.16]), target, w, h)))
    else:
        import items as I
        w, h = 150, 330
        models = []
        for spec in I.ITEMS[kind]:
            m = spec["build"]()
            m.pack()
            pts = np.concatenate([i.v for _, i in m.islands()])
            c = (pts.max(0) + pts.min(0)) / 2
            r = np.linalg.norm(pts - c, axis=1).max()
            models.append((spec["id"], spec["name"],
                           os.path.join(ROOT, "templates", "models", "items", kind, spec["id"]),
                           lambda tex, m=m, c=c, r=r: textured_view(m, tex, c, r, w, h)))
    sheet = Image.new("RGB", (w * len(models), h * len(rows)))
    for j, (mid, name, folder, view) in enumerate(models):
        for i, (key, label) in enumerate(rows):
            f = (f"{mid}_texture.png" if key == "base" else os.path.join("variants", f"{mid}_{key}.png"))
            img = view(Image.open(os.path.join(folder, f)))
            d = ImageDraw.Draw(img)
            if i == 0:
                d.text((6, 4), name, fill=(240, 220, 170), font=texkit.font(12, True))
            if j == 0:
                d.text((6, h - 20), label.upper(), fill=(200, 196, 210), font=texkit.font(12, True))
            sheet.paste(img, (j * w, i * h))
    sheet.save(out)
    return out


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "gauntlets"
    os.makedirs(os.path.join(ROOT, "templates", "models", "catalog"), exist_ok=True)
    if what == "gauntlets":
        print(gauntlet_sheet(os.path.join(ROOT, "templates", "models", "catalog", "gauntlets.png")))
    elif what == "textured":  # python tools/models/catalog.py textured onehand|gauntlets
        kind = sys.argv[2] if len(sys.argv) > 2 else "onehand"
        out = os.path.join(ROOT, "templates", "models", "catalog", f"{kind}_textured.png")
        print(textured_gauntlet_sheet(out) if kind == "gauntlets" else textured_sheet(kind, out))
    elif what == "variants":  # python tools/models/catalog.py variants onehand|gauntlets
        kind = sys.argv[2] if len(sys.argv) > 2 else "onehand"
        print(variant_sheet(kind, os.path.join(ROOT, "templates", "models", "catalog",
                                               f"{kind}_variants.png")))
    elif what == "fp":  # python tools/models/catalog.py fp   (gauntlets in first person)
        print(fp_gauntlet_sheet(os.path.join(ROOT, "templates", "models", "catalog",
                                             "gauntlets_fp.png")))
    elif what == "props":
        print(item_sheet("props", os.path.join(ROOT, "templates", "models", "catalog", "props.png")))
    else:
        import items as I
        for kind in I.ITEMS:
            print(item_sheet(kind, os.path.join(ROOT, "templates", "models", "catalog",
                                                f"{kind}.png")))
