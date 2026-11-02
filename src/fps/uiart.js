// The HUD's pixel art (tools/ui/hud.px.js, drawn with pxl): one sheet, assets/ui/hud.png + hud.json,
// cut up here. Pieces come out as canvases at any whole-number scale, as data URLs for CSS (the
// frame, the spell slot, the gear and the log's icons are set on :root as --ui-* custom
// properties), and re-coloured: the damage digits and tag words are drawn in four greys over black,
// and paint() swaps those five exact colours for a kind of damage's own.

const SHEET = 'assets/ui/hud.png', FRAMES = 'assets/ui/hud.json';
// the five tones the font is drawn in: light to dark, then the outline
const TONES = [0xffffff, 0xc0c0c0, 0x808080, 0x404040, 0x000000];

class UiArt {
  constructor() {
    this.frames = {};
    this.img = null; this.px = null;   // the sheet, and its pixels (for re-colouring)
    this.cache = new Map();
    this.ready = this.load().catch((e) => { console.warn('ui art', e); });
  }

  async load() {
    const [frames, img] = await Promise.all([
      fetch(FRAMES).then((r) => r.json()),
      new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = SHEET; }),
    ]);
    for (const [k, f] of Object.entries(frames.frames)) this.frames[k] = f.frame;
    this.img = img;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    this.px = g.getImageData(0, 0, img.width, img.height);
    this.publish();
  }

  has(name) { return !!this.frames[name]; }
  size(name) { const f = this.frames[name]; return f ? [f.w, f.h] : [0, 0]; }

  /** A piece of the sheet at `scale` (whole numbers stay crisp), re-coloured by `ramp` if given:
   * { tones: [light, l2, l3, dark], edge } (CSS colours). */
  canvas(name, scale = 1, ramp = null) {
    const key = name + '|' + scale + '|' + (ramp ? ramp.key || (ramp.key = ramp.tones.join() + ramp.edge) : '');
    let c = this.cache.get(key);
    if (c) return c;
    const f = this.frames[name];
    c = document.createElement('canvas');
    if (!f || !this.px) { c.width = c.height = 1; return c; }
    c.width = f.w * scale; c.height = f.h * scale;
    const g = c.getContext('2d');
    const one = document.createElement('canvas');
    one.width = f.w; one.height = f.h;
    const og = one.getContext('2d'), out = og.createImageData(f.w, f.h);
    const src = this.px.data, W = this.px.width;
    const map = ramp ? [...ramp.tones, ramp.edge].map(hex) : null;
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const s = ((f.y + y) * W + f.x + x) * 4, d = (y * f.w + x) * 4;
        let r = src[s], gg = src[s + 1], b = src[s + 2];
        const a = src[s + 3];
        if (map && a) {
          const i = TONES.indexOf((r << 16) | (gg << 8) | b);
          if (i >= 0) [r, gg, b] = map[i];
        }
        out.data[d] = r; out.data[d + 1] = gg; out.data[d + 2] = b; out.data[d + 3] = a;
      }
    }
    og.putImageData(out, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(one, 0, 0, c.width, c.height);
    this.cache.set(key, c);
    return c;
  }

  url(name, scale = 1, ramp = null) {
    const key = 'url|' + name + '|' + scale;
    if (!ramp && this.cache.has(key)) return this.cache.get(key);
    const u = this.canvas(name, scale, ramp).toDataURL();
    if (!ramp) this.cache.set(key, u);
    return u;
  }

  /** The pieces CSS uses, as custom properties on :root (the frame at 1x: border-image scales it). */
  publish() {
    const root = document.documentElement.style;
    for (const n of ['frame', 'slot', 'gear', 'gear_hot', 'grip']) root.setProperty('--ui-' + n.replace('_', '-'), `url(${this.url(n)})`);
    for (const n of Object.keys(this.frames)) if (/^(ic|af)_/.test(n)) root.setProperty('--' + n.replace('_', '-'), `url(${this.url(n)})`);
    document.documentElement.classList.add('ui-art');
  }
}

const hex = (c) => {
  const n = parseInt(c.slice(1), 16);
  return c.length === 4 ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const uiArt = new UiArt();
