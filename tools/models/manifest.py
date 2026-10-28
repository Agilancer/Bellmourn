"""Write templates/models/manifest.json for the viewer (and the game): which arm models and
held items exist, and which kind of item each rig animation holds in each hand.

    python tools/models/manifest.py
"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import arm  # noqa: E402,F401  (puts tools/templates on the path)
import anims  # noqa: E402
import fp_rig as R  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
MODELS = os.path.join(ROOT, "templates", "models")
KIND = dict(sword1h="onehand", sword2h="twohand", wand="wand", staff="staff",
            round="shield_round",
            kite="shield_kite")


def item_kind(key):
    if "support" in key:
        return None
    return KIND.get(key.get("weapon") or key.get("shield"))


def write():
    arms = [dict(id="bare", name="bare arm", R="arms/arm_bare_R.glb", L="arms/arm_bare_L.glb")]
    for path in sorted(glob.glob(os.path.join(MODELS, "gauntlets", "*", "*_R.glb"))):
        gid = os.path.basename(os.path.dirname(path))
        info = os.path.join(os.path.dirname(path), "info.json")
        name = json.load(open(info))["name"] if os.path.exists(info) else gid
        arms.append(dict(id=gid, name=name, R=f"gauntlets/{gid}/{gid}_R.glb",
                         L=f"gauntlets/{gid}/{gid}_L.glb"))
    items, sets = {}, {}
    for path in sorted(glob.glob(os.path.join(MODELS, "items", "*", "*", "*.glb"))):
        kind = os.path.basename(os.path.dirname(os.path.dirname(path)))
        iid = os.path.basename(os.path.dirname(path))
        info = os.path.join(os.path.dirname(path), "info.json")
        meta = json.load(open(info)) if os.path.exists(info) else {}
        items.setdefault(kind, []).append(dict(id=iid, name=meta.get("name", iid),
                                               set=meta.get("set", iid),
                                               path=os.path.relpath(path, MODELS).replace("\\", "/")))
        sets.setdefault(meta.get("set", iid), meta.get("set_name", meta.get("set", iid)))
    anim_map, starts = {}, {}
    for aid, a in anims.ANIMS.items():
        f0 = a["frames"][0]
        anim_map[aid] = {side: item_kind(f0[side]) for side in ("R", "L") if side in f0}
        t, starts[aid] = 0.0, []
        for f in a["frames"]:
            starts[aid].append(round(t, 6))
            t += f["tics"] / 35
    out = dict(view_scale=R.REST_SCALE, tic=1 / 35, arms=arms, items=items,
               item_sets=[dict(id=k, name=v) for k, v in sets.items()] or
               [dict(id="none", name="(none yet)")], anims=anim_map, frame_starts=starts)
    with open(os.path.join(MODELS, "manifest.json"), "w") as f:
        json.dump(out, f, indent=1)
    return out


if __name__ == "__main__":
    m = write()
    print(f"{len(m['arms'])} arm models, {sum(len(v) for v in m['items'].values())} items, "
          f"{len(m['anims'])} animations")
