"""Rework the Quaternius packs into Bellmourn's kit: every model reshaped, repainted and bundled.

  blender -b --factory-startup --python tools/kit/rework.py -- <raw_dir> <out_dir> [pack ...]

<raw_dir> is art/raw/quaternius; <out_dir> is templates/models/kit. For each pack this writes
<out_dir>/<pack>.glb (every model as a named node, materials named after the repainted atlases
in <out_dir>/tex, no images inside) and merges each model's facts into <out_dir>/kit.json.
The 'bellmourn' pack is the recombined pieces (graves, gallows, shrines...) built from the
others. Run repaint.py first.

What happens to every model (recipes.py says which, per category and per model):
- scaled to Bellmourn metres, pivots kept (the modular pieces still snap on their 2 m grid);
- materials swapped for the repainted atlases; the packs with flat colours (Ultimate Nature,
  Modular Dungeon) are painted face by face into the palette swatch atlas, each face a shade
  either side of its ramp, so the low-poly facets read as hand-painted;
- the geometry aged: warped off true, sagging, leaning, twisted, knotted, chipped, broken,
  holed or torn, and dressed with iron bands, spikes, wax runs, moss, fungus and thorns;
- variants where the world wants them: ruined walls, holed roofs, broken columns, bare trees;
- trees and big rocks get a low-detail copy (`~lod`) for distance.
"""
import json
import math
import os
import random
import re
import sys
import zlib

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import deform as D  # noqa: E402
import recipes  # noqa: E402
from packs import sources  # noqa: E402


def seed_of(name):
    return zlib.crc32(name.encode()) & 0x7fffffff


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name):
    m = bpy.data.materials.get(name)
    if not m:
        m = bpy.data.materials.new(name)
    return m


def import_model(path, scale):
    before = set(bpy.data.objects)
    if path.endswith('.gltf') or path.endswith('.glb'):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    names = [o.name for o in new]
    meshes = [o for o in new if o.type == 'MESH']
    # bake every transform (and parenting) into the meshes, then join them
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    for nm in names:
        o = bpy.data.objects.get(nm)
        if o is not None and o != ob:
            bpy.data.objects.remove(o, do_unlink=True)
    if scale != 1:
        ob.data.transform(Matrix.Scale(scale, 4))
    for a in list(ob.data.attributes):  # the packs' vertex tints would fight the palette
        if a.domain in ('POINT', 'CORNER') and a.data_type in ('FLOAT_COLOR', 'BYTE_COLOR') and not a.name.startswith('.'):
            try:
                ob.data.attributes.remove(a)
            except Exception:  # noqa: BLE001
                pass
    return ob


def remap_materials(ob, pack, name):
    """Swap each slot for its repainted atlas (or the swatch); returns {atlas: slot index},
    the swatch slot, and {slot: (ramp, shade)} for flat-coloured slots."""
    me = ob.data
    old = [s.material.name if s.material else '' for s in ob.material_slots]
    if not old:
        old = ['']
    keep = me.attributes.new('orig_mat', 'INT', 'FACE')
    keep.data.foreach_set('value', [p.material_index for p in me.polygons])
    targets, flat = [], {}
    for i, mname in enumerate(old):
        atlas, paint = recipes.atlas_for(pack, name, mname)
        targets.append(atlas)
        if paint:
            flat[i] = paint
    if 'swatch' not in targets:
        targets.append('swatch')
    uniq = list(dict.fromkeys(targets))
    remap = [uniq.index(t) for t in targets]
    # (clearing a mesh's materials resets its faces' slots: set them after)
    idx = [remap[p.material_index] if p.material_index < len(remap) else 0 for p in me.polygons]
    me.materials.clear()
    for t in uniq:
        me.materials.append(material(t))
    me.polygons.foreach_set('material_index', idx)
    flat_by_new = {}
    for i, paint in flat.items():
        flat_by_new.setdefault(remap[i], []).append((i, paint))
    return {t: k for k, t in enumerate(uniq)}, uniq.index('swatch'), flat, remap


class Ctx:
    """What a recipe sees: the bmesh, its random stream, material slots and its notes."""

    def __init__(self, bm, pack, name, variant, mats, sw):
        self.bm, self.pack, self.name, self.variant = bm, pack, name, variant
        self.rnd = random.Random(seed_of(pack + name + variant))
        self.seed = seed_of(pack + name) % 997
        self.mats, self.sw = mats, sw
        self.notes, self.flames, self.tags = [], [], set()

    def note(self, s):
        self.notes.append(s)

    def faces(self, *atlases):
        idx = {self.mats[a] for a in atlases if a in self.mats}
        return [f for f in self.bm.faces if f.material_index in idx]


def build(pack, name, path, variant=''):
    """Import one model and rework it; returns (object, facts)."""
    scale = recipes.scale_for(pack, name)
    ob = import_model(path, scale)
    orig_names = [re.sub(r'\.\d+$', '', s.material.name) if s.material else '' for s in ob.material_slots] or ['']
    mats, sw, flat, remap = remap_materials(ob, pack, name)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    ctx = Ctx(bm, pack, name, variant, mats, sw)
    ctx.orig_names = orig_names
    # flat-coloured faces: painted into the swatch atlas (the slot index is the pre-remap one,
    # carried on a face layer before the remap collapsed slots)
    if flat:
        lay = bm.faces.layers.int.get('orig_mat')
        for f in bm.faces:
            o = f[lay] if lay else None
            if o is not None and o in flat:
                ramp, shade = flat[o]
                D.paint(bm, [f], ramp, shade, ctx.rnd)
    recipes.apply(ctx)
    bm.normal_update()
    bm.to_mesh(ob.data)
    bm.free()
    if 'orig_mat' in ob.data.attributes:
        ob.data.attributes.remove(ob.data.attributes['orig_mat'])
    ob.data.update()
    flat_shade = recipes.flat_shaded(pack, name)
    for p in ob.data.polygons:
        p.use_smooth = not flat_shade
    if not flat_shade:
        try:
            bpy.context.view_layer.objects.active = ob
            ob.select_set(True)
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
        except Exception:  # noqa: BLE001
            pass
    # drop slots nothing uses
    used = {p.material_index for p in ob.data.polygons}
    keep = [i for i in range(len(ob.data.materials)) if i in used]
    if len(keep) < len(ob.data.materials):
        mapping = {old: new for new, old in enumerate(keep)}
        mlist = [ob.data.materials[i] for i in keep]
        idx = [mapping[p.material_index] for p in ob.data.polygons]
        ob.data.materials.clear()
        for m in mlist:
            ob.data.materials.append(m)
        ob.data.polygons.foreach_set('material_index', idx)
    kid = f'{pack}/{name}' + (f'~{variant}' if variant else '')
    ob.name = kid
    ob.data.name = kid
    facts = describe(ob, pack, name, variant, ctx)
    facts['_flames_z'] = list(ctx.flames)
    return ob, facts


def describe(ob, pack, name, variant, ctx):
    co = [v.co for v in ob.data.vertices]
    lo = Vector((min(c.x for c in co), min(c.y for c in co), min(c.z for c in co)))
    hi = Vector((max(c.x for c in co), max(c.y for c in co), max(c.z for c in co)))
    # Blender z-up to three.js y-up: (x, y, z) -> (x, z, -y)
    yup = lambda v: [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]  # noqa: E731
    lo3, hi3 = yup(lo), yup(hi)
    lo3[2], hi3[2] = min(lo3[2], hi3[2]), max(lo3[2], hi3[2])
    return {
        'pack': pack, 'source': name, 'variant': variant, 'category': recipes.category(pack, name),
        'min': lo3, 'max': hi3, 'tris': sum(len(p.vertices) - 2 for p in ob.data.polygons),
        'materials': [m.name for m in ob.data.materials], 'tags': sorted(ctx.tags), 'rework': ctx.notes,
        'flames': [yup(p) for p in ctx.flames],
    }


def lod(ob, target):
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris <= target * 1.3:
        return None
    lo = ob.copy()
    lo.data = ob.data.copy()
    bpy.context.scene.collection.objects.link(lo)
    mod = lo.modifiers.new('lod', 'DECIMATE')
    mod.ratio = max(0.02, target / tris)
    bpy.context.view_layer.objects.active = lo
    bpy.ops.object.select_all(action='DESELECT')
    lo.select_set(True)
    bpy.ops.object.modifier_apply(modifier='lod')
    lo.name = ob.name + '~lod'
    lo.data.name = lo.name
    return lo


def export(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
        o.location = (0, 0, 0)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
              export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='NONE', export_vertex_color='NONE')
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop('export_image_format')
        bpy.ops.export_scene.gltf(**kw)


def run_pack(raw, out, pack, catalog):
    reset()
    keep = []
    items = [(p, n, path) for p, n, path in sources(raw) if p == pack] if pack != 'bellmourn' else []
    for p, n, path in items:
        for variant in recipes.variants(p, n):
            # each build starts clean: imports bring their own junk
            ob, facts = build(p, n, path, variant)
            facts.pop('_flames_z', None)
            keep.append(ob)
            catalog[ob.name] = facts
            # trees and big rocks, and any heavy piece (corner posts, lanterns, chandeliers...),
            # get a low-detail copy for distance
            target = recipes.lod_target(p, n) or (facts['tris'] > 1100 and max(180, facts['tris'] // 4))
            if target:
                lo = lod(ob, target)
                if lo:
                    keep.append(lo)
                    facts['lod'] = lo.name
                    facts['lod_tris'] = sum(len(q.vertices) - 2 for q in lo.data.polygons)
            print('reworked', ob.name, facts['tris'], facts['rework'][:3], flush=True)
            # imported images and orphan data pile up: drop them
            for img in list(bpy.data.images):
                bpy.data.images.remove(img)
    if pack == 'bellmourn':
        lookup = {(p, n): path for p, n, path in sources(raw)}
        for cid, parts, notes, tags, flames in recipes.COMPOSITES:
            objs, flames = [], list(flames)
            for (p, n, var, xf) in parts:
                ob, pf = build(p, n, lookup[(p, n)], var)
                ob.data.transform(xf)
                flames += [tuple(xf @ Vector(f)) for f in pf['_flames_z']]
                objs.append(ob)
            bpy.ops.object.select_all(action='DESELECT')
            for o in objs:
                o.select_set(True)
            bpy.context.view_layer.objects.active = objs[0]
            if len(objs) > 1:
                bpy.ops.object.join()
            ob = bpy.context.view_layer.objects.active
            ob.name = 'bellmourn/' + cid
            ob.data.name = ob.name
            ctx = Ctx(None, 'bellmourn', cid, '', {}, 0)
            ctx.notes = notes
            ctx.tags = set(tags)
            ctx.flames = flames
            facts = describe(ob, 'bellmourn', cid, '', ctx)
            facts['category'] = tags[0] if tags else 'composite'
            facts['parts'] = [f'{p}/{n}' for p, n, _, _ in parts]
            facts.pop('_flames_z', None)
            catalog[ob.name] = facts
            keep.append(ob)
            print('composite', ob.name, facts['tris'], flush=True)
            for img in list(bpy.data.images):
                bpy.data.images.remove(img)
    for m in bpy.data.materials:  # plain materials: the runtime brings the atlases
        m.use_nodes = False
    export(keep, os.path.join(out, pack + '.glb'))


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    raw, out = argv[0], argv[1]
    packs = argv[2:] or ['props', 'village', 'nature', 'trees', 'ultimate', 'dungeon', 'bellmourn']
    os.makedirs(out, exist_ok=True)
    cpath = os.path.join(out, 'kit.json')
    catalog = json.load(open(cpath)) if os.path.exists(cpath) else {}
    for pack in packs:
        for k in [k for k in catalog if k.startswith(pack + '/')]:
            del catalog[k]
        run_pack(raw, out, pack, catalog)
        json.dump(dict(sorted(catalog.items())), open(cpath, 'w'), indent=1)


main()
