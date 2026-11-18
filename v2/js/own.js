// Make your own card, from the evening check-out (alex 2026-11-17, look A "write on the card").
// Something else you did today that you felt good about becomes a card: a blank card turns over, you write straight
// onto it and tap a pillar (the card takes its colour), then pick how it felt (the words land on the card in gold).
// "Add it to my deck" (off unless turned on) lets it come up in a morning draw. Your words never leave this phone:
// tester data gets the pillar (or "own" for a pillar you made up), feeling positions and the deck switch.
import { h, dayKey, reduceMotion, LIFELINE } from "./util.js";
import * as store from "./store.js";
import * as tips from "./tips.js";
import * as deck from "./deck.js";
import { roundBtn, pillPicker } from "./ui.js";
import { log } from "./tester.js";
import { show, step, where, spacer, mainBtn } from "./checkin.js";
import { cardEl } from "./draw.js";
import { GROUPS } from "./pillars.js";

const ALL = GROUPS.flatMap((g) => g[1]);
const feltLine = (list) => list.map((w, i) => (i ? w.charAt(0).toLowerCase() + w.slice(1) : w)).join(", ");

// back(): leave without keeping. kept(card): it's saved.
export function makeCard({ back, kept, k = dayKey() }) {
  const st = { text: "", pillar: null, felt: new Set(), inDeck: false, more: false, flipped: false };
  log("own_open");

  // The card itself, shared by both screens.
  const el = cardEl(null, { tag: "div" }); el.classList.add("home-card", "own-make");
  const front = el.querySelector(".front");
  const dot = h("i"), tagWord = h("span"), tag = h("span.ctag", null, dot, tagWord);
  const foot = h("span.card-foot", null, h("span.size.own"));
  const paint = () => {
    dot.style.background = st.pillar ? deck.PILLAR_COL[st.pillar] || "#a9a59d" : "rgba(239, 237, 233, .25)";
    tagWord.textContent = st.pillar || "Pick a pillar";
    foot.firstChild.textContent = feltLine([...st.felt]);
  };
  const flip = () => {
    if (st.flipped) { el.classList.add("up"); return; }
    st.flipped = true;
    if (reduceMotion()) el.classList.add("up");
    else setTimeout(() => el.classList.add("up"), 250);   // a blank card turns over from the deck
  };

  const one = () => {
    const box = h("textarea.own-text", { placeholder: "What did you do?", maxlength: "70", rows: "4", "aria-label": "What did you do?", enterkeyhint: "done" });
    box.value = st.text;
    front.replaceChildren(tag, box, foot); paint();
    const next = mainBtn("Next", false, two);
    const ready = () => next.setAttribute("aria-disabled", st.text.trim() && st.pillar ? "false" : "true");
    box.addEventListener("input", () => { st.text = box.value.replace(/\s+/g, " "); ready(); });
    box.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); box.blur(); } });
    const mine = deck.myPillars().map((p) => p.name);
    const pills = h("div.pills", { style: { justifyContent: "center" }, role: "radiogroup", "aria-label": "Which pillar?" });
    const drawPills = () => {
      const names = st.more ? mine.concat(ALL.filter((n) => !mine.includes(n))) : mine.concat(st.pillar && !mine.includes(st.pillar) ? [st.pillar] : []);
      pills.replaceChildren(...names.map((n) => h("button.pill.own-pil", { role: "radio", "aria-checked": String(st.pillar === n), "aria-pressed": String(st.pillar === n),
        onclick: () => { st.pillar = n; paint(); drawPills(); ready(); } }, h("span.sq", { style: { background: deck.PILLAR_COL[n] || "#a9a59d" } }), n)),
        st.more ? null : h("button.pill.outline", { onclick: () => { st.more = true; drawPills(); } }, "More"));
    };
    drawPills(); ready();
    show(step(
      [roundBtn("back", "Back", back), where("Your own card"), spacer()],
      [h("div.rise", { style: { display: "flex", justifyContent: "center" } }, el), h("div.rise", null, pills)],
      [next, LIFELINE()]));
    flip();
    if (!st.text) setTimeout(() => box.focus({ preventScroll: true }), reduceMotion() ? 50 : 800);
  };

  const two = () => {
    front.replaceChildren(tag, h("span.task", null, st.text.trim()), foot); paint();
    const main = deck.feltMain(st.pillar), more = deck.FELT.filter((w) => !main.includes(w));
    const pp = pillPicker({ main, more, picked: st.felt, noAdd: true, onToggle: (w) => { st.felt.has(w) ? st.felt.delete(w) : st.felt.add(w); paint(); } });
    pp.el.querySelectorAll(".pills").forEach((x) => (x.style.justifyContent = "center"));
    pp.el.setAttribute("aria-label", "How did it feel?"); pp.el.setAttribute("role", "group");
    const sw = h("button.switch", { role: "switch", "aria-checked": String(st.inDeck), "aria-label": "Add it to my deck",
      onclick: () => { st.inDeck = !st.inDeck; sw.setAttribute("aria-checked", String(st.inDeck)); } });
    const row = h("label.own-row", null, h("span", null, "Add it to my deck"), sw);
    const keep = mainBtn("Keep it", true, () => {
      const felt = deck.FELT.filter((w) => st.felt.has(w));
      const o = deck.addOwn(k, { pillar: st.pillar, text: st.text.trim(), felt, inDeck: st.inDeck });
      log("own_card", { p: ALL.includes(st.pillar) ? st.pillar : "own", f: felt.map((w) => deck.FELT.indexOf(w)), deck: st.inDeck ? 1 : 0 }); // never the words
      kept(o);
    });
    show(step(
      [roundBtn("back", "Back", one), where("Your own card"), spacer()],
      [h("div.rise", { style: { display: "flex", justifyContent: "center" } }, el), h("div.rise", null, pp.el), h("div.rise", null, row)],
      [keep, LIFELINE()]));
    flip();
  };

  one();
}

// Under step 3 of "End your day": today's own cards, and the button to make one (or another).
export function ownArea(k, open) {
  const made = (store.get().days[k] || {}).made || [];
  return h("div.col", { style: { gap: "8px", alignItems: "center" } },
    ...made.map((id) => deck.ownCard(id)).filter(Boolean).map((o) => h("div.mini", null,
      h("span.ctag", null, h("i", { style: { background: deck.PILLAR_COL[o.pillar] || "#a9a59d" } }), `${o.pillar} · Made by you`), h("span", null, o.text))),
    h("button.pill.own-btn", { onclick: () => { tips.used("own"); open(); } }, h("span", { "aria-hidden": "true" }, "+"), made.length ? "Make another" : "Make my own card", tips.isNew("own") ? tips.newTag() : null));
}
