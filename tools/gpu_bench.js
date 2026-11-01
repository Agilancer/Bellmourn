// The renderer's benchmark: the same views under either renderer (WebGL or WebGPU), each stepped by
// hand (so it runs in a hidden or headless tab), uncapped: frames drawn back to back, the GPU waited
// for at the end, so ms/frame is what the CPU and GPU together can do, not the screen's refresh.
// Saves a picture of each view to art/view/shots/<prefix>_<view>.png (POST /shot, the harness).
//   (await import('/tools/gpu_bench.js')).bench('wgpu', { frames: 180 })
//   (await import('/tools/gpu_bench.js')).bench('gl', { only: ['plaza'] })
const cave = (name) => window.bellmourn.ctx.caves.find((c) => c.name === name);
export const VIEWS = {
  plaza: { at: [-6, null, 24], look: [8, 4, -40], hour: 13 },
  street: { at: [30, null, 4], look: [-40, 3, 10], hour: 17.6 },
  graveyard: { at: [0, null, -118], look: [6, 1.2, -160], hour: 23 },
  cathedral: { at: [17, null, -38], look: [0, 8, -60], hour: 14 },
  falls: { at: [668, null, -8], look: [736, 10, -40], hour: 15 },
  forest: { at: [-120, null, -40], look: [-170, 4, -70], hour: 11 },
  inn: { at: [23.4, null, 15.5], look: [34, 1.2, 20], hour: 20 },
  crypt: { at: [41, -21, -277], yaw: -Math.PI / 2, pitch: -0.18, hour: 22 },
  cave: { cave: 'The Gloamhollow', hour: 22 },
};

function pngOf(cv) {
  const bin = atob(cv.toDataURL('image/png').split(',')[1]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

/** GPU time of what's drawn between begin() and end(), averaged over the frames (WebGL's timer
 * query, or WebGPU's timestamps). */
function gpuTimer(bm) {
  const r = bm.renderer;
  if (r.isWebGPURenderer) {
    let sum = 0, n = 0;
    return { begin() {}, end() { n++; }, async result() {
      if (!r.backend?.trackTimestamp) return null;
      try { await r.resolveTimestampsAsync?.('render'); } catch { return null; }
      const ms = r.info.render.timestamp;
      return ms ? ms : null;
    } };
  }
  const gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return { begin() {}, end() {}, async result() { return null; } };
  const qs = [];
  let q = null;
  return {
    begin() { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); },
    end() { gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); q = null; },
    async result() {
      let sum = 0, n = 0;
      for (let tries = 0; tries < 200 && qs.length; tries++) {
        while (qs.length && gl.getQueryParameter(qs[0], gl.QUERY_RESULT_AVAILABLE)) {
          const d = qs.shift();
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { sum += gl.getQueryParameter(d, gl.QUERY_RESULT) / 1e6; n++; }
          gl.deleteQuery(d);
        }
        if (qs.length) await new Promise((res) => setTimeout(res, 10));
      }
      return n ? sum / n : null;
    },
  };
}

/** The 10th percentile of a list of ms (what a frame takes when nothing else is in the way). */
const p10 = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.floor(s.length * 0.1)].toFixed(2) : null; };

/** Wait for the GPU to finish everything sent so far. */
async function gpuSync(bm) {
  const r = bm.renderer;
  if (r.backend?.device) { await r.backend.device.queue.onSubmittedWorkDone(); return; }
  if (r.backend?.gl || r.getContext) {
    const gl = r.backend?.gl || r.getContext();
    const px = new Uint8Array(4);
    gl.bindFramebuffer?.(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }
}

function place(bm, v) {
  const p = bm.player, ph = bm.physics;
  let x, y, z, yaw, pitch;
  if (v.cave) {
    const c = cave(v.cave), room = c.features.find((f) => f.type === 'room');
    x = c.px + room.a - room.ra * 0.6; z = c.pz + room.b;
    y = c.floorAt(x, z) ?? c.mouth.y;
    yaw = Math.atan2(-(c.px + room.a - x), -(c.pz + room.b - z)); pitch = 0.12;
  } else {
    [x, y, z] = v.at;
    if (y == null) y = Math.max(ph.groundAt(x, z), ph.floorAt(x, z, ph.groundAt(x, z) + 1.5, 0.3, 0.2));
    if (v.look) {
      const [lx, ly, lz] = v.look;
      yaw = Math.atan2(-(lx - x), -(lz - z));
      pitch = Math.atan2(ly - (y + 1.7), Math.hypot(lx - x, lz - z));
    } else ({ yaw, pitch } = v);
  }
  return () => { p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; };
}

export async function bench(prefix = 'b', { frames = 150, warm = 45, only = null, shots = true } = {}) {
  const bm = window.bellmourn;
  bm.begin?.();
  // the game's own loop held while the frames are counted here
  const raf = window.requestAnimationFrame;
  const held = [];   // (the game's loop, and three's own under WebGPU)
  window.requestAnimationFrame = (f) => { held.push(f); return 0; };
  // (WebGPU: what three's own loop does each frame: a new frame for the nodes, and its number, which
  // the GPU's timestamps are grouped by)
  const frameNodes = () => { const nf = bm.renderer._nodes?.nodeFrame; if (nf) { nf.update(); bm.renderer.info.frame = nf.frameId; } };
  await new Promise((r) => setTimeout(r, 100));
  const info = bm.renderer.info;
  // (the game's own GPU timer off while this one runs: two can't time at once)
  const heldTimer = bm.res?.timer;
  if (bm.res) bm.res.timer = { begin() {}, end() {} };
  const out = { renderer: bm.renderer.isWebGPURenderer ? (bm.renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgpu-gl2') : 'webgl',
    size: [document.getElementById('game').width, document.getElementById('game').height], views: {} };
  for (const [name, v] of Object.entries(VIEWS)) {
    if (only && !only.includes(name)) continue;
    const put = place(bm, v);
    bm.setHour?.(v.hour ?? 13);
    for (let i = 0; i < warm; i++) { put(); frameNodes(); bm.tick(1 / 60); }
    await gpuSync(bm);
    if (shots) await fetch(`/shot?name=${prefix}_${name}`, { method: 'POST', body: pngOf(document.getElementById('game')) });
    // draw calls and triangles of one whole frame (every pass)
    const auto = info.autoReset;
    info.autoReset = false; info.reset();
    put(); frameNodes(); bm.tick(1 / 60);
    const calls = info.render.drawCalls ?? info.render.calls, tris = info.render.triangles;
    info.autoReset = auto;
    await gpuSync(bm);
    // the picture's own share of each frame (the CPU's side of drawing it), and the GPU's time
    const C = bm.composer, draw = C.render;
    let rcpu = 0; const drawT = [], cpuT = [];
    const T = gpuTimer(bm);
    C.render = function (...a) { const s = performance.now(); T.begin(); const r = draw.apply(this, a); T.end(); const d = performance.now() - s; rcpu += d; drawT.push(d); return r; };
    let cpu = 0;
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      put();
      const a = performance.now();
      frameNodes(); bm.tick(1 / 60);
      const c = performance.now() - a; cpu += c; cpuT.push(c);
      // (WebGPU: let the queue drain every few frames, as presenting would)
      if (i % 3 === 2 && bm.renderer.backend?.device) await new Promise((r) => setTimeout(r));
    }
    await gpuSync(bm);
    const wall = performance.now() - t0;
    C.render = draw;
    const gpu = await T.result();
    out.views[name] = { ms: +(wall / frames).toFixed(2), cpu: +(cpu / frames).toFixed(2), draw: +(rcpu / frames).toFixed(2), gpu: gpu != null ? +gpu.toFixed(2) : null, calls, tris, cpu10: p10(cpuT), draw10: p10(drawT) };
  }
  window.requestAnimationFrame = raf;
  for (const f of held) raf(f);
  if (bm.res && heldTimer) bm.res.timer = heldTimer;
  const v = Object.values(out.views);
  const avg = (k) => +(v.reduce((a, b) => a + (b[k] || 0), 0) / v.length).toFixed(2);
  out.mean = { ms: avg('ms'), cpu: avg('cpu'), draw: avg('draw'), gpu: avg('gpu'),
    calls: Math.round(v.reduce((a, b) => a + b.calls, 0) / v.length) };
  return out;
}
