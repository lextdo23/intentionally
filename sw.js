// Keeps the app working offline. Files come fresh from the internet when there is a connection (so updates
// show straight away) and from the saved copy when there isn't. Bump VERSION whenever any file below changes.
const VERSION = "v25";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/main.js", "js/store.js", "js/sky.js", "js/clock.js", "js/pillars.js", "js/thoughts.js", "js/sort.js", "js/helps.js", "js/week.js", "js/weekview.js", "js/lookback.js", "js/notify.js",
  "img/sky.jpg", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== "notify").map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});

// Notifications. The service only sends an empty ping at the right moment; the words were left here by the app
// (js/notify.js), so nothing personal passes through it. Whichever note is closest in time is the one that's due.
self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let text = "Your sky is here whenever you want it.";
    try {
      const notes = await (await (await caches.open("notify")).match("words")).json(), t = Date.now(), DAY = 86400000;
      const off = (n) => { const d = Math.abs(n.at - t); return n.daily ? Math.min(d % DAY, DAY - (d % DAY)) : d; };
      const due = notes.sort((a, b) => off(a) - off(b))[0];
      if (due) text = due.text;
    } catch { /* nothing saved yet: the gentle default */ }
    await self.registration.showNotification("Intentionally", { body: text, icon: "icons/icon-192.png", tag: "nudge" });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((open) => open[0] ? open[0].focus() : self.clients.openWindow("./")));
});
