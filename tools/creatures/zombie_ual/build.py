"""Build the UAL zombie: Quaternius' UAL2 mannequin rig + all its clips, a new sculpted body
painted with the zombie sheet.

  blender -b --factory-startup --python build.py -- <UAL2_Standard.glb> <tex_dir> <out_dir>

tex_dir holds prep_tex.py's output. Writes <out_dir>/zombie_ual.glb and zombie_ual.blend.

1. cage   a skin-modifier tube body along the mannequin's bones, subdivided (denser head)
2. sculpt the head's cage pushed out along rays, then every vertex slid onto sdf.body (the
          sculpt), relaxed and re-snapped
3. paint  per-part projection onto the painted sheet (uvmap.py), then real displacement read from
          the painting's shading so painted ribs, knuckles and wrinkles are also in the mesh;
          stretched faces and sheet seams measured for patching
4. ears, teeth  modelled pieces mapped onto the painted ears and teeth strips
5. rags   a rotted loincloth (own small texture, hem and strips cut in alpha)
6. skin   bone-heat weights plus fixes (thumb on the hand, collar off the neck, smoothing);
          baked ambient occlusion in vertex colours
7. export GLB with every clip, tangents, WebP textures
8. bake   (runs before 7) the sheet baked onto the model's own atlas by bake_tex.py, with cloned
          skin over stretches and seams and the grade
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sdf  # noqa: E402
import uvmap  # noqa: E402
from uvmap import HEAD as HEADR  # noqa: E402

import monsters  # noqa: E402
import sheets  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, NAME, WORK = argv[0], argv[1], argv[2]
CLIPS = argv[argv.index("--clips") + 1] if "--clips" in argv else None
CFG = monsters.MONSTERS[NAME]
sdf.V.update(CFG.get("v", {}))
if CFG.get("finger"):   # slimmer fingers so the knuckles and claws read
    for _k in sdf.FINGER_R:
        sdf.FINGER_R[_k] *= CFG["finger"]
if "eye_fwd" in CFG:   # eyes pushed forward and enlarged so they read when the head hangs
    sdf.EYE = (sdf.EYE[0], sdf.EYE[1] - CFG["eye_fwd"], sdf.EYE[2])
    sdf.EYE_R = sdf.EYE_R * CFG.get("eye_scale", 1.0)
uvmap.use(sheets.SHEETS[CFG["spec"]])
if sdf.V["slitw"] != 1.0:
    sdf.SLIT_R = sdf.SLIT_R * np.array([sdf.V["slitw"], 1.0, 0.8])
    sdf.SLIT_C = sdf.SLIT_C + np.array([0.0, 0.0, 0.016])
GRADE = dict(trickle=False, glow=0.0, rough=1.0, tint=(1.0, 1.0, 1.0), dark=0.8, rot=0.6, soot=0.5, vein=0.0,
             eyeglow=0.0, eyecol=(1.0, 0.85, 0.4), crotch=0.15, mouthdark=0.95, mouthq=1.3,
             sat=1.0, green=0.0, eyehot=0.0, gullet=0.0, cmatch=0.8, bumpkind=0, ivory=0.0, rmin=0.0, mould=0.0,
             sores=0.0, bed=0.65, meat=0.0)
GRADE.update(CFG.get("grade", {}))
TEX = os.path.join(WORK, NAME, "tex")
OUT = os.path.join(WORK, NAME, "out")
os.makedirs(OUT, exist_ok=True)
SIZE = np.load(os.path.join(TEX, "zombie_mask.npy"), mmap_mode="r").shape[0]


def resolve_wounds(wounds):
    """Painted wounds (sheet pixels) -> points on the sculpt, carved as holes."""
    spec = uvmap.S
    holes = []
    for w in wounds:
        part, u, v, r, depth = w[:5]
        if part == "face":
            F = spec["head"]["front"]
            phi = (u - F["cu"]) / F["ku"]
            z = 1.69 - (v - F["eye_v"]) / F["kz"] if v >= F["eye_v"] else 1.69 + (F["eye_v"] - v) / F["k_up"] * 0.09
            out, axis = np.array([math.sin(phi), -math.cos(phi), 0.0]), np.array([0.0, 0.01, z])
        else:
            cu, hw, top, bot = spec["torso"]["front" if part == "front" else "back"]
            phi = (u - cu) / hw * (math.pi / 2) * (1 if part == "front" else -1)
            z = 1.50 - (v - top) * 0.58 / (bot - top)
            sg = -1 if part == "front" else 1
            out, axis = np.array([math.sin(phi), sg * math.cos(phi), 0.0]), np.array([0.0, 0.02, z])
        lo, hi = 0.0, 0.25
        for _ in range(30):   # outermost surface along the ray from the body's axis
            mid = (lo + hi) / 2
            if sdf.body(axis + out * mid)[0] < 0:
                lo = mid
            else:
                hi = mid
        s = axis + out * lo
        nrm = sdf.grad(s[None])[0]
        holes.append((s + nrm * (r - depth), r))
    return holes


sdf.V["holes"] = resolve_wounds(CFG.get("wounds", []))
HOLEKIND = [w[5] if len(w) > 5 else "" for w in CFG.get("wounds", [])]
_inner = []
for _w, (_c, _r), _k in zip(CFG.get("wounds", []), sdf.V["holes"], HOLEKIND):
    if _k != "ribs" or not CFG.get("ribgeo"):   # rib bars as geometry stall bone heat; baked bars instead
        continue
    _n = sdf.grad(np.array([_c]))[0]
    _s = _c + _n * (_r - _w[4])                       # the original skin point
    _tx = np.cross(_n, (0, 0, 1.0)); _tx /= np.linalg.norm(_tx)
    _rr = np.random.default_rng(9)
    for _dz, _ln in ((-0.032, 0.8), (-0.011, 1.0), (0.011, 0.55), (0.031, 0.9)):   # one snapped short
        _a = _s - _n * 0.02 + np.array([0, 0, _dz]) - _tx * 0.046
        _b = _a + _tx * 0.092 * _ln + np.array([0, 0, _rr.uniform(-0.006, 0.006)])
        _m = (_a + _b) / 2 + _n * 0.007                  # bowed outward, as ribs are
        _inner.append((np.array([_a, _m, _b]), 0.0058, 0.0045 if _ln < 0.7 else 0.0055))
sdf.V["inner"] = _inner
print("[zombie] carved wounds", len(sdf.V["holes"]), flush=True)

# boils / barnacles and raised ridges (ribs, sternum, sagging folds, spurs), placed on the sculpt
import extras  # noqa: E402
_RX = np.random.default_rng(21)
BUMPS = extras.place_bumps(CFG["bumps"], _RX) if CFG.get("bumps") else []
sdf.V["bumps"] = [(p - n * r * 0.35, r) for p, n, r in BUMPS if r >= 0.0055]


def _ridge(z, degs, r0, r1=None, drop=0.0, axis=(0.0, 0.02)):
    pts = []
    for a in np.radians(degs):
        D = np.array([math.sin(a), -math.cos(a), 0.0])
        s = extras.surface(np.array([axis[0], axis[1], z]), D)[0]
        pts.append(s - D * r0 * 0.45 + np.array([0, 0, -drop]))
    return (np.array(pts), r0, r1 if r1 is not None else r0)


_ridges = []
if CFG.get("ribs"):
    rb = CFG["ribs"]
    for i in range(6):
        z = 1.185 + 0.031 * i
        for sx in (1, -1):
            _ridges.append(_ridge(z, sx * np.linspace(16, 78, 7), 0.0042 * rb, 0.0034 * rb, drop=-0.004 * np.sin(i)))
    st = [extras.surface(np.array([0, 0.02, z]), np.array([0, -1.0, 0]))[0] for z in np.linspace(1.2, 1.37, 6)]
    _ridges.append((np.array(st) + np.array([0, 0.002, 0]), 0.0055 * rb, 0.0045 * rb))
if CFG.get("sag"):
    sg = CFG["sag"]
    for z, r in ((1.03, 0.008), (1.085, 0.007), (1.135, 0.006)):
        _ridges.append(_ridge(z, np.linspace(-72, 72, 11), r * sg, drop=0.004))
    for sx in (1, -1):
        _ridges.append(_ridge(1.265, sx * np.linspace(12, 62, 7), 0.009 * sg, 0.006 * sg, drop=0.005))
SPURS = []
if CFG.get("wattle"):
    _ridges.append(_ridge(1.578, np.linspace(-48, 48, 9), 0.011 * CFG["wattle"], drop=0.007, axis=(0.0, 0.012)))
if CFG.get("spurs"):
    sp = CFG["spurs"]
    for sx in (1, -1):
        sites = CFG.get("spur_sites", ("shoulder", "collar", "scapula"))
        for site, o, dv, tipd, r0 in (("shoulder", (0.14, 0.04, 1.38), (0, 0, 1), (0.35, 0.05, 0.9), 0.010),
                                      ("collar", (0.07, 0.0, 1.45), (0, -1, 0.3), (0.12, -0.8, 0.6), 0.007),
                                      ("scapula", (0.09, 0.04, 1.37), (0, 1, 0.2), (0.25, 0.7, 0.7), 0.008),
                                      ("spine", (0.012, 0.05, 1.33), (0, 1, 0.15), (0.05, 0.75, 0.65), 0.008),
                                      ("spine", (0.012, 0.05, 1.24), (0, 1, 0.0), (0.05, 0.8, 0.55), 0.007)):
            if site not in sites or (site == "spine" and sx < 0):
                continue
            s = extras.surface(np.array(o) * [sx, 1, 1], np.array(dv, float) / np.linalg.norm(dv))[0]
            t = np.array(tipd, float) * [sx, 1, 1]
            t = s + t / np.linalg.norm(t) * 0.045 * sp
            _ridges.append((np.array([s - (t - s) * 0.12, s + (t - s) * 0.12]), r0 * (1 + 0.5 * (sp - 1)), r0))
            SPURS.append((s, t, r0 * (1 + 0.45 * (sp - 1)), ("clavicle_" if dv[2] > 0.5 or dv[1] < 0 else "spine_03") + ("l" if sx > 0 else "r")))
sdf.V["ridges"] = _ridges
log_ = print
log_("[zombie] bumps", len(BUMPS), "(geometry", len(sdf.V["bumps"]), ") ridges", len(_ridges), flush=True)


def log(*a):
    print("[zombie]", *a, flush=True)


# ---------------------------------------------------------------------------------- import
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
for name in ("Icosphere", "Mannequin"):
    o = bpy.data.objects.get(name)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)
ARM = next(o for o in bpy.data.objects if o.type == "ARMATURE")
ARM.name = "Armature"
for o in list(bpy.data.objects):
    if o.type == "MESH":
        bpy.data.objects.remove(o, do_unlink=True)
from mathutils import Matrix, Quaternion  # noqa: E402

coll = bpy.context.scene.collection


def action_fcurves(act):
    try:
        out = list(act.fcurves)
    except Exception:
        out = []
    if out:
        return out
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for cb in getattr(strip, "channelbags", []):
                out.extend(cb.fcurves)
    return out


PROBE = [("Zombie_Idle_Loop", 10), ("Zombie_Scratch", 14), ("Sword_Regular_A", 8), ("Zombie_Walk_Fwd_Loop", 20)]
PROBE_B = ("hand_l", "hand_r", "lowerarm_l", "middle_03_r", "upperarm_l", "Head")


def probe(name, frame):
    ad = ARM.animation_data
    act = bpy.data.actions[name]
    ad.action = act
    if hasattr(ad, "action_slot") and ad.action_slot is None and len(act.slots):
        ad.action_slot = act.slots[0]
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    return {b: (ARM.matrix_world @ ARM.pose.bones[b].matrix).copy() for b in PROBE_B}


def a_pose_rest():
    """Bind in an A-pose: the clips swing the arms half as far from the bind pose, so the
    shoulders fold far less. The upper arms' rest turns 45 deg down and every clip's upper-arm
    keys are re-expressed against it (q' = R^-1 q), so all 43 clips land on the same world poses."""
    ad = ARM.animation_data or ARM.animation_data_create()
    mutes = [(t, t.mute) for t in ad.nla_tracks]
    for t, _ in mutes:
        t.mute = True
    ARM.data.pose_position = "POSE"
    before = {k: probe(*k) for k in PROBE}
    ad.action = None
    for pb in ARM.pose.bones:
        pb.matrix_basis.identity()
    rq = {}
    for side, sg in (("l", 1), ("r", -1)):
        pb = ARM.pose.bones["upperarm_" + side]
        B = pb.bone.matrix_local.to_3x3()
        rl = (B.inverted() @ Matrix.Rotation(sg * float(sdf.APOSE), 3, "Y") @ B).to_quaternion()
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = rl
        rq[side] = rl
    bpy.context.view_layer.update()
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ARM.select_set(True)
    bpy.context.view_layer.objects.active = ARM
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    nkeys = 0
    for act in bpy.data.actions:
        fcs = action_fcurves(act)
        for side in ("l", "r"):
            inv = rq[side].inverted()
            minv = inv.to_matrix()
            path = 'pose.bones["upperarm_%s"]' % side
            qc = sorted([f for f in fcs if f.data_path == path + ".rotation_quaternion"], key=lambda f: f.array_index)
            lc = sorted([f for f in fcs if f.data_path == path + ".location"], key=lambda f: f.array_index)
            for curves, kind in ((qc, "q"), (lc, "l")):
                if len(curves) != (4 if kind == "q" else 3):
                    continue
                counts = {len(f.keyframe_points) for f in curves}
                assert len(counts) == 1, (act.name, side, kind, counts)
                for k in range(counts.pop()):
                    val = [f.keyframe_points[k].co[1] for f in curves]
                    new = (inv @ Quaternion(val)) if kind == "q" else (minv @ Vector(val))
                    for i, f in enumerate(curves):
                        kp = f.keyframe_points[k]
                        dv = new[i] - kp.co[1]
                        kp.co[1] = new[i]
                        kp.handle_left[1] += dv
                        kp.handle_right[1] += dv
                    nkeys += 1
                for f in curves:
                    f.update()
    after = {k: probe(*k) for k in PROBE}
    dpos = max((before[k][b].translation - after[k][b].translation).length for k in PROBE for b in PROBE_B)
    drot = max(before[k][b].to_quaternion().rotation_difference(after[k][b].to_quaternion()).angle for k in PROBE for b in PROBE_B)
    log("A-pose rest: re-keyed", nkeys, "upper-arm keys; clip drift %.3f mm, %.3f deg" % (dpos * 1000, math.degrees(drot)))
    assert dpos < 0.001 and drot < 0.01, "A-pose re-keying changed the clips"
    ad.action = None
    for t, m in mutes:
        t.mute = m
    for pb in ARM.pose.bones:
        pb.matrix_basis.identity()
    ARM.data.pose_position = "REST"


a_pose_rest()
if CLIPS:   # four extra takes on each zombie clip ride along in the shared clip file
    import clipvars  # noqa: E402
    clipvars.make(ARM, log)

# ---------------------------------------------------------------------------------- 1. cage
V, E, R = [], [], []


def add(co, r, parent=None):
    V.append(co); R.append(r)
    i = len(V) - 1
    if parent is not None:
        E.append((parent, i))
    return i


hips = add((0, 0.03, 0.93), 0.12)
s1 = add((0, 0.035, 1.05), 0.10, hips)
s2 = add((0, 0.03, 1.17), 0.105, s1)
s3 = add((0, 0.02, 1.29), 0.115, s2)
s4 = add((0, 0.025, 1.40), 0.115, s3)
nb = add((0, 0.02, 1.48), 0.06, s4)
nk = add((0, 0.016, 1.56), 0.047, nb)
h1 = add((0, -0.012, 1.612), 0.058, nk)
h2 = add((0, 0.0, 1.672), 0.078, h1)
h3 = add((0, 0.015, 1.742), 0.076, h2)
h4 = add((0, 0.02, 1.79), 0.045, h3)
for s in (1, -1):
    hp = add((s * 0.089, 0.012, 0.87), 0.065, hips)
    t1 = add((s * 0.089, 0.005, 0.71), 0.052, hp)
    kn = add((s * 0.089, -0.003, 0.535), 0.045, t1)
    c1 = add((s * 0.089, 0.02, 0.33), 0.04, kn)
    an = add((s * 0.089, 0.035, 0.10), 0.03, c1)
    add((s * 0.089, 0.055, 0.042), 0.028, an)                  # heel
    ball = add((s * 0.088, -0.10, 0.03), 0.03, an)
    for tx, tr, tln in sdf.TOES:
        tb = add((s * tx, -0.125, 0.026), tr * 1.1, ball)
        add((s * (tx + (tx - 0.089) * 0.15), -0.12 - tln * 0.92, 0.018), tr * 0.95, tb)
    def A(co, s=s):  # arm points are laid out straight, then hung in the A-pose
        q = sdf.to_A(np.array([co]))[0]
        return (s * q[0], q[1], q[2])

    sh = add((s * 0.145, 0.04, 1.44), 0.05, s4)
    dl = add(A((0.23, 0.062, 1.441)), 0.042, sh)
    el = add(A((0.466, 0.072, 1.441)), 0.033, dl)
    fa = add(A((0.6, 0.066, 1.441)), 0.03, el)
    wr = add(A((0.735, 0.065, 1.441)), 0.021, fa)
    pb = add(A((0.768, 0.068, 1.441)), 0.021, wr)   # palm base: the thumb branches here
    palm = add(A((0.81, 0.07, 1.441)), 0.022, pb)   # (skin hulls fail past five branches)
    for name in uvmap.FNAMES:
        pts = sdf.finger_pts(name)
        prev = palm
        if name == "thumb":  # thumb grows out of a thenar web on the palm, not off the wrist
            prev = add(A((0.785, 0.042, 1.428)), 0.015, pb)
            pts = pts[1:]
        for q in pts:
            prev = add(A(tuple(q)), sdf.FINGER_R[name] * 1.15, prev)

_bu, _bl = sdf.V["bulk"], sdf.V["bloat"]
R = [r * (1 + 0.12 * _bu + 0.1 * _bl) for r in R]
for _i in (hips, s1, s2, s3):
    R[_i] *= 1 + 0.25 * _bl
cm = bpy.data.meshes.new("cage")
cm.from_pydata(V, E, [])
cage = bpy.data.objects.new("cage", cm)
coll.objects.link(cage)
sk = cage.modifiers.new("skin", "SKIN")
sk.branch_smoothing = 0.6
for i, r in enumerate(R):
    sv = cm.skin_vertices[0].data[i]
    sv.radius = (r, r)
    sv.use_root = i == hips
sub = cage.modifiers.new("sub", "SUBSURF")
sub.levels = sub.render_levels = 2
dg = bpy.context.evaluated_depsgraph_get()
me = bpy.data.meshes.new_from_object(cage.evaluated_get(dg))
bpy.data.objects.remove(cage, do_unlink=True)

bm = bmesh.new()
bm.from_mesh(me)
head_e = [e for e in bm.edges if all(v.co.z > 1.555 for v in e.verts)]
bmesh.ops.subdivide_edges(bm, edges=head_e, cuts=1, use_grid_fill=True)
head_e = [e for e in bm.edges if all(v.co.z > 1.56 and v.co.y < 0.03 for v in e.verts)]
bmesh.ops.subdivide_edges(bm, edges=head_e, cuts=1, use_grid_fill=True)
tor_e = [e for e in bm.edges if all(0.95 < v.co.z < 1.52 and abs(v.co.x) < 0.2 for v in e.verts)]
bmesh.ops.subdivide_edges(bm, edges=tor_e, cuts=1, use_grid_fill=True)
bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
bm.to_mesh(me)
bm.free()
log("cage verts", len(me.vertices), "faces", len(me.polygons))

# ---------------------------------------------------------------------------------- 2. sculpt
n = len(me.vertices)
P = np.zeros(n * 3); me.vertices.foreach_get("co", P); P = P.reshape(-1, 3)
ev = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get("vertices", ev); ev = ev.reshape(-1, 2)


def snap(P, it=5):
    for _ in range(it):
        d = sdf.body(P)
        P = P - d[:, None] * sdf.grad(P)
    return P


FROZEN = np.zeros(len(P), bool)


def relax(P, w=0.5):
    acc = np.zeros_like(P); cnt = np.zeros(len(P))
    np.add.at(acc, ev[:, 0], P[ev[:, 1]]); np.add.at(acc, ev[:, 1], P[ev[:, 0]])
    np.add.at(cnt, ev[:, 0], 1); np.add.at(cnt, ev[:, 1], 1)
    L = acc / np.maximum(cnt, 1)[:, None] - P
    g = sdf.grad(P)
    L -= (L * g).sum(1)[:, None] * g  # tangential only
    L[FROZEN] = 0                       # cavity linings stay in their holes
    return P + w * L




def radial(P, c, rmax=0.17, steps=56):
    """Outermost surface along rays from c: puts the head's cage on the chin, lips and brow
    (nearest-point snapping alone would drag them into the open mouth or the eye sockets)."""
    d = P - c
    u = d / np.linalg.norm(d, axis=1, keepdims=True)
    found = np.zeros(len(P), bool); lo = np.zeros(len(P)); hi = np.full(len(P), rmax)
    for k in range(1, steps + 1):
        tk = rmax * (1 - k / steps)
        new = ~found & (sdf.body(c + u * tk) < 0)
        lo[new] = tk; hi[new] = tk + rmax / steps; found |= new
    for _ in range(14):
        mid = (lo + hi) / 2
        ins = sdf.body(c + u * mid[:, None]) < 0
        lo = np.where(ins, mid, lo); hi = np.where(ins, hi, mid)
    return np.where(found[:, None], c + u * ((lo + hi) / 2)[:, None], P)


hv = (P[:, 2] > 1.578) | ((P[:, 2] > 1.556) & (P[:, 1] < -0.03))
P[hv] = radial(P[hv], np.array([0.0, 0.0, 1.665]))
# whatever the rays carried into the mouth, the torn cheek or the caved skull stays there
_mq = sdf.cavity_q(P, (1.15, 1.0, 1.25)) < 1
_tq = (sdf.ellipsoid(P, sdf.TEAR_C, np.array(sdf.TEAR_R) * 1.15, sdf.TEAR_ROT) < 0) if sdf.V["tear"] else np.zeros(len(P), bool)
_cq = np.zeros(len(P), bool)
for _c, _r in (sdf.CROWN if sdf.V["crown"] else []) + list(sdf.V["holes"]):
    _cq |= np.linalg.norm(P - _c, axis=1) < _r * 1.1
FROZEN = hv & (_mq | _tq | _cq) & (sdf.body(P) > -0.003)
log("cavity-lining verts frozen", int(FROZEN.sum()))
P = snap(P, 8)
for _ in range(4):
    P = snap(relax(P), 3)

def neighbour_mean(P):
    acc = np.zeros_like(P); cnt = np.zeros(len(P))
    np.add.at(acc, ev[:, 0], P[ev[:, 1]]); np.add.at(acc, ev[:, 1], P[ev[:, 0]])
    np.add.at(cnt, ev[:, 0], 1); np.add.at(cnt, ev[:, 1], 1)
    return acc / np.maximum(cnt, 1)[:, None]


# vertices that would not settle (folded over a thin feature): pull them in among their
# neighbours, grow the fix by one ring each round, re-snap
for rnd in range(8):
    bad = np.abs(sdf.body(P)) > 0.0008
    if not bad.any():
        break
    grow = bad.copy(); grow[ev[bad[ev[:, 0]], 1]] = True; grow[ev[bad[ev[:, 1]], 0]] = True
    grow &= ~FROZEN
    P[grow] = neighbour_mean(P)[grow]
    P = snap(P, 4)
_res = np.abs(sdf.body(P))
log("sculpt residual mm", round(float(_res.max() * 1000), 2), "unsettled", int((_res > 0.0008).sum()), "worst at", np.round(P[np.argmax(_res)], 3).tolist())
_ls = np.zeros(len(me.polygons), int); me.polygons.foreach_get("loop_start", _ls)
_lt = np.zeros(len(me.polygons), int); me.polygons.foreach_get("loop_total", _lt)
_lv = np.zeros(len(me.loops), int); me.loops.foreach_get("vertex_index", _lv)
F0, F1, F2 = _lv[_ls], _lv[_ls + 1], _lv[_ls + 2]
F3 = np.where(_lt > 3, _lv[np.minimum(_ls + 3, len(_lv) - 1)], F2)


def folds(P):
    a, b, c, d4 = P[F0], P[F1], P[F2], P[F3]
    nrm = np.cross(c - a, d4 - b)
    g = sdf.grad((a + b + c + d4) / 4)
    return (nrm * g).sum(1) / (np.linalg.norm(nrm, axis=1) + 1e-12)


flip = -1.0 if (folds(P) < 0).mean() > 0.5 else 1.0
_fc = (P[F0] + P[F2]) / 2
_fz = np.digitize(_fc[:, 2], [0.12, 0.9, 1.5, 1.6])
log("flipped faces by band (feet, legs, torso, neck, head):", np.bincount(_fz[flip * folds(P) < -0.1], minlength=5).tolist(),
    "| hands", int(((flip * folds(P) < -0.1) & (np.abs(_fc[:, 0]) > 0.45)).sum()))
nfold0 = int((flip * folds(P) < -0.1).sum())
for rnd in range(10):
    bad = flip * folds(P) < -0.1
    if not bad.any():
        break
    bv = np.zeros(n, bool)
    for F in (F0, F1, F2, F3):
        bv[F[bad]] = True
    bv[ev[bv[ev[:, 0]], 1]] = True; bv[ev[bv[ev[:, 1]], 0]] = True
    bv &= ~FROZEN
    P[bv] = neighbour_mean(P)[bv]
    P = snap(P, 3)
log("flipped faces", nfold0, "->", int((flip * folds(P) < -0.1).sum()))
_fc = (P[F0] + P[F1] + P[F2] + P[F3]) / 4
_hd = _fc[:, 2] > 1.52
log("head faces floating > 2.5 mm off the sculpt", int((sdf.body(_fc[_hd]) > 0.0025).sum()))
me.vertices.foreach_set("co", P.ravel())
me.update()


me.name = "Zombie"
body = bpy.data.objects.new("Zombie", me)
coll.objects.link(body)

# ---------------------------------------------------------------------------------- 3. paint
nf = len(me.polygons)
cen = np.zeros(nf * 3); me.polygons.foreach_get("center", cen); cen = cen.reshape(-1, 3)
fn = np.zeros(nf * 3); me.polygons.foreach_get("normal", fn); fn = fn.reshape(-1, 3)
ls = np.zeros(nf, int); me.polygons.foreach_get("loop_start", ls)
lt = np.zeros(nf, int); me.polygons.foreach_get("loop_total", lt)
lv = np.zeros(len(me.loops), int); me.loops.foreach_get("vertex_index", lv)
lf = np.repeat(np.arange(nf), lt)
PT = sdf.unbend(P)                 # the sheet maps the arms straight out
cenT = np.zeros((nf, 3)); np.add.at(cenT, lf, PT[lv]); cenT /= lt[:, None]
reg, subr = uvmap.classify(cenT)
U, Vv = uvmap.corner_uv(PT[lv], cenT[lf], reg[lf], subr[lf])
uvl = me.uv_layers.new(name="UVMap")
uvl.data.foreach_set("uv", np.stack([U / SIZE, 1 - Vv / SIZE], 1).ravel())
log("regions", {k: int((reg == k).sum()) for k in range(9)})
MASK = np.load(os.path.join(TEX, "zombie_mask.npy"))
inside = MASK[np.clip(Vv.astype(int), 0, SIZE - 1), np.clip(U.astype(int), 0, SIZE - 1)]
log("corners off the paint % by region", {k: round(100 * float((~inside[reg[lf] == k]).mean()), 1) for k in range(9) if (reg == k).any()})
np.savez_compressed(os.path.join(OUT, "uvdebug.npz"), U=U, V=Vv, reg=reg[lf], sub=subr[lf], lt=lt)

# where the sheet cannot cover well: stretched faces and the seams between painted pieces
q = np.stack([U, Vv], 1)
p0, p1, p2 = P[lv[ls]], P[lv[ls + 1]], P[lv[ls + 2]]
e1, e2 = p1 - p0, p2 - p0
l1 = np.linalg.norm(e1, axis=1) + 1e-12
b1 = e1 / l1[:, None]
nn = np.cross(e1, e2); nn /= np.linalg.norm(nn, axis=1, keepdims=True) + 1e-12
b2 = np.cross(nn, b1)
M = np.zeros((nf, 2, 2)); M[:, 0, 0] = l1; M[:, 0, 1] = (e2 * b1).sum(1); M[:, 1, 1] = (e2 * b2).sum(1)
Q = np.zeros((nf, 2, 2)); Q[:, :, 0] = q[ls + 1] - q[ls]; Q[:, :, 1] = q[ls + 2] - q[ls]
ok = np.abs(np.linalg.det(M)) > 1e-12
M[~ok] = np.eye(2)
sv = np.linalg.svd(Q @ np.linalg.inv(M), compute_uv=False)
aniso = sv[:, 0] / np.maximum(sv[:, 1], 1e-6)
ws_face = np.maximum(np.clip((aniso - 2.7) / 1.3, 0, 1), np.clip((330 - sv[:, 1]) / 180, 0, 1)) * ok
log("anisotropy p50/p90/p99 by region", {k: np.round(np.percentile(aniso[reg == k], [50, 90, 99]), 2).tolist() for k in range(9) if (reg == k).any()})
el = np.linalg.norm(P[ev[:, 0]] - P[ev[:, 1]], axis=1)


def spread(seed, band, it=30):
    s = seed.astype(float).copy()
    band = np.broadcast_to(band, (len(s),))
    eb = np.minimum(band[ev[:, 0]], band[ev[:, 1]])
    for _ in range(it):
        np.maximum.at(s, ev[:, 0], s[ev[:, 1]] - el / eb)
        np.maximum.at(s, ev[:, 1], s[ev[:, 0]] - el / eb)
    return np.clip(s, 0, 1)


def smooth(f, it=6):
    for _ in range(it):
        acc = np.zeros_like(f); cnt = np.zeros(len(f))
        np.add.at(acc, ev[:, 0], f[ev[:, 1]]); np.add.at(acc, ev[:, 1], f[ev[:, 0]])
        np.add.at(cnt, ev[:, 0], 1); np.add.at(cnt, ev[:, 1], 1)
        f = 0.5 * f + 0.5 * acc / np.maximum(cnt, 1)
    return f


# the painted face always wins: no patching on it
fphi = np.abs(np.arctan2(cen[:, 0], -(cen[:, 1] - 0.01)))
face = (reg == HEADR) & (fphi < np.radians(75)) & (cen[:, 2] > 1.55) & (cen[:, 2] < 1.765)
fsoft = np.clip((fphi - np.radians(62)) / np.radians(22), 0, 1)   # the guard fades out, no hard edge
mouthr = reg == uvmap.MOUTH
wsf = np.where(face & (aniso > 3.6), np.clip((aniso - 3.6) / 1.0, 0, 1), 0) * ~mouthr
ws_face = np.where(face, ws_face * fsoft, ws_face) * ~mouthr
ws = np.zeros(n); np.maximum.at(ws, lv, ws_face[lf])
ws = smooth(spread(ws, 0.02))
wf = np.zeros(n); np.maximum.at(wf, lv, wsf[lf])
de = np.minimum(np.linalg.norm(P - np.array(sdf.EYE), axis=1), np.linalg.norm(P - np.array(sdf.EYE) * [-1, 1, 1], axis=1))
eyes_v = np.abs(de - sdf.EYE_R) < 0.0016
lids_v = (de < 0.021) & ~eyes_v & (P[:, 1] < sdf.EYE[1] + 0.004)
ws = np.maximum(ws, smooth(spread(wf, 0.008), 3)) * ~eyes_v
umin = np.full(n, 1e9); umax = np.full(n, -1e9); vmin = np.full(n, 1e9); vmax = np.full(n, -1e9)
np.minimum.at(umin, lv, U); np.maximum.at(umax, lv, U); np.minimum.at(vmin, lv, Vv); np.maximum.at(vmax, lv, Vv)
near_mouth = sdf.cavity_q(P, (1.9, 1.0, 1.15) if sdf.V["mouth"] == "slit" else (1.9, 1.0, 3.6)) < 1
seam = ((umax - umin) + (vmax - vmin) > 3.0) & (np.abs(P[:, 0]) < 0.875) & ~near_mouth
limb = (np.abs(P[:, 0]) > 0.2) | (P[:, 2] < 0.85)  # thin limbs get narrow seam bands
band = np.where(np.abs(P[:, 0]) > 0.74, 0.0065, np.where(limb, 0.011, np.where(P[:, 2] > 1.5, 0.035, 0.02)))
wseam = smooth(spread(seam * 0.85, band)) * ~eyes_v
WPATCH = np.clip(np.maximum(np.maximum(ws, wseam), 0.85 * smooth(lids_v.astype(float), 1) * ~eyes_v), 0, 1)
throat = (P[:, 2] > 1.465) & (P[:, 2] < 1.575) & (np.hypot(P[:, 0], P[:, 1] - 0.015) < 0.075)   # the whole neck
WPATCH = np.maximum(WPATCH, 0.78 * smooth(throat.astype(float), 3))
if CFG.get("chestpatch"):
    WPATCH = np.maximum(WPATCH, 0.85 * np.clip((P[:, 2] - 1.36) / 0.03, 0, 1) * np.clip((1.53 - P[:, 2]) / 0.03, 0, 1)
                        * (P[:, 1] < 0.0) * (np.abs(P[:, 0]) < 0.17))
if not sdf.V["crown"]:   # the head mapping's pole sits on the crown: cover it with clone-stamped skin
    WPATCH = np.maximum(WPATCH, 0.92 * np.clip((P[:, 2] - 1.714) / 0.024, 0, 1) * (np.abs(P[:, 0]) < 0.2))
WPATCH = WPATCH * WPATCH * (3 - 2 * WPATCH)
log("patched verts %", round(100 * float((WPATCH > 0.5).mean()), 1))
pw = me.attributes.new("patchW", "FLOAT", "POINT")
pw.data.foreach_set("value", WPATCH.astype(np.float32))

# displacement from the painting's shading (mid frequencies), per-vertex mean of its corners
H = np.load(os.path.join(TEX, "zombie_height.npy")).astype(np.float32) / 0.062
hu = np.clip(U.astype(int), 0, SIZE - 1); hv = np.clip(Vv.astype(int), 0, SIZE - 1)
hs = H[hv, hu]
amp_r = np.array([0.0011, 0.0026, 0.0014, 0.0007, 0.0004, 0.0015, 0.0013, 0.0009, 0.0])[reg[lf]]
acc = np.zeros(n); cnt = np.zeros(n)
np.add.at(acc, lv, hs * amp_r); np.add.at(cnt, lv, 1)
disp = np.clip(acc / np.maximum(cnt, 1), -0.004, 0.004) * (1 - ws)
P = P + sdf.grad(P) * disp[:, None]
me.vertices.foreach_set("co", P.ravel())
me.update()


# ---------------------------------------------------------------------------------- 4. ears
def make_ear(side):
    """A cupped ear flap: helix rim, deep concha, fleshy lobe, then solidified."""
    bm = bmesh.new()
    nu, nv = 10, 14
    grid = {}
    _EA = CFG.get("ear", {})
    for i in range(nu + 1):
        for j in range(nv + 1):
            s = i / nu * 2 - 1      # across (front..back)
            t = j / nv              # bottom (lobe) .. top
            hw = 0.5 * (0.55 + 0.45 * math.sin(math.pi * min(1, t * 1.15)))  # ear outline
            if _EA.get("taper"):
                hw = 0.5 * (0.55 + 0.45 * math.sin(math.pi * min(1, t * 0.9))) * (1 - t ** 2.2) ** _EA["taper"]
            w = s * hw * 0.034
            h = (t - 0.45) * 0.062
            rim = max(0.0, abs(s) * 1.0 - 0.55) / 0.45 if t > 0.3 else 0
            rim = max(rim, max(0.0, t - 0.82) / 0.18)
            cup = -0.0055 * _EA.get("cup", 1.0) * math.exp(-((s * 0.9) ** 2 + ((t - 0.45) / (0.25 + 0.15 * (_EA.get("cup", 1.0) - 1))) ** 2) * 1.6)
            out = 0.004 * rim + cup + 0.012 * t * (1 - abs(s) * 0.3)
            grid[i, j] = bm.verts.new((out, w, h))
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((grid[i, j], grid[i + 1, j], grid[i + 1, j + 1], grid[i, j + 1]))
    em = bpy.data.meshes.new("ear")
    bm.to_mesh(em); bm.free()
    ob = bpy.data.objects.new("ear", em)
    coll.objects.link(ob)
    sol = ob.modifiers.new("sol", "SOLIDIFY"); sol.thickness = 0.0035 * _EA.get("thin", 1.0); sol.offset = -1
    ss = ob.modifiers.new("ss", "SUBSURF"); ss.levels = 1
    dg = bpy.context.evaluated_depsgraph_get()
    m2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob, do_unlink=True)
    Q = np.zeros(len(m2.vertices) * 3); m2.vertices.foreach_get("co", Q); Q = Q.reshape(-1, 3)
    # place: stand out ~22 deg from the skull, tilted back
    EA = CFG.get("ear", {})
    es = EA.get("scale", 1.0)
    Q[:, 1] *= es; Q[:, 2] *= es * EA.get("point", 1.0); Q[:, 0] *= 1 + 0.3 * (es - 1)
    Q[:, 1] += np.clip(Q[:, 2], 0, None) * EA.get("sweep", 0.0)          # swept back toward the tip
    rz = np.radians(EA.get("flare", 22)) * (-1 if side > 0 else 1)
    Q[:, 0] *= side
    Rz = np.array([[math.cos(rz), -math.sin(rz), 0], [math.sin(rz), math.cos(rz), 0], [0, 0, 1]])
    Rx = sdf.rot_x(EA.get("tilt", -12))
    Q = Q @ Rz.T @ Rx.T + np.array([side * 0.067, 0.014 + 0.004 * (es - 1), 1.668 + 0.006 * (es - 1)])
    m2.vertices.foreach_set("co", Q.ravel()); m2.update()
    _bm = bmesh.new(); _bm.from_mesh(m2)
    bmesh.ops.recalc_face_normals(_bm, faces=_bm.faces)
    _bm.to_mesh(m2); _bm.free(); m2.update()
    lv2 = np.zeros(len(m2.loops), int); m2.loops.foreach_get("vertex_index", lv2)
    k0 = uvmap.S["ears"]["k"]
    uvmap.S["ears"]["k"] = k0 / es                       # a bigger ear still maps onto the painted one
    u, v = uvmap.ear_uv((Q[lv2] - [side * 0.067, 0.014, 1.668]) / [1, 1, 1] + [side * 0.067, 0.014, 1.668], np.full(len(lv2), side))
    uvmap.S["ears"]["k"] = k0
    ul = m2.uv_layers.new(name="UVMap")
    ul.data.foreach_set("uv", np.stack([u / SIZE, 1 - v / SIZE], 1).ravel())
    pe = m2.attributes.new("part", "INT", "POINT")
    pe.data.foreach_set("value", np.full(len(m2.vertices), 5, np.int32))
    ob = bpy.data.objects.new("ear", m2)
    coll.objects.link(ob)
    return ob


ears = [make_ear(1), make_ear(-1)]


def make_teeth():
    """Two rows of crooked yellow teeth in the open mouth, a few missing, mapped onto the
    painted teeth strips (upper strip: gums on top; lower strip: gums below)."""
    rng = np.random.default_rng(4)
    bm = bmesh.new()
    style = sdf.V["mouth"]
    mr = sdf.mouth_r()
    rows = [(sdf.MOUTH_C[2] + mr[2] + 0.0005, -1.0), (sdf.MOUTH_C[2] - mr[2] + 0.0025, 1.0)]
    lower_start = None
    if style == "slit":
        rows = []
        for sx in (1, -1):
            for i in range(12):
              for row, (yb, lk) in enumerate(((-0.073, 1.0), (-0.062, 0.65))):
                zc = sdf.SLIT_C[2] - sdf.SLIT_R[2] * 0.82 + (i + 0.5 + 0.5 * row) / 12 * sdf.SLIT_R[2] * 1.64
                zc += rng.uniform(-0.0022, 0.0022)
                ln = 0.0115 * sdf.V["slitw"] * 0.62 * lk * (1 - ((zc - sdf.SLIT_C[2]) / sdf.SLIT_R[2]) ** 2 * 0.55) * rng.uniform(0.5, 1.45)
                base = Vector((sx * 0.011 * sdf.V["slitw"] * (0.92 if row else 1.0), yb + rng.uniform(-0.003, 0.003), zc))
                res = bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=0.0021 * (1 + 0.6 * (sdf.V["slitw"] - 1)) * rng.uniform(0.7, 1.35), radius2=0.0003, depth=ln)
                q = Vector((0, 0, 1)).rotation_difference(Vector((-sx, 0.55 if sdf.V["slitw"] > 1 else -0.3, rng.uniform(-0.2, 0.2))).normalized())
                for v in res["verts"]:
                    v.co = base + q @ (v.co + Vector((0, 0, ln / 2)))
                if rng.random() < 0.15:
                    break
    for zg, dz in rows:
        n = 15
        if dz > 0:
            lower_start = len(bm.verts)
        for i in range(n):
            a_lo = -112 if sdf.V["cheeks"] else -82
            a_hi = 112 if (sdf.V["cheeks"] or sdf.V["tear"]) else 82
            a = math.radians(a_lo + (a_hi - a_lo) * (i + 0.5) / n)   # back to the molars where a cheek is torn
            if rng.random() < 0.12 or (a < math.radians(-60) and rng.random() < 0.3):
                continue
            front = abs(a) < math.radians(36)
            w = (0.0042 if front else 0.005) * rng.uniform(0.75, 1.05) * (1 + 0.5 * (sdf.V["teeth"] - 1))
            h = (0.016 if front else 0.0105) * rng.uniform(0.55, 1.2) * (1.0 if dz < 0 else 0.6) * sdf.V["teeth"]
            if rng.random() < 0.2:
                h *= 0.35                                      # snapped to a stump
            if dz < 0 and abs(math.degrees(a) - 32) < 7 and sdf.V["canine"] == 1.0:
                h *= 1.6; w *= 0.8                            # one long snaggle canine
            canine = 22 < abs(math.degrees(a)) < 42 and dz < 0
            if canine and sdf.V["canine"] != 1.0:
                h *= sdf.V["canine"]; w *= 1 + 0.45 * (sdf.V["canine"] - 1)
            rr = 1.0 if dz < 0 else 0.9                        # lower row sits inside: an overbite
            c = Vector((0.019 * rr * math.sin(a), -0.056 - (0.0235 * rr + sdf.V["teeth_fwd"]) * math.cos(a), zg + dz * h / 2))
            t = Vector((math.cos(a), math.sin(a), 0)); r = Vector((math.sin(a), -math.cos(a), 0))
            tilt = rng.uniform(-0.25, 0.25)
            if style == "fangs":                               # long hooked fangs
                h *= 1.5 if front else 1.2
                res = bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=w * 0.55, radius2=0.0003, depth=h)
                for v in res["verts"]:
                    x, y, z = v.co
                    v.co = c + t * (x + z * tilt * 0.3) + r * (y + max(0.0, z) * (0.3 if canine else 0.08)) + Vector((0, 0, -dz * z))
                continue
            res = bmesh.ops.create_cube(bm, size=1.0)
            for v in res["verts"]:
                x, y, z = v.co
                v.co = c + t * (x * w + z * h * tilt * 0.3) + r * (y * 0.0032) + Vector((0, 0, z * h))
    if lower_start is not None:  # the lower row hangs with the crooked jaw
        for v in list(bm.verts)[lower_start:]:
            v.co = Vector(sdf.jaw_world(np.array([v.co[:]]))[0])
    tm = bpy.data.meshes.new("teeth")
    bm.to_mesh(tm); bm.free()
    ob = bpy.data.objects.new("teeth", tm); coll.objects.link(ob)
    ob.modifiers.new("ss", "SUBSURF").levels = 1
    dg = bpy.context.evaluated_depsgraph_get()
    m2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob, do_unlink=True)
    Q = np.zeros(len(m2.vertices) * 3); m2.vertices.foreach_get("co", Q); Q = Q.reshape(-1, 3)
    lv2 = np.zeros(len(m2.loops), int); m2.loops.foreach_get("vertex_index", lv2)
    q = Q[lv2]
    if style == "slit":
        u, v = uvmap.teeth_uv_slit(q)
        hv = np.clip((0.011 - np.abs(Q[:, 0])) / 0.011, 0, 1)
    else:
        u, v = uvmap.teeth_uv(q, rows[0][0], rows[1][0])
        hv = np.clip(np.where(Q[:, 2] > sdf.MOUTH_C[2], (rows[0][0] - Q[:, 2]) / 0.014, (Q[:, 2] - rows[1][0]) / 0.012), 0, 1)
    ul = m2.uv_layers.new(name="UVMap")
    ul.data.foreach_set("uv", np.stack([u / SIZE, 1 - v / SIZE], 1).ravel())
    ta = m2.attributes.new("toothh", "FLOAT", "POINT")
    ta.data.foreach_set("value", hv.astype(np.float32))
    pa = m2.attributes.new("part", "INT", "POINT")
    pa.data.foreach_set("value", np.full(len(m2.vertices), 2, np.int32))
    ob = bpy.data.objects.new("teeth", m2); coll.objects.link(ob)
    return ob


ears.append(make_teeth())  # rides with the ears: skin material, weighted to the head


def make_claws():
    """Hooked keratin claws on every fingertip (separate pieces, so they read past the flesh)."""
    obs = []
    kc = sdf.V["claws"]
    for side in (1, -1):
        for name in uvmap.FNAMES:
            pts = sdf.finger_pts(name)
            tip, prev = np.array(pts[-1]), np.array(pts[-3] if len(pts) > 2 else pts[-2])
            dv = (tip - prev) / np.linalg.norm(tip - prev)
            r = sdf.FINGER_R[name] * 0.62
            ln = 0.011 * kc * (1.15 if name == "thumb" else 1.0)
            bm = bmesh.new()
            ct = bm.verts.layers.float.new("clawt")      # layers first: adding one later orphans the verts
            res = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=r, radius2=0.00025, depth=ln)
            for v in res["verts"]:
                t = (v.co.z + ln / 2) / ln                        # 0 at the root .. 1 at the point
                x, y = v.co.x, v.co.y * 0.6                      # flattened like a nail
                along = t * ln
                hook = -0.55 * ln * t * t                        # curls down past the fingertip
                base = tip - dv * 0.003 + np.array([0, 0, sdf.FINGER_R[name] * 0.35])
                lat = np.cross(dv, (0, 0, 1.0)); lat /= np.linalg.norm(lat)
                q = base + dv * along + lat * x + np.array([0, 0, 1.0]) * (y + hook)
                qa = sdf.to_A(np.array([[q[0], q[1], q[2]]]))[0]
                v.co = (side * qa[0], qa[1], qa[2])
                v[ct] = t
            if side < 0:
                bmesh.ops.reverse_faces(bm, faces=bm.faces)
            me_c = bpy.data.meshes.new("claw")
            bm.to_mesh(me_c); bm.free()
            nv_c = len(me_c.vertices)
            ul = me_c.uv_layers.new(name="UVMap")
            hand = uvmap.S["hands"]["dl" if side > 0 else "dr"]
            ul.data.foreach_set("uv", np.tile([hand["tips"][1][0] / SIZE, 1 - hand["tips"][1][1] / SIZE], len(me_c.loops)))
            pa = me_c.attributes.new("part", "INT", "POINT")
            pa.data.foreach_set("value", np.full(nv_c, 3, np.int32))
            ob = bpy.data.objects.new("claw", me_c); coll.objects.link(ob)
            sfx = "_l" if side > 0 else "_r"
            bone = "hand" + sfx if name == "thumb" else name + "_04_leaf" + sfx
            g = ob.vertex_groups.new(name=bone if bone in ARM.data.bones else "hand" + sfx)
            g.add(list(range(nv_c)), 1.0, "REPLACE")
            obs.append(ob)
    return obs


CLAWS = make_claws() if sdf.V["claws"] > 1.0 else []


def make_spurs():
    """Bone horns out of the shoulders, collarbones and shoulder blades: keratin-coloured like the claws."""
    obs = []
    for base, tip, r0, bone in SPURS:
        ln = float(np.linalg.norm(tip - base)) * 1.25
        dv = (tip - base) / np.linalg.norm(tip - base)
        bm = bmesh.new()
        ct = bm.verts.layers.float.new("clawt")
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=r0, radius2=0.0012, depth=ln)
        side = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > ln * 0.5]
        bmesh.ops.subdivide_edges(bm, edges=side, cuts=9, use_grid_fill=False)   # rings along it for the ridges and the hook
        q = Vector((0, 0, 1)).rotation_difference(Vector(dv))
        start = Vector(base - dv * ln * 0.2)
        for v in bm.verts:
            t = (v.co.z + ln / 2) / ln
            ridge = 1 + 0.1 * math.sin(t * 34)                       # growth rings
            v.co = start + q @ (Vector((v.co.x * ridge, v.co.y * ridge, v.co.z)) + Vector((0, 0, ln / 2))) + Vector((0, 0, 0.018 * t * t))
            v[ct] = t
        me_c = bpy.data.meshes.new("spur")
        bm.to_mesh(me_c); bm.free()
        me_c.uv_layers.new(name="UVMap")
        pa = me_c.attributes.new("part", "INT", "POINT")
        pa.data.foreach_set("value", np.full(len(me_c.vertices), 4, np.int32))
        ob = bpy.data.objects.new("spur", me_c); coll.objects.link(ob)
        g = ob.vertex_groups.new(name=bone if bone in ARM.data.bones else "spine_03")
        g.add(list(range(len(me_c.vertices))), 1.0, "REPLACE")
        obs.append(ob)
    return obs


CLAWS += make_spurs()


# ---------------------------------------------------------------------------------- 5. rags
def make_rags():
    """Grave-cloth wrap: hugs the hips, hangs in torn tails front and back, slit at the sides."""
    seg, rows = 56, 16
    bm = bmesh.new()
    rng = np.random.default_rng(7)
    grid = {}
    top, bot = 0.975, 0.60
    for j in range(rows + 1):
        z = top - (top - bot) * j / rows
        for i in range(seg):
            a = 2 * math.pi * i / seg
            grid[i, j] = bm.verts.new((math.sin(a) * 0.2, 0.03 - math.cos(a) * 0.2, z))
    for j in range(rows):
        for i in range(seg):
            i2 = (i + 1) % seg
            bm.faces.new((grid[i, j], grid[i2, j], grid[i2, j + 1], grid[i, j + 1]))
    bm.verts.ensure_lookup_table()
    Q = np.array([v.co[:] for v in bm.verts])
    # shrink onto the body (with a gap), stiffly below the buttocks
    ang = np.arctan2(Q[:, 0], -(Q[:, 1] - 0.03))
    for _ in range(20):
        d = sdf.body(Q) - (0.0025 + (0.0085 + 0.009 * (Q[:, 1] < 0)) * np.clip((0.95 - Q[:, 2]) / 0.07, 0, 1))   # cinched at the waist, padded over the thighs
        g = sdf.grad(Q)
        stiff = np.clip((Q[:, 2] - 0.86) / 0.06, 0, 1)
        Q -= (d * stiff)[:, None] * g
    # below the hip line it hangs from the widest ring, drifting out a touch
    ring = Q[:, 2] >= 0.9
    for i in range(seg):
        col = np.arange(i, len(Q), seg)
        anchor = col[np.argmax(np.hypot(Q[col, 0], Q[col, 1] - 0.03) * (Q[col, 2] > 0.86))]
        for k in col:
            if Q[k, 2] < 0.9:
                drop = 0.9 - Q[k, 2]
                dirv = np.array([Q[anchor, 0], Q[anchor, 1] - 0.03, 0.0])
                dirv /= np.linalg.norm(dirv) + 1e-9
                fold = 0.006 * math.sin(math.atan2(dirv[0], -dirv[1]) * 14 + Q[k, 2] * 9) * min(1.0, drop / 0.1)
                Q[k, :2] = Q[anchor, :2] + dirv[:2] * (drop * 0.1 + fold)       # hanging folds
    # keep hanging cloth clear of the thighs
    for _ in range(6):
        d = sdf.body(Q) - (0.018 + 0.014 * (Q[:, 1] < 0.0))
        bad = d < 0
        Q[bad] -= (d[bad])[:, None] * sdf.grad(Q[bad])
    for v, q in zip(bm.verts, Q):
        v.co = q
    # a torn strip of cloth hangs over the front and back splits
    n_main = len(bm.faces)
    mids = []
    dup = bmesh.ops.duplicate(bm, geom=mids)
    for v in [g for g in dup["geom"] if isinstance(g, bmesh.types.BMVert)]:
        rv = Vector((v.co.x, v.co.y - 0.03, 0)).normalized()
        v.co += rv * 0.007
    rm = bpy.data.meshes.new("rags")
    bm.to_mesh(rm); bm.free()
    ul = rm.uv_layers.new(name="UVMap")
    lv2 = np.zeros(len(rm.loops), int); rm.loops.foreach_get("vertex_index", lv2)
    Q2 = np.zeros(len(rm.vertices) * 3); rm.vertices.foreach_get("co", Q2); Q2 = Q2.reshape(-1, 3)
    a2 = np.arctan2(Q2[lv2, 0], -(Q2[lv2, 1] - 0.03))
    lt2 = np.zeros(len(rm.polygons), int); rm.polygons.foreach_get("loop_total", lt2)
    strip = np.repeat(np.arange(len(rm.polygons)) >= n_main, lt2)          # the strips sample cloth beside the split
    ul.data.foreach_set("uv", np.stack([(a2 / (2 * np.pi) + 0.5) * 2.0 + 0.11 * strip, (Q2[lv2, 2] - 0.60) * 2.4], 1).ravel())
    ob = bpy.data.objects.new("rags", rm)
    coll.objects.link(ob)
    return ob


rags = make_rags() if CFG.get("rags") else None
EXTRA, EXTRA_A, ROPES = extras.build(CFG.get("extras", {}), ARM, coll, np.random.default_rng(5))


# ---------------------------------------------------------------------------------- materials
def img(name, colorspace):
    im = bpy.data.images.load(os.path.join(TEX, name))
    im.colorspace_settings.name = colorspace
    return im


def skin_material():
    mat = bpy.data.materials.new("ZombieSkin")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(nd for nd in nt.nodes if nd.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img("zombie_basecolor.png", "sRGB")
    col = nt.nodes.new("ShaderNodeVertexColor"); col.layer_name = "Col"
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    nt.links.new(col.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    nrm = nt.nodes.new("ShaderNodeTexImage"); nrm.image = img("zombie_normal.png", "Non-Color")
    nmap = nt.nodes.new("ShaderNodeNormalMap"); nmap.uv_map = "UVMap"
    nt.links.new(nrm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    orm = nt.nodes.new("ShaderNodeTexImage"); orm.image = img("zombie_orm.png", "Non-Color")
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(orm.outputs["Color"], sep.inputs[0])
    nt.links.new(sep.outputs[1], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs[2], bsdf.inputs["Metallic"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.45
    return mat


def rag_material():
    mat = bpy.data.materials.new("ZombieRags")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(nd for nd in nt.nodes if nd.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img("zombie_rags.png", "sRGB")
    col = nt.nodes.new("ShaderNodeVertexColor"); col.layer_name = "Col"
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    nt.links.new(col.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    cut = nt.nodes.new("ShaderNodeMath"); cut.operation = "GREATER_THAN"; cut.inputs[1].default_value = 0.5
    nt.links.new(tex.outputs["Alpha"], cut.inputs[0])
    nt.links.new(cut.outputs[0], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.95
    try:
        mat.surface_render_method = "DITHERED"
    except Exception:
        pass
    mat.use_backface_culling = False
    try:
        mat.blend_method = "CLIP"
    except Exception:
        pass
    return mat


SKIN = skin_material()
RAGM = rag_material() if (rags or EXTRA) else None
WRAPM = None
if EXTRA:
    WRAPM = rag_material()
    WRAPM.name = "ZombieWraps"
    next(nd for nd in WRAPM.node_tree.nodes if nd.type == "TEX_IMAGE").image = img("zombie_wraps.png", "sRGB")
if RAGM:
    _nt = RAGM.node_tree
    _mx = next(nd for nd in _nt.nodes if nd.type == "MIX")
    _tn = _nt.nodes.new("ShaderNodeRGB"); _tn.outputs[0].default_value = (*CFG["rags"], 1.0)
    _m2 = _nt.nodes.new("ShaderNodeMix"); _m2.data_type = "RGBA"; _m2.blend_type = "MULTIPLY"; _m2.inputs[0].default_value = 1.0
    _bs = next(nd for nd in _nt.nodes if nd.type == "BSDF_PRINCIPLED")
    _nt.links.new(_mx.outputs[2], _m2.inputs[6]); _nt.links.new(_tn.outputs[0], _m2.inputs[7])
    _nt.links.new(_m2.outputs[2], _bs.inputs["Base Color"])
for o in [body] + ears + CLAWS:   # claws share the skin atlas (else they join into the rag slot)
    o.data.materials.append(SKIN)
if rags:
    rags.data.materials.append(RAGM)
if EXTRA:   # slot 0 skin and 1 rags stay put (empty slots keep the indices), extras in 2
    EXTRA.data.materials.append(SKIN); EXTRA.data.materials.append(RAGM); EXTRA.data.materials.append(WRAPM)
    for poly in EXTRA.data.polygons:
        poly.material_index = 2

# ---------------------------------------------------------------------------------- 6. skin
for b in ARM.data.bones:
    b.use_deform = b.name != "root"
for o in bpy.context.scene.objects:
    o.select_set(False)
body.select_set(True); ARM.select_set(True)
bpy.context.view_layer.objects.active = ARM
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
mod = next(m for m in body.modifiers if m.type == "ARMATURE")
unweighted = sum(1 for v in body.data.vertices if not v.groups or sum(g.weight for g in v.groups) < 1e-4)
log("unweighted verts after bone heat", unweighted)
# the modelled thumb rides the hand bone: fold every thumb weight into hand_l / hand_r
for side in ("l", "r"):
    hg = body.vertex_groups["hand_" + side]
    tg = [g for g in body.vertex_groups if g.name.startswith("thumb_") and g.name.endswith("_" + side)]
    tidx = {g.index for g in tg}
    for v in body.data.vertices:
        w = sum(g.weight for g in v.groups if g.group in tidx)
        if w > 0:
            cur = next((g.weight for g in v.groups if g.group == hg.index), 0.0)
            hg.add([v.index], cur + w, "REPLACE")
    for g in tg:
        g.remove(list(range(len(body.data.vertices))))

# the chest and collar below the neck base ride the chest: no neck or head weight on the
# sternum, and the front of the collar only half follows the clavicle's shrug (else it folds)
NECKG = {body.vertex_groups[g].index for g in ("neck_01", "Head") if g in body.vertex_groups}
CLAVG = {body.vertex_groups[g].index for g in ("clavicle_l", "clavicle_r") if g in body.vertex_groups}
S3 = body.vertex_groups["spine_03"]


def chest_cleanup():
    for v in body.data.vertices:
        co = v.co
        front = co.y < -0.025
        drop_neck = (front and co.z < 1.50) or (abs(co.x) > 0.065 and co.z < 1.485)
        half_clav = front and co.z < 1.475 and abs(co.x) < 0.17
        moved = 0.0
        for g in list(v.groups):
            if drop_neck and g.group in NECKG:
                moved += g.weight
                body.vertex_groups[g.group].remove([v.index])
            elif half_clav and g.group in CLAVG:
                moved += g.weight * 0.5
                body.vertex_groups[g.group].add([v.index], g.weight * 0.5, "REPLACE")
        if moved:
            cur = next((g.weight for g in v.groups if g.group == S3.index), 0.0)
            S3.add([v.index], cur + moved, "REPLACE")


chest_cleanup()



def ss(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def neck_weights():
    """Under the jaw the skin rides the neck, not the head: head weight only above the jaw line
    (low under the chin, high at the nape), neck in between, chest at the base. It fades out
    radially across the trapezius into whatever the shoulder had, so there is no weight cliff
    for the head's pitch in the hunch to fold into a shelf."""
    gi = {g.name: g.index for g in body.vertex_groups}
    H, NK, S3 = gi["Head"], gi["neck_01"], gi["spine_03"]
    for v in body.data.vertices:
        x, y, z = v.co
        r = math.hypot(x, y - 0.015)
        if r > 0.13 or z < 1.42 or z > 1.66:
            continue
        zj = 1.585 + (y + 0.01) * 0.5
        h = ss(zj - 0.012, zj + 0.012, z)
        b = ss(1.47, 1.515, z)
        rad = 1.0 - ss(0.06, 0.12, r)
        old = {g.group: g.weight for g in v.groups}
        tot = sum(old.values()) or 1.0
        new = {k: w / tot * (1 - rad) for k, w in old.items()}
        for k, w in ((H, h), (NK, (1 - h) * b), (S3, (1 - h) * (1 - b))):
            new[k] = new.get(k, 0.0) + w * rad
        for k in old:
            body.vertex_groups[k].remove([v.index])
        for k, w in new.items():
            if w > 1e-3:
                body.vertex_groups[k].add([v.index], w, "REPLACE")


def shoulder_weights():
    """Upper-arm weight ramps in along the hanging arm's own axis: skin above the shoulder joint
    stays with the chest and collarbone, the deltoid and arm below follow the arm. Spreads the
    turn over ~9 cm so the shoulder top rounds instead of collapsing into a plate."""
    da = np.array([math.cos(sdf.APOSE), 0.0, -math.sin(sdf.APOSE)])
    for side, sg in (("l", 1), ("r", -1)):
        ua_i = body.vertex_groups["upperarm_" + side].index
        for v in body.data.vertices:
            x, y, z = v.co
            if sg * x < 0.08:
                continue
            q = np.array([abs(x), y, z]) - sdf.SHOULDER
            if np.linalg.norm(q) > 0.11:
                continue
            ua = ss(-0.055, 0.045, float(q @ da))
            old = {g.group: g.weight for g in v.groups}
            others = {k: w for k, w in old.items() if k != ua_i}
            tot = sum(others.values())
            if tot < 1e-6:
                continue
            for k in old:
                body.vertex_groups[k].remove([v.index])
            body.vertex_groups[ua_i].add([v.index], ua, "REPLACE") if ua > 1e-3 else None
            for k, w in others.items():
                if w / tot * (1 - ua) > 1e-3:
                    body.vertex_groups[k].add([v.index], w / tot * (1 - ua), "REPLACE")


# relax the neck / shoulder weights (bone heat leaves a hard crease across the throat)
SMOOTH_G = ["neck_01", "Head", "spine_03", "spine_02", "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r"]
bme = body.data
nb = len(bme.vertices)
Pb = np.zeros(nb * 3); bme.vertices.foreach_get("co", Pb); Pb = Pb.reshape(-1, 3)
eb = np.zeros(len(bme.edges) * 2, int); bme.edges.foreach_get("vertices", eb); eb = eb.reshape(-1, 2)
gi = {body.vertex_groups[g].index: k for k, g in enumerate(SMOOTH_G) if g in body.vertex_groups}
Wm = np.zeros((nb, len(SMOOTH_G)))
for v in bme.vertices:
    for g in v.groups:
        if g.group in gi:
            Wm[v.index, gi[g.group]] = g.weight
zone = (Pb[:, 2] > 1.30) & (np.abs(Pb[:, 0]) < 0.3)
for _ in range(10):
    acc = np.zeros_like(Wm); cnt = np.zeros(nb)
    np.add.at(acc, eb[:, 0], Wm[eb[:, 1]]); np.add.at(acc, eb[:, 1], Wm[eb[:, 0]])
    np.add.at(cnt, eb[:, 0], 1); np.add.at(cnt, eb[:, 1], 1)
    Wm[zone] = 0.5 * Wm[zone] + 0.5 * (acc / np.maximum(cnt, 1)[:, None])[zone]
for k, g in enumerate(SMOOTH_G):
    vg = body.vertex_groups.get(g)
    if vg is None:
        continue
    for i in np.where(zone)[0]:
        w = float(Wm[i, k])
        if w > 1e-3:
            vg.add([int(i)], w, "REPLACE")
        else:
            vg.remove([int(i)])
chest_cleanup()
shoulder_weights()
neck_weights()

# ears follow the head; rags copy the nearest body weights (stiffened toward the pelvis)
bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
gname = {g.index: g.name for g in body.vertex_groups}


def copy_weights(ob, pelvis_bias=0.0, anchors=None):
    for g in body.vertex_groups:
        ob.vertex_groups.new(name=g.name)
    for v in ob.data.vertices:
        loc, nrm, fi, dist = bvh.find_nearest(Vector(anchors[v.index]) if anchors is not None else v.co)
        if fi is None:
            continue
        acc = {}
        poly = body.data.polygons[fi]
        for vi in poly.vertices:
            for g in body.data.vertices[vi].groups:
                acc[g.group] = acc.get(g.group, 0) + g.weight / len(poly.vertices)
        if pelvis_bias:
            k = min(1.0, max(0.0, (0.93 - v.co.z) / 0.25)) * pelvis_bias
            for gi in list(acc):
                acc[gi] *= (1 - k) if gname[gi] != "pelvis" else 1
            pi = body.vertex_groups["pelvis"].index
            acc[pi] = acc.get(pi, 0) + k
        if pelvis_bias and abs(v.co.x) < 0.07 and v.co.z < 0.9:  # front/back panels hang between the legs
            gl, gr = body.vertex_groups["thigh_l"].index, body.vertex_groups["thigh_r"].index
            mix = (acc.get(gl, 0) + acc.get(gr, 0)) / 2
            if mix > 0:
                acc[gl] = acc[gr] = mix
        tot = sum(acc.values()) or 1
        for gi, w in acc.items():
            ob.vertex_groups[gname[gi]].add([v.index], w / tot, "REPLACE")


for e in ears:
    g = e.vertex_groups.new(name="Head")
    g.add(list(range(len(e.data.vertices))), 1.0, "REPLACE")
for _g in ("pelvis", "thigh_l", "thigh_r") if rags else ():   # each flap mostly rides its own thigh
    rags.vertex_groups.new(name=_g)
for v in (rags.data.vertices if rags else []):
    # pelvis at the band, ~65% on that side's thigh by 4 cm down, blended across the front centre
    t = min(1.0, max(0.0, (0.975 - v.co.z) / 0.06))
    wt = 0.9 * t
    sl = min(1.0, max(0.0, (v.co.x + 0.02) / 0.04))
    sl = sl * sl * (3 - 2 * sl)
    for g, w in (("thigh_l", wt * sl), ("thigh_r", wt * (1 - sl)), ("pelvis", 1 - wt)):
        if w > 1e-3:
            rags.vertex_groups[g].add([v.index], w, "REPLACE")

# join into one skinned mesh (skin + rags = two materials)
for o in bpy.context.scene.objects:
    o.select_set(False)
if EXTRA:
    copy_weights(EXTRA, anchors=EXTRA_A)
for o in [body] + ears + CLAWS + ([rags] if rags else []) + ([EXTRA] if EXTRA else []):
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
me = body.data
bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
for poly in me.polygons:
    poly.use_smooth = True

# baked ambient occlusion -> vertex colours (soles and the mouth slot darkened too)
dg = bpy.context.evaluated_depsgraph_get()
nv = len(me.vertices)
P = np.zeros(nv * 3); me.vertices.foreach_get("co", P); P = P.reshape(-1, 3)
N = np.zeros(nv * 3); me.vertices.foreach_get("normal", N); N = N.reshape(-1, 3)
me.calc_loop_triangles()
lt_v = np.zeros(len(me.loop_triangles) * 3, int); me.loop_triangles.foreach_get("vertices", lt_v)
_tmi = np.zeros(len(me.loop_triangles), int); me.loop_triangles.foreach_get("material_index", _tmi)
bvh = BVHTree.FromPolygons([tuple(p) for p in P], [tuple(t) for t in lt_v.reshape(-1, 3)[_tmi != 2]], epsilon=0.0)
rng = np.random.default_rng(3)
dirs = rng.normal(size=(40, 3)); dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
ao = np.ones(nv)
for i in range(nv):
    o = Vector(P[i] + N[i] * 0.0015)
    hit = 0.0; tot = 0.0
    for d in dirs:
        c = float(np.dot(d, N[i]))
        if c <= 0.05:
            continue
        loc, _, _, dist = bvh.ray_cast(o, Vector(d), 0.12)
        tot += c
        if loc is not None:
            hit += c * (1 - dist / 0.12) ** 0.5
    ao[i] = 1 - hit / max(tot, 1e-6)
ao = np.clip(0.36 + 0.64 * ao, 0, 1) ** 1.1
eyes = np.minimum(np.linalg.norm(P - np.array(sdf.EYE), axis=1), np.linalg.norm(P - np.array(sdf.EYE) * [-1, 1, 1], axis=1))
ao = np.where(eyes < sdf.EYE_R + 0.003, np.maximum(ao, 0.8), ao)  # wet eyes catch light, not soot
sole = np.clip((0.02 - P[:, 2]) / 0.02, 0, 1) * np.clip(-N[:, 2], 0, 1)
ao *= 1 - 0.55 * sole
if "part" in me.attributes:
    _pt = np.zeros(nv, np.int32); me.attributes["part"].data.foreach_get("value", _pt)
    ao = np.where(_pt == 2, np.maximum(ao, 0.92), ao)
    ao = np.where(_pt >= 4, np.maximum(ao, 0.8), ao)       # ears and spurs: thin, out in the light
_mi = np.zeros(len(me.polygons), int); me.polygons.foreach_get("material_index", _mi)
_xv = np.zeros(nv, bool)
for _poly in me.polygons:
    if _mi[_poly.index] == 2:
        _xv[list(_poly.vertices)] = True
ao = np.where(_xv, np.maximum(ao, 0.85), ao)   # hair, weed and wraps: thin cards, not occluded crevices
ca = me.color_attributes.new("Col", "BYTE_COLOR", "POINT")
ca.data.foreach_set("color", np.stack([ao, ao * 0.985, ao * 0.985, np.ones(nv)], 1).ravel())
me.color_attributes.active_color = ca
try:
    me.color_attributes.render_color_index = me.color_attributes.active_color_index
except Exception:
    pass
log("verts", nv, "tris", len(me.loop_triangles), "ao mean", float(ao.mean()))

# ---------------------------------------------------------------------------------- 8. atlas bake
import subprocess  # noqa: E402

nl = len(me.loops)
lv = np.zeros(nl, int); me.loops.foreach_get("vertex_index", lv)
npoly = len(me.polygons)
lt = np.zeros(npoly, int); me.polygons.foreach_get("loop_total", lt)
lf = np.repeat(np.arange(npoly), lt)
pmat = np.zeros(npoly, int); me.polygons.foreach_get("material_index", pmat)
sheet_uv = np.zeros(nl * 2); me.uv_layers["UVMap"].data.foreach_get("uv", sheet_uv); sheet_uv = sheet_uv.reshape(-1, 2)
SPX = np.stack([sheet_uv[:, 0] * SIZE, (1 - sheet_uv[:, 1]) * SIZE], 1)
evj = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get("vertices", evj); evj = evj.reshape(-1, 2)
Wv = np.zeros(nv, np.float32); me.attributes["patchW"].data.foreach_get("value", Wv)
LOWIMG = np.load(os.path.join(TEX, "zombie_low.npy")).astype(np.float32)
skin_l = pmat[lf] == 0
li = np.clip(SPX.astype(int), 0, SIZE - 1)
acc = np.zeros((nv, 3)); cnt = np.zeros(nv)
np.add.at(acc, lv[skin_l], LOWIMG[li[skin_l, 1], li[skin_l, 0]]); np.add.at(cnt, lv[skin_l], 1)
LOWV = acc / np.maximum(cnt, 1)[:, None]
for _ in range(40):  # smear the sheet's local colour across the surface, not along the sheet
    a2 = np.zeros_like(LOWV); c2 = np.zeros(nv)
    np.add.at(a2, evj[:, 0], LOWV[evj[:, 1]]); np.add.at(a2, evj[:, 1], LOWV[evj[:, 0]])
    np.add.at(c2, evj[:, 0], 1); np.add.at(c2, evj[:, 1], 1)
    LOWV = 0.5 * LOWV + 0.5 * a2 / np.maximum(c2, 1)[:, None]

atlas = me.uv_layers.new(name="Atlas")
me.uv_layers.active = atlas
# smart project the skin, with the head blown up first so the face gets more of the atlas
Pk = P.copy()
hd = np.clip((P[:, 2] - 1.5) / 0.06, 0, 1)[:, None]
Pb = P + (P - np.array([0, 0.0, 1.66])) * 0.55 * hd
me.vertices.foreach_set("co", Pb.ravel()); me.update()
for poly in me.polygons:
    poly.select = poly.material_index == 0
    poly.hide = poly.material_index != 0      # rags keep their own tiling UVs
bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=0.004, area_weight=0.0,
                         correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.select_all(action="SELECT")
try:
    bpy.ops.uv.pack_islands(rotate=True, margin=0.0025, shape_method="CONCAVE")
except TypeError:
    bpy.ops.uv.pack_islands(rotate=True, margin=0.0025)
bpy.ops.object.mode_set(mode="OBJECT")
me = body.data
for poly in me.polygons:
    poly.hide = False
me.vertices.foreach_set("co", Pk.ravel()); me.update()
atlas = me.uv_layers["Atlas"]
AUV = np.zeros(nl * 2); atlas.data.foreach_get("uv", AUV); AUV = AUV.reshape(-1, 2)
log("atlas skin uv bounds", AUV[skin_l].min(0).round(3).tolist(), AUV[skin_l].max(0).round(3).tolist())

me.calc_loop_triangles()
tl = np.zeros(len(me.loop_triangles) * 3, int); me.loop_triangles.foreach_get("loops", tl); tl = tl.reshape(-1, 3)
tm = np.zeros(len(me.loop_triangles), int); me.loop_triangles.foreach_get("material_index", tm)
npz = os.path.join(OUT, "bake.npz")
nbm = np.zeros_like(P); c2 = np.zeros(nv)
np.add.at(nbm, evj[:, 0], P[evj[:, 1]]); np.add.at(nbm, evj[:, 1], P[evj[:, 0]])
np.add.at(c2, evj[:, 0], 1); np.add.at(c2, evj[:, 1], 1)
elen = np.linalg.norm(P[evj[:, 0]] - P[evj[:, 1]], axis=1)
el2 = np.zeros(nv); np.add.at(el2, evj[:, 0], elen); np.add.at(el2, evj[:, 1], elen)
CAV = ((nbm / np.maximum(c2, 1)[:, None] - P) * N).sum(1) / np.maximum(el2 / np.maximum(c2, 1), 1e-5)
for _ in range(2):
    a2 = np.zeros(nv); np.add.at(a2, evj[:, 0], CAV[evj[:, 1]]); np.add.at(a2, evj[:, 1], CAV[evj[:, 0]])
    CAV = 0.5 * CAV + 0.5 * a2 / np.maximum(c2, 1)
CAV = np.clip(CAV / (np.percentile(np.abs(CAV), 96) + 1e-9), -1, 1)
ax = np.abs(P[:, 0])
ROT = np.where(P[:, 2] > 1.2, np.clip((ax - 0.66) / 0.22, 0, 1), np.clip((0.55 - P[:, 2]) / 0.5, 0, 1) * 0.75)
part = np.zeros(nv, np.int32)
if "part" in me.attributes:
    me.attributes["part"].data.foreach_get("value", part)
mq = sdf.cavity_q(P, (1.15, 1.0, 1.4))
DARK = np.where((mq < GRADE["mouthq"]) & (part != 2), np.clip((P[:, 1] + 0.086) / 0.022, 0, 1) * GRADE["mouthdark"], 0.0)
tq = sdf.ellipsoid(P, sdf.TEAR_C, sdf.TEAR_R, sdf.TEAR_ROT) if sdf.V["tear"] else np.full(nv, 1.0)
WOUND = np.where(part != 2, np.clip(1 - (tq - 0.0015) / 0.0045, 0, 1), 0.0)
DARK = np.maximum(DARK, np.where((tq < 0.0015) & (part != 2), 0.92, 0.0))
nose = np.linalg.norm((np.abs(P) * [1, 0, 0] + P * [0, 1, 1] - [0.0062, -0.087, 1.655]) / [0.0055, 0.012, 0.0085], axis=1)
DARK = np.maximum(DARK, np.where((nose < 1) & (sdf.V["nose"] == "rotted"), 0.75 * np.clip((1 - nose) * 3, 0, 1), 0.0))
_cr = np.clip(1 - np.abs(P[:, 0]) / 0.055, 0, 1) * np.clip((0.93 - P[:, 2]) / 0.04, 0, 1) * np.clip((P[:, 2] - 0.74) / 0.06, 0, 1)
DARK = np.maximum(DARK, np.where(part != 2, GRADE["crotch"] * _cr, 0.0))   # shadow between the legs, under the flaps
for (_c, _r), _k in zip(sdf.V["holes"], HOLEKIND):   # carved wounds: dark inside, raw meat round the lip
    _hq = np.linalg.norm(P - _c, axis=1) - _r
    _dk, _rw = {"cheek": (0.1, 0.014), "ribs": (0.3, 0.012)}.get(_k, (0.45, 0.006))
    DARK = np.maximum(DARK, np.where((_hq < 0.0015) & (part != 2), _dk, 0.0))
    WOUND = np.maximum(WOUND, np.where(part != 2, np.clip(1 - (_hq - 0.0015) / _rw, 0, 1), 0.0))
for _s, _t, _r0, _b in SPURS:            # the skin torn and inflamed round each spur
    WOUND = np.maximum(WOUND, np.where(part == 0, np.clip(1 - (np.linalg.norm(P - _s, axis=1) - _r0) / 0.012, 0, 1) * 0.85, 0.0))
if sdf.V["nose"] == "skull":   # nose_ap: the aperture goes black
    _nq = np.linalg.norm((P - np.array([0, -0.074, 1.659])) / np.array([0.0094, 0.0188, 0.0134]), axis=1)
    DARK = np.maximum(DARK, np.where((_nq < 1) & (part != 2), 0.8, 0.0))
    IVORY = np.where(part != 2, np.clip(1 - np.abs(_nq - 1.25) / 0.3, 0, 1) * 0.85, 0.0)
if "IVORY" not in globals():
    IVORY = np.zeros(nv)
BONE = np.zeros(nv)
for _c, _r in (sdf.CROWN if sdf.V["crown"] else []):
    BONE = np.maximum(BONE, np.clip(1 - (np.linalg.norm(P - _c, axis=1) - _r) / 0.003, 0, 1))
for (_c, _r), _k in zip(sdf.V["holes"], HOLEKIND):
    if _k == "ribs":
        BONE = np.maximum(BONE, np.clip(1 - (np.linalg.norm(P - _c, axis=1) - _r) / 0.004, 0, 1))
for _pts, _r0, _r1 in sdf.V["inner"]:   # the rib bars themselves are bone
    for _i in range(len(_pts) - 1):
        _a, _b = _pts[_i], _pts[_i + 1]
        _t = np.clip(((P - _a) @ (_b - _a)) / ((_b - _a) @ (_b - _a)), 0, 1)
        _dd = np.linalg.norm(P - (_a + _t[:, None] * (_b - _a)), axis=1)
        BONE = np.maximum(BONE, np.clip(1 - (_dd - _r0) / 0.003, 0, 1))
BONE = np.where(part != 2, BONE, 0.0)
MOUTH = np.where((sdf.cavity_q(P, (1.0, 1.0, 1.0)) < 1.0) & (P[:, 1] > -0.079) & (part != 2), 1.0, 0.0).astype(np.float32)
mT = sdf.unbend(P); mT[:, 0] = np.abs(mT[:, 0])
NAIL = np.zeros(nv); BED = np.zeros(nv)
for _nm in uvmap.FNAMES:
    _r = sdf.FINGER_R[_nm]
    _nd = sdf.ellipsoid(mT, sdf.nail_c(_nm), (0.0098, _r * 0.6, 0.0016))
    NAIL = np.maximum(NAIL, np.clip(1 - _nd / 0.0022, 0, 1) * (mT[:, 2] > sdf.nail_c(_nm)[2] - 0.0025))
    _fd, _ft, _ = uvmap.finger_param(mT, _nm)
    BED = np.maximum(BED, np.clip((_ft - 0.78) / 0.12, 0, 1) * (_fd < _r * 1.6))
mesh_hand = np.abs(P[:, 0]) > 0.45
NAIL *= mesh_hand; BED = BED * mesh_hand * (1 - NAIL)
log("nail verts", int((NAIL > 0.5).sum()), "nail-bed verts", int((BED > 0.5).sum()))
_hg = np.zeros(nv, np.float32)
if "toothh" in me.attributes:
    me.attributes["toothh"].data.foreach_get("value", _hg)
TOOTH = np.where(part == 2, 0.3 + 0.7 * _hg, 0.0).astype(np.float32)   # 0.3 at the root .. 1 at the tip
_ct = np.zeros(nv, np.float32)
if "clawt" in me.attributes:
    me.attributes["clawt"].data.foreach_get("value", _ct)
CLAW = np.where(part == 3, 0.05 + 0.95 * _ct, 0.0).astype(np.float32)
SPUR = np.where(part == 4, 0.05 + 0.95 * _ct, 0.0).astype(np.float32)
_de = np.minimum(np.linalg.norm(P - np.array(sdf.EYE), axis=1), np.linalg.norm(P - np.array(sdf.EYE) * [-1, 1, 1], axis=1))
EYEW = ((np.abs(_de - sdf.EYE_R) < 0.0018) & (P[:, 1] < sdf.EYE[1])).astype(np.float32)
np.savez_compressed(npz, atlas=AUV, sheet=SPX, tri=tl[tm == 0], P=P[lv], N=N[lv], W=Wv[lv], LOW=LOWV[lv],
                    CAV=CAV[lv], ROT=ROT[lv], DARK=DARK[lv], WOUND=WOUND[lv], BONE=BONE[lv], TOOTH=TOOTH[lv],
                    NAIL=NAIL[lv], BED=BED[lv], EYEW=EYEW[lv], CLAW=CLAW[lv], IVORY=IVORY[lv], MOUTH=MOUTH[lv], SPUR=SPUR[lv],
                    bumps=np.array([[*p, r, GRADE["bumpkind"]] for p, n, r in BUMPS], float).reshape(-1, 5),
                    grade2=np.array([GRADE["sat"], GRADE["green"], GRADE["eyehot"], GRADE["gullet"], GRADE["cmatch"],
                                     GRADE["ivory"], GRADE["rmin"], GRADE["mould"], GRADE["sores"], GRADE["bed"], GRADE["meat"]], float),
                    ropes=ROPES, eyes=np.array([*sdf.EYE, sdf.EYE_R], float), clone=np.array(uvmap.S["clone"], float),
                    feat=np.array([GRADE["trickle"], sdf.V["crown"], GRADE["glow"], GRADE["rough"], *GRADE["tint"]], float),
                    grade=np.array([GRADE["dark"], GRADE["rot"], GRADE["soot"], GRADE["vein"], GRADE["eyeglow"], *GRADE["eyecol"]], float))
BAKED = os.path.join(OUT, "tex")
r = subprocess.run(["python", "-I", os.path.join(HERE, "bake_tex.py"), npz, TEX, BAKED], capture_output=True, text=True)
log(r.stdout.strip(), r.stderr.strip()[-800:])

nt = SKIN.node_tree
swap = {"zombie_basecolor.png": "zombie_atlas_basecolor.png", "zombie_normal.png": "zombie_atlas_normal.png",
        "zombie_orm.png": "zombie_atlas_orm.png"}
for nd in list(nt.nodes):
    if nd.type == "TEX_IMAGE" and nd.image and nd.image.name in swap:
        cs = nd.image.colorspace_settings.name
        nd.image = bpy.data.images.load(os.path.join(BAKED, swap[nd.image.name]))
        nd.image.colorspace_settings.name = cs
        uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "Atlas"
        nt.links.new(uvn.outputs["UV"], nd.inputs["Vector"])
    if nd.type == "NORMAL_MAP":
        nd.uv_map = "Atlas"

if (GRADE["glow"] > 0 or GRADE["eyeglow"] > 0) and os.path.exists(os.path.join(BAKED, "zombie_atlas_emissive.png")):
    _bs = next(nd for nd in nt.nodes if nd.type == "BSDF_PRINCIPLED")
    _em = nt.nodes.new("ShaderNodeTexImage"); _em.image = bpy.data.images.load(os.path.join(BAKED, "zombie_atlas_emissive.png"))
    _uv = nt.nodes.new("ShaderNodeUVMap"); _uv.uv_map = "Atlas"
    nt.links.new(_uv.outputs["UV"], _em.inputs["Vector"])
    nt.links.new(_em.outputs["Color"], _bs.inputs["Emission Color"])
    _bs.inputs["Emission Strength"].default_value = float(max(GRADE["glow"], 1.0))
ARM.data.pose_position = "POSE"
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "zombie_ual.blend"))

# ---------------------------------------------------------------------------------- 7. export
me.uv_layers.remove(me.uv_layers["UVMap"])
me.uv_layers["Atlas"].name = "UVMap"
for nd in SKIN.node_tree.nodes:
    if nd.type in ("UVMAP", "NORMAL_MAP"):
        nd.uv_map = "UVMap"
me.uv_layers.active = me.uv_layers["UVMap"]
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
kw = dict(filepath=os.path.join(OUT, NAME + ".glb"), export_format="GLB", export_animations=False,
          export_tangents=True, export_skins=True, export_apply=False)
if "export_animation_mode" in props:
    kw["export_animation_mode"] = "ACTIONS"
if "export_image_format" in props:
    kw["export_image_format"] = "WEBP"
if "export_image_quality" in props:
    kw["export_image_quality"] = 90
if "export_vertex_color" in props:
    kw["export_vertex_color"] = "ACTIVE"
if "export_all_vertex_colors" in props:
    kw["export_all_vertex_colors"] = False
if "export_def_bones" in props:
    kw["export_def_bones"] = False
bpy.ops.export_scene.gltf(**kw)
if CLIPS:  # the skeleton alone with every clip (A-pose rest, re-keyed), shared by all the monsters
    for o in bpy.context.scene.objects:
        o.select_set(o == ARM)
    ck = dict(kw); ck.update(filepath=CLIPS, export_animations=True, use_selection=True)
    bpy.ops.export_scene.gltf(**ck)
    log("clips", CLIPS, os.path.getsize(CLIPS) // 1024, "KB")
log("exported", kw["filepath"], os.path.getsize(kw["filepath"]) // 1024, "KB")
