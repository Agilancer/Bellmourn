"""Static dev server for the game with caching disabled (ES modules are cached aggressively).

POST /shot?name=foo with a PNG body saves art/view/shots/foo.png, so exact game-canvas frames
can be pulled out of the browser for pixel review (localhost only)."""
import http.server, os, re, sys
from urllib.parse import urlparse, parse_qs

SHOTS = os.path.join('art', 'view', 'shots')


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        u = urlparse(self.path)
        name = parse_qs(u.query).get('name', ['shot'])[0]
        if u.path != '/shot' or not re.fullmatch(r'[\w-]{1,64}', name):
            self.send_error(400)
            return
        os.makedirs(SHOTS, exist_ok=True)
        data = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        with open(os.path.join(SHOTS, name + '.png'), 'wb') as f:
            f.write(data)
        self.send_response(204)
        self.end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
