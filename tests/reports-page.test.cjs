// The Reports tab on the tester page (social step 5): what friends reported, with Keep it, Remove the moment and
// Pause their sharing. Everything people typed goes on the page as text, never as code. Made-up data only.
// SHOTS=1 saves a picture.
const { chromium } = require("playwright");
const path = require("path");
const { serve, checker } = require("./helpers.cjs");
const X = '<img src=x onerror="window.__pwn=1">';
const now = Date.now();
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
const R = (o) => Object.assign({ id: "r" + Math.random().toString(36).slice(2, 8), why: "hurtful", note: "", at: now - 3600e3, state: "open", done: null, moment: "m1", still: true, held: false, paused: false, who: "sam.w", by: "mia.k", about: 1, snap: {}, photo: null }, o);
(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 430, height: 932 } }), errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const acts = [];
  let data = { ok: true, open: [
    R({ id: "a1", why: "hurtful", note: X, snap: { kind: "photo", ph: true, cap: X, mood: "low", feel: ["tired"] }, photo: PHOTO, held: true, about: 3 }),
    R({ id: "a2", why: "spam", moment: null, still: false, snap: { profile: { name: X, season: "Buy followers here" } } }),
    R({ id: "a3", why: "risk", snap: { kind: "card", text: "Text an old friend", cap: "nobody would care" }, still: false }),
  ], done: [R({ id: "d1", state: "removed", done: now - 864e5, snap: { cap: "Old one" } })] };
  await p.route("https://intentionally-push.lextdo.workers.dev/**", async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.pathname === "/t/reports") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data), headers: { "access-control-allow-origin": "*" } });
    if (u.pathname === "/t/report") { const body = JSON.parse(req.postData()); acts.push(body); data = { ...data, open: data.open.filter((x) => x.id !== body.id) }; return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }); }
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"wait":[],"done":[],"cards":[]}', headers: { "access-control-allow-origin": "*" } });
  });
  await p.goto(server.url + "testers.html"); await p.waitForFunction(() => window.__render);
  await p.evaluate((now) => window.__render({ at: now, testers: [], days: [], events: [] }), now);
  await p.waitForTimeout(800);
  check(/No testers yet/.test(await p.textContent("#out")) && /Reports waiting for you/.test(await p.textContent("#out")) && (await p.$$("#repq .lcard")).length === 3, "reports show even before there are any testers");
  await p.evaluate((now) => window.__render({ at: now, testers: [{ code: "T-GOOD", joined: now - 5 * 864e5, seen: now, phone: "iPhone", version: "d1", started: null, nudges: "{}" }], days: [], events: [] }), now);
  await p.waitForTimeout(800);
  await p.click('.ttabs [data-tab="reports"]'); await p.waitForTimeout(300);
  check(/Reports \(3\)/.test(await p.textContent('.ttabs [data-tab="reports"]')), "the Reports tab says how many are waiting");
  const txt = await p.textContent("#repq");
  check(/Hurtful, bullying or hateful/.test(txt) && /reported by @mia\.k/.test(txt) && /A moment by @sam\.w · 3 reports about them/.test(txt) && /held back from feeds/.test(txt), "each report: why, who reported it, who it's about, and if it's held back");
  check(!!(await p.$("#repq img[src^='data:image/jpeg']")), "a reported photo shows (a copy, even if they deleted it)");
  check(/The account @sam\.w/.test(txt) && /Buy followers here/.test(txt), "a report about a person shows their profile words");
  check(/they've since removed it/.test(txt) && !(await p.$$eval("#repq .lcard", (els) => els[2].querySelector(".remove"))), "a moment they removed says so, with no Remove button");
  check(!(await p.evaluate(() => window.__pwn)) && /onerror/.test(txt), "words people typed show as text, never run as code");
  if (process.env.SHOTS) await p.screenshot({ path: path.join(__dirname, "..", "..", "reports-tab.png"), fullPage: true });
  await p.click("#repq .lcard .remove"); await p.waitForTimeout(600);
  check(acts[0] && acts[0].id === "a1" && acts[0].act === "remove", "Remove the moment sends that answer");
  await p.click("#repq .lcard .pause"); await p.waitForTimeout(600);
  check(acts[1] && acts[1].id === "a2" && acts[1].act === "pause", "Pause their sharing sends that answer");
  await p.click("#repq .lcard .keep"); await p.waitForTimeout(600);
  check(acts[2] && acts[2].act === "keep" && /Nothing waiting/.test(await p.textContent("#repq")), "Keep it, and then nothing is waiting");
  check(/Answered lately/.test(await p.textContent("#repq")) && /Removed/.test(await p.textContent("#repq .items.done")), "answered reports are listed underneath");
  check(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
