"""The monsters' phone copies: templates/models/creatures/monsters/phone/<name>.glb, each the same
model with every image over 1024 square halved down to it.

A phone that loaded the full monsters had to decode all nine's 2048 skins (five apiece, ~84 MB
decoded each) before any of them could be shrunk, and the tab died. Re-run this whenever a
monster's .glb changes.

    python tools/creatures/monsters_phone.py
"""
import io
import json
import os
import struct
import sys

from PIL import Image

ROOT = os.path.join('templates', 'models', 'creatures', 'monsters')
OUT = os.path.join(ROOT, 'phone')
CAP = 1024


def read_glb(path):
    b = open(path, 'rb').read()
    magic, version, _ = struct.unpack_from('<III', b, 0)
    assert magic == 0x46546C67 and version == 2, path
    n, kind = struct.unpack_from('<II', b, 12)
    assert kind == 0x4E4F534A, path
    j = json.loads(b[20:20 + n])
    m, kind = struct.unpack_from('<II', b, 20 + n)
    assert kind == 0x004E4942, path
    return j, b[28 + n:28 + n + m]


def write_glb(path, j, bin_):
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    bin_ += b'\0' * (-len(bin_) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(bin_)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(bin_), 0x004E4942) + bin_)


def shrink(data, mime):
    """The image's bytes at no more than CAP square (unchanged if it already is)."""
    im = Image.open(io.BytesIO(data))
    if max(im.size) <= CAP:
        return data
    s = CAP / max(im.size)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    out = io.BytesIO()
    if mime == 'image/png':
        im.save(out, 'PNG', optimize=True)
    else:
        im.convert('RGB').save(out, 'JPEG', quality=75, subsampling=2, optimize=True)   # as the sources are
    return out.getvalue()


def phone_copy(name):
    j, bin_ = read_glb(os.path.join(ROOT, name + '.glb'))
    assert len(j['buffers']) == 1, name
    images = {im['bufferView']: im.get('mimeType', 'image/jpeg') for im in j.get('images', []) if 'bufferView' in im}
    out = bytearray()
    for i, bv in enumerate(j['bufferViews']):
        data = bin_[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        if i in images:
            data = shrink(data, images[i])
        out += b'\0' * (-len(out) % 4)
        bv['byteOffset'] = len(out)
        bv['byteLength'] = len(data)
        out += data
    j['buffers'][0]['byteLength'] = len(out)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + '.glb')
    write_glb(path, j, bytes(out))
    return path


if __name__ == '__main__':
    names = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(ROOT) if f.endswith('.glb'))
    for name in names:
        before = os.path.getsize(os.path.join(ROOT, name + '.glb'))
        path = phone_copy(name)
        print(f'{path}: {before / 1e6:.1f} MB -> {os.path.getsize(path) / 1e6:.1f} MB')
