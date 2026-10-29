"""Paint the 3D zombie's texture from where each texel sits on the A-pose body.

Every texel knows its A-pose position and normal, its head coordinates (a unit direction on
the skull), its baked ambient occlusion, its part (body, head, teeth, eye, hair) and its
strongest bone. Regions of the warrior's clothing (collar, shoulder caps, belt, tunic skirt,
boot tops, bracers) are re-dressed per variant; skin gets ribs, wounds, drips and rot. Light
is a soft top light with the locked warm key from the viewer's upper left, and every texel is
snapped to the Bellmourn palette ramps with a light ordered dither, like the clay zombie.

Variants (the same body):
  a  grave-fresh: pale bone flesh, bare ribbed chest, ragged brown shoulder cloth and
     trousers, rope belt (the painted bundle and the clay zombie);
  b  shrouded: grey-green rotting flesh wound in torn burial linen, stringy hair, moss;
  c  fallen soldier: livid flesh in the warrior's rotted wine tunic torn open over the ribs,
     rusted gorget and shoulder plates, leather belt and pteruges, sandal straps.
"""
import json

import numpy as np

(SKIN, RIB, GRIME, CLOTH, TROUSER, ROPE, BLOOD, GORE, ROT, TEETH, EYE, MOUTH, NAIL, HAIR,
 LINEN, TUNIC, LEATHER, RUST, BRASS, SOCKET) = range(20)

BASE = {
    RIB: [("earth", 3), ("earth", 7), ("bone", 7), ("bone", 9), ("bone", 11), ("bone", 13)],
    GRIME: [("earth", 1), ("earth", 3), ("earth", 5), ("earth", 7), ("bone", 5), ("bone", 7)],
    CLOTH: [("earth", 2), ("earth", 4), ("earth", 6), ("earth", 8), ("earth", 10), ("earth", 12)],
    TROUSER: [("earth", 1), ("earth", 3), ("earth", 5), ("earth", 7), ("earth", 9), ("earth", 11)],
    ROPE: [("earth", 1), ("wood", 5), ("wood", 7), ("wood", 9), ("earth", 11)],
    BLOOD: [("blood", 1), ("blood", 2), ("blood", 3), ("blood", 5)],
    GORE: [("blood", 0), ("blood", 1), ("blood", 3), ("blood", 5), ("blood", 7)],
    ROT: [("moss", 0), ("moss", 1), ("moss", 2), ("moss", 4), ("moss", 6)],
    TEETH: [("earth", 3), ("bone", 5), ("bone", 8), ("bone", 10), ("bone", 12)],
    EYE: [("blood", 4), ("blood", 7), ("blood", 9), ("fire", 10)],
    MOUTH: [("blood", 0), ("blood", 1), ("blood", 1), ("blood", 3)],
    SOCKET: [("earth", 0), ("earth", 1), ("earth", 2), ("earth", 4)],
    NAIL: [("earth", 2), ("earth", 4), ("bone", 5), ("bone", 7)],
    HAIR: [("stone", 2), ("stone", 4), ("stone", 6), ("stone", 8)],
    LINEN: [("earth", 4), ("earth", 8), ("bone", 7), ("bone", 9), ("bone", 11), ("bone", 12)],
    TUNIC: [("blood", 0), ("blood", 1), ("blood", 2), ("blood", 3), ("blood", 4), ("earth", 6)],
    LEATHER: [("leather", 1), ("leather", 3), ("leather", 5), ("leather", 7), ("leather", 9)],
    RUST: [("iron", 1), ("earth", 3), ("fire", 3), ("earth", 6), ("iron", 6), ("iron", 9)],
    BRASS: [("gold", 2), ("gold", 4), ("earth", 7), ("gold", 7), ("gold", 9)],
}
SKINS = {
    "a": [("earth", 2), ("bone", 3), ("bone", 5), ("bone", 7), ("bone", 8), ("bone", 9),
          ("bone", 11), ("bone", 13)],
    "b": [("slate", 1), ("slate", 3), ("moss", 3), ("stone", 6), ("stone", 8), ("bone", 7),
          ("bone", 9), ("bone", 11)],
    "c": [("slate", 1), ("slate", 3), ("slate", 5), ("stone", 7), ("stone", 9), ("bone", 9),
          ("bone", 11), ("bone", 12)],
}
EYES = {"a": [("blood", 2), ("blood", 5), ("fire", 7), ("gold", 10)], "b": [("bone", 5), ("bone", 9), ("venom", 9), ("bone", 13)],
        "c": [("slate", 4), ("slate", 8), ("sky", 9), ("sky", 12)]}
CENTRE = {SKIN: 0.08, TROUSER: -0.05, CLOTH: 0.0, RIB: 0.08, GRIME: -0.05, LINEN: -0.06,
          TUNIC: -0.02, MOUTH: -0.2, SOCKET: -0.15}

BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


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
                w = (f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1]) * \
                    (f[..., 2] if dz else 1 - f[..., 2])
                r = r + w * _hash(i + np.array([dx, dy, dz]), seed)
    return r


def fbm(p, freq, seed=0, octaves=3):
    s, a, t = 0, 1, 0
    for o in range(octaves):
        s = s + a * noise(p, freq * 2 ** o, seed + o * 7)
        t += a
        a *= 0.5
    return s / t


def seg_t(p, a, b):
    a, b = np.array(a, float), np.array(b, float)
    d = b - a
    t = np.clip(((p - a) @ d) / (d @ d), 0, 1)
    return t, np.linalg.norm(p - (a + t[..., None] * d), axis=-1)


def paint(T, variant, seed, palette_path):
    pal = json.load(open(palette_path))
    ramps = pal["ramps"]
    cols = np.array([[int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)] for c in pal["colors"]])

    def ramp(lst):
        return np.array([cols[ramps.index(r) * 16 + s] for r, s in lst])

    table = {k: ramp(v) for k, v in BASE.items()}
    table[SKIN] = ramp(SKINS[variant])
    table[EYE] = ramp(EYES[variant])

    M = T["mask"]
    p, n, hu, ao = T["pos"][M], T["nrm"][M], T["hu"][M], T["ao"][M]
    n = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-6)
    part, bone = T["part"][M], T["bone"][M]
    names = np.array(T["bones"])[bone]
    J = T["joints"]
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    ax = np.abs(x)
    front = -y
    rng = np.random.default_rng(seed)
    N = len(p)

    mat = np.full(N, SKIN)
    off = np.zeros(N)
    alpha = np.ones(N, bool)

    def isb(*prefixes):
        return np.isin(np.char.partition(names.astype(str), ".")[:, 0], prefixes)

    body = part == 0
    arm = body & (ax > 0.165) & (z > 0.85)
    leg = body & isb("thigh", "shin", "foot") & (z < 0.62)
    torso = body & ~arm & ~leg

    # nearest arm bone (by geometry, not weights) and the parameter along it
    t_arm = np.zeros(N)
    seg_of = np.full(N, "", dtype=object)
    best = np.full(N, 9.0)
    for sd in ("L", "R"):
        for b in ("upper_arm", "forearm", "hand"):
            t, d = seg_t(p, J[f"{b}.{sd}"][0], J[f"{b}.{sd}"][1])
            m = arm & (d < best)
            best[m], t_arm[m], seg_of[m] = d[m], t[m], b
    upper = arm & (seg_of == "upper_arm")
    hand = arm & (seg_of == "hand")
    fore = arm & (seg_of == "forearm")
    cap = upper & (t_arm < 0.5) & (z > 1.18)
    bracer = (fore & (t_arm > 0.72)) | (hand & (t_arm < 0.1))
    collar = torso & (z > 1.365) & (z < 1.46) & (ax < 0.16) & (np.hypot(x, y + 0.01) > 0.058)
    neck = torso & (z > 1.38) & ~collar
    chest = torso & (z > 1.0) & (z <= 1.365)
    belt = torso & (z > 0.945) & (z <= 1.0)
    skirt = body & ~arm & ~leg & (z > 0.55) & (z <= 0.945)
    boot = leg & (z > 0.2) & (z < 0.34)
    foot = leg & (z <= 0.12)
    shin = leg & ~boot & ~foot

    grain = fbm(p, 18, seed)                 # broad mottling
    fine = noise(p, 90, seed + 3)            # cloth weave / skin pores
    jag = noise(p * np.array([1, 1, 0]), 60, seed + 5)

    # ------------------------------------------------ skin everywhere first
    off += (grain - 0.5) * 0.22 + (fine - 0.5) * 0.04
    # ribs: a cage that shows on the lower chest and flanks, under the pectorals
    rz = z + 1.6 * x * x
    ribv = np.sin((rz - 1.04) / 0.04 * 2 * np.pi)
    ribzone = chest & (z > 1.07) & (z < 1.27) & (front > -0.04) & (ax > 0.035) & (ax < 0.16)
    fade = np.clip((ax - 0.035) / 0.04, 0, 1)
    off[ribzone] += (0.16 * np.clip(ribv, 0, 1) - 0.2 * np.clip(-ribv, 0, 1))[ribzone] * fade[ribzone]
    mat[ribzone & (ribv > 0.8) & (fade > 0.5)] = RIB
    ster = chest & (ax < 0.018) & (front > 0) & (z > 1.12) & (z < 1.32)
    off[ster] += 0.1
    off[chest & (ax < 0.035) & (ax >= 0.018) & (front > 0) & (z > 1.1) & (z < 1.3)] -= 0.08
    clav = torso & (z > 1.32) & (ax > 0.03) & (ax < 0.15) & (front > 0) & (np.abs(z - (1.36 - ax * 0.12)) < 0.01)
    off[clav] += 0.14
    off[torso & (front > 0) & (z > 1.0) & (z < 1.08) & (ax < 0.1)] -= 0.1      # hollow belly
    # spine knobs and shoulder blades on the back
    back = chest & (front < -0.02)
    knob = back & (ax < 0.018) & (np.sin(z / 0.035 * 2 * np.pi) > 0.2)
    mat[knob] = RIB
    e = np.hypot((ax - 0.085) / 0.06, (z - 1.27) / 0.08)
    off[back & (e < 1) & (z > 1.25)] += 0.07                                  # shoulder blades
    off[back & (np.abs(e - 1) < 0.25) & (z < 1.25)] -= 0.1
    # tendons on the neck
    off[neck & (np.abs(ax - 0.03) < 0.008)] += 0.12
    # bony knuckles, dark nails on the finger ends
    mat[hand & (t_arm > 0.88)] = NAIL
    off[hand & (t_arm > 0.55) & (t_arm < 0.6)] -= 0.15
    # filthy feet and shins
    off[leg] -= np.clip((0.25 - z[leg]) * 1.4, 0, 0.35)
    mat[foot & (fine > 0.55)] = GRIME
    toes = foot & (front > 0.08)
    off[toes & (np.sin(x / 0.016 * 2 * np.pi) > 0.6)] -= 0.25

    # ------------------------------------------------ clothing per variant
    ang = np.arctan2(x, -y)
    k = ang * 11 / np.pi + 3 * noise(np.stack([ang, np.zeros(N), np.zeros(N)], 1), 4, seed + 2)
    tooth = np.abs((k - np.floor(k)) - 0.5) * 2
    hem = 0.6 + 0.13 * tooth * (0.4 + 0.8 * noise(np.stack([np.floor(k), np.zeros(N), np.zeros(N)], 1), 1, seed))
    if variant == "a":
        mat[collar] = CLOTH
        mat[cap & (jag > 0.25)] = CLOTH
        ragline = 1.30 + 0.05 * jag + 0.03 * np.sin(x * 40)
        rag = (chest | neck) & ((z > ragline) & (x < 0.08) | (front < -0.03) & (z > ragline - 0.18 + 0.1 * x))
        rag |= upper & (x < 0) & (t_arm < 0.35 + 0.2 * jag)
        mat[rag] = CLOTH
        mat[belt] = ROPE
        off[belt] += 0.2 * np.sin((z[belt] * 120 + np.arctan2(x[belt], y[belt]) * 9)) - 0.05
        mat[skirt] = TROUSER
        trous = shin & (z > 0.40 + 0.05 * jag - 0.03 * (x < 0)) | (leg & (z > 0.5))
        mat[trous] = TROUSER
        mat[boot] = CLOTH
        off += boot * (0.08 * np.sin(z / 0.03 * 2 * np.pi + x * 30) - 0.08)
        mat[bracer & (fine > 0.3)] = CLOTH
        # patches and stains on the trousers
        patch = (skirt | trous) & (fbm(p, 8, seed + 9) > 0.62)
        off[patch] -= 0.12
        wounds = [((0.07, -0.13, 1.22), 0.035), ((-0.36, -0.06, 1.13), 0.03), ((0.1, -0.12, 1.06), 0.03),
                  ((-0.04, -0.1, 1.29), 0.022), ((0.17, -0.06, 0.46), 0.03)]
        rot_amt = 0.72
    elif variant == "b":
        band = np.sin((z + 0.5 * x + 0.3 * y) / 0.075 * 2 * np.pi)
        gap = fbm(p, 10, seed + 4)
        shroud = chest & ((band > -0.25) & (gap < 0.58) | (z > 1.3))
        mat[shroud] = LINEN
        mat[collar | cap] = LINEN
        wraps = (fore | (upper & (t_arm > 0.4))) & (np.sin(t_arm * 40 + np.arctan2(y, z) * 1.0) > 0.0) & (gap < 0.6)
        mat[wraps | bracer] = LINEN
        mat[belt] = ROPE
        mat[skirt] = LINEN
        off[skirt] -= np.clip((0.8 - z[skirt]) * 1.0, 0, 0.25)         # grave soil to the hem
        legwrap = (boot | (shin & (np.sin(z / 0.05 * 2 * np.pi + x * 20) > 0.3) & (z > 0.3)))
        mat[legwrap] = LINEN
        mat[foot] = GRIME
        lin = mat == LINEN
        off[lin] += 0.1 * np.sin(z[lin] / 0.012 * 2 * np.pi) * (fine[lin] > 0.4)
        off[lin & (fbm(p, 6, seed + 8) > 0.6)] -= 0.3                   # seeping stains
        wounds = [((-0.06, -0.12, 1.15), 0.03), ((0.33, -0.05, 1.12), 0.025), ((-0.16, -0.05, 0.4), 0.03)]
        rot_amt = 0.6
    else:
        mat[chest | neck & (z < 1.44)] = TUNIC
        tear = chest & (front > 0) & (ax < 0.07 + 0.05 * jag) & (z > 1.06) & (z < 1.34)
        mat[tear] = SKIN
        mat[tear & ribzone & (ribv > 0.45)] = RIB
        mat[tear & (ster)] = RIB
        torn_back = chest & (front < 0) & (fbm(p, 9, seed + 6) > 0.6)
        mat[torn_back] = SKIN
        bal = chest & (np.abs((z - 1.0) - (0.9 * (x + 0.15))) < 0.022)          # baldric
        mat[bal & ~tear] = LEATHER
        mat[collar] = RUST
        mat[cap] = RUST
        off[cap] += 0.25 * (np.sin((z[cap] - 1.2) / 0.04 * 2 * np.pi) > 0.6)
        mat[bracer] = LEATHER
        mat[bracer & (t_arm > 0.8) & (t_arm < 0.9)] = RUST
        mat[belt] = LEATHER
        mat[belt & (ax < 0.03) & (front > 0)] = BRASS
        ang = np.arctan2(x, -y)
        strip = (np.floor((ang + np.pi) / (2 * np.pi) * 16) % 2 == 0)
        mat[skirt] = TUNIC
        mat[skirt & strip & (z < 0.94)] = LEATHER
        off[skirt & strip] += 0.12 * (np.abs(np.sin((ang[skirt & strip] + np.pi) * 16 / 2)) - 0.5)
        straps = (boot | shin & (z < 0.36)) & (np.abs(np.sin((z + 0.25 * np.arctan2(x - np.sign(x) * 0.17, y)) / 0.04 * np.pi)) < 0.35)
        mat[straps] = LEATHER
        mat[foot & (z < 0.025)] = LEATHER
        wounds = [((0.0, -0.13, 1.17), 0.02), ((0.35, -0.04, 1.14), 0.03), ((-0.2, -0.04, 0.43), 0.03),
                  ((-0.12, 0.1, 1.2), 0.035)]
        rot_amt = 0.72
    alpha[skirt & (z < hem)] = False

    # ------------------------------------------------ wounds, drips, rot (on skin and through cloth)
    for c, r in wounds:
        c = np.array(c)
        d = np.linalg.norm(p - c, axis=1)
        d = d * (0.8 + 0.4 * noise(p, 120, seed + 11))
        on = body & (d < r * 1.25)
        mat[on & (d < r * 0.55)] = GORE
        mat[on & (d >= r * 0.55)] = BLOOD
        col = noise(np.stack([x * 1.0, y * 1.0, np.zeros(N)], 1), 140, seed + 13)
        dl = 0.05 + 0.12 * col
        drip = body & (np.hypot(x - c[0], y - c[1]) < r * 0.9) & (z < c[2]) & (z > c[2] - dl) & (col > 0.45)
        mat[drip & np.isin(mat, [SKIN, RIB, TUNIC, LINEN, CLOTH, TROUSER])] = BLOOD
    rot = body & (fbm(p, 7, seed + 21) > rot_amt + 0.06) & np.isin(mat, [SKIN, LINEN, CLOTH, TROUSER, TUNIC])
    mat[rot] = ROT
    mat[rot & (fine > 0.7)] = GRIME

    # ------------------------------------------------ the head
    hd = part == 1
    hx, hf, hz = hu[:, 0], hu[:, 1], hu[:, 2]
    mat[hd] = SKIN
    sock = np.zeros(N, bool)
    for s in (1, -1):
        d = np.linalg.norm(hu - np.array([s * 0.36, 0.86, 0.17]), axis=1)
        sock |= hd & (d < 0.24)
        off[hd & (d < 0.34) & (d >= 0.24)] -= 0.15 * (1 - (d[hd & (d < 0.34) & (d >= 0.24)] - 0.24) / 0.1)
    mat[sock] = SOCKET
    nose = hd & (np.abs(hx) < 0.09 + (0.02 - hz) * 0.4) & (hz > -0.16) & (hz < 0.04) & (hf > 0.8)
    mat[nose] = SOCKET
    mouth = hd & (np.abs(hx) < 0.26 - 0.15 * np.abs(hz + 0.47)) & (hz < -0.36) & (hz > -0.6) & (hf > 0.6)
    lips = hd & (np.abs(hx) < 0.32) & (hz < -0.3) & (hz > -0.66) & (hf > 0.55) & ~mouth
    mat[mouth] = MOUTH
    mat[lips & (noise(p, 200, seed) > 0.4)] = BLOOD
    off[hd & (hz > 0.55)] += 0.08                                           # bald scalp shine
    mat[hd & (hz > 0.2) & (fbm(p, 30, seed + 40) > 0.72)] = ROT
    vein = hd & (np.abs(noise(p, 70, seed + 41) - 0.5) < 0.02) & (hz > 0.1) & ~sock
    off[vein] -= 0.18
    if variant != "c":
        hair_lines = hd & (np.abs(hx) > 0.5) & (hz > -0.05) & (hz < 0.6) & (hf < 0.4) & \
            (np.sin(np.arctan2(hx, hf) * 30) > 0.75)
        mat[hair_lines] = HAIR
    scar = hd & (np.abs(hx - 0.1 - 0.3 * hz) < 0.035) & (hz > 0.45) & (hz < 0.9) & (hf > -0.2)
    mat[scar] = BLOOD if variant != "b" else GORE
    if variant == "c":   # helmet-strap scar under the chin, and a cut brow
        mat[hd & (np.abs(hz + 0.75) < 0.05) & (np.abs(hf) < 0.6)] = BLOOD
    mat[part == 2] = TEETH
    off[part == 2] += (noise(p[part == 2], 300, seed) - 0.5) * 0.5
    mat[part == 3] = EYE
    mat[part == 4] = HAIR

    # ------------------------------------------------ light and palette snap
    L = np.array([-0.4, -0.6, 0.7])
    L = L / np.linalg.norm(L)
    light = 0.62 + 0.16 * n[:, 2] + 0.14 * np.clip(n @ L, -1, 1)
    light *= 0.62 + 0.38 * np.clip(ao, 0, 1) ** 1.5
    centre = np.array([CENTRE.get(m, 0.0) for m in range(20)])
    centre[SKIN] += {"a": 0.0, "b": 0.08, "c": 0.07}[variant]
    v = np.clip(light + off + centre[mat], 0, 1)
    eye = part == 3
    v[eye] = 0.25 + 0.5 * np.clip(-n[eye, 1], 0, 1) + 0.25 * (n[eye, 2] > 0.6)   # a glint
    iy, ix = np.nonzero(M)
    thr = 0.38 + 0.24 * BAYER[iy % 4, ix % 4]
    rgb = np.zeros((N, 3))
    for m in range(20):
        sel = mat == m
        if not sel.any():
            continue
        tab = table.get(m, table[SKIN])
        f = v[sel] * (len(tab) - 1)
        lo = np.floor(f).astype(int)
        idx = np.clip(lo + ((f - lo) > thr[sel]), 0, len(tab) - 1)
        rgb[sel] = tab[idx]

    out = np.zeros(M.shape + (4,), np.uint8)
    out[M, :3] = rgb
    out[M, 3] = np.where(alpha, 255, 0)
    # bleed colour into the gutters so nearest sampling never meets an empty texel
    filled = M.copy()
    for _ in range(6):
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            src = np.roll(np.roll(out, dy, 0), dx, 1)
            sf = np.roll(np.roll(filled, dy, 0), dx, 1)
            take = ~filled & sf
            out[take] = src[take]
            filled |= take
    return out
