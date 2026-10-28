"""Hand repairs for the grotesque zombie (first ChatGPT four-frame bundle, 2026-10-28).

Each fix was found by laying every direction's four frames side by side on one foot anchor:
- front walk and front run lift the same leg in both passing frames, so the cycle hops: the
  legs of F4 are mirrored below the hands, which lifts the other leg;
- after that the front run lifts L, R, R, L: it plays F1, F2, F4, F3 instead;
- the back walk and the back claw were painted about 13% and 7% bigger than every other view
  (115 px standing): scaled down to match;
- loose paint specks that touch nothing (two strips beside the jump launch) are removed.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                "templates"))
import frame_ops as F  # noqa: E402


def fix(frames, report):
    for anim, fs in frames.items():
        for k, fr in fs.items():
            fs[k], gone = F.drop_specks(fr)
            if gone:
                report.append(f"  fix: removed {gone} stray px from {anim} D{k[0]} F{k[1] + 1}")
    # rows just below the hands, where only the legs remain (front view, frame 4)
    frames["walk"][(1, 3)] = F.mirror_legs(frames["walk"][(1, 3)], 75)
    frames["run"][(1, 3)] = F.mirror_legs(frames["run"][(1, 3)], 61)
    F.reorder(frames, "run", 1, [0, 1, 3, 2])
    for anim, s in (("walk", 114 / 129), ("melee", 114 / 122)):
        for f in range(4):
            frames[anim][(5, f)] = F.rescale(frames[anim][(5, f)], s)
    report.append("  fix: front walk/run F4 legs mirrored, front run plays F1 F2 F4 F3, "
                  "back walk x0.884 and back melee x0.934")
