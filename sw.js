const CACHE = "wardrobe-v3";
const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "db.js",
  "mannequins.js",
  "seed-data.js",
  "bg-remove.js",
  "manifest.json",
  "assets/icon.svg",
  "assets/seed/top-white-tee.jpg",
  "assets/seed/top-pink-tee.jpg",
  "assets/seed/top-black-tee.jpg",
  "assets/seed/top-beige-blouse.jpg",
  "assets/seed/top-green-shirt.jpg",
  "assets/seed/bottom-blue-jeans.jpg",
  "assets/seed/bottom-dark-jeans.jpg",
  "assets/seed/bottom-black-trousers.jpg",
  "assets/seed/bottom-denim-shorts.jpg",
  "assets/seed/bottom-pink-leggings.jpg",
  "assets/seed/shoes-brown-sandals.jpg",
  "assets/seed/shoes-red-heels.jpg",
  "assets/seed/shoes-white-heels.jpg",
  "assets/seed/shoes-sneaker.jpg",
  "assets/seed/shoes-boots.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
