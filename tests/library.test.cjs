// The card library in the app: the Cards button, Everyone's (your pillars first, filters), adding a card (also one for a
// pillar you haven't picked), Your deck, sharing a card you made, the thumbs-up answer after "I did it", and testers
// being asked again after the consent change. The Daydeck service is played by a stand-in. Made-up cards only.
// SHOTS=folder saves pictures of each moment.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");
const SHOTS = process.env.SHOTS;

const LIST = { at: Date.now(), cards: [
  { id: "aaaaaaaaaa", t: 3, text: "Send a voice note instead of a text", name: "Jess", pillar: "Friends", mind: ["See them more"], up: 41 },
  { id: "bbbbbbbbbb", t: 2, text: "Phone in another room for the first 20 minutes of bed", name: "Tom", pillar: "Rest", mind: [], up: 37 },
  { id: "cccccccccc", t: 1, text: "Cook dinner together with no phones at the table", name: "", pillar: "Love", mind: [], up: 26 },
] };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: SHOTS ? 2 : 1 }), p = await ctx.newPage(), errors = [];
  // Accounts are on for everyone (alex 2026-11-20): this test is about something else, so it acts as someone who chose
  // "Use without an account".
  await ctx.addInitScript(() => { if (!localStorage.getItem("daydeck-account")) localStorage.setItem("daydeck-account", '{"skip":1}'); });
  p.on("pageerror", (e) => errors.push(e.message));
  const calls = [];
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", async (r) => {
    const path = r.request().url().split(".dev")[1], body = r.request().postData();
    calls.push([path, body ? JSON.parse(body) : null]);
    const json = path === "/l/list" ? LIST : path === "/l/share" ? { ok: true, id: "mmmmmmmmmm" } : path === "/l/status" ? { ok: true, status: { mmmmmmmmmm: "wait" } } : { ok: true };
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(json), headers: { "access-control-allow-origin": "*" } });
  });
  const shot = (n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png` });
  await p.goto(server.url);
  const k = await p.evaluate(async () => (await import("./js/util.js")).dayKey());
  const seed = (today, extra = {}) => p.evaluate(([k, today, extra]) => {
    const day = (id) => ({ sleep: { bed: 1380, wake: 420, rested: 2, tags: [] }, card: { hands: [[id, id + 1, id + 2]], id, done: true, how: 3 }, mood: 4, feel: [], pil: [] });
    const days = { "2026-11-14": day(1), "2026-11-15": day(10) }; days[k] = today;
    localStorage.setItem("daydeck", JSON.stringify(Object.assign({ v: 1, started: "2026-11-14", seen: { note: "sleep" }, levels: { seen: 3, base: 0, reset: 2, keepAll: true },
      pillars: [{ name: "Friends", mindsets: ["See them more"] }, { name: "Rest", mindsets: [] }, { name: "Outdoors", mindsets: [] }], days }, extra)));
  }, [k, today, extra]);
  await seed({ sleep: { bed: 1380, wake: 420, rested: 2, tags: [] }, card: { hands: [[2, 3, 4]], id: 2 } });
  await p.reload(); await p.waitForTimeout(1200);
  check(calls.length === 0 || !calls.some(([x]) => x.startsWith("/l/")), "a phone that never used the library doesn't call the service on open");

  // 1. The Cards button and Everyone's.
  const btn = p.locator('button[aria-label="Cards"]');
  check(await btn.count() === 1, "home has a Cards button");
  await btn.click(); await p.waitForTimeout(900); await shot("1-everyone");
  check(await p.locator("#cards .seg [aria-selected=true]").innerText() === "Everyone's", "Cards opens on Everyone's");
  check(await p.locator("#cards .lib-mini").count() === 2, "it shows cards for your pillars first (2 of 3)");
  check(/Jess/.test(await p.locator("#cards .lib-mini").first().innerText()) && /41/.test(await p.locator("#cards .lib-mini").first().innerText()), "most loved first, with who made it and the thumbs count");
  await p.locator("#cards .lib-chips .pill", { hasText: "All pillars" }).click(); await p.waitForTimeout(300);
  check(await p.locator("#cards .lib-mini").count() === 3, "All pillars shows every card");
  check(/Anonymous daydeck user/.test(await p.locator("#cards .lib-grid").innerText()), "a card with no name shows Anonymous daydeck user");
  await p.locator("#cards .lib-chips .pill", { hasText: /^Friends$/ }).first().click(); await p.waitForTimeout(300); await shot("2-filter");
  check(await p.locator("#cards .lib-mind").count() === 5, "a pillar shows its mindsets to filter by");
  await p.locator("#cards .lib-mind", { hasText: "I want to meet new people" }).click(); await p.waitForTimeout(300);
  check(await p.locator("#cards .lib-mini").count() === 0 && /No cards here yet/.test(await p.locator("#cards").innerText()), "a mindset with no cards says so calmly");
  await p.locator("#cards .lib-mind", { hasText: "We're close, but I rarely see them" }).click(); await p.waitForTimeout(300);
  check(await p.locator("#cards .lib-mini").count() === 1, "a mindset filter shows its cards");
  await p.locator("#cards .lib-sort").click(); await p.waitForTimeout(200);
  check(/Newest/.test(await p.locator("#cards .lib-sort").innerText()), "the order switches to Newest");

  // 2. Adding cards.
  await p.locator("#cards .lib-chips .pill", { hasText: "Your pillars" }).click(); await p.waitForTimeout(300);
  await p.locator("#cards .lib-mini", { hasText: "Phone in another room" }).click(); await p.waitForTimeout(500); await shot("3-open");
  await p.locator(".lib-view .btn-main", { hasText: "Add to my deck" }).click(); await p.waitForTimeout(300); await shot("4-added");
  check(/In your deck/.test(await p.locator(".lib-view").innerText()), "adding says it's in your deck");
  const inDeck = await p.evaluate(async () => (await import("./js/deck.js")).deck());
  check(inDeck.includes("lbbbbbbbbbb"), "the added card is in the morning draw deck");
  await p.locator(".lib-view .round").click(); await p.waitForTimeout(400);
  await p.locator("#cards .lib-chips .pill", { hasText: "All pillars" }).click(); await p.waitForTimeout(300);
  await p.locator("#cards .lib-mini", { hasText: "Cook dinner" }).click(); await p.waitForTimeout(500);
  await p.locator(".lib-view .btn-main").click(); await p.waitForTimeout(300); await shot("5-other-pillar");
  check(/only come up in your draws if you pick Love/.test(await p.locator(".lib-view").innerText()), "a card for a pillar you haven't picked says when it comes up");
  check(!(await p.evaluate(async () => (await import("./js/deck.js")).deck())).includes("lcccccccccc"), "and it isn't drawn until then");
  await p.locator(".lib-view .round").click(); await p.waitForTimeout(400);

  // 3. Your deck.
  await p.locator("#cards .seg button", { hasText: "Your deck" }).click(); await p.waitForTimeout(400); await shot("6-your-deck");
  const yd = await p.locator("#cards .ph-page").innerText();
  check(/From the library/.test(yd) && /Rest/.test(yd) && /Friends/.test(yd), "Your deck lists cards from the library and your pillars' cards");
  await p.locator("#cards .round").first().click(); await p.waitForTimeout(600);

  // 4. Making a card and showing it to everyone (one screen).
  await p.evaluate(async () => { document.body.classList.add("in-flow"); (await import("./js/own.js")).makeCard({ back() {}, kept() { window.__kept = 1; } }); });
  await p.waitForTimeout(900);
  await p.locator("textarea.own-text").fill("Text a friend a song that reminds you of them");
  await p.locator("button.own-pil", { hasText: "Friends" }).click();
  await p.locator(".step.in button.btn-main", { hasText: "Next" }).click(); await p.waitForTimeout(800);
  await p.locator(".step.in button.pill", { hasText: "Closer to someone" }).first().click();
  check(await p.locator(".step.in .own-by").count() === 0, "the name isn't on the card until Show it to everyone is on");
  await p.locator('.step.in button[aria-label="Show it to everyone"]').click(); await p.waitForTimeout(200);
  await p.locator(".step.in .own-by input").fill("Sam"); await shot("7-make");
  check(await p.locator(".step.in .own-by").count() === 1, "turning it on writes Made by on the card");
  await p.locator(".step.in button.btn-main", { hasText: "Keep it" }).click(); await p.waitForTimeout(1200);
  const sh = calls.find(([x]) => x === "/l/share");
  check(sh && sh[1].text === "Text a friend a song that reminds you of them" && sh[1].name === "Sam" && sh[1].pillar === "Friends" && sh[1].mind[0] === "See them more" && /^[0-9a-f]{32}$/.test(sh[1].key),
    "sharing sends only the words, the name, the pillar and its mindsets, under the phone's random key");
  check(sh && Object.keys(sh[1]).sort().join() === "key,mind,name,pillar,text", "nothing else goes with it");
  await p.evaluate(() => document.querySelectorAll(".step").forEach((x) => x.remove())); await p.evaluate(() => document.body.classList.remove("in-flow"));
  await p.evaluate(async () => { (await import("./js/library.js")).openCards(() => {}); }); await p.waitForTimeout(700);
  await p.locator("#cards .seg button", { hasText: "Your deck" }).click(); await p.waitForTimeout(400); await shot("8-waiting");
  check(/Waiting to be checked/.test(await p.locator("#cards .ph-page").innerText()), "Your deck shows the shared card waiting to be checked");
  await p.locator("#cards .round").first().click(); await p.waitForTimeout(600);

  // 5. Thumbs up after "I did it" on a library card (not offered on your own).
  const lib = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).lib);
  await seed({ sleep: { bed: 1380, wake: 420, rested: 2, tags: [] }, card: { hands: [["lbbbbbbbbbb", 3, 4]], id: "lbbbbbbbbbb" } }, { lib });
  await p.reload(); await p.waitForTimeout(1200);
  check(/Made by Tom/.test(await p.locator(".home-card").innerText()), "a library card on home says who made it");
  await p.locator(".home-card .did").click({ force: true }); await p.waitForTimeout(1800); await shot("9-thumb");
  const up = p.locator(".did-ask .lib-up");
  check(await up.count() === 1 && /Thumbs up for Tom/.test(await up.innerText()), "\"Thumbs up for Tom\" is one of the answers");
  await up.click(); await p.locator(".did-ask .pill", { hasText: "Calmer" }).first().click();
  await p.locator(".did-ask .ok").click(); await p.waitForTimeout(800);
  check(calls.some(([x, bd]) => x === "/l/up" && bd.id === "bbbbbbbbbb"), "Done sends the thumbs up");
  const lib2 = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).lib);
  lib2.cards.mmmmmmmmmm = { text: "Text a friend a song", name: "Sam", pillar: "Friends", mind: [] }; lib2.added.push("mmmmmmmmmm");
  await seed({ sleep: { bed: 1380, wake: 420, rested: 2, tags: [] }, card: { hands: [["lmmmmmmmmmm", 3, 4]], id: "lmmmmmmmmmm" } }, { lib: lib2 });
  await p.reload(); await p.waitForTimeout(1200);
  await p.locator(".home-card .did").click({ force: true }); await p.waitForTimeout(1500);
  check(await p.locator(".did-ask .lib-up").count() === 0, "no thumbs up for your own card");

  // 6. A tester who agreed before the change is asked again; nothing is sent until they answer.
  await seed({ sleep: { bed: 1380, wake: 420, rested: 2, tags: [] } }, { tester: { on: true, consent: 1, code: "T-TEST", key: "0".repeat(32), queue: [], sent: 1 } });
  calls.length = 0; await p.reload(); await p.waitForTimeout(1500); await shot("10-ask-again");
  check(/One change to what's shared/.test(await p.locator(".sheet").innerText()), "a tester is asked again after the consent change");
  check(!calls.some(([x]) => x === "/t/send"), "nothing is sent before they answer");
  await p.locator(".sheet .btn-main", { hasText: "Keep sharing" }).click(); await p.waitForTimeout(800);
  check(await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).tester.consent) === 2 && calls.some(([x]) => x === "/t/send"), "Keep sharing carries on sending");

  check(!errors.length, `no errors (${errors.join(" | ")})`);
  await b.close(); server.close(); done();
})();
