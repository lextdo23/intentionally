// Daydeck (test build). Home: the greeting, a peek at your week, the sun, and one main button.
import { h, MOOD_COL, moodWord, dayKey, keyDate, smoothPath, DAY_NAME, MONTH, LIFELINE, reduceMotion, clock12 } from "./util.js";
import { now, greeting, setOffsetDays } from "./clock.js";
import * as store from "./store.js";
import { morning, evening } from "./checkin.js";
import { openDraw, cardDue, homeCard } from "./draw.js";
import { openDays } from "./days.js";
import { moodSeries, mostlyWord } from "./stats.js";
import { makeSample } from "./sample.js";
import { openSheet, roundBtn } from "./ui.js";
import * as deck from "./deck.js";
import * as notify from "./notify.js";
import { openSettings } from "./settings.js";
import * as tester from "./tester.js";
import { log } from "./tester.js";
import { openTester } from "./tester-sheet.js";
import { goToSleep, notedTonight, moonIcon } from "./sleep.js";

// Cards grow with the screen: 1 at 320 wide (the card mockups' width), 1.34 at 430 (alex's phone), never more.
const fitCards = () => document.documentElement.style.setProperty("--k", (Math.min(Math.max(innerWidth, 320), 430) / 320).toFixed(3));
fitCards(); addEventListener("resize", fitCards);

const s = store.load();
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

// After each step, home says so in place for a few seconds: the greeting turns gold with what's next, the card lifts
// and glows, then it all softens back. No separate screen, no confetti (alex 2026-11-15, "words in place").
const MOMENT = {
  sleep: ["That's last night.", "Next, your card."],
  card: ["Your card for today.", "Do your card any time today."],
  rest: ["Rest day.", "No card today."],
  did: ["Card's done.", null],
  end: ["That's today.", null],
};
let momentT = 0;

// The sun's glow travels across the sky through the day: low on the left in the morning, high at midday, low on the right at night.
function placeSun(t, done) {
  const f = Math.min(1, Math.max(0, (t.getHours() + t.getMinutes() / 60 - 6) / 16)), sun = document.getElementById("sun");
  sun.style.setProperty("--sx", `${30 + 40 * f}%`);
  sun.style.setProperty("--sy", `${58 - 20 * Math.sin(Math.PI * f)}%`);
  document.body.classList.toggle("day-done", !!done);
}

function render(moment) {
  const st = store.get(), k = dayKey(), today = st.days[k] || {}, t = new Date(now()), hr = t.getHours();
  const needAM = !today.sleep, ended = today.mood != null;
  const dayN = st.started ? Math.round((keyDate(k) - keyDate(st.started)) / 864e5) + 1 : 1;
  const topLine = `${DAY_NAME[t.getDay()]} ${t.getDate()} ${MONTH[t.getMonth()]}` + (dayN <= 7 ? ` · Day ${dayN} of 7` : "");
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
  const markDid = () => {
    const d = store.day(k), p = deck.card(c.id).pillar;
    d.card.done = true; d.pil = [p].concat((d.pil || []).filter((x) => x !== p)); store.save();
    log("card_did", c.id); render("did");
  };
  const undo = () => {
    const d = store.day(k), p = deck.card(c.id).pillar;
    d.card.done = false; d.pil = (d.pil || []).filter((x) => x !== p); store.save();
    log("card_undo", c.id); render();
  };
  let card = null;
  if (c) card = homeCard(c.id, ended ? { state: did ? "done" : "skip" } : did ? { state: "done", flip: moment === "did", onUndo: ended ? null : undo } : { state: "up", onDid: markDid });
  else if (!today.rest && !ended && deck.deck().length >= 3) card = homeCard(null, { state: "down", onTap: canDraw ? go(openDraw, "card") : null });

  const mo = moment && MOMENT[moment === "card" && today.rest ? "rest" : moment];
  const greet = h("h1.greet", null, mo ? mo[0] : head);
  const sub = h("p.greet-line", null, mo && mo[1] ? mo[1] : line);
  let taps = 0, tapT = 0;
  greet.addEventListener("click", () => { const n = Date.now(); taps = n - tapT < 600 ? taps + 1 : 1; tapT = n; if (taps >= 5) { taps = 0; testOn = !testOn; st.test.on = testOn; store.save(); render(); } });
  const words = h("div.col.greet-words", { style: { gap: "4px" } }, h("span.top-line", null, topLine), greet, sub);
  home.replaceChildren(
    h("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" } },
      words, roundBtn("settings", "Settings", () => openSettings(() => render()))),
    peek(),
    h("div.home-mid", null, card),
    h("div.col", { style: { gap: "4px" } }, main, bedtime ? h("button.btn-quiet", { onclick: changeToday }, "Change today") : null, LIFELINE()));
  placeSun(t, ended);
  testBar();

  clearTimeout(momentT);
  if (mo) {
    words.classList.add("moment"); card && card.classList.add("on");
    if (navigator.vibrate) try { navigator.vibrate(12); } catch {}
    momentT = setTimeout(() => {
      words.classList.remove("moment"); card && card.classList.remove("on");
      if (greet.textContent !== head || sub.textContent !== line) {
        const swap = () => { greet.textContent = head; sub.textContent = line; };
        if (reduceMotion()) return swap();
        words.classList.add("fading"); setTimeout(() => { swap(); words.classList.remove("fading"); }, 400);
      }
    }, 3600);
  }
}

function changeToday() {
  openSheet((panel, close) => {
    panel.append(h("h2", null, "Change today"),
      h("button.btn-soft", { style: { minHeight: "52px" }, onclick: () => { close(); setTimeout(() => morning(() => render()), 300); } }, "Last night's sleep"),
      h("button.btn-soft", { style: { minHeight: "52px" }, onclick: () => { close(); setTimeout(() => evening(() => render()), 300); } }, "How today felt"));
  }, { label: "Change today" });
}

// Test mode (?test, or tap the greeting 5 times): fill made-up days, move a day forward, start again.
function testBar() {
  document.querySelector(".testbar")?.remove();
  if (!testOn) return;
  const st = store.get();
  let armed = false;
  const clear = h("button", { onclick: () => { if (!armed) { armed = true; clear.textContent = "Tap again to clear"; return; } store.reset(); setOffsetDays(0); render(); } }, "Start again");
  document.body.append(h("div.testbar", null,
    h("button", { onclick: () => { Object.assign(st.days, makeSample(60)); if (!st.started) st.started = Object.keys(st.days).sort()[0]; store.save(); render(); } }, "Fill 2 months"),
    h("button", { onclick: () => { st.test.offset = (st.test.offset || 0) + 1; setOffsetDays(st.test.offset); store.save(); render(); } }, "+1 day"),
    clear,
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
if (store.get().seen.note !== NEW_NOTE && !new URLSearchParams(location.search).has("tester")) setTimeout(whatsNew, 700);
// A tester invite link (…/v2/?tester) opens the tester sheet once, then tidies the address.
if (new URLSearchParams(location.search).has("tester")) { history.replaceState(null, "", location.pathname); setTimeout(openTester, 400); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !document.body.classList.contains("in-flow")) render(); });

if ("serviceWorker" in navigator && location.protocol === "https:") {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update(); });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (had && !reloaded && !document.body.classList.contains("in-flow") && !document.querySelector(".sheet-host")) { reloaded = true; location.reload(); }
  });
}
