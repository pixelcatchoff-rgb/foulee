// Fonctionne hors connexion : les fichiers de l'appli sont gardés en cache.
const VERSION = 'foulee-3.4.1';
const TILES = 'foulee-tiles';
const MAX_TILES = 1500;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/steps.js',
  './js/util.js',
  './js/tools.js',
  './js/analyse.js',
  './js/strava-csv.js',
  './js/strava.js',
  './js/config.js',
  './js/coach.js',
  './js/quiz.js',
  './js/conseils.js',
  './js/foods.js',
  './js/ui.js',
  './js/adapt.js',
  './js/routines.js',
  './js/live.js',
  './js/map.js',
  './js/routes.js',
  './js/parcours.js',
  './js/extras.js',
  './js/cardio.js',
  './js/figures.js',
  './js/extra.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Polices Google : cache puis réseau
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Fonds de carte : réseau d'abord ; les zones déjà vues restent affichables sans réseau
  if (url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            caches.open(TILES).then(async (c) => {
              await c.put(req, copy);
              const keys = await c.keys();
              if (keys.length > MAX_TILES) await Promise.all(keys.slice(0, keys.length - MAX_TILES).map((k) => c.delete(k)));
            });
          }
          return res;
        })
        .catch(() => caches.open(TILES).then((c) => c.match(req)).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Bibliothèque de carte (Leaflet) : gardée pour fonctionner hors connexion
  if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (url.origin !== location.origin) return;

  // Fichiers de l'appli : réseau d'abord (mises à jour), cache si hors ligne
  // `no-cache` : on revalide toujours auprès de GitHub, pour recevoir les mises à jour tout de suite
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});
