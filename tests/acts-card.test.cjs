// Your days: the Mood and activities card, What lifts you, and Getting easier in the weekly look back
// (alex 2026-11-22). SHOTS=1 saves pictures. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker(), shots = !!process.env.SHOTS;
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(), errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(server.url);
  // Real bank cards for each pillar, then made-up days.
  const state = await p.evaluate(async ([D]) => {
    const { BANK } = await import("./js/cards-data.js");
    const ids = (pl) => BANK.filter((r) => r[1] === pl).slice(0, 4).map((r) => r[0]);
    const W = ids("Work and study"), R = ids("Rest"), M = ids("Move"), days = {};
    for (let i = 0; i < 7; i++) days[D[20 - i * 2]] = { mood: 5, card: { id: W[i % 4], felt: i < 5 ? ["Hard"] : ["Glad it's done"], how: 2, done: true }, pil: ["Work and study"] };
    for (let i = 0; i < 6; i++) days[D[19 - i * 2]] = { mood: i % 2 ? 2 : 1, card: { id: R[i % 4], felt: ["Calmer"], how: 3, done: true }, pil: ["Rest"] };
    for (let i = 0; i < 3; i++) days[D[25 - i]] = { mood: 4, card: { id: M[i % 4], felt: ["More energy"], how: 3, done: true }, pil: ["Move"] };
    return { v: 1, started: D[27], days, seen: { note: "sleep" }, order: ["C", "E", "A", "B", "D"], levels: { keepAll: true },
      pillars: [{ name: "Work and study", mindsets: [] }, { name: "Rest", mindsets: [] }, { name: "Move", mindsets: [] }] };
  }, [Array.from({ length: 30 }, (_, i) => day(i))]);
  await p.evaluate((s) => { localStorage.setItem("daydeck", JSON.stringify(s)); localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); }, state);
  await p.goto(server.url); await p.waitForTimeout(900);
  await p.evaluate(async () => (await import("./js/days.js")).openDays(document.body, () => {}));
  await p.waitForTimeout(900);
  const text = (sel) => p.evaluate((s) => (document.querySelector(s) || {}).textContent || "", sel);

  check(/Work and study often felt hard to do, but those days still went well\./.test(await text(".acts .lead")), "headline: hard to do, but those days went well");
  check(await p.locator(".acts-row").count() === 3, "one row per pillar");
  const work = await p.locator(".acts-row", { hasText: "Work and study" }).textContent();
  check(/Took a lot5 of 7/.test(work) && /Hard/.test(work) && /Really good/.test(work), "row: Took a lot · 5 of 7 · Hard, next to Really good");
  check(/Hard to do, but those days still went well\./.test(work), "the gold line sits under that row");
  check(/Helped in the moment, even on lower days\./.test(await p.locator(".acts-row", { hasText: "Rest" }).textContent()), "Rest: helped in the moment");
  check(/still learning/.test(await p.locator(".acts-row", { hasText: "Move" }).textContent()), "Move with 3 cards: still learning");
  check(await p.locator(".acts .key, .acts [class*=legend]").count() === 0, "no key on the card");
  if (shots) await p.locator(".acts").screenshot({ path: "acts-card.png" });

  await p.locator(".acts-row", { hasText: "Work and study" }).click(); await p.waitForTimeout(500);
  const dates = await p.$$eval(".acts-card .acts-date", (els) => els.map((e) => e.textContent));
  check(dates.length === 7, "tapping a pillar lists every one of its cards");
  check(await p.evaluate(() => { const ks = [...document.querySelectorAll(".acts-card .acts-date")].map((e) => e.textContent); return ks.length > 1; }), "each card shows its date");
  if (shots) await p.locator(".sheet").screenshot({ path: "acts-sheet.png" });
  await p.mouse.click(10, 10); await p.waitForTimeout(600);

  check(/lifted you most/.test(await text(".lifts .lead")), "What lifts you: the top lift leads");
  check(await p.locator(".lifts-card").count() >= 1, "lift cards show");
  check(await p.locator(".lifts .seg button", { hasText: "Harder days" }).count() === 1, "enough harder days: the Harder days side appears");
  await p.locator(".lifts .seg button", { hasText: "Harder days" }).click(); await p.waitForTimeout(300);
  check(/Even on harder days, these still helped\./.test(await text(".lifts .lead")) && /harder days/.test(await text(".lifts-card")), "Harder days: what still helped, 'n of m harder days'");
  if (shots) await p.locator(".lifts").screenshot({ path: "lifts-card.png" });

  // Getting easier: Move took a lot three weeks ago and lifts now.
  const kind = await p.evaluate(async ([D]) => {
    const { BANK } = await import("./js/cards-data.js"), store = await import("./js/store.js"), wr = await import("./js/wrapped.js"), u = await import("./js/util.js");
    const M = BANK.filter((r) => r[1] === "Move").slice(0, 4).map((r) => r[0]), s = store.get();
    const today = u.dayKey(), mon = u.addDays(today, -((u.keyDate(today).getDay() + 6) % 7));
    s.days = {};
    [[20, ["Hard"]], [19, ["Drained me"]], [13, ["Hard"]], [12, ["Glad it's done"]], [6, ["More energy"]], [5, ["Enjoyed it"]], [1, ["More energy"]], [0, ["Calmer"]]]
      .forEach(([n, f], i) => { s.days[u.addDays(mon, 6 - n)] = { mood: 3, card: { id: M[i % 4], felt: f, how: 3, done: true }, pil: ["Move"] }; });
    const F = wr.build(mon).find;
    return F && F.kind;
  }, [null]);
  check(kind === "easier", "weekly look back: 'Move has felt easier over the last few weeks'");
  check(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
