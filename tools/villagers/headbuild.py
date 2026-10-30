"""A realistic head for the villagers: MakeHuman's base head, morphed to a man (and aged, and
varied), with a VELSCOUR face atlas warped onto it.

The atlas is a cylinder-like unwrap: the face in the middle, an ear either side, the neck below.
The head is projected the same way (angle round a vertical axis through the ears, and height),
then a thin-plate spline carries its landmarks (eye corners and lids, brows, nose, mouth, chin,
ears) onto the atlas's. The warp is baked per pixel into the head's own UV layout, and where the
atlas runs out (crown, back of the head) the scalp is painted: cropped hair over skin."""
import numpy as np
from scipy.interpolate import RBFInterpolator
from scipy import ndimage
from PIL import Image, ImageFilter
import mh

Z0 = 0.5     # the projection axis (MakeHuman z): through the ears
R0 = 0.8     # radians -> dm, so the angle and the height weigh alike in the spline
CUT = 6.72   # the neck is cut here (MakeHuman y), inside the collar
NECK_Y0 = 7.0   # below here (under the jaw) the neck is lengthened

# landmarks: (how to find it on the head, where it is on the atlas in 1024 px)
#   ('f', x, y): the front-most surface point at (x, y)
#   ('s', z, y, side): the outermost point at (z, y) on side -1 (his right) or +1 (his left)
#   ('b', z, y, side): a point on the back half of the head (no atlas: painted scalp)
SIDE = [  # (where on the head, his left as +x / his right mirrored), (atlas px on his right, on his left)
    (('f', 0.44, 8.205), (355, 233), (687, 233)),     # outer eye corner
    (('f', 0.19, 8.19), (455, 238), (568, 238)),      # inner eye corner
    (('f', 0.31, 8.238), (410, 214), (620, 214)),     # upper lid
    (('f', 0.31, 8.145), (410, 249), (620, 249)),     # lower lid
    (('f', 0.30, 8.36), (405, 191), (620, 191)),      # brow
    (('f', 0.17, 7.78), (452, 401), (575, 401)),      # nose wing
    (('f', 0.25, 7.51), (422, 516), (607, 516)),      # mouth corner
    (('f', 0.56, 7.80), (318, 420), (710, 420)),      # cheek
    (('f', 0.60, 8.70), (322, 40), (706, 40)),        # temple, up by the forehead
    (('f', 0.40, 7.28), (352, 625), (676, 625)),      # jaw
    (('s', 0.62, 8.00), (168, 200), (856, 200)),      # ear front (tragus)
    (('s', 0.36, 8.03), (94, 160), (930, 160)),       # ear back (helix)
    (('s', 0.52, 8.27), (145, 35), (880, 35)),        # ear top
    (('s', 0.60, 7.77), (175, 305), (850, 300)),      # ear lobe
    (('s', 0.86, 8.25), (230, 120), (796, 120)),      # sideburn above the tragus
    (('s', 0.85, 7.55), (236, 520), (790, 520)),      # jaw angle under the ear
]


def landmarks(tweak=None):
    """[(spec, atlas px)]; tweak: {name index: (dx, dy)} nudges in atlas px for iterations."""
    L = []
    for spec, r, l in SIDE:
        for side, px in ((-1, r), (1, l)):
            if spec[0] == 'f':
                L.append((('f', spec[1] * side, spec[2]), px))
            else:
                L.append((('s', spec[1], spec[2], side), px))
    L += [
        (('f', 0.0, 8.2), (513, 238)),     # bridge of the nose
        (('f', 0.0, 7.86), (513, 377)),    # nose tip
        (('f', 0.0, 7.72), (513, 417)),    # under the nose
        (('f', 0.0, 7.585), (514, 482)),   # top of the upper lip
        (('f', 0.0, 7.51), (514, 511)),    # between the lips
        (('f', 0.0, 7.405), (514, 541)),   # under the lower lip
        (('f', 0.0, 7.09), (513, 688)),    # chin
        (('f', 0.0, 8.85), (514, 18)),     # hairline
    ]
    return L


def vnoise(p, freq, seed=0):
    """Smooth value noise (0..1) at points p (n, 3), so the painting is continuous across seams."""
    q = p * freq + seed * 17.13
    i = np.floor(q); f = q - i; f = f * f * (3 - 2 * f)

    def h(dx, dy, dz):
        a = (i[:, 0] + dx) * 127.1 + (i[:, 1] + dy) * 311.7 + (i[:, 2] + dz) * 74.7 + seed * 3.3
        return np.modf(np.abs(np.sin(a) * 43758.5453))[0]
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out = out + w * h(dx, dy, dz)
    return out


def ear_mask(size=1024):
    """Where the atlas paints ears (0..1): on each side the big unwrapped ear, and the second,
    front-on ear that pokes out of the face's edge with the dark wedge beneath it. None of it may
    reach the head: the head has its own ears."""
    from PIL import ImageDraw
    m = Image.new('L', (1024, 1024), 0)
    d = ImageDraw.Draw(m)
    for cx in (136, 897):
        d.ellipse([cx - 118, -14, cx + 118, 362], fill=255)
    d.polygon([(176, 150), (258, 150), (266, 300), (272, 560), (262, 600), (190, 600), (148, 330)], fill=255)
    d.polygon([(766, 150), (848, 150), (876, 330), (834, 600), (762, 600), (752, 560), (758, 300)], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(9))
    if size != 1024:
        m = m.resize((size, size), Image.LANCZOS)
    return np.asarray(m, dtype=np.float64) / 255


def clean_atlas(path):
    """The atlas with its painted ears taken out: refilled with the skin of its own body strip
    (its fine grain), at the colour of the skin round each hole (its tone)."""
    a = np.asarray(Image.open(path).convert('RGB'), dtype=np.float64)
    H = a.shape[0]; s = H / 1024
    m = ear_mask(H)
    keep = (m < 0.02).astype(np.float64)
    keep[int(768 * s):] = 0      # don't take tone from the body strip
    # the tone, from near skin where there is some, from further off where there isn't
    tone = np.zeros_like(a); got = np.zeros(a.shape[:2])
    for sig in (24 * s, 60 * s, 150 * s):
        num = np.stack([ndimage.gaussian_filter(a[..., k] * keep, sig) for k in range(3)], -1)
        den = ndimage.gaussian_filter(keep, sig)
        est = num / np.maximum(den, 1e-6)[..., None]
        w = np.clip(den / 0.25, 0, 1) * (1 - got)
        tone += est * w[..., None]; got += w
    tone /= np.maximum(got, 1e-6)[..., None]
    # the grain: the body strip, high-passed, tiled over the face area (mirrored so it joins)
    strip = a[int(790 * s):int(1010 * s)]
    strip = np.concatenate([strip, strip[::-1]], 0)
    grain = strip - np.stack([ndimage.gaussian_filter(strip[..., k], 8 * s) for k in range(3)], -1)
    reps = int(np.ceil(H / grain.shape[0])) + 1
    grain = np.tile(grain, (reps, 1, 1))[:H]
    fill = tone + grain * 1.1
    w = m[..., None]
    out = a * (1 - w) + fill * w
    out[int(768 * s):] = a[int(768 * s):]
    return np.clip(out, 0, 255)


def atlas_hair(path):
    """The colour of the hair the atlas paints at its temples (0..1 sRGB)."""
    a = np.asarray(Image.open(path).convert('RGB'), dtype=np.float64)
    s = a.shape[0] / 1024
    z = np.concatenate([a[int(4 * s):int(50 * s), int(228 * s):int(300 * s)].reshape(-1, 3),
                        a[int(4 * s):int(50 * s), int(724 * s):int(796 * s)].reshape(-1, 3)])
    lum = z.mean(1)
    return (z[lum <= np.percentile(lum, 20)].mean(0) / 255).tolist()


class Head:
    def __init__(self, base=None):
        self.b = base or mh.Base()

    def eyes_at(self, v):
        b = self.b
        if not hasattr(self, '_eyev'):
            self._eyev = np.unique(np.concatenate([b.faces[i] for i, m in enumerate(b.fmat) if b.mat_names[m] in ('helper-l-eye', 'helper-r-eye')]))
        return v[self._eyev].mean(0)

    def build(self, morph, neck=2.8, slim=1.0):
        self.neck = neck
        # a slimmer neck than MakeHuman's (front to back as well as side to side)
        morph = dict(morph)
        for t, w in (('neck-scale-horiz-less', 1.0), ('neck-scale-depth-less', 1.0), ('neck-back-scale-depth-less', 0.6)):
            morph[t] = morph.get(t, 0) + w * slim
        b = self.b
        # every head is moved so its eyes sit where the young man's do (the landmarks were read there)
        vref = b.morph({'caucasian-male-young': 1.0})
        ref = self.eyes_at(vref)
        self.v = b.morph(morph)
        self.v += ref - self.eyes_at(self.v)
        self.vref_full = vref
        keep = [i for i, (f, m) in enumerate(zip(b.faces, b.fmat))
                if b.mat_names[m] == 'body' and self.v[f][:, 1].min() > CUT]
        self.fidx = keep
        used = np.unique(np.concatenate([b.faces[i] for i in keep]))
        self.vmap = {int(o): n for n, o in enumerate(used)}
        self.used = used
        self.faces = [[self.vmap[a] for a in b.faces[i]] for i in keep]
        self.uvs = [b.uvs[b.fuv[i]] for i in keep]
        self.hv = self.v[used]
        self.hvref = self.vref_full[used]
        # a neck: below the jaw it is drawn out (neck times as long) down into the collar, and
        # narrows a little at its base so it stays inside the shirt
        # no flare: below the jaw the neck keeps the size of its ring there (MakeHuman's neck widens
        # into the shoulders, which, drawn out, would make a thick cone)
        for hv in (self.hv, self.hvref):
            ring = hv[np.abs(hv[:, 1] - NECK_Y0) < 0.04]
            zc = (ring[:, 2].min() + ring[:, 2].max()) / 2
            ang = lambda p: np.arctan2(p[:, 0], p[:, 2] - zc)
            bins = np.linspace(-np.pi, np.pi, 37)
            ra, rr = ang(ring), np.hypot(ring[:, 0], ring[:, 2] - zc)
            r0 = np.array([rr[(ra >= a) & (ra < b)].max() if ((ra >= a) & (ra < b)).any() else np.nan for a, b in zip(bins[:-1], bins[1:])])
            ok = ~np.isnan(r0); mids = (bins[:-1] + bins[1:]) / 2
            r0 = np.interp(mids, mids[ok], r0[ok], period=2 * np.pi)
            low = hv[:, 1] < NECK_Y0
            a, r = ang(hv[low]), np.hypot(hv[low, 0], hv[low, 2] - zc)
            cap = np.interp(a, mids, r0, period=2 * np.pi)
            k = np.minimum(1, cap / np.maximum(r, 1e-6))
            hv[low, 0] *= k
            hv[low, 2] = zc + (hv[low, 2] - zc) * k
        self.hv_paint = self.hv.copy()   # the painting is laid on the neck as it was (the atlas's neck)
        for hv in (self.hv, self.hvref):
            y = hv[:, 1]
            below = y < NECK_Y0
            hv[below, 1] = NECK_Y0 - (NECK_Y0 - y[below]) * self.neck
            t = np.clip((NECK_Y0 - hv[:, 1]) / (NECK_Y0 - CUT) / self.neck, 0, 1)
            k = 1 - 0.12 * t * t
            zc = 0.20
            hv[:, 0] *= k
            hv[:, 2] = zc + (hv[:, 2] - zc) * k
        # the ears: what stands out from the sides of the head round the ear-hole (MakeHuman's own
        # islands left of the head are the eye sockets, not the ears)
        r = self.hvref
        ev = (np.abs(r[:, 0]) > 0.55) & (((r[:, 2] - 0.50) / 0.18) ** 2 + ((r[:, 1] - 8.02) / 0.29) ** 2 < 1)
        self.ear_face = np.array([ev[f].mean() > 0.5 for f in self.faces])
        from scipy.spatial import cKDTree
        self.ear_tree = cKDTree(self.hv[ev])
        self.ear_vert = self.ear_tree.query(self.hv)[0] < 0.03
        return self

    def v0y(self, f):
        return self.b.v0[f][:, 1]

    def proj(self, p):
        """(angle*R0, height) of points (n, 3) in MakeHuman space."""
        th = np.arctan2(p[:, 0], p[:, 2] - Z0)
        return np.stack([th * R0, p[:, 1]], 1)

    def tri_index(self):
        if not hasattr(self, '_ti'):
            t = []
            for f in self.faces:
                t.append((f[0], f[1], f[2]))
                if len(f) == 4:
                    t.append((f[0], f[2], f[3]))
            self._ti = np.array(t)
        return self._ti

    def ray(self, o, d):
        """First hit of the ray o + t d on the reference head: (triangle, u, v), Moller-Trumbore."""
        T = self.hvref[self.tri_index()]
        e1 = T[:, 1] - T[:, 0]; e2 = T[:, 2] - T[:, 0]
        p = np.cross(d, e2); det = (e1 * p).sum(1)
        ok = np.abs(det) > 1e-12
        inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
        s = o - T[:, 0]
        u = (s * p).sum(1) * inv
        q = np.cross(s, e1)
        v = (q * d).sum(1) * inv
        t = (q * e2).sum(1) * inv
        hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
        if not hit.any():
            return None
        k = np.where(hit)[0][np.argmin(t[hit])]
        return k, u[k], v[k]

    def at(self, hit):
        """Where a reference-head hit lies on this (morphed) head: the landmark follows the morph."""
        k, u, v = hit
        a, b_, c = self.hv[self.tri_index()[k]]
        return a + u * (b_ - a) + v * (c - a)

    def locate(self, spec):
        if spec[0] == 'f':
            _, x, y = spec
            p = self.ray(np.array([x, y, 5.0]), np.array([0, 0, -1.0]))
        else:
            _, z, y, side = spec
            p = self.ray(np.array([3.0 * side, y, z]), np.array([-side, 0, 0.0]))
        assert p is not None, spec
        return self.at(p)

    def warp(self, lm=None):
        lm = lm or landmarks()
        src = np.array([self.proj(self.locate(s)[None])[0] for s, _ in lm])
        dst = np.array([d for _, d in lm], dtype=np.float64)
        self.lm_src, self.lm_dst = src, dst
        self.tps = RBFInterpolator(src, dst, kernel='thin_plate_spline', smoothing=0.0)
        return self

    # ------------------------------------------------------------------ bake
    def raster(self, uv_faces, size):
        """The head's surface position at every texel of the final UV layout."""
        P = np.zeros((size, size, 3)); W = np.zeros((size, size), bool)
        hv = self.hv_paint
        for f, uv in zip(self.faces, uv_faces):
            for t in ([(0, 1, 2)] if len(f) == 3 else [(0, 1, 2), (0, 2, 3)]):
                q = np.array([uv[t[0]], uv[t[1]], uv[t[2]]]) * size
                q[:, 1] = size - q[:, 1]
                p3 = hv[[f[t[0]], f[t[1]], f[t[2]]]]
                x0, y0 = np.floor(q.min(0) - 1).astype(int); x1, y1 = np.ceil(q.max(0) + 1).astype(int)
                x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, size - 1), min(y1, size - 1)
                if x1 < x0 or y1 < y0:
                    continue
                gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
                a, bq, c = q
                den = (bq[1] - c[1]) * (a[0] - c[0]) + (c[0] - bq[0]) * (a[1] - c[1])
                if abs(den) < 1e-12:
                    continue
                l1 = ((bq[1] - c[1]) * (gx - c[0]) + (c[0] - bq[0]) * (gy - c[1])) / den
                l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / den
                l3 = 1 - l1 - l2
                m = (l1 > -0.02) & (l2 > -0.02) & (l3 > -0.02)
                if not m.any():
                    continue
                pos = l1[m, None] * p3[0] + l2[m, None] * p3[1] + l3[m, None] * p3[2]
                yy, xx = gy[m].astype(int), gx[m].astype(int)
                P[yy, xx] = pos; W[yy, xx] = True
        E = np.zeros((size, size), bool)
        for f, uv, e in zip(self.faces, uv_faces, self.ear_face):
            if not e:
                continue
            q = np.array(uv) * size; q[:, 1] = size - q[:, 1]
            x0, y0 = np.clip(np.floor(q.min(0)).astype(int) - 1, 0, size - 1); x1, y1 = np.clip(np.ceil(q.max(0)).astype(int) + 1, 0, size - 1)
            E[y0:y1 + 1, x0:x1 + 1] |= W[y0:y1 + 1, x0:x1 + 1]
        self.size, self.cov, self.pts = size, W, P[W]
        self.ear_px = self.ear_tree.query(self.pts)[0] < 0.03
        return self

    def hairmask(self, pts, seed=1, line=0.0):
        """0..1: where hair grows. line raises (+) or lowers the hairline, in dm."""
        y = pts[:, 1]; z = pts[:, 2]; x = pts[:, 0]
        front = np.clip((z - 0.95) / 0.35, 0, 1)
        behind = np.clip((0.5 - z) / 0.35, 0, 1)
        brow = 8.80 + line + 0.06 * np.clip(np.abs(x) / 0.6, 0, 1) ** 2
        # above the ear, and down in front of it as a short sideburn
        side = 8.32 - 0.30 * np.exp(-((z - 0.70) / 0.09) ** 2) * (np.abs(x) > 0.5)
        nape = 7.48 + 0.2 * np.clip(np.abs(x) / 0.6, 0, 1)
        hl = brow * front + (1 - front) * (side * (1 - behind) + nape * behind)
        hl += 0.05 * (vnoise(pts, 9, seed) - 0.5) + 0.025 * (vnoise(pts, 30, seed + 4) - 0.5)
        m = np.clip((y - hl) / 0.22 + 0.35, 0, 1)
        return m * m * (3 - 2 * m)

    def strands(self, pts, seed=1, freq=90.0, stretch=0.12):
        """Short strands: noise drawn out along the way the hair lies (away from the crown)."""
        c = np.array([0, 8.55, 0.5]); crown = np.array([0, 9.35, 0.15])
        n = pts - c; n /= np.linalg.norm(n, axis=1, keepdims=True)
        d = pts - crown; f = d - (d * n).sum(1, keepdims=True) * n
        f /= np.linalg.norm(f, axis=1, keepdims=True) + 1e-9
        q = pts + (stretch - 1) * (pts * f).sum(1, keepdims=True) * f
        return 0.65 * vnoise(q, freq, seed) + 0.35 * vnoise(q, freq * 2.1, seed + 7)

    def fill(self, img, cov, bg):
        """Grow the painting into the gutters so mips don't bleed."""
        filled = cov.copy()
        for _ in range(12):
            if filled.all():
                break
            g = ndimage.grey_dilation(np.where(filled[..., None], img, -1), size=(3, 3, 1))
            nf = ndimage.binary_dilation(filled)
            img[nf & ~filled] = g[nf & ~filled]
            filled = nf
        img[~filled] = bg
        return img

    def tone(self, pts, hair, st, seed, pepper):
        """Hair colour per point: the strands' own light and dark, and for grey hair dark strands
        still among the grey (pepper: their share)."""
        c = np.array(hair)[None] * (0.42 + 0.95 * st)[:, None]
        if pepper:
            dark = np.clip((vnoise(pts * np.array([1, 0.4, 1]), 140, seed + 9) - (1 - pepper)) * 6, 0, 1)
            c = c * (1 - dark[:, None]) + np.array([0.09, 0.075, 0.065])[None] * dark[:, None]
        return c * 255

    def bake(self, atlas_path, hair=(0.09, 0.06, 0.04), crop=0.6, seed=1, line=0.0, pepper=0.0, face=None):
        """The skin: the atlas over the face and ears, cropped hair and skin elsewhere. RGB uint8.
        face: a women's sheet's measurements (femface): only the face's oval is taken from it."""
        size, cov, pts = self.size, self.cov, self.pts
        pr = self.proj(pts)
        ac = self.tps(pr)   # atlas px
        if face is not None:
            import femface
            atlas = femface.load(atlas_path)
            sx, sy = ac[:, 0], ac[:, 1]
            col = np.stack([ndimage.map_coordinates(atlas[..., k], [np.clip(sy, 0, 1023), np.clip(sx, 0, 1023)], order=1, mode='nearest') for k in range(3)], 1)
            th = np.abs(pr[:, 0] / R0)
            # the sheet only on the face's front: not round the sides, not under the chin (where the
            # warp, extrapolating, would fetch a second face)
            inside = femface.trust(face, sx, sy) * np.clip((1.0 - th) / 0.25, 0, 1) * np.clip((pts[:, 1] - 6.98) / 0.1, 0, 1) * (pts[:, 2] > 0.6)
            skin, _ = femface.tones(atlas, face)
            field = femface.beyond(atlas, face, sx, sy)
            # skin's own grain where the sheet isn't used: pores, and a faint blotchiness
            g = 1 + 0.07 * (vnoise(pts, 260, seed + 11) - 0.5) + 0.06 * (vnoise(pts, 40, seed + 12) - 0.5) + 0.05 * (vnoise(pts, 9, seed + 13) - 0.5)
            return self._finish(col, inside, skin, hair, crop, seed, line, pepper, field=field * g[:, None])
        atlas = clean_atlas(atlas_path)
        H, Wd = atlas.shape[:2]
        sx = ac[:, 0] * Wd / 1024; sy = ac[:, 1] * H / 1024
        col = np.stack([ndimage.map_coordinates(atlas[..., k], [np.clip(sy, 0, 766 * H / 1024), np.clip(sx, 0, Wd - 1)], order=1, mode='nearest') for k in range(3)], 1)
        # how much of the atlas to trust: its face and ears, not round the back or over the crown
        th = np.abs(pr[:, 0] / R0)
        inside = np.minimum.reduce([
            np.clip((sx - 4) / 30, 0, 1), np.clip((Wd - 4 - sx) / 30, 0, 1),
            np.clip((sy - 12) / 34, 0, 1), np.clip((762 - sy) / 30, 0, 1),
            np.clip((2.1 - th) / 0.3, 0, 1)])
        inside = inside * inside * (3 - 2 * inside)
        # where the atlas had its ears (now plain fill) our own skin and hair take over
        em = ndimage.map_coordinates(ear_mask(H), [np.clip(sy, 0, H - 1), np.clip(sx, 0, Wd - 1)], order=1)
        inside = inside * (1 - 0.9 * em)
        skin = np.median(atlas[700:760, 470:550].reshape(-1, 3), 0)
        return self._finish(col, inside, skin, hair, crop, seed, line, pepper)

    def _finish(self, col, inside, skin, hair, crop, seed, line, pepper, field=None):
        size, cov, pts = self.size, self.cov, self.pts
        hairm = self.hairmask(pts, seed, line) * ~self.ear_px
        st = self.strands(pts, seed)
        mid = vnoise(pts, 18, seed + 2)
        dens = np.clip(crop * (0.6 + 0.5 * mid) * hairm * (0.55 + 0.9 * st), 0, 1)
        hcol = self.tone(pts, hair, st, seed, pepper)
        skin_v = skin * (0.94 + 0.12 * vnoise(pts, 5, seed + 3))[:, None] if field is None else field
        scalp = skin_v * (1 - dens[:, None]) + hcol * dens[:, None]
        # over the scalp the atlas's painted hair stays, but where it is only skin our crop shows
        out_c = col * inside[:, None] + scalp * (1 - inside[:, None])
        img = np.zeros((size, size, 3)); img[cov] = out_c
        self.skin = skin
        return np.clip(self.fill(img, cov, skin), 0, 255).astype(np.uint8)

    def shell(self, hair, crop=0.6, seed=1, line=0.0, pepper=0.0):
        """The hair shells' texture: colour, and in alpha how far out each strand reaches (the
        shells cut it at rising thresholds). RGBA uint8."""
        size, cov, pts = self.size, self.cov, self.pts
        hairm = self.hairmask(pts, seed, line) * ~self.ear_px
        st = self.strands(pts, seed)
        tone = vnoise(pts, 12, seed + 5)
        col = self.tone(pts, hair, st, seed, pepper) * (0.88 + 0.24 * tone)[:, None]
        a = np.clip((st - 0.35) * 2.2, 0, 1) * np.clip(hairm * 1.4 - 0.2, 0, 1) * min(1, crop * 1.5)
        img = np.zeros((size, size, 4)); img[cov, :3] = col; img[cov, 3] = a * 255
        rgb = self.fill(img[..., :3].copy(), cov, np.array(hair) * 255)
        img[..., :3] = rgb
        return np.clip(img, 0, 255).astype(np.uint8)

    def vertex_hair(self, seed=1, line=0.0):
        return self.hairmask(self.hv_paint, seed, line) * ~self.ear_vert
