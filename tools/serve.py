"""Static dev server for the game with caching disabled (ES modules are cached aggressively).
Serves the checkout it lives in, wherever it is started from, and under /Bellmourn2/ the Bellmourn2
checkout beside it (where the models live: docs/ASSETS.md), as GitHub Pages lays the two out.

POST /shot?name=foo with a PNG body saves art/view/shots/foo.png (&ext=wav: foo.wav, a voice sample), so exact game-canvas frames
can be pulled out of the browser for pixel review (localhost only).
POST /picks with a JSON body saves Bellmourn2's templates/models/fp_picks.json: the attacks chosen
in the move picker (moves.html)."""
import http.server, json, os, re, sys
from urllib.parse import urlparse, parse_qs

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from assetstore import STORE, models  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'art', 'view', 'shots')
STORE_PATH = '/Bellmourn2/'   # (the URL the game asks for it at: src/fps/store.js)
if STORE:
    print(f'Serving {STORE} at {STORE_PATH}', flush=True)
else:
    print(f'No Bellmourn2 checkout beside {ROOT}: the game reads the models from GitHub Pages', flush=True)


def save_picks(data):
    """Keep only real slot -> option ids from the move catalog; returns what was written."""
    if not STORE:
        raise OSError('no Bellmourn2 checkout')
    PICKS, MOVES = models('fp_picks.json'), models('fp_moves.json')
    slots = json.load(open(MOVES, encoding='utf-8'))['slots']
    picks = json.loads(data)
    out = {k: v for k, v in picks.items()
           if k in slots and any(o['id'] == v for o in slots[k]['options'])}
    if not out:
        raise ValueError('no known picks')
    with open(PICKS, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1)
        f.write('\n')
    return out


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def translate_path(self, path):
        # /Bellmourn2/... is the Bellmourn2 checkout (the cleaning in the base class keeps it inside)
        if STORE and urlparse(path).path.startswith(STORE_PATH):
            home, self.directory = self.directory, STORE
            try:
                return super().translate_path(path[len(STORE_PATH) - 1:])
            finally:
                self.directory = home
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        u = urlparse(self.path)
        data = self.rfile.read(min(int(self.headers.get('Content-Length', 0)), 32 << 20))
        if u.path == '/picks':
            try:
                save_picks(data)
            except (ValueError, KeyError, OSError):
                self.send_error(400)
                return
            self.send_response(204)
            self.end_headers()
            return
        q = parse_qs(u.query)
        name, ext = q.get('name', ['shot'])[0], q.get('ext', ['png'])[0]
        if u.path != '/shot' or not re.fullmatch(r'[\w-]{1,64}', name) or ext not in ('png', 'wav'):
            self.send_error(400)
            return
        os.makedirs(SHOTS, exist_ok=True)
        with open(os.path.join(SHOTS, name + '.' + ext), 'wb') as f:
            f.write(data)
        self.send_response(204)
        self.end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
