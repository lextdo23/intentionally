// Your days: one scrolling page. Your moods, Mood and sleep, Mood and what you did, What seems to help you.
// Slides in from the right like iPhone Settings; "‹ Today" or a swipe in from the left edge goes back.
import { h, MOODS, CHART_COL as MOOD_COL, moodWord, dayKey, addDays, dayTitle, clock12, hoursWords, sleepMins, smoothPath, reduceMotion, LIFELINE, keyDate, MONTH } from "./util.js";
import { weeksSection } from "./wrapped.js";
import * as store from "./store.js";
import { moodSeries, mostlyWord, oldestBack, sleepPattern, sleepHours, inSleepBand, pillarRows, helps, goodCount, SOLID } from "./stats.js";
import { RESTED } from "./words.js";
import { openSheet, roundBtn, spring } from "./ui.js";
import { log } from "./tester.js";
import * as levels from "./levels.js";
import * as tips from "./tips.js";

import { img, openViewer } from "./photos.js";
import { PILLAR_COL, card as cardOf, HOW, ownCard } from "./deck.js";
export { PILLAR_COL };
const NAME = { A: "Your moods", B: "Mood and sleep", C: "Mood and what you did", D: "What seems to help you" };
let view = "week", back = 0, origin = null, onClosed = null, helpsSeen = false;
const root = () => document.getElementById("days");
const coloured = (m, text) => h("span", { style: { color: MOOD_COL[m], fontWeight: "600" } }, text || moodWord(m));

// ---------- open / close: slides in from the right like iPhone Settings; swipe in from the left edge to go back ----------
// One number, p: 0 = closed, 1 = open. A spring or your finger moves it.
let p = 0, stop = () => {};
const homeEls = () => [document.getElementById("home"), document.getElementById("sun")];
function draw(v) {
  p = v; const W = innerWidth, el = root(), dim = document.getElementById("dim"), k = Math.max(0, Math.min(1, v));
  el.style.transform = `translateX(${(1 - v) * W}px)`;
  homeEls().forEach((e) => { e.style.transition = "none"; e.style.transform = `translateX(${-0.3 * W * k}px)`; });
  dim.style.transition = "none"; dim.style.opacity = String(k * 0.6);
}
function clearDraw() {
  const el = root(), dim = document.getElementById("dim");
  el.style.transform = ""; dim.style.opacity = ""; dim.style.transition = "";
  homeEls().forEach((e) => { e.style.transform = ""; e.style.transition = ""; });
}
function to(target, vel, done) {
  stop();
  if (reduceMotion()) { draw(target); const a = root().animate([{ opacity: target ? 0 : 1 }, { opacity: target ? 1 : 0 }], { duration: 150 }); a.finished.then(() => done && done()); return; }
  stop = spring(p, target, (vel || 0) / innerWidth, draw, done);
}
export function openDays(fromEl, closed) {
  onClosed = closed; origin = fromEl; back = 0; log("days_open"); helpsSeen = false; sleepSeen = false; sleepSlid = false; sleepSel = null;
  const el = root(); render();
  el.querySelector(".scroll").scrollTop = 0;
  draw(0); el.classList.add("open");
  document.body.classList.add("in-days");
  to(1);
}
function closeDays(vel) {
  if (!document.body.classList.contains("in-days")) return;
  document.body.classList.remove("in-days");
  to(0, vel, () => { clearDraw(); root().classList.remove("open"); onClosed && onClosed(); });
}
// The left-edge swipe: the page follows your finger; let go past a third (or flick) and it goes back to Today.
function edgeSwipe(edge) {
  let x0 = null, pts = [];
  edge.addEventListener("pointerdown", (e) => { x0 = e.clientX; pts = [[performance.now(), e.clientX]]; stop(); try { edge.setPointerCapture(e.pointerId); } catch { /* ok */ } });
  edge.addEventListener("pointermove", (e) => {
    if (x0 == null) return; const t = performance.now(); pts.push([t, e.clientX]); pts = pts.filter((q) => t - q[0] < 100);
    draw(1 - Math.max(0, e.clientX - x0) / innerWidth);
  });
  const end = () => {
    if (x0 == null) return; x0 = null;
    const a = pts[0], b = pts[pts.length - 1], v = pts.length > 1 ? (b[1] - a[1]) / Math.max(1, b[0] - a[0]) * 1000 : 0;
    if ((1 - p) + v * 0.2 / innerWidth > 0.33 || v > 800) closeDays(-v); else to(1, -v);
  };
  edge.addEventListener("pointerup", end); edge.addEventListener("pointercancel", end);
}

// ---------- page ----------
function render() {
  const s = store.get(), el = root();
  el.replaceChildren(h("div.bg"), h("div.scroll", null, h("div.page", null,
    h("div.page-head", null, roundBtn("back", "Back to today", () => closeDays()), h("button.btn-pill", { onclick: arrange }, "Edit")),
    h("h1.big-title", null, "Your days"),
    h("div.sections", null, s.order.map((k) => ({ A: secMoods, B: secSleep, C: secPillars, D: secHelps }[k])(s)), weeksSection()),
    LIFELINE())));
  const edge = h("div.edge", { "aria-hidden": "true" }); el.append(edge); edgeSwipe(edge);
}
const redraw = () => { const sc = root().querySelector(".scroll"), y = sc ? sc.scrollTop : 0; render(); root().querySelector(".scroll").scrollTop = y; };

// A: the mood line, Week / Month / Year
function secMoods(s) {
  const months = levels.isOpen("months");   // Month and Year open at level 6 (alex 2026-11-18; moved from 5 for Friends, 2026-11-20); before that, weeks only
  if (!months) view = "week";
  const ser = moodSeries(s.days, view, back), have = ser.pts.filter((p) => p.m != null);
  const seg = !months ? null : h("div.seg", { role: "tablist" }, [["week", "Week"], ["month", "Month"], ["year", "Year"]].map(([v, l]) =>
    h("button", { role: "tab", "aria-selected": String(view === v), onclick: () => { view = v; back = 0; if (v !== "week") tips.used("months"); redraw(); log("days_view", v); } }, l, v !== "week" && tips.isNew("months") ? tips.newTag() : null)));
  // The real dates: "9 – 15 Nov", "November", "2026". Arrows step back to earlier ones and forward again.
  const max = oldestBack(s.days, view), step = (d) => { back = Math.max(0, Math.min(max, back + d)); redraw(); };
  const arrow = (d, t, on) => h("button.round", { "aria-label": d > 0 ? `Earlier ${view}` : `Later ${view}`, disabled: !on, style: { visibility: on ? "visible" : "hidden" }, onclick: () => step(d) }, t);
  const date = h("div.period", null, arrow(1, "‹", back < max), h("span", { "aria-live": "polite" }, ser.label), arrow(-1, "›", back > 0));
  const top = mostlyWord(s.days, view, back), anyEver = Object.values(s.days).some((d) => d.mood != null);
  // A new period with nothing noted yet says so, so it never reads as lost data (alex 2026-11-16).
  const head = top != null ? h("p.headline", null, "Mostly ", coloured(top), ` ${ser.when}.`)
    : view === "week" && !back ? h("p.headline", null, anyEver ? "A new week. Your moods show here from tonight." : "Your moods show here after your first evening.")
    : h("p.headline", null, `Nothing noted ${ser.when}.`);
  // "Last week was mostly okay." Under the headline while this period is empty, under the graph once it fills.
  const prev = back ? null : mostlyWord(s.days, view, 1);
  const prevLine = prev == null ? null : h("p.prev", null, `Last ${view} was mostly `, coloured(prev), ".");
  // The switch lives inside the Your moods box, so it's clear it only changes the mood line (alex 2026-11-16, 2A).
  const out = h("div.card.moods", null, h("h3", null, "Your moods"), seg, h("div.col", { style: { gap: "4px" } }, date, head, have.length ? null : prevLine));
  if (!have.length) return out;
  const W = 334, L = 40, R = 334, n = ser.n, X = (i) => L + (i + 0.5) / n * (R - L), Y = (m) => 150 - m * 22.7;
  const P = ser.pts.map((p, i) => (p.m == null ? null : [X(i), Y(p.m), p.m]));
  const runs = []; let cur = []; P.forEach((p) => { if (p) cur.push(p); else { if (cur.length) runs.push(cur); cur = []; } }); if (cur.length) runs.push(cur);
  const hw = Math.max(3, (R - L) / n / 2);
  const area = runs.map((r) => (r.length > 1 ? `${smoothPath(r)} L ${r[r.length - 1][0].toFixed(1)} 164 L ${r[0][0].toFixed(1)} 164 Z` : `M ${(r[0][0] - hw).toFixed(1)} 164 Q ${r[0][0].toFixed(1)} ${r[0][1] - 6} ${(r[0][0] + hw).toFixed(1)} 164 Z`)).join(" ");
  let bridge = ""; for (let i = 1; i < P.length - 1; i++) if (!P[i] && P[i - 1] && P[i + 1]) bridge += `M ${P[i - 1][0].toFixed(1)} ${P[i - 1][1]} L ${P[i + 1][0].toFixed(1)} ${P[i + 1][1]} `;
  const dotR = n === 7 ? 5.5 : n >= 28 && n <= 31 ? 3.5 : 0;
  const svg = h("svg", { viewBox: `0 0 ${W} 170`, role: "img", "aria-label": `Mood line, ${ser.when}` },
    h("defs", null,
      h("linearGradient", { id: "ln", x1: "0", y1: "14", x2: "0", y2: "150", gradientUnits: "userSpaceOnUse" }, h("stop", { offset: "0", "stop-color": "#56b56c" }), h("stop", { offset: "0.5", "stop-color": "#bdae8e" }), h("stop", { offset: "1", "stop-color": "#4a4fa8" })),
      h("linearGradient", { id: "fl", x1: "0", y1: "14", x2: "0", y2: "164", gradientUnits: "userSpaceOnUse" }, h("stop", { offset: "0", "stop-color": "#7ab57a", "stop-opacity": "0.32" }), h("stop", { offset: "0.55", "stop-color": "#bdae8e", "stop-opacity": "0.12" }), h("stop", { offset: "1", "stop-color": "#4a4fa8", "stop-opacity": "0" }))),
    h("text", { x: "0", y: "18", fill: "#a9a59d", "font-size": "11" }, "Great"), h("text", { x: "0", y: Y(3) + 4, fill: "#a9a59d", "font-size": "11" }, "Okay"), h("text", { x: "0", y: "152", fill: "#a9a59d", "font-size": "11" }, "Awful"),
    h("line", { x1: L, y1: Y(3), x2: R, y2: Y(3), stroke: "rgba(239,237,233,0.08)", "stroke-dasharray": "3 5" }),
    h("path", { d: area, fill: "url(#fl)" }),
    bridge && h("path", { d: bridge, fill: "none", stroke: "rgba(239,237,233,0.2)", "stroke-width": "2", "stroke-dasharray": "2 6", "stroke-linecap": "round" }),
    h("path", { d: runs.filter((r) => r.length > 1).map(smoothPath).join(" "), fill: "none", stroke: "url(#ln)", "stroke-width": n === 52 ? "2" : "2.5", "stroke-linecap": "round", "stroke-linejoin": "round" }),
    dotR ? P.filter(Boolean).map((p) => h("circle", { cx: p[0].toFixed(1), cy: p[1], r: dotR, fill: MOOD_COL[p[2]], stroke: "#1d1e22", "stroke-width": "2" })) : null);
  const chart = h("div.chart", null, svg);
  // tap a day on the line to open it
  if (view !== "year") ser.pts.forEach((p, i) => p.k && chart.append(h("button.hit", { "aria-label": `${dayTitle(p.k)}${p.m != null ? ", " + MOODS[p.m] : ""}`, style: { left: `${(X(i) - (R - L) / n / 2) / W * 100}%`, width: `${(R - L) / n / W * 100}%` }, onclick: () => openDay(p.k) })));
  const ticks = h("div", { style: { position: "relative", height: "16px", marginLeft: `${L / W * 100}%` } }, ser.ticks.map((t) =>
    h("span.lab", { style: { position: "absolute", top: "0", left: `${(t.i + 0.5) / n * 100}%`, transform: "translateX(-50%)", fontSize: "11px", color: "#a9a59d", whiteSpace: "nowrap" } }, t.l)));
  out.append(h("div.chart-wide", null, chart, ticks), prevLine || "");   // no last week: nothing (it used to print "null")
  return out;
}

// B: mood and sleep (alex 2026-11-22). One column per night: taller = more sleep, colour = how the next day felt.
// By hours lines the last 4 weeks up shortest to longest (the columns slide); By date shows the same nights in order.
// Slide a finger across to read a night; tap the line it shows to open that day. The headline and band come from
// sleepPattern (js/stats.js), the same rule "What seems to help you" uses.
const PX_H = 14.5;   // column height per hour of sleep (12 hours fills the chart; longer real nights are kept, just drawn at the top)
let sleepView = "hours", sleepSel = null, sleepT = 0, sleepSlid = false, sleepSeen = false;
function secSleep(s) {
  const P = sleepPattern(s.days), card = h("div.card.slp", null, h("h3", null, "Mood and sleep"));
  if (!sleepSeen) { sleepSeen = true; log("sleep_seen", P.kind); }
  const DAYS3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hw = (hr) => { const m = Math.round(hr * 60); return `${Math.floor(m / 60)}h${m % 60 ? " " + (m % 60) + "m" : ""}`; };
  const dayLabel = (k) => { const d = keyDate(k); return `${DAYS3[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`; };

  const tabs = h("div.seg", { role: "tablist", "aria-label": "Order the nights" }, [["hours", "By hours"], ["date", "By date"]].map(([v, l]) =>
    h("button", { role: "tab", id: "slp-" + v, "aria-controls": "slp-chart", "aria-selected": String(sleepView === v), onclick: () => {
      if (sleepView === v) return; sleepView = v; firstDone(); log("sleep_view", v); if (sleepSel) later();
      tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.id === "slp-" + v))); update();
    } }, l)));
  const so = (t) => (P.early ? "So far, " + t.charAt(0).toLowerCase() + t.slice(1) : t);
  const lead = P.kind === "empty" ? h("p.lead", null, "This fills in after your first few ", h("b", null, "mornings and evenings"), ".")
    : P.kind === "steady" ? h("p.lead", null, "Your sleep has been ", h("b", null, "steady"), ", so there’s little to compare.")
    : P.kind === "none" ? h("p.lead", null, so("No clear link between "), h("b", null, "sleep and mood"), " yet.")
    : h("p.lead", null, so("Your best days came after "), h("b", null, sleepHours(P)), ".");
  const more = P.kind === "none" || P.kind === "steady" ? h("p.more", null, "Your mood may hang more on other things. ",
    h("button", { onclick: () => { const t = root().querySelector(".helps-card"); t && t.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" }); log("sleep_to_helps"); } }, "See what seems to help ›")) : null;
  const read = h("div.read", { "aria-live": "polite" });
  const chart = h("div.slp-chart", { id: "slp-chart", role: "tabpanel" });
  const band = h("div.slp-band"), bandL = h("span.slp-band-l"), seven = h("div.slp-7", { style: { top: `${190 - 7 * PX_H}px` } }), sevenL = h("span.slp-7l", { style: { top: `${174 - 7 * PX_H}px` } }, "7h");
  chart.append(band, bandL, seven, sevenL);
  const cols = P.nights.map((n, idx) => {
    const now = n.m == null;
    const b = h("button.slp-col" + (now ? ".now" : ""), { "aria-label": now ? `Last night, ${hw(n.h)}, today not noted yet` : `${dayTitle(n.k)}, slept ${hw(n.h)}, then a ${moodWord(n.m)} day`,
      onclick: () => { if (!now) pick(sleepSel === n.k ? null : n.k); } }, h("i", { style: { height: `${Math.round(Math.min(n.h, 12) * PX_H)}px`, ...(now ? {} : { background: MOOD_COL[n.m] }) } }));
    b.style.transitionDelay = "0s"; chart.append(b); return { n, b, idx };
  });
  const touch = h("div.slp-touch", { "aria-hidden": "true" }); chart.append(touch);
  const ticks = h("div"); chart.append(ticks);
  const key = h("div.slp-key", { "aria-hidden": "true" }, h("span", null, "Next day"), h("span", null, "Awful"), ...MOOD_COL.map((c) => h("i", { style: { background: c } })), h("span", null, "Great"));
  const noteEl = h("p.slp-note", null, h("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "#a9a59d", "stroke-width": "2", "stroke-linecap": "round", "aria-hidden": "true" }, h("circle", { cx: "12", cy: "12", r: "9" }), h("path", { d: "M12 11v5M12 8h.01" })),
    P.left ? h("span", null, h("b", null, P.left === 1 ? "1 more day" : `${P.left} more days`), " and patterns get more reliable.") : h("span", null, `Based on ${P.total} days. Patterns get steadier over time.`));
  card.append(tabs, lead, more || "", read, chart, key, noteEl);

  // The first time only: what the columns mean, in the hint line. Gone after the first slide or tab switch.
  function firstDone() { if (!s.notes.sleepHint) { s.notes.sleepHint = true; store.save(); } }
  function pick(k) { clearTimeout(sleepT); sleepSel = k; if (k != null) later(); update(); }
  function later() { clearTimeout(sleepT); sleepT = setTimeout(() => { sleepSel = null; if (card.isConnected) update(); }, 4000); }   // the pattern comes back on its own
  const noted = P.noted, rank = new Map(noted.map((n, r) => [n.k, r]));
  const geo = () => {
    const W = chart.clientWidth || 358, dS = Math.min(16, W / Math.max(1, P.nights.length)), sS = Math.min(16, W / Math.max(1, noted.length));
    return { W, dS, sS, dx: (i) => i * dS + dS / 2, sx: (r) => r * sS + sS / 2 };
  };
  function update() {
    const g = geo(), byH = sleepView === "hours", showBand = byH && ["up", "range", "down"].includes(P.kind);
    cols.forEach(({ n, b, idx }) => {
      const now = n.m == null, r = rank.get(n.k), slot = byH ? g.sS : g.dS, cx = byH ? (now ? g.W - g.sS / 2 : g.sx(r)) : g.dx(idx);
      b.style.left = `${Math.round(cx - slot / 2)}px`; b.style.width = `${Math.max(12, Math.round(slot))}px`;
      b.style.opacity = now && byH ? "0" : "1"; b.style.transitionDelay = `${((byH ? r : idx) || 0) * 0.015}s`;
      b.classList.toggle("on", sleepSel === n.k); b.tabIndex = now && byH ? -1 : 0;
    });
    chart.classList.toggle("picking", sleepSel != null);
    chart.setAttribute("aria-labelledby", "slp-" + sleepView);
    const inB = noted.map((n, r) => ({ n, r })).filter((x) => inSleepBand(P, x.n.h));
    band.style.opacity = bandL.style.opacity = showBand && inB.length ? "1" : "0";
    if (inB.length) {
      const L = Math.round(inB[0].r * g.sS), Wd = Math.max(28, Math.round(inB.length * g.sS));
      Object.assign(band.style, { left: L + "px", width: Wd + "px" }); Object.assign(bandL.style, { left: L + "px", width: Wd + "px" });
      bandL.textContent = P.kind === "up" ? `${P.lo}h+` : P.kind === "down" ? `Under ${P.hi}h` : `${P.lo}–${P.hi}h`;
    }
    sevenL.style.opacity = byH ? "0" : "1";
    // Labels under the chart: hours when sorted, dates (every 7th night from the newest) when not. Never overlapping.
    let T;
    if (byH) T = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((hr) => ({ hr, r: noted.findIndex((n) => n.h >= hr) })).filter((t) => t.r >= 0 && noted[t.r].h < t.hr + 1)
      .map((t) => ({ l: g.sx(t.r), text: t.hr + "h", inb: showBand && t.hr >= P.lo && t.hr <= Math.min(P.hi, 12) }));
    else T = P.nights.map((n, i) => ({ n, i })).filter((x) => (P.nights.length - 1 - x.i) % 7 === 0).map((x) => ({ l: g.dx(x.i), text: `${keyDate(x.n.k).getDate()} ${MONTH[keyDate(x.n.k).getMonth()]}` }));
    T = T.filter((t, i) => !T.slice(0, i).some((u) => Math.abs(u.l - t.l) < 32));
    ticks.replaceChildren(...T.map((t) => h("span.slp-tick" + (t.inb ? ".in" : ""), { style: { left: Math.round(t.l) + "px" } }, t.text)));
    const n = sleepSel && P.nights.find((x) => x.k === sleepSel);
    read.classList.toggle("first", !n && !s.notes.sleepHint && P.kind !== "empty");
    if (n) read.replaceChildren(h("button", { "aria-label": `Open ${dayTitle(n.k)}`, onclick: () => { log("sleep_day_open"); openDay(n.k); } },
      h("span.dot", { style: { background: MOOD_COL[n.m] } }), h("span", null, h("b", { style: { fontWeight: "600" } }, dayLabel(n.k)), ` · ${hw(n.h)} · `, h("b", { style: { color: MOOD_COL[n.m], fontWeight: "600" } }, MOODS[n.m])), h("span.chev", { "aria-hidden": "true" }, "›")));
    else if (P.kind === "empty") read.replaceChildren();
    else if (!s.notes.sleepHint) read.replaceChildren(h("span", null, "Each column is a night. Taller is more sleep.", h("br"), "Slide across to see each one."));
    else read.replaceChildren(h("span", null, "Last 4 weeks · slide across to see each night"));
  }
  // Slide a finger across: the line follows the night under it. Up and down still scroll the page.
  const at = (e) => {
    const g = geo(), r = touch.getBoundingClientRect(), x = (e.clientX - r.left) * g.W / (r.width || g.W);
    if (sleepView === "hours") return noted.length ? noted[Math.max(0, Math.min(noted.length - 1, Math.floor(x / g.sS)))].k : null;
    const n = P.nights[Math.max(0, Math.min(P.nights.length - 1, Math.floor(x / g.dS)))];
    return n && n.m != null ? n.k : sleepSel;
  };
  let drag = null;
  touch.addEventListener("pointerdown", (e) => { clearTimeout(sleepT); drag = { x: e.clientX, moved: false, start: sleepSel }; try { touch.setPointerCapture(e.pointerId); } catch { /* ok */ } firstDone(); const k = at(e); if (k !== sleepSel) { sleepSel = k; update(); } });
  touch.addEventListener("pointermove", (e) => { if (!drag) return; if (Math.abs(e.clientX - drag.x) > 4 && !drag.moved) { drag.moved = true; if (!sleepSlid) { sleepSlid = true; log("sleep_slide"); } } const k = at(e); if (k !== sleepSel) { sleepSel = k; update(); } });
  const end = (e) => { const d = drag; drag = null; if (!d) return; if (!d.moved && d.start === sleepSel && e.type === "pointerup") { sleepSel = null; update(); return; } later(); };
  touch.addEventListener("pointerup", end); touch.addEventListener("pointercancel", end);
  requestAnimationFrame(update); update();
  return card;
}

// C: mood and what you did, one row per pillar: a soft bar from lowest to highest mood, a dot at the middle
function secPillars(s) {
  const { rows, best } = pillarRows(s.days, PILLAR_COL);
  const card = h("div.card", { style: { gap: "12px" } }, h("h3", null, "Mood and what you did"));
  if (!rows.length) { card.append(h("p.sub", null, "Once daily cards are in, this shows how days with each part of your life felt.")); return card; }
  card.append(best ? h("p.lead", null, "Days with ", h("span", { style: { color: best.col || "#a9b9d6", fontWeight: "600" } }, best.name), " often felt ", coloured(best.top), ".")
    : h("p.lead", null, "Your first week so far."));
  const pct = (m) => 4 + m / 6 * 92;
  rows.forEach((r) => {
    const dashed = r.n < SOLID, c = MOOD_COL[Math.round(r.av)];
    const plot = h("div", { style: { position: "relative", height: "44px", flexGrow: "1" } },
      h("span", { style: { position: "absolute", left: "0", right: "0", top: "22px", height: "1px", background: "rgba(239,237,233,0.08)" } }),
      h("span", { style: { position: "absolute", top: "17px", height: "10px", borderRadius: "5px", left: `calc(${pct(r.lo)}% - 5px)`, width: `calc(${pct(r.hi) - pct(r.lo)}% + 10px)`,
        ...(dashed ? { border: `1.5px dashed ${c}`, opacity: "0.8" } : { background: `linear-gradient(90deg, ${MOOD_COL[r.lo]}, ${MOOD_COL[r.hi]})`, opacity: "0.45" }) } }),
      h("span", { style: { position: "absolute", top: "14px", width: "16px", height: "16px", borderRadius: "8px", left: `calc(${pct(r.av)}% - 8px)`,
        ...(dashed ? { border: `2px solid ${c}`, background: "#1d1e22" } : { border: "2px solid #1d1e22", background: c }) } }));
    card.append(h("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, "aria-label": `${r.name}: ${r.n} days, mostly ${moodWord(r.top)}${dashed ? ", still learning" : ""}` },
      h("div.col", { style: { width: "108px", flexShrink: "0", gap: "2px" } },
        h("span", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" } }, h("span.sq", { style: r.col ? { background: r.col } : { border: "1.5px solid #a9b9d6" } }), r.name),
        h("span", { style: { fontSize: "11px", color: "#a9a59d", paddingLeft: "20px" } }, `${r.n} ${r.n === 1 ? "day" : "days"}${dashed ? " · still learning" : ""}`)), plot));
  });
  card.append(h("div", { style: { display: "flex", gap: "8px" } }, h("span", { style: { width: "108px", flexShrink: "0" } }),
    h("div", { style: { position: "relative", flexGrow: "1", height: "16px" } }, [[0, "Awful"], [3, "Okay"], [6, "Great"]].map(([m, l]) =>
      h("span", { style: { position: "absolute", left: `${pct(m)}%`, transform: "translateX(-50%)", fontSize: "11px", color: "#a9a59d" } }, l)))));
  return card;
}

// D: what seems to help you. Always at least three lines; research fills the gaps early on.
function secHelps(s) {
  const pills = [...new Set(Object.values(s.days).flatMap((d) => d.pil || []))];
  const items = helps(s.days, s.hidden, pills);
  if (!helpsSeen) { helpsSeen = true; log("helps_seen", items.map((it) => String(it.id).slice(0, 40))); }
  const card = h("div.card.helps-card", { style: { gap: "4px" } }, h("h3", { style: { paddingBottom: "4px" } }, "What seems to help you"));
  items.forEach((it) => {
    const hide = h("button", { style: { alignSelf: "flex-start", minHeight: "44px", color: "#8d8981", fontSize: "13px" }, onclick: () => { s.hidden[it.id] = true; s.notes.hid = true; store.save(); redraw(); log("help_hide", String(it.id).slice(0, 60)); } }, "That's not it");
    if (it.research) {
      card.append(h("div.help", null, h("span.tag-gold", null, "From research · your own pattern shows here in a few days"), h("p.lead", null, ...it.text()), hide));
      return;
    }
    const [a, b] = it.text("");
    card.append(h("div.help", null, h("p.lead", null, a, coloured(it.top), b),
      h("div", { style: { display: "flex", justifyContent: "flex-end" } }, h("span", { style: { width: "64px", textAlign: "right", fontSize: "11px", color: "#8d8981" } }, "Good days")),
      it.rows.map(([l, ms]) => { const g = goodCount(ms), p = Math.round(g / ms.length * 100);
        return h("div.prow", null, h("span.l", null, l), h("span.bar", { style: { background: `linear-gradient(90deg, #7ab57a ${p}%, rgba(239,237,233,0.10) ${p}%)` } }), h("span.c", null, `${g} of ${ms.length}`)); }),
      hide));
  });
  if (s.notes.hid) card.append(h("span.sub", { style: { fontSize: "13px", paddingTop: "8px" } }, "Got it. We won't suggest that again."));
  return card;
}

// ---------- Arrange your view: drag rows, applies on Done, tap outside cancels ----------
function arrange() {
  const s = store.get(); let draft = s.order.slice();
  openSheet((panel, close) => {
    const list = h("div.col", { style: { gap: "8px" } });
    const RH = 60;
    const draw = () => {
      list.replaceChildren(...draft.map((k) => {
        const row = h("div.arrange-row", { "data-k": k }, h("span", null, NAME[k]), h("span.grip", { "aria-hidden": "true" }, "≡"));
        // Move a row by its ≡ handle; pulling anywhere else on the card closes it.
        const grip = row.querySelector(".grip");
        let y0 = null, dy = 0;
        grip.addEventListener("pointerdown", (e) => { y0 = e.clientY; dy = 0; row.classList.add("drag"); try { grip.setPointerCapture(e.pointerId); } catch { /* ok */ } });
        grip.addEventListener("pointermove", (e) => {
          if (y0 == null) return; dy = e.clientY - y0;
          const i = draft.indexOf(k);
          if (dy > RH / 2 && i < draft.length - 1) { [draft[i], draft[i + 1]] = [draft[i + 1], draft[i]]; y0 += RH; dy -= RH; reorder(); }
          else if (dy < -RH / 2 && i > 0) { [draft[i], draft[i - 1]] = [draft[i - 1], draft[i]]; y0 -= RH; dy += RH; reorder(); }
          row.style.transform = `translateY(${dy}px) scale(1.02)`;
        });
        const end = () => { y0 = null; row.classList.remove("drag"); row.style.transform = ""; };
        grip.addEventListener("pointerup", end); grip.addEventListener("pointercancel", end);
        return row;
      }));
    };
    const reorder = () => draft.forEach((k) => list.append(list.querySelector(`[data-k="${k}"]`)));
    draw();
    panel.append(h("div.col", { style: { gap: "4px" } }, h("h2", null, "Arrange your view"), h("span.sub", null, "Drag ≡ to put what matters most to you at the top.")), list,
      h("button.btn-main", { onclick: () => { s.order = draft.slice(); store.save(); close("done"); redraw(); log("arrange", draft.join("")); } }, "Done"));
  }, { label: "Arrange your view" });
}

// ---------- Tap a day ----------
// The day's photo, small, under "Today's card". Tapping it opens the photo.
const dayPhoto = (k) => h("button.day-photo", { "aria-label": "Open the photo", onclick: () => openViewer(k) }, img(k, "thumb"));
const REST_LINE = ["Didn't feel rested", "Felt a little rested", "Felt okay", "Felt well rested", "Felt very well rested"];
function openDay(k) {
  log("day_tap");
  openSheet((panel) => {
    const body = h("div.col", { style: { gap: "16px" } });
    const draw = () => {
      const d = store.get().days[k] || {};
      const nav = h("div", { style: { display: "flex", gap: "8px" } },
        h("button.btn-soft", { style: { flex: "1" }, onclick: () => { k = addDays(k, -1); draw(); } }, "‹ Day before"),
        h("button.btn-soft", { style: { flex: "1" }, disabled: k >= dayKey(), "aria-disabled": String(k >= dayKey()), onclick: () => { if (k < dayKey()) { k = addDays(k, 1); draw(); } } }, "Next day ›"));
      const parts = [h("div.col", { style: { gap: "4px" } }, h("h2", null, dayTitle(k)), d.mood != null ? h("span", { style: { fontSize: "17px", fontWeight: "600", color: MOOD_COL[d.mood] } }, MOODS[d.mood]) : null)];
      if (d.mood == null && !d.sleep) parts.push(h("p", { style: { color: "#cfcac1" } }, "You didn't note this day. That's okay."));
      if (d.feel && d.feel.length) parts.push(h("div.col", { style: { gap: "8px" } }, h("span.note", { style: { textAlign: "left" } }, "You felt"), h("div.pills", null, d.feel.map((f) => h("span.chip", null, f)))));
      if (d.rest) parts.push(h("div.col", { style: { gap: "8px" } }, h("span.note", { style: { textAlign: "left" } }, "You did"), h("span.chip", { style: { alignSelf: "flex-start" } }, "No card today, on purpose")));
      else if (d.card && d.card.id && cardOf(d.card.id)) { const c = cardOf(d.card.id); parts.push(h("div.col", { style: { gap: "8px" } }, h("span.note", { style: { textAlign: "left" } }, "Today's card"),
        d.ph ? dayPhoto(k) : null,
        h("span", null, c.text), d.card.how != null ? h("span", { style: { fontSize: "15px", color: "#cfcac1" } }, d.card.felt && d.card.felt.length ? d.card.felt.join(", ") : HOW[d.card.how]) : null,
        d.pil && d.pil.length ? h("div.pills", null, d.pil.map((p) => h("span.chip", null, h("span.sq", { style: { background: PILLAR_COL[p] || "#a9a59d" } }), p))) : null)); }
      else if (d.pil && d.pil.length) parts.push(h("div.col", { style: { gap: "8px" } }, h("span.note", { style: { textAlign: "left" } }, "You gave time to"), h("div.pills", null, d.pil.map((p) => h("span.chip", null, h("span.sq", { style: { background: PILLAR_COL[p] || "#a9a59d" } }), p)))));
      const made = (d.made || []).map((id) => ownCard(id)).filter(Boolean);   // cards made that evening (alex 2026-11-17)
      if (made.length) parts.push(h("div.col", { style: { gap: "8px" } }, h("span.note", { style: { textAlign: "left" } }, made.length > 1 ? "Cards you made" : "A card you made"),
        ...made.map((o) => h("div.col", { style: { gap: "4px" } }, h("span", null, o.text),
          o.felt && o.felt.length ? h("span", { style: { fontSize: "15px", color: "#cfcac1" } }, o.felt.join(", ")) : null,
          h("span.chip", { style: { alignSelf: "flex-start" } }, h("span.sq", { style: { background: PILLAR_COL[o.pillar] || "#a9a59d" } }), o.pillar)))));
      if (d.sleep) parts.push(h("div.col", { style: { gap: "4px" } }, h("span.note", { style: { textAlign: "left" } }, "The night before"),
        h("span", null, `Slept ${hoursWords(sleepMins(d.sleep))}, ${clock12(d.sleep.bed)} to ${clock12(d.sleep.wake)}`),
        h("span", { style: { fontSize: "15px", color: "#cfcac1" } }, REST_LINE[d.sleep.rested]),
        d.sleep.tags && d.sleep.tags.length ? h("span", { style: { fontSize: "15px", color: "#cfcac1" } }, d.sleep.tags.join(" · ")) : null));
      body.replaceChildren(...parts, nav);
    };
    draw();
    panel.append(body);
  }, { label: "A day" });
}
