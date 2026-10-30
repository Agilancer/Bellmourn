"""Review sheets: each built grotesque as the game draws it, on one labelled image.

    python sheet.py <port> <glb dir under the repo> <out dir> <name,name,...> [three_dir]

Per monster: three-quarter, front and back in the afternoon light, the face close at dusk, and
the player's view of it lunging, at night by a torch; with its source skin in the corner.
Serve the repo first (python tools/serve.py <port>).
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
SHOTS = [("34", "view=34&clip=idle&t=0.4&light=day", (720, 1080)),
         ("front", "view=front&clip=walk&t=0.3&light=day", (720, 1080)),
         ("back", "view=front&clip=idle&t=0.4&light=day&rot=3.14159", (720, 1080)),   # turned to the sun
         ("face", "view=face&clip=idle&t=0.4&light=day", (720, 1080)),
         ("near", "view=near&clip=attack1&t=0.42&light=night", (1440, 1080))]


def main(port, glb_dir, out, names, three=None):
    os.makedirs(out, exist_ok=True)
    shots = []
    for n in names:
        for k, q, size in SHOTS:
            shots.append({"name": f"{n}_{k}", "q": f"m={glb_dir}/{n}.glb&{q}", "size": list(size)})
    lst = os.path.join(out, "shots.json")
    json.dump(shots, open(lst, "w"))
    cmd = ["node", os.path.join(HERE, "shots.cjs"), str(port), out, lst] + ([three] if three else [])
    subprocess.run(cmd, check=True, cwd=ROOT)
    font = ImageFont.load_default(size=34)
    for n in names:
        ims = [Image.open(os.path.join(out, f"{n}_{k}.png")).convert("RGB") for k, _, _ in SHOTS]
        W = sum(im.width for im in ims[:4])
        S = Image.new("RGB", (W, 1080 * 2), (12, 12, 14))
        x = 0
        for im in ims[:4]:
            S.paste(im, (x, 0))
            x += im.width
        S.paste(ims[4], (0, 1080))
        meta = json.load(open(os.path.join(ROOT, glb_dir, f"{n}.json"))) if os.path.exists(os.path.join(ROOT, glb_dir, f"{n}.json")) else {}
        skin = meta.get("skin")
        if skin:
            sk = Image.open(skin).convert("RGB").resize((1080, 1080))
            S.paste(sk, (1440, 1080))
        d = ImageDraw.Draw(S)
        d.text((24, 1100), n, fill=(255, 230, 160), font=font, stroke_width=3, stroke_fill=(0, 0, 0))
        S.resize((S.width // 2, S.height // 2), Image.LANCZOS).save(os.path.join(out, f"sheet_{n}.png"))
        print("sheet", os.path.join(out, f"sheet_{n}.png"))


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[0], a[1], a[2], a[3].split(","), a[4] if len(a) > 4 else None)
