// Pillars were reworked (alex 2026-11-20). Someone who picked a set-aside pillar or an old mindset is asked once to pick
// again; "Pick again" opens the picker without the set-aside pillar; "Not now" keeps what still exists and never asks again.
// Someone whose answers all still exist goes straight to the draw.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

const OLD = [{ name: "Friends", mindsets: ["I feel lonely"] }, { name: "Outdoors", mindsets: ["Explore more"] }, { name: "Move", mindsets: ["Keep going"], kind: "Gym" }, { name: "Rest", mindsets: [], other: "x" }];

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 430, height: 932 } }), p = await ctx.newPage(), errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.abort());
  await p.goto(server.url + "v2/");
  const start = async (pillars) => {
    await p.evaluate((pillars) => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: "2026-11-10", days: {}, seen: { note: "x" }, pillars })), pillars);
    await p.reload(); await p.waitForTimeout(1200);
    const note = p.getByRole("button", { name: "Got it" }); if (await note.count()) { await note.click(); await p.waitForTimeout(500); }   // a "What's new" note
    await p.evaluate(async () => (await import("./js/draw.js")).openDraw(() => {})); await p.waitForTimeout(900);
  };
  const state = () => p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")));

  await start(OLD);
  const text = await p.locator("#flow").innerText();
  check(/new choices/.test(text), "old answers: the pick-again screen shows");
  check(/Outdoors is set aside for now/.test(text), "it names the set-aside pillar");
  check(/Lifeline/.test(text), "Lifeline is still on the screen");
  await p.getByRole("button", { name: "Pick again" }).click(); await p.waitForTimeout(700);
  const pressed = await p.locator("#flow .pill[aria-pressed=true]").allInnerTexts();
  check(pressed.join() === "Friends,Move,Rest", `the picker keeps Friends, Move and Rest (${pressed.join(", ")})`);
  check(await p.locator("#flow .pill", { hasText: "Outdoors" }).count() === 0, "Outdoors isn't offered");
  check(await p.locator("#flow .pill", { hasText: /^Self$/ }).count() === 1, "Self is offered");
  let s = await state();
  check(s.repicked === 1 && s.pillars.length === 3 && s.pillars[0].mindsets.join() === "I feel lonely" && s.pillars[1].kind === "Gym" && !("other" in s.pillars[2]),
    "answers that still exist are kept, old ones dropped");

  await start(OLD);
  await p.getByRole("button", { name: "Not now" }).click(); await p.waitForTimeout(1200);
  s = await state();
  check(s.repicked === 1 && s.pillars.map((x) => x.name).join() === "Friends,Move,Rest" && s.pillars[1].mindsets.length === 0, "Not now tidies the answers");
  check(await p.locator("#flow .hc").count() > 0, "and goes on to the draw");
  await p.reload(); await p.waitForTimeout(1200);
  { const note = p.getByRole("button", { name: "Got it" }); if (await note.count()) { await note.click(); await p.waitForTimeout(500); } }
  await p.evaluate(async () => (await import("./js/draw.js")).openDraw(() => {})); await p.waitForTimeout(900);
  check(!/new choices/.test(await p.locator("#flow").innerText()), "it isn't asked again");

  await start([{ name: "Self", mindsets: ["More confident"] }, { name: "Move", mindsets: ["Sit too much"] }, { name: "Meaning", mindsets: ["Breath away"] }]);
  check(await p.locator("#flow .hc").count() > 0 && !/new choices/.test(await p.locator("#flow").innerText()), "new answers go straight to the draw");
  check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
