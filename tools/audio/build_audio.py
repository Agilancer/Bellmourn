# Bellmourn's music, ambience and sound effects: the user's packs converted into assets/audio/.
#
# Run with Blender (its `aud` module reads and writes MP3, OGG and WAV; no ffmpeg needed):
#   blender -b --factory-startup --python tools/audio/build_audio.py -- <src> [--only music,amb,sfx,songs]
# <src> is a folder holding the packs unpacked (any layout: files are found by name, anywhere under it):
#   Belmourne Title Screen Maybe - 04.Frozen_Hearts.ogg       the title screen's song
#   SONG FOR GAME INTRO - 4. Cursed Citadel (After ...).mp3   the opening's song
#   mp3 - USE FOR MUSIC.rar             -> mp3/Action 1.mp3 .. Light Ambience 5.mp3 (alkakrab, 2022)
#   Nature_Essentials_NOX_SOUND ... .rar -> Ambiance_*_Loop_*.wav
#   SFX - SWORDS AND WHAT NOT.rar       -> SFX/**/*.ogg
#
# Out (all MP3, which every browser plays, iPhones included):
#   music/   every track, loudness-matched by its kind (dark ambient is lifted, action brought down);
#            the title's song and the opening's are left at their own level (music.js sets it)
#   amb/     the nature loops at one loudness (ambience.js mixes them), fires mono
#   sfx/     the effects the game uses, mono, at the pack's own levels (they're made to match)
import aud, os, re, sys, glob, json

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC = ARGS[0] if ARGS else '.'
ONLY = set(ARGS[ARGS.index('--only') + 1].split(',')) if '--only' in ARGS else {'songs', 'music', 'amb', 'sfx'}
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'audio')

ALL = [p for p in glob.glob(os.path.join(SRC, '**', '*'), recursive=True) if os.path.isfile(p)]
def find(pattern):
    hits = [p for p in ALL if re.search(pattern, os.path.basename(p), re.I)]
    return sorted(hits)

def snake(name):
    return re.sub(r'[^a-z0-9]+', '_', os.path.splitext(name)[0].lower()).strip('_')

def level(s):
    """(rms, peak) of a sound, both linear."""
    import numpy as np
    d = s.data()
    m = d.mean(axis=1) if d.ndim > 1 else d
    return float(np.sqrt((m ** 2).mean()) + 1e-12), float(abs(d).max() + 1e-12)

def write(s, out, rate, ch, kbps):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    s = s.rechannel(ch)
    if s.specs[0] != rate: s = s.resample(rate, True)
    s.write(out, rate, aud.CHANNELS_MONO if ch == 1 else aud.CHANNELS_STEREO, aud.FORMAT_S16, aud.CONTAINER_MP3, aud.CODEC_MP3, kbps * 1000, 4096)
    return os.path.getsize(out)

def normalised(path, target_db, ceiling=0.95):
    """The sound, its gain set so its loudness is target_db (never louder than `ceiling` at its peak)."""
    s = aud.Sound(path).cache()
    rms, peak = level(s)
    g = min(10 ** (target_db / 20) / rms, ceiling / peak)
    return s.volume(g), g

report = {}
def note(k, src, size, **kw):
    report[k] = {'from': os.path.basename(src), 'kb': round(size / 1024), **kw}
    print(f'  {k:34} {size / 1024:7.0f} KB  {kw}', flush=True)

# ------------------------------------------------------------------ the two songs
if 'songs' in ONLY:
    print('songs')
    t = find(r'Frozen_Hearts')
    if t:
        s = aud.Sound(t[0])
        note('music/title_frozen_hearts.mp3', t[0], write(s, os.path.join(OUT, 'music', 'title_frozen_hearts.mp3'), 48000, 2, 192))
    i = find(r'Cursed Citadel.*\.mp3$')
    if i:   # (already an MP3: kept as it is)
        dst = os.path.join(OUT, 'music', 'intro_cursed_citadel.mp3')
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(i[0], 'rb') as a, open(dst, 'wb') as b: b.write(a.read())
        note('music/intro_cursed_citadel.mp3', i[0], os.path.getsize(dst))

# ------------------------------------------------------------------ the music
# loudness (dBFS RMS) by kind: the calm ones sit under the world, action comes up a little
MUSIC = [(r'^Light Ambience (\d+)\.mp3$', 'light', -26, 112), (r'^Ambient (\d+)\.mp3$', 'ambient', -26, 112),
         (r'^Dark Ambient (\d+)\.mp3$', 'dark', -28, 112), (r'^Action (\d+)\.mp3$', 'action', -23, 128), (r'^Fx (\d+)\.mp3$', 'fx', -25, 128)]
if 'music' in ONLY:
    print('music')
    for pat, kind, db, kbps in MUSIC:
        for p in find(pat):
            n = re.search(pat, os.path.basename(p), re.I).group(1)
            s, g = normalised(p, db)
            out = f'music/{kind}_{n}.mp3'
            note(out, p, write(s, os.path.join(OUT, out), 44100, 2, kbps), gain=round(g, 2))

# ------------------------------------------------------------------ the nature loops (and two of the effects pack's)
AMB = {
    'cave_dark': r'Cave_Dark_Loop', 'cave_deep': r'Cave_Deep_Loop', 'cave_drips': r'Cave_Drips_Loop', 'cicadas': r'Cicadas_Loop',
    'fire_big': r'Fire_Big_Loop', 'fire_medium': r'Firecamp_Medium_Loop', 'fire_small': r'Firecamp_Small_Loop',
    'birds': r'Forest_Birds_Loop', 'night': r'Ambiance_Night_Loop', 'rain_calm': r'Rain_Calm_Loop', 'rain_strong': r'Rain_Strong_Loop',
    'river': r'River_Moderate_Loop', 'sea': r'Ambiance_Sea_Loop', 'stream': r'Stream_Calm_Loop',
    'waterfall_calm': r'Waterfall_Calm_Loop', 'waterfall_strong': r'Waterfall_Strong_Loop', 'wind_calm': r'Wind_Calm_Loop', 'wind_forest': r'Wind_Forest_Loop',
    # from the effects pack: a babbling stream (cut to 30 s) and a torch's crackle
    'grotto_stream': r'^River Stream Loop\.ogg$', 'torch': r'^Torch Loop\.ogg$',
}
MONO = {'fire_big', 'fire_medium', 'fire_small', 'grotto_stream', 'torch'}   # (heard from a place: the panner gives them their side)
if 'amb' in ONLY:
    print('ambience')
    for k, pat in AMB.items():
        hits = find(pat)
        if not hits: print('  (missing)', k); continue
        s, g = normalised(hits[0], -30)
        if k == 'grotto_stream': s = s.limit(0, 30)
        mono = k in MONO
        out = f'amb/{k}.mp3'
        note(out, hits[0], write(s, os.path.join(OUT, out), 44100 if hits[0].endswith('.ogg') else 48000, 1 if mono else 2, 64 if mono else 112), gain=round(g, 2))

# ------------------------------------------------------------------ the effects the game uses
SFX = [r'^sword_(attack|blocked|impact_hit|parry|sheath|unsheath)_\d$', r'^bow_impact_hit_\d$', r'^(chop|mine)_\d$',
       r'^(chest_open|chest_close|door_open|door_close)_\d$', r'^lock_unlock$',
       r'^(dirt|stone|water|wood)_(chain_)?(walk|run)_\d$', r'^(dirt|stone|water|wood)_(chain_)?(jump|land)$',
       r'^(fireball|firebuff|firespray|waterspray|wave_attack|rock_wall|spell_impact)_\d$', r'^ice_(barrage|freeze|throw|wall)_\d$',
       r'^rock_meteor_(swarm|throw)_\d$', r'^light_torch_\d$', r'^torch_attack_strike_\d$']
if 'sfx' in ONLY:
    print('effects')
    n = 0
    for p in find(r'\.ogg$'):
        k = snake(os.path.basename(p))
        if not any(re.match(r, k) for r in SFX): continue
        out = f'sfx/{k}.mp3'
        note(out, p, write(aud.Sound(p), os.path.join(OUT, out), 44100, 1, 96))
        n += 1
    print(f'  {n} effects')

with open(os.path.join(OUT, 'build_report.json'), 'w') as f:
    old = {}
    try: old = json.load(open(os.path.join(OUT, 'build_report.json')))
    except Exception: pass
    json.dump({**old, **report}, f, indent=1, sort_keys=True)
print('done:', len(report), 'files')
