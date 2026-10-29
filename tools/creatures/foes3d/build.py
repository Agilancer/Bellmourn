"""Build Bellmourn's foes (three.js .glb) from the Quaternius character packs.

  blender -b --factory-startup --python build.py -- <src_dir> <out_dir> <variant> [static]

<src_dir> holds the packs' glTF exports, flattened into four folders (see README.md):
`outfits/` (Modular Character Outfits - Fantasy: the ranger and peasant outfits and their
parts), `base/` (Universal Base Characters: the bodies, whose heads we take), `hair/`
(the hairstyles rigged to the head bone) and `beasts/` (Bestiary: Imp.glb, Puglin.glb).

Every foe ends up on the zombies' 20-bone rig (root, hips, spine, chest, neck, head and per side
shoulder, upper_arm, forearm, hand, thigh, shin, foot) so src/fps/zombies.js's gore works on it
unchanged: wounds, severed limbs and heads, cut in half, crawling. The build:
  1. imports the chosen meshes onto one source skeleton (the packs' 65-joint humanoid), curls
     the fingers into fists (or claws) and bakes that into the mesh;
  2. reshapes the body (specs.py: limbs lengthened, torsos starved, heads gaunt, ears, jaws);
  3. folds the source skin weights onto the 20 bones (fingers into the hand, clavicle into
     shoulder, the three spine joints into spine and chest, ball into foot);
  4. adds the new parts (shapes.py: helms, cuirasses, capes, robes, hoods, hats, horns, spines,
     tails, tusks, fungus, extra eyes, claws, nails) fitted to the body and weighted to it;
  5. unwraps one atlas and paints it (paint.py): each texel either samples the pack's own
     texture through the old UVs and is re-coloured onto a Bellmourn ramp, or is painted from
     scratch for the new parts; palette-snapped, with an emissive map for eyes and runes;
  6. keys the clips (clips.py) and exports the .glb, with a `foe` JSON on the scene (per-bone
     hit radii and tip lengths, grip sockets) and a `_shell` vertex attribute marking armour and
     cloth whose inner face is not flesh.
"""
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import clips  # noqa: E402
import paint  # noqa: E402
import shapes as S  # noqa: E402
import specs  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
TEX = 1024

SIDES = ("L", "R")
RIG = ["root", "hips", "spine", "chest", "neck", "head"]
for _s in SIDES:
    RIG += [f"shoulder.{_s}", f"upper_arm.{_s}", f"forearm.{_s}", f"hand.{_s}", f"thigh.{_s}", f"shin.{_s}", f"foot.{_s}"]
PARENT = {"hips": "root", "spine": "hips", "chest": "spine", "neck": "chest", "head": "neck"}
for _s in SIDES:
    PARENT.update({f"shoulder.{_s}": "chest", f"upper_arm.{_s}": f"shoulder.{_s}", f"forearm.{_s}": f"upper_arm.{_s}",
                   f"hand.{_s}": f"forearm.{_s}", f"thigh.{_s}": "hips", f"shin.{_s}": f"thigh.{_s}", f"foot.{_s}": f"shin.{_s}"})


def qmap(name):
    """A source joint -> the rig bone its weight folds into."""
    n = name.lower()
    if n in ("root", "pelvis"):
        return "hips"
    if n in ("spine_01", "spine_02"):
        return "spine"
    if n == "spine_03":
        return "chest"
    if n == "neck_01":
        return "neck"
    if n == "head":
        return "head"
    side = "L" if n.endswith("_l") else "R" if n.endswith("_r") else None
    if side is None:
        return None
    for pre, bone in (("clavicle", "shoulder"), ("upperarm", "upper_arm"), ("lowerarm", "forearm"), ("thigh", "thigh"),
                      ("calf", "shin")):
        if n.startswith(pre):
            return f"{bone}.{side}"
    if n.startswith(("hand", "index", "middle", "ring", "pinky", "thumb")):
        return f"hand.{side}"
    if n.startswith(("foot", "ball")):
        return f"foot.{side}"
    return None


# ------------------------------------------------------------------ import

def import_parts(src, parts):
    """Import [(file, keep_regex, drop_regex), ...]; returns (meshes, source armature)."""
    import re
    meshes, arm = [], None
    for f, keep, drop in parts:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(src, f))
        new = [o for o in bpy.data.objects if o not in before]
        a = next((o for o in new if o.type == "ARMATURE"), None)
        if arm is None:
            arm = a
        others = [o for o in new if o.type == "ARMATURE" and o is not arm]
        new = [o for o in new if o.type == "MESH"]
        for o in new:
            if o.name.startswith("Icosphere") or (keep and not re.search(keep, o.name)) or (drop and re.search(drop, o.name)):
                bpy.data.objects.remove(o)
                continue
            mod = next((m for m in o.modifiers if m.type == "ARMATURE"), None) or o.modifiers.new("Armature", "ARMATURE")
            mod.object = arm
            mw = o.matrix_world.copy()
            o.parent = arm
            o.matrix_world = mw
            o["src_file"] = f
            meshes.append(o)
        for o in others:
            bpy.data.objects.remove(o)
    for o in list(bpy.data.objects):
        if o.type == "EMPTY":
            bpy.data.objects.remove(o)
    return meshes, arm


def material_image(mat):
    """The base-colour image of an imported material (and its emissive image, if any)."""
    base = emit = None
    if mat and mat.node_tree:
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)

        def img_of(sock):
            stack = [sock]
            while stack:
                s = stack.pop()
                for l in s.links:
                    n = l.from_node
                    if n.type == "TEX_IMAGE":
                        return n.image
                    stack += [i for i in n.inputs if i.is_linked]
            return None

        if bsdf:
            base = img_of(bsdf.inputs["Base Color"])
            es = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
            if es is not None:
                emit = img_of(es)
    return base, emit


# ------------------------------------------------------------------ pose the source skeleton

def rot_about(pb, axis, ang):
    bpy.context.view_layer.update()
    m = pb.matrix.copy()
    h = m.translation.copy()
    pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(ang, 4, axis) @ Matrix.Translation(-h) @ m


def curl_hands(arm, hands):
    """Close the source hands: 'fist' round a grip running forward, 'claw' half closed, 'open'."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for side, s in (("l", 1), ("r", -1)):
        how = hands["L" if side == "l" else "R"]
        if how == "open":
            continue
        k = 1.0 if how == "fist" else 0.45
        for fi, spread in (("index", 0), ("middle", 0), ("ring", 0), ("pinky", 0)):
            for j, ang in (("01", 70), ("02", 85), ("03", 60)):
                pb = arm.pose.bones.get(f"{fi}_{j}_{side}")
                if pb:
                    rot_about(pb, Vector((0, s, 0)), math.radians(ang * k))
        for j, ang in (("01", 28), ("02", 22), ("03", 20)):
            pb = arm.pose.bones.get(f"thumb_{j}_{side}")
            if pb:
                rot_about(pb, Vector((1, 0, 0)), math.radians(ang * k * 1.6))
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")


def bake_pose(meshes):
    """Bake the posed hands into the meshes and leave them unparented with identity transforms
    (their vertex groups still name the source joints)."""
    for o in meshes:
        bpy.context.view_layer.objects.active = o
        mod = next((m for m in o.modifiers if m.type == "ARMATURE"), None)
        if mod:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def cut_parts(meshes, rx, zmin):
    """Keep only what lies above zmin of the meshes matching rx (a base body down to its head)."""
    import re
    for o in meshes:
        if re.search(rx, o.name):
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < zmin], context="VERTS")
            bm.to_mesh(o.data)
            bm.free()


def mirror_parts(meshes, rx):
    """Copies of the meshes matching rx mirrored to the other side (the lone pauldron)."""
    import re
    out = []
    for o in meshes:
        if not re.search(rx, o.name):
            continue
        c = o.copy()
        c.data = o.data.copy()
        bpy.context.scene.collection.objects.link(c)
        for v in c.data.vertices:
            v.co.x = -v.co.x
        bm = bmesh.new()
        bm.from_mesh(c.data)
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        bm.to_mesh(c.data)
        bm.free()
        for g in c.vertex_groups:
            g.name = "~" + g.name
        for g in c.vertex_groups:
            n = g.name[1:]
            g.name = n[:-2] + "_r" if n.endswith("_l") else n[:-2] + "_l" if n.endswith("_r") else n
        c.name = o.name.split(".")[0]
        out.append(c)
    return out


def source_joints(arm):
    """Posed joint positions of the source skeleton (armature space = world here)."""
    bpy.context.view_layer.update()
    out = {}
    for pb in arm.pose.bones:
        out[pb.name] = (np.array(arm.matrix_world @ pb.head), np.array(arm.matrix_world @ pb.tail))
    return out


def rig_joints(Q):
    def h(n):
        return Q[n][0]

    J = {"root": (np.zeros(3), np.array([0, 0, 0.2]))}
    J["hips"] = (h("pelvis"), h("spine_01"))
    J["spine"] = (h("spine_01"), h("spine_03"))
    J["chest"] = (h("spine_03"), h("neck_01"))
    J["neck"] = (h("neck_01"), h("Head"))
    J["head"] = (h("Head"), h("Head") + np.array([0, 0, 0.2]))
    for S_, s in (("L", "l"), ("R", "r")):
        J[f"shoulder.{S_}"] = (h(f"clavicle_{s}"), h(f"upperarm_{s}"))
        J[f"upper_arm.{S_}"] = (h(f"upperarm_{s}"), h(f"lowerarm_{s}"))
        J[f"forearm.{S_}"] = (h(f"lowerarm_{s}"), h(f"hand_{s}"))
        d = S.norm(h(f"hand_{s}") - h(f"lowerarm_{s}"))
        J[f"hand.{S_}"] = (h(f"hand_{s}"), h(f"hand_{s}") + d * 0.16)
        J[f"thigh.{S_}"] = (h(f"thigh_{s}"), h(f"calf_{s}"))
        J[f"shin.{S_}"] = (h(f"calf_{s}"), h(f"foot_{s}"))
        J[f"foot.{S_}"] = (h(f"foot_{s}"), Q[f"ball_{s}"][1])
    return {k: (np.array(a, float), np.array(b, float)) for k, (a, b) in J.items()}


# ------------------------------------------------------------------ join, retarget

def join(meshes, images):
    """One mesh: per-face `part` (index into PARTS) and `srcimg` (index into images), UV0."""
    parts = []
    for o in meshes:
        me = o.data
        # keep only the first UV map, as UV0
        while len(me.uv_layers) > 1:
            me.uv_layers.remove(me.uv_layers[-1])
        if not me.uv_layers:
            me.uv_layers.new(name="UV0")
        me.uv_layers[0].name = "UV0"
        for nm in [a.name for a in me.attributes if a.name.startswith(("Col", "Attribute", "color"))]:
            try:
                me.attributes.remove(me.attributes[nm])
            except Exception:
                pass
        while me.color_attributes:
            me.color_attributes.remove(me.color_attributes[0])
        pname = o.name.split(".")[0]
        if pname not in parts:
            parts.append(pname)
        pa = me.attributes.new("part", "INT", "FACE")
        sa = me.attributes.new("srcimg", "INT", "FACE")
        ea = me.attributes.new("srcemit", "INT", "FACE")
        idx = []
        for mi, mat in enumerate(me.materials):
            base, emit = material_image(mat)
            ib = images.index(base) if base in images else (images.append(base) or len(images) - 1) if base else -1
            ie = images.index(emit) if emit in images else (images.append(emit) or len(images) - 1) if emit else -1
            idx.append((ib, ie, mat.name.split(".")[0] if mat else ""))
        pi = parts.index(pname)
        for p in me.polygons:
            ib, ie, mn = idx[p.material_index] if idx else (-1, -1, "")
            pa.data[p.index].value = pi
            sa.data[p.index].value = ib
            ea.data[p.index].value = ie
        o["mats"] = json.dumps([x[2] for x in idx])
    # material name per face is folded into the part name for the painter: "<mesh>|<material>"
    names = []
    for o in meshes:
        mats = json.loads(o["mats"])
        pname = o.name.split(".")[0]
        for mi, mn in enumerate(mats or [""]):
            key = f"{pname}|{mn}"
            if key not in names:
                names.append(key)
        me = o.data
        pa = me.attributes["part"]
        for p in me.polygons:
            mn = mats[p.material_index] if mats else ""
            pa.data[p.index].value = names.index(f"{pname}|{mn}")
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = "body"
    body.parent = None
    body.matrix_world = Matrix.Identity(4)
    body.data.materials.clear()
    return body, names


def retarget(body):
    """Fold the source joints' weights onto the 20 rig bones (normalised, at most 4 a vertex)."""
    names = {g.index: g.name for g in body.vertex_groups}
    nv = len(body.data.vertices)
    W = np.zeros((nv, len(RIG)))
    for v in body.data.vertices:
        for g in v.groups:
            b = qmap(names[g.group])
            if b:
                W[v.index, RIG.index(b)] += g.weight
    for g in list(body.vertex_groups):
        body.vertex_groups.remove(g)
    return W


def apply_weights(body, W):
    W = W.copy()
    W[:, 0] = 0                                          # nothing rides the root
    order = np.argsort(-W, 1)
    for i in range(len(W)):
        keep = order[i, :4]
        row = np.zeros(len(RIG))
        row[keep] = W[i, keep]
        W[i] = row
    s = W.sum(1, keepdims=True)
    W = np.where(s > 1e-6, W / np.maximum(s, 1e-9), 0)
    W[s[:, 0] <= 1e-6, RIG.index("hips")] = 1.0
    groups = [body.vertex_groups.new(name=n) for n in RIG]
    for j, g in enumerate(groups):
        idx = np.nonzero(W[:, j] > 1e-4)[0]
        for i in idx:
            g.add([int(i)], float(W[i, j]), "REPLACE")
    return W


def add_piece(body, W, piece, part_names, shell=1.0):
    """Append a shapes.Piece to the body mesh (its weights into W, its parts into part_names)."""
    if not piece.v:
        return W
    me = body.data
    bm = bmesh.new()
    bm.from_mesh(me)
    pa = bm.faces.layers.int.get("part")
    sa = bm.faces.layers.int.get("srcimg")
    ea = bm.faces.layers.int.get("srcemit")
    sh = bm.verts.layers.float.get("shell") or bm.verts.layers.float.new("shell")
    n0 = len(bm.verts)
    vs = [bm.verts.new(p) for p in piece.v]
    for v in vs:
        v[sh] = shell
    bm.verts.ensure_lookup_table()
    for fc, pn in zip(piece.f, piece.part):
        try:
            f = bm.faces.new([vs[i - 0] for i in fc])
        except ValueError:
            continue
        if pn not in part_names:
            part_names.append(pn)
        f[pa] = part_names.index(pn)
        f[sa] = -1
        f[ea] = -1
    bm.to_mesh(me)
    bm.free()
    add = np.zeros((len(piece.v), len(RIG)))
    for i, w in enumerate(piece.w):
        for n, x in w.items():
            add[i, RIG.index(n)] += x
    return np.vstack([W, add])


# ------------------------------------------------------------------ the new rig

def make_rig(J, name):
    arm = bpy.data.armatures.new(name + "_rig")
    ao = bpy.data.objects.new(name + "_rig", arm)
    bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode="EDIT")
    for n in RIG:
        h, t = J[n]
        eb = arm.edit_bones.new(n)
        eb.head, eb.tail = Vector(h), Vector(t)
        eb.roll = 0
        p = PARENT.get(n)
        if p:
            eb.parent = arm.edit_bones[p]
            eb.use_connect = bool(np.linalg.norm(J[p][1] - h) < 1e-4)
        eb.use_deform = n != "root"
    bpy.ops.object.mode_set(mode="OBJECT")
    return ao


def bind(body, ao):
    body.parent = ao
    m = body.modifiers.new("Armature", "ARMATURE")
    m.object = ao


def socket(ao, name, bone, pos, ydir, zdir):
    """An empty riding `bone`: the held-item frame (origin = grip, +y along the haft, +z out)."""
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    y = S.norm(ydir)
    z = S.norm(np.asarray(zdir) - y * np.dot(zdir, y))
    x = np.cross(y, z)
    M = Matrix(((x[0], y[0], z[0], pos[0]), (x[1], y[1], z[1], pos[1]), (x[2], y[2], z[2], pos[2]), (0, 0, 0, 1)))
    e.parent = ao
    e.parent_type = "BONE"
    e.parent_bone = bone
    bpy.context.view_layer.update()
    e.matrix_world = M
    e.empty_display_size = 0.1
    return e


# ------------------------------------------------------------------ attributes for the painter

def store_attrs(o, rays=24):
    me = o.data
    me.update()
    P = np.array([v.co[:] for v in me.vertices])
    N = np.array([v.normal[:] for v in me.vertices])
    for nm, arr in (("opos", P), ("onrm", N)):
        a = me.attributes.get(nm) or me.attributes.new(nm, "FLOAT_VECTOR", "POINT")
        a.data.foreach_set("vector", arr.ravel())
    bvh = BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get())
    i = np.arange(rays) + 0.5
    phi = np.arccos(1 - i / rays)
    th = math.pi * (1 + 5 ** 0.5) * i
    D = np.stack([np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)], 1)
    ao = np.ones(len(P))
    for vi in range(len(P)):
        n = Vector(N[vi])
        t1 = n.orthogonal().normalized()
        t2 = n.cross(t1)
        p = Vector(P[vi]) + n * 0.002
        hits = 0
        for d in D:
            loc, *_ = bvh.ray_cast(p, t1 * d[0] + t2 * d[1] + n * d[2], 0.2)
            hits += loc is not None
        ao[vi] = 1 - hits / rays
    a = me.attributes.get("ao") or me.attributes.new("ao", "FLOAT", "POINT")
    a.data.foreach_set("value", ao)


def unwrap(o):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    me = o.data
    uv = me.uv_layers.new(name="UV")
    me.uv_layers.active = uv
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.uv.pack_islands(margin=0.003, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def texel_data(o, W):
    """Rasterise every atlas triangle: per texel A-pose position, normal, AO, part, bone,
    source image and the source UV to sample it at."""
    me = o.data
    me.calc_loop_triangles()
    nl = len(me.loops)
    uv = np.zeros(nl * 2)
    me.uv_layers["UV"].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    uv0 = np.zeros(nl * 2)
    me.uv_layers["UV0"].data.foreach_get("uv", uv0)
    uv0 = uv0.reshape(-1, 2)

    def pt(name, n):
        a = np.zeros(len(me.vertices) * n)
        me.attributes[name].data.foreach_get("vector" if n == 3 else "value", a)
        return a.reshape(-1, n) if n > 1 else a

    P, N, A = pt("opos", 3), pt("onrm", 3), pt("ao", 1)
    nf = len(me.polygons)
    part, simg, semit = (np.zeros(nf, int) for _ in range(3))
    me.attributes["part"].data.foreach_get("value", part)
    me.attributes["srcimg"].data.foreach_get("value", simg)
    me.attributes["srcemit"].data.foreach_get("value", semit)
    dom = np.argmax(W, 1)
    out = {k: np.zeros((TEX, TEX, 3)) for k in ("pos", "nrm")}
    out["uv0"] = np.zeros((TEX, TEX, 2))
    out["ao"] = np.zeros((TEX, TEX))
    for k in ("part", "img", "emit", "bone"):
        out[k] = np.full((TEX, TEX), -1, int)
    for tri in me.loop_triangles:
        L = list(tri.loops)
        V = list(tri.vertices)
        q = uv[L] * TEX - 0.5
        x0, y0 = np.floor(q.min(0)).astype(int)
        x1, y1 = np.ceil(q.max(0)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, TEX - 1), min(y1, TEX - 1)
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        a, b, c = q
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12:
            continue
        w0 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / den
        w1 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / den
        w2 = 1 - w0 - w1
        m = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not m.any():
            continue
        Wb = np.stack([w0[m], w1[m], w2[m]], 1)
        yy, xx = gy[m], gx[m]
        pi = tri.polygon_index
        out["pos"][yy, xx] = Wb @ P[V]
        out["nrm"][yy, xx] = Wb @ N[V]
        out["ao"][yy, xx] = Wb @ A[V]
        out["uv0"][yy, xx] = Wb @ uv0[L]
        out["part"][yy, xx] = part[pi]
        out["img"][yy, xx] = simg[pi]
        out["emit"][yy, xx] = semit[pi]
        out["bone"][yy, xx] = dom[V][np.argmax(Wb, 1)]
    out["mask"] = out["part"] >= 0
    return out


def image_array(img, size=1024):
    """A source texture as a (size, size, 4) float array (row 0 = the bottom, like UVs)."""
    if img is None:
        return None
    im = img.copy()
    if im.size[0] != size:
        im.scale(size, size)
    a = np.empty(size * size * 4, np.float32)
    im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    return a.reshape(size, size, 4)


def save_png(arr, path, name):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set((arr.astype(np.float32) / 255.0).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return img


def make_material(o, rgba, glow, name):
    img = save_png(rgba, os.path.join(OUT, name + ".png"), name)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.9
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    rnd = nt.nodes.new("ShaderNodeMath")
    rnd.operation = "ROUND"
    nt.links.new(tex.outputs["Alpha"], rnd.inputs[0])
    nt.links.new(rnd.outputs[0], bsdf.inputs["Alpha"])
    if glow is not None and glow[..., :3].max() > 0:
        gimg = save_png(glow, os.path.join(OUT, name + "_glow.png"), name + "_glow")
        gt = nt.nodes.new("ShaderNodeTexImage")
        gt.image = gimg
        gt.interpolation = "Closest"
        es = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        nt.links.new(gt.outputs["Color"], es)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    mat.use_backface_culling = False
    o.data.materials.clear()
    o.data.materials.append(mat)


# ------------------------------------------------------------------ hit shapes for the game

def hit_shapes(body, W, J, names):
    """Per bone: the capsule radius that holds most of its flesh, and leaf bones' lengths
    (horns, spikes, capes, tails and the like don't count)."""
    P = np.array([v.co[:] for v in body.data.vertices])
    vp = specs.vparts(body, names)
    flesh = ~np.isin(vp, ["horn", "spike", "cape", "tabard", "tail", "claw", "cap", "stem", "nail", "hat", "hat_band"])
    dom = np.where(flesh, np.argmax(W, 1), -1)
    rad, tip = {}, {}
    for j, n in enumerate(RIG):
        if n == "root":
            continue
        sel = P[dom == j]
        if len(sel) < 8:
            continue
        a, b = J[n]
        if n in ("head",) or n.startswith(("hand", "foot")):
            d = S.norm(b - a)
            t = (sel - a) @ d
            tip[n.replace(".", "")] = round(float(np.percentile(t, 96)), 3)
            b = a + d * max(0.05, np.percentile(t, 96))
        if n == "hips":
            b = J["spine"][0]
        ab = b - a
        t = np.clip(((sel - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
        dist = np.linalg.norm(sel - (a + t[:, None] * ab), axis=1)
        rad[n.replace(".", "")] = round(float(np.clip(np.percentile(dist, 70), 0.03, 0.4)), 3)
    return rad, tip


def main():
    global OUT
    a = sys.argv[sys.argv.index("--") + 1:]
    src, OUT, variant = a[0], a[1], a[2]
    static = len(a) > 3 and a[3] == "static"
    os.makedirs(OUT, exist_ok=True)
    spec = specs.SPECS[variant]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    meshes, sarm = import_parts(src, spec["parts"])
    curl_hands(sarm, spec.get("hands", {"L": "open", "R": "open"}))
    Q = source_joints(sarm)
    bake_pose(meshes)
    for rx, z in spec.get("cut", []):
        cut_parts(meshes, rx, z)
    if spec.get("mirror"):
        meshes += mirror_parts(meshes, spec["mirror"])
    images = []
    body, part_names = join(meshes, images)
    bpy.data.objects.remove(sarm)
    W = retarget(body)
    # reshape (vertex positions and joints together)
    P = np.array([v.co[:] for v in body.data.vertices])
    J = rig_joints(Q)
    P, J = specs.reshape(spec, P, J, part_names, body)
    for v, p in zip(body.data.vertices, P):
        v.co = p
    # the new parts, fitted to the reshaped body
    for piece, shell in specs.pieces(spec, P, J, W, part_names, body, Q):
        W = add_piece(body, W, piece, part_names, shell)
    W = apply_weights(body, W)
    print("PARTS", part_names)
    store_attrs(body)
    unwrap(body)
    T = texel_data(body, W)
    T["parts"] = part_names
    T["bones"] = RIG
    T["joints"] = {k: (v[0].tolist(), v[1].tolist()) for k, v in J.items()}
    srcs = [image_array(im, 1024 if max(im.size) >= 1024 else im.size[0]) for im in images]
    rgba, glow = paint.paint(T, srcs, spec, variant, os.path.join(ROOT, "templates", "style", "bellmourn_palette.json"))
    name = spec.get("name", variant)
    make_material(body, rgba, glow, name)
    rad, tip = hit_shapes(body, W, J, part_names)
    ao = make_rig(J, name)
    bind(body, ao)
    sockets = {}
    for sk in specs.sockets(spec, J, Q):
        socket(ao, *sk)                                   # for review renders; the game reads the JSON

        def conv(v):                                      # Blender axes -> glTF / three.js axes
            return [round(float(v[0]), 4), round(float(v[2]), 4), round(float(-v[1]), 4)]

        y = S.norm(sk[3])
        z = S.norm(np.asarray(sk[4]) - y * np.dot(sk[4], y))
        sockets[sk[0]] = {"bone": sk[1].replace(".", ""), "pos": conv(sk[2]), "y": conv(y), "z": conv(z)}
    if not static:
        bpy.context.scene.render.fps = clips.FPS
        clips.bake(ao, spec["kind"], J)
    for nm in ("opos", "onrm", "ao", "part", "srcimg", "srcemit"):
        if nm in body.data.attributes:
            body.data.attributes.remove(body.data.attributes[nm])
    sh = body.data.attributes.get("shell")
    vals = np.zeros(len(body.data.vertices))
    if sh:
        sh.data.foreach_get("value", vals)
        body.data.attributes.remove(sh)
    a_ = body.data.attributes.new("_shell", "FLOAT", "POINT")
    a_.data.foreach_set("value", vals)
    body.data.uv_layers.remove(body.data.uv_layers["UV0"])
    body.name = name
    meta = {"radius": rad, "tip": tip, "sockets": sockets, "kind": spec["kind"], "height": float(J["head"][1][2]),
            "hits": clips.HITS.get(spec["kind"], {})}
    bpy.context.scene["foe"] = json.dumps(meta)
    bpy.ops.object.select_all(action="DESELECT")
    ao.select_set(True)
    body.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{name}.glb"), export_format="GLB", use_selection=True,
                              export_skins=True, export_animations=not static, export_animation_mode="ACTIONS",
                              export_anim_slide_to_zero=False, export_yup=True, export_extras=True,
                              export_attributes=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"{name}.blend"))
    print("DONE", name, len(body.data.vertices), "verts", len(body.data.polygons), "faces", json.dumps(meta))


main()
