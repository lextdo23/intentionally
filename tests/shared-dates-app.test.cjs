// Shared dates on the phone (alex 2026-11-27, js/plans.js and js/stack.js): the friend row on "When is it?", an invite
// waiting on home as "From Mia" with I'm in / Not this time, "Waiting for" and "With" under a shared date, the bell
// page's Invites, and the three-card limit. The service is played by a stand-in here (tests/shared-dates.test.cjs runs
// the real one). Made-up people and data only. SHOTS=1 saves pictures.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const SHOTS = process.env.SHOTS === "1";

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), errors = [];
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: SHOTS ? 2 : 1, locale: "en-AU" });
  const me = { username: "alex", name: "Alex", pic: "smile", adult: true, friends: 3 };
  const pals = [{ username: "mia.k", name: "Mia", pic: "flower" }, { username: "josh_r", name: "Josh", pic: "frog" }, { username: "sam", name: "", pic: "cat" }];
  let svc = { mine: [], invited: [] };
  const sent = [];
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", async (r) => {
    const u = new URL(r.request().url()), body = r.request().postDataJSON ? (() => { try { return r.request().postDataJSON(); } catch { return null; } })() : null;
    let out = { ok: true };
    if (u.pathname === "/a/f") out = { ok: true, me, friends: pals, asksYou: [], asked: [], blocked: [] };
    else if (u.pathname === "/a/f/feed") out = { ok: true, moments: [] };
    else if (u.pathname === "/a/f/plans") out = { ok: true, ...svc };
    else if (u.pathname === "/a/f/plan") {
      sent.push(["plan", body]);
      const plan = { id: body.id || "pAAAA", card: body.card, day: body.day, made: body.made, guests: body.guests.map((n) => ({ ...pals.find((p) => p.username === n), state: "ask" })) };
      svc.mine = svc.mine.filter((p) => p.id !== plan.id).concat(plan); out = { ok: true, plan };
    } else if (u.pathname === "/a/f/plan/answer") { sent.push(["answer", body]); out = { ok: true, state: body.yes ? "in" : "none" }; }
    else if (u.pathname === "/a/f/plan/drop") { sent.push(["drop", body]); svc.mine = svc.mine.filter((p) => p.id !== body.id); }
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(out), headers: { "access-control-allow-origin": "*" } });
  });
  await ctx.addInitScript(() => localStorage.setItem("daydeck-account", JSON.stringify({ token: "made-up", user: { username: "alex", email: "a@example.com" } })));
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(server.url);
  const shot = (n) => SHOTS && p.screenshot({ path: `/tmp/shared-dates-${n}.png` });
  const load = async (extra) => {
    const days = {}; for (let i = 1; i < 9; i++) days[day(i)] = { sleep: { bed: 1380, wake: 420, rested: 3 }, mood: 3, card: { id: 1, done: true } };
    days[day(0)] = { sleep: { bed: 1380, wake: 420, rested: 3 }, card: { id: 213, at: Date.now() - 3600e3, hands: [[213, 460, 57]] } };
    extra(days);
    await p.evaluate(({ days, s }) => { localStorage.removeItem("daydeck-plans"); localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: s, days, pillars: ["Love", "Move", "Friends"].map((name) => ({ name, mindsets: [] })), focus: ["Love", "Move"],
      seen: { note: "x", setup: 1, testInvite: 1, notifCard: 1, crumbsOffer: 1, signup: 1 }, notes: { sleepHint: 1 }, levels: { reset: 2, base: 0, l1: 0, seen: 6, opened: 9, tips: { days: 1, friends: 1, cards: 1, recap: 1, own: 1, boxes: 1, library: 1 } }, boxes: { open: 9 } })); }, { days, s: day(8) });
    await p.reload(); await p.waitForTimeout(3500);
    await p.evaluate(() => document.querySelectorAll(".tip-layer,.sheet-host,.lu").forEach((e) => e.remove()));
  };
  const tops = () => p.$$eval(".stack-top", (x) => x.map((b) => b.innerText.replace(/\s+/g, " ").trim()));

  // ---- Inviting from "When is it?" ----
  await load((d) => { d[day(0)].card = { id: 88, at: Date.now() - 3600e3, done: true, how: 3, hands: [[88, 460, 57]] }; });
  await p.evaluate(async (k) => { (await import("./js/stack.js")).whenSheet(k, null, "home"); }, day(0));
  await p.waitForTimeout(800);
  const faces = await p.$$eval(".plan-face", (x) => x.map((b) => b.innerText.trim()));
  check(faces.join() === "Mia,Josh,sam", `"When is it?" lists friends to invite (${faces})`);
  await p.fill(".when-date", day(-6));
  await p.click('.plan-face[aria-label="Invite Mia"]'); await p.click('.plan-face[aria-label="Invite Josh"]');
  check(/Save and invite 2 friends/.test(await p.innerText(".sheet-host .btn-main")), "the button says who's being invited");
  await p.click('.plan-face[aria-label="Invite Josh"]');
  check(/Save and invite Mia/.test(await p.innerText(".sheet-host .btn-main")), "untick one and it names the one left");
  const geo = await p.$eval('.plan-face.on', (b) => { const r = b.querySelector(".plan-pic").getBoundingClientRect(), n = b.querySelector("span:last-child").getBoundingClientRect(), row = b.parentElement.getBoundingClientRect(); return { gap: n.top - r.bottom, top: r.top - 5 - row.top }; });
  check(geo.gap >= 3 && geo.top >= 0, `the picked friend's ring and tick never touch the name or get cut off (${JSON.stringify(geo)})`);
  await shot("1-when");
  await p.click(".sheet-host .btn-main"); await p.waitForTimeout(1500);
  const plan = sent.find((x) => x[0] === "plan");
  check(plan && plan[1].card === 88 && plan[1].day === day(-6) && plan[1].made === day(0) && plan[1].guests.join() === "mia.k", "sends just the card number, the date and who");
  let s = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")));
  check(s.days[day(0)].card.plan === "pAAAA" && s.days[day(0)].card.when === day(-6), "the plan is kept on the card, so it backs up with the day");

  // ---- Waiting for / With, on the sender's home ----
  svc.mine = [{ id: "pAAAA", card: 88, day: day(-6), made: day(1), guests: [{ ...pals[0], state: "in" }, { ...pals[1], state: "ask" }] }];
  await load((d) => { d[day(1)].card = { id: 88, done: true, when: day(-6), plan: "pAAAA" }; });
  check((await tops()).some((t) => /Date night/.test(t)), "the shared date waits behind today's card");
  check(await p.$(".stack-top .st-face"), "with a small face beside its date");
  await p.click(".stack-top", { force: true }); await p.waitForTimeout(1200);
  check(/With Mia · Waiting for Josh/.test(await p.innerText(".plan-with").catch(() => "")), "in front: With Mia · Waiting for Josh");
  await shot("2-sender");

  // ---- An invite on the friend's home ----
  svc = { mine: [], invited: [{ id: "pB", card: 88, day: day(-8), made: day(2), state: "ask", by: pals[0], others: [] }] };
  await load(() => {});
  check((await tops()).some((t) => /Date night.*From Mia/.test(t)), `an invite waits as Date night · From Mia (${await tops()})`);
  await p.click(".stack-top >> nth=0", { force: true }); await p.waitForTimeout(1200);
  check(/From Mia/.test(await p.innerText(".stack-front .plan-from").catch(() => "")) && await p.$(".stack-front .did"), "in front: From Mia and I'm in");
  check(!!(await p.$(".plan-no")), "Not this time sits under the card");
  const fit = await p.evaluate(() => { const pill = document.querySelector(".pill"), no = document.querySelector(".plan-no"); return !pill || no.getBoundingClientRect().bottom <= pill.getBoundingClientRect().top; });
  check(fit, "nothing runs under the bottom pill");
  await shot("3-invite");
  await p.click(".stack-front .did", { force: true }); await p.waitForTimeout(1200);
  check(sent.some((x) => x[0] === "answer" && x[1].id === "pB" && x[1].yes === true), "I'm in answers yes");
  check((await tops()).some((t) => /Date night/.test(t) && !/From/.test(t)) || /With Mia/.test(await p.innerText(".plan-with").catch(() => "")), "then it's a date like your own, with Mia");

  // ---- Not this time ----
  svc = { mine: [], invited: [{ id: "pC", card: 57, day: day(-8), made: day(2), state: "ask", by: pals[1], others: [] }] };
  await load(() => {});
  await p.click(".stack-top >> nth=0", { force: true }); await p.waitForTimeout(1200);
  await p.click(".plan-no", { force: true }); await p.waitForTimeout(1000);
  check(sent.some((x) => x[0] === "answer" && x[1].id === "pC" && x[1].yes === false) && !(await tops()).some((t) => /Family meal/.test(t)), "Not this time takes it away");

  // ---- On the day ----
  svc = { mine: [], invited: [{ id: "pD", card: 88, day: day(0), made: day(4), state: "in", by: pals[0], others: [pals[1]] }] };
  await load(() => {});
  check(/With Mia and Josh/.test(await p.innerText(".plan-with").catch(() => "")) && await p.$(".stack-front .cam, .stack-front [aria-label*='photo' i]"), "on the day it's in front with the camera, With Mia and Josh");
  await shot("4-day");

  // ---- Full stack: the invite waits on the bell page ----
  svc = { mine: [], invited: [{ id: "pE", card: 88, day: day(-9), made: day(1), state: "ask", by: pals[0], others: [] }] };
  await load((d) => { d[day(3)].card = { id: 88, done: true, when: day(-4) }; d[day(2)].card = { id: 460, done: true, ticks: [day(2)] }; });
  check(!(await tops()).some((t) => /From Mia/.test(t)) && (await tops()).length === 2, "with two already waiting, the invite doesn't push onto home");
  await p.evaluate(async () => (await import("./js/friends.js")).openNotes()); await p.waitForTimeout(800);
  check(/Mia invited you to Date night/.test(await p.innerText(".fr-page").catch(() => "")), "it waits on the bell page under Invites");
  await shot("5-bell");

  // ---- Calling it off ----
  svc = { mine: [{ id: "pF", card: 88, day: day(-6), made: day(0), guests: [{ ...pals[0], state: "in" }] }], invited: [] };
  await load((d) => { d[day(0)].card = { id: 88, at: Date.now() - 3600e3, done: true, when: day(-6), plan: "pF", hands: [[88, 460, 57]] }; });
  await p.evaluate(async (k) => { (await import("./js/stack.js")).whenSheet(k, null, "home", (await import("./js/store.js")).get().days[k].card.when); }, day(0));
  await p.waitForTimeout(800);
  check(await p.$('.plan-face.on[aria-label="Invite Mia"]'), "changing the date shows who's already invited");
  await p.click(".sheet-host .btn-quiet"); await p.waitForTimeout(800);
  s = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")));
  check(sent.some((x) => x[0] === "drop" && x[1].id === "pF") && !s.days[day(0)].card.plan, "Not set yet calls it off");

  check(!errors.length, `no errors (${errors.join("; ")})`);
  await b.close(); server.close(); done();
})();
