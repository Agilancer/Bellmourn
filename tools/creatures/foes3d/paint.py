"""Paint a foe's atlas.

Every texel knows where it sits on the rest-pose body (position, normal, baked AO), its part
(the source mesh and material, or a new piece from shapes.py) and its strongest bone; texels
of the packs' own parts also know where they fall on the pack's texture. Those are re-coloured:
the source colour picks a material class (cloth, leather, metal, skin...) by part and hue, and
its brightness picks a shade on that class's Bellmourn ramp. New pieces are painted from
scratch (plate with worn edges and rivets, mail rings, cloth folds, horn growth rings, fungus
gills). Lighting is a soft top light with the locked warm key from the upper left; every
texel is snapped to the palette with a light ordered dither, as the zombies are. A second map
holds what glows: eyes, helm slits, runes, cracks, fungus caps.
"""
import json
import math

import numpy as np

BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0

# ramps, dark to light: lists of (ramp, shade)
LOOKS = {
    # plate
    "black": [("stone", 0), ("stone", 1), ("iron", 1), ("stone", 2), ("stone", 3), ("iron", 2), ("slate", 4), ("iron", 3), ("iron", 4)],
    "ash": [("stone", 1), ("stone", 3), ("stone", 4), ("stone", 6), ("stone", 7), ("iron", 5), ("stone", 9), ("stone", 11), ("bone", 12)],
    "rust": [("earth", 0), ("stone", 1), ("earth", 1), ("earth", 2), ("iron", 2), ("earth", 4), ("wood", 5), ("earth", 6), ("fire", 5)],
    "dark": [("stone", 0), ("stone", 1), ("stone", 2), ("slate", 3), ("stone", 4), ("slate", 5), ("stone", 7)],
    # cloth
    "crimson": [("blood", 0), ("blood", 1), ("blood", 2), ("blood", 3), ("blood", 4), ("blood", 5), ("blood", 7), ("blood", 9)],
    "violet": [("arcane", 0), ("arcane", 1), ("arcane", 2), ("arcane", 3), ("arcane", 4), ("arcane", 6), ("arcane", 8)],
    "moss": [("moss", 0), ("moss", 1), ("moss", 2), ("moss", 3), ("moss", 4), ("moss", 6), ("moss", 8)],
    "arcane": [("arcane", 0), ("mana", 0), ("arcane", 1), ("arcane", 2), ("arcane", 3), ("arcane", 4), ("arcane", 6), ("arcane", 7)],
    "blood": [("blood", 0), ("blood", 1), ("blood", 2), ("blood", 3), ("blood", 4), ("blood", 6), ("blood", 8)],
    "venom": [("stone", 0), ("venom", 0), ("moss", 1), ("venom", 1), ("moss", 3), ("venom", 3), ("moss", 5), ("venom", 5)],
    # metal trims
    "gold": [("gold", 1), ("gold", 2), ("gold", 4), ("gold", 6), ("gold", 8), ("gold", 10), ("gold", 13)],
    "bone": [("bone", 1), ("bone", 3), ("bone", 5), ("bone", 7), ("bone", 9), ("bone", 11), ("bone", 13)],
    "bronze": [("earth", 1), ("wood", 3), ("wood", 5), ("gold", 5), ("wood", 8), ("gold", 8), ("gold", 10)],
    "iron": [("stone", 0), ("iron", 1), ("iron", 2), ("iron", 3), ("iron", 5), ("iron", 7), ("iron", 10)],
    # leather
    "dark_leather": [("leather", 0), ("leather", 1), ("leather", 2), ("leather", 3), ("leather", 5), ("leather", 7), ("leather", 9)],
    "black_leather": [("stone", 0), ("leather", 0), ("stone", 1), ("leather", 1), ("stone", 3), ("leather", 3), ("leather", 5)],
    "earth": [("earth", 0), ("earth", 1), ("earth", 3), ("earth", 5), ("earth", 7), ("earth", 9), ("earth", 11)],
    "wood": [("wood", 0), ("wood", 1), ("wood", 3), ("wood", 5), ("wood", 7), ("wood", 9), ("wood", 11)],
    # skin
    "corpse": [("slate", 1), ("slate", 2), ("stone", 4), ("slate", 5), ("stone", 7), ("bone", 7), ("bone", 9), ("bone", 11)],
    "pallid": [("flesh", 1), ("stone", 3), ("flesh", 4), ("stone", 7), ("flesh", 8), ("bone", 9), ("flesh", 12), ("bone", 12)],
    "rot": [("moss", 0), ("slate", 2), ("moss", 2), ("stone", 5), ("moss", 4), ("bone", 6), ("bone", 8), ("bone", 10)],
    "ash_skin": [("stone", 0), ("slate", 1), ("stone", 2), ("slate", 3), ("stone", 5), ("slate", 6), ("stone", 8), ("stone", 10)],
    "pale": [("arcane", 0), ("slate", 2), ("bone", 4), ("bone", 6), ("bone", 8), ("bone", 10), ("bone", 12), ("bone", 14)],
    "char": [("stone", 0), ("stone", 0), ("earth", 0), ("stone", 1), ("earth", 1), ("stone", 2), ("stone", 4), ("stone", 6)],
    "fungal": [("slate", 1), ("arcane", 1), ("stone", 4), ("bone", 5), ("stone", 8), ("bone", 8), ("bone", 10), ("bone", 12)],
    "bog": [("stone", 0), ("moss", 0), ("moss", 1), ("earth", 3), ("moss", 3), ("moss", 4), ("bone", 6), ("moss", 7)],
    "raw": [("blood", 0), ("blood", 1), ("flesh", 2), ("blood", 3), ("flesh", 5), ("blood", 5), ("flesh", 8), ("flesh", 11)],
    "black_horn": [("stone", 0), ("earth", 0), ("stone", 1), ("earth", 2), ("stone", 3), ("bone", 4), ("bone", 6)],
    "horn_bone": [("earth", 1), ("earth", 3), ("bone", 4), ("bone", 6), ("bone", 8), ("bone", 10), ("bone", 12)],
    "hair_ash": [("stone", 1), ("stone", 3), ("stone", 5), ("stone", 7), ("stone", 9), ("stone", 11)],
    "hair_black": [("stone", 0), ("slate", 0), ("stone", 1), ("slate", 2), ("stone", 3), ("slate", 4)],
    # glows (eyes, slits, runes, cracks, caps)
    "g_fire": [("fire", 6), ("fire", 9), ("fire", 11), ("fire", 13), ("gold", 14)],
    "g_mana": [("mana", 6), ("mana", 9), ("mana", 11), ("mana", 13), ("sky", 15)],
    "g_venom": [("venom", 6), ("venom", 9), ("venom", 11), ("venom", 13), ("venom", 15)],
    "g_arcane": [("arcane", 6), ("arcane", 9), ("arcane", 11), ("arcane", 13), ("arcane", 15)],
    "g_blood": [("blood", 6), ("blood", 9), ("blood", 11), ("blood", 13), ("fire", 14)],
}


def _hash(i, seed):
    h = np.sin(i[..., 0] * 127.1 + i[..., 1] * 311.7 + i[..., 2] * 74.7 + seed * 19.19) * 43758.5453
    return h - np.floor(h)


def noise(p, freq, seed=0):
    q = p * freq
    i = np.floor(q)
    f = q - i
    f = f * f * (3 - 2 * f)
    r = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1]) * (f[..., 2] if dz else 1 - f[..., 2])
                r = r + w * _hash(i + np.array([dx, dy, dz]), seed)
    return r


def fbm(p, freq, seed=0, octaves=3):
    s, a, t = 0, 1, 0
    for o in range(octaves):
        s = s + a * noise(p, freq * 2 ** o, seed + o * 7)
        t += a
        a *= 0.5
    return s / t


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def rgb_to_hsv(c):
    r, g, b = c[:, 0], c[:, 1], c[:, 2]
    mx, mn = c.max(1), c.min(1)
    d = mx - mn
    h = np.zeros(len(c))
    m = d > 1e-6
    rr = m & (mx == r)
    gg = m & (mx == g) & ~rr
    bb = m & ~rr & ~gg
    h[rr] = ((g - b)[rr] / d[rr]) % 6
    h[gg] = (b - r)[gg] / d[gg] + 2
    h[bb] = (r - g)[bb] / d[bb] + 4
    h *= 60
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


# material classes
CLASSES = ["plate", "plate_dark", "trim", "spike", "horn", "cloth", "mail", "leather", "metal", "skin", "robe", "robe_dark",
           "eye", "hair", "hat", "mask", "slit", "rune", "vein", "rag", "iron", "claw", "cap", "stem", "tusk", "club", "nail",
           "gill", "lip"]
C = {n: i for i, n in enumerate(CLASSES)}


def look_table(spec):
    lk = spec["look"]
    k = spec["kind"]
    t = {}
    if k == "knight":
        t["plate"] = LOOKS[lk["plate"]]
        t["plate_dark"] = LOOKS[lk["plate"]][:-2]
        t["metal"] = LOOKS[lk["plate"]]
        t["trim"] = LOOKS[lk["trim"]]
        t["spike"] = LOOKS[lk["plate"]]
        t["horn"] = LOOKS["black_horn"] if lk["plate"] != "ash" else LOOKS["horn_bone"]
        t["cloth"] = LOOKS[lk["cloth"]]
        t["mail"] = LOOKS[lk["mail"]] if lk["mail"] in LOOKS else LOOKS["iron"]
        t["leather"] = LOOKS["black_leather" if lk["leather"] == "black" else "dark_leather"]
        t["skin"] = LOOKS[lk["plate"]]
        t["slit"] = LOOKS["dark"]
    elif k == "sorcerer":
        t["robe"] = LOOKS[lk["robe"]]
        t["robe_dark"] = LOOKS[lk["robe"]][:-3]
        t["cloth"] = LOOKS[lk["robe"]]
        t["trim"] = LOOKS[lk["trim"]]
        t["metal"] = LOOKS[lk["trim"]]
        t["leather"] = LOOKS["black_leather" if lk["leather"] == "black" else "dark_leather"]
        t["skin"] = LOOKS[lk["skin"]]
        t["lip"] = LOOKS[lk["skin"]][:4]
        t["hair"] = LOOKS["hair_" + lk["hair"]]
        t["hat"] = LOOKS["hair_black"] if lk["robe"] != "venom" else LOOKS["rot"][:5]
        t["mask"] = LOOKS["bone"]
        t["horn"] = LOOKS["horn_bone"]
    else:
        skin = {"ash": "ash_skin"}.get(lk["skin"], lk["skin"])
        t["skin"] = LOOKS[skin]
        t["vein"] = LOOKS[skin][:3]
        t["horn"] = LOOKS["black_horn" if lk.get("horn") == "black" else "horn_bone"]
        t["claw"] = t["horn"]
        t["spike"] = t["horn"]
        t["rag"] = LOOKS["black_leather" if lk.get("rag") == "black" else "earth"]
        t["iron"] = LOOKS[lk.get("iron", "iron")]
        t["metal"] = t["iron"]
        t["tusk"] = LOOKS["horn_bone"]
        t["club"] = LOOKS["horn_bone" if lk.get("club") == "bone" else "wood"]
        t["nail"] = LOOKS["rust"]
        t["cap"] = LOOKS[{"mana": "fungal", "venom": "bog", "fire": "raw"}[lk.get("cap", "mana")]]
        t["stem"] = LOOKS["bone"]
        t["gill"] = LOOKS["dark"]
    t["eye"] = LOOKS["g_" + lk["glow"]]
    t["rune"] = LOOKS["g_" + lk["glow"]]
    return t


def classify(spec, part, mat, h, s, v, emit, pos, J):
    """Material class of every sampled source texel."""
    k = spec["kind"]
    n = len(h)
    out = np.full(n, C["leather"])
    green = (h > 55) & (h < 175) & (s > 0.18)
    metal = (s < 0.2) & (v > 0.42)
    skinmat = np.array([m.startswith(("MI_Regular", "MI_Superhero")) for m in mat])
    if k == "knight":
        arms = np.array(["Arms" in p for p in part])
        legs = np.array(["Legs" in p for p in part])
        out[green & (arms | legs)] = C["mail"]
        out[green & ~(arms | legs)] = C["cloth"]
        out[metal] = C["metal"]
        out[np.array(["Pauldron" in p for p in part])] = C["plate"]
        out[np.array(["Pauldron" in p for p in part]) & (v < 0.25)] = C["leather"]
        out[skinmat] = C["plate"]                         # the bare hands become gauntlets
    elif k == "sorcerer":
        body = np.array([p.endswith(("Body", "Arms")) for p in part])
        legs = np.array([p.endswith("Legs") for p in part])
        out[body & (v > 0.3)] = C["robe"]                 # the tunic and sleeves take the robe's colour
        out[body & (v <= 0.3)] = C["leather"]             # belts, laces, the corset
        out[legs] = C["robe_dark"]
        out[metal & ~skinmat & ~body & (v > 0.75) & (s < 0.1)] = C["trim"]
        out[np.array(["Hood" in p for p in part])] = C["robe"]
        out[skinmat] = C["skin"]
        lip = skinmat & (h < 18) & (s > 0.32)
        out[lip] = C["lip"]
        out[np.array([m.startswith("MI_Eyes") for m in mat])] = C["eye"]
        out[np.array([m.startswith("MI_Hair") for m in mat])] = C["hair"]
    elif k == "ghast":
        out[:] = C["skin"]
        out[(s < 0.3) & (v > 0.55)] = C["horn"]
        out[(h > 25) & (h < 75) & (s > 0.25) & (v < 0.5)] = C["rag"]
        out[np.array(["Shorts" in p for p in part])] = C["rag"]
        out[np.array([("Chains" in p) or ("Collar" in p) for p in part])] = C["iron"]
        out[np.array([("Chains" in p) or ("Collar" in p) for p in part]) & (s < 0.25) & (v > 0.6)] = C["iron"]
        out[emit > 0.4] = C["eye"]
    elif k == "grubber":
        out[:] = C["skin"]
        out[(h > 260) & (h < 345) & (s > 0.15)] = C["vein"]
        out[(s < 0.15) & (v > 0.75)] = C["tusk"]
        out[np.array(["Tusks" in p for p in part])] = C["tusk"]
        out[np.array(["Stick" in p for p in part])] = C["club"]
        out[emit > 0.4] = C["eye"]
    return out


PROC = {"helm": "plate", "helm_trim": "trim", "plate": "plate", "plate_dark": "plate_dark", "spike": "spike", "horn": "horn",
        "cape": "cloth", "tabard": "cloth", "robe": "robe", "hat": "hat", "hat_band": "trim", "mask": "mask", "tail": "skin",
        "claw": "claw", "cap": "cap", "stem": "stem", "eye": "eye", "nail": "nail"}


def paint(T, srcs, spec, variant, palette_path):
    pal = json.load(open(palette_path))
    ramps = pal["ramps"]
    cols = np.array([[int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)] for c in pal["colors"]])

    def ramp(lst):
        return np.array([cols[ramps.index(r) * 16 + s] for r, s in lst])

    looks = {C[n]: ramp(v) for n, v in look_table(spec).items()}
    M = T["mask"]
    TEX = M.shape[0]
    p, nrm, ao = T["pos"][M], T["nrm"][M], T["ao"][M]
    nrm = nrm / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-6)
    part_i, img, emi, uv0, bone = T["part"][M], T["img"][M], T["emit"][M], T["uv0"][M], T["bone"][M]
    names = T["parts"]
    pmesh = np.array([names[i].split("|")[0] for i in part_i])
    pmat = np.array([(names[i].split("|") + [""])[1] for i in part_i])
    J = {k: (np.array(a), np.array(b)) for k, (a, b) in T["joints"].items()}
    N = len(p)
    seed = sum(map(ord, variant))

    # sample the source textures
    src = np.zeros((N, 3))
    emit = np.zeros(N)
    has = img >= 0
    for i, a in enumerate(srcs):
        if a is None:
            continue
        sz = a.shape[0]
        sel = img == i
        if sel.any():
            u = np.mod(uv0[sel, 0], 1.0)
            v = np.mod(uv0[sel, 1], 1.0)
            src[sel] = a[np.clip((v * sz).astype(int), 0, sz - 1), np.clip((u * sz).astype(int), 0, sz - 1), :3]
        sel = emi == i
        if sel.any():
            u = np.mod(uv0[sel, 0], 1.0)
            v = np.mod(uv0[sel, 1], 1.0)
            emit[sel] = a[np.clip((v * sz).astype(int), 0, sz - 1), np.clip((u * sz).astype(int), 0, sz - 1), :3].max(1)
    src = np.clip(src, 0, 1) ** (1 / 2.2)                 # linear -> display
    hh, ss, vv = rgb_to_hsv(src)
    lum = src @ np.array([0.3, 0.59, 0.11])

    cls = np.full(N, C["leather"])
    cls[has] = classify(spec, pmesh[has], pmat[has], hh[has], ss[has], vv[has], emit[has], p[has], J)
    proc = ~has
    for nm, c in PROC.items():
        cls[proc & (pmesh == nm)] = C[c]

    # brightness: a source texel's own value within its class; new parts start mid-grey
    val = np.full(N, 0.5)
    for c in np.unique(cls[has]):
        sel = has & (cls == c)
        lo, hi = np.percentile(lum[sel], 3), np.percentile(lum[sel], 97)
        val[sel] = np.clip((lum[sel] - lo) / max(hi - lo, 0.05), 0, 1)
    off = np.zeros(N)
    alpha = np.ones(N, bool)
    glow = np.zeros(N)                                     # 0..1, what shines in the dark

    kind = spec["kind"]
    hc = J["head"][0] + np.array([0, -0.02, 0.1])
    n1 = fbm(p, 18, seed)
    n2 = noise(p, 70, seed + 3)

    # ---------------------------------------------------------- plate: worn edges, rivets, dents
    plate = np.isin(cls, [C["plate"], C["plate_dark"], C["spike"], C["metal"]])
    if plate.any():
        q = p[plate]
        # broad dents, a sheen where the plate turns to the key light, rust gathering low
        off[plate] += (fbm(q, 14, seed + 11) - 0.5) * 0.22
        Lk = np.array([-0.4, -0.6, 0.7]) / np.linalg.norm([-0.4, -0.6, 0.7])
        off[plate] += 0.32 * np.clip(nrm[plate] @ Lk, 0, 1) ** 6
        off[plate] -= 0.12 * (fbm(q, 40, seed + 13) > 0.68)

    # ---------------------------------------------------------- the helm: eye slit, breaths, glow
    if kind == "knight":
        hel = (pmesh == "helm")
        q = p - hc
        front = q[:, 1] < -0.08
        slit = hel & front & (np.abs(q[:, 2] - 0.035) < 0.013) & (np.abs(q[:, 0]) < 0.085)
        cls[slit] = C["slit"]
        val[slit] = 0.05
        eyes = slit & (np.abs(np.abs(q[:, 0]) - 0.035) < 0.014)
        glow[eyes] = 1.0
        cls[eyes] = C["eye"]
        holes = hel & front & (q[:, 2] < -0.01) & (q[:, 2] > -0.11) & (q[:, 0] < -0.02) & (q[:, 0] > -0.09)
        gx = np.mod(q[:, 0] * 90, 1)
        gz = np.mod(q[:, 2] * 90, 1)
        holes &= (np.abs(gx - 0.5) < 0.22) & (np.abs(gz - 0.5) < 0.22)
        cls[holes] = C["slit"]
        val[holes] = 0.05
        # rivets in rows along the helm's band and the cuirass edges
        riv = hel & (np.abs(q[:, 2] + 0.12) < 0.008) & (np.mod(np.arctan2(q[:, 1], q[:, 0]) * 7, 1) < 0.18)
        cls[riv] = C["trim"]

    # ---------------------------------------------------------- mail rings
    mail = cls == C["mail"]
    if mail.any():
        q = p[mail]
        b = bone[mail]
        s_ = np.zeros(len(q))
        a_ = np.zeros(len(q))
        for bi, bn in enumerate(T["bones"]):
            sel = b == bi
            if not sel.any() or bn not in J:
                continue
            A, B = J[bn]
            ax = (B - A) / max(np.linalg.norm(B - A), 1e-6)
            d = q[sel] - A
            s_[sel] = d @ ax
            ref = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.array([0, -1.0, 0])
            u = np.cross(ref, ax)
            u /= np.linalg.norm(u)
            w = np.cross(ax, u)
            a_[sel] = np.arctan2(d @ w, d @ u) * 0.06
        g = 0.02                                          # chunky rings that read at this texel size
        rows = np.floor(s_ / g)
        cu = np.mod(a_ / g + 0.5 * (rows % 2), 1)
        cv = np.mod(s_ / g, 1)
        r = np.hypot(cu - 0.5, (cv - 0.5) * 1.3)
        ring = np.exp(-((r - 0.3) / 0.12) ** 2)
        val[mail] = 0.25 + 0.45 * ring
        off[mail] += (n1[mail] - 0.5) * 0.12

    # ---------------------------------------------------------- cloth: folds, wear, torn hems
    cloth = np.isin(cls, [C["cloth"], C["robe"], C["robe_dark"]])
    if cloth.any():
        q = p[cloth]
        folds = np.sin(q[:, 0] * 55 + fbm(q, 6, seed) * 6) * 0.5 + 0.5
        off[cloth] += (folds - 0.5) * 0.16 + (n2[cloth] - 0.5) * 0.08
        # grime and mud rising from the hem
        off[cloth] -= 0.25 * smooth(0.45, 0.08, q[:, 2])
    capes = (pmesh == "cape") | (pmesh == "tabard")
    if capes.any():
        q = p[capes]
        zb = q[:, 2].min()
        torn = (q[:, 2] - zb) < 0.03 + 0.14 * fbm(q * np.array([1, 1, 0.2]), 14, seed + 5) ** 2 * 2.2
        holes = fbm(q, 22, seed + 9) > 0.72
        alpha[np.nonzero(capes)[0][torn | holes]] = False
        off[capes] -= 0.2 * smooth(zb + 0.25, zb, q[:, 2])
    robe = pmesh == "robe"
    if robe.any():
        q = p[robe]
        zb = q[:, 2].min()
        hem = (q[:, 2] - zb) < 0.045
        idx = np.nonzero(robe)[0]
        cls[idx[hem]] = C["trim"]
        # runes along the hem band
        ang = np.arctan2(q[:, 1], q[:, 0])
        cell = np.floor(ang * 14)
        g = np.mod(ang * 14, 1)
        hz = (q[:, 2] - zb - 0.07) / 0.05
        band = (np.abs(hz) < 1) & ~hem
        glyph = _hash(np.stack([cell, np.floor(hz * 2), cell * 0], 1), seed) > 0.45
        stroke = (np.abs(g - 0.5) < 0.12) | (np.abs(hz - (g * 2 - 1) * (1 if True else 0)) < 0.18)
        rune = band & glyph & stroke
        cls[idx[rune]] = C["rune"]
        glow[idx[rune]] = 0.7
        if spec["look"]["robe"] == "venom":
            torn = (q[:, 2] - zb) < 0.02 + 0.08 * fbm(q, 16, seed) ** 2 * 2
            alpha[idx[torn]] = False

    # ---------------------------------------------------------- skin: veins, cracks, spots
    skin = cls == C["skin"]
    if kind == "sorcerer" and skin.any():
        q = p[skin]
        vein = np.abs(fbm(q, 55, seed + 21) - 0.5) < 0.018
        off[skin] -= np.where(vein, 0.18, 0)
    if kind in ("ghast", "grubber") and (skin.any() or (cls == C["vein"]).any()):
        sk = skin | (cls == C["vein"])
        q = p[sk]
        crack = np.abs(fbm(q, 7, seed + 31) - 0.5) < 0.008 + 0.008 * noise(q, 40, seed)
        idx = np.nonzero(sk)[0]
        cls[idx[crack]] = C["vein"]
        if spec["look"]["vein"] in ("fire", "venom"):
            glow[idx[crack]] = 0.55
            cls[idx[crack]] = C["rune"]
        if kind == "grubber":
            spots = fbm(q, 25, seed + 41) > 0.7
            off[idx[spots]] -= 0.14
        off[sk] += (fbm(q, 30, seed + 51) - 0.5) * 0.16
    if kind == "ghast" and spec.get("blind"):
        eyes = cls == C["eye"]
        glow[eyes] = 0.25
    elif kind in ("ghast", "grubber"):
        glow[cls == C["eye"]] = 1.0
    if kind == "sorcerer":
        glow[cls == C["eye"]] = 1.0

    # ---------------------------------------------------------- horn rings, claws, tusks
    hornish = np.isin(cls, [C["horn"], C["claw"], C["tusk"], C["nail"]])
    if hornish.any():
        q = p[hornish]
        rings = np.sin(np.linalg.norm(q - hc, axis=1) * 160) * 0.5 + 0.5
        off[hornish] += (rings - 0.5) * 0.2

    # ---------------------------------------------------------- fungus caps: gills underneath, glowing spots
    cap = cls == C["cap"]
    if cap.any():
        q = p[cap]
        idx = np.nonzero(cap)[0]
        under = nrm[cap, 2] < -0.2
        cls[idx[under]] = C["gill"]
        dots = (fbm(q, 60, seed + 61) > 0.62) & ~under
        cls[idx[dots]] = C["rune"]
        glow[idx[dots]] = 0.9
        glow[idx[~under & ~dots]] = 0.18
    stem = cls == C["stem"]
    off[stem] += (n2[stem] - 0.5) * 0.2

    # ---------------------------------------------------------- the club: bone grain
    club = cls == C["club"]
    if club.any():
        off[club] += (np.sin(p[club, 1] * 140 + fbm(p[club], 20, seed) * 6) * 0.5) * 0.15

    # ---------------------------------------------------------- light and palette snap
    L = np.array([-0.4, -0.6, 0.7])
    L = L / np.linalg.norm(L)
    light = 0.58 + 0.16 * nrm[:, 2] + 0.16 * np.clip(nrm @ L, -1, 1)
    light *= 0.6 + 0.4 * np.clip(ao, 0, 1) ** 1.4
    v = np.where(has, val * 0.6 + light * 0.55 - 0.14, light + (val - 0.5) * 0.4)
    v = np.clip(v + off, 0, 1)
    v[cls == C["slit"]] = 0.02
    v[cls == C["eye"]] = 0.55 + 0.45 * glow[cls == C["eye"]]
    v[cls == C["rune"]] = 0.6 + 0.4 * glow[cls == C["rune"]]
    M2 = np.nonzero(M)
    iy, ix = M2
    thr = 0.38 + 0.24 * BAYER[iy % 4, ix % 4]
    rgb = np.zeros((N, 3))
    for c in np.unique(cls):
        sel = cls == c
        tab = looks.get(c)
        if tab is None:
            tab = looks.get(C["leather"], ramp(LOOKS["dark_leather"]))
        f = v[sel] * (len(tab) - 1)
        lo = np.floor(f).astype(int)
        idx = np.clip(lo + ((f - lo) > thr[sel]), 0, len(tab) - 1)
        rgb[sel] = tab[idx]
    out = np.zeros(M.shape + (4,), np.uint8)
    out[M, :3] = rgb
    out[M, 3] = np.where(alpha, 255, 0)
    gl = np.zeros(M.shape + (4,), np.uint8)
    gtab = ramp(LOOKS["g_" + spec["look"]["glow"]])
    gi = np.clip((glow * (len(gtab) - 1)).astype(int), 0, len(gtab) - 1)
    gcol = np.where(glow[:, None] > 0.05, gtab[gi] * np.clip(glow, 0, 1)[:, None], 0)
    gl[M, :3] = gcol.astype(np.uint8)
    gl[..., 3] = 255
    _bleed(out, M)
    _bleed(gl, M)
    return out, gl


def _bleed(out, M):
    """Spread colour into the gutters so nearest sampling never meets an empty texel."""
    filled = M.copy()
    for _ in range(6):
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            src = np.roll(np.roll(out, dy, 0), dx, 1)
            sf = np.roll(np.roll(filled, dy, 0), dx, 1)
            take = ~filled & sf
            out[take] = src[take]
            filled |= take
