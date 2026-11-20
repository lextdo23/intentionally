// Tester service: at most 60 testers at once, so nobody can flood it with made-up testers.
// Runs the real push/worker.js in Node with a stand-in for Cloudflare's storage. Made-up data only.
const fs = require("fs"), path = require("path"), os = require("os");
const { DatabaseSync } = require("node:sqlite");
const { checker, loadWorker } = require("./helpers.cjs");

// Cloudflare's SQL storage, played by Node's built-in SQLite.
function fakeSql() {
  const db = new DatabaseSync(":memory:");
  return { exec(q, ...args) {
    if (!args.length && q.trim().split(";").filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [], one: () => null }; }
    const st = db.prepare(q), rows = /^\s*select/i.test(q) ? st.all(...args) : (st.run(...args), []);
    return { toArray: () => rows, one: () => rows[0] };
  } };
}

(async () => {
  const { check, done } = checker();
  // Load the real worker, with Cloudflare's base class swapped for a tiny stand-in.
  const mod = await loadWorker();
  const store = new mod.Testers({ storage: { sql: fakeSql() } }, {});
  const env = { TESTERS: { idFromName: () => "all", get: () => store }, TESTER_KEY: "made-up-password-for-tests" };
  const hex = (n) => n.toString(16).padStart(32, "0");
  const code = (n) => "T-" + n.toString(36).toUpperCase().padStart(4, "0");
  const send = (n, extra = {}) => mod.default.fetch(new Request("https://service.test/t/send", { method: "POST",
    body: JSON.stringify({ code: code(n), key: hex(n + 1), phone: "Test phone", version: "d30", started: "2026-11-10", days: { "2026-11-15": { mood: 3 } }, events: [[Date.now(), "open"]], ...extra }) }), env);

  let ok = 0;
  for (let n = 1; n <= 60; n++) if ((await send(n)).status === 200) ok++;
  check(ok === 60, `the first 60 testers are all taken in (${ok})`);
  const r61 = await send(61);
  check(r61.status === 403 && (await r61.json()).error === "full", "tester 61 is turned away as full");
  check(store.sql.exec("SELECT COUNT(*) AS c FROM testers").one().c === 60, "nothing from tester 61 is stored");
  check(store.sql.exec("SELECT COUNT(*) AS c FROM days WHERE code = ?", code(61)).one().c === 0, "no days stored for tester 61");
  check((await send(5)).status === 200, "a tester already in can still send when it's full");
  const rm = await mod.default.fetch(new Request("https://service.test/t/remove", { method: "POST", headers: { Authorization: "Bearer " + env.TESTER_KEY }, body: JSON.stringify({ code: code(7) }) }), env);
  check(rm.status === 200, "removing a tester works");
  check((await send(61)).status === 200, "removing a tester frees a place for someone new");
  check((await send(62)).status === 403, "and then it's full again");
  done();
})();
