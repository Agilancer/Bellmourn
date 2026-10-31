"""The women's face atlases (VELSCOUR female pack): each paints the face in the middle and the
ears, hair and neck as patches round it, in a different place on each sheet. So only the face is
used: its eyes, mouth and hairline are found on the sheet, a template of landmarks (read on
08_Medieval) is moved onto them, and an oval round the face says how far the sheet is trusted.
All coordinates are in 1024 px, whatever the sheet's size."""
import numpy as np
from PIL import Image
from scipy import ndimage

# the template, on 08_Medieval (1024 px): name -> (x, y); 'L' and 'R' are the sheet's left and right
T = {'eyeL': (418, 380), 'eyeR': (606, 380), 'mouth': (512, 580), 'hair': (512, 190), 'chin': (512, 705)}
FRONT = [  # (3D spec on the reference head, its left-side spec mirrored), sheet px on the left / right
    (('f', 0.44, 8.205), (372, 378), (652, 378)),   # outer eye corner
    (('f', 0.19, 8.19), (462, 386), (562, 386)),    # inner eye corner
    (('f', 0.31, 8.238), (418, 362), (606, 362)),   # upper lid
    (('f', 0.31, 8.145), (418, 397), (606, 397)),   # lower lid
    (('f', 0.30, 8.36), (410, 328), (614, 328)),    # brow
    (('f', 0.17, 7.78), (478, 496), (546, 496)),    # nose wing
    (('f', 0.25, 7.51), (446, 580), (578, 580)),    # mouth corner
    (('f', 0.56, 7.80), (338, 470), (686, 470)),    # cheek
    (('f', 0.60, 8.70), (330, 238), (694, 238)),    # temple
    (('f', 0.40, 7.28), (372, 650), (652, 650)),    # jaw
]
MID = [(('f', 0.0, 8.2), 385), (('f', 0.0, 7.86), 488), (('f', 0.0, 7.72), 506), (('f', 0.0, 7.585), 560),
       (('f', 0.0, 7.51), 580), (('f', 0.0, 7.405), 602), (('f', 0.0, 7.09), 705), (('f', 0.0, 8.85), 190)]


# measured on each sheet (1024 px): eyes' centres, the mouth's line, the hairline at the parting
SHEETS = {
    '01_Soldier': ((422, 393), (613, 393), 595, 197), '02_Worker': ((380, 387), (612, 387), 597, 147),
    '03_Suit': ((402, 415), (620, 415), 603, 233), '04_Adventurer': ((420, 428), (613, 428), 618, 228),
    '05_Punk': ((400, 410), (617, 410), 587, 233), '06_Formal': ((447, 493), (608, 493), 693, 290),
    '07_SciFi': ((408, 382), (648, 382), 590, 202), '08_Medieval': ((415, 373), (607, 373), 585, 180),
    '09_Witch': ((402, 450), (618, 450), 647, 268), '10_Casual': ((430, 428), (638, 428), 652, 232)}


# and its lips: the upper lip's top, where they part, the lower lip's foot (read on each sheet)
LIPS = {'01_Soldier': (575, 600, 630), '02_Worker': (575, 599, 625), '03_Suit': (583, 607, 633),
        '04_Adventurer': (603, 616, 656), '05_Punk': (565, 592, 617), '06_Formal': (656, 691, 723),
        '07_SciFi': (560, 590, 620), '08_Medieval': (560, 583, 613), '09_Witch': (605, 639, 669),
        '10_Casual': (610, 644, 680)}


# half the width of the nose (its wings) and of the mouth (its corners), read on each sheet
WIDTHS = {'01_Soldier': (50, 75), '02_Worker': (55, 80), '03_Suit': (45, 70), '04_Adventurer': (50, 72),
          '05_Punk': (45, 68), '06_Formal': (40, 82), '07_SciFi': (43, 82), '08_Medieval': (40, 72),
          '09_Witch': (38, 62), '10_Casual': (60, 80)}


def measured(name):
    l, r, my, hy = SHEETS[name]
    lt, my, lb = LIPS[name]
    cx = (l[0] + r[0]) / 2; ey = (l[1] + r[1]) / 2
    d = {'eyeL': l, 'eyeR': r, 'mouth': (cx, my), 'hair': (cx, hy),
         'chin': (cx, my + (my - ey) * (T['chin'][1] - T['mouth'][1]) / (T['mouth'][1] - T['eyeL'][1])),
         'lips': (lt, lb + 4), 'nose_w': WIDTHS[name][0] * 0.85, 'mouth_w': WIDTHS[name][1]}
    return d


def lips(a, det):
    """The lips' top and bottom on the sheet: where the redness down the middle of the mouth
    falls to half way between the lips' and the skin's."""
    cx, my = det['mouth']
    red = a[..., 0] - 0.5 * (a[..., 1] + a[..., 2])
    col = ndimage.gaussian_filter1d(red[:, int(cx) - 14:int(cx) + 14].mean(1), 2)
    seg = col[int(my) - 70:int(my) + 70]
    peak = seg[50:90].max(); base = np.median(np.concatenate([seg[:15], seg[-15:]]))
    thr = base + 0.45 * (peak - base)
    i = int(np.argmax(seg[50:90])) + 50
    top = i
    while top > 5 and seg[top] > thr:
        top -= 1
    bot = i
    while bot < len(seg) - 5 and seg[bot] > thr:
        bot += 1
    return int(my) - 70 + top, int(my) - 70 + bot


def load(path):
    a = np.asarray(Image.open(path).convert('RGB').resize((1024, 1024), Image.LANCZOS), dtype=np.float64)
    return a


def detect(a):
    """Eyes (darkest blobs of each half, about the template's eye line), the mouth (reddest band
    below the nose) and the hairline (where the parting's column turns from skin to hair)."""
    lum = a.mean(2)
    bl = ndimage.gaussian_filter(lum, 6)
    out = {}
    for k, (x0, x1) in (('eyeL', (330, 500)), ('eyeR', (524, 694))):
        win = bl[300:470, x0:x1]
        y, x = np.unravel_index(np.argmin(win), win.shape)
        out[k] = (x0 + x, 300 + y)
    ey = (out['eyeL'][1] + out['eyeR'][1]) / 2
    cx = (out['eyeL'][0] + out['eyeR'][0]) / 2
    red = ndimage.gaussian_filter(a[..., 0] - 0.5 * (a[..., 1] + a[..., 2]), 4)
    band = red[int(ey + 120):int(ey + 260), int(cx - 50):int(cx + 50)].mean(1)
    out['mouth'] = (cx, ey + 120 + int(np.argmax(band)))
    skin = np.median(lum[int(ey + 40):int(ey + 90), int(cx - 120):int(cx - 60)])
    col = ndimage.gaussian_filter1d(lum[:, int(cx) - 30:int(cx) + 30].mean(1), 3)
    y = int(ey - 60)
    while y > 20 and col[y] > 0.72 * skin:
        y -= 1
    out['hair'] = (cx, y)
    d = out['mouth'][1] - ey
    out['chin'] = (cx, out['mouth'][1] + d * (T['chin'][1] - T['mouth'][1]) / (T['mouth'][1] - T['eyeL'][1]))
    return out


def mapper(det):
    """Template px -> this sheet's px: across by the eyes' spread, down by eye-to-mouth below the
    eyes and by eye-to-hairline above them."""
    tcx, tey = 512, T['eyeL'][1]
    cx = (det['eyeL'][0] + det['eyeR'][0]) / 2; ey = (det['eyeL'][1] + det['eyeR'][1]) / 2
    sx = (det['eyeR'][0] - det['eyeL'][0]) / (T['eyeR'][0] - T['eyeL'][0])
    sdn = (det['mouth'][1] - ey) / (T['mouth'][1] - tey)
    sup = (ey - det['hair'][1]) / (tey - T['hair'][1])

    def f(x, y):
        return (cx + (x - tcx) * sx, ey + (y - tey) * (sup if y < tey else sdn))
    return f


def landmarks(det):
    f = mapper(det)
    L = []
    lt, lb = det.get('lips', (None, None))
    cx = (det['eyeL'][0] + det['eyeR'][0]) / 2
    for spec, l, r in FRONT:
        pl, pr = f(*l), f(*r)
        w = det.get('nose_w') if spec[2] == 7.78 else det.get('mouth_w') if spec[2] == 7.51 else None
        if w:   # the nose's and the mouth's own width, so no second nostril or lip corner shows beside them
            pl, pr = (cx - w, pl[1]), (cx + w, pr[1])
        L.append((('f', -spec[1], spec[2]), pl))   # her right is the sheet's left
        L.append((('f', spec[1], spec[2]), pr))
    for spec, y in MID:
        x, Y = f(512, y)
        if lt is not None and spec[2] == 7.585:
            Y = lt
        if lb is not None and spec[2] == 7.405:
            Y = lb
        L.append((spec, (x, Y)))
    return L


def trust(det, sx, sy):
    """0..1: inside the face's oval (temple to temple, hairline to under the chin), feathered."""
    f = mapper(det)
    cx, top = f(512, 222); _, bot = f(512, 745)   # its top under the sheet's painted hairline
    hw = (f(706, 0)[0] - f(318, 0)[0]) / 2
    e = np.hypot((sx - cx) / hw, (sy - (top + bot) / 2) / ((bot - top) / 2))
    t = np.clip((1.0 - e) / 0.12, 0, 1)
    return t * t * (3 - 2 * t)


def tones(a, det):
    """Her skin (the cheeks) and her hair (over the crown) in sRGB 0..255."""
    f = mapper(det)
    cs = []
    for x in (360, 664):
        X, Y = f(x, 455); cs.append(a[int(Y) - 12:int(Y) + 12, int(X) - 12:int(X) + 12].reshape(-1, 3))
    hx, hy = f(512, 120)
    h = a[max(0, int(hy) - 60):int(hy), int(hx) - 70:int(hx) + 70].reshape(-1, 3)
    lum = h.mean(1)
    return np.median(np.concatenate(cs), 0), h[lum <= np.percentile(lum, 60)].mean(0)


def oval(det):
    """The face's oval: centre, half-width, half-height (sheet px)."""
    f = mapper(det)
    cx, top = f(512, 222); _, bot = f(512, 745)
    return cx, (top + bot) / 2, (f(706, 0)[0] - f(318, 0)[0]) / 2, (bot - top) / 2


def skin_only(a, det):
    """The sheet with its features taken out (eyes and brows, nose, mouth, the hairline): each
    filled from the skin round it, so nothing of them can be carried outside the face."""
    f = mapper(det)
    yy, xx = np.mgrid[0:1024, 0:1024]
    m = np.zeros((1024, 1024), bool)
    for (x, y), (rx, ry) in ((f(418, 362), (85, 60)), (f(606, 362), (85, 60)), (f(512, 470), (60, 70)), (f(512, 585), (95, 45))):
        m |= ((xx - x) / rx) ** 2 + ((yy - y) / ry) ** 2 < 1
    m |= yy < f(512, 235)[1]
    keep = (~m).astype(np.float64)
    out = np.empty_like(a)
    for c in range(3):
        num = ndimage.gaussian_filter(a[..., c] * keep, 18); den = ndimage.gaussian_filter(keep, 18)
        out[..., c] = num / np.maximum(den, 1e-4)
    return out


def beyond(a, det, sx, sy, inset=0.9, blur=10):
    """Colour for points outside the face: the sheet's own colour, blurred, at the point drawn in
    along the ray from the face's centre to just inside the oval, so the cheek's tone carries on
    round the jaw, the temples, the ears and down the neck."""
    cx, cy, hw, hh = oval(det)
    e = np.hypot((sx - cx) / hw, (sy - cy) / hh)
    k = np.where(e > inset, inset / np.maximum(e, 1e-6), 1.0)
    px, py = cx + (sx - cx) * k, cy + (sy - cy) * k
    so = skin_only(a, det)
    b = np.stack([ndimage.gaussian_filter(so[..., c], blur) for c in range(3)], -1)
    return np.stack([ndimage.map_coordinates(b[..., c], [np.clip(py, 0, 1023), np.clip(px, 0, 1023)], order=1) for c in range(3)], 1)
