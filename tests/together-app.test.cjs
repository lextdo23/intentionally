// Card with a friend (alex 2026-11-28, js/together.js): a card a friend kept today can be one of the three (at most
// once a week), a bubble says "Sam drew this one too" once it's turned over, keeping it tells the service only the
// card's number, and home says "You and Sam are both doing this today". With no friends yet: the day 2 "Add a friend"
// sheet once, and a quiet row under the card on days 3, 8, 13 and 18 only. Made-up people, a pretend service.
// SHOTS=1 saves pictures.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");
const SHOTS = process.env.SHOTS, OUT = __dirname + "/shots";

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const sent = [];
  let friendsList = [], kept = [];
  const setup = async (opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, serviceWorkers: "block", reducedMotion: opts.motion ? "no-preference" : "reduce" });
    await ctx.addInitScript(() => {
      localStorage.setItem("daydeck-account", JSON.stringify({ token: "tok", user: { username: "mia.k", email: "mia@example.com", test: true } }));
    });
    await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => {
      const u = new URL(r.request().url()), m = r.request().method();
      let body = { ok: true };
      if (u.pathname === "/a/me") body = { ok: true, user: { username: "mia.k", email: "mia@example.com", test: true } };
      else if (u.pathname === "/a/f") body = { ok: true, me: { username: "mia.k", name: "Mia", pic: "smile", adult: true, friends: friendsList.length }, friends: friendsList, asksYou: [], asked: [], blocked: [] };
      else if (u.pathname === "/a/f/kept" && m === "GET") body = { ok: true, kept };
      else if (u.pathname === "/a/f/kept" && m === "POST") sent.push(JSON.parse(r.request().postData()));
      else if (u.pathname === "/a/f/feed") body = { ok: true, moments: [] };
      else if (u.pathname === "/a/f/suggest") body = { ok: true, people: [] };
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });
    });
    const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(server.url);
    return { ctx, p, errors };
  };
  // A person on day n with this morning's sleep check-in done and no card yet.
  const dayState = (p, n, today = {}) => p.evaluate(async ({ n, today }) => {
    const util = await import("./js/util.js"); const k = util.dayKey(), y = util.addDays(k, -1);
    const s = { v: 1, started: util.addDays(k, -(n - 1)), seen: { note: "sleep", testInvite: 1, crumbsOffer: 1, notifCard: 1, setup: 1, signup: 1 }, levels: { seen: 3 },
      pillars: [{ name: "Friends", mindsets: [] }, { name: "Rest", mindsets: [] }, { name: "Self", mindsets: [] }],
      days: { [y]: { sleep: { bed: 1380, wake: 450, rested: 2, tags: [] }, card: { id: 10, hands: [[10, 167, 416]], done: true }, mood: 3 }, [k]: { sleep: { bed: 1390, wake: 440, rested: 2, tags: [] }, ...today } } };
    const old = JSON.parse(localStorage.getItem("daydeck") || "{}");
    s.seen = { ...(old.seen || {}), ...s.seen }; localStorage.setItem("daydeck", JSON.stringify({ ...old, ...s }));
    localStorage.removeItem("daydeck-together");
    return k;
  }, { n, today });

  // ---------------- A friend's card in the hand ----------------
  friendsList = [{ username: "sam", name: "Sam", pic: "frog" }];
  let { ctx, p, errors } = await setup({ motion: true });
  const k = await dayState(p, 2);
  await p.reload(); await p.waitForTimeout(1200);
  const theirs = await p.evaluate(async () => { const deck = await import("./js/deck.js"); return deck.starterPool(deck.dealable()).filter((id) => ![10, 167, 416].includes(id))[0]; });
  kept = [{ username: "sam", name: "Sam", pic: "frog", card: theirs }, { username: "josh_r", name: "Josh", pic: "cat", card: 99999 }];
  await p.evaluate(async (k) => {
    document.querySelectorAll(".sheet-host,.tip-layer,.lu").forEach((e) => e.remove());
    const friends = await import("./js/friends.js"), together = await import("./js/together.js");
    await friends.load(); await together.refresh(k);
    document.querySelector(".home-card.blank").click();
  }, k);
  await p.waitForTimeout(1800);
  const hand = await p.evaluate(async () => { const s = JSON.parse(localStorage.getItem("daydeck")); const u = await import("./js/util.js"); return s.days[u.dayKey()].card.hands[0]; });
  check(hand.includes(theirs), "Sam's kept card is one of the three");
  check(!hand.includes(99999), "never a card that isn't in your own deck");
  check(!(await p.$(".pal-bub")), "nothing shows while it's face down");
  const tap = (i) => p.evaluate((i) => [...document.querySelectorAll(".stage .dcard")].filter((e) => e.style.pointerEvents === "auto")[i].click(), i);
  for (let i = 0; i < 3; i++) { await tap(i); await p.waitForTimeout(500); }
  await p.waitForTimeout(1200);
  const bub = await p.evaluate(() => { const b = document.querySelector(".pal-bub"); if (!b) return null; const r = b.getBoundingClientRect(); const c = [...document.querySelectorAll(".stage .dcard")].find((e) => e.dataset.id === String(b.dataset.for || "")); return { text: b.textContent, open: b.classList.contains("open"), left: r.left, right: r.right }; });
  check(bub && bub.text === "Sam drew this one too" && bub.open, "turned over, the bubble opens into \"Sam drew this one too\"");
  check(bub && bub.left >= 15 && bub.right <= 415, "the bubble stays on screen");
  const hint = await p.textContent(".hand-hint");
  check(hint === "Do it together, or each your own way.", "once all three are turned, the line under the hand says so");
  check(await p.textContent("h1.q") === "Pick one for today", "the title stays");
  if (SHOTS) await p.screenshot({ path: OUT + "/together-hand.png" });
  // Keep Sam's card.
  await p.evaluate((id) => [...document.querySelectorAll(".stage .dcard")].find((e) => e.dataset.id === String(id)).click(), theirs);
  await p.waitForTimeout(600);
  await p.click("text=Keep this one"); await p.waitForTimeout(900);
  await p.click("text=Done"); await p.waitForTimeout(2200);
  check(sent.length === 1 && sent[0].day === k && sent[0].card === theirs && Object.keys(sent[0]).sort().join() === "card,day", "keeping it sends only the day and the card's number");
  const line = await p.evaluate(() => { const l = document.querySelector(".home-hold .pal-line"); return l ? l.textContent : null; });
  check(line === "You and Sam are both doing this today", "home: \"You and Sam are both doing this today\" under the card");
  const order = await p.evaluate(() => { const s = document.querySelector(".home-hold .undo-slot"); return s ? [...s.children].map((x) => x.className.split(" ")[0]) : []; });
  check(order[0] === "pal-line", "the line sits above \"Add a photo\"");
  const saved = await p.evaluate(() => localStorage.getItem("daydeck"));
  check(!saved.includes("Sam") && !saved.includes("\"sam\""), "a friend's name never goes into your days (or the backup)");
  if (SHOTS) await p.screenshot({ path: OUT + "/together-home.png" });
  // Once a week at most: tomorrow's hand never holds a friend's card.
  const again = await p.evaluate(async ({ k, theirs }) => {
    const together = await import("./js/together.js"), util = await import("./js/util.js");
    const t = util.addDays(k, 3);
    const a = together.forHand(t, [1, 2, 3]);
    return a.pal;
  }, { k, theirs });
  check(again === null, "at most once a week");
  check(!errors.length, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await ctx.close();

  // ---------------- The friend's side: same line, with your face ----------------
  ({ ctx, p, errors } = await setup());
  const k2 = await dayState(p, 6, { card: { id: 12, hands: [[12, 572, 412]] } });
  kept = [{ username: "sam", name: "Sam", pic: "frog", card: 12 }];
  await p.reload(); await p.waitForTimeout(3500);
  const l2 = await p.evaluate(() => { const l = document.querySelector(".home-hold .pal-line"); return l ? l.textContent : null; });
  check(l2 === "You and Sam are both doing this today", "a friend who kept the same card first sees it on their next open");
  kept = [];
  check(!errors.length, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await ctx.close();

  // ---------------- No friends yet: the day 2 sheet ----------------
  friendsList = []; kept = []; const sentBefore = sent.length;
  ({ ctx, p, errors } = await setup());
  await dayState(p, 2);
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(async () => { document.querySelectorAll(".sheet-host,.tip-layer,.lu").forEach((e) => e.remove()); await (await import("./js/friends.js")).load(); document.querySelector(".home-card.blank").click(); });
  await p.waitForTimeout(800);
  const tap2 = (i) => p.evaluate((i) => [...document.querySelectorAll(".stage .dcard")].filter((e) => e.style.pointerEvents === "auto")[i].click(), i);
  for (let i = 0; i < 3; i++) { await tap2(i); await p.waitForTimeout(150); }
  await tap2(1); await p.waitForTimeout(300);
  await p.click("text=Keep this one"); await p.waitForTimeout(500);
  await p.click("text=Done"); await p.waitForTimeout(4000);
  const sheet = await p.evaluate(() => { const s = document.querySelector(".sheet-host"); return s ? s.textContent : ""; });
  check(sheet.includes("Some mornings, you'll both draw the same card") && sheet.includes("Invite a friend") && sheet.includes("Add by username") && sheet.includes("Not now"), "day 2, card kept: \"Some mornings, you'll both draw the same card\"");
  if (SHOTS) await p.screenshot({ path: OUT + "/together-sheet.png" });
  check(sent.length === sentBefore, "no friends: nothing is sent to the service");
  await p.click(".sheet-host >> text=Not now"); await p.waitForTimeout(600);
  const never = await p.evaluate(async () => (await import("./js/together.js")).sheetDue((await import("./js/util.js")).dayKey()));
  check(!never, "Not now means never again");
  check(!errors.length, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await ctx.close();

  // ---------------- No friends yet: the quiet row, now and then ----------------
  ({ ctx, p, errors } = await setup());
  const rowOn = async (n) => {
    await dayState(p, n, { card: { id: 12, hands: [[12, 572, 412]] } });
    await p.reload(); await p.waitForTimeout(2600);
    return p.evaluate(() => { const r = document.querySelector(".home-hold .pal-row"); return r ? r.textContent : null; });
  };
  const days = {};
  for (const n of [2, 3, 4, 7, 8]) days[n] = await rowOn(n);
  check(days[3] === "Same card as a friend some days? Add one ›", "day 3: \"Same card as a friend some days? Add one ›\" under the card");
  check(!days[2] && !days[4] && !days[7], "not on the days in between");
  check(!!days[8], "again on day 8");
  check(!!(await rowOn(13)), "day 13"); if (SHOTS) await p.screenshot({ path: OUT + "/together-row.png" });
  check(!!(await rowOn(18)), "day 18 (the fourth time)");
  // (The test moves the first day, not the date, so the days it showed are made up here.)
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("daydeck")); s.seen.palRow = { days: ["2026-01-01", "2026-01-06", "2026-01-11", "2026-01-16"] }; localStorage.setItem("daydeck", JSON.stringify(s)); });
  check(!(await rowOn(23)), "4 times at most");
  // Swiped away: gone for good.
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("daydeck")); s.seen.palRow = { days: [] }; localStorage.setItem("daydeck", JSON.stringify(s)); });
  await rowOn(3);
  await p.evaluate(() => document.querySelectorAll(".tip-layer,.sheet-host,.lu").forEach((e) => e.remove()));
  const box = await (await p.$(".pal-row")).boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(box.x + box.width / 2 + i * 25, box.y + box.height / 2);
  await p.mouse.up(); await p.waitForTimeout(500);
  check(!(await rowOn(8)), "swiped away: it never comes back");
  // Tapping it opens Add friends.
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("daydeck")); s.seen.palRow = { days: [] }; localStorage.setItem("daydeck", JSON.stringify(s)); });
  await rowOn(3); await p.evaluate(() => document.querySelectorAll(".tip-layer,.sheet-host,.lu").forEach((e) => e.remove())); await p.click(".pal-row"); await p.waitForTimeout(800);
  check(await p.evaluate(() => !!document.querySelector("input[placeholder*=\"@username\"]")), "tapping it opens Add friends");
  // Once there's a friend, it stops.
  friendsList = [{ username: "sam", name: "Sam", pic: "frog" }];
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("daydeck")); s.seen.palRow = { days: [] }; localStorage.setItem("daydeck", JSON.stringify(s)); });
  check(!(await rowOn(3)), "with a friend it never shows");
  check(!errors.length, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await ctx.close();

  await b.close(); server.close(); done();
})();
