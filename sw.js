const CACHE = 'nasza-legenda-051-cinematic-v1';
const ASSETS = [
  './','./index.html','./styles.css?v=051','./app.js?v=051','./manifest.webmanifest','./logo.svg',
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-512-maskable.png',
  './episodes/signal-spoza-czasu/manifest.json','./episodes/signal-spoza-czasu/story-graph.json',
  './episodes/signal-spoza-czasu/scenes/intro.mp4','./episodes/signal-spoza-czasu/scenes/task-intro.mp4',
  './episodes/signal-spoza-czasu/scenes/task-loop.mp4','./episodes/signal-spoza-czasu/scenes/listen.mp4',
  './episodes/signal-spoza-czasu/scenes/secure.mp4','./episodes/signal-spoza-czasu/scenes/timeout.mp4',
  './episodes/signal-spoza-czasu/scenes/cliffhanger.mp4',
  './episodes/signal-spoza-czasu/scenes-src/intro.png','./episodes/signal-spoza-czasu/scenes-src/task.png',
  './episodes/signal-spoza-czasu/scenes-src/listen.png','./episodes/signal-spoza-czasu/scenes-src/secure.png',
  './episodes/signal-spoza-czasu/scenes-src/timeout.png','./episodes/signal-spoza-czasu/scenes-src/cliffhanger.png'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response;
  }).catch(() => cached)));
});
