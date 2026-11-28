// Week one, worth seeing (alex 2026-11-28): "Your first three days" after a new person's third End your day
// (js/first3.js), the first "Lifted you" in What lifts you straight away, and the "So far" sleep-and-mood line from the
// first nights (sleepFirst in js/stats.js). Made-up data only. SHOTS=1 saves pictures.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const { serve, checker } = require("./helpers.cjs");
const SHOTS = process.env.SHOTS ? path.join(__dirname, "..", "..", "week-one-shots") : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const { check, done } = checker();

  // ---- The "So far" line, without a browser ----
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.matchMedia = () => ({ matches: false });
  const st = await import(path.join(__dirname, "..", "js", "stats.js"));
  const T = "2026-11-22", k = (b) => { const d = new Date(2026, 10, 22 - b, 12); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const nights = (rows) => { const o = {}; rows.forEach(([h, m], i) => { o[k(rows.length - i)] = { sleep: { bed: 1380, wake: Math.round(1380 + h * 60) % 1440, rested: 2, tags: [] }, mood: m }; }); return o; };
  const first = (rows) => st.sleepFirst(st.sleepPattern(nights(rows), T));
  check(first([[7, 3]]) === null, "one night: nothing yet (the usual 'This fills in' line)");
  let f = first([[6, 2], [7.67, 4]]);
  check(f && f.kind === "one" && st.sleepFirstWords(f) === "7h 40m", "two nights: 'So far, your best day came after 7h 40m'");
  f = first([[7.2, 4], [5.5, 2], [7.9, 4]]);
  check(f && f.kind === "best" && st.sleepFirstWords(f) === "7 to 8 hours", "two best days: 'your best days came after 7 to 8 hours'");
  f = first([[7, 3], [8, 3], [7.5, 3]]);
  check(f && f.kind === "same" && f.m === 3 && st.sleepFirstWords(f) === "about 7h 30m", "every day the same: 'your days have felt okay, after about 7h 30m a night'");
  const week = []; for (let i = 0; i < 7; i++) week.push([6 + (i % 3), 2 + (i % 3)]);
  check(first(week) === null, "from 7 nights the first-week line steps aside for the usual wording");

  // ---- In the app ----
  const server = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: SHOTS ? 2 : 1, hasTouch: true });
  await ctx.addInitScript(() => { localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const shot = async (n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + ".png") }); };
  const sl = (h) => ({ bed: 23 * 60, wake: Math.round(23 * 60 + h * 60) % 1440, rested: 3, tags: [] });
  // A new person on their third day: two evenings in, today's card done and rated, the evening still to come.
  const seed = (extra = {}) => ({ v: 1, started: day(2), days: {
    [day(2)]: { mood: 3, feel: ["calm"], sleep: sl(6.2), card: { id: 1, done: true, how: 3, felt: ["Glad it's done"] }, pil: [] },
    [day(1)]: { mood: 5, feel: ["calm"], sleep: sl(7.7), card: { id: 2, done: true, how: 4, felt: ["Calmer", "Enjoyed it"] }, pil: [] },
    [day(0)]: { sleep: sl(8), card: { id: 3, done: true, how: 4, felt: ["Enjoyed it"] } } },
    seen: { note: "sleep", testInvite: 1, notifCard: 1 }, levels: { reset: 2, base: 33, seen: 2, tips: { days: 1 } }, notes: { sleepHint: 1, feelOwn: 1 }, ...extra });
  const load = async (state) => { await p.goto(server.url); await p.evaluate((s) => localStorage.setItem("daydeck", JSON.stringify(s)), state); await p.reload(); await p.waitForTimeout(1800);
    await p.evaluate(() => document.querySelectorAll(".tip-layer, .sheet-host").forEach((e) => e.remove())); };
  const data = () => p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")));
  const endDay = async () => {
    await p.click("#pill .pill-act button.btn-main"); await p.waitForTimeout(700);
    await p.$eval('#flow input[type=range]', (r) => { r.value = "60"; r.dispatchEvent(new Event("input", { bubbles: true })); });
    for (let i = 0; i < 6; i++) {
      const pills = await p.$$('#flow .step:not(.out) .pill[aria-pressed="false"]');
      if (pills.length && !(await p.$('#flow .step:not(.out) .pill[aria-pressed="true"]'))) await pills[0].click();
      const btn = await p.$("#flow .step:not(.out) .btn-main"); if (!btn) break;
      await btn.click(); await p.waitForTimeout(700);
      if (!(await p.$eval("body", (x) => x.classList.contains("in-flow")))) break;
    }
  };

  // Your days before the third evening: the first lifts are there already, and the "So far" line.
  await load(seed());
  await p.click("#home .peek"); await p.waitForTimeout(900);
  const lifts = await p.$eval("#days .lifts", (e) => e.innerText);
  check(lifts.includes("Worth doing again") && lifts.includes("Calmer"), "What lifts you shows the first lifts straight away");
  const slp = await p.$eval("#days .slp .lead", (e) => e.innerText);
  check(/^So far, your best day came after 7h 40m of sleep\.$/.test(slp), `the sleep card has a "So far" line on day 3 (${slp})`);
  await p.$eval("#days .slp", (e) => e.scrollIntoView({ block: "start" })); await shot("2-so-far");
  await p.evaluate(() => document.querySelector("#days .page-head .round").click()); await p.waitForTimeout(900);

  // The third End your day: "Your first three days" once home is quiet, and Crumbs waits for another night.
  await endDay();
  await p.waitForTimeout(5200);
  const sheet = await p.$(".sheet-host");
  const txt = sheet ? await sheet.innerText() : "";
  check(txt.includes("Your first three days"), "after the third End your day, 'Your first three days' shows");
  check((await p.$$(".sheet-host .f3-card")).length === 3, "with the three cards");
  check(txt.includes("2 of them lifted you") && txt.includes("Glad it's done") && txt.includes("Enjoyed it"), "and how each one felt");
  check(!/missed/i.test(txt), "never 'missed'");
  await shot("1-first-three-days");
  check((await data()).notes.first3, "it's marked seen");
  await p.click('.sheet-host button.btn-main:has-text("Done")'); await p.waitForTimeout(6000);
  const after = await p.$(".sheet-host");
  check(!after || !(await after.innerText()).includes("Crumbs"), "Crumbs isn't offered the same night");

  // Once only.
  await load({ ...(await data()) });
  await p.waitForTimeout(4000);
  check(!(await p.$(".sheet-host .f3-card")), "it never shows again");

  // Missed because Daydeck closed: it comes on the next open. A day with an undone card is left out.
  const s2 = seed(); s2.days[day(1)].card = { id: 2 }; s2.days[day(0)].mood = 4;
  await p.goto(server.url); await p.evaluate((s) => localStorage.setItem("daydeck", JSON.stringify(s)), s2); await p.reload(); await p.waitForTimeout(6500);
  check((await p.$$(".sheet-host .f3-card")).length === 2, "missed: it shows on the next open, leaving out the undone card");

  // Someone who's used Daydeck for weeks never sees it.
  const old = seed(); for (let i = 3; i < 30; i++) old.days[day(i)] = { mood: 3, sleep: sl(7), card: { id: 4, done: true, how: 3, felt: ["Calmer"] } };
  old.levels = { ...old.levels, seen: 30, opened: 30 };   // their levels are already seen, so no level-up moment covers home
  await p.goto(server.url); await p.evaluate((s) => localStorage.setItem("daydeck", JSON.stringify(s)), old); await p.reload(); await p.waitForTimeout(1800);
  await p.evaluate(() => document.querySelectorAll(".tip-layer, .sheet-host").forEach((e) => e.remove()));
  await endDay(); await p.waitForTimeout(5200);
  check(!(await p.$(".sheet-host .f3-card")), "not for people already using Daydeck");

  check(!errors.length, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close();
  done();
})();
