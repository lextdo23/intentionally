// The morning sleep check-in and the evening mood + feelings check-in.
// Transition: the sun stays where it is and grows a little; home fades away; each step's words fade through.
import { h, dayKey, keyDate, clock12, hoursWords, MOODS, CHART_COL, LIFELINE, reduceMotion } from "./util.js";
import * as store from "./store.js";
import { SLEEP_TAGS, SLEEP_MORE, RESTED, band, firstSix, nearestOrder, rankRecent } from "./words.js";
import { openSheet, pillPicker, roundBtn } from "./ui.js";
import { sync as syncNotify } from "./notify.js";
import { log } from "./tester.js";
import { howStep, NOT_DONE } from "./draw.js";
import { makeCard, ownArea } from "./own.js";
import { lastNote, markUsed } from "./sleep.js";
import { now } from "./clock.js";
import * as deck from "./deck.js";
import * as levels from "./levels.js";
import * as crumbs from "./crumbs.js";

// Starts a flow from somewhere else (the card draw from home): the sun stays, home steps back.
export function begin(onDone) { finish = onDone; track = null; document.body.classList.add("in-flow"); }

const flow = () => document.getElementById("flow");
const dayNum = (k) => Math.floor(keyDate(k).getTime() / 864e5);
let current = null, finish = null, arcs = 0;
// Tester mode: which check-in is open, which step, when it started, how times were set.
let track = null;
const at = (step) => { if (track) track.step = step; };

export function show(step) {
  const old = current; current = step;
  step.querySelectorAll(".rise").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 3)));
  if (old) { old.classList.remove("in"); old.classList.add("out"); setTimeout(() => old.remove(), 200); }
  flow().append(step);
  requestAnimationFrame(() => requestAnimationFrame(() => step.classList.add("in")));
  const f = step.querySelector("[data-focus]"); if (f) setTimeout(() => f.focus({ preventScroll: true }), 250);
}
let setT = 0;
export function close(saved) {
  // Leaving a check-in or the draw, the glow sinks back down below the screen as it fades (alex 2026-11-27), never drifts up.
  if (document.body.classList.contains("in-flow") && !reduceMotion()) { document.body.classList.add("sunset"); clearTimeout(setT); setT = setTimeout(() => document.body.classList.remove("sunset"), 1400); }
  document.body.classList.remove("in-flow");
  document.documentElement.style.removeProperty("--glow");
  if (current) { current.classList.remove("in"); current.classList.add("out"); const c = current; setTimeout(() => c.remove(), 300); current = null; }
  if (saved) syncNotify();
  if (track) { log(track.kind + (saved ? "_done" : "_quit"), saved ? (track.kind === "am" ? { secs: Math.round((Date.now() - track.t0) / 1000), set: track.set || "none" } : { secs: Math.round((Date.now() - track.t0) / 1000) }) : track.step); track = null; }
  const f = finish; finish = null; f && f(saved);
}
export function step(head, body, foot) {
  return h("section.step", { "aria-live": "polite" }, h("div.step-head.rise", null, ...head), h("div.step-body", null, ...body), h("div.col.rise", { style: { gap: "4px" } }, ...foot));
}
export const where = (t) => h("span.where", null, t);
export const spacer = () => h("span", { style: { width: "44px" } });
export const mainBtn = (label, ok, onclick) => {
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
  // Tapped "Going to sleep" last night: start the moon at that time and the sun at now (when the app was opened).
  const note = had ? null : lastNote(), r5 = (t) => { const d = new Date(t); return Math.round((d.getHours() * 60 + d.getMinutes()) / 5) * 5 % 1440; };
  let fromBtn = null;
  if (note) { st.bed = r5(note.at); st.wake = r5(now()); fromBtn = { bed: st.bed, wake: st.wake }; }
  document.body.classList.add("in-flow");

  // The arc: 6pm on the left, 3am at the top, noon on the right. Drag the moon (bed) and sun (wake), 5 minutes a step.
  const off = (m) => ((m - 1080) + 1440) % 1440, fromOff = (o) => (1080 + o) % 1440;
  const pos = (m) => { const a = Math.PI * off(m) / 1080; return { x: 175 - 150 * Math.cos(a), y: 185 - 150 * Math.sin(a) }; };
  const fit = (which, m) => { let o = off(m); if (o > 1080) o = o > 1260 ? 0 : 1080;
    if (which === "bed") o = Math.min(o, off(st.wake) - 30); else o = Math.max(o, off(st.bed) + 30);
    return fromOff(Math.max(0, Math.min(1080, o))); };
  const NS = (t, a) => h(t, a);
  // The bar runs between the moon (bed) and the sun (wake), into both. New look (alex 2026-11-24): marigold bar, and
  // the moon and sun drawn like little tokens, a flat face with a darker edge underneath (like today's card), a thin
  // highlight on top and a small shadow. The moon's bite is cut out, so the bar shows through it. Held = lifted a little.
  let dragging = null;
  const uid = "arc" + (++arcs);
  const arc = NS("path", { fill: "none", stroke: "#ffa51f", "stroke-width": "10", "stroke-linecap": "round" });
  const hl = (r) => h("path", { d: `M ${(-r * .72).toFixed(1)} ${(-r * .45).toFixed(1)} A ${r - 1.2} ${r - 1.2} 0 0 1 ${(r * .72).toFixed(1)} ${(-r * .45).toFixed(1)}`, fill: "none", stroke: "#fff", "stroke-opacity": ".6", "stroke-width": "1.2", "stroke-linecap": "round" });
  const token = (r, face, edge, mask) => {
    const body = h("g", mask ? { mask: `url(#${uid}-bite)` } : null, h("circle", { cy: "2.5", r: String(r), fill: edge }), h("circle", { r: String(r), fill: face }), hl(r));
    return h("g", null, h("g", { filter: `url(#${uid}-lift)` }, body));
  };
  const defs = h("defs", null,
    h("filter", { id: `${uid}-lift`, x: "-60%", y: "-60%", width: "220%", height: "240%" }, h("feDropShadow", { dx: "0", dy: "2", stdDeviation: "1.8", "flood-color": "#000", "flood-opacity": ".6" })),
    h("mask", { id: `${uid}-bite`, maskUnits: "userSpaceOnUse", x: "-30", y: "-30", width: "60", height: "60" },
      h("rect", { x: "-30", y: "-30", width: "60", height: "60", fill: "#fff" }), h("circle", { cx: "5", cy: "-4", r: "11", fill: "#000" })));
  const moon = token(13, "#d9d6ee", "#8f8bb0", true), sun = token(12, "#ffa51f", "#a85f06", false);
  const svg = h("svg", { viewBox: "0 0 350 200", role: "img" }, defs,
    h("path", { d: "M 25 185 A 150 150 0 0 1 325 185", fill: "none", stroke: "rgba(239,237,233,0.12)", "stroke-width": "10", "stroke-linecap": "round" }),
    arc, moon, sun);
  const hrs = h("div.arc-hours");
  const tBed = h("b"), tWake = h("b");
  const toVal = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const iBed = h("input", { type: "time", step: "300", "aria-label": "Went to sleep" }), iWake = h("input", { type: "time", step: "300", "aria-label": "Woke up" });
  const draw = () => {
    const b = pos(st.bed), w = pos(st.wake), large = off(st.wake) - off(st.bed) > 1080 ? 1 : 0;
    arc.setAttribute("d", `M ${b.x.toFixed(1)} ${b.y.toFixed(1)} A 150 150 0 ${large} 1 ${w.x.toFixed(1)} ${w.y.toFixed(1)}`);
    moon.setAttribute("transform", `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})${dragging === "bed" ? " scale(1.15)" : ""}`);
    sun.setAttribute("transform", `translate(${w.x.toFixed(1)} ${w.y.toFixed(1)})${dragging === "wake" ? " scale(1.15)" : ""}`);
    const mins = (st.wake - st.bed + 1440) % 1440;
    hrs.textContent = hoursWords(mins);
    tBed.textContent = clock12(st.bed); tWake.textContent = clock12(st.wake);
    iBed.value = toVal(st.bed); iWake.value = toVal(st.wake);
    svg.setAttribute("aria-label", `Slept from ${clock12(st.bed)} to ${clock12(st.wake)}, ${hoursWords(mins)}`);
  };
  const pt = (e) => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left) * 350 / r.width, y: (e.clientY - r.top) * 200 / r.height }; };
  const toMin = (p) => { let a = Math.atan2(185 - p.y, 175 - p.x); if (a < 0) a = p.x < 175 ? 0 : Math.PI; return fromOff(Math.round(a / Math.PI * 1080 / 5) * 5); };
  svg.addEventListener("pointerdown", (e) => {
    const p = pt(e), b = pos(st.bed), w = pos(st.wake), db = Math.hypot(p.x - b.x, p.y - b.y), dw = Math.hypot(p.x - w.x, p.y - w.y);
    if (Math.min(db, dw) > 48) return;
    dragging = db < dw ? "bed" : "wake"; try { svg.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    st[dragging] = fit(dragging, toMin(p)); draw(); e.preventDefault(); howSet("drag");
  });
  svg.addEventListener("pointermove", (e) => { if (!dragging) return; st[dragging] = fit(dragging, toMin(pt(e))); draw(); });
  const up = () => { if (!dragging) return; dragging = null; draw(); };
  svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  const fromInput = (which, inp) => { const [a, b] = inp.value.split(":").map(Number); if (isNaN(a)) return; st[which] = fit(which, a * 60 + Math.round(b / 5) * 5); draw(); };
  iBed.addEventListener("change", () => { howSet("wheel"); fromInput("bed", iBed); }); iWake.addEventListener("change", () => { howSet("wheel"); fromInput("wake", iWake); });
  if (fromBtn) { st.wake = fit("wake", st.wake); st.bed = fit("bed", st.bed); fromBtn = { bed: st.bed, wake: st.wake }; }
  draw();

  const done = mainBtn("Done", st.rested != null, () => {
    const s2 = store.get(), d = store.day(k), n = dayNum(k);
    // at: when the morning check-in was done, so the morning nudge can come at their usual time (js/morning.js).
    // Changing an old night later keeps its first time; a night first noted on a later day gets none.
    const at = d.sleep && d.sleep.at ? d.sleep.at : k === dayKey() ? now() : undefined;
    d.sleep = { bed: st.bed, wake: st.wake, rested: st.rested, tags: [...st.tags] };
    if (at) d.sleep.at = at;
    st.tags.forEach((t) => (s2.sleepTags.last[t] = n));
    if (!s2.started) s2.started = k;
    if (fromBtn) { markUsed(); log("sleep_prefill", { moved: st.bed !== fromBtn.bed || st.wake !== fromBtn.wake }); }
    store.save();
    // Back home for a moment ("That's last night."); the card is its own step, drawn from home.
    close(true);
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
    [roundBtn("close", "Not now", () => close(false)), where("Start your day"), spacer()],
    [h("h1.q.rise", null, "Last night"), h("div.arc-wrap.rise", null, svg, hrs),
      h("div.times.rise", null, h("label.time", null, h("span", null, "Went to sleep"), tBed, iBed), h("label.time", null, h("span", null, "Woke up"), tWake, iWake)),
      fromBtn ? h("p.from-btn.rise", null, "From your sleep button. Move them if they're off.") : null,
      h("div.col.rise", { style: { gap: "8px" } }, h("span.q2", null, "How rested do you feel?"), rested)],
    [moreBtn, done, LIFELINE()]));
}

// ---------------- Evening: mood, then feelings ----------------
const RGB = CHART_COL.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
const mix = (v) => { const f = v / 100 * 6, i = Math.min(5, Math.floor(f)), t = f - i; return RGB[i].map((c, j) => Math.round(c + (RGB[i + 1][j] - c) * t)); };
const toMood = (v) => Math.min(6, Math.floor(v / 100 * 7));

export function evening(onDone) {
  finish = onDone;
  track = { kind: "pm", t0: Date.now(), step: "mood" }; log("pm_start");
  const s = store.get(), k = dayKey(), had = s.days[k] || {};
  const st = { v: had.mood != null ? had.mood * 100 / 7 + 7 : 50, touched: had.mood != null, feel: new Set(had.feel || []), added: [], ans: had.card ? { how: had.card.how, felt: had.card.felt } : {} };
  // Step 3 (alex 2026-11-17): with a card still to answer, "How did doing it feel?"; otherwise "Anything else go well
  // today?". Both have "+ Make my own card" under them.
  const answered = !!(had.card && had.card.felt && had.card.felt.length && had.mood == null);   // said on home, after "I did it"
  const cid = had.card && had.card.id && !had.rest && !answered ? had.card.id : null;
  // Making your own card opens at level 6 (alex 2026-11-25). Before that, a day with no card to answer ends at step 2.
  const own = levels.isOpen("own"), N = cid || own ? 3 : 2;
  document.body.classList.add("in-flow");
  const tint = () => document.documentElement.style.setProperty("--glow", st.touched ? mix(st.v).join(" ") : "255 165 31");

  const one = () => {
    at("mood");
    const word = h("div.mood-word", { "aria-live": "polite" });
    const next = mainBtn(st.touched ? "Next" : "Slide to answer", st.touched, two);
    const range = h("input", { type: "range", min: "0", max: "100", value: String(Math.round(st.v)), "aria-label": "How was today?", "data-focus": "" });
    const upd = () => { const m = toMood(st.v); word.textContent = st.touched ? MOODS[m] : " "; word.style.color = `rgb(${mix(st.v).join(" ")})`; range.setAttribute("aria-valuetext", MOODS[m]); tint(); };
    range.addEventListener("input", () => { st.v = +range.value; st.touched = true; next.textContent = "Next"; next.setAttribute("aria-disabled", "false"); upd(); });
    upd();
    // Crumbs (alex 2026-11-23): today's crumbs first, so there's something to look back on before answering.
    // Part of this step, not a step of its own. The latest four show; the rest are in Your days.
    const cr = crumbs.ofDay(k);
    if (cr.length) log("crumbs_seen", Math.min(cr.length, 20));
    const replay = cr.length ? h("div.crumb-replay.rise", null, h("span.note", null, "Your crumbs today"), cr.slice(-4).map((c) => crumbs.row(c)),
      cr.length > 4 ? h("span.note", null, `and ${cr.length - 4} earlier, in Your days`) : null) : null;
    show(step(
      [roundBtn("close", "Not now", () => close(false)), where(`End your day · 1 of ${N}`), spacer()],
      [replay, h("h1.q.rise", null, "How was today?"), h("div.rise", null, word), h("div.col.rise", { style: { gap: "8px" } }, range, h("div.ends", null, h("span", null, "Awful"), h("span", null, "Great")))],
      [next, LIFELINE()]));
  };
  const two = () => {
    const m = toMood(st.v), b = band(m), s2 = store.get();
    at("feelings"); log("pm_feelings", m);
    const L = (s2.feel.last[b] = s2.feel.last[b] || {});
    const order = [...new Set(firstSix(b).concat(s2.feel.own, nearestOrder(b)))];
    const ranked = order.slice().sort((x, y) => ((L[y] || 0) - (L[x] || 0)) || order.indexOf(x) - order.indexOf(y));
    const main = ranked.slice(0, 6).sort((x, y) => order.indexOf(x) - order.indexOf(y));
    // Crumbs: a couple of words from each other band today's crumbs pointed to join the first ones (up to 3 extra).
    let extra = 0;
    crumbs.bands(k).filter((cb) => cb !== b).forEach((cb) => firstSix(cb).slice(0, 2).forEach((w) => { if (extra < 3 && !main.includes(w)) { main.push(w); extra++; } }));
    st.feel.forEach((w) => { if (w !== "Not sure" && !main.includes(w)) main.push(w); });
    const more = ranked.filter((x) => !main.includes(x));
    const done = N === 3 ? mainBtn("Next", st.feel.size > 0, three) : mainBtn("Done", st.feel.size > 0, () => save());
    const pick = pillPicker({ main, more, picked: st.feel, notSure: "Not sure",
      onToggle: (w) => { st.feel.has(w) ? st.feel.delete(w) : st.feel.add(w); done.setAttribute("aria-disabled", st.feel.size ? "false" : "true"); },
      onAdd: (w) => { w = w.toLowerCase(); if (!s2.feel.own.includes(w) && !order.includes(w)) s2.feel.own.push(w); if (!main.includes(w)) main.push(w); const i = more.indexOf(w); if (i >= 0) more.splice(i, 1); st.feel.add(w); done.setAttribute("aria-disabled", "false"); store.save(); },
      noteOnce: () => (s2.notes.feelOwn ? false : (s2.notes.feelOwn = true, store.save(), true)) });
    show(step(
      [roundBtn("back", "Back", one), where(`End your day · 2 of ${N}`), spacer()],
      [h("span.q2.rise", { style: { color: CHART_COL[m], fontWeight: "600" } }, MOODS[m]), h("h1.q.rise", null, "What were you feeling?"), h("div.rise", null, pick.el)],
      [done, LIFELINE()]));
  };
  const did = !!(cid && had.card.done);
  const make = () => { at("own"); makeCard({ k, back: three, kept: three }); };
  const three = () => {
    if (cid) {
      at("card");
      show(howStep(cid, st.ans, two, (a) => { st.ans = a; save(); }, `End your day · 3 of ${N}`, { did, extra: own ? ownArea(k, make) : null,
        onChange: (f) => { st.ans = f.includes(NOT_DONE) ? { how: 0, felt: [] } : { how: deck.howFromFelt(f), felt: f }; } }));
      return;
    }
    at("else");
    show(step(
      [roundBtn("back", "Back", two), where(`End your day · 3 of ${N}`), spacer()],
      [h("h1.q.rise", null, "Anything else go well today?"), h("div.rise", null, ownArea(k, make))],
      [mainBtn("Done", true, save), LIFELINE()]));
  };
  const save = () => {
    const s2 = store.get(), d = store.day(k), m = toMood(st.v), b = band(m), n = dayNum(k);
    d.mood = m; d.feel = [...st.feel];
    const a = st.ans;
    if (cid && a.how != null) {
      const first = d.card.how == null;
      d.card.how = a.how; d.card.felt = a.felt || [];
      d.card.done = a.how >= 1;
      if (first) { deck.howWent(cid, a.how); deck.feltWent(cid, d.card.felt); }
      const p = deck.card(cid).pillar;
      d.pil = (d.pil || []).filter((x) => x !== p);
      if (a.how >= 1) d.pil.unshift(p);
      deck.madePil(d).forEach((x) => { if (!d.pil.includes(x)) d.pil.push(x); });   // own cards always count
      log("card_how", { id: deck.tid(cid), how: a.how });
      if (d.card.felt.length) log("card_felt", { id: deck.tid(cid), f: d.card.felt.map((w) => deck.FELT.indexOf(w)) }); // positions only, never words
    }
    const L = (s2.feel.last[b] = s2.feel.last[b] || {});
    st.feel.forEach((w) => { if (w !== "Not sure") L[w] = n; });
    if (!s2.started) s2.started = k;
    store.save(); close(true);
  };
  tint(); one();
}
