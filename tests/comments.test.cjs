// Comments (alex 2026-11-26): friends comment on a moment, in words only. The person who shared sees every comment;
// everyone else sees only their own friends' comments (and their own). The writer can delete theirs; the person who
// shared can remove any on their moment. Reports, holding back after three, alex's answers, the bell's list, the
// notification ("Sam commented on your moment"), and everything going with a removed friend or deleted account.
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
  // Mia is friends with Josh and Sam. Josh and Sam are friends with each other. Ana is friends with Mia only (so Josh
  // and Sam don't know her). Lee is nobody's friend.
  const mia = await person("mia.k", "Mia"), josh = await person("josh_r", "Josh"), sam = await person("sam", "Sam"), ana = await person("ana"), lee = await person("lee");
  await befriend(josh, "josh_r", mia, "mia.k"); await befriend(sam, "sam", mia, "mia.k"); await befriend(ana, "ana", mia, "mia.k"); await befriend(sam, "sam", josh, "josh_r");
  const book = made["Accountsbook"] || env.ACCOUNTS.get("book");

  let r = await mia.post("/a/f/share", { day: "2026-11-25", item: "card", kind: "card", text: "Text an old friend", pillar: "Friends", status: "Done", cap: "Felt nice" });
  const mid = r.moment.id;
  check(r.ok && r.moment.last === null && r.moment.more === false, "a new moment has no comments");

  // ---- Who may comment ----
  check((await call("POST", "/a/f/comment", { id: mid, text: "hi" })).status === 401, "commenting needs signing in");
  check((await lee.post("/a/f/comment", { id: mid, text: "hi" })).status === 404, "someone who isn't a friend can't comment (or tell the moment is there)");
  check((await lee.get("/a/f/comments?id=" + mid)).status === 404, "nor read the comments");
  check((await josh.post("/a/f/comment", { id: mid, text: "   \n " })).error === "bad_comment", "an empty comment isn't posted");
  clock += 1000;
  r = await josh.post("/a/f/comment", { id: mid, text: "So good to hear ​\n from you!".padEnd(400, "!") });
  check(r.ok && r.comments.length === 1 && r.comments[0].text.length === 280 && !/[\n​]/.test(r.comments[0].text), "a friend comments: kept to 280, no line breaks or invisible characters");
  check(r.comments[0].by.username === "josh_r" && r.comments[0].mine && r.comments[0].canRemove, "the writer sees it's theirs, and can delete it");
  check(!JSON.stringify(r).includes("@example.com"), "no email anywhere");
  clock += 1000; await ana.post("/a/f/comment", { id: mid, text: "Love this" });
  clock += 1000; await sam.post("/a/f/comment", { id: mid, text: "Same here" });
  clock += 1000; r = await mia.post("/a/f/comment", { id: mid, text: "Thanks all" });
  check(r.ok && r.comments.length === 4, "the person who shared can reply on their own moment");

  // ---- Who sees what ----
  const texts = async (p) => (await p.get("/a/f/comments?id=" + mid)).comments.map((c) => c.by.username).join(",");
  check(await texts(mia) === "josh_r,ana,sam,mia.k", "the person who shared sees every comment, oldest first");
  check(await texts(josh) === "josh_r,sam,mia.k", "Josh sees his own, his friend Sam's and Mia's, but not Ana's (he doesn't know her)");
  check(await texts(ana) === "ana,mia.k", "Ana sees only her own and Mia's");
  const feedOf = async (p) => (await p.get("/a/f/feed")).moments.find((m) => m.id === mid);
  let fm = await feedOf(josh);
  check(fm.last && fm.last.text === "Thanks all" && fm.more === true && !("comments" in fm && typeof fm.comments === "number"), "the feed carries just the latest comment and whether there are more, never a count");
  fm = await feedOf(ana);
  check(fm.last.by.username === "mia.k" && fm.more === true, "Ana's feed line is from someone she knows");
  const tc = (await josh.get("/a/f/comments?id=" + mid)).comments;
  check(tc.find((c) => c.by.username === "sam").canRemove === false, "Josh can't delete Sam's comment");
  check((await mia.get("/a/f/comments?id=" + mid)).comments.every((c) => c.canRemove), "Mia can remove any comment on her moment");

  // ---- The bell's list ----
  let feed = await mia.get("/a/f/feed");
  check(feed.comments.map((c) => c.by.username).join(",") === "sam,ana,josh_r" && feed.comments.every((c) => c.moment === mid), "Mia's bell gets friends' comments on her moments, newest first, never her own");
  check((await josh.get("/a/f/feed")).comments.length === 0, "comments on other people's moments never land on your bell");

  // ---- Deleting ----
  const samC = tc.find((c) => c.by.username === "sam").id;
  check((await josh.post("/a/f/uncomment", { id: samC })).status === 404, "you can't delete someone else's comment on someone else's moment");
  const anaC = (await mia.get("/a/f/comments?id=" + mid)).comments.find((c) => c.by.username === "ana").id;
  r = await mia.post("/a/f/uncomment", { id: anaC });
  check(r.ok && r.by === "theirs" && !r.comments.some((c) => c.id === anaC), "Mia removes Ana's comment from her moment");
  const joshC = tc.find((c) => c.by.username === "josh_r").id;
  r = await josh.post("/a/f/uncomment", { id: joshC });
  check(r.ok && r.by === "own" && await texts(mia) === "sam,mia.k", "Josh deletes his own comment");

  // ---- Notifications ----
  const mp = phone(1);
  await mia.post("/a/f/pings", { on: true, sub: mp.sub, tz: "Australia/Sydney" });
  clock += 2 * HOUR; await josh.post("/a/f/comment", { id: mid, text: "One more thing" }); await book.alarm();
  let w = mp.open(pings[pings.length - 1]);
  check(w.title === "Josh commented on your moment" && w.n === 1, `the person who shared is told by name: "${w.title}"`);
  check(!JSON.stringify(w).includes("One more"), "never the comment's words");
  clock += 2 * HOUR; await josh.post("/a/f/comment", { id: mid, text: "a" }); clock += 1000; await sam.post("/a/f/comment", { id: mid, text: "b" }); await book.alarm();
  w = mp.open(pings[pings.length - 1]);
  check(w.title === "Sam and Josh commented on your moment" && w.n === 2, `two people in an hour make one: "${w.title}"`);
  const before = pings.length;
  clock += 2 * HOUR; await mia.post("/a/f/comment", { id: mid, text: "me" }); await book.alarm();
  check(pings.length === before, "your own comment never pings you");
  clock += 2 * HOUR; const gone = await josh.post("/a/f/comment", { id: mid, text: "oops" }); await josh.post("/a/f/uncomment", { id: gone.comment }); await book.alarm();
  check(pings.length === before, "a comment deleted before the ping goes out is never told");
  clock += 2 * HOUR; await josh.post("/a/f/comment", { id: mid, text: "x" }); await mia.post("/a/f/share", { day: "2026-11-25", item: "rest", kind: "rest", status: "Rested" }); await book.alarm();
  check(pings.length === before, "Josh's comment on Mia's moment tells Mia, not Josh");
  await josh.post("/a/f/pings", { on: true, sub: phone(2).sub, tz: "Australia/Sydney" });

  // ---- Reports ----
  const sc = (await mia.get("/a/f/comments?id=" + mid)).comments.find((c) => c.by.username === "sam");
  check((await sam.post("/a/f/report", { comment: sc.id, why: "hurtful" })).status === 404, "you can't report your own comment");
  check((await lee.post("/a/f/report", { comment: sc.id, why: "hurtful" })).status === 404, "nor one you can't see");
  check((await ana.post("/a/f/report", { comment: sc.id, why: "hurtful" })).status === 404, "nor one from someone you don't know (you never saw it)");
  r = await mia.post("/a/f/report", { comment: sc.id, why: "hurtful", note: "Not like Sam" });
  check(r.ok, "Mia reports Sam's comment");
  let list = book.rList();
  let rep = list.open.find((x) => x.comment === sc.id);
  check(rep && rep.who === "sam" && rep.moment === null && rep.snap.comment === sc.text && rep.snap.on.by === "mia.k" && rep.still, "alex sees the comment's words, who wrote it and whose moment it was on");
  await josh.post("/a/f/report", { comment: sc.id, why: "hurtful" });
  const third = await person("third"); await befriend(third, "third", mia, "mia.k"); await befriend(third, "third", sam, "sam");
  check((await third.get("/a/f/comments?id=" + mid)).comments.some((c) => c.id === sc.id), "a friend of both sees it before");
  await third.post("/a/f/report", { comment: sc.id, why: "else" });
  check(!(await josh.get("/a/f/comments?id=" + mid)).comments.some((c) => c.id === sc.id) && !(await mia.get("/a/f/comments?id=" + mid)).comments.some((c) => c.id === sc.id), "three reports hold it back from everyone");
  check((await sam.get("/a/f/comments?id=" + mid)).comments.some((c) => c.id === sc.id), "the writer still sees their own");
  rep = book.rList().open.find((x) => x.comment === sc.id);
  check(rep.held, "alex's page says it's held back");
  book.rAct(rep.id, "keep");
  check((await mia.get("/a/f/comments?id=" + mid)).comments.some((c) => c.id === sc.id) && !book.rList().open.some((x) => x.comment === sc.id), "Keep it brings it back and answers every report about it");
  await mia.post("/a/f/report", { comment: sc.id, why: "spam" });
  rep = book.rList().open.find((x) => x.comment === sc.id);
  book.rAct(rep.id, "remove");
  check(!(await sam.get("/a/f/comments?id=" + mid)).comments.some((c) => c.id === sc.id) && book.rList().done.some((x) => x.comment === sc.id && x.state === "removed" && x.snap.comment), "Remove deletes the comment; alex keeps the copy");
  r = await mia.post("/a/f/report", { username: "sam", why: "else" });
  check(book.rList().open.filter((x) => x.who === "sam" && !x.comment && !x.moment).length === 1, "reporting the person is still its own report");
  book.rAct(book.rList().open.find((x) => x.who === "sam").id, "pause");
  check((await sam.post("/a/f/comment", { id: mid, text: "hello" })).error === "paused", "while sharing is paused, they can't comment");
  book.rAct(book.rList().done.find((x) => x.who === "sam" && x.state === "paused").id, "unpause");
  check((await sam.post("/a/f/comment", { id: mid, text: "back" })).ok, "and can again once alex lets them");
  r = await sam.post("/a/f/comment", { id: mid, text: "paused later" });
  book.sql.exec("INSERT INTO paused (user, at) VALUES ((SELECT id FROM users WHERE name = 'sam'), 1)");
  check(!(await mia.get("/a/f/comments?id=" + mid)).comments.some((c) => c.by.username === "sam"), "a paused account's comments are hidden from others");
  book.sql.exec("DELETE FROM paused");

  // ---- Limits ----
  const day2 = await person("chatty"); await befriend(day2, "chatty", mia, "mia.k");
  let last = null;
  for (let i = 0; i < 61; i++) last = await day2.post("/a/f/comment", { id: mid, text: "hi " + i });
  check(last.error === "too_many_comments", "at most 60 comments a day per person");

  // ---- Removing a friend, blocking, deleting ----
  await mia.post("/a/f/remove", { username: "chatty" });
  check(!(await mia.get("/a/f/comments?id=" + mid)).comments.some((c) => c.by.username === "chatty"), "removing a friend takes their comments on your moments with it");
  await mia.post("/a/f/block", { username: "josh_r" });
  check(!(await mia.get("/a/f/comments?id=" + mid)).comments.some((c) => c.by.username === "josh_r"), "blocking does too");
  r = await sam.post("/a/f/share", { day: "2026-11-25", item: "card", kind: "card", text: "Go for a walk", status: "Done" });
  await mia.post("/a/f/comment", { id: r.moment.id, text: "Nice walk" });
  await mia.post("/a/f/unshare", { id: mid });
  check(!book.one("SELECT 1 AS x FROM comments WHERE moment = ?", mid), "removing a moment removes its comments");
  const miaId = book.one("SELECT id FROM users WHERE name = 'mia.k'").id;
  check(!!book.one("SELECT 1 AS x FROM comments WHERE who = ?", miaId), "Mia has a comment on Sam's moment before deleting");
  await mia.post("/a/delete", {});
  check(!book.one("SELECT 1 AS x FROM comments WHERE who = ?", miaId) && !book.one("SELECT 1 AS x FROM comments WHERE who NOT IN (SELECT id FROM users)"), "deleting an account removes every comment they wrote");

  Date.now = realNow;
  done();
})();
