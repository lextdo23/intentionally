// Tester mode no longer sends bed time, wake time or how rested. Everything else the tester page needs still
// travels, older days are sent once more so the service's copies lose those numbers too, and the tester page
// still fills in. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const FAKE = {}; // ten made-up days
for (let i = 0; i < 10; i++) FAKE[day(i)] = { sleep: { bed: 1380 + i, wake: 420 + i, rested: i % 5, tags: ["Woke in the night", "my own made-up tag"] }, mood: i % 7, feel: ["calm", "made-up feeling"], pil: ["Move"] };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), ctx = await b.newContext(), p = await ctx.newPage();
  const errors = [], sends = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => {
    if (r.request().url().endsWith("/t/send")) sends.push(JSON.parse(r.request().postData()));
    r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } });
  });
  // A tester who joined before this change: has sent before, never had the one-time full resend.
  await p.goto(server.url);
  await p.evaluate((days) => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "x" },
    tester: { on: true, consent: 2, code: "T-TEST", key: "0123456789abcdef0123456789abcdef", queue: [], sent: 1, all: false } })), FAKE);
  await p.reload(); await p.waitForTimeout(1500);

  const first = sends[0], text = JSON.stringify(first || {});
  check(!!first, "the app sends to the service");
  check(first && !/"bed"|"wake"|"rested"/.test(text), "no bed time, wake time or how rested in what's sent");
  check(first && Object.keys(first.days).length === 10, "first send after the change includes every day (so old copies get replaced)");
  const d0 = first && first.days[day(0)];
  check(d0 && d0.sleep && d0.sleep.tags.includes("Woke in the night") && d0.sleep.own === 1, "sleep tags from the list still sent; own tags only as a count");
  check(d0 && d0.mood === 0 && d0.feel.includes("calm") && d0.feelOwn === 1, "mood and listed feelings still sent; own feelings only as a count");
  check(!text.includes("made-up tag") && !text.includes("made-up feeling"), "nothing typed is sent");
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")));
  check(st.tester.lean === true, "the one-time full send is remembered");
  check(st.days[day(0)].sleep.bed === 1380 && st.days[day(0)].sleep.rested === 0, "sleep times and rested are still kept on the phone");

  // Next send: only the last few days again.
  await p.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); });
  await p.evaluate(async () => (await import("./js/tester.js")).send(true)); await p.waitForTimeout(500);
  const later = sends[sends.length - 1];
  check(sends.length >= 2 && Object.keys(later.days).length <= 4, "later sends go back to only the last few days");

  // The tester page still fills in from what's sent now.
  await p.goto(server.url + "testers.html"); await p.waitForFunction(() => window.__render);
  const all = { at: Date.now(), testers: [{ code: "T-TEST", joined: Date.now() - 10 * 864e5, seen: Date.now(), phone: "iPhone iOS 26", version: "d26", started: first.started, nudges: "{}" }],
    days: Object.entries(first.days).map(([k, v]) => ({ code: "T-TEST", day: k, data: JSON.stringify(v) })), events: [] };
  const res = await p.evaluate((d) => { try { window.__render(d); } catch (e) { return e.message; } return { sections: document.querySelectorAll("#out section").length, mornings: document.querySelectorAll(".cell .a.on").length }; }, all);
  check(res && res.sections > 10, "tester page still shows all its sections");
  check(res && res.mornings === 10, "tester page still marks each morning as done");
  check(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
