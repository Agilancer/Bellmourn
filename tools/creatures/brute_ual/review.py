"""Review shots of the built zombie, composed into one contact sheet.

  blender -b <out>/zombie_ual.blend --python review.py -- <sheet.png> [shots]

shots: comma list of names from SHOTS (default: all eight). Lit like a dim crypt: warm key,
cold rim, dark floor. Close-ups follow the Head / hand bones through the pose.
"""
import math
import os
import subprocess
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
SHEET = argv[0]
TMP = os.path.splitext(SHEET)[0] + "_tiles"
os.makedirs(TMP, exist_ok=True)

sc = bpy.context.scene
ARM = bpy.data.objects["Armature"]
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        sc.render.engine = eng
        break
    except TypeError:
        pass
try:
    sc.eevee.taa_render_samples = 32
    sc.eevee.use_shadows = True
except Exception:
    pass
sc.render.resolution_x, sc.render.resolution_y = 480, 640
sc.render.film_transparent = False
w = bpy.data.worlds.new("w"); sc.world = w
w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (0.035, 0.04, 0.05, 1); bg.inputs[1].default_value = 1.0


def sun(name, rot, energy, color):
    ld = bpy.data.lights.new(name, "SUN"); ld.energy = energy; ld.color = color
    ld.angle = math.radians(6)
    ob = bpy.data.objects.new(name, ld); sc.collection.objects.link(ob)
    ob.rotation_euler = [math.radians(a) for a in rot]


sun("key", (52, 0, -35), 3.2, (1.0, 0.9, 0.78))
sun("rim", (-60, 0, 160), 2.6, (0.65, 0.78, 1.0))
sun("fill", (70, 0, 60), 0.5, (0.8, 0.85, 1.0))
sun("back", (60, 0, 200), 0.9, (0.9, 0.85, 0.8))
fm = bpy.data.meshes.new("floor")
fm.from_pydata([(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [], [(0, 1, 2, 3)])
fl = bpy.data.objects.new("floor", fm); sc.collection.objects.link(fl)
fmat = bpy.data.materials.new("floor"); fmat.use_nodes = True
fb = next(n for n in fmat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
fb.inputs["Base Color"].default_value = (0.05, 0.05, 0.055, 1); fb.inputs["Roughness"].default_value = 0.9
fm.materials.append(fmat)

cd = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cd)
sc.collection.objects.link(cam); sc.camera = cam


def pose(action, frame):
    ad = ARM.animation_data or ARM.animation_data_create()
    for t in ad.nla_tracks:
        t.mute = True
    act = bpy.data.actions.get(action) if action else None
    ad.action = act
    if act is not None and hasattr(ad, "action_slot"):
        try:
            if ad.action_slot is None and len(act.slots):
                ad.action_slot = act.slots[0]
        except Exception as e:
            print("slot", e)
    if act is None:
        for pb in ARM.pose.bones:
            pb.matrix_basis.identity()
    sc.frame_set(frame)


def bone_pos(name):
    pb = ARM.pose.bones[name]
    return ARM.matrix_world @ ((pb.head + pb.tail) * 0.5)


SC = ARM.scale.x            # the brute is scaled up at export: shots are written in mannequin units


def aim(target, direction, dist, lens):
    d = Vector(direction).normalized()
    if isinstance(target, tuple):
        target = Vector(target) * SC
    cam.location = Vector(target) + d * dist * SC
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    cd.lens = lens


WEAPONS = [o for o in bpy.data.objects if o.name.startswith("Weapon_")]
SHOTS = {
    "maul_idle": ("TwoHand_Idle_Loop", 20, lambda: aim((0, 0, 1.0), (0.45, -1, 0.15), 3.2, 50), "Weapon_Maul"),
    "maul_windup": ("TwoHand_Attack_Slam", 13, lambda: aim((0, 0, 1.15), (1, -0.5, 0.1), 3.6, 50), "Weapon_Maul"),
    "maul_slam": ("TwoHand_Attack_Slam", 21, lambda: aim((0, -0.3, 0.8), (0.9, -1, 0.2), 3.6, 50), "Weapon_Maul"),
    "axe_sweep": ("TwoHand_Attack_Sweep", 12, lambda: aim((0, 0, 1.05), (0.25, -1, 0.3), 3.8, 50), "Weapon_Axe"),
    "axe_strike": ("TwoHand_Attack_Sweep", 18, lambda: aim((0, -0.2, 1.0), (0.1, -1, 0.35), 3.8, 50), "Weapon_Axe"),
    "maul_slam_front": ("TwoHand_Attack_Slam", 21, lambda: aim((0, -0.4, 0.75), (0.05, -1, 0.25), 3.6, 50), "Weapon_Maul"),
    "axe_walk": ("TwoHand_Walk_Loop", 8, lambda: aim((0, 0, 1.0), (-0.8, -1, 0.15), 3.4, 50), "Weapon_Axe"),
    "tpose": (None, 0, lambda: aim((0, 0, 0.92), (0, -1, 0.08), 3.4, 42)),
    "idle_front": ("Idle_Loop", 20, lambda: aim((0, 0, 0.9), (0, -1, 0.12), 3.3, 50)),
    "idle_34": ("Idle_Loop", 20, lambda: aim((0, 0, 0.9), (0.75, -1, 0.15), 3.3, 50)),
    "back": ("Idle_Loop", 20, lambda: aim((0, 0, 0.9), (-0.35, 1, 0.15), 3.3, 50)),
    "back_hip": ("Idle_Loop", 20, lambda: aim((-0.17, 0.1, 1.02), (-0.35, 1, 0.15), 0.8, 50)),
    "back_hip_rest": (None, 0, lambda: aim((-0.17, 0.1, 1.02), (-0.35, 1, 0.15), 0.8, 50)),
    "walk_side": ("Zombie_Walk_Fwd_Loop", 12, lambda: aim((0, 0, 0.9), (1, -0.1, 0.1), 3.3, 50)),
    "face": ("Zombie_Idle_Loop", 20, lambda: aim(bone_pos("Head") + Vector((0, 0, 0.02)), (0.0, -1, 0.05), 0.62, 55)),
    "face_34": ("Idle_Loop", 20, lambda: aim(bone_pos("Head") + Vector((0, -0.03, 0.0)), (0.7, -1, 0.1), 0.78, 55)),
    "face_rest": (None, 0, lambda: aim((0, -0.02, 1.67), (0, -1, 0.0), 0.62, 60)),
    "face_rest_side": (None, 0, lambda: aim((0, -0.02, 1.67), (1, -0.6, 0.0), 0.62, 60)),
    "hand_rest": (None, 0, lambda: aim((0.86, 0.06, 1.43), (0.2, -0.6, 1), 0.45, 50)),
    "hand_rest_under": (None, 0, lambda: aim((0.86, 0.06, 1.43), (0.3, -1, -0.5), 0.45, 50)),
    "hand_idle": ("Zombie_Idle_Loop", 20, lambda: aim(bone_pos("hand_l"), (0.3, -1, 0.1), 0.6, 50)),
    "scratch_wide": ("Zombie_Scratch", 14, lambda: aim((0, 0, 1.15), (0.25, -1, 0.15), 2.6, 50)),
    "back_close": ("Zombie_Idle_Loop", 20, lambda: aim((0, 0.05, 1.25), (-0.2, 1, 0.15), 1.5, 50)),
    "chest_idle": ("Zombie_Idle_Loop", 20, lambda: aim(bone_pos("spine_03") + Vector((0, -0.02, 0.05)), (0.15, -1, 0.35), 0.75, 50)),
    "chest_rest": (None, 0, lambda: aim((0.05, -0.02, 1.45), (0.25, -1, 0.75), 0.75, 50)),
    "jaw_r": ("Zombie_Idle_Loop", 20, lambda: aim(bone_pos("neck_01") + Vector((-0.03, -0.04, 0.0)), (-1, -0.8, 0.2), 0.45, 50)),
    "jaw_r_low": ("Zombie_Idle_Loop", 20, lambda: aim(bone_pos("neck_01") + Vector((-0.03, -0.04, 0.0)), (-0.3, -1, -0.35), 0.45, 50)),
    "shoulder_rest": (None, 0, lambda: aim((-0.17, 0.04, 1.42), (-0.6, -1, 0.35), 0.5, 50)),
    "shoulder_rest_top": (None, 0, lambda: aim((-0.17, 0.04, 1.42), (-0.2, -0.3, 1), 0.5, 50)),
    "hand": ("Zombie_Scratch", 14, lambda: aim(bone_pos("hand_r") + Vector((0.05, 0, -0.08)), (-0.4, -1, 0.35), 0.9, 50)),
}
DEFAULT = ["tpose", "idle_front", "back", "face_rest", "face_34", "maul_windup", "maul_slam", "axe_sweep"]
SHOTS.update({
    "feet_back": ("Idle_Loop", 20, lambda: aim((0, 0.05, 0.16), (-0.25, 1, 0.3), 1.3, 50)),
    "feet_side": ("Idle_Loop", 20, lambda: aim((0.12, 0.0, 0.18), (1, -0.25, 0.2), 1.1, 50)),
    "feet_34": ("Idle_Loop", 20, lambda: aim((0.0, -0.02, 0.18), (0.6, -1, 0.35), 1.3, 50)),
    "feet_walk": ("Walk_Loop", 6, lambda: aim((0.0, 0.0, 0.2), (1, 0.35, 0.2), 1.5, 50)),
    "feet_rest_back": (None, 0, lambda: aim((0.12, 0.05, 0.16), (-0.1, 1, 0.25), 0.8, 50)),
    "torso_rest": (None, 0, lambda: aim((0, 0, 1.25), (0.35, -1, 0.15), 1.6, 50)),
    "legs_rest": (None, 0, lambda: aim((0, 0, 0.5), (0.5, -1, 0.1), 1.8, 50)),
    "back_rest": (None, 0, lambda: aim((0, 0.05, 1.15), (0, 1, 0.08), 2.4, 50)),
    "knee_side_walk": ("Walk_Loop", 6, lambda: aim(bone_pos("calf_l") + Vector((0, 0, 0.05)), (1, -0.15, 0.1), 0.75, 50)),
    "knee_back_crouch": ("Crouch_Idle_Loop", 10, lambda: aim(bone_pos("calf_l"), (0.3, 1, 0.25), 0.8, 50)),
    "knee_front_crouch": ("Crouch_Idle_Loop", 10, lambda: aim(bone_pos("calf_r"), (-0.2, -1, 0.3), 0.8, 50)),
    "knee_side_slam": ("TwoHand_Attack_Slam", 21, lambda: aim(bone_pos("calf_l"), (1, 0.2, 0.15), 0.85, 50)),
    "knee_back_slam": ("TwoHand_Attack_Slam", 21, lambda: aim(bone_pos("calf_r"), (-0.3, 1, 0.2), 0.85, 50)),
    "knee_front_walk": ("Walk_Loop", 6, lambda: aim(bone_pos("calf_l"), (0.2, -1, 0.2), 0.8, 50)),
    "chest_armor": ("Idle_Loop", 20, lambda: aim(bone_pos("spine_03") + Vector((0, -0.05, -0.05)), (0.45, -1, 0.2), 1.7, 50)),
    "shoulder_armor": ("Idle_Loop", 20, lambda: aim(bone_pos("upperarm_l") + Vector((0, 0, 0.02)), (1, -0.7, 0.45), 0.95, 50)),
    "neck_armor": ("Idle_Loop", 20, lambda: aim(bone_pos("neck_01") + Vector((0, -0.02, 0)), (0.35, -1, 0.7), 0.8, 50)),
    "yoke_rest": (None, 0, lambda: aim((0, 0.0, 2.08), (0.25, -1, 0.75), 1.25, 50)),
    "yoke_idle": ("Idle_Loop", 20, lambda: aim(bone_pos("neck_01") + Vector((0, 0, -0.05)), (0.25, -1, 0.75), 1.25, 50)),
    "side_idle": ("Idle_Loop", 20, lambda: aim((0, 0, 0.95), (1, -0.05, 0.1), 3.3, 50)),
    "back_upper": ("Idle_Loop", 20, lambda: aim((0, 0.08, 1.38), (-0.25, 1, 0.25), 1.3, 50)),
    "back_lower": ("Idle_Loop", 20, lambda: aim((0, 0.08, 1.02), (0.25, 1, 0.05), 1.3, 50)),
    "back_34": ("Idle_Loop", 20, lambda: aim((0, 0.0, 1.2), (-0.8, 1, 0.2), 2.6, 50)),
})
VIEWS = {"front": (0.1, -1, 0.15), "side": (1, -0.15, 0.12), "34": (0.75, -1, 0.15), "back": (-0.35, 1, 0.15), "rside": (-1, -0.2, 0.12)}


def dyn(nm):
    """clip:<Action>@<fraction>:<weapon or ->:<view>  e.g. clip:Sword_Attack@0.4:maul:front"""
    _, rest = nm.split(":", 1)
    act_fr, wpn, view = rest.split(":")
    act, frac = act_fr.split("@")
    a_ = bpy.data.actions[act]
    f0, f1 = a_.frame_range
    w = {"maul": "Weapon_Maul", "axe": "Weapon_Axe", "maul1": "Weapon_MaulOneHand"}.get(wpn)
    if frac == "impact":                         # the frame where the maul head is lowest
        wo = bpy.data.objects[w]
        best = None
        for f in range(int(f0), int(f1) + 1):
            pose(act, f); bpy.context.view_layer.update()
            z = (wo.matrix_world @ Vector((0.07, 0.94 - (0.36 if "OneHand" in w else 0.0), 0))).z
            if best is None or z < best[0]:
                best = (z, f)
        fr = best[1]
        print("[review] %s impact frame %d, head centre z %.2f m" % (act, fr, best[0]))
    else:
        fr = int(round(f0 + float(frac) * (f1 - f0)))

    def cam():
        pts = [ARM.matrix_world @ ARM.pose.bones[b].head for b in ("pelvis", "Head", "foot_l", "foot_r")]
        wo = bpy.data.objects.get(w) if w else None
        if wo is not None:
            pts.append(wo.matrix_world @ Vector((0.07, 0.94 - (0.36 if "OneHand" in w else 0.0), 0)))
        lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
        span = (hi - lo).length
        aim((lo + hi) / 2, VIEWS[view], max(3.6, span / SC * 1.9), 50)
    return (act, fr, cam, w)
names = argv[1].split(",") if len(argv) > 1 else DEFAULT
for _h in filter(None, os.environ.get("HIDE", "").split(",")):    # e.g. HIDE=Brute: the armour alone
    if _h in bpy.data.objects:
        bpy.data.objects[_h].hide_render = True
paths = []
for nm in names:
    shot = dyn(nm) if nm.startswith("clip:") else SHOTS[nm]
    act, fr, cam_fn = shot[:3]
    wpn = shot[3] if len(shot) > 3 else None
    for w_ in WEAPONS:
        w_.hide_render = w_.name != wpn
    pose(act, fr)
    bpy.context.view_layer.update()
    cam_fn()
    p = os.path.join(TMP, nm.replace(":", "_").replace("@", "_") + ".png")
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    paths.append(p)

# contact sheet with the system Python (PIL), 4 across
code = (
    "import sys;from PIL import Image,ImageDraw;ps=sys.argv[2:];ims=[Image.open(p) for p in ps];"
    "w,h=ims[0].size;cols=min(4,len(ims));rows=(len(ims)+cols-1)//cols;"
    "s=Image.new('RGB',(w*cols,h*rows),(0,0,0));d=ImageDraw.Draw(s)\n"
    "for i,(p,im) in enumerate(zip(ps,ims)):\n"
    "  x,y=(i%cols)*w,(i//cols)*h;s.paste(im,(x,y));d.text((x+8,y+6),p.replace('\\\\','/').split('/')[-1][:-4],fill=(230,230,230))\n"
    "s.save(sys.argv[1])"
)
subprocess.run(["python", "-c", code, SHEET] + paths, check=True)
print("[review] sheet", SHEET)
