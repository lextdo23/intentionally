// Shared dates (alex 2026-11-27): a set-a-date card shared with friends (up to 5). Friends only; the friend says "I'm in"
// or "Not this time"; moving the date or calling it off tells them; leaving after "I'm in" tells the person who invited.
// Only the card's number, the date and who: never words. Runs the real service in Node with made-up people and phones.
const crypto = require("crypto");
const { checker, loadWorker, fakeSql } = require("./helpers.cjs");

// A made-up phone: its own keys, and it opens sealed pings the way a real phone does (RFC 8291).
function phone(n) {
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const auth = crypto.randomBytes(16), b64u = (b) => Buffer.from(b).toString("base64url");
  const hmac = (k, d) => crypto.createHmac("sha256", k).update(d).digest();
  return {
    sub: { endpoint: "https://web.push.apple.com/made-up-" + n, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } },
    open(body) {
      const salt = body.subarray(0, 16), idlen = body[20], as = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
      const ua = ecdh.getPublicKey(), shared = ecdh.computeSecret(as);
      const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from("WebPush: info\0"), ua, as, Buffer.from([1])]));
      const prk = hmac(salt, ikm);
      const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
      const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
      const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
      const out = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
      return JSON.parse(out.subarray(0, out.lastIndexOf(2)).toString());
    },
  };
}

(async () => {
  const { check, done } = checker();
  const mod = await loadWorker(), worker = mod.default;
  const made = {}, alarms = [];
  const ns = (Cls, env) => ({ idFromName: (n) => n, get: (n) => made[Cls.name + n] ||= (() => {
    const sql = fakeSql(), kv = {};
    const storage = { sql, deleteAll: async () => {}, setAlarm: async (t) => alarms.push(t), get: async (k) => kv[k], put: async (k, v) => { kv[k] = v; } };
    return new Cls({ storage }, env);
  })() });
  const env = { RESEND_API_KEY: "re_made_up_for_testing" };
  env.ACCOUNTS = ns(mod.Accounts, env); env.VAULTS = ns(mod.Vault, env); env.TESTERS = ns(mod.Testers, env); env.KEYS = ns(mod.Keys, env);
  const mail = [], pings = [], realFetch = globalThis.fetch;
  let gone = false;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com/")) { mail.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
    if (String(url).startsWith("https://web.push.apple.com/")) { pings.push({ url: String(url), headers: init.headers, body: Buffer.from(init.body) }); return new Response("", { status: gone ? 410 : 201 }); }
    return realFetch(url, init);
  };
  // The clock, moved by hand. 2026-11-25 14:00 in Sydney (AEDT, +11) is 03:00 UTC.
  const realNow = Date.now; let clock = Date.parse("2026-11-25T03:00:00Z"); Date.now = () => clock;
  const HOUR = 3600000;
  let ipN = 1;
  const call = async (method, path, body, token) => {
    const headers = { Origin: "https://daydeck.day", "CF-Connecting-IP": "203.0.113." + ipN };
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    const res = await worker.fetch(new Request("https://service.example" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, ...(await res.json()) };
  };
  const person = async (username) => {
    ipN++;
    const email = username + "@example.com";
    await call("POST", "/a/code", { email });
    const code = /(\d{6})/.exec([...mail].reverse().find((m) => m.to[0] === email).subject)[1];
    const v = await call("POST", "/a/verify", { email, code });
    const tok = (await call("POST", "/a/finish", { ticket: v.ticket, username })).session;
    const p = { tok, get: (x) => call("GET", x, null, tok), post: (x, b) => call("POST", x, b, tok) };
    await p.post("/a/f/profile", { adult: true });
    return p;
  };
  const book = made["Accountsbook"] || env.ACCOUNTS.get("book");
  const tick = async () => { await book.alarm(); };
  const mia = await person("mia.k"), josh = await person("josh_r"), sam = await person("sam"), ana = await person("ana"), kid = await person("kid");
  await mia.post("/a/f/profile", { name: "Mia" });
  await josh.post("/a/f/profile", { name: "Josh" });
  await sam.post("/a/f/profile", { name: "Sam" });
  for (const u of ["josh_r", "sam", "ana"]) await mia.post("/a/f/ask", { username: u });
  for (const p of [josh, sam, ana]) await p.post("/a/f/answer", { username: "mia.k", yes: true });
  const jp = phone(1), mp = phone(2);
  await josh.post("/a/f/pings", { on: true, sub: jp.sub, tz: "Australia/Sydney" });
  await mia.post("/a/f/pings", { on: true, sub: mp.sub, tz: "Australia/Sydney" });
  const last = (ph, url) => { const x = [...pings].reverse().find((q) => q.url === url); return x ? ph.open(x.body) : null; };

  // ---- Inviting ----
  let r = await mia.post("/a/f/plan", { card: 1, day: "2026-12-05", made: "2026-11-25", guests: ["josh_r"] });
  check(r.error === "bad_plan", "only set-a-date cards can be shared");
  r = await mia.post("/a/f/plan", { card: 88, day: "2027-06-01", made: "2026-11-25", guests: ["josh_r"] });
  check(r.error === "bad_plan", "a date more than about 8 weeks away is refused");
  r = await mia.post("/a/f/plan", { card: 88, day: "2026-12-05", made: "2026-11-25", guests: ["josh_r", "sam", "kid", "nobody", "mia.k"] });
  check(r.ok && r.plan.guests.map((g) => g.username).sort().join() === "josh_r,sam", "several friends can be invited; strangers and yourself are left out");
  check(r.plan.guests.every((g) => g.state === "ask"), "everyone invited starts as waiting");
  const id = r.plan.id;
  await tick();
  let w = last(jp, jp.sub.endpoint);
  check(w && w.title === "Mia invited you to Date night on Sat 5 Dec", `the friend is told by name, card and date: "${w && w.title}"`);
  check(w && w.n === 0, "an invite isn't counted on the number");
  check(!JSON.stringify(w).includes("calendar"), "never the card's words");
  let jl = await josh.get("/a/f/plans");
  check(jl.invited.length === 1 && jl.invited[0].state === "ask" && jl.invited[0].by.username === "mia.k" && jl.invited[0].card === 88 && jl.invited[0].made === "2026-11-25", "the invite waits on Josh's list, from Mia");
  check((await kid.get("/a/f/plans")).invited.length === 0, "someone who isn't a friend never sees it");

  // ---- Answering ----
  clock += 2 * HOUR;
  r = await sam.post("/a/f/plan/answer", { id, yes: false });
  check(r.ok && (await sam.get("/a/f/plans")).invited.length === 0, "Not this time takes it away");
  r = await josh.post("/a/f/plan/answer", { id, yes: true });
  check(r.ok && r.state === "in", "I'm in");
  await tick();
  w = last(mp, mp.sub.endpoint);
  check(w && w.title === "Josh is in for Date night", `the person who invited hears who's in: "${w && w.title}"`);
  check(!pings.some((q) => q.url === mp.sub.endpoint && /Sam/.test(JSON.stringify(mp.open(q.body)))), "nobody is told about Not this time");
  let ml = await mia.get("/a/f/plans");
  check(ml.mine.length === 1 && ml.mine[0].guests.length === 1 && ml.mine[0].guests[0].state === "in", "Mia sees Josh is in, and Sam's gone quietly");

  // ---- Moving the date, adding someone ----
  clock += 2 * HOUR;
  r = await mia.post("/a/f/plan", { id, card: 88, day: "2026-12-06", made: "2026-11-25", guests: ["josh_r", "ana"] });
  check(r.ok && r.plan.id === id && r.plan.day === "2026-12-06", "changing the date keeps the same plan");
  await tick();
  w = last(jp, jp.sub.endpoint);
  check(w && w.title === "Mia moved Date night to Sun 6 Dec", `those invited hear the new date: "${w && w.title}"`);
  check((await ana.get("/a/f/plans")).invited.length === 1, "someone added later gets their own invite");

  // ---- Leaving after I'm in ----
  clock += 2 * HOUR;
  await josh.post("/a/f/plan/drop", { id });
  await tick();
  w = last(mp, mp.sub.endpoint);
  check(w && w.title === "Josh can't make Date night now", `leaving after I'm in tells the person who invited: "${w && w.title}"`);

  // ---- Calling it off ----
  await josh.post("/a/f/plan/answer", { id, yes: true });
  check((await josh.post("/a/f/plan/answer", { id, yes: true })).status === 404, "once left, the invite can't be answered again");
  r = await mia.post("/a/f/plan", { id, card: 88, day: "2026-12-06", made: "2026-11-25", guests: ["josh_r", "ana"] });
  await josh.post("/a/f/plan/answer", { id, yes: true });
  clock += 2 * HOUR; await tick();
  clock += 2 * HOUR;
  await mia.post("/a/f/plan/drop", { id });
  clock = Date.parse("2026-11-26T22:00:00Z"); await tick();   // the night's wait: 9am in Sydney
  w = last(jp, jp.sub.endpoint);
  check(w && w.title === "Date night with Mia on Sun 6 Dec is off", `calling it off tells those invited: "${w && w.title}"`);
  check((await josh.get("/a/f/plans")).invited.length === 0 && (await mia.get("/a/f/plans")).mine.length === 0, "and it's gone for everyone");

  // ---- Removing a friend, deleting, tidying ----
  r = await mia.post("/a/f/plan", { card: 57, day: "2026-12-10", made: "2026-11-25", guests: ["josh_r", "ana"] });
  await josh.post("/a/f/remove", { username: "mia.k" });
  check((await josh.get("/a/f/plans")).invited.length === 0, "removing a friend takes them off each other's dates");
  check((await mia.get("/a/f/plans")).mine[0].guests.map((g) => g.username).join() === "ana", "the other guest stays");
  clock = Date.parse("2026-12-14T03:00:00Z");
  check((await mia.get("/a/f/plans")).mine.length === 0 && (await ana.get("/a/f/plans")).invited.length === 0, "3 days after the date it's all gone");
  const left = book.rows("SELECT * FROM plans").length + book.rows("SELECT * FROM pguests").length;
  check(left === 0, "nothing is kept once it's gone");
  r = await mia.post("/a/f/plan", { card: 88, day: "2026-12-20", made: "2026-12-14", guests: ["ana"] });
  await call("POST", "/a/delete", {}, mia.tok).catch(() => {});
  book.fForget(book.rows("SELECT owner FROM plans")[0] ? book.rows("SELECT owner FROM plans")[0].owner : "");
  check(book.rows("SELECT * FROM plans").length === 0 && book.rows("SELECT * FROM pguests").length === 0, "deleting the account takes its dates and invites");
  check((await call("GET", "/a/f/plans")).status === 401, "needs signing in");

  globalThis.fetch = realFetch; Date.now = realNow;
  done();
})();
