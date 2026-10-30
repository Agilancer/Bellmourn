"""Build one grotesque (a rigged, animated .glb for three.js) from the Humans FBX and a skin atlas.

    python build.py -- <Humans_Master.fbx> <skins dir> <out dir> <monster> [size=2048]

  1. the bare man as clay (base.py): the Beach body without its clothes, his hands rebuilt;
  2. the monster's features sculpted into the clay (monsters.py), and it is meshed;
  3. his body reshaped vertex by vertex (thinner limbs, a sunken belly...);
  4. the skin wrapped round him (wrap.py, skins.py) once at the vertices, and its brightness,
     high-passed, raised into relief (ribs, wrinkles, sockets come up where they are painted);
  5. decimated to the game's budget (the head kept finer), unwrapped (the head given more of the
     texture) and the skin baked into his own UVs, texel by texel;
  6. rigged on the zombies' 20 bones (rig.py) with the zombies' clips, and exported.
"""
import json
import os
import sys
import time

import bpy  # first: bmesh and mathutils come with it
import bmesh
import numpy as np
from PIL import Image
from scipy import sparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import base  # noqa: E402
import rig  # noqa: E402
import skins  # noqa: E402
import wrap  # noqa: E402
from monsters import MONSTERS  # noqa: E402

T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:6.1f}s]", *a, flush=True)


# ---------------------------------------------------------------- mesh helpers

def largest(V, F):
    from field import components
    comps = components(F, len(V))
    F = F[max(comps, key=len)]
    used = np.unique(F)
    remap = -np.ones(len(V), int)
    remap[used] = np.arange(len(used))
    return V[used], remap[F]


def normals(V, F):
    n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    N = np.zeros_like(V)
    for k in range(3):
        np.add.at(N, F[:, k], n)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)


def volume(V, F):
    return np.einsum("ij,ij->i", V[F[:, 0]], np.cross(V[F[:, 1]], V[F[:, 2]])).sum() / 6


def adjacency(F, n):
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    A = sparse.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()
    A = ((A + A.T) > 0).astype(np.float32)
    d = np.asarray(A.sum(1)).ravel()
    return sparse.diags(1 / np.maximum(d, 1)) @ A


def smooth_values(A, x, it):
    for _ in range(it):
        x = A @ x
    return x


def joints_soft(J, spec=None):
    """The joints whose painted landmarks (knee caps, elbow creases, ankle wraps) read as clothing
    where they meet the rest of the limb: (centre, radius, amount)."""
    out = []
    for s in "LR":
        out += [(np.array(J[f"shin.{s}"][0]), 0.085, 0.75), (np.array(J[f"forearm.{s}"][0]), 0.06, 0.6),
                (np.array(J[f"foot.{s}"][0]) + (0, 0, 0.03), 0.07, 0.6)]
    return out + list(spec or [])


def soften(P, C, spots):
    """Each spot's colours pulled toward the ring of skin round it: the tone shifted to match, and
    the painted detail eased (a knee pad's edge, a boot's top), so no landmark reads as a garment."""
    from scipy.spatial import cKDTree
    tree = cKDTree(P)
    C = C.copy()
    for c, r, amt in spots:
        inner = tree.query_ball_point(c, r)
        ring = np.setdiff1d(tree.query_ball_point(c, 2 * r), inner)
        if not len(inner) or not len(ring):
            continue
        inner = np.array(inner)
        a = amt * np.clip(1 - np.linalg.norm(P[inner] - c, axis=1) / r, 0, 1)[:, None] ** 0.7
        rm, im = C[ring].mean(0), C[inner].mean(0)
        x = C[inner] + a * (rm - im)
        C[inner] = x * (1 - 0.35 * a) + rm * 0.35 * a
    return C


def paint(P, C, shapes, warp):
    """Colour laid over the skin inside shapes (in the unwarped body's metres), keeping some of
    the skin's light and dark: ("seg", a, b, r, rgb) or ("ell", centre, radii, rgb)."""
    C = C.copy()
    L = C @ np.array([0.3, 0.55, 0.15], np.float32)
    for sh in shapes or []:
        if sh[0] == "seg":
            a, b = warp(np.array(sh[1], float)), warp(np.array(sh[2], float))
            d = wrap.seg_dist(P, a, b) / sh[3]
        else:
            c = warp(np.array(sh[1], float))
            d = np.linalg.norm((P - c) / np.array(sh[2]), axis=1)
        k = np.clip((1.15 - d) / 0.3, 0, 1)[:, None]
        tint = np.asarray(sh[-1], np.float32) * (0.75 + 0.5 * L[:, None])
        C = C * (1 - k) + np.clip(tint, 0, 1) * k
    return C


def relief(V, F, spec, atlas, caps, amp, lo_it=60, hi_it=2, cap=0.005, spots=(), mask=None):
    """Raise the skin's painted relief: brightness, high-passed over the surface, along normals
    (eased at the softened joints, and by `mask(V)` where given)."""
    N = normals(V, F)
    C, W = wrap.shade(spec, atlas, V, N, caps)
    C = wrap.fill_gaps(V, C, W)
    C = soften(V, C, spots)
    L = C @ np.array([0.3, 0.55, 0.15], np.float32)
    A = adjacency(F, len(V))
    band = L - smooth_values(A, L, lo_it)
    band = smooth_values(A, band, hi_it)
    k = np.ones(len(V))
    for c, r, amt in spots:
        k *= 1 - 0.6 * amt * np.clip(1 - np.linalg.norm(V - c, axis=1) / r, 0, 1)
    if mask is not None:
        k *= mask(V)
    d = np.clip(band * amp * k, -cap, cap)
    return V + N * d[:, None], C


# ---------------------------------------------------------------- blender steps

def decimate(o, tris):
    """Collapse to about `tris` triangles (the collapse keeps the detail where the curvature is)."""
    m = o.modifiers.new("dec", "DECIMATE")
    m.decimate_type = "COLLAPSE"
    m.ratio = tris / max(len(o.data.polygons), 1)
    m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)


# per region: the cylinder whose angle +-180 is where it is cut open (out of sight)
def seam_frames(J):
    g = lambda n: np.array(J[n][0], float)
    fr = {"head": ((0, -0.045, 0), (0, 0, 1), (0, -1, 0)), "torso": ((0, -0.05, 0), (0, 0, 1), (0, -1, 0))}
    for s, sx in (("L", 1), ("R", -1)):
        fr["arm" + s] = (g(f"upper_arm.{s}"), g(f"hand.{s}") - g(f"upper_arm.{s}"), (0, 0, 1))
        fr["leg" + s] = (g(f"thigh.{s}"), g(f"foot.{s}") - g(f"thigh.{s}"), (sx, 0, 0))
    return fr


def mark_seams(o, J):
    """Seams between body regions, along each part's hidden side, and round the hands' and
    feet's edges (their tops and bottoms unwrap apart)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    C = np.array([f.calc_center_median()[:] for f in bm.faces])
    Nf = np.array([f.normal[:] for f in bm.faces])
    reg = wrap.regions(C, wrap.capsules(J))
    names = list(reg)
    lab = np.stack([reg[n] for n in names], 1).argmax(1)
    th = np.zeros(len(C))
    for n, (o_, ax, f0) in seam_frames(J).items():
        m = lab == names.index(n)
        ax = np.array(ax, float) / np.linalg.norm(ax)
        f0 = np.array(f0, float)
        f0 = f0 - ax * (f0 @ ax)
        f0 /= np.linalg.norm(f0)
        r0 = np.cross(ax, f0)
        q = C[m] - np.array(o_, float)
        th[m] = np.degrees(np.arctan2(q @ r0, q @ f0))
    up = np.zeros(len(C), bool)
    for n in names:
        if n.startswith(("hand", "foot")):
            m = lab == names.index(n)
            up[m] = Nf[m, 2] > (0.0 if n.startswith("hand") else 0.35)
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        a, b = e.link_faces[0].index, e.link_faces[1].index
        if lab[a] != lab[b]:
            e.seam = True
        elif names[lab[a]].startswith(("hand", "foot")):
            e.seam = bool(up[a] != up[b])
        elif names[lab[a]] == "head":
            # the face apart from the back of the head (behind the ears): the face gets its own
            # island, flat enough to keep its texels
            e.seam = bool((abs(th[a]) < 100) != (abs(th[b]) < 100))
        elif abs(th[a] - th[b]) > 180.0:
            e.seam = True
    bm.to_mesh(o.data)
    bm.free()


def unwrap(o, J, head_z=1.53, head_scale=(2.4, 1.4), margin=0.004):
    mark_seams(o, J)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.uv.unwrap(method="MINIMUM_STRETCH", margin=margin)
    except TypeError:
        bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")
    # give the head's islands more texels
    bm = bmesh.new()
    bm.from_mesh(o.data)
    uvl = bm.loops.layers.uv.active
    bm.faces.ensure_lookup_table()
    parent = list(range(len(bm.faces)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        f1, f2 = e.link_faces
        same = True
        for v in e.verts:
            u1 = next(l[uvl].uv for l in f1.loops if l.vert == v)
            u2 = next(l[uvl].uv for l in f2.loops if l.vert == v)
            if (u1 - u2).length > 1e-6:
                same = False
        if same:
            parent[find(f1.index)] = find(f2.index)
    isl = {}
    for f in bm.faces:
        isl.setdefault(find(f.index), []).append(f)
    for faces in isl.values():
        cen = np.mean([f.calc_center_median()[:] for f in faces], 0)
        if cen[2] < head_z:
            continue
        k = head_scale[0] if cen[1] < -0.08 else head_scale[1]     # the face, the back of the head
        loops = [l for f in faces for l in f.loops]
        c = sum((l[uvl].uv for l in loops), loops[0][uvl].uv * 0) / len(loops)
        for l in loops:
            l[uvl].uv = c + (l[uvl].uv - c) * k
    bm.to_mesh(o.data)
    bm.free()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=margin, scale=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def corners(o):
    """Per-corner positions, normals, uvs (v down) and the triangles over them."""
    me = o.data
    me.calc_loop_triangles()
    nl = len(me.loops)
    vi = np.zeros(nl, int)
    me.loops.foreach_get("vertex_index", vi)
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    vn = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("normal", vn)
    vn = vn.reshape(-1, 3)
    uv = np.zeros(nl * 2)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    uv[:, 1] = 1 - uv[:, 1]
    tl = np.zeros(len(me.loop_triangles) * 3, int)
    me.loop_triangles.foreach_get("loops", tl)
    return co[vi], vn[vi], uv, tl.reshape(-1, 3)


def material(o, path, name, glow=None):
    img = bpy.data.images.load(path)
    img.name = name
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = 0.82
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    t.interpolation = "Linear"          # the game draws it nearest; phones' copies shrink it smoothly
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    if glow:
        gi = bpy.data.images.load(glow)
        gi.name = name + "_glow"
        e = nt.nodes.new("ShaderNodeTexImage")
        e.image = gi
        e.interpolation = "Linear"
        nt.links.new(e.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = 1.0
    o.data.materials.clear()
    o.data.materials.append(mat)


def export(path, body, ao):
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    ao.select_set(True)
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_skins=True, export_animations=True,
              export_animation_mode="ACTIONS", export_anim_slide_to_zero=False, export_yup=True,
              export_image_format="JPEG", export_jpeg_quality=92)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop("export_jpeg_quality")
        bpy.ops.export_scene.gltf(**kw)


def glow_map(img, pix, P, rule, spots, warp, size):
    """The emissive image, or None. rule: paint in a hue range glows, the brightest `frac` of the
    skin (in that hue, saturated past smin), in its own colour times `gain`; spots: places on the
    body [(centre in the unwarped body's metres, radius, rgb)] that burn regardless."""
    if not rule and not spots:
        return None
    flat = img.reshape(-1, 3)
    G = np.zeros_like(flat)
    if rule:
        C = flat[pix]
        mx = C.max(1)
        inh = wrap.glow(C, rule["hue"], 0.0, rule.get("smin", 0.45)) > 0.5
        score = np.where(inh, mx, 0)
        thr = rule["vmin"] if "vmin" in rule else np.quantile(score, 1 - rule["frac"])
        k = np.clip((score - thr) / 0.06, 0, 1) * inh
        for z0, z1, f in rule.get("zfade", []):         # dimmer bands (a belt of cracks at the hips)
            k = k * (1 - (1 - f) * ((P[:, 2] > z0) & (P[:, 2] < z1)))
        G[pix] = np.minimum(C * k[:, None] * rule.get("gain", 1.0), rule.get("cap", 0.85))
    for c, r, rgb in spots or []:
        c = warp(np.array(c, float))
        d = np.linalg.norm(P - c, axis=1)
        k = np.clip(1.4 - d / r, 0, 1) ** 1.5
        G[pix] = np.maximum(G[pix], np.asarray(rgb, np.float32) * k[:, None])
    return G.reshape(size, size, 3)


# ---------------------------------------------------------------- the build

def build(fbx, skin_dir, out, name, size=2048, out_size=1024):
    os.makedirs(out, exist_ok=True)
    M = MONSTERS[name]
    H0 = M["H"]
    f, FJ = base.bare_man(fbx, M["hands"], h=0.003)
    J0 = rig.joints(FJ, M.get("joints"))
    log("clay", f.n)
    M["sculpt"](f, H0)
    V, F = f.mesh()
    V, F = largest(V, F)
    if volume(V, F) < 0:
        F = F[:, ::-1].copy()
    log("meshed", len(V), "verts", len(F), "tris")
    V = M["reshape"](V, J0, H0)
    if M.get("post"):        # changes that need the surface's normals: boils, blisters, warts
        V = M["post"](V, normals(V, F), J0, H0)
    # a change of proportion moves the mesh, the joints and the head's landmarks together
    warp = M.get("warp") or (lambda P: np.asarray(P, float))
    V = warp(V)
    J = {n: (tuple(warp(np.array(h, float))), tuple(warp(np.array(t, float))), p) for n, (h, t, p) in J0.items()}
    H = dict(H0)
    for k in ("eye", "brow", "nose", "mouth", "chin", "ear", "top", "neck"):
        H[k] = float(warp(np.array((0, H0["cy"], H0[k])))[2])
    H["cy"] = float(warp(np.array((0, H0["cy"], H0["eye"])))[1])
    caps = wrap.capsules(J)
    spec = skins.spec(M["skin"], J, H, M.get("warp"))
    atlas = wrap.Atlas(os.path.join(skin_dir, spec["file"]), **spec.get("atlas", {}))
    atlas.inpaint(spec["inpaint"])
    wrap.balance(spec, atlas, V, normals(V, F), caps)
    spots = joints_soft(J, [(warp(np.array(c, float)), r, a) for c, r, a in M.get("soften", [])])
    V, _ = relief(V, F, spec, atlas, caps, M["relief"], spots=spots, mask=M.get("relief_mask"))
    log("relief")
    body = base.to_object(V, F, name)
    for p in body.data.polygons:
        p.use_smooth = True
    decimate(body, M["tris"])
    log("decimated", len(body.data.polygons))
    neck_z = J["neck"][0][2]
    unwrap(body, J, head_z=neck_z + 0.02)
    log("unwrapped")
    Vc, Nc, UV, TL = corners(body)
    post = lambda P, N, C: paint(P, soften(P, C, spots), M.get("paint"), warp)
    img, (pix, P_tex, _) = wrap.bake(Vc, Nc, TL, UV, spec, atlas, caps, size=size, post=post)
    img = img.reshape(size, size, 3)
    tex = Image.fromarray((img * 255 + 0.5).astype(np.uint8))
    if out_size and out_size != size:
        tex = tex.resize((out_size, out_size), Image.LANCZOS)
    png = os.path.join(out, f"{name}.png")
    tex.save(png)
    glow_png = None
    G = glow_map(img, pix, P_tex, spec.get("glow"), M.get("glow_spots"), warp, size)
    if G is not None:
        gl = Image.fromarray((np.clip(G, 0, 1) * 255 + 0.5).astype(np.uint8))
        if out_size and out_size != size:
            gl = gl.resize((out_size, out_size), Image.LANCZOS)
        glow_png = os.path.join(out, f"{name}_glow.png")
        gl.save(glow_png)
    log("baked", png, glow_png or "")
    material(body, png, name, glow_png)
    ao = rig.build(J)
    un = rig.skin(body, ao, J)
    rig.rigid_head(body, J, neck_z + 0.037)
    log("skinned; unweighted", un)
    rig.clips(ao)
    log("clips")
    export(os.path.join(out, f"{name}.glb"), body, ao)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f"{name}.blend"))
    json.dump({"tris": len(body.data.polygons), "verts": len(body.data.vertices),
               "skin": os.path.abspath(os.path.join(skin_dir, spec["file"]))},
              open(os.path.join(out, f"{name}.json"), "w"))
    log("done", name)


if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 1:]
    for nm in a[3].split(","):
        build(a[0], a[1], a[2], nm, int(a[4]) if len(a) > 4 else 2048)
