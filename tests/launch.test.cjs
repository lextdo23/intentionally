// Opening and coming back to Daydeck (alex 2026-11-21): a fresh open shows the sun on a blank sky, then home fades in,
// and sheets wait until it has. Coming back shows home just as it was left (no redraw), unless the day has moved on.
// Made-up data only. SHOTS=1 saves a picture of the splash and of home after it.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const { serve, checker } = require("./helpers.cjs");
const SHOTS = process.env.SHOTS ? path.join(__dirname, "..", "..", "launch-shots") : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const shot = async (n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + ".png") }); };
  const days = {}; for (let i = 1; i < 6; i++) days[day(i)] = { mood: 3, sleep: { q: 3 } };
  days[day(0)] = { sleep: { q: 3 }, card: { id: 1 } };
  await p.goto(server.url);
  await p.evaluate((days) => {
    localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 }));
    localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "sleep", testInvite: 1 }, levels: { seen: 3 } }));
  }, days);

  // ---- A fresh open: the splash first, home hidden behind it ----
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(150);
  const early = await p.evaluate(() => ({
    splash: getComputedStyle(document.getElementById("splash")).visibility === "visible" && !document.getElementById("splash").classList.contains("gone"),
    homeHidden: getComputedStyle(document.getElementById("home")).opacity === "0",
    booting: document.body.classList.contains("booting"),
  }));
  await shot("1-splash");
  check(early.splash, "a fresh open shows the splash (the sun on a blank sky) straight away");
  check(early.booting && early.homeHidden, "home is hidden behind it while it gets ready");

  // ---- Then the splash fades and home rises in ----
  await p.waitForTimeout(2200);
  const later = await p.evaluate(() => ({
    gone: document.getElementById("splash").classList.contains("gone") && getComputedStyle(document.getElementById("splash")).visibility === "hidden",
    home: getComputedStyle(document.getElementById("home")).opacity === "1",
    booting: document.body.classList.contains("booting"),
  }));
  await shot("2-home");
  check(later.gone, "the splash fades away within a couple of seconds");
  check(later.home && !later.booting, "and home is showing");

  // ---- A sheet that's due waits for the splash: What's new, for someone who hasn't seen it ----
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("daydeck")); s.seen.note = "old"; localStorage.setItem("daydeck", JSON.stringify(s)); });
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(600);
  const sheetEarly = await p.evaluate(() => !!document.querySelector(".sheet-host") && !document.getElementById("splash").classList.contains("gone"));
  check(!sheetEarly, "a sheet never pops up while the splash is still showing");
  await p.waitForTimeout(2200);
  check(!!(await p.$(".sheet-host")), "it comes up once home has settled");
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("daydeck")); s.seen.note = "sleep"; localStorage.setItem("daydeck", JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(2200);

  // ---- Coming back: home is left exactly as it was ----
  const away = (ms) => p.evaluate(async (ms) => {
    const set = (v) => { Object.defineProperty(document, "visibilityState", { value: v, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); };
    set("hidden"); await new Promise((r) => setTimeout(r, ms)); set("visible");
  }, ms);
  await p.evaluate(() => { document.querySelector("#home > *").dataset.mark = "same"; });
  await away(300);
  await p.waitForTimeout(400);
  check(!!(await p.$('#home [data-mark="same"]')), "coming back shows home just as it was left (not redrawn)");
  check(await p.evaluate(() => document.getElementById("splash").classList.contains("gone")), "and no splash when coming back");

  // ---- …unless the day has moved on: then home catches up ----
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("daydeck")); s.test = { offset: 1 }; localStorage.setItem("daydeck", JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(2200);
  await p.evaluate(() => { document.querySelector("#home > *").dataset.mark = "same"; });
  await p.evaluate(async () => { const c = await import("./js/clock.js"); c.setOffsetDays(2); });
  await away(100);
  await p.waitForTimeout(400);
  check(!(await p.$('#home [data-mark="same"]')), "after a new day starts, coming back redraws home for the new day");

  check(!errors.length, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
