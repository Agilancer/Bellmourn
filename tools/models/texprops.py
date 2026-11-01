"""Crates, chests, barrels and pottery modelled in Blender to fit the object texture sheets.

    python tools/models/texprops.py atlas [ids ...]          # 1. compose each model's texture
    blender -b --factory-startup --python tools/models/texprops.py -- build [ids ...]   # 2. model it
    python tools/models/texprops.py sheet [ids ...]          # 3. review sheets of the renders
    python tools/models/texprops.py manifest                 # 4. list them for the game

The sheets (bellmourn-object-texture-maps, cut by tools/world/import_texpacks.py into patches in
art/_texlib/bellmourn-object-texture-maps/) are flat faces painted to be UV-mapped: crate sides
and lids, chest fronts with their locks, backs, ends with their handles and lids, pottery
wrapped flat, round lids and barrel heads, rims and painted bands. Each model here is built
for its patches: its faces are laid out in proportion to them, each face (or band of a turned
pot) is given one slot of the model's own texture, and the slot is filled with that patch.
Every model is one texture and one or two meshes: chests have a separate lid, its origin on
the hinge, so the game can swing it open (src/fps/props.js).

Step 1 (plain Python, PIL) writes templates/models/props/<id>/<id>_atlas.png and the slot
layout <id>_atlas.json: slots are packed in rows, each with a few pixels of its own edge
repeated round it so mipmaps don't bleed one slot into the next. Patches that wrap round a
pot or a barrel are first made to repeat left to right (a smooth correction, as the tile
cutter does) and then laid side by side as many times as they go round.

Step 2 (Blender) builds each model with bmesh, maps every face into its slot, exports
templates/models/props/<id>/<id>.glb (front facing +z in three.js, i.e. -y in Blender; the
lid as its own node at the hinge) and renders review views to art/view/texprops/.

The models (prop ids; variants are other skins on the same shape):
- crate_plank, crate_braced, crate_ironbound, crate_slatted, crate_broken  (0.8 m cubes)
- crate_long (a long, low merchant's crate)
- barrel_oak, barrel_dark (iron-hooped, staves bulging, heads let in below the chime)
- chest_rustic_{oak,red,moss,carved}: flat lids, iron bands
- chest_gilded_{walnut,red,blue,iron}: gold-trimmed, with a trimmed lid
- chest_domed_{iron,red,gothic,stone,bronze}: barrel-topped lids (the stone one a reliquary)
- jar_storage, jar_glazed, amphora, vase_painted, vase_blue, urn_worn, crock_lidded
"""
import json
import math
import os
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
LIB = os.path.join(ROOT, "art", "_texlib")
OUT = os.path.join(ROOT, "templates", "models", "props")
VIEW = os.path.join(ROOT, "art", "view", "texprops")
PAD = 4  # px of repeated edge round every slot


def P(sheet, n):
    """A patch id: sheet number 1-10, patch number in reading order."""
    names = {1: "01_crate_wood", 2: "02_crate_reinforcements", 3: "03_crate_variants", 4: "04_chest_rustic",
             5: "05_chest_ornate", 6: "06_chest_ancient", 7: "07_pottery_storage", 8: "08_pottery_decorative",
             9: "09_pottery_weathered", 10: "10_mixed_details"}
    return f"obj_{names[sheet]}_{n:02d}"


# ------------------------------------------------------------------------------- the models
# Each model: shape (the builder), dims (metres), slots {name: (w, h) px}, and its skins
# {variant: {slot: fill}}. A fill is a patch id, or (patch id, {ops}): rot (degrees, 90/180/270),
# crop (x0, y0, x1, y1 as fractions), wrap (laid side by side n times, made to repeat first),
# dark (multiply), tint (rgb multiply), flipx.
# (slots about the size the patches were painted at: the sheets' patches are 150-390 px, and a
# bigger slot would only cost memory, twice over with the normal map the game derives from it)
CRATE_SLOTS = {"side": (192, 192), "end": (192, 192), "top": (192, 192), "inner": (64, 64)}
CHEST_SLOTS = {"front": (320, 128), "back": (320, 128), "end": (160, 128), "top": (320, 176), "inner": (128, 96),
               "trim": (320, 24)}
DOMED_SLOTS = {"front": (320, 120), "back": (320, 120), "end": (160, 120), "lid": (320, 160), "inner": (128, 96)}
POT_SLOTS = {"body": (384, 192), "rim": (256, 48), "lid": (128, 128), "inner": (32, 32)}
VASE_SLOTS = {"belly": (384, 144), "shoulder": (256, 80), "neck": (256, 80), "foot": (256, 48), "inner": (32, 32)}
INNER = (P(1, 30), {"dark": 0.42})
INNER_CHEST = (P(1, 30), {"dark": 0.7})   # (inside a chest and its lid: lighter, so an open lid reads against a dark wall)
SOOT = {"dark": 0.62, "tint": (0.95, 0.92, 0.88)}   # (pots that have stood in a crypt's smoke)          # the inside of a chest or crate: bare boards, in shadow

MODELS = [
    # crates: sides, ends (the other two sides) and lid from one set of the crate sheets
    dict(id="crate_plank", frame=0.1, shape="crate", dims=(0.8, 0.8, 0.78), slots=CRATE_SLOTS, skins={
        "": {"side": P(1, 9), "end": P(1, 16), "top": P(3, 3), "inner": INNER}}),
    dict(id="crate_braced", frame=0.1, shape="crate", dims=(0.8, 0.8, 0.78), slots=CRATE_SLOTS, skins={
        "": {"side": P(1, 4), "end": P(1, 15), "top": P(1, 2), "inner": INNER}}),
    dict(id="crate_ironbound", frame=0.1, shape="crate", dims=(0.8, 0.8, 0.8), slots=CRATE_SLOTS, skins={
        "": {"side": P(2, 3), "end": P(2, 12), "top": (P(2, 1), {"desat": 0.6}), "inner": INNER}}),
    dict(id="crate_slatted", frame=0.1, shape="crate", dims=(0.8, 0.7, 0.7), slots=CRATE_SLOTS, skins={
        "": {"side": P(3, 2), "end": P(3, 4), "top": P(3, 1), "inner": INNER}}),
    dict(id="crate_broken", shape="crate", dims=(0.8, 0.8, 0.76), slots=CRATE_SLOTS, skins={
        "": {"side": P(2, 11), "end": P(2, 4), "top": P(2, 29), "inner": INNER}}),
    dict(id="crate_long", shape="crate", dims=(1.5, 0.62, 0.6), slots={"side": (384, 144), "end": (144, 144), "top": (384, 160), "inner": (64, 64)}, skins={
        "": {"side": P(3, 21), "end": P(3, 14), "top": P(3, 24), "inner": INNER}}),
    # barrels: staves (planks stood on end, wrapped round three times), heads, iron hoops
    dict(id="barrel", shape="barrel", dims=(0.36, 0.95), slots={"staves": (384, 192), "head": (160, 160), "iron": (96, 32), "inner": (64, 64)}, skins={
        "oak": {"staves": (P(10, 2), {"wrap": 3}), "head": P(10, 25), "iron": (P(10, 6), {"crop": (0, 0.3, 1, 0.7)}), "inner": INNER},
        "dark": {"staves": (P(10, 1), {"wrap": 3}), "head": P(10, 23), "iron": (P(10, 6), {"crop": (0, 0.3, 1, 0.7)}), "inner": INNER}}),
    # chests with flat lids: each row of the rustic sheet is a set (front with its lock, back, end
    # with its handle); the lid is the back's boards, turned
    dict(id="chest_rustic", shape="chest", dims=(1.0, 0.56, 0.4, 0.15), slots=CHEST_SLOTS, skins={
        "oak": {"front": P(4, 1), "back": P(4, 2), "end": P(4, 3), "top": (P(4, 5), {}), "inner": INNER_CHEST, "trim": (P(4, 2), {"crop": (0, 0, 1, 0.16)})},
        "red": {"front": P(4, 10), "back": P(4, 11), "end": P(4, 12), "top": P(4, 38), "inner": INNER_CHEST, "trim": (P(4, 11), {"crop": (0, 0, 1, 0.16)})},
        "moss": {"front": P(4, 13), "back": P(4, 14), "end": P(4, 15), "top": P(4, 41), "inner": INNER_CHEST, "trim": (P(4, 14), {"crop": (0, 0, 1, 0.16)})},
        "carved": {"front": P(4, 34), "back": P(4, 35), "end": P(4, 36), "top": P(4, 32), "inner": INNER_CHEST, "trim": (P(4, 35), {"crop": (0, 0, 1, 0.16)})}}),
    # gilded chests: a front, the lid's panel, an end, a back and a gilt trim strip
    dict(id="chest_gilded", shape="chest", dims=(1.0, 0.58, 0.42, 0.16), slots=CHEST_SLOTS, skins={
        "walnut": {"front": P(5, 1), "back": P(5, 24), "end": P(5, 16), "top": P(5, 14), "inner": INNER_CHEST, "trim": P(5, 30)},
        "red": {"front": P(5, 2), "back": P(5, 25), "end": P(5, 17), "top": P(5, 12), "inner": INNER_CHEST, "trim": P(5, 49)},
        "blue": {"front": P(5, 5), "back": P(5, 28), "end": P(5, 20), "top": P(5, 15), "inner": INNER_CHEST, "trim": P(5, 50)},
        "iron": {"front": P(5, 3), "back": P(5, 26), "end": P(5, 18), "top": P(5, 13), "inner": INNER_CHEST, "trim": P(5, 45)}}),
    # domed chests: the ancient sheet's rows are front, back/end, the lid unrolled, end with a ring
    dict(id="chest_domed", shape="domed", dims=(1.0, 0.56, 0.4, 0.17), slots=DOMED_SLOTS, skins={
        "iron": {"front": P(6, 1), "back": P(6, 2), "end": P(6, 6), "lid": P(6, 3), "inner": INNER_CHEST},
        "red": {"front": P(6, 7), "back": P(6, 8), "end": P(6, 9), "lid": P(6, 10), "inner": INNER_CHEST},
        "gothic": {"front": P(6, 12), "back": P(6, 13), "end": P(6, 15), "lid": P(6, 14), "inner": INNER_CHEST},
        "moss": {"front": P(6, 18), "back": P(6, 19), "end": P(6, 21), "lid": P(6, 20), "inner": INNER_CHEST},
        "stone": {"front": P(6, 24), "back": P(6, 25), "end": P(6, 27), "lid": P(6, 26), "inner": (P(10, 52), {"dark": 0.5})},
        "bronze": {"front": P(6, 36), "back": P(6, 40), "end": P(6, 39), "lid": P(6, 38), "inner": INNER_CHEST}}),
    # pottery, turned on a lathe: the body wrapped round (laid side by side), a rim band, a lid
    dict(id="jar_storage", shape="pot", form="jar", dims=(0.27, 0.72), slots=POT_SLOTS, skins={
        "": {"body": (P(7, 33), {"wrap": 2}), "rim": (P(10, 33), {"wrap": 1}), "lid": P(10, 30), "inner": (P(7, 1), {"dark": 0.3})},
        "sooted": {"body": (P(7, 33), {"wrap": 2, **SOOT}), "rim": (P(10, 33), {"wrap": 1, **SOOT}), "lid": (P(10, 30), SOOT), "inner": (P(7, 1), {"dark": 0.25})}}),
    dict(id="jar_glazed", shape="pot", form="jar", dims=(0.24, 0.62), slots=POT_SLOTS, skins={
        "": {"body": (P(7, 25), {"wrap": 2}), "rim": (P(10, 35), {"wrap": 1}), "lid": P(10, 29), "inner": (P(7, 25), {"dark": 0.3})}}),
    dict(id="amphora", shape="pot", form="amphora", dims=(0.24, 0.95), slots={"body": (384, 192), "neck": (256, 80), "rim": (256, 48), "inner": (32, 32)}, skins={
        "": {"body": (P(7, 9), {"wrap": 2}), "neck": (P(7, 3), {"wrap": 2, "crop": (0, 0.1, 1, 0.6)}), "rim": (P(10, 38), {"wrap": 1}), "inner": (P(7, 1), {"dark": 0.3})}}),
    dict(id="vase_painted", shape="pot", form="vase", dims=(0.2, 0.6), slots=VASE_SLOTS, skins={
        "": {"belly": (P(8, 8), {"wrap": 2}), "shoulder": (P(8, 4), {"wrap": 2}), "neck": (P(8, 21), {"wrap": 2}), "foot": (P(10, 39), {"wrap": 1}), "inner": (P(9, 3), {"dark": 0.3})}}),
    dict(id="vase_blue", shape="pot", form="vase", dims=(0.19, 0.56), slots=VASE_SLOTS, skins={
        "": {"belly": (P(10, 42), {"wrap": 2}), "shoulder": (P(8, 12), {"wrap": 2}), "neck": (P(8, 16), {"wrap": 2}), "foot": (P(10, 40), {"wrap": 1}), "inner": (P(9, 3), {"dark": 0.3})}}),
    dict(id="urn_worn", shape="pot", form="urn", dims=(0.26, 0.55), slots={"body": (384, 160), "band": (384, 80), "rim": (256, 48), "lid": (128, 128), "inner": (32, 32)}, skins={
        "": {"body": (P(9, 13), {"wrap": 2}), "band": (P(9, 2), {"wrap": 2}), "rim": (P(10, 36), {"wrap": 1}), "lid": P(10, 31), "inner": (P(9, 13), {"dark": 0.3})}}),
    dict(id="crock_lidded", shape="pot", form="crock", dims=(0.2, 0.36), slots=POT_SLOTS, skins={
        "": {"body": (P(7, 21), {"wrap": 2}), "rim": (P(10, 33), {"wrap": 1}), "lid": P(10, 28), "inner": (P(7, 21), {"dark": 0.3})},
        "sooted": {"body": (P(7, 21), {"wrap": 2, **SOOT}), "rim": (P(10, 33), {"wrap": 1, **SOOT}), "lid": (P(10, 28), SOOT), "inner": (P(7, 21), {"dark": 0.25})}}),
]


def variants(m):
    """[(prop id, skin)] for a model."""
    return [(m["id"] + (f"_{k}" if k else ""), s) for k, s in m["skins"].items()]


# ------------------------------------------------------------------------------- 1. atlases
def pack(slots):
    """Pack slots (each grown by PAD all round) into the smallest power-of-two texture (square
    or 2:1) in rows, tallest first, each slot going into the first row with room for it:
    {name: (x, y, w, h) of the slot's picture}, (W, H)."""
    items = sorted(slots.items(), key=lambda kv: (-(kv[1][1]), -(kv[1][0]), kv[0]))
    for W, H in ((256, 256), (512, 256), (512, 512), (1024, 512), (1024, 1024), (2048, 1024), (2048, 2048)):
        rows = []   # [y, height, x used]
        out, ok = {}, True
        for name, (w, h) in items:
            cw, ch = w + 2 * PAD, h + 2 * PAD
            row = next((r for r in rows if r[2] + cw <= W and ch <= r[1]), None)
            if row is None:
                y = rows[-1][0] + rows[-1][1] if rows else 0
                if cw > W or y + ch > H:
                    ok = False
                    break
                row = [y, ch, 0]
                rows.append(row)
            out[name] = (row[2] + PAD, row[0] + PAD, w, h)
            row[2] += cw
        if ok:
            return out, (W, H)
    raise ValueError("slots too big")


def atlas(ids):
    import numpy as np
    from PIL import Image
    tiles = {t["id"]: t for t in json.load(open(os.path.join(LIB, "texlib.json")))["tiles"]}

    def patch(fill, w, h):
        pid, ops = (fill, {}) if isinstance(fill, str) else fill
        im = Image.open(os.path.join(LIB, tiles[pid]["file"])).convert("RGB")
        # (the cutter leaves a pixel or two of the gutter's pink tint on some edges: trim it)
        W0, H0 = im.size
        im = im.crop((2, 2, W0 - 2, H0 - 2))
        if "crop" in ops:
            x0, y0, x1, y1 = ops["crop"]
            W0, H0 = im.size
            im = im.crop((round(x0 * W0), round(y0 * H0), round(x1 * W0), round(y1 * H0)))
        if ops.get("rot"):
            im = im.rotate(ops["rot"], expand=True)
        if ops.get("flipx"):
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        n = ops.get("wrap", 0)
        if n:
            one = im.resize((max(8, round(w / n)), h), Image.LANCZOS)
            a = np.asarray(one, np.float64)
            # make it repeat left to right: the jump across the wrap spread out as a smooth ramp
            jump = a[:, :1] - a[:, -1:]
            ramp = np.linspace(-0.5, 0.5, a.shape[1])[None, :, None]
            a = a + jump * ramp
            im = Image.fromarray(np.clip(np.concatenate([a] * n, 1), 0, 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)
        else:
            im = im.resize((w, h), Image.LANCZOS)
        a = np.asarray(im, np.float64)
        if "dark" in ops:
            a = a * ops["dark"]
        if "tint" in ops:
            a = a * np.array(ops["tint"])[None, None, :]
        if "desat" in ops:   # (toward grey: a patch with a cast in it)
            g = a.mean(2, keepdims=True)
            a = a * (1 - ops["desat"]) + g * ops["desat"]
        return a

    for m in MODELS:
        for pid, skin in variants(m):
            if ids and pid not in ids and m["id"] not in ids:
                continue
            rects, (W, H) = pack(m["slots"])
            canvas = np.zeros((H, W, 3), np.float64) + 40
            for name, (x, y, w, h) in rects.items():
                a = patch(skin[name], w, h)
                # the picture, then its edge repeated out PAD pixels all round
                big = np.pad(a, ((PAD, PAD), (PAD, PAD), (0, 0)), mode="edge")
                canvas[y - PAD:y + h + PAD, x - PAD:x + w + PAD] = big
            folder = os.path.join(OUT, pid)
            os.makedirs(folder, exist_ok=True)
            Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8)).save(os.path.join(folder, f"{pid}_atlas.png"), optimize=True)
            with open(os.path.join(folder, f"{pid}_atlas.json"), "w") as f:
                json.dump(dict(model=m["id"], shape=m["shape"], form=m.get("form"), frame=m.get("frame", 0), dims=m["dims"], size=[W, H],
                               slots={k: list(v) for k, v in rects.items()},
                               fills={k: (v if isinstance(v, str) else [v[0], v[1]]) for k, v in skin.items()}), f, indent=1)
            print(f"{pid:24} atlas {W}x{H}")


# ------------------------------------------------------------------------------- 2. Blender
def build(ids):
    import bmesh
    import bpy
    from mathutils import Vector

    def reset():
        bpy.ops.wm.read_factory_settings(use_empty=True)

    class Mesh:
        """Faces with UVs in their slot's own 0..1 square (v up), mapped into the atlas at the end."""

        def __init__(self, layout):
            self.L = layout
            self.v, self.f = [], []   # f: (vertex indices, [(u, v)], slot)

        def vert(self, p):
            self.v.append(tuple(p))
            return len(self.v) - 1

        def face(self, pts, uvs, slot):
            idx = [self.vert(p) for p in pts]
            self.f.append((idx, uvs, slot))

        def quad(self, a, b, c, d, slot, uv=((0, 0), (1, 0), (1, 1), (0, 1))):
            """a b c d counter-clockwise seen from outside; uv for each."""
            self.face([a, b, c, d], list(uv), slot)

        def to_object(self, name, smooth=False, weld=True):
            W, H = self.L["size"]
            me = bpy.data.meshes.new(name)
            bm = bmesh.new()
            vs = [bm.verts.new(p) for p in self.v]
            uvl = bm.loops.layers.uv.new("UVMap")
            for idx, uvs, slot in self.f:
                try:
                    fc = bm.faces.new([vs[i] for i in idx])
                except ValueError:
                    continue
                x, y, w, h = self.L["slots"][slot]
                for lp, (u, v) in zip(fc.loops, uvs):
                    # half a texel in, so the edge texels are never shared with the gutter
                    uu = min(max(u, 0.5 / w), 1 - 0.5 / w)
                    vv = min(max(v, 0.5 / h), 1 - 0.5 / h)
                    lp[uvl].uv = ((x + uu * w) / W, 1 - (y + (1 - vv) * h) / H)
                fc.smooth = smooth
            if weld:
                bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
            bm.normal_update()
            bm.to_mesh(me)
            bm.free()
            ob = bpy.data.objects.new(name, me)
            bpy.context.scene.collection.objects.link(ob)
            if smooth:
                me.set_sharp_from_angle(angle=math.radians(50)) if hasattr(me, "set_sharp_from_angle") else None
            return ob

    # ---- shapes ------------------------------------------------------------------------------
    # Blender axes: x right, y back (the front faces -y), z up. Origin on the floor at the middle.
    def box(M, x0, y0, z0, x1, y1, z1, slots, uvs=None):
        """An axis box: slots {front, back, left, right, top, bottom} -> slot name (or None to
        leave the face out); uvs {face: [(u, v) x4]} overrides."""
        F = {
            "front": [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)],
            "back": [(x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)],
            "left": [(x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)],
            "right": [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)],
            "top": [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
            "bottom": [(x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (x0, y0, z0)],
        }
        for k, pts in F.items():
            s = slots.get(k)
            if s:
                M.quad(*pts, s, uv=(uvs or {}).get(k, ((0, 0), (1, 0), (1, 1), (0, 1))))

    def bevel(ob, w=0.012, seg=2):
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = w
        mod.segments = seg
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
        mod.harden_normals = False

    def batten(M, o, u, v, n, r, slot, d=0.016):
        """A strip standing d proud of a face: o the face's corner, u and v its edges (vectors along
        the face, the strip's length and width), n its outward normal, r = (u0, u1, v0, v1) the part
        of the face (and of its slot's painting) the strip covers. Its front shows that part of the
        painting, its four sides a sliver of the same."""
        u0, u1, v0, v1 = r
        P = lambda a, b, h: tuple(o[i] + u[i] * a + v[i] * b + n[i] * h for i in range(3))
        q = ((u0, v0), (u1, v0), (u1, v1), (u0, v1))
        M.quad(P(u0, v0, d), P(u1, v0, d), P(u1, v1, d), P(u0, v1, d), slot, uv=q)
        M.quad(P(u0, v0, 0), P(u1, v0, 0), P(u1, v0, d), P(u0, v0, d), slot, uv=((u0, v0), (u1, v0), (u1, v0 + 0.01), (u0, v0 + 0.01)))
        M.quad(P(u1, v1, 0), P(u0, v1, 0), P(u0, v1, d), P(u1, v1, d), slot, uv=((u1, v1), (u0, v1), (u0, v1 - 0.01), (u1, v1 - 0.01)))
        M.quad(P(u0, v1, 0), P(u0, v0, 0), P(u0, v0, d), P(u0, v1, d), slot, uv=((u0, v1), (u0, v0), (u0 + 0.01, v0), (u0 + 0.01, v1)))
        M.quad(P(u1, v0, 0), P(u1, v1, 0), P(u1, v1, d), P(u1, v0, d), slot, uv=((u1, v0), (u1, v1), (u1 - 0.01, v1), (u1 - 0.01, v0)))

    def crate(L):
        W, D, H = L["dims"]
        M = Mesh(L)
        x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
        box(M, x0, y0, 0, x1, y1, H, {"front": "side", "back": "side", "left": "end", "right": "end", "top": "top", "bottom": "inner"})
        f = L.get("frame") or 0
        if f:
            # the painted frame round each side stands proud as real battens (each strip mapped
            # to the same part of the painting), so the crate's edge isn't a flat box's
            sides = [((x0, y0, 0), (W, 0, 0), (0, 0, H), (0, -1, 0), "side"), ((x1, y1, 0), (-W, 0, 0), (0, 0, H), (0, 1, 0), "side"),
                     ((x0, y1, 0), (0, -D, 0), (0, 0, H), (-1, 0, 0), "end"), ((x1, y0, 0), (0, D, 0), (0, 0, H), (1, 0, 0), "end")]
            for o, u, v, n, slot in sides:
                for r in ((0, 1, 0, f), (0, 1, 1 - f, 1), (0, f, f, 1 - f), (1 - f, 1, f, 1 - f)):
                    batten(M, o, u, v, n, r, slot)
        ob = M.to_object("body")
        bevel(ob, 0.012)
        return [ob]

    def barrel(L):
        R, H = L["dims"]
        M = Mesh(L)
        N = 24
        rings = 12
        chime = 0.035   # the staves stand this far proud of the heads

        def r_at(z):
            t = z / H
            return R * (0.82 + 0.18 * math.sin(math.pi * t))

        zs = [H * i / rings for i in range(rings + 1)]
        for i in range(rings):
            za, zb = zs[i], zs[i + 1]
            ra, rb = r_at(za), r_at(zb)
            for k in range(N):
                a0, a1 = 2 * math.pi * k / N, 2 * math.pi * (k + 1) / N
                p = lambda r, a, z: (r * math.sin(a), -r * math.cos(a), z)
                M.quad(p(ra, a0, za), p(ra, a1, za), p(rb, a1, zb), p(rb, a0, zb), "staves",
                       uv=((k / N, za / H), ((k + 1) / N, za / H), ((k + 1) / N, zb / H), (k / N, zb / H)))
        # the inside of the chime, and the heads let in below it
        for z_top, up in ((H, True), (0.0, False)):
            rr = r_at(z_top) - 0.022
            zh = z_top - chime if up else z_top + chime
            for k in range(N):
                a0, a1 = 2 * math.pi * k / N, 2 * math.pi * (k + 1) / N
                p = lambda r, a, z: (r * math.sin(a), -r * math.cos(a), z)
                ro = r_at(z_top)
                if up:
                    M.quad(p(ro, a1, z_top), p(ro, a0, z_top), p(rr, a0, z_top), p(rr, a1, z_top), "inner")
                    M.quad(p(rr, a1, zh), p(rr, a0, zh), p(rr, a0, z_top), p(rr, a1, z_top), "inner")
                    M.face([(0, 0, zh), p(rr, a0, zh), p(rr, a1, zh)],
                           [(0.5, 0.5), (0.5 + 0.48 * math.sin(a0), 0.5 - 0.48 * math.cos(a0)), (0.5 + 0.48 * math.sin(a1), 0.5 - 0.48 * math.cos(a1))], "head")
                else:
                    M.face([(0, 0, 0), p(ro, a1, 0), p(ro, a0, 0)],
                           [(0.5, 0.5), (0.5 + 0.48 * math.sin(a1), 0.5 + 0.48 * math.cos(a1)), (0.5 + 0.48 * math.sin(a0), 0.5 + 0.48 * math.cos(a0))], "head")
        body = M.to_object("body", smooth=True)
        # iron hoops: thin bands standing just proud of the staves
        M2 = Mesh(L)
        for zc in (0.07, 0.27, H - 0.27, H - 0.07):
            for k in range(N):
                a0, a1 = 2 * math.pi * k / N, 2 * math.pi * (k + 1) / N
                ra, rb = r_at(zc - 0.025) + 0.007, r_at(zc + 0.025) + 0.007
                p = lambda r, a, z: (r * math.sin(a), -r * math.cos(a), z)
                M2.quad(p(ra, a0, zc - 0.025), p(ra, a1, zc - 0.025), p(rb, a1, zc + 0.025), p(rb, a0, zc + 0.025), "iron",
                        uv=((k / N * 2 % 1, 0), ((k + 1) / N * 2 % 1 or 1, 0), ((k + 1) / N * 2 % 1 or 1, 1), (k / N * 2 % 1, 1)))
                M2.quad(p(ra - 0.007, a0, zc - 0.025), p(ra - 0.007, a1, zc - 0.025), p(ra, a1, zc - 0.025), p(ra, a0, zc - 0.025), "iron")
                M2.quad(p(rb, a0, zc + 0.025), p(rb, a1, zc + 0.025), p(rb - 0.007, a1, zc + 0.025), p(rb - 0.007, a0, zc + 0.025), "iron")
        hoops = M2.to_object("hoops", smooth=True, weld=False)
        join(body, [hoops])
        return [body]

    def join(target, others):
        bpy.ops.object.select_all(action="DESELECT")
        for o in others:
            o.select_set(True)
        target.select_set(True)
        bpy.context.view_layer.objects.active = target
        bpy.ops.object.join()

    def open_box(M, W, D, Hb, t, front_v=(0, 1), end_v=(0, 1)):
        """A chest's body: outer walls (the front, back and ends painted from their slots' lower
        parts, front_v/end_v = the part of the slot's height they take), the floor, and the
        inside: walls t thick, bare boards, open at the top."""
        x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
        fv0, fv1 = front_v
        ev0, ev1 = end_v
        q = lambda a, b: ((0, a), (1, a), (1, b), (0, b))
        box(M, x0, y0, 0, x1, y1, Hb, {"front": "front", "back": "back", "left": "end", "right": "end", "bottom": "inner"},
            uvs={"front": q(fv0, fv1), "back": q(fv0, fv1), "left": q(ev0, ev1), "right": q(ev0, ev1)})
        ix0, ix1, iy0, iy1 = x0 + t, x1 - t, y0 + t, y1 - t
        # rim
        for a, b, c, d in (((x0, y0), (x1, y0), (ix1, iy0), (ix0, iy0)), ((x1, y0), (x1, y1), (ix1, iy1), (ix1, iy0)),
                           ((x1, y1), (x0, y1), (ix0, iy1), (ix1, iy1)), ((x0, y1), (x0, y0), (ix0, iy0), (ix0, iy1))):
            M.quad((*a, Hb), (*b, Hb), (*c, Hb), (*d, Hb), "inner")
        # inner walls (facing in) and floor
        fl = 0.05
        M.quad((ix1, iy0, fl), (ix0, iy0, fl), (ix0, iy0, Hb), (ix1, iy0, Hb), "inner")
        M.quad((ix0, iy1, fl), (ix1, iy1, fl), (ix1, iy1, Hb), (ix0, iy1, Hb), "inner")
        M.quad((ix0, iy0, fl), (ix0, iy1, fl), (ix0, iy1, Hb), (ix0, iy0, Hb), "inner")
        M.quad((ix1, iy1, fl), (ix1, iy0, fl), (ix1, iy0, Hb), (ix1, iy1, Hb), "inner")
        M.quad((ix0, iy0, fl), (ix1, iy0, fl), (ix1, iy1, fl), (ix0, iy1, fl), "inner")

    def corners(M, W, D, Hb, vt=1.0):
        """Iron strips standing proud up a chest's four corners, each showing the edge of the
        painting it stands on (front or end), so the corners read as bound, not as a flat box's."""
        x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
        g = 0.055
        fu, eu = g / W, g / D
        for o, u, n, slot, r in (((x0, y0, 0), (W, 0, 0), (0, -1, 0), "front", (0, fu)), ((x0, y0, 0), (W, 0, 0), (0, -1, 0), "front", (1 - fu, 1)),
                                 ((x1, y1, 0), (-W, 0, 0), (0, 1, 0), "back", (0, fu)), ((x1, y1, 0), (-W, 0, 0), (0, 1, 0), "back", (1 - fu, 1)),
                                 ((x0, y1, 0), (0, -D, 0), (-1, 0, 0), "end", (0, eu)), ((x0, y1, 0), (0, -D, 0), (-1, 0, 0), "end", (1 - eu, 1)),
                                 ((x1, y0, 0), (0, D, 0), (1, 0, 0), "end", (0, eu)), ((x1, y0, 0), (0, D, 0), (1, 0, 0), "end", (1 - eu, 1))):
            batten(M, o, u, (0, 0, Hb / max(vt, 1e-3)), n, (r[0], r[1], 0, vt), slot, d=0.01)

    def chest(L):
        W, D, Hb, Hl = L["dims"]
        Ht = Hb + Hl
        M = Mesh(L)
        # the front's painting covers the whole closed chest: body below, lid's front above
        open_box(M, W, D, Hb, 0.035, front_v=(0, Hb / Ht), end_v=(0, Hb / Ht))
        corners(M, W, D, Hb, Hb / Ht)
        body = M.to_object("body")
        bevel(body, 0.008)
        # the lid: its own mesh, origin on the hinge (the back top edge of the body)
        o = 0.012
        Ml = Mesh(L)
        hy, hz = D / 2, Hb
        x0, x1, y0, y1 = -W / 2 - o, W / 2 + o, -D / 2 - o - hy, D / 2 + o - hy
        z0, z1 = 0.0, Hl
        q = lambda a, b: ((0, a), (1, a), (1, b), (0, b))
        box(Ml, x0, y0, z0, x1, y1, z1, {"front": "front", "back": "back", "left": "end", "right": "end", "top": "top", "bottom": "inner"},
            uvs={"front": q(Hb / Ht, 1), "back": q(Hb / Ht, 1), "left": q(Hb / Ht, 1), "right": q(Hb / Ht, 1)})
        # a trim round the lid's top edge (the gilt strip on the gilded chests, boards on the rest)
        tw, th = 0.035, 0.012
        for (xa, ya, xb, yb) in ((x0, y0, x1, y0 + tw), (x0, y1 - tw, x1, y1), (x0, y0 + tw, x0 + tw, y1 - tw), (x1 - tw, y0 + tw, x1, y1 - tw)):
            box(Ml, xa, ya, z1, xb, yb, z1 + th, {"front": "trim", "back": "trim", "left": "trim", "right": "trim", "top": "trim"})
        lid = Ml.to_object("lid")
        bevel(lid, 0.006)
        lid.location = (0, hy, hz)
        return [body, lid]

    def domed(L):
        W, D, Hb, rise = L["dims"]
        M = Mesh(L)
        open_box(M, W, D, Hb, 0.035)
        corners(M, W, D, Hb)
        body = M.to_object("body")
        bevel(body, 0.008)
        # the lid: a shallow barrel vault over the body, its ends filled, origin on the hinge
        o = 0.014
        Ml = Mesh(L)
        hy, hz = D / 2, Hb
        half = D / 2 + o
        # a circular arc through (-half, 0), (0, rise), (half, 0)
        Rc = (half * half + rise * rise) / (2 * rise)
        cz = rise - Rc
        th0 = math.asin(half / Rc)
        N = 14
        pts = []
        for i in range(N + 1):
            th = -th0 + 2 * th0 * i / N
            pts.append((Rc * math.sin(th), cz + Rc * math.cos(th)))   # (y from the middle, z)
        # arc length along, for the lid painting's v (front edge at the bottom of the slot)
        acc = [0.0]
        for i in range(N):
            acc.append(acc[-1] + math.dist(pts[i], pts[i + 1]))
        x0, x1 = -W / 2 - o, W / 2 + o
        lip = 0.03   # a band of lid standing straight up from the body before the vault
        for i in range(N):
            (ya, za), (yb, zb) = pts[i], pts[i + 1]
            va, vb = acc[i] / acc[-1], acc[i + 1] / acc[-1]
            Ml.quad((x0, ya - hy, za + lip), (x1, ya - hy, za + lip), (x1, yb - hy, zb + lip), (x0, yb - hy, zb + lip), "lid",
                    uv=((0, va), (1, va), (1, vb), (0, vb)))
        # the straight lip all round
        q = lambda a, b: ((0, a), (1, a), (1, b), (0, b))
        y0, y1 = -half - hy, half - hy
        box(Ml, x0, y0, 0, x1, y1, lip, {"front": "lid", "back": "lid", "left": "end", "right": "end", "bottom": "inner"},
            uvs={"front": q(0, 0.06), "back": q(0.94, 1), "left": q(0.88, 1), "right": q(0.88, 1)})
        # the ends: fans from the middle of the chord, painted from the top of the end slot
        for x, sgn in ((x0, -1), (x1, 1)):
            c = (x, -hy, lip)
            for i in range(N):
                (ya, za), (yb, zb) = pts[i], pts[i + 1]
                A = (x, ya - hy, za + lip)
                B = (x, yb - hy, zb + lip)
                uvf = lambda y, z: (0.5 + (y / (2 * half)) * (-sgn), 0.75 + 0.25 * (z / rise))
                if sgn < 0:
                    Ml.face([c, B, A], [uvf(0, 0), uvf(yb, zb), uvf(ya, za)], "end")
                else:
                    Ml.face([c, A, B], [uvf(0, 0), uvf(ya, za), uvf(yb, zb)], "end")
        lid = Ml.to_object("lid", smooth=True)
        lid.location = (0, hy, hz)
        return [body, lid]

    def lathe(M, prof, bands, N=28, flat=None):
        """Turn a profile [(r, z)] round the z axis. bands: [(i0, i1, slot)] spans of the profile
        (point indices) each painted from one slot, v running up the span by arc length; or, with
        flat = the radius the slot's square spans, every band projected straight down onto the
        slot (a lid: its round painting laid over it, not wrapped round it)."""
        p = lambda r, a, z: (r * math.sin(a), -r * math.cos(a), z)
        if flat:
            uv = lambda r, a: (0.5 + 0.48 * r * math.sin(a) / flat, 0.5 - 0.48 * r * math.cos(a) / flat)
            for i0, i1, slot in bands:
                for i in range(i0, i1):
                    (ra, za), (rb, zb) = prof[i], prof[i + 1]
                    for k in range(N):
                        a0, a1 = 2 * math.pi * k / N, 2 * math.pi * (k + 1) / N
                        if ra < 1e-4:
                            M.face([p(0, 0, za), p(rb, a1, zb), p(rb, a0, zb)], [uv(0, 0), uv(rb, a1), uv(rb, a0)], slot)
                        else:
                            M.quad(p(ra, a0, za), p(ra, a1, za), p(rb, a1, zb), p(rb, a0, zb), slot,
                                   uv=(uv(ra, a0), uv(ra, a1), uv(rb, a1), uv(rb, a0)))
            return
        for i0, i1, slot in bands:
            acc = [0.0]
            for i in range(i0, i1):
                acc.append(acc[-1] + math.dist(prof[i], prof[i + 1]))
            tot = acc[-1] or 1
            for i in range(i0, i1):
                (ra, za), (rb, zb) = prof[i], prof[i + 1]
                va, vb = acc[i - i0] / tot, acc[i - i0 + 1] / tot
                for k in range(N):
                    a0, a1 = 2 * math.pi * k / N, 2 * math.pi * (k + 1) / N
                    if ra < 1e-4:
                        M.face([p(0, 0, za), p(rb, a1, zb), p(rb, a0, zb)], [(k / N, va), ((k + 1) / N, vb), (k / N, vb)], slot)
                    elif rb < 1e-4:
                        M.face([p(ra, a0, za), p(ra, a1, za), p(0, 0, zb)], [(k / N, va), ((k + 1) / N, va), (k / N, vb)], slot)
                    else:
                        M.quad(p(ra, a0, za), p(ra, a1, za), p(rb, a1, zb), p(rb, a0, zb), slot,
                               uv=((k / N, va), ((k + 1) / N, va), ((k + 1) / N, vb), (k / N, vb)))

    def disc(M, r, z, slot, N=28, up=True, scale=0.48):
        p = lambda a: (r * math.sin(a), -r * math.cos(a), z)
        for k in range(N):
            a0, a1 = 2 * math.pi * k / N, 2 * math.pi * (k + 1) / N
            uv = lambda a: (0.5 + scale * math.sin(a), 0.5 - scale * math.cos(a) * (1 if up else -1))
            if up:
                M.face([(0, 0, z), p(a0), p(a1)], [(0.5, 0.5), uv(a0), uv(a1)], slot)
            else:
                M.face([(0, 0, z), p(a1), p(a0)], [(0.5, 0.5), uv(a1), uv(a0)], slot)

    def pot(L):
        R, H = L["dims"]
        form = L["form"]
        M = Mesh(L)
        s = lambda pts: [(r * R, z * H) for r, z in pts]
        lid = None
        if form in ("jar", "crock"):
            # foot, belly, shoulder, neck, rolled rim; then the inside down from the lip
            body = s([(0.0, 0.0), (0.55, 0.0), (0.62, 0.02), (0.84, 0.18), (0.98, 0.42), (1.0, 0.55), (0.9, 0.74), (0.66, 0.86), (0.56, 0.9)])
            rim = s([(0.56, 0.9), (0.6, 0.93), (0.66, 0.97), (0.63, 1.0), (0.54, 1.0)])
            insd = s([(0.54, 1.0), (0.52, 0.9), (0.45, 0.82)])
            prof = body + rim[1:] + insd[1:]
            nb = len(body) - 1
            lathe(M, prof, [(0, nb, "body"), (nb, nb + 4, "rim"), (nb + 4, nb + 6, "inner")])
            disc(M, 0.45 * R, 0.82 * H, "inner")
            # a lid sitting in the mouth, with a knob
            lp = s([(0.0, 1.06), (0.12, 1.06), (0.14, 1.04), (0.1, 1.01), (0.42, 1.0), (0.6, 0.985), (0.6, 0.97), (0.5, 0.96)])
            Mlid = Mesh(L)
            lathe(Mlid, lp, [(0, len(lp) - 1, "lid")], flat=0.6 * R)
            disc(Mlid, 0.5 * R, 0.96 * H, "inner", up=False)
            lid = Mlid.to_object("potlid", smooth=True)
        elif form == "amphora":
            body = s([(0.0, 0.0), (0.4, 0.0), (0.44, 0.025), (0.34, 0.06), (0.36, 0.1), (0.62, 0.22), (0.9, 0.38), (1.0, 0.52), (0.92, 0.64), (0.62, 0.72)])
            neck = s([(0.62, 0.72), (0.4, 0.76), (0.34, 0.82), (0.34, 0.9)])
            rim = s([(0.34, 0.9), (0.42, 0.93), (0.44, 0.97), (0.38, 1.0), (0.3, 1.0)])
            insd = s([(0.3, 1.0), (0.28, 0.9), (0.24, 0.84)])
            prof = body + neck[1:] + rim[1:] + insd[1:]
            a, b, c = len(body) - 1, len(body) - 1 + 3, len(body) - 1 + 3 + 4
            lathe(M, prof, [(0, a, "body"), (a, b, "neck"), (b, c, "rim"), (c, c + 2, "inner")])
            disc(M, 0.24 * R, 0.84 * H, "inner")
            # two handles from the shoulder up to the neck, swept round a curve
            for sgn in (-1, 1):
                ctrl = [(sgn * 0.86 * R, 0.62 * H), (sgn * 1.12 * R, 0.74 * H), (sgn * 1.0 * R, 0.86 * H), (sgn * 0.4 * R, 0.86 * H)]
                tube(M, ctrl, 0.022, "neck")
        elif form == "vase":
            foot = s([(0.0, 0.0), (0.5, 0.0), (0.52, 0.03), (0.42, 0.08)])
            belly = s([(0.42, 0.08), (0.78, 0.2), (1.0, 0.38), (0.96, 0.5)])
            shoulder = s([(0.96, 0.5), (0.74, 0.62), (0.5, 0.7)])
            neck = s([(0.5, 0.7), (0.42, 0.8), (0.48, 0.92), (0.66, 1.0), (0.58, 1.0)])
            insd = s([(0.58, 1.0), (0.4, 0.88), (0.36, 0.8)])
            prof = foot + belly[1:] + shoulder[1:] + neck[1:] + insd[1:]
            a = len(foot) - 1
            b = a + 3
            c = b + 2
            d = c + 4
            lathe(M, prof, [(0, a, "foot"), (a, b, "belly"), (b, c, "shoulder"), (c, d, "neck"), (d, d + 2, "inner")])
            disc(M, 0.36 * R, 0.8 * H, "inner")
        elif form == "urn":
            body = s([(0.0, 0.0), (0.6, 0.0), (0.66, 0.03), (0.86, 0.2), (1.0, 0.42), (0.98, 0.56)])
            band = s([(0.98, 0.56), (0.92, 0.7), (0.84, 0.82)])
            rim = s([(0.84, 0.82), (0.9, 0.86), (0.92, 0.92), (0.86, 0.94), (0.8, 0.94)])
            insd = s([(0.8, 0.94), (0.78, 0.82), (0.7, 0.7)])
            prof = body + band[1:] + rim[1:] + insd[1:]
            a, b, c = len(body) - 1, len(body) - 1 + 2, len(body) - 1 + 2 + 4
            lathe(M, prof, [(0, a, "body"), (a, b, "band"), (b, c, "rim"), (c, c + 2, "inner")])
            disc(M, 0.7 * R, 0.7 * H, "inner")
            lp = s([(0.0, 1.06), (0.1, 1.06), (0.12, 1.03), (0.08, 1.0), (0.6, 0.97), (0.86, 0.94), (0.86, 0.92), (0.78, 0.92)])
            Mlid = Mesh(L)
            lathe(Mlid, lp, [(0, len(lp) - 1, "lid")], flat=0.86 * R)
            lid = Mlid.to_object("potlid", smooth=True)
        ob = M.to_object("body", smooth=True)
        if lid:
            join(ob, [lid])
        return [ob]

    def tube(M, ctrl, r, slot, n=14, sides=8):
        """A round handle swept along a quadratic-ish curve through ctrl [(x, z)] (in the xz plane)."""
        def at(t):
            # Catmull-Rom through the control points
            k = min(len(ctrl) - 2, int(t * (len(ctrl) - 1)))
            u = t * (len(ctrl) - 1) - k
            p0 = ctrl[max(0, k - 1)]
            p1, p2 = ctrl[k], ctrl[k + 1]
            p3 = ctrl[min(len(ctrl) - 1, k + 2)]
            return tuple(0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * u + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * u * u
                                + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * u ** 3) for i in range(2))
        pts = [at(i / n) for i in range(n + 1)]
        rings = []
        for i, (x, z) in enumerate(pts):
            a = pts[max(0, i - 1)]
            b = pts[min(n, i + 1)]
            tx, tz = b[0] - a[0], b[1] - a[1]
            l = math.hypot(tx, tz) or 1
            nx, nz = -tz / l, tx / l
            ring = []
            for k in range(sides):
                a2 = 2 * math.pi * k / sides
                ring.append((x + nx * r * math.cos(a2), r * math.sin(a2), z + nz * r * math.cos(a2)))
            rings.append(ring)
        for i in range(n):
            for k in range(sides):
                k1 = (k + 1) % sides
                M.quad(rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k], slot,
                       uv=((k / sides, i / n), ((k + 1) / sides, i / n), ((k + 1) / sides, (i + 1) / n), (k / sides, (i + 1) / n)))

    SHAPES = {"crate": crate, "barrel": barrel, "chest": chest, "domed": domed, "pot": pot}

    def pieces(body, shape, dims, seed):
        """What it breaks into: a copy of the finished body given thickness (boards 2 cm, pottery
        1.2 cm) and cut along a few rough planes (a crate in levels and quarters, a barrel and a
        pot in levels and wedges round the middle), each loose piece its own object, origin at its
        middle, named piece_NN. The game throws them when the thing is smashed."""
        import random
        rnd = random.Random(seed)
        ob = body.copy()
        ob.data = body.data.copy()
        bpy.context.scene.collection.objects.link(ob)
        clay = shape == "pot"
        sol = ob.modifiers.new("solid", "SOLIDIFY")
        sol.thickness = 0.012 if clay else 0.02
        sol.offset = -1
        sol.use_even_offset = True
        apply_mods(ob)
        H = dims[1] if shape in ("barrel", "pot") else dims[2]
        tilt = lambda: (rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15))
        planes = []
        levels = (0.36, 0.7) if shape == "crate" else (0.5,)
        for f in levels:
            tx, ty = tilt()
            planes.append(((0, 0, H * (f + rnd.uniform(-0.06, 0.06))), (tx, ty, 1)))
        if shape == "crate":
            for axis in (0, 1):
                co = [0, 0, H / 2]
                co[axis] = rnd.uniform(-0.08, 0.08)
                no = [0, 0, rnd.uniform(-0.1, 0.1)]
                no[axis] = 1
                no[1 - axis] = rnd.uniform(-0.12, 0.12)
                planes.append((tuple(co), tuple(no)))
        else:
            a0 = rnd.uniform(0, math.pi)
            for k in range(3):
                a = a0 + k * math.pi / 3 + rnd.uniform(-0.2, 0.2)
                planes.append(((0, 0, H / 2), (math.cos(a), math.sin(a), rnd.uniform(-0.15, 0.15))))
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        for co, no in planes:
            res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, dist=1e-5)
            cut = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
            if cut:
                bmesh.ops.split_edges(bm, edges=cut)
        bm.to_mesh(ob.data)
        bm.free()
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.separate(type="LOOSE")
        bpy.ops.object.mode_set(mode="OBJECT")
        out = [o for o in bpy.context.selected_objects]
        # every loose bit (a board, a hoop's segment, a sherd) joined with the others on the same
        # side of every cut: one chunk to each cell the planes make, about a dozen in all
        cells = {}
        for o in out:
            c = sum((o.matrix_world @ Vector(v) for v in o.bound_box), Vector()) / 8
            sig = tuple((c - Vector(co)).dot(Vector(no)) > 0 for co, no in planes)
            cells.setdefault(sig, []).append(o)
        keep = []
        for group in cells.values():
            bpy.ops.object.select_all(action="DESELECT")
            for o in group:
                o.select_set(True)
            bpy.context.view_layer.objects.active = group[0]
            if len(group) > 1:
                bpy.ops.object.join()
            o = group[0]
            if len(o.data.polygons) < 4 or max(o.dimensions) < 0.04:
                bpy.data.objects.remove(o, do_unlink=True)
                continue
            keep.append(o)
        for i, o in enumerate(keep):
            bpy.ops.object.select_all(action="DESELECT")
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
            o.name = o.data.name = f"piece_{i:02d}"
        return keep

    # ---- material, export, review --------------------------------------------------------------
    def material(pid, img_path):
        mat = bpy.data.materials.new(pid)
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(img_path)
        tex.interpolation = "Closest"
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.85
        return mat

    def apply_mods(ob):
        bpy.context.view_layer.objects.active = ob
        for m in list(ob.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)

    def review(pid, objs, lid):
        sc = bpy.context.scene
        try:
            sc.render.engine = "BLENDER_EEVEE"
        except TypeError:
            pass
        sc.render.resolution_x, sc.render.resolution_y = 420, 420
        sc.render.film_transparent = False
        w = bpy.data.worlds.new("w")
        sc.world = w
        w.use_nodes = True
        bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
        bg.inputs[0].default_value = (0.09, 0.085, 0.08, 1)
        bg.inputs[1].default_value = 0.6
        for name, rot, energy in (("key", (0.9, 0.2, -0.6), 3.2), ("fill", (1.1, -0.3, 2.4), 1.0)):
            ld = bpy.data.lights.new(name, "SUN")
            ld.energy = energy
            lo = bpy.data.objects.new(name, ld)
            lo.rotation_euler = rot
            sc.collection.objects.link(lo)
        # a floor
        bpy.ops.mesh.primitive_plane_add(size=6)
        fl = bpy.context.active_object
        fm = bpy.data.materials.new("floor")
        fm.use_nodes = True
        next(n for n in fm.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (0.16, 0.15, 0.14, 1)
        fl.data.materials.append(fm)
        cd = bpy.data.cameras.new("cam")
        cd.lens = 50
        cam = bpy.data.objects.new("cam", cd)
        sc.collection.objects.link(cam)
        sc.camera = cam
        mn = Vector((1e9, 1e9, 1e9))
        mx = Vector((-1e9, -1e9, -1e9))
        for o in objs:
            for c in o.bound_box:
                v = o.matrix_world @ Vector(c)
                mn = Vector(map(min, mn, v))
                mx = Vector(map(max, mx, v))
        ctr = (mn + mx) / 2
        size = max(mx - mn)
        os.makedirs(VIEW, exist_ok=True)
        views = [("front", -0.55, 0.32), ("back", math.pi - 0.6, 0.3), ("high", 0.35, 0.85)]
        if lid:
            views.append(("open", -0.45, 0.55))
        for name, az, el in views:
            if name == "open":
                lid.rotation_euler = (math.radians(-100), 0, 0)
            d = size * 2.6
            cam.location = ctr + Vector((d * math.sin(az) * math.cos(el), -d * math.cos(az) * math.cos(el), d * math.sin(el)))
            cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
            sc.render.filepath = os.path.join(VIEW, f"{pid}__{name}.png")
            bpy.ops.render.render(write_still=True)
        if lid:
            lid.rotation_euler = (0, 0, 0)

    for m in MODELS:
        for pid, skin in variants(m):
            if ids and pid not in ids and m["id"] not in ids:
                continue
            folder = os.path.join(OUT, pid)
            L = json.load(open(os.path.join(folder, f"{pid}_atlas.json")))
            reset()
            objs = SHAPES[m["shape"]](L)
            mat = material(pid, os.path.join(folder, f"{pid}_atlas.png"))
            tris = 0
            for o in objs:
                apply_mods(o)
                o.data.materials.clear()
                o.data.materials.append(mat)
                o.data.calc_loop_triangles()
                tris += len(o.data.loop_triangles)
            lid = next((o for o in objs if o.name == "lid"), None)
            bits = pieces(objs[0], m["shape"], m["dims"], zlib.crc32(pid.encode())) if m["shape"] in ("crate", "barrel", "pot") else []
            bpy.ops.object.select_all(action="DESELECT")
            for o in objs + bits:
                o.select_set(True)
            bpy.ops.export_scene.gltf(filepath=os.path.join(folder, f"{pid}.glb"), export_format="GLB", use_selection=True,
                                      export_yup=True, export_apply=True, export_materials="EXPORT", export_image_format="AUTO")
            mn = [min((o.matrix_world @ Vector(c))[i] for o in objs for c in o.bound_box) for i in range(3)]
            mx = [max((o.matrix_world @ Vector(c))[i] for o in objs for c in o.bound_box) for i in range(3)]
            info = dict(id=pid, model=m["id"], shape=m["shape"], triangles=tris, texture=L["size"], pieces=len(bits),
                        size=[round(mx[0] - mn[0], 3), round(mx[2] - mn[2], 3), round(mx[1] - mn[1], 3)],
                        lid=dict(hinge=[0, round(lid.location.z, 4), round(-lid.location.y, 4)]) if lid else None,
                        fills=L["fills"])
            with open(os.path.join(folder, "info.json"), "w") as f:
                json.dump(info, f, indent=1)
            for o in bits:   # (not in the review renders)
                o.hide_render = True
            review(pid, objs, lid)
            print(f"{pid:24} {tris:5} tris  {L['size'][0]}x{L['size'][1]}")


def manifest():
    """templates/models/props/texprops.json: every model built here, for src/fps/props.js."""
    out = {}
    for m in MODELS:
        for pid, _ in variants(m):
            f = os.path.join(OUT, pid, "info.json")
            if os.path.exists(f):
                info = json.load(open(f))
                out[pid] = dict(model=m["id"], shape=m["shape"], size=info["size"], lid=bool(info.get("lid")))
    with open(os.path.join(OUT, "texprops.json"), "w") as f:
        json.dump(dict(about="Props modelled for the object texture sheets: tools/models/texprops.py", props=out), f, indent=1)
    print(f"texprops.json: {len(out)} props")


def sheet(ids):
    """One review sheet of every model's renders: art/view/texprops/_sheet.jpg."""
    from PIL import Image, ImageDraw
    rows = []
    for m in MODELS:
        for pid, _ in variants(m):
            if ids and pid not in ids and m["id"] not in ids:
                continue
            ims = [os.path.join(VIEW, f"{pid}__{v}.png") for v in ("front", "back", "high", "open")]
            rows.append((pid, [Image.open(f) for f in ims if os.path.exists(f)]))
    th = 210
    cols = 2
    W = cols * (4 * th + 8)
    Hh = ((len(rows) + cols - 1) // cols) * (th + 18)
    S = Image.new("RGB", (W, Hh), (20, 19, 18))
    d = ImageDraw.Draw(S)
    for i, (pid, ims) in enumerate(rows):
        x0, y0 = (i % cols) * (4 * th + 8), (i // cols) * (th + 18)
        d.text((x0 + 4, y0 + 2), pid, fill=(240, 220, 140))
        for k, im in enumerate(ims):
            S.paste(im.convert("RGB").resize((th, th)), (x0 + k * th, y0 + 16))
    S.save(os.path.join(VIEW, "_sheet.jpg"), quality=86)
    print("sheet:", os.path.join(VIEW, "_sheet.jpg"))


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    cmd, ids = (argv[0], set(argv[1:])) if argv else ("", set())
    if cmd == "atlas":
        atlas(ids)
    elif cmd == "build":
        build(ids)
    elif cmd == "sheet":
        sheet(ids)
    elif cmd == "manifest":
        manifest()
    else:
        print(__doc__)
