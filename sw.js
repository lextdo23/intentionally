// Keeps the app working offline: the app's own files are cached on install and served from the cache first.
// Bump VERSION whenever any file below changes, so phones pick up the new copy.
const VERSION = "v4";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/main.js", "js/store.js", "js/sky.js", "js/clock.js", "js/pillars.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
