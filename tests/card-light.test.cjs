// The light behind today's card (alex 2026-11-24, "eclipse corona"): warm light from behind the card while it waits to
// be done, gone once it's done. It moves exactly with the card's sway and only slides (so it stays smooth), and where
// it comes from and how deep its colour is follow the time of day. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const errors = [];
  const open = async (hour, today, opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, serviceWorkers: "block", ...opts });
    await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
    const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
    const t = new Date(); t.setHours(hour, 10, 0, 0); await p.clock.setFixedTime(t);
    const days = {}; for (let i = 1; i < 6; i++) days[day(i)] = { mood: 3, sleep: { q: 3 } };
    days[day(0)] = today;
    await p.goto(server.url);
    await p.evaluate((days) => { localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "sleep" }, levels: { seen: 3, early: 1 } })); }, days);
    await p.reload(); await p.waitForTimeout(2600);
    await p.evaluate(() => document.querySelectorAll(".tip-layer").forEach((x) => x.remove()));
    return { p, ctx };
  };
  const look = (p) => p.evaluate(() => {
    const c = document.querySelector(".home-card"), g = c && c.querySelector(".in > .glow");
    if (!g) return null;
    const a = g.getAnimations()[0], kf = a ? a.effect.getKeyframes() : [];
    const props = [...new Set(kf.flatMap((k) => Object.keys(k).filter((x) => !["offset", "computedOffset", "easing", "composite"].includes(x))))];
    const cs = getComputedStyle(c);
    return { todo: c.classList.contains("todo"), opacity: +getComputedStyle(g).opacity, anim: a && a.animationName, props,
      sameDelay: getComputedStyle(g).animationDelay === cs.animationDelay, sameLength: getComputedStyle(g).animationDuration === cs.animationDuration,
      cx: +c.style.getPropertyValue("--cx"), cc: c.style.getPropertyValue("--cc").split(" ").map(Number), hidden: g.getAttribute("aria-hidden") === "true" };
  });

  // Face up, card still to do, early afternoon.
  let { p, ctx } = await open(14, { sleep: { q: 3 }, card: { id: 1 } });
  let L = await look(p);
  check(L && L.todo && L.opacity === 1 && L.hidden, "while today's card waits, the light behind it shows (and screen readers skip it)");
  check(L && L.anim === "corona" && L.props.length === 1 && L.props[0] === "transform", "it moves by sliding only (nothing redrawn each frame), so it stays smooth");
  check(L && L.sameDelay && L.sameLength, "it moves exactly in step with the card's sway");
  await ctx.close();

  // Face down, before drawing.
  ({ p, ctx } = await open(9, { sleep: { q: 3 } }));
  L = await look(p);
  check(L && L.todo && L.opacity === 1, "face down before drawing, the light shows too");
  const morning = L;
  await ctx.close();

  // Evening: from the other side, a deeper colour.
  ({ p, ctx } = await open(19, { sleep: { q: 3 }, card: { id: 1 } }));
  const evening = await look(p);
  check(morning.cx < 0 && evening.cx > 0, "the light comes from the left in the morning and from the right in the evening");
  check(evening.cc[1] < morning.cc[1], "it turns a deeper orange as the day goes on");
  await ctx.close();

  // Done: quiet.
  ({ p, ctx } = await open(15, { sleep: { q: 3 }, card: { id: 1, done: true, how: 3, felt: ["Enjoyed it"] } }));
  await p.waitForTimeout(1600);
  L = await look(p);
  check(L && !L.todo && L.opacity === 0, "once the card is done, the light is gone and the card goes quiet");
  await ctx.close();

  // Reduce motion: the light stays still.
  ({ p, ctx } = await open(14, { sleep: { q: 3 }, card: { id: 1 } }, { reducedMotion: "reduce" }));
  L = await look(p);
  check(L && L.opacity === 1 && !L.anim, "with reduce motion on, the light shows but doesn't move");
  await ctx.close();

  check(!errors.length, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
