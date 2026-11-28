// People you may know (push/friends.js fSuggest, alex 2026-11-28): someone nobody invited, with no friends yet, is
// shown only alex; everyone else sees friends of friends, grouped by friends in common, most first. Never: blocked,
// asked either way, requests off, "Show my friends" off, not 18+, or hidden with ×. Runs the real service in Node.
const { checker, loadWorker, fakeSql } = require("./helpers.cjs");

(async () => {
  const { check, done } = checker();
  const mod = await loadWorker(), worker = mod.default;
  const made = {};
  const ns = (Cls, env) => ({ idFromName: (n) => n, get: (n) => made[Cls.name + n] ||= (() => { const sql = fakeSql(); return new Cls({ storage: { sql, deleteAll: async () => { sql.exec("DELETE FROM b"); } } }, env); })() });
  const env = { RESEND_API_KEY: "re_made_up_for_testing", TESTER_KEY: "made-up-tester-key-123" }; env.ACCOUNTS = ns(mod.Accounts, env); env.VAULTS = ns(mod.Vault, env); env.TESTERS = ns(mod.Testers, env);
  const mail = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com/")) { mail.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
    return realFetch(url, init);
  };
  let ipN = 1;
  const call = async (method, path, body, token, ip) => {
    const headers = { Origin: "https://daydeck.day", "CF-Connecting-IP": ip || "203.0.113." + ipN };
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    const res = await worker.fetch(new Request("https://service.example" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    const txt = await res.text();
    return { status: res.status, size: res.headers.get("X-Size"), expose: res.headers.get("Access-Control-Expose-Headers"), bytes: Buffer.byteLength(txt), ...JSON.parse(txt) };
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
  const names = (r) => (r.people || []).map((p) => p.username).join(",");
  const pal = async (a, b) => { await a.post("/a/f/ask", { username: b.name }); await b.post("/a/f/answer", { username: a.name, yes: true }); };
  const mk = async (n) => { const p = await person(n); p.name = n; await p.post("/a/f/profile", { adult: true, name: n[0].toUpperCase() + n.slice(1) }); return p; };
  const alex = await mk("alex"), zoe = await mk("zoe"), mia = await mk("mia"), josh = await mk("josh"), ella = await mk("ella");
  const priya = await mk("priya"), sam = await mk("sam"), tom = await mk("tom"), lena = await mk("lena"), quiet = await mk("quiet"), shut = await mk("shut");
  const young = await person("young"); young.name = "young";

  check((await call("GET", "/a/f/suggest")).status === 401, "nothing without signing in");
  let r = await young.get("/a/f/suggest");
  check(r.status === 403, "and nothing before the 18+ tick");

  // ---- Found Daydeck on their own, no friends yet: only alex ----
  r = await zoe.get("/a/f/suggest");
  check(r.ok && names(r) === "alex" && r.people[0].maker === true, "someone nobody invited, with no friends, is shown only alex (marked as the maker)");
  check(!("email" in r.people[0]) && r.people[0].commonN === 0, "with no email and no friends in common");
  await zoe.post("/a/f/nosuggest", { username: "alex" });
  check(names(await zoe.get("/a/f/suggest")) === "", "× on alex: not suggested again");

  // ---- Came through an invite: nothing until the inviter's request is answered, then friends of friends ----
  await pal(josh, priya); await pal(josh, sam); await pal(josh, tom); await pal(josh, lena); await pal(josh, alex);
  await pal(ella, priya); await pal(ella, sam);
  const inv = await josh.post("/a/f/invite", {});
  await mia.post("/a/f/join", { t: inv.t });
  check(names(await mia.get("/a/f/suggest")) === "", "an invite waiting: no alex, the invite comes first");
  await mia.post("/a/f/answer", { username: "josh", yes: true }); await pal(ella, mia);
  r = await mia.get("/a/f/suggest");
  check(names(r) === "priya,sam,alex,lena,tom", "friends of friends, most friends in common first, then A to Z by name: " + names(r));
  check(r.people[0].commonN === 2 && r.people[0].common.map((c) => c.username).sort().join() === "ella,josh" && r.people[2].commonN === 1 && !r.people[2].maker, "each with the friends you share; alex counts like anyone else here");
  check(!r.people.some((p) => ["mia", "josh", "ella"].includes(p.username)), "never yourself or your friends");

  // ---- Who is never suggested ----
  await mia.post("/a/f/ask", { username: "tom" });
  check(!names(await mia.get("/a/f/suggest")).includes("tom"), "someone you've asked drops off (they're under Waiting for them)");
  await lena.post("/a/f/ask", { username: "mia" });
  check(!names(await mia.get("/a/f/suggest")).includes("lena"), "someone asking you drops off (they're under Requests)");
  await pal(josh, quiet); await quiet.post("/a/f/profile", { hide: true });
  await pal(josh, shut); await shut.post("/a/f/profile", { closed: true });
  r = await mia.get("/a/f/suggest");
  check(!names(r).includes("quiet") && !names(r).includes("shut"), "nobody with Show my friends off or friend requests off");
  await sam.post("/a/f/block", { username: "mia" });
  check(!names(await mia.get("/a/f/suggest")).includes("sam"), "nobody who blocked you");
  await mia.post("/a/f/nosuggest", { username: "priya" });
  check(names(await mia.get("/a/f/suggest")) === "alex", "× hides someone for good: " + names(await mia.get("/a/f/suggest")));
  // A friend with "Show my friends" off never leads to their friends.
  const kai = await mk("kai"); await pal(ella, kai); await ella.post("/a/f/profile", { hide: true });
  check(!names(await mia.get("/a/f/suggest")).includes("kai"), "a friend who hides their friends never leads to them");
  await ella.post("/a/f/profile", { hide: false });
  check(names(await mia.get("/a/f/suggest")).includes("kai"), "until they show them again");

  // ---- Deleting an account takes its × list ----
  await call("POST", "/a/delete", {}, mia.tok);
  check(!(await call("GET", "/a/f/suggest", null, mia.tok)).ok, "a deleted account gets nothing");
  done();
})();
