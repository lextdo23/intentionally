// The glass pill (js/pill.js, social stage 1 step 1; alex 2026-11-20): Today · Friends · You beside the main action,
// in test mode only for now. Made-up data only. SHOTS=1 saves a picture of each tab.
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

  // ---- Not in test mode: no pill, everything as before ----
  await p.reload(); await p.waitForTimeout(1500);
  check(!(await p.$("#pill")), "outside test mode there's no pill yet");
  check(!!(await p.$('#home button[aria-label="Settings"]')), "and Settings is on home as before");

  // ---- Test mode: the pill ----
  await p.goto(server.url + "?test"); await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelectorAll(".tip-layer, .sheet-host").forEach((e) => e.remove()));
  check(!!(await p.$("#pill")), "in test mode the glass pill is there");
  const tabs = await p.$$eval("#pill .pill-tab", (bs) => bs.map((x) => x.getAttribute("aria-label")));
  check(tabs.join() === "Today,Friends,You", "its tabs are Today, Friends, You, in that order");
  check(await p.$eval("body", (b) => b.dataset.tab) === "today", "Daydeck opens on Today");
  check(/Do your card|End your day|Draw your card|Start your day|Change today|Going to sleep/.test(await p.textContent("#pill .pill-act")), "the main action sits in the pill");
  check(!(await p.$('#home button[aria-label="Settings"]')), "Settings has moved off home");
  check(/Lifeline/.test(await p.textContent("#home")), "Lifeline is still on home");
  const blur = await p.$eval("#pill", (e) => getComputedStyle(e).backdropFilter || getComputedStyle(e).webkitBackdropFilter || "");
  check(/blur/.test(blur), "the pill is see-through glass");
  await shot("1-today");

  // ---- Friends ----
  await p.click('#pill [data-tab="friends"]'); await p.waitForTimeout(600);
  check(await p.$eval("body", (b) => b.dataset.tab) === "friends", "tapping Friends goes to Friends");
  check(await p.$eval('#pill [data-tab="friends"]', (e) => e.getAttribute("aria-current")) === "page", "the Friends tab is marked as the current one");
  check(/Coming soon/.test(await p.textContent("#friends")), "Friends says it's coming soon, up front");
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
