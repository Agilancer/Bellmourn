"""Where the big assets live on this machine. GitHub Pages publishes at most 1 GB a site, so
Bellmourn's templates/models (every model and its textures) lives in the Agilancer/Bellmourn2 repo,
and the game fetches it from there (src/fps/store.js; docs/ASSETS.md). A tool that reads or writes
models uses models(...) for those paths, never <this repo>/templates/models:

    sys.path.append(os.path.join(ROOT, "tools"))
    from assetstore import models
    OUT = models("items")          # .../Bellmourn2/templates/models/items

The Bellmourn2 checkout is the folder named Bellmourn2 beside this checkout (or beside any folder
above it, for worktrees kept inside the repo). BELLMOURN2 in the environment names it outright."""
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOVED = ("templates/models/",)   # (repo paths that live in Bellmourn2: the same list as store.js)


def find_store():
    """The Bellmourn2 checkout's folder, or None."""
    named = os.environ.get("BELLMOURN2")
    if named:
        return os.path.abspath(named)
    p = REPO
    while True:
        here = os.path.join(os.path.dirname(p), "Bellmourn2")
        if os.path.isdir(os.path.join(here, "templates", "models")):
            return here
        up = os.path.dirname(p)
        if up == p:
            return None
        p = up


STORE = find_store()


def models(*parts):
    """A path under Bellmourn2's templates/models (the folder itself with no parts)."""
    if not STORE:
        sys.exit("The models live in the Bellmourn2 repo, and no checkout of it was found beside "
                 f"{REPO}: clone https://github.com/Agilancer/Bellmourn2 there, or set BELLMOURN2.")
    return os.path.join(STORE, "templates", "models", *parts)
