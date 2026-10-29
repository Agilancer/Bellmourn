"""Clay renderer: the Daggerfall / Donkey Kong Country way of making a sprite, in numpy.

A creature is a set of solid primitives (spheres, ellipsoids, tapered capsules) wedged into each
other, each with a material. It is ray-marched orthographically at SS x the final resolution,
lit by one warm key light from above-left-front (casting hard shadows) plus a weak cool fill,
then box-filtered down to game pixels and mapped onto the material's palette ramp.
Hand-pixel details are painted afterwards on the small image.

Units: metres. x = screen right, y = up, z = toward the viewer.
"""
import json
import os

import numpy as np

PX_PER_M = 64
ROOT = os.environ.get("BELLMOURN_ROOT", "")


def norm(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


# ----------------------------------------------------------------- primitives
# each returns signed distance for points p (N,3)

def sd_sphere(p, c, r):
    return np.linalg.norm(p - c, axis=1) - r


def sd_ellipsoid(p, c, r, rot=None):
    q = p - c
    if rot is not None:
        q = q @ rot  # rot: columns = local axes in world space
    q = q / r
    k0 = np.linalg.norm(q, axis=1)
    k1 = np.linalg.norm(q / r, axis=1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


def sd_cone(p, a, b, ra, rb):
    """Capsule from a to b whose radius tapers from ra to rb."""
    ba = b - a
    pa = p - a
    h = np.clip(pa @ ba / (ba @ ba), 0.0, 1.0)
    return np.linalg.norm(pa - h[:, None] * ba, axis=1) - (ra + (rb - ra) * h)


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


# ----------------------------------------------------------------- value noise

def _hash(ix, iy, iz, seed):
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 1442695041) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return (h & 0xFFFF) / 65535.0


def noise3(p, scale, seed=0):
    """Smooth value noise in [0,1] at points p (N,3)."""
    q = p * scale
    i = np.floor(q).astype(np.int64)
    f = q - i
    f = f * f * (3 - 2 * f)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * \
                    (f[:, 2] if dz else 1 - f[:, 2])
                out = out + w * _hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out


def fbm(p, scale, seed=0, octaves=3):
    s, a, tot, acc = scale, 1.0, 0.0, 0
    for o in range(octaves):
        acc = acc + a * noise3(p, s, seed + o * 17)
        tot += a
        s *= 2.1
        a *= 0.5
    return acc / tot


# ----------------------------------------------------------------- rendering

class Scene:
    """`field(p)` -> (distance, material index) for points p (N,3)."""

    def __init__(self, field, light=(-0.62, 0.68, 0.45), fill=(0.7, 0.1, 0.6), pitch=12.0,
                 yaw=0.0):
        """`pitch`: the camera looks down on the creature by this many degrees, the way a
        player at eye height sees it a few metres away. Lights are fixed in camera space."""
        c, s = np.cos(np.radians(pitch)), np.sin(np.radians(pitch))
        cy, sy = np.cos(np.radians(yaw)), np.sin(np.radians(yaw))
        # world -> camera: turn the creature by `yaw` (its facing (0,0,1) goes to
        # (sin yaw, 0, cos yaw)), then look down by `pitch`
        self.R = np.array([[1, 0, 0], [0, c, -s], [0, s, c]]) @             np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
        self.world_field = field
        self.field = lambda p: field(p @ self.R)
        self.light = norm(light)
        self.fill = norm(fill)
        # painters cheat: only nearby forms cast shadows (an arm on the ribs, the brow on
        # the eyes), not the big head blacking out the whole chest
        self.shadow_reach = 0.09

    def dist(self, p):
        return self.field(p)[0]

    def render(self, x0, x1, y0, y1, ss=4, z0=0.9, steps=96):
        """Ray-march an orthographic image. Returns per-subpixel arrays (H*ss, W*ss)."""
        W = int(round((x1 - x0) * PX_PER_M))
        H = int(round((y1 - y0) * PX_PER_M))
        sw, sh = W * ss, H * ss
        xs = x0 + (np.arange(sw) + 0.5) / (PX_PER_M * ss)
        ys = y1 - (np.arange(sh) + 0.5) / (PX_PER_M * ss)
        X, Y = np.meshgrid(xs, ys)
        o = np.stack([X.ravel(), Y.ravel(), np.full(X.size, z0)], 1)
        t = np.zeros(len(o))
        hit = np.zeros(len(o), bool)
        alive = np.ones(len(o), bool)
        for _ in range(steps):
            idx = np.nonzero(alive)[0]
            if not len(idx):
                break
            p = o[idx].copy()
            p[:, 2] -= t[idx]
            d = self.dist(p)
            t[idx] += np.maximum(d, 0.0004)
            done = d < 0.0006
            hit[idx[done]] = True
            alive[idx[done]] = False
            alive[idx[t[idx] > 2 * z0]] = False
        P = o.copy()
        P[:, 2] -= t
        res = dict(W=W, H=H, ss=ss, hit=hit.reshape(sh, sw), bounds=(x0, x1, y0, y1))
        hi = np.nonzero(hit)[0]
        ph = P[hi]
        e = 0.0015
        n = np.stack([self.dist(ph + [e, 0, 0]) - self.dist(ph - [e, 0, 0]),
                      self.dist(ph + [0, e, 0]) - self.dist(ph - [0, e, 0]),
                      self.dist(ph + [0, 0, e]) - self.dist(ph - [0, 0, e])], 1)
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
        _, mat = self.field(ph)
        # hard shadow from the key light
        sp = ph + n * 0.012          # clear of the bumpy surface (ribs, folds): no shadow acne
        st = np.full(len(sp), 0.01)
        lit = np.ones(len(sp))
        act = np.ones(len(sp), bool)
        for _ in range(48):
            idx = np.nonzero(act)[0]
            if not len(idx):
                break
            d = self.dist(sp[idx] + self.light * st[idx, None])
            blocked = d < 0.002
            lit[idx[blocked]] = 0.0
            act[idx[blocked]] = False
            st[idx] += np.maximum(d * 0.8, 0.003)
            act[idx[st[idx] > self.shadow_reach]] = False
        # ambient occlusion from the distance field
        ao = np.ones(len(ph))
        for k, w in ((0.012, 0.5), (0.03, 0.3), (0.06, 0.2)):
            ao -= w * np.clip((k - self.dist(ph + n * k)) / k, 0, 1)
        res.update(zc=ph[:, 2], P=ph @ self.R, n=n, mat=mat, shadow=lit, ao=np.clip(ao, 0, 1), index=hi)
        return res


def shade(res, light, fill):
    """Hard key light with cast shadows, a weak cool fill, ambient occlusion, and a darkening
    of surfaces that turn away from the viewer so every form reads round."""
    n = res["n"]
    key = np.clip(n @ light, 0, 1) * res["shadow"]
    fil = np.clip(n @ fill, 0, 1)
    turn = 0.72 + 0.28 * np.clip(n[:, 2], 0, 1)
    return np.clip(0.05 + 0.90 * key + 0.12 * fil, 0, 1) * (0.5 + 0.5 * res["ao"]) * turn


def load_palette(root):
    with open(os.path.join(root, "templates", "style", "bellmourn_palette.json")) as f:
        p = json.load(f)
    cols = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in p["colors"]], np.uint8)
    return {name: cols[i * 16:(i + 1) * 16] for i, name in enumerate(p["ramps"])}, cols


def depth(res):
    """Per game pixel: mean camera z of the hits (bigger = nearer the viewer)."""
    W, H, ss = res["W"], res["H"], res["ss"]
    Z = np.zeros(H * ss * W * ss)
    Z[res["index"]] = res["zc"]
    hit = res["hit"].reshape(H, ss, W, ss)
    return Z.reshape(H, ss, W, ss).sum(axis=(1, 3)) / np.maximum(hit.sum(axis=(1, 3)), 1)


def downsample(res, value, mat):
    """Box-filter subpixels to game pixels: mean value, majority material, coverage."""
    W, H, ss = res["W"], res["H"], res["ss"]
    sh, sw = H * ss, W * ss
    V = np.zeros(sh * sw)
    M = np.full(sh * sw, -1)
    V[res["index"]] = value
    M[res["index"]] = mat
    V = V.reshape(H, ss, W, ss)
    M = M.reshape(H, ss, W, ss).transpose(0, 2, 1, 3).reshape(H, W, ss * ss)
    hit = res["hit"].reshape(H, ss, W, ss)
    cov = hit.mean(axis=(1, 3))
    vsum = V.sum(axis=(1, 3))
    vmean = vsum / np.maximum(hit.sum(axis=(1, 3)), 1)
    nm = M.max() + 1
    counts = np.stack([(M == k).sum(axis=2) for k in range(max(nm, 1))], 2)
    major = counts.argmax(axis=2)
    return vmean, major, cov


def project(scene, res, pw):
    """World point(s) -> game pixel (col, row) floats."""
    pc = np.atleast_2d(pw) @ scene.R.T
    x0, x1, y0, y1 = res["bounds"]
    return np.stack([(pc[:, 0] - x0) * PX_PER_M, (y1 - pc[:, 1]) * PX_PER_M], 1)
