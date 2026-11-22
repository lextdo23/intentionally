// The numbers behind Your days. Everything here only reads what the person noted.
import { addDays, dayKey, keyDate, DAY_LETTER, MONTH, mostPicked, avg, isGood, sleepMins } from "./util.js";
import { card as cardOf, ownCard } from "./deck.js";

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

// ---- Activities: how doing each card felt (alex 2026-11-22) ----
// Every "How did doing it feel?" word belongs to one of three kinds. A card's kind is the one most of its words
// belong to (ties: lifted, then got it done). Own cards count the same as deck cards.
export const FELT_KIND = { "Enjoyed it": "lift", Calmer: "lift", "Closer to someone": "lift", "More energy": "lift", "Felt like me": "lift",
  "Proud of myself": "done", "Glad it's done": "done", Hard: "hard", "Drained me": "hard", "Not for me": "hard" };
export const KIND_WORD = { lift: "Lifted you", done: "Got it done", hard: "Took a lot" };
export const ACT_SOLID = 5;               // a pillar needs 5 cards before it's more than "still learning"
const kindOf = (felt) => {
  const n = { lift: 0, done: 0, hard: 0 }; felt.forEach((w) => FELT_KIND[w] && n[FELT_KIND[w]]++);
  return n.lift >= n.done && n.lift >= n.hard && n.lift ? "lift" : n.done >= n.hard && n.done ? "done" : n.hard ? "hard" : null;
};
// One entry per card answered: { k, id, pillar, text, felt, kind, mood }. Oldest first.
export function activities(days, from = "", to = dayKey()) {
  const out = [];
  Object.keys(days).filter((k) => k >= from && k <= to).sort().forEach((k) => {
    const d = days[k], mood = d.mood != null ? d.mood : null;
    if (!d.rest && d.card && d.card.id && (d.card.felt || []).length) {
      const c = cardOf(d.card.id), kind = kindOf(d.card.felt);
      if (c && kind) out.push({ k, id: d.card.id, pillar: c.pillar, text: c.text, felt: d.card.felt.slice(), kind, mood });
    }
    (d.made || []).forEach((id) => { const o = ownCard(id); const kind = o && kindOf(o.felt || []); if (kind) out.push({ k, id, pillar: o.pillar, text: o.text, felt: o.felt.slice(), kind, mood }); });
  });
  return out;
}
// Mood and activities: one row per pillar. How doing it felt (the main kind, its count, its two most-picked words)
// next to how those days went (usual evening mood). A gold note where the two clearly disagree.
export function moodActivities(days) {
  const A = activities(days), by = {};
  A.forEach((a) => (by[a.pillar] = by[a.pillar] || []).push(a));
  const rows = Object.entries(by).map(([pillar, list]) => {
    const n = { lift: 0, done: 0, hard: 0 }; list.forEach((a) => n[a.kind]++);
    const kind = n.lift >= n.done && n.lift >= n.hard ? "lift" : n.done >= n.hard ? "done" : "hard";
    const wc = {}; list.filter((a) => a.kind === kind).forEach((a) => a.felt.filter((w) => FELT_KIND[w] === kind).forEach((w) => (wc[w] = (wc[w] || 0) + 1)));
    const words = Object.keys(wc).sort((a, b) => wc[b] - wc[a]).slice(0, 2);
    const moodDays = [...new Set(list.filter((a) => a.mood != null).map((a) => a.k))].map((k) => days[k].mood);
    const usual = moodDays.length ? Math.round(avg(moodDays)) : null, av = moodDays.length ? avg(moodDays) : null;
    const total = list.length, learning = total < ACT_SOLID;
    let note = null;
    if (!learning && moodDays.length >= ACT_SOLID) {
      if (n.hard / total >= 0.5 && av >= 4) note = "worth";        // hard to do, but those days still went well
      else if (n.lift / total >= 0.7 && av < 3) note = "moment";   // helped in the moment, even on lower days
    }
    return { pillar, list, n, kind, count: n[kind], total, words, usual, learning, note };
  }).sort((a, b) => b.total - a.total);
  const best = rows.find((r) => r.note === "worth") || rows.find((r) => r.note === "moment");
  const top = rows.filter((r) => !r.learning && r.n.lift).sort((a, b) => b.n.lift - a.n.lift)[0];
  const lead = best ? { kind: best.note, pillar: best.pillar } : top ? { kind: top.usual != null && top.usual >= 4 ? "both" : "lift", pillar: top.pillar } : { kind: "empty" };
  return { rows, lead };
}
// What lifts you: the cards that lifted you most in the last 4 weeks, and the ones that still helped on harder
// days (Low or below). Harder days only show once there are 5 cards done on harder days.
export const HARDER_DAY = 2, HARDER_NEED = 5;
export function lifts(days, today = dayKey()) {
  const A = activities(days, addDays(today, -27), today);
  const group = (list, keep) => {
    const by = {};
    list.forEach((a) => { const g = (by[a.id] = by[a.id] || { id: a.id, pillar: a.pillar, text: a.text, n: 0, of: 0, words: {} }); g.of++; if (keep(a)) { g.n++; a.felt.filter((w) => keep({ kind: FELT_KIND[w] })).forEach((w) => (g.words[w] = (g.words[w] || 0) + 1)); } });
    return Object.values(by).filter((g) => g.n).map((g) => ({ ...g, word: Object.keys(g.words).sort((a, b) => g.words[b] - g.words[a])[0] || "" }))
      .sort((a, b) => b.n - a.n || b.n / b.of - a.n / a.of).slice(0, 3);
  };
  const any = group(A, (a) => a.kind === "lift");
  const harderList = A.filter((a) => a.mood != null && a.mood <= HARDER_DAY);
  const harder = harderList.length >= HARDER_NEED ? group(harderList, (a) => a.kind === "lift" || a.kind === "done") : [];
  return { any, harder };
}
// Getting easier, for the weekly look back: a pillar that mostly "took a lot" a few weeks ago and mostly lifts now.
// Needs the pillar in at least 3 of the last 4 weeks and 6+ cards. Never says the opposite.
export function easier(days, weekStart) {
  const from = addDays(weekStart, -21), A = activities(days, from, addDays(weekStart, 6)), by = {};
  A.forEach((a) => (by[a.pillar] = by[a.pillar] || []).push(a));
  let best = null;
  Object.entries(by).forEach(([pillar, list]) => {
    if (list.length < 6) return;
    const weeks = [0, 1, 2, 3].map((i) => list.filter((a) => a.k >= addDays(from, i * 7) && a.k < addDays(from, i * 7 + 7)));
    if (weeks.filter((w) => w.length).length < 3) return;
    const early = weeks[0].concat(weeks[1]), late = weeks[2].concat(weeks[3]);
    if (early.length < 2 || late.length < 2) return;
    const hardThen = early.filter((a) => a.kind === "hard").length / early.length, liftNow = late.filter((a) => a.kind === "lift").length / late.length;
    const hardNow = late.filter((a) => a.kind === "hard").length / late.length;
    if (hardThen >= 0.5 && liftNow >= 0.6 && hardThen - hardNow >= 0.4) {
      const score = liftNow - hardNow + hardThen;
      if (!best || score > best.score) best = { pillar, weeks: weeks.map((w) => w.map((a) => a.kind)), score };
    }
  });
  return best;
}

// ---- What seems to help you ----
// Compare days with something vs days without it. Only things the person controls, only better days.
// A line needs 5+ days on each side and a clear gap in how many were good days.
const share = (ms) => ms.filter(isGood).length / ms.length;
export const NOTE_NEED = 5;   // a line from a night note only shows for people who use that note on 5+ nights
const LATE_BED = "Stayed up later than I meant to";
export function helps(days, hidden, pillars) {
  const keys = Object.keys(days).sort(), out = [];
  const moodOf = (k) => (days[k] && days[k].mood != null ? days[k].mood : null);
  // test(): days with something (a) vs without (b). measure "good" counts good days; "rested" counts rested mornings.
  const test = (id, a, b, withL, withoutL, text, measure = "good") => {
    if (hidden[id] || a.length < 5 || b.length < 5) return;
    const ok = measure === "rested" ? (r) => r >= 3 : isGood;
    const sh = (xs) => xs.filter(ok).length / xs.length, gap = sh(a) - sh(b), top = mostPicked(a);
    if (gap >= 0.25 && (measure === "rested" ? sh(a) >= 0.5 : isGood(top))) out.push({ id, gap, top, text, measure, rows: [[withL, a], [withoutL, b]] });
  };
  // Mornings with a sleep check-in and that day's mood (the night notes describe the night before the day).
  const slept = keys.filter((k) => days[k].sleep && days[k].mood != null);
  const tagged = (t) => slept.filter((k) => (days[k].sleep.tags || []).includes(t));
  const split = (pick) => { const a = [], b = []; slept.forEach((k) => (pick(k) ? a : b).push(days[k].mood)); return [a, b]; };
  // Bedtime: their own plan if they use "Stayed up later than I meant to"; otherwise lights out before 11:30. Never both.
  if (tagged(LATE_BED).length >= NOTE_NEED) {
    const [a, b] = split((k) => !(days[k].sleep.tags || []).includes(LATE_BED));
    test("planned", a, b, "Bed as planned", "Stayed up later", (w) => ["When you went to bed when you meant to, the next day was mostly ", w, "."]);
  } else {
    const [a, b] = split((k) => { const bed = days[k].sleep.bed; return bed >= 18 * 60 && bed <= 23 * 60 + 30; });
    test("bed1130", a, b, "Before 11:30", "After 11:30", (w) => ["After lights out before 11:30, the next day was mostly ", w, "."]);
  }
  // Waking at about your usual time (within 30 minutes of your usual over the last 4 weeks).
  const recent = slept.filter((k) => k >= addDays(keys[keys.length - 1] || dayKey(), -27));
  if (recent.length >= 10) {
    const usual = recent.map((k) => days[k].sleep.wake).sort((x, y) => x - y)[Math.floor(recent.length / 2)];
    const near = (m) => Math.min(Math.abs(m - usual), 1440 - Math.abs(m - usual)) <= 30;
    const [a, b] = split((k) => near(days[k].sleep.wake));
    test("wake", a, b, "At your usual time", "Earlier or later", (w) => ["When you woke at about your usual time, the next day was mostly ", w, "."]);
  }
  // Late caffeine and drinks: only for people who use those notes.
  [["caffeine", "Caffeine late", "No late caffeine", "Late caffeine", (w) => ["When you skipped late caffeine, the next day was mostly ", w, "."]],
   ["drinks", "Had a few drinks", "No drinks", "Had a few drinks", (w) => ["Nights without drinks were followed by mostly ", w, " days."]]].forEach(([id, tag, wl, wol, text]) => {
    if (tagged(tag).length < NOTE_NEED) return;
    const [a, b] = split((k) => !(days[k].sleep.tags || []).includes(tag));
    test(id, a, b, wl, wol, text);
  });
  // Rested: which whole-hour group of sleep you woke most rested after (the sleep chart's groups, rested not mood).
  const nights = keys.filter((k) => days[k].sleep && days[k].sleep.rested != null).map((k) => ({ h: sleepMins(days[k].sleep) / 60, r: days[k].sleep.rested }));
  const G = [[0, 6], [6, 7], [7, 8], [8, 9], [9, 99]].map(([lo, hi]) => { const rs = nights.filter((n) => n.h >= lo && n.h < hi).map((n) => n.r); return { lo, hi, rs }; }).filter((g) => g.rs.length >= 3);
  if (G.length >= 2) {
    const best = G.slice().sort((x, y) => avg(y.rs) - avg(x.rs))[0];
    const words = best.hi === 99 ? `${best.lo} hours or more` : best.lo === 0 ? `under ${best.hi} hours` : `${best.lo} to ${best.hi} hours`;
    const a = best.rs, b = nights.filter((n) => !(n.h >= best.lo && n.h < best.hi)).map((n) => n.r);
    test("rested", a, b, words.replace(/^./, (c) => c.toUpperCase()), "Other nights", () => ["You woke most rested after ", words, "."], "rested");
  }
  // Picking your card before midday (when the card was chosen).
  { const a = [], b = [];
    keys.forEach((k) => { const d = days[k], m = moodOf(k); if (m == null || d.rest || !d.card || !d.card.id || !d.card.at) return; (new Date(d.card.at).getHours() < 12 ? a : b).push(m); });
    test("card-am", a, b, "Before midday", "Later", (w) => ["On days you picked your card before midday, the day was mostly ", w, "."]); }
  // Making your own card.
  { const a = [], b = [];
    keys.forEach((k) => { const m = moodOf(k); if (m == null) return; ((days[k].made || []).length ? a : b).push(m); });
    test("own", a, b, "Made a card", "Other days", (w) => ["Days you made your own card were mostly ", w, "."]); }
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
  ].filter((r) => !hidden[r[0]] && !(r[0] === "r-wake" && mine.some((m) => m.id === "wake")));
  const fill = Math.max(0, 3 - mine.length);
  return mine.concat(RESEARCH.slice(0, fill).map(([id, t]) => ({ id, research: true, text: () => [t] })));
}
export const goodCount = (ms) => ms.filter(isGood).length;
