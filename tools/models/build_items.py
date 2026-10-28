"""Build the held items: per item a folder in templates/models/items/<kind>/<id>/ with the
.glb (attach to the arm's `item` node), texture sheet, mask, placeholder texture, info.json
and PROMPT.md.

    python tools/models/build_items.py [kind ...]
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import assets  # noqa: E402
import export  # noqa: E402
import items as I  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "templates", "models", "items")
KIND_TEXT = dict(onehand="one-handed weapon", twohand="two-handed weapon", wand="magic wand",
                 staff="magic staff", shield_round="round shield", shield_kite="kite shield")
SET_NAME = dict(onehand="one-handed", twohand="two-handed", wand="wands", staff="staffs",
                shield_round="round shields", shield_kite="kite shields")
VIEWS = {"default": ((-60, 15, "CAMERA SIDE"), (120, 15, "OTHER SIDE"), (0, 0, "EDGE ON"),
                     (-60, 70, "FROM ABOVE")),
         "shield": ((180, 10, "INSIDE (player)"), (0, 10, "FRONT (enemy)"), (90, 0, "SIDE"),
                    (0, 80, "TOP"))}


def build_one(kind, spec):
    model = spec["build"]()
    folder = os.path.join(OUT, kind, spec["id"])
    info = assets.write(folder, spec["id"], spec["name"], KIND_TEXT[kind], spec["desc"],
                        [(model, f"{spec['id']}.glb", export.export_item)], model,
                        notes=["Attach to the arm's `item` node (grip = origin)."],
                        angles=VIEWS["shield" if kind.startswith("shield") else "default"])
    # the viewer groups items into sets by their index within a kind
    import json
    info["set"] = f"set{I.ITEMS[kind].index(spec) + 1:02d}"
    info["set_name"] = f"model {I.ITEMS[kind].index(spec) + 1}"
    with open(os.path.join(folder, "info.json"), "w") as f:
        json.dump(info, f, indent=1)
    return info


if __name__ == "__main__":
    kinds = sys.argv[1:] or list(I.ITEMS)
    for kind in kinds:
        for spec in I.ITEMS[kind]:
            info = build_one(kind, spec)
            print(f"{kind:<13} {spec['id']:<16} {info['triangles']:>5} tris  "
                  f"{len(info['parts'])} parts")
