// Turning notifications back on (alex 2026-11-27): switching a nudge on in Settings asks the phone if it hasn't
// been asked; if the person said no to Apple before, it says where to switch them on (the switch stays on); and once
// they're allowed again in the phone's Settings, coming back to Daydeck signs the phone up for nudges again by itself.
// Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), errors = [];
  const run = async (perm, sub) => {
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 } }), plans = [];
    await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => {
      if (r.request().url().endsWith("/plan")) plans.push(1);
      r.fulfill({ status: 200, contentType: "application/json", body: r.request().url().endsWith("/key") ? '{"key":"AAAA"}' : '{"ok":true}', headers: { "access-control-allow-origin": "*" } });
    });
    await ctx.addInitScript(({ perm, sub }) => {
      localStorage.setItem("daydeck-account", '{"skip":1}');
      let p = perm; window.__asked = 0; window.__subs = 0; window.__sub = sub ? { endpoint: "https://push.example/old", toJSON() { return { endpoint: this.endpoint }; } } : null;
      Object.defineProperty(Notification, "permission", { get: () => p, configurable: true });
      Notification.requestPermission = async () => { window.__asked++; if (p === "default") p = "granted"; return p; };
      const reg = { pushManager: { getSubscription: async () => window.__sub,
        subscribe: async () => { window.__subs++; return (window.__sub = { endpoint: "https://push.example/new", toJSON() { return { endpoint: this.endpoint }; } }); } }, update() {} };
      Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve(reg), controller: null, register: async () => reg, getRegistrations: async () => [reg], addEventListener() {} } });
      window.__perm = (x) => { p = x; };
    }, { perm, sub });
    const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(server.url);
    await p.evaluate((started) => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started, days: { [started]: { mood: 3 } },
      seen: { note: "sleep", testInvite: 1, notifCard: 1, setup: 1 }, levels: { seen: 3 }, notify: { am: { on: true, t: "08:00" }, pm: { on: true, t: "21:00" }, card: { on: true } } })), day(3));
    await p.reload(); await p.waitForTimeout(3000);
    return { ctx, p, plans };
  };
  const openSettings = (p) => p.evaluate(async () => { (await import("./js/settings.js")).openSettings(() => {}); });
  const flip = async (p, name) => { await p.click(`#settings .switch[aria-label="${name}"]`); await p.waitForTimeout(500); };

  // Never asked: switching Start your day off and on again brings up the phone's own Allow box.
  { const { ctx, p } = await run("default", false);
    await openSettings(p); await p.waitForTimeout(800);
    check(/Notifications are off for Daydeck/.test(await p.innerText("#settings")), "never asked: Settings says notifications are off");
    await flip(p, "Start your day"); await flip(p, "Start your day");
    check(await p.evaluate(() => window.__asked) === 1, "turning Start your day back on asks the phone");
    check(await p.evaluate(() => Notification.permission) === "granted" && !/Notifications are off for Daydeck/.test(await p.innerText("#settings")), "allowed: the \"off\" row goes away");
    check(await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).notify.am.on), "and Start your day is on");
    await ctx.close(); }

  // Said no to Apple before: Apple won't ask again, so it says where to switch them on; the switch stays on.
  { const { ctx, p } = await run("denied", false);
    await openSettings(p); await p.waitForTimeout(800);
    await flip(p, "Card reminders"); await flip(p, "Card reminders");
    const sh = await p.locator(".sheet-host").innerText().catch(() => "");
    check(/Notifications are off for Daydeck/.test(sh) && /Settings › Notifications › Daydeck/.test(sh), "said no before: turning a nudge on shows where to switch them on");
    check(await p.evaluate(() => window.__asked) === 0, "and doesn't pretend to ask (Apple wouldn't show anything)");
    check(await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).notify.card.on), "the switch stays on, ready for when they're allowed");
    await ctx.close(); }

  // Switched back on in the phone's Settings: coming back to Daydeck signs the phone up again and sends the nudge times.
  { const { ctx, p, plans } = await run("denied", false);
    await p.evaluate(() => { window.__perm("granted"); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
    await p.waitForTimeout(1200);
    const got = await p.evaluate(() => [window.__subs, window.__asked]);
    check(got[0] === 1 && got[1] === 0, `allowed again: coming back signs the phone up once, without a question (${got})`);
    check(plans.length >= 1, "and the nudge times go to the service");
    await ctx.close(); }

  // Already allowed and signed up: nothing changes, nothing asked.
  { const { ctx, p } = await run("granted", true);
    await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await p.waitForTimeout(800);
    check(await p.evaluate(() => window.__subs) === 0, "already signed up: no new sign-up");
    await ctx.close(); }

  check(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
