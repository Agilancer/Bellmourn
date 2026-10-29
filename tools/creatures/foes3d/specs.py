"""What each foe is made of: source parts, reshaping, new pieces, sockets and its look.

Kinds (each with its own clips in clips.py and brain in src/fps/foes.js):
  knight    dark knights (the ranger outfits under black plate), sword and shield or a two-hander
  sorcerer  robed sorcerers and witches (the peasant outfits made into robes), staff in hand
  ghast     the Imp remade: a gaunt cave stalker, long arms and claws, horns, back spines, tail
  grubber   the Puglin remade: a swollen fungus-grown hunchback with tusks, extra eyes, a club

Variants share a kind and differ in body, pieces and palette (`look`, read by paint.py).
"""
import math

import numpy as np

import shapes as S
from shapes import Fit, Piece, bezier, lerp_w, side_leg

HUM_PARTS = {
    "male_ranger": ("outfits/Male_Ranger.gltf", None, "Hood"),
    "female_ranger": ("outfits/Female_Ranger.gltf", None, "Hood"),
    "male_peasant": ("outfits/Male_Peasant.gltf", None, None),
    "female_peasant": ("outfits/Female_Peasant.gltf", None, None),
    "male_head": ("base/Superhero_Male_FullBody.gltf", None, None),
    "female_head": ("base/Superhero_Female_FullBody.gltf", None, None),
    "male_hood": ("outfits/Male_Ranger_Head_Hood.gltf", None, None),
    "female_hood": ("outfits/Female_Ranger_Head_Hood.gltf", None, None),
    "beard": ("hair/Hair_Beard.gltf", None, None),
    "hair_long": ("hair/Hair_Long.gltf", None, None),
}

SPECS = {
    # ---------------------------------------------------------------- knights
    "knight_a": dict(kind="knight", name="knight_a", title="Dread Knight",
                     parts=[HUM_PARTS["male_ranger"]], hands={"L": "fist", "R": "fist"},
                     mirror="Pauldron", helm="horned", cape=True, tabard=False,
                     look=dict(plate="black", cloth="crimson", trim="gold", leather="black", mail="dark", glow="fire")),
    "knight_b": dict(kind="knight", name="knight_b", title="Ashen Templar",
                     parts=[HUM_PARTS["female_ranger"]], hands={"L": "fist", "R": "fist"},
                     mirror="Pauldron", helm="crested", cape=False, tabard=True,
                     look=dict(plate="ash", cloth="violet", trim="bone", leather="dark", mail="ash", glow="mana")),
    "knight_c": dict(kind="knight", name="knight_c", title="Gravewarden",
                     parts=[HUM_PARTS["male_ranger"]], hands={"L": "fist", "R": "fist"},
                     mirror="Pauldron", helm="crested", cape=True, tabard=True,
                     look=dict(plate="rust", cloth="moss", trim="bronze", leather="dark", mail="rust", glow="venom")),
    # ---------------------------------------------------------------- sorcerers
    "sorcerer_a": dict(kind="sorcerer", name="sorcerer_a", title="Hollow Magister",
                       parts=[HUM_PARTS["male_peasant"], HUM_PARTS["male_head"], HUM_PARTS["male_hood"], HUM_PARTS["beard"]],
                       cut=[("SuperHero_Male", 1.5)], hands={"L": "claw", "R": "fist"}, gaunt=True, beard=0.42,
                       robe=True, sleeves=True, hood="cowl",
                       look=dict(robe="arcane", trim="gold", skin="corpse", hair="ash", glow="arcane", leather="black")),
    "sorcerer_b": dict(kind="sorcerer", name="sorcerer_b", title="Blood Witch",
                       parts=[HUM_PARTS["female_peasant"], HUM_PARTS["female_head"], HUM_PARTS["hair_long"]],
                       cut=[("SuperHero_Female", 1.42)], hands={"L": "claw", "R": "fist"}, gaunt=True, beard=0,
                       robe=True, sleeves=True, hat="witch",
                       look=dict(robe="blood", trim="bone", skin="pallid", hair="black", glow="fire", leather="black")),
    "sorcerer_c": dict(kind="sorcerer", name="sorcerer_c", title="Rot Hierophant",
                       parts=[HUM_PARTS["male_peasant"], HUM_PARTS["male_head"], HUM_PARTS["male_hood"]],
                       cut=[("SuperHero_Male", 1.5)], hands={"L": "claw", "R": "fist"}, gaunt=True, beard=0,
                       robe=True, sleeves=True, hood="cowl", skull=True,
                       look=dict(robe="venom", trim="bronze", skin="rot", hair="ash", glow="venom", leather="dark")),
    # ---------------------------------------------------------------- the Imp remade
    "ghast_a": dict(kind="ghast", name="ghast_a", title="Ashen Ghast", parts=[("beasts/Imp.glb", None, "Mace")],
                    beast="imp", look=dict(skin="ash", vein="venom", horn="black", rag="black", iron="rust", glow="venom")),
    "ghast_b": dict(kind="ghast", name="ghast_b", title="Pale Ghast", parts=[("beasts/Imp.glb", None, "Mace")],
                    beast="imp", blind=True, look=dict(skin="pale", vein="arcane", horn="bone", rag="earth", iron="iron", glow="arcane")),
    "ghast_c": dict(kind="ghast", name="ghast_c", title="Cinder Ghast", parts=[("beasts/Imp.glb", None, "Mace")],
                    beast="imp", look=dict(skin="char", vein="fire", horn="black", rag="black", iron="iron", glow="fire")),
    # ---------------------------------------------------------------- the Puglin remade
    "grubber_a": dict(kind="grubber", name="grubber_a", title="Mire Grubber", parts=[("beasts/Puglin.glb", None, None)],
                      beast="pug", look=dict(skin="fungal", vein="arcane", cap="mana", tusk="bone", club="bone", glow="mana")),
    "grubber_b": dict(kind="grubber", name="grubber_b", title="Rot Grubber", parts=[("beasts/Puglin.glb", None, None)],
                      beast="pug", look=dict(skin="bog", vein="gold", cap="venom", tusk="bone", club="wood", glow="venom")),
    "grubber_c": dict(kind="grubber", name="grubber_c", title="Flayed Grubber", parts=[("beasts/Puglin.glb", None, None)],
                      beast="pug", look=dict(skin="raw", vein="blood", cap="fire", tusk="bone", club="bone", glow="fire")),
}


# ------------------------------------------------------------------ helpers

def vparts(body, names):
    """Per vertex: the name of the part its first face belongs to."""
    me = body.data
    pa = np.zeros(len(me.polygons), int)
    me.attributes["part"].data.foreach_get("value", pa)
    out = np.full(len(me.vertices), -1)
    for p in me.polygons:
        for v in p.vertices:
            if out[v] < 0:
                out[v] = pa[p.index]
    return np.array([names[i].split("|")[0] if i >= 0 else "" for i in out])


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def head_centre(J):
    h = J["head"][0]
    return h + np.array([0, -0.02, 0.1])


# ------------------------------------------------------------------ reshaping

def reshape(spec, P, J, names, body):
    P = P.copy()
    vp = vparts(body, names)
    if spec["kind"] == "sorcerer" and spec.get("gaunt"):
        P = gaunt_head(P, J, vp)
        if spec.get("beard"):
            P = long_beard(P, J, vp, spec["beard"])
        if spec.get("hood") == "cowl":
            P = cowl(P, J, vp)
        hair = np.array(["Hair" in n for n in vp])
        if hair.any() and spec.get("hat"):              # long hair hangs lank under the hat
            c = head_centre(J)
            q = P[hair]
            q[:, 2] -= 0.03 * smooth(c[2] + 0.02, c[2] + 0.12, q[:, 2])
            P[hair] = q
    if spec.get("beast") == "imp":
        P, J = imp_reshape(P, J, vp)
    if spec.get("beast") == "pug":
        P, J = pug_reshape(P, J, vp)
    return P, J


def gaunt_head(P, J, vp):
    """Hollow cheeks, sunken eyes, a longer face and a thin neck on the base head."""
    c = head_centre(J)
    head = np.array([n.startswith(("SuperHero", "Eyes", "Eyebrows")) for n in vp])
    q = P[head] - c
    # cheeks: below the eyes, at the sides of the front
    ch = np.exp(-(((np.abs(q[:, 0]) - 0.055) / 0.03) ** 2 + ((q[:, 2] + 0.03) / 0.035) ** 2 + ((q[:, 1] + 0.06) / 0.04) ** 2))
    q[:, 0] -= np.sign(q[:, 0]) * 0.012 * ch
    q[:, 1] += 0.006 * ch
    # eye sockets
    for s in (1, -1):
        e = np.exp(-(((q[:, 0] - s * 0.033) / 0.022) ** 2 + ((q[:, 2] - 0.005) / 0.018) ** 2 + ((q[:, 1] + 0.075) / 0.03) ** 2))
        q[:, 1] += 0.008 * e
    # a longer jaw and chin, a narrower skull
    jaw = smooth(-0.02, -0.08, q[:, 2])
    q[:, 2] -= 0.018 * jaw
    q[:, 0] *= 1 - 0.08 * jaw
    q[:, 0] *= 0.95
    # thin neck
    nk = smooth(c[2] - 0.08, c[2] - 0.14, P[head, 2] + 0 * q[:, 2])
    q[:, 0] *= 1 - 0.18 * nk
    q[:, 1] = q[:, 1] * (1 - 0.12 * nk)
    P[head] = q + c
    return P


def long_beard(P, J, vp, length):
    c = head_centre(J)
    b = np.array(["Beard" in n for n in vp])
    q = P[b]
    below = np.clip((c[2] - 0.04 - q[:, 2]) / 0.06, 0, 1)
    q[:, 2] -= below * length * np.clip((c[2] - 0.04 - q[:, 2]) / 0.05, 0, 1.6)
    q[:, 0] *= 1 - 0.35 * below                                # it narrows to a point
    q[:, 1] -= 0.015 * below
    P[b] = q
    return P


def cowl(P, J, vp):
    """The ranger hood, deeper and drawn up into a tall point at the back."""
    c = head_centre(J)
    h = np.array(["Hood" in n for n in vp])
    q = P[h] - c
    q *= np.array([1.1, 1.12, 1.08])
    up = smooth(0.0, 0.14, q[:, 2]) * smooth(-0.05, 0.08, q[:, 1])
    q[:, 2] += up * 0.16 * smooth(0.05, 0.16, q[:, 2])
    q[:, 1] += up * 0.09 * smooth(0.06, 0.18, q[:, 2])
    q[:, 1] -= 0.012 * smooth(-0.04, -0.1, q[:, 1])           # the brim comes forward, shading the face
    P[h] = q + c
    return P


def imp_reshape(P, J, vp):
    """Long arms and claws, a starved torso, longer pointed ears, a heavier jaw; 1.1x taller."""
    sh = J["upper_arm.L"][0][0]
    wr = J["hand.L"][0][0]
    k_arm, k_claw = 1.22, 1.55

    def arm_x(x):
        ax = np.abs(x)
        out = np.where(ax > sh, sh + (ax - sh) * k_arm, ax)
        wr2 = sh + (wr - sh) * k_arm
        out = np.where(ax > wr, wr2 + (ax - wr) * k_claw, out)
        return np.sign(x) * out

    arms = (np.abs(P[:, 0]) > sh) & (P[:, 2] > J["chest"][0][2] - 0.1)
    P[arms, 0] = arm_x(P[arms, 0])
    for n in list(J):
        if any(n.startswith(k) for k in ("upper_arm", "forearm", "hand")):
            a, b = J[n]
            J[n] = (np.array([arm_x(np.array([a[0]]))[0], a[1], a[2]]), np.array([arm_x(np.array([b[0]]))[0], b[1], b[2]]))
    # a starved torso
    tz0, tz1 = J["hips"][0][2], J["chest"][1][2]
    torso = (np.abs(P[:, 0]) < 0.22) & (P[:, 2] > tz0) & (P[:, 2] < tz1) & (vp != "Imp_Chains") & (vp != "Imp_SpikedCollar")
    k = 1 - 0.14 * smooth(tz0, tz0 + 0.12, P[torso, 2]) * smooth(tz1, tz1 - 0.1, P[torso, 2])
    P[torso, 0] *= k
    P[torso, 1] = 0.03 + (P[torso, 1] - 0.03) * k
    # head: ears out and up into long points, the jaw down and forward
    hc = J["head"][0] + np.array([0, -0.04, 0.06])
    hd = (P[:, 2] > J["neck"][0][2] + 0.04) & (np.abs(P[:, 0]) < 0.3) & (vp == "Imp_Body")
    q = P[hd] - hc
    ear = smooth(0.07, 0.13, np.abs(q[:, 0]))
    q[:, 0] += np.sign(q[:, 0]) * ear * (np.abs(q[:, 0]) - 0.07) * 1.1
    q[:, 2] += ear * (np.abs(q[:, 0]) - 0.07) * 0.9
    q[:, 1] += ear * 0.03
    jaw = smooth(-0.02, -0.08, q[:, 2]) * smooth(0.0, -0.05, q[:, 1])
    q[:, 2] -= jaw * 0.035
    q[:, 1] -= jaw * 0.03
    P[hd] = q + hc
    # everything a tenth taller
    P *= 1.1
    J = {n: (a * 1.1, b * 1.1) for n, (a, b) in J.items()}
    return P, J


def pug_reshape(P, J, vp):
    """Ears shrunk to torn flaps, a hump on the back, a swollen belly, warts; 1.3x bigger."""
    hc = J["head"][0] + np.array([0, -0.12, 0.05])
    body = vp == "Puglin_Body"
    q = P[body] - hc
    ear = smooth(0.2, 0.32, np.abs(q[:, 0])) * (q[:, 2] > -0.12)
    f = 1 - 0.55 * ear
    q[:, 0] = np.sign(q[:, 0]) * (0.2 + (np.abs(q[:, 0]) - 0.2) * f) * ear + q[:, 0] * (1 - ear)
    q[:, 2] -= ear * 0.06
    P[body] = q + hc
    # hump and belly
    z0, z1 = J["spine"][0][2], J["neck"][0][2]
    back = body & (P[:, 1] > 0.0) & (np.abs(P[:, 0]) < 0.22)
    hump = smooth(z0 - 0.02, z0 + 0.12, P[back, 2]) * smooth(z1 + 0.06, z1 - 0.06, P[back, 2]) * (1 - np.abs(P[back, 0]) / 0.22)
    P[back, 1] += 0.07 * hump
    P[back, 2] += 0.02 * hump
    belly = body & (P[:, 1] < -0.02) & (np.abs(P[:, 0]) < 0.2) & (P[:, 2] > J["hips"][0][2] - 0.05) & (P[:, 2] < z1 - 0.02)
    sw = smooth(J["hips"][0][2] - 0.05, J["hips"][0][2] + 0.06, P[belly, 2]) * smooth(z1 - 0.02, z0, P[belly, 2])
    P[belly, 1] -= 0.045 * sw
    P[belly, 0] *= 1 + 0.12 * sw
    # tusks: twice as long, curling up
    tk = vp == "Puglin_Tusks"
    if tk.any():
        q = P[tk]
        for s in (1, -1):
            m = np.sign(q[:, 0]) == s
            base = q[m][np.argmax(q[m][:, 1])] if m.any() else None
            if base is None:
                continue
            d = q[m] - base
            d *= 2.3
            d[:, 2] += 0.6 * np.clip(-d[:, 1], 0, None)
            q[m] = base + d
        P[tk] = q
    # warts
    rng = np.random.default_rng(7)
    pts = P[body][rng.choice(body.sum(), 70, replace=False)]
    for c in pts:
        d = np.linalg.norm(P[body] - c, axis=1)
        bump = np.exp(-(d / 0.012) ** 2) * 0.008
        n = P[body] - (hc + np.array([0, 0.05, -0.15]))
        P[body] += S.norm(n) * bump[:, None]
    P *= 1.3
    J = {n: (a * 1.3, b * 1.3) for n, (a, b) in J.items()}
    return P, J


# ------------------------------------------------------------------ new pieces

def W_rigid(b):
    return {b: 1.0}


def pieces(spec, P, J, W, names, body, Q):
    out = []
    vp = vparts(body, names)
    kind = spec["kind"]
    if kind == "knight":
        out += knight_pieces(spec, P, J, vp)
    elif kind == "sorcerer":
        out += sorcerer_pieces(spec, P, J, vp)
    elif kind == "ghast":
        out += ghast_pieces(spec, P, J, vp)
    elif kind == "grubber":
        out += grubber_pieces(spec, P, J, vp)
    return out


def helm(spec, J):
    c = head_centre(J) + np.array([0, 0.005, -0.005])
    pc = Piece()
    if spec["helm"] == "horned":
        prof = [(0.1, -0.17), (0.118, -0.14), (0.128, -0.08), (0.131, 0.0), (0.129, 0.06), (0.118, 0.11), (0.092, 0.145),
                (0.05, 0.165), (0.0, 0.172)]
    else:                                          # a sallet drawn back into a tail, with a crest
        prof = [(0.104, -0.16), (0.12, -0.12), (0.126, -0.06), (0.127, 0.02), (0.12, 0.09), (0.098, 0.135), (0.06, 0.16),
                (0.0, 0.168)]
    v, f = S.lathe(prof, c, n=22, squash=(1.0, 1.1))
    pc.add(v, f, W_rigid("head"), "helm")
    # the brow and the nose ridge, standing proud of the face plate
    ridge = [c + np.array([0, -0.138, z]) for z in np.linspace(-0.12, 0.1, 6)]
    v, f = S.tube(ridge, [0.009] * 6, n=6, squash=0.6, cap_start=True)
    pc.add(v, f, W_rigid("head"), "helm_trim")
    v, f = S.tube([c + np.array([x, -0.132 + 0.06 * x * x / 0.01, 0.035]) for x in np.linspace(-0.11, 0.11, 9)],
                  [0.008] * 9, n=5, squash=0.7, cap_start=True)
    pc.add(v, f, W_rigid("head"), "helm_trim")
    if spec["helm"] == "horned":
        for s in (1, -1):
            path = bezier(c + [s * 0.11, 0.01, 0.06], c + [s * 0.23, 0.0, 0.06], c + [s * 0.3, -0.06, 0.17], c + [s * 0.26, -0.16, 0.26], 12)
            rad = 0.045 * (1 - np.linspace(0, 1, 12)) ** 0.8 + 0.003
            v, f = S.tube(path, rad, n=8, cap_start=True)
            pc.add(v, f, W_rigid("head"), "horn")
    else:
        for i, t in enumerate(np.linspace(-0.6, 1.0, 7)):        # a crest of blades over the crown
            a = t * 1.25
            base = c + np.array([0, -math.sin(a) * 0.12, 0.08 + math.cos(a) * 0.08])
            tip = base + np.array([0, -math.sin(a) * 0.09, 0.07 + math.cos(a) * 0.08])
            v, f = S.cone(base, tip, 0.022, n=4)
            v[:, 0] *= 0.4
            pc.add(v, f, W_rigid("head"), "spike")
    # the gorget: a collar of lames over the neck
    nb = J["neck"][0]
    prof = [(0.17, -0.12), (0.16, -0.07), (0.125, -0.02), (0.1, 0.03), (0.098, 0.07)]
    v, f = S.lathe(prof, nb + np.array([0, 0.01, 0]), n=20, squash=(1.12, 1.0))

    def wg(p):
        k = smooth(nb[2] - 0.08, nb[2] + 0.05, p[2])
        return lerp_w({"chest": 1.0}, {"neck": 1.0}, k)

    pc.add(v, f, wg, "plate")
    return pc


def cuirass(P, J, vp):
    pc = Piece()
    torso = (np.abs(P[:, 0]) < 0.2) & (P[:, 2] > J["spine"][0][2] - 0.05) & (P[:, 2] < J["neck"][0][2] + 0.03)
    torso &= np.array(["Arms" not in n and "Pauldron" not in n for n in vp])
    z0, z1 = J["spine"][0][2] + 0.03, J["neck"][0][2] - 0.04
    F = Fit(P, np.array([0, 0.0, 0]), (0, 0, 1), z0 - 0.02, z1 + 0.04, nt=20, na=28, mask=torso)
    ts = np.linspace(z0, z1, 12)

    def top(a):                     # low under the arms, high over the breast and back
        return z1 - 0.13 * abs(math.cos(a)) ** 2

    v, f = F.shell(ts, 28, lambda t, a: 0.018 + 0.012 * smooth(z0 + 0.1, z0, t), top=top)

    def wt(p):
        k = smooth(J["chest"][0][2] - 0.06, J["chest"][0][2] + 0.06, p[2])
        return lerp_w({"spine": 1.0}, {"chest": 1.0}, k)

    pc.add(v, f, wt, "plate")
    # a skirt of lames below it, over the hips
    hz = J["hips"][0][2]
    hips = (np.abs(P[:, 0]) < 0.24) & (P[:, 2] > hz - 0.14) & (P[:, 2] < z0 + 0.02)
    F2 = Fit(P, np.zeros(3), (0, 0, 1), hz - 0.16, z0 + 0.04, nt=10, na=28, mask=hips)
    v, f = F2.shell(np.linspace(hz - 0.12, z0 + 0.01, 5), 28, lambda t, a: 0.03 + 0.03 * smooth(z0, hz - 0.12, t))

    def wl(p):
        k = smooth(hz, hz - 0.12, p[2])
        return lerp_w({"hips": 1.0}, side_leg(p, "thigh", 0.05), 0.4 * k)

    pc.add(v, f, wl, "plate_dark")
    return pc


def pauldron_spikes(P, J, vp):
    pc = Piece()
    pa = np.array(["Pauldron" in n for n in vp])
    for s in (1, -1):
        m = pa & (np.sign(P[:, 0]) == s)
        if not m.any():
            continue
        q = P[m]
        top = q[q[:, 2] > q[:, 2].max() - 0.025]
        side = "L" if s > 0 else "R"
        for i, fx in enumerate((0.25, 0.5, 0.75)):
            x = np.quantile(top[:, 0], fx)
            near = top[np.argmin(np.abs(top[:, 0] - x))]
            base = near + np.array([0, 0, -0.005])
            tip = base + S.norm(np.array([s * 0.35, 0.05, 1.0])) * (0.07 + 0.03 * (i == 1))
            v, f = S.cone(base, tip, 0.016, n=5)
            pc.add(v, f, W_rigid(f"upper_arm.{side}") if fx > 0.5 else lerp_w({f"shoulder.{side}": 1}, {f"upper_arm.{side}": 1}, 0.5), "spike")
    return pc


def greaves(P, J, vp):
    pc = Piece()
    for s in ("L", "R"):
        a, b = J[f"shin.{s}"]
        L = np.linalg.norm(b - a)
        ax = S.norm(b - a)
        d = P - a
        t = d @ ax
        r = np.linalg.norm(d - t[:, None] * ax, axis=1)
        m = (t > -0.02) & (t < L * 0.85) & (r < 0.12) & (np.sign(P[:, 0]) == (1 if s == "L" else -1))
        F = Fit(P, a, ax, 0, L * 0.85, nt=10, na=16, mask=m)
        v, f = F.shell(np.linspace(L * 0.08, L * 0.62, 6), 16, 0.012)
        pc.add(v, f, W_rigid(f"shin.{s}"), "plate")
        # the knee cop
        kv, kf = S.sphere(a + np.array([0, -0.065, 0.0]), 0.06, nu=10, nv=6, scale=(0.95, 0.55, 0.85))
        pc.add(kv, kf, lerp_w({f"thigh.{s}": 1}, {f"shin.{s}": 1}, 0.55), "plate")
        v, f = S.cone(a + np.array([0, -0.095, 0.0]), a + np.array([0, -0.16, 0.01]), 0.016, n=5)
        pc.add(v, f, W_rigid(f"shin.{s}"), "spike")
    return pc


def cape(P, J, tattered=True):
    """A cloak hung from the back of the shoulders to the calves."""
    pc = Piece()
    ztop = J["neck"][0][2] - 0.05
    zbot = 0.32
    rows, cols = 16, 13
    back = {}
    for z in np.linspace(zbot, ztop, rows):
        band = P[np.abs(P[:, 2] - z) < 0.04]
        band = band[np.abs(band[:, 0]) < 0.25]
        back[round(z, 4)] = band[:, 1].max() if len(band) else 0.12
    verts = []
    for i, z in enumerate(np.linspace(ztop, zbot, rows)):
        t = i / (rows - 1)
        hw = 0.2 + 0.17 * t
        yb = max(back[min(back, key=lambda k: abs(k - z))], 0.08)
        for j, x in enumerate(np.linspace(-hw, hw, cols)):
            u = x / hw
            y = yb + 0.03 + 0.1 * t ** 1.4 - 0.1 * (u ** 2) * (1 - 0.6 * t) + 0.018 * math.sin(j * 1.9 + t * 3) * t
            zz = z + (0.02 * (1 - abs(u)) if i == 0 else 0)
            verts.append((x, y, zz))
    faces = []
    for i in range(rows - 1):
        for j in range(cols - 1):
            a = i * cols + j
            faces.append([a, a + cols, a + cols + 1, a + 1])      # facing away from the body

    def wc(p):
        z = p[2]
        up = smooth(J["spine"][0][2], J["chest"][0][2] + 0.05, z)
        mid = smooth(J["hips"][0][2] - 0.1, J["spine"][0][2] + 0.05, z)
        w = lerp_w({"hips": 1.0}, {"spine": 1.0}, mid)
        return lerp_w(w, {"chest": 1.0}, up)

    pc.add(verts, faces, wc, "cape")
    return pc


def tabard(P, J):
    """Front and back panels hanging from the belt to the knees."""
    pc = Piece()
    hz = J["hips"][0][2]
    ztop, zbot = J["spine"][0][2] + 0.03, J["shin.L"][0][2] + 0.02
    for side in (-1, 1):                  # -1 front, +1 back
        rows, cols = 8, 5
        verts = []
        for i, z in enumerate(np.linspace(ztop, zbot, rows)):
            band = P[(np.abs(P[:, 2] - z) < 0.05) & (np.abs(P[:, 0]) < 0.12)]
            y = (band[:, 1].min() - 0.03) if side < 0 else (band[:, 1].max() + 0.03)
            if not len(band):
                y = -0.15 * -side
            t = i / (rows - 1)
            hw = 0.12 + 0.03 * t
            for x in np.linspace(-hw, hw, cols):
                verts.append((x, y + side * 0.03 * t, z))
        faces = []
        for i in range(rows - 1):
            for j in range(cols - 1):
                a = i * cols + j
                q = [a, a + 1, a + cols + 1, a + cols]
                faces.append(q if side < 0 else q[::-1])

        def wt(p, hz=hz):
            k = smooth(hz, hz - 0.2, p[2])
            legs = {"thigh.L": 0.5, "thigh.R": 0.5}
            return lerp_w({"hips": 1.0}, legs, 0.65 * k)

        pc.add(verts, faces, wt, "tabard")
    return pc


def knight_pieces(spec, P, J, vp):
    out = [(helm(spec, J), 1.0), (cuirass(P, J, vp), 1.0), (pauldron_spikes(P, J, vp), 1.0), (greaves(P, J, vp), 1.0)]
    if spec.get("cape"):
        out.append((cape(P, J), 1.0))
    if spec.get("tabard"):
        out.append((tabard(P, J), 1.0))
    return out


# ---------------------------------------------------------------- sorcerers

def robe(P, J, vp):
    pc = Piece()
    hz = J["hips"][0][2]
    zt = J["spine"][0][2] + 0.02
    legs = (np.abs(P[:, 0]) < 0.3) & (P[:, 2] < zt + 0.05) & np.array(["Arms" not in n for n in vp])
    F = Fit(P, np.zeros(3), (0, 0, 1), 0.0, zt + 0.06, nt=24, na=30, mask=legs)
    ts = np.linspace(zt, 0.07, 14)
    v, f = F.shell(ts[::-1], 30, lambda t, a: 0.015 + 0.13 * smooth(zt - 0.15, 0.07, t) ** 1.3 * (1 + 0.15 * math.sin(a * 5)))
    knee = J["shin.L"][0][2]

    def wr(p):
        z = p[2]
        k = smooth(hz, hz - 0.35, z)
        leg = lerp_w(side_leg(p, "thigh", 0.07), side_leg(p, "shin", 0.07), smooth(knee + 0.1, knee - 0.15, z) * 0.6)
        return lerp_w({"hips": 1.0}, leg, 0.85 * k)

    pc.add(v, f, wr, "robe")
    return pc


def bell_sleeves(P, J):
    pc = Piece()
    for s in ("L", "R"):
        a, b = J[f"forearm.{s}"]
        ax = S.norm(b - a)
        L = np.linalg.norm(b - a)
        d = P - a
        t = d @ ax
        r = np.linalg.norm(d - t[:, None] * ax, axis=1)
        m = (t > -0.05) & (t < L + 0.02) & (r < 0.09)
        F = Fit(P, a, ax, -0.06, L + 0.04, nt=10, na=16, mask=m)
        v, f = F.shell(np.linspace(-0.04, L * 0.92, 7), 16, lambda t, ang: 0.012 + 0.07 * smooth(L * 0.2, L * 0.92, t) ** 1.5
                       * (1 + 0.6 * max(0, -math.sin(ang))))
        pc.add(v, f, lambda p, s=s, a=a: lerp_w({f"upper_arm.{s}": 1}, {f"forearm.{s}": 1}, smooth(-0.04, 0.05, (p - a) @ ax)), "robe")
    return pc


def witch_hat(J):
    pc = Piece()
    c = head_centre(J) + np.array([0, 0.01, 0.075])
    brim = [(0.3, -0.005), (0.27, 0.0), (0.2, 0.012), (0.14, 0.02), (0.13, 0.03)]
    v, f = S.lathe(brim, c, n=24, squash=(1.0, 1.05))
    v[:, 2] += 0.02 * np.sin(np.arctan2(v[:, 1] - c[1], v[:, 0] - c[0]) * 2) * np.clip((np.linalg.norm(v[:, :2] - c[:2], axis=1) - 0.15) / 0.15, 0, 1)
    pc.add(v, f, W_rigid("head"), "hat")
    path = bezier(c + [0, 0, 0.02], c + [0, 0.0, 0.2], c + [0, 0.06, 0.32], c + [0, 0.2, 0.36], 12)
    rad = 0.13 * (1 - np.linspace(0, 1, 12)) ** 1.1 + 0.003
    v, f = S.tube(path, rad, n=14)
    pc.add(v, f, W_rigid("head"), "hat")
    v, f = S.tube([c + [0, 0, 0.03], c + [0, 0, 0.065]], [0.133, 0.128], n=14, cap_end=False)
    pc.add(v, f, W_rigid("head"), "hat_band")
    return pc


def skull_mask(J):
    """A bone half-mask over the face (the Rot Hierophant)."""
    pc = Piece()
    c = head_centre(J)
    v, f = S.lathe([(0.088, -0.07), (0.094, -0.03), (0.095, 0.01), (0.09, 0.05), (0.07, 0.08)], c + [0, -0.012, 0], n=18,
                   start=math.radians(200), sweep=math.radians(140), squash=(1.0, 1.08))
    pc.add(v, f, W_rigid("head"), "mask")
    for s in (1, -1):
        path = bezier(c + [s * 0.07, -0.05, 0.06], c + [s * 0.13, -0.02, 0.12], c + [s * 0.15, 0.06, 0.2], c + [s * 0.1, 0.12, 0.27], 10)
        v, f = S.tube(path, np.linspace(0.02, 0.002, 10), n=6, cap_start=True)
        pc.add(v, f, W_rigid("head"), "horn")
    return pc


def sorcerer_pieces(spec, P, J, vp):
    out = [(robe(P, J, vp), 1.0)]
    if spec.get("sleeves"):
        out.append((bell_sleeves(P, J), 1.0))
    if spec.get("hat") == "witch":
        out.append((witch_hat(J), 1.0))
    if spec.get("skull"):
        out.append((skull_mask(J), 1.0))
    return out


# ---------------------------------------------------------------- the ghast (Imp)

def ghast_pieces(spec, P, J, vp):
    pc = Piece()
    hc = J["head"][0] + np.array([0, -0.06, 0.08])
    # great swept horns
    for s in (1, -1):
        path = bezier(hc + [s * 0.05, -0.04, 0.06], hc + [s * 0.1, 0.0, 0.2], hc + [s * 0.16, 0.2, 0.3], hc + [s * 0.12, 0.42, 0.22], 14)
        v, f = S.tube(path, np.linspace(0.04, 0.002, 14) * (1 + 0.15 * np.sin(np.linspace(0, 9, 14))), n=8, cap_start=True)
        pc.add(v, f, W_rigid("head"), "horn")
        path = bezier(hc + [s * 0.07, -0.02, 0.0], hc + [s * 0.15, 0.02, 0.0], hc + [s * 0.2, 0.08, -0.06], hc + [s * 0.2, 0.12, -0.12], 8)
        v, f = S.tube(path, np.linspace(0.022, 0.002, 8), n=6, cap_start=True)
        pc.add(v, f, W_rigid("head"), "horn")
    # spines down the back
    z0, z1 = J["hips"][0][2] + 0.05, J["neck"][0][2]
    for i, z in enumerate(np.linspace(z1, z0, 9)):
        band = P[(np.abs(P[:, 2] - z) < 0.03) & (np.abs(P[:, 0]) < 0.06)]
        y = band[:, 1].max() if len(band) else 0.1
        base = np.array([0, y - 0.01, z])
        L = 0.06 + 0.07 * math.sin(math.pi * (i + 1) / 10)
        tip = base + S.norm(np.array([0, 1.0, 0.5])) * L
        v, f = S.cone(base, tip, 0.018 + 0.01 * math.sin(math.pi * (i + 1) / 10), n=5)
        b = "chest" if z > J["chest"][0][2] else "spine" if z > J["spine"][0][2] else "hips"
        pc.add(v, f, W_rigid(b), "horn")
    # a tail, curling down to the ground behind
    hb = J["hips"][0] + np.array([0, 0.09, -0.02])
    path = bezier(hb, hb + [0, 0.35, -0.15], hb + [0.2, 0.75, -0.75], hb + [0.45, 0.6, -hb[2] + 0.06], 18)
    v, f = S.tube(path, np.linspace(0.05, 0.008, 18), n=8)
    pc.add(v, f, W_rigid("hips"), "tail")
    tip = path[-1]
    v, f = S.cone(tip - (path[-1] - path[-2]) * 0.5, tip + S.norm(path[-1] - path[-2]) * 0.1, 0.03, n=4)
    pc.add(v, f, W_rigid("hips"), "horn")
    # claws on every finger and toe tip
    for s in ("L", "R"):
        a, b = J[f"hand.{s}"]
        sgn = 1 if s == "L" else -1
        hand = (np.sign(P[:, 0]) == sgn) & (np.abs(P[:, 0]) > abs(a[0]) + 0.03)
        if hand.any():
            q = P[hand]
            far = np.abs(q[:, 0]).max()
            tips = q[np.abs(q[:, 0]) > far - 0.035]
            for k in range(4):
                sel = tips[np.argsort(tips[:, 1])][int(k * (len(tips) - 1) / 3)]
                base = sel - np.array([sgn * 0.01, 0, 0])
                tipp = base + np.array([sgn * 0.08, -0.01, -0.03])
                v, f = S.cone(base, tipp, 0.01, n=4)
                pc.add(v, f, W_rigid(f"hand.{s}"), "claw")
    return [(pc, 1.0)]


# ---------------------------------------------------------------- the grubber (Puglin)

def grubber_pieces(spec, P, J, vp):
    pc = Piece()
    rng = np.random.default_rng({"grubber_a": 3, "grubber_b": 5, "grubber_c": 9}[spec["name"]])
    body = vp == "Puglin_Body"
    hc = J["head"][0] + np.array([0, -0.15, 0.08])
    # fungus caps sprouting from the hump and the crown
    back = body & (P[:, 1] > 0.04) & (P[:, 2] > J["spine"][0][2]) & (np.abs(P[:, 0]) < 0.2)
    crown = body & (P[:, 2] > hc[2] + 0.05) & (np.abs(P[:, 0]) < 0.15)
    spots = list(P[back][rng.choice(back.sum(), 7, replace=False)]) + list(P[crown][rng.choice(crown.sum(), 3, replace=False)])
    for i, p in enumerate(spots):
        out = S.norm(np.array([p[0] * 1.5, 0.6 if p[1] > 0 else 0.0, 1.0]))
        h = 0.04 + rng.random() * 0.06
        r = 0.035 + rng.random() * 0.045
        bone = "head" if p[2] > hc[2] else "chest" if p[2] > J["chest"][0][2] else "spine"
        stem_top = p + out * h
        v, f = S.tube([p - out * 0.01, p + out * h * 0.5, stem_top], [r * 0.3, r * 0.26, r * 0.22], n=6, cap_end=False, cap_start=True)
        pc.add(v, f, W_rigid(bone), "stem")
        prof = [(r * 0.3, 0.0), (r, 0.005), (r * 1.05, 0.015), (r * 0.85, r * 0.45), (r * 0.45, r * 0.7), (0.0, r * 0.78)]
        v, f = S.lathe(prof, stem_top, n=10, axis=out)
        pc.add(v, f, W_rigid(bone), "cap")
    # six eyes: two rows of small ones above the old pair
    for s in (1, -1):
        for k, (dx, dz) in enumerate(((0.05, 0.09), (0.1, 0.06))):
            c = hc + np.array([s * dx, -0.16 + 0.03 * k, dz])
            nearb = P[body][np.argmin(np.linalg.norm(P[body] - c, axis=1))]
            v, f = S.sphere(nearb + np.array([0, -0.006, 0]), 0.018 - 0.004 * k, nu=8, nv=6)
            pc.add(v, f, W_rigid("head"), "eye")
    # the club: nails driven through its far end
    st = vp == "Puglin_Stick"
    if st.any():
        q = P[st]
        far = q[np.argmin(q[:, 1])]
        near = q[np.argmax(q[:, 1])]
        ax = S.norm(far - near)
        for i in range(9):
            t = 0.62 + 0.36 * (i / 8)
            c = near + (far - near) * t
            u, w = S.frame(ax)
            ang = i * 2.4
            dirn = math.cos(ang) * u + math.sin(ang) * w
            v, f = S.cone(c + dirn * 0.02, c + dirn * 0.075, 0.006, n=4)
            pc.add(v, f, W_rigid("hand.R"), "nail")
    return [(pc, 1.0)]


# ------------------------------------------------------------------ sockets

def sockets(spec, J, Q):
    """Held-item frames: (name, bone, position, +y along the haft, +z toward the knuckles)."""
    out = []
    if spec["kind"] in ("knight", "sorcerer"):
        for s, sg in (("R", -1), ("L", 1)):
            src = "r" if s == "R" else "l"
            tips = [Q[f"{f}_02_{src}"][0] for f in ("index", "middle", "ring") if f"{f}_02_{src}" in Q]
            h = J[f"hand.{s}"][0]
            g = np.mean(tips, 0) if tips else h + np.array([sg * 0.08, 0, 0])
            g = (g + h) * 0.5 + np.array([sg * 0.02, -0.005, -0.012])
            out.append((f"grip{s}", f"hand.{s}", g, np.array([0, -1.0, 0]), np.array([sg * 1.0, 0, 0])))
        if spec["kind"] == "knight":
            a, b = J["forearm.L"]
            p = a + (b - a) * 0.55 + np.array([0, 0, 0.07])
            out.append(("shieldL", "forearm.L", p, np.array([0, -1.0, 0]), np.array([0, 0, 1.0])))
    return out
