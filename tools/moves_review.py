"""Render review contact sheets of the first-person moves with the game's own code, headless.

    python tools/moves_review.py specs.json [--timeout 300]
    python tools/moves_review.py --url art/view/some_test.html   (any page that posts /shot?name=__done)

specs.json is a list of moves.html review specs ({name, R, L, action, step, until, ...}; see
window.review there). Serves this checkout on a free local port for the length of the run,
opens moves.html?review=... in headless Chrome (its own throwaway profile), and waits for the
sheets: art/view/shots/<name>.png. Prints the page's log.
"""
import http.server
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import serve  # noqa: E402

CHROME = [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
          r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
          shutil.which("chrome") or "", shutil.which("google-chrome") or "", shutil.which("chromium") or ""]


class Quiet(serve.Handler):
    def log_message(self, *a):
        pass


def main():
    timeout = float(sys.argv[sys.argv.index("--timeout") + 1]) if "--timeout" in sys.argv else 300
    page = sys.argv[sys.argv.index("--url") + 1] if "--url" in sys.argv else None
    if not page:
        rel = os.path.relpath(os.path.abspath(sys.argv[1]), serve.ROOT).replace("\\", "/")
        if rel.startswith(".."):
            sys.exit("the specs file must be inside the checkout (e.g. art/view/)")
        page = f"moves.html?review={rel}"
    done = os.path.join(serve.SHOTS, "__done.png")
    if os.path.exists(done):
        os.remove(done)
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Quiet)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    exe = next(p for p in CHROME if p and os.path.exists(p))
    profile = tempfile.mkdtemp(prefix="moves_review_")
    url = f"http://127.0.0.1:{port}/{page}"
    proc = subprocess.Popen([exe, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                             "--window-size=1400,900", "--no-first-run", "--no-default-browser-check",
                             f"--user-data-dir={profile}", url],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    t0 = time.time()
    try:
        while not os.path.exists(done) and time.time() - t0 < timeout:
            time.sleep(0.5)
        time.sleep(0.3)
    finally:
        proc.kill()
        server.shutdown()
        shutil.rmtree(profile, ignore_errors=True)
    if not os.path.exists(done):
        sys.exit(f"timed out after {timeout:.0f} s")
    print(open(done, encoding="utf-8", errors="replace").read())
    print(f"({time.time() - t0:.0f} s)")


if __name__ == "__main__":
    main()
