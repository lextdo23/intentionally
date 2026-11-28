// Dev accounts (alex 2026-11-28: "make @test a dev account, so it can simulate days, simulate features"). The service
// marks them by username (DEV_NAMES in push/accounts.js); only they get the Dev tools button, they're always test
// accounts too (never in tester data), and the tools write days the way real check-ins do. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker, loadWorker, fakeSql } = require("./helpers.cjs");
const fs = require("fs"), path = require("path");

(async () => {
  const { check, done } = checker();

  // ---- The service: only @test (and names on the list) is dev ----
  const src = fs.readFileSync(path.join(__dirname, "..", "push", "accounts.js"), "utf8");
  check(/const DEV_NAMES = \["test"\]/.test(src), "@test is on the dev list");
  const mod = await loadWorker(), made = {};
  const ns = (Cls) => ({ idFromName: (n) => n, get: (n) => made[Cls.name + n] ||= new Cls({ storage: { sql: fakeSql(), deleteAll: async () => {} } }, {}) });
  const book = ns(mod.Accounts).get("book");
  const u = (name) => ({ name, email: name + "@example.com", name_at: 0, made: Date.now() });
  const t = await book.publicUser(u("test"));
  check(t.dev === true && t.test === true, "@test is a dev account, and a test account too (never in tester data)");
  const m = await book.publicUser(u("mia"));
  check(m.dev === false && m.test === false, "everyone else is neither");
  check((await book.publicUser(u("tester"))).dev === false, "a name that only starts with test isn't dev");

  // ---- The app ----
  const server = await serve(), b = await chromium.launch();
  const sent = [];
  const page = async (user) => {
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
    await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => { if (r.request().url().includes("/t/send")) sent.push(1); r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }); });
    await ctx.route("https://intentionally-push.lextdo.workers.dev/a/me", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user, passkeys: 0 }), headers: { "access-control-allow-origin": "*" } }));
    const p = await ctx.newPage(); p.errors = []; p.on("pageerror", (e) => p.errors.push(e.message));
    await p.goto(server.url);
    await p.evaluate((user) => {
      localStorage.setItem("daydeck-account", JSON.stringify({ token: "T", user }));
      localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: null, days: {}, pillars: ["Love", "Move", "Friends"].map((name) => ({ name, mindsets: [] })), focus: ["Love", "Move"], seen: { note: "sleep", testInvite: 1, setup: 1, notifCard: 1 }, levels: { seen: 1, reset: 2, base: 0, l1: 0, tips: { days: 1, friends: 1, recap: 1, library: 1, own: 1 } },
        tester: { on: true, consent: 99, code: "T-TEST", key: "k", queue: [], sent: 0, all: true } }));
    }, user);
    await p.reload(); await p.waitForTimeout(2500);
    return p;
  };

  const normal = await page({ username: "mia", email: "mia@example.com", test: false, dev: false });
  check(!(await normal.$(".devbtn")), "a normal account never sees the Dev button");
  const tonly = await page({ username: "alex.test", email: "x@example.com", test: true, dev: false });
  check(!(await tonly.$(".devbtn")), "nor does a test account that isn't dev");

  sent.length = 0;
  const p = await page({ username: "test", email: "test@example.com", test: true, dev: true });
  check(!!(await p.$(".devbtn")), "@test sees the Dev button on home");
  await p.click(".devbtn"); await p.waitForTimeout(600);
  check(await p.isVisible("text=Dev tools"), "it opens the Dev tools sheet");

  const r = await p.evaluate(async () => {
    const dev = await import("./js/dev.js"), levels = await import("./js/levels.js"), util = await import("./js/util.js"), store = await import("./js/store.js"), clock = await import("./js/clock.js");
    const out = {};
    const k0 = util.dayKey();
    dev.fullDay(k0); store.save();
    const d = store.get().days[k0];
    out.full = !!(d.sleep && d.card && d.card.id && d.card.done && d.card.felt.length && d.mood != null && d.feel.length && d.dev);
    out.pts = levels.total();
    // Time travel
    const before = clock.now();
    [...document.querySelectorAll(".dev-chip")].find((x) => x.textContent === "+ 1 day").click();
    out.dayMoved = util.dayKey() === util.addDays(k0, 1) && Math.round((clock.now() - before) / 864e5) === 1;
    [...document.querySelectorAll(".dev-chip")].find((x) => x.textContent === "8 pm").click();
    out.hour = new Date(clock.now()).getHours() === 20 && util.dayKey() === util.addDays(k0, 1);
    [...document.querySelectorAll(".dev-chip")].find((x) => x.textContent === "Real time").click();
    out.real = util.dayKey() === k0 && store.get().test.offset === 0;
    // Levels
    dev.setLevel(5); out.lv5 = levels.level().level === 5 && levels.level().into === 0;
    out.libOpen = levels.isOpen("library");
    dev.setStrict(true); dev.setLevel(2);
    out.strict = levels.isOpen("days") && !levels.isOpen("friends") && !levels.isOpen("library");
    dev.setStrict(false); out.allBack = levels.isOpen("library");
    // Simulated past days count, and come off again
    for (let i = 7; i >= 1; i--) dev.fullDay(util.addDays(k0, -i));
    store.get().days["2020-01-01"] = { mood: 3 };   // a real day stays
    out.removed = dev.removeSimulated(); out.realKept = !!store.get().days["2020-01-01"];
    out.syncSkips = JSON.stringify(Object.keys(store.get())).includes("test");
    return out;
  });
  check(r.full, "Full day writes a morning, a drawn and done card, and an evening, like real check-ins");
  check(r.pts >= 6, "and it earns real points (" + r.pts + ")");
  check(r.dayMoved, "+ 1 day moves the app's clock to tomorrow");
  check(r.hour, "8 pm sets the hour on the simulated day");
  check(r.real, "Real time brings the clock back");
  check(r.lv5, "Level 5 jumps straight to the start of level 5");
  check(r.libOpen, "with everything open by default for a dev account");
  check(r.strict, "Real levels locks each feature until its level, like a new person");
  check(r.allBack, "switching it off opens everything again");
  check(r.removed === 8 && r.realKept, "Remove simulated days takes only the made-up days (" + r.removed + ")");
  const q = await p.evaluate(async () => { const t = await import("./js/tester.js"); t.log("x"); await t.send(true); return JSON.parse(localStorage.getItem("daydeck")).tester.queue.length; });
  check(q === 0 && sent.length === 0, "tester mode records and sends nothing from a dev account");
  for (const x of [normal, tonly, p]) check(!x.errors.length, "no errors on the page" + (x.errors.length ? ": " + x.errors.join("; ") : ""));
  if (process.env.SHOTS) { await p.evaluate(() => document.querySelector(".devbtn")?.click()); await p.waitForTimeout(700); await p.screenshot({ path: path.join(__dirname, "shots-dev.png"), fullPage: false }); }
  await b.close(); server.close && server.close();
  done();
})();
