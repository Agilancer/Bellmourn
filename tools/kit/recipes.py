"""What happens to each model: its atlas, scale, category, variants and rework recipe.

The recipes are written in Blender's Z-up metres. A model's category comes from its pack and
name; the category's recipe ages it, then the per-model touches in TOUCH add what makes it
Bellmourn's (iron bands on the doors, thorns on the cacti, a skull on the ossuary chest...).
"""
import math
import re

from mathutils import Matrix, Vector

import deform as D

# ------------------------------------------------------------------ atlases and flat colours
ATLAS = {
    'props': [('MI_Trim_Furniture', 'props_furniture'), ('MI_Trim_Metal', 'props_metal'), ('MI_Trim_Props', 'props_props'),
              ('MI_Trim_Cloth', 'props_cloth'), ('MI_Banner', 'props_cloth'), ('MI_Page', 'props_page')],
    'village': [('MI_WoodTrim', 'village_woodtrim'), ('MI_RockTrim', 'village_rocktrim'), ('MI_WindowGlass', 'village_glass'),
                ('MI_MetalOrnaments', 'village_metal'), ('MI_RedBrick', 'village_redbrick'), ('MI_UnevenBrick', 'village_unevenbrick'),
                ('MI_Brick', 'village_brick'), ('MI_Plaster', 'village_plaster'), ('MI_Vine', 'village_vine'), ('MI_RoundTiles', 'village_roundtiles')],
    'nature': [('Bark_NormalTree', 'nature_bark'), ('Bark_DeadTree', 'nature_deadbark'), ('Bark_TwistedTree', 'nature_twistbark'),
               ('Leaves_NormalTree', 'nature_leaves'), ('Leaves_TwistedTree', 'nature_twistleaves'), ('Leaves_Pine', 'nature_pine'),
               ('Leaves', 'nature_foliage'), ('Flowers', 'nature_flowers'), ('Grass', 'nature_grass'), ('Mushrooms', 'nature_mushrooms'),
               ('PathRocks', 'nature_pathrocks'), ('Rocks', 'nature_rocks')],
}
ULTIMATE = {'White': ('bone', 9), 'Black': ('stone', 1), 'Green': ('moss', 4), 'DarkGreen': ('moss', 2), 'Orange': ('blood', 6),
            'LightOrange': ('fire', 5), 'LightWood': ('wood', 5), 'Wood': ('wood', 2), 'Snow': ('sky', 13), 'Berry': ('blood', 5),
            'Pink': ('arcane', 7), 'Yellow': ('gold', 5), 'Cyan': ('venom', 5), 'Coconuts': ('leather', 3), 'Leaves': ('moss', 3),
            'Rock': ('slate', 6), 'Mushroom_Top': ('blood', 4), 'Mushroom_Bottom': ('bone', 7)}
ULTIMATE_BY = [  # per-model overrides: (name pattern, material, (ramp, shade))
    (r'Autumn', 'Green', ('blood', 5)), (r'Autumn', 'DarkGreen', ('blood', 3)), (r'Autumn', 'Orange', ('fire', 4)), (r'Autumn', 'LightOrange', ('fire', 6)),
    (r'Cactus', 'Green', ('venom', 3)), (r'Cactus', 'LightOrange', ('blood', 7)), (r'Cactus', 'Pink', ('arcane', 5)), (r'Cactus', 'Yellow', ('bone', 10)),
    (r'Palm', 'Green', ('earth', 5)), (r'Palm', 'DarkGreen', ('earth', 3)), (r'Corn|Wheat', 'Yellow', ('earth', 7)), (r'Corn', 'Green', ('venom', 4)),
    (r'Willow', 'Green', ('moss', 3)), (r'Willow', 'DarkGreen', ('moss', 1)), (r'Birch', 'Green', ('venom', 4)), (r'Birch', 'DarkGreen', ('venom', 2)),
    (r'Pine', 'Green', ('moss', 2)), (r'Pine', 'DarkGreen', ('moss', 0)), (r'Moss', 'Green', ('moss', 5)), (r'Flowers', 'Cyan', ('arcane', 6)),
    (r'Flowers', 'Yellow', ('bone', 9)), (r'BushBerries', 'Berry', ('blood', 4)),
]
DUNGEON = {'Wall_Dark': ('stone', 2), 'Wall_Medium': ('stone', 4), 'Wall_Highlights': ('stone', 6), 'Wood': ('wood', 4), 'DarkWood': ('wood', 1),
           'Metal': ('iron', 6), 'DarkMetal': ('iron', 2), 'Iron': ('iron', 4), 'Bag': ('leather', 6), 'Thread': ('bone', 6), 'Gold': ('gold', 7),
           'Main': ('blood', 4), 'Grey_Floor': ('stone', 5), 'DarkGrey_Floor': ('stone', 2), 'Cobweb': ('bone', 11), 'Marble': ('bone', 7),
           'Bone': ('bone', 10), 'Statue': ('stone', 6), 'Steel': ('iron', 9), 'LightWood': ('wood', 6), 'LightSteel': ('iron', 11),
           'DarkSteel': ('iron', 4), 'Fire': ('fire', 13), 'Ceramic': ('earth', 5)}


def atlas_for(pack, name, mname):
    base = re.sub(r'\.\d+$', '', mname)
    if pack in ATLAS:
        for key, atlas in ATLAS[pack]:
            if base.startswith(key):
                return atlas, None
        return 'swatch', ('stone', 6)
    if pack == 'trees':
        dead = name.startswith('Dead')
        if base == 'Birch_Bark':
            return ('trees_deadbirch' if dead else 'trees_birchbark'), None
        if base == 'Bark':
            return ('trees_deadbark' if dead else 'trees_bark'), None
        return {'Birch_Leaves': 'trees_birchleaves', 'Pine_Leaves': 'trees_pine', 'Tree_Leaves': 'trees_leaves'}.get(base, 'trees_leaves'), None
    if pack == 'ultimate':
        for pat, mat, paint in ULTIMATE_BY:
            if mat == base and re.search(pat, name):
                return 'swatch', paint
        return 'swatch', ULTIMATE.get(base, ('stone', 6))
    if pack == 'dungeon':
        return 'swatch', DUNGEON.get(base, ('stone', 5))
    return 'swatch', ('stone', 6)


# ------------------------------------------------------------------ categories and scale
CATS = {
    'props': [('light', r'^(Candle|CandleStick|Chandelier|Lantern_Wall|Torch_Metal)'), ('weapon', r'^(Sword|Axe|Pickaxe|Shield)_'),
              ('cloth', r'^Banner'), ('furniture', r'^(Bed|Bench|Bookcase|Cabinet|Chair|Nightstand|Shelf|Stool|Table_Large|Workbench|WeaponStand|Peg_Rack|BookStand|Stall|Dummy|Barrel_Holder)'),
              ('container', r'^(Barrel|Crate|FarmCrate|Chest|Bucket|Cauldron|Pot_|Vase|Bag|Pouch|Cage)'), ('small', r'.')],
    'village': [('wall', r'^(Wall_|Corner_|DoorFrame_)'), ('floor', r'^(Floor_|HoleCover_)'), ('roof', r'^(Roof_|Overhang_|Window_Roof)'),
                ('door', r'^Door_'), ('window', r'^(Window_|WindowShutters_)'), ('stair', r'^(Stair|Balcony)'), ('vine', r'^Prop_Vine'), ('vprop', r'^Prop_')],
    'nature': [('tree', r'^(CommonTree|Pine|DeadTree|TwistedTree)_'), ('rock', r'^Rock_'), ('path', r'^(RockPath|Pebble)_'), ('plant', r'.')],
    'trees': [('tree', r'.')],
    'ultimate': [('tree', r'^(BirchTree|CommonTree|PineTree|Willow|PalmTree)'), ('rock', r'^Rock_'), ('log', r'^(WoodLog|TreeStump)'),
                 ('cactus', r'^Cactus'), ('plant', r'.')],
    'dungeon': [('door', r'^(Arch_Door|Trapdoor)'), ('dwall', r'^(Wall_Modular|WallCover|Decorative_Wall|Arch|Column|Fence_|Floor_|Stairs_|Brick|Pedestal)'),
                ('light', r'^(Torch|Woodfire)'), ('container', r'^(Barrel|Chest|Crate|Bucket|Vase|Bag_|Coin_Pile)'),
                ('furniture', r'^(Chair|Table_|Banner|Sword_WallMount)'), ('small', r'.')],
}


def category(pack, name):
    for cat, pat in CATS.get(pack, []):
        if re.search(pat, name):
            return cat
    return 'composite'


SCALE = {
    'ultimate': [(r'^PalmTree', 2.6), (r'^(BirchTree|CommonTree|PineTree|Willow)', 3.0), (r'^Rock_', 2.6), (r'^(WoodLog|TreeStump)', 2.0),
                 (r'^Cactus', 2.2), (r'^Bush', 1.3), (r'^Corn', 1.2), (r'^Wheat', 1.1), (r'^Flowers', 0.8), (r'^Grass', 0.7), (r'^Lilypad', 1.4), (r'.', 1.0)],
    'trees': [(r'^DeadTree', 1.35), (r'.', 1.25)],
    'nature': [(r'^TwistedTree', 0.9), (r'^(CommonTree|Pine|DeadTree)', 1.1), (r'^Grass', 0.55), (r'^Flower', 0.5), (r'^Clover', 0.6),
               (r'^Plant', 0.8), (r'^Fern', 0.7), (r'.', 1.0)],
}


def scale_for(pack, name):
    for pat, s in SCALE.get(pack, []):
        if re.search(pat, name):
            return s
    return 1.0


def flat_shaded(pack, name):
    return pack in ('ultimate', 'dungeon') or category(pack, name) in ('rock', 'path')


def lod_target(pack, name):
    cat = category(pack, name)
    if cat == 'tree':
        return 450 if pack == 'nature' else 260
    if cat == 'rock' and pack == 'nature':
        return 120
    return 0


def variants(pack, name):
    out = ['']
    if pack == 'village' and (re.match(r'^Wall_(Plaster|UnevenBrick)_(Straight|Window|Door)', name) or re.match(r'^Corner_Exterior_(Brick|Wood)$', name)):
        out.append('ruin')
    if pack == 'village' and re.match(r'^Roof_RoundTiles_\d', name):
        out.append('holed')
    if pack == 'dungeon' and name in ('Column', 'Column2', 'Wall_Modular'):
        out.append('broken')
    if (pack == 'nature' and re.match(r'^CommonTree_\d', name)) or (pack == 'trees' and re.match(r'^(Tree|Birch)_\d', name)):
        out.append('bare')
    return out


# ------------------------------------------------------------------ recipes
def deg(a):
    return math.radians(a)


def r_wall(c):
    bm, rnd = c.bm, c.rnd
    D.warp(bm, 0.03, 0.8, c.seed, keep=(0,))
    D.warp(bm, 0.012, 3.0, c.seed + 9, keep=(0,), axes=(0, 1, 0))
    D.sag(bm, 0, 0.035 + rnd.random() * 0.03, top_only=0.6)
    c.note('masonry bowed off true and bulging, top course sagging')
    if c.variant == 'ruin':
        lo, hi = D.bounds(bm)
        D.jagged_top(bm, rnd, lo.z + (hi.z - lo.z) * (0.4 + rnd.random() * 0.3), 0.45, axis=0, n=4)
        c.note('ruined: the top broken away in a jagged line')
        c.tags.add('ruin')


def r_floor(c):
    D.warp(c.bm, 0.02, 1.4, c.seed, keep=(0, 1), axes=(0.3, 0.3, 1))
    c.note('boards and slabs heaved and sunk unevenly')


def r_roof(c):
    bm, rnd = c.bm, c.rnd
    lo, hi = D.bounds(bm)
    ridge = 0 if hi.x - lo.x > hi.y - lo.y else 1
    D.sag(bm, ridge, 0.1 + 0.12 * rnd.random() * min(1, (hi[ridge] - lo[ridge]) / 6), top_only=0.0)
    D.warp(bm, 0.05, 0.6, c.seed)
    c.note('ridge sagging in the middle, tiles slipped and warped')
    if c.variant == 'holed':
        D.thin(bm, c.faces('village_roundtiles'), 0.1, rnd, cluster=0.9)
        c.note('holed: tiles fallen in, the rafters showing')
        c.tags.add('ruin')


def r_door(c):
    bm, rnd = c.bm, c.rnd
    D.warp(bm, 0.015, 1.2, c.seed)
    lo, hi = D.bounds(bm)
    face = lo.y - 0.012
    for z in (lo.z + (hi.z - lo.z) * 0.22, lo.z + (hi.z - lo.z) * 0.7):
        D.block(bm, (lo.x + 0.04, face - 0.025, z - 0.05), (hi.x - 0.04, face, z + 0.05), c.sw, rnd, 'iron', 3)
        for k in range(5):
            x = lo.x + 0.1 + (hi.x - lo.x - 0.2) * k / 4
            D.lump(bm, (x, face - 0.03, z), 0.022, c.sw, rnd, 'iron', 6, flat=1.0, sub=1)
    c.note('warped planks, two black iron straps studded with nails')


def r_window(c):
    D.warp(c.bm, 0.02, 1.2, c.seed)
    if 'Shutters' in c.name:
        D.lean(c.bm, deg(c.rnd.uniform(-3, 3)), 0)
        c.note('shutters hanging crooked')
    c.note('frames twisted off square, glass gone to amber murk')


def r_stair(c):
    D.warp(c.bm, 0.02, 1.0, c.seed)
    D.chip_corner(c.bm, c.rnd, 0.12)
    c.note('treads worn and sagging, a corner broken off')


def r_vine(c):
    D.droop(c.bm, 0.15, 0.0)
    D.thin(c.bm, list(c.bm.faces), 0.25, c.rnd)
    c.note('withered: a quarter of the leaves dropped, the rest hanging')


def r_vprop(c):
    bm, rnd, n = c.bm, c.rnd, c.name
    D.warp(bm, 0.025, 1.0, c.seed)
    if 'Fence' in n:
        D.lean(bm, deg(rnd.uniform(-5, 5)), deg(rnd.uniform(-4, 4)))
        if 'Metal' in n:
            for p in D.top_points(bm, 0.93, 0.1):
                D.spike(bm, p, 0.16, 0.025, c.sw, rnd, 'iron', 3)
            c.note('railings crowned with iron spikes')
        else:
            D.thin(bm, list(bm.faces), 0.06, rnd, cluster=0.25)
            c.note('palings missing')
        c.note('leaning, half fallen')
    elif 'Wagon' in n:
        D.lean(bm, 0, deg(4))
        D.chip_corner(bm, rnd, 0.35)
        c.note('a corner of the bed smashed, the whole cart listing')
    elif 'Chimney' in n:
        D.lean(bm, deg(rnd.uniform(-4, 4)), deg(rnd.uniform(-3, 3)))
        lo, hi = D.bounds(bm)
        D.lump(bm, ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, hi.z), 0.12, c.sw, rnd, 'stone', 1, flat=0.5)
        c.note('stack leaning, soot caked round its mouth')
    else:
        D.lean(bm, deg(rnd.uniform(-3, 3)), deg(rnd.uniform(-3, 3)))
        D.chip_corner(bm, rnd, 0.1)
        c.note('knocked askew and chipped')


def r_tree(c):
    bm, rnd, n = c.bm, c.rnd, c.name
    lo, hi = D.bounds(bm)
    h = hi.z - lo.z
    dead = bool(re.search(r'Dead', n)) or c.variant == 'bare'
    D.gnarl(bm, h * (0.05 if not dead else 0.09), c.seed)
    D.twist(bm, rnd.uniform(0.15, 0.55) * (1.6 if dead else 1))
    D.lean(bm, deg(rnd.uniform(-5, 5)), deg(rnd.uniform(-5, 5)))
    leaves = [f for f in bm.faces if re.search(r'leaves|pine|foliage', bm_mat(c, f), re.I)]
    sw_leaves = [f for f in bm.faces if f.material_index == c.sw]
    if c.variant == 'bare':
        D.thin(bm, leaves, 1.0, rnd)
        c.note('stripped bare: every leaf gone, a dead tree')
    else:
        D.droop(bm, 0.012 * (3 if 'Willow' in n else 1) * (6 / max(4, h)), 0.35)
        if leaves:
            D.thin(bm, leaves, rnd.uniform(0.15, 0.35), rnd)
        if c.pack == 'ultimate' and not dead:
            D.thin(bm, [f for f in sw_leaves if f.calc_center_median().z > lo.z + h * 0.45], rnd.uniform(0.05, 0.15), rnd)
        c.note('canopy thinned and drooping, a sick, hanging crown')
    c.note('trunk knotted, wrung round and leaning')
    c.tags.add('tree')
    if dead:
        c.tags.add('dead')


def bm_mat(c, f):
    for k, v in c.mats.items():
        if v == f.material_index:
            return k
    return ''


def r_rock(c):
    bm, rnd = c.bm, c.rnd
    lo, hi = D.bounds(bm)
    s = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    sx, sy, sz = rnd.uniform(0.8, 1.25), rnd.uniform(0.8, 1.25), rnd.uniform(0.75, 1.6)
    for v in bm.verts:
        v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
    D.warp(bm, s * 0.08, 1.8 / s, c.seed)
    D.lean(bm, deg(rnd.uniform(-8, 8)), deg(rnd.uniform(-8, 8)))
    for v in bm.verts:
        v.co.z = max(v.co.z, lo.z - 0.05)
    if c.pack == 'ultimate' and 'Snow' not in c.name:
        tops = [f for f in bm.faces if f.normal.z > 0.75]
        D.paint(bm, tops[: max(1, len(tops) // 2)], 'moss', 3, rnd)
        c.note('moss on its crown')
    c.note('reshaped jagged and leaning, crags pushed out')
    c.tags.add('rock')


def r_path(c):
    D.warp(c.bm, 0.02, 2.0, c.seed, axes=(0.5, 0.5, 1))
    c.note('stones heaved and settled')


def r_plant(c):
    bm, rnd, n = c.bm, c.rnd, c.name
    lo, hi = D.bounds(bm)
    h = max(0.2, hi.z - lo.z)
    if 'Mushroom' in n:
        for v in bm.verts:
            t = (v.co.z - lo.z) / h
            v.co.x *= 1 + 0.5 * t; v.co.y *= 1 + 0.5 * t; v.co.z *= 1.3
        D.lean(bm, deg(rnd.uniform(-10, 10)), deg(rnd.uniform(-10, 10)))
        c.note('caps swollen wide over long pale stems, leaning')
        return
    if 'Lilypad' in n:
        D.thin(bm, list(bm.faces), 0.12, rnd, cluster=0.15)
        c.note('pads rotted through')
    D.droop(bm, 0.5 / h, 0.2)
    D.twist(bm, rnd.uniform(-0.4, 0.4))
    D.lean(bm, deg(rnd.uniform(-8, 8)), deg(rnd.uniform(-8, 8)))
    if not re.search(r'Grass|Petal|Clover', n):
        D.thin(bm, list(bm.faces), 0.08, rnd)
    c.note('wilted: stems bowed, leaves hanging and dropping')
    c.tags.add('plant')


def r_log(c):
    bm, rnd = c.bm, c.rnd
    D.warp(bm, 0.05, 1.0, c.seed)
    D.sag(bm, 1, 0.08)
    lo, hi = D.bounds(bm)
    for k in range(3 + rnd.randrange(3)):
        p = (rnd.uniform(lo.x, hi.x) * 0.6, rnd.uniform(lo.y, hi.y) * 0.8, hi.z - 0.05)
        D.lump(bm, p, rnd.uniform(0.08, 0.18), c.sw, rnd, rnd.choice(['moss', 'moss', 'blood', 'bone']), rnd.choice([3, 4, 6]), flat=0.35)
    c.note('rotting and bowed, shelf fungus and moss along its back')


def r_cactus(c):
    bm, rnd = c.bm, c.rnd
    D.twist(bm, rnd.uniform(0.3, 0.8))
    D.lean(bm, deg(rnd.uniform(-7, 7)), deg(rnd.uniform(-7, 7)))
    body = [f for f in bm.faces if f.calc_area() > 0.002 and abs(f.normal.z) < 0.8]
    for f in rnd.sample(body, min(len(body), 40)):
        nrm = f.normal.copy()
        nrm.z += 0.35
        D.spike(bm, f.calc_center_median(), 0.07, 0.012, c.sw, rnd, 'bone', 10, segs=3, dir=nrm)
    c.note('wrung into a spiral, bristling with pale thorns: a thornspire')
    c.tags.add('plant')


def r_furniture(c):
    bm, rnd, n = c.bm, c.rnd, c.name
    lo, hi = D.bounds(bm)
    long_ax = 0 if hi.x - lo.x > hi.y - lo.y else 1
    D.warp(bm, 0.012, 2.0, c.seed)
    if re.search(r'Bed', n):
        D.sag(bm, long_ax, 0.09, top_only=0.3)
        c.note('the mattress sunk in the middle')
    elif re.search(r'Table|Bench|Workbench|Shelf|Stall|Nightstand', n):
        D.sag(bm, long_ax, 0.03 + 0.03 * rnd.random(), top_only=0.5)
        c.note('top bowed under years of weight')
    if 'Banner' in n:
        r_cloth(c)
        return
    D.lean(bm, deg(rnd.uniform(-2.5, 2.5)), deg(rnd.uniform(-2.5, 2.5)))
    if not re.search(r'Stall|Dummy', n):
        D.chip_corner(bm, rnd, 0.07)
    if 'Dummy' in n:
        for p in D.top_points(bm, 0.75, 0.25)[:4]:
            D.spike(bm, p, 0.22, 0.02, c.sw, rnd, 'iron', 3)
        c.note('the training dummy stuck with iron nails')
    if re.search(r'Chair|Stool', n):
        D.lean(bm, deg(4), 0)
        c.note('one leg short, rocking')
    c.note('wood shrunk and warped, a corner knocked off')


def r_container(c):
    bm, rnd, n = c.bm, c.rnd, c.name
    lo, hi = D.bounds(bm)
    D.warp(bm, 0.012, 2.0, c.seed)
    if re.search(r'Barrel|Bucket|Pot_|Vase|Bag|Pouch', n):
        D.bulge(bm, 0.05)
        c.note('staves bulging')
    if re.search(r'Crate|Chest', n):
        D.chip_corner(bm, rnd, 0.09)
        c.note('a corner split')
    if re.search(r'Chest', n):
        cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
        D.block(bm, (cx - 0.07, lo.y - 0.02, lo.z + 0.05), (cx + 0.07, lo.y, hi.z * 0.75), c.sw, rnd, 'iron', 2)
        D.lump(bm, (cx, lo.y - 0.03, hi.z * 0.62), 0.05, c.sw, rnd, 'iron', 7, flat=1.0)
        c.note('an iron hasp and a heavy lock')
    if re.search(r'Vase|Pot_1$', n):
        D.chip_corner(bm, rnd, 0.06)
        c.note('the rim broken')
    if re.search(r'Cauldron', n):
        for k in range(6):
            a = k / 6 * math.tau
            D.lump(bm, (math.cos(a) * (hi.x - lo.x) * 0.42, math.sin(a) * (hi.y - lo.y) * 0.42, hi.z * 0.8), 0.06, c.sw, rnd, 'stone', 0, flat=0.6)
        c.note('soot crusted under the rim')
    if re.search(r'Cage', n):
        D.lean(bm, deg(6), 0)
        c.note('bars bent')
    D.lean(bm, deg(rnd.uniform(-2, 2)), deg(rnd.uniform(-2, 2)))


def r_light(c):
    bm, rnd, n = c.bm, c.rnd, c.name
    lo, hi = D.bounds(bm)
    D.warp(bm, 0.006, 4.0, c.seed)
    if c.pack == 'dungeon':
        fire = fire_faces(c)
        if fire:
            p = sum((f.calc_center_median() for f in fire), Vector()) / len(fire)
            c.flames.append(tuple(p))
        D.lean(bm, deg(rnd.uniform(-4, 4)), 0)
        c.note('iron pitted, the flame a brand of embers')
    elif re.search(r'Chandelier', n):
        D.twist(bm, 0.25)
        caps = [f for f in bm.faces if f.normal.z > 0.9 and f.calc_area() < 0.006]
        pts = {}
        for f in caps:
            p = f.calc_center_median()
            if p.z < lo.z + (hi.z - lo.z) * 0.15 or p.z > lo.z + (hi.z - lo.z) * 0.8:
                continue
            k = (round(p.x / 0.12), round(p.y / 0.12))
            if k not in pts or pts[k].z < p.z:
                pts[k] = p
        tops = sorted(pts.values(), key=lambda p: -p.z)
        zc = tops[0].z if tops else hi.z
        for p in tops:
            if abs(p.z - zc) < 0.08:
                c.flames.append((p.x, p.y, p.z + 0.04))
                D.drips(bm, (p.x, p.y), 0.025, p.z, 3, c.sw, rnd)
        c.note('hung askew, candles guttered with wax runs')
    elif re.search(r'Lantern', n):
        far = max(bm.verts, key=lambda v: abs(v.co.y)).co.y
        cage = [v.co for v in bm.verts if abs(v.co.y) > abs(far) * 0.72]
        if cage:
            cz = min(p.z for p in cage) + 0.2
            c.flames.append((sum(p.x for p in cage) / len(cage), sum(p.y for p in cage) / len(cage), cz))
        D.sag(bm, 1, 0.04)
        c.note('the arm bent under the lantern, rust in the joints')
    else:
        tops = D.top_points(bm, 0.93, 0.08)
        for p in tops:
            c.flames.append((p[0], p[1], p[2] + 0.03))
            if re.search(r'Candle', n):
                D.drips(bm, (p[0], p[1]), 0.03, p[2], 4, c.sw, rnd)
        D.lean(bm, deg(rnd.uniform(-5, 5)), deg(rnd.uniform(-5, 5)))
        c.note('melted down crooked, wax run down its sides' if 'Candle' in n else 'iron cup blackened and bent')
    c.tags.add('light')


def fire_faces(c):
    lay = c.bm.faces.layers.int.get('orig_mat')
    if not lay:
        return []
    return [f for f in c.bm.faces if c.orig_names[f[lay]].startswith('Fire')] if hasattr(c, 'orig_names') else []


def r_weapon(c):
    bm, rnd, n = c.bm, c.rnd, c.name
    lo, hi = D.bounds(bm)
    D.warp(bm, 0.004, 6.0, c.seed)
    if 'Sword' in n:
        base = lo.z + (hi.z - lo.z) * 0.3
        for v in bm.verts:  # a longer, narrower blade
            if v.co.z > base:
                v.co.z = base + (v.co.z - base) * 1.18
                v.co.x *= 0.85
        lo, hi = D.bounds(bm)
        notches = [lo.z + (hi.z - lo.z) * f for f in (0.48, 0.6, 0.71, 0.83)]
        for v in bm.verts:  # hacked notches: edge points pushed in where blows landed
            for k, z in enumerate(notches):
                if abs(v.co.z - z) < 0.018 and abs(v.co.x) > abs(hi.x) * 0.45 and (k % 2 == 0) == (v.co.x > 0):
                    v.co.x *= 0.55
        c.note('blade drawn out longer and narrower, the edges hacked with notches')
    elif 'Axe' in n or 'Pickaxe' in n:
        D.spike(bm, (lo.x + 0.02, 0, hi.z - 0.12), 0.14, 0.02, c.sw, rnd, 'iron', 4, tilt=(0, -math.pi / 2))
        D.chop(bm, rnd, Vector((hi.x * 0.8, 0, hi.z - 0.1)), Vector((1, 0, 0.4)).normalized())
        c.note('a back-spike forged on, the bit chipped')
    elif 'Shield' in n:
        D.spike(bm, ((lo.x + hi.x) / 2, lo.y - 0.01, (lo.z + hi.z) / 2), 0.12, 0.05, c.sw, rnd, 'iron', 4, tilt=(math.pi / 2, 0))
        D.chip_corner(bm, rnd, 0.12)
        c.note('an iron boss spike, a bite taken out of the rim')
    c.tags.add('weapon')


def r_cloth(c):
    bm, rnd = c.bm, c.rnd
    lo, hi = D.bounds(bm)
    cloth = c.faces('props_cloth') or list(bm.faces)
    D.thin(bm, cloth, 0.05, rnd, cluster=0.12)
    # a ragged hem: tilted cuts across the bottom of the hanging
    cut = lo.z + (hi.z - lo.z) * 0.18
    for k in range(4):
        x = lo.x + (hi.x - lo.x) * (k + rnd.random()) / 4
        D.chop(bm, rnd, Vector((x, 0, cut + rnd.uniform(-0.1, 0.15))), Vector((rnd.uniform(-1.2, 1.2), 0, -1)).normalized())
    D.sag(bm, 0, 0.05)
    c.note('torn: a ragged hem and moth holes')


def r_small(c):
    bm, rnd, n = c.bm, c.rnd, c.name
    lo, hi = D.bounds(bm)
    s = max(0.1, (hi - lo).length)
    D.warp(bm, 0.008 * s, 6.0 / s, c.seed)
    D.lean(bm, deg(rnd.uniform(-4, 4)), deg(rnd.uniform(-4, 4)))
    if 'Cobweb' in n:
        D.droop(bm, 0.25, 0.0)
        D.thin(bm, list(bm.faces), 0.25, rnd, cluster=0.12)
        c.note('torn and hanging heavy with dust')
    elif n == 'Spikes' or n == 'Trap_spikes':
        tips = [f for f in bm.faces if f.calc_center_median().z > lo.z + (hi.z - lo.z) * 0.6]
        for f in tips:
            f.material_index = c.sw
        D.paint(bm, tips, 'blood', 3, rnd)
        c.note('tips crusted black with old blood')
    elif 'Statue' in n:
        D.chop(bm, rnd, Vector((0, (lo.y + hi.y) / 2, lo.z + (hi.z - lo.z) * 0.86)), Vector((0.25, -0.35, 1)).normalized())
        D.lean(bm, deg(5), deg(3))
        c.note('the rider gone, the horse broken at the neck and tilting')
    elif 'Skull' in n:
        for v in bm.verts:
            v.co.z *= 1.08
            v.co.x *= 0.94
        c.note('narrowed and elongated')
    elif re.search(r'Book|Scroll', n):
        D.twist(bm, 0.12)
        c.note('pages swollen and warped')
    else:
        c.note('dented, worn and tilted')


def r_dwall(c):
    bm, rnd, n = c.bm, c.rnd, c.name
    lo, hi = D.bounds(bm)
    if re.search(r'Wall_Modular|WallCover|Floor_Modular|Fence|Stairs', n):
        D.warp(bm, 0.03, 1.0, c.seed, keep=(0,) if 'Floor' not in n else (0, 1))
    else:
        D.warp(bm, 0.035, 0.9, c.seed)
    if 'Arch' in n and 'bars' not in n:
        D.sag(bm, 0, 0.08, top_only=0.55)
        c.note('the keystone slipped, the arch sagging')
    if 'Column' in n or 'Pedestal' in n:
        D.lean(bm, deg(rnd.uniform(-2, 2)), deg(rnd.uniform(-2, 2)))
        D.chip_corner(bm, rnd, 0.18)
    if 'Fence' in n:
        D.lean(bm, deg(rnd.uniform(-4, 4)), 0)
    if 'Floor' in n:
        D.thin(bm, list(bm.faces), 0.03, rnd, cluster=0.2)
        c.note('flags cracked and missing')
    if c.variant == 'broken':
        D.jagged_top(bm, rnd, lo.z + (hi.z - lo.z) * rnd.uniform(0.35, 0.65), 0.35, axis=0, n=3)
        c.note('broken: shattered off partway up')
        c.tags.add('ruin')
    c.note('stone heaved off true and chipped')


TOUCH = {}  # extra per-model touches: (pack, name) -> fn(ctx)

RECIPE = {'wall': r_wall, 'floor': r_floor, 'roof': r_roof, 'door': r_door, 'window': r_window, 'stair': r_stair, 'vine': r_vine,
          'vprop': r_vprop, 'tree': r_tree, 'rock': r_rock, 'path': r_path, 'plant': r_plant, 'log': r_log, 'cactus': r_cactus,
          'furniture': r_furniture, 'container': r_container, 'light': r_light, 'weapon': r_weapon, 'cloth': r_cloth, 'small': r_small,
          'dwall': r_dwall}


def apply(c):
    cat = category(c.pack, c.name)
    if cat == 'door' and c.pack == 'dungeon':
        D.warp(c.bm, 0.015, 1.2, c.seed)
        D.lean(c.bm, 0, deg(1.5))
        c.note('boards shrunk from the iron, hanging crooked')
    elif cat in RECIPE:
        RECIPE[cat](c)
    fn = TOUCH.get((c.pack, c.name))
    if fn:
        fn(c)


# ------------------------------------------------------------------ recombined pieces
def X(t=(0, 0, 0), rz=0.0, s=(1, 1, 1), rx=0.0, ry=0.0):
    return Matrix.Translation(Vector(t)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Diagonal((*s, 1))


COMPOSITES = [
    # (id, [(pack, model, variant, matrix)], notes, tags, flames)
    ('headstone_rough', [('nature', 'Rock_Medium_2', '', X((0, 0, 0), 0.1, (0.24, 0.07, 0.48)))],
     ['a field rock split into a rough leaning headstone'], ['grave'], []),
    ('headstone_slab', [('dungeon', 'Brick', '', X((0, 0, 0.0), 0.0, (0.95, 0.35, 4.8))), ('dungeon', 'Brick', '', X((0, 0, 0.0), 0, (1.2, 1.0, 0.5)))],
     ['two dungeon bricks: one stood up as a slab, one laid as its footing'], ['grave'], []),
    ('grave_cross', [('village', 'Corner_Exterior_Wood', '', X((0.03, 0.03, 0), 0, (0.32, 0.32, 0.36))), ('village', 'Corner_Exterior_Wood', '', X((-0.33, 0.03, 0.74), 0, (0.28, 0.28, 0.22), ry=math.pi / 2))],
     ['two village corner timbers cut down and nailed into a cross'], ['grave'], []),
    ('grave_obelisk', [('dungeon', 'Pedestal2', '', X((0, 0, 0), 0, (0.4, 0.4, 0.22))), ('dungeon', 'Column2', 'broken', X((0, 0, 0.5), 0.3, (0.28, 0.28, 0.42)))],
     ['a broken dungeon column on a cut-down pedestal'], ['grave'], []),
    ('tomb', [('dungeon', 'Pedestal', '', X((0, 0, 0), 0, (1.05, 0.55, 0.4))), ('dungeon', 'Floor_Modular', '', X((0, 0, 0.92), 0.04, (1.12, 0.62, 0.6))),
              ('dungeon', 'Skull', '', X((0.55, 0, 1.0), 0.6, (0.6, 0.6, 0.6)))],
     ['a dungeon pedestal laid long as a tomb chest, a floor slab for its lid, a skull left on it'], ['grave'], []),
    ('gallows', [('village', 'Corner_Exterior_Wood', '', X((-1.2, 0, 0), 0, (0.6, 0.6, 1.25))), ('village', 'Corner_Exterior_Wood', '', X((1.2, 0, 0), 0, (0.6, 0.6, 1.25))),
                 ('village', 'Roof_Log', '', X((0, 0, 1.75), math.pi / 2, (0.3, 0.27, 0.45))), ('village', 'Prop_Support', '', X((-1.05, 0, 0.6), math.pi / 2, (0.6, 0.6, 0.6))),
                 ('props', 'Rope_2', '', X((0.4, 0, 2.1), 0, (1, 1, 1.4)))],
     ['two village corner timbers for posts, a roof log for the beam, a knee brace, a rope hanging'], ['gallows'], []),
    ('gibbet', [('village', 'Corner_Exterior_Wood', '', X((0, 0, 0), 0, (0.6, 0.6, 1.05))), ('village', 'Corner_Exterior_Wood', '', X((0.05, 0.03, 3.05), 0, (0.4, 0.4, 0.3), ry=math.pi / 2)),
                ('props', 'Cage_Small', '', X((0.75, 0, 1.55), 0.3, (1.3, 1.3, 1.3))), ('dungeon', 'Skull', '', X((0.75, 0, 1.7), 0.2, (0.45, 0.45, 0.45))),
                ('props', 'Chain_Coil', '', X((0.75, 0, 2.6), 0, (0.6, 0.6, 0.6)))],
     ['an iron cage hung by a chain off a timber arm, a skull inside'], ['gallows'], []),
    ('skull_pike', [('village', 'Corner_Exterior_Wood', '', X((0.02, 0.02, 0), 0, (0.22, 0.22, 0.62))), ('dungeon', 'Skull', '', X((0, 0, 1.86), 0.4, (0.5, 0.5, 0.5)))],
     ['a skull spitted on a sharpened post'], ['gallows'], []),
    ('bone_heap', [('dungeon', 'Skull', '', X((0, 0, 0.05), 0.3, (0.6, 0.6, 0.6))), ('dungeon', 'Skull', '', X((0.3, 0.2, 0.0), 2.1, (0.5, 0.5, 0.5))),
                   ('dungeon', 'Skull', '', X((-0.25, 0.25, 0.0), 4.0, (0.55, 0.55, 0.55))), ('ultimate', 'WoodLog', '', X((0, -0.2, 0.02), 1.2, (0.12, 0.35, 0.1)))],
     ['dungeon skulls heaped on a split log gone white as bone'], ['bones'], []),
    ('shrine', [('dungeon', 'Pedestal2', '', X((0, 0, 0), 0, (0.55, 0.55, 0.45))), ('props', 'CandleStick_Triple', '', X((0, 0, 1.04), 0, (1, 1, 1))),
                ('dungeon', 'Skull', '', X((0.32, 0.1, 1.04), 0.4, (0.4, 0.4, 0.4)))],
     ['a cut-down pedestal for an altar, a branched candlestick and an offering skull'], ['light', 'shrine'], []),
    ('ossuary_chest', [('props', 'Chest_Wood', '', X()), ('dungeon', 'Skull', '', X((0, 0, 0.62), 0.2, (0.42, 0.42, 0.42)))],
     ['a chest with a skull set on its lid'], ['container'], []),
    ('well', [('dungeon', 'Fence_Straight_Modular', '', X((0, -0.8, 1.0), 0, (0.8, 1, 0.8))), ('dungeon', 'Fence_Straight_Modular', '', X((0, 0.8, 1.0), math.pi, (0.8, 1, 0.8))),
              ('dungeon', 'Fence_Straight_Modular', '', X((-0.8, 0, 1.0), math.pi / 2, (0.8, 1, 0.8))), ('dungeon', 'Fence_Straight_Modular', '', X((0.8, 0, 1.0), -math.pi / 2, (0.8, 1, 0.8))),
              ('village', 'Corner_Exterior_Wood', '', X((-0.95, 0, 0), 0, (0.5, 0.5, 0.9))), ('village', 'Corner_Exterior_Wood', '', X((0.95, 0, 0), 0, (0.5, 0.5, 0.9))),
              ('village', 'Roof_Wooden_2x1', '', X((0, 0, 2.7), 0, (1.1, 1.0, 0.8))), ('props', 'Bucket_Wooden_1', '', X((0.3, 0.2, 1.05), 0.5, (1, 1, 1)))],
     ['a well-head of dungeon balustrade, timber posts and a shingled hood, a bucket on the rim'], ['well'], []),
    ('woodpile', [('ultimate', 'WoodLog', '', X((0, 0, 0), 0, (0.35, 0.55, 0.35))), ('ultimate', 'WoodLog', '', X((0.45, 0.05, 0), 0.05, (0.35, 0.55, 0.35))),
                  ('ultimate', 'WoodLog', '', X((0.22, 0.02, 0.4), -0.05, (0.35, 0.55, 0.35)))],
     ['three logs cut down and stacked'], ['prop'], []),
    ('haystack', [('ultimate', 'Wheat', '', X((x, y, 0), a, (1.6, 1.6, 1.4))) for x, y, a in ((0, 0, 0), (0.3, 0.1, 1), (-0.2, 0.3, 2), (0.1, -0.3, 3), (-0.3, -0.1, 4), (0.25, 0.35, 5))],
     ['sheaves of blighted wheat stooked together'], ['prop'], []),
    ('scarecrow', [('props', 'Dummy', '', X()), ('props', 'Bag', '', X((0, 0, 1.75), 0.3, (1.3, 1.3, 1.3))), ('props', 'Rope_1', '', X((0, 0, 1.4), 0, (0.6, 0.6, 0.6)))],
     ['a training dummy dressed with a sack head and rope, nails in it'], ['prop'], []),
    ('brazier', [('props', 'Cauldron', '', X((0, 0, 0), 0, (0.9, 0.9, 0.9))), ('dungeon', 'Woodfire', '', X((0, 0, 0.45), 0, (0.8, 0.8, 0.8)))],
     ['a cauldron filled with a dungeon woodfire'], ['light'], [(0, 0, 0.95)]),
    ('lamp_post', [('village', 'Corner_Exterior_Wood', '', X((0, 0, 0), 0, (0.5, 0.5, 0.85))), ('props', 'Lantern_Wall', '', X((0, 0.1, 2.2), math.pi, (1, 1, 1)))],
     ['a village corner timber for a post, a wall lantern hung from it'], ['light'], []),
    ('rubble', [('village', f'Prop_Brick{k % 4 + 1}', '', X(((k % 3) * 0.35 - 0.35, (k // 3) * 0.3 - 0.3, 0.02 * (k % 2)), k * 1.3, (1, 1, 1))) for k in range(8)],
     ['village bricks and stones tumbled in a heap'], ['ruin'], []),
]
