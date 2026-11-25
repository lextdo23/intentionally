// Levels (alex 2026-11-17, thread "Design levels and points"). Points come from what people already did, read
// straight from their days, so undoing "I did it" or ending the day again never counts twice, and people who used
// the app before levels start at the level their past days earned. Nothing is ever taken away for a missed day.
// Each level reached earns a box (js/boxes.js, alex 2026-11-18). packsWaiting() = boxes earned and not opened yet.
import * as store from "./store.js";

// Points for each thing, once a day. A rest day counts as drawing and doing the card: resting was the plan.
export const POINTS = { setup: 1, morning: 1, draw: 1, card: 2, evening: 2, made: 1, photo: 1 };

// Curve B: 4, 7, 10, 13, 16, 19, then 20 for every level after that. Level 1 takes 6 (alex 2026-11-25), so a full first
// day reaches level 2 as the day is ended (not when the card is done), and a full second day reaches level 3 the same way.
export const need = (lv) => (lv === 1 ? 6 : Math.min(4 + 3 * (lv - 1), 20));

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
// A second time (alex 2026-11-19, just before levels started opening things): everyone back to level 1 again, and
// this time nothing is kept open, so Your days, own cards, the card library and Month and Year open level by level,
// each with its tip. Nothing is deleted: past days, photos, cards made and box cards all stay, only hidden until then.
const RESET = 2;
export function startOver(st = store.get()) {
  const m = (st.levels = st.levels || {});
  if ((m.reset || 0) >= RESET) return false;
  m.reset = RESET; m.base = earned(st); m.opened = 0; m.seen = 1;
  m.keepAll = false; m.tips = {}; m.used = {};
  store.save();
  return true;
}
// Level 1 went from 4 points to 6 (alex 2026-11-25). People already past level 1 get those 2 points back, once, so
// nobody's level goes down; people still at level 1 (and everyone new) take the new 6.
export function sixToStart(st = store.get()) {
  const m = (st.levels = st.levels || {});
  if (m.l1 != null) return;
  m.l1 = (m.seen || 1) >= 2 ? 2 : 0;
  store.save();
}
export function total(st = store.get()) {
  const m = st.levels || {};
  return Math.max(0, earned(st) - (m.base || 0) + (m.l1 || 0));
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

// ---------- What each level opens (alex 2026-11-25, thread "Rework levels and what unlocks when") ----------
// Day one is the basics only. Your days opens as the first day ends, Friends as the second ends, then the weekly recap
// is announced (it still comes on Sunday, from day 7: this is so there's something to look forward to), then Cards,
// then making your own card (it adds a step to End your day, so it waits until the evening is a habit). Photos, Going
// to sleep, "What's been on your mind?", support, rest days, pillars and settings are never levelled.
export const BASICS = { name: "Your daily card", line: "Start your day, your card, a photo, End your day" };
export const UNLOCKS = [
  { level: 2, id: "days", name: "Your days", line: "See how your days have felt, and what seems to help." },
  { level: 3, id: "friends", name: "Friends", line: "Add a few friends and cheer each other on." },
  { level: 4, id: "recap", name: "Weekly recap", line: "Every Sunday, once you end your day, a look back at your week." },
  { level: 5, id: "library", name: "Cards and Looks shelf", line: "Collect card looks, and look through every card in Daydeck." },
  { level: 6, id: "own", name: "Make your own card", line: "At the end of your day, add something else you did." },
];
// The weekly recap's first Sunday (the first one from day 7), in words, until a recap has been seen; else "".
export function firstRecap(st = store.get()) {
  if (!st.started || Object.keys((st.wrap || {}).seen || {}).length) return "";
  const d = new Date(st.started + "T12:00"); d.setDate(d.getDate() + 6);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" });
}
// Someone who came through a friend's invite link gets Friends straight away, whatever their level (alex 2026-11-25).
export function openInvited() { const m = mem(); if (!m.invited) { m.invited = 1; store.save(); } }
// Anything already opened for someone stays open when its level moves (nothing is ever taken away): its tip
// showed, so they've had it.
// (Keeping things open for people from before was dropped: everyone starts again, alex 2026-11-19. keepAll stays false.)
// Opened early for this person, whatever their level (main.js: accounts marked early get Friends straight away).
const early = new Set();
export function openEarly(ids) { ids.forEach((id) => early.add(id)); }
export function isOpen(id) {
  const u = UNLOCKS.find((x) => x.id === id);
  if (!u || mem().keepAll || early.has(id) || (id === "friends" && mem().invited)) return true;
  return level().level >= u.level || !!(mem().tips || {})[id];
}
// What opened at this level (for the level-up moment), or null.
export const opensAt = (lv) => UNLOCKS.find((u) => u.level === lv) || null;
