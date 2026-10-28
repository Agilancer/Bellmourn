"""Find individual items on each castle sheet (alpha components, merged when close) and label them."""
import json, glob, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

res = {}
for f in sorted(glob.glob('art/raw/castle/*.png')):
    name = os.path.basename(f)[:-4]
    im = Image.open(f).convert('RGBA')
    a = np.array(im)[..., 3] > 100
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=6))
    objs = ndimage.find_objects(lab)
    items = []
    for sl in objs:
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if h * w < 900:
            continue
        items.append([sl[1].start, sl[0].start, sl[1].stop, sl[0].stop])
    items.sort(key=lambda b: (round(b[1] / 120), b[0]))
    res[name] = items
    view = Image.new('RGBA', im.size, (40, 120, 70, 255)); view.alpha_composite(im)
    d = ImageDraw.Draw(view)
    for i, b in enumerate(items):
        d.rectangle(b, outline=(255, 255, 0, 255), width=2)
        d.text((b[0] + 3, b[1] + 3), str(i), fill=(255, 40, 40, 255))
    view.convert('RGB').resize((1152, 768)).save(f'art/view/items_{name}.jpg', quality=85)
    print(name, len(items))
json.dump(res, open('art/view/castle_items.json', 'w'), indent=0)
