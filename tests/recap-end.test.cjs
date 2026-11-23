// The end of the weekly recap (alex 2026-11-23): "your week on a card" fills the whole screen on its own slide, then
// the next slide shares it (the picture as it will be shared, the switches, Share and Done). Walks a whole recap by
// tapping like a person would. SHOTS=1 saves both slides. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, reducedMotion: "reduce" });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(server.url);
  // Last week, Monday to Sunday, every day noted, with a few cards done.
  await p.evaluate(() => {
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const t = new Date(); t.setHours(12); const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7) - 7);
    const days = {}, ms = [4, 3, 5, 4, 6, 5, 4];
    for (let i = -14; i < 7; i++) { const d = new Date(mon); d.setDate(mon.getDate() + i); days[key(d)] = { mood: i >= 0 ? ms[i] : 4, sleep: { q: 3 }, card: i % 2 ? { id: 1 + (i & 7), did: 1, felt: ["Enjoyed it"] } : undefined }; }
    localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 }));
    localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "sleep" }, levels: { keepAll: true } }));
  });
  await p.reload(); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelectorAll(".tip-layer").forEach((x) => x.remove()));
  // A quick tap: press then click (a long press pauses instead of moving on).
  await p.evaluate(() => { window.tapAt = (fx) => { const st = document.querySelector(".wr-stage"), r = st.getBoundingClientRect(), o = { bubbles: true, clientX: r.left + r.width * fx, clientY: r.top + r.height / 2 };
    st.dispatchEvent(new PointerEvent("pointerdown", o)); st.dispatchEvent(new PointerEvent("pointerup", o)); st.dispatchEvent(new MouseEvent("click", o)); }; });
  const opened = await p.evaluate(async () => (await import("./js/wrapped.js")).testOpen(() => {}));
  check(opened, "last week's recap opens");
  await p.waitForTimeout(600);

  // Tap through like a person: guess a day, say "Not now" to next week, otherwise tap the right of the screen.
  const at = () => p.evaluate(() => {
    const s = [...document.querySelectorAll(".wr-scr.in")].pop();
    if (!s) return "closed";
    if (s.querySelector(".wr-pic6full")) return "poster";
    if (s.querySelector(".wr-pic6box")) return "share";
    return "other";
  });
  for (let k = 0; k < 20 && (await at()) === "other"; k++) {
    await p.evaluate(() => {
      const s = [...document.querySelectorAll(".wr-scr.in")].pop();
      const card = s.querySelector(".wr-cd:not(.fl)"), notNow = [...s.querySelectorAll("button")].find((x) => x.textContent === "Not now" && !x.disabled);
      if (card) card.click(); else if (notNow) notNow.click();
      else tapAt(0.8);
    });
    await p.waitForTimeout(2600);
  }
  check((await at()) === "poster", "after next week comes your week on a card");
  const full = await p.evaluate(() => {
    const c = document.querySelector(".wr-scr.in .wr-pic6full").getBoundingClientRect(), s = document.querySelector(".wr-stage").getBoundingClientRect();
    return { w: Math.round(c.width), h: Math.round(c.height), sw: Math.round(s.width), sh: Math.round(s.height), share: !!document.querySelector(".wr-scr.in .btn-main"), sw2: !!document.querySelector(".wr-scr.in .wr-sw") };
  });
  check(full.w === full.sw && full.h === full.sh, `the card fills the whole screen (${full.w} x ${full.h} of ${full.sw} x ${full.sh})`);
  check(!full.share && !full.sw2, "no Share button or switches on it");
  check(await p.evaluate(() => document.querySelector(".wr-scr.in .wr-next")?.textContent === "Next: share it"), "it says what's next: share it");
  if (process.env.SHOTS) await p.screenshot({ path: "recap-card.png" });

  await p.evaluate(() => tapAt(0.8));
  await p.waitForTimeout(1200);
  check((await at()) === "share", "a tap goes to the share slide");
  const sh = await p.evaluate(() => { const s = [...document.querySelectorAll(".wr-scr.in")].pop(); return { pic: !!s.querySelector(".wr-pic6"), share: [...s.querySelectorAll("button")].some((x) => x.textContent === "Share"), done: [...s.querySelectorAll("button")].some((x) => x.textContent === "Done"), moods: !!s.querySelector('[aria-label="Show moods when sharing"]') }; });
  check(sh.pic && sh.share && sh.done && sh.moods, "it has the picture as it will be shared, Show moods, Share and Done");
  if (process.env.SHOTS) await p.screenshot({ path: "recap-share.png" });

  await p.evaluate(() => tapAt(0.1));
  await p.waitForTimeout(1200);
  check((await at()) === "poster", "tapping the left of the share slide goes back to the card");
  await p.evaluate(() => tapAt(0.8));
  await p.waitForTimeout(1200);
  await p.evaluate(() => [...document.querySelectorAll(".wr-scr.in button")].find((x) => x.textContent === "Done").click());
  await p.waitForTimeout(800);
  check((await at()) === "closed", "Done closes the recap");
  const weeks = await p.evaluate(() => (JSON.parse(localStorage.getItem("daydeck")).wrap || {}).weeks?.length || 0);
  check(weeks === 1, "the week's card is kept in Your weeks");

  check(!errors.length, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
