// Friends in the app (js/friends.js, social step 2; alex 2026-11-20). Runs the real Daydeck service (push/) inside
// the test, with a pretend iPhone 15 Pro Max as Mia and made-up friends (Josh, Sam). Checks: Friends opens at level 4
// (with its tip), the 18+ tick, requests and the small dot, adding by @username, a friend's profile, remove and
// block, invite links, Edit profile, Privacy, and no orange on the friends screens. SHOTS=1 saves pictures.
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
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const shot = async (n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + ".png") }); };
  const signIn = (tok, user) => p.evaluate(([tok, user]) => localStorage.setItem("daydeck-account", JSON.stringify({ token: tok, user, pic: { kind: "little", id: "smile" } })), [tok, user]);
  // Full days: start your day, the card done, end your day (about 6 points each).
  const daysFull = (n) => { const d = {}; for (let i = 1; i <= n; i++) d[day(i)] = { sleep: { q: 3 }, card: { id: i, done: true }, mood: 4 }; return d; };
  const setDays = (n, extra = {}) => p.evaluate(([days, extra]) => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, pillars: ["Friends", "Rest", "Move"], focus: ["Friends", "Rest"], seen: { note: "sleep" }, levels: { reset: 2, base: 0, opened: 9, seen: 3, tips: { days: 1, own: 1 }, ...extra } })), [daysFull(n), extra]);
  const quiet = () => p.evaluate(() => { document.querySelectorAll(".tip-layer, .sheet-host, .lu").forEach((e) => e.remove()); document.body.classList.remove("in-levelup"); });
  const tab = async (t) => { await p.click(`#pill [data-tab="${t}"]`); await p.waitForTimeout(700); };
  const text = (sel) => p.textContent(sel);

  // ---- Before level 4: the pill is there, Friends waits as a dashed ring (alex 2026-11-25) ----
  await p.goto(server.url);
  await signIn(mia.tok, mia.user); await setDays(2); await p.reload(); await p.waitForTimeout(1500);
  check(!!(await p.$('#pill [data-tab="friends"].not-yet')), "before level 4: Friends is a dashed ring in the pill");

  // ---- Level 4 (about day 4 of full days): Friends opens, with its moment and tip ----
  await setDays(4); await p.reload(); await p.waitForTimeout(1500);
  check(/Level 4/.test(await text(".lu-title")), "four full days reach level 4: the level-up moment shows");
  check(!!(await p.$("#pill")) && !(await p.$('#pill [data-tab="friends"].not-yet')), "at level 4 Friends opens in the pill");
  check(!(await p.$('#home button[aria-label="Cards"]')), "the card library has moved to level 5, so it isn't open yet");
  await p.waitForTimeout(4600);
  check(/Friends/.test(await text(".lu-front")) && /Open Friends/.test(await text(".lu-btns")), "its card shows Friends, with Open Friends (in place of the old tip)");
  await shot("1-tip");
  await p.click(".lu-btns .btn-quiet"); await p.waitForTimeout(2600);
  check(!(await p.$(".lu")) && !(await p.$(".tip-box")), "Later closes it, and the old pointing tip doesn't follow");
  await quiet();

  // Someone who already had the card library open keeps it (nothing is ever taken away).
  await setDays(4, { tips: { days: 1, own: 1, library: 1 } }); await p.reload(); await p.waitForTimeout(1500); await quiet();
  check(!!(await p.$('#home button[aria-label="Cards"]')), "someone who already had the card library keeps it after the move to level 5");

  // ---- The 18+ tick ----
  await tab("friends");
  check(/18 and over/.test(await text("#friends")), "Friends asks, the first time, if you're 18 or over");
  check(await p.getAttribute('#friends a[href="guidelines.html"]', "href") === "guidelines.html" && /you agree to the Friends guidelines/.test(await text("#friends")), "and says continuing means agreeing to the Friends guidelines, with a link");
  check(await p.getAttribute("#friends .fr-main", "aria-disabled") === "true", "Continue waits for the tick");
  await shot("2-adult");
  await p.click("#friends .fr-tick"); await p.click("#friends .fr-main"); await p.waitForTimeout(800);
  check((await mia.get("/a/f")).me.adult === true, "ticking it is kept with the account");
  check(/Add a few friends/.test(await text("#friends")), "then a calm start: Add a few friends");
  const bg = await p.$eval("#friends .fr-main", (e) => getComputedStyle(e).backgroundColor);
  check(bg === "rgb(239, 237, 233)", "the main button is off-white, never orange");
  await shot("3-empty");

  // ---- A request waiting: the small dot, then Accept ----
  await josh.post("/a/f/ask", { username: "mia.k" });
  await p.reload(); await p.waitForTimeout(1500); await quiet();
  check(await p.$eval('#pill [data-tab="friends"]', (e) => e.classList.contains("dot")), "a waiting request shows as a small dot on Friends (no number)");
  await tab("friends");
  check(/Friend requests/.test(await text("#friends")) && /Josh/.test(await text("#friends")), "Josh's request shows at the top of Friends");
  await shot("4-request");
  await p.click('#friends .fr-btn.main'); await p.waitForTimeout(900);
  check(/Josh/.test(await text("#friends .fr-faces-row")) && /Nothing shared yet/.test(await text("#friends")), "accepted: Josh is in the row of friends' faces, and the feed waits for a moment");
  check(!(await p.$eval('#pill [data-tab="friends"]', (e) => e.classList.contains("dot"))), "the dot goes once nothing is waiting");
  check((await josh.get("/a/f")).friends.some((f) => f.username === "mia.k"), "and they're friends on the service, both ways");
  await shot("5-friends");

  // ---- Josh's profile ----
  await p.click("#friends .fr-face"); await p.waitForTimeout(900);
  const prof = await text(".fr-page:last-child");
  check(/Josh/.test(prof) && /@josh_r/.test(prof) && /1 friend(?!s)/.test(prof) && /This season/.test(prof) && /Josh's moments/.test(prof), "Josh's profile: name, @username, friends count, This season and his moments");
  check(await p.$eval("#pill", (e) => getComputedStyle(e).opacity) === "0", "the pill steps aside on a full page");
  await shot("6-profile");
  await p.click('.fr-page:last-child button[aria-label="More"]'); await p.waitForTimeout(600);
  check(/Remove friend/.test(await text(".sheet-host")) && /Block @josh_r/.test(await text(".sheet-host")), "••• has Remove friend and Block");
  await shot("7-more");
  await p.click('.sheet-host button:has-text("Remove friend")'); await p.waitForTimeout(700);
  check(/They won't be told/.test(await text(".sheet-host:last-child")), "removing says they won't be told");
  await p.click('.sheet-host:last-child .fr-main'); await p.waitForTimeout(1100);
  check((await mia.get("/a/f")).friends.length === 0 && !(await p.$(".fr-page.open")), "removed on the service, and back to Friends");

  // ---- Add friends by @username ----
  await p.click('#friends button[aria-label="Add friends"]'); await p.waitForTimeout(700);
  await p.fill(".fr-page:last-child .fr-field", "sam"); await p.click(".fr-page:last-child .fr-find"); await p.waitForTimeout(700);
  check(/No one by that name/.test(await text(".fr-page:last-child")), "part of a name finds nobody");
  await p.fill(".fr-page:last-child .fr-field", "@Sam.W"); await p.click(".fr-page:last-child .fr-find"); await p.waitForTimeout(700);
  check(/Sam/.test(await text(".fr-page:last-child .fr-found")), "their exact @username finds them (capitals and @ don't matter)");
  await shot("8-add");
  await p.click(".fr-page:last-child .fr-found .fr-btn.main"); await p.waitForTimeout(900);
  check(/Asked/.test(await text(".fr-page:last-child .fr-found")) && /Waiting for them/.test(await text(".fr-page:last-child")), "Add sends a request, shown as Asked and under Waiting for them");
  check((await sam.get("/a/f")).asksYou.some((x) => x.username === "mia.k"), "Sam sees Mia's request");
  await shot("9-asked");
  await p.click('.fr-page:last-child button[aria-label="Back"]'); await p.waitForTimeout(600);

  // ---- An invite link ----
  const inv = await josh.post("/a/f/invite", {});
  await p.goto(server.url + "/?add=" + inv.t); await p.waitForTimeout(2600);
  check(!/add=/.test(p.url()), "the invite link is tidied from the address");
  check((await mia.get("/a/f")).asksYou.some((x) => x.username === "josh_r"), "opening Josh's invite leaves his request waiting for Mia");
  check(await p.$eval("body", (b) => b.dataset.tab) === "friends" && /Josh/.test(await text("#friends")), "and Daydeck shows it in Friends");
  await p.click('#friends .fr-btn.main'); await p.waitForTimeout(900);
  check((await mia.get("/a/f")).friends.some((f) => f.username === "josh_r"), "Mia accepts: friends again");

  // ---- You: Edit profile ----
  await quiet(); await tab("you");
  check(/mia\.k/.test(await text("#you")) && /1 friend/.test(await text("#you")) && /What you've shared/.test(await text("#you")), "You shows your @username, friends count and what you've shared");
  await p.click('#you button:has-text("Edit")'); await p.waitForTimeout(700);
  const fields = await p.$$(".fr-page:last-child .fr-field");
  await fields[0].fill("Mia"); await fields[1].fill("Sleeping more and seeing friends");
  await shot("10-edit");
  await p.click(".fr-page:last-child .fr-main"); await p.waitForTimeout(1000);
  const me = (await mia.get("/a/f")).me;
  check(me.name === "Mia" && me.season === "Sleeping more and seeing friends", "Edit saves your name and This season");
  check(/Sleeping more and seeing friends/.test(await text("#you")) && /Mia/.test(await text("#you .fr-prof-name")), "and You shows them");
  await shot("11-you");

  // ---- Sharing a moment (step 3) ----
  await sam.post("/a/f/answer", { username: "mia.k", yes: true });
  // Today's card is done, and the day has a mood: there's something to share.
  await p.evaluate(([k]) => { const s = JSON.parse(localStorage.getItem("daydeck")); s.days[k] = { sleep: { q: 3 }, card: { id: 5, done: true }, mood: 4, feel: ["Calm", "Hopeful"] }; localStorage.setItem("daydeck", JSON.stringify(s)); }, [day(0)]);
  await p.reload(); await p.waitForTimeout(1800); await quiet();
  const link = await p.$("#home .share-link");
  check(!!link, "a quiet Share with friends sits under a done card (no pop-up)");
  await shot("13-home-share");
  await tab("friends");
  check(/Share a moment/.test(await text("#pill .pill-act")), "on Friends the pill's button is Share a moment");
  const wFr = await p.$eval("#pill", (e) => Math.round(e.getBoundingClientRect().width));
  await p.click("#pill .pill-share"); await p.waitForTimeout(800);
  const sh = ".fr-page:last-child";
  const dayW = () => p.$eval(`${sh} .mo-day`, (e) => Math.round(e.getBoundingClientRect().width));
  const bigW = await dayW();
  check(/Which day/.test(await text(sh)) && await p.$eval(`${sh} .mo-days`, (e) => e.classList.contains("big")) && bigW > 200, `Share a moment opens with the days big, to pick by photo (${bigW}px wide)`);
  check(!(await p.$(`${sh} .fr-main`)) && /Pick a day/.test(await text(sh)), "nothing can be shared until a day is picked");
  await shot("14a-share-big");
  await p.click(`${sh} .mo-day[data-day="${day(0)}"]`); await p.waitForTimeout(700);
  const smallW = await dayW();
  check(smallW < 90 && /Your card/.test(await text(sh)), `picking a day shrinks the row (${smallW}px) and shows what to share (your card, no photo today)`);
  await p.click(`${sh} .mo-day[data-day="${day(0)}"]`); await p.waitForTimeout(700);
  check(await dayW() > 200, "tapping the row makes it big again");
  await p.click(`${sh} .mo-day[data-day="${day(0)}"]`); await p.waitForTimeout(700);
  check(await p.getAttribute(`${sh} button[aria-label="Add how the day felt"]`, "aria-checked") === "false", "how the day felt is off unless they choose it");
  check(/Good · Calm, Hopeful/.test(await text(sh)), "and it says, in words, what would be shared");
  await p.click(`${sh} button[aria-label="Add how the day felt"]`);
  await p.fill(`${sh} textarea`, "Walked to work instead of the bus");
  await shot("14-share");
  await p.click(`${sh} .fr-main`); await p.waitForTimeout(1600);
  let samFeed = (await sam.get("/a/f/feed")).moments;
  check(samFeed.length === 1 && samFeed[0].cap === "Walked to work instead of the bus" && samFeed[0].mood === "good" && samFeed[0].kind === "card", "Sam gets it: her card, her words, and Felt good");
  check(await p.$eval("body", (b) => b.dataset.tab) === "friends" && /Walked to work/.test(await text("#friends")) && /You're all caught up/.test(await text("#friends")), "Mia lands on Friends, with her moment in the feed and You're all caught up at the end");
  check(wFr === await p.$eval("#pill", (e) => Math.round(e.getBoundingClientRect().width)), "the pill stays the same size");
  // Sam shares too, and says I see you
  await sam.post("/a/f/share", { day: day(1), item: "rest", kind: "rest", text: "", status: "Rested", cap: "Slept in, no guilt" });
  await sam.post("/a/f/see", { id: samFeed[0].id });
  await tab("you"); await tab("friends"); await p.waitForTimeout(1200);
  const fr = await text("#friends");
  check(/Slept in, no guilt/.test(fr) && /Rested/.test(fr) && fr.indexOf("Slept in") < fr.indexOf("Walked to work"), "Sam's moment shows too, newest first");
  check(/Sam said I see you|Sam/.test(await p.getAttribute("#friends .mo-seers", "aria-label")), "Mia sees that Sam said I see you, by name");
  check(!/\b1\b/.test(await text("#friends .mo-acts")), "with no number anywhere");
  check(!/\bnull\b|undefined/.test(await text("#friends")), "no stray null or undefined on screen");
  await shot("15-feed");
  const samPost = p.locator("#friends .mo-post", { hasText: "Slept in" });
  await samPost.locator(".mo-see").click(); await p.waitForTimeout(800);
  check((await sam.get("/a/f/feed")).moments.find((m) => m.cap === "Slept in, no guilt").seers.some((x) => x.username === "mia.k"), "Mia says I see you back");
  // Profile photos (alex 2026-11-22): friends see each other's photo pictures
  // Made the way the app makes one: a 240 by 240 square, cleaned (nothing but the picture).
  const facePhoto = (col) => p.evaluate(async (col) => {
    const ph = await import("./js/photos.js"), c = document.createElement("canvas"); c.width = 240; c.height = 240;
    const x = c.getContext("2d"); x.fillStyle = col; x.fillRect(0, 0, 240, 240);
    const b = await ph.clean(await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85)));
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  }, col);
  check((await sam.post("/a/f/profile", { pic: "photo", photo: await facePhoto("#a9c4b5") })).ok, "Sam picks a photo for his picture");
  await tab("you"); await tab("friends"); await p.waitForTimeout(1200);
  check(!!(await p.$('#friends .mo-post:has-text("Slept in") .mo-who .pic img')), "Mia sees Sam's photo on his moment");
  const miaFace = await facePhoto("#d9b3a6");
  await p.evaluate((data) => { const a = JSON.parse(localStorage.getItem("daydeck-account")); a.pic = { kind: "photo", data }; localStorage.setItem("daydeck-account", JSON.stringify(a)); }, miaFace);
  await p.reload(); await p.waitForTimeout(1800); await quiet(); await tab("friends"); await p.waitForTimeout(1200);
  check((await sam.get("/a/f/face?u=mia.k")).data === miaFace, "Mia's photo picture reaches her friends");
  check((await sam.get("/a/f")).friends.find((x) => x.username === "mia.k").pic === "photo", "and Sam's list shows she has one");
  check(!!(await p.$('#friends .mo-post:has-text("Walked to work") .mo-who .pic img')), "Mia sees her own photo on her own moment");
  // Photos first: yesterday has a photo, so it's offered before the card
  await p.evaluate(async (k) => { const ph = await import("./js/photos.js"); const c = document.createElement("canvas"); c.width = ph.W; c.height = ph.H; const x = c.getContext("2d"); x.fillStyle = "#6b7f72"; x.fillRect(0, 0, c.width, c.height); x.fillStyle = "#e3c486"; x.beginPath(); x.arc(700, 500, 160, 0, 7); x.fill(); await ph.save(k, c, { src: "lib" }); }, day(1));
  await p.waitForTimeout(500);
  await p.click("#pill .pill-share"); await p.waitForTimeout(900);
  check(!!(await p.$(`${sh} .mo-day[data-day="${day(1)}"] img`)), "a day with a photo shows its photo in the day row");
  await shot("17-share-photo-big");
  await p.click(`${sh} .mo-day[data-day="${day(1)}"]`); await p.waitForTimeout(800);
  const firstPick = await p.$eval(`${sh} .mo-pick`, (e) => e.textContent);
  check(/Your photo/.test(firstPick) && await p.getAttribute(`${sh} .mo-pick`, "aria-checked") === "true", "the photo comes first, already picked; the card is there if they'd rather");
  await shot("18-share-photo");
  await p.click(`${sh} .fr-main`); await p.waitForTimeout(2200);
  const ph = (await sam.get("/a/f/feed")).moments.find((m) => m.kind === "photo");
  const got = ph && await sam.get("/a/f/photo?id=" + ph.id);
  check(ph && ph.ph && got.data && got.data.startsWith("data:image/jpeg;base64,") && got.data.length < 440000, "the photo reaches Sam, shrunk");
  const bytes = got && Buffer.from(got.data.slice(23), "base64");
  check(bytes && !bytes.includes(Buffer.from("Exif")) && !bytes.includes(Buffer.from("http://ns.adobe.com")), "with nothing but the picture (no Exif or other details)");
  await p.waitForTimeout(800);
  check(!!(await p.$("#friends .mo-tile.photo img[src^='data:image/jpeg']")), "and it shows in the feed");
  await shot("19-feed-photo");

  // Your friends, A to Z, with search: from the friends count on You
  await quiet(); await tab("you"); await p.waitForTimeout(900);
  await p.click("#you .fr-count"); await p.waitForTimeout(800);
  const fl = ".fr-page:last-child";
  check(/Your friends/.test(await text(fl)) && /Only you see this list/.test(await text(fl)), "tapping the friends count opens Your friends (only you see it)");
  const namesInList = await p.$$eval(`${fl} .fr-name`, (els) => els.map((e) => e.textContent));
  check(namesInList.join() === "Josh,Sam", `A to Z: ${namesInList.join(", ")}`);
  await shot("20-friends-list");
  await p.fill(`${fl} .fr-search-box`, "sa"); await p.waitForTimeout(300);
  check((await p.$$eval(`${fl} .fr-name`, (els) => els.map((e) => e.textContent))).join() === "Sam", "typing narrows it to matching friends");
  await p.fill(`${fl} .fr-search-box`, "@josh"); await p.waitForTimeout(300);
  check((await p.$$eval(`${fl} .fr-name`, (els) => els.map((e) => e.textContent))).join() === "Josh", "@usernames work too");
  await shot("21-friends-search");
  await p.fill(`${fl} .fr-search-box`, "zz"); await p.waitForTimeout(300);
  check(/No friends called/.test(await text(fl)), "and it says so kindly when nobody matches");
  await p.fill(`${fl} .fr-search-box`, "sam"); await p.click(`${fl} .fr-open`); await p.waitForTimeout(1000);
  check(/@sam\.w/.test(await text(".fr-page:last-child")) && /moments/.test(await text(".fr-page:last-child")), "tapping a friend opens their profile");
  await p.click('.fr-page:last-child button[aria-label="Back"]'); await p.waitForTimeout(500);
  await p.click('.fr-page:last-child button[aria-label="Back"]'); await p.waitForTimeout(600);

  // Report (step 5): from the ••• on Sam's moment
  await tab("friends"); await p.waitForTimeout(1000);
  await p.locator("#friends .mo-post", { hasText: "Slept in" }).locator(".mo-more").click(); await p.waitForTimeout(600);
  check(/Report/.test(await text(".sheet-host:last-child")) && /Hide their moments/.test(await text(".sheet-host:last-child")), "a friend's moment's ••• has Hide their moments and Report");
  await p.click('.sheet-host:last-child button:has-text("Report")'); await p.waitForTimeout(700);
  check(/Report this moment/.test(await text(".sheet-host:last-child")) && /won't know it was you/.test(await text(".sheet-host:last-child")), "Report: why, and they won't know it was you");
  check(!!(await p.$('.sheet-host:last-child a[href="guidelines.html"]')), "with a link to the Friends guidelines");
  await shot("22-report");
  await p.click('.sheet-host:last-child button:has-text("They might not be safe")'); await p.waitForTimeout(400);
  await p.fill(".sheet-host:last-child textarea", "Worried about them");
  await p.click(".sheet-host:last-child .fr-main"); await p.waitForTimeout(1000);
  const thanks = await text(".sheet-host:last-child");
  check(/Thanks for telling us/.test(thanks) && /000/.test(thanks) && /Lifeline/.test(thanks), "thanks, and for someone who might not be safe: 000 and Lifeline");
  check(/Also hide/.test(thanks) && /Also block/.test(thanks), "with the choice to also hide or block");
  await shot("23-report-thanks");
  const rl = await call("GET", "/t/reports", null, "made-up-tester-key-123");
  check(rl.open && rl.open.some((x) => x.why === "risk" && x.note === "Worried about them" && x.by === "mia.k" && x.who === "sam.w"), "alex sees the report on the tester page");
  await p.click('.sheet-host:last-child button:has-text("Done")'); await p.waitForTimeout(500);

  // Her grid, and tapping a tile
  await tab("you"); await p.waitForTimeout(1200);
  check(!!(await p.$("#you .mo-grid .mo-cell")), "What you've shared is a grid");
  await shot("16-you-grid");
  await p.click("#you .mo-cell"); await p.waitForTimeout(900);
  check(/Your moments/.test(await text(".fr-page:last-child")) && !!(await p.$(".fr-page:last-child .mo-post")), "tapping a tile opens your moments as a feed");
  await p.click('.fr-page:last-child button[aria-label="Back"]'); await p.waitForTimeout(600);

  // ---- Privacy (Settings → Privacy) ----
  await p.click('#you button[aria-label="Settings"]'); await p.waitForTimeout(700);
  await p.click('#settings button:has-text("Who can see you")'); await p.waitForTimeout(700);
  check(/Only your friends can see you/.test(await text(".fr-page:last-child")), "Privacy says only friends can see you");
  check(await p.getAttribute('.fr-page:last-child button[aria-label="Share my mood"]', "aria-checked") === "false", "Share my mood is in Privacy, off by default");
  await p.click('.fr-page:last-child button[aria-label="Show your friends count"]'); await p.waitForTimeout(700);
  check((await mia.get("/a/f")).me.hide === true, "hiding your friends count is saved");
  const swBg = await p.$eval('.fr-page:last-child button[aria-label="Friend requests"]', (e) => getComputedStyle(e).backgroundColor);
  check(swBg === "rgb(255, 165, 31)", "switches that are on are marigold (alex 2026-11-24)");
  await shot("12-privacy");
  check((await josh.get("/a/f/person?u=mia.k")).person.friends === null, "Josh no longer sees Mia's friends count");

  // ---- Block ----
  await p.click('.fr-page:last-child button[aria-label="Back"]'); await p.waitForTimeout(500);
  await p.click('#settings button[aria-label="Back to home"]'); await p.waitForTimeout(600);
  await tab("friends"); await p.click("#friends .fr-face"); await p.waitForTimeout(900);
  await p.click('.fr-page:last-child button[aria-label="More"]'); await p.waitForTimeout(600);
  await p.click('.sheet-host button:has-text("Block")'); await p.waitForTimeout(700);
  await p.click('.sheet-host:last-child .fr-main'); await p.waitForTimeout(1100);
  check((await josh.get("/a/f/find?u=mia.k")).found === false, "after blocking, Josh can't find Mia");

  // ---- Without an account ----
  await p.evaluate(() => localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })));
  await p.reload(); await p.waitForTimeout(1500); await quiet(); await tab("friends");
  check(/Friends need an account/.test(await text("#friends")), "without an account, Friends says it needs one");
  check(/Lifeline/.test(await text("#friends")), "Lifeline is one tap away on Friends");

  // ---- What testers hear: only what people do, never names or words ----
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "friends.js"), "utf8");
  const logs = [...src.matchAll(/log\(([^;]*?)\);/g)].map((m) => m[1]);
  check(logs.length >= 8 && logs.every((l) => !/username|\.name\b|season\.value\)|name\.value\)|shown\(/.test(l)), "tester logs from Friends carry actions only, never names or typed words");

  check(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); globalThis.fetch = realFetch;
  done();
})();
