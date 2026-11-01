"""WebGL beside WebGPU: for each view, the two renderers' shots of it (tools/gpu_bench.js, saved as
art/view/shots/<prefix>_<view>.png) side by side at half size, labelled, one sheet per view, plus how
many pixels differ by more than a few levels.
usage: python tools/renderer_sheet.py <webgl prefix> <webgpu prefix> <out prefix> [view ...]"""
import sys, os
from PIL import Image, ImageDraw, ImageChops

SHOTS = 'art/view/shots'
gl, gpu, out = sys.argv[1:4]
views = sys.argv[4:] or sorted({f[len(gpu) + 1:-4] for f in os.listdir(SHOTS) if f.startswith(gpu + '_') and f.endswith('.png')})
for v in views:
    a_path, b_path = f'{SHOTS}/{gl}_{v}.png', f'{SHOTS}/{gpu}_{v}.png'
    if not (os.path.exists(a_path) and os.path.exists(b_path)):
        print(v, 'missing'); continue
    a, b = Image.open(a_path).convert('RGB'), Image.open(b_path).convert('RGB')
    if a.size != b.size: b = b.resize(a.size)
    hist = ImageChops.difference(a, b).convert('L').histogram()
    differ = 100 * sum(hist[12:]) / sum(hist)
    w, h = a.size[0] // 2, a.size[1] // 2
    sheet = Image.new('RGB', (w * 2 + 12, h + 28), (16, 14, 18))
    sheet.paste(a.resize((w, h), Image.LANCZOS), (0, 28)); sheet.paste(b.resize((w, h), Image.LANCZOS), (w + 12, 28))
    d = ImageDraw.Draw(sheet)
    d.text((6, 8), f'WebGL  ({gl}_{v})', fill=(230, 220, 190)); d.text((w + 18, 8), f'WebGPU  ({gpu}_{v})   {differ:.1f}% of pixels differ', fill=(230, 220, 190))
    path = f'{SHOTS}/{out}_{v}.png'
    sheet.save(path)
    print(f'{v}: {differ:.1f}% differ -> {path}')
