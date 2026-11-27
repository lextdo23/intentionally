// Photo backup service (push/photos.js): each day's photo and a profile photo, kept privately in R2 (played here by
// a stand-in), readable only by their owner, clean pictures only, 25 a day, older photos catching up on their own
// allowance, a 50 GB ceiling with an email at 40 GB, and everything deleted with the account. Made-up data only.
const { checker, loadWorker, fakeSql } = require("./helpers.cjs");
(async () => {
  const { check, done } = checker();
  const mod = await loadWorker(), worker = mod.default, made = {};
  const ns = (Cls, env) => ({ idFromName: (n) => n, get: (n) => made[Cls.name + n] ||= (() => { const sql = fakeSql(); return new Cls({ storage: { sql, deleteAll: async () => { sql.exec("DELETE FROM b"); } } }, env); })() });
  // R2, played by a Map.
  const bucket = new Map();
  const R2 = { put: async (k, v) => { bucket.set(k, new Uint8Array(v)); }, get: async (k) => (bucket.has(k) ? { body: bucket.get(k) } : null), delete: async (ks) => { [].concat(ks).forEach((k) => bucket.delete(k)); } };
  const env = { RESEND_API_KEY: "re_made_up" }; env.ACCOUNTS = ns(mod.Accounts, env); env.VAULTS = ns(mod.Vault, env);
  const mail = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).startsWith("https://api.resend.com/") ? (mail.push(JSON.parse(init.body)), new Response("{}")) : realFetch(url, init);
  let ipN = 1;
  const raw = async (method, path, body, token, type) => {
    const headers = { Origin: "https://daydeck.day", "CF-Connecting-IP": "203.0.113." + (ipN++ % 250) };
    if (body) { headers["Content-Type"] = type || "application/json"; headers["Content-Length"] = String(body.length); }
    if (token) headers.Authorization = "Bearer " + token;
    return worker.fetch(new Request("https://svc.example" + path, { method, headers, body }), env);
  };
  const call = async (...a) => { const r = await raw(...a); const t = r.headers.get("Content-Type") || ""; return t.includes("json") ? { status: r.status, ...(await r.json()) } : { status: r.status, bytes: new Uint8Array(await r.arrayBuffer()), type: t }; };
  const person = async (username) => {
    const email = username.replace(/\W/g, "") + "@example.com";
    await call("POST", "/a/code", JSON.stringify({ email }));
    const code = /(\d{6})/.exec(mail.filter((m) => m.to[0] === email).pop().subject)[1];
    const v = await call("POST", "/a/verify", JSON.stringify({ email, code }));
    const f = await call("POST", "/a/finish", JSON.stringify({ ticket: v.ticket, username }));
    return f.session;
  };
  const jpeg = (fill = 7, extra = []) => Uint8Array.from([0xff, 0xd8, ...extra, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xda, 0, 2, ...new Array(200).fill(fill), 0xff, 0xd9]);
  const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const mia = await person("mia.k"), sam = await person("sam.w");

  check((await call("POST", "/a/p/" + day(0), jpeg(), null, "image/jpeg")).status === 503, "with no photo store connected, it says photo backup is off");
  env.PHOTOS = R2;
  check((await call("POST", "/a/p/" + day(0), jpeg(), null, "image/jpeg")).status === 401, "signed out: no saving photos");
  let r = await call("POST", "/a/p/" + day(0), jpeg(), mia, "image/jpeg");
  check(r.ok && r.v > 0 && bucket.size === 1, "Mia backs up today's photo");
  const key = [...bucket.keys()][0];
  // A second photo on a day (alex 2026-11-27, js/later.js): <day>~<card's day>, kept, read and deleted the same way.
  { const pk = day(0) + "~" + day(3), n0 = bucket.size;
    const r2 = await call("POST", "/a/p/" + pk, jpeg(9), mia, "image/jpeg");
    check(r2.ok && bucket.size === n0 + 1 && [...bucket.keys()].some((x) => x.endsWith("/" + pk + ".jpg")), "a second photo on a day backs up under its own name");
    check((await call("GET", "/a/p/" + pk, null, mia)).status === 200 && (await call("GET", "/a/p/" + pk, null, sam)).status === 404, "only its owner can get it back");
    check((await call("POST", "/a/p/" + day(0) + "~junk", jpeg(), mia, "image/jpeg")).status === 404, "any other name after the day is refused");
    check((await call("POST", "/a/p/del/" + pk, "{}", mia)).ok && bucket.size === n0, "and it can be deleted on its own"); }
  check(/^u\/[A-Za-z0-9_-]+\/\d{4}-\d{2}-\d{2}\.jpg$/.test(key) && !key.includes("mia"), "it's stored under her account's private code, not her name");
  check((await call("POST", "/a/p/" + day(1), jpeg(7, [0xff, 0xe1, 0, 12, 69, 120, 105, 102, 0, 0, 1, 2, 3, 4]), mia, "image/jpeg")).error === "bad_photo", "a photo still carrying details (location, time, camera) is refused");
  check((await call("POST", "/a/p/" + day(1), new TextEncoder().encode("<script>alert(1)</script>".repeat(10)), mia, "image/jpeg")).error === "bad_photo", "anything that isn't a picture is refused");
  check((await call("POST", "/a/p/../../x", jpeg(), mia, "image/jpeg")).status === 404 && (await call("POST", "/a/p/2026-11-21.png", jpeg(), mia, "image/jpeg")).status === 404, "only real days (or profile) can be names");
  const big = new Uint8Array(710000); big.set(jpeg().slice(0, 30));
  check((await call("POST", "/a/p/" + day(1), big, mia, "image/jpeg")).status === 413, "big photos are refused (the phone shrinks them first)");
  r = await call("GET", "/a/p/" + day(0), null, mia);
  check(r.status === 200 && r.type === "image/jpeg" && r.bytes.length === jpeg().length, "Mia can get her photo back");
  check((await call("GET", "/a/p/" + day(0), null, sam)).status === 404, "Sam can't see Mia's photos");
  check((await call("GET", "/a/p/" + day(0))).status === 401, "nobody signed out can");
  r = await call("GET", "/a/p", null, mia);
  check(r.ok && r.photos.length === 1 && r.photos[0].k === day(0), "she can list which photos are backed up");
  check((await call("POST", "/a/p/profile", jpeg(9), mia, "image/jpeg")).ok, "and back up her profile photo");

  // 25 a day (today and yesterday count as new; older photos catch up on their own allowance)
  let lastNew;
  for (let i = 0; i < 25; i++) lastNew = await call("POST", "/a/p/" + day(i % 2), jpeg(i), sam, "image/jpeg");
  check(lastNew.ok, "25 new photos in a day are fine");
  check((await call("POST", "/a/p/" + day(0), jpeg(99), sam, "image/jpeg")).error === "daily_limit", "the 26th that day waits until tomorrow");
  r = await call("POST", "/a/p/" + day(30), jpeg(5), sam, "image/jpeg");
  check(r.ok, "older photos still catch up after signing in (their own allowance)");

  // Removing
  await call("POST", "/a/p/del/" + day(0), "{}", mia);
  check((await call("GET", "/a/p/" + day(0), null, mia)).status === 404 && ![...bucket.keys()].some((k) => k.endsWith(day(0) + ".jpg") && k === key), "removing a photo deletes it from the store");
  await call("POST", "/a/p/del/*", "{}", sam);
  check((await call("GET", "/a/p", null, sam)).photos.length === 0, "turning photo backup off deletes all of Sam's photos");

  // The ceiling: 50 GB, email at 40 GB
  const book = made.Accountsbook;
  book.sql.exec("INSERT INTO pidx (user, k, size, v) VALUES ('someone', '2020-01-01', ?, 1)", 40.5e9);
  r = await call("POST", "/a/p/" + day(1), jpeg(), mia, "image/jpeg");
  check(r.ok && mail.some((m) => /80% full/.test(m.subject) && m.to[0] === "hello@daydeck.day"), "past 40 GB, alex gets an email (once)");
  book.sql.exec("UPDATE pidx SET size = ? WHERE user = 'someone'", 50e9);
  check((await call("POST", "/a/p/" + day(2), jpeg(), mia, "image/jpeg")).error === "photos_full", "at 50 GB, backups pause (photos stay on phones)");
  book.sql.exec("DELETE FROM pidx WHERE user = 'someone'");

  // Deleting the account
  const before = bucket.size;
  await call("POST", "/a/delete", "{}", mia);
  check(![...bucket.keys()].some((k) => k.startsWith(key.split("/").slice(0, 2).join("/") + "/")) && bucket.size < before, "deleting the account deletes every photo it backed up");
  globalThis.fetch = realFetch;
  done();
})();
