// Choosing when (alex 2026-11-28, thread "Build choosing when to do cards"; plan https://claude.ai/artifact/RkJHJcZ4mZQSZygZzqcmAZ).
// People pick their moments once (after their first End your day), from a short list, each with a rough time, with a
// separate weekday and weekend set. Keeping a card then asks "Keep it for" with their next 3 moments plus Now (every
// button one size). Cards tagged for one time (js/card-when.js) skip the question. One backup reminder a little after
// the moment (none for Now), in place of the fixed card reminders. If the moment passes, End your day asks "Still got
// a minute?" (I did it / Let it rest), never "missed". The plan is an event in their day; the time is only a backup.
import * as store from "./store.js";
import { h, dayKey, keyDate, clock12 } from "./util.js";
import { whenOf } from "./card-when.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";
import { now } from "./clock.js";

export const MOMENTS = [
  { id: "breakfast", name: "Breakfast", t: "07:30" },
  { id: "way", name: "On the way", t: "08:30" },
  { id: "lunch", name: "Lunch", t: "12:30" },
  { id: "work", name: "After work or class", short: "After work", t: "17:30" },
  { id: "dinner", name: "After dinner", t: "19:30" },
];
const byId = (id) => MOMENTS.find((m) => m.id === id);
export const AFTER = 30;   // the backup reminder comes this many minutes after the moment
const mins = (hhmm) => { const [a, b] = String(hhmm).split(":").map(Number); return a * 60 + b; };
const nowMins = () => { const d = new Date(now()); return d.getHours() * 60 + d.getMinutes(); };

// s.when = { wd: { lunch: "12:30", … }, we: { … }, asked: 1 }. Weekend = Saturday and Sunday.
export const data = () => store.get().when || null;
export const isSet = () => { const w = data(); return !!(w && (Object.keys(w.wd || {}).length || Object.keys(w.we || {}).length)); };
export const setOf = (k = dayKey()) => { const w = data() || {}, day = keyDate(k).getDay(); return (day === 0 || day === 6 ? w.we : w.wd) || {}; };
export const nameOf = (id, short = false) => (id === "now" ? "Now" : byId(id) ? (short && byId(id).short) || byId(id).name : "");
// The rough time of a moment today: their own, else the list's.
export const timeOf = (id, k = dayKey()) => setOf(k)[id] || (byId(id) ? byId(id).t : null);

// "Keep it for": their moments still ahead today (up to 15 minutes past counts), earliest first, at most 3, then Now.
export function choices(k = dayKey()) {
  const set = setOf(k), at = nowMins();
  const ahead = Object.keys(set).filter((id) => byId(id) && mins(set[id]) >= at - 15).sort((a, b) => mins(set[a]) - mins(set[b])).slice(0, 3);
  return ahead.concat("now");
}
// What a card's tag says: "ask" (any time), a moment it goes straight to, or null (all day, when it comes up, dated).
export function forCard(id) {
  const t = whenOf(id);
  if (t === "a") return "ask";
  if (t === "n") return "dinner";
  if (t.startsWith("t:")) return t.slice(2);
  return null;
}

// Keeps the choice on today's card: when = moment id or "now", wt = its time in minutes (null for Now).
export function keep(k, id, how) {
  const d = store.day(k);
  if (!d.card || !id) return;
  d.card.when = id; d.card.wt = id === "now" ? null : mins(timeOf(id, k));
  store.save();
  log("card_when", { w: id, f: how });   // f: keep / tag / change
}
// Today's card's moment has passed and it isn't done (End your day then asks "Still got a minute?").
export function passed(c) { return !!(c && c.when && c.when !== "now" && c.wt != null && !c.done && nowMins() >= c.wt); }
// The one backup reminder: a little after the moment, as a time on day k. None for Now.
export function reminderAt(k, c) {
  if (!c || !c.when || c.when === "now" || c.wt == null) return null;
  const x = keyDate(k); x.setHours(0, c.wt + AFTER, 0, 0);
  return x.getTime();
}
// Done time against the moment, for testers: minutes after it (negative = before), never the time itself.
export function doneLog(c) {
  if (!c || !c.when) return;
  log("card_when_done", { w: c.when, m: c.wt == null ? null : nowMins() - c.wt });
}

// The chip under today's card: "Lunch · 12:30pm". Tapping it changes today's moment only.
export function chip(k, c, redraw) {
  if (!c || !c.when) return null;
  const words = c.when === "now" ? "Now" : `${nameOf(c.when, true)} · ${clock12(c.wt)}`;
  return h("button.when-chip", { onclick: () => changeSheet(k, redraw), "aria-label": `Doing it: ${words}. Change` }, clockIcon(), h("span", null, words));
}
function clockIcon() {
  const ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "16"); s.setAttribute("height", "16"); s.setAttribute("aria-hidden", "true");
  s.innerHTML = '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  return s;
}
function changeSheet(k, redraw) {
  openSheet((panel, close) => {
    const c = (store.get().days[k] || {}).card || {};
    panel.append(h("h2", null, "When today?"), buttons(choices(k), c.when, (id) => { keep(k, id, "change"); close("done"); redraw && redraw(); }),
      h("p.note", null, "Just for today. Your moments stay the same."));
  }, { label: "When today?" });
}
// A grid of same-size buttons (DESIGN.md 13b): moments with their time, and Now.
export function buttons(ids, current, pick) {
  return h("div.when-grid", null, ids.map((id) => h(`button.when-btn${id === current ? ".on" : ""}`, { onclick: () => pick(id) },
    h("span", null, nameOf(id, true)), id === "now" ? null : h("small", null, clock12(mins(timeOf(id)))))));
}

// ---------------- Setting up moments ----------------
// Asked once, after the first End your day (alex's plan), and from Settings (Your moments).
export const offerOK = () => { const w = data(); return !isSet() && !(w && w.asked) && Object.values(store.get().days || {}).some((d) => d && d.mood != null); };
export function setup(onDone, from = "offer") {
  const s = store.get(), w = s.when = s.when || {};
  w.asked = 1; store.save();
  const draft = { wd: { ...(w.wd || {}) }, we: { ...(w.we || {}) } };
  let tab = "wd";
  openSheet((panel, close) => {
    const body = h("div.col", { style: { gap: "8px" } });
    const tabs = h("div.when-tabs", { role: "tablist" });
    const draw = () => {
      tabs.replaceChildren(...[["wd", "Weekdays"], ["we", "Weekends"]].map(([id, l]) => h(`button.when-tab${tab === id ? ".on" : ""}`, { role: "tab", "aria-selected": String(tab === id), onclick: () => { tab = id; draw(); } }, l)));
      body.replaceChildren(...MOMENTS.map((m) => {
        const on = draft[tab][m.id] != null;
        const sw = h("button.switch", { role: "switch", "aria-checked": String(on), "aria-label": m.name });
        const time = h("input.time-pill", { type: "time", step: "900", value: draft[tab][m.id] || m.t, "aria-label": `${m.name} time` });
        time.disabled = !on;
        sw.addEventListener("click", () => { if (draft[tab][m.id] != null) delete draft[tab][m.id]; else draft[tab][m.id] = time.value || m.t; draw(); });
        time.addEventListener("change", () => { if (time.value && draft[tab][m.id] != null) draft[tab][m.id] = time.value; });
        return h("div.set-row.set-toggle", null, h("span.set-label", null, m.name), time, sw);
      }));
    };
    draw();
    panel.append(h("div.col", { style: { gap: "8px" } }, h("h2", null, "When do you usually have a minute?"),
      h("p", { style: { color: "var(--ink2)" } }, "Pick the moments in your day. When you keep a card, you'll choose one, and get one reminder a little after it.")),
      tabs, body,
      h("button.btn-main", { onclick: () => {
        // A weekend set left empty takes the weekday one (most people only set it up once).
        if (!Object.keys(draft.we).length && !(w.we && Object.keys(w.we).length)) draft.we = { ...draft.wd };
        w.wd = draft.wd; w.we = draft.we; store.save();
        log("when_setup", { f: from, wd: Object.keys(draft.wd).map((x) => MOMENTS.findIndex((m) => m.id === x)), we: Object.keys(draft.we).map((x) => MOMENTS.findIndex((m) => m.id === x)) });
        close("done");
      } }, "Done"),
      h("button.btn-quiet", { onclick: () => { log("when_setup", { f: from, later: 1 }); close("later"); } }, "Not now"),
      h("p.note", null, "You can change these in Settings."));
  }, { label: "Your moments", onClose: () => onDone && onDone() });
}
