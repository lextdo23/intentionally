// Cards that happen later (alex 2026-11-27, js/later.js and js/stack.js): set-a-date cards ask "When is it?" and wait
// behind today's card until the date, then come to the front for a photo kept on the date as a second photo; week
// cards run 7 days and tick a day at a time. Also: the second photo's note, backup queue and backup sync. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), errors = [];
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  await ctx.addInitScript(() => localStorage.setItem("daydeck-account", '{"skip":1}'));
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(server.url);
  const load = async (extra, test = {}) => {
    const days = {}; for (let i = 1; i < 9; i++) days[day(i)] = { sleep: { bed: 1380, wake: 420, rested: 3 }, mood: 3, card: { id: 1, done: true } };
    days[day(0)] = { sleep: { bed: 1380, wake: 420, rested: 3 }, card: { id: 1, at: Date.now() - 3600e3, hands: [[1, 460, 57]] } };
    extra(days);
    await p.evaluate(({ days, s, test }) => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: s, days, pillars: ["Love", "Move", "Friends"].map((name) => ({ name, mindsets: [] })), focus: ["Love", "Move"],
      seen: { note: "x", setup: 1, testInvite: 1, notifCard: 1 }, notes: { sleepHint: 1 }, levels: { reset: 2, base: 0, l1: 0, seen: 6, opened: 9, tips: { days: 1, friends: 1, cards: 1, recap: 1, own: 1, boxes: 1, library: 1 } }, boxes: { open: 9 }, ...test })), { days, s: day(8), test });
    await p.reload(); await p.waitForTimeout(3000);
    await p.evaluate(() => document.querySelectorAll(".tip-layer,.sheet-host,.lu").forEach((e) => e.remove()));
  };
  const L = async (fn, arg) => { await p.evaluate(async () => { window.__later = await import("./js/later.js"); }); return p.evaluate(fn, arg); };
  const tops = () => p.$$eval(".stack-top", (x) => x.map((b) => b.getAttribute("aria-label")));
  const store = () => p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")));

  // The rules: what waits, and when it goes.
  await load((d) => {
    d[day(3)].card = { id: 88, done: true, when: day(-4) };          // a date in 4 days
    d[day(2)].card = { id: 460, done: true, ticks: [day(2)] };       // a week card, 1 of 3
    d[day(5)].card = { id: 57, done: true, nodate: 1 };              // "Not set yet", 5 days ago
    d[day(8)].card = { id: 504, done: true, ticks: [day(8)] };       // a week card that ran out
    d[day(6)].card = { id: 60, done: true, when: day(2) };           // a date two days ago: gone
  });
  let st = await L(() => { const later = window.__later; return later.stack().map((x) => [x.label, x.status, x.kind]); });
  check(st.length === 2, `two cards wait at most, three on home with today's (${JSON.stringify(st)})`);
  check(st.some((x) => x[0] === "Date night" && /\w{3} \d+ \w{3}/.test(x[1])), "the date shows with its day");
  check(st.some((x) => x[0] === "Walk or jog" && x[2] === "week"), "the week card waits with its ticks");
  check(!st.some((x) => x[0] === "Family meal"), "with no room, a date not set yet waits its turn behind dated and week cards");
  check(!st.some((x) => x[0] === "Lunch walks" || x[0] === "Family visit"), "a week card past 7 days and a date before yesterday have gone");
  check((await tops()).length === 2 && await p.$(".stack-front .did"), "home shows them as tops behind today's card, today's card in front");
  const dl = await p.evaluate(async () => { const deck = await import("./js/deck.js"), later = await import("./js/later.js"); const ids = deck.dealable(); return { later: ids.filter((i) => later.kindOf(i)).length, any: ids.length }; });
  check(dl.any > 0 && dl.later === 0, "while two wait, the morning hand leaves out date and week cards");
  check(await p.$eval(".stack-tops", (e) => getComputedStyle(e).animationName) === "bob-soft", "the tops float, gently");

  // Tapping a top brings that card forward; today's card becomes a top.
  await p.click('.stack-top[aria-label^="Walk or jog"]', { force: true }); await p.waitForTimeout(900);
  check(/Walk or jog/.test(await p.innerText(".stack-front .ctag").catch(() => "")) || /1 of 3 days/.test(await p.innerText(".stack-front").catch(() => "")), "tapping a top brings that card to the front");
  check((await tops()).some((x) => /^Today's card/.test(x)), "and today's card waits as a top");
  await p.click('.stack-front button.did', { force: true }); await p.waitForTimeout(600);
  let s = await store();
  check(JSON.stringify(s.days[day(2)].card.ticks) === JSON.stringify([day(2), day(0)]), "Did it today ticks today on the card's own day");
  check(/2 of 3 days/.test(await p.innerText(".stack-front").catch(() => "")), "the front card now shows 2 of 3 days");

  // The last tick asks how it felt.
  await load((d) => { d[day(2)].card = { id: 460, done: true, ticks: [day(2), day(1)] }; });
  await p.click('.stack-top[aria-label^="Walk or jog"]', { force: true }); await p.waitForTimeout(900);
  await p.click('.stack-front button.did', { force: true }); await p.waitForTimeout(1500);
  check(!!(await p.$(".did-ask")), "the last tick asks \"How did doing it feel?\"");
  await p.click(".did-ask .pill >> nth=0", { force: true }); await p.click(".did-ask .ok", { force: true }); await p.waitForTimeout(5500);
  s = await store();
  check(s.days[day(2)].card.ticks.length === 3 && (s.days[day(2)].card.felt || []).length === 1, "all three ticked, and how it felt is kept on the card's day");
  st = await L(() => { const later = window.__later; return later.stack().map((x) => x.label); });
  check(st.includes("Walk or jog"), "a finished week card stays for the rest of the day it finished");

  // "Not set yet" waits as Set the date; with room, date and week cards can be dealt again.
  await load((d) => { d[day(5)].card = { id: 57, done: true, nodate: 1 }; });
  st = await L(() => window.__later.stack().map((x) => [x.label, x.status]));
  check(st.some((x) => x[0] === "Family meal" && x[1] === "Set the date"), "\"Not set yet\" waits as Set the date");
  check(await p.evaluate(async () => { const deck = await import("./js/deck.js"), later = await import("./js/later.js"); return deck.dealable().some((i) => later.kindOf(i)); }), "with room behind today's card, date and week cards are dealt again");

  // A date card done before dates existed (no date, no "Not set yet") still waits as Set the date.
  await load((d) => { d[day(3)].card = { id: 88, done: true }; });
  st = await L(() => window.__later.stack().map((x) => [x.label, x.status]));
  check(st.some((x) => x[0] === "Date night" && x[1] === "Set the date"), "a date card done before this update waits as Set the date");

  // On the date: it comes to the front with just the camera in the middle.
  await load((d) => { d[day(3)].card = { id: 88, done: true, when: day(0) }; });
  check(/Today/.test(await p.innerText(".stack-front .ctag").catch(() => "")), "on the date, that card is in front when the day opens");
  check(await p.$$eval(".stack-front .card-foot > *", (x) => x.length) === 1 && !!(await p.$(".stack-front .mid-foot .card-cam")), "with only the camera, in the middle of its foot");

  // The second photo: its note, the photo list, backup and sync.
  const pk = `${day(0)}~${day(3)}`;
  const r = await p.evaluate(async (pk) => {
    const photos = await import("./js/photos.js"), store = await import("./js/store.js"), backup = await import("./js/photo-backup.js");
    const c = document.createElement("canvas"); c.width = 1080; c.height = 1512; c.getContext("2d").fillRect(0, 0, 10, 10);
    await photos.save(pk, c);
    const d = store.get().days[pk.slice(0, 10)];
    const out = { xph: !!(d.xph && d.xph[pk.slice(11)]), own: !!d.ph, has: photos.has(pk), inList: photos.keys().includes(pk), counted: backup.counts().all };
    return out;
  }, pk);
  check(r.xph && !r.own && r.has && r.inList, "the date's photo is kept on the date as a second photo, not over the day's own");
  check(r.counted >= 1, "photo backup sees it waiting to go up");
  st = await L(() => { const later = window.__later; return later.stack().map((x) => x.label); });
  check(st.includes("Date night"), "with a photo, it stays for the rest of the date");
  await load((d) => { d[day(4)].card = { id: 88, done: true, when: day(1) }; d[day(1)].xph = { [day(4)]: { w: 1 } }; });
  st = await L(() => { const later = window.__later; return later.stack().map((x) => x.label); });
  check(!st.includes("Date night"), "the day after, it's gone once there's a photo");
  await load((d) => { d[day(4)].card = { id: 88, done: true, when: day(1) }; });
  st = await L(() => { const later = window.__later; return later.stack().map((x) => [x.label, x.status]); });
  check(st.some((x) => x[0] === "Date night" && x[1] === "Yesterday"), "with no photo yet, it stays through the next day");

  // Backup sync carries a second photo's note only once it's backed up.
  const sy = await p.evaluate(async (k) => {
    const store = await import("./js/store.js"); const d = store.day(k); d.xph = { "2026-01-01": { w: 1 }, "2026-01-02": { w: 0, b: 1, v: 3 } }; store.save();
    const src = await (await fetch("./js/sync.js")).text();
    return /xph/.test(src);
  }, day(0));
  check(sy, "backup sync knows about second photos");

  // "I did it" on a set-a-date card: how it felt, then "When is it?".
  await load((d) => { d[day(0)].card = { id: 88, at: Date.now() - 3600e3, hands: [[88, 1, 57]] }; });
  await p.click(".home-card button.did", { force: true }); await p.waitForTimeout(1500);
  await p.click(".did-ask .ok", { force: true }); await p.waitForTimeout(5800);
  const sheet = await p.innerText(".sheet-host").catch(() => "");
  check(/When is it\?/.test(sheet) && /Not set yet/.test(sheet), "a set-a-date card then asks \"When is it?\", with Not set yet");
  await p.fill(".sheet-host .when-date", day(-5)); await p.click(".sheet-host .btn-main"); await p.waitForTimeout(800);
  s = await store();
  check(s.days[day(0)].card.when === day(-5), "the date is kept on the card's day");
  check(!(await tops()).some((x) => /^Date night/.test(x)), "on the day it's drawn it stays today's card, never a top behind itself");
  st = await L((k) => window.__later.stack(k).map((x) => x.label), day(-1));
  check(st.includes("Date night"), "from the next day it waits behind today's card");

  // Your days offers Set the date for a recent set-a-date card with none.
  await load((d) => { d[day(4)].card = { id: 88, done: true }; });
  check(await L((k) => window.__later.canSetDate(k), day(4)) && !(await L((k) => window.__later.canSetDate(k), day(20))), "Set the date is offered for the last 2 weeks only");

  check(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
