// Card with a friend (alex 2026-11-28): the service keeps which deck card someone kept today (its number and the
// day, never words, gone after 2 days), and friends can read it, so the morning hand can now and then hold a card a
// friend is doing too. Friends only, 18+, never someone blocked, hidden or paused. Runs the real service in Node.
const { checker, loadWorker, fakeSql } = require("./helpers.cjs");

(async () => {
  const { check, done } = checker();
  const mod = await loadWorker(), worker = mod.default;
  const made = {};
  const ns = (Cls, env) => ({ idFromName: (n) => n, get: (n) => made[Cls.name + n] ||= (() => {
    const sql = fakeSql(), kv = {};
    const storage = { sql, deleteAll: async () => {}, setAlarm: async () => {}, get: async (k) => kv[k], put: async (k, v) => { kv[k] = v; } };
    return new Cls({ storage }, env);
  })() });
  const env = { RESEND_API_KEY: "re_made_up_for_testing" };
  env.ACCOUNTS = ns(mod.Accounts, env); env.VAULTS = ns(mod.Vault, env); env.TESTERS = ns(mod.Testers, env); env.KEYS = ns(mod.Keys, env);
  const mail = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com/")) { mail.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
    return realFetch(url, init);
  };
  const realNow = Date.now; let clock = Date.parse("2026-11-28T03:00:00Z"); Date.now = () => clock;
  let ipN = 1;
  const call = async (method, path, body, token) => {
    const headers = { Origin: "https://daydeck.day", "CF-Connecting-IP": "203.0.113." + ipN };
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    const res = await worker.fetch(new Request("https://service.example" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, ...(await res.json()) };
  };
  const person = async (username, adult = true) => {
    ipN++;
    const email = username + "@example.com";
    await call("POST", "/a/code", { email });
    const code = /(\d{6})/.exec([...mail].reverse().find((m) => m.to[0] === email).subject)[1];
    const v = await call("POST", "/a/verify", { email, code });
    const tok = (await call("POST", "/a/finish", { ticket: v.ticket, username })).session;
    const p = { tok, get: (x) => call("GET", x, null, tok), post: (x, b) => call("POST", x, b, tok) };
    if (adult) await p.post("/a/f/profile", { adult: true });
    return p;
  };
  const book = made["Accountsbook"] || env.ACCOUNTS.get("book");
  const mia = await person("mia.k"), sam = await person("sam"), josh = await person("josh_r"), ana = await person("ana"), stranger = await person("stranger");
  await sam.post("/a/f/profile", { name: "Sam" });
  for (const u of ["sam", "josh_r", "ana"]) await mia.post("/a/f/ask", { username: u });
  for (const p of [sam, josh, ana]) await p.post("/a/f/answer", { username: "mia.k", yes: true });
  const day = "2026-11-28";
  const list = async (p, d = day) => (await p.get("/a/f/kept?day=" + d)).kept;

  let r = await sam.post("/a/f/kept", { day, card: 412 });
  check(r.ok, "keeping a card is saved");
  await josh.post("/a/f/kept", { day, card: 38 });
  await stranger.post("/a/f/kept", { day, card: 412 });
  let k = await list(mia);
  check(k.length === 2 && k.some((x) => x.username === "sam" && x.card === 412 && x.name === "Sam") && k.some((x) => x.username === "josh_r" && x.card === 38),
    "friends' kept cards for today, with their name and picture");
  check(!k.some((x) => x.username === "stranger"), "never someone who isn't a friend");
  check(!JSON.stringify(k).includes("@example.com"), "never an email");
  check(book.rows("SELECT * FROM kept").every((x) => Object.keys(x).sort().join() === "at,card,day,user"), "only the card number and the day are kept");
  check((await list(mia, "2026-11-27")).length === 0, "only that day");

  await sam.post("/a/f/kept", { day, card: 37 });
  check((await list(mia)).find((x) => x.username === "sam").card === 37, "a new card replaces the old one");
  await josh.post("/a/f/kept", { day, card: 0 });
  check(!(await list(mia)).some((x) => x.username === "josh_r"), "card 0 takes it back");

  check((await sam.post("/a/f/kept", { day: "2026-11-20", card: 5 })).error === "bad_kept", "not a day long gone");
  check((await sam.post("/a/f/kept", { day: "soon", card: 5 })).error === "bad_kept", "not a made-up day");
  check((await sam.post("/a/f/kept", { day, card: "<b>" })).ok, "words never get in (treated as no card)");
  check(!(await list(mia)).some((x) => x.username === "sam"), "...which takes it back");
  await sam.post("/a/f/kept", { day, card: 412 });

  // Hidden, blocked, paused, not 18+.
  await mia.post("/a/f/hide", { username: "sam" });
  check(!(await list(mia)).some((x) => x.username === "sam"), "not someone whose moments you hid");
  await mia.post("/a/f/hide", { username: "sam", undo: true });
  check((await list(mia)).some((x) => x.username === "sam"), "back once unhidden");
  await ana.post("/a/f/kept", { day, card: 99 });
  await ana.post("/a/f/block", { username: "mia.k" });
  check(!(await list(mia)).some((x) => x.username === "ana"), "never someone who blocked you");
  const samId = book.one("SELECT id FROM users WHERE name = ?", "sam").id;
  book.sql.exec("INSERT INTO paused (user, at) VALUES (?, ?)", samId, clock);
  check(!(await list(mia)).some((x) => x.username === "sam"), "never a paused account");
  book.sql.exec("DELETE FROM paused WHERE user = ?", samId);
  const kid = await person("kid", false);
  check((await kid.post("/a/f/kept", { day, card: 3 })).status === 403, "needs the 18+ tick to send");
  check((await kid.get("/a/f/kept?day=" + day)).status === 403, "...and to read");
  check((await call("GET", "/a/f/kept?day=" + day)).status === 401, "needs signing in");

  // Unfriending, tidying, deleting.
  await josh.post("/a/f/kept", { day, card: 38 });
  await josh.post("/a/f/remove", { username: "mia.k" });
  check(!(await list(mia)).some((x) => x.username === "josh_r"), "removing a friend: their card no longer shows");
  clock = Date.parse("2026-12-01T03:00:00Z");
  await mia.post("/a/f/kept", { day: "2026-12-01", card: 1 });
  check(book.rows("SELECT * FROM kept WHERE day < '2026-11-29'").length === 0, "gone after 2 days");
  await sam.post("/a/f/kept", { day: "2026-12-01", card: 412 });
  book.fForget(samId);
  check(book.rows("SELECT * FROM kept WHERE user = ?", samId).length === 0, "deleting the account takes it");

  globalThis.fetch = realFetch; Date.now = realNow;
  done();
})();
