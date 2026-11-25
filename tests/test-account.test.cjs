// alex's own test accounts (alex 2026-11-22): the service marks them (TEST_ACCOUNTS in push/accounts.js, kept as
// scrambled emails), every feature is open whatever the level, and tester mode never sends anything from them.
// Made-up data only.
const { chromium } = require("playwright");
const { serve, checker, loadWorker, fakeSql } = require("./helpers.cjs");
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const { check, done } = checker();

  // ---- The service: only accounts on the list are marked test ----
  const src = fs.readFileSync(path.join(__dirname, "..", "push", "accounts.js"), "utf8");
  const scrambled = (e) => crypto.createHash("sha256").update("daydeck:" + e).digest("base64url");
  check(/const TEST_ACCOUNTS = \["[A-Za-z0-9_-]{43}"/.test(src), "alex's test account is on the list, scrambled (no email in the public code)");
  const mod = await loadWorker(), made = {};
  const env = { TEST_ACCOUNTS: scrambled("tester@example.com") };
  const ns = (Cls) => ({ idFromName: (n) => n, get: (n) => made[Cls.name + n] ||= new Cls({ storage: { sql: fakeSql(), deleteAll: async () => {} } }, env) });
  const book = ns(mod.Accounts).get("book");
  const u = (email) => ({ name: "x", email, name_at: 0, made: Date.now() });
  check((await book.publicUser(u("Tester@Example.com "))).test === true, "an account on the list is marked test (capitals and spaces don't matter)");
  check((await book.publicUser(u("mia@example.com"))).test === false, "everyone else isn't");

  // ---- The app ----
  const server = await serve(), b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  const sent = [];
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => { if (r.request().url().includes("/t/send")) sent.push(1); r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }); });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/a/me", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { username: "alex.test", email: "x@example.com", test: true }, passkeys: 1 }), headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(server.url);
  const days = { [day(1)]: { mood: 3, sleep: { q: 3 } } };
  await p.evaluate((days) => {
    localStorage.setItem("daydeck-account", JSON.stringify({ token: "T", user: { username: "alex.test", email: "x@example.com", test: true } }));
    localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days)[0], days, seen: { note: "sleep" }, levels: { seen: 1, reset: 2, base: 0 },
      tester: { on: true, consent: 99, code: "T-TEST", key: "k", queue: [], sent: 0, all: true } }));
  }, days);
  await p.reload(); await p.waitForTimeout(2000);
  check(!!(await p.$("#pill")), "a test account at level 1 gets Friends (the pill) straight away");
  const open = await p.evaluate(async () => { const l = await import("./js/levels.js"); return l.UNLOCKS.every((x) => l.isOpen(x.id)); });
  check(open, "and every level-locked feature is open");
  const q = await p.evaluate(async () => { const t = await import("./js/tester.js"); t.log("x"); await t.send(true); return JSON.parse(localStorage.getItem("daydeck")).tester.queue.length; });
  check(q === 0 && sent.length === 0, "tester mode records and sends nothing from a test account");
  check(!errors.length, "no errors on the page" + (errors.length ? ": " + errors.join("; ") : ""));
  await b.close(); server.close && server.close();
  done();
})();
