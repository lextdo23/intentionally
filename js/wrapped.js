// The weekly wrapped (alex 2026-11-17, thread "Design weekly and monthly wrapped"). Six screens, like a story:
// 1 the name of your week and its line, 2 guess your best day, 3 something we noticed, 4 what works for you,
// 5 shape next week (keep one or two ideas), 6 your week on a card (keep it, share it).
// It's ready on Sunday once the day is ended (or any day after, for last week), and waits on home until opened.
// Everything is worked out on this phone from what the person noted. Tester data gets choices and numbers only.
import { h, MOODS, MOOD_COL as MC, dayKey, keyDate, addDays, DAY_NAME, DAY_LETTER, MONTH, reduceMotion, LIFELINE, sleepMins, hoursWords, avg } from "./util.js";
import * as store from "./store.js";
import * as deck from "./deck.js";
import * as notify from "./notify.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";
import * as photos from "./photos.js";

// ---------------- small helpers ----------------
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const num = (n) => NUM[n] || String(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const word = (m) => MOODS[m].toLowerCase();
const art = (m) => (m === 3 ? "an " : "a ") + word(m);
const dn = (k) => DAY_NAME[keyDate(k).getDay()];
const and = (a) => (a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : a[0] || "");
const weekStart = (k) => addDays(k, -((keyDate(k).getDay() + 6) % 7));
const hm = (m) => { m = ((m % 1440) + 1440) % 1440; return `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")}`; };
const median = (a) => { const s = a.slice().sort((x, y) => x - y), i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
const nightMin = (bed) => (bed + 720) % 1440;          // bedtimes on one line: 6pm = 360 … 3am = 900
const INK = "#17181b", GOLD = "#e3c486", NIGHT = "#a9b9d6";
const tint = (p) => deck.PILLAR_COL[p] || "#a9a59d";
const PEOPLE = ["Friends", "Family", "Love", "Community"];
const css = (o) => Object.entries(o).map(([k, v]) => `${k}:${typeof v === "number" && !k.startsWith("--") && k !== "z-index" && k !== "opacity" ? v + "px" : v}`).join(";");
function weekDates(w) {
  const A = keyDate(w), B = keyDate(addDays(w, 6));
  return A.getMonth() === B.getMonth() ? `${A.getDate()} – ${B.getDate()} ${MONTH[B.getMonth()]}` : `${A.getDate()} ${MONTH[A.getMonth()]} – ${B.getDate()} ${MONTH[B.getMonth()]}`;
}

// What the app remembers about the wrapped: weeks seen, names and discoveries used (never the same twice running),
// next week's plan, and every week's card (newest first).
export function mem() {
  const s = store.get();
  return (s.wrap = Object.assign({ seen: {}, names: {}, kinds: {}, n: 0, plan: null, weeks: [] }, s.wrap || {}));
}

// ---------------- which week, and is it ready ----------------
// Sunday, once the day is ended: this week. Any other time: last week. Only from day 7, and only if anything was noted.
export function readyWeek(k = dayKey()) {
  const st = store.get(), mon = weekStart(k);
  const w = keyDate(k).getDay() === 0 && st.days[k] && st.days[k].mood != null ? mon : addDays(mon, -7);
  if (mem().seen[w] || !st.started || deck.dayOfUse(addDays(w, 6)) < 7) return null;
  return week(w).some((x) => x.m != null) ? w : null;
}
function week(w) {
  const st = store.get();
  return Array.from({ length: 7 }, (_, i) => { const k = addDays(w, i), d = st.days[k] || {}; return { k, i, d, m: d.mood != null ? d.mood : null }; });
}
const doneCard = (d) => (!d.rest && d.card && d.card.id && (d.card.done || d.card.how >= 1) ? deck.card(d.card.id) : null);

// What doing a card felt like, said back in a few words (the evening step's answers).
const FELT_AFTER = { "Enjoyed it": "You enjoyed it.", "Proud of myself": "You felt proud after.", "Glad it's done": "Glad it's done.", Calmer: "You felt calmer after.",
  "Closer to someone": "You felt closer to someone after.", "More energy": "You had more energy after.", "Felt like me": "You felt like yourself after." };
const FELT_ONE = { "Enjoyed it": "You enjoyed this one.", "Proud of myself": "You felt proud of yourself after this one.", "Glad it's done": "You were glad you did this one.",
  Calmer: "You felt calmer after this one.", "Closer to someone": "You felt closer to someone after this one.", "More energy": "You had more energy after this one.", "Felt like me": "You felt like yourself after this one." };
const goodFelt = (felt) => (felt || []).find((f) => FELT_ONE[f]);

// ---------------- the week, worked out ----------------
export function build(w) {
  const st = store.get(), m0 = mem(), days = week(w), noted = days.filter((x) => x.m != null), ms = noted.map((x) => x.m);
  const n = noted.length, max = Math.max(...ms), min = Math.min(...ms);
  const hard = n > 0 && ms.filter((m) => m <= 2).length > n / 2;
  const done = days.map((x) => ({ ...x, c: doneCard(x.d) })).filter((x) => x.c);
  const D = { w, days, noted, n, max, min, hard, done, dates: weekDates(w), ms: days.map((x) => x.m) };
  D.light = noted.filter((x) => x.m === max).slice(-2);                    // best (or lightest) day(s), at most two
  D.top = max;

  // 1 · the name of the week (first that fits, never the same name two weeks running if another fits)
  const names = [], add = (key, name, line, extra) => names.push({ key, name, line, ...extra });
  const first = noted[0], last = noted[n - 1];
  if (hard) {
    if (max >= 3) add("hard-light", `A hard week, with ${art(max)} ${dn(D.light[0].k)}`, `Most days felt low. ${dn(D.light[0].k)} was lighter.`);
    if (done.length) add("hard-card", "A hard week, and you did your card", `Most days felt heavy. You still did your card on ${dn(done[done.length - 1].k)}.`);
    add("heavy", "A heavy week", "You noted it anyway. Support is one tap away if you want it.", { heavy: true });
  } else {
    if (!m0.n) add("first", "Your first week", done.length ? `${cap(num(n))} ${n === 1 ? "evening" : "evenings"}, ${num(done.length)} ${done.length === 1 ? "card" : "cards"}, and the first look at your patterns.` : `${cap(num(n))} ${n === 1 ? "evening" : "evenings"} noted, and the first look at your patterns.`);
    if (n <= 3) add("quiet", "A quiet week", `${cap(num(n))} ${n === 1 ? "evening" : "evenings"} noted. ${n === 1 ? "It's here." : n === 2 ? "Both are here." : `All ${num(n)} are here.`}`);
    if (n >= 4) {
      const a = avg(ms.slice(0, 3)), b = avg(ms.slice(-3));
      if (b - a >= 2) add("comeback", "A comeback week", `${cap(word(first.m))} on ${dn(first.k)}, ${word(last.m)} by ${dn(last.k)}.`);
      if (last.m === max && max >= 4 && ms.slice(0, -1).every((m) => m < max)) add("finish", "A big finish", `You saved the best for ${dn(last.k)}.`);
      const rest = ms.slice(1);
      if (first.m === max && max >= 4 && rest.every((m) => m < max && m >= 3)) {
        const mo = rest.slice().sort((x, y) => rest.filter((v) => v === y).length - rest.filter((v) => v === x).length || y - x)[0];
        add("start", "A strong start", `${cap(word(first.m))} on ${dn(first.k)}, ${word(mo)} most of the way.`);
      }
    }
    const byP = (ps) => done.filter((x) => ps.includes(x.c.pillar)).length;
    const restDays = days.filter((x) => x.d.rest).length;
    if (byP(PEOPLE) >= 3) add("people", "A people week", `${cap(num(byP(PEOPLE)))} of your cards were about the people in your life.`);
    if (byP(["Move"]) >= 3) add("move", "A moving week", `You moved on ${num(byP(["Move"]))} days this week.`);
    if (byP(["Outdoors"]) >= 3) add("outside", "An outside week", `You got outside on ${num(byP(["Outdoors"]))} days.`);
    if (byP(["Play and create"]) >= 3) add("making", "A making week", `${cap(num(byP(["Play and create"])))} cards about making something.`);
    if (byP(["Learn"]) >= 3) add("learning", "A learning week", `You learned something on ${num(byP(["Learn"]))} days.`);
    if (restDays >= 2) add("rest", "A week of rest", `${cap(num(restDays))} rest days, taken on purpose.`);
    else if (byP(["Rest"]) >= 3) add("rest", "A week of rest", `${cap(num(byP(["Rest"])))} Rest cards this week.`);
    const slept = days.filter((x) => x.d.sleep && sleepMins(x.d.sleep) >= 420).length;
    if (slept >= 5) add("slept", "A well-slept week", `${cap(num(slept))} nights of 7 hours or more.`);
    if (n >= 2 && min >= 4) add("allround", "A good week all round", "Every day you noted felt good or better.");
    if (n >= 2 && max - min <= 1 && min >= 3) { const mo = ms.slice().sort((x, y) => ms.filter((v) => v === y).length - ms.filter((v) => v === x).length || y - x)[0]; add("steady", "A steady week", `${cap(word(mo))} or close to it every day you noted.`); }
    const hi = D.light.map((x) => dn(x.k));
    add("updown", "An up and down week", `Some ups and downs. ${and(hi)} ${hi.length > 1 ? "were the high points" : "was the high point"}.`);
  }
  const lastKey = m0.names[addDays(w, -7)];
  D.name = names.find((x) => x.key !== lastKey) || names[0];

  // 2 · guess your best day (lightest on a hard week, no game): needs 3 days and a day that stands out
  if (n >= 3 && max > min) D.best = { days: noted, top: D.light, rows: thatDay(D.light[0], days), hard };

  // 3 · something we noticed: one kind a week, never the same kind twice running
  const kinds = hard ? [rhythm, deckGrew, thenNow] : [pattern, thenNow, rhythm, deckGrew];
  const found = kinds.map((f) => f(D)).filter(Boolean), lastKind = m0.kinds[addDays(w, -7)];
  D.find = found.find((f) => f.kind !== lastKind) || found[0] || null;
  D.usual = usualBed(days);

  // 4 · what works for you
  D.works = works(D);
  D.loved = D.works ? D.works.loved : null;

  // 6 · my week was about: pillars given time this week, most first, up to three
  const pc = {};
  days.forEach((x) => (x.d.pil || []).forEach((p) => (pc[p] = (pc[p] || 0) + 1)));
  D.pil = Object.keys(pc).sort((a, b) => pc[b] - pc[a]).slice(0, 3);
  return D;
}

// The facts that set a day apart: its card and how it felt, its night if it was the longest, its own evening words.
function thatDay(x, days) {
  const rows = [], d = x.d, c = doneCard(d);
  if (d.rest) rows.push(["rest", "A rest day", "On purpose."]);
  else if (c) { const f = goodFelt(d.card.felt); rows.push(["card", c.text, `Your ${c.pillar} card.${f ? " " + FELT_AFTER[f] : ""}`]); }
  const others = days.filter((y) => y !== x && y.d.sleep).map((y) => sleepMins(y.d.sleep));
  if (d.sleep && others.length >= 2) { const mine = sleepMins(d.sleep); if (mine > Math.max(...others) && mine - avg(others) >= 45) rows.push(["moon", hoursWords(mine), "Your longest night's sleep this week."]); }
  const elsewhere = new Set(days.filter((y) => y !== x).flatMap((y) => y.d.feel || []));
  const own = (d.feel || []).filter((f) => !elsewhere.has(f)).slice(0, 3);
  if (own.length) rows.push(["feel", cap(own.join(", ")), own.length > 1 ? "Your words for the evening." : "Your word for the evening."]);
  if (!rows.length) rows.push(["feel", "Nothing special on paper", "Some days are just good."]);
  return rows.slice(0, 3);
}

// --- the four kinds of discovery ---
function pattern(D) {
  const wks = [addDays(D.w, -14), addDays(D.w, -7), D.w].map(week);
  for (let i = 6; i >= 0; i--) {
    const hit = wks.every((W) => { const ms = W.filter((x) => x.m != null).map((x) => x.m); return ms.length >= 3 && W[i].m != null && W[i].m === Math.max(...ms) && W[i].m >= 4; });
    if (hit) return { kind: "pattern", c: MC[D.days[i].m], lab: "Three weeks running", big: DAY_NAME[keyDate(D.days[i].k).getDay()] + "s", line: "have been one of your best days, three weeks in a row.", wks, i };
  }
  return null;
}
function thenNow(D) {
  const nights = (W) => W.filter((x) => x.d.sleep).map((x) => x.d.sleep);
  const a = nights(week(addDays(D.w, -7))), b = nights(D.days);
  if (a.length < 3 || b.length < 3) return null;
  const A = avg(a.map(sleepMins)), B = avg(b.map(sleepMins)), diff = Math.round(B - A);
  if (diff < 20) return null;
  const earlier = avg(a.map((s) => nightMin(s.bed))) - avg(b.map((s) => nightMin(s.bed))), later = avg(b.map((s) => s.wake)) - avg(a.map((s) => s.wake));
  const foot = earlier >= later && earlier > 5 ? "Most of it came from earlier nights, not later mornings." : later > earlier && later > 5 ? "Most of it came from later mornings." : "";
  return { kind: "then", c: NIGHT, lab: "Compared with last week", big: diff < 60 ? `${diff} minutes` : hoursWords(diff), line: "more sleep a night, on average.", A, B, foot };
}
function usualBed(days) {
  const beds = days.filter((x) => x.d.sleep).map((x) => nightMin(x.d.sleep.bed));
  return beds.length >= 4 ? (Math.round(median(beds) / 5) * 5 + 720) % 1440 : null;
}
function rhythm(D) {
  const nights = D.days.filter((x) => x.d.sleep);
  if (nights.length < 4) return null;
  const usual = usualBed(D.days), u = nightMin(usual);
  const near = nights.filter((x) => Math.abs(nightMin(x.d.sleep.bed) - u) <= 30 && x.m != null);
  const good = near.filter((x) => x.m >= 4).length >= Math.max(2, near.length / 2);
  return { kind: "rhythm", c: NIGHT, lab: "Your rhythm", big: hm(usual), line: `is your usual lights out.${good ? " The days after those nights mostly felt good." : ""}`, nights, u };
}
function deckGrew(D) {
  const st = store.get(), before = new Set();
  Object.keys(st.days).filter((k) => k < D.w).forEach((k) => { const c = st.days[k].card; (c && c.hands || []).flat().forEach((id) => before.add(id)); if (c && c.id) before.add(c.id); });
  const met = [];
  D.days.forEach((x) => { const c = x.d.card; (c && c.hands || []).flat().forEach((id) => { if (!before.has(id) && !met.includes(id) && !deck.isOwn(id) && deck.card(id)) met.push(id); }); });
  if (met.length < 3) return null;
  const liked = new Set(D.days.filter((x) => x.d.card && x.d.card.id && x.d.card.how >= 3).map((x) => x.d.card.id));
  const enjoyed = met.filter((id) => liked.has(id));
  const show = enjoyed.concat(met.filter((id) => !liked.has(id))).slice(0, 6);
  return { kind: "deck", c: GOLD, lab: "Your deck this week", big: String(met.length), line: enjoyed.length ? `new cards met. You enjoyed ${num(enjoyed.length)} of them.` : "new cards met.", show, liked };
}

// --- what works for you ---
function works(D) {
  const ok = D.hard ? (x) => x.d.card.how >= 2 : (x) => x.d.card.how >= 3;
  const good = D.done.filter(ok);
  if (!good.length) return null;
  const loved = good.slice().sort((a, b) => (b.d.card.how || 0) - (a.d.card.how || 0) || (b.k > a.k ? 1 : -1))[0];
  const byP = {};
  good.forEach((x) => (byP[x.c.pillar] = (byP[x.c.pillar] || []).concat(x)));
  const top = Object.keys(byP).sort((a, b) => byP[b].length - byP[a].length)[0];
  const lab = D.hard ? "What helped a bit" : "What works for you";
  const pick = (list) => { const l = list.slice(-3); if (!l.includes(loved) && list.includes(loved)) l[0] = loved; return l; };
  if (byP[top].length >= 2) {
    const n = byP[top].length;
    return { kind: "pillar", pillar: top, c: tint(top), lab, big: `${top} cards`, loved,
      line: D.hard ? "On a hard week, these were the ones that felt okay." : n === 2 ? "Both left you feeling good." : `All ${num(Math.min(n, 3))} left you feeling good.`, cards: pick(byP[top]) };
  }
  const tiny = D.done.filter((x) => x.c.size === "Tiny");
  if (!D.hard && tiny.length >= 2 && tiny.every(ok)) return { kind: "tiny", c: GOLD, lab, big: "Tiny cards", line: "Every tiny card you did left you feeling better.", cards: pick(tiny), loved };
  const f = goodFelt(loved.d.card.felt);
  return { kind: "one", pillar: loved.c.pillar, c: tint(loved.c.pillar), lab: D.hard ? "What helped a bit" : "The card you loved", big: "", loved,
    line: D.hard ? "On a hard week, this one felt okay." : f ? FELT_ONE[f] : "You enjoyed this one.", cards: [loved] };
}

// --- shape next week: ideas that each change something, and say so on their face ---
function planDates(k = dayKey()) {
  const end = keyDate(k).getDay() === 0 ? addDays(k, 7) : addDays(weekStart(k), 6);
  return { start: k, end };
}
function ideas(D) {
  const k = dayKey(), { end } = planDates(k), out = [];
  if (D.hard) {
    out.push({ kind: "tiny", tint: GOLD, tag: "Any pillar", title: "Only tiny cards", sub: "Every draw a small one, two minutes or less.", from: "Smaller", done: "Every card you draw next week will be a tiny one.", line: "only tiny cards" });
    let wed = null; for (let x = addDays(k, 1); x <= end; x = addDays(x, 1)) if (keyDate(x).getDay() === 3) { wed = x; break; }
    const day = wed || addDays(k, 1), when = wed ? "Wednesday" : "Tomorrow";
    out.push({ kind: "rest", day, tint: NIGHT, tag: "Rest", title: wed ? "A rest day midweek" : "A rest day tomorrow", sub: `${when} off, no card. You can still check in.`, from: "Lighter",
      done: `${when} will be a rest day, just your check-ins.`, line: wed ? "a rest day on Wednesday" : "a rest day tomorrow" });
    out.push({ kind: "same", tint: "#a9c4b5", tag: "Your deck", title: "Keep it as it is", sub: "Nothing changes. That's a fine choice too.", from: "No change", done: "Next week stays just as it is." });
    out.unshift(out.splice(1, 1)[0]);   // the rest day leads
    return out;
  }
  const w = D.works && D.works.pillar && D.works.kind === "pillar" ? D.works.pillar : null;
  if (D.usual != null && notify.supported() && Notification.permission === "granted") {
    const at = (D.usual - 20 + 1440) % 1440;
    out.push({ kind: "nudge", at, tint: NIGHT, tag: "Rest", title: `Keep your ${hm(D.usual)} nights`, sub: `A quiet wind-down nudge at ${hm(at)}, 20 minutes before your usual lights out.`,
      from: "From: your rhythm", done: `A quiet nudge at ${hm(at)} each night.`, line: `a wind-down nudge at ${hm(at)}` });
  }
  if (w) out.push({ kind: "more", pillar: w, tint: tint(w), tag: w, title: `More ${w} cards`, sub: "They'll turn up more often in your draws.", from: "From: what works for you", done: `${w} cards will turn up more in your draws.`, line: `more ${w} cards` });
  // Something new: a pillar they chose that has hardly come up in the last two weeks.
  const st = store.get(), seen = {}, mine = deck.myPillars().map((p) => p.name).filter((p) => p !== w && deck.deck().some((id) => deck.card(id).pillar === p));
  for (let i = 1; i <= 14; i++) { const c = (st.days[addDays(k, -i)] || {}).card; (c && c.hands || []).flat().forEach((id) => { const cc = deck.card(id); if (cc) seen[cc.pillar] = (seen[cc.pillar] || 0) + 1; }); }
  const rare = mine.sort((a, b) => (seen[a] || 0) - (seen[b] || 0))[0], av = mine.length ? avg(mine.map((p) => seen[p] || 0)) : 0;
  if (rare && (seen[rare] || 0) <= av / 2) out.push({ kind: "try", pillar: rare, tint: tint(rare), tag: rare, title: `Try ${rare}`, sub: "You picked it but it's rarely come up. A few will.", from: "Something new", done: `A few ${rare} cards will turn up in your draws.`, line: `a few ${rare} cards` });
  if (out.length < 3) out.push({ kind: "same", tint: "#a9c4b5", tag: "Your deck", title: "Keep it as it is", sub: "Nothing changes. That's a fine choice too.", from: "No change", done: "Next week stays just as it is." });
  // The one that builds on what worked starts on top.
  const lead = out.findIndex((x) => x.kind === "more");
  if (lead > 0) out.unshift(out.splice(lead, 1)[0]);
  return out.slice(0, 3);
}

// ---------------- next week's plan: read by the draw, home and nudges ----------------
export function planItems(k = dayKey()) { return deck.planItems(k); }
// A rest day kept for next week arrives on its own, as long as no card was kept that day.
export function applyPlan(k = dayKey()) {
  const it = planItems(k).find((x) => x.kind === "rest" && x.day === k), d = store.get().days[k] || {};
  if (!it || d.rest || (d.card && d.card.id) || d.mood != null) return;
  const dd = store.day(k); dd.rest = true; dd.planRest = 1; store.save(); log("wrap_rest_day");
}
const until = (end) => (end === dayKey() ? "until tonight" : `until ${dn(end)}`);
function planSub(it, end) {
  if (it.kind === "nudge") return `Every night ${until(end)}, then it stops by itself.`;
  if (it.kind === "tiny") return `Every draw a tiny one ${until(end)}, then it stops by itself.`;
  if (it.kind === "rest") return "No card that day. You can still check in.";
  return `Your draws lean that way ${until(end)}, then it stops by itself.`;
}
function stopItem(it) { it.off = true; store.save(); notify.sync(); log("wrap_stop", it.kind); }

// One quiet line under the level on home: "Your weekly recap is ready" when there's a wrapped to open, and what you kept
// for this week (never a second card: home is about today's card).
export function homeLines(rerender) {
  const out = [], w = readyWeek();
  if (w) {
    const m = mem(); if (m.readyLogged !== w) { m.readyLogged = w; store.save(); log("wrap_ready"); }
    out.push(h("button.wr-home.ready", { onclick: () => openWrapped(w, rerender) }, h("i", { style: { background: "var(--sun)", borderRadius: "50%" } }), h("span", null, "Your weekly recap is ready"), h("span.chev", { "aria-hidden": "true" }, "›")));
  }
  const items = planItems().filter((x) => x.kind !== "same");
  if (items.length) {
    const b = h("button.wr-home", { onclick: () => { log("wrap_line_tap"); planSheet(rerender); } }, h("i", { style: { background: items[0].tint } }),
      h("span", null, "This week: " + and(items.map((x) => x.line))), h("span.chev", { "aria-hidden": "true" }, "›"));
    out.push(b);
  }
  return out.length ? h("div.wr-lines", null, out) : null;
}
function planSheet(rerender) {
  const p = mem().plan;
  openSheet((panel, close) => {
    panel.append(h("span.wr-from", null, "From your week"));
    planItems().filter((x) => x.kind !== "same").forEach((it) => {
      panel.append(h("div.col", { style: { gap: "4px" } }, h("h2", null, cap(it.line)), h("p.wr-sheet-sub", null, planSub(it, p.end))),
        h("button.btn-soft.wr-sheet-btn", { onclick: () => { stopItem(it); close("stop"); rerender && rerender(); } }, it.kind === "nudge" ? "Stop the nudge" : "Stop this"));
    });
    if (p.week) panel.append(h("button.btn-soft.wr-sheet-btn", { onclick: () => { close("change"); setTimeout(() => openWrapped(p.week, rerender, { only: "next" }), 300); } }, "Change it"));
  }, { label: "From your week" });
}

// ---------------- the screens ----------------
let open = null;
export function openWrapped(w, onClose, opts = {}) {
  if (open) return;
  const D = build(w), m = mem();
  const all = opts.only ? [["next", scrNext]] : [["name", scrName], D.best && ["best", scrBest], D.find && ["find", scrFind], D.works && ["works", scrWorks], ["next", scrNext], ["poster", scrPoster]].filter(Boolean);
  const host = h("div.wr", { role: "dialog", "aria-modal": "true", "aria-label": "Your week" }), stage = h("div.wr-stage");
  host.append(stage); document.body.append(host); document.body.classList.add("in-wrap");
  const fit = () => host.style.setProperty("--ws", String(Math.min(1, innerWidth / 430, innerHeight / 932)));
  fit(); addEventListener("resize", fit);
  let i = -1, cur = null, timer = null, reached = 0;
  const ctx = { D, n: all.length, go: (j) => show(j), next: () => show(i + 1), close: () => finish(true), screens: all.map((x) => x[0]) };
  open = ctx;
  if (!opts.only) log("wrap_open", { screens: all.map((x) => x[0]).join(",") });
  function show(j) {
    if (j >= all.length) return finish(true);
    if (j < 0 || j === i) return;
    clear(); i = j; reached = Math.max(reached, j);
    const old = cur;
    cur = all[j][1](ctx, j);
    host.classList.toggle("full", !!cur.full); host.style.setProperty("--bg", cur.bg || "");
    stage.append(cur.el);
    requestAnimationFrame(() => requestAnimationFrame(() => cur.el.classList.add("in")));
    if (old) { old.el.classList.remove("in"); old.el.classList.add("out"); setTimeout(() => old.el.remove(), 400); old.stop && old.stop(); }
    if (cur.auto) timer = { left: cur.auto, t0: Date.now(), id: setTimeout(() => show(i + 1), cur.auto) };
    if (!opts.only) log("wrap_screen", all[j][0]);
    if (all[j][0] === "poster") { m.seen[w] = 1; store.save(); notify.sync(); } // seen: no Monday reminder
  }
  function clear() { if (timer) clearTimeout(timer.id); timer = null; }
  function finish(done) {
    clear(); removeEventListener("resize", fit); cur && cur.stop && cur.stop();
    if (!opts.only) log(done && all[i][0] === "poster" ? "wrap_done" : "wrap_quit", all[i] ? all[i][0] : "");
    host.classList.add("closing"); setTimeout(() => host.remove(), reduceMotion() ? 0 : 350);
    document.body.classList.remove("in-wrap"); open = null;
    onClose && onClose();
  }
  // Tap the right of the screen for the next one, the left to go back; hold to pause a screen that moves on by itself.
  let downT = 0, paused = false;
  stage.addEventListener("pointerdown", (e) => {
    downT = Date.now();
    if (timer && !e.target.closest("button, .wr-tap")) { clearTimeout(timer.id); timer.left -= Date.now() - timer.t0; paused = true; cur.el.classList.add("paused"); }
  });
  const resume = () => { if (!paused) return; paused = false; cur.el.classList.remove("paused"); if (timer) { timer.t0 = Date.now(); timer.id = setTimeout(() => show(i + 1), Math.max(300, timer.left)); } };
  stage.addEventListener("pointerup", resume); stage.addEventListener("pointercancel", resume);
  stage.addEventListener("click", (e) => {
    if (e.target.closest("button, a, .wr-tap")) return;
    if (Date.now() - downT > 350) return;                     // that was a hold, not a tap
    const r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (x < 0.28 && i > 0 && all[i][0] !== "poster") { show(i - 1); return; }
    if (cur.canNext ? cur.canNext() : true) show(i + 1); else cur.nudge && cur.nudge();
  });
  stage.addEventListener("keydown", (e) => { if (e.key === "Escape") finish(false); });
  ctx.quit = () => finish(false);
  show(0);
}

// The bars at the top (one per screen) and the round ✕.
function chrome(ctx, j, auto) {
  const bars = h("div.wr-bars", { "aria-hidden": "true" }, Array.from({ length: ctx.n }, (_, k) => h("span" + (k < j ? ".on" : k === j ? ".t" : ""), k === j ? { style: auto ? `--t:${auto}ms` : "" } : null, k === j ? h("i" + (auto ? ".run" : ".full")) : null)));
  const x = h("button.wr-x", { "aria-label": "Close", onclick: () => ctx.quit() },
    h("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2.2", "stroke-linecap": "round", "aria-hidden": "true" }, h("path", { d: "M6 6l12 12M18 6L6 18" })));
  return [bars, x];
}
const TEASE = { best: "Next: guess your best day", find: "Next: something we noticed", works: "Next: what works for you", next: "Next: next week", poster: "Next: your week on a card" };
const teaser = (ctx, j, d) => { const nx = ctx.screens[j + 1]; return nx && TEASE[nx] ? h("div.wr-ab.wr-next.wr-fade", { style: `--d:${d}s` }, ctx.D.hard && nx === "next" ? "Next: a lighter week" : TEASE[nx]) : null; };
const ab = (cls, style, ...kids) => h("div.wr-ab" + cls, { style: typeof style === "string" ? style : css(style) }, ...kids);

// ---- 1 · the name of your week, and its line drawn day by day ----
function scrName(ctx, j) {
  const D = ctx.D, N = D.name, c = MC[D.top];
  const SEG = 0.5, START = 1.1, P = D.days.map((x, i) => (x.m == null ? null : [i, x.m])).filter(Boolean);
  const auto = Math.round((START + P.length * SEG + 2.6) * 1000);
  const el = h("section.wr-scr.wr-ink");
  const big = N.name.length > 24 ? 48 : N.name.length > 16 ? 56 : 64;
  el.append(...chrome(ctx, j, auto), teaser(ctx, j, auto / 1000 - 1.6) || "",
    ab(".wr-textblock", { left: 24, right: 24, top: 136 },
      h("div.wr-lab.wr-rise", null, "This week was"),
      h("div.wr-big.wr-rise", { style: `--d:.15s;font-size:${big}px` }, N.name),
      h("div.wr-line.wr-rise", { style: "--d:.5s" }, N.line)),
    ab("", { left: 24, top: 442, width: 382, height: 430 }, moodLine(D.days, { W: 382, H: 430, start: START, seg: SEG })),
    N.heavy ? ab(".wr-fade.wr-help", "left:0;right:0;top:880px;text-align:center;--d:1.5s", LIFELINE()) : "");
  return { el, auto, full: true, bg: c };
}
// The week's line: dots in mood colours with their word, the line growing from day to day.
function moodLine(days, { W, H, start, seg }) {
  const X = (i) => 24 + i * (W - 48) / 6, Y = (m) => 50 + (6 - m) * (H - 140) / 6, base = H - 60;
  const P = days.map((x, i) => (x.m == null ? null : [X(i), Y(x.m), x.m])).filter(Boolean);
  const at = (k) => start + k * seg;
  const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, width: String(W), height: String(H), "aria-hidden": "true", style: "overflow:visible" });
  if (P.length > 1) {
    let d = `M${P[0][0]},${P[0][1]}`; for (let k = 1; k < P.length; k++) { const [x0, y0] = P[k - 1], [x1, y1] = P[k], cx = (x0 + x1) / 2; d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`; }
    svg.append(h("path.wr-fadein", { d: `${d} L${P[P.length - 1][0]},${base} L${P[0][0]},${base} Z`, fill: "rgba(23,24,27,.08)", style: `--d:${at(P.length - 1)}s` }));
    for (let k = 1; k < P.length; k++) { const [x0, y0] = P[k - 1], [x1, y1] = P[k], cx = (x0 + x1) / 2;
      svg.append(h("path.wr-seg", { pathLength: "1", d: `M${x0},${y0} C${cx},${y0} ${cx},${y1} ${x1},${y1}`, fill: "none", stroke: INK, "stroke-width": "5", "stroke-linecap": "round", style: `--d:${at(k - 1)}s` })); }
  }
  P.forEach(([x, y, m], k) => {
    const lastOne = k === P.length - 1, rg = m === 5;
    svg.append(h("g.wr-popg", { style: `--d:${at(k)}s` }, h("circle", { cx: x, cy: y, r: "11", fill: MC[m], stroke: INK, "stroke-width": "3" })),
      h("text.wr-word", { x: String(rg ? x + 14 : x), y: String(rg ? y + 28 : y - 22), dx: lastOne && !rg ? "11" : "0", "font-size": m === 6 ? "20" : "15", "font-weight": "700",
        "text-anchor": lastOne && !rg ? "end" : rg ? "start" : "middle", fill: INK, style: `--d:${at(k) + 0.05}s` }, word(m)));
  });
  days.forEach((x, i) => svg.append(h("text", { x: String(X(i)), y: String(H - 22), "font-size": "15", "font-weight": "700", "text-anchor": "middle", fill: INK, opacity: x.m == null ? ".3" : "1" }, DAY_LETTER[keyDate(x.k).getDay()])));
  return svg;
}

// ---- 2 · guess your best day ----
const ICON = {
  card: [["rect", { x: "5", y: "2.5", width: "12", height: "17", rx: "2.5" }], ["circle", { cx: "11", cy: "11", r: "2", fill: "currentColor", stroke: "none" }]],
  moon: [["path", { d: "M15.5 14.5A7 7 0 0 1 8 4a7.5 7.5 0 1 0 9.5 9.5 7 7 0 0 1-2 1z", fill: "currentColor", stroke: "none" }]],
  feel: [["circle", { cx: "8.5", cy: "11", r: "5" }], ["circle", { cx: "13.5", cy: "11", r: "5" }]],
  rest: [["path", { d: "M4 15h14M6 15V9a5 5 0 0 1 10 0v6" }]],
};
const icon = (k) => h("svg", { width: "22", height: "22", viewBox: "0 0 22 22", fill: "none", stroke: "currentColor", "stroke-width": "2", "aria-hidden": "true" }, ICON[k].map(([t, a]) => h(t, a)));
function scrBest(ctx, j) {
  const B = ctx.D.best, n = B.days.length, el = h("section.wr-scr.wr-best");
  const guessing = !B.hard;
  el.append(...chrome(ctx, j, guessing ? 6000 : 0),
    ab(".wr-lab.wr-pre", { left: 24, top: 136 }, B.hard ? "Your lightest day" : "Guess first"),
    ab(".wr-q.wr-pre", { left: 24, right: 24, top: 164 }, guessing ? "Which day felt best?" : ""),
    ab(".wr-hint.wr-pre", { top: 704 }, guessing ? "Tap a day" : ""));
  // Face-down day cards: three to a row (four on top when all seven were noted).
  const rows = n === 7 ? [4, 3] : n > 3 ? [3, n - 3] : [n], CW = n === 7 ? 82 : 104, CH = Math.round(CW * 1.4), gap = n === 7 ? 18 : 35;
  const pos = []; rows.forEach((cnt, r) => { const w = cnt * CW + (cnt - 1) * gap, x0 = (430 - w) / 2; for (let c = 0; c < cnt; c++) pos.push([x0 + c * (CW + gap), (n === 7 ? 300 : 306) + r * (CH + 44)]); });
  const SH = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cards = B.days.map((x, k) => {
    const [l, t] = pos[k];
    const cd = h("button.wr-ab.wr-cd", { type: "button", "aria-label": dn(x.k), style: css({ "--c": MC[x.m], left: l, top: t, width: CW, height: CH }) },
      h("div.bk"), h("div.fc", null, h("small", null, dn(x.k)), h("span", null, word(x.m)), h("em", null, DAY_LETTER[keyDate(x.k).getDay()]), h("div.hc")));
    el.append(cd, ab(".wr-dl.wr-pre", { left: l, top: t + CH + 8, width: CW }, SH[keyDate(x.k).getDay()]));
    return cd;
  });
  const after = h("div"); el.append(after);
  let done = false, auto = null;
  const reveal = (g) => {
    if (done) return; done = true; clearTimeout(auto); el.classList.remove("run");
    if (g != null) cards[g].classList.add("pick");
    const flipAt = 350;
    cards.forEach((e, k) => setTimeout(() => { e.classList.add("fl"); setTimeout(() => e.classList.add("face"), 250); }, reduceMotion() ? 0 : flipAt + k * 90));
    const best = B.top.map((x) => B.days.indexOf(x)), m = B.top[0].m, tie = best.length > 1;
    let lab = "Your best day", res = "none";
    if (B.hard) lab = "Your lightest day";
    else if (g != null && best.includes(g)) { lab = "You knew it"; res = "right"; }
    else if (g != null && B.days[g].m >= m - 1) { lab = `So close. ${dn(B.days[g].k)} was right behind.`; res = "close"; }
    else if (g != null) res = "off";
    if (!B.hard) log("wrap_guess", res);
    setTimeout(() => {
      el.classList.add("done");
      after.append(ab(".wr-lab.wr-aft", "left:24px;top:136px;--d:.1s", lab), teaser(ctx, j, 2) || "");
      const sw = 40, sg = 12, sx = (430 - (n * sw + (n - 1) * sg)) / 2;
      const names = B.top.map((x) => dn(x.k)), bigText = names.join(" and ");
      cards.forEach((e, k) => {
        e.classList.remove("pick"); e.tabIndex = -1;
        const bi = best.indexOf(k);
        if (bi >= 0) {
          e.classList.add(bi ? "hero2" : "hero");
          Object.assign(e.style, { left: 24 + bi * 10 + "px", top: 172 + bi * 8 + "px", width: "382px", height: "536px", zIndex: String(3 - bi), rotate: bi ? "2deg" : "0deg" });
          // The day's photo, if it has one, at the top of the card (alex 2026-11-18); then two of the day's lines fit.
          const phk = !bi && B.top.map((x) => x.k).find((x) => photos.has(x));
          if (!bi) e.querySelector(".hc").append(
            phk ? h("div.hphoto.wr-aft", { style: "--d:.6s" }, photos.img(phk, "full")) : "",
            h("div.hday.wr-aft", { style: `--d:.7s;font-size:${tie ? 34 : phk ? 40 : 52}px` }, bigText),
            h("div.hmood.wr-aft", { style: "--d:.85s" }, tie ? `Both felt ${word(m)}.` : `felt ${word(m)}.`),
            h("div.hline.wr-aft", { style: "--d:1s" }), h("div.whyh2.wr-aft", { style: "--d:1.1s" }, "That day"),
            ...(phk ? B.rows.slice(0, 2) : B.rows).map(([ic, t, s], r) => h("div.hrow.wr-aft", { style: `--d:${1.2 + r * 0.25}s` }, h("div.ic", null, icon(ic)), h("div", null, h("b", null, t), h("span", null, s)))));
        } else { e.classList.add("mini"); Object.assign(e.style, { left: sx + k * (sw + sg) + "px", top: "736px", width: sw + "px", height: "56px" }); }
      });
    }, reduceMotion() ? 0 : flipAt + n * 90 + 700);
  };
  cards.forEach((e, k) => e.addEventListener("click", (ev) => { ev.stopPropagation(); if (done) ctx.next(); else if (guessing) reveal(k); }));
  // Six seconds to guess, then it shows itself. A hard week has no game: the cards just turn.
  requestAnimationFrame(() => el.classList.add("run"));
  auto = setTimeout(() => reveal(null), B.hard ? 1200 : 6000);
  return { el, canNext: () => done, nudge: () => {}, stop: () => clearTimeout(auto) };
}

// ---- 3, 4, 5 share a frame: the dark sky and one coloured card ----
function frame(ctx, j, { c, lab, height = 600, auto = 0, tease = 3.5 }, ...kids) {
  const el = h("section.wr-scr");
  el.append(...chrome(ctx, j, auto), ab(".wr-lab.wr-rise", { left: 24, top: 136 }, lab),
    h("div.wr-ab.wr-card.wr-rise", { style: css({ "--c": c, left: 24, top: 172, width: 382, height, "--d": ".15s" }) }, ...kids));
  if (tease != null) { const t = teaser(ctx, j, tease); if (t) el.append(t); }
  return el;
}
const bigEl = (t, d = 0.4, size) => h("div.wr-big.wr-rise", { style: `--d:${d}s${size ? `;font-size:${size}px` : ""}` }, t);
const lineEl = (t, d = 0.6, extra = "") => h("div.wr-line.wr-rise", { style: `--d:${d}s;${extra}` }, t);

// ---- 3 · something we noticed ----
function scrFind(ctx, j) {
  const F = ctx.D.find, auto = 7000;
  let pic;
  if (F.kind === "pattern") {
    pic = h("div.wr-pic", null, F.wks.map((W, r) => [h("div.wl.wr-fade", { style: `--d:${0.8 + r * 0.3}s` }, ["2 weeks ago", "Last week", "This week"][r]),
      h("div.wk", null, W.map((x, i) => h(`div.mc.wr-pop.${x.m == null ? "none" : i === F.i ? "hi" : "dim"}`, { style: `--m:${x.m == null ? "transparent" : MC[x.m]};--d:${i === F.i ? 2.2 + r * 0.2 : 0.9 + r * 0.3 + i * 0.04}s` }, DAY_LETTER[keyDate(x.k).getDay()])))]));
  } else if (F.kind === "then") {
    const S = Math.max(F.A, F.B) * 1.12, a = F.A / S * 100, b = F.B / S * 100;
    pic = h("div.wr-pic", null,
      h("div.bl.wr-fade", { style: "--d:.9s" }, h("span", null, "Last week"), h("span.tick", null, hoursWords(Math.round(F.A)))), h("div.bar.wr-fade", { style: "--d:.9s" }, h("i.wr-grow", { style: `width:${a}%;--d:1s` })),
      h("div.bl.wr-fade", { style: "--d:1.4s" }, h("span", null, "This week"), h("span.tick", null, hoursWords(Math.round(F.B)))),
      h("div.bar.wr-fade", { style: "--d:1.4s" }, h("i.base.wr-grow", { style: `width:${a}%;--d:1.5s` }), h("i.extra.wr-grow", { style: `left:${a}%;width:${b - a}%;--d:2.4s` })),
      F.foot ? h("p.wr-fade", { style: "--d:2.9s;font-size:15px;margin-top:16px;opacity:.8" }, F.foot) : null);
  } else if (F.kind === "rhythm") {
    const bs = F.nights.map((x) => nightMin(x.d.sleep.bed)), lo = Math.floor((Math.min(...bs, F.u) - 30) / 60) * 60, hi = Math.max(lo + 180, Math.ceil((Math.max(...bs, F.u) + 30) / 60) * 60);
    const X = (v) => (v - lo) / (hi - lo) * 100, ticks = [];
    for (let v = lo; v <= hi; v += 60) { const m = (v + 720) % 1440, hh = Math.floor(m / 60); ticks.push([v, m === 0 ? "midnight" : `${hh % 12 || 12} ${hh < 12 ? "am" : "pm"}`]); }
    pic = h("div.wr-pic", { style: "height:272px;position:relative" },
      h("div.wr-ab.wr-fade", { style: `left:${X(F.u - 15)}%;width:${X(F.u + 15) - X(F.u - 15)}%;top:20px;height:170px;border-radius:14px;background:rgb(23 24 27 / .12);--d:2.2s` }),
      F.nights.map((x, k) => h("div.wr-ab.wr-pop", { style: `left:calc(${X(nightMin(x.d.sleep.bed))}% - 8px);top:${50 + (k % 4) * 30}px;width:16px;height:16px;border-radius:8px;background:${x.m == null ? "rgb(23 24 27 / .2)" : MC[x.m]};box-shadow:inset 0 0 0 1.5px ${INK};--d:${1 + k * 0.15}s` })),
      h("div.wr-ab", { style: "left:0;right:0;top:204px;height:2px;background:rgb(23 24 27 / .3)" }),
      ticks.map(([v, l], k) => h("div.wr-ab.tick", { style: `left:${X(v)}%;top:214px;translate:${k === 0 ? "0" : k === ticks.length - 1 ? "-100%" : "-50%"}` }, l)),
      h("p.wr-ab.wr-fade", { style: "left:0;right:0;top:248px;--d:2.6s;font-size:15px;opacity:.8" }, "Each dot is a night, coloured by how the next day felt."));
  } else {
    pic = h("div.wr-pic.wr-grid", null, F.show.map((id, k) => { const c = deck.card(id);
      return h("div.wr-mini.wr-pop", { style: `--d:${0.9 + k * 0.15}s;width:104px;height:144px` }, h("div.bk.wr-out", { style: `--d:${1.8 + k * 0.15}s` }),
        h("div.fc.wr-in", { style: `--d:${2.1 + k * 0.15}s` }, h("span.mt", null, h("i", { style: `background:${tint(c.pillar)}` }), c.pillar), h("span", { style: "font-size:15px" }, c.text)),
        F.liked.has(id) ? h("div.star.wr-pop", { style: `--d:${2.9 + k * 0.1}s` }, "♥") : null); }));
  }
  const el = frame(ctx, j, { c: F.c, lab: F.lab, auto }, bigEl(F.big, 0.4, F.kind === "rhythm" || F.kind === "deck" ? 72 : null), lineEl(F.line), pic);
  return { el, auto };
}

// ---- 4 · what works for you: a fanned hand of real cards, what you felt written on each, the loved one on top ----
function fanEl(cards, { base = 1, onTap } = {}) {
  const n = cards.length, W = n === 1 ? 230 : n === 2 ? 168 : 152, H = Math.round(W * 1.4), step = n === 2 ? 88 : 84;
  const f = h("div.wr-fan", { style: `height:${H + 30}px` });
  const order = cards.map((_, k) => k).sort((x, y) => (cards[x].top ? 1 : 0) - (cards[y].top ? 1 : 0));
  let z = 10;
  order.forEach((k, zi) => {
    const c = cards[k], off = k - (n - 1) / 2;
    const el = h(`button.dc.wr-pop${c.top ? ".love" : ""}${W === 230 ? ".one" : ""}`, { type: "button", style: `width:${W}px;height:${H}px;left:calc(50% - ${W / 2}px + ${off * step}px);top:${Math.abs(off) * 14}px;rotate:${off * 6}deg;z-index:${zi + 1};--d:${base + k * 0.15}s`, "aria-label": c.title },
      h("div.bk.wr-out", { style: `--d:${base + 0.6 + k * 0.2}s` }),
      h(`div.fc.wr-in${c.ph ? ".ph" : ""}`, { style: `--d:${base + 0.9 + k * 0.2}s` }, c.ph ? h("span.fph", null, photos.img(c.ph, "thumb")) : null, h("span.tg", null, h("i", { style: `background:${c.tint}` }), c.tag), h("span.tk", null, c.title), c.sub ? h("span.sub", null, c.sub) : null, c.foot ? h("span.ft", null, c.foot) : null));
    el.dataset.k = k;
    el.addEventListener("click", (e) => { e.stopPropagation(); el.style.zIndex = String(++z + 20); el.classList.remove("lift"); void el.offsetWidth; el.classList.add("lift"); onTap && onTap(el, k); });
    f.append(el);
  });
  return f;
}
function scrWorks(ctx, j) {
  const Wk = ctx.D.works;
  const cards = Wk.cards.map((x) => ({ tint: tint(x.c.pillar), tag: x.c.pillar, title: x.c.text, foot: (x.d.card.felt || []).join(" · "), top: x === Wk.loved, id: x.c.id, ph: photos.has(x.k) ? x.k : null }));
  const fan = fanEl(cards, { base: Wk.kind === "one" ? 0.8 : 1, onTap: (el) => { [...el.parentElement.children].forEach((x) => x.classList.toggle("love", x === el)); log("wrap_works_tap"); } });
  const el = frame(ctx, j, { c: Wk.c, lab: Wk.lab, tease: 3.6 }, Wk.big ? bigEl(Wk.big) : null, lineEl(Wk.line, Wk.big ? 0.6 : 0.4, Wk.big ? "" : "margin-top:0"), h("div.wr-pic", null, fan));
  log("wrap_works", Wk.kind);
  return { el };
}

// ---- 5 · shape next week: tap one or two, keep them ----
function scrNext(ctx, j) {
  const D = ctx.D, list = ideas(D), hard = D.hard;
  const head = hard ? "Make next week lighter" : "Shape next week", sub = hard ? "Ways to take some load off before it starts." : "Carry what went well into next week.";
  // The one that builds on what went well sits in the middle, on top, already lit.
  if (list.length === 3) list.splice(1, 0, list.shift());
  const mid = list.length === 3 ? 1 : 0;
  const cards = list.map((x, k) => ({ tint: x.tint, tag: x.tag, title: x.title, sub: x.sub, foot: x.from, top: k === mid }));
  let lit = [mid], decided = false;
  const btn = h("button.btn-main.wr-ab.wr-rise", { style: "left:24px;right:24px;width:auto;top:736px;--d:2.6s" }, "Keep this one");
  const btn2 = h("button.btn-text.wr-ab.wr-rise", { style: "left:0;right:0;top:796px;--d:2.8s;color:var(--ink2)" }, "Not now");
  const big = bigEl(head, 0.4, 40), hint = h("div.wr-rise.wr-hint2", { style: "--d:.6s" }, sub, h("br"), "Tap one or two.");
  const fan = fanEl(cards, { onTap: (el, k) => {
    if (decided) return;
    if (lit.includes(k)) { if (lit.length > 1) lit = lit.filter((x) => x !== k); }
    else { lit.push(k); if (lit.length > 2) lit.shift(); }
    [...fan.children].forEach((x) => x.classList.toggle("love", lit.includes(+x.dataset.k)));
    btn.textContent = lit.length === 2 ? "Keep these two" : "Keep this one";
  } });
  const el = frame(ctx, j, { c: hard ? NIGHT : GOLD, lab: "For next week", height: 540, tease: null }, big, hint, h("div.wr-pic", null, fan));
  el.append(btn, btn2);
  const swap = (node, t) => { node.classList.remove("wr-rise"); node.style.transition = "opacity .35s"; node.style.opacity = "0"; setTimeout(() => { node.textContent = t; node.style.opacity = "1"; }, reduceMotion() ? 0 : 350); };
  const toSmall = () => Object.assign(big.style, { fontSize: "22px", lineHeight: "1.3", letterSpacing: "0" });
  const settle = (keptK) => {
    decided = true; hint.style.opacity = "0";
    const els = [...fan.children], kept = keptK.map((k) => els.find((x) => +x.dataset.k === k));
    els.forEach((x) => { if (!kept.includes(x)) x.classList.add("gone"); });
    kept.forEach((x, i) => { x.classList.add("kept", "love"); x.style.top = "0px";
      if (kept.length === 1) { x.style.left = `calc(50% - ${x.offsetWidth / 2}px)`; x.style.rotate = "0deg"; }
      else { x.style.left = `calc(50% - ${i ? -6 : 158}px)`; x.style.rotate = (i ? 3 : -3) + "deg"; } });
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (decided) { ctx.next(); return; }
    const keep = lit.slice().sort((a, b) => a - b), items = keep.map((k) => list[k]);
    settle(keep);
    const real = items.filter((x) => x.kind !== "same");
    const { start, end } = planDates();
    mem().plan = real.length ? { week: D.w, start, end, items: real.map((x) => ({ kind: x.kind, pillar: x.pillar, at: x.at, day: x.day, line: x.line, tint: x.tint })) } : null;
    store.save(); notify.sync();
    log("wrap_keep", items.map((x) => x.kind).join(","));
    swap(el.querySelector(".wr-lab"), items.length === 1 ? "Kept for next week" : "Kept two for next week");
    toSmall();
    const HOME = " It shows under your level on home, and you can stop it there.";
    swap(big, items.length === 1 ? items[0].done + (items[0].kind === "same" ? "" : HOME)
      : `${items[0].title}, and ${items[1].title.replace(/^\w/, (ch) => ch.toLowerCase())}. ${real.length === 2 ? "Both show under your level on home, and you can stop either one there." : "It shows under your level on home, and you can stop it there."}`);
    swap(btn, "Next"); btn2.style.opacity = "0"; btn2.disabled = true;
    if (ctx.screens.length === 1) swap(btn, "Done");
  });
  btn2.addEventListener("click", (e) => {
    e.stopPropagation(); if (decided) return;
    decided = true; log("wrap_notnow");
    [...fan.children].forEach((x) => x.classList.add("gone"));
    swap(el.querySelector(".wr-lab"), "Not now"); toSmall(); swap(big, "That's fine. Next week stays as it is."); hint.style.opacity = "0";
    swap(btn, ctx.screens.length === 1 ? "Done" : "Next"); btn2.style.opacity = "0"; btn2.disabled = true;
  });
  return { el, canNext: () => decided };
}

// ---- 6 · your week on a card ----
// The picture people would want to post: the week's colours as a wash, its days as a hand of cards, the name and
// line, best (or lightest) day, where time went, the card of the week and one thing we noticed. Never feelings
// words, sleep lengths, anything typed, level or counts. Moods are on unless switched off. Story shaped (9 by 16),
// so it fills a story without cropping. The screen shows the very picture that gets shared.
const NOTICED = { pattern: (F) => `${F.big} have been a good day three weeks running`, then: (F) => `${F.big} more sleep a night than last week`,
  rhythm: (F) => `${F.big} is your usual lights out`, deck: (F) => `${F.big} new cards met this week` };
export function posterData(D) {
  const c = D.loved ? D.loved.c : null, b = D.light[0];
  return { w: D.w, days: [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(D.w, i)), dates: D.dates, name: D.name.name, line: D.name.line, ms: D.ms, hard: D.hard,
    best: b ? { day: dn(b.k), m: b.m } : null, pil: D.pil, card: c && !c.own ? c.text : null,
    noticed: D.find && NOTICED[D.find.kind] ? NOTICED[D.find.kind](D.find) : null };
}
const PW = 430, PH = PW * 16 / 9;                                   // the picture's size in points; drawn at 1080 by 1920
const SYS = `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", system-ui, sans-serif`;
const hexRgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`; };
let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  const c = h("canvas", { width: "160", height: "160" }), g = c.getContext("2d"), im = g.createImageData(160, 160);
  for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 140; }
  g.putImageData(im, 0, 0); return (grainTile = c);
}
function wrap(g, text, max) {
  const out = []; let cur = "";
  text.split(" ").forEach((wd) => { const t = cur ? cur + " " + wd : wd; if (g.measureText(t).width > max && cur) { out.push(cur); cur = wd; } else cur = t; });
  if (cur) out.push(cur); return out;
}
// pics: the week's photos (7 pictures or nulls), only when "Show photos when sharing" is on. Off by default.
export function posterCanvas(P, moods = true, px = 1080, pics = null) {
  const S = px / PW, c = h("canvas", { width: String(px), height: String(Math.round(PH * S)) }), g = c.getContext("2d");
  g.scale(S, S); g.textBaseline = "top";
  const F = (wt, size) => `${wt} ${size}px ${SYS}`, X = 28, CW = PW - 56;
  const rr = (x, y, w, hh, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, hh, r) : g.rect(x, y, w, hh); };
  const ls = (v) => { if ("letterSpacing" in g) g.letterSpacing = v; };
  const noted = (P.ms || []).filter((m) => m != null);

  // the wash: the week's own colours, a soft light top right, darker towards the bottom, then grain
  const A = 165 * Math.PI / 180, dx = Math.sin(A), dy = -Math.cos(A), half = Math.abs(PW * dx) / 2 + Math.abs(PH * dy) / 2;
  const bg = g.createLinearGradient(PW / 2 - dx * half, PH / 2 - dy * half, PW / 2 + dx * half, PH / 2 + dy * half);
  const cols = moods && noted.length ? noted.map((m) => MC[m]) : ["#3a3c44", "#24262b", "#141518"];
  if (cols.length === 1) cols.push(cols[0]);
  cols.forEach((col, i) => bg.addColorStop(i / (cols.length - 1), col));
  g.fillStyle = bg; g.fillRect(0, 0, PW, PH);
  g.save(); g.translate(PW * 0.8, PH * 0.15); g.scale(1, (PH * 0.4) / (PW * 0.7));
  const hi = g.createRadialGradient(0, 0, 0, 0, 0, PW * 0.7); hi.addColorStop(0, moods ? "rgba(255,243,223,.4)" : "rgba(242,192,143,.28)"); hi.addColorStop(0.7, "rgba(255,243,223,0)");
  g.fillStyle = hi; g.fillRect(-PW, -PW, PW * 2, PW * 2); g.restore();
  const dk = g.createLinearGradient(0, PH * 0.45, 0, PH); dk.addColorStop(0, "rgba(0,0,0,0)"); dk.addColorStop(1, "rgba(0,0,0,.35)"); g.fillStyle = dk; g.fillRect(0, 0, PW, PH);
  g.save(); g.globalAlpha = 0.1; g.globalCompositeOperation = "overlay"; g.fillStyle = g.createPattern(grain(), "repeat"); g.scale(1 / S, 1 / S); g.fillRect(0, 0, PW * S, PH * S); g.restore();

  const W = (a) => `rgba(255,255,255,${a})`;
  // top: dates, the name, the week's line
  let y = 56;
  g.fillStyle = W(0.85); g.font = F(400, 15); g.fillText(P.dates, X, y); y += 15 + 10;
  const big = P.name.length > 20 ? 42 : 54;
  g.fillStyle = "#fff"; g.font = F(800, big); ls(`${-0.035 * big}px`);
  wrap(g, P.name, CW).forEach((l) => { g.fillText(l, X, y); y += big; }); ls("0px");
  if (P.line && moods) { y += 12; g.fillStyle = W(0.88); g.font = F(400, 17); wrap(g, P.line, CW).forEach((l) => { g.fillText(l, X, y); y += 22; }); }
  const topEnd = y;

  // bottom up: Daydeck, we noticed, the facts
  const sub = W(0.75);
  g.font = F(400, 13); ls("1px"); g.fillStyle = W(0.75); g.textAlign = "center"; g.fillText("DAYDECK", PW / 2, PH - 44); g.textAlign = "left"; ls("0px");
  let b = PH - 44 - 28;
  if (P.noticed) {
    g.font = F(600, 13); const lw = g.measureText("We noticed").width + 10;
    g.font = F(600, 15); const nl = wrap(g, P.noticed, CW - lw);
    const top = b - nl.length * 20;
    g.fillStyle = sub; g.font = F(600, 13); g.fillText("We noticed", X, top + 2);
    g.fillStyle = "#fff"; g.font = F(600, 15); nl.forEach((l, i) => g.fillText(l, X + lw, top + i * 20));
    g.fillStyle = W(0.3); g.fillRect(X, top - 16, CW, 1);
    b = top - 16 - 22;
  }
  if (P.card) {
    g.font = F(700, 24); ls("-0.24px"); const cl = wrap(g, P.card, CW);
    const top = b - 18 - cl.length * 29;
    g.fillStyle = sub; ls("0px"); g.font = F(600, 13); g.fillText("Card of the week", X, top);
    g.fillStyle = "#fff"; g.font = F(700, 24); ls("-0.24px"); cl.forEach((l, i) => g.fillText(l, X, top + 18 + i * 29)); ls("0px");
    b = top - 26;
  }
  const pil = (P.pil || []).slice(0, 3), C2 = X + CW / 2 + 10;
  if (P.best || pil.length) {
    const hb = P.best ? 18 + 37 + (moods ? 20 : 0) : 0, hp = pil.length ? 18 + pil.length * 28 : 0, top = b - Math.max(hb, hp);
    if (P.best) {
      g.fillStyle = sub; g.font = F(600, 13); g.fillText(P.hard ? "Lightest day" : "Best day", X, top);
      g.fillStyle = "#fff"; g.font = F(800, 34); ls("-0.68px"); g.fillText(P.best.day, X, top + 18); ls("0px");
      if (moods) { g.fillStyle = sub; g.font = F(400, 15); g.fillText(`felt ${MOODS[P.best.m].toLowerCase()}`, X, top + 18 + 39); }
    }
    if (pil.length) {
      const x0 = P.best ? C2 : X;
      g.fillStyle = sub; g.font = F(600, 13); g.fillText("Time went to", x0, top);
      pil.forEach((p, i) => { const yy = top + 18 + i * 28; g.fillStyle = sub; g.font = F(400, 13); g.fillText(String(i + 1), x0, yy + 5); g.fillStyle = "#fff"; g.font = F(700, 20); g.fillText(p, x0 + 18, yy); });
    }
    b = top;
  }

  // the middle: the week as a hand of seven cards, face down for days not noted
  const cw = 80, ch = 112, step = 49, handH = 150, hy = topEnd + Math.max(16, (b - topEnd - handH) / 2);
  (P.ms || []).forEach((m, i) => {
    const off = i - 3, cx = PW / 2 + off * step, cy = hy + off * off * 4 + ch / 2;
    g.save(); g.translate(cx, cy); g.rotate(off * 6 * Math.PI / 180);
    g.shadowColor = "rgba(0,0,0,.3)"; g.shadowBlur = 22; g.shadowOffsetY = 10;
    rr(-cw / 2, -ch / 2, cw, ch, 11);
    const pic = pics && pics[i];
    if (pic) {
      g.fillStyle = "#17181b"; g.fill(); g.shadowColor = "transparent";
      g.save(); g.clip(); g.drawImage(pic, -cw / 2, -ch / 2, cw, ch);
      const sh = g.createLinearGradient(0, -ch / 2, 0, -ch / 2 + 34); sh.addColorStop(0, "rgba(0,0,0,.45)"); sh.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = sh; g.fillRect(-cw / 2, -ch / 2, cw, 34);
      g.restore();
      g.fillStyle = "#fff"; g.font = F(800, 15); g.fillText("MTWTFSS"[i], -cw / 2 + 8, -ch / 2 + 8);
    } else if (m == null) {
      const fd = g.createLinearGradient(-cw / 2, -ch / 2, cw / 2, ch / 2); fd.addColorStop(0, "#2c2e34"); fd.addColorStop(1, "#17181b"); g.fillStyle = fd; g.fill();
      g.shadowColor = "transparent"; g.save(); g.clip(); g.strokeStyle = "rgba(242,192,143,.16)"; g.lineWidth = 1;
      for (let r = 6; r < 80; r += 6) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); } g.restore();
    } else {
      const top = moods ? MC[m] : "#cfcac1";
      const fc = g.createLinearGradient(-cw / 2 + 10, -ch / 2, cw / 2 - 10, ch / 2); fc.addColorStop(0, mix(top, "#ffffff", 0.45)); fc.addColorStop(1, moods ? top : "#a9a59d"); g.fillStyle = fc; g.fill();
      g.shadowColor = "transparent";
      g.fillStyle = "#17181b"; g.font = F(800, 15); g.fillText("MTWTFSS"[i], -cw / 2 + 8, -ch / 2 + 8);
      if (moods) { g.font = F(700, 11); const wl = wrap(g, MOODS[m].toLowerCase(), 40); wl.forEach((l, k) => g.fillText(l, -cw / 2 + 8, ch / 2 - 8 - (wl.length - k) * 12)); }
    }
    g.shadowColor = "transparent"; rr(-cw / 2, -ch / 2, cw, ch, 11); g.lineWidth = 1.5; g.strokeStyle = W(m == null ? 0.7 : 0.85); g.stroke();
    g.restore();
  });
  return c;
}
function posterView(P, moods, pics) {
  const v = posterCanvas(P, moods, 900, pics);
  v.className = "wr-pic6"; v.setAttribute("role", "img"); v.setAttribute("aria-label", `${P.name}, ${P.dates}`);
  return v;
}
function scrPoster(ctx, j) {
  const D = ctx.D, P = posterData(D), m = mem();
  // Every week's card is kept (newest first) the moment it's shown; Done needs no "save" step.
  m.weeks = [P].concat(m.weeks.filter((x) => x.w !== P.w)).slice(0, 104);
  m.names[D.w] = D.name.key; if (D.find) m.kinds[D.w] = D.find.kind;
  if (!m.seen[D.w]) m.n = (m.n || 0) + 1;
  store.save();
  log("wrap_name", D.name.key);
  const el = h("section.wr-scr");
  let moods = true, withPics = false, pics = null;
  // Photos on the shared card only if the person turns it on (alex 2026-11-18): they're private by default.
  const hasPics = (P.days || []).some((k) => photos.has(k));
  const box = ab(`.wr-pic6box.wr-flipin${hasPics ? ".two" : ""}`, "--d:.2s", posterView(P, true));
  const redraw = () => box.replaceChildren(posterView(P, moods, withPics ? pics : null));
  const sw = h("button.switch", { role: "switch", "aria-checked": "true", "aria-label": "Show moods when sharing" });
  const row = h(`div.wr-ab.wr-sw.wr-rise${hasPics ? ".two" : ""}`, { style: "--d:1.2s" }, h("span", null, "Show moods when sharing"), sw);
  row.addEventListener("click", (e) => { e.stopPropagation(); moods = !moods; sw.setAttribute("aria-checked", String(moods)); redraw(); log("wrap_moods", moods ? "on" : "off"); });
  let row2 = null;
  if (hasPics) {
    const sw2 = h("button.switch", { role: "switch", "aria-checked": "false", "aria-label": "Show photos when sharing" });
    row2 = h("div.wr-ab.wr-sw.wr-sw2.wr-rise", { style: "--d:1.3s" }, h("span", null, "Show photos when sharing"), sw2);
    row2.addEventListener("click", async (e) => {
      e.stopPropagation(); withPics = !withPics; sw2.setAttribute("aria-checked", String(withPics));
      if (withPics && !pics) pics = await weekPics(P.days);
      redraw(); log("wrap_photos", withPics ? "on" : "off");
    });
  }
  const share = h("button.btn-main.wr-ab.wr-rise", { style: "left:24px;right:24px;width:auto;top:736px;--d:1.4s", onclick: (e) => { e.stopPropagation(); sharePoster(P, moods, withPics ? pics : null); } }, "Share");
  const done = h("button.btn-text.wr-ab.wr-rise", { style: "left:0;right:0;top:796px;--d:1.6s", onclick: (e) => { e.stopPropagation(); ctx.close(); } }, "Done");
  el.append(...chrome(ctx, j, 0), box, row, row2 || "", share, done);
  return { el, canNext: () => false };
}

// The shared picture, drawn fresh at 1080 by 1920, then handed to the phone's share sheet.
// Nothing leaves the phone unless the person sends it.
// The week's photos as pictures ready to draw (null for a day without one).
async function weekPics(days) {
  return Promise.all(days.map(async (k) => {
    const u = await photos.url(k, "thumb");
    if (!u) return null;
    return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = u; });
  }));
}
export async function sharePoster(P, moods = true, pics = null) {
  log("wrap_share", moods ? "moods" : "no_moods");
  if (pics) log("wrap_share_photos");
  try {
    const blob = await new Promise((res, rej) => posterCanvas(P, moods, 1080, pics).toBlob((b) => (b ? res(b) : rej(new Error("no picture"))), "image/png"));
    const file = new File([blob], `Daydeck ${P.dates}.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    const a = h("a", { href: URL.createObjectURL(blob), download: file.name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  } catch { /* closed the share sheet */ }
}

// ---------------- Your weeks, in Your days: every week's card, newest first ----------------
const thumbBg = (P) => { const c = (P.ms || []).filter((m) => m != null).map((m) => MC[m]); return c.length > 1 ? `background:linear-gradient(165deg,${c.join(",")})` : ""; };
export function weeksSection() {
  const list = mem().weeks;
  if (!list.length) return null;
  return h("div.card.wr-weeks", { style: { gap: "12px" } }, h("h3", null, "Your weeks"),
    h("div.wr-weeks-row", null, list.map((P) => h("button.wr-week-thumb", { "aria-label": `${P.name}, ${P.dates}`, onclick: () => {
      log("wrap_week_open");
      openSheet((panel) => {
        const card = posterView(P, true);
        card.classList.add("in-sheet");
        panel.append(card, h("button.btn-main", { style: { marginTop: "8px" }, onclick: () => sharePoster(P, true) }, "Share"));
      }, { label: P.name });
    }, style: thumbBg(P) }, h("span.d", null, P.dates), h("span.n", null, P.name)))));
}

// Test mode: open last week's wrapped whether or not it was seen.
export function testOpen(rerender) {
  const k = dayKey(), w = keyDate(k).getDay() === 0 ? weekStart(k) : addDays(weekStart(k), -7);
  if (!week(w).some((x) => x.m != null)) return false;
  openWrapped(w, rerender); return true;
}
