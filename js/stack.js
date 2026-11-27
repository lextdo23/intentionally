// The stack behind today's card (alex 2026-11-27, option B on "Daydeck · Week cards and set dates on home").
// Cards that happen later (js/later.js) wait behind today's card, only their tops showing: "Date night · Sat 5 Dec",
// "Walk or jog · ●○○". Tapping a top brings that card to the front (the front card slips back, the new one comes
// forward), and today's card becomes a top itself. On a planned date that card is in front when the day opens,
// with a camera in the middle of its foot (alex 2026-11-27: just the camera, no words).
import { h, dayKey, addDays, reduceMotion } from "./util.js";
import * as store from "./store.js";
import * as deck from "./deck.js";
import * as photos from "./photos.js";
import * as later from "./later.js";
import { homeCard, camBtn, tickEl } from "./draw.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";

const MAX_TOPS = 3;
let front = { day: "", f: null, picked: false }, entering = false;

// Which card is in front on day k: one picked by tapping, else a date that's today, else today's card.
export function frontOf(items, k = dayKey()) {
  if (front.day !== k) front = { day: k, f: null, picked: false };
  if (front.picked) return items.some((x) => x.f === front.f) ? front.f : null;
  const t = items.find((x) => x.today);
  return t ? t.f : null;
}
export function bringForward(f) { front = { day: dayKey(), f, picked: true }; entering = true; }

const dots = (it) => h("span.st-dots", { "aria-hidden": "true" }, Array.from({ length: it.n }, (_, i) => h(`i${i < it.ticks.length ? ".on" : ""}`)));
const dot = (pillar) => h("i.st-pil", { style: { background: deck.PILLAR_COL[pillar] || "#a9a59d" }, "aria-hidden": "true" });
const statusOf = (it) => (it.kind === "week" ? h("span.st-status", null, it.n > 1 ? dots(it) : it.tickedToday ? "Done" : "This week") : h("span.st-status", null, it.status));
const said = (it) => (it.kind === "week" ? `${it.label}, ${it.ticks.length} of ${it.n} this week` : `${it.label}, ${it.status}`);

// The whole stack: the tops, then the card in front. today = today's card (a lifter from homeCard) or null.
export function stackEl({ items, today, todayCard, k = dayKey(), redraw, hide }) {
  let f = frontOf(items, k);
  if (f === null && !today) f = items[0].f;   // no card of today's to show: the first waiting card comes forward
  const tops = [];
  if (f !== null && today) tops.push({ f: null, label: "Today's card", pillar: todayCard ? (deck.card(todayCard.id) || {}).pillar : "", el: h("span.st-status", null, todayCard && (todayCard.done || todayCard.how >= 1) ? "Done" : "To do") });
  items.filter((x) => x.f !== f).forEach((x) => tops.push({ ...x, el: statusOf(x) }));
  const shown = tops.slice(0, MAX_TOPS);
  const wrap = h("div.stack");
  const go = (to, topEl) => {
    if (wrap.dataset.busy) return; wrap.dataset.busy = "1";
    const rm = reduceMotion(), cur = wrap.querySelector(".stack-front");
    log("stack_front", to === null ? "today" : (later.kindOf((items.find((x) => x.f === to) || {}).id) || {}).k || "?");
    if (rm || !cur) { bringForward(to); redraw(); return; }
    // The front card slips back and up into the stack while the tapped top lifts away, then the new one comes forward.
    cur.animate([{ transform: "none", opacity: 1 }, { transform: "translateY(-44px) scale(.9)", opacity: 0 }], { duration: 300, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
    topEl.animate([{ transform: "none", opacity: 1 }, { transform: "translateY(16px)", opacity: 0 }], { duration: 220, easing: "ease-in", fill: "forwards" });
    setTimeout(() => { bringForward(to); redraw(); }, 280);
  };
  // Nearest the card is widest; each one further back is a little narrower, like cards in a pile.
  const topsEl = h("div.stack-tops", null, shown.slice().reverse().map((t, i, arr) => {
    const depth = arr.length - 1 - i;
    const b = h("button.stack-top", { type: "button", style: { "--d": depth }, "aria-label": `${t.f === null ? "Today's card" : said(t)}. Bring it to the front.` },
      h("span.st-name", null, dot(t.pillar), h("span.st-label", null, t.label)), t.el);
    b.addEventListener("click", () => go(t.f, b));
    return b;
  }));
  const it = f !== null ? items.find((x) => x.f === f) : null;
  const card = it ? planCard(it, { redraw, hide }) : today;
  if (!card) return null;
  card.classList.add("stack-front");
  if (entering && !reduceMotion()) {
    entering = false;
    card.animate([{ transform: "translateY(-64px) scale(.9)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 460, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
    topsEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: 120, fill: "backwards" });
  } else entering = false;
  wrap.append(shown.length ? topsEl : "", card);
  return wrap;
}

// A card from the stack in front: the card itself, with its own foot.
function planCard(it, { redraw, hide }) {
  const k = dayKey(), pk = it.pk;
  const cam = () => import("./camera.js").then(({ openCamera }) => openCamera(pk, { onSaved: () => { log("plan_photo", it.kind); redraw(); } }));
  let lifter = null;
  const foot = (f) => {
    if (it.kind === "date" && it.unset) {
      f.classList.add("mid-foot");
      f.append(h("button.did", { type: "button", onclick: (e) => { e.stopPropagation(); whenSheet(it.f, redraw, "stack"); } }, "Set the date"));
    } else if (it.kind === "date" && pk) {
      f.classList.add("mid-foot");   // on the date (and the day after): just the camera, in the middle
      f.append(camBtn(pk, cam));
    } else if (it.kind === "date") {
      f.classList.add("mid-foot");
      f.append(h("button.did.quiet", { type: "button", onclick: (e) => { e.stopPropagation(); whenSheet(it.f, redraw, "stack", it.when); } }, "Change the date"));
    } else {
      const c = deck.card(it.id);
      const right = h("span.foot-right", null, it.tickedToday ? camBtn(pk, cam) : null,
        it.tickedToday ? tickEl(c) : h("button.did", { type: "button", onclick: (e) => { e.stopPropagation(); didToday(); } }, "Did it today"));
      f.append(it.n > 1 ? h("span.st-dots.big", { "aria-label": `${it.ticks.length} of ${it.n} days` }, Array.from({ length: it.n }, (_, i) => h(`i${i < it.ticks.length ? ".on" : ""}`))) : h("span.size", null, "This week"), right);
    }
  };
  // The last tick asks how it felt, the same way "I did it" does; any other tick just fills its dot.
  const didToday = () => {
    const r = later.tick(it.f, k);
    if (!r.done || !lifter) return redraw();
    import("./draw.js").then(({ askFelt }) => askFelt(lifter, it.id, { mid: lifter.closest(".home-mid"), hide,
      onPick: (list) => {
        const c = store.get().days[it.f].card;
        if (list.length) { c.felt = list; c.how = deck.howFromFelt(list); deck.feltWent(it.id, list); log("card_felt", { id: deck.tid(it.id), f: list.map((w) => deck.FELT.indexOf(w)), week: 1 }); }
        store.save();
      },
      onEnd: () => redraw() }));
  };
  lifter = homeCard(it.id, { state: "up", tag: it.kind === "week" ? (it.n > 1 ? `${it.ticks.length} of ${it.n} days` : "This week") : it.unset ? "No date yet" : it.status, foot });
  return lifter;
}

// "When is it?" (alex 2026-11-27): just a date, from today up to 8 weeks ahead, or "Not set yet".
export function whenSheet(f, done, from = "home", current = null) {
  const k = dayKey(), min = f > k ? f : k, max = addDays(f, later.AHEAD);
  const c = (store.get().days[f] || {}).card, kd = c && later.kindOf(c.id);
  openSheet((panel, close) => {
    const input = h("input.when-date", { type: "date", min, max, value: current || "", "aria-label": "The date" });
    const save = h("button.btn-main", { disabled: !current, onclick: () => { if (!input.value) return; later.setDate(f, input.value, from); close("done"); } }, "Save");
    input.addEventListener("input", () => { save.disabled = !input.value || input.value < min || input.value > max; });
    panel.append(h("div.col", { style: { gap: "4px" } }, h("h2", null, "When is it?"),
      h("p.sub", null, kd ? `${kd.l} shows behind today's card until then, and on the day you can add a photo.` : "It shows behind today's card until then.")),
      input, save,
      h("button.btn-quiet", { onclick: () => { later.setDate(f, null, from); close("later"); } }, "Not set yet"));
    setTimeout(() => { try { input.showPicker && input.showPicker(); } catch { /* not allowed without a tap */ } }, 50);
  }, { label: "When is it?", onClose: (why) => {
    // Closed without choosing, the first time: the same as "Not set yet", so "Set the date" waits in the stack.
    const cc = (store.get().days[f] || {}).card;
    if (why === "outside" && from === "home" && cc && !cc.when && !cc.nodate) later.setDate(f, null, from);
    done && done();
  } });
}
