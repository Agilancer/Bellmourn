"""Export arm-rigged models (bare arm, gauntlets) and held items (weapons, shields, wands).

Arm models share one skeleton (arm.bones) and carry every first-person rig animation that
uses their side, so a gauntlet .glb plays exactly like the 2D rig sheets. Held items are plain
meshes modelled around the item socket (origin = grip point, +y along the handle/blade, +z
toward the knuckles or the shield's face) and attach to the arm's `item` node.
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import anims  # noqa: E402  (tools/templates, put on the path by arm.py)
import arm as A  # noqa: E402
import fp_rig as R  # noqa: E402
import texkit  # noqa: E402
from gltf import GLB  # noqa: E402

TIC = 1 / 35
ANIMATED = ("upper", "elbow", "fore", "hand", "item")  # bones the rig drives each frame


def merged(model, bone_index=None):
    """Concatenate a packed model's islands into vertex arrays (rig space)."""
    pos, nrm, uv, idx, j0, j1, w1 = [], [], [], [], [], [], []
    base = 0
    for part, isl in model.islands():
        pos.append(isl.v)
        nrm.append(isl.n)
        uv.append(isl.px / model.tex)
        idx.append(isl.t + base)
        if bone_index is not None:
            b0, b1, w = part.skin(isl)
            j0 += [bone_index[b0]] * len(isl.v)
            j1 += [bone_index[b1]] * len(isl.v)
            w1.append(w)
        base += len(isl.v)
    out = [np.concatenate(pos), np.concatenate(nrm), np.concatenate(uv), np.concatenate(idx)]
    if bone_index is not None:
        j = np.zeros((base, 4), int)
        j[:, 0], j[:, 1] = j0, j1
        w = np.zeros((base, 4))
        w[:, 1] = np.concatenate(w1)
        w[:, 0] = 1.0 - w[:, 1]
        out += [j, w]
    return out


def side_anims(side):
    """{anim id: frames} for every rig that has an arm on this side."""
    return {k: a["frames"] for k, a in anims.ANIMS.items() if any(side in f for f in a["frames"])}


def export_arm_model(model, side, path, texture=None):
    """A skinned arm-rig model with all of this side's rig animations."""
    if any(i.px is None for _, i in model.islands()):
        model.pack()
    g = GLB()
    g.texture(texkit.png_bytes(texture or texkit.placeholder_texture(model)))
    root = g.node(f"{model.name}")
    bone_nodes, bind = {}, []
    for name, parent, origin in A.bones(side):
        m = np.eye(4)
        if parent is None:
            m[:3, 3] = origin
            bone_nodes[name] = g.node(name, root, matrix=m)
        else:
            m[:3, 3] = origin - dict((n, o) for n, _, o in A.bones(side))[parent]
            bone_nodes[name] = g.node(name, bone_nodes[parent], matrix=m)
    joint_names = [n for n, _, _ in A.bones(side) if n != "item"]
    bind = []
    for n in joint_names:
        m = np.eye(4)
        m[:3, 3] = dict((b, o) for b, _, o in A.bones(side))[n]
        bind.append(m)
    pos, nrm, uv, idx, j, w = merged(model, {n: i for i, n in enumerate(joint_names)})
    mesh = g.mesh(model.name, pos, nrm, uv, idx, j, w)
    skin = g.skin([bone_nodes[n] for n in joint_names], bind)
    g.node(f"{model.name} mesh", root, mesh=mesh, skin=skin)
    for anim_id, frames in side_anims(side).items():
        fingers = [n for n, parent, _ in A.bones(side) if parent == "hand"]
        times, tracks = [], {bone_nodes[b]: [] for b in ANIMATED + tuple(fingers)}
        t = 0.0
        for f in frames + [frames[-1]]:  # the closing key holds the last frame its full time
            R.set_view(f.get("view", R.REST_SCALE))
            arm = next(a for a in R.pose_frame(f) if a["side"] == side)
            mats = A.pose(arm)
            for b in ANIMATED:
                tracks[bone_nodes[b]].append(mats[b])
            # fingers are keyed in every clip (closed round the grip unless the rig opens
            # them), so switching clips never leaves a hand stuck open
            for n, local in A.finger_mats(arm, side).items():
                tracks[bone_nodes[n]].append(local)
            times.append(t)
            t += f["tics"] * TIC
        times[-1] = times[-2] + frames[-1]["tics"] * TIC
        g.animation(anim_id, times, tracks)
    g.save(path)
    return model.tri_count()


def export_item(model, path, texture=None):
    """A held item (no skeleton), modelled around the item socket."""
    if any(i.px is None for _, i in model.islands()):
        model.pack()
    g = GLB()
    g.texture(texkit.png_bytes(texture or texkit.placeholder_texture(model)))
    pos, nrm, uv, idx = merged(model)
    g.node(model.name, mesh=g.mesh(model.name, pos, nrm, uv, idx))
    g.save(path)
    return model.tri_count()
