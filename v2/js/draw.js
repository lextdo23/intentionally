// Today's card. After the sleep check-in, three cards are dealt face down from a deck hidden behind the middle one.
// Turn all three over, tap one to choose it, keep it. One "Draw again" a day: the hand folds into one card, the deck
// grows out from under it, riffles once, and deals three new. Every move uses one gentle ease-in-out and they overlap.
import { h, dayKey, reduceMotion, LIFELINE } from "./util.js";
import * as store from "./store.js";
import * as deck from "./deck.js";
import { roundBtn, openSheet } from "./ui.js";
import { log, on as testerOn } from "./tester.js";
import { show, close, step, where, spacer, mainBtn, begin } from "./checkin.js";
import { pickSteps } from "./pillars.js";

const SIZE = { Tiny: "Tiny", Small: "Small", Bigger: "Bigger" };
const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion() ? 0 : ms));

// Is a card still to draw today? Not on a rest day, and not once one is kept.
export function cardDue(k = dayKey()) {
  const d = store.get().days[k] || {};
  return !d.rest && !(d.card && d.card.id) && d.mood == null && deck.deck().length >= 3;
}

// One card's two faces. big = the full card with why it helps.
export function cardEl(id, { big = false, tag = "button" } = {}) {
  const el = h(`${tag}.dcard${big ? ".big" : ""}`, { type: tag === "button" ? "button" : null });
  el.append(h("div.in", null, h("div.face.back"), h("div.face.front")));
  if (id) fill(el, id, big);
  return el;
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
    h("span.size", null, SIZE[c.size] || c.size)].filter(Boolean));
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
  const k = dayKey(), d = store.day(k);
  // Leaving and coming back keeps the same three (and the same number of draws).
  if (!d.card || !d.card.hands || !d.card.hands.length) {
    const ids = deck.draw3([], k);
    d.card = { hands: [ids] }; deck.shown(ids, k); store.save();
    log("card_draw", ids);
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
    log("card_keep", { id, draw: d.card.hands.length });
    big(st, id);
  });
  const lastLine = h("p.note", null, "That's your last draw for today. Pick the closest fit.");
  const again = h("button.btn-quiet", { onclick: () => redraw() }, "Draw again");
  let armed = false;
  const rest = deck.restLeft(k) ? h("button.btn-quiet", { onclick: () => {
    if (!armed) { armed = true; rest.textContent = "Tap again for a rest day, no card"; setTimeout(() => { armed = false; rest.textContent = "Make today a rest day, no card"; }, 4000); return; }
    const dd = store.day(k); dd.rest = true; deck.passed(st.ids); store.save(); log("card_rest"); close(true);
  } }, "Make today a rest day, no card") : null;

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
    if (!e.classList.contains("up")) { e.classList.add("up"); st.up[j] = true; fill(e, st.ids[j]); log("card_turn", st.ids[j]); say(); return; }
    if (!allUp()) { hint.textContent = "Turn the other cards over first"; return; }
    st.pick = j; handEls.forEach((x, i) => x.classList.toggle("sel", i === j)); apply();
    keep.setAttribute("aria-disabled", "false"); say();
  }));

  // Draw again, as one flowing move.
  const redraw = async () => {
    if (busy || d.card.hands.length >= 2) return;
    busy = true; keep.setAttribute("aria-disabled", "true"); hint.textContent = "Shuffling…";
    deck.passed(st.ids);
    const ids = deck.draw3(d.card.hands.flat(), k);
    d.card.hands.push(ids); deck.shown(ids, k); store.save();
    log("card_redraw", ids);
    again.replaceWith(lastLine);
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

  const foot = [keep, d.card.hands.length >= 2 ? lastLine : again, rest, LIFELINE()];
  show(step(
    [roundBtn("close", "Not now", () => { log("card_later"); close(false); }), where("Today's card"), spacer()],
    [h("h1.q.rise", null, "Pick one for today"), h("div.rise", null, stage), h("div.rise", null, hint)],
    foot));
  if (dealIn && !reduceMotion()) { pile(); requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => deal(false), 260))); }
  else { pile(); deal(true); }
}

// ---------------- The kept card ----------------
function big(st, id) {
  const k = dayKey(), d = store.day(k);
  const face = cardEl(id, { big: true, tag: "div" }); face.classList.add("up");
  const holder = h("div.big-holder", null, face);
  const helpers = h("div.helpers");
  const draw = () => {
    helpers.replaceChildren(...[
      deck.canShrink(id) ? h("button.btn-pill", { onclick: () => {
        const from = id, to = deck.smaller(id, st.ids); if (!to) return;
        id = to; st.ids[st.pick] = to; d.card.smaller = from; store.save(); log("card_smaller", { from, to });
        swap();
      } }, "Make it smaller") : null,
      h("button.btn-pill", { onclick: () => {
        deck.save(id); log("card_save", id);
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
    [mainBtn("Done", true, () => { d.card.id = id; store.save(); deck.unsave(id); close(true); }), LIFELINE()]));
}

// From home: draw today's card (when "Not now" was pressed after the sleep check-in).
export function openDraw(onDone) { begin(onDone); log("card_open_draw"); drawSteps(); }

// ---------------- Evening: how did it go? ----------------
// If "I did it" was tapped, it asks how it went (no "Didn't get to it"). If not, it first asks if they got to it.
export function howStep(id, picked, back, done, label, { did = false } = {}) {
  const c = deck.card(id), from = did ? 1 : 0;
  const go = mainBtn("Done", picked != null && picked >= from, () => done(sel));
  let sel = picked;
  const pills = h("div.pills", { style: { justifyContent: "center" }, role: "radiogroup", "aria-label": did ? "How did it go?" : "Did you get to your card?" },
    deck.HOW.map((w, i) => i < from ? null : h("button.pill", { role: "radio", "aria-checked": String(sel === i), "aria-pressed": String(sel === i), onclick: () => {
      sel = i; pills.querySelectorAll(".pill").forEach((p) => { const on = +p.dataset.i === i; p.setAttribute("aria-pressed", String(on)); p.setAttribute("aria-checked", String(on)); });
      go.setAttribute("aria-disabled", "false");
    }, "data-i": String(i) }, w)).filter(Boolean));
  return step(
    [roundBtn("back", "Back", back), where(label), spacer()],
    [h("div.mini.rise", null, h("span.ctag", null, h("i", { style: { background: deck.PILLAR_COL[c.pillar] } }), c.pillar), h("span", null, c.text)),
      h("h1.q.rise", null, did ? "How did it go?" : "Did you get to your card?"), h("div.rise", null, pills)],
    [go, LIFELINE()]);
}

// ---------------- Home: today's card floats where the sun is ----------------
// state: "down" (face down, waiting to be drawn), "up" (face up, with "I did it"), "done" (turned back over with a tick),
// "skip" (the day ended without it: back in the deck, no guilt). flip = it was just done, so the tick fills in now.
let timers = [], lastSpin = -1e9;
const T0 = performance.now();
export function homeCard(id, { state = "up", flip = false, onTap, onDid, onUndo } = {}) {
  timers.forEach(clearTimeout); timers = [];
  const el = cardEl(id || null, { tag: "div" }); el.classList.add("home-card");
  if (state === "up" || state === "done") el.classList.add("up");
  const back = el.querySelector(".back"), c = id ? deck.card(id) : null;
  // Done (alex 2026-11-15, "fill the circle, step back"): the card stays face up, a small circle in its pillar's colour
  // fills with a tick where "I did it" was, and the whole card steps back a little.
  if (state === "done") {
    el.classList.add("did"); if (flip) el.classList.add("fresh");
    const size = el.querySelector(".front .size"), foot = h("span.card-foot");
    size.replaceWith(foot);
    foot.append(size, h("span.tick-done", { "aria-hidden": "true", style: { background: deck.PILLAR_COL[c.pillar] || "#a9a59d" } },
      h("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "#1d1e22", "stroke-width": "2.8", "stroke-linecap": "round", "stroke-linejoin": "round" }, h("path", { d: "M5 12.5l4.5 4.5L19 7.5" }))));
  }
  if (state === "skip") { back.classList.add("marked"); back.append(h("span.dot", { "aria-hidden": "true" }), h("span.done-task", null, "Back in the deck for another day")); }
  if (state === "up") {
    const did = h("button.did", { type: "button", onclick: (e) => { e.stopPropagation(); onDid && onDid(); } }, "I did it");
    const size = el.querySelector(".front .size"), foot = h("span.card-foot");
    size.replaceWith(foot); foot.append(size, did);
  }
  const label = { down: onTap ? "Today's card, face down. Tap to draw it." : "Today's card, face down.", up: c && `Today's card: ${c.text}. Tap to see why it helps.`,
    done: c && `Done today: ${c.text}. Tap to see the card.`, skip: "Today's card went back in the deck for another day." }[state];
  el.setAttribute("aria-label", label);
  const tap = state === "down" ? onTap : state === "skip" ? null : () => openCard(id, state === "done" ? onUndo : null);
  if (tap) {
    el.setAttribute("role", "button"); el.tabIndex = 0;
    el.addEventListener("click", tap);
    el.addEventListener("keydown", (e) => { if (e.target === el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); tap(); } });
  } else el.setAttribute("role", "img");
  // Keep the float and sway going smoothly when home redraws (no jump back to the start).
  const t = performance.now() - T0;
  el.style.animationDelay = `${-(t % 11000)}ms`;
  // It turns: follow your finger, or on its own every 15 seconds (alex 2026-11-15). A face-down card shows its back both ways.
  if (state === "down") el.classList.add("blank");
  if (state !== "skip") spinner(el, state === "down" ? 0 : 180);
  return h("div.lifter", null, h("div.floater", { style: { animationDelay: `${-(t % 7000)}ms` } }, el));
}
// Drag sideways and the card turns with your finger; let go and it carries on, slowing to rest face up again.
// On its own it turns twice and hops a little every 15 seconds, only while home is on screen and nobody is touching it.
const easeOut = (t) => 1 - Math.pow(1 - t, 3), easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function spinner(el, rest) {
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
  const busy = () => document.hidden || held || raf || performance.now() - touched < 4000 || document.querySelector(".sheet-host")
    || ["in-flow", "in-days", "in-settings"].some((c) => document.body.classList.contains(c));
  const auto = () => {
    if (!el.isConnected) return;
    if (!reduceMotion() && !busy()) {
      lastSpin = performance.now();
      glide(restAt(a) + 720, 1350, easeInOut);
      inn.classList.remove("hop"); void inn.offsetWidth; inn.classList.add("hop");
    }
    timers.push(setTimeout(auto, 15000));
  };
  timers.push(setTimeout(auto, Math.max(2000, 15000 - (performance.now() - lastSpin))));
}
function openCard(id, onUndo) {
  log("card_open", id);
  openSheet((panel, close) => {
    const face = cardEl(id, { big: true, tag: "div" }); face.classList.add("up");
    panel.append(h("div.big-holder", { style: { padding: "8px 0" } }, face));
    if (onUndo) panel.append(h("div.helpers", null, h("button.btn-pill", { onclick: () => { close(); onUndo(); } }, "Not done yet")));
    if (testerOn()) {
      const d = store.day(dayKey()), cur = d.card && d.card.thumb;
      const row = h("div.helpers");
      const t = (v, label) => h("button.btn-pill", { "aria-pressed": String(cur === v), onclick: () => {
        d.card.thumb = v; store.save(); log("card_thumb", { id, v });
        row.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String((i ? -1 : 1) === v)));
      } }, label);
      panel.append(h("div.col", { style: { gap: "8px" } }, h("span.note", null, "Testers: is this a good card?"), row));
      row.append(t(1, "Good card"), t(-1, "Needs work"));
    }
  }, { label: "Today's card" });
}
