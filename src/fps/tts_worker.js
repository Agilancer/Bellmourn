// The neural voice: Kokoro-82M (hexgrad, Apache-2.0; onnx-community/Kokoro-82M-v1.0-ONNX) through
// kokoro-js (Apache-2.0), run here, off the game's thread, so nothing waits on it. The model is
// fetched the first time and kept in the browser's cache after. On a computer it's the full build
// (fp32, 326 MB) on several threads (the page is cross-origin isolated: coi.js), which speaks about
// twice as fast as it talks; the 8-bit build (92 MB) can't use the threads and is slower than speech,
// so it's only for a phone (the memory) or where the threads can't be had. If the full build won't
// load, the 8-bit one does instead.
//   in: { type: 'load', voices: [every voice the game uses: each is fetched before 'ready'], dtype, threads }
//       { type: 'say', id, text, voice, speed, pri }  { type: 'bump', ids, pri }  { type: 'drop', ids }
//   out: { type: 'download', loaded, total } (the model coming, bytes) { type: 'model', dtype, threads }
//        { type: 'progress', got, of } { type: 'ready' } { type: 'audio', id, audio (Float32Array), rate } { type: 'fail', id }
//        { type: 'error', error }
const LIB = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
const ORT = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/+esm';   // (the very module kokoro-js runs on)
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts = null, loading = null;

async function load(voices = [], { dtype = 'q8', threads = 1 } = {}) {
  const T = await import(ORT);
  if (threads > 1 && self.crossOriginIsolated) T.env.backends.onnx.wasm.numThreads = threads;
  const { KokoroTTS } = await import(LIB);
  const progress_callback = (p) => { if (p.status === 'progress' && p.total > 4e6) postMessage({ type: 'download', loaded: p.loaded, total: p.total }); };
  try {
    tts = await KokoroTTS.from_pretrained(MODEL, { dtype, device: 'wasm', progress_callback });
  } catch (err) {
    if (dtype === 'q8') throw err;
    console.warn('voices: the full model would not load; the 8-bit one instead', String(err));
    dtype = 'q8';
    tts = await KokoroTTS.from_pretrained(MODEL, { dtype, device: 'wasm', progress_callback });
  }
  postMessage({ type: 'model', dtype, threads: T.env.backends.onnx.wasm.numThreads || 1 });
  // every voice fetched now (each one's style file comes the first time it speaks): a word in each
  let got = 0;
  for (const voice of voices) {
    try { await tts.generate('Hm.', { voice }); } catch (err) { console.warn('voices: no', voice, String(err)); }
    postMessage({ type: 'progress', got: ++got, of: voices.length });
  }
}

/** The model's own quiet cut from either end of what it says (about a quarter second before every
 * piece and half a second after: strung together, that was most of a second between one sentence and
 * the next, and a beat late on every first word). The game puts its own pauses between them, by the
 * punctuation (voice.js pauseAfter). A breath of it is kept, faded, and a lone click at the end
 * isn't taken for speech. */
function trim(a, rate) {
  const win = Math.max(1, Math.round(rate * 0.01)), n = Math.floor(a.length / win);
  if (n < 8) return a;
  const e = new Float32Array(n);
  let peak = 0;
  for (let w = 0; w < n; w++) {
    let m = 0;
    for (let i = w * win, j = i + win; i < j; i++) { const x = a[i] < 0 ? -a[i] : a[i]; if (x > m) m = x; }
    e[w] = m; if (m > peak) peak = m;
  }
  const th = Math.max(0.004, peak * 0.03);
  let s = 0; while (s < n - 1 && !(e[s] >= th && e[s + 1] >= th)) s++;
  let t = n - 1; while (t > s && !(e[t] >= th && e[t - 1] >= th)) t--;
  if (t - s < 4) return a;
  const from = Math.max(0, (s - 2) * win), to = Math.min(a.length, (t + 1) * win + Math.round(rate * 0.06));
  const out = a.slice(from, to);
  const fi = Math.min(out.length, Math.round(rate * 0.01)), fo = Math.min(out.length, Math.round(rate * 0.045));
  for (let i = 0; i < fi; i++) out[i] *= i / fi;
  for (let i = 0; i < fo; i++) out[out.length - 1 - i] *= i / fo;
  return out;
}

// one line at a time: the most pressing first (what's being said now, then what's waiting its turn,
// then what's made ahead), in the order asked among equals; the game drops what it no longer wants
const queue = [];
let busy = false, seq = 0, cur = null;
function next() {
  let b = 0;
  for (let i = 1; i < queue.length; i++) if (queue[i].pri > queue[b].pri || (queue[i].pri === queue[b].pri && queue[i].seq < queue[b].seq)) b = i;
  return queue.splice(b, 1)[0];
}
async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    // (the game's messages read before each sentence: what's newly asked for, bumped up or let go.
    // Without this the loop never let them in till the whole queue was made, and a line wanted at
    // once, or whose turn had come, waited behind everything asked for before it)
    await new Promise((r) => setTimeout(r, 0));
    if (!queue.length) break;
    const m = next();
    try {
      await loading;
      const t0 = performance.now();
      cur = { pri: m.pri, chars: m.text.length, t0 };
      const a = await tts.generate(m.text, { voice: m.voice, speed: m.speed || 1 });
      const audio = trim(a.audio instanceof Float32Array ? a.audio : new Float32Array(a.audio), a.sampling_rate);
      postMessage({ type: 'audio', id: m.id, audio, rate: a.sampling_rate, ms: performance.now() - t0 }, [audio.buffer]);
    } catch (err) {
      postMessage({ type: 'fail', id: m.id, error: String(err) });
    }
  }
  busy = false;
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'load') {
    loading ||= load(m.voices || [], m);
    loading.then(() => postMessage({ type: 'ready' }), (err) => postMessage({ type: 'error', error: String(err && err.stack || err) }));
  } else if (m.type === 'say') {
    m.pri ??= 0; m.seq = seq++;
    queue.push(m);
    pump();
  } else if (m.type === 'bump') {                // (lines whose turn has come: made first)
    for (const q of queue) if (m.ids.includes(q.id) && q.pri < m.pri) q.pri = m.pri;
  } else if (m.type === 'drop') {                // (lines the game has given up on, still waiting)
    for (let i = queue.length - 1; i >= 0; i--) if (m.ids.includes(queue[i].id)) queue.splice(i, 1);
  } else if (m.type === 'peek') {                // (for a test: what's waiting, and what's being made)
    postMessage({ type: 'peek', n: queue.length, top: queue.map((q) => q.pri).sort((a, b) => b - a).slice(0, 8),
      ids: queue.filter((q) => q.pri >= 9.5).map((q) => q.id), doing: busy && cur ? { pri: cur.pri, chars: cur.chars, ms: Math.round(performance.now() - cur.t0) } : null });
  }
};
