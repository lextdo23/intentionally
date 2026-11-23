// Today's card on home has a gilded edge (alex 2026-11-23, option B): gold layers between the two faces, so turning it
// shows a thickness instead of going paper-thin. Checks the layers are there, the faces sit either side of them, and
// a face-up, face-down and done card all have it. SHOTS=1 saves pictures of the card turning. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");
const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, reducedMotion: "reduce" });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const open = async (today) => {
    const days = {}; for (let i = 1; i < 6; i++) days[day(i)] = { mood: 3, sleep: { q: 3 } };
    days[day(0)] = today;
    await p.goto(server.url);
    await p.evaluate((days) => { localStorage.clear(); localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "sleep" }, levels: { seen: 3, early: 1 } })); }, days);
    await p.reload(); await p.waitForTimeout(2500);
    await p.evaluate(() => document.querySelectorAll(".tip-layer").forEach((x) => x.remove()));
  };
  const look = () => p.evaluate(() => {
    const c = document.querySelector(".home-card"), edges = [...c.querySelectorAll(".in > .edge")];
    const z = (el) => new DOMMatrix(getComputedStyle(el).transform).m43;
    return { n: edges.length, min: Math.min(...edges.map(z)), max: Math.max(...edges.map(z)), back: z(c.querySelector(".back")),
      front: z(c.querySelector(".front")), gold: getComputedStyle(edges[0]).backgroundImage.includes("232, 150, 28"), hidden: edges.every((e) => e.getAttribute("aria-hidden") === "true") };
  });

  await open({ sleep: { q: 3 }, card: { id: 1 } });
  let L = await look();
  check(L.n === 13, `the face-up card has 13 edge layers (${L.n})`);
  check(Math.abs(L.min + 1.5) < 0.01 && Math.abs(L.max - 1.5) < 0.01, "the layers fill the 3 points between the faces");
  check(Math.abs(L.back - 1.5) < 0.01 && Math.abs(L.front + 1.5) < 0.01, "the back sits in front of them and the face behind, so it turns around its middle");
  check(L.gold, "the edge is marigold card stock (new look, alex 2026-11-23)");
  check(L.hidden, "screen readers skip the edge layers");
  const ok = await p.evaluate(() => { const r = document.querySelector(".home-card .front").getBoundingClientRect(); return r.width > 250 && r.height > 350; });
  check(ok, "face up, the card is still its full size on screen");
  if (process.env.SHOTS) for (const a of [180, 140, 110, 95]) {
    await p.evaluate((a) => { document.querySelector(".home-card .in").style.transform = `rotateY(${a}deg)`; }, a);
    await p.screenshot({ path: `card-edge-${a}.png` });
  }

  await open({ sleep: { q: 3 } });
  L = await look(); check(L.n === 13, "a face-down card has the edge too");
  await open({ sleep: { q: 3 }, card: { id: 1, did: 1 } });
  L = await look(); check(L.n === 13, "and so does a done card");

  check(!errors.length, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
