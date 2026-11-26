// Not for me in the morning hand (alex 2026-11-25): waits for a chosen card, a sheet of reasons, the card is never
// dealt again and a new one takes its place, Undo brings it back, "Not where I'm at right now" rests it 8 weeks. Also
// the rest day moon (asks first) and no Lifeline line on the hand. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");
(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 430, height: 932 }, reducedMotion: "reduce" }), p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await ctx.addInitScript(() => { if (!localStorage.getItem("daydeck-account")) localStorage.setItem("daydeck-account", '{"skip":1}'); });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.abort());
  await p.goto(server.url);
  const k = await p.evaluate(async () => (await import("./js/util.js")).dayKey());
  await p.evaluate((k) => { const days = {}; days[k] = { sleep: { bed: 1380, wake: 420, rested: 2, tags: [] } };
    localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: "2026-11-10", seen: { note: "sleep", testInvite: 1, crumbsOffer: 1, notifCard: 1 }, levels: { seen: 3 },
      pillars: [{ name: "Move", mindsets: ["Sit too much"] }, { name: "Rest", mindsets: ["Can't switch off"] }, { name: "Family", mindsets: ["Be closer"] }], days })); }, k);
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(async () => (await import("./js/draw.js")).openDraw(() => {}));
  await p.waitForTimeout(1500);
  check(!(await p.locator("a.lifeline").count()), "no Lifeline line on the hand");
  check(await p.locator('button.round[aria-label="Make today a rest day"]').count() === 1, "moon button for rest day");
  check(!(await p.getByText("Make today a rest day, no card").count()), "old rest line gone");
  const nfm = p.locator(".draw-row button", { hasText: "Not for me" });
  check(await nfm.getAttribute("aria-disabled") === "true", "Not for me waits for a pick");
  for (const [x, y] of [[115, 440], [215, 360], [320, 440]]) { await p.mouse.click(x, y); await p.waitForTimeout(300); }
  const sel = await p.evaluate(() => [...document.querySelectorAll(".stage .dcard.up")].map((e) => +e.dataset.id));
  check(sel.length === 3, "three turned");
  await p.mouse.click(215, 360); await p.waitForTimeout(300);
  const id = await p.evaluate(() => +document.querySelector(".stage .dcard.sel").dataset.id);
  await nfm.click(); await p.waitForTimeout(500);
  check(await p.getByText("Not for you?").count() === 1, "reasons sheet opens");
  await p.getByRole("button", { name: "It doesn't fit my life" }).click(); await p.waitForTimeout(800);
  const after = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("daydeck")); return { never: s.cards.never, ids: [...document.querySelectorAll(".stage .dcard.up")].map((e) => +e.dataset.id), hand: Object.values(s.days)[0].card.hands.slice(-1)[0] }; });
  check(after.never[id] && after.never[id].r === "life", "card marked never");
  check(!after.ids.includes(id) && after.ids.length === 3, "new card in its place");
  check(!after.hand.includes(id) && after.hand.length === 3, "saved hand updated");
  check(await p.getByText("You won't see that one again.").count() === 1, "hint says so");
  const neverDealt = await p.evaluate(async (id) => { const d = await import("./js/deck.js"); for (let i = 0; i < 300; i++) if (d.draw3().includes(id)) return false; return !d.dealable().includes(id); }, id);
  check(neverDealt, "never dealt again");
  await p.getByRole("button", { name: "Undo" }).click(); await p.waitForTimeout(400);
  const und = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("daydeck")); return { never: s.cards.never, ids: [...document.querySelectorAll(".stage .dcard.up")].map((e) => +e.dataset.id) }; });
  check(!und.never[id] && und.ids.includes(id), "Undo brings it back");
  // not now rests 8 weeks
  const rests = await p.evaluate(async (id) => { const d = await import("./js/deck.js"); d.notForMe(id, "notnow", "2026-11-25"); return [d.hidden(id, "2026-12-30"), d.hidden(id, "2027-01-25")]; }, id);
  check(rests[0] && !rests[1], "Not where I'm at rests 8 weeks");
  await p.evaluate(async (id) => { (await import("./js/deck.js")).undoNotForMe(id); }, id);
  await p.locator('button.round[aria-label="Make today a rest day"]').click(); await p.waitForTimeout(400);
  check(await p.getByText("Rest day?").count() === 1, "moon asks first");
  await p.getByRole("button", { name: "Make today a rest day ›" }).click(); await p.waitForTimeout(800);
  const rest = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem("daydeck")).days)[0].rest);
  check(rest === true, "rest day set from the bubble");
  check(!errs.length, "no page errors " + errs.join("; "));
  await b.close(); server.close(); done();
})();
