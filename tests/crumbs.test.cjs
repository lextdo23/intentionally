// Crumbs (js/crumbs.js, alex 2026-11-23): off by default, offered once after an evening check-in, a face button
// beside the week, five faces and "Not sure", shown at the start of the evening check-in, words from their bands
// in the feelings step, kept on the day and never counted. Made-up data only. SHOTS=1 saves pictures.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const { serve, checker } = require("./helpers.cjs");
const SHOTS = process.env.SHOTS ? path.join(__dirname, "..", "..", "crumbs-shots") : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.addInitScript(() => { localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const shot = async (n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + ".png") }); };
  const sleep = { bed: 23 * 60, wake: 7 * 60, rested: 3, tags: [] };
  // Five full days before today, so Your days (and its week line) is open. Today: slept, card done and rated.
  const seed = (extra = {}) => {
    const days = {};
    for (let i = 1; i < 6; i++) days[day(i)] = { mood: 3, feel: ["calm"], sleep, card: { id: 1, done: true, how: 3, felt: ["Enjoyed it"] }, pil: [] };
    days[day(0)] = { sleep, card: { id: 2, done: true, how: 3, felt: ["Enjoyed it"] } };
    return { v: 1, started: day(5), days, seen: { note: "sleep", testInvite: 1 }, levels: { reset: 2, base: 33, seen: 2, tips: { days: 1 } }, notes: { sleepHint: 1, feelOwn: 1 }, ...extra };
  };
  const load = async (state) => { await p.goto(server.url); await p.evaluate((s) => localStorage.setItem("daydeck", JSON.stringify(s)), state); await p.reload(); await p.waitForTimeout(1800);
    await p.evaluate(() => document.querySelectorAll(".tip-layer, .sheet-host").forEach((e) => e.remove())); };
  const data = () => p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")));
  const endDay = async (mood) => {
    await p.click("#home button.btn-main"); await p.waitForTimeout(700);
    await p.$eval('#flow input[type=range]', (r, v) => { r.value = String(v); r.dispatchEvent(new Event("input", { bubbles: true })); }, mood);
  };
  const finish = async () => {
    for (let i = 0; i < 4 && (await p.$("#flow .step.in, #flow .step:not(.out)")); i++) {
      const pills = await p.$$('#flow .step:not(.out) .pill[aria-pressed="false"]');
      if (pills.length && !(await p.$('#flow .step:not(.out) .pill[aria-pressed="true"]'))) await pills[0].click();
      const btn = await p.$("#flow .step:not(.out) .btn-main"); if (!btn) break;
      await btn.click(); await p.waitForTimeout(700);
      if (!(await p.$eval("body", (x) => x.classList.contains("in-flow")))) break;
    }
  };

  // ---- Off by default: nothing on home ----
  await load(seed());
  check(!(await p.$("#home .crumb-btn")), "Crumbs is off to begin with: no face button on home");
  check(!!(await p.$("#home .peek")), "the week line is there as before");

  // ---- The offer, once, after an evening check-in ----
  await endDay(60);
  check(!(await p.$("#flow .crumb-replay")), "with no crumbs, the check-in starts exactly as before");
  await p.click("#flow .btn-main"); await p.waitForTimeout(700);
  await finish();
  await p.waitForTimeout(5000);
  const offer = await p.$(".sheet-host");
  check(!!offer && (await offer.innerText()).includes("Turn on Crumbs"), "after ending the day, Crumbs is offered once home is quiet");
  check(!!offer && (await offer.innerText()).includes("You can always find it in Settings."), "and the offer says it's always in Settings");
  await shot("1-offer");
  await p.click('.sheet-host button.btn-main:has-text("Turn on Crumbs")'); await p.waitForTimeout(400);
  check((await p.$eval(".sheet-host", (e) => e.innerText)).includes("Crumbs is on"), "turning it on says so");
  await shot("2-on");
  await p.click('.sheet-host button.btn-main:has-text("Done")'); await p.waitForTimeout(800);
  let s = await data();
  check(s.crumbs && s.crumbs.on === true && s.notes.crumbsOffer === 1, "Crumbs is saved as on, and the offer is marked as shown");
  check(!!(await p.$("#home .peek-row .peek")) && !!(await p.$("#home .peek-row .crumb-btn")), "the face button sits beside the week line");
  await shot("3-home");

  // ---- Not offered again ----
  await load({ ...seed(), crumbs: { on: false }, notes: { sleepHint: 1, feelOwn: 1, crumbsOffer: 1 } });
  await endDay(60); await p.click("#flow .btn-main"); await p.waitForTimeout(700); await finish(); await p.waitForTimeout(5000);
  check(!(await p.$(".sheet-host")), "someone who said not now isn't asked again");

  // ---- Before Your days opens, the button sits alone in the same spot ----
  await load({ v: 1, started: day(0), days: { [day(0)]: { sleep } }, levels: { reset: 2, base: 0, seen: 1 }, crumbs: { on: true }, notes: { crumbsOffer: 1 } });
  check(!(await p.$("#home .peek")) && !!(await p.$("#home .peek-row .crumb-btn")), "with no week line yet (level 1), the button is there on its own");

  // ---- Dropping crumbs ----
  await load({ ...seed(), crumbs: { on: true }, notes: { sleepHint: 1, feelOwn: 1, crumbsOffer: 1 } });
  await p.click("#home .crumb-btn"); await p.waitForTimeout(500);
  const faces = await p.$$eval(".sheet-host .crumb-pick", (bs) => bs.map((x) => x.getAttribute("aria-label")));
  check(faces.join() === "Hard,Low,Okay,Good,Great", "the sheet has five faces, hard to great, like the slider");
  check(!!(await p.$('.sheet-host .crumb-unsure:has-text("Not sure")')), "and Not sure");
  check(await p.$eval(".sheet-host .btn-main", (x) => x.getAttribute("aria-disabled")) === "true", "nothing is saved until a face is picked");
  await p.click('.sheet-host .crumb-pick[aria-label="Low"]');
  await p.fill(".sheet-host .crumb-note", "long meeting");
  await shot("4-sheet");
  await p.click(".sheet-host .btn-main"); await p.waitForTimeout(700);
  await p.click("#home .crumb-btn"); await p.waitForTimeout(500);
  await p.click(".sheet-host .crumb-unsure"); await p.click(".sheet-host .btn-main"); await p.waitForTimeout(700);
  s = await data();
  const cr = s.days[day(0)].crumbs || [];
  check(cr.length === 2 && cr[0].f === 1 && cr[0].n === "long meeting" && cr[1].f === -1 && !("n" in cr[1]) && cr.every((c) => typeof c.t === "number"), "crumbs are kept on today: the face, the time, and the words only when typed");

  // ---- At night ----
  await endDay(99);   // Great
  const replay = await p.$("#flow .crumb-replay");
  check(!!replay && (await replay.innerText()).includes("Your crumbs today") && (await replay.innerText()).includes("long meeting"), "ending the day starts with today's crumbs, above How was today?");
  check((await p.$$("#flow .crumb-replay .crumb-row")).length === 2, "both crumbs show");
  await shot("5-evening");
  await p.click("#flow .btn-main"); await p.waitForTimeout(700);
  const words = await p.$$eval("#flow .step:not(.out) .pills:first-child .pill", (bs) => bs.map((x) => x.dataset.w));
  check(words.includes("stressed") && words.includes("worried"), "on a Great day, the feelings step still leads with words from the Low crumb");
  check(words.includes("happy"), "alongside the usual words for Great");
  await shot("6-feelings");
  await finish(); await p.waitForTimeout(600);
  s = await data();
  check(s.days[day(0)].mood === 6 && (s.days[day(0)].crumbs || []).length === 2, "the evening mood is saved as usual, and the crumbs stay");

  // ---- Settings ----
  await p.click('#home button[aria-label="Settings"]'); await p.waitForTimeout(700);
  const sw = await p.$('#settings button.switch[aria-label="Crumbs"]');
  check(!!sw && (await sw.getAttribute("aria-checked")) === "true", "Settings has a Crumbs switch, on");
  await shot("7-settings");
  await sw.click(); await p.waitForTimeout(200);
  await p.click('#settings button[aria-label="Back to home"]'); await p.waitForTimeout(800);
  s = await data();
  check(s.crumbs.on === false && !(await p.$("#home .crumb-btn")), "switching it off takes the button away");
  check((s.days[day(0)].crumbs || []).length === 2, "and keeps the crumbs already dropped");

  // ---- Never counted ----
  const stats = await p.evaluate(async () => { const st = await import("./js/stats.js"); return JSON.stringify(st.moodSeries(JSON.parse(localStorage.getItem("daydeck")).days, "week")); });
  check(!stats.includes("long meeting"), "the mood charts don't read crumbs");

  check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
