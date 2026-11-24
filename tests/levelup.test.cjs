// The level-up moment (alex 2026-11-24, "B"): the eclipse opens with "Level 5", then the card for what opened, with
// "Open …" and "Later" (in place of the old words and pointing tip). Later closes it and the bar ticks over; a level
// that opens nothing closes by itself. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const errors = [];
  const open = async (lvTo, opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, serviceWorkers: "block", ...opts });
    await ctx.addInitScript(() => { localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); });
    await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
    const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
    const t = new Date(); t.setHours(15, 10, 0, 0); await p.clock.setFixedTime(t);
    await p.goto(server.url);
    await p.evaluate(async (lvTo) => {
      const { makeSample } = await import("./js/sample.js"); const L = await import("./js/levels.js"); const days = makeSample(30);
      const st = { v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "sleep" }, pillars: [{ name: "Rest", mindsets: [] }] };
      let pts = 0; while (L.level(pts).level < lvTo) pts++; pts += 3;
      st.levels = { reset: 2, base: L.earned(st) - pts, seen: lvTo - 1, opened: lvTo - 1, tips: { days: 1, own: 1, friends: 1, library: lvTo > 5 ? 1 : 0, photos: 1, crumbs: 1 } };
      localStorage.setItem("daydeck", JSON.stringify(st));
    }, lvTo);
    await p.reload();
    return { p, ctx };
  };
  const txt = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent : ""; }, sel);

  // Level 5 opens the card library.
  let { p, ctx } = await open(5);
  await p.waitForTimeout(2600);
  check(/Level 5/.test(await txt(p, ".lu-title")), "a new level opens with the eclipse and \"Level 5\"");
  await p.waitForTimeout(3200);
  check(/Card library/.test(await txt(p, ".lu-front")) && /Open the card library/.test(await txt(p, ".lu-btns")) && /Later/.test(await txt(p, ".lu-btns")), "then a card shows what opened, with Open and Later");
  check(await p.evaluate(() => getComputedStyle(document.getElementById("pill")).visibility === "hidden"), "the bottom pill steps away while it shows");
  await p.click(".lu-btns .btn-quiet"); await p.waitForTimeout(2600);
  check(!(await p.$(".lu")) && !(await p.$(".tip-box")), "Later closes it, and no pointing tip follows");
  check(/Level 5/.test(await txt(p, ".lv-num")), "and the bar has ticked over to Level 5");
  check(await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).levels.tips.library === 1), "the card counts as the new thing's introduction");
  await ctx.close();

  // Open goes straight there.
  ({ p, ctx } = await open(5));
  await p.waitForTimeout(5800);
  await p.click(".lu-btns .btn-main"); await p.waitForTimeout(1500);
  check(await p.evaluate(() => document.body.classList.contains("in-cards")), "Open the card library opens it");
  await ctx.close();

  // A level that opens nothing: the eclipse, "Level 6", and it closes by itself.
  ({ p, ctx } = await open(6));
  await p.waitForTimeout(2600);
  check(/Level 6/.test(await txt(p, ".lu-title")) && !(await p.$(".lu-card")), "a level that opens nothing shows just the eclipse and the level");
  await p.waitForTimeout(3200);
  check(!(await p.$(".lu")), "and closes by itself");
  await ctx.close();

  // Reduce motion: no movement, straight to the card.
  ({ p, ctx } = await open(5, { reducedMotion: "reduce" }));
  await p.waitForTimeout(1500);
  check(await p.evaluate(() => { const b = document.querySelector(".lu-btns"); return !!b && getComputedStyle(b).opacity === "1"; }), "with reduce motion on, the card and its buttons show straight away");
  await ctx.close();

  check(!errors.length, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
