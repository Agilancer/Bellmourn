// What a phone holds, made less (an iPhone kills a tab that holds too much, with no word of why: Safari's
// "A problem repeatedly occurred"). Imported first of all (main.js), so it's in place before anything loads.
//
// 1. The pictures at half their width and height: a quarter of the memory, twice over (the decoded copy
// the page keeps and the one on the GPU). Safari keeps every model's pictures as ImageBitmaps in the tab
// itself (three's GLTFLoader decodes them so from Safari 17), so the ~1,500 pictures the game loads were
// ~550 MB on the GPU and as much again in the tab.
//
// Every loader says a picture has come by setting texture.needsUpdate, so that's where this looks: a
// picture there (an <img> or an ImageBitmap, not a canvas, data or video) is held back from the GPU
// while a half-size copy is made (createImageBitmap: straight alpha kept, so nothing darkens round a
// leaf's or a hair's edge, and turned as three would turn it), then put in its place and let through.
// Held back, not uploaded and swapped: three gives a texture fixed storage the first time it's sent,
// so a smaller one after would only fill its corner. Where the browser won't make the copy that way,
// a canvas does it (premultiplied: a little darker at cut-out edges). The texels stay crisp: the
// shaders' sharpTexel goes by the texture's own size (engine.js). ?fulltex keeps them whole; ready()
// resolves once none are waiting (prepare awaits it before it uploads everything).
//
// 2. A model's file let go once it's made: three's GLTFLoader keeps the whole binary (and a copy of each
// of its pieces, the pictures' bytes among them) on gltf.parser, and the game keeps its models, so every
// model loaded was held about twice over for good. What's made from it (meshes, clips, textures) holds
// its own; the parser keeps its json and associations, which are small (zombies.js nameByBytes reads
// them). ?keepgltf keeps it all.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TOUCH } from './input.js';

const MIN = 128;        // (a picture under this on its longest side is left as it is)
const done = new WeakSet();       // sources seen to (made smaller, or left as they were)
const made = new WeakSet();       // the half-size copies themselves (never made smaller again)
const waiting = new Map();        // source -> the textures on it asked to be sent meanwhile
let pending = 0, settle = null;
export const stats = { halved: 0, kept: 0, failed: 0, before: 0, after: 0 };

const isPicture = (img) => (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement)
  || (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap);

const on = TOUCH && !/[?&]fulltex\b/.test(location.search);
if (on) {
  const P = THREE.Texture.prototype, d = Object.getOwnPropertyDescriptor(P, 'needsUpdate');
  if (d?.set) Object.defineProperty(P, 'needsUpdate', {
    configurable: true, get: d.get,
    set(v) {
      const s = this.source;
      if (v !== true || !s) return d.set.call(this, v);
      const hold = waiting.get(s);
      if (hold) { hold.add(this); return; }                       // (its copy's on the way: sent with it)
      if (done.has(s) || !isPicture(s.data) || made.has(s.data)) return d.set.call(this, v);
      done.add(s);
      const img = s.data, w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h || Math.max(w, h) < MIN) { stats.kept++; return d.set.call(this, v); }
      waiting.set(s, new Set([this]));
      pending++;
      shrink(img, w, h, this).then((got) => {
        const small = got?.pic;
        // (unless something put its own in meanwhile, glass.js; or a texture on it went to the GPU at
        // full size first, a clone made before the picture came: then it stays as it went)
        if (small && s.data === img && !sent(s)) {
          s.data = small; made.add(small);
          if (got.flipped) for (const t of waiting.get(s) || []) t.flipY = false;   // (turned over already)
          stats.halved++; stats.before += w * h * 4; stats.after += small.width * small.height * 4;
          if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) img.close?.();
        } else if (!small) stats.failed++;
        else small.close?.();
      }).finally(() => {
        const list = waiting.get(s) || [];
        waiting.delete(s);
        for (const t of list) d.set.call(t, true);                  // (now sent, at its new size)
        if (--pending === 0 && settle) { settle(); settle = null; }
      });
    },
  });
}

/** Half of `img` (w x h), as three would have sent it for texture `t`: {pic, flipped}, or null. */
async function shrink(img, w, h, t) {
  const W = Math.max(1, Math.round(w / 2)), H = Math.max(1, Math.round(h / 2));
  // an <img> is sent turned over if the texture says flipY; an ImageBitmap is sent as it is whatever
  // the texture says (three: flipY and premultiplyAlpha don't apply to one), so a copy made of an
  // <img> is turned over in the making, and its textures told it is
  const bitmap = typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap;
  const flip = !bitmap && t.flipY, alpha = t.premultiplyAlpha ? 'premultiply' : 'none';
  const tries = [
    { resizeWidth: W, resizeHeight: H, premultiplyAlpha: alpha, colorSpaceConversion: 'none', ...(flip ? { imageOrientation: 'flipY' } : {}) },
    { resizeWidth: W, resizeHeight: H, premultiplyAlpha: alpha, ...(flip ? { imageOrientation: 'flipY' } : {}) },   // (an option it won't take)
  ];
  if (typeof createImageBitmap === 'function') for (const o of tries) {
    try {
      const b = await createImageBitmap(img, o);
      if (b.width === W && b.height === H) return { pic: b, flipped: flip };
      b.close?.();   // (it ignored the size: no good)
      break;
    } catch { /* the next way */ }
  }
  try {   // (a canvas: three turns it over itself, as it did the <img>)
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (!g) return null;
    g.drawImage(img, 0, 0, W, H);
    return { pic: cv, flipped: false };
  } catch { return null; }
}

let renderer = null;
/** The renderer whose record says what has gone to the GPU (WebGL: three keeps it per source). */
export function useRenderer(r) { renderer = r?.isWebGLRenderer ? r : null; }
const sent = (s) => { try { return renderer?.properties.get(s).__version !== undefined; } catch { return false; } };

/** Resolves once every picture waiting for its copy has it (at once where none are). */
export function ready() {
  if (!pending) return Promise.resolve();
  return new Promise((r) => { const prev = settle; settle = () => { prev?.(); r(); }; });
}

export const halving = on;

// ------------------------------------------------------------------ the models' files let go
export const gltfStats = { files: 0 };
if (TOUCH && !/[?&]keepgltf\b/.test(location.search)) {
  const parse = GLTFLoader.prototype.parse;
  GLTFLoader.prototype.parse = function (data, path, onLoad, onError) {
    return parse.call(this, data, path, (gltf) => { lighten(gltf); onLoad?.(gltf); }, onError);
  };
}

/** What three's parser holds of a parsed model's file, let go (the meshes, clips and textures made from
 * it hold their own pieces). */
function lighten(gltf) {
  const p = gltf?.parser;
  if (!p) return;
  try { p.cache?.removeAll?.(); } catch { /* as it is */ }
  const bin = p.extensions?.KHR_binary_glTF;
  if (bin) bin.body = null;
  gltfStats.files++;
}
