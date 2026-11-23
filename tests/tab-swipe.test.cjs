// Moving between tabs (js/pill.js; alex 2026-11-23, "like other apps"): tapping a tab shows it straight away, no
// slide; swiping sideways drags whole screens with a thin dark line between them, and letting go past halfway (or a
// flick) moves on, otherwise it springs back. Swiping on the day card still turns the card. Made-up data only.
// SHOTS=1 saves a picture mid-swipe.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const { serve, checker } = require("./helpers.cjs");
const SHOTS = process.env.SHOTS ? path.join(__dirname, "..", "..", "tab-swipe-shots") : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { if (!localStorage.getItem("daydeck-account")) localStorage.setItem("daydeck-account", JSON.stringify({ token: "T", user: { username: "mia.k", email: "mia@example.com" } })); });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  const days = {}; for (let i = 1; i < 6; i++) days[day(i)] = { mood: 3, sleep: { q: 3 } };
  days[day(0)] = { sleep: { q: 3 }, card: { id: 1 } };
  await p.goto(server.url);
  await p.evaluate((days) => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "sleep" }, levels: { seen: 3 } })), days);
  await p.goto(server.url + "?test"); await p.waitForTimeout(1800);
  await p.evaluate(() => document.querySelectorAll(".tip-layer, .sheet-host").forEach((e) => e.remove()));
  const tab = () => p.$eval("body", (b) => b.dataset.tab);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  // A finger drag from (x0) to (x1) at height y, in steps; hold: stop before letting go (to look mid-swipe).
  const drag = async (x0, x1, y, { steps = 12, wait = 16, hold = false } = {}) => {
    await touch("touchStart", x0, y);
    for (let i = 1; i <= steps; i++) { await touch("touchMove", x0 + (x1 - x0) * i / steps, y); await p.waitForTimeout(wait); }
    if (!hold) await touch("touchEnd");
  };
  const quiet = async () => { // a spot on the current screen with nothing that moves sideways itself
    return p.evaluate(() => { const t = document.body.dataset.tab, el = t === "today" ? document.querySelector("#home .top-line, #home .greet") : document.querySelector("#" + t + " h1");
      const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
  };

  // ---- Tapping: straight away, no slide ----
  await p.click('#pill [data-tab="friends"]');
  await p.waitForTimeout(40);
  const x = await p.$eval("#friends", (e) => new DOMMatrix(getComputedStyle(e).transform).m41);
  check(await tab() === "friends" && Math.abs(x) < 1, "tapping Friends shows it straight away, with no slide (it's already in place " + Math.round(x) + "px)");
  await p.click('#pill [data-tab="today"]'); await p.waitForTimeout(40);
  check(await p.$eval("#home", (e) => getComputedStyle(e).opacity) === "1", "tapping Today shows it straight away too");
  await p.waitForTimeout(300);

  // ---- Swiping: screens follow the finger, with a dark line between ----
  let y = await quiet();
  await drag(380, 120, y, { hold: true });
  const mid = await p.evaluate(() => ({ home: new DOMMatrix(getComputedStyle(document.getElementById("home")).transform).m41, fr: document.getElementById("friends").getBoundingClientRect().left, line: getComputedStyle(document.getElementById("friends")).boxShadow, drag: document.body.classList.contains("tab-drag") }));
  check(mid.drag && mid.home < -200 && mid.fr > 100 && mid.fr < 250, "mid-swipe Today moves left with the finger and Friends comes in beside it (" + Math.round(mid.home) + ", " + Math.round(mid.fr) + ")");
  check(/rgb\(0, 0, 0\)/.test(mid.line), "with a thin dark line between the two screens");
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "mid-swipe.png") });
  await p.waitForTimeout(150); await touch("touchEnd"); await p.waitForTimeout(450);
  check(await tab() === "friends", "letting go past halfway (even after stopping) moves on to Friends");
  check(await p.$eval("#friends", (e) => e.style.transform === "" && Math.abs(e.getBoundingClientRect().left) < 1), "and Friends settles exactly in place");

  y = await quiet();
  await drag(300, 240, y, { steps: 6, wait: 40 }); await p.waitForTimeout(450);
  check(await tab() === "friends", "a short, slow swipe springs back");

  await drag(330, 250, y, { steps: 3, wait: 10 }); await p.waitForTimeout(450);
  check(await tab() === "you", "a quick flick moves on, even when short");

  y = await quiet();
  await drag(200, 40, y); await p.waitForTimeout(450);
  check(await tab() === "you", "past the last screen it only gives a little, then stays on You");

  await drag(60, 400, y); await p.waitForTimeout(450);
  check(await tab() === "friends", "swiping right goes back to Friends");
  await drag(60, 400, y); await p.waitForTimeout(450);
  check(await tab() === "today", "and again to Today");
  check(await p.$eval("#sun", (e) => e.style.transform === "" && getComputedStyle(e).opacity !== "0"), "the sun is back where it was");

  // ---- Up and down still scrolls, and doesn't switch ----
  await touch("touchStart", 200, 500); for (let i = 1; i <= 8; i++) { await touch("touchMove", 205, 500 - i * 30); await p.waitForTimeout(16); } await touch("touchEnd");
  await p.waitForTimeout(400);
  check(await tab() === "today", "dragging up and down never switches tabs");

  // ---- Things that move sideways themselves keep working ----
  const card = await p.evaluate(() => { const c = [...document.querySelectorAll("#home *")].find((e) => e.style.touchAction === "pan-y"); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (card) { await drag(card.x + 80, card.x - 120, card.y); await p.waitForTimeout(450); check(await tab() === "today", "swiping on the day card turns the card, not the tab"); }

  // ---- Nothing switches while something is open over the screen ----
  await p.evaluate(() => document.body.classList.add("in-settings"));
  y = await quiet(); await drag(380, 60, y); await p.waitForTimeout(450);
  check(await tab() === "today", "no swiping between tabs while Settings (or a check-in, sheet or page) is open");
  await p.evaluate(() => document.body.classList.remove("in-settings"));

  check(!errors.length, "no errors" + (errors.length ? ": " + errors.join("; ") : ""));
  await b.close(); server.close(); done();
})();
