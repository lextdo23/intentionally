// The first time the app opens. It says what the app is for first, then shows it: an example sky where thoughts
// appear as stars, a planet glows as time is given to it, and the week gathers round the sun. Then your own sky is
// made: what you look after becomes planets (with a practice tap), your first thought becomes a star, and you choose
// your name and look-back day. Every question says why it's asked. You go on by tapping the sun, the same tap that
// shows your week on the home sky. Nothing is saved until the end, so closing part way simply starts again next time.
import * as store from "./store.js";
import { now } from "./clock.js";
import { renderSky, startSpin, fitTags, layout, sparkle, placeStar, esc, POINTS, skyPoint } from "./sky.js";
import { guessKind, KIND_LABEL } from "./thoughts.js";
import { heaviness } from "./helps.js";
import { TINTS, SUGGESTED, MIN_PILLARS, MAX_PILLARS, MAX_NAME } from "./pillars.js";

// Each step: how big the sun is (it grows a little as the sky fills) and how far the clouds have come in.
const STEPS = [
  { id: "dark", sun: 0, clouds: 0 },
  { id: "promise", sun: .35, clouds: 0 },
  { id: "example", sun: .8, clouds: .35 },
  { id: "you", sun: .6, clouds: .1 },
  { id: "pick", sun: .8, clouds: .2 },
  { id: "try", sun: .85, clouds: .3 },
  { id: "thought", sun: 1, clouds: .4 },
  { id: "name", sun: 1, clouds: .6 },
  { id: "day", sun: 1, clouds: .8 },
  { id: "care", sun: 1, clouds: 1 },
];
const at = (id) => STEPS.findIndex((x) => x.id === id);
const DAYS = [["Sunday", "S"], ["Monday", "M"], ["Tuesday", "T"], ["Wednesday", "W"], ["Thursday", "T"], ["Friday", "F"], ["Saturday", "S"]];
const EXAMPLES = ["I'm behind on everything", "I want to call Mum this week", "Glad I went outside today", "What if I'm not good enough"];
const A_KIND = { kind: "a kind thought", worry: "a worry", want: "a want" };
// The three things you do here, shown one at a time over the example sky.
const LINES = ["Notice what’s on your mind", "Give time to what matters", "Look back once a week"];
// The example sky: four planets and a handful of stars, never saved.
const EX_PILLARS = ["Friends", "Health", "Work", "Rest"].map((name, i) => ({ id: "ex" + i, name, tint: TINTS[i], focus: false }));
const EX_STARS = [["worry", .18, .27], ["kind", .78, .25], ["want", .3, .6], ["worry", .84, .58], ["kind", .58, .3]];
const star = (kind) => `<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="${sparkle(POINTS[kind], 10)}"/></svg>`;
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

let root = null, ui = null, go = null, hooks = {};
let step = 0, shown = -1, picked = [], thought = null, flying = false, name = "", day = 0, ownOpen = false, draft = "", ex = 0;
let tried = null, example = { stars: 0, line: -1, glow: null, gather: null };
let timers = [], moving = 0, lastAt = {}, drawnPlanets = "";

// Called on every render while set-up isn't done. It only builds the screen once, so saving elsewhere never restarts it.
export function show(app, h) {
  hooks = h;
  if (root && app.contains(root)) return;
  const s = store.get();
  // Someone who picked planets on an older set-up keeps them and carries on from their name.
  picked = s.pillars.map((p) => p.name);
  step = picked.length ? at("name") : 0;
  thought = null; flying = false; name = s.name; day = s.lookDay ?? 0; ownOpen = false; draft = ""; shown = -1; lastAt = {}; drawnPlanets = "";
  tried = null; example = { stars: 0, line: -1, glow: null, gather: null };
  app.innerHTML = `<section class="born" aria-label="Welcome">
    <div class="sky-wrap"><div class="b-clouds"></div><div class="b-sky"></div></div>
    <div class="b-ui"></div>
    <button type="button" class="b-go" aria-label="Go on"></button></section>`;
  root = app.querySelector(".born"); ui = root.querySelector(".b-ui"); go = root.querySelector(".b-go");
  go.addEventListener("click", (e) => { e.stopPropagation(); if (ready()) next(step + 1); });
  addEventListener("resize", placeGo);
  render();
  drawSky();
}

const ready = () => !!ui.querySelector("[data-ready]");
const pid = (n) => "w" + n.toLowerCase().replace(/[^a-z0-9]/g, "");
const isExample = () => STEPS[step].id === "example";

// The sky under the words. During the example it shows the example planets and stars; from then on, your own.
// Planets that moved slide over from where they were; a new one grows in, then its name fades in letter by letter.
function drawSky({ born = null, arriving = null, from = null } = {}) {
  const mine = !isExample();
  const pillars = mine ? picked.map((n, i) => ({ id: pid(n), name: n, tint: TINTS[i], focus: false })) : EX_PILLARS;
  const thoughts = mine ? (thought ? [thought] : []) : exampleStars();
  const where = layout(pillars), key = pillars.map((p) => p.id).join(), changed = key !== drawnPlanets;
  const sky = root.querySelector(".b-sky");
  sky.innerHTML = renderSky({ pillars, thoughts, arriving, from, labels: mine && store.get().test.labels !== false,
    runningId: mine ? tried : example.glow, gather: mine ? null : example.gather });
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
  placeGo();
}

function exampleStars() {
  const t0 = now();
  return EX_STARS.slice(0, example.stars).map(([kind, x, y], i) => ({ id: "exs" + i, text: "", kind, status: "active", count: 1, x, y, createdAt: t0 }));
}

// While picking, a tapped planet goes back to the words. While trying it out, it glows for a moment: practice only.
function tapPlanet(id) {
  const s = STEPS[step].id;
  if (s === "pick") {
    const p = picked.find((n) => pid(n) === id);
    picked = picked.filter((n) => n !== p);
    render(); drawSky();
  } else if (s === "try") {
    tried = id;
    render(); drawSky();
  }
}

// The tap target sits over the sun, wherever the sun lands on this screen.
function placeGo() {
  const p = skyPoint("sun");
  if (p && go) { go.style.left = `${p.x}px`; go.style.top = `${p.y}px`; root.style.setProperty("--sy", `${p.y}px`); }
  const low = skyPoint("below");
  if (low && root) root.style.setProperty("--below", `${low.y}px`);
}

const hint = (words = "Tap the light when you’re ready.") => `<p class="b-hint" data-ready>${words}</p>`;

function screen(id) {
  switch (id) {
    case "dark": return "";
    case "promise": return `<div class="b-say b-top b-mid"><h2>A calm place to notice what’s on your mind, and make time for what matters.</h2></div>
      <div class="b-say b-low">${hint()}</div>`;
    case "example": return `<div class="b-say b-top b-high b-lines"><p class="b-note">An example sky</p>
      ${LINES.map((l, i) => `<p class="b-line${i <= example.line ? " on" : ""}">${l}</p>`).join("")}</div>
      <div class="b-say b-low">${example.line >= LINES.length ? hint("Now yours. Tap the light.") : ""}</div>`;
    case "you": return `<div class="b-say b-under"><h2>This light is you.</h2><p>What matters to you will gather around it.</p></div>
      <div class="b-say b-low">${hint()}</div>`;
    case "pick": {
      const n = picked.length, left = SUGGESTED.filter((w) => !picked.includes(w));
      const sub = n === 0 ? "Pick three to five." : n < MIN_PILLARS ? `${MIN_PILLARS - n} more, at least.` : n < MAX_PILLARS ? "You can add more, or carry on." : "That’s five. The sky is full.";
      return `<div class="b-say b-top b-high"><h2>What do you want to look after?</h2><p>You’ll give time to these. Each becomes a planet.</p><p class="b-note">${sub}${n ? " Tap a planet to take it back." : ""}</p></div>
        <div class="b-say b-low b-below">
          ${n < MAX_PILLARS ? `<div class="b-words">${left.map((w) => `<button type="button" data-pick="${esc(w)}">${esc(w)}</button>`).join("")}</div>
          ${ownOpen ? `<form class="b-own" data-own><input id="b-own" maxlength="${MAX_NAME}" placeholder="Your own" autocomplete="off" aria-label="Your own"><button type="submit" class="b-quiet">Add</button></form>`
                    : `<button type="button" class="b-quiet" data-ownopen>Something else</button>`}` : ""}
          ${n >= MIN_PILLARS ? hint() : ""}
        </div>`;
    }
    case "try": return tried
      ? `<div class="b-say b-top"><h2>Like that.</h2><p>When you start something, tap its planet and it keeps time for you.</p></div>
        <div class="b-say b-low">${hint()}</div>`
      : `<div class="b-say b-top"><h2>Try it.</h2><p>Tap one you gave time to today.</p><p class="b-note">Just practice. Nothing is saved.</p></div>
        <div class="b-say b-low"><button type="button" class="b-quiet" data-skip>Nothing today</button></div>`;
    case "thought": {
      if (thought && !flying) {
        // A thought that sounds heavy gets no question about its kind: one calm line, and someone to talk to.
        if (thought.heavy) return `<div class="b-say b-top"><p class="b-quote">“${esc(thought.text)}”</p><h2>Thank you for writing that down.</h2>
          <p>If it feels heavy right now, someone’s there to talk to, any time.</p></div>
          <div class="b-say b-low"><button type="button" class="b-quiet" data-support>Talk to someone</button>${hint()}</div>`;
        return `<div class="b-say b-top"><p class="b-quote">“${esc(thought.text)}”</p><h2>That feels like ${A_KIND[thought.kind]}.</h2><p>Worries, wants and kind thoughts each have their own shape, so you can see your week at a glance.</p></div>
          <div class="b-say b-low"><div class="b-kinds" role="group" aria-label="What kind of thought">${["kind", "worry", "want"].map((k) =>
            `<button type="button" class="k-${k}" data-kind="${k}" aria-pressed="${thought.kind === k}">${star(k)}${KIND_LABEL[k]}</button>`).join("")}</div>
          <p class="b-note">Not right? Tap another.</p>${hint()}</div>`;
      }
      const k = draft.trim() ? guessKind(draft) : null;
      return `<form class="b-card" data-catch><label for="b-t">What’s on your mind right now?</label>
        <p class="b-why">Writing it down gives it somewhere to go, so your head doesn’t have to hold it.</p>
        <div class="b-row"><textarea id="b-t" rows="2" maxlength="120" placeholder="${esc(EXAMPLES[ex % EXAMPLES.length])}">${esc(draft)}</textarea>
        <button type="submit" class="b-send" aria-label="Add to the sky" ${draft.trim() ? "" : "disabled"}><i>${star("kind")}</i></button></div>
        <p class="b-guess">${k ? `${star(k)} ${KIND_LABEL[k]}` : ""}</p></form>
        <div class="b-say b-low"><button type="button" class="b-quiet" data-none>Nothing right now</button></div>`;
    }
    case "name": return `<div class="b-say b-top"><h2>What should your sky call you?</h2><p>Only this phone will know.</p>
      <input class="b-name" id="b-name" maxlength="24" autocomplete="given-name" placeholder="Tap to write your name" value="${esc(name)}" aria-label="Your name"></div>
      <div class="b-say b-low">${hint()}</div>`;
    case "day": return `<div class="b-say b-top"><h2>Once a week, ten quiet minutes to look back.</h2><p>Your stars gather by the sun, and you see what helped. Which day suits you?</p></div>
      <div class="b-say b-low"><div class="b-days" role="radiogroup" aria-label="Look back day">${DAYS.map(([d, l], i) =>
        `<button type="button" role="radio" aria-label="${d}" aria-checked="${i === day}" data-day="${i}">${l}</button>`).join("")}</div>
        <p class="b-note">${DAYS[day][0]}s. You can change it any time.</p>${hint()}</div>`;
    case "care": return `<div class="b-say b-top"><h2>One last thing.</h2><p>This isn’t therapy. If things ever feel heavy, someone’s there to talk to, any time. You’ll always find them in Record.</p></div>
      <div class="b-say b-low">${hint()}</div>`;
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
  go.classList.toggle("ready", ready());
  wire(s.id);
}

// Moving on: the words fade out, then the next ones fade in. Leaving the example, its sky fades away too,
// and your own (just the sun) fades in in its place.
function next(to) {
  if (to >= STEPS.length) return finish();
  if (to === step) return;
  const leavingExample = isExample();
  // The practice glow was only for trying it out.
  if (STEPS[step].id === "try") tried = null;
  timers.forEach(clearTimeout); timers = [];
  ui.classList.add("b-leaving");
  go.classList.remove("ready");
  if (leavingExample) root.classList.add("b-fadesky");
  clearTimeout(moving);
  moving = setTimeout(() => {
    step = to;
    ui.classList.remove("b-leaving");
    render();
    drawSky();
    if (leavingExample) requestAnimationFrame(() => root.classList.remove("b-fadesky"));
  }, still() ? 0 : leavingExample ? 1200 : 700);
}

// The example plays itself: stars appear one by one with the first line, a planet glows with the second,
// and the stars gather round the sun with the third. Then it waits for a tap on the light.
function playExample() {
  const q = still() ? 0 : 1;
  const plan = [[300, () => { example.line = 0; }]];
  EX_STARS.forEach((_, i) => plan.push([900 + i * 650, () => { example.stars = i + 1; return { arriving: "exs" + i }; }]));
  plan.push([5200, () => { example.line = 1; example.glow = "ex1"; }]);
  plan.push([9600, () => { example.line = 2; example.glow = null; example.gather = now(); }]);
  plan.push([13600, () => { example.line = 3; }]);
  for (const [ms, fn] of plan) timers.push(setTimeout(() => {
    const opts = fn() ?? {};
    const lines = ui.querySelectorAll(".b-line");
    lines.forEach((l, i) => l.classList.toggle("on", i <= example.line));
    if (example.line >= LINES.length && !ready()) {
      ui.querySelector(".b-low").innerHTML = hint("Now yours. Tap the light.");
      go.classList.add("ready");
    }
    drawSky(opts.arriving && !still() ? { arriving: opts.arriving, from: SUN_AT } : {});
  }, ms * q));
}
// Example stars rise out of the sun (its place in sky units).
const SUN_AT = { x: 150, y: 328 };

function wire(id) {
  if (id === "dark") timers.push(setTimeout(() => next(1), still() ? 300 : 1600));
  if (id === "example" && example.line < LINES.length) playExample();
  ui.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => add(b.dataset.pick)));
  ui.querySelector("[data-ownopen]")?.addEventListener("click", () => { ownOpen = true; render(); ui.querySelector("#b-own")?.focus(); });
  ui.querySelector("[data-own]")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = ui.querySelector("#b-own").value.trim().slice(0, MAX_NAME);
    if (!v || picked.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    ownOpen = false; add(v);
  });
  ui.querySelector("[data-skip]")?.addEventListener("click", () => next(step + 1));
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
      const heavy = heaviness(text);
      thought = { id: store.uid(), text, kind: guessKind(text), pillarId: null, status: "active", count: 1, seen: [now()], ...placeStar([]), createdAt: now(), helped: [], ...(heavy && { heavy }) };
      draft = ""; flying = true;
      ui.classList.add("b-leaving");
      drawSky({ arriving: still() ? null : thought.id, from: { x: p.x, y: p.y } });
      timers.push(setTimeout(() => { flying = false; ui.classList.remove("b-leaving"); shown = -1; render(); }, still() ? 0 : 2600));
    });
  }
  ui.querySelector("[data-none]")?.addEventListener("click", () => { thought = null; draft = ""; next(step + 1); });
  ui.querySelector("[data-support]")?.addEventListener("click", () => hooks.support?.());
  ui.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => { thought.kind = b.dataset.kind; render(); drawSky(); }));
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
    store.update((s) => {
      const old = new Map(s.pillars.map((p) => [p.name, p]));
      s.pillars = picked.map((n, i) => old.get(n) ?? { id: store.uid(), name: n, tint: TINTS[i], focus: false });
      if (thought) s.thoughts.push(thought);
      s.name = name.slice(0, 24); s.lookDay = day; s.setup = true; s.setupAt = now(); s.hints = {};
    });
  }, still() ? 0 : 700);
}
