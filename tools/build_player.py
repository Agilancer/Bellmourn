"""Player sprite pipeline: raw 1536x1024 AI sheets -> game-resolution frames with anchors.

Steps per frame: find bbox, normalise sheet scale (sheets were drawn at different sizes),
premultiplied box-downscale to game pixels, harden alpha, record anchor (feet / hip),
then apply hand-authored leg fixes from tools/leg_fixes.json (far-leg shading etc.).
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
from PIL import ImageDraw

RAW = 'art/raw/player'
LASSO = 'art/view/lasso'
OUT = 'assets/player'
HERO_H = 80                    # standing height in game pixels
IDLE_H = 485                   # idle standing height in sheet pixels
G = HERO_H / IDLE_H
IDLE_HEAD_H = 101.5            # median head blob height on the idle sheet

frames = json.load(open('art/view/frames.json'))
heads = json.load(open('art/view/heads.json'))

# Per-sheet scale correction relative to idle (head-height ratio, rounded after visual check).
SHEET_SCALE = {
    'idle': 1.0, 'walk': 1.0, 'stop': 1.068, 'crouch': 0.925, 'run': 0.93, 'jump': 1.01,
    'double_jump': 1.0, 'slide': 1.19, 'attack_standing': 0.985, 'attack_walking': 1.0,
    'attack_running': 1.26, 'attack_jumping': 0.95, 'attack_crouching': 0.85,
}
# Airborne sheets anchor on the head (legs tuck up); grounded ones anchor on the feet.
AIR = {'jump': [2, 3, 4, 5], 'double_jump': list(range(8)), 'attack_jumping': list(range(8))}


def head_center(c):
    r, g, b, a = [c[..., i].astype(int) for i in range(4)]
    warm = (a > 128) & (r - b > 40) & (r > g) & (r > 90)
    lab, n = ndimage.label(ndimage.binary_dilation(warm, iterations=8))
    sizes = ndimage.sum(warm, lab, range(1, n + 1))
    objs = ndimage.find_objects(lab)
    big = [i for i in range(n) if sizes[i] > 1500]
    top = min(big, key=lambda i: objs[i][0].start)
    ys, xs = np.nonzero((lab == top + 1) & warm)
    return xs.mean(), ys.mean()


def build_palette():
    """One shared palette for every player frame so all sets read as the same sprite."""
    tiles = []
    for name in SHEET_SCALE:
        sh = Image.open(f'{RAW}/{name}.png').convert('RGBA')
        sm = sh.convert('RGBa').resize((sh.size[0] // 6, sh.size[1] // 6), Image.BOX).convert('RGBA')
        a = np.array(sm)
        tiles.append(a[a[..., 3] > 200][:, :3])
    px = np.concatenate(tiles)[None]
    return Image.fromarray(px.astype(np.uint8), 'RGB').quantize(PALETTE_N, method=Image.Quantize.MEDIANCUT)


PALETTE_N = 40
_PAL = None


def quantize(img):
    global _PAL
    if _PAL is None:
        _PAL = build_palette()
    a = np.array(img)
    rgb = Image.fromarray(a[..., :3]).quantize(palette=_PAL, dither=Image.Dither.NONE).convert('RGB')
    out = np.dstack([np.array(rgb), a[..., 3]])
    out[a[..., 3] == 0] = 0
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def downscale(img, s):
    w, h = img.size
    out = img.convert('RGBa').resize((max(1, round(w * s)), max(1, round(h * s))), Image.BOX).convert('RGBA')
    a = np.array(out)
    alpha = a[..., 3]
    a[..., 3] = np.where(alpha >= 110, 255, 0)
    a[alpha < 110, :3] = 0
    # drop specks left by the downscale (detached clusters of a few pixels)
    lab, n = ndimage.label(a[..., 3] > 0)
    if n > 1:
        sizes = ndimage.sum(a[..., 3] > 0, lab, range(1, n + 1))
        for k, sz in enumerate(sizes):
            if sz < 8:
                a[lab == k + 1] = 0
    return quantize(Image.fromarray(a))


FAR_MUL = 0.64
FAR_TINT = np.array([38, 40, 72])
FIXES = json.load(open('tools/leg_fixes.json'))


NEAR_GAMMA = 0.62


def poly_mask(img, polys):
    m = Image.new('L', img.size, 0)
    for poly in polys:
        ImageDraw.Draw(m).polygon([tuple(p) for p in poly], fill=255)
    return np.array(m) > 0


def shade_legs(img, fix):
    """Far leg: darker + cooler. Near leg (where the art shaded it as far): lifted toward the light.
    `fix` is a list of far polygons, or {"far": [...], "near": [...]}."""
    if isinstance(fix, list):
        fix = {'far': fix}
    a = np.array(img).astype(float)
    rgb = a[..., :3]
    opaque = a[..., 3] > 0
    if fix.get('far'):
        sel = poly_mask(img, fix['far']) & opaque
        rgb[sel] = rgb[sel] * FAR_MUL * 0.85 + FAR_TINT * 0.15
    if fix.get('near'):
        sel = poly_mask(img, fix['near']) & opaque
        # gamma lift keeps outlines and pants black while raising the armour plates
        rgb[sel] = np.clip(255 * (rgb[sel] / 255) ** NEAR_GAMMA * 1.08, 0, 255)
    a[..., :3] = rgb
    return quantize(Image.fromarray(a.astype(np.uint8), 'RGBA'))


def build(name):
    sheet = Image.open(f'{RAW}/{name}.png').convert('RGBA')
    arr = np.array(sheet)
    s = G * SHEET_SCALE[name]
    out = []
    labels = np.load(f'{LASSO}/{name}.npy')
    for i in range(8):
        # lasso, not rectangle: only this sprite's own pixels (tools/lasso.py)
        mask = labels == i
        ys, xs = np.nonzero(mask)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        cut = arr[y0:y1, x0:x1].copy()
        cut[~mask[y0:y1, x0:x1]] = 0
        crop = Image.fromarray(cut)
        hx, hy = head_center(np.array(crop))
        small = downscale(crop, s)
        # tight bbox after downscale
        bb = small.getbbox()
        small = small.crop(bb)
        hx_s, hy_s = hx * s - bb[0], hy * s - bb[1]
        if i in AIR.get(name, []):
            feet_y = hy_s + HEAD_TO_FEET   # where feet would be standing
        else:
            feet_y = small.size[1]
        fix = FIXES.get(name, {}).get(str(i))
        if fix:
            small = shade_legs(small, fix)
        out.append(dict(img=small, ax=hx_s, ay=feet_y, hy=hy_s))
    return out


def belt(fr):
    """Belt line (bottom y, centre x) of a game-res frame, from its leather-brown pixels.
    Searched in a window below the head so knee straps and pouches are ignored."""
    a = np.array(fr['img']).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    h = a.shape[0]
    hy = int(fr['hy'])
    band = np.zeros(al.shape, bool); band[max(0, hy + 18):min(h, hy + 31)] = True
    brown = (al > 0) & band & (r - b > 35) & (r > g) & (r < 210) & (g - b > 8)
    ys, xs = np.nonzero(brown)
    # densest rows = the belt itself (pouches/straps are sparser)
    rows = np.bincount(ys, minlength=h)
    yb = int(np.argmax(rows))
    sel = np.abs(ys - yb) <= 2
    return yb + 2, float(xs[sel].mean())


def split_layers(img, cut):
    """-> (upper, lower). Upper = everything above `cut` plus detached limbs (arms) below it;
    lower = the leg mass below `cut`."""
    a = np.array(img)
    al = a[..., 3] > 0
    below = al.copy(); below[:cut] = False
    lab, n = ndimage.label(below)
    if n:
        sizes = ndimage.sum(below, lab, range(1, n + 1))
        legs = lab == (int(np.argmax(sizes)) + 1)
    else:
        legs = below
    up = a.copy(); up[legs] = 0
    lo = a.copy(); lo[~legs] = 0
    return Image.fromarray(up), Image.fromarray(lo)


def graft(upper_fr, legs_fr):
    """Upper body of one frame on the legs of another, joined at the belt."""
    ucut, ux = belt(upper_fr)
    lcut, lx = belt(legs_fr)
    up, _ = split_layers(upper_fr['img'], ucut)
    _, lo = split_layers(legs_fr['img'], lcut)
    dx, dy = round(ux - lx), ucut - lcut
    W = max(up.size[0], lo.size[0] + dx) - min(0, dx)
    H = max(up.size[1], lo.size[1] + dy) - min(0, dy)
    ox, oy = -min(0, dx), -min(0, dy)
    out = Image.new('RGBA', (W, H))
    out.alpha_composite(lo, (ox + dx, oy + dy))
    out.alpha_composite(up, (ox, oy))
    bb = out.getbbox()
    out = out.crop(bb)
    return dict(img=out, ax=upper_fr['ax'] + ox - bb[0], ay=legs_fr['ay'] + oy + dy - bb[1], hy=upper_fr['hy'] + oy - bb[1])


# Striking-fist search direction per attack frame (all attack sheets share one choreography:
# ready, cock back, raise high, drive forward, full extension, follow-through, retract, ready).
HAND_DIRS = [(1, .6), (-1, -.6), (0, -1), (1, -.35), (1, 0), (1, .3), (1, .5), (1, .6)]


def find_hand(fr, i):
    """Fist position: the opaque pixel furthest from the chest along this frame's swing direction,
    pulled back into the centre of the fist."""
    px = np.array(fr['img']).astype(int)
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    warm = (r - b > 30) & (r > g)            # hair, skin, belt: never the gauntlet
    a = (px[..., 3] > 0) & ~warm
    a[int(fr['hy']) + 30:] = False           # fists stay above the belt; feet must not win
    ys, xs = np.nonzero(a)
    cx, cy = fr['ax'], fr['hy'] + 14
    dx, dy = HAND_DIRS[i]
    n = (dx * dx + dy * dy) ** .5
    dx, dy = dx / n, dy / n
    k = np.argmax((xs - cx) * dx + (ys - cy) * dy)
    return [round(float(xs[k] - dx * 3.5), 1), round(float(ys[k] - dy * 3.5), 1)]


# head centre -> feet distance on idle frame 0, in game px
_c = np.array(Image.open(f'{RAW}/idle.png').convert('RGBA').crop(frames['idle'][0]['bbox']))
HEAD_TO_FEET = (_c.shape[0] - head_center(_c)[1]) * G

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or list(SHEET_SCALE)
    mpath = f'{OUT}/frames.json'
    meta = json.load(open(mpath)) if os.path.exists(mpath) else {}
    built = {}
    jobs = []
    for name in names:
        built[name] = build(name)
        jobs.append(name)
    # Moving attacks: phase variants so an attack can start on either step without a leg pop.
    # A = legs in phase with the attack frame index, B = legs half a cycle (4 frames) later.
    if {'attack_running', 'run'} <= set(built):
        ar, run = built['attack_running'], built['run']
        built['attack_running'] = [graft(ar[t], run[t]) for t in range(8)]
        built['attack_running_b'] = [graft(ar[t], run[(t + 4) % 8]) for t in range(8)]
        jobs.append('attack_running_b')
    if {'attack_walking', 'walk'} <= set(built):
        aw, walk = built['attack_walking'], built['walk']
        built['attack_walking_b'] = [graft(aw[t], walk[(t + 4) % 8]) for t in range(8)]
        jobs.append('attack_walking_b')
    for name in jobs:
        fr = built[name]
        W = sum(f['img'].size[0] + 2 for f in fr)
        H = max(f['img'].size[1] for f in fr)
        atlas = Image.new('RGBA', (W, H))
        x = 0
        rects = []
        for f in fr:
            atlas.alpha_composite(f['img'], (x, 0))
            w, h = f['img'].size
            r = dict(x=x, y=0, w=w, h=h, ax=round(f['ax'], 1), ay=round(f['ay'], 1))
            if name.startswith('attack'):
                r['hand'] = find_hand(f, len(rects))
            rects.append(r)
            x += w + 2
        atlas.save(f'{OUT}/{name}.png')
        meta[name] = rects
        print(name, [(r['w'], r['h']) for r in rects])
    json.dump(meta, open(mpath, 'w'), indent=1)
