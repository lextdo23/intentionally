// The numbers behind Your days. Everything here only reads what the person noted.
import { addDays, dayKey, keyDate, DAY_LETTER, MONTH, mostPicked, avg, isGood, sleepMins } from "./util.js";

// ---- Your moods: one line, Week / Month / Year ----
export function moodSeries(days, view) {
  const today = dayKey();
  if (view === "year") {
    // One point per week: the mood felt most that week. Weeks away stay a gap.
    const pts = [], ticks = [];
    for (let w = 51; w >= 0; w--) {
      const ks = Array.from({ length: 7 }, (_, i) => addDays(today, -(w * 7 + 6 - i)));
      const ms = ks.map((k) => days[k] && days[k].mood).filter((m) => m != null);
      pts.push({ m: ms.length ? mostPicked(ms) : null, k: null });
      const d = keyDate(ks[6]);
      if (d.getDate() <= 7 && d.getMonth() % 3 === 0) ticks.push({ i: 51 - w, l: MONTH[d.getMonth()] });
    }
    return { pts, ticks, n: 52, when: "this year" };
  }
  const n = view === "month" ? 30 : 7, pts = [], ticks = [];
  for (let i = 0; i < n; i++) {
    const k = addDays(today, -(n - 1 - i)), d = keyDate(k);
    pts.push({ m: days[k] && days[k].mood != null ? days[k].mood : null, k });
    if (n === 7) ticks.push({ i, l: DAY_LETTER[d.getDay()] });
    else if ((n - 1 - i) % 7 === 0 && i > 0) ticks.push({ i, l: `${d.getDate()} ${MONTH[d.getMonth()]}` });
  }
  return { pts, ticks, n, when: view === "month" ? "this month" : "this week" };
}
export function mostlyWord(days, view) {
  const s = moodSeries(days, view);
  return mostPicked(s.pts.map((p) => p.m).filter((m) => m != null));
}

// ---- Mood and sleep: one dot per day, hours across, mood up ----
export const BANDS = [["under 6", 0, 6], ["6 to 7", 6, 7], ["7 to 8", 7, 8], ["8 to 9", 8, 9], ["9 or more", 9, 99]];
export function sleepMood(days) {
  const N = Object.values(days).filter((d) => d.sleep && d.mood != null).map((d) => ({ h: sleepMins(d.sleep) / 60, m: d.mood }));
  const G = BANDS.map((b) => { const ms = N.filter((d) => d.h >= b[1] && d.h < b[2]).map((d) => d.m); return { b, ms, top: mostPicked(ms) }; });
  const ok = G.map((g, i) => i).filter((i) => G[i].ms.length >= 3);
  const best = N.length >= 5 && ok.length ? ok.sort((a, b) => G[b].top - G[a].top || G[b].ms.length - G[a].ms.length)[0] : null;
  // average mood in each whole-hour band, only once that band has 3 or more nights (one odd day shouldn't bend it)
  const line = [];
  for (let hr = 5; hr < 10; hr++) {
    const ms = N.filter((d) => d.h >= hr && d.h < hr + 1).map((d) => d.m);
    if (ms.length >= 3) line.push([hr + 0.5, avg(ms)]);
  }
  return { N, best: best == null ? null : BANDS[best], line };
}

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
    if (hidden[id] || a.length < 5 || b.length < 5) return;
    const gap = share(a) - share(b), top = mostPicked(a);
    if (gap >= 0.25 && isGood(top)) out.push({ id, gap, top, text, rows: [[withL, a], [withoutL, b]] });
  };
  // bedtime: the night before each day
  const early = [], late = [], long = [], short = [];
  keys.forEach((k) => {
    const d = days[k]; if (!d.sleep || d.mood == null) return;
    const bed = d.sleep.bed, isEarly = bed >= 18 * 60 && bed <= 23 * 60 + 30;
    (isEarly ? early : late).push(d.mood);
    (sleepMins(d.sleep) >= 450 ? long : short).push(d.mood);
  });
  test("bed1130", early, late, "Before 11:30", "After 11:30", (w) => ["After lights out before 11:30, the next day was mostly ", w, "."]);
  test("sleep730", long, short, "Longer sleep", "Shorter sleep", (w) => ["After 7 hours 30 minutes or more of sleep, days were mostly ", w, "."]);
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
