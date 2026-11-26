// Share with your doctor (js/doctor.js, js/pdf.js; alex 2026-11-23): what the summary says, that the PDF is a
// well-formed file, that private things stay out, and the button and sheet at the bottom of Your days.
// SHOTS=1 saves the sheet and the PDF (doctor-summary.pdf). Made-up data only.
const fs = require("fs");
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// A PDF's text pieces, and whether its cross-reference table points at every object.
function readPdf(bytes) {
  const s = Buffer.from(bytes).toString("latin1");
  const xrefAt = Number(/startxref\n(\d+)/.exec(s)[1]);
  const offs = s.slice(xrefAt).split("\n").slice(3).filter((l) => / 00000 n $/.test(l)).map((l) => Number(l.slice(0, 10)));
  const okXref = s.slice(xrefAt, xrefAt + 4) === "xref" && offs.every((o, i) => s.startsWith(`${i + 1} 0 obj`, o));
  const text = [...s.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1].replace(/\\(.)/g, "$1")).join("\n");
  const pages = (s.match(/\/Type \/Page /g) || []).length;
  return { s, okXref, text, pages };
}

(async () => {
  const server = await serve(), { check, done } = checker(), shots = !!process.env.SHOTS;
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage(), errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(server.url);

  // 28 days ending yesterday: a low patch of 4 days, night notes, health notes, deck cards and one own card.
  const D = Array.from({ length: 40 }, (_, i) => day(i));
  const state = await p.evaluate(async ([D]) => {
    const { BANK } = await import("./js/cards-data.js");
    const ids = BANK.filter((r) => r[1] === "Move").slice(0, 6).map((r) => r[0]);
    const days = {};
    const moods = [3, 3, 4, 2, 1, 0, 2, 3, null, 4, 5, 3, 3, 4, 3, null, 3, 4, 5, 4, 3, 3, 4, 4, 5, 6, 4, 3];   // oldest first
    moods.forEach((m, i) => {
      const k = D[28 - i], d = (days[k] = {});
      if (m != null) { d.mood = m; d.feel = i % 3 ? ["tired", "anxious"] : ["calm"]; }
      if (i !== 8) d.sleep = { bed: 23 * 60 + (i % 3) * 30, wake: 7 * 60 + (i % 2) * 40, rested: i % 4 === 0 ? 4 : 2, tags: i < 7 ? ["Mind wouldn't switch off", "Had a few drinks"] : [] };
    });
    days[D[20]].feel = ["tired", "my own feeling"];
    for (let i = 0; i < 6; i++) days[D[27 - i * 4]].card = { id: ids[i], felt: i % 2 ? ["Calmer"] : ["Hard"], how: 3, done: true };
    days[D[3]].made = ["o1"]; days[D[2]].rest = true;
    // Some days before, for "the 4 weeks before".
    for (let i = 29; i < 40; i++) days[D[i]] = { mood: 2 };
    return { v: 1, started: D[39], days, seen: { note: "sleep", testInvite: 1, notifCard: 1 }, levels: { keepAll: true }, own: [{ id: "o1", day: D[3], pillar: "Move", text: "SECRET OWN CARD", felt: ["Enjoyed it"], deck: false }],
      pillars: [{ name: "Move", mindsets: [] }] };
  }, [D]);
  await p.evaluate((s) => { localStorage.setItem("daydeck", JSON.stringify(s)); localStorage.setItem("daydeck-account", JSON.stringify({ skip: 1 })); }, state);
  await p.goto(server.url); await p.waitForTimeout(900);

  // What the summary says.
  const S = await p.evaluate(async ([from, to]) => {
    const doc = await import("./js/doctor.js"), store = await import("./js/store.js");
    const S = doc.summarise(store.get().days, from, to, { name: "Mia", talk: "Sleep has been hard" });
    return { evenings: S.evenings, mornings: S.mornings, days: S.keys.length, lowRun: S.lowRun, weeks: S.weeks.length, night: S.nightRows, health: S.healthRows,
      feelOwn: S.feelOwn, top: S.feelings[0], acts: S.acts, own: S.ownActs, recent: S.recent.map((r) => r.text), rest: S.restDays, before: S.before, sleep: S.sleep,
      lastDay: doc.lastDay(store.get().days), start: doc.startDay({}, to), startMade: doc.startDay({ made: from }, to) };
  }, [D[28], D[1]]);
  check(S.days === 28 && S.evenings === 26 && S.mornings === 27, "counts the days, evenings and mornings noted");
  check(S.lowRun && S.lowRun.n === 4 && S.lowRun.from === D[25] && S.lowRun.to === D[22], "longest run of Low or below: 4 days, with its dates");
  const mind = S.night.find((r) => r.tag === "Mind wouldn't switch off");
  check(mind && mind.total === 7 && mind.weeks.reduce((a, b) => a + b, 0) === 7, "night notes counted week by week");
  check(S.health.some((r) => r.tag === "Had a few drinks") && !S.night.some((r) => r.tag === "Had a few drinks"), "drinks are a health note, not a night note");
  check(S.feelOwn === 1 && S.top[0] === "tired", "feelings: list words counted, own words only counted");
  check(S.acts === 7 && S.own === 1 && !S.recent.includes("SECRET OWN CARD") && S.recent.length === 6, "own cards are counted, never named");
  check(S.rest === 1, "rest days counted");
  check(S.before && S.before.m === 2, "the 4 weeks before: mostly Low");
  check(S.sleep && S.sleep.n === 27 && S.sleep.mins >= 7 * 60, "sleep: usual time in bed");
  check(S.lastDay === D[1], "covers up to yesterday when today's evening isn't done");
  check(S.start === D[28], "first time: the last 4 weeks");
  check(S.startMade === D[28], "after a summary: starts from the day it was made");

  // The PDF: well formed, says what it should, keeps out what it shouldn't.
  const pdfs = await p.evaluate(async ([from, to]) => {
    const doc = await import("./js/doctor.js"), store = await import("./js/store.js"), days = store.get().days;
    const off = doc.drawSummary(doc.summarise(days, from, to, { name: "Mia", talk: "Sleep has been hard (exams)" }));
    const on = doc.drawSummary(doc.summarise(days, from, to, { parts: { mood: true, sleep: true, acts: true, health: true } }));
    const moodOnly = doc.drawSummary(doc.summarise(days, from, to, { parts: { mood: true, sleep: false, acts: false, health: false } }));
    const long = doc.drawSummary(doc.summarise(days, doc.clampFrom("2000-01-01", to), to, {}));
    return [off, on, moodOnly, long].map((x) => Array.from(x));
  }, [D[28], D[1]]);
  const [off, on, moodOnly, long] = pdfs.map(readPdf);
  check(off.s.startsWith("%PDF-1.4") && off.s.trimEnd().endsWith("%%EOF") && off.okXref, "a well-formed PDF");
  check(off.pages === 3, "three pages with everything on");
  check(/Summary of Mia's days/.test(off.text) && /For the clinician reading this/.test(off.text) && /Daydeck doesn't monitor for risk/.test(off.text), "title and the note for the clinician");
  check(/What Mia would like to talk about/.test(off.text) && /Sleep has been hard \(exams\)/.test(off.text), "what they'd like to talk about, brackets kept");
  check(/Longest run of Low or below: 4 days in a row/.test(off.text), "at a glance: the low run");
  check(/Night notes, week by week/.test(off.text) && /Mind wouldn't switch off/.test(off.text), "night notes table");
  check(!/Had a few drinks/.test(off.text) && /Had a few drinks/.test(on.text), "health notes only when switched on");
  check(!/SECRET OWN CARD/.test(off.text) && !/my own feeling/.test(off.text), "never their own typed card or feeling words");
  check(/Summary of days recorded in Daydeck/.test(on.text) && !/Mia/.test(on.text), "no name unless they add one");
  check(!/Sleep/.test(moodOnly.text.replace(/Sleep has been hard/g, "")) && !/Activities/.test(moodOnly.text) && moodOnly.pages === 2, "parts switched off are left out");
  check(long.okXref && /84 days/.test(long.text), "a long stretch is capped at 12 weeks and still draws");
  if (shots) fs.writeFileSync("doctor-summary.pdf", Buffer.from(pdfs[0]));

  // The button at the bottom of Your days, and the sheet.
  await p.evaluate(() => {
    window.__shared = null;
    navigator.canShare = () => true;
    navigator.share = async (d) => { window.__shared = { name: d.files[0].name, type: d.files[0].type, size: d.files[0].size }; };
  });
  await p.evaluate(async () => (await import("./js/days.js")).openDays(document.body, () => {}));
  await p.waitForTimeout(900);
  const last = await p.evaluate(() => { const s = document.querySelector(".sections"); return s.lastElementChild.className; });
  check(last === "doc-btn", "the button is the last thing in Your days");
  await p.locator(".doc-btn").click(); await p.waitForTimeout(500);
  check(await p.locator(".sheet h2", { hasText: "Share with your doctor" }).count() === 1, "opens the sheet");
  const sw = await p.locator(".sheet .switch").evaluateAll((els) => els.map((e) => e.getAttribute("aria-checked")));
  check(sw.join() === "true,true,true,false", "health notes start off");
  check(/28 days · 26 evenings and 27 mornings noted/.test(await p.locator(".sheet .doc-row").first().textContent()), "shows how much the summary covers");
  if (shots) await p.screenshot({ path: "doctor-sheet.png" });
  await p.locator(".sheet .doc-field").first().fill("Mia");
  await p.locator(".sheet .btn-main").click(); await p.waitForTimeout(600);
  const shared = await p.evaluate(() => window.__shared);
  check(shared && shared.type === "application/pdf" && /^Daydeck summary .+\.pdf$/.test(shared.name) && shared.size > 3000, "hands a PDF to the share sheet");
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("daydeck")).doc);
  check(saved && saved.made && saved.name === "Mia" && saved.parts.health === false, "remembers the day, the name and the parts for next time");
  check(!JSON.stringify(saved).includes("talk"), "things to talk about are never kept");

  // Every part off: the button says why and does nothing.
  await p.locator(".sheet .switch").evaluateAll((els) => els.forEach((e) => e.getAttribute("aria-checked") === "true" && e.click()));
  check(await p.locator(".sheet .btn-main").getAttribute("aria-disabled") === "true" && /Switch on at least one part/.test(await p.locator(".doc-why").textContent()), "nothing switched on: says so");
  check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join("; ") : ""));
  await b.close(); server.close(); done();
})();
