"""Record the game's lines with Qwen3-TTS VoiceDesign, each in its speaker's voice, to MP3.

The lines come from the game's own data (tools/voice/script.mjs writes them out with their voice,
their key and a delivery note); each speaker's voice is a description in words (voices.json, with a
fixed seed per speaker so a voice stays itself from line to line); invented names are respelled for
the model (say.json; the text on screen keeps the real spelling). A take is cleaned (silence trimmed,
long pauses shortened, one loudness) and saved as <out>/<voice>/<key>.mp3, mono, the path the game
fetches (src/fps/voice.js). Lines already recorded are skipped, so a run can stop and start again.

Gentle on the machine (gentle.py: 2 CPU threads at idle priority), on the CPU by default, one line at
a time with a rest after each: slow, but it never gets in the way. docs/VOICES.md has the whole of it.

  node tools/voice/script.mjs lines.json
  python tools/voice/record.py lines.json --out ../Bellmourn2/voice [--only Wren,Hesk] [--redo redo.txt]
"""
import argparse, json, math, os, re, sys, time, zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gentle  # noqa: E402  (before torch: the thread caps)
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import torch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign'
FRAMES = 12.5         # codec frames a second
LOUD = 0.1            # RMS of the speech
PAUSE = 0.7           # s: no pause inside a line longer than this
REST = 2.0            # s of rest after each line


def respell(text, say):
    for name, sound in say.items():
        text = re.sub(r'\b' + re.escape(name) + r'\b', sound, text)
    return text


def clean(y, sr):
    """The take's lead and tail silence trimmed, long pauses shortened, brought to one loudness."""
    win = max(1, int(sr * 0.02))
    n = len(y) // win
    if n < 4:
        return y
    e = np.abs(y[:n * win]).reshape(n, win).max(1)
    loud = e > max(0.004, e.max() * 0.03)
    idx = np.flatnonzero(loud)
    if not len(idx):
        return y
    a, b = max(0, idx[0] - 2), min(n, idx[-1] + 5)
    keep, i, lim = [], a, int(PAUSE / 0.02)
    while i < b:
        if loud[i]:
            keep.append(i); i += 1; continue
        j = i
        while j < b and not loud[j]:
            j += 1
        keep += list(range(i, j)) if j - i <= lim else list(range(i, i + lim // 2)) + list(range(j - lim // 2, j))
        i = j
    out = np.concatenate([y[k * win:(k + 1) * win] for k in keep]).astype(np.float32)
    fade = min(len(out), int(sr * 0.01))
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    act = out[np.abs(out) > 0.01]
    rms = float(np.sqrt((act ** 2).mean())) if len(act) else 0
    pk = float(np.abs(out).max()) or 1
    return out * min(LOUD / rms if rms else 1, 0.95 / pk)


def save(path, y, sr):
    tmp = path + '.tmp.mp3'
    sf.write(tmp, y, sr, format='MP3', subtype='MPEG_LAYER_III', compression_level=0.6)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('lines')
    ap.add_argument('--out', required=True)
    ap.add_argument('--voices', default=os.path.join(HERE, 'voices.json'))
    ap.add_argument('--say', default=os.path.join(HERE, 'say.json'))
    ap.add_argument('--only', default='')
    ap.add_argument('--redo', default='', help='a file of voice/key lines to record again')
    ap.add_argument('--device', default='cpu', help='cpu (gentlest) or cuda:0')
    ap.add_argument('--take', type=int, default=0, help='another take of the lines redone: 1, 2... (each a different seed)')
    a = ap.parse_args()
    lines = json.load(open(a.lines, encoding='utf-8'))
    voices = json.load(open(a.voices, encoding='utf-8'))
    say = json.load(open(a.say, encoding='utf-8')) if os.path.exists(a.say) else {}
    only = set(filter(None, a.only.split(',')))
    redo = set(l.strip() for l in open(a.redo, encoding='utf-8')) if a.redo else set()
    todo = []
    for ln in lines:
        if only and ln['voice'] not in only:
            continue
        if ln['voice'] not in voices:
            print('no voice for', ln['voice'], '-', ln['text'][:50]); continue
        path = os.path.join(a.out, ln['voice'], ln['key'] + '.mp3')
        if os.path.exists(path) and f"{ln['voice']}/{ln['key']}" not in redo:
            continue
        todo.append((ln, path))
    print(f'{len(todo)} lines to record of {len(lines)}', flush=True)
    if not todo:
        return
    gentle.torch_threads(torch)
    from qwen_tts import Qwen3TTSModel
    dtype = torch.float32 if a.device == 'cpu' else torch.bfloat16
    model = Qwen3TTSModel.from_pretrained(MODEL, device_map=a.device, dtype=dtype)
    t0, said = time.time(), 0.0
    for n, (ln, path) in enumerate(todo, 1):
        voice = ln['voice']
        text = respell(ln['text'], say)
        instruct = (voices[voice] + ' ' + (ln.get('how') or '')).strip()
        redone = f"{voice}/{ln['key']}" in redo
        torch.manual_seed(zlib.crc32(voice.encode()) + (a.take if redone else 0))     # (one seed per speaker: the voice stays theirs; a redo's take another)
        cap = int(math.ceil(FRAMES * (len(text) * 0.11 + 3)))
        wavs, sr = model.generate_voice_design(text=text, instruct=instruct, language='English', max_new_tokens=cap)
        y = clean(np.asarray(wavs[0], dtype=np.float32), sr)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        save(path, y, sr)
        said += len(y) / sr
        el = time.time() - t0
        print(f'{n}/{len(todo)} {voice}: {len(y) / sr:.1f} s | {said:.0f} s of speech in {el / 60:.1f} min | {ln["text"][:50]}', flush=True)
        time.sleep(REST)


if __name__ == '__main__':
    main()
