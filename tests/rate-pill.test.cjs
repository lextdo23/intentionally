// Rating a card on home with the bottom pill (alex 2026-11-21): the pill is fully hidden while "How did doing it
// feel?" is open, including with "Show more" expanded, and comes back as soon as Done is pressed. The open options
// never cover Lifeline. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const days = {}; for (let i = 1; i < 6; i++) days[day(i)] = { mood: 3, sleep: { q: 3 } };
  days[day(0)] = { sleep: { q: 3 }, card: { id: 1 } };
  await p.goto(server.url);
  await p.evaluate((days) => { localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "sleep" }, levels: { seen: 3, early: 1 } })); }, days);
  await p.reload(); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelectorAll(".tip-layer").forEach((x) => x.click())); await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelectorAll(".tip-layer").forEach((x) => x.remove()));
  const pill = () => p.evaluate(() => { const cs = getComputedStyle(document.getElementById("pill")); return cs.opacity === "0" && cs.visibility === "hidden" ? "hidden" : cs.opacity === "1" && cs.visibility === "visible" ? "shown" : "between"; });
  check((await pill()) === "shown", "the bottom pill shows on home");

  await p.click(".home-card button.did", { force: true }); await p.waitForTimeout(1600);
  check((await pill()) === "hidden", "after “I did it”, the pill is fully hidden (switched off, not just faded) while rating");
  await p.click(".did-ask [aria-expanded]"); await p.waitForTimeout(900);
  check((await pill()) === "hidden", "it stays hidden with “Show more” open");
  const gap = await p.evaluate(() => document.querySelector("#home .lifeline").getBoundingClientRect().top - [...document.querySelectorAll(".did-ask button")].pop().getBoundingClientRect().bottom);
  check(gap >= 0, "the open options and “Not now” stay above Lifeline, so it's never covered");

  await p.click(".did-ask .ok"); await p.waitForTimeout(500);
  check((await pill()) === "shown", "pressing Done brings the pill straight back");

  check(!errors.length, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
