// Keeps Daydeck working offline. Daydeck is the whole site (the old Intentionally app is retired).
// Bump VERSION whenever any file below changes. (icons/launch-*.png are left out on purpose: the iPhone fetches its one
// launch picture itself when Daydeck is added to the home screen, so keeping all ten here would only cost space.)
const VERSION = "d82";
const FILES = [
  "./", "index.html", "privacy.html", "guidelines.html", "manifest.webmanifest", "css/app.css", "css/wrapped.css", "css/box.css", "css/photos.css", "css/library.css",
  "js/main.js", "js/standalone.js", "js/util.js", "js/clock.js", "js/store.js", "js/words.js", "js/stats.js", "js/ui.js", "js/checkin.js", "js/days.js", "js/sample.js", "js/notify.js", "js/tester.js", "js/tester-sheet.js", "js/settings.js", "js/cards-data.js", "js/deck.js", "js/draw.js", "js/pillars.js", "js/sleep.js", "js/own.js", "js/levels.js", "js/path.js", "js/tips.js", "js/wrapped.js", "js/boxes.js", "js/photos.js", "js/camera.js", "js/library.js", "js/account.js", "js/sync.js", "js/pill.js", "js/friends.js", "js/moments.js", "js/photo-backup.js", "js/pdf.js", "js/doctor.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
  "img/chrome/heart.webp", "img/chrome/moon.webp", "img/chrome/sparkle.webp", "img/chrome/spiky.webp", "img/chrome/sun.webp",
];
self.addEventListener("install", (e) => { e.waitUntil(caches.open("daydeck-" + VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => (k.startsWith("daydeck-") && k !== "daydeck-" + VERSION) || /^v\d+$/.test(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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
// Card reminders: the app keeps today's reminder times and the card's task here (on the phone only).
async function cardPlan(key = "card") {
  try { const r = await (await caches.open("nudge-plan")).match(key); return r ? await r.json() : null; } catch { return null; }
}
async function show() {
  const p = await cardPlan(), t = Date.now();
  // Weekly recap (Sunday heads-up, Monday catch-up), unless a card reminder was planned closer to now.
  const r = await cardPlan("recap"), near = (r && r.at || []).filter((x) => Math.abs(x.t - t) < 20 * 60e3).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
  const cardGap = Math.min(...(p && p.at || []).map((x) => Math.abs(x - t)), Infinity);
  if (near && Math.abs(near.t - t) <= cardGap) {
    if (near.done) return; // ended the day or opened the recap since this was planned: stay quiet
    const sun = near.kind === "recap-sun";
    await self.registration.showNotification(sun ? "Weekly recap tonight" : "Weekly recap ready", {
      body: sun ? "End your day to see how your week went." : "A look back at Monday to Sunday, when you've got a minute.",
      icon: "icons/icon-192.png", tag: "daydeck-recap", data: { kind: near.kind },
    });
    return note([t, "sent", near.kind]);
  }
  if (p && (p.at || []).some((x) => Math.abs(x - t) < 20 * 60e3) && p.task) {
    if (p.done) return; // done since this was planned: stay quiet
    await self.registration.showNotification("Today's card", { body: p.task, icon: "icons/icon-192.png", tag: "daydeck-card" });
    return note([t, "sent", "card"]);
  }
  // The wind-down nudge kept from the weekly wrapped: 20 minutes before the usual lights out.
  const w = await cardPlan("wind");
  if (w && (w.at || []).some((x) => Math.abs(x - t) < 20 * 60e3)) {
    await self.registration.showNotification("Time to wind down", { body: "Your usual lights out is in 20 minutes.", icon: "icons/icon-192.png", tag: "daydeck-wind" });
    return note([t, "sent", "wind"]);
  }
  const morning = new Date().getHours() < 14, kind = morning ? "am" : "pm";
  // The phone adds "from Daydeck" itself, so the bold title is a greeting rather than the app's name (alex 2026-11-17).
  await self.registration.showNotification(morning ? "Good morning" : "Good evening", {
    body: morning ? "How did you sleep?" : "How was today?",
    icon: "icons/icon-192.png", tag: "daydeck-" + kind, // own tag each, so an unread morning nudge isn't replaced by the evening one
  });
  return note([t, "sent", kind]);
}
self.addEventListener("push", (e) => { e.waitUntil(show()); });
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const kind = (e.notification.data && e.notification.data.kind) || { "daydeck-am": "am", "daydeck-card": "card", "daydeck-wind": "wind" }[e.notification.tag] || "pm";
  const recap = kind === "recap-mon"; // Monday's opens the recap itself; Sunday's opens home, to end the day
  // Tells the app a nudge opened it, and which one (counted only for testers who joined tester mode).
  e.waitUntil(note([Date.now(), "tap", kind]).then(() => self.clients.matchAll({ type: "window" })).then((open) => (open[0] ? (open[0].postMessage({ nudge: 1, recap }), open[0].focus()) : self.clients.openWindow(recap ? "./?from=nudge&open=recap" : "./?from=nudge"))));
});
