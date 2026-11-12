// The morning sleep check-in and the evening mood + feelings check-in.
// Transition: the sun stays where it is and grows a little; home fades away; each step's words fade through.
import { h, dayKey, keyDate, clock12, hoursWords, MOODS, MOOD_COL, LIFELINE } from "./util.js";
import * as store from "./store.js";
import { SLEEP_TAGS, SLEEP_MORE, RESTED, band, firstSix, nearestOrder, rankRecent } from "./words.js";
import { openSheet, pillPicker } from "./ui.js";
import { sync as syncNotify } from "./notify.js";
import { log } from "./tester.js";

const flow = () => document.getElementById("flow");
const dayNum = (k) => Math.floor(keyDate(k).getTime() / 864e5);
let current = null, finish = null;
// Tester mode: which check-in is open, which step, when it started, how times were set.
let track = null;
const at = (step) => { if (track) track.step = step; };

function show(step) {
  const old = current; current = step;
  step.querySelectorAll(".rise").forEach((el, i) => el.style.setProperty("--i", i));
  if (old) { old.classList.remove("in"); old.classList.add("out"); setTimeout(() => old.remove(), 300); }
  flow().append(step);
  requestAnimationFrame(() => requestAnimationFrame(() => step.classList.add("in")));
  const f = step.querySelector("[data-focus]"); if (f) setTimeout(() => f.focus({ preventScroll: true }), 400);
}
function close(saved) {
  document.body.classList.remove("in-flow");
  document.documentElement.style.removeProperty("--glow");
  if (current) { current.classList.remove("in"); current.classList.add("out"); const c = current; setTimeout(() => c.remove(), 300); current = null; }
  if (saved) syncNotify();
  if (track) { log(track.kind + (saved ? "_done" : "_quit"), saved ? (track.kind === "am" ? { secs: Math.round((Date.now() - track.t0) / 1000), set: track.set || "none" } : { secs: Math.round((Date.now() - track.t0) / 1000) }) : track.step); track = null; }
  const f = finish; finish = null; f && f(saved);
}
function step(head, body, foot) {
  return h("section.step", { "aria-live": "polite" }, h("div.step-head.rise", null, ...head), h("div.step-body", null, ...body), h("div.col.rise", { style: { gap: "4px" } }, ...foot));
}
const where = (t) => h("span.where", null, t);
const spacer = () => h("span", { style: { width: "44px" } });
const mainBtn = (label, ok, onclick) => {
  const b = h("button.btn-main", { "aria-disabled": ok ? "false" : "true", onclick: () => { if (b.getAttribute("aria-disabled") !== "true") onclick(); } }, label);
  return b;
};

// ---------------- Morning: last night's sleep ----------------
export function morning(onDone) {
  finish = onDone;
  track = { kind: "am", t0: Date.now(), step: "arc" }; log("am_start");
  const howSet = (w) => { track && (track.set = !track.set || track.set === w ? w : "both"); };
  const s = store.get(), k = dayKey(), had = s.days[k] && s.days[k].sleep;
  const prev = Object.keys(s.days).sort().reverse().map((x) => s.days[x].sleep).find(Boolean);
  const st = { bed: had ? had.bed : prev ? prev.bed : 23 * 60, wake: had ? had.wake : prev ? prev.wake : 6 * 60 + 30, rested: had ? had.rested : null, tags: new Set(had ? had.tags : []) };
  document.body.classList.add("in-flow");

  // The arc: 6pm on the left, 3am at the top, noon on the right. Drag the moon (bed) and sun (wake), 5 minutes a step.
  const off = (m) => ((m - 1080) + 1440) % 1440, fromOff = (o) => (1080 + o) % 1440;
  const pos = (m) => { const a = Math.PI * off(m) / 1080; return { x: 175 - 150 * Math.cos(a), y: 185 - 150 * Math.sin(a) }; };
  const fit = (which, m) => { let o = off(m); if (o > 1080) o = o > 1260 ? 0 : 1080;
    if (which === "bed") o = Math.min(o, off(st.wake) - 30); else o = Math.max(o, off(st.bed) + 30);
    return fromOff(Math.max(0, Math.min(1080, o))); };
  const NS = (t, a) => h(t, a);
  const arc = NS("path", { fill: "none", stroke: "#e3c486", "stroke-width": "10", "stroke-linecap": "round" });
  const bHalo = NS("circle", { r: "20", fill: "rgba(217,214,238,0.18)" }), bDot = NS("circle", { r: "13", fill: "#d9d6ee" }), bBite = NS("circle", { r: "11", fill: "#1b1c20" });
  const wHalo = NS("circle", { r: "18", fill: "rgba(242,192,143,0.35)" }), wDot = NS("circle", { r: "12", fill: "#f2c08f" });
  const svg = h("svg", { viewBox: "0 0 350 200", role: "img" },
    NS("path", { d: "M 25 185 A 150 150 0 0 1 325 185", fill: "none", stroke: "rgba(239,237,233,0.12)", "stroke-width": "10", "stroke-linecap": "round" }),
    arc, bHalo, bDot, bBite, wHalo, wDot);
  const hrs = h("div.arc-hours");
  const tBed = h("b"), tWake = h("b");
  const toVal = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const iBed = h("input", { type: "time", step: "300", "aria-label": "Went to sleep" }), iWake = h("input", { type: "time", step: "300", "aria-label": "Woke up" });
  const draw = () => {
    const b = pos(st.bed), w = pos(st.wake), large = off(st.wake) - off(st.bed) > 1080 ? 1 : 0;
    arc.setAttribute("d", `M ${b.x.toFixed(1)} ${b.y.toFixed(1)} A 150 150 0 ${large} 1 ${w.x.toFixed(1)} ${w.y.toFixed(1)}`);
    [bHalo, bDot].forEach((c) => { c.setAttribute("cx", b.x); c.setAttribute("cy", b.y); });
    bBite.setAttribute("cx", b.x + 5); bBite.setAttribute("cy", b.y - 4);
    [wHalo, wDot].forEach((c) => { c.setAttribute("cx", w.x); c.setAttribute("cy", w.y); });
    const mins = (st.wake - st.bed + 1440) % 1440;
    hrs.textContent = hoursWords(mins);
    tBed.textContent = clock12(st.bed); tWake.textContent = clock12(st.wake);
    iBed.value = toVal(st.bed); iWake.value = toVal(st.wake);
    svg.setAttribute("aria-label", `Slept from ${clock12(st.bed)} to ${clock12(st.wake)}, ${hoursWords(mins)}`);
  };
  let dragging = null;
  const pt = (e) => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left) * 350 / r.width, y: (e.clientY - r.top) * 200 / r.height }; };
  const toMin = (p) => { let a = Math.atan2(185 - p.y, 175 - p.x); if (a < 0) a = p.x < 175 ? 0 : Math.PI; return fromOff(Math.round(a / Math.PI * 1080 / 5) * 5); };
  svg.addEventListener("pointerdown", (e) => {
    const p = pt(e), b = pos(st.bed), w = pos(st.wake), db = Math.hypot(p.x - b.x, p.y - b.y), dw = Math.hypot(p.x - w.x, p.y - w.y);
    if (Math.min(db, dw) > 48) return;
    dragging = db < dw ? "bed" : "wake"; try { svg.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    (dragging === "bed" ? bHalo : wHalo).setAttribute("r", "26");
    st[dragging] = fit(dragging, toMin(p)); draw(); e.preventDefault(); howSet("drag");
  });
  svg.addEventListener("pointermove", (e) => { if (!dragging) return; st[dragging] = fit(dragging, toMin(pt(e))); draw(); });
  const up = () => { if (!dragging) return; bHalo.setAttribute("r", "20"); wHalo.setAttribute("r", "18"); dragging = null; };
  svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  const fromInput = (which, inp) => { const [a, b] = inp.value.split(":").map(Number); if (isNaN(a)) return; st[which] = fit(which, a * 60 + Math.round(b / 5) * 5); draw(); };
  iBed.addEventListener("change", () => { howSet("wheel"); fromInput("bed", iBed); }); iWake.addEventListener("change", () => { howSet("wheel"); fromInput("wake", iWake); });
  draw();

  const done = mainBtn("Done", st.rested != null, () => {
    const s2 = store.get(), d = store.day(k), n = dayNum(k);
    d.sleep = { bed: st.bed, wake: st.wake, rested: st.rested, tags: [...st.tags] };
    st.tags.forEach((t) => (s2.sleepTags.last[t] = n));
    if (!s2.started) s2.started = k;
    store.save(); close(true);
  });
  const rested = h("div.pills", { style: { justifyContent: "center" }, role: "radiogroup", "aria-label": "How rested do you feel?" },
    RESTED.map((label, i) => h("button.pill", { role: "radio", "aria-checked": String(st.rested === i), "aria-pressed": String(st.rested === i), onclick: (e) => {
      st.rested = i; at("rested"); rested.querySelectorAll(".pill").forEach((p, j) => { p.setAttribute("aria-pressed", String(j === i)); p.setAttribute("aria-checked", String(j === i)); });
      done.setAttribute("aria-disabled", "false");
    } }, label)));
  const moreBtn = h("button.btn-quiet", { onclick: () => extras() });
  const moreLabel = () => (moreBtn.textContent = st.tags.size ? `About last night · ${st.tags.size} noted` : "Add more about last night");
  moreLabel();
  const extras = () => { at("extras"); log("am_extras"); return openSheet((panel, closeSheet) => {
    const s2 = store.get(), base = SLEEP_TAGS.concat(SLEEP_MORE, s2.sleepTags.own.filter((w) => !SLEEP_TAGS.includes(w) && !SLEEP_MORE.includes(w)));
    const { main, more } = rankRecent(base, s2.sleepTags.last);
    st.tags.forEach((t) => { if (!main.includes(t)) { main.push(t); more.splice(more.indexOf(t), 1); } });
    const pick = pillPicker({ main, more, picked: st.tags,
      onToggle: (w) => { st.tags.has(w) ? st.tags.delete(w) : st.tags.add(w); },
      onAdd: (w) => { if (!s2.sleepTags.own.includes(w) && !base.includes(w)) s2.sleepTags.own.push(w); if (!main.includes(w)) main.push(w); const i = more.indexOf(w); if (i >= 0) more.splice(i, 1); st.tags.add(w); store.save(); },
      noteOnce: () => (s2.notes.sleepOwn ? false : (s2.notes.sleepOwn = true, store.save(), true)) });
    panel.append(h("div.col", { style: { gap: "4px" } }, h("h2", null, "About last night"), h("span.sub", null, "Tap any that fit.")), pick.el,
      h("button.btn-main", { onclick: () => closeSheet("done") }, "Done"));
  }, { label: "About last night", onClose: moreLabel }); };

  show(step(
    [h("button.btn-text", { onclick: () => close(false) }, "Not now"), where("Start of your day"), spacer()],
    [h("h1.q.rise", null, "Last night"), h("div.arc-wrap.rise", null, svg, hrs),
      h("div.times.rise", null, h("label.time", null, h("span", null, "Went to sleep"), tBed, iBed), h("label.time", null, h("span", null, "Woke up"), tWake, iWake)),
      h("div.col.rise", { style: { gap: "8px" } }, h("span.q2", null, "How rested do you feel?"), rested)],
    [moreBtn, done, LIFELINE()]));
}

// ---------------- Evening: mood, then feelings ----------------
const RGB = MOOD_COL.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
const mix = (v) => { const f = v / 100 * 6, i = Math.min(5, Math.floor(f)), t = f - i; return RGB[i].map((c, j) => Math.round(c + (RGB[i + 1][j] - c) * t)); };
const toMood = (v) => Math.min(6, Math.floor(v / 100 * 7));

export function evening(onDone) {
  finish = onDone;
  track = { kind: "pm", t0: Date.now(), step: "mood" }; log("pm_start");
  const s = store.get(), k = dayKey(), had = s.days[k] || {};
  const st = { v: had.mood != null ? had.mood * 100 / 7 + 7 : 50, touched: had.mood != null, feel: new Set(had.feel || []), added: [] };
  document.body.classList.add("in-flow");
  const tint = () => document.documentElement.style.setProperty("--glow", st.touched ? mix(st.v).join(" ") : "242 192 143");

  const one = () => {
    at("mood");
    const word = h("div.mood-word", { "aria-live": "polite" });
    const next = mainBtn(st.touched ? "Next" : "Slide to answer", st.touched, two);
    const range = h("input", { type: "range", min: "0", max: "100", value: String(Math.round(st.v)), "aria-label": "How was today?", "data-focus": "" });
    const upd = () => { const m = toMood(st.v); word.textContent = st.touched ? MOODS[m] : " "; word.style.color = `rgb(${mix(st.v).join(" ")})`; range.setAttribute("aria-valuetext", MOODS[m]); tint(); };
    range.addEventListener("input", () => { st.v = +range.value; st.touched = true; next.textContent = "Next"; next.setAttribute("aria-disabled", "false"); upd(); });
    upd();
    show(step(
      [h("button.btn-text", { onclick: () => close(false) }, "Not now"), where("End of your day · 1 of 2"), spacer()],
      [h("h1.q.rise", null, "How was today?"), h("div.rise", null, word), h("div.col.rise", { style: { gap: "8px" } }, range, h("div.ends", null, h("span", null, "Awful"), h("span", null, "Great")))],
      [next, LIFELINE()]));
  };
  const two = () => {
    const m = toMood(st.v), b = band(m), s2 = store.get();
    at("feelings"); log("pm_feelings", m);
    const L = (s2.feel.last[b] = s2.feel.last[b] || {});
    const order = [...new Set(firstSix(b).concat(s2.feel.own, nearestOrder(b)))];
    const ranked = order.slice().sort((x, y) => ((L[y] || 0) - (L[x] || 0)) || order.indexOf(x) - order.indexOf(y));
    const main = ranked.slice(0, 6).sort((x, y) => order.indexOf(x) - order.indexOf(y));
    st.feel.forEach((w) => { if (w !== "Not sure" && !main.includes(w)) main.push(w); });
    const more = ranked.filter((x) => !main.includes(x));
    const done = mainBtn("Done", st.feel.size > 0, save);
    const pick = pillPicker({ main, more, picked: st.feel, notSure: "Not sure",
      onToggle: (w) => { st.feel.has(w) ? st.feel.delete(w) : st.feel.add(w); done.setAttribute("aria-disabled", st.feel.size ? "false" : "true"); },
      onAdd: (w) => { w = w.toLowerCase(); if (!s2.feel.own.includes(w) && !order.includes(w)) s2.feel.own.push(w); if (!main.includes(w)) main.push(w); const i = more.indexOf(w); if (i >= 0) more.splice(i, 1); st.feel.add(w); done.setAttribute("aria-disabled", "false"); store.save(); },
      noteOnce: () => (s2.notes.feelOwn ? false : (s2.notes.feelOwn = true, store.save(), true)) });
    show(step(
      [h("button.btn-text", { onclick: one }, "‹ Back"), where("End of your day · 2 of 2"), spacer()],
      [h("span.q2.rise", { style: { color: MOOD_COL[m], fontWeight: "600" } }, MOODS[m]), h("h1.q.rise", null, "What were you feeling?"), h("div.rise", null, pick.el)],
      [done, LIFELINE()]));
  };
  const save = () => {
    const s2 = store.get(), d = store.day(k), m = toMood(st.v), b = band(m), n = dayNum(k);
    d.mood = m; d.feel = [...st.feel];
    const L = (s2.feel.last[b] = s2.feel.last[b] || {});
    st.feel.forEach((w) => { if (w !== "Not sure") L[w] = n; });
    if (!s2.started) s2.started = k;
    store.save(); close(true);
  };
  tint(); one();
}
