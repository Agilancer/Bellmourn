"""Slim an exported beast-man GLB in place (system Python, numpy only).

  python -I slim.py <beast.glb>

Like tools/creatures/sworn_ual/trim.py: every clip loses the channels that never leave the bone's
rest (every scale, every translation but the pelvis's, a rotation that never moves). A channel
that holds one value other than the rest keeps two keys. Nothing is resampled, so every clip plays
exactly as before. Then the binary is repacked with only what is still referenced.
"""
import json
import struct
import sys

import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def main(path):
    raw = open(path, "rb").read()
    jl = struct.unpack("<I", raw[12:16])[0]
    j = json.loads(raw[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack("<I", raw[off:off + 4])[0]
    bin_ = raw[off + 8:off + 8 + bl]
    bv, acc, nodes = j["bufferViews"], j["accessors"], j["nodes"]

    def read(ai):
        a = acc[ai]; v = bv[a["bufferView"]]
        n = NC[a["type"]]; dt = CT[a["componentType"]]
        start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = v.get("byteStride", 0)
        if stride and stride != n * np.dtype(dt).itemsize:
            rows = np.frombuffer(bin_, np.uint8, a["count"] * stride, start).reshape(a["count"], stride)
            return rows[:, :n * np.dtype(dt).itemsize].copy().view(dt).reshape(a["count"], n)
        return np.frombuffer(bin_, dt, a["count"] * n, start).reshape(a["count"], n)

    rest = {"rotation": lambda nd: nd.get("rotation", [0, 0, 0, 1]), "translation": lambda nd: nd.get("translation", [0, 0, 0]),
            "scale": lambda nd: nd.get("scale", [1, 1, 1])}
    new_acc = []          # (data array, accessor json) for accessors we create (two-key constants)
    dropped = kept = 0
    for an in j["animations"]:
        chans, samps = [], []
        for ch in an["channels"]:
            s = an["samplers"][ch["sampler"]]
            node = nodes[ch["target"]["node"]]; path_ = ch["target"]["path"]
            v = read(s["output"]).astype(np.float64)
            still = np.abs(v - v[0]).max() < 1e-5
            at_rest = still and np.abs(v[0] - np.array(rest[path_](node))).max() < 1e-4
            if path_ == "scale" and still or (path_ == "translation" and node.get("name") != "pelvis" and still) or at_rest:
                dropped += 1
                continue
            if still and len(v) > 2:                                         # one held value: two keys
                t = read(s["input"])
                ti = len(acc) + len(new_acc); new_acc.append((np.array([t[0], t[-1]], np.float32), "SCALAR", True))
                oi = len(acc) + len(new_acc); new_acc.append((np.array([v[0], v[0]], np.float32), acc[s["output"]]["type"], False))
                s = dict(s, input=ti, output=oi)
            samps.append(s)
            chans.append(dict(ch, sampler=len(samps) - 1))
            kept += 1
        an["channels"], an["samplers"] = chans, samps
    for data, typ, is_time in new_acc:
        a = {"componentType": 5126, "count": len(data), "type": typ, "bufferView": None, "_data": data}
        if is_time:
            a["min"] = [float(data.min())]; a["max"] = [float(data.max())]
        acc.append(a)

    # repack: only what is still referenced
    used = set()
    for m in j.get("meshes", []):
        for p in m["primitives"]:
            used |= set(p["attributes"].values())
            if "indices" in p:
                used.add(p["indices"])
            for t in p.get("targets", []):
                used |= set(t.values())
    for sk in j.get("skins", []):
        if "inverseBindMatrices" in sk:
            used.add(sk["inverseBindMatrices"])
    for an in j["animations"]:
        for s in an["samplers"]:
            used |= {s["input"], s["output"]}
    weights = {v for m in j.get("meshes", []) for p in m["primitives"] for k, v in p["attributes"].items() if k.startswith("WEIGHTS_")}
    amap = {}
    out_acc, out_bv, blob = [], [], bytearray()

    def put(data_bytes, target=None):
        while len(blob) % 4:
            blob.append(0)
        v = {"buffer": 0, "byteOffset": len(blob), "byteLength": len(data_bytes)}
        if target:
            v["target"] = target
        blob.extend(data_bytes)
        out_bv.append(v)
        return len(out_bv) - 1

    for ai in sorted(used):
        a = dict(acc[ai])
        if "_data" in a:
            data = a.pop("_data")
            a["bufferView"] = put(data.tobytes())
        elif ai in weights and a["componentType"] == 5126:      # skin weights as normalised bytes (sum 255)
            w = read(ai).astype(np.float64)
            w = w / np.maximum(w.sum(1, keepdims=True), 1e-9) * 255
            q = np.floor(w).astype(np.int64)
            short = 255 - q.sum(1)
            order = np.argsort(-(w - q), axis=1)
            for k in range(4):
                q[np.arange(len(q)), order[:, k]] += (short > k)
            a.pop("byteOffset", None); a.pop("min", None); a.pop("max", None)
            a.update(componentType=5121, normalized=True)
            a["bufferView"] = put(q.astype(np.uint8).tobytes(), 34962)
        else:
            arr = read(ai)
            a.pop("byteOffset", None)
            a["bufferView"] = put(np.ascontiguousarray(arr).tobytes(), bv[acc[ai]["bufferView"]].get("target"))
        amap[ai] = len(out_acc); out_acc.append(a)
    for im in j.get("images", []):
        v = bv[im["bufferView"]]
        im["bufferView"] = put(bin_[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])
    for m in j.get("meshes", []):
        for p in m["primitives"]:
            p["attributes"] = {k: amap[v] for k, v in p["attributes"].items()}
            if "indices" in p:
                p["indices"] = amap[p["indices"]]
            p["targets"] = [{k: amap[v] for k, v in t.items()} for t in p.get("targets", [])] or None
            if p["targets"] is None:
                del p["targets"]
    for sk in j.get("skins", []):
        if "inverseBindMatrices" in sk:
            sk["inverseBindMatrices"] = amap[sk["inverseBindMatrices"]]
    for an in j["animations"]:
        for s in an["samplers"]:
            s["input"] = amap[s["input"]]; s["output"] = amap[s["output"]]
    j["accessors"], j["bufferViews"] = out_acc, out_bv
    while len(blob) % 4:
        blob.append(0)
    j["buffers"] = [{"byteLength": len(blob)}]
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    out = struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob)
    open(path, "wb").write(out)
    print("[slim] channels kept %d dropped %d; %.1f MB -> %.1f MB" % (kept, dropped, len(raw) / 1e6, len(out) / 1e6))


if __name__ == "__main__":
    main(sys.argv[1])
