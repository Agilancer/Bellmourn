"""Where each skin atlas paints what, and how its islands are projected onto the body (wrap.py).

Every atlas paints the same body parts but lays them out its own way, so each is described by a
LAYOUT (pixels on the 1254 px sheet, x right, y down), and `spec` turns a layout into wrap.py
projections for a monster's joints J and head landmarks H:

  face   box, eyes (x left, x right, y), nose, mouth, chin (y), ears (x left, x right) or None,
         ear_y, top (y of the sheet's top edge). Unwrapped round the head, its left on the
         sheet's right. Past its top edge the sheet is read again mirrored, up to the crown.
  back   box, cx (the back's middle), ears (x left, x right) or half (px for 90 degrees),
         top, ear_y, bottom (y). The back of the head, unwrapped the same way from behind.
  crown  box: a patch of the back sheet laid over the top of the head from above.
  ear    {"L": box, "R": box} for atlases that paint the ears as islands of their own.
  chest, backt  box, cx, half (px for 90 degrees round the torso), ys [(z, y), ...].
  arms, legs    {"L"/"R": {"front": strip, "back": strip}}; a strip is (box, dir, mark): `dir`
         the way the limb runs down the strip (down/up/left/right, shoulder or hip first), `mark`
         the fraction along it of the elbow or knee (None: spread evenly).
  hands  {"L"/"R": (box, dir, thumb)}: backs of the hands, `dir` the way the fingers point,
         `thumb` "a0"/"a1": the thumb's side across the strip once turned fingers-down.
  palms  like hands (or None: the backs again, from below).
  feet, soles  {"L"/"R": (box, dir, bigtoe)}: `dir` the way the toes point.
  glow   (hue lo, hue hi, min value): paint in this hue range bright enough glows.

H holds: cy (head axis y), eye, eye_t (the eyes' angle either side of the face), brow, nose,
mouth, chin, ear (z), top (crown z), neck (z where the torso starts).
"""
import numpy as np

UP, DOWN = (0, 0, 1), (0, 0, -1)
FRONT, BACK = (0, -1, 0), (0, 1, 0)
LEFT, RIGHT = (1, 0, 0), (-1, 0, 0)       # his left, his right
ID = ((0, 0), (1, 0), (0, 1))             # a -> x, b -> y (pixels)


def corners(box, d):
    """Corners (a=0,b=0 / a=1,b=0 / a=0,b=1) of a box whose limb runs `d` (as if turned to run down)."""
    x0, y0, x1, y1 = box
    return {"down": ((x0, y0), (x1, y0), (x0, y1)), "up": ((x1, y1), (x0, y1), (x1, y0)),
            "right": ((x0, y1), (x0, y0), (x1, y1)), "left": ((x1, y0), (x1, y1), (x0, y0))}[d]


def g(J, n):
    return np.array(J[n][0], float)


def face(L, H):
    f = L["face"]
    x0, y0, x1, y1 = f["box"]
    el, er, ey = f["eyes"]
    et = H["eye_t"]
    cx = (el + er) / 2
    if f.get("ears"):
        al, ar = f["ears"]
        k = ((ar - er) / (90 - et) + (el - al) / (90 - et)) / 2
        a = [(-90, al), (-et, el), (et, er), (90, ar)]
    else:
        k = (er - el) / (2 * et) * 0.7
        a = [(-et, el), (et, er)]
    a = [(-115, max(x0, a[0][1] - k * (115 + a[0][0])))] + a + [(115, min(x1, a[-1][1] + k * (115 - a[-1][0])))]
    # the sheet's scale (eye to mouth), and how far its top edge (12 px in) is above the eyes
    s = (f["mouth"] - ey) / (H["eye"] - H["mouth"])
    t = f["top"] + 12
    face_top = H["eye"] + (ey - t) / s
    b = [(-face_top, t), (-H["eye"], ey), (-H["nose"], f["nose"]), (-H["mouth"], f["mouth"]),
         (-H["chin"], f["chin"]), (-(H["chin"] - (y1 - f["chin"]) / s), y1)]
    if face_top < H["top"] - 0.02:
        # past its top edge the sheet's forehead band (never as far down as the eyes) is read back
        # and forth at the sheet's own scale, nearly to the crown (the crown itself is laid on from
        # above: unwrapped round the axis it would pinch to a star). Squeezing it streaked the scalp.
        band = 0.45 * (ey - t)
        z1 = H["top"] - 0.02
        tri = lambda z: 1 - abs(((z - face_top) * s / band) % 2 - 1)     # 0 at the edge, 1 a band in
        zs = list(np.arange(face_top + band / s, z1, band / s)) + [z1]
        for z in zs:
            b.insert(0, (-z, t + band * tri(z)))
    return dict(kind="cyl", region="head", origin=(0, H["cy"], 0), axis=DOWN, front=FRONT, right=LEFT,
                a=a, b=b, corners=ID, feather=(14, 0.012), weight=1.3, clip=f["box"])


def back_head(L, H):
    k = L["back"]
    x0, y0, x1, y1 = k["box"]
    cx = k["cx"]
    if k.get("ears"):
        al, ar = k["ears"]
    else:
        al, ar = cx - k["half"], cx + k["half"]
    kk = (ar - al) / 180
    a = [(-106, max(x0, al - 16 * kk)), (-90, al), (0, cx), (90, ar), (106, min(x1, ar + 16 * kk))]
    tz = H["top"] - 0.02
    b = [(-tz, k["top"] + (k["ear_y"] - k["top"]) * 0.02 / (H["top"] - H["ear"])), (-H["ear"], k["ear_y"]),
         (-H["neck"] - 0.03, k["bottom"])]
    return dict(kind="cyl", region="head", origin=(0, H["cy"], 0), axis=DOWN, front=BACK, right=RIGHT,
                a=a, b=b, corners=ID, feather=(16, 0.02), clip=k["box"])


def crown(L, H):
    x0, y0, x1, y1 = L["crown"]
    return dict(kind="planar", region="head", origin=(0, H["cy"], H["top"]), right=RIGHT, down=BACK, view=DOWN,
                a=[(-0.1, x0), (0.1, x1)], b=[(-0.11, y0), (0.1, y1)], corners=ID, feather=(0.01, 0.01),
                facing_pow=3.0, weight=1.0, clip=L["crown"])


def ears(L, H):
    """The ear islands laid on from the side, over each ear (H: ear_r, its size; ear_dz, ear_dy,
    where it sits against the bare man's)."""
    out = []
    k = H.get("ear_r", 0.045) / 0.045
    for s, sx in (("L", 1), ("R", -1)):
        box = L["ear"][s]
        x0, y0, x1, y1 = box
        c = (sx * 0.1, H["cy"] + H.get("ear_dy", 0), H["ear"] + H.get("ear_dz", 0))
        # seen from his side: across is front-to-back (+y on his left), down is down
        out.append(dict(kind="planar", region="head", origin=c, right=(0, sx, 0), down=DOWN, view=(-sx, 0, 0),
                        a=[(-0.03 * k, x0), (0.03 * k, x1)], b=[(-0.04 * k, y0), (0.04 * k, y1)], corners=ID,
                        feather=(0.006, 0.008), facing_pow=1.0, weight=3.0, clip=box,
                        near=((sx * 0.095, c[1], c[2]), 0.045 * k), side_floor=0.4))
    return out


def torso(L, key, front, right, zmap):
    t = L[key]
    x0, y0, x1, y1 = t["box"]
    cx, h = t["cx"], t["half"]
    a = [(-106, max(x0, cx - h * 1.18)), (-90, cx - h), (0, cx), (90, cx + h), (106, min(x1, cx + h * 1.18))]
    b = sorted((-zmap(z), y) for z, y in t["ys"])        # the heights are the bare man's: warped
    return dict(kind="cyl", region="torso", origin=(0, -0.055, 0), axis=DOWN, front=front, right=right,
                a=a, b=b, corners=ID, feather=(16, 0.12), clip=t["box"])


def limb(J, top, bottom, strip, front, right, region, joint_s, ext=0.04, past=0.0, feather=0.03):
    """A limb strip from joint `top` to joint `bottom`; it starts `ext` above the top joint (the
    legs' run up over the hips and buttocks to meet the torso's, the arms' over the shoulder) and
    runs `past` beyond the bottom one on its last row (the legs' over the heel)."""
    box, d, mark = strip
    o, e = g(J, top), g(J, bottom)
    n = np.linalg.norm(e - o)
    b = [(-ext, 0.0)]
    if mark:
        b.append((joint_s, mark))
    b.append((n, 1.0))
    if past:
        b.append((n + past, 1.0))
    a = [(-102, -12 / 180), (-90, 0), (0, 0.5), (90, 1), (102, 1 + 12 / 180)]
    return dict(kind="cyl", region=region, origin=o, axis=e - o, front=front, right=right, a=a, b=b,
                corners=corners(box, d), feather=(12, feather), clip=box)


def hand(J, s, spec, view, weight=1.0):
    box, d, thumb = spec
    sx = 1 if s == "L" else -1
    w = g(J, f"hand.{s}")
    k = np.linalg.norm(np.array(J[f"hand.{s}"][1]) - w) / 0.2599    # this hand's size against the bare man's
    # across: away from the thumb (+y, the thumbs point forward) when the thumb is at a=0
    r = (0, 1, 0) if thumb == "a0" else (0, -1, 0)
    lo, hi = (-0.10 * k, 0.058 * k) if thumb == "a0" else (-0.058 * k, 0.10 * k)
    return dict(kind="planar", region="hand" + s, origin=w, right=r, down=(sx, 0, 0), view=view,
                # long or spread fingers reach past the bare man's hand: they take the island's edge
                a=[(lo * 1.4, 0), (lo, 0), (hi, 1), (hi * 1.4, 1)],
                b=[(-0.02 * k, -0.08), (0, 0), (0.15 * k, 0.42), (0.27 * k, 1.0), (0.4 * k, 1.0)],
                corners=corners(box, d), feather=(0.006, 0.01), facing_pow=1.0, weight=weight, clip=box,
                side_floor=0.3)


def foot(J, s, spec, view, weight=1.0):
    box, d, big = spec
    sx = 1 if s == "L" else -1
    a0 = g(J, f"foot.{s}")
    k = np.linalg.norm(np.array(J[f"foot.{s}"][1]) - a0) / 0.1961    # this foot's size against the bare man's
    r = (sx, 0, 0) if big == "a0" else (-sx, 0, 0)
    sole = view == UP
    return dict(kind="planar", region="foot" + s, origin=a0, right=r, down=FRONT, view=view,
                a=[(-0.062 * k, 0), (0.062 * k, 1)], b=[((-0.07 if sole else -0.03) * k, 0), (0.225 * k, 1)],
                corners=corners(box, d), feather=(0.006, 0.012), facing_pow=2.5 if sole else 1.0,
                weight=weight, clip=box, side_floor=0.0 if sole else 0.3)


def spec(name, J, H, warp=None):
    """The projections for atlas `name` on a body with joints J and head landmarks H; `warp` is the
    change of proportion (if any) the body went through, which the torso's heights follow."""
    L = LAYOUTS[name]
    zmap = (lambda z: float(warp(np.array((0, -0.05, z)))[2])) if warp else (lambda z: z)
    P = [face(L, H), back_head(L, H), crown(L, H), torso(L, "chest", FRONT, LEFT, zmap),
         torso(L, "backt", BACK, RIGHT, zmap)]
    if L.get("ear"):
        P += ears(L, H)
    for s, sx in (("L", 1), ("R", -1)):
        el = np.linalg.norm(g(J, f"forearm.{s}") - g(J, f"upper_arm.{s}"))
        kn = np.linalg.norm(g(J, f"shin.{s}") - g(J, f"thigh.{s}"))
        A, Lg = L["arms"][s], L["legs"][s]
        # arms in the T-pose: front faces forward, its sheet's right toward his outside (up). They
        # reach in over the tops of the shoulders, where the torso's cylinder would smear
        P.append(limb(J, f"upper_arm.{s}", f"hand.{s}", A["front"], FRONT, (0, 0, sx), f"arm{s}+torso", el, 0.07))
        P.append(limb(J, f"upper_arm.{s}", f"hand.{s}", A["back"], BACK, (0, 0, -sx), f"arm{s}+torso", el, 0.07))
        # legs: up over the hips and buttocks (cross-fading with the torso over 12 cm), down over
        # the heel; a sheet whose legs are painted alike is mirrored for the right
        mr = -1 if (s == "R" and L.get("legs_mirror")) else 1
        P.append(limb(J, f"thigh.{s}", f"foot.{s}", Lg["front"], FRONT, tuple(mr * np.array(LEFT)),
                      f"leg{s}+foot{s}+torso", kn, 0.2, 0.07, 0.12))
        P.append(limb(J, f"thigh.{s}", f"foot.{s}", Lg["back"], BACK, tuple(mr * np.array(RIGHT)),
                      f"leg{s}+foot{s}+torso", kn, 0.2, 0.07, 0.12))
        P.append(hand(J, s, L["hands"][s], DOWN))
        P.append(hand(J, s, (L.get("palms") or L["hands"])[s], UP, 0.8))
        P.append(foot(J, s, L["feet"][s], DOWN))
        P.append(foot(J, s, (L.get("soles") or L["feet"])[s], UP))
    fill = [pr["clip"] for pr in P if pr["region"].startswith(("hand", "foot"))]
    return dict(file=L["file"], projections=P, glow=L.get("glow"), atlas=L.get("atlas", {}), inpaint=fill)


def S(box, d="down", mark=None):
    return (box, d, mark)


LAYOUTS = {
    # ---------------------------------------------------------------- 01 the rotting zombie
    "01": dict(
        file="01.png",
        face=dict(box=(5, 0, 725, 345), eyes=(283, 437, 118), nose=170, mouth=240, chin=300, ears=(55, 675),
                  ear_y=150, top=0),
        back=dict(box=(728, 0, 1250, 345), cx=970, ears=(750, 1190), top=6, ear_y=175, bottom=340),
        crown=(870, 18, 1070, 150),
        chest=dict(box=(5, 338, 725, 733), cx=365, half=277,
                   ys=[(1.55, 342), (1.45, 400), (1.30, 520), (1.14, 640), (1.07, 685), (0.98, 730)]),
        backt=dict(box=(731, 347, 1248, 738), cx=985, half=250, ys=[(1.55, 347), (1.45, 400), (0.98, 735)]),
        arms={"L": dict(front=S((150, 736, 257, 1040), mark=0.47), back=S((370, 733, 475, 1054), mark=0.51)),
              "R": dict(front=S((10, 733, 122, 1040), mark=0.48), back=S((259, 734, 364, 1050), mark=0.5))},
        legs={"L": dict(front=S((652, 736, 788, 1244), mark=0.40), back=S((912, 744, 1028, 1041), mark=0.47)),
              "R": dict(front=S((507, 736, 650, 1244), mark=0.40), back=S((792, 744, 909, 1040), mark=0.47))},
        hands={"L": ((168, 1042, 320, 1247), "down", "a0"), "R": ((6, 1039, 160, 1244), "down", "a1")},
        palms={"L": ((365, 1056, 470, 1244), "down", "a0"), "R": ((365, 1056, 470, 1244), "down", "a1")},
        feet={"L": ((1033, 1052, 1149, 1247), "down", "a0"), "R": ((768, 1051, 885, 1247), "down", "a1")},
        soles={"L": ((1147, 1050, 1247, 1247), "up", "a1"), "R": ((1147, 1050, 1247, 1247), "up", "a0")},
    ),
    # ---------------------------------------------------------------- 02 the drowned
    "02": dict(
        file="02.png",
        face=dict(box=(8, 5, 722, 298), eyes=(285, 437, 140), nose=178, mouth=228, chin=278, ears=(172, 578),
                  ear_y=140, top=8),
        back=dict(box=(725, 40, 1250, 298), cx=985, ears=(830, 1135), top=44, ear_y=160, bottom=296),
        crown=(900, 50, 1070, 150),
        chest=dict(box=(140, 300, 592, 675), cx=365, half=225,
                   ys=[(1.55, 302), (1.45, 345), (1.32, 440), (1.07, 625), (0.98, 672)]),
        backt=dict(box=(725, 300, 1100, 672), cx=912, half=188, ys=[(1.55, 302), (0.98, 670)]),
        arms={"L": dict(front=S((855, 685, 960, 1010)), back=S((965, 685, 1100, 1000))),
              "R": dict(front=S((1100, 685, 1250, 1000)), back=S((965, 685, 1100, 1000)))},
        legs={"L": dict(front=S((670, 685, 840, 1250)), back=S((165, 685, 290, 1250))),
              "R": dict(front=S((5, 685, 165, 1250)), back=S((165, 685, 290, 1250)))},
        hands={"L": ((525, 690, 660, 995), "up", "a0"), "R": ((370, 690, 510, 995), "up", "a1")},
        feet={"L": ((1060, 1000, 1240, 1250), "down", "a0"), "R": ((890, 1000, 1060, 1250), "down", "a1")},
    ),
    # ---------------------------------------------------------------- 03 the plague-bearer
    "03": dict(
        file="03.png",
        face=dict(box=(10, 5, 612, 285), eyes=(228, 392, 92), nose=150, mouth=215, chin=268, ears=(35, 590),
                  ear_y=135, top=8),
        back=dict(box=(680, 5, 1052, 285), cx=866, half=170, top=8, ear_y=120, bottom=283),
        crown=(760, 10, 980, 90),
        ear={"L": (1145, 140, 1245, 272), "R": (1145, 5, 1245, 140)},
        chest=dict(box=(110, 290, 615, 748), cx=365, half=250,
                   ys=[(1.55, 293), (1.45, 330), (1.32, 488), (1.07, 690), (0.98, 745)]),
        backt=dict(box=(630, 290, 1112, 748), cx=870, half=240, ys=[(1.55, 293), (0.98, 745)]),
        arms={"L": dict(front=S((700, 865, 1060, 958), "right"), back=S((635, 758, 1085, 862), "right")),
              "R": dict(front=S((200, 865, 600, 958), "left"), back=S((170, 755, 625, 862), "left"))},
        legs={"L": dict(front=S((680, 965, 1060, 1098), "right"), back=S((680, 965, 1060, 1098), "right")),
              "R": dict(front=S((200, 965, 600, 1098), "left"), back=S((200, 965, 600, 1098), "left"))},
        hands={"L": ((10, 745, 152, 940), "up", "a0"), "R": ((1100, 745, 1245, 945), "up", "a1")},
        feet={"L": ((5, 945, 120, 1250), "up", "a1"), "R": ((1120, 945, 1245, 1250), "up", "a0")},
    ),
    # ---------------------------------------------------------------- 04 the mummy
    "04": dict(
        file="04.png",
        face=dict(box=(15, 5, 692, 292), eyes=(280, 425, 108), nose=165, mouth=215, chin=262, ears=(50, 632),
                  ear_y=150, top=8),
        back=dict(box=(700, 5, 1245, 292), cx=955, ears=(748, 1172), top=10, ear_y=175, bottom=290),
        crown=(840, 20, 1060, 110),
        chest=dict(box=(210, 300, 580, 792), cx=393, half=185,
                   ys=[(1.55, 305), (1.45, 360), (1.32, 490), (1.07, 690), (0.98, 790)]),
        backt=dict(box=(585, 300, 1040, 792), cx=850, half=215, ys=[(1.55, 305), (0.98, 790)]),
        arms={"L": dict(front=S((1045, 300, 1155, 792), mark=0.53), back=S((1160, 300, 1245, 792), mark=0.53)),
              "R": dict(front=S((105, 300, 205, 792), mark=0.53), back=S((10, 300, 100, 792), mark=0.53))},
        legs={"L": dict(front=S((920, 890, 1095, 1250)), back=S((1100, 890, 1245, 1250))),
              "R": dict(front=S((10, 890, 160, 1250)), back=S((175, 890, 330, 1250)))},
        hands={"L": ((755, 800, 880, 880), "left", "a0"), "R": ((380, 800, 485, 880), "right", "a1")},
        feet={"L": ((645, 950, 735, 1250), "up", "a1"), "R": ((535, 950, 628, 1250), "up", "a0")},
    ),
    # ---------------------------------------------------------------- 05 the ember husk
    "05": dict(
        file="05.png", glow=dict(hue=(0.98, 0.09), frac=0.12, smin=0.5, gain=0.8),
        face=dict(box=(5, 5, 702, 300), eyes=(280, 422, 108), nose=160, mouth=210, chin=262, ears=(165, 540),
                  ear_y=145, top=8),
        back=dict(box=(720, 5, 1245, 300), cx=960, ears=(762, 1200), top=8, ear_y=130, bottom=298),
        crown=(850, 15, 1070, 90),
        chest=dict(box=(120, 315, 582, 732), cx=350, half=230,
                   ys=[(1.55, 320), (1.45, 360), (1.32, 470), (1.07, 650), (0.98, 730)]),
        backt=dict(box=(705, 315, 1118, 732), cx=910, half=205, ys=[(1.55, 320), (0.98, 730)]),
        arms={"L": dict(front=S((630, 740, 1070, 845), "right"), back=S((630, 850, 1070, 950), "right")),
              "R": dict(front=S((160, 740, 625, 845), "left"), back=S((185, 850, 625, 950), "left"))},
        legs={"L": dict(front=S((320, 1075, 930, 1150), "right"), back=S((320, 1160, 930, 1250), "right")),
              "R": dict(front=S((320, 1075, 930, 1150), "right"), back=S((320, 1160, 930, 1250), "right"))},
        hands={"L": ((5, 800, 170, 990), "up", "a0"), "R": ((1080, 800, 1245, 990), "up", "a1")},
        feet={"L": ((995, 1075, 1245, 1160), "right", "a0"), "R": ((5, 1075, 280, 1160), "left", "a1")},
        soles={"L": ((995, 1160, 1245, 1250), "right", "a1"), "R": ((5, 1160, 280, 1250), "left", "a0")},
    ),
    # ---------------------------------------------------------------- 06 the pale ghoul
    "06": dict(
        file="06.png",
        face=dict(box=(10, 10, 752, 300), eyes=(318, 420, 115), nose=158, mouth=232, chin=292, ears=(40, 725),
                  ear_y=110, top=12),
        back=dict(box=(765, 10, 1088, 300), cx=925, half=160, top=12, ear_y=150, bottom=300),
        crown=(830, 20, 1020, 100),
        ear={"L": (1100, 150, 1245, 300), "R": (1100, 10, 1245, 140)},
        chest=dict(box=(155, 315, 615, 762), cx=385, half=230,
                   ys=[(1.55, 322), (1.45, 380), (1.32, 505), (1.07, 700), (0.98, 760)]),
        backt=dict(box=(630, 315, 1100, 762), cx=862, half=235, ys=[(1.55, 322), (0.98, 760)]),
        arms={"L": dict(front=S((1105, 315, 1250, 762), mark=0.73), back=S((1105, 315, 1250, 762), mark=0.73)),
              "R": dict(front=S((5, 315, 150, 762), mark=0.73), back=S((5, 315, 150, 762), mark=0.73))},
        legs={"L": dict(front=S((10, 915, 885, 1050), "right", 0.46), back=S((10, 1055, 885, 1200), "right", 0.4)),
              "R": dict(front=S((10, 1055, 885, 1200), "right", 0.4), back=S((10, 915, 885, 1050), "right", 0.46))},
        hands={"L": ((520, 770, 800, 905), "left", "a0"), "R": ((130, 770, 420, 905), "right", "a1")},
        feet={"L": ((1015, 925, 1130, 1245), "up", "a1"), "R": ((895, 925, 1010, 1245), "up", "a0")},
    ),
    # ---------------------------------------------------------------- 07 the chitin fiend
    "07": dict(
        file="07.png", glow=dict(hue=(0.03, 0.12), vmin=0.5, smin=0.45, gain=2.2, cap=1.0),
        face=dict(box=(5, 5, 548, 282), eyes=(205, 345, 100), nose=150, mouth=215, chin=270, ears=None,
                  ear_y=100, top=8),
        back=dict(box=(565, 5, 1005, 295), cx=790, half=220, top=8, ear_y=150, bottom=295),
        crown=(700, 15, 880, 120),
        chest=dict(box=(5, 295, 562, 668), cx=285, half=270,
                   ys=[(1.55, 300), (1.45, 330), (1.32, 420), (1.07, 610), (0.98, 665)]),
        backt=dict(box=(565, 295, 1005, 658), cx=785, half=220, ys=[(1.55, 300), (0.98, 655)]),
        arms={"L": dict(front=S((5, 795, 805, 898), "right"), back=S((5, 670, 800, 790), "right")),
              "R": dict(front=S((5, 795, 805, 898), "right"), back=S((5, 670, 800, 790), "right"))},
        legs={"L": dict(front=S((5, 905, 805, 1042), "right"), back=S((5, 1135, 805, 1250), "left")),
              "R": dict(front=S((5, 905, 805, 1042), "right"), back=S((5, 1135, 805, 1250), "left"))},
        hands={"L": ((810, 665, 1050, 812), "right", "a0"), "R": ((810, 665, 1050, 812), "right", "a1")},
        feet={"L": ((1040, 1055, 1110, 1250), "down", "a0"), "R": ((1040, 1055, 1110, 1250), "down", "a1")},
        soles={"L": ((1110, 1050, 1185, 1250), "down", "a0"), "R": ((1110, 1050, 1185, 1250), "down", "a1")},
    ),
    # ---------------------------------------------------------------- 08 the deep maw
    "08": dict(
        file="08.png",
        face=dict(box=(10, 5, 627, 232), eyes=(210, 425, 75), nose=118, mouth=160, chin=222, ears=None,
                  ear_y=95, top=8),
        back=dict(box=(650, 5, 1042, 232), cx=845, half=195, top=8, ear_y=110, bottom=230),
        crown=(720, 15, 960, 90),
        ear={"L": (1150, 5, 1248, 230), "R": (1050, 5, 1145, 230)},
        chest=dict(box=(165, 245, 617, 757), cx=390, half=225,
                   ys=[(1.55, 252), (1.45, 300), (1.32, 425), (1.07, 655), (0.98, 752)]),
        backt=dict(box=(625, 245, 1067, 757), cx=842, half=220, ys=[(1.55, 252), (0.98, 752)]),
        arms={"L": dict(front=S((1150, 245, 1250, 750)), back=S((1150, 245, 1250, 750))),
              "R": dict(front=S((5, 245, 95, 750)), back=S((5, 245, 95, 750)))},
        legs={"L": dict(front=S((5, 975, 592, 1095), "right"), back=S((5, 1100, 577, 1245), "right")),
              "R": dict(front=S((5, 975, 592, 1095), "right"), back=S((5, 1100, 577, 1245), "right"))},
        legs_mirror=True,
        hands={"L": ((1035, 770, 1170, 955), "up", "a0"), "R": ((85, 770, 200, 955), "up", "a1")},
        palms={"L": ((920, 765, 1035, 955), "up", "a1"), "R": ((200, 765, 335, 955), "up", "a0")},
        feet={"L": ((745, 975, 870, 1100), "up", "a1"), "R": ((610, 975, 740, 1100), "up", "a0")},
        soles={"L": ((745, 1100, 885, 1250), "right", "a0"), "R": ((590, 1100, 735, 1250), "left", "a1")},
    ),
    # ---------------------------------------------------------------- 09 the fungal husk
    "09": dict(
        file="09.png", glow=dict(hue=(0.07, 0.13), frac=0.05, smin=0.6, gain=0.45),
        face=dict(box=(5, 5, 617, 272), eyes=(218, 392, 92), nose=140, mouth=195, chin=262, ears=(55, 575),
                  ear_y=70, top=8),
        back=dict(box=(720, 5, 1160, 275), cx=940, half=220, top=8, ear_y=120, bottom=275),
        crown=(800, 20, 1080, 110),
        ear={"L": (1162, 135, 1250, 272), "R": (1162, 5, 1250, 135)},
        chest=dict(box=(165, 278, 667, 772), cx=415, half=250,
                   ys=[(1.55, 282), (1.45, 330), (1.32, 490), (1.07, 682), (0.98, 770)]),
        backt=dict(box=(670, 278, 1097, 778), cx=882, half=213, ys=[(1.55, 282), (0.98, 775)]),
        arms={"L": dict(front=S((1100, 278, 1250, 775)), back=S((1100, 278, 1250, 775))),
              "R": dict(front=S((5, 278, 162, 775)), back=S((5, 278, 162, 775)))},
        legs={"L": dict(front=S((930, 775, 1095, 1030)), back=S((700, 775, 830, 1030))),
              "R": dict(front=S((330, 775, 495, 1030)), back=S((500, 775, 640, 1030)))},
        hands={"L": ((5, 950, 170, 1245), "up", "a0"), "R": ((175, 1010, 345, 1245), "up", "a1")},
        feet={"L": ((955, 1040, 1095, 1245), "up", "a1"), "R": ((955, 1040, 1095, 1245), "up", "a0")},
        soles={"L": ((1100, 945, 1200, 1245), "up", "a1"), "R": ((1100, 945, 1200, 1245), "up", "a0")},
    ),
    # ---------------------------------------------------------------- 10 the bog troll
    "10": dict(
        file="10.png",
        face=dict(box=(10, 5, 682, 247), eyes=(230, 435, 95), nose=135, mouth=178, chin=238, ears=(55, 625),
                  ear_y=115, top=8),
        back=dict(box=(775, 5, 1128, 247), cx=950, half=175, top=10, ear_y=120, bottom=245),
        crown=(840, 20, 1060, 100),
        chest=dict(box=(90, 258, 588, 742), cx=337, half=248,
                   ys=[(1.55, 262), (1.45, 310), (1.32, 490), (1.07, 640), (0.98, 738)]),
        backt=dict(box=(690, 258, 1245, 652), cx=965, half=275, ys=[(1.55, 262), (0.98, 650)]),
        arms={"L": dict(front=S((5, 755, 835, 868), "right", 0.62), back=S((5, 875, 835, 1000), "right", 0.5)),
              "R": dict(front=S((5, 755, 835, 868), "right", 0.62), back=S((5, 875, 835, 1000), "right", 0.5))},
        legs={"L": dict(front=S((5, 1020, 760, 1122), "right", 0.52), back=S((5, 1130, 760, 1245), "right", 0.54)),
              "R": dict(front=S((5, 1020, 760, 1122), "right", 0.52), back=S((5, 1130, 760, 1245), "right", 0.54))},
        hands={"L": ((845, 755, 1012, 1012), "up", "a0"), "R": ((1020, 755, 1160, 1012), "up", "a1")},
        feet={"L": ((1130, 1035, 1250, 1250), "up", "a1"), "R": ((770, 1035, 890, 1250), "up", "a0")},
    ),
}
