// Keeps Daydeck working offline. Only looks after the v2 folder, never the old app.
// Bump VERSION whenever any file below changes.
const VERSION = "d23";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/main.js", "js/util.js", "js/clock.js", "js/store.js", "js/words.js", "js/stats.js", "js/ui.js", "js/checkin.js", "js/days.js", "js/sample.js", "js/notify.js", "js/tester.js", "js/tester-sheet.js", "js/settings.js", "js/cards-data.js", "js/deck.js", "js/draw.js", "js/pillars.js", "js/sleep.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
];
self.addEventListener("install", (e) => { e.waitUntil(caches.open("daydeck-" + VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("daydeck-") && k !== "daydeck-" + VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // Sleep sounds are big and played in pieces: leave them to the browser (it can't cache pieces here).
  if (new URL(e.request.url).pathname.includes("/sounds/")) return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((res) => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open("daydeck-" + VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

// Notifications: the service only sends an empty ping at the right time; the words are chosen here.
// Each one shown is noted (morning or evening, and when) so tester mode can count them; nothing else is kept.
const LOG = "nudge-log";
async function note(entry) {
  try {
    const c = await caches.open(LOG), r = await c.match("log"), list = r ? await r.json() : [];
    list.push(entry);
    await c.put("log", new Response(JSON.stringify(list.slice(-200))));
  } catch { /* counting must never stop a nudge */ }
}
self.addEventListener("push", (e) => {
  const morning = new Date().getHours() < 14, kind = morning ? "am" : "pm";
  e.waitUntil(Promise.all([
    self.registration.showNotification("Daydeck", {
      body: morning ? "How did you sleep?" : "How was today?",
      icon: "icons/icon-192.png", tag: "daydeck-" + kind, // own tag each, so an unread morning nudge isn't replaced by the evening one
    }),
    note([Date.now(), "sent", kind]),
  ]));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const kind = e.notification.tag === "daydeck-am" ? "am" : "pm";
  // Tells the app a nudge opened it, and which one (counted only for testers who joined tester mode).
  e.waitUntil(note([Date.now(), "tap", kind]).then(() => self.clients.matchAll({ type: "window" })).then((open) => (open[0] ? (open[0].postMessage({ nudge: 1 }), open[0].focus()) : self.clients.openWindow("./?from=nudge"))));
});
