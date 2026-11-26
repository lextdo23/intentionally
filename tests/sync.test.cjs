// Backup and sync (js/sync.js, alex 2026-11-20). Two pretend phones signed in to the same account, talking to the
// real backup service (push/accounts.js) run in Node. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker, loadWorker, fakeSql } = require("./helpers.cjs");

const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker();
  const mod = await loadWorker(), worker = mod.default;
  const made = {};
  const ns = (Cls, env) => ({ idFromName: (n) => n, get: (n) => made[Cls.name + n] ||= (() => { const sql = fakeSql(); return new Cls({ storage: { sql, deleteAll: async () => { sql.exec("DELETE FROM b"); } } }, env); })() });
  const env = {}; env.ACCOUNTS = ns(mod.Accounts, env); env.VAULTS = ns(mod.Vault, env);
  // A made-up account, signed in on two phones.
  const book = env.ACCOUNTS.get("book"), t0 = Date.now();
  book.sql.exec("INSERT INTO users (id, handle, email, name, name_l, name_at, made) VALUES ('u1', 'h1', 'mia@example.com', 'mia.k', 'mia.k', ?, ?)", t0, t0);
  const tokA = await book.newSession("u1"), tokB = await book.newSession("u1");
  const vault = () => { const v = Object.entries(made).find(([k]) => k.startsWith("Vault")); return v ? v[1].read() : { data: null }; };
  let down = false;

  const b = await chromium.launch();
  async function phone(tok, data) {
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
    await ctx.route("https://intentionally-push.lextdo.workers.dev/**", async (route) => {
      const req = route.request(), u = new URL(req.url());
      if (!u.pathname.startsWith("/a/")) return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } });
      if (down) return route.abort("internetdisconnected");
      const headers = { Origin: "https://daydeck.day" };
      if (req.headers().authorization) headers.Authorization = req.headers().authorization;
      if (req.postData()) headers["Content-Type"] = "application/json";
      const res = await worker.fetch(new Request("https://service.example" + u.pathname + u.search, { method: req.method(), headers, body: req.postData() || undefined }), env);
      route.fulfill({ status: res.status, contentType: "application/json", body: await res.text(), headers: { "access-control-allow-origin": "*" } });
    });
    const p = await ctx.newPage(); p.errors = []; p.on("pageerror", (e) => p.errors.push(e.message));
    await p.goto(server.url);
    await p.evaluate(([tok, data]) => {
      localStorage.setItem("daydeck", JSON.stringify(data));
      localStorage.setItem("daydeck-account", JSON.stringify({ token: tok, user: { username: "mia.k", email: "mia@example.com" } }));
    }, [tok, data]);
    await p.reload(); await p.waitForTimeout(2600);   // the app backs up quietly a moment after opening
    return p;
  }
  const S = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")));
  const syncNow = (p) => p.evaluate(async () => (await import("./js/sync.js")).now());
  // Change a day the way the app does: patch = fields to set (a whole new day if it didn't exist).
  const edit = (p, k, patch) => p.evaluate(async ([k, patch]) => { const store = await import("./js/store.js"); Object.assign(store.day(k), patch); store.save(); }, [k, patch]);

  // ---- Phone A: someone already using Daydeck signs up. Their days go up. ----
  const daysA = { [day(3)]: { mood: 2, feel: ["tired"] }, [day(2)]: { mood: 4, note: "made-up words", ph: { w: 1 } }, [day(1)]: { mood: 5 } };
  const A = await phone(tokA, { v: 1, started: day(3), days: daysA, pillars: ["Move", "Rest", "Friends"], seen: { note: "sleep", testInvite: 1, notifCard: 1 }, notify: { morning: "08:00" }, tester: { on: false, code: "T-ABCD", queue: [] }, test: { offset: 0 } });
  let v = vault();
  check(v.data && v.data.items["d:" + day(3)] && v.data.items["d:" + day(1)].v.mood === 5, "the days on a phone go up to the backup on their own");
  check(v.data && JSON.stringify(v.data.items["k:pillars"].v) === '["Move","Rest","Friends"]', "pillars go up too");
  check(v.data && !v.data.items["k:tester"] && !v.data.items["k:notify"] && !v.data.items["k:test"], "tester mode, test mode and notifications stay on the phone");
  check(v.data && v.data.items["d:" + day(2)].v.note === "made-up words" && !("ph" in v.data.items["d:" + day(2)].v), "a day's words go up, but its photo note stays on the phone (photos aren't backed up yet)");

  // ---- Phone B: a new phone signs in. The days come back; its empty starting data doesn't win. ----
  const B = await phone(tokB, { v: 1, started: null, days: {}, seen: { note: "sleep", testInvite: 1, notifCard: 1 }, test: { offset: 0 } });
  let sb = await S(B);
  check(sb.days[day(3)] && sb.days[day(3)].mood === 2 && sb.days[day(1)].mood === 5, "a new phone gets the days back");
  check(JSON.stringify(sb.pillars) === '["Move","Rest","Friends"]', "and the pillars, without the new phone's blank start overwriting them");
  check(sb.days[day(2)] && !sb.days[day(2)].ph, "the new phone doesn't think it has a photo it doesn't");
  check(!sb.tester, "the other phone's tester details don't come across");

  // ---- Both phones change different days: both end up with both ----
  await edit(A, day(0), { mood: 3, feel: ["calm"] });
  await edit(B, day(3), { mood: 1 });
  await syncNow(A); await syncNow(B); await syncNow(A);
  const sa = await S(A); sb = await S(B);
  check(sa.days[day(0)] && sb.days[day(0)] && sb.days[day(0)].mood === 3, "a day added on one phone shows up on the other");
  check(sa.days[day(3)].mood === 1 && sb.days[day(3)].mood === 1, "a day changed on the other phone comes back too, without losing anything");
  check(sa.days[day(2)].ph && sa.days[day(2)].ph.w === 1, "phone A keeps its own photo note through all of it");

  // ---- The same day changed on both: the newer change wins ----
  await edit(A, day(1), { mood: 6 });
  await new Promise((r) => setTimeout(r, 20));
  await edit(B, day(1), { mood: 0 });
  await syncNow(A); await syncNow(B); await syncNow(A);
  check((await S(A)).days[day(1)].mood === 0 && (await S(B)).days[day(1)].mood === 0, "when both phones change the same day, the newer change wins on both");

  // ---- Offline: nothing lost, it goes up when back online ----
  down = true;
  await edit(B, day(0), { feel: ["hopeful"] });
  const r1 = await syncNow(B);
  check(r1 && r1.error === "offline", "offline, the phone keeps working and waits");
  await B.evaluate(async () => { (await import("./js/settings.js")).openSettings(() => {}); });
  await B.waitForTimeout(700);
  check(/Backs up when you're online/.test(await B.textContent("#settings")), "Settings says it'll back up when online");
  await B.evaluate(() => document.querySelector('#settings button[aria-label="Back to home"]')?.click()); await B.waitForTimeout(500);
  down = false;
  await syncNow(B); await syncNow(A);
  check(JSON.stringify((await S(A)).days[day(0)].feel) === '["hopeful"]', "back online, the change goes up and reaches the other phone");

  await A.evaluate(async () => { (await import("./js/settings.js")).openSettings(() => {}); });
  await A.waitForTimeout(700);
  check(/Backed up just now/.test(await A.textContent("#settings")), "Settings says \"Backed up just now\"");
  check(/Your account's backup stays/.test(await A.textContent("#settings")), "Delete everything says the account's backup stays");

  // ---- Delete everything on a phone: the backup is kept; that phone signs out ----
  const before = JSON.stringify(vault().data.items["d:" + day(3)]);
  await A.locator("#settings button", { hasText: "Delete everything" }).click();
  await A.locator("#settings button", { hasText: "Tap again" }).click(); await A.waitForTimeout(1500);
  check(!(await A.evaluate(() => (JSON.parse(localStorage.getItem("daydeck-account") || "{}")).token)), "Delete everything signs this phone out");
  await new Promise((r) => setTimeout(r, 4500));
  check(JSON.stringify(vault().data.items["d:" + day(3)]) === before, "and the backup is untouched");

  // ---- Start again (test mode) on phone B: the backup is never wiped ----
  await B.evaluate(async () => { const store = await import("./js/store.js"); store.reset(); });
  await syncNow(B);
  check(vault().data.items["d:" + day(3)] && !vault().data.items["d:" + day(3)].gone, "a phone suddenly emptied never wipes the backup");
  check(!(await B.evaluate(() => (JSON.parse(localStorage.getItem("daydeck-account") || "{}")).token)), "that phone signs out instead, so signing in again brings everything back");

  // ---- Delete the account: the backup is erased ----
  const tokC = await book.newSession("u1");
  const del = await worker.fetch(new Request("https://service.example/a/delete", { method: "POST", headers: { Origin: "https://daydeck.day", Authorization: "Bearer " + tokC, "Content-Type": "application/json" }, body: "{}" }), env);
  check(del.status === 200 && vault().data === null, "deleting the account erases the backup");

  // ---- Tester mode never hears the words ----
  const q = JSON.stringify(((await S(B)).tester || {}).queue || []) + JSON.stringify(((await S(A)).tester || {}).queue || []);
  check(!/made-up words|hopeful|calm/.test(q), "nothing typed is logged");
  check(A.errors.length + B.errors.length === 0, "no errors on either phone" + (A.errors.concat(B.errors).length ? ": " + A.errors.concat(B.errors).join(" | ") : ""));
  await b.close(); server.close(); done();
})();
