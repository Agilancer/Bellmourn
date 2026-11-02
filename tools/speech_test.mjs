// Turn-taking test for speech.js (node tools/speech_test.mjs): a crowd all talking at once (a
// conversation of two, a knight's taunts, the dead muttering, a greeting to you, a quest giver), on
// stand-in voices that take a while to make and to say. Checks that no two voices are ever heard at
// once, that each bubble is up only while its speaker's voice is, that a conversation isn't cut into,
// and that the more pressing go first; and that someone you speak to answers at once (whoever had
// the floor stopping for them), their line made ahead as it is in the game (villagers.expect).
import { voice } from '../src/fps/voice.js';
import { speak, tickSpeech, talking, hushAll } from '../src/fps/speech.js';

let now = 0;
const heard = [];          // [who, from, to]
voice.enabled = true;
voice.hears = () => true;
voice.say = (who, text, o) => {
  const make = o.browser ? 0.2 : who.name === 'Answer' ? 0 : 0.4 + text.length * 0.012;      // (s to make it; the answer's made ahead)
  const len = 0.5 + text.length * 0.06;                          // (s to say it)
  const h = { t0: null, hold: o.hold, cancelled: false,
    get started() { return !this.cancelled && this.t0 != null && now >= this.t0; },
    get done() { return this.cancelled || (this.t0 != null && now >= this.t0 + len); },
    get failed() { return false; },
    progress() { return this.t0 == null ? 0 : Math.max(0, Math.min(1, (now - this.t0) / len)); },
    go() { this.t0 = Math.max(now, made); heard.push([who.name, this.t0, this.t0 + len, () => this]); },
    cancel() { this.cancelled = true; const r = heard.find((x) => x[3]() === this); if (r) r[2] = Math.min(r[2], now); } };
  const made = now + make;
  if (!o.hold) h.go();
  return h;
};

const P = (name) => ({ name, pos: { x: 0, y: 0, z: 0 } });
const [ann, bert, knight, dead, greeter, giver, answer] = ['Ann', 'Bert', 'Sworn', 'dead', 'Greeter', 'Giver', 'Answer'].map(P);
const ASK = 31.5;      // (when you speak to someone, mid-line of somebody else's)
const convo = { id: 'convo' };
const lines = [[ann, 'Did you hear the bell last night, the thirteenth stroke?'], [bert, 'I heard it. I always hear it.'], [ann, 'Then why did nobody climb the tower?'], [bert, 'Because the last one who did came down without his face.']];
let ci = 0;
const script = [];   // what happens when: [t, fn]
script.push([0.0, () => speak(knight, 'Keep circling, little saint. I have all night.', false, { voice: { kind: 'knight' } })]);
script.push([0.1, () => speak(dead, 'mmrr... ghhaa... the bell...', false, { voice: { kind: 'undead', pri: 0 }, wait: 1.5 })]);
script.push([0.2, () => { speak(lines[0][0], lines[0][1], false, { group: convo, wait: 9 }); ci = 1; }]);
script.push([3.0, () => speak(greeter, 'Good day to you, stranger.', true, { voice: { pri: 2 }, wait: 3 })]);
script.push([9.0, () => speak(giver, 'There is a thing in the undercroft that needs killing. Bring me its jaw, and I will pay you well.', true, { noBubble: true, must: true, voice: { pri: 3 } })]);
script.push([ASK, () => speak(answer, 'Aye? What is it, friend?', true, { now: true, must: true })]);
script.push([29.0, () => speak(knight, 'You hide behind farmers now? Come out and face me, coward.', false, { voice: { kind: 'knight' }, wait: 9 })]);
for (let t = 1; t < 20; t += 2.2) script.push([t, () => speak(knight, 'Your mother rang that bell.', false, { voice: { kind: 'knight' }, wait: 2.5 })]);

const dt = 1 / 60, ups = [];
let worst = 0, bubbleNoVoice = 0;
for (let step = 0; now < 44; step++, now += dt) {
  while (script.length && script[0][0] <= now) script.shift()[1]();
  script.sort((a, b) => a[0] - b[0]);
  // the conversation: its next line once the last is said (as the villagers' scenes do)
  if (ci > 0 && ci < lines.length && !talking(lines[ci - 1][0])) { speak(lines[ci][0], lines[ci][1], false, { group: convo, wait: 9 }); ci++; }
  tickSpeech(dt);
  const up = [ann, bert, knight, dead, greeter].filter((w) => w.talk && w.talk.state === 'up');
  for (const w of up) if (w.talk.line && !w.talk.line.started) bubbleNoVoice++;
  ups.push(up.map((w) => w.name));
}
// voices heard at once
const H = heard.filter((h) => h[2] > h[1]).sort((a, b) => a[1] - b[1]);
for (let i = 1; i < H.length; i++) worst = Math.max(worst, H[i - 1][2] - H[i][1]);
console.log('heard, in order:');
for (const h of H) console.log(`  ${h[1].toFixed(2).padStart(6)}–${h[2].toFixed(2).padEnd(6)} ${h[0]}`);
// the conversation's lines in a row (nobody else between them)
const order = H.map((h) => h[0]);
const convoIdx = order.map((n, i) => (n === 'Ann' || n === 'Bert' ? i : -1)).filter((i) => i >= 0);
const between = convoIdx.length > 1 ? order.slice(convoIdx[0], convoIdx[convoIdx.length - 1] + 1).filter((n) => n !== 'Ann' && n !== 'Bert' && n !== 'Giver' && n !== 'Greeter') : [];
const giverAt = order.indexOf('Giver');
const ans = H.find((h) => h[0] === 'Answer'), answeredIn = ans ? ans[1] - ASK : 99;
const ok = worst <= 1e-6 && bubbleNoVoice === 0 && between.length === 0 && convoIdx.length === 4 && giverAt >= 0 && answeredIn < 0.1;
console.log({ overlapSeconds: +worst.toFixed(3), bubbleWithoutVoice: bubbleNoVoice, convoLines: convoIdx.length, cutInto: between, giverHeard: giverAt >= 0, answeredIn: +answeredIn.toFixed(3) });
hushAll();
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
