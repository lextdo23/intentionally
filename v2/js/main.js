// Daydeck (test build). Home: the greeting, a peek at your week, the sun, and one main button.
import { h, MOOD_COL, MOODS, moodWord, dayKey, keyDate, hoursWords, sleepMins, smoothPath, DAY_NAME, MONTH, LIFELINE } from "./util.js";
import { now, greeting, setOffsetDays } from "./clock.js";
import * as store from "./store.js";
import { morning, evening } from "./checkin.js";
import { openDraw, cardDue, homeCard } from "./draw.js";
import { openDays } from "./days.js";
import { moodSeries, mostlyWord } from "./stats.js";
import { makeSample } from "./sample.js";
import { openSheet, roundBtn, slideTo } from "./ui.js";
import * as notify from "./notify.js";
import { openSettings } from "./settings.js";
import * as tester from "./tester.js";
import { openTester } from "./tester-sheet.js";

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

function render() {
  const st = store.get(), k = dayKey(), today = st.days[k] || {}, t = new Date(now()), hr = t.getHours();
  const needAM = !today.sleep, needPM = today.mood == null;
  const dayN = st.started ? Math.round((keyDate(k) - keyDate(st.started)) / 864e5) + 1 : 1;
  const topLine = `${DAY_NAME[t.getDay()]} ${t.getDate()} ${MONTH[t.getMonth()]}` + (dayN <= 7 ? ` · Getting to know you, day ${dayN} of 7` : "");
  const notes = [];
  if (today.sleep) notes.push(h("p.home-note", null, `Slept ${hoursWords(sleepMins(today.sleep))}`));
  if (!needPM) notes.push(h("p.home-note", null, "Today felt ", h("span", { style: { color: MOOD_COL[today.mood], fontWeight: "600" } }, moodWord(today.mood))));
  if (!needAM && !needPM) notes.push(h("p.home-note", { style: { color: "#a9a59d" } }, "That's today. Rest well."));
  const go = (fn) => () => fn(() => render());
  let main = null, quiet = null;
  const due = !needAM && cardDue(k);
  if (needAM && needPM) { if (hr < 15) main = ["Start of your day", morning]; else { main = ["End your day", evening]; quiet = ["Add last night's sleep", morning]; } }
  else if (needAM) main = ["Start of your day", morning];
  else if (due && hr < 15) main = ["Draw today's card", openDraw];
  else if (needPM) { main = ["End your day", evening]; if (due) quiet = ["Draw today's card", openDraw]; }
  // Today's card floats where the sun is, until the day is done.
  const cid = needPM && !today.rest && today.card && today.card.id;
  if (cid) notes.unshift(homeCard(cid));
  else if (today.rest && needPM) notes.unshift(h("p.home-note", null, "A rest day, no card today."));
  const greet = h("h1.greet", null, greeting());
  let taps = 0, tapT = 0;
  greet.addEventListener("click", () => { const n = Date.now(); taps = n - tapT < 600 ? taps + 1 : 1; tapT = n; if (taps >= 5) { taps = 0; testOn = !testOn; st.test.on = testOn; store.save(); render(); } });
  home.replaceChildren(
    h("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" } },
      h("div.col", { style: { gap: "4px" } }, h("span.top-line", null, topLine), greet),
      roundBtn("settings", "Settings", () => openSettings(() => render()))),
    peek(),
    h("div.home-mid", null, notes),
    h("div.col", { style: { gap: "4px" } },
      quiet ? h("button.btn-quiet", { onclick: go(quiet[1]) }, quiet[0]) : null,
      main ? (main[1] === evening ? slideTo(main[0], go(evening)) : h("button.btn-main", { onclick: go(main[1]) }, main[0])) : h("button.btn-quiet", { onclick: changeToday }, "Change today"),
      LIFELINE()));
  testBar();
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

render();
notify.sync();
tester.opened();
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
