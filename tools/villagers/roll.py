"""Roll a random male villager: python roll.py <seed>  ->  villager.py's JSON config on stdout."""
import json, random, sys

# face atlas -> (race/age blend, eyes he might have)
FACES = {
    '01_Fair_Skin': ({'caucasian-male-young': 1.0}, ['blue', 'grey', 'bluegreen', 'brownlight']),
    '02_Tan_Skin': ({'caucasian-male-young': 0.7, 'asian-male-young': 0.15, 'african-male-young': 0.15}, ['brown']),
    '03_Weathered_Veteran': ({'caucasian-male-young': 0.6, 'caucasian-male-old': 0.4}, ['brown', 'grey']),
    '04_Dark_Stubble': ({'caucasian-male-young': 0.85, 'caucasian-male-old': 0.15}, ['brown', 'brownlight']),
    '05_Scarred_Warrior': ({'caucasian-male-young': 0.7, 'caucasian-male-old': 0.3}, ['grey', 'brown']),
    '06_Freckled_Redhead': ({'caucasian-male-young': 1.0}, ['green', 'blue', 'bluegreen']),
    '07_Olive_Skin': ({'caucasian-male-young': 0.6, 'asian-male-young': 0.25, 'african-male-young': 0.15}, ['brown']),
    '08_Nordic_Pale': ({'caucasian-male-young': 1.0}, ['lightblue', 'blue', 'grey']),
    '09_Tattooed_Berserker': ({'caucasian-male-young': 0.8, 'caucasian-male-old': 0.2}, ['grey', 'brown']),
    '10_Deep_Brown_Skin': ({'african-male-young': 1.0}, ['brown']),
}
# the shape of his face: (less, more) target pairs, each nudged a little either way
DETAIL = [('nose-scale-horiz-decr', 'nose-scale-horiz-incr'), ('nose-hump-lesshump', 'nose-hump-morehump'),
          ('nose-point-width-less', 'nose-point-width-more'), ('nose-scale-vert-decr', 'nose-scale-vert-incr'),
          ('nose-volume-point', 'nose-volume-potato'), ('chin-prominent-less', 'chin-prominent-more'),
          ('chin-width-min', 'chin-width-max'), ('chin-jaw-drop-less', 'chin-jaw-drop-more'),
          ('head-oval', 'head-square'), ('head-scale-horiz-less', 'head-scale-horiz-more'),
          ('mouth-scale-horiz-decr', 'mouth-scale-horiz-incr'), ('mouth-upperlip-volume-deflate', 'mouth-upperlip-volume-inflate'),
          ('eyebrows-trans-depth-less', 'eyebrows-trans-depth-more'), ('forehead-scale-vert-less', 'forehead-scale-vert-more'),
          (('l-cheek-bones-in', 'r-cheek-bones-in'), ('l-cheek-bones-out', 'r-cheek-bones-out')),
          (('l-ear-size-small', 'r-ear-size-small'), ('l-ear-size-big', 'r-ear-size-big')),
          (('l-ear-flap-in', 'r-ear-flap-in'), ('l-ear-flap-out', 'r-ear-flap-out'))]
# what a man of Bellmourn wears over his shirt, and on his legs and feet
JACKETS = [['quilted_red', 1.0, 0.42], ['quilted_blue', 1.0, 0.42], ['linen_teal', 1.0, 0.32],
           ['leather_tooled', 0.9, 0.42], ['damask_red', 1.0, 0.42], ['damask_purple', 1.0, 0.42]]
SHIRTS = [['linen_brown', 1.0, 0.3], ['linen_brown', 1.15, 0.3], ['burlap_coarse', 1.0, 0.3], ['linen_teal', 0.9, 0.3]]
TROUSERS = [['burlap_dark', 1.0, 0.3], ['burlap_coarse', 0.85, 0.3], ['linen_brown', 0.7, 0.3], ['burlap_dark', 0.8, 0.3]]
LEATHER = [['leather_strapwork', 1.0, 0.3], ['leather_tooled', 1.0, 0.3]]
BOOTS = [['leather_strapwork', 0.8, 0.3], ['leather_tooled', 0.9, 0.3], ['leather_strapwork', 0.65, 0.3]]


def roll(seed):
    R = random.Random(seed)
    face = R.choice(list(FACES))
    morph, eyes = FACES[face]
    morph = dict(morph)
    for less, more in R.sample(DETAIL, 8):
        w = R.uniform(-0.55, 0.55)
        for t in ((more,) if isinstance(more, str) else more) if w > 0 else ((less,) if isinstance(less, str) else less):
            morph[t] = round(abs(w), 3)
    jacket = R.choice(JACKETS)
    shirt = R.choice([s for s in SHIRTS if s[0] != jacket[0]])
    return {
        'seed': seed, 'face': face, 'morph': morph, 'eye': R.choice(eyes),
        'iris_tint': [0.5, round(R.uniform(0.6, 0.8), 2), round(R.uniform(0.65, 0.85), 2)],
        'dress': {'Green': jacket, 'LightGreen': shirt, 'Brown': R.choice(TROUSERS), 'Brown2': R.choice(LEATHER),
                  'Grey': R.choice(BOOTS), 'Black': ['leather_tooled', 0.45, 0.25]},
        'line': round(R.uniform(-0.06, 0.08), 3), 'scale': round(R.uniform(1.0, 1.07), 3),
    }


if __name__ == '__main__':
    print(json.dumps(roll(int(sys.argv[1]))))
