"""First-person weapon rig templates.

Each animation is a list of 3D keyframes in camera space (metres; x right, y up, z forward,
eye at the origin). For every arm a keyframe gives the grip point G, the weapon direction D
(grip -> tip) and the hand axis A (wrist -> grip). The elbow is solved with two-bone IK from a
fixed shoulder, then everything is projected with a 90 degree horizontal FOV onto the 384x240
virtual screen. Because every weapon uses the same rig, every weapon moves the same way.

    python tools/templates/fp_rig.py r1h_swing          # one animation
    python tools/templates/fp_rig.py                    # all of them

Writes templates/fp_weapons/<anim>/: <anim>_template.png (the sheet for ChatGPT),
<anim>_frames.json (cell rects, tics, events, projected joints), <anim>_preview.gif and
<anim>_strip.png (for review).
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import palette  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "templates", "fp_weapons")

SCREEN_W, SCREEN_H = 384, 240
SHEET_W, SHEET_H = 1536, 1024
HEADER = 64
COLS = 4
FOCAL = SCREEN_W / 2  # 90 degree horizontal FOV
# Keys are authored at full size; the rig is then drawn smaller, shrunk toward the bottom
# centre of the screen, so the carried weapon sits fully in frame and the view stays open at
# higher resolutions. A frame may set its own `view` scale: swings grow toward full size as
# the arm comes up past the head, then settle back to REST_SCALE.
REST_SCALE = 0.58
VIEW_ANCHOR = np.array([SCREEN_W / 2, SCREEN_H])
VIEW_SCALE = REST_SCALE
FS = FOCAL * VIEW_SCALE  # focal length for sizes drawn on screen


def set_view(scale):
    global VIEW_SCALE, FS
    VIEW_SCALE, FS = scale, FOCAL * scale
NEAR = 0.06
SS = 3  # supersampling for the guide drawing

KEY = palette.KEY
# The first-person arm is drawn a little larger than life, as in Hexen: big gauntleted fists.
UPPER, FORE, HAND = 0.30, 0.30, 0.06
SHOULDER = {"R": np.array([0.20, -0.30, -0.04]), "L": np.array([-0.20, -0.30, -0.04])}
POLE = {"R": np.array([1.0, -0.6, -0.1]), "L": np.array([-1.0, -0.6, -0.1])}
BONE = {"R": (230, 40, 40), "L": (50, 110, 255)}
FIST = (0.055, 0.055, 0.035)  # half extents along hand axis A, handle D, back-of-hand K

# Weapon proxies: offsets along D from the grip (metres).
PROXY = {
    "sword1h": dict(pommel=-0.09, guard=0.065, tip=0.60, width=0.05, guard_half=0.085),
    "sword2h": dict(pommel=-0.28, guard=0.08, tip=1.00, width=0.065, guard_half=0.13),
    "spear":   dict(pommel=-0.22, guard=0.76, tip=1.06, width=0.075, guard_half=0.03,
                    shaft=0.017),
    "wand":    dict(pommel=-0.06, guard=0.04, tip=0.34, width=0.022, guard_half=0.0),
    # a long staff held a third of the way down: shaft below the hand, the head on top
    "staff":   dict(pommel=-0.60, guard=0.45, tip=0.62, width=0.065, guard_half=0.04,
                    shaft=0.016),
    "shield":  None,
}


def _font(size, bold=False):
    for name in (("consolab.ttf", "arialbd.ttf") if bold else ("consola.ttf", "arial.ttf")):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def norm(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def project(p):
    x, y, z = p
    p = np.array([SCREEN_W / 2 + FOCAL * x / z, SCREEN_H / 2 - FOCAL * y / z])
    return VIEW_ANCHOR + (p - VIEW_ANCHOR) * VIEW_SCALE


def clip(a, b):
    """Clip segment a-b to z >= NEAR. Returns None if fully behind."""
    if a[2] < NEAR and b[2] < NEAR:
        return None
    if a[2] < NEAR:
        a = a + (b - a) * ((NEAR - a[2]) / (b[2] - a[2]))
    elif b[2] < NEAR:
        b = b + (a - b) * ((NEAR - b[2]) / (a[2] - b[2]))
    return a, b


def solve_elbow(s, w, pole):
    d = w - s
    dist = min(np.linalg.norm(d), UPPER + FORE - 1e-4)
    dn = norm(d)
    a = (UPPER ** 2 - FORE ** 2 + dist ** 2) / (2 * dist)
    h = math.sqrt(max(UPPER ** 2 - a ** 2, 0))
    p = norm(pole - dn * np.dot(pole, dn))
    return s + dn * a + p * h


def from_screen(sx, sy, z):
    """Screen pixel + depth -> camera space point."""
    return np.array([(sx - SCREEN_W / 2) * z / FOCAL, -(sy - SCREEN_H / 2) * z / FOCAL, z])


def weapon_dir(ang, dz):
    """Weapon direction from its angle on screen (degrees, 0 = right, 90 = up) plus a lean
    away from the viewer."""
    r = math.radians(ang)
    return norm([math.cos(r), math.sin(r), dz])


def pose_arm(side, key):
    """Pose one arm. With `aim` (a point on the drawn screen, e.g. the crosshair) the weapon's
    on-screen angle is solved so it points straight at that point from the fist; `dz` still
    sets how far it leans into the scene."""
    if "aim" not in key:
        return _pose_arm(side, key)
    target = np.asarray(key["aim"], float)
    ang = key["ang"]
    for _ in range(8):
        arm = _pose_arm(side, dict(key, ang=ang))
        gp = project(arm["G"])
        tp = project(arm["G"] + arm["D"] * 0.3)
        want = math.atan2(-(target[1] - gp[1]), target[0] - gp[0])
        have = math.atan2(-(tp[1] - gp[1]), tp[0] - gp[0])
        err = math.degrees((want - have + math.pi) % (2 * math.pi) - math.pi)
        if abs(err) < 0.05:
            break
        ang += err
    return arm


def pose_frame(f):
    """Pose every arm in a frame. A `support` arm puts its fist on the other arm's weapon, that
    many metres further down the grip, so two-handed weapons stay locked in both hands."""
    arms = [pose_arm(side, f[side]) for side in ("R", "L") if side in f and "support" not in f[side]]
    for side in ("R", "L"):
        if side in f and "support" in f[side]:
            main = next(a for a in arms if a["weapon"])
            key = dict(f[side], G3=main["G"] - main["D"] * f[side]["support"], D3=main["D"],
                       ang=90)
            arms.append(dict(pose_arm(side, key), support=True))
    return arms


def shoulder(side, key):
    """The key's shoulder: the rig's, or turned with the torso by `twist` degrees (positive
    turns the chest to the left, bringing the right shoulder forward) about the spine."""
    s = SHOULDER[side] + np.array([0.0, key.get("shrug", 0.0), key.get("lean", 0.0)])   # (lean: forward)
    tw = key.get("twist")
    if not tw:
        return s
    r = math.radians(tw)  # (anims.mirror negates it for the left-handed copies)
    spine = np.array([0.0, s[1], -0.16])  # the spine, behind the eyes
    v = s - spine
    c, n = math.cos(r), math.sin(r)
    return spine + np.array([v[0] * c - v[2] * n, v[1], v[0] * n + v[2] * c])


def _pose_open_hand(side, key):
    """An empty hand posed directly: `fing` is the way the fingers point and `palm` the way
    the palm faces (camera space, given for the right hand and mirrored for the left like
    everything else). `curl` (0 open .. 1 fist) and `spread` shape the fingers; with `cast`
    the spell leaves from in front of the palm."""
    g = from_screen(*key["S"])
    want_g = g
    s = shoulder(side, key)
    pole = np.asarray(key.get("pole", POLE[side]), float)
    a = norm(key["fing"])
    k = norm(-np.asarray(key["palm"], float))  # back of the hand
    k = norm(k - a * np.dot(k, a))
    h = np.cross(a, k) * (1 if side == "R" else -1)  # the axis the fingers curl around
    w = g - a * HAND
    if np.linalg.norm(w - s) > UPPER + FORE - 1e-3:  # out of reach: pull the hand in
        w = s + norm(w - s) * (UPPER + FORE - 1e-3)
        g = w + a * HAND
    e = solve_elbow(s, w, pole)
    return dict(side=side, S=s, E=e, W=w, G=g, D=h, A=a, K=k, H=h, pole=pole,
                reach_miss=float(np.linalg.norm(g - want_g)), weapon=None, shield=None,
                face=None, curl=key.get("curl", 0.5), spread=key.get("spread", 1.0),
                shape=key.get("shape"), cast=bool(key.get("cast")))


def cast_point(arm):
    """Where a spell leaves an empty hand: just in front of the palm."""
    return arm["G"] - arm["K"] * 0.06


def _pose_arm(side, key):
    """Grip and weapon come from the key; the elbow comes from IK and the hand keeps in line
    with the forearm (plus an optional small `bend`), so the wrist never breaks."""
    if "fing" in key:
        return _pose_open_hand(side, key)
    g = np.array(key["G3"], float) if "G3" in key else from_screen(*key["S"])
    want_g = g
    s = shoulder(side, key)
    pole = np.asarray(key.get("pole", POLE[side]), float)
    bend = np.asarray(key.get("bend", (0, 0, 0)), float)
    wrist = key.get("wrist")  # rigid wrist: the item sits at this fixed angle in the fist
    if "D3" in key:  # a direction fixed in 3D (a support hand on another hand's weapon)
        d = norm(key["D3"])
    else:  # with a rigid wrist, only a starting guess
        d = weapon_dir(key["ang"], key.get("dz", 0.3))
    # a steady support fist squares itself to the forearm inside the solve, so it stays
    # exactly on its spot on the other hand's weapon
    held = key.get("steady") and "G3" in key
    a = norm(g - s)
    for _ in range(8 if wrist is None and not held else 12):  # (8: approved rigs unchanged)
        if not held:
            a = norm(a - d * np.dot(a, d))  # the fist closes at right angles to the handle
        w = g - a * HAND
        if np.linalg.norm(w - s) > UPPER + FORE - 1e-3:  # out of reach: slide the grip in
            w = s + norm(w - s) * (UPPER + FORE - 1e-3)
            g = w + a * HAND
        e = solve_elbow(s, w, pole)
        a = norm(norm(w - e) + bend)
        if wrist is not None:
            # measured from the forearm, upward within the plane of the arm, so the hand
            # can never roll or twist however the arm moves
            f = norm(w - e)
            # (the arm's plane holds shoulder, wrist and the elbow's pole, so it stays defined
            # even when the arm is fully straight)
            up = np.cross(norm(np.cross(w - s, pole)), f)  # mirrors correctly for the left arm
            r = math.radians(wrist)
            d = norm(f * math.cos(r) + up * math.sin(r))
    if not held:
        a = norm(a - d * np.dot(a, d))
    h = d  # the axis the fist closes around
    if held:
        h = np.cross(norm(np.cross(w - s, pole)), a)
    elif key.get("steady"):
        # pointer grip: the fist stays square to the arm, never rolling, whatever the item
        # points at; the item leaves the front of the fist along D
        a = norm(w - e)
        h = np.cross(norm(np.cross(w - s, pole)), a)
        g = w + a * HAND
    w = g - a * HAND
    k = norm(np.cross(a, h)) * (-1 if side == "R" else 1)  # back of the hand
    return dict(side=side, S=s, E=e, W=w, G=g, D=d, A=a, K=k, H=h, pole=pole,
                reach_miss=float(np.linalg.norm(g - want_g)),
                weapon=key.get("weapon"), shield=key.get("shield"), flat=key.get("flat"),
                face=norm(key["face"]) if "face" in key else None)


# ----------------------------------------------------------------- drawing


class Canvas:
    """A supersampled RGBA layer in screen coordinates."""

    def __init__(self):
        self.img = Image.new("RGBA", (SCREEN_W * SS, SCREEN_H * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def pt(self, p):
        return (float(p[0] * SS), float(p[1] * SS))

    def capsule3d(self, a, b, ra, rb, fill):
        seg = clip(a, b)
        if seg is None:
            return
        a, b = seg
        pa, pb = project(a), project(b)
        wa, wb = FS * ra / a[2], FS * rb / b[2]
        v = pb - pa
        n = np.array([-v[1], v[0]])
        n = n / (np.linalg.norm(n) or 1)
        poly = [pa + n * wa, pb + n * wb, pb - n * wb, pa - n * wa]
        self.d.polygon([self.pt(q) for q in poly], fill=fill)
        for p, r in ((pa, wa), (pb, wb)):
            self.d.ellipse([*self.pt(p - r), *self.pt(p + r)], fill=fill)

    def line3d(self, a, b, color, width):
        seg = clip(a, b)
        if seg:
            self.d.line([self.pt(project(seg[0])), self.pt(project(seg[1]))],
                        fill=color, width=int(width * SS))

    def dot(self, p2, r, fill, outline=None):
        self.d.ellipse([*self.pt(p2 - r), *self.pt(p2 + r)], fill=fill, outline=outline,
                       width=SS)

    def text(self, p2, s, fill, font):
        self.d.text(self.pt(p2), s, fill=fill, font=font)

    def done(self):
        return self.img.resize((SCREEN_W, SCREEN_H), Image.LANCZOS)


MANNEQUIN = (190, 190, 198, 255)
LIGHT = norm([-0.5, 0.8, -0.4])  # from above-left, in front of the viewer


def shade(n):
    lit = 0.45 + 0.55 * max(0.0, float(np.dot(n, LIGHT)))
    return tuple(int(c * lit) for c in MANNEQUIN[:3]) + (255,)


def box_faces(cv, centre, axes, half, fingers=()):
    """One depth-sortable part per visible face of an oriented box. Faces listed in
    `fingers` as (axis, sign) get three creases across axis 1, splitting four fingers."""
    out = []
    for i in range(3):
        for sgn in (1, -1):
            n = axes[i] * sgn
            fc = centre + n * half[i]
            if np.dot(n, fc) >= 0:  # facing away from the eye
                continue
            j, k = [x for x in range(3) if x != i]
            u, v = axes[j] * half[j], axes[k] * half[k]
            quad = [fc + u + v, fc + u - v, fc - u - v, fc - u + v]
            if min(q[2] for q in quad) < NEAR:
                continue
            creases = []
            if (i, sgn) in fingers:
                across = axes[2 if i == 0 else 0] * half[2 if i == 0 else 0]
                creases = [(fc + axes[1] * half[1] * t - across, fc + axes[1] * half[1] * t
                            + across) for t in (-0.5, 0, 0.5)]

            def draw(quad=quad, n=n, creases=creases):
                cv.d.polygon([cv.pt(project(q)) for q in quad], fill=shade(n),
                             outline=(70, 70, 80, 255), width=SS)
                for a, b in creases:
                    cv.d.line([cv.pt(project(a)), cv.pt(project(b))], fill=(80, 80, 92, 255),
                              width=SS)
            out.append((fc, draw))
    return out


_ARM_MODELS = {}
# guide tones: palm and arm mid grey, fingers alternating light/dark so each one reads, thumb
# darker still
_GUIDE_TONE = dict(palm=(184, 184, 192), thumb=(150, 150, 162), index=(214, 214, 222),
                   middle=(176, 176, 186), ring=(214, 214, 222), pinky=(176, 176, 186))


def draw_mannequin(cv, arm):
    """The guide arm: the real 3D arm model (tools/models/arm.py) with modelled fingers and
    thumb, posed by this rig and painter-sorted with the weapon proxy."""
    models_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              "models")
    if models_dir not in sys.path:
        sys.path.insert(0, models_dir)
    import arm as arm_model  # noqa: E402  (lazy: arm.py imports this module)
    import raster  # noqa: E402

    side = arm["side"]
    if side not in _ARM_MODELS:
        model = arm_model.bare_arm(side)
        for part in model.parts:
            part.color = _GUIDE_TONE.get(part.name.split()[0], MANNEQUIN[:3])
        _ARM_MODELS[side] = model
    mats = arm_model.world_mats(arm, side)
    tris, cols = arm_model.posed_triangles(_ARM_MODELS[side], mats, side)
    parts = []
    for depth, pts, col in raster.faces(tris, cols, project, NEAR, LIGHT):
        parts.append((np.array([0.0, 0.0, depth]),
                      lambda pts=pts, col=col: cv.d.polygon([cv.pt(p) for p in pts],
                                                            fill=col)))
    return parts


def draw_mannequin_box(cv, arm):
    """The original block-fist guide, kept for reference."""
    s, e, w, g, a, k = (arm[j] for j in ("S", "E", "W", "G", "A", "K"))
    d = arm.get("H", arm["D"])  # the fist closes around this axis
    fore = norm(w - e)
    parts = [
        ((s + e) / 2, lambda: cv.capsule3d(s, e, 0.06, 0.05, MANNEQUIN)),
        ((e + w) / 2, lambda: cv.capsule3d(e, w - fore * 0.01, 0.05, 0.042, MANNEQUIN)),
        # gauntlet cuff: a flared ring just behind the wrist
        (w - fore * 0.04, lambda: cv.capsule3d(w - fore * 0.075, w - fore * 0.01, 0.05,
                                               0.047, shade(norm([0, 0.3, -1])))),
    ]
    # the fist: a block whose knuckle end sits just past the handle, and which bulks out
    # toward the back of the hand, so the handle runs through the curled fingers
    centre = g - a * (FIST[0] * 0.55) + k * (FIST[2] * 0.35)
    parts += box_faces(cv, centre, (a, d, k), FIST, fingers={(0, 1), (2, -1)})
    # thumb wrapped over the top of the grip
    tb = g + d * (FIST[1] * 0.95) - a * 0.03 + k * 0.012
    parts.append((tb + k * 0.02, lambda: cv.capsule3d(tb, g + d * FIST[1] * 0.9 - k * 0.012,
                                                       0.016, 0.015, shade(norm(d - k)))))
    return parts


def weapon_parts(cv, arm, kind):
    p = PROXY[kind]
    g, d, a = arm["G"], arm["D"], arm["A"]
    pommel, guard, tip = g + d * p["pommel"], g + d * p["guard"], g + d * p["tip"]
    out = []

    def across(at, half):
        """Screen-space offset perpendicular to the weapon, sized for depth: the proxy always
        shows the flat of the blade, the way the sprite games drew it."""
        v = project(tip) - project(guard)
        n = np.array([-v[1], v[0]]) / (np.linalg.norm(v) or 1)
        return n * FS * half / at[2]

    def blade():
        seg = clip(guard, tip)
        if seg is None:
            return
        g0, t0 = seg
        pg, pt = project(g0), project(t0)
        w = across(g0, p["width"] / 2)
        tw = across(t0, p["width"] / 2) * (0.15 if t0 is tip else 0.6)
        pts = [cv.pt(q) for q in (pg + w, pt + tw, pt - tw, pg - w)]
        cv.d.polygon(pts, fill=(255, 225, 60, 255), outline=(200, 150, 0, 255), width=SS)

    def handle():
        if p.get("shaft"):  # a polearm's shaft has real thickness, shrinking with distance
            cv.capsule3d(pommel, guard, p["shaft"], p["shaft"], (150, 90, 40, 255))
        else:
            cv.line3d(pommel, guard, (150, 90, 40, 255), 3)
        if p["guard_half"] and guard[2] > NEAR and tip[2] > NEAR:
            pg, o = project(guard), across(guard, p["guard_half"])
            cv.d.line([cv.pt(pg - o), cv.pt(pg + o)], fill=(255, 200, 0, 255), width=3 * SS)

    # the handle sits inside the fist, so it always goes down first
    out.append((g + np.array([0, 0, 0.5]), handle))
    out.append((guard + d * 0.05, blade))
    return out


SHIELD_R = 0.26
SHIELD_FILL, SHIELD_LINE = (150, 190, 255, 255), (40, 70, 140, 255)


KITE_HW, KITE_TOP, KITE_SHOULDER, KITE_POINT = 0.24, 0.42, 0.20, -0.48  # metres


def _kite_outline(n=12):
    """Kite shield in its own plane (x across, y up, origin at the fist): rounded top, sides
    tapering to a point at the bottom."""
    pts = [(KITE_HW * math.cos(t), KITE_SHOULDER + (KITE_TOP - KITE_SHOULDER) * math.sin(t))
           for t in np.linspace(0, math.pi, n)]
    for side in (-1, 1):  # left side down to the point, then right side back up
        p0, c, p1 = (side * KITE_HW, KITE_SHOULDER), (side * KITE_HW, -0.18), (0, KITE_POINT)
        seg = [((1 - s) ** 2 * p0[0] + 2 * (1 - s) * s * c[0] + s * s * p1[0],
                (1 - s) ** 2 * p0[1] + 2 * (1 - s) * s * c[1] + s * s * p1[1])
               for s in np.linspace(0, 1, n)[1:]]
        pts += seg if side < 0 else seg[::-1][1:]
    return pts


KITE = _kite_outline()


def shield_ring(arm, inset=1.0, n=40):
    """The shield outline in 3D. `face` is the way the shield's front points, so the viewer
    sees its inner side.
    round: a centre-grip shield; the fist holds a bar (along D) just behind the boss.
    kite:  a tall shield strapped along the forearm; the fist holds the upper strap, so most
           of the shield hangs below the hand."""
    f = arm["face"]
    if arm["shield"] == "kite":
        v = norm(np.array([0.0, 1.0, 0.0]) - f * f[1])  # the shield stands upright
        u = np.cross(v, f)
        centre = arm["G"] + f * 0.05
        return centre, [centre + (u * x + v * y) * inset for x, y in KITE]
    centre = arm["G"] + f * 0.05
    u = norm(arm["D"] - f * np.dot(arm["D"], f))
    v = np.cross(f, u)
    return centre, [centre + (u * math.cos(t) + v * math.sin(t)) * SHIELD_R * inset
                    for t in np.linspace(0, 2 * math.pi, n, endpoint=False)]


def shield_parts(cv, arm):
    centre, ring = shield_ring(arm)
    _, rim = shield_ring(arm, 0.86)
    g, d = arm["G"], arm["D"]

    def draw():
        if min(q[2] for q in ring) < NEAR:
            return
        cv.d.polygon([cv.pt(project(q)) for q in ring], fill=SHIELD_FILL, outline=SHIELD_LINE,
                     width=2 * SS)
        cv.d.polygon([cv.pt(project(q)) for q in rim], outline=SHIELD_LINE, width=SS)
        # grip bar behind the boss, which the fist closes around
        cv.line3d(g - d * 0.07, g + d * 0.07, (150, 90, 40, 255), 4)
    return [(centre + arm["face"] * 0.05, draw)]


def draw_ghosts(prev, arms):
    """Smear guide: faint copies of the blade swept from the previous frame to this one."""
    cv = Canvas()
    for pa, arm in zip(prev, arms):
        kind = arm["weapon"]
        if not kind or pa["weapon"] != kind:
            continue
        p = PROXY[kind]
        for i in range(1, 6):
            t = i / 6
            g = pa["G"] + (arm["G"] - pa["G"]) * t
            d = norm(pa["D"] + (arm["D"] - pa["D"]) * t)
            seg = clip(g + d * p["guard"], g + d * p["tip"])
            if seg:
                a, b = project(seg[0]), project(seg[1])
                cv.d.line([cv.pt(a), cv.pt(b)], fill=(255, 245, 200, int(40 + 90 * t)),
                          width=int(FS * p["width"] / seg[0][2] * SS * 0.6))
    return cv.done()


def draw_frame(arms, tip_path, tip_now, label, tags, ghosts=None):
    """Render one 384x240 guide frame onto magenta."""
    cv = Canvas()
    # depth-sorted solid shapes (mannequin + weapon proxy)
    parts = []
    for arm in arms:
        parts += draw_mannequin(cv, arm)
        if arm["weapon"]:
            parts += weapon_parts(cv, arm, arm["weapon"])
        if arm["shield"]:
            parts += shield_parts(cv, arm)
    for _, fn in sorted(parts, key=lambda t: -t[0][2]):
        fn()
    # drawn opaque, then faded as one layer so overlapping limbs don't double up
    body_img = cv.img
    alpha = body_img.getchannel("A").point(lambda v: v * 245 // 255)
    body_img.putalpha(alpha)

    over = Canvas()
    small = _font(9 * SS)
    # tip path
    for i in range(len(tip_path) - 1):
        a, b = tip_path[i], tip_path[i + 1]
        if a is None or b is None:
            continue
        steps = int(np.linalg.norm(b - a) / 6) + 1
        for j in range(steps):
            q = a + (b - a) * (j / steps)
            over.dot(q, 0.7, (255, 255, 255, 170))
    for arm in arms:
        col = BONE[arm["side"]] + (255,)
        for a, b in ((arm["S"], arm["E"]), (arm["E"], arm["W"]), (arm["W"], arm["G"])):
            over.line3d(a, b, col, 2)
        for j in ("E", "W"):
            if arm[j][2] > NEAR:
                over.dot(project(arm[j]), 3, (255, 255, 255, 255), col)
        if arm["G"][2] > NEAR:
            gp = project(arm["G"])
            over.dot(gp, 4, (40, 220, 80, 255), (0, 60, 0, 255))
            over.text(gp + np.array([5, -12]), "G", (40, 255, 90, 255), small)
            # knuckle arrow
            kk = arm["G"] + arm["K"] * 0.07
            if kk[2] > NEAR:
                kp = project(kk)
                over.d.line([over.pt(gp), over.pt(kp)], fill=(0, 230, 255, 255), width=2 * SS)
                v = kp - gp
                n = np.array([-v[1], v[0]]) / (np.linalg.norm(v) or 1)
                head = [kp + v / (np.linalg.norm(v) or 1) * 4, kp + n * 3, kp - n * 3]
                over.d.polygon([over.pt(h) for h in head], fill=(0, 230, 255, 255))
    for tp in tip_now:
        if tp is not None and any(t == "FIRE" for t, _ in tags):
            # the projectile spawns here: a burst around the tip
            for r, col in ((14, (255, 120, 0, 255)), (9, (255, 200, 40, 255))):
                pts = [tp + np.array([math.cos(t), math.sin(t)]) * (r if j % 2 else r * 0.45)
                       for j, t in enumerate(np.linspace(0, 2 * math.pi, 16, endpoint=False))]
                over.d.polygon([over.pt(p) for p in pts], fill=col)
        if tp is not None:
            over.dot(tp, 3.5, (255, 230, 0, 255), (120, 80, 0, 255))
            over.text(tp + np.array([5, -12]), "T", (255, 230, 0, 255), small)
    # crosshair
    c = np.array([SCREEN_W / 2, SCREEN_H / 2])
    for dv in ((6, 0), (0, 6)):
        dv = np.array(dv)
        over.d.line([over.pt(c - dv), over.pt(c + dv)], fill=(120, 120, 120, 255), width=SS)

    frame = Image.new("RGBA", (SCREEN_W, SCREEN_H), KEY + (255,))
    if ghosts is not None:
        frame.alpha_composite(ghosts)
    frame.alpha_composite(body_img.resize((SCREEN_W, SCREEN_H), Image.LANCZOS))
    frame.alpha_composite(over.done())
    # label strip
    d = ImageDraw.Draw(frame)
    f = _font(11, True)
    d.rectangle([0, 0, SCREEN_W, 15], fill=(16, 16, 20, 255))
    d.text((4, 1), label, fill=(240, 240, 240), font=f)
    x = SCREEN_W - 4
    for tag, col in reversed(tags):
        w = d.textlength(tag, font=f) + 8
        x -= w
        d.rectangle([x, 1, x + w - 2, 14], fill=col)
        d.text((x + 4, 1), tag, fill=(255, 255, 255), font=f)
        x -= 3
    return frame.convert("RGB")


# ----------------------------------------------------------------- sheets


def build(anim):
    frames = anim["frames"]
    posed = [pose_frame(f) for f in frames]

    def tips(arms):
        out = []
        for arm in arms:
            if arm["weapon"]:
                t = arm["G"] + arm["D"] * PROXY[arm["weapon"]]["tip"]
                out.append(project(t) if t[2] > NEAR else None)
            elif arm.get("cast"):  # an empty casting hand: the spell leaves from the palm
                t = cast_point(arm)
                out.append(project(t) if t[2] > NEAR else None)
        return out

    tip_now = []
    for f, arms in zip(frames, posed):
        set_view(f.get("view", REST_SCALE))
        tip_now.append(tips(arms))
    paths = list(zip(*tip_now)) if tip_now and tip_now[0] else []
    path = [p for track in paths for p in list(track) + [None]]  # each arm's path, separated

    rendered, meta = [], []
    for i, (f, arms) in enumerate(zip(frames, posed)):
        set_view(f.get("view", REST_SCALE))
        tags = []
        if f.get("hit"):
            tags.append(("HIT", (200, 20, 20)))
        if f.get("fire"):
            tags.append(("FIRE", (200, 90, 0)))
        if f.get("smear"):
            tags.append(("SMEAR", (90, 40, 150)))
        tags.append((f"{f['tics']}t", (60, 60, 70)))
        label = f"{anim['id'].upper()}-{i:02d} {f['name']}"
        ghosts = draw_ghosts(posed[i - 1], arms) if f.get("smear") and i else None
        rendered.append(draw_frame(arms, path, tip_now[i], label, tags, ghosts))
        col, row = i % COLS, i // COLS
        meta.append(dict(
            index=i, name=f["name"], tics=f["tics"], view_scale=VIEW_SCALE,
            events=[k for k in ("hit", "fire", "smear") if f.get(k)],
            cell=[col * SCREEN_W, HEADER + row * SCREEN_H, SCREEN_W, SCREEN_H],
            joints={a["side"]: {j: [round(v, 1) for v in project(a[j])]
                                for j in ("E", "W", "G") if a[j][2] > NEAR}
                    for a in arms},
            tips=[None if t is None else [round(v, 1) for v in t] for t in tip_now[i]],
            # the full 3D pose (camera space, metres), so the rig can be reused elsewhere:
            # shoulder/elbow/wrist/grip, weapon direction, hand axis, back-of-hand, shield face
            pose3d={a["side"]: {j: [round(float(v), 4) for v in a[j]]
                                for j in ("S", "E", "W", "G", "D", "A", "K", "face")
                                if a.get(j) is not None}
                    for a in arms},
        ))

    sheet = Image.new("RGB", (SHEET_W, SHEET_H), (24, 22, 26))
    d = ImageDraw.Draw(sheet)
    d.text((16, 10), f"BELLMOURN  ·  FIRST-PERSON WEAPON RIG  ·  {anim['title']}",
           fill=(240, 220, 170), font=_font(24, True))
    d.text((16, 40), f"id {anim['id']}   ·   {len(frames)} frames   ·   cell 384×240 = one "
                     f"full game screen   ·   background #FF00FF   ·   "
                     f"follow STYLE_GUIDE.md", fill=(190, 190, 190), font=_font(14))
    for i, img in enumerate(rendered):
        x, y, *_ = meta[i]["cell"]
        sheet.paste(img, (x, y))
    rows = math.ceil(len(frames) / COLS)
    for i in range(len(frames), rows * COLS):  # unused cells in the last row
        x, y = (i % COLS) * SCREEN_W, HEADER + (i // COLS) * SCREEN_H
        d.rectangle([x, y, x + SCREEN_W, y + SCREEN_H], fill=(40, 38, 44))
        d.text((x + 140, y + 110), "UNUSED", fill=(90, 90, 96), font=_font(18, True))
    for c in range(COLS + 1):
        d.line([(c * SCREEN_W, HEADER), (c * SCREEN_W, HEADER + rows * SCREEN_H)],
               fill=(0, 0, 0), width=4)
    for r in range(rows + 1):
        d.line([(0, HEADER + r * SCREEN_H), (SHEET_W, HEADER + r * SCREEN_H)],
               fill=(0, 0, 0), width=4)
    if SHEET_H - (HEADER + rows * SCREEN_H) > 200:  # a full 4x4 sheet has no room for it
        draw_legend(sheet, HEADER + rows * SCREEN_H + 4, anim)

    folder = os.path.join(OUT, anim["id"])
    os.makedirs(folder, exist_ok=True)
    sheet.save(os.path.join(folder, f"{anim['id']}_template.png"))
    with open(os.path.join(folder, f"{anim['id']}_frames.json"), "w") as f:
        json.dump(dict(id=anim["id"], title=anim["title"], screen=[SCREEN_W, SCREEN_H],
                       tic_rate=35, key="#FF00FF", notes=anim["notes"], frames=meta), f,
                  indent=1)
    # review outputs: a strip at 2x and an animated gif at 2x using real tic timing
    big = [im.resize((SCREEN_W * 2, SCREEN_H * 2), Image.NEAREST) for im in rendered]
    strip = Image.new("RGB", (SCREEN_W * 2 * COLS, SCREEN_H * 2 * rows), (0, 0, 0))
    for i, im in enumerate(big):
        strip.paste(im, ((i % COLS) * SCREEN_W * 2, (i // COLS) * SCREEN_H * 2))
    strip.save(os.path.join(folder, f"{anim['id']}_strip.png"))
    slow = anim.get("preview_slowdown", 3)
    big[0].save(os.path.join(folder, f"{anim['id']}_preview.gif"), save_all=True,
                append_images=big[1:], loop=0,
                duration=[max(20, round(f["tics"] * 1000 / 35 * slow)) for f in frames])
    return folder


def draw_legend(sheet, top, anim):
    d = ImageDraw.Draw(sheet)
    f, fb = _font(15), _font(16, True)
    x0 = 20
    d.text((x0, top + 10), "RIG LEGEND  (guide only: none of it may appear in the art)",
           fill=(240, 220, 170), font=fb)
    rows = [
        ((205, 205, 210), "grey mannequin = forearm + gauntleted fist volume"),
        (BONE["R"], "red bones = right arm (shoulder > elbow > wrist > grip)"),
        (BONE["L"], "blue bones = left arm"),
        ((40, 220, 80), "G = centre of the fist on the handle"),
        ((0, 230, 255), "cyan arrow = back of the hand / knuckles face this way"),
        ((255, 220, 40), "yellow blade = weapon proxy direction + length; bar = guard"),
        ((255, 230, 0), "T + dotted path = weapon tip now / over the whole animation"),
        ((120, 120, 120), "grey cross = screen centre (aim point)"),
    ]
    y = top + 40
    for col, s in rows:
        d.rectangle([x0, y + 3, x0 + 14, y + 17], fill=col)
        d.text((x0 + 22, y), s, fill=(210, 210, 210), font=f)
        y += 24

    x1 = 640
    d.text((x1, top + 10), "TASK", fill=(240, 220, 170), font=fb)
    y = top + 40
    for line in anim["notes"] + [
        "Paint the locked Bellmourn gauntlet arm (STYLE_GUIDE §3) + the weapon you were given.",
        "Hit the rig: grip on G, knuckles toward the cyan arrow, weapon along the yellow proxy.",
        "Then replace every guide mark and label inside the cells with flat #FF00FF.",
        "Keep sheet size and black cell borders. Use only bellmourn_palette colours.",
        "Hard edges against the magenta. No outlines, bloom, text or signature.",
    ]:
        d.text((x1, y), "• " + line, fill=(210, 210, 210), font=f)
        y += 22

    pal = palette.swatch(cell=9)
    sheet.paste(pal, (SHEET_W - pal.width - 20, SHEET_H - pal.height - 20))
    d.text((SHEET_W - pal.width - 20, SHEET_H - pal.height - 42), "LOCKED PALETTE",
           fill=(240, 220, 170), font=fb)


if __name__ == "__main__":
    import anims  # noqa: E402

    palette.write(os.path.join(ROOT, "templates", "style"))
    # 3D-only animations have no sprite sheet unless asked for by name
    names = sys.argv[1:] or [k for k, a in anims.ANIMS.items() if not a.get("model_only")]
    for n in names:
        print("wrote", build(anims.ANIMS[n]))
