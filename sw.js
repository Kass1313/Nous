const CACHE = "nous-v1";
const ASSETS = ["./index.html", "./jeux.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = e.request.url;
  // Ne jamais mettre en cache Firebase ni l'API Gemini (toujours réseau)
  if (url.includes("firebase") || url.includes("googleapis.com/v1beta") || url.includes("google.com")) {
    return;
  }
  // Stratégie : réseau d'abord, cache en secours (pour avoir les MAJ + le hors-ligne)
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200 && e.request.method === "GET") {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone).catch(()=>{}));
      }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
