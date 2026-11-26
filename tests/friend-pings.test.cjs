// Friend notifications (alex 2026-11-25; friend requests too, 2026-11-26): off until turned on; "Mia shared a moment" with the friend's chosen name
// (else @username), never a photo, caption or mood; at most one an hour, none 10pm to 8am where the phone is; sealed
// so only that phone can read the words. Runs the real service in Node with made-up people and a made-up phone.
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
  const mia = await person("mia.k"), josh = await person("josh_r"), sam = await person("sam"), ana = await person("ana");
  await mia.post("/a/f/profile", { name: "Mia" });
  await sam.post("/a/f/profile", { name: "Sam" });
  for (const [a, b] of [[mia, josh], [sam, josh], [ana, josh]]) { const them = b === josh ? "josh_r" : ""; await a.post("/a/f/ask", { username: them }); }
  for (const u of ["mia.k", "sam", "ana"]) await josh.post("/a/f/answer", { username: u, yes: true });
  const day = "2026-11-25";
  let n = 0;
  const share = (p, extra = {}) => (clock += 1000, p.post("/a/f/share", { day, item: String(++n), kind: "card", text: "Text an old friend", pillar: "Friends", status: "Done", cap: "Private words", mood: "good", ...extra }));

  // ---- Off until turned on ----
  await share(mia); await tick();
  check(pings.length === 0, "nobody is pinged until they turn friend notifications on");
  const jp = phone(1);
  let r = await josh.post("/a/f/pings", { on: true, sub: { endpoint: "https://evil.example/x", keys: jp.sub.keys }, tz: "Australia/Sydney" });
  check(r.error === "bad_sub", "only a real phone push address is accepted");
  check((await call("POST", "/a/f/pings", { on: true, sub: jp.sub })).status === 401, "turning it on needs signing in");
  r = await josh.post("/a/f/pings", { on: true, sub: jp.sub, tz: "Australia/Sydney" });
  check(r.ok && r.on, "Josh turns friend notifications on");
  await tick();
  check(pings.length === 0, "moments shared before turning it on don't ping");

  // ---- One moment, by name, sealed ----
  clock += 60000; await share(mia);
  check(alarms.length > 0, "a new moment sets a wake-up");
  await tick();
  check(pings.length === 1, "a friend's new moment pings once");
  let p = pings[0], words = jp.open(p.body);
  check(p.headers["Content-Encoding"] === "aes128gcm", "the words are sealed for that one phone");
  check(!p.body.toString("latin1").includes("Mia"), "the push service can't read the name");
  check(words.kind === "friends" && words.title === "Mia shared a moment", `uses the chosen name: "${words.title}"`);
  check(!JSON.stringify(words).includes("Private") && !JSON.stringify(words).includes("good") && !JSON.stringify(words).includes("Text an"), "never the caption, mood or card");
  check(words.n === 1, "says how many moments, for the number on the icon");

  // ---- At most one an hour, batched ----
  clock += 10 * 60000; await share(sam); await share(ana); await share(sam); await tick();
  check(pings.length === 1, "no second ping within the hour");
  clock = Date.parse("2026-11-25T04:01:00Z"); await tick();
  words = jp.open(pings[1].body);
  check(pings.length === 2 && words.title === "Sam and @ana shared moments", `one ping for the hour, falling back to @username: "${words.title}"`);
  check(words.n === 3, "counts every moment in that hour");
  clock += 2 * HOUR; await share(ana); await share(sam); await share(sam); await share(mia); await tick();
  words = jp.open(pings[2].body);
  check(words.title === "Mia and 2 others shared moments", `three people: "${words.title}"`);
  clock += 2 * HOUR; await share(sam); await share(sam); await tick();
  check(jp.open(pings[3].body).title === "Sam shared 2 moments", "one person, two moments");

  // ---- Quiet at night (where the phone is) ----
  clock = Date.parse("2026-11-25T12:00:00Z");   // 11pm in Sydney
  await share(mia); await tick();
  check(pings.length === 4, "nothing between 10pm and 8am");
  const due = book.one("SELECT due FROM fpings").due;
  check(due === Date.parse("2026-11-25T21:00:00Z"), "it waits for 8am Sydney time");
  clock = due; await tick();
  check(pings.length === 5 && jp.open(pings[4].body).title === "Mia shared a moment", "then one ping at 8am");

  // ---- Updates, hidden friends, unfriends ----
  clock += 2 * HOUR;
  await mia.post("/a/f/share", { day, item: String(n), kind: "card", text: "Text an old friend", cap: "edited" }); await tick();
  check(pings.length === 5, "editing a moment already shared doesn't ping again");
  await josh.post("/a/f/hide", { username: "sam" });
  await share(sam); await tick();
  check(pings.length === 5, "a friend whose moments you hid never pings");
  await josh.post("/a/f/remove", { username: "ana" });
  await share(ana); await tick();
  check(pings.length === 5, "someone no longer a friend never pings");
  await share(mia); await tick();
  check(pings.length === 6 && jp.open(pings[5].body).title === "Mia shared a moment", "friends still ping after that");

  // ---- Friend requests, under the same switch (alex 2026-11-26) ----
  clock += 2 * HOUR;
  const lee = await person("lee"), kai = await person("kai"), zed = await person("zed");
  await lee.post("/a/f/profile", { name: "Lee" });
  await lee.post("/a/f/ask", { username: "josh_r" }); await tick();
  words = jp.open(pings[6].body);
  check(pings.length === 7 && words.title === "Lee wants to be friends" && !words.body, `a friend request pings by name: "${words.title}"`);
  check(words.n === 1, "a request counts toward the number on the icon");
  clock += 2 * HOUR; await lee.post("/a/f/ask", { username: "josh_r" }); await tick();
  check(pings.length === 7, "asking again doesn't ping again");
  await kai.post("/a/f/ask", { username: "josh_r" }); await share(mia); await tick();
  words = jp.open(pings[7].body);
  check(pings.length === 8 && words.title === "@kai wants to be friends" && words.body === "Mia shared a moment" && words.n === 2, `a request and a moment in one: "${words.title}" / "${words.body}"`);
  clock += 2 * HOUR; await zed.post("/a/f/ask", { username: "josh_r" }); await josh.post("/a/f/answer", { username: "zed", yes: false }); await tick();
  check(pings.length === 8, "a request already answered never pings");
  for (const u of ["lee", "kai"]) await josh.post("/a/f/answer", { username: u, yes: false });

  // ---- Off, phone gone, sign out, delete ----
  clock += 2 * HOUR;
  await josh.post("/a/f/pings", { on: false });
  await share(mia); await tick();
  check(pings.length === 8 && !book.one("SELECT 1 AS x FROM fpings"), "switching it off stops pings and forgets the phone");
  await josh.post("/a/f/pings", { on: true, sub: jp.sub, tz: "Australia/Sydney" });
  clock += 60000; gone = true; await share(mia); await tick(); gone = false;
  check(!book.one("SELECT 1 AS x FROM fpings"), "a phone that has gone away is forgotten");
  await josh.post("/a/f/pings", { on: true, sub: jp.sub, tz: "Australia/Sydney" });
  await call("POST", "/a/signout", {}, josh.tok);
  check(!book.one("SELECT 1 AS x FROM fpings"), "signing out everywhere stops them");
  const mp = phone(2);
  await mia.post("/a/f/pings", { on: true, sub: mp.sub, tz: "Australia/Perth" });
  book.fForget(book.one("SELECT id FROM users WHERE name = 'mia.k'").id);
  check(!book.one("SELECT 1 AS x FROM fpings"), "deleting the account removes the phone's address and keys");

  Date.now = realNow;
  done();
})();
