// Replies and suns on comments (alex 2026-11-26): a reply sits under the comment it answers, one level deep. You see a
// reply only if you may see it and the comment it is under. The person answered is told "Sam replied to your comment"
// and it counts on their number. The sun ("I see you" for a comment) is never counted or told; the writer sees which
// of their friends said it. Removing a comment, a friend or an account takes replies and suns with it.
// Runs the real service in Node, with made-up people and a made-up phone.
const crypto = require("crypto");
const { checker, loadWorker, fakeSql } = require("./helpers.cjs");

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
  const made = {};
  const ns = (Cls, env) => ({ idFromName: (n) => n, get: (n) => made[Cls.name + n] ||= (() => {
    const sql = fakeSql(), kv = {};
    return new Cls({ storage: { sql, deleteAll: async () => {}, setAlarm: async () => {}, get: async (k) => kv[k], put: async (k, v) => { kv[k] = v; } } }, env);
  })() });
  const env = { RESEND_API_KEY: "re_made_up_for_testing", TESTER_KEY: "made-up-tester-key-123" };
  env.ACCOUNTS = ns(mod.Accounts, env); env.VAULTS = ns(mod.Vault, env); env.TESTERS = ns(mod.Testers, env); env.KEYS = ns(mod.Keys, env);
  const mail = [], pings = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com/")) { mail.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
    if (String(url).startsWith("https://web.push.apple.com/")) { pings.push(Buffer.from(init.body)); return new Response("", { status: 201 }); }
    return realFetch(url, init);
  };
  const realNow = Date.now; let clock = Date.parse("2026-11-25T03:00:00Z"); Date.now = () => clock;   // 2pm in Sydney
  const HOUR = 3600000;
  let ipN = 1;
  const call = async (method, path, body, token) => {
    const headers = { Origin: "https://daydeck.day", "CF-Connecting-IP": "203.0.113." + ipN };
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    const res = await worker.fetch(new Request("https://service.example" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, ...(await res.json()) };
  };
  const person = async (username, name) => {
    ipN++;
    const email = username + "@example.com";
    await call("POST", "/a/code", { email });
    const code = /(\d{6})/.exec([...mail].reverse().find((m) => m.to[0] === email).subject)[1];
    const v = await call("POST", "/a/verify", { email, code });
    const tok = (await call("POST", "/a/finish", { ticket: v.ticket, username })).session;
    const p = { tok, get: (x) => call("GET", x, null, tok), post: (x, b) => call("POST", x, b, tok) };
    await p.post("/a/f/profile", { adult: true, ...(name ? { name } : {}) });
    return p;
  };
  const befriend = async (a, an, b, bn) => { await a.post("/a/f/ask", { username: bn }); await b.post("/a/f/answer", { username: an, yes: true }); };
  // Mia is friends with Josh, Sam and Ana. Josh and Sam are friends. Ana knows only Mia. Lee is nobody's friend.
  const mia = await person("mia.k", "Mia"), josh = await person("josh_r", "Josh"), sam = await person("sam", "Sam"), ana = await person("ana"), lee = await person("lee");
  await befriend(josh, "josh_r", mia, "mia.k"); await befriend(sam, "sam", mia, "mia.k"); await befriend(ana, "ana", mia, "mia.k"); await befriend(sam, "sam", josh, "josh_r");
  const book = made["Accountsbook"] || env.ACCOUNTS.get("book");
  const jp = phone(1), mp = phone(2);
  await josh.post("/a/f/pings", { on: true, sub: jp.sub, tz: "Australia/Sydney" });
  await mia.post("/a/f/pings", { on: true, sub: mp.sub, tz: "Australia/Sydney" });
  const lastPing = (p) => { for (let i = pings.length - 1; i >= 0; i--) { try { return p.open(pings[i]); } catch { /* another phone's */ } } return null; };

  let r = await mia.post("/a/f/share", { day: "2026-11-25", item: "card", kind: "card", text: "Go for a walk", pillar: "Move", status: "Done" });
  const mid = r.moment.id;
  clock += 1000; const jc = (await josh.post("/a/f/comment", { id: mid, text: "Where was this?" })).comment;
  clock += 1000; const ac = (await ana.post("/a/f/comment", { id: mid, text: "Gorgeous" })).comment;
  await book.alarm();
  const list = async (p) => (await p.get("/a/f/comments?id=" + mid)).comments;

  // ---- Replying ----
  clock += 2 * HOUR; let pb = pings.length;
  r = await sam.post("/a/f/comment", { id: mid, text: "Bondi to Coogee!", parent: jc });
  const sr = r.comment;
  check(r.ok && r.comments.find((c) => c.id === sr).parent === jc, "Sam replies to Josh's comment: it sits under it");
  r = await josh.post("/a/f/comment", { id: mid, text: "Thanks!", parent: sr });
  check(r.ok && r.comments.find((c) => c.id === r.comment).parent === jc, "replying to a reply joins the same thread, one level deep");
  check((await sam.post("/a/f/comment", { id: mid, text: "hi", parent: ac })).status === 404, "you can't reply to a comment you can't see (Sam doesn't know Ana)");
  check((await lee.post("/a/f/comment", { id: mid, text: "hi", parent: jc })).status === 404, "someone who isn't a friend can't reply");
  check((await josh.post("/a/f/comment", { id: mid, text: "hi", parent: "nope" })).status === 404, "a reply needs a real comment");
  clock += 1000; const mr = (await mia.post("/a/f/comment", { id: mid, text: "Glad you liked it", parent: ac })).comment;
  check((await list(josh)).every((c) => c.id !== mr), "Josh never sees Mia's reply to Ana, whose comment he can't see");
  check((await list(mia)).some((c) => c.id === mr), "Mia, who shared, sees it");
  check((await list(ana)).some((c) => c.id === mr && c.parent === ac), "and so does Ana, under her comment");

  // ---- Being told ----
  await book.alarm();
  let w = lastPing(jp);
  check(w && w.title === "Sam replied to your comment" && w.n === 1, `the person answered is told by name and it counts: "${w && w.title}"`);
  check(!JSON.stringify(w).includes("Bondi"), "never the reply's words");
  w = lastPing(mp);
  check(w && /Sam and Josh commented on your moment|Josh and Sam commented on your moment/.test(w.title), `the person who shared hears about the new comments as usual: "${w && w.title}"`);
  let feed = await josh.get("/a/f/feed");
  const note = feed.comments.find((c) => c.id === sr);
  check(note && note.reply === true && note.onMine === false && note.onBy.username === "mia.k", "Josh's bell lists Sam's reply, marked as a reply, on Mia's moment");
  check(!feed.comments.some((c) => c.by.username === "josh_r"), "never his own replies");
  clock += 2 * HOUR; pb = pings.length;
  await mia.post("/a/f/comment", { id: mid, text: "It's Bondi", parent: jc }); await book.alarm();
  w = lastPing(jp);
  check(pings.length === pb + 1 && w.title === "Mia replied to your comment", "the person who shared replying tells the person answered, and doesn't ping themselves");

  // ---- The sun on a comment ----
  clock += 2 * HOUR; pb = pings.length;
  r = await sam.post("/a/f/csee", { id: jc });
  check(r.ok && r.comments.find((c) => c.id === jc).seen === true, "Sam says I see you on Josh's comment");
  check(r.comments.every((c) => c.seers.length === 0) && !JSON.stringify(r.comments.find((c) => c.id === jc)).match(/"count"|"n":/), "Sam sees only that he said it, never who else or how many");
  let jcs = (await list(josh)).find((c) => c.id === jc);
  check(jcs.seers.map((p) => p.username).join(",") === "sam" && jcs.seen === false, "Josh, who wrote it, sees Sam said it");
  check((await list(mia)).find((c) => c.id === jc).seers.length === 0, "Mia sees nothing of it on someone else's comment");
  await ana.post("/a/f/csee", { id: mr });
  check((await list(mia)).find((c) => c.id === mr).seers.map((p) => p.username).join(",") === "ana", "Mia sees Ana said it on her reply");
  check((await josh.post("/a/f/csee", { id: jc })).status === 404, "not on your own comment");
  check((await lee.post("/a/f/csee", { id: jc })).status === 404, "not from someone who isn't a friend");
  check((await sam.post("/a/f/csee", { id: ac })).status === 404, "not on a comment you can't see");
  await book.alarm();
  check(pings.length === pb, "a sun on a comment never sends a notification");
  r = await sam.post("/a/f/csee", { id: jc, undo: true });
  check(r.comments.find((c) => c.id === jc).seen === false && (await list(josh)).find((c) => c.id === jc).seers.length === 0, "taking it back takes it away");
  await sam.post("/a/f/csee", { id: jc });

  // ---- Taking things away ----
  await sam.post("/a/f/remove", { username: "josh_r" });
  check((await list(josh)).find((c) => c.id === jc).seers.length === 0, "removing a friend takes their suns on each other's comments");
  r = await josh.post("/a/f/uncomment", { id: jc });
  check(r.ok && !r.comments.some((c) => c.id === jc || c.parent === jc), "deleting a comment takes its replies with it");
  check(!book.one("SELECT 1 AS x FROM comments WHERE parent = ?", jc) && !book.one("SELECT 1 AS x FROM csees WHERE comment = ?", jc), "nothing of them is kept");
  await mia.post("/a/f/unshare", { id: mid });
  check(!book.one("SELECT 1 AS x FROM csees WHERE comment = ?", mr), "removing a moment takes its comments' suns");

  Date.now = realNow;
  done();
})();
