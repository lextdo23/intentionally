// The one sleep rule (sleepPattern in js/stats.js), run on the five made-up patterns from the Mood and sleep
// design canvas, plus the early days, the empty start and the window. No browser needed. Made-up data only.
const path = require("path");
const { checker } = require("./helpers.cjs");

// [hours slept, mood 0-6] for 21 nights, oldest first.
const SETS = {
  more: [[7.67,4],[6.17,2],[8.17,4],[5.33,1],[8.33,5],[8.67,6],[7.83,3],[7.17,4],[6.5,3],[7.25,4],[6,2],[5.5,1],[8,5],[9,6],[7.5,4],[7,3],[6.83,3],[7.42,4],[5.83,2],[7.92,4],[8.5,5]],
  sweet: [[5.5,1],[9.5,2],[7.5,5],[6,2],[8,6],[10,1],[7,4],[9,3],[6.5,3],[7.75,5],[8.5,4],[5.25,1],[9.75,2],[7.25,4],[6.25,2],[8.25,5],[9.25,2],[7.5,4],[6.75,3],[8,5],[10.25,2]],
  low: [[5.5,0],[8,3],[6,1],[7.5,3],[5.25,0],[8.5,3],[6.5,1],[7.25,2],[5.75,1],[8.25,3],[6.25,1],[7.75,3],[5,0],[9,2],[6.75,2],[7.5,2],[5.5,1],[8,3],[6,1],[7,2],[8.75,3]],
  nolink: [[6,4],[8.5,2],[7,5],[5.5,4],[9,3],[7.5,2],[6.5,2],[8,4],[5.75,2],[9.25,5],[7.25,4],[6.25,5],[8.75,5],[7.75,3],[6.75,3],[8.25,3],[5.25,5],[9.5,4],[7,4],[6,4],[8,4]],
  steady: [[7.25,4],[7,2],[7.5,5],[7.17,3],[7.33,4],[7.58,5],[6.92,2],[7.25,3],[7.42,5],[7.08,4],[7.5,2],[7.17,4],[7.33,3],[7,5],[7.42,4],[7.25,2],[7.58,4],[7.08,3],[7.33,5],[7.17,4],[7.5,3]],
};
const TODAY = "2026-11-22";
const key = (back) => { const d = new Date(2026, 10, 22 - back, 12); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// Nights end yesterday; today has last night's sleep but no mood yet (the outline).
function days(set, n = set.length, extraOld = 0) {
  const out = {}, rows = set.slice(0, n);
  rows.forEach(([h, m], i) => { const bed = 23 * 60, wake = Math.round(bed + h * 60) % 1440; out[key(rows.length - i)] = { sleep: { bed, wake, rested: 2, tags: [] }, mood: m }; });
  for (let i = 0; i < extraOld; i++) out[key(40 + i)] = { sleep: { bed: 1380, wake: 300, rested: 2, tags: [] }, mood: 0 };   // 6h, Awful, long ago
  out[TODAY] = { sleep: { bed: 1380, wake: 400, rested: 2, tags: [] } };
  return out;
}

(async () => {
  const { check, done } = checker();
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.matchMedia = () => ({ matches: false });
  const st = await import(path.join(__dirname, "..", "js", "stats.js"));
  const run = (d) => st.sleepPattern(d, TODAY);

  let p = run(days(SETS.more));
  check(p.kind === "up" && p.lo === 8 && st.sleepHours(p) === "8 hours or more", "more is better: best days came after 8 hours or more");
  p = run(days(SETS.sweet));
  check(p.kind === "range" && st.sleepHours(p) === "8 to 9 hours", "sweet spot: a middle range, not 'more is better'");
  p = run(days(SETS.low));
  check(p.kind === "up" && p.lo === 8, "mostly low days still show a pattern (average mood, not good days)");
  p = run(days(SETS.nolink));
  check(p.kind === "none" && p.lo == null, "no clear link: no band is invented");
  p = run(days(SETS.steady));
  check(p.kind === "steady", "steady sleeper: little to compare");

  p = run(days(SETS.more, 2));
  check(p.kind === "empty" && p.left === 19, "first nights: fills in, 19 more days to go");
  p = run(days(SETS.sweet, 8));
  check(p.early && p.kind === "range" && p.hi - p.lo === 1, "early days name one hour group, never a range");
  p = run(days(SETS.more));
  check(!p.early && p.left === 0 && p.total === 21, "21 nights: no longer early");
  check(p.nights.length === 22 && p.nights[p.nights.length - 1].m == null, "last night shows (no mood yet) at the end");
  check(p.noted.every((n, i, a) => !i || a[i - 1].h <= n.h), "By hours: nights sorted shortest to longest");

  p = run(days(SETS.more, 21, 5));
  check(p.total === 26 && p.noted.length === 21, "only the last 4 weeks are charted; older nights still count toward the 21");

  const odd = days(SETS.more); odd[key(3)].sleep = { bed: 1380, wake: 60, rested: 0, tags: [] }; odd[key(4)].sleep = { bed: 1200, wake: 540, rested: 4, tags: [] };
  p = run(odd);
  check(p.noted.some((n) => Math.abs(n.h - 2) < 0.01) && p.noted.some((n) => Math.abs(n.h - 13) < 0.01), "2 hours and 13 hours are kept as real nights");

  // What seems to help you uses the same hours.
  const h = st.helps(days(SETS.more), {}, []);
  check(!h.some((x) => x.id === "sleep" || x.id === "sleep730"), "What seems to help you leaves sleep hours to the sleep card");
  done();
})();
