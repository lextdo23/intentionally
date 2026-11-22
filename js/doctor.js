// Share with your doctor (alex 2026-11-23): a summary of a person's days for their GP or psychologist.
// Made on the phone as a PDF (js/pdf.js) and handed to the phone's own share sheet, so it only goes where they send
// it; nothing passes through Daydeck's servers. It states what was recorded, never what it means: no patterns,
// no "seems to help", no scores. Days with nothing recorded are left out, never counted as bad days.
import * as store from "./store.js";
import { h, MOODS, dayKey, keyDate, addDays, sleepMins, clock12, DAY_NAME, MONTH } from "./util.js";
import { FEELINGS, SLEEP_TAGS, SLEEP_MORE, RESTED } from "./words.js";
import { activities, FELT_KIND } from "./stats.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";
import { createPdf, wrap, textWidth } from "./pdf.js";

export const MAX_DAYS = 84;            // up to 12 weeks
export const DEFAULT_DAYS = 28;        // first time: the last 4 weeks
const NIGHT_ROWS = SLEEP_TAGS.concat(["Bad dreams", "Napped", "Late shift"]);
const HEALTH_ROWS = ["Had a few drinks", "Caffeine late", "Sleep aid", "On my period", "Unwell or sore"];
const FEEL_WORDS = new Set(FEELINGS.map((f) => f[0]));
const PART_KEYS = ["mood", "sleep", "acts", "health"];
export const DEFAULT_PARTS = { mood: true, sleep: true, acts: true, health: false };   // health notes only if chosen

// ---- Dates ----
const short = (k) => { const d = keyDate(k); return `${d.getDate()} ${MONTH[d.getMonth()]}`; };
const dayShort = (k) => { const d = keyDate(k); return `${DAY_NAME[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTH[d.getMonth()]}`; };
const longDate = (k) => { const d = keyDate(k); return `${d.getDate()} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getMonth()]} ${d.getFullYear()}`; };
const dow = (k) => keyDate(k).getDay();
const between = (a, b) => Math.round((keyDate(b) - keyDate(a)) / 864e5);
function keysFrom(from, to) { const out = []; for (let k = from; k <= to; k = addDays(k, 1)) out.push(k); return out; }

// The last day covered: today once its evening is done, otherwise yesterday.
export function lastDay(days, today = dayKey()) { return days[today] && days[today].mood != null ? today : addDays(today, -1); }
// Where the summary starts: the day of the last summary (usually the last appointment), else 4 weeks back.
export function startDay(doc, to) {
  const lo = addDays(to, -(MAX_DAYS - 1));
  let from = doc && doc.made && doc.made <= to ? doc.made : addDays(to, -(DEFAULT_DAYS - 1));
  if (from < lo) from = lo;
  return from;
}
export const clampFrom = (from, to) => (from > to ? to : from < addDays(to, -(MAX_DAYS - 1)) ? addDays(to, -(MAX_DAYS - 1)) : from);

const hasSleep = (d) => d && d.sleep && d.sleep.bed != null && d.sleep.wake != null;
const median = (a) => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]; };
function mostly(ms) {
  if (!ms.length) return null;
  const n = MOODS.map((_, m) => ms.filter((x) => x === m).length), top = Math.max(...n);
  return { m: n.indexOf(top), n: top, of: ms.length };
}
const hm = (mins) => { const hh = Math.floor(mins / 60), mm = Math.round(mins % 60); return `${hh}h ${String(mm).padStart(2, "0")}m`; };
// Bedtimes sort from midday, so 11 pm comes before 1 am.
const bedSort = (b) => (b + 720) % 1440, bedBack = (v) => (v + 720) % 1440;
const roundTo5 = (m) => Math.round(m / 5) * 5;

// ---- Weeks (Monday to Sunday), cut to the days covered ----
function weeksOf(keys) {
  const out = [];
  keys.forEach((k) => { if (!out.length || dow(k) === 1) out.push([]); out[out.length - 1].push(k); });
  return out;
}

// Everything the summary says, worked out from the days. Plain data, so it can be tested without drawing.
export function summarise(days, from, to, { parts = DEFAULT_PARTS, name = "", talk = "" } = {}) {
  const keys = keysFrom(from, to), D = (k) => days[k] || {};
  const ms = keys.map((k) => (D(k).mood != null ? D(k).mood : null));
  const evenings = ms.filter((m) => m != null).length;
  const nightsK = keys.filter((k) => hasSleep(D(k)));
  const weeks = weeksOf(keys);
  const out = { from, to, keys, ms, evenings, mornings: nightsK.length, weeks, parts: { ...DEFAULT_PARTS, ...parts }, name: name.trim(), talk: talk.trim() };

  // Mood
  out.moodCounts = MOODS.map((_, m) => ms.filter((x) => x === m).length);
  const half = Math.floor(keys.length / 2), first = ms.slice(0, half).filter((m) => m != null), second = ms.slice(half).filter((m) => m != null);
  out.halves = first.length >= 3 && second.length >= 3 ? [mostly(first), mostly(second)] : null;
  out.overall = mostly(ms.filter((m) => m != null));
  let run = null, cur = null;
  keys.forEach((k, i) => {
    if (ms[i] != null && ms[i] <= 2) { cur = cur ? { ...cur, to: k, n: cur.n + 1 } : { from: k, to: k, n: 1 }; if (!run || cur.n > run.n) run = cur; }
    else cur = null;
  });
  out.lowRun = run;
  out.lowDays = ms.filter((m) => m != null && m <= 2).length;
  // The same number of days just before, when there's enough there to say something.
  const pf = addDays(from, -keys.length), prevMs = keysFrom(pf, addDays(from, -1)).map((k) => D(k).mood).filter((m) => m != null);
  out.before = prevMs.length >= 5 ? { len: keys.length, ...mostly(prevMs) } : null;

  // Feelings: every list word picked at least once, and how many evenings had their own words.
  const fc = {}; let own = 0;
  keys.forEach((k) => { const f = D(k).feel || []; f.forEach((w) => { if (FEEL_WORDS.has(w)) fc[w] = (fc[w] || 0) + 1; }); if (f.some((w) => !FEEL_WORDS.has(w) && w !== "Not sure")) own++; });
  out.feelings = Object.entries(fc).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  out.feelOwn = own;

  // Sleep
  const S = nightsK.map((k) => ({ k, s: D(k).sleep, mins: sleepMins(D(k).sleep), wd: dow(k) >= 1 && dow(k) <= 5 }));
  out.hours = keys.map((k) => (hasSleep(D(k)) ? sleepMins(D(k).sleep) / 60 : null));
  const sum = (list) => list.length ? {
    n: list.length,
    bed: bedBack(roundTo5(median(list.map((x) => bedSort(x.s.bed))))), wake: roundTo5(median(list.map((x) => x.s.wake))), mins: roundTo5(median(list.map((x) => x.mins))),
    bedLo: bedBack(roundTo5(pct(list.map((x) => bedSort(x.s.bed)), 0.1))), bedHi: bedBack(roundTo5(pct(list.map((x) => bedSort(x.s.bed)), 0.9))),
    wakeLo: roundTo5(pct(list.map((x) => x.s.wake), 0.1)), wakeHi: roundTo5(pct(list.map((x) => x.s.wake), 0.9)),
    minsLo: roundTo5(pct(list.map((x) => x.mins), 0.1)), minsHi: roundTo5(pct(list.map((x) => x.mins), 0.9)),
    rested: list.filter((x) => x.s.rested >= 3).length, restedOf: list.filter((x) => x.s.rested != null).length,
  } : null;
  out.sleep = sum(S);
  const wk = S.filter((x) => x.wd), we = S.filter((x) => !x.wd);
  out.sleepSplit = wk.length >= 3 && we.length >= 3 ? { wk: sum(wk), we: sum(we) } : null;
  out.short = S.filter((x) => x.mins < 360).length;
  const tagRows = (list) => list.map((tag) => ({ tag, weeks: weeks.map((w) => w.filter((k) => hasSleep(D(k)) && (D(k).sleep.tags || []).includes(tag)).length) }))
    .map((r) => ({ ...r, total: r.weeks.reduce((a, b) => a + b, 0) })).filter((r) => r.total);
  out.nightRows = tagRows(NIGHT_ROWS);
  out.healthRows = tagRows(HEALTH_ROWS);
  out.weekNights = weeks.map((w) => ({ n: w.filter((k) => hasSleep(D(k))).length, of: w.length }));

  // Activities: deck cards are named; cards the person wrote are counted but never named (their own words).
  const A = activities(days, from, to);
  out.acts = A.length;
  out.actWeeks = weeks.map((w) => ({ done: A.filter((a) => w.includes(a.k)).length, rest: w.filter((k) => D(k).rest).length }));
  const by = {};
  A.forEach((a) => { const r = (by[a.pillar] = by[a.pillar] || { pillar: a.pillar, n: 0, lift: 0, done: 0, hard: 0 }); r.n++; r[a.kind]++; });
  out.pillars = Object.values(by).sort((a, b) => b.n - a.n);
  out.recent = A.filter((a) => typeof a.id !== "string").slice(-10).reverse().map((a) => ({ k: a.k, text: a.text, kind: a.kind, felt: a.felt.filter((w) => FELT_KIND[w]) }));
  out.ownActs = A.filter((a) => typeof a.id === "string").length;
  out.restDays = keys.filter((k) => D(k).rest).length;
  return out;
}

// ---- Drawing the PDF ----
const INK = "#1d1e22", MID = "#444441", SOFT = "#5f5e5a", FAINT = "#b4b2a9", RULE = "#d3d1c7", HAIR = "#ebe9e3";
// Mood colours for white paper: muted, darker at both ends so a black and white print still reads.
const PAPER_COL = ["#4a4e9a", "#6c6fb0", "#8f9cc0", "#a7a59b", "#8db488", "#5f9a5c", "#3f7a3f"];
const KIND_PAPER = { lift: "Lifted", done: "Got it done", hard: "Took a lot" };
const L = 48, R = 547, CW = R - L, TOP = 40, BOTTOM = 800;

export function drawSummary(S) {
  const pdf = createPdf();
  const who = S.name || "";
  const whose = who ? `${who}'s` : "your";
  let y = 0, page = 0;
  const newPage = () => {
    pdf.page(); page++; y = TOP;
    pdf.text(L, y, page === 1 ? "DAYDECK" : `DAYDECK${who ? " · " + who : ""} · ${short(S.from)} – ${short(S.to)} ${keyDate(S.to).getFullYear()}`, { size: 9, bold: true, color: SOFT });
    y += 24;
  };
  const need = (hgt) => { if (y + hgt > BOTTOM) newPage(); };
  const para = (s, { size = 10.5, color = INK, bold = false, gap = 4, width = CW, x = L } = {}) => {
    const lines = wrap(s, size, width, bold), lh = size * 1.45;
    need(lines.length * lh);
    lines.forEach((ln) => { pdf.text(x, y + size, ln, { size, color, bold }); y += lh; });
    y += gap;
  };
  const heading = (s) => { need(60); y += 10; pdf.text(L, y + 15, s, { size: 15, bold: true }); y += 22; pdf.line(L, y, R, y, { color: RULE, width: 1.1 }); y += 10; };
  const bullet = (s) => {
    const lines = wrap(s, 11, CW - 14), lh = 16;
    need(lines.length * lh);
    pdf.text(L + 2, y + 11, "•", { size: 11 });
    lines.forEach((ln) => { pdf.text(L + 14, y + 11, ln, { size: 11 }); y += lh; });
    y += 2;
  };

  // Page 1: who and when, the note for the clinician, what they'd like to talk about, at a glance, the chart.
  newPage();
  pdf.text(L, y + 20, who ? `Summary of ${who}'s days` : "Summary of days recorded in Daydeck", { size: 21, bold: true }); y += 30;
  const sameYear = keyDate(S.from).getFullYear() === keyDate(S.to).getFullYear();
  pdf.text(L, y + 11, `${sameYear ? longDate(S.from).replace(/ \d{4}$/, "") : longDate(S.from)} – ${longDate(S.to)} · ${S.keys.length} days · made ${longDate(dayKey())}`, { size: 11, color: MID }); y += 26;

  const note = `Put together by the Daydeck app only from what ${who || "the person"} chose to record: ${S.evenings} of ${S.keys.length} evenings and ${S.mornings} of ${S.keys.length} mornings. ` +
    "It can't give the complete picture, and makes no assumptions, interpretations or diagnoses. Days with nothing recorded are left out. Daydeck doesn't monitor for risk and isn't watched by anyone.";
  const noteLines = wrap(note, 9.75, CW - 24), boxH = 12 + 14 + noteLines.length * 14 + 8;
  pdf.rect(L, y, CW, boxH, { stroke: FAINT, r: 6 });
  pdf.text(L + 12, y + 20, "For the clinician reading this", { size: 9.75, bold: true });
  noteLines.forEach((ln, i) => pdf.text(L + 12, y + 35 + i * 14, ln, { size: 9.75, color: "#2c2c2a" }));
  y += boxH + 12;

  if (S.talk) {
    const tl = wrap(S.talk, 12, CW - 24), th = 14 + 16 + tl.length * 17 + 8;
    pdf.rect(L, y, CW, th, { fill: "#f3f1ec", r: 6 });
    pdf.text(L + 12, y + 22, who ? `What ${who} would like to talk about` : "What they'd like to talk about", { size: 11, bold: true });
    tl.forEach((ln, i) => pdf.text(L + 12, y + 40 + i * 17, ln, { size: 12 }));
    y += th + 6;
  }

  const glance = [];
  if (S.parts.mood && S.evenings) {
    if (S.halves && S.halves[0].m !== S.halves[1].m) glance.push(`Mood: mostly ${MOODS[S.halves[0].m]} in the first half, mostly ${MOODS[S.halves[1].m]} in the second.`);
    else if (S.overall) glance.push(`Mood: mostly ${MOODS[S.overall.m]} (${S.overall.n} of ${S.overall.of} evenings).`);
    if (S.lowRun && S.lowRun.n >= 2) glance.push(`Longest run of Low or below: ${S.lowRun.n} days in a row, ${dayShort(S.lowRun.from)} – ${dayShort(S.lowRun.to)}.`);
    else if (S.lowDays) glance.push(`Low or below on ${S.lowDays} ${S.lowDays === 1 ? "day" : "days"}, never two in a row.`);
    else glance.push("No days were Low or below.");
    if (S.before) glance.push(`The ${S.before.len % 7 ? S.before.len + " days" : S.before.len / 7 + " weeks"} before: mostly ${MOODS[S.before.m]} (${S.before.n} of ${S.before.of} evenings).`);
  }
  if (S.parts.sleep && S.sleep) glance.push(`Time in bed: usually ${hm(S.sleep.mins)}; under 6 hours on ${S.short} of ${S.sleep.n} nights.`);
  if (glance.length) { heading("At a glance"); glance.forEach(bullet); }

  // Mood and sleep, day by day: one column per day, the same columns for both.
  const showMood = S.parts.mood && S.evenings, showSleep = S.parts.sleep && S.mornings;
  if (showMood || showSleep) {
    const n = S.keys.length, PX = L + 96, PW = R - PX, step = n > 1 ? (PW - 16) / (n - 1) : 0, X = (i) => PX + 8 + i * step;
    const ROW = 19.5, MH = ROW * 7, SH = 80, perDay = step >= 12;
    const chartH = (showMood ? MH + 18 : 0) + (showSleep ? SH + 6 : 0) + (perDay ? 30 : 18);
    heading(showMood && showSleep ? "Mood and sleep, day by day" : showMood ? "Mood, day by day" : "Sleep, day by day");
    need(chartH + 30);
    const top = y, dotR = Math.min(4.5, Math.max(1.6, step * 0.42)), barW = Math.min(9, Math.max(1.6, step * 0.68));
    if (showMood) {
      const Y = (m) => top + ROW / 2 + (6 - m) * ROW;
      for (let m = 6; m >= 0; m--) {
        pdf.line(PX, Y(m), R, Y(m), { color: HAIR });
        const cw = textWidth(String(S.moodCounts[m]), 9.5, true);
        pdf.text(PX - 8, Y(m) + 3.3, String(S.moodCounts[m]), { size: 9.5, bold: true, align: "right" });
        pdf.text(PX - 14 - Math.max(cw, 7), Y(m) + 3.3, MOODS[m], { size: 9.5, color: MID, align: "right" });
      }
      const pts = S.ms.map((m, i) => (m == null ? null : [X(i), Y(m), m])).filter(Boolean);
      pdf.polyline(pts.map((p) => [p[0], p[1]]), { color: FAINT, width: 1.1 });
      pts.forEach((p) => pdf.circle(p[0], p[1], dotR, { fill: PAPER_COL[p[2]], stroke: "#ffffff", width: 1 }));
      y = top + MH + 18;
    }
    if (showSleep) {
      const sTop = y, HY = (hr) => sTop + SH - Math.min(hr, 12) * (SH / 12);
      pdf.text(PX - 8, sTop + 8, "Time in bed", { size: 9.5, bold: true, align: "right" });
      [4, 6, 8].forEach((hr) => { pdf.line(PX, HY(hr), R, HY(hr), { color: HAIR }); pdf.text(PX - 8, HY(hr) + 3.3, hr + "h", { size: 9, color: MID, align: "right" }); });
      S.hours.forEach((hr, i) => { if (hr != null) pdf.rect(X(i) - barW / 2, HY(hr), barW, sTop + SH - HY(hr), { fill: "#8d8b84", r: Math.min(1.5, barW / 3) }); });
      y = sTop + SH + 6;
    }
    // Dates: every day when there's room, otherwise each Monday.
    const dTop = y;
    S.keys.forEach((k, i) => {
      const d = keyDate(k), missing = showMood ? S.ms[i] == null : S.hours[i] == null, col = missing ? FAINT : INK;
      if (perDay) {
        pdf.text(X(i), dTop + 9, "SMTWTFS"[d.getDay()], { size: 8, color: col, align: "center" });
        pdf.text(X(i), dTop + 20, String(d.getDate()), { size: 8, color: col, bold: d.getDay() === 1, align: "center" });
      } else if (d.getDay() === 1 || i === 0) pdf.text(X(i), dTop + 10, short(k), { size: 8, color: SOFT, align: i === 0 ? "left" : "center" });
    });
    S.keys.forEach((k, i) => { if (i && dow(k) === 1) pdf.line(X(i) - step / 2, top, X(i) - step / 2, dTop + (perDay ? 22 : 2), { color: "#9c9a92", dash: [2.5, 2.5] }); });
    y = dTop + (perDay ? 30 : 18);
    para(`One column per day, ${dayShort(S.from)} to ${dayShort(S.to)}; dashed lines mark each Monday.${showSleep ? " The bar is time in bed the night before that day." : ""} ${perDay ? "Light grey dates" : "Gaps"} had no ${showMood ? "evening" : "morning"} check-in.`, { size: 9, color: SOFT });
  }

  // A table of weekly numbers: label column, one column per week, and a total.
  const weekTable = (rows, { firstRow, totalLabel = "All" } = {}) => {
    const nW = S.weeks.length, labW = 150, colW = Math.min(64, (CW - labW - 50) / nW), totW = 50;
    const cx = (j) => L + labW + colW * j + colW / 2, tx = L + labW + colW * nW + totW / 2;
    need(40);
    S.weeks.forEach((w, j) => {
      const lab = dow(w[0]) === 1 ? short(w[0]) : "from " + short(w[0]);
      pdf.text(cx(j), y + 10, colW < 40 ? short(w[0]) : (dow(w[0]) === 1 ? "Mon " : "") + lab, { size: colW < 40 ? 7.5 : 8.5, color: SOFT, align: "center" });
    });
    pdf.text(L, y + 10, "Week starting", { size: 8.5, color: SOFT });
    pdf.text(tx, y + 10, totalLabel, { size: 8.5, bold: true, align: "center" });
    y += 16; pdf.line(L, y, R, y, { color: FAINT, width: 1.1 }); y += 2;
    if (firstRow) {
      need(20);
      pdf.text(L, y + 12, firstRow.label, { size: 9, color: SOFT });
      firstRow.cells.forEach((c, j) => pdf.text(cx(j), y + 12, c, { size: colW < 40 ? 7.5 : 9, color: SOFT, align: "center" }));
      pdf.text(tx, y + 12, firstRow.total, { size: 9, color: SOFT, align: "center" });
      y += 18; pdf.line(L, y, R, y, { color: RULE });
    }
    rows.forEach((r) => {
      if (r.group) { need(30); y += 12; pdf.text(L, y + 10, r.group, { size: 9.5, bold: true }); y += 16; return; }
      need(24);
      pdf.text(L, y + 15, r.label, { size: 10.5 });
      r.cells.forEach((v, j) => {
        if (v) { pdf.rect(cx(j) - colW / 2 + 2, y + 3, colW - 4, 18, { fill: r.shade ? "#" + ["f1f0ec", "e6e4de", "dad8d0", "cfccc3", "c3c0b6", "b8b4a9", "aca89c", "a19d90"][Math.min(7, v)] : "#ffffff", r: 4 }); }
        pdf.text(cx(j), y + 15.5, v ? String(v) : "–", { size: 10.5, bold: !!v, color: v ? INK : FAINT, align: "center" });
      });
      pdf.text(tx, y + 15.5, String(r.total), { size: 10.5, bold: true, align: "center" });
      y += 24; pdf.line(L, y, R, y, { color: HAIR });
    });
    y += 8;
  };

  // Page 2: night notes week by week, then feelings.
  const notesOn = S.parts.sleep && S.mornings;
  const feelOn = S.parts.mood && S.evenings;
  if (notesOn || feelOn) newPage();
  if (notesOn) {
    heading("Night notes, week by week");
    para(`Ticked in the morning check-in, about the night before. Each number is how many nights that week.`, { size: 10.5, color: MID });
    const rows = [];
    if (S.nightRows.length) rows.push({ group: "Sleep" }, ...S.nightRows.map((r) => ({ label: r.tag, cells: r.weeks, total: r.total, shade: true })));
    if (S.parts.health && S.healthRows.length) rows.push({ group: `Health (${who || "they"} chose to include this)` }, ...S.healthRows.map((r) => ({ label: r.tag, cells: r.weeks, total: r.total, shade: true })));
    if (rows.length) weekTable(rows, { firstRow: { label: "Nights checked in", cells: S.weekNights.map((w) => `${w.n} of ${w.of}`), total: `${S.mornings} of ${S.keys.length}` }, totalLabel: "All" });
    if (!S.nightRows.length) para("No night notes were ticked.", { size: 10.5, color: MID });
    if (S.parts.health && !S.healthRows.length) para("No health notes were ticked.", { size: 10.5, color: MID });
  }
  if (feelOn) {
    heading("Feelings");
    para(`Each evening ${who || "they"} could pick as many feelings as fit the day, or none, so the numbers add up to more than ${S.evenings}. Every feeling picked at least once, with evenings out of ${S.evenings}.` +
      (S.feelOwn ? ` ${who || "They"} also added their own words on ${S.feelOwn} ${S.feelOwn === 1 ? "evening" : "evenings"} (not shown).` : ""), { size: 10.5, color: MID });
    if (!S.feelings.length) para("No feelings were picked.", { size: 10.5, color: MID });
    const half = Math.ceil(S.feelings.length / 2), colX = [L, L + CW / 2 + 10], cw = CW / 2 - 10, max = Math.max(1, S.evenings);
    for (let i = 0; i < half; i++) {
      need(18);
      [S.feelings[i], S.feelings[i + half]].forEach((f, c) => {
        if (!f) return;
        const x = colX[c], bx = x + 82, bw = cw - 82 - 26;
        pdf.text(x, y + 11, f[0], { size: 10.5 });
        pdf.rect(bx, y + 5, bw, 6, { fill: "#e5e3dc", r: 3 });
        pdf.rect(bx, y + 5, Math.max(3, bw * f[1] / max), 6, { fill: SOFT, r: 3 });
        pdf.text(x + cw, y + 11, String(f[1]), { size: 10.5, bold: true, align: "right" });
      });
      y += 18;
    }
  }

  // Page 3: sleep in numbers, then activities.
  const sleepOn = S.parts.sleep && S.sleep, actsOn = S.parts.acts && (S.acts || S.restDays);
  if (sleepOn || actsOn) newPage();
  if (sleepOn) {
    heading("Sleep");
    para(`From ${S.sleep.n} morning check-ins. Times are what ${who || "they"} noted, not measured.`, { size: 10.5, color: MID });
    const sp = S.sleepSplit, cols = sp ? [["Usual", 0], ["Sun–Thu nights", 1], ["Fri and Sat nights", 2], ["Most nights between", 3]] : [["Usual", 0], ["Most nights between", 3]];
    const RX = sp ? [L + 200, L + 290, L + 368, R] : [L + 230, R], cx = (j) => RX[j];   // right edges; the range column needs the most room
    need(110);
    cols.forEach(([t], j) => pdf.text(cx(j), y + 10, t, { size: 8.5, color: SOFT, align: "right" }));
    y += 16; pdf.line(L, y, R, y, { color: RULE });
    const cell = (s, what) => !s ? "" : what === "bed" ? clock12(s.bed) : what === "wake" ? clock12(s.wake) : what === "mins" ? hm(s.mins) : `${s.rested} of ${s.restedOf}`;
    const rangeCell = (what) => what === "bed" ? `${clock12(S.sleep.bedLo)} – ${clock12(S.sleep.bedHi)}` : what === "wake" ? `${clock12(S.sleep.wakeLo)} – ${clock12(S.sleep.wakeHi)}` : what === "mins" ? `${hm(S.sleep.minsLo)} – ${hm(S.sleep.minsHi)}` : "";
    [["Into bed", "bed"], ["Woke", "wake"], ["Time in bed", "mins"], ["Woke feeling rested", "rested"]].forEach(([label, what]) => {
      pdf.text(L, y + 15, label, { size: 10.5 });
      cols.forEach(([, c], j) => {
        const v = c === 0 ? cell(S.sleep, what) : c === 1 ? cell(sp.wk, what) : c === 2 ? cell(sp.we, what) : rangeCell(what);
        pdf.text(cx(j), y + 15, v, { size: 10.5, bold: c === 0, align: "right" });
      });
      y += 22; pdf.line(L, y, R, y, { color: HAIR });
    });
    y += 6;
    para(`"Rested" means ${who || "they"} answered ${RESTED[3]} or ${RESTED[4]}. "Most nights between" leaves out the earliest and latest 10%.`, { size: 9, color: SOFT });
  }
  if (actsOn) {
    heading("Activities");
    para(`${who || "They"} can pick one small activity a day (a "card") in the parts of life they chose. After doing it, they pick how it felt.`, { size: 10.5, color: MID });
    weekTable([{ label: "Cards done", cells: S.actWeeks.map((w) => w.done), total: S.acts }, { label: "Rest days taken", cells: S.actWeeks.map((w) => w.rest), total: S.restDays }], { totalLabel: "All" });
    if (S.pillars.length) {
      const heads = ["Done", "Lifted them", "Got it done", "Took a lot"], x0 = L + 170, cw = (CW - 170) / 4, cx = (j) => x0 + cw * (j + 1) - 4;
      need(30 + S.pillars.length * 22);
      pdf.text(L, y + 10, "Part of life", { size: 8.5, color: SOFT });
      heads.forEach((t, j) => pdf.text(cx(j), y + 10, t, { size: 8.5, color: SOFT, align: "right" }));
      y += 16; pdf.line(L, y, R, y, { color: RULE });
      S.pillars.forEach((p) => {
        pdf.text(L, y + 15, p.pillar, { size: 10.5 });
        [p.n, p.lift, p.done, p.hard].forEach((v, j) => pdf.text(cx(j), y + 15, String(v), { size: 10.5, bold: j === 0, align: "right" }));
        y += 22; pdf.line(L, y, R, y, { color: HAIR });
      });
      y += 10;
    }
    if (S.recent.length) {
      need(40); pdf.text(L, y + 11, `What ${who || "they"} did, and how it felt`, { size: 10.5, bold: true }); y += 20;
      S.recent.forEach((c) => {
        const lines = wrap(c.text, 10, CW - 70 - 150);
        need(lines.length * 14 + 4);
        pdf.text(L, y + 10, short(c.k), { size: 10, color: SOFT });
        lines.forEach((ln, i) => pdf.text(L + 70, y + 10 + i * 14, ln, { size: 10 }));
        pdf.text(R, y + 10, [KIND_PAPER[c.kind]].concat(c.felt.slice(0, 1)).join(" · "), { size: 10, color: MID, align: "right" });
        y += lines.length * 14 + 4;
      });
      y += 4;
      const all = S.acts, shown = S.recent.length;
      para((all > shown ? `Showing the ${shown} most recent of ${all}.` : "") + (S.ownActs ? ` Cards ${who || "they"} wrote themselves are counted but not named.` : ""), { size: 9, color: SOFT });
    }
  }

  // Page numbers and footers, now that the count is known.
  for (let i = 0; i < pdf.pageCount; i++) {
    pdf.goto(i);
    pdf.text(R, TOP, `Page ${i + 1} of ${pdf.pageCount}`, { size: 9, color: SOFT, align: "right" });
    pdf.line(L, 812, R, 812, { color: RULE });
    pdf.text(L, 824, "Made with Daydeck (daydeck.day) on the person's own phone. Self-recorded; not a medical record. Daydeck doesn't monitor for risk.", { size: 8.5, color: SOFT });
  }
  return pdf.bytes(who ? `Summary of ${who}'s days` : "Daydeck summary");
}

// ---- The screen ----
const PARTS = [
  ["mood", "Mood and feelings", "How your days went, and the feelings that came up most"],
  ["sleep", "Sleep", "When you slept, how rested you felt, and your night notes"],
  ["acts", "Activities", "What you did, and how it felt to do"],
  ["health", "Health notes", "Drinks, late caffeine, sleep aid, unwell, period"],
];
export function fileName(to) { return `Daydeck summary ${short(to)} ${keyDate(to).getFullYear()}.pdf`; }

export function openDoctor() {
  log("doctor_open");
  const s = store.get(), doc = (s.doc = s.doc || {});
  const to = lastDay(s.days);
  let from = startDay(doc, to), talk = "";
  const parts = { ...DEFAULT_PARTS, ...(doc.parts || {}) };
  openSheet((panel, close) => {
    const cover = h("span.doc-sub");
    const date = h("input.doc-date", { type: "date", value: from, min: addDays(to, -(MAX_DAYS - 1)), max: to, "aria-label": "Date of your last appointment" });
    const go = h("button.btn-main", { type: "button" }, "Make the summary");
    const why = h("p.doc-why");
    const refresh = () => {
      const S = summarise(s.days, from, to, { parts });
      cover.textContent = `${S.keys.length} ${S.keys.length === 1 ? "day" : "days"} · ${S.evenings} ${S.evenings === 1 ? "evening" : "evenings"} and ${S.mornings} ${S.mornings === 1 ? "morning" : "mornings"} noted`;
      const anyPart = PART_KEYS.some((k) => parts[k] && k !== "health") || parts.health;
      const anyData = S.evenings || S.mornings || S.acts || S.restDays;
      const off = !anyPart || !anyData;
      go.setAttribute("aria-disabled", String(off));
      why.textContent = !anyData ? "Nothing was noted in these days yet." : !anyPart ? "Switch on at least one part." : "It describes what you noted. It isn't a diagnosis.";
    };
    date.addEventListener("change", () => { if (date.value) { from = clampFrom(date.value, to); date.value = from; refresh(); } });
    const rows = PARTS.map(([k, name, sub]) => {
      const sw = h("button.switch", { type: "button", role: "switch", "aria-checked": String(!!parts[k]), "aria-label": name });
      sw.addEventListener("click", () => { parts[k] = !parts[k]; sw.setAttribute("aria-checked", String(parts[k])); refresh(); });
      return h("div.doc-row", null, h("span.doc-col", null, h("span.doc-name", null, name), h("span.doc-sub", null, sub)), sw);
    });
    const nameIn = h("input.doc-field", { type: "text", maxlength: "40", value: doc.name || "", autocomplete: "given-name", "aria-label": "Your name on it (optional)" });
    const talkIn = h("textarea.doc-field", { rows: "3", maxlength: "500", placeholder: "A few words, so you don't forget on the day", "aria-label": "What you'd like to talk about (optional)" });
    talkIn.addEventListener("input", () => { talk = talkIn.value; });
    go.addEventListener("click", async () => {
      if (go.getAttribute("aria-disabled") === "true") return;
      const S = summarise(s.days, from, to, { parts, name: nameIn.value, talk });
      const bytes = drawSummary(S);
      doc.parts = { ...parts }; doc.name = nameIn.value.trim().slice(0, 40); doc.from = from; doc.made = dayKey(); store.save();
      log("doctor_made", { d: S.keys.length, p: PART_KEYS.filter((k) => parts[k]).map((k) => k[0]).join(""), t: S.talk ? 1 : 0, n: S.name ? 1 : 0 });
      await sendPdf(bytes, fileName(to));
    });
    panel.append(
      h("div.col", { style: { gap: "4px" } }, h("h2", null, "Share with your doctor"),
        h("span.sub", null, "A summary for your GP or psychologist. No information is shared anywhere.")),
      h("div.doc-group", null, h("label.doc-row", null, h("span.doc-col", null, h("span.doc-name", null, "Since your last appointment"), cover), date)),
      h("div.doc-set", null, h("span.doc-label", null, "What to include"), h("div.doc-group", null, rows)),
      h("label.doc-set", null, h("span.doc-label", null, "Your name on it (optional)"), nameIn),
      h("label.doc-set", null, h("span.doc-label", null, "What you'd like to talk about (optional)"), talkIn),
      why, go);
    refresh();
  }, { label: "Share with your doctor" });
}

async function sendPdf(bytes, name) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  try {
    const file = new File([blob], name, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }   // closed the share sheet
  const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// The button at the bottom of Your days.
export function doctorButton() {
  return h("button.doc-btn", { type: "button", onclick: openDoctor },
    h("span.doc-ic", { "aria-hidden": "true" }, svgDoc()),
    h("span.doc-col", null, h("span.doc-name", null, "Share with your doctor"), h("span.doc-sub", null, "A summary for your GP or psychologist")),
    h("span.doc-chev", { "aria-hidden": "true" }));
}
function svgDoc() {
  const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "20"); svg.setAttribute("height", "20");
  ["M7 3h7l5 5v13H7z", "M14 3v5h5", "M10 13h6M10 17h4"].forEach((d) => { const p = document.createElementNS(ns, "path"); p.setAttribute("d", d); svg.append(p); });
  return svg;
}
