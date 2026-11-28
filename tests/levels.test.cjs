// Levels and what they open (alex 2026-11-25, thread "Rework levels and what unlocks when"): level 1 takes 6 points so a
// full first day reaches level 2 as it ends; nobody already past level 1 goes down; Your days 2, weekly
// recap 4, Cards 5, own card 6; a friend's invite link opens Friends at once; Your levels names every level with what it
// opens; Crumbs is offered after the third evening and the tester invite after the second. Made-up data only.
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
    const store = await import("./js/store.js"), L = await import("./js/levels.js"), path = await import("./js/path.js");
    const crumbs = await import("./js/crumbs.js"), tester = await import("./js/tester.js");
    const o = {};
    o.l1 = [L.level(5).level, L.level(6).level, L.level(13).level];
    o.map = L.UNLOCKS.map((u) => `${u.level}:${u.id}`).join(" ");
    // Someone from before, at level 3 under the old curve (11 points needed): stays at level 3.
    const s = store.get(); s.days = {}; s.levels = { reset: 2, base: -12, seen: 3 }; delete s.levels.l1;
    o.before = L.level(L.total()).level; L.sixToStart(); o.after = L.level(L.total()).level; o.l1give = s.levels.l1;
    L.sixToStart(); o.again = s.levels.l1;
    // Someone new still on level 1 takes the new 6.
    s.levels = { reset: 2, base: 0, seen: 1 }; L.sixToStart(); o.newGive = s.levels.l1;
    // A friend's invite link: Friends opens at level 1, and stays open.
    s.levels = { reset: 2, base: 0, seen: 1, l1: 0 };
    o.friendsBefore = L.isOpen("friends"); L.openInvited(); o.friendsAfter = L.isOpen("friends"); o.daysStill = L.isOpen("days");
    s.test = { strict: true }; o.friendsStrict = L.isOpen("friends"); s.test = {};
    // Your levels: every level named, each with what it opens, the recap's first Sunday, no "Always open" line.
    s.started = "2026-11-25"; s.wrap = { seen: {} };
    o.first = L.firstRecap();
    o.steps = path.steps(1).map((x) => x.name);
    // Evenings: Crumbs waits for 3, the tester invite for 2.
    const eve = (n) => { s.days = {}; for (let i = 0; i < n; i++) s.days["2026-11-2" + i] = { mood: 3 }; };
    s.notes = {}; s.seen = {}; s.tester = {}; s.test = { on: false };
    eve(2); o.crumbs2 = crumbs.offerOK(); o.invite1 = (eve(1), tester.inviteDue()); o.invite2 = (eve(2), tester.inviteDue());
    eve(3); o.crumbs3 = crumbs.offerOK();
    return o;
  });
  check(r.l1.join() === "1,2,3", "level 1 takes 6 points: 5 is still level 1, 6 is level 2, a second full day (13) is level 3");
  check(r.map === "2:days 4:recap 5:library 6:own", "Your days 2, weekly recap 4, Cards 5, own card 6 (Friends is no longer a level)");
  check(r.before === 2 && r.after === 3 && r.l1give === 2 && r.again === 2, "someone already past level 1 keeps their level (given the 2 points back, once)");
  check(r.newGive === 0, "someone still on level 1 takes the new 6");
  check(r.friendsBefore && r.friendsAfter && r.friendsStrict && !r.daysStill, "Friends is open at level 1 for everyone (even with Dev tools' Real levels), and nothing else is");
  check(r.first === "Sunday 6 Dec", "the weekly recap's first Sunday is the first from day 7 (" + r.first + ")");
  check(r.steps.join("|") === "Your daily card|Your days|Weekly recap|Cards and Looks shelf|Make your own card|Something new", "Your levels names every level");
  check(!r.crumbs2 && r.crumbs3, "Crumbs is offered after the third evening, not before");
  check(!r.invite1 && r.invite2, "the tester invite waits for the second evening");

  // The page itself: every step has its line, the recap says when, no "Always open" line.
  await p.evaluate(async () => {
    const store = await import("./js/store.js"); const s = store.get();
    s.started = "2026-11-25"; s.wrap = { seen: {} }; s.levels = { reset: 2, base: 0, seen: 1, l1: 0 }; store.save();
    (await import("./js/path.js")).openLevels(() => {});
  });
  await p.waitForTimeout(600);
  const page = await p.evaluate(() => ({ lines: document.querySelectorAll(".lp-step:not(.hide) .lp-d").length, steps: document.querySelectorAll(".lp-step:not(.hide)").length,
    text: document.getElementById("levels").textContent }));
  check(page.lines === page.steps, "every level on the page says what it opens, even ones not open yet");
  check(/Your first one is Sunday 6 Dec/.test(page.text), "the weekly recap's step says when the first one comes");
  check(!/Always open/.test(page.text), "no \"Always open\" line");
  check(!errors.length, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
