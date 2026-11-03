// Write src/fps/lines/voiced.js, the list of what each speaker has been recorded saying, from the
// recordings themselves (the Bellmourn2 checkout's voice/<speaker>/<key>.mp3), and check the game's
// lines against it.
//   node tools/voice/manifest.mjs ../Bellmourn2/voice [lines.json]
// With lines.json (from script.mjs), every line in it must have its recording, or this exits 1 and
// says which are missing (record them: docs/VOICES.md).
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] || '../Bellmourn2/voice');
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../src/fps/lines/voiced.js');
const have = {};
let n = 0, bytes = 0;
for (const v of readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory()).sort()) {
  const keys = readdirSync(join(root, v)).filter((f) => f.endsWith('.mp3') && !f.includes('.tmp')).map((f) => f.slice(0, -4)).sort();
  if (!keys.length) continue;
  have[v] = keys.join(' ');
  n += keys.length;
  for (const k of keys) bytes += statSync(join(root, v, k + '.mp3')).size;
}
const body = [
  '// Which lines each speaker has been recorded saying (tools/voice/manifest.mjs writes this from the',
  '// recordings themselves; docs/VOICES.md). base: where the recordings are; have: each voice\'s lines,',
  '// by key (lines/voicekey.js), space-separated.',
  'export const VOICED = {',
  "  base: 'https://agilancer.github.io/Bellmourn2/voice/',",
  '  have: {',
  ...Object.entries(have).map(([v, k]) => `    ${/^[A-Za-z_]\w*$/.test(v) ? v : JSON.stringify(v)}: '${k}',`),
  '  },',
  '};',
  '',
].join('\n');
writeFileSync(out, body);
console.log(`${n} recordings (${(bytes / 1048576).toFixed(1)} MB) for ${Object.keys(have).length} voices -> src/fps/lines/voiced.js`);
if (process.argv[3] && existsSync(process.argv[3])) {
  const lines = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  const missing = lines.filter((l) => !(have[l.voice] || '').split(' ').includes(l.key));
  for (const l of missing) console.log(`missing: ${l.voice}: ${l.text}`);
  console.log(missing.length ? `${missing.length} of ${lines.length} lines have no recording` : `all ${lines.length} lines are recorded`);
  process.exit(missing.length ? 1 : 0);
}
