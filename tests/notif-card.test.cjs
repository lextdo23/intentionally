// The one-time "Turn on notifications?" card (alex 2026-11-26): people already using Daydeck see it once, when home is
// quiet, in one of three kinds (never asked, said no to Apple before, some switches off). Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  // The phone's answer to "may Daydeck notify?" is set per run: "default" (never asked), "denied" or "granted".
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("daydeck-account")) localStorage.setItem("daydeck-account", '{"skip":1}');
    const want = localStorage.getItem("perm-test") || "default";
    let perm = want;
    Object.defineProperty(Notification, "permission", { get: () => perm, configurable: true });
    Notification.requestPermission = async () => (perm = "granted");
  });
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(server.url);
  const setup = async (perm, extra = {}, started = day(3)) => {
    await p.evaluate(({ perm, extra, started }) => {
      localStorage.setItem("perm-test", perm);
      localStorage.setItem("daydeck", JSON.stringify({ v: 1, started, days: { [started]: { mood: 3 } }, seen: { note: "sleep", testInvite: 1 }, levels: { seen: 3 }, ...extra }));
    }, { perm, extra, started });
    await p.reload(); await p.waitForTimeout(3500);
  };
  const sheet = () => p.locator(".sheet-host").innerText().catch(() => "");
  const seen = () => p.evaluate(() => !!(JSON.parse(localStorage.getItem("daydeck")).seen || {}).notifCard);

  // Never asked: the card, Turn on asks the phone, everything starts on.
  await setup("default", { notify: { am: { on: false, t: "08:00" }, pm: { on: false, t: "21:00" }, card: { on: false } } });
  check(/Turn on notifications\?/.test(await sheet()), "never asked: \"Turn on notifications?\" shows by itself");
  check(await seen(), "it's marked as seen, so it only shows once");
  await p.click(".sheet-host .btn-main"); await p.waitForTimeout(900);
  check(await p.evaluate(() => Notification.permission) === "granted", "Turn on brings up the phone's own Allow (here: allowed)");
  const n = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).notify);
  check(n.am.on && n.pm.on && n.card.on, "and morning, evening and card reminders are on");
  await p.reload(); await p.waitForTimeout(3500);
  check(!(await p.$(".sheet-host")), "it never shows again");

  // Not now: never again.
  await setup("default");
  check(/Turn on notifications\?/.test(await sheet()), "shown again for the next person");
  await p.click(".sheet-host .btn-quiet"); await p.waitForTimeout(1500);
  check(await seen() && !(await p.$(".sheet-host")), "Not now puts it away for good");
  await p.reload(); await p.waitForTimeout(3500);
  check(!(await p.$(".sheet-host")), "and it stays away");

  // Said no to Apple before: where to switch them on.
  await setup("denied");
  const d = await sheet();
  check(/Notifications are off for Daydeck/.test(d) && /Settings › Notifications › Daydeck/.test(d), "said no before: says where to turn them on in the phone's Settings");
  await p.click(".sheet-host .btn-main"); await p.waitForTimeout(600);

  // Allowed, some switches off: just those, already on; one flicked back off stays off.
  await setup("granted", { notify: { am: { on: false, t: "08:00" }, pm: { on: false, t: "21:00" }, card: { on: true } } });
  const r = await sheet();
  check(/Turn on the rest\?/.test(r) && /Start your day/.test(r) && /End your day/.test(r) && !/Card reminders/.test(r), "some off: lists only the ones that are off (" + r.replace(/\s+/g, " ").slice(0, 80) + ")");
  check(await p.$$eval('.sheet-host .switch[aria-checked="true"]', (x) => x.length) === 2, "each already switched on");
  await p.click('.sheet-host .switch[aria-label="End your day"]');
  await p.click(".sheet-host .btn-main"); await p.waitForTimeout(800);
  const n2 = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).notify);
  check(n2.am.on && !n2.pm.on, "Turn on turns on the ones left on, not the one flicked off");

  // Nothing to ask: everything on, or a brand new person (asked in setup instead).
  await setup("granted", { notify: { am: { on: true, t: "08:00" }, pm: { on: true, t: "21:00" }, card: { on: true } } });
  check(!(await p.$(".sheet-host")) && !(await seen()), "everything already on: no card");
  await setup("default", {}, day(0));
  check(!(await p.$(".sheet-host")), "someone who started today: no card (setup asks them)");

  check(!errors.length, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close();
  done();
})();
