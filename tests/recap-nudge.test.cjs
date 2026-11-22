// Weekly recap notifications (alex 2026-11-22). Sunday: "Weekly recap tonight" at the evening nudge time (7pm if
// evenings are off) until the day is ended. Monday: "Weekly recap ready" at the morning nudge time (8am if mornings
// are off), only while the recap still waits. Checks the times the phone works out, the words the service worker
// shows (and when it stays quiet), and the home line. Made-up data only.
process.env.TZ = "Australia/Sydney";
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), vm = require("vm");
const { serve, checker } = require("./helpers.cjs");

const MON = "2026-11-23", SUN = "2026-11-29";
const at = (s) => new Date(s + "+11:00").getTime();            // Sydney summer time
const week = (mood = 3, sunday = false) => {
  const d = {}; ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"].forEach((k) => (d[k] = { mood }));
  if (sunday) d[SUN] = { mood };
  return d;
};

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, timezoneId: "Australia/Sydney" });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(server.url);

  // Sets up a pretend phone, then asks for the recap times at a given moment.
  const times = async (data, when) => {
    await p.evaluate((data) => { localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); localStorage.setItem("daydeck", JSON.stringify(data)); }, data);
    await p.reload(); await p.waitForTimeout(300);
    return p.evaluate(async (when) => {
      const n = await import("./js/notify.js"), store = await import("./js/store.js");
      return n.recapTimes(store.get(), when).map((x) => [x.kind, new Date(x.t).toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" })]);
    }, when);
  };
  const base = (o = {}) => ({ v: 1, started: "2026-11-10", seen: { note: "sleep" }, levels: { seen: 3 }, notify: { am: { on: true, t: "08:00" }, pm: { on: true, t: "21:00" }, card: { on: true } }, days: week(), ...o });
  const show = (r) => JSON.stringify(r);

  let r = await times(base(), at("2026-11-29T12:00:00"));
  check(show(r) === show([["recap-sun", "Sun 9:00 pm"], ["recap-mon", "Mon 8:00 am"]]), `Sunday midday, day not ended: heads-up at the evening nudge, catch-up Monday morning (${show(r)})`);
  r = await times(base({ days: week(3, true) }), at("2026-11-29T20:00:00"));
  check(show(r) === show([["recap-mon", "Mon 8:00 am"]]), `Sunday ended: no heads-up, Monday catch-up still planned (${show(r)})`);
  r = await times(base({ days: week(3, true), wrap: { seen: { [MON]: 1 } } }), at("2026-11-29T21:30:00"));
  check(r.length === 0, `recap opened: nothing more for that week (${show(r)})`);
  r = await times(base({ notify: { am: { on: true, t: "07:30" }, pm: { on: false, t: "21:00" }, card: { on: true } } }), at("2026-11-29T12:00:00"));
  check(show(r) === show([["recap-sun", "Sun 7:00 pm"], ["recap-mon", "Mon 7:30 am"]]), `evenings off: Sunday's at 7pm; Monday's at their 7:30 morning time (${show(r)})`);
  r = await times(base({ notify: { am: { on: false, t: "08:00" }, pm: { on: true, t: "20:15" }, card: { on: true } } }), at("2026-11-29T12:00:00"));
  check(show(r) === show([["recap-sun", "Sun 8:15 pm"], ["recap-mon", "Mon 8:00 am"]]), `mornings off: Monday's at 8am (${show(r)})`);
  r = await times(base({ notify: { am: { on: false, t: "08:00" }, pm: { on: false, t: "21:00" }, card: { on: true } } }), at("2026-11-29T12:00:00"));
  check(r.length === 0, "nudges off: no recap notifications");
  r = await times(base({ started: "2026-11-25" }), at("2026-11-29T12:00:00"));
  check(r.length === 0, "first week of use (no recap until day 7): no notifications");
  r = await times(base(), at("2026-11-30T07:00:00"));
  check(show(r[0]) === show(["recap-mon", "Mon 8:00 am"]), `Monday 7am, Sunday never ended: catch-up at 8am for last week (${show(r)})`);
  r = await times(base({ days: {} }), at("2026-11-29T12:00:00"));
  check(show(r) === show([["recap-sun", "Sun 9:00 pm"]]), `nothing noted yet: heads-up only (ending Sunday makes the recap), no catch-up yet (${show(r)})`);


  // Home line wording.
  await p.evaluate(() => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: "2026-01-01", seen: { note: "sleep" }, levels: { seen: 3 },
    days: Object.fromEntries(Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (i + 1) * 864e5 - 4 * 3600e3); return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, { mood: 3 }]; })) })));
  await p.reload(); await p.waitForTimeout(2500);
  check(await p.locator(".wr-home.ready").innerText().catch(() => "") .then((t) => t.includes("Your weekly recap is ready")), "home says \"Your weekly recap is ready\"");

  // ?open=recap (a tapped Monday notification) opens the recap itself.
  await p.goto(server.url + "?from=nudge&open=recap"); await p.waitForTimeout(3000);
  check(await p.locator(".wr").count() === 1, "tapping Monday's notification opens the recap");
  check(!(await p.evaluate(() => location.search)).includes("open=recap"), "and tidies the address");
  check(!errors.length, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close();

  // ---- The service worker's words ----
  const src = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
  const swRun = async (plans, t) => {
    const shown = [], store = { ...plans }, handlers = {};
    const caches = { open: async () => ({ match: async (k) => (store[k] ? { json: async () => store[k] } : undefined), put: async () => {}, delete: async () => {}, addAll: async () => {} }), keys: async () => [] };
    const self = { addEventListener: (n, f) => (handlers[n] = f), registration: { showNotification: async (title, o) => shown.push([title, o.body, o.tag]) }, clients: {}, skipWaiting() {} };
    vm.runInNewContext(src, { self, caches, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [t])); } static now() { return t; } }, fetch: async () => ({}), Response: class { constructor(b) { this.b = b; } async json() { return JSON.parse(this.b); } }, URL, Math, JSON, Promise, Infinity, console });
    let w; handlers.push({ waitUntil: (x) => (w = x) }); await w;
    return shown;
  };
  const T = at("2026-11-29T21:00:00");
  let s = await swRun({ recap: { at: [{ t: T, kind: "recap-sun", done: false }] } }, T + 5000);
  check(show(s[0]) === show(["Weekly recap tonight", "End your day to see how your week went.", "daydeck-recap"]), `Sunday's words (${show(s)})`);
  s = await swRun({ recap: { at: [{ t: T, kind: "recap-mon", done: false }] } }, T);
  check(show(s[0]) === show(["Weekly recap ready", "A look back at Monday to Sunday, when you've got a minute.", "daydeck-recap"]), `Monday's words (${show(s)})`);
  s = await swRun({ recap: { at: [{ t: T, kind: "recap-sun", done: true }] } }, T);
  check(s.length === 0, "ended or opened since it was planned: stays quiet");
  s = await swRun({ recap: { at: [{ t: T, kind: "recap-sun", done: false }] }, card: { at: [T - 10 * 60e3], task: "Walk", done: false } }, T - 10 * 60e3);
  check(s[0] && s[0][0] === "Today's card", "a card reminder planned closer to now keeps its own words");
  s = await swRun({}, T);
  check(s[0] && s[0][0] === "Good evening", "no recap planned: the usual evening words");
  done();
})();
