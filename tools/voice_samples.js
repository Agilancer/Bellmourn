// Voice samples: lines said by the game's neural voices exactly as the game plays them (voice,
// pitch, pace and effect), rendered to art/view/shots/voice_<name>.png (WAV bytes: rename to .wav).
// In the page, once loaded:
//   await (await import('/tools/voice_samples.js')).samples()
import { neuralCast, fxInput } from '../src/fps/voice.js';

const LINES = [
  ['villager_woman', 'Elsie', { sex: 'f', kind: 'villager' }, "Morning, stranger. You look like you've seen things down there. Mind the graveyard on your way out."],
  ['villager_man', 'Garrow', { sex: 'm', kind: 'villager' }, "I made this for my boy, Aldo. A great sword, two hands, proper steel. Take it, and bring it back up every time."],
  ['villager_old', 'Reeve Osric', { sex: 'm', kind: 'villager', age: 'old' }, 'Thirteen strokes at midnight, and not a soul in the tower. That bell has never rung for nothing.'],
  ['knight', 'Sworn:7', { sex: 'm', kind: 'knight' }, 'So Bellmourn sent its best. Pity Bellmourn. Keep circling, little saint. I have all night.'],
  ['knight_lord', 'Ser Malgrave', { sex: 'm', kind: 'lord' }, 'Kneel, and I will make it quick. Stand, and I will make it last.'],
  ['sorcerer', 'Hollow Magister', { sex: 'm', kind: 'sorcerer' }, 'Your blood remembers the green star. Let me read it.'],
  ['undead', 'dead:3', { sex: 'm', kind: 'undead' }, 'mmrr... the bell... ghhaa thuul... so cold... mother?'],
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

export async function samples(only = null) {
  const worker = new Worker(new URL('../src/fps/tts_worker.js', import.meta.url), { type: 'module' });
  const ask = (m) => new Promise((res, rej) => {
    const on = (e) => { if (e.data.id === m.id || (m.type === 'load' && (e.data.type === 'ready' || e.data.type === 'error'))) { worker.removeEventListener('message', on); e.data.type === 'error' || e.data.type === 'fail' ? rej(e.data.error) : res(e.data); } };
    worker.addEventListener('message', on);
    worker.postMessage(m);
  });
  await ask({ type: 'load' });
  const out = [];
  let id = 1;
  for (const [name, key, o, text] of LINES) {
    if (only && !only.includes(name)) continue;
    const c = neuralCast(key, o);
    const a = await ask({ type: 'say', id: id++, text, voice: c.voice, speed: c.speed });
    const len = Math.ceil(a.audio.length / c.rate) + Math.round(a.rate * 0.6);
    const ctx = new OfflineAudioContext(1, len, a.rate);
    const buf = ctx.createBuffer(1, a.audio.length, a.rate); buf.copyToChannel(a.audio, 0);
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = c.rate;
    src.connect(fxInput(ctx, c.fx, ctx.destination)); src.start();
    const r = await ctx.startRendering();
    await fetch('/shot?name=voice_' + name, { method: 'POST', body: wav(r.getChannelData(0), a.rate) });
    out.push([name, c.voice, +c.rate.toFixed(2), c.fx, Math.round(a.ms) + ' ms']);
  }
  worker.terminate();
  return out;
}
