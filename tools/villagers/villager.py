"""A male villager of Bellmourn from the Humans FBX: its body, rig and clips, a realistic head
(headbuild.py) wearing a VELSCOUR face, and the clothes re-textured with the cloth tiles.

blender-python villager.py -- <fbx> <out_dir> '<json config>' [stages...]
stages: face (close-ups), body (idle full length), blend (save .blend)"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy, bmesh, json, math, mathutils
import numpy as np
from PIL import Image
from common import *
import mh, headbuild, clothes

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
FBX, OUT, CFG = argv[0], argv[1], json.loads(argv[2])
STAGES = argv[3:] or ['face']
os.makedirs(OUT, exist_ok=True)

SRC = os.environ.get('BM_VILLAGER_SRC', os.path.join(mh.REPO, 'art', 'raw', 'villagers'))
PACK = os.path.join(SRC, 'faces')
CL = os.path.join(SRC, 'build', 'cloth')   # prep_cloth.py's maps
PROXY = mh.DATA + '/proxies/'

# each face's own hair (sRGB) and how thick it's cropped (0 shaved .. 1 full)
FACES = {
    '01_Fair_Skin': ((0.40, 0.29, 0.19), 0.65), '02_Tan_Skin': ((0.15, 0.105, 0.075), 0.8),
    '03_Weathered_Veteran': ((0.44, 0.42, 0.40), 0.6, 0.3), '04_Dark_Stubble': ((0.15, 0.13, 0.12), 0.8),
    '05_Scarred_Warrior': ((0.22, 0.16, 0.12), 0.25), '06_Freckled_Redhead': ((0.46, 0.20, 0.08), 0.75),
    '07_Olive_Skin': ((0.075, 0.06, 0.05), 0.85), '08_Nordic_Pale': ((0.62, 0.50, 0.33), 0.65),
    '09_Tattooed_Berserker': ((0.13, 0.11, 0.10), 0.5), '10_Deep_Brown_Skin': ((0.065, 0.055, 0.05), 0.8)}
C = dict(outfit='Adventurer', face='03_Weathered_Veteran', scale=1.04, eye_z=1.70, neck=2.8, fwd=0.0,
         morph={'caucasian-male-young': 0.6, 'caucasian-male-old': 0.4}, hair=None, shells=3,
         hair_color=None, crop=None, line=0.0, pepper=None, eye='brown', iris_tint=(0.53, 0.75, 0.8), sclera=0.74,
         # the clothes: each of the outfit's material slots -> [cloth tile, value gain, metres per repeat]
         dress={'Green': ['leather_tooled', 1.0, 0.42], 'LightGreen': ['linen_brown', 1.0, 0.3],
                'Brown': ['burlap_dark', 1.0, 0.3], 'Brown2': ['leather_strapwork', 1.0, 0.3],
                'Grey': ['leather_strapwork', 0.8, 0.3], 'Black': ['leather_tooled', 0.45, 0.25]},
         subdiv=1, sleeves='LightGreen')
C.update(CFG)

arm = load(FBX)
arm.data.pose_position = 'REST'
sc = bpy.context.scene


def link(o):
    sc.collection.objects.link(o)
    return o


def mesh_obj(name, verts, faces, uv_faces=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [list(f) for f in faces])
    if uv_faces is not None:
        uvl = me.uv_layers.new(name='UVMap')
        for poly, uvs in zip(me.polygons, uv_faces):
            for li, uv in zip(poly.loop_indices, uvs):
                uvl.data[li].uv = (float(uv[0]), float(uv[1]))
    me.update()
    o = bpy.data.objects.new(name, me)
    return link(o)


def smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True


# ------------------------------------------------------------------ the head
base = mh.Base()
H = headbuild.Head(base).build(C['morph'], neck=C['neck'])
d = json.load(open(mh.DATA + '/models/human_full_size.json'))
jp = d['metadata']['joint_pos_idxs']
c_mh = H.v[jp['head____head']].mean(0)
Qhead = np.array(arm.data.bones['Head'].head_local)
s = 0.1 * C['scale']


# the skull's base over the head bone, front to back; the eyes at eye_z
anchor = np.array([0, Qhead[1] - C['fwd'], C['eye_z'] - (H.eyes_at(H.v)[1] - c_mh[1]) * s])


def to_b(p):
    q = p - c_mh
    return np.stack([q[:, 0], -q[:, 2], q[:, 1]], 1) * s + anchor


head = mesh_obj('V_Head', to_b(H.hv), H.faces, H.uvs)
smooth(head)
# the head's UVs: MakeHuman's islands laid out again, the head itself (face, scalp, ears) over
# most of the texture and the small hidden ones (mouth, eye sockets, the neck's foot) in a column
# beside it. Stretched to fit: the bake is per texel, so texels may be wider than tall.
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
key, rows, cols = {}, [], []
for fi, uv in enumerate(H.uvs):
    for p in uv:
        k = (round(float(p[0]), 5), round(float(p[1]), 5))
        if k in key:
            rows.append(fi); cols.append(key[k])
        else:
            key[k] = fi
nf = len(H.uvs)
_, lab = connected_components(coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(nf, nf)), directed=False)
order = sorted(set(lab), key=lambda c: -(lab == c).sum())
boxes = {order[0]: (0.004, 0.004, 0.80, 0.996)}
small = order[1:]
for i, c in enumerate(small):
    boxes[c] = (0.81, 0.004 + i / len(small), 0.996, (i + 1) / len(small) - 0.004)
uvl = head.data.uv_layers['UVMap']
for c, (x0, y0, x1, y1) in boxes.items():
    fs = np.where(lab == c)[0]
    U = np.concatenate([H.uvs[f] for f in fs]); lo, hi = U.min(0), U.max(0)
    for f in fs:
        for li, p in zip(head.data.polygons[f].loop_indices, H.uvs[f]):
            t = (np.array(p) - lo) / np.maximum(hi - lo, 1e-9)
            uvl.data[li].uv = (float(x0 + t[0] * (x1 - x0)), float(y0 + t[1] * (y1 - y0)))
uv_faces = [[tuple(uvl.data[li].uv) for li in p.loop_indices] for p in head.data.polygons]
H.warp()
atlas = f"{PACK}/Face_And_Body_Atlases/{C['face']}_Head_Body_UV_1024.png"
hair_srgb = C['hair_color'] or FACES[C['face']][0]
crop = C['crop'] if C['crop'] is not None else FACES[C['face']][1]
pepper = C['pepper'] if C['pepper'] is not None else (FACES[C['face']][2] if len(FACES[C['face']]) > 2 else 0.0)
hair_lin = [((c + 0.055) / 1.055) ** 2.4 for c in hair_srgb]
H.raster(uv_faces, 2048)
img = H.bake(atlas, hair=hair_srgb, crop=crop, line=C['line'], pepper=pepper)
tex_path = f"{OUT}/head_{C['face']}.png"
Image.fromarray(img).save(tex_path)
shell_path = f"{OUT}/hair_{C['face']}.png"
Image.fromarray(H.shell(hair_srgb, crop=crop, line=C['line'], pepper=pepper), 'RGBA').save(shell_path)
print('baked', tex_path)


def tex_node(nt, path, cs='sRGB', ext='REPEAT'):
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(path, check_existing=True)
    t.image.colorspace_settings.name = cs
    t.extension = ext
    return t


def skin_material(name, path, coords=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = tex_node(nt, path, ext='EXTEND' if coords is None else 'REPEAT')
    if coords is not None:
        coords(nt, t)
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.52
    b.inputs['Specular IOR Level'].default_value = 0.45
    b.inputs['Subsurface Weight'].default_value = 0.12
    b.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)
    b.inputs['Subsurface Scale'].default_value = 0.004
    # pores and creases from the painting
    bw = nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(t.outputs['Color'], bw.inputs[0])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.12; bump.inputs['Distance'].default_value = 0.0015
    nt.links.new(bw.outputs[0], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


head.data.materials.append(skin_material('V_Skin_Head', tex_path))

# ------------------------------------------------------------------ eyes, lashes, hair


def proxy_obj(name, path, mat):
    p = mh.proxy(path)
    pv = mh.fit_proxy(p, H.v, base.v0)
    uvs = [p['uvs'][u] for u in p['fuv']] if p['uvs'] is not None else None
    o = mesh_obj(name, to_b(pv), p['faces'], uvs)
    smooth(o)
    o.data.materials.append(mat)
    return o, p


def eye_material(kind):
    m = bpy.data.materials.new('V_Eye')
    m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = tex_node(nt, f'{PROXY}eyes/Low-Poly/textures/{kind}_eye.png')
    src = t.outputs['Color']
    if C['iris_tint']:
        hsv = nt.nodes.new('ShaderNodeHueSaturation')
        hsv.inputs['Hue'].default_value, hsv.inputs['Saturation'].default_value, hsv.inputs['Value'].default_value = C['iris_tint']
        nt.links.new(src, hsv.inputs['Color']); src = hsv.outputs['Color']
    dim = nt.nodes.new('ShaderNodeMix'); dim.data_type = 'RGBA'; dim.blend_type = 'MULTIPLY'; dim.inputs[0].default_value = 1.0
    nt.links.new(src, dim.inputs[6]); dim.inputs[7].default_value = (C['sclera'], C['sclera'] * 0.97, C['sclera'] * 0.94, 1)
    nt.links.new(dim.outputs[2], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.06
    b.inputs['Coat Weight'].default_value = 0.6
    return m


def alpha_material(name, path, tint=None, rough=0.6, aniso=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = tex_node(nt, path)
    col = t.outputs['Color']
    if tint is not None:
        bw = nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(col, bw.inputs[0])
        mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
        mul.inputs[0].default_value = 1.0
        g = nt.nodes.new('ShaderNodeMath'); g.operation = 'MULTIPLY'; g.inputs[1].default_value = 2.6
        nt.links.new(bw.outputs[0], g.inputs[0])
        cr = nt.nodes.new('ShaderNodeCombineColor')
        for k in range(3):
            nt.links.new(g.outputs[0], cr.inputs[k])
        nt.links.new(cr.outputs[0], mul.inputs[6]); mul.inputs[7].default_value = (*tint, 1)
        col = mul.outputs[2]
    nt.links.new(col, b.inputs['Base Color'])
    nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = rough
    if aniso:
        b.inputs['Specular IOR Level'].default_value = 0.35
    m.blend_method = 'HASHED' if hasattr(m, 'blend_method') else None
    return m


eyes, _ = proxy_obj('V_Eyes', 'eyes/Low-Poly/Low-Poly.json', eye_material(C['eye']))
lashes, _ = proxy_obj('V_Lashes', 'eyelashes/Eyelashes01/Eyelashes01.json',
                      alpha_material('V_Lashes', f'{PROXY}eyelashes/Eyelashes01/textures/eyelashes01.png', rough=0.7))
extra = [eyes, lashes]


def shell_material(name, path, cut):
    m = bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = tex_node(nt, path)
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = cut
    nt.links.new(t.outputs['Alpha'], gt.inputs[0]); nt.links.new(gt.outputs[0], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = 0.72
    b.inputs['Specular IOR Level'].default_value = 0.22
    m['alpha_cutoff'] = cut
    return m


shells = []
if C['shells']:
    vh = H.vertex_hair(line=C['line'])
    hv_b = np.array([v.co[:] for v in head.data.vertices]); hn_b = np.array([v.normal[:] for v in head.data.vertices])
    sf = [i for i, f in enumerate(H.faces) if vh[f].max() > 0.02]
    for k in range(C['shells']):
        off = 0.0011 + 0.0014 * k
        verts = hv_b + hn_b * (off * np.clip(vh * 1.3, 0.15, 1))[:, None]
        o = mesh_obj(f'V_HairShell{k}', verts, [H.faces[i] for i in sf], [uv_faces[i] for i in sf])
        smooth(o)
        o.data.materials.append(shell_material(f'V_HairShell{k}', shell_path, 0.18 + 0.22 * k))
        shells.append(o)
if C['hair']:
    hp = mh.proxy(f"hair/{C['hair']}/{C['hair']}.json")
    tex = os.path.join(hp['dir'], hp['materials'][0]['mapDiffuse'])
    hair, _ = proxy_obj('V_Hair', f"hair/{C['hair']}/{C['hair']}.json", alpha_material('V_Hair', tex, tint=hair_lin, rough=0.55, aniso=True))
    extra.append(hair)

# ------------------------------------------------------------------ the body
keep = [f"{C['outfit']}_Body", f"{C['outfit']}_Legs" if f"{C['outfit']}_Legs" in bpy.data.objects else f"{C['outfit']}_Pants", f"{C['outfit']}_Feet"]
keep = C.get('parts', keep)
donor = bpy.data.objects[f"{C['outfit']}_Head"] if f"{C['outfit']}_Head" in bpy.data.objects else bpy.data.objects['Casual_Head']
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name not in keep and not o.name.startswith('V_') and o is not donor:
        bpy.data.objects.remove(o)


def weights_from(dst, src, k=4):
    """Copy armature weights to dst's vertices from the nearest of src's (bind pose)."""
    kd = mathutils.kdtree.KDTree(len(src.data.vertices))
    for v in src.data.vertices:
        kd.insert(src.matrix_world @ v.co, v.index)
    kd.balance()
    names = [g.name for g in src.vertex_groups]
    for n in names:
        if n not in dst.vertex_groups:
            dst.vertex_groups.new(name=n)
    sw = [{src.vertex_groups[g.group].name: g.weight for g in v.groups} for v in src.data.vertices]
    for v in dst.data.vertices:
        hits = kd.find_n(dst.matrix_world @ v.co, k)
        acc = {}
        tot = 0
        for co, i, dist in hits:
            w = 1 / (dist + 1e-4)
            tot += w
            for n, x in sw[i].items():
                acc[n] = acc.get(n, 0) + x * w
        s_ = sum(acc.values()) or 1
        for n, x in acc.items():
            if x / s_ > 0.01:
                dst.vertex_groups[n].add([v.index], x / s_, 'REPLACE')


def rig(o):
    o.parent = arm
    md = o.modifiers.new('Armature', 'ARMATURE'); md.object = arm


weights_from(head, donor)
rig(head)
for o in shells:
    weights_from(o, head, k=1)
    rig(o)
for o in extra:
    o.vertex_groups.new(name='Head').add([v.index for v in o.data.vertices], 1.0, 'REPLACE')
    rig(o)
bpy.data.objects.remove(donor)

# ------------------------------------------------------------------ the clothes
SKIN_TILE = f"{PACK}/Seamless_Skin_Tiles/{C['face']}_Skin_Seamless_1024.png"
if not os.path.exists(SKIN_TILE):
    SKIN_TILE = [f for f in __import__('glob').glob(f"{PACK}/Seamless_Skin_Tiles/{C['face'][:2]}_*.png")][0]
SHEEN = {'linen': 0.25, 'burlap': 0.2, 'quilted': 0.3, 'damask': 0.6, 'leather': 0.0}


def cloth_material(name, cloth, gain=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tc = tex_node(nt, f'{CL}/{cloth}.png'); tn = tex_node(nt, f'{CL}/{cloth}_n.png', 'Non-Color'); tr = tex_node(nt, f'{CL}/{cloth}_r.png', 'Non-Color')
    col = tc.outputs['Color']
    if gain != 1.0:
        hsv = nt.nodes.new('ShaderNodeHueSaturation'); hsv.inputs['Value'].default_value = gain
        nt.links.new(col, hsv.inputs['Color']); col = hsv.outputs['Color']
    nt.links.new(col, b.inputs['Base Color'])
    nt.links.new(tr.outputs['Color'], b.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 1.0
    nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Sheen Weight'].default_value = SHEEN[cloth.split('_')[0]]
    b.inputs['Sheen Roughness'].default_value = 0.4
    if cloth.startswith('leather'):
        b.inputs['Specular IOR Level'].default_value = 0.55
    m['cloth'] = cloth
    return m


def body_skin_material():
    """The seamless skin tile, its colour brought to the face's (the atlas's neck)."""
    m = skin_material('V_Skin_Body', SKIN_TILE, coords=lambda nt, t: None)
    tile = np.asarray(Image.open(SKIN_TILE).convert('RGB'), dtype=np.float64).reshape(-1, 3).mean(0)
    a_ = np.asarray(Image.open(atlas).convert('RGB'), dtype=np.float64)
    cheeks = np.concatenate([a_[400:470, 300:360].reshape(-1, 3), a_[400:470, 668:728].reshape(-1, 3)]).mean(0)
    gain = [(0.92 * f / max(t, 1)) ** 2.2 for f, t in zip(cheeks, tile)]
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = [n for n in nt.nodes if n.type == 'TEX_IMAGE'][0]
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1.0
    nt.links.new(t.outputs['Color'], mul.inputs[6]); mul.inputs[7].default_value = (*gain, 1)
    nt.links.new(mul.outputs[2], b.inputs['Base Color'])
    print('body skin gain', [round(g, 3) for g in gain])
    return m


mats = {}
tiles = {}
for slot, (cloth, gain, tile) in C['dress'].items():
    mats[slot] = cloth_material(f'V_{slot}_{cloth}', cloth, gain); tiles[slot] = tile
mats['Skin'] = body_skin_material(); tiles['Skin'] = 0.22
def long_sleeves(o, slot):
    """His arms in the undershirt: the skin of the upper and lower arm becomes the slot's cloth."""
    names = [m.name for m in o.data.materials]
    if 'Skin' not in names or slot not in C['dress']:
        return
    if slot not in names:
        o.data.materials.append(bpy.data.materials.get(slot) or bpy.data.materials.new(slot)); names.append(slot)
    si, ci = names.index('Skin'), names.index(slot)
    tuck = set()
    gi = {g.index: g.name for g in o.vertex_groups}
    for p in o.data.polygons:
        if p.material_index != si:
            continue
        w = {}
        for i in p.vertices:
            for g in o.data.vertices[i].groups:
                w[gi[g.group]] = w.get(gi[g.group], 0) + g.weight
        top = max(w, key=w.get) if w else ''
        if top.startswith(('UpperArm', 'LowerArm', 'Shoulder')):
            p.material_index = ci
        elif top in ('Neck', 'Chest', 'Torso', 'Abdomen', 'Hips', 'Head'):
            # the chest and the back of the neck under the collar: the undershirt, tucked in a
            # little so the jacket over it never lets it through
            p.material_index = ci
            tuck.update(p.vertices)
    only = set(tuck)
    for p in o.data.polygons:
        if p.material_index != ci:
            only.difference_update(p.vertices)
    for i in only:
        v = o.data.vertices[i]
        v.co -= v.normal * 0.006


def smaller_hands(o, k=C.get('hands', 0.86)):
    """The FBX's hands are a cartoon's: drawn in toward each wrist, in the bind pose (so every
    clip still moves them right)."""
    gi = {g.index: g.name for g in o.vertex_groups}
    for side in ('L', 'R'):
        if f'Wrist.{side}' not in arm.data.bones:
            continue
        c = arm.data.bones[f'Wrist.{side}'].head_local
        for v in o.data.vertices:
            w = sum(g.weight for g in v.groups if gi[g.group].endswith('.' + side) and gi[g.group].startswith(('Wrist', 'Index', 'Middle', 'Ring', 'Pinky', 'Thumb')))
            if w > 0:
                f = 1 - (1 - k) * min(1, w)
                v.co = c + (v.co - c) * f


for name in keep:
    o = bpy.data.objects[name]
    smaller_hands(o)
    if C['sleeves']:
        long_sleeves(o, C['sleeves'])
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.selected_objects:
        x.select_set(False)
    o.select_set(True)
    try:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except Exception as e:
        print('normals', e)
    smooth(o)
    clothes.unwrap(o, arm, lambda mn: tiles.get(mn, 0.3))
    for i, m in enumerate(o.data.materials):
        if m.name in mats:
            o.data.materials[i] = mats[m.name]
        else:
            print('undressed slot', name, m.name)
    if C['subdiv']:
        sd = o.modifiers.new('Subdiv', 'SUBSURF'); sd.levels = sd.render_levels = C['subdiv']
        bpy.ops.object.modifier_move_to_index(modifier='Subdiv', index=0)

# ------------------------------------------------------------------ renders
arm.data.pose_position = 'POSE'
pose(arm, 'Idle', C.get('frame', 12))
studio()
cam = camera((0, -1.0, 1.65), (0, 0, 1.65), lens=85)

hb = arm.pose.bones['Head']
hp_ = arm.matrix_world @ hb.head
eye_z = float(np.mean([(eyes.matrix_world @ v.co).z for v in eyes.data.vertices]))
fc = mathutils.Vector((hp_.x, hp_.y - 0.02, eye_z - 0.035))
if 'face' in STAGES:
    for i, (az, el, dist, lens) in enumerate([(0, 0, 0.62, 85), (-35, 4, 0.62, 85), (-88, 2, 0.62, 85), (30, -3, 0.62, 85)]):
        a = math.radians(az); e = math.radians(el)
        loc = fc + mathutils.Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
        cam.data.lens = lens
        look(cam, loc, fc)
        cycles((560, 640), C.get('samples', 48), f'{OUT}/face_{i}.png')
if 'body' in STAGES or 'body2' in STAGES:
    for i, az in enumerate([0, -35, 35, 180] if 'body' in STAGES else [-25]):
        a = math.radians(az)
        cam.data.lens = 60
        tgt = mathutils.Vector((0, -0.02, 0.92))
        look(cam, tgt + mathutils.Vector((math.sin(a), -math.cos(a), 0.05)) * 3.6, tgt)
        cycles((600, 1000), C.get('samples', 48), f'{OUT}/body_{i}.png')
if 'back' in STAGES:
    for i, (az, el) in enumerate([(180, 10), (140, 25)]):
        a = math.radians(az); e = math.radians(el)
        tgt = mathutils.Vector((0, -0.02, 1.5))
        cam.data.lens = 70
        look(cam, tgt + mathutils.Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * 1.1, tgt)
        cycles((600, 600), C.get('samples', 32), f'{OUT}/back_{i}.png')
if 'hero' in STAGES:
    # the presentation: on a cobbled street of the village, late-day light
    for l in [o for o in bpy.data.objects if o.type == 'LIGHT']:
        bpy.data.objects.remove(l)
    g = bpy.data.meshes.new('ground'); g.from_pydata([(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [], [(0, 1, 2, 3)])
    uvg = g.uv_layers.new(name='UVMap')
    for li, uv in zip(g.polygons[0].loop_indices, [(0, 0), (6, 0), (6, 6), (0, 6)]):
        uvg.data[li].uv = uv
    gm = bpy.data.materials.new('ground'); gm.use_nodes = True; gb = gm.node_tree.nodes['Principled BSDF']
    gt = tex_node(gm.node_tree, os.path.join(mh.REPO, 'assets/textures/biome/floors/town_grey_cobbles.png')); gt.interpolation = 'Closest'
    gm.node_tree.links.new(gt.outputs['Color'], gb.inputs['Base Color']); gb.inputs['Roughness'].default_value = 0.9
    g.materials.append(gm); link(bpy.data.objects.new('ground', g))
    w = sc.world; w.node_tree.nodes['Background'].inputs[0].default_value = (0.045, 0.04, 0.038, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
    area('key', (-2.2, -3.0, 3.4), (0, 0, 1.1), 900, 1.4, (1.0, 0.86, 0.68))
    area('fill', (2.8, -2.2, 1.6), (0, 0, 1.0), 160, 3.0, (0.7, 0.8, 1.0))
    area('rim', (1.2, 2.8, 2.6), (0, 0, 1.3), 520, 1.2, (1.0, 0.82, 0.6))
    area('rim2', (-1.8, 2.4, 2.0), (0, 0, 1.4), 220, 1.0, (0.8, 0.85, 1.0))
    for name, az, el, dist, lens, tz, res in [('hero_34', -32, 6, 4.4, 70, 0.93, (1200, 1700)), ('hero_front', 0, 4, 4.4, 70, 0.93, (900, 1500)),
                                              ('hero_back', 160, 6, 4.4, 70, 0.93, (900, 1500)), ('hero_face', -22, 2, 0.95, 90, None, (1000, 1000))]:
        if C.get('views') and name not in C['views']:
            continue
        a = math.radians(az); e = math.radians(el)
        tgt = mathutils.Vector((0, -0.02, tz)) if tz else fc + mathutils.Vector((0, 0, 0.01))
        cam.data.lens = lens
        look(cam, tgt + mathutils.Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist, tgt)
        cycles(res, C.get('samples', 96), f'{OUT}/{name}.png')
if 'glb' in STAGES:
    # --- for three.js: every material as plain textures (tints baked into the images) and the
    # clips the village plays, under its names
    def srgb2lin(c):
        return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

    def lin2srgb(c):
        c = np.clip(c, 0, 1)
        return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)

    def baked(img, fn, name):
        a = np.asarray(Image.open(bpy.path.abspath(img.filepath)).convert('RGBA'), dtype=np.float64) / 255
        a[..., :3] = fn(a[..., :3])
        path = f'{OUT}/tex/{name}.png'
        os.makedirs(f'{OUT}/tex', exist_ok=True)
        Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'RGBA' if a[..., 3].min() < 0.999 else None).convert('RGBA' if a[..., 3].min() < 0.999 else 'RGB').save(path)
        return bpy.data.images.load(path)

    def hsv_adjust(rgb, h, sat, val):
        mx = rgb.max(-1); mn = rgb.min(-1); d = mx - mn + 1e-9
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        hh = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
        ss = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-9), 0); vv = mx
        hh = (hh + h - 0.5) % 1; ss = np.clip(ss * sat, 0, 1); vv = vv * val
        i = np.floor(hh * 6); f = hh * 6 - i; p = vv * (1 - ss); q = vv * (1 - f * ss); t = vv * (1 - (1 - f) * ss)
        i = i.astype(int) % 6
        out = np.choose(i[..., None].repeat(3, -1).transpose(2, 0, 1) if False else i, [vv, q, p, p, t, vv]), np.choose(i, [t, vv, vv, q, p, p]), np.choose(i, [p, p, t, vv, vv, q])
        return np.stack(out, -1)

    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
        if not b:
            continue
        tex = [n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.colorspace_settings.name == 'sRGB']
        if not tex:
            continue
        t = tex[0]
        hs = [n for n in nt.nodes if n.type == 'HUE_SAT']
        mul = [n for n in nt.nodes if n.type == 'MIX' and n.blend_type == 'MULTIPLY']
        if m.name.startswith('V_Hair') and not m.name.startswith('V_HairShell'):
            continue
        if hs or mul:
            gain_l = np.array(mul[0].inputs[7].default_value[:3]) if mul else np.ones(3)
            hsv = (hs[0].inputs['Hue'].default_value, hs[0].inputs['Saturation'].default_value, hs[0].inputs['Value'].default_value) if hs else None
            def fn(rgb, gain_l=gain_l, hsv=hsv, eye=m.name == 'V_Eye'):
                lin = srgb2lin(rgb)
                if eye:
                    lin = lin * gain_l
                    if hsv: lin = hsv_adjust(lin, *hsv)
                else:
                    if hsv: lin = hsv_adjust(lin, *hsv)
                    lin = lin * gain_l
                return lin2srgb(lin)
            t.image = baked(t.image, fn, m.name)
            for n in hs + mul:
                nt.nodes.remove(n)
            nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
        for n in [n for n in nt.nodes if n.type in ('BUMP', 'RGBTOBW')]:
            nt.nodes.remove(n)
        b.inputs['Sheen Weight'].default_value = 0.0   # three.js draws glTF sheen as white rims
    # clips: the village's names, the rest dropped
    keep_clips = {'Idle': 'idle', 'Walk': 'walk', 'Run': 'run', 'Wave': 'wave', 'Interact': 'interact', 'Death': 'death', 'HitRecieve': 'hit'}
    for a in list(bpy.data.actions):
        short = a.name.split('|')[-1]
        if short in keep_clips:
            a.name = keep_clips[short]
        else:
            bpy.data.actions.remove(a)
    arm.animation_data.action = None
    for a in bpy.data.actions:
        tr = arm.animation_data.nla_tracks.new(); tr.name = a.name
        st = tr.strips.new(a.name, int(a.frame_range[0]), a.copy() if False else a)
        tr.mute = True
    arm.data.pose_position = 'POSE'
    for o in list(bpy.data.objects):
        if o.type in ('CAMERA', 'LIGHT') or o.name == 'ground':
            bpy.data.objects.remove(o)
    glb = f"{OUT}/{C.get('name', 'villager')}.glb"
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True,
                              export_animations=True, export_animation_mode='NLA_TRACKS', export_image_format='WEBP',
                              export_image_quality=82,
                              export_yup=True, export_skins=True, export_morph=False)
    print('exported', glb, os.path.getsize(glb))
if 'blend' in STAGES:
    bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/villager.blend')
print('done')
