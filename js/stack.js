// The stack behind today's card (alex 2026-11-27, option B on "Daydeck · Week cards and set dates on home").
// Cards that happen later (js/later.js) wait behind today's card, only their tops showing: "Date night · Sat 5 Dec",
// "Walk or jog · ●○○". Tapping a top brings that card to the front (the front card slips back, the new one comes
// forward), and today's card becomes a top itself. On a planned date that card is in front when the day opens,
// with a camera in the middle of its foot (alex 2026-11-27: just the camera, no words).
// Three cards at most (today's and two waiting, later.MAX_WAIT). The tops float too, more gently than the front card,
// with no glow (alex 2026-11-27). Switching feels like real cards, side to side: the tapped card slides out sideways from
// behind the pile and sweeps in front while the old front card tucks back into the pile, with no fading.
import { h, dayKey, addDays, reduceMotion } from "./util.js";
import * as store from "./store.js";
import * as deck from "./deck.js";
import * as photos from "./photos.js";
import * as later from "./later.js";
import { homeCard, camBtn, tickEl } from "./draw.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";

const MAX_TOPS = 2;
let front = { day: "", f: null, picked: false, prev: undefined }, pending = null;

// Which card is in front on day k: one picked by tapping, else a date that's today, else today's card.
export function frontOf(items, k = dayKey()) {
  if (front.day !== k) front = { day: k, f: null, picked: false };
  if (front.picked) return items.some((x) => x.f === front.f) ? front.f : null;
  const t = items.find((x) => x.today);
  return t ? t.f : null;
}
// prev: the card that was in front before, so it sits right behind the new front card (a card you push back goes
// just behind the one you pulled forward, not to the back of the pile).
export function bringForward(f, prev) { front = { day: dayKey(), f, picked: true, prev }; }

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
  const pi = front.prev === undefined ? -1 : tops.findIndex((t) => t.f === front.prev);
  if (pi > 0) tops.unshift(tops.splice(pi, 1)[0]);
  const shown = tops.slice(0, MAX_TOPS);
  const wrap = h("div.stack");
  const go = (to, topEl) => {
    if (wrap.dataset.busy) return; wrap.dataset.busy = "1";
    const cur = wrap.querySelector(".stack-front");
    log("stack_front", to === null ? "today" : (later.kindOf((items.find((x) => x.f === to) || {}).id) || {}).k || "?");
    if (!reduceMotion() && cur) {
      // A copy of the front card stays where it is, so it can tuck back into the pile after home redraws.
      const wr = wrap.getBoundingClientRect(), r = cur.getBoundingClientRect(), ghost = cur.cloneNode(true);
      ghost.classList.add("stack-ghost"); ghost.classList.remove("stack-front");
      ghost.style.animation = "none";   // the copy holds the angle the card had mid-sway, rather than restarting its sway
      const tilt = getComputedStyle(cur).transform;
      Object.assign(ghost.style, { left: `${r.left - wr.left}px`, top: `${r.top - wr.top}px`, width: `${r.width}px` });
      const tops = {}; wrap.querySelectorAll(".stack-top").forEach((t) => { tops[t.dataset.f] = t.getBoundingClientRect(); });
      pending = { ghost, from: topEl.getBoundingClientRect(), wasTop: wr.top, oldF: f, tops, tilt: tilt && tilt !== "none" ? tilt : "none" };
    }
    bringForward(to, f); redraw();
  };
  // Nearest the card is widest; each one further back is a little narrower, like cards in a pile.
  const topsEl = h("div.stack-tops", null, shown.slice().reverse().map((t, i, arr) => {
    const depth = arr.length - 1 - i;
    const b = h("button.stack-top", { type: "button", "data-f": t.f === null ? "today" : t.f, style: { "--d": depth }, "aria-label": `${t.f === null ? "Today's card" : said(t)}. Bring it to the front.` },
      h("span.st-name", null, dot(t.pillar), h("span.st-label", null, t.label)), t.el);
    b.addEventListener("click", () => go(t.f, b));
    return b;
  }));
  const it = f !== null ? items.find((x) => x.f === f) : null;
  const card = it ? planCard(it, { redraw, hide }) : today;
  if (!card) return null;
  card.classList.add("stack-front");
  topsEl.style.animationDelay = `-${Math.round(performance.now() % 7000)}ms`;   // the tops keep floating in step across a redraw
  wrap.append(shown.length ? topsEl : "", card);
  if (pending) { const pd = pending; pending = null; requestAnimationFrame(() => swap(pd, wrap)); }
  return wrap;
}

// The switch, one move at a time like a real pile (alex 2026-11-27):
// 1. Switch: the tapped card slides out sideways from the pile and lands in front. The old front card stays still and
//    ends up hidden behind it (a copy, since home has redrawn; same size and place, so it's exactly covered).
// 2. Make room: if the back card was tapped, the middle card's top slides back into the place it left.
// 3. Rise: the old front card's top rises from behind the front card into the place right behind it.
// Nothing fades; only the warm light behind a card eases in, so it never pops on.
function swap(pd, wrap) {
  const nf = wrap.querySelector(".stack-front");
  if (!nf || !wrap.isConnected) return pd.ghost.remove();
  const wr = wrap.getBoundingClientRect(), nr = nf.getBoundingClientRect(), g = pd.ghost;
  g.style.top = `${parseFloat(g.style.top) + (pd.wasTop - wr.top)}px`;
  wrap.append(g);
  const slot = wrap.querySelector(`.stack-top[data-f="${pd.oldF === null ? "today" : pd.oldF}"]`);
  if (slot) slot.style.visibility = "hidden";
  const D1 = 520, D2 = 300, D3 = 340, ease = "cubic-bezier(.45,.05,.25,1)";
  // 1. Switch.
  const s0 = Math.min(1, pd.from.width / nr.width), dy0 = pd.from.top - nr.top, out = Math.round(nr.width * 0.6);
  nf.style.transformOrigin = "50% 50%";
  nf.style.animationDelay = `${D1 - 2750}ms`;   // its sway is level just as it lands, so there's no snap
  nf.animate([
    { transform: `translate(0px, ${dy0}px) scale(${s0})`, zIndex: 0, offset: 0 },
    { transform: `translate(${out}px, ${Math.round(dy0 * 0.35)}px) scale(${(s0 + 1) / 2}) rotate(4deg)`, zIndex: 0, offset: 0.5 },
    { transform: `translate(${out}px, ${Math.round(dy0 * 0.35)}px) scale(${(s0 + 1) / 2}) rotate(4deg)`, zIndex: 3, offset: 0.5 },
    { transform: "none", zIndex: 3, offset: 1 },
  ], { duration: D1, easing: ease, fill: "backwards" }).finished.then(() => g.remove(), () => g.remove());
  const nGlow = nf.querySelector(".glow");
  if (nGlow) nGlow.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: D1 + 500, easing: "ease-out", fill: "backwards" });
  g.style.zIndex = "1";   // above the new card until it's out to the side, always below it once it's in front
  g.style.transform = pd.tilt;   // holds the angle it had mid-sway
  // 2. Make room: tops that changed place glide there once the switch is done.
  let moved = false;
  wrap.querySelectorAll(".stack-top").forEach((t) => {
    const was = pd.tops && pd.tops[t.dataset.f];
    if (!was || t === slot) return;
    const now = t.getBoundingClientRect();
    if (Math.abs(was.top - now.top) < 1 && Math.abs(was.width - now.width) < 1) return;
    moved = true;
    t.style.transformOrigin = "50% 0";
    t.animate([{ transform: `translateY(${was.top - now.top}px) scaleX(${was.width / now.width})` }, { transform: "none" }], { delay: D1, duration: D2, easing: ease, fill: "backwards" });
  });
  // 3. Rise.
  if (slot) {
    const sr = slot.getBoundingClientRect(), hide = Math.round(nr.top - sr.top + 4), at = D1 + (moved ? D2 : 0);
    slot.style.visibility = "";
    slot.animate([
      { transform: `translateY(${hide}px)`, visibility: "hidden", offset: 0 },
      { transform: `translateY(${hide}px)`, visibility: "visible", offset: at / (at + D3), easing: "cubic-bezier(.2,0,.1,1)" },
      { transform: "none", visibility: "visible", offset: 1 },
    ], { duration: at + D3, easing: "linear", fill: "backwards" });
  }
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
