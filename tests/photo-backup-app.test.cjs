// Photo backup in the app (js/photo-backup.js): a day's photo goes up to the account's private store (shrunk, clean),
// a new phone gets it back the first time it's shown, removing a photo removes the copy, the one-time note for people
// who already have photos, and Settings → Photos (turning it off deletes the copies). Runs the real service with a
// stand-in for R2, and two pretend iPhones. Made-up data only. SHOTS=1 saves pictures.
const { chromium } = require("playwright");
const path = require("path");
const { serve, checker, loadWorker, fakeSql } = require("./helpers.cjs");
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
(async () => {
  const { check, done } = checker();
  const mod = await loadWorker(), worker = mod.default, made = {};
  const ns = (Cls, env) => ({ idFromName: (n) => n, get: (n) => made[Cls.name + n] ||= (() => { const sql = fakeSql(); return new Cls({ storage: { sql, deleteAll: async () => {} } }, env); })() });
  const bucket = new Map();
  const env = { RESEND_API_KEY: "re_made_up", PHOTOS: { put: async (k, v) => { bucket.set(k, new Uint8Array(v)); }, get: async (k) => (bucket.has(k) ? { body: bucket.get(k) } : null), delete: async (ks) => { [].concat(ks).forEach((k) => bucket.delete(k)); } } };
  env.ACCOUNTS = ns(mod.Accounts, env); env.VAULTS = ns(mod.Vault, env);
  const mail = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).startsWith("https://api.resend.com/") ? (mail.push(JSON.parse(init.body)), new Response("{}")) : realFetch(url, init);
  const call = async (method, p, body, token) => {
    const headers = { Origin: "https://daydeck.day", "CF-Connecting-IP": "198.51.100.3" };
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    return (await worker.fetch(new Request("https://svc.example" + p, { method, headers, body: body ? JSON.stringify(body) : undefined }), env)).json();
  };
  await call("POST", "/a/code", { email: "mia@example.com" });
  const code = /(\d{6})/.exec(mail.pop().subject)[1];
  const v = await call("POST", "/a/verify", { email: "mia@example.com", code });
  const f = await call("POST", "/a/finish", { ticket: v.ticket, username: "mia.k" });

  const server = await serve(), b = await chromium.launch();
  const phone = async () => {
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true });
    await ctx.route("https://intentionally-push.lextdo.workers.dev/**", async (route) => {
      const req = route.request(), u = new URL(req.url());
      if (!u.pathname.startsWith("/a/")) return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } });
      const headers = { Origin: "https://daydeck.day", "CF-Connecting-IP": "192.0.2.9" };
      const h = req.headers(); if (h.authorization) headers.Authorization = h.authorization; if (h["content-type"]) headers["Content-Type"] = h["content-type"];
      const body = req.postDataBuffer();
      const res = await worker.fetch(new Request("https://svc.example" + u.pathname, { method: req.method(), headers, body: body && body.length ? body : undefined }), env);
      route.fulfill({ status: res.status, headers: { "access-control-allow-origin": "*", "content-type": res.headers.get("Content-Type") || "application/json" }, body: Buffer.from(await res.arrayBuffer()) });
    });
    const p = await ctx.newPage(); p.errors = []; p.on("pageerror", (e) => p.errors.push(e.message));
    return p;
  };
  const shot = async (p, n) => { if (process.env.SHOTS) await p.screenshot({ path: path.join(__dirname, "..", "..", "backup-" + n + ".png") }); };
  const acct = JSON.stringify({ token: f.session, user: f.user, pic: { kind: "little", id: "smile" } });

  // ---- Phone 1: Mia already has a photo from before backups existed ----
  const p1 = await phone();
  await p1.goto(server.url);
  await p1.evaluate(([acct, k]) => {
    localStorage.setItem("daydeck-account", acct);
    localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: k, days: { [k]: { sleep: { q: 3 }, card: { id: 3, done: true } } }, pillars: ["Rest", "Move", "Friends"], seen: { note: "sleep" }, ph: { noted: 1 } }));
  }, [acct, day(1)]);
  await p1.reload(); await p1.waitForTimeout(1200);
  await p1.evaluate(async (k) => { const ph = await import("./js/photos.js"); const c = document.createElement("canvas"); c.width = ph.W; c.height = ph.H; const x = c.getContext("2d"); x.fillStyle = "#3b475c"; x.fillRect(0, 0, c.width, c.height); x.fillStyle = "#f2c08f"; x.beginPath(); x.arc(540, 600, 220, 0, 7); x.fill(); await ph.save(k, c, { src: "lib" }); }, day(1));
  await p1.reload(); await p1.waitForTimeout(11000);
  const note = await p1.$(".sheet-host");
  check(note && /Your photos are backed up now/.test(await note.textContent()) && /Turn it off/.test(await note.textContent()), "people who already have photos get a one-time note, with a way to say no");
  await shot(p1, "1-note");
  await p1.click('.sheet-host button:has-text("Sounds good")'); await p1.waitForTimeout(500);
  for (let i = 0; i < 20 && ![...bucket.keys()].some((k) => k.endsWith(day(1) + ".jpg")); i++) await p1.waitForTimeout(500);
  const key = [...bucket.keys()].find((k) => k.endsWith(day(1) + ".jpg"));
  check(!!key, "the photo goes up to her private store on its own");
  const bytes = key && Buffer.from(bucket.get(key));
  check(bytes && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.length < 400000 && !bytes.includes(Buffer.from("Exif")), `it's a small, clean picture (${bytes ? Math.round(bytes.length / 1024) : "?"} KB, nothing but the picture)`);
  await p1.waitForTimeout(1000);
  const ph1 = await p1.evaluate((k) => JSON.parse(localStorage.getItem("daydeck")).days[k].ph, day(1));
  check(ph1 && ph1.b === 1 && ph1.v > 0, "the day remembers its photo is backed up");
  await p1.click('#home button[aria-label="Settings"]'); await p1.waitForTimeout(800);
  check(/Back up my photos/.test(await p1.textContent("#settings")) && /1 of 1 photos backed up/.test(await p1.textContent("#settings")), "Settings → Photos says how many are backed up");
  await shot(p1, "2-settings");
  await p1.click('#settings button[aria-label="Back to home"]'); await p1.waitForTimeout(500);
  await p1.waitForTimeout(6000);   // the days backup carries the "backed up" note

  // ---- Phone 2: a new phone, same account ----
  const p2 = await phone();
  await p2.goto(server.url);
  await p2.evaluate((acct) => { localStorage.setItem("daydeck-account", acct); localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: null, days: {}, seen: { note: "sleep" }, ph: { noted: 1, told: 1 } })); }, acct);
  await p2.reload(); await p2.waitForTimeout(6000);
  const ph2 = await p2.evaluate((k) => (JSON.parse(localStorage.getItem("daydeck")).days[k] || {}).ph, day(1));
  check(ph2 && ph2.b === 1, "the new phone's days come back with the note that the photo is backed up");
  const got = await p2.evaluate(async (k) => { const ph = await import("./js/photos.js"); const u = await ph.url(k, "full"); if (!u) return null; const im = new Image(); im.src = u; await im.decode(); return im.naturalWidth; }, day(1));
  check(got > 100, "the first time it's shown, the new phone fetches the picture itself");
  await p2.evaluate(async () => { const ph = await import("./js/photos.js"); ph.openPhotos(() => {}); }); await p2.waitForTimeout(1500);
  await shot(p2, "3-new-phone");

  // ---- Removing a photo removes the copy ----
  await p1.evaluate(async (k) => { const ph = await import("./js/photos.js"); await ph.remove(k); }, day(1));
  for (let i = 0; i < 20 && bucket.has(key); i++) await p1.waitForTimeout(500);
  check(!bucket.has(key), "removing a photo on the phone deletes its copy");

  // ---- Turning it off deletes every copy ----
  await p1.evaluate(async (k) => { const ph = await import("./js/photos.js"); const c = document.createElement("canvas"); c.width = ph.W; c.height = ph.H; c.getContext("2d").fillRect(0, 0, 10, 10); await ph.save(k, c, { src: "lib" }); }, day(0));
  for (let i = 0; i < 30 && ![...bucket.keys()].some((k) => k.endsWith(day(0) + ".jpg")); i++) await p1.waitForTimeout(500);
  check([...bucket.keys()].some((k) => k.endsWith(day(0) + ".jpg")), "a new photo backs up a few seconds after it's taken");
  await p1.click('#home button[aria-label="Settings"]'); await p1.waitForTimeout(800);
  await p1.click('#settings button[aria-label="Back up my photos"]'); await p1.waitForTimeout(600);
  check(/Turn off photo backup/.test(await p1.textContent(".sheet-host")) && /stay on this phone/.test(await p1.textContent(".sheet-host")), "turning it off asks first, and says photos stay on the phone");
  await shot(p1, "4-off");
  await p1.click('.sheet-host button:has-text("Turn off and delete copies")'); await p1.waitForTimeout(1200);
  check(bucket.size === 0, "and deletes every copy in the account");
  check(await p1.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).ph.backup) === false && /stay on this phone only/.test(await p1.textContent("#settings")), "photo backup stays off, and Settings says so");
  const errs = p1.errors.concat(p2.errors);
  check(errs.length === 0, "no errors" + (errs.length ? ": " + errs.join(" | ") : ""));
  await b.close(); server.close(); globalThis.fetch = realFetch;
  done();
})();
