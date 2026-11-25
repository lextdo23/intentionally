// Crumbs (alex 2026-11-23): quick taps of how you feel as the day goes, so ending the day is easier for people who
// find it hard to remember how the day felt, or to find the words. "Leave crumbs through your day, and follow them
// back tonight."
//
// - Off until someone turns it on. Everyone is offered it once, after an evening check-in (their first, or their
//   next one if they were already using Daydeck), and it's always in Settings. Never tied to a level.
// - A crumb is a face and, if they like, a few words. The five faces are the five feeling bands in words.js (0 hard
//   ... 4 great), coloured like the evening slider, plus "Not sure". No card linking, no nudges.
// - Kept with the day: d.crumbs = [{ t, f, n }]. t = when (ms, from now()), f = band 0-4 or -1 for not sure,
//   n = their words (left out when empty). They travel with the day's backup like everything else in a day.
// - Kept so people can look back (Your days, tap a day), and shown at the start of the evening check-in, where the
//   feelings step leads with words from the crumbs' bands. NEVER counted: not in charts, stats, "What seems to
//   help you", the weekly look back or the doctor summary. Morning and evening check-ins stay the only mood data.
// - Tester mode logs only that things happened (and whether words were added, 0 or 1), never the face or the words.
import { h, dayKey, clock12, CHART_COL } from "./util.js";
import * as store from "./store.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";
import { now } from "./clock.js";

export const FACE_WORD = ["Hard", "Low", "Okay", "Good", "Great"];
export const NOT_SURE = -1;
const INK = "#24262b";   // the sky, so the faces' features read as cut into the colour
export const faceCol = (f) => (f < 0 ? "#77787d" : CHART_COL[f + 1]);

export const isOn = () => !!(store.get().crumbs && store.get().crumbs.on);
export function setOn(on, from) {
  const s = store.get(); s.crumbs = { ...(s.crumbs || {}), on: !!on }; store.save();
  log("crumbs_on", on ? from : "off");
}
// A day's crumbs, oldest first.
export const ofDay = (k = dayKey()) => ((store.get().days[k] || {}).crumbs || []).slice().sort((a, b) => a.t - b.t);
// The feeling bands a day's crumbs point to, most used first (not sure left out).
export function bands(k = dayKey()) {
  const n = {}; ofDay(k).forEach((c) => { if (c.f >= 0) n[c.f] = (n[c.f] || 0) + 1; });
  return Object.keys(n).map(Number).sort((a, b) => n[b] - n[a] || a - b);
}
export const timeOf = (t) => { const d = new Date(t); return clock12(d.getHours() * 60 + d.getMinutes()); };

// ---------------- The faces ----------------
// Drawn on a 64 grid. Hard and Great have closed eyes; the rest have dots.
const DOTS = [["circle", { cx: "23", cy: "26", r: "3.5", fill: INK }], ["circle", { cx: "41", cy: "26", r: "3.5", fill: INK }]];
const line = (d) => ["path", { d, stroke: INK, "stroke-width": "3", fill: "none", "stroke-linecap": "round" }];
const FEATURES = {
  0: [line("M17 26q6 4 12 0M35 26q6 4 12 0"), line("M22 46q10-9 20 0")],
  1: [...DOTS, line("M23 45q9-5 18 0")],
  2: [...DOTS, line("M23 43h18")],
  3: [...DOTS, line("M22 39q10 9 20 0")],
  4: [line("M17 28q6-6 12 0M35 28q6-6 12 0"), ["path", { d: "M20 38q12 14 24 0z", fill: INK }]],
  [-1]: [["circle", { cx: "24", cy: "27", r: "3", fill: INK }], ["circle", { cx: "40", cy: "27", r: "3", fill: INK }], line("M25 43q3.5-3 7 0t7 0")],
};
export function face(f, size = 56) {
  return h("svg", { width: String(size), height: String(size), viewBox: "0 0 64 64", "aria-hidden": "true", class: "crumb-face" },
    h("circle", { cx: "32", cy: "32", r: "31", fill: faceCol(f) }), FEATURES[f].map(([t, a]) => h(t, a)));
}

// The home button: a solid face with a small plus, both cut out so the button's own fill shows through (alex chose A5).
let maskN = 0;
export function button(onSaved) {
  const id = "crumb-cut-" + ++maskN, id2 = id + "p";
  const svg = h("svg", { width: "24", height: "24", viewBox: "0 0 24 24", "aria-hidden": "true" },
    h("defs", null,
      h("mask", { id, maskUnits: "userSpaceOnUse", x: "0", y: "0", width: "24", height: "24" },
        h("rect", { width: "24", height: "24", fill: "#fff" }), h("circle", { cx: "19", cy: "5", r: "5.4", fill: "#000" }),
        h("circle", { cx: "8.3", cy: "11.6", r: "1.25", fill: "#000" }), h("circle", { cx: "13.7", cy: "11.6", r: "1.25", fill: "#000" }),
        h("path", { d: "M8.1 15.4q2.9 2.5 5.8 0", stroke: "#000", "stroke-width": "1.7", fill: "none", "stroke-linecap": "round" })),
      h("mask", { id: id2, maskUnits: "userSpaceOnUse", x: "0", y: "0", width: "24", height: "24" },
        h("rect", { width: "24", height: "24", fill: "#fff" }), h("path", { d: "M19 3.1v3.8M17.1 5h3.8", stroke: "#000", "stroke-width": "1.6", "stroke-linecap": "round" }))),
    h("circle", { cx: "11", cy: "13", r: "9", fill: "currentColor", mask: `url(#${id})` }),
    h("circle", { cx: "19", cy: "5", r: "4.1", fill: "currentColor", mask: `url(#${id2})` }));
  return h("button.round.crumb-btn", { "aria-label": "Drop a crumb", onclick: () => { log("crumb_open"); open({ onSaved }); } }, svg);
}

// ---------------- The sheet: drop a crumb, or change one ----------------
// open({ onSaved }) drops a new crumb today; open({ k, t, onSaved }) changes (or removes) the crumb made at time t on day k.
export function open({ k = dayKey(), t = null, onSaved } = {}) {
  const old = t != null ? ofDay(k).find((c) => c.t === t) : null;
  let f = old ? old.f : null;
  openSheet((panel, close) => {
    panel.classList.add("crumb-sheet"); if (f != null) panel.classList.add("picked");
    const save = h("button.btn-main", { "aria-disabled": String(f == null) }, old ? "Save" : "Drop a crumb");
    const faces = [0, 1, 2, 3, 4].map((b) => h("button.crumb-pick", { "aria-pressed": String(f === b), "aria-label": FACE_WORD[b], onclick: () => pick(b) },
      face(b, 56), h("span", null, FACE_WORD[b])));
    const unsure = h("button.crumb-unsure", { "aria-pressed": String(f === NOT_SURE), onclick: () => pick(NOT_SURE) }, face(NOT_SURE, 32), h("span", null, "Not sure"));
    const pick = (b) => {
      f = b; faces.forEach((x, i) => x.setAttribute("aria-pressed", String(i === b))); unsure.setAttribute("aria-pressed", String(b === NOT_SURE));
      save.setAttribute("aria-disabled", "false"); panel.classList.add("picked");
    };
    const note = h("input.crumb-note", { placeholder: "What happened? Optional", "aria-label": "What happened? Optional", maxlength: "140", enterkeyhint: "done", value: old && old.n ? old.n : "" });
    note.addEventListener("keydown", (e) => { if (e.key === "Enter") note.blur(); });
    save.addEventListener("click", () => {
      if (f == null) return;
      const d = store.day(k), n = note.value.trim(), list = (d.crumbs = d.crumbs || []);
      const c = old ? list.find((x) => x.t === old.t) : null;
      if (c) { c.f = f; if (n) c.n = n; else delete c.n; log("crumb_edit", { n: n ? 1 : 0 }); }
      else { list.push(n ? { t: now(), f, n } : { t: now(), f }); log("crumb_add", { n: n ? 1 : 0 }); }
      store.save(); close("done"); onSaved && onSaved();
    });
    const remove = old ? h("button.btn-quiet", { onclick: () => {
      const d = store.day(k); d.crumbs = (d.crumbs || []).filter((x) => x.t !== old.t); if (!d.crumbs.length) delete d.crumbs;
      store.save(); log("crumb_delete"); close("done"); onSaved && onSaved();
    } }, "Remove this crumb") : null;
    panel.append(h("div.col", { style: { gap: "4px" } }, h("h2", null, old ? `Your crumb from ${timeOf(old.t)}` : "How's right now?"), h("span.sub", null, "Pick the closest. No words needed.")),
      h("div.crumb-faces", { role: "group", "aria-label": "How you feel" }, faces), unsure, note, save, ...(remove ? [remove] : []));
  }, { label: old ? "Change a crumb" : "Drop a crumb" });
}

// A crumb as a short row: face, time, and their words if any. Tapping it changes it (when onTap is given).
export function row(c, onTap) {
  const kids = [face(c.f, 28), h("span.crumb-time", null, timeOf(c.t)), c.n ? h("span.crumb-words", null, c.n) : h("span.crumb-words.dim", null, c.f < 0 ? "Not sure" : FACE_WORD[c.f])];
  return onTap ? h("button.crumb-row", { onclick: onTap, "aria-label": `Change your crumb from ${timeOf(c.t)}` }, kids) : h("div.crumb-row", null, kids);
}

// ---------------- The offer, once ----------------
// After an evening check-in, once home is quiet. Everyone sees it once (alex 2026-11-23), whatever their level.
export function offerOK() { const s = store.get(); return !isOn() && !(s.notes && s.notes.crumbsOffer); }
export function offer(onDone) {
  const s = store.get(); s.notes = s.notes || {}; s.notes.crumbsOffer = 1; store.save(); log("crumbs_offer");
  openSheet((panel, close) => {
    const yes = h("button.btn-main", { onclick: () => {
      setOn(true, "offer");
      panel.replaceChildren(h("span.grabber", { "aria-hidden": "true" }),
        h("div.col", { style: { gap: "8px" } }, h("h2", null, "Crumbs is on"),
          h("p", { style: { color: "var(--ink2)" } }, "Tap the little face on home whenever you like. When you end your day, your crumbs will be there."),
          h("p.note", { style: { textAlign: "left" } }, "You can turn it off in Settings.")),
        h("button.btn-main", { onclick: () => close("done") }, "Done"));
    } }, "Turn on Crumbs");
    panel.append(h("div.col", { style: { gap: "8px" } }, face(3, 48),   // the Good face: an invitation, not a shrug (alex 2026-11-24)
      h("h2", null, "Hard to remember how your day felt, or to find the words?"),
      h("p", { style: { color: "var(--ink2)" } }, "You're not alone. With Crumbs, you tap how you feel as your day goes, then follow your crumbs back when you end your day.")),
      yes, h("button.btn-quiet", { onclick: () => { log("crumbs_on", "later"); close("later"); } }, "Not now"),
      h("p.note", null, "You can always find it in Settings."));
  }, { label: "Crumbs", onClose: () => onDone && onDone() });
}
