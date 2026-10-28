"""A tiny flat-shaded triangle renderer (painter's algorithm) on top of PIL.

Used to draw the 3D arm into the 2D rig sheets and to draw model previews on texture sheets.
"""
import numpy as np

from geom import norm

LIGHT = norm([-0.5, 0.8, -0.4])  # from above-left, in front of the viewer (camera space)


def shade(color, n, light=LIGHT, ambient=0.42):
    lit = ambient + (1 - ambient) * max(0.0, float(np.dot(n, light)))
    return tuple(int(c * lit) for c in color[:3]) + ((color[3],) if len(color) > 3 else (255,))


def clip_near(tri, near):
    """Clip a triangle (3 camera-space points) to z >= near. Returns a polygon or []."""
    out = []
    for i in range(3):
        a, b = tri[i], tri[(i + 1) % 3]
        ina, inb = a[2] >= near, b[2] >= near
        if ina:
            out.append(a)
        if ina != inb:
            t = (near - a[2]) / (b[2] - a[2])
            out.append(a + (b - a) * t)
    return out


def faces(tris, colors, project, near=0.06, light=LIGHT, cull=True, eye=(0, 0, 0)):
    """Shaded, depth-keyed 2D polygons for a set of camera-space triangles.
    Returns [(depth, [screen points], rgba)] for the caller to sort and draw (so other
    shapes can be interleaved by depth)."""
    out = []
    eye = np.asarray(eye, float)
    for tri, col in zip(tris, colors):
        n = np.cross(tri[1] - tri[0], tri[2] - tri[0])
        ln = np.linalg.norm(n)
        if ln < 1e-12:
            continue
        n = n / ln
        if cull and np.dot(n, tri[0] - eye) >= 0:
            continue
        poly = clip_near(tri, near)
        if len(poly) < 3:
            continue
        depth = float(np.mean([p[2] for p in tri]))
        out.append((depth, [project(p) for p in poly], shade(col, n, light)))
    return out


def draw(draw_ctx, polys, scale=1.0):
    """Draw [(depth, pts, rgba)] far to near."""
    for _, pts, col in sorted(polys, key=lambda f: -f[0]):
        draw_ctx.polygon([(float(x) * scale, float(y) * scale) for x, y in pts], fill=col)
