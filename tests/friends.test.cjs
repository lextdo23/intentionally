// Friends service (push/friends.js): mutual friends by exact @username or invite link, requests that can be turned
// off, remove and block (both quiet), the 18+ tick, profiles, and everything going when an account is deleted.
// Runs the real service in Node, with made-up people.
const { checker, loadWorker, fakeSql } = require("./helpers.cjs");

(async () => {
  const { check, done } = checker();
  const mod = await loadWorker(), worker = mod.default;
  const made = {};
  const ns = (Cls, env) => ({ idFromName: (n) => n, get: (n) => made[Cls.name + n] ||= (() => { const sql = fakeSql(); return new Cls({ storage: { sql, deleteAll: async () => { sql.exec("DELETE FROM b"); } } }, env); })() });
  const env = { RESEND_API_KEY: "re_made_up_for_testing" }; env.ACCOUNTS = ns(mod.Accounts, env); env.VAULTS = ns(mod.Vault, env);
  const mail = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com/")) { mail.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
    return realFetch(url, init);
  };
  let ipN = 1;
  const call = async (method, path, body, token) => {
    const headers = { Origin: "https://daydeck.day", "CF-Connecting-IP": "203.0.113." + ipN };
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    const res = await worker.fetch(new Request("https://service.example" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, ...(await res.json()) };
  };
  // A made-up person signs up (email code, username; Face ID skipped).
  const person = async (username) => {
    ipN++;
    const email = username.toLowerCase() + "@example.com";
    await call("POST", "/a/code", { email });
    const code = /(\d{6})/.exec([...mail].reverse().find((m) => m.to[0] === email).subject)[1];
    const v = await call("POST", "/a/verify", { email, code });
    const f = await call("POST", "/a/finish", { ticket: v.ticket, username });
    const tok = f.session;
    return { tok, get: (p) => call("GET", p, null, tok), post: (p, b) => call("POST", p, b, tok) };
  };
  const mia = await person("mia.k"), josh = await person("josh_r"), sam = await person("sam"), stranger = await person("lurker");

  // ---- Signed in and 18 or over ----
  check((await call("GET", "/a/f")).status === 401, "nothing about friends without signing in");
  let r = await mia.post("/a/f/ask", { username: "josh_r" });
  check(r.status === 403 && r.error === "adult", "adding a friend needs the 18+ tick first");
  r = await mia.get("/a/f");
  check(r.ok && r.me.adult === false && r.me.username === "mia.k" && r.friends.length === 0, "the Friends screen loads before the tick, and says it isn't ticked yet");
  for (const p of [mia, josh, sam, stranger]) await p.post("/a/f/profile", { adult: true });
  r = await mia.post("/a/f/profile", { adult: false });
  check((await mia.get("/a/f")).me.adult === true, "once ticked, the 18+ tick stays ticked");

  // ---- Profile ----
  r = await mia.post("/a/f/profile", { name: "  Mia ​Khan\n ", season: "Finding my feet at the new job".padEnd(90, "!"), pic: "frog" });
  r = await mia.get("/a/f");
  check(r.me.name === "Mia Khan" && r.me.season.length === 60 && r.me.pic === "frog", "name tidied (no invisible characters or line breaks), This season kept to 60 characters, picture saved");
  check((await mia.post("/a/f/profile", { pic: "<img src=x>" })).ok && (await mia.get("/a/f")).me.pic === "smile", "a picture that isn't one of the little ones falls back to the smile");
  await mia.post("/a/f/profile", { pic: "frog" });
  check((await josh.post("/a/f/profile", { name: "Daydeck Support" })).error === "name_words" && (await josh.post("/a/f/profile", { name: "Dàydéck" })).error === "name_words", "a display name can't pose as Daydeck (even with accents)");
  check((await josh.post("/a/f/profile", { name: "José Ríos 🌿" })).ok, "real names in any language, and emoji, are welcome");
  check(!JSON.stringify(await mia.get("/a/f")).includes("@example.com"), "no email anywhere in what Friends sees");

  // ---- Finding someone: exact @username only ----
  r = await mia.get("/a/f/find?u=" + encodeURIComponent("@Josh_R"));
  check(r.found && r.person.username === "josh_r" && r.person.name === "José Ríos 🌿" && r.person.state === "none", "found by exact @username (capitals and @ don't matter)");
  check((await mia.get("/a/f/find?u=josh")).found === false && (await mia.get("/a/f/find?u=%25")).found === false, "part of a name finds nobody, so nobody can trawl the list");
  check(!("email" in r.person) && !("season" in r.person), "someone who isn't a friend yet sees only name, @username and picture");

  // ---- Asking and saying yes ----
  r = await mia.post("/a/f/ask", { username: "josh_r" });
  check(r.ok && r.state === "asked", "Mia asks Josh");
  r = await josh.get("/a/f");
  check(r.asksYou.length === 1 && r.asksYou[0].username === "mia.k" && r.friends.length === 0, "Josh sees Mia's request waiting");
  check((await mia.get("/a/f")).asked[0].username === "josh_r", "Mia sees it as asked");
  check((await mia.post("/a/f/ask", { username: "mia.k" })).error === "yourself", "you can't add yourself");
  r = await josh.post("/a/f/answer", { username: "mia.k", yes: true });
  check(r.state === "friends", "Josh says yes");
  r = await mia.get("/a/f");
  check(r.friends.length === 1 && r.friends[0].username === "josh_r" && r.asked.length === 0 && r.me.friends === 1, "they're friends both ways, and the request is gone");
  r = await mia.get("/a/f/person?u=josh_r");
  check(r.person.state === "friends" && r.person.friends === 1 && r.person.since > 0, "a friend's profile shows This season, friends count and since when");

  // Both ask each other: that's a yes.
  await sam.post("/a/f/ask", { username: "mia.k" });
  r = await mia.post("/a/f/ask", { username: "sam" });
  check(r.state === "friends", "if they already asked you, adding them back makes you friends");

  // Saying no is quiet.
  await stranger.post("/a/f/ask", { username: "mia.k" });
  r = await mia.post("/a/f/answer", { username: "lurker", yes: false });
  check(r.state === "none" && (await stranger.get("/a/f")).asked.length === 0, "saying no clears the request (and they're never told no)");
  check((await mia.post("/a/f/answer", { username: "lurker", yes: true })).status === 404, "you can't say yes to a request that isn't there");

  // ---- Requests turned off ----
  await josh.post("/a/f/profile", { closed: true });
  r = await sam.get("/a/f/find?u=josh_r");
  check(r.person.closed === true, "someone with requests off shows as not taking requests");
  check((await sam.post("/a/f/ask", { username: "josh_r" })).error === "closed", "and can't be asked");
  await josh.post("/a/f/profile", { closed: false });
  await sam.post("/a/f/ask", { username: "josh_r" });
  await sam.post("/a/f/cancel", { username: "josh_r" });
  check((await josh.get("/a/f")).asksYou.length === 0, "a request can be taken back");

  // ---- Hide friends count ----
  await josh.post("/a/f/profile", { hide: true });
  check((await mia.get("/a/f/person?u=josh_r")).person.friends === null, "a hidden friends count isn't shown");

  // ---- Invite links ----
  r = await mia.post("/a/f/invite", {});
  check(r.ok && /^[A-Za-z0-9_-]{30,}$/.test(r.t), "Mia makes an invite link");
  const t1 = r.t;
  const newbie = await person("newbie");
  r = await newbie.post("/a/f/join", { t: t1 });
  check(r.ok && r.state === "asks_you" && r.person.username === "mia.k", "opening it (even before the 18+ tick) leaves Mia's request waiting");
  check((await newbie.post("/a/f/answer", { username: "mia.k", yes: true })).error === "adult", "saying yes still needs the 18+ tick");
  await newbie.post("/a/f/profile", { adult: true });
  check((await newbie.post("/a/f/answer", { username: "mia.k", yes: true })).state === "friends", "then they're friends");
  r = await mia.post("/a/f/invite", {});
  check((await stranger.post("/a/f/join", { t: t1 })).error === "old_invite", "making a new link retires the old one");
  check((await stranger.post("/a/f/join", { t: "made-up" })).error === "old_invite", "a made-up link does nothing");
  const raw = JSON.stringify(made.Accountsbook.sql.exec("SELECT * FROM invites").toArray());
  check(!raw.includes(r.t), "invite links are only kept scrambled");

  // ---- Remove (quiet) ----
  await mia.post("/a/f/remove", { username: "newbie" });
  check((await newbie.get("/a/f")).friends.length === 0 && (await mia.get("/a/f")).friends.every((f) => f.username !== "newbie"), "removing a friend ends it both ways, without any message");
  r = await newbie.get("/a/f/person?u=mia.k");
  check(r.person.state === "none" && !("season" in r.person), "once removed, their This season line isn't shown any more");

  // ---- Block (quiet, both ways) ----
  await stranger.post("/a/f/ask", { username: "mia.k" });
  await mia.post("/a/f/block", { username: "lurker" });
  check((await mia.get("/a/f")).asksYou.length === 0, "blocking clears their request");
  check((await stranger.get("/a/f/find?u=mia.k")).found === false, "someone blocked simply can't find you (they aren't told)");
  check((await stranger.post("/a/f/ask", { username: "mia.k" })).status === 404, "and can't ask again");
  check((await mia.get("/a/f/find?u=lurker")).found === false, "and you don't see them either");
  const inv = await mia.post("/a/f/invite", {});
  check((await stranger.post("/a/f/join", { t: inv.t })).error === "old_invite", "a blocked person can't use your invite link");
  check((await mia.get("/a/f")).blocked[0].username === "lurker", "Mia can see who she blocked");
  await mia.post("/a/f/block", { username: "lurker", undo: true });
  check((await stranger.get("/a/f/find?u=mia.k")).found === true, "and can unblock");

  // ---- Lookups are limited ----
  let last;
  for (let i = 0; i < 61; i++) last = await sam.get("/a/f/find?u=nobody" + i);
  check(last.status === 429, "looking up too many names in an hour is slowed down");

  // ---- Deleting an account takes it all ----
  await josh.post("/a/f/profile", { hide: false });
  check((await mia.get("/a/f/person?u=josh_r")).person.friends >= 1, "Josh has friends before deleting");
  await josh.post("/a/f/invite", {});
  await josh.post("/a/delete", {});
  const sql = made.Accountsbook.sql;
  const orphans = ["SELECT COUNT(*) AS n FROM prof WHERE user NOT IN (SELECT id FROM users)", "SELECT COUNT(*) AS n FROM pals WHERE a NOT IN (SELECT id FROM users) OR b NOT IN (SELECT id FROM users)",
    "SELECT COUNT(*) AS n FROM asks WHERE f NOT IN (SELECT id FROM users) OR t NOT IN (SELECT id FROM users)", "SELECT COUNT(*) AS n FROM invites WHERE user NOT IN (SELECT id FROM users)"];
  const left = orphans.map((q) => sql.exec(q).toArray()[0].n);
  r = await mia.get("/a/f");
  check(r.friends.every((f) => f.username !== "josh_r") && (await mia.get("/a/f/find?u=josh_r")).found === false, "deleting an account removes them from every friend's list");
  check(sql.exec("SELECT COUNT(*) AS n FROM prof WHERE name = ?", "José Ríos 🌿").toArray()[0].n === 0 && left.every((n) => n === 0), "and their profile, friendships, requests and invites are gone from the service");

  globalThis.fetch = realFetch;
  done();
})();
