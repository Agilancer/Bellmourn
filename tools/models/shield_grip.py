"""Move each shield's grip to the right-hand side of its back (as the player sees it), so the shield
is held like a real one: the fist on the grip near the right edge and the board running back along
the forearm. The grip stays at the model's origin (the fist's socket); the rest of the shield (board,
rim, boss, arm pad) slides left by OFFSET[kind] x its half-width. Works on the glbs in place (the
board's paint variants are textures, untouched); a moved shield is marked and skipped.

    python tools/models/shield_grip.py [--dry]
"""
import glob, json, os, struct, sys

import numpy as np

sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from assetstore import models  # noqa: E402  (templates/models lives in Bellmourn2: docs/ASSETS.md)
ROOT = models("items")
SHARE = 0.62            # the grip sits this far from the board's centre toward its right edge


def edit(path, dry=False):
    b = bytearray(open(path, "rb").read())
    n = struct.unpack_from("<I", b, 12)[0]
    js = json.loads(bytes(b[20:20 + n]))
    binoff = 20 + n + 8
    if js.get("asset", {}).get("extras", {}).get("grip_right"):
        return None   # (already moved)
    prim = js["meshes"][0]["primitives"][0]
    acc = js["accessors"][prim["attributes"]["POSITION"]]
    bv = js["bufferViews"][acc["bufferView"]]
    assert bv.get("byteStride") in (None, 12)
    off = binoff + bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    P = np.frombuffer(bytes(b[off:off + acc["count"] * 12]), np.float32).reshape(-1, 3).copy()
    # the grip (strap or bar and its two posts): on the centre line, between the posts, behind the
    # board (glTF z: the grip runs from 0 to -0.052; the board's back starts at -0.0522)
    grip = (np.abs(P[:, 0]) < 0.03) & (np.abs(P[:, 1]) < 0.08) & (P[:, 2] > -0.0521)
    half = float(np.abs(P[~grip, 0]).max())
    dx = SHARE * half
    if not dry:
        P[~grip, 0] -= dx
        b[off:off + acc["count"] * 12] = P.astype(np.float32).tobytes()
        acc["min"], acc["max"] = [float(v) for v in P.min(0)], [float(v) for v in P.max(0)]
        js.setdefault("asset", {}).setdefault("extras", {})["grip_right"] = round(dx, 4)
        js_b = json.dumps(js, separators=(",", ":")).encode()
        js_b += b" " * (-len(js_b) % 4)
        out = bytearray(b[:12]) + struct.pack("<I4s", len(js_b), b"JSON") + js_b + b[20 + n:]
        struct.pack_into("<I", out, 8, len(out))
        open(path, "wb").write(bytes(out))
        fd = os.open(path, os.O_RDWR); os.fsync(fd); os.close(fd)
    return int(grip.sum()), half, dx


if __name__ == "__main__":
    dry = "--dry" in sys.argv
    for f in sorted(glob.glob(os.path.join(ROOT, "shield_*", "*", "*.glb"))):
        r = edit(f, dry)
        if r is None:
            print(f"{os.path.basename(f):22s} already moved"); continue
        g, half, dx = r
        print(f"{os.path.basename(f):22s} grip verts {g:3d}  half-width {half:.3f}  board moved left {dx:.3f}")
