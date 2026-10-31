"""Re-texturing the Humans outfits with the cloth tiles.

The FBX's clothes have no UVs (all zero), so each face is projected round the limb it belongs to
(the bone that carries most of it, in the T-pose bind): a cylinder round the torso, each upper
and lower arm, each thigh and shin, and a box for the feet and hands. One repeat of a tile covers
`tile` metres, the same on every part, so the weave is the same size everywhere."""
import math
import numpy as np
from PIL import Image, ImageFilter

# limb: (bones, axis, seam angle) -- the seam goes where it's least seen: the back, under the arm, inside the leg
PARTS = {
    'torso': (('Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head', 'Root', 'Body'), 'z', 'back'),
    'shoulder.L': (('Shoulder.L',), 'x', 'under'), 'shoulder.R': (('Shoulder.R',), 'x', 'under'),
    'upperarm.L': (('UpperArm.L',), 'x', 'under'), 'upperarm.R': (('UpperArm.R',), 'x', 'under'),
    'lowerarm.L': (('LowerArm.L',), 'x', 'under'), 'lowerarm.R': (('LowerArm.R',), 'x', 'under'),
    'thigh.L': (('UpperLeg.L',), 'z', 'inside'), 'thigh.R': (('UpperLeg.R',), 'z', 'inside'),
    'shin.L': (('LowerLeg.L',), 'z', 'inside'), 'shin.R': (('LowerLeg.R',), 'z', 'inside'),
}
BOX = ('Wrist', 'Index', 'Middle', 'Ring', 'Pinky', 'Thumb', 'Foot', 'PT')


def part_of(bone):
    if any(bone.startswith(b) for b in BOX):
        return 'box'
    for k, (bones, _, _) in PARTS.items():
        if bone in bones:
            return k
    return 'torso'


def unwrap(obj, arm, tile_of_mat, box_faces=None):
    """UVs on obj (bind pose): tile_of_mat(material name) -> metres per repeat."""
    import bpy
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uvl = me.uv_layers.active
    groups = {g.index: g.name for g in obj.vertex_groups}
    V = np.array([v.co[:] for v in me.vertices])
    # each vertex's heaviest bone
    vb = []
    for v in me.vertices:
        best, bw = 'Hips', -1
        for g in v.groups:
            if g.weight > bw:
                best, bw = groups[g.group], g.weight
        vb.append(best)
    bones = arm.data.bones
    # each part's axis line, from its bones in the bind pose
    axes = {}
    for k, (bn, ax, seam) in PARTS.items():
        bs = [bones[b] for b in bn if b in bones]
        if k == 'torso':
            c = np.array([0.0, -0.045, 0.0])
        else:
            h = np.array(bs[0].head_local); t = np.array(bs[0].tail_local)
            c = h
        axes[k] = (c, ax, seam)
    for poly in me.polygons:
        tile = tile_of_mat(me.materials[poly.material_index].name if me.materials else '')
        vs = list(poly.vertices)
        cnt = {}
        for i in vs:
            p = part_of(vb[i]); cnt[p] = cnt.get(p, 0) + 1
        part = max(cnt, key=cnt.get)
        P = V[vs]
        if part == 'box' or (box_faces and poly.index in box_faces):
            n = np.abs(np.array(poly.normal[:]))
            k = int(np.argmax(n))
            a, b = [(1, 2), (0, 2), (0, 1)][k]
            uv = np.stack([P[:, a], P[:, b]], 1) / tile
        else:
            c, ax, seam = axes[part]
            q = P - c
            if ax == 'z':
                along = q[:, 2]
                side = 1 if part.endswith('.L') else -1
                # angle round the vertical; the seam at the back (torso) or inside (legs)
                if seam == 'back':
                    th = np.arctan2(q[:, 0], -q[:, 1])           # 0 at the front, +-pi at the back
                else:
                    th = np.arctan2(-q[:, 1], q[:, 0] * side)    # 0 outside, +-pi inside
                r = np.hypot(q[:, 0], q[:, 1])
            else:
                along = q[:, 0] * (1 if part.endswith('.L') else -1)
                th = np.arctan2(-q[:, 1], q[:, 2])               # 0 on top, +-pi underneath
                r = np.hypot(q[:, 1], q[:, 2])
            if th.max() - th.min() > math.pi:
                th = np.where(th < 0, th + 2 * math.pi, th)
            rr = {'torso': 0.15}.get(part, 0.055 if 'arm' in part or 'shoulder' in part else 0.075)
            uv = np.stack([th * rr, along], 1) / tile
        for li, (u, v) in zip(poly.loop_indices, uv):
            uvl.data[li].uv = (float(u), float(v))


def normal_map(src, dst, strength=2.5, blur=1.0, size=1024):
    """A tangent-space normal map from the tile's luminance (lighter = raised)."""
    im = Image.open(src).convert('L')
    if size:
        im = im.resize((size, size), Image.LANCZOS)
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    h = np.asarray(im, dtype=np.float64) / 255
    # remove the low-frequency light falloff so only relief remains
    lo = np.asarray(Image.fromarray((h * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(size / 24 if size else 40)), dtype=np.float64) / 255
    h = h - lo
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength * h.shape[1] / 64
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength * h.shape[0] / 64
    n = np.stack([-dx, dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(dst)


def rough_map(src, dst, base, spread, size=1024):
    """Roughness from the tile: worn, lighter places a little smoother (leather) or rougher (cloth)."""
    im = Image.open(src).convert('L').resize((size, size), Image.LANCZOS)
    h = np.asarray(im, dtype=np.float64) / 255
    r = np.clip(base + spread * (h - h.mean()) / (h.std() + 1e-6) * 0.25, 0.05, 1)
    Image.fromarray((r * 255).astype(np.uint8)).save(dst)
