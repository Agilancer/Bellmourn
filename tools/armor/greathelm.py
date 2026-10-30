"""The great helm, after the user's reference sheet of crusader great helms (its bottom row):
a barrel of plate, a little tapered toward a flat riveted top, rounded-square in plan with
the face plates meeting at a ridge; a riveted brow band and a riveted bar down the middle
making a cross, the bar ending in a broadened foot; two eye slits cut right through either
side of the bar (the wearer sees out of them); breaths below them, a grid of round holes or
rows of slots; a rolled edge round the bottom.

It is built from its own geometry round the head (all the heads of that sex, plus padding),
not cast from a face, so it keeps its forged lines.
"""
import math

import numpy as np

from pieces import TAU, norm, piece

HEAD = {"Head": 1.0}


class Barrel:
    """The helm's surface: a superellipse in plan (half-width X at the sides, Yf to the front,
    Yb to the back, exponent n), scaled with height (a slight swell, a taper to the top),
    with `prow` pushing the middle of the face forward into a ridge."""

    def __init__(self, body, gap=0.016, n=2.6, taper=0.07, swell=0.015, prow=0.05, top=0.012,
                 chin=0.165, drop=0.03):
        H = body.heads
        e = body.eye
        band = H[(H[:, 2] > e - 0.13) & (H[:, 2] < e + 0.09)]
        self.cy = float(np.median(band[:, 1]))
        self.X = float(np.percentile(np.abs(band[:, 0]), 99.7)) + gap
        self.Yf = float(np.percentile(self.cy - band[:, 1], 99.7)) + gap
        self.Yb = float(np.percentile(band[:, 1] - self.cy, 99.7)) + gap
        self.z0, self.z1 = e - chin, float(H[:, 2].max()) + top
        self.n, self.taper, self.swell, self.prow, self.drop = n, taper, swell, prow, drop
        self.e = e

    def bottom(self, u):
        """The lower edge: a little lower at the chin than at the nape."""
        return self.z0 - self.drop * max(math.cos(u), 0.0) ** 2

    def scale(self, z):
        q = (z - self.z0) / (self.z1 - self.z0)
        return 1 + self.swell * math.sin(math.pi * min(max(q, 0), 1)) - self.taper * max(q, 0) ** 2

    def point(self, u, z, off=0.0):
        s = self.scale(z)
        c, si = math.cos(u), math.sin(u)
        k = 2.0 / self.n
        Y = self.Yf * (1 + self.prow * max(0.0, 1 - abs(si) * 3.2)) if c > 0 else self.Yb
        x = (self.X * s + off) * math.copysign(abs(si) ** k, si)
        y = self.cy - (Y * s + off) * math.copysign(abs(c) ** k, c)
        return np.array([x, y, z])

    def out(self, u, z):
        p = self.point(u, z)
        return norm(np.array([p[0], p[1] - self.cy, 0.0]))


def _grid(B, us, zs_of, off=0.0, wrap=False):
    """Vertices and quads over parameters us x rows (zs_of(u) gives each column's heights)."""
    cols = len(us)
    rows = len(zs_of(us[0]))
    V = [B.point(u, zs_of(u)[r], off) for r in range(rows) for u in us]
    F = []
    cc = cols if wrap else cols - 1
    for r in range(rows - 1):
        for c in range(cc):
            a, b = r * cols + c, r * cols + (c + 1) % cols
            F.append([a, b, b + cols, a + cols])
    return V, F


def _merge(parts):
    V, F = [], []
    for v, f in parts:
        o = len(V)
        V += list(v)
        F += [[o + i for i in q] for q in f]
    return np.array(V), F


def _dome(c, nrm, r, seg=8, h=None):
    """A small dome (a rivet head) on a surface: base centre c, outward normal nrm."""
    nrm = norm(nrm)
    ref = np.array([0, 0, 1.0]) if abs(nrm[2]) < 0.9 else np.array([1.0, 0, 0])
    u = norm(np.cross(nrm, ref))
    w = np.cross(nrm, u)
    h = r * 0.75 if h is None else h
    ring = [math.cos(TAU * k / seg) * u + math.sin(TAU * k / seg) * w for k in range(seg)]
    V = [c + r * d for d in ring] + [c + nrm * h * 0.7 + r * 0.6 * d for d in ring] + [c + nrm * h]
    F = [[k, (k + 1) % seg, seg + (k + 1) % seg, seg + k] for k in range(seg)]
    F += [[seg + k, seg + (k + 1) % seg, 2 * seg] for k in range(seg)]
    return V, F


def _disc(c, nrm, r, n=8, up=None, h=None):
    """A flat dark disc (a breath hole) or, with h, a slot h tall."""
    nrm = norm(nrm)
    up = np.array([0, 0, 1.0]) if up is None else up
    u = norm(np.cross(up, nrm))
    w = np.cross(nrm, u)
    if h is None:
        V = [c + r * (math.cos(TAU * k / n) * u + math.sin(TAU * k / n) * w) for k in range(n)]
    else:  # a slot rounded at both ends
        V = []
        for k in range(n):
            a = TAU * k / n
            dz = h / 2 if math.sin(a) > 0 else -h / 2
            V.append(c + r * math.cos(a) * u + (r * math.sin(a) + dz) * w)
    V.append(c)
    F = [[k, (k + 1) % n, n] for k in range(n)]
    return V, F


def great_helm(body, mat, trim, dark, name="great helm", rivets=None, breaths="dots",
               cross=True, gap=0.016, taper=0.07, prow=0.05, top=0.012, n=2.6, brow_shade=0.0,
               slit_h=0.024, slit_w=(0.13, 0.86), foot=True, vees=None, dot_rows=5, dot_cols=4,
               drop=0.03):
    """A great helm (see the module docstring). `trim` dresses the bands and the bar,
    `rivets` their rivet heads (trim if None), `dark` the breath holes. `breaths` is "dots",
    "slots" or None. `brow_shade` pushes the brow band out over the slits. `vees` sets Lord
    Velscour's V where the bar crosses the brow."""
    B = Barrel(body, gap, n, taper, prow=prow, top=top, drop=drop)
    e = B.e
    rivets = rivets or trim
    s0, s1 = e - slit_h * 0.45, e + slit_h * 0.55  # the eye slits, open through the plate
    zl = [None, e - 0.13, e - 0.09, e - 0.06, e - 0.035, s0, s1, e + 0.034, e + 0.07,
          B.z1 - 0.045, B.z1 - 0.022, B.z1 - 0.008]
    zs_of = lambda u: [B.bottom(u)] + zl[1:]
    us = sorted(set(np.round(np.concatenate([np.linspace(-math.pi, math.pi, 72, endpoint=False),
                                              [slit_w[0], slit_w[1], -slit_w[0], -slit_w[1]]]), 5)))
    V, F = _grid(B, us, zs_of, wrap=True)
    cols = len(us)
    keep = []
    for q in F:
        r, c = q[0] // cols, q[0] % cols
        um = (us[c] + us[(c + 1) % cols]) / 2 if c + 1 < cols else us[c]
        if r == 5 and slit_w[0] - 1e-6 <= abs(um) <= slit_w[1] + 1e-6:
            continue  # the eye slits
        keep.append(q)
    F = keep
    # the top: a rounded edge into a flat plate with the faintest rise
    ring_z = zl[-1]
    last = (len(zl) - 1) * cols
    rim_ring = []
    for u in us:
        p = B.point(u, ring_z)
        c = np.array([0.0, B.cy, ring_z])
        rim_ring.append(c + (p - c) * 0.955 + np.array([0, 0, 0.009]))
    o = len(V)
    V += rim_ring
    F += [[last + c, last + (c + 1) % cols, o + (c + 1) % cols, o + c] for c in range(cols)]
    V.append(np.array([0.0, B.cy, ring_z + 0.013]))
    top_c = len(V) - 1
    F += [[o + c, o + (c + 1) % cols, top_c] for c in range(cols)]
    cylspec = ("cyl", [0.0, B.cy, 0.0], [0.0, 0.0, 1.0], [0.0, 1.0, 0.0])
    out = [piece(name, np.array(V), F, mat, cylspec, w=HEAD, solid=0.003, group="helm", sharp=30)]
    out[0]["barrel"] = B

    # raised bands: round the top, across the brow, the bar down the middle and its foot
    bands = [_grid(B, list(np.linspace(-math.pi, math.pi, 73)), lambda u: [B.z1 - 0.036, B.z1 - 0.014], 0.004)]
    bu = list(np.linspace(-1.55, 1.55, 31))
    bands.append(_grid(B, bu, lambda u: [s1 + 0.002, s1 + 0.024], 0.004 + brow_shade))
    if brow_shade:  # the shade's underside, closing it back to the plate
        bands.append(_grid(B, bu, lambda u: [s1 + 0.002, s1 + 0.0021], 0.004))
    if cross:
        bands.append(_grid(B, list(np.linspace(-0.075, 0.075, 3)), lambda u: [B.bottom(u) + 0.012, B.z1 - 0.036], 0.0045))
        if foot:
            bands.append(_grid(B, list(np.linspace(-0.16, 0.16, 5)), lambda u: [B.bottom(u) + 0.012, B.bottom(u) + 0.03], 0.0045))
    bv, bf = _merge(bands)
    out.append(piece(f"{name} bands", bv, bf, trim, cylspec, w=HEAD, solid=0.003, group="helm", sharp=30))

    # the rolled bottom edge
    ring = np.array([B.point(u, B.bottom(u) + 0.003, 0.003) for u in np.linspace(-math.pi, math.pi, 72, endpoint=False)])
    from pieces import edge_tube
    rv, rf = edge_tube(ring, 0.0055)
    out.append(piece(f"{name} rim", rv, rf, trim, cylspec, w=HEAD, group="helm"))

    # rivets along the bands
    rv = []
    for u in np.linspace(-math.pi, math.pi, 26, endpoint=False):
        z = B.z1 - 0.025
        rv.append(_dome(B.point(u, z, 0.0072), B.out(u, z), 0.0042))
    for u in np.linspace(-1.45, 1.45, 11):
        if cross and abs(u) < 0.1:
            continue
        z = s1 + 0.013
        rv.append(_dome(B.point(u, z, 0.0072 + brow_shade), B.out(u, z), 0.0042))
    if cross:
        for z in np.linspace(B.bottom(0) + 0.045, B.z1 - 0.05, 7):
            if abs(z - (s1 + 0.013)) < 0.02:
                continue
            rv.append(_dome(B.point(0.0, z, 0.0077), B.out(0.0, z), 0.0042))
    v, f = _merge(rv)
    out.append(piece(f"{name} rivets", v, f, rivets, ("box",), w=HEAD, group="helm"))

    # breaths
    holes = []
    if breaths == "dots":
        for sgn in (1, -1):
            for i in range(dot_cols):
                u = sgn * (0.2 + 0.135 * i)
                for j in range(dot_rows):
                    z = e - 0.045 - 0.022 * j
                    holes.append(_disc(B.point(u, z, 0.0012), B.out(u, z), 0.0068))
    elif breaths == "slots":
        for sgn in (1, -1):
            for i in range(dot_cols):
                u = sgn * (0.2 + 0.14 * i)
                z = e - 0.085
                holes.append(_disc(B.point(u, z, 0.0012), B.out(u, z), 0.005, n=10, h=0.055))
    if holes:
        v, f = _merge(holes)
        out.append(piece(f"{name} breaths", v, f, dark, ("box",), w=HEAD, group="helm"))
    if vees:
        from plates import vee
        z = s1 + 0.065
        out.append(vee(name, B.point(0.0, z), B.out(0.0, z), (0, 0, 1), 0.05, *vees, group="helm"))
    return out


# ------------------------------------------------------------------ the sheet's other fittings


def fleur(helm, trim, r=0.011, name="fleur"):
    """Trefoil ends (three raised lobes) on the cross: atop the bar and at the brow's arms."""
    B = helm[0]["barrel"]
    e = B.e
    s1 = e + 0.012
    at = [(0.0, B.z1 - 0.05, 0.0), (-1.5, s1 + 0.013, 1.0), (1.5, s1 + 0.013, -1.0),
          (0.0, B.bottom(0) + 0.05, 0.0)]
    lobes = []
    for u, z, side in at:
        c = B.point(u, z, 0.006)
        n = B.out(u, z)
        up = np.array([0, 0, 1.0]) if side == 0 else norm(np.cross(n, [0, 0, 1.0])) * -side
        rt = norm(np.cross(up, n))
        sgn_top = 1 if z > e else -1
        for d in ((0, 1.6), (-1.15, 0.6), (1.15, 0.6)):
            p = c + (rt * d[0] + up * d[1] * (sgn_top if side == 0 else 1)) * r
            lobes.append(_dome(p, n, r * 0.85, h=r * 0.5))
    v, f = _merge(lobes)
    return piece(name, v, f, trim, ("box",), w=HEAD, group="helm")


def keyholes(helm, dark, name="breaths", cols=3, rows=2):
    """Keyhole breaths: a round hole over a short slot, in rows either side of the bar."""
    B = helm[0]["barrel"]
    e = B.e
    holes = []
    for sgn in (1, -1):
        for i in range(cols):
            u = sgn * (0.22 + 0.16 * i)
            for j in range(rows):
                z = e - 0.05 - 0.05 * j
                holes.append(_disc(B.point(u, z, 0.0012), B.out(u, z), 0.0075))
                holes.append(_disc(B.point(u, z - 0.022, 0.0012), B.out(u, z), 0.0035, n=8, h=0.022))
    v, f = _merge(holes)
    return piece(name, v, f, dark, ("box",), w=HEAD, group="helm")


def ram_horns(helm, mat, r=0.038, name="ram horn"):
    """Ram's horns rooted high on the sides, spiralling up, back, down and forward round the
    ears (the reference sheet's first helm), thinning as they curl."""
    from ornament import tube
    B = helm[0]["barrel"]
    out = []
    for s in (1, -1):
        c = np.array([s * (B.X + 0.075), B.cy + 0.035, B.z1 - 0.115])
        path = []
        a0, a1 = math.radians(128), math.radians(128 - 320)
        for k in np.linspace(0.0, 1.0, 24):
            ang = a0 + (a1 - a0) * k
            rad = 0.1 * (1 - 0.45 * k)
            path.append(c + np.array([s * (0.03 * math.sin(math.pi * k) - 0.07 * (1 - k) ** 4),
                                      rad * math.cos(ang), rad * math.sin(ang)]))
        out.append(tube(f"{name} {'L' if s > 0 else 'R'}", path, r, r * 0.3, mat, HEAD, n=10,
                        group="helm"))
    return out


def crest_boards(helm, mat, h=0.13, hook=0.06, w=0.07, t=0.016, name="crest board"):
    """Two flat boards standing up from the top and hooking outward (a U)."""
    B = helm[0]["barrel"]
    out = []
    for s in (1, -1):
        x0 = s * B.X * 0.55
        z0 = B.z1 - 0.005
        poly = [(x0 - s * t / 2, z0), (x0 + s * t / 2, z0), (x0 + s * t / 2, z0 + h - 0.015),
                (x0 + s * hook, z0 + h - 0.015), (x0 + s * hook, z0 + h + 0.012),
                (x0 - s * t / 2, z0 + h + 0.012)]
        V, F = [], []
        for y in (B.cy - w / 2, B.cy + w / 2):
            V += [np.array([x, y, z]) for x, z in poly]
        m = len(poly)
        F.append(list(range(m)))
        F.append(list(range(2 * m - 1, m - 1, -1)))
        for i in range(m):
            j = (i + 1) % m
            F.append([i, j, m + j, m + i])
        out.append(piece(f"{name} {'L' if s > 0 else 'R'}", np.array(V), F, mat, ("box",), w=HEAD,
                         group="helm"))
    return out


def antlers(helm, mat, name="antler", spread=0.3, rise=0.2, r=0.016):
    """A stag's antlers from the helm's sides (the sheet's second row): a beam sweeping out and
    up, tines rising off its upper side."""
    from ornament import bezier, tube
    B = helm[0]["barrel"]
    out = []
    for s in (1, -1):
        root = B.point(s * math.pi / 2, B.z1 - 0.05, -0.004)
        p1 = root + np.array([s * spread * 0.45, 0.02, rise * 0.15])
        p2 = root + np.array([s * spread * 0.85, 0.035, rise * 0.55])
        p3 = root + np.array([s * spread, 0.02, rise])
        beam = bezier(root, p1, p2, p3, 14)
        out.append(tube(f"{name} {'L' if s > 0 else 'R'}", beam, r * 1.5, r * 0.35, mat, HEAD, n=8,
                        group="helm"))
        for k, (i, ln, lean) in enumerate(((3, 0.1, 0.5), (6, 0.12, 0.25), (9, 0.11, 0.05), (12, 0.08, -0.2))):
            b0 = beam[i]
            tip = b0 + np.array([s * lean * ln, -0.01, ln])
            mid = (b0 + tip) / 2 + np.array([s * 0.012, 0, 0])
            out.append(tube(f"{name} tine {'L' if s > 0 else 'R'} {k}", [b0, mid, tip], r * 0.9, r * 0.2,
                            mat, HEAD, n=6, group="helm"))
    return out


def bat_wings(helm, mat, name="bat wing", span=0.24, h=0.24, t=0.009):
    """Bat or dragon wings from the sides of the top (the sheet's first row): a leading bone
    sweeping out and up like a horn to the tip, the membrane's outer edge cut into three
    scallops between finger points, curving back to the root."""
    from ornament import tube
    B = helm[0]["barrel"]
    out = []
    lead2 = [(0.0, 0.0), (0.05, 0.02), (0.11, 0.05), (0.17, 0.1), (0.21, 0.16), (0.23, 0.21), (0.235, 0.24)]
    fingers = [(0.235, 0.24), (0.27, 0.13), (0.22, 0.05), (0.13, 0.0), (0.02, -0.02)]
    centre = np.array([0.1, 0.12])
    trail = []
    for a, bpt in zip(fingers, fingers[1:]):
        a, bpt = np.array(a), np.array(bpt)
        for k in np.linspace(0, 1, 7)[1:]:
            p = a + (bpt - a) * k
            p = p + (centre - p) * 0.22 * math.sin(math.pi * k)  # sag inward: a scallop
            trail.append(p)
    poly = [np.array(p) * (span / 0.24, h / 0.24) for p in lead2 + [tuple(q) for q in trail[:-1]]]
    for s_ in (1, -1):
        x0, z0 = s_ * (B.X * 0.92), B.z1 - 0.035
        P2 = [(x0 + s_ * p[0], z0 + p[1]) for p in poly]
        V, F = [], []
        m = len(P2)
        for y in (B.cy - t / 2, B.cy + t / 2):
            V += [np.array([x, y, z]) for x, z in P2]
        c3 = len(V)
        V += [np.array([x0 + s_ * centre[0] * span / 0.24, B.cy + y, z0 + centre[1] * h / 0.24])
              for y in (-t / 2, t / 2)]
        for i in range(m):
            j = (i + 1) % m
            F.append([c3, j, i][::s_])
            F.append([c3 + 1, m + i, m + j][::s_])
            F.append([i, j, m + j, m + i])
        out.append(piece(f"{name} {'L' if s_ > 0 else 'R'}", np.array(V), F, mat, ("box",), w=HEAD,
                         group="helm", sharp=30))
        out[-1]["recalc"] = True
        out.append(tube(f"{name} bone {'L' if s_ > 0 else 'R'}",
                        [np.array([x, B.cy, z]) for x, z in P2[:len(lead2)]], 0.013, 0.003, mat, HEAD,
                        n=7, group="helm"))
    return out


def ring_arch(helm, mat, knob=None, name="ring arch", r=0.02, height=0.22, width=None, ribs=14):
    """A great hoop rising from the helm's sides and closing over the top (the sheet's second
    row, the ringed helm), with knobs at its crown."""
    from ornament import tube
    B = helm[0]["barrel"]
    width = B.X * 1.25 if width is None else width
    zc = B.z1 - 0.02
    path = []
    for a in np.linspace(math.radians(-25), math.radians(205), 36):
        path.append(np.array([width * math.cos(a), B.cy, zc + height * 0.5 + (height * 0.75) * math.sin(a)]))
    path = [np.array([width * math.cos(math.radians(-25)), B.cy, zc - 0.03])] + path + \
        [np.array([-width * math.cos(math.radians(-25)), B.cy, zc - 0.03])]
    out = [tube(name, path, r, r, mat, HEAD, n=10, group="helm")]
    for k in range(1, ribs + 1):  # raised ribs round the hoop
        q = path[int(k * (len(path) - 1) / (ribs + 1))]
        nx = path[min(int(k * (len(path) - 1) / (ribs + 1)) + 1, len(path) - 1)]
        d = norm(nx - q) * 0.006
        out.append(tube(f"{name} rib {k}", [q - d, q + d], r * 1.3, r * 1.3, knob or mat, HEAD, n=10,
                        group="helm"))
    if knob:
        top = np.array([0.0, B.cy, zc + height * 0.5 + height * 0.75])
        for dx in (-0.03, 0.0, 0.03):
            out.append(tube(f"{name} knob {dx:+.2f}", [top + [dx, 0, -r * 1.6], top + [dx, 0, r * 1.6]],
                            r * 1.55, r * 1.55, knob, HEAD, n=10, group="helm"))
    return out
