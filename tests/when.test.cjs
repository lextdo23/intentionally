// Choosing when (js/when.js, js/card-when.js, alex 2026-11-28): every live card has a when tag; "Keep it for" offers
// their next 3 moments plus Now; tagged cards skip it; one backup reminder 30 minutes after the moment replaces the fixed
// card reminders, none for Now; End your day asks "Still got a minute?" once the moment has passed. No browser needed.
const path = require("path");
const { checker } = require("./helpers.cjs");

(async () => {
  const { check, done } = checker();
  const mem = {};
  globalThis.localStorage = { getItem: (k) => mem[k] || null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.window = globalThis; globalThis.navigator = { userAgent: "node" };
  globalThis.document = { addEventListener: () => {}, visibilityState: "hidden" };
  globalThis.addEventListener = () => {}; globalThis.location = { search: "", href: "http://x/" };
  const J = (f) => import(path.join(__dirname, "..", "js", f));
  const [data, W, when, store, util, notify] = await Promise.all([J("cards-data.js"), J("card-when.js"), J("when.js"), J("store.js"), J("util.js"), J("notify.js")]);

  // Every live card has a valid tag; every card in LATER is "s".
  const live = data.LIVE.map((r) => r[0]);
  check(live.every((id) => W.WHEN[id] && W.validTag(W.WHEN[id])), "every live card has a when tag");
  const later = await J("later.js");
  check(Object.keys(later.LATER).every((id) => W.WHEN[id] === "s"), "dated and week cards are all 's' (they keep their own flow)");
  check(when.forCard(9) === "ask" && when.forCard(173) === "dinner" && when.forCard(180) === "lunch" && when.forCard(405) === null && when.forCard(2) === null,
    "any time asks; tonight goes to After dinner; lunch cards go to Lunch; all-day and when-it-comes-up skip it");

  // Moments: the next three still ahead, earliest first, then Now.
  const s = store.get(), d = new Date(), at = d.getHours() * 60 + d.getMinutes();
  const hm = (m) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;
  const set = { breakfast: hm(at - 120), way: hm(at + 10), lunch: hm(at + 60), work: hm(at + 120), dinner: hm(at + 180) };
  s.when = { wd: set, we: set, asked: 1 }; store.save();
  const ch = when.choices();
  if (at > 120 && at < 1440 - 200) {
    check(ch.length === 4 && ch[3] === "now" && ch[0] === "way" && !ch.includes("breakfast"), "Keep it for: next 3 moments, then Now (" + ch.join(", ") + ")");
  } else check(true, "(skipped: too close to midnight to place moments)");

  // The backup reminder: one, 30 minutes after the moment; none for Now.
  const k = util.dayKey();
  s.notify = { am: { on: true, t: "08:00" }, pm: { on: true, t: "23:50" }, card: { on: true } };
  s.days[k] = { sleep: { bed: 1380, wake: 420, rested: 2, tags: [] }, card: { id: 9, at: Date.now() } };
  when.keep(k, "lunch", "keep");
  const c = s.days[k].card, T = notify.cardTimes(s, Date.now());
  const exp = new Date(util.keyDate(k)); exp.setHours(0, c.wt + 30, 0, 0);
  check(c.when === "lunch" && c.wt != null, "the choice is kept on today's card");
  check(T.length <= 1 && (T.length === 0 || T[0] === exp.getTime()), "one reminder, 30 minutes after the moment, in place of the fixed ones");
  when.keep(k, "now", "change");
  check(notify.cardTimes(s, Date.now()).length === 0, "kept for Now: no reminder");

  // "Still got a minute?" only once the moment has passed and it isn't done; never for Now.
  check(when.passed({ when: "lunch", wt: at - 5 }) && !when.passed({ when: "lunch", wt: at + 30 }) && !when.passed({ when: "now", wt: null }) && !when.passed({ when: "lunch", wt: at - 5, done: true }),
    "Still got a minute? only after the moment, not for Now or a done card");
  done();
})();
