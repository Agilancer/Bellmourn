"""Shared Blender helpers: load the Humans FBX, fix its materials, pose an action, light and render."""
import bpy, math, mathutils

ACT = 'CharacterArmature|CharacterArmature|'


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path)
    for m in bpy.data.materials:
        if m.node_tree:
            b = m.node_tree.nodes.get('Principled BSDF')
            if b:
                b.inputs['Alpha'].default_value = 1.0
        m.blend_method = 'OPAQUE' if hasattr(m, 'blend_method') else None
    return bpy.data.objects['CharacterArmature']


def pose(arm, name, frame):
    act = bpy.data.actions[ACT + name]
    arm.animation_data.action = act
    if act.slots:
        arm.animation_data.action_slot = act.slots[0]
    bpy.context.scene.frame_set(frame)


def show_only(prefixes):
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.hide_render = not any(o.name == p or o.name.startswith(p + '_') or o.name == p for p in prefixes)


def camera(loc, look_at, lens=85, ortho=None):
    sc = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    if ortho:
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else:
        cam.data.lens = lens
    cam.location = loc
    d = mathutils.Vector(look_at) - mathutils.Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return cam


def look(cam, loc, look_at):
    cam.location = loc
    d = mathutils.Vector(look_at) - mathutils.Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def area(name, loc, target, energy, size=1.0, color=(1, 1, 1)):
    sc = bpy.context.scene
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
    sc.collection.objects.link(l)
    l.data.energy = energy; l.data.size = size; l.data.color = color
    look(l, loc, target)
    return l


def studio(bg=0.04, key=320, fill=90, rim=260, warm=True):
    """Three-point light round a man standing at the origin facing -Y."""
    sc = bpy.context.scene
    w = bpy.data.worlds.new('w'); sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.045, 0.04, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = bg * 10
    area('key', (-1.6, -2.4, 2.4), (0, 0, 1.3), key, 1.6, (1.0, 0.9, 0.78) if warm else (1, 1, 1))
    area('fill', (2.2, -2.0, 1.2), (0, 0, 1.1), fill, 2.5, (0.75, 0.82, 1.0))
    area('rim', (0.8, 2.2, 2.2), (0, 0, 1.4), rim, 1.0, (1.0, 0.85, 0.7))


def cycles(res=(800, 800), samples=64, out=None, transparent=False):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = transparent
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast' if 'AgX - Medium High Contrast' in [i.identifier for i in sc.view_settings.bl_rna.properties['look'].enum_items] else 'None'
    if out:
        sc.render.filepath = out
        bpy.ops.render.render(write_still=True)
