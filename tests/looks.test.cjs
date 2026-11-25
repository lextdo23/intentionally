// Card looks (alex 2026-11-25): what's kept, not how it looks. Ranks and how many cards each needs; one card of the
// look you're collecting per box (backs you don't have first, then repeats);
// the last card opens the look; a look in use goes on today's card with a different back
// each day; the shelf's Use and Collect; and someone already part-way into Chrome carries on unasked.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 430, height: 932 } }), p = await ctx.newPage(), errors = [];
  await ctx.addInitScript(() => { if (!localStorage.getItem("daydeck-account")) localStorage.setItem("daydeck-account", '{"skip":1}'); });
  p.on("pageerror", (e) => errors.push(e.message));
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.abort());
  await p.goto(server.url);
  const run = (fn, arg) => p.evaluate(fn, arg);

  // The ranks.
  const ranks = await run(async () => { const L = await import("./js/looks.js"); return L.LOOKS.map((x) => [x.id, L.rankName(x), L.need(x), x.backs]); });
  const R = Object.fromEntries(ranks.map(([id, r, n, bk]) => [id, { r, n, bk }]));
  check(R.cherry.r === "Open edition" && R.cherry.n === 3 && R.mono.n === 3, "Open edition looks need 3 cards");
  check(R.matcha.r === "Special edition" && R.matcha.n === 4, "Special edition needs 4");
  check(R.mushroom.n === 5 && R.pals.n === 5 && R.pals.r === "Rare edition", "Rare edition needs 5");
  check(R.chrome.r === "Masterpiece" && R.chrome.n === 8 && R.chrome.bk === 5, "Chrome is the Masterpiece: 8 cards, 5 backs");

  const fresh = (extra) => run((extra) => { localStorage.setItem("daydeck", JSON.stringify(Object.assign({ v: 1, started: "2026-11-10", seen: { note: "sleep", testInvite: 1 }, pillars: [{ name: "Rest", mindsets: [] }] }, extra))); }, extra);

  // Nothing picked: the picker is needed, and no look card would come.
  await fresh({}); await p.reload(); await p.waitForTimeout(500);
  check(await run(async () => (await import("./js/looks.js")).needsPick()), "with nothing picked, the box asks first");
  // Someone already part-way into Chrome (from before looks could be picked) carries on with it, unasked.
  await fresh({ boxes: { sets: { chrome: [1, 3] } } }); await p.reload(); await p.waitForTimeout(500);
  check(await run(async () => { const L = await import("./js/looks.js"); return !L.needsPick() && L.wantLook().id === "chrome"; }), "a started Chrome carries on without asking");

  // Collecting Cherry bow (1 back, 3 cards): one spot per card, the back repeats, and it opens on the third.
  await fresh({ boxes: { sets: {}, want: "cherry" } }); await p.reload(); await p.waitForTimeout(500);
  const ch = await run(async () => {
    const L = await import("./js/looks.js"), st = (await import("./js/store.js")).get(), c = L.byId("cherry"), out = [];
    for (let n = 0; n < 3; n++) { (st.boxes.sets.cherry = st.boxes.sets.cherry || []).push(L.nextBack(c)); out.push([L.got(c), L.isOpen(c)]); }
    const hand = L.handEl(c); return { out, spots: hand.querySelectorAll(".lk-spot").length, empty: hand.querySelectorAll(".lk-spot.empty").length, sets: st.boxes.sets.cherry };
  });
  check(ch.sets.join() === "0,0,0", "Cherry bow's one back comes three times");
  check(ch.out[1][1] === false && ch.out[2][1] === true, "it opens on the third card, not before");
  check(ch.spots === 3 && ch.empty === 0, "its hand has one spot per card (3), all filled");

  // Chrome (5 backs, 8 cards): the first five are all different, then repeats.
  const cr = await run(async () => {
    const L = await import("./js/looks.js"), st = (await import("./js/store.js")).get(), c = L.byId("chrome");
    st.boxes = { sets: {}, want: "chrome" };
    for (let n = 0; n < 8; n++) (st.boxes.sets.chrome = st.boxes.sets.chrome || []).push(L.nextBack(c));
    return st.boxes.sets.chrome;
  });
  check(new Set(cr.slice(0, 5)).size === 5 && cr.length === 8, `Chrome's first five cards are all different backs, then repeats (${cr.join(",")})`);

  // Picking on the shelf, using a look, and a different back each day.
  await fresh({ boxes: { sets: { pals: [0, 1, 2, 3, 4] }, want: "matcha" } }); await p.reload(); await p.waitForTimeout(500);
  const shelf = await run(async () => {
    const L = await import("./js/looks.js"), st = (await import("./js/store.js")).get();
    const host = document.createElement("div"); const draw = () => host.replaceChildren(...L.shelf(draw)); draw(); document.body.append(host);
    const btns = () => [...host.querySelectorAll(".lk-btn")];
    const sizes = new Set(btns().map((b) => Math.round(b.getBoundingClientRect().width)));
    btns().find((b) => b.textContent === "Use" && b.closest(".lk-srow").textContent.includes("Pals")).click();
    const used = st.look;
    btns().find((b) => b.textContent === "Collect" && b.closest(".lk-srow").textContent.includes("Mushroom")).click();
    const want = st.boxes.want, pals = L.byId("pals");
    const days = ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"].map((k) => L.todayBack(pals, k));
    host.remove();
    return { sizes: [...sizes], used, want, days, inUse: L.inUse() && L.inUse().id };
  });
  check(shelf.sizes.length === 1, `every shelf button is the same size (${shelf.sizes.join(", ")})`);
  check(shelf.used === "pals" && shelf.inUse === "pals", "Use puts Pals on today's card");
  check(shelf.want === "mushroom", "Collect switches which look you're collecting");
  check(shelf.days.every((d, i) => i === 0 || d !== shelf.days[i - 1]), `a different Pals back each day, never the same two days running (${shelf.days.join(",")})`);
  check(await run(async () => { const st = (await import("./js/store.js")).get(); st.look = "matcha"; return (await import("./js/looks.js")).inUse(); }) === null, "a look that isn't open yet can't be used");

  // Today's card in a look.
  await fresh({ look: "pals", boxes: { sets: { pals: [0, 1, 2, 3, 4] } } }); await p.reload(); await p.waitForTimeout(900);
  const home = await run(() => { const c = document.querySelector(".home-card"); return c ? { lk: c.classList.contains("lk"), img: !!c.querySelector(".back .lk-back img"), cc: c.style.getPropertyValue("--cc") } : null; });
  check(home && home.lk && home.img, "today's card shows the Pals back");
  check(home && /\d+ \d+ \d+/.test(home.cc) && home.cc !== "255 165 31", `the light behind it takes the look's colour (${home && home.cc})`);

  check(errors.length === 0, "no page errors" + (errors.length ? `: ${errors.join(" | ")}` : ""));
  await b.close(); server.close(); done();
})();
