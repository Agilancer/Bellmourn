"""What each model is dressed in: per part, a material swatch from the user's material sheets
(tools/models/materials.py). Parts left out keep their texture-library material (wood, bone,
gems); models left out keep the library look entirely.

A part's entry is a swatch id, or a dict:
    m      swatch id (<material>_<tone>, see assets/textures/materials.json)
    rot    90 turns the swatch a quarter (a part's length runs down the swatch unturned: the
           polished steels' glints then run the length of a blade, as on a real one)
    scale  swatch pixels per metre, times the default (2 = the pattern half the size)
    tint   an (r, g, b) colour: keep the swatch's light and dark but recolour it (a palette
           swap: red leather from brown)
Part names ignore a trailing number ("spike 3" is "spike").
"""
import re

PPM = 800  # swatch pixels per metre: a hammer dent is about 2.5 cm, a stud about 1.2 cm

# gauntlet part groups (finger parts are named "index 1".."thumb 3", plates "index plate 1"...)
FINGERS = ("index", "middle", "ring", "pinky", "thumb")
GLOVE = ("glove wrist", "palm") + FINGERS
ELBOW = ("elbow", "elbow point", "elbow knob top", "elbow knob bottom", "sleeve cuff")


DRAKE = dict(m="polished_scale_mid", tint=(60, 106, 58))  # steel scales recoloured drake green


def on(names, m, suffix=""):
    """The same dressing for several parts: on(FINGERS, "x", " plate") dresses every finger
    plate."""
    return {f"{n}{suffix}": m for n in names}


DRESS = {
    "arming_sword": dict(blade="burnished_steel_mid",
                         crossguard="hammered_steel_dark", grip="creased_leather_mid",
                         pommel="hammered_steel_dark"),
    "falchion": dict(blade="brushed_steel_mid", crossguard="tarnished_gold_dark",
                     grip="pebbled_leather_dark", pommel="tarnished_gold_dark"),
    "flanged_mace": dict(haft="riveted_bands_iron", grip="studded_leather_dark",
                         **{"head core": "hammered_steel_dark"}, flange="scratched_steel_mid",
                         pommel="hammered_steel_dark"),
    "bearded_axe": dict(**{"axe head": "hammered_steel_mid", "eye socket": "hammered_steel_dark",
                           "haft band": "scratched_steel_dark"}),
    "morning_star": dict(ball="hammered_steel_dark", spike="burnished_steel_light",
                         collar="polished_copper_mid", pommel="polished_copper_mid"),
    "war_hammer": dict(haft="scratched_steel_dark", grip="pyramid_studded_leather_dark",
                       **{"hammer head": "burnished_steel_mid", "back spike": "burnished_steel_mid",
                          "top spike": "burnished_steel_mid"}, pommel="scratched_steel_dark"),
    "scimitar": dict(blade="burnished_steel_light", guard="polished_gold_mid",
                     grip=dict(m="pebbled_leather_mid", tint=(150, 34, 40)),
                     **{"pommel cap": "polished_gold_mid"}),
    "bone_cleaver": dict(**{"cleaver blade": "scratched_steel_mid",
                            "pommel ring": "hammered_steel_dark"}, collar="verdigris_bronze_mid"),
    "fang_blade": dict(**{"serrated blade": "brushed_steel_dark"},
                       grip="creased_leather_dark"),
    "nail_club": dict(nail="scratched_steel_dark", **{"hand strap": "studded_leather_mid"}),

    # ---------------------------------------------------------------- gauntlets
    # (cloth sleeves, fur, linen wraps, bone, horn and stones keep the texture library)
    "wayfarer": {"leather bracer": "creased_leather_mid", "iron wrist band": "hammered_steel_dark",
                 "iron elbow band": "hammered_steel_dark", **on(GLOVE, "pebbled_leather_dark"),
                 **on(FINGERS, "scratched_steel_dark", " plate"),
                 "knuckle guard": "scratched_steel_dark", "hand plate": "riveted_bands_iron"},
    "hunter": {"bracer": "pebbled_leather_dark", **on(GLOVE, "creased_leather_mid"),
               "glove cuff": "pebbled_leather_mid"},
    "mailed": {"mail sleeve": "fine_mail_mid", **on(ELBOW, "fine_mail_mid"),
               "mail sleeve (forearm)": "fine_mail_mid", **on(GLOVE, "fine_mail_mid"),
               "couter": "burnished_steel_mid", "plate cuff": "burnished_steel_mid",
               "knuckle guard": "burnished_steel_mid"},
    "knight": {"mail sleeve": "bright_fine_mail_mid", **on(ELBOW, "bright_fine_mail_mid"),
               "couter": "burnished_steel_mid", "couter wing": "burnished_steel_mid",
               "vambrace": "burnished_steel_mid", "hourglass cuff": "burnished_steel_mid",
               **on(GLOVE, "pebbled_leather_dark"), **on(FINGERS, "brushed_steel_mid", " plate"),
               "knuckle guard": "burnished_steel_mid", "hand plate": "burnished_steel_mid"},
    "brawler": {"sleeve": "creased_leather_dark", **on(ELBOW, "creased_leather_dark"),
                "studded bracer": "studded_leather_mid", "bracer spike back": "scratched_steel_dark",
                "bracer spike outer": "scratched_steel_dark", **on(GLOVE, "pebbled_leather_mid"),
                **on(FINGERS, "scratched_steel_dark", " knuckle spike"),
                "knuckle pad": "creased_leather_dark"},
    "boneward": {"hide bracer": "creased_leather_dark", **on(GLOVE, "creased_leather_dark")},
    "fiend": {**on(("elbow", "elbow point"), "iron_heavy_mail_dark"), "couter": "hammered_steel_dark",
              "couter spike": "scratched_steel_dark", "vambrace": "studded_bands_iron",
              "spine fin": "hammered_steel_dark", **on(GLOVE, "pebbled_leather_dark"),
              **on(FINGERS, "hammered_steel_dark", " plate"),
              **on(FINGERS, "scratched_steel_dark", " claw"), "hand plate": "hammered_steel_dark"},
    "templar": {**on(("elbow", "elbow point"), "brass_heavy_mail_mid"),
                "couter": "burnished_steel_mid", "couter wing": "burnished_steel_mid",
                "vambrace": "burnished_steel_mid", "gold trim": "polished_gold_mid",
                **on(GLOVE, "pebbled_leather_dark"), **on(FINGERS, "burnished_steel_mid", " plate"),
                "gilded knuckle bar": "polished_gold_mid", "hand plate": "burnished_steel_mid",
                "sun medallion": "polished_gold_mid", "fluted cuff": "burnished_steel_mid"},
    "drake": {**on(("elbow", "elbow point"), "creased_leather_dark"),
              "scale couter": "riveted_bands_bronze", "under-bracer": "creased_leather_dark",
              "scales row": DRAKE,
              **on(GLOVE, "creased_leather_dark"),
              **on(FINGERS, DRAKE, " scale"),
              "drake plate": "riveted_bands_bronze"},
    "runebound": {**on(GLOVE, dict(m="pebbled_leather_mid", tint=(76, 42, 104))),
                  "silver band": "burnished_steel_light", "silver mount": "burnished_steel_light"},
    # weapons remodelled from the free packs (remodels.py)
    "mourners_rapier": dict(blade="burnished_steel_light", cup="hammered_steel_dark",
                            **{"cup rim": "tarnished_gold_mid", "knuckle bow": "scratched_steel_dark",
                               "grip wire": "polished_gold_dark"},
                            quillons="scratched_steel_dark", pommel="tarnished_gold_mid",
                            grip=dict(m="creased_leather_dark", tint=(46, 40, 44))),
    "grave_messer": dict(blade="brushed_steel_mid", crossguard="hammered_steel_dark",
                         nagel="hammered_steel_dark", grip="pebbled_leather_mid",
                         **{"pommel cap": "hammered_steel_dark"}),
    "butchers_axe": dict(**{"cleaver blade": "scratched_steel_mid", "grip wrap":
                            "studded_leather_dark", "butt cap": "hammered_steel_dark",
                            "top spike": "hammered_steel_dark"},
                         bands="riveted_bands_iron", hook="hammered_steel_dark"),
    "gravewarden_halberd": dict(**{"axe head": "scratched_steel_mid", "top spike":
                                   "burnished_steel_mid", "grip wrap": "creased_leather_dark",
                                   "butt ring": "hammered_steel_dark", "butt spike":
                                   "hammered_steel_dark", "lower collar": "hammered_steel_dark"},
                                socket="riveted_bands_iron", collar="hammered_steel_dark",
                                langet="riveted_bands_iron"),
    "reliquary_blade": dict(blade="scratched_steel_dark", guard="tarnished_gold_mid",
                            pommel="tarnished_gold_mid",
                            **{"honed edge": "burnished_steel_light", "grip wire": "polished_gold_dark"},
                            grip=dict(m="creased_leather_mid", tint=(96, 30, 30))),
    "bloodletter": dict(blade="brushed_steel_dark", guard="hammered_steel_dark",
                        pommel="hammered_steel_dark", barb="burnished_steel_mid",
                        **{"honed edge": "burnished_steel_light", "grip rings": "hammered_steel_dark"},
                        grip=dict(m="pebbled_leather_mid", tint=(120, 22, 26))),
    "dane_axe": dict(**{"axe head": "brushed_steel_mid", "honed edge": "burnished_steel_light",
                        "head straps": "riveted_bands_iron", "grip wrap": "creased_leather_mid",
                        "butt shoe": "hammered_steel_dark"}, socket="hammered_steel_dark"),
    "coffin_hammer": dict(**{"striking block": "brushed_steel_dark", "cheek plates":
                             "riveted_bands_iron", "grip wraps": "pebbled_leather_dark",
                             "butt cap": "hammered_steel_dark"},
                          head="brushed_steel_dark", bolts="polished_copper_dark",
                          lashing="creased_leather_dark", claw="scratched_steel_dark"),
    "penitents_greatsword": dict(blade="burnished_steel_mid", guard="hammered_steel_dark",
                                 pommel="hammered_steel_dark", **{"grip ring": "scratched_steel_dark"},
                                 grip=dict(m="pebbled_leather_mid", tint=(116, 26, 28))),
    "gaolers_hook": dict(blade="scratched_steel_mid", guard="hammered_steel_dark",
                         collar="hammered_steel_dark", knob="hammered_steel_dark",
                         **{"key ring": "scratched_steel_mid"}),
    "tombstone": dict(collar="riveted_bands_iron", **{"iron band": "hammered_steel_dark",
                                                      "butt cap": "hammered_steel_dark",
                                                      "grave ring": "hammered_steel_dark"},
                      grip="creased_leather_dark"),
    "wolfjaw_sickle": dict(jawbone=dict(m="scratched_steel_light", tint=(222, 206, 168)),
                           **{"sinew cord": dict(m="creased_leather_mid", tint=(126, 30, 30)),
                              "cord wrap": dict(m="creased_leather_mid", tint=(126, 30, 30))}),
}


# ---------------------------------------------------------------- finishes
# More looks from the same swatches: a finish rewrites every dressed part of any model, by
# what the part is made of (its swatch's material family) and whether it is a cutting or
# striking edge. Texture swaps change the material (scratched for burnished, bronze for
# steel); palette swaps recolour it (tint).

EDGES = ("blade", "spike", "flange", "nail", "claw", "axe head", "hammer head")
STEELS = ("hammered_steel", "brushed_steel", "scratched_steel", "burnished_steel")
BLOOD, FROST = (112, 34, 30), (150, 186, 220)


def family(material):
    for f in ("steel", "gold", "leather", "mail", "scale", "bands"):
        if material.endswith("_" + f):
            return f
    return "bronze" if material in ("verdigris_bronze", "polished_copper") else material


def _worn(mat, tone, edge):
    swap = {"burnished_steel": "scratched_steel", "brushed_steel": "scratched_steel",
            "polished_gold": "tarnished_gold", "polished_copper": "verdigris_bronze",
            "polished_scale": "rusted_scale", "bright_fine_mail": "fine_mail",
            "brass_heavy_mail": "iron_heavy_mail"}
    return swap.get(mat, mat), "iron" if family(mat) == "bands" else "dark", None


def _bright(mat, tone, edge):
    swap = {"scratched_steel": "burnished_steel", "rusted_scale": "polished_scale",
            "fine_mail": "bright_fine_mail", "tarnished_gold": "polished_gold",
            "verdigris_bronze": "polished_copper"}
    f = family(mat)
    if f == "leather":
        return mat, "mid", None
    return swap.get(mat, mat), "steel" if f == "bands" else "light", None


def _gilded(mat, tone, edge):
    f = family(mat)
    if f == "steel":
        return ("burnished_steel", "light", None) if edge else ("polished_gold", "mid", None)
    if f in ("gold", "bronze"):
        return "polished_gold", "light", None
    if f == "mail":
        return "brass_heavy_mail", "light", None
    if f == "scale":
        return "polished_scale", "mid", (206, 160, 64)
    if f == "bands":
        return mat, "bronze", None
    return mat, "dark", None  # leathers


def _ancient(mat, tone, edge):
    f = family(mat)
    if f == "steel":
        return ("polished_copper", "mid", None) if edge else ("verdigris_bronze", "mid", None)
    if f == "gold":
        return "tarnished_gold", "dark", None
    if f == "mail":
        return "brass_heavy_mail", "dark", None
    if f == "scale":
        return "rusted_scale", "mid", (150, 104, 56)
    if f == "bands":
        return mat, "bronze", None
    if f == "leather":
        return mat, "dark", None
    return mat, tone, None


def _tinted(colour, leather):
    def rule(mat, tone, edge):
        f = family(mat)
        if f == "gold":  # gold trim stays gold: the accent on a recoloured piece
            return mat, tone, None
        if f == "leather":
            return mat, "mid", leather
        return mat, tone if f != "bands" else "steel", colour
    return rule


FINISHES = {
    "worn": ("Worn", _worn),
    "bright": ("Bright", _bright),
    "gilded": ("Gilded", _gilded),
    "ancient": ("Ancient Bronze", _ancient),
    "bloodforged": ("Bloodforged", _tinted(BLOOD, (54, 26, 24))),
    "frostbound": ("Frostbound", _tinted(FROST, (52, 62, 84))),
}


def lookup(model_id, part_name, finish=None):
    """The part's dressing as a dict (m, rot, scale, tint), or None; with a `finish` (a key
    of FINISHES), as that finish rewrites it."""
    table = DRESS.get(model_id) or {}
    e = table.get(part_name, table.get(re.sub(r"\s+\d+$", "", part_name)))
    if e is None:
        return None
    e = dict(m=e) if isinstance(e, str) else dict(e)
    e.setdefault("rot", 0)
    e.setdefault("scale", 1.0)
    e.setdefault("tint", None)
    if finish:
        mat, _, tone = e["m"].rpartition("_")
        edge = any(k in part_name for k in EDGES)
        mat, tone, tint = FINISHES[finish][1](mat, tone, edge)
        e["m"] = f"{mat}_{tone}"
        e["tint"] = tint or e["tint"]  # a recoloured part keeps its colour (drake scales)
    return e
