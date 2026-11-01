// The neural voice: Kokoro-82M (hexgrad, Apache-2.0; onnx-community/Kokoro-82M-v1.0-ONNX) through
// kokoro-js (Apache-2.0), run here, off the game's thread, so nothing waits on it. The model (the
// 8-bit build, about 90 MB) is fetched the first time and kept in the browser's cache after.
//   in:  { type: 'load' }  { type: 'say', id, text, voice, speed }
//   out: { type: 'ready' } { type: 'audio', id, audio (Float32Array), rate } { type: 'fail', id }
//        { type: 'error', error }
const LIB = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts = null, loading = null;

async function load() {
  const { KokoroTTS } = await import(LIB);
  tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'q8', device: 'wasm' });
}

// one line at a time, in the order asked (the game drops what it no longer wants)
const queue = [];
let busy = false;
async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const m = queue.shift();
    try {
      await loading;
      const t0 = performance.now();
      const a = await tts.generate(m.text, { voice: m.voice, speed: m.speed || 1 });
      const audio = a.audio instanceof Float32Array ? a.audio : new Float32Array(a.audio);
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
    loading ||= load();
    loading.then(() => postMessage({ type: 'ready' }), (err) => postMessage({ type: 'error', error: String(err && err.stack || err) }));
  } else if (m.type === 'say') {
    queue.push(m);
    pump();
  } else if (m.type === 'drop') {                // (lines the game has given up on, still waiting)
    for (let i = queue.length - 1; i >= 0; i--) if (m.ids.includes(queue[i].id)) queue.splice(i, 1);
  }
};
