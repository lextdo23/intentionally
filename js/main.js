// Daydeck (test build). Home: the greeting, a peek at your week, the sun, and one main button.
import { h, MOOD_COL, moodWord, dayKey, keyDate, smoothPath, DAY_NAME, MONTH, LIFELINE, reduceMotion, clock12 } from "./util.js";
import { now, greeting, setOffsetDays } from "./clock.js";
import * as store from "./store.js";
import { morning, evening } from "./checkin.js";
import { openDraw, cardDue, homeCard, askFelt } from "./draw.js";
import { openDays } from "./days.js";
import { moodSeries, mostlyWord } from "./stats.js";
import { makeSample } from "./sample.js";
import { openSheet, roundBtn } from "./ui.js";
import * as deck from "./deck.js";
import * as notify from "./notify.js";
import { openSettings } from "./settings.js";
import * as tester from "./tester.js";
import { log } from "./tester.js";
import { openTester, askAgain } from "./tester-sheet.js";
import { goToSleep, notedTonight, moonIcon } from "./sleep.js";
import * as levels from "./levels.js";
import * as wrapped from "./wrapped.js";
import { openBox, waiting as boxesWaiting } from "./boxes.js";
import * as photos from "./photos.js";
import { openCamera } from "./camera.js";
import { openLevels } from "./path.js";
import * as tips from "./tips.js";
import * as library from "./library.js";
import * as account from "./account.js";
import * as sync from "./sync.js";
import * as pill from "./pill.js";
import * as friends from "./friends.js";
import * as moments from "./moments.js";
import * as photoBackup from "./photo-backup.js";

// Cards grow with the screen: 1 at 320 wide (the card mockups' width), 1.34 at 430 (alex's phone), never more.
const fitCards = () => document.documentElement.style.setProperty("--k", (Math.min(Math.max(innerWidth, 320), 430) / 320).toFixed(3));
fitCards(); addEventListener("resize", fitCards);

const s = store.load();
if (levels.startOver(s)) log("level_reset", levels.level().level);   // once: everyone back to level 1
setOffsetDays(s.test.offset || 0);
let testOn = new URLSearchParams(location.search).has("test") || !!s.test.on;
const home = document.getElementById("home");

function peek() {
  const ser = moodSeries(store.get().days, "week"), pts = ser.pts.map((p, i) => (p.m == null ? null : [2 + i * 10, 18 - p.m * 2.66])).filter(Boolean);
  const top = mostlyWord(store.get().days, "week");
  const line = pts.length > 1 ? h("svg", { width: "64", height: "20", viewBox: "0 0 64 20", "aria-hidden": "true" },
    h("defs", null, h("linearGradient", { id: "sg", x1: "0", y1: "2", x2: "0", y2: "18", gradientUnits: "userSpaceOnUse" }, h("stop", { offset: "0", "stop-color": "#56b56c" }), h("stop", { offset: "0.5", "stop-color": "#bdae8e" }), h("stop", { offset: "1", "stop-color": "#4a4fa8" }))),
    h("path", { d: smoothPath(pts), fill: "none", stroke: "url(#sg)", "stroke-width": "2", "stroke-linecap": "round" })) : null;
  const btn = h("button.peek", { "aria-label": "Open Your days" }, line,
    top == null ? h("span", null, "Your days") : h("span", null, "Mostly ", h("span", { style: { color: MOOD_COL[top] } }, moodWord(top)), " this week"), h("span.chev", { "aria-hidden": "true" }, "›"));
  btn.addEventListener("click", () => openDays(btn, () => render()));
  return btn;
}

// Level (alex 2026-11-17): "Level 3" in gold and a gold bar under Your days. "Next pack at level 4" fades in once
// the bar is nearly full. While the card is being rated the row fades out (body.in-ask), and fades back after.
// The bar slides from where it was to where it is now; on a new level it fills, then starts again from empty.
// Showing the gain (alex 2026-11-17): while it slides, only the end of the bar brightens a little (no circle), and a
// small gold "+1" / "+2" (whatever the step gave) rises from the end of the bar and fades.
let lvShown = null, lvBack = false;
function levelRow() {
  const L = levels.level(), pts = levels.total(), was = lvShown;
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
  setTimeout(() => {
    fill.style.transition = ""; glide();
    if (was.level < L.level) {
      set(1, false); plus(1);
      setTimeout(() => { num.textContent = `Level ${L.level}`; fill.style.transition = "none"; set(0, false);
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.transition = ""; if (L.frac > 0) glide(); set(L.frac, L.frac >= levels.NEAR); })); }, 1100);
    } else { set(L.frac, L.frac >= levels.NEAR); plus(L.frac); }
  }, wait);
  return row;
}

// A box earned and not opened yet (js/boxes.js): a quiet gold row under the level bar until it's opened.
function boxRow() {
  const n = boxesWaiting();
  if (!n) return "";
  return h("button.box-row", { onclick: () => openBox(() => render()) }, n > 1 ? `${n} new boxes are waiting` : "A new box is waiting", h("span.chev", { "aria-hidden": "true" }, "›"));
}

// After each step, home says so in place for a few seconds: the greeting turns gold with what's next, the card lifts
// and glows, then it all softens back. No separate screen, no confetti (alex 2026-11-15, "words in place").
const MOMENT = {
  sleep: ["That's last night.", "Next, your card."],
  card: ["Your card for today.", "Do your card any time today."],
  rest: ["Rest day.", "No card today."],
  did: ["Card's done.", null],
  end: ["That's today.", null],
  photo: ["Photo added.", "It's in Your photos."],
};
// Once, quietly: take every extra part out of photos saved before they were cleaned (alex 2026-11-20).
setTimeout(() => photos.tidy(), 4000);

let momentT = 0, turnPh = false;   // turnPh: the card was just done, so a photo on its back turns into view
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
}

// What home would show, in short: the day, the greeting and which main button. Coming back to Daydeck only redraws
// home when this has changed (a new day, morning turned to afternoon), so otherwise it's just as it was left.
let look = "";
function lookNow() { const hr = new Date(now()).getHours(); return [dayKey(), greeting(), hr < 15, hr >= 17 || hr < 4].join("|"); }

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
  let main;
  // Once the day is ended, in the evening the main button's last job is bedtime (alex 2026-11-16).
  const bedtime = ended && (hr >= 17 || hr < 4);
  if (bedtime) main = h("button.btn-main.with-ico", { onclick: () => goToSleep(() => render()) }, moonIcon(), h("span", null, "Going to sleep"));
  else if (ended) main = h("button.btn-main.soft", { onclick: changeToday }, "Change today");
  else if (needAM && hr < 15) main = h("button.btn-main", { onclick: go(morning, "sleep") }, "Start your day");
  else if (canDraw && hr < 15) main = h("button.btn-main", { onclick: go(openDraw, "card") }, "Draw your card");
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
        play(MOMENT.did[0], "Next, end your day tonight.", false, "Next, end your day tonight.");
      },
      onEnd: () => { lvBack = true; turnPh = true; render(); } });
  };
  const undo = () => {
    const d = store.day(k), p = deck.card(c.id).pillar;
    if (d.card.how != null) deck.unWent(c.id, d.card.how);
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
  else if (!today.rest && !ended && deck.deck().length >= 3) card = homeCard(null, { state: "down", onTap: canDraw ? go(openDraw, "card") : null });

  // A new level takes the moment: the greeting turns gold, "Level 4.", the way it says "Card's done."
  const lvFirst = !store.get().levels || store.get().levels.seen == null, lvNew = levels.newLevel();
  if (lvFirst) log("level_start", levels.level().level);   // where they began (people from before levels start higher)
  if (lvNew) { log("level", lvNew); const u = levels.opensAt(lvNew); if (u && !(store.get().levels || {}).keepAll) log("unlock", u.id); }
  const mo = lvNew ? [`Level ${lvNew}.`, null] : moment && MOMENT[moment === "card" && today.rest ? "rest" : moment];
  const greet = h("h1.greet", null, mo ? mo[0] : head);
  const sub = h("p.greet-line", null, mo && mo[1] ? mo[1] : line);
  let taps = 0, tapT = 0;
  greet.addEventListener("click", () => { const n = Date.now(); taps = n - tapT < 600 ? taps + 1 : 1; tapT = n; if (taps >= 5) { taps = 0; testOn = !testOn; st.test.on = testOn; store.save(); render(); } });
  const words = h("div.col.greet-words", { style: { gap: "4px" } }, h("span.top-line", null, topLine), greet, sub);
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
  const mid = h("div.home-mid", null, card, c && !ended ? h("div.undo-slot", null, addPhoto || shareLink, did ? h("button.btn-text.undo", { onclick: undo }, "Not done yet") : null) : shareLink ? h("div.undo-slot", null, shareLink) : null);
  // The glass pill (social stage 1): once Friends opens at level 4 (or in test mode), the main action moves into it,
  // and Settings moves to the You tab. Until then Daydeck looks as it always has.
  const usePill = testOn || levels.isOpen("friends");
  if (usePill) { pill.start(() => render()); pill.setAction(main); } else pill.stop();
  home.replaceChildren(
    h("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" } },
      words, h("div", { style: { display: "flex", gap: "8px" } },
        // The card library opens at level 5 (thread "Finalise levels and what they unlock"; moved from 4 for Friends).
        !levels.isOpen || levels.isOpen("library") ? roundBtn("cards", "Cards", () => library.openCards(() => render())) : null,
        roundBtn("photos", "Your photos", () => photos.openPhotos(() => render())),
        usePill ? null : roundBtn("settings", "Settings", () => openSettings(() => render())))),
    levels.isOpen("days") ? peek() : "",   // Your days opens at level 2
    levelRow(),
    boxRow(),
    wrapped.homeLines(() => render()) || "",   // nothing to say: leave the space out (replaceChildren would print "null")
    mid,
    h("div.col", { style: { gap: "4px" } }, usePill ? null : main, bedtime ? h("button.btn-quiet", { onclick: changeToday }, "Change today") : null, LIFELINE()));
  placeSun(t, ended);
  testBar();
  look = lookNow();

  // A moment: the greeting turns gold with what just happened, then softens back to "head" and "after".
  function play(big, small, lift, after = line) {
    clearTimeout(momentT);
    greet.textContent = big; sub.textContent = small;
    words.classList.add("moment"); if (lift && card) card.classList.add("on");
    if (navigator.vibrate) try { navigator.vibrate(12); } catch {}
    momentT = setTimeout(() => {
      words.classList.remove("moment"); card && card.classList.remove("on");
      if (greet.textContent !== head || sub.textContent !== after) {
        const swap = () => { greet.textContent = head; sub.textContent = after; };
        if (reduceMotion()) return swap();
        words.classList.add("fading"); setTimeout(() => { swap(); words.classList.remove("fading"); }, 400);
      }
    }, 3600);
  }
  clearTimeout(momentT);
  if (mo) play(mo[0], mo[1] ? mo[1] : line, true);
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
  const clear = h("button", { onclick: () => { if (!armed) { armed = true; clear.textContent = "Tap again to clear"; return; } store.reset(); setOffsetDays(0); render(); } }, "Start again");
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
const acctReady = account.refresh().then(() => { const u = account.user(); if (u && u.early && !(store.get().levels || {}).early) render(); }).catch(() => {});

// Opening Daydeck (alex 2026-11-21, "like other social apps"): a fresh open shows the sun on a blank sky (the splash
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
if (tester.needsAsk()) booted.then(() => setTimeout(() => askAgain(() => render()), 300));
else if (askAccount) booted.then(() => setTimeout(() => account.openSignup(() => render()), 200));
else if (store.get().seen.note !== NEW_NOTE && !new URLSearchParams(location.search).has("tester")) booted.then(() => setTimeout(whatsNew, 300));
// A friend's invite link (…/?add=…): kept until there's an account, then it waits in Friends as their request.
{ const add = new URLSearchParams(location.search).get("add");
  if (add) { friends.noteInvite(add); history.replaceState(null, "", location.pathname); }
  friends.useInvite().then((r) => { if (r && pill.on()) setTimeout(() => pill.go("friends"), 900); }); }
// A tester invite link (…/?tester) opens the tester sheet once, then tidies the address.
if (new URLSearchParams(location.search).has("tester")) { history.replaceState(null, "", location.pathname); booted.then(() => setTimeout(openTester, 200)); }

// Coming back to Daydeck (alex 2026-11-21): it shows just as it was left, with no redraw and no reload. Home only
// redraws if what it shows has moved on (a new day, or morning turned to afternoon), and never mid-way through
// something. An update that arrived while Daydeck was open waits: it goes in the next time Daydeck is opened fresh,
// or when someone comes back after half an hour or more, behind the splash, so it looks like a fresh open.
// (Real time, not now(): test mode's time travel shouldn't decide how long someone was away.)
const AWAY_LONG = 30 * 60e3;
let awayAt = 0, updateWaiting = false, reloading = false;
const busy = () => ["in-flow", "in-ask", "in-wrap", "in-photos", "in-levels", "in-cards", "in-acct", "in-fpage", "in-settings"].some((x) => document.body.classList.contains(x)) || !!document.querySelector(".sheet-host, .cam, .ph-viewer");
function freshOpen() {
  if (reloading) return;
  reloading = true;
  splash.classList.add("now"); splash.classList.remove("gone");   // straight onto the splash, no fade
  location.reload();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") { awayAt = Date.now(); return; }
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
