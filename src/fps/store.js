// Where the big assets live. GitHub Pages publishes at most 1 GB a site, so Bellmourn's biggest
// asset folder (templates/models: every model and its textures) lives in the Agilancer/Bellmourn2
// repo, whose Pages site sits beside the game's on the same origin:
//
//   the game     https://agilancer.github.io/Bellmourn/
//   the models   https://agilancer.github.io/Bellmourn2/templates/models/...
//
// asset(path) turns a repo path in a moved folder ('templates/models/kit/kit.json') into its
// Bellmourn2 URL and gives every other path back as it is. Fetches and <img>s must ask it; three's
// loaders don't have to, as its default loading manager runs every URL through it (a model or
// texture asked for by its old path still arrives). Same origin, so no CORS and the same caching.
//
// Locally the dev server (tools/serve.py) serves the sibling Bellmourn2 checkout under /Bellmourn2/
// too, so a local run reads the local models. A server that doesn't (an old test harness) is found
// out by one HEAD request, and the models then come from the Pages copy. ?store=<url> points them
// anywhere else (a test of the Pages copy from a local checkout: ?store=https://agilancer.github.io/Bellmourn2/).
// docs/ASSETS.md has the whole story, and how to add a model.
import * as THREE from 'three';

/** The folders that live in Bellmourn2 (repo paths, each ending in '/'). */
export const MOVED = ['templates/models/'];

const PAGES = 'https://agilancer.github.io/Bellmourn2/';

// this checkout's root URL (where index.html is), from this file's own address; none when the file
// isn't served from one (the asset manager runs the game's modules as blobs, with its own mapping)
let home = null;
try { const u = new URL('../../', import.meta.url); if (/^https?:$/.test(u.protocol)) home = u.href; } catch { /* a blob */ }

async function where() {
  const asked = new URLSearchParams(location.search).get('store');
  if (asked) return new URL(asked.replace(/\/?$/, '/'), location.href).href;
  const here = new URL('/Bellmourn2/', location.origin).href;
  if (location.hostname.endsWith('.github.io')) return here;   // (Pages: always there, no need to ask)
  try {
    const r = await fetch(here + 'templates/models/manifest.json', { method: 'HEAD', cache: 'no-store' });
    if (r.ok) return here;
  } catch { /* nothing answers there */ }
  console.warn(`Bellmourn2 isn't served at ${here}: the models come from ${PAGES} (tools/serve.py serves the local checkout; docs/ASSETS.md)`);
  return PAGES;
}

/** Bellmourn2's root URL ('' where asset() changes nothing). */
export const STORE = home ? await where() : '';

/** The URL to fetch a repo path (or any URL) from: its Bellmourn2 address if it is in a moved
 * folder, else `path` itself, untouched. Asking again with what it gave back changes nothing. */
export function asset(path) {
  if (!home || typeof path !== 'string') return path;
  let url;
  try { url = new URL(path, globalThis.document?.baseURI || location.href).href; } catch { return path; }
  if (!url.startsWith(home)) return path;   // (another site, a blob or data URL, or Bellmourn2 already)
  const rel = url.slice(home.length);
  return MOVED.some((m) => rel.startsWith(m)) ? STORE + rel : path;
}

if (home) THREE.DefaultLoadingManager.setURLModifier(asset);
