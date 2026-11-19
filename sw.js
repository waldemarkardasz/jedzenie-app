/* Service worker aplikacji Jedzenie: trzyma w telefonie samą powłokę.
 * Danych nie dotyka — zapytania do GitHuba przechodzą obok niego,
 * a ostatnie karty aplikacja przechowuje sama. */
const PAMIEC = 'jedzenie-powloka-v1';
const POWLOKA = ['./', './index.html', './app.js', './manifest.webmanifest', './ikona-192.png', './ikona-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAMIEC).then((c) => c.addAll(POWLOKA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((klucze) => Promise.all(klucze.filter((k) => k !== PAMIEC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Powłoka: od razu z pamięci, a w tle sprawdzenie, czy jest nowsza.
  e.respondWith(
    caches.open(PAMIEC).then(async (c) => {
      const zapis = await c.match(e.request, { ignoreSearch: true });
      const siec = fetch(e.request)
        .then((odp) => { if (odp.ok) c.put(e.request, odp.clone()); return odp; })
        .catch(() => zapis || c.match('./index.html'));
      return zapis || siec;
    })
  );
});
