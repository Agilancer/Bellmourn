"""The move picker: serves this checkout and opens moves.html in the browser.

  python tools/moves_player.py         (or double-click moves-player.bat at the root)

Picks a free port on 127.0.0.1, turns caching off, saves your choice of attacks to
templates/models/fp_picks.json when you press "Use these in the game", and keeps serving
until this window is closed.
"""
import http.server
import os
import socket
import sys
import threading
import webbrowser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import serve  # noqa: E402  (its handler: caching off, POST /picks and /shot)


def free_port(start=8170):
    for p in range(start, start + 40):
        with socket.socket() as s:
            if s.connect_ex(('127.0.0.1', p)):
                return p
    return 0


class Quiet(serve.Handler):
    def log_message(self, *a):
        pass


if __name__ == '__main__':
    server = http.server.ThreadingHTTPServer(('127.0.0.1', free_port()), Quiet)
    url = f'http://127.0.0.1:{server.server_address[1]}/moves.html'
    print(f'The move picker is at {url}\nClose this window to stop it.')
    threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
