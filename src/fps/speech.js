// Speech: what anyone in Bellmourn says (a villager, a knight of the Sworn, one of the dead), shown in
// a bubble over their head and spoken aloud (voice.js). A line too long for one bubble is paged:
// the bubble shows as much as reads comfortably, then the rest in the next, each up long enough
// to be read. Every speaker keeps `talk` = { text (the page shown), pages, pi, t (left on this
// page), age, toYou } while they speak; tickTalk() runs it down.
import { voice } from './voice.js';

const PAGE = 118;          // characters a page holds (four lines of the bubble, about)

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

/** How long a page stays up: long enough to read it, at a calm pace. */
export const readTime = (text) => Math.max(2.6, 1.3 + String(text).length * 0.068);

/** `who` says `text` (to you, if toYou: a warmer bubble, and it comes first in the voices).
 * opts.voice: how they sound (voice.js: { key, sex, kind }); opts.quiet: bubble only. Returns how
 * long it all takes. */
export function speak(who, text, toYou = false, opts = {}) {
  const pages = paginate(text);
  who.talk = { text: pages[0], pages, pi: 0, t: readTime(pages[0]), age: 0, toYou };
  if (!opts.quiet) voice.say(who, String(text), { toYou, ...opts.voice });
  return pages.reduce((a, p) => a + readTime(p) + 0.15, 0);
}

/** Run a speaker's words down by dt: on to the next page, or done. */
export function tickTalk(who, dt) {
  const t = who.talk;
  if (!t) return;
  t.t -= dt; t.age += dt;
  if (t.t > 0) return;
  if (t.pages && t.pi + 1 < t.pages.length) { t.pi++; t.text = t.pages[t.pi]; t.t = readTime(t.text); t.age = 0; }
  else who.talk = null;
}
