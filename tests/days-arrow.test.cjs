// A stray "‹" floated over home after leaving Your days (alex 2026-11-23). The "Earlier week" arrow was set to always
// show, which beat the page being hidden. Checks the arrow shows on Your days when there's an earlier week, is gone
// after going back (button and swipe), and the later arrow stays hidden. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, reducedMotion: "reduce" });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const days = {}; for (let i = 1; i < 20; i++) days[day(i)] = { mood: 3, sleep: { q: 3 } };
  days[day(0)] = { sleep: { q: 3 } };
  await p.goto(server.url);
  await p.evaluate((days) => { localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "sleep" }, levels: { keepAll: true } })); }, days);
  await p.reload(); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelectorAll(".tip-layer").forEach((x) => x.remove()));
  // Is anything from Your days actually showing? (visible and on screen)
  const shown = () => p.evaluate(() => [...document.querySelectorAll("#days *")].filter((e) => {
    const r = e.getBoundingClientRect(); return getComputedStyle(e).visibility === "visible" && r.width && r.right > 0 && r.left < innerWidth;
  }).map((e) => e.getAttribute("aria-label") || e.className || e.tagName));
  const arrows = () => p.evaluate(() => [...document.querySelectorAll("#days .period .round")].map((e) => getComputedStyle(e).visibility));

  check((await shown()).length === 0, "before opening, nothing from Your days shows over home");
  const open = async () => { await p.evaluate(async () => (await import("./js/days.js")).openDays(document.body, () => {})); await p.waitForTimeout(800); };
  await open();
  check(JSON.stringify(await arrows()) === '["visible","hidden"]', "on Your days, the earlier-week arrow shows and the later one is hidden");

  await p.click('#days [aria-label="Back to today"]'); await p.waitForTimeout(800);
  let left = await shown();
  check(left.length === 0, "after going back, nothing from Your days is left over home" + (left.length ? ": " + left.join(", ") : ""));

  await open();
  await p.evaluate(() => {   // swipe in from the left edge, like going back on the phone
    const e = document.querySelector("#days .edge"), at = (type, x) => e.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: 400, pointerId: 1, bubbles: true }));
    at("pointerdown", 5); at("pointermove", 150); at("pointermove", 380); at("pointerup", 380);
  });
  await p.waitForTimeout(900);
  left = await shown();
  check(left.length === 0, "after swiping back, nothing from Your days is left over home" + (left.length ? ": " + left.join(", ") : ""));

  check(!errors.length, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
