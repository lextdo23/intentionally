// Usage tab (alex 2026-11-26): the app notes how long it was open each visit (only for testers who agreed to the
// new consent), and the tester page's sums group opens into visits correctly: a quick return is the same visit,
// lengths, visits a day, days opened, coming back on day N, and what was done each visit. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

const now = Date.now();
const kOf = (t) => { const d = new Date(t - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const DAY = 864e5, MIN = 6e4;

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), errors = [];

  // 1. The app: leaving notes how long it was open; an old consent (2) sends nothing until asked again.
  for (const consent of [3, 2]) {
    const ctx = await b.newContext(), p = await ctx.newPage(), sends = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => {
      if (r.request().url().endsWith("/t/send")) sends.push(JSON.parse(r.request().postData()));
      r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } });
    });
    await p.goto(server.url);
    await p.evaluate((c) => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: "2026-11-01", days: {}, seen: { note: "x", setup: 1, testInvite: 1 },
      tester: { on: true, consent: c, code: "T-USE1", key: "0123456789abcdef0123456789abcdef", queue: [], sent: 1, all: true } })), consent);
    await p.reload(); await p.waitForTimeout(2500);
    await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    await p.waitForTimeout(800);
    const evs = sends.flatMap((s) => s.events || []), close = evs.filter((e) => e[1] === "close");
    if (consent === 3) {
      check(evs.some((e) => e[1] === "open"), "opening the app is noted");
      check(close.length === 1 && Number.isInteger(close[0][2]) && close[0][2] >= 2 && close[0][2] < 30, `leaving notes the seconds it was open (${close[0] && close[0][2]})`);
    } else check(close.length === 0, "a tester who agreed to the older list isn't sent visit lengths before agreeing again");
    await ctx.close();
  }

  // 2. The tester page's sums.
  const p = await b.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(server.url + "testers.html"); await p.waitForFunction(() => window.__render);
  const start = now - 8 * DAY, T = { code: "T-USE", joined: start, seen: now, phone: "iPhone", version: "d134", started: kOf(start), nudges: "{}" };
  const ev = (t, name, val) => ({ code: "T-USE", t, name, val: val === undefined ? null : JSON.stringify(val) });
  const at = (d, h, m = 0) => { const x = new Date(start + d * DAY); x.setHours(h, m, 0, 0); return x.getTime(); };
  const E = [
    // day 0 morning: check-in and card, leaves for 30 sec, comes back (same visit), 2 min in all
    ev(at(0, 8), "open"), ev(at(0, 8) + 10e3, "am_done", { secs: 40 }), ev(at(0, 8) + 50e3, "card_keep", { id: 1 }), ev(at(0, 8) + 60e3, "close", 60),
    ev(at(0, 8) + 90e3, "open"), ev(at(0, 8) + 100e3, "photo_offer"), ev(at(0, 8) + 150e3, "close", 60),
    // day 0 evening: from a notification, evening check-in, 3 min
    ev(at(0, 8) + 120e3, "card_did", 1),
    ev(at(0, 20), "open", "nudge"), ev(at(0, 20) + 30e3, "pm_done", { secs: 60 }), ev(at(0, 20) + 180e3, "close", 180),
    // day 1: just looked, 8 sec
    ev(at(1, 12), "open"), ev(at(1, 12) + 8e3, "close", 8),
    // day 7: looked at Your days, an error, length unknown (old app, no close)
    ev(at(7, 9), "open"), ev(at(7, 9) + 5e3, "days_open"), ev(at(7, 9) + 6e3, "error", "boom"),
  ];
  const err = await p.evaluate((d) => { try { window.__render(d); return null; } catch (e) { return e.message; } }, { at: now, testers: [T], days: [], events: E });
  check(err === null, "the page shows the Usage tab without errors");
  await p.click('.ttabs [data-tab="usage"]');
  const u = await p.evaluate(() => {
    const secs = [...document.querySelectorAll('#out [data-g="usage"]')].filter((s) => !s.hidden);
    const get = (t) => { const s = secs.find((x) => x.querySelector("h2") && x.querySelector("h2").textContent === t); return s ? (t === "Recent visits" ? s.textContent : s.innerText) : ""; };
    const tiles = [...document.querySelectorAll('#out .tiles[data-g="usage"] .tile b')].map((b) => b.textContent);
    return { n: secs.length, tiles, row: (document.querySelector('#out [data-g="usage"] tbody tr') || {}).innerText || "",
      come: get("Do people come back after day one?"), often: get("How often do people open it?"), long: get("How long do people stay?"),
      what: get("What do people do each visit?"), card: get("When do people do their card?"), recent: get("Recent visits"), smooth: get("Does it run smoothly?") };
  });
  check(u.n >= 7, `every Usage section shows on its tab (${u.n})`);
  check(u.tiles[0] === "1" && u.tiles[1] === "2 min", `tiles: usual visits a day and a usual visit (${u.tiles.join(" | ")})`);
  check(/9 days/.test(u.row) && /3 of 9/.test(u.row), `days on Daydeck and days opened (${u.row.replace(/\s+/g, " ")})`);
  check(/1 day after starting \(1 of 1\)/.test(u.come) && /7 days after starting \(1 of 1\)/.test(u.come) && /2 days after starting \(0 of 1\)/.test(u.come), "coming back on day 1, 2 and 7 counts exact days");
  check(/4 visits in all/.test(u.often), "a return within a minute is the same visit (4 visits, not 5)");
  check(/Started from a notification: 1/.test(u.often), "visits from a notification are counted");
  check(/Known for 3 of 4 visits/.test(u.long), "a visit with no close has an unknown length");
  check(/Just looked \(nothing tapped\)\s*1/.test(u.what) && /Morning check-in\s*1/.test(u.what) && /Photos\s*1/.test(u.what), "what each visit did, including the part after a quick return");
  check(/Morning check-in \+ Today's card \+ Photos/.test(u.what), "the most common visits are listed by what was done together");
  check(/Morning \(before 12\)\s*1/.test(u.card) && /Under 30 min\s*1/.test(u.card) && /Done in the same visit it was drawn: 1 \(100%\)/.test(u.card), "when the card was done, how long after keeping it, and in the same visit");
  check(/8:02 am/.test(u.row), `each tester's usual card time is in the table (${u.row.replace(/\s+/g, " ")})`);
  check(/length unknown/.test(u.recent) && /from a notification/.test(u.recent) && /1 error/.test(u.recent), "recent visits show length, notifications and errors");
  check(/Error-free visits: 75%/.test(u.smooth), "error-free visits are a share of all visits");
  check(errors.length === 0, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
