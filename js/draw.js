// Today's card. After the sleep check-in, three cards are dealt face down from a deck hidden behind the middle one.
// Turn all three over, tap one to choose it, keep it. One "Draw again" a day: the hand folds into one card, the deck
// grows out from under it, riffles once, and deals three new. Every move uses one gentle ease-in-out and they overlap.
import { h, dayKey, reduceMotion, LIFELINE } from "./util.js";
import * as store from "./store.js";
import * as deck from "./deck.js";
import { roundBtn, pillPicker, openSheet } from "./ui.js";
import * as boxes from "./boxes.js";
import * as photos from "./photos.js";
import { log, on as testerOn } from "./tester.js";
import { show, close, step, where, spacer, mainBtn, begin } from "./checkin.js";
import { pickSteps, needsRepick, repickSteps } from "./pillars.js";
import * as library from "./library.js";

const SIZE = { Tiny: "Tiny", Small: "Small", Bigger: "Bigger" };
const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion() ? 0 : ms));

// Is a card still to draw today? Not on a rest day, and not once one is kept.
export function cardDue(k = dayKey()) {
  const d = store.get().days[k] || {};
  return !d.rest && !(d.card && d.card.id) && d.mood == null && deck.deck().length >= 3;
}

// One card's two faces. big = the full card with why it helps.
export function cardEl(id, { big = false, tag = "button", info = false } = {}) {
  const el = h(`${tag}.dcard${big ? ".big" : ""}${info ? ".info" : ""}`, { type: tag === "button" ? "button" : null });
  el.append(h("div.in", null, h("div.face.back"), h("div.face.front")));
  if (id) fill(el, id, big);
  return el;
}
// Testers only: does this card fit the pillar and where you're at with it? Up or down, once per card, then it's locked.
// It isn't "is this a good card", it's "does it fit me" (alex 2026-11-16). Sends the card number, the answer and the
// pillar's mindsets (words from the app's own list).
const THUMB = () => h("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2.2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
  h("path", { d: "M7 10v11H4V10h3zM7 10l4-8a2.5 2.5 0 0 1 2.5 2.5V9h5.6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 17.7 21H7" }));
function thumbs(id) {
  const row = h("span.thumbs");
  const draw = () => {
    const v = deck.mem().thumbs[id];
    row.classList.toggle("locked", v != null);
    row.replaceChildren(...[[1, "Fits my pillar and mindset", ""], [-1, "Doesn't fit my pillar and mindset", ".dn"]].map(([val, label, cls]) => {
      const b = h("button.thumb" + cls, { type: "button", "aria-label": label, "aria-pressed": String(v === val), disabled: v != null ? true : null }, THUMB());
      // Only on a card that's face up: a tap on a face-down card turns it, never rates it.
      const up = () => { const c = row.closest(".dcard"); return c && c.classList.contains("up"); };
      const stop = (e) => { if (up()) e.stopPropagation(); };
      b.addEventListener("pointerdown", stop); b.addEventListener("touchstart", stop, { passive: true });
      b.addEventListener("click", (e) => {
        if (!up()) return;
        e.stopPropagation(); e.preventDefault();
        const m = deck.mem(); if (m.thumbs[id] != null) return;
        m.thumbs[id] = val; store.save();
        const c = deck.card(id), p = deck.myPillars().find((x) => x.name === c.pillar);
        log("card_thumb", { id, v: val, p: c.pillar, m: p ? (p.mindsets || []) : [] });
        draw();
      });
      return b;
    }));
  };
  draw();
  return row;
}
function fill(el, id, big) {
  const c = deck.card(id), front = el.querySelector(".front"), times = deck.doneTimes(id);
  el.dataset.id = id;
  front.replaceChildren(...[
    h("span.ctag", null, h("i", { style: { background: deck.PILLAR_COL[c.pillar] || "#a9a59d" } }), c.pillar),
    h("span.task", null, c.text),
    big && times ? h("span.again", null, `Back again · done ${times === 1 ? "once" : times + " times"}`) : null,
    big ? h("span.why", null, c.why) : null,
    big && c.source ? h("span.src", null, c.source) : null,
    // On home (alex 2026-11-17, B1): why it helps, with the study at the end, in one quiet line low on the card.
    !big && el.classList.contains("info") && c.why ? h("span.why", null, c.why.replace(/\.\s*$/, "") + (c.source ? ". " : ""), c.source ? h("span.src", null, c.source) : null) : null,
    c.own ? h("span.size.own", null, "Made by you") : c.lib ? h("span.size", null, c.by ? `Made by ${c.by}` : "Anonymous daydeck user") : h("span.size", null, SIZE[c.size] || c.size),
    !big && testerOn() && !c.own && !c.lib ? thumbs(id) : null].filter(Boolean));
  el.setAttribute("aria-label", el.classList.contains("up") || big ? `${c.pillar}: ${c.text}` : "Face-down card");
}

// ---------------- The hand ----------------
const N = 12;
const ARCH = [[-76, -11, 6], [0, 0, -46], [76, 11, 6]];                // x, turn, y: the middle sits higher so it's always easy to tap
const H = (j, lift = 0) => { const [x, a, y] = ARCH[j]; return `translate(${x}px,${y - lift}px) rotate(${a}deg)`; };
const AWAY = () => H(1) + " scale(.97)";                                // the deck hides exactly behind the middle card
const P = (k) => `translate(${k * 0.6}px,${-12 - k * 1.7}px)`;          // a thick deck: each card a little up and to the right

export function drawSteps() {
  // The very first draw: choose your pillars first, so the deck is yours.
  if (!Array.isArray(store.get().pillars)) return pickSteps(() => drawSteps(), { first: true });
  // Pillars were reworked (alex 2026-11-20): anyone with an old answer is asked once to pick again.
  if (needsRepick()) return repickSteps(() => drawSteps());
  const k = dayKey(), d = store.day(k);
  // Leaving and coming back keeps the same three (and the same number of draws).
  if (!d.card || !d.card.hands || !d.card.hands.length) {
    const ids = deck.draw3([], k);
    d.card = { hands: [ids] }; deck.shown(ids, k); store.save();
    log("card_draw", ids.map(deck.tid));
  }
  const st = { ids: d.card.hands[d.card.hands.length - 1].slice(), up: [false, false, false], pick: null, smaller: null };
  hand(st, true);
}

function hand(st, dealIn) {
  const k = dayKey(), d = store.day(k);
  const stage = h("div.stage", { role: "group", "aria-label": "Today's three cards" });
  const hint = h("p.note", { "aria-live": "polite" });
  const keep = mainBtn("Keep this one", st.pick != null, () => {
    const id = st.ids[st.pick];
    deck.passed(st.ids.filter((x) => x !== id));
    log("card_keep", { id: deck.tid(id), draw: d.card.hands.length });
    big(st, id);
  });
  const lastLine = h("p.note", null, "That's your last draw for today. Pick the closest fit.");
  const again = h("button.btn-quiet", { onclick: () => redraw() }, "Draw again");
  // Extras from boxes (js/boxes.js): one more draw, a rest day beyond this week's one, and Pick my own.
  const allowed = () => 2 + (d.card.extra || 0);
  const extraDraw = h("button.btn-quiet", { onclick: () => {
    if (busy || !boxes.useExtra("draw")) return;
    d.card.extra = (d.card.extra || 0) + 1; store.save(); extraDraw.replaceWith(again); redraw();
  } }, "Use your extra draw");
  const outOfDraws = () => (boxes.extras().draw > 0 ? extraDraw : lastLine);
  let armed = false;
  const weekRest = deck.restLeft(k), boxRest = !weekRest && boxes.extras().rest > 0;
  const restWords = boxRest ? "Use your extra rest day, no card" : "Make today a rest day, no card";
  const rest = weekRest || boxRest ? h("button.btn-quiet", { onclick: () => {
    if (!armed) { armed = true; rest.textContent = "Tap again for a rest day, no card"; setTimeout(() => { armed = false; rest.textContent = restWords; }, 4000); return; }
    if (boxRest && !boxes.useExtra("rest")) return;
    const dd = store.day(k); dd.rest = true; if (boxRest) dd.restExtra = true; deck.passed(st.ids); store.save(); log("card_rest", boxRest ? "extra" : null); close(true);
  } }, restWords) : null;
  const pickOwn = boxes.extras().pick > 0 ? h("button.btn-quiet", { onclick: () => pickMine((id) => big(st, id, { own: true })) }, "Pick my own") : null;

  let order = [], handEls = [], busy = false, z = 60;
  const els = Array.from({ length: N }, () => { const e = cardEl(null); e.classList.add("hc"); stage.append(e); return e; });
  order = els.slice();
  const allUp = () => handEls.every((e) => e.classList.contains("up"));
  const say = () => {
    hint.textContent = !allUp() ? "Turn over all three cards" : st.pick == null ? "Tap a card to choose it" : "Keep it, or tap another";
  };
  const place = (e, t) => { e.style.transitionDuration = t + "s"; };
  const apply = (t = 0.45) => handEls.forEach((e, j) => { place(e, t); e.style.transform = H(j, j === st.pick ? 12 : 0); });
  const pile = () => order.forEach((e, i) => { place(e, 0); e.style.zIndex = i + 1; e.style.transform = P(i); });

  // The top card goes straight to the middle with the deck tucked behind it; the side cards slide out from behind it.
  const deal = (instant) => {
    const mid = order[N - 1], sides = [order[N - 2], order[N - 3]];
    handEls = [sides[0], mid, sides[1]];
    handEls.forEach((e, j) => { e.classList.toggle("up", st.up[j]); e.classList.toggle("sel", st.pick === j); fill(e, st.ids[j]); });
    order.forEach((e) => (e.style.pointerEvents = "none"));
    const T = instant ? 0 : 0.7;
    mid.style.zIndex = 55; place(mid, T); mid.style.transform = H(1, st.pick === 1 ? 12 : 0);
    order.slice(0, N - 3).forEach((e, i) => { e.style.zIndex = i + 1; place(e, T); e.style.transform = AWAY(); });
    sides.forEach((e, i) => { e.style.zIndex = 50 + i; if (instant) { place(e, 0); e.style.transform = H(i ? 2 : 0, st.pick === (i ? 2 : 0) ? 12 : 0); } else { place(e, T); e.style.transform = AWAY(); } });
    const done = () => { handEls.forEach((e) => (e.style.pointerEvents = "auto")); busy = false; say(); };
    if (instant) return done();
    busy = true;
    setTimeout(() => sides.forEach((e, i) => { place(e, 0.7); e.style.transform = H(i ? 2 : 0); }), reduceMotion() ? 0 : 90);
    setTimeout(done, reduceMotion() ? 0 : 850);
  };

  els.forEach((e) => e.addEventListener("click", () => {
    const j = handEls.indexOf(e);
    if (busy || j < 0) return;
    e.style.zIndex = ++z;                                              // the one you tapped last sits on top, in its place
    if (!e.classList.contains("up")) { e.classList.add("up"); st.up[j] = true; fill(e, st.ids[j]); log("card_turn", deck.tid(st.ids[j])); say(); return; }
    if (!allUp()) { hint.textContent = "Turn the other cards over first"; return; }
    st.pick = j; handEls.forEach((x, i) => x.classList.toggle("sel", i === j)); apply();
    keep.setAttribute("aria-disabled", "false"); say();
  }));

  // Draw again, as one flowing move.
  const redraw = async () => {
    if (busy || d.card.hands.length >= allowed()) return;
    busy = true; keep.setAttribute("aria-disabled", "true"); hint.textContent = "Shuffling…";
    deck.passed(st.ids);
    const ids = deck.draw3(d.card.hands.flat(), k);
    d.card.hands.push(ids); deck.shown(ids, k); store.save();
    log("card_redraw", ids.map(deck.tid));
    if (d.card.hands.length >= allowed()) again.replaceWith(outOfDraws());
    const at = (ms, fn) => setTimeout(fn, reduceMotion() ? 0 : ms);
    // 0s: turn face down and fold into exactly one card, keeping whatever was on top on top
    const byZ = handEls.slice().sort((a, b) => (+a.style.zIndex) - (+b.style.zIndex));
    handEls.forEach((e) => { e.classList.remove("sel", "up"); e.style.pointerEvents = "none"; });
    byZ.forEach((e) => { place(e, 0.6); e.style.transform = AWAY(); });
    const rest = order.filter((e) => !handEls.includes(e)); order = rest.concat(byZ);
    st.ids = ids; st.up = [false, false, false]; st.pick = null;
    // 0.62s: once they are one card, the deck grows out from under it
    at(620, () => { rest.forEach((e, i) => (e.style.zIndex = i + 1)); order.forEach((e, i) => { place(e, 0.45); e.style.transform = P(i); }); });
    // 0.98s: it splits in two for one riffle; the cards stream back one after another
    at(980, () => {
      order.forEach((e, i) => (e.style.zIndex = i + 1));
      const A = order.slice(0, N / 2), B = order.slice(N / 2);
      A.forEach((e, i) => { place(e, 0.5); e.style.transform = `translate(${-58 + i * 0.6}px,${20 - i * 1.7}px) rotate(-10deg)`; });
      B.forEach((e, i) => { place(e, 0.5); e.style.transform = `translate(${58 + i * 0.6}px,${20 - i * 1.7}px) rotate(10deg)`; });
      const mixed = []; for (let i = 0; i < N / 2; i++) mixed.push(A[i], B[i]);
      mixed.forEach((e, i) => at(400 + i * 40, () => { place(e, 0.4); e.style.zIndex = i + 1; e.style.transform = P(i); }));
      // about 2.1s: deal three new
      at(1100, () => { order = mixed; deal(false); });
    });
  };

  const foot = [keep, d.card.hands.length >= allowed() ? outOfDraws() : again, pickOwn, rest, LIFELINE()];
  show(step(
    [roundBtn("close", "Not now", () => { log("card_later"); close(false); }), where("Today's card"), spacer()],
    [h("h1.q.rise", null, "Pick one for today"), h("div.rise", null, stage), h("div.rise", null, hint), testerOn() ? h("p.note.rise", null, "Testers: thumbs up if a card fits your pillar and where you're at with it. One go per card.") : null],
    foot));
  if (dealIn && !reduceMotion()) { pile(); requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => deal(false), 260))); }
  else { pile(); deal(true); }
}

// ---------------- The kept card ----------------
// Pick my own (an extra from a box): any card in your deck, grouped by pillar. The extra is used once the card is kept.
function pickMine(onPick) {
  const k = dayKey(), ids = deck.deck().filter((id) => !deck.notYet(id, k));
  openSheet((panel, close) => {
    const list = h("div.pick-list");
    deck.myPillars().concat([{ name: null }]).forEach((p) => {
      const mine = ids.filter((id) => (p.name ? deck.card(id).pillar === p.name : !deck.myPillars().some((q) => q.name === deck.card(id).pillar)));
      if (!mine.length) return;
      const pil = p.name || "Your own";
      list.append(h("h3", null, h("i", { style: { background: deck.PILLAR_COL[pil] || "#a9a59d" } }), pil),
        ...mine.map((id) => h("button.pick-item", { onclick: () => { close("pick"); setTimeout(() => onPick(id), 250); } }, deck.card(id).text)));
    });
    panel.append(h("h2", null, "Pick my own"), h("p.note", null, "Choose any card from your deck for today."), list);
  }, { label: "Pick my own" });
}

function big(st, id, { own = false } = {}) {
  const k = dayKey(), d = store.day(k);
  const face = cardEl(id, { big: true, tag: "div" }); face.classList.add("up");
  const holder = h("div.big-holder", null, face);
  const helpers = h("div.helpers");
  const draw = () => {
    if (own) return;
    helpers.replaceChildren(...[
      deck.canShrink(id) ? h("button.btn-pill", { onclick: () => {
        const from = id, to = deck.smaller(id, st.ids); if (!to) return;
        id = to; st.ids[st.pick] = to; d.card.smaller = from; store.save(); log("card_smaller", { from, to });
        swap();
      } }, "Make it smaller") : null,
      h("button.btn-pill", { onclick: () => {
        deck.save(id); log("card_save", deck.tid(id));
        // A fresh card takes its place in the hand, face down.
        const nu = deck.draw3(d.card.hands.flat().concat(st.ids, deck.mem().saved), k).find((x) => !st.ids.includes(x));
        if (nu) { st.ids[st.pick] = nu; d.card.hands[d.card.hands.length - 1] = st.ids.slice(); deck.shown([nu], k); }
        st.up[st.pick] = false; st.pick = null; store.save();
        hand(st, false);
      } }, "Save for later")].filter(Boolean));
  };
  const swap = () => {
    if (reduceMotion()) { fill(face, id, true); draw(); return; }
    face.classList.add("turning");
    setTimeout(() => { fill(face, id, true); draw(); face.classList.remove("turning"); }, 280);
  };
  draw();
  show(step(
    [roundBtn("back", "Back to the three", () => hand(st, false)), where("Today's card"), spacer()],
    [h("div.rise", null, holder), h("div.rise", null, helpers)],
    [mainBtn("Done", true, () => {
      if (own) { if (!boxes.useExtra("pick")) return; d.card.own = true; deck.shown([id], k); log("card_keep", { id: deck.tid(id), draw: 0, own: 1 }); }
      d.card.id = id; d.card.at = Date.now(); store.save(); deck.unsave(id); close(true);
    }), LIFELINE()]));
}

// From home: draw today's card (when "Not now" was pressed after the sleep check-in).
export function openDraw(onDone) { begin(onDone); log("card_open_draw"); drawSteps(); }

// ---------------- Evening: how did it go? ----------------
// If "I did it" was tapped, it asks how it went (no "Didn't get to it"). If not, it first asks if they got to it.
// The evening card step. ans = { how, felt } from before (or {}). If the card wasn't ticked, it first asks
// "Did you get to your card?" (Yes / Didn't get to it); then "How did doing it feel?" with pick-any answers (deck.FELT).
// done(ans) gets { how, felt }: how 0 = didn't get to it, otherwise worked out from felt (deck.howFromFelt).
// "How did doing it feel?" in the evening (alex 2026-11-17): one screen. "Didn't get to it" is one of the answers and
// clears the others. extra = anything to show under the answers ("+ Make my own card").
export const NOT_DONE = "Didn't get to it";
export function howStep(id, ans, back, done, label, { did = false, extra = null, onChange = null } = {}) {
  const c = deck.card(id), felt = new Set(ans.felt || []);
  if (!did && ans.how === 0) felt.add(NOT_DONE);
  const upPill = library.thumbPill(id);   // a library card: "Thumbs up for Tom" (alex 2026-11-18)
  const go = mainBtn("Done", false, () => {
    if (upPill && upPill.getAttribute("aria-pressed") === "true" && !felt.has(NOT_DONE)) library.up(id);
    done(felt.has(NOT_DONE) ? { how: 0, felt: [] } : { how: deck.howFromFelt([...felt]), felt: [...felt] });
  });
  const ready = () => go.setAttribute("aria-disabled", felt.size ? "false" : "true");
  const main = deck.feltMain(c.pillar), more = deck.FELT.filter((w) => !main.includes(w));
  felt.forEach((w) => { if (w !== NOT_DONE && !main.includes(w)) { main.push(w); more.splice(more.indexOf(w), 1); } });
  const pp = pillPicker({ main, more, picked: felt, noAdd: true, notSure: did ? null : NOT_DONE,
    onToggle: (w) => {
      if (felt.has(w)) felt.delete(w);
      else if (w === NOT_DONE) { felt.clear(); felt.add(w); }
      else { felt.delete(NOT_DONE); felt.add(w); }
      ready(); if (onChange) onChange([...felt]);
    } });
  pp.el.querySelectorAll(".pills").forEach((x) => (x.style.justifyContent = "center"));
  ready();
  return step(
    [roundBtn("back", "Back", back), where(label), spacer()],
    [h("div.mini.rise", null, h("span.ctag", null, h("i", { style: { background: deck.PILLAR_COL[c.pillar] || "#a9a59d" } }), c.pillar), h("span", null, c.text)),
      h("div.rise", null, h("div.col", { style: { gap: "16px" } }, h("h1.q", null, "How did doing it feel?"), pp.el, upPill)), extra ? h("div.rise", null, extra) : null].filter(Boolean),
    [go, LIFELINE()]);
}

// ---------------- Home: today's card floats where the sun is ----------------
// state: "down" (face down, waiting to be drawn), "up" (face up, with "I did it"), "done" (turned back over with a tick),
// "skip" (the day ended without it: back in the deck, no guilt). flip = it was just done, so the tick fills in now.
let timers = [];
const T0 = performance.now();
const tickEl = (c) => h("span.tick-done", { "aria-hidden": "true", style: { background: deck.PILLAR_COL[c.pillar] || "#a9a59d" } },
  h("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "#1d1e22", "stroke-width": "2.8", "stroke-linecap": "round", "stroke-linejoin": "round" }, h("path", { d: "M5 12.5l4.5 4.5L19 7.5" })));
// What they said doing it felt like, in gold where the size was: the first one, then "+2" for more.
// The small camera on today's card, while you're doing it. Shows the photo once there is one.
const CAM = () => h("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2.1", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
  h("path", { d: "M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" }), h("circle", { cx: "12", cy: "12.5", r: "3.2" }));
function camBtn(k, onCam) {
  const has = k && photos.has(k);
  const b = h("button.card-cam", { type: "button", "aria-label": has ? "Your photo for today. Change it." : "Take a photo" }, has ? photos.img(k, "thumb") : CAM());
  const stop = (e) => e.stopPropagation();
  b.addEventListener("pointerdown", stop); b.addEventListener("touchstart", stop, { passive: true });
  b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); onCam(); });
  return b;
}
const feltEl = (felt) => h("span.felt-word", null, felt[0] + (felt.length > 1 ? ` +${felt.length - 1}` : ""));
export function homeCard(id, { state = "up", flip = false, felt = [], onTap, onDid, photo, develop = false, turn = false, onCam } = {}) {
  timers.forEach(clearTimeout); timers = [];
  const el = cardEl(id || null, { tag: "div", info: state === "up" || state === "done" }); el.classList.add("home-card");
  if (state === "up" || state === "done") el.classList.add("up");
  const back = el.querySelector(".back"), c = id ? deck.card(id) : null;
  // Done (alex 2026-11-15, "fill the circle, step back"): the card stays face up, a small circle in its pillar's colour
  // fills with a tick where "I did it" was, and the whole card steps back a little.
  if (state === "done") {
    el.classList.add("did"); if (flip) el.classList.add("fresh");
    const size = el.querySelector(".front .size"), foot = h("span.card-foot");
    size.replaceWith(foot);
    foot.append(felt && felt.length ? feltEl(felt) : size, tickEl(c));
  }
  if (state === "skip") { back.classList.add("marked"); back.append(h("span.dot", { "aria-hidden": "true" }), h("span.done-task", null, "Back in the deck for another day")); }
  if (state === "up") {
    const did = h("button.did", { type: "button", onclick: (e) => { e.stopPropagation(); onDid && onDid(); } }, "I did it");
    const size = el.querySelector(".front .size"), foot = h("span.card-foot");
    size.replaceWith(foot); foot.append(size, h("span.foot-right", null, onCam ? camBtn(photo, onCam) : null, did));
  }
  // A done card with a photo turns over to show it (alex 2026-11-18): the photo is the back of the card.
  const pic = state === "done" && photo && photos.has(photo);
  if (pic) photos.fillBack(back, photo, { develop });
  const why = c ? ` Why it helps: ${c.why.replace(/\.\s*$/, "")}.${c.source ? ` ${c.source}.` : ""}` : "";
  const label = { down: onTap ? "Today's card, face down. Tap to draw it." : "Today's card, face down.", up: c && `Today's card: ${c.text}.${why}`,
    done: c && `Done today: ${c.text}.${felt && felt.length ? ` It felt: ${felt.join(", ")}.` : ""}${why}`, skip: "Today's card went back in the deck for another day." }[state];
  el.setAttribute("aria-label", label);
  // Everything is on the card's face now, so tapping a face-up card does nothing (alex 2026-11-17). Face down, it draws.
  const tap = state === "down" ? onTap : null;
  if (tap) {
    el.setAttribute("role", "button"); el.tabIndex = 0;
    el.addEventListener("click", tap);
    el.addEventListener("keydown", (e) => { if (e.target === el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); tap(); } });
  } else el.setAttribute("role", "img");
  // Keep the float and sway going smoothly when home redraws (no jump back to the start).
  const t = performance.now() - T0;
  el.style.animationDelay = `${-(t % 11000)}ms`;
  // It turns with your finger (alex 2026-11-15); no spinning on its own (alex 2026-11-18). A face-down card shows its back both ways.
  if (state === "down") el.classList.add("blank");
  // Until today's card is done, a soft gold edge breathes with the sun (alex 2026-11-16, option 3B).
  if (state === "up" || state === "down") el.classList.add("todo");
  if (state !== "skip") spinner(el, state === "down" || pic ? 0 : 180, pic && (develop || turn) ? 180 : null);
  // A long task or why line: the card grows taller to fit, so nothing is cut off.
  if (state === "up" || state === "done") requestAnimationFrame(() => {
    const f = el.querySelector(".front");
    if (f.clientHeight && f.scrollHeight > f.clientHeight + 1) el.style.height = `${Math.ceil(210 * f.scrollHeight / f.clientHeight)}px`;
  });
  return h("div.lifter", null, h("div.floater", { style: { animationDelay: `${-(t % 7000)}ms` } }, el));
}
// Drag sideways and the card turns with your finger; let go and it carries on, slowing to rest face up again.
// It never turns on its own (alex 2026-11-18).
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
function spinner(el, rest, from = null) {
  const inn = el.querySelector(".in");
  let a = rest, raf = 0, x0 = null, y0 = 0, a0 = 0, pts = [], moved = false, held = false, touched = -1e9, logged = false;
  const set = (v) => { a = v; inn.style.transform = `rotateY(${v.toFixed(2)}deg)`; };
  inn.style.transition = "none"; set(rest);
  const halt = () => { cancelAnimationFrame(raf); raf = 0; };
  const glide = (to, ms, ease) => {
    halt();
    if (reduceMotion()) return set(to);
    const from = a, t0 = performance.now();
    const go = (t) => { const f = Math.min(1, (t - t0) / ms); set(from + (to - from) * ease(f)); raf = f < 1 ? requestAnimationFrame(go) : 0; };
    raf = requestAnimationFrame(go);
  };
  const restAt = (v) => rest + 360 * Math.round((v - rest) / 360);
  // A new photo: the card starts face up and turns slowly over to it, then the photo develops.
  if (from != null && !reduceMotion()) { set(from); setTimeout(() => glide(rest, 1400, (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)), 350); }
  el.style.touchAction = "pan-y";
  el.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    halt(); x0 = e.clientX; y0 = e.clientY; a0 = a; moved = false; held = true; touched = performance.now();
    pts = [[performance.now(), a]];
  });
  el.addEventListener("pointermove", (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (!moved) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      moved = true; try { el.setPointerCapture(e.pointerId); } catch { /* ok */ }
      x0 = e.clientX; if (!logged) { logged = true; log("card_spin"); }
    }
    const t = performance.now(); set(a0 + (e.clientX - x0) * 0.7);
    pts.push([t, a]); pts = pts.filter((q) => t - q[0] < 100);
  });
  const end = () => {
    if (x0 == null) return; x0 = null; held = false; touched = performance.now();
    if (!moved) { if (Math.abs(a - restAt(a)) > 0.5) glide(restAt(a), 300, easeOut); return; }
    const p0 = pts[0], p1 = pts[pts.length - 1], v = pts.length > 1 ? (p1[1] - p0[1]) / Math.max(8, p1[0] - p0[0]) : 0;   // degrees per ms
    const to = restAt(a + Math.max(-900, Math.min(900, v * 320)));
    const dist = Math.abs(to - a), sameWay = v && Math.sign(to - a) === Math.sign(v);
    glide(to, Math.max(300, Math.min(1800, sameWay ? (3 * dist) / Math.abs(v) : dist * 4)), easeOut);
  };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  // A drag is not a tap: after the card is turned by hand, the tap that follows is ignored.
  el.addEventListener("click", (e) => { if (moved) { moved = false; e.stopPropagation(); e.preventDefault(); } }, true);
}
// ---------------- Home: "How did doing it feel?" right after "I did it" ----------------
// alex 2026-11-17 ("the mix"): the tick fills, the card steps up and shrinks, and the question rises under it, all in one
// move. "End your day" fades so Done is the only gold button. Done or "Not now", and the card glides home: good feelings
// lift it a touch, heavy ones let it settle. Its glow builds on the way down, peaks as it lands, holds, then dies away
// (cool and quieter for heavy feelings). What they picked takes the size's place in gold, then the card greys out.
// onPick(list) gets the picks ([] for "Not now"), onEnd() runs once it's all still.
const SOFT = "cubic-bezier(.4,0,.2,1)";
const HEAVY = ["Hard", "Drained me", "Not for me"];
export function askFelt(lifter, id, { mid, hide, onPick, onEnd }) {
  const c = deck.card(id), el = lifter.querySelector(".home-card"), front = el.querySelector(".front");
  const rm = reduceMotion(), D = (ms) => (rm ? 0 : ms);
  document.body.classList.add("in-ask", "ask-open");   // ask-open hides the bottom pill until Done or Not now
  lifter.style.pointerEvents = "none"; lifter.style.transformOrigin = "50% 0";
  const did = el.querySelector(".did");
  if (did) { const t = tickEl(c); t.classList.add("fresh-tick"); did.replaceWith(t); }

  const felt = new Set(), main = deck.feltMain(c.pillar), more = deck.FELT.filter((w) => !main.includes(w));
  const pp = pillPicker({ main, more, picked: felt, noAdd: true, onToggle: (w) => { felt.has(w) ? felt.delete(w) : felt.add(w); } });
  pp.el.querySelectorAll(".pills").forEach((x) => (x.style.justifyContent = "center"));
  pp.el.querySelectorAll(":scope > .pills > .pill").forEach((b, i) => b.style.setProperty("--i", i));
  const ok = h("button.ok", { type: "button" }, "Done");
  const later = h("button.btn-text.later", { type: "button" }, "Not now");
  const upPill = library.thumbPill(id);   // a library card: "Thumbs up for Tom", one more answer (alex 2026-11-18)
  const ask = h("div.did-ask", { role: "group", "aria-label": "How did doing it feel?" }, h("p.did-q", null, "How did doing it feel?"), pp.el, upPill, ok, later);

  // The card shrinks to half, its top 20px higher; the question sits 20px under it.
  const m = mid.getBoundingClientRect(), l = lifter.getBoundingClientRect();
  const top = l.top - m.top - 20 + l.height * 0.5 + 20;
  ask.style.top = `${top}px`;
  mid.append(ask);
  const wrap = pp.el.querySelector(".more-wrap");
  const h0 = ask.offsetHeight, extra = wrap ? wrap.firstChild.scrollHeight + 8 : 0;
  // If the question (or the open "Show more") would reach past where "End your day" was, everything moves up together.
  // With the bottom pill, "End your day" is inside it (and the pill hides), so the limit is just above Lifeline instead:
  // crisis support always stays in view and tappable (alex 2026-11-21).
  const lifeline = document.body.classList.contains("has-pill") && mid.parentElement.querySelector(".lifeline");
  const floor = () => (lifeline ? lifeline.getBoundingClientRect().top - 8 : hide.getBoundingClientRect().bottom);
  const shift = (open) => Math.max(0, Math.round(m.top + top + h0 + (open ? extra : 0) - floor()));
  const up = (s) => `translateY(${-20 - s}px) scale(.5)`;
  let at = up(shift(false));
  const move = (to, ms) => {
    const from = getComputedStyle(lifter).transform;
    lifter.getAnimations().forEach((a) => a.cancel());
    lifter.animate([{ transform: from === "none" ? "none" : from }, { transform: to }], { duration: D(ms) || 1, easing: SOFT, fill: "forwards" });
    at = to;
  };
  move(at, 800);
  ask.style.transform = `translateY(${-shift(false)}px)`;
  requestAnimationFrame(() => requestAnimationFrame(() => ask.classList.add("on")));
  setTimeout(() => ask.classList.add("settled"), D(1300));
  hide.classList.add("soft-gone");
  const label = pp.el.querySelector(":scope > .btn-text");
  if (label) label.addEventListener("click", () => {
    const open = label.getAttribute("aria-expanded") === "true", s = shift(open);
    move(up(s), 550); ask.style.transform = `translateY(${-s}px)`;
  });

  let gone = false;
  const finish = (list) => {
    if (gone) return; gone = true;
    hide.classList.remove("soft-gone");
    document.body.classList.remove("ask-open");   // the bottom pill comes back as soon as they've answered
    ask.classList.remove("on"); ask.classList.add("leaving");
    setTimeout(() => ask.remove(), D(400));
    onPick(list);
    const any = list.length > 0, good = list.some((w) => !HEAVY.includes(w));
    const MOVE = 2200, HOLD = 900, FADE = 1500, ALL = MOVE + HOLD + FADE, WAIT = 260;
    // The glow: from wherever the breathing edge was, up to its peak as the card lands, hold, then gone.
    const start = getComputedStyle(front).boxShadow;
    el.classList.remove("todo");
    const peak = any && good ? "0 0 0 1px rgb(227 196 134 / .6), 0 0 52px rgb(242 192 143 / .5), 0 14px 30px rgba(0, 0, 0, .5)"
      : any ? "0 0 0 1px rgb(169 185 214 / .4), 0 0 26px rgb(169 185 214 / .22), 0 14px 30px rgba(0, 0, 0, .5)"
      : "0 0 0 1px rgb(227 196 134 / .4), 0 0 24px rgb(242 192 143 / .22), 0 14px 30px rgba(0, 0, 0, .5)";
    const end = "0 0 0 1px rgb(227 196 134 / .18), 0 0 0 rgb(242 192 143 / 0), 0 14px 30px rgba(0, 0, 0, .5)";
    if (!rm) front.animate([
      { boxShadow: start && start !== "none" ? start : end, offset: 0, easing: "ease-in" },
      { boxShadow: peak, offset: MOVE / ALL },
      { boxShadow: peak, offset: (MOVE + HOLD) / ALL, easing: "ease-out" },
      { boxShadow: end, offset: 1 }], { duration: ALL, delay: WAIT, fill: "both" });
    // Home again, all in one move.
    const frames = !any ? [{ transform: at }, { transform: "none" }]
      : [{ transform: at, offset: 0 }, { transform: good ? "translateY(-10px) scale(1.01)" : "translateY(6px) scale(.99)", offset: 0.6 }, { transform: "none", offset: 1 }];
    frames[0].transform = getComputedStyle(lifter).transform;
    lifter.getAnimations().forEach((a) => a.cancel());
    lifter.animate(frames, { duration: D(MOVE) || 1, delay: D(WAIT), easing: SOFT, fill: "both" });
    // The gold word takes the size's place while the card is still moving.
    if (any) {
      const size = el.querySelector(".card-foot .size"), w = feltEl(list);
      if (size) { size.classList.add("out"); w.classList.add("enter"); setTimeout(() => { size.replaceWith(w); requestAnimationFrame(() => requestAnimationFrame(() => w.classList.remove("enter"))); }, D(600)); }
    }
    // Then it greys out to its done look, as the glow dies. The gold word stays gold.
    setTimeout(() => el.classList.add("did"), D(WAIT + MOVE + HOLD));
    setTimeout(() => { document.body.classList.remove("in-ask"); onEnd(); }, D(WAIT + ALL + 100));
  };
  ok.addEventListener("click", () => { if (upPill && upPill.getAttribute("aria-pressed") === "true") library.up(id); finish([...felt]); });
  later.addEventListener("click", () => finish([]));
}
