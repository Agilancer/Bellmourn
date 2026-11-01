// Voices: everyone who speaks in Bellmourn says their words aloud as well as in the bubble, in a
// voice of their own, with the best speech synthesis the device has (the browser's: natural,
// neural and online voices first, then Google's, then the rest; English). Each speaker keeps the
// same voice, pitch and pace for good, picked from their name: villagers by sex and age, the
// Sworn deep and slow, their lord deeper, sorcerers thin, the dead a low, dragging moan over the
// gibberish they mutter.
//
// One voice at a time (the browser has one queue): a line to you, or a fight's, cuts in over
// someone talking to themselves; ambient lines are dropped while a voice is busy rather than
// queued up behind it. Further off is quieter; out of earshot isn't spoken at all.
// Settings: localStorage bm.voices = '0' turns them off.
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
const EARSHOT = 28;          // metres

let voices = [];
const load = () => { try { voices = (synth?.getVoices() || []).filter((v) => /^en/i.test(v.lang)); } catch { voices = []; } };
if (synth) { load(); synth.addEventListener?.('voiceschanged', load); }

// (by the names the platforms give their voices)
const FEMALE = /zira|susan|hazel|libby|sonia|jenny|aria|natasha|samantha|karen|moira|tessa|fiona|victoria|serena|kate|female|woman|ava|allison|emma|clara|michelle|elizabeth|catherine|nicola|joanna|amy|salli|kimberly|ivy|kendra|olivia|maisie|ana\b|emily|sara/i;
const MALE = /david|mark|george|ryan|guy|daniel|alex|fred|male|thomas|james|oliver|arthur|eric|brian|christopher|roger|steffan|william|liam|matthew|joey|justin|russell|tom\b|aaron|gordon|rishi|lee\b/i;
const rank = (v) => (/(natural|neural|online)/i.test(v.name) ? 6 : /google/i.test(v.name) ? 4 : v.localService === false ? 3 : 1) + (/en[-_](gb|ie|au|nz)/i.test(v.lang) ? 1 : 0);

function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/** How a speaker sounds (kept for good): { voice, pitch, rate }. kind: 'villager' | 'knight' |
 * 'lord' | 'sorcerer' | 'undead' | 'beast'; sex 'f' | 'm'; age 'young' | 'old'. */
const cast = new Map();
export function voiceOf(key, { sex = 'm', kind = 'villager', age = null } = {}) {
  const k = kind + '|' + key;
  if (cast.has(k) && cast.get(k).voice !== undefined && (cast.get(k).voice || !voices.length)) return cast.get(k);
  const h = hash(k), r = (n) => ((h >>> n) & 1023) / 1023;
  const want = sex === 'f' ? FEMALE : MALE, other = sex === 'f' ? MALE : FEMALE;
  // the best voices of their sex (those that say neither are fine for anyone), then pick by name
  let pool = voices.filter((v) => want.test(v.name) || !other.test(v.name));
  if (!pool.length) pool = voices;
  const best = Math.max(0, ...pool.map(rank));
  const top = pool.filter((v) => rank(v) >= best - 2);
  const voice = top.length ? top[h % top.length] : null;
  let pitch = sex === 'f' ? 1.05 + r(3) * 0.3 : 0.85 + r(3) * 0.25, rate = 0.92 + r(13) * 0.16;
  if (age === 'young') { pitch += 0.15; rate += 0.05; } else if (age === 'old') { pitch -= 0.12; rate -= 0.1; }
  if (kind === 'knight') { pitch = 0.55 + r(5) * 0.25; rate = 0.86 + r(9) * 0.12; }
  if (kind === 'lord') { pitch = 0.45; rate = 0.82; }
  if (kind === 'sorcerer') { pitch = 1.1 + r(5) * 0.25; rate = 0.8 + r(9) * 0.1; }
  if (kind === 'undead') { pitch = 0.1 + r(5) * 0.35; rate = 0.55 + r(9) * 0.25; }
  if (kind === 'beast') { pitch = 1.6 + r(5) * 0.4; rate = 1.3 + r(9) * 0.3; }
  const v = { voice, pitch: Math.max(0, Math.min(2, pitch)), rate: Math.max(0.5, Math.min(1.6, rate)) };
  cast.set(k, v);
  return v;
}

export const voice = {
  listener: null,              // (the player: who is listening, for how loud)
  enabled: (() => { try { return localStorage.getItem('bm.voices') !== '0'; } catch { return true; } })(),
  current: null,               // { pri, end }
  set(on) { this.enabled = on; try { localStorage.setItem('bm.voices', on ? '1' : '0'); } catch { /* no storage */ } if (!on) synth?.cancel(); },

  /** `who` says `text` aloud. o: { key (who they are: their name), sex, kind, age, toYou, pri, pos } */
  say(who, text, o = {}) {
    if (!synth || !this.enabled || !text || document.hidden) return;
    // where they are, and how far from you
    const pos = o.pos || who?.pos || who?.root?.position;
    const l = this.listener?.pos;
    const d = pos && l ? Math.hypot(pos.x - l.x, pos.z - l.z, (pos.y ?? 0) - (l.y ?? 0)) : 0;
    if (d > EARSHOT) return;
    const pri = o.pri ?? (o.toYou ? 2 : o.kind && o.kind !== 'villager' ? 1 : 0);
    const now = performance.now();
    const busy = synth.speaking && this.current && now < this.current.end;
    if (busy && pri <= this.current.pri) return;          // (an ambient line doesn't queue up: it's let go)
    if (synth.speaking || synth.pending) synth.cancel();
    const { voice: v, pitch, rate } = voiceOf(o.key || who?.name || 'someone', o);
    const u = new SpeechSynthesisUtterance(text.replace(/[{}]/g, ''));
    if (v) u.voice = v;
    u.pitch = pitch; u.rate = rate;
    u.volume = Math.max(0.12, Math.min(1, 1 - d / EARSHOT)) * (o.kind === 'undead' ? 0.8 : 1);
    this.current = { pri, end: now + 1000 * (0.6 + text.length * 0.075 / rate) };
    u.onend = () => { if (this.current && performance.now() >= this.current.end - 400) this.current = null; };
    try { synth.speak(u); } catch { /* no voice today */ }
  },

  stop() { synth?.cancel(); this.current = null; },
};
