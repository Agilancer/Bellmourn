"""Layout specs for the ten monster sheets (art/creatures/monsters/sheet_N.webp), built from
island boxes and a few landmarks with the helpers below. Imported by sheets.py."""


def face(cu, eye_v, eye_dx, mouth_v, top_v, neck_v, ear_dx=None):
    """Front of the head from the painted eyes (centre column, row, half spacing), mouth row,
    panel top and neck rows; ear_dx (ear distance from centre) adds a cubic so both land."""
    ku, kc = eye_dx / 0.455, 0.0
    if ear_dx:
        a11, a12, a21, a22 = 0.455, 0.455 ** 3, 1.5708, 1.5708 ** 3
        det = a11 * a22 - a12 * a21
        ku, kc = (eye_dx * a22 - a12 * ear_dx) / det, (a11 * ear_dx - a21 * eye_dx) / det
    return dict(cu=cu, eye_v=eye_v, ku=ku, kc=kc, kz=(mouth_v - eye_v) / 0.082, k_up=(eye_v - top_v) / 1.66, neck_v=neck_v)


def back(cu, ear_v, ear_dx, top_v, neck_v, kz):
    return dict(cu=cu, ear_v=ear_v, ku=ear_dx / 1.5708, kz=kz, k_up=(ear_v - top_v) / 1.48, neck_v=neck_v)


def vstrip(x0, x1, ys, flip=False):
    hw = (x1 - x0) / 2
    return {"c": [((x0 + x1) / 2, y) for y in ys], "a": (-hw if flip else hw, 0)}


def hstrip(y0, y1, xs, flip=False):
    hw = (y1 - y0) / 2
    return {"c": [(x, (y0 + y1) / 2) for x in xs], "a": (0, -hw if flip else hw)}


def hand(x0, y0, x1, y1, fingers, thumb):
    """A painted hand from its box: fingers point u/d/l/r; thumb on side l/r (or t/b)."""
    w, h = x1 - x0, y1 - y0

    def P(q, s):   # q across from the thumb side, s from the wrist to the fingertips
        if fingers in "ud":
            return (x0 + q * w if thumb == "l" else x1 - q * w, y1 - s * h if fingers == "u" else y0 + s * h)
        return (x1 - s * w if fingers == "l" else x0 + s * w, y0 + q * h if thumb == "t" else y1 - q * h)
    ib, pb = P(0.35, 0.45), P(0.85, 0.45)
    return dict(W=P(0.57, 0.03), K=P(0.6, 0.45), D=(pb[0] - ib[0], pb[1] - ib[1]),
                tips=[P(0.33, 0.96), P(0.52, 0.99), P(0.7, 0.96), P(0.86, 0.85)], thumb=(P(0.22, 0.3), P(0.05, 0.62)))


def foot(x0, y0, x1, y1, toes, L):
    w, h = x1 - x0, y1 - y0
    if toes in "ud":
        cx, sg, y = (x0 + x1) / 2, (1 if toes == "d" else -1), (y0 if toes == "d" else y1)
        return dict(A=(cx, y + sg * 0.04 * h), T=(cx, y + sg * 0.98 * h), L=L, kw=w / 0.085)
    cy, sg, x = (y0 + y1) / 2, (1 if toes == "r" else -1), (x0 if toes == "r" else x1)
    return dict(A=(x + sg * 0.04 * w, cy), T=(x + sg * 0.98 * w, cy), L=L, kw=h / 0.085)


def teeth(up, lo):
    keys = ("u0", "u1", "gum", "tip")
    return {"up": dict(zip(keys, up)), "lo": dict(zip(keys, lo))}


def full_legs(r, l):
    """Whole-leg strips (hip, knee, ankle) for both legs; no separate shin pieces."""
    t = {"z": [0.885, 0.535, 0.08], "r": r, "l": l}
    return {"split_z": 0.0, "thigh": t, "shin": t}


def both(dr, dl, pr=None, pl=None):
    return {"dr": dr, "dl": dl, "pr": pr or dr, "pl": pl or dl}


MORE = {}
MORE["veinwretch"] = {   # sheet 2: flayed pink flesh, red veins, yellow eyes
    "head": {"front": face(350, 114, 61, 213, 8, 268), "back": back(795, 135, 165, 8, 276, 1207)},
    "ears": dict(l=(572, 135), r=(120, 135), k=1200),
    "torso": {"front": (449, 160, 280, 705), "back": (802, 158, 280, 705)},
    "arms": {"r": [vstrip(6, 142, [262, 495, 735]), vstrip(145, 275, [270, 476, 752])],
             "l": [vstrip(1112, 1248, [262, 495, 735]), vstrip(977, 1108, [270, 476, 752])]},
    "legs": full_legs([vstrip(454, 627, [712, 945, 1240], True), vstrip(262, 455, [712, 945, 1240])],
                      [vstrip(627, 801, [712, 945, 1240]), vstrip(801, 994, [712, 945, 1240], True)]),
    "hands": both(hand(10, 743, 135, 962, "u", "l"), hand(1126, 743, 1247, 962, "u", "r"),
                  hand(123, 747, 244, 955, "u", "r"), hand(1017, 747, 1137, 955, "u", "l")),
    "feet": {"r": foot(8, 954, 148, 1247, "d", (-1, 0)), "l": foot(1111, 954, 1248, 1247, "d", (1, 0))},
    "mouth": dict(c=(1097, 138), k=2600),
    "teeth": teeth((1000, 1195, 38, 72), (985, 1210, 218, 178)),
    "clone": [(650, 330, 950, 650), (300, 330, 600, 640), (270, 760, 440, 1200)],
}
MORE["ropebound"] = {   # sheet 3: chalky grey corpse in rotted blue rags, rope and buckle
    "head": {"front": face(316, 120, 71, 205, 10, 318), "back": back(823, 120, 140, 8, 315, 1220)},
    "ears": dict(l=(1001, 125), r=(639, 125), k=1500),
    "torso": {"front": (429, 200, 330, 730), "back": (833, 185, 340, 725)},
    "arms": {"r": [vstrip(8, 113, [318, 515, 718]), vstrip(112, 220, [318, 515, 718])],
             "l": [vstrip(1142, 1246, [318, 515, 718]), vstrip(1032, 1142, [318, 515, 718])]},
    "legs": {"split_z": 0.45,
             "thigh": {"z": [0.885, 0.535, 0.45],
                       "r": [vstrip(223, 428, [740, 1000, 1035], True), vstrip(437, 619, [740, 1000, 1035])],
                       "l": [vstrip(829, 1031, [740, 1000, 1035]), vstrip(633, 818, [740, 1000, 1035], True)]},
             "shin": {"z": [0.45, 0.08], "r": [vstrip(107, 212, [742, 1035], True), vstrip(7, 103, [742, 1035])],
                      "l": [vstrip(1042, 1146, [742, 1035]), vstrip(1150, 1245, [742, 1035], True)]}},
    "hands": both(hand(10, 1048, 198, 1250, "d", "r"), hand(284, 1048, 469, 1250, "d", "l")),
    "feet": {"r": foot(905, 1050, 1036, 1247, "d", (-1, 0)), "l": foot(1089, 1050, 1200, 1248, "d", (1, 0))},
    "mouth": dict(c=(662, 1205), k=2600),
    "teeth": teeth((582, 745, 1060, 1098), (582, 745, 1165, 1128)),
    "clone": [(680, 380, 1000, 700), (8, 750, 100, 1030), (240, 380, 600, 700)],
}
MORE["ancient"] = {   # sheet 4: parchment-pale old man, wisps of grey hair, sagging gut
    "head": {"front": face(260, 132, 50, 222, 8, 300, ear_dx=168), "back": back(705, 140, 175, 8, 298, 829)},
    "ears": dict(l=(420, 140), r=(85, 140), k=1200),
    "torso": {"front": (415, 190, 320, 820), "back": (804, 180, 320, 818)},
    "arms": {"r": [vstrip(11, 105, [318, 490, 660]), vstrip(113, 204, [318, 490, 660])],
             "l": [vstrip(1151, 1245, [318, 490, 660]), vstrip(1051, 1142, [318, 490, 660])]},
    "legs": full_legs([vstrip(278, 420, [842, 1000, 1240], True), vstrip(152, 279, [880, 1030, 1244])],
                      [vstrip(832, 976, [842, 1000, 1240]), vstrip(975, 1102, [880, 1030, 1244], True)]),
    "hands": both(hand(94, 685, 233, 862, "d", "r"), hand(1021, 685, 1161, 862, "d", "l"),
                  hand(12, 679, 115, 855, "d", "l"), hand(1141, 678, 1242, 855, "d", "r")),
    "feet": {"r": foot(511, 1015, 611, 1244, "d", (-1, 0)), "l": foot(644, 1015, 743, 1244, "d", (1, 0))},
    "mouth": dict(c=(1140, 215), k=2600),
    "teeth": teeth((1045, 1235, 95, 132), (1045, 1235, 290, 255)),
    "clone": [(660, 380, 960, 760), (260, 380, 580, 600), (290, 960, 410, 1200)],
}
MORE["cinder"] = {   # sheet 5: charred black hide split by glowing red cracks
    "head": {"front": face(347, 115, 70, 212, 8, 298), "back": back(979, 135, 230, 8, 298, 1158)},
    "ears": dict(l=(1193, 135), r=(765, 135), k=2400),
    "torso": {"front": (348, 220, 320, 730), "back": (915, 200, 320, 730)},
    "arms": {"r": [hstrip(739, 847, [620, 390, 165]), hstrip(851, 956, [620, 390, 190])],
             "l": [hstrip(738, 844, [640, 855, 1068]), hstrip(850, 958, [640, 855, 1068])]},
    "legs": full_legs([hstrip(1071, 1159, [940, 636, 330]), hstrip(1161, 1246, [925, 626, 325])],
                      [hstrip(1071, 1159, [940, 636, 330], True), hstrip(1161, 1246, [925, 626, 325], True)]),
    "hands": both(hand(8, 805, 175, 994, "u", "l"), hand(1082, 804, 1246, 994, "u", "r")),
    "feet": {"r": foot(11, 1072, 272, 1160, "l", (0, 1)), "l": foot(989, 1078, 1243, 1163, "r", (0, 1))},
    "mouth": dict(c=(1013, 1015), k=2600),
    "teeth": teeth((945, 1085, 975, 1012), (945, 1085, 1060, 1020)),
    "clone": [(760, 380, 1080, 700), (180, 380, 540, 700)],
}
MORE["maw"] = {   # sheet 6: pale skinned thing whose face splits into a needle-lined slit
    "head": {"front": face(317, 145, 77, 303, 8, 410), "back": back(940, 110, 245, 8, 405, 1880)},
    "ears": dict(l=(560, 95), r=(70, 95), k=1300),
    "torso": {"front": (313, 235, 410, 772), "back": (940, 225, 410, 772)},
    "arms": {"r": [vstrip(9, 86, [385, 575, 770]), vstrip(542, 619, [385, 575, 770])],
             "l": [vstrip(1169, 1244, [385, 575, 770]), vstrip(635, 711, [385, 575, 770])]},
    "legs": full_legs([hstrip(782, 901, [440, 220, 15]), hstrip(888, 1014, [440, 220, 15])],
                      [hstrip(784, 902, [816, 1030, 1240]), hstrip(890, 1014, [816, 1030, 1240])]),
    "hands": both(hand(461, 779, 584, 987, "u", "l"), hand(677, 780, 792, 987, "u", "r")),
    "feet": {"r": foot(262, 1015, 512, 1243, "d", (-1, 0)), "l": foot(744, 1015, 992, 1243, "d", (1, 0))},
    "mouth": dict(c=(632, 885), k=2600, kx=4200, kz=1400),
    "teeth": teeth((545, 621, 995, 1050), (632, 708, 995, 1050)),
    "clone": [(760, 450, 1120, 740), (120, 450, 500, 740)],
}
MORE["mummy"] = {   # sheet 7: dried tan corpse in rotting bandages
    "head": {"front": face(361, 95, 65, 210, 8, 292), "back": back(952, 100, 170, 8, 290, 1341)},
    "ears": dict(l=(1164, 191), r=(740, 191), k=1900),
    "torso": {"front": (399, 180, 315, 795), "back": (846, 185, 315, 778)},
    "arms": {"r": [vstrip(5, 108, [312, 550, 795]), vstrip(108, 211, [312, 550, 795])],
             "l": [vstrip(1159, 1251, [312, 550, 795]), vstrip(1040, 1160, [312, 550, 795])]},
    "legs": full_legs([vstrip(168, 320, [885, 1065, 1240], True), vstrip(10, 160, [885, 1065, 1240])],
                      [vstrip(920, 1088, [885, 1065, 1240]), vstrip(1096, 1244, [885, 1065, 1240], True)]),
    "hands": both(hand(330, 809, 484, 909, "r", "t"), hand(748, 808, 900, 912, "l", "t")),
    "feet": {"r": foot(454, 916, 538, 1241, "d", (-1, 0)), "l": foot(727, 916, 805, 1243, "d", (1, 0))},
    "mouth": dict(c=(617, 845), k=2600),
    "teeth": teeth((545, 690, 797, 833), (548, 688, 890, 850)),
    "clone": [(690, 380, 1000, 700), (260, 380, 560, 700)],
}
MORE["shambler"] = {   # sheet 8: olive-grey rotting classic
    "head": {"front": face(368, 122, 77, 222, 8, 352), "back": back(986, 130, 230, 8, 340, 1256)},
    "ears": dict(l=(680, 135), r=(40, 135), k=1300),
    "torso": {"front": (365, 230, 350, 728), "back": (989, 220, 355, 735)},
    "arms": {"r": [vstrip(5, 122, [740, 880, 1040]), vstrip(150, 257, [740, 880, 1040])],
             "l": [vstrip(370, 476, [740, 880, 1040]), vstrip(258, 364, [740, 880, 1040])]},
    "legs": full_legs([vstrip(506, 651, [740, 920, 1240], True), vstrip(642, 788, [740, 920, 1240])],
                      [vstrip(506, 651, [740, 920, 1240]), vstrip(642, 788, [740, 920, 1240], True)]),
    "hands": both(hand(6, 1039, 160, 1244, "d", "r"), hand(168, 1042, 320, 1247, "d", "l")),
    "feet": {"r": foot(768, 1051, 885, 1248, "d", (-1, 0)), "l": foot(1033, 1051, 1149, 1247, "d", (1, 0))},
    "mouth": dict(c=(1190, 935), k=2600),
    "teeth": teeth((1145, 1240, 822, 856), (1143, 1240, 897, 864)),
    "clone": [(790, 400, 1180, 700), (110, 400, 620, 700)],
}
MORE["drowned"] = {   # sheet 9: bloated blue-grey drowned man, weed and barnacles
    "head": {"front": face(368, 102, 62, 180, 8, 296), "back": back(958, 95, 250, 8, 294, 975)},
    "ears": dict(l=(569, 127), r=(167, 127), k=1250),
    "torso": {"front": (372, 220, 310, 682), "back": (912, 195, 310, 680)},
    "arms": {"r": [vstrip(5, 166, [310, 490, 668])], "l": [vstrip(1094, 1249, [310, 490, 668])]},
    "legs": full_legs([vstrip(6, 170, [688, 960, 1240], True), vstrip(155, 298, [688, 960, 1240])],
                      [vstrip(668, 847, [688, 960, 1240]), vstrip(6, 170, [688, 960, 1240], True)]),
    "hands": both(hand(374, 691, 512, 990, "u", "l"), hand(525, 691, 664, 989, "u", "r")),
    "feet": {"r": foot(888, 1004, 1038, 1240, "d", (-1, 0)), "l": foot(1044, 1004, 1192, 1240, "d", (1, 0))},
    "mouth": dict(c=(486, 1166), k=2600),
    "teeth": teeth((365, 615, 1005, 1037), (365, 615, 1072, 1040)),
    "clone": [(750, 360, 1080, 650), (190, 360, 560, 650)],
}
MORE["ghoul"] = {   # sheet 10: mauve wire-muscled ghoul, fanged maw, black claws
    "head": {"front": face(380, 108, 70, 228, 8, 300), "back": back(910, 100, 140, 8, 300, 1366)},
    "ears": dict(l=(1160, 80), r=(1175, 225), k=2000),
    "torso": {"front": (386, 210, 320, 762), "back": (863, 210, 320, 765)},
    "arms": {"r": [vstrip(9, 149, [325, 560, 775])], "l": [vstrip(1106, 1246, [325, 560, 775])]},
    "legs": full_legs([hstrip(903, 1052, [15, 440, 880]), hstrip(1053, 1245, [15, 440, 880])],
                      [hstrip(903, 1052, [15, 440, 880], True), hstrip(1053, 1245, [15, 440, 880], True)]),
    "hands": both(hand(136, 774, 412, 870, "r", "t"), hand(518, 774, 778, 883, "l", "t")),
    "feet": {"r": foot(894, 943, 1008, 1242, "u", (1, 0)), "l": foot(1020, 932, 1134, 1242, "u", (-1, 0))},
    "mouth": dict(c=(1011, 815), k=2600),
    "teeth": teeth((908, 1114, 778, 845), (908, 1110, 918, 858)),
    "clone": [(680, 360, 1060, 720), (200, 360, 580, 720)],
}
MORE["plague"] = {   # sheet 11: jaundiced, mould-blotched, weeping pustules, one dead eye
    "head": {"front": face(298, 100, 67, 222, 8, 280), "back": back(853, 100, 170, 8, 285, 1220)},
    "ears": dict(l=(1190, 75), r=(1195, 210), k=1700),
    "torso": {"front": (251, 220, 315, 750), "back": (885, 240, 315, 750)},
    "arms": {"r": [hstrip(752, 866, [620, 400, 175])], "l": [hstrip(762, 869, [636, 860, 1078])]},
    "legs": full_legs([hstrip(859, 989, [594, 400, 205]), hstrip(981, 1110, [604, 400, 200])],
                      [hstrip(870, 990, [700, 880, 1058]), hstrip(990, 1109, [676, 865, 1054])]),
    "hands": both(hand(9, 743, 158, 907, "u", "l"), hand(1096, 748, 1246, 948, "u", "r")),
    "feet": {"r": foot(8, 943, 130, 1244, "u", (-1, 0)), "l": foot(1122, 950, 1246, 1245, "u", (1, 0))},
    "mouth": dict(c=(530, 1175), k=2600),
    "teeth": teeth((445, 615, 1108, 1150), (445, 615, 1200, 1155)),
    "clone": [(680, 360, 1080, 700), (80, 360, 440, 700)],
}
