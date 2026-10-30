"""The zombies' 20-bone rig on the Humans body, its skinning, and the zombies' clips.

The bones and names are the 3D zombies' (tools/creatures/zombie3d), so zombies.js plays the
monsters exactly like them: hunting, attacks, gore, dismemberment, rising from the graves and
crawling once the legs are gone. The joints sit on the Humans FBX's own (its 79 bones fold onto
these 20: Hips into hips, Abdomen into spine, Torso and Chest into chest, Wrist and the fingers
into hand), except the ankle, which the FBX puts at the floor. The rest pose is the FBX's T-pose,
which is what zombie3d/anims.py keys its clips against.
"""
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "zombie3d"))
import anims  # noqa: E402  (the zombies' clips)


def joints(F, over=None):
    """The 20-bone rig {bone: (head, tail, parent)} from the FBX joints F, left side mirrored.
    `over` replaces any bone's (head, tail)."""
    g = lambda n: tuple(np.round(F[n][0], 4))
    J = {
        "root": ((0, 0, 0), (0, 0, 0.2), None),
        "hips": ((0, -0.05, 0.93), (0, -0.05, 1.0), "root"),
        "spine": ((0, -0.05, 1.0), (0, -0.045, 1.161), "hips"),
        "chest": ((0, -0.045, 1.161), (0, -0.043, 1.511), "spine"),
        "neck": ((0, -0.043, 1.511), (0, -0.043, 1.59), "chest"),
        "head": ((0, -0.043, 1.59), (0, -0.043, 1.84), "neck"),
        "shoulder.L": (g("Shoulder.L"), g("UpperArm.L"), "chest"),
        "upper_arm.L": (g("UpperArm.L"), g("LowerArm.L"), "shoulder.L"),
        "forearm.L": (g("LowerArm.L"), g("Wrist.L"), "upper_arm.L"),
        "hand.L": (g("Wrist.L"), tuple(np.round(F["Middle4.L"][1], 4)), "forearm.L"),
        "thigh.L": ((0.10, -0.045, 0.935), (0.121, -0.07, 0.533), "hips"),
        "shin.L": ((0.121, -0.07, 0.533), (0.121, -0.055, 0.09), "thigh.L"),
        "foot.L": ((0.121, -0.055, 0.09), (0.125, -0.24, 0.025), "shin.L"),
    }
    J.update(over or {})
    for k in [k for k in J if k.endswith(".L")]:
        h, t, p = J[k]
        J[k[:-2] + ".R"] = ((-h[0], h[1], h[2]), (-t[0], t[1], t[2]), p[:-2] + ".R" if p.endswith(".L") else p)
    return J


def build(J, name="grotesque_rig"):
    arm = bpy.data.armatures.new(name)
    ao = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode="EDIT")
    for n, (h, t, p) in J.items():
        eb = arm.edit_bones.new(n)
        eb.head, eb.tail = h, t
        eb.roll = 0
    for n, (h, t, p) in J.items():
        if p:
            eb = arm.edit_bones[n]
            eb.parent = arm.edit_bones[p]
            eb.use_connect = (Vector(J[p][1]) - Vector(h)).length < 1e-4
        arm.edit_bones[n].use_deform = n != "root"
    bpy.ops.object.mode_set(mode="OBJECT")
    return ao


# how thick each bone's flesh is (metres), for claiming the vertices nearest it
FLESH = {"hips": 0.12, "spine": 0.12, "chest": 0.13, "neck": 0.05, "head": 0.09, "shoulder": 0.05,
         "upper_arm": 0.045, "forearm": 0.04, "hand": 0.03, "thigh": 0.07, "shin": 0.05, "foot": 0.04}


def skin(body, ao, J, spread=4, keep=4):
    """Weights by nearest bone, then diffused over the surface `spread` rings so joints blend
    (and the legs, touching only through the groin, never share). Returns unweighted count."""
    from scipy import sparse
    me = body.data
    P = np.array([v.co[:] for v in me.vertices])
    F = np.array([p.vertices[:] for p in me.polygons if len(p.vertices) == 3])
    bones = [n for n in J if n != "root"]
    D = np.zeros((len(P), len(bones)))
    for i, n in enumerate(bones):
        a, b = np.array(J[n][0], float), np.array(J[n][1], float)
        d = b - a
        t = np.clip(((P - a) @ d) / (d @ d), 0, 1)
        D[:, i] = np.linalg.norm(P - (a + t[:, None] * d), axis=1) - FLESH[n.split(".")[0]]
        side = n[-1] if n[-2:] in (".L", ".R") else ""
        if side:
            sx = 1 if side == "L" else -1
            D[sx * P[:, 0] < (0.09 if "arm" in n or n.startswith(("hand", "shoulder")) else 0.0), i] = 9
    W = np.zeros_like(D)
    W[np.arange(len(P)), D.argmin(1)] = 1
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    A = sparse.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(len(P),) * 2).tocsr()
    A = ((A + A.T) > 0).astype(float) + sparse.eye(len(P))
    A = sparse.diags(1 / np.asarray(A.sum(1)).ravel()) @ A
    for _ in range(spread):
        W = A @ W
    # the strongest `keep`, normalised
    idx = np.argsort(-W, 1)[:, :keep]
    top = np.take_along_axis(W, idx, 1)
    top[top < 0.02] = 0
    top /= np.maximum(top.sum(1, keepdims=True), 1e-9)
    body.vertex_groups.clear()
    groups = [body.vertex_groups.new(name=n) for n in bones]
    for vi in range(len(P)):
        for k in range(keep):
            if top[vi, k] > 0:
                groups[idx[vi, k]].add([vi], float(top[vi, k]), "REPLACE")
    body.parent = ao
    m = body.modifiers.new("Armature", "ARMATURE")
    m.object = ao
    return int((top.sum(1) == 0).sum())


def rigid_head(body, J, z0=None):
    """The skull doesn't bend: above the jaw everything rides the head bone alone."""
    z0 = z0 or J["head"][0][2] + 0.01
    gh, gn = body.vertex_groups["head"], body.vertex_groups["neck"]
    for v in body.data.vertices:
        if v.co.z > z0 + 0.025:
            for g in list(v.groups):
                if g.group != gh.index:
                    body.vertex_groups[g.group].remove([v.index])
            gh.add([v.index], 1.0, "REPLACE")
        elif v.co.z > z0:
            k = (v.co.z - z0) / 0.025
            gh.add([v.index], float(k), "REPLACE")
            gn.add([v.index], float(1 - k), "REPLACE")


def clips(ao, which=None):
    """Key the zombies' clips (anims.CLIPS, or `which`) onto the rig."""
    bpy.context.scene.render.fps = anims.FPS
    if which:
        keep = dict(anims.CLIPS)
        anims.CLIPS.clear()
        anims.CLIPS.update({k: v for k, v in keep.items() if k in which})
        try:
            return anims.bake(ao)
        finally:
            anims.CLIPS.clear()
            anims.CLIPS.update(keep)
    return anims.bake(ao)
