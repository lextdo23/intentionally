// Temporary: lets check.html test notifications in a home-screen app with no manifest. Remove with check.html.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => e.waitUntil(self.registration.showNotification("Screen check", { body: "A ping arrived." })));
