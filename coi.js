// coi.js once made the page cross-origin isolated, so the old synthesised voices (Kokoro) could run on
// several cores. The voices are recordings now (voice.js) and need none of it, so index.html no longer
// registers this; a browser that still has the old one installed fetches this copy on its next visit
// and it takes itself away.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.registration.unregister()));
