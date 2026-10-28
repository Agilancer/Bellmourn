// The three test rooms. Coordinates are world pixels; one screen is 640x360.
// Layers: far (0.82 parallax, the room's back wall), back (1.0, columns/props behind the player),
// fg (collision masonry), front (1.25, dark silhouettes in front of everything).
import { VIEW_W, VIEW_H } from './world.js';

const farX = (X) => VIEW_W / 2 + 0.82 * (X - VIEW_W / 2);
const farY = (Y) => VIEW_H / 2 + 0.82 * (Y - VIEW_H / 2);
const frontX = (X) => VIEW_W / 2 + 1.25 * (X - VIEW_W / 2);

// Stacked column: base on the floor, shaft segments, capital under the ceiling.
function column(room, layer, cx, floorY, topY, kind = 'col') {
  room.op(layer, (g, A) => {
    const base = A.size(kind + '_base'), cap = A.size(kind + '_cap'), shaft = A.size(kind + '_shaft');
    const by = floorY - base.h;
    A.draw(g, kind + '_base', cx - base.w / 2, by);
    let y = by;
    while (y > topY + cap.h - 2) {
      const h = Math.min(shaft.h, y - (topY + cap.h - 2));
      A.drawPart(g, kind + '_shaft', 0, shaft.h - h, shaft.w, h, cx - shaft.w / 2, y - h);
      y -= h;
    }
    A.draw(g, kind + '_cap', cx - cap.w / 2, topY);
  });
}

// A dark silhouette (foreground depth layer).
function silhouette(room, name, x, y, scale = 1, alpha = 0.92) {
  room.op('front', (g, A) => {
    const r = A.size(name);
    const [c, cg] = [document.createElement('canvas'), null];
    c.width = r.w * scale; c.height = r.h * scale;
    const t = c.getContext('2d');
    t.imageSmoothingEnabled = false;
    t.drawImage(A.img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    t.globalCompositeOperation = 'source-atop';
    t.fillStyle = `rgba(18,11,26,${alpha})`;
    t.fillRect(0, 0, c.width, c.height);
    g.drawImage(c, Math.round(x), Math.round(y));
  });
}

function hTile(room, layer, names, x0, x1, y) {
  room.op(layer, (g, A) => {
    let x = x0, i = 0;
    while (x < x1) { const n = names[i++ % names.length]; A.draw(g, n, x, y); x += A.size(n).w - 2; }
  });
}

function vChain(room, layer, x, y0, y1) {
  room.op(layer, (g, A) => {
    const r = A.size('chain_v');
    for (let y = y0; y < y1; y += r.h - 2) A.drawPart(g, 'chain_v', 0, 0, r.w, Math.min(r.h, y1 - y), x, y);
  });
}

// ------------------------------------------------------------------------------------------
export const ROOMS = {
  hall: {
    name: 'Hall of Mourning Bells',
    w: 1600, h: 360,
    ambient: [122, 108, 152],
    farTexture: ['bg_darkstone_1', 'bg_darkstone_2'],
    farTint: '#857ea4',
    backTint: '#c4bed8',
    entries: { west: { x: 44, y: 316, f: 1 }, east: { x: 1556, y: 316, f: -1 }, start: { x: 150, y: 316, f: 1 } },
    build(r) {
      const FLOOR = 316, CEIL = 34;
      // far wall: frieze under the vault, gallery of windows, wainscot at the base
      hTile(r, 'far', ['frieze'], 0, r.farW ?? 1440, farY(CEIL) - 2);
      r.op('far', (g, A, room) => room.tile(g, ['bg_wainscot_1', 'bg_wainscot_2'], 0, farY(FLOOR) - 52, 1440, 52, 0));
      const wins = [[330, 'window_stained'], [630, 'window_rose'], [930, 'window_stained'], [1230, 'window_double'], [1500, 'window_stained']];
      for (const [X, n] of wins) {
        const w = { window_stained: 43, window_rose: 79, window_double: 67 }[n];
        r.window('far', n, farX(X) - w / 2, farY(96), { len: 230, slant: 60 });
        if (n !== 'window_stained') {
          r.piece('far', 'curtain_l', farX(X) - w / 2 - 22, farY(92));
          r.piece('far', 'curtain_r', farX(X) + w / 2 - 16, farY(92));
        }
      }
      for (const X of [480, 780, 1080, 1380]) r.piece('far', 'pilaster', farX(X) - 11, farY(FLOOR) - 52 - 51);
      r.piece('far', 'painting', farX(180) - 30, farY(120));
      r.piece('far', 'portrait', farX(1080) - 24, farY(110));
      r.piece('far', 'niche', farX(780) - 23, farY(150));
      r.piece('far', 'bust', farX(780) - 17, farY(150) - 6);
      r.piece('far', 'web', farX(40), farY(CEIL) + 28);

      // back: colonnade with banners and torches
      const cols = [180, 480, 780, 1080, 1380];
      cols.forEach((cx, i) => {
        column(r, 'back', cx, FLOOR, CEIL, i % 2 ? 'mcol' : 'col');
        r.piece('back', i % 2 ? 'banner_blue' : 'banner_red', cx - 19, 96);
        r.torch(cx + 12, 168);
      });
      // chandeliers on chains
      for (const X of [630, 1230]) {
        vChain(r, 'back', X - 7, CEIL, 92);
        r.candle('chandelier', X - 30, 90, { breakable: false, r: 170, lightY: 40,
          flames: [[8, 30], [16, 26], [24, 31], [30, 22], [38, 31], [45, 26], [53, 30]] });
      }
      r.piece('back', 'gargoyle', 945, 262 - 62);
      r.piece('back', 'gargoyle', 1150, 262 - 62, { flip: true });

      // collision masonry
      r.solid(0, 0, 1600, CEIL);
      r.solid(0, CEIL, 30, 220 - CEIL);
      r.solid(1570, CEIL, 30, 220 - CEIL);
      r.piece('back', 'door_open', -8, 220);
      r.piece('back', 'door_open', 1549, 220);
      r.floor(0, 1600, FLOOR);
      r.floor(940, 1205, 262, { style: 'marble', bottom: FLOOR, capL: true, capR: true });
      r.ledge(258, 244, 1);
      r.ledge(468, 176, 1);
      r.ledge(706, 236, 0);
      r.ledge(1010, 182, 1);
      r.ledge(1290, 212, 1);
      r.ledge(1440, 142, 0);

      // breakable candelabras (SOTN candles)
      r.candle('candelabra', 230, FLOOR - 59, { flames: [[5, 5], [11, 3], [17, 1], [23, 3], [29, 5]], lightY: 4 });
      r.candle('candelabra', 860, FLOOR - 59, { flames: [[5, 5], [11, 3], [17, 1], [23, 3], [29, 5]], lightY: 4 });
      r.candle('candelabra', 1500, FLOOR - 59, { flames: [[5, 5], [11, 3], [17, 1], [23, 3], [29, 5]], lightY: 4 });
      r.candle('candle_triple', 1055, 262 - 44, { flames: [[6, 4], [16, 1], [26, 4]], lightY: 4 });
      r.candle('candle_sconce', 520, 150, { flames: [[16, 2]], r: 70 });

      // foreground silhouettes
      silhouette(r, 'mcol_shaft', frontX(720), -10, 1.5, 0.85);
      silhouette(r, 'mcol_shaft', frontX(720), 140, 1.5, 0.85);
      silhouette(r, 'mcol_shaft', frontX(720), 290, 1.5, 0.85);
      silhouette(r, 'chain_v', frontX(1330), -10, 2);
      silhouette(r, 'chain_v', frontX(1330), 110, 2);
    },
    exits: [['W', 200, 316, 'ramparts', 'east'], ['E', 200, 316, 'shaft', 'west']],
  },

  // ----------------------------------------------------------------------------------------
  shaft: {
    name: 'The Tolling Shaft',
    w: 640, h: 1080,
    ambient: [104, 100, 146],
    farTexture: ['bg_brick_1', 'bg_brick_2'],
    farTint: '#7a779e',
    backTint: '#bdb8d4',
    entries: { west: { x: 56, y: 1044, f: 1 }, east: { x: 588, y: 196, f: -1 } },
    build(r) {
      const FLOOR = 1044;
      // far: brick shaft, high windows, a wainscot near the bottom
      for (const [X, Y] of [[200, 140], [440, 420], [190, 700]]) r.window('far', 'window_stained', farX(X) - 21, farY(Y), { len: 260, slant: 50 });
      r.op('far', (g, A, room) => room.tile(g, ['bg_plaster_1', 'bg_plaster_2'], 0, farY(FLOOR) - 50, 700, 50, 0));
      r.piece('far', 'clock_dial', farX(470) - 30, farY(150));
      vChain(r, 'far', farX(120), 0, farY(980));
      vChain(r, 'far', farX(520), 0, farY(860));

      // back: torches up both walls, hanging chains with a counterweight, gear housings
      for (const [x, y] of [[44, 900], [556, 760], [44, 600], [556, 460], [44, 300], [556, 120]]) r.torch(x < 320 ? x : x - 40, y);
      vChain(r, 'back', 250, 30, 380);
      r.piece('back', 'counterweight', 243, 378);
      vChain(r, 'back', 420, 30, 640);
      r.piece('back', 'pulley', 414, 640);
      r.piece('back', 'gear_iron', 40, 520);
      r.piece('back', 'gear_bronze', 552, 300);
      r.piece('back', 'gear_small', 556, 920);
      r.piece('back', 'door_open', -8, 948);
      r.piece('back', 'door_open', 589, 100);

      r.solid(0, 0, 640, 30);
      r.solid(0, 30, 40, 918);
      r.solid(600, 30, 40, 70);
      r.solid(600, 196, 40, FLOOR - 196);
      r.floor(0, 640, FLOOR);
      r.floor(470, 600, 196, { bottom: 226, capL: true });
      const beams = [[300, 956], [70, 868], [320, 780], [90, 692], [360, 604], [70, 516], [300, 428], [80, 340], [326, 262]];
      for (const [x, y] of beams) r.ledge(x, y, 1, 'beam');
      r.candle('candle_sconce', 300, 990, { flames: [[16, 2]], r: 70 });
      r.candle('candle_triple', 520, FLOOR - 44, { flames: [[6, 4], [16, 1], [26, 4]], lightY: 4 });

      silhouette(r, 'chain_v', frontX(150), 0, 2);
      silhouette(r, 'chain_v', frontX(150), 120, 2);
      silhouette(r, 'chain_v', frontX(150), 240, 2);
      silhouette(r, 'gear_iron', frontX(560), 640, 2, 0.88);
    },
    // The great bell hangs in the shaft's far depth and sways.
    drawFarExtra(ctx, cam, t, room) {
      const S = 3;
      if (!room.bellImg) {
        // the bell, scaled up and pushed back into the gloom of the far wall (tinted once)
        const A = room.atlas, r = A.size('bell');
        const c = document.createElement('canvas');
        c.width = r.w * S; c.height = r.h * S;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.drawImage(A.img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = '#6e6b94';
        g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(A.img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
        room.bellImg = c;
      }
      const b = room.bellImg;
      const px = 320 - cam.x * 0.82, py = farY(40) - cam.y * 0.82;
      ctx.save();
      ctx.translate(Math.round(px), Math.round(py));
      ctx.rotate(Math.sin(t * 0.018) * 0.06);
      ctx.drawImage(b, -b.width / 2, 0);
      ctx.restore();
    },
    exits: [['W', 948, 1044, 'hall', 'east'], ['E', 100, 196, 'ramparts', 'west']],
  },

  // ----------------------------------------------------------------------------------------
  ramparts: {
    name: 'Velscour Ramparts',
    w: 1920, h: 360,
    exterior: true,
    ambient: [150, 132, 178],
    farTint: '#8d86ab',
    backTint: '#cbc3dc',
    entries: { west: { x: 34, y: 300, f: 1 }, east: { x: 1886, y: 300, f: -1 } },
    build(r) {
      const FLOOR = 300;
      // far: a distant curtain wall
      r.op('far', (g, A) => {
        const fw = A.size('far_wall');
        for (let x = -20; x < 1800; x += fw.w * 2 - 4) g.drawImage(A.img, A.rects.far_wall.x, A.rects.far_wall.y, fw.w, fw.h, x, farY(FLOOR) - fw.h * 2 + 30, fw.w * 2, fw.h * 2);
      });
      // back: parapet merlons behind the walk, tower roofs
      const segs = [[0, 430], [520, 860], [960, 1170], [1290, 1590], [1680, 1920]];
      for (const [a, b] of segs) hTile(r, 'back', ['battlement_m'], a, b, FLOOR - 50);
      r.piece('back', 'roof_peak', 1392, 220 - 83);
      r.piece('back', 'roof_l', 1330, 220 - 90);
      r.piece('back', 'roof_r', 1450, 220 - 90);
      r.piece('back', 'buttress', 860 - 30, FLOOR - 113 + 40);
      r.piece('back', 'banner_red', 690, FLOOR - 120);
      r.piece('back', 'door_open', -10, 204);
      r.piece('back', 'door_open', 1871, 204);
      r.torch(400, 196);
      r.torch(1040, 196);
      r.torch(1690, 196);
      r.piece('back', 'gargoyle', 1176, FLOOR - 62);

      // walkways with pits between them
      r.solid(0, 0, 26, 204);
      r.solid(1894, 0, 26, 204);
      for (const [a, b] of segs) r.floor(a, b, FLOOR, { capL: a > 0, capR: b < 1920 });
      r.floor(1340, 1500, 220, { bottom: FLOOR, capL: true, capR: true });
      r.ledge(600, 214, 0);
      r.ledge(1010, 196, 1);
      r.ledge(1724, 206, 0);
      r.candle('candelabra', 760, FLOOR - 59, { flames: [[5, 5], [11, 3], [17, 1], [23, 3], [29, 5]], lightY: 4 });
      r.candle('candelabra', 1560, FLOOR - 59, { flames: [[5, 5], [11, 3], [17, 1], [23, 3], [29, 5]], lightY: 4 });
      silhouette(r, 'battlement_l', frontX(470), 290, 2);
      silhouette(r, 'battlement_r', frontX(1250), 290, 2);
    },
    // Night sky: blood moon, drifting cloud banks, mountains, the keep of Velscour.
    drawSky(ctx, cam, t, room) {
      const A = room.atlas;
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      g.addColorStop(0, '#07050d');
      g.addColorStop(0.55, '#1b1428');
      g.addColorStop(1, '#3a2232');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      // stars
      for (let i = 0; i < 70; i++) {
        const sx = ((i * 97.3) % 1) * 0 + ((i * 131) % 640), sy = (i * 53) % 200;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.02 + i));
        ctx.fillStyle = `rgba(220,210,255,${0.25 * tw})`;
        ctx.fillRect(((sx - cam.x * 0.02) % 640 + 640) % 640, sy, 1, 1);
      }
      // moon
      const mx = 470 - cam.x * 0.04, my = 78;
      const mg = ctx.createRadialGradient(mx, my, 10, mx, my, 120);
      mg.addColorStop(0, 'rgba(200,60,60,0.35)');
      mg.addColorStop(1, 'rgba(120,20,40,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(mx - 120, my - 120, 240, 240);
      ctx.fillStyle = '#c44a46';
      ctx.beginPath(); ctx.arc(mx, my, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e07a5e';
      ctx.beginPath(); ctx.arc(mx - 4, my - 4, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120,30,40,0.5)';
      for (const [ox, oy, rr] of [[-10, -6, 6], [8, 6, 4], [4, -12, 3], [-6, 10, 3]]) { ctx.beginPath(); ctx.arc(mx + ox, my + oy, rr, 0, 6.3); ctx.fill(); }
      // parallax bands
      const band = (name, par, y, S, drift, alpha = 1) => {
        const r = A.size(name);
        const w = r.w * S - S * 2;
        ctx.globalAlpha = alpha;
        let x0 = -(((cam.x * par + t * drift) % w) + w) % w;
        for (let x = x0 - w; x < VIEW_W + w; x += w) ctx.drawImage(A.img, r.x, r.y, r.w, r.h, Math.round(x), y, r.w * S, r.h * S);
        ctx.globalAlpha = 1;
      };
      band('far_clouds_a', 0.06, 10, 3, 0.05, 0.55);
      band('far_mountains', 0.12, 150, 3, 0);
      band('far_clouds_b', 0.18, 60, 3, 0.12, 0.45);
      const fc = A.size('far_castle_a');
      const cx = 200 - cam.x * 0.25;
      ctx.drawImage(A.img, fc.x, fc.y, fc.w, fc.h, Math.round(cx), 4, fc.w * 2, fc.h * 2);
      // low mist
      const mist = ctx.createLinearGradient(0, 220, 0, VIEW_H);
      mist.addColorStop(0, 'rgba(90,70,110,0)');
      mist.addColorStop(1, 'rgba(90,70,110,0.55)');
      ctx.fillStyle = mist;
      ctx.fillRect(0, 220, VIEW_W, VIEW_H - 220);
      // bats crossing the moon
      for (let i = 0; i < 4; i++) {
        const u = ((t * 0.0016 + i * 0.27) % 1);
        const bx = -40 + u * 760, by = 70 + Math.sin(u * 9 + i) * 26 + i * 12;
        const flap = Math.sin(t * 0.5 + i * 2) > 0;
        ctx.fillStyle = '#0a0610';
        ctx.fillRect(Math.round(bx), Math.round(by), 3, 2);
        if (flap) { ctx.fillRect(Math.round(bx) - 3, Math.round(by) - 2, 3, 1); ctx.fillRect(Math.round(bx) + 3, Math.round(by) - 2, 3, 1); }
        else { ctx.fillRect(Math.round(bx) - 3, Math.round(by) + 1, 3, 1); ctx.fillRect(Math.round(bx) + 3, Math.round(by) + 1, 3, 1); }
      }
    },
    exits: [['W', 204, 300, 'shaft', 'east'], ['E', 204, 300, 'hall', 'west']],
  },
};
