// Comments in the app (js/comments.js, alex 2026-11-26). Runs the real Daydeck service inside the test, with a pretend
// iPhone 15 Pro Max as Mia and made-up friends. Checks: the speech bubble beside the sun, the latest comment under a
// post with "View all comments", the Comments sheet (posting, deleting, removing, reporting), comments from people Mia
// does not know never showing, and the bell counting comments on her moments. SHOTS=1 saves pictures.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const { serve, checker, loadWorker, fakeSql } = require("./helpers.cjs");
const SHOTS = process.env.SHOTS ? path.join(__dirname, "..", "..", "friends-shots") : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const { check, done } = checker();
  // ---- The real service, in Node ----
  const mod = await loadWorker(), worker = mod.default, made = {};
  const ns = (Cls, env) => ({ idFromName: (n) => n, get: (n) => made[Cls.name + n] ||= (() => { const sql = fakeSql(); return new Cls({ storage: { sql, deleteAll: async () => {} } }, env); })() });
  const env = { RESEND_API_KEY: "re_made_up", TESTER_KEY: "made-up-tester-key-123", EARLY_BEFORE: "1" }; env.ACCOUNTS = ns(mod.Accounts, env); env.VAULTS = ns(mod.Vault, env); env.TESTERS = ns(mod.Testers, env);
  const mail = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).startsWith("https://api.resend.com/") ? (mail.push(JSON.parse(init.body)), new Response("{}")) : realFetch(url, init);
  let ip = 1;
  const call = async (method, p, body, token) => {
    const headers = { Origin: "https://daydeck.day", "CF-Connecting-IP": "198.51.100." + (ip++ % 200) };
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    const res = await worker.fetch(new Request("https://svc.example" + p, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    return res.json();
  };
  const person = async (username) => {
    const email = username.replace(/\W/g, "") + "@example.com";
    await call("POST", "/a/code", { email });
    const code = /(\d{6})/.exec(mail.filter((m) => m.to[0] === email).pop().subject)[1];
    const v = await call("POST", "/a/verify", { email, code });
    const f = await call("POST", "/a/finish", { ticket: v.ticket, username });
    return { tok: f.session, user: f.user, post: (p, b) => call("POST", p, b, f.session), get: (p) => call("GET", p, null, f.session) };
  };
  const mia = await person("mia.k"), josh = await person("josh_r"), sam = await person("sam.w");
  await josh.post("/a/f/profile", { adult: true, name: "Josh", season: "Getting through exams gently", pic: "frog" });
  await sam.post("/a/f/profile", { adult: true, name: "Sam", pic: "bear" });

  // ---- The app, on a pretend iPhone, talking to that service ----
  const server = await serve(), b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (!u.pathname.startsWith("/a/")) return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } });
    const headers = { Origin: "https://daydeck.day", "CF-Connecting-IP": "192.0.2.9" };
    const auth = req.headers().authorization; if (auth) headers.Authorization = auth;
    if (req.postData()) headers["Content-Type"] = "application/json";
    const res = await worker.fetch(new Request("https://svc.example" + u.pathname + u.search, { method: req.method(), headers, body: req.postData() || undefined }), env);
    route.fulfill({ status: res.status, contentType: "application/json", body: await res.text(), headers: { "access-control-allow-origin": "*" } });
  });
  // The number on the app icon (alex 2026-11-25): notifications allowed, and the icon's number noted instead of shown.
  await ctx.addInitScript(() => { Object.defineProperty(Notification, "permission", { get: () => "granted" }); window.__badge = []; navigator.setAppBadge = (n) => (window.__badge.push(n), Promise.resolve()); navigator.clearAppBadge = () => (window.__badge.push(0), Promise.resolve()); });
  const badge = () => p.evaluate(() => window.__badge[window.__badge.length - 1]);
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const shot = async (n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + ".png") }); };
  const signIn = (tok, user) => p.evaluate(([tok, user]) => localStorage.setItem("daydeck-account", JSON.stringify({ token: tok, user, pic: { kind: "little", id: "smile" } })), [tok, user]);
  // Full days: start your day, the card done, end your day (about 6 points each).
  const daysFull = (n) => { const d = {}; for (let i = 1; i <= n; i++) d[day(i)] = { sleep: { q: 3 }, card: { id: i, done: true }, mood: 4 }; return d; };
  const setDays = (n, extra = {}) => p.evaluate(([days, extra]) => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, pillars: ["Friends", "Rest", "Move"], focus: ["Friends", "Rest"], seen: { note: "sleep", testInvite: 1 }, levels: { reset: 2, base: 0, opened: 9, seen: 1, l1: 0, tips: { days: 1, own: 1 }, ...extra } })), [daysFull(n), extra]);
  const quiet = () => p.evaluate(() => { document.querySelectorAll(".tip-layer, .sheet-host, .lu").forEach((e) => e.remove()); document.body.classList.remove("in-levelup"); });
  const tab = async (t) => { await p.click(`#pill [data-tab="${t}"]`); await p.waitForTimeout(700); };
  const text = (sel) => p.textContent(sel);

  const ana = await person("ana.p");
  await ana.post("/a/f/profile", { adult: true, name: "Ana", pic: "cat" });
  await mia.post("/a/f/profile", { adult: true, name: "Mia" });
  const befriend = async (a, an, x, xn) => { await a.post("/a/f/ask", { username: xn }); await x.post("/a/f/answer", { username: an, yes: true }); };
  await befriend(josh, "josh_r", mia, "mia.k"); await befriend(sam, "sam.w", mia, "mia.k"); await befriend(josh, "josh_r", sam, "sam.w"); await befriend(ana, "ana.p", sam, "sam.w");
  // Sam shares a card. Ana (Sam's friend, not Mia's) and Josh (both) comment on it.
  const sm = (await sam.post("/a/f/share", { day: day(0), item: "card", kind: "card", text: "Go for a slow walk", pillar: "Move", status: "Done", cap: "Took the long way" })).moment;
  await ana.post("/a/f/comment", { id: sm.id, text: "Ana's words Mia never sees" });
  await josh.post("/a/f/comment", { id: sm.id, text: "Love the long way" });

  await p.goto(server.url);
  await signIn(mia.tok, mia.user); await setDays(3, { seen: 3, tips: { friends: 1, days: 1 } }); await p.reload(); await p.waitForTimeout(1500); await quiet();
  await tab("friends"); await p.waitForTimeout(1200);
  const post = p.locator("#friends .mo-post", { hasText: "Go for a slow walk" });
  check(await post.count() === 1, "Sam's moment is in Mia's feed");
  check(!!(await post.locator(".mo-talk").count()), "a speech bubble sits beside the sun");
  check(/Josh/.test(await post.locator(".cm-last").textContent()) && /Love the long way/.test(await post.locator(".cm-last").textContent()), "the latest comment Mia may see shows under the post");
  check(!(await post.textContent()).includes("Ana's words"), "a comment from someone Mia doesn't know never shows");
  check(await post.locator(".cm-all").count() === 0, "with one comment, there's no View all comments");
  check(!/\d+ comments?/.test(await post.textContent()), "never a count of comments");
  check(!/I see you|You see them/.test(await post.locator(".mo-acts").textContent()) && await post.locator(".mo-see svg").count() === 1, "the sun has no words beside it (alex 2026-11-26)");
  await shot("c1-feed");

  // ---- The Comments page ----
  await post.locator(".mo-talk").click(); await p.waitForTimeout(900);
  const pg = ".cm-sheet";
  const close = async () => { await p.click(".sheet-dim >> nth=-1", { position: { x: 200, y: 40 } }); await p.waitForTimeout(800); };
  check(/Comments/.test(await text(pg + " .cm-title")), "the bubble opens Comments, sliding up as a sheet over the feed");
  check(!!(await p.$("#friends .mo-post")) && !(await p.$(".fr-page")), "the feed stays behind it");
  check(await p.$eval(".cm-sheet", (e) => e.getBoundingClientRect().top) >= 932 * 0.39, "the sheet is short (about 60%), so the top of the screen stays in view");
  check(!/Took the long way/.test(await text(pg)) && /Love the long way/.test(await text(pg)) && !(await text(pg)).includes("Ana's words"), "just the comments Mia may see, no caption");
  check(/Only your friends will see it/.test(await text(pg)), "it says only friends will see it");
  check(await p.getAttribute(pg + " .cm-post", "aria-disabled") === "true", "Post waits for some words");
  check(await p.$eval(pg + " .cm-post", (e) => getComputedStyle(e).backgroundColor) !== "rgb(255, 165, 31)", "the send arrow is faint while the box is empty");
  await p.fill(pg + " .cm-field", "Wish I'd come"); await p.waitForTimeout(300);
  check(await p.$eval(pg + " .cm-post", (e) => getComputedStyle(e).backgroundColor) === "rgb(255, 165, 31)", "and turns marigold once there's something to send");
  await shot("c2b-typing");
  await p.click(pg + " .cm-post"); await p.waitForTimeout(900);
  check(/Wish I'd come/.test(await text(pg + " .cm-list")) && (await p.inputValue(pg + " .cm-field")) === "", "Mia's comment is posted and the box empties");
  check((await sam.get("/a/f/comments?id=" + sm.id)).comments.some((c) => c.text === "Wish I'd come"), "Sam sees it on his moment");
  await shot("c2-page");
  // Her own: tap it, Delete comment.
  await p.locator(pg + " .cm-row", { hasText: "Wish I'd come" }).click(); await p.waitForTimeout(700);
  check(/Delete comment/.test(await text(".sheet-host:last-child .sheet")) && !/Report/.test(await text(".sheet-host:last-child .sheet")), "tapping her own comment offers Delete comment, not Report");
  await shot("c3-own");
  await p.click(".sheet-host:last-child .sheet .danger"); await p.waitForTimeout(1000);
  check(!(await text(pg)).includes("Wish I'd come") && !(await sam.get("/a/f/comments?id=" + sm.id)).comments.some((c) => c.text === "Wish I'd come"), "deleting removes it for everyone");
  // Josh's, on Sam's moment: only Report.
  await p.locator(pg + " .cm-row", { hasText: "Love the long way" }).click(); await p.waitForTimeout(700);
  check(/Report/.test(await text(".sheet-host:last-child .sheet")) && !(await p.$(".sheet-host:last-child .sheet .danger")), "on someone else's moment, a friend's comment can be reported, not removed");
  await p.click(".sheet-host:last-child .sheet .fr-sheet-btn"); await p.waitForTimeout(900);
  check(/Report this comment/.test(await text(".sheet-host:last-child .sheet")), "Report opens the report sheet for the comment");
  await p.click(".sheet-host:last-child .fr-why-row"); await p.waitForTimeout(400); await p.click(".sheet-host:last-child .fr-main"); await p.waitForTimeout(900);
  const book = made["Accountsbook"];
  check(book.rList().open.some((r) => r.comment && r.snap.comment === "Love the long way"), "the report reaches alex with a copy of the words");
  await p.click(".sheet-host:last-child .fr-main"); await p.waitForTimeout(800);
  await close();
  check(!(await p.$(".cm-sheet")), "tapping above the sheet closes it");

  // ---- Comments on Mia's own moment: the bell, and removing one ----
  const mm = (await mia.post("/a/f/share", { day: day(0), item: "rest", kind: "rest", status: "Rested", cap: "Slow day" })).moment;
  await p.reload(); await p.waitForTimeout(1500); await quiet(); await tab("friends"); await p.waitForTimeout(1000);
  await josh.post("/a/f/comment", { id: mm.id, text: "Good on you" });
  await sam.post("/a/f/comment", { id: mm.id, text: "Rest well" });
  await p.reload(); await p.waitForTimeout(1500); await quiet();
  check(await p.getAttribute('#pill [data-tab="friends"]', "data-count") === "2", "two comments on Mia's moment add to the Friends number");
  await tab("friends"); await p.waitForTimeout(800);
  const mine = p.locator("#friends .mo-post", { hasText: "Slow day" });
  check(/Rest well/.test(await mine.locator(".cm-last").textContent()) && await mine.locator(".cm-all").count() === 1, "her post shows the latest and View all comments");
  check(await mine.locator(".mo-see").count() === 1 && !/Your moment/.test(await mine.locator(".mo-acts").textContent()), "her own moment shows the sun too (alex 2026-11-27), with no words");
  await mine.scrollIntoViewIfNeeded(); await shot("c5-own-closed");
  await p.click("#friends .fr-bell"); await p.waitForTimeout(900);
  check(/New comments/.test(await text(".fr-page:last-child")) && /Josh commented: Good on you/.test(await text(".fr-page:last-child")) && /Sam commented: Rest well/.test(await text(".fr-page:last-child")), "the bell lists New comments by name and words");
  await shot("c4-bell");
  await p.locator(".fr-page:last-child .cm-note", { hasText: "Good on you" }).click(); await p.waitForTimeout(900);
  check(/Good on you/.test(await text(pg + " .cm-list")) && /Rest well/.test(await text(pg + " .cm-list")), "tapping one opens that moment's comments");
  await p.locator(pg + " .cm-row", { hasText: "Good on you" }).click(); await p.waitForTimeout(700);
  check(/Remove comment/.test(await text(".sheet-host:last-child .sheet")) && /Report/.test(await text(".sheet-host:last-child .sheet")), "on her own moment, Mia can remove or report a friend's comment");
  await p.click(".sheet-host:last-child .sheet .danger"); await p.waitForTimeout(1000);
  check(!(await text(pg + " .cm-list")).includes("Good on you"), "removing it takes it off her moment");
  await close();
  await p.click(".fr-page:last-child .fr-page-head button"); await p.waitForTimeout(800);
  check(!(await p.getAttribute('#pill [data-tab="friends"]', "data-count")), "after the bell, the number clears");
  check(!(await mine.textContent()).includes("Good on you"), "the post under it shows the change too");

  // ---- "I see you": the animation, and who said it (alex 2026-11-27) ----
  await p.reload(); await p.waitForTimeout(1500); await quiet(); await tab("friends"); await p.waitForTimeout(1000);
  const sp = p.locator("#friends .mo-post", { hasText: "Go for a slow walk" });
  { const a = await sp.locator(".mo-see").boundingBox(), c = await sp.locator(".mo-talk").boundingBox();
    check(c.x - (a.x + a.width) < 0, "the sun and the speech bubble sit close together"); }
  await sp.locator(".mo-acts").scrollIntoViewIfNeeded(); await p.evaluate(() => document.querySelector("#friends").scrollBy(0, 200)); await p.waitForTimeout(400);
  await sp.locator(".mo-see").click(); await p.waitForTimeout(60);
  check(await sp.locator(".mo-see").getAttribute("aria-pressed") === "true" && await sp.locator(".mo-see.see-on").count() === 1, "pressing the sun marigolds it straight away, with the pop");
  { const a = await sp.locator(".mo-see").boundingBox(), c = await sp.locator(".mo-talk").boundingBox(); check(Math.abs(a.y - c.y) < 2, "the sun stays in its row while it pops"); }
  await p.waitForTimeout(120); await shot("c6-pop"); await p.waitForTimeout(800);
  check((await sam.get("/a/f/feed")).moments.find((x) => x.id === sm.id).seers.some((x) => x.username === "mia.k"), "and it reaches the service");
  check(/Mia/.test(await sp.locator(".mo-seers").textContent()), "her name joins who said it");
  await sp.locator(".mo-see").click(); await p.waitForTimeout(60);
  check(await sp.locator(".mo-see").getAttribute("aria-pressed") === "false" && await sp.locator(".mo-see.see-off").count() === 1, "pressing again takes it back, with the shrink");
  await p.waitForTimeout(900);
  // Mia's own moment: the sun shows who said it.
  await josh.post("/a/f/see", { id: mm.id }); await sam.post("/a/f/see", { id: mm.id });
  await p.reload(); await p.waitForTimeout(1500); await quiet(); await tab("friends"); await p.waitForTimeout(1000);
  const own = p.locator("#friends .mo-post", { hasText: "Slow day" });
  await own.locator(".mo-see").click(); await p.waitForTimeout(700);
  check(/I see you/.test(await text(".sheet-host:last-child .sheet")) && /Josh/.test(await text(".sheet-host:last-child .sheet")) && /Sam/.test(await text(".sheet-host:last-child .sheet")), "on her own moment, the sun opens who said I see you");
  check((await sam.get("/a/f/feed")).moments.find((x) => x.id === mm.id).seers.every((x) => x.username !== "mia.k"), "tapping her own sun never says it to herself");
  await shot("c7-seen-by");
  await p.click(".sheet-host:last-child .mo-seen-row"); await p.waitForTimeout(900);
  check(!!(await p.$(".fr-page")), "tapping someone opens their profile");

  // ---- What testers hear ----
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "comments.js"), "utf8");
  const logs = [...src.matchAll(/log\(([^;]*?)\);/g)].map((m) => m[1]);
  check(logs.length >= 3 && logs.every((l) => !/text|\.name\b|shown\(|value/.test(l)), "tester logs from comments carry actions only, never words");

  check(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); globalThis.fetch = realFetch;
  done();
})();
