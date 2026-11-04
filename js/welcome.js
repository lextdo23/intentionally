// The first time the app opens. Its job: teach the loop the whole app is built on (see CLAUDE.md, "What this app is"),
// by doing it once with the person's own life:
//   Choose:    what's been missing lately becomes planets; two of them become the focus, either side of the sun.
//   Give time: two ways (a timer, or telling it afterwards), then "Given time to any of these today?" so the first
//              entry is real.
//   See:       tap the sun to see your week. The time they just gave is there.
//   Thoughts:  optional. A thought lands as a star by its likely planet, and a kind, believable line answers it.
//   Reflect:   the weekly look back and its day. Then a name, the not-therapy line, and home.
// Every step has a word to tap to go on; the sun works too. Nothing is saved until the end, so closing part way simply
// starts again next time.
import * as store from "./store.js";
import { now } from "./clock.js";
import { renderSky, startSpin, fitTags, layout, sparkle, placeStar, esc, POINTS, skyPoint, markTarget } from "./sky.js";
import { guessKind, KIND_LABEL } from "./thoughts.js";
import { heaviness, guessHome } from "./helps.js";
import { affirm } from "./affirm.js";
import { TINTS, FRONT, MIN_PILLARS, MAX_PILLARS, MAX_NAME } from "./pillars.js";

// Each step: how big your sun is (it grows a little as your sky fills) and how far your clouds have come in.
const STEPS = [
  { id: "dark", sun: 0, clouds: 0 },
  { id: "promise", sun: .35, clouds: 0 },
  { id: "you", sun: .6, clouds: .1 },
  { id: "pick", sun: .75, clouds: .2 },
  { id: "focus", sun: .85, clouds: .3 },
  { id: "time", sun: .9, clouds: .4 },
  { id: "see", sun: 1, clouds: .5 },
  { id: "thought", sun: 1, clouds: .6 },
  { id: "day", sun: 1, clouds: .7 },
  { id: "name", sun: 1, clouds: .85 },
  { id: "care", sun: 1, clouds: 1 },
];
const at = (id) => STEPS.findIndex((x) => x.id === id);
const DAYS = [["Sunday", "S"], ["Monday", "M"], ["Tuesday", "T"], ["Wednesday", "W"], ["Thursday", "T"], ["Friday", "F"], ["Saturday", "S"]];
const EXAMPLES = ["Exam on Friday and I'm not ready", "I want to see my friends more", "Glad I went outside today", "Behind on everything at work"];
// Rough lengths for time given: no stopwatch needed.
const ROUGH = [["A bit", 15], ["Half an hour", 30], ["An hour", 60], ["An evening", 180]];
const star = (kind) => `<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="${sparkle(POINTS[kind], 10)}"/></svg>`;
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// "Need help choosing?": five quick questions about moments and feelings, never the pillar names themselves, so people
// aren't asked to pick twice. The app works out the planets: this is values work (as in ACT), asking what matters and
// where time isn't going, since the gap between the two is what the pillars should be. Each answer quietly adds weight
// to a few planets; what they keep putting off counts most. Nothing is a test, and everything can be changed after.
const QUIZ = [
  { q: "Think of a good day lately. What was in it?", w: 2,
    a: [["A long talk with someone", ["Friends", "Family", "Love"]], ["Getting something hard done", ["Career", "Study"]],
        ["A proper sleep-in", ["Rest"]], ["Moving my body", ["Health"]], ["Making something", ["Creativity"]],
        ["Laughing with mates", ["Fun", "Friends"]]] },
  { q: "What do you keep putting off that you’d feel better for doing?", w: 4,
    a: [["Study or assignments", ["Study"]], ["Work, or my next step", ["Career"]], ["Exercise", ["Health"]], ["Calling family", ["Family"]],
        ["Seeing friends", ["Friends"]], ["Sorting out money", ["Money"]], ["Tidying my space", ["Home"]], ["Something creative", ["Creativity"]]] },
  { q: "What leaves you most drained at the end of a day?", one: true, w: 3,
    a: [["Work", ["Career", "Rest"]], ["Uni or study", ["Study", "Rest"]], ["Not sleeping enough", ["Rest", "Health"]], ["Feeling on my own", ["Friends"]],
        ["Money stress", ["Money"]], ["Looking after others", ["Caring", "Rest"]], ["Too much screen time", ["Rest", "Fun"]]] },
  { q: "A year from now you feel better. What changed first?", one: true, w: 3,
    a: [["I see my people more", ["Friends", "Family"]], ["Less stretched at work", ["Career", "Rest"]], ["On top of uni", ["Study"]],
        ["I look after my body", ["Health"]], ["Money stopped stressing me", ["Money"]], ["I make time for me", ["Rest", "Fun"]],
        ["I’m closer to what I believe", ["Faith", "Purpose"]]] },
  { q: "When an evening goes to waste, what do you wish you’d done?", one: true, w: 2,
    a: [["Seen someone", ["Friends"]], ["Called family", ["Family"]], ["Rested properly", ["Rest"]], ["Got moving", ["Health"]],
        ["Made something", ["Creativity"]], ["Got ahead on work or study", ["Career", "Study"]]] },
];
// The suggestion: the top four, the next few as swaps, and the two most put off (or drained by) as focus.
// Work and Study only stand when an answer names one of them on its own, so a student doesn't get Career.
function suggest(ans) {
  const score = {}, own = new Set();
  QUIZ.forEach((x, i) => ans[i].forEach((k) => {
    const names = x.a[k][1];
    if (names.includes("Career") !== names.includes("Study")) names.forEach((n) => own.add(n));
    names.forEach((n, j) => { score[n] = (score[n] ?? 0) + x.w - j * .1; });
  }));
  for (const n of ["Career", "Study"]) if (!own.has(n) && (own.has("Career") || own.has("Study"))) delete score[n];
  const ranked = Object.keys(score).sort((a, b) => score[b] - score[a]);
  for (const n of ["Rest", "Friends", "Health", "Family", "Fun"]) if (!ranked.includes(n)) ranked.push(n);
  const planets = ranked.slice(0, 4), swaps = ranked.slice(4, 8);
  const off = [...ans[1], ...ans[2].map((k) => k + 100)].flatMap((k) => k >= 100 ? QUIZ[2].a[k - 100][1] : QUIZ[1].a[k][1]);
  return { planets, swaps, focus: [...new Set([...off, ...planets])].filter((n) => planets.includes(n)).slice(0, 2) };
}

const fmt = (m) => m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} hr ${m % 60}` : `${m / 60} hr`;

let root = null, ui = null, go = null, hooks = {};
let step = 0, shown = -1, picked = [], focus = [], gave = { name: null, min: 0 }, thought = null, phase = "", name = "", day = 0, ownOpen = false, draft = "", ex = 0;
let quiz = null, hinted = [];
let timers = [], moving = 0, lastAt = {}, drawnPlanets = "";

// Called on every render while set-up isn't done. It only builds the screen once, so saving elsewhere never restarts it.
export function show(app, h) {
  hooks = h;
  if (root && app.contains(root)) return;
  const s = store.get();
  // Someone who picked planets on an older set-up keeps them and carries on from the look-back day.
  picked = s.pillars.map((p) => p.name);
  focus = s.pillars.filter((p) => p.focus).map((p) => p.name);
  step = picked.length ? at("day") : 0;
  gave = { name: null, min: 0 }; thought = null; phase = ""; name = s.name; day = s.lookDay ?? 0; ownOpen = false; draft = ""; quiz = null; hinted = []; shown = -1; lastAt = {}; drawnPlanets = "";
  app.innerHTML = `<section class="born" aria-label="Welcome">
    <div class="sky-wrap"><div class="b-clouds"></div><div class="b-sky"></div></div>
    <div class="b-ui"></div>
    <button type="button" class="b-go" aria-label="Go on"></button></section>`;
  root = app.querySelector(".born"); ui = root.querySelector(".b-ui"); go = root.querySelector(".b-go");
  go.addEventListener("click", (e) => { e.stopPropagation(); if (ready()) onSun(); });
  addEventListener("resize", placeGo);
  render();
  drawSky();
}

const ready = () => !!ui.querySelector("[data-ready]");
const pid = (n) => "w" + n.toLowerCase().replace(/[^a-z0-9]/g, "");
const myPillars = () => picked.map((n, i) => ({ id: pid(n), name: n, tint: TINTS[i], focus: focus.includes(n) }));
const id = () => STEPS[step].id;
const nameOf = (p) => myPillars().find((x) => x.id === p)?.name ?? "";

// Tapping the sun (or the word under it): usually "go on". On "see", the first tap opens your week.
function onSun() {
  if (id() === "see" && phase !== "open") { phase = "open"; render(); return; }
  next(step + 1);
}

/* ---------- Your sky ---------- */

// Planets that moved slide over from where they were; a new one grows in, then its name fades in letter by letter.
function drawSky({ born = null, arriving = null, from = null, words = true } = {}) {
  const pillars = myPillars();
  const where = layout(pillars), key = pillars.map((p) => p.id + p.focus).join(), changed = key !== drawnPlanets;
  const sky = root.querySelector(".b-sky");
  sky.innerHTML = renderSky({ pillars, thoughts: thought ? [thought] : [], arriving, from, labels: words && store.get().test.labels !== false });
  fitTags(sky);
  for (const p of pillars) {
    const g = sky.querySelector(`[data-orbit="${p.id}"]`);
    if (p.id === born) g.classList.add("b-new");
    else if (lastAt[p.id] && !still()) {
      g.style.transition = "none";
      g.style.translate = `${lastAt[p.id].x - where[p.id].x}px ${lastAt[p.id].y - where[p.id].y}px`;
      requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transition = ""; g.style.translate = "0px 0px"; }));
    }
  }
  lastAt = where; drawnPlanets = key;
  startSpin(sky);
  if (changed && born && !still()) {
    const rings = sky.querySelectorAll(".rings");
    rings.forEach((r) => r.classList.add("b-wait"));
    const k = pillars.findIndex((p) => p.id === born), per = pillars[k].name.replace(/ /g, "").length + 1;
    const letters = [...sky.querySelectorAll(`.ring[data-k="${k}"]`)].flatMap((g) => [...g.children].map((el, i) => [el.firstElementChild, i % per]));
    letters.forEach(([el]) => { el.style.opacity = 0; });
    setTimeout(() => {
      rings.forEach((r) => r.classList.remove("b-wait"));
      letters.forEach(([el, i]) => { el.style.transition = `opacity .6s ease ${i * 90}ms`; el.style.opacity = 1; });
    }, 1300);
  }
  sky.querySelectorAll("[data-planet]").forEach((h) => h.addEventListener("click", () => tapPlanet(h.dataset.planet)));
  if (id() === "focus") pillars.filter((p) => p.focus).forEach((p) => sky.querySelector(`[data-orbit="${p.id}"]`)?.classList.add("hot"));
  if (id() === "time" && gave.name) markTarget(pid(gave.name));
  placeGo();
}

function tapPlanet(p) {
  const n = nameOf(p);
  if (id() === "pick" && quiz && !quiz.pick) return;
  if (id() === "pick" && quiz?.pick && !quiz.pick.swaps.includes(n)) quiz.pick.swaps.unshift(n);
  if (id() === "pick") { picked = picked.filter((x) => x !== n); focus = focus.filter((x) => x !== n); render(); drawSky(); }
  else if (id() === "focus") toggleFocus(n);
  else if (id() === "time") { gave.name = n; render(); drawSky(); }
}

function toggleFocus(n) {
  if (focus.includes(n)) focus = focus.filter((x) => x !== n);
  else focus = [...focus, n].slice(-2);
  render(); drawSky();
}

// The tap target sits over the sun, wherever the sun lands on this screen.
function placeGo() {
  const p = skyPoint("sun");
  if (p && go) { go.style.left = `${p.x}px`; go.style.top = `${p.y}px`; root.style.setProperty("--sy", `${p.y}px`); }
  const low = skyPoint("below");
  if (low && root) root.style.setProperty("--below", `${low.y}px`);
}

/* ---------- Screens ---------- */

// The way on: a word to tap (the sun works too).
const onward = (words = "Go on", gold = false) => `<button type="button" class="b-next${gold ? " gold" : ""}" data-ready data-next>${words}</button>`;
const chip = (attr, label, on) => `<button type="button" class="b-chip" ${attr} aria-pressed="${!!on}">${esc(label)}</button>`;

// The quiz happens in the sky like the rest of set-up: no boxes. Answers rise up from below and float as words.
function quizScreen() {
  const x = `<button type="button" class="b-x" data-qstop aria-label="Close">×</button>`;
  const rise = quiz.fresh ? " b-pull" : ""; quiz.fresh = false;
  if (quiz.q < QUIZ.length) {
    const it = QUIZ[quiz.q], mine = quiz.ans[quiz.q], last = quiz.q === QUIZ.length - 1;
    // A quiet list: the sun moves up out of the way, the answers sit in plain rows with a tick on the right.
    return `${x}<div class="b-say b-top b-high b-qq"><div class="b-dots" aria-label="${quiz.q + 1} of ${QUIZ.length}">${QUIZ.map((_, i) => `<i class="${i <= quiz.q ? "on" : ""}"></i>`).join("")}</div>
        <h2>${it.q}</h2><p class="b-note">${it.one ? "Pick one." : "Pick any."}</p></div>
      <div class="b-list${rise}" role="group" aria-label="${it.q}">${it.a.map(([l], k) => `<button type="button" data-qa="${k}" aria-pressed="${mine.includes(k)}"><span>${esc(l)}</span><i aria-hidden="true"></i></button>`).join("")}</div>
      <div class="b-qfoot b-qbar">${quiz.q ? `<button type="button" class="b-quiet" data-qback>Back</button>` : `<span></span>`}
        ${mine.length ? `<button type="button" class="b-next" data-qnext>${last ? "See my sky" : "Next"}</button>` : `<button type="button" class="b-quiet" data-qnext>Skip</button>`}<span></span></div>`;
  }
  // The suggestion is the sky itself: the planets are already there. Tap one to take it out, or add another below.
  const r = quiz.pick, n = picked.length, left = r.swaps.filter((w) => !picked.includes(w));
  const f = focus.length === 2 ? `${esc(focus[0])} and ${esc(focus[1])} sit either side of you, as your focus. ` : "";
  return `${x}<div class="b-say b-top b-high"><h2>Here’s a sky that might fit.</h2><p>${f}</p><p class="b-note">Tap a planet to take it out.</p></div>
    <div class="b-say b-low b-below b-qa">
      ${left.length && n < MAX_PILLARS ? `<p class="b-or">Or add</p><div class="b-words">${left.map((w) => `<button type="button" data-qin="${esc(w)}">${esc(w)}</button>`).join("")}</div>` : ""}
      <div class="b-qfoot"><button type="button" class="b-quiet" data-qagain>Start again</button>
        ${n >= MIN_PILLARS ? `<button type="button" class="b-next gold" data-quse>Use these</button>` : `<span class="b-note">${MIN_PILLARS - n} more, at least.</span>`}<span></span></div>
    </div>`;
}

function screen(s) {
  switch (s) {
    case "dark": return "";
    case "promise": return `<div class="b-say b-top b-mid"><h2>Choose what matters.<br>Give it time.<br>See where your time really goes.</h2></div>
      <div class="b-say b-low"><p class="b-note">A calm, week-by-week practice. It starts simple, and more opens up as you go.</p>${onward("Begin", true)}</div>`;
    case "you": return `<div class="b-say b-under"><h2>This light is you.</h2><p>What matters to you will circle it.</p></div>
      <div class="b-say b-low">${onward()}</div>`;
    case "pick": {
      if (quiz) return quizScreen();
      const n = picked.length, left = FRONT.filter((w) => !picked.includes(w));
      const sub = hinted.length && n ? "From your answers. Change anything you like." : n === 0 ? "Pick three to five parts of life you want to look after." : n < MIN_PILLARS ? `${MIN_PILLARS - n} more, at least.` : n < MAX_PILLARS ? "You can add more, or go on." : "That’s five. The sky is full.";
      return `<div class="b-say b-top b-high"><h2>What’s been missing lately?</h2><p>Each one becomes a planet. Your time and your thoughts will gather around them.</p><p class="b-note">${sub}${n ? " Tap a planet to take it back." : ""}</p></div>
        <div class="b-say b-low b-below">
          ${n < MAX_PILLARS ? `<div class="b-words">${left.map((w) => `<button type="button" data-pick="${esc(w)}">${esc(w)}</button>`).join("")}</div>
          ${ownOpen ? `<form class="b-own" data-own><input id="b-own" maxlength="${MAX_NAME}" placeholder="Your own" autocomplete="off" aria-label="Your own"><button type="submit" class="b-quiet">Add</button></form>`
                    : `<button type="button" class="b-quiet" data-ownopen>Something else</button>`}` : ""}
          ${n === 0 ? `<button type="button" class="b-quiet" data-quiz>Need help choosing?</button>` : ""}
          ${n >= MIN_PILLARS ? onward() : ""}
        </div>`;
    }
    case "focus": return `<div class="b-say b-top"><h2>Which two need you most right now?</h2><p>Tap two planets. They’ll sit either side of you.</p><p class="b-note">${hinted.length && focus.length === 2 && focus.every((f) => hinted.includes(f)) ? "These two came from your answers. Tap to change." : "Your focus for now. You can change it any time."}</p></div>
      <div class="b-say b-low">${focus.length === 2 ? onward() : `<p class="b-note">${focus.length ? "One more." : ""}</p>`}</div>`;
    case "time": return `<div class="b-say b-top"><h2>Give time to what matters.</h2><p>Tap a planet when you start something, and it keeps time. Or tell it afterwards. Both count the same.</p></div>
      <div class="b-gave"><p class="b-gk">Given time to any of these today?</p>
        <div class="b-chips" role="group" aria-label="Which one">${picked.map((n) => chip(`data-gave="${esc(n)}"`, n, gave.name === n)).join("")}</div>
        ${gave.name ? `<div class="b-chips" role="group" aria-label="About how long">${ROUGH.map(([l, m]) => chip(`data-min="${m}"`, l, gave.min === m)).join("")}</div>` : ""}
      </div>
      <div class="b-say b-low">${gave.name && gave.min ? onward() : `<button type="button" class="b-quiet" data-skip>Not today</button>`}</div>`;
    case "see": {
      if (phase !== "open") return `<div class="b-say b-top"><h2>Tap the sun any time to see your week.</h2><p>Try it now.</p></div>
        <div class="b-say b-low">${onward("Show me")}</div>`;
      const rows = myPillars().map((p) => [p, p.name === gave.name ? gave.min : 0]), most = Math.max(60, ...rows.map(([, m]) => m));
      return `<div class="b-week" role="region" aria-label="Your week"><h2>Your week</h2>
        ${rows.map(([p, m]) => `<div class="b-wrow"><span>${esc(p.name)}</span><i style="--w:${m / most};--c:${p.tint}"></i><b>${m ? fmt(m) : ""}</b></div>`).join("")}
        <p class="b-note">${gave.min ? "There’s your time. No targets, just what happened." : "Nothing yet. It fills in as you give time. No targets, just what happened."}</p>
        ${onward()}</div>`;
    }
    case "thought": {
      if (phase === "flying") return "";
      // A thought that sounds heavy lands quietly: one calm line, and someone to talk to. It isn't asked anything.
      if (phase === "landed" && thought.heavy) return `<div class="b-say b-top"><p class="b-quote">“${esc(thought.text)}”</p><h2>Thank you for writing that down.</h2>
          <p>If it feels heavy right now, someone’s there to talk to, any time.</p></div>
          <div class="b-say b-low"><button type="button" class="b-quiet" data-support>Talk to someone</button>${onward()}</div>`;
      if (phase === "landed") {
        const where = thought.pillarId ? `It sits by ${esc(nameOf(thought.pillarId))}.` : "It floats free for now.";
        return `<div class="b-say b-top"><p class="b-aff">“${esc(thought.aff)}”</p><p class="b-note">${KIND_LABEL[thought.kind]}. ${where}</p></div>
          <div class="b-say b-low">${onward()}</div>`;
      }
      const k = draft.trim() ? guessKind(draft) : null;
      return `<form class="b-card" data-catch><label for="b-t">Anything on your mind?</label>
        <div class="b-row"><textarea id="b-t" rows="2" maxlength="120" placeholder="${esc(EXAMPLES[ex % EXAMPLES.length])}">${esc(draft)}</textarea>
        <button type="submit" class="b-send" aria-label="Add to the sky" ${draft.trim() ? "" : "disabled"}><i>${star("kind")}</i></button></div>
        <p class="b-guess">${k ? `${star(k)} ${KIND_LABEL[k]}` : ""}</p></form>
        <p class="b-why">When something’s on your mind, catch it as a star.</p>
        <div class="b-say b-low"><button type="button" class="b-quiet" data-none>Not now</button></div>`;
    }
    case "day": return `<div class="b-say b-top"><h2>Once a week, a quiet look back.</h2><p>Where your time went. What helped. One small thing for the week ahead.</p>
        <p class="b-note">It opens on your day and waits until you’re ready.</p></div>
      <div class="b-say b-low"><p class="b-note">Which day suits you?</p><div class="b-days" role="radiogroup" aria-label="Look back day">${DAYS.map(([d, l], i) =>
        `<button type="button" role="radio" aria-label="${d}" aria-checked="${i === day}" data-day="${i}">${l}</button>`).join("")}</div>
        <p class="b-note">${DAYS[day][0]}s. You can change it any time.</p>${onward()}</div>`;
    case "name": return `<div class="b-say b-top"><h2>What should your sky call you?</h2>
      <input class="b-name" id="b-name" maxlength="24" autocomplete="given-name" placeholder="Tap to write your name" value="${esc(name)}" aria-label="Your name"></div>
      <div class="b-say b-low">${onward()}</div>`;
    case "care": return `<div class="b-say b-top"><h2>One last thing.</h2><p>This isn’t therapy. If things ever feel heavy, someone’s there to talk to, any time. You’ll always find them in Record.</p></div>
      <div class="b-say b-low">${onward("Begin", true)}</div>`;
  }
}

function render() {
  timers.forEach(clearTimeout); timers = [];
  const s = STEPS[step];
  root.dataset.step = s.id;
  root.style.setProperty("--sun", s.sun);
  root.style.setProperty("--clouds", s.clouds);
  ui.classList.toggle("b-enter", shown !== step); shown = step;
  ui.innerHTML = screen(s.id);
  // While answering questions the sky slides up so the sun sits just under the question, and the list fills below.
  const asking = !!(quiz && !quiz.pick && s.id === "pick");
  if (asking) root.style.setProperty("--qsun", `${ui.querySelector(".b-qq").getBoundingClientRect().bottom + 48}px`);
  root.classList.toggle("b-quizzing", asking);
  go.classList.toggle("ready", ready());
  wire(s.id);
}

// Moving on: the words fade out, then the next ones fade in. The sky stays, and keeps changing slowly underneath.
function next(to) {
  if (to >= STEPS.length) return finish();
  timers.forEach(clearTimeout); timers = [];
  ui.classList.add("b-leaving");
  go.classList.remove("ready");
  markTarget(null);
  clearTimeout(moving);
  moving = setTimeout(() => {
    step = to; phase = "";
    // Help choosing also suggested a focus: those two start lit, and a tap changes them.
    if (id() === "focus" && !focus.length) focus = hinted.filter((x) => picked.includes(x)).slice(0, 2);
    ui.classList.remove("b-leaving");
    render();
    drawSky();
  }, still() ? 0 : 700);
}

function wire(s) {
  if (s === "dark") timers.push(setTimeout(() => next(1), still() ? 300 : 1600));
  ui.querySelectorAll("[data-next]").forEach((b) => b.addEventListener("click", onSun));
  ui.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => add(b.dataset.pick)));
  const startQuiz = () => { quiz = { q: 0, ans: QUIZ.map(() => []), pick: null, fresh: true }; picked = []; focus = []; render(); drawSky(); };
  ui.querySelector("[data-quiz]")?.addEventListener("click", startQuiz);
  ui.querySelector("[data-qagain]")?.addEventListener("click", startQuiz);
  // Closing keeps whatever planets are showing; the list is there to change them.
  ui.querySelector("[data-qstop]")?.addEventListener("click", () => { if (quiz.pick) hinted = [...focus]; focus = []; quiz = null; render(); drawSky(); });
  ui.querySelector("[data-qback]")?.addEventListener("click", () => { quiz.q--; render(); });
  ui.querySelectorAll("[data-qa]").forEach((b) => b.addEventListener("click", () => {
    const k = +b.dataset.qa, mine = quiz.ans[quiz.q];
    quiz.ans[quiz.q] = QUIZ[quiz.q].one ? (mine.includes(k) ? [] : [k]) : mine.includes(k) ? mine.filter((x) => x !== k) : [...mine, k];
    render();
  }));
  // The last answer: the suggested planets are born one after another, the focus two either side of the sun.
  ui.querySelector("[data-qnext]")?.addEventListener("click", () => {
    quiz.q++;
    if (quiz.q < QUIZ.length) { quiz.fresh = true; render(); return; }
    quiz.pick = suggest(quiz.ans); quiz.fresh = true;
    const { planets, focus: f } = quiz.pick;
    render();
    const bloom = (list) => {
      if (!quiz?.pick || id() !== "pick") return;
      if (!list.length) { focus = f.filter((x) => picked.includes(x)); render(); drawSky(); return; }
      add(list[0]); setTimeout(() => bloom(list.slice(1)), still() ? 0 : 600);
    };
    bloom(planets);
  });
  ui.querySelectorAll("[data-qin]").forEach((b) => b.addEventListener("click", () => add(b.dataset.qin)));
  // Yes: on to choosing focus, with the suggested two already lit.
  ui.querySelector("[data-quse]")?.addEventListener("click", () => { hinted = [...focus]; quiz = null; next(step + 1); });
  ui.querySelector("[data-ownopen]")?.addEventListener("click", () => { ownOpen = true; render(); ui.querySelector("#b-own")?.focus(); });
  ui.querySelector("[data-own]")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = ui.querySelector("#b-own").value.trim().slice(0, MAX_NAME);
    if (!v || picked.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    ownOpen = false; add(v);
  });
  ui.querySelectorAll("[data-gave]").forEach((b) => b.addEventListener("click", () => { gave.name = b.dataset.gave; render(); drawSky(); }));
  ui.querySelectorAll("[data-min]").forEach((b) => b.addEventListener("click", () => { gave.min = +b.dataset.min; render(); }));
  ui.querySelector("[data-skip]")?.addEventListener("click", () => { gave = { name: null, min: 0 }; next(step + 1); });
  const ta = ui.querySelector("#b-t");
  if (ta) {
    // Example thoughts drift through the empty space, one every few seconds.
    const drift = () => { if (!ta.value) { ex++; ta.placeholder = EXAMPLES[ex % EXAMPLES.length]; } timers.push(setTimeout(drift, 3200)); };
    timers.push(setTimeout(drift, 3200));
    ta.addEventListener("input", () => {
      draft = ta.value;
      const k = draft.trim() ? guessKind(draft) : null;
      ui.querySelector(".b-guess").innerHTML = k ? `${star(k)} ${KIND_LABEL[k]}` : "";
      ui.querySelector(".b-send").disabled = !draft.trim();
    });
    ui.querySelector("[data-catch]").addEventListener("submit", (e) => {
      e.preventDefault();
      const text = draft.trim();
      if (!text) return;
      ta.blur();
      const svg = root.querySelector("svg.sky"), b = ui.querySelector(".b-send").getBoundingClientRect();
      const p = new DOMPoint(b.left + b.width / 2, b.top + b.height / 2).matrixTransform(svg.getScreenCTM().inverse());
      const heavy = heaviness(text), kind = guessKind(text);
      thought = { id: store.uid(), text, kind, pillarId: null, status: "active", count: 1, seen: [now()], ...placeStar([]), createdAt: now(), helped: [], ...(heavy && { heavy }) };
      draft = ""; phase = "flying";
      ui.classList.add("b-leaving");
      // The star lands first. Then it drifts over to its likely planet, and its kind line fades in.
      drawSky({ arriving: still() ? null : thought.id, from: { x: p.x, y: p.y }, words: false });
      timers.push(setTimeout(() => {
        if (!heavy) {
          const home = guessHome(text, myPillars());
          if (home) { thought.pillarId = home; thought.sortedAt = now(); }
          thought.aff = affirm(text, kind, nameOf(home));
        }
        phase = "landed"; ui.classList.remove("b-leaving"); shown = -1; render(); drawSky();
      }, still() ? 0 : 2600));
    });
  }
  ui.querySelector("[data-none]")?.addEventListener("click", () => { thought = null; draft = ""; next(step + 1); });
  ui.querySelector("[data-support]")?.addEventListener("click", () => hooks.support?.());
  const nm = ui.querySelector("#b-name");
  nm?.addEventListener("input", () => { name = nm.value.trim(); });
  nm?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); nm.blur(); } });
  ui.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { day = +b.dataset.day; render(); }));
}

function add(n) {
  if (picked.length >= MAX_PILLARS || picked.includes(n)) return;
  picked.push(n);
  render(); drawSky({ born: pid(n) });
}

// Everything is kept in one go, then the home sky takes over: the greeting and the dock fade in.
function finish() {
  timers.forEach(clearTimeout); clearTimeout(moving);
  removeEventListener("resize", placeGo);
  ui.classList.add("b-leaving");
  go.classList.remove("ready");
  setTimeout(() => {
    root = null;
    hooks.done?.();
    let gaveId = null;
    store.update((s) => {
      const old = new Map(s.pillars.map((p) => [p.name, p]));
      s.pillars = picked.map((n, i) => ({ ...(old.get(n) ?? { id: store.uid(), name: n, tint: TINTS[i] }), focus: focus.includes(n) }));
      if (thought) {
        const { aff, ...t } = thought;
        // The planet ids used during set-up become the real ones.
        if (t.pillarId) t.pillarId = s.pillars.find((p) => pid(p.name) === t.pillarId)?.id ?? null;
        if (!t.pillarId) delete t.sortedAt;
        s.thoughts.push(t);
      }
      gaveId = gave.name && gave.min ? s.pillars.find((p) => p.name === gave.name)?.id : null;
      s.name = name.slice(0, 24); s.lookDay = day; s.setup = true; s.setupAt = now();
      s.hints = { sun: now(), ...(thought && { thought: now() }) };
    });
    if (gaveId) store.addTime(gaveId, gave.min, 0);
  }, still() ? 0 : 700);
}
