"""Build the world props: per prop a folder in templates/models/props/<id>/ with the .glb
(auto-textured from the library), texture sheet, mask, info.json and PROMPT.md.

    python tools/models/build_props.py [ids ...]
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import arm  # noqa: E402,F401  (puts tools/templates on the path)
import assets  # noqa: E402
import export  # noqa: E402
import props as P  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "templates", "models", "props")
VIEWS = ((30, 20, "3/4 FRONT"), (210, 20, "3/4 BACK"), (90, 0, "SIDE"), (0, 75, "FROM ABOVE"))


def build_one(spec):
    model = spec["build"]()
    folder = os.path.join(OUT, spec["id"])
    return assets.write(folder, spec["id"], spec["name"], "world prop", spec["desc"],
                        [(model, f"{spec['id']}.glb", export.export_item)], model,
                        notes=["Origin on the floor at the centre; +z is the front."],
                        angles=VIEWS)


if __name__ == "__main__":
    want = set(sys.argv[1:])
    for spec in P.PROPS:
        if want and spec["id"] not in want:
            continue
        info = build_one(spec)
        print(f"{spec['id']:<20} {info['triangles']:>5} tris  {len(info['parts'])} parts")
