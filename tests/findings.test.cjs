// The morning notification's findings (js/findings.js, alex 2026-11-28) and its learned time (usualAM in js/notify.js).
// Each finding is specific but holds back its answer; after a hard day only comfort is said; it changes day to day;
// the time follows when they usually do the morning check-in. No browser needed. Made-up data only.
const path = require("path");
const { checker } = require("./helpers.cjs");

const key = (back) => { const d = new Date(2026, 10, 28 - back, 12); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const { check, done } = checker();
  const mem = {};
  globalThis.localStorage = { getItem: (k) => mem[k] || null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.window = globalThis; globalThis.navigator = { userAgent: "node" };
  globalThis.document = { addEventListener: () => {}, visibilityState: "hidden" };
  const F = await import(path.join(__dirname, "..", "js", "findings.js"));
  const N = await import(path.join(__dirname, "..", "js", "notify.js"));
  const util = await import(path.join(__dirname, "..", "js", "util.js"));
  const today = util.dayKey(new Date(2026, 10, 28, 12).getTime());

  // 24 days: lights out before 11:30 goes with good days.
  const days = {};
  for (let i = 1; i <= 24; i++) days[key(i)] = { mood: i % 2 ? 5 : 2, sleep: { bed: i % 2 ? 1350 : 60, wake: 420, rested: 2, tags: [] } };
  const s = { days, hidden: {}, finds: {} };
  const all = F.all(s, today);
  const bed = all.find((x) => x.id === "h:bed1130");
  check(!!bed, "a 'what seems to help you' line becomes a finding");
  check(bed && /\d+ of \d+/.test(bed.body), "the teaser has real numbers: " + (bed && bed.body));
  check(bed && !/11:30|lights out|bed/i.test(bed.title + bed.body), "the teaser holds back what it was");
  check(bed && /11:30/.test(bed.answer), "the answer names it: " + (bed && bed.answer));
  check(all.every((x) => !/streak|missed|you haven't|we miss/i.test(x.title + x.body + x.answer)), "never streaks, 'missed' or guilt");

  // Rotation: not the same one two days running when there's another.
  s.days[key(1)].mood = 5;   // yesterday was fine
  const one = F.pick(s, today);
  s.finds[util.addDays(today, -1)] = one && one.id;
  const two = F.pick(s, today);
  check(!two || !one || two.id !== one.id || F.all(s, today).length === 1, "a different finding from yesterday's when there's another");

  // After a hard day: comfort or nothing, never a plain fact.
  s.days[key(1)].mood = 1;
  const hard = F.pick(s, today);
  check(!hard || hard.comfort, "after a hard day only a comforting one (or plain words)");

  // forMorning settles it, so home shows the same one as the notification.
  s.days[key(1)].mood = 5; s.finds = {};
  const m = F.forMorning(today, s);
  check(m && s.finds[today] === m.id && F.today(s, today).answer === m.answer, "home shows the same finding the notification teased");

  // Learned morning time: about 10 minutes after the usual check-in, once there are 7 of them.
  const at = (back, hh, mm) => new Date(2026, 10, 28 - back, hh, mm).getTime();
  const t = {}; for (let i = 1; i <= 6; i++) t[key(i)] = { sleep: { at: at(i, 7, 30) } };
  const now = new Date(2026, 10, 28, 12).getTime();
  check(N.usualAM({ days: t }, now) === null, "fewer than 7 check-ins: their own set time");
  t[key(7)] = { sleep: { at: at(7, 7, 40) } };
  check(N.usualAM({ days: t }, now) === "07:40", "7 check-ins at about 7:30: the notification comes at 7:40 (" + N.usualAM({ days: t }, now) + ")");
  done();
})();
