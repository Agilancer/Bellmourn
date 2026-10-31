"""Build the 3D zombies (three.js .glb) from the Poly Pizza low-poly characters.

Run headless:
  blender -b --factory-startup --python build.py -- <bundle_dir> <out_dir> <variant a-g> [rigcheck]

<bundle_dir> is the "Low Poly Characters Bundle" folder. Each source is one welded mesh in an
A-pose with no rig or texture: the warrior (a crested helmet; variants a, b, c), the female
fighter (crop top, shorts, ponytail; d, e) and the male fighter (shirt and shorts; f, g). This:
  1. scales it to Bellmourn metres (feet on the ground, facing -Y) and cuts the head (and
     helmet, crest or ponytail) off at the chin, closing the neck;
  2. starves the body (thinner limbs, sunken belly, sloped shoulders, thin neck);
  3. models a new bald zombie head (sunken eye sockets, collapsed nose, hollow cheeks, an open
     hanging jaw, crooked teeth, eyes, stringy hair);
  4. rigs it with a humanoid skeleton (automatic weights; the head is rigid on `head`);
  5. stores the A-pose position/normal, head coordinates, part id and ambient occlusion on the
     mesh, unwraps it and paints a palette-locked texture from them (paint.py);
  6. straightens the arms into a T-pose, makes that the rest pose, keys the clips in anims.py
     and exports the .glb.
Every region rule (here and in paint.py) is written in the warrior's heights; the fighters are
read through MARKS, which maps their landmarks onto his.
"""
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import anims  # noqa: E402
import paint  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
TEX = 512

# part ids (face attribute "part")
BODY, HEAD, TEETH, EYE, HAIR = 0, 1, 2, 3, 4

# landmark heights (ground, ankle, knee, hip, shoulder, chin, crown) in the warrior's metres
WARRIOR_MARKS = [0, 0.1, 0.5, 0.92, 1.33, 1.455, 1.7]
FILES = {"warrior": "Warrior/warrior_03.fbx", "female": "Female Fighter/female_fighter_01.fbx",
         "male": "Male Fighter/male_fighter_03.fbx"}
# A-pose joints, left side (+X is the zombie's left, -Y is forward); .R mirrors .L
SOURCES = {
    "warrior": dict(
        height=1.8, neck_cut=1.455, head_c=(0.0, -0.045, 1.525), head_r=(0.088, 0.106, 0.121),
        neck=(1.36, 0.19, 0.068), skirt=True, marks=WARRIOR_MARKS, joints={
            "hips": ((0, 0, 0.92), (0, 0, 1.04), "root"),
            "spine": ((0, 0, 1.04), (0, 0, 1.2), "hips"),
            "chest": ((0, 0, 1.2), (0, -0.01, 1.38), "spine"),
            "neck": ((0, -0.01, 1.38), (0, -0.03, 1.47), "chest"),
            "head": ((0, -0.03, 1.47), (0, -0.03, 1.7), "neck"),
            "shoulder.L": ((0.03, 0, 1.36), (0.16, 0.0, 1.33), "chest"),
            "upper_arm.L": ((0.16, 0.0, 1.33), (0.31, -0.01, 1.16), "shoulder.L"),
            "forearm.L": ((0.31, -0.01, 1.16), (0.42, -0.09, 1.06), "upper_arm.L"),
            "hand.L": ((0.42, -0.09, 1.06), (0.52, -0.32, 0.93), "forearm.L"),
            "thigh.L": ((0.09, 0, 0.92), (0.15, 0.0, 0.5), "hips"),
            "shin.L": ((0.15, 0, 0.5), (0.195, 0.0, 0.1), "thigh.L"),
            "foot.L": ((0.195, 0, 0.1), (0.2, -0.17, 0.02), "shin.L"),
        }),
    "female": dict(
        height=1.8, neck_cut=1.6, head_c=(0.0, -0.05, 1.69), head_r=(0.084, 0.102, 0.117),
        neck=(1.46, 0.2, 0.062), skirt=False, marks=[0, 0.1, 0.48, 0.93, 1.46, 1.6, 1.84], joints={
            "hips": ((0, 0, 0.93), (0, 0, 1.06), "root"),
            "spine": ((0, 0, 1.06), (0, 0, 1.24), "hips"),
            "chest": ((0, 0, 1.24), (0, -0.01, 1.47), "spine"),
            "neck": ((0, -0.01, 1.47), (0, -0.03, 1.6), "chest"),
            "head": ((0, -0.03, 1.6), (0, -0.03, 1.84), "neck"),
            "shoulder.L": ((0.04, 0, 1.46), (0.17, 0.0, 1.45), "chest"),
            "upper_arm.L": ((0.17, 0.0, 1.45), (0.31, -0.01, 1.28), "shoulder.L"),
            "forearm.L": ((0.31, -0.01, 1.28), (0.43, -0.08, 1.17), "upper_arm.L"),
            "hand.L": ((0.43, -0.08, 1.17), (0.53, -0.32, 1.02), "forearm.L"),
            "thigh.L": ((0.1, 0, 0.93), (0.145, -0.02, 0.48), "hips"),
            "shin.L": ((0.145, -0.02, 0.48), (0.19, -0.02, 0.1), "thigh.L"),
            "foot.L": ((0.19, -0.02, 0.1), (0.2, -0.2, 0.02), "shin.L"),
        }),
    "male": dict(
        height=1.8, neck_cut=1.6, head_c=(0.0, -0.05, 1.695), head_r=(0.09, 0.108, 0.122),
        neck=(1.46, 0.2, 0.07), skirt=False, marks=[0, 0.1, 0.48, 0.94, 1.46, 1.6, 1.84], joints={
            "hips": ((0, 0, 0.94), (0, 0, 1.07), "root"),
            "spine": ((0, 0, 1.07), (0, 0, 1.25), "hips"),
            "chest": ((0, 0, 1.25), (0, -0.01, 1.47), "spine"),
            "neck": ((0, -0.01, 1.47), (0, -0.03, 1.6), "chest"),
            "head": ((0, -0.03, 1.6), (0, -0.03, 1.84), "neck"),
            "shoulder.L": ((0.04, 0, 1.46), (0.18, 0.0, 1.45), "chest"),
            "upper_arm.L": ((0.18, 0.0, 1.45), (0.32, -0.01, 1.28), "shoulder.L"),
            "forearm.L": ((0.32, -0.01, 1.28), (0.43, -0.07, 1.18), "upper_arm.L"),
            "hand.L": ((0.43, -0.07, 1.18), (0.54, -0.35, 1.04), "forearm.L"),
            "thigh.L": ((0.1, 0, 0.94), (0.16, -0.01, 0.48), "hips"),
            "shin.L": ((0.16, -0.01, 0.48), (0.21, -0.01, 0.1), "thigh.L"),
            "foot.L": ((0.21, -0.01, 0.1), (0.215, -0.2, 0.02), "shin.L"),
        }),
}
VARIANTS = {"a": ("warrior", 11), "b": ("warrior", 23), "c": ("warrior", 37),
            "d": ("female", 41), "e": ("female", 53), "f": ("male", 61), "g": ("male", 71)}
HAIR_SPEC = {"a": (7, 0.06, 0.13), "b": (12, 0.06, 0.13), "c": (4, 0.06, 0.13), "d": (18, 0.12, 0.26),
             "e": (26, 0.14, 0.32), "f": (6, 0.05, 0.1), "g": (0, 0, 0)}   # strands, length range


def configure(source):
    """Point the module-level settings at one source body."""
    global SRC, HEIGHT, NECK_CUT, HEAD_C, HEAD_R, J, BONES
    SRC = SOURCES[source]
    HEIGHT, NECK_CUT = SRC["height"], SRC["neck_cut"]
    HEAD_C, HEAD_R = Vector(SRC["head_c"]), SRC["head_r"]
    J = {"root": ((0, 0, 0), (0, 0, 0.2), None)}
    J.update(SRC["joints"])
    for k in [k for k in J if k.endswith(".L")]:
        h, t, p = J[k]
        J[k[:-2] + ".R"] = ((-h[0], h[1], h[2]), (-t[0], t[1], t[2]), p[:-2] + ".R" if p.endswith(".L") else p)
    BONES = list(J)


def zn(z):
    """A height on this body -> the same place on the warrior."""
    return np.interp(z, SRC["marks"], WARRIOR_MARKS)


configure("warrior")


def load(fbx):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx)
    o = [o for o in bpy.data.objects if o.type == "MESH"][0]
    o.animation_data_clear()           # some carry baked object animations
    for x in list(bpy.data.objects):
        if x is not o:
            bpy.data.objects.remove(x)
    o.name = "zombie"
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    zs = [v.co.z for v in o.data.vertices]
    k = HEIGHT / (max(zs) - min(zs))
    for v in o.data.vertices:
        v.co *= k
    o.data.materials.clear()
    while o.data.uv_layers:
        o.data.uv_layers.remove(o.data.uv_layers[0])
    return o


def cut_helmet(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > NECK_CUT], context="VERTS")
    # close the collar opening the cut leaves; the head brings its own neck
    rim = [e for e in bm.edges if e.is_boundary and min(v.co.z for v in e.verts) > NECK_CUT - 0.16]
    bmesh.ops.holes_fill(bm, edges=rim, sides=0)
    other = [e for e in bm.edges if e.is_boundary]
    print("BOUNDARY edges left", len(other))
    bm.to_mesh(o.data)
    bm.free()


def seg(p, a, b):
    a, b = np.array(a), np.array(b)
    d = b - a
    t = np.clip(((p - a) @ d) / (d @ d), 0, 1)
    c = a + t[:, None] * d
    return t, np.linalg.norm(p - c, axis=1), c


def starve(o):
    """Thin limbs, waist and neck toward their bones."""
    P = np.array([v.co[:] for v in o.data.vertices])
    limbs = {  # bone: (squeeze, t where it starts, extra test)
        "upper_arm": (0.8, 0.0), "forearm": (0.78, 0.0), "hand": (0.92, 0.0),
        "thigh": (0.84, 0.55), "shin": (0.8, 0.0), "foot": (0.88, 0.0),
    }
    best = np.full(len(P), 9.0)
    out = P.copy()
    for side in "LR":
        for name, (k, t0) in limbs.items():
            h, t, _ = J[f"{name}.{side}"]
            tt, d, c = seg(P, h, t)
            m = (d < best) & (d < 0.085)
            if name == "thigh" and SRC["skirt"]:
                m &= P[:, 2] < 0.62          # the tunic skirt keeps its width
            if name in ("upper_arm", "forearm", "hand"):
                m &= np.abs(P[:, 0]) > 0.15
            w = np.clip((tt - t0) / 0.15, 0, 1) if t0 else np.ones(len(P))
            kk = 1 - (1 - k) * w
            new = c + (P - c) * kk[:, None]
            out[m] = new[m]
            best[m] = d[m]
    # a sunken belly
    z = zn(P[:, 2])
    torso = (np.abs(P[:, 0]) < 0.17)
    w = np.clip(1 - np.abs(z - 1.09) / 0.12, 0, 1) * torso
    out[:, 1] += 0.02 * w * (P[:, 1] < -0.02)
    # trapezius: slope the shoulders up into the neck
    tr = (z > 1.28) & (np.abs(P[:, 0]) < 0.2) & (np.abs(P[:, 1]) < 0.12)
    out[tr, 2] += (0.05 * np.clip(1 - np.abs(P[:, 0]) / 0.2, 0, 1) * np.clip((z - 1.28) / 0.1, 0, 1))[tr]
    # neck
    nk = (z > 1.40) & (np.abs(P[:, 0]) < 0.1)
    out[nk, 0] *= 0.8
    out[nk, 1] = -0.03 + (out[nk, 1] + 0.03) * 0.85
    for v, q in zip(o.data.vertices, out):
        v.co = q


# ---------------------------------------------------------------- head

def head_shape(u):
    """Unit directions (x side, f forward, z up) -> head-local points."""
    u = np.asarray(u, float)
    x, f, z = u[:, 0].copy(), u[:, 1].copy(), u[:, 2].copy()
    back = np.clip(-f, 0, 1) * np.clip(z + 0.3, 0, 1)
    f = f * (1 + 0.22 * back)                                    # cranium bulges back
    x = x * (1 + 0.1 * np.clip(z, 0, 1))                         # wide skull cap
    f = np.where(f > 0.55, 0.55 + (f - 0.55) * 0.55, f)          # flat face
    j = np.clip((-z - 0.15) / 0.85, 0, 1)
    x = x * (1 - 0.4 * j)                                        # narrow jaw
    f = f + 0.12 * j * np.clip(f + 0.3, 0, 1)                    # chin juts
    z = z - 0.32 * j * np.clip(f, 0, 1)                          # jaw hangs open
    pos = np.stack([x * HEAD_R[0], f * HEAD_R[1], z * HEAD_R[2]], 1)

    def bump(c, r, amt):
        d = np.linalg.norm(u - np.array(c), axis=1)
        return np.clip(1 - d / r, 0, 1) ** 2 * amt

    ins = sum(bump((s * 0.36, 0.86, 0.17), 0.33, 0.32) for s in (1, -1))       # eye sockets
    ins = ins + sum(bump((s * 0.62, 0.6, -0.3), 0.42, 0.22) for s in (1, -1))  # cheeks
    ins = ins + bump((0, 0.97, -0.06), 0.2, 0.14)                             # nose
    ins = ins + bump((0, 0.82, -0.47), 0.34, 0.2)                             # mouth
    ins = ins + sum(bump((s * 0.75, -0.1, 0.35), 0.4, 0.06) for s in (1, -1))   # temples
    out = sum(bump((s * 0.33, 0.82, 0.4), 0.3, 0.13) for s in (1, -1))        # brow ridge
    out = out + sum(bump((s * 0.74, 0.58, -0.02), 0.26, 0.12) for s in (1, -1))  # cheekbones
    out = out + sum(bump((s * 0.99, -0.05, 0.02), 0.2, 0.16) for s in (1, -1))  # ears
    out = out + bump((0, 0.1, 1.0), 0.6, 0.04)
    return pos * (1 - ins + out)[:, None]


def to_world(p):
    """Head-local (x, f, z) -> world, tipped forward a little."""
    a = math.radians(12)
    x, f, z = p[:, 0], p[:, 1], p[:, 2]
    f2 = f * math.cos(a) - z * math.sin(a)
    z2 = f * math.sin(a) + z * math.cos(a)
    return np.stack([x + HEAD_C.x, -f2 + HEAD_C.y, z2 + HEAD_C.z], 1)


def nrm(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def make_head(variant, seed):
    rng = np.random.default_rng(seed)
    bm = bmesh.new()
    part = bm.faces.layers.int.new("part")
    hu = bm.verts.layers.float_vector.new("hu")

    def add(verts_world, faces, pid, hus=None):
        vs = [bm.verts.new(p) for p in verts_world]
        for i, v in enumerate(vs):
            v[hu] = hus[i] if hus is not None else (0, 0, 0)
        for fc in faces:
            try:
                f = bm.faces.new([vs[i] for i in fc])
                f[part] = pid
            except ValueError:
                pass

    # skull
    tmp = bmesh.new()
    bmesh.ops.create_uvsphere(tmp, u_segments=28, v_segments=18, radius=1.0)
    U = nrm([[v.co.x, v.co.y, v.co.z] for v in tmp.verts])
    tmp.verts.index_update()
    faces = [[v.index for v in f.verts] for f in tmp.faces]
    tmp.free()
    add(to_world(head_shape(U)), faces, HEAD, [tuple(u) for u in U])

    # eyes, sitting in the sockets
    for s in (1, -1):
        c = head_shape(nrm([[s * 0.36, 0.86, 0.17]]))[0] + np.array([0, -0.002, -0.002])
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=8, v_segments=6, radius=0.0105)
        pts = np.array([v.co[:] for v in tmp.verts]) * np.array([1, 0.7, 0.9]) + c
        tmp.verts.index_update()
        add(to_world(pts), [[v.index for v in f.verts] for f in tmp.faces], EYE)
        tmp.free()

    # crooked teeth along the open mouth
    def tooth(c, up, w, h, tilt):
        ca, sa = math.cos(tilt), math.sin(tilt)
        pts = []
        for dz in (0, 1):
            for dx in (-1, 1):
                for df in (-1, 1):
                    xx = dx * w / 2 * (0.7 if dz else 1)
                    zz = (dz * h) * (-1 if up else 1)
                    pts.append([c[0] + xx * ca - zz * sa, c[1] + df * 0.004, c[2] + xx * sa + zz * ca])
        quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
        add(to_world(np.array(pts)), quads, TEETH)

    for row, zz, up in (("upper", -0.33, True), ("lower", -0.66, False)):
        angles = np.linspace(-0.55, 0.55, 7 if up else 6)
        for i, a in enumerate(angles):
            if rng.random() < 0.18:
                continue                                   # a missing tooth
            u = nrm([[math.sin(a), math.cos(a), zz]])
            c = head_shape(u)[0] * 0.9
            tooth(c, up, rng.uniform(0.009, 0.013), rng.uniform(0.012, 0.022), rng.uniform(-0.3, 0.3))

    # stringy hair
    nh, l0, l1 = HAIR_SPEC[variant]
    for i in range(nh):
        a = rng.uniform(0.6, 2.9) * (1 if i % 2 else -1)   # around the sides and back
        el = rng.uniform(0.15, 0.6 if l1 < 0.2 else 0.85)
        u = nrm([[math.sin(a), math.cos(a) * 0.8 - 0.3, el]])[0]
        p0 = head_shape(u[None])[0] * 1.01
        out = nrm([[p0[0], min(p0[1], 0) * 0.5, 0]])[0]
        L = rng.uniform(l0, l1)
        pts, qs = [], []
        side = np.array([-out[1], out[0], 0]) if abs(out[0]) < 0.99 else np.array([0, 1, 0])
        n = 4 if L < 0.15 else 6
        for k in range(n + 1):
            t = k / n
            c = p0 + out * (0.012 * math.sin(t * 2.5)) + np.array([0, 0, -L * t]) + rng.normal(0, 0.003, 3)
            w = 0.006 * (1 - t * 0.8)
            pts += [c - side * w, c + side * w]
        for k in range(n):
            qs.append([2 * k, 2 * k + 1, 2 * k + 3, 2 * k + 2])
        add(to_world(np.array(pts)), qs, HAIR)

    # the neck: a tube from inside the collar up into the skull, leaning forward
    ring, rows = 10, 5
    neck_rows = []
    for r in range(rows):
        t = r / (rows - 1)
        z0, length, r0 = SRC["neck"]
        c = np.array([0, -0.005 - 0.04 * t, z0 + length * t])
        rad = r0 - 0.02 * t
        neck_rows.append([(c[0] + rad * 0.95 * math.cos(2 * math.pi * k / ring),
                           c[1] + rad * math.sin(2 * math.pi * k / ring), c[2]) for k in range(ring)])
    pts = [p for row in neck_rows for p in row]
    qs = [[r * ring + k, r * ring + (k + 1) % ring, (r + 1) * ring + (k + 1) % ring, (r + 1) * ring + k]
          for r in range(rows - 1) for k in range(ring)]
    n0 = len(bm.verts)
    add(pts, qs, BODY)

    # to_world() mirrors the forward axis, which turns the faces inside out: point them outward
    bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f[part] != HAIR])
    me = bpy.data.meshes.new("head")
    bm.to_mesh(me)
    bm.free()
    ho = bpy.data.objects.new("head", me)
    bpy.context.scene.collection.objects.link(ho)
    for g in ("chest", "neck", "head"):
        ho.vertex_groups.new(name=g)
    nv = set(range(n0, n0 + ring * rows))
    ho.vertex_groups["head"].add([i for i in range(len(me.vertices)) if i not in nv], 1.0, "REPLACE")
    wts = [(0.6, 0.4, 0), (0, 1, 0), (0, 0.8, 0.2), (0, 0.4, 0.6), (0, 0, 1)]
    for r in range(rows):
        for gname, w in zip(("chest", "neck", "head"), wts[r]):
            if w:
                ho.vertex_groups[gname].add([n0 + r * ring + k for k in range(ring)], w, "REPLACE")
    return ho


# ---------------------------------------------------------------- rig

def make_rig():
    arm = bpy.data.armatures.new("zombie_rig")
    ao = bpy.data.objects.new("zombie_rig", arm)
    bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode="EDIT")
    for name in BONES:
        h, t, p = J[name]
        eb = arm.edit_bones.new(name)
        eb.head, eb.tail = h, t
        eb.roll = 0
        if p:
            eb.parent = arm.edit_bones[p]
            eb.use_connect = (Vector(J[p][1]) - Vector(h)).length < 1e-4
        eb.use_deform = name != "root"
    bpy.ops.object.mode_set(mode="OBJECT")
    return ao


def skin(body, ao):
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    ao.select_set(True)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    un = sum(1 for v in body.data.vertices if not any(g.weight > 0 for g in v.groups))
    print("UNWEIGHTED verts", un)


def tpose(body, ao):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = ao
    ao.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    for side, s in (("L", 1), ("R", -1)):
        for b in ("upper_arm", "forearm", "hand"):
            pb = ao.pose.bones[f"{b}.{side}"]
            bpy.context.view_layer.update()
            q = (pb.tail - pb.head).rotation_difference(Vector((s, 0, 0)))
            m = pb.matrix.copy()
            loc = m.translation.copy()
            r = q.to_matrix().to_4x4() @ m
            r.translation = loc
            pb.matrix = r
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = body
    mod = next(m for m in body.modifiers if m.type == "ARMATURE")
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    m = body.modifiers.new("Armature", "ARMATURE")
    m.object = ao


# ---------------------------------------------------------------- attributes, uv, paint

def store_attrs(o):
    me = o.data
    me.update()
    P = np.array([v.co[:] for v in me.vertices])
    N = np.array([v.normal[:] for v in me.vertices])
    a = me.attributes.get("opos") or me.attributes.new("opos", "FLOAT_VECTOR", "POINT")
    a.data.foreach_set("vector", P.ravel())
    a = me.attributes.get("onrm") or me.attributes.new("onrm", "FLOAT_VECTOR", "POINT")
    a.data.foreach_set("vector", N.ravel())
    # ambient occlusion by ray casts (A-pose)
    bvh = BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get())
    k = 32
    i = np.arange(k) + 0.5
    phi = np.arccos(1 - i / k)
    th = math.pi * (1 + 5 ** 0.5) * i
    D = np.stack([np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)], 1)
    ao = np.ones(len(P))
    for vi, (p, n) in enumerate(zip(P, N)):
        n = Vector(n)
        t1 = n.orthogonal().normalized()
        t2 = n.cross(t1)
        hits = 0
        for d in D:
            dv = t1 * d[0] + t2 * d[1] + n * d[2]
            loc, *_ = bvh.ray_cast(Vector(p) + n * 0.002, dv, 0.22)
            hits += loc is not None
        ao[vi] = 1 - hits / k
    a = me.attributes.get("ao") or me.attributes.new("ao", "FLOAT", "POINT")
    a.data.foreach_set("value", ao)


def dominant_bone(o):
    names = {g.index: g.name for g in o.vertex_groups}
    dom = np.zeros(len(o.data.vertices), int)
    for v in o.data.vertices:
        if v.groups:
            g = max(v.groups, key=lambda g: g.weight)
            dom[v.index] = BONES.index(names[g.group]) if names[g.group] in BONES else 0
    return dom


def unwrap(o):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    o.data.uv_layers.new(name="UV")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
    bm = bmesh.from_edit_mesh(o.data)
    uvl = bm.loops.layers.uv.active
    part = bm.faces.layers.int.get("part")
    for f in bm.faces:            # the head and its bits get twice the texel density
        if f[part] != BODY:
            for l in f.loops:
                l[uvl].uv *= 2.0
    bmesh.update_edit_mesh(o.data)
    bpy.ops.uv.pack_islands(margin=0.006, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def texel_data(o, dom):
    """Rasterise every UV triangle: per texel A-pose position, normal, head coords, AO, part, bone."""
    me = o.data
    me.calc_loop_triangles()
    uv = np.zeros(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)

    def pt(name, n):
        a = np.zeros(len(me.vertices) * n)
        me.attributes[name].data.foreach_get("vector" if n == 3 else "value", a)
        return a.reshape(-1, n) if n > 1 else a

    P, N, H, A = pt("opos", 3), pt("onrm", 3), pt("hu", 3), pt("ao", 1)
    part = np.zeros(len(me.polygons), int)
    me.attributes["part"].data.foreach_get("value", part)
    fid = np.full((TEX, TEX), -1)
    out = {k: np.zeros((TEX, TEX, 3)) for k in ("pos", "nrm", "hu")}
    out["ao"] = np.zeros((TEX, TEX))
    out["part"] = np.zeros((TEX, TEX), int)
    out["bone"] = np.zeros((TEX, TEX), int)
    for tri in me.loop_triangles:
        L = list(tri.loops)
        V = list(tri.vertices)
        q = uv[L] * TEX - 0.5
        x0, y0 = np.floor(q.min(0)).astype(int)
        x1, y1 = np.ceil(q.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, TEX - 1), min(y1, TEX - 1)
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
        W = np.stack([w0[m], w1[m], w2[m]], 1)
        yy, xx = gy[m], gx[m]
        fid[yy, xx] = tri.polygon_index
        out["pos"][yy, xx] = W @ P[V]
        out["nrm"][yy, xx] = W @ N[V]
        out["hu"][yy, xx] = W @ H[V]
        out["ao"][yy, xx] = W @ A[V]
        out["part"][yy, xx] = part[tri.polygon_index]
        out["bone"][yy, xx] = dom[V][np.argmax(W, 1)]
    out["mask"] = fid >= 0
    return out


def make_material(o, rgba, name):
    img = bpy.data.images.new(name, TEX, TEX, alpha=True)
    img.pixels.foreach_set((rgba.astype(np.float32) / 255.0).ravel())
    img.filepath_raw = os.path.join(OUT, name + ".png")
    img.file_format = "PNG"
    img.save()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.92
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    rnd = nt.nodes.new("ShaderNodeMath")
    rnd.operation = "ROUND"
    nt.links.new(tex.outputs["Alpha"], rnd.inputs[0])
    nt.links.new(rnd.outputs[0], bsdf.inputs["Alpha"])
    mat.use_backface_culling = False
    o.data.materials.clear()
    o.data.materials.append(mat)


def main():
    global OUT
    a = sys.argv[sys.argv.index("--") + 1:]
    bundle, OUT, variant = a[0], a[1], a[2]
    check = len(a) > 3 and a[3] == "rigcheck"
    os.makedirs(OUT, exist_ok=True)
    source, seed = VARIANTS[variant]
    configure(source)
    body = load(os.path.join(bundle, FILES[source]))
    cut_helmet(body)
    starve(body)
    me = body.data
    me.attributes.new("part", "INT", "FACE")
    me.attributes.new("hu", "FLOAT_VECTOR", "POINT")
    ao = make_rig()
    if check:
        json.dump({k: [J[k][0], J[k][1]] for k in BONES}, open(os.path.join(OUT, "joints.json"), "w"))
    skin(body, ao)
    head = make_head(variant, seed)
    bpy.ops.object.select_all(action="DESELECT")
    head.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    store_attrs(body)
    dom = dominant_bone(body)
    unwrap(body)
    T = texel_data(body, dom)
    T["bones"] = BONES
    T["joints"] = J
    T["marks"] = (SRC["marks"], WARRIOR_MARKS)
    rgba = paint.paint(T, variant, seed, os.path.join(ROOT, "templates", "style", "bellmourn_palette.json"))
    make_material(body, rgba, f"zombie_{variant}")
    if not check:
        tpose(body, ao)
        bpy.context.scene.render.fps = anims.FPS
        anims.bake(ao)
    for nm in ("opos", "onrm", "hu", "ao", "part"):
        if nm in body.data.attributes:
            body.data.attributes.remove(body.data.attributes[nm])
    body.name = f"zombie_{variant}"
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"zombie_{variant}.glb"), export_format="GLB",
                              use_selection=True, export_skins=True, export_animations=not check,
                              export_animation_mode="ACTIONS", export_anim_slide_to_zero=False,
                              export_yup=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"zombie_{variant}.blend"))
    print("DONE", variant, len(body.data.vertices), "verts", len(body.data.polygons), "faces")


main()
