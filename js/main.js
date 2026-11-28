// Daydeck (test build). Home: the greeting, a peek at your week, the sun, and one main button.
import { h, CHART_COL as MOOD_COL, moodWord, dayKey, keyDate, smoothPath, DAY_NAME, MONTH, LIFELINE, reduceMotion, clock12 } from "./util.js";
import { now, greeting, setOffsetDays } from "./clock.js";
import * as store from "./store.js";
import { morning, evening } from "./checkin.js";
import { openDraw, cardDue, homeCard, askFelt, handOff, keepTime } from "./draw.js";
import { openDays } from "./days.js";
import { moodSeries, mostlyWord } from "./stats.js";
import { makeSample } from "./sample.js";
import { openSheet, roundBtn } from "./ui.js";
import * as deck from "./deck.js";
import * as notify from "./notify.js";
import * as tester from "./tester.js";
import { log } from "./tester.js";
import { openTester, askAgain } from "./tester-sheet.js";
import { goToSleep, notedTonight, moonIcon } from "./sleep.js";
import * as levels from "./levels.js";
import * as wrapped from "./wrapped.js";
import { openBox, waiting as boxesWaiting } from "./boxes.js";
import * as photos from "./photos.js";
import { openCamera } from "./camera.js";
import * as later from "./later.js";
import * as stack from "./stack.js";
import * as plans from "./plans.js";
import { openLevels, notYet, notYetLabel, ring } from "./path.js";
import * as levelup from "./levelup.js";
import * as tips from "./tips.js";
import * as library from "./library.js";
import * as account from "./account.js";
import * as sync from "./sync.js";
import * as pill from "./pill.js";
import * as friends from "./friends.js";
import * as moments from "./moments.js";
import * as photoBackup from "./photo-backup.js";
import * as crumbs from "./crumbs.js";
import * as notifCard from "./notif-card.js";
import { wordmark } from "./wordmark.js";
import * as setup from "./setup.js";

// Cards grow with the screen: 1 at 320 wide (the card mockups' width), 1.34 at 430 (alex's phone), never more.
const fitCards = () => document.documentElement.style.setProperty("--k", (Math.min(Math.max(innerWidth, 320), 430) / 320).toFixed(3));
fitCards(); addEventListener("resize", fitCards);

const s = store.load();
if (levels.startOver(s)) log("level_reset", levels.level().level);   // once: everyone back to level 1
levels.sixToStart(s);   // once: level 1 now takes 6 points; nobody already past it goes down
setOffsetDays(s.test.offset || 0);
let testOn = new URLSearchParams(location.search).has("test") || !!s.test.on;
const home = document.getElementById("home");

function peek() {
  const ser = moodSeries(store.get().days, "week"), pts = ser.pts.map((p, i) => (p.m == null ? null : [2 + i * 10, 18 - p.m * 2.66])).filter(Boolean);
  const top = mostlyWord(store.get().days, "week");
  const line = pts.length > 1 ? h("svg", { width: "84", height: "26", viewBox: "0 0 64 20", "aria-hidden": "true" },
    h("defs", null, h("linearGradient", { id: "sg", x1: "0", y1: "2", x2: "0", y2: "18", gradientUnits: "userSpaceOnUse" }, h("stop", { offset: "0", "stop-color": "#56b56c" }), h("stop", { offset: "0.5", "stop-color": "#bdae8e" }), h("stop", { offset: "1", "stop-color": "#4a4fa8" }))),
    h("path", { d: smoothPath(pts), fill: "none", stroke: "url(#sg)", "stroke-width": "2", "stroke-linecap": "round" })) : null;
  // Words on the left, the week's mood line on the right (alex 2026-11-23).
  const btn = h("button.peek", { "aria-label": "Open Your days" },
    top == null ? h("span.peek-words", null, "Your days") : h("span.peek-words", null, "Mostly ", h("span", { style: { color: MOOD_COL[top] } }, moodWord(top)), " this week"), line, h("span.chev", { "aria-hidden": "true" }, "›"));
  btn.addEventListener("click", () => openDays(btn, () => render()));
  return btn;
}

// Level (alex 2026-11-17): "Level 3" in gold and a gold bar under Your days. "Next pack at level 4" fades in once
// the bar is nearly full. While the card is being rated the row fades out (body.in-ask), and fades back after.
// The bar slides from where it was to where it is now; on a new level it fills, then starts again from empty.
// Showing the gain (alex 2026-11-17): while it slides, only the end of the bar brightens a little (no circle), and a
// small gold "+1" / "+2" (whatever the step gave) rises from the end of the bar and fades.
let lvShown = null, lvBack = false, lvHold = null, lvRelease = null;   // lvHold: the bar waits for the level-up moment to close
function levelRow(lvNew) {
  const L = levels.level(), pts = levels.total();
  let was = lvShown;
  if (lvNew && (!was || was.level >= L.level)) was = { level: L.level - 1, frac: 0.92, pts };   // a fresh open still ticks over
  lvShown = { level: L.level, frac: L.frac, pts };
  const fill = h("i"), bar = h("div.lv-bar", null, fill), track = h("div.lv-track", { "aria-hidden": "true" }, bar);
  const next = h("span.lv-next", null, `Next box at level ${L.level + 1}`);
  const num = h("span.lv-num", null, `Level ${(was && was.level < L.level ? was.level : L.level)}`);
  // Tapping the row opens Your levels, the path of what each level opens (alex 2026-11-18).
  const row = h("button.lv-row.lv-tap", { "aria-label": `Level ${L.level}. ${L.frac >= levels.NEAR ? `Next box at level ${L.level + 1}. ` : ""}Your levels`, onclick: () => openLevels(() => render()) }, num, track, next);
  if (lvBack) { row.classList.add("lv-back"); lvBack = false; }
  const set = (f, near) => { fill.style.width = `${Math.round(f * 1000) / 10}%`; next.classList.toggle("on", near); };
  const gain = was ? pts - was.pts : 0;
  const plus = (at) => {   // "+2" over the end of the bar, rising and fading
    if (gain <= 0) return;
    const p = h("span.lv-plus", { style: { left: `${Math.round(at * 1000) / 10}%` } }, `+${gain}`);
    track.append(p); setTimeout(() => p.remove(), 2600);
  };
  const glide = () => { fill.classList.add("moving"); clearTimeout(fill._t); fill._t = setTimeout(() => fill.classList.remove("moving"), 900); };
  if (!was || (was.level === L.level && was.frac === L.frac)) { set(L.frac, L.frac >= levels.NEAR); return row; }
  if (reduceMotion()) { set(L.frac, L.frac >= levels.NEAR); plus(L.frac); return row; }
  // Start from where it was, then slide (after the row has faded back in, if it was hidden for the rating).
  fill.style.transition = "none"; set(was.frac, was.level === L.level && was.frac >= levels.NEAR);
  const wait = row.classList.contains("lv-back") ? 700 : 150;
  const start = (go) => (lvHold ? lvHold.then(() => setTimeout(go, 150)) : setTimeout(go, wait));
  start(() => {
    fill.style.transition = ""; glide();
    if (was.level < L.level) {
      set(1, false); plus(1);
      setTimeout(() => { num.textContent = `Level ${L.level}`; num.classList.remove("lv-bump"); void num.offsetWidth; num.classList.add("lv-bump");
        if (navigator.vibrate) try { navigator.vibrate(12); } catch { /* not on iPhone */ }
        fill.style.transition = "none"; set(0, false);
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.transition = ""; if (L.frac > 0) glide(); set(L.frac, L.frac >= levels.NEAR); })); }, 1100);
    } else { set(L.frac, L.frac >= levels.NEAR); plus(L.frac); }
  });
  return row;
}

// A box earned and not opened yet (js/boxes.js): a quiet gold row under the level bar until it's opened.
// The level-up moment, once the splash has gone: the eclipse opens and, if the level opened something, its card
// is dealt (it takes the place of the pointing tip). Then the bar ticks over.
function levelUpMoment(lv) {
  const u = levels.opensAt(lv);
  if (u) tips.shown(u.id);
  const go = () => {
    if (document.body.classList.contains("booting")) return setTimeout(go, 200);
    levelup.show(lv, u, { text: u ? tips.tipText(u.id) : "", onOpen: (id) => tips.open(id),
      onDone: () => { const r = lvRelease; lvHold = null; lvRelease = null; r && r(); } });
  };
  setTimeout(go, 400);
}

// When Today is crowded (a level-up moment, boxes waiting and the recap line at once), the card shrinks just enough
// that nothing slides under the bottom pill (alex 2026-11-24). An ordinary day keeps the full-size card.
function fitCard() {
  const home = document.getElementById("home");
  home.style.removeProperty("--fit");
  const card = home.querySelector(".home-mid .home-card");
  if (!card) return;
  const floor = home.getBoundingClientRect().bottom - parseFloat(getComputedStyle(home).paddingBottom);
  // The space under the card hangs below the middle, so it may reach down to just above the pill.
  const slot = home.querySelector(".home-hold > .undo-slot"), pillEl = document.body.classList.contains("has-pill") && document.getElementById("pill");
  const slotFloor = pillEl ? pillEl.getBoundingClientRect().top - 8 : floor;
  const over = Math.max(Math.max(...[...home.children].map((x) => x.getBoundingClientRect().bottom)) - floor, slot ? slot.getBoundingClientRect().bottom - slotFloor : -1);
  if (over <= 1) return;
  const ch = card.getBoundingClientRect().height;
  if (ch) home.style.setProperty("--fit", Math.max(0.7, (ch - over - 8) / ch).toFixed(3));
}

function boxRow() {
  const n = boxesWaiting();
  if (!n) return "";
  return h("button.box-row", { onclick: () => openBox(() => render()) }, n > 1 ? `${n} new boxes are waiting` : "A new box is waiting", h("span.chev", { "aria-hidden": "true" }, "›"));
}

// After each step, home says so in place for a few seconds: the greeting turns gold with what's next, the card lifts
// and glows, then it all softens back. No separate screen, no confetti (alex 2026-11-15, "words in place").
const MOMENT = {
  // No words after the sleep check-in or keeping the card (alex 2026-11-27): the card moving says it, and nothing jumps later.
  sleep: null,
  card: null,
  rest: ["Rest day.", "No card today."],
  end: ["That's today.", null],
  photo: ["Photo added.", "It's in Your photos."],
};
// Once, quietly: take every extra part out of photos saved before they were cleaned (alex 2026-11-20).
setTimeout(() => photos.tidy(), 4000);

let momentT = 0, turnPh = false, slotStill = false;   // slotStill: what's under the card already faded in as it landed   // turnPh: the card was just done, so a photo on its back turns into view
// The one-time note about where photos live waits until home is quiet (not mid-rating, no other sheet open).
function noteWhenFree(tries = 0) {
  setTimeout(() => {
    const busy = ["in-ask", "in-flow", "in-wrap", "in-photos", "in-cards", "in-settings", "in-levels", "in-acct"].some((x) => document.body.classList.contains(x)) || document.querySelector(".sheet-host, .cam, .ph-viewer");
    if (busy && tries < 40) return noteWhenFree(tries + 1);
    if (!busy) photos.firstNote();
  }, tries ? 1500 : 3400);
}

// The sun's glow travels across the sky through the day: low on the left in the morning, high at midday, low on the right at night.
function placeSun(t, done) {
  const f = Math.min(1, Math.max(0, (t.getHours() + t.getMinutes() / 60 - 6) / 16)), sun = document.getElementById("sun");
  sun.style.setProperty("--sx", `${30 + 40 * f}%`);
  sun.style.setProperty("--sy", `${58 - 20 * Math.sin(Math.PI * f)}%`);
  document.body.classList.toggle("day-done", !!done);
}

// Accounts made before Friends went live for everyone (the people already using Daydeck) get it straight away
// (alex 2026-11-21). The service says so; once it has, it stays open on this phone.
function early() {
  const st = store.get(), u = account.user();
  if (u && u.early && !(st.levels || {}).early) { st.levels = st.levels || {}; st.levels.early = 1; store.save(); log("friends_early", 1); }
  if ((st.levels || {}).early) levels.openEarly(["friends"]);
  // alex's own test accounts (alex 2026-11-22): everything open, whatever the level (the service says which).
  if (u && u.test) levels.openEarly(levels.UNLOCKS.map((x) => x.id));
  // Sent back to level 1 by alex, with everything kept open (alex 2026-11-27).
  if (u && u.restart && levels.restart(u.restart)) log("level_restart", 1);
}

// What home would show, in short: the day, the greeting and which main button. Coming back to Daydeck only redraws
// home when this has changed (a new day, morning turned to afternoon), so otherwise it's just as it was left.
let look = "";
function lookNow() { const hr = new Date(now()).getHours(); return [dayKey(), greeting(), hr < 15, hr >= 17 || hr < 4].join("|"); }

// The week's peek (Your days opens at level 2) and, once Crumbs is on, its face button beside it (alex 2026-11-23).
// Crumbs isn't tied to a level: before the peek shows, the button sits in the same spot on its own. Once the day is
// ended it shows closed for tonight (alex 2026-11-25), and opens again with the new day.
function weekRow() {
  const pk = levels.isOpen("days") ? peek() : null, cb = crumbs.isOn() ? crumbs.button(() => render(), { closed: ((store.get().days[dayKey()] || {}).mood != null) }) : null;
  if (!cb) return pk || "";
  return h("div.peek-row", null, pk, cb);
}
// Crumbs is offered once, after an evening check-in, when home is quiet (same wait as the photos note).
function crumbsWhenFree(tries = 0) {
  setTimeout(() => {
    const busy = ["in-ask", "in-flow", "in-wrap", "in-photos", "in-cards", "in-settings", "in-levels", "in-acct"].some((x) => document.body.classList.contains(x)) || document.querySelector(".sheet-host, .cam, .ph-viewer, .tip-layer");
    if (busy && tries < 40) return crumbsWhenFree(tries + 1);
    if (!busy && crumbs.offerOK()) crumbs.offer(() => render());
  }, tries ? 1500 : 3400);
}

// A round button for something a level hasn't opened yet: the same spot, an empty dashed ring, and a tap says when.
function notYetBtn(kind, id) {
  const b = roundBtn(kind, notYetLabel(id), (e) => notYet(e.currentTarget, id));
  b.classList.add("not-yet"); b.append(ring(44));
  return b;
}

// ---------- Today's card moving through the morning (alex 2026-11-27, thread "Map the choppy morning flow") ----------
// Start your day: the card sinks into the glow at the bottom. Draw your card: it shrinks into the hand (js/draw.js).
// Back from the sleep check-in: it rises out of the glow. Done on the kept card: it's set down in its place (js/draw.js).
// Each one moves a copy of the card above everything while home fades, then hands back to the real card.
let todayL = null;   // today's card on home, when it's the one in front (not behind a stack of waiting cards)
const pinned = (L, r) => `;position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:40;pointer-events:none;--fit:${getComputedStyle(home).getPropertyValue("--fit") || 1}`;
function liftCopy() {
  const L = todayL; if (!L || !L.isConnected || reduceMotion()) return null;
  const r = L.getBoundingClientRect(), c = L.cloneNode(true);
  c.style.cssText += pinned(L, r);
  document.body.append(c); keepTime(L, c); L.style.visibility = "hidden";
  return { c, r };
}
// The softness as the card turns into light: a blurred copy of the card, blurred once and held still inside, that
// travels with it while the two cross-fade. Moving a blur that's already drawn is cheap on a phone; changing how
// blurred something is every frame is not.
function softPatch(f) {
  const p = f.c.cloneNode(true), src = [f.c, ...f.c.querySelectorAll("*")], dst = [p, ...p.querySelectorAll("*")];
  src.forEach((e, i) => { const cs = getComputedStyle(e); if (cs.animationName !== "none") { dst[i].style.animation = "none"; dst[i].style.transform = cs.transform === "none" ? "" : cs.transform; } });
  p.classList.add("card-soft"); p.style.zIndex = "39"; p.style.opacity = "0";
  document.body.append(p); return p;
}
const GLOW_PATH = (dy, k) => [{ transform: "none" }, { offset: .5, transform: `translateY(${dy * k}px) scale(1.05, .85)` }, { transform: `translateY(${dy}px) scale(2.4, .3)` }];
function sinkCard() {
  const f = liftCopy(); if (!f) return;
  const dy = innerHeight + 40 - (f.r.top + f.r.height / 2), p = softPatch(f), T = { duration: 950, easing: "cubic-bezier(.45,0,.3,1)", fill: "forwards" };
  document.body.classList.add("sinking");
  const path = GLOW_PATH(dy, .55);
  f.c.animate(path, T);
  f.c.animate([{ opacity: 1 }, { offset: .2, opacity: 1 }, { offset: .5, opacity: 0 }, { opacity: 0 }], { duration: 950, fill: "forwards" });
  const a = p.animate(path, T);
  p.animate([{ opacity: 0 }, { offset: .2, opacity: 0 }, { offset: .45, opacity: 1 }, { offset: .7, opacity: .35 }, { opacity: 0 }], { duration: 950, fill: "forwards" });
  a.onfinish = () => { f.c.remove(); p.remove(); document.body.classList.remove("sinking"); };
}
function flyCard() { handOff.fly = liftCopy(); }
function riseCard() {
  if (!todayL || reduceMotion()) return;
  document.body.classList.add("rising");
  requestAnimationFrame(() => {
    const f = liftCopy(); if (!f) return document.body.classList.remove("rising");
    const dy = innerHeight + 40 - (f.r.top + f.r.height / 2), p = softPatch(f), T = { duration: 1000, easing: "cubic-bezier(.3,0,.25,1)", fill: "forwards" };
    const path = GLOW_PATH(dy, .45).reverse();
    f.c.animate(path, T);
    f.c.animate([{ opacity: 0 }, { offset: .5, opacity: 0 }, { offset: .8, opacity: 1 }, { opacity: 1 }], { duration: 1000, fill: "forwards" });
    const a = p.animate(path, T);
    p.animate([{ opacity: 0 }, { offset: .25, opacity: .8 }, { offset: .55, opacity: 1 }, { offset: .8, opacity: 0 }, { opacity: 0 }], { duration: 1000, fill: "forwards" });
    a.onfinish = () => { todayL.style.visibility = ""; f.c.remove(); p.remove(); document.body.classList.remove("rising"); };
  });
}
// Done on the kept card: the very same card is set down in its place on home. It only moves (the two are the same
// size and sway in step); once it's down, its "I did it" and camera fade in.
function landCard() {
  const K = handOff.kept; handOff.kept = null; if (!K) return;
  const L = todayL, H = L && L.querySelector(".home-card");
  if (!H || reduceMotion()) { K.w.remove(); return; }
  document.body.classList.add("landing");
  const fr = H.querySelector(".foot-right"); if (fr) fr.style.opacity = "0";
  L.style.visibility = "hidden";
  requestAnimationFrame(() => {
    // measured in the same frame, so the sway is the same on both and the distance is exact
    const t = L.getBoundingClientRect(), k = K.c.getBoundingClientRect(), dx = t.left + t.width / 2 - (k.left + k.width / 2), dy = t.top + t.height / 2 - (k.top + k.height / 2);
    const a = K.w.animate([{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px)` }], { duration: 640, easing: "cubic-bezier(.3,.1,.2,1)", fill: "forwards" });
    a.onfinish = () => {
      L.style.visibility = ""; K.w.remove(); document.body.classList.remove("landing");
      if (fr) { fr.style.transition = "opacity .35s ease"; requestAnimationFrame(() => (fr.style.opacity = "1")); }
    };
  });
}

function render(moment) {
  early();
  wrapped.applyPlan();   // a rest day kept for this week arrives on its own
  const st = store.get(), k = dayKey(), today = st.days[k] || {}, t = new Date(now()), hr = t.getHours();
  const needAM = !today.sleep, ended = today.mood != null;
  const dayN = st.started ? Math.round((keyDate(k) - keyDate(st.started)) / 864e5) + 1 : 1;
  const topLine = `${DAY_NAME[t.getDay()]} ${t.getDate()} ${MONTH[t.getMonth()]}` + (dayN <= 7 ? ` · Day ${dayN} of your first week` : "");
  const go = (fn, m) => () => fn((saved) => render(saved ? m : null));
  const c = !today.rest && today.card && today.card.id ? today.card : null;
  const did = !!(c && (c.done || c.how >= 1));
  const canDraw = !needAM && !ended && cardDue(k);

  // One main button, always in the same place: Start your day, Draw your card, End your day, then Change today.
  // Start your day and Draw your card each start from the card itself too (alex 2026-11-27): tap the face-down card.
  const startDay = () => { sinkCard(); go(morning, "sleep")(); }, drawNow = () => { flyCard(); go(openDraw, "card")(); };
  let main;
  // Once the day is ended, in the evening the main button's last job is bedtime (alex 2026-11-16).
  const bedtime = ended && (hr >= 17 || hr < 4);
  if (bedtime) main = h("button.btn-main.with-ico", { onclick: () => goToSleep(() => render()) }, moonIcon(), h("span", null, "Going to sleep"));
  else if (ended) main = h("button.btn-main.soft", { onclick: changeToday }, "Change today");
  else if (needAM && hr < 15) main = h("button.btn-main", { onclick: startDay }, "Start your day");
  else if (canDraw && hr < 15) main = h("button.btn-main", { onclick: drawNow }, "Draw your card");
  else main = h("button.btn-main", { onclick: go(evening, "end") }, "End your day");

  // The line under the greeting says where the day is.
  let head = ended ? "That's today." : greeting(), line;
  const noted = notedTonight();
  if (ended && noted) line = `Sleep noted at ${clock12(Math.round((new Date(noted.at).getHours() * 60 + new Date(noted.at).getMinutes()) / 5) * 5 % 1440)}.`;
  else if (ended) line = today.rest ? "Nothing else to do." : c && !did ? "" : "A new card tomorrow morning."; // a skipped card already says "Back in the deck for another day"
  else if (needAM && hr < 15) line = "How did you sleep?";
  else if (today.rest) line = "No card today.";
  else if (!c) line = needAM ? "End your day whenever you're ready." : canDraw && hr < 15 ? "Next, your card." : canDraw ? "Tap the card to draw." : "End your day whenever you're ready.";
  else if (!did) line = dayN <= 7 ? "Done it? Tap “I did it” on your card." : "Do your card any time today.";
  else line = "Next, end your day tonight.";

  // Today's card sits where the sun is: face down until drawn, face up until done, then turned over with a tick.
  // "I did it" asks "How did doing it feel?" straight away, on home (alex 2026-11-17). Not now: tonight asks instead.
  const markDid = () => {
    const d = store.day(k), p = deck.card(c.id).pillar;
    d.card.done = true; d.pil = [p].concat((d.pil || []).filter((x) => x !== p)); store.save();
    log("card_did", deck.tid(c.id)); notify.sync();
    if (later.isWeek(c.id)) later.tick(k, k);   // a week card: today is its first day ticked (js/later.js)
    askFelt(card, c.id, { mid, hide: main,
      onPick: (list) => {
        const dd = store.day(k);
        if (list.length) {
          dd.card.felt = list; dd.card.how = deck.howFromFelt(list);
          deck.howWent(c.id, dd.card.how); deck.feltWent(c.id, list);
          log("card_how", { id: deck.tid(c.id), how: dd.card.how });
          log("card_felt", { id: deck.tid(c.id), f: list.map((w) => deck.FELT.indexOf(w)), home: 1 }); // positions only, never words
        } else log("card_felt_later", deck.tid(c.id));
        store.save();
        // No "Card's done." here (alex 2026-11-26): the tick and the card gliding home say it, and the words pushed the card.
      },
      // As the card lands (alex 2026-11-26): "Add a photo" and "Not done yet" fade in under it, in the space kept for
      // them, so the redraw that follows changes nothing you can see.
      onLand: () => { if (slotEl) slotEl.replaceChildren(...doneSlot()); },
      onEnd: () => { turnPh = true; slotStill = true; render(); if (later.isDate(c.id)) stack.whenSheet(k, () => render(), "home"); } });   // the level row is already back (it came back as the card landed); a set-a-date card then asks "When is it?"
  };
  const undo = () => {
    const d = store.day(k), p = deck.card(c.id).pillar;
    if (d.card.how != null) deck.unWent(c.id, d.card.how);
    if (later.isWeek(c.id)) later.untick(k, k);
    d.card.done = false; delete d.card.how; delete d.card.felt; d.pil = (d.pil || []).filter((x) => x !== p || deck.madePil(d).includes(x)); store.save();
    log("card_undo", deck.tid(c.id)); notify.sync(); render();
  };
  // A photo of the card (alex 2026-11-18): the camera on the card while doing it, "Add a photo" once it's done.
  // The photo becomes the back of the card, and the card turns over to it.
  const cam = () => openCamera(k, { onSaved: () => { const first = !(store.get().ph || {}).noted; render("photo"); if (first) noteWhenFree(); } });
  let card = null;
  const felt = c && c.felt || [];
  const ph = { photo: k, develop: moment === "photo", turn: turnPh }; turnPh = false;
  if (c) card = homeCard(c.id, ended ? { state: did ? "done" : "skip", felt, ...ph } : did ? { state: "done", flip: moment === "did", felt, ...ph } : { state: "up", onDid: markDid, onCam: cam, photo: k });
  else if (!today.rest && !ended && deck.dealable().length >= 3) card = homeCard(null, { state: "down", onTap: needAM && hr < 15 ? () => { log("card_tap_start", "am"); startDay(); } : canDraw ? () => { log("card_tap_start", "draw"); drawNow(); } : null });

  // A new level takes the moment: the greeting turns gold, "Level 4."
  const lvFirst = !store.get().levels || store.get().levels.seen == null, lvNew = levels.newLevel();
  if (lvFirst) log("level_start", levels.level().level);   // where they began (people from before levels start higher)
  if (lvNew) { log("level", lvNew); const u = levels.opensAt(lvNew); if (u && !(store.get().levels || {}).keepAll) log("unlock", u.id); }
  // A new level gets its own moment (js/levelup.js, alex 2026-11-24); the bar ticks over once it closes.
  if (lvNew) lvHold = new Promise((r) => (lvRelease = r));
  const mo = moment && MOMENT[moment === "card" && today.rest ? "rest" : moment];
  const greet = h("h1.greet", null, mo ? mo[0] : head);
  const sub = h("p.greet-line", null, mo && mo[1] ? mo[1] : line);
  let taps = 0, tapT = 0;
  const mark = h("div.dd-mark", null, wordmark(36));
  mark.addEventListener("click", () => { const n = Date.now(); taps = n - tapT < 600 ? taps + 1 : 1; tapT = n; if (taps >= 5) { taps = 0; testOn = !testOn; st.test.on = testOn; store.save(); render(); } });
  // No greeting or narration on Today (alex 2026-11-23): the card and the button say what's next. The words only show
  // for a moment ("Level 4.") and, in the first week, as a short hint.
  const hint = dayN <= 7 && !!line;
  const words = h(`div.col.greet-words${hint ? ".hint" : ""}`, { style: { gap: "4px" } }, h("span.top-line", null, topLine), greet, sub);
  // "Not done yet" sits quietly under a done card (it used to be inside the card, behind a tap). The space is kept
  // while the card is still to do, so the card doesn't jump when it appears.
  const offer = c && did && !ended && moment !== "did" && photos.offerOK(k);
  if (offer) photos.offered(k);
  const addPhoto = offer ? h("button.add-photo", { onclick: cam }, photos.camIcon(), "Add a photo") : null;
  // "Share with friends" (social step 3): quiet, under a done card or a rest day, once there's a friend to share with.
  // Never a pop-up; the photo offer goes first when both could show.
  const shareOK = (testOn || levels.isOpen("friends")) && friends.canShare() && (did || today.rest) && moments.canShareDay(k) && !addPhoto;
  const shareLink = shareOK ? h("button.add-photo.share-link", { onclick: () => moments.openShare({ day: k, item: today.rest ? "rest" : "card", from: "home" }) },
    friends.svg(18, [["path", { d: "M12 15V4M8 8l4-4 4 4" }], ["path", { d: "M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" }]]), "Share with friends") : null;
  // While the card is still to do, the space under it is kept at the size it will be once done ("Add a photo" or
  // "Share with friends" over "Not done yet"), so the card is sized once and never shrinks as it lands (alex 2026-11-26).
  const shareCould = (testOn || levels.isOpen("friends")) && friends.canShare() && moments.canShareDay(k);
  const two = c && !ended && (addPhoto || shareLink || (!did && (photos.offerOK(k) || shareCould)));
  const undoBtn = () => h("button.btn-text.undo", { onclick: undo }, "Not done yet");
  // What the slot holds once the card is done; used as it lands, then again by the redraw.
  function doneSlot() {
    const pOK = photos.offerOK(k);
    if (pOK) photos.offered(k);
    const first = pOK ? h("button.add-photo.fade-in", { onclick: cam }, photos.camIcon(), "Add a photo")
      : shareCould ? h("button.add-photo.share-link.fade-in", { onclick: () => moments.openShare({ day: k, item: "card", from: "home" }) },
        friends.svg(18, [["path", { d: "M12 15V4M8 8l4-4 4 4" }], ["path", { d: "M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" }]]), "Share with friends") : null;
    return [first, undoBtn()].filter(Boolean);
  }
  const still = slotStill; slotStill = false;
  // Once the day is ended, "Change today" sits in the same spot under the card (it used to sit below the middle and
  // pushed the card up).
  const changeBtn = bedtime ? h("button.btn-quiet", { onclick: changeToday }, "Change today") : null;
  const slotEl = c && !ended ? h(`div.undo-slot${two ? ".two" : ""}${still ? ".still" : ""}`, null, addPhoto || shareLink, did ? undoBtn() : null)
    : shareLink || changeBtn ? h(`div.undo-slot${shareLink && changeBtn ? ".two" : ""}`, null, shareLink, changeBtn) : null;
  // Cards that happen later wait in a stack behind today's card (js/stack.js, alex 2026-11-27); tapping one brings it
  // to the front. The space under the card ("Add a photo", "Not done yet") belongs to today's card only.
  const waiting = later.stack(k);
  const frontF = waiting.length ? stack.frontOf(waiting, k) : null;
  const area = waiting.length ? stack.stackEl({ items: waiting, today: card, todayCard: c, k, redraw: () => render(), hide: main }) : card;
  // The card sits in the same place in every state (alex 2026-11-28, "the card sits too high"): it's centred in the
  // middle on its own, and the space under it ("Add a photo", "Not done yet", "Change today") hangs below it without
  // pushing it up. Before, a card being done was lifted by the space kept under it, about 48 points higher than the
  // face-down card in the morning, so the card jumped up once drawn.
  const under = frontF === null && (card || changeBtn) ? slotEl : null;
  const mid = h("div.home-mid", null, h("div.home-hold", null, area, under));
  todayL = card && frontF === null ? card : null;
  // The glass pill, from day one (alex 2026-11-25): the main action sits in it and Settings lives on the You tab, so
  // home never rearranges when Friends opens at level 3. Until then Friends is an empty dashed ring in the pill.
  const friendsOpen = testOn || levels.isOpen("friends");
  pill.start(() => render()); pill.setFriends(friendsOpen); pill.setAction(main);
  // Today, top to bottom (alex 2026-11-23): the daydeck wordmark with Cards and Your photos in the corners, the level,
  // Your days with crumbs beside it, then the card in the middle. Lifeline stays in every check-in, draw, Your days and
  // Friends, so it is one step from here.
  // Cards (level 5) sits in its corner from day one too: an empty dashed ring until it opens.
  const cardsOpen = testOn || levels.isOpen("library");
  const left = cardsOpen ? roundBtn("cards", "Cards", () => library.openCards(() => render())) : notYetBtn("cards", "library");
  const right = h("div.dd-right", null, roundBtn("photos", "Your photos", () => photos.openPhotos(() => render())));
  home.replaceChildren(
    h("div.dd-head", null, left, mark, right),
    levelRow(lvNew),
    weekRow(),
    boxRow(),
    wrapped.homeLines(() => render()) || "",   // nothing to say: leave the space out (replaceChildren would print "null")
    words,
    mid,
    h("div.col", { style: { gap: "4px" } }));   // keeps the gap above the pill the card is centred against
  placeSun(t, ended);
  if (moment === "end" && crumbs.offerOK()) crumbsWhenFree();
  testBar();
  if (moment === "sleep") riseCard();   // back from the sleep check-in: the card rises out of the glow
  if (moment === "card") landCard();    // Done on the kept card: it's set down in its place
  look = lookNow();

  // A moment: the greeting turns gold with what just happened, then softens back to "head" and "after".
  function play(big, small, lift, after = line) {
    clearTimeout(momentT);
    greet.textContent = big; sub.textContent = small;
    words.classList.add("moment"); if (lift && card) card.classList.add("on");
    if (navigator.vibrate) try { navigator.vibrate(12); } catch {}
    momentT = setTimeout(() => {
      card && card.classList.remove("on");
      const swap = () => { words.classList.remove("moment"); greet.textContent = head; sub.textContent = after; };
      if (reduceMotion()) return swap();
      words.classList.add("fading"); setTimeout(() => { swap(); words.classList.remove("fading"); }, 400);
    }, 3600);
  }
  clearTimeout(momentT);
  if (mo) play(mo[0], mo[1] ? mo[1] : line, true);
  fitCard();   // after the moment's words are in, before anything is drawn
  if (lvNew) levelUpMoment(lvNew);
  tips.soon(mo ? 4200 : 1500);   // a new thing a level opened gets its tip once home is quiet (alex 2026-11-18)
}

function changeToday() {
  openSheet((panel, close) => {
    panel.append(h("h2", null, "Change today"),
      h("button.btn-soft", { style: { minHeight: "52px" }, onclick: () => { close(); setTimeout(() => morning(() => render()), 300); } }, "Last night's sleep"),
      h("button.btn-soft", { style: { minHeight: "52px" }, onclick: () => { close(); setTimeout(() => evening(() => render()), 300); } }, "How today felt"));
  }, { label: "Change today" });
}

const alertLine = () => { const g = document.querySelector(".greet-line"); if (g) g.textContent = "Nothing noted last week. Try Fill 2 months."; };
// Test mode (?test, or tap the greeting 5 times): fill made-up days, move a day forward, start again.
function testBar() {
  document.querySelector(".testbar")?.remove();
  if (!testOn) return;
  const st = store.get();
  let armed = false;
  const clear = h("button", { onclick: () => { if (!armed) { armed = true; clear.textContent = "Tap again to clear"; return; } store.reset({ keepTester: true }); setOffsetDays(0); render(); } }, "Start again");
  document.body.append(h("div.testbar", null,
    h("button", { onclick: () => { Object.assign(st.days, makeSample(60)); if (!st.started) st.started = Object.keys(st.days).sort()[0]; store.save(); render(); } }, "Fill 2 months"),
    h("button", { onclick: () => { if (!wrapped.testOpen(() => render())) alertLine(); } }, "Wrapped"),
    h("button", { onclick: () => { st.test.offset = (st.test.offset || 0) + 1; setOffsetDays(st.test.offset); store.save(); render(); } }, "+1 day"),
    clear,
    h("button", { onclick: () => account.openSignup(() => render(), { from: "test" }) }, "Sign up"),
    h("button", { onclick: () => { testOn = false; st.test.on = false; store.save(); render(); } }, "Hide")));
}

// A one-time note about what's new, for people who already use the app (alex 2026-11-16). New people never see it.
const NEW_NOTE = "sleep";
function whatsNew() {
  const st = store.get();
  if (document.body.classList.contains("in-flow") || document.querySelector(".sheet-host")) return;
  log("update_note", NEW_NOTE);
  openSheet((panel, close) => {
    panel.append(
      h("span", { style: { marginTop: "8px" } }, moonIcon("#e3c486", 28)),
      h("h2", null, "New: Going to sleep"),
      h("p.update-text", null, "After you end your day, tap Going to sleep. You can play a sound to fall asleep to."),
      h("p.update-text", null, "In the morning, your sleep check starts from that time, so there's less to fill in."),
      h("p.update-from", null, "From Alex"),
      h("button.btn-main", { onclick: () => close("done") }, "Got it"));
  }, { label: "What's new", onClose: () => { st.seen.note = NEW_NOTE; store.save(); } });
}
{ const st = store.get(); st.seen = st.seen || {}; if (!st.started && !st.seen.note) { st.seen.note = NEW_NOTE; store.save(); } }

render();
notify.sync();
tester.opened();
// The card library: only phones that have used it check in (cards shared while offline, and how shared cards are going).
if (store.get().lib) library.refresh();
library.finishUnshare();
// Asks the service about this account; if it's one of the early ones (Friends straight away), redraw now so the pill
// shows without waiting for the next time home redraws (alex 2026-11-21: "it's not showing").
const acctReady = account.refresh().then(() => { const u = account.user(); if (u && ((u.early && !(store.get().levels || {}).early) || (u.test && !levels.isOpen("months")) || (u.restart && (store.get().levels || {}).restart !== u.restart))) render(); }).catch(() => {});

// Opening Daydeck (alex 2026-11-21, "like other social apps"): a fresh open shows the logo on a blank sky (the splash
// in index.html) while home gets ready behind it, then the splash fades and home rises in. It stays at least a moment,
// so it never just flickers, and at most about 1.5 seconds, so a slow or missing connection never holds it up.
const splash = document.getElementById("splash");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const booted = Promise.all([wait(Math.max(0, (reduceMotion() ? 300 : 800) - performance.now())), Promise.race([acctReady, wait(1500)])])
  .then(() => { splash.classList.add("gone"); document.body.classList.remove("booting"); return wait(450); });
sync.start(() => render());
photoBackup.start(() => render());   // photos go up to the account's private store, and come back on a new phone   // backup and sync: changes go up quietly, and come in from the account's other phones
// Accounts (alex 2026-11-20): new people see the sign-up first; people already using the app see it once.
// A tester invite link goes first; the sign-up waits for the next open.
// Each waits until the splash has gone and home has settled, so nothing pops up while Daydeck is opening.
const askAccount = account.shouldAsk() && !new URLSearchParams(location.search).has("tester");
const viaLink = new URLSearchParams(location.search).has("tester");
// Waits for a clear screen (a level-up moment, a tip or another sheet goes first), then shows the invite once.
function inviteWhenFree(tries = 0) {
  const busy = ["in-ask", "in-flow", "in-wrap", "in-photos", "in-cards", "in-settings", "in-levels", "in-acct"].some((x) => document.body.classList.contains(x)) || document.querySelector(".sheet-host, .cam, .ph-viewer, .tip-layer, .lu");
  if (busy) { if (tries < 120) setTimeout(() => inviteWhenFree(tries + 1), 1000); return; }
  if (!tester.inviteDue()) return;
  tester.inviteSeen(); openTester(() => render());
}
if (tester.needsAsk()) booted.then(() => setTimeout(() => askAgain(() => render()), 300));
// New people (alex 2026-11-26): the whole first-time setup, from the welcome to "Your deck is ready" (js/setup.js).
else if (!viaLink && setup.due()) booted.then(() => setTimeout(() => setup.openSetup(() => render()), 200));
// The one-time "Help shape Daydeck" invite goes before anything else (alex 2026-11-25). The invite link opens it below.
else if (!viaLink && tester.inviteDue()) booted.then(() => setTimeout(inviteWhenFree, 300));
else if (askAccount) booted.then(() => setTimeout(() => account.openSignup(() => render()), 200));
else if (store.get().seen.note !== NEW_NOTE && !new URLSearchParams(location.search).has("tester")) booted.then(() => setTimeout(whatsNew, 300));
// Nothing else to ask this open: the one-time "Turn on notifications?" card, if it's due (alex 2026-11-26).
else if (!viaLink) booted.then(() => setTimeout(() => notifCard.whenFree(() => render()), 300));
// A friend's invite link (…/?add=…): kept until there's an account, then it waits in Friends as their request.
{ const add = new URLSearchParams(location.search).get("add");
  if (add) { friends.noteInvite(add); levels.openInvited(); history.replaceState(null, "", location.pathname); }   // Friends opens straight away (alex 2026-11-25)
  friends.useInvite().then((r) => { if (r && pill.friendsOn()) setTimeout(() => pill.go("friends"), 900); }); }
// A tester invite link (…/?tester) opens the tester sheet once, then tidies the address.
if (viaLink) { history.replaceState(null, "", location.pathname); booted.then(() => setTimeout(() => { tester.inviteSeen(); openTester(); }, 200)); }
// Monday's "Weekly recap ready" notification opens the recap itself (if it's still waiting), from a fresh open or
// when Daydeck was already open. Sunday's opens home as usual, so the person can end their day.
function openRecap() { const w = wrapped.readyWeek(); if (w) { log("wrap_from_nudge"); wrapped.openWrapped(w, () => render()); } }
if (new URLSearchParams(location.search).get("open") === "recap") {
  const u = new URL(location.href); u.searchParams.delete("open"); history.replaceState(null, "", u.pathname + u.search);
  booted.then(() => setTimeout(openRecap, 300));
}
// A friend notification ("Mia shared a moment") opens Friends and its bell page, fresh.
async function openFriendNews() {
  if (!pill.friendsOn()) return;
  log("friend_ping_open");
  pill.go("friends", true);
  await friends.load();
  friends.closeAll(); friends.openNotes();
}
if (new URLSearchParams(location.search).get("open") === "friends") {
  const u = new URL(location.href); u.searchParams.delete("open"); history.replaceState(null, "", u.pathname + u.search);
  booted.then(() => setTimeout(openFriendNews, 300));
}
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.recap) setTimeout(openRecap, 300); if (e.data && e.data.friends) setTimeout(openFriendNews, 300); });

// Coming back to Daydeck (alex 2026-11-21): it shows just as it was left, with no redraw and no reload. Home only
// redraws if what it shows has moved on (a new day, or morning turned to afternoon), and never mid-way through
// something. An update that arrived while Daydeck was open waits: it goes in the next time Daydeck is opened fresh,
// or when someone comes back after half an hour or more, behind the splash, so it looks like a fresh open.
// (Real time, not now(): test mode's time travel shouldn't decide how long someone was away.)
const AWAY_LONG = 30 * 60e3;
let awayAt = 0, updateWaiting = false, reloading = false;
// Shared dates (js/plans.js) came in fresh from the service: home redraws if it isn't in the middle of something.
plans.onChange(() => booted.then(() => { if (!busy()) render(); }));
const busy = () => ["in-flow", "in-ask", "in-wrap", "in-photos", "in-levels", "in-cards", "in-acct", "in-fpage", "in-settings"].some((x) => document.body.classList.contains(x)) || !!document.querySelector(".sheet-host, .cam, .ph-viewer");
function freshOpen() {
  if (reloading) return;
  reloading = true;
  splash.classList.add("now"); splash.classList.remove("gone");   // straight onto the splash, no fade
  location.reload();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") { awayAt = Date.now(); return; }
  notify.sync();   // notifications may have been switched back on in the phone's Settings (alex 2026-11-27)
  const wasLong = awayAt && Date.now() - awayAt >= AWAY_LONG;
  if (updateWaiting && wasLong && !busy()) return freshOpen();
  if (lookNow() !== look && !["in-flow", "in-ask", "in-wrap", "in-photos", "in-levels", "in-cards", "in-acct", "in-fpage"].some((x) => document.body.classList.contains(x))) render();
});

if ("serviceWorker" in navigator && location.protocol === "https:") {
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update(); });
  }).catch(() => {});
  // A fresh open already loads the newest files, so a new version taking over never needs a reload straight away.
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (had) updateWaiting = true; had = true; });
}
