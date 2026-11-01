// Speech: what anyone in Bellmourn says (a villager, a knight of the Sworn, one of the dead, a quest
// giver), shown in a bubble over their head and spoken aloud (voice.js). A line too long for one
// bubble is paged: the bubble shows as much as reads comfortably, then the rest in the next.
//
// People take turns. Everyone within earshot of you shares one floor: one speaker at a time, the
// rest waiting their turn (the more pressing first: a quest giver, then whoever is talking to you,
// then the enemy, then the town's chatter), each one's bubble coming up only when their turn does
// and their voice begins. The bubble's pages follow the voice as it goes. A short quiet comes
// between one speaker and the next; a conversation keeps the floor between its own lines, so nobody
// cuts in. A line kept waiting too long is let go (a passing remark), or said without its voice
// (a conversation's, a line to you). Speakers too far off to be heard talk among themselves freely.
//
// Every speaker keeps `talk` = { text (the page shown), pages, pi, t (above 0 while they're
// talking), age, toYou, state, hidden (out of earshot: no bubble) } while their bubble is up (state 'linger' a moment after the last
// word), and `pending` while their line waits its turn: talking(who) is either, but not the
// lingering. Scenes wait on talking() before their next line (villagers.js, chatter.js).
import { voice } from './voice.js';

const PAGE = 118;          // characters a page holds (four lines of the bubble, about)
const GAP = 0.32;          // s of quiet between one speaker and the next
const LINGER = 0.6;        // s a bubble stays up after its last word
const HOLD = 1.6;          // s a conversation keeps the floor between its lines
const QUEUE = 8;           // lines waiting at most (a passing remark beyond it is let go)
const AGE = 2.5;           // s of waiting that count as one step more pressing
/** How long a line waits for its turn, by how pressing it is (0 chatter, 1 the enemy, 2 to you, 3 a quest). */
const WAIT = [3, 3, 14, 30];
/** How long, once its turn has come, a line waits for its voice to begin (then: said without it). */
const CUE = [3, 3, 6, 6];

/** Split a line into bubble-sized pages, at sentence breaks where it can, else at words. */
export function paginate(text, max = PAGE) {
  text = String(text).trim();
  if (text.length <= max) return [text];
  const pages = [];
  let rest = text;
  while (rest.length > max) {
    // the last sentence end (or, failing that, comma, then space) inside the page
    let cut = -1;
    for (const re of [/[.!?…]["'”’)]?\s/g, /[,;:—–-]\s/g, /\s/g]) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(rest)) && m.index + m[0].length <= max) cut = m.index + m[0].length;
      if (cut > max * 0.45) break;
      cut = -1;
    }
    if (cut < 0) cut = max;
    pages.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pages.push(rest);
  return pages;
}

/** How long a page stays up when it's said without a voice: long enough to read it, at a calm pace. */
export const readTime = (text) => Math.max(2.6, 1.3 + String(text).length * 0.068);

// ------------------------------------------------------------------ the floor
const queue = [];          // lines waiting their turn
const live = new Set();    // lines with a bubble up (or a voice going)
let floor = null;          // the line that has the floor
let quiet = 0;             // s of quiet left before the next speaker
let hold = null;           // { group, t }: a conversation's hold on the floor between its lines

/** Whether `who` is speaking or waiting to (a bubble lingering after the last word isn't). */
export const talking = (who) => !!(who && (who.pending || (who.talk && who.talk.state !== 'linger')));

/** Who has the floor and who's waiting (for a test). */
export const speaking = () => ({ floor: floor ? floor.who.name || floor.who.id || '?' : null, state: floor?.state || null, waiting: queue.map((L) => L.who.name || L.who.id || '?'), live: live.size });

/** `who` says `text` (to you, if toYou: a warmer bubble, and they're heard before the town's chatter).
 * opts: voice (how they sound, voice.js: { key, sex, kind, age, pos, pri }); quiet (no voice);
 * noBubble (the voice alone: a quest giver, whose words are in the quest's panel); group (a
 * conversation: its lines keep the floor between them); must (said whatever: kept waiting too long,
 * or its voice not coming, it's said without the voice; else it's let go); wait (s it may wait for
 * its turn); cut (anything of theirs still to say is let go first). Returns 0: wait on
 * talking(who) for it to end. */
export function speak(who, text, toYou = false, opts = {}) {
  if (!who || !text) return 0;
  hush(who, !opts.cut);                // (one line waiting each: a new one takes its place)
  const pages = paginate(text);
  const vo = { toYou, ...opts.voice };
  const pri = vo.pri ?? (toYou ? 2 : vo.kind && vo.kind !== 'villager' ? 1 : 0);
  const L = {
    who, full: String(text), pages, pi: 0, text: pages[0], t: 1, age: 0, toYou, pri, group: opts.group || null,
    noBubble: !!opts.noBubble, must: !!opts.must, wait: opts.wait ?? (opts.must ? 30 : WAIT[pri] ?? 3), waited: 0, state: 'queued', cue: 0, line: null,
    left: 0, total: 0, cap: pages.reduce((a, p) => a + readTime(p), 0) * 2 + 14,
  };
  if (!voice.hears(vo.pos || who.pos || who.root?.position, pri)) {   // out of earshot: no floor, no voice, no bubble (they talk on, unheard)
    L.hidden = true;
    start(L, null);
    return 0;
  }
  // a full queue: a passing remark is let go
  if (queue.length >= QUEUE && pri < 2 && !L.group && !L.must) return 0;
  L.vo = vo;
  if (!opts.quiet && voice.enabled) L.line = voice.say(who, L.full, { ...vo, pri, hold: true });   // (made now, played on its turn)
  who.pending = L;
  queue.push(L);
  // a quest giver doesn't wait on the town's chatter: it stops for them
  if (pri >= 3 && floor && floor.pri < 2) end(floor, true);
  return 0;
}

/** Stop `who` speaking (and drop whatever of theirs is waiting). keepCurrent: only what's waiting. */
export function hush(who, keepCurrent = false) {
  if (!who) return;
  const P = who.pending;
  if (P && P !== floor) { P.line?.cancel(); const i = queue.indexOf(P); if (i >= 0) queue.splice(i, 1); who.pending = null; }
  if (keepCurrent) return;
  for (const L of [...live]) if (L.who === who) end(L, true);
  if (floor?.who === who) end(floor, true);
}

/** Everyone stops (a new game, a save loaded). */
export function hushAll() {
  for (const L of queue) { L.line?.cancel(); if (L.who.pending === L) L.who.pending = null; }
  queue.length = 0;
  for (const L of [...live]) end(L, true);
  if (floor) end(floor, true);
  floor = null; hold = null; quiet = 0;
}

/** Each frame: the floor passed on, and every bubble's pages run on. */
export function tickSpeech(dt) {
  if (hold && (hold.t -= dt) <= 0) hold = null;
  // lines kept waiting too long
  for (let i = queue.length - 1; i >= 0; i--) {
    const L = queue[i];
    if ((L.waited += dt) < L.wait) continue;
    queue.splice(i, 1);
    L.line?.cancel();
    if (L.who.pending === L) L.who.pending = null;
    // a passing remark goes unsaid (the scene it's in goes on); a line that must be said is said without its voice
    if (L.must) start(L, null);
  }
  // the next speaker
  if (!floor && (quiet -= dt) <= 0 && queue.length) {
    // (the more pressing first, but the longer a line has waited the more pressing it gets: the
    // enemy's taunts can't keep the town quiet for ever)
    const score = (L) => L.pri + L.waited / AGE;
    let best = -1;
    for (let i = 0; i < queue.length; i++) {
      const L = queue[i];
      if (hold && L.group !== hold.group && L.pri < 2) continue;    // (a conversation's turn: only its own, or someone talking to you)
      if (best < 0 || score(L) > score(queue[best])) best = i;
    }
    if (best >= 0) {
      const L = (floor = queue.splice(best, 1)[0]);
      L.state = 'cue'; L.cue = 0;      // (still `pending`, till its voice begins)
      if (L.group === hold?.group) hold = null;
      L.line?.go();
    }
  }
  // the speaker with the floor: its voice begun yet? (a neural voice that doesn't come in time: the
  // browser's own voice says it instead, at once)
  if (floor && floor.state === 'cue') {
    const L = floor;
    L.cue += dt;
    if (L.line && L.line.started) start(L, L.line);
    else if (L.line && !L.fell && (L.line.failed || L.cue > (CUE[L.pri] ?? 3)) && voice.enabled) {
      L.line.cancel();
      L.fell = true; L.cue = (CUE[L.pri] ?? 3) - 1.6;
      L.line = voice.say(L.who, L.full, { ...L.vo, pri: L.pri, browser: true });
    } else if (!L.line || L.line.failed || L.cue > (CUE[L.pri] ?? 3)) {
      const had = !!L.line;
      L.line?.cancel();
      if (had && !L.must && !L.group && !L.toYou) {   // (a passing remark whose voice didn't come: let go)
        if (L.who.pending === L) L.who.pending = null;
        floor = null; quiet = 0.1;
      } else start(L, null);
    }
  }
  for (const L of [...live]) run(L, dt);
}

/** A line's bubble goes up (with its voice, or without). */
function start(L, line) {
  if (L.who.pending === L) L.who.pending = null;
  L.line = line;
  L.state = 'up'; L.age = 0; L.total = 0; L.pi = 0; L.text = L.pages[0]; L.t = 1;
  L.left = readTime(L.pages[0]);
  for (const o of [...live]) if (o.who === L.who && o !== L) end(o, o.state !== 'linger');   // (anything else of theirs still up)
  if (!L.noBubble) L.who.talk = L;
  live.add(L);
}

/** A line's bubble runs on: its pages by where its voice has got to, or by the time to read them. */
function run(L, dt) {
  L.age += dt; L.total += dt;
  if (L.state === 'linger') {
    L.t = Math.max(0, (L.left -= dt));
    if (L.left <= 0) end(L);
    return;
  }
  if (L.total > L.cap) { end(L, true); return; }
  if (L.line) {
    const f = L.line.progress(), at = f * L.full.length;
    let i = 0, n = 0;
    while (i < L.pages.length - 1 && at > n + L.pages[i].length + 0.5) n += L.pages[i++].length + 1;
    if (i > L.pi) { L.pi = i; L.text = L.pages[i]; L.age = 0; }
    if (!L.line.done) return;
    if (L.pi < L.pages.length - 1 && f < 0.9) { L.line = null; L.left = readTime(L.text); return; }   // (its voice gave out partway: the rest is read)
    over(L);
    return;
  }
  L.t = Math.max(0.2, L.left);
  if ((L.left -= dt) > 0) return;
  if (L.pi + 1 < L.pages.length) { L.pi++; L.text = L.pages[L.pi]; L.left = readTime(L.text); L.age = 0; return; }
  over(L);
}

/** Its last word said: the floor passes on (a conversation keeps it a moment), the bubble lingers. */
function over(L) {
  L.state = 'linger'; L.left = L.noBubble ? 0 : LINGER; L.t = L.left;
  if (floor === L) {
    floor = null; quiet = GAP;
    if (L.group) hold = { group: L.group, t: HOLD };
  }
}

/** A line ends: its bubble comes down; cut: its voice stops too. */
function end(L, cut = false) {
  live.delete(L);
  if (cut) L.line?.cancel();
  if (L.who.talk === L) L.who.talk = null;
  if (L.who.pending === L) L.who.pending = null;
  const i = queue.indexOf(L);
  if (i >= 0) queue.splice(i, 1);
  if (floor === L) { floor = null; quiet = cut ? 0.15 : GAP; }
}

/** Kept for the callers that ran a speaker's words down themselves: tickSpeech() runs them all now. */
export function tickTalk() {}
