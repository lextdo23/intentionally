// Nothing slides under the bottom pill (alex 2026-11-24): when Today is crowded (a level-up moment, boxes waiting and
// the recap line at once), the card shrinks just enough to fit; an ordinary day keeps the full-size card. Made-up data.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const errors = [];
  // Crowded: boxes waiting, the recap line and a moment's words ("Card's done.") on a shorter phone.
  const open = async (crowded) => {
    const ctx = await b.newContext({ viewport: { width: 430, height: crowded ? 800 : 932 }, hasTouch: true, serviceWorkers: "block" });
    await ctx.addInitScript(() => { localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); });
    await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
    const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
    const t = new Date(); t.setHours(15, 10, 0, 0); await p.clock.setFixedTime(t);
    await p.goto(server.url);
    await p.evaluate(async (crowded) => {
      const { makeSample } = await import("./js/sample.js"); const L = await import("./js/levels.js");
      const days = makeSample(crowded ? 90 : 6);
      const d = new Date(); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days[k] = { sleep: { bed: 1380, wake: 405, rested: 3, tags: [] }, card: { id: 3, hands: [[3, 4, 5]], at: Date.now() - 7200e3, done: true, how: 3, felt: ["Enjoyed it"] } };
      const st = { v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "sleep" }, pillars: [{ name: "Rest", mindsets: [] }] };
      if (crowded) { let pts = 0; while (L.level(pts).level < 5) pts++; pts += 2; st.levels = { reset: 2, base: L.earned(st) - pts, seen: 5, tips: { days: 1, own: 1, friends: 1, library: 1, photos: 1, crumbs: 1 } }; }
      else st.levels = { reset: 2, base: 0, seen: 99, tips: { days: 1, own: 1, friends: 1, library: 1 }, early: 1 };
      localStorage.setItem("daydeck", JSON.stringify(st));
    }, crowded);
    await p.reload(); await p.waitForTimeout(2000);
    return { p, ctx };
  };
  const look = (p) => p.evaluate(() => {
    const H = document.getElementById("home"), pill = document.getElementById("pill");
    const floor = pill && getComputedStyle(pill).visibility !== "hidden" ? pill.getBoundingClientRect().top : H.getBoundingClientRect().bottom;
    const bottom = Math.max(...[...H.querySelectorAll(".home-mid > *, .undo-slot > *")].map((x) => x.getBoundingClientRect().bottom));
    return { fit: H.style.getPropertyValue("--fit"), clear: bottom <= floor + 0.5, moment: !!H.querySelector(".greet-words.moment") };
  });

  let { p, ctx } = await open(true);
  let L = await look(p);
  check(true, "the crowded case: boxes waiting and the recap line on a shorter phone");
  check(!!L.fit && +L.fit < 1, "on a crowded Today the card shrinks a little");
  check(L.clear, "and nothing under the card slides behind the pill");
  await ctx.close();

  ({ p, ctx } = await open(false));
  L = await look(p);
  check(!L.fit && L.clear, "an ordinary day keeps the full-size card, clear of the pill");
  await ctx.close();

  check(!errors.length, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
