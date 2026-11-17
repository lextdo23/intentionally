// The daily card: which cards are in your deck, how three are drawn each morning, and what the app remembers
// about each card (seen, passed over, done, loved, saved for later). Everything stays on this phone.
import { BANK } from "./cards-data.js";
import * as store from "./store.js";
import { dayKey, keyDate, addDays } from "./util.js";

export const HOW = ["Didn't get to it", "Drained", "Okay", "Good", "Loved it"];
// Pillar tints: one per group (people, body, doing, purpose, rest and learning).
export const PILLAR_COL = { Friends: "#d9b3a6", Family: "#d9b3a6", Love: "#d9b3a6", Community: "#d9b3a6", Move: "#a9c4b5", Outdoors: "#a9c4b5",
  Food: "#cfc59b", "Work and study": "#cfc59b", Money: "#cfc59b", Rest: "#a9b9d6", Learn: "#a9b9d6", "Play and create": "#c4b4c9", Give: "#c4b4c9", Meaning: "#c4b4c9" };
export const card = (id) => { const r = BANK[id - 1]; return r && { id: r[0], pillar: r[1], size: r[2], for: r[3], text: r[4], why: r[5], source: r[6] }; };

// Until "Choose your pillars" is built (its own thread), the deck uses the everyday cards of five common pillars.
// That thread saves answers as  pillars: [{ name: "Friends", mindsets: ["I feel lonely"] }]  and this picks them up.
export const STAND_IN = ["Friends", "Move", "Rest", "Work and study", "Play and create"];
export function myPillars() {
  const p = store.get().pillars;
  return Array.isArray(p) && p.length ? p : STAND_IN.map((name) => ({ name, mindsets: [] }));
}
export function deck() {
  const ps = myPillars();
  return BANK.filter((r) => ps.some((p) => p.name === r[1] && (r[3] === "Everyone" || r[3].some((m) => (p.mindsets || []).includes(m))))).map((r) => r[0]);
}

export function mem() {
  const s = store.get();
  return (s.cards = Object.assign({ seen: {}, passed: {}, done: {}, loved: {}, less: {}, last: {}, saved: [], thumbs: {} }, s.cards || {}));
}
const dayN = (k) => Math.floor(keyDate(k).getTime() / 864e5);
export function dayOfUse(k = dayKey()) { const st = store.get().started; return st ? dayN(k) - dayN(st) + 1 : 1; }

// How likely each card is to be drawn today. Never predicts: it's mostly random, leaning gently.
function weight(id, k) {
  const m = mem(), c = card(id), d = dayOfUse(k), n = dayN(k);
  let w;
  if (m.less[id]) w = 0.05;                                   // "show me less of this"
  else if (m.done[id]) w = m.loved[id] && d >= 8 ? 3 : 0.4;   // loved cards come back from week 2
  else if (!m.seen[id]) w = 10;                               // cards you haven't seen come first
  else if ((m.passed[id] || 0) >= 2) w = 0.2;                 // passed over twice: sinks
  else w = 2;
  if (m.last[id] != null && n - m.last[id] < 3) w *= 0.15;    // not the same faces two mornings running
  if (c.size === "Bigger") w *= d <= 3 ? 0.3 : 0.8;           // first days: mostly tiny and small
  return w;
}
const pick = (ids, ws) => { let t = ws.reduce((a, b) => a + b, 0), r = Math.random() * t; for (let i = 0; i < ids.length; i++) { r -= ws[i]; if (r <= 0) return ids[i]; } return ids[ids.length - 1]; };

// Three different cards. At most one bigger card, and never two from the same pillar if it can be helped.
export function draw3(exclude = [], k = dayKey()) {
  const m = mem(), all = deck().filter((id) => !exclude.includes(id)), out = [];
  const saved = m.saved.find((id) => all.includes(id));
  if (saved) out.push(saved);                                 // a card saved for later comes back first
  while (out.length < 3) {
    const left = all.filter((id) => !out.includes(id) && !(card(id).size === "Bigger" && out.some((o) => card(o).size === "Bigger")));
    if (!left.length) break;
    const ws = left.map((id) => weight(id, k) * (out.some((o) => card(o).pillar === card(id).pillar) ? 0.25 : 1));
    out.push(pick(left, ws));
  }
  return out;
}

// A tiny card from the same pillar, for "Make it smaller".
export function smaller(id, exclude = []) {
  const c = card(id), opts = deck().filter((x) => x !== id && !exclude.includes(x) && card(x).pillar === c.pillar && card(x).size === "Tiny");
  if (!opts.length) return null;
  return pick(opts, opts.map((x) => weight(x, dayKey())));
}
export const canShrink = (id) => card(id).size !== "Tiny" && smaller(id) != null;

// One rest day a week (Monday to Sunday).
export function restLeft(k = dayKey()) {
  const d = keyDate(k), mon = addDays(k, -((d.getDay() + 6) % 7)), days = store.get().days;
  for (let i = 0; i < 7; i++) { const x = addDays(mon, i); if (x !== k && days[x] && days[x].rest) return false; }
  return true;
}

// Bookkeeping, called by the screens.
export function shown(ids, k = dayKey()) { const m = mem(), n = dayN(k); ids.forEach((id) => { m.seen[id] = (m.seen[id] || 0) + 1; m.last[id] = n; }); m.saved = m.saved.filter((x) => !ids.includes(x)); }
export function passed(ids) { const m = mem(); ids.forEach((id) => (m.passed[id] = (m.passed[id] || 0) + 1)); }
export function save(id) { const m = mem(); if (!m.saved.includes(id)) m.saved.push(id); }
export function unsave(id) { const m = mem(); m.saved = m.saved.filter((x) => x !== id); }
// "How did doing it feel?" (alex 2026-11-17, option 4B): pick any that fit. Five that suit the card's pillar show first,
// the rest sit under "Show more". Research: behavioural activation rates enjoyment and achievement separately, plus
// energy, calm, connection and values. Shared by the evening step and anything else that asks after a card.
// The order never changes: tester data sends positions in this list, never words.
export const FELT = ["Enjoyed it", "Proud of myself", "Glad it's done", "Calmer", "Closer to someone", "More energy", "Felt like me", "Hard", "Drained me", "Not for me"];
const FELT_GOOD = FELT.slice(0, 7);
const FELT_PILLAR = { Friends: "Closer to someone", Family: "Closer to someone", Love: "Closer to someone", Community: "Closer to someone",
  Move: "More energy", Outdoors: "More energy", Rest: "Calmer", Food: "Calmer",
  "Work and study": "Proud of myself", Money: "Proud of myself", Learn: "Proud of myself",
  "Play and create": "Felt like me", Give: "Felt like me", Meaning: "Felt like me" };
// The five shown first for a pillar (a pillar of your own gets "Felt like me"); always with an honest low end.
export function feltMain(pillar) { return [...new Set([FELT_PILLAR[pillar] || "Felt like me", "Enjoyed it", "Glad it's done", "Hard", "Drained me"])]; }
// The old one-tap scale (HOW) still drives card memory and charts: none good = Drained, good and hard = Okay, one good = Good, two or more = Loved it.
export function howFromFelt(felt) {
  const good = felt.filter((w) => FELT_GOOD.includes(w)).length, low = felt.length - good;
  return !felt.length ? null : !good ? 1 : low ? 2 : good === 1 ? 3 : 4;
}
// "Not for me" works like "Show less": the card comes up much less often.
export function feltWent(id, felt) { if (felt.includes("Not for me")) mem().less[id] = 1; }
export function howWent(id, how) {
  const m = mem();
  if (how >= 1) m.done[id] = (m.done[id] || 0) + 1;
  if (how === 4) m.loved[id] = (m.loved[id] || 0) + 1;
}
// "Not done yet" after it was answered: take back what howWent counted.
export function unWent(id, how) {
  const m = mem();
  if (how >= 1 && m.done[id]) m.done[id]--;
  if (how === 4 && m.loved[id]) m.loved[id]--;
}
// "Back again": a card you've done before shows how many times.
export const doneTimes = (id) => mem().done[id] || 0;
export const today = (k = dayKey()) => { const d = store.get().days[k]; return d && d.card && d.card.id ? card(d.card.id) : null; };
