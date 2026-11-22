// The numbers behind Your days. Everything here only reads what the person noted.
import { addDays, dayKey, keyDate, DAY_LETTER, MONTH, mostPicked, avg, isGood, sleepMins } from "./util.js";

// ---- Your moods: one line, Week / Month / Year ----
// Real calendar periods: a week runs Monday to Sunday, a month is its name, a year is its number.
// back = how many periods before this one (0 = this week / month / year). Days still to come stay empty.
export const MONTH_NAME = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const weekStart = (k) => addDays(k, -((keyDate(k).getDay() + 6) % 7));
function weekLabel(a, b, year) {
  const A = keyDate(a), B = keyDate(b), y = A.getFullYear() !== year || B.getFullYear() !== year;
  const left = A.getMonth() === B.getMonth() && !y ? `${A.getDate()}` : `${A.getDate()} ${MONTH[A.getMonth()]}${y ? " " + A.getFullYear() : ""}`;
  return `${left} – ${B.getDate()} ${MONTH[B.getMonth()]}${y ? " " + B.getFullYear() : ""}`;
}
export function moodSeries(days, view, back = 0) {
  const today = dayKey(), T = keyDate(today), year = T.getFullYear();
  const at = (k) => ({ m: k <= today && days[k] && days[k].mood != null ? days[k].mood : null, k: k <= today ? k : null });
  if (view === "year") {
    // One point per week (weeks starting Monday): the mood felt most that week. Weeks away stay a gap.
    const Y = year - back, pts = [], ticks = [];
    let w = weekStart(`${Y}-01-01`);
    if (keyDate(w).getFullYear() < Y) w = addDays(w, 7);
    for (; keyDate(w).getFullYear() === Y; w = addDays(w, 7)) {
      const ms = Array.from({ length: 7 }, (_, i) => at(addDays(w, i)).m).filter((m) => m != null);
      const d = keyDate(w);
      if (d.getDate() <= 7 && d.getMonth() % 3 === 0) ticks.push({ i: pts.length, l: MONTH[d.getMonth()] });
      pts.push({ m: ms.length ? mostPicked(ms) : null, k: null });
    }
    return { pts, ticks, n: pts.length, label: String(Y), when: back ? `in ${Y}` : "this year" };
  }
  if (view === "month") {
    const first = new Date(year, T.getMonth() - back, 1, 12), M = first.getMonth(), Y = first.getFullYear();
    const n = new Date(Y, M + 1, 0).getDate(), pts = [], ticks = [];
    for (let i = 0; i < n; i++) {
      pts.push(at(`${Y}-${String(M + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`));
      if (i % 7 === 0) ticks.push({ i, l: String(i + 1) });
    }
    return { pts, ticks, n, label: MONTH_NAME[M] + (Y !== year ? " " + Y : ""), when: back ? `in ${MONTH_NAME[M]}` : "this month" };
  }
  const a = addDays(weekStart(today), -7 * back), pts = [], ticks = [];
  for (let i = 0; i < 7; i++) { const k = addDays(a, i); pts.push(at(k)); ticks.push({ i, l: DAY_LETTER[keyDate(k).getDay()] }); }
  return { pts, ticks, n: 7, label: weekLabel(a, addDays(a, 6), year), when: back ? "that week" : "this week" };
}
// How far back the arrows can go: to the period holding the first day noted.
export function oldestBack(days, view) {
  const ks = Object.keys(days).filter((k) => days[k].mood != null).sort();
  if (!ks.length) return 0;
  const F = keyDate(ks[0]), T = keyDate(dayKey());
  if (view === "year") return T.getFullYear() - F.getFullYear();
  if (view === "month") return (T.getFullYear() - F.getFullYear()) * 12 + T.getMonth() - F.getMonth();
  return Math.round((keyDate(weekStart(dayKey())) - keyDate(weekStart(ks[0]))) / 864e5 / 7);
}
export function mostlyWord(days, view, back = 0) {
  const s = moodSeries(days, view, back);
  return mostPicked(s.pts.map((p) => p.m).filter((m) => m != null));
}

// ---- Mood and sleep: the one sleep rule (alex 2026-11-22) ----
// Every sleep line in Your days uses this, so the hours never disagree between cards.
// A night counts when it has both the morning's sleep and that day's evening mood. Real times only: a night of
// 2 hours or 13 hours is kept as noted (people can change a day if it's wrong).
// Nights go in whole-hour groups; the group(s) with the best AVERAGE mood win, so mostly-low weeks still show a
// pattern. A group needs 3 nights (2 in the early days), and the best group must be about one mood step above the
// lowest. Early days (fewer than 21 nights ever) name one group only, never a range.
export const SLEEP_READY = 21;            // research: sleep settles in about a week, mood in two, a link takes about three
export const SLEEP_WINDOW = 28;           // By hours and By date both show the last 4 weeks
const HOUR_GROUPS = [[0, 6], [6, 7], [7, 8], [8, 9], [9, 99]];
export function sleepPattern(days, today = dayKey()) {
  const all = Object.keys(days).filter((k) => k <= today && days[k].sleep && days[k].mood != null);
  const total = all.length, early = total < SLEEP_READY;
  const start = addDays(today, -(SLEEP_WINDOW - 1));
  const nights = Object.keys(days).filter((k) => k >= start && k <= today && days[k].sleep).sort()
    .map((k) => ({ k, h: sleepMins(days[k].sleep) / 60, m: days[k].mood != null ? days[k].mood : null }))
    .filter((n) => n.m != null || n.k === today);   // last night shows (as an outline) until today's mood is in
  const noted = nights.filter((n) => n.m != null).slice().sort((a, b) => a.h - b.h || (a.k < b.k ? -1 : 1));
  const need = early ? 2 : 3;
  const G = HOUR_GROUPS.map(([lo, hi]) => { const ms = noted.filter((n) => n.h >= lo && n.h < hi).map((n) => n.m); return { lo, hi, n: ms.length, av: ms.length ? avg(ms) : 0 }; });
  const ok = G.map((g, i) => i).filter((i) => G[i].n >= need);
  const hs = noted.map((n) => n.h), spread = hs.length ? Math.max(...hs) - Math.min(...hs) : 0;
  let kind = "none", b1 = -1, b2 = -1;
  if (noted.length < 3) kind = "empty";
  else if (spread < 1.25) kind = "steady";
  else if (ok.length >= 2) {
    const top = Math.max(...ok.map((i) => G[i].av)), low = Math.min(...ok.map((i) => G[i].av));
    if (top - low >= 0.8) {
      b1 = b2 = ok.find((i) => G[i].av === top);
      if (!early) {
        while (ok.includes(b1 - 1) && G[b1 - 1].av >= top - 0.5) b1--;
        while (ok.includes(b2 + 1) && G[b2 + 1].av >= top - 0.5) b2++;
      }
      kind = b2 === Math.max(...ok) ? "up" : b1 === 0 ? "down" : "range";
    }
  }
  const lo = b1 < 0 ? null : HOUR_GROUPS[b1][0], hi = b2 < 0 ? null : HOUR_GROUPS[b2][1];
  return { nights, noted, kind, lo, hi, total, early, left: Math.max(0, SLEEP_READY - total) };
}
// The pattern's hours in words: "7 hours or more", "7 to 9 hours", "under 7 hours".
export function sleepHours(p) {
  return p.kind === "up" ? `${p.lo} hours or more` : p.kind === "down" ? `under ${p.hi} hours` : p.kind === "range" ? `${p.lo} to ${p.hi} hours` : "";
}
export const inSleepBand = (p, h) => p.lo != null && h >= p.lo && h < p.hi;

// ---- Mood and what you did: one row per pillar ----
export const SOLID = 5;
export function pillarRows(days, colours) {
  const by = {};
  Object.values(days).forEach((d) => {
    if (d.mood == null) return;
    (d.rest ? ["Rest day"] : d.pil || []).forEach((p) => (by[p] = by[p] || []).push(d.mood));
  });
  const rows = Object.entries(by).map(([name, ms]) => ({ name, ms, n: ms.length, av: avg(ms), top: mostPicked(ms), lo: Math.min(...ms), hi: Math.max(...ms), col: colours[name] || null }))
    .sort((a, b) => b.av - a.av);
  const best = rows.find((r) => r.n >= SOLID && r.name !== "Rest day" && isGood(r.top));
  return { rows, best };
}

// ---- What seems to help you ----
// Compare days with something vs days without it. Only things the person controls, only better days.
// A line needs 5+ days on each side and a clear gap in how many were good days.
const share = (ms) => ms.filter(isGood).length / ms.length;
export function helps(days, hidden, pillars) {
  const keys = Object.keys(days).sort(), out = [];
  const moodOf = (k) => (days[k] && days[k].mood != null ? days[k].mood : null);
  const test = (id, a, b, withL, withoutL, text) => {
    if (hidden[id] || (id === "sleep" && hidden.sleep730) || a.length < 5 || b.length < 5) return;   // sleep730: the old 7h30 line, hidden before
    const gap = share(a) - share(b), top = mostPicked(a);
    if (gap >= 0.25 && isGood(top)) out.push({ id, gap, top, text, rows: [[withL, a], [withoutL, b]] });
  };
  // bedtime: the night before each day
  const early = [], late = [], long = [], short = [];
  keys.forEach((k) => {
    const d = days[k]; if (!d.sleep || d.mood == null) return;
    const bed = d.sleep.bed, isEarly = bed >= 18 * 60 && bed <= 23 * 60 + 30;
    (isEarly ? early : late).push(d.mood);
  });
  // Hours of sleep: the same band as the Mood and sleep card (sleepPattern), never a separate threshold.
  const sp = sleepPattern(days);
  if (["up", "range", "down"].includes(sp.kind) && !sp.early) keys.forEach((k) => {
    const d = days[k]; if (!d.sleep || d.mood == null) return;
    (inSleepBand(sp, sleepMins(d.sleep) / 60) ? long : short).push(d.mood);
  });
  test("bed1130", early, late, "Before 11:30", "After 11:30", (w) => ["After lights out before 11:30, the next day was mostly ", w, "."]);
  test("sleep", long, short, `${sleepHours(sp).replace(/^./, (c) => c.toUpperCase())} sleep`, "Other nights", (w) => [`After ${sleepHours(sp)} of sleep, days were mostly `, w, "."]);
  pillars.forEach((p) => {
    const a = [], b = [];
    keys.forEach((k) => { const m = moodOf(k); if (m == null) return; ((days[k].pil || []).includes(p) ? a : b).push(m); });
    test("p:" + p, a, b, p + " days", "Other days", (w) => ["Days with " + p + " were mostly ", w, "."]);
  });
  const ar = [], nr = [];
  keys.forEach((k) => { const m = moodOf(k), prev = days[addDays(k, -1)]; if (m == null || !prev) return; (prev.rest ? ar : nr).push(m); });
  test("rest", ar, nr, "After a rest day", "Other days", (w) => ["Your rest days were often followed by a ", w, " day."]);
  out.sort((x, y) => y.gap - x.gap);
  const mine = out.slice(0, 5);
  const RESEARCH = [
    ["r-move", "Moving your body, even a 10 minute walk, often lifts mood the same day."],
    ["r-people", "A message or a chat with someone you like is one of the most reliable lifts."],
    ["r-wake", "Waking at about the same time each day tends to lift mood over a few weeks."],
    ["r-outside", "Ten minutes of daylight outside goes with better mood and better sleep."],
    ["r-name", "Naming what you feel, like you do each evening, can take the edge off it."],
  ].filter((r) => !hidden[r[0]]);
  const fill = Math.max(0, 3 - mine.length);
  return mine.concat(RESEARCH.slice(0, fill).map(([id, t]) => ({ id, research: true, text: () => [t] })));
}
export const goodCount = (ms) => ms.filter(isGood).length;
