// Cards that happen later (alex 2026-11-27, canvas "Daydeck · Week cards and set dates on home", option B).
// Two kinds of card don't finish on the day they're drawn:
//  - set-a-date cards ("Set a time for a date…"): "I did it" asks "When is it?" (up to 8 weeks ahead, or "Not set
//    yet"). The plan then waits in a stack behind today's card; on the date it comes to the front with a camera, and
//    the photo is kept on the date as a second photo (photos.js keyFor). It stays until the next night, then goes.
//    "Not set yet" waits as "Set the date" for up to 2 weeks.
//  - week cards ("Walk or jog on three days this week…"): run for 7 days from the draw. "I did it" on the draw day
//    ticks day one; from the next day the card waits in the stack with its ticks, and "Did it today" ticks a day
//    (with an optional photo on that day). All ticked is done; when the 7 days run out first it quietly leaves.
// Only cards that really take place on a later day or over several days are here (alex 2026-11-27). Kept on the
// drawn day's card: when (the date), nodate (1 = "Not set yet"), ticks (days ticked), so it backs up with the day.
import { dayKey, addDays, keyDate, DAY_NAME, MONTH } from "./util.js";
import * as store from "./store.js";
import * as deck from "./deck.js";
import * as plans from "./plans.js";
// The second photo's name and note, as in js/photos.js (keyFor, has), without loading the photo screens.
const keyFor = (k, from) => (from && from !== k ? `${k}~${from}` : k);
const hasPhoto = (pk) => { const [k, f] = pk.split("~"), d = store.get().days[k]; return !!(d && (f ? d.xph && d.xph[f] : d.ph)); };
// Loaded only when something is logged, so the charts' sums (js/stats.js, through js/deck.js) still load outside the app.
const log = (...a) => import("./tester.js").then((t) => t.log(...a)).catch(() => {});

// card number -> kind, a short name for the stack, and for week cards how many days to tick.
export const LATER = {
  88: { k: "date", l: "Date night" }, 57: { k: "date", l: "Family meal" }, 60: { k: "date", l: "Family visit" },
  32: { k: "date", l: "Weekend plan" }, 563: { k: "date", l: "Weekend fun" }, 540: { k: "date", l: "Hobby class" },
  534: { k: "date", l: "Evening for fun" }, 523: { k: "date", l: "Careers chat" }, 482: { k: "date", l: "Holiday at home" },
  460: { k: "week", l: "Walk or jog", n: 3 }, 504: { k: "week", l: "Lunch walks", n: 3 }, 182: { k: "week", l: "Phone away", n: 7 },
  135: { k: "week", l: "New exercise", n: 1 }, 29: { k: "week", l: "Call an old friend", n: 1 }, 390: { k: "week", l: "Find a group", n: 1 },
  470: { k: "week", l: "Act on it", n: 1 }, 531: { k: "week", l: "Applications", n: 1 },
};
export const AHEAD = 56, UNSET_DAYS = 14, WEEK = 7;
// Three cards at most on home (alex 2026-11-27): today's card and up to two waiting behind it. While two wait, the
// morning hand leaves out date and week cards (deck.dealable), so nothing is ever pushed out.
export const MAX_WAIT = 2;
export const kindOf = (id) => LATER[deck.tid(id)] || null;
export const isDate = (id) => (kindOf(id) || {}).k === "date";
export const isWeek = (id) => (kindOf(id) || {}).k === "week";
const diff = (a, b) => Math.round((keyDate(b) - keyDate(a)) / 864e5);   // days from a to b
export const shortDate = (k) => { const d = keyDate(k); return `${DAY_NAME[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTH[d.getMonth()]}`; };
const cardAt = (f) => { const d = store.get().days[f]; return d && !d.rest && d.card && d.card.id ? d.card : null; };

// What waits in the stack on day k, front-most first. Each: { f (the drawn day), id, kind, label, pillar, when,
// ticks, n, status, today (it's the date, so it comes to the front), pk (the photo key for day k) }.
export function stack(k = dayKey()) {
  const days = store.get().days, out = [];
  for (const f of Object.keys(days)) {
    const back = diff(f, k);
    if (back < 0 || back > AHEAD + 1) continue;
    const c = cardAt(f), kd = c && kindOf(c.id);
    if (!kd) continue;
    const base = { f, id: c.id, kind: kd.k, label: kd.l, pillar: (deck.card(c.id) || {}).pillar || "", plan: kd.k === "date" ? plans.mineById(c.plan) : null };
    if (kd.k === "date") {
      if (c.when && /^\d{4}-\d{2}-\d{2}$/.test(c.when)) {
        const to = diff(k, c.when);   // days until the date
        if (to < -1 || c.when === f) continue;   // gone after the next night; a date on the drawn day is just today's card
        const pk = keyFor(c.when, f);
        if (to === -1 && hasPhoto(pk)) continue;   // the day after: only while there's still no photo
        out.push({ ...base, when: c.when, today: to === 0, pk: to <= 0 ? pk : null, status: to === 0 ? "Today" : to === -1 ? "Yesterday" : shortDate(c.when) });
      // No date yet: "Not set yet", or a card done before dates existed (before 27 Nov 2026), which has neither.
      } else if (c.done && (c.nodate || back >= 1) && back <= UNSET_DAYS) out.push({ ...base, unset: true, status: "Set the date" });
    } else if (back >= 1 && back < WEEK) {
      const ticks = c.ticks || [], n = kd.n || 1;
      if (ticks.length >= n && !ticks.includes(k)) continue;   // finished: stays for the rest of the day it was finished
      out.push({ ...base, ticks, n, tickedToday: ticks.includes(k), pk: keyFor(k, f), status: "This week" });
    }
  }
  // Dates friends shared with you (alex 2026-11-27, js/plans.js): "From Mia" while it waits for an answer, then like
  // your own date once you're in. Each one's key is "p:<plan>"; its photo goes on the date as a second photo, named
  // by the day the friend drew the card.
  for (const p of plans.invited()) {
    const kd = LATER[p.card];
    if (!kd || kd.k !== "date" || !/^\d{4}-\d{2}-\d{2}$/.test(p.day)) continue;
    const to = diff(k, p.day), ask = p.state !== "in";
    if (to < -1 || (ask && to < 0) || to > AHEAD + 7) continue;
    const pk = keyFor(p.day, p.made);
    if (to === -1 && hasPhoto(pk)) continue;
    out.push({ f: "p:" + p.id, id: p.card, kind: "date", label: kd.l, pillar: (deck.card(p.card) || {}).pillar || "", when: p.day, guest: p, ask,
      today: to === 0 && !ask, pk: to <= 0 && !ask ? pk : null, status: ask ? "From " + (p.by.name || p.by.username) : to === 0 ? "Today" : to === -1 ? "Yesterday" : shortDate(p.day) });
  }
  // The date that's today first, then the soonest dates, then week cards, then dates still to set, then invites
  // still waiting for an answer (they count toward the three on home; with no room they wait on the bell page).
  const rank = (x) => (x.today ? 0 : x.ask ? 4 : x.when ? 1 : x.kind === "week" ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b) || (a.when || a.f).localeCompare(b.when || b.f)).slice(0, MAX_WAIT);
}
export const full = (k = dayKey()) => stack(k).length >= MAX_WAIT;

// "When is it?": a date (from the drawn day up to 8 weeks ahead), or null for "Not set yet".
export function setDate(f, when, from = "home") {
  const c = cardAt(f);
  if (!c) return;
  if (when) { c.when = when; delete c.nodate; } else { delete c.when; c.nodate = 1; }
  store.save();
  log("plan_date", { id: deck.tid(c.id), d: when ? diff(f, when) : -1, f: from === "days" ? 1 : 0 });   // days ahead only, never the date
}
// A week card's tick for day k. Returns { first, done }.
export function tick(f, k = dayKey()) {
  const c = cardAt(f), kd = c && kindOf(c.id);
  if (!kd || kd.k !== "week") return { first: false, done: false };
  const ticks = c.ticks || (c.ticks = []);
  const first = !ticks.length;
  if (!ticks.includes(k)) ticks.push(k);
  if (!c.done) { c.done = true; const d = store.day(f), p = (deck.card(c.id) || {}).pillar; if (p) d.pil = [p].concat((d.pil || []).filter((x) => x !== p)); }
  const done = ticks.length >= (kd.n || 1);
  store.save();
  log("week_tick", { id: deck.tid(c.id), t: ticks.length, n: kd.n || 1, day: diff(f, k) });
  return { first, done };
}
export function untick(f, k = dayKey()) {
  const c = cardAt(f);
  if (!c || !c.ticks) return;
  c.ticks = c.ticks.filter((x) => x !== k);
  store.save(); log("week_untick", deck.tid(c.id));
}
// Set-a-date cards done in the last 2 weeks with no date yet (or "Not set yet"): Your days offers "Set the date".
export function canSetDate(f, k = dayKey()) {
  const c = cardAt(f);
  return !!(c && isDate(c.id) && c.done && !c.when && diff(f, k) >= 0 && diff(f, k) <= UNSET_DAYS);
}
// Morning reminders for dates coming up (notify.js, under Card reminders): the day keys of dates from today on.
export function dateDays(k = dayKey()) {
  return stack(k).filter((x) => x.when && diff(k, x.when) >= 0).map((x) => ({ k: x.when, l: x.label }));
}
