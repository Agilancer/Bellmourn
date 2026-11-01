"""The brute's two-handed weapons, modelled in code: a maul and a bearded war axe.

Weapon space: origin in the right fist, +Y up the haft to the head, +X the striking face / edge
(clips2h's weapon frame), mannequin-scale metres (the whole creature is scaled at export).
Both hang off the hand_r bone at the fist's grip frame; one texture (iron, wood, leather,
honed steel quadrants) generated here.
"""
import math
import os

import bmesh
import bpy
import numpy as np


def _fbm(n, rng, power=2.0):
    f = np.fft.fft2(rng.normal(size=(n, n)))
    k = np.hypot(*np.meshgrid(np.fft.fftfreq(n), np.fft.fftfreq(n)))
    k[0, 0] = 1
    a = np.real(np.fft.ifft2(f / k ** (power / 2)))
    return (a - a.mean()) / a.std()


def texture(path, size=1024):
    """Quadrants: iron (top left), wood (top right), leather (bottom left), steel (bottom right).
    Iron and steel quadrants: top half tiles (box-projected parts / the axe blade), bottom half
    one plate per face with worn bright borders, plus a strip of bright worn metal for bevels."""
    rng = np.random.default_rng(21)
    h = size // 2
    yy, xx = np.mgrid[0:h, 0:h] / h
    img = np.zeros((size, size, 3), np.float32)
    n1, n2, n3 = _fbm(h, rng, 2.4), _fbm(h, rng, 1.6), _fbm(h, rng, 3.0)
    nf = _fbm(h, rng, 1.2)
    rust = np.clip(n3 * 0.8 - 0.5, 0, 1)[..., None]
    iron = np.array([0.22, 0.215, 0.215]) * (0.78 + 0.14 * n1[..., None] + 0.08 * n2[..., None])
    iron *= (0.75 + 0.25 * np.clip(np.abs(np.sin(xx * 40 + 3 * n2)) * 2, 0, 1))[..., None]   # hammered pitting
    q = iron * (1 - rust) + np.array([0.3, 0.15, 0.07]) * rust
    img[:h, :h] = _plates(q, xx, yy, nf, np.array([0.5, 0.49, 0.47]), rng, blood=False)
    grain = np.sin(xx * 90 + 4 * n1) * 0.5 + 0.5
    img[:h, h:] = np.array([0.24, 0.15, 0.08]) * (0.7 + 0.35 * grain[..., None] + 0.08 * n2[..., None])
    wrap = (np.sin((xx + yy) * 2 * np.pi * 9) > -0.75).astype(np.float32)        # spiral leather wrap
    img[h:, :h] = np.array([0.22, 0.12, 0.07]) * (0.55 + 0.45 * wrap[..., None]) * (0.85 + 0.1 * n2[..., None])
    # steel, top half: the axe blade (u: socket -> edge)
    grime = 0.72 + 0.28 * np.clip(0.5 + 0.35 * n2, 0, 1)
    ax = np.full((h, h), 0.21) * grime
    fade = np.clip((0.8 - xx) / 0.25, 0, 1)
    for _ in range(110):                                                          # hammer blows
        cx, cy, r = rng.uniform(0, 0.8), rng.uniform(0, 0.5), rng.uniform(0.022, 0.048)
        dd = np.hypot(xx - cx, (yy - cy) * 1.0)
        ax *= 1 + fade * (-0.11 * np.exp(-(dd / r) ** 2) + 0.05 * np.exp(-((dd - r) / (0.35 * r)) ** 2))
    ax = np.where((xx > 0.3) & (xx < 0.37), 0.36 * grime, ax)                  # the fuller, ground brighter
    ax = np.where((np.abs(xx - 0.373) < 0.004) | (np.abs(xx - 0.297) < 0.004), ax * 0.45, ax)
    streak = 0.9 + 0.1 * np.clip(n1, -1.5, 1.5) / 1.5
    ax = np.where((xx >= 0.8) & (xx <= 0.9), 0.5 * streak * grime, ax)          # ground bevel
    ax = np.where(xx > 0.9, 0.8 * streak, ax)                                    # honed edge
    nick = np.clip(_fbm(h, rng, 1.0) - 2.2, 0, 1) * (xx > 0.86)
    ax = ax * (1 - 0.8 * nick)
    axc = np.repeat(ax[..., None], 3, -1) * np.array([1.0, 0.985, 0.97])
    spl = np.clip(_fbm(h, rng, 1.8) * 0.9 - 0.9, 0, 1)[..., None] * ((xx > 0.55) & (xx < 0.97))[..., None]
    axc = axc * (1 - spl) + np.array([0.3, 0.035, 0.025]) * (0.7 + 0.3 * n1[..., None]) * spl
    st = _plates(np.array([0.27, 0.265, 0.26]) * grime[..., None], xx, yy, nf, np.array([0.62, 0.61, 0.6]), rng, blood=True)
    img[h:, h:] = np.where((yy < 0.5)[..., None], axc, st)
    from bpy import data
    im = data.images.new("brute_weapons", size, size)
    px = np.ones((size, size, 4), np.float32)
    px[..., :3] = np.clip(img[::-1], 0, 1)
    im.pixels.foreach_set(px.ravel())
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    return im


def _plates(q, xx, yy, noise, worn, rng, blood):
    """Bottom half of a quadrant: one plate per face (borders worn bright), blood splashed on
    the plate and running down it; a strip of bright worn metal for bevels and rivet heads."""
    fx = np.clip((xx - 0.02) / 0.78, 0, 1); fy = np.clip((yy - 0.52) / 0.46, 0, 1)
    plate = (yy >= 0.5) & (xx < 0.83)
    q = q.copy()
    if blood:
        sp = np.exp(-(((fx - 0.55) / 0.3) ** 2 + ((fy - 0.32) / 0.22) ** 2)) + 0.35 * noise
        drip = np.zeros_like(fx)
        for _ in range(9):
            c, w, ln = rng.uniform(0.25, 0.85), rng.uniform(0.012, 0.03), rng.uniform(0.25, 0.6)
            drip = np.maximum(drip, (np.abs(fx - c) < w * (1.2 - (fy - 0.3) / ln)) * (fy > 0.3) * (fy < 0.3 + ln))
        bl = np.clip(np.maximum(sp - 0.75, 0) * 4 + drip, 0, 1) * plate
        q = q * (1 - bl[..., None]) + np.array([0.3, 0.035, 0.025]) * (0.65 + 0.35 * np.clip(noise, -1, 1)[..., None]) * bl[..., None]
    b = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy))
    wear = np.clip((0.07 - b) / 0.05 + 0.3 * noise, 0, 1) * plate
    q = q * (1 - wear[..., None]) + worn * (0.85 + 0.15 * np.clip(noise, -1, 1))[..., None] * wear[..., None]
    edge = (yy >= 0.5) & (xx >= 0.83)
    q[edge] = worn * (0.9 + 0.1 * np.clip(noise[edge], -1, 1))[:, None]
    return q


CHOKE = 0.36       # the one-handed maul is gripped this far up the haft

QUAD = {"iron": (0.0, 0.5), "wood": (0.5, 0.5), "leather": (0.0, 0.0), "steel": (0.5, 0.0)}


def _uv_plates(bm, faces, quad, force_edge=False):
    """Iron and steel: each face planar-mapped onto one whole plate (so its borders wear), thin
    bevel strips and rivet heads onto the bright worn strip."""
    uv = bm.loops.layers.uv.verify()
    u0, v0 = QUAD[quad]
    for f in faces:
        ax = max(range(3), key=lambda i: abs(f.normal[i]))
        pr = lambda c: [(c.y, c.z), (c.x, c.z), (c.x, c.y)][ax]
        A = np.array([pr(lp.vert.co) for lp in f.loops])
        lo = A.min(0); span = np.maximum(A.max(0) - lo, 1e-6)
        edge = force_edge or span.min() < 0.011
        for lp, (a, b) in zip(f.loops, A):
            fa, fb = (a - lo[0]) / span[0], (b - lo[1]) / span[1]
            if edge:
                xx, yy = 0.86 + 0.1 * fa, 0.56 + 0.38 * fb
            else:
                xx, yy = 0.02 + 0.78 * fa, 0.52 + 0.46 * fb
            lp[uv].uv = (u0 + 0.5 * xx, v0 + 0.5 * (1 - yy))


def _uv_box(bm, faces, quad, scale=1.4):
    """Box-project faces into one texture quadrant."""
    uv = bm.loops.layers.uv.verify()
    u0, v0 = QUAD[quad]
    for f in faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for lp in f.loops:
            c = lp.vert.co
            a, b = [(c.y, c.z), (c.x, c.z), (c.x, c.y)][ax]
            lp[uv].uv = (u0 + (a * scale) % 0.5, v0 + (b * scale) % 0.5)


def _cyl(bm, y0, y1, r0, r1, seg=12):
    rings = []
    for y, r in ((y0, r0), (y1, r1)):
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / seg), y, r * math.sin(2 * math.pi * i / seg))) for i in range(seg)])
    faces = [bm.faces.new((rings[0][i], rings[0][(i + 1) % seg], rings[1][(i + 1) % seg], rings[1][i])) for i in range(seg)]
    faces.append(bm.faces.new(rings[0][::-1]))
    faces.append(bm.faces.new(rings[1]))
    return faces


def _box(bm, lo, hi, bevel=0.0):
    res = bmesh.ops.create_cube(bm, size=1.0)
    for v in res["verts"]:
        v.co = [lo[i] + (v.co[i] + 0.5) * (hi[i] - lo[i]) for i in range(3)]
    if bevel:
        edges = list({e for v in res["verts"] for e in v.link_edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=2, affect="EDGES", profile=0.5)
    return list({f for v in res["verts"] if v.is_valid for f in v.link_faces})


def _rivets(bm, pts, r=0.014):
    out = []
    for c in pts:
        res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        for v in res["verts"]:
            v.co = v.co + __import__("mathutils").Vector(c)
        out += list({f for v in res["verts"] for f in v.link_faces})
    return out


def _haft(bm, top, mats, short=False):
    parts = []
    b = CHOKE - 0.3 if short else -0.36                                   # one-handed: butt 0.3 below the fist
    f = _cyl(bm, b, top, 0.033, 0.03)
    parts.append((f, "wood"))
    grips = ((CHOKE - 0.14, CHOKE + 0.14),) if short else ((-0.34, -0.1), (-0.06, 0.2))
    for y0, y1 in grips:                                                  # leather grips
        parts.append((_cyl(bm, y0, y1, 0.038, 0.038, 14), "leather"))
    parts.append((_cyl(bm, b - 0.08, b + 0.01, 0.038, 0.058, 8), "iron"))  # pommel
    parts.append((_cyl(bm, top - 0.06, top + 0.01, 0.043, 0.043, 10), "iron"))  # collar
    return parts


def maul(bm, short=False):
    parts = _haft(bm, 0.82, None, short)
    parts.append((_box(bm, (-0.12, 0.83, -0.09), (0.2, 1.05, 0.09), 0.02), "iron"))      # waisted core
    parts.append((_box(bm, (0.17, 0.79, -0.135), (0.25, 1.09, 0.135), 0.018), "steel"))   # flanged striking face
    parts.append((_box(bm, (0.25, 0.815, -0.115), (0.29, 1.065, 0.115), 0.012), "steel"))  # stepped face
    parts.append((_box(bm, (-0.15, 0.81, -0.115), (-0.09, 1.07, 0.115), 0.015), "steel"))  # back flange
    for y0 in (0.86, 0.995):                                                          # iron bands round the core
        parts.append((_box(bm, (-0.13, y0, -0.1), (0.21, y0 + 0.025, 0.1), 0.005), "iron"))
    parts.append((_rivets(bm, [(x, y, s * 0.1) for x in (-0.07, 0.03, 0.13) for y in (0.8725, 1.0075) for s in (1, -1)], 0.017), "steel", "edge"))
    for sx, sz in ((0.05, 0.05), (0.05, -0.05), (-0.02, 0.0)):                         # spiked crown
        cone = _cyl(bm, 0, 0.11, 0.035, 0.002, 8)
        for f in cone:
            for v in f.verts:
                if not hasattr(v, "_done"):
                    pass
        for v in {v for f in cone for v in f.verts}:
            x, y, z = v.co
            v.co = (sx + x, 1.05 + y, sz + z)
        parts.append((cone, "steel"))
    spike = _cyl(bm, 0, 0.15, 0.06, 0.005, 8)                                        # back spike
    for f in spike:
        for v in f.verts:
            if v.co.y < 9:
                pass
    parts.append((spike, "iron"))
    return parts, spike


def axe(bm):
    parts = _haft(bm, 0.98, None)
    outline = [(0.03, 0.64), (0.12, 0.58), (0.19, 0.47), (0.26, 0.365), (0.4, 0.3725), (0.5, 0.5),
               (0.508, 0.55), (0.49, 0.565), (0.512, 0.58),                                    # nicks in the edge, uneven
               (0.54, 0.76), (0.52, 0.92), (0.511, 0.928), (0.5175, 0.94),
               (0.51, 1.0), (0.498, 1.0255), (0.478, 1.031), (0.486, 1.051),
               (0.43, 1.17), (0.32, 1.27), (0.23, 1.15), (0.12, 1.07), (0.03, 1.0)]
    outline = [(0.03 + (x - 0.03) * 0.8, 0.82 + (y - 0.82) * 0.8) for x, y in outline]   # a size smaller
    top = [bm.verts.new((x, y, 0.042)) for x, y in outline]
    bot = [bm.verts.new((x, y, -0.042)) for x, y in outline]
    n = len(outline)
    blade = [bm.faces.new(top), bm.faces.new(bot[::-1])]
    for i in range(n - 1):
        blade.append(bm.faces.new((top[i], top[i + 1], bot[i + 1], bot[i])))
    blade.append(bm.faces.new((top[-1], top[0], bot[0], bot[-1])))
    for v in top + bot:                                                              # taper to the edge
        k = min(1.0, max(0.0, (v.co.x - 0.08) / 0.36))
        v.co.z *= 1 - 0.9 * k ** 1.4                                                 # thick spine to a thin edge
    blade_uv = blade
    parts.append((blade, "steel"))
    parts.append((_box(bm, (-0.05, 0.58, -0.055), (0.07, 1.02, 0.055), 0.012), "iron"))  # socket
    parts.append((_rivets(bm, [(0.01, y, s * 0.056) for y in (0.66, 0.8, 0.94) for s in (1, -1)], 0.013), "steel", "edge"))
    spike = _cyl(bm, 0, 0.16, 0.05, 0.004, 8)
    parts.append((spike, "iron"))
    return parts, spike


def build(name, maker, mats, coll):
    bm = bmesh.new()
    parts, spike = maker(bm)
    # the back spike points out of the head along -X
    spv = {v for f in spike for v in f.verts}
    mau = "Maul" in name
    yc = 0.94 if mau else 0.8
    for v in spv:
        y = v.co.y
        v.co = (-0.15 - y if mau else -0.05 - y, yc + v.co.z, v.co.x)
    bm.normal_update()
    order = ["iron", "wood", "leather", "steel"]
    for part in parts:
        faces, mat = part[0], part[1]
        for f in faces:
            if f.is_valid:
                f.material_index = 0 if mat in ("iron", "steel") else (1 if mat == "wood" else 2)
        fv = [f for f in faces if f.is_valid]
        if mat in ("iron", "steel"):
            _uv_plates(bm, fv, mat, len(part) > 2)
        else:
            _uv_box(bm, fv, mat)
    if name.endswith("Axe"):                      # blade: steel mapped by distance to the edge
        uv = bm.loops.layers.uv.verify()
        for part in parts:
            faces, mat = part[0], part[1]
            if mat != "steel" or len(part) > 2:
                continue
            for f in faces:
                for lp in f.loops:
                    x, y = lp.vert.co.x, lp.vert.co.y
                    lp[uv].uv = (0.5 + min(0.49, max(0.0, (x - 0.02) / 0.43) * 0.49), 0.25 + min(0.245, max(0.0, (y - 0.35) / 0.9) * 0.245))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = False
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def materials(img):
    out = []
    for nm, metal, rough in (("WeaponIron", 0.55, 0.62), ("WeaponWood", 0.0, 0.82), ("WeaponLeather", 0.0, 0.7)):
        m = bpy.data.materials.new(nm)
        m.use_nodes = True
        nt = m.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
        out.append(m)
    return out


def attach(ARM, G_r, out_dir, coll):
    """Make both weapons and hang them on hand_r at the fist's grip frame (rest pose)."""
    img = texture(os.path.join(out_dir, "brute_weapons.png"))
    mats = materials(img)
    obs = [build("Weapon_Maul", maul, mats, coll), build("Weapon_Axe", axe, mats, coll),
           build("Weapon_MaulOneHand", lambda bm: maul(bm, short=True), mats, coll)]
    obs[2].data.transform(__import__("mathutils").Matrix.Translation((0, -CHOKE, 0)))   # choked up the haft
    ARM.data.pose_position = "REST"
    bpy.context.view_layer.update()
    M = ARM.matrix_world @ ARM.data.bones["hand_r"].matrix_local @ G_r
    for ob in obs:
        ob.parent = ARM
        ob.parent_type = "BONE"
        ob.parent_bone = "hand_r"
        ob.matrix_world = M
    ARM.data.pose_position = "POSE"      # (left in REST, every clip would export frozen)
    bpy.context.view_layer.update()
    return obs
