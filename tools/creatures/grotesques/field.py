"""A soft occupancy field on a regular grid: the clay the monsters are sculpted in.

Values run 0 (outside) to 1 (inside); the surface is the 0.5 level, pulled out by marching cubes.
Closed meshes are filled by ray parity along +Z (each connected shell on its own, so shells that
overlap don't cancel). Primitives (capsules, ellipsoids) come in as signed distances turned
into occupancy with a soft edge; `add` is a soft union (a + b - ab), `cut` a soft difference,
and `blur` melts small features (hems, low-poly facets) into rounded flesh.
"""
import numpy as np
from scipy import ndimage
from skimage import measure


class Field:
    def __init__(self, lo, hi, h=0.004):
        self.h = h
        self.lo = np.array(lo, float)
        self.n = np.ceil((np.array(hi, float) - self.lo) / h).astype(int) + 1
        self.v = np.zeros(self.n, np.float32)

    def centres(self, axis):
        return self.lo[axis] + np.arange(self.n[axis]) * self.h

    # ---------------------------------------------------------------- meshes
    def fill_mesh(self, verts, tris):
        """Union in the inside of a closed triangle mesh (verts (n,3), tris (m,3))."""
        occ = np.zeros(self.n, bool)
        for comp in components(tris, len(verts)):
            occ |= self._parity(verts, tris[comp])
        self.v = np.maximum(self.v, occ.astype(np.float32))

    def _parity(self, V, T):
        h, lo, n = self.h, self.lo, self.n
        jx, jy = 0.37e-4, 0.61e-4                  # keep rays off edges and vertices
        P = V[T]                                   # (m,3,3)
        tog = np.zeros(n, np.int16)
        xs, ys = self.centres(0) + jx, self.centres(1) + jy
        for p in P:
            x0, x1 = p[:, 0].min(), p[:, 0].max()
            y0, y1 = p[:, 1].min(), p[:, 1].max()
            i0, i1 = np.searchsorted(xs, x0), np.searchsorted(xs, x1)
            j0, j1 = np.searchsorted(ys, y0), np.searchsorted(ys, y1)
            if i1 <= i0 or j1 <= j0:
                continue
            X, Y = np.meshgrid(xs[i0:i1], ys[j0:j1], indexing="ij")
            a, b, c = p
            d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(d) < 1e-14:
                continue
            l1 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / d
            l2 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / d
            l3 = 1 - l1 - l2
            m = (l1 >= 0) & (l2 >= 0) & (l3 >= 0)
            if not m.any():
                continue
            z = l1 * a[2] + l2 * b[2] + l3 * c[2]
            k = np.ceil((z - lo[2]) / h).astype(int)
            k = np.clip(k, 0, n[2] - 1)
            ii, jj = np.nonzero(m)
            np.add.at(tog, (ii + i0, jj + j0, k[m]), 1)
        total = tog.sum(2)
        inside = (np.cumsum(tog, 2) % 2).astype(bool)
        inside[total % 2 == 1] = False             # a column through a crack: trust none of it
        return inside

    # ---------------------------------------------------------------- primitives
    def _box(self, lo, hi):
        i0 = np.clip(np.floor((np.array(lo) - self.lo) / self.h).astype(int), 0, self.n - 1)
        i1 = np.clip(np.ceil((np.array(hi) - self.lo) / self.h).astype(int) + 1, 0, self.n)
        sl = tuple(slice(a, b) for a, b in zip(i0, i1))
        g = np.meshgrid(*[self.lo[k] + np.arange(i0[k], i1[k]) * self.h for k in range(3)], indexing="ij")
        return sl, np.stack(g, -1)

    def _occ(self, d, soft):
        return np.clip(0.5 - d / (2 * soft), 0, 1).astype(np.float32)

    def apply(self, sdf, lo, hi, mode="add", soft=0.003, amount=1.0):
        """Apply a primitive given as sdf(points (...,3)) -> distance, inside the box lo..hi."""
        sl, X = self._box(lo, hi)
        if X.size == 0:
            return
        b = self._occ(sdf(X), soft) * amount
        a = self.v[sl]
        if mode == "add":
            self.v[sl] = a + b - a * b
        elif mode == "max":
            self.v[sl] = np.maximum(a, b)
        elif mode == "cut":
            self.v[sl] = a * (1 - b)

    def capsule(self, a, b, ra, rb, mode="add", soft=0.003, amount=1.0):
        a, b = np.array(a, float), np.array(b, float)
        r = max(ra, rb) + 3 * soft
        lo, hi = np.minimum(a, b) - r, np.maximum(a, b) + r
        self.apply(lambda X: sd_capsule(X, a, b, ra, rb), lo, hi, mode, soft, amount)

    def ellipsoid(self, c, radii, R=None, mode="add", soft=0.003, amount=1.0):
        c, radii = np.array(c, float), np.array(radii, float)
        r = radii.max() + 3 * soft
        self.apply(lambda X: sd_ellipsoid(X, c, radii, R), c - r, c + r, mode, soft, amount)

    def box(self, c, half, r, mode="add", soft=0.003, amount=1.0):
        """A box with rounded edges (r), centre c, half extents `half`."""
        c, half = np.array(c, float), np.array(half, float)
        e = half.max() + 3 * soft
        self.apply(lambda X: sd_round_box(X, c, half, r), c - half - 3 * soft, c + half + 3 * soft, mode, soft, amount)

    def mask(self, fn):
        """A per-voxel weight (0..1) from fn(points (...,3))."""
        g = np.meshgrid(*[self.centres(k) for k in range(3)], indexing="ij", sparse=True)
        return np.asarray(fn(g), np.float32)

    def surface_y(self, z, x=0.0, back=True):
        """Where the clay's surface is along y at (x, z): its back (largest y) or its front."""
        i = int(round((x - self.lo[0]) / self.h))
        k = int(round((z - self.lo[2]) / self.h))
        col = self.v[i, :, k] > 0.5
        if not col.any():
            return None
        j = np.nonzero(col)[0]
        return float(self.lo[1] + (j.max() if back else j.min()) * self.h)

    def blur(self, sigma, mask=None):
        b = ndimage.gaussian_filter(self.v, sigma / self.h)
        self.v = b if mask is None else self.v + (b - self.v) * mask

    def mesh(self):
        V, F, N, _ = measure.marching_cubes(self.v, 0.5, spacing=(self.h,) * 3, allow_degenerate=False)
        return V + self.lo, F[:, ::-1].copy()


def sd_capsule(X, a, b, ra, rb):
    d = b - a
    L2 = max(d @ d, 1e-12)
    t = np.clip(((X - a) @ d) / L2, 0, 1)
    c = a + t[..., None] * d
    return np.linalg.norm(X - c, axis=-1) - (ra + (rb - ra) * t)


def sd_round_box(X, c, half, r):
    q = np.abs(X - c) - (half - r)
    return np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(q.max(-1), 0) - r


def sd_ellipsoid(X, c, r, R=None):
    q = X - c
    if R is not None:
        q = q @ np.asarray(R)            # into the ellipsoid's frame (R's columns are its axes)
    k0 = np.linalg.norm(q / r, axis=-1)
    k1 = np.linalg.norm(q / (r * r), axis=-1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)


def components(tris, nv):
    """Face index arrays of each connected shell."""
    parent = np.arange(nv)

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for a, b, c in tris:
        ra, rb, rc = find(a), find(b), find(c)
        parent[rb] = ra
        parent[find(rc)] = ra
    roots = np.array([find(x) for x in range(nv)])
    fr = roots[tris[:, 0]]
    return [np.nonzero(fr == r)[0] for r in np.unique(fr)]
