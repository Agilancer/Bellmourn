// Views of the sky, the air and the water (effects.js Sky, Shafts, Mist, Smoke; water.js; comet.js),
// the same under either renderer, saved to art/view/shots/<prefix>_<name>.png (POST /shot, the
// harness). Steps the game by hand (its own loop held), so it runs in a hidden or headless tab.
//   (await import('/tools/sky_shots.js')).shots('gl')                 // the world's views
//   (await import('/tools/sky_shots.js')).shots('gl', ['sky_noon'])   // just some
//   (await import('/tools/sky_shots.js')).comet('gl')                 // the opening's green star
//   (await import('/tools/sky_shots.js')).isolate('gl')               // only these shaders' objects (and the sky)
import { dayState } from '/src/fps/effects.js';

const bm = () => window.bellmourn;
const ground = (x, z) => { const ph = bm().physics; return Math.max(ph.groundAt(x, z), ph.floorAt(x, z, ph.groundAt(x, z) + 1.5, 0.3, 0.2)); };
const toward = (dir, k = 100) => (at) => [at[0] + dir.x * k, at[1] + 1.7 + dir.y * k, at[2] + dir.z * k];
const PLAZA = [-6, null, 24];

export const VIEWS = {
  sky_noon: { at: PLAZA, look: [8, 30, -40], hour: 12 },
  sky_sun: { at: PLAZA, look: toward(dayState(12).sunDir), hour: 12 },
  sky_golden: { at: PLAZA, look: (at) => { const d = dayState(17.6).sunDir; return [at[0] + d.x * 100, at[1] + 1.7 + Math.max(d.y, 0.05) * 100, at[2] + d.z * 100]; }, hour: 17.6 },
  sky_night: { at: PLAZA, look: toward(dayState(23).moonDir), hour: 23 },
  sky_stars: { at: PLAZA, look: [8, 60, -30], hour: 23 },
  street: { at: [30, null, 4], look: [-40, 3, 10], hour: 17.6 },
  graveyard: { at: [0, null, -118], look: [6, 1.2, -160], hour: 23 },
  cathedral_out: { at: [17, null, -38], look: [0, 8, -60], hour: 14 },
  // (the nave runs north-south between x -12 and 12; its west windows let the afternoon sun in)
  cathedral_in: { at: [4, null, -66], look: [-12, 3, -76], hour: 16 },
  cathedral_stair: { at: [5, -3.5, -101.5], look: [5, -6, -108], hour: 22 },
  falls: { at: [668, null, -8], look: [736, 10, -40], hour: 15, frames: 240 },
  falls_foot: { at: () => { const f = bm().ctx.water.foot; return [f.x - 50, null, f.z + 12]; }, look: () => { const f = bm().ctx.water.foot; return [f.x, f.y + 5, f.z]; }, hour: 16.5, frames: 300 },
};

function pngOf(cv) {
  const bin = atob(cv.toDataURL('image/png').split(',')[1]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
const post = (name) => fetch(`/shot?name=${name}`, { method: 'POST', body: pngOf(document.getElementById('game')) });

/** The game's own loop (and three's) held while `f` runs; each step a frame for the nodes too. */
async function held(f) {
  const raf = window.requestAnimationFrame, q = [];
  window.requestAnimationFrame = (g) => { q.push(g); return 0; };
  await new Promise((r) => setTimeout(r, 100));
  try { return await f(); } finally { window.requestAnimationFrame = raf; for (const g of q) raf(g); }
}
const frameNodes = () => { const r = bm().renderer, nf = r._nodes?.nodeFrame; if (nf) { nf.update(); r.info.frame = nf.frameId; } };
async function settle() {
  const r = bm().renderer;
  if (r.backend?.device) await r.backend.device.queue.onSubmittedWorkDone();
  else { const gl = r.getContext(), px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
}
export const pipelines = () => { const r = bm().renderer; return r._pipelines?.caches?.size ?? r.info.programs?.length ?? 0; };

/** Whether an object is one of this port's: the sky, shafts, mist, smoke, or the water's. */
function ours(o) {
  const w = bm().ctx.water, u = o.material?.uniforms;
  if (w && (o === w.pool || o === w.stream || o === w.river)) return true;
  return !!u && (['zenith', 'density', 'power', 'bow', 'sunCol'].some((k) => k in u) || ('scale' in u && 'light' in u));
}

/** The views (as shots) with only this port's objects drawn (and the sky behind them): what these
 * shaders draw, apart from what the rest of the world (other shaders) does under each renderer. */
export async function isolate(prefix = 'i', only = null) {
  return shots(prefix, only, true);
}

export async function shots(prefix = 's', only = null, alone = false) {
  const b = bm(), p = b.player;
  b.begin?.();
  b.hud?.hud?.classList.add('hidden');
  const out = [];
  await held(async () => {
    for (const [name, v] of Object.entries(VIEWS)) {
      if (only && !only.includes(name)) continue;
      const at = typeof v.at === 'function' ? v.at() : [...v.at];
      if (at[1] == null) at[1] = ground(at[0], at[2]);
      const L = typeof v.look === 'function' ? v.look(at) : v.look;
      const yaw = Math.atan2(-(L[0] - at[0]), -(L[2] - at[2])), pitch = Math.atan2(L[1] - (at[1] + 1.7), Math.hypot(L[0] - at[0], L[2] - at[2]));
      b.setHour(v.hour);
      for (let i = 0; i < (v.frames || 60); i++) { p.pos.set(at[0], at[1], at[2]); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; b.vm.scene.visible = false; frameNodes(); b.tick(1 / 60); }
      if (alone) {
        const hid = [];
        b.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && !ours(o)) { o.visible = false; hid.push(o); } });
        frameNodes();
        b.composer.render(1 / 60);
        for (const o of hid) o.visible = true;
      }
      await settle();
      await post(`${prefix}_${name}`);
      out.push(name);
    }
  });
  b.vm.scene.visible = true;
  b.hud?.hud?.classList.remove('hidden');
  return { shots: out, pipelines: pipelines() };
}

/** The opening's comet: an Intro of its own (no knight, no sound) shows the shots at these times,
 * each played from its shot's start so the trail has built up behind it; drawn as the game draws.
 * alone: in the world's shots, only the comet (and the sky) drawn. */
export async function comet(prefix = 'c', times = [2.0, 3.9, 6.5, 8.4, 11.0, 17.4, 21.2, 22.4], alone = false) {
  const b = bm();
  b.begin?.();
  b.hud?.hud?.classList.add('hidden');
  const { Intro } = await import('/src/fps/intro.js');
  const { Comet, Space } = await import('/src/fps/comet.js');
  const { loadHero } = await import('/src/fps/hero.js');
  let hero = null;
  try { hero = await loadHero(); } catch (e) { console.warn('comet shots: no hero', e); }
  const C = b.composer, wp = C.worldPass || C.passes[0], vm = C.vmPass || C.passes[1];
  const it = new Intro({ ui: document.createElement('div'), scene: b.scene, camera: b.camera, worldPass: wp, renderer: b.renderer, light: b.cometLight });
  it.comet = new Comet(hero); it.space = new Space();
  const SHOTS = [[0, 4.2], [4.2, 9.0], [9.0, 12.6], [12.6, 15.6], [15.6, 18.2], [18.2, 20.6], [20.6, 23.2]];
  const out = [];
  const before = pipelines();
  await held(async () => {
    // the world at noon, the eye out on the meadow where the opening plays
    b.setHour(12);
    const p = b.player;
    for (let i = 0; i < 30; i++) { p.pos.set(-48, ground(-48, -40), -40); p.vel.set(0, 0, 0); frameNodes(); b.tick(1 / 60); }
    let last = -1, from = -1;
    for (const t of times) {
      const s = SHOTS.find(([a, z]) => t >= a && t < z) || SHOTS[0];
      if (s[0] !== from) { from = s[0]; last = s[0]; it.comet.clear(); }
      for (let u = last; u < t; u += 1 / 30) it.show(Math.min(u, t), 1 / 30, true);
      it.show(t, 1 / 30, true);
      last = t;
      vm.enabled = false;
      const hid = [], mine = new Set([it.comet.trail.points, it.comet.smoke.points]);
      it.comet.group.traverse((o) => mine.add(o));
      if (alone && wp.scene === b.scene) b.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && !mine.has(o) && !('zenith' in (o.material?.uniforms || {}))) { o.visible = false; hid.push(o); } });
      frameNodes();
      C.render(1 / 60);
      for (const o of hid) o.visible = true;
      await settle();
      await post(`${prefix}_comet_${t.toFixed(1)}`);
      out.push(t);
    }
    it.cut('sky');
    it.comet.remove();
    wp.scene = b.scene; wp.camera = b.camera; vm.enabled = true;
    b.cometLight.intensity = 0;
  });
  b.hud?.hud?.classList.remove('hidden');
  return { shots: out, pipelines: { before, after: pipelines() } };
}
