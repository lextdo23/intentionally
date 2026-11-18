// Levels (alex 2026-11-17, thread "Design levels and points"). Points come from what people already did, read
// straight from their days, so undoing "I did it" or ending the day again never counts twice, and people who used
// the app before levels start at the level their past days earned. Nothing is ever taken away for a missed day.
// Each level reached earns a box (js/boxes.js, alex 2026-11-18). packsWaiting() = boxes earned and not opened yet.
import * as store from "./store.js";

// Points for each thing, once a day. A rest day counts as drawing and doing the card: resting was the plan.
export const POINTS = { setup: 1, morning: 1, draw: 1, card: 2, evening: 2, made: 1, photo: 1 };

// Curve B: 4, 7, 10, 13, 16, 19, then 20 for every level after that.
export const need = (lv) => Math.min(4 + 3 * (lv - 1), 20);

// "Next box at level N" shows once the bar is this full (about one good day away).
export const NEAR = 0.8;

export function dayPoints(d) {
  if (!d || d.sample) return 0;   // made-up days from test mode never count
  let p = 0;
  if (d.sleep) p += POINTS.morning;
  if (d.rest) p += POINTS.draw + POINTS.card;
  else if (d.card && d.card.id) {
    p += POINTS.draw;
    if (d.card.done || d.card.how >= 1) p += POINTS.card;
  }
  if (d.mood != null) p += POINTS.evening;
  if (d.made && d.made.length) p += POINTS.made;
  if (d.ph) p += POINTS.photo;   // a photo of the card (alex 2026-11-18)
  return p;
}

// Points ever earned, from setup and every day kept on this phone.
export function earned(st = store.get()) {
  return (Array.isArray(st.pillars) ? POINTS.setup : 0) + Object.values(st.days || {}).reduce((s, d) => s + dayPoints(d), 0);
}
// Everyone starts again at level 1 (alex 2026-11-18, before boxes arrived): once, on this phone, the points earned
// so far are set aside as the starting line, so only points from now on count. Nothing else is touched; it happens
// quietly with no moment, and no boxes are owed for the old levels.
const RESET = 1;
export function startOver(st = store.get()) {
  const m = (st.levels = st.levels || {});
  if ((m.reset || 0) >= RESET) return false;
  m.reset = RESET; m.base = earned(st); m.opened = 0; m.seen = 1;
  store.save();
  return true;
}
export function total(st = store.get()) {
  return Math.max(0, earned(st) - ((st.levels || {}).base || 0));
}

// { level, into: points into this level, need: points this level takes, frac: 0 to 1 }
export function level(pts = total()) {
  let lv = 1, left = pts;
  while (left >= need(lv)) { left -= need(lv); lv++; }
  return { level: lv, into: left, need: need(lv), frac: left / need(lv) };
}

// What the app remembers: the highest level it has already told the person about, and packs opened (for later).
function mem() { const s = store.get(); return (s.levels = s.levels || {}); }

// Boxes earned and not opened yet (js/boxes.js counts them as opened).
export const packsWaiting = () => Math.max(0, level().level - 1 - (mem().opened || 0));

// A new level to tell the person about, or null. The first time ever (including people who used the app before
// levels), it quietly notes where they are, with no moment.
export function newLevel() {
  const m = mem(), lv = level().level;
  if (m.seen == null) { m.seen = lv; store.save(); return null; }
  if (lv > m.seen) { m.seen = lv; store.save(); return lv; }
  return null;
}

// ---------- What each level opens (alex 2026-11-18, thread "Finalise levels and what they unlock") ----------
// Day one is the basics only, so nothing extra lands at once. Photos, Going to sleep, "What's been on your mind?",
// support, rest days, pillars and settings are never levelled. The card library thread checks isOpen("library").
export const BASICS = { name: "Your daily card", line: "Start your day, your card, a photo, End your day" };
export const UNLOCKS = [
  { level: 2, id: "days", name: "Your days", line: "See how your days have felt, and what seems to help." },
  { level: 3, id: "own", name: "Make your own card", line: "At the end of your day, add something else you did." },
  { level: 4, id: "library", name: "Card library", line: "Every card in Daydeck, to look through." },
  { level: 5, id: "months", name: "Month and Year on Your days", line: "Look back over a whole month or year." },
];
// People who used the app before levels opened things keep everything they have (alex 2026-11-18): decided once,
// the first time this runs, from whether any real day was already noted on this phone.
export function keepOld(st = store.get()) {
  const m = (st.levels = st.levels || {});
  if (m.keepAll != null) return;
  m.keepAll = Object.values(st.days || {}).some((d) => d && !d.sample && (d.sleep || d.mood != null || (d.card && d.card.id) || d.rest));
  store.save();
}
export function isOpen(id) {
  const u = UNLOCKS.find((x) => x.id === id);
  if (!u || mem().keepAll) return true;
  return level().level >= u.level;
}
// What opened at this level (for the level-up moment), or null.
export const opensAt = (lv) => UNLOCKS.find((u) => u.level === lv) || null;
