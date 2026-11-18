// Levels (alex 2026-11-17, thread "Design levels and points"). Points come from what people already did, read
// straight from their days, so undoing "I did it" or ending the day again never counts twice, and people who used
// the app before levels start at the level their past days earned. Nothing is ever taken away for a missed day.
// Each level reached earns a box (js/boxes.js, alex 2026-11-18). packsWaiting() = boxes earned and not opened yet.
import * as store from "./store.js";

// Points for each thing, once a day. A rest day counts as drawing and doing the card: resting was the plan.
export const POINTS = { setup: 1, morning: 1, draw: 1, card: 2, evening: 2, made: 1 };

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
  return p;
}

export function total(st = store.get()) {
  return (Array.isArray(st.pillars) ? POINTS.setup : 0) + Object.values(st.days || {}).reduce((s, d) => s + dayPoints(d), 0);
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
