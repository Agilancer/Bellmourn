# Voices: how Bellmourn's dialogue is voiced, and how to add more

Every word a character says aloud in Bellmourn is a **recording**, made ahead of time with
[Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) (the 1.7B VoiceDesign model, Apache-2.0) in that
speaker's own voice. Nothing is synthesised in the player's browser: the old Kokoro voices and the
browser's built-in speech are gone. A line nobody has recorded yet is shown in its speech bubble and
isn't said aloud.

> **The rule for new dialogue.** Any line added to the game, for any speaker, is recorded the same
> way before it's merged: written into a plain data module the recorder can read, given a voice
> described in words, recorded with `tools/voice/record.py`, uploaded to the Bellmourn2 repository,
> and listed in `src/fps/lines/voiced.js` by `tools/voice/manifest.mjs`. Don't bring back synthesised
> voices of any kind.

## What's recorded so far

The crater after the green star: everything the village says there, up to Sister Odile sending you
to her for the first quest (`src/fps/lines/opening.js`, 46 lines, seven speakers: Wren, Elsie,
Tobias, Osric, Garrow, Hesk and Odile). Everything else is still bubbles only.

## How the game finds a recording

- `src/fps/voice.js` plays every line. For a line, it takes its speaker's **voice id** (a villager's
  name, as in `villagers.js` ROSTER) and the line's **key**, `voiceKey(text)` from
  `src/fps/lines/voicekey.js` (a hash of the exact words), and fetches
  `https://agilancer.github.io/Bellmourn2/voice/<voice>/<key>.mp3`.
- `src/fps/lines/voiced.js` lists which keys each voice has. A line missing from it is never
  fetched: it's shown in its bubble, silent.
- Change one letter of a line and its key changes: the old recording no longer matches, and the line
  needs recording again. That's intended: the voice always says exactly what the bubble shows.
- Recordings are fetched a few at a time as they're wanted (the crater's lines while the game loads)
  and kept decoded. They play through the same 3D chain as before: placed at the speaker's mouth,
  softer with distance, with each kind's effect (the Sworn's helm, the dead's crypt: `voicefx.js`).
- To test recordings before they're on Bellmourn2, serve a local copy and point the game at it:
  `localStorage.setItem('bm.voicebase', 'http://127.0.0.1:8200/voice/')`.

## Recording

Everything lives in `tools/voice/`:

| File | What |
|---|---|
| `script.mjs` | reads the lines from the game's own data and writes `lines.json`: `[{ voice, text, key, how }]` (`how`: an optional delivery note, e.g. "Calling out loudly down into a deep crater") |
| `voices.json` | each speaker's voice, described in words: sex, age, timbre, accent, pace, temperament. One fixed description per speaker, so a voice stays itself from line to line. A new speaker's comes from their VOICE paragraph in [STORY.md](STORY.md), the story bible (who everyone is and how they talk) |
| `say.json` | respellings for invented names, fed to the model only (the bubble keeps the real spelling): Velscour, Bellmourn, Tessariel, Odile, Isolde... |
| `record.py` | records every line in `lines.json` that isn't recorded yet, as `<out>/<voice>/<key>.mp3` |
| `gentle.py` | keeps recording gentle on the PC: 2 CPU threads at idle priority |
| `manifest.mjs` | writes `src/fps/lines/voiced.js` from the recordings, and checks every line has one |

### Setup (once)

```
py -3.12 -m venv C:\Users\agila\tts\qwen
C:\Users\agila\tts\qwen\Scripts\python -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
C:\Users\agila\tts\qwen\Scripts\python -m pip install qwen-tts soundfile hf_xet
```

The model (about 4.5 GB) downloads to the Hugging Face cache on the first run. Clone the voices'
repository beside the game: `gh repo clone Agilancer/Bellmourn2 ../Bellmourn2`.

### Adding lines

1. Write the lines into a plain data module under `src/fps/lines/` (no imports of three.js or the
   DOM), and have the game read them from there. Add the module to `script.mjs`.
2. A new speaker gets a description in `voices.json` (look at the others: a sentence or three on
   sex, age, timbre, a regional English accent, pace and temperament). New invented names go in
   `say.json`.
3. Write the list and record what's new (lines already recorded are skipped, so this can stop and
   start again at any point):
   ```
   node tools/voice/script.mjs C:\Users\agila\tts\lines.json
   C:\Users\agila\tts\qwen\Scripts\python tools/voice/record.py C:\Users\agila\tts\lines.json --out ../Bellmourn2/voice
   ```
   On the CPU at idle priority it takes about eight times as long as the speech it makes (the
   crater's three minutes of speech took about twenty-five minutes) and the PC stays usable. Don't
   run it on the GPU or with more threads: it has crashed the PC before.
4. Listen to what's new. A bad take: delete its MP3 and run `record.py` again, or pass `--redo` a
   file of `voice/key` lines.
5. Upload and list them:
   ```
   cd ../Bellmourn2 && git add voice && git commit -m "Voices: ..." && git push
   node tools/voice/manifest.mjs ../Bellmourn2/voice C:\Users\agila\tts\lines.json
   ```
   `manifest.mjs` exits with an error if any line in the list has no recording. Commit the new
   `voiced.js` with the lines.

## Writing for a voice

- Write lines to be said: no stage directions, brackets or asterisks; numbers as words; no
  placeholders like `{a}` or a count filled in at run time (a recording can't change). If a line
  needs a name, write the name.
- Keep them short. The model reads exactly what it's given, so every word costs time to hear.
