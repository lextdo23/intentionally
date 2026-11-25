// "What seems to help you" (helps() in js/stats.js, alex 2026-11-23): one bedtime line (their own plan, else
// 11:30), usual wake time, late caffeine, drinks, rested after X hours, card picked before midday, own cards.
// No sleep-hours line (the Mood and sleep card says it). No browser needed. Made-up data only.
const path = require("path");
const { checker } = require("./helpers.cjs");

const key = (back) => { const d = new Date(2026, 10, 22 - back, 12); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// 24 days; f(i) returns { sleep tags, bed, wake, rested, mood, at, made }
function days(f) {
  const out = {};
  for (let i = 0; i < 24; i++) {
    const o = f(i), k = key(24 - i);
    out[k] = { mood: o.mood, sleep: { bed: o.bed ?? 1380, wake: o.wake ?? 420, rested: o.rested ?? 2, tags: o.tags || [] } };
    if (o.at != null) out[k].card = { id: "x", felt: [], at: new Date(2026, 10, 22 - (24 - i), o.at).getTime() };
    if (o.made) out[k].made = ["o1"];
  }
  return out;
}
const ids = (L) => L.map((x) => x.id);

(async () => {
  const { check, done } = checker();
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.matchMedia = () => ({ matches: false });
  const st = await import(path.join(__dirname, "..", "js", "stats.js"));
  const H = (d, hidden = {}) => st.helps(d, hidden, []);

  // Bedtime: 11:30 for people who don't use the "stayed up later" note…
  let L = H(days((i) => (i % 2 ? { bed: 1350, mood: 5 } : { bed: 60, mood: 2 })));
  check(ids(L).includes("bed1130") && !ids(L).includes("planned"), "no 'stayed up later' notes: the 11:30 line");
  // …their own plan for people who do. Never both.
  L = H(days((i) => (i % 3 === 0 ? { tags: ["Stayed up later than I meant to"], bed: 1350, mood: 2 } : { bed: 60, mood: 5 })));
  check(ids(L).includes("planned") && !ids(L).includes("bed1130"), "uses the note on 5+ nights: 'when you went to bed when you meant to', never both");
  check(!ids(L).includes("sleep") && !ids(L).includes("sleep730"), "no sleep-hours line (the sleep card says it)");

  // Usual wake time.
  L = H(days((i) => (i % 3 ? { wake: 420 + (i % 2) * 10, mood: 5 } : { wake: 600, mood: 2 })));
  check(ids(L).includes("wake"), "waking at about your usual time");
  check(!L.some((x) => x.id === "r-wake"), "their own wake line replaces the research one");

  // Late caffeine: only for people who use the note on 5+ nights.
  L = H(days((i) => (i % 3 === 0 ? { tags: ["Caffeine late"], mood: 1 } : { mood: 5 })));
  check(ids(L).includes("caffeine"), "late caffeine line");
  L = H(days((i) => (i < 3 ? { tags: ["Caffeine late"], mood: 1 } : { mood: 5 })));
  check(!ids(L).includes("caffeine"), "fewer than 5 caffeine nights: no line");
  L = H(days((i) => (i % 3 === 0 ? { tags: ["Had a few drinks"], mood: 1 } : { mood: 5 })));
  check(ids(L).includes("drinks") && L.find((x) => x.id === "drinks").text("").join("").startsWith("Nights without drinks"), "drinks line");

  // Rested after X hours, counted in rested mornings.
  L = H(days((i) => (i % 2 ? { bed: 1380, wake: 420, rested: 4, mood: 3 } : { bed: 60, wake: 360, rested: 1, mood: 3 })));
  const r = L.find((x) => x.id === "rested");
  check(r && r.measure === "rested" && r.text("")[1] === "8 to 9 hours", "rested: 'You woke most rested after 8 to 9 hours'");

  // Card picked before midday; own cards.
  L = H(days((i) => (i % 2 ? { at: 9, mood: 5 } : { at: 19, mood: 2 })));
  check(ids(L).includes("card-am"), "picking your card before midday");
  L = H(days((i) => (i % 2 ? { made: true, mood: 5 } : { mood: 2 })));
  check(ids(L).includes("own"), "making your own card");

  // Hidden lines stay hidden; never more than 5; research fills to 3.
  L = H(days((i) => (i % 2 ? { made: true, mood: 5 } : { mood: 2 })), { own: true });
  check(!ids(L).includes("own"), "'That's not it' hides a line for good");
  L = H(days(() => ({ mood: 3 })));
  check(L.length === 3 && L.every((x) => x.research), "no patterns yet: three research lines");
  done();
})();
