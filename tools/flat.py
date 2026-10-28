"""Composite RGBA sheets onto a flat color for inspection (sheets hide RGB haze under alpha 0)."""
import sys, os
from PIL import Image
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for f in sys.argv[2:]:
    im = Image.open(f).convert('RGBA')
    bg = Image.new('RGBA', im.size, (40, 120, 70, 255))
    bg.alpha_composite(im)
    bg.convert('RGB').save(os.path.join(out, os.path.basename(f).replace('.png', '.jpg')), quality=88)
