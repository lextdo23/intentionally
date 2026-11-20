// Safety net (Content-Security-Policy): every Daydeck screen and the tester page work with it on, nothing they
// need is blocked, and a planted outside or inline script is refused. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const days = {}; for (let i = 1; i < 12; i++) days[day(i)] = { sleep: { bed: 1380, wake: 420, rested: 2, tags: ["Woke in the night"] }, mood: i % 7, feel: ["calm"], pil: ["Move"] };
const STATE = { v: 1, started: day(11), days, seen: { note: "x" }, pillars: [{ name: "Move", mindsets: [] }, { name: "Rest", mindsets: [] }, { name: "Friends", mindsets: [] }] };
const SCREENS = [
  ["home", null],
  ["morning check-in", "m.morning(() => {})", "./js/checkin.js"],
  ["evening check-in", "m.evening(() => {})", "./js/checkin.js"],
  ["card draw", "m.openDraw(() => {})", "./js/draw.js"],
  ["Your days", "m.openDays(document.body, () => {})", "./js/days.js"],
  ["Settings", "m.openSettings(() => {})", "./js/settings.js"],
  ["Going to sleep", "m.goToSleep(() => {})", "./js/sleep.js"],
  ["choosing pillars", "m.pickPillars(() => {})", "./js/pillars.js"],
];

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.addInitScript(() => { window.__csp = []; addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
    body: r.request().url().endsWith("/t/all") ? JSON.stringify({ at: Date.now(), testers: [{ code: "T-TEST", joined: Date.now() - 5 * 864e5, seen: Date.now(), phone: "iPhone iOS 26", version: "d29", started: day(5), nudges: "{}" }],
      days: [{ code: "T-TEST", day: day(1), data: JSON.stringify({ mood: 3, feel: ["calm"], sleep: { tags: [], own: 0 } }) }], events: [{ code: "T-TEST", t: Date.now(), name: "pm_done", val: '{"secs":30}' }] }) : '{"ok":true}' }));
  const p = await ctx.newPage(), errors = [];
  p.on("pageerror", (e) => errors.push(e.message));

  const csp = async () => p.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || "");
  await p.goto(server.url);
  check(/script-src 'self'(;|$)/.test(await csp()), "the app page has the safety net, allowing only its own scripts");
  await p.evaluate((s) => localStorage.setItem("daydeck", JSON.stringify(s)), STATE);
  for (const [name, call, mod] of SCREENS) {
    await p.goto(server.url); await p.waitForTimeout(700);
    if (call) await p.evaluate(async ([name, m]) => { const mm = await import(m), noop = () => {};
      ({ "morning check-in": () => mm.morning(noop), "evening check-in": () => mm.evening(noop), "card draw": () => mm.openDraw(noop), "Your days": () => mm.openDays(document.body, noop),
        "Settings": () => mm.openSettings(noop), "Going to sleep": () => mm.goToSleep(noop), "choosing pillars": () => mm.pickPillars(noop) })[name]();
    }, [name, mod]).catch((e) => errors.push(name + ": " + e.message));
    await p.waitForTimeout(700);
    const v = await p.evaluate(() => window.__csp);
    check(v.length === 0, `${name} works with nothing blocked` + (v.length ? ` (blocked: ${v.join(", ")})` : ""));
  }
  // A sleep sound still plays from the app's own files.
  await p.goto(server.url); await p.waitForTimeout(500);
  const audio = await p.evaluate(async () => { const a = new Audio("sounds/brown.mp3"); try { await a.play(); } catch {} await new Promise((r) => setTimeout(r, 300)); return window.__csp.length; });
  check(audio === 0, "sleep sounds aren't blocked");
  // Planted scripts are refused.
  const planted = await p.evaluate(async () => {
    window.__ran = 0;
    const out = document.createElement("script"); out.src = "https://example.com/evil.js"; document.head.append(out);
    const inl = document.createElement("script"); inl.textContent = "window.__ran = 1"; document.head.append(inl);
    const img = document.createElement("div"); img.innerHTML = '<img src="x" onerror="window.__ran = 2">'; document.body.append(img);
    await new Promise((r) => setTimeout(r, 500));
    return { ran: window.__ran, blocked: window.__csp.filter((x) => /script-src/.test(x)).length };
  });
  check(planted.ran === 0 && planted.blocked >= 2, `planted outside, inline and hidden scripts don't run (${planted.blocked} refused)`);

  // Tester page: logs in, shows everything, nothing blocked.
  await p.goto(server.url + "testers.html");
  check(/script-src 'self'(;|$)/.test(await csp()), "the tester page has the safety net too");
  await p.fill("#pw", "made-up-password-for-testing"); await p.click("button.main"); await p.waitForTimeout(800);
  const t = await p.evaluate(() => ({ sections: document.querySelectorAll("#out section").length, v: window.__csp }));
  check(t.sections > 10 && t.v.length === 0, `tester page logs in and shows every section with nothing blocked` + (t.v.length ? ` (blocked: ${t.v.join(", ")})` : ""));

  // The privacy page: the safety net, no scripts at all, every section shows, and Lifeline is on it.
  await p.goto(server.url + "privacy.html"); await p.waitForTimeout(300);
  check(/script-src 'self'(;|$)/.test(await csp()), "the privacy page has the safety net too");
  const pv = await p.evaluate(() => ({ scripts: document.scripts.length, sections: document.querySelectorAll("section").length, text: document.body.textContent }));
  check(pv.scripts === 0 && pv.sections >= 4 && /train AI/.test(pv.text) && !/Alex/.test(pv.text) && /13 11 14/.test(pv.text), "the privacy page has no scripts, every section shows, names nobody, and Lifeline is there");

  // Old /v2/ links and icons are sent on to Daydeck, keeping ?tester, with the safety net on.
  const went = []; const seen = (f) => f === p.mainFrame() && went.push(f.url()); p.on("framenavigated", seen);
  await p.goto(server.url + "v2/?tester"); await p.waitForTimeout(800); p.off("framenavigated", seen);
  check(went.includes(server.url + "?tester"), "an old /v2/ link is sent on to Daydeck, keeping ?tester");

  check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
