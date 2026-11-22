// The Mood and sleep card in Your days (alex 2026-11-22): headline from the shared sleep rule, By hours / By date,
// the first-time hint, sliding across to read a night, opening that day, the countdown, and the empty start.
// SHOTS=1 saves a picture of each state. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const MORE = [[7.67,4],[6.17,2],[8.17,4],[5.33,1],[8.33,5],[8.67,6],[7.83,3],[7.17,4],[6.5,3],[7.25,4],[6,2],[5.5,1],[8,5],[9,6],[7.5,4],[7,3],[6.83,3],[7.42,4],[5.83,2],[7.92,4],[8.5,5]];
function state(n) {
  const days = {}, rows = MORE.slice(0, n);
  rows.forEach(([hr, m], i) => { days[day(rows.length - i)] = { sleep: { bed: 1380, wake: Math.round(1380 + hr * 60) % 1440, rested: 2, tags: [] }, mood: m, feel: ["calm"], pil: [] }; });
  days[day(0)] = { sleep: { bed: 1380, wake: 400, rested: 2, tags: [] } };
  return { v: 1, started: day(Math.max(1, n)), days, seen: { note: "sleep" }, order: ["B", "A", "C", "D"], levels: { keepAll: true } };
}

(async () => {
  const server = await serve(), { check, done } = checker(), shots = !!process.env.SHOTS;
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: false });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(), errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const open = async (n) => {
    await p.goto(server.url); await p.evaluate((s) => { localStorage.setItem("daydeck", JSON.stringify(s)); localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); }, state(n));
    await p.goto(server.url); await p.waitForTimeout(900);
    await p.evaluate(async () => (await import("./js/days.js")).openDays(document.body, () => {}));
    await p.waitForTimeout(900);
  };
  const text = (sel) => p.evaluate((s) => (document.querySelector(s) || {}).textContent || "", sel);

  await open(21);
  check(/Your best days came after 8 hours or more\./.test(await text(".slp .lead")), "headline from the shared rule");
  check(await p.locator(".slp .seg [aria-selected=true]").textContent() === "By hours", "opens on By hours");
  check(/Each column is a night/.test(await text(".slp .read")), "first time: the hint says what the columns mean");
  check(await p.locator(".slp-col").count() === 22, "22 columns: 21 nights and last night's outline");
  check(/Based on 21 days/.test(await text(".slp-note")), "21 nights: based on 21 days");
  check(await p.evaluate(() => getComputedStyle(document.querySelector(".slp-band")).opacity) === "1", "the best-hours band shows By hours");
  if (shots) await p.locator(".slp").screenshot({ path: "sleep-card-hours.png" });

  const box = await p.locator(".slp-touch").boundingBox();
  await p.mouse.move(box.x + 6, box.y + box.height / 2); await p.mouse.down();
  for (let x = 6; x < box.width * 0.6; x += 12) await p.mouse.move(box.x + x, box.y + box.height / 2);
  await p.mouse.up(); await p.waitForTimeout(200);
  const readout = await text(".slp .read button");
  check(/\d+h.*·/.test(readout) && /Awful|Rough|Low|Okay|Good|Great/.test(readout), "sliding across shows a night's date, hours and mood");
  check(await p.locator(".slp-col.on").count() === 1, "the chosen night is outlined");
  check(await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).notes.sleepHint === true), "the first-time hint is remembered as seen");
  if (shots) await p.locator(".slp").screenshot({ path: "sleep-card-picked.png" });
  await p.locator(".slp .read button").click(); await p.waitForTimeout(500);
  check(await p.locator(".sheet-host, [aria-label='A day']").count() > 0, "tapping the line opens that day");
  await p.keyboard.press("Escape"); await p.mouse.click(10, 10); await p.waitForTimeout(600);

  await p.evaluate(() => [...document.querySelectorAll(".slp .seg button")].find((b) => b.textContent === "By date").click());
  await p.waitForTimeout(1500);
  check(await p.evaluate(() => getComputedStyle(document.querySelector(".slp-band")).opacity) === "0", "By date: no band");
  check(await p.evaluate(() => getComputedStyle(document.querySelector(".slp-col.now")).opacity) === "1", "By date: last night's outline shows");
  check(/Last 4 weeks/.test(await text(".slp .read")) || (await text(".slp .read")).includes("·"), "after the first time, the plain hint line");
  if (shots) await p.locator(".slp").screenshot({ path: "sleep-card-date.png" });

  await p.waitForTimeout(4300);
  check(await p.locator(".slp-col.on").count() === 0, "a chosen night clears itself after a few seconds");

  await open(8);
  check(/^So far, your best days came after/.test(await text(".slp .lead")), "early days: 'So far'");
  check(/13 more days/.test(await text(".slp-note b")), "early days: countdown in green");
  if (shots) await p.locator(".slp").screenshot({ path: "sleep-card-early.png" });

  await open(1);
  check(/This fills in after your first few mornings and evenings/.test(await text(".slp .lead")), "first nights: fills in");
  check(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
