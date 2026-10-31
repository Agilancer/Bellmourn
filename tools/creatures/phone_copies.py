"""Phone copies of the monsters, the grotesques, the foes and the villagers: <set>/phone/<name>.glb, each the same
model with every image over the set's cap shrunk down to it (in its own format: JPEG, PNG or WebP,
alpha kept).

A phone loading the full ones died: the monsters' 2048 skins (five apiece) and the villagers' 2048
heads and hair with a dozen 1024 cloths each came to over a gigabyte decoded, and as much again on
the GPU. A phone draws the world at about 420 pixels across: a villager stands at most a hundred or
so tall in it, and a monster in your face little more than the screen's height, so 256 and 512 are
all their skins need. Re-run this whenever one of their .glbs changes.

    python tools/creatures/phone_copies.py [monsters|grotesques|foes|villagers ...]
"""
import io
import json
import os
import struct
import sys

from PIL import Image

ROOT = os.path.join('templates', 'models', 'creatures')
CAPS = {'monsters': 512, 'foes': 512, 'villagers': 256, 'grotesques': 512}   # the biggest image side a phone gets


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


def shrink(data, mime, cap, nearest=False):
    """The image's bytes at no more than cap square (unchanged if it already is). A texture drawn
    nearest-filtered (the foes' painted atlases) is cut down nearest too, keeping its palette."""
    im = Image.open(io.BytesIO(data))
    if max(im.size) <= cap:
        return data
    s = cap / max(im.size)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.NEAREST if nearest else Image.LANCZOS)
    out = io.BytesIO()
    if mime == 'image/png':
        im.save(out, 'PNG', optimize=True)
    elif mime == 'image/webp':
        im.save(out, 'WEBP', quality=85, method=6)
    else:
        im.convert('RGB').save(out, 'JPEG', quality=75, subsampling=2, optimize=True)   # as the sources are
    return out.getvalue()


def phone_copy(src, dst, cap):
    j, bin_ = read_glb(src)
    assert len(j['buffers']) == 1, src
    images = {im['bufferView']: im.get('mimeType', 'image/jpeg') for im in j.get('images', []) if 'bufferView' in im}
    samplers = j.get('samplers', [])
    nearest = set()   # the bufferViews of images some texture draws nearest-filtered
    for t in j.get('textures', []):
        src = t.get('source', next((e.get('source') for e in t.get('extensions', {}).values() if 'source' in e), None))
        if src is not None and 'sampler' in t and samplers[t['sampler']].get('magFilter') == 9728:
            nearest.add(j['images'][src].get('bufferView'))
    out = bytearray()
    for i, bv in enumerate(j['bufferViews']):
        data = bin_[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        if i in images:
            data = shrink(data, images[i], cap, i in nearest)
        out += b'\0' * (-len(out) % 4)
        bv['byteOffset'] = len(out)
        bv['byteLength'] = len(data)
        out += data
    j['buffers'][0]['byteLength'] = len(out)
    write_glb(dst, j, bytes(out))


if __name__ == '__main__':
    for kind in sys.argv[1:] or CAPS:
        src = os.path.join(ROOT, kind)
        dst = os.path.join(src, 'phone')
        os.makedirs(dst, exist_ok=True)
        before = after = 0
        for f in sorted(f for f in os.listdir(src) if f.endswith('.glb')):
            phone_copy(os.path.join(src, f), os.path.join(dst, f), CAPS[kind])
            before += os.path.getsize(os.path.join(src, f)); after += os.path.getsize(os.path.join(dst, f))
        print(f'{dst}: {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB (images at most {CAPS[kind]} square)')
