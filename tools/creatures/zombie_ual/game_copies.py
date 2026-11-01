"""Game copies of the UAL undead (templates/models/creatures/zombie_ual/<name>.glb): the same body,
skeleton and materials, lighter for a horde. The mesh is decimated to about 16k triangles (the
built ones are about 43k: forty of them in the graveyard would be 1.7 million), and every image is
capped: 1024 for a computer (game/<name>.glb), 512 for a phone (game/phone/<name>.glb). The bones
are untouched, so ual2_clips.glb drives them exactly as it drives the full ones.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/creatures/zombie_ual/game_copies.py -- [names...]
"""
import os
import sys

import bpy

ROOT = os.path.join('templates', 'models', 'creatures', 'zombie_ual')
ALL = ['ancient', 'cinder', 'drowned', 'ghoul', 'maw', 'mummy', 'plague', 'ropebound', 'shambler', 'veinwretch']
TRIS = 16000

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
names = args or ALL


def export(path):
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = dict(filepath=path, export_format='GLB', export_animations=False, export_tangents=True, export_skins=True, export_apply=False)
    if 'export_animation_mode' in props:
        kw['export_animation_mode'] = 'ACTIONS'
    if 'export_image_format' in props:
        kw['export_image_format'] = 'WEBP'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(**kw)


def cap(side):
    for img in bpy.data.images:
        w, h = img.size
        if max(w, h) > side:
            k = side / max(w, h)
            img.scale(max(1, round(w * k)), max(1, round(h * k)))


for name in names:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, name + '.glb'))
    for o in [o for o in bpy.data.objects if o.type == 'MESH']:
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if tris <= TRIS * 1.1:
            continue
        bpy.context.view_layer.objects.active = o
        for s in bpy.context.selected_objects:
            s.select_set(False)
        o.select_set(True)
        m = o.modifiers.new('decimate', 'DECIMATE')
        m.ratio = TRIS / tris
        m.use_collapse_triangulate = True
        # (before the skin, so it's the rest shape that's simplified, and applied alone)
        bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0)
        bpy.ops.object.modifier_apply(modifier=m.name)
        print('[game]', name, o.name, tris, '->', sum(len(p.vertices) - 2 for p in o.data.polygons))
    cap(1024)
    export(os.path.join(ROOT, 'game', name + '.glb'))
    cap(512)
    export(os.path.join(ROOT, 'game', 'phone', name + '.glb'))
    print('[game] wrote', name)
