"""Layout specs: where each body part sits on a painted sheet (pixels, y down).

head.front  cu: face centre column; eye_v: eye row; ku: px per radian round the head;
            kz: px per metre down the face (eyes 1.69 m, mouth 1.607 m, chin 1.575 m);
            k_up: px per radian over the brow; neck_v: row where the neck meets the chest.
head.back   cu, ear_v (ear row), ku, kz, k_up, neck_v (same meanings, seen from behind).
ears        l / r: painted ear centres; k px per metre; dir_*: which way +y (backwards) runs.
torso       front / back: (centre column, half width, top row, bottom row).
arms        r / l: [back strip, front strip] or [one full wrap]. A strip is {"c": centre pixels
            at shoulder, elbow, wrist, "a": half-width vector}; for halves the first edge
            (c - a) is the top of the T-pose arm; a full wrap is centred on the top of the arm.
legs        split_z between thigh and shin pieces; thigh / shin: {"z": landmark heights,
            "r" / "l": [front, back] or [one full wrap centred on the front]}, strips as above,
            c - a on the inside (medial) edge.
hands       dr / dl back of right / left hand, pr / pl palms: W wrist centre, K knuckle-line
            centre, D vector from the index row to the little-finger row at the knuckles,
            tips (index..little), thumb (base, tip).
feet        r / l: A front of ankle, T toe tips, L unit vector to the outside, kw px per metre.
mouth       c: centre of the painted mouth interior, k px per metre (kx/kz to differ).
teeth       up / lo: u0..u1 across, gum row, tip row.
clone       rectangles of clean skin the bake may cut patches from.
"""


def strip2(c, a):
    return {"c": c, "a": a}


ZOMBIE = {
    "head": {
        "front": dict(cu=318, eye_v=116, ku=116, kz=1165, k_up=63, neck_v=304.4),
        "back": dict(cu=935, ear_v=131, ku=116, kz=1165, k_up=83, neck_v=301),
    },
    "ears": dict(l=(500, 140), r=(137, 140), k=1250, dir_l=1, dir_r=-1),
    "torso": {"front": (317, 186, 330, 689), "back": (940, 190, 330, 689)},
    "arms": {
        "r": [strip2([(612, 736.5), (338, 736.5), (165, 736.5)], (0, 48.5)),
              strip2([(612, 843.5), (338, 843.5), (165, 843.5)], (0, 52.5))],
        "l": [strip2([(642, 736.5), (905, 736.5), (1100, 736.5)], (0, 48.5)),
              strip2([(642, 843.5), (905, 843.5), (1100, 843.5)], (0, 52.5))],
    },
    "legs": {
        "split_z": 0.36,
        "thigh": {"z": [0.885, 0.535, 0.36],
                  "r": [strip2([(610, 946), (205, 946), (18, 946)], (0, 49)),
                        strip2([(610, 1054.5), (205, 1054.5), (18, 1054.5)], (0, 47.5))]},
        "shin": {"z": [0.36, 0.08],
                 "r": [strip2([(17, 1173.5), (289, 1173.5)], (0, 64.5)),
                       strip2([(618, 1172.5), (319, 1172.5)], (0, 65.5))]},
    },
    "hands": {
        "dr": dict(W=(797, 956.5), K=(712, 956.5), D=(0, 77),
                   tips=[(640, 918), (637, 945), (643, 972), (667, 995)], thumb=((773, 908), (730, 885))),
        "dl": dict(W=(1057, 958.5), K=(1143, 958.5), D=(0, 73),
                   tips=[(1210, 922), (1217, 945), (1203, 972), (1183, 995)], thumb=((1083, 908), (1117, 885))),
        "pr": dict(W=(847, 958.6), K=(937, 958.6), D=(0, 67.3),
                   tips=[(1000, 925), (1007, 945), (1000, 968), (983, 992)], thumb=((877, 912), (910, 888))),
    },
    "feet": {"r": dict(A=(728, 1025), T=(728, 1232.7), L=(-1, 0), kw=1400, t0=-0.0144),
             "l": dict(A=(855, 1025), T=(855, 1232.7), L=(1, 0), kw=1400, t0=-0.0144)},
    "mouth": dict(c=(1047, 1118), k=2600),
    "teeth": {"up": dict(u0=1133, u1=1237, gum=1029, tip=1045), "lo": dict(u0=1142, u1=1238, gum=1204, tip=1191)},
    "clone": [(14, 330, 128, 600), (506, 330, 618, 600), (641, 330, 750, 600), (1129, 330, 1238, 600),
              (770, 430, 1110, 650), (60, 910, 580, 985), (60, 1015, 580, 1095)],
}
ZOMBIE["legs"]["thigh"]["l"] = ZOMBIE["legs"]["thigh"]["r"]
ZOMBIE["legs"]["shin"]["l"] = ZOMBIE["legs"]["shin"]["r"]
ZOMBIE["hands"]["pl"] = ZOMBIE["hands"]["pr"]

SHEETS = {"zombie": ZOMBIE}

from sheets_more import MORE  # noqa: E402  (the ten monster sheets)

SHEETS.update(MORE)
