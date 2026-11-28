// Dev tools (alex 2026-11-28: "make @test a dev account, so it can simulate days, simulate features"). Only for accounts
// the service marks dev (DEV_NAMES in push/accounts.js); nobody else ever sees the button or the sheet. Everything here
// works on this phone's own data, the way a real day would be written, so levels, boxes, Your days and the weekly recap
// react to it as they would for anyone. Days it makes carry dev: 1 so "Remove simulated days" can take them away again.
// The clock and the "Real levels" switch live under st.test, which never leaves the phone (js/sync.js SKIP).
// Dev accounts are always test accounts too, so tester mode never records or sends anything from them.
import { h, dayKey, addDays, keyDate, DAY_NAME, MONTH } from "./util.js";
import { now, setOffsetDays, DAY } from "./clock.js";
import * as store from "./store.js";
import * as account from "./account.js";
import * as levels from "./levels.js";
import * as deck from "./deck.js";
import { FEELINGS, band } from "./words.js";
import { makeSample } from "./sample.js";
import { openSheet } from "./ui.js";
import * as levelup from "./levelup.js";
import * as tips from "./tips.js";
import * as wrapped from "./wrapped.js";
import { openBox, waiting as boxesWaiting } from "./boxes.js";
import * as crumbs from "./crumbs.js";
import * as notifCard from "./notif-card.js";

export const isDev = () => { const u = account.user(); return !!(u && u.dev); };

const T = () => { const s = store.get(); return (s.test = s.test || { offset: 0 }); };
// The clock: test mode already moves now() by st.test.offset days; dev tools use parts of a day too.
function shift(days) { const t = T(); t.offset = (t.offset || 0) + days; setOffsetDays(t.offset); store.save(); }
function toHour(hr) {   // the simulated day (it starts at 4am, like dayKey), at this hour
  const d = keyDate(dayKey()); d.setHours(hr, 0, 0, 0); if (hr < 4) d.setDate(d.getDate() + 1);
  shift((d.getTime() - now()) / DAY);
}
function realTime() { T().offset = 0; setOffsetDays(0); store.save(); }

// ---------- Simulated check-ins, written like the real ones ----------
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function day(k) { const d = store.day(k); d.dev = 1; const s = store.get(); if (!s.started || s.started > k) s.started = k; return d; }
export function morningFor(k, rested = 2 + Math.floor(Math.random() * 2)) {
  const d = day(k), bed = 22 * 60 + 30 + Math.floor(Math.random() * 13) * 5, wake = (bed + 7 * 60 + 30 + Math.floor(Math.random() * 13) * 5) % 1440;
  d.sleep = { bed: bed % 1440, wake, rested, tags: [] };
}
export function drawFor(k) {
  const d = day(k); if (d.rest || (d.card && d.card.id)) return;
  const ids = deck.draw3([], k); if (ids.length < 1) return;
  d.card = { id: ids[0], hands: [ids] };
  const p = deck.card(ids[0]).pillar; d.pil = [p].concat((d.pil || []).filter((x) => x !== p));
}
export function cardDoneFor(k) {
  const d = day(k); if (d.rest) return;
  if (!d.card || !d.card.id) drawFor(k);
  if (!d.card || !d.card.id) return;
  const felt = [pick(deck.feltMain(deck.card(d.card.id).pillar))];
  Object.assign(d.card, { done: true, felt, how: deck.howFromFelt(felt) });
}
export function eveningFor(k, mood = 3 + Math.floor(Math.random() * 3)) {
  const d = day(k), pool = FEELINGS.filter((w) => w[1] === band(mood));
  d.mood = mood; d.feel = [...new Set([pick(pool)[0], pick(pool)[0]])];
}
export function fullDay(k) { morningFor(k); cardDoneFor(k); eveningFor(k); }
export function restFor(k) { const d = day(k); delete d.card; d.rest = true; }
export function clearDay(k) { delete store.get().days[k]; }
// Removes every day dev tools or test mode made up (dev: 1 or sample: 1). Real days are never touched.
export function removeSimulated() {
  const s = store.get(); let n = 0;
  for (const [k, d] of Object.entries(s.days)) if (d && (d.dev || d.sample)) { delete s.days[k]; n++; }
  const left = Object.keys(s.days).sort(); s.started = left.length ? (s.started && s.started <= left[0] ? s.started : left[0]) : s.started;
  return n;
}

// ---------- Levels ----------
// Points needed to stand at the start of level lv.
const startOf = (lv) => { let p = 0; for (let i = 1; i < lv; i++) p += levels.need(i); return p; };
// Jumps to a level by moving the starting line (levels.base); nothing else changes. quiet: no level-up moment.
export function setLevel(lv, { quiet = true } = {}) {
  const s = store.get(), m = (s.levels = s.levels || {});
  lv = Math.max(1, Math.min(30, lv));
  m.base = levels.earned(s) + (m.l1 || 0) - startOf(lv);
  if (quiet || lv <= (m.seen || 1)) m.seen = lv;
  m.opened = Math.min(m.opened || 0, lv - 1);
  store.save();
}
// "Real levels": every feature opens only at its level, ignoring test-account opening, tips already seen and keepAll,
// so locks and unlocks can be seen as a new person would (levels.isOpen reads it).
export const strict = () => !!T().strict;
export function setStrict(on) { T().strict = !!on; store.save(); }
export function giveBox() { const m = store.get().levels = store.get().levels || {}; m.opened = (m.opened || 0) - 1; store.save(); }
export function resetTips() { const m = store.get().levels = store.get().levels || {}; m.tips = {}; m.keepAll = false; store.save(); }

// ---------- The button and the sheet ----------
export function button(rerender) {
  if (!isDev()) return null;
  return h("button.devbtn", { "aria-label": "Dev tools", onclick: () => open(rerender) }, "DEV");
}

export function open(rerender) {
  const redo = () => rerender && rerender();
  openSheet((panel, close) => {
    const act = (fn, { shut = false } = {}) => () => { fn(); store.save(); redo(); shut ? close("done") : draw(); };
    const b = (label, fn, opts) => h("button.dev-chip", { onclick: act(fn, opts) }, label);
    const later = (fn) => () => { close("done"); setTimeout(fn, 350); };
    const chip = (label, fn) => h("button.dev-chip", { onclick: later(fn) }, label);
    const sec = (title, ...rows) => h("div.dev-sec", null, h("h3", null, title), ...rows);
    const row = (...kids) => h("div.dev-row", null, ...kids);
    const draw = () => {
      const st = store.get(), k = dayKey(), d = st.days[k] || {}, t = new Date(now()), lv = levels.level(), off = T().offset || 0;
      const when = `${DAY_NAME[t.getDay()]} ${t.getDate()} ${MONTH[t.getMonth()]}, ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
      const today = [d.sleep ? "morning ✓" : "morning –", d.rest ? "rest day" : d.card && d.card.id ? (d.card.done ? "card done ✓" : "card drawn") : "no card", d.mood != null ? "evening ✓" : "evening –"].join(" · ");
      const sims = Object.values(st.days).filter((x) => x && (x.dev || x.sample)).length;
      panel.replaceChildren(
        h("span.grabber", { "aria-hidden": "true" }),
        h("h2", null, "Dev tools"),
        h("p.dev-note", null, "Only this account sees these. Made-up days back up like real ones; remove them below."),
        sec("Time", h("p.dev-now", null, when, off ? h("span", null, ` · ${off > 0 ? "+" : ""}${(Math.round(off * 10) / 10)} days`) : h("span", null, " · real time")),
          row(b("− 1 day", () => shift(-1)), b("+ 1 day", () => shift(1)), b("+ 1 week", () => shift(7)), b("+ 3 hours", () => shift(0.125))),
          row(b("8 am", () => toHour(8)), b("1 pm", () => toHour(13)), b("8 pm", () => toHour(20)), b("11 pm", () => toHour(23)), b("Real time", realTime))),
        sec("Today", h("p.dev-now", null, today),
          row(b("Morning check-in", () => morningFor(k)), b("Draw card", () => drawFor(k)), b("Card done", () => cardDoneFor(k)), b("Evening check-in", () => eveningFor(k))),
          row(b("Full day", () => fullDay(k)), b("Rest day", () => restFor(k)), b("Full day, then next day", () => { fullDay(k); shift(1); }), b("Clear today", () => clearDay(k)))),
        sec("Past days", h("p.dev-now", null, `${Object.keys(st.days).length} days kept · ${sims} made up`),
          row(b("Last 7 days", () => { for (let i = 7; i >= 1; i--) fullDay(addDays(k, -i)); }), b("Last 28 days", () => { for (let i = 28; i >= 1; i--) fullDay(addDays(k, -i)); }),
            b("2 months (no points)", () => { Object.assign(st.days, makeSample(60)); if (!st.started) st.started = Object.keys(st.days).sort()[0]; })),
          row(b("Remove simulated days", () => removeSimulated()))),
        sec("Levels", h("p.dev-now", null, `Level ${lv.level} · ${lv.into} of ${lv.need} points · ${boxesWaiting()} ${boxesWaiting() === 1 ? "box" : "boxes"} waiting`),
          row(b("− 1 level", () => setLevel(lv.level - 1)), b("+ 1 level (with its moment)", () => setLevel(lv.level + 1, { quiet: false }), { shut: true })),
          row(...[1, 2, 3, 4, 5, 6, 8].map((n) => b(`Level ${n}`, () => setLevel(n)))),
          row(b("Give a box", giveBox), chip("Open a box", () => { if (boxesWaiting() < 1) giveBox(); openBox(redo); }))),
        sec("Features",
          h("label.dev-switch", null, h("input", { type: "checkbox", checked: strict(), onchange: (e) => { setStrict(e.target.checked); redo(); draw(); } }),
            h("span", null, h("b", null, "Real levels"), h("br"), "Off: everything open. On: each feature opens only at its level, like a new person.")),
          h("p.dev-now", null, levels.UNLOCKS.map((u) => `${u.name} (${u.level}) ${levels.isOpen(u.id) ? "open" : "locked"}`).join(" · ")),
          row(b("Forget seen unlocks", resetTips))),
        sec("Preview",
          row(...levels.UNLOCKS.map((u) => chip(`Level-up: ${u.name}`, () => levelup.show(u.level, u, { text: tips.tipText(u.id), onDone: redo }))),
            chip("Level-up: nothing new", () => levelup.show(7, null, { onDone: redo }))),
          row(chip("Weekly recap", () => { if (!wrapped.testOpen(redo)) { for (let i = 14; i >= 1; i--) fullDay(addDays(k, -i)); store.save(); wrapped.testOpen(redo); } }),
            chip("Crumbs offer", () => crumbs.offer(redo)), chip("Notifications card", () => notifCard.open(redo)))),
        h("button.btn-main", { onclick: () => close("done") }, "Done"));
    };
    draw();
  }, { label: "Dev tools" });
}
