// The glass pill (js/pill.js, social stage 1 step 1; alex 2026-11-20): Today · Friends · You beside the main action,
// there from day one, with Friends as a dashed ring until level 4 (alex 2026-11-25). Made-up data only. SHOTS=1 saves a picture of each tab.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const { serve, checker } = require("./helpers.cjs");
const SHOTS = process.env.SHOTS ? path.join(__dirname, "..", "..", "pill-shots") : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.addInitScript(() => { if (!localStorage.getItem("daydeck-account")) localStorage.setItem("daydeck-account", JSON.stringify({ token: "T", user: { username: "mia.k", email: "mia@example.com" } })); });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const shot = async (n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + ".png") }); };
  const days = {}; for (let i = 1; i < 6; i++) days[day(i)] = { mood: 3, sleep: { q: 3 } };
  days[day(0)] = { sleep: { q: 3 }, card: { id: 1 } };
  await p.goto(server.url);
  await p.evaluate((days) => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "sleep" }, levels: { seen: 3 } })), days);

  // ---- Before Friends opens (alex 2026-11-25): the pill is there from day one, Friends waits as a dashed ring ----
  await p.reload(); await p.waitForTimeout(1500);
  const NY = '#pill [data-tab="friends"].not-yet';
  check(!!(await p.$("#pill")), "the pill is there before Friends opens, so home never rearranges at level 4");
  check(!!(await p.$(NY + " .ny-ring")), "Friends sits in the pill as an empty dashed ring");
  check(/opens at level 4/.test(await p.getAttribute('#pill [data-tab="friends"]', "aria-label")), "and says when it opens to screen readers");
  check(!(await p.$('#home button[aria-label="Settings"]')), "Settings lives on You from day one, not on home");
  check(!!(await p.$("#home .dd-head .round.not-yet .ny-ring")), "the card library waits in its corner as a dashed ring too");
  await p.click(NY); await p.waitForTimeout(400);
  const nyText = await p.textContent(".ny-box").catch(() => "");
  check(/Friends opens at level 4\./.test(nyText) && /Start and end your days to get there\./.test(nyText), "tapping it says when Friends opens and what gets you there");
  check(!/\d+ (points|days?) to go/.test(nyText), "never a countdown");
  check(await p.evaluate(() => document.body.dataset.tab) === "today", "and you stay on Today");
  await p.waitForTimeout(3900);
  check(!(await p.$(".ny-layer")), "the bubble fades by itself");
  await p.click("#home .dd-head .round.not-yet"); await p.waitForTimeout(400);
  check(/Card library opens at level 5\./.test(await p.textContent(".ny-box").catch(() => "")), "the card library's ring says level 5");
  await p.mouse.click(215, 500); await p.waitForTimeout(400);
  check(!(await p.$(".ny-layer")), "a tap anywhere closes the bubble");
  await p.click('#pill [data-tab="you"]'); await p.waitForTimeout(500);
  const act = await p.$$eval("#pill .pill-act button", (b) => b.map((x) => x.textContent));
  check(act.length === 1 && !/Share a moment/.test(act[0]), "on You, Today's action stays in the pill (nothing to share yet), so the pill keeps its shape");
  await p.click('#pill [data-tab="today"]'); await p.waitForTimeout(500);

  // ---- The service says "early" after the app has already drawn home: the pill appears without reopening ----
  await ctx.route("https://intentionally-push.lextdo.workers.dev/a/me", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { username: "mia.k", email: "mia@example.com", early: true }, passkeys: 1 }), headers: { "access-control-allow-origin": "*" } }));
  await p.reload(); await p.waitForTimeout(2000);
  check(!!(await p.$("#pill")) && !(await p.$(NY)), "when the service says the account is early, Friends opens straight away, without reopening the app");
  await ctx.unroute("https://intentionally-push.lextdo.workers.dev/a/me");
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("daydeck")); delete s.levels.early; localStorage.setItem("daydeck", JSON.stringify(s)); const a = JSON.parse(localStorage.getItem("daydeck-account")); delete a.user.early; localStorage.setItem("daydeck-account", JSON.stringify(a)); });

  // ---- Accounts from before Friends went live get it straight away, whatever their level ----
  await p.evaluate(() => { const a = JSON.parse(localStorage.getItem("daydeck-account")); a.user.early = true; localStorage.setItem("daydeck-account", JSON.stringify(a)); });
  await p.reload(); await p.waitForTimeout(1500);
  check(!!(await p.$("#pill")) && !(await p.$(NY)), "an early account (from before Friends went live) gets Friends at level 3");
  await p.evaluate(() => { const a = JSON.parse(localStorage.getItem("daydeck-account")); delete a.user.early; localStorage.setItem("daydeck-account", JSON.stringify(a)); });
  await p.reload(); await p.waitForTimeout(1500);
  check(!!(await p.$("#pill")) && !(await p.$(NY)), "and once opened, it stays open on that phone");
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("daydeck")); delete s.levels.early; localStorage.setItem("daydeck", JSON.stringify(s)); });

  // ---- Test mode: the pill ----
  await p.goto(server.url + "?test"); await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelectorAll(".tip-layer, .sheet-host").forEach((e) => e.remove()));
  check(!!(await p.$("#pill")), "in test mode the glass pill is there");
  const tabs = await p.$$eval("#pill .pill-tab", (bs) => bs.map((x) => x.getAttribute("aria-label")));
  check(tabs.join() === "Today,Friends,You", "its tabs are Today, Friends, You, in that order");
  check(await p.$eval("body", (b) => b.dataset.tab) === "today", "Daydeck opens on Today");
  check(/Do your card|End your day|Draw your card|Start your day|Change today|Going to sleep/.test(await p.textContent("#pill .pill-act")), "the main action sits in the pill");
  check(!(await p.$('#home button[aria-label="Settings"]')), "Settings has moved off home");
  check(!/Lifeline/.test(await p.textContent("#home")), "Lifeline is no longer on home (alex 2026-11-23: it lives in check-ins, draws, Your days and Friends)");
  const blur = await p.$eval("#pill", (e) => getComputedStyle(e).backdropFilter || getComputedStyle(e).webkitBackdropFilter || "");
  check(/blur/.test(blur), "the pill is see-through glass");
  await shot("1-today");

  // ---- Friends ----
  await p.click('#pill [data-tab="friends"]'); await p.waitForTimeout(600);
  check(await p.$eval("body", (b) => b.dataset.tab) === "friends", "tapping Friends goes to Friends");
  check(await p.$eval('#pill [data-tab="friends"]', (e) => e.getAttribute("aria-current")) === "page", "the Friends tab is marked as the current one");
  check(/Friends/.test(await p.textContent("#friends")) && /Lifeline/.test(await p.textContent("#friends")), "Friends shows, with Lifeline one tap away");
  const bub = await p.$eval(".pill-bubble", (e) => e.getBoundingClientRect().left);
  check(bub > 60, "the highlight has glided across to Friends");
  check(await p.$eval("#home", (e) => getComputedStyle(e).pointerEvents) === "none", "Today steps aside");
  await shot("2-friends");

  // ---- You ----
  await p.click('#pill [data-tab="you"]'); await p.waitForTimeout(600);
  const you = await p.textContent("#you");
  check(/mia\.k/.test(you) && !!(await p.$("#you .you-pic svg, #you .you-pic img")), "You shows your picture and username");
  await shot("3-you");
  await p.click('#you button[aria-label="Settings"]'); await p.waitForTimeout(700);
  check(!!(await p.$("#settings")), "Settings opens from You");
  check(await p.$eval("#pill", (e) => getComputedStyle(e).opacity) === "0", "the pill hides while Settings is open");
  await p.click('#settings button[aria-label="Back to home"]'); await p.waitForTimeout(700);
  check(await p.$eval("#pill", (e) => getComputedStyle(e).opacity) === "1", "and comes back after");

  // ---- The pill keeps its shape on every tab (no jump), and the action turns off-white off Today ----
  const w = await p.$eval("#pill", (e) => Math.round(e.getBoundingClientRect().width));
  const bg = await p.$eval("#pill .pill-act > button", (e) => getComputedStyle(e).backgroundColor);
  check(/239, 237, 233/.test(bg), "on the social tabs the action is off-white, never orange");

  // ---- Press and slide: the highlight follows your finger ----
  const box = async (t) => p.$eval(`#pill [data-tab="${t}"]`, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const a = await box("you"), z = await box("today");
  await p.mouse.move(a.x, a.y); await p.mouse.down();
  await p.mouse.move((a.x + z.x) / 2, a.y, { steps: 5 });
  const mid = await p.$eval(".pill-bubble", (e) => e.getBoundingClientRect().left + e.getBoundingClientRect().width / 2);
  check(Math.abs(mid - (a.x + z.x) / 2) < 12, "while sliding, the highlight sits under your finger");
  await p.mouse.move(z.x, z.y, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(600);
  check(await p.$eval("body", (b) => b.dataset.tab) === "today", "letting go over Today opens Today");
  const w2 = await p.$eval("#pill", (e) => Math.round(e.getBoundingClientRect().width));
  check(w === w2, `the pill is the same size on Today as on You (${w2} and ${w}), so nothing jumps`);
  check(!/239, 237, 233/.test(await p.$eval("#pill .pill-act > button", (e) => getComputedStyle(e).backgroundColor)), "back on Today the action is its usual colour");

  // ---- Back to Today; flows hide the pill ----
  check(await p.$eval("#home", (e) => getComputedStyle(e).pointerEvents) !== "none", "Today comes back");
  await p.evaluate(() => document.body.classList.add("in-flow")); await p.waitForTimeout(450);
  check(await p.$eval("#pill", (e) => getComputedStyle(e).opacity) === "0", "the pill hides during a check-in");
  await p.evaluate(() => document.body.classList.remove("in-flow"));

  // ---- Tester mode hears only which tab ----
  const q = await p.evaluate(() => JSON.stringify(((JSON.parse(localStorage.getItem("daydeck")).tester) || {}).queue || []));
  check(!/mia/.test(q), "nothing personal is logged");
  check(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
