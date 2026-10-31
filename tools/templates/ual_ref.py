"""First-person reference from Quaternius' Universal Animation Library (UAL1 + UAL2, CC0).

Reads the libraries' mannequin .glb files directly (no Blender), plays a clip on the skeleton
and writes down, frame by frame, where both arms are as seen from the mannequin's own eyes:
camera space as the first-person rigs use it (metres; x right, y up, z forward, the eye at the
origin, looking the way the body faces). The eye rides on the head, but the view keeps the
body's facing, the way a player's camera stays on the target while the torso twists under it.

    python tools/templates/ual_ref.py                      # every clip anims.py keys from
    python tools/templates/ual_ref.py Sword_Regular_A ...  # just these

Writes tools/templates/ual_ref.json: {clip: {fps, frames: [{R: {...}, L: {...}}]}} with each
arm's shoulder S, elbow E, wrist W, knuckles K (middle finger root), index/pinky roots and the
thumb tip, so anims.py can key from it (with `ref="Clip@frame"`) without the libraries present.
"""
import json
import math
import os
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "ual_ref.json")
LIBS = {
    "UAL2": r"F:\!  BELLMOURN\Universal Animation Library 2[Standard]\Unreal-Godot\UAL2_Standard.glb",
    "UAL1": r"F:\!  BELLMOURN\Universal Animation Library[Standard]\Unreal-Godot\UAL1_Standard.glb",
}
FPS = 30
# the clips the first-person rigs are keyed from (anims.py)
CLIPS = ("Sword_Idle", "Sword_Attack", "Sword_Regular_A", "Sword_Regular_A_Rec", "Sword_Regular_B",
         "Sword_Regular_B_Rec", "Sword_Regular_C", "Sword_Regular_Combo", "Sword_Heavy_Combo",
         "Sword_Dash", "Sword_Block", "Idle_Shield_Loop", "Idle_Shield_Break", "Shield_OneShot",
         "Shield_Dash", "Spell_Simple_Enter", "Spell_Simple_Idle_Loop", "Spell_Simple_Shoot",
         "Spell_Simple_Exit", "OverhandThrow", "Melee_Hook", "Idle_Loop", "Walk_Loop",
         "Walk_Carry_Loop", "Punch_Jab", "Punch_Cross", "TreeChopping_Loop")
EYE = np.array([0.0, 0.10, 0.10])  # the eyes from the head bone (up, forward), metres


def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def trs(t, r, s):
    m = np.eye(4)
    m[:3, :3] = quat_mat(r) * np.asarray(s)[None, :]
    m[:3, 3] = t
    return m


class Library:
    def __init__(self, path):
        b = open(path, "rb").read()
        n = struct.unpack("<I", b[12:16])[0]
        self.j = json.loads(b[20:20 + n])
        off = 20 + n
        ln = struct.unpack("<I", b[off:off + 4])[0]
        self.bin = b[off + 8:off + 8 + ln]
        self.nodes = self.j["nodes"]
        self.names = {nd.get("name"): i for i, nd in enumerate(self.nodes)}
        self.parent = {}
        for i, nd in enumerate(self.nodes):
            for c in nd.get("children", []):
                self.parent[c] = i
        self.clips = {a["name"]: a for a in self.j.get("animations", [])}

    def accessor(self, i):
        a = self.j["accessors"][i]
        bv = self.j["bufferViews"][a["bufferView"]]
        comps = dict(SCALAR=1, VEC2=2, VEC3=3, VEC4=4, MAT4=16)[a["type"]]
        dt = {5126: np.float32, 5123: np.uint16, 5122: np.int16, 5121: np.uint8, 5120: np.int8}[
            a["componentType"]]
        start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = bv.get("byteStride", 0)
        item = np.dtype(dt).itemsize * comps
        if stride and stride != item:
            raw = np.frombuffer(self.bin, np.uint8, a["count"] * stride, start).reshape(-1, stride)
            arr = raw[:, :item].copy().view(dt).reshape(a["count"], comps)
        else:
            arr = np.frombuffer(self.bin, dt, a["count"] * comps, start).reshape(a["count"], comps)
        arr = arr.astype(float)
        if a.get("normalized"):
            arr /= {np.int16: 32767, np.uint16: 65535, np.int8: 127, np.uint8: 255}[dt]
        return arr

    def rest(self, i):
        nd = self.nodes[i]
        if "matrix" in nd:
            return np.array(nd["matrix"], float).reshape(4, 4).T
        return (nd.get("translation", [0, 0, 0]), nd.get("rotation", [0, 0, 0, 1]),
                nd.get("scale", [1, 1, 1]))

    def sample(self, clip, t):
        """{node: (t, r, s)} local transforms at time t (LINEAR / STEP samplers)."""
        a = self.clips[clip]
        out = {}
        for ch in a["channels"]:
            node, path = ch["target"]["node"], ch["target"]["path"]
            sm = a["samplers"][ch["sampler"]]
            key = (clip, ch["sampler"])
            if not hasattr(self, "_cache"):
                self._cache = {}
            if key not in self._cache:
                self._cache[key] = (self.accessor(sm["input"])[:, 0], self.accessor(sm["output"]))
            ts, vs = self._cache[key]
            k = int(np.searchsorted(ts, t, side="right")) - 1
            if k < 0:
                v = vs[0]
            elif k >= len(ts) - 1:
                v = vs[-1]
            elif sm.get("interpolation") == "STEP":
                v = vs[k]
            else:
                u = (t - ts[k]) / max(ts[k + 1] - ts[k], 1e-9)
                a0, a1 = vs[k], vs[k + 1]
                if path == "rotation":
                    if np.dot(a0, a1) < 0:
                        a1 = -a1
                    v = a0 * (1 - u) + a1 * u
                    v = v / np.linalg.norm(v)
                else:
                    v = a0 * (1 - u) + a1 * u
            out.setdefault(node, {})[path] = v
        return out

    def world(self, clip=None, t=0.0):
        anim = self.sample(clip, t) if clip else {}
        cache = {}

        def w(i):
            if i in cache:
                return cache[i]
            r = self.rest(i)
            if isinstance(r, np.ndarray):
                local = r
            else:
                tt, rr, ss = r
                a = anim.get(i, {})
                local = trs(a.get("translation", tt), a.get("rotation", rr), a.get("scale", ss))
            m = local if i not in self.parent else w(self.parent[i]) @ local
            cache[i] = m
            return m
        return w

    def duration(self, clip):
        a = self.clips[clip]
        return max(self.accessor(s["input"])[-1, 0] for s in a["samplers"])


def pos(w, lib, name):
    return w(lib.names[name])[:3, 3].copy()


def body_frame(lib):
    """The mannequin's right / up / forward in the file's world space, from its rest pose."""
    w = lib.world()
    up = np.array([0.0, 1.0, 0.0])
    right = pos(w, lib, "upperarm_r") - pos(w, lib, "upperarm_l")
    right -= up * np.dot(right, up)
    right /= np.linalg.norm(right)
    fwd = np.cross(right, up)  # (x right, y up, z forward: a left-handed camera basis)
    # make sure forward is the way the face looks: the toes point forward
    toe = pos(w, lib, "ball_r") - pos(w, lib, "foot_r")
    if np.dot(fwd, toe) < 0:
        fwd = -fwd
    return right, up, fwd


def frames(lib, clip, fps=FPS):
    right, up, fwd = body_frame(lib)
    basis = np.array([right, up, fwd])  # world -> camera axes
    dur = lib.duration(clip)
    out = []
    for k in range(int(round(dur * fps)) + 1):
        w = lib.world(clip, min(k / fps, dur))
        head = w(lib.names["Head"])
        # the eye: on the head, but the camera keeps the body's facing (the root's)
        eye = pos(w, lib, "Head") + right * EYE[0] + up * EYE[1] + fwd * EYE[2]
        # (EYE is in body axes: the head bone's own axes differ between the libraries' rigs)
        fr = {}
        for s in ("r", "l"):
            def cam(name):
                return [round(float(v), 4) for v in basis @ (pos(w, lib, name) - eye)]
            fr[s.upper()] = dict(
                S=cam(f"upperarm_{s}"), E=cam(f"lowerarm_{s}"), W=cam(f"hand_{s}"),
                K=cam(f"middle_01_{s}"), I=cam(f"index_01_{s}"), P=cam(f"pinky_01_{s}"),
                T=cam(f"thumb_03_{s}"), M=cam(f"middle_03_{s}"), C=cam(f"clavicle_{s}"))
        fr["head"] = [round(float(v), 4) for v in basis @ (pos(w, lib, "Head") - eye)]
        fr["chest"] = [round(float(v), 4) for v in basis @ (pos(w, lib, "spine_03") - eye)]
        fr["pelvis"] = [round(float(v), 4) for v in basis @ (pos(w, lib, "pelvis") - eye)]
        fr["eye"] = [round(float(v), 4) for v in basis @ eye]
        _ = head
        out.append(fr)
    return out


def main(names):
    libs = {k: Library(p) for k, p in LIBS.items() if os.path.exists(p)}
    if not libs:
        sys.exit("the Universal Animation Library files are not on this machine")
    data = json.load(open(OUT)) if os.path.exists(OUT) else {}
    for clip in names:
        lib_id = next((k for k, lib in libs.items() if clip in lib.clips), None)
        if lib_id is None:
            print("no such clip", clip)
            continue
        lib = libs[lib_id]
        data[clip] = dict(lib=lib_id, fps=FPS, duration=round(float(lib.duration(clip)), 4),
                          frames=frames(lib, clip))
        print(f"{clip:<26} {lib_id}  {len(data[clip]['frames'])} frames")
    with open(OUT, "w") as f:
        json.dump(data, f, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1:] or CLIPS)
