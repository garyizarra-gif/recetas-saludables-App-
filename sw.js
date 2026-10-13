// Service worker offline para Recetas Saludables (piloto). Sin llamadas externas.
const CACHE = "recetas-piloto-v8-web";
const APP_SHELL = [
  "./",
  "index.html",
  "styles.css",
  "config.js",
  "pdf.js",
  "app.js",
  "manifest.json",
  "data/recetas.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(APP_SHELL);
      try {
        const res = await fetch("data/recetas.json");
        const recetas = await res.json();
        const imagenes = recetas
          .map(r => r.imagen)
          .filter(Boolean)
          .map(p => "imagenes_piloto/" + p.split("/").pop());
        await cache.addAll(imagenes);
      } catch (e) {
        // si falla el precache de imagenes, la app sigue funcionando y las cachea en runtime
      }
      self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(res => {
          const copia = res.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copia));
          return res;
        })
        .catch(() => cached);
    })
  );
});
