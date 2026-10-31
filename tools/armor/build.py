"""Build an armour set for the villagers, in headless Blender.

    blender -b --factory-startup --python tools/armor/build.py -- <set> <male|female> <out_dir> [glb] [render|quick]

The set is skinned to the villagers' own `CharacterArmature` (the men's or the women's: their
bones differ), so it binds to any villager of that sex by bone name. An armoured villager keeps
only the head (V_*): the set brings its own under-layer, the slim reference body (the merchant
m10 for the men, f06 for the women) re-dressed in mail and leather, so no outfit's coat, skirt
or bedroll can poke through. The helm fits the largest of the eleven heads; the women's hair
is hidden under it.

Writes <set>_<m|f>.glb (meshes `Armor` and `Helm`) and, with `render`, preview frames (with
`quick`, just two small ones: for iterating on a set's look).
"""
import json
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector, kdtree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path[:0] = [HERE]

import pieces as PC  # noqa: E402
import retarget as RT  # noqa: E402
from sets import SETS  # noqa: E402

VILLAGERS = os.path.join(ROOT, "templates", "models", "creatures", "villagers")
GAUNTLETS = os.path.join(ROOT, "templates", "models", "gauntlets")
SWATCHES = os.path.join(ROOT, "assets", "textures", "materials")
REF = {"male": "villager_m10", "female": "villager_f06"}
PPM = 800  # swatch pixels per metre, as dress.py
HAND = ("Wrist", "Index", "Middle", "Ring", "Pinky", "Thumb")
METAL = ("steel", "gold", "mail", "bands", "scale", "bronze", "copper")


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def world_verts(o):
    M = np.array(o.matrix_world)
    V = np.array([v.co[:] for v in o.data.vertices])
    return V @ M[:3, :3].T + M[:3, 3]


def weights(o):
    """Per vertex {group name: weight}."""
    names = {g.index: g.name for g in o.vertex_groups}
    return [{names[g.group]: g.weight for g in v.groups if g.weight > 1e-4} for v in o.data.vertices]


def heaviest(W):
    return [max(w, key=w.get) if w else "Root" for w in W]


# ------------------------------------------------------------------ heads of every villager


def head_cloud(sex, cache):
    if os.path.exists(cache):
        d = np.load(cache)
        return d["pts"], d["eyes"]
    pts, eyes = [], []
    tag = "villager_f" if sex == "female" else "villager_m"
    for fn in sorted(os.listdir(VILLAGERS)):
        if not (fn.startswith(tag) and fn.endswith(".glb")):
            continue
        reset()
        for o in import_glb(os.path.join(VILLAGERS, fn)):
            if o.type != "MESH":
                continue
            if o.name.startswith("V_Head") or (sex == "male" and o.name.startswith("V_HairShell")):
                pts.append(world_verts(o))
            if o.name.startswith("V_Eyes"):
                eyes.append(world_verts(o).mean(0))
    pts, eyes = np.vstack(pts), np.mean(eyes, 0)
    np.savez(cache, pts=pts, eyes=eyes)
    return pts, eyes


# ------------------------------------------------------------------ materials and unwrapping

_tiles = {}
LIBRARY = os.path.join(ROOT, "assets", "textures", "surfaces")
SIGIL = os.path.join(ROOT, "art", "velscour", "sigil_cut.png")
LIB_PPM = 640  # library pixels per metre: a 160 px cloth tile covers 25 cm
TEXDIR = None  # where tinted swatches are written (build() sets it)


def _tinted(img, name, tint):
    """The swatch's light and dark in a new colour, its glints fading to white (as
    tools/models/autotexture.py tints a dressing)."""
    w, h = img.size
    a = np.array(img.pixels[:]).reshape(h, w, 4)[..., :3] * 255
    lum = a @ np.array([0.3, 0.59, 0.11])
    k = lum / max(lum.mean(), 1.0)
    col = k[..., None] * np.asarray(tint, float)
    s = np.clip((k - 1.15) / 0.9, 0, 1)[..., None] * 0.6
    a = np.clip(col * (1 - s) + lum[..., None] * 1.1 * s, 0, 255) / 255
    new = bpy.data.images.new(name, w, h)
    new.pixels = np.dstack([a, np.ones((h, w))]).ravel().tolist()
    new.filepath_raw = os.path.join(TEXDIR, name + ".png")
    new.file_format = "PNG"
    new.save()
    return new


def material(mid):
    """A material by id: a swatch (`burnished_steel_mid`), a library texture
    (`lib:cloth_01_coarse_sail_canvas`), either recoloured with `@rrggbb`, or `sigil` (the
    cut-out V and circle of Lord Velscour, alpha-clipped)."""
    m = bpy.data.materials.get(mid)
    if m:
        return m
    base, _, hexc = mid.partition("@")
    if base == "sigil":
        img = bpy.data.images.load(SIGIL, check_existing=True)
    elif base.startswith("lib:"):
        img = bpy.data.images.load(os.path.join(LIBRARY, base[4:] + ".png"), check_existing=True)
    else:
        img = bpy.data.images.load(os.path.join(SWATCHES, base + ".png"), check_existing=True)
    if hexc:
        img = _tinted(img, mid.replace(":", "_").replace("@", "_"),
                      [int(hexc[i:i + 2], 16) for i in (0, 2, 4)])
    ppm = LIB_PPM if base.startswith("lib:") else PPM
    _tiles[mid] = (img.size[0] / ppm, img.size[1] / ppm)
    m = bpy.data.materials.new(mid)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    metal = any(k in base for k in METAL)
    bsdf.inputs["Metallic"].default_value = 0.6 if metal else 0.0
    bsdf.inputs["Roughness"].default_value = 0.38 if metal else 0.8
    if base == "sigil":  # alpha clip (the glTF exporter reads Round as MASK)
        rnd = nt.nodes.new("ShaderNodeMath")
        rnd.operation = "ROUND"
        nt.links.new(tex.outputs["Alpha"], rnd.inputs[0])
        nt.links.new(rnd.outputs[0], bsdf.inputs["Alpha"])
        bsdf.inputs["Metallic"].default_value = 0.3
        bsdf.inputs["Roughness"].default_value = 0.5
    m.use_backface_culling = False
    return m


def tile(mat_name):
    return _tiles.get(mat_name, (0.15, 0.15))


def uv_faces(me, polys, spec, tw, th):
    """Per-loop UVs for these polygons: ('cyl', origin, axis, seam direction) or ('box',)."""
    uvl = me.uv_layers.active.data
    V = np.array([v.co[:] for v in me.vertices])
    if spec[0] == "cyl":
        o, ax, seam = (np.asarray(x, float) for x in spec[1:4])
        ax = ax / np.linalg.norm(ax)
        u = -(seam - ax * np.dot(seam, ax))
        u /= np.linalg.norm(u)
        w = np.cross(ax, u)
        q = V - o
        rr = float(np.median(np.hypot(q @ u, q @ w)))
    for p in polys:
        vs = list(p.vertices)
        P = V[vs]
        if spec[0] == "cyl":
            q = P - o
            ang = np.arctan2(q @ w, q @ u)
            if ang.max() - ang.min() > math.pi:
                ang = np.where(ang < 0, ang + 2 * math.pi, ang)
            uv = np.stack([ang * rr / tw, (q @ ax) / th], 1)
        else:
            n = np.abs(np.array(p.normal[:]))
            k = int(np.argmax(n))
            a, b = [(1, 2), (0, 2), (0, 1)][k]
            uv = np.stack([P[:, a] / tw, P[:, b] / th], 1)
        for li, (x, y) in zip(p.loop_indices, uv):
            uvl[li].uv = (float(x), float(y))


def unwrap_under(o, bones):
    """The under-layer, projected round the limb each face belongs to (as the villagers'
    clothes.py): a cylinder round the torso, each arm and leg bone, a box for the feet."""
    me = o.data
    me.uv_layers.new(name="UVMap")
    lab = heaviest(weights(o))
    yc = bones["Chest"][0][1]
    groups = {}
    for p in me.polygons:
        cnt = {}
        for i in p.vertices:
            b = lab[i]
            key = "box" if b.startswith("Foot") else next(
                (k for k in ("UpperArm", "LowerArm", "Shoulder", "UpperLeg", "LowerLeg") if b.startswith(k)), "torso")
            if key not in ("box", "torso"):
                key += b[-2:]
            cnt[key] = cnt.get(key, 0) + 1
        groups.setdefault(max(cnt, key=cnt.get), []).append(p)
    for key, polys in groups.items():
        tw, th = tile(me.materials[polys[0].material_index].name)
        if key == "box":
            spec = ("box",)
        elif key == "torso":
            spec = ("cyl", (0, yc, 0), (0, 0, 1), (0, 1, 0))
        else:
            bone = key if not key.startswith("Shoulder") else "UpperArm" + key[-2:]
            h, t = bones[bone]
            side = 1 if key.endswith(".L") else -1
            seam = (0, 0, -1) if "Arm" in bone else (-side, 0, 0)
            spec = ("cyl", h, np.subtract(t, h), seam)
        uv_faces(me, polys, spec, tw, th)


# ------------------------------------------------------------------ the reference body


def reference(sex):
    reset()
    objs = import_glb(os.path.join(VILLAGERS, REF[sex] + ".glb"))
    for o in objs:
        if o.type == "MESH" and o.parent is None:
            bpy.data.objects.remove(o)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    arm.data.pose_position = "REST"
    M = np.array(arm.matrix_world)
    bones = {b.name: ((M @ np.append(b.head_local, 1))[:3], (M @ np.append(b.tail_local, 1))[:3])
             for b in arm.data.bones}
    body = [o for o in bpy.data.objects if o.type == "MESH" and o.parent == arm
            and not o.name.startswith("V_")]
    return arm, bones, body


def link_copy(o):
    c = o.copy()
    c.data = o.data.copy()
    bpy.context.collection.objects.link(c)
    return c


def join(objs, name):
    objs = [o for o in objs if o]
    with bpy.context.temp_override(active_object=objs[0], object=objs[0], selected_objects=objs,
                                   selected_editable_objects=objs):
        bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


def underlayer(body_objs, under):
    """The reference body re-dressed: everything mail (or the set's cloth) but the boots."""
    copies = []
    for o in body_objs:
        c = link_copy(o)
        while c.data.uv_layers:  # the outfit's own UVs and colours: unwrap_under makes new ones
            c.data.uv_layers.remove(c.data.uv_layers[0])
        for a in list(c.data.color_attributes):
            c.data.color_attributes.remove(a)
        c.data.materials.clear()
        c.data.materials.append(material(under["feet"] if "Feet" in o.name else under["body"]))
        for p in c.data.polygons:
            p.material_index = 0
        copies.append(c)
    u = join(copies, "Under")
    bm = bmesh.new()
    bm.from_mesh(u.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0003)
    bm.to_mesh(u.data)
    bm.free()
    return u


def measure_hands(V, lab, bones):
    """Fingertips and finger radii (for the gauntlet), and each arm bone's girth."""
    lab = np.asarray(lab)
    vb = {}
    for s in ("L", "R"):
        for f in ("Index", "Middle", "Ring", "Pinky", "Thumb"):
            last = f"{f}3" if f == "Thumb" else f"{f}4"
            m = np.isin(lab, [f"{last}.{s}", f"{last}.{s}_end"])
            h, t = bones[f"{last}.{s}"]
            d = (t - h) / np.linalg.norm(t - h)
            vb[f"tip:{f}.{s}"] = h + d * float(((V[m] - h) @ d).max()) if m.any() else t
            rs = []
            for k in ((2, 3) if f == "Thumb" else (2, 3, 4)):
                bn = f"{f}{k}.{s}"
                mm = lab == bn
                if mm.any():
                    h, t = bones[bn]
                    d = (t - h) / np.linalg.norm(t - h)
                    q = V[mm] - h
                    rs.append(np.linalg.norm(q - np.outer(q @ d, d), axis=1).mean())
            vb[f"r:{f}.{s}"] = float(np.mean(rs))
    for n, (h, t) in bones.items():
        vb[n] = (h, t)

    def girth(bone, t):
        h, tl = bones[bone]
        L = np.linalg.norm(tl - h)
        d = (tl - h) / L
        m = lab == bone
        q = V[m] - h
        tt = (q @ d) / L
        r = np.linalg.norm(q - np.outer(q @ d, d), axis=1)
        bins = np.linspace(0, 1, 9)
        mids, rad = [], []
        for a, b in zip(bins, bins[1:]):
            mm = (tt >= a) & (tt < b)
            if mm.sum() > 5:
                mids.append((a + b) / 2)
                rad.append(np.percentile(r[mm], 50))
        return float(np.interp(t, mids, rad))
    return vb, girth


# ------------------------------------------------------------------ pieces into meshes


class Skin:
    """The under-layer's weights, read at any point by its nearest vertices."""

    def __init__(self, o):
        V = world_verts(o)
        self.W = weights(o)
        self.kd = kdtree.KDTree(len(V))
        for i, p in enumerate(V):
            self.kd.insert(p, i)
        self.kd.balance()

    def at(self, p, k=8):
        acc = {}
        for _, i, d in self.kd.find_n(Vector(p), k):
            for n, w in self.W[i].items():
                acc[n] = acc.get(n, 0) + w / (d * d + 1e-6)
        top = sorted(acc.items(), key=lambda x: -x[1])[:4]
        s = sum(w for _, w in top)
        return {n: w / s for n, w in top}


def set_weights(o, W):
    for g in list(o.vertex_groups):
        o.vertex_groups.remove(g)
    groups = {}
    for i, w in enumerate(W):
        for n, x in w.items():
            g = groups.get(n) or o.vertex_groups.new(name=n)
            groups[n] = g
            g.add([i], float(x), "REPLACE")


def rig(o, arm):
    o.parent = arm
    o.matrix_parent_inverse = Matrix.Identity(4)
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    mod = o.modifiers.new("Armature", "ARMATURE")
    mod.object = arm


def apply_mod(o, mod):
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def smooth_by_angle(o, deg=38):
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o],
                                   selected_editable_objects=[o]):
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))


def make_piece(pc, arm, skin):
    me = bpy.data.meshes.new(pc["name"])
    me.from_pydata([tuple(p) for p in pc["v"]], [], [list(f) for f in pc["f"]])
    me.validate()
    o = bpy.data.objects.new(pc["name"], me)
    bpy.context.collection.objects.link(o)
    me.materials.append(material(pc["mat"]))
    if pc.get("recalc"):  # a closed ornament: let its faces all point outward
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    # face outward (away from the unwrap axis)
    if pc["uv"][0] == "cyl":
        org, ax = np.asarray(pc["uv"][1]), np.asarray(pc["uv"][2]) / np.linalg.norm(pc["uv"][2])
        dots = []
        for p in me.polygons:
            c = np.array(p.center[:]) - org
            r = c - ax * np.dot(c, ax)
            dots.append(np.dot(np.array(p.normal[:]), r))
        if np.sum(np.sign(dots)) < 0:
            bm = bmesh.new()
            bm.from_mesh(me)
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
            bm.to_mesh(me)
            bm.free()
    if pc["solid"]:
        mod = o.modifiers.new("Solid", "SOLIDIFY")
        mod.thickness = pc["solid"]
        mod.offset = -1
        mod.use_even_offset = True
        mod.use_rim = True
        apply_mod(o, mod)
    me.uv_layers.new(name="UVMap")
    uv_faces(me, me.polygons, pc["uv"], *tile(pc["mat"]))
    for p in me.polygons:
        p.use_smooth = True
    smooth_by_angle(o, pc.get("sharp", 38))
    V = world_verts(o)
    w = pc["w"]
    if w == "body":
        W = [skin.at(p) for p in V]
    elif isinstance(w, dict) and "blend" in w:
        # rigid with `blend` above z `top`, following the body below `bottom` (a coat's skirt
        # hangs from the waist but its hem moves with the legs)
        W = []
        for p in V:
            k = float(np.clip((p[2] - w["bottom"]) / (w["top"] - w["bottom"]), 0, 1))
            k = k * k * (3 - 2 * k)
            acc = {n: x * k for n, x in w["blend"].items()}
            for n, x in skin.at(p).items():
                acc[n] = acc.get(n, 0) + x * (1 - k)
            top = sorted(acc.items(), key=lambda q: -q[1])[:4]
            t = sum(x for _, x in top)
            W.append({n: x / t for n, x in top})
    elif callable(w):
        W = [w(p) for p in V]
    else:
        W = [dict(w)] * len(V)
    set_weights(o, W)
    rig(o, arm)
    return o


def make_emblem(spec, target, arm):
    """A raised emblem laid onto a built piece: each layer's outline is filled, subdivided and
    lifted into a slab, then every vertex is cast along -n onto the target's outer surface and
    raised off it, so the emblem follows the plate's curve. It rides the target's bones."""
    from mathutils.bvhtree import BVHTree
    TV = world_verts(target)
    bvh = BVHTree.FromPolygons([Vector(p) for p in TV], [list(p.vertices) for p in target.data.polygons])
    TW = weights(target)
    kd = kdtree.KDTree(len(TV))
    for i, p in enumerate(TV):
        kd.insert(p, i)
    kd.balance()
    c, n, up, size = (np.asarray(spec[k], float) for k in ("c", "n", "up", "size"))
    up = up - n * np.dot(up, n)
    up /= np.linalg.norm(up)
    right = np.cross(up, n)
    parts = []
    for li, layer in enumerate(spec["layers"]):
        poly, mat, h0, h1 = layer[:4]
        opts = layer[4] if len(layer) > 4 else {}
        flat = h1 - h0 < 1e-6  # a decal: one alpha-clipped sheet, its UVs the image's
        bm = bmesh.new()
        vs = [bm.verts.new((x * size, y * size, 0.0)) for x, y in poly]
        face = bm.faces.new(vs)
        bmesh.ops.triangulate(bm, faces=[face], ngon_method="EAR_CLIP")
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=opts.get("cuts", 2),
                                  use_grid_fill=True)
        if not flat:
            ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
            for v in ext["geom"]:
                if isinstance(v, bmesh.types.BMVert):
                    v.co.z = 1.0
        me = bpy.data.meshes.new(f"{spec['name']} {li}")
        bm.to_mesh(me)
        bm.free()
        for v in me.vertices:
            x, y, z = v.co
            base = c + right * x + up * y
            loc, _, _, _ = bvh.ray_cast(Vector(base + n * 0.15), Vector(-n), 0.4)
            if loc is None:
                loc = bvh.find_nearest(Vector(base))[0]
            v.co = Vector(np.array(loc) + n * (h0 + (h1 - h0) * z))
        o = bpy.data.objects.new(me.name, me)
        bpy.context.collection.objects.link(o)
        me.materials.append(material(mat))
        tops = [p for p in me.polygons if np.dot(np.array(p.normal[:]), n) > 0.3]
        if len(tops) < len(me.polygons) / 4:  # cast with the other handedness: turn it outward
            bm = bmesh.new()
            bm.from_mesh(me)
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
            bm.to_mesh(me)
            bm.free()
        me.uv_layers.new(name="UVMap")
        tw, th = (size, size) if flat else tile(mat)
        uvl = me.uv_layers.active.data
        for p in me.polygons:
            for li2, vi in zip(p.loop_indices, p.vertices):
                q = np.array(me.vertices[vi].co[:]) - c
                u, v = float(q @ right / tw), float(q @ up / th)
                uvl[li2].uv = (u + 0.5, v + 0.5) if flat else (u, v)
        for p in me.polygons:
            p.use_smooth = False
        V = world_verts(o)
        set_weights(o, [TW[kd.find(p)[1]] for p in V])
        rig(o, arm)
        parts.append(o)
    return join(parts, spec["name"])


def dress_gauntlet(gm, gid, side, bind, dress, VW, vb):
    """The gauntlet in the set's swatches instead of its own painted texture, so it matches the
    rest of the armour: each face's part is read from the part map of the gauntlet's UV layout
    (gauntlet_bind.py), `dress(part name)` gives its swatch, and the faces are unwrapped again
    for tiling, round the arm bone they ride or boxed on the hand."""
    me = gm.data
    names = bind["parts"][gid]
    img = bpy.data.images.load(os.path.join(HERE, "gauntlet_parts", f"{gid}.png"))
    res = img.size[0]
    px = np.array(img.pixels[:]).reshape(res, res, -1)[:, :, 0]  # rows bottom-up, as the UVs
    uvl = me.uv_layers.active.data
    part = []
    for p in me.polygons:
        u, v = np.mean([uvl[i].uv[:] for i in p.loop_indices], 0)
        x, y = min(int(u * res), res - 1), min(int(v * res), res - 1)
        k = int(round(px[y, x] * 255))
        r = 1
        while k == 0 and r < 6:  # a face whose centre falls in the padding: its neighbours
            win = px[max(y - r, 0):y + r + 1, max(x - r, 0):x + r + 1]
            k = int(round(win.max() * 255))
            r += 1
        part.append(names[k - 1] if k else names[-1])
    bpy.data.images.remove(img)
    sws = [dress(n) for n in part]
    me.materials.clear()
    order = sorted(set(sws))
    for sw in order:
        me.materials.append(material(sw))
    for p, sw in zip(me.polygons, sws):
        p.material_index = order.index(sw)
    # each face's region: the upper arm, the forearm or the hand
    S = "." + side
    region = {}
    for p in me.polygons:
        w = {}
        for i in p.vertices:
            for n, a in VW.items():
                w[n] = w.get(n, 0) + a[i]
        top = max(w, key=w.get)
        key = top if top in ("UpperArm" + S, "LowerArm" + S) else "hand"
        region.setdefault((key, sws[p.index]), []).append(p)
    for (key, sw), polys in region.items():
        if key == "hand":
            spec = ("box",)
        else:
            h, t = vb[key]
            spec = ("cyl", h, np.subtract(t, h), (0, 0, -1))
        uv_faces(me, polys, spec, *tile(sw))


def gauntlet(gid, side, arm, bind, vb, girth, dress=None):
    """The set's gauntlet, carried onto the villager's arm (retarget.py)."""
    objs = import_glb(os.path.join(GAUNTLETS, gid, f"{gid}_{side}.glb"))
    garm = next(o for o in objs if o.type == "ARMATURE")
    gm = next(o for o in objs if o.type == "MESH" and o.parent == garm)
    for o in objs:
        if o.type == "MESH" and o.parent is None:
            bpy.data.objects.remove(o)
    P = world_verts(gm)
    Wv = weights(gm)
    bones = sorted({n for w in Wv for n in w})
    W = {b: np.array([w.get(b, 0.0) for w in Wv]) for b in bones}
    newP, VW = RT.retarget(P, W, bind, side, vb, girth)
    gm.parent = None
    gm.matrix_world = Matrix.Identity(4)
    for v, p in zip(gm.data.vertices, newP):
        v.co = Vector(p)
    with bpy.context.temp_override(object=gm, active_object=gm, selected_objects=[gm]):
        try:
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
        except RuntimeError:
            pass
    names = list(VW)
    set_weights(gm, [{n: float(VW[n][i]) for n in names if VW[n][i] > 1e-4}
                     for i in range(len(newP))])
    if dress:
        dress_gauntlet(gm, gid, side, bind, dress, VW, vb)
    bpy.data.objects.remove(garm)
    for p in gm.data.polygons:
        p.use_smooth = True
    smooth_by_angle(gm, 45)
    rig(gm, arm)
    gm.name = f"gauntlet {side}"
    return gm


# ------------------------------------------------------------------ build


def build(set_id, sex, out_dir):
    global TEXDIR
    spec = SETS[set_id]
    os.makedirs(out_dir, exist_ok=True)
    TEXDIR = os.path.join(out_dir, "tex")
    os.makedirs(TEXDIR, exist_ok=True)
    heads, eyes = head_cloud(sex, os.path.join(out_dir, f"heads_{sex}.npz"))
    arm, bones, body_objs = reference(sex)
    under = underlayer(body_objs, spec["under"])
    V = world_verts(under)
    lab = heaviest(weights(under))
    vb, girth = measure_hands(V, lab, bones)
    # the hands go: the gauntlets are the hands now
    bm = bmesh.new()
    bm.from_mesh(under.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i, n in enumerate(lab) if n.startswith(HAND)],
                     context="VERTS")
    bm.to_mesh(under.data)
    bm.free()
    if spec["under"].get("legs"):  # trousers of their own: the legs' faces in another material
        me = under.data
        me.materials.append(material(spec["under"]["legs"]))
        li = len(me.materials) - 1
        lab_now = heaviest(weights(under))
        for p in me.polygons:
            legs = sum(lab_now[i].startswith(("UpperLeg", "LowerLeg")) for i in p.vertices)
            if legs * 2 > len(p.vertices) and me.materials[p.material_index].name == spec["under"]["body"]:
                p.material_index = li
    unwrap_under(under, bones)
    V = world_verts(under)
    lab = heaviest(weights(under))
    body = PC.Body(V, lab, bones, heads, eyes)
    skin = Skin(under)

    armor, helm, made = [under], [], {}
    pcs = spec["build"](body)
    for pc in pcs:
        if pc.get("kind") == "emblem":
            continue
        o = make_piece(pc, arm, skin)
        made[pc["name"]] = o
        (helm if pc["group"] == "helm" else armor).append(o)
    with open(os.path.join(HERE, "gauntlet_bind.json")) as fh:
        bind = json.load(fh)
    gl = [gauntlet(spec["gauntlet"], s, arm, bind, vb, girth, spec.get("gauntlet_dress"))
          for s in ("L", "R")]
    if not spec.get("gauntlet_dress"):  # its own painted texture, shared by both hands
        shared = gl[0].data.materials[0]
        shared.name = f"{spec['gauntlet']}_gauntlet"
        gl[1].data.materials[0] = shared
    armor += gl
    made.update({o.name: o for o in gl})
    for pc in pcs:
        if pc.get("kind") == "emblem":
            o = make_emblem(pc, made[pc["target"]], arm)
            (helm if pc["group"] == "helm" else armor).append(o)
    A = join(armor, "Armor")
    H = join(helm, "Helm") if helm else None
    return arm, A, H, body_objs


def export(arm, objs, path):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in [arm] + objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                              export_animations=False, export_skins=True, export_apply=False)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    set_id, sex, out_dir = argv[:3]
    stages = argv[3:] or ["glb", "render"]
    arm, A, H, body_objs = build(set_id, sex, out_dir)
    tag = "m" if sex == "male" else "f"
    if "glb" in stages:
        export(arm, [A] + ([H] if H else []), os.path.join(out_dir, f"{set_id}_{tag}.glb"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, f"{set_id}_{tag}.blend"))
    if "render" in stages or "quick" in stages:
        import render
        render.shots(arm, A, H, body_objs, os.path.join(out_dir, f"{set_id}_{tag}"),
                     quick="quick" in stages)


if __name__ == "__main__":
    main()
