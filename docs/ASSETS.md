# Where the assets live

GitHub Pages publishes at most 1 GB a site, and the whole Bellmourn repo is its site (Pages builds
`main`, no workflow). By November 2026 the published site was 925 MiB and the tracked files 1,058
MiB, so the biggest folder moved out:

| Folder | What | Lives in | Published at |
|---|---|---|---|
| `templates/models/` | every model and its textures (1,415 files, 682.5 MiB) | [Agilancer/Bellmourn2](https://github.com/Agilancer/Bellmourn2), same path | https://agilancer.github.io/Bellmourn2/templates/models/ |
| `voice/` | the recorded voices ([VOICES.md](VOICES.md)) | Agilancer/Bellmourn2 | https://agilancer.github.io/Bellmourn2/voice/ |

Everything else (code, `assets/`, `art/`, `templates/packs`, ...) stays here. `art/_texlib` and other
folders whose names start with `_` are tracked but never published (Pages runs Jekyll here, which
skips them).

Bellmourn2's site is on the same origin as the game's (`agilancer.github.io`), so the game fetches
from it with no CORS and the same caching. Bellmourn2 has a `.nojekyll`, so every file publishes
as it is.

## How the game finds them

`src/fps/store.js` exports `asset(path)`: a repo path in a moved folder
(`'templates/models/kit/kit.json'`) becomes its Bellmourn2 URL; any other path or URL comes back
unchanged. It also installs itself as three's default loading manager's URL modifier, so every
`GLTFLoader`, `TextureLoader`, `FileLoader` and `ImageBitmapLoader` load is routed even if a call
forgets it. Plain `fetch()` and `new Image()` are not: wrap their paths in `asset()`.

```js
import { asset } from './store.js';
const ROOT = asset('templates/models/props/');           // a root: everything under it follows
const kit = await (await fetch(asset('templates/models/kit/kit.json'))).json();
```

Where Bellmourn2 is:

- On `*.github.io`: always `/Bellmourn2/` on the same origin, so the game at
  `https://agilancer.github.io/Bellmourn/` reads `https://agilancer.github.io/Bellmourn2/...`.
- Anywhere else (a local server): `/Bellmourn2/` on that server if it answers (one HEAD request for
  `templates/models/manifest.json` as the game starts); if not, the Pages copy, with a console
  warning.
- `?store=<url>` overrides both, e.g. `?store=https://agilancer.github.io/Bellmourn2/` to try a
  local checkout of the game against the published models.

`MOVED` in `store.js` (and in `tools/assetstore.py`) lists the moved folders. Moving another one
means adding it to both and doing the steps below for it.

## Running locally

Clone Bellmourn2 beside Bellmourn (`work/Bellmourn` and `work/Bellmourn2`; worktrees named
`work/Bellmourn-*` and `.claude/worktrees/*` find the same one):

```
git clone https://github.com/Agilancer/Bellmourn2.git
```

`tools/serve.py` (every `.claude/launch.json` entry, `knight-player.bat`, `moves-player.bat`) serves
that checkout at `/Bellmourn2/`, the way Pages lays the two out. The BELLMOURN2 environment variable
names another folder.

A test harness with its own static server serves it the same way; for a Node server:

```js
const STORE = path.resolve(root, '..', 'Bellmourn2');   // the models (docs/ASSETS.md)
const f = p.startsWith('/Bellmourn2/') ? path.join(STORE, p.slice('/Bellmourn2/'.length))
  : path.join(root, p === '/' ? 'index.html' : p);
```

A harness that doesn't still boots (the models come from Pages), only slower, and it tests the
published models rather than your local ones.

## Tools that read or write models

They take their folders from `tools/assetstore.py`:

```python
sys.path.append(os.path.join(ROOT, "tools"))
from assetstore import models
OUT = models("items")          # .../Bellmourn2/templates/models/items
```

So `tools/models/build_*.py`, `manifest.py`, `texprops.py`, `catalog.py`, `tools/armor/*`,
`tools/creatures/*` and the move picker's "Use these in the game" all write into the Bellmourn2
checkout. Never put model files back in Bellmourn's `templates/models/` (it is gitignored here).

## Adding or changing a model

1. Build or copy it into the Bellmourn2 checkout (`templates/models/...`) and try it locally.
2. Commit it in Bellmourn2 on a branch, push, open a PR there and merge it.
3. Wait for Bellmourn2's Pages build (`gh api repos/Agilancer/Bellmourn2/pages/builds/latest`)
   and check the files are live: `python tools/storecheck.py`.
4. Only then merge the Bellmourn PR that uses it. Phones load the game from Pages, so the code
   must never point at a model that isn't published yet.

A Bellmourn2 change that the current game can take (a repaint, a better mesh at the same path)
goes live as soon as Bellmourn2's Pages build finishes, without a Bellmourn PR.

## Sizes

| | Bellmourn tracked | Bellmourn published | Bellmourn2 tracked |
|---|---|---|---|
| Before (e0d6222) | 1,057.2 MiB | 925.1 MiB | 0.9 MiB |
| After | 374.7 MiB | 242.7 MiB | 683.4 MiB |

Measure with `git ls-tree -r -l origin/main` (sum the sizes; skip paths with a part starting with
`_` for the published figure).
