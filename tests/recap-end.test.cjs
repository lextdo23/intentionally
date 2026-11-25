// The end of the weekly recap (alex 2026-11-23): "your week on a card" fills the whole screen on its own slide, then
// the next slide shares it (the picture as it will be shared, Show moods, Show photos, Share, Share to profile, Done).
// Walks a whole recap by tapping like a person would, signed in with a photo that week, then again with no account
// and no photos. SHOTS=1 saves the slides. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, reducedMotion: "reduce" });
  // A pretend service: Friends set up (18+ ticked), and every share caught so we can look at it.
  const shares = [];
  const reply = (r, o) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o), headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => {
    const u = new URL(r.request().url());
    if (r.request().method() === "OPTIONS") return reply(r, {});
    if (u.pathname === "/a/f") return reply(r, { ok: true, me: { username: "alex", adult: 1 }, friends: [{ username: "sam" }], asksYou: [], asked: [] });
    if (u.pathname === "/a/f/share") { shares.push(JSON.parse(r.request().postData())); return reply(r, { ok: true, again: shares.length > 1, moment: {} }); }
    return reply(r, { ok: true });
  });
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(server.url);
  // Last week, Monday to Sunday, every day noted, with a few cards done.
  await p.evaluate(() => {
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const t = new Date(); t.setHours(12); const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7) - 7);
    const days = {}, ms = [4, 3, 5, 4, 6, 5, 4];
    for (let i = -14; i < 7; i++) { const d = new Date(mon); d.setDate(mon.getDate() + i); days[key(d)] = { mood: i >= 0 ? ms[i] : 4, sleep: { q: 3 }, card: i % 2 ? { id: 1 + (i & 7), did: 1, felt: ["Enjoyed it"] } : undefined }; }
    days[key(new Date(mon.getTime() + 2 * 864e5))].ph = { b: 1, v: 1 };
    localStorage.setItem("daydeck-account", JSON.stringify({ token: "made-up-token", user: { username: "alex" } }));
    localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "sleep" }, levels: { reset: 2, tips: { days: 1, friends: 1 } } }));
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
  const lay = await p.evaluate(() => {
    const s = [...document.querySelectorAll(".wr-scr.in")].pop(), box = (el) => el.getBoundingClientRect();
    const moods = s.querySelector('[aria-label="Show moods when sharing"]').closest(".wr-sw"), pics = s.querySelector('[aria-label="Show photos when sharing"]').closest(".wr-sw");
    const btn = (t) => [...s.querySelectorAll("button")].find((x) => x.textContent === t);
    const parts = [s.querySelector(".wr-pic6box"), moods, pics, btn("Share"), btn("Share to profile"), btn("Done")].map(box);
    const overlap = parts.some((a, i) => parts.some((b, j) => j > i && a.bottom > b.top + 1 && b.bottom > a.top + 1));
    return { overlap, bottom: Math.round(parts[5].bottom), picsOn: !s.querySelector('[aria-label="Show photos when sharing"]').disabled };
  });
  check(!lay.overlap, "the picture, both switches and the three buttons each have their own space (nothing on top of anything)");
  check(lay.bottom <= 898, `Done stays above the home bar (${lay.bottom})`);
  check(lay.picsOn, "with a photo that week, Show photos can be switched on");
  await p.evaluate(() => [...document.querySelectorAll(".wr-scr.in button")].find((x) => x.textContent === "Share to profile").click());
  await p.waitForTimeout(2500);
  const sent = shares[0] || {};
  check(sent.kind === "week" && sent.item === "week" && /^\d{4}-\d{2}-\d{2}$/.test(sent.day), "Share to profile sends the week's card");
  check(typeof sent.photo === "string" && sent.photo.startsWith("data:image/jpeg;base64,") && sent.photo.length < 440000, "as a small JPEG picture");
  check(await p.evaluate(() => [...document.querySelectorAll(".wr-scr.in button")].some((x) => x.textContent === "Shared to your profile")), "the button then says it's shared");

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

  // Again with no account and no photos: no Share to profile, and Show photos is greyed with a note.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("daydeck")); Object.values(s.days).forEach((d) => delete d.ph); delete s.wrap;
    localStorage.setItem("daydeck", JSON.stringify(s)); localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 }));
  });
  await p.reload(); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelectorAll(".tip-layer").forEach((x) => x.remove()));
  await p.evaluate(() => { window.tapAt = (fx) => { const st = document.querySelector(".wr-stage"), r = st.getBoundingClientRect(), o = { bubbles: true, clientX: r.left + r.width * fx, clientY: r.top + r.height / 2 };
    st.dispatchEvent(new PointerEvent("pointerdown", o)); st.dispatchEvent(new PointerEvent("pointerup", o)); st.dispatchEvent(new MouseEvent("click", o)); }; });
  await p.evaluate(async () => (await import("./js/wrapped.js")).testOpen(() => {}));
  await p.waitForTimeout(600);
  for (let k = 0; k < 24 && (await at()) !== "share"; k++) {
    await p.evaluate(() => {
      const s = [...document.querySelectorAll(".wr-scr.in")].pop();
      const card = s.querySelector(".wr-cd:not(.fl)"), notNow = [...s.querySelectorAll("button")].find((x) => x.textContent === "Not now" && !x.disabled);
      if (card) card.click(); else if (notNow) notNow.click(); else tapAt(0.8);
    });
    await p.waitForTimeout(2600);
  }
  const plain = await p.evaluate(() => { const s = [...document.querySelectorAll(".wr-scr.in")].pop(); return { prof: [...s.querySelectorAll("button")].some((x) => x.textContent === "Share to profile"), off: s.querySelector('[aria-label="Show photos when sharing"]').disabled, note: s.textContent.includes("No photos this week") }; });
  check(!plain.prof, "without an account there's no Share to profile");
  check(plain.off && plain.note, "with no photos that week, Show photos is greyed and says No photos this week");
  if (process.env.SHOTS) await p.screenshot({ path: "recap-share-plain.png" });

  check(!errors.length, "no errors on the page" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
