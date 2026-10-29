"""MakeHuman base mesh, morph targets and proxies (from the makehuman-data npm package, read as data).

Coordinates are MakeHuman's: y up, the face toward +z, decimetres."""
import json, os
import numpy as np

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ROOT = os.environ.get('MH_DATA', os.path.join(REPO, 'art', 'raw', 'makehuman'))
DATA = ROOT + '/public/data'


def _faces(raw, nuv_layers=1):
    """three.js JSON v3 faces -> (quads/tris as lists, material per face, uv index lists)."""
    out, mats, uvi = [], [], []
    i = 0
    while i < len(raw):
        t = raw[i]; i += 1
        quad = t & 1
        n = 4 if quad else 3
        vs = raw[i:i + n]; i += n
        m = 0
        if t & 2:
            m = raw[i]; i += 1
        if t & 4:
            i += nuv_layers
        uv = None
        if t & 8:
            uv = raw[i:i + n]; i += n * nuv_layers
        if t & 16: i += 1
        if t & 32: i += n
        if t & 64: i += 1
        if t & 128: i += n
        out.append(vs); mats.append(m); uvi.append(uv)
    return out, mats, uvi


class Base:
    def __init__(self):
        d = json.load(open(DATA + '/models/human_full_size.json'))
        self.v0 = np.array(d['vertices'], dtype=np.float64).reshape(-1, 3)
        self.faces, self.fmat, self.fuv = _faces(d['faces'])
        self.uvs = np.array(d['uvs'][0]).reshape(-1, 2)
        self.mat_names = [m['DbgName'] for m in d['materials']]
        tl = json.load(open(ROOT + '/src/json/targets/target-list.json'))['targets']
        self.target_paths = sorted(tl.keys())
        self.tindex = {p: i for i, p in enumerate(self.target_paths)}
        self._bin = np.memmap(DATA + '/targets/targets.bin', dtype=np.int16, mode='r')
        self.nv = len(self.v0)
        assert self._bin.size == len(self.target_paths) * self.nv * 3

    def target(self, name):
        """Delta (nv, 3) of a target by path or unique suffix."""
        if name not in self.tindex:
            hits = [p for p in self.target_paths if p.endswith('/' + name + '.target') or p.endswith(name)]
            assert len(hits) == 1, (name, hits[:5])
            name = hits[0]
        j = self.tindex[name]
        n = self.nv * 3
        return np.asarray(self._bin[j * n:(j + 1) * n], dtype=np.float64).reshape(-1, 3) * 1e-3

    def find(self, sub):
        return [p for p in self.target_paths if sub in p]

    def morph(self, weights):
        v = self.v0.copy()
        for k, w in weights.items():
            if w:
                v += w * self.target(k)
        return v


def proxy(path):
    """A proxy (eyes, hair, eyelashes...): its own faces/uvs, and how its vertices follow the base mesh."""
    d = json.load(open(DATA + '/proxies/' + path))
    faces, fmat, fuv = _faces(d['faces'])
    p = {
        'v': np.array(d['vertices'], dtype=np.float64).reshape(-1, 3),
        'faces': faces, 'fuv': fuv,
        'uvs': np.array(d['uvs'][0]).reshape(-1, 2) if d.get('uvs') and d['uvs'][0] else None,
        'ref': np.array(d['ref_vIdxs'], dtype=np.int64) if d.get('ref_vIdxs') else None,
        'w': np.array(d['weights'], dtype=np.float64) if d.get('weights') else None,
        'off': np.array(d['offsets'], dtype=np.float64) if d.get('offsets') else None,
        'materials': d.get('materials'),
        'dir': os.path.dirname(DATA + '/proxies/' + path),
    }
    return p


def fit_proxy(p, base_v, base_v0):
    """Proxy vertices on a morphed base: barycentric refs plus the offsets (MakeHuman's own fitting,
    offsets unscaled). The raw vertices aren't used: some proxies' were saved off the base."""
    if p['ref'] is None:
        return p['v']
    ref, w, off = p['ref'], p['w'], p['off']
    return (base_v[ref] * w[..., None]).sum(1) + (off if off is not None else 0)
