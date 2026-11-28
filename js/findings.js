// Findings (alex 2026-11-28, thread "Build choosing when to do cards"): one real pattern from someone's own days,
// for the morning notification. The notification says enough to be specific (a real number or subject) and holds
// back the one piece that answers it; the answer is the first thing on home until the morning check-in is done.
// Rules: every teaser must be true, and the answer must be there when they open. Hard stretches get comfort only
// ("Something helped on your harder days"), never a bad fact. Moods, sleep, pillars and card words only: never a
// typed thought.
import * as store from "./store.js";
import { addDays, dayKey, MOODS, isGood } from "./util.js";
import { helps, lifts, sleepPattern, sleepHours, easier, whenWords, HARDER_DAY } from "./stats.js";

const low = (w) => w.charAt(0).toLowerCase() + w.slice(1);
const when = (w) => (/^(Today|Yesterday|Last)/.test(w) ? low(w) : "on " + w);
const goodOf = (ms) => ms.filter(isGood).length;

// Every finding that's true today: { id, title, body, answer }. Oldest data is fine; all of it is the person's own.
export function all(s = store.get(), k = dayKey()) {
  const days = s.days, out = [];
  // What went with better days (the same lines as "What seems to help you", never one they hid).
  const pills = [...new Set(Object.values(days).flatMap((d) => d.pil || []))];
  helps(days, s.hidden || {}, pills).filter((x) => !x.research).forEach((x) => {
    const [[, a], [, b]] = x.rows;
    if (x.measure === "rested") {
      const ra = a.filter((r) => r >= 3).length;
      out.push({ id: "h:" + x.id, title: "You wake more rested after a certain amount of sleep", body: `${ra} of ${a.length} mornings after it, you woke rested.`, answer: x.text("").join("") });
    } else {
      out.push({ id: "h:" + x.id, title: "One thing turned up on your better days", body: `${goodOf(a)} of ${a.length} days with it went well. Without it, ${goodOf(b)} of ${b.length}.`, answer: x.text(low(MOODS[x.top])).join("") });
    }
  });
  // Sleep: the hours their best days came after (one sleep rule, the same as Your days).
  const p = sleepPattern(days, k);
  if (["up", "down", "range"].includes(p.kind)) out.push({ id: "sleep", title: "Your best days came after a certain amount of sleep", body: `From your last ${p.noted.length} nights.`, answer: `Your best days came after ${sleepHours(p)} of sleep.` });
  // A card that lifted them more than once.
  const L = lifts(days, k), top = L.any.find((x) => x.n > 1);
  if (top) out.push({ id: "lift:" + top.id, title: `One card lifted you ${top.n} times this month`, body: `The last time was ${when(whenWords(top.last, k))}.`, answer: `${top.text} Lifted you ${top.n} times.` });
  // What still helped on harder days (comfort: shown first after a hard day).
  const hard = L.harder[0];
  if (hard) out.push({ id: "hard:" + hard.id, comfort: true, title: "Something helped on your harder days", body: `It lifted you or got done ${hard.n} ${hard.n === 1 ? "time" : "times"} when things were low.`, answer: `On harder days, this still helped: ${hard.text}` });
  // A part of life that used to take a lot and lifts them now.
  const e = easier(days, addDays(k, -6));
  if (e) out.push({ id: "easier:" + e.pillar, title: "Something that used to take a lot is lifting you now", body: "Over the last 4 weeks.", answer: `${e.pillar} used to take a lot. Lately it lifts you.` });
  return out;
}

// The one for a morning: after a hard day, comfort first; otherwise a different one from yesterday's, in turn.
export function pick(s = store.get(), k = dayKey()) {
  const list = all(s, k);
  if (!list.length) return null;
  const y = s.days[addDays(k, -1)] || {}, finds = s.finds || {};
  if (y.mood != null && y.mood <= HARDER_DAY) return list.find((x) => x.comfort) || null;   // nothing gentle to say: plain words
  const recent = [1, 2, 3].map((i) => finds[addDays(k, -i)]).filter(Boolean);
  return list.find((x) => !recent.includes(x.id)) || list.find((x) => x.id !== finds[addDays(k, -1)]) || null;
}

// Settles the finding for a morning (so the notification and home say the same thing), and keeps two weeks of them.
export function forMorning(k, s = store.get()) {
  s.finds = s.finds || {};
  if (s.finds[k]) return byId(s.finds[k], s, k);
  const f = pick(s, k);
  if (!f) return null;
  s.finds[k] = f.id;
  Object.keys(s.finds).filter((x) => x < addDays(k, -14)).forEach((x) => delete s.finds[x]);
  store.save();
  return f;
}
// Today's finding, for home (still true when they open: worked out again from the same data).
export function byId(id, s = store.get(), k = dayKey()) { return all(s, k).find((x) => x.id === id) || null; }
export function today(s = store.get(), k = dayKey()) { const id = (s.finds || {})[k]; return id ? byId(id, s, k) : null; }
