// The starter deck (alex 2026-11-28, plan "Daydeck: getting people to do their card"): on days 1 to 3 the morning hand
// comes from the starter cards in the person's own deck (tiny cards picked to be easy and likely to lift); other tiny
// cards fill in when there aren't three; from day 4 the usual deck. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(server.url);
  const r = await p.evaluate(async () => {
    const store = await import("./js/store.js"), deck = await import("./js/deck.js"), { BANK } = await import("./js/cards-data.js");
    const util = await import("./js/util.js");
    const s = store.get(), k = util.dayKey(), o = {};
    const hands = (n) => { const out = []; for (let i = 0; i < n; i++) { s.cards = {}; out.push(...deck.draw3([], k)); } return out; };
    o.allTiny = [...deck.STARTER].every((id) => BANK[id - 1] && BANK[id - 1][2] === "Tiny" && !BANK[id - 1][7]);
    s.pillars = [{ name: "Friends", mindsets: [] }, { name: "Rest", mindsets: [] }, { name: "Self", mindsets: [] }];
    s.started = k; o.day1 = hands(40).every((id) => deck.STARTER.has(id));
    s.started = util.addDays(k, -2); o.day3 = hands(40).every((id) => deck.STARTER.has(id));
    s.started = util.addDays(k, -3); o.day4 = hands(40).some((id) => !deck.STARTER.has(id));
    // Only two starter cards in this deck: other tiny cards fill the hand, never bigger ones.
    s.started = k; s.pillars = [{ name: "Work and study", mindsets: ["Looking for work"] }];
    const h1 = hands(30); o.fill = h1.every((id) => BANK[id - 1][2] === "Tiny" || deck.STARTER.has(id)) && h1.length >= 3;
    return o;
  });
  check(r.allTiny, "every starter card is a live tiny card");
  check(r.day1 && r.day3, "days 1 to 3: every card in the hand is a starter card");
  check(r.day4, "day 4: the usual deck again");
  check(r.fill, "too few starters in someone's deck: other tiny cards fill in");
  check(!errors.length, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
