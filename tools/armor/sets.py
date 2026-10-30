"""The armour sets: one per gauntlet, each worn with that gauntlet and dressed in the swatches
its gauntlet is dressed in (tools/models/dress.py), and each sworn to Lord Velscour: his V
on it in several places, and on the dark sets his whole sigil.

A set names its gauntlet, the under-layer's swatches (`under`: the body and the boots), a
function from a Body to its pieces, and `gauntlet_dress` (gauntlet part name -> swatch), which
re-dresses the gauntlet in the set's own swatches so it matches the rest of the armour.
"""
import math
import re

import numpy as np

import garb as G
import greathelm as GH
import helms as H
import ornament as O
import plates as K

FINGERS = ("index", "middle", "ring", "pinky", "thumb")
GLOVE = ("glove wrist", "palm") + FINGERS
ELBOW = ("elbow", "elbow point", "elbow knob top", "elbow knob bottom", "sleeve cuff")


def gdress(table, default):
    """A gauntlet dressing: part name -> material by its name without the trailing number,
    then by the groups `glove` and `elbow`, then by `* suffix` patterns ("* plate" dresses every
    finger plate), else `default`."""
    def dress(part):
        base = re.sub(r"\s+\d+$", "", part)
        if base in table:
            return table[base]
        if base in GLOVE and "glove" in table:
            return table["glove"]
        if base in ELBOW and "elbow" in table:
            return table["elbow"]
        for k, m in table.items():
            if k.startswith("* ") and base.endswith(k[1:]):
                return m
        return default
    return dress


def tint(m, rgb):
    """A swatch or library texture recoloured (keeping its light and dark)."""
    return f"{m}@{''.join(f'{c:02x}' for c in rgb)}"


def gauntlet_vees(b, size=0.045, vees=()):
    """A V on the back of each gauntlet's hand, its point toward the fingers."""
    out = []
    for s in "LR":
        w, k = b.head("Wrist." + s), b.head("Middle2." + s)
        out.append(K.vee(f"gauntlet {s}", w + (k - w) * 0.45, (0, 0, 1), w - k, size, *vees))
    return out


def rondel_on(pa, gold, field, a=1.25, t=-0.004, size=0.075):
    """A rondel on the front of a pauldron's cop (pa: K.pauldron's pieces)."""
    cop = pa[0]
    fit = cop["fit"]
    return K.rondel(cop["name"], fit.point(t, a, fit.radius(t, a)), fit.dir(a), (0, 0, 1), size,
                    gold, field)


def breast_panel(b, fit, face, edge, size=0.26, frac=0.6):
    """A contrasting inlaid panel on the breast, under its V or sigil."""
    return K.plaque("cuirass", *chest(b, fit, frac), (0, 0, 1), size, face, edge,
                    name="breast panel")


def sash(b, fit, mat, width=0.085, left=True):
    """A sash from one shoulder across the breastplate to the other hip."""
    s = 1 if left else -1
    a_, _ = chest(b, fit, 1.05, 0.72 * s)
    b_, _ = chest(b, fit, -0.05, -0.85 * s)
    return O.strap("cuirass", a_, b_, (0, -1, 0), width, mat, thick=0.007, name="sash")


def embroider(b, target, mat, top, bottom, xs=(-0.085, 0.085), back=False, w=0.009):
    """Gold embroidered lines down a cloth panel (a tabard's, a loincloth's)."""
    out = []
    for x in xs:
        (p0, n), (p1, _) = (back_of if back else front_of)(top, x), (back_of if back else front_of)(bottom, x)
        out.append(O.strap(target, p0 + n * 0.0, p1, n, w, mat, thick=0.0022, name=f"embroidery {x:+.2f}"))
    return out


def chest(b, fit, frac=0.6, a=0.0):
    """A point on a cuirass-like fit, `frac` of the way from the waist to the neck."""
    t = b.waist + (b.neck - 0.065 - b.waist) * frac
    return O.on(fit, t, a)


# ------------------------------------------------------------------ Knight's Hourglass

KNIGHT = dict(plate="burnished_steel_mid", trim="brushed_steel_mid", mail="bright_fine_mail_mid",
              brass="tarnished_gold_mid", dark=tint("lib:cloth_02_stitched_charcoal", (14, 12, 12)),
              cape=tint("lib:cloth_01_coarse_sail_canvas", (110, 16, 22)))


def knight_gauntlet(part):
    """Plates in the harness's steel, finger lames in its trim, the glove and sleeve in its mail."""
    if " plate " in part:
        return KNIGHT["trim"]
    if part in ("couter", "couter wing", "vambrace", "hourglass cuff", "knuckle guard",
                "hand plate"):
        return KNIGHT["plate"]
    return KNIGHT["mail"]


def knight(b):
    """Square, heavy mass: a fluted globular breastplate, big domed pauldrons with upright
    neck guards, plain steel edged in brass, and an armet with a low comb."""
    plate, trim, mail, brass = KNIGHT["plate"], KNIGHT["trim"], KNIGHT["mail"], KNIGHT["brass"]
    vees = ("polished_gold_mid", "hammered_steel_dark")
    out = K.cuirass(b, plate, rim=brass, vees=vees, flutes=0.011, box=2)
    out.append(breast_panel(b, out[0]["fit"], "hammered_steel_dark", brass, size=0.27))
    faulds, bottom = K.fauld(b, plate, rim=brass, box=2)
    out += faulds + K.skirt(b, mail, bottom + 0.01)
    out += K.tassets(b, plate, bottom + 0.012, lames=3, width=0.44, box=2, rim=brass)
    out += G.belt(b, "pebbled_leather_dark", gap=0.04, h=0.05,
                  buckle=lambda nm, p, d, up: K.rondel(nm, p, d, up, 0.07, brass, "hammered_steel_dark"))
    out += K.gorget(b, plate)
    out += G.cape(b, KNIGHT["cape"], b.head("LowerLeg.L")[2] - 0.2, width=1.2, gap=0.075, flare=0.12,
                  rim=brass)
    out.append(K.vee("cape", *back_of(b.waist + 0.1), (0, 0, 1), 0.26, *vees, name="V on the cape"))
    for s in "LR":
        pa = K.pauldron(b, s, plate, lames=4, rim=brass, gap=0.034, reach=0.085, box=2.5,
                        lame_rims=True, haute=0.05)
        out += pa + [rondel_on(pa, brass, "hammered_steel_dark")]
        out += K.rerebrace(b, s, plate, box=2, rim=brass)
        out += K.cuisse(b, s, plate, box=2, rim=brass)
        out += K.poleyn(b, s, plate, rim=brass, boss=(brass, "hammered_steel_dark"))
        out += K.greave(b, s, plate, rim=brass, vees=vees, box=2) + K.sabaton(b, s, trim)
    out += GH.great_helm(b, plate, plate, KNIGHT["dark"], rivets=brass, vees=vees)
    return out + gauntlet_vees(b, vees=vees)


# ------------------------------------------------------------------ Fiend's Panoply

FIEND = dict(iron="hammered_steel_dark", ridge="studded_bands_iron", edge="scratched_steel_dark",
             mail="iron_heavy_mail_dark", cloth=tint("lib:cloth_01_coarse_sail_canvas", (96, 14, 18)),
             ember=tint("polished_copper_light", (232, 112, 30)), gold="tarnished_gold_mid",
             slit="lib:cloth_02_stitched_charcoal", horn="tarnished_gold_dark")

fiend_gauntlet = gdress({"sleeve": FIEND["mail"], "elbow": FIEND["mail"], "vambrace": FIEND["ridge"],
                         "* claw": FIEND["edge"], "couter spike": FIEND["edge"],
                         "ember stone": FIEND["ember"], "glove": "pebbled_leather_dark"},
                        FIEND["iron"])


def fiend(b):
    M = FIEND
    vees = (M["gold"], M["ember"])
    out = K.cuirass(b, M["iron"], rim=M["gold"], ridge=0.02, point=0.06, box=4)
    fit = out[0]["fit"]
    out.append(breast_panel(b, fit, "burnished_steel_light", M["gold"], size=0.3, frac=0.55))
    p, d = chest(b, fit, 0.55)
    out.append(O.sigil("cuirass", p, d, (0, 0, 1), 0.2, name="sigil on the breast"))
    # a saw-toothed fin down the spine, as on the gauntlet's vambrace
    ts = np.linspace(b.waist + 0.02, b.neck - 0.05, 14)
    base = [fit.point(t, math.pi, fit.radius(t, math.pi) + 0.022) for t in ts]
    out.append(O.fin("spine fin", base, fit.dir(math.pi), lambda s: 0.04 + 0.06 * math.sin(math.pi * s),
                     0.008, M["edge"], K.CUIRASS, teeth=7))
    faulds, bottom = K.fauld(b, M["iron"], box=4, rim=M["gold"])
    out += faulds + K.skirt(b, M["mail"], bottom + 0.01)
    out += K.tassets(b, M["iron"], bottom + 0.012, lames=3, width=0.44, box=4, rim=M["gold"])
    out += G.tabard(b, M["cloth"], b.head("LowerLeg.L")[2] - 0.02, width=0.3, top=b.waist - 0.02,
                    back=False, gap=0.06, flare=0.08, name="loincloth", stiff=True, rim=M["gold"])
    out.append(K.vee("loincloth front", *front_of(b.waist - 0.2), (0, 0, 1), 0.11, M["gold"], M["iron"]))
    out += G.belt(b, M["iron"], gap=0.045, h=0.055,
                  buckle=lambda nm, p, d, up: K.rondel(nm, p, d, up, 0.075, M["gold"], M["iron"], v=M["ember"]))
    out += G.cape(b, M["cloth"], b.head("LowerLeg.L")[2] - 0.25, width=1.25, gap=0.08, flare=0.14,
                  jag=0.035, teeth=10, rim=M["gold"])
    out.append(O.sigil("cape", *back_of(b.waist + 0.1), (0, 0, 1), 0.3, name="sigil on the cape"))
    out += embroider(b, "loincloth front", M["gold"], b.waist - 0.06, b.head("LowerLeg.L")[2] + 0.02,
                     xs=(-0.055, 0.055))
    out += K.gorget(b, M["edge"])
    for s in "LR":
        big = s == "L"  # demonic: asymmetric, the left shoulder the great one
        pa = K.pauldron(b, s, M["iron"], rim=M["gold"], gap=0.04 if big else 0.034,
                        reach=0.09 if big else 0.075, box=3.5, haute=0.07 if big else 0.0,
                        lame_rims=True)
        if not big:
            pa.append(rondel_on(pa, M["gold"], M["iron"]))
        pf = pa[0]["fit"]
        cop = pa[0]["w"]
        at = [(0.0, 0.0), (0.03, 0.75), (0.03, -0.75)] if big else [(0.01, 0.0)]
        pa += O.spikes(pf, at, 0.13 if big else 0.08, 0.02, M["edge"], cop, off=0.055,
                       tilt=0.35, name=f"pauldron spike {s}")  # fanning out, not up by the head
        out += pa + K.rerebrace(b, s, M["iron"], box=3, rim=M["gold"])
        out += K.cuisse(b, s, M["iron"], box=3, rim=M["gold"])
        po = K.poleyn(b, s, M["iron"], rim=M["gold"], boss=(M["gold"], M["iron"]))
        out += po + O.spikes(po[0]["fit"], [(-0.03, 0.0)], 0.08, 0.016, M["edge"], po[0]["w"],
                             off=0.052, tilt=-0.3, name=f"knee spike {s}")
        out += K.greave(b, s, M["iron"], rim=M["gold"], ridge=0.014, vees=vees, box=4)
        out += K.sabaton(b, s, M["iron"])
    # a closed horned helm, its eye slit a black V edged in ember
    e = b.eye
    h = GH.great_helm(b, M["iron"], M["edge"], M["slit"], rivets=M["ember"], breaths="slots", dot_cols=5,
                      vees=(M["gold"], M["ember"]), name="fiend helm")
    out += h + GH.ram_horns(h, M["horn"])
    return out + gauntlet_vees(b, vees=vees)


# ------------------------------------------------------------------ Gilded Templar

TEMPLAR = dict(steel="burnished_steel_mid", gold="polished_gold_mid", mail="brass_heavy_mail_mid",
               cloth=tint("lib:cloth_01_coarse_sail_canvas", (30, 40, 100)),
               dark="hammered_steel_dark", slit="lib:cloth_02_stitched_charcoal",
               enamel=tint("polished_copper_light", (40, 60, 150)))

templar_gauntlet = gdress({"tabard sleeve": TEMPLAR["mail"], "elbow": TEMPLAR["mail"],
                           "gold trim": TEMPLAR["gold"], "gilded knuckle bar": TEMPLAR["gold"],
                           "sun medallion": TEMPLAR["gold"], "glove": "pebbled_leather_dark"},
                          TEMPLAR["steel"])


def front_of(z, x=0.0):
    """A point on the line out in front at height z, for emblems cast back onto a piece."""
    return np.array([x, -0.3, z]), np.array([0.0, -1.0, 0.0])


def back_of(z, x=0.0):
    return np.array([x, 0.3, z]), np.array([0.0, 1.0, 0.0])


def templar(b):
    M = TEMPLAR
    vees = (M["gold"], M["dark"])
    knee = float(b.head("LowerLeg.L")[2])
    out = K.cuirass(b, M["steel"], rim=M["gold"], ridge=0.016, point=0.05, vees=vees, box=2.5)
    out.append(breast_panel(b, out[0]["fit"], M["enamel"], M["gold"], size=0.27))
    faulds, bottom = K.fauld(b, M["steel"], lames=3, h=0.04, box=2.5)
    out += faulds + K.skirt(b, M["mail"], bottom + 0.01)
    out += G.tabard(b, M["cloth"], knee + 0.03, width=0.42, top=b.waist - 0.01, gap=0.05, flare=0.09,
                    rim=M["gold"], stiff=True)
    out.append(K.vee("tabard front", *front_of(knee + 0.21), (0, 0, 1), 0.17, *vees))
    out += embroider(b, "tabard front", M["gold"], b.waist - 0.04, knee + 0.06, xs=(-0.075, 0.075))
    out += G.belt(b, "pebbled_leather_dark", gap=0.04,
                  buckle=lambda nm, p, d, up: K.vee(nm, p, d, up, 0.06, M["gold"], M["dark"]))
    out += K.gorget(b, M["steel"])
    for s in "LR":
        pa = K.pauldron(b, s, M["steel"], rim=M["gold"], gap=0.034, box=3,
                        lame_rims=True)
        out += pa + [rondel_on(pa, M["gold"], M["enamel"])]
        out += K.rerebrace(b, s, M["steel"], box=2.5, rim=M["gold"])
        out += K.cuisse(b, s, M["steel"], box=2.5, rim=M["gold"])
        out += K.poleyn(b, s, M["steel"], rim=M["gold"], boss=(M["gold"], M["enamel"]))
        out += K.greave(b, s, M["steel"], rim=M["gold"], vees=vees, box=3) + K.sabaton(b, s, M["steel"])
    out += G.cape(b, M["cloth"], knee - 0.12, width=1.15, gap=0.07, flare=0.1, rim=M["gold"])
    out.append(K.vee("cape", *back_of(b.waist + 0.12), (0, 0, 1), 0.24, *vees, name="V on the cape"))
    # the great helm: closed, flat-topped, a black V for its eye slit, a gold brow band and bar
    e = b.eye
    h = GH.great_helm(b, M["steel"], M["gold"], M["slit"], breaths=None, vees=(M["gold"], M["dark"]))
    out += h + [GH.fleur(h, M["gold"]), GH.keyholes(h, M["slit"])]
    return out + gauntlet_vees(b, vees=vees)


# ------------------------------------------------------------------ Hauberk of the Vigil (mailed)

MAILED = dict(mail="fine_mail_mid", steel="burnished_steel_mid", gold="polished_gold_mid",
              cloth=tint("lib:cloth_01_coarse_sail_canvas", (82, 14, 20)), leather="pebbled_leather_dark",
              dark="hammered_steel_dark")

mailed_gauntlet = gdress({"couter": MAILED["steel"], "plate cuff": MAILED["steel"],
                          "knuckle guard": MAILED["steel"]}, MAILED["mail"])


def mailed(b):
    M = MAILED
    vees = (M["gold"], M["dark"])
    knee = float(b.head("LowerLeg.L")[2])
    out = G.coat(b, M["mail"], knee + 0.06, gap=0.014, flare=0.05, top=b.waist + 0.06,
                 splits=(0.0, math.pi), split_w=0.14, hard=0.05, name="hauberk skirt")
    out += G.tabard(b, M["cloth"], knee + 0.02, width=0.75, gap=0.034, flare=0.08, rim=M["gold"],
                    stiff=True)
    out.append(K.vee("tabard front", *front_of(b.waist + 0.17), (0, 0, 1), 0.19, *vees))
    out.append(K.vee("tabard back", *back_of(b.waist + 0.17), (0, 0, 1), 0.18, *vees))
    out += embroider(b, "tabard front", M["gold"], b.waist - 0.05, knee + 0.06, xs=(-0.1, 0.1))
    out += embroider(b, "tabard back", M["gold"], b.waist - 0.05, knee + 0.06, xs=(-0.1, 0.1), back=True)
    out += G.belt(b, M["leather"], gap=0.05,
                  buckle=lambda nm, p, d, up: K.vee(nm, p, d, up, 0.06, M["gold"], M["dark"]))
    for s in "LR":
        pa = K.pauldron(b, s, M["steel"], lames=3, rim=M["gold"], gap=0.03, box=4,
                        lame_rims=True)
        out += pa + [rondel_on(pa, M["gold"], M["cloth"])]
        out += K.poleyn(b, s, M["steel"], wing=False, rim=M["gold"], boss=(M["gold"], M["cloth"]))
        out += K.greave(b, s, M["leather"], t0=0.42, rim=M["gold"], gap=0.02, flare=0.012, ridge=0.0,
                        vees=vees)
    # a conical nasal helm over a mail coif
    e = b.eye
    out += GH.great_helm(b, M["steel"], M["steel"], tint("lib:cloth_02_stitched_charcoal", (14, 12, 12)),
                         rivets=M["gold"], top=0.028, taper=0.04, vees=vees)
    return out + gauntlet_vees(b, vees=vees)


# ------------------------------------------------------------------ Wayfarer's Brigandine

WAYFARER = dict(brig="studded_leather_dark", iron="hammered_steel_dark", bands="riveted_bands_iron",
                wool=tint("lib:cloth_01_coarse_sail_canvas", (74, 18, 24)), leather="creased_leather_dark",
                dark="pebbled_leather_dark", copper="polished_copper_mid", edge="scratched_steel_dark",
                cloak=tint("lib:cloth_03_patched_dark_canvas", (64, 50, 40)))

wayfarer_gauntlet = gdress({"leather bracer": WAYFARER["leather"], "iron wrist band": WAYFARER["iron"],
                            "iron elbow band": WAYFARER["iron"], "glove": WAYFARER["dark"],
                            "* plate": WAYFARER["edge"], "knuckle guard": WAYFARER["edge"],
                            "hand plate": WAYFARER["bands"], "sleeve": WAYFARER["wool"],
                            "elbow": WAYFARER["wool"]}, WAYFARER["wool"])


def wayfarer(b):
    M = WAYFARER
    vees = (M["copper"], M["iron"])
    knee = float(b.head("LowerLeg.L")[2])
    out = G.coat(b, M["brig"], b.waist - 0.25, gap=0.026, flare=0.05, splits=(0.0, math.pi),
                 split_w=0.13, hard=0.07, name="brigandine", solid=0.004, rim=M["bands"], box=2.5)
    out += G.cape(b, M["cloak"], b.head("LowerLeg.L")[2] - 0.18, width=1.2, gap=0.075, flare=0.12,
                  jag=0.04, teeth=12, name="cloak")
    out.append(O.sigil("cloak", *back_of(b.waist + 0.12), (0, 0, 1), 0.28, name="sigil on the cloak"))
    out.append(K.vee("brigandine", *front_of(b.waist + 0.2), (0, 0, 1), 0.12, *vees, name="V on the breast"))
    out += G.belt(b, M["dark"], gap=0.05, h=0.05,
                  buckle=lambda nm, p, d, up: K.vee(nm, p, d, up, 0.065, M["copper"], M["iron"]))
    for s in "LR":
        pa = K.pauldron(b, s, M["iron"], lames=3, rim=M["bands"], gap=0.05, box=4)
        out += pa + [rondel_on(pa, M["copper"], M["iron"])]
        out += K.rerebrace(b, s, M["iron"], t0=0.45, box=3, rim=M["bands"])
        out += K.poleyn(b, s, M["iron"], wing=False, gap=0.03, rim=M["bands"],
                        boss=(M["copper"], M["iron"]))
        out += K.greave(b, s, M["iron"], t0=0.18, rim=M["bands"], gap=0.022, ridge=0.01, box=4,
                        vees=vees)
    # an iron kettle hat with a wide brim over a red wool cowl
    e = b.eye
    h = GH.great_helm(b, M["iron"], M["bands"], tint("lib:cloth_02_stitched_charcoal", (14, 12, 12)),
                      rivets=M["copper"], vees=vees, top=0.024, taper=0.05)
    out += h + GH.crest_boards(h, M["iron"])
    return out + gauntlet_vees(b, vees=vees)


# ------------------------------------------------------------------ Pit Fighter's Harness (brawler)

BRAWLER = dict(studded="studded_leather_dark", dark="pebbled_leather_dark", iron="hammered_steel_dark",
               spike="scratched_steel_dark", strap="riveted_bands_iron", copper="polished_copper_mid",
               glove="pebbled_leather_dark", strips=tint("studded_leather_mid", (104, 30, 26)))

brawler_gauntlet = gdress({"sleeve": BRAWLER["dark"], "elbow": BRAWLER["dark"],
                           "studded bracer": BRAWLER["studded"], "bracer spike back": BRAWLER["spike"],
                           "bracer spike outer": BRAWLER["spike"], "* knuckle spike": BRAWLER["spike"],
                           "knuckle pad": BRAWLER["dark"], "glove": BRAWLER["glove"]}, BRAWLER["dark"])


def brawler(b):
    M = BRAWLER
    vees = (M["copper"], M["iron"])
    knee = float(b.head("LowerLeg.L")[2])
    out = K.cuirass(b, M["studded"], rim=M["dark"], ridge=0.0, point=0.02, gap=0.02, box=3)
    fit = out[0]["fit"]
    out.append(O.sigil("cuirass", *chest(b, fit, 0.62, math.pi), (0, 0, 1), 0.2, name="sigil on the back"))
    # crossed straps over the breast, a copper V where they cross
    for s in (1, -1):
        a_, _ = chest(b, fit, 0.98, 0.62 * s)
        b_, _ = chest(b, fit, 0.05, -0.75 * s)
        out.append(O.strap("cuirass", a_, b_, (0, -1, 0), 0.045, M["strap"], name=f"strap {s}"))
    out.append(K.vee("cuirass", *chest(b, fit, 0.5), (0, 0, 1), 0.085, *vees, name="V on the straps"))
    out += G.coat(b, M["strips"], knee + 0.05, gap=0.03, flare=0.05, top=b.waist + 0.0, strips=12,
                  split_at=b.waist - 0.03, hard=0.06, name="pteruges", solid=0.004)
    out += G.belt(b, M["iron"], gap=0.045, h=0.075,
                  buckle=lambda nm, p, d, up: K.vee(nm, p, d, up, 0.07, M["copper"], M["iron"]))
    # one great spiked iron pauldron, a leather one on the other side
    pa = K.pauldron(b, "L", M["iron"], lames=3, rim=M["spike"], gap=0.045, reach=0.09, box=4,
                    vees=vees)
    pa += O.spikes(pa[0]["fit"], [(-0.04, 0.0), (0.0, 0.65), (0.0, -0.65)], 0.12, 0.02, M["spike"],
                   pa[0]["w"], off=0.06, tilt=-0.3, name="pauldron spike")
    pr = K.pauldron(b, "R", M["studded"], lames=2, rim=M["iron"], gap=0.035, box=3)
    out += pa + pr + [rondel_on(pr, M["copper"], M["iron"])]
    for s in "LR":
        po = K.poleyn(b, s, M["iron"], wing=False, gap=0.03)
        out += po + O.spikes(po[0]["fit"], [(-0.03, 0.0)], 0.06, 0.014, M["spike"], po[0]["w"],
                             off=0.05, tilt=-0.3, name=f"knee spike {s}")
        out += K.greave(b, s, M["iron"], t0=0.2, rim=M["spike"], gap=0.024, ridge=0.008, box=4, vees=vees)
    # an iron skullcap with a brow ridge (provisional: helms are being redesigned)
    e = b.eye
    out += GH.great_helm(b, M["iron"], M["spike"], tint("lib:cloth_02_stitched_charcoal", (14, 12, 12)),
                         rivets=M["copper"], brow_shade=0.014, top=0.004, taper=0.09, vees=vees)
    return out + gauntlet_vees(b, vees=vees)


# ------------------------------------------------------------------ Warden's Leathers (hunter)

HUNTER = dict(leather=tint("pebbled_leather_dark", (50, 40, 32)), leather2=tint("creased_leather_dark", (70, 52, 36)),
              strap="pebbled_leather_dark",
              green=tint("lib:cloth_01_coarse_sail_canvas", (44, 66, 38)), linen="lib:cloth_04_aged_cream_linen",
              iron="hammered_steel_dark", bronze="verdigris_bronze_mid", copper="polished_copper_mid",
              slit=tint("lib:cloth_02_stitched_charcoal", (14, 12, 12)))

hunter_gauntlet = gdress({"bracer": HUNTER["leather"], "wrap": HUNTER["linen"],
                          "glove cuff": HUNTER["leather2"], "sleeve": HUNTER["green"],
                          "elbow": HUNTER["green"], "glove": HUNTER["leather2"]}, HUNTER["green"])


def hunter(b):
    """A ranger's low, layered leather: a tooled leather cuirass, lamed leather spaulders, a
    green mantle and cloak, verdigris bronze edges, a slotted great helm."""
    M = HUNTER
    vees = (M["copper"], M["iron"])
    knee = float(b.head("LowerLeg.L")[2])
    out = K.cuirass(b, M["leather"], rim=M["bronze"], ridge=0.008, point=0.03, gap=0.02, box=3.5)
    fit = out[0]["fit"]
    out.append(breast_panel(b, fit, M["leather2"], M["bronze"], size=0.23))
    out.append(K.vee("cuirass", *chest(b, fit, 0.6), (0, 0, 1), 0.13, *vees, name="V on the breast"))
    faulds, bottom = K.fauld(b, M["leather"], box=3, rim=M["bronze"])
    out += faulds + K.tassets(b, M["leather2"], bottom + 0.012, lames=3, width=0.38, box=3, rim=M["bronze"])
    out += G.belt(b, M["strap"], gap=0.04, h=0.05,
                  buckle=lambda nm, p, d, up: K.rondel(nm, p, d, up, 0.065, M["copper"], M["iron"]))
    out += G.mantle(b, M["green"], gap=0.05, jag=0.03, teeth=16, rim=M["bronze"])
    out += G.cape(b, M["green"], knee - 0.2, width=1.1, gap=0.085, flare=0.12, jag=0.04, teeth=12,
                  name="cloak")
    out.append(K.vee("cloak", *back_of(b.waist + 0.08), (0, 0, 1), 0.22, *vees, name="V on the cloak"))
    for s in "LR":
        pa = K.pauldron(b, s, M["leather2"], lames=3, rim=M["bronze"], gap=0.05, box=3, lame_rims=True)
        out += pa + [rondel_on(pa, M["copper"], M["iron"])]
        out += K.rerebrace(b, s, M["iron"], box=3, rim=M["bronze"])
        out += K.poleyn(b, s, M["iron"], wing=False, rim=M["bronze"], boss=(M["copper"], M["iron"]))
        out += K.greave(b, s, M["iron"], t0=0.2, rim=M["bronze"], gap=0.022, ridge=0.006, box=3,
                        vees=vees)
    out += GH.great_helm(b, M["iron"], M["bronze"], M["slit"], rivets=M["copper"], breaths="slots",
                         vees=vees)
    return out + gauntlet_vees(b, vees=vees)


# ------------------------------------------------------------------ Bone-Ward Harness

BONEW = dict(hide=tint("creased_leather_dark", (54, 38, 30)), hide2=tint("creased_leather_mid", (62, 42, 30)),
             fur=tint("lib:cloth_03_patched_dark_canvas", (112, 90, 68)),
             bone=tint("scratched_steel_light", (222, 206, 168)), iron="hammered_steel_dark",
             slit=tint("lib:cloth_02_stitched_charcoal", (14, 12, 12)))

boneward_gauntlet = gdress({"fur sleeve": BONEW["fur"], "elbow": BONEW["fur"], "hide bracer": BONEW["hide"],
                            "bone couter": BONEW["bone"], "bone hand plate": BONEW["bone"],
                            "rib": BONEW["bone"], "* bone plate": BONEW["bone"],
                            "glove": BONEW["hide"]}, BONEW["hide"])


def boneward(b):
    """A barbarian chieftain sworn to Lord Velscour: dark hide bound with bone ribs, his full
    sigil on the breast, tusked bone pauldrons, a fur mantle, hide strips and an antlered helm."""
    M = BONEW
    vees = (M["bone"], M["iron"])
    knee = float(b.head("LowerLeg.L")[2])
    out = K.cuirass(b, M["hide"], rim=M["bone"], ridge=0.0, point=0.03, gap=0.022, box=3)
    fit = out[0]["fit"]
    for k in range(3):
        t = b.waist + 0.035 + 0.042 * k
        out.append(O.band(fit, f"rib {k + 1}", t - 0.009, t + 0.009, 0.034, M["bone"], K.CUIRASS,
                          arc=(-1.1, 1.1), cols=22, solid=0.005))
    out.append(K.plaque("cuirass", *chest(b, fit, 0.74), (0, 0, 1), 0.23, M["iron"], M["bone"],
                        poly=K.circle_poly(0.5), name="sigil plate"))
    out.append(O.sigil("cuirass", *chest(b, fit, 0.74), (0, 0, 1), 0.2, name="sigil on the breast"))
    out.append(O.sigil("cuirass", *chest(b, fit, 0.55, math.pi), (0, 0, 1), 0.22, name="sigil on the back"))
    out += G.mantle(b, M["fur"], gap=0.05, flare=0.05, jag=0.04, teeth=22, name="fur mantle",
                    hem=b.armpit + 0.07)
    out += G.coat(b, M["hide2"], knee + 0.04, gap=0.03, flare=0.05, top=b.waist, strips=10,
                  split_at=b.waist - 0.03, hard=0.06, name="hide strips", solid=0.004)
    out += G.belt(b, M["hide"], gap=0.05, h=0.06,
                  buckle=lambda nm, p, d, up: K.rondel(nm, p, d, up, 0.075, M["bone"], M["iron"]))
    for s in "LR":
        pa = K.pauldron(b, s, M["bone"], lames=3, rim=M["iron"], gap=0.055, reach=0.085, box=2,
                        lame_rims=True)
        pa += O.spikes(pa[0]["fit"], [(-0.025, 0.0), (0.015, 0.7)], 0.1, 0.017, M["bone"], pa[0]["w"],
                       off=0.065, tilt=0.4, name=f"tusk {s}")
        out += pa
        out += K.poleyn(b, s, M["bone"], wing=False, rim=M["iron"])
        out += K.greave(b, s, M["hide"], t0=0.2, rim=M["bone"], gap=0.024, ridge=0.0, box=3, vees=vees)
    h = GH.great_helm(b, M["iron"], M["bone"], M["slit"], rivets=M["bone"], vees=vees)
    out += h + GH.antlers(h, M["bone"])
    return out + gauntlet_vees(b, vees=vees)


# ------------------------------------------------------------------ Drakescale Plate

DRAKESET = dict(scale=tint("polished_scale_mid", (60, 106, 58)), bronze="riveted_bands_bronze",
                copper="polished_copper_mid", gold="polished_gold_mid", dark="hammered_steel_dark",
                helm="verdigris_bronze_mid", horn=tint("lib:wood_03_rootwood_grain", (150, 130, 96)),
                cloth=tint("lib:cloth_01_coarse_sail_canvas", (108, 22, 22)), mail="iron_heavy_mail_dark",
                slit=tint("lib:cloth_02_stitched_charcoal", (14, 12, 12)))

drake_gauntlet = gdress({"sleeve": DRAKESET["cloth"], "elbow": DRAKESET["mail"], "under-bracer": "creased_leather_dark",
                         "scales row": DRAKESET["scale"], "* scale": DRAKESET["scale"],
                         "scale couter": DRAKESET["copper"], "drake plate": DRAKESET["copper"],
                         "* knuckle spike": DRAKESET["horn"], "glove": "creased_leather_dark"},
                        DRAKESET["scale"])


def drake(b):
    """A dragon-warrior's green scale over bronze-edged plate: a horned spine ridge, a scaled
    skirt, a crimson cape and a bat-winged helm."""
    M = DRAKESET
    vees = (M["gold"], M["dark"])
    knee = float(b.head("LowerLeg.L")[2])
    out = K.cuirass(b, M["scale"], rim=M["copper"], ridge=0.016, point=0.05, vees=vees, box=3)
    fit = out[0]["fit"]
    ts = np.linspace(b.waist + 0.02, b.neck - 0.05, 14)
    base = [fit.point(t, math.pi, fit.radius(t, math.pi) + 0.022) for t in ts]
    out.append(O.fin("spine ridge", base, fit.dir(math.pi), lambda s: 0.03 + 0.04 * math.sin(math.pi * s),
                     0.008, M["horn"], K.CUIRASS, teeth=8))
    faulds, bottom = K.fauld(b, M["scale"], box=3, rim=M["copper"])
    out += faulds
    sf = G.body_fit(b, bottom - 0.25, bottom + 0.05, hard=0.06)
    for k in range(3):
        hi = bottom + 0.01 - 0.06 * k
        out.append(O.scales(sf, f"scaled skirt {k + 1}", hi - 0.07, hi, 0.03 + 0.008 * k, M["scale"],
                            K.CUIRASS, teeth=16, depth=0.022))
    out += G.belt(b, "creased_leather_dark", gap=0.04, h=0.05,
                  buckle=lambda nm, p, d, up: K.rondel(nm, p, d, up, 0.07, M["gold"], M["dark"]))
    out += G.cape(b, M["cloth"], knee - 0.2, width=1.2, gap=0.075, flare=0.12, rim=M["copper"])
    out.append(K.vee("cape", *back_of(b.waist + 0.1), (0, 0, 1), 0.24, *vees, name="V on the cape"))
    for s in "LR":
        pa = K.pauldron(b, s, M["scale"], lames=3, rim=M["copper"], gap=0.04, reach=0.085, box=3,
                        lame_rims=True)
        pa += O.spikes(pa[0]["fit"], [(-0.02, 0.0), (0.0, 0.6)], 0.09, 0.016, M["horn"], pa[0]["w"],
                       off=0.05, tilt=0.5, name=f"horn spike {s}")
        out += pa + [rondel_on(pa, M["gold"], M["dark"])]
        out += K.rerebrace(b, s, M["scale"], box=2.5, rim=M["copper"])
        out += K.poleyn(b, s, M["copper"], rim=M["gold"], boss=(M["gold"], M["dark"]))
        out += K.greave(b, s, M["scale"], rim=M["copper"], ridge=0.012, vees=vees, box=3)
        out += K.sabaton(b, s, M["copper"])
    h = GH.great_helm(b, M["helm"], M["copper"], M["slit"], rivets=M["gold"], vees=vees)
    out += h + GH.bat_wings(h, M["scale"])
    return out + gauntlet_vees(b, vees=vees)


# ------------------------------------------------------------------ Runebound Regalia

RUNE = dict(robe=tint("lib:cloth_01_coarse_sail_canvas", (52, 30, 76)), robe2=tint("lib:cloth_05_deep_plum_woven_sail", (40, 24, 60)),
            silver="burnished_steel_light", silver2="brushed_steel_mid",
            crystal=tint("polished_copper_light", (150, 206, 255)),
            slit=tint("lib:cloth_02_stitched_charcoal", (14, 12, 12)))

runebound_gauntlet = gdress({"robe sleeve": RUNE["robe2"], "elbow": RUNE["robe2"], "cloth bracer": RUNE["robe"],
                             "silver band": RUNE["silver"], "silver mount": RUNE["silver"],
                             "focus crystal": RUNE["crystal"], "glove": RUNE["robe"]}, RUNE["robe"])


def runebound(b):
    """A battle-mage's regalia: a violet robe split for the stride, silver embroidery, a
    mantle, small silver spaulders and a silver great helm under a crystal-knobbed ring."""
    M = RUNE
    vees = (M["crystal"], M["silver"])
    hem = float(b.head("LowerLeg.L")[2]) - 0.3
    out = G.coat(b, M["robe"], hem, gap=0.025, flare=0.1, splits=(0.0, math.pi), split_w=0.12,
                 hard=0.06, name="robe", rim=M["silver"])
    out += embroider(b, "robe", M["silver"], b.waist - 0.02, hem + 0.05, xs=(-0.14, 0.14))
    out.append(K.vee("robe", *front_of(b.waist + 0.17), (0, 0, 1), 0.15, *vees, name="V on the breast"))
    out.append(O.sigil("robe", *back_of(b.waist + 0.13), (0, 0, 1), 0.24, name="sigil on the back"))
    out += G.mantle(b, M["robe2"], gap=0.05, rim=M["silver"])
    out += G.belt(b, M["silver2"], gap=0.05, h=0.045,
                  buckle=lambda nm, p, d, up: K.rondel(nm, p, d, up, 0.07, M["silver"], M["robe2"], v=M["crystal"]))
    for s in "LR":
        pa = K.pauldron(b, s, M["silver"], lames=2, rim=M["silver2"], gap=0.06, reach=0.07, box=3,
                        lame_rims=True)
        out += pa + [rondel_on(pa, M["silver"], M["robe2"])]
    h = GH.great_helm(b, M["silver"], M["silver2"], M["slit"], rivets=M["crystal"], vees=vees)
    out += h + GH.ring_arch(h, M["silver"], knob=M["crystal"])
    return out + gauntlet_vees(b, vees=vees)


SETS = {
    "knight": dict(name="Knight's Hourglass Harness", gauntlet="knight",
                   under=dict(body="bright_fine_mail_mid", feet="pebbled_leather_dark"),
                   build=knight, gauntlet_dress=knight_gauntlet,
                   description="Full plate in the manner of the great crusader harnesses: a fluted breastplate "
                               "with a dark inlaid panel under Lord Velscour's gold V, big lamed pauldrons "
                               "with upright neck guards and V rondels, brass-edged faulds and tassets, "
                               "V-bossed knee cops, a crimson cape bearing his V, and a riveted great helm "
                               "with a cross of bands, eye slits and round breaths."),
    "templar": dict(name="Gilded Templar Plate", gauntlet="templar",
                    under=dict(body=TEMPLAR["mail"], feet="pebbled_leather_dark"),
                    build=templar, gauntlet_dress=templar_gauntlet,
                    description="Holy plate for Lord Velscour: polished steel rimmed in gold, a blue-enamel "
                                "breast panel under his gold V, blue enamel rondels at the shoulders and knees, "
                                "a royal blue tabard and cape with gold embroidery and his V, and a great helm "
                                "with a gilded fleury cross and keyhole breaths."),
    "mailed": dict(name="Hauberk of the Vigil", gauntlet="mailed",
                   under=dict(body=MAILED["mail"], feet=MAILED["leather"]),
                   build=mailed, gauntlet_dress=mailed_gauntlet,
                   description="A knee-length mail hauberk under a crimson tabard embroidered in gold with "
                               "Lord Velscour's V front and back, gold-rimmed square spaulders with crimson V "
                               "rondels, V-bossed knee cops, high boots and a tall tapered great helm."),
    "wayfarer": dict(name="Wayfarer's Brigandine", gauntlet="wayfarer",
                     under=dict(body=WAYFARER["wool"], legs=WAYFARER["leather"], feet=WAYFARER["dark"]),
                     build=wayfarer, gauntlet_dress=wayfarer_gauntlet,
                     description="A road-worn brigandine of studded leather over dark red wool, Lord Velscour's "
                                 "sigil across a ragged travelling cloak and his copper V on the breast, belt, "
                                 "rondels, shins and helm: square iron spaulders, iron rerebraces and greaves, "
                                 "and a great helm with a pair of crest boards."),
    "brawler": dict(name="Pit Fighter's Harness", gauntlet="brawler",
                    under=dict(body=BRAWLER["dark"], feet=BRAWLER["dark"]),
                    build=brawler, gauntlet_dress=brawler_gauntlet,
                    description="An arena champion's harness for Lord Velscour's pits: a studded leather vest "
                                "with his sigil on the back and his copper V where its iron straps cross, dark "
                                "red pteruges, a wide iron belt, one great spiked iron pauldron, spiked knees "
                                "and a blackened great helm with a shading brow."),
    "fiend": dict(name="Fiend's Panoply", gauntlet="fiend",
                  under=dict(body=FIEND["mail"], feet="pebbled_leather_dark"),
                  build=fiend, gauntlet_dress=fiend_gauntlet,
                  description="Blackened demon-iron edged in gold, sworn to Lord Velscour: his full sigil on "
                              "a silver breast panel and on a crimson cape, a saw-toothed fin down the spine, "
                              "an asymmetric spiked great pauldron, gold-rimmed lames, V-bossed knees, an "
                              "embroidered loincloth, and a black great helm with gold ram's horns and "
                              "slotted breaths."),
    "hunter": dict(name="Warden's Leathers", gauntlet="hunter",
                   under=dict(body=HUNTER["green"], legs=HUNTER["leather"], feet=HUNTER["strap"]),
                   build=hunter, gauntlet_dress=hunter_gauntlet,
                   description="A ranger's layered leather sworn to Lord Velscour: a tooled cuirass "
                               "with his copper V, lamed spaulders with V rondels, verdigris bronze "
                               "edges, a green mantle and cloak, and a slotted great helm."),
    "boneward": dict(name="Bone-Ward Harness", gauntlet="boneward",
                     under=dict(body=BONEW["hide2"], feet=BONEW["hide"]),
                     build=boneward, gauntlet_dress=boneward_gauntlet,
                     description="Dark hide bound with bone ribs and Lord Velscour's full sigil on an "
                                 "iron plate, tusked bone pauldrons, a fur mantle, hide strips, and "
                                 "an antlered great helm."),
    "drake": dict(name="Drakescale Plate", gauntlet="drake",
                  under=dict(body=DRAKESET["mail"], feet="creased_leather_dark"),
                  build=drake, gauntlet_dress=drake_gauntlet,
                  description="Green drake scale over copper-edged plate with Lord Velscour's gold Vs: "
                              "a horned spine ridge, a scaled skirt, horn-spiked pauldrons, a crimson "
                              "cape, and a bronze great helm with scaled bat wings."),
    "runebound": dict(name="Runebound Regalia", gauntlet="runebound",
                      under=dict(body=RUNE["robe2"], feet=RUNE["robe"]),
                      build=runebound, gauntlet_dress=runebound_gauntlet,
                      description="A battle-mage's violet robe with silver embroidery and Lord "
                                  "Velscour's crystal V and sigil, a mantle, silver spaulders, and a "
                                  "silver great helm under a crystal-knobbed ring."),
}
