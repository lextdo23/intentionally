// Tester page: wrongly shaped records (a bug, or someone sending junk) are skipped instead of blanking the page,
// the Remove buttons always show, and nothing sent by testers runs as code. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

const X = '<img src=x onerror="window.__pwn=1">';
const now = Date.now();
const T = (code) => ({ code, joined: now - 5 * 864e5, seen: now, phone: X.slice(0, 30), version: X.slice(0, 12), started: null, nudges: JSON.stringify({ am: "08:00", pm: "21:00" }) });
const ev = (code, name, val, i = 0) => ({ code, t: now - i * 1000, name, val: val === undefined ? null : JSON.stringify(val) });
const GOOD = [ev("T-GOOD", "card_draw", [1, 2, 3]), ev("T-GOOD", "card_keep", { id: 1 }), ev("T-GOOD", "card_how", { id: 1, how: 3 }),
  ev("T-GOOD", "card_thumb", { id: 1, v: 1, p: "Move", m: [] }), ev("T-GOOD", "pm_done", { secs: 30 }), ev("T-GOOD", "error", X), ev("T-GOOD", "helps_seen", [X])];
const BADEV = [ev("T-JUNK", "card_keep", null), ev("T-JUNK", "card_how", { id: 1, how: 9 }), ev("T-JUNK", "card_thumb", { id: "x" }),
  ev("T-JUNK", "card_smaller", "nope"), ev("T-JUNK", "card_draw", "nope"), { code: "T-JUNK", t: now, name: "open", val: "{not json" }];
const day = (code, data) => ({ code, day: "2026-11-15", data: typeof data === "string" ? data : JSON.stringify(data) });
const GOODDAYS = [day("T-GOOD", { mood: 4, feel: ["calm"], sleep: { tags: ["Woke in the night"], own: 0 } })];
const BADDAYS = [day("T-JUNK", { mood: 2, feel: "a string, not a list" }), { code: "T-JUNK", day: "2026-11-16", data: "{broken" }, day("T-JUNK", { sleep: { tags: 5 } })];

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), p = await b.newPage(), errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(server.url + "v2/testers.html"); await p.waitForFunction(() => window.__render);
  const look = () => p.evaluate(() => ({ sections: document.querySelectorAll("#out section").length, remove: document.querySelectorAll(".tcard .rm").length,
    status: document.getElementById("status").textContent, pwn: window.__pwn || 0, imgs: document.querySelectorAll("#out img").length }));
  const show = (d) => p.evaluate((d) => { try { window.__render(d); return null; } catch (e) { return e.message; } }, d);

  check(await show({ at: now, testers: [T("T-GOOD")], days: GOODDAYS, events: GOOD }) === null, "good data shows without errors");
  const a = await look();
  check(a.sections > 10 && a.remove === 1, "every section and the Remove button show for good data");
  check(!/skipped/.test(a.status), "nothing is skipped when the data is good");

  check(await show({ at: now, testers: [T("T-GOOD"), T("T-JUNK")], days: GOODDAYS.concat(BADDAYS), events: GOOD.concat(BADEV) }) === null, "junk mixed in doesn't stop the page");
  const c = await look();
  check(c.sections === a.sections, "every section still shows with junk mixed in");
  check(c.remove === 2, "both testers have a Remove button, so the junk sender can be removed");
  check(/9 records skipped/.test(c.status), `the page says how many records were skipped (${c.status.split("·").pop().trim()})`);
  check(c.pwn === 0 && c.imgs === 0, "nothing sent by testers runs as code");
  // Text sent where a number belongs (the "own words" count) must never become part of the page.
  const PLANT = '"><img src=x onerror="window.__pwn=1"><b id="planted">';
  check(await show({ at: now, testers: [T("T-GOOD"), T("T-JUNK")], days: GOODDAYS.concat([day("T-JUNK", { mood: 3, feel: [], feelOwn: PLANT, sleep: { tags: [], own: PLANT } })]), events: GOOD }) === null, "text in a number's place doesn't stop the page");
  await p.waitForTimeout(300);
  const d = await p.evaluate(() => ({ planted: !!document.getElementById("planted"), imgs: document.querySelectorAll("#out img").length, pwn: window.__pwn || 0,
    line: [...document.querySelectorAll("#out .note")].map((n) => n.textContent).find((t) => /own words/.test(t)) || "" }));
  check(!d.planted && d.imgs === 0 && d.pwn === 0, "text sent in place of a number never becomes part of the page");
  check(/own words 0 times/.test(d.line), "only real numbers are counted (" + d.line.slice(0, 60) + "…)");
  check(await p.evaluate(() => /of 60 places used/.test(document.getElementById("out").textContent)), "the Testers tab shows how many of the 60 places are used");
  check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
