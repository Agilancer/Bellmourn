"""The monsters: which painted sheet, which layout spec, and how the sculpt and grade differ.

v       sculpt switches (sdf.V): mouth zombie / fangs / slit; lids heavy / open; nose rotted /
        none; crown (caved-in skull), tear (torn cheek); bloat (gut and puffiness), bulk
        (muscle), claws (nail length).
grade   bake extras: trickle (blood from the crown), glow (emissive cracks), rough (roughness
        multiplier, < 1 is wet), tint (whole-skin multiplier).
rags    loincloth tint, or None for no loincloth.
"""

_S = "art/creatures/monsters/sheet_{}.webp"
_PLAIN = dict(crown=False, tear=False, brow=0.65, claws=2.0, teeth=1.45, gape=1.2, dome=0.9, shoulder=1.0, bony=1.0,
              lips=0.7, teeth_fwd=0.004)
# new monsters: a lighter brow and lower dome so the face reads hunched, hooked claws, big teeth, a wider gape
_EYES = dict(eye_fwd=0.002, eye_scale=1.08, finger=0.8)

MONSTERS = {
    "zombie": dict(sheet="art/creatures/zombie_skin.webp", spec="zombie",
                   v=dict(mouth="zombie", lids="heavy", nose="rotted", crown=True, tear=True),
                   grade=dict(trickle=True), rags=(1.0, 1.0, 1.0)),
    "veinwretch": dict(sheet=_S.format(2), spec="veinwretch", v=dict(_PLAIN, lids="open", cheeks=True, ropes=1.9, nose="skull", hollow=1.0), rags=(0.8, 0.62, 0.6),
                       wounds=[("face", 252, 192, 0.0135, 0.018), ("face", 448, 192, 0.0135, 0.018), ("front", 505, 548, 0.022, 0.02)],
                       grade=dict(dark=1.0, rot=0.15, soot=0.35, vein=0.6, eyeglow=0.8, eyecol=(1.0, 0.8, 0.25), tint=(1.05, 1.0, 1.05), mouthdark=0.7)),
    # sheet 3: chalky corpse bound in rope, rotted blue rags
    "ropebound": dict(sheet=_S.format(3), spec="ropebound", v=dict(_PLAIN, lids="heavy"), rags=(0.9, 1.2, 1.75),
                      grade=dict(tint=(1.08, 1.02, 0.94)),
                      extras=dict(cols=dict(rope=(0.36, 0.32, 0.25)),
                                  wraps=[("lowerarm", 0.74, 0.97, 3.2, 0, 0.012, "rope", 1), ("lowerarm", 0.22, 0.4, 1.8, 0, 0.01, "rope", 0),
                                         ("calf", 0.05, 0.17, 1.8, 0, 0.012, "rope", 0), ("calf", 0.8, 0.95, 2.4, 0, 0.012, "rope", 1),
                                         ("spine_01", -0.2, 0.2, 2.2, 0, 0.014, "rope", 2), ("neck_01", 0.25, 0.6, 1.3, 0, 0.013, "rope", 3)])),
    # sheet 4: parchment-skinned elder, wispy grey hair, sagging folds
    "ancient": dict(sheet=_S.format(4), spec="ancient", v=dict(_PLAIN, lids="open", bloat=0.7), rags=(0.85, 0.8, 0.7),
                    sag=2.2, wattle=1.0, ear=dict(scale=1.3),
                    wounds=[("front", 440, 435, 0.016, 0.018), ("front", 447, 575, 0.02, 0.02), ("front", 322, 700, 0.022, 0.02)],
                    extras=dict(cols=dict(strand=(0.74, 0.7, 0.6)),
                                strands=[dict(centre=(0, 0.02, 1.70), n=70, az=(50, 310), el=(-25, 55), length=(0.1, 0.34),
                                              width=(0.011, 0.018), hug=0.22, lift=0.0008, push=0.1)])),
    # sheet 5: charred crust over molten cracks
    "cinder": dict(sheet=_S.format(5), spec="cinder", v=dict(_PLAIN, lids="open", bulk=0.6), ribs=1.0,
                   grade=dict(glow=1.75, tint=(1.1, 1.0, 0.95), eyehot=1.0, eyeglow=2.6, eyecol=(1.0, 0.7, 0.3)), rags=(0.35, 0.3, 0.28)),
    # sheet 6: the face split by a vertical maw of needles; bony spurs
    "maw": dict(sheet=_S.format(6), spec="maw", v=dict(_PLAIN, mouth="slit", nose="none", lids="heavy", slitw=2.4), spurs=1.5, spur_sites=("shoulder", "scapula", "spine"),
                grade=dict(gullet=0.9, mouthdark=0.75, vein=0.6, ivory=0.85), rags=(0.75, 0.62, 0.62)),
    # sheet 7: dried, linen-wrapped
    "mummy": dict(sheet=_S.format(7), spec="mummy", v=dict(_PLAIN, lids="open"), rags=(1.0, 0.9, 0.72),
                  grade=dict(sat=0.72, rough=1.35),
                  extras=dict(cols=dict(linen=(0.8, 0.71, 0.55)),
                              wraps=[("lowerarm", 0.06, 0.94, 6.0, 0.05, 0.0025, "linen", 2), ("upperarm", 0.25, 0.9, 3.6, 0.052, 0.0025, "linen", 1),
                                     ("thigh", 0.1, 0.9, 5.0, 0.062, 0.003, "linen", 2), ("calf", 0.08, 0.88, 5.4, 0.056, 0.0025, "linen", 1)],
                              rings=[((0.0, 0.025, 1.24), (0.45, 0.0, 0.89), 0.075, 0.0035, "linen", 2),
                                     ((0.0, 0.025, 1.16), (-0.4, 0.0, 0.92), 0.07, 0.0035, "linen", 1),
                                     ((0.0, 0.025, 1.08), (0.32, 0.0, 0.95), 0.07, 0.0042, "linen", 1),
                                     ((0.0, 0.025, 1.33), (-0.3, 0.0, 0.95), 0.07, 0.0042, "linen", 0),
                                     ((0.0, 0.015, 1.70), (0.8, 0.15, 1.0), 0.05, 0.003, "linen", 1),
                                     ((0.0, 0.02, 1.752), (0.0, -0.35, 1.0), 0.05, 0.0036, "linen", 2),
                                     ((0.0, -0.015, 1.68), (0.0, 1.0, 0.3), 0.038, 0.0042, "linen", 0)])),
    # sheet 8: the classic rotter, now with a torn cheek and a window onto the ribs
    "shambler": dict(sheet=_S.format(8), spec="shambler", v=dict(_PLAIN, lids="open", cheeks=True), rags=(0.9, 0.85, 0.75),
                     ear=dict(scale=1.4), grade=dict(vein=0.8, sores=1.0, meat=1.0, ivory=0.5),
                     wounds=[("face", 466, 200, 0.03, 0.03, "cheek"), ("front", 262, 425, 0.05, 0.045, "ribs")]),
    # sheet 9: bloated, waterlogged, barnacled, weed in the hair
    "drowned": dict(sheet=_S.format(9), spec="drowned", v=dict(_PLAIN, lids="open", bloat=0.8, bulk=0.8, bony=0.3), finger=1.0, chestpatch=True,
                    ear=dict(scale=1.5), grade=dict(rough=0.4, bumpkind=1, bed=0.12), rags=(0.55, 0.62, 0.55),
                    bumps=[((0.08, -0.06, 1.36), (0.2, 0.1, 1.47), 14, (0.01, 0.02), True, 4),
                           ((-0.07, -0.02, 1.72), (0.07, 0.1, 1.8), 8, (0.007, 0.013), False, 4),
                           ((0.05, -0.1, 0.2), (0.13, 0.02, 0.45), 10, (0.009, 0.017), True, 5),
                           ((-0.12, 0.06, 1.2), (0.12, 0.14, 1.4), 12, (0.01, 0.019), False, 5)],
                    extras=dict(cols=dict(strand=(0.3, 0.38, 0.18)),
                                strands=[dict(centre=(0, 0.02, 1.70), n=44, az=(40, 320), el=(-10, 60), length=(0.12, 0.32), width=(0.014, 0.026),
                                              hug=0.12, lift=0.005, push=0.35),
                                         dict(centre=(0.13, 0.03, 1.36), n=6, az=(-80, 80), el=(30, 80), length=(0.1, 0.2), width=(0.008, 0.014),
                                              hug=0.1, lift=0.005, push=0.3),
                                         dict(centre=(-0.13, 0.03, 1.36), n=6, az=(-80, 80), el=(30, 80), length=(0.1, 0.2), width=(0.008, 0.014),
                                              hug=0.1, lift=0.005, push=0.3)])),
    # sheet 10: bat-faced, long splayed fangs, big flaring ears
    "ghoul": dict(sheet=_S.format(10), spec="ghoul", v=dict(_PLAIN, mouth="fangs", lids="open", bulk=0.35, claws=2.2, canine=1.75),
                  ear=dict(scale=2.15, point=1.45, tilt=-12, flare=34, taper=1.0, cup=2.2, thin=0.5, sweep=0.85), grade=dict(mouthq=1.0, vein=0.5), rags=(0.6, 0.5, 0.55)),
    # sheet 11: jaundiced, mouldering, crowded with boils
    "plague": dict(sheet=_S.format(11), spec="plague", v=dict(_PLAIN, lids="open", bloat=0.3), rags=(0.8, 0.75, 0.5),
                   grade=dict(sat=0.55, green=1.0, rough=1.3, bumpkind=0, tint=(1.0, 1.0, 0.9), rmin=0.72, mould=1.0),
                   bumps=[((-0.08, -0.11, 1.6), (0.08, 0.0, 1.78), 14, (0.003, 0.007), False),
                          ((-0.06, -0.07, 1.48), (0.06, 0.05, 1.58), 12, (0.004, 0.008), False, 3),
                          ((0.05, -0.1, 1.3), (0.2, 0.1, 1.47), 18, (0.007, 0.012), True, 4),
                          ((-0.12, -0.14, 1.0), (0.12, -0.02, 1.3), 16, (0.007, 0.011), False, 4),
                          ((-0.12, 0.05, 1.1), (0.12, 0.16, 1.4), 20, (0.007, 0.012), False, 4),
                          ((0.2, -0.05, 1.15), (0.4, 0.1, 1.38), 10, (0.006, 0.01), True, 3),
                          ((0.05, -0.1, 0.6), (0.16, 0.05, 0.85), 8, (0.006, 0.01), True, 3)]),
}

for _n, _c in MONSTERS.items():
    if _n != "zombie":
        for _k, _v in _EYES.items():
            _c.setdefault(_k, _v)
        _c.setdefault("grade", {}).setdefault("eyeglow", 0.4)
        if _n != "veinwretch":
            _c["grade"].setdefault("mouthq", 1.02)
