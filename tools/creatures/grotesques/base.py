"""The bare man under the Humans FBX: his skin as clay (a Field), and his joints.

The FBX dresses every man: no outfit is bare. The barest is the Beach one (a vest, swim shorts,
flip-flops), so his skin is made of: the Beach head with its hair and brows cut away, the Beach
body (the vest hugs the chest), the Suit trousers above the knee (slim thighs, where the shorts
flare), the bare Beach shins, and the Beach feet. Cut edges are capped, the pieces are filled
into a voxel field and blurred until the low-poly facets, the hems and the sandal straps melt
into rounded flesh. The vest's torso is then cut away and a bare one modelled in its place. The FBX's mitten hands are cut off at the wrist and rebuilt (after the blur,
so the fingers keep their shape) as a palm and capsule-chain fingers along its own finger bones.
`joints` are the FBX bones' heads and tails (metres, Blender axes: +X his left, -Y forward,
+Z up), in its T-pose.
"""
import bpy  # first: bmesh and mathutils come with it
import bmesh
import numpy as np

from field import Field

# part: (materials cut away, keep faces whose centre z is in [lo, hi])
PARTS = {
    "Beach_Head": ({"Hair", "Eyebrows", "Earrings"}, (-9, 9)),
    "Beach_Body": (set(), (-9, 9)),
    "Suit_Legs": (set(), (0.50, 9)),
    "Beach_Legs": ({"White", "Red_Dark"}, (-9, 0.60)),
    "Beach_Feet": (set(), (-9, 9)),
}
HAND_CUT = 0.555          # |x| past which the FBX's mitten hands are cut off (the wrist is at 0.568)
FINGERS = ("Index", "Middle", "Ring", "Pinky")
LO, HI = (-0.92, -0.32, -0.02), (0.92, 0.26, 1.92)


def load(fbx):
    """Import the FBX: ({part: (verts, tris)}, joints {bone: (head, tail)})."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    joints = {b.name: (np.array(arm.matrix_world @ b.head_local), np.array(arm.matrix_world @ b.tail_local))
              for b in arm.data.bones}
    parts = {}
    for o in bpy.data.objects:
        if o.type != "MESH" or o.name not in PARTS:
            continue
        drop, (lo, hi) = PARTS[o.name]
        mats = [m.name if m else "" for m in o.data.materials]
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.transform(o.matrix_world)

        def gone(f):
            c = f.calc_center_median()
            return (mats[f.material_index] in drop or not lo <= c.z <= hi
                    or (o.name == "Beach_Body" and abs(c.x) > HAND_CUT))
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if gone(f)], context="FACES")
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bm.verts.index_update()
        V = np.array([v.co[:] for v in bm.verts])
        T = np.array([[v.index for v in f.verts] for f in bm.faces])
        bm.free()
        parts[o.name] = cap(V, T)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    for coll in (bpy.data.actions, bpy.data.meshes, bpy.data.armatures, bpy.data.materials):
        for x in list(coll):
            coll.remove(x)
    return parts, joints


def cap(V, T):
    """Close every boundary loop of a triangle mesh with a fan about its centre."""
    e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
    key = np.sort(e, 1)
    _, inv, cnt = np.unique(key, axis=0, return_inverse=True, return_counts=True)
    bnd = e[cnt[inv.ravel()] == 1]                  # directed boundary edges (a -> b)
    nxt = {}
    for a, b in bnd:
        nxt.setdefault(int(a), []).append(int(b))
    V, T = list(map(tuple, V)), [tuple(t) for t in T]
    seen = set()
    for a0, b0 in bnd:
        if (a0, b0) in seen:
            continue
        loop, a, b = [int(a0)], int(a0), int(b0)
        seen.add((a, b))
        while b != loop[0] and len(loop) < 10000:
            loop.append(b)
            c = next((c for c in nxt.get(b, []) if (b, c) not in seen), None)
            if c is None:
                break
            seen.add((b, c))
            b = c
        if len(loop) < 3:
            continue
        ci = len(V)
        V.append(tuple(np.mean([V[i] for i in loop], 0)))
        for i in range(len(loop)):
            T.append((loop[(i + 1) % len(loop)], loop[i], ci))   # wound to face out of the hole
    return np.array(V), np.array(T)


def hands(f, J, spec):
    """Both hands into field f: a palm, and capsule-chain fingers and thumb along the FBX's
    finger bones. spec: finger (length scale, root radius, tip radius), claw (length; 0 none),
    knuckle (bump radius; 0 none), palm (thickness, width scale), spread (degrees)."""
    fl, r0, r1 = spec.get("finger", (1.0, 0.0095, 0.0075))
    claw = spec.get("claw", 0.0)
    kn = spec.get("knuckle", 0.0)
    th, pw = spec.get("palm", (0.032, 1.0))
    spread = np.radians(spec.get("spread", 0.0))
    for side, sx in (("L", 1), ("R", -1)):
        w = J[f"Wrist.{side}"][0]
        knuck = np.mean([J[f"{g}2.{side}"][0] for g in FINGERS], 0)
        length = np.linalg.norm(knuck - w)
        width = (abs(J[f"Index2.{side}"][0][1] - J[f"Pinky2.{side}"][0][1]) + 2 * r0) * pw
        c = (w + knuck) / 2 + np.array([sx * 0.006, 0, 0])
        f.ellipsoid(c, (length * 0.62, width * 0.56, th * 0.5), soft=0.002)
        f.capsule(w - np.array([sx * 0.05, 0, 0]), w + np.array([sx * 0.025, 0, 0]), 0.026, 0.025, soft=0.003)
        mid = np.mean([J[f"{g}2.{side}"][0][1] for g in FINGERS])
        roots = []
        for g in FINGERS + ("Thumb",):
            idx = (2, 3, 4) if g != "Thumb" else (1, 2, 3)
            pts = [J[f"{g}{i}.{side}"][0] for i in idx] + [J[f"{g}{idx[-1]}.{side}"][1]]
            pts = np.array(pts, float)
            if g == "Thumb":
                pts[0] = w + (pts[1] - w) * 0.3
            else:
                # fan the fingers out about the knuckle line
                a = sx * spread * (pts[0][1] - mid) / 0.04
                ca, sa = np.cos(a), np.sin(a)
                q = pts - pts[0]
                pts = pts[0] + np.stack([q[:, 0] * ca - q[:, 1] * sa, q[:, 0] * sa + q[:, 1] * ca, q[:, 2]], 1)
            pts = pts[0] + (pts - pts[0]) * fl
            n = len(pts) - 1
            rr = np.linspace(r0 * (1.2 if g == "Thumb" else 1.0), r1, n + 1)
            for i in range(n):
                f.capsule(pts[i], pts[i + 1], rr[i], rr[i + 1], soft=0.0015)
                if kn:
                    f.ellipsoid(pts[i] + np.array([0, 0, rr[i] * 0.45]), (kn, kn, kn * 0.8), soft=0.0015)
            if claw:
                d = pts[-1] - pts[-2]
                d /= np.linalg.norm(d)
                tip = pts[-1] + d * claw - np.array([0, 0, claw * 0.3])
                f.capsule(pts[-1] - d * r1 * 0.5, tip, r1 * 0.85, 0.0008, mode="max", soft=0.001)
            if spec.get("web") and g != "Thumb":
                roots.append(np.array([pts[0], pts[1] + (pts[2] - pts[1]) * 0.35]))
            # the web of flesh from the palm into each finger root
            f.capsule(w + (pts[0] - w) * 0.45 + np.array([sx * 0.0, 0, 0]), pts[0], r0 * 1.15, r0, soft=0.002)
        # webbing: a thin sheet between neighbouring fingers, out to their first joints
        for a, b in zip(roots, roots[1:]):
            for t in np.linspace(0, 1, 8):
                p, q = a[0] + (a[1] - a[0]) * t, b[0] + (b[1] - b[0]) * t
                f.capsule(p, q, 0.0045, 0.0045, soft=0.0012)


def torso(f):
    """The vest's torso cut away (crotch to the root of the neck) and a bare one modelled in its
    place, to the FBX's proportions: ribcage, belly, pelvis, pecs, deltoids, the trapezius sloping
    from the neck to the shoulders, shoulder blades, lats and buttocks, unioned and blurred into one
    body; then the groove of the spine and the line down the belly pressed in."""
    f.box((0, -0.06, 1.17), (0.178, 0.16, 0.318), 0.04, mode="cut", soft=0.008)
    E = lambda c, r: f.ellipsoid(c, r, mode="max", soft=0.004)
    E((0, -0.058, 1.30), (0.128, 0.098, 0.18))            # ribcage
    E((0, -0.066, 1.13), (0.136, 0.09, 0.15))              # belly: a man's straight waist
    E((0, -0.05, 0.985), (0.13, 0.09, 0.1))                # pelvis: narrower than the ribs
    E((0, -0.07, 0.90), (0.065, 0.06, 0.055))              # the groin, between the thighs
    f.capsule((0, -0.045, 1.42), (0, -0.045, 1.6), 0.052, 0.048, mode="max", soft=0.004)   # neck
    for sx in (1, -1):
        E((sx * 0.07, -0.112, 1.355), (0.078, 0.03, 0.05))            # pecs: broad, flat, high
        f.capsule((sx * 0.035, -0.03, 1.50), (sx * 0.17, -0.05, 1.452), 0.046, 0.042, mode="max", soft=0.004)
        E((sx * 0.18, -0.055, 1.425), (0.058, 0.055, 0.058))          # deltoids
        E((sx * 0.08, 0.022, 1.33), (0.062, 0.03, 0.08))              # shoulder blades
        E((sx * 0.11, -0.03, 1.24), (0.04, 0.078, 0.13))              # lats
        E((sx * 0.058, -0.004, 0.925), (0.06, 0.054, 0.066))          # buttocks: a man's, flat
        f.capsule((sx * 0.088, -0.06, 0.92), (sx * 0.1, -0.064, 0.70), 0.072, 0.068, mode="max", soft=0.004)  # thigh tops
    ramp = lambda x, a, b: np.clip((x - a) / (b - a), 0, 1)
    w = f.mask(lambda g: ramp(np.abs(g[0]), 0.27, 0.21) * ramp(np.abs(g[1] + 0.06), 0.22, 0.17)
               * ramp(g[2], 0.64, 0.74) * ramp(g[2], 1.57, 1.51))
    f.blur(0.018, w)
    f.capsule((0, 0.05, 0.99), (0, 0.04, 1.45), 0.009, 0.009, mode="cut", soft=0.006, amount=0.6)     # spine
    f.capsule((0, -0.155, 1.03), (0, -0.16, 1.40), 0.006, 0.006, mode="cut", soft=0.006, amount=0.35)  # linea alba


def bare_man(fbx, hand_spec=None, h=0.004, sigma=0.012):
    """(Field of the bare skin, joints). Blurred everywhere, the torso remodelled bare; hands added
    after the blur."""
    parts, J = load(fbx)
    f = Field(LO, HI, h)
    for V, T in parts.values():
        f.fill_mesh(V, T)
    f.blur(sigma)
    torso(f)
    hands(f, J, hand_spec or {})
    return f, J


def to_object(V, F, name="skin"):
    me = bpy.data.meshes.new(name)
    me.from_pydata(V.tolist(), [], F.tolist())
    me.validate()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o
