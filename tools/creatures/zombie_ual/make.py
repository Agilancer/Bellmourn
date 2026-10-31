"""One monster end to end: texture prep, Blender build, review sheet.

  python make.py <name> [<name> ...] [--clips] [--review shots] [--no-build]

Environment: UAL2_GLB (the UAL2_Standard.glb), ZOMBIE_WORK (scratch, default F:/zombie_ual_build),
BLENDER (blender.exe). Writes <work>/<name>/out/<name>.glb and <work>/<name>/review.png, and copies
the GLB to templates/models/creatures/zombie_ual/. --clips also writes the shared clip file.
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)
import monsters  # noqa: E402

UAL = os.environ.get("UAL2_GLB", r"F:/!  BELLMOURN/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb")
WORK = os.environ.get("ZOMBIE_WORK", "F:/zombie_ual_build")
BLENDER = os.environ.get("BLENDER", r"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe")
DEST = os.path.join(ROOT, "templates", "models", "creatures", "zombie_ual")
SHOTS = "tpose,idle_front,idle_34,back,face_rest,face_34,face,hand"


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    keep = [ln for ln in (r.stdout + r.stderr).splitlines() if "[zombie]" in ln or "[bake]" in ln or "Error" in ln or "Traceback" in ln or "line " in ln]
    print("\n".join(keep[-14:]))
    return r.returncode


def main():
    args = sys.argv[1:]
    review = SHOTS
    if "--review" in args:
        review = args[args.index("--review") + 1]
        args.remove(review)
    names = [a for a in args if not a.startswith("--")]
    env = dict(os.environ, TEMP=os.path.join(WORK, "tmp"), TMP=os.path.join(WORK, "tmp"))
    os.environ.update(env)
    for name in names:
        cfg = monsters.MONSTERS[name]
        tex = os.path.join(WORK, name, "tex")
        if "--no-build" not in args:
            run(["python", "-I", os.path.join(HERE, "prep_tex.py"), os.path.join(ROOT, cfg["sheet"]), tex, name])
            cmd = [BLENDER, "-b", "--factory-startup", "--python", os.path.join(HERE, "build.py"), "--", UAL, name, WORK]
            if "--clips" in args:
                cmd += ["--clips", os.path.join(WORK, "ual2_clips.glb")]
            run(cmd)
            glb = os.path.join(WORK, name, "out", name + ".glb")
            if os.path.exists(glb):
                os.makedirs(DEST, exist_ok=True)
                shutil.copy(glb, os.path.join(DEST, name + ".glb"))
        if review != "none":
            run([BLENDER, "-b", os.path.join(WORK, name, "out", "zombie_ual.blend"), "--python",
                 os.path.join(HERE, "review.py"), "--", os.path.join(WORK, name, "review.png"), review, "0.75"])
        print("[make]", name, "done")


if __name__ == "__main__":
    main()
