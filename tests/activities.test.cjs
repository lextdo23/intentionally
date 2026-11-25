// How activities felt (js/stats.js): Mood and activities rows and notes, What lifts you (any day and harder days),
// and Getting easier for the weekly look back. No browser needed. Made-up data only.
const path = require("path");
const { checker } = require("./helpers.cjs");

const TODAY = "2026-11-22";
const key = (back) => { const d = new Date(2026, 10, 22 - back, 12); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// Bank card ids for each pillar (from js/cards-data.js), found at run time.
let ID = {};
// rows: [daysAgo, pillar, felt words, evening mood]
function build(rows, own = []) {
  const days = {}, s = { v: 1, days, own: [], pillars: [] };
  rows.forEach(([back, p, felt, mood], i) => { days[key(back)] = { mood, card: { id: ID[p][i % ID[p].length], felt, how: 3, done: true }, pil: [p] }; });
  own.forEach(([back, p, felt, mood], i) => { const id = "o" + (i + 1); s.own.push({ id, day: key(back), pillar: p, text: "My own " + p, felt, deck: false }); const d = (days[key(back)] = days[key(back)] || { mood }); d.made = (d.made || []).concat(id); });
  return s;
}

(async () => {
  const { check, done } = checker();
  let saved = null;
  globalThis.localStorage = { getItem: () => saved, setItem: (k, v) => { if (k === "daydeck") saved = v; } };
  globalThis.matchMedia = () => ({ matches: false });
  const store = await import(path.join(__dirname, "..", "js", "store.js"));
  const { BANK } = await import(path.join(__dirname, "..", "js", "cards-data.js"));
  ["Move", "Rest", "Work and study", "Friends"].forEach((p) => (ID[p] = BANK.filter((r) => r[1] === p).slice(0, 4).map((r) => r[0])));
  const st = await import(path.join(__dirname, "..", "js", "stats.js"));
  const use = (s) => { saved = JSON.stringify(s); store.load(); return store.get().days; };

  // Hard to do, but those days went well (Work and study); calming on lower days (Rest).
  const rows = [];
  for (let i = 0; i < 7; i++) rows.push([20 - i * 2, "Work and study", i < 5 ? ["Hard"] : ["Glad it's done"], 5]);
  for (let i = 0; i < 6; i++) rows.push([19 - i * 2, "Rest", ["Calmer"], i % 2 ? 2 : 1]);
  for (let i = 0; i < 4; i++) rows.push([25 - i, "Move", ["More energy", "Enjoyed it"], 4]);
  let days = use(build(rows));
  let M = st.moodActivities(days);
  const work = M.rows.find((r) => r.pillar === "Work and study"), rest = M.rows.find((r) => r.pillar === "Rest"), move = M.rows.find((r) => r.pillar === "Move");
  check(work.kind === "hard" && work.count === 5 && work.total === 7 && work.words[0] === "Hard", "Work and study: took a lot, 5 of 7, mostly Hard");
  check(work.usual === 5 && work.note === "worth", "Work and study: those days went well, so a 'worth it' note");
  check(rest.kind === "lift" && rest.note === "moment", "Rest: lifted you on lower days, so an 'in the moment' note");
  check(move.learning && !move.note, "Move with 4 cards: still learning, never a note");
  check(M.lead.kind === "worth" && M.lead.pillar === "Work and study", "headline leads with 'hard but worth it' first");
  check(move.count === 4 && move.words.includes("More energy") && move.words.includes("Enjoyed it"), "the count is the kind (lifted you), and both words are listed");

  // Both good: the headline says so; ordinary days: it doesn't claim they went well.
  const good = []; for (let i = 0; i < 6; i++) good.push([18 - i, "Move", ["More energy"], 5]);
  M = st.moodActivities(use(build(good)));
  check(M.lead.kind === "both", "lifted you, and those days went well: 'and those days went well too'");
  const plain = []; for (let i = 0; i < 6; i++) plain.push([18 - i, "Move", ["More energy"], 3]);
  M = st.moodActivities(use(build(plain)));
  check(M.lead.kind === "lift", "lifted you, but ordinary days: just 'lifted you most'");
  M = st.moodActivities(use(build([[3, "Move", ["Calmer"], 3]])));
  check(M.lead.kind === "empty", "too few cards: 'This fills in as you do more cards.'");

  // Own cards count; rest days and unanswered cards don't.
  const s2 = build([[5, "Move", ["Calmer"], 3]], [[4, "Move", ["Proud of myself"], 4]]);
  s2.days[key(2)] = { mood: 3, rest: true }; s2.days[key(1)] = { mood: 3, card: { id: ID.Move[0], felt: [] } };
  const A = st.activities(use(s2));
  check(A.length === 2 && A.some((a) => a.id === "o1" && a.kind === "done"), "own cards count; rest days and unanswered cards don't");
  check(A[0].k < A[1].k, "cards come oldest first");

  // What lifts you: any day, and harder days once there are 5.
  days = use(build(rows));
  let L = st.lifts(days, TODAY);
  check(L.any.length >= 1, "lifts show");
  check(L.any.every((g, i, a) => !i || a[i - 1].n > 1 || g.n === 1 && a[i - 1].last >= g.last), "lifted more than once goes first, then the most recent");
  check(st.whenWords(TODAY, TODAY) === "Today" && /^Last /.test(st.whenWords("2026-11-19", TODAY)) && /^Thu 5 Nov$/.test(st.whenWords("2026-11-05", TODAY)), "when words: Today, Last Thursday, Thu 5 Nov");
  check(L.harder.length >= 1 && L.harder.every((g) => g.of >= g.n), "harder days: enough Low-or-below days, each 'n of times done'");
  L = st.lifts(use(build(good)), TODAY);
  check(L.harder.length === 0, "no harder days: the Harder days side stays hidden");
  const few = []; for (let i = 0; i < 6; i++) few.push([12 - i, "Rest", ["Calmer"], i < 3 ? 1 : 4]);
  L = st.lifts(use(build(few)), TODAY);
  check(L.harder.length >= 1 && L.harderEarly, "3 harder days: shows, as 'So far'");

  // Getting easier: Move took a lot three weeks ago, lifts now.
  const ez = [];
  [[20, ["Hard"]], [19, ["Drained me"]], [13, ["Hard"]], [12, ["Glad it's done"]], [6, ["More energy"]], [5, ["Enjoyed it"]], [1, ["More energy"]], [0, ["Calmer"]]].forEach(([b, f]) => ez.push([b, "Move", f, 3]));
  const wk = "2026-11-16";   // Monday of this week
  const E = st.easier(use(build(ez)), wk);
  check(E && E.pillar === "Move" && E.weeks.length === 4, "getting easier: Move, shown over four weeks");
  const harder = ez.map(([b, p, f, m]) => [b, p, b > 10 ? ["More energy"] : ["Hard"], m]);
  check(!st.easier(use(build(harder)), wk), "never says the opposite (getting harder)");
  done();
})();
