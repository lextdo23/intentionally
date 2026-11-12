// Your days: one scrolling page. Your moods, Mood and sleep, Mood and what you did, What seems to help you.
// Slides in from the right like iPhone Settings; "‹ Today" or a swipe in from the left edge goes back.
import { h, MOODS, MOOD_COL, moodWord, dayKey, addDays, dayTitle, clock12, hoursWords, sleepMins, smoothPath, reduceMotion, LIFELINE } from "./util.js";
import * as store from "./store.js";
import { moodSeries, mostlyWord, sleepMood, pillarRows, helps, goodCount, SOLID } from "./stats.js";
import { RESTED } from "./words.js";
import { openSheet, spring } from "./ui.js";

export const PILLAR_COL = { Friends: "#d9b3a6", Move: "#a9c4b5", Rest: "#a9b9d6", "Work and study": "#cfc59b", "Play and create": "#c4b4c9", Family: "#d9b3a6", Food: "#cfc59b", Outdoors: "#a9c4b5" };
const NAME = { A: "Your moods", B: "Mood and sleep", C: "Mood and what you did", D: "What seems to help you" };
let view = "week", origin = null, onClosed = null;
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
  onClosed = closed; origin = fromEl;
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
    h("div.page-head", null, h("button.btn-text", { onclick: () => closeDays() }, "‹ Today"), h("button.btn-text", { onclick: arrange }, "Edit")),
    h("h1.big-title", null, "Your days"),
    h("div.sections", null, s.order.map((k) => ({ A: secMoods, B: secSleep, C: secPillars, D: secHelps }[k])(s))),
    LIFELINE())));
  const edge = h("div.edge", { "aria-hidden": "true" }); el.append(edge); edgeSwipe(edge);
}
const redraw = () => { const sc = root().querySelector(".scroll"), y = sc ? sc.scrollTop : 0; render(); root().querySelector(".scroll").scrollTop = y; };

// A: the mood line, Week / Month / Year
function secMoods(s) {
  const ser = moodSeries(s.days, view), have = ser.pts.filter((p) => p.m != null);
  const seg = h("div.seg", { role: "tablist" }, [["week", "Week"], ["month", "Month"], ["year", "Year"]].map(([v, l]) =>
    h("button", { role: "tab", "aria-selected": String(view === v), onclick: () => { view = v; redraw(); } }, l)));
  const top = mostlyWord(s.days, view);
  const head = top == null ? h("p.headline", null, view === "week" ? "Your moods show here after your first evening." : "Nothing noted here yet.")
    : h("p.headline", null, "Mostly ", coloured(top), ` ${ser.when}.`);
  const out = h("div.col", { style: { gap: "16px" } }, seg, head);
  if (!have.length) return out;
  const W = 334, L = 40, R = 334, n = ser.n, X = (i) => L + (i + 0.5) / n * (R - L), Y = (m) => 150 - m * 22.7;
  const P = ser.pts.map((p, i) => (p.m == null ? null : [X(i), Y(p.m), p.m]));
  const runs = []; let cur = []; P.forEach((p) => { if (p) cur.push(p); else { if (cur.length) runs.push(cur); cur = []; } }); if (cur.length) runs.push(cur);
  const hw = Math.max(3, (R - L) / n / 2);
  const area = runs.map((r) => (r.length > 1 ? `${smoothPath(r)} L ${r[r.length - 1][0].toFixed(1)} 164 L ${r[0][0].toFixed(1)} 164 Z` : `M ${(r[0][0] - hw).toFixed(1)} 164 Q ${r[0][0].toFixed(1)} ${r[0][1] - 6} ${(r[0][0] + hw).toFixed(1)} 164 Z`)).join(" ");
  let bridge = ""; for (let i = 1; i < P.length - 1; i++) if (!P[i] && P[i - 1] && P[i + 1]) bridge += `M ${P[i - 1][0].toFixed(1)} ${P[i - 1][1]} L ${P[i + 1][0].toFixed(1)} ${P[i + 1][1]} `;
  const dotR = n === 7 ? 5.5 : n === 30 ? 3.5 : 0;
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
  if (n !== 52) ser.pts.forEach((p, i) => chart.append(h("button.hit", { "aria-label": `${dayTitle(p.k)}${p.m != null ? ", " + MOODS[p.m] : ""}`, style: { left: `${(X(i) - (R - L) / n / 2) / W * 100}%`, width: `${(R - L) / n / W * 100}%` }, onclick: () => openDay(p.k) })));
  const ticks = h("div", { style: { position: "relative", height: "16px", marginLeft: `${L / W * 100}%` } }, ser.ticks.map((t) =>
    h("span.lab", { style: { position: "absolute", top: "0", left: `${(t.i + 0.5) / n * 100}%`, transform: "translateX(-50%)", fontSize: "11px", color: "#a9a59d", whiteSpace: "nowrap" } }, t.l)));
  out.append(h("div.card", { style: { padding: "16px 8px 12px" } }, h("h3", { style: { paddingLeft: "8px" } }, "Your moods"), chart, ticks));
  return out;
}

// B: mood and sleep, one dot per day
function secSleep(s) {
  const { N, best, line } = sleepMood(s.days);
  const card = h("div.card", null, h("h3", null, "Mood and sleep"));
  if (!best) { card.append(h("p.sub", null, N.length ? "A few more nights and evenings and this fills in." : "This fills in after a few mornings and evenings.")); if (N.length < 3) return card; }
  else card.append(h("p.lead", null, "You felt best after ", h("span", { style: { color: "#f2c08f", fontWeight: "600" } }, `${best[0]} hours`), " of sleep."));
  const W = 334, X0 = 4.5, X1 = 10.5, L = 80, R = 326, T = 14, step = 26;
  const X = (hr) => L + (Math.max(X0, Math.min(X1, hr)) - X0) / (X1 - X0) * (R - L), Y = (m) => T + (6 - m) * step;
  const seen = {};
  const dots = N.map((d) => { const k = Math.round(d.h * 4) + "_" + d.m, c = (seen[k] = (seen[k] || 0) + 1), o = c === 1 ? 0 : (c % 2 ? 1 : -1) * Math.ceil((c - 1) / 2) * 5;
    return h("circle", { cx: (X(d.h) + o).toFixed(1), cy: Y(d.m), r: "5", fill: MOOD_COL[d.m], stroke: "#1d1e22", "stroke-width": "1.5", opacity: "0.55" }); });
  const avgPath = line.length > 1 ? smoothPath(line.map(([x, y]) => [X(x), Y(y)])) : "";
  const svg = h("svg", { viewBox: `0 0 ${W} 210`, role: "img", "aria-label": "Each day as a dot: hours slept across, mood up" },
    best && h("rect", { x: X(Math.max(best[1], 4.5)).toFixed(1), y: "4", width: (X(Math.min(best[2], 10.5)) - X(Math.max(best[1], 4.5))).toFixed(1), height: 6 * step + 20, rx: "10", fill: "rgba(242,192,143,0.09)" }),
    MOODS.map((_, m) => h("line", { x1: "74", y1: Y(m), x2: "330", y2: Y(m), stroke: "rgba(239,237,233,0.06)" })),
    h("defs", null, h("linearGradient", { id: "avg2", x1: "0", y1: "14", x2: "0", y2: "170", gradientUnits: "userSpaceOnUse" }, h("stop", { offset: "0", "stop-color": "#56b56c" }), h("stop", { offset: "0.5", "stop-color": "#bdae8e" }), h("stop", { offset: "1", "stop-color": "#4a4fa8" }))),
    avgPath && h("path", { d: avgPath, fill: "none", stroke: "url(#avg2)", "stroke-width": "3", "stroke-linecap": "round", opacity: "0.9" }),
    dots,
    MOODS.map((w, m) => h("text", { x: "68", y: Y(m) + 4, "text-anchor": "end", fill: "#a9a59d", "font-size": "11" }, w)),
    [5, 6, 7, 8, 9, 10].map((hr) => { const inb = best && hr >= best[1] && hr <= Math.min(best[2], 10); return h("text", { x: X(hr), y: T + 6 * step + 26, "text-anchor": "middle", "font-size": "12", fill: inb ? "#f2c08f" : "#a9a59d", "font-weight": inb ? "600" : "400" }, hr + "h"); }));
  card.append(h("div.chart", null, svg), h("span.note", null, "Hours of sleep"));
  return card;
}

// C: mood and what you did, one row per pillar: a soft bar from lowest to highest mood, a dot at the middle
function secPillars(s) {
  const { rows, best } = pillarRows(s.days, PILLAR_COL);
  const card = h("div.card", { style: { gap: "12px" } }, h("h3", null, "Mood and what you did"));
  if (!rows.length) { card.append(h("p.sub", null, "Once daily cards are in, this shows how days with each part of your life felt.")); return card; }
  card.append(best ? h("p.lead", null, "Days with ", h("span", { style: { color: best.col || "#a9b9d6", fontWeight: "600" } }, best.name), " often felt ", coloured(best.top), ".")
    : h("p.lead", null, "Getting to know you. Here's how your days have felt so far."));
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
  const card = h("div.card", { style: { gap: "4px" } }, h("h3", { style: { paddingBottom: "4px" } }, "What seems to help you"));
  items.forEach((it) => {
    const hide = h("button", { style: { alignSelf: "flex-start", minHeight: "44px", color: "#8d8981", fontSize: "13px" }, onclick: () => { s.hidden[it.id] = true; s.notes.hid = true; store.save(); redraw(); } }, "That's not it");
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
      h("button.btn-main", { onclick: () => { s.order = draft.slice(); store.save(); close("done"); redraw(); } }, "Done"));
  }, { label: "Arrange your view" });
}

// ---------- Tap a day ----------
const REST_LINE = ["Didn't feel rested", "Felt a little rested", "Felt okay", "Felt well rested", "Felt very well rested"];
function openDay(k) {
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
      if (d.rest) parts.push(h("div.col", { style: { gap: "8px" } }, h("span.note", { style: { textAlign: "left" } }, "You did"), h("span.chip", { style: { alignSelf: "flex-start" } }, "A rest day")));
      else if (d.pil && d.pil.length) parts.push(h("div.col", { style: { gap: "8px" } }, h("span.note", { style: { textAlign: "left" } }, "You gave time to"), h("div.pills", null, d.pil.map((p) => h("span.chip", null, h("span.sq", { style: { background: PILLAR_COL[p] || "#a9a59d" } }), p)))));
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
