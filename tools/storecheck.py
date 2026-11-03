"""Are the moved assets where the game will look for them? (docs/ASSETS.md)

  python tools/storecheck.py            every check
  python tools/storecheck.py --local    skip asking Pages

1. Nothing sits in this checkout's moved folders (the game never reads them: a model left there
   is a model the game can't see).
2. The Bellmourn2 checkout has nothing in them uncommitted or unpushed.
3. Every file in them on Bellmourn2's origin/main answers on GitHub Pages, at its size.
Run it before merging a Bellmourn change that needs a new model. Exits 1 if anything is wrong."""
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from assetstore import MOVED, REPO, STORE  # noqa: E402

PAGES = "https://agilancer.github.io/Bellmourn2/"


def git(where, *args):
    return subprocess.run(["git", "-C", where, *args], capture_output=True, text=True, check=True).stdout


def head(item):
    path, size = item
    req = urllib.request.Request(PAGES + urllib.parse.quote(path), method="HEAD",
                                 headers={"Accept-Encoding": "identity"})
    err = None
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                n = r.headers.get("Content-Length")
                return path, r.status, int(n) if n else size, size
        except urllib.error.HTTPError as e:
            return path, e.code, None, size
        except OSError as e:   # (a dropped connection: again)
            err = e
    return path, f"no answer ({err})", None, size


def main():
    trouble = 0
    folders = [m.rstrip("/") for m in MOVED]

    left = [p for p in git(REPO, "ls-files", "--", *folders).splitlines()]
    for f in folders:
        for d, _, names in os.walk(os.path.join(REPO, f)):
            left += [os.path.relpath(os.path.join(d, n), REPO).replace("\\", "/") for n in names]
    left = sorted(set(left))
    print(f"1. In this checkout's moved folders: {len(left)} files")
    for p in left[:20]:
        print("   ", p)
    trouble += bool(left)

    if not STORE:
        print("2. No Bellmourn2 checkout beside this one (docs/ASSETS.md: clone it there)")
        return 1
    dirty = git(STORE, "status", "--porcelain", "--", *folders).splitlines()
    git(STORE, "fetch", "-q", "origin")
    ahead = git(STORE, "diff", "--name-only", "origin/main", "HEAD", "--", *folders).splitlines()
    print(f"2. Bellmourn2 ({STORE}): {len(dirty)} uncommitted, {len(ahead)} committed but not on origin/main")
    for line in (dirty + ahead)[:20]:
        print("   ", line)
    trouble += bool(dirty or ahead)

    if "--local" in sys.argv:
        return 1 if trouble else 0
    items = []
    for row in git(STORE, "ls-tree", "-r", "-l", "origin/main", "--", *folders).splitlines():
        meta, path = row.split("\t", 1)
        items.append((path, int(meta.split()[3])))
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(head, items))
    bad = [r for r in res if r[1] != 200 or r[2] != r[3]]
    print(f"3. On Pages: {len(items) - len(bad)} of {len(items)} files answer at their size")
    for r in bad[:20]:
        print("   ", r)
    trouble += bool(bad)
    return 1 if trouble else 0


if __name__ == "__main__":
    sys.exit(main())
