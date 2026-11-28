// The morning notification's words (alex 2026-11-28, thread "Make the morning notification worth tapping").
// Each morning, the first true thing from this list, worked out here on the phone and handed to the service worker
// (js/notify.js keeps it in the "nudge-plan" cache): only ever times leave the phone.
//   1-3. Friends: friend news the person hasn't seen yet (done in sw.js, from the last friend notification).
//   4. A memory: four weeks ago today, or "this time last week", good days only.
//   5. A finding from Your days, written so it holds back the answer, which is on the page it opens.
//      After a hard stretch, only "something helped on your harder days".
//   6. Something waiting: a look one card from open, or a level that opens with a full day.
//   7. Yesterday, in a line ("Yesterday felt good" / "Day 3 of your first week."); a hard day gets comfort only.
// Never a greeting, never cards, never streaks or guilt, never typed words. The same group never shows two mornings
// running when another is true. `go` says where a tap lands: "days:B" (a Your days section), "days:D:<id>" (one
// "What seems to help you" line), "days:E:harder", "day:<k>" (that day), or "today".
import { dayKey, addDays, moodWord } from "./util.js";
import { sleepPattern, helps, moodActivities, lifts, HARDER_DAY } from "./stats.js";
import { dayOfUse } from "./deck.js";
import * as levels from "./levels.js";
import * as looks from "./looks.js";

const GOOD = 4;
// Feelings that read well after "Yesterday you felt …" (okay or better).
const KIND_FEEL = new Set(["calm", "okay", "content", "relaxed", "hopeful", "grateful", "peaceful", "focused", "relieved", "cared for", "happy", "proud", "excited", "connected", "energised", "loved", "inspired", "joyful"]);
const ARTICLE = { 4: "A good day", 5: "A really good day", 6: "A great day" };

// Two or more of the last three noted days were Low or below.
function hardStretch(days, k) {
  const ms = [1, 2, 3, 4, 5, 6, 7].map((i) => days[addDays(k, -i)]).filter((d) => d && d.mood != null).slice(0, 3).map((d) => d.mood);
  return ms.length >= 2 && ms.filter((m) => m <= HARDER_DAY).length >= 2;
}
const didSomething = (d) => (d.card && d.card.done) || (d.pil && d.pil.length) || (d.made && d.made.length) || d.rest;

// Every line that's true for the morning of day k, best first. Each: { kind, group, title, body, go }.
export function lines(s, k = dayKey()) {
  const days = s.days || {}, y = days[addDays(k, -1)] || {}, out = [];
  const add = (kind, group, title, body, go) => out.push({ kind, group, title, body, go });
  const daysOpen = levels.isOpen("days");
  const hardY = y.mood != null && y.mood <= HARDER_DAY;
  const L = daysOpen ? lifts(days, k) : { any: [], harder: [] };
  // A hard day or a hard stretch: comfort only. Never a memory of better days, never "something waiting".
  if (hardY || hardStretch(days, k)) {
    if (L.harder.length) add("harder", "finding", "Something helped on your harder days", "See what it was.", "days:E:harder");
    if (hardY) add("yesterday", "yesterday", "Yesterday took a lot", "Today can be a smaller one.", "today");
    else add("plain", "plain", "How did you sleep?", "", "today");
    return out;
  }
  // Memories: good days only.
  const m4 = addDays(k, -28), d4 = days[m4];
  if (d4 && d4.mood != null && d4.mood >= GOOD) add("memory4", "memory", "Four weeks ago today", d4.ph ? "Your photo from that day." : `${ARTICLE[d4.mood]}. ${didSomething(d4) ? "See what you did." : "See how it went."}`, "day:" + m4);
  const m1 = addDays(k, -7), d1 = days[m1];
  if (d1 && d1.mood != null && d1.mood >= 5) add("memory1", "memory", `This time last week, you felt ${moodWord(d1.mood)}`, didSomething(d1) ? "See what you did." : "See how it went.", "day:" + m1);
  // Findings: only once Your days is open, and only what the page really shows.
  if (daysOpen) {
    const P = sleepPattern(days, k);
    if (!P.early && ["up", "down", "range"].includes(P.kind)) add("sleep", "finding", "Your best days came after a certain amount of sleep", "See how much.", "days:B");
    const pills = [...new Set(Object.values(days).flatMap((d) => d.pil || []))];
    const hp = helps(days, s.hidden || {}, pills).find((it) => !it.research && it.measure !== "rested");
    if (hp) add("helps", "finding", "One thing was often followed by a good day", "See what it was.", "days:D:" + hp.id);
    const A = moodActivities(days).lead;
    if (A.kind === "worth") add("acts", "finding", "Something felt hard to do, but those days still went well", "See what it was.", "days:C");
    else if (A.kind === "moment") add("acts", "finding", "Something helped in the moment, even on lower days", "See what it was.", "days:C");
    else if (A.kind === "lift" || A.kind === "both") add("acts", "finding", "One part of your life lifted you most", "See which one.", "days:C");
    const top = L.any.find((g) => g.n > 1);
    if (top) add("lifts", "finding", `Something lifted you ${top.n} times lately`, "See what it was.", "days:E");
  }
  // Something waiting.
  const want = looks.wantLook();
  if (want && looks.got(want) === looks.need(want) - 1) add("look", "waiting", `One more card and ${want.name} is yours`, "Your next box finishes the set.", "today");
  const lv = levels.level(), next = levels.opensAt(lv.level + 1);
  if (next && next.id !== "recap" && !levels.isOpen(next.id) && lv.need - lv.into <= 6) add("level", "waiting", `${next.name} opens at your next level`, "End today and it's open.", "today");
  // Yesterday, in a line.
  if (y.mood != null) {
    const f = (y.feel || []).find((w) => KIND_FEEL.has(w)), n = dayOfUse(k);
    add("yesterday", "yesterday", f ? `Yesterday you felt ${f}` : `Yesterday felt ${moodWord(y.mood)}`, n >= 2 && n <= 7 ? `Day ${n} of your first week.` : "How did you sleep?", "today");
  }
  add("plain", "plain", "How did you sleep?", "", "today");
  return out;
}

// The line for the morning of day k: the first true one, unless yesterday morning's came from the same group and
// something else is true. What each morning got is kept on this phone only (notify is never backed up).
export function pick(s, k = dayKey()) {
  const all = lines(s, k), n = s.notify || (s.notify = {}), seen = (n.lines = n.lines || {});
  const prev = seen[addDays(k, -1)];
  const line = all.find((x) => x.group !== prev) || all[0];
  seen[k] = line.group;
  Object.keys(seen).forEach((d) => { if (d < addDays(k, -7)) delete seen[d]; });
  return line;
}

// The usual time someone starts their day: the middle of their morning check-in times over the last two weeks,
// plus 10 minutes, once there's a week of them; else their Settings time. Kept between 4am and 1:30pm (from 2pm
// the service worker reads a ping as the evening's). A time picked in Settings after that wins (am.fixed).
export function usualTime(s, k = dayKey()) {
  const am = (s.notify && s.notify.am) || { t: "08:00" };
  if (am.fixed) return am.t;
  const mins = [];
  for (let i = 0; i < 14; i++) { const d = (s.days || {})[addDays(k, -i)]; if (d && d.sleep && d.sleep.at) { const x = new Date(d.sleep.at); mins.push(x.getHours() * 60 + x.getMinutes()); } }
  if (mins.length < 7) return am.t;
  mins.sort((a, b) => a - b);
  const mid = mins.length % 2 ? mins[(mins.length - 1) / 2] : Math.round((mins[mins.length / 2 - 1] + mins[mins.length / 2]) / 2);
  const t = Math.max(240, Math.min(810, Math.round((mid + 10) / 5) * 5));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
