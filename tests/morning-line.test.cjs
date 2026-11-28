// The morning notification (alex 2026-11-28, js/morning.js): which line each morning gets, the time it comes, the
// words the service worker shows (and when friend news keeps it quiet), and that a tap lands on the answer in Your
// days with the spotlight. Made-up data only.
process.env.TZ = "Australia/Sydney";
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), vm = require("vm");
const { serve, checker } = require("./helpers.cjs");

const K = "2026-11-28";
const at = (s) => new Date(s + "+11:00").getTime();
const add = (k, n) => { const d = new Date(k + "T12:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, timezoneId: "Australia/Sydney" });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(server.url);
  const base = (o = {}) => ({ v: 1, started: add(K, -2), seen: { note: "sleep", testInvite: 1, setup: 1, notifCard: 1 }, levels: { seen: 1, keepAll: true, reset: 2, l1: 0 }, notify: { am: { on: true, t: "08:00" }, pm: { on: true, t: "21:00" }, card: { on: true } }, days: {}, ...o });
  const line = async (data, k = K) => {
    await p.evaluate((data) => { localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); localStorage.setItem("daydeck", JSON.stringify(data)); }, data);
    await p.reload(); await p.waitForTimeout(300);
    return p.evaluate(async (k) => { const m = await import("./js/morning.js"), store = await import("./js/store.js"); return m.pick(store.get(), k); }, k);
  };
  const say = (l) => `${l.title} / ${l.body} -> ${l.go}`;

  // New people: yesterday, in a line.
  let l = await line(base({ days: { [add(K, -1)]: { mood: 4, feel: ["calm", "tired"] } } }));
  check(l.kind === "yesterday" && l.title === "Yesterday you felt calm" && l.body === "Day 3 of your first week." && l.go === "today", `day 3: yesterday in a line (${say(l)})`);
  l = await line(base({ days: { [add(K, -1)]: { mood: 3, feel: ["anxious"] } } }));
  check(l.title === "Yesterday felt okay", `a hard feeling is never put on the lock screen (${say(l)})`);
  l = await line(base({ levels: { seen: 1, reset: 2, l1: 0 }, days: { [add(K, -1)]: { mood: 4 } } }));
  check(l.kind === "level" && l.title === "Your days opens at your next level" && l.go === "today", `a level that opens with a full day (${say(l)})`);
  l = await line(base({ days: {} }));
  check(l.kind === "plain" && l.title === "How did you sleep?", `nothing noted yet: the plain line (${say(l)})`);

  // Hard days: comfort only, even with a good memory.
  l = await line(base({ started: "2026-10-01", days: { [add(K, -1)]: { mood: 1 }, [add(K, -28)]: { mood: 6, card: { id: 1, done: true } } } }));
  check(l.title === "Yesterday took a lot" && l.body === "Today can be a smaller one.", `after a hard day: comfort, no memory (${say(l)})`);

  // Memories: good days only, and the tap opens that day.
  l = await line(base({ started: "2026-10-01", days: { [add(K, -1)]: { mood: 4 }, [add(K, -28)]: { mood: 5, pil: ["Friends"] } } }));
  check(l.kind === "memory4" && l.title === "Four weeks ago today" && l.body === "A really good day. See what you did." && l.go === "day:" + add(K, -28), `four weeks ago (${say(l)})`);
  l = await line(base({ started: "2026-10-01", days: { [add(K, -1)]: { mood: 4 }, [add(K, -28)]: { mood: 2 } } }));
  check(l.kind !== "memory4", "a low day four weeks ago never comes back");
  l = await line(base({ started: "2026-10-01", days: { [add(K, -1)]: { mood: 4 }, [add(K, -7)]: { mood: 6 } } }));
  check(l.title === "This time last week, you felt great", `this time last week (${say(l)})`);

  // Not the same kind two mornings running when something else is true.
  l = await line(base({ started: "2026-10-01", notify: { am: { on: true, t: "08:00" }, pm: { on: true, t: "21:00" }, card: { on: true }, lines: { [add(K, -1)]: "memory" } }, days: { [add(K, -1)]: { mood: 4 }, [add(K, -28)]: { mood: 5 } } }));
  check(l.group === "yesterday", `yesterday morning was a memory, so today isn't (${say(l)})`);

  // Findings, from two months of sample days with Your days open.
  await p.evaluate(() => { localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); });
  const all = await p.evaluate(async () => {
    const sm = await import("./js/sample.js"), store = await import("./js/store.js"), m = await import("./js/morning.js"), u = await import("./js/util.js");
    const s = store.get(); s.days = sm.makeSample(60); s.started = u.addDays(u.dayKey(), -60); s.levels = { seen: 9, keepAll: true, reset: 2, l1: 0 }; s.seen = { note: "sleep", testInvite: 1, setup: 1, notifCard: 1 };
    s.days[u.addDays(u.dayKey(), -1)].mood = 4; store.save();
    return m.lines(s, u.dayKey()).map((x) => [x.kind, x.title, x.go]);
  });
  const kinds = all.map((x) => x[0]);
  check(kinds.some((x) => ["sleep", "helps", "acts", "lifts"].includes(x)), `sample days give findings (${kinds.join(", ")})`);
  check(all.filter((x) => x[2].startsWith("days:")).every((x) => /^days:[BCDE](:|$)/.test(x[2])), "every finding names a Your days section");
  check(all.every((x) => !/card/i.test(x[1])), "no line mentions cards");

  // Tapping lands on the answer: each section's line is on the page and the spotlight runs.
  for (const go of [...new Set(all.map((x) => x[2]).filter((g) => g.startsWith("days:")))]) {
    await p.goto(server.url + "?from=nudge&go=" + encodeURIComponent(go)); await p.waitForTimeout(2600);
    if (process.env.DEBUG) console.log(await p.evaluate(() => [document.body.className, !!document.querySelector(".sheet-host"), document.querySelector(".sheet-host") && document.querySelector(".sheet-host").innerText.slice(0, 80)]));
    const r = await p.evaluate(() => { const d = document.querySelector("#days"), on = d && d.querySelector(".spot-on"); return { open: !!(d && d.classList.contains("open")), spot: !!(d && d.classList.contains("spot")), on: on ? on.textContent.slice(0, 80) : "", top: on ? Math.round(on.getBoundingClientRect().top) : -1 }; });
    check(r.open && r.spot && r.on && r.top > 0 && r.top < 700, `${go}: Your days opens on the answer, spotlit ("${r.on}" at ${r.top})`);
    await p.waitForTimeout(2200);
    check(!(await p.evaluate(() => document.querySelector("#days").classList.contains("spot"))), `${go}: the page comes back after about 2 seconds`);
  }
  await p.goto(server.url + "?from=nudge&go=" + encodeURIComponent("day:" + (await p.evaluate(async () => (await import("./js/util.js")).addDays((await import("./js/util.js")).dayKey(), -28)))));
  await p.waitForTimeout(2600);
  check(await p.locator(".sheet-host").count() === 1, "a memory opens that day");
  check(!(await p.evaluate(() => location.search)).includes("go="), "and tidies the address");

  // The time: their usual morning check-in plus 10 minutes, once there's a week of them.
  const usual = async (n, hhmm, fixed) => p.evaluate(async ({ n, hhmm, fixed, K }) => {
    const m = await import("./js/morning.js"), days = {};
    for (let i = 0; i < n; i++) { const d = new Date(K + "T12:00"); d.setDate(d.getDate() - i); const [h, mm] = hhmm.split(":").map(Number); d.setHours(h, mm + i % 3 * 5, 0, 0); days[d.toISOString().slice(0, 10)] = { sleep: { bed: 0, wake: 0, at: d.getTime() } }; }
    return m.usualTime({ days, notify: { am: { t: "08:00", fixed } } }, K);
  }, { n, hhmm, fixed, K });
  check(await usual(10, "07:15") === "07:30", "a week of mornings around 7:20: the nudge comes at 7:30");
  check(await usual(5, "07:15") === "08:00", "under a week: the Settings time");
  check(await usual(10, "07:15", true) === "08:00", "a time picked in Settings wins");
  check(await usual(10, "13:50") === "13:30", "never later than 1:30pm (from 2pm it reads as the evening)");
  check(!errors.length, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close();

  // ---- The service worker ----
  const src = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
  const swRun = async (plans, t, ev = "push", data) => {
    const shown = [], store = { ...plans }, handlers = {}, opened = [], deleted = [];
    const caches = { open: async () => ({ match: async (k) => (store[k] ? { json: async () => store[k] } : undefined), put: async () => {}, delete: async (k) => { deleted.push(k); }, addAll: async () => {} }), keys: async () => [] };
    const self = { addEventListener: (n, f) => (handlers[n] = f), registration: { showNotification: async (title, o) => shown.push([title, o.body, o.tag, o.data]) }, clients: { matchAll: async () => [], openWindow: async (u) => opened.push(u) }, skipWaiting() {} };
    vm.runInNewContext(src, { self, caches, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [t])); } static now() { return t; } }, fetch: async () => ({}), Response: class { constructor(b) { this.b = b; } async json() { return JSON.parse(this.b); } }, URL, Math, JSON, Promise, Infinity, console, encodeURIComponent, String });
    let w; handlers[ev](ev === "push" ? { waitUntil: (x) => (w = x) } : { notification: { close() {}, tag: "daydeck-am", data }, waitUntil: (x) => (w = x) }); await w;
    return { shown, opened, deleted };
  };
  const T = at(K + "T07:40:00"), plan = { k: K, title: "Four weeks ago today", body: "A really good day. See what you did.", go: "day:2026-10-31", kind: "memory4" };
  let r = await swRun({ morning: plan }, T);
  check(r.shown[0] && r.shown[0][0] === "Four weeks ago today" && r.shown[0][3].go === "day:2026-10-31", `the morning shows today's line (${JSON.stringify(r.shown[0])})`);
  r = await swRun({ morning: { ...plan, k: add(K, -1) } }, T);
  check(r.shown[0] && r.shown[0][0] === "Good morning", "a line worked out for another day is never used");
  r = await swRun({ morning: plan, "friend-last": { t: T - 30 * 60e3, title: "Mia shared a moment", body: "" } }, T);
  check(r.shown.length === 0, "friend news in the last 90 minutes, not seen yet: the morning stays quiet");
  r = await swRun({ morning: plan, "friend-last": { t: T - 3 * 3600e3, title: "Mia shared a moment", body: "" } }, T);
  check(r.shown[0] && r.shown[0][0] === "Mia shared a moment" && r.shown[0][2] === "daydeck-friends" && r.deleted.includes("friend-last"), "older friend news not seen yet: its words become the morning's, once");
  r = await swRun({}, T, "notificationclick", { kind: "am", go: "days:B", line: "sleep" });
  check(r.opened[0] === "./?from=nudge&go=days%3AB", `a tap opens Daydeck on the answer (${r.opened[0]})`);
  done();
})();
