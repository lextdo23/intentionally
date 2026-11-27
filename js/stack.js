// The stack behind today's card (alex 2026-11-27, option B on "Daydeck · Week cards and set dates on home").
// Cards that happen later (js/later.js) wait behind today's card, only their tops showing: "Date night · Sat 5 Dec",
// "Walk or jog · ●○○". Tapping a top brings that card to the front (the front card slips back, the new one comes
// forward), and today's card becomes a top itself. On a planned date that card is in front when the day opens,
// with a camera in the middle of its foot (alex 2026-11-27: just the camera, no words).
// Three cards at most (today's and two waiting, later.MAX_WAIT). The tops float too, more gently than the front card,
// with no glow (alex 2026-11-27). Switching feels like real cards: the tapped card slides out from behind the pile and
// lands on top while the old front card tucks back into the pile, with no fading.
import { h, dayKey, addDays, reduceMotion } from "./util.js";
import * as store from "./store.js";
import * as deck from "./deck.js";
import * as photos from "./photos.js";
import * as later from "./later.js";
import { homeCard, camBtn, tickEl } from "./draw.js";
import { openSheet } from "./ui.js";
import { log } from "./tester.js";
import * as plans from "./plans.js";
import * as friends from "./friends.js";

const MAX_TOPS = 2;
let front = { day: "", f: null, picked: false }, pending = null;

// Which card is in front on day k: one picked by tapping, else a date that's today, else today's card.
export function frontOf(items, k = dayKey()) {
  if (front.day !== k) front = { day: k, f: null, picked: false };
  if (front.picked) return items.some((x) => x.f === front.f) ? front.f : null;
  const t = items.find((x) => x.today);
  return t ? t.f : null;
}
export function bringForward(f) { front = { day: dayKey(), f, picked: true }; }

const dots = (it) => h("span.st-dots", { "aria-hidden": "true" }, Array.from({ length: it.n }, (_, i) => h(`i${i < it.ticks.length ? ".on" : ""}`)));
const dot = (pillar) => h("i.st-pil", { style: { background: deck.PILLAR_COL[pillar] || "#a9a59d" }, "aria-hidden": "true" });
// A shared date (alex 2026-11-27) shows a small face before its date: the friend who invited you, or the first
// friend you invited.
const faceOf = (it) => (it.guest ? it.guest.by : it.plan && it.plan.guests.length ? it.plan.guests[0] : null);
const smallFace = (it) => { const p = faceOf(it); if (!p) return null; const el = friends.pic(p, 22); el.classList.add("st-face"); return el; };
const statusOf = (it) => (it.kind === "week" ? h("span.st-status", null, it.n > 1 ? dots(it) : it.tickedToday ? "Done" : "This week") : h("span.st-status", null, smallFace(it), it.status));
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
    const cur = wrap.querySelector(".stack-front");
    log("stack_front", to === null ? "today" : (later.kindOf((items.find((x) => x.f === to) || {}).id) || {}).k || "?");
    if (!reduceMotion() && cur) {
      // A copy of the front card stays where it is, so it can tuck back into the pile after home redraws.
      const wr = wrap.getBoundingClientRect(), r = cur.getBoundingClientRect(), ghost = cur.cloneNode(true);
      ghost.classList.add("stack-ghost"); ghost.classList.remove("stack-front");
      Object.assign(ghost.style, { left: `${r.left - wr.left}px`, top: `${r.top - wr.top}px`, width: `${r.width}px` });
      pending = { ghost, from: topEl.getBoundingClientRect(), wasTop: wr.top, oldF: f };
    }
    bringForward(to); redraw();
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
  wrap.append(shown.length ? topsEl : "", card, it ? under(it, redraw) || "" : "");
  if (pending) { const pd = pending; pending = null; requestAnimationFrame(() => swap(pd, wrap)); }
  return wrap;
}

// The switch, like real cards (alex 2026-11-27): the new front card starts where its top was, behind the old card,
// slides up out of the pile, then comes down on top; the old card (a copy, since home has redrawn) tucks back up into
// the pile at the same time, narrowing into its top's place. Nothing fades.
function swap(pd, wrap) {
  const nf = wrap.querySelector(".stack-front");
  if (!nf || !wrap.isConnected) return pd.ghost.remove();
  const wr = wrap.getBoundingClientRect(), nr = nf.getBoundingClientRect(), g = pd.ghost;
  // The copy goes back into the same pile, where the old card was (home may have shifted by a few points).
  g.style.top = `${parseFloat(g.style.top) + (pd.wasTop - wr.top)}px`;
  wrap.append(g);
  const slot = wrap.querySelector(`.stack-top[data-f="${pd.oldF === null ? "today" : pd.oldF}"]`), sr = slot ? slot.getBoundingClientRect() : pd.from;
  if (slot) slot.style.visibility = "hidden";
  const D = 760;
  const s0 = Math.min(1, pd.from.width / nr.width), dy0 = pd.from.top - nr.top, lift = -48;
  nf.style.transformOrigin = "50% 0";
  nf.animate([
    { transform: `translateY(${dy0}px) scale(${s0})`, zIndex: 1, offset: 0 },
    { transform: `translateY(${dy0 + lift}px) scale(${s0 + 0.03})`, zIndex: 1, offset: 0.42 },
    { transform: `translateY(${dy0 + lift}px) scale(${s0 + 0.03})`, zIndex: 3, offset: 0.43 },
    { transform: "none", zIndex: 3, offset: 1 },
  ], { duration: D, easing: "cubic-bezier(.35,.1,.25,1)", fill: "backwards" });
  const gr = g.getBoundingClientRect();
  g.style.transformOrigin = "50% 0";
  g.animate([
    { transform: "none", offset: 0 },
    { transform: `translateY(${(sr.top - gr.top) * 0.35}px) scale(${1 - (1 - sr.width / gr.width) * 0.5})`, offset: 0.42 },
    { transform: `translateY(${sr.top - gr.top}px) scale(${sr.width / gr.width})`, offset: 1 },
  ], { duration: D, easing: "cubic-bezier(.45,0,.3,1)", fill: "forwards" }).finished.then(() => { g.remove(); if (slot) slot.style.visibility = ""; });
}

// One quiet line under a shared date in front (alex 2026-11-27): who's in ("With Mia", "With Mia and Josh"), who
// hasn't answered yet ("Waiting for Sam"), or for an invite, "Not this time". Nothing when it isn't shared.
const nameList = (ps) => { const n = ps.map(friends.shown); return n.length <= 2 ? n.join(" and ") : `${n[0]}, ${n[1]} and ${n.length - 2} ${n.length === 3 ? "other" : "others"}`; };
const bold = (ps) => h("b", null, nameList(ps));
function under(it, redraw) {
  if (it.guest && it.ask) {
    return h("button.btn-quiet.plan-no", { type: "button", onclick: async (e) => { e.currentTarget.disabled = true; if (!(await plans.answer(it.guest.id, false))) friends.note("Couldn't reach Daydeck. Try again in a moment."); redraw(); } }, "Not this time");
  }
  const ins = it.guest ? [it.guest.by].concat(it.guest.others || []) : it.plan ? it.plan.guests.filter((g) => g.state === "in") : [];
  const asks = !it.guest && it.plan ? it.plan.guests.filter((g) => g.state !== "in") : [];
  if (!ins.length && !asks.length) return null;
  const words = [];
  if (ins.length) words.push("With ", bold(ins));
  if (asks.length) words.push(ins.length ? " · Waiting for " : "Waiting for ", bold(asks));
  return h("div.plan-with", null, friends.pic(ins[0] || asks[0], 24), h("span", null, words));
}

// A card from the stack in front: the card itself, with its own foot.
function planCard(it, { redraw, hide }) {
  const k = dayKey(), pk = it.pk;
  const cam = () => import("./camera.js").then(({ openCamera }) => openCamera(pk, { onSaved: () => { log("plan_photo", it.kind); redraw(); } }));
  let lifter = null;
  const foot = (f) => {
    if (it.guest && it.ask) {   // a friend's invite: who it's from, and "I'm in"
      const by = it.guest.by, face = friends.pic(by, 24);
      f.append(h("span.size.plan-from", null, face, h("span", null, "From ", h("b", null, friends.shown(by)))),
        h("button.did", { type: "button", onclick: async (e) => { e.stopPropagation(); e.currentTarget.disabled = true; if (!(await plans.answer(it.guest.id, true))) friends.note("Couldn't reach Daydeck. Try again in a moment."); redraw(); } }, "I'm in"));
      return;
    }
    if (it.guest && !pk) {   // a friend's date you're in: only they can change it; you can say you can't make it
      f.classList.add("mid-foot");
      f.append(h("button.did.quiet", { type: "button", onclick: (e) => { e.stopPropagation(); cantMake(it, redraw); } }, "Can't make it"));
      return;
    }
    if (it.kind === "date" && it.unset) {
      f.classList.add("mid-foot");
      f.append(h("button.did", { type: "button", onclick: (e) => { e.stopPropagation(); whenSheet(it.f, redraw, "stack"); } }, "Set the date"));
    } else if (it.kind === "date" && pk) {
      // On the date (and the day after): just the camera, in the middle; with the invite button on the left on the
      // day itself, the camera moves to the right (alex 2026-11-27).
      const inv = it.when >= k ? inviteBtn(it, redraw) : null;
      if (inv) f.append(inv, camBtn(pk, cam)); else { f.classList.add("mid-foot"); f.append(camBtn(pk, cam)); }
    } else if (it.kind === "date") {
      const inv = inviteBtn(it, redraw), change = h("button.did.quiet", { type: "button", onclick: (e) => { e.stopPropagation(); whenSheet(it.f, redraw, "stack", it.when); } }, "Change the date");
      if (inv) f.append(inv, change); else { f.classList.add("mid-foot"); f.append(change); }
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
  lifter = homeCard(it.id, { state: "up", tag: it.kind === "week" ? (it.n > 1 ? `${it.ticks.length} of ${it.n} days` : "This week") : it.unset ? "No date yet" : it.ask ? later.shortDate(it.when) : it.status, foot });
  return lifter;
}

// Inviting friends after the date is set (alex 2026-11-27, "after the fact"): a round button in your own date card's
// foot, any time up to and on the date, once Friends is ready (signed in, 18+ ticked, friends to ask).
const ADD_ICON = () => friends.svg(22, [["circle", { cx: "10", cy: "8.5", r: "3.4" }], ["path", { d: "M3.5 19.5c.8-3.3 3.4-5.2 6.5-5.2s5.7 1.9 6.5 5.2" }], ["path", { d: "M18.5 7.5v6M15.5 10.5h6" }]], { width: "55%", height: "55%" });
function inviteBtn(it, redraw) {
  if (it.guest || !it.when || it.unset || !friends.canShare()) return null;
  const b = h("button.card-cam.plan-add", { type: "button", "aria-label": it.plan && it.plan.guests.length ? "Invite more friends" : "Invite friends" }, ADD_ICON());
  const stop = (e) => e.stopPropagation();
  b.addEventListener("pointerdown", stop); b.addEventListener("touchstart", stop, { passive: true });
  b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); inviteSheet(it.f, redraw, "stack"); });
  return b;
}
// "Invite friends": just the row of friends for a date already set. Those already invited show ticked; untick
// someone to take them off (told only if they'd said "I'm in", as when the date is called off for them).
export function inviteSheet(f, done, from = "stack") {
  const c = (store.get().days[f] || {}).card, kd = c && later.kindOf(c.id);
  if (!c || !c.when || !kd || kd.k !== "date") return;
  const plan = plans.mineById(c.plan), before = plan ? plan.guests.map((g) => g.username) : [];
  let guests = before.slice();
  log("plan_invite_open", from === "days" ? 1 : 0);
  openSheet((panel, close) => {
    const d = friends.loaded(), nm = (u) => { const p = d && d.friends.find((x) => x.username === u); return p ? friends.shown(p) : u; };
    const btn = h("button.btn-main", { disabled: true, onclick: async () => {
      btn.disabled = true;
      if (await plans.save(f, guests)) close("done");
      else { btn.disabled = false; friends.note("Couldn't send the invite. Check your connection and try again."); }
    } }, "Invite");
    const fresh = () => {
      const add = guests.filter((u) => !before.includes(u)), gone = before.some((u) => !guests.includes(u));
      btn.disabled = !add.length && !gone;
      btn.textContent = add.length === 1 ? `Invite ${nm(add[0])}` : add.length > 1 ? `Invite ${add.length} friends` : "Save";
    };
    const row = friendRow(before, (list) => { guests = list; fresh(); }, { head: false });
    panel.append(h("div.col", { style: { gap: "4px" } }, h("h2", null, "Invite friends"),
      h("p.sub", null, `${kd.l} · ${later.shortDate(c.when)}. They'll get an invite. It lands on their home if they say yes.`)), row || "", btn);
    fresh();
  }, { label: "Invite friends", onClose: () => done && done() });
}

// "Can't make it" on a friend's date you said yes to: asks first, since the friend is told.
function cantMake(it, redraw) {
  const who = friends.shown(it.guest.by);
  openSheet((panel, close) => {
    panel.append(h("div.col", { style: { gap: "4px" } }, h("h2", null, `Can't make ${it.label}?`), h("p.sub", null, `${who} will see you can't make it.`)),
      h("button.btn-main", { onclick: async () => { if (await plans.leave(it.guest.id)) close("done"); else friends.note("Couldn't reach Daydeck. Try again in a moment."); } }, `Let ${who} know`),
      h("button.btn-quiet", { onclick: () => close("keep") }, "Keep it"));
  }, { label: `Can't make ${it.label}?`, onClose: () => redraw && redraw() });
}

// Friends you can invite to a date, as a row of faces to tick (alex 2026-11-27, up to 5). Only once Friends is open
// and you've ticked 18+ and have friends. picked: usernames already invited.
const MAX_GUESTS = 5;
function friendRow(picked, onChange, { head = true } = {}) {
  const d = friends.loaded();
  if (!friends.canShare() || !d) return null;
  const chosen = new Set(picked);
  const people = d.friends.slice().sort((a, b) => (chosen.has(b.username) ? 1 : 0) - (chosen.has(a.username) ? 1 : 0));
  const row = h("div.plan-ppl", { role: "group", "aria-label": "Friends to invite" });
  const draw = () => row.replaceChildren(...people.map((p) => {
    const on = chosen.has(p.username), full = !on && chosen.size >= MAX_GUESTS;
    return h(`button.fr-face.plan-face${on ? ".on" : ""}`, { type: "button", "aria-pressed": on ? "true" : "false", disabled: full, "aria-label": `Invite ${friends.shown(p)}`,
      onclick: () => { if (on) chosen.delete(p.username); else chosen.add(p.username); draw(); onChange([...chosen]); } },
    h("span.plan-pic", null, friends.pic(p, 56), on ? h("i.plan-tick", { "aria-hidden": "true" }, "✓") : null), h("span", null, friends.shown(p)));
  }));
  draw();
  if (!head) return row;
  return h("div.col.plan-invite", { style: { gap: "8px" } }, h("h3", null, "Doing it with a friend?"),
    h("p.sub", null, "They'll get an invite. It lands on their home if they say yes."), row);
}

// "When is it?" (alex 2026-11-27): just a date, from today up to 8 weeks ahead, or "Not set yet".
export function whenSheet(f, done, from = "home", current = null) {
  const k = dayKey(), min = f > k ? f : k, max = addDays(f, later.AHEAD);
  const c = (store.get().days[f] || {}).card, kd = c && later.kindOf(c.id);
  openSheet((panel, close) => {
    const input = h("input.when-date", { type: "date", min, max, value: current || "", "aria-label": "The date" });
    // Shared with friends (alex 2026-11-27): the row of faces, ticked for those already invited.
    const plan = plans.mineById(c && c.plan), before = plan ? plan.guests.map((g) => g.username) : [];
    let guests = before.slice();
    const label = () => {
      const fresh = guests.filter((u) => !before.includes(u)), d = friends.loaded();
      const nm = (u) => { const p = d && d.friends.find((x) => x.username === u); return p ? friends.shown(p) : u; };
      return fresh.length === 1 ? `Save and invite ${nm(fresh[0])}` : fresh.length > 1 ? `Save and invite ${fresh.length} friends` : "Save";
    };
    const changed = () => guests.length !== before.length || guests.some((u) => !before.includes(u));
    const save = h("button.btn-main", { disabled: !current, onclick: async () => {
      if (!input.value) return;
      later.setDate(f, input.value, from);
      const share = guests.length || (plan && (changed() || input.value !== plan.day));
      close("done");
      if (share && !(await plans.save(f, guests))) friends.note("Couldn't send the invite. Check your connection and try again from Change the date.");
    } }, "Save");
    const fresh = () => { save.disabled = !input.value || input.value < min || input.value > max || (input.value === current && !changed()); save.textContent = label(); };
    input.addEventListener("input", fresh);
    const row = kd && kd.k === "date" ? friendRow(before, (list) => { guests = list; fresh(); }) : null;
    panel.append(h("div.col", { style: { gap: "4px" } }, h("h2", null, "When is it?"),
      h("p.sub", null, kd ? `${kd.l} shows behind today's card until then, and on the day you can add a photo.` : "It shows behind today's card until then.")),
      input, row || "", save,
      h("button.btn-quiet", { onclick: () => { later.setDate(f, null, from); if (plan) plans.drop(f); close("later"); } }, plan ? "Not set yet (calls it off)" : "Not set yet"));
    if (current) fresh();
    setTimeout(() => { try { input.showPicker && input.showPicker(); } catch { /* not allowed without a tap */ } }, 50);
  }, { label: "When is it?", onClose: (why) => {
    // Closed without choosing, the first time: the same as "Not set yet", so "Set the date" waits in the stack.
    const cc = (store.get().days[f] || {}).card;
    if (why === "outside" && from === "home" && cc && !cc.when && !cc.nodate) later.setDate(f, null, from);
    done && done();
  } });
}
