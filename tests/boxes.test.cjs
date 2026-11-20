// Boxes: everyone first goes back to level 1 once; then a level earns a box, home shows it, opening it plays through all four cards, and what was inside is kept:
// two new cards (joining draws from tomorrow, two different pillars), an extra, and a card of a look (never a repeat).
// The 2nd box always holds Pick my own, and Pick my own then works on the draw screen. Uses made-up days only.
// SHOTS=folder saves pictures of each moment.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");
const SHOTS = process.env.SHOTS;

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 430, height: 932 } }), p = await ctx.newPage(), errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.abort());
  await p.goto(server.url + "v2/");
  const k = await p.evaluate(async () => (await import("./js/util.js")).dayKey());
  await p.evaluate((k) => {
    const day = (id) => ({ sleep: { bed: 1380, wake: 420, rested: 2, tags: [] }, card: { hands: [[id, id + 1, id + 2]], id, done: true, how: 3 }, mood: 4, feel: [], pil: [] });
    const days = { "2026-11-10": day(1), "2026-11-11": day(10) };
    days[k] = { sleep: { bed: 1380, wake: 420, rested: 2, tags: [] } };
    localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: "2026-11-10", seen: { note: "sleep" }, levels: { seen: 3 },
      pillars: [{ name: "Rest", mindsets: ["I'm exhausted"] }, { name: "Move", mindsets: ["Start moving"] }, { name: "Friends", mindsets: ["I feel lonely"] }], days }));
  }, k);
  await p.reload(); await p.waitForTimeout(900);
  // Everyone starts again at level 1 (alex 2026-11-18): old points are set aside once, and no boxes are owed for them.
  check(/Level 1/.test(await p.locator(".lv-num").innerText()) && await p.locator(".box-row").count() === 0, "an existing user starts again at level 1, with no boxes owed");
  await p.reload(); await p.waitForTimeout(700);
  check(/Level 1/.test(await p.locator(".lv-num").innerText()), "the reset happens only once and stays");
  // From here, pretend the points were earned after the reset, to get two boxes.
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("daydeck")); s.levels.base = 0; s.levels.seen = 3; localStorage.setItem("daydeck", JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(900);
  const shot = (n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png` });

  const row = p.locator(".box-row");
  check(await row.count() === 1 && /2 new boxes are waiting/.test(await row.innerText()), "home says two boxes are waiting");
  check(/Next box at level/.test(await p.locator(".lv-next").innerText()), "the level row says box, not pack");

  async function openOne(tag) {
    await p.locator(".box-row").click(); await p.waitForTimeout(800); await shot(tag + "-0");
    check(await p.locator(".bx .bx-front").innerText().then((t) => /A NEW BOX/.test(t) && /4 CARDS INSIDE/.test(t)), `${tag}: the plain box shows, 4 cards inside`);
    await p.locator(".bx-box").click({ force: true }); await p.waitForTimeout(1200); await shot(tag + "-1");
    await p.waitForTimeout(3600); await shot(tag + "-2");
    check(await p.locator(".bx-card").count() === 4, `${tag}: four cards came out`);
    const tap = () => p.mouse.click(215, 500);
    for (let i = 0; i < 3; i++) { await tap(); await p.waitForTimeout(2200); await shot(`${tag}-c${i}`); }
    await tap(); await p.waitForTimeout(6200); await shot(tag + "-set");
    const cap = await p.locator(".bx-cap").innerText();
    check(/Chrome/.test(cap) && /Card \d of 5/.test(cap), `${tag}: the last card is a Chrome card ("${cap.replace(/\s+/g, " ")}")`);
    check(await p.evaluate(() => { const i = document.querySelector(".bx-card.up .fr.look img"); return !!i && i.complete && i.naturalWidth > 0; }), `${tag}: the Chrome picture loads`);
    await tap(); await p.waitForTimeout(1800); await shot(tag + "-end");
    check(await p.locator(".bx .btn-main").isVisible(), `${tag}: Done shows at the end`);
    check(await p.locator(".bx-lab").count() === 4, `${tag}: all four are labelled at the end`);
    await p.locator(".bx .btn-main").click(); await p.waitForTimeout(900);
    check(await p.locator(".bx").count() === 0, `${tag}: Done closes the box`);
  }
  const boostNow = () => p.evaluate(() => Object.keys((JSON.parse(localStorage.getItem("daydeck")).boxes || {}).boost || {}));
  const pillarsOf = (ids) => p.evaluate(async (ids) => { const d = await import("./js/deck.js"); return ids.map((id) => d.card(+id).pillar); }, ids);
  await openOne("box1");
  const first = await boostNow();
  await openOne("box2");
  const second = (await boostNow()).filter((id) => !first.includes(id));
  const p1 = await pillarsOf(first), p2 = await pillarsOf(second);

  const st = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")));
  const bx = st.boxes, tomorrow = await p.evaluate(async (k) => (await import("./js/util.js")).addDays(k, 1), k);
  check(st.levels.opened === 2, "both boxes count as opened");
  check(await p.locator(".box-row").count() === 0, "the home row is gone once they're opened");
  check(Object.keys(bx.boost).length === 4 && Object.values(bx.boost).every((d) => d === tomorrow), "four new cards, each joining from tomorrow");
  check(new Set(bx.sets.chrome).size === 2 && bx.sets.chrome.length === 2, "two different Chrome cards, no repeat");
  check(bx.extras.pick >= 1, "the 2nd box held Pick my own");
  check(p1.length === 2 && p2.length === 2 && p1[0] !== p1[1] && p2[0] !== p2[1], `each box's two new cards are from different pillars (${p1.join(", ")} / ${p2.join(", ")})`);
  const today = await p.evaluate(async ([ids, k]) => { const d = await import("./js/deck.js"); return ids.map((id) => d.notYet(+id, k)); }, [Object.keys(bx.boost), k]);
  check(today.every(Boolean), "the new cards don't come up today");

  // Pick my own on the draw screen.
  await p.evaluate(async () => (await import("./js/draw.js")).openDraw(() => {})); await p.waitForTimeout(1500);
  const pick = p.getByRole("button", { name: "Pick my own" });
  check(await pick.count() === 1, "the draw screen offers Pick my own");
  await pick.click(); await p.waitForTimeout(800); await shot("pick");
  const items = p.locator(".pick-item");
  check(await items.count() > 10, `the list shows the deck (${await items.count()} cards)`);
  const chosen = await items.first().innerText();
  await items.first().click(); await p.waitForTimeout(900);
  await p.locator("#flow .btn-main").last().click(); await p.waitForTimeout(900);
  const after = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")));
  const kept = await p.evaluate(async (id) => (await import("./js/deck.js")).card(id).text, after.days[k].card.id);
  check(kept === chosen && after.days[k].card.own === true, "the picked card is today's card");
  check(after.boxes.extras.pick === bx.extras.pick - 1, "Pick my own was used up");

  check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
