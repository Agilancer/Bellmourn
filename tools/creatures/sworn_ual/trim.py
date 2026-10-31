"""Trim Quaternius' Universal Animation Library 2 (CC0) down to what the Sworn use.

  python tools/creatures/sworn_ual/trim.py <UAL2_Standard.glb> templates/models/creatures/sworn/ual2.glb

Keeps the mannequin (the knight viewer shows it beside the knight) and its skeleton, and only the
clips in KEEP. Each clip loses the channels that never change from the bone's rest (every scale,
every translation but the pelvis's, a still finger's turn); a channel that holds one value that
isn't the rest keeps two keys. Nothing is resampled, so what's left plays exactly as it did.
"""
import json
import struct
import sys

import numpy as np

KEEP = [
    'Idle_Shield_Loop', 'Idle_Shield_Break', 'Walk_Carry_Loop',
    'Sword_Regular_A', 'Sword_Regular_A_Rec', 'Sword_Regular_B', 'Sword_Regular_B_Rec', 'Sword_Regular_C',
    'Sword_Heavy_Combo', 'Sword_Dash', 'Sword_Block', 'Shield_Dash', 'Shield_OneShot',
    'Hit_Knockback', 'LayToIdle', 'NinjaJump_Start', 'NinjaJump_Land',
]
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def load(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    off = 20 + n
    ln = struct.unpack('<I', b[off:off + 4])[0]
    return j, b[off + 8:off + 8 + ln]


def main(src, dst):
    j, binary = load(src)
    acc, views = j['accessors'], j['bufferViews']

    def read(ai):
        a = acc[ai]
        bv = views[a['bufferView']]
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']]
        return np.frombuffer(binary, dtype=dt, count=a['count'] * NC[a['type']], offset=start).reshape(a['count'], NC[a['type']])

    out = bytearray()
    new_acc, new_views = [], []

    def put(arr, like, target=None):
        """A new accessor (and its own buffer view) holding arr, typed as accessor `like` was."""
        while len(out) % 4:
            out.append(0)
        data = np.ascontiguousarray(arr).tobytes()
        view = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)}
        if target:
            view['target'] = target
        out.extend(data)
        new_views.append(view)
        a = {k: v for k, v in like.items() if k not in ('bufferView', 'byteOffset', 'min', 'max', 'count')}
        a['bufferView'] = len(new_views) - 1
        a['count'] = int(arr.shape[0])
        if like['type'] == 'SCALAR' and like['componentType'] == 5126:
            a['min'] = [float(arr.min())]
            a['max'] = [float(arr.max())]
        elif 'min' in like:
            a['min'] = [float(x) for x in arr.min(0)]
            a['max'] = [float(x) for x in arr.max(0)]
        new_acc.append(a)
        return len(new_acc) - 1

    # the mesh and skin: copied over as they are
    remap = {}

    def keep(ai, target=None):
        if ai not in remap:
            remap[ai] = put(read(ai), acc[ai], target)
        return remap[ai]

    for m in j['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k: keep(v, 34962) for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = keep(p['indices'], 34963)
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = keep(s['inverseBindMatrices'])

    nodes = j['nodes']
    rest = {'rotation': lambda n: n.get('rotation', [0, 0, 0, 1]), 'translation': lambda n: n.get('translation', [0, 0, 0]),
            'scale': lambda n: n.get('scale', [1, 1, 1])}
    anims, before, after = [], 0, 0
    for an in j['animations']:
        if an['name'] not in KEEP:
            continue
        samplers, channels = [], []
        for ch in an['channels']:
            s = an['samplers'][ch['sampler']]
            node, path = nodes[ch['target']['node']], ch['target']['path']
            t, v = read(s['input']), read(s['output'])
            before += v.size
            still = np.abs(v - v[0]).max() < 1e-5
            if path == 'scale' or (path == 'translation' and node['name'] != 'pelvis') or \
                    (still and np.abs(v[0] - np.array(rest[path](node))).max() < 1e-4):
                if not still and path != 'scale':
                    print(f"  ! {an['name']} {node['name']}.{path} moves; dropped", file=sys.stderr)
                continue
            if still:
                t, v = t[[0, -1]], v[[0, -1]]
            after += v.size
            samplers.append({'input': put(t, acc[s['input']]), 'output': put(v, acc[s['output']]),
                             'interpolation': s.get('interpolation', 'LINEAR')})
            channels.append({'sampler': len(samplers) - 1, 'target': ch['target']})
        anims.append({'name': an['name'], 'samplers': samplers, 'channels': channels})
    missing = set(KEEP) - {a['name'] for a in anims}
    if missing:
        sys.exit(f'missing clips: {sorted(missing)}')

    j['animations'] = anims
    j['accessors'], j['bufferViews'] = new_acc, new_views
    j['buffers'] = [{'byteLength': len(out)}]
    j.setdefault('asset', {})['extras'] = {'source': 'Universal Animation Library 2 by Quaternius (CC0 1.0)',
                                           'trimmed': 'tools/creatures/sworn_ual/trim.py'}
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    while len(out) % 4:
        out.append(0)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out))
    glb += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
    open(dst, 'wb').write(glb)
    print(f'{len(anims)} clips; animation floats {before} -> {after}; {len(glb) / 1e6:.2f} MB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
