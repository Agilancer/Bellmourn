"""Wrapping a skin atlas round the body: projections from its islands, baked into the model's UVs.

A skin atlas paints a body for some other model's UV layout: a face sheet unwrapped round the
head with the ears at its sides, the back of the head, the torso front and back, a strip per
side of each limb, the backs of the hands, the tops and soles of the feet. None of it fits this
body's UVs, so each island is projected onto the body the way it was painted:

  cyl     round an axis: across the strip is the angle about the axis (0 at the `front`
          direction, positive toward `right`), along it the distance down the axis. Face, back of
          the head, torso front and back, and a strip per side of each arm and leg.
  planar  straight along a direction: across is the distance along `right`, along the distance
          along `down`. The backs of the hands, the tops and soles of the feet, the crown.

`a` (across) and `b` (along) are mapped through knots (piecewise linear: angle or metres ->
0..1) and then onto the island by three corners (p00, p10, p01: a=0,b=0 / a=1,b=0 / a=0,b=1),
so islands lying on their side or mirrored are only a matter of corners. A projection counts
where its body region is (soft weights from capsules round the bones), inside its knot range
(feathered at the ends), facing it (planar only) and on paint (the island mask, feathered).
Where several count they are blended; where none does, the nearest painted point is used.
"""
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree


# ---------------------------------------------------------------- the atlas

class Atlas:
    def __init__(self, path, thresh=40, erode=8, feather=6.0, bg=None):
        im = Image.open(path).convert("RGB")
        self.rgb = np.asarray(im).astype(np.float32) / 255.0
        H, W, _ = self.rgb.shape
        self.size = (W, H)
        if bg is None:
            b = np.concatenate([self.rgb[:3].reshape(-1, 3), self.rgb[-3:].reshape(-1, 3),
                                self.rgb[:, :3].reshape(-1, 3), self.rgb[:, -3:].reshape(-1, 3)])
            bg = np.median(b, 0)
        else:
            bg = np.array(bg, np.float32) / 255.0
        # background: near the border's colour AND flat (paint always has grain; the sheet's
        # background is one flat colour, however close it comes to the skin's)
        d = np.linalg.norm(self.rgb - bg, axis=2) * 255
        lum = self.rgb @ np.array([0.3, 0.55, 0.15], np.float32) * 255
        var = ndimage.uniform_filter(lum * lum, 5) - ndimage.uniform_filter(lum, 5) ** 2
        flat = var < 6.0
        background = (d < thresh) & flat
        background = ndimage.binary_opening(background, iterations=1)
        m = ~ndimage.binary_dilation(background, iterations=1)
        m = ndimage.binary_opening(m, iterations=2)
        if erode:
            m = ndimage.binary_erosion(m, iterations=erode)
        dist = ndimage.distance_transform_edt(m)
        self.mask = np.clip(dist / feather, 0, 1).astype(np.float32)

    def inpaint(self, boxes):
        """Inside these boxes (the hands, the feet), the sheet's background between painted fingers
        and toes takes the colour of the nearest paint, and counts as paint: the model's fingers lie
        where they lie, not where the painter's did."""
        for x0, y0, x1, y1 in boxes:
            sub = self.mask[y0:y1, x0:x1]
            paint = sub > 0.5
            if not paint.any():
                continue
            _, (iy, ix) = ndimage.distance_transform_edt(~paint, return_indices=True)
            rgb = self.rgb[y0:y1, x0:x1]
            self.rgb[y0:y1, x0:x1] = rgb[iy, ix]
            self.mask[y0:y1, x0:x1] = 1.0

    def sample(self, x, y):
        """Bilinear colour and mask at pixel coordinates (x right, y down)."""
        W, H = self.size
        x = np.clip(x - 0.5, 0, W - 1.001)
        y = np.clip(y - 0.5, 0, H - 1.001)
        x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
        fx, fy = (x - x0)[:, None], (y - y0)[:, None]

        def bil(img):
            img = img if img.ndim == 3 else img[..., None]
            a = img[y0, x0] * (1 - fx) + img[y0, x0 + 1] * fx
            b = img[y0 + 1, x0] * (1 - fx) + img[y0 + 1, x0 + 1] * fx
            return a * (1 - fy) + b * fy
        return bil(self.rgb), bil(self.mask)[:, 0]


# ---------------------------------------------------------------- body regions

def capsules(J):
    """Body regions as capsules (a, b, radius) from the rig joints J {bone: (head, tail)}."""
    g = lambda n: np.array(J[n][0], float)
    t = lambda n: np.array(J[n][1], float)
    caps = {
        "head": [(g("head") + [0, -0.01, 0.03], t("head") - [0, 0, 0.1], 0.085), (g("neck") - [0, 0, 0.0], g("head") + [0, 0, 0.0], 0.045)],
        "torso": [(g("hips") + [0, 0, 0.02], g("neck") - [0, 0, 0.09], 0.115)],
    }
    for s in "LR":
        caps["arm" + s] = [(g(f"upper_arm.{s}"), g(f"hand.{s}"), 0.04)]
        caps["hand" + s] = [(g(f"hand.{s}"), t(f"hand.{s}"), 0.022)]
        caps["leg" + s] = [(g(f"thigh.{s}"), g(f"foot.{s}"), 0.06)]
        caps["foot" + s] = [(g(f"foot.{s}") - [0, 0, 0.03], t(f"foot.{s}") + [0, 0, 0.0], 0.035)]
    return caps


def seg_dist(P, a, b):
    d = b - a
    t = np.clip(((P - a) @ d) / max(d @ d, 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * d), axis=1)


def regions(P, caps, tau=0.018):
    """Soft region weights {region: (N,)} that sum to 1 at every point."""
    names = list(caps)
    D = np.stack([np.min([seg_dist(P, a, b) - r for a, b, r in caps[n]], 0) for n in names], 1)
    W = np.exp(-(D - D.min(1, keepdims=True)) / tau)
    W /= W.sum(1, keepdims=True)
    return {n: W[:, i] for i, n in enumerate(names)}


def glow(C, hue, vmin, smin=0.45):
    """How much each colour glows: paint in the hue range (0..1, wrapping), bright and saturated."""
    mx, mn = C.max(1), C.min(1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    r, g_, b = C[:, 0], C[:, 1], C[:, 2]
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g_ - b) / d) % 6, np.where(mx == g_, (b - r) / d + 2, (r - g_) / d + 4)) / 6
    lo, hi = hue
    inh = (h >= lo) & (h <= hi) if lo <= hi else (h >= lo) | (h <= hi)
    k = np.clip((mx - vmin) / 0.2, 0, 1) * np.clip((sat - smin) / 0.25, 0, 1) * inh
    return k


# ---------------------------------------------------------------- projections

def smooth_window(x, lo, hi, feather):
    if feather <= 0:
        return ((x >= lo) & (x <= hi)).astype(np.float32)
    return np.clip((x - lo) / feather, 0, 1) * np.clip((hi - x) / feather, 0, 1)


def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def project(pr, P, N):
    """(x, y, weight-without-region) in atlas pixels for projection `pr` at points P (normals N)."""
    o = np.asarray(pr["origin"], float)
    q = P - o
    if pr["kind"] == "cyl":
        ax = unit(pr["axis"])
        f = unit(pr["front"])
        r = unit(pr["right"])
        f = unit(f - ax * (f @ ax))
        r = unit(r - ax * (r @ ax) - f * (r @ f))
        s = q @ ax
        qa = q - s[:, None] * ax
        A = np.degrees(np.arctan2(qa @ r, qa @ f))
        B = s / pr.get("length", 1.0)
        # a cylinder smears where the surface turns to face along its axis (the tops of the
        # shoulders under the torso's, the ends of limbs): fade it out there
        along = np.abs(N @ ax)
        facing = np.clip((0.97 - along) / 0.4, 0.25, 1).astype(np.float32)
        if pr.get("outward", 0):
            # only the outer surface: normals pointing away from the axis
            rad = qa / np.maximum(np.linalg.norm(qa, axis=1, keepdims=True), 1e-9)
            facing = facing * np.clip((np.einsum("ij,ij->i", N, rad) - 0.0) / 0.3, 0, 1)
    else:
        r = unit(pr["right"])
        dn = unit(pr["down"])
        view = unit(np.cross(r, dn)) if "view" not in pr else unit(pr["view"])
        A, B = q @ r, q @ dn
        dot = -(N @ view)
        facing = np.clip(dot, 0, 1) ** pr.get("facing_pow", 2.0)
        if pr.get("side_floor"):    # surfaces seen edge-on (the sides of fingers and toes) still take some
            facing = np.maximum(facing, pr["side_floor"] * np.clip((dot + 0.35) / 0.35, 0, 1))
    if "near" in pr:            # only round a point (an ear)
        c, rad = pr["near"]
        facing = facing * np.clip(1.5 - np.linalg.norm(P - np.asarray(c, float), axis=1) / rad, 0, 1)
    ak, av = zip(*pr["a"])
    bk, bv = zip(*pr["b"])
    fa, fb = pr.get("feather", (12.0, 0.04))
    w = smooth_window(A, ak[0], ak[-1], fa) * smooth_window(B, bk[0], bk[-1], fb) * facing
    a = np.interp(A, ak, av)
    b = np.interp(B, bk, bv)
    p00, p10, p01 = (np.asarray(c, float) for c in pr["corners"])
    xy = p00 + a[:, None] * (p10 - p00) + b[:, None] * (p01 - p00)
    if "clip" in pr:            # never read past the island's box
        x0, y0, x1, y1 = pr["clip"]
        w = w * (xy[:, 0] >= x0 - 1) * (xy[:, 0] <= x1 + 1) * (xy[:, 1] >= y0 - 1) * (xy[:, 1] <= y1 + 1)
    return xy[:, 0], xy[:, 1], w.astype(np.float32)


def balance(spec, atlas, P, N, caps, strength=(0.5, 0.85), step=5):
    """Even out the islands' tones: each projection's average colour over the body is pulled toward
    the average of them all (half way on the head, most of the way elsewhere), so no island (the
    back, say) reads as a garment of another colour. Sets pr["gain"]."""
    p, n = P[::step], N[::step]
    reg = regions(p, caps)
    means, mass = [], []
    for pr in spec["projections"]:
        rw = sum(reg[k] for k in pr["region"].split("+"))
        x, y, w = project(pr, p, n)
        c, mk = atlas.sample(x, y)
        w = w * mk * rw
        m = w.sum()
        means.append((c * w[:, None]).sum(0) / max(m, 1e-9))
        mass.append(m)
    means, mass = np.array(means), np.array(mass)
    ref = (means * mass[:, None]).sum(0) / max(mass.sum(), 1e-9)
    for pr, mu, m in zip(spec["projections"], means, mass):
        k = strength[0] if pr["region"] == "head" else strength[1]
        g = np.clip(1 + (ref / np.maximum(mu, 1e-3) - 1) * k, 0.7, 1.45) if m > 1e-6 else np.ones(3)
        pr["gain"] = g.astype(np.float32)


def shade(spec, atlas, P, N, caps, gamma=2.0, chunk=400000):
    """Colours (N,3) and total weight (N,) for points P with normals N."""
    out = np.zeros((len(P), 3), np.float32)
    tot = np.zeros(len(P), np.float32)
    for s in range(0, len(P), chunk):
        p, n = P[s:s + chunk], N[s:s + chunk]
        reg = regions(p, caps)
        acc = np.zeros((len(p), 3), np.float32)
        wt = np.zeros(len(p), np.float32)
        for pr in spec["projections"]:
            rw = sum(reg[k] for k in pr["region"].split("+"))
            m = rw > 0.02
            if not m.any():
                continue
            x, y, w = project(pr, p[m], n[m])
            c, mk = atlas.sample(x, y)
            if "gain" in pr:
                c = c * pr["gain"]
            w = (w * mk * rw[m] * pr.get("weight", 1.0)) ** gamma
            acc[m] += c * w[:, None]
            wt[m] += w
        good = wt > 1e-6
        acc[good] /= wt[good, None]
        out[s:s + chunk], tot[s:s + chunk] = acc, wt
    return out, tot


def fill_gaps(P, C, W, eps=0.004):
    """Points no projection covers well (total weight under eps, where only the faint edges of
    islands reach and the sheet's background creeps in) fade to the colour of the nearest
    well-covered points."""
    good = W > eps
    if good.all() or not good.any():
        return C
    tree = cKDTree(P[good])
    _, i = tree.query(P[~good], k=6)
    k = np.clip(W[~good] / eps, 0, 1)[:, None]
    C = C.copy()
    C[~good] = C[~good] * k + C[good][i].mean(1) * (1 - k)
    return C


# ---------------------------------------------------------------- texture-space baking

def raster(uv, tris, size):
    """Texels covered by the UV triangles: (pixel ids (n,), triangle ids (n,), barycentrics (n,3)).
    uv: (V,2) in 0..1 per corner index used by tris (T,3)."""
    S = size
    pix, tid, bar = [], [], []
    U = uv * S - 0.5
    for t, (i, j, k) in enumerate(tris):
        a, b, c = U[i], U[j], U[k]
        x0, x1 = int(np.floor(min(a[0], b[0], c[0]))), int(np.ceil(max(a[0], b[0], c[0])))
        y0, y1 = int(np.floor(min(a[1], b[1], c[1]))), int(np.ceil(max(a[1], b[1], c[1])))
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, S - 1), min(y1, S - 1)
        if x1 < x0 or y1 < y0:
            continue
        X, Y = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        X, Y = X.ravel().astype(float), Y.ravel().astype(float)
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12:
            continue
        l1 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / d
        l2 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / d
        l3 = 1 - l1 - l2
        e = -1e-3
        m = (l1 >= e) & (l2 >= e) & (l3 >= e)
        if not m.any():
            continue
        pix.append((Y[m] * S + X[m]).astype(np.int64))
        tid.append(np.full(m.sum(), t, np.int32))
        bar.append(np.stack([l1[m], l2[m], l3[m]], 1))
    pix, tid, bar = np.concatenate(pix), np.concatenate(tid), np.concatenate(bar)
    pix, first = np.unique(pix, return_index=True)          # a texel on a shared edge: once
    return pix, tid[first], np.clip(bar[first], 0, 1)


def dilate(img, filled, iterations=16):
    """Bleed the painted texels outward into empty UV space (mipmaps stay clean)."""
    img, filled = img.copy(), filled.copy()
    for _ in range(iterations):
        s = np.zeros_like(img)
        c = np.zeros(filled.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            f = np.roll(np.roll(filled, dy, 0), dx, 1)
            s += np.roll(np.roll(img, dy, 0), dx, 1) * f[..., None]
            c += f
        new = (~filled) & (c > 0)
        img[new] = s[new] / c[new, None]
        filled |= new
        if filled.all():
            break
    return img


def bake(V, Nv, tris, uvs, spec, atlas, caps, size=2048, post=None):
    """The skin texture (size, size, 3) in 0..1. V/Nv: corner positions/normals (C,3) indexed by
    tris (T,3) like uvs (C,2). post(P, N, colour) may change the colours (dirt, AO...)."""
    pix, tid, bar = raster(uvs, tris, size)
    T = tris[tid]
    P = np.einsum("nk,nkd->nd", bar, V[T])
    N = np.einsum("nk,nkd->nd", bar, Nv[T])
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    C, W = shade(spec, atlas, P, N, caps)
    C = fill_gaps(P, C, W)
    if post:
        C = post(P, N, C)
    img = np.zeros((size * size, 3), np.float32)
    img[pix] = C
    filled = np.zeros(size * size, bool)
    filled[pix] = True
    img = dilate(img.reshape(size, size, 3), filled.reshape(size, size))
    return np.clip(img, 0, 1), (pix, P, N)
