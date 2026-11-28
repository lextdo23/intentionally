// "Your first three days" (alex 2026-11-28, plan "Daydeck: getting people to do their card", "Something worth seeing
// in week one"): once, at the end of a new person's third day, a sheet with the cards from their first three days and
// how each one felt, so there's something to see long before Your days has patterns (about 21 days).
// Only what happened: days whose card wasn't done are simply left out, never "missed". Nothing shows if no card was
// done or rested. Sample days never count (dev tools' made-up days do, so the dev account can try it). Shown after the third End your day once home is quiet; if Daydeck closed first, on the next open.
import { h, dayKey, addDays, keyDate, DAY_NAME } from "./util.js";
import * as store from "./store.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";
import { card as cardOf, PILLAR_COL } from "./deck.js";
import { FELT_KIND } from "./stats.js";
import * as levels from "./levels.js";
import { openDays } from "./days.js";

const KIND_COL = { lift: "#7ab57a", done: "#e3c486", hard: "#8a89c4" };
const CHIP_BG = { lift: "rgb(122 181 122 / .14)", done: "rgb(227 196 134 / .14)", hard: "rgb(138 137 196 / .16)" };
const used = (d) => d && (d.mood != null || (d.card && d.card.done) || d.rest);

// The first three days someone used Daydeck (a check-in, a done card or a rest day), oldest first.
export function firstDays(days = store.get().days) {
  return Object.keys(days || {}).filter((k) => !days[k].sample && used(days[k])).sort().slice(0, 3);
}
// What each of those days holds: the done card and how it felt, or a rest day. Undone days are left out.
export function items(days = store.get().days) {
  return firstDays(days).map((k) => {
    const d = days[k];
    if (d.rest) return { k, rest: true };
    const c = d.card && d.card.done && d.card.id && cardOf(d.card.id);
    if (!c) return null;
    const felt = d.card.felt || [], kind = felt.map((w) => FELT_KIND[w]).find(Boolean) || null;
    const word = felt.find((w) => FELT_KIND[w] === "lift") || felt[0] || "Done";
    return { k, text: c.text, pillar: c.pillar, word, kind: FELT_KIND[word] || kind };
  }).filter(Boolean);
}
// Due once, for new people only: their third evening is in, it was in the last few days, and there's something to show.
export function due(today = dayKey()) {
  const s = store.get();
  if ((s.notes || {}).first3) return false;
  const evenings = Object.keys(s.days || {}).filter((k) => k <= today && s.days[k].mood != null && !s.days[k].sample);
  if (evenings.length < 3 || evenings.length > 4) return false;
  const third = evenings.sort()[2], first = firstDays(s.days)[0];
  if (!first || third < addDays(today, -2) || first < addDays(today, -9)) return false;
  return items(s.days).length > 0;
}

const dayWord = (k) => DAY_NAME[keyDate(k).getDay()];

export function open(onDone) {
  const s = store.get(); s.notes = s.notes || {}; s.notes.first3 = dayKey(); store.save();
  const list = items(s.days), lifted = list.filter((x) => x.kind === "lift").length;
  log("first3_seen", { n: list.length, l: lifted });
  openSheet((panel, close) => {
    const cardEl = (x) => x.rest
      ? h("div.lifts-card.f3-card", { role: "listitem", "aria-label": `${dayWord(x.k)}. A rest day.` },
        h("span.lifts-p", null, dayWord(x.k)), h("span.lifts-t", null, "A rest day, on purpose"), h("span.lifts-n", null, "No card that day"))
      : h("div.lifts-card.f3-card", { role: "listitem", "aria-label": `${dayWord(x.k)}. ${x.text}. ${x.pillar}. ${x.word}.` },
        h("span.lifts-p", null, h("i", { style: { background: PILLAR_COL[x.pillar] || "#a9a59d" } }), x.pillar),
        h("span.lifts-t", null, x.text),
        h("span.lifts-chip", { style: { color: KIND_COL[x.kind] || "var(--ink)", background: CHIP_BG[x.kind] || "rgba(239,237,233,.10)" } }, x.word),
        h("span.lifts-n", null, dayWord(x.k)));
    const lead = lifted
      ? h("p.lead", null, h("b", { style: { color: KIND_COL.lift } }, lifted === 1 ? "One of them" : lifted === list.length ? (lifted === 2 ? "Both" : "All of them") : `${lifted} of them`), " lifted you.")
      : null;
    const daysOpen = levels.isOpen("days");
    panel.append(
      h("div.col", { style: { gap: "4px" } }, h("h2", null, "Your first three days"), lead),
      h("div.lifts-row.f3-row", { role: "list" }, list.map(cardEl)),
      h("p.note", { style: { textAlign: "left" } }, lifted ? "Cards that lift you wait in Your days, so you can do them again." : "Your cards wait in Your days, so you can look back on them."),
      h("button.btn-main", { onclick: () => { log("first3_close", "done"); close("done"); } }, "Done"),
      daysOpen ? h("button.btn-quiet", { onclick: () => { log("first3_close", "days"); close("days"); setTimeout(() => openDays(null, onDone), 250); } }, "See Your days") : null);
  }, { label: "Your first three days", onClose: (why) => { if (why !== "days") onDone && onDone(); } });
}
