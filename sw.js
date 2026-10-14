// Service worker offline para Recetas Saludables (piloto). Sin llamadas externas.
const CACHE = "recetas-bb07fdc813f9";
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

// cache.addAll() no basta: pide cada URL con el modo de cache normal, que
// PUEDE servirse del cache HTTP del navegador en vez de ir a la red. Eso
// dejaba este mismo bug a un segundo nivel: el service worker SI detectaba
// la actualizacion (ver updateViaCache: "none" en el registro, en app.js),
// pero al reconstruir su cache seguia guardando el app.js VIEJO que el
// navegador tenia por su cuenta. { cache: "reload" } fuerza ir a la red de
// verdad. Confirmado el fallo y el arreglo en
// scratchpad/driver/reproducir_cache_arreglado.js antes de este cambio.
async function precachear(cache, urls) {
  await Promise.all(urls.map(async (url) => {
    const res = await fetch(url, { cache: "reload" });
    if (res.ok) await cache.put(url, res);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await precachear(cache, APP_SHELL);
      try {
        const res = await fetch("data/recetas.json", { cache: "reload" });
        const recetas = await res.json();
        const imagenes = recetas
          .map(r => r.imagen)
          .filter(Boolean)
          .map(p => "imagenes_piloto/" + p.split("/").pop());
        await precachear(cache, imagenes);
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
