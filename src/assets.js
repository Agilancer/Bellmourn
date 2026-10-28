// Image/JSON loading plus the two atlases: player animation strips and the castle kit.

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('failed to load ' + src));
    img.src = src;
  });
}

export async function loadJSON(src) {
  const r = await fetch(src);
  if (!r.ok) throw new Error('failed to load ' + src);
  return r.json();
}

export const PLAYER_ANIMS = [
  'idle', 'walk', 'stop', 'crouch', 'run', 'jump', 'double_jump', 'slide',
  'attack_standing', 'attack_walking', 'attack_walking_b', 'attack_running', 'attack_running_b',
  'attack_jumping', 'attack_crouching',
];

// Player frames: each animation is a strip; every frame carries its anchor (ax, ay) = the point
// that sits on the player's feet position, and attack frames carry the fist position (hand).
export class SpriteSet {
  static async load(base) {
    const s = new SpriteSet();
    s.meta = await loadJSON(base + 'frames.json');
    s.images = {};
    await Promise.all(PLAYER_ANIMS.map(async (n) => { s.images[n] = await loadImage(`${base}${n}.png`); }));
    s.tints = new Map();
    return s;
  }

  frame(anim, i) { return this.meta[anim][i]; }

  // Draw frame so that its anchor lands on (x, y). flip mirrors around the anchor.
  draw(ctx, anim, i, x, y, flip, img = this.images[anim]) {
    const f = this.meta[anim][i];
    const dx = Math.round(flip ? x - (f.w - f.ax) : x - f.ax);
    const dy = Math.round(y - f.ay);
    if (flip) {
      ctx.save();
      ctx.translate(dx + f.w, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      ctx.restore();
    } else {
      ctx.drawImage(img, f.x, f.y, f.w, f.h, dx, dy, f.w, f.h);
    }
  }

  // A flat-colour silhouette of a whole strip, cached per colour (afterimages, hit flashes).
  tinted(anim, color) {
    const key = anim + color;
    let c = this.tints.get(key);
    if (!c) {
      const img = this.images[anim];
      c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      this.tints.set(key, c);
    }
    return c;
  }
}

export class Atlas {
  static async load(png, json) {
    const a = new Atlas();
    [a.img, a.rects] = await Promise.all([loadImage(png), loadJSON(json)]);
    return a;
  }

  size(name) {
    const r = this.rects[name];
    if (!r) throw new Error('no atlas piece ' + name);
    return r;
  }

  // Draw a piece with its top-left at (x, y). Optional width/height stretch, flip.
  draw(ctx, name, x, y, flip = false) {
    const r = this.size(name);
    if (flip) {
      ctx.save();
      ctx.translate(Math.round(x) + r.w, Math.round(y));
      ctx.scale(-1, 1);
      ctx.drawImage(this.img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      ctx.restore();
    } else {
      ctx.drawImage(this.img, r.x, r.y, r.w, r.h, Math.round(x), Math.round(y), r.w, r.h);
    }
  }

  // Draw only a sub-rectangle of a piece (for tiling textures without their outer outline).
  drawPart(ctx, name, sx, sy, sw, sh, x, y) {
    const r = this.size(name);
    ctx.drawImage(this.img, r.x + sx, r.y + sy, sw, sh, Math.round(x), Math.round(y), sw, sh);
  }
}
