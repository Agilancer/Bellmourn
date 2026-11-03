"""The knight's animation player: serves this checkout and opens knight.html in the browser.

  python tools/knight_player.py         (or double-click knight-player.bat at the root)

Picks a free port on 127.0.0.1, turns caching off (so a rebuilt clip shows at once), and keeps
serving until this window is closed.
"""
import http.server
import os
import socket
import sys
import threading
import webbrowser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import serve  # noqa: E402  (its handler: caching off, and Bellmourn2 (the models) under /Bellmourn2/)


class Handler(serve.Handler):
    def log_message(self, *a):   # (quiet: only the address matters)
        pass


def free_port(start=8160):
    for p in range(start, start + 40):
        with socket.socket() as s:
            if s.connect_ex(('127.0.0.1', p)):
                return p
    return 0


if __name__ == '__main__':
    port = free_port()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler)
    url = f'http://127.0.0.1:{server.server_address[1]}/knight.html'
    print(f'The Sworn animation player is at {url}\nClose this window to stop it.')
    threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
