"""Build the bare arms (both sides): .glb with every rig animation, texture sheet, placeholder.

    python tools/models/build_arms.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import arm as A  # noqa: E402
import export  # noqa: E402
import texkit  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "templates", "models", "arms")
# whole arm from two sides, then two close-ups of the hand (the part that is always on screen)
HAND_VIEWS = ((30, 20, "3/4 FRONT"), (210, 20, "3/4 BACK"), (60, 25, "HAND: BACK", "hand"),
              (240, 10, "HAND: PALM", "hand"))

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for side in ("R", "L"):
        model = A.bare_arm(side)
        tris = export.export_arm_model(model, side, os.path.join(OUT, f"arm_bare_{side}.glb"))
        texkit.placeholder_texture(model).save(os.path.join(OUT, f"arm_bare_{side}_texture.png"))
        title = f"BARE ARM — {'RIGHT' if side == 'R' else 'LEFT'}"
        notes = ["Skin and sleeve under the gauntlets.",
                 "Paint the LEFT square only; 1 texel = 8x8 px."]
        texkit.sheet(model, title, notes, angles=HAND_VIEWS).save(
            os.path.join(OUT, f"arm_bare_{side}_sheet.png"))
        print(f"arm_bare_{side}: {tris} triangles, {len(export.side_anims(side))} animations")
