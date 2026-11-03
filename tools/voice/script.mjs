// Every line the game has recorded voices for, read from the game's own data, written out as JSON
// for the recorder (record.py): [{ voice, text, key, how }], in the order they're first heard.
//   node tools/voice/script.mjs lines.json
// voice: who says it (a speaker's name; the recordings live under that name); key: voiceKey(text),
// the file the game will look for; how: a delivery note for the voice model, where the words alone
// don't carry it.
import { writeFileSync } from 'node:fs';
import { CALLER, gatherLines } from '../../src/fps/lines/opening.js';
import { voiceKey } from '../../src/fps/lines/voicekey.js';

const HOW = {
  "Hoy! You, down there! Can you hear me?": 'Calling out loudly down into a deep crater, urgent.',
  "He's moving! Saints, he's moving!": 'Shouting back over her shoulder to the people behind her, amazed.',
  "Don't go any nearer the edge, girl. It's still smoking.": 'Calling out to her from a distance, worried.',
  "Up here! Follow my voice.": 'Calling down into a crater.',
  "There! He's climbing out!": 'An excited shout.',
};
const lines = [];
const seen = new Set();
for (const l of gatherLines()) {
  const voice = l.name || CALLER, k = voice + '|' + l.text;
  if (seen.has(k)) continue;
  seen.add(k);
  lines.push({ voice, text: l.text, key: voiceKey(l.text), how: HOW[l.text] || '' });
}
writeFileSync(process.argv[2] || 'lines.json', JSON.stringify(lines, null, 1));
console.log(lines.length, 'lines');
