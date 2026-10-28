"""Castle kit pipeline: crop named pieces out of the generated sheets, downscale 4:1 to game
pixels (the kit's "native" scale), register the torch flame frames, and pack one atlas.

Pieces are picked by a point inside them (sheet coordinates) instead of fixed cells, because the
generated sheets do not follow a strict grid."""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

SCALE = 0.25
V = 1536 / 1152  # points measured on the 1152-wide labelled previews

PIECES = {
    '01_floors_platforms': {
        # tall floor run: left cap, two middles, right cap (arcade frieze over stone)
        'floor_l': (95, 105, V), 'floor_m1': (290, 115, V), 'floor_m2': (480, 115, V), 'floor_r': (670, 105, V),
        'floorcap_l': (865, 105, V), 'floorcap_r': (1055, 105, V),
        'wall_l': (100, 290, V), 'fill_1': (285, 290, V), 'fill_2': (480, 290, V), 'wall_r': (670, 290, V),
        'archbracket_l': (865, 285, V), 'archbracket_r': (1050, 285, V),
        'ledge_l': (105, 485, V), 'ledge_m1': (290, 480, V), 'ledge_m2': (485, 480, V), 'ledge_r': (660, 485, V),
        'corbel_l': (860, 475, V), 'corbel_r': (1060, 475, V),
        'marble_l': (100, 655, V), 'marble_m1': (290, 665, V), 'marble_m2': (480, 665, V), 'marble_r': (670, 655, V),
        'block_break': (860, 650, V), 'rubble': (1055, 650, V),
    },
    '02_background_walls': {
        'bg_lightstone_1': (110, 105, V), 'bg_lightstone_2': (300, 105, V),
        'bg_darkstone_1': (480, 105, V), 'bg_darkstone_2': (670, 105, V),
        'bg_brick_1': (855, 105, V), 'bg_brick_2': (1045, 105, V),
        'bg_wainscot_1': (110, 285, V), 'bg_wainscot_2': (300, 285, V),
        'bg_plaster_1': (480, 285, V), 'bg_plaster_2': (670, 285, V),
        'bg_wood_1': (855, 285, V), 'bg_wood_2': (1045, 285, V),
        'frieze': (160, 470, V), 'niche': (670, 465, V), 'quatrefoil': (865, 465, V), 'pilaster': (1045, 460, V),
        'crack': (110, 650, V), 'stain': (480, 640, V), 'ivy': (670, 650, V), 'web': (1045, 650, V),
    },
    '04_columns_arches': {
        'col_base': (140, 340, 1), 'col_shaft': (372, 240, 1), 'col_cap': (625, 160, 1),
        'mcol_base': (893, 340, 1), 'mcol_shaft': (1133, 240, 1), 'mcol_cap': (1385, 185, 1),
        'arch_l': (120, 730, 1), 'arch_r': (360, 730, 1), 'arch_crown': (612, 610, 1),
        'vault_rib': (885, 730, 1), 'buttress': (1200, 730, 1), 'corbel_big': (1400, 640, 1),
    },
    '05_doors_windows_gates': {
        'door_wood': (140, 295, 1), 'door_open': (395, 295, 1), 'portcullis': (650, 295, 1),
        'portcullis_open': (905, 295, 1), 'cell_door': (1155, 310, 1), 'cell_open': (1405, 310, 1),
        'window_stained': (115, 720, 1), 'window_broken': (370, 720, 1), 'window_rose': (580, 730, 1),
        'window_double': (865, 730, 1), 'balcony_l': (1125, 780, 1), 'balcony_r': (1360, 770, 1),
    },
    '06_lighting_drapery_decor': {
        'torch_0': (100, 100, V), 'torch_1': (283, 105, V), 'torch_2': (475, 95, V), 'torch_3': (670, 97, V),
        'torch_4': (865, 102, V), 'lantern': (1075, 105, V),
        'candle_sconce': (95, 300, V), 'candle_triple': (288, 293, V), 'candelabra': (475, 290, V),
        'chandelier': (672, 285, V), 'chain': (872, 285, V), 'censer': (1052, 285, V),
        'banner_red': (97, 475, V), 'banner_blue': (288, 470, V), 'curtain_l': (480, 475, V),
        'curtain_r': (667, 475, V), 'valance': (865, 465, V),
        'gargoyle': (112, 660, V), 'bust': (285, 660, V), 'portrait': (473, 660, V), 'painting': (680, 660, V),
        'shield': (878, 660, V), 'urn': (1052, 660, V),
    },
    '08_dungeon_catacombs_ruins': {
        'crypt_1': (130, 155, 1), 'crypt_2': (385, 155, 1), 'fence_l': (640, 145, 1), 'fence_m': (895, 155, 1),
        'fence_r': (1150, 145, 1), 'drain': (1400, 165, 1), 'sarcophagus': (135, 410, 1), 'ossuary': (650, 385, 1),
        'bones': (885, 435, 1), 'rocks_1': (1135, 435, 1), 'rocks_2': (1400, 435, 1), 'broken_col': (130, 625, 1),
        'broken_arch': (385, 645, 1), 'chain_hang': (125, 860, 1), 'manacles': (385, 860, 1),
        'spikes_l': (880, 910, 1), 'spikes_m': (1140, 915, 1), 'spikes_r': (1395, 910, 1),
        'mossy_wall': (1400, 630, 1), 'ledge_ruin_l': (900, 640, 1), 'ledge_ruin_r': (1150, 640, 1),
    },
    '09_clocktower_mechanisms': {
        'gear_iron': ('box', 20, 15, 200, 195, V), 'gear_bronze': (485, 115, V), 'gear_small': (857, 125, V),
        'bell': (697, 650, V), 'pendulum': (957, 650, V), 'clock_dial': (130, 655, V),
        'beam_l': (530, 485, V), 'beam_m': (697, 470, V), 'beam_r': (870, 485, V), 'beam_broken': (1055, 490, V),
        'chain_v': ('box', 40, 200, 125, 390, V), 'counterweight': (547, 300, V), 'pulley': (418, 300, V),
    },
    '10_exterior_parallax_rooftops': {
        'far_castle_a': (125, 300, 1), 'far_castle_b': (365, 300, 1), 'far_wall': (635, 490, 1),
        'far_mountains': (890, 440, 1), 'far_clouds_a': (1140, 410, 1), 'far_clouds_b': (1405, 410, 1),
        'roof_l': (265, 770, 1), 'roof_r': (520, 770, 1), 'roof_peak': (715, 780, 1),
        'battlement_l': (935, 830, 1), 'battlement_m': (1150, 850, 1), 'battlement_r': (1415, 830, 1),
    },
}


def components(sheet):
    a = np.array(sheet)[..., 3] > 100
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=6))
    return lab


def crop_piece(sheet, lab, x, y):
    k = lab[int(y), int(x)]
    if k == 0:  # point fell in a gap: take the nearest labelled pixel
        ys, xs = np.nonzero(lab)
        i = np.argmin((xs - x) ** 2 + (ys - y) ** 2)
        k = lab[ys[i], xs[i]]
    ys, xs = np.nonzero(lab == k)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    piece = np.array(sheet.crop(box))
    piece[(lab[box[1]:box[3], box[0]:box[2]] != k)] = 0  # neighbours poking into the box
    return Image.fromarray(piece)


def downscale(img):
    w, h = img.size
    out = img.convert('RGBa').resize((max(1, round(w * SCALE)), max(1, round(h * SCALE))), Image.BOX).convert('RGBA')
    a = np.array(out)
    al = a[..., 3]
    a[..., 3] = np.where(al >= 96, 255, 0)
    a[al < 96, :3] = 0
    out = Image.fromarray(a)
    return out.crop(out.getbbox())


def shift_score(ref, p, dx, dy, rows=24):
    """Mismatch between the bottom `rows` of two alpha masks with p shifted by (dx, dy)."""
    H, W = ref.shape
    h, w = p.shape
    a = ref[-rows:]
    b = np.zeros_like(a)
    for yy in range(rows):
        sy = h - rows + yy + dy
        if 0 <= sy < h:
            sx0, sx1 = max(0, dx), min(w, W + dx)
            if sx1 > sx0:
                b[yy, sx0 - dx:sx1 - dx] = p[sy, sx0:sx1]
    return int((a ^ b).sum())


def register_torches(pieces):
    """Flame frames 1-4 share one bracket; shift each so its bracket lines up with frame 0."""
    ref = np.array(pieces['torch_0'])[..., 3] > 0
    offs = {}
    for i in range(5):
        p = np.array(pieces[f'torch_{i}'])[..., 3] > 0
        offs[i] = min(((shift_score(ref, p, dx, dy), dx, dy) for dx in range(-5, 6) for dy in range(-3, 4)))[1:]
    W = max(pieces[f'torch_{i}'].size[0] for i in range(5)) + 10
    H = max(pieces[f'torch_{i}'].size[1] for i in range(5)) + 8
    out = {}
    for i in range(5):
        dx, dy = offs[i]
        img = pieces[f'torch_{i}']
        c = Image.new('RGBA', (W, H))
        c.alpha_composite(img, (5 - dx, H - img.size[1] - 4 - dy))
        out[f'torch_{i}'] = c
    print('torch offsets', offs)
    return out


def pack(pieces):
    items = sorted(pieces.items(), key=lambda kv: -kv[1].size[1])
    W = 1024
    x = y = row_h = 0
    rects = {}
    for name, im in items:
        w, h = im.size
        if x + w > W:
            x, y, row_h = 0, y + row_h + 1, 0
        rects[name] = (x, y, w, h)
        x += w + 1
        row_h = max(row_h, h)
    atlas = Image.new('RGBA', (W, y + row_h))
    for name, im in items:
        atlas.alpha_composite(im, rects[name][:2])
    return atlas, rects


if __name__ == '__main__':
    pieces = {}
    for sheet_name, defs in PIECES.items():
        sheet = Image.open(f'art/raw/castle/{sheet_name}.png').convert('RGBA')
        lab = components(sheet)
        for name, spec in defs.items():
            if spec[0] == 'box':  # explicit box for items fused with a neighbour
                _, x0, y0, x1, y1, k = spec
                pieces[name] = downscale(sheet.crop((round(x0 * k), round(y0 * k), round(x1 * k), round(y1 * k))))
            else:
                x, y, k = spec
                pieces[name] = downscale(crop_piece(sheet, lab, x * k, y * k))
    pieces.update(register_torches(pieces))
    atlas, rects = pack(pieces)
    atlas.save('assets/castle/atlas.png')
    json.dump({k: dict(x=v[0], y=v[1], w=v[2], h=v[3]) for k, v in sorted(rects.items())},
              open('assets/castle/atlas.json', 'w'), indent=0)
    print(atlas.size, len(rects))
    print(' | '.join(f'{k} {rects[k][2]}x{rects[k][3]}' for k in sorted(rects)))
