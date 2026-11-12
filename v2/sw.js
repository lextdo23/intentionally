// Keeps Daydeck working offline. Only looks after the v2 folder, never the old app.
// Bump VERSION whenever any file below changes.
const VERSION = "d4s";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/main.js", "js/util.js", "js/clock.js", "js/store.js", "js/words.js", "js/stats.js", "js/ui.js", "js/checkin.js", "js/days.js", "js/sample.js", "js/notify.js", "js/tester.js", "js/tester-sheet.js", "js/settings.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
];
self.addEventListener("install", (e) => { e.waitUntil(caches.open("daydeck-" + VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("daydeck-") && k !== "daydeck-" + VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((res) => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open("daydeck-" + VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

// Notifications: the service only sends an empty ping at the right time; the words are chosen here.
self.addEventListener("push", (e) => {
  const morning = new Date().getHours() < 14;
  e.waitUntil(self.registration.showNotification("Daydeck", {
    body: morning ? "Good morning. How did you sleep?" : "How was today? Your evening check-in is here.",
    icon: "icons/icon-192.png", tag: "daydeck-nudge",
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  // Tells the app a nudge opened it (counted only for testers who joined tester mode).
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((open) => (open[0] ? (open[0].postMessage({ nudge: 1 }), open[0].focus()) : self.clients.openWindow("./?from=nudge"))));
});
