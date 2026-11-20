// Every live card fits the card in every place it shows, at alex's phone size (430 x 932), with nothing cut off, stretched
// or scrolling (alex 2026-11-20): the three in the hand (step at 13), the kept card (with "Back again" too), and the
// card on home (face up, with "I did it", and done). Inter stands in for the iPhone's font; it's a touch wider, so this errs safe.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 430, height: 932 } });
  await p.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.abort());
  await p.goto(server.url + "v2/");
  await p.evaluate(() => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: "2026-11-10", days: {}, seen: { note: "x" }, tester: { on: true, consent: 99 } })));
  await p.reload(); await p.waitForTimeout(800);
  const bad = await p.evaluate(async () => {
    const st = document.createElement("style"); st.textContent = "body, button { font-family: Inter, sans-serif !important } * { animation: none !important; transition: none !important }"; document.head.append(st);
    document.documentElement.style.setProperty("--k", (430 / 320).toFixed(3));
    const { LIVE } = await import("./js/cards-data.js"), draw = await import("./js/draw.js"); await document.fonts.ready;
    const w = document.createElement("div"); w.style.cssText = "position:absolute;left:0;top:0;width:430px"; document.body.append(w);
    const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const out = [];
    for (const r of LIVE) {
      const id = r[0], why = [];
      const stage = document.createElement("div"); stage.className = "stage"; w.replaceChildren(stage);
      let el = draw.cardEl(id); el.classList.add("hc", "up"); stage.append(el);
      let f = el.querySelector(".front"); if (f.scrollHeight > f.clientHeight + 1) why.push("cut off in the hand");
      const th = f.querySelector(".thumbs"), task = f.querySelector(".task");
      if (th && th.getBoundingClientRect().top < task.getBoundingClientRect().bottom - 1) why.push("thumbs cover the step");
      const holder = document.createElement("div"); holder.className = "big-holder"; w.replaceChildren(holder);
      el = draw.cardEl(id, { big: true, tag: "div" }); el.classList.add("up"); holder.append(el); f = el.querySelector(".front");
      const again = document.createElement("span"); again.className = "again"; again.textContent = "Back again · done 3 times"; f.querySelector(".task").after(again);
      if (f.scrollHeight > f.clientHeight + 1) why.push("kept card scrolls");
      for (const state of ["up", "done"]) {
        w.replaceChildren(); const lift = draw.homeCard(id, { state, felt: ["Enjoyed it", "Calmer"], onCam: () => {}, onDid: () => {} }); w.append(lift); await raf();
        if (lift.querySelector(".home-card").style.height) why.push(`home card stretches (${state})`);
      }
      if (why.length) out.push(`#${id} ${r[4]}: ${why.join(", ")}`);
    }
    return { out, n: LIVE.length };
  });
  check(bad.out.length === 0, `all ${bad.n} live cards fit` + (bad.out.length ? `\n  ${bad.out.join("\n  ")}` : ""));
  await b.close(); server.close(); done();
})();
