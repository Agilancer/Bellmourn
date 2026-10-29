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


def zbuffer(tris, colors, project, size, near=0.01, light=LIGHT, bg=(30, 28, 34), ss=2,
            cull=True):
    """Depth-buffered render of camera-space triangles (for previews: correct overlaps even
    with long thin triangles, unlike the painter's sort above). Returns an RGB PIL image."""
    from PIL import Image
    w = h = size * ss
    depth = np.zeros((h, w))  # inverse depth: 1/z interpolates linearly on screen
    img = np.empty((h, w, 3), np.uint8)
    img[:] = bg
    for tri, col in zip(tris, colors):
        n = np.cross(tri[1] - tri[0], tri[2] - tri[0])
        ln = np.linalg.norm(n)
        if ln < 1e-12:
            continue
        n = n / ln
        if cull and np.dot(n, tri[0]) >= 0:
            continue
        poly = clip_near(tri, near)
        if len(poly) < 3:
            continue
        rgb = shade(col, n, light)[:3]
        pts = np.array([[project(p)[0] * ss, project(p)[1] * ss, p[2]] for p in poly])
        for k in range(1, len(pts) - 1):
            a, b, c = pts[0], pts[k], pts[k + 1]
            x0, x1 = int(max(min(a[0], b[0], c[0]), 0)), int(min(max(a[0], b[0], c[0]) + 1, w))
            y0, y1 = int(max(min(a[1], b[1], c[1]), 0)), int(min(max(a[1], b[1], c[1]) + 1, h))
            if x0 >= x1 or y0 >= y1:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
            det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(det) < 1e-9:
                continue
            l1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / det
            l2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / det
            l3 = 1 - l1 - l2
            inside = (l1 >= -1e-6) & (l2 >= -1e-6) & (l3 >= -1e-6)
            iz = l1 / a[2] + l2 / b[2] + l3 / c[2]
            sub = depth[y0:y1, x0:x1]
            win = inside & (iz > sub)
            sub[win] = iz[win]
            img[y0:y1, x0:x1][win] = rgb
    return Image.fromarray(img).resize((size, size), Image.LANCZOS)


def zbuffer_textured(tris, uvs, nrms, tex, project, w, h, light=LIGHT, bg=(30, 28, 34), ss=2,
                     ambient=0.45, spec=0.35, shininess=48):
    """Depth-buffered render of camera-space triangles with a texture (nearest texels, like
    the game) and smooth Blinn-Phong shading, for previews of textured models.
    `uvs` are per-corner (0..1, v down), `nrms` per-corner camera-space normals. RGB image."""
    from PIL import Image
    W, H = w * ss, h * ss
    t = np.asarray(tex.convert("RGB"), float)
    th, tw = t.shape[:2]
    depth = np.zeros((H, W))
    img = np.empty((H, W, 3))
    img[:] = bg
    L = np.asarray(light, float)
    for tri, uv, nr in zip(tris, uvs, nrms):
        if min(p[2] for p in tri) < 0.01:
            continue
        pts = np.array([[project(p)[0] * ss, project(p)[1] * ss, p[2]] for p in tri])
        a, b, c = pts
        x0, x1 = int(max(min(a[0], b[0], c[0]), 0)), int(min(max(a[0], b[0], c[0]) + 1, W))
        y0, y1 = int(max(min(a[1], b[1], c[1]), 0)), int(min(max(a[1], b[1], c[1]) + 1, H))
        if x0 >= x1 or y0 >= y1:
            continue
        det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(det) < 1e-9:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        l1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / det
        l2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / det
        l3 = 1 - l1 - l2
        inside = (l1 >= -1e-6) & (l2 >= -1e-6) & (l3 >= -1e-6)
        iz = l1 / a[2] + l2 / b[2] + l3 / c[2]
        sub = depth[y0:y1, x0:x1]
        win = inside & (iz > sub)
        if not win.any():
            continue
        sub[win] = iz[win]
        # perspective-correct corner weights
        wts = np.stack([l1 / a[2], l2 / b[2], l3 / c[2]], -1)[win] / iz[win][:, None]
        u = wts @ np.array([q[0] for q in uv])
        v = wts @ np.array([q[1] for q in uv])
        col = t[np.clip((v * th).astype(int), 0, th - 1), np.clip((u * tw).astype(int), 0, tw - 1)]
        n = wts @ np.asarray(nr, float)
        n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
        p = wts @ np.asarray(tri, float)  # camera-space point (the eye is the origin)
        view = -p / (np.linalg.norm(p, axis=1, keepdims=True) + 1e-9)
        n *= np.where((n * view).sum(1) < 0, -1.0, 1.0)[:, None]  # two-sided
        diff = np.clip(n @ L, 0, 1)
        half = view + L
        half /= np.linalg.norm(half, axis=1, keepdims=True)
        hl = np.clip((n * half).sum(1), 0, 1) ** shininess
        rgb = col * (ambient + (1 - ambient) * diff)[:, None] + 255 * spec * hl[:, None]
        img[y0:y1, x0:x1][win] = np.clip(rgb, 0, 255)
    return Image.fromarray(img.astype(np.uint8)).resize((w, h), Image.BOX)
