// Cross-origin isolation for Bellmourn: this service worker serves the game's own files with the
// two headers (COOP same-origin, COEP require-corp) that let the page share memory between threads,
// so the voices' model (Kokoro, voice.js / tts_worker.js) runs on several of the computer's cores
// instead of one. GitHub Pages can't send those headers itself, hence a service worker. index.html
// registers it the first time and reloads once it's in charge; from then on every visit is isolated
// from the start. Everything from elsewhere (the CDN, Hugging Face, the fonts) is left alone: it's all
// fetched with CORS, which isolation allows.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;
  e.respondWith(fetch(r).then((res) => {
    if (!res || res.status === 0 || res.type === 'opaqueredirect') return res;
    const h = new Headers(res.headers);
    h.set('Cross-Origin-Opener-Policy', 'same-origin');
    h.set('Cross-Origin-Embedder-Policy', 'require-corp');
    h.set('Cross-Origin-Resource-Policy', 'same-origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }));
});
