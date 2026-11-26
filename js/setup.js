// First-time setup (alex 2026-11-26, thread "Map the new user sign-up flow"; walkthrough
// https://claude.ai/artifact/Q1D5tJzq3h8u5QoYbnHSGk). In order, every screen sliding on like it's moving forward:
//   Add to Home Screen (Safari on iPhone only, with no way past it) → Welcome (today's card) → pillars and mindsets →
//   the account (email, code, username; or "Use without an account") → Notifications → Help improve Daydeck →
//   Your deck is ready → home.
// "I already have an account" (a new phone): email, code, straight in, then Notifications and Help (their pillars come
// back with their backup). Four progress dots on the middle screens: pillars, account, notifications, testing.
//
// Only for new people: nothing done yet, no account and no "Use without an account" chosen (account.shouldAsk()).
// People already using Daydeck keep the one-time sign-up screen they had (js/account.js openSignup).
import { h, dayKey, keyDate, addDays, reduceMotion } from "./util.js";
import * as store from "./store.js";
import * as account from "./account.js";
import * as notify from "./notify.js";
import * as tester from "./tester.js";
import { openDetails } from "./tester-sheet.js";
import * as deck from "./deck.js";
import * as friends from "./friends.js";
import { pickSteps } from "./pillars.js";
import { homeCard } from "./draw.js";
import { step as makeStep } from "./checkin.js";
import { roundBtn } from "./ui.js";
import { now } from "./clock.js";

export const due = () => { const s = store.get(); return account.shouldAsk() && !s.started && !(s.seen || {}).setup; };

// What happened, kept until the person says yes to testing (nothing is logged before that), then sent as one event.
let memo = null;
const t0 = () => memo.t;

// ---------------- Progress dots ----------------
// Four steps: pillars, account, notifications, testing. Done ones are ink, this one a marigold dash, the rest grey.
const dots = (n) => h("div.setup-dots", { role: "img", "aria-label": `Step ${n} of 4` },
  [1, 2, 3, 4].map((i) => h(i < n ? "i.on" : i === n ? "i.now" : "i")));
const leadDots = (n) => h("div.setup-dots-top", null, dots(n));

export function openSetup(onDone) {
  if (!account.openLayer(onDone, "Getting started")) return;
  memo = { t: Date.now(), hs: 0, path: "new", acct: null, n: null };
  if (notify.needsInstall()) { memo.hs = 1; return account.slide(homeScreen); }
  const s = store.get();
  if (Array.isArray(s.pillars)) return account.accountPart(accountHooks(), {});   // came back part way through
  account.slide(welcome);
}

// ---------------- Add to Home Screen ----------------
// Safari on iPhone can't show notifications or keep Daydeck's data safe from being cleared, so new people put it on
// their Home Screen first (alex 2026-11-26: "I don't even want users to be able to continue if they use it in
// Safari"). Opened from the Home Screen, this never shows. The steps follow the iPhone's Safari: from iOS 26 the
// Share button sits behind the ••• button; before that it's at the bottom. (Safari 26 is the first with anchor
// positioning, and its user agent stopped saying the real iOS version.)
const ink = "currentColor";
const svg = (w, kids, sw = "2") => h("svg", { width: w, height: w, viewBox: "0 0 24 24", fill: "none", stroke: ink, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, kids);
const shareIcon = () => svg("18", [h("path", { d: "M12 3v12M8 7l4-4 4 4" }), h("path", { d: "M6 11H5v10h14V11h-1" })]);
const plusIcon = () => svg("18", [h("rect", { x: "4", y: "4", width: "20", height: "20", rx: "4", transform: "translate(-2 -2)" }), h("path", { d: "M12 8.5v7M8.5 12h7" })]);
function homeScreen() {
  const ios26 = typeof CSS !== "undefined" && CSS.supports && CSS.supports("anchor-name: --a");
  const row = (n, text, pic, sub) => h("div.hs-row", null,
    h("span.hs-n" + (n === 1 ? ".first" : ""), { "aria-hidden": "true" }, String(n)),
    h("div.hs-words", null, h("span", null, text), sub ? h("span.hs-sub", null, sub) : null), pic);
  const more = h("span.hs-more", { role: "img", "aria-label": "the ••• button" }, "•••");
  const share = h("span.hs-btn", null, shareIcon(), "Share");
  const add = h("span.hs-btn", null, "Add to Home Screen", plusIcon());
  const addBtn = h("span.hs-add", null, "Add");
  const rows = ios26
    ? [row(1, "Tap", more, "Bottom right of your screen"), row(2, "Tap", share, null), row(3, "Tap", add, "Scroll down if you can't see it"), row(4, "Tap", addBtn, "Top right. Then open Daydeck from your Home Screen.")]
    : [row(1, "Tap", share, "At the bottom of your screen"), row(2, "Tap", add, "Scroll down if you can't see it"), row(3, "Tap", addBtn, "Top right. Then open Daydeck from your Home Screen.")];
  return account.shell([
    h("img.hs-icon", { src: "icons/icon-512.png", alt: "", width: "72", height: "72" }),
    h("h1.acct-title", null, "Put Daydeck on your Home Screen"),
    h("div.hs-steps", null, rows),
  ], [], { cls: ".setup-hs" });
}

// ---------------- Welcome ----------------
// Today's card, swaying and lit like on home, then the one line about what Daydeck is.
function welcome() {
  const card = h("div.setup-card", null, homeCard(null, { state: "down" }));
  return account.shell([
    card,
    h("h1.acct-title.setup-big", null, "Welcome to Daydeck"),
    h("p.acct-text", null, "A card a day, for the parts of life that matter to you."),
  ], [
    h("button.btn-main", { onclick: () => { memo.path = "new"; pillars(); } }, "Let's set up your deck"),
    h("button.btn-quiet", { onclick: () => { memo.path = "returning"; account.accountPart(accountHooks(), { returning: true }); } }, "I already have an account"),
  ], { cls: ".setup-welcome" });
}

// ---------------- Pillars and mindsets ----------------
// The usual picker (js/pillars.js), shown inside setup with the dots, sliding like everything else.
const pickUI = (back) => ({
  show: (el) => account.slide(() => el),
  step: (head, body, foot) => { const s = makeStep(head, body, foot); s.classList.add("in"); return h("div.acct-screen.acct-pick", null, s); },
  dots: () => dots(1),
  back,
});
function pillars(then = afterPillars) {
  pickSteps(() => { memo.picked = 1; then(); }, { first: true, ui: pickUI(() => account.slide(welcome)) });
}
function afterPillars() {
  if (account.signedIn() || !account.shouldAsk()) return notifications();
  account.accountPart(accountHooks(), {});
}

// ---------------- The account ----------------
function accountHooks() {
  return {
    dots: leadDots,
    back: () => (Array.isArray(store.get().pillars) && memo.path === "new" ? pillars() : account.slide(welcome)),
    next: (r) => {
      memo.acct = r ? (r.created ? "new" : "back_in") : "without";
      // A new account made from "I already have an account": they still need pillars, so the deck fits them.
      // An account they already had brings its pillars back with the backup.
      if (!Array.isArray(store.get().pillars) && !(r && !r.created)) return pillars(notifications);
      notifications();
    },
  };
}

// ---------------- Notifications ----------------
// Everything starts on (alex 2026-11-26) and people switch off what they don't want. "Turn on" asks the iPhone once.
// Social is one switch for everything social (friend requests and friends' new moments), only with an account.
const bell = () => svg("30", [h("path", { d: "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" }), h("path", { d: "M10 20.5a2 2 0 0 0 4 0" })], "1.8");
function notifications() {
  const n = notify.prefs(), social = account.signedIn();
  const st = { am: n.am.on !== false, pm: n.pm.on !== false, card: n.card.on !== false, s: social ? friends.pingsOn() : false };
  const times = { am: n.am.t || "08:00", pm: n.pm.t || "21:00" };
  const sw = (key, label) => {
    const b = h("button.switch", { role: "switch", "aria-checked": String(st[key]), "aria-label": label });
    b.addEventListener("click", () => { st[key] = !st[key]; b.setAttribute("aria-checked", String(st[key])); draw(); });
    return b;
  };
  const time = (key, label) => {
    const t = h("input.time-pill", { type: "time", step: "300", value: times[key], "aria-label": `${label} time` });
    t.addEventListener("change", () => { if (t.value) times[key] = t.value; });
    return t;
  };
  const row = (label, ...right) => h("div.set-row.set-toggle", null, h("span.set-label", null, label), ...right);
  const amT = time("am", "Start your day"), pmT = time("pm", "End your day");
  const cardSw = sw("card", "Today's card");
  const draw = () => { amT.disabled = !st.am; pmT.disabled = !st.pm; cardSw.disabled = !st.am && !st.pm; };
  const line = () => h("div.set-line", { "aria-hidden": "true" });
  const nudges = h("div.set-group", null, h("p.set-head", null, "Nudges"),
    h("div.set-card", null, row("Start your day", amT, sw("am", "Start your day")), line(), row("End your day", pmT, sw("pm", "End your day")), line(), row("Today's card", cardSw)));
  const soc = social ? h("div.set-group", null, h("p.set-head", null, "Social"), h("div.set-card", null, row("Social", sw("s", "Social")))) : null;
  draw();
  const keep = () => {
    Object.assign(n.am, { on: st.am, t: times.am }); Object.assign(n.pm, { on: st.pm, t: times.pm }); n.card.on = st.card;
    store.save();
    if (social) friends.choosePings(st.s);
    memo.n = { a: +st.am, p: +st.pm, c: +st.card, s: social ? +st.s : -1, y: 0 };
  };
  const on = h("button.btn-main", { onclick: async () => {
    if (on.classList.contains("busy")) return;
    keep();
    on.classList.add("busy");
    // Asks the iPhone once. Never holds setup up: if the phone doesn't answer, carry on.
    const ok = notify.supported() && !notify.needsInstall() ? await Promise.race([notify.enable(), new Promise((r) => setTimeout(() => r(false), 8000))]) : false;
    on.classList.remove("busy");
    memo.n.y = ok ? 1 : 0;
    notify.sync();
    help();
  } }, "Turn on");
  const later = h("button.btn-quiet", { onclick: () => { keep(); memo.n.y = -1; notify.sync(); help(); } }, "Not now");
  account.slide(() => account.shell([
    h("span.setup-ico", null, bell()),
    h("h1.acct-title", null, "Notifications"),
    h("p.acct-text", null, "Pick what you'd like. Change them any time in Settings."),
    h("div.col.setup-list", null, nudges, soc),
    h("p.acct-note", null, social ? "Never what you wrote. Social covers friend requests and shares." : "Never what you wrote."),
  ], [on, later], { lead: leadDots(3), cls: ".setup-notify" }));
}

// ---------------- Help improve Daydeck ----------------
// The tester invite (alex 2026-11-26, wording A), moved here from after the second evening. Never for test accounts,
// phones already testing, or people who stopped. The full list stays one tap away.
function help() {
  if (!tester.inviteOK()) return finish();
  const item = (yes, text) => h("div.setup-tick", null, h("span" + (yes ? ".y" : ".n"), { "aria-hidden": "true" }, yes ? "✓" : "✕"), h("span", null, text));
  const list = h("div.setup-ticks", { role: "list" },
    [[1, "What you tap and choose"], [1, "Your check-in moods and sleep"], [0, "Anything you type"], [0, "Your photos"], [0, "Your name or email"]]
      .map(([y, t]) => { const el = item(y, t); el.setAttribute("role", "listitem"); el.setAttribute("aria-label", (y ? "Shared: " : "Never shared: ") + t); return el; }));
  account.slide(() => account.shell([
    h("h1.acct-title", null, "Help improve Daydeck"),
    h("p.acct-text", null, "Daydeck is still being tested. Share how you use it, so we can see what helps and what doesn't."),
    list,
    h("p.acct-note.setup-fine", null, "It's all kept under a random code, never linked to you or your account."),
    h("p.acct-note", null, h("button.acct-link.setup-more", { type: "button", onclick: openDetails }, "More details"), " · Turn it off any time in Settings."),
  ], [
    h("button.btn-main", { onclick: () => { tester.inviteSeen(); tester.join(); memo.share = 1; finish(); } }, "Share"),
    h("button.btn-quiet", { onclick: () => { tester.inviteSeen(); finish(); } }, "Don't share"),
  ], { lead: leadDots(4), cls: ".setup-help" }));
}

// ---------------- The end ----------------
function finish() {
  const s = store.get(); s.seen = s.seen || {}; s.seen.setup = 1; store.save();
  // Only reaches the service if they said yes to testing a moment ago: how setup went, as numbers and the app's own words.
  tester.log("setup", { hs: memo.hs, path: memo.path, acct: memo.acct || "none", n: memo.n, secs: Math.round((Date.now() - t0()) / 1000) });
  if (memo.picked) return account.slide(deckReady);
  done();
}
function done() { tester.log("setup_done", memo.picked ? "deck" : "back"); memo = null; account.closeLayer("done"); }

// ---------------- Your deck is ready ----------------
// The approved animation (alex 2026-11-26, v7 https://claude.ai/artifact/8vZAJBHT9k5jkZvfpx7im9): no card faces, so
// the first card stays a surprise. 18 backs are dealt one by one onto a messy pile, each landing at its own angle;
// once the last is down they square up, riffle (split in two and fall back in turns), then fan out as this week,
// Monday to Sunday. Then the light, the words and the button. Reduce motion shows the end.
const N = 18, FANN = 7;
function weekDays() {
  const k = dayKey(), d = keyDate(k).getDay(), mon = addDays(k, -((d + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => keyDate(addDays(mon, i)).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, ""));
}
const and = (list) => list.flatMap((v, i) => [h("strong", null, v), i < list.length - 2 ? ", " : i === list.length - 2 ? " and " : ""]);
function deckReady() {
  const s = store.get(), count = deck.deck().length, names = (s.pillars || []).map((p) => p.name);
  const days = weekDays(), today = new Date(now()).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, "");
  const stage = h("div.dr-stage", { "aria-hidden": "true" }), glow = h("div.dr-glow", { "aria-hidden": "true" });
  const cards = Array.from({ length: N }, (_, k) => {
    const j = k - (N - FANN);
    const c = h("div.dr-card", { style: { zIndex: String(k + 1) } }, h("span.dr-date", null, j >= 0 ? days[j] : today));
    stage.append(c); return c;
  });
  const text = h("div.dr-text", null, h("h1.acct-title", null, "Your deck is ready"),
    h("p.acct-text", null, `${count} cards for `, ...and(names), "."));
  const go = h("button.btn-main", { onclick: () => done() }, "Start your first day");
  const el = h("div.acct-screen.setup-deck", { role: "group", "aria-label": `Your deck is ready. ${count} cards for ${names.join(", ")}.` },
    h("div.dr-holder", null, glow, stage), text, h("div.acct-bottom", null, go));
  requestAnimationFrame(() => play(cards, glow, text, go));
  return el;
}
function play(cards, glow, text, go) {
  const ease = "cubic-bezier(.22,.8,.25,1)";
  const T = (x, y, r, s) => `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s})`;
  const anim = (el, frames, opts) => el.animate(frames.map((f) => ({ easing: ease, ...f })), { fill: "both", easing: "linear", ...opts });
  // Timeline in milliseconds, from when the screen has slid in.
  const BASE = 420, SQUARE = BASE + (N - 1) * 70 + 520, SPLIT = SQUARE + 450, FALL = SPLIT + 280, FAN = FALL + N * 38 + 450, D = FAN + 1000;
  const steps = (list) => list.map(([t, x, y, r, s]) => ({ offset: Math.min(1, t / D), transform: T(x, y, r, s) }));
  const reduce = reduceMotion();
  cards.forEach((c, k) => {
    const y = -k * 0.8, j = k - (N - FANN), a = ((-27 + j * 9) * Math.PI) / 180;
    const end = j >= 0 ? [D, Math.sin(a) * 210, (1 - Math.cos(a)) * 210 + 6, -27 + j * 9, 1] : [D, 0, 6 + y, 0, 1];
    if (reduce) { c.style.transform = T(...end.slice(1)); return; }
    // Dealt one after another, each from a slightly different angle, landing at its own angle (a messy pile).
    const t = BASE + k * 70, r0 = ((k * 37) % 11) - 5, land = r0 * 1.8, dx = r0 * 2;
    const left = k % 2 === 0, side = left ? -88 : 88, tilt = left ? -7 : 7, back = FALL + (N - 1 - k) * 38;
    const f = [[0, dx, 900, r0 * 3, 0.9], [t, dx, 900, r0 * 3, 0.9], [t + 420, dx, y, land, 0.9], [SQUARE, dx, y, land, 0.9], [SQUARE + 320, 0, y, 0, 0.9],
      [SPLIT, 0, y, 0, 0.9], [SPLIT + 240, side, y - 8, tilt, 0.9], [back, side, y - 8, tilt, 0.9], [back + 170, 0, y, 0, 0.9], [FAN, 0, y, 0, 0.9], end];
    f.sort((p, q) => p[0] - q[0]);
    anim(c, steps(f), { duration: D });
  });
  if (reduce) { [glow, text, go].forEach((el) => { el.style.opacity = "1"; el.style.transform = "none"; }); return; }
  anim(glow, [{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)" }], { duration: 1200, delay: FAN + 300 });
  anim(text, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 700, delay: FAN + 800 });
  anim(go, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 600, delay: FAN + 1300 });
}
