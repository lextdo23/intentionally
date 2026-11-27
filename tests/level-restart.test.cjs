// alex can send someone back to level 1 by hand with every feature kept open (alex 2026-11-27: @sherrie and @alex;
// RESTART_NAMES in push/accounts.js). The phone does it once per restart, keeps every day, and the choice travels with
// the backup. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker, loadWorker, fakeSql } = require("./helpers.cjs");
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const { check, done } = checker();

  // ---- The service: only the named accounts get a restart ----
  const mod = await loadWorker(), made = {};
  const ns = (Cls) => ({ idFromName: (n) => n, get: (n) => made[Cls.name + n] ||= new Cls({ storage: { sql: fakeSql(), deleteAll: async () => {} } }, {}) });
  const book = ns(mod.Accounts).get("book");
  const u = (name) => ({ name, email: name + "@example.com", name_at: 0, made: Date.now() });
  const rs = (await book.publicUser(u("sherrie"))).restart, ra = (await book.publicUser(u("alex"))).restart;
  check(!!rs && rs === ra, "@sherrie and @alex are sent back to level 1");
  check((await book.publicUser(u("mia"))).restart === undefined, "nobody else is");

  // ---- The app ----
  const server = await serve(), b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, serviceWorkers: "block" });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  await ctx.route("https://intentionally-push.lextdo.workers.dev/a/me", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { username: "sherrie", email: "x@example.com", restart: rs }, passkeys: 0 }), headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(server.url);
  const days = {};
  for (let i = 1; i <= 8; i++) days[day(i)] = { sleep: { q: 3 }, card: { id: "x" + i, done: true }, mood: 3 };
  await p.evaluate((days) => {
    localStorage.setItem("daydeck-account", JSON.stringify({ token: "T", user: { username: "sherrie", email: "x@example.com" } }));
    localStorage.setItem("daydeck", JSON.stringify({ v: 1, pillars: ["rest"], started: Object.keys(days).pop(), days, seen: { note: "sleep", testInvite: 1, setup: 1 }, levels: { seen: 5, reset: 2, base: 0, l1: 2, opened: 4 } }));
  }, days);
  await p.reload(); await p.waitForTimeout(2500);
  const r = await p.evaluate(async () => {
    const L = await import("./js/levels.js"), s = JSON.parse(localStorage.getItem("daydeck"));
    return { before: L.level(L.earned() + 2).level, lv: L.level().level, open: L.UNLOCKS.every((x) => L.isOpen(x.id)), days: Object.keys(s.days).length, lvls: s.levels, again: L.restart(s.levels.restart) };
  });
  check(r.before >= 4 && r.lv === 1, `back to level 1 (was ${r.before}, now ${r.lv})`);
  check(r.open, "every level feature stays open");
  check(r.days === 8, "every day is kept");
  check(r.lvls.restart === rs && r.lvls.keepAll === true && r.lvls.opened === 0, "the phone remembers it (so it travels with the backup), and boxes come again");
  check(r.again === false, "it only happens once for each restart");
  check(!!(await p.$("#pill")), "Friends is there at level 1");
  check(!errors.length, "no errors on the page" + (errors.length ? ": " + errors.join("; ") : ""));
  await b.close(); server.close && server.close();
  done();
})();
