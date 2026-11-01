// Monster voice auditions: the same monster lines said through each of the effects in voicefx.js
// (and the game's own effect for that speaker, to compare), rendered offline exactly as the game
// would play them: the neural voice (tts_worker.js), its pieces and pauses (voice.js), the speaker's
// pitch, then the effect chain. Saved as art/view/shots/mv_<speaker>_<variant>.wav, each brought to
// one loudness so they compare fairly.
// In a page served by tools/serve.py:
//   await (await import('/tools/monster_voices.js')).render()          (or render(['dead']) for one speaker)
import { neuralCast, fxInput, splitLine, sayable, paceOf, pauseAfter } from '../src/fps/voice.js';
import { swellBuffer } from '../src/fps/voicefx.js';

// who speaks, and how the game casts them (voice.js neuralCast)
export const SPEAKERS = {
  dead: { key: 'dead:3', o: { sex: 'm', kind: 'undead' }, text: 'Mmrr... the bell... ghhaa thuul... so cold... Mother?' },
  ghast: { key: 'ghast:2', o: { kind: 'beast' }, text: 'Hssss! Kkkhhh... Sssskreee! Hhhaaah...' },
  sorcerer: { key: 'Rot Hierophant:4', o: { sex: 'm', kind: 'sorcerer' }, text: 'Rise, dead things. A guest has come.' },
  lord: { key: 'Ser Malgrave', o: { sex: 'm', kind: 'lord' }, text: 'I am Malgrave, the Red Hand of Velscour. Kneel.' },
};
// [speaker, variant, effect chain (null: the game's own for them now), what it is, swell?, pitch ratio instead of theirs?]
export const VARIANTS = [
  ['dead', 'now', null, 'As the dead sound now: pitched down, distorted, muffled'],
  ['dead', 'sub', ['sub', 'undead'], 'An octave-down second voice, a breath behind'],
  ['dead', 'ring', ['undead', 'ring:45'], 'Ring modulation at 45 Hz: hollow, metallic'],
  ['dead', 'rattle', ['fry', 'undead'], 'Death-rattle creak'],
  ['dead', 'all', ['sub', 'fry', 'undead', 'ring:45'], 'Octave-down + rattle + ring (my pick)'],
  ['dead', 'all_crypt', ['sub', 'fry', 'undead', 'ring:45', 'crypt'], 'The same, underground in a crypt'],
  ['dead', 'drowned', ['gurgle', 'sub', 'undead'], 'Gurgling, as if through water (the drowned)'],
  ['dead', 'wraith', ['whisper', 'crypt'], 'Whisper vocoder: words carried on breath (a wraith)'],
  ['ghast', 'now', null, 'As the ghasts sound now: pitched up, distorted'],
  ['ghast', 'whisper', ['whisper'], 'Whisper vocoder: pure breath, no pitch'],
  ['ghast', 'whisper_ring', ['whisper', 'ring:70', 'crypt'], 'Whisper + ring at 70 Hz, in a cave'],
  ['sorcerer', 'now', null, 'As the sorcerers sound now: a ringing echo'],
  ['sorcerer', 'chorus', ['chorus', 'echo'], 'Many mouths in unison'],
  ['sorcerer', 'swell', ['echo'], 'A reversed echo rising into each word', true],
  ['sorcerer', 'swell_chorus', ['chorus', 'crypt'], 'Reversed swell + many mouths, in a crypt', true],
  ['lord', 'now', null, 'As the lord sounds now: deep, behind his helm'],
  ['lord', 'sub', ['sub', 'helm'], 'An octave-down second voice under his'],
  ['lord', 'demon', ['sub', 'ring:30', 'helm'], 'Octave-down + ring at 30 Hz: something else speaks with him'],
];

function wav(samples, rate) {
  const b = new ArrayBuffer(44 + samples.length * 2), v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Uint8Array(b);
}

const RATE = 44100;

export async function render(only = null) {
  const worker = new Worker(new URL('../src/fps/tts_worker.js', import.meta.url), { type: 'module' });
  let n = 1;
  const ask = (m) => new Promise((res, rej) => {
    const on = (e) => {
      if (e.data.id === m.id || (m.type === 'load' && (e.data.type === 'ready' || e.data.type === 'error'))) {
        worker.removeEventListener('message', on);
        e.data.type === 'error' || e.data.type === 'fail' ? rej(e.data.error) : res(e.data);
      }
    };
    worker.addEventListener('message', on);
    worker.postMessage(m);
  });
  const casts = Object.fromEntries(Object.entries(SPEAKERS).map(([k, s]) => [k, neuralCast(s.key, s.o)]));
  const iso = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
  await ask({ type: 'load', voices: [...new Set(Object.values(casts).map((c) => c.voice))], dtype: iso ? 'fp32' : 'q8', threads: iso ? 8 : 1 });
  // each speaker's line, made once, laid out dry at their pitch with the game's pauses
  const dry = {};
  for (const [k, s] of Object.entries(SPEAKERS)) {
    if (only && !only.includes(k)) continue;
    const c = casts[k], pieces = splitLine(s.text), parts = [];
    for (const p of pieces) parts.push(await ask({ type: 'say', id: n++, text: sayable(p), voice: c.voice, speed: Math.max(0.6, Math.min(1.6, c.speed * paceOf(p))) }));
    const gaps = pieces.map((p, i) => (i < pieces.length - 1 ? pauseAfter(p) / Math.max(0.6, c.rate) : 0));
    const len = parts.reduce((a, q, i) => a + q.audio.length / q.rate / c.rate + gaps[i], 0) + 0.1;
    const oc = new OfflineAudioContext(1, Math.ceil(len * RATE), RATE);
    let at = 0.05;
    parts.forEach((q, i) => {
      const b = oc.createBuffer(1, q.audio.length, q.rate); b.copyToChannel(q.audio, 0);
      const src = oc.createBufferSource(); src.buffer = b; src.playbackRate.value = c.rate; src.connect(oc.destination); src.start(at);
      at += b.duration / c.rate + gaps[i];
    });
    dry[k] = await oc.startRendering();
  }
  // every variant: (the swell first, made from the whole line), the effect chain, a tail for echoes
  const out = [];
  for (const [k, name, chain, what, swell] of VARIANTS) {
    if (!dry[k]) continue;
    const src0 = swell ? await swellBuffer(dry[k], 1.1) : dry[k];
    const fx = chain || casts[k].fx;
    const oc = new OfflineAudioContext(1, src0.length + Math.round(2.6 * RATE), RATE);
    const s = oc.createBufferSource(); s.buffer = src0;
    s.connect(fxInput(oc, fx, oc.destination)); s.start();
    const r = (await oc.startRendering()).getChannelData(0);
    // one loudness for all (and no clipping), the silence after the echo dies cut off; and how much
    // louder or softer the effect made it than the voice that went in (voice.js casts' `level`)
    let sq = 0, pk = 0, last = 0, sq0 = 0;
    for (let i = 0; i < r.length; i++) { const x = r[i]; sq += x * x; if (Math.abs(x) > pk) pk = Math.abs(x); if (Math.abs(x) > 0.002) last = i; }
    const d0 = dry[k].getChannelData(0);
    for (let i = 0; i < d0.length; i++) sq0 += d0[i] * d0[i];
    const ratio = Math.sqrt(sq / Math.max(1, last)) / Math.sqrt(sq0 / d0.length || 1e-12);
    const g = Math.min(0.1 / Math.sqrt(sq / r.length || 1e-9), 0.97 / (pk || 1));
    const y = r.subarray(0, Math.min(r.length, last + Math.round(0.15 * RATE)));
    for (let i = 0; i < y.length; i++) y[i] *= g;
    const file = `mv_${k}_${name}`;
    await fetch(`/shot?name=${file}&ext=wav`, { method: 'POST', body: wav(y, RATE) });
    out.push({ file: file + '.wav', speaker: k, variant: name, what, fx: [].concat(fx).join(' + ') + (swell ? ' + swell' : ''), seconds: +(y.length / RATE).toFixed(2), ratio: +ratio.toFixed(3) });
  }
  worker.terminate();
  return out;
}
